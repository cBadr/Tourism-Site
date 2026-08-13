import "server-only";

import { after } from "next/server";

/**
 * تشغيل عمل جانبي (كتابة كاش) **بعد** إرسال الاستجابة.
 *
 * لماذا لا يكفي إهمال الوعد (fire-and-forget)؟ على المنصات بلا خادم (Vercel)
 * يُجمَّد تنفيذ الدالة بمجرد انتهاء الاستجابة، فالوعد المعلَّق قد لا يكتمل أبداً
 * ويبقى جدول الكاش فارغاً مهما تكرر البحث. دالة after في Next تُبقي الطلب حياً
 * حتى ينتهي العمل، دون أن تؤخر رد العميل.
 *
 * خارج سياق الطلب (سكربت، اختبار، استدعاء مباشر) ترمي after فوراً — عندها
 * ننفّذ العمل مباشرة بلا انتظار. الفشل يُبتلع دائماً: تعطُّل الكاش لا يعطل بحثاً.
 */
export function afterResponse(work: () => PromiseLike<unknown>): void {
  // Promise.resolve يحوّل مُنشئ استعلام Supabase (thenable) إلى وعد حقيقي
  // كما تشترط after، ويضمن أن أي رمية متزامنة تتحول إلى رفض مُبتلَع
  const run = (): Promise<void> =>
    Promise.resolve()
      .then(work)
      .then(
        () => undefined,
        () => undefined
      );

  try {
    after(run);
  } catch {
    void run();
  }
}
