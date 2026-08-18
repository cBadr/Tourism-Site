/**
 * يبني ملفَّي استيراد CSV من الجداول المنقولة عن صور حمزة الثلاث.
 *
 * 🔴 الحسابُ آليٌّ لا يدويّ عمداً — قواعد بدر (2026-08-18):
 *  · التكلفة = متوسط (تجاري، مناسب).
 *  · وحيث يوجد **سعرٌ واحد فقط** — أيّاً كان عموده — فهو المعتمَد.
 *  · «نص» و«ذهاب وعودة» مُهمَلان: لا مأوى لهما في `price_list_items`.
 *  · الفئات: سيدان/ليموزين ⇒ sedan · ميني فان ⇒ suv · هاي إس ⇒ minibus.
 *  · الاتجاه واحد (قاعدته ١) ⇒ bidirectional=false، إلا ما قال نصُّه «والعكس».
 *
 * واتجاهُ كل مجموعة مقروءٌ من الصورة لا مفترَض — انظر `direct()`.
 */
import { readFileSync, writeFileSync } from "node:fs";

const COLS = ["title","originLabel","originLat","originLng","originRadiusKm",
  "destLabel","destLat","destLng","destRadiusKm","bidirectional"];
// 🔴 فئاتُ الأسطول المسجَّل وحدها —  تشتق التغطية من
// ، ولحمزة مركبتان: هايس (minibus) وجيتور إكس ٧٠ (suv).
// وعمودُ سيدان يُرفض لأنه لا يملك سيدان — حارسٌ صحيح لا عيب. وأسعارُ السيدان
// محفوظةٌ في ملفات النقل، تدخل يومَ يسجّل مركبةً من الفئة.
const CLASSES = ["suv","minibus"];
const RADIUS = "20";

const cost = (com, sui) => {
  const c = Number(com) || 0;
  const s = Number(sui) || 0;
  if (c && s) return Math.round((c + s) / 2);
  return (c || s) || null;
};

const rows = (file) => readFileSync(file, "utf8").split("\n")
  .filter(l => l.trim() && !l.startsWith("#"))
  .map(l => l.split("\t"))
  .slice(1);

const short = (label) => label.split(" - ")[0].replace(/^من /, "").trim();

/** «مطار القاهرة» و«مطار سفنكس» ⇒ المجموعة هي المنطلق. «الإسكندرية» ⇒ هي الوجهة. وإلا فالمنطلق القاهرة. */
const ORIGIN_IS_GROUP = { "مطار القاهرة": "مطار القاهرة الدولي", "مطار سفنكس": "مطار سفنكس" };
const ALEX_SIDE_DEST = /برج العرب|أبو قير|معمورة|العجمي/;

function direct(group, raw) {
  if (ORIGIN_IS_GROUP[group]) return { origin: ORIGIN_IS_GROUP[group], dest: raw };
  if (group === "الإسكندرية") {
    if (ALEX_SIDE_DEST.test(raw)) return { origin: "القاهرة", dest: raw };
    const cleaned = raw.replace(/^من /, "")
      .replace(/\s*(إلى|-)?\s*الإسكندرية\s*(والعكس)?/g, "")
      .replace(/^-|-$/g, "").trim();
    return { origin: cleaned || "القاهرة", dest: "الإسكندرية" };
  }
  return { origin: "القاهرة", dest: raw };
}

/** أسعار الهاي إس مفتاحُها عنوانُ المسار — لأن تجميع الصورة الثالثة لا يطابق الأولى صفاً بصفّ */
const hiace = new Map();
for (const r of rows("docs/price-intake/hamza-hiace-2026-03-11.tsv")) {
  hiace.set(r[0], { cost: cost(r[2], r[3]), src: r[1] });
}

function build(src, out, pick) {
  const seen = new Map();
  const lines = [[...COLS, ...CLASSES].join(",")];
  const skipped = [];
  let withBus = 0;
  const noBus = [];
  for (const r of rows(src)) {
    const { origin, dest, sedan, suv, bidir, note } = pick(r);
    if (sedan === null && suv === null) { skipped.push(dest + (note ? " — " + note : "")); continue; }
    const title = short(origin) + " - " + short(dest);
    const bus = hiace.get(title);
    if (bus && bus.cost) withBus++; else noBus.push(title);
    const firstD = !seen.has(dest), firstO = !seen.has(origin);
    seen.set(dest, true); seen.set(origin, true);
    lines.push([
      title, origin, "", "", firstO ? RADIUS : "",
      dest, "", "", firstD ? RADIUS : "",
      bidir ? "true" : "false",
      suv ?? "", bus?.cost ?? "",
    ].join(","));
  }
  writeFileSync(out, lines.join("\n") + "\n", "utf8");
  return { count: lines.length - 1, places: seen.size, skipped, withBus, noBus };
}

const cairo = build(
  "docs/price-intake/hamza-cairo-2026-03-12.tsv",
  "docs/price-intake/import-cairo.csv",
  (r) => ({ ...direct(r[0], r[1]), sedan: cost(r[2], r[3]), suv: cost(r[5], r[6]), bidir: /والعكس/.test(r[1]), note: "" })
);

const alex = build(
  "docs/price-intake/hamza-alex-2026-03-10.tsv",
  "docs/price-intake/import-alex.csv",
  (r) => /الوجهة القاهرة/.test(r[10] ?? "")
    ? { origin: r[1].replace(/\s*-\s*القاهرة$/, "").replace(/^من /, "").trim(), dest: "القاهرة",
        sedan: cost(r[2], r[3]), suv: cost(r[6], r[7]), bidir: false, note: r[10] }
    : { origin: "الإسكندرية", dest: r[1], sedan: cost(r[2], r[3]), suv: cost(r[6], r[7]), bidir: false, note: r[10] ?? "" }
);

const used = new Set();
for (const f of ["import-cairo", "import-alex"])
  readFileSync("docs/price-intake/" + f + ".csv", "utf8").trim().split("\n").slice(1)
    .forEach(l => { const c = l.split(","); used.add(c[0]); });
const orphan = [...hiace.keys()].filter(k => !used.has(k));

console.log("القاهرة    ⇒", cairo.count, "صفاً ·", cairo.withBus, "منها بسعر هاي إس · مستبعَد", cairo.skipped.length);
console.log("الإسكندرية ⇒", alex.count, "صفاً ·", alex.withBus, "منها بسعر هاي إس · مستبعَد", alex.skipped.length);
alex.skipped.forEach(s => console.log("   ✗", s));
console.log("\n🔵 بلا سعر هاي إس (", cairo.noBus.length, "):", cairo.noBus.join(" · "));
if (orphan.length) console.log("\n🔴 صفوف هاي إس بلا مسارٍ مطابق:", orphan.join(" · "));
