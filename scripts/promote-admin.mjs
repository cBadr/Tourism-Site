/**
 * ترقية مستخدم إلى admin — الاستخدام:  node scripts/promote-admin.mjs email@example.com
 * يتطلب DATABASE_URL في .env.local. آمن للتكرار.
 */
import { config } from "dotenv";
import pg from "pg";

config({ path: new URL("../.env.local", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"), quiet: true });

const email = process.argv[2];
if (!email) {
  console.error("❌ الاستخدام: node scripts/promote-admin.mjs email@example.com");
  process.exit(1);
}

const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
try {
  const r = await c.query(
    `update public.profiles p set role = 'admin'
     from auth.users u
     where u.id = p.id and lower(u.email) = lower($1)
     returning u.email`,
    [email]
  );
  if (r.rowCount === 0) {
    console.error(`❌ لا يوجد مستخدم بهذا البريد: ${email}\n   أنشئ الحساب أولاً من لوحة Supabase: Authentication ← Users ← Add user`);
    process.exit(1);
  }
  console.log(`✅ ${r.rows[0].email} أصبح admin.`);
} finally {
  await c.end();
}
