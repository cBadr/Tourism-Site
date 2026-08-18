/**
 * تنظيفُ صفوف الفيكسترة من سجلّ الإشعارات — **سكربتٌ بيد المالك، لا فعلٌ آليّ**.
 *
 *   node scripts/notification-fixture-cleanup.mjs            ← جافّ: يعدّ ويعرض ولا يحذف
 *   node scripts/notification-fixture-cleanup.mjs --apply    ← يحذف فعلاً (بعد عرضِ ما سيُحذف)
 *   node scripts/notification-fixture-cleanup.mjs --sample 20
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  لماذا يوجد هذا الملف
 * ══════════════════════════════════════════════════════════════════════════
 *
 * كان `scripts/db-test.mjs` يكمّ ما تكتبه كلُّ مجموعةِ اختبار على قاعدة
 * الإنتاج. فتراكم في سجلّ إشعارات المالك — الذي يقرؤه جرسُ اللوحة — **١٥٦٥
 * صفَّ حجزٍ وهميّ من أصل ١٦١٠**. ومُنع التراكم من الآن (المُشغّل يفتح معاملةً
 * لكل ملف ويُرجعها)، **لكن ما تراكم لا يُحذف بلا كلمة المالك**
 * (`docs/STANDING-ORDERS.md §٣`: «حذف أو تعديل بياناته الحقيقية… يُذكر أيُّ
 * صفٍّ سيُمسّ ويُنتظر رده»).
 *
 * ── كيف يُميَّز صفُّ الفيكسترة — بشرطين معاً، لا بواحد ──────────────────────
 *
 *   ١) **يتيم**: `payload->>'bookingId'` معرّفٌ صالح **ولا حجزَ بذلك المعرّف**.
 *      ومجموعاتُ الاختبار كانت تحذف حجوزَها في تنظيفها ولا تحذف إشعاراتها
 *      (لا مفتاحَ أجنبيّ يربط الجدولين) — فاليُتم أثرُها الأول.
 *   ٢) **موسوم**: الحمولة تحمل اسمَ فيكسترةٍ صريحاً (‏`CUSTOMER_TESTS` ·
 *      `DISCOUNT_TESTS_FIXTURE` · `PHONE_TESTS_FIXTURE` · `PROBE-VERIFY` ·
 *      `ZZ_ISOLATION` · `REVIEW-`).
 *
 * والشرطان معاً بقصد: **اليُتم وحده لا يكفي**. حجزُ عميلٍ حقيقيٍّ حذفه مشرفٌ من
 * اللوحة يصير يتيماً هو الآخر، وإشعارُه تاريخٌ حقيقيّ. فما لا يحمل وسماً
 * **يُعرَض ولا يُحذف** — ولو أراد المالك حذفه فبعينه لا بجملة.
 *
 * ⚠ وما لا يمسّه هذا السكربت إطلاقاً:
 *   • كلُّ صفٍّ حجزُه ما زال قائماً (‏٤٥ صفاً: حجوز المالك السبعة عشر وأحداثها).
 *   • صفوفُ `quote_requested` الأربعة (بلا `bookingId` أصلاً) — ثلاثةٌ منها
 *     طلباتُ عرضٍ حيّة، ومنها `RQ-ZF83NH`.
 *   • أيُّ جدولٍ آخر. لا `bookings`، ولا `audit_log` (وهو مُلحَقٌ فقط بعد 0110).
 */
import { config } from "dotenv";
import pg from "pg";

config({ path: ".env.local", quiet: true });

if (!process.env.DATABASE_URL) {
  console.error("❌ DATABASE_URL غير موجود في .env.local");
  process.exit(1);
}

const apply = process.argv.includes("--apply");
const sampleIdx = process.argv.indexOf("--sample");
const sampleSize = sampleIdx !== -1 ? Number(process.argv[sampleIdx + 1]) || 8 : 8;

/**
 * الشروط، نسخةٌ واحدة لكل من العدّ والعرض والحذف.
 * و`coalesce(..., '')` مقصود: `null like '…'` تعطي NULL لا false، فصفٌّ بلا
 * اسمٍ ولا ملاحظات كان يسقط من المجموعتين معاً فلا يُحصى ولا يُعرَض.
 */
const MARKER = `(
        coalesce(n.payload ->> 'customerName', '') like 'CUSTOMER_TESTS%'
     or coalesce(n.payload ->> 'customerName', '') like 'REVIEW-%'
     or coalesce(n.payload -> 'trip' ->> 'notes', '') ~ '^(DISCOUNT_TESTS|PHONE_TESTS|PROBE-VERIFY|ZZ_ISOLATION|REVIEW-)'
  )`;

const WHERE_ORPHAN = `
      n.payload ->> 'bookingId' ~ '^[0-9a-fA-F-]{36}$'
  and not exists (select 1 from public.bookings b
                   where b.id = (n.payload ->> 'bookingId')::uuid)`;

const WHERE_FIXTURE = `${WHERE_ORPHAN} and ${MARKER}`;
const WHERE_UNMARKED = `${WHERE_ORPHAN} and not ${MARKER}`;

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const q = async (sql, params) => (await client.query(sql, params)).rows;

try {
  await client.connect();

  const [{ total }] = await q("select count(*)::int as total from public.notifications");
  const [{ orphans }] = await q(
    `select count(*)::int as orphans from public.notifications n where ${WHERE_ORPHAN}`
  );
  const [{ fixtures }] = await q(
    `select count(*)::int as fixtures from public.notifications n where ${WHERE_FIXTURE}`
  );
  const unmarked = orphans - fixtures;

  console.log("\n📋 سجلّ الإشعارات — الحال الآن");
  console.log(`   المجموع                       : ${total}`);
  console.log(`   حجزُه قائم (‏لا يُمسّ)          : ${total - orphans}`);
  console.log(`   يتيمٌ **وموسومٌ** ⇒ مرشَّحٌ للحذف : ${fixtures}`);
  console.log(`   يتيمٌ بلا وسم  ⇒ يُعرَض ولا يُحذف : ${unmarked}`);

  const byTag = await q(`
    select coalesce(
             nullif(substring(n.payload -> 'trip' ->> 'notes' from '^[A-Za-z_0-9-]+'), ''),
             substring(n.payload ->> 'customerName' from '^[A-Za-z_0-9-]+'),
             '(‏وسمٌ غيرُ لاتيني)') as tag,
           count(*)::int as n,
           min(n.created_at) as first_at,
           max(n.created_at) as last_at
      from public.notifications n
     where ${WHERE_FIXTURE}
     group by 1 order by 2 desc`);
  console.log("\n   التوزيع بالوسم:");
  for (const r of byTag) {
    console.log(
      `     ${String(r.n).padStart(5)}  ${r.tag}   (${r.first_at.toISOString()} ← ${r.last_at.toISOString()})`
    );
  }

  if (unmarked > 0) {
    const rows = await q(`
      select n.id, n.created_at, n.payload ->> 'reference' as ref,
             n.payload ->> 'customerName' as customer,
             n.payload -> 'trip' ->> 'notes' as notes
        from public.notifications n
       where ${WHERE_UNMARKED}
       order by n.created_at desc limit 50`);
    console.log(`\n   ⚠ يتيمٌ بلا وسم (${unmarked}) — يُقرَّر فيه بعينه لا بجملة:`);
    for (const r of rows) {
      console.log(
        `     ${r.created_at.toISOString()}  ${r.ref ?? "—"}  «${r.customer ?? "—"}»  ${r.notes ?? ""}`
      );
    }
  }

  const sample = await q(
    `select n.created_at, n.payload ->> 'reference' as ref,
            n.payload ->> 'customerName' as customer,
            n.payload -> 'trip' ->> 'notes' as notes
       from public.notifications n where ${WHERE_FIXTURE}
      order by n.created_at desc limit $1`,
    [sampleSize]
  );
  console.log(`\n   عيّنة من المرشَّح للحذف (أحدث ${sample.length}):`);
  for (const r of sample) {
    console.log(
      `     ${r.created_at.toISOString()}  ${r.ref ?? "—"}  «${r.customer ?? "—"}»  ${r.notes ?? ""}`
    );
  }

  if (!apply) {
    console.log(
      `\n🟡 تشغيلٌ جافّ — لم يُحذف صفٌّ واحد.` +
        `\n   للحذف فعلاً: node scripts/notification-fixture-cleanup.mjs --apply` +
        `\n   والحذفُ قرارُ المالك وحده (docs/STANDING-ORDERS.md §٣).`
    );
    process.exit(0);
  }

  await client.query("begin");
  const res = await client.query(
    `delete from public.notifications n where ${WHERE_FIXTURE}`
  );
  const [{ left }] = (await client.query("select count(*)::int as left from public.notifications")).rows;
  if (res.rowCount !== fixtures) {
    await client.query("rollback");
    console.error(
      `\n❌ العدد تحرّك أثناء التنفيذ (${fixtures} ⇐ ${res.rowCount}) — أُرجع كلُّ شيء. أعِد التشغيل الجافّ أولاً.`
    );
    process.exit(1);
  }
  await client.query("commit");
  console.log(`\n✅ حُذف ${res.rowCount} صفَّ فيكسترة. الباقي في السجلّ: ${left} صفاً.`);
} catch (err) {
  await client.query("rollback").catch(() => {});
  console.error(`❌ ${err.message}`);
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
