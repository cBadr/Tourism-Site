import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { DRIVER_DOCS_BUCKET } from "@/lib/driver-docs-types";

/**
 * عاملُ كنس مستندات السائقين — تنفيذُ «خمس سنوات ثم تُحذف».
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  🔴 مهلةُ حفظٍ بلا وظيفةِ حذفٍ كذبة — وهذه هي الوظيفة
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * الاتفاقية المنشورة (‏`0113`) تَعِد الشريكَ بأن صور سائقيه ورخصهم «تُحذف» بعد
 * خمس سنوات من انتهاء العلاقة. ووعدٌ كهذا بلا عاملٍ يُنفّذه هو **نصٌّ قانوني
 * يخالفه النظام**، لا سهوٌ هندسي.
 *
 * ── الترتيب هو الضمانة، لا النية ─────────────────────────────────────────
 *
 *   ١) تُقرأ المسارات المستحقة **من `storage.objects` نفسه** (لا من أعمدتنا).
 *   ٢) **تُحذف الملفات أولاً** من الدلو.
 *   ٣) ثم يُمحى المسار من صفّ السائق.
 *
 * ولو عُكس الترتيب لَترك أولُ انقطاعٍ **ملفاً في الدلو لا يشير إليه شيء** —
 * وهو بعينه شكل الفشل الذي يجعل «حُذفت» ادّعاءً: صفٌّ نظيف وملفٌّ باقٍ. أما
 * بهذا الترتيب فالانقطاع يترك صفّاً يشير إلى ملفٍّ ذهب، **وتُصلحه الدورة
 * التالية** لأن الاستعلام يقرأ الدلو: ما ليس فيه ليس مستحقاً.
 *
 * ── وإعادةُ التشغيل بلا ضرر شرطٌ لا ميزة ─────────────────────────────────
 *
 * الدورةُ تعمل كل خمس دقائق (‏`/api/dispatch/tick`)، فقد تتراكب. و`remove` على
 * ملفٍّ غير موجود لا يفشل، و`mark_driver_documents_purged` تُصفّر ما هو مُصفَّر
 * سلفاً. فتشغيلان متزامنان يُنتجان نفس الحالة النهائية.
 *
 * ── ولماذا لا مسار HTTP جديد ولا سرٌّ ثانٍ ───────────────────────────────
 *
 * نفس حجة الدفعة ٢ حين عُلّق كنسُ الطلبات غير المدفوعة على هذه الدورة: «هذه هي
 * المهمة المجدولة الوحيدة المضمونة على كل نسخة … وإضافة مسار ثانٍ تعني سرّاً
 * ثانياً وجدولة ثانية تُنسى». والحملُ صفرٌ في الحالة العادية: استعلامٌ واحد
 * يُرجع صفر صفوف ما دام لا شريكَ انتهت علاقتُه منذ خمس سنوات.
 *
 * 🔒 **وهذا هو المسار الوحيد في المشروع الذي يلمس هذه الملفات بمفتاح الخدمة** —
 * لأنه يحذف ملفات شركاء لا جلسة لهم. وكلُّ مسار قراءةٍ أو رفع يعمل بجلسة
 * صاحبه، فالسياسة تبقى هي الحارس (‏`lib/drivers/documents.ts`).
 */

export type DriverPurgeSummary = {
  ok: boolean;
  /** كم مساراً وجدته الدورة مستحقاً */
  due: number;
  /** كم ملفاً غادر الدلو فعلاً */
  deleted: number;
  /** كم صفَّ سائقٍ مُسح مساره بعد ذهاب ملفه */
  cleared: number;
  /** سببُ عدم العمل — يظهر في رد المهمة المجدولة كي يقرأه المالك */
  reason?: string;
};

const EMPTY: DriverPurgeSummary = { ok: false, due: 0, deleted: 0, cleared: 0 };

/** سقفُ الدفعة الواحدة — يمنع دورةً تحذف آلاف الملفات فتتجاوز ميزانيتها */
const BATCH = 100;

type DueRow = { path?: unknown; driver_id?: unknown; reason?: unknown };

export async function runDriverDocumentPurge(
  service: SupabaseClient | null
): Promise<DriverPurgeSummary> {
  if (!service) return { ...EMPTY, reason: "no-service-client" };

  const due = await service.rpc("driver_documents_due_for_purge", { p_limit: BATCH });
  if (due.error) {
    // الهجرة 0120 غير مطبَّقة ⇒ لا كنس، ولا يُقرأ ذلك «صفر مستحق»
    const code = (due.error as { code?: string }).code;
    return { ...EMPTY, reason: code === "42883" ? "no-function" : "rpc-failed" };
  }

  const rows = (Array.isArray(due.data) ? due.data : []) as DueRow[];
  const paths = rows
    .map((row) => (typeof row.path === "string" ? row.path : null))
    .filter((p): p is string => Boolean(p));

  if (paths.length === 0) return { ok: true, due: 0, deleted: 0, cleared: 0 };

  // (٢) الملفات أولاً — والفشل هنا يوقف كل شيء بعده عمداً: لا يُمحى مسارٌ لملفٍّ
  //     لم يُثبت ذهابه، وإلا صار ملفاً بلا مالكٍ يشير إليه.
  let deleted = 0;
  try {
    const removed = await service.storage.from(DRIVER_DOCS_BUCKET).remove(paths);
    if (removed.error) return { ...EMPTY, due: paths.length, reason: "storage-remove-failed" };
    deleted = removed.data?.length ?? paths.length;
  } catch {
    return { ...EMPTY, due: paths.length, reason: "storage-remove-failed" };
  }

  // (٣) ثم الدفتر — وفشلُه لا يترك ملفاً وراءه، فالدورة التالية تُعيد المحاولة
  const marked = await service.rpc("mark_driver_documents_purged", { p_paths: paths });
  const cleared = typeof marked.data === "number" ? marked.data : 0;

  return {
    ok: !marked.error,
    due: paths.length,
    deleted,
    cleared,
    ...(marked.error ? { reason: "mark-failed" } : {}),
  };
}
