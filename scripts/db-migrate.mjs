/**
 * مُشغّل الترحيلات — يطبّق ملفات supabase/migrations/*.sql بالترتيب على قاعدة البيانات
 * ويتتبع المُطبَّق منها في جدول schema_migrations (لا يعيد تطبيق ملف مرتين).
 *
 * الاستخدام:  pnpm db:migrate
 * المتطلب:   DATABASE_URL في .env.local — رابط الاتصال من لوحة Supabase:
 *            Connect ← Session pooler ← URI  (يتضمن كلمة مرور القاعدة)
 *
 * هذا السكربت هو أساس انضباط الـ Whitelabel لاحقاً: نفس الأمر يُطبَّق على كل نسخة.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import pg from "pg";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: join(root, ".env.local") });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error(
    "❌ DATABASE_URL غير موجود في .env.local\n" +
      "   أضِفه من لوحة Supabase: زر Connect أعلى المشروع ← Session pooler ← انسخ الـ URI\n" +
      "   (استبدل [YOUR-PASSWORD] بكلمة مرور القاعدة التي حددتها عند إنشاء المشروع)"
  );
  process.exit(1);
}

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });

const dir = join(root, "supabase", "migrations");
// خيار --upto 0002 : طبّق حتى الملفات التي تبدأ بهذا الرقم فقط (مفيد أثناء تطوير ترحيلات جديدة)
const uptoIdx = process.argv.indexOf("--upto");
const upto = uptoIdx !== -1 ? process.argv[uptoIdx + 1] : null;
const files = readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .filter((f) => (upto ? f.slice(0, upto.length) <= upto : true))
  .sort();

try {
  await client.connect();
  await client.query(
    `create table if not exists public.schema_migrations (
       name text primary key,
       applied_at timestamptz not null default now()
     )`
  );

  const { rows } = await client.query("select name from public.schema_migrations");
  const applied = new Set(rows.map((r) => r.name));

  let ran = 0;
  for (const file of files) {
    if (applied.has(file)) {
      console.log(`⏭  ${file} — مُطبَّق سابقاً`);
      continue;
    }
    const sql = readFileSync(join(dir, file), "utf8");
    console.log(`▶  تطبيق ${file} ...`);
    try {
      await client.query("begin");
      await client.query(sql);
      await client.query("insert into public.schema_migrations(name) values ($1)", [file]);
      await client.query("commit");
      ran++;
      console.log(`✅ ${file}`);
    } catch (err) {
      await client.query("rollback");
      console.error(`❌ فشل ${file}:\n${err.message}`);
      process.exit(1);
    }
  }

  console.log(ran === 0 ? "✨ لا جديد — القاعدة محدَّثة." : `✨ اكتمل: ${ran} ترحيل جديد.`);
} finally {
  await client.end();
}
