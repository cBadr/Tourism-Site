/**
 * نسخ احتياطي كامل لقاعدة البيانات — يفرّغ القاعدة عبر DATABASE_URL إلى ملف
 * مضغوط بطابع زمني داخل مجلد backups/ (المجلد محجوب في .gitignore).
 *
 * الاستخدام:
 *   pnpm db:backup
 *   pnpm db:backup -- --schemas public            (مخططات محددة)
 *   pnpm db:backup -- --out D:\backups            (مجلد وجهة لهذه المرة)
 *
 * المتطلب الأول:  DATABASE_URL في .env.local — صيغة **Session pooler** لا المضيف
 *                 المباشر (المباشر IPv6 فقط ⇒ ENOTFOUND). التفاصيل: docs/BACKUP.md
 * المتطلب الثاني: أداة pg_dump على الجهاز. لا تُفترض — تُفحص أولاً، وإن غابت
 *                 طُبعت تعليمات التثبيت بالعربية ولم يُرمَ خطأ غامض.
 *
 * الصيغة: أرشيف pg_dump بصيغة custom (مضغوط داخلياً بـ gzip) — يُستعاد بـ
 * pnpm db:restore، ويمكن تحويله إلى SQL نصّي بـ  pg_restore -f out.sql <file>.
 *
 * ⚠ ما **لا** يشمله هذا الملف: ملفات مخزن Supabase Storage نفسها (صور الوسائط
 * وإيصالات الدفع). الأرشيف يحفظ صفوف storage.objects أي **أسماء** الملفات
 * وبياناتها الوصفية فقط، لا محتواها. الشرح والبديل: docs/BACKUP.md القسم ٦.
 */
import { existsSync, mkdirSync, statSync, copyFileSync, appendFileSync, readdirSync, unlinkSync } from "node:fs";
import { join, dirname, basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
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
} from "./lib/pg-tools.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: join(root, ".env.local"), quiet: true });

/* ------------------------------------------------------------------ *
 * (١) المدخلات
 * ------------------------------------------------------------------ */

const argv = process.argv.slice(2);
const argOf = (name) => {
  const i = argv.indexOf(`--${name}`);
  if (i !== -1) return argv[i + 1];
  const eq = argv.find((a) => a.startsWith(`--${name}=`));
  return eq ? eq.slice(name.length + 3) : undefined;
};

const url = process.env.DATABASE_URL;
if (!url) {
  console.error(
    "❌ DATABASE_URL غير موجود في .env.local\n" +
      "   أضِفه من لوحة Supabase: زر Connect أعلى المشروع ← Session pooler ← انسخ الـ URI\n" +
      "   (استبدل [YOUR-PASSWORD] بكلمة مرور القاعدة التي حددتها عند إنشاء المشروع)\n" +
      "   ⚠ لا تستعمل المضيف المباشر db.<ref>.supabase.co — يعمل على IPv6 فقط."
  );
  process.exit(1);
}

// المخططات المنسوخة. الافتراضي ثلاثة، ولكل واحد سبب:
//   public  — كل بيانات المنتج (٣٨ جدولاً: المحتوى والحجوزات والدفتر والإعدادات)
//   auth    — حسابات الدخول (المدير والمتعهدون)؛ بدونها تفشل مفاتيح profiles الأجنبية
//   storage — دلاء الملفات وسياساتها وقيود الأنواع والأحجام (لا محتوى الملفات)
// المستثنى عمداً: vault (أسرار Supabase) و realtime و graphql — تديرها المنصة
// وتُعاد بناؤها في أي مشروع جديد، ونسخها يوقع أخطاء ملكية بلا فائدة.
const DEFAULT_SCHEMAS = "public,auth,storage";
const schemas = (argOf("schemas") ?? process.env.BACKUP_SCHEMAS ?? DEFAULT_SCHEMAS)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const outDir = resolve(argOf("out") ?? process.env.BACKUP_DIR ?? join(root, "backups"));

/* ------------------------------------------------------------------ *
 * (٢) الأدوات — تُفحص قبل أي شيء آخر
 * ------------------------------------------------------------------ */

const pgDump = findPgTool("pg_dump");
if (!pgDump) {
  printMissingToolHelp("pg_dump");
  process.exit(1);
}
const pgRestore = findPgTool("pg_restore"); // للتحقق من سلامة الأرشيف بعد كتابته

/* ------------------------------------------------------------------ *
 * (٣) الخادم — إصداره وعدد جداوله
 * ------------------------------------------------------------------ */

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
let serverMajor = 0;
let serverText = "";
const tablesPerSchema = [];

try {
  await client.connect();
} catch (err) {
  console.error(
    `❌ تعذّر الاتصال بالقاعدة: ${err.message}\n` +
      "   الأسباب المعتادة: DATABASE_URL بصيغة المضيف المباشر بدل Session pooler،\n" +
      "   أو كلمة مرور قاعدة خاطئة (لا مفتاح API)، أو انقطاع الشبكة."
  );
  process.exit(1);
}

try {
  const { rows } = await client.query(
    "select current_setting('server_version') as v, current_setting('server_version_num')::int as n"
  );
  serverText = rows[0].v;
  serverMajor = Math.floor(rows[0].n / 10000);

  const { rows: counts } = await client.query(
    `select n.nspname as schema, count(*)::int as tables
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where c.relkind = 'r' and n.nspname = any($1)
      group by 1 order by 1`,
    [schemas]
  );
  tablesPerSchema.push(...counts);
} finally {
  await client.end().catch(() => {});
}

if (!assertToolNotOlderThanServer("pg_dump", pgDump.major, serverMajor)) process.exit(1);

/* ------------------------------------------------------------------ *
 * (٤) التفريغ
 * ------------------------------------------------------------------ */

mkdirSync(outDir, { recursive: true });

const stamp = fileStamp();
const file = join(outDir, `tours-01_${stamp}.dump`);

console.log(`▶  نسخ احتياطي — الخادم PostgreSQL ${serverText}`);
console.log(`   الوجهة   : ${describeTarget(url)}`);
console.log(`   المخططات : ${schemas.join(" · ")}`);
console.log(`   الأداة   : ${pgDump.path} (إصدار ${pgDump.major})`);
console.log(`   الملف    : ${file}`);
console.log("   ... جارٍ التفريغ (قد يستغرق دقيقة على اتصال بطيء)");

const args = [
  "--format=custom",
  "--compress=9",
  "--quote-all-identifiers", // يحمي الأسماء من اختلاف قواعد الاقتباس بين الإصدارات
  "--no-publications",
  "--no-subscriptions", // كائنات النسخ المتماثل تديرها Supabase ولا تُستعاد
  ...schemas.map((s) => `--schema=${s}`),
  `--file=${file}`,
];

const started = Date.now();
const dump = spawnSync(pgDump.path, args, { env: connEnvFromUrl(url), encoding: "utf8" });
const elapsed = Date.now() - started;

if (dump.error || dump.status !== 0) {
  console.error(`❌ فشل pg_dump (رمز ${dump.status ?? "—"}):\n${dump.stderr || dump.error?.message || ""}`);
  // لا نترك ملفاً نصف مكتوب يوحي بنسخة سليمة
  if (existsSync(file)) {
    try {
      unlinkSync(file);
      console.error("   حُذف الملف الناقص كي لا يُظن نسخة صالحة.");
    } catch {
      console.error(`   ⚠ تعذّر حذف الملف الناقص: ${file} — احذفه يدوياً.`);
    }
  }
  process.exit(1);
}
if (dump.stderr?.trim()) console.log(`   ملاحظات pg_dump:\n${dump.stderr.trim()}`);

const size = statSync(file).size;

/* ------------------------------------------------------------------ *
 * (٥) التحقق من الأرشيف — نسخة لم تُقرأ ليست نسخة
 * ------------------------------------------------------------------ */

let verified = null;
if (pgRestore) {
  verified = readArchiveIndex(pgRestore.path, file);
  if (!verified.ok) {
    console.error(
      `❌ الملف كُتب لكن pg_restore عجز عن قراءة فهرسه — أي أنه تالف ولا يصلح للاستعادة:\n${verified.stderr}`
    );
    process.exit(1);
  }
} else {
  console.log("   ⚠ pg_restore غير موجود — تخطّيت التحقق من سلامة الأرشيف (والاستعادة ستحتاجه لاحقاً).");
}

/* ------------------------------------------------------------------ *
 * (٦) التقرير
 * ------------------------------------------------------------------ */

const totalTables = tablesPerSchema.reduce((a, r) => a + r.tables, 0);

console.log("\n✅ اكتملت النسخة الاحتياطية");
console.log(`   الحجم   : ${humanSize(size)}`);
console.log(`   المدة   : ${humanDuration(elapsed)}`);
console.log(
  `   الجداول : ${totalTables} — ` + tablesPerSchema.map((r) => `${r.schema}: ${r.tables}`).join(" · ")
);
if (verified?.ok) {
  console.log(`   محتوى الأرشيف: ${verified.entries} مدخلاً، منها ${verified.tablesWithData} جدولاً ببياناته ✔ فُحص`);
}
console.log(`   الملف   : ${file}`);

// سجل تراكمي بجوار النسخ — يجيب «أي ملف من أي يوم وبأي حجم» بلا فتح الملفات
try {
  appendFileSync(
    join(outDir, "index.log"),
    `${new Date().toISOString()}\t${basename(file)}\t${size}\t${totalTables} جدولاً\t` +
      `${(elapsed / 1000).toFixed(1)}ث\tschemas=${schemas.join(",")}\tserver=${serverText}\n`,
    "utf8"
  );
} catch {
  /* السجل رفاهية — فشله لا يُبطل النسخة */
}

/* ------------------------------------------------------------------ *
 * (٧) الوجهة البعيدة — قابلة للتوصيل، وبلا اعتمادات مخترَعة
 * ------------------------------------------------------------------ */

let remoteFailed = false;

// (أ) نسخة إلى مجلد آخر: مجلد OneDrive/Google Drive المزامَن، أو قرص خارجي،
//     أو مسار شبكة \\server\share — كلها بلا أي اعتماد.
const copyTo = process.env.BACKUP_COPY_TO?.trim();
if (copyTo) {
  try {
    mkdirSync(copyTo, { recursive: true });
    const dest = join(copyTo, basename(file));
    copyFileSync(file, dest);
    console.log(`\n📤 نُسخت إلى الوجهة الثانية: ${dest}`);
  } catch (err) {
    remoteFailed = true;
    console.error(`\n⚠ فشل النسخ إلى BACKUP_COPY_TO (${copyTo}): ${err.message}`);
  }
}

// (ب) أمر رفع خارجي: FTP أو rclone أو أي أداة يختارها المالك. {file} يُستبدل
//     بمسار الملف. **لا نبني رفعاً لوجهة بلا اعتماد** — هذا خطّاف لا تكامل.
const uploadCmd = process.env.BACKUP_UPLOAD_CMD?.trim();
if (uploadCmd) {
  const cmd = uploadCmd.replaceAll("{file}", `"${file}"`);
  console.log(`\n📤 تنفيذ BACKUP_UPLOAD_CMD ...`);
  const up = spawnSync(cmd, { shell: true, stdio: "inherit" });
  if (up.error || up.status !== 0) {
    remoteFailed = true;
    console.error(`⚠ فشل أمر الرفع (رمز ${up.status ?? "—"}). **النسخة المحلية سليمة** في ${file}`);
  } else {
    console.log("✅ تم الرفع.");
  }
}

if (!copyTo && !uploadCmd) {
  console.log(
    "\nℹ️  لا وجهة بعيدة مضبوطة — النسخة على هذا القرص وحده.\n" +
      "   اضبط BACKUP_COPY_TO (مجلد مزامَن أو قرص خارجي) أو BACKUP_UPLOAD_CMD.\n" +
      "   الشرح وخيارات كل وجهة: docs/BACKUP.md القسم ٥."
  );
}

/* ------------------------------------------------------------------ *
 * (٨) الاحتفاظ — لا يحذف شيئاً ما لم يُطلب صراحةً
 * ------------------------------------------------------------------ */

const keep = Number.parseInt(process.env.BACKUP_KEEP ?? "", 10);
const all = readdirSync(outDir)
  .filter((f) => f.startsWith("tours-01_") && f.endsWith(".dump"))
  .sort();

if (Number.isInteger(keep) && keep > 0 && all.length > keep) {
  for (const old of all.slice(0, all.length - keep)) {
    try {
      unlinkSync(join(outDir, old));
      console.log(`🗑  حُذفت نسخة قديمة (BACKUP_KEEP=${keep}): ${old}`);
    } catch (err) {
      console.error(`⚠ تعذّر حذف ${old}: ${err.message}`);
    }
  }
} else if (all.length >= 10 && !Number.isInteger(keep)) {
  console.log(`\nℹ️  في المجلد ${all.length} نسخة ولا حذف تلقائياً. اضبط BACKUP_KEEP=<عدد> للإبقاء على الأحدث فقط.`);
}

// رمز خروج مستقل: النسخة نجحت لكن الوجهة البعيدة فشلت — كي لا تمرّ الجدولة صامتة.
process.exit(remoteFailed ? 2 : 0);
