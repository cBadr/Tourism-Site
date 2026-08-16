-- ============================================================================
-- 0068 — كتل المستندات الأربع: فهرسٌ وبندٌ بمرساة وجدولٌ وتنبيه
--
-- ⚠ الرقم `0068` لا `0067`: `0067_lead_time_and_flight.sql` قائمةٌ في المجلد
--    ويملكها مسارٌ آخر (نموذج الحجز). ويُعاد فحص المجلد **قبل** التطبيق.
--
-- ── العلّة، مقيسةً في المحتوى القائم لا مقدَّرة ──────────────────────────────
--
-- الصفحات الثابتة مبنيةٌ من `rich-text` متتالية وحدها: الشروط **١١** كتلة،
-- والخصوصية **١٠**، وسياسة الاسترداد **٩**. وعشر فقراتٍ متتالية **جدارُ نصٍّ
-- بالبناء** — إعادةُ صياغة النثر لا تصلحه، لأن القيد مفرداتٌ لا أسلوب.
--
-- والمحتوى نفسه جيّد: فيه نوافذ إلغاء (٢٤ · ٤٨ · ٧٢ ساعة) وخصومات (٢٥٪ · ٥٠٪)
-- وانتظارٌ مجاني (١٥ · ٣٠ · ٦٠ دقيقة) وردٌّ خلال ٣ و٧ أيام عمل — **أرقامٌ
-- مدفونة في نثر**. وسؤال الزائر واحد: «كم أخسر لو ألغيت غداً؟»، وجوابه اليوم
-- موزّعٌ على ثلاث فقرات. **وذاك جدولٌ لا فقرة.**
--
-- ── ما تفعله هذه الهجرة، وما لا تفعله ───────────────────────────────────────
--
-- تفعل ثلاثة: تحجز اسم `anchor` غير نصّياً، وتوسّع حارس السجل ليعرفه، وتسجّل
-- أربع كتل. **ولا تلمس محتوى صفحةٍ واحدة**: إعادةُ بناء الشروط والخصوصية
-- والاسترداد بهذه الكتل عملُ مالكٍ في اللوحة، لا `update` في هجرة — والهجرة
-- التي تعيد صياغة نصٍّ قانوني تتخذ قراراً ليس لها.
--
-- 🔴 **والقرار الذي يقوم عليه الملف كله — المرساة تُسَكّ ولا تُشتقّ:**
--    `anchor` معرّفٌ مستقل عن نصّ البند. ولو اشتُقّ من العنوان العربي لأبطل
--    **تصحيحُ حرفٍ واحد** كل رابطٍ أُرسل — **بلا ٤٠٤ ولا خطأ**: المتصفح يفتح
--    الصفحة من أولها، فيقرأ العميل المقدمة ويظن أن البند غير موجود، ولا سطر
--    في أي سجل. (‏`lib/item-fields-types.ts` §١٠ يكتب البدائل وعواقبها.)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (١) الأساس — يُقاس **حيّاً**، وسابقته `0059` §(٥-١) و`0065` §(١)
-- ----------------------------------------------------------------------------

create temp table _m10_corpus_before on commit drop as
  select ns, k from public.i18n_corpus_rows();

-- ----------------------------------------------------------------------------
-- (٢) اسمٌ خامس في الفضاء المغلق — ويمرّ بالمراجعة التي تشترطها `0065` §(٢):
--     «هل هذا الاسم جملةٌ يقولها إنسان؟»
--
-- `anchor` معرّفٌ لاتيني يُكتب في الرابط (`/terms#cancellation`) لا نثرٌ يُقرأ،
-- فحجزُه لا يصادر تعبيراً. **ولولا الحجز لدخل الفهرس** — والفهرس يفهرس كل
-- مفتاحٍ قيمتُه نصّ ولا يقرأ `block_registry` — **و`i18n_apply` تستبدل بالاسم**:
-- فمترجمٌ مجتهد يرى `cancellation` في الطابور فيكتب «الإلغاء»، وتصير مرساة
-- البند على `/en` نصّاً عربياً، **وكل رابطٍ أُرسل يهبط في أول الصفحة**. وهو
-- حرفياً عطب `hero.src` المقيس في م‑٧، منقولاً من الصورة إلى الرابط.
--
-- ⚠ ولا يلحق به `num` (رقم البند): «٤» بالعربية و«4» بالإنجليزية — جملةٌ تُقرأ
--   وتختلف صيغتها باللغة، فهي نصٌّ يُترجَم كـ`stat-band.value` وللسبب نفسه.
-- ----------------------------------------------------------------------------

create or replace function public.i18n_non_text_field(p_key text)
returns boolean
language sql
immutable
set search_path to ''
as $$
  select p_key is not null and p_key in ('src', 'poster', 'video', 'icon', 'anchor')
$$;

comment on function public.i18n_non_text_field(text) is
  'اسمٌ محجوز عالمياً لا يدخل فهرس الترجمة ولا يُستبدل في i18n_apply — '
  'مرآة NON_TEXT_FIELD_NAMES في lib/item-fields-types.ts §١ (خمسة أسماء بعد م‑١٠). '
  'يسري على المستوى الأعلى وداخل عنصر items معاً، وفي كل كتلة قائمة أو قادمة.';

create temp table _m10_corpus_after on commit drop as
  select ns, k from public.i18n_corpus_rows();

-- ----------------------------------------------------------------------------
-- (٣) شرط الإغلاق — والفرق عن `0065` أن **الفهرس يجب ألا يتحرّك بتاتاً**
--
-- في م‑٧ كان الحجز يسحب ثلاثة صفوف حيّة، فكان الشرط `after = before - 3`.
-- وهنا لا كتلة تحمل `anchor` بعد، فالشرط **تطابقٌ تام في الاتجاهين**. وعدٌّ
-- متساوٍ وحده لا يكفي: قد يخفي تبادلاً (سقط مفتاح ووُلد آخر).
-- ----------------------------------------------------------------------------

do $$
declare
  v_diff    text;
  v_applied jsonb;
  v_def     text;
  v_calls   integer;
begin
  select string_agg(d.k, ', ') into v_diff
  from (select k from _m10_corpus_before except select k from _m10_corpus_after) d;
  if v_diff is not null then
    raise exception '0068: سقطت مفاتيح من الفهرس بحجز `anchor` — %', v_diff;
  end if;

  select string_agg(d.k, ', ') into v_diff
  from (select k from _m10_corpus_after except select k from _m10_corpus_before) d;
  if v_diff is not null then
    raise exception '0068: ظهرت مفاتيح لم تكن قبل الحجز — %', v_diff;
  end if;

  -- والاتحاد وصله الاسم فعلاً: الحجب في الورقة وحدها لا يغني عن وصوله للفهرس
  if not (public.i18n_non_text_field('anchor')
          and public.i18n_reserved_content_key('anchor')) then
    raise exception '0068: `anchor` محجوب في الورقة ولا يصل الاتحاد — الفهرس ما زال يفهرسه';
  end if;

  -- والمحجوزات الأربعة السابقة لم تسقط مع التوسعة
  if not (public.i18n_non_text_field('src') and public.i18n_non_text_field('poster')
          and public.i18n_non_text_field('video') and public.i18n_non_text_field('icon')
          and public.i18n_reserved_content_key('_k')
          and public.i18n_reserved_content_key('style')) then
    raise exception '0068: محجوزٌ سابق سقط مع إضافة `anchor`';
  end if;

  -- ولا اتّسع الحجز على نثرٍ يقوله إنسان — وهو الحدّ الذي يمنع القائمة من النمو
  if public.i18n_non_text_field('num') or public.i18n_non_text_field('title')
     or public.i18n_non_text_field('alt') or public.i18n_non_text_field('href')
     or public.i18n_non_text_field('c1') or public.i18n_non_text_field('h1') then
    raise exception '0068: الحجز ابتلع اسماً نثرياً — رقمُ البند وخلايا الجدول تُترجَم';
  end if;

  -- (ج) الحجب في **التطبيق** كما في الفهرس: بابان، وإغلاق أحدهما لا يغلق الآخر.
  --     ووجهُه الآخر شرطٌ لا زينة: خلايا الجدول ورقم البند **تُترجَم فعلاً**.
  v_applied := public.i18n_apply(
    jsonb_build_object(
      'anchor', 'cancellation',
      'num',    '٤',
      'title',  'الإلغاء والاسترداد',
      'items',  jsonb_build_array(jsonb_build_object(
                  '_k', 'prb010', 'c1', 'قبل ٤٨ ساعة', 'c2', 'بلا رسوم'))
    ),
    'probe',
    jsonb_build_object(
      'probe.anchor',              'الإلغاء',
      'probe.num',                 '4',
      'probe.title',               'Cancellation & refunds',
      'probe.items.prb010.c1',     '48h or more',
      'probe.items.prb010.c2',     'No fee'
    )
  );

  if v_applied ->> 'anchor' <> 'cancellation' then
    raise exception '0068: i18n_apply استبدلت المرساة — % (وكل رابطٍ أُرسل يهبط في أول الصفحة)',
      v_applied ->> 'anchor';
  end if;
  if v_applied ->> 'num' <> '4' then
    raise exception '0068: رقم البند لم يُترجَم — «٤» و«4» صيغتان تختلفان باللغة';
  end if;
  if v_applied -> 'items' -> 0 ->> 'c1' <> '48h or more' then
    raise exception '0068: خلية الجدول لم تُترجَم — الحجب ابتلع نصّاً يُقرأ';
  end if;

  -- (د) شاهدٌ نصّي على ما كان قائماً لا على ما أضفناه (**D-58**)
  for v_def in
    select pg_get_functiondef(p.oid)
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('i18n_corpus_rows', 'i18n_apply')
  loop
    v_calls := (length(v_def) - length(replace(v_def, 'i18n_reserved_content_key', '')))
               / length('i18n_reserved_content_key');
    if v_calls <> 2 then
      raise exception '0068: نداءات i18n_reserved_content_key صارت % لا ٢ — الفهرس نصفُ محروس', v_calls;
    end if;
  end loop;

  raise notice '0068 §٣ OK — الفهرس لم يتحرّك، والمرساة تعبر i18n_apply كما دخلت';
end $$;

-- ----------------------------------------------------------------------------
-- (٤) الحارس البنيوي — **توقيعه لا يتغيّر**، وتُوسَّع قائمة الأسماء وحدها
--
-- الجسم منقولٌ من `0065` بحرفه ولم يُلمس منه إلا سطر `v_non_text`. ولأن
-- الوسائط العشرة نفسها، لا تُسقَط نسخةٌ قديمة ولا يُعاد توجيه المُشغّل — بخلاف
-- `0065` التي غيّرت ٨ ⇐ ١٠ فوجب فيها الإسقاط الصريح.
--
-- 🔒 **ولماذا القائمة مكتوبةٌ هنا مرةً ثانية بدل نداء `i18n_non_text_field`؟**
--    السطر مكتوبٌ في `0065`: الدالة `IMMUTABLE`، وربطُ حارسٍ بنيوي بدالة فهرسة
--    تبعيةٌ لا مبرر لها. والاتفاق بين النسختين **محروسٌ بفحصٍ حيّ** في
--    `page_builder_tests.sql` (م-١) لا بالانضباط.
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
  --    خمسةٌ بعد م‑١٠: `anchor` مرساة البند — معرّفٌ في الرابط لا نثر.
  v_non_text constant text[] := array['src', 'poster', 'video', 'icon', 'anchor'];
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

  -- (ب-٢) القائمتان غير النصّيتين — التعاشق الذي يجعل الانحراف غير قابل للكتابة
  foreach v_f in array coalesce(p_non_text_fields, '{}'::text[]) loop
    if v_f !~ '^[a-zA-Z][a-zA-Z0-9]*$' then
      return 'non-text-field-not-addressable:' || v_f;
    end if;
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

  -- (ب-٤) لا صورةَ عنصرٍ بلا موضعٍ لنصّها البديل
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
    if p_non_text_fields is not null or p_non_text_item_fields is not null then
      return 'layout-carries-media';
    end if;
  elsif p_max_children is not null then
    return 'max-children-on-leaf';
  end if;

  -- (د) الإلزامي يجب أن يكون قابلاً للملء: نصٌّ أعلى، أو `items`، أو حقلٌ غير
  --     نصّي **تعلنه هذه الكتلة بعينها**.
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

-- ----------------------------------------------------------------------------
-- (٥) الكتل الأربع — مرآة `BLOCK_CATALOGUE` في `lib/page-builder-types.ts` §١٠
--
-- ⚠ الترتيب داخل كل مصفوفة جزءٌ من العقد: `page_builder_tests.sql` يقارن
--   المصفوفات **مرتّبة** لا كمجموعات، ويسقط على الانحراف.
-- ----------------------------------------------------------------------------

insert into public.block_registry
  (type, role, placement, accepts_children, max_children,
   text_fields, item_fields, required_fields,
   non_text_fields, non_text_item_fields, enabled)
values
  -- فهرس الصفحة: بلا `items` بقصد — القائمة تُبنى من كتل `clause` على الصفحة
  -- نفسها، فمصدرُ عنوان البند يبقى واحداً. وفهرسٌ مكتوبٌ بيدٍ يعِد بما لا تفي
  -- به الصفحة بعد أول تعديل، ولا شاشة تقول ذلك.
  ('page-toc', 'content', 'once-per-page', false, null,
   array['title'], null, '{}'::text[], null, null, true),

  -- 🔴 `anchor` في `non_text_fields` هو تنفيذ قرار المرساة. و`required_fields`
  --    = `{title}` لا `{title,anchor}`: المرساة لا تكون ناقصة أبداً (الغياب
  --    يعني معرّف الصفّ)، وإلزامُها كان يُخفي **بنداً كاملاً** من صفحة سياسات
  --    لأن حقلاً تقنياً فارغ.
  ('clause', 'content', 'any', false, null,
   array['num', 'title', 'body'], null, array['title'], array['anchor'], null, true),

  -- الجدول: ترويسةٌ أعلى (`h1..h4`) وخلايا داخل العنصر (`c1..c4`)، فكل خليةٍ
  -- نصٌّ مستقلٌّ في الفهرس. وجدولٌ في حقلٍ واحد بفواصل كان يُترجَم كتلةً واحدة
  -- ويعود بأعمدةٍ مبعثرة.
  ('table', 'content', 'any', false, null,
   array['title', 'note', 'h1', 'h2', 'h3', 'h4'],
   array['c1', 'c2', 'c3', 'c4'], array['items'], null, null, true),

  -- التنبيه: `body` إلزامي — صندوقٌ ملوّن بلا رسالة يعلّم القارئ أن يتخطى
  -- الصناديق الملوّنة كلها. والنبرة رمزٌ في `style` لا نصّ، فلا تدخل الفهرس.
  ('callout', 'content', 'any', false, null,
   array['title', 'body'], null, array['body'], null, null, true)

on conflict (type) do update set
  role                 = excluded.role,
  placement            = excluded.placement,
  accepts_children     = excluded.accepts_children,
  max_children         = excluded.max_children,
  text_fields          = excluded.text_fields,
  item_fields          = excluded.item_fields,
  required_fields      = excluded.required_fields,
  non_text_fields      = excluded.non_text_fields,
  non_text_item_fields = excluded.non_text_item_fields,
  enabled              = excluded.enabled;

-- ----------------------------------------------------------------------------
-- (٦) الفحص الذاتي الختامي
-- ----------------------------------------------------------------------------

do $$
declare
  v_bad text;
  v_n   integer;
begin
  -- (أ) كل صفٍّ في السجل ما زال قانونياً بعد توسيع الحارس. والنداء **مباشر**
  --     لأن المُشغّل لا يمرّ على الصفوف التي لم تُلمَس (القاعدة الذهبية ١٩).
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
    raise exception '0068: صفوفٌ في السجل صارت مخالفة: %', v_bad;
  end if;

  select count(*) into v_n from public.block_registry;
  if v_n <> 19 then
    raise exception '0068: الكتالوج فيه % كتلة لا ١٩', v_n;
  end if;

  -- (ب) الأربع مسجَّلةٌ ومفعَّلة — وبلا `enabled` لا تُصيَّر ولا تُعرض في المنشئ
  select string_agg(t, ', ') into v_bad
  from unnest(array['page-toc', 'clause', 'table', 'callout']) as t
  where not exists (
    select 1 from public.block_registry b where b.type = t and b.enabled);
  if v_bad is not null then
    raise exception '0068: كتلٌ لم تُسجَّل أو غير مفعّلة: %', v_bad;
  end if;

  -- (ج) 🔴 شاهدٌ إيجابي على **البوابة** لا على الجدول: `block_renders` هي
  --     مرآة `blockRenders` في العارضة، فحكمُ الصفحة يجب أن يطابق حكم النشر.
  --     بندٌ بلا عنوان لا يُصيَّر، وبعنوانٍ يُصيَّر — ولو مرّ الأول لظهر بندٌ
  --     فارغ في فهرس صفحةٍ قانونية.
  if public.block_renders('clause', jsonb_build_object('num', '٤')) then
    raise exception '0068: بندٌ بلا عنوان يمرّ البوابة — سيظهر سطرٌ فارغ في الفهرس';
  end if;
  if not public.block_renders('clause',
       jsonb_build_object('title', 'الإلغاء', 'anchor', 'cancellation')) then
    raise exception '0068: بندٌ بعنوانٍ لا يمرّ البوابة — الحارس يرفض القانوني';
  end if;
  if public.block_renders('table', jsonb_build_object('items', '[]'::jsonb)) then
    raise exception '0068: جدولٌ بلا صفوف يمرّ البوابة — إطارٌ فارغ على صفحة عامة';
  end if;
  if public.block_renders('callout', jsonb_build_object('title', 'تنبيه')) then
    raise exception '0068: تنبيهٌ بلا نصّ يمرّ البوابة — صندوقٌ ملوّن بلا رسالة';
  end if;
  -- والفهرس يمرّ دائماً: شرطُ ظهوره **خارج محتواه** (كتل `clause` أخرى)،
  -- فالحكم عليه في العارضة التي ترى الصفحة كلها لا في بوابةٍ ترى كتلةً.
  if not public.block_renders('page-toc', '{}'::jsonb) then
    raise exception '0068: فهرس الصفحة لا يمرّ البوابة وهو بلا حقلٍ إلزامي';
  end if;

  raise notice '0068 OK — ١٩ كتلة في الكتالوج، والمرساة محجوزة، والبوابة تفرز الأربع';
end $$;
