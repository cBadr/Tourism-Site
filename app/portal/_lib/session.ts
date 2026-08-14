import "server-only";

import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { SubcontractorStatus } from "@/lib/subcontractor-types";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * بوابة بورتال المتعهدين — مصدر الحقيقة الوحيد لهوية المتعهد داخل `/portal`.
 *
 * القاعدة: المتعهد لا يرى شيئاً حتى يُحلّ صفه في `subcontractors` من جلسته
 * الحالية على الخادم (`profile_id = auth.uid()`)، وحالته `approved`. ما دون ذلك
 * شاشة انتظار أو إيقاف بلا قائمة تنقل — لا صفحة ولا إجراء.
 *
 * ملاحظتان معماريتان:
 * - النتيجة مُذاكَرة بـ `cache()` لكل طلب، فالغلاف والصفحة يتشاركان استعلاماً واحداً.
 * - الحماية الحقيقية في RLS (سياسات `current_subcontractor_id()`)؛ هذه البوابة
 *   طبقة تجربة استخدام فوقها، ولذلك تتحقق منها **كل** server action من جديد —
 *   الغلاف لا يحمي نقاط الإجراءات لأنها طلبات مستقلة عن شجرة التصيير.
 */

/** وجهة الدخول — صفحة الدخول نفسها تخدم كل الأدوار، والمتعهد يُوجَّه بعدها إلى `/portal` */
export const PORTAL_LOGIN_URL = "/admin/login?next=/portal";

export type PortalSocials = {
  facebook: string | null;
  instagram: string | null;
  website: string | null;
};

/** صف المتعهد كما يحتاجه البورتال — بلا الحقول الإدارية الخاصة (`notes` مثلاً) */
export type PortalSub = {
  id: string;
  companyName: string;
  contactName: string | null;
  phone: string;
  whatsapp: string | null;
  email: string | null;
  avatarUrl: string | null;
  socials: PortalSocials;
  status: SubcontractorStatus;
  createdAt: string | null;
};

/**
 * حالات البوابة:
 * - `env`: بيئة Supabase غير مضبوطة (تطوير محلي) — معاينة بلا تحرير.
 * - `anonymous`: لا جلسة — الغلاف يعيد التوجيه إلى الدخول.
 * - `schema`: جداول المرحلة ٥ غير منفَّذة بعد (هجرة 0010).
 * - `no-account`: جلسة صالحة بلا صف متعهد مرتبط بها.
 * - `pending` / `suspended` / `active`: حالة الصف نفسها.
 */
export type PortalGate =
  | { state: "env" }
  | { state: "anonymous" }
  | { state: "schema" }
  | { state: "no-account" }
  | { state: "pending"; sub: PortalSub }
  | { state: "suspended"; sub: PortalSub }
  | { state: "active"; sub: PortalSub };

export const hasSupabaseEnv = () =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

/**
 * أخطاء «الجدول/العمود/الدالة غير موجودة» — تعني أن هجرة المرحلة ٥ لم تُنفَّذ
 * (أو نُفِّذت جزئياً)، وهي حالة عرض لا حالة فشل: نعرض بطاقة تشرح الخطوة الناقصة
 * بدل شاشة خطأ.
 *
 * ⚠ **الجسم انتقل ولم يُنسخ** إلى `lib/supabase/schema-errors.ts` حين احتاجه سطحُ
 * حسابات العملاء (‏١٢ب): نسخةٌ ثانية كانت ستنحرف يوم يُضاف رمزٌ إلى إحداهما.
 * وإعادة التصدير هنا تُبقي اثني عشر موضع استيراد قائماً بلا تعديل سطر واحد.
 */
export { isSchemaMissing } from "@/lib/supabase/schema-errors";
import { isSchemaMissing } from "@/lib/supabase/schema-errors";

/** أعمدة المتعهد التي يقرأها البورتال — snake_case مطابق لعقد lib/subcontractor-types.ts */
const SUB_COLUMNS =
  "id, company_name, contact_name, phone, whatsapp, email, avatar_url, socials, status, created_at";

const asText = (v: unknown): string | null =>
  typeof v === "string" && v.trim() !== "" ? v.trim() : null;

function toStatus(value: unknown): SubcontractorStatus {
  return value === "approved" || value === "suspended" ? value : "pending";
}

function toSocials(value: unknown): PortalSocials {
  const raw = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  return {
    facebook: asText(raw.facebook),
    instagram: asText(raw.instagram),
    website: asText(raw.website),
  };
}

function toSub(row: Record<string, unknown>): PortalSub {
  return {
    id: String(row.id),
    companyName: asText(row.company_name) ?? "",
    contactName: asText(row.contact_name),
    phone: asText(row.phone) ?? "",
    whatsapp: asText(row.whatsapp),
    email: asText(row.email),
    avatarUrl: asText(row.avatar_url),
    socials: toSocials(row.socials),
    status: toStatus(row.status),
    createdAt: asText(row.created_at),
  };
}

/**
 * حلّ هوية المتعهد من الجلسة الحالية. لا تُعيد التوجيه بنفسها (تبقى دالة نقية
 * قابلة للمذاكرة) — الغلاف هو من يترجم `anonymous` إلى redirect.
 */
export const readPortalGate = cache(async (): Promise<PortalGate> => {
  const supabase = await createServerSupabase();
  if (!supabase) return { state: "env" };

  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user ?? null;
  if (!user) return { state: "anonymous" };

  const res = await supabase
    .from("subcontractors")
    .select(SUB_COLUMNS)
    .eq("profile_id", user.id)
    .limit(1);

  if (res.error) {
    // خطأ صلاحيات أو سياسة = لا حساب من منظور المستخدم؛ وخطأ مخطط = هجرة ناقصة
    return isSchemaMissing(res.error) ? { state: "schema" } : { state: "no-account" };
  }

  const row = (res.data?.[0] ?? null) as Record<string, unknown> | null;
  if (!row) return { state: "no-account" };

  const sub = toSub(row);
  if (sub.status === "suspended") return { state: "suspended", sub };
  if (sub.status !== "approved") return { state: "pending", sub };
  return { state: "active", sub };
});

/** رموز منع الوصول — تُترجَم إلى رسائل عربية في `COMMON_PORTAL_ERRORS` */
export type PortalDenial = "env" | "auth" | "schema" | "account";

export type PortalAccess =
  | { ok: true; supabase: SupabaseClient; sub: PortalSub }
  | { ok: false; code: PortalDenial };

/**
 * حارس الـ server actions: يُستدعى في **بداية كل إجراء** قبل أي كتابة.
 * صفحات البورتال محمية بالغلاف، أما الإجراءات فنقاط POST مستقلة يمكن استدعاؤها
 * مباشرة — فلا يُكتب شيء قبل التأكد من أن صاحب الجلسة متعهد معتمد.
 */
export async function portalAccess(): Promise<PortalAccess> {
  const gate = await readPortalGate();
  if (gate.state === "env") return { ok: false, code: "env" };
  if (gate.state === "anonymous") return { ok: false, code: "auth" };
  if (gate.state === "schema") return { ok: false, code: "schema" };
  if (gate.state !== "active") return { ok: false, code: "account" };

  const supabase = await createServerSupabase();
  if (!supabase) return { ok: false, code: "env" };
  return { ok: true, supabase, sub: gate.sub };
}
