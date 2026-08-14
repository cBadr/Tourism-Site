/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  زرع بيانات عرض تجريبي — ستة أشهر تشغيل مُحاكاة (2026-02-13 → 2026-08-13)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   node scripts/demo-seed.mjs            يزرع البيانات (أو pnpm demo:seed)
 *   node scripts/demo-seed.mjs --clean    يمسح كل ما زرعه (أو pnpm demo:clean)
 *
 * ── ما الغرض ───────────────────────────────────────────────────────────────
 * قاعدة فارغة لا تُظهر شيئاً: كل رسم بياني خط مستقيم، وكل شاشة إحصاءات صفر،
 * وكل قائمة سطر واحد. هذا السكربت يملأ القاعدة بشكل **عمل حقيقي** — نمو شهري،
 * وموسمية مصرية (الساحل صيفاً، الغردقة وشرم شتاءً، المطار طوال العام)، وإيقاع
 * أسبوعي (الخميس والجمعة أعلى)، وهبوط في رمضان — كي يرى المالك موقعه ولوحته
 * بحجمهما الواقعي قبل الإطلاق، ثم يمسح كل شيء بأمر واحد.
 *
 * ── القاعدة الأولى: البيانات تمر بدوال النظام لا بإدراج صفوف خام ──────────
 * الحجز عبر `create_booking`، والتحصيل عبر `attach_receipt` + `verify_payment`،
 * والبث عبر `start_dispatch`/`accept_offer`/`reject_offer`/`manual_assign`،
 * والإتمام عبر `set_booking_status`، والمصروفات عبر `record_expense`،
 * ودفعات المتعهدين عبر `record_partner_payout`، وقوائم الأسعار عبر
 * `upsert_price_list`/`submit_price_list`/`review_price_list`.
 * السبب: قيود الدفتر المالي تُكتب بمُشغّلات **داخل معاملة الحدث نفسه**، ولقطات
 * السعر والتكلفة والهامش تُبنى داخل `create_booking`. إدراج صفوف خام يُنتج شكلاً
 * لا يحدث في الواقع ويُفسد الغرض كله. لا يُدرَج صف خام إلا حيث لا توجد دالة:
 * أحداث القمع (`funnel_events` — وهو ما تفعله `lib/analytics/emit.ts` حرفياً)،
 * وحالة طلب عرض السعر (تحديث مباشر كما في `app/admin/quote-requests/actions.ts`).
 *
 * ── التأريخ البعدي (لماذا وكيف) ────────────────────────────────────────────
 * لا تقبل `create_booking` تاريخ إنشاء، و`ledger_on_booking_completed` تكتب
 * `occurred_at = now()` نصّاً. فالطريق الوحيد لجعل ستة أشهر «موجودة أصلاً» هو
 * تنفيذ السيناريو بالدوال الحقيقية الآن ثم إزاحة طوابعه إلى الماضي في تمريرة
 * واحدة داخل نفس المعاملة. الإزاحة **لا تمس أي عمود `status`** في الحجوزات ⇒ لا
 * يُطلق `bookings_guard_status` ولا `bookings_log_status_change` ولا
 * `payments_ledger_approved` ولا أي قيد مُكرَّر. (الاستثناء الوحيد `notifications`:
 * حالتها ليست حالة عمل ولا حارس عليها، وتُوسَم «مُرسَلة» في التمريرة نفسها كي لا
 * تبقى لحظةً واحدة معلّقةً بتاريخ ماضٍ في طابور الموزّع.)
 * ⚠ ولأن `bookings_touch_updated_at` و`dispatches_touch_updated_at`
 *   و`price_lists_touch_updated_at` تفرض `updated_at := now()` عند كل تحديث،
 *   تُعطَّل الثلاثة أثناء الزرع وتُعاد في `finally` (و`--clean` يعيدها أيضاً
 *   كصمام أمان). إن قُتل السكربت قتلاً قاسياً فأعِدها بـ:
 *   `node scripts/demo-seed.mjs --clean`.
 * ⚠ و`subcontractor_drivers` يحمل `updated_at` ومُشغّلاً عليه
 *   (`subcontractor_drivers_touch`) — ومع ذلك **لا يُضاف إلى القائمة**، لأن
 *   المُشغّل `before update` وهذا السكربت **يُدرج ولا يُحدّث** صفوف السائقين
 *   إطلاقاً، فلا يُطلقه شيء. تعطيلُ مُشغّل لا يعمل يوسّع نافذة الخطر (قاعدة
 *   حيّة بمُشغّل معطَّل) بلا مقابل. ومن يضيف يوماً مساراً يُحدّث سائقاً بتاريخ
 *   ماضٍ فعليه أن يضيفه هنا حينها.
 *
 * ── الوسم والمسح ───────────────────────────────────────────────────────────
 * كل صف مزروع يحمل الوسم `DEMO_SEED` في عمود نصّي واحد لجدوله:
 *   bookings        → trip->>'notes'  يبدأ بـ DEMO_SEED
 *   subcontractors  → notes           يبدأ بـ DEMO_SEED
 *   quote_requests  → details         يبدأ بـ DEMO_SEED
 *   expenses        → note            يبدأ بـ DEMO_SEED
 *   partner_payouts → note            يبدأ بـ DEMO_SEED
 *   funnel_events   → class_slug      = 'DEMO_SEED'   (نفس مقبض تنظيف
 *                                      analytics_tests: class_slug='ANLT-FIXTURE')
 *   payment_events  → event_id        يبدأ بـ DEMO_SEED
 *   auth.users      → email           ينتهي بـ @demo-seed.invalid (نطاق محجوز RFC 2606)
 * وما لا عمود نصّي له (payments · booking_events · dispatches · trip_offers ·
 * payment_intents · ledger_entries · notifications · subcontractor_vehicles ·
 * subcontractor_drivers) يُمسك بمفتاحه الأجنبي إلى الصف الموسوم.
 * **لا يُستعمل النطاق الزمني كمُسنَد مسح إطلاقاً.**
 *
 * ⚠ وسجلّا الشريك (`subcontractor_vehicles` و`subcontractor_drivers`) بلا عمود
 *   نصّي يُوسَم — يُمسكان بـ`subcontractor_id` وحده. وسلوك مفتاحيهما **مقروء من
 *   الكتالوج الحيّ لا مفترَض**: `confdeltype = 'c'` على الاثنين، أي أن حذف
 *   المتعهد الموسوم يكنسهما تتالياً. ومع ذلك يحذفهما `--clean` صراحةً قبله —
 *   للعدّاد (كما يفعل بـ`payment_intents`)، ولأن حذفاً صريحاً يبقى صحيحاً لو
 *   بدّلت هجرةٌ لاحقة المفتاح إلى `set null`. والتحقق الذاتي يقيس ما بقي معلّقاً
 *   بمعرّفات المتعهدين المحذوفين، فيفشل لو سقط أيٌّ من الاثنين.
 *
 * وأعمدة طاقم الرحلة على `dispatches` (‏`assigned_vehicle_id` ·
 * `assigned_driver_id` · `crew_by_admin` · `crew_at`) **لا تحتاج تنظيفاً**:
 * `dispatches_booking_id_fkey` بـ`on delete cascade` (مقروء من الكتالوج أيضاً)،
 * فصفُّ الدورة نفسه يزول مع حجزه — ولا يبقى عمود يُنظَّف.
 * والشيء الوحيد خارج القاعدة صورةُ إيصال واحدة في دلو `receipts` على المسار
 * `demo_seed/receipt.png` — لا CASCADE يبلغها، فيحذفها `--clean` صراحةً بمفتاح
 * الخدمة (وبلا المفتاح يطبع تحذيراً بالمسار ليُحذف من اللوحة).
 *
 * ⚠ استثناء صريح ومقصود: `--clean` **يحذف قيوداً من `ledger_entries`** وهو
 *   دفتر append-only بالتصميم (القرار: التصحيح بقيد عاكس لا بحذف). الاستثناء
 *   مقصور على صفوف الديمو الموسومة، ويمر باتصال مالك القاعدة (`postgres`) الذي
 *   يتجاوز RLS والـ grants — ولا يوجد بديل: قيدٌ ديمو غير محذوف يبقى في كشف
 *   الحساب والخزينة إلى الأبد. لا يلمس السكربت أي قيد لم يزرعه هو.
 *
 * ⚠ واستثناء ثانٍ أضيق: `partner_payouts` و`partner_settlements` **المسجَّلة
 *   يدوياً من اللوحة على متعهد ديمو** تُحذف بمُسنَد المتعهد لا بالوسم. مفتاحاهما
 *   `on delete restrict`، فصفٌّ واحد منهما يُسقط التنظيف كله في منتصفه — وهو
 *   ما وقع فعلاً. والحذف يُعلَن بعدّاده في المخرجات، ولا يبلغ متعهدي المالك.
 *
 * ── ما لا يلمسه هذا السكربت أبداً ──────────────────────────────────────────
 * الحجوزات القائمة كلها (منها TR-DX8U6T و TR-ZWXK7D)، والمتعهد القائم «شركة
 * النيل للنقل السياحي» وقائمته المعتمدة، والصفحات والمحتوى والترجمات،
 * و`pricing_settings` و`tariffs` و`dispatch_settings` و`site_settings`
 * و`payment_providers` و`payment_accounts` و`expense_categories` — تُقرأ ولا
 * يُكتب فوقها. (تعديل `pricing_settings` وحده يُسقط `quote_tests`.)
 *
 * ── قيود احترام مجموعات الاختبار (`pnpm db:test` يبقى أخضر) ────────────────
 *   ١) لا قائمة أسعار ديمو **معتمدة** تغطي ممر القاهرة ↔ الإسكندرية إطلاقاً —
 *      `dispatch_tests` تعدّ عروض حجزها على هذا الممر عدّاً مطلقاً (١ ثم ٢)،
 *      و`coverage_tests` تفترض فوز «المتعهد ب» بتكلفة ١٣٠٠ عليه.
 *   ٢) لا قائمة أسعار ديمو تغطي أسوان (24.0889, 32.8998) مع طرف في القاهرة —
 *      `coverage_tests` (أ-٧) و(أ-٨) تؤكدان صفر تطابق. أوسع نطاق حول الأقصر
 *      هنا ٧٠ كم والمسافة إلى أسوان ≈ ١٧٧ كم.
 *   ٣) كل صف مؤرَّخ حصراً بين 2026-02-13 و 2026-08-13 — نافذتا مارس ٢٠١٩
 *      (`finance_tests` القسمان ح و ط) و«قبل عشر سنوات» (`analytics_tests` و-٢)
 *      محجوزتان للاختبارات.
 *   ٤) أحداث القمع تُكتب بحيث `quote_viewed ≤ search_performed` دائماً، ولكل
 *      `booking_paid` مرجعٌ له `booking_created` بنفس المرجع وبتاريخ أسبق —
 *      وإلا تجاوز معدل التحول ١٠٠٪ وأسقط `analytics_tests` (ج-ب-٨).
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⛔ تحذير: لا يُشغَّل هذا السكربت على قاعدة إنتاج فيها بيانات عملاء حقيقيين.
 *    هو يكتب مئات الحجوزات والقيود المالية والإشعارات، ويعطّل مُشغّلَي
 *    `touch_updated_at` مؤقتاً، ويحذف قيوداً من دفتر append-only عند التنظيف.
 *    مكانه قاعدة التطوير أو قاعدة ما قبل الإطلاق — لا غير.
 *
 * ⛔ وأخطر من ذلك وأقل ظهوراً: **قوائم أسعار الديمو تخفض السعر المعروض للجمهور.**
 *    التوقيع الثماني `quote_price` (هجرة 0011) يقلب مصدر السعر إلى
 *    `price_source = 'subcontractor'` على أي ممر تغطيه قائمة **معتمدة**، فيصير
 *    السعر = أرخص تكلفة معتمدة + الهامش بدل (رسم أساسي + مسافة × سعر الكيلو).
 *    وتكاليف الديمو هنا ٦٠–٧٠٪ من التعريفة، فالسعر المعروض على ممرات القاهرة ↔
 *    المطار/السخنة/الغردقة/شرم/الساحل/بورسعيد/طنطا/الأقصر ينزل ~٢٠–٢٥٪ طوال مدة
 *    بقاء البيانات. وثلاثة آثار تتبع ذلك:
 *      ١) أي حجز **حقيقي** يقع في هذه النافذة يُسعَّر بسعر الديمو الرخيص.
 *      ٢) لقطته (`subcontractor_id` · `subcontractor_cost` · `margin_amount`)
 *         تتجمّد على متعهد ديمو، ولا تُعاد حسبتها أبداً بعد الإنشاء.
 *      ٣) `--clean` يحذف المتعهد فتصير اللقطة يتيمة: تكلفة وهامش بلا صاحب.
 *    فإن كان الموقع مفتوحاً للجمهور أثناء العرض التجريبي فأوقف استقبال الحجوزات
 *    أولاً، أو اقبل أن كل حجز يقع في النافذة سيحتاج تصحيحاً يدوياً بعدها.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { deflateSync } from "node:zlib";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import pg from "pg";

// الحيلة الويندوزية الإلزامية — بدونها لا يُقرأ .env.local على Windows
config({
  path: new URL("../.env.local", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"),
  quiet: true,
});

// ═══════════════════════════════════════════════════════════════════════════
// (٠) الثوابت القابلة للضبط
// ═══════════════════════════════════════════════════════════════════════════

const TAG = "DEMO_SEED";
const MAIL_DOMAIN = "demo-seed.invalid"; // نطاق محجوز لا يوجد ولا يستقبل بريداً
const SEED = 20260813; // بذرة العشوائية — نفس التشغيل يعطي نفس النتيجة

const DAY0 = "2026-02-13"; // أول يوم تشغيل مُحاكى
const DAY_N = "2026-08-13"; // آخر يوم (تاريخ المشروع اليوم)

/** عدد الحجوزات لكل شهر — نمو من ١٥ إلى ~٩٠ (فبراير وأغسطس شهران ناقصان) */
const MONTHLY_BOOKINGS = {
  "2026-02": 15, //  ١٣ → ٢٨ فبراير
  "2026-03": 28,
  "2026-04": 42,
  "2026-05": 55,
  "2026-06": 68,
  "2026-07": 84,
  "2026-08": 38, //  ١ → ١٣ أغسطس (بمعدل ~٩٠ للشهر الكامل)
};

/**
 * عدد عمليات البحث لكل حجز في `funnel_events`.
 * ١٢ = نسب تحول واقعية لموقع نقل (بحث ← عرض ٧٨٪ ← حجز ~١٠٪ ← دفع ~٨٠٪)
 * وينتج ~٧٦٠٠ حدثاً. اجعلها ٣ إن أردت ~٢٠٠٠ حدث فقط — لكن معدل «عرض ← حجز»
 * سيقفز إلى ~٤٠٪ وهو رقم لا يحدث في الواقع.
 */
const SEARCH_PER_BOOKING = 12;
const VIEW_RATIO = 0.78; // نسبة من رأى العروض بعد البحث (لا تتجاوز ١ أبداً)

const QUOTE_REQUESTS = 30; // طلبات أسعار يدوية

/**
 * صورة الإيصال المشتركة داخل دلو `receipts` الخاص.
 * مسارٌ لا ملف خلفه = صورة مكسورة في كل طلب، وهي أول ما يفتحه المالك في
 * `/admin/orders/[id]`. فتُرفع صورة واحدة صالحة في بداية الزرع، ويشير إليها كل
 * إيصال، وتُحذف في `--clean`. مقطعان بالضبط كما تشترط سياسة الدلو، والمقطع الأول
 * يحمل الوسم فلا يلتبس بمجلد توكن حجز حقيقي (التوكن ست عشري بطول ٤٨).
 */
const RECEIPT_PATH = `${TAG.toLowerCase()}/receipt.png`;

const CLEAN = process.argv.includes("--clean");

// ═══════════════════════════════════════════════════════════════════════════
// (١) أدوات المخرجات والعشوائية القابلة للتكرار
// ═══════════════════════════════════════════════════════════════════════════

const line = (s = "") => console.log(s);
const head = (s) => {
  line();
  line(`── ${s} ${"─".repeat(Math.max(0, 62 - s.length))}`);
};
const money = (n) =>
  n === null || n === undefined ? "—" : `${Math.round(Number(n)).toLocaleString("ar-EG")} ج.م`;
const num = (n) => Number(n ?? 0).toLocaleString("ar-EG");

/** mulberry32 — مولّد عشوائي ببذرة، ٣٢ بت، يكفي تماماً لبيانات عرض */
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(SEED);
const rInt = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const rFloat = (a, b) => a + rnd() * (b - a);
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const chance = (p) => rnd() < p;
/** اختيار موزون: entries = [[value, weight], ...] */
function weighted(entries) {
  const total = entries.reduce((s, e) => s + e[1], 0);
  let x = rnd() * total;
  for (const [value, w] of entries) {
    x -= w;
    if (x <= 0) return value;
  }
  return entries[entries.length - 1][0];
}
/** خلط قائمة بالبذرة نفسها (Fisher–Yates) */
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ═══════════════════════════════════════════════════════════════════════════
// (٢) الجغرافيا — إحداثيات حقيقية، والمسافة تُشتق منها لا تُخترع
// ═══════════════════════════════════════════════════════════════════════════

const CITY = {
  cairo: { label: "القاهرة", lat: 30.0444, lng: 31.2357 },
  heliopolis: { label: "مصر الجديدة", lat: 30.0808, lng: 31.3222 },
  cairoAirport: { label: "مطار القاهرة الدولي", lat: 30.1219, lng: 31.4056 },
  giza: { label: "الجيزة — الأهرامات", lat: 29.9773, lng: 31.1325 },
  october: { label: "مدينة ٦ أكتوبر", lat: 29.9285, lng: 30.9188 },
  sokhna: { label: "العين السخنة", lat: 29.6, lng: 32.34 },
  hurghada: { label: "الغردقة", lat: 27.2579, lng: 33.8116 },
  gouna: { label: "الجونة", lat: 27.3948, lng: 33.6784 },
  sharm: { label: "شرم الشيخ", lat: 27.9158, lng: 34.33 },
  dahab: { label: "دهب", lat: 28.5091, lng: 34.5136 },
  luxor: { label: "الأقصر", lat: 25.6872, lng: 32.6396 },
  marsaAlam: { label: "مرسى علم", lat: 25.0676, lng: 34.89 },
  alamein: { label: "العلمين الجديدة", lat: 30.83, lng: 28.95 },
  marina: { label: "مارينا — الساحل الشمالي", lat: 30.848, lng: 28.972 },
  rasElhekma: { label: "رأس الحكمة", lat: 31.13, lng: 27.43 },
  matrouh: { label: "مرسى مطروح", lat: 31.3543, lng: 27.2373 },
  alexandria: { label: "الإسكندرية", lat: 31.2001, lng: 29.9187 },
  borgAlarab: { label: "مطار برج العرب", lat: 30.9177, lng: 29.6963 },
  portSaid: { label: "بورسعيد", lat: 31.2653, lng: 32.3019 },
  ismailia: { label: "الإسماعيلية", lat: 30.5965, lng: 32.2715 },
  suez: { label: "السويس", lat: 29.9668, lng: 32.5498 },
  tanta: { label: "طنطا", lat: 30.7865, lng: 31.0004 },
  mansoura: { label: "المنصورة", lat: 31.0409, lng: 31.3785 },
};

/** نفس صيغة `public.haversine_km` — نصف قطر ٦٣٧١ كم */
function haversineKm(a, b) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/**
 * مسافة الطريق = المسافة المستقيمة × معامل الطرق المصرية (١٫١٥–١٫٤٠).
 * 🔒 حارس `create_booking` يشترط أن تقع المسافة في [٠٫٩×المستقيمة, ٣×المستقيمة]
 *    فالمعامل هنا داخل النافذة بأمان وبلا حساب سعرٍ من عندنا.
 */
const roadKm = (a, b) => Math.round(haversineKm(a, b) * rFloat(1.15, 1.4) * 10) / 10;

/**
 * المسارات — `season` يحدد الموسمية: صيفي (الساحل) · شتوي (البحر الأحمر والصعيد)
 * · ثابت (المطار والمدن). و`base` وزن الطلب النسبي على مدار العام.
 */
const ROUTES = [
  { from: "cairo", to: "cairoAirport", base: 10, season: "flat", pax: "small" },
  { from: "cairoAirport", to: "cairo", base: 9, season: "flat", pax: "small" },
  { from: "cairoAirport", to: "giza", base: 4, season: "flat", pax: "small" },
  { from: "cairo", to: "giza", base: 5, season: "flat", pax: "small" },
  { from: "cairo", to: "october", base: 3, season: "flat", pax: "small" },
  { from: "cairo", to: "sokhna", base: 6, season: "summer", pax: "mid" },
  { from: "cairo", to: "hurghada", base: 7, season: "winter", pax: "mid" },
  { from: "cairo", to: "gouna", base: 3, season: "winter", pax: "mid" },
  { from: "cairo", to: "sharm", base: 6, season: "winter", pax: "mid" },
  { from: "cairo", to: "dahab", base: 2, season: "winter", pax: "mid" },
  { from: "cairo", to: "luxor", base: 4, season: "winter", pax: "big" },
  { from: "cairo", to: "marsaAlam", base: 2, season: "winter", pax: "mid" },
  { from: "cairo", to: "alamein", base: 8, season: "summer", pax: "mid" },
  { from: "cairo", to: "marina", base: 7, season: "summer", pax: "mid" },
  { from: "cairo", to: "matrouh", base: 3, season: "summer", pax: "mid" },
  { from: "alexandria", to: "marina", base: 4, season: "summer", pax: "mid" },
  { from: "alexandria", to: "alamein", base: 4, season: "summer", pax: "mid" },
  { from: "alexandria", to: "matrouh", base: 3, season: "summer", pax: "mid" },
  { from: "alexandria", to: "rasElhekma", base: 2, season: "summer", pax: "mid" },
  { from: "borgAlarab", to: "alexandria", base: 3, season: "flat", pax: "small" },
  { from: "cairo", to: "alexandria", base: 6, season: "mixed", pax: "mid" },
  { from: "cairo", to: "portSaid", base: 3, season: "flat", pax: "mid" },
  { from: "cairo", to: "ismailia", base: 3, season: "flat", pax: "small" },
  { from: "cairo", to: "suez", base: 3, season: "flat", pax: "small" },
  { from: "cairo", to: "tanta", base: 2, season: "flat", pax: "small" },
  { from: "cairo", to: "mansoura", base: 2, season: "flat", pax: "small" },
];

/** أوزان الموسم بحسب رقم الشهر (٢..٨ هي نافذتنا) */
const SEASON_WEIGHT = {
  flat: { 2: 1, 3: 1, 4: 1.05, 5: 1, 6: 1.05, 7: 1.1, 8: 1.1 },
  summer: { 2: 0.12, 3: 0.18, 4: 0.35, 5: 0.85, 6: 1.9, 7: 2.5, 8: 2.6 },
  winter: { 2: 1.9, 3: 1.75, 4: 1.35, 5: 0.8, 6: 0.5, 7: 0.45, 8: 0.5 },
  mixed: { 2: 0.8, 3: 0.9, 4: 1, 5: 1.1, 6: 1.35, 7: 1.5, 8: 1.5 },
};

/** الإيقاع الأسبوعي — 0 = الأحد … 6 = السبت */
const WEEKDAY_WEIGHT = [1.2, 0.85, 0.8, 0.9, 1.6, 1.5, 1.15];

/** رمضان ٢٠٢٦ تقريباً: ١٧ فبراير → ١٩ مارس — هبوط واضح في الطلب */
const RAMADAN_FROM = Date.UTC(2026, 1, 17);
const RAMADAN_TO = Date.UTC(2026, 2, 19);
/** أسبوع حملة تسويقية — قفزة لا تجعل المنحنى خطاً مستقيماً */
const CAMPAIGN_FROM = Date.UTC(2026, 4, 18);
const CAMPAIGN_TO = Date.UTC(2026, 4, 25);
/** أسبوعان هادئان بلا سبب ظاهر — هكذا تبدو الأعمال الحقيقية */
const QUIET_WEEKS = [
  [Date.UTC(2026, 3, 6), Date.UTC(2026, 3, 13)],
  [Date.UTC(2026, 5, 22), Date.UTC(2026, 5, 29)],
];

function dayFactor(d) {
  const t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  let f = WEEKDAY_WEIGHT[d.getUTCDay()];
  if (t >= RAMADAN_FROM && t <= RAMADAN_TO) f *= 0.55;
  if (t >= CAMPAIGN_FROM && t <= CAMPAIGN_TO) f *= 1.9;
  for (const [a, b] of QUIET_WEEKS) if (t >= a && t <= b) f *= 0.45;
  return f;
}

// ═══════════════════════════════════════════════════════════════════════════
// (٣) المتعهدون — ستة معتمدون بأداء متفاوت، وواحد موقوف وواحد بانتظار الاعتماد
// ═══════════════════════════════════════════════════════════════════════════

/**
 * `acceptRate` و`rejectRate` هما ما يجعل شاشة «إحصائيات المتعهدين» ذات معنى:
 * الأول سريع القبول عالي الحجم، والثالث بطيء يرفض كثيراً، والسادس جديد بدأ
 * في يوليو. و`costFactor` نسبة تكلفته من سعر التعريفة (الأقل يفوز بالبث).
 *
 * 🔒 لا مسار هنا يجمع طرفاً في القاهرة مع طرف في الإسكندرية، ولا نطاق يبتلع
 *    أسوان — انظر «قيود احترام مجموعات الاختبار» في الترويسة.
 */
const PARTNERS = [
  {
    key: "nasr",
    name: "شركة النصر لخدمات النقل",
    contact: "عمرو الشناوي",
    phone: "01001472583",
    status: "approved",
    joinMonth: 2,
    login: true,
    acceptRate: 0.78,
    rejectRate: 0.14,
    costFactor: 0.63,
    classes: ["sedan", "suv", "minibus"],
    lists: [
      { title: "القاهرة ↔ مطار القاهرة", a: "cairo", b: "cairoAirport", ra: 45, rb: 25 },
      { title: "القاهرة ↔ الجيزة و٦ أكتوبر", a: "cairo", b: "october", ra: 35, rb: 30 },
      { title: "القاهرة ↔ العين السخنة", a: "cairo", b: "sokhna", ra: 55, rb: 40 },
    ],
  },
  {
    key: "delta",
    name: "دلتا ترافل للنقل السياحي",
    contact: "هشام عبد اللطيف",
    phone: "01223698741",
    status: "approved",
    joinMonth: 2,
    login: true,
    acceptRate: 0.55,
    rejectRate: 0.28,
    costFactor: 0.66,
    classes: ["sedan", "suv", "minibus"],
    lists: [
      { title: "القاهرة ↔ بورسعيد", a: "cairo", b: "portSaid", ra: 55, rb: 40 },
      // النطاق ٨٠ كم حول الإسماعيلية يبتلع السويس (≈٧٠ كم) ولا يقترب من
      // الإسكندرية ولا من أسوان — وهذا هو الحد الذي لا يجوز تجاوزه هنا.
      { title: "القاهرة ↔ الإسماعيلية والسويس", a: "cairo", b: "ismailia", ra: 55, rb: 80 },
      // و٦٠ كم حول طنطا يبتلع المنصورة (≈٤٥ كم) ويبقى دون الإسكندرية (≈٩٥ كم)
      { title: "القاهرة ↔ طنطا والمنصورة", a: "cairo", b: "tanta", ra: 55, rb: 60 },
    ],
  },
  {
    key: "redsea",
    name: "البحر الأحمر للنقل السياحي",
    contact: "سامح فتحي",
    phone: "01005847213",
    status: "approved",
    joinMonth: 3,
    login: true,
    acceptRate: 0.62,
    rejectRate: 0.2,
    costFactor: 0.65,
    classes: ["sedan", "suv", "minibus", "bus"],
    lists: [
      { title: "القاهرة ↔ الغردقة والجونة", a: "cairo", b: "hurghada", ra: 55, rb: 60 },
      { title: "القاهرة ↔ شرم الشيخ", a: "cairo", b: "sharm", ra: 55, rb: 60 },
      { title: "القاهرة ↔ دهب", a: "cairo", b: "dahab", ra: 55, rb: 45 },
      { title: "القاهرة ↔ مرسى علم", a: "cairo", b: "marsaAlam", ra: 55, rb: 55 },
    ],
  },
  {
    key: "sahel",
    name: "ساحل لاين للرحلات",
    contact: "كريم المصري",
    phone: "01115963247",
    status: "approved",
    joinMonth: 4,
    login: true,
    acceptRate: 0.66,
    rejectRate: 0.18,
    costFactor: 0.64,
    classes: ["sedan", "suv", "minibus"],
    lists: [
      { title: "القاهرة ↔ الساحل الشمالي", a: "cairo", b: "alamein", ra: 55, rb: 60 },
      { title: "الإسكندرية ↔ الساحل الشمالي", a: "alexandria", b: "alamein", ra: 45, rb: 60 },
      { title: "الإسكندرية ↔ مرسى مطروح", a: "alexandria", b: "matrouh", ra: 45, rb: 55 },
      { title: "القاهرة ↔ مرسى مطروح", a: "cairo", b: "matrouh", ra: 55, rb: 55 },
    ],
  },
  {
    key: "saeed",
    name: "صعيد مصر للرحلات السياحية",
    contact: "أنور جاد الرب",
    phone: "01288417539",
    status: "approved",
    joinMonth: 4,
    login: true,
    // البطيء الذي يرفض كثيراً — وجوده هو ما يجعل شاشة الأداء تفرّق بين متعهد وآخر
    acceptRate: 0.24,
    rejectRate: 0.52,
    costFactor: 0.7,
    classes: ["sedan", "suv", "minibus", "bus"],
    // 🔒 نطاق ٧٠ كم حول الأقصر لا يبلغ أسوان (≈١٧٧ كم) — شرط بقاء coverage_tests خضراء
    lists: [{ title: "القاهرة ↔ الأقصر", a: "cairo", b: "luxor", ra: 55, rb: 70 }],
  },
  {
    key: "wafaa",
    name: "الوفاء ترانسبورت",
    contact: "مصطفى بدوي",
    phone: "01554789632",
    status: "approved",
    joinMonth: 7, // المتعهد الجديد — بدأ الشهر الماضي فلا أثر له قبل يوليو
    login: true,
    acceptRate: 0.72,
    rejectRate: 0.12,
    costFactor: 0.6, // يدخل بسعر منافس ليأخذ حصة
    classes: ["sedan", "suv"],
    lists: [
      { title: "مطار القاهرة ↔ القاهرة الكبرى", a: "cairoAirport", b: "cairo", ra: 30, rb: 45 },
      { title: "القاهرة ↔ السخنة السريع", a: "cairo", b: "sokhna", ra: 50, rb: 40 },
    ],
  },
  {
    key: "sama",
    name: "سما مصر للنقل",
    contact: "وليد حمزة",
    phone: "01099634785",
    status: "suspended", // كان يعمل ثم أُوقف — لا يدخل التسعير ولا البث
    joinMonth: 2,
    login: false,
    acceptRate: 0,
    rejectRate: 0,
    costFactor: 0.72,
    classes: ["sedan", "suv"],
    lists: [{ title: "القاهرة ↔ الإسماعيلية", a: "cairo", b: "ismailia", ra: 45, rb: 40 }],
  },
  {
    key: "amana",
    name: "رحلات الأمانة",
    contact: "طارق سليم",
    phone: "01277451963",
    status: "pending", // ما زال بانتظار الاعتماد — قائمته لم تُراجَع بعد
    joinMonth: 7,
    login: false,
    acceptRate: 0,
    rejectRate: 0,
    costFactor: 0.68,
    classes: ["sedan"],
    lists: [
      { title: "القاهرة ↔ بورسعيد", a: "cairo", b: "portSaid", ra: 45, rb: 40, keepPending: true },
    ],
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// (٤) بيانات العملاء والملاحظات — عربية معقولة، بلا أي علاقة بأشخاص حقيقيين
// ═══════════════════════════════════════════════════════════════════════════

const FIRST = [
  "أحمد","محمد","محمود","مصطفى","خالد","عمرو","يوسف","كريم","طارق","هشام",
  "شريف","ياسر","إسلام","عبد الرحمن","حسام","وائل","أيمن","رامي","بلال","زياد",
  "منى","سارة","نهى","هبة","دينا","مروة","ياسمين","إيمان","رنا","فاطمة",
  "نورهان","أميرة","سلمى","شيماء","هند","ملك","جيهان","ريهام","آية","مي",
];
const LAST = [
  "عبد العزيز","الشناوي","حسن","السيد","فؤاد","عبد الله","النجار","سليمان","مرسي","زكي",
  "الجندي","صبري","عثمان","الغريب","بدوي","رشدي","عوض","الديب","شاهين","المصري",
];
const NOTES = [
  "الرجاء الاتصال قبل الوصول بنصف ساعة.",
  "معنا حقائب كبيرة — نحتاج شنطة واسعة.",
  "الرحلة لعائلة فيها طفلان، يُفضَّل كرسي أطفال.",
  "الرجاء الالتزام بالموعد تماماً، عندنا طيران.",
  "نفضّل سائقاً يتحدث الإنجليزية إن أمكن.",
  "توقف قصير في الطريق للاستراحة مقبول.",
  "العميل من الشركة — الفاتورة باسم الشركة.",
  "الرجاء التأكيد على الواتساب قبل الرحلة بيوم.",
  "التحميل من البوابة الرئيسية للكمبوند.",
  "رحلة عمل — يُفضَّل سيارة حديثة الموديل.",
  "",
  "",
  "",
];
const REJECT_REASONS = [
  "كل سياراتي مرتبطة في هذا الموعد.",
  "المستحق أقل من تكلفتي على هذا المسار.",
  "المسافة بعيدة والسائق المتاح لن يصل في الوقت.",
  "لدينا صيانة طارئة لسيارتين اليوم.",
  "الموعد يتعارض مع رحلة أخرى مؤكدة.",
];
const CANCEL_REASONS = [
  "العميل ألغى الرحلة قبل موعدها",
  "تغيّرت خطة سفر العميل",
  "لم يصل التحويل خلال المهلة",
  "العميل حجز مرتين بالخطأ",
  "طلب العميل تأجيل الرحلة إلى موعد لاحق",
];
const QUOTE_DETAILS = [
  "نحتاج نقل ٣٥ فرداً من القاهرة إلى الغردقة ذهاباً وعودة لمدة ٤ أيام.",
  "شركة سياحة تبحث عن تعاقد شهري لنقل موظفيها من مدينة نصر إلى ٦ أكتوبر.",
  "مؤتمر طبي في العلمين — نحتاج ٣ ميني باص لمدة يومين.",
  "رحلة عائلية إلى شرم الشيخ لسبعة أفراد مع توقف في دهب.",
  "نقل ضيوف حفل زفاف من مطار القاهرة إلى فندق بالتجمع الخامس.",
  "برنامج سياحي أسبوعي: القاهرة — الأقصر — أسوان لمجموعة أجنبية.",
  "نحتاج سيارة بسائق طوال اليوم لثلاثة أيام داخل القاهرة.",
  "نقل فريق عمل من الإسكندرية إلى مرسى مطروح مع الإقامة.",
  "رحلة يومية إلى العين السخنة لمجموعة من ١٢ فرداً.",
  "خدمة استقبال بالمطار مع لافتة باسم الضيف — عدد ٦ وصولات شهرياً.",
];
const EXPENSE_NOTES = {
  وقود: ["تموين أسطول الأسبوع", "بنزين ٩٥ — دفعة أسبوعية", "سولار للباصات"],
  صيانة: ["صيانة دورية وتغيير زيت", "إصلاح فرامل ومكيّف", "إطارات جديدة"],
  عمولات: ["عمولة حجوزات الشهر", "عمولة وسطاء الرحلات"],
  رواتب: ["رواتب السائقين", "رواتب فريق التشغيل"],
  تسويق: ["حملة إعلانات مدفوعة", "تصوير ومحتوى", "رعاية معرض سياحي"],
  إداري: ["إيجار المكتب والمرافق", "اشتراكات واتصالات"],
};

const arabicName = () => `${pick(FIRST)} ${pick(LAST)}`;
const arabicPhone = () => `${pick(["010", "011", "012", "015"])}${rInt(10000000, 99999999)}`;

// ═══════════════════════════════════════════════════════════════════════════
// (٤-١) طواقم المتعهدين — سائقون وألوان مركبات (الدفعة ٥، الملاحظة ٥)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * مولّد عشوائي **ثانٍ** ببذرة مجاورة — لا نفس المولّد.
 *
 * السبب بنيوي لا تجميلي: كل سحبة من `rnd()` تزيح السلسلة كلها لما بعدها. فلو
 * سحب السائقون والألوان والطاقم أرقامهم من المولّد الرئيسي لتغيّرت **كل**
 * حجوزات الستة أشهر: مساراتها ومصائرها وأي متعهد فاز بها — أي أن إضافة ميزةٍ
 * تُعيد كتابة البيانات التي بُنيت عليها قراءات سابقة ولقطات شاشة. مولّد ثانٍ
 * يجعل الدفعة ٥ **إضافةً خالصة**: ما كان يُزرع أمس يُزرع اليوم حرفاً بحرف،
 * والجديد وحده جديد. (وهو نفس ما حرص عليه `receiptPng` حين امتنع عن لمس
 * `rnd()` — انظر تعليقها.)
 */
const rndCrew = mulberry32(SEED + 1);
const cInt = (a, b) => a + Math.floor(rndCrew() * (b - a + 1));
const cPick = (arr) => arr[Math.floor(rndCrew() * arr.length)];
const cChance = (p) => rndCrew() < p;

/**
 * ألوان المركبات — نصّ حرّ بالعربية كما ينصّ `0040` على عمود `color`
 * («فضي» و«رمادي فاتح» وصفان مشروعان، ولا قائمة مغلقة).
 * والتكرار في القائمة **هو** الترجيح: الأبيض والفضي يغلبان على أساطيل النقل
 * السياحي في مصر، وقائمةٌ متساوية الاحتمالات تُنتج أسطولاً بألوان لا يشبه أي
 * أسطول حقيقي — والغرض من هذا السكربت كله أن تبدو البيانات كعمل قائم.
 */
const VEHICLE_COLORS = [
  "أبيض", "أبيض", "أبيض", "أبيض", "أبيض",
  "فضي", "فضي", "فضي", "فضي",
  "أسود", "أسود", "أسود",
  "رمادي", "رمادي",
  "رمادي فاتح",
  "بيج",
  "أزرق داكن",
];

/**
 * ⚠ هاتف السائق يخالف عرف أرقام المتعهدين أعلاه **عن قصد** — اقرأ هذا قبل أن
 * «توحّد» الاثنين.
 *
 * أرقام جهات اتصال المتعهدين (`01001472583` وأخواتها في `PARTNERS`) تبدو أرقاماً
 * مصرية حقيقية، وهي مقبولة هناك لأنها لا تغادر اللوحة والبورتال: لا شاشة تعرضها
 * لعميل، ولا أحد يتصل بها إلا نحن.
 *
 * أما رقم السائق فالدفعة ٥ **تكشفه للعميل** داخل `get_booking_by_token` قبل موعد
 * الالتقاء بمدة، وصفحة `/booking/[token]` تعرضه بوصفه «رقم من سيأتيك» — أي أنه
 * رقمٌ **يُطلَب فعلاً**. وعرضٌ تجريبي يُفتح أمام المالك وضيوفه معناه أن أول من
 * يجرّب سيتصل. فرقمٌ «معقول الشكل» هنا قد يكون رقم إنسان حقيقي لا علاقة له بنا،
 * يرن هاتفه لأننا اخترنا الواقعية في الحقل الخطأ.
 *
 * فالشكل صناعيٌّ لا يُخطئه أحد: `010` ثم أصفار ثم عدّاد. ويبقى **صحيح الشكل**
 * (أحد عشر رقماً ببادئة مشغّل مصرية) كي يمر عليه تطبيع الهاتف من الدفعة ١ مروراً
 * حقيقياً لا كحالة شاذة مستثناة.
 */
let driverPhoneSeq = 0;
const driverPhone = () => `0100000${String(++driverPhoneSeq).padStart(4, "0")}`;

/**
 * رقم الرخصة — للشريك والإدارة، **ولا يصل العميل** (غائب من نوع إرجاع
 * `get_booking_by_token` أصلاً، ويحرسه `crew_tests` القسم ح).
 *
 * والبادئة الحرفية ليست زينة: الفحص الشامل في `audit_tests` (ب-٣-٥) يمسح
 * `audit_log` كله بحثاً عن `01` وتسعة أرقام بعدها محاطةً بحدود كلمة، ورقمُ رخصةٍ
 * رقميٌّ محض بأحد عشر خانة قد يصادف النمط فيرنّ إنذارٌ كاذب — وهو بالضبط ما وقع
 * سابقاً مع هاش مسار إيصال. `license_no` ليس عموداً محجوباً (ولا يحتاج: لا يصل
 * العميل)، فيُكتب بشكلٍ لا يلتبس برقم هاتف أصلاً.
 */
const driverLicense = () => `DL-${cInt(2019, 2026)}-${cInt(100000, 999999)}`;

/** المتعهد الذي يحمل سجلّه سائقاً متوقفاً — انظر seedDrivers أدناه */
const INACTIVE_DRIVER_PARTNER = "nasr";

/**
 * يزرع سجلّ سائقي متعهد واحد ويُرجع `{ total, stopped }`.
 *
 * ثلاثة إلى خمسة: أقلُّ من ثلاثة يجعل قائمة الاختيار في نموذج الطاقم سطراً أو
 * سطرين فلا تُرى كقائمة، وأكثرُ من خمسة لا يضيف شيئاً إلى العرض.
 *
 * وواحدٌ **متوقف** عند متعهد واحد بعينه (`INACTIVE_DRIVER_PARTNER`): مسارُ
 * «المتوقف لا يظهر في قائمة الاختيار» في `crew-panel.tsx` شرطٌ حقيقي في الكود
 * (`row.active || row.id === selectedId`) وليس له حالةٌ واحدة في القاعدة اليوم،
 * فيبقى غير مرئي حتى يكسره أحد. وهذا السائق يُسنَد لاحقاً إلى رحلةٍ **منفّذة**
 * (انظر قسم الطاقم) فيُغطّى طرفا الشرط معاً: يختفي من قائمة رحلةٍ جديدة، ويبقى
 * مقروءاً بوسم «متوقف» على الرحلة التي نفّذها فعلاً — وهي القصة الحقيقية:
 * سائقٌ ترك الشركة بعد أن قاد لها شهوراً.
 *
 * ⚠ الأسماء من النصف الأول من `FIRST` وحده: النصف الثاني أسماء نسائية، وسجلّ
 *   أسطول نقل سياحي مصري لا يبدو كذلك — والغرض بيانات تُشبه الواقع لا عيّنة
 *   متوازنة.
 */
async function seedDrivers(p, subId, joinedAt) {
  const MALE_FIRST = FIRST.slice(0, 20);
  const total = cInt(3, 5);
  const used = new Set();
  let stopped = 0;

  for (let i = 0; i < total; i++) {
    let name = `${cPick(MALE_FIRST)} ${cPick(LAST)}`;
    while (used.has(name)) name = `${cPick(MALE_FIRST)} ${cPick(LAST)}`;
    used.add(name);

    // الأولان مع الانضمام، ومن بعدهما يُضاف على مدار الشهور كما ينمو الأسطول.
    // 🔒 والسقف `END`: كل صف في هذا السكربت يقع داخل نافذة المحاكاة، وسائقٌ
    //    «انضم» بعد آخر يوم يظهر في السجل بتاريخ مستقبلي بلا رحلة تفسّره.
    const at =
      i < 2
        ? joinedAt
        : new Date(Math.min(addDays(joinedAt, cInt(10, 150)).getTime(), END.getTime()));

    const isStopped = p.key === INACTIVE_DRIVER_PARTNER && i === total - 1;
    if (isStopped) stopped++;

    await q(
      `insert into public.subcontractor_drivers
         (subcontractor_id, name, phone, license_no, active, created_at, updated_at)
       values ($1::uuid, $2::text, $3::text, $4::text, $5::boolean, $6::timestamptz, $6::timestamptz)`,
      [subId, name, driverPhone(), driverLicense(), !isStopped, iso(at)]
    );
  }

  return { total, stopped };
}

// ═══════════════════════════════════════════════════════════════════════════
// (٥) الاتصال
// ═══════════════════════════════════════════════════════════════════════════

if (!process.env.DATABASE_URL) {
  console.error("❌ DATABASE_URL غير موجود في .env.local — أضِف رابط Session pooler وأعد المحاولة.");
  process.exit(1);
}

const c = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  statement_timeout: 120000,
});
await c.connect();

const q = (sql, params) => c.query(sql, params);
const one = async (sql, params) => (await c.query(sql, params)).rows[0] ?? null;

/**
 * محاولة قد تفشل فشلاً **مشروعاً** داخل معاملة (سبقك متعهد آخر · انتهت المهلة ·
 * البوابة رفضت). بلا نقطة حفظ يكفي استثناء واحد لإجهاض المعاملة كلها فتفشل كل
 * جملة بعده بـ «current transaction is aborted» — وهذا بالضبط ما يجعل سكربتاً
 * كهذا يزرع نصف حجز ثم يسقط بلا سبب مفهوم.
 */
let spSeq = 0;
async function attempt(fn) {
  const sp = `sp_${++spSeq}`;
  await q(`savepoint ${sp}`);
  try {
    const r = await fn();
    await q(`release savepoint ${sp}`);
    return { ok: true, value: r };
  } catch (e) {
    await q(`rollback to savepoint ${sp}`);
    return { ok: false, error: e };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// (٥-١) دلو الإيصالات — ملف واحد صالح بدل مسارات لا ملفات خلفها
// ═══════════════════════════════════════════════════════════════════════════

/**
 * التخزين ليس في القاعدة: `attach_receipt` تكتب المسار نصّاً ولا تعرف شيئاً عن
 * الملف. فمسارٌ بلا ملف يعطي رابطاً موقّعاً يرد 404 ⇒ صورة مكسورة في كل طلب.
 * نرفع صورة واحدة بمفتاح الخدمة (الدلو خاص، وسياسة القراءة محصورة بالمشرف —
 * ومفتاح الخدمة يتجاوز RLS كما تفعل `signReceipt` في صفحة الطلب).
 * وغياب المفتاح **لا يمنع الزرع**: يسقط إلى المسار القديم مع تحذير صريح.
 */
let storageClient = null;
function storage() {
  if (storageClient !== null) return storageClient || null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  storageClient = url && key
    ? createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
    : false;
  return storageClient || null;
}

/** جدول CRC32 القياسي (بلا مكتبة — PNG يفرض CRC على كل مقطع) */
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let x = n;
    for (let k = 0; k < 8; k++) x = x & 1 ? 0xedb88320 ^ (x >>> 1) : x >>> 1;
    t[n] = x;
  }
  return t;
})();
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function pngChunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

/**
 * إيصال تحويل وهمي — مستطيلات لا نصّ (لا خط عربي في Node بلا مكتبة، وحرف
 * لاتيني وحده يبدو أغرب من شريط رمادي). ⚠ لا يستدعي `rnd()` إطلاقاً: استهلاك
 * رقم واحد من المولّد يزيح كل بيانات الزرع بعده ويكسر «نفس البذرة نفس النتيجة».
 */
function receiptPng() {
  const W = 560;
  const H = 760;
  const px = Buffer.alloc(W * H * 3, 0xff);
  const rect = (x, y, w, h, [r, g, b]) => {
    const x0 = Math.max(0, x);
    const x1 = Math.min(W, x + w);
    for (let yy = Math.max(0, y); yy < Math.min(H, y + h); yy++) {
      let o = (yy * W + x0) * 3;
      for (let xx = x0; xx < x1; xx++) {
        px[o++] = r;
        px[o++] = g;
        px[o++] = b;
      }
    }
  };

  const PAPER = [244, 244, 245];
  const CARD = [255, 255, 255];
  const EDGE = [226, 227, 232];
  const BRAND = [37, 99, 235];
  const LIGHT = [191, 219, 254];
  const TEXT = [203, 205, 213];
  const DARK = [148, 151, 163];
  const OK = [22, 163, 74];
  const OKBG = [240, 253, 244];

  rect(0, 0, W, H, PAPER);
  rect(30, 30, W - 60, H - 60, CARD);
  rect(30, 30, W - 60, 2, EDGE);
  rect(30, H - 32, W - 60, 2, EDGE);
  rect(30, 30, 2, H - 60, EDGE);
  rect(W - 32, 30, 2, H - 60, EDGE);

  // ترويسة البنك/المحفظة
  rect(30, 30, W - 60, 96, BRAND);
  rect(62, 58, 190, 16, CARD);
  rect(62, 86, 120, 10, LIGHT);
  rect(W - 132, 58, 70, 44, LIGHT);

  // سطور البيانات — عرض متفاوت ثابت كي يبدو نصّاً لا شبكة
  const rows = [150, 105, 170, 125, 190, 140, 115, 165];
  rows.forEach((w, i) => {
    const y = 160 + i * 44;
    rect(62, y, w, 12, TEXT);
    rect(W - 62 - (i % 3 === 0 ? 160 : 120), y, i % 3 === 0 ? 160 : 120, 12, DARK);
    rect(62, y + 28, W - 124, 1, [238, 239, 243]);
  });

  // صندوق المبلغ
  rect(62, 528, W - 124, 92, OKBG);
  rect(62, 528, 6, 92, OK);
  rect(86, 552, 130, 14, DARK);
  rect(86, 584, 210, 20, OK);

  // تذييل: مرجع العملية وختم
  rect(62, 652, 240, 12, TEXT);
  rect(62, 680, 180, 10, TEXT);
  rect(W - 172, 640, 110, 62, LIGHT);

  // صفوف PNG: بايت مرشّح (٠) ثم البكسلات
  const raw = Buffer.alloc(H * (W * 3 + 1));
  for (let y = 0; y < H; y++) {
    raw[y * (W * 3 + 1)] = 0;
    px.copy(raw, y * (W * 3 + 1) + 1, y * W * 3, (y + 1) * W * 3);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // عمق ٨ بت
  ihdr[9] = 2; // RGB بلا شفافية
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

/** يرفع صورة الإيصال مرة واحدة — يُرجع المسار المستعمل أو null إن تعذّر */
async function uploadReceipt() {
  const s = storage();
  if (!s) {
    line("   ⚠ لا NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY — لن تُرفع صورة إيصال");
    line("     (المسارات ستشير إلى ملفات غير موجودة فتظهر صورة مكسورة في صفحة الطلب)");
    return null;
  }
  const { error } = await s.storage
    .from("receipts")
    .upload(RECEIPT_PATH, receiptPng(), { contentType: "image/png", upsert: true });
  if (error) {
    line(`   ⚠ تعذّر رفع صورة الإيصال (${error.message}) — ستبقى الصورة مكسورة في العرض`);
    return null;
  }
  return RECEIPT_PATH;
}

/** يحذفها في التنظيف — بأفضل جهد: فشله لا يترك أثراً في القاعدة */
async function removeReceipt(quiet = false) {
  const s = storage();
  if (!s) {
    // لا نصمت حين كان هناك ما يُحذف: التشغيل الذي زرع كان يملك المفتاح غالباً،
    // فالملف موجود ولن يزول من تلقاء نفسه.
    if (!quiet) {
      line(`   ⚠ بلا مفتاح خدمة لا يمكن حذف ${RECEIPT_PATH} من دلو receipts — احذفه من اللوحة`);
    }
    return 0;
  }
  try {
    const { data, error } = await s.storage.from("receipts").remove([RECEIPT_PATH]);
    if (error) {
      line(`   ⚠ تعذّر حذف صورة الإيصال من التخزين (${error.message}) — احذفها يدوياً: ${RECEIPT_PATH}`);
      return 0;
    }
    return data?.length ?? 0;
  } catch (e) {
    line(`   ⚠ تعذّر الوصول إلى التخزين (${e.message}) — احذف ${RECEIPT_PATH} يدوياً`);
    return 0;
  }
}

/** يبدّل هوية الجلسة — كل الحُرّاس يقرؤون auth.uid() من هذين المفتاحين */
async function actAs(profileId) {
  await q(
    `select set_config('request.jwt.claim.sub', $1, false),
            set_config('request.jwt.claims', jsonb_build_object('sub', $1::text)::text, false)`,
    [profileId]
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// (٦) التنظيف — بالترتيب الصحيح للمفاتيح الأجنبية، مع طباعة العدّادات
// ═══════════════════════════════════════════════════════════════════════════

/**
 * يبني جدولاً مؤقتاً بمعرّفات كل صف مزروع **قبل** أي حذف، لأن حذف المصروفات
 * ودفعات المتعهدين يولّد قيوداً عاكسة تحمل `source_id` القديم — ولو حُذفت
 * الصفوف أولاً لتعذّر العثور على قيودها بعدها.
 */
async function buildDemoIds() {
  // ⚠ مؤهَّل بـ pg_temp عمداً: `drop table if exists demo_ids` بلا تأهيل يُحلّ
  //   على مسار البحث، وفي أول نداء لا يوجد الجدول المؤقت بعد ⇒ يصير الاسم
  //   `public.demo_ids`. جدول بهذا الاسم في القاعدة (أو مخلّف من أداة أخرى)
  //   يُحذف بلا سؤال. والتأهيل يجعل الحذف والإنشاء والقراءة كلها على الجلسة.
  await q("drop table if exists pg_temp.demo_ids");
  await q(
    `create temp table pg_temp.demo_ids as
       select 'booking'::text as kind, b.id from public.bookings        b where b.trip ->> 'notes' like $1
       union all
       select 'sub',     s.id from public.subcontractors  s where s.notes   like $1
       union all
       select 'expense', e.id from public.expenses        e where e.note    like $1
       union all
       select 'payout',  p.id from public.partner_payouts p where p.note    like $1
       union all
       select 'quote',   r.id from public.quote_requests  r where r.details like $1`,
    [`${TAG}%`]
  );
  const { rows } = await q(`select kind, count(*)::int as n from pg_temp.demo_ids group by kind`);
  return Object.fromEntries(rows.map((r) => [r.kind, r.n]));
}

const deleted = {};
async function del(label, sql, params) {
  const res = await q(sql, params);
  deleted[label] = (deleted[label] ?? 0) + res.rowCount;
  return res.rowCount;
}

/**
 * مُشغّلات `touch_updated_at` المعطَّلة أثناء التأريخ البعدي — ثلاثة جداول:
 * `bookings` و`dispatches` و`price_lists`. الثالث كان ناقصاً فكان يدهس
 * `updated_at` الذي تكتبه `activatePartner`: قوائم انضمّت في فبراير تظهر
 * «عُدّلت اليوم» في شاشة المراجعة وتتصدّر الترتيب الزمني.
 */
const TOUCH_TRIGGERS = [
  ["public.bookings", "bookings_touch_updated_at"],
  ["public.dispatches", "dispatches_touch_updated_at"],
  ["public.price_lists", "price_lists_touch_updated_at"],
];

/** يعطّل/يعيد المُشغّلات الثلاثة — بلا كسر إن غاب أحدها عن هذه القاعدة */
async function setTouchTriggers(enable) {
  const verb = enable ? "enable" : "disable";
  // to_regclass لا ::regclass: الثانية ترمي خطأً على قاعدة ينقصها الجدول
  // (هجرة لم تُطبَّق بعد) فتُسقط التنظيف كله، والأولى ترجع null بهدوء.
  const body = TOUCH_TRIGGERS.map(
    ([table, trg]) => `
      if exists (select 1 from pg_trigger where tgname = '${trg}'
                   and tgrelid = to_regclass('${table}')) then
        alter table ${table} ${verb} trigger ${trg};
      end if;`
  ).join("\n");
  await q(`do $$\n    begin${body}\n    end $$;`);
}

/** إعادة تفعيل مُشغّلي التوقيت — صمام أمان لو انهار تشغيل سابق في منتصفه */
async function restoreTriggers(quiet = true) {
  await setTouchTriggers(true);
  if (!quiet) line("   ✔ أُعيد تفعيل مُشغّلات updated_at الثلاثة");
}

/**
 * قيود فقدت رابطها أثناء الحذف — تُقاس قبل الحذف وبعده، والفارق وحده يعنينا.
 * الشرط يشمل عائلتَي القيود اللتين يقطع حذفُنا رابطهما:
 *   • قيد متعهد فقد الحجز **والمتعهد** معاً (كلا المفتاحين on delete set null)،
 *   • قيد تحصيل أو ردّ فقد حجزه — وهو ما تعده الترويسة ولم يكن الشرط يراه،
 *     ولو حُذف حجزٌ قبل قيوده لبقي القيد في كشف الخزينة بلا مصدر إلى الأبد.
 * (المقياس فارقي: قيود المالك القائمة على الحالتين تُطرح من الطرفين.)
 */
async function orphanLedgerCount() {
  const r = await one(
    `select count(*)::int as n
       from public.ledger_entries
      where (source_type in ('partner_payout', 'partner_collection')
             and booking_id is null and subcontractor_id is null)
         or (source_type in ('payment', 'refund') and booking_id is null)`
  );
  return r ? r.n : 0;
}

async function clean() {
  head("١) حصر ما زُرع");
  const orphanBefore = await orphanLedgerCount();
  const counts = await buildDemoIds();
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (!total) {
    line("   لا توجد أي بيانات ديمو في هذه القاعدة — لا شيء يُحذف.");
    // الملف في التخزين لا صف له في القاعدة: قد ينجو من تشغيل انهار بعد الرفع
    // مباشرةً، فيُحذف هنا أيضاً وإلا بقي إلى الأبد بلا ما يدل عليه.
    const orphanFile = await removeReceipt(true);
    if (orphanFile) line(`   ✔ حُذفت صورة إيصال الديمو من التخزين (${RECEIPT_PATH})`);
    await restoreTriggers(false);
    return;
  }
  line(
    `   حجوزات ${num(counts.booking ?? 0)} · متعهدون ${num(counts.sub ?? 0)} · ` +
      `مصروفات ${num(counts.expense ?? 0)} · دفعات ${num(counts.payout ?? 0)} · ` +
      `طلبات أسعار ${num(counts.quote ?? 0)}`
  );

  head("٢) الحذف بترتيب المفاتيح الأجنبية");

  // (أ) أحداث القمع — مُسنَد واحد حاسم، وقبل حذف الحجوزات
  await del(
    "funnel_events",
    `delete from public.funnel_events where class_slug = $1`,
    [TAG]
  );

  // (ب) أحداث البوابة (لا تتتالى: intent_id بـ on delete set null)
  await del(
    "payment_events",
    `delete from public.payment_events where event_id like $1`,
    [`${TAG}%`]
  );

  // (ج) الإشعارات — تُمسك بحمولتها لا بمفتاح أجنبي (لا يوجد)
  await del(
    "notifications",
    `delete from public.notifications n
      where n.payload ->> 'bookingId'      in (select d.id::text from pg_temp.demo_ids d where d.kind = 'booking')
         or n.payload ->> 'quoteRequestId' in (select d.id::text from pg_temp.demo_ids d where d.kind = 'quote')
         or n.payload ->> 'subcontractorId' in (select d.id::text from pg_temp.demo_ids d where d.kind = 'sub')`
  );

  // (د) المصروفات ودفعات المتعهدين **قبل** الدفتر: حذفها يولّد قيوداً عاكسة
  //     (expenses_ledger_deleted / partner_payouts_ledger_deleted) فتُحذف معه.
  await del("expenses", `delete from public.expenses where note like $1`, [`${TAG}%`]);
  await del("partner_payouts", `delete from public.partner_payouts where note like $1`, [`${TAG}%`]);

  // (د-٢) ⚠ حركةٌ مالية **بلا وسم** على متعهد ديمو — وهي حالة لا يمكن تفاديها:
  //       المالك يفتح `/admin/finance/partners` أثناء العرض ويسجّل دفعةً أو
  //       تسوية على متعهد ديمو (وهذا بالضبط ما بُنيت البيانات لأجله)، فالصف
  //       يحمل ملاحظته هو لا الوسم.
  //
  //       ومفتاحا الجدولين `on delete restrict` — مقروءان من الكتالوج لا
  //       مفترضين — فصفٌّ واحد منهما **يوقف حذف المتعهد ويُسقط التنظيف كله في
  //       منتصفه**، تاركاً القاعدة نصف ممسوحة ومُشغّلات `updated_at` معطَّلة.
  //       (وقد أسقطه فعلاً: خمس تسويات ودفعة واحدة سجّلها المالك بيده.)
  //
  //       فالمُسنَد هنا **المتعهد** لا الوسم — وهو مُسنَد آمن: `demo_ids` لا
  //       تحوي إلا متعهدي الديمو، فلا يقترب هذا الحذف من متعهدي المالك.
  //       وموضعه قبل الدفتر لنفس سبب (د): لكلٍّ مُشغّل حذف يكتب قيداً عاكساً.
  //       ولا صمت: يُطبع ما حُذف بلا وسم صراحةً — إدخالٌ يدوي يذهب بلا خبر
  //       أسوأ من تنظيف يفشل.
  const orphanPayouts = await del(
    "partner_payouts (بلا وسم)",
    `delete from public.partner_payouts p
      where p.subcontractor_id in (select d.id from pg_temp.demo_ids d where d.kind = 'sub')`
  );
  const orphanSettlements = await del(
    "partner_settlements",
    `delete from public.partner_settlements ps
      where ps.subcontractor_id in (select d.id from pg_temp.demo_ids d where d.kind = 'sub')`
  );
  if (orphanPayouts || orphanSettlements) {
    line(
      `   ℹ حُذفت حركات مالية يدوية على متعهدي الديمو: ` +
        `${num(orphanPayouts)} دفعة · ${num(orphanSettlements)} تسوية — ` +
        "سجّلتها من اللوحة على متعهد تجريبي، ولا معنى لبقائها بعد ذهابه."
    );
  }

  // (هـ) الدفتر — ⚠ الاستثناء الصريح على قاعدة append-only (انظر الترويسة).
  //      العاكسة أولاً: reverses_entry_id بـ on delete restrict.
  const ledgerWhere = `
        e.booking_id       in (select d.id from pg_temp.demo_ids d where d.kind = 'booking')
     or e.subcontractor_id in (select d.id from pg_temp.demo_ids d where d.kind = 'sub')
     or e.source_id        in (select d.id from pg_temp.demo_ids d
                                where d.kind in ('booking', 'expense', 'payout'))`;
  await del(
    "ledger_entries (عاكسة)",
    `delete from public.ledger_entries e
      where e.reverses_entry_id is not null and (${ledgerWhere})`
  );
  // ودورة احتياطية: قيد عاكس يعكس قيداً ديمو لكنه لا يحمل بنفسه أي مُسنَد
  await del(
    "ledger_entries (عاكسة)",
    `delete from public.ledger_entries e
      where e.reverses_entry_id in (select x.id from public.ledger_entries x where ${ledgerWhere.replace(/\be\./g, "x.")})`
  );
  await del("ledger_entries", `delete from public.ledger_entries e where ${ledgerWhere}`);

  // (و) جلسات الدفع (تتتالى مع الحجز، والحذف الصريح أوضح في العدّاد)
  await del(
    "payment_intents",
    `delete from public.payment_intents i
      where i.booking_id in (select d.id from pg_temp.demo_ids d where d.kind = 'booking')`
  );

  // (ز) الحجوزات — تتتالى عليها payments و booking_events و dispatches و trip_offers
  await del(
    "bookings",
    `delete from public.bookings b
      where b.id in (select d.id from pg_temp.demo_ids d where d.kind = 'booking')`
  );

  // (ح) طلبات الأسعار
  await del(
    "quote_requests",
    `delete from public.quote_requests r
      where r.id in (select d.id from pg_temp.demo_ids d where d.kind = 'quote')`
  );

  // (ط) قوائم الأسعار (تتتالى price_list_items) ثم المركبات ثم المتعهدون
  await del(
    "price_lists",
    `delete from public.price_lists pl
      where pl.subcontractor_id in (select d.id from pg_temp.demo_ids d where d.kind = 'sub')`
  );
  await del(
    "subcontractor_vehicles",
    `delete from public.subcontractor_vehicles v
      where v.subcontractor_id in (select d.id from pg_temp.demo_ids d where d.kind = 'sub')`
  );
  // سجلّ السائقين (‏0040) — يتتالى مع المتعهد (`confdeltype = 'c'`، مقروء من
  // الكتالوج لا مفترَض)، ويُحذف صراحةً هنا لسببين: عدّادٌ يُرى، وصحّةٌ تبقى لو
  // بدّلت هجرةٌ لاحقة المفتاح. وترتيبه بعد الحجوزات مقصود: `dispatches` زالت
  // معها، فلا صفَّ إسناد يشير إلى سائق نحذفه (ولو بقي، فمفتاحه `set null`).
  await del(
    "subcontractor_drivers",
    `delete from public.subcontractor_drivers dr
      where dr.subcontractor_id in (select d.id from pg_temp.demo_ids d where d.kind = 'sub')`
  );
  await del(
    "subcontractors",
    `delete from public.subcontractors s
      where s.id in (select d.id from pg_temp.demo_ids d where d.kind = 'sub')`
  );

  // (ي) هويات الدخول — النطاق .invalid محجوز فلا يمكن أن يصادف مستخدماً حقيقياً.
  //     الحذف يتتالى على public.profiles عبر المفتاح الأجنبي.
  try {
    await del(
      "auth.users",
      `delete from auth.users u where u.email like $1`,
      [`%@${MAIL_DOMAIN}`]
    );
  } catch (e) {
    line(`   ⚠ تعذّر حذف هويات الدخول التجريبية: ${e.message}`);
  }

  for (const [k, v] of Object.entries(deleted)) {
    if (v) line(`   ✔ ${k.padEnd(26)} ${String(v).padStart(6)} صف`);
  }

  // (ك) صورة الإيصال في التخزين — خارج القاعدة، فلا يزيلها أي CASCADE.
  //     تُحذف دائماً ولو لم يبقَ صف واحد: الملف قد ينجو من تشغيل انهار.
  const removed = await removeReceipt();
  if (removed) line(`   ✔ ${"receipts/الصورة".padEnd(26)} ${String(removed).padStart(6)} ملف`);

  head("٣) التحقق الذاتي — صفر صف باقٍ");
  // ⚠ سجلّا الشريك يُقاسان **بمعرّفات المتعهدين المحذوفين** المحفوظة في
  //   `pg_temp.demo_ids`، لا بوسمٍ نصّي (لا عمود لهما)، ولا بمقارنة مع
  //   `subcontractors` (فهي فارغة الآن، فتُنتج صفراً مهما بقي). فلو سقط الحذف
  //   الصريح وبدّلت هجرةٌ المفتاح إلى `set null` لظهر الرقم هنا فوراً.
  const left = await one(
    `select
       (select count(*) from public.subcontractor_drivers dr
         where dr.subcontractor_id in (select d.id from pg_temp.demo_ids d where d.kind = 'sub')) as drivers,
       (select count(*) from public.subcontractor_vehicles v
         where v.subcontractor_id in (select d.id from pg_temp.demo_ids d where d.kind = 'sub')) as vehicles,
       (select count(*) from public.bookings        where trip ->> 'notes' like $1) as bookings,
       (select count(*) from public.subcontractors  where notes   like $1)          as subs,
       (select count(*) from public.quote_requests  where details like $1)          as quotes,
       (select count(*) from public.expenses        where note    like $1)          as expenses,
       (select count(*) from public.partner_payouts where note    like $1)          as payouts,
       (select count(*) from public.funnel_events   where class_slug = $2)          as funnel,
       (select count(*) from public.payment_events  where event_id like $1)         as pevents,
       (select count(*) from auth.users             where email like $3)            as users`,
    [`${TAG}%`, TAG, `%@${MAIL_DOMAIN}`]
  );
  const stuck = Object.entries(left).filter(([, v]) => Number(v) > 0);
  if (stuck.length) {
    line(`   ✘ بقيت صفوف: ${stuck.map(([k, v]) => `${k}=${v}`).join(" · ")}`);
    process.exitCode = 1;
  } else {
    line("   ✔ لا يوجد أي صف ديمو في القاعدة.");
  }

  // فحص إضافي: قيدٌ فقد رابطه بالحجز أثناء الحذف (booking_id بـ on delete set
  // null) يعني أن الترتيب اختل — وهو الخطأ الوحيد الذي لا يُلاحَظ إلا بعد شهور.
  // نقيس الفارق لا العدد المطلق كي لا نُنذر بسبب بيانات المالك القائمة.
  const orphanAfter = await orphanLedgerCount();
  if (orphanAfter > orphanBefore) {
    line(
      `   ✘ ظهرت ${orphanAfter - orphanBefore} قيود متعهد بلا رابط — ` +
        "خللٌ في ترتيب الحذف، راجعها يدوياً قبل الإطلاق."
    );
    process.exitCode = 1;
  }

  await restoreTriggers(false);
}

// ═══════════════════════════════════════════════════════════════════════════
// (٧) الزرع
// ═══════════════════════════════════════════════════════════════════════════

const iso = (d) => new Date(d).toISOString();
const addMin = (d, m) => new Date(new Date(d).getTime() + m * 60000);
const addDays = (d, n) => new Date(new Date(d).getTime() + n * 86400000);
const monthKey = (d) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
const AR_MONTH = {
  "2026-02": "فبراير ٢٠٢٦",
  "2026-03": "مارس ٢٠٢٦",
  "2026-04": "أبريل ٢٠٢٦",
  "2026-05": "مايو ٢٠٢٦",
  "2026-06": "يونيو ٢٠٢٦",
  "2026-07": "يوليو ٢٠٢٦",
  "2026-08": "أغسطس ٢٠٢٦",
};

const START = new Date(`${DAY0}T00:00:00Z`);
const END = new Date(`${DAY_N}T21:00:00Z`);
/** آخر ١٤ يوماً: النافذة الوحيدة التي يجوز أن يبقى فيها حجزٌ «في المسار» */
const INFLIGHT_FROM = addDays(END, -14);

/**
 * وزن الطلب النسبي لكل فئة معروفة — وأي فئة أضافها المالك تأخذ الوزن الافتراضي.
 * الأوزان وحدها هنا؛ **السعة والوجود يُقرآن من `vehicle_classes`** لا من الكود.
 */
const CLASS_WEIGHT = { sedan: 55, suv: 30, minibus: 12, bus: 3 };
const CLASS_WEIGHT_DEFAULT = 8;

/**
 * مدى الركاب لكل فئة — مُشتق من السعات المقروءة لا من أرقام مكتوبة:
 * الحدّ الأدنى = سعة الفئة الأصغر منها + ١، والأعلى = سعتها هي.
 * هذا بالضبط منطق `quote_price` (`capacity >= passengers` مرتَّبة تصاعدياً
 * بحدّ صفّين)، فتكون الفئة المختارة أول المؤهَّلات دائماً ولا يُرفض حجز بـ
 * `class-unavailable`. وبفئات المالك الافتراضية يعطي (١-٣ · ٤-٦ · ٧-١٣ · ١٤-٤٤).
 */
function paxRanges(classes) {
  const sorted = classes.slice().sort((a, b) => Number(a.capacity) - Number(b.capacity));
  const out = {};
  let previous = 0;
  for (const cls of sorted) {
    const cap = Number(cls.capacity);
    out[cls.slug] = [Math.max(1, Math.min(previous + 1, cap)), cap];
    previous = cap;
  }
  return out;
}

/**
 * توليد خطة الحجوزات كاملة قبل أي كتابة — كي تكون التوزيعات مضبوطة.
 * ⚠ تأخذ صفوف `vehicle_classes` المفعّلة لا خريطة سعات: اختيار فئة من قائمة
 *   مكتوبة في الكود يعني أن تعطيل المالك لـ«الباص» يُنتج حجوزاً بفئة لا
 *   تُسعَّر، فترفضها `create_booking` وتسقط عشرات الحجوزات بلا سبب ظاهر.
 */
function planBookings(classes) {
  const usable = classes.filter((cls) => Number(cls.capacity) > 0);
  if (!usable.length) throw new Error("لا توجد فئة مركبات مفعّلة بسعة صالحة — راجع vehicle_classes");
  const classWeights = usable.map((cls) => [cls.slug, CLASS_WEIGHT[cls.slug] ?? CLASS_WEIGHT_DEFAULT]);
  const ranges = paxRanges(usable);

  const plan = [];
  for (const [mk, count] of Object.entries(MONTHLY_BOOKINGS)) {
    const [y, m] = mk.split("-").map(Number);
    // أيام الشهر داخل النافذة
    const days = [];
    for (let d = 1; d <= 31; d++) {
      const dt = new Date(Date.UTC(y, m - 1, d));
      if (dt.getUTCMonth() !== m - 1) break;
      if (dt < START || dt > END) continue;
      days.push(dt);
    }
    if (!days.length) continue;

    // مسارات الشهر بأوزانها الموسمية
    const routeWeights = ROUTES.map((r) => [r, r.base * (SEASON_WEIGHT[r.season][m] ?? 1)]);
    const dayWeights = days.map((d) => [d, dayFactor(d)]);

    for (let i = 0; i < count; i++) {
      const day = weighted(dayWeights);
      const route = weighted(routeWeights);
      const from = CITY[route.from];
      const to = CITY[route.to];
      const distance = roadKm(from, to);

      // الفئة: سيدان الأكثر ثم SUV ثم ميني باص وقليل من الباص — من المفعّل وحده
      const slug = weighted(classWeights);
      const paxRange = ranges[slug];
      const passengers = rInt(paxRange[0], paxRange[1]);

      // ساعة الطلب: ذروتان — صباح المطارات ومساء المدن
      const hour = weighted([
        [rInt(6, 9), 3],
        [rInt(10, 15), 2],
        [rInt(16, 21), 3],
        [rInt(22, 23), 1],
        [rInt(0, 5), 0.4],
      ]);
      const createdAt = new Date(day.getTime() + hour * 3600000 + rInt(0, 59) * 60000);
      if (createdAt < START || createdAt > END) continue;

      // موعد التنفيذ: بعد يومين إلى ثلاثة أسابيع
      const pickupAt = addDays(createdAt, rInt(2, 21));
      const roundTrip = distance > 120 ? chance(0.28) : chance(0.08);
      const waitingHours = roundTrip && chance(0.35) ? rInt(2, 6) : 0;
      const paymentPlan = distance > 150 ? (chance(0.72) ? "deposit" : "full") : chance(0.15) ? "deposit" : "full";

      plan.push({
        createdAt,
        pickupAt,
        from,
        to,
        distance,
        slug,
        passengers,
        roundTrip,
        waitingHours,
        paymentPlan,
        note: pick(NOTES),
        customerName: arabicName(),
        customerPhone: arabicPhone(),
        month: mk,
      });
    }
  }

  plan.sort((a, b) => a.createdAt - b.createdAt);

  // المصائر: الحجز القديم لا يبقى «بانتظار الدفع» أبداً — هذا لا يحدث في شركة حقيقية
  for (const b of plan) {
    const inflight = b.createdAt >= INFLIGHT_FROM;
    const pickupPassed = b.pickupAt <= END;
    if (!inflight) {
      b.fate = chance(0.09) ? "cancelled" : pickupPassed ? "completed" : "assigned";
    } else {
      b.fate = weighted([
        ["completed", pickupPassed ? 26 : 0],
        ["assigned", 22],
        ["confirmed", 16],
        ["under_review", 14],
        ["pending_payment", 12],
        ["cancelled", 10],
      ]);
    }
    // إلغاء قبل الدفع أو بعده — الأول لا يترك أثراً مالياً والثاني يترك تحصيلاً
    b.cancelledUnpaid = b.fate === "cancelled" ? chance(0.55) : false;
    // فرع البوابة الإلكترونية (~١٠٪) — يُستعمل فقط إن كان مزوّد الاختبار مفعّلاً
    b.wantsGateway = chance(0.1);
  }
  return plan;
}

/**
 * جدول زمني داخلي متسق لكل حجز (كل الطوابع مشتقة من createdAt).
 * كل طابع مقصوص عند 2026-08-13 — لا يخرج صف واحد عن النافذة المعلنة، وهو شرط
 * ألّا يلامس الزرعُ نوافذ الاختبارات المحجوزة، والقص رتيب فلا يقلب الترتيب.
 */
function timeline(b) {
  const cap = END.getTime();
  const clamp = (d) => new Date(Math.min(d.getTime(), cap));
  const created = b.createdAt;
  const receipt = clamp(addMin(created, rInt(20, 60 * 30))); // من ٢٠ دقيقة إلى ٣٠ ساعة
  const verified = clamp(addMin(receipt, rInt(25, 60 * 14)));
  const dispatch = clamp(addMin(verified, rInt(5, 90)));
  const assigned = clamp(addMin(dispatch, rInt(3, 26 * 60)));
  const completed = clamp(new Date(b.pickupAt.getTime() + rInt(1, 9) * 3600000));
  const cancelled = clamp(
    b.cancelledUnpaid
      ? addMin(created, rInt(60, 60 * 40))
      : addMin(verified, rInt(60 * 3, 60 * 72))
  );
  return { created, receipt, verified, dispatch, assigned, completed, cancelled };
}

async function seed() {
  // ── (٧-١) الهوية والحراسة ────────────────────────────────────────────────
  head("١) الهوية والفحوص القَبْلية");

  const admin = await one(
    `select p.id, u.email from public.profiles p
       join auth.users u on u.id = p.id
      where p.role = 'admin'
      order by p.created_at asc limit 1`
  );
  if (!admin) throw new Error("لا يوجد مشرف في القاعدة — أنشئ حسابك أولاً (scripts/invite-admin.mjs)");
  await actAs(admin.id);
  line(`   👤 يعمل بصلاحيات المشرف: ${admin.email}`);

  const already = await one(
    `select
       (select count(*) from public.bookings where trip ->> 'notes' like $1) as b,
       (select count(*) from public.subcontractors where notes like $1)      as s`,
    [`${TAG}%`]
  );
  if (Number(already.b) > 0 || Number(already.s) > 0) {
    line();
    line(`   ✘ توجد بيانات ديمو مزروعة سلفاً (${already.b} حجزاً و${already.s} متعهداً).`);
    line("     الزرع مرتين يضاعف كل شيء — امسحها أولاً:");
    line("       node scripts/demo-seed.mjs --clean");
    process.exitCode = 1;
    return;
  }

  // فئات المركبات وسعاتها — تُقرأ ولا تُخترع
  const classes = (
    await q(`select slug, title, capacity from public.vehicle_classes where active order by capacity`)
  ).rows;
  const classCapacity = Object.fromEntries(classes.map((r) => [r.slug, Number(r.capacity)]));
  const classTitle = Object.fromEntries(classes.map((r) => [r.slug, r.title]));
  if (!classCapacity.sedan) throw new Error("لا توجد فئات مركبات مفعّلة — طبّق هجرة 0005 وابذر التسعير");
  line(`   ✔ الفئات: ${classes.map((r) => `${r.title} (${r.capacity})`).join(" · ")}`);

  // حسابات الخزينة — تُقرأ ولا يُنشأ غيرها
  const accounts = (
    await q(`select id, kind, label, handle, customer_facing, active
               from public.payment_accounts where active order by sort, label`)
  ).rows;
  const facing = accounts.filter((a) => a.customer_facing);
  if (!facing.length) throw new Error("لا يوجد حساب تحصيل مفعّل — أضِف محفظة أو انستاباي من اللوحة");
  const gatewayAccount = accounts.find((a) => a.handle === "GATEWAY-ONLINE") ?? null;
  const cashAccount = facing[0];
  line(`   ✔ حسابات التحصيل: ${facing.map((a) => a.label).join(" · ")}`);

  // فئات المصروفات
  const cats = (await q(`select id, name from public.expense_categories where active`)).rows;
  const catByName = Object.fromEntries(cats.map((r) => [r.name.trim(), r.id]));
  line(`   ✔ فئات المصروفات: ${cats.map((r) => r.name).join(" · ") || "لا شيء"}`);

  const cfg = await one(`select * from public.dispatch_config()`);
  line(
    `   ✔ إعدادات البث: مهلة ${num(cfg.window_minutes)} دقيقة · ${num(cfg.max_rounds)} موجات · ` +
      `أرضية هامش ${money(cfg.min_margin_amount)}`
  );

  // بوابة الاختبار: تُستعمل فقط إن كان المالك مفعّلها أصلاً — لا نغيّر إعداداً قائماً
  const testProvider = await one(
    `select provider, enabled, label from public.payment_providers where provider = 'test'`
  );
  const gatewayOn = Boolean(testProvider?.enabled) && Boolean(gatewayAccount);
  line(
    gatewayOn
      ? "   ✔ بوابة الاختبار مفعّلة — بعض التحصيلات ستمر بمسار البوابة الحقيقي"
      : "   ℹ بوابة الاختبار معطّلة (وهذا هو الصواب) — كل التحصيلات بمسار الإيصال اليدوي"
  );

  // ── (٧-٢) تعطيل مُشغّلات updated_at أثناء التأريخ البعدي ─────────────────
  await setTouchTriggers(false);
  line("   ✔ عُطّلت مُشغّلات updated_at الثلاثة مؤقتاً (تُعاد في النهاية)");

  // صورة الإيصال المشتركة — قبل أول `attach_receipt` كي يشير إليها كل حجز
  const receiptPath = (await uploadReceipt()) ?? null;
  if (receiptPath) line(`   ✔ رُفعت صورة إيصال واحدة إلى دلو receipts: ${receiptPath}`);

  // ── (٧-٣) المتعهدون ─────────────────────────────────────────────────────
  head("٢) المتعهدون وقوائم الأسعار");

  /**
   * أسعار التعريفة لمسار ما — تُقرأ من `quote_price` نفسها لا تُحسب هنا.
   *
   * ⚠ النداء براكب واحد يُرجع فئتين فقط: التوقيع الرباعي فيه
   *   `where vc.capacity >= a.passengers order by vc.capacity asc limit 2`
   *   (هجرة 0005 سطر ٢٩١)، فـ`passengers = 1` تعني «أصغر فئتين» = سيدان وSUV،
   *   ويسقط الميني باص والباص من **كل** قائمة أسعار. أثره كان: ~نصف حجوزات
   *   الفئتين الكبيرتين بلا عرض واحد ⇒ إسناد يدوي كامل، وشاشة المتعهدين تُخفي
   *   فئتين. فتُقرأ التعريفة لكل فئة **بسعتها هي**: عندها تكون أول المؤهَّلات.
   */
  async function tariffFor(a, b, slugs) {
    const dist = Math.round(haversineKm(CITY[a], CITY[b]) * 1.25 * 10) / 10;
    const out = {};
    // نداء واحد لكل سعة مطلوبة (لا لكل فئة): الفئات المتساوية السعة يجمعها نداء
    const caps = [...new Set(slugs.map((s) => classCapacity[s]).filter(Boolean))].sort((x, y) => x - y);
    for (const cap of caps) {
      const rows = (
        await q(
          `select class_slug, total from public.quote_price($1::numeric, $2::int, false, 0::numeric)`,
          [dist, cap]
        )
      ).rows;
      for (const r of rows) {
        if (out[r.class_slug] === undefined) out[r.class_slug] = Number(r.total);
      }
    }
    return out;
  }

  const partners = [];
  for (const p of PARTNERS) {
    // فئات المتعهد المتاحة فعلاً: `subcontractor_vehicles.class_slug` مفتاح أجنبي
    // إلى `vehicle_classes(slug)`، وفئة عطّلها المالك (أو حذفها) تُسقط الإدراج
    // فيسقط المتعهد كله. نتقاطع مع المقروء ونمضي بما بقي.
    const partnerClasses = p.classes.filter((s) => classCapacity[s]);
    if (!partnerClasses.length) {
      line(`   ⚠ تُخطّي «${p.name}»: لا فئة من فئاته مفعّلة في هذه القاعدة`);
      continue;
    }

    const joinedAt = new Date(
      Date.UTC(2026, p.joinMonth - 1, p.joinMonth === 2 ? 13 : rInt(2, 20), rInt(9, 17), rInt(0, 59))
    );

    // (أ) هوية الدخول — بلا كلمة مرور ولا بريد يُرسل. النطاق .invalid محجوز.
    let profileId = null;
    if (p.login) {
      const email = `${p.key}@${MAIL_DOMAIN}`;
      try {
        await q("begin");
        const u = await one(
          `insert into auth.users (instance_id, id, aud, role, email,
                                   raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
           values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(),
                   'authenticated', 'authenticated', $1,
                   '{"provider":"email","providers":["email"]}'::jsonb,
                   jsonb_build_object('full_name', $2::text, 'phone', $3::text),
                   $4::timestamptz, $4::timestamptz)
           returning id`,
          [email, p.contact, p.phone, iso(joinedAt)]
        );
        // مُشغّل on_auth_user_created ينشئ الملف الشخصي؛ وهذا احتياط لو غاب
        await q(
          `insert into public.profiles (id, role, full_name, phone)
           values ($1::uuid, 'subcontractor', $2::text, $3::text)
           on conflict (id) do update set role = 'subcontractor'`,
          [u.id, p.contact, p.phone]
        );
        await q("commit");
        profileId = u.id;
      } catch (e) {
        await q("rollback").catch(() => {});
        line(`   ⚠ تعذّر إنشاء هوية دخول لـ «${p.name}» (${e.message.split("\n")[0]})`);
        line("     سيُسنَد إليه يدوياً فقط — ولن يقبل أو يرفض عرضاً بنفسه.");
      }
    }

    // (ب) صف المتعهد — لا دالة لإنشائه في النظام، فيُدرج بأعمدته الصحيحة
    const sub = await one(
      `insert into public.subcontractors
         (profile_id, company_name, contact_name, phone, whatsapp, email, status, notes, created_at, updated_at)
       values ($1::uuid, $2::text, $3::text, $4::text, $5::text, $6::text, $7::text, $8::text,
               $9::timestamptz, $9::timestamptz)
       returning id`,
      [
        profileId,
        p.name,
        p.contact,
        p.phone,
        // واتساب بالصيغة الدولية: رمز مصر **`20`** ثم الرقم بلا صفره البادئ.
        // كان `2${…}` — رمزاً بخانة واحدة — فيخرج `21001472583` وهو رقم لا وجود
        // له، ورابط `wa.me` منه يفتح «الرقم غير صالح». والقاعدة نفسها في
        // `lib/phone.ts` للرقم المعروض للعملاء.
        `20${p.phone.slice(1)}`,
        `${p.key}@${MAIL_DOMAIN}`,
        p.status,
        `${TAG} — متعهد بيانات العرض التجريبي`,
        iso(joinedAt),
      ]
    );

    // (ج) الأسطول — 🔒 بلا مركبة نشطة في الفئة لا يدخل المتعهد البث إطلاقاً
    //
    // واللون عمودٌ أضافته `0040`، ويُملأ هنا لا يُترك فارغاً: صفحة متابعة العميل
    // تعرضه بوصفه ما يميّز سيارته عند الرصيف («سيدان — أبيض · أ ب ج ٤٢١٧»)،
    // فأسطولٌ بلا ألوان يُظهر الميزة ناقصةً في الشاشة التي بُنيت لها.
    for (const slug of partnerClasses) {
      const n = slug === "sedan" ? rInt(2, 5) : slug === "suv" ? rInt(1, 3) : 1;
      for (let i = 0; i < n; i++) {
        await q(
          `insert into public.subcontractor_vehicles
             (subcontractor_id, class_slug, label, model_year, plate, seats, color, active, created_at)
           values ($1::uuid, $2::text, $3::text, $4::int, $5::text, $6::int, $7::text, true, $8::timestamptz)`,
          [
            sub.id,
            slug,
            `${classTitle[slug] ?? slug} — ${i + 1}`,
            rInt(2018, 2026),
            `${pick(["أ ب ج", "س ص ط", "ر ز ن", "ل م ه"])} ${rInt(1000, 9999)}`,
            classCapacity[slug] ?? null,
            cPick(VEHICLE_COLORS),
            iso(joinedAt),
          ]
        );
      }
    }

    // (ج-٢) سجلّ السائقين — نظير الأسطول حرفاً بحرف، وبإدراج خام لنفس السبب:
    //       **لا دالة نظام تُنشئ سائقاً**. البورتال يكتب في الجدول مباشرةً عبر
    //       PostgREST (‏`app/portal/drivers/actions.ts`)، فهذا هو مسار النظام
    //       نفسه لا التفافٌ حوله — تماماً كصفّ المتعهد وصفوف الأسطول أعلاه.
    //
    //       والسبب الذي يجعل هذا الجزء لازماً لا تحسينياً: بلا سائق واحد في
    //       السجل يرى الشريك في «رحلاتي» حالةَ «أضف سائقيك» بدل نموذج الطاقم،
    //       فتصير الدفعة ٥ كلها غير قابلة للعرض.
    const drivers = await seedDrivers(p, sub.id, joinedAt);

    // (د) قوائم الأسعار — بالدوال الحقيقية: إنشاء ← إرسال. والاعتماد يؤجَّل إلى
    //     الشهر الذي انضم فيه المتعهد (انظر activatePartner أدناه).
    const listIds = [];
    for (const l of p.lists) {
      const tariff = await tariffFor(l.a, l.b, partnerClasses);
      const items = partnerClasses
        .filter((s) => tariff[s])
        .map((s) => ({
          classSlug: s,
          cost: Math.round((tariff[s] * p.costFactor * rFloat(0.96, 1.05)) / 10) * 10,
        }));
      if (!items.length) continue;

      const created = await one(
        `select * from public.upsert_price_list(
           p_id => null::uuid, p_title => $1::text,
           p_origin_label => $2::text, p_origin_lat => $3::numeric, p_origin_lng => $4::numeric,
           p_origin_radius_km => $5::numeric,
           p_dest_label => $6::text, p_dest_lat => $7::numeric, p_dest_lng => $8::numeric,
           p_dest_radius_km => $9::numeric, p_bidirectional => true, p_items => $10::jsonb,
           p_subcontractor_id => $11::uuid)`,
        [
          l.title,
          CITY[l.a].label,
          CITY[l.a].lat,
          CITY[l.a].lng,
          l.ra,
          CITY[l.b].label,
          CITY[l.b].lat,
          CITY[l.b].lng,
          l.rb,
          JSON.stringify(items),
          sub.id,
        ]
      );
      await q(`select public.submit_price_list($1::uuid)`, [created.id]);
      listIds.push({ id: created.id, keepPending: Boolean(l.keepPending) });
    }

    partners.push({
      ...p,
      classes: partnerClasses,
      id: sub.id,
      profileId,
      joinedAt,
      listIds,
      drivers,
      activated: false,
    });
    line(
      `   ✔ ${p.name.padEnd(30)} ${p.status.padEnd(10)} ` +
        `${listIds.length} قائمة · ${partnerClasses.length} فئة · ` +
        `${drivers.total} سائق${drivers.stopped ? ` (منهم ${drivers.stopped} متوقف)` : ""} · ` +
        `${profileId ? "بحساب دخول" : "بلا حساب"} · انضم ${iso(joinedAt).slice(0, 10)}`
    );
  }

  /**
   * `coverage_matches` لا تعرف الزمن: قائمة معتمدة تسعّر حجوزات فبراير حتى لو
   * كان صاحبها انضم في يوليو. فالاعتماد يقع **عند بلوغ شهر الانضمام** أثناء
   * توليد الحجوزات، بالدالة الحقيقية `review_price_list` لا بكتابة حالة خام —
   * وهكذا يظهر «المتعهد الجديد» في الأرقام من شهره فقط.
   */
  async function activatePartner(p) {
    if (p.activated) return;
    p.activated = true;
    const at = iso(addDays(p.joinedAt, rInt(0, 3)));
    for (const l of p.listIds) {
      if (!l.keepPending) {
        await q(`select public.review_price_list($1::uuid, true, $2::text)`, [
          l.id,
          "أسعار مقبولة — معتمدة",
        ]);
      }
      await q(
        `update public.price_lists
            set created_at  = $2::timestamptz,
                updated_at  = $2::timestamptz,
                reviewed_at = case when reviewed_at is null then null else $2::timestamptz end
          where id = $1::uuid`,
        [l.id, at]
      );
    }
    if (p.joinMonth > 2) line(`   ↳ دخل السوق: ${p.name}`);
  }

  // ── (٧-٤) الحجوزات ───────────────────────────────────────────────────────
  head("٣) الحجوزات — ستة أشهر بالدوال الحقيقية");

  const plan = planBookings(classes);
  line(`   الخطة: ${num(plan.length)} حجزاً بين ${DAY0} و${DAY_N}`);

  const partnerById = Object.fromEntries(partners.map((p) => [p.id, p]));
  const approvedPartners = partners.filter((p) => p.status === "approved");
  const seeded = []; // { id, reference, total, paidAt|null, createdAt, classSlug, currency, startedGateway }
  // `byFate` تُملأ بالحالة **المقروءة من القاعدة** بعد كل حجز، و`drifted` عدد ما
  // انحرف عن مصيره المخطط (بثّ لم يُسنَد غالباً) — رقم يستحق أن يُرى لا أن يُخفى.
  const stats = {
    byFate: {},
    drifted: 0,
    offers: 0,
    accepted: 0,
    rejected: 0,
    expired: 0,
    manual: 0,
    gateway: 0,
    failed: 0,
  };

  let currentMonth = null;
  let doneInMonth = 0;

  for (let i = 0; i < plan.length; i++) {
    const b = plan[i];

    if (b.month !== currentMonth) {
      if (currentMonth) line();
      currentMonth = b.month;
      doneInMonth = 0;
      const monthNum = Number(currentMonth.split("-")[1]);
      for (const p of partners) if (p.joinMonth <= monthNum) await activatePartner(p);
      process.stdout.write(`   ${AR_MONTH[currentMonth]}: `);
    }

    try {
      await q("begin");
      await actAs(admin.id);

      const t = timeline(b);
      const bk = await one(
        `select * from public.create_booking(
           $1::jsonb, $2::jsonb, $3::int, $4::boolean, $5::numeric, $6::numeric, $7::numeric,
           'osrm', $8::text, $9::text, $10::text, $11::text, $12::text, $13::timestamptz, $14::text)`,
        [
          JSON.stringify({ label: b.from.label, lat: b.from.lat, lng: b.from.lng }),
          JSON.stringify({ label: b.to.label, lat: b.to.lat, lng: b.to.lng }),
          b.passengers,
          b.roundTrip,
          b.waitingHours,
          b.distance,
          Math.round(b.distance * rFloat(0.95, 1.25)), // مدة تقريبية بالدقائق
          b.slug,
          b.paymentPlan,
          b.customerName,
          b.customerPhone,
          `2${b.customerPhone.slice(1)}`,
          iso(b.pickupAt),
          `${TAG} — ${b.note}`.trim(),
        ]
      );

      const rec = {
        id: bk.id,
        reference: bk.reference,
        token: bk.public_token,
        total: Number(bk.total),
        amountDue: Number(bk.amount_due),
        currency: bk.currency,
        classSlug: b.slug,
        createdAt: t.created,
        paidAt: null,
        startedGateway: false,
        fate: b.fate,
      };

      // ── مسار الدفع ─────────────────────────────────────────────────────
      const needsPayment = b.fate !== "pending_payment" && !(b.fate === "cancelled" && b.cancelledUnpaid);

      if (needsPayment) {
        let paidByGateway = false;
        if (gatewayOn && b.wantsGateway) {
          // نقطة حفظ: فشل البوابة يعود بهدوء إلى مسار الإيصال اليدوي ولا يُجهض الحجز
          const res = await attempt(async () => {
            const intent = await one(
              `select * from public.create_payment_intent($1::uuid, 'test', $2::int, $3::text)`,
              [rec.id, Math.round(rec.amountDue * 100), rec.currency]
            );
            const ref = `${TAG}-INT-${rec.reference}`;
            await q(`select public.attach_intent_ref($1::uuid, $2::text, $3::text)`, [
              intent.id,
              ref,
              `https://sandbox.example/pay/${ref}`,
            ]);
            return await one(
              `select * from public.settle_payment_intent_v2(
                 'test', $1::text, $2::text, 'succeeded', $3::int, $4::text, $5::jsonb)`,
              [
                `${TAG}-EVT-${rec.reference}`,
                ref,
                intent.amount_minor,
                rec.currency,
                JSON.stringify({ eventType: "payment.succeeded", demo: true }),
              ]
            );
          });
          const settled = res.ok ? res.value : null;
          paidByGateway = Boolean(settled) && ["settled", "recorded"].includes(settled.outcome);
          rec.startedGateway = paidByGateway;
          if (paidByGateway) stats.gateway++;
        }

        if (!paidByGateway) {
          const acct = weighted(facing.map((a, idx) => [a, idx === 0 ? 3 : 2]));
          await q(`select public.attach_receipt($1::text, $2::text, $3::uuid, null::numeric)`, [
            rec.token,
            // الصورة المرفوعة إن نجح الرفع، وإلا مسار داخل مجلد التوكن (الشكل
            // الذي يكتبه /api/booking/receipt) — بلا ملف خلفه لكن بلا كذب في الشكل.
            receiptPath ?? `${rec.token}/${TAG.toLowerCase()}-receipt.png`,
            acct.id,
          ]);
          if (b.fate !== "under_review") {
            await q(`select public.verify_payment($1::uuid, true, $2::text)`, [
              rec.id,
              "اعتماد التحويل — مطابق للمبلغ",
            ]);
          }
        }
        if (b.fate !== "under_review") rec.paidAt = t.verified;
      }

      // ── مسار البث والإسناد ─────────────────────────────────────────────
      // (يُقرأ الوضع الفعلي لا المتوقَّع: لو تعذّر تأكيد الحجز في مسار البوابة
      //  بقي «قيد المراجعة» ولا معنى لبثّه — و`start_dispatch` سترفض بحق.)
      let assignedTo = null;
      if (["assigned", "completed"].includes(b.fate)) {
        const st = await one(`select status from public.bookings where id = $1::uuid`, [rec.id]);
        if (st?.status === "confirmed") {
          const res = await attempt(() =>
            runDispatch(rec, b, partnerById, approvedPartners, admin, cfg, stats)
          );
          assignedTo = res.ok ? res.value : null;
          if (!res.ok) await actAs(admin.id); // نقطة الحفظ لا تُعيد هوية الجلسة
        }
      }

      // ── الحالة النهائية ────────────────────────────────────────────────
      if (b.fate === "completed" && assignedTo) {
        await q(`select public.set_booking_status($1::uuid, 'completed', $2::text)`, [
          rec.id,
          "اكتملت الرحلة وسُلّم العميل",
        ]);
      } else if (b.fate === "completed") {
        // بلا متعهد لا يُكتب قيد استحقاق — يبقى الحجز مؤكَّداً ثم يُتمّ من اللوحة
        await q(`select public.set_booking_status($1::uuid, 'completed', $2::text)`, [
          rec.id,
          "نُفِّذت بسيارات الشركة",
        ]);
      } else if (b.fate === "cancelled") {
        await q(`select public.set_booking_status($1::uuid, 'cancelled', $2::text)`, [
          rec.id,
          pick(CANCEL_REASONS),
        ]);
        // ردّ جزئي أحياناً حين كان العميل قد دفع
        if (!b.cancelledUnpaid && chance(0.4)) {
          await q(
            `select public.record_refund($1::uuid, $2::uuid, $3::numeric, $4::timestamptz, $5::text)`,
            [
              rec.id,
              cashAccount.id,
              Math.max(50, Math.round(rec.amountDue * rFloat(0.5, 1))),
              iso(new Date(Math.min(addMin(t.cancelled, rInt(60, 60 * 30)).getTime(), END.getTime()))),
              `${TAG} — ردّ بعد إلغاء الحجز ${rec.reference}`,
            ]
          );
        }
      }

      // ── التأريخ البعدي — تمريرة واحدة داخل نفس المعاملة ─────────────────
      await backdate(rec, b, t);

      // ⚠ الحالة الفعلية لا المقصودة: ثلاثة فروع أعلاه قد لا تبلغ مصيرها —
      //   بثٌّ لم يقبله أحد وتعذّر تصعيده يدوياً (لا متعهد بعد بعد في شهره، أو
      //   رفضت `dispatches_guard_margin` المستحق) يترك الحجز `confirmed`
      //   بينما الخلاصة تعدّه `assigned`. رقمٌ في التقرير لا يطابق ما في
      //   القاعدة هو أسوأ من رقم سيّئ: يُخفي العطل بدل أن يكشفه.
      const finalRow = await one(`select status from public.bookings where id = $1::uuid`, [rec.id]);
      rec.fate = finalRow?.status ?? b.fate;
      if (rec.fate !== b.fate) stats.drifted++;

      await q("commit");
      seeded.push(rec);
      stats.byFate[rec.fate] = (stats.byFate[rec.fate] ?? 0) + 1;
    } catch (e) {
      await q("rollback").catch(() => {});
      stats.failed++;
      if (stats.failed <= 5) line(`\n   ⚠ تعذّر زرع حجز (${e.message.split("\n")[0]})`);
    }

    doneInMonth++;
    if (doneInMonth % 5 === 0) process.stdout.write("▪");
  }
  line();
  line(
    `   ✔ زُرع ${num(seeded.length)} حجزاً` +
      (stats.failed ? ` (تعذّر ${num(stats.failed)})` : "") +
      ` — ${Object.entries(stats.byFate).map(([k, v]) => `${k}:${v}`).join(" · ")}` +
      (stats.drifted ? ` · (${num(stats.drifted)} منها لم تبلغ مصيرها المخطط)` : "")
  );
  line(
    `   ✔ البث: ${num(stats.offers)} عرضاً · قُبل ${num(stats.accepted)} · رُفض ${num(stats.rejected)} · ` +
      `انتهت مهلة ${num(stats.expired)} · إسناد يدوي ${num(stats.manual)}` +
      (stats.gateway ? ` · بوابة ${num(stats.gateway)}` : "")
  );

  // ── (٧-٥) طلبات الأسعار اليدوية ──────────────────────────────────────────
  head("٤) طلبات الأسعار اليدوية");
  const services = ["airport-transfer", "city-rides", "intercity-travel", "tours", "events", "conferences"];
  const quoteRefs = [];
  for (let i = 0; i < QUOTE_REQUESTS; i++) {
    const at = new Date(START.getTime() + rnd() * (END.getTime() - START.getTime()));
    try {
      const qr = await one(
        `select * from public.create_quote_request($1::text, $2::text, $3::text, $4::text)`,
        [pick(services), arabicName(), arabicPhone(), `${TAG} — ${pick(QUOTE_DETAILS)}`]
      );
      const status = weighted([
        ["new", at >= INFLIGHT_FROM ? 6 : 1],
        ["contacted", 3],
        ["converted", 2],
        ["closed", 3],
      ]);
      // تحديث مباشر — وهو مسار النظام نفسه لهذا الحقل
      // (`app/admin/quote-requests/actions.ts` يفعل الشيء نفسه، ولا دالة له).
      await q(
        `update public.quote_requests
            set status = $2::text, created_at = $3::timestamptz
          where id = $1::uuid`,
        [qr.id, status, iso(at)]
      );
      await q(
        `update public.notifications
            set created_at   = $2::timestamptz,
                status       = 'sent',
                delivered_at = $2::timestamptz + interval '3 minutes'
          where payload ->> 'quoteRequestId' = $1::uuid::text`,
        [qr.id, iso(at)]
      );
      quoteRefs.push({ reference: qr.reference, at });
    } catch (e) {
      line(`   ⚠ تعذّر طلب عرض سعر: ${e.message.split("\n")[0]}`);
    }
  }
  line(`   ✔ ${num(quoteRefs.length)} طلباً بحالات مختلفة (جديد · تم التواصل · تحوّل · مغلق)`);

  // ── (٧-٦) المصروفات ودفعات المتعهدين ─────────────────────────────────────
  head("٥) الخزينة — المصروفات ودفعات المتعهدين");
  await actAs(admin.id);

  // ⚠ المُحصَّل فعلاً (`amount_due`) لا الإجمالي: خطة العربون تُحصّل ٣٠٪ فقط عند
  //   التأكيد والباقي عند التنفيذ خارج هذا السكربت. حساب العمولة على `total`
  //   يجعلها ~٣ أضعاف حقّها في الشهور التي تكثر فيها الرحلات الطويلة (وهي
  //   بالضبط شهور العربون)، فيظهر بند «عمولات» مضخَّماً في كل شاشات المصروفات.
  const revenueByMonth = {};
  for (const r of seeded) if (r.paidAt) {
    const mk = monthKey(r.createdAt);
    revenueByMonth[mk] = (revenueByMonth[mk] ?? 0) + r.amountDue;
  }

  let expenseCount = 0;
  let expenseTotal = 0;
  const addExpense = async (catName, amount, at, note) => {
    const id = catByName[catName] ?? null;
    if (amount <= 0) return;
    await q(
      `select public.record_expense($1::uuid, $2::uuid, $3::numeric, $4::timestamptz, $5::text, null::text)`,
      [
        weighted(facing.map((a, i) => [a.id, i === 0 ? 3 : 1])),
        id,
        Math.round(amount),
        iso(at),
        `${TAG} — ${note}`,
      ]
    );
    expenseCount++;
    expenseTotal += Math.round(amount);
  };

  for (const mk of Object.keys(MONTHLY_BOOKINGS)) {
    const [y, m] = mk.split("-").map(Number);
    const scale = MONTHLY_BOOKINGS[mk] / 40; // حجم الشهر
    const lastDay = mk === "2026-08" ? 13 : new Date(Date.UTC(y, m, 0)).getUTCDate();
    const firstDay = mk === "2026-02" ? 13 : 1;

    // وقود: أسبوعي متذبذب
    for (let d = firstDay; d <= lastDay; d += 7) {
      await addExpense(
        "وقود",
        rFloat(2400, 6200) * Math.max(0.5, scale),
        new Date(Date.UTC(y, m - 1, Math.min(d, lastDay), rInt(9, 18), rInt(0, 59))),
        pick(EXPENSE_NOTES["وقود"])
      );
    }
    // صيانة: مرة إلى مرتين شهرياً
    for (let k = 0; k < (chance(0.5) ? 2 : 1); k++) {
      await addExpense(
        "صيانة",
        rFloat(2800, 9500) * Math.max(0.6, scale),
        new Date(Date.UTC(y, m - 1, rInt(firstDay, lastDay), rInt(10, 17), rInt(0, 59))),
        pick(EXPENSE_NOTES["صيانة"])
      );
    }
    // رواتب: نفس اليوم من كل شهر (ومقصوصة داخل النافذة — فبراير يبدأ من ١٣)
    await addExpense(
      "رواتب",
      rFloat(16000, 23000) * Math.max(0.7, Math.min(1.6, scale)),
      new Date(Date.UTC(y, m - 1, Math.max(firstDay, Math.min(5, lastDay)), 12, 0)),
      pick(EXPENSE_NOTES["رواتب"])
    );
    // تسويق: متقطع، ويقفز في شهر الحملة
    if (chance(0.75) || mk === "2026-05") {
      await addExpense(
        "تسويق",
        (mk === "2026-05" ? rFloat(9000, 16000) : rFloat(1400, 7800)) * Math.max(0.6, scale),
        new Date(Date.UTC(y, m - 1, rInt(firstDay, lastDay), rInt(11, 19), rInt(0, 59))),
        pick(EXPENSE_NOTES["تسويق"])
      );
    }
    // عمولات: نسبة من إيراد الشهر
    const rev = revenueByMonth[mk] ?? 0;
    if (rev > 0) {
      await addExpense(
        "عمولات",
        rev * rFloat(0.025, 0.045),
        new Date(Date.UTC(y, m - 1, Math.min(lastDay, 28), 15, 0)),
        pick(EXPENSE_NOTES["عمولات"])
      );
    }
    // إداري
    await addExpense(
      "إداري",
      rFloat(1200, 2600),
      new Date(Date.UTC(y, m - 1, Math.max(firstDay, Math.min(3, lastDay)), 11, 0)),
      pick(EXPENSE_NOTES["إداري"])
    );
  }
  line(`   ✔ ${num(expenseCount)} مصروفاً بإجمالي ${money(expenseTotal)}`);

  /**
   * دفعات المقاصة: جزء من **المستحق الصافي** لكل متعهد شهرياً — كي لا يكون كشف
   * الحساب واردَ استحقاق فقط.
   *
   * ⚠ الأساس `net_due` لا `earned`، وليس هذا تدقيقاً محاسبياً بل شرط بقاء
   *   السكربت حياً. المتعهد يخرج من الرحلة وقد **قبض نقداً** من العميل جزءاً من
   *   مالنا، فالمعادلة `earned − collected − paid + received` (‏D-49) لا `earned`
   *   وحدها. والحساب من `earned` كان يدفع له أضعاف ما نملكه عنده — مقيسٌ على هذه
   *   القاعدة: دُفع لـ«النصر» ٨٣٬١١٢ وقد حصّل بنفسه ٦٨٬٩٠٨ من أصل ١٣٤٬٣٥٦ مستحقاً،
   *   فانقلب رصيده إلى **مدينٍ لنا** بـ١٧٬٦٦٤. ثم يرفض
   *   `partner_payouts_guard_owing` (‏0027) الدفعة التالية رفضاً قاطعاً ويُسقط
   *   الزرع كله عند رابع متعهد — قبل أحداث القمع والطاقم واللمسات الأخيرة.
   *   عيبٌ حيٌّ منذ الدفعة ٢، لم يظهر لأن أحداً لم يُعِد الزرع بعدها.
   *
   * 🔒 والرقم يُقرأ من `v_partner_settlements` لا يُحسب هنا: «لا حساب مال في
   *    TypeScript» ليست قاعدة للتطبيق وحده — سكربتٌ يحسب المقاصة بنفسه يصير
   *    مصدر حقيقة ثانياً ينحرف عن الأول بهدوء.
   *
   * 🔒 وكل دفعة داخل `try`: حارسٌ مشروع في القاعدة يجب أن يوقف **الدفعة** لا
   *    السكربت. من يضيف حارساً ثالثاً غداً يجد زرعاً ينقص دفعةً، لا زرعاً ميتاً.
   */
  let payoutCount = 0;
  let payoutTotal = 0;
  let payoutBlocked = 0;
  for (const p of approvedPartners) {
    const due = await one(
      `select net_due from public.v_partner_settlements where subcontractor_id = $1::uuid`,
      [p.id]
    );
    let remaining = Number(due?.net_due ?? 0) * rFloat(0.55, 0.88);
    if (remaining < 500) continue;
    const months = Object.keys(MONTHLY_BOOKINGS).filter(
      (mk) => Number(mk.split("-")[1]) > p.joinMonth
    );
    if (!months.length) continue;
    const per = remaining / months.length;
    for (const mk of months) {
      const [y, m] = mk.split("-").map(Number);
      const day = mk === "2026-08" ? 10 : 25;
      const amount = Math.round(per * rFloat(0.7, 1.25));
      if (amount < 200 || amount > remaining) continue;
      try {
        await q(
          `select public.record_partner_payout($1::uuid, $2::uuid, $3::numeric, $4::timestamptz, $5::text)`,
          [
            p.id,
            cashAccount.id,
            amount,
            iso(new Date(Date.UTC(y, m - 1, day, rInt(11, 17), rInt(0, 59)))),
            `${TAG} — مقاصة ${AR_MONTH[mk]} مع «${p.name}»`,
          ]
        );
        remaining -= amount;
        payoutCount++;
        payoutTotal += amount;
      } catch (e) {
        payoutBlocked++;
        if (payoutBlocked <= 3) {
          line(`\n   ⚠ رُفضت دفعة لـ«${p.name}»: ${e.message.split("\n")[0]}`);
        }
      }
    }
  }
  line(
    `   ✔ ${num(payoutCount)} دفعة مقاصة بإجمالي ${money(payoutTotal)}` +
      (payoutBlocked ? ` · ورفضت القاعدة ${num(payoutBlocked)} (حارس مشروع — راجعها)` : "")
  );

  /**
   * ومقدَّمٌ صريح واحد لآخر متعهد معتمد — كي يبقى **الاتجاه الثاني** من الحساب
   * المفتوح ظاهراً في العرض: «المتعهد مدين لنا».
   *
   * لماذا عمداً وبدالةٍ أخرى؟ لأن الحساب مع الشريك يجري في الاتجاهين بطبيعته
   * (‏D-49)، وشاشتا `/admin/finance/partners` و«حسابك مع المنصة» في البورتال
   * تعالجان الإشارتين — فبيانات كلها في اتجاه واحد تُخفي نصف الميزة. وبعد إصلاح
   * أساس الدفع أعلاه لم يعد أحد يقع في المديونية **بالخطأ**، وهذا هو الصواب:
   * المديونية حالةٌ تُصنع بقرار مكتوب (`record_partner_payout_advance` التي ترفع
   * `tours.allow_partner_advance`) لا أثرٌ جانبي لحساب خاطئ.
   */
  const advanceTo = approvedPartners[approvedPartners.length - 1];
  if (advanceTo) {
    const due = await one(
      `select net_due from public.v_partner_settlements where subcontractor_id = $1::uuid`,
      [advanceTo.id]
    );
    // مبلغ يتجاوز ما بقي له فيقلب رصيده — وهذا هو المقصود من «مقدَّم»
    const amount = Math.round(Math.max(1500, Number(due?.net_due ?? 0) + rFloat(3000, 9000)));
    try {
      await q(
        `select public.record_partner_payout_advance($1::uuid, $2::uuid, $3::numeric, $4::timestamptz, $5::text)`,
        [
          advanceTo.id,
          cashAccount.id,
          amount,
          iso(new Date(Date.UTC(2026, 7, 11, 13, 0))),
          `${TAG} — مقدَّم عن رحلات قادمة مع «${advanceTo.name}»`,
        ]
      );
      line(`   ✔ مقدَّم صريح واحد بـ${money(amount)} لـ«${advanceTo.name}» — فيظهر الاتجاهان في المقاصة`);
    } catch (e) {
      line(`   ⚠ تعذّر تسجيل المقدَّم الصريح: ${e.message.split("\n")[0]}`);
    }
  }

  // ── (٧-٧) أحداث القمع ────────────────────────────────────────────────────
  head("٦) أحداث القمع");
  const events = [];
  const push = (event, at, reference = null, value = null, currency = null) =>
    events.push([event, reference, TAG, value, currency, iso(at)]);

  // الحجوزات: كل حجز له booking_created، وكل تحصيل له booking_paid بنفس المرجع
  for (const r of seeded) {
    push("booking_created", r.createdAt, r.reference, r.total, r.currency);
    if (r.startedGateway) push("booking_started", addMin(r.createdAt, rInt(2, 40)), r.reference, r.total, r.currency);
    if (r.paidAt) push("booking_paid", r.paidAt, r.reference, r.total, r.currency);
  }
  // من لم يمر بالبوابة: نسبة اختارت الدفع الإلكتروني ثم عدلت — ~١٠٪ إجمالاً
  for (const r of seeded) {
    if (!r.startedGateway && chance(0.09)) {
      push("booking_started", addMin(r.createdAt, rInt(2, 40)), r.reference, r.total, r.currency);
    }
  }
  for (const qr of quoteRefs) push("quote_requested", qr.at, qr.reference);

  // البحث وعرض الأسعار: بلا مرجع (كما يكتبهما app/api/quote/route.ts)، ويُكتبان
  // معاً في نفس اللحظة ⇒ quote_viewed ≤ search_performed بنيوياً — شرط بقاء
  // معدل التحول ≤ ١٠٠٪ في analytics_tests (ج-ب-٨).
  const perDay = {};
  for (const r of seeded) {
    const d = iso(r.createdAt).slice(0, 10);
    perDay[d] = (perDay[d] ?? 0) + 1;
  }
  let searchTotal = 0;
  let viewTotal = 0;
  for (const [d, n] of Object.entries(perDay)) {
    const searches = Math.max(1, Math.round(n * SEARCH_PER_BOOKING * rFloat(0.75, 1.3)));
    const views = Math.round(searches * VIEW_RATIO * rFloat(0.9, 1));
    for (let i = 0; i < searches; i++) {
      // الساعة ≤ ٢٢ كي لا يعبر «عرض العروض» منتصف الليل فيخرج عن النافذة
      const at = new Date(`${d}T00:00:00Z`).getTime() + rInt(5, 22) * 3600000 + rInt(0, 59) * 60000;
      push("search_performed", new Date(at));
      if (i < views) push("quote_viewed", new Date(at + rInt(3, 90) * 1000));
    }
    searchTotal += searches;
    viewTotal += Math.min(views, searches);
  }

  // إدراج مجمّع — دفعات من ٥٠٠ صف
  for (let i = 0; i < events.length; i += 500) {
    const chunk = events.slice(i, i + 500);
    const values = chunk
      .map((_, k) => {
        const o = k * 6;
        return `($${o + 1},$${o + 2},$${o + 3},$${o + 4}::numeric,$${o + 5},$${o + 6}::timestamptz)`;
      })
      .join(",");
    await q(
      `insert into public.funnel_events (event, reference, class_slug, value, currency, created_at)
       values ${values}`,
      chunk.flat()
    );
    process.stdout.write("▪");
  }
  line();
  line(
    `   ✔ ${num(events.length)} حدثاً — بحث ${num(searchTotal)} · عرض ${num(viewTotal)} · ` +
      `حجز ${num(seeded.length)} · دفع ${num(seeded.filter((r) => r.paidAt).length)} · ` +
      `طلب سعر ${num(quoteRefs.length)}`
  );

  // ── (٧-٨) طاقم الرحلات — المركبة والسائق بعد الإسناد (الدفعة ٥) ──────────
  //
  // 🔒 بالدالة الحقيقية `set_trip_crew` **وبهوية الشريك نفسه**، لا بكتابة
  //    عمودين خامين على `dispatches`. والفرق ليس شكلياً: الدالة `definer` تشتق
  //    الهوية من `current_subcontractor_id()` وترفض ما ليس من أسطول المنادي ولا
  //    سجلّه (‏`0040`)، وترفض دورةً ليست `assigned` (‏`0043` عيب ٢). فالمرور بها
  //    يعني أن البيانات المزروعة **لا يمكن** أن تخالف ما يفرضه النظام على
  //    الشريك الحقيقي — وأي خرق في الزرع يظهر خطأً هنا لا سطراً فاسداً في القاعدة.
  //    (وهي نفس المناورة المستعملة مع `accept_offer`: `actAs(p.profileId)`.)
  head("٧) طاقم الرحلات — المركبة والسائق");
  await actAs(admin.id);

  const crewStats = { staffed: 0, vehicleOnly: 0, future: 0, skipped: 0, failed: 0 };
  {
    // (أ) السجلّان كما هما في القاعدة الآن — يُقرآن ولا يُبنيان من الذاكرة
    //     (الدرس ١٤: اقرأ من الكتالوج لا من افتراضك عمّا كتبتَه قبل قليل).
    const roster = {};
    const bucket = (id) => (roster[id] ??= { vehicles: [], drivers: [] });
    for (const v of (
      await q(
        `select v.id, v.subcontractor_id, v.class_slug
           from public.subcontractor_vehicles v
           join public.subcontractors s on s.id = v.subcontractor_id
          where s.notes like $1 and v.active
          order by v.created_at`,
        [`${TAG}%`]
      )
    ).rows) {
      bucket(v.subcontractor_id).vehicles.push(v);
    }
    for (const d of (
      await q(
        `select dr.id, dr.subcontractor_id, dr.active, dr.created_at
           from public.subcontractor_drivers dr
           join public.subcontractors s on s.id = dr.subcontractor_id
          where s.notes like $1
          order by dr.created_at`,
        [`${TAG}%`]
      )
    ).rows) {
      bucket(d.subcontractor_id).drivers.push({ ...d, since: new Date(d.created_at).getTime() });
    }

    // (ب) الرحلات المؤهَّلة: دورة `assigned` لمتعهد ديمو. الشرط ليس ترفاً —
    //     `set_trip_crew` ترفض غيرها، وقائمةٌ أوسع تعني عشرات الاستثناءات
    //     المبتلعة وعدّاداً كاذباً.
    const trips = (
      await q(
        `select d.booking_id, d.assigned_subcontractor_id as sub, d.assigned_at,
                b.class_slug, b.status as booking_status,
                nullif(btrim(coalesce(b.trip ->> 'pickupAt', '')), '')::timestamptz as pickup_at
           from public.dispatches d
           join public.bookings b on b.id = d.booking_id
          where b.trip ->> 'notes' like $1
            and d.status = 'assigned'
            and d.assigned_subcontractor_id is not null
          order by pickup_at`,
        [`${TAG}%`]
      )
    ).rows;

    const HOUR = 3600000;
    const now = Date.now();
    const backdates = [];
    let stoppedUsed = false;

    for (const t of trips) {
      const p = partnerById[t.sub];
      const kit = roster[t.sub];
      // متعهد بلا حساب دخول لا يُنادي `set_trip_crew` أصلاً (الهوية مشتقّة لا
      // ممرَّرة)، ولا يُصطنع له مسارٌ ثانٍ — الإدارة تسجّل عنه بـ
      // `admin_set_trip_crew`، وذاك مسار عرضٍ آخر لا يخصّ هذا الزرع.
      if (!p?.profileId || !kit?.vehicles.length || !t.pickup_at) {
        crewStats.skipped++;
        continue;
      }

      const pickup = new Date(t.pickup_at).getTime();
      const ahead = pickup - now;

      /**
       * من يسجّل طاقمه؟ **انضباط الشريك نفسه**، مشتقّاً من `acceptRate` لا من
       * مقبض جديد: من يردّ على العروض سريعاً هو من يملأ خانة السائق، والبطيء
       * الذي يرفض نصف ما يصله هو الذي ينساها. اشتقاقٌ لا حقل، كي تبقى شخصية كل
       * متعهد **واحدة** في كل شاشة تعرضه.
       * والزمن يقرر الباقي: رحلةٌ نُفّذت لها طاقمها بالضرورة أو لم يُسجَّل قط،
       * ورحلةٌ بعد أسبوع لم يقرر الشريك سيارتها بعد. فتبقى حالتا «مسجَّل» و«لم
       * يُسجَّل» ظاهرتين معاً في البورتال — وهو الغرض.
       */
      const diligence = 0.35 + p.acceptRate * 0.6;
      const willStaff = ahead <= 5 * 24 * HOUR ? cChance(diligence) : cChance(0.25);
      if (!willStaff) continue;

      // المركبة من فئة الحجز حين تتوفر: `set_trip_crew` لا تشترط التطابق (ولها
      // حق — الشريك قد يُرقّي العميل بسيارة أكبر)، لكن «ميني باص» على حجز سيدان
      // في عرضٍ تجريبي يُقرأ خطأَ بيانات لا ترقية.
      const sameClass = kit.vehicles.filter((v) => v.class_slug === t.class_slug);
      const veh = cPick(sameClass.length ? sameClass : kit.vehicles);

      // 🔒 من كان في السجل **يوم الرحلة** وحده: سائقٌ سُجِّل في يونيو لا يقود
      //    رحلة فبراير. الشرط لا تفرضه القاعدة (المخزَّن معرِّفٌ لا لقطة، وهو
      //    قرار 0040 المقصود)، لكنه يفرضه المعنى — ولو سقط لظهر في `/admin/logs`
      //    سطرُ طاقمٍ سابقٌ لميلاد صاحبه. والأولان مسجَّلان يوم انضمام المتعهد
      //    فلا تخلو أي رحلةٍ له من مرشَّح.
      const onDuty = kit.drivers.filter((d) => d.since <= pickup);
      const activeDrivers = onDuty.filter((d) => d.active);
      const stoppedDrivers = onDuty.filter((d) => !d.active);

      // الحالة الوحيدة المقصودة للسائق المتوقف: رحلة **نُفّذت** لمتعهده — أي
      // سائقٌ قاد ثم ترك الشركة. بها يُغطّى طرفا شرط `crew-panel.tsx`
      // (`row.active || row.id === selectedId`): يختفي من قائمة رحلة جديدة،
      // ويبقى مقروءاً بوسم «متوقف» على رحلته هو.
      const useStopped =
        !stoppedUsed && stoppedDrivers.length > 0 && ahead < 0 && t.booking_status === "completed";

      let drv = useStopped ? stoppedDrivers[0] : activeDrivers.length ? cPick(activeDrivers) : null;
      // ~٨٪ مركبة بلا سائق: الشريك حجز السيارة ولم يقرر من يقودها. حالةٌ
      // مشروعة في العقد (`driverName` تخرج `null` والحمولة تبقى غير فارغة)
      // ولا وجود لها في القاعدة اليوم، فلا يُرى شكلها إلا هنا.
      if (!useStopped && cChance(0.08)) drv = null;

      /**
       * 🔒 `set_trip_crew` تكتب `crew_at = now()` نصّاً — أي «اليوم» على رحلة
       * نُفّذت في مارس. والعمود يخرج في `portal_trips` ويُقرأ في السجل، فيصير كل
       * سطر طاقم كذبةً صغيرة متّسقة. ولا دالة تقبل تاريخاً (ولا يجب أن تقبل:
       * الإنتاج يكتب اللحظة الحقيقية)، فيُزاح بتمريرة واحدة بعد الحلقة — وهو
       * حرفياً منطق `backdate` نفسه ومبرره نفسه.
       * والحدّان: بعد الإسناد بساعة على الأقل، وقبل الالتقاء (ولا يتجاوز الآن).
       */
      const upper = Math.min(now, pickup);
      const lower = Math.min((t.assigned_at ? new Date(t.assigned_at).getTime() : pickup) + HOUR, upper);
      const crewAt = new Date(Math.min(Math.max(lower, pickup - cInt(2, 72) * HOUR), upper));

      try {
        await actAs(p.profileId);
        await q(`select public.set_trip_crew($1::uuid, $2::uuid, $3::uuid)`, [
          t.booking_id,
          veh.id,
          drv?.id ?? null,
        ]);
        crewStats.staffed++;
        if (!drv) crewStats.vehicleOnly++;
        if (ahead > 0) crewStats.future++;
        if (useStopped) stoppedUsed = true;
        backdates.push([t.booking_id, iso(crewAt)]);
      } catch (e) {
        crewStats.failed++;
        if (crewStats.failed <= 3) line(`\n   ⚠ تعذّر تسجيل طاقم (${e.message.split("\n")[0]})`);
      } finally {
        await actAs(admin.id);
      }
    }

    // (ج) إزاحة `crew_at` — تمريرة واحدة بمصفوفتين متوازيتين.
    //     ⚠ لا تمسّ `assigned_subcontractor_id` فلا يُطلق
    //       `dispatches_clear_crew_on_reassign` (مُشغّل `update of` عمودٍ بعينه)
    //       فيمحو ما سجّلناه للتوّ. ولا تمسّ `assigned_payout` فيخرج
    //       `dispatches_guard_margin` من أول سطر. و`updated_at` محميّ لأن
    //       مُشغّله معطَّل في هذه اللحظة (انظر ترويسة الملف).
    if (backdates.length) {
      await q(
        `update public.dispatches d
            set crew_at = x.at
           from (select unnest($1::uuid[]) as booking_id, unnest($2::timestamptz[]) as at) x
          where d.booking_id = x.booking_id`,
        [backdates.map((r) => r[0]), backdates.map((r) => r[1])]
      );
    }

    line(
      `   ✔ ${num(crewStats.staffed)} رحلة من ${num(trips.length)} مُسنَدة سُجِّل طاقمها ` +
        `(${num(trips.length - crewStats.staffed - crewStats.skipped)} بلا طاقم بعد — والحالتان مقصودتان)`
    );
    line(
      `   ✔ منها ${num(crewStats.future)} رحلة قادمة يراها العميل الآن · ` +
        `${num(crewStats.vehicleOnly)} بمركبة بلا سائق · ` +
        `${stoppedUsed ? "وسائق متوقف على رحلةٍ نفّذها" : "ولا سائق متوقف مُسنَد"}` +
        (crewStats.failed ? ` · تعذّر ${num(crewStats.failed)}` : "")
    );
  }

  // ── (٧-٩) لمسات أخيرة ────────────────────────────────────────────────────
  head("٨) لمسات أخيرة");

  // العروض التي بقيت معلّقة بعد الإزاحة: مهلة منتهية في الماضي تلتقطها
  // dispatch_tick() لاحقاً فتفتح موجات على حجوزات «تاريخية». تُغلق صراحةً،
  // وما كان في آخر أسبوع تُمدَّد مهلته كي يبدو حياً في البورتال.
  const expiredFix = await q(
    `update public.trip_offers o
        set status = 'expired', responded_at = o.expires_at
      from public.bookings b
      where b.id = o.booking_id and b.trip ->> 'notes' like $1
        and o.status = 'pending' and o.created_at < now() - interval '7 days'`,
    [`${TAG}%`]
  );
  const liveFix = await q(
    `update public.trip_offers o
        set expires_at = now() + make_interval(mins => $2::int)
      from public.bookings b
      where b.id = o.booking_id and b.trip ->> 'notes' like $1
        and o.status = 'pending' and o.expires_at <= now()`,
    [`${TAG}%`, Number(cfg.window_minutes)]
  );
  line(`   ✔ أُغلق ${num(expiredFix.rowCount)} عرضاً تاريخياً · مُدّدت مهلة ${num(liveFix.rowCount)} عرضاً حياً`);

  // 🔒 شبكة أمان `dispatch_tick()` القسم (٤): «حجز مؤكَّد بلا صف دورة أصلاً»
  //    تلتقط كل حجز `confirmed` وتبثّه فوراً — ومنها حجوزات الديمو التي انتهت
  //    عند `confirmed` عمداً (مصير `confirmed`، أو مصير `assigned` تعذّر بثّه).
  //    فأول دورة بث بعد النشر تُرسل عروضاً حقيقية إلى متعهدين حقيقيين على رحلات
  //    لم تُطلب. صفُّ دورة بحالة `manual` يُخرجها من الشبكة (تشترط غياب الصف)
  //    ومن حلقة الموجات (تشترط queued/broadcasting)، ويصفها وصفاً صادقاً:
  //    مؤكَّدة بانتظار إسناد بشري — وهو موضعها الطبيعي في طابور التشغيل.
  const parked = await q(
    `insert into public.dispatches (booking_id, status, round, created_at, updated_at)
     select b.id, 'manual', 0, x.at, x.at
       from public.bookings b
       left join public.dispatches d on d.booking_id = b.id
       cross join lateral (
         select coalesce(
                  (select max(pm.verified_at) from public.payments pm where pm.booking_id = b.id),
                  b.created_at) as at
       ) x
      where b.trip ->> 'notes' like $1
        and b.status = 'confirmed'
        and d.booking_id is null
     on conflict (booking_id) do nothing`,
    [`${TAG}%`]
  );
  line(`   ✔ ${num(parked.rowCount)} حجزاً مؤكَّداً وُضع في الطابور اليدوي فلا تبثّه دورة البث`);

  // صمام أمان للإشعارات: الوسم الحقيقي يقع داخل معاملة كل حجز (انظر backdate)،
  // وهذه تلتقط ما لا حجز له — إشعار متأخر، أو صفٌّ من تشغيل انهار قبل إزاحته.
  const notif = await q(
    `update public.notifications n
        set status = 'sent',
            delivered_at = coalesce(n.delivered_at, n.created_at + interval '2 minutes')
      where n.status = 'queued'
        and (n.payload ->> 'bookingId' in (
               select b.id::text from public.bookings b where b.trip ->> 'notes' like $1)
          or n.payload ->> 'quoteRequestId' in (
               select r.id::text from public.quote_requests r where r.details like $1))`,
    [`${TAG}%`]
  );
  line(`   ✔ ${num(notif.rowCount)} إشعاراً متبقياً وُسم «مُرسَل» (البقية وُسمت لحظة زرعها)`);

  // ── الخلاصة ──────────────────────────────────────────────────────────────
  head("خلاصة");
  const kpi = await one(
    `select
       (select count(*) from public.bookings where trip ->> 'notes' like $1)                     as bookings,
       (select coalesce(sum(total),0) from public.bookings where trip ->> 'notes' like $1)       as gmv,
       (select count(*) from public.subcontractors where notes like $1)                          as subs,
       (select count(*) from public.funnel_events where class_slug = $2)                         as funnel,
       (select count(*) from public.quote_requests where details like $1)                        as quotes,
       (select count(*) from public.expenses where note like $1)                                 as expenses,
       (select count(*) from public.partner_payouts where note like $1)                          as payouts,
       (select count(*) from public.ledger_entries e
          where e.booking_id in (select b.id from public.bookings b where b.trip ->> 'notes' like $1)
             or e.subcontractor_id in (select s.id from public.subcontractors s where s.notes like $1)) as ledger,
       (select count(*) from public.subcontractor_drivers dr
          where dr.subcontractor_id in (select s.id from public.subcontractors s where s.notes like $1)) as drivers,
       (select count(*) from public.subcontractor_vehicles v
          where v.subcontractor_id in (select s.id from public.subcontractors s where s.notes like $1)
            and v.color is not null) as colored,
       (select count(*) from public.dispatches d
          join public.bookings b on b.id = d.booking_id
         where b.trip ->> 'notes' like $1 and d.assigned_vehicle_id is not null) as crewed`,
    [`${TAG}%`, TAG]
  );
  line(`   الحجوزات        ${num(kpi.bookings)}   بإجمالي ${money(kpi.gmv)}`);
  line(`   المتعهدون       ${num(kpi.subs)}   ·  سائقون ${num(kpi.drivers)}  ·  مركبات ملوّنة ${num(kpi.colored)}`);
  line(`   طاقم مسجَّل      ${num(kpi.crewed)}   رحلة بمركبة معلَنة للعميل`);
  line(`   قيود الدفتر     ${num(kpi.ledger)}`);
  line(`   المصروفات       ${num(kpi.expenses)}   ·  دفعات المقاصة ${num(kpi.payouts)}`);
  line(`   طلبات الأسعار   ${num(kpi.quotes)}`);
  line(`   أحداث القمع     ${num(kpi.funnel)}`);
  line();
  line("   تصفّح الآن: /admin/stats · /admin/orders · /admin/finance · /admin/subcontractors");
  line("   لحذفها بالكامل: node scripts/demo-seed.mjs --clean");
}

// ═══════════════════════════════════════════════════════════════════════════
// (٨) البث — عروض تُقبل وتُرفض وتنتهي مهلتها، وبعضها يُصعَّد يدوياً
// ═══════════════════════════════════════════════════════════════════════════

async function runDispatch(rec, b, partnerById, approvedPartners, admin, cfg, stats) {
  const maxRounds = Number(cfg.max_rounds);
  let assigned = null;
  let lastRound = 0;

  for (let round = 1; round <= maxRounds && !assigned; round++) {
    const res = await attempt(() => one(`select * from public.start_dispatch($1::uuid)`, [rec.id]));
    const started = res.ok ? res.value : null;
    if (!started || started.status === "manual") break;

    // 🔒 «موجة سارية»: من لم يردّ في المحاكاة يبقى عرضه `pending` بمهلة لم تنتهِ
    //    بعد (الإزاحة إلى الماضي تقع لاحقاً في backdate)، و`start_dispatch`
    //    ترى معلّقاً فترجع **الموجة نفسها** بـ offers = 0 بلا فتح موجة جديدة
    //    (هجرة 0013 سطر ٦٥٠). بلا هذا الشرط تُعاد قراءة عروض الموجة ذاتها في
    //    كل لفّة: يتضاعف `stats.offers` عدّاً وهمياً، ويُعاد رمي النرد على من
    //    ردّ أو لم يردّ، ولا تُفتح موجة ثانية أبداً. لا جديد ⇒ أنهِ الحلقة.
    if (Number(started.offers) === 0 && Number(started.round) <= lastRound) break;
    lastRound = Number(started.round);

    const offers = (
      await q(
        `select o.id, o.subcontractor_id, o.payout
           from public.trip_offers o
          where o.booking_id = $1::uuid and o.round = $2::int and o.status = 'pending'`,
        [rec.id, started.round]
      )
    ).rows;
    stats.offers += offers.length;
    if (!offers.length) continue;

    for (const o of shuffle(offers)) {
      const p = partnerById[o.subcontractor_id];
      if (!p || !p.profileId) continue; // متعهد بلا حساب دخول لا يقبل ولا يرفض بنفسه

      const roll = rnd();
      if (roll < p.acceptRate) {
        // القبول بهوية المتعهد نفسه — accept_offer محروسة بـ current_subcontractor_id()
        const res = await attempt(async () => {
          await actAs(p.profileId);
          await q(`select * from public.accept_offer($1::uuid)`, [o.id]);
        });
        await actAs(admin.id);
        if (res.ok) {
          assigned = p;
          stats.accepted++;
          break;
        }
      } else if (roll < p.acceptRate + p.rejectRate) {
        const res = await attempt(async () => {
          await actAs(p.profileId);
          await q(`select public.reject_offer($1::uuid, $2::text)`, [o.id, pick(REJECT_REASONS)]);
        });
        await actAs(admin.id);
        if (res.ok) stats.rejected++;
      } else {
        stats.expired++; // لم يردّ — تنتهي مهلته وحدها
      }
    }
  }

  // لم يقبل أحد ⇒ التصعيد اليدوي (وهو ما يفعله فريق التشغيل فعلاً)
  if (!assigned) {
    const pool = approvedPartners.filter((p) => p.joinMonth <= Number(b.month.split("-")[1]));
    if (!pool.length) return null;
    const p = pick(pool);
    const floor = Number(cfg.min_margin_amount || 0);
    // المستحق يبقى دون الإجمالي بأرضية الهامش على الأقل — وإلا رفضه dispatches_guard_margin
    const payout = Math.max(
      1,
      Math.min(
        Math.round(rec.total * rFloat(0.58, 0.76)),
        Math.floor(rec.total - floor - 1)
      )
    );
    if (payout < 1) return null;
    const res = await attempt(() =>
      q(`select * from public.manual_assign($1::uuid, $2::uuid, $3::numeric, $4::text)`, [
        rec.id,
        p.id,
        payout,
        `${TAG} — تصعيد يدوي بعد انتهاء الموجات`,
      ])
    );
    if (!res.ok) return null;
    assigned = p;
    stats.manual++;
  }
  return assigned;
}

// ═══════════════════════════════════════════════════════════════════════════
// (٩) التأريخ البعدي — تمريرة واحدة، وبلا لمس أي عمود status
// ═══════════════════════════════════════════════════════════════════════════

/**
 * الإزاحة الموحّدة تجعل `bookings.created_at` يساوي التاريخ المستهدف وتحافظ على
 * الفروق بين الأحداث؛ ثم تُضبط الطوابع التي نعرف معناها ضبطاً مطلقاً كي يبدو
 * الجدول الزمني حقيقياً (إيصال بعد ساعات، اعتماد بعده، بثّ بعده، تنفيذ بعد أيام).
 * ⚠ الترتيب داخل معاملة الحجز نفسها: قيدُ تحصيلٍ يسبق تاريخ إنشاء حجزه يُفسد
 *   `cash_flow` و`partner_statement` معاً.
 */
async function backdate(rec, b, t) {
  const params = [
    rec.id,
    iso(t.created),
    iso(t.receipt),
    iso(t.verified),
    iso(t.dispatch),
    iso(t.assigned),
    iso(t.completed),
    iso(t.cancelled),
  ];

  await q(
    `with s as (select (now() - $2::timestamptz) as shift),

     -- (١) الحجز نفسه — لا يمس status فلا يُطلق أي حارس ولا يُعاد أي قيد
     b as (
       update public.bookings x
          set created_at = x.created_at - (select shift from s),
              updated_at = x.updated_at - (select shift from s)
        where x.id = $1::uuid
       returning 1),

     -- (٢) الإيصال والاعتماد
     p as (
       update public.payments x
          set created_at  = $3::timestamptz,
              verified_at = case when x.verified_at is null then null else $4::timestamptz end
        where x.booking_id = $1::uuid
       returning 1),

     -- (٣) الدفتر: التحصيل يوم الاعتماد، وأرجل المتعهد يوم التنفيذ، والردّ كما سُجِّل
     l as (
       update public.ledger_entries x
          set occurred_at = case x.source_type
                              when 'payment'            then $4::timestamptz
                              when 'partner_payout'     then $7::timestamptz
                              when 'partner_collection' then $7::timestamptz
                              else x.occurred_at - (select shift from s)
                            end
        where x.booking_id = $1::uuid
          and x.source_type <> 'refund'
       returning 1),

     -- (٤) البث والعروض
     d as (
       update public.dispatches x
          set created_at        = $5::timestamptz,
              updated_at        = $5::timestamptz,
              last_broadcast_at = case when x.last_broadcast_at is null then null else $5::timestamptz end,
              assigned_at       = case when x.assigned_at is null then null else $6::timestamptz end
        where x.booking_id = $1::uuid
       returning 1),
     o as (
       update public.trip_offers x
          set created_at   = $5::timestamptz,
              expires_at   = x.expires_at - (select shift from s),
              responded_at = case when x.responded_at is null then null else $6::timestamptz end
        where x.booking_id = $1::uuid
       returning 1),

     -- (٥) سجل الحالات — كل حدث إلى لحظته الحقيقية
     e as (
       update public.booking_events x
          set created_at = case x.to_status
                             when 'pending_payment' then $2::timestamptz
                             when 'under_review'    then $3::timestamptz
                             when 'confirmed'       then $4::timestamptz
                             when 'assigned'        then $6::timestamptz
                             when 'completed'       then $7::timestamptz
                             when 'cancelled'       then $8::timestamptz
                             else x.created_at - (select shift from s)
                           end
        where x.booking_id = $1::uuid
       returning 1),

     -- (٦) جلسات البوابة وأحداثها
     i as (
       update public.payment_intents x
          set created_at   = $3::timestamptz,
              completed_at = case when x.completed_at is null then null else $4::timestamptz end
        where x.booking_id = $1::uuid
       returning 1),
     v as (
       update public.payment_events x
          set created_at   = $4::timestamptz,
              processed_at = case when x.processed_at is null then null else $4::timestamptz end
        where x.intent_id in (select y.id from public.payment_intents y where y.booking_id = $1::uuid)
       returning 1),

     -- (٧) الإشعارات — تُزاح **وتُوسَم «مُرسَلة» في المعاملة نفسها**
     --
     -- ⚠ الوسم هنا لا في «لمسات أخيرة»: بين إنشاء الإشعار وآخر خطوة في السكربت
     --   خمس إلى خمس عشرة دقيقة، وخلالها تبقى مئات الصفوف «queued» بطوابع
     --   ماضية — أي **أقدم** صفوف الطابور (فهرس الموزّع status+created_at).
     --   فأي نداء لموزّع الإشعارات في تلك النافذة (خادم تطوير يعمل، أو مهمة
     --   مجدولة بعد النشر) يبثّ مئات الرسائل عن حجوزات لم تحدث. وإن انهار
     --   السكربت في منتصفه بقيت هكذا إلى الأبد.
     --   الوسم داخل معاملة الحجز يجعل النافذة صفراً: الصف لا يُرى خارجها
     --   إلا وهو 'sent'.
     n as (
       update public.notifications x
          set created_at   = x.created_at - (select shift from s),
              status       = case when x.status = 'queued' then 'sent' else x.status end,
              delivered_at = case
                               when x.delivered_at is not null
                                 then x.delivered_at - (select shift from s)
                               when x.status = 'queued'
                                 then (x.created_at - (select shift from s)) + interval '2 minutes'
                               else null
                             end
        where x.payload ->> 'bookingId' = $1::uuid::text
       returning 1)

     select 1`,
    params
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// (١٠) نقطة الدخول
// ═══════════════════════════════════════════════════════════════════════════

const t0 = Date.now();
try {
  if (CLEAN) {
    line("🧹 حذف بيانات العرض التجريبي…");
    await clean();
    line();
    line(`⏱  انتهى في ${Math.round((Date.now() - t0) / 1000)} ثانية.`);
  } else {
    line("⛔ هذا السكربت لبيانات عرض تجريبي — لا يُشغَّل على قاعدة فيها عملاء حقيقيون.");
    line(`🌱 زرع ستة أشهر تشغيل مُحاكاة (${DAY0} → ${DAY_N})… قد يستغرق دقائق.`);
    try {
      await seed();
    } finally {
      // الترتيب مقصود: إن انهار الزرع داخل معاملة مُجهَضة فكل جملة بعده تفشل
      // بـ «current transaction is aborted» فتُخفي الخطأ الحقيقي. نُنهي المعاملة
      // أولاً ثم نُعيد المُشغّلين — وإلا بقيا معطَّلين على قاعدة حيّة.
      await q("rollback").catch(() => {});
      await restoreTriggers(false).catch(() => {});
    }
    line();
    line(`⏱  انتهى في ${Math.round((Date.now() - t0) / 1000)} ثانية.`);
  }
} catch (e) {
  await q("rollback").catch(() => {});
  await restoreTriggers().catch(() => {});
  console.error(`\n❌ ${e.message}`);
  console.error(e.stack?.split("\n").slice(1, 4).join("\n") ?? "");
  process.exitCode = 1;
} finally {
  await c.end();
}
