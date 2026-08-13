<div dir="rtl">

# البيئة — من جهاز فارغ إلى نظام يعمل

> المسار الجذر: `C:/Users/Badr/OneDrive/Desktop/Tours-01`
> كل الأوامر تُنفَّذ من هذا الجذر. الأسماء التقنية تبقى بالإنجليزية دائماً.

---

## ١) المتطلبات

| المتطلب | القيمة | من أين نعرف |
|---|---|---|
| Node.js | `>=20.9.0` (المُثبَّت فعلياً على جهاز بدر: **22.14.0**) | `node_modules/next/package.json` ← `engines` |
| مدير الحزم | **pnpm** ١٠٫٦٫٢ (يوجد `pnpm-lock.yaml` فقط — لا تستعمل npm/yarn) | `pnpm-lock.yaml` |
| Next.js | 16.3.0 · React 19.2.8 · Tailwind v4 · next-intl 4 | `package.json` |
| قاعدة بيانات | مشروع Supabase حي (Postgres) — **لا يوجد Postgres محلي ولا Supabase CLI** | `scripts/db-migrate.mjs` يتصل بالسحابة مباشرة |
| psql | **غير مطلوب** — السكربتات تستعمل مكتبة `pg` من Node | `scripts/db-migrate.mjs`, `scripts/db-test.mjs` |
| نظام التشغيل | Windows 11 (المسارات في السكربتات معالَجة لصيغة ويندوز) | `scripts/invite-admin.mjs:10` |

> ⚠️ **جذر git هو مجلد المستخدم `C:/Users/Badr` وليس مجلد المشروع.** لا تنفّذ `git add` من داخل `Tours-01` قبل التحقق من `git rev-parse --show-toplevel`، وإلا التقطت `.ssh` و`.claude.json` وملفات المتصفح.

---

## ٢) التشغيل من الصفر

```bash
pnpm install                       # تثبيت الاعتماديات
cp .env.example .env.local         # ثم املأ القيم (الجدول أدناه)
# ⚠ املأ DATABASE_URL بصيغة الـ Session pooler — موجود في القالب فارغاً (الصيغة في القسم ٤)
pnpm db:migrate                    # تطبيق الترحيلات 0001–0023
pnpm db:test                       # التحقق: ثماني مجموعات، كلها ALL PASSED
pnpm dev                           # http://localhost:3000
```

> **على جهاز جديد بمشروع Supabase جديد** تسبق الخطوةَ الثانية خطوةٌ صفر: أنشئ مشروع Supabase وانسخ منه `NEXT_PUBLIC_SUPABASE_URL` و`NEXT_PUBLIC_SUPABASE_ANON_KEY` و`SUPABASE_SERVICE_ROLE_KEY` (‏Project Settings ← API) ثم رابط الـ **Session pooler** كـ `DATABASE_URL` (‏Connect ← Session pooler ← URI). الدليل المصوَّر: `supabase/README.md`.
> **بلا قيمة في `DATABASE_URL` يتوقف `pnpm db:migrate` فوراً** برسالة عربية (`db-migrate.mjs:21-27`) — وهي أول خطوة تفشل لو نُسخ `.env.example` كما هو بلا ملء القيم.
> `pnpm dev` وحده يعمل بلا أي متغير: الموقع يعرض المحتوى الافتراضي من `lib/default-content.ts` و`/admin` مفتوح (وضع تطوير).

| الأمر | الملف | ما يفعله |
|---|---|---|
| `pnpm dev` | `package.json:6` | `next dev` بترويسة موسّعة (انظر ٤) — المنفذ 3000 |
| `pnpm build` | `package.json:7` | بناء إنتاجي |
| `pnpm start` | `package.json:8` | تشغيل البناء الإنتاجي |
| `pnpm lint` | `package.json:9` | `eslint` |
| `pnpm db:migrate` | `scripts/db-migrate.mjs` | تطبيق الترحيلات المعلّقة |
| `pnpm db:test [filter]` | `scripts/db-test.mjs` | اختبارات SQL على القاعدة الحية |

---

## ٣) متغيرات البيئة

### ٣-أ الموجودة في `.env.example`

| المتغير | مطلوب؟ | الوظيفة | ماذا ينكسر بدونه |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | **نعم** | عنوان مشروع Supabase | `createServerSupabase()` ترجع `null` (`lib/supabase/server.ts:16`) ⇒ الموقع يعرض المحتوى الافتراضي من `lib/default-content.ts`، وكل Server Action يخرج بـ `error=env`، و**حارس `/admin` في `proxy.ts:181` يمرّر الجميع** (وضع تطوير متعمَّد) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **نعم** | المفتاح العام (محمي بـ RLS) | نفس ما سبق |
| `SUPABASE_SERVICE_ROLE_KEY` | **نعم** | مفتاح الخادم — يتجاوز RLS (`lib/supabase/admin.ts:15`) | إنشاء الحجز، كتابة كاش المسافات، عامل إرسال الإشعارات، وسكربتات الدعوة — كلها تفشل. **لا يبدأ بـ `NEXT_PUBLIC_` أبداً** |
| `SITE_URL` | نعم للإنتاج | الرابط المطلق (بلا `/` في النهاية) | `lib/seo.ts:23` يسقط على `VERCEL_URL` ثم `localhost` ⇒ canonical وsitemap وOG خاطئة؛ و`app/api/payments/start/route.ts:51` يبني روابط العودة من البوابة خطأً |
| ~~`NEXT_PUBLIC_GA_ID`~~ | **ملغى** | كان معرّف GA4 من البيئة | **لم يعد يُقرأ من أي ملف** منذ المرحلة ١٠ (وحُذف `components/analytics.tsx` الذي كان يقرؤه). المعرّفات كلها من `/admin/integrations` وتُخزَّن في `site_settings.integrations` — القرار ١ في `lib/analytics-types.ts`: نسخة الـ whitelabel الثانية لها معرّفاتها، ولو عاشت في البيئة لصار كل إطلاق علامة نشراً جديداً. احذفه من بيئتك |
| `NEXT_PUBLIC_SITE_LOCALES` | اختياري | اللغات التي يعرف الوسيط **توجيهها** (`i18n/config.ts:110`) | الافتراضي `ar,en`. لغة تُفعَّل من اللوحة ولا تُذكر هنا ⇒ `/fr/...` لا يعمل رغم اكتمال ترجمتها. الرمز يجب أن يكون داخل `LOCALE_CATALOG` (ar, en, fr, de, it, es, ru) وإلا يُتجاهل بصمت |
| `TELEGRAM_BOT_TOKEN` | اختياري | توكن البوت (`lib/notifications/telegram.ts:21`) | القناة تُسجَّل «متجاوَزة» بسبب واضح في `/admin/notifications` (**مضبوط حالياً**) |
| `RESEND_API_KEY` | اختياري | مفتاح البريد (`lib/notifications/email.ts:20`) | لا بريد إطلاقاً؛ الجرس وتليجرام يعملان (**غير مضبوط**) |
| `NOTIFY_EMAIL_FROM` | اختياري | عنوان المُرسِل | يُستعمل `onboarding@resend.dev` — يصل إلى بريد صاحب حساب Resend فقط |
| `NOTIFY_DISPATCH_KEY` | **نعم للإنتاج** | يحمي `/api/notifications/dispatch` و`/api/dispatch/tick` (`lib/dispatch/guard.ts:55`) | في الإنتاج بلا مفتاح: المساران **مقفلان** (fail-closed، `guard.ts:66`) ⇒ لا إشعارات ولا إعادة بث. ومنه يُشتق سرّ توقيع بوابة الاختبار (`lib/payments/providers/test.ts:54`) |
| `CRON_SECRET` | Vercel فقط | تُرسله Vercel في ترويسة `Authorization: Bearer` مع كل تشغيل مجدول. والحارس يقبله **مفتاحاً صالحاً بديلاً** عن `NOTIFY_DISPATCH_KEY` (`guard.ts:55-56`) | جداول `vercel.json` تفشل بـ 401 |

### ٣-ب مقروءة في الكود ولكن **غائبة عن `.env.example`** — أضِفها يدوياً عند الحاجة

| المتغير | المكان | الوظيفة | بدونه |
|---|---|---|---|
| `DATABASE_URL` | `scripts/db-migrate.mjs:20` وكل `scripts/*.mjs` | اتصال psql مباشر — **لا يقرؤه التطبيق وقت التشغيل إطلاقاً** | `pnpm db:migrate` و`pnpm db:test` وكل السكربتات تتوقف فوراً برسالة عربية. الصيغة الإلزامية في القسم ٤ |
| `GOOGLE_MAPS_API_KEY` | `lib/geo/route.ts:146` | طبقة Google Routes في محرك المسافات | يُتخطّى فرع جوجل ويعمل OSRM المجاني — **الوضع الحالي**، والتسعير لا يتوقف |
| `ALLOW_TEST_PAYMENTS` | `lib/payments/providers/test.ts:46` | حارس ثانٍ مستقل للبوابة الاختبارية؛ القيمة الوحيدة المقبولة `1` | في `NODE_ENV=production` بدونه ترمي البوابة «غير مهيّأة» حتى لو فُعِّل صفها في اللوحة. خارج الإنتاج المرور مسموح دائماً (`test.ts:47`) — **لا تضبطه في الإنتاج أبداً** |
| `MT_PROVIDER` | `lib/i18n/mt/index.ts:55` | مزوّد الترجمة الآلية: `mymemory` (الافتراضي المجاني) / `deepl` / `google` / `off` | يُستنتج المزوّد: مفتاح DeepL ⇒ DeepL، وإلا مفتاح Google ⇒ Google، وإلا MyMemory |
| `DEEPL_API_KEY` | `lib/i18n/mt/index.ts:50` | جودة ترجمة أعلى (مدفوع) | يبقى MyMemory بحصة يومية صغيرة |
| `GOOGLE_TRANSLATE_API_KEY` | `lib/i18n/mt/index.ts:51` | تغطية لغات أوسع | نفس ما سبق |
| `MYMEMORY_EMAIL` | `lib/i18n/mt/mymemory.ts:46` | يرفع الحصة اليومية المجانية | حصة صغيرة لكل عنوان IP — زر «ترجم الباقي آلياً» يتوقف بسرعة |
| `VERCEL_URL` | `lib/seo.ts:26` | تحقنه Vercel تلقائياً | لا شيء — احتياطي لـ `SITE_URL` |

### ٣-ج الحالة الفعلية لملف `.env.local` اليوم

| مضبوط | فارغ أو غائب |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` · `NEXT_PUBLIC_SUPABASE_ANON_KEY` · `SUPABASE_SERVICE_ROLE_KEY` · `SITE_URL` · `DATABASE_URL` · `TELEGRAM_BOT_TOKEN` | الباقي مذكور في القالب وفارغ القيمة: `NEXT_PUBLIC_SITE_LOCALES` · `GOOGLE_MAPS_API_KEY` · `RESEND_API_KEY` · `NOTIFY_EMAIL_FROM` · `NOTIFY_DISPATCH_KEY` · `CRON_SECRET` · متغيرات الترجمة الأربعة · `ALLOW_TEST_PAYMENTS` ومفاتيح البوابات الست |

`.env*` كلها في `.gitignore` — لا تُرفع أبداً.

---

## ٤) فخّ `DATABASE_URL` — لا بد من الـ Session pooler

المضيف المباشر `db.<project-ref>.supabase.co` **يدعم IPv6 فقط**، وشبكة بدر IPv4 — فالاتصال يفشل بلا رسالة مفهومة. الحل الوحيد هو رابط الـ Session pooler، والإقليم اكتُشف بالتجربة: `aws-1-eu-west-1`.

```
postgresql://postgres.<project-ref>:<db-password>@aws-1-eu-west-1.pooler.supabase.com:5432/postgres
```

| نقطة | التفصيل |
|---|---|
| اسم المستخدم | `postgres.<project-ref>` — بنقطة، لا `postgres` وحدها |
| المضيف | `aws-1-eu-west-1.pooler.supabase.com` (لنسخة أخرى: انسخ الإقليم من لوحتها) |
| المنفذ | `5432` (Session pooler) — لا `6543` |
| كلمة المرور | كلمة مرور القاعدة المحددة عند إنشاء المشروع، لا أي مفتاح API |
| من أين تنسخه | لوحة Supabase ← زر **Connect** ← **Session pooler** ← URI |
| SSL | السكربتات تمرّر `ssl: { rejectUnauthorized: false }` تلقائياً |

---

## ٥) فخّ HTTP 431 على localhost

متصفح بدر يحمل كوكيز متراكمة ضخمة لـ `localhost` مشتركة بين كل مشاريعه، وNode يرفض الترويسات فوق 16 KB بـ `431 Request Header Fields Too Large`. العلاج مثبَّت في `package.json`:

```json
"dev":   "cross-env NODE_OPTIONS=--max-http-header-size=65536 next dev",
"start": "cross-env NODE_OPTIONS=--max-http-header-size=65536 next start"
```

**ممنوع حذف `cross-env NODE_OPTIONS=...`** — حذفه يعيد الخطأ فوراً على جهاز بدر، ولن يظهر على جهاز نظيف فيبدو «إصلاحاً غير ضروري».

---

## ٦) الترحيلات والاختبارات

### الترحيلات

```bash
pnpm db:migrate                # يطبّق كل المعلّق بالترتيب
node scripts/db-migrate.mjs --upto 0015   # يطبّق حتى رقم معيّن (أثناء تطوير ترحيل جديد)
```

| الخاصية | التفصيل |
|---|---|
| المصدر | `supabase/migrations/*.sql` بالترتيب الأبجدي — حالياً `0001_core.sql` … `0023_analytics_funnel.sql` (**٢٣ ملفاً، كلها مطبَّقة**) |
| التتبّع | جدول `public.schema_migrations(name, applied_at)` — الملف المُطبَّق لا يُعاد |
| الذرّية | كل ملف داخل `begin/commit` مستقل؛ الفشل يُرجع الملف كاملاً ويوقف التنفيذ (`db-migrate.mjs:62-72`) |
| مستقبلاً | نفس السكربت هو أداة «طبّق على كل نسخ الـ Whitelabel» في المرحلة ١٤ |

بديل يدوي عند تعذّر الاتصال: الصق محتوى كل ملف بالترتيب في **SQL Editor** بلوحة Supabase (الدليل الكامل: `supabase/README.md`).

### الاختبارات

```bash
pnpm db:test              # كل المجموعات
pnpm db:test booking      # ترشيح بجزء من اسم الملف
```

**ثماني** مجموعات في `supabase/tests/`: `analytics_tests.sql` · `booking_tests.sql` · `coverage_tests.sql` · `dispatch_tests.sql` · `finance_tests.sql` · `i18n_tests.sql` · `payment_tests.sql` · `quote_tests.sql`.

| نقطة | التفصيل |
|---|---|
| أين تعمل | **على القاعدة الحية عبر `DATABASE_URL`** — لا قاعدة اختبار منفصلة |
| معيار النجاح | كل ملف يطبع `ALL PASSED` في آخر سطر؛ الفشل يرفع exception برسالة عربية فيها المتوقع والفعلي |
| الأمان | كل مجموعة تنظّف بياناتها في بدايتها ونهايتها معاً بمعرّفات ثابتة (`d0/d1/d2`) ووسوم fixture (`BOOKING_TESTS_FIXTURE`) — التشغيل المتكرر آمن |
| من psql مباشرة | `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f supabase/tests/<file>.sql` — **العلمان معاً إلزاميان**: بدون `ON_ERROR_STOP` يطبع psql «ALL PASSED» رغم الفشل |

---

## ٧) إنشاء مدير أو متعهد

| العملية | الأمر | ملاحظة |
|---|---|---|
| دعوة مدير جديد | `node scripts/invite-admin.mjs <email>` | يرسل دعوة Supabase رسمية ثم يرقّي إلى `admin` عبر `DATABASE_URL`. **لا تمر أي كلمة مرور عبر المساعد** — المستخدم يحددها بنفسه من `/admin/set-password` |
| ترقية حساب موجود | `node scripts/promote-admin.mjs <email>` | آمن للتكرار؛ يحتاج `DATABASE_URL` |
| إعادة إرسال رابط | `node scripts/resend-password-link.mjs <email>` | **ضروري عملياً**: روابط الدعوة البريدية تستهلكها فاحصات الروابط لدى مزوّد البريد قبل أن يضغطها المستخدم. السكربت يولّد رابط `token_hash` مباشراً يُسلَّم في المحادثة |
| دعوة متعهد | `node scripts/invite-subcontractor.mjs <email>` | ينشئ صف المتعهد ويضبط الدور `subcontractor` |
| ترقية يدوية من SQL | `supabase/README.md` القسم ٤ | خطة الطوارئ إن تعذّرت السكربتات |

الحساب القائم اليوم: **`cbadrx100@gmail.com` بدور `admin`** وكلمة مرور ضبطها بدر بنفسه.
الأدوار في `public.profiles.role`: `admin` · `ops` · `subcontractor` · `customer`. حارس `proxy.ts:223` يسمح لـ `admin` و`ops` بدخول `/admin`، ويحوّل `subcontractor` إلى `/portal` وما عداه إلى `/`.

---

## ٨) حالة الخدمات الخارجية اليوم

| الخدمة | الحالة | ما ينقص وأثره |
|---|---|---|
| **Supabase** | ✅ حية — المفاتيح و`DATABASE_URL` مضبوطة، **٢٣** ترحيلاً مطبَّقاً، الاختبارات خضراء (ثماني مجموعات) | لا شيء |
| **تليجرام** | 🟨 التوكن مضبوط في `.env.local`، **معرّف المحادثة غير مضبوط** | الإشعارات تُصف في `notifications` وتُتخطّى القناة. الحل: `docs/NOTIFICATIONS.md` §٢-٣ لاستخراج المعرّف من `getUpdates`، ثم لصقه في `/admin/settings` ← حقل `notifications.telegramChatId` (المعرّف ليس سرّاً فمكانه اللوحة) |
| **البريد** | ❌ لا مفتاح Resend | لا رسائل بريد لأي حدث؛ باقي القنوات تعمل |
| **الخرائط** | 🟢 مجاني بالكامل: Nominatim للجيوكودنج + OSRM للمسافات + كاش دائم في Postgres — **لا مفتاح Google** | الدقة أقل قليلاً وترتيب اقتراحات الأماكن أضعف (انظر `OPEN_TASKS.md`). ضبط `GOOGLE_MAPS_API_KEY` يفعّل الطبقة الأولى بلا أي تغيير كود |
| **بوابات الدفع** | ❌ لا حساب واحد. ستة محوّلات حقيقية مكتوبة وخامدة: Paymob · Stripe · PayPal · 2Checkout · BinancePay · NowPayments (`lib/payments/providers/`) | التحصيل اليوم يدوي (محافظ + انستا باي + إيصال). بوابة `test` **معطَّلة في القاعدة** (`0021_payments_hardening.sql`) وبحارس بيئة مستقل |
| **الدومين** | ❌ غير مشترى — قرار مؤجَّل صراحةً حتى اكتمال المنظومة | ساعة السيو لم تبدأ. أُثيرت التكلفة مرتين وحُسمت — **لا تُعاد المناقشة** |
| **Vercel** | ❌ لا مشروع. `vercel.json` جاهز بجدولتين: `/api/notifications/dispatch` كل دقيقة و`/api/dispatch/tick` كل ٥ دقائق | لا نشر. محلياً تُشغَّل الدورتان يدوياً من `/admin/notifications` أو بنداء المسار من الطرفية |
| **GA4 / GSC / Meta / Clarity** | ❌ لا معرّف مضبوط بعد (الشاشة جاهزة) | تُضبط كلها من `/admin/integrations` لا من البيئة. السرّ الوحيد في البيئة هو `META_CAPI_ACCESS_TOKEN`. بلا معرّف: صفر سكربت وصفر طلب لجهة خارجية (القرار ٧) |
| **مزوّد ترجمة** | 🟢 MyMemory المجاني بلا مفتاح (بحصة صغيرة) | ضبط `MYMEMORY_EMAIL` يرفعها مجاناً |

</div>
