-- ============================================================================
-- 0127 — صفحتا هبوط (الشركات تُرتقى · الرحلات الخاصة تُنشأ) و**مصدر كل طلب**
--
-- ══════════════════════════════════════════════════════════════════════════
--  🔴 (أ) لبّ الهجرة: من أين جاء الطلب — وطبقتا ثقةٍ لا طبقة واحدة
-- ══════════════════════════════════════════════════════════════════════════
--
-- `quote_requests` كانت **بلا عمود مصدرٍ واحد** (٢٣ عموداً، مقيسةً قبل الكتابة).
-- فالمالك يرى الطلب ولا يعرف أيّ صفحةٍ أرسلته ولا من أيّ حملة، فلا يعرف أين
-- يُنفق ولا أيّ صفحةٍ تبيع. وهذه الهجرة تضيف الجواب في خمسة أعمدة، **مقسومةً
-- بحسب من يكتبها**:
--
-- | العمود | من يكتب قيمته | الثقة | الحارس |
-- |---|---|---|---|
-- | `source_page` | مسارٌ داخليّ على موقعنا | **يُطابَق بقائمةٍ مغلقة** من `pages` و`reserved_slugs` | `quote_source_page()` + قيد شكلٍ ثابت |
-- | `source_referrer` | مضيف المُحيل الخارجي | **مدخلُ مستخدم** | `quote_source_host()` + قيد شكل |
-- | `utm_source` · `utm_medium` · `utm_campaign` | يكتبها الزائر في الرابط | **مدخلُ مستخدم** | `quote_source_tag()` + قيد شكل |
--
-- 🔴 **ولماذا القسمة أصلاً؟** لأن «الصفحة الداخلية» و«وسم الحملة» يبدوان نصّين
--    متشابهين، وهما ليسا كذلك: الأول **يُقبل أو يُرفض بمطابقة صفوفٍ نملكها** —
--    فأسوأ ما يفعله كاذبٌ أن ينسب طلبه إلى صفحةٍ أخرى **من صفحاتنا**، ولا يستطيع
--    أن يُدخل محرفاً واحداً لم نُصدره نحن. والثاني نصٌّ حرٌّ في شريط العنوان، يصل
--    من أي رابطٍ يلصقه أيُّ أحد، **ويُعرض في لوحة المالك** — أي متجهُ حقنٍ وتشويهٍ
--    مكتمل الشروط لو تُرك خاماً: خمسة آلاف حرف تكسر الجدول، ومحرفُ توجيهٍ واحد
--    (`U+202E`) يقلب اتجاه بقية الشاشة، ونصٌّ مصنوعٌ ليبدو رسالةَ نظام.
--
-- 🔒 **وثلاث طبقاتٍ للوسوم، لا واحدة** — وكلٌّ منها تُقاس وحدها في مجموعة الاختبار:
--    (١) **المُطبِّعات** (`quote_source_tag` / `quote_source_host`): قائمةُ سماحٍ
--        محرفيّة، وطيُّ الفراغ، وسقفٌ صريح — **تُنظّف ولا ترفض**، فالطلب يصل
--        والوسم القذر يُقصّ.
--    (٢) **مُشغّلٌ على الجدول** يطبّقها على **كل كاتب** — الدالةَ العامة، ومحرر
--        SQL، و`service_role`، وأي كاتبٍ مستقبليّ. فالحارس في الجدول لا في مسارٍ
--        واحد (سابقة `0014` و`0027` المذكورة في D-52).
--    (٣) **قيودُ شكلٍ ثابتة** (`check`) هي الجدارُ البنيويّ: ما لا يطابق الشكل
--        لا يدخل الصفَّ حتى لو سقط المُشغّل. والقيود **immutable** بلا نداءِ دالة
--        كي لا يصير إسقاطُ دالةٍ يوماً إسقاطاً للجدار معها.
--
-- ⚠ **والخصوصية بندٌ في التصميم لا ملاحظةٌ بعده** (D-19 وD-20):
--    · المُحيل يُخزَّن **مضيفاً فقط** لا عنواناً كاملاً — عنوانُ المُحيل الكامل قد
--      يحمل في سلسلة استعلامه بريدَ الزائر أو معرّفَ جلسته، فنكون خزّنّا بياناتِ
--      طرفٍ ثالث بلا سبب.
--    · و`quote_source_page` **ترفض** `/booking/<token>` و`/payment/**`
--      و`/account/**` صراحةً: توكن المتابعة ١٩٢ بتاً ومفتاحُ وصولٍ فعليّ، وتخزينه
--      في عمود «مصدر» يعني نسخةً ثانية منه في مكانٍ لم يُصمَّم لحمله.
--    · ولا شيء من هذه الأعمدة يدخل حمولةً تصل عميلاً أو متعهداً — لا في
--      `quote_public` ولا في `portal_offers` ولا في لقطة الحجز.
--
-- ══════════════════════════════════════════════════════════════════════════
--  (ب) «الشركات» تُرتقى — ولا تُنشأ
-- ══════════════════════════════════════════════════════════════════════════
--
-- صفحة `landing/business` **قائمةٌ ومنشورة بخمسة أقسام** (مقيسة). فالهجرة
-- تضيف إليها قسمين وحدهما ولا تُنشئ صفحةً ثانية تنافسها على الكلمة نفسها
-- (‏`STANDING-ORDERS` §٢و البند ٤ — وهو خطأٌ وقع فعلاً في 2026-08-18):
--
--   · جدول **«الالتزامات المكتوبة»** — وكلُّ سطرٍ فيه **منقولٌ من صفحةٍ منشورة**
--     (`refund-policy` §المهلة المجانية · `terms` §الانتظار و§التأخير)، لا وعدٌ
--     يُخترع هنا. ولذلك خلا من: الحسابات الشهرية، والفواتير، والسائق الثابت،
--     واتفاقية السرية — **أربعتها لا سطح لها في المستودع اليوم**، وكتابتها كانت
--     ستكون بالضبط النمط ٣ في `LESSONS.md` (نصٌّ يَعِد بما لا تنفّذه القاعدة).
--   · و**شريط دعوة** ختامي، نظير ما تنتهي به صفحات المسارات.
--
-- ⚠ **وصفر رقمٍ من الإعدادات في النصّ**: لا نسبةَ هامشٍ ولا سعرَ ساعةِ انتظار ولا
--    سعةَ فئةٍ بالأرقام. هذه قيمٌ يعايرها المالك من اللوحة، وتجميدُها في نصٍّ
--    مُفهرَس يجعلها تكذب في اليوم الذي يغيّرها فيه — وهو **عين** ما عالجته `0095`
--    حين اقتلعت «١٩٢٣ رحلة مكتملة».
--
-- ══════════════════════════════════════════════════════════════════════════
--  (ج) «الرحلات الخاصة» تُنشأ — `private-trips`
-- ══════════════════════════════════════════════════════════════════════════
--
-- **لماذا هذا الـslug بعينه:** الصفحة عن «الرحلة المفصَّلة على مسار العميل»،
-- وأقرب سطحٍ قائم إليها صفحةُ خدمة **`tours`** («الجولات السياحية») على
-- `/services/tours`. فلو سُمّيت `tours-*` أو `private-tours` لتنافست الصفحتان على
-- نفس عبارة البحث وانقسم وزنهما — وهو بالضبط ما تحذّر منه `[slug]/page.tsx` في
-- شرط النوع. و`private-trips` يترجم عنوانها العربي («الرحلات الخاصة») حرفاً،
-- ويفصل كلمتها المفتاحية (`trips`) عن كلمة صفحة الخدمة (`tours`)، ولا يصطدم
-- بـ`reserved_slugs` ولا بأي صفٍّ في `pages` (كلاهما مفحوصٌ في §١٠).
--
-- والبنية **منقولةٌ حرفاً عن صفحةٍ منشورةٍ ناجحة** (`cairo-alexandria`):
-- `page-hero` ← `rich-text` ← `features` ← `faq` ← `cta-band`. لا نمطَ ثانياً
-- يُخترع (القاعدة ١٢).
--
-- ══════════════════════════════════════════════════════════════════════════
--  (د) اللغة — العربية تُنشر، والإنجليزية **مسودةٌ في الطابور** (D-25)
-- ══════════════════════════════════════════════════════════════════════════
--
-- كل نصٍّ جديدٍ في هذه الهجرة يدخل `translations` بـ`status='draft'` وحده.
-- **ولا صفَّ واحد يُنشر** — نشرُ الترجمة قرارُ بدر وحده (`STANDING-ORDERS` §١ب).
-- ⚠ ولا تُستعمل `upsert_translations` هنا بقصد: `locales.en.auto_publish = true`
--    اليوم، فالمرور بها كان سينشر كل صفٍّ فوراً.
-- والمفاتيح **لا تُكتب بيد**: تُشتقّ من فرق `i18n_corpus_rows()` قبل/بعد، فما
-- أضافته الهجرة هو بعينه ما يُترجَم — ولا مفتاحَ يُنسى ولا مفتاحَ يُخترع.
--
-- ⚠ **D-60** — الهجرة تكتب في `sections.content`، فتكتب في اللقطات الحيّة معها.
--    والمقيس قبل الكتابة: لا لقطة (`page_revisions`) لأي من الصفحتين إطلاقاً —
--    الوحيدة الحيّة على `home` ولا تُمسّ. والشاهد في §١٠ يحرس ذلك مهما تغيّر.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (٠) لقطة الفهرس قبل أي كتابة — مرجعُ فرقِ المفاتيح في §٩
-- ----------------------------------------------------------------------------
create temporary table _corpus_before_127 on commit drop as
select ns, k from public.i18n_corpus_rows();

-- ============================================================================
-- §١ — أعمدة المصدر
-- ============================================================================

alter table public.quote_requests
  add column if not exists source_page     text,
  add column if not exists source_referrer text,
  add column if not exists utm_source      text,
  add column if not exists utm_medium      text,
  add column if not exists utm_campaign    text;

-- 🔒 **كلها nullable بلا افتراضيّ**، و`null` تعني «غير معروف» صراحةً.
--    والسبب مقيس: ثلاثة طلباتٍ حقيقية قائمة في الجدول وُلدت قبل هذه الهجرة ولا
--    مصدر لها ولا سبيل إلى اختراعه. عمودٌ `not null` كان سيفرض قيمةً كاذبة على
--    الماضي، وافتراضيٌّ مثل `'direct'` كان سيقول إن ثلاثتها جاءت مباشرةً — وهو
--    ادّعاءٌ لم يقسه أحد. **الفراغ يقول «لا أعرف»، والافتراضيّ يقول «أعرف» كذباً.**

comment on column public.quote_requests.source_page is
  'المسار الداخلي الذي أرسل الطلب — مُطابَقٌ بقائمة `pages`+`reserved_slugs`، وnull = غير معروف';
comment on column public.quote_requests.source_referrer is
  'مضيف المُحيل الخارجي وحده (لا عنوان كامل — الخصوصية) — مدخلُ مستخدم مُطبَّع';
comment on column public.quote_requests.utm_source is
  'وسم مصدر الحملة من الرابط — مدخلُ مستخدم مُطبَّع ومقصوص';
comment on column public.quote_requests.utm_medium is
  'وسم وسيلة الحملة من الرابط — مدخلُ مستخدم مُطبَّع ومقصوص';
comment on column public.quote_requests.utm_campaign is
  'اسم الحملة من الرابط — مدخلُ مستخدم مُطبَّع ومقصوص';

-- ⚠ **وهذه ليست `bookings.price_source`**: تلك تقول «من أين جاء **السعر**»
--    (تعريفة أم قائمة متعهد)، وهذه تقول «من أين جاء **الطلب**». الخلط بينهما
--    كان سيجعل استعلاماً واحداً يقيس شيئاً ويُنسب إلى آخر.

-- ============================================================================
-- §٢ — المُطبِّعات: قائمةُ سماحٍ محرفيّة وسقفٌ صريح
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (٢-أ) وسمُ حملة — `immutable` كي تصلح داخل قيدٍ أو فهرسٍ لاحقاً
--
-- خمس خطوات بترتيبٍ مقصود:
--   ١. سقفٌ خام (٥١٢) **قبل** أي عمل: من أرسل ميغابايت لا يشتري بها دورة معالجة.
--   ٢. `lower()` — فـ`Ramadan` و`ramadan` وسمٌ واحد لا وسمان في تقرير المالك.
--   ٣. **قائمة سماح** لا قائمة منع: لاتينيّ ورقمٌ وعربيّ (‏`U+0600..U+06FF`،
--      وفيها الأرقام الهندية) ومسافةٌ و`.` و`_` و`-`. وكلُّ ما عداها **يسقط**:
--      الوسوم `<>`، والاقتباس، ومحارف التحكم، **ومحارف توجيه الكتابة**
--      (`U+200E/200F`, `U+202A..202E`, `U+2066..2069`) — وهي أخطرها في واجهة
--      RTL: محرفٌ واحد غير مرئي يقلب اتجاه ما بعده فتبدو الشاشة معطوبة.
--   ٤. طيُّ الفواصل المتكررة إلى فاصلٍ واحد — «‏a          b» لا تمطّ عموداً.
--   ٥. القصّ إلى ٦٤ ثم تشذيبٌ ثانٍ (فالقصّ قد يترك فاصلاً معلّقاً)، و`''` ⇒ `null`.
--
-- 🔒 والاتجاه **تنظيفٌ لا رفض**: طلبُ عميلٍ حقيقيّ لا يُسقَط لأن وسماً في رابطه
--    كان قذراً. ما يُفقد وسمٌ، وما كان سيُفقد **مبيع**.
-- ----------------------------------------------------------------------------
-- ⚠ **والمدياتُ تُكتب بـ`\uXXXX` لا بمحارفَ حرفية.** كتابةُ `[a-z0-9 ._-؀-ۿ]`
--    حرفياً عيبٌ صامت من وجهين: مدياتُ الأقواس تُفسَّر بترتيب التجميع لا بترقيم
--    يونيكود، **و**`_-؀` كان سيصير مدىً من `U+005F` إلى `U+0600` فيفتح قائمة
--    السماح على آلاف المحارف — أي حارسٌ يبدو قائماً وهو ساقط.
create or replace function public.quote_source_tag(p_raw text)
returns text
language sql
immutable
set search_path = ''
as $fn$
  select nullif(
    btrim(
      left(
        btrim(
          regexp_replace(
            regexp_replace(
              lower(left(coalesce(p_raw, ''), 512)),
              '[^a-z0-9 ._\u002D\u0600-\u06FF]', '', 'g'
            ),
            '[ ._\u002D]{2,}', '-', 'g'
          ),
          ' ._-'
        ),
        64
      ),
      ' ._-'
    ),
    ''
  );
$fn$;

comment on function public.quote_source_tag(text) is
  'يُطبّع وسم حملةٍ قادماً من رابط الزائر: قائمة سماح محرفية + طيّ فواصل + سقف ٦٤ محرفاً. يُنظّف ولا يرفض.';

-- ----------------------------------------------------------------------------
-- (٢-ب) مضيفُ المُحيل — أضيق من الوسم: أحرفٌ وأرقامٌ و`.` و`-` فقط
--
-- و`www.` تُنزع كي لا يصير الموقع الواحد سطرين في تقرير المالك.
-- ⚠ **ولا يُقبل عنوانٌ كامل هنا إطلاقاً**: من يمرّر `https://x/y?token=…` يخرج
--    `null` لأن `:` و`/` و`?` خارج قائمة السماح ⇒ الشكل ينكسر ⇒ يُرفض كاملاً.
--    وهذا هو الحدّ الذي يمنع تسرّب سلسلة استعلامٍ خارجية إلى قاعدتنا.
-- ----------------------------------------------------------------------------
create or replace function public.quote_source_host(p_raw text)
returns text
language sql
immutable
set search_path = ''
as $fn$
  -- 🔒 والتشذيب الختامي ليس تجميلاً: القصّ عند ١٠٠ قد يقع على نقطةٍ أو شرطة،
  --    فيخرج اسمٌ ينتهي بغير أبجديّ ⇒ **يرفضه قيدُ الشكل في §٣ فيسقط الطلب كله**.
  --    والمُطبِّع مسؤولٌ عن أن يُخرج ما يقبله القيد دائماً، وإلا صار الحارس سبباً
  --    في ضياع مبيعٍ بدل حمايته.
  select nullif(
    regexp_replace(
      left(
        regexp_replace(
          btrim(lower(left(coalesce(p_raw, ''), 256))),
          '^www\.', ''
        ),
        100
      ),
      '[^a-z0-9]+$', ''
    ),
    ''
  )
  where btrim(lower(left(coalesce(p_raw, ''), 256))) ~ '^[a-z0-9]([a-z0-9.-]{0,253}[a-z0-9])?$';
$fn$;

comment on function public.quote_source_host(text) is
  'يقبل اسم مضيفٍ خالصاً (بلا مخطَّط ولا مسار ولا استعلام) ويعيد null لما عداه — الخصوصية: المُحيل يُخزَّن مضيفاً لا عنواناً.';

-- ----------------------------------------------------------------------------
-- (٢-ج) 🔴 المسار الداخلي — **قائمةٌ مغلقة تُطابَق بصفوفنا**، لا شكلٌ يُقبل
--
-- هذه هي الضفّة «الموثوقة». وثقتُها ليست لأن العميل صادق، بل لأن الناتج
-- **لا يمكن أن يكون إلا واحداً من مسارات موقعنا**:
--   · `/` — الرئيسية.
--   · `/{slug}` حيث `slug` صفٌّ في `pages` (‏static/landing/service/corridor)
--     أو مسارُ تطبيقٍ محجوزٌ **مقروءٌ من `reserved_slugs` نفسها** التي يحرس بها
--     منشئُ الصفحات (`page_slug_conflict`) — مصدرٌ واحد لا نسختان (النمط ٨).
--   · `/services/{slug}` و`/routes/{slug}` حيث `slug` صفٌّ في `pages`.
--
-- وما عدا ذلك ⇒ `null`. **وثلاثةٌ مرفوضةٌ بقصدٍ صريح ولها سببٌ واحد** —
-- `/booking/**` و`/payment/**` و`/account/**`: أوّلها يحمل توكن متابعةٍ
-- (مفتاحُ وصول)، وثانيها معرّفَ نيّة دفع، وثالثها سطحَ حسابٍ مُصادَق. ولا واحدٌ
-- منها «مصدرُ تسويق»، وتخزينها يصنع نسخةً ثانية من سرٍّ في عمودٍ لم يُصمَّم له.
-- (وهي مرفوضةٌ بنيوياً أيضاً: `booking`/`payment`/`account` صفوفُ `slug-prefix`
--  في `reserved_slugs`، وهذه الدالة تقبل `slug-reserved` وحدها.)
--
-- و**بادئة اللغة تُنزع** قبل المطابقة (D-24): `/en/business` و`/business` صفحةٌ
-- واحدة، وعدُّهما مصدرين يقسم رقم المالك على وهم.
-- ----------------------------------------------------------------------------
-- 🔒 و`security definer` بقصد: المُشغّل في §٣ يعمل بصلاحية **الكاتب**، والكاتب
--    قد يكون `authenticated` (مشرفٌ يحرّر صفّاً من اللوحة) لا مالك القاعدة.
--    وبدون definer كانت الدالة ترى `pages` بعين ذلك الدور فتُخرج `null` لمسارٍ
--    صحيح — أي حارسٌ يُتلف بياناتٍ سليمة بحسب من كتبها. وهي **لا تكشف شيئاً**:
--    مدخلُها مسارٌ ومخرجُها المسارُ نفسه أو `null`، ولا صفَّ تقرؤه إلا قائمة
--    الـslugs العامة. و`search_path = ''` مع تأهيل كل مرجع (§٧ في الاتفاقيات).
create or replace function public.quote_source_page(p_raw text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_path text;
  v_seg  text[];
begin
  v_path := btrim(lower(left(coalesce(p_raw, ''), 200)));
  if v_path = '' then
    return null;
  end if;

  -- سلسلة الاستعلام والمرساة تُقطعان — الحملة تعيش في أعمدتها لا هنا
  v_path := split_part(split_part(v_path, '?', 1), '#', 1);

  -- 🔴 الشكل أولاً: ما لا يطابق هذا لا يُقارَن بشيء ولا يُخزَّن
  if v_path !~ '^/[a-z0-9/_-]*$' then
    return null;
  end if;

  -- 🔒 والطول قبل المطابقة: `pages.slug` بلا حدٍّ أعلى في المخطَّط، فصفٌّ بمسارٍ
  --    طويل كان سيخرج من هنا صحيحاً ثم **يرفضه قيدُ الشكل (٨٠ محرفاً) فيسقط
  --    الطلب كله**. والحارس لا يجوز أن يكون هو من يُضيّع الطلب.
  if length(v_path) > 80 then
    return null;
  end if;

  -- بادئة اللغة (D-24): `/en` و`/ar` إعادةُ كتابةٍ لا صفحةٌ أخرى
  v_path := regexp_replace(v_path, '^/(en|ar)(/|$)', '/');

  -- شرطةٌ ختامية تُنزع، فلا يصير `/business/` مصدراً ثانياً لـ`/business`
  if v_path <> '/' then
    v_path := regexp_replace(v_path, '/+$', '');
  end if;
  if v_path = '' then
    v_path := '/';
  end if;

  if v_path = '/' then
    return '/';
  end if;

  v_seg := string_to_array(ltrim(v_path, '/'), '/');

  -- مقطعٌ واحد: صفحةٌ في `pages` أو مسارُ تطبيقٍ محجوز (‏`slug-reserved` وحده)
  if array_length(v_seg, 1) = 1 then
    if exists (select 1 from public.pages p where p.slug = v_seg[1]) then
      return v_path;
    end if;
    if exists (
      select 1 from public.reserved_slugs r
      where r.slug = v_seg[1]
        and r.reason = 'slug-reserved'
        and r.slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'   -- يُخرج `robots.txt` وأخواته
    ) then
      return v_path;
    end if;
    return null;
  end if;

  -- مقطعان: صفحة خدمةٍ أو مسار — ولا شيء غيرهما
  if array_length(v_seg, 1) = 2
     and v_seg[1] in ('services', 'routes')
     and exists (select 1 from public.pages p where p.slug = v_seg[2]) then
    return v_path;
  end if;

  return null;
end;
$fn$;

comment on function public.quote_source_page(text) is
  'يقبل مساراً داخلياً ويعيده فقط إن طابق صفحةً في `pages` أو مساراً محجوزاً في `reserved_slugs` — وما عداه null. يرفض /booking و/payment و/account صراحةً (توكنات ومعرّفات).';

revoke all on function public.quote_source_tag(text)  from public, anon, authenticated;
revoke all on function public.quote_source_host(text) from public, anon, authenticated;
revoke all on function public.quote_source_page(text) from public, anon, authenticated;
grant execute on function public.quote_source_tag(text)  to authenticated, service_role;
grant execute on function public.quote_source_host(text) to authenticated, service_role;
grant execute on function public.quote_source_page(text) to authenticated, service_role;

-- ============================================================================
-- §٣ — الحارس: مُشغّلٌ يطبّق المُطبِّعات على كل كاتب + قيودُ شكلٍ بنيوية
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (٣-أ) المُشغّل — **الحارس في الجدول لا في الدالة**
--
-- ولماذا لا يكفي أن تُطبّع `create_quote_request` وحدها: لأنها ليست الكاتب
-- الوحيد. `service_role` يكتب، ومحرر SQL في لوحة Supabase يكتب، وأي هجرةٍ
-- مستقبلية تكتب. وقاعدةُ «الحارس عند الجدول» هي بعينها ما فرضته D-52 على
-- `bookings` بعد أن ثبت أن الواجهة لا تُنتج الحالة السيئة بينما المسار يقبلها.
-- ----------------------------------------------------------------------------
create or replace function public.quote_requests_normalize_source()
returns trigger
language plpgsql
set search_path = ''
as $fn$
begin
  new.source_page     := public.quote_source_page(new.source_page);
  new.source_referrer := public.quote_source_host(new.source_referrer);
  new.utm_source      := public.quote_source_tag(new.utm_source);
  new.utm_medium      := public.quote_source_tag(new.utm_medium);
  new.utm_campaign    := public.quote_source_tag(new.utm_campaign);
  return new;
end;
$fn$;

comment on function public.quote_requests_normalize_source() is
  'يطبّع أعمدة المصدر الخمسة عند كل كتابة — الحارس عند الجدول فيغطّي الدالة العامة ومحرر SQL وservice_role معاً.';

revoke all on function public.quote_requests_normalize_source() from public, anon, authenticated;

drop trigger if exists quote_requests_normalize_source on public.quote_requests;
create trigger quote_requests_normalize_source
  before insert or update of source_page, source_referrer, utm_source, utm_medium, utm_campaign
  on public.quote_requests
  for each row execute function public.quote_requests_normalize_source();

-- ----------------------------------------------------------------------------
-- (٣-ب) قيودُ الشكل — الجدار البنيويّ خلف المُشغّل
--
-- 🔒 **بلا نداءِ دالةٍ بقصد.** لو كُتب القيد `check (x = quote_source_tag(x))`
--    لصار إسقاطُ الدالة يوماً إسقاطاً للجدار معها، ولصار كلُّ تعديلٍ في المُطبِّع
--    يُبطل صفوفاً قائمة عند أول تحديثٍ يمسّها. فالقيد يصف **الشكل المسموح**
--    وحده — وهو ما لا يتغيّر بتغيّر سياسة التطبيع.
--
-- والقيود `not valid`؟ **لا** — الجدول ثلاثة صفوف وكلها `null` في هذه الأعمدة،
-- فالتحقق الكامل مجانيّ ويترك القيد صالحاً للمخطِّط.
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.quote_requests'::regclass
                   and conname = 'quote_requests_source_page_shape_chk') then
    alter table public.quote_requests
      add constraint quote_requests_source_page_shape_chk
      check (source_page is null
             or (source_page ~ '^/[a-z0-9/_-]*$' and length(source_page) <= 80));
  end if;

  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.quote_requests'::regclass
                   and conname = 'quote_requests_source_referrer_shape_chk') then
    alter table public.quote_requests
      add constraint quote_requests_source_referrer_shape_chk
      check (source_referrer is null
             or (source_referrer ~ '^[a-z0-9]([a-z0-9.-]{0,98}[a-z0-9])?$'));
  end if;

  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.quote_requests'::regclass
                   and conname = 'quote_requests_utm_shape_chk') then
    alter table public.quote_requests
      add constraint quote_requests_utm_shape_chk
      check (
        (utm_source   is null or (utm_source   ~ '^[a-z0-9\u0600-\u06FF][a-z0-9 ._\u002D\u0600-\u06FF]*$' and length(utm_source)   <= 64))
        and
        (utm_medium   is null or (utm_medium   ~ '^[a-z0-9\u0600-\u06FF][a-z0-9 ._\u002D\u0600-\u06FF]*$' and length(utm_medium)   <= 64))
        and
        (utm_campaign is null or (utm_campaign ~ '^[a-z0-9\u0600-\u06FF][a-z0-9 ._\u002D\u0600-\u06FF]*$' and length(utm_campaign) <= 64))
      );
  end if;
end;
$$;

-- فهرسٌ للتجميع في اللوحة — الطلبات تُقرأ بالمصدر، وثلاثةُ صفوفٍ اليوم تصير آلافاً
create index if not exists quote_requests_source_page_idx
  on public.quote_requests (source_page, created_at desc)
  where source_page is not null;
create index if not exists quote_requests_utm_campaign_idx
  on public.quote_requests (utm_campaign, created_at desc)
  where utm_campaign is not null;

-- ============================================================================
-- §٤ — `create_quote_request` تحمل المصدر
--
-- ⚠ **D-58**: الجسم أدناه منقولٌ من `pg_get_functiondef` على القاعدة الحيّة قبل
--    الكتابة، لا من ملف هجرةٍ سابق. والتغيير الوحيد فيه: خمسةُ وسائط بأواخر
--    التوقيع (بافتراضيّ `null` فلا يكسر مستدعياً قديماً)، وخمسةُ أعمدةٍ في
--    `insert`. **ولا حرفَ غيرهما** — وهذا هو بالضبط ما ولّد عيب D-58 حين
--    أُعيدت كتابة جسمٍ كامل من ذاكرة ملف.
--
-- 🔒 والتطبيع **لا يُكرَّر هنا**: المُشغّل في §٣ يفعله لكل كاتب، وتكرارُه في
--    الدالة يصنع موضعَي سياسةٍ ينحرفان (النمط ٨).
-- ============================================================================

drop function if exists public.create_quote_request(
  text, text, text, text, text, numeric, numeric, text, numeric, numeric,
  timestamptz, integer, integer);

create or replace function public.create_quote_request(
  p_service_slug    text,
  p_customer_name   text,
  p_customer_phone  text,
  p_details         text,
  p_origin_label    text,
  p_origin_lat      numeric,
  p_origin_lng      numeric,
  p_dest_label      text,
  p_dest_lat        numeric,
  p_dest_lng        numeric,
  p_pickup_at       timestamptz,
  p_passengers      integer,
  p_luggage         integer,
  p_source_page     text default null,
  p_source_referrer text default null,
  p_utm_source      text default null,
  p_utm_medium      text default null,
  p_utm_campaign    text default null
)
returns table (id uuid, reference text)
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_slug         text;
  v_name         text;
  v_phone        text;
  v_details      text;
  v_origin_label text;
  v_dest_label   text;
  v_digits       integer;
  v_id           uuid;
  v_ref          text;
  v_min_pickup   timestamptz;
  v_lead         integer;
begin
  v_name    := nullif(btrim(coalesce(p_customer_name, '')), '');
  v_phone   := nullif(btrim(coalesce(p_customer_phone, '')), '');
  v_slug    := nullif(btrim(coalesce(p_service_slug, '')), '');
  -- التفاصيل تُقصّ ولا تُرفض: من كتب ٥٠٠٠ حرف يستحق أن يصل طلبه لا أن ينكسر
  v_details := left(btrim(coalesce(p_details, '')), 2000);

  v_origin_label := nullif(btrim(coalesce(p_origin_label, '')), '');
  v_dest_label   := nullif(btrim(coalesce(p_dest_label, '')), '');

  if v_name is null then
    raise exception 'اسم العميل مطلوب' using hint = 'invalid-name';
  end if;
  if length(v_name) < 3 or length(v_name) > 120 then
    raise exception 'اسم العميل يجب أن يكون بين ٣ و١٢٠ حرفاً (طوله %)', length(v_name)
      using hint = 'invalid-name';
  end if;

  if v_phone is null then
    raise exception 'رقم هاتف العميل مطلوب' using hint = 'invalid-phone';
  end if;
  if length(v_phone) < 8 or length(v_phone) > 20 then
    raise exception 'رقم الهاتف يجب أن يكون بين ٨ و٢٠ محرفاً (طوله %)', length(v_phone)
      using hint = 'invalid-phone';
  end if;
  v_digits := length(regexp_replace(v_phone, '[^0-9]', '', 'g'));
  if v_digits < 8 then
    raise exception 'رقم الهاتف يجب أن يحوي ٨ أرقام على الأقل (وجدنا %)', v_digits
      using hint = 'invalid-phone';
  end if;

  -- الخدمة إما إحدى الست المعروفة أو لا شيء — لا نص حر يشوّش اللوحة
  if v_slug is not null
     and v_slug not in ('airport-transfer', 'city-rides', 'intercity-travel',
                        'tours', 'events', 'conferences') then
    raise exception 'الخدمة «%» غير معروفة', v_slug using hint = 'invalid-service';
  end if;

  -- 🔴 (D-09) الانطلاق نقطةٌ محلولة أو لا طلب: التسمية وحدها لا تُسعَّر
  if v_origin_label is null or p_origin_lat is null or p_origin_lng is null then
    raise exception 'نقطة الانطلاق يجب أن تكون مكاناً محدَّداً بإحداثياته'
      using hint = 'invalid-origin';
  end if;

  -- والوجهة إن ذُكرت فبالشرط نفسه — نصٌّ بلا إحداثيات يُرفض ولا يُقبل ناقصاً
  if (v_dest_label is null) <> (p_dest_lat is null)
     or (p_dest_lat is null) <> (p_dest_lng is null) then
    raise exception 'الوجهة يجب أن تكون مكاناً محدَّداً بإحداثياته أو تُترك فارغة'
      using hint = 'invalid-destination';
  end if;

  -- 🔴 مصر وحدها — مرآة `SERVICE_BOUNDS`، والرفض هنا قبل القيد ليخرج رمزٌ مفهوم
  if p_origin_lat not between 20 and 34 or p_origin_lng not between 23 and 38 then
    raise exception 'نقطة الانطلاق خارج نطاق التشغيل' using hint = 'out-of-area';
  end if;
  if p_dest_lat is not null
     and (p_dest_lat not between 20 and 34 or p_dest_lng not between 23 and 38) then
    raise exception 'الوجهة خارج نطاق التشغيل' using hint = 'out-of-area';
  end if;

  -- الموعد مطلوب ومستقبلي: طلبٌ بموعدٍ ماضٍ خطأُ إدخالٍ لا رغبةُ عميل، وطلبٌ
  -- بلا موعد لا يُسعَّر (نفس مبدأ حارس المهلة في الحجز).
  if p_pickup_at is null then
    raise exception 'موعد الرحلة مطلوب' using hint = 'invalid-pickup';
  end if;
  if p_pickup_at <= now() then
    raise exception 'موعد الرحلة يجب أن يكون في المستقبل' using hint = 'pickup-past';
  end if;

  -- ── 0098 — 🔒 أدنى مهلة قبل الانطلاق (نظير (أ-٢ب) في `create_booking`) ────
  --
  -- الحدّ من `booking_min_pickup_at()` نفسها لا من معادلةٍ تُحسب هنا، والمقارنة
  -- `<` فالمساوي مقبول. و`null` يعني المهلة مطفأة فيسقط الشرط.
  -- والرسالة تحمل الرقم والموعد معاً: العميل يعرف **ماذا يفعل الآن** لا أن
  -- طلبه رُفض. والرقم ليس سرّاً — هو بعينه ما تقوله رسالة رفض الحجز.
  v_min_pickup := public.booking_min_pickup_at();
  if v_min_pickup is not null and p_pickup_at < v_min_pickup then
    select t.min_lead_minutes into v_lead from public.trip_config() t;
    raise exception
      'موعد الرحلة أقرب من أدنى مهلة مطلوبة (% دقيقة) — أقرب موعد متاح %',
      v_lead, v_min_pickup
      using hint = 'lead-time';
  end if;

  if p_passengers is null or p_passengers < 1 or p_passengers > 200 then
    raise exception 'عدد الركاب يجب أن يكون بين ١ و٢٠٠ (وصلنا %)', coalesce(p_passengers, 0)
      using hint = 'invalid-passengers';
  end if;

  -- الحقائب اختيارية: غيابها يعني «لم يُذكر» لا صفراً
  if p_luggage is not null and (p_luggage < 0 or p_luggage > 400) then
    raise exception 'عدد الحقائب خارج المدى المقبول' using hint = 'invalid-luggage';
  end if;

  insert into public.quote_requests as q (
    service_slug, customer_name, customer_phone, details,
    origin_label, origin_lat, origin_lng,
    dest_label, dest_lat, dest_lng,
    pickup_at, passengers, luggage,
    -- 0127 — المصدر: يُكتب خاماً، والمُشغّل في §٣ هو من يُطبّعه
    source_page, source_referrer, utm_source, utm_medium, utm_campaign
  )
  values (
    v_slug, v_name, v_phone, v_details,
    v_origin_label, p_origin_lat, p_origin_lng,
    v_dest_label, p_dest_lat, p_dest_lng,
    p_pickup_at, p_passengers, p_luggage,
    p_source_page, p_source_referrer, p_utm_source, p_utm_medium, p_utm_campaign
  )
  returning q.id, q.reference into v_id, v_ref;

  id        := v_id;
  reference := v_ref;
  return next;
end;
$fn$;

-- ⚠ **الصلاحيات تُعاد صراحةً**: التوقيع الثماني‑عشري دالةٌ **جديدة** بحكم تغيّر
--    توقيعه، و`alter default privileges` في Supabase يمنح anon وauthenticated
--    صلاحية EXECUTE على كل دالةٍ جديدة تلقائياً. فالسحب أولاً ثم المنح الصريح —
--    نفس ما فعلته 0084 حرفاً.
revoke all on function public.create_quote_request(
  text, text, text, text, text, numeric, numeric, text, numeric, numeric,
  timestamptz, integer, integer, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.create_quote_request(
  text, text, text, text, text, numeric, numeric, text, numeric, numeric,
  timestamptz, integer, integer, text, text, text, text, text)
  to anon, authenticated;

-- ============================================================================
-- §٥ — تجميع المصادر للوحة — والعدّ **داخل Postgres** لا في الواجهة
--
-- 🔒 `is_admin()` صراحةً داخل الجسم: الدالة `security definer` وتقرأ جدولاً
--    تحرسه RLS بـ`is_admin()`، و`authenticated` يشمل **كل متعهّد من الباطن**
--    فلا يعني مشرفاً أبداً (D-20 — وهي بعينها الثغرة التي كشفتها المرحلة ٥ في
--    `coverage_matches`).
-- ============================================================================
create or replace function public.quote_request_sources()
returns table (kind text, bucket text, n bigint, last_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $fn$
begin
  if not public.is_admin() then
    raise exception 'تجميع مصادر الطلبات للمشرف وحده' using hint = 'forbidden';
  end if;

  return query
  -- (أ) الصفحة الداخلية — و`null` تُعرض بوصفها «غير معروف» لا تُخفى:
  --     صفٌّ بلا مصدر واقعةٌ يجب أن يراها المالك، لا فراغٌ يُطوى.
  select 'page'::text,
         coalesce(q.source_page, '—'),
         count(*)::bigint,
         max(q.created_at)
  from public.quote_requests q
  group by 1, 2

  union all

  -- (ب) المُحيل الخارجي — من له مُحيلٌ وحده
  select 'referrer'::text, q.source_referrer, count(*)::bigint, max(q.created_at)
  from public.quote_requests q
  where q.source_referrer is not null
  group by 1, 2

  union all

  -- (ج) الحملة — المفتاح `utm_campaign` وحده لأنه ما يُنفَق عليه فعلاً
  select 'campaign'::text, q.utm_campaign, count(*)::bigint, max(q.created_at)
  from public.quote_requests q
  where q.utm_campaign is not null
  group by 1, 2

  order by 1, 3 desc, 2;
end;
$fn$;

comment on function public.quote_request_sources() is
  'تجميع طلبات الأسعار بالمصدر (صفحة داخلية · مُحيل خارجي · حملة) — للمشرف وحده.';

revoke all    on function public.quote_request_sources() from public, anon, authenticated;
grant execute on function public.quote_request_sources() to authenticated;

-- ============================================================================
-- §٦ — «الشركات» تُرتقى: قسمان يُضافان إلى صفحةٍ منشورةٍ قائمة
-- ============================================================================
do $$
declare
  v_page uuid;
begin
  select p.id into v_page from public.pages p where p.slug = 'business';
  if v_page is null then
    raise exception '0127: صفحة `business` غير موجودة — وهي تُرتقى لا تُنشأ';
  end if;

  -- (٦-أ) إفساحُ مكانٍ في الترتيب: الجدول يقع بعد المزايا وقبل الأسئلة.
  --       ولا يُلمس `content` هنا إطلاقاً — `sort` وحده، فلا مفتاحَ ترجمةٍ يتحرك.
  update public.sections s set sort = 4 where s.page_id = v_page and s.type = 'faq'     and s.sort = 3;
  update public.sections s set sort = 5 where s.page_id = v_page and s.type = 'contact' and s.sort = 4;

  -- (٦-ب) جدول الالتزامات — **كل سطرٍ منقولٌ من صفحةٍ منشورة**، ولا وعد يُخترع
  insert into public.sections (page_id, type, sort, visible, content)
  select v_page, 'table', 3, true, jsonb_build_object(
    'title', 'الالتزامات المكتوبة التي تحكم تحرّككم',
    'h1',    'البند',
    'h2',    'ما هو منصوص عليه',
    'note',  'وهذه بنودٌ منشورةٌ في الشروط والأحكام وسياسة الاسترداد يستطيع أي موظف لديكم قراءتها قبل التعاقد، لا وعوداً تُكتب في صفحة تسويقية.',
    'style', jsonb_build_object('_v', 1),
    'items', jsonb_build_array(
      jsonb_build_object('_k', 'bzt101',
        'c1', 'الإلغاء المجاني للمناسبات والمؤتمرات والأفواج',
        'c2', 'قبل موعد التحرّك باثنتين وسبعين ساعة على الأقل'),
      jsonb_build_object('_k', 'bzt102',
        'c1', 'الإلغاء المجاني للسفر بين المحافظات والجولات',
        'c2', 'قبل موعد التحرّك بثمانٍ وأربعين ساعة على الأقل'),
      jsonb_build_object('_k', 'bzt103',
        'c1', 'الانتظار المجاني في استقبال المطارات',
        'c2', 'ستون دقيقة تُحسب من الهبوط الفعلي للطائرة لا من الموعد المجدول'),
      jsonb_build_object('_k', 'bzt104',
        'c1', 'تأخّر المركبة عن موعد التحرّك أكثر من ثلاثين دقيقة لسببٍ راجعٍ إلينا',
        'c2', 'لكم الاختيار بين خصمٍ يُتفق عليه أو إلغاءٍ مجاني واسترداد كامل المبلغ'),
      jsonb_build_object('_k', 'bzt105',
        'c1', 'التأجيل بدل الإلغاء',
        'c2', 'مرة واحدة مجاناً قبل الموعد بأربع وعشرين ساعة ووفق توفّر المركبات، ويبقى المبلغ رصيداً للحجز الجديد')
    ))
  where not exists (
    select 1 from public.sections s where s.page_id = v_page and s.type = 'table');

  -- (٦-ج) شريط الدعوة الختامي — نظير ما تنتهي به صفحات المسارات
  insert into public.sections (page_id, type, sort, visible, content)
  select v_page, 'cta-band', 6, true, jsonb_build_object(
    'title', 'تحرّكٌ واحد أو برنامجٌ متكرر — أرسلوا تفاصيله',
    'note',  'التاريخ والمواعيد، ونقاط الانطلاق والوصول، وعدد الركاب — ويصلكم السعر قبل أي التزام.',
    'style', jsonb_build_object('_v', 1))
  where not exists (
    select 1 from public.sections s where s.page_id = v_page and s.type = 'cta-band');
end;
$$;

-- ============================================================================
-- §٧ — «الرحلات الخاصة» تُنشأ: `private-trips`
-- ============================================================================
do $$
declare
  v_page uuid;
begin
  -- 🔴 والشرط `if not exists` **لا** `on conflict do nothing` — وهذا فرقٌ مقيس
  --    لا أسلوبيّ: مُشغّل `pages_guard_slug` يعمل **BEFORE INSERT**، فيرفع
  --    `slug-taken` قبل أن يصل الصفُّ إلى فحص التعارض أصلاً. أي أن
  --    `on conflict` هنا **لا يُنجّي من شيء**، والهجرة تنكسر في تشغيلها الثاني.
  --    (قِيس بإعادة تنفيذ الملف على قاعدةٍ مطبَّقة قبل تثبيته.)
  if not exists (select 1 from public.pages p where p.slug = 'private-trips') then
    insert into public.pages (slug, kind, title, published, sort, meta)
    values (
      'private-trips', 'landing', 'الرحلات الخاصة', true, 21,
      jsonb_build_object(
        'title',       'الرحلات الخاصة — سيارة بسائق ليوم كامل',
        'description', 'رحلة تُفصَّل على مسارك: جولة يوم أو أكثر بسيارة وسائق تبقى معك، تختار محطاتها وترتيبها ومدة وقوفك عند كل واحدة، وساعات الانتظار محسوبة في السعر قبل التأكيد.'
      ));
  end if;

  select p.id into v_page from public.pages p where p.slug = 'private-trips';
  if v_page is null then
    raise exception '0127: تعذّر إنشاء صفحة `private-trips`';
  end if;

  -- ── (٧-٠) الترويسة ────────────────────────────────────────────────────────
  insert into public.sections (page_id, type, sort, visible, content)
  select v_page, 'page-hero', 0, true, jsonb_build_object(
    'title',    'رحلة خاصة بمسارٍ تختاره أنت',
    'sub',      'جولة يوم أو أكثر بسيارة وسائق يبقيان معك: تحدّد محطاتك وترتيبها ومدة وقوفك عند كل واحدة، والسعر يظهر قبل التأكيد.',
    'ctaLabel', 'احسب سعر رحلتك',
    'style',    jsonb_build_object('_v', 1))
  where not exists (select 1 from public.sections s
                    where s.page_id = v_page and s.type = 'page-hero');

  -- ── (٧-١) النثر — ثلاث فقرات، واسم العلامة مرةً واحدة (سياسة 0095) ───────
  insert into public.sections (page_id, type, sort, visible, content)
  select v_page, 'rich-text', 1, true, jsonb_build_object(
    'body',
      'الرحلة الخاصة رحلةٌ تُبنى على يومك أنت لا على مسارٍ جاهز: تنطلق من العنوان الذي تحدده في الموعد الذي تختاره، وتبقى المركبة وسائقها معك حتى تنتهي، فتتحرك بينما تريد وتقف حيث تريد. وهي ما يناسب زيارة المعالم في يوم واحد، ومرافقة ضيفٍ قادم من الخارج، وقضاء مشاويرٍ متفرقة في مدينةٍ لا تعرف طرقها، وأي يومٍ يكون فيه انتظار المركبة أهم من سرعة الوصول.'
      || E'\n\n' ||
      'وثلاثة أشياء تفرقها عن الرحلة العادية بين نقطتين. الأول ساعات الانتظار: هي بندٌ مُسعَّر بسعر الساعة المعلن لفئة المركبة، فوقوف السائق بينما تزور مكاناً محسوبٌ في السعر لا مطلوبٌ منك بعده. والثاني موعد العودة: تكتبه عند الحجز، وإن كانت العودة في اليوم نفسه اشتُقّت ساعات الانتظار من الفارق بين الموعدين تلقائياً وقُرِّبت إلى الساعة الأعلى — ولك أن تطلب عدداً أكبر صراحةً فيؤخذ الأكبر لا الأصغر. والثالث اتساع المركبة: تُعرض عليك الفئات التي تكفي عدد ركابك وعدد حقائبك معاً، فلا تُحجز مركبةٌ لا يتسع صندوقها لما معك.'
      || E'\n\n' ||
      'وايجار ليموزين وسيط لخدمات النقل السياحي البري: تتلقى طلبك، وتسعّره، وتنسّقه، ثم ينفّذه متعهد معتمد من شبكتها بمركبته وسائقه — وتبقى المساءلة أمامك على الجهة التي حجزت معها. أما كيف تبدأ: فرحلةٌ من نقطة إلى نقطة بموعدَي ذهابٍ وعودة تُسعَّر فوراً من صفحة الحجز، وبرنامجُ يومٍ بعدة محطات يُرسَل من صفحة طلب عرض السعر بمحطاته ومواعيده فيُسعَّر برنامجاً كاملاً ويصلك سعره قبل أي التزام منك.',
    'style', jsonb_build_object('_v', 1))
  where not exists (select 1 from public.sections s
                    where s.page_id = v_page and s.type = 'rich-text');

  -- ── (٧-٢) المزايا — أربعٌ، كلٌّ منها يقابله شيءٌ قائم في النظام ──────────
  insert into public.sections (page_id, type, sort, visible, content)
  select v_page, 'features', 2, true, jsonb_build_object(
    'title', 'ما الذي يميّز الرحلة الخاصة',
    'style', jsonb_build_object('_v', 1),
    'items', jsonb_build_array(
      jsonb_build_object('_k', 'ptf001',
        'title', 'المسار كما ترسمه أنت',
        'text',  'تكتب نقطة الانطلاق والوجهة ومحطاتك ومواعيدها في تفاصيل الطلب، فيُسعَّر البرنامج كما هو لا كرحلةٍ بين نقطتين.'),
      jsonb_build_object('_k', 'ptf002',
        'title', 'المركبة تنتظرك ولا تنصرف',
        'text',  'ساعات الانتظار بندٌ مُسعَّر بسعر الساعة المعلن لفئة المركبة، ويدخل في السعر الذي تراه قبل التأكيد لا بعده.'),
      jsonb_build_object('_k', 'ptf003',
        'title', 'العودة في يومها أو في يومٍ آخر',
        'text',  'تحدّد موعد العودة عند الحجز، وإن كانت في اليوم نفسه حُسبت ساعات الانتظار من فارق التوقيت تلقائياً.'),
      jsonb_build_object('_k', 'ptf004',
        'title', 'الفئة تتّسع لكم ولحقائبكم',
        'text',  'تُعرض عليك الفئات التي تكفي عدد ركابك وعدد حقائبك معاً، فلا تُحجز مركبةٌ تُرفض عند التنفيذ.')
    ))
  where not exists (select 1 from public.sections s
                    where s.page_id = v_page and s.type = 'features');

  -- ── (٧-٣) الأسئلة — أربعةٌ، وأجوبتها هي سلوك النظام لا أمنياته ───────────
  insert into public.sections (page_id, type, sort, visible, content)
  select v_page, 'faq', 3, true, jsonb_build_object(
    'title', 'أسئلة شائعة عن الرحلات الخاصة',
    'style', jsonb_build_object('_v', 1),
    'items', jsonb_build_array(
      jsonb_build_object('_k', 'ptq001',
        'q', 'هل أستطيع تحديد أكثر من محطة في اليوم الواحد؟',
        'a', 'نعم، من صفحة طلب عرض السعر: تكتب المحطات وترتيبها ومدة الوقوف عند كل واحدة، فيُسعَّر البرنامج كاملاً ويصلك السعر قبل أي التزام. أما صفحة الحجز فتُسعّر فوراً رحلةً بين نقطتين بموعد عودة اختياري.'),
      jsonb_build_object('_k', 'ptq002',
        'q', 'كيف تُحسب ساعات الانتظار؟',
        'a', 'إن كانت العودة في اليوم نفسه اشتُقّت تلقائياً من الفارق بين موعدَي الذهاب والعودة وقُرِّبت إلى الساعة الأعلى. ولك أن تطلب عدداً أكبر صراحةً فيؤخذ الأكبر منهما، فلا يبتلع الحساب طلبك. وسعر الساعة معلن لكل فئة مركبة ويدخل في الإجمالي الظاهر قبل التأكيد.'),
      jsonb_build_object('_k', 'ptq003',
        'q', 'هل تبقى المركبة والسائق معنا طوال اليوم؟',
        'a', 'نعم. المركبة وسائقها مخصَّصان لرحلتك وحدها من موعد الانطلاق حتى موعد العودة المتفق عليه، وساعات وقوفهما بينهما محسوبة في السعر. وتصلك بيانات المركبة والسائق قبل التحرك.'),
      jsonb_build_object('_k', 'ptq004',
        'q', 'ما الذي لا يشمله سعر الرحلة؟',
        'a', 'السعر سعر النقل: المركبة وسائقها ومسافة رحلتك وساعات انتظارها. أما تذاكر دخول المزارات والإرشاد السياحي والوجبات فخارجه، وتُدفع في مواضعها.')
    ))
  where not exists (select 1 from public.sections s
                    where s.page_id = v_page and s.type = 'faq');

  -- ── (٧-٤) شريط الدعوة الختامي ────────────────────────────────────────────
  insert into public.sections (page_id, type, sort, visible, content)
  select v_page, 'cta-band', 4, true, jsonb_build_object(
    'title', 'يومٌ كامل بسيارة وسائق — ابدأ بموعدك ونقطتك',
    'note',  'حدّد نقطة الانطلاق والوجهة وموعدَي الذهاب والعودة، والسعر النهائي أمامك قبل التأكيد.',
    'style', jsonb_build_object('_v', 1))
  where not exists (select 1 from public.sections s
                    where s.page_id = v_page and s.type = 'cta-band');
end;
$$;

-- ============================================================================
-- §٨ — D-60: اللقطات الحيّة تُصالَح مع الصفوف
--
-- المقيس قبل الكتابة: لا `page_revisions` لأيٍّ من الصفحتين (الوحيدة الحيّة على
-- `home`). فالكتلة أدناه **لا تجد شيئاً اليوم**، ووجودها هو الفرق بين «صادف أن
-- لا لقطة» و«لو وُجدت لصُولحت» — والشاهد في §١٠ يرفع استثناءً إن اختلّت.
-- ============================================================================
update public.page_revisions r
set snapshot = jsonb_set(
      r.snapshot,
      '{sections}',
      (
        select coalesce(jsonb_agg(
          case
            when s.id is null then x
            else jsonb_set(x, '{content}', s.content)
          end
          order by ord
        ), '[]'::jsonb)
        from jsonb_array_elements(r.snapshot -> 'sections') with ordinality as e(x, ord)
        left join public.sections s on s.id::text = e.x ->> 'id'
      )
    )
where r.status in ('draft', 'published')
  and r.page_id in (select p.id from public.pages p where p.slug in ('business', 'private-trips'))
  and exists (
    select 1
    from jsonb_array_elements(r.snapshot -> 'sections') y
    join public.sections s2 on s2.id::text = y ->> 'id'
    where (y -> 'content') is distinct from s2.content
  );

-- ============================================================================
-- §٩ — الإنجليزية: **مسودةٌ في الطابور، ولا صفَّ منشور**
--
-- المفاتيح تُشتقّ من فرق الفهرس (§٠ ← الآن)، والقيمة تُوصَل بمطابقة **النصّ
-- العربي نفسه**. فإن أضافت الهجرة نصّاً لا مقابل له في الجدول أدناه ⇒ استثناء
-- في §١٠. ولا مفتاحَ يُكتب بيدٍ هنا إطلاقاً.
--
-- 🔒 **والوصل بالبصمة لا بالنصّ الخام** (`i18n_source_hash` — وهي نفسها التي
--    يقيس بها الطابور «هل تغيّر الأصل»): البصمة تطوي الفراغ، فلا يكسر الوصلَ
--    فارقُ نهاية سطر (‏`CRLF` مقابل `LF`) يزرعه `git` أو محرّر. ووصلٌ ينكسر هنا
--    لا يُنتج خطأً بل **مفتاحاً بلا مسودة** — عيبٌ صامت يمسكه §١٠-١١ لاحقاً،
--    والأولى ألّا يقع أصلاً.
-- ============================================================================
create temporary table _en_pairs_127 (ar text primary key, en text not null) on commit drop;

insert into _en_pairs_127 (ar, en) values
-- ── صفحة الرحلات الخاصة: العنوان والميتاداتا ───────────────────────────────
('الرحلات الخاصة',
 'Private Trips'),
('الرحلات الخاصة — سيارة بسائق ليوم كامل',
 'Private Trips — Car with Driver for a Full Day'),
('رحلة تُفصَّل على مسارك: جولة يوم أو أكثر بسيارة وسائق تبقى معك، تختار محطاتها وترتيبها ومدة وقوفك عند كل واحدة، وساعات الانتظار محسوبة في السعر قبل التأكيد.',
 'A trip tailored to your own route: a day or more by car and driver that stays with you, with the stops, their order and how long you pause at each one your choice, and waiting hours counted in the price before you confirm.'),

-- ── الترويسة ───────────────────────────────────────────────────────────────
('رحلة خاصة بمسارٍ تختاره أنت',
 'A private trip on a route you choose'),
('جولة يوم أو أكثر بسيارة وسائق يبقيان معك: تحدّد محطاتك وترتيبها ومدة وقوفك عند كل واحدة، والسعر يظهر قبل التأكيد.',
 'A day or more by car and driver that stay with you: you set your stops, their order and how long you pause at each one, and the price is shown before you confirm.'),
('احسب سعر رحلتك',
 'Calculate your trip price'),

-- ── النثر ──────────────────────────────────────────────────────────────────
('الرحلة الخاصة رحلةٌ تُبنى على يومك أنت لا على مسارٍ جاهز: تنطلق من العنوان الذي تحدده في الموعد الذي تختاره، وتبقى المركبة وسائقها معك حتى تنتهي، فتتحرك بينما تريد وتقف حيث تريد. وهي ما يناسب زيارة المعالم في يوم واحد، ومرافقة ضيفٍ قادم من الخارج، وقضاء مشاويرٍ متفرقة في مدينةٍ لا تعرف طرقها، وأي يومٍ يكون فيه انتظار المركبة أهم من سرعة الوصول.

وثلاثة أشياء تفرقها عن الرحلة العادية بين نقطتين. الأول ساعات الانتظار: هي بندٌ مُسعَّر بسعر الساعة المعلن لفئة المركبة، فوقوف السائق بينما تزور مكاناً محسوبٌ في السعر لا مطلوبٌ منك بعده. والثاني موعد العودة: تكتبه عند الحجز، وإن كانت العودة في اليوم نفسه اشتُقّت ساعات الانتظار من الفارق بين الموعدين تلقائياً وقُرِّبت إلى الساعة الأعلى — ولك أن تطلب عدداً أكبر صراحةً فيؤخذ الأكبر لا الأصغر. والثالث اتساع المركبة: تُعرض عليك الفئات التي تكفي عدد ركابك وعدد حقائبك معاً، فلا تُحجز مركبةٌ لا يتسع صندوقها لما معك.

وايجار ليموزين وسيط لخدمات النقل السياحي البري: تتلقى طلبك، وتسعّره، وتنسّقه، ثم ينفّذه متعهد معتمد من شبكتها بمركبته وسائقه — وتبقى المساءلة أمامك على الجهة التي حجزت معها. أما كيف تبدأ: فرحلةٌ من نقطة إلى نقطة بموعدَي ذهابٍ وعودة تُسعَّر فوراً من صفحة الحجز، وبرنامجُ يومٍ بعدة محطات يُرسَل من صفحة طلب عرض السعر بمحطاته ومواعيده فيُسعَّر برنامجاً كاملاً ويصلك سعره قبل أي التزام منك.',
 'A private trip is built around your day rather than a ready-made route: it starts from the address you name at the time you choose, and the vehicle and its driver stay with you until it ends, so you move when you want and stop where you want. It suits visiting several landmarks in one day, accompanying a guest arriving from abroad, running scattered errands in a city whose roads you do not know, and any day where having the vehicle wait matters more than arriving fast.

Three things separate it from an ordinary point-to-point ride. The first is waiting hours: they are a priced item at the published hourly rate for the vehicle class, so the driver standing by while you visit a place is counted in the price rather than asked of you afterwards. The second is the return time: you enter it when booking, and if the return falls on the same day the waiting hours are derived automatically from the gap between the two times and rounded up to the next hour — and you may ask for more explicitly, in which case the larger number is taken, not the smaller. The third is the size of the vehicle: you are shown the classes that fit your number of passengers and your number of bags together, so you never book a vehicle whose boot cannot hold what you are carrying.

Rent Limousine is a broker for road tourism transport: it receives your request, prices it, coordinates it, and then an approved contractor from its network carries it out with its own vehicle and driver — and accountability towards you stays with the party you booked with. As for how to start: a point-to-point trip with a departure and a return time is priced instantly from the booking page, while a multi-stop day programme is sent from the quote request page with its stops and times, priced as a whole programme, and its price reaches you before any commitment on your part.'),

-- ── المزايا ────────────────────────────────────────────────────────────────
('ما الذي يميّز الرحلة الخاصة',
 'What sets a private trip apart'),
('المسار كما ترسمه أنت',
 'The route exactly as you draw it'),
('تكتب نقطة الانطلاق والوجهة ومحطاتك ومواعيدها في تفاصيل الطلب، فيُسعَّر البرنامج كما هو لا كرحلةٍ بين نقطتين.',
 'You write the departure point, the destination, your stops and their times in the request details, so the programme is priced as it stands rather than as a point-to-point ride.'),
('المركبة تنتظرك ولا تنصرف',
 'The vehicle waits for you and does not leave'),
('ساعات الانتظار بندٌ مُسعَّر بسعر الساعة المعلن لفئة المركبة، ويدخل في السعر الذي تراه قبل التأكيد لا بعده.',
 'Waiting hours are a priced item at the published hourly rate for the vehicle class, and they are part of the price you see before you confirm, not after.'),
('العودة في يومها أو في يومٍ آخر',
 'A return on the same day or another day'),
('تحدّد موعد العودة عند الحجز، وإن كانت في اليوم نفسه حُسبت ساعات الانتظار من فارق التوقيت تلقائياً.',
 'You set the return time when booking, and if it falls on the same day the waiting hours are calculated automatically from the time difference.'),
('الفئة تتّسع لكم ولحقائبكم',
 'A class that fits you and your bags'),
('تُعرض عليك الفئات التي تكفي عدد ركابك وعدد حقائبك معاً، فلا تُحجز مركبةٌ تُرفض عند التنفيذ.',
 'You are shown the classes that cover your number of passengers and your number of bags together, so no vehicle is booked that would be refused at execution.'),

-- ── الأسئلة ────────────────────────────────────────────────────────────────
('أسئلة شائعة عن الرحلات الخاصة',
 'Common questions about private trips'),
('هل أستطيع تحديد أكثر من محطة في اليوم الواحد؟',
 'Can I set more than one stop in a single day?'),
('نعم، من صفحة طلب عرض السعر: تكتب المحطات وترتيبها ومدة الوقوف عند كل واحدة، فيُسعَّر البرنامج كاملاً ويصلك السعر قبل أي التزام. أما صفحة الحجز فتُسعّر فوراً رحلةً بين نقطتين بموعد عودة اختياري.',
 'Yes, from the quote request page: you write the stops, their order and how long you pause at each one, the whole programme is priced, and the price reaches you before any commitment. The booking page, by contrast, prices instantly a point-to-point trip with an optional return time.'),
('كيف تُحسب ساعات الانتظار؟',
 'How are waiting hours calculated?'),
('إن كانت العودة في اليوم نفسه اشتُقّت تلقائياً من الفارق بين موعدَي الذهاب والعودة وقُرِّبت إلى الساعة الأعلى. ولك أن تطلب عدداً أكبر صراحةً فيؤخذ الأكبر منهما، فلا يبتلع الحساب طلبك. وسعر الساعة معلن لكل فئة مركبة ويدخل في الإجمالي الظاهر قبل التأكيد.',
 'If the return is on the same day they are derived automatically from the gap between the departure and return times and rounded up to the next hour. You may also ask for a larger number explicitly, in which case the larger of the two is taken, so the calculation never swallows your request. The hourly rate is published for each vehicle class and is part of the total shown before you confirm.'),
('هل تبقى المركبة والسائق معنا طوال اليوم؟',
 'Do the vehicle and driver stay with us all day?'),
('نعم. المركبة وسائقها مخصَّصان لرحلتك وحدها من موعد الانطلاق حتى موعد العودة المتفق عليه، وساعات وقوفهما بينهما محسوبة في السعر. وتصلك بيانات المركبة والسائق قبل التحرك.',
 'Yes. The vehicle and its driver are dedicated to your trip alone from the departure time until the agreed return time, and the hours they stand by in between are counted in the price. The vehicle and driver details reach you before the trip starts.'),
('ما الذي لا يشمله سعر الرحلة؟',
 'What does the trip price not cover?'),
('السعر سعر النقل: المركبة وسائقها ومسافة رحلتك وساعات انتظارها. أما تذاكر دخول المزارات والإرشاد السياحي والوجبات فخارجه، وتُدفع في مواضعها.',
 'The price is the transport price: the vehicle, its driver, the distance of your trip and its waiting hours. Entry tickets to sites, tour guiding and meals fall outside it and are paid where they arise.'),

-- ── شريط الدعوة في صفحة الرحلات الخاصة ─────────────────────────────────────
('يومٌ كامل بسيارة وسائق — ابدأ بموعدك ونقطتك',
 'A full day by car and driver — start with your time and your point'),
('حدّد نقطة الانطلاق والوجهة وموعدَي الذهاب والعودة، والسعر النهائي أمامك قبل التأكيد.',
 'Set the departure point, the destination and the two times, and the final price is in front of you before you confirm.'),

-- ── صفحة الشركات: جدول الالتزامات ──────────────────────────────────────────
('الالتزامات المكتوبة التي تحكم تحرّككم',
 'The written commitments that govern your movements'),
('البند',
 'Item'),
('ما هو منصوص عليه',
 'What is stipulated'),
('وهذه بنودٌ منشورةٌ في الشروط والأحكام وسياسة الاسترداد يستطيع أي موظف لديكم قراءتها قبل التعاقد، لا وعوداً تُكتب في صفحة تسويقية.',
 'These are clauses published in the Terms and Conditions and the Refund Policy that anyone on your team can read before contracting — not promises written on a marketing page.'),
('الإلغاء المجاني للمناسبات والمؤتمرات والأفواج',
 'Free cancellation for occasions, conferences and groups'),
('قبل موعد التحرّك باثنتين وسبعين ساعة على الأقل',
 'At least seventy-two hours before the movement time'),
('الإلغاء المجاني للسفر بين المحافظات والجولات',
 'Free cancellation for intercity travel and tours'),
('قبل موعد التحرّك بثمانٍ وأربعين ساعة على الأقل',
 'At least forty-eight hours before the movement time'),
('الانتظار المجاني في استقبال المطارات',
 'Free waiting on airport pickups'),
('ستون دقيقة تُحسب من الهبوط الفعلي للطائرة لا من الموعد المجدول',
 'Sixty minutes counted from the actual landing of the aircraft, not from the scheduled time'),
('تأخّر المركبة عن موعد التحرّك أكثر من ثلاثين دقيقة لسببٍ راجعٍ إلينا',
 'The vehicle being more than thirty minutes late for a reason attributable to us'),
('لكم الاختيار بين خصمٍ يُتفق عليه أو إلغاءٍ مجاني واسترداد كامل المبلغ',
 'You choose between an agreed discount or a free cancellation with a full refund'),
('التأجيل بدل الإلغاء',
 'Postponement instead of cancellation'),
('مرة واحدة مجاناً قبل الموعد بأربع وعشرين ساعة ووفق توفّر المركبات، ويبقى المبلغ رصيداً للحجز الجديد',
 'Once, free of charge, twenty-four hours before the time and subject to vehicle availability, with the amount kept as credit for the new booking'),

-- ── صفحة الشركات: شريط الدعوة ──────────────────────────────────────────────
('تحرّكٌ واحد أو برنامجٌ متكرر — أرسلوا تفاصيله',
 'A single movement or a recurring programme — send us its details'),
('التاريخ والمواعيد، ونقاط الانطلاق والوصول، وعدد الركاب — ويصلكم السعر قبل أي التزام.',
 'The date and times, the departure and arrival points, and the number of passengers — and the price reaches you before any commitment.');

-- 🔒 والإدراج **مسودةٌ حصراً**: `status` تُترك على افتراضيّها `'draft'`، ولا
--    تُمسّ صفوفٌ قائمة (‏`on conflict do nothing`) — فلا ترجمةَ راجعها إنسانٌ
--    تُدهس بمسودةٍ آلية.
-- ولا صفَّ مكرَّرَ البصمة في الجدول أعلاه: بصمتان متطابقتان تعنيان وصلاً
-- يُنتج صفَّين لمفتاحٍ واحد ⇒ `on conflict` يبتلع أحدهما صامتاً.
do $$
declare v_dup text;
begin
  select string_agg(x.h, ', ') into v_dup
  from (select public.i18n_source_hash(ar) as h from _en_pairs_127
        group by 1 having count(*) > 1) x;
  if v_dup is not null then
    raise exception '0127: بصمتان متطابقتان في جدول الترجمة — %', v_dup;
  end if;
end;
$$;

insert into public.translations (locale, namespace, key, source_text, value, provider)
select 'en', d.ns, d.k, d.src, e.en, 'migration-0127'
from (
  select c.ns, c.k, c.src
  from public.i18n_corpus_rows() c
  where not exists (
    select 1 from _corpus_before_127 b where b.ns = c.ns and b.k = c.k)
) d
join _en_pairs_127 e
  on public.i18n_source_hash(e.ar) = public.i18n_source_hash(d.src)
where exists (select 1 from public.locales l where l.code = 'en' and not l.is_default)
on conflict (locale, namespace, key) do nothing;

-- ============================================================================
-- §١٠ — فحصٌ ذاتي: الهجرة تُثبت أنها فعلت ما تدّعيه
-- ============================================================================
do $$
declare
  v_bad   text;
  v_n     integer;
  v_page  uuid;
  v_len   integer;
  v_tag   text;
begin
  -- ══ (١٠-١) أعمدة المصدر موجودة، وثلاثة الطلبات القائمة لم تُكسر ══════════
  select count(*) into v_n
  from information_schema.columns
  where table_schema = 'public' and table_name = 'quote_requests'
    and column_name in ('source_page','source_referrer','utm_source','utm_medium','utm_campaign');
  if v_n <> 5 then
    raise exception '0127: أعمدة المصدر % لا ٥', v_n;
  end if;

  select count(*) into v_n
  from information_schema.columns
  where table_schema = 'public' and table_name = 'quote_requests'
    and column_name in ('source_page','source_referrer','utm_source','utm_medium','utm_campaign')
    and (is_nullable <> 'YES' or column_default is not null);
  if v_n <> 0 then
    raise exception '0127: عمودُ مصدرٍ إلزاميّ أو بافتراضيّ — الماضي لا يُنسب إليه ما لم يُقَس';
  end if;

  -- ══ (١٠-٢) 🔴 الحارس حيّ: قيمةٌ خبيثة طويلة تُقصّ وتُطبَّع ═══════════════
  --      نداءٌ حيّ لا قراءةُ نصّ (القاعدة ١٩).
  v_tag := public.quote_source_tag(
    E'  <ScRiPt>alert(1)</ScRiPt>‮  ' || repeat('ي', 400));
  if v_tag is null then
    raise exception '0127: المُطبّع محا الوسم كله — المطلوب تنظيفٌ لا إعدام';
  end if;
  if length(v_tag) > 64 then
    raise exception '0127: الوسم المُطبَّع طوله % > ٦٤', length(v_tag);
  end if;
  if v_tag ~ '[<>()/\u200E\u200F\u202A-\u202E\u2066-\u2069]' then
    raise exception '0127: محرفُ وسمٍ أو توجيهٍ نجا من المُطبّع: %', v_tag;
  end if;

  -- والمضيف: عنوانٌ كامل يُرفض كاملاً، واسمٌ خالص يمرّ بلا `www.`
  if public.quote_source_host('https://ads.example.com/x?token=abc') is not null then
    raise exception '0127: مُطبّع المضيف قبل عنواناً كاملاً — سلسلة استعلام غريبة تدخل قاعدتنا';
  end if;
  if public.quote_source_host('WWW.Facebook.com') <> 'facebook.com' then
    raise exception '0127: مُطبّع المضيف لم ينزع www أو لم يخفض الحالة';
  end if;

  -- والمسار: صفحةٌ لنا تمرّ، وتوكن حجزٍ يُرفض، وبادئة اللغة تُنزع
  if public.quote_source_page('/business') <> '/business' then
    raise exception '0127: مسارٌ داخليّ صحيح رُفض';
  end if;
  if public.quote_source_page('/en/business/') <> '/business' then
    raise exception '0127: بادئة اللغة أو الشرطة الختامية لم تُنزع (D-24)';
  end if;
  if public.quote_source_page('/booking/9f3a2b1c') is not null then
    raise exception '0127: 🔴 مسارُ توكن متابعةٍ قُبل مصدراً — نسخةٌ ثانية من مفتاح وصول';
  end if;
  if public.quote_source_page('/admin/orders') is not null then
    raise exception '0127: مسارٌ إداريّ قُبل مصدراً';
  end if;
  if public.quote_source_page('https://evil.example/x') is not null then
    raise exception '0127: عنوانٌ خارجيّ قُبل مساراً داخلياً';
  end if;

  -- ══ (١٠-٣) التوقيع الجديد قائم، والقديم سقط ════════════════════════════
  if to_regprocedure('public.create_quote_request(text,text,text,text,text,numeric,numeric,text,numeric,numeric,timestamptz,integer,integer,text,text,text,text,text)') is null then
    raise exception '0127: التوقيع الثماني‑عشري غير موجود';
  end if;
  if to_regprocedure('public.create_quote_request(text,text,text,text,text,numeric,numeric,text,numeric,numeric,timestamptz,integer,integer)') is not null then
    raise exception '0127: التوقيع الثلاثي‑عشري ما زال قائماً — نداءٌ غامض بين توقيعين';
  end if;

  -- ══ (١٠-٤) الشركات: خمسةٌ صارت سبعة، وترتيبها متسق ═══════════════════════
  select p.id into v_page from public.pages p where p.slug = 'business';
  select count(*) into v_n from public.sections s where s.page_id = v_page;
  if v_n <> 7 then
    raise exception '0127: أقسام صفحة الشركات % لا ٧', v_n;
  end if;
  if (select count(distinct s.sort) from public.sections s where s.page_id = v_page) <> 7 then
    raise exception '0127: ترتيبٌ مكرَّر في صفحة الشركات';
  end if;

  -- ══ (١٠-٥) الرحلات الخاصة: صفحةٌ منشورة بخمسة أقسام كلها تُصيَّر ═════════
  select p.id into v_page from public.pages p where p.slug = 'private-trips';
  if v_page is null then
    raise exception '0127: صفحة private-trips غير موجودة';
  end if;
  if not exists (select 1 from public.pages p
                 where p.id = v_page and p.published and p.kind = 'landing') then
    raise exception '0127: private-trips غير منشورة أو ليست landing';
  end if;
  select count(*) into v_n from public.sections s where s.page_id = v_page;
  if v_n <> 5 then
    raise exception '0127: أقسام private-trips % لا ٥', v_n;
  end if;

  -- ══ (١٠-٦) كل كتلةٍ ظاهرة على الصفحتين ما زالت تُصيَّر ═══════════════════
  select string_agg(distinct p.slug || '/' || s.type, ', ') into v_bad
  from public.sections s
  join public.pages p on p.id = s.page_id
  where p.slug in ('business', 'private-trips')
    and s.visible
    and not public.block_renders(s.type, coalesce(s.content, '{}'::jsonb));
  if v_bad is not null then
    raise exception '0127: كتلةٌ ظاهرة لا تُصيَّر — %', v_bad;
  end if;

  -- ══ (١٠-٧) `<h1>` واحدٌ لكل صفحة (شرط 0095 ٧-٧) ════════════════════════
  select string_agg(p.slug || '=' || d.n, ', ') into v_bad
  from (select s.page_id, count(*) as n from public.sections s
        where s.type in ('page-hero','hero') and s.visible group by s.page_id) d
  join public.pages p on p.id = d.page_id
  where p.slug in ('business','private-trips') and d.n <> 1;
  if v_bad is not null then
    raise exception '0127: عددُ عناوين h1 على الصفحة ليس واحداً — %', v_bad;
  end if;

  -- ══ (١٠-٨) حدود السيو على الصفحة الجديدة (نفس أرقام 0095 ٧-٥/٧-٦) ═══════
  select length(p.meta ->> 'title') into v_len
  from public.pages p where p.slug = 'private-trips';
  if v_len > 45 then
    raise exception '0127: عنوان private-trips % حرفاً > ٤٥ فيُقصّ في النتائج', v_len;
  end if;
  select length(p.meta ->> 'description') into v_len
  from public.pages p where p.slug = 'private-trips';
  if v_len < 140 or v_len > 160 then
    raise exception '0127: وصف private-trips % حرفاً خارج ١٤٠-١٦٠', v_len;
  end if;
  if exists (select 1 from public.pages p
             where p.slug = 'private-trips' and p.meta ->> 'title' like '%ايجار ليموزين%') then
    raise exception '0127: اسم العلامة في meta.title يتكرّر مع القالب';
  end if;

  -- ══ (١٠-٩) قواعد المحتوى التي فرضتها 0095 — تسري على الجديد ═════════════
  select string_agg(distinct p.slug || '/' || s.type, ', ') into v_bad
  from public.sections s join public.pages p on p.id = s.page_id
  where p.slug in ('business','private-trips')
    and (s.content::text ~ 'أسطولنا|سياراتنا|سائقونا|أساطيل|موظفونا'
      or s.content::text ~ '!|أفضل |الأرخص|الرائد|لا مثيل'
      or s.content::text ~ 'نص عنوان القسم|اضغط|الإنطلاق|فئآت');
  if v_bad is not null then
    raise exception '0127: ادّعاءُ ملكٍ أو تفضيلٌ أو نصٌّ نائب في: %', v_bad;
  end if;

  select string_agg(d.slug || '=' || d.n, ', ') into v_bad
  from (
    select p.slug,
           sum((length(s.content::text) -
                length(replace(s.content::text, 'ايجار ليموزين', ''))) / length('ايجار ليموزين')) as n
    from public.pages p join public.sections s on s.page_id = p.id
    where p.slug in ('business','private-trips')
    group by p.slug
  ) d
  where d.n > 3;
  if v_bad is not null then
    raise exception '0127: تكرارُ اسم العلامة في نثر صفحةٍ واحدة — حشوُ كلماتٍ مفتاحية: %', v_bad;
  end if;

  -- ══ (١٠-١٠) D-60: صفر لقطةٍ حيّة تخالف صفَّها ═══════════════════════════
  select string_agg(r.id::text || '/' || (x ->> 'id'), ', ') into v_bad
  from public.page_revisions r,
       jsonb_array_elements(r.snapshot -> 'sections') x
  join public.sections s on s.id::text = x ->> 'id'
  where r.status in ('draft','published')
    and (x -> 'content') is distinct from s.content;
  if v_bad is not null then
    raise exception '0127: لقطةٌ حيّة تخالف صفَّها — أول نشرة تمحو التحرير: %', v_bad;
  end if;

  -- ══ (١٠-١١) 🔴 الترجمة: كل مفتاحٍ جديدٍ له مسودةٌ إنجليزية، **ولا منشور** ═
  select string_agg(d.ns || '/' || d.k, ', ') into v_bad
  from (
    select ns, k from public.i18n_corpus_rows()
    except
    select b.ns, b.k from _corpus_before_127 b
  ) d
  where not exists (
    select 1 from public.translations t
    where t.locale = 'en' and t.namespace = d.ns and t.key = d.k);
  if v_bad is not null then
    raise exception '0127: مفتاحٌ جديد بلا صفِّ ترجمة — %', v_bad;
  end if;

  select count(*) into v_n
  from public.translations t
  where t.provider = 'migration-0127' and t.status <> 'draft';
  if v_n <> 0 then
    raise exception '0127: 🔴 % صفَّ ترجمةٍ خرج من المسودة — النشر قرارُ المالك وحده (D-25)', v_n;
  end if;

  select count(*) into v_n
  from public.translations t where t.provider = 'migration-0127';
  raise notice '  ↳ مسودات إنجليزية أضافتها 0127: %', v_n;

  -- ══ (١٠-١٢) ولا مفتاحَ فُقد بالترتيب الجديد في صفحة الشركات ═════════════
  select string_agg(a.ns || '/' || a.k, ', ') into v_bad
  from (select ns, k from _corpus_before_127
        except
        select ns, k from public.i18n_corpus_rows()) a;
  if v_bad is not null then
    raise exception '0127: مفتاحُ ترجمةٍ فُقد — %', v_bad;
  end if;

  raise notice '✔ 0127: مصدرُ الطلب محروسٌ بثلاث طبقات · الشركات ٧ أقسام · private-trips منشورة بخمسة · الإنجليزية مسودةٌ بالكامل';
end;
$$;
