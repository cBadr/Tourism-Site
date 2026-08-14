import "server-only";

import { cache } from "react";

import type { MyBookingRow } from "@/lib/customer-types";
import { isSchemaMissing } from "@/lib/supabase/schema-errors";
import { accountAccess } from "../_lib/session";

/**
 * قراءة «حجوزاتي» — المصدر الوحيد لقائمة العميل في هذا المسار.
 *
 * ── 🔒 عميلٌ مربوط بجلسة العميل، لا مفتاح الخدمة ──────────────────────────
 *
 * `my_bookings()` تشتقّ الهوية من `auth.uid()` داخلها (قُرئت حيّة من
 * `pg_get_functiondef` — D-58، وشرطها الصريح `where (select auth.uid()) is not
 * null and cb.profile_id = (select auth.uid())`). ومفتاح الخدمة يعمل **بلا**
 * `auth.uid()` ⇒ **صفر صفوف بلا خطأ واحد**: شاشةٌ فارغة تُقرأ «لا حجوزات لهذا
 * العميل» بينما هي عطلٌ صامت. فالعميل يأتي من `readAccountGate` وحدها.
 *
 * ── ولا بوابةَ جلسةٍ ثانية هنا ────────────────────────────────────────────
 *
 * هذا الملف **لا يقرأ `auth.getUser()` بنفسه**: البوابة `app/account/_lib/session.ts`
 * تفعل ذلك مرة، مُذاكَرةً لكل طلب، ويقرؤها الغلافُ وهذه الدالة معاً. وبوابتان
 * تعنيان تعريفين لـ«بلا جلسة» ينحرفان — وهو ما تمنعه القاعدة ١٢ (فوِّض ولا
 * تستنسخ)، والسبب نفسه الذي جعل `isSchemaMissing` وحدةً مشتركة.
 *
 * ولا استعلام واحد على `bookings` في هذا الملف ولا في غيره من ملفات المسار:
 * القاعدة الحاكمة في `lib/customer-types.ts` §١ — لا سياسة `SELECT` جديدة على
 * `bookings` أبداً، والعميل يقرأ الإسقاط الآمن من الدالة وحدها. وما ليس في نوع
 * إرجاعها لا يصل هذه الطبقة كي تُخطئ في حجبه.
 */

/**
 * حالات الشاشة — كلٌّ منها له بطاقةٌ تقول للعميل ماذا يفعل الآن، لا رسالة عطل.
 *
 * والفصل بين `anonymous` و«ready بقائمة فارغة» هو بيت القصيد: الأولى «سجّل
 * دخولك»، والثانية «حسابك سليم ولا حجز فيه بعد — أضِف واحداً». (القاعدة ١٥:
 * «لا نعرف» و«صفر» و«لا ينطبق» ثلاثة أشياء، وخلطُها أكثر ما تمسكه المراجعة.)
 */
export type MyBookingsState =
  | { state: "env" }
  | { state: "anonymous" }
  | { state: "schema" }
  | { state: "failed" }
  | { state: "ready"; rows: MyBookingRow[] };

const asText = (value: unknown): string | null =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : null;

const asNumber = (value: unknown): number => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * صفٌّ من القاعدة ← `MyBookingRow` من العقد.
 *
 * القراءة دفاعية بنفس أسلوب `app/booking/[token]/page.tsx`: الدالة تُرجع
 * snake_case والعقد camelCase، وما لا يصل يبقى `null` لا يُملأ بصفر — فالشاشة
 * تفرّق بين «لا قيمة» و«صفر» بلا حيلة.
 */
function toRow(raw: unknown): MyBookingRow | null {
  if (typeof raw !== "object" || raw === null) return null;
  const row = raw as Record<string, unknown>;

  const reference = asText(row.reference);
  if (!reference) return null;

  /**
   * ⚠ `class_title` عمودٌ `NOT NULL` والقيد مُنفَّذ فعلاً في القاعدة، فغيابه هنا
   * لا يعني «حجزاً بلا فئة» بل **أن شكل الحمولة تغيّر** — إعادة تسمية عمود في
   * `my_bookings()` مثلاً. ولذلك يُرفض الصف كما يُرفض الصف بلا `reference`،
   * ولا تُخترع له تسمية: صفٌّ يُعرض بخانة فارغة يمرّ على العين، بينما اختفاء
   * القائمة كلها يُرى في أول فتحة للشاشة.
   *
   * والحقول الثلاثة أدناه (`origin_label`/`dest_label`/`pickup_at`) عكسه تماماً:
   * مشتقّةٌ من `trip` وهو `jsonb`، فغيابها احتمالٌ مشروع لا خللَ شكل — قِيس
   * بحذف مفاتيحها داخل معاملة تُلغى.
   */
  const classTitle = asText(row.class_title);
  if (!classTitle) return null;

  return {
    reference,
    status: asText(row.status) ?? "pending_payment",
    classTitle,
    total: asNumber(row.total),
    currency: asText(row.currency) ?? "EGP",
    amountDue: asNumber(row.amount_due),
    amountRemaining: asNumber(row.amount_remaining),
    originLabel: asText(row.origin_label),
    destLabel: asText(row.dest_label),
    pickupAt: asText(row.pickup_at),
    passengers: Math.max(1, Math.round(asNumber(row.passengers) || 1)),
    createdAt: asText(row.created_at) ?? "",
  };
}

/**
 * حجوزات صاحب الجلسة — مُذاكَرة لكل طلب، فالصفحة وإجراء الفتح يقرآن نداءً واحداً.
 * والترتيب يبقى كما جاء من القاعدة (`order by b.created_at desc`) فلا يوجد
 * للقائمة مصدرا ترتيب ينحرفان.
 */
export const loadMyBookings = cache(async (): Promise<MyBookingsState> => {
  const access = await accountAccess();
  if (!access.ok) {
    return access.code === "auth" ? { state: "anonymous" } : { state: access.code };
  }

  const { data, error } = await access.supabase.rpc("my_bookings");

  if (error) {
    if (isSchemaMissing(error)) return { state: "schema" };
    // `42501` صلاحية مسحوبة، و`PGRST301` توكن منتهٍ — كلاهما «لا جلسة» عند العميل
    if (error.code === "42501" || error.code === "PGRST301") return { state: "anonymous" };
    return { state: "failed" };
  }

  const list = Array.isArray(data) ? data : [];
  const rows: MyBookingRow[] = [];
  for (const item of list) {
    const row = toRow(item);
    if (row) rows.push(row);
  }

  return { state: "ready", rows };
});
