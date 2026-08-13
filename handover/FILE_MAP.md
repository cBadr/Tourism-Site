<div dir="rtl">

# خريطة الملفات — أين يوجد كل شيء

> مرجع يُفتح عند الحاجة، لا يُقرأ تتابعاً. الجذر: `C:/Users/Badr/OneDrive/Desktop/Tours-01`.
> **ابدأ دائماً من ملف العقد** `lib/*-types.ts` قبل الهجرة، وقبل الواجهة.

---

## ١) ملفات العقود — أول ما تفتحه في أي مهمة

كل ملف منها يحمل **ترويسة عربية** تشرح القرار ومبرره وتواقيع دوال SQL. هي المرجع الأوحد لأسماء الجداول والدوال والحقول.

| الملف | المرحلة | يغطي |
|---|---|---|
| `lib/content-types.ts` | ٢ | أنواع الأقسام وأشكال الـ JSONB — سجل الأنواع كله |
| `lib/pricing-types.ts` | ٣ | قاعدة الأهلية · توقيع `quote_price` · **معادلة السعر كاملة** · أنواع الجيوكودنج والمسافة |
| `lib/booking-types.ts` | ٤ | آلة حالات الحجز · خطة الدفع · وسائل التحويل المحلية · قواعد مكافحة التلاعب |
| `lib/subcontractor-types.ts` | ٥ | **قاعدة الدمج** · التغطية بنقطتين ونطاق · حالات المتعهد وقوائم الأسعار |
| `lib/dispatch-types.ts` | ٦ | الموجات وسقوفها · حالات العرض والدورة · **قرار خصوصية العميل قبل القبول** |
| `lib/finance-types.ts` | ٧ | الالتواء المحاسبي · مصادر القيد · أنواع حسابات الخزينة |
| `lib/i18n-types.ts` | ٨ | قرار «العربية بلا بادئة» · قرار «اللوحة عربية فقط» · أنواع الترجمة |
| `lib/payments-types.ts` | ٩ | المزوّدون · شكل الصفوف · **القواعد الأربع** (السعر من الخادم، الـ webhook مصدر الحقيقة، التوقيع، الإحكام) |
| `lib/analytics-types.ts` | ١٠ | الخدمات السبع وأنماط معرّفاتها · أحداث القمع الستة و`FunnelPayload` · عقد `StatCard`/`StatSeries` · شكل `funnel_events` · **قاعدة صفر PII**. ⚠ تعليق التواقيع فيه يذكر `section_stats` و`funnel_daily` ولا يذكر `funnel_summary` ولا `funnel_counts` — فجوة موثَّقة في `OPEN_TASKS.md` |
| `lib/agent-types.ts` | ١١ | وكيل الذكاء الاصطناعي — **مكتوب ولم يُنفَّذ**: المزوّدون والسقوف وإطار «وضعان لكل قدرة» وسجل الإجراءات (D-37) |
| `lib/discount-types.ts` | ١٢أ | الكوبونات وبانرات العروض و`discount_settings` · توقيع `apply_discount` وقاعدة **تقليص الخصم لا رفضه** عند أرضية الهامش |
| `lib/extras-types.ts` | الدفعة ٣ | **منفَّذ** بالهجرات `0031`–`0033`: تاريخ العودة واشتقاق الانتظار (‏`MAX_DERIVED_WAITING_HOURS`) · الحقائب (`VehicleClassLuggage`) · الخدمات الإضافية (`ExtraServiceRow` · `BookingExtraRow` · `ExtraSelection`). وفيه ثلاثة قرارات حسمها بدر نصاً — أهمها أن **الخدمة طبقةٌ بعد الذروة وخارج أساس الهامش والخصم** (D-54 · D-55 · D-56)، وبها صارت الجراحة إضافةً لا إعادة ترتيب |

> **اثنا عشر ملفاً لا تسعة.** وثلاثة منها وسّعتها الدفعة ٢: `booking-types.ts` (‏`TripSettings` · `ReceiptStatus`/`PaymentReceiptRow` · `BookingLookupErrorCode`) · `finance-types.ts` (‏`PartnerCreditSettings`) · `dispatch-types.ts` (رمز المتعهد بدل مرجع العميل، السطر ٧٧).
>
> **ووسّع التحصيلُ من المتعهد `finance-types.ts` مرة أخرى** (‏`0029`): `PartnerSettlementRole` بأربعة أدوار · `LedgerSource` بمصدر سابع `partner_settlement` · `PartnerSettlementReceiptRow` · `received` في `PartnerSettlement` · `settlement` في `PartnerStatementLine.kind` · وتواقيع `record_partner_settlement` و`portal_balance`.
>
> ⚠ **وفيه بندٌ متأخّر عن الواقع:** تعليق التواقيع يصف `portal_balance()` بأنها تُرجع `debt_limit` — **وقد أُسقط في `0030`** (D-53)، ولا تقرؤه أي واجهة. تصحيحه في أول تعديل يلمس الملف؛ ومَن يقرؤه اليوم فليقرأ `0030` معه.
>
> ⚠ **وبندٌ ثانٍ من الدفعة ٣: `pricing-types.ts` و`booking-types.ts` لم يُوسَّعا.** العقد الملزم للدفعة كان `extras-types.ts` وحده، فالتواقيع المكتوبة في الملفَّين الآخرين **بلا الوسائط الجديدة** (`p_luggage` · `p_extras` · `p_return_at`) — ومن يقرؤهما اليوم يظن الوسائط غير موجودة. والحقول الجديدة للطلب والرد مُوصَّفة **توسعةً** في `components/booking/extras.ts`، وكل نوع فيها مبنيٌّ بـ`&` أو `Pick` من نوع العقد فينكسر البناء إن انحرفا. **بند تسليم مكتوب في ترويسة ذلك الملف وفي `OPEN_TASKS.md` ج.**

---

## ٢) قاعدة البيانات

| المسار | ماذا فيه |
|---|---|
| `supabase/migrations/0001…0033*.sql` | **٣٣ ترحيلاً** مطبَّقاً، **والرقم الحر التالي `0034`** — خريطتها بالمرحلة في `ARCHITECTURE.md` القسم ٧. والثلاثة الأخيرة: `0031_trip_extras.sql` (‏`extra_services` و`booking_extras` · `public_extras` و`price_extras` و`derive_waiting_hours` · `luggage_capacity` · إعادة تعريف الأعضاء الثلاثة وإسقاط تواقيعها القديمة صراحةً) و`0032_trip_extras_hardening.sql` (إعادة اشتقاق `0014` إلى `dispatch_ceiling` — **الانحدار الحرج، D-58** · ملء سعة الحقائب رجعياً · مُشغّل ساق العودة · سحب غلافَي `quote_price`) و`0033_real_margin_extras.sql` (‏`realMargin` لا يعدّ الخدمات هامشاً في `accept_offer` و`manual_assign`) |
| `supabase/tests/*.sql` | **١٦ مجموعة**: `quote` · `booking` · `coverage` · `dispatch` · `finance` · `i18n` · `payment` · `analytics` · `discount` (١٢أ) · `phone` (الدفعة ١) · `trip_settings` · `receipt` · `partner_credit` · `lookup` (الدفعة ٢) · `partner_settlement` (‏`0029`/`0030`) · **`extras`** (الدفعة ٣) |
| `supabase/tests/extras_tests.sql` | ١٬٤٢٣ سطراً. تعمل على **القاعدة الحيّة** فكل كتلة تكتب صفاً — كتالوج خدمات، فئة سيارة، متعهد، حجز — أو تقلب إعداداً عاماً (الذروة · إعدادات الخصم) **تُلغي نفسها** بـ`ROLLBACK_MARKER`، وقسمٌ ختامي يتحقق من ذلك بدل أن يَعِد به. تجهيزتها معزولة عمداً: **إحداثيات صحراوية** (لا قائمة أسعار تغطيها فالتسعير بالتعريفة حتماً) و**فئات بسعة ٦٠+** (لا فئة حقيقية تبلغها فلا تزاحم شيئاً في «أول فئتين»). **ولا رقم محفور في أي تأكيد مالي** — كل متوقَّع يُشتق من `tariffs` و`pricing_settings` و`apply_discount` و`extra_services` نفسها. وأثقل ما تثبّته: **الطبقات** (الخصم على الرحلة وحدها، والذروة لا تمسّ الخدمة)، والأهلية المزدوجة **في العرض وفي الحجز معاً**، والانتظار المشتق **أرضيةً لا استبدالاً** |
| `supabase/tests/partner_settlement_tests.sql` | ١٬٥٣٢ سطراً، و**كل كتلة تكتب قيداً تُرجِع نفسها** بـ `raise exception 'ROLLBACK_MARKER'` داخل كتلة استثناء (نقطة حفظ ضمنية) — لأنها تعمل على قاعدة بدر الحيّة بدفترها الحقيقي، وقسمٌ خاص يبرهن أن الإرجاع وقع فعلاً. والمتعهدان والحسابان من صنعها وحدها بوسم `PARTNER_SETTLEMENT_FIXTURE`. **ولا تمسّ `partner_credit_settings` إطلاقاً** |
| `supabase/README.md` | دليل الربط خطوة بخطوة + **الفخّان الشائعان**: مصدرا صلاحيات `anon`، و«`UPDATE` ينجح بصفر صفوف» |
| `scripts/db-migrate.mjs` | `pnpm db:migrate` (+ `--upto 0015`) — نواة أداة الـ Whitelabel لاحقاً |
| `scripts/db-test.mjs` | `pnpm db:test [filter]` |
| `scripts/db-backup.mjs` · `scripts/db-restore.mjs` | `pnpm db:backup` / `pnpm db:restore` (الدفعة ١) — الدليل الكامل `docs/BACKUP.md`. **الجدولة والوجهة البعيدة مفتوحتان** (`OPEN_TASKS.md` ج) |
| `scripts/lib/pg-tools.mjs` | الوحدة المشتركة بين النسخ والاستعادة: إيجاد `pg_dump`/`pg_restore` على الجهاز وفحص إصدارهما وتحويل `DATABASE_URL` إلى متغيرات بيئة. **نسخة واحدة عمداً** — تكرارها يعني إصلاح عيب في أحد الملفين وبقاءه في الآخر، وأداة الطوارئ لا تحتمل ذلك |

---

## ٣) الموقع العام

| المسار | الصفحة |
|---|---|
| `app/page.tsx` | الرئيسية (أقسام من القاعدة) |
| `app/[slug]/page.tsx` | الصفحات الحرة والقانونية — **وُلد لأن صفحات الثقة كانت ٤٠٤** |
| `app/services/[slug]/page.tsx` · `app/routes/[slug]/page.tsx` · `app/about/page.tsx` | الخدمات · المسارات · من نحن (بميتاداتا وFAQ JSON-LD) |
| `app/book/page.tsx` | محرك الحجز (الويدجت + العروض + السداد) |
| `app/booking/[token]/page.tsx` | متابعة الحجز برابط توكن — بلا حساب. ومنذ الدفعة ٢ **يعرض قسم الإيصالات** المصفوفة التي كانت تصل في الحمولة ولا تُصيَّر. ومنذ الدفعة ٣ **يعرض تفصيل الخدمات وتاريخ العودة وعدد الحقائب**: كل رقم مقروء من اللقطة (`trip.extrasTotal` وسطور الخدمات بأسعار لحظة الحجز) **لا مجموعاً في الصفحة**، وسطرٌ صريح يقول إن الخصم وقع على الرحلة وحدها |
| `app/track/` (`page.tsx` + `actions.ts`) | **«تابع حجزك»** (الدفعة ٢): مرجع + هاتف ⇒ التوكن. مسارها الجذر `/track` لا `/booking/track` لأن بادئة `/booking` محجوزة كاملةً في `lib/seo/site-paths.ts`. **مفهرَسة عمداً** بخلاف `/booking/[token]` (تلك noindex): من أغلق التبويب يبحث في جوجل قبل أن يبحث في الموقع. والإجراء بمفتاح الخدمة — الدالة غير ممنوحة لأي دور مستخدم (D-48) |
| `app/quote-request/page.tsx` | «اطلب عرض سعر» لما هو خارج التسعير الفوري |
| `app/payment/return/[intentId]/page.tsx` | صفحة العودة من البوابة — **عرض فقط، لا تؤكد شيئاً** |
| `app/layout.tsx` · `app/robots.ts` · `app/sitemap.ts` · `app/manifest.ts` | الجذر و`lang`/`dir` وسباكة السيو |

**مكوّنات العرض:** `components/sections/` (عارضات الأقسام + `render.tsx` الموزِّع) · `components/site/` (الترويسة، التذييل، البطل، الخدمات، الأسطول، التواصل، **`links.ts`** بـ `bookingHref()`/`contactHref()` وبند «تابع حجزك» في التنقل، مبدّل اللغة) · `components/booking/` (`search-widget.tsx` · `offers.tsx` · `booking-widget.tsx` · `coupon-field.tsx` · `promo-banner.tsx` · `format.ts` **تنسيق محض** · `checkout/` — **وثلاثة من الدفعة ٣**: `extras-catalog.ts` قارئ `public_extras()` على الخادم بـ`cache` مرة لكل طلب و**الفشل يقع فارغاً** فلا تظهر الميزة أصلاً · `extras.ts` أنواع سطح الحجز الجديدة **توسعةً** فوق أنواع العقد + `estimateWaitingHours` **للعرض وحده ولا تُرسَل** · `extras-picker.tsx` قائمة الخدمات في الويدجت — **رمزٌ وكمية فقط، و`maxQty` فيه مرآة لا حارس** لأن القصّ الحقيقي في `price_extras`، وكتالوجٌ فارغ **لا يعرض شيئاً إطلاقاً** لا عنواناً ولا سطر «لا توجد خدمات») · `components/seo/JsonLd.tsx` (‏**أُصلحت لغته في الدفعة ١** — كان ينادي الإعدادات بلا وسيط لغة فيقرأ جوجل اسم النشاط بالعربية على الصفحة الإنجليزية) · `components/shared/HelpTip.tsx` · `components/ui/` (‏`button` · `card` · `badge` · `input` · `label` · `separator` · **`kpi-card.tsx`** المضافة في الدفعة ١ لتوحيد بطاقات المؤشرات).

**والأصل الوحيد المضاف للعلامة:** `public/brand/og-default.png` — صورة Open Graph الافتراضية (الدفعة ١).

---

## ٤) اللوحة `/admin`

| القسم | المسار | يدير |
|---|---|---|
| لوحة القيادة | `app/admin/page.tsx` | مؤشرات سريعة — **صورة اليوم** |
| الإحصائيات | `app/admin/stats/` + ست شاشات فرعية: `orders` · `partners` · `treasury` · `customers` · `content` · `locales` | **اتجاه الفترة** لكل قسم. الصفحة الجذر شاشة عامة + قمع؛ لا `actions.ts` لأنها قراءة محضة |
| الربط الخارجي | `app/admin/integrations/` (+ `actions.ts` و`_components/integrations-ui.tsx`) | معرّفات الخدمات السبع وتفعيلها ومؤشر حالتها |
| مركز السيو | `app/admin/seo/` (`page.tsx` + `actions.ts` + `_components/{seo-ui,meta-fields}.tsx`) · `seo/audit/page.tsx` (قراءة محضة، بلا `actions.ts`) · `seo/redirects/` (`page.tsx` + `actions.ts` + `loader.ts`) | محرر ميتاداتا جماعي · مدير التحويلات · فحص البيانات المهيكلة |
| الطلبات | `app/admin/orders/` (+ `[id]/actions.ts` و`[id]/dispatch-actions.ts` و`[id]/_components/`) | الحجوزات، تحقق الإيصالات، الإسناد اليدوي. **والدفعة ٢ أضافت هنا:** نموذج رفع الإيصال نيابة عن العميل ومفتاح ظهور لكل إيصال (`admin_attach_receipt` · `set_receipt_visibility`) · الإسناد فوق سقف الدين (`manual_assign_over_limit`) · عرض **رمز المتعهد** `partner_trip_code` كي يشترك التشغيل والمتعهد في معرّف واحد (D-46). **والدفعة ٣ أضافت:** بطاقة تفصيل الخدمات من `booking_extras` (كل رقم **مقروء من اللقطة** لا محسوباً، وغيابُ الجدول يُعرض رسالةً لا صفراً)، وتاريخ العودة وعدد الحقائب ووسمُ «الانتظار مشتق» من لقطة `trip` |
| البث | `app/admin/dispatch/` | إعدادات الموجات والطابور اليدوي |
| المتعهدون | `app/admin/subcontractors/` (+ `[id]` و`reviews`) | الاعتماد، الملفات، مراجعة قوائم الأسعار |
| المالية | `app/admin/finance/` (+ `treasury` · `expenses` · `partners/[id]` · **`partners/_components/`**) | الخزينة، المصروفات، كشوف المتعهدين والمقاصة. و`partners/_components/` ثلاثة ملفات: **`credit-card.tsx`** (بطاقة سقف الديون — الجدول الغائب يظهر كرسالة «نفِّذ هجرة 0027» لا كصفر) · **`payout-forms.tsx`** (فرع الدفع: نموذج الدفعة + المقدَّم الصريح `record_partner_payout_advance`، وفيه النوعان المشتركان `Settlement` و`CarriedValues`) · **`settlement-forms.tsx`** (فرع التحصيل، `0029`: `CollectionForm` + `SettlementReceipt` بعد الحفظ + `UnknownDirectionCard` حين يتعذّر قراءة الصافي) |
| الخصومات | `app/admin/discounts/` (+ `[id]` · `banners/` · `actions.ts` · `input.ts` · `loader.ts` · `_components/fields.tsx`) | الكوبونات وبانرات العروض وإعدادات الخصم (المرحلة ١٢أ، هجرة `0024`) |
| التسعير والأسطول | `app/admin/pricing/` · `app/admin/fleet/` | التعريفات والهامش والذروة · الفئات والسعات. **والدفعة ٣ أضافت هنا `luggage_capacity`** — حقلٌ **لا يُعرض إلا إذا كان العمود موجوداً فعلاً** (يُستدل من الصفوف المقروءة نفسها)، وحقلٌ غائب عن النموذج **لا يُكتب العمود إطلاقاً** فلا تُطمس قيمةٌ بافتراضٍ من عندنا |
| **الخدمات الإضافية** | `app/admin/extras/` (`page.tsx` + `actions.ts`) | كتالوج `extra_services`: اسم ورمز ووصف وسعر وحدة و`max_qty` وترتيب ومفتاح تفعيل (الدفعة ٣، هجرة `0031`). **يخرج فارغاً بقرار** والشاشة تقول ذلك ولا تدّعي صفوفاً · **لا حساب مالي فيه**: يكتب سعر الوحدة، والضرب والجمع في `price_extras` و`create_booking` · و**الحذف مقابل الإطفاء**: `booking_extras.extra_id` بـ`on delete restrict`، فلا نستبق القاعدة بعدٍّ مسبق — نُنفّذ الحذف ونلتقط `23503` ونقول للمالك إن الإطفاء هو ما يريده (مصدر قرارٍ واحد لا اثنان ينحرفان) · وموضعه في القائمة الجانبية **بين التسعير والخصومات** بتعليل مكتوب: الخدمة مكوّنٌ من مكوّنات السعر لا طبقة تسويق |
| المحتوى | `app/admin/content/` (+ `new` · `[id]` · `loader.ts`) | الصفحات والأقسام |
| اللغات | `app/admin/languages/` (+ `[locale]`) | التفعيل والترجمة وطابور المراجعة |
| المدفوعات | `app/admin/payments/` · `app/admin/payment-accounts/` | البوابات · المحافظ وانستا باي وحدودها |
| الإشعارات | `app/admin/notifications/` | حالة القنوات + تشغيل العامل يدوياً |
| الإعدادات | `app/admin/settings/` (+ **`_components/trip-settings-section.tsx`**) | العلامة والتواصل والدفع و**`notifications.telegramChatId`**. و`_components/`: قسم **«إعدادات الرحلات»** (الدفعة ٢) — **يملك مفتاحَي الإلغاء التلقائي وحدهما** ويعرض كل مقبض رحلات آخر **للقراءة فقط** مع رابط إلى الشاشة التي تملكه، ومعه زرّ الكنس اليدوي. ولإجرائه `saveTripSettings` **مسار مستقل عن `saveSettings`**: ذاك يبني مصفوفة مفاتيح لـ `site_settings` (وحقلٌ يغيب عنها يُحفظ بنجاح ولا يغيّر شيئاً)، وهذان المفتاحان ليسا في `site_settings` أصلاً لأنه **مقروء لـ `anon`** |
| الصيانة | `app/admin/maintenance/` | مفتاح وضع الصيانة |
| طلبات الأسعار | `app/admin/quote-requests/` | نماذج «اطلب عرض سعر» |
| الدخول | `app/admin/login/` · `app/admin/set-password/` | الدخول وضبط كلمة المرور بعد الدعوة |

**النمط:** كل قسم = `page.tsx` + `actions.ts` مجاور + `_components/` للأجزاء التي تحتاج العميل. الشكل القياسي لأي Server Action في `CONVENTIONS.md` القسم ٤، ومرجعه الحي `app/admin/pricing/actions.ts`.

**مكوّنات الإحصائيات** (مشتركة بين الشاشات الست): `components/stats/` — `stats-ui.tsx` · `section-screen.tsx` (الهيكل الموحّد لأي شاشة قسم) · `stat-cards.tsx` · `stat-chart.tsx` · `stat-bars.tsx` · `stat-funnel.tsx` · `stat-range.tsx`. **كل الرسوم SVG مكتوبة يدوياً — لا مكتبة رسوم في المشروع إطلاقاً.**

---

## ٥) بورتال المتعهدين `/portal`

| المسار | الصفحة |
|---|---|
| `app/portal/page.tsx` | العروض المعروضة عليه الآن + **بطاقة «حسابك مع المنصة»** (‏`0029`) |
| `app/portal/_lib/balance.ts` | قراءة `portal_balance()` **بلا حمولة** — ثلاث حالات لا اثنتان: `hidden` (قاعدة قبل `0029` أو لا صف ⇒ لا بطاقة إطلاقاً) · `failed` (عطل ⇒ جملة صريحة) · `ready`. والصافي وحده إلزامي لأنه الإشارة التي تُبنى عليها كل صياغة؛ وبقية الأرقام «—» حين لا تصل — **لا صفر مخترَع في شاشة مال** |
| `app/portal/_components/balance-card.tsx` | مكوّن خادمي بلا حالة: الصافي بعبارته بضمير المخاطب («لك علينا» / «عليك لنا» / «الحساب مصفّى») + الأرقام الأربعة + شريط الحجب. **لا حساب فيه إطلاقاً** — حتى حجم الدين يُقرأ من `owed_to_us` ولا يُشتق بـ `Math.abs`. وصياغة «سدّد **أكثر من** كذا» مقصودة: المبلغ الرافع للحجب يحمل قرشاً زائداً في القاعدة لأن الحجب يقع عند بلوغ الحدّ لا تجاوزه |
| `app/portal/trips/` | رحلاته المُسندة |
| `app/portal/requests/` (+ `data.ts` · `reasons.ts`) | قبول/رفض بأسباب |
| `app/portal/prices/` (+ `[id]`) | قوائم أسعاره وتقديمها للاعتماد |
| `app/portal/fleet/` · `app/portal/profile/` | أسطوله وملفه |
| `app/portal/_lib/{session,data,form}.ts` | الجلسة وقراءة البيانات وأدوات النماذج |

**مكوّناته:** `components/portal/` (`portal-gate` · `portal-nav` · `offer-window` · `place-picker` …) — والمشتركة تبقى هناك، أما `app/portal/_components/` فمجلد **خاص بمسار البورتال الجذر** على نمط `_components` المجاور للصفحة في اللوحة.

---

## ٦) مسارات `/api`

| المسار | الدور |
|---|---|
| `app/api/quote/route.ts` | المسافة ← `quote_public()` ← بطاقات الأسعار (**بلا أرقام داخلية**). ومنذ الدفعة ٣ يمرّر `p_luggage` و`p_extras` (رموزاً وكميات)، **وينادي `derive_waiting_hours` نداءً مستقلاً** فتُعرض الساعات المشتقة قبل الحجز من **نفس الدالة** التي سيحسب بها `create_booking`، ويردّ `rideTotal` و`extrasTotal` و`extras` منفصلةً كي تعرض الشاشة ما تفعله القاعدة حرفياً |
| `app/api/geocode/route.ts` | اقتراحات الأماكن (Nominatim + كاش) |
| `app/api/booking/route.ts` · `booking/receipt` · `booking/settings` | إنشاء الحجز · رفع الإيصال · إعدادات صفحة الدفع. ومنذ الدفعة ٣ يمرّر `p_return_at` و`p_luggage` و`p_extras`. ⚠ **والسقوط على التوقيع القديم مسموح للكوبون وحده**: إسقاط `p_return_at` أو `p_extras` عند فشل النداء يعني حجزاً بلا ما طلبه العميل وبإجمالٍ أقل مما رآه |
| `app/api/quote-request/route.ts` | نموذج طلب عرض السعر |
| `app/api/discount/verify/route.ts` | التحقق من رمز الكوبون (المرحلة ١٢أ) — وخانقه في الذاكرة `lib/discounts/rate-limit.ts` هو نفسه الذي تستعمله `/track` طبقةً أولى |
| `app/api/payments/start/route.ts` | فتح جلسة دفع لدى المزوّد |
| `app/api/payments/webhook/[provider]/route.ts` | **مصدر الحقيقة** — توقيع + إحكام + تسوية |
| `app/api/payments/sandbox/[ref]/route.ts` | صندوق المزوّد الاختباري |
| `app/api/notifications/dispatch/route.ts` | عامل إرسال الإشعارات (كل دقيقة على Vercel) |
| `app/api/dispatch/tick/route.ts` | دورة البث (كل ٥ دقائق) — **ومنذ الدفعة ٢ تحمل عملاً ثانياً**: كنس الطلبات غير المدفوعة بعد **نجاح** البث، وعدّاداته في المفتاح `sweep` من الرد ولا تغيّر رمز حالته. لا مسار ثانٍ ولا سرّ ثانٍ ولا جدولة تُنسى |
| `app/api/i18n/translate/route.ts` | «ترجم الباقي آلياً» — مسودات فقط |

المساران الأخيران في الجدولة محروسان بـ `lib/dispatch/guard.ts`.

---

## ٧) `lib/` — الطبقات المشتركة

| المجلد/الملف | يحوي |
|---|---|
| `lib/supabase/{client,server,admin}.ts` | ثلاثة عملاء: متصفح · خادم بجلسة · `service_role` |
| `lib/geo/{geocode,route,haversine,background}.ts` | الجيوكودنج والمسافات وطبقاتها الأربع والكاش |
| `lib/payments/` | `registry.ts` · `intents.ts` · `credentials.ts` · `crypto.ts` · `webhook-headers.ts` · `amount.ts` · `providers/` (٦ حقيقية + `test`) |
| `lib/dispatch/` | `guard.ts` (حارس المسارات المجدولة) · `start.ts` · `tick.ts` · `settings.ts` (ومنها `isMissingTable`/`isMissingFunction` — تصنيف «الهجرة لم تُنفَّذ» ضد «RLS رفضت»، يقرؤه نصف كود الدفعة ٢) · `messages.ts` |
| `lib/trip-settings.ts` | **الدفعة ٢** — طبقة الخادم لإعدادات الرحلات والكنس. قارئ واحد لمستهلكَين لا ثالث لهما: قسم الإعدادات (بجلسة المشرف) و`/api/dispatch/tick` (بمفتاح الخدمة) — ونسختان كانتا ستفترقان في تطبيع العدّادات وفي معنى «لم تُنفَّذ الدورة». **لا قرار فيه ولا حساب**، و`runStaleSweep` **لا ترمي أبداً** (الفشل في `reason`) |
| `lib/discounts/` | `types.ts` · `settings.ts` · `banners.ts` · `messages.ts` · **`rate-limit.ts`** (خانق في ذاكرة النسخة الواحدة — يُصفَّر مع كل نشر ولا يُشارك بين النسخ، وحدوده مكتوبة بصدق في الملف) |
| `lib/notifications/` | `dispatch.ts` (العامل) · `telegram.ts` · `email.ts` · `render.ts` |
| `lib/i18n/` | `content.ts` + `mt/` (المزوّدون: mymemory · deepl · google) |
| `lib/site-config.ts` · `lib/settings.ts` | **كل قيمة علامة تجارية تمر من هنا** — وقيم `site-config` fallback دائم لا مصدر |
| `lib/content.ts` · `lib/default-content.ts` | قراءة المحتوى من القاعدة · المرآة الافتراضية حين لا قاعدة |
| `lib/seo.ts` · `lib/maintenance.ts` · `lib/utils.ts` | الروابط المطلقة والـ canonical · مفتاح الصيانة · أدوات |
| `lib/analytics/` | `emit.ts` (**نقطة الخروج الوحيدة** لكل حدث قمع — كتابة خادمية بمفتاح الخدمة، ولا ترمي أبداً) · `browser.ts` (‏GA4/Pixel من المتصفح) · `tags.tsx` (حقن الوسوم + **حارس الأسطح** `isMeasurableSurface`) · `meta-capi.ts` · `events.ts` (جدول ترجمة أسماء الأحداث، مشترك بين الخادم والمتصفح) · `services.ts` (سجل الخدمات السبع والتحقق من صيغ المعرّفات) |
| `lib/stats/` | `read.ts` (كل قراءات الإحصائيات: `section_stats` · `funnel_daily` · `funnel_summary` · عروض `v_stats_*`) · `sections.ts` (الأقسام الستة وترتيبها) · `cards.ts` (بناء القمع من الصفوف) · `range.ts` (المدى الزمني بتوقيت القاهرة) · `format.ts` (**تنسيق محض** + اتجاه الدلتا وقطبيتها) |
| `lib/seo/` | `redirects.ts` (فهرس التحويلات + **كاش ٣٠ ثانية داخل العملية** + `resolveRedirect` بسقف قفزات) · `validate.ts` (رفض حلقة/تعارض/مسار حيّ) · `meta.ts` (حدود العنوان والوصف) · `audit.ts` (فحص الصفحات والبيانات المهيكلة) · `site-paths.ts` (المسارات المحجوزة التي يملكها التطبيق) |

---

## ٨) اللغات والوسيط والإعداد

| الملف | الدور |
|---|---|
| `i18n/config.ts` | `LOCALE_CATALOG` (٧ لغات) · `DEFAULT_LOCALE` · `canonicalLocalePath()` · `ROUTING_LOCALES` من `NEXT_PUBLIC_SITE_LOCALES` |
| `i18n/{request,server,messages,locales}.ts` | ربط next-intl وقراءة النصوص |
| `messages/ar.json` · `messages/en.json` | نصوص الواجهة المملوكة للمستودع |
| `proxy.ts` | **الوسيط** (لا `middleware.ts`): صيانة ← **تحويلات السيو** ← لغة ← حارس `/admin`. ويضبط ترويسة `x-pathname` بالمسار **الأصلي** — يقرؤها `app/admin/layout.tsx` وحارس وسوم القياس |
| `vercel.json` | الجدولتان: الإشعارات كل دقيقة · دورة البث كل ٥ دقائق |
| `.env.example` | قالب البيئة — يشمل `DATABASE_URL` بصيغة الـ Session pooler ومتغيرات الترجمة والبوابات (املأ القيم؛ الشرح في `ENVIRONMENT.md`) |
| `AGENTS.md` / `CLAUDE.md` | تحذير: هذه نسخة Next مختلفة — المرجع `node_modules/next/dist/docs/` |

---

## ٩) السكربتات

| السكربت | يفعل |
|---|---|
| `scripts/db-migrate.mjs` | تطبيق الترحيلات وتتبعها |
| `scripts/db-test.mjs` | تشغيل مجموعات SQL على القاعدة الحية |
| `scripts/db-backup.mjs` · `scripts/db-restore.mjs` | `pnpm db:backup` / `pnpm db:restore` (الدفعة ١). **الاستعادة لا تنطلق من جدولة ولا سكربت** — تشترط طرفية تفاعلية وتأكيداً صريحاً. الدليل `docs/BACKUP.md` |
| `scripts/lib/pg-tools.mjs` | المشترك بينهما (إيجاد أدوات Postgres وفحص إصدارها وتحويل `DATABASE_URL`) |
| `scripts/demo-seed.mjs` | `pnpm demo:seed` / `pnpm demo:clean` — **ستة أشهر تشغيل مُحاكاة** مرّت كلها بدوال النظام الحقيقية لا بإدراج صفوف خام، وهي المادة التي راجع عليها بدر المنتج. الوسم `DEMO_SEED`. ⚠ `--clean` **يحذف قيوداً من `ledger_entries`** — الاستثناء الوحيد المصرَّح به لـ D-06، ولا يُستعمل على قاعدة فيها عمل حقيقي |
| `scripts/invite-admin.mjs` | دعوة بريدية + ترقية إلى `admin` |
| `scripts/promote-admin.mjs` | ترقية حساب قائم (آمن للتكرار) |
| `scripts/resend-password-link.mjs` | **رابط `token_hash` مباشر** — لأن فاحصات روابط البريد تستهلك رابط الدعوة |
| `scripts/invite-subcontractor.mjs` | إنشاء متعهد بدور `subcontractor` |
| `scripts/demo-subcontractor.mjs` | سيناريو المرحلة ٥ الحي (`--clean` للتنظيف) |
| `scripts/demo-english.mjs` | تفعيل الإنجليزية بسبع ترجمات منشورة (`--clean` للتنظيف) |

---

## ١٠) التوثيق

| الملف | الدور |
|---|---|
| `docs/VISION.md` | **المصدر الأعلى للحقيقة** — رؤية بدر بصياغته + ملحق القرارات |
| `docs/ROADMAP.md` | ١٤ مرحلة + القرارات المعمارية + **سجل التقدم الحي** |
| `docs/DISPATCH.md` · `docs/FINANCE.md` · `docs/LANGUAGES.md` · `docs/NOTIFICATIONS.md` | أدلة موضوعية للمرحلة ٦ · ٧ · ٨ · ٤ |
| `docs/BACKUP.md` | **دليل النسخ والاستعادة** (الدفعة ١): الأوامر · ماذا يشمل الأرشيف وماذا لا يشمل · إجراء الاستعادة خطوة بخطوة وتبعياتها · الوجهات الممكنة (‏§٨ **الجدولة مؤجَّلة بوعي** لأنها تنتظر النشر) |
| `docs/phase-briefs/` | موجزات المراحل — `PHASE-10.md` · `PHASE-11.md` · `PHASE-12A.md`. الموجز يُكتب **قبل** بدء المرحلة ومعه ملف عقدها |
| `handover/**` | هذه الحزمة |
| `PLAN.md` | **مسودة ملغاة** — لا تُعتمد (مكتوب في أول سطر منها) |
| `README.md` | صار ملفاً حقيقياً بالعربية (‏`b98e53e`) — مدخل المستودع. التوثيق العميق يبقى في `docs/` و`handover/` |

---

## ١١) ملفات لا تُلمس بلا سبب

| الملف/السطر | لماذا |
|---|---|
| `package.json` ← `cross-env NODE_OPTIONS=--max-http-header-size=65536` في `dev` و`start` | حذفه يعيد خطأ **431** على جهاز بدر ولا يظهر على جهاز نظيف |
| كتل `revoke … from anon, authenticated` في كل ترحيل | حذفها **يفتح الجداول** (‏`TRUNCATE` لا يخضع لـ RLS) |
| `set search_path = ''` في كل دالة `definer` | بدونه يمكن خطف اسم جدول داخل دالة تعمل بصلاحيات المالك |
| أي ترحيل **مطبَّق** | التعديل لا يعيد التشغيل — التصحيح ترحيل جديد |
| `public.partner_trip_code(b.id)` في `portal_offers`/`portal_trips` | إعادةُ `b.reference` مكانها تسلّم المتعهد هامشَ المنصة على كل رحلة (D-46). وفحص ذاتي في `0028` يُسقط الهجرة إن عاد المرجع |
| شرط `and p.visible_to_customer` داخل `jsonb_agg` في `get_booking_by_token` | حذفه يُعيد صفوف الإيصالات الداخلية إلى حمولة العميل الخام — والإخفاء في الواجهة ليس إخفاءً |
| مسار «لا نتيجة» في `find_booking_by_reference` (‏`return;` لا `raise`) | تحويله إلى استثناء يُرجع صفَّ العدّاد معه فيُلغي الخانق بلا أن يكسر شيئاً ظاهراً (D-48) |
| توقيع `portal_balance()` **بلا وسيط**، والنداء `rpc("portal_balance")` بلا حمولة | أول وسيط `p_sub` يحوّلها من دالة مقصورة على صاحبها إلى تسريب رصيد كل متعهد لكل متعهد (D-51). وفحصٌ ذاتي في `0030` يعدّ الدوال **بالاسم** ويُسقط الهجرة |
| غياب `debt_limit` من نوع إرجاع `portal_balance()` | إعادته تسلّم كل شريك سقفَ ائتمان المنصة فيجلس تحته (D-53) — ولا يكشفها اختبار لأن كل شيء «يعمل» |
| فحص `p_amount < 0` في `record_partner_adjustment` | حذفه يعيد فخّاً يعمّق الدين بدل أن يخفضه، بصمت وفي عكس نية كاتبه (D-50) |
| `insert into public.trip_settings … default false` وبذرة `debt_limit = 0` | البذر الآمن مقصود: ميزةٌ تلغي حجوزات أو تحجب شركاء لا تُشحن مفعّلة (D-47 · D-45) |
| `apply_discount(v_code, v_q.total, …)` في `quote_public` و`apply_discount(v_code, v_offer.total, …)` في `create_booking` | تمرير الإجمالي **بعد** الخدمات يفعل شيئين معاً: يجعل الكوبون يخصم كرسي الأطفال، **ويجعل أرضية الهامش تعدّ إيراد الخدمات هامشاً** فتسمح بخصمٍ يأكل هامش الرحلة (D-55). وفحصٌ ذاتي في `0031` يُسقط الهجرة إن تغيّر النصّ |
| طرح `booking_extras` في `dispatch_ceiling` و`accept_offer` و`manual_assign` | إعادتها إلى الحساب تشتري للمتعهد سقفاً بمالٍ ليس هامشاً، **وتطلي صفقةً تحت الأرضية بالأخضر** في إشعار الإسناد — و`manual_assign` بلا فحص سقف أصلاً (D-55 · `0032` · `0033`) |
| اشتقاق `margin_type` داخل `dispatch_ceiling` | حذفه — أو نسخ الجسم من `0013` — يعيد عيب «سعر العميل كله سقفاً للموجة الأولى»، أي **تنازلاً تلقائياً عن كل الهامش**. وقع فعلاً في `0031` (D-58). **انسخ الجسم من `pg_get_functiondef` لا من ملف هجرة** |
| مُشغّل `bookings_guard_return_leg` على `bookings` | حذفه يعيد ساقَ عودةٍ مخزَّنة في اللقطة تُعرض للعميل وللتشغيل **ولا يسعّرها شيء** (D-57) |
| غياب `insert`/`update`/`delete` على `booking_extras` لكل دور مستخدم | منحُ أيٍّ منها يجعل اللقطة المجمَّدة قابلة لإعادة الكتابة، فينهار تفسير سعرٍ قديم (نفس مبرر D-10) |
| `on delete restrict` على `booking_extras.extra_id` | تحويله إلى `cascade` يمحو تفسير سعرٍ دفعه عميل بمجرد أن يحذف المالك صفاً من الكتالوج |
| `receipt-test.png` · `receipt-test.txt` في الجذر | مخلّفات اختبار رفع الإيصال — تُحذف قبل النشر لا الآن |

</div>
