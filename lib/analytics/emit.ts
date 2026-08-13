import "server-only";

import { after } from "next/server";

import type { FunnelEvent, FunnelPayload } from "@/lib/analytics-types";
import { providerEventNames } from "@/lib/analytics/events";
import { sendMetaCapiEvent } from "@/lib/analytics/meta-capi";
import {
  isValidIntegrationId,
  normalizeIntegrations,
  resolveIntegration,
} from "@/lib/analytics/services";
import { createServiceSupabase } from "@/lib/supabase/admin";

/**
 * مُصدِر أحداث القمع — نقطة الخروج الوحيدة لكل حدث تحويل في المنصة.
 *
 * ── ثلاثة عقود تحكم كل سطر هنا ──────────────────────────────────────────────
 *
 * (١) **لا تُفشل الطلب الأصلي أبداً.** نص صريح في `lib/analytics-types.ts`:
 *     «إدراج واحد رخيص، لا يفشل الطلب إن فشل». كل مسار هنا داخل try/catch،
 *     ولا دالة مصدَّرة ترمي استثناءً في أي حال — بما فيها غياب متغيّرات البيئة
 *     وغياب جدول `funnel_events` نفسه (قاعدة لم تُطبَّق عليها هجرة 0022 بعد:
 *     الرمز 42P01 أو PGRST205، ويُبتلع بهدوء).
 *
 * (٢) **القمع يُحسب من بياناتنا لا من جوجل** (القرار ٥ في موجز المرحلة). لذلك
 *     صف `funnel_events` يُكتب **أولاً ودائماً**، بصرف النظر عن أي خدمة قياس:
 *     كل الخدمات السبع مطفأة؟ الأرقام في اللوحة تبقى صحيحة. مانع إعلانات يسقط
 *     كل سكربتات جوجل وميتا؟ الأرقام في اللوحة تبقى صحيحة.
 *
 * (٣) **صفر PII وصفر أرقام داخلية.** الأعمدة المكتوبة أربعة فقط
 *     (`event, reference, class_slug, value, currency`) وتُبنى حقلاً حقلاً من
 *     `FunnelPayload`. لا اسم عميل، ولا هاتف، ولا واتساب، ولا `public_token`
 *     (وهو مفتاح وصول للحجز — تسريبه تسريب صلاحية)، ولا هوية متعهد ولا تكلفته
 *     ولا هامش الموقع.
 *
 * ── لماذا `after` وليس `await` على مسار الطلب ───────────────────────────────
 * `/api/quote` أسخن مسار عام في الموقع. الكتابة والنداءات الخارجية تُجدوَل بعد
 * إرسال الرد (`after` من `next/server`) فلا يدفع الزائر ثمن القياس ملّي‑ثانية
 * واحدة. و`after` يعمل حتى مع `redirect()` — وهو ما تحتاجه إجراءات اللوحة.
 *
 * ── القنوات ─────────────────────────────────────────────────────────────────
 *  • قاعدة البيانات: **كل** الأحداث.
 *  • Meta CAPI (خادمية): `booking_paid` وحده، وبشرط تفعيل الخدمة ووجود التوكن.
 *  • GA4/GTM/Pixel/Clarity: قنوات **متصفح** — يحقنها `lib/analytics/tags.tsx`،
 *    ولا يمكن إطلاق أحداثها من هنا لأنها تعيش في جلسة المتصفح لا في الخادم.
 *    جدول ترجمة الأسماء مشترك بين الطرفين في `lib/analytics/events.ts`.
 */

type FunnelEntry = { event: FunnelEvent; payload: FunnelPayload };

/** الصف كما يستقبله جدول `funnel_events` (هجرة 0022 — العقد في موجز المرحلة) */
type FunnelRow = {
  event: string;
  reference: string | null;
  class_slug: string | null;
  value: number | null;
  currency: string | null;
};

function log(message: string): void {
  console.warn(`[analytics:emit] ${message}`);
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function money(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * حرّاس مطابقون **حرفياً** لقيود CHECK في هجرة 0022:
 *   funnel_events_reference_chk · _class_slug_chk · _currency_chk · _value_chk
 *
 * لماذا نكرّرها هنا بدل الاتكال على القاعدة: مخالفة قيد واحد تُسقط **الإدراج
 * كله** — أي أن `class_slug` غريباً واحداً كان سيبتلع حدثَي البحث والعرض معاً.
 * إسقاط الحقل المخالف وحده يبقي الحدث (وهو ما يُحسب عليه القمع) سليماً.
 * تعديل قيد في الهجرة يستوجب تعديل النمط المقابل هنا.
 */
const REFERENCE_RE = /^[A-Za-z0-9._-]{1,40}$/;
const CLASS_SLUG_RE = /^[A-Za-z0-9_-]{1,64}$/;
const CURRENCY_RE = /^[A-Za-z]{3}$/;
const MAX_VALUE = 100000000;

function guarded(value: string | null, pattern: RegExp): string | null {
  return value !== null && pattern.test(value) ? value : null;
}

/**
 * 🔒 الصف يُبنى حقلاً حقلاً — لا نسخ للحمولة ولا انتشار (`...payload`).
 *
 * حقول `FunnelPayload` الباقية (`originLabel`, `destLabel`, `passengers`,
 * `distanceKm`) **لا أعمدة لها** في الجدول عمداً: الجدول خفيف بحكم تصميمه،
 * وعنوانا الالتقاط والتسليم لا يُخزَّنان في سجل قياس أصلاً.
 */
function toRow(entry: FunnelEntry): FunnelRow {
  const value = money(entry.payload.value);

  return {
    event: entry.event,
    reference: guarded(text(entry.payload.reference), REFERENCE_RE),
    class_slug: guarded(text(entry.payload.classSlug), CLASS_SLUG_RE),
    value: value !== null && value >= 0 && value < MAX_VALUE ? value : null,
    currency: guarded(text(entry.payload.currency), CURRENCY_RE),
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * (١) الكتابة في القاعدة
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * 🔒 أحداث الحجز الثلاثة **لا تُكتب بلا رقم مرجعي إطلاقاً**.
 *
 * السبب عقدٌ في قاعدة البيانات لا تفضيل أسلوب: العدّ في هجرة 0023 هو
 * `count(*) filter (where reference is null) + count(distinct reference)` —
 * أي أن الصفوف الحاملة لمرجع تنهار إلى واحد مهما تكرر إرسالها، والصفوف **بلا**
 * مرجع تُعدّ كما هي عمداً (بحثان حقيقيان لا يحمل أيٌّ منهما مرجعاً).
 *
 * فحدث حجزٍ بلا مرجع يقع في الفرع الخاطئ: بوابة الدفع تعيد إرسال الويبهوك عند
 * أي شك، فلو فشلت قراءة صف الحجز في المرتين (`bookingFunnelFacts` تُرجع `{}`
 * عند أي فشل) لصار حجزٌ مدفوع واحد **تحصيلين** في اللوحة — وقد يتجاوز قاعُ
 * القمع رأسه. إسقاط الحدث ينقص واحداً في حالة عابرة نادرة؛ كتابته تضخّم
 * الأرقام كلما أعادت البوابة الإرسال. والنقص المعلَن أهون من التضخيم الصامت.
 *
 * والاختبار (ج-ب-١١) في `supabase/tests/analytics_tests.sql` يثبّت أن القاعدة
 * **لا** تحمي من هذا — الحماية هنا وحدها.
 */
const REFERENCED_EVENTS = new Set<FunnelEvent>([
  "booking_created",
  "booking_started",
  "booking_paid",
]);

/** يُسقط أحداث الحجز التي فقدت رقمها المرجعي، ويمرّر ما عداها كما هو */
function keepable(entry: FunnelEntry, row: FunnelRow): boolean {
  if (!REFERENCED_EVENTS.has(entry.event) || row.reference !== null) return true;
  log(`أُسقط «${entry.event}» بلا رقم مرجعي — صفٌّ كهذا لا يُدمج مع تكراره فيضخّم القمع`);
  return false;
}

async function writeRows(rows: FunnelRow[]): Promise<void> {
  try {
    // عميل الخدمة لا عميل الجلسة: `funnel_events` ممنوع على `anon` تماماً،
    // و`authenticated` لا يملك عليه إلا `select` — الإدراج لـ `service_role`.
    const supabase = createServiceSupabase();
    if (!supabase) return; // بيئة بلا مفتاح خدمة: لا قياس، ولا خطأ

    const { error } = await supabase.from("funnel_events").insert(rows);

    // الجدول غير موجود بعد (هجرة 0022 لم تُطبَّق) ⇒ صمت تام لا سجل مزعج
    if (error && error.code !== "42P01" && error.code !== "PGRST205") {
      log(`تعذّرت كتابة أحداث القمع (${error.code ?? "?"}): ${error.message}`);
    }
  } catch (err) {
    log(`استثناء أثناء كتابة أحداث القمع: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/* ────────────────────────────────────────────────────────────────────────────
 * (٢) قراءة إعدادات الربط
 *
 * تُقرأ مباشرة من `site_settings` بعميل الخدمة لا عبر `getSettings()`، لسببين:
 * الأول أن هذا الكود يعمل **بعد** إرسال الرد وقد يكون خارج نطاق كوكيز الطلب،
 * والثاني أن مفتاح `integrations` ليس نصاً يُترجم فلا معنى لتمريره على طبقة
 * الدمج اللغوي. النتيجة نفسها بالضبط: `normalizeIntegrations` تُكمل أي نقص.
 * ──────────────────────────────────────────────────────────────────────────── */

async function readIntegrations(): Promise<ReturnType<typeof normalizeIntegrations> | null> {
  try {
    const supabase = createServiceSupabase();
    if (!supabase) return null;

    const { data, error } = await supabase
      .from("site_settings")
      .select("value")
      .eq("key", "integrations")
      .maybeSingle();

    if (error || !data) return null;
    return normalizeIntegrations((data as { value?: unknown }).value);
  } catch {
    return null;
  }
}

/* ────────────────────────────────────────────────────────────────────────────
 * (٣) القنوات الخادمية — Meta CAPI عند الشراء وحده
 * ──────────────────────────────────────────────────────────────────────────── */

async function sendServerChannels(entry: FunnelEntry): Promise<void> {
  // القرار: CAPI للشراء فقط. إرسال كل خطوة قمع من الخادم يضاعف الحمولة على
  // ميتا بلا فائدة إعلانية، والشراء هو الحدث الذي يُسقطه مانع الإعلانات فيؤذي.
  if (entry.event !== "booking_paid") return;

  try {
    const integrations = await readIntegrations();
    if (!integrations) return;

    const capi = resolveIntegration("metaCapi", integrations.metaCapi);
    if (capi.status === "off" || capi.status === "bad-id") return;

    // معرّف فارغ مع تفعيل الخدمة ⇒ نستعمل معرّف البكسل: CAPI والبكسل يكتبان
    // في **نفس** مجموعة البيانات، وأكثر إعداد شائع هو تركه فارغاً.
    //
    // ⚠ الارتداد يقرأ معرّف البكسل من **الإعداد الخام** لا عبر
    // `resolveIntegration`: تلك تُرجع `null` ما لم يكن البكسل **مفعّلاً**، بينما
    // الحالة المقصودة هنا هي عكسها تماماً — مالك يريد قياساً خادمياً وحده
    // (لا سكربت في متصفح الزائر) فيُطفئ البكسل ويترك حقل CAPI فارغاً كما تقول
    // له الشاشة حرفياً: «اتركه فارغاً ليُستعمل معرّف البكسل نفسه تلقائياً».
    // بالمسار القديم كان كل حدث شراء يُتخطّى بصمت تام. وفحص الصيغة يبقى قائماً
    // (`isValidIntegrationId`) فلا يذهب نص عشوائي إلى ميتا.
    const pixelRaw = (integrations.metaPixel.id ?? "").trim();
    const pixelFallback =
      pixelRaw !== "" && isValidIntegrationId("metaPixel", pixelRaw) ? pixelRaw : null;

    const datasetId = capi.id ?? (capi.status === "no-id" ? pixelFallback : null);
    if (!datasetId) return;

    await sendMetaCapiEvent({
      datasetId,
      eventName: providerEventNames(entry.event).meta,
      payload: entry.payload,
    });
  } catch (err) {
    log(`استثناء في قناة خادمية: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/* ────────────────────────────────────────────────────────────────────────────
 * (٤) الواجهة العامة
 * ──────────────────────────────────────────────────────────────────────────── */

/** ينفّذ الإصدار فوراً وينتظره. **لا يرمي أبداً.** */
export async function emitFunnelEvents(entries: FunnelEntry[]): Promise<void> {
  if (entries.length === 0) return;

  // الحارس قبل الكتابة **وقبل القناة الخادمية معاً**: حدث حجزٍ بلا مرجع لا
  // يُكتب في القاعدة ولا يُرسل إلى ميتا — وإلا تضاعف الشراء هناك بالمنطق نفسه.
  const kept = entries
    .map((entry) => ({ entry, row: toRow(entry) }))
    .filter(({ entry, row }) => keepable(entry, row));

  if (kept.length === 0) return;

  // إدراج واحد لكل الأحداث معاً — رحلة شبكة واحدة مهما بلغ عددها
  await writeRows(kept.map((one) => one.row));

  for (const one of kept) {
    await sendServerChannels(one.entry);
  }
}

export async function emitFunnelEvent(event: FunnelEvent, payload: FunnelPayload = {}): Promise<void> {
  await emitFunnelEvents([{ event, payload }]);
}

/**
 * يجدول المهمة بعد إرسال الرد. الارتداد إلى التنفيذ المباشر يغطي أي سياق لا
 * يدعم `after` (سكربت خارج دورة الطلب مثلاً)، والمهمة نفسها لا ترمي أبداً
 * فلا ينشأ عن ذلك رفض غير ملتقَط.
 */
function schedule(task: () => Promise<void>): void {
  try {
    after(task);
  } catch {
    void task();
  }
}

/** يسجّل حدثاً واحداً بعد إرسال الرد — الشكل المستعمَل في مسارات API */
export function trackFunnel(event: FunnelEvent, payload: FunnelPayload = {}): void {
  schedule(() => emitFunnelEvents([{ event, payload }]));
}

/** يسجّل عدة أحداث بإدراج واحد بعد إرسال الرد */
export function trackFunnelBatch(entries: FunnelEntry[]): void {
  if (entries.length === 0) return;
  schedule(() => emitFunnelEvents(entries));
}

/* ────────────────────────────────────────────────────────────────────────────
 * (٥) حدث الشراء — يحتاج حقائق الحجز، ونقرؤها بعد الرد لا قبله
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * 🔒 قائمة الأعمدة صريحة وقصيرة عمداً — لا `select("*")` هنا أبداً.
 *
 * صف `bookings` يحمل اسم العميل وهاتفه وواتسابه و`public_token` و
 * `subcontractor_cost` و`margin_amount`. تسمية الأربعة المطلوبة صراحةً تجعل
 * التسريب مستحيلاً بالبناء لا بالانضباط، تماماً كما في `redactPricing`.
 */
async function bookingFunnelFacts(bookingId: string): Promise<FunnelPayload> {
  try {
    const supabase = createServiceSupabase();
    if (!supabase) return {};

    const { data, error } = await supabase
      .from("bookings")
      .select("reference, total, currency, class_slug")
      .eq("id", bookingId)
      .maybeSingle();

    if (error || !data) return {};

    const row = data as Record<string, unknown>;
    const total = row.total;

    return {
      ...(text(row.reference) ? { reference: text(row.reference) as string } : {}),
      ...(text(row.currency) ? { currency: text(row.currency) as string } : {}),
      ...(text(row.class_slug) ? { classSlug: text(row.class_slug) as string } : {}),
      // `numeric` يصل من PostgREST نصاً — التحويل نقل لا حساب
      ...(total !== null && total !== undefined && Number.isFinite(Number(total))
        ? { value: Number(total) }
        : {}),
    };
  } catch {
    return {};
  }
}

/**
 * حدث الشراء من نقطتَي التأكيد معاً: ويبهوك بوابة الدفع، واعتماد التحويل
 * اليدوي من اللوحة. النقطتان لا ثالثة لهما، وتجاهُل الثانية يعني أن كل حجز
 * يُدفع بتحويل بنكي (وهو المسار الافتراضي هنا) لا ينتج حدث شراء واحداً.
 *
 * يُستدعى **بعد** ثبوت التحصيل: `outcome.confirmed` في الويبهوك، و`approve`
 * بعد نجاح `verify_payment` في اللوحة. ولا ينتظر شيئاً على مسار الرد.
 *
 * ⚠ `bookingFunnelFacts` تُرجع `{}` عند أي فشل (بلا مفتاح خدمة، أو خطأ قراءة،
 * أو صفٌّ غير موجود) — أي حمولةً **بلا رقم مرجعي**. وحارس `REFERENCED_EVENTS`
 * في `emitFunnelEvents` يُسقط الحدث حينها بدل كتابته صفاً لا يُدمج: ويبهوك
 * مكرَّر مع قراءةٍ فاشلة كان سيصير تحصيلين لحجز واحد.
 */
export function trackBookingPaid(bookingId: string): void {
  const id = text(bookingId);
  if (!id) return;

  schedule(async () => {
    const payload = await bookingFunnelFacts(id);
    await emitFunnelEvents([{ event: "booking_paid", payload }]);
  });
}
