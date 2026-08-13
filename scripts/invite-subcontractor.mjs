/**
 * دعوة متعهد — الاستخدام:
 *   node scripts/invite-subcontractor.mjs email@example.com "اسم الشركة" [01xxxxxxxxx]
 *
 * يرسل بريد دعوة رسمياً من Supabase (المتعهد يحدد كلمة مروره بنفسه من الرابط)،
 * ثم يُنشئ صف المتعهد أو يربطه بحسابه ويضبط دوره على subcontractor.
 * لا تمر أي كلمة مرور من هنا إطلاقاً ولا تُطبع في المخرجات.
 *
 * شقيق scripts/invite-admin.mjs بنفس الترتيب: دعوة ← ثم ترقية عبر DATABASE_URL.
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import pg from "pg";

config({ path: new URL("../.env.local", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"), quiet: true });

const email = process.argv[2];
const companyName = process.argv[3];
const phone = process.argv[4] ?? null;

if (!email || !companyName) {
  console.error('❌ الاستخدام: node scripts/invite-subcontractor.mjs email@example.com "اسم الشركة" [01xxxxxxxxx]');
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

// ── (١) الدعوة ───────────────────────────────────────────────────────────────
let userId = null;

const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
  redirectTo: `${siteUrl}/admin/set-password`,
});

if (error) {
  if (String(error.message).toLowerCase().includes("already")) {
    console.log(`ℹ️  ${email} موجود بالفعل — سنكتفي بالربط وضبط الدور.`);
    const { data: list, error: listError } = await admin.auth.admin.listUsers({ perPage: 1000 });
    if (listError) {
      console.error(`❌ فشل جلب المستخدمين: ${listError.message}`);
      process.exit(1);
    }
    userId = list.users.find((u) => (u.email ?? "").toLowerCase() === email.toLowerCase())?.id ?? null;
  } else {
    console.error(`❌ فشل إرسال الدعوة: ${error.message}`);
    process.exit(1);
  }
} else {
  userId = data.user?.id ?? null;
  console.log(`📧 أُرسلت الدعوة إلى ${data.user?.email} — الرابط يوجه إلى ${siteUrl}/admin/set-password`);
}

// ── (٢) صف المتعهد والدور ────────────────────────────────────────────────────
if (!process.env.DATABASE_URL) {
  console.log("⚠️ DATABASE_URL غير موجود — لم يُنشأ صف المتعهد ولم يُضبط الدور. أضفه في .env.local وأعد تشغيل الأمر.");
  process.exit(0);
}

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await client.connect();

try {
  // الربط بالبريد: الصف الموجود يُحدَّث ولا يُستنسخ، فلا يتكرر الشريك بحسابين
  const existing = await client.query(
    `select id, company_name, profile_id from public.subcontractors where lower(email) = lower($1) limit 1`,
    [email]
  );

  if (existing.rowCount) {
    const row = existing.rows[0];
    await client.query(
      `update public.subcontractors
          set profile_id = coalesce($2, profile_id),
              phone      = coalesce($3, phone)
        where id = $1`,
      [row.id, userId, phone]
    );
    console.log(`🔗 رُبط المتعهد القائم «${row.company_name}» بحساب الدخول (الحالة كما هي).`);
  } else {
    try {
      const inserted = await client.query(
        `insert into public.subcontractors (company_name, email, phone, status, profile_id)
         values ($1, $2, $3, 'pending', $4)
         returning id`,
        [companyName, email, phone, userId]
      );
      console.log(`✅ أُنشئ المتعهد «${companyName}» بحالة «بانتظار الاعتماد» (${inserted.rows[0].id}).`);
    } catch (insertError) {
      // 23502 = عمود إلزامي فارغ؛ الرقم هو المرشح الوحيد الذي لا يُشتق من الوسائط
      if (insertError.code === "23502") {
        console.error('❌ رقم الموبايل إلزامي — أعد التشغيل مع الرقم: node scripts/invite-subcontractor.mjs "البريد" "اسم الشركة" 01xxxxxxxxx');
        process.exit(1);
      }
      if (insertError.code === "42P01") {
        console.error("❌ جدول public.subcontractors غير موجود — نفّذ هجرة المرحلة ٥ أولاً: pnpm db:migrate");
        process.exit(1);
      }
      throw insertError;
    }
  }

  // الدور يفتح البوابة ويمنع رؤية أي بيانات عميل — يُضبط بعد وجود الملف الشخصي
  const promoted = await client.query(
    `update public.profiles p set role = 'subcontractor'
       from auth.users u
      where u.id = p.id and lower(u.email) = lower($1)
      returning u.email, p.role`,
    [email]
  );
  console.log(
    promoted.rowCount
      ? `✅ ${promoted.rows[0].email} أصبح دوره subcontractor.`
      : "⚠️ لم يُعثر على الملف الشخصي بعد — أعد تشغيل الأمر بعد قليل ليُضبط الدور."
  );

  console.log("🔒 لا كلمة مرور في هذه العملية: المتعهد يحددها بنفسه من رابط الدعوة.");
} finally {
  await client.end();
}
