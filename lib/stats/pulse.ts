import "server-only";

import type { StatSeries } from "@/lib/analytics-types";
import {
  PULSE_RANGE_DAYS,
  PULSE_SPARK_DAYS,
  type PagePulseSpec,
  type PulseSectionKey,
} from "@/lib/pulse-types";
import type { LoadedStatCard } from "@/lib/stats/cards";
import { cardsByKeys } from "@/lib/stats/cards";
import { addDays, cairoToday } from "@/lib/stats/range";
import {
  blankRead,
  readPulseCards,
  readPulseSeries,
  readStatsCurrency,
  type StatsRead,
  type Supabase,
} from "@/lib/stats/read";

/**
 * سجل نبض الشاشات (الدفعة ٤ — الملاحظة ١٢) — العقد في `lib/pulse-types.ts`.
 *
 * **لماذا سجل واحد بدل وصف في كل صفحة؟** لنفس سبب `STAT_SECTIONS` في
 * `sections.ts`: الاعتماد على ذاكرة من يكتب الشاشة هو ما يُسقط الشاشات التي لا
 * يفكّر فيها أحد. ومن هنا يُقرأ بسطر واحد **أي شاشة لها نبض وأيها لا** — وهو
 * السؤال الذي تطرحه الملاحظة ١٢ نفسها.
 *
 * ⚠ **وغياب شاشة من هذا السجل قرارٌ لا سهو.** الشاشات المستثناة وسببها:
 *
 * | الشاشة | لماذا بلا نبض |
 * |---|---|
 * | `/admin` | تملك بالفعل أغنى مؤشرات في اللوحة من `finance_kpis` — شريطٌ ثانٍ فوقها يضع رقمين لشيء واحد |
 * | `/admin/finance` | سبع بطاقات ومخطط تدفق نقدي قائمة، وهي **المرجع** الذي تقلّده بقية الشاشات |
 * | `/admin/settings` · `/admin/integrations` · `/admin/maintenance` | شاشات إعداد لا تدفّق: ما فيها حالة تُضبط لا كمية تُقاس |
 * | `/admin/seo/settings` · `/admin/seo/business` | شاشتا إعداد بالقاعدة نفسها: قالب عنوان وصورة مشاركة وبطاقة نشاط — حقول تُضبط مرة ولا كمية فيها تُقاس يوماً بيوم. وأثرهما يُقاس على `/admin/seo` (اكتمال الميتاداتا) لا فوق نموذجٍ يُحفَظ |
 * | `/admin/pricing` | مصدره الصادق `bookings.price_source` (متعهد مقابل تعريفة) موجود في القاعدة **ولا قسم يقرؤه بعد** — بند مؤجَّل بوعي لهجرة التصليب، لا شاشة بلا مؤشر إلى الأبد |
 * | `/admin/logs` | **له تدفّق حقيقي** (أحداث في اليوم، وأكثر الكيانات تعديلاً) — والمانع أن `pulse_stats`/`pulse_series` (‏0034 و0035) سبقتا `audit_log` (‏0036) فلا قسم `audit` فيهما أصلاً. فهو **بند مؤجَّل بوعي كـ`/admin/pricing` لا استثناء بقرار**، ومُحفِّزه أول هجرة تضيف قسماً إحصائياً. ولا يُقاس هنا في TypeScript بحال (‏D-05 وقرار الشاشة نفسها: صفر تجميع فيها ولا عدّاد صفوف) |
 * | `/admin/login` · `/admin/set-password` | خارج الحارس أصلاً ولا جلسة فيهما |
 */

/**
 * ما يُسلَّم إلى مكوّن `PagePulse` — نتيجة قراءة واحدة جاهزة للعرض.
 * `cards` و`series` كلاهما `StatsRead` كي تصل حالة «لم تصل ولماذا» إلى الشاشة
 * بدل صفر مخترع.
 */
export type PagePulseData = {
  section: PulseSectionKey;
  cards: StatsRead<LoadedStatCard[]>;
  series: StatsRead<StatSeries[]>;
  currency: string;
  /** وصف الرسم لقارئ الشاشة — من السجل */
  seriesTitle: string | null;
  /** صيغة قيم السلسلة كما نصّ عليها السجل — لا تُستنتج من اسم المفتاح */
  seriesFormat: "number" | "money";
  /** نافذة البطاقات كما تُعرض للمالك: «آخر ٣٠ يوماً» */
  rangeLabel: string;
};

/** الشاشات التي لها نبض — المفتاح هو مسار الشاشة حرفاً بحرف */
export const PAGE_PULSE: Record<string, PagePulseSpec> = {
  "/admin/orders": {
    section: "orders",
    cardKeys: ["orders_count", "orders_value", "avg_order_value", "cancelled_rate"],
    seriesKey: "orders",
    seriesTitle: "الحجوزات يومياً في آخر أسبوعين",
  },
  "/admin/dispatch": {
    section: "dispatch",
    // 🔒 بلا `dispatch_manual_open` رغم أن القسم يُرجعها: الشاشة تعرض الرقم
    // نفسه في بطاقة «طابور يدوي» أسفل الشريط مباشرة. وهما اليوم متطابقان
    // لكنهما يصلان بمسارين مختلفين (‏`security definer` مقابل RLS) فيفترقان
    // يوم تتغيّر إحداهما — و«رقمان لنفس الشيء في شاشة واحدة» هو بعينه ما
    // تمنعه قواعد هذا المشروع. والبطاقة السفلى هي التي تبقى لأنها تحمل نبرة
    // `warning` حين يمتلئ الطابور، وهي نبرة لا يعبّر عنها الشريط بقرار.
    cardKeys: [
      "dispatch_count",
      "dispatch_accept_rate",
      "dispatch_manual_rate",
      "dispatch_first_accept",
    ],
    seriesKey: "dispatch",
    seriesTitle: "دورات البث يومياً في آخر أسبوعين",
  },
  "/admin/quote-requests": {
    section: "quotes",
    cardKeys: [],
    seriesKey: "quotes",
    seriesTitle: "طلبات عروض الأسعار يومياً في آخر أسبوعين",
  },
  "/admin/subcontractors": {
    section: "partners",
    // 🔒 بلا `partner_cost` ولا `gross_profit`: الشاشة تعرض **صفاً لكل متعهد**،
    // ووضع تكلفة الشبكة وهامشها فوق ذلك الجدول يجعل ربطهما بشريك بعينه أسهل
    // مما ينبغي. الرقمان مكانهما شاشة المالية وقسم إحصائيات المتعهدين.
    cardKeys: ["approved_partners", "active_partners", "partner_trips", "accept_rate"],
    seriesKey: null,
  },
  "/admin/fleet": {
    section: "fleet",
    cardKeys: [],
    seriesKey: null,
  },
  "/admin/extras": {
    section: "extras",
    cardKeys: [],
    seriesKey: "extras",
    seriesTitle: "إيراد الخدمات الإضافية يومياً في آخر أسبوعين",
    seriesFormat: "money",
  },
  "/admin/payments": {
    section: "payments",
    cardKeys: [],
    seriesKey: "payments",
    seriesTitle: "جلسات الدفع الإلكتروني يومياً في آخر أسبوعين",
  },
  "/admin/payment-accounts": {
    section: "accounts",
    cardKeys: [],
    seriesKey: "accounts",
    seriesTitle: "الوارد المعتمد يومياً في آخر أسبوعين",
    seriesFormat: "money",
  },
  "/admin/notifications": {
    section: "notifications",
    cardKeys: [],
    seriesKey: "notifications",
    seriesTitle: "الإشعارات يومياً في آخر أسبوعين",
  },
  "/admin/content": {
    section: "content",
    cardKeys: ["pages_published", "pages_draft", "meta_complete_rate", "pages_updated"],
    seriesKey: null,
  },
  "/admin/seo": {
    section: "content",
    cardKeys: ["meta_complete_rate", "meta_missing", "jsonld_pages", "pages_total"],
    seriesKey: null,
  },
  "/admin/seo/redirects": {
    section: "redirects",
    cardKeys: [],
    seriesKey: null,
  },
  "/admin/languages": {
    section: "locales",
    cardKeys: [
      "locales_enabled",
      "avg_percent",
      "translations_missing",
      "translations_stale",
    ],
    seriesKey: null,
  },
  "/admin/discounts": {
    section: "discounts",
    cardKeys: ["active_coupons", "redemptions_count", "discount_amount", "clamped_rate"],
    seriesKey: null,
  },
};

export const pagePulseSpec = (path: string): PagePulseSpec | null => PAGE_PULSE[path] ?? null;

/**
 * قراءة نبض شاشة واحدة — نداءان متوازيان وقراءة عملة.
 *
 * **النافذة ثابتة ولا تُشتق من الرابط** (القاعدة في `pulse-types.ts`): شاشة
 * العمل تملك مرشّحاتها هي، وإقحام منتقي فترة ثانٍ يزاحمها ويجعل رابطين
 * يعرضان الشيء نفسه. والطول ٣٠ يوماً = `DEFAULT_STAT_RANGE` حرفياً كي يطابق
 * رقمُ النبض رقمَ شاشة التحليل حين يفتحها المالك للمقارنة.
 *
 * والفشل **لا يُرمى**: تعذّر قراءة مؤشر لا يجوز أن يُسقط شاشة عملٍ يديرها
 * المالك — تصل حالته في `StatsRead` ويعرضها المكوّن سطراً واحداً.
 */
export async function readPagePulse(
  supabase: Supabase | null,
  path: string
): Promise<PagePulseData | null> {
  const spec = pagePulseSpec(path);
  if (!spec) return null;

  const blank: PagePulseData = {
    section: spec.section,
    cards: blankRead<LoadedStatCard[]>([], "pulse_stats"),
    series: blankRead<StatSeries[]>([], "pulse_series"),
    currency: "EGP",
    seriesTitle: spec.seriesTitle ?? null,
    seriesFormat: spec.seriesFormat ?? "number",
    rangeLabel: "آخر ٣٠ يوماً",
  };

  if (!supabase) return blank;

  const to = cairoToday();
  const from = addDays(to, -(PULSE_RANGE_DAYS - 1));
  const sparkFrom = addDays(to, -(PULSE_SPARK_DAYS - 1));

  const [cards, series, currency] = await Promise.all([
    readPulseCards(supabase, spec.section, from, to),
    // بلا قولبة: `seriesKey` نوعه `PulseSeriesKey` في العقد، فخطأ مطبعي في
    // السجل يسقط عند `tsc` لا عند نداء حيّ يفشل أمام المالك
    spec.seriesKey
      ? readPulseSeries(supabase, spec.seriesKey, sparkFrom, to)
      : Promise.resolve(blank.series),
    readStatsCurrency(supabase),
  ]);

  return {
    ...blank,
    // قائمة فارغة = كل بطاقات القسم (عقد `PagePulseSpec`)، وترشيحٌ لا تجميع
    cards: spec.cardKeys.length
      ? { ...cards, data: cardsByKeys(cards.data, spec.cardKeys) }
      : cards,
    series,
    currency,
  };
}
