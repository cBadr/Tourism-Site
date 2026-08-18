"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createServerSupabase } from "@/lib/supabase/server";

/**
 * إجراءات اتفاقية المتعهد في اللوحة — هجرة `0113`.
 *
 * ── ما يقع هنا وما لا يقع ──────────────────────────────────────────────────
 *
 * **يقع هنا**: تحريرُ **المسودة** وحدها — العنوان والديباجة وبنودها: إضافةً
 * وتعديلاً وحذفاً وترتيباً. وهو تحريرُ مصفوفةٍ في `jsonb`، لا قرارَ مالٍ ولا
 * أهلية.
 *
 * **لا يقع هنا**: النشرُ ولا الترقيمُ ولا البصمةُ ولا أثرُ النشر على القبولات —
 * كلُّها في `publish_partner_agreement` بحارسها (`is_admin()`) وقفلِها
 * وفهرسِها الفريد. ولو نُسخ شيءٌ من ذلك إلى هنا لصار تعريفان ينحرفان يوم يُعدَّل
 * أحدهما (D-05).
 *
 * 🔒 **والمنشورُ لا يُحرَّر من هنا بحال**: يمنعه حارسُ الصفّ في القاعدة **وسياسةُ
 *    RLS معاً** (`using (is_admin() and status = 'draft')`) — حاجزان لا واحد.
 *    فحتى لو مرّرت هذه الطبقةُ معرّفَ إصدارٍ منشور، رجعت الكتابةُ بصفر صفوف.
 *
 * ⚠ **وفخ RLS المعروف**: الكتابة تنجح ظاهرياً بصفر صفوف عند رفض السياسة — لذلك
 *   `.select()` بعد كل كتابة وفحصُ طول النتيجة. وبدونه يقرأ المالك «حُفظ» ولا شيء
 *   حُفظ.
 *
 * واتفاقية «إعادة التوجيه بعد العملية»: النجاح والفشل كلاهما `redirect` برمز.
 */

const url = (qs: string) => `/admin/partner-agreement?${qs}`;

const MAX_TITLE = 200;
const MAX_PREAMBLE = 8000;
const MAX_CLAUSE_TITLE = 200;
const MAX_CLAUSE_BODY = 20000;
const MAX_CLAUSES = 60;

/** الأرقام العربية الهندية تُقبل في الحقول الرقمية وتُحوَّل قبل التحقق */
const toLatinDigits = (s: string) => s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));

function text(formData: FormData, name: string): string | null {
  const value = formData.get(name);
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function num(formData: FormData, name: string): number | null {
  const value = formData.get(name);
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number(toLatinDigits(value.trim()));
  return Number.isFinite(parsed) ? parsed : null;
}

type Clause = { k: string; title: string; body: string };

/** قراءة بنود المسودة كما هي في القاعدة — دفاعياً، فالعمود `jsonb` حرّ البنية */
function toClauses(value: unknown): Clause[] {
  if (!Array.isArray(value)) return [];
  const out: Clause[] = [];
  value.forEach((raw, index) => {
    if (typeof raw !== "object" || raw === null) return;
    const item = raw as Record<string, unknown>;
    out.push({
      k: typeof item.k === "string" && item.k.trim() !== "" ? item.k : `c${index + 1}`,
      title: typeof item.title === "string" ? item.title : "",
      body: typeof item.body === "string" ? item.body : "",
    });
  });
  return out;
}

/** مفتاحٌ ثابت لا يتكرر — يبقى مع البند عبر النسخ والترتيب، فتبقى الواجهة مستقرة */
function mintKey(taken: Set<string>): string {
  for (let i = 1; i <= MAX_CLAUSES * 4; i += 1) {
    const key = `c${String(i).padStart(2, "0")}`;
    if (!taken.has(key)) return key;
  }
  return `c${Date.now().toString(36)}`;
}

type DraftHandle = {
  supabase: NonNullable<Awaited<ReturnType<typeof createServerSupabase>>>;
  id: string;
  clauses: Clause[];
};

/**
 * تحميل المسودة المفتوحة — أو الفشل برمز. ولا تُقبل مسودةٌ بمعرّفٍ من النموذج:
 * المسودة **واحدة** بحكم `draft_partner_agreement_from_current`، فقراءتها من
 * الحالة لا من المدخلات تُغلق باباً كاملاً على تمرير معرّفِ إصدارٍ منشور.
 */
async function loadDraft(): Promise<DraftHandle | string> {
  const supabase = await createServerSupabase();
  if (!supabase) return "env";

  const res = await supabase
    .from("partner_agreement_versions")
    .select("id, clauses")
    .eq("status", "draft")
    .limit(1);

  if (res.error) return "load";
  const row = res.data?.[0] as Record<string, unknown> | undefined;
  if (!row) return "nodraft";

  return { supabase, id: String(row.id), clauses: toClauses(row.clauses) };
}

async function writeClauses(handle: DraftHandle, clauses: Clause[]): Promise<string | null> {
  const res = await handle.supabase
    .from("partner_agreement_versions")
    .update({ clauses })
    .eq("id", handle.id)
    .eq("status", "draft")
    .select("id");

  if (res.error) return "save";
  // فخ الصفوف الصفرية: السياسة رفضت ولا خطأ يظهر
  if ((res.data?.length ?? 0) === 0) return "denied";
  return null;
}

/* ------------------------------------------------------------------ */
/* المسودة                                                             */
/* ------------------------------------------------------------------ */

export async function startDraft() {
  const supabase = await createServerSupabase();
  if (!supabase) redirect(url("error=env"));

  const res = await supabase.rpc("draft_partner_agreement_from_current");
  if (res.error) {
    const message = `${res.error.hint ?? ""} ${res.error.message ?? ""}`;
    redirect(
      url(
        `error=${
          message.includes("agreement-draft-exists")
            ? "draftexists"
            : message.includes("forbidden")
              ? "forbidden"
              : "save"
        }`
      )
    );
  }

  revalidatePath("/admin/partner-agreement");
  redirect(url("saved=1"));
}

export async function discardDraft() {
  const handle = await loadDraft();
  if (typeof handle === "string") redirect(url(`error=${handle}`));

  const res = await handle.supabase
    .from("partner_agreement_versions")
    .delete()
    .eq("id", handle.id)
    .eq("status", "draft")
    .select("id");

  if (res.error) redirect(url("error=save"));
  if ((res.data?.length ?? 0) === 0) redirect(url("error=denied"));

  revalidatePath("/admin/partner-agreement");
  redirect(url("saved=1"));
}

export async function saveDraftHeader(formData: FormData) {
  const handle = await loadDraft();
  if (typeof handle === "string") redirect(url(`error=${handle}`));

  const title = text(formData, "title");
  if (!title || title.length < 2 || title.length > MAX_TITLE) redirect(url("error=title"));

  const preamble = (text(formData, "preamble") ?? "").slice(0, MAX_PREAMBLE);
  const changeNote = text(formData, "change_note");

  const res = await handle.supabase
    .from("partner_agreement_versions")
    .update({ title, preamble, change_note: changeNote })
    .eq("id", handle.id)
    .eq("status", "draft")
    .select("id");

  if (res.error) redirect(url("error=save"));
  if ((res.data?.length ?? 0) === 0) redirect(url("error=denied"));

  revalidatePath("/admin/partner-agreement");
  redirect(url("saved=1"));
}

/* ------------------------------------------------------------------ */
/* البنود                                                              */
/* ------------------------------------------------------------------ */

export async function addClause(formData: FormData) {
  const handle = await loadDraft();
  if (typeof handle === "string") redirect(url(`error=${handle}`));
  if (handle.clauses.length >= MAX_CLAUSES) redirect(url("error=toomany"));

  const title = text(formData, "title");
  const body = text(formData, "body");
  if (!title || title.length > MAX_CLAUSE_TITLE) redirect(url("error=clausetitle"));
  if (!body || body.length > MAX_CLAUSE_BODY) redirect(url("error=clausebody"));

  const taken = new Set(handle.clauses.map((clause) => clause.k));
  const next = [...handle.clauses, { k: mintKey(taken), title, body }];

  const failure = await writeClauses(handle, next);
  if (failure) redirect(url(`error=${failure}`));

  revalidatePath("/admin/partner-agreement");
  redirect(url("saved=1"));
}

export async function saveClause(formData: FormData) {
  const handle = await loadDraft();
  if (typeof handle === "string") redirect(url(`error=${handle}`));

  const key = text(formData, "key");
  const title = text(formData, "title");
  const body = text(formData, "body");
  if (!key) redirect(url("error=notfound"));
  if (!title || title.length > MAX_CLAUSE_TITLE) redirect(url("error=clausetitle"));
  if (!body || body.length > MAX_CLAUSE_BODY) redirect(url("error=clausebody"));

  let seen = false;
  const next = handle.clauses.map((clause) => {
    if (clause.k !== key) return clause;
    seen = true;
    return { ...clause, title, body };
  });
  if (!seen) redirect(url("error=notfound"));

  const failure = await writeClauses(handle, next);
  if (failure) redirect(url(`error=${failure}`));

  revalidatePath("/admin/partner-agreement");
  redirect(url("saved=1"));
}

export async function deleteClause(formData: FormData) {
  const handle = await loadDraft();
  if (typeof handle === "string") redirect(url(`error=${handle}`));

  const key = text(formData, "key");
  if (!key) redirect(url("error=notfound"));

  const next = handle.clauses.filter((clause) => clause.k !== key);
  if (next.length === handle.clauses.length) redirect(url("error=notfound"));

  const failure = await writeClauses(handle, next);
  if (failure) redirect(url(`error=${failure}`));

  revalidatePath("/admin/partner-agreement");
  redirect(url("saved=1"));
}

export async function moveClause(formData: FormData) {
  const handle = await loadDraft();
  if (typeof handle === "string") redirect(url(`error=${handle}`));

  const key = text(formData, "key");
  const direction = text(formData, "direction");
  if (!key || (direction !== "up" && direction !== "down")) redirect(url("error=notfound"));

  const index = handle.clauses.findIndex((clause) => clause.k === key);
  if (index < 0) redirect(url("error=notfound"));

  const target = direction === "up" ? index - 1 : index + 1;
  // الطرفان: لا خطأ ولا حركة — ضغطةٌ على سهمٍ معطّل ليست عطلاً يُبلَّغ عنه
  if (target < 0 || target >= handle.clauses.length) redirect(url("saved=1"));

  const next = [...handle.clauses];
  [next[index], next[target]] = [next[target], next[index]];

  const failure = await writeClauses(handle, next);
  if (failure) redirect(url(`error=${failure}`));

  revalidatePath("/admin/partner-agreement");
  redirect(url("saved=1"));
}

/* ------------------------------------------------------------------ */
/* النشر والمقابض                                                      */
/* ------------------------------------------------------------------ */

export async function publishDraft(formData: FormData) {
  const supabase = await createServerSupabase();
  if (!supabase) redirect(url("error=env"));

  const handle = await loadDraft();
  if (typeof handle === "string") redirect(url(`error=${handle}`));

  const graceDays = num(formData, "grace_days");
  if (graceDays === null || !Number.isInteger(graceDays) || graceDays < 0 || graceDays > 180) {
    redirect(url("error=grace"));
  }

  const res = await supabase.rpc("publish_partner_agreement", {
    p_id: handle.id,
    p_grace_days: graceDays,
  });

  if (res.error) {
    const message = `${res.error.hint ?? ""} ${res.error.message ?? ""}`;
    redirect(
      url(
        `error=${
          message.includes("agreement-empty")
            ? "empty"
            : message.includes("forbidden")
              ? "forbidden"
              : "save"
        }`
      )
    );
  }

  /*
    النشرُ يغيّر أهليةَ البثّ لكل شريك في اللحظة نفسها (كلُّ قبولٍ سابق صار على
    إصدارٍ مؤرشف)، فتُبطَل ذاكرةُ البورتال أيضاً لا هذه الشاشة وحدها.
  */
  revalidatePath("/admin/partner-agreement");
  revalidatePath("/portal");
  revalidatePath("/portal/agreement");
  redirect(url("published=1"));
}

export async function saveGateSettings(formData: FormData) {
  const supabase = await createServerSupabase();
  if (!supabase) redirect(url("error=env"));

  const graceDays = num(formData, "grace_days");
  if (graceDays === null || !Number.isInteger(graceDays) || graceDays < 0 || graceDays > 180) {
    redirect(url("error=grace"));
  }

  const res = await supabase
    .from("partner_agreement_settings")
    .update({ gate_enabled: formData.get("gate_enabled") != null, grace_days: graceDays })
    .eq("id", true)
    .select("id");

  if (res.error) redirect(url("error=save"));
  if ((res.data?.length ?? 0) === 0) redirect(url("error=denied"));

  revalidatePath("/admin/partner-agreement");
  revalidatePath("/portal");
  redirect(url("saved=1"));
}
