/**
 * التحقق من قواعد التحويل — دوال نقية بلا قاعدة بيانات ولا شبكة.
 *
 * كل فحص هنا يمنع عطباً **صامتاً**: التحويل لا يرمي خطأ ولا يترك أثراً، بل
 * يبتلع صفحة أو يعلّق المتصفح في حلقة. لذلك التحقق يقع **قبل** الحفظ، والقاعدة
 * لا تُكتب إلا بقاعدة سليمة.
 *
 * أربعة أخطاء موثّقة في موجز المرحلة، وكلها هنا:
 *  (١) الحلقة المباشرة  — من = إلى.
 *  (٢) السلسلة الدائرية — أ ⇒ ب ⇒ أ (تُفحص فعلياً بالمشي على الرسم البياني،
 *      لا بمقارنة سطحية).
 *  (٣) مسار لا يبدأ بـ `/` — أو يحمل نطاقاً (`https://...` أو `//host`).
 *  (٤) تحويل يصطدم بمسار **قائم فعلاً** في الموقع — أخطرها: صفحة حية تختفي.
 *
 * وحاجز خامس يفشل مغلقاً في `lib/seo/redirects.ts`: أي حلقة تصل القاعدة رغم
 * هذا كله (كتابة مباشرة في القاعدة) تُلغي التحويل بدل أن تُنفَّذه.
 */

import {
  REDIRECT_MAX_HOPS,
  REDIRECT_STATUS_CODES,
  normalizeRedirectPath,
  redirectKey,
  splitTarget,
  type RedirectStatus,
} from "@/lib/seo/redirects";
import {
  APP_OWNED_PATHS,
  RESERVED_EXACT_FILES,
  RESERVED_PATH_PREFIXES,
} from "@/lib/seo/site-paths";

/** صف تحويل كما تعرضه اللوحة */
export type RedirectRecord = {
  id: string;
  fromPath: string;
  toPath: string;
  statusCode: RedirectStatus;
  enabled: boolean;
  note: string | null;
};

/** أقصى طول لمسار — أطول من أي مسار حقيقي، وحاجز أمام لصق نص كامل */
export const MAX_REDIRECT_PATH = 300;
/** أقصى طول للملاحظة الداخلية */
export const MAX_REDIRECT_NOTE = 200;

/** رموز الخطأ — كل سبب رمزه، فلا رسالة عامة تُخفي أي الحقول أخطأ (اتفاقية §٤) */
export type RedirectErrorCode =
  | "from-empty"
  | "to-empty"
  | "from-slash"
  | "to-slash"
  | "absolute"
  | "space"
  | "too-long"
  | "note-long"
  | "status"
  | "loop"
  | "cycle"
  | "duplicate"
  | "exists";

export const REDIRECT_ERROR_MESSAGES: Record<RedirectErrorCode, string> = {
  "from-empty": "المسار القديم مطلوب — اكتب المسار الذي تريد تحويله.",
  "to-empty": "المسار الجديد مطلوب — اكتب الوجهة التي يذهب إليها الزائر.",
  "from-slash": "المسار القديم يجب أن يبدأ بشرطة مائلة: ‎/old-page‎ لا ‎old-page‎.",
  "to-slash": "المسار الجديد يجب أن يبدأ بشرطة مائلة: ‎/new-page‎ لا ‎new-page‎.",
  absolute:
    "التحويل داخل هذا الموقع فقط — اكتب مساراً لا رابطاً كاملاً بنطاق (‎/new-page‎ لا ‎https://…‎).",
  space: "المسار لا يقبل مسافات — استبدلها بشرطة ‎-‎.",
  "too-long": `المسار أطول من ${MAX_REDIRECT_PATH} حرفاً — تأكد أنك لصقت مساراً لا صفحة.`,
  "note-long": `الملاحظة أطول من ${MAX_REDIRECT_NOTE} حرفاً.`,
  status: "رمز التحويل غير مقبول — اختر ٣٠١ أو ٣٠٢ أو ٣٠٧ أو ٣٠٨.",
  loop: "المسار القديم والجديد متطابقان — هذا تحويل إلى نفسه ويعلّق المتصفح في حلقة.",
  cycle:
    "هذا التحويل يُغلق حلقة مع تحويل قائم (أ ⇒ ب ⇒ أ) — سيدور المتصفح بلا نهاية. عطّل التحويل الآخر أولاً.",
  duplicate: "يوجد تحويل بنفس المسار القديم — عدّله بدل إضافة ثانٍ.",
  exists:
    "هذا المسار صفحة تعمل فعلاً في الموقع — التحويل منه يُخفيها عن الزوار ومحركات البحث بلا أي رسالة خطأ.",
};

export type RedirectInput = {
  fromPath: string;
  toPath: string;
  statusCode: number;
  enabled: boolean;
  note: string | null;
};

export type ValidationContext = {
  /** كل التحويلات القائمة — بلا الصف الجاري تعديله */
  existing: RedirectRecord[];
  /**
   * مسارات صفحات `pages` العامة (منشورة ومسودة) مطبَّعة كما جاءت من القاعدة.
   * تُدمج مع المسارات التي يملكها `app/` داخل الدالة.
   */
  pagePaths: string[];
};

export type ValidationResult =
  | { ok: true; value: { fromPath: string; toPath: string; statusCode: RedirectStatus; enabled: boolean; note: string | null } }
  | { ok: false; code: RedirectErrorCode };

/** رابط كامل بنطاق، أو مسار بروتوكول-نسبي (`//evil.com`) */
function isAbsolute(value: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith("//");
}

/**
 * هل المسار مملوك للموقع فعلاً؟ يشمل مسارات `app/` الثابتة، وبادئات المقاطع
 * الديناميكية، وملفات السيو، وكل صفحة في `pages` (منشورة أو مسودة).
 */
export function isLiveSitePath(pathname: string, pagePaths: string[]): boolean {
  const key = redirectKey(pathname);
  if (key === "") return false;

  if (APP_OWNED_PATHS.some((p) => redirectKey(p) === key)) return true;
  if (RESERVED_EXACT_FILES.some((p) => redirectKey(p) === key)) return true;
  if (pagePaths.some((p) => redirectKey(p) === key)) return true;

  return RESERVED_PATH_PREFIXES.some((prefix) => {
    const pk = redirectKey(prefix);
    return key === pk || key.startsWith(`${pk}/`);
  });
}

/**
 * يمشي على سلسلة التحويلات ابتداءً من `startKey` باحثاً عن `targetKey`.
 * true = السلسلة تعود إلى نقطة البداية ⇒ حلقة.
 * تُفحص القواعد **المفعّلة** وحدها لأنها وحدها التي تعمل وقت التشغيل، ويُعاد
 * الفحص عند تفعيل أي قاعدة معطّلة (`validateEnable`).
 */
function closesCycle(startKey: string, targetKey: string, enabled: RedirectRecord[]): boolean {
  const graph = new Map<string, string>();
  for (const rule of enabled) {
    graph.set(redirectKey(rule.fromPath), redirectKey(splitTarget(rule.toPath).pathname));
  }

  const seen = new Set<string>();
  let cursor = startKey;
  for (let i = 0; i <= REDIRECT_MAX_HOPS * 2; i++) {
    if (cursor === targetKey) return true;
    if (seen.has(cursor)) return true; // حلقة قائمة أصلاً — لا نضيف إليها
    seen.add(cursor);
    const next = graph.get(cursor);
    if (next === undefined) return false;
    cursor = next;
  }
  // سلسلة أطول من السقف: تُعامل كحلقة — التحويل لن يعمل وقت التشغيل على أي حال
  return true;
}

/** التحقق الكامل لقاعدة تحويل واحدة قبل الحفظ */
export function validateRedirect(
  input: RedirectInput,
  ctx: ValidationContext
): ValidationResult {
  const rawFrom = String(input.fromPath ?? "").trim();
  const rawTo = String(input.toPath ?? "").trim();

  if (rawFrom === "") return { ok: false, code: "from-empty" };
  if (rawTo === "") return { ok: false, code: "to-empty" };
  if (isAbsolute(rawFrom) || isAbsolute(rawTo)) return { ok: false, code: "absolute" };
  if (!rawFrom.startsWith("/")) return { ok: false, code: "from-slash" };
  if (!rawTo.startsWith("/")) return { ok: false, code: "to-slash" };
  if (/\s/.test(rawFrom) || /\s/.test(rawTo)) return { ok: false, code: "space" };
  if (rawFrom.length > MAX_REDIRECT_PATH || rawTo.length > MAX_REDIRECT_PATH) {
    return { ok: false, code: "too-long" };
  }

  const note = input.note === null ? null : String(input.note).trim();
  if (note !== null && note.length > MAX_REDIRECT_NOTE) return { ok: false, code: "note-long" };

  const statusCode = Number(input.statusCode);
  if (!(REDIRECT_STATUS_CODES as readonly number[]).includes(statusCode)) {
    return { ok: false, code: "status" };
  }

  const fromPath = normalizeRedirectPath(rawFrom);
  const target = splitTarget(rawTo);
  if (fromPath === "") return { ok: false, code: "from-empty" };
  if (target.pathname === "") return { ok: false, code: "to-empty" };

  const fromKey = fromPath.toLowerCase();
  const toKey = target.pathname.toLowerCase();

  // (١) حلقة مباشرة — تُفحص على المسار وحده: `/a` ⇒ `/a?x=1` حلقة أيضاً
  if (fromKey === toKey) return { ok: false, code: "loop" };

  // (٢) تكرار المسار القديم — القيد الفريد في القاعدة يمنعه، ونشرحه هنا بالعربية
  if (ctx.existing.some((r) => redirectKey(r.fromPath) === fromKey)) {
    return { ok: false, code: "duplicate" };
  }

  // (٣) اصطدام بمسار حيّ في الموقع
  if (isLiveSitePath(fromPath, ctx.pagePaths)) return { ok: false, code: "exists" };

  // (٤) سلسلة دائرية — تُفحص فعلياً بالمشي على الرسم البياني
  if (input.enabled) {
    const enabled = ctx.existing.filter((r) => r.enabled);
    if (closesCycle(toKey, fromKey, enabled)) return { ok: false, code: "cycle" };
  }

  const toPath = `${target.pathname}${target.search}`;
  return {
    ok: true,
    value: {
      fromPath,
      toPath,
      statusCode: statusCode as RedirectStatus,
      enabled: input.enabled,
      note: note === "" ? null : note,
    },
  };
}

/**
 * تفعيل قاعدة معطّلة قد يُغلق حلقة لم تكن قائمة وقت الحفظ — تُفحص هنا مستقلة.
 * (الإطفاء لا يحتاج فحصاً: إزالة حافة لا تصنع حلقة.)
 */
export function validateEnable(
  rule: RedirectRecord,
  others: RedirectRecord[]
): ValidationResult {
  const target = splitTarget(rule.toPath);
  const fromKey = redirectKey(rule.fromPath);
  const toKey = target.pathname.toLowerCase();

  if (fromKey === toKey) return { ok: false, code: "loop" };
  if (closesCycle(toKey, fromKey, others.filter((r) => r.enabled))) {
    return { ok: false, code: "cycle" };
  }

  return {
    ok: true,
    value: {
      fromPath: rule.fromPath,
      toPath: rule.toPath,
      statusCode: rule.statusCode,
      enabled: true,
      note: rule.note,
    },
  };
}
