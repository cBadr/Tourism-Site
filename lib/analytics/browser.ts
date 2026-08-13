import type { FunnelEvent, FunnelPayload } from "@/lib/analytics-types";
import { providerEventNames } from "@/lib/analytics/events";

/**
 * القناة المتصفحية لأحداث القمع — الطرف الذي كان ناقصاً في المرحلة ١٠.
 *
 * ── لماذا وُجد هذا الملف ────────────────────────────────────────────────────
 * `lib/analytics/events.ts` يحمل عمودَي أسماء لكل مزوّد، وشاشة `/admin/integrations`
 * تعرضهما في جدول «أحداث التحويل». لكن العمود `ga4` **لم يكن يُقرأ في أي مسار
 * تشغيل**: `lib/analytics/tags.tsx` يحقن `gtag('config')` و`fbq('track','PageView')`
 * وحدهما، ولم يكن في المستودع كله مكوّن عميل واحد يُطلق حدثاً. فحجز تجريبي كامل
 * كان يُنتج في GA4 **مشاهدات صفحات فقط**: صفر `search` وصفر `view_item_list`
 * وصفر `begin_checkout` — بينما اللوحة تَعِد المالك بها بالاسم. هذا هو النمط ٢
 * في `handover/LESSONS.md` («واجهة تَعِد بما لا ينفّذه الكود»).
 *
 * ── ثلاث قواعد تحكم كل سطر هنا ──────────────────────────────────────────────
 *
 * (١) **صفر PII — نفس أعمدة `funnel_events` حرفياً ولا حرف زيادة.** الحمولة
 *     المسموحة أربعة حقول: المرجع والقيمة والعملة وفئة السيارة. و`originLabel`
 *     و`destLabel` **محذوفان عمداً** رغم وجودهما في `FunnelPayload`: عنوان
 *     الالتقاط كثيراً ما يكون بيت العميل، وقد استُبعدا من الجدول للسبب نفسه.
 *     الحمولة تُبنى حقلاً حقلاً ولا تُنسخ ولا تُنشر (`...payload`) أبداً.
 *
 * (٢) **لا يكسر الصفحة بحال.** كل شيء داخل `try/catch`، ولا يُطلق شيئاً إن لم
 *     يكن الوسم محقوناً أصلاً (خدمة مطفأة، أو مانع إعلانات أسقط السكربت).
 *     القياس طرفٌ ثالث، والحجز لا ينتظره ولا يفشل بفشله.
 *
 * (٣) **القمع في اللوحة لا يمر من هنا إطلاقاً** (القرار ٥ في موجز المرحلة).
 *     أرقام `/admin/stats` تأتي من `funnel_events` في قاعدتنا التي يكتبها
 *     `lib/analytics/emit.ts` من الخادم. ما يقع هنا **إضافة** لجوجل وميتا،
 *     ومانع إعلانات يُسقطها كلها بلا أن يتغيّر رقم واحد في اللوحة.
 *
 * ── ما لا يُطلق من هنا ──────────────────────────────────────────────────────
 * `booking_paid` (الشراء). سببان قاطعان: أن المسار الافتراضي في هذه المنصة
 * تحويل بنكي يعتمده التشغيل من اللوحة — فلا لحظة متصفح للعميل أصلاً؛ وأن
 * الصفحة الوحيدة التي يعود إليها من البوابة تُفتح مرة أو عشراً فيتضاعف الشراء
 * مع كل تحديث. الشراء يُرسل من الخادم عند تأكيد التحصيل عبر Meta CAPI
 * (`lib/analytics/emit.ts`) وهو المسار الذي لا يُسقطه مانع إعلانات ولا يتكرر.
 * وجدول الشاشة يقول ذلك بنصّه لكل حدث على حدة.
 */

type TagFn = (...args: unknown[]) => void;

declare global {
  interface Window {
    gtag?: TagFn;
    fbq?: TagFn;
    dataLayer?: unknown[];
  }
}

const text = (value: unknown): string | null =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : null;

const num = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;

/** الحقول الأربعة المسموح بها — ولا شيء غيرها يغادر المتصفح */
type SafeFacts = {
  reference: string | null;
  value: number | null;
  currency: string | null;
  classSlug: string | null;
};

function safeFacts(payload: FunnelPayload): SafeFacts {
  return {
    reference: text(payload.reference),
    value: num(payload.value),
    currency: text(payload.currency),
    classSlug: text(payload.classSlug),
  };
}

/**
 * يُطلق الحدث لدى كل مزوّد **محقون فعلاً** في هذه الصفحة.
 *
 * GA4 يُفضَّل عبر `window.gtag` حين يكون محقوناً مباشرة؛ فإن غاب ووُجد
 * `dataLayer` (إعداد «مدير الوسوم وحده») يُدفع الحدث إلى الطبقة ليلتقطه مشغّل
 * داخل الحاوية. ولا يُفعل الاثنان معاً: ذلك يحسب الحدث مرتين على من فعّل GA4
 * ومدير الوسوم معاً — وهو بالضبط ما تحذّر منه بطاقة `/admin/integrations`.
 *
 * وميتا تأخذ `eventID = رقم الحجز المرجعي` كي تُزيل التكرار بين حدث المتصفح
 * وحدث الخادم (CAPI) بدل أن تحسبهما عمليتين.
 */
export function trackBrowserFunnel(event: FunnelEvent, payload: FunnelPayload = {}): void {
  if (typeof window === "undefined") return;

  try {
    const names = providerEventNames(event);
    const facts = safeFacts(payload);

    const params: Record<string, string | number> = {
      ...(facts.value !== null ? { value: facts.value } : {}),
      ...(facts.currency !== null ? { currency: facts.currency } : {}),
      ...(facts.classSlug !== null ? { item_category: facts.classSlug } : {}),
      ...(facts.reference !== null ? { transaction_id: facts.reference } : {}),
    };

    if (typeof window.gtag === "function") {
      window.gtag("event", names.ga4, params);
    } else if (Array.isArray(window.dataLayer)) {
      window.dataLayer.push({ event: names.ga4, ...params });
    }

    if (typeof window.fbq === "function") {
      const metaParams: Record<string, string | number> = {
        ...(facts.value !== null ? { value: facts.value } : {}),
        ...(facts.currency !== null ? { currency: facts.currency } : {}),
        ...(facts.classSlug !== null ? { content_category: facts.classSlug } : {}),
      };

      if (facts.reference !== null) {
        window.fbq("track", names.meta, metaParams, { eventID: facts.reference });
      } else {
        window.fbq("track", names.meta, metaParams);
      }
    }
  } catch {
    // القياس لا يكسر صفحة الزائر بحال — ولا سجل هنا: مانع الإعلانات حالة عادية
  }
}
