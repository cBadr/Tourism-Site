import Link from "next/link";
import { ExternalLink, PlayCircle, Timer } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";

import { formatMoney, toArabicDigits } from "@/components/booking/format";
import { SaveButton } from "@/components/admin/save-feedback";
import { HelpTip } from "@/components/shared/HelpTip";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { DEFAULT_TRIP_SETTINGS } from "@/lib/booking-types";
import { listSupportedTimeZones, timeZoneLabel } from "@/lib/site-timezone";
import { readDispatchSettings } from "@/lib/dispatch/settings";
import { createServerSupabase } from "@/lib/supabase/server";
import {
  MAX_LEAD_MINUTES,
  MAX_UNPAID_TIMEOUT_MINUTES,
  MIN_LEAD_MINUTES_FLOOR,
  MIN_UNPAID_TIMEOUT_MINUTES,
  readTripSettings,
  TRIP_SETTINGS_COLUMNS,
} from "@/lib/trip-settings";
import { asNumber, asText, pick } from "../../orders/_components/booking-ui";
import { runStaleBookingsSweep, saveTripSettings } from "../actions";

/**
 * قسم «إعدادات الرحلات» — كل ما يخصّ الرحلات في مكان واحد (الملاحظة ٣).
 *
 * ── ماذا يعني «يجمع» هنا بالضبط ─────────────────────────────────────────────
 * القسم **يملك مفتاحين فقط**: تفعيل الإلغاء التلقائي للطلبات غير المدفوعة
 * ومهلته (جدول `trip_settings`، هجرة 0027). وكل مقبض رحلات آخر له شاشة تملكه
 * أصلاً — فيُعرض هنا **بقيمته السارية للقراءة فقط** مع رابط إلى مالكه.
 *
 * **لماذا لا نسخة ثانية قابلة للتحرير؟** نمط الفشل ٨ في `handover/LESSONS.md`:
 * مصدران لرقم واحد ينحرفان حتماً، وقد وقع في هذا المستودع مرتين. رقم واحد،
 * مالك واحد، وشاشة واحدة تكتبه — وهذه الشاشة تقرأ لا تكتب.
 *
 * ── لا رقم مخترع ────────────────────────────────────────────────────────────
 * كل قراءة هنا بجلسة المستخدم (لا بمفتاح الخدمة) فتمر على RLS وعلى حارس الدور
 * في `app/admin/layout.tsx`. وما ترفضه RLS أو تغيب هجرته يظهر «—» مع سطر يسمّي
 * السبب — لا صفراً ولا قيمة افتراضية تُعرض كأنها محفوظة.
 *
 * ولا حساب في هذا الملف: لا جمع ولا نسبة ولا تحويل مهلة إلى ساعات. ما يجري
 * تنسيق عرض محض لأرقام وصلت جاهزة من Postgres.
 */

/** قيمة لا نملكها ⇒ شرطة، لا صفر */
const EMPTY = "—";

/** عدد صحيح أو عشري بخانات عربية — عرض محض بلا أي عملية حسابية */
const numberText = (value: number | null): string =>
  value === null ? EMPTY : toArabicDigits(String(value)).replace(".", "٫");

const percentText = (value: number | null): string =>
  value === null ? EMPTY : `${numberText(value)}٪`;

const moneyText = (value: number | null, currency: string): string =>
  value === null ? EMPTY : formatMoney(value, currency);

const minutesText = (value: number | null): string =>
  value === null ? EMPTY : `${numberText(value)} دقيقة`;

const switchText = (value: boolean | null): string =>
  value === null ? EMPTY : value ? "مفعّل" : "مطفأ";

type MirrorRow = { key: string; label: string; value: string; help: string };

type MirrorGroup = {
  key: string;
  title: string;
  href: string;
  /** سبب غياب الأرقام — يظهر تحت المجموعة بدل أن تُملأ خاناتها بقيم مخترعة */
  note: string | null;
  rows: MirrorRow[];
};

type FleetRow = {
  key: string;
  title: string;
  active: boolean;
  capacity: string;
  perKm: string;
  baseFee: string;
  minPrice: string;
  waiting: string;
  roundTrip: string;
};

type Mirrors = {
  groups: MirrorGroup[];
  fleet: FleetRow[];
  fleetNote: string | null;
  /**
   * الحدّ الأدنى الذي **تحتاجه المنظومة نفسها** قبل أن يتحرّك أحد، بالدقائق:
   * `window_minutes × max_rounds` — أي زمن موجات البثّ كاملةً قبل أن يهبط
   * الطلب إلى الطابور اليدوي، وقبل أن يبدأ المتعهد التحرّك أصلاً.
   *
   * ولماذا يُعرض في نصّ الإرشاد بدل أن يصير قيمةً افتراضية: **لأنه أرضيةٌ
   * تقنية لا سياسةُ عمل.** زمن وصول المتعهد وسياسة القبول قرارُ المالك وحده
   * (`docs/STANDING-ORDERS.md` §٣)، فنعرض عليه الرقم الذي يعرفه النظام
   * ونتركه يضيف إليه ما يعرفه هو. و`null` حين تتعذّر قراءة إعدادات البثّ —
   * فلا يُقترح رقمٌ مبنيٌّ على افتراض.
   */
  dispatchFloorMinutes: number | null;
};

const NO_ROW_NOTE = "لا صف محفوظ في هذه الشاشة بعد — افتحها واحفظ القيم لتظهر هنا.";
const READ_FAILED_NOTE =
  "تعذّرت قراءة هذه القيم — إما أن هجرتها لم تُنفَّذ بعد أو أن حسابك لا يملك صلاحية قراءتها.";

const EMPTY_MIRRORS: Mirrors = {
  groups: [],
  fleet: [],
  fleetNote: READ_FAILED_NOTE,
  dispatchFloorMinutes: null,
};

/**
 * قراءة القيم السارية من مالكيها. كل قراءة مستقلة: فشل واحدة لا يُفرغ الباقي،
 * وفشلها كله لا يُسقط الصفحة (القسم يتدهور بهدوء كما تفعل لوحة الإسناد).
 */
async function readMirrors(supabase: SupabaseClient): Promise<Mirrors> {
  try {
    const [dispatch, pricingRes, paymentRes, discountRes, classesRes, tariffsRes] =
      await Promise.all([
        readDispatchSettings(supabase),
        supabase.from("pricing_settings").select("*").limit(1).maybeSingle(),
        supabase.from("site_settings").select("value").eq("key", "payment").maybeSingle(),
        supabase.from("discount_settings").select("*").limit(1).maybeSingle(),
        supabase
          .from("vehicle_classes")
          .select("id, slug, title, capacity, active, sort")
          .order("sort", { ascending: true }),
        supabase
          .from("tariffs")
          .select("class_id, per_km, base_fee, min_price, waiting_hour_price, round_trip_factor"),
      ]);

    const pricing = (pricingRes.data ?? null) as Record<string, unknown> | null;
    const currency = asText(pick(pricing, ["currency"])) ?? "EGP";

    // ── (١) البث والإسناد — من نفس قارئ عامل البث فلا تختلف الشاشة عن المحرّك
    const d = dispatch.settings;
    const dispatchGroup: MirrorGroup = {
      key: "dispatch",
      title: "البث والإسناد",
      href: "/admin/dispatch",
      note: dispatch.loaded
        ? null
        : dispatch.reason === "empty"
          ? NO_ROW_NOTE
          : READ_FAILED_NOTE,
      rows: [
        {
          key: "window",
          label: "مهلة الموجة",
          value: dispatch.loaded ? minutesText(d.windowMinutes) : EMPTY,
          help: "كم يبقى العرض مفتوحاً أمام متعهدي الموجة قبل أن يُحسب تجاهلاً. وانتهاء المهلة نفسه لا يكفي: الذي يُغلق الموجة ويفتح التالية هو دورة الإسناد حين تعمل.",
        },
        {
          key: "rounds",
          label: "عدد الموجات قبل التحويل اليدوي",
          value: dispatch.loaded ? numberText(d.maxRounds) : EMPTY,
          help: "كم موجة يجرّبها النظام قبل أن يرفع يده. الأولى على من تكلفته لا تتجاوز التكلفة المُسعَّر بها — أي بهامشك كاملاً — والتالية توسّع السقف حتى التعادل. باستنفادها ينزل الطلب للطابور اليدوي.",
        },
        {
          key: "autostart",
          label: "بدء البث تلقائياً فور تأكيد الدفع",
          value: dispatch.loaded ? switchText(d.autoStart) : EMPTY,
          help: "عند التفعيل تبدأ الموجة الأولى لحظة اعتماد التحويل بلا تدخل. عند الإطفاء يبقى كل حجز مؤكد في الطابور حتى يضغط التشغيل «ابدأ البث» من صفحة الطلب.",
        },
        {
          key: "floor",
          label: "أرضية الهامش",
          value: dispatch.loaded ? moneyText(d.minMarginAmount, currency) : EMPTY,
          help: "أقل ربح تقبله على رحلة مُسندة. الصفر يعني: امنع الخسارة فقط. تُستخدم عند تقييم الموجة الأخيرة وعند الإسناد اليدوي، والرفض يقع في قاعدة البيانات لا في الشاشة.",
        },
      ],
    };

    // ── (٢) التسعير: الذروة والهامش
    const marginType = asText(pick(pricing, ["margin_type"]));
    const marginValue = asNumber(pick(pricing, ["margin_value"]));
    const pricingGroup: MirrorGroup = {
      key: "pricing",
      title: "التسعير: الذروة والهامش",
      href: "/admin/pricing",
      note: pricingRes.error ? READ_FAILED_NOTE : pricing ? null : NO_ROW_NOTE,
      rows: [
        {
          key: "peak",
          label: "عمولة الذروة",
          value: pricing ? switchText(pick(pricing, ["peak_enabled"]) === true) : EMPTY,
          help: "حين تكون مفعّلة تُضاف نسبتها فوق سعر كل عرض داخل دالة التسعير في القاعدة. المفتاح والنسبة يُحرَّران من شاشة التسعير وحدها.",
        },
        {
          key: "peak-percent",
          label: "نسبة الذروة",
          value: percentText(asNumber(pick(pricing, ["peak_percent"]))),
          help: "النسبة التي تُضاف فوق السعر حين تكون الذروة مفعّلة، ولا أثر لها إطلاقاً ما دام المفتاح مطفأً.",
        },
        {
          key: "margin-type",
          label: "نوع هامش الموقع",
          value:
            marginType === "percent" ? "نسبة مئوية" : marginType === "fixed" ? "مبلغ ثابت" : EMPTY,
          help: "كيف يُحسب ربح الموقع فوق تكلفة المتعهد حين يكون مصدر السعر متعهداً. لا يُطبَّق على مسار تعريفة الكيلومتر: ربح الموقع هناك داخل التعريفة نفسها.",
        },
        {
          key: "margin-value",
          label: "قيمة الهامش",
          // نوع الهامش غير معروف ⇒ لا نعرف بأي وحدة نعرض القيمة، فشرطة لا رقم بلا وحدة
          value:
            marginType === "percent"
              ? percentText(marginValue)
              : marginType === "fixed"
                ? moneyText(marginValue, currency)
                : EMPTY,
          help: "قيمة الهامش بحسب نوعه: نسبة من تكلفة المتعهد، أو مبلغ ثابت يُضاف فوقها.",
        },
        {
          key: "margin-min",
          label: "أدنى هامش بالمبلغ",
          value: moneyText(asNumber(pick(pricing, ["margin_min_amount"])), currency),
          help: "أرضية بالجنيه للهامش المحسوب: إن نزل الهامش عنها رُفع إليها. صفر يعني «بلا أرضية».",
        },
      ],
    };

    // ── (٣) العربون — مفتاح `payment` في `site_settings`
    const rawPaymentValue = ((paymentRes.data ?? null) as { value?: unknown } | null)?.value;
    const paymentValue =
      typeof rawPaymentValue === "object" &&
      rawPaymentValue !== null &&
      !Array.isArray(rawPaymentValue)
        ? (rawPaymentValue as Record<string, unknown>)
        : null;
    const paymentGroup: MirrorGroup = {
      key: "payment",
      title: "العربون",
      href: "/admin/payment-accounts",
      note: paymentRes.error
        ? READ_FAILED_NOTE
        : paymentValue
          ? null
          : "لا صف محفوظ لإعدادات الدفع — القاعدة تستعمل قيمها الافتراضية داخل دالة الحجز حتى تُحفظ من شاشة حسابات الدفع.",
      rows: [
        {
          key: "deposit-percent",
          label: "نسبة العربون",
          value: percentText(asNumber(pick(paymentValue, ["depositPercent"]))),
          help: "النسبة التي يُطالَب العميل بتحويلها مقدَّماً حين يختار «عربون». الباقي يُحصَّل نقداً مع السائق. الحساب كله داخل دالة الحجز في القاعدة.",
        },
        {
          key: "deposit-min",
          label: "الحد الأدنى للعربون",
          value: moneyText(asNumber(pick(paymentValue, ["depositMinAmount"])), currency),
          help: "أرضية بالجنيه للعربون: الرحلة الرخيصة لا يقل عربونها عن هذا المبلغ. ولا يتجاوز العربون إجمالي الرحلة بحال.",
        },
      ],
    };

    // ── (٤) الخصومات
    const discount = (discountRes.data ?? null) as Record<string, unknown> | null;
    const discountGroup: MirrorGroup = {
      key: "discounts",
      title: "الخصومات والكوبونات",
      href: "/admin/discounts",
      note: discountRes.error ? READ_FAILED_NOTE : discount ? null : NO_ROW_NOTE,
      rows: [
        {
          key: "enabled",
          label: "نظام الخصومات",
          value: discount ? switchText(pick(discount, ["enabled"]) === true) : EMPTY,
          help: "حين يكون مطفأً لا يظهر حقل الكوبون في صفحة الحجز أصلاً، وأي رمز يصل يُرفض في القاعدة.",
        },
        {
          key: "max-percent",
          label: "أقصى نسبة خصم",
          value: percentText(asNumber(pick(discount, ["max_percent"]))),
          help: "سقف يقلّص أي كوبون يتجاوزه لحظة الاستخدام — والتقليص يُسجَّل في سجل الاستخدام فيظهر لك أن الخصم لم يقع كاملاً.",
        },
        {
          key: "min-margin-percent",
          label: "أدنى هامش بعد الخصم (نسبة)",
          value: percentText(asNumber(pick(discount, ["min_margin_percent_after_discount"]))),
          help: "أرضية تحمي ربح الرحلة: الخصم يُقلَّص حتى لا ينزل الهامش بعده عن هذه النسبة.",
        },
        {
          key: "min-margin-amount",
          label: "أدنى هامش بعد الخصم (مبلغ)",
          value: moneyText(
            asNumber(pick(discount, ["min_margin_amount_after_discount"])),
            currency
          ),
          help: "نفس الحماية بالجنيه لا بالنسبة. الأعلى بين الاثنين هو ما يُفرض فعلياً داخل دالة الخصم.",
        },
      ],
    };

    // ── (٥) الأسطول: التعريفات والسعات
    const tariffs = new Map<string, Record<string, unknown>>();
    for (const row of (tariffsRes.data ?? []) as Record<string, unknown>[]) {
      const classId = asText(pick(row, ["class_id"]));
      if (classId) tariffs.set(classId, row);
    }

    const fleet: FleetRow[] = ((classesRes.data ?? []) as Record<string, unknown>[]).map(
      (row, index) => {
        const id = asText(pick(row, ["id"]));
        const tariff = id ? (tariffs.get(id) ?? null) : null;
        return {
          key: id ?? `class-${index}`,
          title: asText(pick(row, ["title", "slug"])) ?? EMPTY,
          active: pick(row, ["active"]) === true,
          capacity: numberText(asNumber(pick(row, ["capacity"]))),
          perKm: moneyText(asNumber(pick(tariff, ["per_km"])), currency),
          baseFee: moneyText(asNumber(pick(tariff, ["base_fee"])), currency),
          minPrice: moneyText(asNumber(pick(tariff, ["min_price"])), currency),
          waiting: moneyText(asNumber(pick(tariff, ["waiting_hour_price"])), currency),
          roundTrip: numberText(asNumber(pick(tariff, ["round_trip_factor"]))),
        };
      }
    );

    const fleetNote =
      classesRes.error || tariffsRes.error
        ? READ_FAILED_NOTE
        : fleet.length === 0
          ? "لا فئات سيارات محفوظة بعد — أضفها من شاشة الأسطول."
          : null;

    return {
      groups: [dispatchGroup, pricingGroup, paymentGroup, discountGroup],
      fleet,
      fleetNote,
      // ⚠ ضربٌ لعرض إرشادي محض — لا مال ولا سعر (D-05 يخصّ الحساب المالي)،
      //   والقيمتان مقروءتان من مالكهما لا مكتوبتان هنا.
      dispatchFloorMinutes:
        dispatch.loaded && d.windowMinutes > 0 && d.maxRounds > 0
          ? d.windowMinutes * d.maxRounds
          : null,
    };
  } catch {
    return EMPTY_MIRRORS;
  }
}

/** سطر «تسمية ← قيمة» داخل مجموعة مرآة */
function MirrorLine({ row }: { row: MirrorRow }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 border-b border-border py-2 last:border-0">
      <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
        {row.label}
        <HelpTip>{row.help}</HelpTip>
      </span>
      <span className="min-w-0 text-sm font-medium" dir="auto">
        {row.value}
      </span>
    </div>
  );
}

/**
 * خيارات المنتقي: قائمة زمن التشغيل **مضموماً إليها القيمة السارية**.
 *
 * والضمّ ليس احتياطاً نظرياً: الصفّ قابل للتحرير من محرّر SQL، وقائمة ICU
 * تحمل الأسماء القانونية وحدها (‏٤١٧) بينما تقبل Postgres مرادفاتٍ أكثر
 * (‏`Egypt` · `US/Eastern`). فمنتقٍ لا يحمل المحفوظ كان سيعرض أول عنصرٍ في
 * القائمة كأنه المحفوظ، **فيبدّل منطقةَ الموقع بمجرد ضغط «حفظ»** — تغييرٌ لم
 * يطلبه أحد ولا رسالة تنبّه إليه.
 */
function timeZoneOptions(current: string): readonly string[] {
  const list = listSupportedTimeZones();
  return list.includes(current) ? list : [current, ...list];
}

/** الساعة الآن في تلك المنطقة — يقرؤها المالك فيتأكد قبل الحفظ */
function nowInZone(zone: string): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: zone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(new Date());
  } catch {
    return "—";
  }
}

export async function TripSettingsSection({ wired }: { wired: boolean }) {
  const supabase = await createServerSupabase();

  const [trip, mirrors] = supabase
    ? await Promise.all([readTripSettings(supabase), readMirrors(supabase)])
    : [
        { settings: DEFAULT_TRIP_SETTINGS, loaded: false, reason: "no-client" },
        EMPTY_MIRRORS,
      ];

  const zoneOptions = timeZoneOptions(trip.settings.timeZone);

  // الهجرة غير مطبَّقة ⇒ لا نموذج يُعرض بلا مكان يُحفظ فيه (نمط الفشل ٣)
  const tableReady = trip.loaded || trip.reason === "empty";
  const canEdit = wired && tableReady;

  return (
    <Card id="trips" className="scroll-mt-20 space-y-5 p-5">
      <div>
        <h2 className="flex items-center gap-1.5 font-heading text-base font-bold">
          <Timer className="size-4 text-primary" />
          إعدادات الرحلات
          <HelpTip>
            هذا القسم يملك مفتاحَي الإلغاء التلقائي أدناه ويحفظهما في جدول مستقل محروس (لا
            في إعدادات الموقع المقروءة علناً). أما بقية أرقام الرحلات فمعروضة هنا للقراءة
            فقط بقيمتها السارية، ولكل رقم رابط إلى الشاشة التي تملك تحريره — رقم واحد له
            مالك واحد، فلا تنحرف نسختان.
          </HelpTip>
        </h2>
        <p className="text-sm text-muted-foreground">
          كل ما يخصّ الرحلات في مكان واحد: ما يُضبط هنا، وما يُضبط في مكانه بقيمته الحالية.
        </p>
      </div>

      {!tableReady && wired ? (
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm leading-relaxed text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
          جدول <code dir="ltr">trip_settings</code> غير جاهز على هذه القاعدة — نفِّذ هجرة{" "}
          <code dir="ltr">0027</code> من <code dir="ltr">supabase/migrations</code> ثم أعد
          تحميل الصفحة. الحقول أدناه معطّلة حتى ذلك الحين، وبقية الصفحة تعمل طبيعياً.
        </p>
      ) : null}

      {/* ── ما يملكه هذا القسم: الإلغاء التلقائي للطلبات غير المدفوعة ── */}
      <form action={saveTripSettings} className="space-y-4">
        <Label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-input p-3 text-sm font-normal">
          <span className="leading-relaxed">
            <span className="font-medium">إلغاء الطلبات غير المدفوعة تلقائياً</span>
            <span className="block text-muted-foreground">
              حجزٌ بقي «بانتظار الدفع» بعد انقضاء المهلة يُلغى في أول كنس بعدها. يُسجَّل
              الإلغاء وسببه في سجل الحجز، ويراه العميل في صفحة متابعته، ويصل فريق التشغيل
              تنبيه «حجز ملغى» المعتاد.
            </span>
          </span>
          <input
            type="checkbox"
            name={TRIP_SETTINGS_COLUMNS.unpaidCancelEnabled}
            defaultChecked={trip.settings.unpaidCancelEnabled}
            disabled={!canEdit}
            className="size-5 shrink-0 accent-primary"
          />
        </Label>

        <div className="space-y-1.5">
          <Label
            htmlFor={TRIP_SETTINGS_COLUMNS.unpaidTimeoutMinutes}
            className="flex items-center gap-1.5"
          >
            المهلة بالدقائق قبل الإلغاء
            <HelpTip>
              تُحسب من لحظة إنشاء الحجز لا من آخر نشاط. ولا يُلغى حجزٌ له جلسة دفع
              إلكتروني حيّة أحدث من المهلة — حتى لا يُلغى طلب والمال في الطريق. المدى
              المقبول من ١٥ دقيقة إلى ٤٣٢٠٠ (ثلاثين يوماً)، وهو نفس القيد المفروض في
              قاعدة البيانات. أمثلة: ٦٠ = ساعة، ٧٢٠ = نصف يوم، ١٤٤٠ = يوم كامل.
            </HelpTip>
          </Label>
          <Input
            id={TRIP_SETTINGS_COLUMNS.unpaidTimeoutMinutes}
            name={TRIP_SETTINGS_COLUMNS.unpaidTimeoutMinutes}
            type="number"
            inputMode="numeric"
            dir="ltr"
            step="1"
            min={MIN_UNPAID_TIMEOUT_MINUTES}
            max={MAX_UNPAID_TIMEOUT_MINUTES}
            defaultValue={trip.settings.unpaidTimeoutMinutes}
            disabled={!canEdit}
            required
            className="sm:max-w-48"
          />
          {!trip.loaded && tableReady ? (
            <p className="text-xs text-muted-foreground">
              لا صف محفوظ بعد — القيمة المعروضة هي افتراضي العقد، ويُنشأ الصف عند أول حفظ.
            </p>
          ) : null}
        </div>

        {/* ── أدنى مهلة قبل الانطلاق (هجرة 0067) ── */}
        <div className="space-y-1.5">
          <Label htmlFor={TRIP_SETTINGS_COLUMNS.minLeadMinutes} className="flex items-center gap-1.5">
            أدنى مهلة قبل الانطلاق (بالدقائق)
            <HelpTip>
              أقرب موعد انطلاق يقبله الموقع، محسوباً من لحظة الحجز. حجزٌ لموعدٍ أقرب من
              ذلك <strong>ترفضه قاعدة البيانات</strong> لا الشاشة — فلا يمرّ من أي طريق،
              ومنتقي التاريخ في الحاسبة يمنع اختياره أصلاً بدل أن يقبله ثم يعتذر.
              <br />
              <strong>صفر يعني: مطفأة</strong> — يُقبل أي موعد في المستقبل، وهو الوضع
              الحالي. المدى المقبول من ٠ إلى ١٠٠٨٠ (سبعة أيام)، وهو نفس القيد المفروض في
              قاعدة البيانات.
              <br />
              وانتبه: الرقم يُقاس من <em>لحظة الحجز</em> لا من لحظة تأكيد الدفع. فمن يحجز
              الآن لموعدٍ بعد ساعة يُرفض إن كانت المهلة ٩٠ دقيقة.
            </HelpTip>
          </Label>
          <Input
            id={TRIP_SETTINGS_COLUMNS.minLeadMinutes}
            name={TRIP_SETTINGS_COLUMNS.minLeadMinutes}
            type="number"
            inputMode="numeric"
            dir="ltr"
            step="1"
            min={MIN_LEAD_MINUTES_FLOOR}
            max={MAX_LEAD_MINUTES}
            defaultValue={trip.settings.minLeadMinutes}
            disabled={!canEdit}
            required
            className="sm:max-w-48"
          />
          {/*
            🔒 رقمٌ **يعرفه النظام** لا اقتراحٌ مخترَع: موجات البثّ وحدها تستغرق
            هذا الزمن قبل أن يتحرّك أي متعهد. وزمن الوصول وسياسة القبول فوقه
            قرارُ المالك — فلا يُضاف هنا رقمٌ من عندنا.
            وتعذُّر القراءة ⇒ لا سطر: «لا نعرف» و«صفر» ليسا شيئاً واحداً.
          */}
          {mirrors.dispatchFloorMinutes !== null ? (
            <p className="text-xs leading-relaxed text-muted-foreground">
              للعلم: موجات البثّ وحدها تستغرق{" "}
              <strong>{minutesText(mirrors.dispatchFloorMinutes)}</strong> (مهلة الموجة ×
              عدد الموجات) قبل أن يهبط الطلب إلى الطابور اليدوي — وهذا قبل زمن وصول
              المتعهد. اختر رقماً فوقه بما يناسب تشغيلك.
            </p>
          ) : null}
          {trip.settings.minLeadMinutes === 0 ? (
            <p className="text-xs leading-relaxed text-muted-foreground">
              مطفأة الآن: يُقبل أي موعد في المستقبل، بما فيه موعدٌ بعد عشر دقائق.
            </p>
          ) : null}
        </div>

        {/* ── المنطقة الزمنية للموقع (هجرة 0075) ── */}
        <div className="space-y-1.5">
          <Label htmlFor={TRIP_SETTINGS_COLUMNS.timeZone} className="flex items-center gap-1.5">
            المنطقة الزمنية للموقع
            <HelpTip>
              الساعة التي يعمل بها الموقع كله: بها <strong>يُفهم</strong> الموعد الذي يكتبه
              العميل في نموذج الحجز، وبها <strong>يُعرض</strong> كل تاريخ في الموقع واللوحة
              والبورتال والإشعارات، وعليها تُجمَّع أيام التقارير والإحصاءات.
              <br />
              <strong>ولا تُغيّر حجزاً قائماً.</strong> الموعد محفوظ لحظةً مطلقة لا ساعةَ
              حائط؛ فتبديل المنطقة يعرض الحجز نفسه بساعة البلد الجديد — نفس اللحظة، لا
              تقديمَ ولا تأخير. والذي يتغيّر فعلاً: تفسير <em>المواعيد الجديدة</em>، وحدود
              أيام التقارير.
              <br />
              القائمة من قاعدة المناطق التي يشغّلها الخادم نفسه — تُراعي التوقيت الصيفي
              تلقائياً، ولذلك اسمُ مدينة لا إزاحة مثل <code dir="ltr">+02:00</code>.
            </HelpTip>
          </Label>
          <select
            id={TRIP_SETTINGS_COLUMNS.timeZone}
            name={TRIP_SETTINGS_COLUMNS.timeZone}
            defaultValue={trip.settings.timeZone}
            disabled={!canEdit}
            required
            dir="ltr"
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none disabled:cursor-not-allowed disabled:opacity-50 sm:max-w-80"
          >
            {zoneOptions.map((zone) => (
              <option key={zone} value={zone}>
                {zone}
              </option>
            ))}
          </select>
          <p className="text-xs leading-relaxed text-muted-foreground">
            السارية الآن: <strong>{timeZoneLabel(trip.settings.timeZone, "ar")}</strong>{" "}
            <span dir="ltr">({trip.settings.timeZone})</span> — الساعة عندها الآن{" "}
            <strong dir="ltr">{nowInZone(trip.settings.timeZone)}</strong>.
          </p>
          {zoneOptions.length <= 1 ? (
            <p className="text-xs leading-relaxed text-amber-700 dark:text-amber-300">
              زمن التشغيل لا يُخرج قائمة المناطق، فالقائمة تحمل القيمة الحالية وحدها —
              وتغييرها يحتاج تحديث المنطقة مباشرةً في قاعدة البيانات.
            </p>
          ) : null}
        </div>

        {/* ── خريطة المسار على صفحة متابعة الحجز (هجرة 0078) ── */}
        <Label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-input p-3 text-sm font-normal">
          <span className="leading-relaxed">
            <span className="flex items-center gap-1.5 font-medium">
              خريطة مسار الرحلة
              <HelpTip>
                صورة ثابتة تُظهر نقطة الانطلاق ونقطة الوصول والخط بينهما، تظهر في صفحة
                متابعة الحجز التي يفتحها العميل، وفي بطاقة الرحلة داخل بورتال المتعهد.
                <br />
                <strong>لا تظهر قبل تأكيد الحجز</strong> — قبله يرى العميل مكانها لوحةً
                تشرح أن التجهيز يبدأ بالتأكيد وتدلّه على الدفع. و<strong>العربون
                يؤكّد</strong>: من دفع عربوناً يرى خريطته كمن دفع كاملاً.
                <br />
                وللمتعهد <strong>بعد قبوله الرحلة وحده</strong> — قبل القبول لا تصله ولا
                يستطيع طلبها، كما لا يصله العنوان الدقيق نصّاً.
                <br />
                <strong>ولماذا مفتاح إطفاء أصلاً:</strong> خدمة الخرائط تُحاسِب على كل
                صورة. والصورة تُولَّد <em>مرة واحدة لكل حجز</em> وتُخزَّن عندنا، فلا
                تتكرر الكلفة مهما فُتحت الصفحة. وإطفاؤه هنا يوقف التوليد <em>ويخفي</em>
                المخزَّن معاً، بلا نشر جديد.
                <br />
                ⚠ ومفتاح الخدمة نفسه (<code dir="ltr">GOOGLE_MAPS_API_KEY</code>) في بيئة
                الخادم لا في هذه الشاشة — <strong>وبدونه لا خريطة أصلاً</strong> مهما كان
                هذا المفتاح مفعّلاً.
              </HelpTip>
            </span>
            <span className="block text-muted-foreground">
              صورة واحدة لكل حجز تُولَّد عند التأكيد وتُخزَّن — الإطفاء يوقف الكلفة فوراً.
            </span>
          </span>
          <input
            type="checkbox"
            name={TRIP_SETTINGS_COLUMNS.routeMapEnabled}
            defaultChecked={trip.settings.routeMapEnabled}
            disabled={!canEdit}
            className="size-5 shrink-0 accent-primary"
          />
        </Label>

        <div className="flex flex-wrap items-center gap-3">
          <SaveButton
            label="حفظ إعدادات الرحلات"
            disabled={!canEdit}
            savedMessages={{
              trip: "حُفظت إعدادات الرحلات — المنطقة الزمنية سارية فوراً، والمهلة من الكنس التالي.",
            }}
          />
          <span className="text-xs text-muted-foreground">
            تُحفظ مفاتيح هذا القسم وحدها — بقية إعدادات الصفحة لها زر حفظ مستقل.
          </span>
        </div>
      </form>

      <Separator />

      {/* ── الكنس اليدوي ── */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <form action={runStaleBookingsSweep}>
            <Button type="submit" variant="outline" size="sm" disabled={!canEdit}>
              <PlayCircle />
              شغّل الكنس الآن
            </Button>
          </form>
          <HelpTip>
            يشغّل نفس الكنس الذي تستدعيه المهمة المجدولة على{" "}
            <code dir="ltr">/api/dispatch/tick</code> — لا نسخة ثانية منه. والمفتاح أعلاه
            يحكمه: ما دام مطفأً لا يُلغى شيء ولو ضغطت الزر. ويُظهر عدد ما فُحص وما أُلغي
            فعلاً.
          </HelpTip>
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">
          «فُحص ٠» نتيجة سليمة ولها ثلاثة أسباب: المفتاح مطفأ، أو لا حجز تجاوز مهلته، أو
          كنسٌ آخر يعمل في هذه اللحظة.
        </p>
      </div>

      <Separator />

      {/* ── مرايا: القيمة السارية + رابط مالكها ── */}
      <div className="space-y-4">
        <h3 className="flex items-center gap-1.5 font-heading text-sm font-bold">
          بقية مقابض الرحلات — للقراءة فقط
          <HelpTip>
            هذه القيم سارية الآن ومقروءة من مصدرها لحظة فتح الصفحة، لكنها لا تُحرَّر من
            هنا: لكل رقم شاشة واحدة تملكه. نسخة ثانية قابلة للتحرير كانت ستنتج رقمين لشيء
            واحد، وهو أكثر عيب تكرر في هذا المشروع.
          </HelpTip>
        </h3>

        {mirrors.groups.length === 0 ? (
          <p className="text-sm text-muted-foreground">{READ_FAILED_NOTE}</p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {mirrors.groups.map((group) => (
              <div key={group.key} className="rounded-lg border border-border p-4">
                <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-semibold">{group.title}</span>
                  <Link
                    href={group.href}
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    <ExternalLink className="size-3.5" />
                    تحرير في شاشتها
                  </Link>
                </div>
                {group.rows.map((row) => (
                  <MirrorLine key={row.key} row={row} />
                ))}
                {group.note ? (
                  <p className="pt-2 text-xs leading-relaxed text-muted-foreground">
                    {group.note}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        )}

        {/* الأسطول: صف لكل فئة — التعريفة والسعة معاً */}
        <div className="rounded-lg border border-border p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-sm font-semibold">
              الأسطول: السعات والتعريفات
              <HelpTip>
                السعة أساس قاعدة الأهلية: تُعرض للعميل الفئات التي تسع عدد ركابه. وهذه
                التعريفة هي ما تُحسب به الرحلة حين لا يغطي المسارَ متعهدٌ معتمد؛ ومع
                التغطية يُبنى السعر على سعر المتعهد وهامش الموقع.
              </HelpTip>
            </span>
            <Link
              href="/admin/fleet"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <ExternalLink className="size-3.5" />
              تحرير في شاشتها
            </Link>
          </div>

          {mirrors.fleet.length === 0 ? (
            <p className="text-sm text-muted-foreground">{mirrors.fleetNote ?? READ_FAILED_NOTE}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[42rem] text-start text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="py-2 pe-3 text-start font-medium">الفئة</th>
                    <th className="py-2 pe-3 text-start font-medium">السعة</th>
                    <th className="py-2 pe-3 text-start font-medium">سعر الكيلومتر</th>
                    <th className="py-2 pe-3 text-start font-medium">الأجرة الأساسية</th>
                    <th className="py-2 pe-3 text-start font-medium">أقل سعر</th>
                    <th className="py-2 pe-3 text-start font-medium">ساعة الانتظار</th>
                    <th className="py-2 text-start font-medium">معامل الذهاب والعودة</th>
                  </tr>
                </thead>
                <tbody>
                  {mirrors.fleet.map((row) => (
                    <tr key={row.key} className="border-b border-border last:border-0">
                      <td className="py-2 pe-3">
                        {row.title}
                        {row.active ? null : (
                          <span className="ms-1 text-xs text-muted-foreground">(موقوفة)</span>
                        )}
                      </td>
                      <td className="py-2 pe-3">{row.capacity}</td>
                      <td className="py-2 pe-3">{row.perKm}</td>
                      <td className="py-2 pe-3">{row.baseFee}</td>
                      <td className="py-2 pe-3">{row.minPrice}</td>
                      <td className="py-2 pe-3">{row.waiting}</td>
                      <td className="py-2">{row.roundTrip}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
