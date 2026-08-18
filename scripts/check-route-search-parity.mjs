#!/usr/bin/env node
/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  حارسُ مسطرةٍ واحدة لبحث المسارات: المتصفّح مقابل `admin_search_routes`   ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 *   node scripts/check-route-search-parity.mjs               # فحصٌ حيّ على القاعدة
 *   node scripts/check-route-search-parity.mjs --self-test   # إثباتُ أنه يكشف فعلاً
 *   node scripts/check-route-search-parity.mjs --json
 *
 * ── العيب الذي يحرسه ───────────────────────────────────────────────────────
 *
 * شاشةُ بحث المسارات ترشّح **مع كل حرف في المتصفّح** (‏`routes-live-filter.tsx`)
 * بدل أن تنادي الخادم لكل ضغطة. وهذا يعني أن قواعد المطابقة صارت مكتوبةً
 * **مرّتين**: مرّةً في Postgres (‏`normalize_arabic` · `arabic_strip_clitics` ·
 * `arabic_search_key` · شرطُ `where` في `admin_search_routes`) ومرّةً في
 * TypeScript.
 *
 * 🔴 **وانحرافُهما لا يُنتج خطأً يظهر.** ينتج شيئاً أسوأ: مسطرتين. يكتب المدير
 * «الاسكندريه» فلا يجد مساراً، ويضغط «بحث» فيجده — أو العكس. لا استثناء، ولا
 * سطر في سجلّ، ولا اختبارٌ يسقط. مجرّد شاشةٍ يفقد الثقة فيها.
 *
 * ── ماذا يقيس بالضبط ───────────────────────────────────────────────────────
 *
 * (١) **المفاتيح صفّاً صفّاً**: `arabic_search_key(concat_ws(...))` كما تحسبها
 *     القاعدة لكل مسار، مقابل ما تحسبه دوالُّ TypeScript **المستخرَجة من الملفّ
 *     المشحون نفسه** — لا من نسخةٍ في هذا السكربت. وكذلك النصُّ الملتصق.
 * (٢) **مجموعاتُ المعرّفات**: لكل عيّنةٍ من العيّنات أدناه — ومنها كلُّ سابقةٍ
 *     حرفاً حرفاً من كلمةٍ عربية، لأن الترشيح الحيّ يقع على السوابق لا على
 *     الكلمة التامّة — تُنادى `admin_search_routes` بهوية مشرف (D-20: بـ
 *     `set local role` لا بهوية `postgres`) وتُقارَن مجموعتُها بما يرشّحه JS.
 *
 * والطرفان يُقرآن من مصدرَيهما الحيّين: جسمُ الدالة بـ`pg_get_functiondef` من
 * القاعدة (‏D-58)، وميناءُ TypeScript باستخراجٍ نصّيّ ثم `ts.transpileModule`.
 * فلا رقمَ محفورٌ هنا يمكن أن يعتّق.
 *
 * ── لماذا سكربت عقدةٍ لا مجموعةَ SQL ───────────────────────────────────────
 *
 * لنفس سبب `check-export-status-parity.mjs` حرفاً بحرف: طرفا التطابق في عالمين،
 * ومجموعةُ SQL لا ترى ملفّ TSX إطلاقاً — فتقارن SQL بـSQL وتمرّ خضراءَ فوق
 * الانحراف الذي وُجدت لتمسكه.
 *
 * ── لا يكتب حرفاً في القاعدة ───────────────────────────────────────────────
 *
 * قراءةٌ محضة داخل `BEGIN … ROLLBACK`، ولا `insert` ولا `update`. ويُنادى على
 * قاعدة الإنتاج نفسها فلا يجوز غير ذلك.
 *
 * ⚠ **وحدُّه المعلَن:** لا يُنادى من `pnpm db:test` ولا من `next build` — وربطُه
 * بـ`package.json` بندٌ متروك للمالك (الملفّ عالي التصادم بين الوكلاء). **وسكربتٌ
 * لا يُنادى لا يحرس شيئاً** — تُقال صراحةً كما قيلت في أخيه.
 */

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(ROOT, "package.json"));
const ts = require("typescript");
require("dotenv").config({ path: path.join(ROOT, ".env.local"), quiet: true });

const FILTER_FILE = path.join(ROOT, "app/admin/subcontractors/_components/routes-live-filter.tsx");
const SEARCH_FILE = path.join(ROOT, "app/admin/subcontractors/_components/routes-search.tsx");

const args = process.argv.slice(2);
const AS_JSON = args.includes("--json");
const SELF_TEST = args.includes("--self-test");

/**
 * عيّناتُ البحث — ومنها شكوى المالك بنصّها، وسوابقُ حرفٍ حرفاً.
 *
 * والسوابقُ ليست زينة: الترشيح الحيّ يقع على «ا» ثم «ال» ثم «الا»… وهي الحالات
 * التي تفترق فيها قواعدُ تجريد السوابق (‏«ال» أداةُ تعريفٍ أم أوّلُ كلمة؟).
 */
const WORD = "الاسكندريه";
const SAMPLES = [
  "",
  ...Array.from({ length: WORD.length }, (_, i) => WORD.slice(0, i + 1)),
  "اسكندريه قاهره",
  "مطار",
  "الأسكندرية",
  "بالقاهرة",
  "والاسكندرية",
  "المطار الدولي",
  "٥",
];

/* ------------------------------------------------------------------ */
/* ١) استخراجُ الكود المشحون وتحويله إلى وحدةٍ تُنفَّذ                    */
/* ------------------------------------------------------------------ */

function lines(file) {
  return fs.readFileSync(file, "utf8").split(/\r?\n/);
}

/** كتلةُ التطبيع من `routes-live-filter.tsx`: من `const INVISIBLE` إلى ما قبل `const UUID` */
function extractNormalizer() {
  const src = lines(FILTER_FILE);
  const start = src.findIndex((l) => l.startsWith("const INVISIBLE"));
  const end = src.findIndex((l, i) => i > start && l.startsWith("const UUID"));
  if (start < 0 || end < 0) {
    throw new Error(
      "تعذّر استخراج كتلة التطبيع من routes-live-filter.tsx — تغيّرت العلامتان `const INVISIBLE` و`const UUID`. أصلح العلامة هنا، ولا تُسكِت الحارس."
    );
  }
  return src.slice(start, end).join("\n");
}

/** `readHit` من `routes-search.tsx` — وهي التي تبني `hay`، أي مدخلَ الترشيح */
function extractReadHit() {
  const src = lines(SEARCH_FILE);
  const start = src.findIndex((l) => l.startsWith("function readHit("));
  const end = src.findIndex((l, i) => i > start && l === "}");
  if (start < 0 || end < 0) {
    throw new Error(
      "تعذّر استخراج readHit من routes-search.tsx — تغيّر شكل تعريفها. أصلح العلامة هنا، ولا تُسكِت الحارس."
    );
  }
  return src.slice(start, end + 1).join("\n");
}

/** بدائلُ `asText`/`asNumber`/`pick` — منسوخةٌ عن `booking-ui.tsx` بحرفها */
const HELPERS = `
function pick(row, names) {
  if (!row) return undefined;
  for (const name of names) { const v = row[name]; if (v !== undefined && v !== null) return v; }
  return undefined;
}
const asText = (v) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);
const asNumber = (v) => { const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN; return Number.isFinite(n) ? n : null; };
`;

/** يبني وحدةً قابلةً للاستيراد من الكتلتين، مع فرصةِ طفرةٍ للاختبار الذاتي */
async function buildModule({ mutate = null } = {}) {
  let block =
    HELPERS +
    extractNormalizer() +
    "\n" +
    extractReadHit() +
    "\nexport { makeNeedle, hitsNeedle, haystackKeys, readHit };\n";

  if (mutate) {
    const mutated = mutate(block);
    if (mutated === block) throw new Error("الطفرةُ لم تغيّر شيئاً — الاختبار الذاتي بلا معنى");
    block = mutated;
  }

  const js = ts.transpileModule(block, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;

  const url = "data:text/javascript;base64," + Buffer.from(js, "utf8").toString("base64");
  return import(url);
}

/* ------------------------------------------------------------------ */
/* ٢) القياس الحيّ                                                     */
/* ------------------------------------------------------------------ */

async function measure(mod) {
  const pg = require("pg");
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL غائب — ضعه في .env.local (Session pooler لا المضيف المباشر)");

  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const problems = [];
  try {
    await client.query("begin");

    // (أ) المفاتيح صفّاً صفّاً — بلا هويّة، فهذه قراءةُ جداولٍ لا نداءُ الدالة
    const keyRows = (
      await client.query(`
        select pl.id,
               concat_ws(' ', pl.title, pl.origin_label, pl.dest_label, s.company_name, sh.title) as hay,
               public.arabic_search_key(
                 concat_ws(' ', pl.title, pl.origin_label, pl.dest_label, s.company_name, sh.title)
               ) as pg_key,
               regexp_replace(
                 public.normalize_arabic(
                   concat_ws(' ', pl.title, pl.origin_label, pl.dest_label, s.company_name, sh.title)
                 ),
                 '[^\\u0600-\\u06ffa-z0-9]+', '', 'g'
               ) as pg_glued
        from public.price_lists pl
        join public.subcontractors s on s.id = pl.subcontractor_id
        left join public.price_sheets sh on sh.id = pl.sheet_id`)
    ).rows;

    let keyMismatch = 0;
    for (const row of keyRows) {
      const js = mod.haystackKeys(row.hay ?? "");
      if (js.key !== row.pg_key || js.glued !== row.pg_glued) {
        keyMismatch += 1;
        if (problems.length < 5) {
          problems.push({
            kind: "key",
            hay: row.hay,
            pg: { key: row.pg_key, glued: row.pg_glued },
            js,
          });
        }
      }
    }

    // (ب) مجموعاتُ المعرّفات — بهوية مشرف، لأن الدالة محروسة بـ`is_admin()`
    const admin = (await client.query("select id from public.profiles where role = 'admin' limit 1"))
      .rows[0];
    if (!admin) throw new Error("لا حساب بدور admin في profiles — لا يمكن نداء الدالة بهويّة مشرف");

    // `SET` لا يقبل وسائط ⇒ `set_config(..., true)` وهي المكافئ المحليّ للمعاملة
    await client.query("set local role authenticated");
    await client.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: admin.id, role: "authenticated" }),
    ]);

    const window = (
      await client.query("select * from public.admin_search_routes('', null, null, 200, 0)")
    ).rows;
    const hits = window.map((r) => mod.readHit(r)).filter((h) => h !== null);
    const total = window.length > 0 ? Number(window[0].total_count) : 0;

    let sampleMismatch = 0;
    const samples = [];
    for (const q of SAMPLES) {
      const pgIds = (
        await client.query("select id from public.admin_search_routes($1, null, null, 200, 0)", [q])
      ).rows
        .map((r) => r.id)
        .sort();
      const needle = mod.makeNeedle(q);
      const jsIds = hits
        .filter((h) => {
          const k = mod.haystackKeys(h.hay);
          return mod.hitsNeedle(k.key, k.glued, needle);
        })
        .map((h) => h.id)
        .sort();
      const same = pgIds.length === jsIds.length && pgIds.every((v, i) => v === jsIds[i]);
      if (!same) sampleMismatch += 1;
      samples.push({ query: q, pg: pgIds.length, js: jsIds.length, same });
    }

    await client.query("rollback");
    return {
      rows: keyRows.length,
      windowRows: hits.length,
      windowTotal: total,
      windowComplete: hits.length >= total,
      keyMismatch,
      sampleMismatch,
      samples,
      problems,
    };
  } finally {
    await client.end();
  }
}

/* ------------------------------------------------------------------ */
/* ٣) التشغيل                                                          */
/* ------------------------------------------------------------------ */

function report(result) {
  if (AS_JSON) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(
    `مسارات=${result.rows} · نافذةُ صفحةٍ واحدة=${result.windowRows}/${result.windowTotal}` +
      ` (${result.windowComplete ? "كاملة ⇒ ترشيحٌ محليّ" : "ناقصة ⇒ سقوطٌ إلى الدالة بخانق"})`
  );
  console.log(`مفاتيحُ مختلفة: ${result.keyMismatch} · عيّناتٌ مختلفة: ${result.sampleMismatch}`);
  for (const s of result.samples) {
    console.log(`  ${s.same ? "MATCH" : "DIFF "}  «${s.query}»  pg=${s.pg}  js=${s.js}`);
  }
  for (const p of result.problems) {
    console.log("  اختلافُ مفتاح:", JSON.stringify(p));
  }
}

async function main() {
  if (SELF_TEST) {
    // طفرةٌ معروفةُ الجواب: نزعُ تجريد السوابق يجب أن يُحمِّر الحارس
    const mutated = await buildModule({
      mutate: (src) => src.replace(".map(stripClitics)", ".map((w) => w)"),
    });
    const bad = await measure(mutated);
    const caught = bad.keyMismatch > 0 || bad.sampleMismatch > 0;
    console.log(
      caught
        ? `SELF-TEST PASSED — الطفرةُ أُمسكت (مفاتيح=${bad.keyMismatch} · عيّنات=${bad.sampleMismatch})`
        : "SELF-TEST FAILED — الطفرةُ مرّت، فالحارس زينة"
    );
    process.exit(caught ? 0 : 1);
  }

  const mod = await buildModule();
  const result = await measure(mod);
  report(result);

  const ok = result.keyMismatch === 0 && result.sampleMismatch === 0;
  if (!AS_JSON) {
    console.log(
      ok
        ? "\nALL PASSED — مسطرةُ المتصفّح ومسطرةُ Postgres واحدة."
        : "\nFAILED — بحثُ الكتابة يخالف بحثَ الزرّ. أصلح ميناءَ التطبيع في routes-live-filter.tsx."
    );
  }
  process.exit(ok ? 0 : 1);
}

main().catch((error) => {
  console.error("تعذّر الفحص:", error instanceof Error ? error.message : error);
  process.exit(1);
});
