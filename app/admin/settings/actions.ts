"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isMissingTable } from "@/lib/dispatch/settings";
import {
  DESIGN_PALETTE,
  PALETTE_CSS_VARS,
  safeColorValue,
  type BrandPalette,
} from "@/lib/site-config";
import { createServerSupabase } from "@/lib/supabase/server";
import { isSupportedTimeZone } from "@/lib/site-timezone";
import {
  MAX_LEAD_MINUTES,
  MAX_UNPAID_TIMEOUT_MINUTES,
  MIN_LEAD_MINUTES_FLOOR,
  MIN_UNPAID_TIMEOUT_MINUTES,
  runStaleSweep,
  TRIP_SETTINGS_COLUMNS,
  TRIP_SETTINGS_TABLE,
} from "@/lib/trip-settings";

/**
 * حفظ إعدادات الموقع — يكتب مفاتيح النموذج الخمسة في `site_settings` دفعة واحدة:
 * `brand` و`contact` و`socials` و`company` و`notifications`.
 *
 * وثلاثة مفاتيح في الجدول **لا يمسّها هذا النموذج**، ولكلٍّ شاشته المالكة:
 * `payment` في `/admin/payment-accounts`، و`integrations` في `/admin/integrations`،
 * و`seo` و`business` في مركز السيو (انظر التعليق داخل مصفوفة الصفوف أدناه).
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

  /*
   * ⚠ **لوحة الألوان تُبنى بالتكرار على `PALETTE_CSS_VARS`، ولا تُكتب مفاتيحها هنا.**
   *
   * كان هذا الموضع يكتب ثلاثة مفاتيح بأسمائها ويُسقط ما عداها. وما دامت اللوحة
   * ثلاثةً فذلك سليم؛ لكنها صارت سبعة عشر — و`site_settings.value` عمود `jsonb`
   * **يُستبدل كاملاً لا يُدمج**. أي أن أول ضغطة على «حفظ الإعدادات» كانت ستمحو
   * أربعة عشر مفتاحاً من صفّ العلامة: تعود الأرضيات والنصوص والحدود إلى قيم
   * `:root` بنجاحٍ ظاهر وبلا رسالة، لمجرد أن المالك عدّل شعاره النصي. وهو نفس
   * الفخّ الذي أطاح بمفتاح `seo` مرة (انظر التعليق داخل مصفوفة الصفوف أدناه)،
   * فيُعالَج بنفس المعيار: **ما يُحقن هو ما يُحرَّر هو ما يُحفظ**، من قائمةٍ واحدة.
   *
   * والانطلاق من نسخة `DESIGN_PALETTE` لا من كائن فارغ مقصود: مفتاحٌ يُضاف إلى
   * العقد ولمّا يُضَف له حقلٌ في الشاشة يُحفظ بقيمة التصميم، لا يغيب عن الصفّ.
   *
   * وقيمةٌ يرفضها `safeColorValue` **لا تصل القاعدة أصلاً** — تسقط إلى قيمة
   * التصميم كأنها لم تُرسل. فالحارس في `paletteVars` يحمي الحقن وحده، وهذا الصفّ
   * مقروء علناً وتقرؤه أدوات أخرى، فلا يُخزَّن فيه ما لا يصلح لوناً.
   */
  const brandColors: BrandPalette = { ...DESIGN_PALETTE };
  for (const [key] of PALETTE_CSS_VARS) {
    const submitted = safeColorValue(formData.get(`brand.colors.${key}`));
    if (submitted !== null) brandColors[key] = submitted;
  }

  const rows = [
    {
      key: "brand",
      value: {
        name: brandName,
        tagline: s("brand.tagline") ?? "",
        logoUrl: s("brand.logoUrl"),
        colors: brandColors,
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
    /*
     * ⚠ **مفتاح `seo` ليس هنا بقرار، ولا يُعاد.**
     *
     * كان هذا الصف يكتب حقلين اثنين (`titleTemplate` و`defaultDescription`) فوق
     * مفتاح `seo` كله. وما دام المفتاح حقلين فذلك سليم؛ لكنه صار ستة — صورة
     * المشاركة الافتراضية وحساب إكس ونوع بطاقتها وكتلة `robots` — و`value` عمود
     * `jsonb` **يُستبدل كاملاً لا يُدمج**. أي أن أول ضغطة على «حفظ الإعدادات»
     * كانت ستُطفئ حجب زواحف الذكاء الاصطناعي وتمحو قائمة المنع وتعيد نوع البطاقة
     * إلى الافتراضي، بنجاحٍ ظاهر وبلا رسالة، لمجرد أن المالك عدّل رقم هاتفه.
     *
     * ومالكه الآن `app/admin/seo/settings/actions.ts` وحده — ويكتبه بنوع
     * `SeoSettings` صريح كي يصير أي حقل مضاف لا يُقرأ **خطأ بناء** لا محواً صامتاً.
     */
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

  // أدنى مهلة قبل الانطلاق (0067) — مدىً مرآةٌ لقيد `check` في القاعدة، ورمز
  // خطأ **مستقل** عن مهلة الإلغاء: رسالةٌ واحدة لحقلين تُخفي أيهما أخطأ.
  const lead = num(formData, TRIP_SETTINGS_COLUMNS.minLeadMinutes);
  if (
    lead === null ||
    !Number.isInteger(lead) ||
    lead < MIN_LEAD_MINUTES_FLOOR ||
    lead > MAX_LEAD_MINUTES
  ) {
    redirect(tripUrl("error=lead"));
  }

  /**
   * المنطقة الزمنية (0075) — **تحقّقٌ مزدوج بقاعدتَي مناطق مختلفتين**:
   * هنا بقائمة زمن تشغيل JS (‏`Intl.supportedValuesOf`)، وفي القاعدة بمُشغّلٍ
   * يسأل `pg_timezone_names`. ولا واحدة منهما مصفوفةٌ مكتوبة بيد. والقيمة لا
   * تمرّ إلا إن عرفها **الاثنان** — فما يُحفَظ منطقةٌ يستطيع Postgres أن يجمّع
   * بها ويستطيع المتصفح أن يُنسّق بها معاً.
   *
   * ورمز خطأ مستقل: «فشل الحفظ» لاسم منطقةٍ خاطئ يتّهم الصلاحيات بلا سبب.
   */
  const zone = formData.get(TRIP_SETTINGS_COLUMNS.timeZone);
  if (typeof zone !== "string" || !isSupportedTimeZone(zone.trim())) {
    redirect(tripUrl("error=timezone"));
  }
  const timeZone = zone.trim();

  // خريطة المسار (0078) — مفتاح إطفاء كلفة، لا خيار مظهر. ومربعٌ غير مؤشَّر لا
  // يُرسل أصلاً، فالغياب «مطفأ» كنظيره أعلاه. ولا تحقّق مدى: منطقيٌّ بقيمتين.
  const routeMap = formData.get(TRIP_SETTINGS_COLUMNS.routeMapEnabled) != null;

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
        [TRIP_SETTINGS_COLUMNS.minLeadMinutes]: lead,
        [TRIP_SETTINGS_COLUMNS.timeZone]: timeZone,
        [TRIP_SETTINGS_COLUMNS.routeMapEnabled]: routeMap,
      },
      { onConflict: "id" }
    )
    .select();

  /**
   * صفر صفوف مع نجاح ظاهري = RLS رفضت الكتابة (المستخدم ليس admin).
   *
   * و`invalid-timezone` رمزٌ يرفعه مُشغّل 0075 حين يعرف ICU المنطقةَ ولا
   * يعرفها Postgres — تُقال بالاسم بدل أن تُتَّهم الصلاحيات بخطأ إدخال.
   */
  if (res.error?.hint === "invalid-timezone") redirect(tripUrl("error=timezonedb"));
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
