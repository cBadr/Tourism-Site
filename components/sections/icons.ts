import {
  Building2,
  Bus,
  Car,
  CircleCheck,
  Clock,
  Headset,
  Landmark,
  Luggage,
  MapPin,
  MicVocal,
  PartyPopper,
  Phone,
  Plane,
  Route,
  ShieldCheck,
  Star,
  Users,
  Wallet,
} from "lucide-react";

import { ITEM_ICON_NAMES, isItemIconName, type ItemIconName } from "@/lib/item-fields-types";

/**
 * مفردات الأيقونات — **خريطة واحدة للمنتج كله**، لا اثنتان تنحرفان.
 *
 * ── لماذا خريطة ساكنة لا بحثٌ ديناميكي في `lucide-react` ────────────────────
 *
 * ثلاثة أسباب، وأولها وحده كافٍ:
 *  • **الحزمة:** البحث بالاسم وقت التشغيل يمنع الهزّ الشجري، فتدخل مكتبة
 *    الأيقونات كاملةً في حزمة **صفحةٍ عامة** — والمرحلة ٣ قضت في تنحيف
 *    الأصول ما قضت (٤٫٤٣ م.ب ⇐ ٧٦٧ ك.ب).
 *  • **الانهيار:** اسمٌ لا يقابل مكوّناً في البحث الديناميكي يصيّر `undefined`
 *    عنصراً في JSX ⇒ **صفحة عامة ساقطة**. أما `ICON_MAP[name]` فيعطي
 *    `undefined` يُفحص بسطرٍ واحد ⇒ **لا أيقونة، والبطاقة كاملة**.
 *  • **الاتساق:** المستودع كله على استيرادٍ مسمّى.
 *
 * 🔒 **والنوع الصريح `Record<ItemIconName, IconComponent>` فائدةٌ مجانية
 * مقصودة:** اسمٌ يُضاف إلى `ITEM_ICON_NAMES` بلا مقابلٍ هنا يصير **خطأ بناء**
 * في `tsc`، لا نقصاً صامتاً على صفحة (نفس مذهب `pagePublicPath` في العقد §٨).
 *
 * ⚠ **وقاعدة ذهبية ١٢ منطبقة حرفياً:** كانت `SERVICE_ICONS` في
 * `components/site/services.tsx` تحمل ستة من هذه الأسماء بالضبط — فحُذفت
 * وتستورد الشبكة من هنا. خريطتان للأيقونة نفسها تنحرفان يوم تُضاف واحدة.
 */

/** توقيع مكوّن الأيقونة كما تصدّره `lucide-react` — يُشتق ولا يُكتب يدوياً */
export type IconComponent = typeof Plane;

export const ICON_MAP: Record<ItemIconName, IconComponent> = {
  // خدمات — الأسماء الستة نفسها التي كانت في `SERVICE_ICONS`
  plane: Plane,
  building: Building2,
  route: Route,
  landmark: Landmark,
  party: PartyPopper,
  mic: MicVocal,
  // ضمانات وثقة
  shield: ShieldCheck,
  check: CircleCheck,
  clock: Clock,
  wallet: Wallet,
  star: Star,
  headset: Headset,
  // مركبات وسفر
  car: Car,
  bus: Bus,
  users: Users,
  luggage: Luggage,
  mapPin: MapPin,
  phone: Phone,
};

/**
 * مكوّن الأيقونة لقيمةٍ قادمة من المحتوى — و**المجهول يغيب ولا ينهار**.
 *
 * `fallback` اختياري بقصد: بطاقةُ ميزةٍ كان لها رمزٌ محفور (`CircleCheck`)
 * فتحتفظ به حين لا يختار المالك شيئاً، وبطاقةُ مسارٍ لم يكن لها رمزٌ أصلاً
 * فتبقى بلا رمز. الغياب يعني «الافتراضي» لا «صفر» (الذهبية ١٥).
 */
export function iconFor(
  value: unknown,
  fallback: IconComponent | null = null
): IconComponent | null {
  if (!isItemIconName(value)) return fallback;
  return ICON_MAP[value] ?? fallback;
}

/** أسماء الأيقونات بترتيب العرض في القائمة المنسدلة — من العقد لا بنسخٍ ثانٍ */
export { ITEM_ICON_NAMES, isItemIconName, type ItemIconName };
