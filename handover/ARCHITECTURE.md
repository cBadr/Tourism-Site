<div dir="rtl">

# البنية التقنية — أين يعيش كل شيء

> اقرأ هذا الملف قبل أن تفتح أي ملف كود. كل ما فيه مُتحقَّق من المستودع لحظة كتابة الحزمة.
> المسارات نسبية إلى جذر المشروع `C:/Users/Badr/OneDrive/Desktop/Tours-01`.

---

## ١) الطبقات في سطر واحد

**تطبيق Next.js 16.3 واحد (App Router) + مشروع Supabase واحد (Postgres).** لا خادم API منفصل · لا Docker · لا CI · لا إطار اختبار JavaScript · لا Supabase CLI ولا Postgres محلي.

**القاعدة الحاكمة:** Postgres هو التطبيق — المنطق والصلاحيات وكل حساب مالي. وNext.js طبقة **عرض وسباكة**: تجمع المدخلات، تنادي دالة في القاعدة، تنسّق الناتج.

| الطبقة | أين | ماذا تملك فعلاً |
|---|---|---|
| منطق العمل والمال | `supabase/migrations/*.sql` | الجداول والدوال والـ views والمشغّلات وسياسات RLS — **٢٨ ملفاً** مطبَّقاً (`0001` … `0028`)، والرقم الحر التالي `0029` |
| عقود الأنواع | `lib/*-types.ts` (**١١ ملفاً**) | نسخة TypeScript من تواقيع SQL + **ترويسة عربية تشرح القرار ومبرره** |
| الوصول للقاعدة | `lib/supabase/{client,server,admin}.ts` | ثلاثة عملاء لا رابع لهم |
| التصيير | `app/**` | Server Components افتراضياً؛ `"use client"` محصور في `_components/` |
| الحراسة والتوجيه | `proxy.ts` في الجذر | صيانة ← تحويلات ← لغة ← حارس `/admin` |
| الخدمات الخارجية | `lib/geo` · `lib/notifications` · `lib/payments` · `lib/i18n/mt` · `lib/analytics` | كلها بنمط **تدهور متدرّج**: غياب المزوّد يخفض القدرة ولا يوقف المسار |
| القياس والإحصائيات | `lib/analytics` · `lib/stats` · `lib/seo` | الكتابة بمفتاح الخدمة، والقراءة من عروض ودوال محروسة — القسم ١٢ |

---

## ٢) ثلاثة عملاء Supabase — ولا رابع

| الملف | يعمل في | الهوية | ملاحظة حاسمة |
|---|---|---|---|
| `lib/supabase/client.ts` | المتصفح | `anon` | كل ما يمر منه تحرسه RLS |
| `lib/supabase/server.ts` | Server Components وServer Actions | `anon` + جلسة المستخدم من الكوكيز | **يرجع `null`** إن غابت متغيرات البيئة (`server.ts:16`) — ولذلك كل Server Action تبدأ بفحص `if (!supabase)` |
| `lib/supabase/admin.ts` | الخادم فقط | `service_role` — **يتجاوز RLS بالكامل** | مذاكَر داخل الوحدة (`cached`)؛ يرجع `null` بلا مفتاح. كل نداء منه مسؤول عن التحقق بنفسه لأنه بلا شبكة أمان |

**القاعدة:** أي عملية تتجاوز RLS (إنشاء حجز، كتابة كاش المسافات، عامل الإشعارات، مسارات الدفع، السكربتات) تمر من `admin.ts` وحدها. وجود `SUPABASE_SERVICE_ROLE_KEY` في متغير يبدأ بـ `NEXT_PUBLIC_` كارثة صامتة — لا تفعلها أبداً.

---

## ٣) الواجهات الثلاث ومجموعات المسارات

| المجموعة | المسارات | اللغة | الحارس |
|---|---|---|---|
| الموقع العام | `/` · `/book` · `/booking/[token]` · **`/track`** · `/services/[slug]` · `/routes/[slug]` · `/about` · `/[slug]` (الصفحات القانونية) · `/quote-request` · `/payment/return/[intentId]` | عربي بلا بادئة + `/en/...` وأي لغة مفعّلة | مفتوح — يمر على وضع الصيانة |
| اللوحة | `/admin/**` — **٢٠ مجلد قسم و٤٢ ملف `page.tsx`** بالمتفرّعات: `stats` · `orders` · `dispatch` · `subcontractors` · `finance` · `pricing` · `fleet` · `content` · `languages` · `payments` · `payment-accounts` · `discounts` · `notifications` · `integrations` · `seo` · `settings` · `maintenance` · `quote-requests` · `login` · `set-password` — وفوقها `app/admin/page.tsx` (شاشة القيادة). و**القائمة الجانبية ١٩ بنداً** في `app/admin/_components/admin-shell.tsx`: شاشة القيادة + ١٨ قسماً؛ الزائدان عنها هما `login` و`set-password` وهما خارج التنقل بطبيعتهما (وشاشتا المصادقة تُصيَّران بلا شريط جانبي أصلاً) | **عربي فقط** | جلسة + فحص دور في `proxy.ts` **و** `app/admin/layout.tsx` (طبقتان) |
| بورتال المتعهدين | `/portal` · `/portal/{trips,requests,fleet,prices,prices/[id],profile}` | **عربي فقط** | جلسة + **RLS على مستوى الصف** + دوال `portal_*` بلا أعمدة حساسة |

`/en/admin` يرد **٤٠٤** ولا يتسلل خلف الحارس، لأن الفحص يقع على المسار **الأصلي** قبل إعادة كتابة اللغة.

> **ملاحظة على `/track` (الدفعة ٢):** مسارها الجذر لا `/booking/track`، لأن بادئة `/booking` محجوزة بالكامل في `lib/seo/site-paths.ts` وصفحةٌ حيّة تحتها تناقض ذلك الملف. وهي **مفهرَسة عمداً** بخلاف `/booking/[token]` (تلك `noindex/nofollow` لأنها خاصة بتوكن العميل): هذه سطح **وصول** لا محتوى خاص، فلها canonical وhreflang كأي صفحة عامة، ووزنها في `app/sitemap.ts` = `0.6`. ولا تكتب شيئاً ولا تقرأ حجزاً — إجراؤها يحوّل إلى التوكن وينتهي.

---

## ٤) `proxy.ts` — ملف الوسيط (وليس `middleware.ts`)

> في هذه النسخة من Next اسم الملف `proxy.ts` ويصدّر `proxy()` و`config.matcher`. إنشاء `middleware.ts` ينتج ملفاً **لا يعمل** ويبدو صحيحاً.

الترتيب داخل الدالة ثابت ولا يُقلب — **أربع طبقات** منذ المرحلة ١٠:

1. **وضع الصيانة** — أولاً وللمسارات العامة وحدها (القراءة مُذاكَرة داخل العملية).
2. **تحويلات السيو** (المرحلة ١٠) — جدول `redirects` يديره المالك من `/admin/seo/redirects`. موضعها **بعد الصيانة وقبل اللغة** مقصود: بعد الصيانة كي يبقى «الموقع مغلق» أول قرار؛ وقبل `canonicalLocalePath` كي لا يأخذ رابط قديم بصيغة `/EN/old-page` **قفزتين** (٣٠٨ ثم ٣٠١) — فـ `resolveRedirect` تقشر البادئة بنفسها وتعيد تركيبها قانونياً، والنتيجة قفزة واحدة والزائر لا يفقد لغته. لا تلمس `/admin` ولا `/portal` ولا `/api` ولا الأصول، والقراءة **مُذاكَرة ٣٠ ثانية داخل العملية** لا استعلام على كل طلب، **والفشل آمن: أي خطأ = لا تحويل**.
3. **اللغة** — `canonicalLocalePath()` يحوّل `/ar/x` و`/EN/x` و`/en/x/` بـ **٣٠٨** إلى الشكل الوحيد، ثم يُعاد كتابة `/en/...` داخلياً. والمسار الأصلي يُمرَّر في ترويسة `x-pathname` — يقرؤها `app/admin/layout.tsx` **وحارس وسوم القياس** (القسم ١٢).
4. **حارس `/admin`** — بلا متغيرات بيئة **يمرّ الجميع** (وضع تطوير متعمَّد)؛ ومع القاعدة: الدور يُقرأ من `profiles` لا من الكوكي، و`admin`/`ops` يدخلان، و`subcontractor` يُحوَّل إلى `/portal`، وما عداهما إلى `/`.

`config.matcher` يستثني `_next/static` و`_next/image` و`favicon.ico` فقط — كل ما عداها يمر بالوسيط لأن الصيانة يجب أن تسبق تصيير أي صفحة.

---

## ٥) دورة حياة طلب حقيقي — من الويدجت إلى السعر

```
components/booking/search-widget.tsx
   ↓ (اختيار مكان)  /api/geocode  →  lib/geo/geocode.ts  →  Nominatim + كاش geocode_cache
   ↓ (طلب سعر)      /api/quote    →  lib/geo/route.ts (المسافة، أربع طبقات)
                                   →  createServiceSupabase()
                                   →  rpc("quote_public", …)      ← هجرة 0012
   ↓                                (وعند غياب الدالة: سقوط للتوافق على rpc("quote_price"))
components/booking/offers.tsx      ← بطاقات الفئات المؤهلة بسعر نهائي واحد
```

**النقطة المعمارية:** الاستجابة الخارجة إلى المتصفح **لا تحتوي تكلفة المتعهد ولا الهامش ولا هويته أصلاً** — لأن `quote_public()` لا تحمل هذه الأعمدة في نوع إرجاعها، لا لأن الواجهة تصفّيها.

---

## ٦) نموذج الأمان في القاعدة

| الطبقة | التفصيل |
|---|---|
| الأدوار | `anon` (زائر) · `authenticated` (**وكل متعهد واحد منهم**) · `service_role` · وداخلياً `profiles.role` ∈ `admin`/`ops`/`subcontractor`/`customer` |
| RLS | مفعّلة على كل جدول عام؛ السياسات مكتوبة بتعليقات عربية داخل الهجرة نفسها |
| `revoke` ثم `grant` | **إلزامي في كل ترحيل ينشئ جداول** — Supabase تمنح الأدوار العامة صلاحيات واسعة افتراضياً على الجداول الجديدة، ومنها `TRUNCATE` وهي **لا تخضع لـ RLS إطلاقاً** (`0005_pricing.sql:109`، `0007_booking.sql:1259`) |
| `security definer` | كل دالة تتجاوز RLS تثبّت `set search_path = ''` وتؤهّل كل مرجع (`public.bookings`, `auth.users`) |
| الحدود البنيوية | `quote_public()` بلا أعمدة داخلية · `portal_offers()` بلا أعمدة عميل **ولا مرجع حجز** (‏`0028`) · `coverage_matches` و`partner_debt` و`partner_over_debt_limit` و`partner_credit_config` **غير ممنوحة لأي دور مستخدم** (`0011` · `0027`) · `find_booking_by_reference` غير ممنوحة لـ `anon` ولا `authenticated` (‏`0027`) |
| الحواجز في **الجدول** لا في الدالة | `trip_offers_one_accepted_key` (فهرس فريد جزئي، `0013`) · حارس «لا يفوز متعهد غير معتمد» (`0014`) · و`0027` يضيف مُشغّلَين: `trip_offers_guard_accept` (سقف الدين) و`partner_payouts_guard_owing` (لا دفعة لمدين). **السبب واحد في كل مرة:** الفحص داخل دالة يتخطاه إدراجٌ مباشر عبر PostgREST أو محرر SQL |
| الأقل صلاحية | جدولا الكاش بلا أي `grant` للأدوار العامة · `booking_lookup_attempts` بلا منح لأي دور **وبلا سياسة واحدة** (`0027`) · `create_booking` لـ `service_role` وحده · لا `insert` على `bookings` لأحد غيرها |
| التجاوز البشري بابٌ مسمّى | `manual_assign_with_loss` (أرضية الهامش) · `manual_assign_over_limit` (سقف الدين) · `record_partner_payout_advance` (الدفع لمدين) — لا وسيط `force` ولا استثناء صامت، والاسم نفسه يجعل القرار ظاهراً في سجل الاستدعاءات |

**السؤال الذي يُطرح على كل `grant execute` جديد:** ماذا يرى متعهد **مسجَّل الدخول** هنا؟
**والسؤال الذي أضافته الدفعة ٢:** أي **مدخل عام جديد** يوجب جرداً لما يملكه كل دور **بالفعل** — لا مراجعةً للشاشة الجديدة وحدها. فحقلٌ بريء (مرجع الحجز في البورتال) صار مفتاحاً ثانياً بمجرد ولادة `/track` (D-46).

---

## ٧) الترحيلات — العمود الفقري

| الخاصية | التفصيل |
|---|---|
| المكان | `supabase/migrations/0001_core.sql` … `0028_batch_two_hardening.sql` (**٢٨ ملفاً، كلها مطبَّقة**؛ الرقم الحر التالي `0029`) |
| الأداة | `pnpm db:migrate` → `scripts/db-migrate.mjs` — يتصل بالسحابة عبر `DATABASE_URL` بمكتبة `pg`، ويتتبع في `public.schema_migrations(name, applied_at)` |
| الذرّية | كل ملف داخل `begin/commit` مستقل؛ الفشل يُرجع الملف كاملاً ويوقف التنفيذ |
| إعادة التنفيذ | كل ملف idempotent: `create table if not exists` · `create or replace function` · `drop policy if exists` · كتل `do $$ … $$` |
| القاعدة الحديدية | **الملف المطبَّق لا يُعدَّل** — التصحيح ترحيل جديد. ولهذا وُلدت ملفات `*_hardening` و`*_corrections` |
| مستقبلاً | نفس السكربت هو نواة أداة «طبّق على كل نسخ الـ Whitelabel» في المرحلة ١٤ |

### خريطة الترحيلات بالمرحلة

| الملف | المرحلة | ماذا أنشأ |
|---|---|---|
| `0001_core` | ١ | `site_settings` + `profiles` بالأدوار + دوال الأمان + RLS |
| `0002_seed_settings` | ١ | بذر المفاتيح الخمسة — مطابقة لـ `DEFAULT_SETTINGS` في `lib/site-config.ts` |
| `0003_content` · `0004_seed_content` | ٢ | `pages` + `sections` (JSONB) + `media`؛ وبذر ١٤ صفحة بأقسامها |
| `0005_pricing` | ٣ | `vehicle_classes` + `tariffs` + `pricing_settings` + كاش الجيوكودنج والمسافات + `quote_price` |
| `0006_cache_keys` | ٣ | **تصحيح انحراف عقد**: توحيد أسماء أعمدة الكاش بعد أن استعمل وكيلان اسمين مختلفين |
| `0007_booking` · `0008_trust_pages` · `0009_booking_hardening` | ٤ | الحجز والدفع المحلي والإشعارات (٦ جداول + آلة حالات محروسة + دلو الإيصالات) · صفحات الثقة + مفتاح الصيانة · تصليب مكافحة التلاعب |
| `0010_subcontractors` · `0011_partner_isolation` · `0012_quote_public` | ٥ | المتعهدون وقوائم الأسعار والتغطية + دمج التسعير · عزل متعهد-ضد-متعهد · واجهة تسعير عامة بلا أرقام داخلية |
| `0013_dispatch` · `0014_dispatch_hardening` | ٦ | `dispatches` + `trip_offers` + `dispatch_settings` ودوالها (`start_dispatch`, `dispatch_broadcast`, `accept_offer`, `reject_offer`, `dispatch_tick`, `manual_assign`, `portal_offers`, `portal_trips`) · سقف الموجة والخصوصية وأرضية الهامش |
| `0015_finance` · `0016_finance_corrections` · `0017_settlement_abs` | ٧ | الخزينة و`ledger_entries` والمصروفات ودفعات المتعهدين والمقاصة والتدفق النقدي · تصحيح `net_due` ومسارات التصحيح · `abs_net_due` |
| `0018_i18n` · `0019_enabled_locales` | ٨ | `locales` + `translations` وطابور المراجعة · `enabled_locales()` بعدّاد نصوص منشورة |
| `0020_payments` · `0021_payments_hardening` | ٩ | `payment_providers` + `payment_intents` + `payment_events` ودوالها الأربع · تعطيل بوابة الاختبار وفحص العملة |
| `0022_analytics` · `0023_analytics_funnel` | ١٠ | `funnel_events` (بلا PII) + `redirects` + **سبعة عروض** `v_stats_*` + `analytics_admin_allowed()` + `stats_delta()` + `section_stats()` + `funnel_daily()` + `funnel_summary()` + `prune_funnel_events()` + مساعدتا الصفوف `stats_content_rows()` و`stats_locales_rows()` + بذر مفتاح `integrations` · **تصحيح نموذج القمع** إلى سلسلة رباعية من مصدر واحد (‏`0023` يستبدل `funnel_summary` و`funnel_daily`) + `funnel_counts()` الداخلية |
| `0024_discounts` | ١٢أ | `coupons` + `coupon_redemptions` + `promo_banners` + `discount_settings` · **`apply_discount()`** الدالة الوحيدة التي تحسب خصماً في المشروع كله — **وتفرض أرضية الهامش بنفسها وتقلّص الخصم بدل رفضه** (‏`clamped`) فلا يتخطى الحدَّ مستدعٍ ولا محرر SQL · `redeem_coupon()` ذرّياً داخل معاملة `create_booking` · `v_stats_discounts` والقسم الإحصائي **السابع** · توسعة `quote_public()` و`create_booking()` بحقول الخصم |
| `0025_authenticated_hardening` | تصليب يسبق ١٢ب | جردٌ كامل لما يبلغه دور `authenticated` — **أبوابٌ مفتوحة اليوم لمتعهدي البورتال لا في المستقبل**، لأن `profiles.role` افتراضها `'customer'` منذ `0001` فـ **D-20 يفرضها غياب باب تسجيل عام لا حرفٌ في القاعدة**. أهمها [حرج] `available_payment_accounts` كانت تعيد لكل مسجَّل أرقام المحافظ وحدود الاستقبال — **وفرقُ الحدود بين يومين هو الإيراد اليومي للمنصة** — فصار الحارس **داخل جسم الدالة** (‏`finance_admin_allowed()`) لأن شاشة اللوحة تناديها بجلسة المستخدم · وأربع سياسات `using (true)` كانت تُري المسجَّل ما يُحجب عن الزائر (صفحات غير منشورة · أقسام مخفية · فئات معطَّلة · لغات غير مفعّلة) · و`dispatch_ops_allowed` كانت تفحص `current_user` داخل `security definer` — وهو **مالك الدالة لا المستدعي** ⇒ `true` لكل من بلغها |
| `0026_phone_normalization` | الدفعة ١ | `normalize_phone()` بشكل معياري محسوم (‏`01XXXXXXXXX`، والرقم الأجنبي **لا يُخمَّن** بل يُعاد كما هو) + **`bookings.phone_norm` عمود مولَّد مخزَّن** بفهرسه (ومسار احتياطي بمُشغّل حين تتعذّر الأعمدة المولَّدة) + فهرس على `coupon_redemptions` + إعادة بناء هوية العميل في `v_stats_customers` و`section_stats('customers')` و`apply_discount` و`redeem_coupon`. **قبله كان `01012345678` و`+201012345678` أربعة عملاء مختلفين** ⇒ «العميل العائد» كذبة، وسقف الكوبون لكل عميل يُخترق بإضافة `+2` |
| `0027_batch_two` · `0028_batch_two_hardening` | الدفعة ٢ | **٠٢٧:** `trip_settings` + `trip_config()` + `cancel_stale_bookings()` · عمودا `payments` الجديدان والحجب **داخل `get_booking_by_token`** + `admin_attach_receipt()` + `set_receipt_visibility()` · `partner_credit_settings` + `partner_credit_config()` + `partner_debt()` + `partner_over_debt_limit()` + **مُشغّلا جدول** على `trip_offers` و`partner_payouts` + `manual_assign_over_limit()` + `record_partner_payout_advance()` + عمودان مُلحقان بـ `v_partner_settlements` · `booking_lookup_attempts` + `find_booking_by_reference()`. **٠٢٨ (تصليب بعد مراجعتين):** `partner_trip_code()` بدل مرجع العميل في `portal_offers`/`portal_trips` (**العيب الحرج** — D-46) · الكنس يستثني نشاط الإيصالات ولنافذة سماح البوابة **أرضية ساعة** · سحب صلاحية `trip_offers_guard_accept()` |

> **`0028` أوضح مثال حيّ على D-03:** `0027` كانت مطبَّقة حين أمسكت المراجعتان عيوبها، فذهب العلاج كله إلى ملف جديد ولم يُعدَّل حرفٌ في المطبَّق.

---

## ٨) اللغات — كيف تعمل فعلاً

| القطعة | أين | الدور |
|---|---|---|
| فهرس اللغات | `i18n/config.ts` ← `LOCALE_CATALOG` | ar · en · fr · de · it · es · ru (الاسم والاتجاه و`htmlLang` و`ogLocale`) |
| لغات التوجيه | `NEXT_PUBLIC_SITE_LOCALES` ← `resolveRoutingLocales()` (`config.ts:110`) | ما **يعرف الوسيط توجيهه**. الافتراضي المشحون `ar,en`. لغة تُفعَّل من اللوحة ولا تُذكر هنا: `/fr/...` لا يعمل |
| نصوص المستودع | `messages/ar.json` · `messages/en.json` | نصوص الواجهة الثابتة |
| نصوص القاعدة | جدولا `locales` و`translations` | محتوى الأقسام والصفحات — مسودة ← مراجعة ← نشر |
| الإعلان للعالم | `enabled_locales()` (هجرة 0019) | لا تظهر لغة في hreflang/sitemap قبل أن يكون فيها **نص منشور فعلاً** |
| الترجمة الآلية | `lib/i18n/mt/` (`mymemory` افتراضاً · `deepl` · `google` · `off`) | مسودات فقط — **لا نشر تلقائي** |

---

## ٩) الإشعارات — نمط Outbox

```
حدث (حجز/دفع/إسناد/تصعيد)
   ↓ صف في جدول `notifications`  ← مصدر الحقيقة الوحيد
   ↓ عامل الإرسال: lib/notifications/dispatch.ts
   ├─ جرس اللوحة (Realtime)  — يعمل دائماً
   ├─ تليجرام  lib/notifications/telegram.ts  — يحتاج TELEGRAM_BOT_TOKEN + chatId في اللوحة
   └─ بريد     lib/notifications/email.ts     — يحتاج RESEND_API_KEY
```

القناة تُرسل حين تجتمع **ثلاثة شروط**: مفعّلة + وجهة مضبوطة + بيانات اعتماد في البيئة — وإلا سُجّل الإشعار «متجاوَز» **بسبب واضح** في `/admin/notifications`. فشل قناة لا يُفقد الحدث.

التشغيل: `/api/notifications/dispatch` (كل دقيقة في `vercel.json`) و`/api/dispatch/tick` (كل ٥ دقائق)، وكلاهما محروس بـ `lib/dispatch/guard.ts`: مفتاح `NOTIFY_DISPATCH_KEY` أو `CRON_SECRET`، والاستثناء الوحيد طلب محلي خارج الإنتاج. **في الإنتاج بلا مفتاح: مقفل لا مفتوح.**

> جدولة `pg_cron` **اختيارية وزائدة**: هجرة `0013` تحاول جدولة `dispatch_tick()` كل ٥ دقائق إن كانت الإضافة موجودة، وتتخطاها بإشعار إن لم تكن — و`0027` تفعل الشيء نفسه لـ `cancel_stale_bookings()` كل ١٥ دقيقة. المسار الرسمي يبقى `/api/dispatch/tick`.

> **ومنذ الدفعة ٢ تحمل دورةُ البث عملاً ثانياً:** كنس الطلبات غير المدفوعة بعد **نجاح** الدورة (لا مسار ثانٍ ولا سرّ ثانٍ ولا جدولة تُنسى). عدّاداته `(scanned, cancelled, failed)` تظهر في المفتاح `sweep` من الرد **ولا تغيّر رمز حالته** — كنسٌ فشل لا يجعل دورة بثٍّ نجحت تبدو فاشلة للمهمة المجدولة. والبوابة الحقيقية في القاعدة: المفتاح مطفأ ⇒ أصفار بهدوء.

---

## ١٠) بوابات الدفع

```
/api/payments/start        → lib/payments/registry.ts → المحوّل → create_payment_intent()
   ↓ تحويل العميل إلى البوابة
/api/payments/webhook/[provider]  ← مصدر الحقيقة
   ↓ تحقق توقيع إلزامي (فاسد ⇒ ٤٠٠ بلا أثر) → settle_payment_intent() → قيد دفتر → بث
/payment/return/[intentId] ← صفحة عرض فقط، لا تؤكد شيئاً
```

- المحوّلات: `lib/payments/providers/` — `paymob` · `stripe` · `paypal` · `twocheckout` · `binancepay` · `nowpayments` (**ستة حقيقية خامدة**) + `test` (مدمج، **معطَّل بالبذرة** وخلفه `ALLOW_TEST_PAYMENTS`).
- **المفاتيح السرّية في البيئة لا في القاعدة**؛ اللوحة تحمل التفعيل والترتيب والمعرّفات العامة فقط.
- الإحكام بمعرّف الحدث: نفس الـ webhook ثلاث مرات ⇒ صف تحصيل واحد وقيد واحد.

---

## ١١) المحتوى — نموذج الأقسام

كل صفحة عامة = صف في `pages` + أقسام مرتّبة في `sections` بمحتوى **JSONB**. سجل الأنواع في `lib/content-types.ts`، والعارضات في `components/sections/` (`hero` · `services-grid` · `fleet` · `features` · `why-us` · `faq` · `cta-band` · `rich-text` · `contact` · `page-hero`) ويوزّعها `render.tsx`.

`lib/default-content.ts` **مرآة افتراضية** تعمل حين لا قاعدة — فيبقى الموقع قابلاً للتصفح على جهاز نظيف بلا مفاتيح. الـ Page Builder (المرحلة ١٣) محرر أغنى **فوق هذه البيانات نفسها** — لا نموذج ثانٍ ولا هجرة محتوى.

---

## ١٢) القياس والإحصائيات — من يكتب ومن يقرأ (المرحلة ١٠)

**المبدأ الحاكم:** أرقام اللوحة تُبنى على جدول **في قاعدتنا** لا على ما تقوله جوجل. مانع إعلانات يُسقط سكربتات جوجل وميتا صامتاً والصفحة تُصيَّر سليمة — ومع ذلك تبقى أرقام `/admin/stats` صحيحة.

### الكتابة — نقطة خروج واحدة

```
حدث تحويل (بحث · عرض · حجز · دفع · طلب سعر · بدء بوابة)
   ↓  lib/analytics/emit.ts        ← نقطة الخروج الوحيدة، ولا ترمي استثناءً أبداً
   ↓  after() من next/server       ← بعد إرسال الرد، فلا يدفع الزائر ثمن القياس
   ├─ صف في public.funnel_events   ← دائماً وأولاً، بمفتاح الخدمة (admin.ts)
   └─ Meta CAPI (خادمية)           ← booking_paid وحده، وبشرط التفعيل ووجود التوكن
```

| البند | التفصيل |
|---|---|
| **مَن يكتب** | `app/api/quote/route.ts` (‏`search_performed` + `quote_viewed`) · `app/api/booking/route.ts` (‏`booking_created`) · `app/api/payments/start/route.ts` (‏`booking_started`) · `app/api/payments/webhook/[provider]/route.ts` و`app/admin/orders/[id]/actions.ts` (‏`booking_paid`) · `app/api/quote-request/route.ts` (‏`quote_requested`) |
| **بأي هوية** | **`service_role` حصراً** عبر `lib/supabase/admin.ts`. `anon` و`authenticated` بلا `INSERT` على `funnel_events` إطلاقاً — منحةٌ سابقة بـ `with check (true)` كانت تتيح لأي زائر تسميم أرقام المالك وتضخيم الجدول |
| **ماذا يُكتب** | خمسة أعمدة لا سادس لها: `event, reference, class_slug, value, currency`. **صفر PII وصفر أرقام داخلية** — لا اسم ولا هاتف ولا `public_token` (وهو مفتاح وصول للحجز) ولا هوية متعهد ولا تكلفته ولا هامش الموقع |
| **لا يُفشل الطلب أبداً** | كل مسار داخل `try/catch`، بما فيه **غياب الجدول نفسه** (قاعدة لم تُطبَّق عليها 0022: الرمز `42P01` أو `PGRST205` يُبتلع بهدوء) |
| **نظير المتصفح** | `lib/analytics/browser.ts` يطلق نفس الأحداث إلى GA4 وبكسل ميتا من جلسة الزائر — **لا يمكن إطلاقها من الخادم** لأنها تعيش في المتصفح. جدول ترجمة الأسماء مشترك بين الطرفين في `lib/analytics/events.ts` فلا ينحرف اسم بين القناتين |

### نموذج القمع — سلسلة واحدة من مصدر واحد (هجرة 0023)

`search_performed` → `quote_viewed` → `booking_created` → `booking_paid`، **كلها من `funnel_events` وحده**. و`quote_requested` و`booking_started` يُعرضان **خارج السلسلة** بعدّادهما وحده و`rate_percent = null` و`in_chain = false` (الأول مسار دخول موازٍ، والثاني لا يقع إلا على مسار البوابة الإلكترونية والافتراضي في المنصة تحويل بنكي). والعدّ يدمج بالمرجع — `count(*) filter (where reference is null) + count(distinct reference)` — فالويبهوك المكرر لا يضخّم رقماً.

> **حدّ معرفي لا عطل:** القمع يقيس **الرحلة على الموقع** لا إجمالي أعمال الشركة. الأرقام المرجعية للحجوزات والتحصيل مكانها قسم الطلبات وقسم الخزينة، والفارق بينهما ليس عطلاً. خلطُ الاثنين هو بالضبط ما أنتج «معدل تحول > ١٠٠٪» في 0022.

### حارس الأسطح — أين يقع وكيف يفشل

`app/layout.tsx` هو **الجذر الوحيد** في المشروع: لا `<html>` في `app/admin/layout.tsx` ولا في `app/portal/layout.tsx`، فكل شاشة إدارية أو بورتالية تُصيَّر داخله. وحقنُ الوسوم بلا فحص مسار كان يرفع إلى مايكروسوفت إعادةَ تشغيل جلسة فيها بيانات العميل وتكلفة المتعهد.

الحارس في `lib/analytics/tags.tsx` ← `isMeasurableSurface()`:
- يقرأ ترويسة `x-pathname` التي يضبطها `proxy.ts` بالمسار **الأصلي**، **ويفشل مغلقاً**: لا ترويسة ⇒ لا وسم.
- **يقشر بادئة اللغة أولاً** ثم يرفض `/admin` و`/portal` و`/api` — وإلا صار `/en/admin` ثغرة في الحارس (نفس منطق D-22).
- ولا خدمة مضبوطة ومفعّلة ⇒ يرجع `null` كاملاً: **صفر سكربت وصفر طلب لجهة خارجية**، لا «سكربت فارغ».
- وسما التحقق (Search Console وBing) ليسا هنا: مكانهما `<head>` عبر `metadata.verification` في `app/layout.tsx`.

### القراءة — من العروض والدوال إلى الشاشات

| الطبقة | التفصيل |
|---|---|
| الحارس | `analytics_admin_allowed()` — **مطابق حرفياً** لـ `finance_admin_allowed()` و`i18n_admin_allowed()`: مشرف أو عميل خدمة أو اتصال مالك القاعدة، **ويفشل مغلقاً** لكل ما عداهم. أول سطر في كل دالة إحصائية |
| العروض السبعة | `v_stats_orders` · `v_stats_dispatch` · `v_stats_partners` · `v_stats_treasury` · `v_stats_customers` · `v_stats_content` · `v_stats_locales` — كلها `security_invoker = true` فوق جداول سياستها `is_admin()`، فالمتعهد يرى **صفر صف** لا أرقاماً جزئية (والرقم الجزئي أخطر من الرفض لأنه يبدو صحيحاً). ولا عمود تكلفة متعهد ولا هامش ولا بيانات عميل في نوع الإرجاع أصلاً |
| الدوال | `section_stats(section, from, to)` تُغذّي بطاقات كل قسم · `funnel_daily(from, to)` السلاسل الزمنية · `funnel_summary(from, to)` مراحل القمع · `funnel_counts()` داخلية · `stats_delta()` التغيّر النسبي **بـ `null` لا صفر** حين لا مقارنة ممكنة · `prune_funnel_events(days)` التقليم (بلا مستدعٍ اليوم — `OPEN_TASKS.md`) |
| طبقة القراءة | `lib/stats/read.ts` وحدها تستدعي كل ما سبق (‏`rpc` للدوال و`from()` للعروض) وتصنّف الفشل؛ و`lib/stats/format.ts` **تنسيق محض** — لا حساب — بما فيه اتجاه سهم التغيّر **وقطبيته** (تدهور لا يظهر بالأخضر) |
| الشاشات | `/admin/stats` + ست شاشات قسم، تبني كلها فوق `components/stats/section-screen.tsx` برسوم **SVG مكتوبة يدوياً — لا مكتبة رسوم في المشروع** |

### التحويلات والسيو

جدول `redirects` يُدار من `/admin/seo/redirects`، ويقرؤه `proxy.ts` عبر `lib/seo/redirects.ts`: فهرس مبني مرة و**مُذاكَر ٣٠ ثانية داخل العملية** (لا استعلام على كل طلب)، بسقف قفزات، ويتخطى `/admin` و`/portal` و`/api` والأصول قبل أي قراءة قاعدة. `lib/seo/validate.ts` ترفض الحلقة والتعارض والتحويل فوق مسار حيّ قبل الحفظ. وبطاقات مركز السيو الثلاث تقرأ `v_stats_content` — المحروس بـ `is_admin()` وحدها، فدور `ops` يرى «—» (قرار أمني معلَّق في `OPEN_TASKS.md`).

---

## ١٣) ما **لا** يوجد في هذا المستودع (لا تبحث عنه)

- لا `middleware.ts` — الاسم `proxy.ts`.
- لا اختبارات JavaScript/TypeScript ولا Jest/Vitest/Playwright — الاختبارات **SQL** في `supabase/tests/` وتعمل على القاعدة الحية.
- لا Docker ولا docker-compose ولا Postgres محلي ولا Supabase CLI.
- لا CI/CD ولا GitHub Actions. ⚠ **وتصحيح لما كان مكتوباً هنا:** المشروع **صار له مستودع git خاص** جذره `C:/Users/Badr/OneDrive/Desktop/Tours-01` (منذ 2026-08-12). قبل ذلك كان جذر git هو **مجلد المنزل** — ومن ثمّ القاعدة الباقية في `CLAUDE.md`: تحقّق من `git rev-parse --show-toplevel` قبل أي `git add`، وإلا رُفع `.ssh` و`.claude.json`.
- لا Sentry ولا رصد أخطاء — ولا أثر لأيٍّ منهما في المستودع (مؤجَّل ليوم النشر — `OPEN_TASKS.md`).
- **أما النسخ الاحتياطي فموجود**: `pnpm db:backup` و`pnpm db:restore` و`scripts/lib/pg-tools.mjs` و`docs/BACKUP.md` (الدفعة ١). المفتوح شقّان: **الجدولة** (تنتظر النشر) و**الوجهة البعيدة** (لم يخترها المالك بين FTP وOneDrive وGoogle Drive). ولا تكامل مضمَّن مع أي مزوّد **عمداً**، و`db-restore.mjs` **يرفض العمل خارج طرفية تفاعلية** فلا تنطلق استعادةٌ من جدولة بالخطأ.
- لا `tenant_id` ولا أي أثر لتعدد المستأجرين — الـ whitelabel نسخة كاملة لكل علامة.
- لا مكتبة رسوم بيانية (‏Chart.js/Recharts/D3) — كل رسوم `/admin/stats` **SVG مكتوب يدوياً** في `components/stats/`.
- `README.md` صار ملفاً حقيقياً بالعربية — لكن التوثيق العميق يبقى في `docs/` و`handover/`.

</div>
