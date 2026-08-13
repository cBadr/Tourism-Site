"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createServerSupabase } from "@/lib/supabase/server";
import { clearRedirectsCache } from "@/lib/seo/redirects";
import {
  validateEnable,
  validateRedirect,
  type RedirectErrorCode,
  type RedirectInput,
} from "@/lib/seo/validate";

import { loadPagePaths, loadRedirects } from "./loader";

/**
 * إجراءات مدير التحويلات.
 *
 * ── لماذا لا يوجد «حذف» ─────────────────────────────────────────────────────
 * الشاشة تضيف وتعدّل و**تعطّل** فقط. قاعدة قديمة معطّلة تبقى سجلاً يشرح لماذا
 * كان ذلك الرابط يذهب إلى هناك، والتعطيل يفعل نفس ما يفعله الحذف من ناحية
 * الزائر مع إمكان التراجع. نفس مبدأ الدفتر: لا محو تاريخ (`CONVENTIONS.md §٢`).
 *
 * ── التحقق قبل الكتابة، دائماً ──────────────────────────────────────────────
 * `validateRedirect` تمنع الحلقة المباشرة والسلسلة الدائرية والمسار بلا شرطة
 * والتحويل الذي يصطدم بصفحة حية. والفحص الدائري يمشي على الرسم البياني فعلاً
 * لا يقارن سطحياً — ويُعاد عند **تفعيل** قاعدة معطّلة، لأن التفعيل وحده قد
 * يُغلق حلقة لم تكن قائمة وقت الحفظ.
 *
 * ── الذاكرة القصيرة ─────────────────────────────────────────────────────────
 * `clearRedirectsCache()` يُسقط ذاكرة **هذه العملية**. في الإنتاج قد يعمل
 * الوسيط في عملية أخرى، فالضمان المعلن للمالك في الشاشة هو انتهاء المهلة
 * (نصف دقيقة) لا هذا الاستدعاء — والشاشة تقول ذلك بنصّه بدل أن تَعِد بفورية
 * لا تُنفَّذ (درس `LESSONS.md` النمط ٢).
 */

const url = (qs: string) => `/admin/seo/redirects?${qs}`;
const fail = (code: RedirectErrorCode | "env" | "save" | "load" | "missing", id?: string) =>
  url(`error=${code}${id ? `&row=${id}` : ""}`);

/** قراءة نموذج قاعدة تحويل واحدة */
function readInput(formData: FormData): RedirectInput {
  const str = (name: string): string => {
    const value = formData.get(name);
    return typeof value === "string" ? value.trim() : "";
  };
  return {
    fromPath: str("from_path"),
    toPath: str("to_path"),
    statusCode: Number(str("status_code")),
    // مربع اختيار غير مؤشَّر لا يُرسل أصلاً — الغياب يعني «معطّل»
    enabled: formData.get("enabled") != null,
    note: str("note") === "" ? null : str("note"),
  };
}

/** يُنهي أي كتابة ناجحة: إسقاط الذاكرة ثم إبطال الكاش ثم التوجيه */
function done(qs: string): never {
  clearRedirectsCache();
  revalidatePath("/", "layout");
  redirect(url(qs));
}

export async function createRedirect(formData: FormData) {
  const supabase = await createServerSupabase();
  if (!supabase) redirect(fail("env"));

  const [{ rows, missingTable, failed }, pagePaths] = await Promise.all([
    loadRedirects(supabase),
    loadPagePaths(supabase),
  ]);
  if (missingTable) redirect(fail("missing"));
  if (failed) redirect(fail("load"));

  const check = validateRedirect(readInput(formData), { existing: rows, pagePaths });
  if (!check.ok) redirect(fail(check.code));

  const res = await supabase
    .from("redirects")
    .insert({
      from_path: check.value.fromPath,
      to_path: check.value.toPath,
      status_code: check.value.statusCode,
      enabled: check.value.enabled,
      note: check.value.note,
    })
    .select("id");

  // 23505 = خرق القيد الفريد على from_path (سباق: صفّ أُضيف بين القراءة والكتابة)
  if (res.error?.code === "23505") redirect(fail("duplicate"));
  // صفر صفوف مع نجاح ظاهري = RLS رفضت الكتابة (المستخدم ليس admin)
  if (res.error || !res.data || res.data.length === 0) redirect(fail("save"));

  done("saved=created");
}

export async function updateRedirect(id: string, formData: FormData) {
  const supabase = await createServerSupabase();
  if (!supabase) redirect(fail("env", id));

  const [{ rows, missingTable, failed }, pagePaths] = await Promise.all([
    loadRedirects(supabase),
    loadPagePaths(supabase),
  ]);
  if (missingTable) redirect(fail("missing"));
  if (failed) redirect(fail("load", id));

  // الصف الجاري تعديله يُستبعد من سياق التحقق وإلا صادم نفسه في فحص التكرار
  const others = rows.filter((row) => row.id !== id);

  const check = validateRedirect(readInput(formData), { existing: others, pagePaths });
  if (!check.ok) redirect(fail(check.code, id));

  const res = await supabase
    .from("redirects")
    .update({
      from_path: check.value.fromPath,
      to_path: check.value.toPath,
      status_code: check.value.statusCode,
      enabled: check.value.enabled,
      note: check.value.note,
    })
    .eq("id", id)
    .select("id");

  if (res.error?.code === "23505") redirect(fail("duplicate", id));
  if (res.error || !res.data || res.data.length === 0) redirect(fail("save", id));

  done("saved=updated");
}

/** تفعيل/تعطيل قاعدة — التفعيل وحده يمر بفحص الحلقة */
export async function toggleRedirect(id: string) {
  const supabase = await createServerSupabase();
  if (!supabase) redirect(fail("env", id));

  const { rows, missingTable, failed } = await loadRedirects(supabase);
  if (missingTable) redirect(fail("missing"));
  if (failed) redirect(fail("load", id));

  const current = rows.find((row) => row.id === id);
  if (!current) redirect(fail("load", id));

  const next = !current.enabled;
  if (next) {
    const check = validateEnable(
      current,
      rows.filter((row) => row.id !== id)
    );
    if (!check.ok) redirect(fail(check.code, id));
  }

  const res = await supabase
    .from("redirects")
    .update({ enabled: next })
    .eq("id", id)
    .select("id");

  if (res.error || !res.data || res.data.length === 0) redirect(fail("save", id));

  done(next ? "saved=enabled" : "saved=disabled");
}
