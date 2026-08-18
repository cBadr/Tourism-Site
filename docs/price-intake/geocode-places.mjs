/**
 * يملأ إحداثيات أماكن قوائم حمزة من **جيوكودر المشروع نفسه** — لا من ثانٍ.
 *
 * 🔴 لماذا عبر `GET /api/geocode` لا بنداءٍ مباشر إلى Nominatim: هذا المسار
 * يمرّ بـ`geocode_cache` في Postgres (فلا يُسأل المزوّد عن مكانٍ سُئل عنه)،
 * وبحارس منطقة الخدمة `isWithinServiceArea` (فلا يدخل مكانٌ خارج مصر)،
 * وبنفس التطبيع الذي يستعمله العميل في صفحة الحجز. تعريفٌ واحد لا اثنان.
 *
 * وبلا تكلفة: Nominatim مجاني — وحصّة Google بلا سقف اليوم فلا تُمسّ.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3000";
const OUT = "docs/price-intake/places.json";
const PAUSE = 1100; // احترامُ سياسة Nominatim: نداءٌ في الثانية

/** الاسمُ المركّب يُختصر إلى مكانٍ واحد قابلٍ للتحديد */
const OV = JSON.parse(readFileSync("docs/price-intake/overrides.json","utf8"));

function query(label) {
  if (OV[label]) return OV[label];
  let q = label
    .replace(/^من\s+/, "")
    .split(" - ")[0]
    .split("/")[0]
    .replace(/\(.*?\)/g, "")
    .replace(/\s*(حتى|إلى|الى)\s+.*$/, "")
    .replace(/\s*الكيلو\s*\d+.*$/, "")
    .replace(/\s*\d+\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
  return q;
}

const labels = new Set();
for (const f of ["import-cairo", "import-alex"])
  readFileSync(`docs/price-intake/${f}.csv`, "utf8").trim().split("\n").slice(1)
    .forEach((l) => { const c = l.split(","); labels.add(c[1]); labels.add(c[5]); });

const out = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : {};
const todo = [...labels].filter((l) => !out[l]);
console.log(`أماكن: ${labels.size} · محلولةٌ سلفاً: ${labels.size - todo.length} · للحلّ: ${todo.length}`);

let ok = 0;
const failed = [];
for (const [i, label] of todo.entries()) {
  const q = query(label);
  if (q.length < 2) { failed.push([label, "استعلامٌ أقصرُ من حرفين"]); continue; }
  try {
    const res = await fetch(`${BASE}/api/geocode?q=${encodeURIComponent(q)}`);
    const body = await res.json();
    const p = body?.places?.[0];
    if (!p) { failed.push([label, `لا نتيجة لـ«${q}»`]); }
    else {
      out[label] = { q, lat: p.lat, lng: p.lng, resolved: p.label, alt: body.places.length };
      ok++;
      console.log(`${String(i + 1).padStart(3)}/${todo.length}  ${q}  ⇒  ${p.label}  (${p.lat}, ${p.lng})${body.places.length > 1 ? "  ⚠ بدائل: " + body.places.length : ""}`);
    }
  } catch (e) { failed.push([label, String(e.message ?? e)]); }
  await new Promise((r) => setTimeout(r, PAUSE));
}

writeFileSync(OUT, JSON.stringify(out, null, 1), "utf8");
console.log(`\n✅ حُلّ: ${ok} · 🔴 تعذّر: ${failed.length}`);
failed.forEach(([l, why]) => console.log(`   ✗ ${l}  —  ${why}`));
