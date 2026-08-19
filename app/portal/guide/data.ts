import "server-only";

import { cache } from "react";

import { isSchemaMissing, portalSetupAccess } from "../_lib/session";

/**
 * أرقامُ الدليل — **تُقرأ من القاعدة ولا تُحفر في نصّه**.
 *
 * ── لماذا ملفٌّ قارئ لصفحةِ شرح؟ ───────────────────────────────────────────
 *
 * لأن الدليل الذي يكتب «٢٤ ساعة» في جملةٍ ثابتة **يصير كذباً** في اللحظة التي
 * يغيّر فيها المالك المقبض من لوحته، ولا شيء يقول لقارئه إنه كذب. وهذا بعينه
 * النمط ٢ في `handover/LESSONS.md` (الواجهة تَعِد بما لا تنفّذه القاعدة)،
 * وأثرُه هنا أسوأ من شاشةٍ عادية: من يقرأ دليلاً يبني عليه قراره وهو مطمئن.
 *
 * ── وما لا يُقرأ يُقال إنه لا يُقرأ 🔒 ─────────────────────────────────────
 *
 * قِيس حيّاً (‏`set local role authenticated` بهوية شريكٍ حقيقي داخل معاملة
 * مُلغاة، 2026-08-19) أنّ جلسة المتعهد:
 *
 * | المصدر | النتيجة بهوية المتعهد |
 * |---|---|
 * | `trip_closure_config()` | ✅ تُقرأ — `execute` ممنوحة لـ`authenticated` |
 * | `portal_agreement()` | ✅ تُقرأ |
 * | `dispatch_config()` | ❌ `permission denied for function dispatch_config` |
 * | `dispatch_settings` مباشرةً | ❌ صفر صفوف (‏RLS: `is_admin()`) |
 *
 * ⇒ **مهلةُ الردّ على العرض وعددُ موجات البثّ لا يمكن قراءتهما من حساب
 * المتعهد أصلاً.** فالدليل لا يطبع لهما رقماً، ويُحيل على المصدر الوحيد الصادق:
 * العدّاد المكتوب على بطاقة العرض نفسها (‏`OfferWindow` يقرأ `expires_at`).
 * وطبعُ رقمٍ مأخوذٍ من ملف هجرة كان سيكون **حفراً بثوب قياس**.
 *
 * ولا وسيط هوية في أي نداء هنا: `trip_closure_config()` إعدادٌ عام لا يخصّ
 * شريكاً بعينه، وما يخصّ الشريك (‏الاتفاقية · الأسباب) يُفوَّض إلى قارئه
 * الوحيد ولا يُستنسخ (القاعدة ١٢) — انظر `page.tsx`.
 */

/** إعداداتُ إغلاق الرحلة كما تُرجعها `trip_closure_config()` */
export type GuideClosureConfig = {
  /** ساعاتُ الاعتماد التلقائي لطلب الإتمام — تُجمَّد في الطلب لحظة تقديمه */
  completionApproveHours: number | null;
  /** عتبةُ الساعات التي تفصل «إعادة البثّ» عن «الإسناد اليدوي» بعد الاعتذار */
  apologyManualHours: number | null;
  /** هل خصمُ الاعتذار مُشتعلٌ على مستوى المنصة الآن؟ */
  apologyDeductionEnabled: boolean | null;
};

/**
 * ثلاث حالات لا اثنتان — بنفس تمييز `_lib/balance.ts` و`_lib/agreement.ts`:
 * - `hidden`: الدالة غير منشورة (قاعدةٌ قبل `0119`) ⇒ لا تُعرض الأرقام أصلاً.
 * - `failed`: موجودةٌ والنداء فشل ⇒ يُقال «تعذّرت القراءة»، ولا يُخترع رقم.
 * - `ready`: صفٌّ مقروء.
 *
 * ⚠ ولا حالةَ رابعة اسمها «القيمة الافتراضية»: صفرٌ أو رقمٌ مخترَعٌ في دليلٍ
 * يقرؤه الشريك ليقرّر متى يعتذر هو كذبةٌ تتحول إلى نزاع.
 */
export type GuideClosureResult =
  | { state: "hidden" }
  | { state: "failed" }
  | { state: "ready"; config: GuideClosureConfig };

const firstRow = (data: unknown): Record<string, unknown> | null => {
  const candidate = Array.isArray(data) ? data[0] : data;
  return typeof candidate === "object" && candidate !== null
    ? (candidate as Record<string, unknown>)
    : null;
};

const pick = (row: Record<string, unknown>, names: string[]): unknown => {
  for (const name of names) {
    const value = row[name];
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
};

/** `null` = «لم يصل» لا «صفر» — والفرق هو كل الفرق في جدولٍ يُقرأ منه قرار */
const asNumber = (value: unknown): number | null => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

/** `null` = «لا نعرف» — فلا يُقال «الخصم مطفأ» ونحن لم نقرأ المفتاح */
const asBool = (value: unknown): boolean | null => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value === "true" || value === "t" || value === "1") return true;
    if (value === "false" || value === "f" || value === "0") return false;
  }
  return null;
};

/**
 * قراءةٌ واحدة مُذاكَرة لكل طلب. والحارس هو **الموسَّع** (`portalSetupAccess`)
 * بقصد: المدعوُّ الذي يجهّز نفسه هو أحوجُ الناس إلى قراءة الدليل قبل أن يقبل
 * أول رحلة — لا بعدها.
 */
export const loadGuideClosureConfig = cache(async (): Promise<GuideClosureResult> => {
  const access = await portalSetupAccess();
  if (!access.ok) return { state: "hidden" };

  const res = await access.supabase.rpc("trip_closure_config");
  if (res.error) {
    return isSchemaMissing(res.error) ? { state: "hidden" } : { state: "failed" };
  }

  const row = firstRow(res.data);
  if (!row) return { state: "hidden" };

  return {
    state: "ready",
    config: {
      completionApproveHours: asNumber(
        pick(row, ["completion_approve_hours", "completionApproveHours"])
      ),
      apologyManualHours: asNumber(pick(row, ["apology_manual_hours", "apologyManualHours"])),
      apologyDeductionEnabled: asBool(
        pick(row, ["apology_deduction_enabled", "apologyDeductionEnabled"])
      ),
    },
  };
});
