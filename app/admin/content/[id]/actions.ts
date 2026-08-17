"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createServerSupabase } from "@/lib/supabase/server";
import {
  SECTION_TYPE_LABELS,
  type SectionType,
} from "@/lib/content-types";
import { ITEM_PRESERVED_KEYS } from "@/lib/page-builder/item-keys";

/**
 * إجراءات محرر المحتوى — كلها على اتفاقية «إعادة التوجيه بعد العملية» (اعتبار ٨):
 * النجاح والفشل كلاهما redirect برسالة في الـ query string تعرضها الصفحة كتنبيه.
 * فخ RLS المعروف: update/delete ينجحان ظاهرياً بصفر صفوف عند رفض السياسة —
 * لذلك نفحص `.select()` بعد كل كتابة، وأي إبطال كاش يكون `revalidatePath("/", "layout")`
 * لأن المحتوى يظهر في الموقع العام كله (sitemap والقوائم أيضاً).
 */

const editorUrl = (pageId: string, qs: string) => `/admin/content/${pageId}?${qs}`;

const isSectionType = (v: unknown): v is SectionType =>
  typeof v === "string" && v in SECTION_TYPE_LABELS;

/** المحتوى الابتدائي لقسم جديد — أدنى شكل صالح لكل نوع بحسب SectionContentMap */
const DEFAULT_SECTION_CONTENT: Record<SectionType, Record<string, unknown>> = {
  hero: {},
  "page-hero": { title: "" },
  "services-grid": {},
  fleet: {},
  "why-us": {},
  features: { items: [] },
  "rich-text": { body: "" },
  faq: { items: [] },
  "cta-band": {},
  contact: {},
  // الكتلتان الجديدتان يديرهما منشئ الصفحات — تُنشأ هنا بشكلٍ صالح وتُحرَّر هناك
  columns: {},
  image: { src: "", alt: "" },
  /**
   * كتل م‑٢ الثلاث — يديرها المنشئ كذلك، وحقولها تُرسَم فيه **آلياً** من
   * `block_registry` (‏`BlockFields` عامّة تقرأ `textFields`/`itemFields`)،
   * فلا شاشة جديدة ولا سطر في هذا المحرر.
   *
   * و`stat-band`/`route-rail` تُنشآن بقائمةٍ فارغة: هذا شكلٌ **صالح ولا
   * يُصيَّر** — وهو المقصود بقرار «الكتلة تُشحن والأرقام لا»، فلا يظهر على
   * الصفحة إطارٌ فارغ حتى يملأه المالك.
   */
  "logo-strip": {},
  "stat-band": { items: [] },
  "route-rail": { items: [] },
  /**
   * كتل المستندات (م‑١٠) — يديرها المنشئ كذلك، وحقولها تُرسَم فيه آلياً من
   * `block_registry`. و`clause` تُنشأ بعنوانٍ فارغ: شكلٌ **صالح ولا يُصيَّر**
   * حتى يكتب المالك عنوانه، فلا يظهر بندٌ بلا عنوان على صفحة سياسات.
   *
   * ⚠ و`anchor` **لا تُبذَر هنا ولا في المنشئ**: غيابها يعني مرساةً من معرّف
   * الصفّ — موجودةً دائماً — بينما قيمةٌ مولَّدة مسبقاً كانت تعطي المالك
   * مرساةً يظنها من اختياره فلا يراجعها.
   */
  "page-toc": {},
  clause: { title: "" },
  table: { items: [] },
  callout: { body: "" },
};

/**
 * 🔴 مفاتيح **لا يملكها هذا المحرر ولا يجوز أن يمحوها**.
 *
 * هذه الدالة تعيد بناء `content` كاملاً من النموذج في كل حفظ (‏`switch` يُسقط كل
 * مفتاح لا يعرفه)، وهو ما كان يعني أن قسماً كتب فيه منشئ الصفحات `style` أو
 * `_k` **يفقدهما صامتاً** بمجرد أن يُحفظ من هنا (الثمن ٣ في موجز المرحلة ١٣).
 * فإما كاتبٌ واحد وإما صيانةٌ صريحة للمفاتيح — وهذا هو الشقّ الثاني:
 *
 *   • `style` يُنقل كما هو (تنسيقٌ لا يعرضه هذا المحرر أصلاً).
 *   • `_k` يُنقل داخل كل عنصر عبر `parseItems` (انظر `ITEM_PRESERVED_KEYS`).
 *   • `columns` و`image` **لا يلمسهما هذا المحرر إطلاقاً** — يرجع `null` فتُترك.
 */
const PRESERVED_CONTENT_KEYS = ["style"] as const;

/**
 * ⚠ **`ITEM_PRESERVED_KEYS` انتقل إلى `lib/page-builder/item-keys.ts` ولم
 * يُنسخ** (2026-08-17). كان معرَّفاً هنا وحده، فحرسَ نصف الرحلة وحدها: هذا
 * الإجراء ينقل `_k` من الحمولة الواردة بأمانة، بينما الشاشة التي ترسم النموذج
 * كانت تُسقطه **قبل** أن يصل المتصفح — فلم يكن هناك ما يُنقل. المصدر واحدٌ الآن
 * يقرؤه الطرفان: من يرسم ومن يكتب.
 */

/** نص مُشذّب أو undefined — undefined تعني إسقاط المفتاح من الـ JSONB */
function str(formData: FormData, name: string): string | undefined {
  const v = formData.get(name);
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t === "" ? undefined : t;
}

/** نص متعدد الأسطر — يحافظ على الأسطر الداخلية ويشذّب الأطراف فقط */
function multiline(formData: FormData, name: string): string | undefined {
  const v = formData.get(name);
  if (typeof v !== "string") return undefined;
  const t = v.replace(/\r\n/g, "\n").trim();
  return t === "" ? undefined : t;
}

/** إسقاط المفاتيح undefined حتى لا تتضخم الـ JSONB بقيم فارغة */
function prune(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return out;
}

/**
 * قراءة مصفوفة عناصر من حقل JSON مخفي (جزيرة العميل تُسلسلها):
 * تُبقى المفاتيح المعروفة فقط، وتُسقط العناصر التي يخلو مفتاحها الإلزامي.
 */
function parseItems(
  formData: FormData,
  name: string,
  keys: string[],
  requiredKey: string
): Record<string, string>[] {
  const raw = formData.get(name);
  if (typeof raw !== "string" || raw === "") return [];
  try {
    const arr: unknown = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    const items: Record<string, string>[] = [];
    for (const entry of arr) {
      if (typeof entry !== "object" || entry === null) continue;
      const rec = entry as Record<string, unknown>;
      const item: Record<string, string> = {};
      for (const k of keys) {
        const v = rec[k];
        const t = typeof v === "string" ? v.trim() : "";
        // المفاتيح الاختيارية الفارغة تُسقط، والإلزامي يبقى للفحص أدناه
        if (t !== "" || k === requiredKey) item[k] = t;
      }
      // 🔒 `_k` يعبر كما هو: هو عنوان ترجمة العنصر، وإسقاطه يعيد العنونة إلى
      //    الترتيب فتنتقل ترجمة العنصر إلى جاره بأول إعادة ترتيب.
      for (const k of ITEM_PRESERVED_KEYS) {
        const v = rec[k];
        if (typeof v === "string" && v !== "") item[k] = v;
      }
      if ((item[requiredKey] ?? "") !== "") items.push(item);
    }
    return items;
  } catch {
    return [];
  }
}

type SectionRow = { id: string; type: string; sort: number; content: Record<string, unknown> | null };

/**
 * بناء JSONB القسم من حقول النموذج `section-<id>-<field>` بحسب نوعه.
 * `null` = **لا تلمس هذا الصف** (نوعٌ خارج العقد، أو نوعٌ يملكه منشئ الصفحات).
 */
function sectionContentFromForm(
  formData: FormData,
  section: SectionRow
): Record<string, unknown> | null {
  const f = (field: string) => str(formData, `section-${section.id}-${field}`);
  const items = (keys: string[], requiredKey: string) =>
    parseItems(formData, `section-${section.id}-items`, keys, requiredKey);

  if (!isSectionType(section.type)) return null; // نوع خارج العقد — لا نلمسه

  switch (section.type) {
    // 🔒 كتل منشئ الصفحات: هذا المحرر لا يعرض حقولها ولا يكتبها — الكاتب
    //    الوحيد لها هو المنشئ، وأي كتابةٍ من هنا كانت ستمحو محتواها بالكامل.
    //    (الدالة تعيد بناء `content` من النموذج في كل حفظ، فالمفتاح الذي لا
    //    يعرفه الـ`switch` يسقط صامتاً — ومنه `items` كاملة و`_k` معها.)
    case "columns":
    case "image":
    case "logo-strip":
    case "stat-band":
    case "route-rail":
    /**
     * 🔴 **`hero` انضمّت إليها في م‑٧ — وهو إصلاح عطبٍ واقعٍ لا احتياط.**
     *
     * كان السطر هنا `prune({ headline: f("headline"), sub: f("sub") })`
     * والنموذج لا يعرض غيرهما. فحفظُ الرئيسية من `/admin/content/<home>` —
     * ولو لتصحيح فاصلة — كان **يمحو صامتاً** ستة حقولٍ حيّة كتبتها م‑٢ وم‑٦:
     * `badge` · `scrollLabel` · `imageAlt` · `src` · `poster` · `video`،
     * **و`items` الثلاثة بمفاتيحها `_k`** معها. أي أن صورة البطل وفيديوه
     * كانا يختفيان من الصفحة الرئيسية بضغطة «حفظ» لا علاقة لها بهما.
     *
     * وم‑٧ كانت ستضاعفه (حقولٌ أخرى في العناصر)، فعولج بالطريق الأول الذي
     * سمّاه العقد §١٢ أسلم: **كاتبٌ واحد**، لا قائمةُ استثناءاتٍ تنحرف.
     *
     * و`services-grid` معها للسبب نفسه: صارت تحمل `items` كاملة (بطاقات
     * الخدمات بصورها وأيقوناتها)، و`prune({title, sub})` كان سيمحوها كلها.
     */
    case "hero":
    case "services-grid":
    /**
     * 🔴 **كتل م‑١٠ الأربع تنضم للسبب نفسه، وواحدةٌ منها أخطر من إخوتها:**
     * `clause.anchor` معرّفٌ **أُرسل في روابط**. وهذا المحرر يعيد بناء
     * `content` من النموذج في كل حفظ، ولا يعرض حقل المرساة — فحفظُ صفحة
     * الشروط من هنا لتصحيح فاصلة كان **يمحو مرساة كل بند**، فتعود كل بندٍ
     * إلى مرساة معرّف الصفّ، **وكل رابطٍ أرسله المالك أو فريقه لعميل يهبط في
     * أول الصفحة** — بلا ٤٠٤ ولا خطأ ولا سطرٍ في أي سجل.
     *
     * و`table.items` تحمل خلايا الجدول كلها بمفاتيحها `_k`: بناؤها من نموذجٍ
     * لا يعرضها = جدولٌ يُفرَّغ بضغطة حفظ.
     */
    case "page-toc":
    case "clause":
    case "table":
    case "callout":
      return null;
    case "page-hero":
      return prune({ title: f("title") ?? "", sub: f("sub"), ctaLabel: f("ctaLabel") });
    case "fleet":
    case "why-us":
    case "contact":
      return prune({ title: f("title"), sub: f("sub") });
    case "features":
      return prune({ title: f("title"), sub: f("sub"), items: items(["title", "text"], "title") });
    case "rich-text":
      return prune({
        title: f("title"),
        body: multiline(formData, `section-${section.id}-body`) ?? "",
      });
    case "faq":
      return prune({ title: f("title"), items: items(["q", "a"], "q") });
    case "cta-band":
      return prune({ title: f("title"), note: f("note") });
  }
}

/**
 * حفظ الصفحة كاملة: حقول الصفحة (العنوان/النشر/الميتا) + محتوى كل الأقسام
 * وظهورها في نموذج واحد. قائمة الأقسام تُقرأ من قاعدة البيانات لا من العميل —
 * العميل يرسل القيم فقط، والمعرّفات مصدرها الخادم (حدود أمان الإجراءات).
 */
export async function savePage(pageId: string, formData: FormData) {
  const supabase = await createServerSupabase();
  if (!supabase) redirect(editorUrl(pageId, "error=env"));

  const title = str(formData, "title");
  if (!title) redirect(editorUrl(pageId, "error=title"));

  /**
   * 🔒 القراءة قبل الكتابة — `pages.meta` عمود jsonb يُستبدل كاملاً.
   *
   * كانت هذه الدالة تبني `{title, description}` وتكتبه فوق العمود، فتمحو كل
   * مفتاح لا تعرفه: `noindex` و`excludeFromSitemap` و`ogImageUrl` و
   * `canonicalPath` التي يضبطها المالك من مركز السيو (الدفعة ٤ — الملاحظة ٤).
   *
   * والسيناريو الذي أمسكته المراجعة: يمنع المالك فهرسة «صفحة الشكر» من مركز
   * السيو، ثم يصحّح فاصلة في نصّها من هذا المحرر — فتعود الصفحة إلى نتائج
   * البحث وإلى `sitemap.xml` **صامتةً**. وهذه هي الشاشة التي تُحرَّر منها
   * الصفحات فعلاً، فالعطب هنا أوقع منه في المحرر الجماعي.
   *
   * والنسخ صراحةً لا `select("*")`: نقرأ `meta` وحده لأنه ما نكتبه.
   */
  const existing = await supabase.from("pages").select("meta").eq("id", pageId).maybeSingle();
  if (existing.error) redirect(editorUrl(pageId, "error=save"));

  const meta = {
    ...((existing.data?.meta as Record<string, unknown> | null) ?? {}),
    title: str(formData, "meta.title") ?? null,
    description: str(formData, "meta.description") ?? null,
  };
  const published = formData.get("published") != null;

  const pageRes = await supabase
    .from("pages")
    .update({ title, published, meta })
    .eq("id", pageId)
    .select("id");
  if (pageRes.error || !pageRes.data || pageRes.data.length === 0)
    redirect(editorUrl(pageId, "error=save"));

  // `content` يُقرأ مع الصف لا لأنه يُعرض، بل لأن مفاتيح لا يملكها هذا المحرر
  // تعيش فيه (‏`style`) ويجب أن تعبر الحفظ سالمة — انظر `PRESERVED_CONTENT_KEYS`.
  const sectionsRes = await supabase
    .from("sections")
    .select("id, type, sort, content")
    .eq("page_id", pageId);
  if (sectionsRes.error) redirect(editorUrl(pageId, "error=save"));

  for (const section of (sectionsRes.data ?? []) as SectionRow[]) {
    const built = sectionContentFromForm(formData, section);
    if (built === null) continue;

    const existing = section.content ?? {};
    const content: Record<string, unknown> = { ...built };
    for (const key of PRESERVED_CONTENT_KEYS) {
      if (existing[key] !== undefined) content[key] = existing[key];
    }

    const visible = formData.get(`section-${section.id}-visible`) != null;
    const res = await supabase
      .from("sections")
      .update({ content, visible })
      .eq("id", section.id)
      .select("id");
    if (res.error || !res.data || res.data.length === 0)
      redirect(editorUrl(pageId, "error=save"));
  }

  revalidatePath("/", "layout");
  redirect(editorUrl(pageId, "saved=1"));
}

/** إضافة قسم جديد في آخر الصفحة بمحتوى ابتدائي فارغ */
export async function addSection(pageId: string, formData: FormData) {
  const supabase = await createServerSupabase();
  if (!supabase) redirect(editorUrl(pageId, "error=env"));

  const type = formData.get("type");
  if (!isSectionType(type)) redirect(editorUrl(pageId, "error=type"));

  const last = await supabase
    .from("sections")
    .select("sort")
    .eq("page_id", pageId)
    .order("sort", { ascending: false })
    .limit(1);
  const nextSort = ((last.data?.[0]?.sort as number | undefined) ?? -1) + 1;

  const res = await supabase
    .from("sections")
    .insert({
      page_id: pageId,
      type,
      content: DEFAULT_SECTION_CONTENT[type],
      sort: nextSort,
      visible: true,
    })
    .select("id");
  if (res.error || !res.data || res.data.length === 0)
    redirect(editorUrl(pageId, "error=save"));

  revalidatePath("/", "layout");
  redirect(editorUrl(pageId, "saved=1"));
}

/** حذف قسم نهائياً */
export async function deleteSection(pageId: string, sectionId: string) {
  const supabase = await createServerSupabase();
  if (!supabase) redirect(editorUrl(pageId, "error=env"));

  const res = await supabase.from("sections").delete().eq("id", sectionId).select("id");
  if (res.error || !res.data || res.data.length === 0)
    redirect(editorUrl(pageId, "error=save"));

  revalidatePath("/", "layout");
  redirect(editorUrl(pageId, "saved=1"));
}

/**
 * تحريك قسم لأعلى/لأسفل: يقرأ الترتيب الحالي، يبدّل الموضعين، ثم يعيد ترقيم
 * `sort` تسلسلياً (يعالج أيضاً أي تساوٍ قديم في القيم) ويحدّث ما تغيّر فقط.
 */
export async function moveSection(pageId: string, sectionId: string, dir: "up" | "down") {
  const supabase = await createServerSupabase();
  if (!supabase) redirect(editorUrl(pageId, "error=env"));

  // 🔒 كتل الجذر وحدها: هذا الترتيب يعيد ترقيم `sort` تسلسلياً لما يقرؤه، ولو
  //    دخل أبناءُ كتلة الأعمدة في العدّ لخلط ترتيبَهم داخل أبيهم بترتيب الصفحة.
  const listRes = await supabase
    .from("sections")
    .select("id, sort")
    .eq("page_id", pageId)
    .is("parent_id", null)
    .order("sort");
  if (listRes.error || !listRes.data?.length) redirect(editorUrl(pageId, "error=save"));

  const rows = listRes.data as { id: string; sort: number }[];
  const index = rows.findIndex((r) => r.id === sectionId);
  if (index === -1) redirect(editorUrl(pageId, "error=save"));

  const target = dir === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= rows.length) redirect(`/admin/content/${pageId}`); // طرف القائمة — لا شيء يُفعل

  const ordered = [...rows];
  [ordered[index], ordered[target]] = [ordered[target], ordered[index]];

  for (let i = 0; i < ordered.length; i++) {
    if (ordered[i].sort === i) continue;
    const res = await supabase
      .from("sections")
      .update({ sort: i })
      .eq("id", ordered[i].id)
      .select("id");
    if (res.error || !res.data || res.data.length === 0)
      redirect(editorUrl(pageId, "error=save"));
  }

  revalidatePath("/", "layout");
  redirect(editorUrl(pageId, "saved=1"));
}

/** تبديل حالة النشر — يُستدعى من قائمة المحتوى (نشر/إلغاء نشر سريع) */
export async function togglePublished(pageId: string) {
  const supabase = await createServerSupabase();
  if (!supabase) redirect("/admin/content?error=env");

  const current = await supabase.from("pages").select("published").eq("id", pageId).single();
  if (current.error || current.data == null) redirect("/admin/content?error=save");

  const res = await supabase
    .from("pages")
    .update({ published: !current.data.published })
    .eq("id", pageId)
    .select("id");
  if (res.error || !res.data || res.data.length === 0) redirect("/admin/content?error=save");

  revalidatePath("/", "layout");
  redirect("/admin/content?saved=1");
}
