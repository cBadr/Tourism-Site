import "server-only";

import type { LoyaltyDirection, LoyaltySettings } from "@/lib/loyalty-types";
import {
  boolOf,
  classifyStatsError,
  numberOf,
  rowsOf,
  type StatsRead,
  textOf,
} from "@/lib/stats/read";
import type { createServerSupabase } from "@/lib/supabase/server";

/**
 * قرّاء شاشة الولاء — **قراءة وتحويل شكل فقط، صفر حساب**.
 *
 * (١) 🔴 **لا رقم يُشتق هنا، وأخصّها الالتزام.** «النقاط القائمة × قيمة النقطة»
 *     ضربٌ مالي، و**D-05** يمنعه في TypeScript منعاً باتّاً. فقيمة الالتزام
 *     بالجنيه تصل **محسوبةً من القاعدة** أو **لا تصل**، وحينها تُعرض «—» بسببٍ
 *     مسمّى. والبديل — أن نضربها هنا «مؤقتاً» — يصنع مصدراً ثانياً لرقمٍ مالي
 *     واحد (النمط ٨ في `LESSONS.md`، وقد تكرّر مرتين في هذا المستودع)، ويكون
 *     الرقم الثاني هو **حجم دَينٍ على المنصة**.
 *
 * (٢) عميل الجلسة لا عميل الخدمة: كل قراءة تمرّ على RLS وعلى حارس الدور في
 *     `app/admin/layout.tsx`. مفتاح الخدمة هنا كان سيحوّل أي خلل في الحارس إلى
 *     تسريب كامل (النمط ١ في `handover/LESSONS.md`).
 *
 * (٣) قراءة **متسامحة بأسماء الأعمدة**: هجرة `0047_loyalty.sql` يكتبها وكيلٌ آخر
 *     بالتوازي مع هذا الملف — وهي **غير مطبَّقة لحظة كتابته** (مقيس: آخر هجرة في
 *     `schema_migrations` هي `0046_discount_floor_room.sql`، ولا علاقة باسم
 *     `%loyalt%` في `information_schema`). الاسم الأول في كل قائمة هو المعتمد،
 *     والباقي شبكة أمان. والانحراف حين يقع يظهر **«—» لا صفراً كاذباً**.
 *
 * (٤) 🔒 **ولا هاتف في أي إسقاط هنا.** `LoyaltyEntryView` في العقد بلا حقل
 *     هاتف، و`phone_norm` مدرَجٌ في `LOYALTY_FORBIDDEN_COLUMNS`. فدفتر المالك
 *     يعرض **الحركة ومرجع حجزها**، لا قائمة أرقام عملاء — والرصيد يُجمَّع على
 *     الهاتف في القاعدة (‏§٣ من العقد) ولا حاجة بالشاشة إلى رؤية شكل تطبيعنا له.
 *
 * (٥) التمييز بين «الهجرة لم تُنفَّذ» و«ممنوع» و«فشل قراءة» مستورَدٌ من طبقة
 *     الإحصائيات نفسها (`lib/stats/read.ts`) كي لا يوجد تعريفان لمعنى «القاعدة
 *     غير جاهزة» في لوحة واحدة.
 */

type Supabase = NonNullable<Awaited<ReturnType<typeof createServerSupabase>>>;

type PgError = { code?: string; hint?: string | null; message?: string } | null;

const ok = <T,>(data: T): StatsRead<T> => ({
  data,
  ready: true,
  failure: null,
  missing: null,
});

const failed = <T,>(data: T, name: string, error: PgError): StatsRead<T> => ({
  data,
  ready: false,
  failure: classifyStatsError(error) ?? "failed",
  missing: name,
});

/** سقف صفوف الدفتر — شاشة تشغيل لا أرشيف (نفس سقف بقية جداول اللوحة) */
export const MAX_ENTRY_ROWS = 200;

// ---------------------------------------------------------------------------
// (١) إعدادات الولاء — الصف الوحيد
// ---------------------------------------------------------------------------

/**
 * ⚠ **المقابض الأربعة `number | null` لا `number`** — والفرق ليس تحوّطاً.
 *
 * `null` هنا معناه **«لم يصل»** لا «صفر»: لا صفّ في القاعدة بعد، أو العمود باسمٍ
 * آخر. وعرضُ صفرٍ مكانه كذبةٌ مزدوجة — يقرأ المالك «قيمة النقطة صفر» فيظنّ نظاماً
 * مضبوطاً بلا قيمة، بينما لا نظام أصلاً. («لا نعرف» و«صفر» و«لا ينطبق» ثلاثة
 * أشياء — القاعدة ١٥ في `handover/INDEX.md`.)
 *
 * 🔒 **ولا قيم افتراضية مكتوبة في هذا الملف ولا في العقد.** عقد الولاء — بخلاف
 * `lib/discount-types.ts` — **لا يصدّر `DEFAULT_LOYALTY_SETTINGS`**، وكتابتها هنا
 * كانت ستجعل أرقاماً اختارها هذا الملف تُعرض على أنها محفوظة قبل أن تُكتب سطراً
 * واحداً في القاعدة، ثم تنحرف عن بذرة `0047` التي يكتبها وكيلٌ آخر (النمط ٤ في
 * `LESSONS.md`). فالحقل الفارغ يُعرض فارغاً، ويقول النموذج إن الحفظ هو ما يُنشئ الصف.
 *
 * أما `enabled` فيسقط إلى `false` بلا حرج: العقد ينصّ على أن البذرة مطفأة، **و**
 * غيابُ الصف نفسه يعني أن المحرّك لا يقرأ شيئاً — فالحالتان «لا سكّ ولا استبدال».
 */
export type LoadedLoyaltySettings = {
  /** معرّف الصف الوحيد كما وصل — `boolean` في نمط `discount_settings`، أو uuid */
  id: string | number | boolean | null;
  /** هل وُجد صفٌّ فعلاً؟ `false` يعني أن المعروض ليس محفوظاً */
  exists: boolean;
  enabled: boolean;
  pointsPerCurrency: number | null;
  currencyPerPoint: number | null;
  minRedeemPoints: number | null;
  maxRedeemPercent: number | null;
  /**
   * أشهرُ صلاحية النقطة **من تاريخ كسبها** (هجرة 0119) — و`0` تعني «بلا انتهاء».
   * و`null` هنا تعني «القاعدة لم تصلها الهجرة» لا «صفر»: الفرق هو الفرق بين
   * حقلٍ يُعرض معطَّلاً برسالة هجرة وحقلٍ يقول للمالك إنه أطفأ ما لم يطفئه.
   */
  expireMonths: number | null;
};

/** فراغٌ صريح — كل مقبض `null` أي «لم يصل»، والنظام مطفأ */
const EMPTY_SETTINGS: LoadedLoyaltySettings = {
  id: null,
  exists: false,
  enabled: false,
  pointsPerCurrency: null,
  currencyPerPoint: null,
  minRedeemPoints: null,
  maxRedeemPercent: null,
  expireMonths: null,
};

/**
 * `loyalty_settings` — جدول صفٍّ واحد «على شكل `discount_settings` حرفياً»
 * (نصّ العقد). ومُقيس على القاعدة الحيّة أن ذلك النمط مفتاحه
 * `id boolean default true`، فالصف الوحيد مضمونٌ بالبنية لا بالانضباط.
 */
export async function readLoyaltySettings(
  supabase: Supabase
): Promise<StatsRead<LoadedLoyaltySettings>> {
  const res = await supabase.from("loyalty_settings").select("*").limit(1).maybeSingle();
  if (res.error) return failed(EMPTY_SETTINGS, "loyalty_settings", res.error);

  const row = (res.data ?? null) as Record<string, unknown> | null;
  if (!row) return ok(EMPTY_SETTINGS);

  const id = row.id;
  return ok({
    id:
      typeof id === "string" || typeof id === "number" || typeof id === "boolean" ? id : null,
    exists: true,
    enabled: boolOf(row, ["enabled"], false),
    pointsPerCurrency: numberOf(row, ["points_per_currency", "pointsPerCurrency"]),
    currencyPerPoint: numberOf(row, ["currency_per_point", "currencyPerPoint"]),
    minRedeemPoints: numberOf(row, ["min_redeem_points", "minRedeemPoints"]),
    maxRedeemPercent: numberOf(row, ["max_redeem_percent", "maxRedeemPercent"]),
    expireMonths: numberOf(row, ["expire_months", "expireMonths"]),
  });
}

/** الأسماء التي تكتبها هذه الشاشة — العقد `LoyaltySettings` عموداً بعمود */
export const SETTINGS_COLUMNS: Record<keyof Omit<LoyaltySettings, "enabled">, string> = {
  pointsPerCurrency: "points_per_currency",
  currencyPerPoint: "currency_per_point",
  minRedeemPoints: "min_redeem_points",
  maxRedeemPercent: "max_redeem_percent",
};

// ---------------------------------------------------------------------------
// (٢) 🔴 الالتزام القائم — الرقم الوحيد الذي يمثّل مالاً مستحقاً علينا
// ---------------------------------------------------------------------------

/**
 * ما تدين به المنصة اليوم بالنقاط وبالجنيه.
 *
 * كل حقل `number | null` **بالمعنى نفسه**: `null` = «لم تُرجعه القاعدة». وأخطرها
 * `worth` — فهو المبلغ. لا يُشتق هنا من `points × currencyPerPoint` مهما بدا
 * بديهياً (البند ١ أعلى الملف · **D-05**).
 */
export type LoyaltyLiability = {
  /** مجموع الأرصدة القائمة نقاطاً */
  points: number | null;
  /** ما تعادله بعملة الموقع — **محسوبةً في القاعدة** */
  worth: number | null;
  /** عملة `worth` كما أرجعتها القاعدة، لا كما تفترضها الشاشة */
  currency: string | null;
  /** كم رصيداً غير صفري وراء الرقم — يفرّق «دَين على واحد» عن «دَين على مئة» */
  accounts: number | null;
};

const EMPTY_LIABILITY: LoyaltyLiability = {
  points: null,
  worth: null,
  currency: null,
  accounts: null,
};

/**
 * المصدر المتوقَّع من `0047_loyalty.sql`: اطّلاعٌ بصفٍّ واحد اسمه
 * `v_loyalty_liability` يجمّع `loyalty_accounts` ويضرب في `currency_per_point`
 * **داخل القاعدة**.
 *
 * ⚠ **وهذا اسمٌ واحد مكتوبٌ صراحةً، لا تخمينٌ لأسماء بديلة.** التسامح في هذا
 * الملف يخصّ **أعمدة** داخل صفٍّ وصل؛ أما تخمين اسم العلاقة فيحوّل «الهجرة لم
 * تُنفَّذ» إلى بحثٍ صامت ينتهي بـ«لا بيانات» بلا سبب مفهوم. فإن غاب الاطّلاع
 * تقول الشاشة اسمه بالحرف وتطلب تنفيذ الهجرة — وهو ما يجعل انحراف العقد بين
 * الوكيلين **يُمسَك في أول فتحة للشاشة** لا بعد أسبوع.
 */
export const LIABILITY_VIEW = "v_loyalty_liability";

export async function readLoyaltyLiability(
  supabase: Supabase
): Promise<StatsRead<LoyaltyLiability>> {
  const res = await supabase.from(LIABILITY_VIEW).select("*").limit(1).maybeSingle();
  if (res.error) return failed(EMPTY_LIABILITY, LIABILITY_VIEW, res.error);

  const row = (res.data ?? null) as Record<string, unknown> | null;
  // اطّلاعٌ تجميعي بلا `group by` يُرجع صفاً واحداً دائماً ولو كان الجدول فارغاً
  // (‏`sum` على لا شيء = `null` في صفٍّ موجود). فصفر صفوف ليس «لا التزام» بل
  // شكلٌ غير متوقَّع — يُقال ولا يُترجم إلى صفر.
  if (!row) return failed(EMPTY_LIABILITY, LIABILITY_VIEW, { code: "PGRST116" });

  return ok({
    points: numberOf(row, ["points_outstanding", "points", "balance_points", "total_points"]),
    worth: numberOf(row, ["worth", "worth_amount", "liability_amount", "amount"]),
    currency: textOf(row, ["currency"]),
    accounts: numberOf(row, ["accounts", "accounts_count", "balances"]),
  });
}

// ---------------------------------------------------------------------------
// (٣) الدفتر — `LoyaltyEntryView` صفاً بصف
// ---------------------------------------------------------------------------

const DIRECTIONS = ["earn", "redeem", "reverse", "adjust"] as const;

const isDirection = (value: string | null): value is LoyaltyDirection =>
  value !== null && (DIRECTIONS as readonly string[]).includes(value);

/**
 * حركة واحدة كما تصل من القاعدة.
 *
 * ⚠ `direction` هنا **`LoyaltyDirection | null`** بينما هو في العقد اتحادٌ مغلق.
 * والسبب أن الاتحاد عقدُ ما **تكتبه** القاعدة، وهذا الحقل يحمل ما **وصل** فعلاً:
 * اتجاهٌ يضيفه `0047` ولا تعرفه هذه الشاشة يجب أن يظهر «غير معروف» بقيمته الخام،
 * لا أن يُقولَب إلى `earn` فيُقرأ كسباً وهو عكسُ قيد. (وهو نفس الفرق الذي
 * تشرحه القاعدة ١٥: «لا نعرف» ليست إحدى القيم المعروفة.)
 */
export type LoadedLoyaltyEntry = {
  id: string;
  direction: LoyaltyDirection | null;
  /** ما وصل حرفياً حين لم يكن اتجاهاً معروفاً — يُعرض ولا يُخفى */
  directionRaw: string | null;
  /** موجبٌ للكسب وسالبٌ للاستبدال — **الإشارة تصل من القاعدة ولا تُشتق هنا** */
  points: number | null;
  bookingId: string | null;
  bookingReference: string | null;
  occurredAt: string | null;
  note: string | null;
  /** قيدٌ عاكس يشير إلى أصله — وجوده يعني أن هذا الصف تصحيحٌ لا حركةٌ أصلية */
  reversesEntryId: string | null;
};

function toEntry(row: Record<string, unknown>): LoadedLoyaltyEntry {
  const raw = textOf(row, ["direction", "kind", "entry_type"]);
  return {
    id: textOf(row, ["id"]) ?? "",
    direction: isDirection(raw) ? raw : null,
    directionRaw: raw,
    points: numberOf(row, ["points", "points_delta", "amount"]),
    bookingId: textOf(row, ["booking_id", "bookingId"]),
    bookingReference: textOf(row, ["booking_reference", "reference"]),
    occurredAt: textOf(row, ["occurred_at", "created_at", "createdAt"]),
    note: textOf(row, ["note", "reason", "memo"]),
    reversesEntryId: textOf(row, ["reverses_entry_id", "reversesEntryId"]),
  };
}

/**
 * ⚠ **الترتيب باسم عمودٍ غير موجود يردّه PostgREST خطأً** فتفرغ الشاشة بلا سبب
 * مفهوم — وهي مصيدةٌ وقعت في هذا المستودع فعلاً (`coupon_redemptions.redeemed_at`
 * ظنّه القارئ `created_at`). ولأن `0047` تُكتب بالتوازي، نجرّب المرشّحين
 * بالترتيب: **الفشل هنا فشلُ ترتيبٍ لا فشلُ قراءة**، فالتراجع إلى العمود التالي
 * أصدق من إخراج شاشة فارغة. وآخر مرشّح «بلا ترتيب» — صفوفٌ غير مرتّبة أنفع من
 * لا صفوف، ويُقال ذلك في الشاشة لا يُخفى.
 */
const ORDER_CANDIDATES = ["occurred_at", "created_at", null] as const;

export type LoadedLedger = {
  entries: LoadedLoyaltyEntry[];
  /** العمود الذي رُتِّب به فعلاً — `null` يعني أن الصفوف وصلت بلا ترتيب */
  orderedBy: string | null;
};

export async function readLoyaltyEntries(supabase: Supabase): Promise<StatsRead<LoadedLedger>> {
  const blank: LoadedLedger = { entries: [], orderedBy: null };

  for (const column of ORDER_CANDIDATES) {
    const query = supabase.from("loyalty_entries").select("*").limit(MAX_ENTRY_ROWS);
    const res = await (column ? query.order(column, { ascending: false }) : query);

    if (res.error) {
      // 42703 = عمود غير موجود ⇒ جرّب المرشّح التالي. وأي خطأ آخر (هجرة ناقصة،
      // منع RLS، فشل شبكة) يُبلَّغ فوراً ولا يُدفن في حلقة إعادة محاولة.
      if (res.error.code === "42703" && column !== null) continue;
      return failed(blank, "loyalty_entries", res.error);
    }

    const entries = rowsOf(res.data)
      .map(toEntry)
      .filter((entry) => entry.id !== "");
    return ok({ entries, orderedBy: column });
  }

  return ok(blank);
}

/**
 * مرجع الحجز لكل معرّف — الدفتر يعرض رقماً يعرفه المالك لا UUID.
 *
 * قراءةٌ ثانية بدل وصلٍ في PostgREST عمداً: العلاقة بين `loyalty_entries`
 * و`bookings` يكتبها `0047`، والوصل باسم علاقةٍ مفترَض يفشل كله إن اختلف الاسم
 * — فيُسقط الدفتر بأكمله لأجل عمود عرضٍ واحد. وفشلُ هذه القراءة يعني «—» في خانة
 * المرجع وحدها، والدفتر يظلّ مقروءاً.
 */
export async function readEntryReferences(
  supabase: Supabase,
  ids: string[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const unique = [...new Set(ids.filter((id) => id !== ""))].slice(0, MAX_ENTRY_ROWS);
  if (unique.length === 0) return map;

  const res = await supabase.from("bookings").select("id, reference").in("id", unique);
  if (res.error) return map;

  for (const row of rowsOf(res.data)) {
    const id = textOf(row, ["id"]);
    const reference = textOf(row, ["reference"]);
    if (id && reference) map.set(id, reference);
  }
  return map;
}
