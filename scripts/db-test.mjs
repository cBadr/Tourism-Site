/**
 * مُشغّل اختبارات قاعدة البيانات — الاستخدام:
 *   node scripts/db-test.mjs               (كل ملفات supabase/tests)
 *   node scripts/db-test.mjs booking       (الملفات التي يطابق اسمها النص)
 *
 * يوقف التنفيذ عند أول خطأ داخل الملف (كل ملف في معاملة واحدة) ويطبع
 * إشعارات Postgres كما هي — النجاح يعني ظهور «ALL PASSED».
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

let failed = 0;
for (const file of files) {
  console.log(`\n▶ ${file}`);
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  client.on("notice", (n) => console.log("   " + n.message));
  try {
    await client.connect();
    await client.query(readFileSync(join(dir, file), "utf8"));
  } catch (err) {
    failed++;
    console.error(`   ❌ ${err.message}${err.hint ? ` (${err.hint})` : ""}`);
  } finally {
    await client.end().catch(() => {});
  }
}

process.exit(failed === 0 ? 0 : 1);
