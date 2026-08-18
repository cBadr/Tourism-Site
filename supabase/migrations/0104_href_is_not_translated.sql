-- ============================================================================
-- 0104_href_is_not_translated.sql
-- `href` يلتحق بالحقول غير النصّية — فلا يدخل فهرس الترجمة ولا يُستبدَل عند
-- التصيير. **قرار D-24 كان مكتوباً منذ البداية؛ الناقص كان تنفيذه.**
--
-- ── العيب، مقيساً في الكتالوج الحيّ (2026-08-18، 02:46Z، D-58) ──────────────
--
--   select public.i18n_non_text_field('href');            ⇒ **false**
--
-- والمجموعة المحجوزة الحيّة، من `pg_get_functiondef` لا من ملف هجرة:
--   `i18n_non_text_field` ⇒ src · poster · video · icon · anchor
--   `i18n_reserved_content_key` ⇒ تلك الخمس + `_k` + `style`
-- **و`href` ليست فيها.** فهو حقلٌ نصّيّ في نظر الطبقتين معاً:
--
--   (أ) **الفهرسة** — `i18n_corpus_rows()` تُخرج كل مفتاحٍ قيمتُه نصّ وليس
--       محجوزاً ⇒ **اثنا عشر صفَّ `href`** تدخل الطابور وتُطلب ترجمتُها.
--   (ب) **التصيير** — `i18n_apply()` تستبدل كل مفتاحٍ غير محجوز بقيمة الخريطة
--       المنشورة ⇒ **رابطٌ منشورٌ يستبدل الرابط الحقيقي في `href` مباشرةً.**
--
-- ── والعطل ليس نظرياً: صفٌّ قائمٌ الآن يصنع ٤٠٤ ────────────────────────────
--
--   0b610000-0000-4000-8000-000000000003.items.rtalex.href
--     الأصل  : /routes/cairo-alexandria
--     الترجمة: /routes/cairo-lexandria      ← **ألفٌ ابتلعها المترجم الآلي**
--     المزوّد: mymemory · الحالة: draft
--
-- و`pages` لا تحمل إلا `cairo-alexandria` ⇒ نشرُ هذا الصفّ يعطي زائرَ `/en`
-- رابطاً ميتاً في أبرز شريط مساراتٍ في الرئيسية. **والستّة كلها في هذا الشريط**،
-- خمسةٌ منها صحيحةٌ بالمصادفة (الترجمة الآلية أعادت المسار كما هو) — والمصادفة
-- ليست حاجزاً.
--
-- ⚠ **وما يحجزه اليوم ليس حارساً لهذه الجولة**: `draft_publish_preview('en')`
--    تُخرج `skippedMachine = 6` لأن `draft_publish_plan` تحكم `machine` على كل
--    `coalesce(provider,'human') <> 'human'`. **وهو حارسُ `0100`** — يحمي من
--    **زرّ الدفعة** وحده، ولا يحمي من:
--      · `review_translation(id, value, true)` على صفٍّ واحد من الطابور،
--      · ولا من صفِّ `href` جديدٍ يكتبه مترجمٌ **بشريّ** فيمرّ `approve`،
--      · ولا من `upsert_translations` مع `auto_publish = true` على `en`
--        (‏فرع «صف جديد» ينشر فوراً).
--    **فالحاجز الحقيقي أن يكون الحقل غير قابلٍ للترجمة أصلاً، لا أن يُستثنى.**
--
-- ── ما يقيسه هذا الملف من دائرة الانفجار قبل أن يكتب ───────────────────────
--
-- سُئل السؤالان اللذان يقرّران: هل يكسر الحجزُ حقلاً مترجَماً بحق؟ وهل يُيتّم صفاً؟
--
--   | القياس | النتيجة |
--   |---|---|
--   | حقول `section` في الفهرس، كلُّها | title ٢١٩ · text ٧٤ · q ٧٢ · a ٧٢ · c2 ٥٦ · c1 ٥٦ · body ٥٤ · note ٣٢ · sub ٣٢ · num ٢٧ · ctaLabel ١٨ · name ١٦ · h2 ١٣ · h1 ١٣ · alt ١٢ · **href ١٢** · duration ٦ · distance ٦ · value ٤ · label ٤ · suffix ٤ · badge ١ · imageAlt ١ · headline ١ · typingLines ١ · typingPrefix ١ · scrollLabel ١ |
--   | صفوف `translations` مفتاحُها ينتهي بـ`.href` | **٦ — كلُّها `draft`، كلُّها `mymemory`، وصفرٌ منها منشور** |
--   | **الحقول الأخرى شكلُها رابط** | **لا شيء**: `src`/`poster`/`video`/`icon`/`anchor` محجوزةٌ سلفاً فلا تظهر في الفهرس، وما تبقّى نثرٌ كلُّه |
--
-- ⇒ **الحجزُ يُنقص الفهرس اثني عشر صفاً بالضبط، ولا يمسّ صفاً منشوراً واحداً.**
--
-- ── ما لا تفعله هذه الهجرة، بقرارٍ ─────────────────────────────────────────
--
-- (١) **لا تحذف الصفوف الستّة.** قرارُ المالك نصّاً (‏`OWNER-DECISIONS §٢` وسياقُ
--     `0100`): «استثنِها حالياً وسجّل ملاحظة». وبعد هذه الهجرة صارت **خاملةً
--     بنيوياً**: خارج الفهرس، ولو نُشرت لتجاهلها `i18n_apply`. فحذفُها لا يضيف
--     أماناً، ويمحو أثر ما وقع. **وتبقى مرئيةً للمالك في الطابور** (‏`translation_queue`
--     تقرأ `translations` كلها لا الفهرس) فيقرّر فيها متى شاء.
--
-- (٢) **لا تلمس `block_registry`.** الكتالوج يُعلن `href` حقلَ عنصرٍ نصّيّاً في
--     `logo-strip` و`route-rail` و`services-grid`، و`non_text_item_fields` تحمل
--     `src`/`icon` وحدهما. **والمحوران مختلفان**: كتالوجُ المنشئ يقرّر «بأي
--     مُدخلٍ يحرّره المالك»، وهذا الملف يقرّر «هل يُترجَم». وتوسيعُ الأول يمرّ
--     بـ`lib/item-fields-types.ts` و`lib/page-builder-types.ts` — **ملفّاتٌ ليست
--     لهذه الجبهة** (‏`STANDING-ORDERS §٢هـ`: وكيلان على ملفٍّ واحد يمحو أحدهما
--     الآخر صامتاً). ⇒ **مسجَّلٌ لا مُنفَّذ.**
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (١) لقطةُ ما قبل — والفحص أدناه يقارن بها لا بأمنية
-- ----------------------------------------------------------------------------
create temporary table _corpus_before_104 on commit drop as
select ns, k from public.i18n_corpus_rows();

create temporary table _base_104 on commit drop as
select
  (select count(*) from _corpus_before_104)                              as corpus_before,
  (select count(*) from _corpus_before_104 where k like '%.href')        as href_corpus_before,
  (select count(*) from public.translations where locale = 'en'
     and status = 'published')                                           as published_before,
  (select count(*) from public.translations where key like '%.href')     as href_rows_before;

do $b104$
declare b record;
begin
  select * into b from _base_104;
  if public.i18n_non_text_field('href') then
    raise exception '0104: href محجوزٌ سلفاً — لا شيء لتفعله هذه الهجرة';
  end if;
  if b.href_corpus_before = 0 then
    raise exception '0104: صفر صفِّ href في الفهرس — الوضع تغيّر، أعد القياس قبل الحجز';
  end if;
  raise notice '  ← قبل: الفهرس % · منها href % · صفوف href في الجدول % · المنشور en %',
    b.corpus_before, b.href_corpus_before, b.href_rows_before, b.published_before;
end;
$b104$;

-- ----------------------------------------------------------------------------
-- (٢) 🔴 الحاجز الوحيد: `href` حقلٌ غير نصّيّ
--
--     والاستبدال في المكان — `i18n_reserved_content_key` تنادي هذه الدالة،
--     و`i18n_corpus_rows` و`i18n_apply` تناديان تلك ⇒ **موضعٌ واحد يحكم
--     الطبقتين**، فلا تنحرف الفهرسة عن التصيير أبداً (النمط ٨).
--     ولا فهرس ولا قيد ولا عمود مولَّد يعتمد عليها (قِيس: `pg_indexes` و
--     `pg_constraint` و`pg_attrdef` ⇒ صفر) فـ`create or replace` آمنة هنا.
-- ----------------------------------------------------------------------------
create or replace function public.i18n_non_text_field(p_key text)
returns boolean
language sql
immutable
set search_path = ''
as $fn104$
  /*
   * حقولٌ قيمتُها **معرّفٌ أو موضعُ ملفٍّ أو رابط** — لا نثرٌ يُقرأ.
   *
   * `href` منها بحكم D-24: «العربية بلا بادئة لغة، و/en إعادة كتابة داخلية».
   * أي أن المسار **واحدٌ للغتين**، والفرق يصنعه الموجِّه لا المحتوى. فترجمةُ
   * الرابط ليست تحسيناً ناقصاً بل **رابطٌ مكسور**: `/routes/cairo-alexandria`
   * صار `/routes/cairo-lexandria` بيد مترجمٍ آليّ، و`pages` لا تعرف الثاني.
   */
  select p_key is not null
     and p_key in ('src', 'poster', 'video', 'icon', 'anchor', 'href')
$fn104$;

-- ----------------------------------------------------------------------------
-- (٣) الفحص الذاتي — الجديد، **وما كان قائماً قبله** (D-58)
-- ----------------------------------------------------------------------------
do $c104$
declare
  b     record;
  v_n   integer;
  v_bad text;
  v_def text;
  v_out jsonb;
begin
  select * into b from _base_104;

  -- (٣-١) الجديد
  if not public.i18n_non_text_field('href') then
    raise exception '0104: href ما زال غير محجوز';
  end if;

  -- (٣-٢) 🔴 وما كان محجوزاً لم يسقط في النسخ — الخمس والاثنتان
  select string_agg(x.k, '، ') into v_bad
  from (values ('src'), ('poster'), ('video'), ('icon'), ('anchor')) x(k)
  where not public.i18n_non_text_field(x.k);
  if v_bad is not null then
    raise exception '0104: 🔴 حقولٌ محجوزةٌ سقطت من المجموعة — %', v_bad;
  end if;
  if not public.i18n_reserved_content_key('_k')
     or not public.i18n_reserved_content_key('style')
     or not public.i18n_reserved_content_key('href') then
    raise exception '0104: 🔴 i18n_reserved_content_key لم تعد تغطّي _k/style/href';
  end if;

  -- (٣-٣) ولا حقلَ نثرٍ حقيقيّ انحجز بالخطأ
  select string_agg(x.k, '، ') into v_bad
  from (values ('title'), ('body'), ('text'), ('sub'), ('note'), ('alt'),
               ('c1'), ('c2'), ('q'), ('a'), ('label'), ('name')) x(k)
  where public.i18n_reserved_content_key(x.k);
  if v_bad is not null then
    raise exception '0104: 🔴 حقولُ نثرٍ انحجزت فلن تُترجَم أبداً — %', v_bad;
  end if;

  -- (٣-٤) 🔴 الشاهد الحاكم: الفهرس نقص **بعدد صفوف href بالضبط**، لا أكثر
  select count(*) into v_n from public.i18n_corpus_rows();
  if v_n <> b.corpus_before - b.href_corpus_before then
    raise exception '0104: 🔴 الفهرس % ⇐ % والمتوقَّع % — انحجز أكثر من href',
      b.corpus_before, v_n, b.corpus_before - b.href_corpus_before;
  end if;

  select string_agg(a.ns || '/' || a.k, '، ') into v_bad
  from (select ns, k from _corpus_before_104
        except
        select ns, k from public.i18n_corpus_rows()) a
  where a.k not like '%.href';
  if v_bad is not null then
    raise exception '0104: 🔴 مفاتيحُ غيرُ href خرجت من الفهرس — %', v_bad;
  end if;

  if exists (select 1 from public.i18n_corpus_rows() where k like '%.href') then
    raise exception '0104: صفُّ href ما زال في الفهرس';
  end if;

  -- (٣-٥) 🔴 ولا صفَّ **منشور** أُيتّم بهذا الحجز
  select count(*) into v_n
  from public.translations tr
  where tr.key like '%.href' and tr.status = 'published';
  if v_n <> 0 then
    raise exception
      '0104: 🔴 % صفَّ href منشورٌ صار خارج الفهرس — راجِعه قبل الحجز', v_n;
  end if;

  -- والستّة المسوَّدة باقيةٌ كما هي: لا تُحذف ولا تُنشر (قرار المالك)
  select count(*) into v_n from public.translations where key like '%.href';
  if v_n <> b.href_rows_before then
    raise exception '0104: عدد صفوف href تغيّر % ⇐ % — هذه الهجرة لا تحذف ولا تكتب',
      b.href_rows_before, v_n;
  end if;

  -- (٣-٦) 🔴 والتصيير: `i18n_apply` ما زالت تسأل الحارس قبل الاستبدال.
  --        حذفُ هذا النداء غداً يعيد استبدال الروابط ولا يرنّ شيء.
  v_def := pg_get_functiondef('public.i18n_apply(jsonb,text,jsonb)'::regprocedure);
  if position('i18n_reserved_content_key' in v_def) = 0 then
    raise exception '0104: 🔴 i18n_apply لم تعد تستشير الحارس — الروابط تُستبدَل ثانيةً';
  end if;

  -- وبرهانٌ سلوكيّ لا نصّيّ: خريطةٌ تحمل ترجمةً للرابط وللعنوان معاً،
  -- فيمرّ الرابط كما هو ويُترجَم العنوان.
  --
  -- ⚠ و`_k` هنا **ستّة محارف** بالضبط: `i18n_item_address` تشترط
  --   `^[a-z0-9]{6}$` وإلا عنونت العنصر بترتيبه. ومفتاحٌ أقصر يجعل هذا
  --   الفحص يمرّ على «لم يُترجم شيء» بدل «مرّ الرابط وتُرجم النثر» — قِيس.
  v_out := public.i18n_apply(
    jsonb_build_object(
      'title', 'عنوان',
      'items', jsonb_build_array(
        jsonb_build_object('_k', 'zzt001', 'name', 'اسم', 'href', '/routes/cairo-alexandria'))),
    'SEC',
    jsonb_build_object(
      'SEC.title',              'Title',
      'SEC.items.zzt001.name',  'Name',
      'SEC.items.zzt001.href',  '/routes/cairo-lexandria'));
  if (v_out -> 'items' -> 0 ->> 'href') is distinct from '/routes/cairo-alexandria' then
    raise exception '0104: 🔴 i18n_apply ما زالت تستبدل href — النتيجة %',
      (v_out -> 'items' -> 0 ->> 'href');
  end if;
  if (v_out ->> 'title') is distinct from 'Title'
     or (v_out -> 'items' -> 0 ->> 'name') is distinct from 'Name' then
    raise exception '0104: 🔴 الحجز أوقف ترجمة النثر — title=% name=%',
      (v_out ->> 'title'), (v_out -> 'items' -> 0 ->> 'name');
  end if;

  -- (٣-٧) والمنشور الإنجليزي لم يتحرّك بصفٍّ واحد
  select count(*) into v_n
  from public.translations where locale = 'en' and status = 'published';
  if v_n <> b.published_before then
    raise exception '0104: 🔴 المنشور الإنجليزي تحرّك % ⇐ %', b.published_before, v_n;
  end if;

  raise notice
    '0104 ✔ href محجوز · الفهرس % ⇐ % (‏−% صفَّ href) · صفر صفٍّ منشورٍ أُيتّم · i18n_apply تمرّر الرابط وتترجم النثر · المنشور ثابتٌ عند %',
    b.corpus_before,
    b.corpus_before - b.href_corpus_before,
    b.href_corpus_before,
    b.published_before;
end;
$c104$;
