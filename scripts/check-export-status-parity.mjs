#!/usr/bin/env node
/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  حارسُ تطابق حالات الحجز بين قيد القاعدة وقاموس التصدير                  ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 *   node scripts/check-export-status-parity.mjs               # فحص حيّ على القاعدة
 *   node scripts/check-export-status-parity.mjs --self-test   # إثباتُ أنه يكشف فعلاً
 *   node scripts/check-export-status-parity.mjs --file=<path> # فحص نسخةٍ أخرى من الملف
 *   node scripts/check-export-status-parity.mjs --json
 *
 * ── العيب الذي يحرسه، مقيساً ────────────────────────────────────────────────
 *
 * `app/api/admin/export/[kind]/route.ts` يحمل `BOOKING_STATUS_LABELS`، وهو
 * قاموسٌ **بوظيفتين**: التسمية العربية لكل حالة، وقائمةُ ما يقبله وسيط
 * `?status=`. وشرطُ صحّته أن يكون **تامّاً على مجال `bookings_status_check`**
 * في القاعدة — لا أقلّ ولا أكثر.
 *
 * وقد انحرف فعلاً: هجرة `0051` أضافت `failed` إلى القيد (سبع حالات)، وبقي
 * القاموس على ستّ. فوقع عيبان في وقتٍ واحد:
 *
 *   • `/api/admin/export/bookings?status=failed` ⇒ **٤٠٠ «حالة غير معروفة»**،
 *     أي أن زرّ «تصدير الحجوزات (CSV)» مكسورٌ على تبويب «لم يتم التنفيذ».
 *   • حجزٌ `failed` يُصدَّر تحت «كل الحالات» ⇒ الخانة العربية تطبع `failed`
 *     لاتينيةً عاريةً (`BOOKING_STATUS_LABELS[state] ?? state`).
 *
 * والقاعدة العامة التي يفرضها هذا الملف: **حالةٌ تُضاف إلى القيد ولا تُضاف إلى
 * القاموس تجعل الملفّ يكذب أو الزرّ يسقط.**
 *
 * ── لماذا سكربت عقدةٍ لا مجموعةَ SQL في `supabase/tests` ────────────────────
 *
 * لأن طرفَي التطابق في عالمين: أحدهما قيدٌ في Postgres والآخر حرفٌ في TypeScript.
 * ومجموعةُ SQL لا ترى ملفّ TS إطلاقاً (لا `pg_read_file` على Supabase المُدارة،
 * والملفّ أصلاً على جهاز المطوّر لا على الخادم)، فأيُّ اختبارٍ يُكتب هناك يقارن
 * SQL بـSQL ويمرّ أخضرَ فوق الانحراف نفسه الذي وُجد ليمسكه.
 *
 * ⚠ **وحدُّه المعلَن:** لا يُنادى من `pnpm db:test` ولا من `next build` — فربطُه
 * بـ`package.json` بندٌ متروك للمالك (الملفّ عالي التصادم بين الوكلاء). فهو حارسٌ
 * يُشغَّل عند تعديل حالات الحجز، تماماً كما يُشغَّل `check-client-value-leaks.mjs`
 * عند إضافة ثابتٍ مشترك. **وسكربتٌ لا يُنادى لا يحرس شيئاً** — قيلت صراحةً.
 *
 * ── ما يفحصه بالضبط ─────────────────────────────────────────────────────────
 *
 *   (١) كلُّ حالةٍ في `bookings_status_check` لها مفتاحٌ في القاموس.  ⇒ خطأ
 *   (٢) كلُّ مفتاحٍ في القاموس موجودٌ في القيد.                        ⇒ خطأ
 *   (٣) كلُّ تسميةٍ عربية فعلاً: لا حروف ASCII ولا تساوي مفتاحها.      ⇒ خطأ
 *
 * والفحص (٣) هو ما يمنع «الإصلاح» الكسول `failed: "failed"`: يمرّ الفحصين
 * الأوّلين ويطبع معرّفاً لاتينياً في عمودٍ عربيّ.
 *
 * والتحليل بمحلّل TypeScript نفسه (`ts.createSourceFile`) لا بتعبيرٍ نمطي —
 * فلا يُخدع بتعليقٍ يذكر اسم القاموس ولا بنصٍّ داخل قالب.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { config } from "dotenv";
import ts from "typescript";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ROUTE = join(ROOT, "app", "api", "admin", "export", "[kind]", "route.ts");
const DICT = "BOOKING_STATUS_LABELS";
const CONSTRAINT = "bookings_status_check";

// ---------------------------------------------------------------------------
// (١) استخراج القاموس من نصّ TypeScript
// ---------------------------------------------------------------------------

/**
 * يُرجع `Map<key, label>` لقاموس `BOOKING_STATUS_LABELS`، أو يرمي إن لم يجده.
 *
 * والرمي مقصود: «لم أجد القاموس» ليس نجاحاً — إن أُعيدت تسميته أو نُقل، يجب أن
 * يسقط هذا الحارس أحمرَ لا أن يمرّ صامتاً على ملفٍّ لم يفحص منه شيئاً.
 */
function readDictionary(file) {
  const text = readFileSync(file, "utf8");
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);

  let literal = null;
  const walk = (node) => {
    if (
      literal === null &&
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === DICT &&
      node.initializer &&
      ts.isObjectLiteralExpression(node.initializer)
    ) {
      literal = node.initializer;
    }
    ts.forEachChild(node, walk);
  };
  walk(source);

  if (literal === null) {
    throw new Error(`لم يُعثر على ${DICT} ككائنٍ حرفيّ في ${file}`);
  }

  const out = new Map();
  for (const prop of literal.properties) {
    if (!ts.isPropertyAssignment(prop)) {
      throw new Error(`${DICT} يحمل عضواً غير «مفتاح: قيمة» — الحارس لا يفهمه، فيسقط`);
    }
    const key = ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name) ? prop.name.text : null;
    const value = ts.isStringLiteral(prop.initializer) ? prop.initializer.text : null;
    if (key === null || value === null) {
      throw new Error(`${DICT} يحمل مفتاحاً أو قيمةً غير نصّية — الحارس لا يفهمه، فيسقط`);
    }
    out.set(key, value);
  }
  return out;
}

// ---------------------------------------------------------------------------
// (٢) استخراج مجال القيد من القاعدة الحيّة
// ---------------------------------------------------------------------------

async function readConstraintDomain() {
  config({ path: join(ROOT, ".env.local"), quiet: true });
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL غير موجود في .env.local — والحارس يقيس القاعدة الحيّة لا ملفّ هجرة");
  }
  const { default: pg } = await import("pg");
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    const res = await client.query(
      `select pg_get_constraintdef(con.oid) as def
         from pg_constraint con
         join pg_class rel on rel.oid = con.conrelid
         join pg_namespace n on n.oid = rel.relnamespace
        where n.nspname = 'public' and rel.relname = 'bookings' and con.conname = $1`,
      [CONSTRAINT]
    );
    if (res.rows.length === 0) throw new Error(`القيد ${CONSTRAINT} غير موجود في القاعدة`);
    return parseConstraint(res.rows[0].def);
  } finally {
    await client.end().catch(() => {});
  }
}

/**
 * القيمُ النصّية داخل تعريف القيد.
 *
 * ⚠ **ويُقرأ التعريف من `pg_get_constraintdef` لا من ملفّ هجرة** (‏D-58): الملفّ
 * يقول ما كُتب، والكتالوج يقول ما يسري — وهما يفترقان بعد أي `alter … drop
 * constraint … add constraint` يدويّ.
 */
function parseConstraint(def) {
  const values = [...def.matchAll(/'([a-z_]+)'::text/g)].map((m) => m[1]);
  if (values.length === 0) throw new Error(`تعذّر استخراج الحالات من تعريف القيد: ${def}`);
  return new Set(values);
}

// ---------------------------------------------------------------------------
// (٣) المقارنة
// ---------------------------------------------------------------------------

const LATIN = /[A-Za-z]/;

function compare(domain, dictionary) {
  const errors = [];

  for (const status of [...domain].sort()) {
    if (!dictionary.has(status)) {
      errors.push({
        kind: "missing-label",
        detail:
          `الحالة «${status}» يقبلها ${CONSTRAINT} ولا تسمية لها في ${DICT}.` +
          ` ⇒ ‏?status=${status} يردّ ٤٠٠، وصفٌّ بهذه الحالة يُطبع «${status}» لاتينياً في عمودٍ عربيّ.`,
      });
    }
  }

  for (const [key, label] of [...dictionary].sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (!domain.has(key)) {
      errors.push({
        kind: "phantom-status",
        detail:
          `المفتاح «${key}» في ${DICT} لا يقبله ${CONSTRAINT}.` +
          ` ⇒ ترشيحٌ يُخرج ملفاً فارغاً ذيلُه «٠ صفاً» يُقرأ «لا حجوزات في هذه الحالة».`,
      });
    }
    if (label.trim() === "" || label === key || LATIN.test(label)) {
      errors.push({
        kind: "latin-label",
        detail: `تسمية «${key}» = «${label}» ليست عربيةً خالصة — العمود عربيّ ولا يُطبع فيه معرّفٌ خام.`,
      });
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// (٤) الاختبار الذاتي — إثباتُ أن الحارس يسقط على السلوك القديم
// ---------------------------------------------------------------------------

function selfTest() {
  const cases = [
    {
      name: "النسخة القديمة (ستّ حالات، بلا failed) ⇒ يجب أن يسقط",
      domain: new Set([
        "pending_payment",
        "under_review",
        "confirmed",
        "assigned",
        "completed",
        "cancelled",
        "failed",
      ]),
      dictionary: new Map([
        ["pending_payment", "بانتظار الدفع"],
        ["under_review", "قيد المراجعة"],
        ["confirmed", "تم التأكيد"],
        ["assigned", "تم الإسناد"],
        ["completed", "تم التنفيذ"],
        ["cancelled", "تم الإلغاء"],
      ]),
      expect: "missing-label",
    },
    {
      name: "«إصلاح» كسول: failed: \"failed\" ⇒ يجب أن يسقط",
      domain: new Set(["failed"]),
      dictionary: new Map([["failed", "failed"]]),
      expect: "latin-label",
    },
    {
      name: "مفتاحٌ لا يقبله القيد ⇒ يجب أن يسقط",
      domain: new Set(["failed"]),
      dictionary: new Map([
        ["failed", "لم يتم التنفيذ"],
        ["refunded", "مُسترد"],
      ]),
      expect: "phantom-status",
    },
    {
      name: "النسخة المُصلَحة (سبعٌ بسبع) ⇒ يجب أن يمرّ",
      domain: new Set(["completed", "failed"]),
      dictionary: new Map([
        ["completed", "تم التنفيذ"],
        ["failed", "لم يتم التنفيذ"],
      ]),
      expect: null,
    },
  ];

  let bad = 0;
  for (const c of cases) {
    const errors = compare(c.domain, c.dictionary);
    const hit = c.expect === null ? errors.length === 0 : errors.some((e) => e.kind === c.expect);
    console.log(`${hit ? "✅" : "🔴"} ${c.name}`);
    if (!hit) {
      bad++;
      console.log(`   المُتوقَّع: ${c.expect ?? "بلا أخطاء"} · الواقع: ${JSON.stringify(errors)}`);
    }
  }
  console.log(bad === 0 ? "\nSELF-TEST PASSED" : `\n🔴 SELF-TEST FAILED (${bad})`);
  return bad === 0 ? 0 : 1;
}

// ---------------------------------------------------------------------------
// (٥) التشغيل
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);
if (argv.includes("--self-test")) process.exit(selfTest());

const fileArg = argv.find((a) => a.startsWith("--file="));
const file = fileArg ? fileArg.slice("--file=".length) : ROUTE;

const dictionary = readDictionary(file);
const domain = await readConstraintDomain();
const errors = compare(domain, dictionary);

if (argv.includes("--json")) {
  console.log(JSON.stringify({ file, domain: [...domain], dictionary: [...dictionary], errors }, null, 2));
} else {
  console.log(`الملفّ: ${file}`);
  console.log(`${CONSTRAINT} يقبل ${domain.size} حالة: ${[...domain].sort().join(" · ")}`);
  console.log(`${DICT} يحمل ${dictionary.size} مفتاحاً: ${[...dictionary.keys()].sort().join(" · ")}`);
  for (const e of errors) console.log(`\n🔴 [${e.kind}]\n   ${e.detail}`);
  console.log(errors.length === 0 ? "\nSTATUS PARITY OK" : `\n🔴 STATUS PARITY BROKEN (${errors.length})`);
}

process.exit(errors.length ? 1 : 0);
