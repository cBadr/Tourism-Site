/**
 * يملأ الإحداثيات في ملفَّي الاستيراد، ثم **يفحصها آلياً**.
 *
 * 🔴 الفحصُ هو بيتُ القصيد: إحداثيةٌ خاطئة لا تُسقط الاستيراد — تجعل التغطية
 * تُطابق مكاناً آخر بصمت. وقد أعاد Nominatim فعلاً «العاشر» في الأقصر
 * و«الزعفرانة» في بني سويف و«وسط البلد» في سانت كاترين. فالكاشفُ هنا
 * **نسبةُ السعر إلى المسافة**: الأسعارُ تتبع المسافة تقريباً، فمَن شذّ
 * عن الوسيط بمقدارٍ كبير فإحداثيتُه — لا سعرُه — هي المتّهم الأول.
 */
import { readFileSync, writeFileSync } from "node:fs";

const P = JSON.parse(readFileSync("docs/price-intake/places.json", "utf8"));
const OV = JSON.parse(readFileSync("docs/price-intake/coord-overrides.json", "utf8"));
for (const [k, v] of Object.entries(OV)) {
  if (k.startsWith(String.fromCharCode(95))) continue;
  P[k] = { q: k, alt: 0, ...(P[k] || {}), lat: v[0], lng: v[1], resolved: (P[k] ? P[k].resolved : k) + " — مصححة يدوياً" };
}
writeFileSync("docs/price-intake/places.json", JSON.stringify(P, null, 1), "utf8");

const R = 6371;
const rad = (d) => (d * Math.PI) / 180;
const km = (a, b) => {
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

const report = [];
for (const f of ["import-cairo", "import-alex"]) {
  const path = `docs/price-intake/${f}.csv`;
  const L = readFileSync(path, "utf8").trim().split("\n");
  const out = [L[0]];
  const memo = new Map();
  for (const line of L.slice(1)) {
    const c = line.split(",");
    const o = P[c[1]], d = P[c[5]];
    if (!o || !d) { report.push([c[0], null, null, "🔴 بلا إحداثيات"]); out.push(line); continue; }
    // الإحداثيات تُكتب مرة واحدة لكل مكان — كما ينصّ القالب
    const fo = !memo.has(c[1]), fd = !memo.has(c[5]);
    memo.set(c[1], 1); memo.set(c[5], 1);
    c[2] = fo ? String(o.lat) : ""; c[3] = fo ? String(o.lng) : ""; c[4] = fo ? "20" : "";
    c[6] = fd ? String(d.lat) : ""; c[7] = fd ? String(d.lng) : ""; c[8] = fd ? "20" : "";
    out.push(c.join(","));
    const dist = km(o, d);
    const price = Number(c[10]) || Number(c[11]) || 0;
    report.push([c[0], dist, price, ""]);
  }
  writeFileSync(path, out.join("\n") + "\n", "utf8");
}

const valid = report.filter((r) => r[1] > 1 && r[2] > 0);
const rates = valid.map((r) => r[2] / r[1]).sort((a, b) => a - b);
const med = rates[Math.floor(rates.length / 2)];
console.log(`مسارات مقيسة: ${valid.length} · وسيط ج.م/كم = ${med.toFixed(1)}\n`);
console.log("🔴 الشاذّون (خارج ٠٫٤× إلى ٣× من الوسيط) — إحداثيةٌ متّهمة:");
let n = 0;
for (const [t, dist, price] of valid) {
  const rate = price / dist;
  if (rate < med * 0.4 || rate > med * 3) {
    n++;
    console.log(`  ${t.padEnd(46)} ${dist.toFixed(0).padStart(5)} كم · ${String(price).padStart(5)} ج.م · ${rate.toFixed(1)} ج/كم`);
  }
}
console.log(n ? `\nالمجموع: ${n}` : "\n✅ لا شاذّ");
report.filter((r) => r[3]).forEach((r) => console.log("  " + r[3] + "  " + r[0]));
