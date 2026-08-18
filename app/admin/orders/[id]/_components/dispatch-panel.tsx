import type { ReactNode } from "react";
import Link from "next/link";
import { Megaphone, RefreshCw, Send, ShieldAlert, UserCheck } from "lucide-react";

import { formatMoney, toArabicDigits } from "@/components/booking/format";
import { HelpTip } from "@/components/shared/HelpTip";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { readDispatchSettings } from "@/lib/dispatch/settings";
import { DEFAULT_DISPATCH, type DispatchSettings } from "@/lib/dispatch-types";
import { createServerSupabase } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import {
  DISPATCH_STATUS_HINTS,
  DispatchBadge,
  isDispatchStatus,
  MarginPill,
  marginTone,
  OFFER_STATUS_HINTS,
  OfferBadge,
  isOfferStatus,
  readDispatch,
  readOffer,
  realMargin,
  type DispatchView,
  type OfferView,
} from "../../../dispatch/_components/dispatch-ui";
import {
  asText,
  dateTimeLabel,
  pick,
  relativeTime,
} from "../../_components/booking-ui";
import { manualAssign, manualAssignOverLimit, startBroadcast } from "../dispatch-actions";
import { ManualAssignForm, type PartnerOption } from "./manual-assign-form";

/**
 * لوحة الإسناد داخل شاشة الطلب — **سجل البث الكامل** الذي تطلبه الرؤية:
 * من أُشعِر؟ بكم؟ متى؟ ومن ردّ وبماذا؟ ثم أزرار التدخل البشري.
 *
 * ثلاث قواعد تحكم هذه اللوحة:
 * (١) لا قرار هنا. البث والقبول والإسناد كلها دوال Postgres (عقد المرحلة ٦)،
 *     والواجهة تعرض الحالة وتستدعي الدالة وتترجم رسالة الرفض.
 * (٢) لا رقم مخترع. الجداول يملكها وكيل SQL وقد لا تكون منفَّذة بعد — عندها
 *     تظهر اللوحة برسالة الهجرة الناقصة بدل أن تُسقط الصفحة أو تعرض أصفاراً.
 * (٣) الهامش الحقيقي مرئي دائماً. سعر العميل حُسب على **أرخص** متعهد مغطٍّ، وأي
 *     قبول من متعهد أغلى يأكل الهامش — فإخفاء الرقم هنا يعني اكتشاف الخسارة في
 *     تقارير المرحلة ٧ بعد شهر.
 *
 * (٤) **وعلى الورق يبقى منها سطران** (الدفعة ٤ — الملاحظة ٦): من ينفّذ الرحلة،
 *     وبكم. أما دورة البث وسجل عروضها وأزرار التدخل فحوارٌ يجري على الشاشة
 *     وينتهي فيها. والهامش تحديداً **لا يُطبع**: ورقةٌ تُحمل وتُنسى على مكتب لا
 *     يُدسّ فيها رقمٌ لا يقرؤه إلا صاحب المنصة. والحدّ الفاصل مكتوب في ترويسة
 *     الورقة نفسها — انظر تعليق `PrintHeader` في `app/admin/orders/[id]/page.tsx`.
 */

/** سقوف عاقلة: سجل بث لطلب واحد لا أرشيف */
const MAX_OFFERS = 200;
const MAX_PARTNERS = 200;

type Loaded = {
  /** جداول المرحلة ٦ موجودة وقابلة للقراءة */
  ready: boolean;
  dispatch: DispatchView | null;
  offers: OfferView[];
  offersFailed: boolean;
  /** الإعدادات السارية — من نفس قارئ عامل البث، فلا تختلف الشاشة عن المحرّك */
  settings: DispatchSettings;
  /** هل قُرئ صف الإعدادات فعلاً؟ false = القيم المعروضة افتراضية */
  settingsLoaded: boolean;
  partners: PartnerOption[];
  /** اسم شركة كل متعهد ظهر في السجل — لا معرّف خام يُعرض أبداً */
  names: Map<string, string>;
};

const EMPTY: Loaded = {
  ready: false,
  dispatch: null,
  offers: [],
  offersFailed: false,
  settings: DEFAULT_DISPATCH,
  settingsLoaded: false,
  partners: [],
  names: new Map(),
};

/** أسماء شركات المتعهدين الظاهرين في السجل — استعلام واحد بكل المعرّفات */
async function loadNames(
  supabase: NonNullable<Awaited<ReturnType<typeof createServerSupabase>>>,
  ids: string[]
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (ids.length === 0) return out;
  const res = await supabase.from("subcontractors").select("*").in("id", ids);
  if (res.error) return out;
  for (const row of (res.data ?? []) as Record<string, unknown>[]) {
    const id = asText(row.id);
    const name = asText(pick(row, ["company_name", "name", "title"]));
    if (id && name) out.set(id, name);
  }
  return out;
}

async function loadDispatch(bookingId: string): Promise<Loaded> {
  const supabase = await createServerSupabase();
  if (!supabase) return EMPTY;

  const [dispatchRes, offersRes, settingsResult, partnersRes] = await Promise.all([
    supabase.from("dispatches").select("*").eq("booking_id", bookingId).maybeSingle(),
    supabase
      .from("trip_offers")
      .select("*")
      .eq("booking_id", bookingId)
      .order("created_at", { ascending: true })
      .limit(MAX_OFFERS),
    readDispatchSettings(supabase),
    supabase
      .from("subcontractors")
      .select("*")
      .eq("status", "approved")
      .order("company_name", { ascending: true })
      .limit(MAX_PARTNERS),
  ]);

  // خطأ استعلام `dispatches` = هجرة المرحلة ٦ غير منفَّذة (أو لا صلاحية قراءة)
  if (dispatchRes.error) return EMPTY;

  const dispatch = dispatchRes.data
    ? readDispatch(dispatchRes.data as Record<string, unknown>)
    : null;

  const offers = offersRes.error
    ? []
    : ((offersRes.data ?? []) as Record<string, unknown>[]).map(readOffer);

  const partners: PartnerOption[] = partnersRes.error
    ? []
    : ((partnersRes.data ?? []) as Record<string, unknown>[])
        .map((row) => ({
          id: asText(row.id) ?? "",
          label: asText(pick(row, ["company_name", "name", "title"])) ?? "متعهد مسجَّل",
        }))
        .filter((p) => p.id !== "");

  const ids = [
    ...new Set(
      [...offers.map((o) => o.subcontractorId), dispatch?.assignedSubcontractorId ?? null].filter(
        (v): v is string => v !== null
      )
    ),
  ];

  return {
    ready: true,
    dispatch,
    offers,
    offersFailed: Boolean(offersRes.error),
    settings: settingsResult.settings,
    settingsLoaded: settingsResult.loaded,
    partners,
    names: await loadNames(supabase, ids),
  };
}

/** سطر «تسمية ← قيمة» — نفس إيقاع بطاقات الشاشة */
function Field({
  label,
  help,
  className,
  children,
}: {
  label: string;
  help?: string;
  /** `no-print` للسطر الذي لا مكان له على الورق */
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-start justify-between gap-x-4 gap-y-1 border-b border-border py-2 last:border-0",
        className
      )}
    >
      <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
        {label}
        {help ? <HelpTip>{help}</HelpTip> : null}
      </span>
      <span className="min-w-0 text-sm font-medium">{children}</span>
    </div>
  );
}

const numberText = (v: number | null) => (v === null ? "—" : toArabicDigits(v));

export async function DispatchPanel({
  bookingId,
  bookingStatus,
  bookingTotal,
  extrasTotal,
  currency,
  confirmingAssign,
  confirmingOverride,
}: {
  bookingId: string;
  bookingStatus: string;
  /** إجمالي الحجز كما خزّنته `create_booking` — أساس حساب الهامش الحقيقي */
  bookingTotal: number;
  /**
   * مجموع الخدمات الإضافية من لقطة الحجز (‏`trip.extrasTotal`، هجرة 0031).
   * **يُطرح من الإجمالي قبل قياس الهامش**: `total` يحمله منذ 0031، وهو إيرادٌ عن
   * شيء ننفّذه نحن ولا يراه المتعهد — فعدُّه هامشاً يطلي صفقةً تحت الأرضية
   * بالأخضر. نفس ما تفعله القاعدة في `dispatch_ceiling` (0032) وفي `realMargin`
   * داخل إشعار الإسناد (0033). و`null` = حجزٌ سابق للهجرة، أي صفر.
   */
  extrasTotal: number | null;
  currency: string;
  confirmingAssign: boolean;
  /** ‎?confirm=override‎ — خطوة تأكيد الإسناد فوق سقف دين المتعهد */
  confirmingOverride: boolean;
}) {
  const { ready, dispatch, offers, offersFailed, settings, settingsLoaded, partners, names } =
    await loadDispatch(bookingId);

  const status = dispatch?.status ?? null;
  const isAssigned = status === "assigned";
  const stopped = status === "cancelled" || bookingStatus === "cancelled";

  // «ابدأ البث»: صف بث في الطابور، أو حجز مؤكد لم يُفتح له صف بعد (البدء التلقائي مطفأ)
  const canStart =
    ready && !stopped && !isAssigned && (status === "queued" || (status === null && bookingStatus === "confirmed"));
  // «إعادة البث الآن»: يفتح الموجة التالية قبل انتهاء مهلة الحالية
  const canRebroadcast = ready && !stopped && (status === "broadcasting" || status === "manual");
  const canManual = ready && !stopped && !isAssigned;

  const assignedName = dispatch?.assignedSubcontractorId
    ? (names.get(dispatch.assignedSubcontractorId) ?? "متعهد مسجَّل")
    : null;

  const assignedMargin = realMargin(
    bookingTotal,
    dispatch?.assignedPayout ?? null,
    extrasTotal
  );
  const assignedTone = marginTone(assignedMargin, settings.minMarginAmount);

  const statusHint =
    status !== null && isDispatchStatus(status)
      ? DISPATCH_STATUS_HINTS[status]
      : "لم تُفتح دورة بث لهذا الحجز بعد — تُفتح تلقائياً عند تأكيد الدفع إن كان البدء التلقائي مفعّلاً، أو يدوياً من زر «ابدأ البث».";

  return (
    <Card className="space-y-4 p-5" id="dispatch">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="flex items-center gap-1.5 font-heading text-base font-bold">
          <Megaphone className="size-4 text-primary" />
          الإسناد
          <HelpTip>
            بعد تأكيد الحجز يُعرض الطلب على المتعهدين المغطّين للمسار على{" "}
            <span className="font-semibold">موجات</span>: الموجة الأولى لمن تكلفته ≤ التكلفة التي
            سُعِّر بها الطلب (الهامش كامل)، والثانية لمن تكلفته ≤ التكلفة + الهامش (تعادل). وأول
            من يقبل يفوز ويُغلق الطلب أمام الباقين. باستنفاد الموجات يدخل الطلب طابور الإسناد
            اليدوي. ومن بلغ سقف الدين المضبوط في شاشة التسويات لا يصله عرض ولا يفوز بقبول —
            وإسناده يحتاج تجاوزاً صريحاً بسبب مكتوب من زر «إسناد فوق سقف الدين» أدناه.
          </HelpTip>
        </h3>
        <Link
          href="/admin/dispatch"
          className="no-print ms-auto text-xs text-muted-foreground transition-colors hover:text-primary hover:underline"
        >
          إعدادات الإسناد والطابور اليدوي
        </Link>
      </div>

      {!ready ? (
        <p className="no-print text-sm leading-relaxed text-muted-foreground">
          جداول البث (<code dir="ltr">dispatches</code> و<code dir="ltr">trip_offers</code>) غير
          موجودة في قاعدة البيانات بعد — نفِّذ هجرة المرحلة ٦ من{" "}
          <code dir="ltr">supabase/migrations</code> ثم أعد تحميل الصفحة. بقية الشاشة تعمل
          طبيعياً.
        </p>
      ) : (
        <>
          {/* حالة الدورة */}
          <div className="grid gap-x-6 md:grid-cols-2">
            {/* عمود دورة البث للشاشة وحدها: موجةٌ سارية ومهلةٌ تنتهي حالةٌ حيّة
                تتغيّر كل دقيقة، وطباعتها تجمّد لحظة وتوهم القارئ أنها الحاضر */}
            <div className="no-print">
              <Field label="حالة البث" help={statusHint}>
                {status === null ? (
                  <span className="text-muted-foreground">لم يبدأ بعد</span>
                ) : (
                  <DispatchBadge status={status} />
                )}
              </Field>
              <Field
                label="الموجة الحالية"
                help="رقم الموجة الجارية من أصل الحد الأقصى المضبوط في إعدادات الإسناد. كل موجة تُوسّع سقف التكلفة المقبولة، وباستنفادها يتحول الطلب للطابور اليدوي."
              >
                {dispatch?.round == null ? (
                  "—"
                ) : (
                  <span>
                    {numberText(dispatch.round)}
                    <span className="text-muted-foreground">
                      {" "}
                      من {toArabicDigits(settings.maxRounds)}
                    </span>
                  </span>
                )}
              </Field>
              <Field
                label="آخر بث"
                help="لحظة إرسال آخر موجة. المهلة تُحتسب منها، وبانتهائها تتولى دورة الإسناد فتح الموجة التالية أو التصعيد."
              >
                {dispatch?.lastBroadcastAt ? (
                  <span className="text-xs">
                    {dateTimeLabel(dispatch.lastBroadcastAt)} · {relativeTime(dispatch.lastBroadcastAt)}
                  </span>
                ) : (
                  "—"
                )}
              </Field>
            </div>

            <div>
              <Field
                label="المتعهد المنفِّذ"
                help="الفائز الفعلي بالرحلة — بقبوله العرض أو بإسناد يدوي من التشغيل. قد يختلف عن المتعهد الذي سُعِّر به الطلب في بطاقة الربحية."
              >
                {assignedName ?? <span className="text-muted-foreground">لم يُسند بعد</span>}
                {dispatch?.manualAssign && assignedName ? (
                  <span className="ms-1.5 text-xs text-amber-700 dark:text-amber-300">
                    (إسناد يدوي)
                  </span>
                ) : null}
              </Field>
              <Field
                label="مستحق المتعهد"
                help="ما يقبضه المنفِّذ عن الرحلة من قائمة أسعاره هو — لا سعر العميل. في الموجة الثانية قد يفوق التكلفة التي سُعِّر بها الطلب."
              >
                <span dir="ltr">
                  {dispatch?.assignedPayout == null
                    ? "—"
                    : formatMoney(dispatch.assignedPayout, currency)}
                </span>
              </Field>
              {/* لا يُطبع — انظر القرار (٤) في ترويسة هذا الملف */}
              <Field
                className="no-print"
                label="الهامش الحقيقي"
                help={
                  (extrasTotal ?? 0) > 0
                    ? "إجمالي الحجز ناقص الخدمات الإضافية ناقص مستحق المنفِّذ — ربح الموقع الفعلي من هذه الرحلة بعد الإسناد. الخدمات مطروحة لأنها إيراد عن شيء ننفّذه نحن ولا يراه المتعهد، فعدّها هامشاً يُظهر صفقةً ضعيفة الهامش وكأنها سليمة. وهو نفس الرقم الذي ترسله قاعدة البيانات في إشعار الإسناد. الأحمر يعني خسارة، والكهرماني يعني هامشاً دون الأرضية المضبوطة في إعدادات الإسناد."
                    : "إجمالي الحجز ناقص مستحق المنفِّذ — ربح الموقع الفعلي من هذه الرحلة بعد الإسناد (ولا خدمات إضافية في هذا الحجز تُطرح منه). الأحمر يعني خسارة، والكهرماني يعني هامشاً دون الأرضية المضبوطة في إعدادات الإسناد."
                }
              >
                <MarginPill
                  margin={assignedMargin}
                  floor={settings.minMarginAmount}
                  currency={currency}
                />
              </Field>
            </div>
          </div>

          {assignedTone === "loss" && (
            <p className="no-print rounded-lg border border-red-300 bg-red-50 p-3 text-sm leading-relaxed font-medium text-red-900 dark:border-red-700 dark:bg-red-950 dark:text-red-100">
              هذه الرحلة خسارة: مستحق المتعهد يفوق ما دفعه العميل. راجع سبب الإسناد وقائمة أسعار
              الشريك — وإن تكرر الأمر فارفع الهامش أو أرضيته من شاشتي التسعير والإسناد.
            </p>
          )}
          {assignedTone === "thin" && (
            <p className="no-print rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm leading-relaxed text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
              الهامش الحقيقي لهذه الرحلة دون الأرضية المضبوطة في إعدادات الإسناد — مقبول كقرار
              واعٍ، لكنه ليس الوضع الطبيعي.
            </p>
          )}

          {/*
            سجل العروض — من أُشعر ومتى وبكم وبماذا ردّ.
            `no-print` كاملاً: هو سجل تدقيق يُقرأ بحثاً عن سببٍ حين يُسأل «لماذا
            هذا المتعهد؟»، وفيه مستحق **كل** مرشّح وهامشه — أي خريطة أسعار
            الشركاء كلها في ورقة واحدة.
          */}
          <div className="no-print space-y-2">
            <p className="flex items-center gap-1.5 text-sm font-medium">
              سجل العروض
              <HelpTip>
                كل صف هنا عرضٌ بُثَّ على متعهد بعينه بمستحقه هو. هذا سجل التدقيق: لا يُحذف ولا
                يُعدَّل، ويُقرأ من أسفل لأعلى لتتبع ما جرى في كل موجة. المتعهد لا يرى إلا عرضه هو
                ولا يرى سعر العميل إطلاقاً.
              </HelpTip>
            </p>

            {offersFailed ? (
              <p className="text-sm text-muted-foreground">
                تعذّرت قراءة سجل العروض — تأكد أن جدول <code dir="ltr">trip_offers</code> منفَّذ في
                قاعدة البيانات (هجرة المرحلة ٦).
              </p>
            ) : offers.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                لم يُبث أي عرض على هذا الطلب بعد.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[52rem] text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs text-muted-foreground">
                      <th className="p-2 text-start font-medium">المتعهد</th>
                      <th className="p-2 text-start font-medium">الموجة</th>
                      <th className="p-2 text-start font-medium">المستحق</th>
                      <th className="p-2 text-start font-medium">الهامش</th>
                      <th className="p-2 text-start font-medium">الحالة</th>
                      <th className="p-2 text-start font-medium">بُثَّ</th>
                      <th className="p-2 text-start font-medium">ردّ</th>
                      <th className="p-2 text-start font-medium">السبب</th>
                    </tr>
                  </thead>
                  <tbody>
                    {offers.map((offer) => {
                      const margin = realMargin(bookingTotal, offer.payout, extrasTotal);
                      return (
                        <tr
                          key={offer.key}
                          className={cn(
                            "border-b border-border align-top last:border-0",
                            offer.status === "accepted" && "bg-emerald-50/60 dark:bg-emerald-950/30"
                          )}
                        >
                          <td className="p-2 font-medium">
                            {offer.subcontractorId
                              ? (names.get(offer.subcontractorId) ?? "متعهد مسجَّل")
                              : "—"}
                          </td>
                          <td className="p-2" dir="ltr">
                            {numberText(offer.round)}
                          </td>
                          <td className="p-2" dir="ltr">
                            {offer.payout === null ? "—" : formatMoney(offer.payout, currency)}
                          </td>
                          <td className="p-2">
                            <MarginPill
                              margin={margin}
                              floor={settings.minMarginAmount}
                              currency={currency}
                            />
                          </td>
                          <td className="p-2">
                            <span className="flex items-center gap-1">
                              <OfferBadge status={offer.status} />
                              {isOfferStatus(offer.status) && (
                                <HelpTip>{OFFER_STATUS_HINTS[offer.status]}</HelpTip>
                              )}
                            </span>
                          </td>
                          <td className="p-2 text-xs whitespace-nowrap text-muted-foreground">
                            {dateTimeLabel(offer.createdAt)}
                            {offer.status === "pending" && offer.expiresAt && (
                              <span className="block">
                                تنتهي المهلة {relativeTime(offer.expiresAt)}
                              </span>
                            )}
                          </td>
                          <td className="p-2 text-xs whitespace-nowrap text-muted-foreground">
                            {offer.respondedAt ? dateTimeLabel(offer.respondedAt) : "—"}
                          </td>
                          <td className="p-2 text-xs leading-relaxed text-muted-foreground">
                            {offer.reason ?? "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {offers.length > 0 && (
              <p className="text-xs text-muted-foreground">
                عدد العروض المعروضة: {toArabicDigits(offers.length)}
                {offers.length === MAX_OFFERS
                  ? ` (بلغ السقف الأعلى ${toArabicDigits(MAX_OFFERS)} — قد تكون هناك عروض أقدم)`
                  : ""}
                . عمود «الهامش» تقديري لكل مرشّح: إجمالي الحجز ناقص مستحقه هو.
              </p>
            )}
          </div>

          {/*
            ذيل اللوحة كله للشاشة — فاصلٌ وأزرار تدخّل ونماذج إسناد وسطر إعدادات
            سارية. لا شيء منه يفيد من يمسك الورقة. ويُوسم بنداً بنداً لا بغلافٍ
            جامع: الغلاف كان سيضيف عنصراً وسيطاً يغيّر تباعد البطاقة على الشاشة
            لأجل الورق، وهو ثمنٌ يدفعه من يعمل يومياً.
          */}
          <Separator className="no-print" />

          {/* الإجراءات */}
          {stopped ? (
            <p className="no-print text-sm text-muted-foreground">
              دورة البث متوقفة لأن الحجز ملغى — لا عروض قابلة للقبول ولا إسناد ممكن.
            </p>
          ) : isAssigned ? (
            <p className="no-print text-sm leading-relaxed text-muted-foreground">
              الطلب مُسند وأُغلق أمام بقية المتعهدين، فلا بث ولا إسناد بعده: قاعدة «أول قابل
              يفوز» تحرس وحدانية الإسناد داخل قاعدة البيانات نفسها. أي تغيير للمنفِّذ بعد هذه
              النقطة تنسيق تشغيلي مع الشريك خارج النظام.
            </p>
          ) : null}

          <div className="no-print flex flex-wrap items-center gap-3">
            {canStart && (
              <form action={startBroadcast.bind(null, bookingId, false)}>
                <Button type="submit">
                  <Send />
                  ابدأ البث
                </Button>
              </form>
            )}
            {canStart && (
              <HelpTip>
                يفتح الموجة الأولى فوراً: يُحسب المتعهدون المغطّون للمسار بسقف تكلفة الموجة،
                ويصلهم العرض في بوابتهم وعبر قنوات الإشعار المفعّلة.
              </HelpTip>
            )}

            {canRebroadcast && (
              <form action={startBroadcast.bind(null, bookingId, true)}>
                <Button type="submit" variant="outline">
                  <RefreshCw />
                  إعادة البث الآن
                </Button>
              </form>
            )}
            {canRebroadcast && (
              <HelpTip>
                يستدعي دالة البث فوراً لفتح الموجة التالية بسقفها الأوسع بدل انتظار انتهاء
                المهلة — مفيد حين تعرف أن الموجة الحالية لن تُقبل، أو لإعادة محاولة طلب سقط في
                الطابور اليدوي. إن رفضت القاعدة لوجود موجة سارية فشغّل «دورة الإسناد الآن» من
                شاشة الإسناد.
              </HelpTip>
            )}

            {canManual && !confirmingAssign && (
              <>
                <Link
                  href={`/admin/orders/${bookingId}?confirm=assign#dispatch`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 px-3 py-1.5 text-sm text-amber-800 transition-colors hover:bg-amber-50 dark:border-amber-700 dark:text-amber-200 dark:hover:bg-amber-950"
                >
                  <UserCheck className="size-4" />
                  إسناد يدوي
                </Link>
                <HelpTip>
                  خطوة تأكيد إجبارية تسبق الإسناد اليدوي — التجاوز البشري لدورة البث لا يقع
                  بضغطة واحدة، ويطالبك النموذج بالمستحق والسبب معاً.
                </HelpTip>
              </>
            )}

            {/*
              الباب الوحيد لتجاوز سقف دين المتعهد. يظهر بجوار الإسناد اليدوي —
              وليس بعد رفض القاعدة فقط — لأن الشاشات المالية تحيل إليه صراحةً
              («أسند له رحلة بعينها يدوياً من شاشة الطلب بسبب مكتوب»)، ولأن
              الرسالة التي تحيل إلى زرّ غير موجود طريق مسدود (نمط الفشل ٣).
            */}
            {canManual && !confirmingOverride && (
              <>
                <Link
                  href={`/admin/orders/${bookingId}?confirm=override#dispatch`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 px-3 py-1.5 text-sm text-red-700 transition-colors hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950"
                >
                  <ShieldAlert className="size-4" />
                  إسناد فوق سقف الدين
                </Link>
                <HelpTip>
                  يُسند الرحلة إلى متعهد <span className="font-semibold">بلغ سقف الدين</span>{" "}
                  رغم بلوغه السقف: الحاجز الذي ترفض به القاعدة إسناده يُرفع لهذه الرحلة
                  وحدها، بسبب مكتوب إلزامي يبقى في سجل الطلب. ولا حاجة له ما لم يرفض النظام
                  الإسناد بسبب السقف — الإسناد اليدوي المعتاد يكفي. وهو لا يرفع أرضية الهامش
                  ولا يقبل متعهداً موقوفاً أو غير معتمد.
                </HelpTip>
              </>
            )}
          </div>

          {status === null && bookingStatus !== "confirmed" && bookingStatus !== "assigned" && (
            <p className="no-print text-sm leading-relaxed text-muted-foreground">
              لا دورة بث لهذا الحجز: البث لا يُفتح إلا على حجز «تم التأكيد». اعتمد التحويل أولاً من
              بطاقة الإجراءات، وسيبدأ البث تلقائياً إن كان{" "}
              <span className="font-medium">البدء التلقائي</span> مفعّلاً في{" "}
              <Link href="/admin/dispatch" className="text-primary hover:underline">
                إعدادات الإسناد
              </Link>
              .
            </p>
          )}

          {canManual && confirmingAssign && (
            <ManualAssignForm
              action={manualAssign.bind(null, bookingId)}
              partners={partners}
              bookingTotal={bookingTotal}
              extrasTotal={extrasTotal}
              currency={currency}
              marginFloor={settings.minMarginAmount}
              disabled={!ready}
            >
              <Link
                href={`/admin/orders/${bookingId}#dispatch`}
                className="text-sm text-muted-foreground transition-colors hover:text-foreground hover:underline"
              >
                تراجع
              </Link>
            </ManualAssignForm>
          )}

          {/*
            نفس النموذج بصيغته الثانية وإجراء آخر: `manual_assign_over_limit`
            بدل `manual_assign`. الخطوة الثانية في الرابط وحده (‎?confirm=override‎)
            على سابقة ‎?confirm=cancel‎ — لا حالة على العميل، ويعمل بلا جافاسكربت.
          */}
          {canManual && confirmingOverride && (
            <ManualAssignForm
              action={manualAssignOverLimit.bind(null, bookingId)}
              variant="over-limit"
              partners={partners}
              bookingTotal={bookingTotal}
              extrasTotal={extrasTotal}
              currency={currency}
              marginFloor={settings.minMarginAmount}
              disabled={!ready}
            >
              <Link
                href={`/admin/orders/${bookingId}#dispatch`}
                className="text-sm text-muted-foreground transition-colors hover:text-foreground hover:underline"
              >
                تراجع
              </Link>
            </ManualAssignForm>
          )}

          <p className="no-print text-xs leading-relaxed text-muted-foreground">
            {settingsLoaded ? "الإعدادات السارية" : "الإعدادات الافتراضية (لا صف إعدادات بعد)"}: مهلة
            الموجة {toArabicDigits(settings.windowMinutes)} دقيقة ·{" "}
            {toArabicDigits(settings.maxRounds)} موجة كحد أقصى · البدء التلقائي{" "}
            {settings.autoStart ? "مفعّل" : "مطفأ"} · أرضية الهامش{" "}
            {formatMoney(settings.minMarginAmount, currency)}. تُضبط كلها من{" "}
            <Link href="/admin/dispatch" className="text-primary hover:underline">
              شاشة الإسناد
            </Link>
            .
          </p>
        </>
      )}
    </Card>
  );
}
