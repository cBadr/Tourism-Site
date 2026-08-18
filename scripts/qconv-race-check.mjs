/**
 * qconv-race-check.mjs — تحويلان **متزامنان** لطلبٍ واحد ⇒ حجزٌ واحد
 *
 *   node scripts/qconv-race-check.mjs
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  لماذا سكربتٌ خارج `supabase/tests` — والسبب مقيسٌ لا تفضيليّ
 * ══════════════════════════════════════════════════════════════════════════
 *
 * مجموعات `db:test` تُنفَّذ كلٌّ منها في **جلسةٍ واحدة ومعاملةٍ واحدة**، فلا
 * سبيل فيها إلى وصلةٍ ثانية: `dblink` و`postgres_fdw` **غير مثبَّتتين** على هذه
 * القاعدة (مقيس من `pg_extension` في 2026-08-18)، و`max_prepared_transactions`
 * صفر. وتثبيتُ امتدادٍ يفتح وصلاتٍ صادرة في قاعدة إنتاجٍ لأجل اختبار **ثمنٌ
 * أمنيّ لا يُدفع**.
 *
 * ⚠ **والتأكيد التتالي ليس برهانَ تزامن.** «حوِّل ثم حوِّل ثانيةً» يقيس أن الحالة
 *   صارت «محوَّل»؛ وهو يمرّ حتى لو كانت الدالة بلا قفلٍ إطلاقاً. والعطبُ الذي
 *   يخشاه المالك مختلف: **ضغطتان في اللحظة نفسها**، أو موظفان، أو إرسالٌ مزدوج
 *   من المتصفح — وحينها تقرأ الجلستان الحالة «مسعَّر» معاً وتُنشئ كلٌّ حجزاً.
 *
 * ── ما يفعله هذا السكربت حرفياً ────────────────────────────────────────────
 *
 *   S: يُنشئ طلباً مسعَّراً **ويُكمّه** ليراه الآخران (وصلتان لا تريان معاملةً مفتوحة)
 *   A: begin ← تحويل ← ينجح ويُمسك القفل، **ولا يكمّ**
 *   B: begin ← تحويل ← **يقف على `for update`** (هذا هو السباق الحقيقي)
 *   A: commit ⇒ يُفرج عن القفل
 *   B: يستيقظ، يُعيد تقييم الصفّ فيجده «محوَّل» ⇒ يُرفض بـ`already-converted`
 *
 * 🔬 وبرهانُ أن B **انتظر فعلاً** رقميّ لا لفظيّ: يُقاس زمنه من الإرسال إلى
 *    الرد، ويجب أن يتجاوز المدة التي أبقينا A فيها مفتوحاً. فلو مرّ B فوراً
 *    لكان قد قرأ صفّاً غير مقفول — وهو بعينه العطب.
 *
 * 🔒 ولا يُخلَّف صفّ: التنظيف في `finally` بوسم `QCRACE-FIXTURE`، ويشمل
 *    **الإشعارات** — كل تحويلٍ يُطابر `booking_created` لقناة التشغيل، وتركُه
 *    يعني أن العامل يُبرِق للمالك عن عميلٍ لا وجود له.
 */
import { config } from "dotenv";
import pg from "pg";

config({ path: ".env.local", quiet: true });

if (!process.env.DATABASE_URL) {
  console.error("❌ DATABASE_URL غير موجود في .env.local");
  process.exit(1);
}

const TAG = "QCRACE-FIXTURE";
const HOLD_MS = 1500; // المدة التي يبقى فيها A مفتوحاً — وأرضيةُ انتظار B

const connect = async () => {
  const c = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  return c;
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
const check = (ok, label, extra = "") => {
  console.log(`   ${ok ? "✔" : "🔴"} ${label}${extra ? " — " + extra : ""}`);
  if (!ok) failures++;
};

const S = await connect();
let A = null;
let B = null;
let adminId = null;
let adminTemp = false;

try {
  // ── (٠) أرضٌ نظيفة + هوية مشرف ─────────────────────────────────────────
  await S.query(
    `delete from public.notifications where payload->>'customerName' like $1`,
    [`%${TAG}%`]
  );
  await S.query(`delete from public.quote_requests where customer_name like $1`, [`%${TAG}%`]);
  await S.query(`delete from public.bookings where customer_name like $1`, [`%${TAG}%`]);

  const admin = await S.query(`select id from public.profiles where role = 'admin' limit 1`);
  if (admin.rows.length > 0) {
    adminId = admin.rows[0].id;
  } else {
    adminId = "0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b";
    await S.query(`delete from auth.users where id = $1`, [adminId]);
    await S.query(`insert into auth.users (id, email) values ($1, 'qcrace@local.invalid')`, [adminId]);
    await S.query(
      `insert into public.profiles (id, role, full_name) values ($1,'admin','مشرف سباق مؤقت')
       on conflict (id) do update set role = 'admin'`,
      [adminId]
    );
    adminTemp = true;
  }

  // ⚠ الفئة تُقرأ من القاعدة لا تُسمّى نصّاً: أسماء الفئات إعدادُ مالكٍ يتغيّر
  const cls = await S.query(
    `select vc.slug from public.vehicle_classes vc
      where vc.active and vc.capacity >= 4 and vc.luggage_capacity >= 2
      order by vc.capacity asc limit 1`
  );
  if (cls.rows.length === 0) throw new Error("لا فئة مفعَّلة تتسع لأربعة ركاب — لا يُقاس السباق");
  const classSlug = cls.rows[0].slug;

  // ── (١) طلبٌ مسعَّر، **مكموم** ليراه المتسابقان ──────────────────────────
  await S.query(`select set_config('request.jwt.claim.sub', $1, false)`, [adminId]);
  const q = await S.query(
    `select * from public.create_quote_request(
       null, $1, '01000000301', 'رحلة قياس السباق',
       'ميدان التحرير', 30.0444, 31.2357, null, null, null,
       now() + interval '20 days', 4, 2)`,
    [`عميل ${TAG}`]
  );
  const quoteId = q.rows[0].id;
  await S.query(`select public.set_quote_request_status($1, 'quoted', 9000, null)`, [quoteId]);
  console.log(`\n▶ طلبٌ مسعَّر جاهز: ${q.rows[0].reference}`);

  // ── (٢) السباق ──────────────────────────────────────────────────────────
  A = await connect();
  B = await connect();
  for (const c of [A, B]) {
    await c.query("begin");
    await c.query(`select set_config('request.jwt.claim.sub', $1, true)`, [adminId]);
  }

  const CALL = `select * from public.convert_quote_request($1, $2, 3000, 'الإسكندرية')`;

  // A يُحوّل ويُمسك القفل ولا يكمّ
  const resA = await A.query(CALL, [quoteId, classSlug]);
  check(resA.rows.length === 1, "A: التحويل نجح داخل معاملةٍ مفتوحة", resA.rows[0]?.booking_reference);

  /**
   * 🔒 الإشعار يُمحى **داخل معاملة A قبل كمّها** لا بعدها.
   *
   * `log_booking_change` تُطابر `booking_created` لقناة التشغيل مع كل حجز،
   * وعاملُ الإشعارات مجدولٌ **كل دقيقة على القاعدة نفسها** من الموقع المنشور.
   * فحذفُه بعد الكمّ كان يترك نافذةً — قصيرةً لكنها حقيقية — يلتقط فيها العامل
   * صفّاً فيُبرِق للمالك عن «عميل QCRACE-FIXTURE» الذي لا وجود له.
   * والحذف قبل الكمّ يجعل الحالة المكمومة **بلا صفِّ إشعارٍ إطلاقاً**، فلا نافذة.
   */
  await A.query(`delete from public.notifications where payload->>'customerName' like $1`, [`%${TAG}%`]);

  // B يُرسل الآن — ويجب أن **يقف**
  const t0 = Date.now();
  let errB = null;
  const pB = B.query(CALL, [quoteId, classSlug]).catch((e) => {
    errB = e;
    return null;
  });

  await sleep(HOLD_MS);
  const stillWaiting = errB === null;
  check(stillWaiting, `B: ما زال واقفاً بعد ${HOLD_MS} مللي — أي أنه على قفل A`);

  // 🔬 وبرهانٌ من القاعدة نفسها لا من المهلة وحدها: الجلسة موقوفة على قفل صف
  const waits = await S.query(
    `select count(*)::int n from pg_stat_activity
      where wait_event_type = 'Lock' and state = 'active'
        and query ilike '%convert_quote_request%'`
  );
  check(waits.rows[0].n >= 1, "القاعدة تُبلّغ عن جلسةٍ موقوفة على قفل", `wait_event_type=Lock ×${waits.rows[0].n}`);

  await A.query("commit");
  await pB;
  const waitedMs = Date.now() - t0;

  // ── (٣) الحكم ───────────────────────────────────────────────────────────
  check(errB !== null, "B: رُفض ولم يُنشئ حجزاً ثانياً");
  check(
    errB?.hint === "already-converted",
    "B: رمز الرفض `already-converted`",
    `الرمز = ${errB?.hint ?? "بلا"}`
  );
  check(
    waitedMs >= HOLD_MS,
    "B: انتظر فعلاً لا مرّ فوراً",
    `${waitedMs} مللي ≥ ${HOLD_MS} مللي`
  );

  await B.query("rollback").catch(() => {});

  const rows = await S.query(
    `select count(*)::int n from public.bookings where customer_name like $1`,
    [`%${TAG}%`]
  );
  check(rows.rows[0].n === 1, "🔒 الحصيلة: حجزٌ **واحد** لا حجزان", `العدد = ${rows.rows[0].n}`);

  const qr = await S.query(
    `select status, booking_id from public.quote_requests where id = $1`,
    [quoteId]
  );
  check(
    qr.rows[0]?.status === "converted" && qr.rows[0]?.booking_id !== null,
    "والطلب «محوَّل» مرتبطٌ بحجزٍ واحد"
  );
} finally {
  // ── (٤) التنظيف — لا يُخلَّف صفٌّ ولا إشعار ─────────────────────────────
  for (const c of [A, B]) {
    if (c) {
      await c.query("rollback").catch(() => {});
      await c.end().catch(() => {});
    }
  }
  await S.query(
    `delete from public.notifications where payload->>'customerName' like $1`,
    [`%${TAG}%`]
  ).catch(() => {});
  await S.query(`delete from public.quote_requests where customer_name like $1`, [`%${TAG}%`]).catch(() => {});
  await S.query(`delete from public.bookings where customer_name like $1`, [`%${TAG}%`]).catch(() => {});
  if (adminTemp && adminId) {
    await S.query(`delete from public.profiles where id = $1`, [adminId]).catch(() => {});
    await S.query(`delete from auth.users where id = $1`, [adminId]).catch(() => {});
  }
  const left = await S
    .query(
      `select (select count(*) from public.quote_requests where customer_name like $1)
            + (select count(*) from public.bookings      where customer_name like $1)
            + (select count(*) from public.notifications where payload->>'customerName' like $1) n`,
      [`%${TAG}%`]
    )
    .catch(() => ({ rows: [{ n: "?" }] }));
  console.log(`   ${left.rows[0].n === "0" ? "✔" : "🔴"} التنظيف — بقايا: ${left.rows[0].n}`);
  if (left.rows[0].n !== "0") failures++;
  await S.end().catch(() => {});
}

console.log(failures === 0 ? "\nALL PASSED — تحويلان متزامنان ⇒ حجزٌ واحد\n" : `\n🔴 ${failures} إخفاق\n`);
process.exit(failures === 0 ? 0 : 1);
