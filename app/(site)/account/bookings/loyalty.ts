import "server-only";

import { cache } from "react";

import type { MyLoyaltyView } from "@/lib/loyalty-types";
import { isSchemaMissing } from "@/lib/supabase/schema-errors";
import { accountAccess } from "../_lib/session";

/**
 * قراءة رصيد الولاء لصاحب الجلسة — نظير `./data.ts` بنيةً وحراسةً.
 *
 * ── 🔒 عميلٌ مربوط بجلسة العميل، لا مفتاح الخدمة ──────────────────────────
 *
 * `my_loyalty()` تشتقّ الهوية من `auth.uid()` داخلها كما `my_bookings()` — وهو
 * ما يجعل الفخّ المكتوب في `./data.ts` قائماً هنا حرفاً بحرف: مفتاح الخدمة يعمل
 * **بلا** `auth.uid()`، فالنداء به يُرجع رصيداً فارغاً **بلا خطأ واحد** — أي
 * «رصيدك صفر» بينما هو عطلٌ صامت. فالعميل يأتي من `accountAccess()` وحدها،
 * وهي البوابة نفسها التي يقرؤها الغلاف وقائمةُ الحجوزات.
 *
 * ── ولا حساب جنيهٍ واحد هنا ───────────────────────────────────────────────
 *
 * `worth` تصل **محسوبةً من القاعدة** ولا تُضرب في `currencyPerPoint` هنا
 * (‏**D-05**، ونصّ العقد الأم على الحقل نفسه: «تُحسب في القاعدة ولا تُضرب في
 * الواجهة»). ولذلك لا يعرف هذا الملف قيمة النقطة أصلاً — فلا يوجد فيه مكانٌ
 * ينحرف عن القاعدة.
 *
 * ── والمحرّك **غير مطبَّق بعد** ────────────────────────────────────────────
 *
 * قِيست القاعدة الحيّة: لا جدول ولاءٍ ولا دالة. فحالة `schema` هنا ليست حالةً
 * نظرية بل **هي الحالة الجارية اليوم**، والشاشة تعاملها بالصمت لا بالاعتذار
 * (انظر `_components/loyalty-balance.tsx`). وهو ما يجعل هذا الملف صالحاً للدمج
 * قبل هجرة المحرّك بلا أن يَعِد بشيء.
 */

/**
 * حالات الرصيد — ثلاثٌ منها **تُعرض بالصمت**، وواحدة تُعرض.
 *
 * والفصل هنا أدقّ من نظيره في القائمة: الرصيد سطحٌ **ثانوي** على شاشةٍ وظيفتها
 * الحجوزات. فبطاقةُ عطلٍ للرصيد بجوار قائمةٍ تعمل تُقلق بلا فائدة، ولا تعطي
 * العميل خطوة تالية. (القاعدة ١٥: «لا نعرف» و«صفر» شيئان — والصمت هو الترجمة
 * الصادقة لـ«لا نعرف» على سطحٍ ثانوي.)
 */
export type MyLoyaltyState =
  | { state: "env" }
  | { state: "anonymous" }
  | { state: "schema" }
  | { state: "failed" }
  | { state: "ready"; view: MyLoyaltyView };

const asNumber = (value: unknown): number => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const asText = (value: unknown): string | null =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : null;

/**
 * صفُّ القاعدة ← `MyLoyaltyView`.
 *
 * 🔒 **وترجمةُ `proven_phones` هي بيت القصيد في هذا الملف كله.** العقد يقول إن
 * `null` تعني «لا رصيد مُثبَت بعد» وتُعرض **بدعوةٍ للربط**، وإن صفرَ النقاط مع
 * إثباتٍ قائم يعني «رصيدك صفر» ويُعرض كما هو (‏§٣). فكلُّ ما دون هاتفٍ مُثبَت
 * واحد — `null` من القاعدة أو صفرٌ أو قيمةٌ مشوَّهة — يصير `null` هنا، لأن
 * الثلاثة تعني الشيء ذاته: **لم يُثبِت العميل ملكية رقمٍ بعد**. وخلطُ ذلك
 * بصفر النقاط يُعرض على صاحب عشرين رحلة أن رصيده صفر وهو لم يربط شيئاً — وهو
 * أسوأ ما يمكن أن تقوله هذه الشاشة.
 */
function toView(raw: unknown): MyLoyaltyView | null {
  if (typeof raw !== "object" || raw === null) return null;
  const row = raw as Record<string, unknown>;

  const proven = asNumber(row.proven_phones);

  return {
    points: asNumber(row.points),
    worth: asNumber(row.worth),
    currency: asText(row.currency) ?? "EGP",
    provenPhones: proven >= 1 ? Math.round(proven) : null,
  };
}

/**
 * رصيد صاحب الجلسة — مُذاكَر لكل طلب، كالقائمة تماماً، فلا نداءان في تصييرة.
 */
export const loadMyLoyalty = cache(async (): Promise<MyLoyaltyState> => {
  const access = await accountAccess();
  if (!access.ok) {
    return access.code === "auth" ? { state: "anonymous" } : { state: access.code };
  }

  const { data, error } = await access.supabase.rpc("my_loyalty");

  if (error) {
    if (isSchemaMissing(error)) return { state: "schema" };
    // `42501` صلاحية مسحوبة، و`PGRST301` توكن منتهٍ — كلاهما «لا جلسة» عند العميل
    if (error.code === "42501" || error.code === "PGRST301") return { state: "anonymous" };
    return { state: "failed" };
  }

  // دالةٌ تُرجع جدولاً ⇒ مصفوفة؛ وصفرُ صفوف **ليس رصيداً صفراً** بل شكلاً لم
  // نتوقعه — فيُعامَل عطلاً صامتاً لا يُعرض، لا يُخترع له صفر.
  const row = Array.isArray(data) ? data[0] : data;
  const view = toView(row);
  if (!view) return { state: "failed" };

  return { state: "ready", view };
});
