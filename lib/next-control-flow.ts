/**
 * أخطاء Next التي ليست أخطاءً — بل **إشارات تحكّم** يجب أن تمرّ.
 *
 * ── العيب الذي وُلد هذا الملف منه (تحقق حي 2026-08-14) ──────────────────────
 *
 * أول تشغيل للمشروع في وضع الإنتاج على خادم حقيقي أعطى **٥٠٠** على
 * `/services/[slug]` و`/routes/[slug]` — وهما صفحتا السيو، أي المنتج نفسه في
 * رؤية المشروع. والباقي كله سليم. والسبب سطر `catch` واحد.
 *
 * حين تُستدعى `headers()` أو `cookies()` أثناء **تصيير ثابت**، لا يرمي Next خطأً
 * ليُعالَج — يرمي إشارة بـ `digest = 'DYNAMIC_SERVER_USAGE'` معناها: «هذه الصفحة
 * لا يمكن أن تكون ثابتة، أعِد تصنيفها ديناميكية». فمن يبتلعها بـ `catch` يقول
 * لـ Next: «كل شيء بخير» — فتُصنَّف الصفحة **ثابتة** وهي ليست كذلك، ثم تنفجر عند
 * أول طلب حقيقي.
 *
 * ولم يظهر قط في التطوير: `next dev` يصيّر كل شيء عند الطلب فلا إشارة أصلاً.
 * ولا في `pnpm build`: البناء نجح لأن الابتلاع أخفى الإشارة عنه. ولا في
 * `pnpm db:test`. **ثلاث بوابات خضراء وصفحةٌ ساقطة** — ولم يكن ليُكتشف إلا
 * بتشغيل إنتاجي فعلي، وهو ما لم يقع قبل اليوم (D-35).
 *
 * ── القاعدة ─────────────────────────────────────────────────────────────────
 *
 * أي `catch` يحيط بنداء قد يلمس `headers()` أو `cookies()` أو `redirect()` أو
 * `notFound()` **يجب** أن يبدأ بـ `rethrowControlFlow(err)`. التدهور الرشيق
 * مقصودٌ للأعطال الحقيقية (قاعدة غائبة، مفتاح ناقص) — لا لإشارات الإطار.
 */

/** الرموز التي يستعملها Next للتحكّم لا للإبلاغ عن عطل */
const CONTROL_FLOW_DIGESTS = new Set([
  // `headers()` / `cookies()` داخل تصيير ثابت ⇒ «صنّفني ديناميكية»
  "DYNAMIC_SERVER_USAGE",
  // مكوّن رفض التصيير على الخادم ⇒ «أكمل على العميل»
  "BAILOUT_TO_CLIENT_SIDE_RENDERING",
]);

/** البادئات — رموز `redirect()` و`notFound()` تحمل حمولة بعد الفاصلة */
const CONTROL_FLOW_PREFIXES = ["NEXT_REDIRECT", "NEXT_HTTP_ERROR_FALLBACK", "NEXT_NOT_FOUND"];

/** هل هذا استثناء تحكّم من Next لا عطلاً؟ */
export function isControlFlowError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const digest = (error as { digest?: unknown }).digest;
  if (typeof digest !== "string") return false;
  if (CONTROL_FLOW_DIGESTS.has(digest)) return true;
  return CONTROL_FLOW_PREFIXES.some((prefix) => digest.startsWith(prefix));
}

/**
 * تُعيد الرمي إن كان استثناءَ تحكّم، وتصمت فيما عداه.
 *
 * تُستدعى **أول سطر** في كل `catch` يحيط بنداء قد يلمس واجهات الطلب:
 *
 * ```ts
 * try {
 *   const locale = await getActiveLocale();
 * } catch (err) {
 *   rethrowControlFlow(err);   // ← الإشارة تمرّ، والعطل الحقيقي يُبتلع
 *   return DEFAULT_LOCALE;
 * }
 * ```
 */
export function rethrowControlFlow(error: unknown): void {
  if (isControlFlowError(error)) throw error;
}
