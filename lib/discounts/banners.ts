import "server-only";

import { cache } from "react";
import type { PromoBanner } from "@/lib/discount-types";

/**
 * قارئ بانرات العرض — جدول `promo_banners` (هجرة 0024).
 *
 * البانر **نص تحفيزي بلا أثر على أي سعر** (نصّ العقد الأم حرفياً). فهو محتوى
 * عرض محض: يُقرأ بعميل الخادم العادي (مفتاح anon، خاضع لـ RLS) لا بمفتاح
 * الخدمة — لا سبب لتجاوز RLS لقراءة ما هو معروض للعامة أصلاً.
 *
 * ── نافذة العرض تُقيَّم في Postgres لا في TypeScript ───────────────────────
 * المرشِّحات تُمرَّر إلى PostgREST بالقيمة الحرفية `now`، وPostgres يفسّرها
 * `'now'::timestamptz` أي لحظة المعاملة. فساعة الخادم التي تحكم ظهور البانر هي
 * ساعة القاعدة نفسها التي تحكم صلاحية الكوبون — لا ساعتان تنحرفان (النمط ٨ في
 * `handover/LESSONS.md`: مصدران لرقم واحد). ولا يُحسب هنا تاريخ ولا فرق زمني.
 *
 * ── ولماذا نُرشّح رغم أن RLS ترشّح ─────────────────────────────────────────
 * سياسة `promo_banners_select_public` تفرض النافذة والتفعيل على `anon` أصلاً.
 * لكن سياسة `authenticated` تفتح **كل** البانرات للمشرف — فمشرفٌ مسجَّل الدخول
 * يتصفح الموقع العام كان سيرى بانرات معطَّلة ومنتهية على أنها حية. المرشِّحات
 * هنا تجعل ما يراه المشرف هو ما يراه الزائر، وتبقى RLS الحاجز الحقيقي.
 *
 * أي خطأ (هجرة غير مطبَّقة، صلاحية غير ممنوحة، بيئة ناقصة) ⇒ مصفوفة فارغة:
 * الموقع يفقد بانراً ولا يسقط. البانر زينة تحفيزية لا ركن من الوظيفة.
 */

export type BannerPlacement = PromoBanner["placement"];

type BannerRow = {
  id: string;
  title: string;
  body: string | null;
  coupon_code: string | null;
  placement: string;
  starts_at: string | null;
  ends_at: string | null;
  enabled: boolean;
  sort: number | null;
};

function isPlacement(value: unknown): value is BannerPlacement {
  return value === "home" || value === "offers" || value === "checkout";
}

const loadBanners = cache(async (placement: string): Promise<PromoBanner[]> => {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return [];
  }
  try {
    const { createServerSupabase } = await import("@/lib/supabase/server");
    const supabase = await createServerSupabase();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from("promo_banners")
      .select("id, title, body, coupon_code, placement, starts_at, ends_at, enabled, sort")
      .eq("placement", placement)
      .eq("enabled", true)
      .or("starts_at.is.null,starts_at.lte.now")
      // `gt` لا `gte` — مطابقةً حرفية لشرط `ends_at > now()` في سياسة RLS،
      // كي لا يختلف ما تعرضه هذه الدالة عمّا تسمح به القاعدة في الثانية الأخيرة
      .or("ends_at.is.null,ends_at.gt.now")
      .order("sort", { ascending: true })
      .limit(3);

    if (error || !Array.isArray(data)) return [];

    return (data as BannerRow[])
      .filter((row) => isPlacement(row.placement) && typeof row.title === "string")
      .map((row) => ({
        id: String(row.id),
        title: row.title,
        body: row.body ?? null,
        couponCode: row.coupon_code ?? null,
        placement: row.placement as BannerPlacement,
        startsAt: row.starts_at ?? null,
        endsAt: row.ends_at ?? null,
        enabled: true,
        sort: Number(row.sort ?? 0),
      }));
  } catch {
    return [];
  }
});

/** بانرات موضع واحد، جاهزة للعرض — مُذاكَرة لكل طلب */
export async function getPromoBanners(placement: BannerPlacement): Promise<PromoBanner[]> {
  return loadBanners(placement);
}
