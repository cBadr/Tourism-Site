import type { ReactNode } from "react";
import {
  ArrowLeft,
  ExternalLink,
  MapPin,
  MessageCircle,
  Navigation,
  Phone,
  Plane,
} from "lucide-react";

import {
  formatAmount,
  formatDistance,
  formatMoney,
  passengersLabel,
  toArabicDigits,
  waitingLabel,
} from "@/components/booking/format";
import { Badge } from "@/components/ui/badge";
import { PRINT_HIDDEN_CLASS } from "@/lib/export-types";
import { telLink, waLink } from "@/lib/phone";
import { cn } from "@/lib/utils";
import { siteTimeZone } from "@/lib/site-timezone";

/**
 * لبنات بطاقة الرحلة في البورتال — يتشاركها صندوق العروض وشاشة الرحلات المُسندة.
 *
 * الترتيب البصري هنا قرار لا ذوق: **المستحق أولاً**. المتعهد يقرر بالرقم قبل أي
 * شيء آخر، ودفنُه في جدول تفاصيل يجعله يقبل قبل أن يعرف، أو يتردد فتضيع المهلة.
 * وما لا يظهر أبداً في هذه اللبنات: سعر العميل، وهامش المنصة، وأي إشارة إلى
 * متعهد آخر — ليس لأن الواجهة تُخفيها بل لأنها لا تصل إليها أصلاً.
 *
 * كلها مكوّنات خادمية: لا "use client" ولا حالة — نص جاهز في الـ HTML.
 */

const AR_MONTHS = [
  "يناير",
  "فبراير",
  "مارس",
  "أبريل",
  "مايو",
  "يونيو",
  "يوليو",
  "أغسطس",
  "سبتمبر",
  "أكتوبر",
  "نوفمبر",
  "ديسمبر",
];

const pad2 = (n: number) => (n < 10 ? `0${n}` : String(n));

/** تاريخ ووقت بمنطقة الموقع — مثال: ١٢ أغسطس ٢٠٢٦ · ٧:٣٠ م */
export function dateTimeLabel(iso: string | null): string {
  if (!iso) return "—";
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return "—";

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: siteTimeZone(),
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(parsed));

  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? "0");
  // بعض إصدارات ICU تعطي ٢٤ لمنتصف الليل مع hour12:false
  const hour = get("hour") % 24;
  const period = hour < 12 ? "ص" : "م";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  const month = AR_MONTHS[Math.min(11, Math.max(0, get("month") - 1))];

  return `${toArabicDigits(get("day"))} ${month} ${toArabicDigits(get("year"))} · ${toArabicDigits(hour12)}:${toArabicDigits(pad2(get("minute")))} ${period}`;
}

/** مبلغ بعملته إن عُرفت، ومجرداً إن لم تصل — لا رمز عملة مكتوب في الكود */
export const amountLabel = (value: number, currency: string | null) =>
  currency ? formatMoney(value, currency) : formatAmount(value);

/* ------------------------------------------------------------------ */
/* المستحق                                                             */
/* ------------------------------------------------------------------ */

/**
 * كتلة المستحق — أبرز عنصر في البطاقة.
 * الجملة تحتها ليست زينة: كثير من المتعهدين يفترضون أن الرقم «سعر العميل ناقص
 * عمولة»، فيقارنون خطأً. قولها صراحةً مرة في كل بطاقة أرخص من نزاع لاحق.
 */
export function PayoutBlock({
  payout,
  currency,
  roundTrip,
  hint,
}: {
  payout: number;
  currency: string | null;
  roundTrip: boolean;
  hint?: ReactNode;
}) {
  return (
    <div className="rounded-xl bg-emerald-50 p-4 ring-1 ring-emerald-200 dark:bg-emerald-950/50 dark:ring-emerald-800">
      <p className="text-xs font-medium text-emerald-900/80 dark:text-emerald-100/80">
        مستحقك عن هذه الرحلة
      </p>
      <p className="font-heading text-2xl font-bold text-emerald-900 tabular-nums dark:text-emerald-50">
        {amountLabel(payout, currency)}
      </p>
      <p className="mt-1 text-xs leading-5 text-emerald-900/80 dark:text-emerald-100/80">
        {hint ?? (
          <>
            هذا ما تتقاضاه أنت عن تنفيذ الرحلة كاملة{roundTrip ? " ذهاباً وعودة" : ""} — محسوب من
            قائمة أسعارك المعتمدة. سعر العميل شأن المنصة ولا يظهر لك.
          </>
        )}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* المسار والتفاصيل                                                     */
/* ------------------------------------------------------------------ */

export function TripRoute({
  originLabel,
  destLabel,
  roundTrip,
}: {
  originLabel: string;
  destLabel: string;
  roundTrip: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <MapPin className="size-4 shrink-0 text-primary" aria-hidden="true" />
      <span className="font-medium">{originLabel || "—"}</span>
      <ArrowLeft className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="font-medium">{destLabel || "—"}</span>
      <Badge variant="outline" className="ms-1">
        {roundTrip ? "ذهاب وعودة" : "اتجاه واحد"}
      </Badge>
    </div>
  );
}

/**
 * ══════════════════════════════════════════════════════════════════════════════
 *  خريطة المسار للمتعهد — 🔴 **بعد الإسناد وحده، ولا لبنةَ لها في بطاقة العرض**
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * الحدّ القائم منذ `0014` و`0028`: قبل القبول وسمٌ معمَّم بلا رقم عقار
 * (`dispatch_public_label`) وملاحظةٌ منقّحة؛ وبعد الإسناد الوسمُ الخام بعنوانه
 * الدقيق وهاتف العميل (`portal_trips()`). **وخريطةٌ دقيقة قبل القبول تنقض ذلك
 * بصورةٍ بدل نصّ** — والرابط يُعاد توجيهه، ولهذا قنّعت `0049` الهاتف أصلاً.
 *
 * ولذلك ثلاث طبقاتٍ متتالية، كلٌّ منها كافيةٌ وحدها:
 *
 *   ١. **بنيوية:** `portal_offers()` لا تُرجع `booking_id` أصلاً — فبطاقة العرض
 *      لا تملك ما تمرّره لهذه اللبنة حتى لو استُدعيت هناك بالخطأ.
 *   ٢. **تركيبية:** هذه اللبنة تُركَّب في `TripCard` وحدها (شاشة «رحلاتي»)
 *      ولا تُركَّب في `OfferCard`.
 *   ٣. **حارسٌ في القاعدة:** `partner_route_map_visible(uuid)` — وجسمُه شرطُ
 *      `where` في `portal_trips()` حرفاً بحرف — يحرس نقطةَ الصورة نفسها، فمن
 *      استنسخ العنوان لا يُجاب.
 *
 * ولا `next/image`: المصدر نقطةُ نهايةٍ خاصة، ومحسّن الصور يضع نسخةً منها في
 * كاشٍ مشترك على القرص خارج الدلو الخاص.
 */
export function TripMap({
  bookingId,
  approximate,
}: {
  bookingId: string | null;
  /** رُسم الخط مستقيماً لتعذّر الهندسة — تُقال، ولا تُترك للتخمين (0079) */
  approximate?: boolean;
}) {
  if (!bookingId) return null;
  return (
    <figure className="flex flex-col gap-2.5 print:break-inside-avoid">
      {/*
        ══ 🔴 الرابط أولاً، والصورة بعده — وهذا ترتيبٌ لا تنسيق ══════════════
        فعلُ المتعهد ليس تأمّل المسار بل **الوصول إلى العميل**. والصورة تُطبع
        على ورقة الرحلة وتُقرأ بنظرة، أما الملاحة الحيّة بالمرور والاتجاهات
        فلا تعطيها صورةٌ ثابتة أبداً — فهي الأولى لمن سيقود.

        ولا إحداثيات في هذه الحمولة: الرابطان يمرّان بمسارٍ يحوّل بعد أن يتحقق
        من الحارس، فتبقى `portal_trips()` بلا إحداثيات كما هي (D-19).
      */}
      <div className={cn("flex flex-wrap gap-2", PRINT_HIDDEN_CLASS)}>
        <a
          href={`/portal/trips/directions/${bookingId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <Navigation className="size-4 shrink-0" aria-hidden="true" />
          الملاحة إلى نقطة الالتقاط
        </a>
        <a
          href={`/portal/trips/directions/${bookingId}?to=route`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <ExternalLink className="size-4 shrink-0" aria-hidden="true" />
          مسار الرحلة كاملاً
        </a>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-muted/40">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/portal/trips/map/${bookingId}`}
          alt={
            approximate
              ? "خريطة تُظهر نقطة الالتقاط ونقطة الوصول وخطاً تقريبياً بينهما."
              : "خريطة تُظهر نقطة الالتقاط ونقطة الوصول ومسار القيادة بينهما."
          }
          width={1280}
          height={720}
          loading="lazy"
          decoding="async"
          className="block h-auto w-full"
        />
      </div>

      <ul className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs">
        <li className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="size-2.5 shrink-0 rounded-full bg-[#2563eb] ring-2 ring-[#2563eb]/25"
          />
          <span className="font-medium">نقطة الالتقاط</span>
        </li>
        <li className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="size-2.5 shrink-0 rounded-full bg-[#16a34a] ring-2 ring-[#16a34a]/25"
          />
          <span className="font-medium">نقطة الوصول</span>
        </li>
      </ul>

      {approximate ? (
        <figcaption className="text-xs leading-6 text-muted-foreground">
          تعذّر رسم مسار القيادة، فالخط تقريبي بين النقطتين — والعنوان المكتوب أعلاه هو المرجع.
        </figcaption>
      ) : null}
    </figure>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl bg-muted/60 px-3 py-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 truncate text-sm font-medium">{children}</dd>
    </div>
  );
}

export type TripFactsInput = {
  distanceKm: number;
  passengers: number;
  roundTrip: boolean;
  waitingHours: number;
  classTitle: string;
  pickupAt: string | null;
};

/** شبكة الحقائق — كل ما يحتاجه المتعهد ليقرر التنفيذ، بلا أي بيانات عميل */
export function TripFacts({ trip }: { trip: TripFactsInput }) {
  return (
    <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      <Fact label="موعد الانطلاق">{dateTimeLabel(trip.pickupAt)}</Fact>
      <Fact label="الفئة المطلوبة">{trip.classTitle || "—"}</Fact>
      <Fact label="الركاب">{passengersLabel(trip.passengers)}</Fact>
      <Fact label="المسافة (اتجاه واحد)">{formatDistance(trip.distanceKm)}</Fact>
      <Fact label="الانتظار">{waitingLabel(trip.waitingHours)}</Fact>
      <Fact label="نوع الرحلة">{trip.roundTrip ? "ذهاب وعودة" : "اتجاه واحد"}</Fact>
    </dl>
  );
}

/**
 * رقم الرحلة الجوية (هجرة `0067`) — بارزاً لا مدسوساً في الملاحظات.
 *
 * ── لماذا بطاقة مستقلة ─────────────────────────────────────────────────────
 * كان يُكتب داخل ملاحظات العميل، فيقرؤه السائق وسط جملةٍ أو لا يقرؤه. وهو
 * **المعلومة الوحيدة التي تحدّد متى يقف فعلاً** في نقل المطار: الرحلة تتأخر
 * ساعتين والموعد المكتوب يصير خطأً، ورقمُها هو ما يُقاس به الواقع.
 *
 * ⚠ ويُعرض `ltr` بخطٍّ أحادي المسافة: `MS736` داخل فقرةٍ عربية ينقلب ترتيبه
 * بصرياً بلا عزل، فيقرأ السائق رقماً غير المكتوب — وهو أسوأ من غيابه.
 */
export function TripFlight({ flightNumber }: { flightNumber: string | null }) {
  if (!flightNumber) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm">
      <Plane className="size-4 shrink-0 text-primary" aria-hidden="true" />
      <span className="font-semibold">رقم الرحلة الجوية:</span>
      <bdi dir="ltr" className="font-mono text-base font-bold tracking-wider">
        {flightNumber}
      </bdi>
    </div>
  );
}

/** ملاحظات العميل على الرحلة — تصل مصفّاة من SQL، ولا تُعرض إن كانت فارغة */
export function TripNotes({ notes }: { notes: string | null }) {
  if (!notes) return null;
  return (
    <div className="rounded-xl bg-muted/60 p-3 text-sm leading-relaxed">
      <span className="font-semibold">ملاحظات الرحلة: </span>
      {notes}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* بيانات التواصل — بعد الإسناد وحده                                    */
/* ------------------------------------------------------------------ */

/**
 * بطاقة تواصل العميل — الروابط من `lib/phone.ts` وحدها.
 *
 * ⚠ كانت هنا نسخةٌ محلية (`digitsOnly` ثم نزع `+`) ورثت العيب الأصلي كاملاً:
 * القاعدة الحية تُظهر أن **٣٣٧ من ٣٤١** حجزاً تحمل هاتف العميل بصفرٍ بادئ
 * (`01188511418`)، فكان الزر يفتح `wa.me/01188511418` أي رسالة «الرقم غير
 * صالح» — وهذه الشاشة يفتحها المتعهد **قبل موعد الانطلاق** ليجد راكبه.
 *
 * والزر يغيب حين يتعذّر بناء الرقم بدل أن يَعِد بمحادثة تنتهي إلى خطأ — الحكم
 * الذي حكمت به `waLink` أصلاً؛ وبقاء `phone` نصّاً بلا رابط أهون من مرساةٍ ميتة.
 */
export function CustomerContact({
  name,
  phone,
  whatsapp,
}: {
  name: string | null;
  phone: string | null;
  whatsapp: string | null;
}) {
  const tel = telLink(phone);
  const wa = waLink(whatsapp);

  return (
    <div className="rounded-xl bg-background p-3 ring-1 ring-border">
      <p className="text-xs text-muted-foreground">التواصل مع العميل</p>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <span className="font-medium">{name || "—"}</span>
        {phone ? (
          tel ? (
            <a
              href={tel}
              className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs transition-colors hover:border-primary hover:text-primary"
            >
              <Phone className="size-3.5" aria-hidden="true" />
              <span dir="ltr">{phone}</span>
            </a>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs" dir="ltr">
              {phone}
            </span>
          )
        ) : null}
        {wa ? (
          <a
            href={wa}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 px-2 py-1 text-xs text-emerald-800 transition-colors hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-200 dark:hover:bg-emerald-950"
          >
            <MessageCircle className="size-3.5" aria-hidden="true" />
            واتساب
          </a>
        ) : null}
        {!phone && !wa ? (
          <span className="text-sm text-muted-foreground">
            لم تصلنا وسيلة تواصل — راسل الإدارة قبل موعد الانطلاق.
          </span>
        ) : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* حالة الرحلة                                                          */
/* ------------------------------------------------------------------ */

const TRIP_STATUS_LABELS: Record<string, string> = {
  assigned: "مُسندة إليك",
  completed: "منفَّذة",
  cancelled: "ملغاة",
  confirmed: "بانتظار الإسناد",
};

const TRIP_STATUS_TONE: Record<string, string> = {
  assigned:
    "border-emerald-300 bg-emerald-100 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-100",
  completed:
    "border-sky-300 bg-sky-100 text-sky-900 dark:border-sky-700 dark:bg-sky-950 dark:text-sky-100",
  cancelled:
    "border-red-300 bg-red-100 text-red-900 dark:border-red-700 dark:bg-red-950 dark:text-red-100",
  confirmed: "border-border bg-muted text-muted-foreground",
};

/**
 * شارة حالة الرحلة. الحالة المجهولة (أو الغائبة عن نتيجة الدالة) تُقرأ «مُسندة
 * إليك» لأن `portal_trips()` لا تُرجع إلا المُسند أصلاً — لا نخترع حالة لم تصل.
 */
export function TripStatusChip({ status }: { status: string | null }) {
  const key = status && status in TRIP_STATUS_LABELS ? status : "assigned";
  return (
    <Badge variant="outline" className={cn(TRIP_STATUS_TONE[key])}>
      {TRIP_STATUS_LABELS[key]}
    </Badge>
  );
}
