"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { IntegrationsSettings } from "@/lib/analytics-types";
import {
  INTEGRATION_SERVICES,
  isValidIntegrationId,
  normalizeIntegrationId,
} from "@/lib/analytics/services";
import { createServerSupabase } from "@/lib/supabase/server";

/**
 * حفظ مفتاح `integrations` في `site_settings` — بالشكل القياسي لأي Server Action
 * في هذا المستودع (`handover/CONVENTIONS.md §٤`): فحص البيئة ← تحقق المدخلات
 * برمز خطأ مستقل لكل سبب ← كتابة مع `.select()` وفحص صفر صفوف ← إبطال الكاش ثم
 * إعادة توجيه.
 *
 * ── لماذا نموذج واحد لكل الخدمات السبع ──────────────────────────────────────
 * لأنها كلها كائن JSONB واحد في صف واحد (`key = 'integrations'`). نموذج لكل
 * خدمة كان سيضطر إلى إعادة كتابة الست الأخريات في كل حفظ — وأي انقطاع بين
 * القراءة والكتابة يمحو إعداداً. هنا الصف يُبنى كاملاً من النموذج فلا فقد.
 *
 * ولذلك أيضاً لا يمسّ هذا الإجراء أي مفتاح آخر: `brand` و`seo` و`notifications`
 * تُحرَّر من `/admin/settings`، و`payment` من `/admin/payment-accounts`.
 *
 * ⚠ لا سرّ يُكتب هنا. توكن Meta CAPI في متغيّر البيئة `META_CAPI_ACCESS_TOKEN`
 * وحده، ولا يوجد له حقل في هذا النموذج أصلاً — الأمان بنيوي لا انضباطي:
 * جدول `site_settings` مقروء علناً بسياسة `site_settings_select_public`.
 */

const url = (qs: string) => `/admin/integrations?${qs}`;

export async function saveIntegrations(formData: FormData) {
  // (١) فحص البيئة أولاً
  const supabase = await createServerSupabase();
  if (!supabase) redirect(url("error=env"));

  // (٢) التحقق — رمز خطأ مستقل لكل خدمة حتى تعرف الشاشة أي حقل تشير إليه
  const value = {} as IntegrationsSettings;

  for (const service of INTEGRATION_SERVICES) {
    const raw = formData.get(`integrations.${service.key}.id`);
    const id = normalizeIntegrationId(service.key, typeof raw === "string" ? raw : "");

    if (id !== "" && !isValidIntegrationId(service.key, id)) {
      redirect(url(`error=id-${service.key}`));
    }

    value[service.key] = {
      // مربع اختيار غير مؤشَّر لا يُرسل أصلاً — الغياب يعني «مطفأ»
      enabled: formData.get(`integrations.${service.key}.enabled`) != null,
      id: id === "" ? null : id,
    };
  }

  // (٣) الكتابة مع .select() وفحص صفر صفوف
  const { data, error } = await supabase
    .from("site_settings")
    .upsert([{ key: "integrations", value }], { onConflict: "key" })
    .select("key");

  // صفر صفوف مع نجاح ظاهري = RLS رفضت الكتابة (المستخدم ليس admin)
  if (error || !data || data.length === 0) redirect(url("error=save"));

  // (٤) الوسوم تُحقن في الـ layout الجذر ⇒ إبطال الشجرة كلها لا صفحة بعينها
  revalidatePath("/", "layout");
  redirect(url("saved=1"));
}
