/**
 * خانق التحقق من رموز الكوبونات — بنافذة دقيقة واحدة.
 *
 * القرار ٧ في موجز المرحلة والقاعدة (٦) في العقد الأم: **رمز الكوبون ليس سرّاً،
 * لكنه ليس مباحاً للتخمين.** مسار التحقق عام يقبل مدخلاً من المتصفح، وبلا حدّ
 * معدّل تُجرَّب آلاف الرموز في الدقيقة حتى يُصاب رمز صالح.
 *
 * ── حدود هذه الآلية، مكتوبة صراحةً ────────────────────────────────────────
 * خريطة في ذاكرة النسخة الواحدة — تُصفَّر مع كل نشر أو تجميد، ولا تُشارك بين
 * نسخ الخادم (على Vercel لكل نسخة خانقها). هذا يصدّ السكربت الساذج والنموذج
 * المكرر؛ والحماية الجادة من الإغراق الموزَّع تحتاج طبقة أمام التطبيق.
 * نفس التقييد المكتوب حرفياً في `app/api/quote-request/route.ts` — وهو أمانة
 * لا اعتذار: النص الذي يدّعي إنفاذاً أقوى مما ينفّذ عيبُ مراجعة في هذا المستودع
 * (النمط ٢ في `handover/LESSONS.md`).
 *
 * ⚠ وحدٌّ ثانٍ مكتوب بصدق: **لا دلو على الرمز نفسه**، بل على العنوان وحده.
 * السبب أن رمز الحملة يُنشر في بانر لكل الزوار، فدلوٌ على الرمز كان سيخنق
 * حملةً ناجحة عالمياً بدل أن يخنق مخمّناً. ومن يخمّن يجرّب **رموزاً مختلفة** لا
 * رمزاً واحداً، فدلو الرمز لا يمسّه أصلاً. الحدّ الفعلي إذن هو دلو العنوان،
 * ومداه ما دام العنوان صادقاً — انظر `clientIp` أدناه.
 */

/** طول النافذة — دقيقة واحدة، لأن العقد يقول `verifyRateLimitPerMinute` */
const WINDOW_MS = 60 * 1000;

/** سقف حجم الخريطة قبل كنسة شاملة — حارس ذاكرة لا سياسة أمان */
const SWEEP_AT = 5000;

/** مفتاح الدلو ← طوابع الطلبات داخل النافذة */
const hits = new Map<string, number[]>();

export type RateVerdict = { ok: true } | { ok: false; retryAfterSec: number };

/**
 * عنوان الزائر — **من ترويسة تضعها المنصة لا من ترويسة يكتبها العميل.**
 *
 * ⚠ الفخّ الذي كان هنا: أخذ **أول** عنوان في `x-forwarded-for`. تلك القائمة
 * يستطيع العميل أن يبدأها بما يشاء، والوسيط يُلحق عنوانه الحقيقي في آخرها لا في
 * أولها. فطلبٌ يحمل `x-forwarded-for: 9.9.9.<n>` كان ينتج **مفتاح دلوٍ جديداً في
 * كل مرة** — أي خانقاً يُدار بتدوير ترويسة، والقرار ٧ مبنيّ عليه.
 *
 * الترتيب هنا من الأوثق إلى الأضعف:
 *   ١. `x-vercel-forwarded-for` — تضعها منصة Vercel ولا تمر من العميل.
 *   ٢. `x-real-ip` — يضعها الوسيط (Vercel وnginx) بعنوان واحد لا قائمة.
 *   ٣. **آخر** عنصر في `x-forwarded-for` — هو ما أضافه أقرب وسيط موثوق، وما
 *      قبله قد يكون مُلفَّقاً كله.
 *   ٤. `"unknown"` — دلو مشترك عند التشغيل المحلي أو غياب الترويسات.
 *
 * وحدود الآلية كما هي أعلاه: خانق بأفضل جهد لكل نسخة، لا حارس هوية ولا صدّ
 * لإغراق موزَّع من آلاف العناوين الحقيقية.
 */
export function clientIp(request: Request): string {
  const platform =
    request.headers.get("x-vercel-forwarded-for")?.trim() ||
    request.headers.get("x-real-ip")?.trim();
  if (platform) return platform.slice(0, 64);

  const chain = request.headers.get("x-forwarded-for");
  if (chain) {
    const parts = chain.split(",");
    const last = parts[parts.length - 1]?.trim();
    if (last) return last.slice(0, 64);
  }

  return "unknown";
}

/**
 * يسجّل محاولة ويقرّر قبولها — `limit` طلباً في الدقيقة لكل `bucket`.
 *
 * `limit <= 0` يعني منعاً كاملاً (لا «بلا حد»): مالك يكتب صفراً في الإعداد
 * يقصد الإغلاق، والتفسير المعاكس يحوّل خطأً مطبعياً إلى مسار مفتوح على مصراعيه
 * — «الافتراضي هو ما سيعمل في الإنتاج» (النمط ٧ في `handover/LESSONS.md`).
 */
export function checkPerMinute(bucket: string, limit: number): RateVerdict {
  const now = Date.now();
  const cutoff = now - WINDOW_MS;

  if (hits.size > SWEEP_AT) {
    for (const [key, stamps] of hits) {
      const alive = stamps.filter((stamp) => stamp > cutoff);
      if (alive.length === 0) hits.delete(key);
      else hits.set(key, alive);
    }
  }

  const recent = (hits.get(bucket) ?? []).filter((stamp) => stamp > cutoff);

  const cap = Number.isFinite(limit) ? Math.floor(limit) : 0;
  if (cap <= 0 || recent.length >= cap) {
    hits.set(bucket, recent);
    const oldest = recent[0] ?? now;
    return {
      ok: false,
      retryAfterSec: Math.max(1, Math.ceil((oldest + WINDOW_MS - now) / 1000)),
    };
  }

  recent.push(now);
  hits.set(bucket, recent);
  return { ok: true };
}
