import Link from "next/link";
import { AlertTriangle, CheckCircle2, HandCoins, HelpCircle, X } from "lucide-react";

import { HelpTip } from "@/components/shared/HelpTip";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { controlClass } from "../../../orders/_components/booking-ui";
import {
  AccountField,
  accountKindLabel,
  AmountField,
  hrefWith,
  Money,
  OccurredAtField,
  SettlementBadge,
  settlementWording,
  type TreasuryAccount,
} from "../../_components/finance-ui";
import { recordPartnerSettlement } from "../actions";
import type { CarriedValues, Settlement } from "./payout-forms";

/**
 * فرع **التحصيل** من التسوية الموحّدة (هجرة 0029، و١) — الاتجاه الذي لم يكن
 * للنظام سبيل إليه قبل اليوم.
 *
 * قبل هذه الهجرة كانت معادلة التسوية ثلاثية (`earned − collected − paid`) ولا
 * مكان فيها يستقبل ما سدّده المتعهد. فمن أراد تخفيض دينه لم يجد إلا «تسوية
 * بمبلغ سالب» — وقياسٌ حيّ على قاعدة بدر أثبت أنها **تعمّق الدين بدل أن تخفضه**
 * (العرض يجمع `sign * amount` ويتجاهل `direction` تماماً). فصار للتحصيل دورٌ
 * رابع خاص به: `received`، وقيدٌ واحد يرفع الخزينة ويخفض الدين معاً.
 *
 * وهذا الملف — كبقية شاشات المالية — **لا يحسب جنيهاً واحداً**: المبلغ الافتراضي
 * هو عمود `owed_to_us` كما وصل من `v_partner_settlements`، والصافي بعد الحفظ
 * يصل من إرجاع `record_partner_settlement` نفسها.
 */

const PATH = "/admin/finance/partners";

/** الحساب المُعاد من الرابط لا يُقبل إلا إن كان ما زال في القائمة */
const keptAccount = (accounts: TreasuryAccount[], value: string | undefined) =>
  value && accounts.some((a) => a.id === value) ? value : undefined;

/**
 * هل يُطلب مرجع العملية؟ — ثلاث حالات لا اثنتان.
 *
 * القاعدة تعرف يقيناً: تقرأ `kind` من `payment_accounts` وترفض بلا مرجع لغير
 * النقدية (‏`reference-required`). أما الشاشة فمكوّن خادم بلا جافاسكربت (اتفاقية
 * §٤: الحالة كلها في الـ query string)، فلا تعلم أي حساب سيختاره المشرف قبل
 * الإرسال. ولذلك:
 *
 *   `required`    — الحساب معروف وغير نقدي (عاد في الرابط بعد رفض)، **أو** لا
 *                   حساب نقدي في القائمة أصلاً فالطلب واقع مهما اختار.
 *   `optional`    — الحساب معروف ونقدي: النقدية لا تُنتج رقم عملية.
 *   `conditional` — لم يُختر بعد: الحقل ظاهر وغير مُلزَم في HTML، والنص يقول
 *                   القاعدة صراحةً. وإلزامه هنا كان سيمنع تسجيل تحصيل نقدي
 *                   مشروع — أي واجهة تحرس أكثر من القاعدة، وهو عيب لا احتياط.
 */
type ReferenceRule = "required" | "optional" | "conditional";

function referenceRule(
  accounts: TreasuryAccount[],
  chosen: string | undefined
): ReferenceRule {
  const account = chosen ? accounts.find((a) => a.id === chosen) : undefined;
  if (account) return account.kind === "cash" ? "optional" : "required";
  if (accounts.length > 0 && accounts.every((a) => a.kind !== "cash")) return "required";
  return "conditional";
}

const REFERENCE_NOTE: Record<ReferenceRule, string> = {
  required:
    "مطلوب لهذا الحساب: المحفظة وانستا باي والبنك والبطاقة كلها تُنتج رقم عملية، وسترفض قاعدة البيانات القيد بدونه.",
  optional:
    "الحساب المختار نقدية، والنقدية لا تُنتج رقم عملية — اتركه فارغاً، أو اكتب رقم إيصال يدوي إن كان لديك.",
  conditional:
    "مطلوب لكل حساب غير نقدي (محفظة · انستا باي · بنك · بطاقة)، ومتروك للنقدية وحدها. القاعدة تفرضه بعد الإرسال بحسب الحساب الذي تختاره.",
};

/**
 * نموذج التحصيل من المتعهد — بمساريه.
 *
 * **المسار الافتراضي:** `net_due < 0` أي عليه لنا. والاختيار وقع في الصفحة على
 * إشارة العمود وحدها (`settlementDirection`)، فلا زر «اختر الاتجاه» ولا احتمال أن
 * يفتح المشرف نموذج دفع لمن هو مدين لنا.
 *
 * **ومسار التجاوز الصريح** (‏`?confirm=collect` من داخل نموذج الدفع): متعهدٌ لسنا
 * نطالبه بشيء يردّ إلينا مالاً — زيادةً قبضها من عميل، أو تصحيحاً لفاتورة. كان
 * هذا مستحيلاً في الشاشة: اللوح يشتق الاتجاه من الإشارة فيفتح له الدفع وحده،
 * فيلجأ المشرف إلى تسوية يدوية غامضة. والقاعدة تقبل الحالتين عمداً (نصّ 0029 ق٦:
 * «تجاوز الدين مسموح … فلا تضف هنا فحص المبلغ يفوق الدين»).
 *
 * والنبرة تفرّق بينهما: النصّ لا يقول «هذا الشريك مدين لنا» إلا حين يكون كذلك —
 * جملةٌ تصف حالةً غير قائمة هي عيبٌ كالعيب في الرقم (النمط ٢ في `LESSONS.md`).
 */
export function CollectionForm({
  partner,
  accounts,
  currency,
  today,
  readOnly,
  carried,
}: {
  partner: Settlement;
  accounts: TreasuryAccount[];
  currency: string;
  today: string;
  readOnly: boolean;
  carried: CarriedValues;
}) {
  // النبرة والنص المختصران وحدهما — لا جملة إسناد في هذا النموذج
  const { tone, text } = settlementWording(partner.netDue, partner.absNetDue, currency, {
    owedToUs: partner.owedToUs,
    overLimit: partner.overLimit,
    blockDispatch: null,
  });

  /**
   * أهو المسار الافتراضي أم التجاوز الصريح؟
   *
   * النبرة تصل من `settlementWording` على إشارة `net_due` — نفس المصدر الذي
   * اختار به اللوح هذا النموذج، فلا شرط ثانٍ ينحرف عن الأول. و`they-owe` وحدها
   * تعني «عليه لنا»؛ وما عداها (له علينا · تمت التصفية · غير مقروء) تجاوزٌ صريح.
   */
  const debtor = tone === "they-owe";
  const f = (name: string) => `collect-${partner.subcontractorId}-${name}`;

  const chosen = keptAccount(accounts, carried.account);
  const rule = referenceRule(accounts, chosen);

  /**
   * المبلغ الافتراضي = **الدين كاملاً** كما وصل من `owed_to_us`، لا مشتقاً من
   * `net_due` بنفي إشارته هنا. وغيابه (عمود لم تجلبه قاعدة قبل 0027) يعني حقلاً
   * فارغاً يكتبه المشرف — لا صفراً مخترَعاً يقيّد قيداً بلا مال.
   *
   * وفي التجاوز الصريح يخرج فارغاً بالبناء: `owed_to_us` هناك صفرٌ لأننا لسنا
   * دائنين أصلاً، فلا رقم يُبدأ به — وهو الصواب لا نقصٌ فيه.
   */
  const owedDefault =
    partner.owedToUs !== null && partner.owedToUs > 0 ? String(partner.owedToUs) : undefined;

  /**
   * `received` عمود هجرة 0029 في العرض، وهو `coalesce(...)` فلا يصل `null` أبداً
   * بعد تنفيذها. فوصوله `null` دليلٌ بنيوي على أن الهجرة لم تُنفَّذ — والشاشة
   * **تُنبّه ولا تمنع**: المنع الحقيقي عند القاعدة، ورسالتها تسمّي الهجرة برقمها.
   */
  const notMigrated = partner.received === null;

  /**
   * المخرج الوحيد للدفع لمتعهد مدين لنا.
   *
   * قبل التوحيد كان رابط المقدَّم يعيش في نموذج الدفع تحت فرع «عليه لنا» — وهو
   * الفرع الذي صار يفتح **التحصيل** الآن، فلولا نقله إلى هنا لصار المقدَّم
   * الصريح مساراً مسدوداً: ميزةٌ مبنية بقرار بدر في 0027 لا رابط يصل إليها
   * (النمط ٣ في `handover/LESSONS.md`). وموضعه هنا ثانوي عمداً: التحصيل هو
   * الافتراضي، والدفع استثناء موسوم بخطوة تأكيد وسبب إلزامي.
   */
  const advanceHref = hrefWith(PATH, {
    pay: partner.subcontractorId,
    confirm: "advance",
    account: carried.account,
    amount: carried.amount,
    at: carried.at,
  });

  /** العودة إلى الفرع الافتراضي لهذا الشريك — بلا `confirm`، وبما كُتب محمولاً */
  const payoutHref = hrefWith(PATH, {
    pay: partner.subcontractorId,
    account: carried.account,
    amount: carried.amount,
    at: carried.at,
  });

  return (
    <form action={readOnly ? undefined : recordPartnerSettlement}>
      <input type="hidden" name="subcontractor" value={partner.subcontractorId} />
      <Card className="gap-4 border-sky-300 bg-sky-50 p-4 ring-0 dark:border-sky-700 dark:bg-sky-950/40">
        <div className="flex flex-wrap items-center gap-2">
          <HandCoins className="size-4 text-sky-700 dark:text-sky-300" />
          <h4 className="font-heading text-sm font-bold">
            تحصيل من «{partner.companyName}»
            {debtor ? "" : " — تجاوز صريح"}
          </h4>
          <span className="text-xs text-muted-foreground">الوضع الحالي: {text}</span>
          <Link
            href={PATH}
            className="ms-auto inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <X className="size-3" />
            إغلاق
          </Link>
        </div>

        <div className="space-y-2 rounded-lg bg-sky-100 p-3 text-xs leading-relaxed text-sky-900 dark:bg-sky-950 dark:text-sky-100">
          {debtor ? (
            <>
              <p>
                هذا الشريك <span className="font-semibold">مدين لنا</span> بـ{" "}
                <Money value={partner.owedToUs} currency={currency} /> لأنه قبض من
                العملاء أكثر من مستحقه. الاتجاه اختير من صافي تسويته لا باليد —{" "}
                <span className="font-semibold">لا نموذج دفع هنا</span>، فالدفع لمن عليه
                لنا هو الخطأ الذي وُجدت هذه الشاشة لمنعه.
              </p>
              <p>
                المبلغ مبدوء بالدين كاملاً، و
                <span className="font-semibold">الجزئي مقبول</span> — سجّل ما قبضته فعلاً
                ويبقى الباقي ظاهراً في الصافي. وإن سلّم أكثر من دينه فسجّل ما سلّمه:
                ينقلب الصافي إلى «له علينا» وهذا صحيح، ولا يُقصّ ما تكتبه هنا على الدين
                أبداً.
              </p>
              <p className="opacity-90">
                وإن كنت تريد <span className="font-semibold">الدفع له</span> رغم ذلك —
                مقدَّماً متفقاً عليه عن رحلات قادمة —{" "}
                <Link href={advanceHref} className="font-semibold underline">
                  فسجّلها مقدَّماً صريحاً…
                </Link>{" "}
                خطوة تأكيد منفصلة، وسببها إلزامي ويبقى في الدفتر.
              </p>
            </>
          ) : (
            <>
              <p>
                <span className="font-semibold">لسنا نطالب هذا الشريك بشيء</span> —
                وضعه الآن: {text}. وأنت هنا بخطوة تأكيد صريحة لتسجيل مالٍ{" "}
                <span className="font-semibold">يردّه هو إلينا</span>: زيادةً قبضها من
                عميل، أو تصحيحاً لفاتورة بعد اكتشاف خطأ فيها.
              </p>
              <p>
                المبلغ فارغ عمداً — لا دين يُبدأ به، فاكتب ما استلمته فعلاً ولا شيء
                غيره. وسيُقيَّد بدور <code dir="ltr">received</code> كأي تحصيل: يرفع
                رصيد الحساب المختار، ويحرّك الصافي في اتجاهنا بمقداره — فينقص ما له
                علينا أو ينقلب إلى «عليه لنا» إن جاوزه. وهذا هو المطلوب لا عطبٌ فيه.
              </p>
              <p className="opacity-90">
                وإن كنت تقصد <span className="font-semibold">الدفع له</span> لا التحصيل
                منه، فـ
                <Link href={payoutHref} className="font-semibold underline">
                  عُد إلى نموذج الدفع
                </Link>{" "}
                — هو الفرع الافتراضي لهذا الشريك، ولا تحتاج فيه إلى أي تأكيد.
              </p>
            </>
          )}
        </div>

        {notMigrated && (
          <p className="flex items-start gap-2 rounded-lg bg-amber-100 p-3 text-xs leading-relaxed text-amber-900 dark:bg-amber-950 dark:text-amber-100">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>
              عمود <code dir="ltr">received</code> غير موجود في{" "}
              <code dir="ltr">v_partner_settlements</code> — أي أن هجرة{" "}
              <code dir="ltr">0029</code> لم تُنفَّذ على هذه القاعدة بعد، وسيُرفض الحفظ
              برسالة تقول ذلك. نفِّذ الهجرة من <code dir="ltr">supabase/migrations</code>{" "}
              ثم أعد المحاولة.
            </span>
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <AccountField
            id={f("account")}
            name="account"
            accounts={accounts}
            defaultValue={chosen}
            disabled={readOnly}
            label="الحساب الوارد إليه"
            help="الحساب الذي دخله المال فعلاً: درج الكاش إن سلّمه نقداً، أو المحفظة/انستا باي/البنك إن حوّله. رصيد هذا الحساب هو ما سيرتفع بالمبلغ."
          />
          <AmountField
            id={f("amount")}
            currency={currency}
            disabled={readOnly}
            defaultValue={carried.amount ?? owedDefault}
            label={`المبلغ المُحصَّل (${currency})`}
            help={
              debtor
                ? "مبدوء بما عليه كاملاً. عدّله إلى ما قبضته فعلاً — التسديد على دفعات هو العرف لا الاستثناء، ولا تُقرَّب الأرقام لإغلاق الحساب."
                : "فارغ عمداً — لا دين يُبدأ به هنا. اكتب ما استلمته فعلاً بالقرش، فقيدٌ بمبلغ لم يصل خزينتنا أسوأ من رقم يبدو غريباً في الشاشة."
            }
          />
          <OccurredAtField
            id={f("date")}
            today={today}
            defaultValue={carried.at}
            disabled={readOnly}
            label="تاريخ التحصيل"
            help="اليوم الذي وصل فيه المال فعلاً — عليه يقع القيد في الدفتر وفي كشف حسابه."
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={f("reference")} className="flex items-center gap-1.5">
              مرجع العملية
              {rule === "required" && (
                <span className="text-xs font-normal text-red-700 dark:text-red-300">
                  — إلزامي
                </span>
              )}
              <HelpTip>
                رقم التحويل أو معرّف العملية كما يظهر في إشعار المحفظة أو انستا باي أو
                كشف البنك. <span className="font-semibold">به وحده</span> يُطابَق هذا
                القيد مع كشف الحساب البنكي بعد شهور، ولذلك تفرضه قاعدة البيانات على كل
                حساب غير نقدي. النقدية لا تُنتج رقماً فتُترك بلا مرجع.
              </HelpTip>
            </Label>
            <input
              id={f("reference")}
              name="reference"
              dir="ltr"
              maxLength={120}
              required={rule === "required"}
              disabled={readOnly}
              defaultValue={carried.reference}
              placeholder={rule === "optional" ? "اختياري" : "رقم التحويل / معرّف العملية"}
              className={controlClass}
            />
            <p className="flex items-start gap-1.5 text-xs leading-relaxed text-muted-foreground">
              <HelpCircle className="mt-0.5 size-3.5 shrink-0" />
              <span>
                {REFERENCE_NOTE[rule]}
                {chosen && rule !== "conditional" ? (
                  <>
                    {" "}
                    الحساب المختار:{" "}
                    <span className="font-medium text-foreground">
                      {accountKindLabel(accounts.find((a) => a.id === chosen)?.kind ?? null)}
                    </span>
                    .
                  </>
                ) : null}
              </span>
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={f("note")} className="flex items-center gap-1.5">
              ملاحظة
              <HelpTip>
                {debtor ? (
                  <>
                    اختيارية ومفيدة: «سداد رحلات يوليو» أو «سلّمها بمقر الشركة». تظهر في
                    كشف حساب المتعهد وفي دفتر الخزينة بجوار القيد.
                  </>
                ) : (
                  <>
                    {/*
                      اختيارية في القاعدة فاختيارية هنا — الواجهة لا تحرس أكثر مما
                      تحرسه `record_partner_settlement`. لكنها في هذا المسار تحديداً
                      هي ما يفسّر بعد شهور لماذا دخل مالٌ من شريك لم يكن مديناً.
                    */}
                    اختيارية في النظام، <span className="font-semibold">ولازمة عملياً
                    هنا</span>: هذا تحصيل من شريك لم يكن مديناً لنا، فبلا سطر يقول
                    سببه — «ردّ زيادة قبضها في رحلة كذا» أو «تصحيح فاتورة رقم كذا» —
                    لن يعرف أحد بعد شهور لماذا دخل هذا المبلغ. تظهر في كشف حسابه وفي
                    دفتر الخزينة بجوار القيد.
                  </>
                )}
              </HelpTip>
            </Label>
            <input
              id={f("note")}
              name="note"
              maxLength={500}
              disabled={readOnly}
              className={controlClass}
            />
          </div>
        </div>

        <div className="flex justify-end">
          <Button type="submit" size="sm" disabled={readOnly}>
            تسجيل التحصيل
          </Button>
        </div>
      </Card>
    </form>
  );
}

/**
 * صافٍ تعذّرت قراءته ⇒ **لا اتجاه**.
 *
 * اختيار اتجاه من رقم مجهول هو بالضبط ما يُنتج دفعةً لمتعهد مدين. فالبطاقة تقول
 * ما لا نعرفه بدل أن تفترض «صفر» أو «له علينا» — وهي نفس قاعدة «—» لا «٠» التي
 * تحكم كل أرقام هذه الشاشة.
 */
export function UnknownDirectionCard({ partner }: { partner: Settlement }) {
  return (
    <Card className="flex flex-row items-start gap-3 border-amber-300 bg-amber-50 p-4 text-amber-900 ring-0 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
      <AlertTriangle className="mt-0.5 size-5 shrink-0" />
      <div className="space-y-1 text-sm leading-relaxed">
        <p className="font-semibold">
          تعذّرت قراءة صافي «{partner.companyName}» — فلا تسوية من هنا الآن
        </p>
        <p>
          اتجاه التسوية يُشتق من عمود <code dir="ltr">net_due</code> في{" "}
          <code dir="ltr">v_partner_settlements</code>، وهو غير مقروء لهذا الصف. ولن
          تختار الشاشة اتجاهاً بالتخمين: دفعةٌ لمتعهد مدين لنا هي بالضبط ما وُجد هذا
          المدخل الموحّد ليمنعه.
        </p>
        <p>
          أعد تحميل الصفحة؛ فإن بقي الحال فتأكد أن هجرة المالية منفَّذة وأنك مسجَّل
          الدخول بحساب دوره <code dir="ltr">admin</code>.
        </p>
        <Link href={PATH} className="inline-flex items-center gap-1 underline">
          <X className="size-3" />
          إغلاق
        </Link>
      </div>
    </Card>
  );
}

/**
 * قراءة **المبلغ** العائد في الرابط بعد الحفظ.
 *
 * **ليست حساباً**: الرقم كتبته `record_partner_settlement` ومرّرته الإجراءات كما
 * هو، وهذه الدالة تفكّ النص لتُنسّقه بعملة الشاشة. وغير الرقمي يصير `null` فتظهر
 * «—» — لا صفر مخترَع.
 */
const toMoney = (raw: string | undefined | null): number | null => {
  if (typeof raw !== "string" || raw.trim() === "") return null;
  const n = Number(raw.trim());
  return Number.isFinite(n) ? n : null;
};

/**
 * إيصال ما بعد التحصيل — ثلاثة أرقام، **ولكلٍّ منها مصدره لا الرابط**.
 *
 *   المبلغ المُسجَّل  ← الرابط (‏`amt`)، وهو ما كتبه المشرف للتوّ ولا مصدر ثانٍ له
 *   الصافي الجديد   ← صف `v_partner_settlements` الذي حمّلته الصفحة أصلاً
 *   رصيد الحساب     ← `v_account_balances` بقراءة لا تقع إلا مع هذا الإيصال
 *
 * وكان الأخيران يسافران في الرابط أيضاً (‏`net=` و`bal=`) — أي أن **رصيد خزينة
 * الشركة كاملاً** كان يستقر في تاريخ المتصفح وسجلات الخادم وترويسة `Referer` لأي
 * رابط خارجي يُنقر بعده. وحذفهما لم يُفقد شيئاً: القراءة تقع بعد `revalidatePath`
 * فتعطي أحدث رقم لا صورةً من لحظة الحفظ. ولا يُحسب رقمٌ هنا بحال.
 */
export function SettlementReceipt({
  partnerName,
  accountLabel,
  amount,
  netDue,
  absNetDue,
  balance,
  currency,
}: {
  partnerName: string | null;
  accountLabel: string | null;
  /** نص من الرابط — `passThrough` مرّره كما أرجعته القاعدة */
  amount: string | undefined;
  /** `net_due` من صف العرض بعد القيد — `null` = تعذّرت قراءة الصف */
  netDue: number | null;
  /** `abs_net_due` من الصف نفسه، فلا تحسب الصياغة قيمة مطلقة */
  absNetDue: number | null;
  /** `balance` من `v_account_balances` — `null` = تعذّرت القراءة، فـ«—» */
  balance: number | null;
  currency: string;
}) {
  return (
    <Card className="gap-3 border-emerald-300 bg-emerald-50 p-4 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-100">
      <div className="flex flex-wrap items-center gap-2">
        <CheckCircle2 className="size-5 shrink-0" />
        <p className="text-sm font-semibold">
          سُجّل التحصيل{partnerName ? ` من «${partnerName}»` : ""} — قيدٌ واحد رفع
          الخزينة وأنقص الدين معاً.
        </p>
      </div>

      <div className="grid gap-3 text-sm sm:grid-cols-3">
        <div>
          <span className="block text-xs opacity-80">المبلغ المُسجَّل</span>
          <Money value={toMoney(amount)} currency={currency} className="font-semibold" />
        </div>
        <div>
          <span className="block text-xs opacity-80">
            رصيد {accountLabel ?? "الحساب"} الآن
          </span>
          <Money value={balance} currency={currency} className="font-semibold" />
        </div>
        <div>
          <span className="block text-xs opacity-80">الصافي الجديد</span>
          {/* الوسم من نفس دالة الصياغة التي تحكم الجدول — لا نصّ ثانٍ ينحرف عنه */}
          <SettlementBadge
            netDue={netDue}
            absNetDue={absNetDue}
            currency={currency}
            withHint={false}
          />
        </div>
      </div>

      <p className="text-xs leading-relaxed opacity-80">
        المبلغ كما أرجعته <code dir="ltr">record_partner_settlement</code> لحظة الحفظ،
        والصافي والرصيد قراءةٌ حيّة من <code dir="ltr">v_partner_settlements</code> و
        <code dir="ltr">v_account_balances</code> بعد القيد — لم يُحسب منها شيء في هذه
        الشاشة، ولا يسافر رقمٌ منها في الرابط.
      </p>
    </Card>
  );
}
