/**
 * عقد المتعهدين وقوائم الأسعار والتغطية (المرحلة ٥) — المرجع الأوحد.
 *
 * قاعدة الدمج المحسومة في VISION.md (ملحق ٣):
 *   إن وُجد متعهد معتمد يغطي المسار ← أرخص سعر متعهد + الهامش
 *   وإلا ← تعريفة الكيلومتر (سلوك المرحلة ٣ كما هو)
 *   وعمولة الذروة تُضاف فوق الناتج أياً كان مصدره — آخر خطوة دائماً.
 *
 * التغطية الجغرافية: قائمة السعر ترسو على نقطتين (بداية ونهاية) ولكل نقطة
 * نطاق كيلومترات «في كافة الاتجاهات». الرحلة مغطاة حين تقع نقطة انطلاقها داخل
 * نطاق نقطة البداية ونقطة وصولها داخل نطاق النهاية (أو العكس إن كانت القائمة
 * ثنائية الاتجاه) — مثال الرؤية: مصر الجديدة ← المعمورة تقع داخل نطاق
 * القاهرة ← الإسكندرية.
 */

/** حالة حساب المتعهد — لا تشارك أسعاره في التسعير إلا وهو approved */
export type SubcontractorStatus = "pending" | "approved" | "suspended";

export type SubcontractorRow = {
  id: string;
  /** حساب الدخول المرتبط في profiles (قد يكون null قبل قبول الدعوة) */
  profileId: string | null;
  companyName: string;
  contactName: string | null;
  phone: string;
  whatsapp: string | null;
  email: string | null;
  avatarUrl: string | null;
  socials: {
    facebook: string | null;
    instagram: string | null;
    website: string | null;
  };
  status: SubcontractorStatus;
  notes: string | null;
  createdAt: string;
};

/** مركبة في أسطول المتعهد — الفئة تربطها بمحرك التسعير */
export type SubcontractorVehicleRow = {
  id: string;
  subcontractorId: string;
  classSlug: string;
  /** ماركة/موديل للعرض الداخلي فقط — لا يظهر للعميل (white-label) */
  label: string;
  modelYear: number | null;
  plate: string | null;
  seats: number | null;
  active: boolean;
};

/** حالة قائمة الأسعار — المعتمدة وحدها تدخل التسعير */
export type PriceListStatus = "draft" | "pending" | "approved" | "rejected";

/**
 * قائمة أسعار مسار — نقطتان بنطاقيهما وأسعار الفئات.
 * الأسعار هنا **تكلفة المتعهد** لا سعر العميل؛ سعر العميل = هذه + الهامش.
 */
export type PriceListRow = {
  id: string;
  subcontractorId: string;
  title: string;
  originLabel: string;
  originLat: number;
  originLng: number;
  originRadiusKm: number;
  destLabel: string;
  destLat: number;
  destLng: number;
  destRadiusKm: number;
  /** تغطي الاتجاه المعاكس أيضاً (الإسكندرية ← القاهرة) */
  bidirectional: boolean;
  status: PriceListStatus;
  reviewNote: string | null;
  createdAt: string;
};

/** سعر فئة داخل قائمة — صف لكل (قائمة × فئة) */
export type PriceListItemRow = {
  priceListId: string;
  classSlug: string;
  /** تكلفة المتعهد للاتجاه الواحد بالجنيه */
  cost: number;
};

/** إعدادات الهامش — تُضاف إلى `pricing_settings` */
export type MarginSettings = {
  marginType: "percent" | "fixed";
  marginValue: number;
  /** أرضية الهامش بالجنيه — تحمي من هامش ضئيل على المسارات الرخيصة */
  marginMinAmount: number;
};

export const DEFAULT_MARGIN: MarginSettings = {
  marginType: "percent",
  marginValue: 20,
  marginMinAmount: 100,
};

/**
 * مصدر سعر العرض — يُخزَّن مع الحجز ويغذّي تقارير الهامش في المرحلة ٧.
 * "subcontractor": أرخص متعهد مغطٍّ + الهامش. "tariff": تعريفة الكيلومتر.
 */
export type PriceSource = "subcontractor" | "tariff";

/**
 * التوقيع المُرقَّى لدالة التسعير (هجرة 0010) — يبقى اسمها ووسائطها كما هي
 * حفاظاً على المستدعين، وتُضاف أعمدة الإرجاع الأربعة الأخيرة:
 *   quote_price(p_distance_km, p_passengers, p_round_trip, p_waiting_hours,
 *               p_origin_lat default null, p_origin_lng default null,
 *               p_dest_lat default null, p_dest_lng default null)
 *   returns table(..., price_source text, subcontractor_id uuid,
 *                 subcontractor_cost numeric, margin_amount numeric)
 *
 * بلا إحداثيات (استدعاء قديم) تعمل الدالة بتعريفة الكيلومتر كما في المرحلة ٣.
 */
export type OfferPricing = {
  priceSource: PriceSource;
  subcontractorId: string | null;
  subcontractorCost: number | null;
  marginAmount: number | null;
};

/** نتيجة مطابقة التغطية — تُستخدم في اللوحة وفي فحص «هل المسار مغطى؟» */
export type CoverageMatch = {
  priceListId: string;
  subcontractorId: string;
  companyName: string;
  title: string;
  /** الاتجاه الذي طابق: مباشر أو معكوس */
  reversed: boolean;
  cost: number | null;
};

/* ------------------------------------------------------------------ */
/* كشوف الأسعار — هجرة 0102                                            */
/* ------------------------------------------------------------------ */

/**
 * **كشف أسعار**: ما يسمّيه المالك «قائمة الأسعار» — يضم مساراتٍ كثيرة
 * (صفوف `PriceListRow`) ويُعتمد **مرّة واحدة**.
 *
 * 🔑 الكشف **لا يحمل حالة**: الحالة تبقى في `PriceListRow.status` وحدها، وهي
 * نفس العمود الذي تقرؤه `coverage_matches`. فما تراه هنا عدّاداتٌ مشتقّة من
 * مسارات الكشف لا حالةٌ ثانية تنحرف عنها.
 */
export type PriceSheetRow = {
  id: string;
  subcontractorId: string;
  companyName: string;
  title: string;
  note: string | null;
  routes: number;
  draftCount: number;
  pendingCount: number;
  approvedCount: number;
  rejectedCount: number;
  createdAt: string | null;
  updatedAt: string | null;
};

/**
 * فئة معروضة للتسعير. `covered = false` تعني «مُسعَّرة في هذا المسار لكن لم يعد
 * للمتعهد مركبة فيها» — تُعرض ليصحّحها هو، ولا تُحذف بصمت.
 */
export type PriceSheetClass = {
  slug: string;
  title: string;
  capacity: number | null;
  sort: number;
  covered: boolean;
};

/** سطرٌ في تقرير الاستيراد — صفٌّ من الملف وما جرى له ولماذا */
export type PriceImportRow = {
  rowNo: number;
  accepted: boolean;
  /** created · updated · created-preview · updated-preview · rejected */
  action: string;
  routeTitle: string | null;
  classesSaved: number;
  reason: string | null;
};

/** أعمدة قالب CSV الثابتة — وما بعدها أعمدة أسعار بأسماء الفئات (slug) */
export const PRICE_IMPORT_COLUMNS = [
  "title",
  "originLabel",
  "originLat",
  "originLng",
  "originRadiusKm",
  "destLabel",
  "destLat",
  "destLng",
  "destRadiusKm",
  "bidirectional",
] as const;
