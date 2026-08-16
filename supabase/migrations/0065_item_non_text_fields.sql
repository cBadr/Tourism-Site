-- ============================================================================
-- 0065 — صورةُ العنصر وأيقونته: حقولٌ **غير نصّية داخل عنصر قائمة**
--
-- ⚠ الرقم `0065` لا `0064`: `0064_hero_media.sql` **مطبَّقة** (2026-08-16
--    07:07:17Z، مقروءةً من `schema_migrations`). والموجز كان يقول `0064` حرّاً.
--
-- ── ما تفعله هذه الهجرة، وما لا تفعله ───────────────────────────────────────
--
-- الفهرس اليوم يفهرس **كل مفتاحٍ قيمتُه نصّ**، ولا يقرأ `block_registry`
-- إطلاقاً. وقياسٌ حيّ على القاعدة (2026-08-16، داخل معاملة `read only`) أخرج
-- ثلاثة صفوف حيّة في طابور الترجمة:
--
--     <heroId>.src     ⇐ /img/hero-chauffeur.avif
--     <heroId>.poster  ⇐ /img/hero-video-poster.avif
--     <heroId>.video   ⇐ /video/hero-loop.mp4
--
-- كتبتها `0064` بحسن نيّة (‏`text_fields` لا تذكرها)، لكن الحارس الذي ظُنّ أنه
-- يحميها **غير موصول**: `NON_TEXT_CONTENT_FIELDS` مستهلكه الوحيد
-- `block_registry_check` بصيغة `v_non_text constant text[] := array['src']`،
-- ووظيفته هناك سطرٌ واحد لا علاقة له بالفهرس. والأسوأ أن `i18n_apply` تستبدل
-- بالاسم كذلك ⇒ ترجمة `src` **تُطبَّق فعلاً**، و`safeMediaSrc` لا تنقذ:
-- «‎/img/سائق.avif» مسارٌ داخلي سليم يمرّ من الحارس ويُصيَّر صورةً مكسورة.
--
-- 💡 **ونافذةٌ تُغلق:** `select count(*) from translations` = **صفر**. فسحبُ
--    المفاتيح الثلاثة اليوم **صفرُ خسارة**؛ وبعد أول ترجمة منشورة يصير هذا
--    الإصلاح إسقاطَ عملِ إنسان.
--
-- ── القرار (‏`lib/item-fields-types.ts` §١) ──────────────────────────────────
--
-- «غير نصّي» **اسمٌ محجوز عالمياً لا صفةُ كتلة**: أربعة أسماء تُضاف عبر ورقةٍ
-- طرفية جديدة `i18n_non_text_field`، تناديها `i18n_reserved_content_key`
-- وحدها — **بلا لمس جسم `i18n_corpus_rows` ولا جسم `i18n_apply`**، وكلاهما
-- ينادي الورقة **مرتين** سلفاً (أعلى العنصر وداخله)، فآليةُ التجاوز على مستوى
-- العنصر قائمةٌ وموصولة وينقصها الأسماء وحدها.
--
-- والسبب الحاسم: `i18n_apply(p_content, p_prefix, p_map)` **لا تعرف نوع
-- الكتلة** وهي `IMMUTABLE`؛ فربطُها بالسجل يوجب وسيطاً رابعاً + `STABLE` +
-- إعادة كتابة جسمها وجسم `localized_page` — ثلاثتها وصفةُ انحدار **D-58**.
-- ويليه: فضاء مفاتيح الترجمة يجب ألا يُشتق من جدولٍ يحرّره مشرف، وإلا صار
-- تعديلُ صفٍّ في `block_registry` يسحب مفاتيح ترجمة **صامتاً**.
--
-- ــ وثمن العالمية مقيسٌ بصفر: جردُ كل أسماء الحقول الحيّة اليوم لا يذكر
--    واحداً من الأربعة نثراً في أي كتلة.
--
-- 🔒 **وما يبقى داخل الفهرس بقرارٍ صريح:** `alt` و`imageAlt` (يُقرآن بصوتٍ
--    عالٍ لمن لا يرى ويفهرسهما جوجل) و`href` (المسار العربي بلا بادئة
--    والإنجليزي تحت `/en` — D-24، وحدُّ خطره ٤٠٤ داخلي لأن `internalPath`
--    يُصيَّر **بعد** الترجمة).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (١) الأساس — يُقاس **حيّاً** ولا يُحفر رقمٌ في الهجرة
--
-- سابقة `0059` §(٥-١): المحتوى يتغيّر بين كتابة الهجرة وتشغيلها (‏`0064`
-- طُبِّقت قبل ساعاتٍ من كتابة هذا الملف)، ورقمٌ محفور يجعل الهجرة تفشل على
-- تعديلٍ مشروع — أو أسوأ: تنجح على فقدٍ حقيقي.
-- ----------------------------------------------------------------------------

create temp table _m7_corpus_before on commit drop as
  select ns, k from public.i18n_corpus_rows();

-- ----------------------------------------------------------------------------
-- (٢) الورقة الطرفية الجديدة — أربعة أسماء، ولا خامس بلا مراجعةٍ تسأل:
--     «هل هذا الاسم جملةٌ يقولها إنسان؟»
--
-- ‏`src` و`poster` و`video` مساراتُ ملفات، و`icon` اسمُ مكوّن. ولا واحدٌ منها
-- جملة — بينما `name` و`label` و`value` جملٌ فعلاً، ولذلك بقيت خارج القائمة
-- رغم أنها تبدو «تقنية».
-- ----------------------------------------------------------------------------

create or replace function public.i18n_non_text_field(p_key text)
returns boolean
language sql
immutable
set search_path to ''
as $$
  select p_key is not null and p_key in ('src', 'poster', 'video', 'icon')
$$;

comment on function public.i18n_non_text_field(text) is
  'اسمٌ محجوز عالمياً لا يدخل فهرس الترجمة ولا يُستبدل في i18n_apply — '
  'مرآة NON_TEXT_FIELD_NAMES في lib/item-fields-types.ts §١. يسري على '
  'المستوى الأعلى وداخل عنصر items معاً، وفي كل كتلة قائمة أو قادمة.';

-- ----------------------------------------------------------------------------
-- (٣) المفاتيح المحجوزة = اتحادٌ لا قائمةٌ ثانية
--
-- الجسم منقولٌ من `pg_get_functiondef` بحرفه، ولم يُضَف إليه إلا الشقّ الثاني.
-- ⚠ ولا تُلمس `i18n_corpus_rows` ولا `i18n_apply` — وهذا هو محور القرار كله.
-- ----------------------------------------------------------------------------

create or replace function public.i18n_reserved_content_key(p_key text)
returns boolean
language sql
immutable
set search_path to ''
as $$
  select p_key is not null
     and (p_key in ('_k', 'style') or public.i18n_non_text_field(p_key))
$$;

create temp table _m7_corpus_after on commit drop as
  select ns, k from public.i18n_corpus_rows();

-- ----------------------------------------------------------------------------
-- (٤) 🔴 شرط الإغلاق — خمسة فحوص، والعدّ وحده لا يكفي واحداً منها
--
--     after = before − |{ صفٌّ مقطعُه الأخير ∈ NON_TEXT_FIELD_NAMES }|
--
-- ولماذا خمسة لا واحد: عدٌّ متساوٍ قد يخفي **تبادلاً** (سقط مفتاح ووُلد آخر)،
-- و«صفر صفوف محجوبة» يثبت الفراغ لا الحراسة، وإغلاقُ باب الفهرسة لا يغلق باب
-- التطبيق، وشاهدٌ نصّي يمنع أن يمرّ فهرسٌ نصفُ محروس لو أُعيدت كتابة الجسم يوماً.
-- ----------------------------------------------------------------------------

do $$
declare
  v_before   integer;
  v_after    integer;
  v_excluded integer;
  v_lost     text;
  v_gained   text;
  v_witness  integer;
  v_applied  jsonb;
  v_def      text;
  v_calls    integer;
begin
  select count(*) into v_before from _m7_corpus_before;
  select count(*) into v_after  from _m7_corpus_after;

  select count(*) into v_excluded
  from _m7_corpus_before
  where public.i18n_non_text_field(
          split_part(k, '.', array_length(string_to_array(k, '.'), 1)));

  -- (أ) العدّ يغلق
  if v_after <> v_before - v_excluded then
    raise exception '0065: حساب الفهرس لا يغلق — قبل=% بعد=% مستثنى=%',
      v_before, v_after, v_excluded;
  end if;

  -- (ب) الفرق **بالمجموعة** في الاتجاهين، لا بالعدد
  select string_agg(d.k, ', ') into v_lost
  from (select k from _m7_corpus_before except select k from _m7_corpus_after) d
  where not public.i18n_non_text_field(
          split_part(d.k, '.', array_length(string_to_array(d.k, '.'), 1)));
  if v_lost is not null then
    raise exception '0065: سقطت من الفهرس مفاتيح ليست محجوزة: %', v_lost;
  end if;

  select string_agg(d.k, ', ') into v_gained
  from (select k from _m7_corpus_after except select k from _m7_corpus_before) d;
  if v_gained is not null then
    raise exception '0065: ظهرت مفاتيح لم تكن قبل الاستبدال: %', v_gained;
  end if;

  -- (ج) شاهدٌ **إيجابي**: يجب أن يوجد صفٌّ حيٌّ يحمل فعلاً حقلاً باسمٍ محجوز
  --     وقيمتُه نصّ — وإلا كان «صفر صفوف» إثباتَ فراغٍ لا إثباتَ حراسة.
  select count(*) into v_witness
  from public.sections s
  join public.pages p on p.id = s.page_id and p.published = true
  cross join lateral jsonb_each(s.content) as e(key, value)
  where s.visible = true
    and public.i18n_non_text_field(e.key)
    and jsonb_typeof(e.value) = 'string';

  if v_witness = 0 or v_excluded = 0 then
    raise exception
      '0065: لا شاهد حيّ على الحجب (صفوف=% مستثنى=%) — الفحص يثبت فراغاً لا حراسة',
      v_witness, v_excluded;
  end if;

  -- (د) الحجب في **التطبيق** كما في الفهرس: بابان، وإغلاق أحدهما لا يغلق الآخر
  v_applied := public.i18n_apply(
    jsonb_build_object(
      'src',      '/img/probe.avif',
      'imageAlt', 'وصفٌ عربي',
      'items',    jsonb_build_array(jsonb_build_object(
                    '_k', 'prb001', 'src', '/img/item.avif',
                    'alt', 'وصفُ عنصر', 'icon', 'car'))
    ),
    'probe',
    jsonb_build_object(
      'probe.src',                  '/img/HIJACKED.avif',
      'probe.imageAlt',             'english alt',
      'probe.items.prb001.src',     '/img/HIJACKED2.avif',
      'probe.items.prb001.alt',     'english item alt',
      'probe.items.prb001.icon',    'plane'
    )
  );

  if v_applied ->> 'src' <> '/img/probe.avif' then
    raise exception '0065: i18n_apply استبدلت src العليا — %', v_applied ->> 'src';
  end if;
  if v_applied -> 'items' -> 0 ->> 'src' <> '/img/item.avif' then
    raise exception '0065: i18n_apply استبدلت src داخل العنصر — %',
      v_applied -> 'items' -> 0 ->> 'src';
  end if;
  if v_applied -> 'items' -> 0 ->> 'icon' <> 'car' then
    raise exception '0065: i18n_apply استبدلت icon داخل العنصر';
  end if;
  -- 🔴 والوجه الآخر شرطٌ لا زينة: النصّ البديل **يُترجَم فعلاً**، وإلا كنا
  --    أغلقنا الباب على الإتاحة بدل أن نغلقه على المسارات.
  if v_applied ->> 'imageAlt' <> 'english alt' then
    raise exception '0065: imageAlt لم تُترجَم — الحجب ابتلع نصّاً يُقرأ بصوتٍ عالٍ';
  end if;
  if v_applied -> 'items' -> 0 ->> 'alt' <> 'english item alt' then
    raise exception '0065: alt داخل العنصر لم تُترجَم';
  end if;

  -- (هـ) شاهدٌ نصّي على ما كان قائماً لا على ما أضفناه (**D-58**): موضعا نداء
  --      الورقة في كلٍّ من الدالتين، ونداء `i18n_item_address` معهما.
  for v_def in
    select pg_get_functiondef(p.oid)
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('i18n_corpus_rows', 'i18n_apply')
  loop
    v_calls := (length(v_def) - length(replace(v_def, 'i18n_reserved_content_key', '')))
               / length('i18n_reserved_content_key');
    if v_calls <> 2 then
      raise exception '0065: نداءات i18n_reserved_content_key صارت % لا ٢ — الفهرس نصفُ محروس', v_calls;
    end if;
    if position('i18n_item_address' in v_def) = 0 then
      raise exception '0065: نداء i18n_item_address اختفى — عنوان العنصر عاد ترتيبياً';
    end if;
  end loop;

  raise notice '0065 §٤ OK — الفهرس % ⇐ % (محجوب %)، والتطبيق يمرّ المسارات ويترجم النصّ البديل',
    v_before, v_after, v_excluded;
end $$;

-- ----------------------------------------------------------------------------
-- (٥) عمودان في السجل — وظيفتهما **الإعلان والتحقق**، لا الترشيح
--
--     text_fields ⇄ non_text_fields        (المستوى الأعلى)
--     item_fields ⇄ non_text_item_fields   (داخل عنصر `items`)
--
-- الترشيح بالاسم (§٢)، وهذان العمودان لثلاثة أشياء لا يقدر عليها الاسم وحده:
--   ١ **المحرر**: أي عنصر واجهة يُعرض لهذا الحقل (منتقي وسائط · قائمة أيقونات ·
--     صندوق نصّ). والمقيس اليوم أن المنشئ يكتشف الحقول غير النصّية من
--     `requiredFields` ⇒ **حقلٌ غير نصّي اختياري بلا إدخالٍ أصلاً** — وهو سبب
--     أن `poster`/`video` غير قابلين للتحرير من المنشئ اليوم رغم وجودهما.
--   ٢ **التحقق**: `required_fields` تُقرأ على اتحاد القوائم الأربع بدل حيلة
--     `v_non_text` (‏§٦).
--   ٣ **التعاقد**: الكتلة تصف نفسها كاملةً في صفٍّ واحد.
--
-- و`null` تعني «لا حقل غير نصّي» — لا `{}` (الغياب يعني الافتراضي، الذهبية ١٥).
-- ----------------------------------------------------------------------------

alter table public.block_registry
  add column if not exists non_text_fields      text[],
  add column if not exists non_text_item_fields text[];

comment on column public.block_registry.non_text_fields is
  'حقولٌ عليا غير نصّية (مسارٌ أو اسم أيقونة) — لا تدخل فهرس الترجمة. '
  'null = لا شيء. كل اسمٍ فيها ∈ i18n_non_text_field، ومقاطعتها text_fields صفر.';
comment on column public.block_registry.non_text_item_fields is
  'حقولٌ غير نصّية داخل عنصر items — يلزمها item_fields، و`src` منها يلزمه `alt`.';

-- ----------------------------------------------------------------------------
-- (٦) الحارس البنيوي — ٨ وسائط ⇐ ١٠، والقديم يُسقَط **صراحةً**
--
-- توقيعان حيّان لدالةٍ واحدة يعني أن أحدهما يُنادى ولا أحد يعرف أيّهما — وهي
-- نفس العلّة التي أسقطت لأجلها `0031` تواقيع `quote_price` القديمة.
--
-- ⚠ والجسم منقولٌ من `pg_get_functiondef` للنسخة الحيّة، لا من ملف `0058`.
--   الجديد فيه: خمس قواعد، **وحذفُ حيلة `v_non_text`**.
-- ----------------------------------------------------------------------------

create or replace function public.block_registry_check(
  p_type                 text,
  p_role                 text,
  p_placement            text,
  p_accepts_children     boolean,
  p_max_children         integer,
  p_text_fields          text[],
  p_item_fields          text[],
  p_required_fields      text[],
  p_non_text_fields      text[],
  p_non_text_item_fields text[]
) returns text
language plpgsql
immutable
as $function$
declare
  v_f text;
  -- المفاتيح المحجوزة = RESERVED_CONTENT_KEYS في العقد §٤
  v_reserved constant text[] := array['_k', 'style'];
  -- 🔒 الأسماء غير النصّية = NON_TEXT_FIELD_NAMES في `lib/item-fields-types.ts` §١.
  --    مكتوبةٌ هنا لأن الدالة `IMMUTABLE` فلا تنادي `i18n_non_text_field`
  --    (وهي `IMMUTABLE` كذلك، لكن ربطهما يخلق تبعيةً بين حارسٍ ودالة فهرسة
  --    لا مبرر لها). والاتفاق محروسٌ بفحصٍ في `page_builder_tests.sql`.
  v_non_text constant text[] := array['src', 'poster', 'video', 'icon'];
begin
  if p_type is null or btrim(p_type) = '' then
    return 'type-empty';
  end if;

  -- (أ) الحقول النصية العليا: اسمٌ بسيط يصلح مقطعاً في `<sectionId>.<field>`
  foreach v_f in array coalesce(p_text_fields, '{}'::text[]) loop
    if v_f !~ '^[a-zA-Z][a-zA-Z0-9]*$' then
      return 'text-field-not-addressable:' || v_f;
    end if;
    if v_f = 'items' or v_f = any (v_reserved) then
      return 'text-field-reserved:' || v_f;
    end if;
    -- 🔴 اسمٌ محجوزٌ عالمياً معلَنٌ نصّاً = العطب الذي وقع على `src` في `0064`
    --    مقلوباً: كتلةٌ تطلب ترجمة مسار.
    if v_f = any (v_non_text) then
      return 'non-text-overlap:' || v_f;
    end if;
  end loop;

  -- (ب) حقول العنصر: نفس القاعدة — مقطعٌ في `<sectionId>.items.<_k>.<field>`
  if p_item_fields is not null then
    if cardinality(p_item_fields) = 0 then
      return 'item-fields-empty';
    end if;
    foreach v_f in array p_item_fields loop
      if v_f !~ '^[a-zA-Z][a-zA-Z0-9]*$' then
        return 'item-field-not-addressable:' || v_f;
      end if;
      if v_f = 'items' or v_f = any (v_reserved) then
        return 'item-field-reserved:' || v_f;
      end if;
      if v_f = any (v_non_text) then
        return 'non-text-overlap:' || v_f;
      end if;
    end loop;
  end if;

  -- (ب-٢) 🆕 القائمتان غير النصّيتين — التعاشق الذي يجعل الانحراف غير قابل للكتابة
  foreach v_f in array coalesce(p_non_text_fields, '{}'::text[]) loop
    if v_f !~ '^[a-zA-Z][a-zA-Z0-9]*$' then
      return 'non-text-field-not-addressable:' || v_f;
    end if;
    -- اسمٌ يعلنه السجل «غير نصّي» والفهرسُ ما زال يفهرسه = تجاوزٌ لا يعرفه أحد
    if not (v_f = any (v_non_text)) then
      return 'non-text-not-reserved:' || v_f;
    end if;
  end loop;
  if p_non_text_fields is not null and cardinality(p_non_text_fields) = 0 then
    return 'non-text-fields-empty';
  end if;

  foreach v_f in array coalesce(p_non_text_item_fields, '{}'::text[]) loop
    if v_f !~ '^[a-zA-Z][a-zA-Z0-9]*$' then
      return 'non-text-field-not-addressable:' || v_f;
    end if;
    if not (v_f = any (v_non_text)) then
      return 'non-text-not-reserved:' || v_f;
    end if;
  end loop;
  if p_non_text_item_fields is not null and cardinality(p_non_text_item_fields) = 0 then
    return 'non-text-fields-empty';
  end if;

  -- (ب-٣) حقلُ عنصرٍ بلا عنصر
  if p_non_text_item_fields is not null and p_item_fields is null then
    return 'non-text-item-without-items';
  end if;

  -- (ب-٤) 🔴 لا صورةَ عنصرٍ بلا موضعٍ لنصّها البديل.
  --       والإلزام على **وجود الحقل** لا على قيمته: الفارغ يعني «زخرفة»
  --       (`alt=""`) وهو الصواب حين يقول اسم البطاقة ما تقوله صورتها.
  if 'src' = any (coalesce(p_non_text_item_fields, '{}'::text[]))
     and not ('alt' = any (coalesce(p_item_fields, '{}'::text[]))) then
    return 'item-src-without-alt';
  end if;

  -- (ج) التخطيط والدور توأمان: `layout` وحدها تحمل أبناءً، وهي وحدها بلا نصّ
  if coalesce(p_accepts_children, false) <> (p_role = 'layout') then
    return 'layout-role-mismatch';
  end if;

  if coalesce(p_accepts_children, false) then
    if p_max_children is null or p_max_children < 1 or p_max_children > 12 then
      return 'max-children-invalid';
    end if;
    if cardinality(coalesce(p_text_fields, '{}'::text[])) > 0 or p_item_fields is not null then
      return 'layout-carries-text';
    end if;
    -- امتدادُ القاعدة نفسها إلى الوسائط: كتلة تخطيطٍ لا تحمل صورةً كما لا تحمل نصّاً
    if p_non_text_fields is not null or p_non_text_item_fields is not null then
      return 'layout-carries-media';
    end if;
  elsif p_max_children is not null then
    return 'max-children-on-leaf';
  end if;

  -- (د) الإلزامي يجب أن يكون قابلاً للملء: نصٌّ أعلى، أو `items`، أو حقلٌ غير
  --     نصّي **تعلنه هذه الكتلة بعينها**.
  --
  -- 🔴 وهنا يسقط العيب القائم: `v_non_text` كانت قائمةً عالمية، فكتلةٌ **بلا
  --    حقل `src` إطلاقاً** تستطيع إعلانه إلزامياً ⇒ كتلةٌ لا تُصيَّر أبداً
  --    ولا سطر في أي سجلّ يقول لماذا.
  foreach v_f in array coalesce(p_required_fields, '{}'::text[]) loop
    if v_f = 'items' then
      if p_item_fields is null then
        return 'required-items-without-item-fields';
      end if;
    elsif not (v_f = any (coalesce(p_text_fields, '{}'::text[]))
            or v_f = any (coalesce(p_non_text_fields, '{}'::text[]))) then
      return 'required-field-unfillable:' || v_f;
    end if;
  end loop;

  return null;
end;
$function$;

-- المُشغّل يُعاد توجيهه **قبل** إسقاط التوقيع القديم
create or replace function public.block_registry_guard()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_reason text;
begin
  v_reason := public.block_registry_check(
    new.type, new.role, new.placement, new.accepts_children,
    new.max_children, new.text_fields, new.item_fields, new.required_fields,
    new.non_text_fields, new.non_text_item_fields);

  if v_reason is not null then
    raise exception 'كتلة «%» تعلن شكلاً لا تعنونه قواعد الترجمة: %', new.type, v_reason
      using hint = 'block-registry-shape';
  end if;

  return new;
end;
$function$;

drop function if exists public.block_registry_check(
  text, text, text, boolean, integer, text[], text[], text[]);

-- ----------------------------------------------------------------------------
-- (٧) قائمة الأيقونات المغلقة — مرآة `ITEM_ICON_NAMES`
--
-- المالك يختار من **قائمة منسدلة** ولا حقل نصّ حرّ إطلاقاً: من يكتب `Plane` أو
-- «طائرة» لا يقول له شيءٌ إن الاثنين لا يعملان، فيظنّ العيب في الصورة لا في
-- القيمة (النمط ٣ في `LESSONS.md`). والتصيير عبر خريطةٍ **ساكنة** في
-- `components/sections/icons.ts` — فالمجهول **يغيب ولا ينهار**.
-- ----------------------------------------------------------------------------

create or replace function public.item_icon_allowed(p_icon text)
returns boolean
language sql
immutable
set search_path to ''
as $$
  select p_icon is not null and p_icon in (
    -- خدمات (مطابقة لـ`ServiceDef["icon"]` القائمة — لا تُعاد تسميتها)
    'plane', 'building', 'route', 'landmark', 'party', 'mic',
    -- ضمانات وثقة
    'shield', 'check', 'clock', 'wallet', 'star', 'headset',
    -- مركبات وسفر
    'car', 'bus', 'users', 'luggage', 'mapPin', 'phone')
$$;

comment on function public.item_icon_allowed(text) is
  'مرآة ITEM_ICON_NAMES في lib/item-fields-types.ts §٤ — ثمانية عشر اسماً. '
  'الرفض عند الحفظ أنفع من الرفض عند التصيير: الأول يراه من كتب القيمة.';

-- ----------------------------------------------------------------------------
-- (٨) صفوف السجل — الكتلة تصف نفسها كاملةً، فلا يبقى حقلٌ حيٌّ لا يذكره السجل
--     (وهي حالة `hero.src` اليوم بالضبط)
--
-- ⚠ الترتيب يوافق `BLOCK_CATALOGUE` حرفاً: `page_builder_tests.sql` يقارن
--   المصفوفات **مرتّبة** لا كمجموعات، ويسقط على الانحراف.
-- ----------------------------------------------------------------------------

update public.block_registry
set non_text_fields = array['src', 'poster', 'video']
where type = 'hero';

update public.block_registry
set non_text_fields = array['src']
where type = 'image';

-- بطاقة المسار تكسب صورةً وأيقونة — والقيد الذي منعهما (‏«‏`src` داخل عنصر
-- قائمة شكلٌ لم يُقنَّن») سقط بالتقنين لا بالنقض.
update public.block_registry
set item_fields          = array['name', 'href', 'duration', 'distance', 'alt'],
    non_text_item_fields = array['src', 'icon']
where type = 'route-rail';

-- بطاقات الخدمات: قائمةٌ **اختيارية** تتجاوز `SERVICES` حين تُملأ، وتغيب
-- فيعود القسم إلى مصدره في الكود حرفاً (`requiredFields` تبقى فارغة).
update public.block_registry
set item_fields          = array['title', 'text', 'href', 'alt'],
    non_text_item_fields = array['src', 'icon']
where type = 'services-grid';

-- أيقونةٌ لكل ميزة/ضمانة — بلا صورة، فلا يلزمها `alt`
update public.block_registry
set non_text_item_fields = array['icon']
where type = 'features';

-- ----------------------------------------------------------------------------
-- (٩) صور فئات الأسطول — العمود موجودٌ منذ `0005` و`null` في الصفوف الأربع،
--     ولا شاشة تكتبه ولا عارضة تقرؤه. الثلاثة تُعالَج في هذه المرحلة.
--
-- والشرط `image_url is null`: من بدّل صورةً من اللوحة لا تُعاد بذرته.
-- ----------------------------------------------------------------------------

update public.vehicle_classes set image_url = '/img/fleet-sedan.avif'   where slug = 'sedan'   and image_url is null;
update public.vehicle_classes set image_url = '/img/fleet-suv.avif'     where slug = 'suv'     and image_url is null;
update public.vehicle_classes set image_url = '/img/fleet-minibus.avif' where slug = 'minibus' and image_url is null;
update public.vehicle_classes set image_url = '/img/fleet-bus.avif'     where slug = 'bus'     and image_url is null;

-- ----------------------------------------------------------------------------
-- (١٠) بذر الوسائط في المحتوى — بطاقات المسارات وبطاقات الخدمات
--
-- 🔒 **الدمج على مستوى العنصر بـ`_k`**، لا استبدالُ `items`: النصوص التي كتبها
--    المالك (الاسم · المدة · المسافة · الرابط) تبقى حرفاً، ويُضاف إليها
--    `src`/`alt`/`icon` وحدها. وعنصرٌ لا يطابق مفتاحه شيئاً في الخريطة يمرّ
--    كما هو — فلا تُمحى إضافةُ مالك.
--
-- والنصوص البديلة تصف **ما في الصورة** لا اسم البطاقة: «صورة» ليست نصّاً
-- بديلاً، ومن لا يرى يجب أن ينال ما يناله المبصر من المشهد.
-- ----------------------------------------------------------------------------

with media(k, src, alt, icon) as (
  values
    ('rtalex', '/img/egypt-cairo.avif',     'أفق القاهرة عند الغروب ونهر النيل يعبره كوبري',                 'route'),
    ('rtskhn', '/img/egypt-redsea.avif',    'شاطئ على البحر الأحمر بمياه صافية وجبال في الأفق',              'route'),
    ('rtshrm', '/img/night-road.avif',      'طريق صحراوي ليلاً تضيئه مصابيح سيارة متجهة جنوباً',             'route'),
    ('rthrgd', '/img/traveler-airport.avif','مسافر يجرّ حقيبته في صالة وصول مطار',                            'route'),
    ('rtluxr', '/img/egypt-luxor.avif',     'أعمدة معبد فرعوني في الأقصر تحت ضوء النهار',                    'landmark'),
    ('rthgll', '/img/interior-van.avif',    'مقصورة ميني باص بمقاعد جلدية نظيفة ومساحة أرجل واسعة',          'route')
)
update public.sections s
set content = jsonb_set(
  s.content,
  '{items}',
  (
    select coalesce(jsonb_agg(
             case
               when m.k is null then el.item
               else el.item || jsonb_build_object('src', m.src, 'alt', m.alt, 'icon', m.icon)
             end
             order by el.ord), s.content -> 'items')
    from jsonb_array_elements(s.content -> 'items') with ordinality as el(item, ord)
    left join media m on m.k = el.item ->> '_k'
  )
)
from public.pages p
where p.id = s.page_id
  and p.slug = 'home'
  and s.type = 'route-rail'
  and jsonb_typeof(s.content -> 'items') = 'array'
  -- من بدّل صورةً من اللوحة لا تُعاد بذرته: يكفي عنصرٌ واحد يحمل `src`
  and not exists (
    select 1 from jsonb_array_elements(s.content -> 'items') as e(item)
    where e.item ? 'src'
  );

-- بطاقات الخدمات الست — تُبذَر **كاملة** لأن القسم اليوم بلا `items` إطلاقاً.
-- والنصوص منقولةٌ من `SERVICES` في `lib/site-config.ts` حرفاً، والروابط من
-- الـslug المنشور فعلاً (‏`/services/<slug>`) لا من التصميم (قرار بدر ٦).
update public.sections s
set content = s.content || jsonb_build_object('items', jsonb_build_array(
  jsonb_build_object('_k', 'svairp', 'icon', 'plane',
    'title', 'استقبال المطارات',
    'text',  'استقبال وتوصيل من وإلى جميع مطارات مصر على مدار الساعة.',
    'href',  '/services/airport-transfer',
    'src',   '/img/service-airport.avif',
    'alt',   'سائق يحمل لافتة استقبال في صالة وصول مطار'),
  jsonb_build_object('_k', 'svcity', 'icon', 'building',
    'title', 'التنقل داخل المدينة',
    'text',  'تنقلات مريحة داخل مدينتك بسائقين محترفين.',
    'href',  '/services/city-rides',
    'src',   '/img/service-city.avif',
    'alt',   'سيارة سوداء فاخرة في شارع مدينة عند المساء'),
  jsonb_build_object('_k', 'svintr', 'icon', 'route',
    'title', 'السفر عبر المدن',
    'text',  'رحلات بين المحافظات بسيارات حديثة وأسعار واضحة.',
    'href',  '/services/intercity-travel',
    'src',   '/img/service-intercity.avif',
    'alt',   'طريق سريع يمتد بين المحافظات تحت سماء صافية'),
  jsonb_build_object('_k', 'svtour', 'icon', 'landmark',
    'title', 'الجولات السياحية',
    'text',  'جولات لأشهر المزارات بسيارة خاصة وسائق يعرف الطريق.',
    'href',  '/services/tours',
    'src',   '/img/service-tours.avif',
    'alt',   'زوّار أمام معلم أثري مصري في جولة نهارية'),
  jsonb_build_object('_k', 'svevnt', 'icon', 'party',
    'title', 'المناسبات الخاصة',
    'text',  'تحركات منظمة لمناسباتك الخاصة بمواعيد دقيقة.',
    'href',  '/services/events',
    'src',   '/img/service-events.avif',
    'alt',   'سيارة مزيّنة لمناسبة خاصة أمام قاعة احتفالات'),
  jsonb_build_object('_k', 'svconf', 'icon', 'mic',
    'title', 'الحفلات والمؤتمرات',
    'text',  'أساطيل منسقة للحفلات والمؤتمرات والوفود.',
    'href',  '/services/conferences',
    'src',   '/img/service-conference.avif',
    'alt',   'قاعة مؤتمرات ومنصة عرض أمام حضور جالس')
))
from public.pages p
where p.id = s.page_id
  and p.slug = 'home'
  and s.type = 'services-grid'
  and not (s.content ? 'items');

-- ----------------------------------------------------------------------------
-- (١١) الفحص الذاتي الختامي
-- ----------------------------------------------------------------------------

do $$
declare
  v_bad          text;
  v_n            integer;
  v_item_witness integer;
  v_leaked       text;
begin
  -- (أ) كل صفٍّ في السجل ما زال قانونياً بعد توسيع الحارس (المُشغّل لا يمرّ على
  --     الصفوف التي لم تُلمَس، فنفحصها بالنداء المباشر — الذهبية ١٩)
  select string_agg(b.type || ': ' || r.reason, ' | ') into v_bad
  from public.block_registry b
  cross join lateral (
    select public.block_registry_check(
      b.type, b.role, b.placement, b.accepts_children, b.max_children,
      b.text_fields, b.item_fields, b.required_fields,
      b.non_text_fields, b.non_text_item_fields) as reason
  ) r
  where r.reason is not null;
  if v_bad is not null then
    raise exception '0065: صفوفٌ في السجل صارت مخالفة: %', v_bad;
  end if;

  select count(*) into v_n from public.block_registry;
  if v_n <> 15 then
    raise exception '0065: الكتالوج فيه % كتلة لا ١٥', v_n;
  end if;

  -- (ب) صور الأسطول الأربع وصلت
  select count(*) into v_n from public.vehicle_classes where image_url is not null;
  if v_n < 4 then
    raise exception '0065: صور الأسطول % لا ٤', v_n;
  end if;

  -- (ج) 🔴 شاهدٌ إيجابي **على مستوى العنصر** — وهو ما لم يكن موجوداً في §٤:
  --     صفٌّ حيٌّ يحمل `src` **داخل عنصر** ولا يظهر في الفهرس.
  select count(*) into v_item_witness
  from public.sections s
  join public.pages p on p.id = s.page_id and p.published = true
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(s.content -> 'items') = 'array'
         then s.content -> 'items' else '[]'::jsonb end) as el(item)
  where s.visible = true and el.item ? 'src';

  if v_item_witness = 0 then
    raise exception '0065: لا عنصر حيّ يحمل صورة — البذر لم يقع';
  end if;

  -- (د) ولا واحدٌ منها تسرّب إلى الفهرس
  select string_agg(k, ', ') into v_leaked
  from public.i18n_corpus_rows()
  where public.i18n_non_text_field(
          split_part(k, '.', array_length(string_to_array(k, '.'), 1)));
  if v_leaked is not null then
    raise exception '0065: مسارات تسرّبت إلى الفهرس: %', v_leaked;
  end if;

  -- (هـ) والنصّ البديل **دخل** — وإلا كنا أخفينا الصورة ووصفها معاً
  select count(*) into v_n
  from public.i18n_corpus_rows()
  where ns = 'section' and k like '%.items.%.alt';
  if v_n = 0 then
    raise exception '0065: صفر نصّ بديل في الفهرس — الإتاحة سقطت مع المسارات';
  end if;

  raise notice '0065 OK — % عنصراً يحمل صورة، و% نصّاً بديلاً في الفهرس، وصفر مسار',
    v_item_witness, v_n;
end $$;
