/**
 * تجربة حية للمرحلة ٨ — تفعيل الإنجليزية بترجمات منشورة يدوياً.
 *
 *   node scripts/demo-english.mjs          تفعيل + بذر ترجمات عيّنة
 *   node scripts/demo-english.mjs --clean  إعادة الحال (تعطيل + حذف الترجمات)
 *
 * الغرض إثبات المسار كاملاً بلا انتظار حصة المترجم الآلي: نكتب ترجمات
 * بشرية لعيّنة من المفاتيح، ننشرها، ثم يصير للإنجليزية `published_count > 0`
 * فتظهر في hreflang وخريطة الموقع ومبدّل اللغة.
 */
import { config } from "dotenv";
import pg from "pg";

config({ path: new URL("../.env.local", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"), quiet: true });

const CLEAN = process.argv.includes("--clean");
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

try {
  if (CLEAN) {
    await c.query("delete from public.translations where locale = 'en'");
    await c.query("update public.locales set enabled = false where code = 'en'");
    console.log("🧹 أُعيدت الإنجليزية إلى وضعها الأصلي (معطّلة وبلا ترجمات).");
    process.exit(0);
  }

  // هوية مشرف — دوال الترجمة كلها محروسة بـ is_admin()
  const { rows: admins } = await c.query(
    "select p.id, u.email from public.profiles p join auth.users u on u.id = p.id where p.role = 'admin' limit 1"
  );
  if (!admins.length) throw new Error("لا يوجد مشرف");
  await c.query("select set_config('request.jwt.claim.sub', $1, false)", [admins[0].id]);
  await c.query(
    "select set_config('request.jwt.claims', jsonb_build_object('sub', $1::text)::text, false)",
    [admins[0].id]
  );

  await c.query("update public.locales set enabled = true where code = 'en'");
  console.log("✔ الإنجليزية مفعّلة");

  // ترجمات بشرية لعيّنة تمثل كل المساحات
  const rows = [
    { namespace: "settings", key: "brand.tagline", value: "Reliable tourism transport across Egypt" },
    { namespace: "settings", key: "company.activity", value: "Tourism transport services across Egypt" },
    { namespace: "settings", key: "seo.defaultDescription", value: "Book a car with a professional driver in seconds — airport pickups, city rides, intercity travel and private tours. Clear prices, modern vehicles." },
    { namespace: "service", key: "airport-transfer.title", value: "Airport Transfers" },
    { namespace: "service", key: "airport-transfer.short", value: "Pickup and drop-off at every Egyptian airport, around the clock." },
    { namespace: "service", key: "intercity-travel.title", value: "Intercity Travel" },
    { namespace: "vehicle", key: "sedan.title", value: "Sedan" },
    { namespace: "vehicle", key: "sedan.seats", value: "Up to 3 passengers" },
    { namespace: "vehicle", key: "suv.title", value: "SUV" },
    { namespace: "vehicle", key: "suv.seats", value: "Up to 6 passengers" },
  ];

  // نمرّ بالدالة الرسمية حتى يُحسب source_hash ويُحترم منطق المسودات
  const corpus = await c.query("select namespace, key, source_text from public.translation_corpus()");
  const sourceOf = new Map(corpus.rows.map((r) => [`${r.namespace}::${r.key}`, r.source_text]));

  const payload = rows
    .map((r) => ({ ...r, sourceText: sourceOf.get(`${r.namespace}::${r.key}`) }))
    .filter((r) => r.sourceText)
    .map((r) => ({ locale: "en", namespace: r.namespace, key: r.key, sourceText: r.sourceText, value: r.value, provider: "human-demo" }));

  if (payload.length === 0) throw new Error("لم يُعثر على مفاتيح مطابقة في قائمة العمل");

  const up = await c.query("select * from public.upsert_translations($1::jsonb)", [JSON.stringify(payload)]);
  console.log(`✔ كُتبت ${payload.length} ترجمة — ${JSON.stringify(up.rows[0])}`);

  // اعتمادها ثم نشرها
  await c.query(
    "update public.translations set status = 'reviewed' where locale = 'en' and provider = 'human-demo'"
  );
  const pub = await c.query("select * from public.publish_locale('en')");
  console.log(`✔ نُشرت: ${JSON.stringify(pub.rows[0])}`);

  const { rows: prog } = await c.query("select * from public.translation_progress() where locale = 'en'");
  console.log(`📊 تقدّم الإنجليزية: ${JSON.stringify(prog[0])}`);

  const { rows: enabled } = await c.query("select code, published_count from public.enabled_locales()");
  console.log(`🌍 اللغات المعلَنة: ${enabled.map((e) => `${e.code}(${e.published_count})`).join(", ")}`);
} finally {
  await c.end();
}
