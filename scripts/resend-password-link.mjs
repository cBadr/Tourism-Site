/**
 * إعادة إرسال رابط تعيين كلمة المرور — الاستخدام:
 *   node scripts/resend-password-link.mjs email@example.com
 * يجرب أولاً بريد استعادة كلمة المرور؛ فإن رفضه الحساب المدعو غير المؤكد،
 * يحذف حساب الدعوة الفارغ ويعيد الدعوة من جديد (ثم يعيد ترقية admin).
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import pg from "pg";

config({ path: new URL("../.env.local", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"), quiet: true });

const email = process.argv[2];
if (!email) {
  console.error("❌ الاستخدام: node scripts/resend-password-link.mjs email@example.com");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const siteUrl = process.env.SITE_URL ?? "http://localhost:3000";
const redirectTo = `${siteUrl}/admin/set-password`;

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const anon = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });

async function promote() {
  if (!process.env.DATABASE_URL) return;
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    const r = await c.query(
      `update public.profiles p set role='admin' from auth.users u
       where u.id = p.id and lower(u.email)=lower($1) returning u.email`,
      [email]
    );
    if (r.rowCount) console.log(`✅ ${r.rows[0].email} دوره admin.`);
  } finally {
    await c.end();
  }
}

// المحاولة ١: بريد استعادة كلمة المرور (يصلح للحسابات المؤكدة وغالباً للمدعوة)
const { error: resetErr } = await anon.auth.resetPasswordForEmail(email, { redirectTo });
if (!resetErr) {
  console.log(`📧 أُرسل رابط تعيين كلمة المرور إلى ${email} (صالح لمدة ساعة) — يفتح ${redirectTo}`);
  await promote();
  process.exit(0);
}

console.log(`ℹ️ تعذر الإرسال كاستعادة (${resetErr.message}) — سنعيد الدعوة من الصفر.`);

// المحاولة ٢: حذف حساب الدعوة الفارغ وإعادة الدعوة
const { data: list, error: listErr } = await admin.auth.admin.listUsers({ perPage: 1000 });
if (listErr) {
  console.error(`❌ فشل جلب المستخدمين: ${listErr.message}`);
  process.exit(1);
}
const user = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
if (user) {
  if (user.last_sign_in_at) {
    console.error("❌ هذا الحساب سبق أن سجّل دخولاً — لن أحذفه. استخدم «نسيت كلمة المرور» من صفحة الدخول.");
    process.exit(1);
  }
  const { error: delErr } = await admin.auth.admin.deleteUser(user.id);
  if (delErr) {
    console.error(`❌ فشل حذف حساب الدعوة: ${delErr.message}`);
    process.exit(1);
  }
  console.log("🧹 حُذف حساب الدعوة الفارغ (لم يُستخدم قط).");
}

const { error: invErr } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo });
if (invErr) {
  console.error(`❌ فشل إرسال الدعوة الجديدة: ${invErr.message}`);
  process.exit(1);
}
console.log(`📧 أُرسلت دعوة جديدة إلى ${email} (صالحة لمدة ساعة تقريباً) — افتحها فور وصولها.`);
await promote();
