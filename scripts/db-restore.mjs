/**
 * استعادة قاعدة البيانات من ملف نسخة احتياطية أنتجه `pnpm db:backup`.
 *
 * ⚠⚠ هذه العملية **تدمّر** محتوى المخطط المستهدف في القاعدة الحالية وتستبدله
 * بمحتوى الملف. لذلك: لا تعمل بلا وسيط ملف، ولا تعمل بلا تأكيد صريح مكتوب،
 * ولا تعمل خارج طرفية تفاعلية (فلا تنطلق من جدولة أو سكربت بالخطأ).
 *
 * الاستخدام:
 *   pnpm db:restore -- --list                          عرض النسخ المتاحة
 *   pnpm db:restore -- <ملف> --dry-run                 فحص بلا أي كتابة
 *   pnpm db:restore -- <ملف>                           الاستعادة الفعلية
 *   pnpm db:restore -- <ملف> --schema=storage          مخطط آخر بدل public
 *   pnpm db:restore -- <ملف> --allow-errors            تجاوز الأخطاء (غير ذرّي)
 *
 * لماذا يُستعاد **المخطط كاملاً** (بنية + بيانات) ولا تُستعاد البيانات وحدها:
 * ترتيب أرشيف pg_dump يضع البيانات **قبل** المشغّلات والقيود. فالاستعادة الكاملة
 * تحمّل الصفوف ولا مشغّل واحد يعمل. أما `--data-only` فيحمّل الصفوف في قاعدة
 * مشغّلاتها قائمة ⇒ كل صف حجز يُعيد كتابة قيود الدفتر المالي، فتُضاعَف الخزينة.
 * **لا تضف `--data-only` إلى هذا السكربت.** (docs/BACKUP.md القسم ٤.)
 */
import { existsSync, statSync, readdirSync, writeFileSync } from "node:fs";
import { join, dirname, isAbsolute, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { config } from "dotenv";
import pg from "pg";
import {
  findPgTool,
  printMissingToolHelp,
  assertToolNotOlderThanServer,
  connEnvFromUrl,
  describeTarget,
  humanSize,
  humanDuration,
  fileStamp,
  readArchiveIndex,
  topTableCounts,
} from "./lib/pg-tools.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: join(root, ".env.local"), quiet: true });

const backupsDir = resolve(process.env.BACKUP_DIR ?? join(root, "backups"));

/* ------------------------------------------------------------------ *
 * (١) المدخلات — الملف إلزامي
 * ------------------------------------------------------------------ */

const argv = process.argv.slice(2);
const has = (f) => argv.includes(`--${f}`);
const valueOf = (name) => {
  const eq = argv.find((a) => a.startsWith(`--${name}=`));
  if (eq) return eq.slice(name.length + 3);
  const i = argv.indexOf(`--${name}`);
  return i !== -1 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : undefined;
};

const dryRun = has("dry-run");
const allowErrors = has("allow-errors");
const schema = valueOf("schema") ?? "public";
const positional = argv.filter((a) => !a.startsWith("--"));
// وسيط `--schema public` يبتلع الكلمة التالية؛ استبعدها من المرشّحين
const schemaInline = argv.indexOf("--schema") !== -1 ? argv[argv.indexOf("--schema") + 1] : null;
const fileArg = positional.find((a) => a !== schemaInline);

function listBackups() {
  if (!existsSync(backupsDir)) return [];
  return readdirSync(backupsDir)
    .filter((f) => f.endsWith(".dump"))
    .sort()
    .reverse()
    .map((f) => ({ name: f, path: join(backupsDir, f), stat: statSync(join(backupsDir, f)) }));
}

function printBackups() {
  const list = listBackups();
  if (list.length === 0) {
    console.error(`   لا توجد نسخ في ${backupsDir} — شغّل «pnpm db:backup» أولاً.`);
    return;
  }
  console.error(`   النسخ المتاحة في ${backupsDir} (الأحدث أولاً):`);
  for (const b of list.slice(0, 15)) {
    console.error(`     ${b.name}   ${humanSize(b.stat.size)}   ${b.stat.mtime.toLocaleString("ar-EG")}`);
  }
  if (list.length > 15) console.error(`     ... و${list.length - 15} نسخة أقدم`);
}

if (has("list")) {
  printBackups();
  process.exit(0);
}

if (!fileArg) {
  console.error(
    "❌ لم تحدد ملف النسخة الاحتياطية — والاستعادة لا تعمل بلا ملف.\n" +
      "\n" +
      "   الاستخدام:  pnpm db:restore -- <ملف>\n" +
      "   مثال:       pnpm db:restore -- tours-01_2026-08-13_16-08-24.dump\n" +
      "   فحص أولاً:  pnpm db:restore -- <ملف> --dry-run\n" +
      "\n"
  );
  printBackups();
  process.exit(1);
}

// يقبل اسماً مجرداً (يُبحث عنه في backups/) أو مساراً كاملاً
let file = isAbsolute(fileArg) ? fileArg : resolve(fileArg);
if (!existsSync(file)) {
  const inDir = join(backupsDir, basename(fileArg));
  if (existsSync(inDir)) file = inDir;
}
if (!existsSync(file)) {
  console.error(`❌ الملف غير موجود: ${fileArg}\n`);
  printBackups();
  process.exit(1);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error(
    "❌ DATABASE_URL غير موجود في .env.local — ولا وجهة للاستعادة بدونه.\n" +
      "   من لوحة Supabase: زر Connect ← Session pooler ← انسخ الـ URI."
  );
  process.exit(1);
}

/* ------------------------------------------------------------------ *
 * (٢) الأداة والأرشيف
 * ------------------------------------------------------------------ */

const pgRestore = findPgTool("pg_restore");
if (!pgRestore) {
  printMissingToolHelp("pg_restore");
  process.exit(1);
}

const index = readArchiveIndex(pgRestore.path, file);
if (!index.ok) {
  console.error(
    `❌ الملف موجود لكن pg_restore لا يستطيع قراءته — تالف أو ليس أرشيف pg_dump:\n${index.stderr}\n` +
      "   جرّب نسخة أقدم من القائمة: pnpm db:restore -- --list"
  );
  process.exit(1);
}
if (!index.schemas.includes(schema)) {
  console.error(
    `❌ الأرشيف لا يحتوي المخطط «${schema}». المخططات الموجودة فيه: ${index.schemas.join(" · ")}\n` +
      `   حدد واحداً منها:  pnpm db:restore -- ${basename(file)} --schema=${index.schemas[0]}`
  );
  process.exit(1);
}

/* ------------------------------------------------------------------ *
 * (٣) الوجهة — ماذا سيُدمَّر بالضبط
 * ------------------------------------------------------------------ */

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
try {
  await client.connect();
} catch (err) {
  console.error(`❌ تعذّر الاتصال بالقاعدة: ${err.message}`);
  process.exit(1);
}

const { rows: sv } = await client.query(
  "select current_setting('server_version') as v, current_setting('server_version_num')::int as n"
);
const serverMajor = Math.floor(sv[0].n / 10000);
if (!assertToolNotOlderThanServer("pg_restore", pgRestore.major, serverMajor)) {
  await client.end().catch(() => {});
  process.exit(1);
}

const before = await topTableCounts(client).catch(() => []);
const st = statSync(file);

console.log("╔══════════════════════════════════════════════════════════════╗");
console.log("║   استعادة قاعدة البيانات — عملية مُدمِّرة لا رجعة فيها        ║");
console.log("╚══════════════════════════════════════════════════════════════╝");
console.log(`\n📦 المصدر (الملف):`);
console.log(`   ${file}`);
console.log(`   الحجم ${humanSize(st.size)} · أُنشئ ${st.mtime.toLocaleString("ar-EG")}`);
console.log(`   يحتوي: ${index.entries} مدخلاً · ${index.tablesWithData} جدولاً ببياناته · مخططات: ${index.schemas.join(" · ")}`);
console.log(`\n🎯 الوجهة (ستُستبدل):`);
console.log(`   ${describeTarget(url)}  —  PostgreSQL ${sv[0].v}`);
console.log(`   المخطط المستهدف: ${schema}`);
if (before.length) {
  console.log(`\n⚠ محتوى القاعدة **الآن** (سيختفي ويحل محله محتوى الملف):`);
  for (const t of before) console.log(`   ${t.table.padEnd(24, " ")} ${t.rows} صف`);
}

/* ------------------------------------------------------------------ *
 * (٤) الفحص بلا كتابة
 * ------------------------------------------------------------------ */

if (dryRun) {
  console.log(
    "\n🔎 --dry-run: لم يُكتب شيء ولم تُمسّ القاعدة.\n" +
      `   لتنفيذ الاستعادة فعلاً:  pnpm db:restore -- ${basename(file)}` +
      (schema !== "public" ? ` --schema=${schema}` : "")
  );
  await client.end().catch(() => {});
  process.exit(0);
}

/* ------------------------------------------------------------------ *
 * (٥) التأكيد الصريح الإلزامي
 * ------------------------------------------------------------------ */

if (!process.stdin.isTTY) {
  console.error(
    "\n❌ الاستعادة تحتاج تأكيداً مكتوباً، وهذه ليست طرفية تفاعلية.\n" +
      "   شغّلها بيدك من الطرفية. **لا يوجد وسيط لتخطّي التأكيد عمداً** —\n" +
      "   عملية تمحو الدفتر المالي لا يجوز أن تنطلق من جدولة أو سكربت بالخطأ."
  );
  await client.end().catch(() => {});
  process.exit(1);
}

const rl = createInterface({ input: process.stdin, output: process.stdout });
const answer = (
  await rl.question(
    `\nاكتب  استعادة  (أو RESTORE) ثم Enter للمتابعة — أي شيء آخر يُلغي:\n> `
  )
).trim();
rl.close();

if (answer !== "استعادة" && answer !== "RESTORE") {
  console.log("↩️  أُلغيت الاستعادة. لم تُمسّ القاعدة.");
  await client.end().catch(() => {});
  process.exit(1);
}

/* ------------------------------------------------------------------ *
 * (٦) كائنات **خارج** المخطط المستهدف تعتمد على دواله
 *
 * `pg_restore --clean --schema=public` يُسقط سياسات public قبل دوالها (بترتيب
 * تبعية صحيح)، لكنه لا يعرف شيئاً عمّا هو خارج public. وفي هذه القاعدة:
 *   • ٨ سياسات على storage.objects تستدعي public.is_admin() و
 *     public.receipt_upload_allowed()
 *   • مشغّل on_auth_user_created على auth.users ينفّذ public.handle_new_user()
 * و`drop function` بلا cascade يفشل ما دام لها تابع ⇒ ومع --single-transaction
 * تُلغى الاستعادة كلها. (تحقّقنا منه فعلياً: «cannot drop function is_admin()
 * because other objects depend on it».)
 *
 * فنلتقط تعريفها كاملاً، ونحفظه في ملف إنقاذ، ثم نُسقطها، ونعيدها بعد الاستعادة
 * — نجحت أو فشلت. نافذة السقوط ثوانٍ، وأثرها **إغلاق** لا انفتاح: RLS تبقى
 * مفعّلة بلا سياسات ⇒ يُمنع الرفع والقراءة، ولا يُكشف شيء.
 * ------------------------------------------------------------------ */

// (أ) السياسات — لا يوجد pg_get_policydef فنبنيها من الكتالوج
const CAPTURE_POLICIES = `
select 'policy' as kind, n.nspname as schema, cl.relname as tbl, p.polname as name,
       format(
         'create policy %I on %I.%I as %s for %s to %s%s%s;',
         p.polname, n.nspname, cl.relname,
         case when p.polpermissive then 'permissive' else 'restrictive' end,
         case p.polcmd when 'r' then 'select' when 'a' then 'insert'
                       when 'w' then 'update' when 'd' then 'delete' else 'all' end,
         coalesce((select string_agg(quote_ident(r.rolname), ', ' order by r.rolname)
                     from pg_roles r where r.oid = any (p.polroles)), 'public'),
         coalesce(' using (' || pg_get_expr(p.polqual, p.polrelid) || ')', ''),
         coalesce(' with check (' || pg_get_expr(p.polwithcheck, p.polrelid) || ')', '')
       ) as ddl
  from pg_policy p
  join pg_class cl on cl.oid = p.polrelid
  join pg_namespace n on n.oid = cl.relnamespace
 where n.nspname <> $1
   and exists (
     select 1 from pg_depend d
     join pg_proc pr on pr.oid = d.refobjid
     join pg_namespace pn on pn.oid = pr.pronamespace
    where d.classid = 'pg_policy'::regclass and d.objid = p.oid
      and d.refclassid = 'pg_proc'::regclass and pn.nspname = $1)
 order by 2, 3, 4`;

// (ب) المشغّلات — pg_get_triggerdef يعطي الجملة كاملة ومؤهَّلة
const CAPTURE_TRIGGERS = `
select 'trigger' as kind, n.nspname as schema, cl.relname as tbl, t.tgname as name,
       pg_get_triggerdef(t.oid) || ';' as ddl
  from pg_trigger t
  join pg_class cl on cl.oid = t.tgrelid
  join pg_namespace n on n.oid = cl.relnamespace
  join pg_proc p on p.oid = t.tgfoid
  join pg_namespace pn on pn.oid = p.pronamespace
 where not t.tgisinternal and n.nspname <> $1 and pn.nspname = $1
 order by 2, 3, 4`;

let dependents = [];
try {
  // search_path فارغ ⇒ pg_get_expr و pg_get_triggerdef يؤهّلان كل اسم،
  // فتصير الجُمل المُلتقطة مكتفية بذاتها ولا تعتمد على مسار بحث لاحق.
  await client.query("set search_path = ''");
  const pol = await client.query(CAPTURE_POLICIES, [schema]);
  const trg = await client.query(CAPTURE_TRIGGERS, [schema]);
  await client.query("reset search_path");
  dependents = [...pol.rows, ...trg.rows];
} catch (err) {
  console.error(`❌ تعذّر فحص الكائنات المعتمِدة على «${schema}»: ${err.message}`);
  await client.end().catch(() => {});
  process.exit(1);
}

const q = (s) => `"${s.replace(/"/g, '""')}"`;
const rescueFile = join(backupsDir, `dependents-before-restore_${fileStamp()}.sql`);

if (dependents.length) {
  writeFileSync(
    rescueFile,
    `-- كائنات خارج مخطط ${schema} كانت تعتمد على دواله، أُسقطت قبل الاستعادة\n` +
      `-- وأُعيد إنشاؤها بعدها تلقائياً. هذا الملف شبكة أمان: لو تعثّرت الإعادة\n` +
      `-- فشغّل محتواه كما هو في SQL Editor بلوحة Supabase.\n\n` +
      dependents.map((d) => d.ddl).join("\n") +
      "\n",
    "utf8"
  );
  console.log(`\n🛡  ${dependents.length} كائناً خارج «${schema}» يعتمد عليه — حُفظ تعريفه في:`);
  console.log(`   ${rescueFile}`);
  for (const d of dependents) console.log(`   • ${d.kind} ${d.schema}.${d.tbl}.${d.name}`);
  const dropped = [];
  try {
    for (const d of dependents) {
      const what = d.kind === "policy" ? "policy" : "trigger";
      await client.query(`drop ${what} if exists ${q(d.name)} on ${q(d.schema)}.${q(d.tbl)}`);
      dropped.push(d);
    }
  } catch (err) {
    // لم تبدأ الاستعادة بعد: نعيد ما أسقطناه ونخرج بلا أن نمسّ القاعدة
    for (const d of dropped) await client.query(d.ddl).catch(() => {});
    console.error(
      `❌ تعذّر إسقاط الكائنات التابعة: ${err.message}\n` +
        `   أُوقفت الاستعادة **قبل أي كتابة**، وأُعيد ما أُسقط منها.\n` +
        `   للتأكد شغّل محتوى هذا الملف في SQL Editor:\n   ${rescueFile}`
    );
    await client.end().catch(() => {});
    process.exit(1);
  }
  console.log(`   أُسقطت مؤقتاً، وستُعاد بعد الاستعادة.`);
}

/* ------------------------------------------------------------------ *
 * (٧) التنفيذ
 * ------------------------------------------------------------------ */

const dbName = new URL(url).pathname.replace(/^\//, "") || "postgres";
const args = [
  `--dbname=${dbName}`,
  `--schema=${schema}`,
  "--clean",
  "--if-exists",
  // الملكية تُسنَد إلى الدور المتصل (postgres) — أدوار Supabase الداخلية
  // ليست ملكاً لنا. أما **الصلاحيات** (grant/revoke) فتُستعاد كما هي لأنها
  // جزء من نموذج الأمان: حذفها يفتح الجداول لـ anon.
  "--no-owner",
];
if (!allowErrors) args.push("--single-transaction"); // ذرّي: إما كله أو لا شيء
args.push(file);

console.log(`\n▶  جارٍ الاستعادة ${allowErrors ? "(وضع تجاوز الأخطاء — غير ذرّي)" : "(معاملة واحدة ذرّية)"} ...`);
const started = Date.now();
const res = spawnSync(pgRestore.path, args, { env: connEnvFromUrl(url), encoding: "utf8" });
const elapsed = Date.now() - started;
const restoreOk = !res.error && res.status === 0;

if (res.stderr?.trim()) console.log(`\nمخرجات pg_restore:\n${res.stderr.trim()}`);

/* ------------------------------------------------------------------ *
 * (٨) إعادة الكائنات التابعة — تُنفَّذ نجحت الاستعادة أم فشلت.
 * (`--single-transaction` يُرجع القاعدة كما كانت، لكن إسقاطنا نحن كان على
 *  اتصال آخر خارج تلك المعاملة، فلا يتراجع معها.)
 * ------------------------------------------------------------------ */

let depsRestored = 0;
const depFailures = [];
for (const d of dependents) {
  try {
    await client.query(d.ddl);
    depsRestored++;
  } catch (err) {
    depFailures.push(`${d.kind} ${d.schema}.${d.tbl}.${d.name}: ${err.message}`);
  }
}
if (dependents.length) {
  console.log(`\n🛡  أُعيد ${depsRestored}/${dependents.length} كائناً تابعاً.`);
  if (depFailures.length) {
    console.error(
      `⚠ فشلت إعادة ${depFailures.length} منها:\n   ` +
        depFailures.join("\n   ") +
        `\n   شغّل محتوى هذا الملف كما هو في SQL Editor بلوحة Supabase:\n   ${rescueFile}\n` +
        `   ⚠ حتى ذلك الحين:\n` +
        `     • سياسات مفقودة على storage.objects ⇒ RLS مفعّلة بلا سياسة ⇒ رفع الإيصالات\n` +
        `       وقراءة الوسائط **مقفلان** (يفشل مغلقاً لا مفتوحاً): الموقع يعمل والصور لا تظهر.\n` +
        `     • مشغّل on_auth_user_created مفقود ⇒ كل حساب جديد يُنشأ بلا صف في profiles\n` +
        `       ⇒ لا دور له ⇒ لا يدخل /admin ولا /portal.`
    );
  }
}

/* ------------------------------------------------------------------ *
 * (٩) التحقق بعد الاستعادة
 * ------------------------------------------------------------------ */

if (!restoreOk) {
  console.error(
    `\n❌ فشلت الاستعادة (رمز ${res.status ?? "—"}) بعد ${humanDuration(elapsed)}.\n` +
      (allowErrors
        ? "   كانت في وضع تجاوز الأخطاء ⇒ **القاعدة الآن في حالة مختلطة**. راجع المخرجات أعلاه.\n"
        : "   كانت في معاملة واحدة ⇒ **تراجع كل شيء والقاعدة كما كانت قبل الأمر**.\n" +
          "   إن كان السبب تبعية أو صلاحية على كائن بعينه، جرّب:\n" +
          `      pnpm db:restore -- ${basename(file)} --allow-errors\n` +
          "   وإن استمر الفشل فالمسار الأنظف هو مشروع Supabase جديد — docs/BACKUP.md القسم ٣.")
  );
  await client.end().catch(() => {});
  process.exit(1);
}

const after = await topTableCounts(client).catch(() => []);
await client.end().catch(() => {});

console.log(`\n✅ اكتملت الاستعادة في ${humanDuration(elapsed)}`);
if (after.length) {
  console.log(`\n   الجداول بعد الاستعادة:`);
  for (const t of after) {
    const prev = before.find((b) => b.table === t.table);
    const delta = prev ? ` (كانت ${prev.rows})` : "";
    console.log(`   ${t.table.padEnd(24, " ")} ${t.rows} صف${delta}`);
  }
}

console.log(
  "\n📋 ما يلزم بعد الاستعادة — لا تتخطَّ هذه الخطوات:\n" +
    "   ١) ملفات مخزن Storage (صور الوسائط وإيصالات الدفع) **ليست** في هذا الملف؛\n" +
    "      استُعيدت أسماؤها وبياناتها الوصفية فقط. التفصيل: docs/BACKUP.md القسم ٦.\n" +
    "   ٢) شغّل  pnpm db:test  — ثماني مجموعات، كلها تطبع ALL PASSED.\n" +
    "   ٣) شغّل  pnpm db:migrate  — يقرأ schema_migrations المستعاد ويطبّق ما بعده.\n" +
    "   ٤) افتح /admin وتحقق من الإعدادات والمتعهدين والدفتر المالي بعينك.\n" +
    "   ٥) شغّل  pnpm db:backup  فوراً — النسخة الأولى بعد كارثة هي أهم نسخة."
);
