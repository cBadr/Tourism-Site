-- ============================================================================
-- i18n_href_tests.sql — «الرابط ليس نصّاً»: ما تحجزه `0104` وما يجب ألا تحجزه
--
-- كيف تشغّله: `pnpm db:test i18n_href` أو الصقه في SQL Editor واضغط Run.
-- النجاح = آخر سطر «ALL PASSED». والفشل exception عربية فيها المتوقع والفعلي.
--
-- ══════════════════════════════════════════════════════════════════════════
--  🔒 هذا الملف **لا يكتب بايتاً واحداً** — وهو قرارٌ لا كسل
-- ══════════════════════════════════════════════════════════════════════════
--
-- لا لغةَ فيكسترة، ولا صفحة، ولا صفَّ ترجمة، ولا `set role`. كلُّ ما يقيسه
-- **دوالٌّ نقيّة** (`immutable`/`stable`) وعَدٌّ على الفهرس. والسبب مقيس:
-- جولةُ `db:test` الواحدة أبرقت في 2026-08-18 **أحد عشر إشعار حجزٍ وهميّ إلى
-- هاتف المالك** (‏`notifications` ١٥٩٩ ⇐ ١٦١٠)، و١٥٦٣ من ١٦١٠ صفاً في السجل
-- الحيّ فيكسترةٌ متراكمة. **فمجموعةٌ جديدة لا تضيف صفاً واحداً إلى ذلك الثمن.**
--
-- ⚠ **ولا يُقاس هنا رقمٌ مطلقٌ من محتوى الموقع** (‏نفس قاعدة `i18n_tests.sql`
--   و`i18n_bulk_tests.sql`): «صفر صفِّ `href` في الفهرس» **علاقةٌ لا عدد** —
--   تصمد سواءٌ أضاف المالك عشر صفحاتٍ غداً أم حذف الشريط كلَّه.
--
-- ══════════════════════════════════════════════════════════════════════════
--  🔴 ما تحرسه هذه المجموعة تحديداً — عطبٌ كان حياً في القاعدة
-- ══════════════════════════════════════════════════════════════════════════
--
-- `0b610000-…-0003.items.rtalex.href`: الأصل `/routes/cairo-alexandria`،
-- والترجمة الآلية `/routes/cairo-lexandria` — **ألفٌ ناقصة**، و`pages` لا تعرف
-- الثاني. فالنشر كان يعطي زائر `/en` رابطاً ميتاً في أبرز شريطٍ في الرئيسية.
--
-- **والحاجز الذي كان قائماً لا يكفي**: `draft_publish_plan` تستثني كل صفٍّ
-- `provider <> 'human'` ⇒ تحمي من **زرّ الدفعة وحده**. ولا تحمي من اعتمادٍ
-- فرديّ من الطابور، ولا من صفِّ `href` يكتبه مترجمٌ بشريّ، ولا من
-- `upsert_translations` على لغةٍ `auto_publish = true` (وهي حال `en` اليوم).
-- ⇒ **الاختبار (ج) يفشل على السلوك القديم**: قبل `0104` كانت `i18n_apply`
--    تستبدل الرابط فعلاً — وهو ما يقيسه (ج-١) سلوكياً لا نصّياً.
--
-- المرجع: `0104_href_is_not_translated.sql` · D-24 (العربية بلا بادئة لغة،
-- والمسار واحدٌ للغتين) · `handover/DECISIONS.md`.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (٠) الشروط المسبقة
-- ----------------------------------------------------------------------------
do $$
declare
  v_missing text;
begin
  select string_agg(x.sig, '، ')
    into v_missing
  from (values
    ('public.i18n_non_text_field(text)'),
    ('public.i18n_reserved_content_key(text)'),
    ('public.i18n_corpus_rows()'),
    ('public.i18n_apply(jsonb, text, jsonb)'),
    ('public.i18n_item_address(jsonb, bigint)')) as x(sig)
  where to_regprocedure(x.sig) is null;

  if v_missing is not null then
    raise exception 'شرط مسبق: دوال مفقودة (نفّذ 0104 أولاً): %', v_missing;
  end if;

  raise notice '✔ (٠) الشروط المسبقة قائمة';
end;
$$;

-- ----------------------------------------------------------------------------
-- (أ) المجموعة المحجوزة — الجديد **وما كان قائماً**
-- ----------------------------------------------------------------------------
do $$
declare
  v_bad text;
begin
  -- (أ-١) `href` محجوز
  if not public.i18n_non_text_field('href') then
    raise exception '(أ-١) href غير محجوز — انحدارُ 0104 وD-24';
  end if;

  -- (أ-٢) 🔴 والخمس السابقة لم تسقط في النسخ (‏D-58: عيبٌ وُلد هكذا من قبل)
  select string_agg(x.k, '، ') into v_bad
  from (values ('src'), ('poster'), ('video'), ('icon'), ('anchor')) x(k)
  where not public.i18n_non_text_field(x.k);
  if v_bad is not null then
    raise exception '(أ-٢) حقولٌ محجوزةٌ سقطت — %', v_bad;
  end if;

  -- (أ-٣) والغلاف يغطّي السبعة: الخمس + href + `_k` + `style`
  select string_agg(x.k, '، ') into v_bad
  from (values ('_k'), ('style'), ('href'), ('src'), ('poster'),
               ('video'), ('icon'), ('anchor')) x(k)
  where not public.i18n_reserved_content_key(x.k);
  if v_bad is not null then
    raise exception '(أ-٣) i18n_reserved_content_key لا تغطّي — %', v_bad;
  end if;

  -- (أ-٤) 🔴 والحدُّ من الجهة الأخرى: **لا حقلَ نثرٍ انحجز**. حجزٌ زائد يعني
  --       نصّاً لا يُترجَم أبداً ولا يشتكي منه أحد — أخطرُ من حجزٍ ناقص.
  select string_agg(x.k, '، ') into v_bad
  from (values ('title'), ('body'), ('text'), ('sub'), ('note'), ('alt'),
               ('c1'), ('c2'), ('c3'), ('c4'), ('q'), ('a'), ('h1'), ('h2'),
               ('h3'), ('h4'), ('label'), ('name'), ('num'), ('value'),
               ('suffix'), ('badge'), ('headline'), ('caption'), ('ctaLabel'),
               ('listLabel'), ('imageAlt'), ('scrollLabel'), ('typingPrefix'),
               ('typingLines'), ('duration'), ('distance')) x(k)
  where public.i18n_reserved_content_key(x.k);
  if v_bad is not null then
    raise exception '(أ-٤) 🔴 حقولُ نثرٍ انحجزت فلن تُترجَم أبداً — %', v_bad;
  end if;

  -- (أ-٥) و`null` ليست محجوزة (الدالة تُسأل عن مفاتيح حقيقية لا عن العدم)
  if coalesce(public.i18n_non_text_field(null), false)
     or coalesce(public.i18n_reserved_content_key(null), false) then
    raise exception '(أ-٥) null عُدَّت مفتاحاً محجوزاً';
  end if;

  raise notice '✔ (أ) المحجوز: href + الخمس + _k/style · ولا حقلَ نثرٍ انحجز';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ب) الفهرسة — لا يُطلب من أحدٍ ترجمةُ رابط
-- ----------------------------------------------------------------------------
do $$
declare
  v_n   integer;
  v_bad text;
begin
  -- (ب-١) صفر صفِّ href في الفهرس — **علاقةٌ لا رقم**: تصمد مهما تغيّر المحتوى
  select count(*) into v_n from public.i18n_corpus_rows() where k like '%.href';
  if v_n <> 0 then
    raise exception '(ب-١) % صفَّ href في الفهرس — الرابط يُطلب للترجمة', v_n;
  end if;

  -- (ب-٢) ومثلها بقيةُ المحجوز: لا `src` ولا `icon` ولا `anchor` ولا `_k`/`style`
  select string_agg(distinct
           split_part(c.k, '.', array_length(string_to_array(c.k, '.'), 1)), '، ')
    into v_bad
  from public.i18n_corpus_rows() c
  where c.ns = 'section'
    and public.i18n_reserved_content_key(
          split_part(c.k, '.', array_length(string_to_array(c.k, '.'), 1)));
  if v_bad is not null then
    raise exception '(ب-٢) حقولٌ محجوزةٌ ما زالت في الفهرس — %', v_bad;
  end if;

  -- (ب-٣) 🔴 والفهرس لم يُفرَّغ بالحجز: النثر ما زال يُفهرَس
  select count(*) into v_n from public.i18n_corpus_rows();
  if v_n < 100 then
    raise exception '(ب-٣) 🔴 الفهرس % صفاً فقط — الحجز ابتلع المحتوى', v_n;
  end if;

  raise notice '✔ (ب) الفهرس: صفر رابطٍ · صفر حقلٍ محجوز · والنثر قائم (% صفاً)', v_n;
end;
$$;

-- ----------------------------------------------------------------------------
-- (ج) 🔴 التصيير — **الاختبار الذي يفشل على السلوك القديم**
--
--     `i18n_apply` دالةٌ نقيّة: تُنادى بمحتوىً مصنوعٍ هنا وخريطةٍ مصنوعةٍ هنا،
--     فلا صفَّ يُقرأ ولا صفَّ يُكتب. وهي المسار الوحيد الذي يستبدل نصّ القسم
--     في `localized_page` ⇒ ما يمرّ منها يمرّ إلى الصفحة.
--
--     ⚠ و`_k` **ستّة محارف** `^[a-z0-9]{6}$` — شرطُ `i18n_item_address`.
--        ومفتاحٌ أقصر يجعل الاختبار يمرّ على «لم يُترجم شيء» بدل ما يقصده.
-- ----------------------------------------------------------------------------
do $$
declare
  v_in   jsonb;
  v_map  jsonb;
  v_out  jsonb;
  v_item jsonb;
begin
  v_in := jsonb_build_object(
    'title', 'مسارات بين المحافظات',
    'style', jsonb_build_object('_v', 1),
    'items', jsonb_build_array(
      jsonb_build_object(
        '_k',    'hrf001',
        'name',  'القاهرة إلى الإسكندرية',
        'href',  '/routes/cairo-alexandria',
        'src',   '/img/road.avif',
        'alt',   'طريق سريع')));

  -- خريطةٌ **عدائية**: تحمل ترجمةً لكل مفتاح، بما فيها الرابط والصورة
  v_map := jsonb_build_object(
    'SEC.title',                'Intercity routes',
    'SEC.style',                'ATTACK',
    'SEC.items.hrf001.name',    'Cairo to Alexandria',
    'SEC.items.hrf001.href',    '/routes/cairo-lexandria',
    'SEC.items.hrf001.src',     '/img/ATTACK.avif',
    'SEC.items.hrf001.alt',     'A highway');

  v_out  := public.i18n_apply(v_in, 'SEC', v_map);
  v_item := v_out -> 'items' -> 0;

  -- (ج-١) 🔴 الرابط مرّ كما هو — وهذا التأكيد كان يفشل قبل 0104
  if (v_item ->> 'href') is distinct from '/routes/cairo-alexandria' then
    raise exception
      '(ج-١) 🔴 الرابط استُبدل: المتوقع /routes/cairo-alexandria والفعلي «%» — رابطٌ ميت على /en',
      (v_item ->> 'href');
  end if;

  -- (ج-٢) وما كان محجوزاً قبلُ ما زال يمرّ (‏D-58: لا انحدار مع الإضافة)
  if (v_item ->> 'src') is distinct from '/img/road.avif' then
    raise exception '(ج-٢) 🔴 src استُبدل — %', (v_item ->> 'src');
  end if;
  if (v_out -> 'style' ->> '_v') is distinct from '1' then
    raise exception '(ج-٣) 🔴 style استُبدل — %', (v_out -> 'style')::text;
  end if;
  if (v_item ->> '_k') is distinct from 'hrf001' then
    raise exception '(ج-٤) 🔴 _k استُبدل — عنوانُ الترجمة نفسه ضاع';
  end if;

  -- (ج-٥) 🔴 والحدُّ المقابل: النثر **تُرجم فعلاً**. بلا هذا يمرّ الاختبار
  --        على دالةٍ معطَّلة كلياً ويقول «الرابط سليم».
  if (v_out ->> 'title') is distinct from 'Intercity routes'
     or (v_item ->> 'name') is distinct from 'Cairo to Alexandria'
     or (v_item ->> 'alt')  is distinct from 'A highway' then
    raise exception
      '(ج-٥) 🔴 النثر لم يُترجم — title=«%» name=«%» alt=«%»',
      (v_out ->> 'title'), (v_item ->> 'name'), (v_item ->> 'alt');
  end if;

  raise notice '✔ (ج) التصيير: href/src/style/_k تمرّ · title/name/alt تُترجَم';
end;
$$;

-- ----------------------------------------------------------------------------
-- (د) الصفوف القائمة — لا رابطَ منشور، ولا صفَّ حُذف خلسةً
-- ----------------------------------------------------------------------------
do $$
declare
  v_n   integer;
  v_bad text;
begin
  -- (د-١) 🔴 صفر صفِّ `href` **منشور** بأي لغة. صفٌّ منشورٌ هنا = رابطٌ حيٌّ
  --       يستبدل رابطاً حقيقياً على صفحةٍ يراها زائر.
  select string_agg(t.locale || '/' || t.key, '، ') into v_bad
  from public.translations t
  where t.key like '%.href' and t.status = 'published';
  if v_bad is not null then
    raise exception '(د-١) 🔴 روابطُ مترجَمةٌ منشورة — %', v_bad;
  end if;

  -- (د-٢) وما بقي منها مسوَّداً **خارج الفهرس** ⇒ لا يعود إليه أحد
  select count(*) into v_n
  from public.translations t
  join public.i18n_corpus_rows() c on c.ns = t.namespace and c.k = t.key
  where t.key like '%.href';
  if v_n <> 0 then
    raise exception '(د-٢) % صفَّ href ما زال مسنوداً بمفتاحٍ في الفهرس', v_n;
  end if;

  -- (د-٣) 🔴 وزرُّ الدفعة لا يعتمد رابطاً: لا صفَّ `href` بحكم `approve`
  select string_agg(t.key, '، ') into v_bad
  from public.draft_publish_plan('en') p
  join public.translations t on t.id = p.id
  where p.verdict = 'approve' and t.key like '%.href';
  if v_bad is not null then
    raise exception '(د-٣) 🔴 زرُّ «راجِع وانشر» يعتمد روابط — %', v_bad;
  end if;

  raise notice '✔ (د) الصفوف: صفر رابطٍ منشور · صفر رابطٍ في الفهرس · صفر رابطٍ مؤهَّل للنشر';
end;
$$;

-- ----------------------------------------------------------------------------
-- (هـ) 🔴 الطبقة التي كانت ناقصة (‏`0115`): الحجزُ عند **الكتابة** لا القراءة
--
--     `0104` تمنع الرابطَ أن يُفهرَس وأن يُستبدَل. وهي **لا تمنعه أن يُنشر** —
--     والثمنُ وقع: ستّةُ صفوف `href` نُشرت 2026-08-18 بين 06:23:31 و06:23:48
--     باعتمادٍ فرديّ من الطابور (‏`review_translation(id, value, true)`)، فصار
--     التأكيد (د-١) أحمر. **والصفوف كانت خاملةً بنيوياً** — `localized_page`
--     تضعها في الخريطة و`i18n_apply` تتخطّاها — **لكن الباب كان مفتوحاً**.
--
--     ⇒ `0115` تضيف الضلع الرابع على المصدر نفسه:
--        `i18n_reserved_translation_key(key)` ⇐ مُشغّلُ الجدول +
--        `review_translation` + `publish_locale`.
--
--     ⚠ **وما يُقاس هنا نصٌّ وكتالوج، لأن هذا الملف لا يكتب بايتاً** (القرار في
--        ترويسته). **والبرهان السلوكيّ الحيّ في `i18n_tests.sql (ح-ر)`** —
--        هناك فيكسترةٌ قائمة (لغة `zz`) تُدرَج وتُرفَض وتُنظَّف. فمن غيّر
--        الحارس فليقرأ الملفّين معاً.
-- ----------------------------------------------------------------------------
do $$
declare
  v_bad text;
  v_n   integer;
begin
  -- (هـ-٠) الدالة موجودة أصلاً
  if to_regprocedure('public.i18n_reserved_translation_key(text)') is null then
    raise exception '(هـ-٠) i18n_reserved_translation_key مفقودة — نفّذ 0115';
  end if;

  -- (هـ-١) تمسك المفتاح الكامل بحقلٍ محجوز — ومنه الصفُّ الحقيقيّ الذي وقع
  select string_agg(x.k, '، ') into v_bad
  from (values
    ('0b610000-0000-4000-8000-000000000003.items.rtalex.href'),
    ('sec.items.abc123.src'),
    ('sec.items.abc123.icon'),
    ('sec.items.abc123.anchor'),
    ('sec.items.abc123.poster'),
    ('sec.items.abc123.video'),
    ('sec.items.abc123._k'),
    ('sec.style'),
    ('href')) x(k)
  where not public.i18n_reserved_translation_key(x.k);
  if v_bad is not null then
    raise exception '(هـ-١) 🔴 مفاتيحُ حقولٍ محجوزةٍ أفلتت من حارس الكتابة — %', v_bad;
  end if;

  -- (هـ-٢) 🔴 والحدُّ المقابل: مفتاحُ نثرٍ لا يُحجَب. حجزٌ زائد هنا يعني نصّاً
  --        **يستحيل نشرُه** ولا يشتكي منه أحد — أخطرُ من حجزٍ ناقص.
  select string_agg(x.k, '، ') into v_bad
  from (values
    ('0b610000-0000-4000-8000-000000000003.items.rtalex.name'),
    ('e0000000-0000-4000-8000-000000000001.title'),
    ('e0000000-0000-4000-8000-000000000001.meta.description'),
    ('e0000000-0000-4000-8000-000000000001.navLabel'),
    ('brand.name'), ('brand.tagline'), ('company.legalName'),
    ('seo.titleTemplate'), ('seo.defaultDescription'),
    ('nav.11111111-1111-4111-8111-111111111111.label'),
    ('sedan.title'), ('sedan.short'),
    ('sec.items.abc123.alt'), ('sec.items.abc123.label'),
    ('sec.items.abc123.q'), ('sec.items.abc123.a')) x(k)
  where public.i18n_reserved_translation_key(x.k);
  if v_bad is not null then
    raise exception '(هـ-٢) 🔴 مفاتيحُ نثرٍ صارت غيرَ قابلةٍ للنشر أبداً — %', v_bad;
  end if;

  -- (هـ-٣) و`null` ليست محجوزة
  if coalesce(public.i18n_reserved_translation_key(null), false) then
    raise exception '(هـ-٣) null عُدَّت مفتاحاً محجوزاً';
  end if;

  -- (هـ-٤) 🔴 المُشغّل على الجدول قائمٌ ومُشتعل — لا في دالةٍ واحدة يلتفّ حولها
  --        `upsert_translations` أو كتابةٌ مباشرة باللوحة أو بمفتاح الخدمة.
  if not exists (
    select 1 from pg_trigger g
    where g.tgrelid = 'public.translations'::regclass
      and g.tgname  = 'translations_guard_reserved_field'
      and not g.tgisinternal
      and g.tgenabled = 'O') then
    raise exception '(هـ-٤) 🔴 مُشغّل translations_guard_reserved_field غائبٌ أو معطَّل';
  end if;

  -- (هـ-٥) والدالتان الإداريتان تستشيرانه — حذفُ النداء غداً يفتح البابَ صامتاً
  if position('i18n_reserved_translation_key'
       in pg_get_functiondef('public.review_translation(uuid,text,boolean)'::regprocedure)) = 0 then
    raise exception '(هـ-٥) 🔴 review_translation لم تعد تستشير حارس الكتابة';
  end if;
  if position('i18n_reserved_translation_key'
       in pg_get_functiondef('public.publish_locale(text)'::regprocedure)) = 0 then
    raise exception '(هـ-٥) 🔴 publish_locale لم تعد تستشير حارس الكتابة';
  end if;

  -- (هـ-٦) 🔴 والحصيلة على الجدول الحيّ — **الصنف كلُّه لا `href` وحده**:
  --        صفر صفٍّ محجوزٍ في حالةٍ غير `draft`، بأي لغةٍ وأي مساحة.
  --        علاقةٌ لا عدد: تصمد مهما نما المحتوى.
  select string_agg(t.locale || '/' || t.status || '/' || t.key, '، ') into v_bad
  from public.translations t
  where t.status <> 'draft' and public.i18n_reserved_translation_key(t.key);
  if v_bad is not null then
    raise exception '(هـ-٦) 🔴 حقولٌ محجوزةٌ حيّةٌ في جدول الترجمات — %', v_bad;
  end if;

  -- (هـ-٧) والستّةُ المسوَّدة **لم تُحذف**: القيمةُ والأصلُ والفاعلُ باقون،
  --        فيبقى في الجدول ماذا كُتب ومن كتبه (قرار `0104 §(١)`).
  select count(*) into v_n
  from public.translations t
  where t.key like '%.href'
    and t.value is not null and btrim(t.value) <> ''
    and t.source_text is not null and btrim(t.source_text) <> '';
  if v_n <> (select count(*) from public.translations where key like '%.href') then
    raise exception '(هـ-٧) صفُّ href فقد قيمتَه أو أصلَه — الأثر مُحي';
  end if;

  raise notice
    '✔ (هـ) حارسُ الكتابة: المُشغّل مشتعل · الدالتان تستشيرانه · صفر حقلٍ محجوزٍ حيّ · و% صفَّ href مسوَّدةٌ بقيمتها',
    v_n;
end;
$$;

-- ----------------------------------------------------------------------------
-- ⚠ **`raise notice` لا `select`** — `scripts/db-test.mjs` يطبع أحداث `notice`
--    وحدها (السطر ٤٠: `client.on("notice", …)`)، فمجموعةٌ تنتهي بـ`select`
--    تمرّ خضراء ولا تطبع «ALL PASSED» إطلاقاً. وقع فعلاً في `i18n_bulk_tests`.
-- ----------------------------------------------------------------------------
do $$
begin
  raise notice 'ALL PASSED — الرابط ليس نصّاً: لا يُفهرَس ولا يُستبدَل ولا يُنشَر';
end;
$$;
