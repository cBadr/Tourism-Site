/**
 * تحقق حي من المرحلة ٥ — يُنفَّذ على قاعدة البيانات الفعلية.
 *
 *   node scripts/demo-subcontractor.mjs          إنشاء السيناريو وعرضه
 *   node scripts/demo-subcontractor.mjs --clean  حذف كل بيانات العرض
 *
 * السيناريو: مسار القاهرة ← الإسكندرية يُسعَّر بتعريفة الكيلومتر، ثم يدخل
 * متعهد بقائمة أسعار تغطيه، فيتحول السعر إلى «تكلفة المتعهد + الهامش».
 * كل خطوة تمر بالدوال الحقيقية (upsert/submit/review) بهوية مشرف حقيقية،
 * لا بكتابة مباشرة في الجداول — وإلا لما كان التحقق تحققاً.
 */
import { config } from "dotenv";
import pg from "pg";

config({ path: new URL("../.env.local", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"), quiet: true });

const SUB_ID = "d0000000-0000-4000-8000-00000000d001";
const LIST_ID = "d1000000-0000-4000-8000-00000000d001";
const CLEAN = process.argv.includes("--clean");

// نقاط السيناريو
const CAIRO = { lat: 30.0444, lng: 31.2357, label: "القاهرة" };
const ALEX = { lat: 31.2001, lng: 29.9187, label: "الإسكندرية" };
const HELIOPOLIS = { lat: 30.088, lng: 31.322, label: "مصر الجديدة" };
const MAAMOURA = { lat: 31.279, lng: 30.017, label: "المعمورة" };
const DIST_CAIRO_ALEX = 218.3;

const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

const money = (n) => (n === null || n === undefined ? "—" : `${Number(n).toLocaleString("ar-EG")} ج.م`);
const line = (s = "") => console.log(s);
const head = (s) => { line(); line(`── ${s} ${"─".repeat(Math.max(0, 58 - s.length))}`); };

async function quote(from, to, passengers = 2) {
  const { rows } = await c.query(
    `select class_title, total, price_source, subcontractor_cost, margin_amount
       from public.quote_price($1,$2,false,0,$3,$4,$5,$6)`,
    [DIST_CAIRO_ALEX, passengers, from.lat, from.lng, to.lat, to.lng]
  );
  return rows;
}

function show(rows) {
  for (const r of rows) {
    const src = r.price_source === "subcontractor" ? "سعر متعهد" : "تعريفة كيلومتر";
    const extra =
      r.price_source === "subcontractor"
        ? `  (تكلفة ${money(r.subcontractor_cost)} + هامش ${money(r.margin_amount)})`
        : "";
    line(`   ${r.class_title.padEnd(10)} ${money(r.total).padStart(14)}   [${src}]${extra}`);
  }
}

try {
  if (CLEAN) {
    await c.query("delete from public.bookings where customer_name = 'عميل العرض التجريبي'");
    await c.query("delete from public.subcontractors where id = $1", [SUB_ID]);
    line("🧹 حُذفت بيانات العرض التجريبي بالكامل.");
    process.exit(0);
  }

  // هوية مشرف حقيقية — الاعتماد يمر بـ is_admin() فلا يصح تخطيه
  const { rows: admins } = await c.query(
    "select p.id, u.email from public.profiles p join auth.users u on u.id = p.id where p.role = 'admin' limit 1"
  );
  if (!admins.length) throw new Error("لا يوجد مشرف — أنشئ حسابك أولاً");
  const admin = admins[0];
  await c.query("select set_config('request.jwt.claim.sub', $1, false)", [admin.id]);
  line(`👤 يعمل بصلاحيات المشرف: ${admin.email}`);

  head("١) السعر قبل دخول أي متعهد — تعريفة الكيلومتر");
  show(await quote(CAIRO, ALEX));

  head("٢) إنشاء متعهد واعتماده");
  await c.query(
    `insert into public.subcontractors (id, company_name, contact_name, phone, whatsapp, status)
     values ($1,'شركة النيل للنقل السياحي','محمود النجار','01000111222','201000111222','approved')
     on conflict (id) do update set status = 'approved'`,
    [SUB_ID]
  );
  line("   ✔ «شركة النيل للنقل السياحي» — الحالة: معتمد");

  head("٣) المتعهد يرسم قائمة أسعاره (القاهرة ↔ الإسكندرية، نطاق ٥٠ كم لكل طرف)");
  // p_id = null يعني إنشاء قائمة جديدة؛ تمرير معرّف غير موجود يعتبره تعديلاً فيرفض
  const { rows: created } = await c.query(
    `select * from public.upsert_price_list(
       p_id               => null,
       p_title            => 'القاهرة ↔ الإسكندرية',
       p_origin_label     => $1::text,
       p_origin_lat       => $2::numeric,
       p_origin_lng       => $3::numeric,
       p_origin_radius_km => 50,
       p_dest_label       => $4::text,
       p_dest_lat         => $5::numeric,
       p_dest_lng         => $6::numeric,
       p_dest_radius_km   => 50,
       p_bidirectional    => true,
       p_items            => $7::jsonb,
       p_subcontractor_id => $8::uuid
     )`,
    [
      CAIRO.label, CAIRO.lat, CAIRO.lng,
      ALEX.label, ALEX.lat, ALEX.lng,
      JSON.stringify([
        { classSlug: "sedan", cost: 1800 },
        { classSlug: "suv", cost: 2600 },
      ]),
      SUB_ID,
    ]
  );
  const listId = created[0].id;
  line(`   ✔ سيدان بتكلفة ١٬٨٠٠ · SUV بتكلفة ٢٬٦٠٠ — الحالة: ${created[0].status}`);

  head("٤) السعر والقائمة لم تُعتمد بعد — لا شيء يتغير");
  show(await quote(CAIRO, ALEX));

  head("٥) المشرف يعتمد القائمة");
  await c.query("select public.submit_price_list($1)", [listId]);
  await c.query("select public.review_price_list($1, true, 'أسعار مقبولة — معتمدة')", [listId]);
  const { rows: st } = await c.query("select status from public.price_lists where id = $1", [listId]);
  line(`   ✔ حالة القائمة: ${st[0].status}`);

  head("٦) السعر بعد الاعتماد — تكلفة المتعهد + هامشك");
  show(await quote(CAIRO, ALEX));

  head("٧) مثال الرؤية حياً: مصر الجديدة ← المعمورة (نقطتان لم تُسجَّلا أصلاً)");
  line("   لا توجد قائمة بهذا الاسم — التغطية تُحسب بالنطاق حول طرفَي القاهرة/الإسكندرية");
  show(await quote(HELIOPOLIS, MAAMOURA));

  head("٨) رحلة خارج التغطية (القاهرة ← أسوان) ترجع للتعريفة");
  const { rows: aswan } = await c.query(
    `select class_title, total, price_source from public.quote_price(880,2,false,0,$1,$2,24.0889,32.8998)`,
    [CAIRO.lat, CAIRO.lng]
  );
  for (const r of aswan) {
    line(`   ${r.class_title.padEnd(10)} ${money(r.total).padStart(14)}   [${r.price_source === "subcontractor" ? "سعر متعهد" : "تعريفة كيلومتر"}]`);
  }

  head("٩) حجز حقيقي على المسار المغطى — لقطة الربحية");
  const { rows: bk } = await c.query(
    `select * from public.create_booking(
       $1::jsonb, $2::jsonb, 2, false, 0,
       $3, 143, 'osrm', 'sedan', 'deposit',
       'عميل العرض التجريبي', '01000999888', null, now() + interval '3 days',
       'حجز عرض المرحلة ٥'
     )`,
    [
      JSON.stringify({ label: CAIRO.label, lat: CAIRO.lat, lng: CAIRO.lng }),
      JSON.stringify({ label: ALEX.label, lat: ALEX.lat, lng: ALEX.lng }),
      DIST_CAIRO_ALEX,
    ]
  );
  const ref = bk[0].reference;
  const { rows: snap } = await c.query(
    `select reference, total, amount_due, price_source, subcontractor_cost, margin_amount,
            (select company_name from public.subcontractors s where s.id = b.subcontractor_id) as company
       from public.bookings b where reference = $1`,
    [ref]
  );
  const s = snap[0];
  line(`   رقم الحجز        ${s.reference}`);
  line(`   إجمالي العميل     ${money(s.total)}`);
  line(`   العربون المطلوب   ${money(s.amount_due)}`);
  line(`   مصدر السعر       ${s.price_source === "subcontractor" ? "سعر متعهد" : "تعريفة كيلومتر"}`);
  line(`   المتعهد          ${s.company ?? "—"}`);
  line(`   تكلفة المتعهد     ${money(s.subcontractor_cost)}`);
  line(`   هامش ربحك        ${money(s.margin_amount)}`);
  const reconciles = Math.abs(Number(s.total) - Number(s.subcontractor_cost) - Number(s.margin_amount)) < 0.5;
  line(`   المصالحة         ${reconciles ? "✔ الإجمالي = التكلفة + الهامش" : "✘ لا يتصالح"}`);

  head("خلاصة");
  line("   بيانات العرض باقية في القاعدة لتتصفحها من اللوحة والبورتال.");
  line("   لحذفها: node scripts/demo-subcontractor.mjs --clean");
} finally {
  await c.end();
}
