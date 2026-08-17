import type { NextRequest } from "next/server";

import type { ResolveResponse } from "@/lib/place-search-types";
import { isWithinServiceArea } from "@/lib/place-search-types";
import { reverseGeocode } from "@/lib/geo/geocode";
import { readPlaceSearchSettings } from "@/lib/geo/place-search-settings";
import { checkPerMinute, clientIp } from "@/lib/discounts/rate-limit";

/**
 * POST /api/geocode/reverse — الدبوس الذي أسقطه العميل ← وسمٌ مقروء.
 *
 * 🔴 **الإحداثيات هي الناتج، والوسم زينة.** الدبوس أدقّ من أي بحث نصّي — بلا
 * أخطاء تهجئة وبلا اسمٍ لا يعرفه مزوّد — و**بلا فوترةٍ بالطلب**. فهذه أرخص
 * طبقة في المحرّك وأدقّها معاً، ولذلك تُعرض حين يعجز البحث لا بعد استنفاد
 * محاولاتٍ أخرى.
 *
 * وتُنفَّذ بـNominatim لا بجوجل بقصد: عكسيُّ OSM مجاني وبياناته مفتوحة، فلا
 * يستدعي أي سؤالٍ عن تخزين محتوى Places.
 */

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * ⚠ حدود منطقة الخدمة تُقرأ من العقد (‏`SERVICE_BOUNDS` في
 * `lib/place-search-types.ts`) لا تُكتب هنا: **الخريطة تقرأ الثابت نفسه**
 * فتمنع العميل من الخروج أصلاً، ونسختان منه تنحرفان فتسمح الخريطة بما يرفضه
 * المسار.
 *
 * وحارسٌ لا تجميل: بدونه يصير مسارنا **بروكسي جيوكودنج عكسي مفتوحاً** لأي نقطة
 * على الأرض، يستهلك حصّتنا عند Nominatim ويُعرّض هويتنا (‏`User-Agent`) للحظر.
 * وكلُّ عملنا داخل مصر أصلاً — نفس قيد `countrycodes=eg` في البحث النصّي.
 */

/**
 * 🔴 سقفٌ ضيّق — **وما يحميه هنا ليس مالاً بل هويّتنا عند Nominatim.**
 *
 * سياسة Nominatim طلبٌ واحد في الثانية، وهذا المسار — بخلاف البحث النصّي —
 * **بلا كاش وبلا مشاركة طلبات جارية** (كلاهما بقرار: مفتاح `geocode_cache` نصُّ
 * بحثٍ لا إحداثيات). فهو نداءٌ خارجيٌّ لكل طلبٍ داخل، من `User-Agent: Tours01/1.0`.
 *
 * ⚠ وحدُّ الإحداثيات في صندوق مصر يقيّد **أين** لا **كم مرة**؛ فبلا هذا السقف
 * يبقى المسار جيوكودراً عكسياً مفتوحاً لكل مصر، وحظرُ OSM لنا **يقتل معه
 * `GET /api/geocode` القديم** — أي مزوّدنا الافتراضي لكل زائر.
 *
 * والدبوس فعلُ إنسانٍ بطيء: يفتح الخريطة، ويحرّكها، ويؤكّد. عشرةٌ في الدقيقة
 * أكثر مما يفعله أشدّ المترددين.
 */
const MAX_PER_MINUTE = 10;

export async function POST(request: NextRequest) {
  const rate = checkPerMinute(`geo:reverse:${clientIp(request)}`, MAX_PER_MINUTE);
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

  const { lat, lng } = body as Record<string, unknown>;

  // ⚠ نوعٌ صريح لا `Number()` متساهلة: `Number([])` صفر و`Number(true)` واحد،
  //   وكلاهما إحداثيٌّ «صالح» شكلاً وُلد من قيمةٍ ليست رقماً أصلاً.
  if (typeof lat !== "number" || typeof lng !== "number") {
    return json({ ok: false, code: "invalid-input" }, 400);
  }
  const latitude = lat;
  const longitude = lng;

  // 🔴 رمزٌ مستقل لخارج منطقة الخدمة — **لا يُخلط بـ«تعذّرت التسمية»**.
  //    الواجهة تعامل الاثنين معاملةً مختلفة تماماً: الأول يعني «ارفض هذا
  //    الدبوس وقل له لماذا»، والثاني «اقبل الدبوس بوسمٍ من الإحداثيات».
  //    وخلطُهما كان يجعل دبوساً في روما يُقبل ويُسعَّر (انظر `place-field.tsx`).
  if (!isWithinServiceArea(latitude, longitude)) {
    return json({ ok: false, code: "out-of-area" }, 400);
  }

  // 🔒 مفتاح اللوحة يُفرض في الخادم لا بإخفاء زرّ: إطفاء المنتقي يعني أن
  //    المسار يرفض، فلا يبقى طريقٌ حوله بطلبٍ مصنوع.
  const settings = await readPlaceSearchSettings();
  if (!settings.mapPickerEnabled) return json({ ok: false, code: "not-found" }, 404);

  const place = await reverseGeocode(latitude, longitude);
  return json({ ok: true, place, provider: "nominatim" }, 200);
}

function json(payload: ResolveResponse, status: number) {
  return Response.json(payload, { status, headers: NO_STORE });
}
