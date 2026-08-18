#!/usr/bin/env node
/**
 * `node scripts/state-snapshot.mjs` — يولّد `docs/STATE.md`: مرجعُ الحالة
 * الذي يقرؤه كل وكيل بعدك بدل أن يشتريه بعشرين نداء أداة.
 *
 * ⚠ **بلا اختصارٍ في `package.json` بعد** — `package.json` ليس من ملفّات الجبهة
 * التي وُلد فيها هذا السكربت، وإضافةُ سطرٍ فيه وسط عملٍ متوازٍ تمحو عمل غيري
 * صامتةً. فالأمرُ كاملٌ أعلاه، والاختصارُ `"state"` و`"state:check"` مقترحٌ
 * لمن يملك الملف.
 *
 * ── لماذا سكربتٌ لا وكيل ──────────────────────────────────────────────────
 *
 * `.claude/agents/state-snapshot.md` كُتب في 2026-08-16 لينتج هذا الملف بالضبط،
 * و**لم يُشغَّل ولا مرّة واحدة** حتى 2026-08-18. والسبب بنيويّ لا كسل: لقطةٌ
 * يُنتجها وكيل تكلّف عشرين نداء أداة وتنتهي إلى وثيقةٍ **لا يستطيع أحدٌ إعادة
 * اشتقاقها**، فتتقادم بصمت ثم تُصدَّق. ومن يقرؤها محقٌّ في ألّا يصدّقها.
 *
 * فالعلاج أن يكون المرجع **مخرَجَ أمر**: يُعاد توليده في ثوانٍ، و`--check`
 * يقول في ثانيةٍ واحدة هل ما زال مطابقاً للواقع.
 *
 * ── علاقته بـ`scripts/facts.mjs` ─────────────────────────────────────────
 *
 * `facts.mjs` يجيب أسئلة **المالك والبريف**: إعداداته، صفوفه، الرقم الحرّ،
 * حالة اللغات — نداءٌ سريع يُشغَّل في كل جلسة. وهذا الملف يجيب أسئلة **المخطَّط**:
 * كلُّ جداول `public` بمنحها وسياساتها، وكلُّ دوالها بأعمدة إرجاعها، والعقود،
 * والبوابة. (‏ولا عددَ مكتوبٌ هنا بقصد — العدد يتغيّر، والمخرَج يقيسه.)
 * لا يستبدل أحدهما الآخر، ولا يُستنسخ ما في الأول هنا.
 *
 * ── الاستعمال ─────────────────────────────────────────────────────────────
 *
 *   node scripts/state-snapshot.mjs            ← توليدٌ كامل + `tsc` وحده
 *   node scripts/state-snapshot.mjs --gate     ← ومعه `next build` و`db:test`
 *   node scripts/state-snapshot.mjs --fast     ← بلا أي بوابة (أسرع ما يكون)
 *   node scripts/state-snapshot.mjs --check    ← لا يولّد: يقول هل اللقطة طازجة
 *
 * 🔴 **البوابة الثقيلة اختياريةٌ بقصد.** `next build` دقائق، و`db:test` مَورِدٌ
 * تسلسليّ على قاعدةٍ حيّة واحدة يتنازع عليه الوكلاء. فمن يبني يقيس `tsc` على
 * عمله، و**المتحقّق التسلسلي وحده** يشغّل `--gate` مرةً على شجرةٍ ساكنة.
 *
 * ── قواعد التعديل ─────────────────────────────────────────────────────────
 *
 * (١) **قراءةٌ محضة.** لا `insert` ولا `update` ولا `delete` ولا هجرة — يُنادى
 *     على قاعدة الإنتاج نفسها ووسط عملٍ متوازٍ.
 * (٢) **لا يُطبع سرّ.** أسماء متغيّرات البيئة تُطبع، وقيمها لا — ولا جزءٌ منها.
 * (٣) **قسمٌ يسقط لا يُسقط الباقي.** كل استعلامٍ في `try`، والعطل يُكتب في
 *     الملف سطراً «لم يُقس + السبب» — و**لا يُكتب صفرٌ مكان «لا أعرف»**.
 * (٤) **الرقم بأمره.** كل جدولٍ في المخرَج يحمل الأمر الذي أنتجه، وإلا حُذف.
 */

import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(ROOT, "package.json"));
const pg = require("pg");

const ARGV = process.argv.slice(2);
const CHECK = ARGV.includes("--check");
const FULL_GATE = ARGV.includes("--gate");
const NO_GATE = ARGV.includes("--fast");
const OUT_PATH = join(ROOT, "docs", "STATE.md");

/* ═══════════════════════════════════════════════════════════════════════ *
 * أدوات
 * ═══════════════════════════════════════════════════════════════════════ */

const md5 = (s) => createHash("md5").update(String(s)).digest("hex").slice(0, 12);

/** يهرّب أنبوب الجدول كي لا ينكسر ماركداون على نوعٍ فيه `|` */
const cell = (v) => String(v ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");

function sh(command, { timeout = 60_000 } = {}) {
  const started = Date.now();
  const r = spawnSync(command, {
    shell: true,
    cwd: ROOT,
    encoding: "utf8",
    timeout,
    maxBuffer: 128 * 1024 * 1024,
  });
  return {
    command,
    code: r.status,
    ms: Date.now() - started,
    out: `${r.stdout ?? ""}${r.stderr ?? ""}`,
    timedOut: r.error?.code === "ETIMEDOUT",
  };
}

function dbUrl() {
  const line = readFileSync(join(ROOT, ".env.local"), "utf8")
    .split(/\r?\n/)
    .find((l) => l.trim().startsWith("DATABASE_URL="));
  if (!line) throw new Error("DATABASE_URL غير موجود في .env.local");
  return line.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
}

let client = null;
const q = async (text, params = []) => (await client.query(text, params)).rows;

/** كل قسمٍ معزول: عطبُه سطرٌ «لم يُقس» في المخرَج لا نهايةُ الأداة */
async function safe(title, fn, fallback = null) {
  try {
    return await fn();
  } catch (error) {
    FAILURES.push({ title, message: error.message });
    return fallback;
  }
}
const FAILURES = [];

/* ═══════════════════════════════════════════════════════════════════════ *
 * القياسات — قرصٌ وgit
 * ═══════════════════════════════════════════════════════════════════════ */

function readDisk() {
  const migDir = join(ROOT, "supabase", "migrations");
  const testDir = join(ROOT, "supabase", "tests");
  const migrations = readdirSync(migDir).filter((f) => f.endsWith(".sql")).sort();
  const suites = readdirSync(testDir).filter((f) => f.endsWith(".sql")).sort();
  const numbers = migrations
    .map((f) => Number.parseInt(f.slice(0, 4), 10))
    .filter((n) => Number.isFinite(n));
  const highest = numbers.length ? Math.max(...numbers) : 0;
  const gaps = [];
  for (let i = 1; i < highest; i += 1) {
    if (!numbers.includes(i)) gaps.push(String(i).padStart(4, "0"));
  }
  return { migrations, suites, highest, gaps, nextFree: String(highest + 1).padStart(4, "0") };
}

function readGit() {
  const head = sh("git rev-parse --short HEAD");
  const full = sh("git rev-parse HEAD");
  const branch = sh("git rev-parse --abbrev-ref HEAD");
  const status = sh("git status --short");
  // اللقطةُ مخرَجُ هذا السكربت نفسه — فعدُّها «عملاً غير مكمَّم» يجعل `--check`
  // يحمرّ على أثره هو في أول توليد. تُستثنى وحدَها، ويُقال ذلك في جدول البصمة.
  const dirty = status.out
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0)
    .filter((l) => !/docs[/\\]STATE\.md$/.test(l.trim()));
  const last = sh('git log -1 --format=%cI%x09%s');
  return {
    head: head.out.trim() || "لم يُقس",
    full: full.out.trim(),
    branch: branch.out.trim() || "لم يُقس",
    dirty,
    lastCommit: last.out.trim().replace(/	/g, "  ·  "),
  };
}

/** عقود `lib/*-types.ts`: عدد الأقسام المرقّمة + أول سطر يصف الموضوع */
function readContracts() {
  const dir = join(ROOT, "lib");
  const files = readdirSync(dir).filter((f) => f.endsWith("-types.ts")).sort();
  return files.map((f) => {
    const text = readFileSync(join(dir, f), "utf8");
    const lines = text.split(/\r?\n/);
    // أقسامٌ مرقّمة بالصيغة المستعملة في المستودع: `* ١) …` أو `// ٣) …` أو `═ ٢)`
    const sections = lines.filter((l) => /(^|\s)[*/#=\-\s]*[٠-٩0-9]+\s*[)؛.\-–—]/.test(l)
      && /^\s*(\*|\/\/|#)/.test(l)).length;
    // أول سطرٍ وصفيٍّ حقيقي داخل ترويسة التعليق
    const first =
      lines
        .slice(0, 40)
        // تُقشَّر علامات التعليق ثم جدران الإطار الصندوقي، فيبقى الوصف وحده
        .map((l) =>
          l
            .replace(/^\s*(\/\*+|\*+\/?|\/\/)\s?/, "")
            .replace(/^[\s║│]+/, "")
            .replace(/[\s║│]+$/, "")
            .trim(),
        )
        .find(
          (l) =>
            l.length > 12 &&
            // إطارٌ صندوقيّ أو خطٌّ فاصل ليس وصفاً — يُفلتَر بالمحتوى لا بالطول
            !/^[═─╔╗╚╝║│┌┐└┘├┤┬┴┼\-=*/#.\s]+$/.test(l) &&
            !/^(import|export|type|interface|const)\b/.test(l),
        ) ?? "—";
    return {
      path: `lib/${f}`,
      lines: lines.length,
      bytes: Buffer.byteLength(text),
      sections,
      first: first.slice(0, 110),
    };
  });
}

/** أسماء متغيّرات البيئة الموجودة — **بلا قيمها**، ولا جزءٍ منها */
function readEnvKeys() {
  const path = join(ROOT, ".env.local");
  if (!existsSync(path)) return null;
  const set = new Map();
  for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
    const l = raw.trim();
    if (!l || l.startsWith("#") || !l.includes("=")) continue;
    const key = l.slice(0, l.indexOf("=")).trim();
    const value = l.slice(l.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
    set.set(key, value.length > 0);
  }
  return set;
}

/* ═══════════════════════════════════════════════════════════════════════ *
 * القياسات — القاعدة
 * ═══════════════════════════════════════════════════════════════════════ */

const SQL = {
  tables: `
    select c.relname as name,
           c.relrowsecurity as rls,
           (select count(*) from pg_policy p where p.polrelid = c.oid)::int as policies,
           concat(
             case when has_table_privilege('anon', c.oid, 'SELECT')   then 'r' else '' end,
             case when has_table_privilege('anon', c.oid, 'INSERT')   then 'w' else '' end,
             case when has_table_privilege('anon', c.oid, 'UPDATE')   then 'u' else '' end,
             case when has_table_privilege('anon', c.oid, 'DELETE')   then 'd' else '' end,
             case when has_table_privilege('anon', c.oid, 'TRUNCATE') then 'T' else '' end) as anon_priv,
           concat(
             case when has_table_privilege('authenticated', c.oid, 'SELECT')   then 'r' else '' end,
             case when has_table_privilege('authenticated', c.oid, 'INSERT')   then 'w' else '' end,
             case when has_table_privilege('authenticated', c.oid, 'UPDATE')   then 'u' else '' end,
             case when has_table_privilege('authenticated', c.oid, 'DELETE')   then 'd' else '' end,
             case when has_table_privilege('authenticated', c.oid, 'TRUNCATE') then 'T' else '' end) as auth_priv
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r','p')
     order by c.relname`,

  counts: `
    select table_name as name,
           (xpath('/row/cnt/text()',
                  query_to_xml(format('select count(*) as cnt from public.%I', table_name),
                               false, true, '')))[1]::text::bigint as n
      from information_schema.tables
     where table_schema = 'public' and table_type = 'BASE TABLE'
     order by 1`,

  views: `
    select c.relname as name,
           c.relkind as kind,
           coalesce(array_to_string(c.reloptions, ','), '') as opts
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('v','m')
     order by c.relname`,

  functions: `
    select p.proname as name,
           pg_get_function_identity_arguments(p.oid) as args,
           pg_get_function_result(p.oid) as result,
           p.prosecdef as definer,
           coalesce(array_to_string(p.proconfig, ','), '') as config,
           has_function_privilege('anon', p.oid, 'execute') as anon,
           has_function_privilege('authenticated', p.oid, 'execute') as auth,
           has_function_privilege('service_role', p.oid, 'execute') as svc,
           (p.proacl is null) as acl_default
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f'
     order by p.proname, pg_get_function_identity_arguments(p.oid)`,

  triggers: `
    select c.relname as table_name, t.tgname as name, pr.proname as fn
      from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
      join pg_proc pr on pr.oid = t.tgfoid
     where n.nspname = 'public' and not t.tgisinternal
     order by c.relname, t.tgname`,
};

/** يختصر `TABLE(a integer, b text)` إلى أسماء الأعمدة — وهي ما يُراجَع (D-53) */
function shortResult(result) {
  const m = /^TABLE\((.*)\)$/s.exec(result ?? "");
  if (!m) return result ?? "—";
  const cols = [];
  let depth = 0;
  let buf = "";
  for (const ch of m[1]) {
    if (ch === "(") depth += 1;
    if (ch === ")") depth -= 1;
    if (ch === "," && depth === 0) {
      cols.push(buf.trim());
      buf = "";
    } else buf += ch;
  }
  if (buf.trim()) cols.push(buf.trim());
  const names = cols.map((c) => c.trim().split(/\s+/)[0]);
  const shown = names.slice(0, 8).join(" · ");
  return `TABLE(${shown}${names.length > 8 ? ` … +${names.length - 8}` : ""})`;
}

/* ═══════════════════════════════════════════════════════════════════════ *
 * البوابة
 * ═══════════════════════════════════════════════════════════════════════ */

function runGate() {
  const results = [];
  if (NO_GATE) return results;

  const tsc = sh("npx tsc --noEmit", { timeout: 300_000 });
  const tscErrors = (tsc.out.match(/error TS\d+/g) ?? []).length;
  results.push({
    label: "أنواع TypeScript",
    command: "npx tsc --noEmit",
    code: tsc.code,
    ms: tsc.ms,
    detail: tsc.code === 0 ? "صفر خطأ" : `${tscErrors} خطأ`,
    tail: tsc.code === 0 ? "" : tsc.out.split(/\r?\n/).filter(Boolean).slice(0, 12).join("\n"),
  });

  const leaks = sh("node scripts/check-client-value-leaks.mjs", { timeout: 300_000 });
  results.push({
    label: 'تسرّب قيم `"use client"`',
    command: "pnpm check:rsc-leaks",
    code: leaks.code,
    ms: leaks.ms,
    detail: leaks.code === 0 ? "لا تسرّب" : "تسرّبٌ مُمسَك",
    tail: leaks.code === 0 ? "" : leaks.out.split(/\r?\n/).filter(Boolean).slice(0, 12).join("\n"),
  });

  if (!FULL_GATE) return results;

  const build = sh("npx next build", { timeout: 900_000 });
  const routes = (build.out.match(/^[\s│├└┌]*[ƒ○●◐λ]\s+\//gm) ?? []).length;
  results.push({
    label: "بناء Next",
    command: "npx next build",
    code: build.code,
    ms: build.ms,
    detail: build.code === 0 ? `أخضر · ${routes || "لم يُقس"} مساراً في جدول المسارات` : "أحمر",
    tail: build.code === 0 ? "" : build.out.split(/\r?\n/).filter(Boolean).slice(-15).join("\n"),
  });

  const db = sh("node scripts/db-test.mjs", { timeout: 1_800_000 });
  const blocks = db.out.split(/^▶ /m).slice(1);
  const passed = blocks.filter((b) => b.includes("ALL PASSED")).length;
  const failedNames = blocks
    .filter((b) => !b.includes("ALL PASSED"))
    .map((b) => b.split(/\r?\n/)[0].trim());
  const leak = /صفر تسرّب/.test(db.out) ? "صفر تسرّب" : "🔴 تسرّبٌ أو تعذّر قياسه";
  results.push({
    label: "مجموعات SQL",
    command: "node scripts/db-test.mjs   (بلا أنبوب — الأنبوب يخفي رمز الخروج)",
    code: db.code,
    ms: db.ms,
    detail: `${passed}/${blocks.length} تطبع ALL PASSED · ${leak}`,
    tail: failedNames.length
      ? `الساقطة: ${failedNames.join(" · ")}\n` +
        db.out.split(/\r?\n/).filter((l) => l.includes("❌")).slice(0, 10).join("\n")
      : "",
  });

  return results;
}

/* ═══════════════════════════════════════════════════════════════════════ *
 * بصمةُ الطزاجة
 * ═══════════════════════════════════════════════════════════════════════ */

/**
 * إشاراتٌ **بنيوية** يعني اختلافُها أن اللقطة صارت كاذبة،
 * وإشاراتٌ **حيّة** يتحرّك رقمها بعمل المالك الطبيعي فلا تُحمِّر البوابة.
 *
 * والفصلُ بينهما ليس تجميلاً: الدرس ١٣ في `LESSONS.md` — «الإنذار الذي يرنّ
 * على ضجيج يصمت يوم الحريق». فاحصٌ يحمرّ لأن عميلاً حجز يُعلَّم قارئه تجاهُله.
 */
const STRUCTURAL = [
  ["head", "التزام git", "git rev-parse --short HEAD"],
  ["dirty", "ملفات غير مكمَّمة", "git status --short   (‏عدا `docs/STATE.md` نفسه)"],
  ["migrations_disk", "هجرات على القرص", "ls supabase/migrations/*.sql | wc -l"],
  ["migrations_highest", "أعلى رقم هجرة", "أعلى بادئةٍ رقمية في المجلد نفسه"],
  ["ledger_rows", "صفوف دفتر الهجرات", "select count(*) from public.schema_migrations"],
  ["suites_disk", "مجموعات اختبار", "ls supabase/tests/*.sql | wc -l"],
  ["tables", "جداول public", "pg_class where relkind in ('r','p')"],
  ["views", "اطّلاعات public", "pg_class where relkind in ('v','m')"],
  ["functions", "دوال public", "pg_proc where prokind='f'"],
  ["triggers", "مُشغّلات public", "pg_trigger where not tgisinternal"],
  ["contracts", "بصمة ملفات العقود", "md5 على «المسار:الحجم» لكل `lib/*-types.ts`"],
];
const LIVE = [
  ["bookings", "حجوزات", "select count(*) from public.bookings"],
  ["notifications", "إشعارات", "select count(*) from public.notifications"],
  [
    "translations_published",
    "ترجمات منشورة (كل اللغات)",
    "select count(*) from public.translations where status='published'",
  ],
  ["audit_log", "صفوف سجلّ التدقيق", "select count(*) from public.audit_log"],
];

async function fingerprint() {
  const disk = readDisk();
  const git = readGit();
  const contracts = readContracts();
  const fp = {
    generated_at: new Date().toISOString(),
    head: git.head,
    dirty: git.dirty.length,
    migrations_disk: disk.migrations.length,
    migrations_highest: String(disk.highest).padStart(4, "0"),
    suites_disk: disk.suites.length,
    contracts: md5(contracts.map((c) => `${c.path}:${c.bytes}`).join("|")),
  };
  const one = async (key, sql) => {
    try {
      fp[key] = Number((await q(sql))[0].n);
    } catch (error) {
      fp[key] = null;
      FAILURES.push({ title: `بصمة/${key}`, message: error.message });
    }
  };
  await one("ledger_rows", "select count(*)::int n from public.schema_migrations");
  await one(
    "tables",
    "select count(*)::int n from pg_class c join pg_namespace s on s.oid=c.relnamespace where s.nspname='public' and c.relkind in ('r','p')",
  );
  await one(
    "views",
    "select count(*)::int n from pg_class c join pg_namespace s on s.oid=c.relnamespace where s.nspname='public' and c.relkind in ('v','m')",
  );
  await one(
    "functions",
    "select count(*)::int n from pg_proc p join pg_namespace s on s.oid=p.pronamespace where s.nspname='public' and p.prokind='f'",
  );
  await one(
    "triggers",
    "select count(*)::int n from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace s on s.oid=c.relnamespace where s.nspname='public' and not t.tgisinternal",
  );
  await one("bookings", "select count(*)::int n from public.bookings");
  await one("notifications", "select count(*)::int n from public.notifications");
  await one(
    "translations_published",
    "select count(*)::int n from public.translations where status='published'",
  );
  await one("audit_log", "select count(*)::int n from public.audit_log");
  return fp;
}

const FP_MARK = "STATE-FINGERPRINT";

function readStoredFingerprint() {
  if (!existsSync(OUT_PATH)) return null;
  const text = readFileSync(OUT_PATH, "utf8");
  const m = new RegExp(`<!--\\s*${FP_MARK}\\s*(\\{[\\s\\S]*?\\})\\s*-->`).exec(text);
  if (!m) return null;
  try {
    return JSON.parse(m[1]);
  } catch {
    return null;
  }
}

/* ═══════════════════════════════════════════════════════════════════════ *
 * الوضع الأول — `--check`: هل اللقطة ما زالت تصف الواقع؟
 * ═══════════════════════════════════════════════════════════════════════ */

async function modeCheck() {
  const stored = readStoredFingerprint();
  if (!stored) {
    console.error(
      `❌ لا لقطةَ لأفحصها: ${relative(ROOT, OUT_PATH)} غير موجود أو بلا بصمة.\n` +
        "   ولّدها أولاً:  node scripts/state-snapshot.mjs",
    );
    return 2;
  }
  const now = await fingerprint();
  const ageMs = Date.now() - Date.parse(stored.generated_at);
  const ageH = ageMs / 3_600_000;

  const rows = [];
  let structuralDrift = 0;
  for (const [key, label] of STRUCTURAL) {
    const a = stored[key];
    const b = now[key];
    const same = String(a) === String(b);
    if (!same) structuralDrift += 1;
    rows.push([label, key, a ?? "—", b ?? "—", same ? "مطابق" : "🔴 انحرف", "بنيوي"]);
  }
  for (const [key, label] of LIVE) {
    const a = stored[key];
    const b = now[key];
    const same = String(a) === String(b);
    rows.push([label, key, a ?? "—", b ?? "—", same ? "مطابق" : "تحرّك (متوقَّع)", "حيّ"]);
  }

  const w = (s, n) => String(s).padEnd(n);
  console.log("");
  console.log(`  اللقطة  : ${relative(ROOT, OUT_PATH)}`);
  console.log(`  وُلّدت   : ${stored.generated_at}   (عمرها ${ageH.toFixed(1)} ساعة)`);
  console.log("");
  console.log(`  ${w("الإشارة", 26)}${w("في اللقطة", 14)}${w("الآن", 14)}الحكم`);
  console.log(`  ${"─".repeat(70)}`);
  for (const [label, , a, b, verdict, kind] of rows) {
    console.log(`  ${w(label, 26)}${w(a, 14)}${w(b, 14)}${verdict}${kind === "حيّ" ? "" : ""}`);
  }
  console.log("");
  if (structuralDrift === 0) {
    console.log("  ✅ لا انحرافَ بنيويّ — اللقطة ما زالت تصف المخطَّط والشجرة كما هما.");
    console.log("     (والإشارات الحيّة تتحرّك بعمل المالك، ولا تُبطلها.)");
    return 0;
  }
  console.log(`  🔴 ${structuralDrift} انحرافاً بنيوياً — اللقطة صارت تصف ماضياً.`);
  console.log("     أعِد التوليد:  node scripts/state-snapshot.mjs");
  return 1;
}

/* ═══════════════════════════════════════════════════════════════════════ *
 * الوضع الثاني — التوليد
 * ═══════════════════════════════════════════════════════════════════════ */

async function modeGenerate() {
  const disk = readDisk();
  const git = readGit();
  const contracts = readContracts();
  const env = readEnvKeys();

  const ledger = await safe("دفتر الهجرات", async () => {
    const rows = await q("select name from public.schema_migrations order by name");
    const inDb = rows.map((r) => r.name);
    return {
      applied: inDb.length,
      orphans: inDb.filter((n) => !disk.migrations.includes(n)),
      missing: disk.migrations.filter((n) => !inDb.includes(n)),
    };
  });

  const tables = await safe("جداول", () => q(SQL.tables), []);
  const counts = await safe("أعداد الصفوف", () => q(SQL.counts), []);
  const views = await safe("اطّلاعات", () => q(SQL.views), []);
  const functions = await safe("دوال", () => q(SQL.functions), []);
  const triggers = await safe("مُشغّلات", () => q(SQL.triggers), []);

  const ops = await safe("الحالة التشغيلية", async () => {
    const grab = async (sql) => {
      try {
        return (await q(sql))[0];
      } catch {
        return null;
      }
    };
    return {
      locales: await safe("اللغات", () => q("select code, published_count from public.enabled_locales()"), null),
      translations: await safe(
        "الترجمات",
        () => q("select locale, status, count(*)::int n from public.translations group by 1,2 order by 1,2"),
        null,
      ),
      seo: await grab("select value from public.site_settings where key='seo' limit 1"),
      providers: await safe(
        "مزوّدات الدفع",
        () => q("select provider, enabled from public.payment_providers order by sort, provider"),
        null,
      ),
      channels: await safe(
        "قنوات الإشعارات",
        () => q("select ch as channel, count(*)::int n from public.notifications, unnest(channels) ch group by 1 order by 1"),
        null,
      ),
      notifStatus: await safe(
        "حالات الإشعارات",
        () => q("select status, count(*)::int n from public.notifications group by 1 order by 2 desc"),
        null,
      ),
    };
  }, null);

  const gate = runGate();
  const fp = await fingerprint();

  /* ── بناء المستند ───────────────────────────────────────────────────── */

  const countOf = new Map(counts.map((r) => [r.name, r.n]));
  const md = [];
  const P = (s = "") => md.push(s);

  P("# حالة المشروع — لقطةٌ **مولَّدة**، لا مكتوبة");
  P("");
  P("> ⚠ **لا تُحرَّر بيد.** هذا الملف مخرَجُ أمرٍ واحد، وأي تعديل يدويّ فيه يضيع");
  P("> في أول توليد. ومن أراد تصحيح رقمٍ هنا يصحّح **الاستعلام** في");
  P("> `scripts/state-snapshot.mjs` لا السطر.");
  P("");
  P("| الأمر | ماذا يفعل | كلفته |");
  P("|---|---|---|");
  P("| `node scripts/state-snapshot.mjs` | يعيد كتابة هذا الملف كاملاً + `tsc` و`check:rsc-leaks` | ثوانٍ + دقيقة |");
  P("| `node scripts/state-snapshot.mjs --fast` | توليدٌ بلا أي بوابة | ثوانٍ |");
  P("| `node scripts/state-snapshot.mjs --gate` | ومعه `next build` و`db:test` — **للمتحقّق التسلسلي وحده** | دقائق |");
  P("| `node scripts/state-snapshot.mjs --check` | **لا يولّد**: يقول هل ما زالت اللقطة تطابق الواقع، ويخرج بـ`1` إن انحرفت بنيوياً | ثانية |");
  P("");
  P("🔴 **قبل أن تبني على رقمٍ من هنا، شغّل `--check`.** لقطةٌ لا يُعرف عمرها أسوأ");
  P("من غيابها: من يقرؤها يصدّقها، ولا شيء يقول له إنها كذبت.");
  P("");
  P("**وما ليس في هذا الملف:** إعدادات المالك وصفوفه الحيّة والرقم الحرّ للهجرات —");
  P("مكانها `node scripts/facts.mjs`، ولا تُستنسخ هنا كي لا يتناقض مرجعان.");
  P("");
  P("---");
  P("");

  /* §١ */
  P("## ١) الطابع الزمني والالتزام");
  P("");
  P("```");
  P("git rev-parse --short HEAD  ·  git status --short  ·  git log -1");
  P("```");
  P("");
  P("| المقياس | القيمة |");
  P("|---|---|");
  P(`| وُلّدت | \`${fp.generated_at}\` |`);
  P(`| الالتزام | \`${cell(git.head)}\` على \`${cell(git.branch)}\` |`);
  P(`| آخر كمّة | ${cell(git.lastCommit) || "لم يُقس"} |`);
  P(`| ملفات غير مكمَّمة | **${git.dirty.length}** |`);
  P("");
  if (git.dirty.length === 0) {
    P("✅ **الشجرة نظيفة** — كل ما تقرؤه أدناه يصف ما هو مكمَّم.");
  } else {
    P("🔴 **الشجرة فيها عملٌ غير مكمَّم** — ونتيجة البوابة أدناه تصف *هذه* الشجرة لا الالتزام:");
    P("");
    P("| الحالة | الملف |");
    P("|---|---|");
    for (const l of git.dirty.slice(0, 40)) {
      P(`| \`${cell(l.slice(0, 2).trim() || "??")}\` | \`${cell(l.slice(2).trim())}\` |`);
    }
    if (git.dirty.length > 40) P(`| … | و${git.dirty.length - 40} ملفاً آخر |`);
  }
  P("");

  /* §٢ */
  P("## ٢) المخطَّط — من الكتالوج لا من ملفات الهجرة");
  P("");
  P("```sql");
  P("select c.relname, c.relrowsecurity, (select count(*) from pg_policy p where p.polrelid=c.oid),");
  P("       has_table_privilege('anon'|'authenticated', c.oid, 'SELECT|INSERT|UPDATE|DELETE|TRUNCATE')");
  P("  from pg_class c join pg_namespace n on n.oid=c.relnamespace");
  P(" where n.nspname='public' and c.relkind in ('r','p');");
  P("-- والأعداد: query_to_xml('select count(*) …') لكل جدول في نداءٍ واحد");
  P("```");
  P("");
  P("**المنح تُقرأ بالحروف:** `r`=select · `w`=insert · `u`=update · `d`=delete · `T`=**truncate**.");
  P("");
  P("🔴 **و`T` هي الحرف الذي يُقرأ أولاً:** RLS **لا تحرس `TRUNCATE`** إطلاقاً، فالمنحة");
  P("هي الحارس لا السياسة (`LESSONS` القاعدة ١٦ · الهجرة `0041`). جدولٌ سياساته محكمة");
  P("و`T` مقابله لـ`anon` = جدولٌ يستطيع أي زائرٍ تفريغه.");
  P("");
  if (tables.length === 0) {
    P("> ⚠ **لم يُقس** — تعذّر الاستعلام (انظر «ما تعذّر قياسه» في آخر الملف).");
  } else {
    P("| الجدول | صفوف | RLS | سياسات | `anon` | `authenticated` |");
    P("|---|---:|:---:|---:|---|---|");
    for (const t of tables) {
      const n = countOf.has(t.name) ? Number(countOf.get(t.name)).toLocaleString("en-US") : "لم يُقس";
      P(
        `| \`${cell(t.name)}\` | ${n} | ${t.rls ? "✅" : "🔴 مطفأة"} | ${t.policies} | ${
          t.anon_priv ? `\`${t.anon_priv}\`` : "—"
        } | ${t.auth_priv ? `\`${t.auth_priv}\`` : "—"} |`,
      );
    }
    P("");
    P(`**المجموع: ${tables.length} جدولاً.**`);
  }
  P("");

  P("### ٢ب) الاطّلاعات");
  P("");
  P("```sql");
  P("select c.relname, c.relkind, array_to_string(c.reloptions, ',')");
  P("  from pg_class c join pg_namespace n on n.oid=c.relnamespace");
  P(" where n.nspname='public' and c.relkind in ('v','m');");
  P("```");
  P("");
  P("`security_invoker=true` يعني أن الاطّلاع **يرث سياسات جداوله**؛ وغيابُه يعني أنه");
  P("يعمل بصلاحيات مالكه — أي يتجاوز RLS بحكم التعريف.");
  P("");
  if (views.length === 0) {
    P("> ⚠ **لم يُقس**.");
  } else {
    P("| الاطّلاع | النوع | الخيارات |");
    P("|---|---|---|");
    for (const v of views) {
      P(
        `| \`${cell(v.name)}\` | ${v.kind === "m" ? "مُتحقَّق" : "اطّلاع"} | ${
          v.opts ? `\`${cell(v.opts)}\`` : "🔴 بلا `security_invoker`"
        } |`,
      );
    }
    P("");
    P(`**المجموع: ${views.length}.**`);
  }
  P("");

  /* §٣ */
  const apiFns = functions.filter((f) => f.result !== "trigger");
  const trgFns = functions.filter((f) => f.result === "trigger");
  P("## ٣) الدوال");
  P("");
  P("```sql");
  P("select p.proname, pg_get_function_identity_arguments(p.oid), pg_get_function_result(p.oid),");
  P("       p.prosecdef, p.proconfig, has_function_privilege('anon'|'authenticated', p.oid, 'execute')");
  P("  from pg_proc p join pg_namespace n on n.oid=p.pronamespace");
  P(" where n.nspname='public' and p.prokind='f';");
  P("```");
  P("");
  P("**لا أجسام هنا بقصد.** من يحتاج جسماً يقرؤه من `pg_get_functiondef` — لا من ملف");
  P("هجرة (**D-58**): الهجرة لقطةٌ من تاريخها وقد استُبدلت بعدها، وأخطر انحدارٍ في");
  P("المشروع وُلد من نسخ جسمٍ من `0013` بعد أن استبدلته `0014`.");
  P("");
  P("**وعمودُ الإرجاع يُقرأ حقلاً حقلاً** (**D-53**): أعلى عيبٍ في دورةٍ كاملة كان");
  P("حقلاً أدرجته المواصفة في نوع إرجاع دالةٍ يقرؤها المتعهد. اسأل عن كل اسمٍ هنا:");
  P("**من يقرؤه، وماذا يفعل به من لا يحتاجه؟**");
  P("");
  P("`D` = `security definer` (تتجاوز RLS بحكم التعريف) · `a` = ممنوحة لـ`anon` ·");
  P("`u` = ممنوحة لـ`authenticated` — **و`authenticated` ليست الإدارة أبداً: كل متعهدٍ واحدٌ منهم** (D-20).");
  P("");
  if (apiFns.length === 0) {
    P("> ⚠ **لم يُقس**.");
  } else {
    P("| الدالة | الوسائط | تُرجع | الأعلام |");
    P("|---|---|---|---|");
    for (const f of apiFns) {
      const flags =
        (f.definer ? "D" : "") + (f.anon ? "a" : "") + (f.auth ? "u" : "") + (f.svc ? "s" : "");
      P(
        `| \`${cell(f.name)}\` | ${f.args ? `\`${cell(f.args)}\`` : "—"} | ${cell(
          shortResult(f.result),
        )} | \`${flags || "—"}\` |`,
      );
    }
    P("");
    P(
      `**المجموع: ${apiFns.length} دالةً قابلةً للنداء** — منها **${
        apiFns.filter((f) => f.definer).length
      }** \`definer\`، و**${apiFns.filter((f) => f.definer && f.auth).length}** منها ممنوحةٌ لـ\`authenticated\`.`,
    );
  }
  P("");
  P("### ٣ب) دوال المُشغّلات");
  P("");
  if (trgFns.length === 0) {
    P("> ⚠ **لم يُقس**.");
  } else {
    P(`${trgFns.length} دالةً ترجع \`trigger\` — أسماؤها فقط، فهي لا تُنادى مباشرةً:`);
    P("");
    P("```");
    P(trgFns.map((f) => f.name).join(" · "));
    P("```");
    P("");
    P(`و**${triggers.length}** مُشغّلاً مربوطاً بها على ${new Set(triggers.map((t) => t.table_name)).size} جدولاً.`);
  }
  P("");

  /* §٤ */
  P("## ٤) الهجرات");
  P("");
  P("```bash");
  P("ls supabase/migrations/*.sql | wc -l");
  P("psql -c 'select count(*) from public.schema_migrations'");
  P("```");
  P("");
  P("| المقياس | القيمة |");
  P("|---|---|");
  P(`| ملفات على القرص | **${disk.migrations.length}** |`);
  P(`| صفوف في الدفتر | ${ledger ? `**${ledger.applied}**` : "لم يُقس"} |`);
  P(`| آخر ملف | \`${cell(disk.migrations.at(-1) ?? "—")}\` |`);
  P(`| أعلى رقم مستعمَل | \`${String(disk.highest).padStart(4, "0")}\` |`);
  P(`| فجوات الترقيم | ${disk.gaps.length ? disk.gaps.map((g) => `\`${g}\``).join(" · ") : "لا شيء"} |`);
  P(`| في الدفتر بلا ملف | ${ledger ? (ledger.orphans.length ? `🔴 ${ledger.orphans.join(" · ")}` : "لا شيء") : "لم يُقس"} |`);
  P(`| على القرص بلا تطبيق | ${ledger ? (ledger.missing.length ? `🔴 ${ledger.missing.join(" · ")}` : "لا شيء") : "لم يُقس"} |`);
  P(`| الرقم الحرّ التالي | \`${disk.nextFree}\` |`);
  P("");
  P("🔴 **والرقم الحرّ أعلاه معلومةٌ لا إذن.** رقمُ هجرتك **يُسنَد في بريفك**، ولا");
  P("يُشتقّ. اشتقّه وكيلان مرةً كلٌّ على حدة فأخذا `0100` معاً، فجرى جسمُ هجرةٍ مرتين");
  P("وقضى المالك يوماً بدفترٍ يخالف القرص.");
  P("");
  P(`⚠ **والعدد لا يساوي أعلى رقم** ما دامت فجوة \`${disk.gaps.join("`/`") || "—"}\` قائمة — ولا تُملأ.`);
  P("");

  /* §٥ */
  P("## ٥) العقود — `lib/*-types.ts`");
  P("");
  P("```bash");
  P("ls lib/*-types.ts   # والأقسام تُعدّ من ترويسات التعليق المرقّمة داخل كل ملف");
  P("```");
  P("");
  P("**هذه خريطة القرارات المحسومة.** ملفُّ العقد يُقرأ **قبل** لمس مجاله، ويُحدَّث");
  P("**مع** الهجرة لا بعدها (النمط ٤ في `LESSONS.md`).");
  P("");
  P("| العقد | أسطر | أقسام | موضوعه |");
  P("|---|---:|---:|---|");
  for (const c of contracts) {
    P(`| \`${cell(c.path)}\` | ${c.lines} | ${c.sections} | ${cell(c.first)} |`);
  }
  P("");
  P(`**المجموع: ${contracts.length} عقداً.**`);
  P("");

  /* §٦ */
  P("## ٦) البوابة");
  P("");
  P("🔴 **البُناة لا يشغّلون البوابة الكاملة.** قِيس ثلاث مرات في أسبوعٍ واحد أن");
  P("بوابةَ بانٍ أُبطلت بكتابة وكلاء آخرين أثناءها — فأنتجت **لا شيء** وكلّفت");
  P("`next build` كاملاً و`db:test` كاملاً على قاعدةٍ واحدة متنازَع عليها.");
  P("**البُناة يقيسون `tsc` على عملهم، والمتحقّق التسلسلي يقيس مرةً على شجرةٍ ساكنة.**");
  P("");
  if (gate.length === 0) {
    P("> **لم تُقس في هذه الجولة** (‏`--fast`). والأوامر:");
    P("> `npx tsc --noEmit` · `pnpm check:rsc-leaks` · `npx next build` · `node scripts/db-test.mjs`");
  } else {
    P("| الفحص | الأمر | الخروج | الحصيلة | الزمن |");
    P("|---|---|:---:|---|---:|");
    for (const g of gate) {
      P(
        `| ${g.label} | \`${cell(g.command)}\` | ${g.code === 0 ? "✅ 0" : `🔴 ${g.code}`} | ${cell(
          g.detail,
        )} | ${(g.ms / 1000).toFixed(0)}ث |`,
      );
    }
    if (!FULL_GATE) {
      P("");
      P("> ⚠ **`next build` و`db:test` لم يُقاسا في هذه الجولة** — وهذا هو الافتراضي");
      P("> بقصد. من يحتاجهما يشغّل `--gate` على شجرةٍ ساكنة، ولا يستشهد بغيابهما.");
    }
    const bad = gate.filter((g) => g.code !== 0 && g.tail);
    if (bad.length) {
      P("");
      P("### ما سقط، بنصّه");
      for (const g of bad) {
        P("");
        P(`**${g.label}** — \`${cell(g.command)}\``);
        P("");
        P("```");
        P(g.tail);
        P("```");
      }
    }
  }
  P("");
  P("⚠ **وخطأ `eslint` الوحيد المعروف في `app/admin/set-password/page.tsx:40` سابقٌ**");
  P("لكل عملٍ جارٍ — ليس أثر أحد. يُقاس بـ`npx eslint app/admin/set-password/page.tsx`.");
  P("");

  /* §٧ */
  P("## ٧) الحالة التشغيلية");
  P("");
  P("### الأعداد التي يسأل عنها كل وكيل");
  P("");
  P("مأخوذةٌ من نفس نداء `query_to_xml` في §٢ — **لا استعلامَ ثانياً لها**، فلا");
  P("يتناقض رقمان لشيءٍ واحد (النمط ٨ في `LESSONS.md`).");
  P("");
  P("| الكيان | صفوف |");
  P("|---|---:|");
  for (const t of [
    "pages",
    "sections",
    "vehicle_classes",
    "tariffs",
    "subcontractors",
    "price_lists",
    "bookings",
    "quote_requests",
    "translations",
    "notifications",
    "profiles",
  ]) {
    P(`| \`${t}\` | ${countOf.has(t) ? Number(countOf.get(t)).toLocaleString("en-US") : "لا وجود للجدول"} |`);
  }
  P("");
  if (!ops) {
    P("> ⚠ **باقي §٧ لم يُقس**.");
  } else {
    P("### اللغات");
    P("");
    P("```sql");
    P("select code, published_count from public.enabled_locales();");
    P("select locale, status, count(*) from public.translations group by 1,2;");
    P("```");
    P("");
    if (ops.locales) {
      P("| اللغة | معلَنة للزوّار | منشور |");
      P("|---|:---:|---:|");
      for (const l of ops.locales) P(`| \`${cell(l.code)}\` | ✅ | ${l.published_count} |`);
      P("");
    }
    if (ops.translations) {
      P("| اللغة | الحالة | صفوف |");
      P("|---|---|---:|");
      for (const t of ops.translations) P(`| \`${cell(t.locale)}\` | ${cell(t.status)} | ${t.n} |`);
      P("");
    }
    const indexable = ops.seo?.value?.robots?.indexable;
    const enPub = Number(ops.locales?.find((l) => l.code === "en")?.published_count ?? 0);
    P(`**السيو:** \`site_settings['seo'].robots.indexable = ${String(indexable)}\``);
    P("");
    if (indexable === false && enPub > 0) {
      P("🔴 **الإنجليزية حيّةٌ للزوّار و`noindex` وحده يحجبها عن جوجل.**");
      P("**لا تنشر صفَّ ترجمةٍ واحداً ما لم يقل بريفك ذلك صراحةً، ولا تلمس `locales`.**");
      P("وارفعُ الـ`noindex` قرارُ مالكٍ لا قرارُ جلسة — وموقعٌ يبقى عليه لا يظهر في جوجل أبداً.");
    } else if (indexable !== false) {
      P("🔴 **الموقع قابلٌ للفهرسة الآن** — تحقّق أن هذا مقصود.");
    }
    P("");
    if (ops.providers) {
      const on = ops.providers.filter((p) => p.enabled).map((p) => p.provider);
      P(
        `**مزوّدات الدفع:** ${ops.providers.length} مزوّداً — ${
          on.length ? `🔴 **مُشتعل: ${on.join(" · ")}**` : "**كلها مطفأة** ✅"
        }  ·  \`select provider, enabled from payment_providers\``,
      );
      P("");
    }
    if (ops.channels) {
      P(
        "**قنوات الإشعارات — صفوفٌ فعلية بالقناة:** " +
          ops.channels.map((c) => `\`${cell(c.channel)}\` ${c.n}`).join(" · ") +
          "  ·  `select ch, count(*) from notifications, unnest(channels) ch group by 1`",
      );
      P("");
    }
    if (ops.notifStatus) {
      P(
        "**وبالحالة:** " +
          ops.notifStatus.map((s) => `\`${cell(s.status)}\` ${s.n}`).join(" · ") +
          "  ·  `select status, count(*) from notifications group by 1`",
      );
      P("");
    }
  }
  if (env) {
    P("**مفاتيح البيئة — الأسماء وحدها، ولا قيمة تُطبع:**");
    P("");
    P("| المفتاح | مضبوط؟ |");
    P("|---|:---:|");
    for (const key of [
      "DATABASE_URL",
      "NEXT_PUBLIC_SUPABASE_URL",
      "SUPABASE_SERVICE_ROLE_KEY",
      "TELEGRAM_BOT_TOKEN",
      "RESEND_API_KEY",
      "CRON_SECRET",
      "ALLOW_TEST_PAYMENTS",
    ]) {
      const has = env.get(key);
      P(`| \`${key}\` | ${has === true ? "✅" : has === false ? "🔴 فارغ" : "🔴 غائب"} |`);
    }
    P("");
    P("⚠ **و«مضبوط» ليست «يعمل».** القاعدة ١٨ في `handover/INDEX.md`: الحقل المملوء");
    P("يقول إن البيانات وصلت، لا إن المسار يعمل — والفرق يُقاس بفتح الصفحة.");
    P("");
  }

  /* §٨ */
  P("## ٨) 🔴 ما هو مكسورٌ الآن — مقيسٌ، بلا رأي");
  P("");
  const broken = [];
  if (ledger?.orphans?.length) {
    broken.push([`دفتر الهجرات فيه ${ledger.orphans.length} صفاً بلا ملف`, ledger.orphans.join(" · ")]);
  }
  if (ledger?.missing?.length) {
    broken.push([`${ledger.missing.length} هجرةً على القرص بلا تطبيق`, ledger.missing.join(" · ")]);
  }
  const truncatable = tables.filter((t) => t.anon_priv.includes("T") || t.auth_priv.includes("T"));
  if (truncatable.length) {
    broken.push([
      `${truncatable.length} جدولاً عليه منحة \`TRUNCATE\` لدورٍ مستخدم — و RLS لا تحرسها`,
      truncatable.map((t) => t.name).join(" · "),
    ]);
  }
  const rlsOff = tables.filter((t) => !t.rls);
  if (rlsOff.length) {
    broken.push([`${rlsOff.length} جدولاً بلا RLS`, rlsOff.map((t) => t.name).join(" · ")]);
  }
  const noPolicy = tables.filter((t) => t.rls && t.policies === 0 && (t.anon_priv || t.auth_priv));
  if (noPolicy.length) {
    broken.push([
      `${noPolicy.length} جدولاً عليه RLS بلا سياسةٍ واحدة ومعه منحةٌ لدورٍ مستخدم`,
      noPolicy.map((t) => t.name).join(" · "),
    ]);
  }
  const naked = views.filter((v) => !v.opts.includes("security_invoker"));
  if (naked.length) {
    broken.push([`${naked.length} اطّلاعاً بلا \`security_invoker\``, naked.map((v) => v.name).join(" · ")]);
  }
  const noSearchPath = apiFns.filter((f) => f.definer && !/search_path=/.test(f.config));
  if (noSearchPath.length) {
    broken.push([
      `${noSearchPath.length} دالة \`definer\` بلا \`set search_path\``,
      noSearchPath.map((f) => f.name).join(" · "),
    ]);
  }
  for (const g of gate.filter((g) => g.code !== 0)) {
    broken.push([`${g.label} أحمر (خروج ${g.code})`, g.detail]);
  }
  if (env && env.get("RESEND_API_KEY") !== true) {
    broken.push(["قناة البريد مطفأة", "`RESEND_API_KEY` غير مضبوط — بيد المالك، لا بيد جلسة"]);
  }
  for (const f of FAILURES) broken.push([`لم يُقس: ${f.title}`, f.message]);

  if (broken.length === 0) {
    P("لا شيء من الفحوص أعلاه أحمرّ في هذه الجولة.");
    P("");
    P("⚠ **وهذا يقول ما قِيس، لا ما هو سليم.** الفحوص هنا بنيوية (منح · سياسات ·");
    P("`search_path` · دفتر). ولا واحدَ منها يرى **ميزةً بلا زرٍّ يناديها** ولا **نصّاً");
    P("يَعِد بما لا يُنفَّذ** — وهما أخطر ما أمسكته المراجعات في هذا المستودع.");
  } else {
    P("| ما هو مكسور | التفصيل |");
    P("|---|---|");
    for (const [what, detail] of broken) P(`| ${cell(what)} | ${cell(detail)} |`);
  }
  P("");
  P("---");
  P("");

  /* بصمة الطزاجة */
  P("## بصمةُ الطزاجة");
  P("");
  P("`node scripts/state-snapshot.mjs --check` يعيد قياس هذه الإشارات وحدها ويقارنها");
  P("بالمخزَّن أدناه — ثانيةٌ واحدة بدل إعادة توليدٍ كامل.");
  P("");
  P("**والإشارات صنفان بقصد:**");
  P("");
  P("| الصنف | معنى اختلافها | أثرها على رمز الخروج |");
  P("|---|---|---|");
  P("| **بنيوية** (التزام · هجرات · جداول · دوال · عقود) | اللقطة صارت تصف ماضياً | يخرج بـ`1` |");
  P("| **حيّة** (حجوزات · إشعارات · ترجمات · تدقيق) | المالك عمل، والوصف ما زال صحيحاً | لا شيء |");
  P("");
  P("⚠ **والفصل ليس تجميلاً**: الدرس ١٣ — «الإنذار الذي يرنّ على ضجيج يصمت يوم");
  P("الحريق». فاحصٌ يحمرّ لأن عميلاً حجز يُعلَّم قارئه تجاهُله، فيصمت يوم تُحذف دالة.");
  P("");
  P("| الإشارة | الصنف | القيمة وقت التوليد | الأمر الذي أنتجها |");
  P("|---|---|---|---|");
  for (const [key, label, cmd] of STRUCTURAL) {
    P(`| ${label} | بنيوية | \`${cell(fp[key] ?? "لم يُقس")}\` | \`${cell(cmd)}\` |`);
  }
  for (const [key, label, cmd] of LIVE) {
    P(`| ${label} | حيّة | \`${cell(fp[key] ?? "لم يُقس")}\` | \`${cell(cmd)}\` |`);
  }
  P("");
  P(`<!-- ${FP_MARK} ${JSON.stringify(fp)} -->`);
  P("");

  writeFileSync(OUT_PATH, md.join("\n"), "utf8");

  /* ── تقريرٌ في السطر ─────────────────────────────────────────────────── */
  const bytes = Buffer.byteLength(md.join("\n"));
  console.log("");
  console.log(`  ✅ كُتب ${relative(ROOT, OUT_PATH)}  (${(bytes / 1024).toFixed(1)} ك.ب · ${md.length} سطراً)`);
  console.log(`     الالتزام ${fp.head} · غير مكمَّم ${fp.dirty} · جداول ${fp.tables} · دوال ${fp.functions}`);
  if (gate.length) {
    console.log(
      `     البوابة: ${gate.map((g) => `${g.label}=${g.code === 0 ? "✅" : `🔴${g.code}`}`).join(" · ")}`,
    );
  } else {
    console.log("     البوابة: لم تُقس (‏--fast)");
  }
  if (broken.length) console.log(`     🔴 ${broken.length} بنداً في «ما هو مكسور الآن»`);
  if (FAILURES.length) {
    for (const f of FAILURES) console.log(`     ⚠ لم يُقس «${f.title}»: ${f.message}`);
  }
  console.log("");
}

/* ═══════════════════════════════════════════════════════════════════════ *
 * التشغيل
 * ═══════════════════════════════════════════════════════════════════════ */

client = new pg.Client({ connectionString: dbUrl(), ssl: { rejectUnauthorized: false } });
await client.connect();
let exitCode = 0;
try {
  exitCode = CHECK ? await modeCheck() : ((await modeGenerate()), 0);
} finally {
  await client.end().catch(() => {});
}
process.exit(exitCode);
