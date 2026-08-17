import type { NextRequest } from "next/server";

import type { ResolveResponse } from "@/lib/place-search-types";
import { resolveSuggestion } from "@/lib/geo/search";
import { checkPerMinute, clientIp } from "@/lib/discounts/rate-limit";

/**
 * POST /api/geocode/resolve — اقتراحُ جوجل ← مكانٌ بإحداثيات.
 *
 * 🔴 **وهذا النداء هو ما يُنهي جلسة فوترة جوجل.** يصل ومعه رمزُ الجلسة نفسه
 * الذي رافق نداءات الاقتراح، فتُغلق الجلسة وتُحتسب **وحدةً واحدة** مهما كان
 * عدد الحروف التي كتبها العميل. والتفصيل الكامل في ترويسة
 * `lib/place-search-types.ts`.
 *
 * ولا يمرّ منه اقتراح Nominatim: يحمل إحداثياته معه، فاختياره لا يلمس الشبكة.
 *
 * 🔒 والحارس في `resolveSuggestion` لا هنا: مفتاح القطع مطفأ ⇒ `not-found`،
 * حتى لا يُنفق طلبٌ مصنوع نداءَ تفاصيلَ مدفوعاً والمالك أطفأ جوجل.
 */

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * 🔴 **أضيق سقفٍ في الثلاثة — وعن قصد: هذا أغلى نداء في المحرّك كله.**
 *
 * `places/{id}` بقناع `displayName,formattedAddress,location` يقع في فئة
 * **Place Details** المدفوعة، **ولا يُكاش ولا سطر** (ترخيص جوجل — انظر ترويسة
 * `lib/geo/places-google.ts`). فكل نداء هنا نقدٌ يخرج، بلا أي إصابة كاش تخفّفه،
 * و`ref` يصل من المتصفح — فمن يعرف `placeId` واحداً صحيحاً يستطيع أن يكرّره
 * إلى ما لا نهاية.
 *
 * والسقف مشتقٌّ من سلوك إنسان لا من رقمٍ مريح: العميل **يحوّل مكاناً واحداً
 * لكل حقل** بعد أن يختاره — حقلان في النموذج، وبضع محاولات لو غيّر رأيه.
 * فعشرة في الدقيقة سخيٌّ لأشدّ المترددين، وقاتلٌ لأي حلقة.
 */
const MAX_PER_MINUTE = 10;

export async function POST(request: NextRequest) {
  const rate = checkPerMinute(`geo:resolve:${clientIp(request)}`, MAX_PER_MINUTE);
  if (!rate.ok) {
    return Response.json(
      { ok: false, code: "unavailable" } satisfies ResolveResponse,
      { status: 429, headers: { ...NO_STORE, "Retry-After": String(rate.retryAfterSec) } }
    );
  }

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

  const { ref, provider, sessionToken, locale } = body as Record<string, unknown>;

  if (typeof ref !== "string" || ref.length === 0 || ref.length > 300) {
    return json({ ok: false, code: "invalid-input" }, 400);
  }
  if (provider !== "google" && provider !== "nominatim") {
    return json({ ok: false, code: "invalid-input" }, 400);
  }

  const place = await resolveSuggestion({
    ref,
    provider,
    sessionToken: typeof sessionToken === "string" ? sessionToken : undefined,
    locale: typeof locale === "string" ? locale : undefined,
  });

  // 🔒 بلا إحداثيات لا مكان — ولا يُسعَّر نصٌّ لم يُحلّ (D-09). والواجهة تُخرج
  //    العميل إلى الخريطة عند هذا الرمز، فلا يقف أمام سطرٍ لا يُختار.
  if (!place) return json({ ok: false, code: "not-found" }, 404);

  return json({ ok: true, place, provider }, 200);
}

function json(payload: ResolveResponse, status: number) {
  return Response.json(payload, { status, headers: NO_STORE });
}
