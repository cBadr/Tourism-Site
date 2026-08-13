import { DEFAULT_LOCALE } from "@/lib/i18n-types";
import { formatDateLabel, formatDateTimeLabel } from "../format";

/**
 * تواريخ الحجز: بناء ISO من حقلي التاريخ والوقت، وعرضه بتوقيت القاهرة.
 *
 * منذ المرحلة ٨ صار **بناء نص التاريخ** في `components/booking/format.ts` مع بقية
 * التنسيق (أرقام، مبالغ، مسافات) حتى تخرج كل الأرقام المرئية من مُنسّق واحد
 * يعرف لغة الزائر. ما بقي هنا: تحويل حقول النموذج، ومرادفان عربيان يحفظان
 * توافق المستدعين القدامى (صفحة متابعة الحجز ولوحة التحكم — عربيتان بالتعريف).
 */

/** تاريخ كامل بلغة العرض — الأحد ١٤ سبتمبر ٢٠٢٦ */
export function formatDate(
  value: string | null | undefined,
  locale: string = DEFAULT_LOCALE
): string | null {
  return formatDateLabel(value, locale);
}

/** تاريخ ووقت بلغة العرض — الأحد ١٤ سبتمبر ٢٠٢٦ — ٣:٣٠ م */
export function formatDateTime(
  value: string | null | undefined,
  locale: string = DEFAULT_LOCALE
): string | null {
  return formatDateTimeLabel(value, locale);
}

/** مرادف عربي صريح — يبقى لتوافق المستدعين القدامى */
export function formatArabicDate(value: string | null | undefined): string | null {
  return formatDateLabel(value, "ar");
}

/** مرادف عربي صريح — يبقى لتوافق المستدعين القدامى */
export function formatArabicDateTime(value: string | null | undefined): string | null {
  return formatDateTimeLabel(value, "ar");
}

/**
 * يبني ISO من حقلي <input type="date"> و<input type="time"> بتوقيت جهاز الزائر.
 * يرجع null إن كان أحد الحقلين ناقصاً أو التاريخ غير صالح.
 */
export function toIsoFromLocalInputs(date: string, time: string): string | null {
  if (!date || !time) return null;
  const parsed = new Date(`${date}T${time}`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

/** تاريخ اليوم بصيغة yyyy-mm-dd بتوقيت الجهاز — لخاصية min في حقل التاريخ */
export function todayInputValue(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}
