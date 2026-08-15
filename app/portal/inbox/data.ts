import "server-only";

import { cache } from "react";

import type { PortalInboxItem } from "@/lib/partner-alerts-types";
import { isSchemaMissing, portalAccess } from "../_lib/session";

/**
 * قراءة صندوق البورتال (ج٣ في `docs/phase-briefs/FAILED-TRIPS-AND-PARTNER-ALERTS.md`).
 *
 * 🔒 **دالةٌ واحدة لا استعلام جدول، ولا استثناء.** `notifications` يحمل صفوفاً
 * تشغيلية فيها اسم العميل وهاتفه وإجمالي حجزه، وPostgres **لا يملك RLS على
 * مستوى العمود** — فسياسة `SELECT` واحدة كانت ستفتح الجدول كله لكل متعهد.
 * `portal_inbox()` تُرجع خمسة حقول وقائمةً بيضاء من مفاتيح الحمولة العامة،
 * فالتسريب من هنا **مستحيلٌ بنيوياً** لا مستبعَدٌ بانتباه الواجهة.
 *
 * ولا مسار بديل عند غياب الدالة: `ready = false` تعني «هجرة 0054 غير منفَّذة»،
 * والشاشة تقول ذلك بدل صندوقٍ فارغ يُقرأ «لم يصلك شيء قط».
 *
 * ⚠ **والصندوق سجلٌّ لا قناة.** هو آخر ما يُقرأ في تسلسل التنبيه لا أوله: قناةٌ
 * تستلزم أن **ينظر** صاحبها ليست بلوغاً — ولذلك `inbox` خارج `REACHING_CHANNELS`
 * في العقد بقرار، ولذلك تقول الشاشة ذلك بنصّها لا بتلميح.
 */

/**
 * `ready = false` ⇒ الدالة غير منشورة (حالة عرض تشرح الخطوة الناقصة).
 * `failed = true` ⇒ الدالة موجودة والنداء فشل — و«لا شيء وصلك» و«تعذّرت القراءة»
 * جملتان لا يجوز الخلط بينهما على شاشةٍ يقيس صاحبها بها ما فاته.
 */
export type InboxResult = {
  items: PortalInboxItem[];
  unread: number;
  ready: boolean;
  failed: boolean;
};

const EMPTY: InboxResult = { items: [], unread: 0, ready: true, failed: false };

/** سقف القراءة — الدالة نفسها تقصّه إلى ٢٠٠، وهذا سقف الشاشة */
const LIMIT = 60;

const asText = (v: unknown): string | null =>
  typeof v === "string" && v.trim() !== "" ? v.trim() : null;

const rowsOf = (data: unknown): Record<string, unknown>[] => {
  const list = Array.isArray(data) ? data : data ? [data] : [];
  return list.filter(
    (row): row is Record<string, unknown> => typeof row === "object" && row !== null
  );
};

/**
 * الأسماء تُقرأ بالاسمين معاً (snake_case وcamelCase) كبقية قراءات البورتال:
 * توقيع الدالة يملكه وكيل SQL، وPostgREST يعيدها بالشكل الذي كُتبت به.
 */
function pick(row: Record<string, unknown>, names: string[]): unknown {
  for (const name of names) {
    const value = row[name];
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

function toItem(row: Record<string, unknown>): PortalInboxItem | null {
  const id = asText(pick(row, ["id"]));
  if (!id) return null;

  const summary = pick(row, ["summary"]);
  return {
    id,
    event: asText(pick(row, ["event"])) ?? "",
    bookingReference: asText(pick(row, ["reference", "booking_reference", "bookingReference"])),
    offerId: asText(pick(row, ["offer_id", "offerId"])),
    createdAt: asText(pick(row, ["created_at", "createdAt"])) ?? "",
    readAt: asText(pick(row, ["read_at", "readAt"])),
    summary:
      typeof summary === "object" && summary !== null && !Array.isArray(summary)
        ? (summary as Record<string, unknown>)
        : {},
  };
}

/**
 * صندوق المتعهد الحالي. مُذاكَر لكل طلب: الصفحة قد تقرؤه أكثر من مرة (القائمة
 * والعدّاد) فتبقى ضربةَ قاعدةٍ واحدة.
 *
 * والحارس `portalAccess` الضيّق — `active` وحدها — لأن الصندوق **سطح تشغيلي**:
 * محتواه عروضُ رحلاتٍ وإسنادُها، وهي بالضبط ما لا يصل المدعوَّ قبل اعتماده.
 */
export const loadInbox = cache(async (): Promise<InboxResult> => {
  const access = await portalAccess();
  if (!access.ok) return { ...EMPTY, ready: access.code !== "schema" };

  const res = await access.supabase.rpc("portal_inbox", { p_limit: LIMIT });
  if (res.error) {
    const missing = isSchemaMissing(res.error);
    return { ...EMPTY, ready: !missing, failed: !missing };
  }

  const items = rowsOf(res.data)
    .map(toItem)
    .filter((item): item is PortalInboxItem => item !== null);

  return {
    items,
    unread: items.filter((item) => item.readAt === null).length,
    ready: true,
    failed: false,
  };
});

/* ------------------------------------------------------------------ */
/* قراءة الملخّص — عرضٌ محض، بلا حسابٍ ولا افتراضِ وجود مفتاح            */
/* ------------------------------------------------------------------ */

/**
 * `summary` مبنيّ بـ`jsonb_strip_nulls` في القاعدة، أي أن **المفتاح الغائب هو
 * الحالة الطبيعية** لا الاستثناء: إشعارٌ عن حجزٍ ملغى لا يحمل مستحقاً ولا مهلة.
 * فكل قارئ هنا يعيد `null` بهدوء، والشاشة تُسقط السطر بدل أن تكتب «—» في ستة
 * أسطر متتالية.
 */
export const summaryText = (summary: Record<string, unknown>, key: string): string | null => {
  const value = summary[key];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
};

export const summaryNumber = (summary: Record<string, unknown>, key: string): number | null => {
  const value = summary[key];
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
};

export const summaryBool = (summary: Record<string, unknown>, key: string): boolean => {
  const value = summary[key];
  return value === true || value === "true" || value === 1;
};
