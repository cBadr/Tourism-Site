import Link from "next/link";
import { HandCoins, ShieldAlert, X } from "lucide-react";

import { HelpTip } from "@/components/shared/HelpTip";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { controlClass } from "../../../orders/_components/booking-ui";
import {
  AccountField,
  AmountField,
  hrefWith,
  Money,
  OccurredAtField,
  settlementWording,
  type TreasuryAccount,
} from "../../_components/finance-ui";
import { recordPartnerPayout, recordPartnerPayoutAdvance } from "../actions";

/**
 * نموذجا الدفع لمتعهد: الدفعة العادية، والمقدَّم الصريح خلف خطوة تأكيد.
 *
 * خطوة التأكيد على نمط إلغاء الحجز في `app/admin/orders/[id]`: الحالة كلها في
 * الـ query string (‏`?pay=<id>&confirm=advance`) ولا `useState` ولا مكوّن عميل —
 * فالرابط قابل للتحديث والمشاركة، والنموذج يعمل بجافاسكربت معطّل.
 *
 * ولا رقم يُحسب في هذا الملف: «عليه لنا» يصل من عمود `owed_to_us` في
 * `v_partner_settlements`، وهو **نفسه** ما تقرؤه `partner_debt()` عند المنع —
 * فما يراه المشرف هو حرفياً ما تبني عليه القاعدة رفضها.
 */

const PATH = "/admin/finance/partners";

export type Settlement = {
  subcontractorId: string;
  companyName: string;
  earned: number | null;
  collected: number | null;
  paid: number | null;
  netDue: number | null;
  absNetDue: number | null;
  tripsCount: number | null;
  /** `owed_to_us` — ما على المتعهد لنا (0027) */
  owedToUs: number | null;
  /**
   * `over_limit` — **بلوغ السقف وحده** (0027). العرض لا يقرأ `block_dispatch`،
   * فالوسم يظهر ولو كان الحجب مطفأً. وهل توقّف الإسناد فعلاً حكمٌ آخر لا يُقرأ
   * في هذا النموذج أصلاً — لا جملة إسناد فيه.
   */
  overLimit: boolean | null;
};

/** قيم يعيدها الإجراء في الرابط بعد رفض، فلا يعيد المشرف كتابتها */
export type CarriedValues = {
  account?: string;
  amount?: string;
  at?: string;
};

/** الحساب المُعاد من الرابط لا يُقبل إلا إن كان ما زال في القائمة */
const keptAccount = (accounts: TreasuryAccount[], value: string | undefined) =>
  value && accounts.some((a) => a.id === value) ? value : undefined;

export function PayoutForm({
  partner,
  accounts,
  currency,
  today,
  readOnly,
  blockPayout,
  carried,
}: {
  partner: Settlement;
  accounts: TreasuryAccount[];
  currency: string;
  today: string;
  readOnly: boolean;
  /** «منع الدفع لمدين» مفعّل في `partner_credit_settings` */
  blockPayout: boolean;
  carried: CarriedValues;
}) {
  // `blockDispatch: null` عمداً: هذا النموذج يقرأ النبرة والنص المختصر وحدهما
  // (‏`tone` و`text`)، ولا يطبع جملة عن توقّف الإسناد — ومنعُ الدفع لا صلة له
  // بمفتاح الحجب أصلاً: حارسه يقرأ `partner_debt(p_sub) > 0` بلا نظر إلى السقف.
  const { tone, text } = settlementWording(partner.netDue, partner.absNetDue, currency, {
    owedToUs: partner.owedToUs,
    overLimit: partner.overLimit,
    blockDispatch: null,
  });
  const f = (name: string) => `pay-${partner.subcontractorId}-${name}`;

  /**
   * هل سترفض القاعدة هذه الدفعة؟
   *
   * المنع في `record_partner_payout` يقع على `partner_debt(p_sub) > 0` — أي على
   * **أي دين مهما صغر** ولا يقرأ `debt_limit` إطلاقاً. لذلك الشرط هنا هو إشارة
   * الصافي لا بلوغ السقف: ربط التحذير بالسقف كان سيجعل الشاشة تَعِد بقبولٍ ترفضه
   * القاعدة في نصف الحالات.
   */
  const wouldRefuse = tone === "they-owe" && blockPayout;

  const advanceHref = hrefWith(PATH, {
    pay: partner.subcontractorId,
    confirm: "advance",
    account: carried.account,
    amount: carried.amount,
    at: carried.at,
  });

  return (
    <form action={readOnly ? undefined : recordPartnerPayout}>
      <input type="hidden" name="subcontractor" value={partner.subcontractorId} />
      <Card className="gap-4 border-primary/40 bg-primary/5 p-4 ring-0">
        <div className="flex flex-wrap items-center gap-2">
          <HandCoins className="size-4 text-primary" />
          <h4 className="font-heading text-sm font-bold">
            تسجيل دفعة لـ «{partner.companyName}»
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

        {tone === "they-owe" && (
          <div
            className={
              wouldRefuse
                ? "space-y-2 rounded-lg bg-red-100 p-3 text-xs leading-relaxed text-red-900 dark:bg-red-950 dark:text-red-100"
                : "space-y-2 rounded-lg bg-amber-100 p-3 text-xs leading-relaxed text-amber-900 dark:bg-amber-950 dark:text-amber-100"
            }
          >
            <p>
              هذا الشريك <span className="font-semibold">مدين لنا</span> بـ{" "}
              <Money value={partner.owedToUs} currency={currency} /> لأنه قبض من العملاء
              أكثر من مستحقه.
            </p>
            {wouldRefuse ? (
              <>
                <p>
                  <span className="font-semibold">
                    ستُرفض هذه الدفعة في قاعدة البيانات
                  </span>{" "}
                  ما دام «منع الدفع لمدين» مفعّلاً في بطاقة سقف الديون أعلاه. حصّل منه
                  الرصيد أولاً، أو أطفئ المنع، أو سجّلها مقدَّماً صريحاً بسبب مكتوب.
                </p>
                <p>
                  <Link href={advanceHref} className="font-semibold underline">
                    تسجيلها مقدَّماً صريحاً…
                  </Link>{" "}
                  — خطوة تأكيد منفصلة، والسبب فيها إلزامي ويبقى في الدفتر.
                </p>
              </>
            ) : (
              <p>
                «منع الدفع لمدين» مطفأ حالياً، فستُقبل الدفعة وتزيد ما لنا عنده — وهو
                تصرف صحيح فقط إن كنت تدفع مقدماً عن رحلات قادمة.
              </p>
            )}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <AccountField
            id={f("account")}
            name="account"
            accounts={accounts}
            defaultValue={keptAccount(accounts, carried.account)}
            disabled={readOnly}
            label="الحساب المنصرف منه"
            help="الحساب الذي خرج منه المال فعلاً — درج الكاش عادةً في التسويات النقدية."
          />
          <AmountField
            id={f("amount")}
            currency={currency}
            disabled={readOnly}
            defaultValue={carried.amount}
            label={`المبلغ المدفوع (${currency})`}
            help="الدفعة الجزئية مسموحة: سجّل ما دفعته فعلاً، ويبقى الباقي ظاهراً في الصافي. لا تُقرَّب الأرقام لتُغلق الحساب."
          />
          <OccurredAtField
            id={f("date")}
            today={today}
            defaultValue={carried.at}
            disabled={readOnly}
            label="تاريخ الدفع"
            help="اليوم الذي سلّمت فيه المبلغ فعلاً — عليه يقع القيد في الدفتر."
          />
          <div className="space-y-1.5">
            <Label htmlFor={f("note")} className="flex items-center gap-1.5">
              ملاحظة
              <HelpTip>
                اختيارية لكنها مفيدة: «تسوية رحلات أغسطس» أو «سُلّمت نقداً بمقر الشركة».
                تظهر في كشف حساب المتعهد وفي دفتر الخزينة.
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
            تسجيل الدفعة
          </Button>
        </div>
      </Card>
    </form>
  );
}

/**
 * بطاقة المقدَّم الصريح — الخطوة الثانية بعد `?confirm=advance`.
 *
 * تستدعي `record_partner_payout_advance` التي ترفع `tours.allow_partner_advance`
 * لمعاملتها وحدها ثم تنادي `record_partner_payout` نفسها. أي أن الدفعة تُقيَّد
 * بنفس القيد وبنفس الأثر المحاسبي تماماً — الفارق الوحيد أن حارساً واحداً رُفع
 * بقرار بشري مكتوب. هذا هو نمط `manual_assign_with_loss` بحذافيره.
 */
export function AdvancePayoutForm({
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
  const f = (name: string) => `adv-${partner.subcontractorId}-${name}`;

  return (
    <form action={readOnly ? undefined : recordPartnerPayoutAdvance}>
      <input type="hidden" name="subcontractor" value={partner.subcontractorId} />
      <Card className="gap-4 border-red-300 bg-red-50 p-4 ring-0 dark:border-red-700 dark:bg-red-950">
        <div className="flex flex-wrap items-center gap-2">
          <ShieldAlert className="size-4 text-red-700 dark:text-red-300" />
          <h4 className="font-heading text-sm font-bold text-red-900 dark:text-red-100">
            تأكيد مقدَّم صريح لـ «{partner.companyName}»
          </h4>
          <Link
            href={hrefWith(PATH, { pay: partner.subcontractorId })}
            className="ms-auto inline-flex items-center gap-1 text-xs text-red-900/80 hover:text-red-900 dark:text-red-100/80 dark:hover:text-red-100"
          >
            <X className="size-3" />
            تراجع
          </Link>
        </div>

        <p className="text-xs leading-relaxed text-red-900/90 dark:text-red-100/90">
          هذا الشريك مدين لنا بـ <Money value={partner.owedToUs} currency={currency} />،
          و«منع الدفع لمدين» مفعّل. المتابعة هنا{" "}
          <span className="font-semibold">ترفع المنع لهذه الدفعة وحدها</span> وتقيّدها في
          الدفتر كأي دفعة أخرى — فتزيد ما لنا عنده بمقدار المبلغ. لا تفعلها إلا إن كان
          المبلغ مقدَّماً متفقاً عليه عن رحلات قادمة، واكتب ذلك في السبب.
        </p>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <AccountField
            id={f("account")}
            name="account"
            accounts={accounts}
            defaultValue={keptAccount(accounts, carried.account)}
            disabled={readOnly}
            label="الحساب المنصرف منه"
            help="الحساب الذي خرج منه المال فعلاً — درج الكاش عادةً في التسويات النقدية."
          />
          <AmountField
            id={f("amount")}
            currency={currency}
            disabled={readOnly}
            defaultValue={carried.amount}
            label={`المبلغ المدفوع (${currency})`}
            help="ما سلّمته فعلاً. المقدَّم لا يقلّ ولا يزيد بحكم النظام — الرقم قرارك أنت وتحمله معك في الدفتر."
          />
          <OccurredAtField
            id={f("date")}
            today={today}
            defaultValue={carried.at}
            disabled={readOnly}
            label="تاريخ الدفع"
            help="اليوم الذي سلّمت فيه المبلغ فعلاً — عليه يقع القيد في الدفتر."
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={f("note")} className="flex items-center gap-1.5">
            سبب المقدَّم — إلزامي
            <HelpTip>
              إلزامي في الشاشة وفي قاعدة البيانات معاً: مقدَّمٌ بلا سبب مكتوب هو بالضبط
              ما يفسد الدفاتر بعد ستة أشهر حين لا يتذكر أحد لماذا دُفع. مثال: «مقدَّم
              متفق عليه عن رحلتي الأقصر يومي ٥ و٧».
            </HelpTip>
          </Label>
          <input
            id={f("note")}
            name="note"
            required
            minLength={4}
            maxLength={500}
            disabled={readOnly}
            placeholder="لماذا يُدفع لمتعهد مدين لنا؟"
            className={controlClass}
          />
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3">
          <Link
            href={hrefWith(PATH, { pay: partner.subcontractorId })}
            className="text-xs text-red-900/80 underline hover:text-red-900 dark:text-red-100/80 dark:hover:text-red-100"
          >
            العودة إلى الدفعة العادية
          </Link>
          <Button type="submit" size="sm" variant="destructive" disabled={readOnly}>
            تأكيد تسجيل المقدَّم
          </Button>
        </div>
      </Card>
    </form>
  );
}
