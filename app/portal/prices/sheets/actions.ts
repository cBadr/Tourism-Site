"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { PriceImportRow } from "@/lib/subcontractor-types";
import { clamp, MAX_TEXT, text, toLatinDigits } from "../../_lib/form";
import { portalSetupAccess } from "../../_lib/session";
import { rowsFromCsv } from "../_lib/csv";
import { loadCoveredClasses, ROUTE_COLUMNS, toImportRow, toRoute } from "../_lib/sheets";

/**
 * إجراءات كشوف الأسعار — الكشف هو ما يسمّيه المالك «قائمة الأسعار»: يضم
 * مساراتٍ كثيرة ويُرسَل للاعتماد **مرّة واحدة**.
 *
 * القواعد التي ينفّذها هذا الملف، وكلها مفروضة في Postgres لا هنا:
 * - المتعهد لا يعتمد كشفه: `review_price_sheet` للمشرف وحده، وفوقها المُشغّل
 *   `price_lists_guard_review` يمنع كتابة `approved` بأي طريق.
 * - الاستيراد لا يعدّل مساراً معتمداً ولا مساراً قيد المراجعة — يرفضه برسالة.
 * - كل تحقق على صفوف الملف يقع في `import_price_sheet_rows`؛ هنا **قراءة الملف
 *   فقط**، فلا تنشأ قاعدة تحقق ثانية تنحرف عن قاعدة SQL.
 */

const listUrl = (qs: string) => `/portal/prices?${qs}`;
const sheetUrl = (id: string, qs: string) => `/portal/prices/sheets/${id}?${qs}`;

/** أقصى حجم ملف نقبله — ٥٠٠ مسار × سطر عريض يبقى دون هذا بمراحل */
const MAX_CSV_BYTES = 1_000_000;

const hintOf = (error: { hint?: string | null; message?: string } | null | undefined) =>
  typeof error?.hint === "string" && error.hint.trim() !== "" ? error.hint.trim() : "save";

/** إنشاء كشف جديد أو إعادة تسميته */
export async function saveSheet(sheetId: string | null, formData: FormData) {
  const access = await portalSetupAccess();
  const back = (qs: string) => (sheetId ? sheetUrl(sheetId, qs) : listUrl(qs));
  if (!access.ok) redirect(back(`error=${access.code}`));
  const { supabase } = access;

  const title = clamp(text(formData, "title"), MAX_TEXT);
  if (!title) redirect(back("error=sheet_title"));

  const note = clamp(text(formData, "note"), 2000);

  const res = await supabase.rpc("upsert_price_sheet", {
    p_id: sheetId,
    p_title: title,
    p_note: note,
  });
  if (res.error) redirect(back(`error=${hintOf(res.error)}`));

  const row = Array.isArray(res.data) ? res.data[0] : res.data;
  const id = row && typeof row === "object" ? String((row as Record<string, unknown>).id) : sheetId;

  revalidatePath("/", "layout");
  redirect(id ? sheetUrl(id, "saved=1") : listUrl("saved=1"));
}

/**
 * حذف كشف — القاعدة تمنع حذف كشفٍ فيه مسارٌ معتمد (حارس `price_sheets_guard_delete`)
 * حتى لا تختفي تغطية من تحت عروض سعرٍ حيّة.
 */
export async function deleteSheet(sheetId: string) {
  const access = await portalSetupAccess();
  if (!access.ok) redirect(listUrl(`error=${access.code}`));
  const { supabase, sub } = access;

  const res = await supabase
    .from("price_sheets")
    .delete()
    .eq("id", sheetId)
    .eq("subcontractor_id", sub.id)
    .select("id");

  if (res.error) redirect(sheetUrl(sheetId, "error=sheet_locked"));
  if (!res.data || res.data.length === 0) redirect(sheetUrl(sheetId, "error=notfound"));

  revalidatePath("/", "layout");
  redirect(listUrl("deleted=1"));
}

/** إرسال الكشف كله للاعتماد — طلبٌ واحد لكل مساراته */
export async function submitSheet(sheetId: string) {
  const access = await portalSetupAccess();
  if (!access.ok) redirect(sheetUrl(sheetId, `error=${access.code}`));
  const { supabase } = access;

  const res = await supabase.rpc("submit_price_sheet", { p_id: sheetId });
  if (res.error) redirect(sheetUrl(sheetId, `error=${hintOf(res.error)}`));

  const row = Array.isArray(res.data) ? res.data[0] : res.data;
  const sent =
    row && typeof row === "object" ? Number((row as Record<string, unknown>).submitted ?? 0) : 0;

  revalidatePath("/", "layout");
  redirect(sheetUrl(sheetId, `submitted=${Math.max(0, Math.round(sent))}`));
}

export type ImportState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | {
      status: "done";
      committed: boolean;
      accepted: number;
      rejected: number;
      unknownHeaders: string[];
      rows: PriceImportRow[];
    };

/**
 * استيراد ملف CSV — **بوضعين**: «فحص» يعرض الحكم بلا كتابة، و«استيراد» يكتب
 * المقبول ويترك المرفوض. والتقرير يعود صفّاً صفّاً في الحالتين.
 *
 * 🔴 لا تحويل ولا `redirect` هنا: التقرير قد يكون مئة سطر ولا يسع رابطاً، وعرضه
 *    كاملاً هو جوهر القاعدة «استيرادٌ جزئي صامت أسوأ من رفض».
 */
export async function importSheetRows(
  sheetId: string,
  _prev: ImportState,
  formData: FormData
): Promise<ImportState> {
  const access = await portalSetupAccess();
  if (!access.ok) {
    return { status: "error", message: "الجلسة غير صالحة — أعد تحميل الصفحة والدخول." };
  }
  const { supabase } = access;

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { status: "error", message: "اختر ملف CSV أولاً." };
  }
  if (file.size > MAX_CSV_BYTES) {
    return { status: "error", message: "الملف أكبر من المسموح — قسّمه إلى ملفين." };
  }

  const parsed = rowsFromCsv(await file.text());
  if (!parsed.ok) {
    return {
      status: "error",
      message:
        parsed.error === "empty"
          ? "الملف بلا صفوف بيانات — نزّل القالب واملأه ثم أعد الرفع."
          : "ترويسة الملف لا تطابق القالب — نزّل القالب من الزر أعلاه واستعمل أعمدته.",
    };
  }

  const commit = text(formData, "intent") === "commit";

  const res = await supabase.rpc("import_price_sheet_rows", {
    p_sheet_id: sheetId,
    p_rows: parsed.rows,
    p_commit: commit,
  });

  if (res.error) {
    return { status: "error", message: res.error.message };
  }

  const rows = ((res.data ?? []) as Record<string, unknown>[]).map(toImportRow);
  if (commit) revalidatePath("/", "layout");

  // «عمود غريب» = ليس عموداً ثابتاً ولا فئةً مغطّاة. الفئات المغطّاة تُقرأ من
  // `price_sheet_classes` نفسها لا من قائمة ثانية، فلا يُتَّهم عمودٌ سليم.
  const { classes } = await loadCoveredClasses(supabase);
  const known = new Set(classes.filter((c) => c.covered).map((c) => c.slug));
  const unknownHeaders = parsed.unknownHeaders.filter((h) => !known.has(h));

  return {
    status: "done",
    committed: commit,
    accepted: rows.filter((r) => r.accepted).length,
    rejected: rows.filter((r) => !r.accepted).length,
    unknownHeaders,
    rows,
  };
}

/* ------------------------------------------------------------------ */
/* التحرير الفوريّ لأسعار مسارٍ واحد — من جدول الكشف بلا مغادرة الصفحة  */
/* ------------------------------------------------------------------ */

export type RowEditState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "saved"; classesSaved: number; note: string | null };

/**
 * حفظ أسعار مسارٍ واحد من صفّه في الجدول — ملاحظة بدر: «بمجرد الضغط على المسار
 * يمكن تعديل أي جزء فيه ومن ثم يتم حفظها بشكل فوري ويظهر بعدها زر الإرسال
 * للاعتماد».
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  🔴 لا دالةَ قاعدةٍ جديدة تحت هذا الزرّ — تفويضٌ كامل (القاعدة الذهبية ١٢)
 * ══════════════════════════════════════════════════════════════════════════
 *
 * البابُ هو `import_price_sheet_rows` نفسه الذي يستعمله رفع CSV: صفٌّ واحد
 * بحمولةٍ كاملة و`p_commit = true`. وكلُّ حارسٍ تحتاجه هذه الشاشة قائمٌ فيه
 * سلفاً، ومقيسٌ حيّاً في `supabase/tests/portal_price_edit_tests.sql`:
 *
 * | الحارس | مَن ينفّذه |
 * |---|---|
 * | الهوية والملكية: كشفُك أنت لا كشفُ شريك | `current_subcontractor_id()` داخل الدالة |
 * | 🔴 **المسار المعتمد لا يُحرَّر إطلاقاً** | «المسار معتمد ويعمل الآن — الاستيراد لا يعدّله» |
 * | والمسار على مكتب المشرف لا يُحرَّر | «المسار على مكتب المشرف الآن» |
 * | `NaN` · `±Infinity` · `1e1000` · نصٌّ · فاصلةٌ مبهمة | `numeric_or_null` + سقف المليون×١٠ (‏0108/0112) |
 * | فئةٌ لا يغطّيها أسطولك | `price_sheet_classes` — التعريف الوحيد |
 *
 * 🔴 **والفرق الجوهريّ عن شاشة المشرف** (`set_price_list_item_cost` في 0135):
 * تلك تحرّر **المعتمَدة** بأثرِ تدقيقٍ وإشعارٍ للمتعهد، لأن المشرف يملك أن
 * يغيّر رقماً يُسعَّر به عميلٌ الآن. وهذه لا تحرّرها **أبداً** — والمتعهد يمرّ
 * بالمراجعة كي لا يتغيّر تحت عرضٍ حيّ سعرٌ وقّع عليه (البند ٨ من الاتفاقية).
 * فالدالتان معنيان مختلفان لا نسختان من معنى واحد.
 *
 * ⚠ **والنقاط والعنوان تُقرآن من القاعدة لا من المتصفح**: ما يرسله النموذج هو
 *   الأسعار وحدها. فلا تُزوَّر إحداثية بحقلٍ مخفيّ، والعنوانُ يبقى كما هو فيطابق
 *   المسار القائم (‏الاستيراد يطابق بالعنوان) ولا يُنشأ مسارٌ ثانٍ بالخطأ.
 *   وتغييرُ العنوان أو النقاط مكانه محرّر المسار الكامل — ورابطُه في الصفّ نفسه.
 *
 * 🔴 **ولماذا حالةٌ مُعادة لا `redirect`** (خلافاً لبقية إجراءات البورتال):
 *   سببُ الرفض جملةٌ عربية كاملة تكتبها القاعدة («فئات لا يغطّيها أسطولك: …»)،
 *   ووضعُها في `?error=` يقتلها إلى رمز. وهو نفس قرار `importSheetRows` أعلاه،
 *   ونفس علّته: التقرير هو الرسالة. و«الحفظ الفوريّ» يعني ألّا تُغادر الصفحة.
 */
export async function saveRoutePrices(
  sheetId: string,
  routeId: string,
  _prev: RowEditState,
  formData: FormData
): Promise<RowEditState> {
  const access = await portalSetupAccess();
  if (!access.ok) {
    return { status: "error", message: "الجلسة غير صالحة — أعد تحميل الصفحة والدخول." };
  }
  const { supabase, sub } = access;

  // حزامان: RLS تعزل الصفوف، والشرط المكتوب يجعل النية مقروءة ويمنع مساراً من كشفٍ آخر
  const found = await supabase
    .from("price_lists")
    .select(ROUTE_COLUMNS)
    .eq("id", routeId)
    .eq("sheet_id", sheetId)
    .eq("subcontractor_id", sub.id)
    .maybeSingle();

  if (found.error || !found.data) {
    return { status: "error", message: "المسار غير موجود في هذا الكشف أو ليس لحسابك." };
  }
  const route = toRoute(found.data as Record<string, unknown>);

  // الفئات المعروضة للتسعير في هذا المسار — من `price_sheet_classes` وحدها
  const { classes } = await loadCoveredClasses(supabase, undefined, routeId);
  const prices: Record<string, string> = {};
  for (const cls of classes) {
    if (!cls.covered) continue;
    const raw = text(formData, `cost.${cls.slug}`);
    // الفراغ يعني «لا أغطي هذه الفئة» ولا يعني صفراً — فلا يُرسَل أصلاً
    if (raw === null) continue;
    // الأرقام العربية الهندية تُقبل وتُطبَّع قبل الإرسال (اتفاقية المستودع)،
    // **والحكم على الرقم يبقى في القاعدة**: ما بعد التطبيع يُرسَل نصّاً كما هو.
    prices[cls.slug] = toLatinDigits(raw);
  }

  const res = await supabase.rpc("import_price_sheet_rows", {
    p_sheet_id: sheetId,
    p_rows: [
      {
        title: route.title,
        originLabel: route.originLabel,
        originLat: route.originLat,
        originLng: route.originLng,
        originRadiusKm: route.originRadiusKm,
        destLabel: route.destLabel,
        destLat: route.destLat,
        destLng: route.destLng,
        destRadiusKm: route.destRadiusKm,
        bidirectional: route.bidirectional,
        prices,
      },
    ],
    p_commit: true,
  });

  if (res.error) return { status: "error", message: res.error.message };

  const rows = ((res.data ?? []) as Record<string, unknown>[]).map(toImportRow);
  const row = rows[0];
  if (!row) {
    return { status: "error", message: "لم تُرجع القاعدة حكماً على هذا المسار — أعد المحاولة." };
  }
  if (!row.accepted) {
    return { status: "error", message: row.reason ?? "رُفض الحفظ بلا سبب مذكور." };
  }

  revalidatePath("/", "layout");
  return { status: "saved", classesSaved: row.classesSaved, note: row.reason };
}
