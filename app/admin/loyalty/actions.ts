"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { isMissingTable } from "@/lib/dispatch/settings";
import { createServerSupabase } from "@/lib/supabase/server";
import { checked, num } from "../discounts/input";
import type { LoyaltyErrorCode, LoyaltyNoticeCode } from "./messages";

/**
 * إجراءات شاشة الولاء — **مقبضٌ واحد لا أكثر: حفظ الإعدادات**.
 *
 * أربع قواعد تحكم هذا الملف:
 *
 * (١) 🔴 **لا حساب نقاطٍ ولا مالٍ هنا إطلاقاً.** ما يقع: تحقق من المدخلات وكتابة
 *     صفٍّ واحد. سكّ النقطة مُشغّلٌ على انتقال الاكتمال (‏§٤ من العقد)،
 *     والاستبدال في `redeem_points` وهي التي تنادي `discount_floor_room` فتفرض
 *     أرضية الهامش (‏§١ · **D-16**). فلا هذه الشاشة تسكّ نقطةً ولا تستبدلها ولا
 *     تستطيع أن «تسمح» بما ترفضه القاعدة — هي تكتب **مقابض** يقرؤها المحرّك.
 *
 * (٢) الشكل القياسي لأي Server Action في هذا المستودع (اتفاقية ٤): فحص البيئة ←
 *     تحقق مع خروج فوري برمز عربي واضح ← كتابة مع `.select()` وفحص صفر صفوف (فخ
 *     RLS الصامت) ← `revalidatePath` ثم `redirect`.
 *
 * (٣) 🔒 **التفعيل يستلزم إقراراً صريحاً، والإطفاء لا يستلزمه.** عدم التماثل
 *     مقصود: التفعيل هو اللحظة التي يبدأ عندها **سكّ التزامٍ مالي** على كل رحلة
 *     تكتمل، والإطفاء توقّفٌ عن السكّ لا محوٌ لما سُكّ. ومربّع الإقرار حارسٌ
 *     يعمل بلا جافاسكربت — لا نافذة تأكيد على العميل — ويُطلب **مرة عند العبور
 *     من مطفأ إلى مفعَّل** لا في كل حفظ، وإلا صار طقساً يُعلَّم بلا قراءة (وإنذارٌ
 *     يرنّ دائماً لا يُسمع — النمط في `LESSONS.md` قسم ١ بند ٣).
 *
 * (٤) الحالة السابقة تُقرأ **من القاعدة لا من الشاشة**: نموذجٌ مبنيّ على صفحة
 *     قديمة كان سيعبر من «مطفأ» إلى «مفعَّل» بلا إقرار لأن الصفحة ظنّته مطفأً
 *     وقد فعّله زميلٌ قبل دقيقة.
 */

const url = (qs: string) => `/admin/loyalty?${qs}`;

const fail = (code: LoyaltyErrorCode): string => url(`error=${code}`);
const done = (code: LoyaltyNoticeCode): string => url(`done=${code}`);

/**
 * حدودٌ عاقلة تمنع الأخطاء المطبعية الكارثية — **وليست قواعد عمل**.
 *
 * ⚠ ولا تدّعي الشاشة أنها تفرضها: الحدّ الفعلي قيدُ `check` في `0047`، وهو الذي
 * يردّ `23514` فتظهر رسالة `constraint`. لو ضاق حدُّ القاعدة عن حدّنا هنا فالقاعدة
 * هي التي ترفض — ولا يُقال للمالك «مسموح» ثم يفشل الحفظ (النمط ٢ في `LESSONS.md`:
 * واجهةٌ تَعِد بما لا تنفّذه القاعدة).
 */
const MAX_POINTS_PER_CURRENCY = 100;
const MAX_CURRENCY_PER_POINT = 1_000;
const MAX_MIN_REDEEM = 1_000_000;
const MAX_PERCENT = 100;
/** `loyalty_settings_expire_months_chk` — عشر سنوات سقفاً، والصفر «بلا انتهاء» */
const MAX_EXPIRE_MONTHS = 120;

export async function saveLoyaltySettings(formData: FormData) {
  // (١) البيئة أولاً — بلا متغيرات Supabase يرجع العميل `null`
  const supabase = await createServerSupabase();
  if (!supabase) redirect(fail("env"));

  // (٢) التحقق: رمزٌ مستقل لكل حقل، فالرسالة الواحدة العامة تُخفي أي الحقول أخطأ
  const pointsPerCurrency = num(formData, "points_per_currency");
  if (
    pointsPerCurrency === null ||
    pointsPerCurrency < 0 ||
    pointsPerCurrency > MAX_POINTS_PER_CURRENCY
  ) {
    redirect(fail("perpoint"));
  }

  // ⚠ **أكبر من صفر تماماً، لا «غير سالب»** — مطابقةً لقيد `0047` المقروء من ملف
  // الهجرة: `check (currency_per_point > 0)`. والقاعدة تبقى هي المُنفِّذ (رسالة
  // `constraint` قائمة لو ضاق قيدها أكثر)، لكن الصفر خطأٌ **متوقَّع ومعروف
  // سببه**، فيستحق رسالته الدقيقة بدل «رفضت القاعدة أحد قيودها».
  const currencyPerPoint = num(formData, "currency_per_point");
  if (
    currencyPerPoint === null ||
    currencyPerPoint <= 0 ||
    currencyPerPoint > MAX_CURRENCY_PER_POINT
  ) {
    redirect(fail("pointvalue"));
  }

  const minRedeemPoints = num(formData, "min_redeem_points");
  if (
    minRedeemPoints === null ||
    !Number.isInteger(minRedeemPoints) ||
    minRedeemPoints < 0 ||
    minRedeemPoints > MAX_MIN_REDEEM
  ) {
    redirect(fail("minredeem"));
  }

  const maxRedeemPercent = num(formData, "max_redeem_percent");
  if (maxRedeemPercent === null || maxRedeemPercent < 0 || maxRedeemPercent > MAX_PERCENT) {
    redirect(fail("maxredeem"));
  }

  /**
   * 🔴 صلاحيةُ النقطة — قرار المالك: ثلاثة أشهر **من تاريخ الكسب**، ويسري على
   * النقاط القائمة كذلك.
   *
   * والصفر ليس خطأً بل **معنى**: «بلا انتهاء» (السلوك السابق حرفياً). ولذلك
   * يُقبل هنا ولا يُرفض — والقاعدة تقرؤه فتتخطى المهمة المجدولة بهدوء.
   *
   * ⚠ و«من تاريخ الكسب» هي ما يفرض تتبّع الدفعات (`loyalty_lots`): الدفتر مُلحَقٌ
   * برصيدٍ مجمَّع، فبلا ترتيبٍ صريح لا يُعرف أيُّ نقاطٍ استهلكها الاستبدال. وهذا
   * كله في القاعدة، ولا رقم منه يُحسب هنا.
   */
  const expireMonths = num(formData, "expire_months");
  if (
    expireMonths === null ||
    !Number.isInteger(expireMonths) ||
    expireMonths < 0 ||
    expireMonths > MAX_EXPIRE_MONTHS
  ) {
    redirect(fail("expiremonths"));
  }

  const nextEnabled = checked(formData, "enabled");

  // (٣) الحالة القائمة من القاعدة — ومنها يُعرف العبور، ومنها مرشّح التحديث
  const existing = await supabase.from("loyalty_settings").select("*").limit(1);
  if (existing.error) {
    redirect(fail(isMissingTable(existing.error.code) ? "migration" : "save"));
  }

  const current = (existing.data?.[0] ?? null) as Record<string, unknown> | null;
  const wasEnabled = current?.enabled === true;

  // 🔒 العبور من مطفأ إلى مفعَّل — وغياب الصف أصلاً عبورٌ كذلك: لا شيء كان يُسكّ
  if (!wasEnabled && nextEnabled && !checked(formData, "ack")) redirect(fail("ack"));

  const patch = {
    enabled: nextEnabled,
    points_per_currency: pointsPerCurrency,
    currency_per_point: currencyPerPoint,
    min_redeem_points: minRedeemPoints,
    max_redeem_percent: maxRedeemPercent,
    expire_months: expireMonths,
  };

  // (٤) الكتابة — ولا `update` بلا مرشّح أبداً. الصف الوحيد يُقيَّد بعمود `id` إن
  // وُجد (وهو `boolean` في نمط `discount_settings` المقيس)، وإلا بمرشّح يطابق
  // الصف الوحيد دائماً. نفس ما تفعله شاشتا التسعير والخصومات حرفاً بحرف.
  const write = current
    ? await (current.id === undefined
        ? supabase.from("loyalty_settings").update(patch).not("enabled", "is", null)
        : supabase
            .from("loyalty_settings")
            .update(patch)
            .eq("id", current.id as string)
      ).select()
    : await supabase.from("loyalty_settings").insert(patch).select();

  if (write.error) {
    if (isMissingTable(write.error.code)) redirect(fail("migration"));
    // 23514 = check_violation — المالك أخطأ في **الرقم** لا في الصلاحية، ورسالة
    // «تأكد أنك admin» كانت سترسله إلى مسارٍ خاطئ تماماً
    redirect(fail(write.error.code === "23514" ? "constraint" : "save"));
  }
  // صفر صفوف مع نجاحٍ ظاهري = RLS رفضت الكتابة (المستخدم ليس admin)
  if (!write.data || write.data.length === 0) redirect(fail("save"));

  // (٥) إبطال الكاش ثم توجيهٌ برمزٍ يقول **ما تغيّر**، لا «حُفظ» في كل حال:
  // لحظة التفعيل ليست حفظاً عادياً — عندها يبدأ الالتزام.
  revalidatePath("/", "layout");
  if (!wasEnabled && nextEnabled) redirect(done("on"));
  if (wasEnabled && !nextEnabled) redirect(done("off"));
  redirect(done("saved"));
}
