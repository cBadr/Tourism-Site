import {
  PRICE_IMPORT_COLUMNS,
  type PriceSheetClass,
} from "@/lib/subcontractor-types";

/**
 * قارئ CSV ومُولِّد القالب — وحدة محايدة (بلا `"use client"` وبلا `server-only`)
 * لأن الثوابت والدوال هنا تُستعمل من إجراء خادمي ومن مسار تنزيل القالب معاً.
 *
 * ⚠ لا حساب مالي هنا ولا تحقق من صحة الأسعار: هذا الملف **يقرأ الملف فقط**
 * ويحوّله إلى صفوف jsonb. كل تحقق — الفئات المغطّاة والإحداثيات والنطاقات
 * والتكاليف — يقع داخل `import_price_sheet_rows` في Postgres، فمسار الويب
 * ومسار SQL يخضعان لقاعدة واحدة لا لقاعدتين تنحرفان (‏D-05).
 *
 * 🔴 وملاحظةٌ مدفوعة الثمن على `bidirectional`: هذا القارئ يكتب `""` لكل خانة
 * فارغة، وكان `coalesce(el ->> 'bidirectional', 'true')` في 0102 لا يلتقط `''`
 * (‏لأنها ليست `null`) فتسقط خارج قائمة القبول ⇒ **المسار يصير اتجاهاً واحداً
 * صامتاً**، ويخرج شقُّ العودة من `coverage_matches` فيُسعَّر بالتعريفة.
 * والقاعدة صارت (0109) تعتبر الفارغ غياباً وترفض القيمة غير المفهومة. **ولا
 * يُصحَّح ذلك هنا بتحويل `""` إلى `"true"`**: القارئ يبقى ناقلاً أميناً لما في
 * الملف، والحكم يبقى في مكانٍ واحد — وإلا صار للاتجاهين تعريفان ينحرفان.
 */

/** الأرقام العربية الهندية تُقبل في الملف كما تُقبل في النماذج */
const toLatinDigits = (s: string) =>
  s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));

/**
 * تقسيم CSV يحترم الاقتباس المزدوج والفواصل داخله والأسطر داخل الحقول.
 * يقبل CRLF وLF، ويُسقط علامة BOM التي تضعها Excel في أول الملف (وبدون
 * إسقاطها يصير أول عنوان عمود «﻿title» فلا يُطابق شيئاً).
 */
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      quoted = true;
    } else if (ch === "," || ch === ";" || ch === "\t") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch !== "\r") {
      field += ch;
    }
  }

  row.push(field);
  rows.push(row);

  // الأسطر الفارغة تماماً ليست صفوف بيانات
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

/** أسماء الأعمدة الثابتة بصيغتَي camelCase وsnake_case وبعناوين عربية شائعة */
const HEADER_ALIASES: Record<string, string> = {
  title: "title",
  route: "title",
  المسار: "title",
  العنوان: "title",
  originlabel: "originLabel",
  origin_label: "originLabel",
  من: "originLabel",
  originlat: "originLat",
  origin_lat: "originLat",
  originlng: "originLng",
  origin_lng: "originLng",
  originradiuskm: "originRadiusKm",
  origin_radius_km: "originRadiusKm",
  destlabel: "destLabel",
  dest_label: "destLabel",
  إلى: "destLabel",
  destlat: "destLat",
  dest_lat: "destLat",
  destlng: "destLng",
  dest_lng: "destLng",
  destradiuskm: "destRadiusKm",
  dest_radius_km: "destRadiusKm",
  bidirectional: "bidirectional",
  الاتجاهان: "bidirectional",
};

export type ParsedFile =
  | { ok: true; rows: Record<string, unknown>[]; unknownHeaders: string[] }
  | { ok: false; error: "empty" | "header" };

/**
 * تحويل نص CSV إلى صفوف بالشكل الذي تنتظره `import_price_sheet_rows`.
 *
 * أي عمود ليس من الأعمدة الثابتة يُعامَل **اسم فئة** ويذهب إلى `prices`؛
 * والفئة المجهولة أو غير المغطّاة تُرفض في Postgres برسالة تسمّيها، فلا
 * نُسقطها هنا بصمت (الإسقاط الصامت هو ما يجعل الاستيراد الجزئي خطراً).
 */
export function rowsFromCsv(text: string): ParsedFile {
  const table = parseCsv(text);
  if (table.length < 2) return { ok: false, error: "empty" };

  const header = table[0].map((h) => h.trim());
  const mapped = header.map((h) => HEADER_ALIASES[h.toLowerCase()] ?? null);

  // بلا عمود مكان واحد على الأقل لا يمكن أن يكون هذا هو الملف المقصود
  if (!mapped.includes("originLabel") && !mapped.includes("destLabel")) {
    return { ok: false, error: "header" };
  }

  const unknown = new Set<string>();
  const rows: Record<string, unknown>[] = [];

  for (const line of table.slice(1)) {
    const row: Record<string, unknown> = {};
    const prices: Record<string, string> = {};

    header.forEach((rawName, i) => {
      const value = (line[i] ?? "").trim();
      const key = mapped[i];
      if (key) {
        row[key] = key.endsWith("Lat") || key.endsWith("Lng") || key.endsWith("RadiusKm")
          ? toLatinDigits(value)
          : value;
        return;
      }
      const slug = rawName.trim().toLowerCase();
      if (slug === "") return;
      unknown.add(slug);
      if (value !== "") prices[slug] = toLatinDigits(value);
    });

    row.prices = prices;
    rows.push(row);
  }

  return { ok: true, rows, unknownHeaders: [...unknown] };
}

/**
 * قالب CSV مبنيٌّ على **فئات هذا المتعهد وحدها** — الفئة التي لا يملك فيها
 * مركبة لا عمود لها أصلاً، فلا يُسأل عن تسعير ما لا ينفّذه (ملاحظة المالك ٥).
 */
export function csvTemplate(classes: PriceSheetClass[]): string {
  const slugs = classes.filter((c) => c.covered).map((c) => c.slug);
  const header = [...PRICE_IMPORT_COLUMNS, ...slugs];
  // صفّا مثال: الأول يبيّن الشكل الكامل، والثاني يبيّن أن المكان الذي كُتبت
  // إحداثياته مرّة يكفي فيه اسمه بعدها. العنوان يقول «مثال» صراحةً فإن نُسي في
  // الملف ظهر بهذا الاسم في تقرير الاستيراد بدل أن يمرّ كمسارٍ حقيقي.
  const example = [
    "مثال — احذف هذا الصف",
    "القاهرة",
    "30.0444",
    "31.2357",
    "25",
    "الإسكندرية",
    "31.2001",
    "29.9187",
    "25",
    "true",
    ...slugs.map(() => "1500"),
  ];
  const second = [
    "مثال ٢ — الإحداثيات تُكتب مرة واحدة",
    "القاهرة",
    "",
    "",
    "",
    "الغردقة",
    "27.2579",
    "33.8116",
    "40",
    "true",
    ...slugs.map(() => "2500"),
  ];

  const quote = (v: string) => (/[",;\t\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const lines = [header, example, second].map((r) => r.map(quote).join(","));

  // BOM حتى تفتح Excel العربية بالترميز الصحيح بلا خطوة استيراد يدوية
  return "﻿" + lines.join("\r\n") + "\r\n";
}
