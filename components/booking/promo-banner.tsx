"use client";

import { Megaphone } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/components/site/i18n";
import type { PromoBanner } from "@/lib/discount-types";
import { CopyButton } from "./checkout/copy-button";

/**
 * بانرات العرض الترويجي — في مواضعها الثلاثة: الرئيسية · شاشة العروض · الحجز.
 *
 * ── ما هو البانر وما ليس هو ───────────────────────────────────────────────
 * نصّ العقد الأم: «بانر عرض ترويجي — نص تحفيزي يديره المالك، **بلا أثر على أي
 * سعر**». فهذا المكوّن عرضٌ محض: لا يقرأ سعراً ولا يطبّق كوبوناً ولا يستدعي
 * مساراً. و`couponCode` فيه **للعرض والنسخ فقط**، والتحقق يبقى في القاعدة —
 * فرمز مكتوب في بانر منتهٍ لا يشتري خصماً، لأن `apply_discount` هي وحدها من
 * يقرّر (وهذا مقصود: البانر ونافذة الكوبون كيانان مستقلان قد ينحرفان).
 *
 * جزيرة عميل رغم أنه بلا حالة: كي يستعمل `useT` (نصوص الواجهة الثابتة من
 * مساحة `discount`) وكي يعمل زر النسخ. يُصيَّر من مكوّنات خادمية بلا مشكلة —
 * البيانات تصله props قابلة للتسلسل.
 *
 * ⚠ **نقص مكتوب لا مُغطّى بادعاء:** عنوان البانر ونصّه يُعرضان كما هما في
 * القاعدة، أي بلغة المالك (العربية)، في كل اللغات. هجرة 0024 وسّعت مساحات
 * `translations` بمساحة `discount` تحسّباً لذلك، لكن **لا شيء يملؤها ولا يقرؤها
 * بعد** — فوصل البانرات بطابور الترجمة عمل قائم لم يُنجز في هذه المرحلة.
 */
export function PromoBanners({
  banners,
  className,
  compact = false,
}: {
  banners: PromoBanner[];
  className?: string;
  compact?: boolean;
}) {
  const t = useT("discount");
  if (banners.length === 0) return null;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {banners.map((banner) => (
        <div
          key={banner.id}
          className={cn(
            "flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-[color-mix(in_oklab,var(--brand-accent)_45%,transparent)] bg-[color-mix(in_oklab,var(--brand-accent)_12%,transparent)]",
            compact ? "px-3 py-2.5" : "px-4 py-3"
          )}
        >
          <div className="flex min-w-0 flex-1 items-start gap-2.5">
            <Megaphone className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
            <div className="flex min-w-0 flex-col gap-0.5">
              <p className="text-sm font-semibold leading-6">{banner.title}</p>
              {banner.body ? (
                <p className="text-xs leading-6 text-muted-foreground">{banner.body}</p>
              ) : null}
            </div>
          </div>

          {banner.couponCode ? (
            <div className="flex shrink-0 items-center gap-2">
              <code className="rounded-xl border border-dashed border-primary/50 bg-background px-2.5 py-1 text-sm font-bold tracking-widest">
                {banner.couponCode}
              </code>
              <CopyButton
                value={banner.couponCode}
                label={t("banner.codeLabel", "رمز الخصم")}
              />
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
