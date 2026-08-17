import type { NextRequest } from "next/server";

import type { SuggestResponse } from "@/lib/place-search-types";
import { suggestPlaces } from "@/lib/geo/search";
import { checkPerMinute, clientIp } from "@/lib/discounts/rate-limit";

/**
 * POST /api/geocode/suggest — اقتراحات الإكمال التلقائي (البحث رباعي الطبقات).
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  لماذا POST وليس GET كأخيه `/api/geocode`
 * ══════════════════════════════════════════════════════════════════════════
 *
 * سببان، وكلاهما ملزم:
 *
 * (١) 🔴 **كاش الحافة تخزينٌ كذلك.** المسار القديم يسمح بكاش CDN ليوم كامل،
 *     وهو صحيحٌ له لأنه Nominatim وحده وبياناته مفتوحة. أما نتائج جوجل فلا
 *     تُخزَّن — لا في جدول ولا على حافة (انظر ترويسة `lib/geo/places-google.ts`).
 *     و`POST` لا يُكاش في الطريق أصلاً، فالمنعُ بنيويٌّ لا اعتماداً على ترويسة
 *     قد يسقطها وسيطٌ يوماً.
 *
 * (٢) **رمز الجلسة جزءٌ من الطلب لا من هويته.** وضعُه في سلسلة الاستعلام يجعل
 *     كل جلسة عنواناً مختلفاً — أي كاشاً لا يُصيب أبداً، ورمزاً يتسرّب إلى
 *     سجلات الوصول والمُحيلات بلا داعٍ.
 *
 * 🔒 والمسار القديم `GET /api/geocode` **باقٍ كما هو بلا حرف**: يخدم بورتال
 * المتعهدين، وكاشه وسلوكه لم يُمسّا.
 *
 * والرد **رمزٌ لا جملة** (اتفاقية §٤): الواجهة تترجمه بلغة الزائر.
 */

export const runtime = "nodejs";

/** لا كاش بأي حال — لا متصفح ولا حافة ولا وسيط */
const NO_STORE = { "Cache-Control": "no-store" };

/**
 * 🔴 **سقف الطلبات في الدقيقة للعنوان الواحد — وهو ما يقف بين المالك وفاتورة
 * مفتوحة.**
 *
 * كل حراسة أخرى في هذا العمل تحمي **نموذج الفوترة** (رمز الجلسة، ‏FieldMask،
 * تحويلٌ لما اختاره العميل وحده)، ولا شيء منها يحمي **المسار نفسه**: هذا المسار
 * عامٌّ بلا هوية، و`no-store` بقرار، وكل نداء وحدةُ فوترةٍ عند جوجل حين يكون
 * مفعّلاً. فحلقةُ `curl` ساذجة تُنفق بلا حدّ، و«مفتاح القطع» علاجٌ **بعد** أن
 * يرى المالك الفاتورة لا قبلها.
 *
 * والسقف كريم بالنسبة لإنسان: الويدجت يُطلق نداءً كل ٣٥٠ مللي أثناء الكتابة
 * المتصلة، أي ~١٧٠ نظرياً في الدقيقة لو كتب أحدهم بلا توقف — والواقع أقل بكثير
 * لأن الكتابة تتقطّع. فـ٦٠ تكفي حقلين يُملآن معاً بمهلة، وتقطع الحلقة الآلية.
 *
 * ⚠ **وحدّه مكتوبٌ بصدق** (نفس أمانة ترويسة `lib/discounts/rate-limit.ts`):
 * خريطةٌ في ذاكرة النسخة الواحدة — تُصفَّر مع كل نشر، ولا تُشارك بين النسخ.
 * تصدّ السكربت الساذج لا الإغراق الموزَّع. **والحاجز الذي لا يُلتف عليه هو سقف
 * الحصّة اليومي في لوحة Google Cloud** — يُضبط هناك بيد المالك، ولا يستطيع هذا
 * الملف أن يفرضه (مذكورٌ في تقرير هذا العمل).
 */
const MAX_PER_MINUTE = 60;

export async function POST(request: NextRequest) {
  // الخانق **قبل** قراءة الجسم وقبل قراءة الإعدادات: كلاهما عملٌ لا يُنفَق على
  // طلبٍ سنرفضه، وقراءةُ الإعدادات نداءُ قاعدةٍ بمفتاح الخدمة يتضاعف مع الإغراق.
  const rate = checkPerMinute(`geo:suggest:${clientIp(request)}`, MAX_PER_MINUTE);
  if (!rate.ok) {
    return Response.json(
      { ok: false, code: "unavailable" } satisfies SuggestResponse,
      { status: 429, headers: { ...NO_STORE, "Retry-After": String(rate.retryAfterSec) } }
    );
  }

  /**
   * سقف حجم الجسم **قبل** تحليله. `request.json()` تقرأ الحمولة كاملة إلى
   * الذاكرة، وفحص `q.length > 200` أدناه يقع **بعد** أن يصير النص مقيماً فيها.
   * ومسارات App Router بلا سقفٍ افتراضي (‏`bodySizeLimit` تخصّ Server Actions)،
   * وهذا المشروع يُنشر على VPS بلا سقف المنصة (‏`docs/VPS.md`).
   */
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > 4096) {
    return json({ ok: false, code: "invalid-input" }, 413);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, code: "invalid-input" }, 400);
  }

  if (body === null || typeof body !== "object") {
    return json({ ok: false, code: "invalid-input" }, 400);
  }

  const { q, sessionToken, locale } = body as Record<string, unknown>;
  if (typeof q !== "string") return json({ ok: false, code: "invalid-input" }, 400);

  /**
   * ⚠ سقف طولٍ على النص قبل أن يغادر خادمنا: نصٌّ بطول ميغابايت يُنفق نداءً
   * على مزوّدٍ مدفوع ليعود بلا شيء. والسقف كريمٌ جداً مقارنةً بأي اسم مكان.
   */
  if (q.length > 200) return json({ ok: false, code: "invalid-input" }, 400);

  const result = await suggestPlaces({
    query: q,
    // 🔴 الرمز يُمرَّر كما وصل، و`googleAutocomplete` هي التي تفحص شكله وتُسقطه
    //    عند الفساد. والفحص هناك لا هنا لأنه **شرط جوجل** لا شرطنا.
    sessionToken: typeof sessionToken === "string" ? sessionToken : undefined,
    locale: typeof locale === "string" ? locale : undefined,
  });

  // «أقصر من الحد» ليس عطل خادم — ٤٠٠ بالرمز، والواجهة لا تصل إليه أصلاً
  // لأنها تعرف الحد نفسه من الإعدادات.
  return json(result, result.ok ? 200 : 400);
}

function json(payload: SuggestResponse, status: number) {
  return Response.json(payload, { status, headers: NO_STORE });
}
