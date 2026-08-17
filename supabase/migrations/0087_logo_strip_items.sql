-- ============================================================================
-- 0087 — شعارات الماركات تصير `items` عادية، والتنويه يُحذف بقرار المالك
--
-- العقود المُلزِمة: `lib/page-builder-types.ts` §٤ و§٥ و§٦ ·
-- `lib/item-fields-types.ts` (م‑٧ — الحقول غير النصّية) ·
-- `supabase/migrations/0065` (‏`i18n_non_text_field`) · `0082` (‏`mint_item_key`).
--
-- ── (أ) قرار بدر ٤ انتهى لأن **مبرره** انتهى ────────────────────────────────
--
-- `0061` جعلت الشعارات بيانات نظام في `site_settings.fleetBrands`، والمبرر
-- المكتوب بجوار الصفّ: «‏`src` داخل عنصر قائمة شكلٌ لم يُقنَّن في عقد المنشئ».
-- **وم‑٧ قنّنته بعينه** (`0065`): `i18n_non_text_field` تحجب `src` **بالاسم**
-- على مستوى العنصر كما على المستوى الأعلى، و`route-rail` و`services-grid`
-- تحملان صور عناصرهما فعلاً منذ ذلك اليوم.
--
-- فالقيد الذي منع النقل زال ⇒ **والقرار يزول معه**، ولا يبقى بحكم العادة.
--
-- وبقي في م‑٧ مبرر ثانٍ — **نطاقٌ لا بنية**: «قائمةٌ واحدة تخدم كل صفحةٍ تحمل
-- الشريط». ويُعالَج بالاحتياط لا بالمنع: `items` تتجاوز و`fleetBrands` تحتيها،
-- نفس مذهب `SERVICES` مع `services-grid` حرفاً. ولذلك `required_fields` تبقى
-- **فارغة**، والصفّ الذي لا `items` له يُصيَّر من الإعدادات كما كان.
--
-- ── (ب) 🔴 `disclaimer` يُحذف كاملاً — قرار المالك، 2026-08-17 ───────────────
--
-- أضافته `0072` خانةً ثانية أسفل الشريط: `note` نثرٌ تحريري يختفي بالفراغ،
-- و`disclaimer` شرطُ استعمالٍ **يعيد افتراضيَّه عند الفراغ** فيملك المالك
-- الصياغة ولا يملك الحذف. وعُرض عليه الأمر بمخاطره فقرّر: **خانةٌ واحدة**.
-- وهو قرارُ منتجٍ لا هندسة (`docs/STANDING-ORDERS.md` البند ٣)، فيُنفَّذ بلا
-- تحوّطٍ ولا نصٍّ بديل يُلمّح إليه. ونصُّ التنويه المحفوظ **مرةً واحدة** في
-- `docs/phase-briefs/OWNER-NOTES-2026-08-16.md` — لا في الكود ولا في الرسائل.
--
-- 💡 **وثمنُه في الترجمة صفر، مقيساً لا مقدَّراً:** `translations` فيه ١٢٤ صفاً
--    اليوم (٦٩ صفحة · ٥٥ قسم)، و**لا صفَّ واحد** مفتاحُه ينتهي بـ`.disclaimer`
--    — لأن الحقل لم يُملأ قط على أي صفٍّ حيّ. فلا مفتاحَ منشورٍ يُسحب (العقد §١)،
--    والنافذة كانت ستُغلق عند أول ترجمةٍ يكتبها إنسان في هذا الحقل.
--
-- ── ما لا تفعله هذه الهجرة ──────────────────────────────────────────────────
--
-- ⚠ **لا تلمس `note`.** نثرُ المالك فيه صفٌّ حيّ على الرئيسية («نقوم بتوفير كافة
--   الموديلات المطلوبة…»)، وله ترجمةٌ إنجليزية في الطابور. يعبر كما هو حرفاً.
-- ⚠ **ولا تمحو `fleetBrands`** — صار احتياطاً بدورٍ مكتوب (D-39: الحذف ممنوع).
-- ⚠ **ولا تُعيد ترتيب شيء**: العناصر تُبنى بترتيب الصفّ نفسه (`ordinality`)،
--   فما يراه الزائر بعد الهجرة هو ما كان يراه قبلها **بنفس الترتيب**.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (١) لقطة الفهرس **قبل** أي كتابة — سابقة `0059` §(٥-١) و`0065` §٧ و`0082`.
--
-- والمحفوظ **المجموعة** لا الرقم: عدٌّ متساوٍ قد يخفي تبادلاً (مفتاحٌ سقط وآخر
-- وُلد)، فالمقارنة في §(٦) بالفرق لا بالعدد.
-- ----------------------------------------------------------------------------

create temporary table _corpus_before on commit drop as
select ns, k from public.i18n_corpus_rows();

-- ----------------------------------------------------------------------------
-- (٢) السجل — والترتيب جزءٌ من العقد كما يقارنه `page_builder_tests.sql` §(أ)
--
-- `text_fields`: يسقط `disclaimer` ويبقى `{title, note}` كما كانا في `0061`.
-- `item_fields`: `name` اسمٌ يُترجَم (وكان مجمَّداً على العربية في اللغتين حين
--   كان في `site_settings`) · `href` وجهةٌ تختلف باللغة (D-24) · `alt` نصٌّ
--   بديل يُقرأ بصوتٍ عالٍ.
-- `non_text_item_fields`: `src` وحده — مسارُ ملفٍّ لا جملة.
--
-- 🔒 **و`alt` إلزامٌ بنيوي لا اختيار:** القاعدة (٤) في `block_registry_check`
--    ترفض كتلةً تعلن `src` داخل العنصر ولا تعلن `alt` معه — وهي تُفحص أدناه
--    بالنداء الحيّ لا بالثقة.
-- ----------------------------------------------------------------------------

update public.block_registry
set text_fields          = array['title', 'note'],
    item_fields          = array['name', 'href', 'alt'],
    non_text_item_fields = array['src']
where type = 'logo-strip';

comment on table public.block_registry is
  'كتالوج كتل منشئ الصفحات — مرآة BLOCK_CATALOGUE في lib/page-builder-types.ts. '
  'و«logo-strip» صارت كتلة items منذ 0087: الشعار صورةُ عنصر (src غير نصّي) '
  'والاسم نصٌّ يُترجَم، و«site_settings.fleetBrands» احتياطٌ حين تفرغ items.';

-- ----------------------------------------------------------------------------
-- (٣) 🔴 الترحيل — **بلا فقد صفٍّ واحد، والعدد يُقاس حيّاً لا يُحفَر**
--
-- والشرط `not ? 'items'`: إعادة تنفيذ الملف لا تكتب فوق عناصر بدّلها المالك
-- ولا تُضاعفها — نفس قاعدة `do nothing` التي تمشي عليها `0061` §(٢) و`0004`.
--
-- ⚠ **و`alt` لا يُبذَر إطلاقاً** (ولا `href`): الفارغ في هذه الكتلة يعود إلى
--   **اسم الماركة** لا إلى `alt=""` (والمبرر في رأس `components/sections/logo-strip.tsx`:
--   لا شيء مرئيٌّ إلى جوار الشعار يسمّيه، فالزخرفة المعلنة كانت تعني قسماً
--   كاملاً يختفي عن قارئ الشاشة). وبذرُ مفتاحٍ فارغ كان يتضخّم في الـJSONB
--   ويُقرأ في اللوحة قيمةً كتبها أحد.
-- ----------------------------------------------------------------------------

do $$
declare
  v_brands      jsonb;
  v_brand_count integer;
  v_sec         record;
  v_items       jsonb;
  v_migrated    integer := 0;
  v_rows        integer := 0;
  v_dropped     integer := 0;
  v_reason      text;
begin
  select value into v_brands from public.site_settings where key = 'fleetBrands';
  if v_brands is null or jsonb_typeof(v_brands) <> 'array' then
    raise exception '0087: صفّ fleetBrands غائب أو ليس مصفوفة — لا يُرحَّل ما لا يُقرأ';
  end if;
  v_brand_count := jsonb_array_length(v_brands);
  if v_brand_count = 0 then
    raise exception '0087: fleetBrands فارغة — والترحيل بلا مصدر يعني شريطاً فارغاً على الرئيسية';
  end if;

  -- 📌 العدد **قبل**: يُطبع ويُقارن بما يُكتب، ولا يُحفَر رقمٌ في الهجرة
  --    (المحتوى يتغيّر بين كتابة الهجرة وتشغيلها — الدرس المكتوب في م‑٧ §٧).
  raise notice '  ← fleetBrands قبل الترحيل: % ماركة', v_brand_count;

  for v_sec in
    select id, coalesce(content, '{}'::jsonb) as content
    from public.sections
    where type = 'logo-strip'
    order by id
  loop
    v_rows := v_rows + 1;

    -- (٣-أ) حذف خانة التنويه — **الحقل يذهب، و`note` لا يُمسّ**
    if v_sec.content ? 'disclaimer' then
      v_dropped := v_dropped + 1;
    end if;

    -- (٣-ب) العناصر: تُبنى مرةً واحدة، وبترتيب الصفّ نفسه
    if v_sec.content ? 'items' then
      raise notice '  ← القسم % يحمل items سلفاً — لا يُكتب فوقه', v_sec.id;
      update public.sections set content = content - 'disclaimer' where id = v_sec.id;
      continue;
    end if;

    /**
     * `jsonb_strip_nulls` هي التي تُسقط `src` الغائب بلا فرعٍ شرطي: ماركةٌ بلا
     * شعار تُصيَّر اسمها نصّاً (سلوك العارضة القائم)، ومفتاحٌ قيمتُه `null` في
     * الـJSONB كان يُقرأ في اللوحة حقلاً كتبه أحد.
     *
     * و`mint_item_key()` تُنادى **بلا `p_taken`** بقصد: فضاؤها ٣٦^٦ ≈ ٢٫١
     * مليار، وعشرة سحوبٍ منه احتمالُ تصادمها ~٢٫١×١٠⁻⁸. والتصادم ليس متروكاً
     * للاحتمال مع ذلك — `items_key_check` أدناه ترفضه **قبل الكتابة**، وهي
     * الدالة التي يقرؤها حارس القاعدة نفسه (`0082`).
     */
    select jsonb_agg(
             jsonb_strip_nulls(
               jsonb_build_object(
                 '_k',   public.mint_item_key(),
                 'name', btrim(b.value ->> 'name'),
                 'src',  nullif(btrim(coalesce(b.value ->> 'logoUrl', '')), '')
               )
             )
             order by b.ord
           )
      into v_items
    from jsonb_array_elements(v_brands) with ordinality as b(value, ord)
    where coalesce(btrim(b.value ->> 'name'), '') <> '';

    if v_items is null or jsonb_array_length(v_items) <> v_brand_count then
      raise exception '0087: بُنيت % عنصراً من % ماركة — الترحيل يفقد صفاً',
        coalesce(jsonb_array_length(v_items), 0), v_brand_count;
    end if;

    -- 🔒 المفاتيح تُفحص قبل الكتابة بالدالة التي يقرؤها الحارس نفسه (`0082`)
    v_reason := public.items_key_check(v_items);
    if v_reason is not null then
      raise exception '0087: العناصر المبنية مرفوضة بـ% — تصادمُ مفاتيح أو شكلٌ مخالف', v_reason;
    end if;

    update public.sections
    set content = (v_sec.content - 'disclaimer') || jsonb_build_object('items', v_items)
    where id = v_sec.id;

    v_migrated := v_migrated + 1;
    raise notice '  ← القسم %: كُتبت % عنصراً', v_sec.id, jsonb_array_length(v_items);
  end loop;

  raise notice '  ← صفوف logo-strip: % · رُحّل منها % · خانة تنويه محذوفة من %',
    v_rows, v_migrated, v_dropped;

  -- الحارس البنيوي على الصفّ الجديد — **بالنداء الحيّ لا بالثقة** (الذهبية ١٩)
  select public.block_registry_check(type, role, placement, accepts_children, max_children,
                                     text_fields, item_fields, required_fields,
                                     non_text_fields, non_text_item_fields)
    into v_reason
  from public.block_registry where type = 'logo-strip';
  if v_reason is not null then
    raise exception '0087: الحارس البنيوي رفض صفّ logo-strip — %', v_reason;
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- (٤) ترجمات التنويه — **إن وُجدت تُسحب صراحةً، لا تُترك يتيمة**
--
-- مفتاحٌ خرج من الفهرس وترجمتُه باقية = صفٌّ لا يُعرض ولا يُحصى في
-- `translation_progress`، ويُبقي عدّاداً يكذب. والمقيس اليوم **صفر** — والحذف
-- مكتوبٌ مع ذلك لأن الهجرة تُشغَّل على قاعدةٍ قد لا تكون هذه.
-- ----------------------------------------------------------------------------

do $$
declare
  v_n integer;
begin
  with gone as (
    delete from public.translations t
    where t.namespace = 'section'
      and t.key like '%.disclaimer'
      and exists (
        select 1 from public.sections s
        where s.type = 'logo-strip' and t.key = s.id::text || '.disclaimer'
      )
    returning 1
  )
  select count(*) into v_n from gone;
  raise notice '  ← ترجمات التنويه المسحوبة: %', v_n;
end;
$$;

-- ----------------------------------------------------------------------------
-- (٥) الفحص الذاتي — **يحرس ما كان قائماً لا ما أضفناه** (القاعدة الذهبية ١٠)
-- ----------------------------------------------------------------------------

do $$
declare
  v_n        integer;
  v_brands   integer;
  v_items    integer;
  v_bad      text;
begin
  -- (٥-١) شكل الصفّ حرفاً بحرف
  select count(*) into v_n
  from public.block_registry
  where type = 'logo-strip'
    and text_fields          = array['title', 'note']
    and item_fields          = array['name', 'href', 'alt']
    and non_text_item_fields = array['src']
    and non_text_fields is null
    and required_fields = '{}'::text[]
    and role = 'system'
    and placement = 'once-per-page';
  if v_n <> 1 then
    raise exception '0087: صفّ logo-strip لم يصل إلى شكل العقد';
  end if;

  -- (٥-٢) و`disclaimer` غادر السجل **وكل صفوف المحتوى**
  if exists (
    select 1 from public.block_registry
    where 'disclaimer' = any(coalesce(text_fields, '{}'))
       or 'disclaimer' = any(coalesce(item_fields, '{}'))
  ) then
    raise exception '0087: «disclaimer» ما زال معلَناً في الكتالوج';
  end if;
  if exists (select 1 from public.sections where content ? 'disclaimer') then
    raise exception '0087: صفٌّ في sections ما زال يحمل مفتاح disclaimer';
  end if;

  -- (٥-٣) 🔴 والعدد: كل ماركةٍ صارت عنصراً، ولا واحدة سقطت
  select jsonb_array_length(value) into v_brands
  from public.site_settings where key = 'fleetBrands';
  select sum(jsonb_array_length(content -> 'items')) into v_items
  from public.sections where type = 'logo-strip' and content ? 'items';
  if v_items is distinct from v_brands then
    raise exception '0087: الماركات % والعناصر % — الترحيل فقد أو ضاعف', v_brands, v_items;
  end if;
  raise notice '  ← قبل: % ماركة   بعد: % عنصراً', v_brands, v_items;

  -- (٥-٤) 🔒 وكل عنصرٍ يحمل اسماً ومسار شعارٍ صالحاً — **قيمةً لا مفتاحاً**
  select string_agg(distinct e ->> '_k', ', ') into v_bad
  from public.sections s, jsonb_array_elements(s.content -> 'items') e
  where s.type = 'logo-strip'
    and (coalesce(btrim(e ->> 'name'), '') = ''
      or coalesce(e ->> 'src', '/') not like '/%');
  if v_bad is not null then
    raise exception '0087: عناصر بلا اسم أو بمسارٍ غير داخلي: %', v_bad;
  end if;

  -- (٥-٥) و`note` عبر كما هو — نثرُ المالك لا يُمسّ
  if not exists (
    select 1 from public.sections
    where type = 'logo-strip' and coalesce(btrim(content ->> 'note'), '') <> ''
  ) then
    raise notice '  ⚠ لا صفَّ logo-strip يحمل note — وهو مقبول إن كان فارغاً قبل الهجرة';
  end if;

  -- (٥-٦) والكتلة ما زالت تُصيَّر بمحتواها الحيّ (‏`block_renders` بالنداء الحيّ)
  if exists (
    select 1 from public.sections s
    where s.type = 'logo-strip' and s.visible
      and not public.block_renders(s.type, coalesce(s.content, '{}'::jsonb))
  ) then
    raise exception '0087: كتلة logo-strip ظاهرة ولا تُصيَّر بعد الترحيل';
  end if;

  -- (٥-٧) وعدد الكتالوج لم يتغيّر — لا كتلةَ وُلدت ولا سقطت
  select count(*) into v_n from public.block_registry;
  if v_n <> 19 then
    raise exception '0087: الكتالوج صار % كتلة لا ١٩', v_n;
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- (٦) 🔴 شرط الإغلاق — الفهرس **بالفرق لا بالعدد**، وفي الاتجاهين
--
-- والمعادلة المتوقَّعة، مقيسةً حيّاً لا محفورة:
--   يُضاف   = صفُّ `name` لكل عنصرٍ مُرحَّل           (نصٌّ كان مجمَّداً في الإعدادات)
--   يُسحَب  = صفُّ `disclaimer` لكل صفٍّ كان يحمله    (صفر اليوم)
--   ولا يُضاف صفٌّ واحد لمسار شعار — وهو محور م‑٧ كله.
-- ----------------------------------------------------------------------------

do $$
declare
  v_added   text;
  v_removed text;
  v_media   text;
begin
  -- (٦-أ) 🔴 **الشاهد الذي تقوم عليه المرحلة**: ولا مسارَ شعارٍ في الفهرس
  select string_agg(a.k, ', ') into v_media
  from (
    select k from public.i18n_corpus_rows()
    except select k from _corpus_before
  ) a
  where public.i18n_non_text_field(
          split_part(a.k, '.', array_length(string_to_array(a.k, '.'), 1)));
  if v_media is not null then
    raise exception '0087: مسارُ شعارٍ دخل فهرس الترجمة — %', v_media;
  end if;

  -- (٦-ب) والمضاف كله `name` ولا شيء غيره
  select string_agg(a.k, ', ') into v_added
  from (
    select k from public.i18n_corpus_rows()
    except select k from _corpus_before
  ) a
  where a.k not like '%.items.%.name';
  if v_added is not null then
    raise exception '0087: دخل الفهرس مفتاحٌ غير متوقَّع — %', v_added;
  end if;

  -- (٦-ج) والمسحوب كله `disclaimer` ولا شيء غيره — لا مفتاحَ نثرٍ يسقط معه
  select string_agg(b.k, ', ') into v_removed
  from (
    select k from _corpus_before
    except select k from public.i18n_corpus_rows()
  ) b
  where b.k not like '%.disclaimer';
  if v_removed is not null then
    raise exception '0087: سقط من الفهرس مفتاحٌ لا يُقصد سحبه — %', v_removed;
  end if;

  -- (٦-د) **شاهدٌ إيجابي**: أسماء الماركات في الفهرس فعلاً (وإلا أثبتنا فراغاً)
  select count(*)::text into v_added
  from public.i18n_corpus_rows() c
  join public.sections s on s.type = 'logo-strip' and c.k like s.id::text || '.items.%.name';
  if v_added = '0' then
    raise exception '0087: لا اسمَ ماركةٍ واحد في الفهرس — الترحيل لم يفتح ترجمتها';
  end if;
  raise notice '  ← أسماء ماركات دخلت طابور الترجمة: % (كانت مجمَّدة على العربية)', v_added;

  -- (٦-هـ) والحجب في **التطبيق** كما في الفهرس — بابان، وإغلاق أحدهما لا يكفي
  declare
    v_sec     uuid;
    v_k       text;
    v_applied jsonb;
  begin
    select s.id, s.content -> 'items' -> 0 ->> '_k' into v_sec, v_k
    from public.sections s
    where s.type = 'logo-strip' and s.content ? 'items'
    limit 1;

    if v_sec is not null and v_k is not null then
      select public.i18n_apply(s.content, v_sec::text, jsonb_build_object(
               v_sec::text || '.items.' || v_k || '.src',  '/brands/HIJACKED.svg',
               v_sec::text || '.items.' || v_k || '.name', 'Mercedes'))
        into v_applied
      from public.sections s where s.id = v_sec;

      if v_applied -> 'items' -> 0 ->> 'src' = '/brands/HIJACKED.svg' then
        raise exception '0087: i18n_apply استبدلت مسار الشعار — الحجب في التطبيق مفتوح';
      end if;
      if v_applied -> 'items' -> 0 ->> 'name' <> 'Mercedes' then
        raise exception '0087: اسم الماركة لم يُترجَم — الحجب ابتلع نصّاً يُقرأ';
      end if;
    end if;
  end;

  raise notice '✔ 0087: logo-strip = {title,note} + items{name,href,alt}+src · التنويه محذوف · المسارات خارج الفهرس';
end;
$$;
