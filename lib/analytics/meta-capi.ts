import "server-only";

import { createHash } from "node:crypto";

import type { FunnelPayload } from "@/lib/analytics-types";

/**
 * واجهة التحويلات من ميتا (Conversions API) — القناة الخادمية الوحيدة.
 *
 * لماذا خادمية أصلاً: بكسل المتصفح يسقط صامتاً مع أي مانع إعلانات أو رفض
 * كوكيز، فيختفي **الشراء** تحديداً من تقارير ميتا بينما تظل مشاهدات الصفحات
 * تصل — أسوأ تشويه ممكن لتقرير إعلاني. النداء من الخادم لا يمرّ بمتصفح الزائر.
 *
 * ── ثلاث قواعد لا تُخالف ───────────────────────────────────────────────────
 *
 * (١) **التوكن من البيئة وحدها** (`META_CAPI_ACCESS_TOKEN`)، ولا يُخزَّن في
 *     `site_settings` أبداً: ذلك الجدول مقروء علناً بسياسة
 *     `site_settings_select_public`. والوحدة تحمل `server-only` فلا تدخل حزمة
 *     المتصفح وقت البناء لا وقت التشغيل. غياب التوكن ⇒ **تخطٍّ صامت**، لا خطأ
 *     ولا سجل تحذير متكرر: هذه هي الحالة الطبيعية قبل أن يربط المالك حسابه.
 *
 * (٢) **صفر PII.** لا اسم عميل ولا هاتف ولا واتساب ولا بريد ولا IP ولا
 *     user-agent. يذهب إلى ميتا: اسم الحدث، ووقته، ومعرّف إزالة التكرار،
 *     والقيمة والعملة وفئة السيارة. ولا شيء عن المتعهد: لا هويته ولا تكلفته
 *     ولا هامش الموقع (القاعدة الثالثة في `lib/analytics-types.ts`).
 *
 *     ميتا تشترط عنصراً واحداً على الأقل في `user_data` وإلا رفضت الحدث. نُرسل
 *     `external_id` = بصمة SHA-256 لرقم الحجز المرجعي (`TR-XXXXXX`) — وهو
 *     معرّف داخلي غير شخصي أصلاً، ومُبصَّم فوق ذلك. لا يعرّف شخصاً ولا يُربط
 *     بأحد خارج المنصة، ويكفي ميتا لقبول الحدث.
 *
 * (٣) **لا تُفشل شيئاً.** كل مسار خطأ يرجع رمزاً ولا يرمي: هذه الدالة تُستدعى
 *     على مسار تأكيد دفعة وصلت فعلاً. فشل نداء إعلاني لا يجوز أن يقلب ٢٠٠ إلى
 *     ٥٠٠ فيعيد المزوّد إرسال الويبهوك إلى الأبد.
 *
 * إزالة التكرار مع البكسل: `event_id` = رقم الحجز المرجعي. لو أُطلق `Purchase`
 * من المتصفح لاحقاً بنفس المعرّف عدّته ميتا حدثاً واحداً لا اثنين.
 */

/** إصدار Graph API — يُرفع يدوياً عند الترقية، ولا يُقرأ من البيئة */
const GRAPH_VERSION = "v21.0";

/** مهلة قصيرة: هذا نداء تحسيني، وانتظاره لا يستحق تعليق مهمة خلفية */
const TIMEOUT_MS = 3500;

export type MetaCapiResult = "sent" | "skipped" | "failed";

/** هل ضُبط التوكن في بيئة الخادم؟ — الشاشة تعرض الحالة ولا تعرض القيمة */
export function metaCapiTokenPresent(): boolean {
  const token = process.env.META_CAPI_ACCESS_TOKEN;
  return typeof token === "string" && token.trim() !== "";
}

/** اسم متغيّر البيئة — تعرضه الشاشة نصاً حتى لا يُكتب في مكانين */
export const META_CAPI_TOKEN_ENV = "META_CAPI_ACCESS_TOKEN";
export const META_CAPI_TEST_CODE_ENV = "META_CAPI_TEST_EVENT_CODE";

function sha256(value: string): string {
  return createHash("sha256").update(value.trim().toLowerCase(), "utf8").digest("hex");
}

/**
 * 🔒 `custom_data` تُبنى حقلاً حقلاً لا بنسخ الحمولة.
 *
 * نفس مبدأ `redactPricing` في `/api/quote`: لو أضاف العقد حقلاً حساساً غداً
 * فلن يتسرّب من هنا، لأن ما لا يُكتب صراحةً لا يُرسل. ولذلك لا تظهر هنا
 * `originLabel` ولا `destLabel`: هما عنوانا التقاط وتسليم وقد يكونان عنوان
 * منزل، فلا يغادران خادمنا مهما كان العقد يسمح بحملهما داخلياً.
 */
function buildCustomData(payload: FunnelPayload): Record<string, unknown> {
  const custom: Record<string, unknown> = {};

  if (typeof payload.value === "number" && Number.isFinite(payload.value)) {
    custom.value = payload.value;
  }
  if (typeof payload.currency === "string" && payload.currency.trim() !== "") {
    custom.currency = payload.currency.trim().toUpperCase();
  }
  if (typeof payload.classSlug === "string" && payload.classSlug.trim() !== "") {
    custom.content_category = payload.classSlug.trim();
    custom.content_type = "product";
    custom.content_ids = [payload.classSlug.trim()];
  }
  if (typeof payload.passengers === "number" && Number.isFinite(payload.passengers)) {
    custom.num_items = payload.passengers;
  }

  return custom;
}

export async function sendMetaCapiEvent(input: {
  /** معرّف مجموعة البيانات في ميتا — هو معرّف البكسل نفسه غالباً */
  datasetId: string;
  /** اسم الحدث القياسي بعد الترجمة (`lib/analytics/events.ts`) */
  eventName: string;
  payload: FunnelPayload;
}): Promise<MetaCapiResult> {
  const token = process.env.META_CAPI_ACCESS_TOKEN;
  if (typeof token !== "string" || token.trim() === "") return "skipped";

  const reference = typeof input.payload.reference === "string" ? input.payload.reference.trim() : "";
  if (reference === "") {
    // بلا مرجع لا `external_id` ولا `event_id` — وميتا ترفض حدثاً بلا هوية
    // مستخدم واحدة. التخطي أصدق من إرسال حدث سيُرفض ويُسجَّل خطأً كل مرة.
    return "skipped";
  }

  const testCode = process.env.META_CAPI_TEST_EVENT_CODE;

  const body: Record<string, unknown> = {
    data: [
      {
        event_name: input.eventName,
        event_time: Math.floor(Date.now() / 1000),
        // إزالة التكرار مع بكسل المتصفح إن أُطلق نفس الحدث منه
        event_id: reference,
        action_source: "website",
        user_data: { external_id: sha256(reference) },
        custom_data: buildCustomData(input.payload),
      },
    ],
    // التوكن في **جسم** الطلب لا في مسار العنوان: العناوين تُسجَّل في سجلات
    // الوسطاء وسجلات المنصة، والأجسام لا تُسجَّل.
    access_token: token,
  };
  if (typeof testCode === "string" && testCode.trim() !== "") {
    body.test_event_code = testCode.trim();
  }

  try {
    const response = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(input.datasetId)}/events`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
      }
    );

    if (!response.ok) {
      // نص الخطأ من ميتا مفيد جداً في التشخيص (رمز البكسل الخاطئ، توكن منتهٍ)
      // ولا يحمل بيانات عميل. نقصّه حتى لا يمتلئ السجل.
      const detail = await response.text().catch(() => "");
      console.warn(
        `[analytics:meta-capi] رفض ميتا الحدث (${response.status}): ${detail.slice(0, 400)}`
      );
      return "failed";
    }

    return "sent";
  } catch (err) {
    console.warn(
      `[analytics:meta-capi] تعذّر إرسال الحدث: ${err instanceof Error ? err.message : String(err)}`
    );
    return "failed";
  }
}
