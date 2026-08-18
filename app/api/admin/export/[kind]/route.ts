import type { SupabaseClient } from "@supabase/supabase-js";

import { addDays, cairoMidnightUtc } from "@/app/admin/finance/_components/range";
import { recordRejectedAttempt } from "@/lib/audit/attempt";
import { isMissingFunction, isMissingTable } from "@/lib/dispatch/settings";
import {
  EXPORT_FORBIDDEN_COLUMNS,
  EXPORT_ROW_CAP,
  type ExportKind,
} from "@/lib/export-types";
import { csvBool, csvDate, csvMoney, csvNumber, csvText } from "@/lib/export/csv";
import { csvFileResponse } from "@/lib/export/response";
import { createServerSupabase } from "@/lib/supabase/server";
import { getSiteTimeZone } from "@/lib/site-timezone.server";

/**
 * ‏GET /api/admin/export/[kind] — منفذ التصدير الوحيد للأنواع الأربعة.
 *
 * ── لماذا مسار واحد لا أربعة ─────────────────────────────────────────────────
 * لأن ما يجب ألّا يختلف بين الأنواع هو **الحارس وشكل الملف**: جلسة مشرف، وسقف
 * صفوف معلَن، وBOM وCRLF وتحييد صيغ، واسم ملف عربي. أربعة مسارات تعني أربع نسخ
 * من الحارس، وأول واحدة تُنسى فيها خطوة تصير باباً. وما يختلف فعلاً — الاستعلام
 * والأعمدة — يعيش في دالة بانية واحدة لكل نوع أسفل الملف.
 *
 * ── 🔒 الحارس: جلسة **و**دور، لا أحدهما ──────────────────────────────────────
 * `getUser()` ثم `is_admin()` في القاعدة — نفس حارس `/api/i18n/translate`
 * و`app/admin/layout.tsx`. ووجود الجلسة وحده لا يكفي إطلاقاً: **كل متعهد في
 * المنصة مستخدم `authenticated`** (D-20)، فمسارٌ يكتفي بالجلسة يسلّم المتعهد
 * كشوف حساب زملائه وهامشنا على كل رحلة.
 *
 * وخلاف واحد مقصود عن `/api/i18n/translate`: هناك **احتياط** يقرأ `profiles.role`
 * حين يفشل نداء `is_admin` (لدعم قاعدة قديمة). وهنا **نفشل مغلقين** بلا احتياط —
 * الترجمة الآلية تكتب مسودات يراجعها إنسان، وهذا المسار **يُخرج ملفاً**، وحارسٌ
 * له مسارٌ ثانٍ عند الخطأ هو حارسٌ بمدخلين. ورمز خطأ مستقل (`role-unverified`)
 * يميّز «تعذّر التحقق» عن «تحققنا فرفضنا» فلا يضيع السبب على المالك.
 *
 * ── 🔒 الأعمدة الممنوعة: قيدٌ يُنفَّذ لا تعليقٌ يُقرأ ───────────────────────────
 * `EXPORT_FORBIDDEN_COLUMNS` تُفحص هنا **بالتنفيذ** عبر `forbiddenColumn()` قبل
 * كتابة أي ملف. والفحص ليس زينة فوق مُخطِّطٍ يختار أعمدته يدوياً: النوع الذي
 * يُضاف بعد سنة سيُنسخ من هذا، ومصدرٌ جديد قد يُرجع `public_token` بلا أن ينتبه
 * كاتبه — وهو **أخطرها** بنصّ العقد، لأن ملفاً فيه ألف توكن يسلّم ألف حجز لمن
 * يفتحه.
 *
 * ── الفترة تُكتب صريحة ولا تُختصر بمفتاح ─────────────────────────────────────
 * الشاشات تختصر النطاق بمفتاح (`?range=month`)، وهذا المسار **لا يقبله**: الملف
 * يُحفَظ ويُرسَل ويُفتح بعد شهر، و«هذا الشهر» يكون حينها شهراً آخر. فالمنادي
 * يمرّر `from` و`to` صريحتين (وهما ما يحسبه `resolveRange` أصلاً) فتُطبَع الفترة
 * في ذيل الملف كما صُدِّر بالضبط.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

/** شكل الخطأ في هذا المستودع — `app/api/booking/receipt/route.ts` هو المرجع */
type ExportError = { ok: false; code: string; message: string };

function errorJson(code: string, message: string, status: number): Response {
  const body: ExportError = { ok: false, code, message };
  return Response.json(body, { status, headers: NO_STORE });
}

// ---------------------------------------------------------------------------
// (١) قراءة الوسائط
// ---------------------------------------------------------------------------

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * تاريخ من الرابط — والتحقق **رحلة ذهاب وعودة على UTC** لا فحص مدى.
 *
 * فحص «الشهر ١–١٢ واليوم ١–٣١» يمرّر `2026-02-31`، ويفسّرها Postgres بطريقته
 * فتخرج فترة لا يقصدها أحد ويُبنى عليها ملف. نفس أسلوب `parseIsoDate` في
 * `app/admin/finance/_components/range.ts` — **وهي معادة الكتابة هنا لا
 * مستوردة**: تحقّقٌ من التقويم في ثمانية أسطر، وسلسلة استيراد تلك الوحدة تصل
 * إلى مكوّنات React في `_components` ولا شأن لمسار API بها.
 *
 * ⚠ ولها استثناء واحد معلوم: `cairoMidnightUtc` و`addDays` **تُستوردان** منها
 * فعلاً في القسم (٥). والفرق ليس مزاجاً — إزاحة التوقيت الصيفي منطقٌ لا يجوز أن
 * توجد منه نسختان تنزلق إحداهما ساعةً في نصف السنة، بينما تحقّق التقويم أعلاه
 * لا حالة له تختلف. والقاعدة مكتوبة كاملةً في ترويسة القسم (٥).
 */
type DateParam =
  | { ok: true; value: string | null }
  | { ok: false };

function readDate(url: URL, name: string): DateParam {
  const raw = url.searchParams.get(name);
  if (raw === null || raw.trim() === "") return { ok: true, value: null };

  const m = ISO_DATE.exec(raw.trim());
  if (!m) return { ok: false };

  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return { ok: false };
  }
  return { ok: true, value: raw.trim() };
}

const isExportKind = (value: string): value is ExportKind =>
  Object.prototype.hasOwnProperty.call(EXPORT_ROW_CAP, value);

// ---------------------------------------------------------------------------
// (٢) الحارس
// ---------------------------------------------------------------------------

type Denial = { status: number; code: string; message: string };

/**
 * ── 📓 لماذا يُسجَّل الرفض هنا وهذا **مسار قراءة** (الملاحظة ١٥) ─────────────
 *
 * `audit_log` يكتبه مُشغّل على الكتابة، والتصدير قراءة — فلا يترك أثراً أصلاً.
 * والنتيجة أن متعهداً يطرق هذا الباب مرة بعد مرة لا يظهر في `/admin/logs` بحرف
 * واحد، بينما هو **بالضبط** السؤال الذي وُجد `audit_attempts` ليجيبه: «من طرق
 * باباً ليس له؟» وسطحُ هذا الباب أوسع من غيره — ملفٌ فيه حتى ٥٠٠٠ صف تحمل
 * `subcontractor_cost` و`margin_amount` واسم العميل.
 *
 * 🔒 **والنداء هنا سليم بشرط `lib/audit/attempt.ts`**: لا معاملة فاشلة نحن
 * داخلها — الرفض قرارُ هذا الحارس لا استثناءٌ من القاعدة — فرحلة التسجيل
 * مستقلّة تثبت وحدها، ولا يقع D-48. والدالة **لا ترمي أبداً**، فالسطر أدناه لا
 * يحجب رسالة الرفض عن صاحبها ولا يحوّلها إلى انهيار.
 *
 * ⚠ **و«غير مسجّل الدخول» (٤٠١) لا يُسجَّل عمداً.** `record_audit_attempt` بعد
 * هجرة 0037 تشترط **هوية فعلية** وتخرج بصمت بلا فاعل، فالسطر لن يُكتب أصلاً؛
 * ولو كُتب لصار الباب قناةَ كتابةٍ مجهولة بلا حدّ في جدولٍ يقرؤه المشرف. أمّا
 * الـ٤٠٣ فصاحبه **جلسة معروفة** تُنسب إليها المحاولة، ومعدَّلُه محروس بسقف
 * ٦٠ محاولة للفاعل في الساعة داخل الدالة نفسها.
 */
async function adminDenial(supabase: SupabaseClient, kind: ExportKind): Promise<Denial | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      status: 401,
      code: "unauthenticated",
      message: "التصدير للمديرين — سجّل الدخول من /admin ثم أعد المحاولة.",
    };
  }

  const { data, error } = await supabase.rpc("is_admin");

  // فشل التحقق ≠ فشل الاختبار، لكن كليهما يمنع الملف. والرمزان مختلفان كي
  // يعرف المالك إن كان السبب صلاحيته أم قاعدةً لم تُهاجر.
  if (error) {
    // ويُسجَّل هذا الفرع أيضاً وإن كان صاحبه مديراً غالباً: تكرارُه في السجل هو
    // إشارة «القاعدة لم تُهاجر» تصل المالك من حيث يقرأ، لا من سجل خادم لا يفتحه.
    //
    // والسبب يُكتب `role-unverified` بمفردات المشروع لا برمز SQLSTATE — فيطابق
    // الرمز الذي يستقبله المنادي — ورسالةُ القاعدة الخام تنزل في التفصيل، لأنها
    // هي التي تقول **أي** خللٍ منع التحقق.
    await recordRejectedAttempt(supabase, "admin_export", { hint: "role-unverified" }, {
      entity: "export",
      detail:
        `تعذّر التحقق من الدور قبل تصدير «${PENDING_LABELS[kind]}»` +
        ` — ${error.message ?? "بلا رسالة"} (${error.code ?? "بلا رمز"})`,
    });
    return {
      status: 403,
      code: "role-unverified",
      message:
        "تعذّر التحقق من صلاحيتك كمدير، ولا يخرج ملف تصدير بلا تحقق. تأكد أن دالة is_admin منفَّذة في القاعدة.",
    };
  }

  if (data !== true) {
    await recordRejectedAttempt(supabase, "admin_export", { hint: "forbidden" }, {
      entity: "export",
      detail: `محاولة تصدير «${PENDING_LABELS[kind]}» بحساب ليس مديراً.`,
    });
    return {
      status: 403,
      code: "forbidden",
      message: "حسابك ليس مديراً — ملفات التصدير تحمل بيانات مالية وتفاصيل عملاء.",
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// (٣) أدوات مشتركة بين الأنواع الأربعة
// ---------------------------------------------------------------------------

const rowsOf = (data: unknown): Record<string, unknown>[] =>
  Array.isArray(data) ? (data as Record<string, unknown>[]) : [];

/** أول اسم موجود من قائمة أسماء — تسامح مع اختلاف تسمية العمود بين النسخ */
function pick(row: Record<string, unknown>, names: readonly string[]): unknown {
  for (const name of names) {
    const value = row[name];
    if (value !== undefined && value !== null) return value;
  }
  return null;
}

/**
 * يُرجع اسم أول عمود ممنوع في القائمة، أو `null` إن كانت نظيفة.
 *
 * **يُنادى من كل نوع قبل الكتابة.** جعلُ العقد قابلاً للفشل هو ما يميّزه عن
 * تعليق — والدرس مكتوب في `handover/INDEX.md`: حارسٌ كُتب بصيغة لا يمكن أن تفشل
 * ليس حارساً.
 */
function forbiddenColumn(columns: readonly string[]): string | null {
  const banned = EXPORT_FORBIDDEN_COLUMNS as readonly string[];
  return columns.find((column) => banned.includes(column)) ?? null;
}

/**
 * عملة العرض — نفس مصدر شاشات المالية (`pricing_settings.currency`).
 *
 * ⚠ وتمرّ بـ`csvText` لأنها **قيمة قاعدة تدخل عنوان عمود وذيل الملف**، وكلاهما
 * سطرٌ في CSV: رمزٌ فيه سطر جديد يشطر صفّ العناوين نفسه. والقيمة نصٌّ يحرّره
 * المالك من الإعدادات، لا ثابتٌ في الكود (D-04).
 */
async function readCurrency(supabase: SupabaseClient): Promise<string> {
  const res = await supabase.from("pricing_settings").select("currency").limit(1).maybeSingle();
  const value = res.error ? null : csvText(res.data?.currency);
  return typeof value === "string" && value.trim() !== "" ? value.trim() : "EGP";
}

/** وصف الفترة كما تُكتب في ذيل الملف وفي اسمه */
function periodText(from: string | null, to: string | null): string {
  if (from && to) return `${from} … ${to}`;
  if (from) return `من ${from}`;
  if (to) return `حتى ${to}`;
  return "كامل السجل";
}

// ---------------------------------------------------------------------------
// (٤) النوع المنفَّذ: كشف حساب متعهد
// ---------------------------------------------------------------------------

/**
 * أعمدة `partner_statement(uuid, date, date)` كما في تعريفها الحيّ (هجرة 0029
 * ق٥). سبعة لا غير، **ولا واحد منها في `EXPORT_FORBIDDEN_COLUMNS`** — ومع ذلك
 * تُفحص بالتنفيذ أدناه لا بهذه الملاحظة.
 */
const STATEMENT_COLUMNS = [
  "occurred_at",
  "kind",
  "reference",
  "debit",
  "credit",
  "balance",
  "note",
] as const;

/**
 * تسميات أنواع السطور — **خمس، والخامسة هي الفخّ**.
 *
 * مرآةٌ لـ`KIND_LABELS` في `app/admin/finance/partners/[id]/page.tsx`، وقد وقع
 * فيها العيب فعلاً: غياب `settlement` أسقط السطر على الاحتياط فطُبع الرمز
 * اللاتيني عارياً وسط ورقة عربية — وعلى السطر الذي يوثّق **سداد الشريك نفسه**.
 *
 * ⚠ أي نوع جديد يُضاف إلى `partner_statement` يُضاف في **الموضعين معاً**. وهذه
 * ازدواجية معلومة ومقصودة اليوم: الشاشة صفحة Next لا تُصدَّر منها ثوابت، ونقل
 * الخريطة إلى وحدة مشتركة تعديلٌ خارج نطاق هذه المهمة — ومُدرَجٌ في تقريرها.
 */
const STATEMENT_KIND_LABELS: Record<string, string> = {
  trip: "رحلة منفَّذة",
  collection: "تحصيل نقدي قبضه",
  payout: "دفعة سُدّدت له",
  settlement: "سدّده لنا",
  adjustment: "تسوية",
};

/**
 * اسم شركة المتعهد — لاسم الملف وذيله فقط، ولا يدخل عموداً.
 *
 * ⚠ و«لا يدخل عموداً» **لا يعفيه من `csvText`**: الذيل سطرٌ في الملف كأي صف،
 * واسمُ شركةٍ فيه سطر جديد يشطر سطر المصدر إلى سطرين — ثانيهما بلا `#` فيُعدّ
 * صفَّ بيانات في سكربت مطابقة. والاسم يكتبه المشرف بيده في شاشة المتعهدين.
 */
async function partnerName(supabase: SupabaseClient, id: string): Promise<string | null> {
  const res = await supabase
    .from("subcontractors")
    .select("company_name")
    .eq("id", id)
    .maybeSingle();
  const value = res.error ? null : csvText(res.data?.company_name);
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

async function buildPartnerStatement(input: BuilderInput): Promise<Response> {
  const { supabase, url, cap, currency } = input;

  const subcontractorId = (url.searchParams.get("subcontractor") ?? "").trim();
  if (!UUID_PATTERN.test(subcontractorId)) {
    return errorJson(
      "invalid-input",
      "معرّف المتعهد مطلوب في الوسيط subcontractor، ويجب أن يكون UUID صالحاً.",
      400
    );
  }

  /**
   * ⚠ **الفترة تُقرأ بـ`readPeriod` كما تقرؤها الأنواع الثلاثة الأخرى** — وكانت
   * تُقرأ هنا بـ`readDate` مباشرة، أي **بلا تبديل التاريخين المقلوبين**.
   *
   * والفرق ليس شكلياً: `partner_statement` تُرشِّح بـ`>= p_from and <= p_to`،
   * فـ`from=2026-12-31&to=2026-01-01` تُرجع **صفر صف** — ثم يكتب ذيلُ الملف
   * «٠ صفاً — كامل ما في الفترة» فوق مستندٍ يُحتجّ به في **نزاع تسوية**. وهو
   * حرفياً ما تصفه ترويسة `readPeriod` («احترامٌ حرفيّ يُخرج ملفاً فارغاً يُقرأ
   * ‹لا حركة في هذه الفترة›») وما بُني التبديل ليمنعه.
   *
   * ولا يُؤخذ من `Period` هنا سوى `from` و`to`: الدالة تأخذ `date` صرفاً لا
   * `timestamptz`، فحدّا اللحظة (`start`/`end`) لا موضع لهما — والسبب مشروح في
   * ترويسة القسم (٥).
   */
  const period = readPeriod(url);
  if (period === null) return errorJson("invalid-input", PERIOD_HELP, 400);

  const banned = forbiddenColumn(STATEMENT_COLUMNS);
  if (banned !== null) {
    return errorJson(
      "forbidden-column",
      `العمود «${banned}» ممنوع في التصدير ولا يخرج ملف يحمله.`,
      500
    );
  }

  /**
   * ⚠ **الرصيد لا يُجمع هنا** (D-05). عمود `balance` يصل تراكمياً من الدالة —
   * وهي تحسبه بنافذة على ترتيبها الداخلي وتضيف إليه رصيد ما قبل الفترة. وجمعه
   * في TypeScript كان سيعطي عموداً يخالف الشاشة أول ما تجاوز الفترة سقفها أو
   * تساوى سطران في اللحظة نفسها.
   *
   * ⚠ **والقصّ في القاعدة لا في الذاكرة، والعدّ معه** — وكان هنا نداءٌ بلا سقف
   * ثم `slice()` في جافاسكربت.
   *
   * وثمنه يظهر مع نمو البيانات لا اليوم: تصديرٌ بلا `from`/`to` يجعل الدالة
   * تحسب رصيداً متحركاً على **تاريخ المتعهد كله**، ثم تشحن PostgREST كل صف منه
   * عبر الشبكة كي نرمي ما بعد الخمسة آلاف. ودور `authenticated` عليه
   * `statement_timeout = 8s`، فالنتيجة ٥٠٠ لا ملفٌ منقوص — أي أن باب النزاع
   * يُغلق في وجه المالك في اليوم الذي يحتاجه فيه.
   *
   * 🔒 **ولا يُضاف `order()` هنا بحال.** الأنواع الثلاثة الأخرى ترتّب تنازلياً
   * فيكون المقصوص أقدمها، وهذا الكشف عكسها تماماً: الدالة ترتّب تصاعدياً
   * (`order by l_at asc, l_id asc`) وتبني عمود `balance` بنافذة على ذلك الترتيب
   * بعينه، مضافاً إليه رصيد ما قبل الفترة. فترتيبٌ يُفرض من هنا يخلط الرصيد
   * المتحرك بأرقام لا تسلسل بينها — وهو رقمٌ كاذب لا يبدو كاذباً. والسقف يقصّ
   * **الأحدث** عمداً، تماماً كما كانت تفعل `slice(0, cap)`، لأن كشفاً يبدأ من
   * غير أوله لا معنى لرصيده.
   *
   * و`count: "exact"` تجعل `available` عدداً تحسبه `COUNT(*)` في Postgres لا
   * طولَ مصفوفة قُصَّت هنا — فيصير سطر السقف يقيناً كما في الأنواع الثلاثة.
   */
  const { data, error, count } = await supabase
    .rpc(
      "partner_statement",
      {
        p_subcontractor_id: subcontractorId,
        p_from: period.from,
        p_to: period.to,
      },
      { count: "exact" }
    )
    .limit(cap);

  if (error) {
    if (isMissingFunction(error.code)) {
      return errorJson(
        "db-unavailable",
        "دالة partner_statement غير موجودة في قاعدة البيانات — نفّذ هجرات المالية (0015 ثم 0029).",
        503
      );
    }
    // الدالة نفسها ترفض غير الإدارة بـ`using hint = 'forbidden'`
    if ((error.hint ?? "").trim() === "forbidden") {
      return errorJson("forbidden", "كشف حساب المتعهدين متاح للإدارة فقط.", 403);
    }
    return errorJson("read-failed", "تعذّرت قراءة كشف الحساب — راجع سجل الخادم.", 500);
  }

  const rows = rowsOf(data).map((row) => {
    const kind = csvText(pick(row, ["kind", "type"]));
    return [
      csvDate(pick(row, ["occurred_at", "occurredAt"])),
      STATEMENT_KIND_LABELS[kind] ?? kind,
      csvText(pick(row, ["reference", "ref"])),
      // ترتيب «دائن ثم مدين» مطابق للشاشة حرفياً — ملفٌ يقلب العمودين عن الورقة
      // المطبوعة يُقرأ عكس معناه بيد من يقارنهما
      csvMoney(pick(row, ["credit"])),
      csvMoney(pick(row, ["debit"])),
      csvMoney(pick(row, ["balance", "running_balance"])),
      csvText(pick(row, ["note", "memo"])),
    ];
  });

  const name = await partnerName(supabase, subcontractorId);
  const periodLabel = periodText(period.from, period.to);

  /**
   * العملة في **عناوين الأعمدة المالية** لا في كل خانة: وصلها بالرقم يحوّل
   * العمود كله إلى نصّ في إكسل (القسم ٣ من العقد)، وحذفها كلياً يترك ملفاً
   * لا يُعرف بأي عملة أرقامه. ونصّ العنوان نفسه مطابق للشاشة، والعملة زيادة
   * عليه لا تبديل له.
   */
  const money = (label: string) => `${label} (${currency})`;

  return csvFileResponse({
    headers: [
      "التاريخ",
      "البيان",
      "المرجع",
      money("له علينا — دائن"),
      money("عليه لنا — مدين"),
      money("الرصيد بعد السطر"),
      "ملاحظة",
    ],
    rows,
    asciiName: `partner-statement-${period.from ?? "all"}_${period.to ?? "all"}`,
    displayName: `كشف حساب متعهد — ${name ?? "غير مسمّى"} — ${periodLabel}`,
    rowCap: { cap, written: rows.length, available: count ?? null },
    sourceNote:
      `المصدر: partner_statement() · المتعهد: ${name ?? "غير مسمّى"} · الفترة: ${periodLabel}` +
      ` · العملة: ${currency} · الرصيد محسوب في قاعدة البيانات لا في الملف.`,
  });
}

// ---------------------------------------------------------------------------
// (٥) الأنواع الثلاثة الباقية — الدفتر · المصروفات · الحجوزات
// ---------------------------------------------------------------------------

/**
 * ⚠ **قاعدة الازدواج في هذا القسم: يُنسَخ النصّ، ولا يُنسَخ منطقٌ أبداً.**
 *
 * خرائط التسميات أدناه (مصادر القيود، الاتجاهات، أدوار المقاصة، حالات الحجز،
 * خطط الدفع) منسوخة من `finance-ui.tsx` و`booking-ui.tsx` على سُنّة
 * `STATEMENT_KIND_LABELS` أعلاه، ولنفس السبب المكتوب في ترويسة الملف: سلسلة
 * استيراد تينك الوحدتين تصل إلى مكوّنات React ولا شأن لمسار API بها. ونصٌّ
 * منسوخ يشيخ فيظهر رمزاً لاتينياً عارياً في خانة عربية — عيبٌ يُرى بالعين في
 * أول فتحة للملف ويُصلَح في دقيقة.
 *
 * أمّا **تحويل تاريخ القاهرة إلى لحظة UTC فمنطقٌ لا يُنسَخ**، ولذلك — وحده —
 * يُستورد `cairoMidnightUtc` من `app/admin/finance/_components/range.ts`
 * استثناءً معلوماً من القاعدة أعلاه. مصر تعمل بالتوقيت الصيفي، وإزاحة أغسطس
 * (+٣) ليست إزاحة يناير (+٢)، وتلك الدالة هي الموضع الوحيد في المستودع الذي
 * يقيس الإزاحة **عند التاريخ المطلوب** لا عند «الآن». ونسخةٌ ثانية منها تعني
 * حدوداً تنزلق ساعةً في نصف السنة: حركات ليل أول الشهر تُنسب إلى الشهر السابق
 * في الملف وحده — ملفٌّ يخالف الشاشة بلا أن يبدو أيٌّ منهما مخطئاً، وهو أسوأ
 * أشكال الخطأ في هذا المشروع كله.
 *
 * ولأن الأنواع الثلاثة تُرشِّح أعمدة `timestamptz` (بعكس `partner_statement`
 * التي تأخذ `date` صرفاً فلا تحتاج تحويلاً أصلاً)، فالتحويل شرطُ صحّةٍ فيها لا
 * تحسين.
 */

// ---------------------------------------------------------------------------
// (٥-١) أدوات الأنواع الثلاثة — عدا `readPeriod`، فهي للأربعة
// ---------------------------------------------------------------------------

const PERIOD_HELP =
  "الفترة تُكتب بصيغة YYYY-MM-DD بتاريخين موجودين في التقويم — مثال: from=2026-08-01&to=2026-08-14.";

type Period = {
  /** طرفا الفترة كما استقرّا بعد التصحيح — يُطبعان في اسم الملف وذيله */
  from: string | null;
  to: string | null;
  /** الحدّان كلحظتين UTC: ‏[منتصف ليل القاهرة للأول، منتصف ليل تالي الأخير) */
  start: string | null;
  end: string | null;
};

/**
 * الفترة من الرابط، محوَّلةً إلى حدّي لحظة — أو `null` إن كُتب تاريخ لا وجود له.
 *
 * الطرف مفتوحٌ إن غاب: تصديرٌ بلا `from` يعني «من أول السجل»، وهو ما يقوله ذيل
 * الملف حرفياً عبر `periodText`. ولا يُخترع حدٌّ افتراضي هنا — «هذا الشهر»
 * افتراضاً كان سيُخرج ملفاً يظنه المالك كامل السجل.
 *
 * والتاريخان المقلوبان يُبدَّلان كما تفعل `resolveRange` في الشاشات: خطأ ترتيب
 * لا خطأ نية. والبديلان أسوأ منه — رفضٌ بـ٤٠٠ لا يفهم سببه من كتب التاريخين،
 * أو احترامٌ حرفيّ يُخرج ملفاً فارغاً يُقرأ «لا حركة في هذه الفترة».
 *
 * 🔒 **وهذه الدالة تخدم الأنواع الأربعة، لا الثلاثة التي تحتها.** كشفُ حساب
 * المتعهد كان يقرأ `readDate` مباشرةً فلا يُبدَّل عنده مقلوب — فيخرج كشفٌ فارغ
 * موقَّعٌ بـ«كامل ما في الفترة» في **نزاع تسوية**. ولذلك ينادي القسم (٤) هذه
 * الدالة أيضاً، آخذاً `from`/`to` وحدهما: مصدره يأخذ `date` صرفاً فلا موضع
 * لـ`start`/`end` عنده (التفصيل في ترويسة القسم ٥). **ولا يُعاد قارئ فترةٍ
 * ثانٍ في هذا الملف** — نسختان تعني قاعدة تبديلٍ تُصلَح في إحداهما وحدها.
 */
function readPeriod(url: URL): Period | null {
  const rawFrom = readDate(url, "from");
  const rawTo = readDate(url, "to");
  if (!rawFrom.ok || !rawTo.ok) return null;

  let from = rawFrom.value;
  let to = rawTo.value;
  if (from !== null && to !== null && from > to) [from, to] = [to, from];

  return {
    from,
    to,
    start: from === null ? null : cairoMidnightUtc(from),
    // الحدّ الأعلى مفتوح على منتصف ليل اليوم **التالي**، فيدخل اليوم الأخير
    // بكامل ساعاته — نفس ما تفعله `rangeInstants` لشاشات المالية بالضبط.
    end: to === null ? null : cairoMidnightUtc(addDays(to, 1)),
  };
}

/** خطأ القراءة: «الجدول غير موجود» رسالته هجرة، وما عداه سجلّ خادم */
function readFailure(code: string | undefined, table: string): Response {
  if (isMissingTable(code)) {
    return errorJson(
      "db-unavailable",
      `جدول ${table} غير موجود في قاعدة البيانات — نفّذ هجرات المالية (0015) ثم أعد المحاولة.`,
      503
    );
  }
  return errorJson("read-failed", `تعذّرت قراءة ${table} — راجع سجل الخادم.`, 500);
}

/** العملة في **عنوان** العمود لا في خانته — القسم (٣) من العقد */
const withCurrency = (label: string, currency: string) => `${label} (${currency})`;

/**
 * خريطة «معرّف ← اسم» من جدول مرجعي صغير (حسابات · فئات · متعهدون).
 *
 * نفس ما تفعله شاشة المصروفات حين تبني `accountName` و`categoryName`: قراءة
 * واحدة للجدول المرجعي كله ثم مطابقة في الذاكرة — لا استعلام لكل صف. وهي
 * مطابقةُ **أسماء** لا حسابُ قيمة، فلا شأن لـD-05 بها.
 *
 * وخطأ القراءة يُرجع خريطة فارغة عمداً بدل أن يُسقِط الملف: الأسماء زينةُ
 * قراءة، والمبالغ والتواريخ — وهي البيان — سليمة بدونها. والخانة حينها تقول
 * «غير معروف» لا تكذب باسمٍ مخترَع.
 *
 * و`ids` تحصر القراءة بما ظهر في الصفحة فعلاً. حسابات الخزينة وفئات المصروفات
 * جداول صغيرة بطبعها فتُقرأ كاملة كما تفعل الشاشات، أمّا المتعهدون فقد يبلغون
 * عدداً يتجاوز سقف صفوف PostgREST الافتراضي — وحينها يسقط المتعهد الغائب عن
 * الخريطة على خانة «محذوف أو غير مقروء» وهو حيٌّ قائم. والحصر يُغلق الباب
 * بنيوياً بدل الرهان على أن عددهم سيبقى صغيراً.
 */
async function labelMap(
  supabase: SupabaseClient,
  table: string,
  nameColumn: string,
  ids?: readonly string[]
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  // لا معرّفات ⇒ لا حاجة إلى الجولة أصلاً؛ و`in()` بقائمة فارغة استعلامٌ لا معنى له
  if (ids !== undefined && ids.length === 0) return out;

  const query = supabase.from(table).select(`id, ${nameColumn}`);
  const res = await (ids === undefined ? query : query.in("id", ids as string[]));
  if (res.error) return out;

  for (const row of rowsOf(res.data)) {
    const id = typeof row.id === "string" ? row.id : null;
    // ⚠ **`csvText` هنا لا عند الكتابة** — وهذه بوّابة الأسماء الوحيدة في الملف.
    // قيم هذه الخريطة تخرج في **موضعين** لا موضع: خانةً في صف بيانات (عبر
    // `labelOf`)، وجزءاً من سطر المصدر في الذيل (اسم الحساب أو الفئة). فتنقيتها
    // عند الحدّ — حيث تصل من القاعدة — تغطّي المسارين معاً؛ وتنقيتها عند الكتابة
    // وحدها كانت ستترك الذيل مكشوفاً، وهو بالضبط العيب الذي أمسكه الفحص:
    // تسميةُ حسابٍ فيها سطر جديد تصنع سطراً بلا `#` يعدّه سكربت المطابقة صفَّ
    // بيانات في ملفٍ كل غرضه العدّ.
    const name = csvText(row[nameColumn]);
    if (id !== null && name.trim() !== "") {
      out.set(id, name.trim());
    }
  }
  return out;
}

/**
 * اسمٌ من خريطة مرجعية — **ثلاث حالات لا حالتان**.
 *
 * «لا معرّف أصلاً» شيء (قيدٌ بلا حساب، مصروفٌ بلا فئة) و«معرّفٌ لم نجد اسمه»
 * شيء آخر تماماً (سجلٌ حُذف، أو خريطة لم تُقرأ). وخلطهما في خانة واحدة هو عين
 * خلط «لا نعرف» بـ«صفر» الذي يمنعه العقد — فيقرأ المحاسب «بلا فئة» عن مصروفٍ
 * له فئةٌ حُذف اسمها.
 */
function labelOf(
  map: Map<string, string>,
  id: unknown,
  whenNull: string,
  whenMissing: string
): string {
  if (typeof id !== "string" || id.trim() === "") return whenNull;
  return map.get(id) ?? whenMissing;
}

// ---------------------------------------------------------------------------
// (٥-٢) قيود الدفتر — حدثه: مطابقة بنكية
// ---------------------------------------------------------------------------

/**
 * أعمدة المصدر **مصرَّحة صراحةً لا `select("*")`**.
 *
 * شاشة الخزينة تقرأ `*` وهي محقّة: تسامحٌ مع اسم عمود يختلف بين نسختَي هجرة،
 * وثمنُه لا شيء لأن الشاشة تختار ما تعرض. أمّا الملف فلا يختار — يكتب ما وصله.
 * و`*` تعني أن عموداً يُضاف إلى الجدول بعد سنة يخرج في التصدير بلا أن يقرأه
 * أحد، وأن `forbiddenColumn()` تفحص قائمةً لا تصف ما سيُكتب فعلاً — أي حارسٌ
 * كُتب بصيغة لا يمكن أن تفشل. التصريح يجعل العقد قابلاً للفشل، وهو شرط كونه
 * عقداً.
 */
const LEDGER_COLUMNS = [
  "occurred_at",
  "account_id",
  "source_type",
  "settlement_role",
  "direction",
  "amount",
  "note",
] as const;

/** مرآة `SOURCE_LABELS` في `app/admin/finance/_components/finance-ui.tsx` */
const LEDGER_SOURCE_LABELS: Record<string, string> = {
  payment: "تحصيل من عميل",
  expense: "مصروف",
  partner_payout: "دفعة لمتعهد",
  partner_collection: "تحصيل قبضه المتعهد",
  partner_settlement: "سداد من متعهد",
  refund: "ردّ مبلغ لعميل",
  adjustment: "تسوية يدوية",
};

/** مرآة `DIRECTION_LABELS` — الاتجاه من منظور خزينتنا */
const LEDGER_DIRECTION_LABELS: Record<string, string> = { in: "وارد", out: "منصرف" };

/**
 * أدوار المقاصة الأربعة (`lib/finance-types.ts`) — ومعناها هنا أوسع من تسمية.
 *
 * الدوران الأولان قيدا **التزام** بلا حساب خزينة (يمنعه القيد البنيوي
 * `ledger_entries_liability_no_account_chk`)، والآخران قيدا **نقد**. ومن يطابق
 * كشفاً بنكياً يجب أن يرى الفرق مكتوباً في الخانة لا مستنتَجاً من فراغ عمود
 * الحساب — وإلا جمع التزاماً مع نقد وخرج بفرقٍ يطارده يوماً.
 */
const SETTLEMENT_ROLE_LABELS: Record<string, string> = {
  earned: "مستحق عن رحلات — التزام",
  collected: "قبضه المتعهد من عملائنا — التزام",
  paid: "دفعناه له — نقد",
  received: "سدّده لنا — نقد",
};

async function buildLedger(input: BuilderInput): Promise<Response> {
  const { supabase, url, cap, currency } = input;

  const period = readPeriod(url);
  if (period === null) return errorJson("invalid-input", PERIOD_HELP, 400);

  // ترشيح بحساب واحد اختياري — مرآة منتقي الحساب في شاشة الخزينة. وغيابه يعني
  // «كل الحسابات»، وهو ما تحتاجه المطابقة البنكية أصلاً: الشاشة تفتح على حساب
  // لأنها كشف حركة، والملف يُصدَّر للفترة لأنه مادة مقارنة.
  const account = (url.searchParams.get("account") ?? "").trim();
  if (account !== "" && !UUID_PATTERN.test(account)) {
    return errorJson(
      "invalid-input",
      "وسيط account يجب أن يكون UUID لحساب خزينة، أو يُترك فارغاً لتصدير كل الحسابات.",
      400
    );
  }

  const banned = forbiddenColumn(LEDGER_COLUMNS);
  if (banned !== null) {
    return errorJson(
      "forbidden-column",
      `العمود «${banned}» ممنوع في التصدير ولا يخرج ملف يحمله.`,
      500
    );
  }

  /**
   * `count: "exact"` تُحوّل سطر السقف من احتمال إلى يقين: العدد يأتي من دالة
   * COUNT في Postgres على نفس شرط الترشيح، فيصير الذيل «٥٠٠٠ من ٨١٢٤» لا
   * «بلغنا السقف وربما هناك المزيد». وهو أيضاً رقمٌ حسبته القاعدة لا مصفوفةٌ
   * عُدّت هنا — نفس روح D-05 وإن لم يكن مبلغاً.
   */
  let query = supabase
    .from("ledger_entries")
    .select(LEDGER_COLUMNS.join(", "), { count: "exact" });

  if (period.start !== null) query = query.gte("occurred_at", period.start);
  if (period.end !== null) query = query.lt("occurred_at", period.end);
  if (account !== "") query = query.eq("account_id", account);

  // الأحدث أولاً كما في الشاشة — فإن بُلغ السقف كان المقصوص هو الأقدم، وهو
  // الترتيب الذي يتوقعه من يضيّق الفترة بعد قراءة سطر السقف
  const { data, error, count } = await query
    .order("occurred_at", { ascending: false })
    .limit(cap);

  if (error) return readFailure(error.code, "ledger_entries");

  const accounts = await labelMap(supabase, "payment_accounts", "label");

  const rows = rowsOf(data).map((row) => {
    const source = csvText(pick(row, ["source_type"]));
    const direction = csvText(pick(row, ["direction"]));
    const role = csvText(pick(row, ["settlement_role"]));
    return [
      csvDate(pick(row, ["occurred_at"])),
      labelOf(
        accounts,
        pick(row, ["account_id"]),
        "بلا حساب — التزام مقاصة",
        "حساب محذوف أو غير مقروء"
      ),
      LEDGER_SOURCE_LABELS[source] ?? source,
      role === "" ? "" : (SETTLEMENT_ROLE_LABELS[role] ?? role),
      LEDGER_DIRECTION_LABELS[direction] ?? direction,
      // ⚠ المبلغ يخرج موجباً كما خزّنته القاعدة (`check (amount > 0)`) وإشارته
      // في عمود «الاتجاه». وقلبُ إشارة المنصرف هنا كان سيجعل العمود قابلاً
      // للجمع مباشرة — وهو بالضبط ما يمنعه D-05: طرحُ قيمةٍ تجارية في
      // TypeScript، ورقمٌ في الملف لا يساوي الرقم الذي تراه الشاشة.
      csvMoney(pick(row, ["amount"])),
      csvText(pick(row, ["note"])),
    ];
  });

  const accountLabel =
    account === ""
      ? "كل الحسابات"
      : labelOf(accounts, account, "كل الحسابات", "حساب محذوف أو غير مقروء");
  const periodLabel = periodText(period.from, period.to);

  return csvFileResponse({
    headers: [
      "التاريخ",
      "الحساب",
      "المصدر",
      "دور المقاصة",
      "الاتجاه",
      withCurrency("المبلغ", currency),
      "الملاحظة",
    ],
    rows,
    asciiName: `ledger-${period.from ?? "all"}_${period.to ?? "all"}`,
    displayName: `قيود الدفتر — ${accountLabel} — ${periodLabel}`,
    rowCap: { cap, written: rows.length, available: count ?? null },
    sourceNote:
      `المصدر: ledger_entries · الحساب: ${accountLabel} · الفترة: ${periodLabel}` +
      ` · العملة: ${currency} · المبلغ موجب دائماً وإشارته في عمود «الاتجاه»،` +
      ` فلا يُجمع العمود بلا ترشيح · القيود بلا حساب التزامات مقاصة لا نقد.`,
  });
}

// ---------------------------------------------------------------------------
// (٥-٣) المصروفات — حدثه: طلب المحاسب
// ---------------------------------------------------------------------------

/**
 * ‏`attachment_path` **غائب عن هذه القائمة عمداً** — القسم (٢) من العقد: مسار
 * دلوٍ خاص لا يُفتح إلا برابط موقّع، وجودُه في ملفٍ يُرسَل بالبريد يغري بمحاولة
 * وصولٍ ولا يفيد قارئاً. وهو مصرَّح في `EXPORT_FORBIDDEN_COLUMNS`، فلو تسلّل إلى
 * هنا يوماً لأوقفته `forbiddenColumn()` بـ٥٠٠ قبل كتابة خانة واحدة.
 */
const EXPENSE_COLUMNS = ["occurred_at", "category_id", "account_id", "amount", "note"] as const;

async function buildExpenses(input: BuilderInput): Promise<Response> {
  const { supabase, url, cap, currency } = input;

  const period = readPeriod(url);
  if (period === null) return errorJson("invalid-input", PERIOD_HELP, 400);

  // مرآة منتقي الفئة في الشاشة: «none» تعني المصروفات بلا فئة صراحةً — وهي
  // ترشيح مقصود لا غياب ترشيح، ولذلك لها قيمة مكتوبة لا خانة فارغة
  const category = (url.searchParams.get("category") ?? "").trim();
  if (category !== "" && category !== "none" && !UUID_PATTERN.test(category)) {
    return errorJson(
      "invalid-input",
      "وسيط category يجب أن يكون UUID لفئة، أو «none» للمصروفات بلا فئة، أو يُترك فارغاً لكل الفئات.",
      400
    );
  }

  const banned = forbiddenColumn(EXPENSE_COLUMNS);
  if (banned !== null) {
    return errorJson(
      "forbidden-column",
      `العمود «${banned}» ممنوع في التصدير ولا يخرج ملف يحمله.`,
      500
    );
  }

  let query = supabase.from("expenses").select(EXPENSE_COLUMNS.join(", "), { count: "exact" });

  if (period.start !== null) query = query.gte("occurred_at", period.start);
  if (period.end !== null) query = query.lt("occurred_at", period.end);
  if (category === "none") query = query.is("category_id", null);
  else if (category !== "") query = query.eq("category_id", category);

  const { data, error, count } = await query
    .order("occurred_at", { ascending: false })
    .limit(cap);

  if (error) return readFailure(error.code, "expenses");

  const [categories, accounts] = await Promise.all([
    labelMap(supabase, "expense_categories", "name"),
    labelMap(supabase, "payment_accounts", "label"),
  ]);

  const rows = rowsOf(data).map((row) => [
    csvDate(pick(row, ["occurred_at"])),
    labelOf(categories, pick(row, ["category_id"]), "بلا فئة", "فئة محذوفة أو غير مقروءة"),
    labelOf(accounts, pick(row, ["account_id"]), "بلا حساب", "حساب محذوف أو غير مقروء"),
    csvMoney(pick(row, ["amount"])),
    csvText(pick(row, ["note"])),
  ]);

  const categoryLabel =
    category === ""
      ? "كل الفئات"
      : category === "none"
        ? "بلا فئة"
        : labelOf(categories, category, "كل الفئات", "فئة محذوفة أو غير مقروءة");
  const periodLabel = periodText(period.from, period.to);

  return csvFileResponse({
    headers: [
      "التاريخ",
      "الفئة",
      "الحساب المنصرف منه",
      withCurrency("المبلغ", currency),
      "الملاحظة",
    ],
    rows,
    asciiName: `expenses-${period.from ?? "all"}_${period.to ?? "all"}`,
    displayName: `المصروفات — ${categoryLabel} — ${periodLabel}`,
    rowCap: { cap, written: rows.length, available: count ?? null },
    sourceNote:
      `المصدر: expenses · الفئة: ${categoryLabel} · الفترة: ${periodLabel}` +
      ` · العملة: ${currency} · مستحقات المتعهدين ليست مصروفاً بل تكلفة بيع،` +
      ` ومكانها كشف حساب المتعهد · مسار المرفق لا يُصدَّر (عقد التصدير).`,
  });
}

// ---------------------------------------------------------------------------
// (٥-٤) الحجوزات — حدثه: مراجعة تشغيلية ومالية
// ---------------------------------------------------------------------------

/**
 * 🔒 **الجدول الوحيد في التصديرات الأربعة الذي يحمل أربعة أعمدة ممنوعة**:
 * `public_token` و`customer_phone` و`customer_whatsapp` و`phone_norm`. ولا واحد
 * منها في القائمة أدناه، والاستعلام يسمّي أعمدته فلا تغادر القاعدة أصلاً — لا
 * تُقرأ ثم تُهمَل. وأخطرها التوكن بنصّ العقد: رابط `/booking/[token]` هو بيانات
 * الاعتماد نفسها، وملفٌ فيه ألف توكن يسلّم ألف حجز لمن يفتحه.
 *
 * وما **يبقى** مقصود بالقدر نفسه: `subcontractor_cost` و`margin_amount`. هذا
 * الملف يخرج بجلسة مدير وحدها ولا يصل متعهداً، وهما لبّ المراجعة المالية —
 * حذفهما كان سيُخرج ملفاً يعرف الإيراد ولا يعرف الربح.
 */
const BOOKING_COLUMNS = [
  "reference",
  "created_at",
  "status",
  "class_title",
  "class_slug",
  "plan",
  "currency",
  "total",
  "amount_due",
  "amount_remaining",
  "customer_name",
  "trip",
  "subcontractor_id",
  "subcontractor_cost",
  "margin_amount",
] as const;

/**
 * مرآة `STATUS_LABELS` في `app/admin/orders/_components/booking-ui.tsx`،
 * **وشرطُها أن تكون تامّةً على مجال `bookings_status_check` لا أقلّ منه**.
 *
 * ── 🔴 غيابُ `failed` كان عيبين لا واحداً ────────────────────────────────────
 * هجرة `0051` وسّعت القيد إلى سبع حالات ولم تصل السابعة إلى هنا، فوقع معاً:
 *
 *   • **٤٠٠ «حالة غير معروفة»** على تبويب «لم يتم التنفيذ» في `/admin/orders`:
 *     الزرّ يمرّر `?status=failed` (‏`components/admin/export-link.tsx`) والقاموس
 *     يرفضه — فالتبويب الوحيد الذي يقيس **جودة التشغيل** هو الوحيد الذي لا
 *     يُصدَّر، وهو أحوجها إلى ملفٍّ يُراجَع.
 *   • **`failed` لاتينيةً عاريةً في خانة عربية** عند التصدير تحت «كل الحالات»
 *     (السطر `BOOKING_STATUS_LABELS[state] ?? state`) — نفس عيب `settlement`
 *     الذي وقع في القسم (٤) بالحرف.
 *
 * ── 🔒 والقاموس يؤدّي وظيفتين، وقد بقيتا **مندمجتين بقرارٍ** لا بإهمال ───────
 * (١) التسمية العربية لكل حالة، و(٢) قائمةُ ما يقبله وسيط `?status=`.
 *
 * والفصلُ إلى ثابتين **يزيد الانحراف ولا يمنعه**، لأن المجموعتين واحدةٌ بالبناء
 * لا بالمصادفة: التسمية يجب أن تعمّ مجال القيد كلَّه وإلّا خرج معرّف لاتيني،
 * وقائمةُ القبول يجب أن تعمّه كذلك وإلّا انكسر تبويبٌ قائم، وقبولُ ما ليس في
 * المجال بلا معنى أصلاً لأنه يُخرج ملفاً فارغاً. فنسختان تعنيان أن تُضاف حالةٌ
 * إلى إحداهما وحدها ⇒ **تُقبَل في الترشيح وتُطبَع لاتينيةً في الخانة**: انحرافٌ
 * صامت أسوأ من الـ٤٠٠ الصاخب الذي أوقعنا هنا، لأن الصاخب يجده أوّل من يضغط
 * الزرّ والصامت لا يجده أحد.
 *
 * ولذلك: **قاموسٌ واحد**، والوظيفة الثانية **تُسمّى** في `isKnownBookingStatus`
 * أدناه بدل أن تختبئ في `hasOwnProperty` وسط شرطٍ في جسم البانية، **والتمامُ على
 * القيد يُفحَص آلياً لا يُوعَد به في تعليق**:
 *
 *     node scripts/check-export-status-parity.mjs
 *
 * يقرأ `bookings_status_check` من القاعدة الحيّة ويقارنه بمفاتيح هذا القاموس في
 * الاتجاهين — وهو **يسقط أحمر على النسخة التي سبقت هذا السطر**.
 *
 * ⚠ وما **لا** يفعله هذا الإصلاح: لا يوسّع عمود بيانات ولا حارساً. `?status=`
 * ترشيحٌ يضيّق مجموعةً يُخرجها التصدير بلا وسيط أصلاً — نفس الأعمدة ونفس السقف
 * ونفس جلسة المدير — فقبولُ `failed` **لا يُخرج صفّاً ولا خانةً لم تكن تخرج**.
 */
const BOOKING_STATUS_LABELS: Record<string, string> = {
  pending_payment: "بانتظار الدفع",
  under_review: "قيد المراجعة",
  confirmed: "تم التأكيد",
  assigned: "تم الإسناد",
  completed: "تم التنفيذ",
  cancelled: "تم الإلغاء",
  failed: "لم يتم التنفيذ",
};

/**
 * الوظيفة الثانية للقاموس، مسمّاةً: **«هل لهذه الحالة تسميةٌ عربية؟»**
 *
 * ⚠ وهي **ليست حارس صلاحية ولا حارس حقن**، ولا يجوز أن تُقرأ كذلك: حارسُ هذا
 * المسار جلسةٌ ودورٌ في القسم (٢) وحدهما، وقيمةُ الوسيط تصل الاستعلام **مُعامِلاً
 * في `.eq()`** لا نصّاً مُلصقاً في SQL. وما تحرسه هذه الدالة شيءٌ ثالث:
 * **الملفُّ الفارغ الكاذب**. فـ`?status=faild` بلا فحصٍ تُخرج CSV سليم الشكل
 * ذيلُه «٠ صفاً» يقرؤه المالك «لا حجوزات في هذه الحالة» — وهو حرفياً العيب الذي
 * بُني له تبديلُ التاريخين المقلوبين في `readPeriod`.
 */
const isKnownBookingStatus = (value: string): boolean =>
  Object.prototype.hasOwnProperty.call(BOOKING_STATUS_LABELS, value);

/** مرآة `PLAN_LABELS` — خطة الدفع المجمَّدة في الحجز */
const BOOKING_PLAN_LABELS: Record<string, string> = {
  full: "كامل المبلغ",
  deposit: "عربون",
};

/**
 * لقطة الرحلة كائناً — و`trip` عمود jsonb **ثابت الشكل** (‏`TripSnapshot` في
 * `lib/booking-types.ts`)، ولذلك يُسطَّح هنا بينما رُفض تسطيح `changes`
 * و`snapshot` في سجل التدقيق: تلك فروقٌ حرّة المفاتيح يفقدها التسطيح معناها،
 * وهذه حقولٌ معدودة تعرضها شاشة الطلبات نفسها أعمدةً منذ اليوم الأول.
 */
const tripOf = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

async function buildBookings(input: BuilderInput): Promise<Response> {
  const { supabase, url, cap } = input;

  const period = readPeriod(url);
  if (period === null) return errorJson("invalid-input", PERIOD_HELP, 400);

  /**
   * الحالة ترشيحٌ اختياري مرآةً لتبويبات شاشة الطلبات. أمّا صندوق البحث فلا
   * مقابل له هنا عمداً: شرطه يطابق `customer_phone` و`customer_whatsapp` —
   * العمودين اللذين يمنع العقد خروجهما — وترشيحُ ملفٍ بعمودٍ ممنوع يجعل الملف
   * يشهد بوجود صاحب رقمٍ بعينه ولو لم يطبعه. والبحث أصلاً وسيلةُ **فتح حجز
   * واحد**، والحجز الواحد يُفتح ولا يُصدَّر.
   */
  const status = (url.searchParams.get("status") ?? "").trim();
  if (status !== "" && !isKnownBookingStatus(status)) {
    return errorJson(
      "invalid-input",
      `حالة غير معروفة. المتاح: ${Object.keys(BOOKING_STATUS_LABELS).join(" · ")}.`,
      400
    );
  }

  const banned = forbiddenColumn(BOOKING_COLUMNS);
  if (banned !== null) {
    return errorJson(
      "forbidden-column",
      `العمود «${banned}» ممنوع في التصدير ولا يخرج ملف يحمله.`,
      500
    );
  }

  let query = supabase.from("bookings").select(BOOKING_COLUMNS.join(", "), { count: "exact" });

  // الفترة على `created_at` — تاريخ **إنشاء** الحجز، وهو ما ترتّب به الشاشة.
  // وموعد الانطلاق عمودٌ في الملف لا حدٌّ للفترة: حجزٌ يُنشأ في أغسطس لرحلة
  // سبتمبر يخصّ مراجعة أغسطس التشغيلية، وربطه بموعده كان سيُخرجه منها.
  if (period.start !== null) query = query.gte("created_at", period.start);
  if (period.end !== null) query = query.lt("created_at", period.end);
  if (status !== "") query = query.eq("status", status);

  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .limit(cap);

  if (error) return readFailure(error.code, "bookings");

  const page = rowsOf(data);

  // أسماء المتعهدين الظاهرين في هذه الصفحة وحدهم — لا الجدول كله
  const partnerIds = [
    ...new Set(
      page
        .map((row) => pick(row, ["subcontractor_id"]))
        .filter((id): id is string => typeof id === "string" && id.trim() !== "")
    ),
  ];
  const partners = await labelMap(supabase, "subcontractors", "company_name", partnerIds);

  const rows = page.map((row) => {
    const trip = tripOf(pick(row, ["trip"]));
    const state = csvText(pick(row, ["status"]));
    const plan = csvText(pick(row, ["plan"]));
    return [
      csvText(pick(row, ["reference"])),
      csvDate(pick(row, ["created_at"])),
      BOOKING_STATUS_LABELS[state] ?? state,
      csvText(pick(row, ["customer_name"])),
      csvText(pick(row, ["class_title", "class_slug"])),
      csvText(pick(trip, ["originLabel"])),
      csvText(pick(trip, ["destLabel"])),
      csvDate(pick(trip, ["pickupAt"])),
      csvNumber(pick(trip, ["passengers"])),
      csvBool(pick(trip, ["roundTrip"])),
      csvNumber(pick(trip, ["distanceKm"])),
      csvNumber(pick(trip, ["waitingHours"])),
      BOOKING_PLAN_LABELS[plan] ?? plan,
      // العملة عمودٌ لكل صف هنا — بعكس بقية الملفات التي تكتبها في عنوان
      // العمود. السبب أن الحجز يجمّد عملته في لقطته لحظة إنشائه، فقد تخالف
      // عملة الإعدادات اليوم؛ وعنوانٌ يعلن عملةً واحدة عن عمودٍ فيه عملتان
      // يكذب على قارئه بلا أن يظهر ذلك في أي خانة.
      csvText(pick(row, ["currency"])),
      csvMoney(pick(row, ["total"])),
      csvMoney(pick(row, ["amount_due"])),
      csvMoney(pick(row, ["amount_remaining"])),
      labelOf(
        partners,
        pick(row, ["subcontractor_id"]),
        "غير مُسند",
        "متعهد محذوف أو غير مقروء"
      ),
      csvMoney(pick(row, ["subcontractor_cost"])),
      csvMoney(pick(row, ["margin_amount"])),
    ];
  });

  // ‏`?? status` احتياطٌ لا يُبلَغ اليوم — `isKnownBookingStatus` تضمن المفتاح —
  // لكنه يوجد لأن البديل عند أي انفصالٍ مستقبليّ بين القائمتين ليس معرّفاً
  // لاتينياً بل **`undefined` حرفياً** في اسم الملف وفي ذيله: «الحجوزات —
  // undefined — كامل السجل». ومعرّفٌ خام أسوأ من تسمية، وأحسن من كلمةٍ لا معنى لها.
  const statusLabel = status === "" ? "كل الحالات" : (BOOKING_STATUS_LABELS[status] ?? status);
  const periodLabel = periodText(period.from, period.to);

  return csvFileResponse({
    headers: [
      "الرقم المرجعي",
      "تاريخ الإنشاء",
      "الحالة",
      "العميل",
      "فئة المركبة",
      "من",
      "إلى",
      "موعد الانطلاق",
      "الركاب",
      "ذهاب وعودة",
      "المسافة (كم)",
      "ساعات الانتظار",
      "خطة الدفع",
      "العملة",
      "الإجمالي",
      "المطلوب الآن",
      "المتبقي مع السائق",
      "المتعهد",
      "تكلفة المتعهد",
      "هامشنا",
    ],
    rows,
    asciiName: `bookings-${period.from ?? "all"}_${period.to ?? "all"}`,
    displayName: `الحجوزات — ${statusLabel} — ${periodLabel}`,
    rowCap: { cap, written: rows.length, available: count ?? null },
    sourceNote:
      `المصدر: bookings · الحالة: ${statusLabel} · الفترة: ${periodLabel} (بتاريخ الإنشاء)` +
      ` · العملة في عمود مستقل لكل حجز · هاتف العميل وواتسابه ورابط المتابعة` +
      ` لا تُصدَّر (عقد التصدير) · الملف يحمل التكلفة والهامش: للمالك وحده،` +
      ` ولا يُرسَل إلى متعهد.`,
  });
}

// ---------------------------------------------------------------------------
// (٦) نقاط التوسيع — سِجلّ البانيات
// ---------------------------------------------------------------------------

export type BuilderInput = {
  supabase: SupabaseClient;
  url: URL;
  /** سقف صفوف هذا النوع من `EXPORT_ROW_CAP` — يُمرَّر ولا يُعاد كتابته */
  cap: number;
  currency: string;
};

type Builder = (input: BuilderInput) => Promise<Response>;

/**
 * 🔧 **نقطة التوسيع.** كل نوع دالةٌ واحدة تُسجَّل هنا، و`null` تعني «لم يُبنَ
 * بعد» فيخرج ‏501 صريح بدل ملف فارغ يبدو صحيحاً.
 *
 * وما على البانية الجديدة أن تفعله، بالترتيب:
 *   ١) تقرأ وسائطها من `url` وترفض غير الصالح بـ`errorJson("invalid-input", …)`.
 *   ٢) **تعلن أعمدة مصدرها** وتمرّرها على `forbiddenColumn()` قبل أي كتابة.
 *      والمصادر الثلاثة المبنيّة في القسم (٥) صفوفٌ خام (`ledger_entries` ·
 *      `expenses` · `bookings`)، و`bookings` تحديداً تحمل `public_token`
 *      و`customer_phone` و`customer_whatsapp` و`phone_norm` — أربعة أعمدة
 *      ممنوعة في جدول واحد.
 *   ٣) **تقصّ في القاعدة بـ`.limit(cap)` لا في الذاكرة بـ`slice()`**، وتطلب
 *      `count: "exact"` فتمرّر `available: count ?? null`. والأربعة كلها على
 *      هذا النسق اليوم. والقصّ في الذاكرة يبدو مكافئاً وليس كذلك: المصدر ينفّذ
 *      على كامل السجل وPostgREST يشحن كل صف لنرمي أكثره، ودور `authenticated`
 *      عليه `statement_timeout = 8s` — فيصير الملف ٥٠٠ مع نمو البيانات.
 *      و`available: null` تبقى للمنادي الذي قصَّ بلا أن يَعُدّ، فتُصاغ جملة
 *      السقف بالاحتمال ولا يُدّعى يقين لا يوجد.
 *   ٣-١) و**لا تفرض ترتيباً على مصدرٍ يحمل عموداً تراكمياً**: `partner_statement`
 *      تبني `balance` بنافذة على ترتيبها الداخلي، فترتيبٌ من هنا يخلط الرصيد
 *      المتحرك. الأنواع الثلاثة الأخرى صفوفٌ مستقلة فترتّب تنازلياً بلا ضرر.
 *   ٤) تكتب كل مبلغ بـ`csvMoney` وكل تاريخ بـ`csvDate` وكل نص بـ`csvText`،
 *      ولا تستعمل مُنسِّقاً من `components/booking/format.ts` ولا من
 *      `lib/stats/format.ts` (الأسباب في ترويسة `lib/export/csv.ts`).
 *   ٥) **لا تحسب رقماً** (D-05): كل مبلغ يصل محسوباً من Postgres.
 */
const BUILDERS: Record<ExportKind, Builder | null> = {
  "partner-statement": buildPartnerStatement,
  ledger: buildLedger,
  expenses: buildExpenses,
  bookings: buildBookings,
};

const PENDING_LABELS: Record<ExportKind, string> = {
  "partner-statement": "كشف حساب متعهد",
  ledger: "قيود الدفتر",
  expenses: "المصروفات",
  bookings: "الحجوزات",
};

// ---------------------------------------------------------------------------
// (٧) المسار
// ---------------------------------------------------------------------------

export async function GET(
  request: Request,
  context: { params: Promise<{ kind: string }> }
): Promise<Response> {
  const { kind: rawKind } = await context.params;

  if (!isExportKind(rawKind)) {
    // الأنواع الأربعة محسومة في العقد ولا تُوسَّع من الرابط
    return errorJson(
      "unknown-kind",
      `نوع تصدير غير معروف. المتاح: ${Object.keys(EXPORT_ROW_CAP).join(" · ")}.`,
      404
    );
  }

  const supabase = await createServerSupabase();
  if (!supabase) {
    return errorJson(
      "db-unavailable",
      "قاعدة البيانات غير مربوطة — اضبط متغيرات Supabase ثم أعد المحاولة.",
      503
    );
  }

  /**
   * 🔴 **منطقة الموقع قبل أي `csvDate`** (هجرة 0075): مسار `/api` لا يمرّ
   * بالتخطيط، فلا يضبط `i18n/request.ts` الوحدةَ المشتركة. وبلا هذا السطر
   * يخرج الملفّ بساعاتٍ تخالف ما على الشاشة — وملفٌّ مصدَّر لا يُراجَع.
   */
  await getSiteTimeZone();

  // النوع يُمرَّر إلى الحارس ليصير سطر السجل مفيداً: «حاول تصدير الحجوزات» لا
  // «حاول تصديراً». وهو مسمّىً عربي من `PENDING_LABELS` كما يقرؤه المالك.
  const denial = await adminDenial(supabase, rawKind);
  if (denial) return errorJson(denial.code, denial.message, denial.status);

  const builder = BUILDERS[rawKind];
  if (builder === null) {
    return errorJson(
      "not-implemented",
      `تصدير «${PENDING_LABELS[rawKind]}» لم يُبنَ بعد. المتاح: ${Object.entries(BUILDERS)
        .filter(([, builder]) => builder !== null)
        .map(([key]) => PENDING_LABELS[key as ExportKind])
        .join(" · ")}.`,
      501
    );
  }

  const currency = await readCurrency(supabase);

  try {
    return await builder({
      supabase,
      url: new URL(request.url),
      cap: EXPORT_ROW_CAP[rawKind],
      currency,
    });
  } catch (cause) {
    // ملف نصف مكتوب أسوأ من لا ملف: نقطع بخطأ JSON صريح بدل ردٍّ بترويسة
    // تنزيل وجسمٍ ناقص يفتحه المالك فيراه جدولاً «انتهى» عند سطر عشوائي.
    const detail = isMissingTable((cause as { code?: string })?.code)
      ? "أحد جداول المصدر غير موجود — راجع الهجرات."
      : "خطأ غير متوقع أثناء بناء الملف — راجع سجل الخادم.";
    return errorJson("export-failed", detail, 500);
  }
}
