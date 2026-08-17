import "server-only";

import { cache } from "react";

import { rethrowControlFlow } from "@/lib/next-control-flow";
import {
  DEFAULT_SITE_TIME_ZONE,
  resolveSiteTimeZone,
  setSiteTimeZone,
} from "@/lib/site-timezone";

/**
 * قراءة المنطقة الزمنية من القاعدة — طرفُ الخادم لوحدة `lib/site-timezone.ts`.
 *
 * **عبر `site_time_zone()` لا بقراءة الجدول**: `trip_settings` محروسٌ بـ
 * `is_admin()` وغير ممنوح لـ`anon`، فقراءةٌ مباشرة بجلسة الزائر تعود **بصفر
 * صفوف بلا خطأ** ⇒ سقوطٌ صامت إلى الافتراضي على كل صفحةٍ عامة. والدالة
 * `security definer` بنوع إرجاع `text` وحده (هجرة 0075).
 *
 * **ومُذاكَرة لكل طلب** بـ`cache()` — نفس نمط `loadBaseSettings` في
 * `lib/settings.ts`: قراءةٌ واحدة مهما تعدّد المنادون، ولا ذاكرةَ عابرةٌ بمهلة
 * تُبقي الإعداد كاذباً بعد أن يغيّره المالك (‏`revalidatePath` يُبطل الشجرة
 * فتُعاد القراءة في الطلب التالي مباشرةً).
 *
 * وتضبط الوحدة المشتركة بنفسها (‏`setSiteTimeZone`) فتصل القيمة إلى الدوال
 * الصرفة التي لا تستطيع `await` — `format.ts` و`checkout/datetime.ts` وأخواتهما.
 */
export const getSiteTimeZone = cache(async (): Promise<string> => {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return setSiteTimeZone(DEFAULT_SITE_TIME_ZONE);
  }

  try {
    const { createServerSupabase } = await import("@/lib/supabase/server");
    const supabase = await createServerSupabase();
    if (!supabase) return setSiteTimeZone(DEFAULT_SITE_TIME_ZONE);

    const { data, error } = await supabase.rpc("site_time_zone");
    // هجرة 0075 غير مطبَّقة، أو تعذّر الاتصال ⇒ الافتراضي، بلا انهيار
    if (error) return setSiteTimeZone(DEFAULT_SITE_TIME_ZONE);

    return setSiteTimeZone(resolveSiteTimeZone(data));
  } catch (error) {
    // إشارة «هذه الصفحة ديناميكية» تمرّ كما هي (نفس عقد `lib/settings.ts`)
    rethrowControlFlow(error);
    return setSiteTimeZone(DEFAULT_SITE_TIME_ZONE);
  }
});
