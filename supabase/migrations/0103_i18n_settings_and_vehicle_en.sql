-- ============================================================================
-- 0103_i18n_settings_and_vehicle_en.sql
-- أربعة عشر مفتاحاً تُصيَّر في الصفحة الإنجليزية بلا صفِّ ترجمةٍ واحد —
-- تُكتب **مسوداتٍ** لا منشورات، فالنشر قرار المالك لا قرار الهجرة.
--
-- ── العيب، مقيساً لا مفترضاً (2026-08-18، 02:46–02:55Z) ─────────────────────
--
--   select (select count(*) from public.i18n_corpus_rows())                   ⇒ ٨٩٧
--   select count(*) from public.translations where locale = 'en'              ⇒ ٨٧٧
--
-- والعشرون الغائبة ليست موزَّعةً عشوائياً، بل **فضاءا اسمٍ كاملان** خرجا صفراً:
--
--   | الفضاء | في الفهرس | في `translations`(en) |
--   |---|---|---|
--   | `page`     | ٦٩  | ٦٩  |
--   | `section`  | ٨٠٨ | ٨٠٢ (‏٧٩٦ منشور + ٦ مسودات `href`) |
--   | `service`  | ٦   | ٦   |
--   | **`settings`** | **٦** | **٠** |
--   | **`vehicle`**  | **٨** | **٠** |
--
-- ⚠ **ولهذا لم يستطع المتحقِّق التسلسلي الحكم على البند**: بحث عن فضاء `ui`
--    فلم يجده، فظنّ المفاتيح مجهولة. والحقيقة أبسط وأسوأ: `settings` و`vehicle`
--    **مسموحان في القيد** (`translations_namespace_check` يحمل السبعة:
--    ui · page · section · settings · service · vehicle · discount) — لكن لا صفَّ
--    واحداً كُتب فيهما قط. فالغياب غيابُ عملٍ لا غيابُ عقد.
--
-- ── ما الذي يراه الزائر الإنجليزي اليوم بالضبط ─────────────────────────────
--
-- `localized_settings('en')` تقرأ `namespace='settings' and status='published'`
-- (الكتالوج الحيّ، D-58). والخريطة فارغة ⇒ `i18n_override` لا تجد بديلاً ⇒
-- **ستُّ سلاسل عربية تعود كما هي** على صفحةٍ `lang="en" dir="ltr"`:
--   `brand.name` · `brand.tagline` · `company.legalName` · `company.activity`
--   · `seo.titleTemplate` · `seo.defaultDescription` — وثلاثٌ منها في `<title>`
--   و`<meta name="description">` أي **في نتيجة البحث نفسها** لا في جسم الصفحة.
-- ومثلها `lib/i18n/content.ts:346` يقرأ فضاء `vehicle` بمفاتيح
-- `<slug>.title` و`<slug>.short`، فيسقط إلى العربية للفئات الأربع.
--
-- 🔴 **وهذا حيٌّ لا افتراضي**: `enabled_locales()` تُعلن `en` بـ٨٧١ صفاً منشوراً،
--    و`/en` يردّ ٢٠٠ بنصٍّ إنجليزيّ حقيقي. الحاجزُ الوحيد عن جوجل هو `noindex`
--    الثلاثي — ويوم يُرفع تدخل هذه الستّ عربيةً إلى الفهرس.
--
-- ── القرار: **مسودات**، والمصدرُ من الفهرس الحيّ لا من هذا الملف ────────────
--
-- (١) **`status = 'draft'`** — ولا حرف يُنشر من هجرة. والسبب ليس حذراً عاماً:
--     `locales.en.auto_publish = true`، فنداءُ `upsert_translations` بقيمةٍ
--     **كان سيكتبها `published` فوراً** (فرع «صف جديد» في جسمها الحيّ). ولهذا
--     تكتب هذه الهجرة `insert` مباشراً بحالةٍ صريحة، **ولا تنادي الدالة**.
--
-- (٢) **`provider = 'human'`** — والمعنى في هذا المستودع «ليست من مزوّد ترجمة
--     آلية»، لا «كتبها بشر». و`draft_publish_plan` تحكم بـ`machine` على كل
--     `coalesce(provider,'human') <> 'human'` وتستثنيه من زرّ الدفعة **أبداً**.
--     ⇒ لو وُسمت بغير ذلك لبقيت المسودات الأربع عشرة خارج متناول زرّ المالك
--     إلى الأبد، ولوجب عليه فتحُ أربعة عشر صفاً بيده. وهي مسوداتٌ في الحالتين:
--     **لا شيء يُنشر حتى يضغط هو**.
--
-- (٣) **`source_text` من `i18n_corpus_rows()` بالانضمام لا بالنسخ.** المفتاح
--     الذي لا تُخرجه الدالة **يوقف الهجرة** (فحص ٣-١): صفٌّ لمفتاحٍ ميت هو
--     صفٌّ لا يراه أحد ولا يحذفه أحد. و`source_hash` عمودٌ **مولَّدٌ مخزَّن**
--     (`attgenerated='s'`, `i18n_source_hash(source_text)`) ⇒ **لا يُكتب هنا**.
--
-- (٤) **وبصمةُ الأصل تُفحص قبل الكتابة**: لكل مفتاحٍ نصُّه العربي المتوقَّع في
--     `values`. فلو حرّر المالك «ايجار ليموزين» أمس، لم تُكتب ترجمةٌ لنصٍّ
--     آخر صامتةً — بل يرتفع استثناء باسم المفتاح والفرق.
--
-- ── الترجمات ومن أين جاءت كلمتُها ──────────────────────────────────────────
--
-- **لا واحدة منها مخترعة**: كلُّ مصطلحٍ منقولٌ من الـ٨٧١ صفاً المنشورة سلفاً،
-- فلا يظهر للزائر اسمان لشيءٍ واحد في صفحةٍ واحدة:
--
--   | العربي | الإنجليزي | الشاهد المنشور |
--   |---|---|---|
--   | ايجار ليموزين | **Rent Limousine** | `3b87ac09….typingPrefix` وعشرُ صفحات مسار |
--   | النقل السياحي | tourist transport | `de07b9ec….sub` · `734b1d7a….title` |
--   | منصة | platform | `4b6edccd….title` |
--   | جمهورية مصر العربية | the Arab Republic of Egypt | `8f3ab9a1….body` (شروط) |
--   | استقبال المطارات | airport transfers | `745549af….meta.description` |
--   | بين المحافظات | intercity | `b0000000…3101.items.tsc003.c1` |
--   | جولات سياحية | sightseeing tours | `7527f0ed….meta.title` |
--   | الأفواج | groups | `b0000000…3214.title` |
--   | الحقائب | bags | `9fb21836….items.cnf003.text` |
--   | سيدان/SUV/ميني باص/باص | Sedan / SUV / minibus / bus | `0b610000…0002.items.stbcls.label` |
--
-- ✅ **و`company.legalName` بقرار المالك نصّاً** (‏`OWNER-DECISIONS-2026-08-17 §٣`):
--    «تقدر تترجم الإسم عادي» ⇒ **`Rent Limousine`** — يطابق النطاق
--    `rentlimousine` والمحتوى المنشور، فلا يقرأ المتعاقد اسمين.
--
-- ⚠ **وما لا تكتبه هذه الهجرة وإن بدا ناقصاً:**
--    - **الستّة `*.href`** (‏`734b1d7a….items.sv*.href`): روابط لا نصّ — و`0104`
--      تُخرجها من الفهرس أصلاً. D-24: الروابط لا تُترجم.
--    - **`vehicle.<slug>.seats`** و**`service.<slug>.short`**: مفاتيح **يملكها
--      المستودع** لا القاعدة (`app/api/i18n/translate/route.ts` §`repoCorpusRows`)،
--      و`i18n_corpus_rows()` لا تُخرجها ⇒ كتابتُها هنا تنقض الفحص ٣-١.
--      (و`seats` ليست تسريباً أصلاً: `seatsLabel` تولّد `Up to N passengers`
--       بنفسها حين `locale <> 'ar'` — قُرئ من `lib/i18n/content.ts:274`.)
--    - **`locales[*].name`**: أسماء اللغات في `localized_settings.locales` تُقرأ
--      من جدول `locales` مباشرةً لا من `translations` — **ولا يُلمس `locales`**.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (١) خطُّ الأساس **قبل** — فالفحص يقارن بما كان لا بما نتمنّاه
-- ----------------------------------------------------------------------------
create temporary table _en_before_103 on commit drop as
select
  (select count(*) from public.translations
    where locale = 'en' and status = 'published')            as published_before,
  (select count(*) from public.translations
    where locale = 'en')                                     as rows_before,
  (select count(*) from public.i18n_corpus_rows())           as corpus_before,
  (select count(*) from public.locales where enabled)        as locales_before;

-- ----------------------------------------------------------------------------
-- (٢) الأربعة عشر — أصلُها من الفهرس، وبصمتُها مفحوصة
-- ----------------------------------------------------------------------------
create temporary table _want_103 (
  ns       text not null,
  k        text not null,
  src_want text not null,
  val_en   text not null
) on commit drop;

insert into _want_103 (ns, k, src_want, val_en) values
  -- (أ) الإعدادات الستّ — ثلاثٌ منها تظهر في نتيجة البحث نفسها
  ('settings', 'brand.name',
   'ايجار ليموزين',
   'Rent Limousine'),
  ('settings', 'brand.tagline',
   'ايجار ليموزين المطار و بين المحافظات و جولات سياحية',
   'Rent Limousine — airport transfers, intercity travel and sightseeing tours'),
  ('settings', 'company.legalName',
   'ايجار ليموزين',
   'Rent Limousine'),
  ('settings', 'company.activity',
   'خدمات ليموزين سياحي داخل جمهورية مصر العربية',
   'Tourist limousine services inside the Arab Republic of Egypt'),
  ('settings', 'seo.titleTemplate',
   '%s | منصة النقل السياحي',
   '%s | Tourist Transport Platform'),
  ('settings', 'seo.defaultDescription',
   'احجز سيارتك بسائق في ثوانٍ — استقبال مطارات، تنقلات داخل المدينة وبين المحافظات، جولات سياحية ومناسبات. أسعار واضحة وسيارات حديثة.',
   'Book a car with driver in seconds — airport transfers, city rides and intercity travel, sightseeing tours and occasions. Clear prices, modern cars.'),

  -- (ب) الفئات الأربع: عنوانٌ ووصفٌ لكلٍّ — تُقرأ في `lib/i18n/content.ts:346`
  ('vehicle', 'sedan.title',   'سيدان',    'Sedan'),
  ('vehicle', 'sedan.short',
   'خيار اقتصادي أنيق للأفراد والرحلات الخفيفة.',
   'An elegant, economical choice for individuals and light trips.'),
  ('vehicle', 'suv.title',     'SUV',      'SUV'),
  ('vehicle', 'suv.short',
   'مساحة وراحة أعلى للعائلات والحقائب.',
   'More space and comfort for families and their bags.'),
  ('vehicle', 'minibus.title', 'ميني باص', 'Minibus'),
  ('vehicle', 'minibus.short',
   'مثالي للمجموعات المتوسطة والرحلات المشتركة.',
   'Ideal for medium-sized groups and shared rides.'),
  ('vehicle', 'bus.title',     'باص',      'Bus'),
  ('vehicle', 'bus.short',
   'للمجموعات الكبيرة والمؤتمرات والأفواج.',
   'For large groups, conferences and tour parties.');

-- ----------------------------------------------------------------------------
-- (٣) الحواجز **قبل** أيّ كتابة
-- ----------------------------------------------------------------------------
do $g103$
declare
  v_bad text;
  v_n   integer;
begin
  -- (٣-١) 🔴 مفتاحٌ لا تُخرجه `i18n_corpus_rows()` ⇒ توقّف، لا صفٌّ صامت
  select string_agg(w.ns || '/' || w.k, '، ') into v_bad
  from _want_103 w
  where not exists (
    select 1 from public.i18n_corpus_rows() c where c.ns = w.ns and c.k = w.k
  );
  if v_bad is not null then
    raise exception '0103: مفاتيح ليست في الفهرس الحيّ — لا تُكتب لها صفوف: %', v_bad;
  end if;

  -- (٣-٢) والأصل العربي هو ما تُرجم فعلاً — لا نصٌّ حرّره المالك بعده
  select string_agg(w.ns || '/' || w.k || ' ⇒ «' || c.src || '»', '، ') into v_bad
  from _want_103 w
  join public.i18n_corpus_rows() c on c.ns = w.ns and c.k = w.k
  where c.src is distinct from w.src_want;
  if v_bad is not null then
    raise exception '0103: الأصل العربي تغيّر عمّا تُرجم — راجِع قبل الكتابة: %', v_bad;
  end if;

  -- (٣-٣) ولا صفَّ إنجليزيّاً قائماً على أيٍّ منها (وإلا فليس هذا عيبَنا)
  select count(*) into v_n
  from public.translations tr
  join _want_103 w on w.ns = tr.namespace and w.k = tr.key
  where tr.locale = 'en';
  if v_n <> 0 then
    raise exception '0103: % صفَّ إنجليزيّاً قائمٌ سلفاً على هذه المفاتيح — الوضع تغيّر، أعد القياس', v_n;
  end if;

  -- (٣-٤) واللغة مسجَّلة وليست الأساس (وإلا فالإدراج يخالف المفتاح الأجنبي)
  if not exists (select 1 from public.locales l where l.code = 'en' and not l.is_default) then
    raise exception '0103: en غير مسجَّلة أو أنها لغة الأساس';
  end if;

  raise notice '  ← الحواجز عبرت: ١٤ مفتاحاً في الفهرس، أصلُها مطابق، ولا صفَّ قائماً';
end;
$g103$;

-- ----------------------------------------------------------------------------
-- (٤) الكتابة — مسوداتٌ وحدها، والأصل من الفهرس
-- ----------------------------------------------------------------------------
insert into public.translations
  (locale, namespace, key, source_text, value, status, provider)
select 'en', w.ns, w.k, c.src, w.val_en, 'draft', 'human'
from _want_103 w
join public.i18n_corpus_rows() c on c.ns = w.ns and c.k = w.k;

-- ----------------------------------------------------------------------------
-- (٥) الفحص الذاتي — بعدَه، وبما كان قائماً قبله (D-58)
-- ----------------------------------------------------------------------------
do $c103$
declare
  b     record;
  v_n   integer;
  v_bad text;
  v_map jsonb;
begin
  select * into b from _en_before_103;

  -- (٥-١) أربعة عشر صفاً، كلُّها مسودة، ولا واحدٍ منشور
  select count(*) into v_n
  from public.translations tr
  join _want_103 w on w.ns = tr.namespace and w.k = tr.key
  where tr.locale = 'en';
  if v_n <> 14 then
    raise exception '0103: كُتب % صفاً بدل ١٤', v_n;
  end if;

  select count(*) into v_n
  from public.translations tr
  join _want_103 w on w.ns = tr.namespace and w.k = tr.key
  where tr.locale = 'en' and tr.status <> 'draft';
  if v_n <> 0 then
    raise exception '0103: 🔴 % صفاً خرج من حالة draft — الهجرة لا تنشر', v_n;
  end if;

  -- (٥-٢) 🔴 عدّاد المنشور لم يتحرّك بصفٍّ واحد
  select count(*) into v_n
  from public.translations where locale = 'en' and status = 'published';
  if v_n <> b.published_before then
    raise exception '0103: 🔴 المنشور الإنجليزي تحرّك % ⇐ % — الهجرة لا تنشر حرفاً',
      b.published_before, v_n;
  end if;

  -- (٥-٣) `locales` لم تُلمس، ولا لغةٌ ظهرت أو غابت
  select count(*) into v_n from public.locales where enabled;
  if v_n <> b.locales_before then
    raise exception '0103: 🔴 عدد اللغات المفعّلة تغيّر % ⇐ %', b.locales_before, v_n;
  end if;
  if not exists (select 1 from public.enabled_locales() where code = 'en'
                   and published_count = b.published_before) then
    raise exception '0103: 🔴 enabled_locales() تُعلن عدّاداً غير %', b.published_before;
  end if;

  -- (٥-٤) الفهرس نفسه لم يتغيّر — هذه الهجرة لا تكتب في محتوى الموقع
  select count(*) into v_n from public.i18n_corpus_rows();
  if v_n <> b.corpus_before then
    raise exception '0103: 🔴 الفهرس تحرّك % ⇐ % — لم يكن يُفترض أن يُلمس محتوى',
      b.corpus_before, v_n;
  end if;

  -- (٥-٥) وبصماتها صحيحة (العمود مولَّد — والفحص يثبت أنه فعل)
  select string_agg(tr.key, '، ') into v_bad
  from public.translations tr
  join _want_103 w on w.ns = tr.namespace and w.k = tr.key
  where tr.locale = 'en'
    and tr.source_hash is distinct from public.i18n_source_hash(tr.source_text);
  if v_bad is not null then
    raise exception '0103: بصمةُ الأصل لا تطابق نصَّه — %', v_bad;
  end if;

  -- (٥-٦) 🔴 والشاهد الحاكم: الصفحة الإنجليزية **ما زالت عربية** في هذه الستّ،
  --        لأنها مسودات. فلو انقلب شيءٌ منها إنجليزياً الآن لكان قد نُشر.
  v_map := public.localized_settings('en');
  if (v_map -> 'brand' ->> 'name') is distinct from 'ايجار ليموزين'
     or (v_map -> 'company' ->> 'legalName') is distinct from 'ايجار ليموزين'
     or (v_map -> 'seo' ->> 'titleTemplate') is distinct from '%s | منصة النقل السياحي' then
    raise exception '0103: 🔴 localized_settings(en) تغيّرت — أي أن صفاً نُشر بلا إذن المالك';
  end if;

  -- (٥-٧) ومسار المالك مفتوح: الأربعة عشر مؤهَّلةٌ لزرّ «راجِع وانشر»
  select count(*) into v_n
  from public.draft_publish_plan('en') p
  join public.translations tr on tr.id = p.id
  join _want_103 w on w.ns = tr.namespace and w.k = tr.key
  where p.verdict = 'approve';
  if v_n <> 14 then
    raise exception
      '0103: % من ١٤ فقط مؤهَّلة لزرّ الدفعة — المالك لن يستطيع نشرها بضغطةٍ واحدة', v_n;
  end if;

  raise notice
    '0103 ✔ ١٤ مسودة (settings ٦ · vehicle ٨) · المنشور ثابتٌ عند % · الفهرس % · localized_settings(en) ما زالت عربية · الأربعة عشر مؤهَّلة لزرّ المالك',
    b.published_before, b.corpus_before;
end;
$c103$;
