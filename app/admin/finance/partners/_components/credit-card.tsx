import { ShieldAlert } from "lucide-react";

import { HelpTip } from "@/components/shared/HelpTip";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Money, type PartnerCreditState } from "../../_components/finance-ui";
import { savePartnerCreditSettings } from "../actions";

/**
 * بطاقة سقف ديون المتعهدين (الملاحظة ١٧ — هجرة 0027).
 *
 * ثلاثة مفاتيح لا مفتاح واحد، ولكلٍّ أثر مختلف تماماً — والخلط بينها هو ما
 * سيجعل المالك يظن أنه أطفأ الميزة وهي عاملة:
 *
 *   `debt_limit`     — مبلغٌ يقارَن به الدين. **صفر = بلا سقف**، فيتعطّل الحجب.
 *   `block_dispatch` — يمنع العروض والفوز عمن بلغ السقف. يقرأ `debt_limit`.
 *   `block_payout`   — يمنع الدفع لمن رصيده سالب. **لا يقرأ `debt_limit` أصلاً**،
 *                      فهو نافذ حتى والسقف صفر، وعلى أي دين مهما صغر.
 *
 * ومفتاح `block_dispatch` **لا يحكم الوسم**: عمود `over_limit` في
 * `v_partner_settlements` يقيس بلوغ السقف وحده ولا يقرأ المفتاح (نصّ الهجرة عند
 * تعريف العرض). فإطفاء الحجب يوقف الحجب ولا يُخفي من بلغ السقف عن الشاشات —
 * وفقدان رؤيتهم أسوأ من عدم حجبهم.
 *
 * ولذلك تكتب البطاقة أثر الإعداد الحالي بجملة صريحة تحت الحقول بدل أن تترك
 * المالك يستنتجه من ثلاثة مفاتيح متجاورة.
 *
 * كل الأرقام هنا **مدخلات تُخزَّن كما كُتبت**: لا مقارنة ولا جمع ولا تقريب في
 * هذا الملف — المقارنة كلها في `partner_over_debt_limit()` و`v_partner_settlements`.
 */

export function PartnerCreditCard({
  state,
  currency,
  wired,
}: {
  state: PartnerCreditState;
  currency: string;
  /** متغيرات البيئة مضبوطة — بدونها لا كتابة أصلاً */
  wired: boolean;
}) {
  const { settings, missing } = state;
  const readOnly = !wired || missing;

  const ceilingOn = settings.debtLimit > 0;
  const dispatchBlocked = ceilingOn && settings.blockDispatch;

  return (
    <Card className="gap-4 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="flex items-center gap-1.5 font-heading text-base font-bold">
          <ShieldAlert className="size-4 text-primary" />
          سقف ديون المتعهدين
        </h3>
        <HelpTip>
          المتعهد يقبض من عملائنا نقداً، فقد يتراكم عنده مالنا حتى يصير الحساب معه
          خطراً. هذه البطاقة تضبط متى نتوقف عن إسناد رحلات جديدة إليه، ومتى نمتنع عن
          الدفع له. القرار كله يُنفَّذ في قاعدة البيانات — لا في هذه الشاشة.
        </HelpTip>
      </div>

      {missing && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm leading-relaxed text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
          جدول <code dir="ltr">partner_credit_settings</code> غير موجود — نفِّذ هجرة{" "}
          <code dir="ltr">0027</code> من <code dir="ltr">supabase/migrations</code> ثم أعد
          تحميل الصفحة. حتى ذلك الحين لا سقف مفروض ولا منع دفع، وبقية الشاشة تعمل طبيعياً.
        </p>
      )}

      <form action={savePartnerCreditSettings} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="debt_limit" className="flex items-center gap-1.5">
              سقف الدين ({currency})
              <HelpTip>
                أقصى مبلغ يجوز أن يترتب على المتعهد لنا. حين يبلغه يُوسم في شاشات
                المقاصة، ويتوقف عنه بثّ العروض ولا يفوز بقبول{" "}
                <span className="font-semibold">
                  ما دام مفتاح «حجب العروض» بجواره مفعّلاً
                </span>
                .{" "}
                <span className="font-semibold">صفر = بلا سقف</span> فتتعطّل هذه القاعدة
                تماماً.{" "}
                <span className="font-semibold">
                  والرقم يقيس الدين المُثبَت في الدفتر وحده:
                </span>{" "}
                لا يُقيَّد على رحلة شيء قبل تسجيلها «منفَّذة»، فالرحلات الجارية الآن — وما
                سيقبضه المتعهد فيها نقداً — ليست محسوبة فيه بعد.
              </HelpTip>
            </Label>
            <Input
              id="debt_limit"
              name="debt_limit"
              type="number"
              inputMode="decimal"
              dir="ltr"
              step="100"
              min={0}
              required
              disabled={readOnly}
              defaultValue={settings.debtLimit}
            />
            <p className="text-xs text-muted-foreground">
              الحالي:{" "}
              {ceilingOn ? (
                <Money value={settings.debtLimit} currency={currency} />
              ) : (
                <span className="font-medium text-foreground">بلا سقف</span>
              )}
            </p>
          </div>

          <div className="space-y-2">
            <Label className="flex cursor-pointer items-start justify-between gap-3 rounded-lg border border-input p-3 text-sm font-normal">
              <span className="leading-relaxed">
                <span className="font-medium">حجب العروض عمن بلغ السقف</span>
                <span className="block text-muted-foreground">
                  لا يصله عرض جديد ولا يفوز بقبول عرض قديم.
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1.5">
                <HelpTip>
                  يوقف بثّ العروض إلى من بلغ السقف ويمنعه من الفوز بقبول، والمنع في
                  مُشغّل قاعدة البيانات فيغطي الإسناد الآلي واليدوي معاً. إطفاؤه يوقف
                  الحجب وحده ولا يمسّ ما عداه:{" "}
                  <span className="font-semibold">
                    وسم «بلغ سقف الدين» يبقى ظاهراً في شاشات المقاصة
                  </span>{" "}
                  على من بلغه — عمداً، كي لا يغيب عنك المتجاوزون بمجرد إطفاء الحجب —
                  ومنع الدفع لمدين يبقى نافذاً لأنه لا يقرأ السقف أصلاً. والتجاوز البشري
                  لرحلة بعينها يبقى ممكناً من شاشة الطلب بسبب مكتوب.
                </HelpTip>
                <input
                  type="checkbox"
                  name="block_dispatch"
                  defaultChecked={settings.blockDispatch}
                  disabled={readOnly}
                  className="size-5 accent-primary"
                />
              </span>
            </Label>

            <Label className="flex cursor-pointer items-start justify-between gap-3 rounded-lg border border-input p-3 text-sm font-normal">
              <span className="leading-relaxed">
                <span className="font-medium">منع الدفع لمتعهد مدين لنا</span>
                <span className="block text-muted-foreground">
                  يُرفض تسجيل أي دفعة له حتى يُسدَّد ما عليه.
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1.5">
                <HelpTip>
                  يمنع تسجيل دفعة لمتعهد رصيده سالب.{" "}
                  <span className="font-semibold">لا علاقة له بقيمة السقف:</span> الرفض
                  يقع على أي دين مهما صغر، وحتى لو كان السقف صفراً. ومن أراد الدفع رغم
                  ذلك يسجّلها «مقدَّماً صريحاً» بسبب مكتوب من نموذج الدفع نفسه، فيبقى
                  القرار بشرياً موثَّقاً في الدفتر لا التفافاً صامتاً.
                </HelpTip>
                <input
                  type="checkbox"
                  name="block_payout"
                  defaultChecked={settings.blockPayout}
                  disabled={readOnly}
                  className="size-5 accent-primary"
                />
              </span>
            </Label>
          </div>
        </div>

        {/*
          أثر الإعداد الحالي بجملة واحدة — لا يُترك للمالك أن يستنتجه من مفتاحين.
          ولا تُكتب هذه الجملة إطلاقاً قبل تنفيذ الهجرة: القيم حينها افتراضيات
          العقد لا صفٌّ مقروء، فجملة «تُرفض أي دفعة…» تكون ادعاء إنفاذٍ لا وجود له.
        */}
        {!missing && (
          <p className="rounded-lg bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground">المفعَّل الآن: </span>
            {dispatchBlocked ? (
              <>
                يتوقف الإسناد إلى المتعهد متى بلغ دينه{" "}
                <Money value={settings.debtLimit} currency={currency} />.
              </>
            ) : ceilingOn ? (
              <>
                السقف مكتوب لكن حجب العروض مطفأ — لا يتوقف الإسناد عن أحد، ويبقى وسم
                «بلغ سقف الدين» ظاهراً على من بلغه في شاشات المقاصة كي تراه وتقرر فيه.
              </>
            ) : (
              <>لا سقف مفروض — الإسناد مفتوح لكل متعهد مهما بلغ دينه.</>
            )}{" "}
            {settings.blockPayout ? (
              <>
                وتُرفض أي دفعة لمتعهد رصيده سالب مهما صغر المبلغ (بلا نظر إلى السقف)،
                ويبقى «المقدَّم الصريح» بسبب مكتوب هو المخرج الوحيد.
              </>
            ) : (
              <>والدفع لمتعهد مدين لنا مسموح بلا اعتراض.</>
            )}
          </p>
        )}

        <div className="flex justify-end">
          <Button type="submit" size="sm" disabled={readOnly}>
            حفظ سقف الديون
          </Button>
        </div>
      </form>
    </Card>
  );
}
