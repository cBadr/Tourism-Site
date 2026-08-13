import "server-only";

import { cache } from "react";

import { isSchemaMissing, portalAccess } from "./session";

/**
 * رصيد المتعهد كما يراه في بورتاله — قراءة واحدة من `portal_balance()` (هجرة 0029).
 *
 * ── لماذا الدالة وحدها ولا استعلام للعرض ────────────────────────────────────
 * `v_partner_settlements` عرض `security_invoker` فوق `ledger_entries` المحروس
 * بـ `is_admin()`. قراءته بهوية المتعهد **لا تفشل**: تعود بصفر صفوف، فتُقرأ
 * أصفاراً وتُعرض له على أنها حسابه. هذا هو فخ الصفوف الصفرية بعينه — رصيدٌ كاذب
 * بلا رسالة خطأ واحدة. لذلك القراءة من `portal_balance()` وحدها، وهي
 * `security definer` تقرأ العرض بصلاحيات المالك ثم تقصّ النتيجة على صاحب الجلسة.
 *
 * ── ولا وسيط لها إطلاقاً 🔒 ─────────────────────────────────────────────────
 * نطاق الدالة مثبَّت **داخلها** عبر `current_subcontractor_id()`. لا يُمرَّر
 * معرّف متعهد من هنا ولا يُضاف لاحقاً ولو للتجربة: أول وسيط يحوّلها من دالة
 * مقصورة على صاحبها إلى تسريب لكل متعهد عن كل متعهد (سابقة D-20). المناداة
 * تبقى `rpc("portal_balance")` بلا حمولة.
 *
 * ── ولا رقم يُحسب هنا ───────────────────────────────────────────────────────
 * الأرقام تصل جاهزة: الصافي وإشارته، وما على المتعهد لنا، والمبلغ الذي يرفع
 * الحجب. TypeScript يقرأ ويعرض — لا جمع ولا طرح ولا قيمة مطلقة.
 */

/**
 * صف الرصيد كما يحتاجه البورتال.
 *
 * ⚠ **لا `debt_limit` هنا لأن الدالة لم تعد تُرجعه** (هجرة 0030).
 *
 * كانت 0029 تُدرجه في نوع الإرجاع «كي تصير رسالة الحجب قابلة للتنفيذ»، وكان هذا
 * الملف يمتنع عن قراءته انضباطاً. والامتناع لا يُغني: الرقم كان يصل إلى كل متعهد
 * — لا المحجوب وحده — في حمولة `rpc` يقرؤها من يفتح أدوات المتصفح، وهو **إعداد
 * عالمي** فمتعهدٌ واحد فضولي يخبر الباقين. ومن يعرف السقف يعرف كم يجوز له أن
 * يحتجز من مالنا إلى الأبد بلا أن يُحجب — فتنقلب سياسة الائتمان إلى عتبة منشورة
 * يجلس تحتها.
 *
 * فأسقطته 0030 من الدالة نفسها. والعزل الآن **بنيوي لا انضباطي** (اتفاقيات §٧):
 * ما لا يوجد في نوع الإرجاع لا يُسرَّب بخطأ في الواجهة. والذي يحتاجه المتعهد
 * للتصرف باقٍ: `amount_to_clear` — كم يسدّد ليعود إليه العمل، وهو شأنه لا شأننا.
 *
 * `null` في أي رقم = «لم يصل» لا «صفر»: صفرٌ مخترَع في شاشة مال كذبة صغيرة
 * تتحول إلى نزاع.
 */
export type PortalBalance = {
  /** مستحقه عن الرحلات المنفَّذة */
  earned: number | null;
  /** ما قبضه نقداً من عملائنا — مالنا في يده */
  collected: number | null;
  /** ما دفعناه له */
  paid: number | null;
  /** ما سدّده لنا نقداً أو تحويلاً (الدور الرابع، هجرة 0029) */
  received: number | null;
  /** `earned − collected − paid + received`: موجب = له علينا، سالب = عليه لنا */
  netDue: number;
  /** `greatest(-net_due, 0)` — ما عليه لنا، وهو حجم الدين بلا إشارة */
  owedToUs: number | null;
  /** بلغ سقف الدين ومفتاح الحجب مفعّل ⇒ لا رحلات جديدة */
  blocked: boolean;
  /** ما يكفي سداده لرفع الحجب — أقل من كامل الدين عادةً */
  amountToClear: number | null;
};

/**
 * ثلاث حالات لا اثنتان:
 * - `hidden`: لا دالة (قاعدة قبل 0029) أو لا صف للمتعهد ⇒ **لا بطاقة إطلاقاً**،
 *   وبقية البورتال كما هي. التدهور الرشيق هنا صمتٌ لا رسالة.
 * - `failed`: الدالة موجودة والنداء فشل (صلاحية · عطل · صف بلا صافٍ مقروء) ⇒
 *   جملة تقول «تعذّرت القراءة». خلطها بـ `hidden` يجعل عطلاً يبدو كأنه «لا حساب
 *   لك» على شاشة رجلٍ قد يكون محجوباً عن الرحلات في هذه اللحظة نفسها.
 * - `ready`: صف مقروء.
 */
export type BalanceResult =
  | { state: "hidden" }
  | { state: "failed" }
  | { state: "ready"; balance: PortalBalance };

/* ------------------------------------------------------------------ */
/* قراءة صف مجهول البنية                                                */
/* ------------------------------------------------------------------ */

/**
 * الهجرة يملكها وكيل SQL، وPostgREST قد يعيد الأسماء snake_case أو camelCase —
 * فنقرأ بأول اسم موجود بدل التعلق باسم واحد (نفس نمط `requests/data.ts`).
 */
function pick(row: Record<string, unknown>, names: string[]): unknown {
  for (const name of names) {
    const value = row[name];
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

/** `numeric` يصل نصاً عبر PostgREST — التحويل قراءةٌ لا حساب، والغياب `null` لا صفر */
function asMoney(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asBool(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value === "true" || value === "t" || value === "1";
  return value === 1;
}

/** أول صف من رد الدالة — PostgREST يعيد مصفوفة لدوال `returns table` */
function firstRow(data: unknown): Record<string, unknown> | null {
  const candidate = Array.isArray(data) ? data[0] : data;
  return typeof candidate === "object" && candidate !== null
    ? (candidate as Record<string, unknown>)
    : null;
}

/**
 * الصافي وحده إلزامي: هو الإشارة التي تُبنى عليها كل صياغة في البطاقة، وبلا
 * إشارة لا تُقال «لك علينا» ولا «عليك لنا» — فيُعامَل غيابه انحرافَ عقد
 * (`failed`) لا حالة عرض. بقية الأرقام تُعرض «—» حين لا تصل.
 */
function toBalance(row: Record<string, unknown>): PortalBalance | null {
  const netDue = asMoney(pick(row, ["net_due", "netDue"]));
  if (netDue === null) return null;

  return {
    earned: asMoney(pick(row, ["earned"])),
    collected: asMoney(pick(row, ["collected"])),
    paid: asMoney(pick(row, ["paid"])),
    received: asMoney(pick(row, ["received"])),
    netDue,
    owedToUs: asMoney(pick(row, ["owed_to_us", "owedToUs"])),
    blocked: asBool(pick(row, ["blocked"])),
    amountToClear: asMoney(pick(row, ["amount_to_clear", "amountToClear"])),
  };
}

/* ------------------------------------------------------------------ */
/* القراءة                                                             */
/* ------------------------------------------------------------------ */

/**
 * رصيد صاحب الجلسة. مُذاكَرة لكل طلب حتى لو نادتها الصفحة والغلاف معاً.
 *
 * `isSchemaMissing` هي الفرق بين «القاعدة قبل 0029» و«عطل»: الأولى تُخفي
 * البطاقة بلا أثر، والثانية تقول ذلك صراحةً.
 */
export const loadPortalBalance = cache(async (): Promise<BalanceResult> => {
  const access = await portalAccess();
  // بلا هوية متعهد معتمدة لا رصيد أصلاً — والغلاف يعرض شاشة الحالة المناسبة
  if (!access.ok) return { state: "hidden" };

  const res = await access.supabase.rpc("portal_balance");
  if (res.error) {
    return isSchemaMissing(res.error) ? { state: "hidden" } : { state: "failed" };
  }

  const row = firstRow(res.data);
  // صفر صفوف = لا هوية متعهد داخل الدالة ⇒ لا بطاقة (المواصفة: «render nothing»)
  if (!row) return { state: "hidden" };

  const balance = toBalance(row);
  return balance ? { state: "ready", balance } : { state: "failed" };
});
