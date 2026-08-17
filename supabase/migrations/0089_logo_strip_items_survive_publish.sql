-- ============================================================================
-- 0089 — عناصر شريط الماركات تنجو من النشر: اللقطة تُرحَّل كما تُرحَّل الصفوف
--
-- ── 🔴 العطل كما قِيس حيّاً (2026-08-17)، لا كما يُتوقَّع ─────────────────────
--
-- `0087` رحّلت الماركات العشر إلى `sections.content->'items'` ونجحت: عشرةُ
-- عناصر بمفاتيحها، والفهرس كسب عشرة أسماء. ثم — **بعد دقيقتين** — نُشرت الصفحة
-- الرئيسية من المنشئ، فعادت `items` إلى الغياب. والمقيس بأعيانه:
--
--   0087 طُبِّقت            08:32:31Z
--   نشرةٌ للرئيسية          08:34:56Z   ⇒ items اختفت
--   ثم 08:43:07 · 08:44:21 · 08:46:36
--
-- **والسبب ليس عطباً في `0087` بل قاعدةٌ لم تكن مكتوبة في أي عقد:**
-- `publish_page_revision` **يُعيد تشغيل لقطةً** (`page_revisions.snapshot`) على
-- `sections` — ولقطةُ المسودة تُؤخذ لحظة فتح المنشئ. فأي هجرةٍ تكتب في
-- `sections.content` بينما جلسةُ منشئٍ مفتوحة **تُمحى بأول نشرة**، لأن اللقطة
-- أُخذت قبل الهجرة ولا تعرف ما كتبته. والمحرر القديم كان الخطر المكتوب في العقد
-- §١٢ (الثمن ٣)؛ **وهذا وجهه الثاني ولم يكن مكتوباً**: لا يمحوه محرّرٌ يعيد بناء
-- `content`، بل **نشرةٌ تعيد تشغيل ماضٍ**.
--
-- 🔒 **والقاعدة المستخلَصة، وهي أهمّ ما في هذا الملف:**
--    **مَن كتب في `sections.content` كتب في اللقطات الحيّة معها** — وإلا كانت
--    هجرتُه صحيحةً ومُعمَّرةً بعمر أول ضغطة «نشر».
--
-- ⚠ **ولماذا لم يُكتشف بالعين؟** لأن العارضة تسقط إلى `settings.fleetBrands`
--    حين تفرغ `items` (‏`0087` §أ). فالشريط ظلّ يعرض عشرة شعارات صحيحة على
--    ٣٧٥ وعلى ١٢٨٠ **بينما التحرير من اللوحة كان مطفأً**: اللوحة تقول «٠
--    عنصراً». والاحتياط أنقذ الصفحة وأخفى العطل — وهو تمام الفائدة وتمام الفخّ.
--
-- ── ما تفعله هذه الهجرة ─────────────────────────────────────────────────────
--
-- ١) تعيد كتابة `items` في `sections` (‏`0087` §٣ نفسها، وبنفس شرط عدم الكتابة
--    فوق عناصر قائمة).
-- ٢) **وتُرحّل اللقطات الحيّة**: `status in ('draft','published')` وحدها.
--
-- ⚠ **والمؤرشفة لا تُلمس** — إعادةُ كتابة الماضي تكذب على من يقرأ السجل. وثمنُه
--   مكتوب: من رجع إلى لقطةٍ مؤرشفة عادت `items` إلى الغياب، **فيعود الشريط إلى
--   `fleetBrands` ويُصيَّر كما هو** — رجوعٌ صريح لا انكسار صامت.
--
-- 🔴 **والمفاتيح `_k` تُنسَخ ولا تُسَكّ ثانيةً.** لو سُكّت للقطة مفاتيحُ أخرى
--    لاختلف عنوان ترجمة العنصر بين الصفّ واللقطة، **فأول نشرة تُيتّم عشرة مفاتيح
--    ترجمة** — وهو حرفياً العطب الذي بُنيت `0059` لمنعه. فالمصدر واحد: مصفوفةٌ
--    تُبنى مرةً وتُكتب في الموضعين.
--
-- ⚠ **ولا يُمسّ `note` في أي من الموضعين.** والمقيس أنهما **مختلفان اليوم**:
--   نصُّ الصفّ ونصُّ اللقطة نثران حرّرهما المالك في وقتين. وتوحيدُهما ليس من شأن
--   هجرة — النشرة القادمة توحّدهما بما يختاره هو.
-- ============================================================================

create temporary table _corpus_before_89 on commit drop as
select ns, k from public.i18n_corpus_rows();

do $$
declare
  v_brands   jsonb;
  v_count    integer;
  v_sec      record;
  v_items    jsonb;
  v_reason   text;
  v_secs     integer := 0;
  v_snaps    integer := 0;
begin
  select value into v_brands from public.site_settings where key = 'fleetBrands';
  if v_brands is null or jsonb_typeof(v_brands) <> 'array' or jsonb_array_length(v_brands) = 0 then
    raise exception '0089: fleetBrands غائبة أو فارغة — لا يُرحَّل ما لا يُقرأ';
  end if;
  v_count := jsonb_array_length(v_brands);

  for v_sec in
    select id, page_id, coalesce(content, '{}'::jsonb) as content
    from public.sections
    where type = 'logo-strip'
    order by id
  loop
    -- (١) المصفوفة الواحدة: القائمة الحيّة إن وُجدت، وإلا تُبنى من الإعدادات
    if v_sec.content ? 'items'
       and jsonb_typeof(v_sec.content -> 'items') = 'array'
       and jsonb_array_length(v_sec.content -> 'items') > 0 then
      v_items := v_sec.content -> 'items';
    else
      select jsonb_agg(
               jsonb_strip_nulls(jsonb_build_object(
                 '_k',   public.mint_item_key(),
                 'name', btrim(b.value ->> 'name'),
                 'src',  nullif(btrim(coalesce(b.value ->> 'logoUrl', '')), '')
               ))
               order by b.ord
             )
        into v_items
      from jsonb_array_elements(v_brands) with ordinality as b(value, ord)
      where coalesce(btrim(b.value ->> 'name'), '') <> '';

      if v_items is null or jsonb_array_length(v_items) <> v_count then
        raise exception '0089: بُنيت % عنصراً من % ماركة — الترحيل يفقد صفاً',
          coalesce(jsonb_array_length(v_items), 0), v_count;
      end if;
    end if;

    v_reason := public.items_key_check(v_items);
    if v_reason is not null then
      raise exception '0089: العناصر مرفوضة بـ% — تصادمُ مفاتيح أو شكلٌ مخالف', v_reason;
    end if;

    -- (٢) الصفّ الحيّ
    if not (v_sec.content ? 'items') or v_sec.content ? 'disclaimer' then
      update public.sections
      set content = (content - 'disclaimer') || jsonb_build_object('items', v_items)
      where id = v_sec.id;
      v_secs := v_secs + 1;
    end if;

    -- (٣) 🔴 واللقطات الحيّة — **بنفس المصفوفة حرفاً**، وبلا مساس بـ`note`
    --
    --     والشرط `not (content ? 'items')` يحمي عملَ المالك: مسودةٌ حرّر فيها
    --     عناصره فعلاً لا تُكتب فوقها. والحقن للقطة التي لا تعرف الحقل أصلاً.
    update public.page_revisions r
    set snapshot = jsonb_set(
          r.snapshot,
          '{sections}',
          (
            select jsonb_agg(
                     case
                       when e.s ->> 'id' = v_sec.id::text
                        and coalesce(e.s ->> 'type', '') = 'logo-strip'
                       then jsonb_set(
                              e.s,
                              '{content}',
                              (coalesce(e.s -> 'content', '{}'::jsonb) - 'disclaimer')
                              || case
                                   when coalesce(e.s -> 'content', '{}'::jsonb) ? 'items'
                                     then '{}'::jsonb
                                   else jsonb_build_object('items', v_items)
                                 end
                            )
                       else e.s
                     end
                     order by e.ord
                   )
            from jsonb_array_elements(r.snapshot -> 'sections') with ordinality as e(s, ord)
          )
        )
    where r.page_id = v_sec.page_id
      and r.status in ('draft', 'published')
      and jsonb_typeof(r.snapshot -> 'sections') = 'array'
      and exists (
        select 1 from jsonb_array_elements(r.snapshot -> 'sections') x
        where x ->> 'id' = v_sec.id::text
          and (not (coalesce(x -> 'content', '{}'::jsonb) ? 'items')
               or coalesce(x -> 'content', '{}'::jsonb) ? 'disclaimer')
      );
    v_snaps := v_snaps + (select count(*) from public.page_revisions r
                          where r.page_id = v_sec.page_id and r.status in ('draft','published'));
  end loop;

  raise notice '  ← صفوف مُرحَّلة: % · لقطات حيّة مفحوصة: %', v_secs, v_snaps;
end;
$$;

-- ----------------------------------------------------------------------------
-- (٤) الفحص الذاتي — **والشاهد الحاكم: اللقطة والصفّ يحملان نفس المفاتيح**
--
-- فلو اختلفا، نجحت الهجرة اليوم و**أيتمت عشرة مفاتيح ترجمة** عند أول نشرة.
-- ----------------------------------------------------------------------------

do $$
declare
  v_brands integer;
  v_items  integer;
  v_bad    text;
begin
  select jsonb_array_length(value) into v_brands
  from public.site_settings where key = 'fleetBrands';

  -- (٤-١) الصفوف: كل ماركةٍ عنصر
  select sum(jsonb_array_length(content -> 'items')) into v_items
  from public.sections where type = 'logo-strip';
  if v_items is distinct from v_brands then
    raise exception '0089: الماركات % والعناصر % في الصفوف', v_brands, v_items;
  end if;

  -- (٤-٢) 🔴 اللقطات الحيّة: **نفس المفاتيح بنفس الترتيب** لا مجرّد نفس العدد.
  --       (عدٌّ متساوٍ يمرّ فوق مفاتيح مختلفة تماماً — وهي الحالة القاتلة.)
  select string_agg(d.msg, ' | ') into v_bad
  from (
    select r.id::text || '/' || s.id::text as msg
    from public.page_revisions r
    join public.sections s on s.page_id = r.page_id and s.type = 'logo-strip'
    join lateral (
      select x -> 'content' -> 'items' as snap_items
      from jsonb_array_elements(r.snapshot -> 'sections') x
      where x ->> 'id' = s.id::text
      limit 1
    ) e on true
    where r.status in ('draft', 'published')
      and (
        e.snap_items is null
        or (select jsonb_agg(i ->> '_k' order by ord)
            from jsonb_array_elements(e.snap_items) with ordinality as t(i, ord))
           is distinct from
           (select jsonb_agg(i ->> '_k' order by ord)
            from jsonb_array_elements(s.content -> 'items') with ordinality as t(i, ord))
      )
  ) d;
  if v_bad is not null then
    raise exception '0089: لقطةٌ حيّة تخالف صفَّها في مفاتيح العناصر — النشرة القادمة تُيتّم الترجمة: %', v_bad;
  end if;

  -- (٤-٣) و`disclaimer` غادر الصفوف **واللقطات الحيّة** معاً
  if exists (select 1 from public.sections where content ? 'disclaimer') then
    raise exception '0089: صفٌّ ما زال يحمل مفتاح disclaimer';
  end if;
  if exists (
    select 1 from public.page_revisions r, jsonb_array_elements(r.snapshot -> 'sections') x
    where r.status in ('draft', 'published')
      and coalesce(x -> 'content', '{}'::jsonb) ? 'disclaimer'
  ) then
    raise exception '0089: لقطةٌ حيّة ما زالت تحمل مفتاح disclaimer — النشرة تعيده';
  end if;

  -- (٤-٤) والكتلة تُصيَّر، والمسارات خارج الفهرس (شاهد `0087` مُعاداً حيّاً)
  if exists (
    select 1 from public.sections s
    where s.type = 'logo-strip' and s.visible
      and not public.block_renders(s.type, coalesce(s.content, '{}'::jsonb))
  ) then
    raise exception '0089: كتلة logo-strip ظاهرة ولا تُصيَّر';
  end if;

  select string_agg(a.k, ', ') into v_bad
  from (select k from public.i18n_corpus_rows() except select k from _corpus_before_89) a
  where public.i18n_non_text_field(
          split_part(a.k, '.', array_length(string_to_array(a.k, '.'), 1)));
  if v_bad is not null then
    raise exception '0089: مسارُ شعارٍ دخل فهرس الترجمة — %', v_bad;
  end if;

  raise notice '✔ 0089: % عنصراً في الصفوف واللقطات الحيّة بنفس المفاتيح — النشرة لا تمحوها', v_items;
end;
$$;
