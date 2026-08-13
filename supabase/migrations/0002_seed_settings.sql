-- ============================================================================
-- 0002_seed_settings.sql — بذر المفاتيح الخمسة لجدول site_settings
-- القيم مطابقة تماماً لـ DEFAULT_SETTINGS في lib/site-config.ts
-- ON CONFLICT DO NOTHING: إعادة التنفيذ لا تمسح أي تعديلات لاحقة من لوحة التحكم
-- ============================================================================

insert into public.site_settings (key, value)
values
  (
    'brand',
    '{
      "name": "منصة النقل السياحي",
      "tagline": "خدمات نقل سياحي موثوقة في جميع أنحاء مصر",
      "logoUrl": null,
      "colors": {
        "primary": "oklch(0.45 0.15 250)",
        "primaryForeground": "oklch(0.985 0 0)",
        "accent": "oklch(0.75 0.15 85)"
      }
    }'::jsonb
  ),
  (
    'contact',
    '{
      "phone": null,
      "whatsapp": null,
      "telegram": null,
      "email": null
    }'::jsonb
  ),
  (
    'socials',
    '{
      "facebook": null,
      "x": null,
      "linkedin": null,
      "github": null,
      "instagram": null
    }'::jsonb
  ),
  (
    'company',
    '{
      "legalName": null,
      "activity": "خدمات النقل السياحي داخل جمهورية مصر العربية"
    }'::jsonb
  ),
  (
    'seo',
    '{
      "titleTemplate": "%s | منصة النقل السياحي",
      "defaultDescription": "احجز سيارتك بسائق في ثوانٍ — استقبال مطارات، تنقلات داخل المدينة وبين المحافظات، جولات سياحية ومناسبات. أسعار واضحة وسيارات حديثة."
    }'::jsonb
  )
on conflict (key) do nothing;
