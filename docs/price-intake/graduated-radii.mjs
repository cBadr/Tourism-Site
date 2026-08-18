/**
 * (ب) نطاقاتٌ متدرّجة بدل ٢٠ كم للجميع — حسابٌ ثم قياسُ أثرٍ ثم كتابة.
 *
 * 🔴 المسألة: نطاقٌ واحد لكل النقاط يجعل دوائرَ أحياء القاهرة تبتلع بعضها،
 * فيطابق العميلُ الواحد ثلاثةَ مسارات بثلاثة أسعار، و`quote_price` تأخذ
 * `min(cost)` ⇒ **تمايزُ المتعهد السعريّ يُمحى** ومنطلقاتُه الأغلى لا تُبلَغ.
 *
 * القاعدة: نصفُ القطر = ٠٫٤٥ × المسافة إلى أقرب نقطةٍ أخرى، محصورةً بين ٥ و٢٠ كم.
 *   · ٠٫٤٥ لا ٠٫٥ — هامشُ أمانٍ يمنع التماسّ عند الحدّ تماماً.
 *   · أرضيةُ ٥ كم: نطاقٌ أصغر يجعل الحيَّ غيرَ مغطّى فيسقط إلى التعريفة.
 *   · سقفُ ٢٠: هو الافتراض الذي أقرّه بدر، فلا يُتجاوز.
 *
 * والوضعُ: DRY لقياسٍ بلا كتابة · APPLY للكتابة مع حفظ القيم القديمة.
 */
import { writeFileSync } from "node:fs";
import pg from "pg";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const APPLY = process.argv.includes("--apply");
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

const { rows: R } = await c.query(`
  select pl.id, pl.title, pl.origin_label, pl.origin_lat::float o_lat, pl.origin_lng::float o_lng,
         pl.origin_radius_km::float o_r, pl.dest_label, pl.dest_lat::float d_lat, pl.dest_lng::float d_lng,
         pl.dest_radius_km::float d_r, pl.bidirectional, pl.status, pl.sheet_id,
         (select min(cost)::float from price_list_items i where i.price_list_id = pl.id and i.class_slug='suv') suv
  from price_lists pl where pl.status = 'approved'`);

const KM = (a, b) => {
  const rad = (d) => (d * Math.PI) / 180;
  const dLa = rad(b[0] - a[0]), dLo = rad(b[1] - a[1]);
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLo / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
};

/** كل النقاط المتمايزة في القاعدة — المنطلقات والوجهات معاً */
const pts = new Map();
for (const r of R) {
  pts.set(`${r.o_lat},${r.o_lng}`, { lat: r.o_lat, lng: r.o_lng, label: r.origin_label });
  pts.set(`${r.d_lat},${r.d_lng}`, { lat: r.d_lat, lng: r.d_lng, label: r.dest_label });
}
const P = [...pts.values()];
const radius = new Map();
for (const p of P) {
  let near = Infinity;
  for (const q of P) {
    if (q === p) continue;
    const d = KM([p.lat, p.lng], [q.lat, q.lng]);
    if (d > 0.01 && d < near) near = d;
  }
  const r = near === Infinity ? 20 : Math.max(5, Math.min(20, Math.round(near * 0.45 * 10) / 10));
  radius.set(`${p.lat},${p.lng}`, r);
}

/** عدُّ الأزواج التي تتداخل دائرتاها في الطرفين معاً وسعراهما مختلفان */
function clash(getR) {
  let n = 0; const ex = [];
  for (let i = 0; i < R.length; i++) for (let j = i + 1; j < R.length; j++) {
    const a = R[i], b = R[j];
    if (!a.suv || !b.suv || a.suv === b.suv) continue;
    const dO = KM([a.o_lat, a.o_lng], [b.o_lat, b.o_lng]);
    const dD = KM([a.d_lat, a.d_lng], [b.d_lat, b.d_lng]);
    if (dO <= getR(a, "o") + getR(b, "o") && dD <= getR(a, "d") + getR(b, "d")) {
      n++; if (ex.length < 12) ex.push([a.title, a.suv, b.title, b.suv]);
    }
  }
  return { n, ex };
}

const before = clash((r, k) => (k === "o" ? r.o_r : r.d_r));
const after = clash((r, k) => radius.get(k === "o" ? `${r.o_lat},${r.o_lng}` : `${r.d_lat},${r.d_lng}`));

console.log(`مسارات معتمدة: ${R.length} · نقاط متمايزة: ${P.length}`);
console.log(`\nأزواجٌ متصادمة (تتداخل في الطرفين وسعراها مختلفان):`);
console.log(`   قبل: ${before.n}   ⇒   بعد: ${after.n}`);
const dist = {};
for (const r of radius.values()) dist[r < 8 ? "٥–٨" : r < 15 ? "٨–١٥" : "١٥–٢٠"] = (dist[r < 8 ? "٥–٨" : r < 15 ? "٨–١٥" : "١٥–٢٠"] ?? 0) + 1;
console.log(`   توزيع النطاق الجديد: ${JSON.stringify(dist)}`);
if (after.n) { console.log(`\n🔴 ما يبقى متصادماً:`); after.ex.forEach(([t1, p1, t2, p2]) => console.log(`   ${t1} (${p1})\n   ${t2} (${p2})\n`)); }

if (!APPLY) { console.log("\n(قياسٌ فقط — بلا كتابة. أضِف --apply للتطبيق)"); await c.end(); process.exit(0); }

const backup = R.map((r) => ({ id: r.id, title: r.title, o_r: r.o_r, d_r: r.d_r }));
writeFileSync("docs/price-intake/radii-backup.json", JSON.stringify(backup, null, 1), "utf8");
let n = 0;
for (const r of R) {
  const nor = radius.get(`${r.o_lat},${r.o_lng}`), ndr = radius.get(`${r.d_lat},${r.d_lng}`);
  if (nor === r.o_r && ndr === r.d_r) continue;
  await c.query("update price_lists set origin_radius_km=$2, dest_radius_km=$3 where id=$1", [r.id, nor, ndr]);
  n++;
}
console.log(`\n✅ حُدِّث ${n} مساراً · والقيمُ القديمة في docs/price-intake/radii-backup.json`);
await c.end();
