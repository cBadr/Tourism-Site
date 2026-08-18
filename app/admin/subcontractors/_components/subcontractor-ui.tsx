import { formatDistance, toArabicDigits } from "@/components/booking/format";
import { Badge } from "@/components/ui/badge";
import {
  DEFAULT_MARGIN,
  type MarginSettings,
  type PriceListStatus,
  type SubcontractorStatus,
} from "@/lib/subcontractor-types";
import { cn } from "@/lib/utils";
import { asNumber, asText, COMMON_BOOKING_ERRORS, pick } from "../../orders/_components/booking-ui";

/**
 * لبنات مشتركة لشاشات المتعهدين الثلاث (القائمة + الملف + طابور المراجعة) —
 * بنفس إيقاع لبنات الطلبات: وسوم حالة ملوّنة، قراءة صفوف دفاعية، وصيغ جمع عربية.
 *
 * كلها مكوّنات خادمية الصلاحية (بلا "use client") فلا فرق بين الخادم والمتصفح.
 *
 * قراءة الصفوف دفاعية عمداً: جداول المرحلة ٥ يملكها وكيل SQL، فنقرأ كل حقل بأول
 * اسم موجود من أسماء محتملة بدل افتراض اسم واحد — نفس نهج شاشة تفاصيل الطلب.
 */

// ---------------------------------------------------------------------------
// حالات المتعهد وقوائم الأسعار — النصوص والألوان
// ---------------------------------------------------------------------------

export const SUBCONTRACTOR_STATUSES: SubcontractorStatus[] = [
  "pending",
  "approved",
  "suspended",
];

export const SUB_STATUS_LABELS: Record<SubcontractorStatus, string> = {
  pending: "قيد المراجعة",
  approved: "تم الاعتماد",
  suspended: "تم الإيقاف",
};

/** شرح مختصر لكل حالة — يظهر في التلميحات وعناوين التبويبات */
export const SUB_STATUS_HINTS: Record<SubcontractorStatus, string> = {
  pending: "أُنشئ حسابه ولم يُعتمد بعد — أسعاره لا تدخل التسعير إطلاقاً.",
  approved: "معتمد وأسعاره المعتمدة تشارك في تسعير الرحلات المغطاة.",
  suspended: "موقوف مؤقتاً — يبقى بكل بياناته وأسعاره لكنها تخرج من التسعير فوراً.",
};

const SUB_STATUS_TONE: Record<SubcontractorStatus, string> = {
  pending:
    "border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100",
  approved:
    "border-emerald-300 bg-emerald-100 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-100",
  suspended:
    "border-red-300 bg-red-100 text-red-900 dark:border-red-700 dark:bg-red-950 dark:text-red-100",
};

export const isSubStatus = (value: unknown): value is SubcontractorStatus =>
  typeof value === "string" && (SUBCONTRACTOR_STATUSES as string[]).includes(value);

export function SubStatusBadge({ status, className }: { status: string; className?: string }) {
  const known = isSubStatus(status);
  return (
    <Badge
      variant="outline"
      className={cn(
        known ? SUB_STATUS_TONE[status] : "border-border text-muted-foreground",
        className
      )}
    >
      {known ? SUB_STATUS_LABELS[status] : status}
    </Badge>
  );
}

export const PRICE_LIST_STATUSES: PriceListStatus[] = [
  "draft",
  "pending",
  "approved",
  "rejected",
];

export const LIST_STATUS_LABELS: Record<PriceListStatus, string> = {
  draft: "مسودة",
  pending: "قيد المراجعة",
  approved: "تم الاعتماد",
  rejected: "تم الرفض",
};

export const LIST_STATUS_HINTS: Record<PriceListStatus, string> = {
  draft: "المتعهد ما زال يحرّرها ولم يرسلها للمراجعة بعد.",
  pending: "أرسلها المتعهد وتنتظر اعتمادك — لا تدخل التسعير قبل الاعتماد.",
  approved: "معتمدة وتشارك في التسعير ما دام حساب المتعهد معتمداً.",
  rejected: "مرفوضة بملاحظتك — يعدّلها المتعهد ثم يعيد إرسالها.",
};

const LIST_STATUS_TONE: Record<PriceListStatus, string> = {
  draft: "border-border text-muted-foreground",
  pending:
    "border-sky-300 bg-sky-100 text-sky-900 dark:border-sky-700 dark:bg-sky-950 dark:text-sky-100",
  approved:
    "border-emerald-300 bg-emerald-100 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-100",
  rejected:
    "border-red-300 bg-red-100 text-red-900 dark:border-red-700 dark:bg-red-950 dark:text-red-100",
};

export const isListStatus = (value: unknown): value is PriceListStatus =>
  typeof value === "string" && (PRICE_LIST_STATUSES as string[]).includes(value);

export function ListStatusBadge({ status, className }: { status: string; className?: string }) {
  const known = isListStatus(status);
  return (
    <Badge
      variant="outline"
      className={cn(
        known ? LIST_STATUS_TONE[status] : "border-border text-muted-foreground",
        className
      )}
    >
      {known ? LIST_STATUS_LABELS[status] : status}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// رسائل الأخطاء — تُضاف إلى المشتركة من شاشات المرحلة ٤
// ---------------------------------------------------------------------------

export const SUBCONTRACTOR_ERRORS: Record<string, string> = {
  ...COMMON_BOOKING_ERRORS,
  company: "اسم الشركة حقل إلزامي — هو ما يظهر لك في القوائم وطابور المراجعة.",
  email: "البريد الإلكتروني غير صالح — إليه تصل دعوة الدخول فتأكد من كتابته صحيحاً.",
  phone: "رقم الموبايل حقل إلزامي — به يتواصل التشغيل مع المتعهد.",
  exists: "يوجد متعهد مسجَّل بنفس البريد أو نفس الرقم — افتح ملفه بدل إنشاء حساب ثانٍ له.",
  substatus: "حالة المتعهد غير معروفة — الحالات هي: بانتظار الاعتماد، معتمد، موقوف.",
  note: "الملاحظة إلزامية عند الرفض — يقرأها المتعهد ليصحّح قائمته ويعيد إرسالها.",
  liststatus:
    "هذه القائمة لم تعد «بانتظار المراجعة» — يبدو أن أحداً بتّ فيها أو عدّلها المتعهد بعد فتح الصفحة. أعد تحميلها لترى حالتها الحقيقية.",
  sheetcount:
    "عدد مسارات هذا الكشف تغيّر بعد فتح الصفحة — لم تُكتب حالةٌ واحدة. أعد تحميل الصفحة لترى الدفعة كاملةً كما هي الآن ثم قرّر.",
  notfound: "لم يعد هذا السجل موجوداً — أعد تحميل الصفحة.",
  invite:
    "أُنشئ حساب المتعهد لكن تعذّر إرسال بريد الدعوة — أرسلها يدوياً بالأمر الظاهر في ملفه.",
  nolink: "لا حساب دخول مرتبط بهذا المتعهد بعد — أرسل له الدعوة أولاً.",
};

// ---------------------------------------------------------------------------
// صيغ الجمع العربية — عرض فقط
// ---------------------------------------------------------------------------

/**
 * صيغة عربية لعدد + وحدة: مفرد / مثنى / جمع قلة (٣–١٠) / تمييز مفرد منصوب (١١+).
 * نفس منطق `unitText` في لبنات الطلبات، معمّماً على وحدات هذه الشاشة.
 */
export function countText(n: number, forms: [string, string, string, string]): string {
  const value = Math.max(0, Math.round(n));
  if (value === 1) return forms[0];
  if (value === 2) return forms[1];
  if (value === 0) return `${toArabicDigits(0)} ${forms[3]}`;
  if (value <= 10) return `${toArabicDigits(value)} ${forms[2]}`;
  return `${toArabicDigits(value)} ${forms[3]}`;
}

/** «يغطي مساراً واحداً» / «يغطي ٣ مسارات» — منصوب لأنه مفعول به في جملة التغطية */
export const routesText = (n: number) =>
  countText(n, ["مساراً واحداً", "مسارين", "مسارات", "مساراً"]);

/** «٨ أسعار فئات» — عدد الأسعار داخل القوائم */
export const classPricesText = (n: number) =>
  countText(n, ["سعر فئة واحدة", "سعرَي فئتين", "أسعار فئات", "سعر فئة"]);

/** «٣ مركبات» — حجم أسطول المتعهد */
export const vehiclesText = (n: number) =>
  countText(n, ["مركبة واحدة", "مركبتان", "مركبات", "مركبة"]);

/** «٤ قوائم» — عدد قوائم الأسعار */
export const listsText = (n: number) =>
  countText(n, ["قائمة واحدة", "قائمتان", "قوائم", "قائمة"]);

/** نطاق النقطة بالكيلومترات — «في كافة الاتجاهات» حول الإحداثي */
export const radiusText = (km: number | null) =>
  km === null ? "—" : `${formatDistance(km)} في كل اتجاه`;

// ---------------------------------------------------------------------------
// قراءة الصفوف — الجداول يملكها وكيل SQL فنقرأ بأسماء محتملة لا باسم واحد
// ---------------------------------------------------------------------------

export type SubcontractorView = {
  id: string;
  profileId: string | null;
  companyName: string;
  contactName: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  avatarUrl: string | null;
  socials: { facebook: string | null; instagram: string | null; website: string | null };
  status: string;
  notes: string | null;
  createdAt: string | null;
};

/**
 * روابط التواصل — تُقبل بصيغتين: عمود `socials` من نوع jsonb، أو ثلاثة أعمدة
 * مسطّحة. أيّهما نفّذه وكيل SQL تعمل الشاشة معه بلا تعديل.
 */
function readSocials(row: Record<string, unknown>): SubcontractorView["socials"] {
  const raw = row.socials;
  const nested =
    raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return {
    facebook: asText(nested.facebook) ?? asText(row.facebook),
    instagram: asText(nested.instagram) ?? asText(row.instagram),
    website: asText(nested.website) ?? asText(row.website),
  };
}

export function readSubcontractor(row: Record<string, unknown>): SubcontractorView {
  return {
    id: String(row.id),
    profileId: asText(pick(row, ["profile_id", "profileId"])),
    companyName: asText(pick(row, ["company_name", "companyName"])) ?? "—",
    contactName: asText(pick(row, ["contact_name", "contactName"])),
    phone: asText(row.phone),
    whatsapp: asText(row.whatsapp),
    email: asText(row.email),
    avatarUrl: asText(pick(row, ["avatar_url", "avatarUrl"])),
    socials: readSocials(row),
    status: asText(row.status) ?? "",
    notes: asText(row.notes),
    createdAt: asText(pick(row, ["created_at", "createdAt"])),
  };
}

export type PriceListView = {
  id: string;
  subcontractorId: string | null;
  title: string;
  originLabel: string;
  originLat: number | null;
  originLng: number | null;
  originRadiusKm: number | null;
  destLabel: string;
  destLat: number | null;
  destLng: number | null;
  destRadiusKm: number | null;
  bidirectional: boolean;
  status: string;
  reviewNote: string | null;
  createdAt: string | null;
};

export function readPriceList(row: Record<string, unknown>): PriceListView {
  return {
    id: String(row.id),
    subcontractorId: asText(pick(row, ["subcontractor_id", "subcontractorId"])),
    title: asText(row.title) ?? "قائمة بلا عنوان",
    originLabel: asText(pick(row, ["origin_label", "originLabel"])) ?? "—",
    originLat: asNumber(pick(row, ["origin_lat", "originLat"])),
    originLng: asNumber(pick(row, ["origin_lng", "originLng"])),
    originRadiusKm: asNumber(pick(row, ["origin_radius_km", "originRadiusKm"])),
    destLabel: asText(pick(row, ["dest_label", "destLabel"])) ?? "—",
    destLat: asNumber(pick(row, ["dest_lat", "destLat"])),
    destLng: asNumber(pick(row, ["dest_lng", "destLng"])),
    destRadiusKm: asNumber(pick(row, ["dest_radius_km", "destRadiusKm"])),
    bidirectional: row.bidirectional === true,
    status: asText(row.status) ?? "",
    reviewNote: asText(pick(row, ["review_note", "reviewNote"])),
    createdAt: asText(pick(row, ["created_at", "createdAt"])),
  };
}

export type PriceItemView = { priceListId: string; classSlug: string; cost: number | null };

export function readPriceItem(row: Record<string, unknown>): PriceItemView | null {
  const priceListId = asText(pick(row, ["price_list_id", "priceListId"]));
  const classSlug = asText(pick(row, ["class_slug", "classSlug"]));
  if (!priceListId || !classSlug) return null;
  return { priceListId, classSlug, cost: asNumber(pick(row, ["cost", "price", "amount"])) };
}

export type VehicleView = {
  id: string;
  classSlug: string | null;
  label: string;
  modelYear: number | null;
  plate: string | null;
  seats: number | null;
  active: boolean;
};

export function readVehicle(row: Record<string, unknown>, index: number): VehicleView {
  return {
    id: asText(row.id) ?? `vehicle-${index}`,
    classSlug: asText(pick(row, ["class_slug", "classSlug"])),
    label: asText(row.label) ?? "—",
    modelYear: asNumber(pick(row, ["model_year", "modelYear"])),
    plate: asText(row.plate),
    seats: asNumber(row.seats),
    // غياب العمود لا يعني «متوقفة»: النشاط هو الافتراض ما لم يُقل false صراحةً
    active: row.active !== false,
  };
}

// ---------------------------------------------------------------------------
// معاينة سعر العميل — عرض استرشادي لا مصدر حقيقة
// ---------------------------------------------------------------------------

export type MarginView = MarginSettings & {
  /** هل قُرئت الإعدادات من `pricing_settings` فعلاً أم سقطنا على قيم العقد؟ */
  fromDatabase: boolean;
};

/**
 * قراءة إعدادات الهامش من صف `pricing_settings`.
 * قبل تنفيذ هجرة المرحلة ٥ لا وجود للأعمدة الثلاثة، فتسقط القراءة على
 * `DEFAULT_MARGIN` من العقد وتُعلَم الشاشة أن ما تعرضه قيم افتراضية لا محفوظة.
 */
export function readMargin(row: Record<string, unknown> | null): MarginView {
  const type = asText(pick(row, ["margin_type", "marginType"]));
  const value = asNumber(pick(row, ["margin_value", "marginValue"]));
  const min = asNumber(pick(row, ["margin_min_amount", "marginMinAmount"]));
  if ((type !== "percent" && type !== "fixed") || value === null) {
    return { ...DEFAULT_MARGIN, fromDatabase: false };
  }
  return {
    marginType: type,
    marginValue: value,
    marginMinAmount: min ?? DEFAULT_MARGIN.marginMinAmount,
    fromDatabase: true,
  };
}

/** وصف قاعدة الهامش بجملة واحدة — يظهر فوق جدول المراجعة */
export function marginLabel(margin: MarginSettings, currency: string): string {
  const base =
    margin.marginType === "percent"
      ? `${toArabicDigits(margin.marginValue)}٪ من تكلفة المتعهد`
      : `${toArabicDigits(margin.marginValue)} ${currency} لكل رحلة`;
  return `${base}، وبحد أدنى ${toArabicDigits(margin.marginMinAmount)} ${currency}`;
}

/**
 * سعر العميل المقابل لتكلفة متعهد — **معاينة للعرض فقط**.
 *
 * الرقم الملزم يحسبه Postgres داخل `quote_price` لحظة التسعير؛ هذه الدالة تُظهر
 * للمدير ما ستؤول إليه التكلفة بالقاعدة نفسها (هامش مع أرضيته، ثم أرضية سعر
 * الفئة) حتى يعتمد وهو يرى أثر اعتماده على العميل لا التكلفة وحدها.
 * ما لا تُدخله عمداً: معامل الذهاب والعودة وساعات الانتظار وعمولة الذروة —
 * كلها معاملات رحلة بعينها لا معاملات قائمة أسعار.
 */
export function customerPrice(
  cost: number,
  margin: MarginSettings,
  minPrice: number | null
): { marginAmount: number; price: number; minApplied: boolean } {
  const raw =
    margin.marginType === "percent" ? (cost * margin.marginValue) / 100 : margin.marginValue;
  const marginAmount = Math.max(raw, margin.marginMinAmount);
  const withMargin = cost + marginAmount;
  const minApplied = minPrice !== null && minPrice > withMargin;
  return { marginAmount, price: minApplied ? minPrice : withMargin, minApplied };
}

/** أمر إرسال الدعوة يدوياً — يُعرض حرفياً للمدير لينسخه إلى الطرفية */
export const inviteCommand = (email: string | null, companyName: string) =>
  `node scripts/invite-subcontractor.mjs ${email ?? "email@example.com"} "${companyName}"`;
