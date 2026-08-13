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

---

## ٢) قاعدة البيانات

| المسار | ماذا فيه |
|---|---|
| `supabase/migrations/0001…0021*.sql` | **٢١ ترحيلاً** — خريطتها بالمرحلة في `ARCHITECTURE.md` القسم ٧ |
| `supabase/tests/*.sql` | ٧ مجموعات: `quote` · `booking` · `coverage` · `dispatch` · `finance` · `i18n` · `payment` |
| `supabase/README.md` | دليل الربط خطوة بخطوة + **الفخّان الشائعان**: مصدرا صلاحيات `anon`، و«`UPDATE` ينجح بصفر صفوف» |
| `scripts/db-migrate.mjs` | `pnpm db:migrate` (+ `--upto 0015`) — نواة أداة الـ Whitelabel لاحقاً |
| `scripts/db-test.mjs` | `pnpm db:test [filter]` |

---

## ٣) الموقع العام

| المسار | الصفحة |
|---|---|
| `app/page.tsx` | الرئيسية (أقسام من القاعدة) |
| `app/[slug]/page.tsx` | الصفحات الحرة والقانونية — **وُلد لأن صفحات الثقة كانت ٤٠٤** |
| `app/services/[slug]/page.tsx` · `app/routes/[slug]/page.tsx` · `app/about/page.tsx` | الخدمات · المسارات · من نحن (بميتاداتا وFAQ JSON-LD) |
| `app/book/page.tsx` | محرك الحجز (الويدجت + العروض + السداد) |
| `app/booking/[token]/page.tsx` | متابعة الحجز برابط توكن — بلا حساب |
| `app/quote-request/page.tsx` | «اطلب عرض سعر» لما هو خارج التسعير الفوري |
| `app/payment/return/[intentId]/page.tsx` | صفحة العودة من البوابة — **عرض فقط، لا تؤكد شيئاً** |
| `app/layout.tsx` · `app/robots.ts` · `app/sitemap.ts` · `app/manifest.ts` | الجذر و`lang`/`dir` وسباكة السيو |

**مكوّنات العرض:** `components/sections/` (عارضات الأقسام + `render.tsx` الموزِّع) · `components/site/` (الترويسة، التذييل، البطل، الخدمات، الأسطول، التواصل، **`links.ts`** بـ `bookingHref()`/`contactHref()`، مبدّل اللغة) · `components/booking/` (`search-widget.tsx` · `offers.tsx` · `format.ts` **تنسيق محض** · `checkout/`) · `components/seo/JsonLd.tsx` · `components/shared/HelpTip.tsx`.

---

## ٤) اللوحة `/admin`

| القسم | المسار | يدير |
|---|---|---|
| لوحة القيادة | `app/admin/page.tsx` | مؤشرات سريعة |
| الطلبات | `app/admin/orders/` (+ `[id]/actions.ts` و`[id]/dispatch-actions.ts`) | الحجوزات، تحقق الإيصالات، الإسناد اليدوي |
| البث | `app/admin/dispatch/` | إعدادات الموجات والطابور اليدوي |
| المتعهدون | `app/admin/subcontractors/` (+ `[id]` و`reviews`) | الاعتماد، الملفات، مراجعة قوائم الأسعار |
| المالية | `app/admin/finance/` (+ `treasury` · `expenses` · `partners/[id]`) | الخزينة، المصروفات، كشوف المتعهدين والمقاصة |
| التسعير والأسطول | `app/admin/pricing/` · `app/admin/fleet/` | التعريفات والهامش والذروة · الفئات والسعات |
| المحتوى | `app/admin/content/` (+ `new` · `[id]` · `loader.ts`) | الصفحات والأقسام |
| اللغات | `app/admin/languages/` (+ `[locale]`) | التفعيل والترجمة وطابور المراجعة |
| المدفوعات | `app/admin/payments/` · `app/admin/payment-accounts/` | البوابات · المحافظ وانستا باي وحدودها |
| الإشعارات | `app/admin/notifications/` | حالة القنوات + تشغيل العامل يدوياً |
| الإعدادات | `app/admin/settings/` | العلامة والتواصل والدفع و**`notifications.telegramChatId`** |
| الصيانة | `app/admin/maintenance/` | مفتاح وضع الصيانة |
| طلبات الأسعار | `app/admin/quote-requests/` | نماذج «اطلب عرض سعر» |
| الدخول | `app/admin/login/` · `app/admin/set-password/` | الدخول وضبط كلمة المرور بعد الدعوة |

**النمط:** كل قسم = `page.tsx` + `actions.ts` مجاور + `_components/` للأجزاء التي تحتاج العميل. الشكل القياسي لأي Server Action في `CONVENTIONS.md` القسم ٤، ومرجعه الحي `app/admin/pricing/actions.ts`.

---

## ٥) بورتال المتعهدين `/portal`

| المسار | الصفحة |
|---|---|
| `app/portal/page.tsx` | العروض المعروضة عليه الآن |
| `app/portal/trips/` | رحلاته المُسندة |
| `app/portal/requests/` (+ `data.ts` · `reasons.ts`) | قبول/رفض بأسباب |
| `app/portal/prices/` (+ `[id]`) | قوائم أسعاره وتقديمها للاعتماد |
| `app/portal/fleet/` · `app/portal/profile/` | أسطوله وملفه |
| `app/portal/_lib/{session,data,form}.ts` | الجلسة وقراءة البيانات وأدوات النماذج |

**مكوّناته:** `components/portal/` (`portal-gate` · `portal-nav` · `offer-window` · `place-picker` …).

---

## ٦) مسارات `/api`

| المسار | الدور |
|---|---|
| `app/api/quote/route.ts` | المسافة ← `quote_public()` ← بطاقات الأسعار (**بلا أرقام داخلية**) |
| `app/api/geocode/route.ts` | اقتراحات الأماكن (Nominatim + كاش) |
| `app/api/booking/route.ts` · `booking/receipt` · `booking/settings` | إنشاء الحجز · رفع الإيصال · إعدادات صفحة الدفع |
| `app/api/quote-request/route.ts` | نموذج طلب عرض السعر |
| `app/api/payments/start/route.ts` | فتح جلسة دفع لدى المزوّد |
| `app/api/payments/webhook/[provider]/route.ts` | **مصدر الحقيقة** — توقيع + إحكام + تسوية |
| `app/api/payments/sandbox/[ref]/route.ts` | صندوق المزوّد الاختباري |
| `app/api/notifications/dispatch/route.ts` | عامل إرسال الإشعارات (كل دقيقة على Vercel) |
| `app/api/dispatch/tick/route.ts` | دورة البث (كل ٥ دقائق) |
| `app/api/i18n/translate/route.ts` | «ترجم الباقي آلياً» — مسودات فقط |

المساران الأخيران في الجدولة محروسان بـ `lib/dispatch/guard.ts`.

---

## ٧) `lib/` — الطبقات المشتركة

| المجلد/الملف | يحوي |
|---|---|
| `lib/supabase/{client,server,admin}.ts` | ثلاثة عملاء: متصفح · خادم بجلسة · `service_role` |
| `lib/geo/{geocode,route,haversine,background}.ts` | الجيوكودنج والمسافات وطبقاتها الأربع والكاش |
| `lib/payments/` | `registry.ts` · `intents.ts` · `credentials.ts` · `crypto.ts` · `webhook-headers.ts` · `amount.ts` · `providers/` (٦ حقيقية + `test`) |
| `lib/dispatch/` | `guard.ts` (حارس المسارات المجدولة) · `start.ts` · `tick.ts` · `settings.ts` · `messages.ts` |
| `lib/notifications/` | `dispatch.ts` (العامل) · `telegram.ts` · `email.ts` · `render.ts` |
| `lib/i18n/` | `content.ts` + `mt/` (المزوّدون: mymemory · deepl · google) |
| `lib/site-config.ts` · `lib/settings.ts` | **كل قيمة علامة تجارية تمر من هنا** — وقيم `site-config` fallback دائم لا مصدر |
| `lib/content.ts` · `lib/default-content.ts` | قراءة المحتوى من القاعدة · المرآة الافتراضية حين لا قاعدة |
| `lib/seo.ts` · `lib/maintenance.ts` · `lib/utils.ts` | الروابط المطلقة والـ canonical · مفتاح الصيانة · أدوات |

---

## ٨) اللغات والوسيط والإعداد

| الملف | الدور |
|---|---|
| `i18n/config.ts` | `LOCALE_CATALOG` (٧ لغات) · `DEFAULT_LOCALE` · `canonicalLocalePath()` · `ROUTING_LOCALES` من `NEXT_PUBLIC_SITE_LOCALES` |
| `i18n/{request,server,messages,locales}.ts` | ربط next-intl وقراءة النصوص |
| `messages/ar.json` · `messages/en.json` | نصوص الواجهة المملوكة للمستودع |
| `proxy.ts` | **الوسيط** (لا `middleware.ts`): صيانة ← لغة ← حارس `/admin` |
| `vercel.json` | الجدولتان: الإشعارات كل دقيقة · دورة البث كل ٥ دقائق |
| `.env.example` | قالب البيئة — يشمل `DATABASE_URL` بصيغة الـ Session pooler ومتغيرات الترجمة والبوابات (املأ القيم؛ الشرح في `ENVIRONMENT.md`) |
| `AGENTS.md` / `CLAUDE.md` | تحذير: هذه نسخة Next مختلفة — المرجع `node_modules/next/dist/docs/` |

---

## ٩) السكربتات

| السكربت | يفعل |
|---|---|
| `scripts/db-migrate.mjs` | تطبيق الترحيلات وتتبعها |
| `scripts/db-test.mjs` | تشغيل مجموعات SQL على القاعدة الحية |
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
| `handover/**` | هذه الحزمة |
| `PLAN.md` | **مسودة ملغاة** — لا تُعتمد (مكتوب في أول سطر منها) |
| `README.md` | ما زال قالب `create-next-app` — لا معلومة فيه |

---

## ١١) ملفات لا تُلمس بلا سبب

| الملف/السطر | لماذا |
|---|---|
| `package.json` ← `cross-env NODE_OPTIONS=--max-http-header-size=65536` في `dev` و`start` | حذفه يعيد خطأ **431** على جهاز بدر ولا يظهر على جهاز نظيف |
| كتل `revoke … from anon, authenticated` في كل ترحيل | حذفها **يفتح الجداول** (‏`TRUNCATE` لا يخضع لـ RLS) |
| `set search_path = ''` في كل دالة `definer` | بدونه يمكن خطف اسم جدول داخل دالة تعمل بصلاحيات المالك |
| أي ترحيل **مطبَّق** | التعديل لا يعيد التشغيل — التصحيح ترحيل جديد |
| `receipt-test.png` · `receipt-test.txt` في الجذر | مخلّفات اختبار رفع الإيصال — تُحذف قبل النشر لا الآن |

</div>
