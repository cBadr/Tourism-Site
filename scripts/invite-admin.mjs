/**
 * دعوة مدير — الاستخدام:  node scripts/invite-admin.mjs email@example.com
 * يرسل بريد دعوة رسمياً من Supabase (المستخدم يحدد كلمة مروره بنفسه من الرابط)،
 * ثم يرقّي الحساب إلى admin فوراً. لا تمر أي كلمة مرور من هنا إطلاقاً.
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import pg from "pg";

config({ path: new URL("../.env.local", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"), quiet: true });

const email = process.argv[2];
if (!email) {
  console.error("❌ الاستخدام: node scripts/invite-admin.mjs email@example.com");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const siteUrl = process.env.SITE_URL ?? "http://localhost:3000";
if (!url || !serviceKey) {
  console.error("❌ NEXT_PUBLIC_SUPABASE_URL أو SUPABASE_SERVICE_ROLE_KEY غير موجودين في .env.local");
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
  redirectTo: `${siteUrl}/admin/set-password`,
});

if (error) {
  if (String(error.message).toLowerCase().includes("already")) {
    console.log(`ℹ️  ${email} موجود بالفعل — سنكتفي بالترقية.`);
  } else {
    console.error(`❌ فشل إرسال الدعوة: ${error.message}`);
    process.exit(1);
  }
} else {
  console.log(`📧 أُرسلت الدعوة إلى ${data.user?.email} — الرابط يوجه إلى ${siteUrl}/admin/set-password`);
}

// الترقية إلى admin (الملف الشخصي أُنشئ تلقائياً بالمشغّل)
if (process.env.DATABASE_URL) {
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    const r = await c.query(
      `update public.profiles p set role = 'admin'
       from auth.users u
       where u.id = p.id and lower(u.email) = lower($1)
       returning u.email, p.role`,
      [email]
    );
    console.log(r.rowCount ? `✅ ${r.rows[0].email} أصبح admin.` : "⚠️ لم يُعثر على الملف الشخصي — شغّل scripts/promote-admin.mjs بعد قليل.");
  } finally {
    await c.end();
  }
} else {
  console.log("⚠️ DATABASE_URL غير موجود — شغّل scripts/promote-admin.mjs يدوياً.");
}
