"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isMissingTable } from "@/lib/dispatch/settings";
import { createServerSupabase } from "@/lib/supabase/server";
import {
  MAX_UNPAID_TIMEOUT_MINUTES,
  MIN_UNPAID_TIMEOUT_MINUTES,
  runStaleSweep,
  TRIP_SETTINGS_COLUMNS,
  TRIP_SETTINGS_TABLE,
} from "@/lib/trip-settings";

/**
 * حفظ إعدادات الموقع — يكتب مفاتيح النموذج الستة في `site_settings` دفعة واحدة.
 * (المفتاح السادس `notifications` أُضيف في المرحلة ٤؛ مفتاح `payment` تُحرّره
 *  شاشة «حسابات الدفع» `/admin/payment-accounts` ولا يمسّه هذا النموذج.)
 * اتفاقية «إعادة التوجيه بعد العملية» (اعتبار ٨): النجاح والفشل كلاهما redirect
 * برسالة في الـ query string تعرضها الصفحة كتنبيه.
 * فخ RLS المعروف: upsert ينجح بصفر صفوف عند رفض السياسة — لذلك نفحص `.select()`.
 */
export async function saveSettings(formData: FormData) {
  const supabase = await createServerSupabase();
  if (!supabase) redirect("/admin/settings?error=env");

  const s = (name: string): string | null => {
    const v = formData.get(name);
    return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
  };

  const brandName = s("brand.name");
  if (!brandName) redirect("/admin/settings?error=name");

  const rows = [
    {
      key: "brand",
      value: {
        name: brandName,
        tagline: s("brand.tagline") ?? "",
        logoUrl: s("brand.logoUrl"),
        colors: {
          primary: s("brand.colors.primary") ?? "oklch(0.45 0.15 250)",
          primaryForeground: s("brand.colors.primaryForeground") ?? "oklch(0.985 0 0)",
          accent: s("brand.colors.accent") ?? "oklch(0.75 0.15 85)",
        },
      },
    },
    {
      key: "contact",
      value: {
        phone: s("contact.phone"),
        whatsapp: s("contact.whatsapp"),
        telegram: s("contact.telegram"),
        email: s("contact.email"),
      },
    },
    {
      key: "socials",
      value: {
        facebook: s("socials.facebook"),
        x: s("socials.x"),
        linkedin: s("socials.linkedin"),
        github: s("socials.github"),
        instagram: s("socials.instagram"),
      },
    },
    {
      key: "company",
      value: {
        legalName: s("company.legalName"),
        activity: s("company.activity") ?? "",
      },
    },
    {
      key: "seo",
      value: {
        titleTemplate: s("seo.titleTemplate") ?? `%s | ${brandName}`,
        defaultDescription: s("seo.defaultDescription") ?? "",
      },
    },
    {
      // وجهات الإشعارات فقط — لا مفاتيح سرّية هنا إطلاقاً: توكن بوت تليجرام
      // ومفتاح مزوّد البريد يبقيان في متغيرات البيئة (راجع docs/NOTIFICATIONS.md)
      key: "notifications",
      value: {
        telegramChatId: s("notifications.telegramChatId"),
        // مربع اختيار غير مؤشَّر لا يُرسل أصلاً — الغياب يعني «مطفأ»
        telegramEnabled: formData.get("notifications.telegramEnabled") != null,
        emailTo: s("notifications.emailTo"),
        emailEnabled: formData.get("notifications.emailEnabled") != null,
      },
    },
  ];

  const { data, error } = await supabase
    .from("site_settings")
    .upsert(rows, { onConflict: "key" })
    .select("key");

  // صفر صفوف مع نجاح ظاهري = RLS رفضت الكتابة (المستخدم ليس admin)
  if (error || !data || data.length === 0) redirect("/admin/settings?error=save");

  revalidatePath("/", "layout");
  redirect("/admin/settings?saved=1");
}

/* ══════════════════════════════════════════════════════════════════════════
 * قسم إعدادات الرحلات (الملاحظة ٣ — هجرة 0027)
 *
 * **لماذا إجراء مستقل عن `saveSettings` أعلاه؟** ذاك يبني مصفوفة صفوف بمفاتيح
 * ثابتة ويرفعها `upsert` واحداً إلى `site_settings`. حقلٌ يغيب عن تلك المصفوفة
 * **يُحفظ بنجاح ولا يغيّر شيئاً** — أخطر شكل للفشل. ومفتاحا الرحلات ليسا في
 * `site_settings` أصلاً: ذاك الجدول مقروء علناً (`site_settings_select_public`
 * تعطي anon ‏`using (true)`)، وسياسة «متى نلغي الطلب غير المدفوع» لا تُعرض على
 * الزائر — فلها جدولها المحروس `trip_settings` وإجراؤها المستقل.
 * ══════════════════════════════════════════════════════════════════════════ */

/** الحالة تسافر في الرابط، والمرساة تُعيد المستخدم إلى القسم لا إلى أعلى الصفحة */
const tripUrl = (qs: string) => `/admin/settings?${qs}#trips`;

/** الأرقام العربية الهندية مقبولة في الحقول الرقمية وتُحوَّل قبل التحقق */
const toLatinDigits = (s: string) =>
  s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));

function num(formData: FormData, name: string): number | null {
  const v = formData.get(name);
  if (typeof v !== "string" || v.trim() === "") return null;
  const n = Number(toLatinDigits(v.trim()));
  return Number.isFinite(n) ? n : null;
}

/**
 * حفظ مفتاحَي الكنس التلقائي.
 *
 * التحقق شكلي بحت (عدد صحيح داخل مدى قيد `check` في 0027)؛ وكل أثر الإعداد
 * داخل `cancel_stale_bookings` نفسها — لا حساب مهلة ولا مقارنة تواريخ هنا.
 *
 * ملاحظة على `upsert`: الجدول صف واحد بمفتاح `id boolean default true`، فالكتابة
 * الواحدة تغطي «الصف موجود» و«الصف غائب» معاً. وقبلها استطلاع قراءة يفصل
 * «الهجرة لم تُنفَّذ» عن «RLS رفضت» — رسالتان مختلفتان تماماً للمالك.
 */
export async function saveTripSettings(formData: FormData) {
  // (١) فحص البيئة أولاً
  const supabase = await createServerSupabase();
  if (!supabase) redirect(tripUrl("error=env"));

  // (٢) التحقق من المدخلات ← خروج فوري برمز واضح
  // مربع اختيار غير مؤشَّر لا يُرسل أصلاً — الغياب يعني «مطفأ»
  const enabled = formData.get(TRIP_SETTINGS_COLUMNS.unpaidCancelEnabled) != null;

  const minutes = num(formData, TRIP_SETTINGS_COLUMNS.unpaidTimeoutMinutes);
  if (
    minutes === null ||
    !Number.isInteger(minutes) ||
    minutes < MIN_UNPAID_TIMEOUT_MINUTES ||
    minutes > MAX_UNPAID_TIMEOUT_MINUTES
  ) {
    redirect(tripUrl("error=timeout"));
  }

  // جدول غائب = هجرة 0027 لم تُنفَّذ؛ وأي فشل آخر رفضُ قراءةٍ من RLS
  const existing = await supabase.from(TRIP_SETTINGS_TABLE).select("id").limit(1);
  if (existing.error) {
    redirect(tripUrl(isMissingTable(existing.error.code) ? "error=tripnotready" : "error=tripsave"));
  }

  // (٣) الكتابة مع .select() وفحص صفر صفوف
  const res = await supabase
    .from(TRIP_SETTINGS_TABLE)
    .upsert(
      {
        id: true,
        [TRIP_SETTINGS_COLUMNS.unpaidCancelEnabled]: enabled,
        [TRIP_SETTINGS_COLUMNS.unpaidTimeoutMinutes]: minutes,
      },
      { onConflict: "id" }
    )
    .select();

  // صفر صفوف مع نجاح ظاهري = RLS رفضت الكتابة (المستخدم ليس admin)
  if (res.error || !res.data || res.data.length === 0) redirect(tripUrl("error=tripsave"));

  // (٤) إبطال الكاش ثم إعادة توجيه بنجاح
  revalidatePath("/", "layout");
  redirect(tripUrl("saved=trip"));
}

/** سبب الفشل من العامل ← رمز الخطأ في الرابط (لكل سبب رسالته في الصفحة) */
const SWEEP_ERRORS: Record<string, string> = {
  "no-client": "env",
  "no-function": "tripnotready",
  "no-table": "tripnotready",
  forbidden: "forbidden",
  "rpc-failed": "sweep",
  "worker-error": "sweep",
};

/**
 * تشغيل الكنس فوراً — نفس الدالة التي تستدعيها الدورة المجدولة على
 * `/api/dispatch/tick`، لا نسخة ثانية منها.
 *
 * الحراسة: «وجود جلسة» لا يكفي لعملية تُلغي حجوزات حقيقية وتُطلق إشعارات —
 * فحارس المسارات يتأكد من *وجود* الجلسة لا من *دورها*. لذلك تحقق صريح من
 * `is_admin()` أولاً (نفس نمط «تشغيل دورة الإسناد الآن»).
 *
 * والتنفيذ **بجلسة المشرف** لا بمفتاح الخدمة: حارس الدالة `dispatch_ops_allowed()`
 * يقبل المشرف صراحةً، والدالة ممنوحة لـ `authenticated` لهذا الزر بالذات — فلا
 * يتوقف زرٌّ إداري على وجود `SUPABASE_SERVICE_ROLE_KEY` في البيئة.
 */
export async function runStaleBookingsSweep() {
  const session = await createServerSupabase();
  if (!session) redirect(tripUrl("error=env"));

  const { data: isAdmin, error: roleError } = await session.rpc("is_admin");
  if (roleError || isAdmin !== true) redirect(tripUrl("error=forbidden"));

  // العامل لا يرمي استثناءً أبداً — يرجع ملخّصاً حتى حين لم يُنفَّذ الكنس أصلاً
  const result = await runStaleSweep(session);
  if (!result.ok) redirect(tripUrl(`error=${SWEEP_ERRORS[result.reason ?? ""] ?? "sweep"}`));

  const params = new URLSearchParams({
    swept: "1",
    scanned: String(result.scanned),
    cancelled: String(result.cancelled),
    failed: String(result.failed),
  });

  revalidatePath("/", "layout");
  redirect(tripUrl(params.toString()));
}
