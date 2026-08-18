/**
 * مُشغّل اختبارات قاعدة البيانات — الاستخدام:
 *   node scripts/db-test.mjs               (كل ملفات supabase/tests)
 *   node scripts/db-test.mjs booking       (الملفات التي يطابق اسمها النص)
 *
 * كل ملف يُنفَّذ داخل معاملةٍ **تُرجَع دائماً**، وتُطبع إشعارات Postgres كما هي —
 * النجاح يعني ظهور «ALL PASSED» في كل ملف، ثم «صفر تسرّب» في آخر الجولة.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  🔴 لماذا `ROLLBACK` لا `COMMIT` — والثمنُ مقيسٌ على هاتف المالك
 * ══════════════════════════════════════════════════════════════════════════
 *
 * كان هذا الملف يمرّر نصَّ الاختبار كاملاً إلى `client.query(sql)`. وبروتوكول
 * الاستعلام البسيط في Postgres يلفّ بياناتٍ متعددةً في **معاملةٍ ضمنية تنتهي
 * بـCOMMIT**. فكلُّ ما تكتبه مجموعةُ اختبار كان يُكمّ على قاعدة الإنتاج نفسها.
 *
 * والحصيلة، مقيسةً حول جولةٍ واحدة (2026-08-18T02:21→02:22Z):
 *
 *     notifications   ١٥٩٩ ⇐ ١٦١٠   ·   «تليجرام sent»   ٧٥٠ ⇐ ٧٦١
 *     delivered_at = 02:22:04Z · attempts = 1
 *     channel_outcomes = [{dashboard: sent}, {telegram: sent}]
 *     CUSTOMER_TESTS · DISCOUNT_TESTS_FIXTURE-1/2/3 · PHONE_TESTS_FIXTURE-C/D1/D2/D3/E1/E2
 *
 * أي **أحد عشر إشعارَ حجزٍ وهميّ أُبرقت فعلاً إلى محادثة تليجرام المالك** في
 * جولةٍ واحدة، ومعها ١٥٦٣ صفَّ فيكسترة متراكمة في سجلّ إشعاراته الحيّ.
 *
 * والآليّة: مجموعةٌ تُدرج في `bookings` ⇒ المُشغّل `bookings_log_insert` ⇒
 * `queue_notification` ⇒ صفٌّ `queued` بقناة `telegram` ⇒ **COMMIT** ⇒ عاملُ
 * الإشعارات المجدول كل دقيقة على الإنتاج يطالب به ويرسله.
 *
 * 🔴 والعلاجُ في الحلقة لا في المجموعات: أيُّ حلٍّ يعتمد على «أن يتذكّر كاتبُ
 * الاختبار القادم» يعود في أول ملفٍّ جديد — وقد عاد فعلاً. فما لا يُكمّ لا يراه
 * أحد: **`BEGIN` قبل كل ملف و`ROLLBACK` بعده، دائماً وبلا استثناء ولا متغيّر
 * بيئةٍ يعطّله.** والضمانةُ بنيوية: لا تعتمد على اسمٍ في حمولة، ولا على شكلِ
 * صفٍّ يُخمَّن، ولا على علَمٍ يضبطه المؤلّف.
 *
 * ⚠ وأثرُه على المجموعات: تنظيفُها الذاتي (‏`delete from …` في آخر كل ملف) صار
 *   **زائداً لا ضارّاً** — يُنفَّذ ثم يُرجَع مع الباقي.
 *
 * ── والطبقةُ الثانية: بوّابةُ تسرّبٍ من وصلةٍ مستقلّة ────────────────────────
 *
 * المنعُ وحده لا يشهد على نفسه. ولذلك تُؤخذ بصمةٌ **من وصلةٍ لا تدخل معاملةَ
 * أيّ ملف** قبل الجولة وبعدها، والجولةُ تحمرّ إن تحرّك رقمٌ واحد. وهذا بعينه
 * ما كان يمسك عيبَ 2026-08-17: `payment_tests.sql` ترك مزوّد `test` **مُشعَلاً
 * على القاعدة الحيّة أكثر من يوم** بينما كل جولةٍ تطبع أخضر — لأن البوّابة
 * كانت تشهد على التأكيدات التي جرت، لا على ما تركته وراءها.
 *
 * ⚠ وحدُّها المُعلَن: البصمة تقارن رقماً برقم، فكتابةٌ **حقيقية** من الموقع أثناء
 *   الجولة (حجزُ عميلٍ فعليّ) تُحمِّرها أيضاً. والرسالة تقول ذلك صراحةً بدل أن
 *   تدّعي أن التسرّب من الاختبارات وحدها.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import pg from "pg";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: join(root, ".env.local"), quiet: true });

if (!process.env.DATABASE_URL) {
  console.error("❌ DATABASE_URL غير موجود في .env.local");
  process.exit(1);
}

const filter = process.argv[2] ?? "";
const dir = join(root, "supabase", "tests");
const files = readdirSync(dir)
  .filter((f) => f.endsWith(".sql") && f.includes(filter))
  .sort();

if (files.length === 0) {
  console.error(`❌ لا ملفات اختبار تطابق «${filter}»`);
  process.exit(1);
}

const connect = async () => {
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  return client;
};

/* ------------------------------------------------------------------ *
 * بوّابة التسرّب — بصمةٌ من وصلةٍ مستقلّة
 *
 * صنفان بقصد:
 *   • **عدّاد** للجداول الكبيرة أو المُلحَقة — مسحُها كاملاً في كل جولة كلفةٌ
 *     بلا مكسب (`audit_log` وحده ١١٨ ألف صف).
 *   • **بصمةُ صفوفٍ كاملة** (md5 على `to_jsonb`) لجداول الإعدادات الصغيرة —
 *     لأن العيبَ فيها **قيمةٌ تتغيّر** لا صفٌّ يُضاف: مزوّد `test` صار `true`.
 * ------------------------------------------------------------------ */
const COUNTED = [
  "notifications", "bookings", "booking_events", "audit_log", "audit_attempts",
  "ledger_entries", "loyalty_entries", "funnel_events", "quote_requests",
  "translations", "profiles", "subcontractors", "price_lists", "price_list_items",
  "dispatches", "trip_offers", "payments", "expenses", "partner_payouts",

  /* ── أُضيفت 2026-08-18: ستةُ جداولٍ كانت البصمةُ عمياء عنها تماماً ────────
   *
   * كلُّ واحدٍ منها **يُكتب فيه من مجموعة اختبارٍ قائمة**، وكان أثرُه المتسرّب
   * يمرّ أخضر — وهو بعينه العيبُ الذي وُجدت البصمة لتمسكه (سابقة `payment_tests`
   * التي تركت مزوّد `test` مُشعَلاً أكثر من يوم).
   *
   *   subcontractor_drivers      ← `driver_docs_tests`   (سائقون وأرقام رخص)
   *   trip_completion_requests   ← `completion_apology_tests`
   *   trip_withdrawals           ← `completion_apology_tests`
   *   partner_grievances         ← `partner_*_tests`
   *   partner_presence           ← `presence_tests`
   *   storage.objects            ← `driver_docs_tests` (وهو **خارج `public`**)
   *
   * 🔴 و`storage.objects` أخطرها: ملفٌّ يتيمٌ يبقى في الدلو لا يُرى في أي جدول
   *   `public`، و`driver_docs_tests` نفسه يحمل حارسَ تسريبٍ داخلياً **لأن
   *   البوابة العامة لم تكن تراه** — وحارسٌ داخل ملفٍّ يحمي ذلك الملف وحده.
   * ------------------------------------------------------------------ */
  "subcontractor_drivers", "trip_completion_requests", "trip_withdrawals",
  "partner_grievances", "partner_presence",
  "storage.objects",
];
const HASHED = [
  "payment_providers", "loyalty_settings", "discount_settings", "pricing_settings",
  "trip_settings", "partner_credit_settings", "dispatch_settings", "locales",
  "site_settings",
];

/**
 * الاسمُ يقبل التأهيلَ بالمخطَّط (`storage.objects`)، وغيرُ المؤهَّل `public`.
 *
 * ⚠ ويُفصل بالفاصلة لا بالاقتباس: كل الأسماء هنا مكتوبةٌ في هذا الملف نفسه —
 * لا تأتي من مُدخَل — فلا سطحَ حقنٍ أصلاً، والتعقيدُ الإضافي يخفي المعنى.
 */
const qualify = (name) => (name.includes(".") ? name.split(".", 2) : ["public", name]);

async function fingerprint(client) {
  const wanted = [...COUNTED, ...HASHED].map(qualify);
  const { rows } = await client.query(
    `select table_schema || '.' || table_name as qname
       from information_schema.tables
      where (table_schema, table_name) in (
              select * from unnest($1::text[], $2::text[])
            )`,
    [wanted.map((q) => q[0]), wanted.map((q) => q[1])]
  );
  const present = new Set(rows.map((r) => r.qname));

  const parts = [];
  for (const t of COUNTED) {
    const [schema, table] = qualify(t);
    if (present.has(`${schema}.${table}`)) {
      parts.push(`'${t}', (select count(*) from ${schema}.${table})`);
    }
  }
  for (const t of HASHED) {
    const [schema, table] = qualify(t);
    if (present.has(`${schema}.${table}`)) {
      parts.push(
        `'${t}', (select md5(coalesce(string_agg(x.j, '|' order by x.j), '∅'))
                    from (select to_jsonb(r)::text as j from ${schema}.${table} r) x)`
      );
    }
  }
  if (parts.length === 0) return {};
  const { rows: out } = await client.query(`select jsonb_build_object(${parts.join(", ")}) as fp`);
  return out[0].fp;
}

function diffFingerprints(before, after) {
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
  const drift = [];
  for (const k of keys) {
    const a = before[k];
    const b = after[k];
    if (String(a) === String(b)) continue;
    drift.push(
      HASHED.includes(k)
        ? `${k}: بصمةُ الصفوف تغيّرت (${String(a).slice(0, 8)} ⇐ ${String(b).slice(0, 8)})`
        : `${k}: ${a} ⇐ ${b} (${Number(b) - Number(a) > 0 ? "+" : ""}${Number(b) - Number(a)})`
    );
  }
  return drift;
}

/* ------------------------------------------------------------------ *
 * الجولة
 * ------------------------------------------------------------------ */
let witness = null;
let before = null;
try {
  witness = await connect();
  before = await fingerprint(witness);
} catch (err) {
  console.error(`❌ تعذّر فتح وصلة الشاهد للبصمة: ${err.message}`);
  process.exit(1);
}

let failed = 0;
for (const file of files) {
  console.log(`\n▶ ${file}`);
  let client;
  try {
    client = await connect();
  } catch (err) {
    failed++;
    console.error(`   ❌ تعذّر الاتصال: ${err.message}`);
    continue;
  }
  client.on("notice", (n) => console.log("   " + n.message));
  try {
    await client.query("begin");
    // عقدُ المُشغّل، تقرؤه المجموعات: «أنت داخل معاملةٍ ستُرجَع».
    // مجموعةٌ تكتب ما لا تستطيع حذفه (صفَّ سجلٍّ مُلحَقٍ فقط) ترفض العمل بدونه.
    await client.query("set local tours.test_tx = 'rollback'");
    await client.query(readFileSync(join(dir, file), "utf8"));
  } catch (err) {
    failed++;
    console.error(`   ❌ ${err.message}${err.hint ? ` (${err.hint})` : ""}`);
  } finally {
    // 🔴 لا مسارَ خروجٍ بلا ROLLBACK: هو الحاجزُ نفسه لا تنظيفاً بعده.
    await client.query("rollback").catch(() => {});
    await client.end().catch(() => {});
  }
}

/* ------------------------------------------------------------------ *
 * البوّابة الثانية — هل بقي أثرٌ على القرص؟
 * ------------------------------------------------------------------ */
let leaked = 0;
try {
  const after = await fingerprint(witness);
  const drift = diffFingerprints(before, after);
  if (drift.length === 0) {
    console.log(
      `\n🔒 صفر تسرّب — ${Object.keys(before).length} جدولاً مبصوماً من وصلةٍ مستقلّة، ولا رقمَ تحرّك.`
    );
  } else {
    leaked = 1;
    console.error(
      `\n❌ تسرّبٌ من الجولة — ${drift.length} انحرافاً على قاعدةٍ حيّة:\n   ` +
        drift.join("\n   ") +
        `\n\n   وكلُّ ملفٍّ يُنفَّذ داخل \`BEGIN … ROLLBACK\`، فانحرافُ رقمٍ هنا يعني أحد اثنين:` +
        `\n     • ملفٌّ فتح معاملتَه بنفسه أو كمَّ صراحةً — وهذا يجب أن يُزال؛` +
        `\n     • أو كتابةٌ حقيقية من الموقع جرت أثناء الجولة (حجزُ عميلٍ فعليّ).` +
        `\n   وافحص أيَّهما قبل أن تُصلح: الأول عيبٌ، والثاني عملُ المالك.`
    );
  }
} catch (err) {
  leaked = 1;
  console.error(`\n❌ تعذّر قياس بصمة ما بعد الجولة: ${err.message}`);
} finally {
  await witness.end().catch(() => {});
}

process.exit(failed === 0 && leaked === 0 ? 0 : 1);
