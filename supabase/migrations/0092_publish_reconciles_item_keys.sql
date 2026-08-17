-- ============================================================================
-- 0092 — النشرة تُصالِح اللقطة قبل أن تُشغّلها: مفاتيح العناصر لا تُمحى صامتاً
--
-- ══════════════════════════════════════════════════════════════════════════
--  🔴 العطب الصنفي — لا حادثةً واحدة
-- ══════════════════════════════════════════════════════════════════════════
--
-- `publish_page_revision` **يُعيد تشغيل لقطةً**: خطوته (ج) تكتب
-- `sections.content = <محتوى اللقطة>` جملةً واحدة. ولقطةُ المسودة تُؤخذ لحظة فتح
-- المنشئ. فأي هجرةٍ تكتب في `sections.content` بينما جلسةُ منشئٍ مفتوحة **تُمحى
-- بأول ضغطة «نشر»** — لأن اللقطة أُخذت قبل الهجرة ولا تعرف ما كتبته.
--
-- والمقيس بأعيانه في 2026-08-17: `0087` رحّلت عشر ماركاتٍ إلى
-- `sections.content->'items'` في 08:32:31Z، ثم نُشرت الرئيسية أربع مرّات
-- (‏08:34:56 · 08:43:07 · 08:44:21 · 08:46:36) فعادت `items` إلى الغياب في كل
-- مرة. وأصلحت `0089` **حالتها** بأن كتبت اللقطات الحيّة مع الصفوف — لكنها تركت
-- **القاعدة** عُرفاً يتذكّره كاتب الهجرة التالية أو ينساه.
--
-- ⚠ **ولم يكشفه أحد بالعين**: العارضة تسقط إلى `settings.fleetBrands` حين تفرغ
--   `items`، فظلّ الشريط يعرض عشرة شعارات صحيحة **بينما التحرير من اللوحة كان
--   مطفأً** واللوحة تقول «٠ عنصراً». الاحتياطي أنقذ الصفحة وأخفى العطل.
--
-- 🔒 **والخسارة ليست في النصّ بل في العنوان.** كل عنصرٍ يحمل `_k`، و`_k` هو
--    عنوان ترجمته (‏`0059`). فمحوُ `items` **يُيتّم مفاتيح الترجمة** ولا يُعاد
--    ما ضاع منها بإعادة الكتابة: العناصر الجديدة تُسكّ لها مفاتيح أخرى.
--    فالنثر يُعاد كتابته، والعنوان لا.
--
-- ══════════════════════════════════════════════════════════════════════════
--  🔒 الحارس المختار: **مصالحةٌ لا منع** (‏D-60)
-- ══════════════════════════════════════════════════════════════════════════
--
-- قبل أي فحصٍ وقبل حساب الفرق، تُحمَل قائمةُ العناصر الحيّة إلى كتلةِ اللقطة
-- **التي لا تعرف مفتاح `items` إطلاقاً**. فيرى الحاجزُ والفرقُ والتشغيلُ لقطةً
-- واحدة، ويبقى النشر ماضياً كما هو.
--
-- 🔴 **والحدّ الفاصل الذي يقوم عليه القرار كلّه: الغياب ليس الفراغ.**
--
--   | شكل اللقطة        | المعنى                        | ما تفعله المصالحة |
--   |-------------------|-------------------------------|-------------------|
--   | لا مفتاح `items`  | «هذه اللقطة لا تعرف الحقل»    | تحمل القائمة الحيّة |
--   | `"items": []`     | «المالك أفرغ القائمة عمداً»    | **لا تلمسها**      |
--
-- والمنشئ يكتب `[]` حين يفرغ المالك قائمةً — فالفرق بين الحالتين ليس تخميناً بل
-- بصمةٌ يكتبها كاتبان مختلفان. وهو نفس الفرق الذي اتّكأت عليه `0089` §(٣).
--
-- ── ولماذا **لا** أحد البديلين ──────────────────────────────────────────────
--
-- ١) **منعُ نشر لقطةٍ تخالف قاعدة المفاتيح** — مرفوض لسببين:
--    • **لا يمسك العطب أصلاً.** `sections_guard_item_keys` مربوطٌ على الجدول
--      فعلاً ويفحص كل كتابة، بما فيها خطوة (ج). لكنه يرفض `items` **مخالفةً**،
--      و`items` **غائبة** شكلٌ قانوني تماماً (`items_key_check(null) ⇒ null`).
--      فالعطب مرّ من تحت حارسٍ قائم يعمل، ومنعٌ ثانٍ من جنسه يمرّ من تحته كذلك.
--    • 🔴 **وثمنه أن يُحبَس المالك خارج محتواه.** لقطةٌ من قبل `0082` عناصرها
--      بلا `_k` تصير غير قابلة للنشر إلى الأبد — والرجوعُ إلى لقطةٍ قديمة هو
--      بعينه ما وُجد تاريخُ الصفحة لأجله. **وحارسٌ يمنع النشر أسوأ من الانحراف
--      الذي يمنعه.**
--
-- ٢) **دمجٌ عام: كل مفتاحٍ في الصفّ غائبٌ عن اللقطة يُحمَل إليها** — مرفوض لأنه
--    **يقتل الحذف**. المنشئ يبني `content` من نموذجه، وإفراغُ حقلٍ اختياري يُخرج
--    مفتاحه من الكائن — فدمجٌ عام يعني أن المالك لا يستطيع حذف حقلٍ أبداً، وأن
--    `0089` نفسها (التي أخرجت `disclaimer`) كانت ستُنقض بأول نشرة. فالمصالحة
--    محصورةٌ في `items` بمبرر مكتوب: **هي المفتاح الوحيد الذي تُخسر بخسارته
--    عناوينُ ترجمةٍ لا تُستعاد.** وما عداه نثرٌ يُعاد كتابته.
--
-- ٣) **تأكيدٌ في مجموعة الاختبار وحده** — لا يكفي بديلاً: يرنّ بعد الخسارة لا
--    قبلها، ولا يرنّ إلا حين يُشغّله أحد. فهو **مُضافٌ** لا بديل: التأكيد
--    والطفرة في `page_builder_tests.sql` §(ع).
--
-- ⚠ **ولا تُلمس اللقطات المؤرشفة** (مذهب `0089`): المصالحة تقع على **اللقطة
--   المنشورة الآن** وحدها، داخل معاملة النشر، تحت قفلها. وإعادةُ كتابة الماضي
--   تكذب على من يقرأ السجل.
--
-- 📌 والقاعدة الدائمة لكاتب الهجرة التالية باقيةٌ ومكتوبة في **D-60**: مَن كتب
--    في `sections.content` كتب في اللقطات الحيّة معها. والمصالحة شبكةُ أمانٍ
--    لمن نسيها، لا رخصةٌ في نسيانها — فهي تحمي `items` وحدها.
--
-- المرجع: 0058_page_builder.sql · 0082_item_keys_guard.sql · 0087 · 0089
--         · handover/DECISIONS.md ← D-58 و D-60
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (١) المُصالِح — دالةٌ مستقلة، فالتوسيع تفويضٌ لا استنساخ (القاعدة الذهبية ١٢)
--
-- ولها ثلاثة أسباب لأن تكون دالةً لا سطوراً داخل الناشر:
--   • تُنادى في التأكيد وحدها، فيُقاس الحدّ الفاصل بلا هويةِ مشرفٍ ولا نشرة.
--   • وتُعطَّل في الطفرة وحدها، فيثبت أن ما نجا نجا **بها** لا بشيءٍ آخر.
--   • وجسم الناشر يكسب سطراً واحداً — فبقاء إصلاحاته السابقة يُقرأ بالعين.
-- ----------------------------------------------------------------------------
create or replace function public.reconcile_revision_items(
  p_page     uuid,
  p_revision uuid
) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_blocks jsonb;
  v_new    jsonb;
  v_n      integer;
begin
  select r.snapshot -> 'sections' into v_blocks
  from public.page_revisions r
  where r.id = p_revision and r.page_id = p_page;

  -- الشكل المعطوب ليس شأن هذه الدالة: المنادي يرفضه برمزه (`template-shape`)،
  -- وابتلاعُه هنا يحوّل رسالةً مفهومة إلى صمت.
  if v_blocks is null or jsonb_typeof(v_blocks) <> 'array' then
    return 0;
  end if;

  -- المرور الواحد: يُبنى الجديد ويُعدّ الملموس في جملةٍ واحدة، فلا ينحرف
  -- العدّاد عن الكتابة (وهما مصدران لرقمٍ واحد لو فُصلا — النمط ٨).
  --
  -- ⚠ و`case` حول التحويل إلى `uuid` مقصودة: هذه الدالة تُنادى قبل فحص شكل
  --   المعرّفات في الناشر، وكتلةٌ بمعرّفٍ فاسد يجب أن تمرّ من هنا سالمةً إلى
  --   الرسالة التي تسمّي العيب — لا أن تنفجر بخطأ تحويلٍ غامض.
  with snap as (
    select e.ord as ord,
           e.x   as x,
           case when (e.x ->> 'id') ~
                     '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
                then (e.x ->> 'id')::uuid
           end as sid,
           not (coalesce(e.x -> 'content', '{}'::jsonb) ? 'items') as no_items
    from jsonb_array_elements(v_blocks) with ordinality as e(x, ord)
  ),
  fixed as (
    select n.ord as ord,
           -- 🔴 الشرط بحرفه: **غائبٌ** عن اللقطة · **قائمٌ غير فارغ** في الصفّ
           (n.no_items
             and jsonb_typeof(s.content -> 'items') = 'array'
             and coalesce(jsonb_array_length(s.content -> 'items'), 0) > 0) as touched,
           case
             when n.no_items
              and jsonb_typeof(s.content -> 'items') = 'array'
              and coalesce(jsonb_array_length(s.content -> 'items'), 0) > 0
             then jsonb_set(n.x, '{content}',
                    coalesce(n.x -> 'content', '{}'::jsonb)
                    || jsonb_build_object('items', s.content -> 'items'))
             else n.x
           end as x
    from snap n
    left join public.sections s
      on s.page_id = p_page and s.id = n.sid
  )
  select jsonb_agg(f.x order by f.ord),
         count(*) filter (where f.touched)::integer
    into v_new, v_n
  from fixed f;

  if coalesce(v_n, 0) = 0 then
    return 0;
  end if;

  update public.page_revisions r
     set snapshot = jsonb_set(r.snapshot, '{sections}', coalesce(v_new, '[]'::jsonb))
   where r.id = p_revision and r.page_id = p_page;

  -- 🔒 أثرٌ في سجل الخادم لا في نوع الإرجاع: `raise log` تُكتب دائماً، و`notice`
  --    لا تُسجَّل ولا يقرؤها supabase-js. وإضافةُ حقلٍ إلى الإرجاع تُحرّك عقد
  --    `lib/page-builder-types.ts` — وتغييرُ عقدٍ لأجل عدّادِ تشخيص ثمنٌ لا داعي له.
  raise log '0092 reconcile_revision_items: page=% revision=% blocks=%',
    p_page, p_revision, v_n;
  return v_n;
end;
$$;

comment on function public.reconcile_revision_items(uuid, uuid) is
  'تحمل قائمة `items` الحيّة إلى كتلةِ لقطةٍ لا تعرف المفتاح إطلاقاً، قبل تشغيل اللقطة. '
  'و`"items": []` إرادةُ مالكٍ صريحة فلا تُلمس — الغياب ليس الفراغ (D-60). '
  'غير ممنوحة لأي دور مستخدم: تُنادى من داخل publish_page_revision وحده.';

-- 🔒 المنحة الافتراضية على أي دالة جديدة هي `EXECUTE` لـ`PUBLIC` — والسحب هو
--    الحارس (القاعدة الذهبية ١٦ من جهتها الأخرى). والناشر `definer` فينادي
--    بصلاحيات مالكه، فالسحب لا يعطّله.
revoke all on function public.reconcile_revision_items(uuid, uuid) from public;
revoke all on function public.reconcile_revision_items(uuid, uuid) from anon;
revoke all on function public.reconcile_revision_items(uuid, uuid) from authenticated;

-- ----------------------------------------------------------------------------
-- (٢) الناشر — الجسم **منقولٌ من الكتالوج الحيّ** (`pg_get_functiondef`) لا من
--     هجرةٍ سابقة (D-58)، وما أُضيف إليه سطران: النداء، وقراءةُ اللقطة بعده.
--
-- ⚠ وموضعُ النداء ليس اعتباطاً: **قبل** `page_publish_blockers` و**قبل**
--   `page_revision_diff`. فالحاجز يقرأ اللقطة من الجدول بنفسه، والفرق كذلك —
--   فمصالحةٌ بعدهما تُنتج بوابةً تحكم على شكلٍ وتشغيلاً يكتب شكلاً آخر، وعدّاداً
--   يعلن تعديلاً لم يحدث فيحرّك `lastModified` ويكذب على الزاحف.
-- ----------------------------------------------------------------------------
create or replace function public.publish_page_revision(p_page uuid, p_revision uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rev     record;
  v_blocks  jsonb;
  v_d       record;
  v_blocked text;
  v_kept    jsonb;
  v_bad     integer;
  v_lock    uuid;
begin
  if not public.is_admin() then
    raise exception 'النشر للإدارة وحدها' using hint = 'forbidden';
  end if;

  -- قفل الصفحة أولاً: نشرتان متزامنتان من تبويبين تنتجان فرقاً محسوباً على
  -- حالةٍ لم تعد قائمة — والقفل هو ما يجعل «معاملة واحدة» (D-48) معنىً لا شكلاً.
  select p.id into v_lock from public.pages p where p.id = p_page for update;
  if v_lock is null then
    raise exception 'الصفحة غير موجودة' using hint = 'not-found';
  end if;

  select r.id, r.status, r.snapshot into v_rev
  from public.page_revisions r
  where r.id = p_revision and r.page_id = p_page
  for update;

  if not found then
    raise exception 'اللقطة غير موجودة أو لا تخصّ هذه الصفحة' using hint = 'stale-revision';
  end if;
  if v_rev.status <> 'draft' then
    raise exception 'اللقطة حالتها «%» لا مسودة — نُشرت من جلسةٍ أخرى', v_rev.status
      using hint = 'stale-revision';
  end if;

  -- 🔴 (D-60) المصالحة — تحت قفل الصفحة واللقطة، وقبل كل قارئٍ للقطة.
  --
  -- لقطةٌ أُخذت قبل هجرةٍ كتبت في `sections.content` لا تعرف مفتاح `items`،
  -- وإعادةُ تشغيلها كما هي تمحو القائمة الحيّة **ومعها مفاتيح `_k`** — وهي
  -- عناوين الترجمة التي لا تُستعاد. فتُحمَل القائمة إلى اللقطة، ولا يُمنع نشرٌ:
  -- القيمة تُضاف ولا تُرفض. والغياب وحده يُصالَح — `"items": []` إرادةُ مالك.
  perform public.reconcile_revision_items(p_page, p_revision);

  -- والقراءة **بعد** المصالحة لا من `v_rev` المأخوذة قبلها — وإلا صالحنا اللقطة
  -- في الجدول وشغّلنا نسخةً في الذاكرة تجاهلتها.
  select coalesce(r.snapshot -> 'sections', '[]'::jsonb) into v_blocks
  from public.page_revisions r
  where r.id = p_revision and r.page_id = p_page;

  if jsonb_typeof(v_blocks) <> 'array' then
    raise exception 'اللقطة بلا مصفوفة sections' using hint = 'template-shape';
  end if;

  -- 🔒 كل كتلة في اللقطة تحمل معرّفاً صالحاً — وإلا انهار **أساس** هذه الدالة:
  --    المطابقة بالمعرّف. وكتلةٌ جديدة يسكّ لها المنشئ uuid قبل الحفظ، فيصير
  --    ذلك المعرّف هو `sections.id` الدائم الذي تُبنى عليه مفاتيح ترجمتها.
  select count(*) into v_bad
  from jsonb_array_elements(v_blocks) x
  where nullif(x ->> 'id', '') is null
     or (x ->> 'id') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
  if v_bad > 0 then
    raise exception 'اللقطة فيها % كتلةً بلا معرّف صالح — المطابقة بالمعرّف هي ما يحفظ الترجمات', v_bad
      using hint = 'template-shape';
  end if;

  select string_agg(b, '، ') into v_blocked
  from public.page_publish_blockers(p_page, p_revision) b;
  if v_blocked is not null then
    raise exception 'النشر ممنوع: %', v_blocked using hint = 'publish-blocked';
  end if;

  -- الأعداد تُقاس **قبل** أي كتابة، وإلا صارت تصف ما فعلته لا ما وجدته
  select * into v_d from public.page_revision_diff(p_page, p_revision);

  -- (أ) فكّ الأنساب
  update public.sections set parent_id = null
   where page_id = p_page and parent_id is not null;

  -- (ب) الحذف — ما رُفع من اللقطة
  delete from public.sections s
   where s.page_id = p_page
     and not exists (
       select 1 from jsonb_array_elements(v_blocks) x
       where (x ->> 'id')::uuid = s.id
     );

  -- (ج) التحديث بالمعرّف — 🔴 هذا السطر هو ما يبقي مفاتيح الترجمة حيّة
  update public.sections s
     set type      = e.type,
         content   = e.content,
         sort      = e.sort,
         visible   = e.visible,
         block_key = e.block_key
    from (
      select (x ->> 'id')::uuid                       as id,
             x ->> 'type'                             as type,
             coalesce(x -> 'content', '{}'::jsonb)    as content,
             coalesce((x ->> 'sort')::integer, 0)     as sort,
             coalesce((x ->> 'visible')::boolean, true) as visible,
             nullif(x ->> 'block_key', '')            as block_key
      from jsonb_array_elements(v_blocks) x
    ) e
   where s.id = e.id and s.page_id = p_page;

  -- (د) الإدراج — الجديد وحده
  insert into public.sections (id, page_id, type, content, sort, visible, block_key)
  select (x ->> 'id')::uuid, p_page, x ->> 'type',
         coalesce(x -> 'content', '{}'::jsonb),
         coalesce((x ->> 'sort')::integer, 0),
         coalesce((x ->> 'visible')::boolean, true),
         nullif(x ->> 'block_key', '')
    from jsonb_array_elements(v_blocks) x
   where not exists (select 1 from public.sections s where s.id = (x ->> 'id')::uuid);

  -- (هـ) إعادة الأنساب — كل الآباء جذورٌ الآن، فالترتيب لا يعني شيئاً
  update public.sections s
     set parent_id = e.parent_id
    from (
      select (x ->> 'id')::uuid              as id,
             (x ->> 'parent_id')::uuid       as parent_id
      from jsonb_array_elements(v_blocks) x
      where nullif(x ->> 'parent_id', '') is not null
    ) e
   where s.id = e.id and s.page_id = p_page;

  -- (و) حالة اللقطات: المنشورة السابقة تصير تاريخاً، وهذه تصير المنشورة
  update public.page_revisions set status = 'archived'
   where page_id = p_page and status = 'published';
  update public.page_revisions
     set status = 'published', published_at = now()
   where id = p_revision;

  -- (ز) ختم التعديل — إن تغيّر شيء فعلاً وحده
  if (v_d.updated + v_d.inserted + v_d.deleted) > 0 then
    update public.pages set updated_at = now() where id = p_page;
  end if;

  select coalesce(jsonb_agg(s.id order by s.sort, s.id), '[]'::jsonb) into v_kept
  from public.sections s where s.page_id = p_page;

  return jsonb_build_object(
    'updated',        v_d.updated,
    'inserted',       v_d.inserted,
    'deleted',        v_d.deleted,
    'keptSectionIds', v_kept
  );
end;
$$;

comment on function public.publish_page_revision(uuid, uuid) is
  'يُشغّل لقطة مسودة على `sections` فرقاً بالمعرّف (فتنجو مفاتيح الترجمة)، '
  'ويُصالِح اللقطة قبل ذلك بـ reconcile_revision_items فلا تمحو لقطةٌ قديمة '
  'قائمة عناصر كتبتها هجرة (D-60). ولا يمنع نشراً بسبب المصالحة أبداً.';

-- ----------------------------------------------------------------------------
-- (٣) الفحص الذاتي — نصفٌ يقرأ الكتالوج، ونصفٌ **ينادي**
--
-- 🔴 و«الكاشف الذي يقرأ النصّ يكذب في الاتجاهين» (الذهبية ١٩)، فلا يُكتفى بالنصّ:
--    القسم (٣-ج) يبني فيكسترة ويستدعي الدالة ويقيس الحدّ الفاصل، داخل معاملةٍ
--    فرعية **تُرجَع** — فصفر أثر خاصيةٌ بنيوية لا وعد.
--
-- وشواهد (٣-ب) على **ما كان قائماً** لا على ما أُضيف — وهي القاعدة المشتقة من
-- D-58: انحدار الدفعة ٣ لم يمسكه فحصٌ لأن الفحص بحث عمّا أضافه لا عمّا كسره.
-- ----------------------------------------------------------------------------
do $$
declare
  v_def  text;
  v_mark record;
begin
  -- (٣-أ) الوجود والصلاحيات
  if to_regprocedure('public.reconcile_revision_items(uuid, uuid)') is null then
    raise exception '0092: reconcile_revision_items غير موجودة';
  end if;
  if has_function_privilege('anon', 'public.reconcile_revision_items(uuid, uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.reconcile_revision_items(uuid, uuid)', 'EXECUTE') then
    raise exception '0092: 🔴 المُصالِح ممنوحٌ لدور مستخدم — كاتبٌ للقطات بيد من لا ينشر';
  end if;

  v_def := pg_get_functiondef('public.publish_page_revision(uuid, uuid)'::regprocedure);

  -- (٣-ب) الشواهد: أوّلها على ما أُضيف، وبقيتها على ما كان قائماً فلم يُكسر
  for v_mark in
    select * from (values
      ('reconcile_revision_items',                     'نداء المُصالِح — بلاه لا مصالحة'),
      ('for update',                                   'قفل الصفحة — نشرتان متزامنتان'),
      ('المطابقة بالمعرّف هي ما يحفظ الترجمات',          'فحص شكل المعرّفات (‏0058)'),
      ('where s.id = e.id and s.page_id = p_page',     'التحديث بالمعرّف — خطوة (ج)'),
      ('page_publish_blockers',                        'بوابة النشر'),
      ('page_revision_diff',                           'الفرق يُقاس قبل الكتابة'),
      ('set status = ''archived''',                    'أرشفة المنشورة السابقة'),
      ('keptSectionIds',                               'عقد الإرجاع كما هو')
    ) as t(needle, why)
  loop
    if position(v_mark.needle in v_def) = 0 then
      raise exception '0092: 🔴 جسم الناشر بلا «%» — %', v_mark.needle, v_mark.why;
    end if;
  end loop;

  -- والنداء **قبل** الحاجز والفرق لا بعدهما — والموضع نصف القرار
  if position('reconcile_revision_items' in v_def) > position('page_publish_blockers' in v_def)
     or position('reconcile_revision_items' in v_def) > position('page_revision_diff' in v_def) then
    raise exception '0092: 🔴 المصالحة بعد الحاجز أو بعد الفرق — بوابةٌ تحكم على شكلٍ وتشغيلٌ يكتب آخر';
  end if;

  raise notice '✔ 0092 (٣-أ/ب): المُصالِح موجودٌ غير ممنوح، والناشر ينادي قبل الحاجز، وثمانية شواهد قائمة';
end;
$$;

do $$
declare
  v_page  constant uuid := '00920000-0000-4000-8000-000000000001';
  v_sec   constant uuid := '00920000-0000-4000-8000-000000000002';
  v_rev   constant uuid := '00920000-0000-4000-8000-000000000003';
  v_items constant jsonb :=
    '[{"_k":"g92aa1","q":"س١","a":"ج١"},{"_k":"g92bb2","q":"س٢","a":"ج٢"}]'::jsonb;
  v_n1    integer;
  v_n2    integer;
  v_got1  jsonb;
  v_got2  jsonb;
  v_done  boolean := false;
begin
  begin
    insert into public.pages (id, slug, kind, title, published, sort)
    values (v_page, '0092-reconcile-probe', 'static', 'مسبار 0092', false, 979);

    insert into public.sections (id, page_id, type, content, sort, visible)
    values (v_sec, v_page, 'faq', jsonb_build_object('items', v_items), 0, true);

    -- لقطةٌ «من قبل الهجرة»: نفس الكتلة، **بلا مفتاح `items` إطلاقاً**
    insert into public.page_revisions (id, page_id, status, snapshot)
    values (v_rev, v_page, 'draft', jsonb_build_object('sections', jsonb_build_array(
      jsonb_build_object('id', v_sec::text, 'type', 'faq',
        'content', jsonb_build_object('title', 'شكلٌ قديم'), 'sort', 0, 'visible', true))));

    v_n1 := public.reconcile_revision_items(v_page, v_rev);
    select x -> 'content' -> 'items' into v_got1
    from public.page_revisions r, jsonb_array_elements(r.snapshot -> 'sections') x
    where r.id = v_rev;

    -- و`items: []` — إفراغٌ متعمَّد، والحدّ الفاصل كلّه هنا.
    --
    -- ⚠ ويُعاد استعمال **نفس** اللقطة لا لقطةٌ ثانية: `page_revisions_one_draft_per_page`
    --   تمنع مسودتين لصفحةٍ واحدة، وهو قيدٌ حقيقي في المنتج (تبويبان لا يفتحان
    --   مسودتين) — فالمسبار يمشي على أرضه لا حولها.
    update public.page_revisions
       set snapshot = jsonb_build_object('sections', jsonb_build_array(
             jsonb_build_object('id', v_sec::text, 'type', 'faq',
               'content', jsonb_build_object('items', '[]'::jsonb),
               'sort', 0, 'visible', true)))
     where id = v_rev;

    v_n2 := public.reconcile_revision_items(v_page, v_rev);
    select x -> 'content' -> 'items' into v_got2
    from public.page_revisions r, jsonb_array_elements(r.snapshot -> 'sections') x
    where r.id = v_rev;

    v_done := true;
    raise exception 'ROLLBACK_0092_PROBE';
  exception
    when others then
      if sqlerrm <> 'ROLLBACK_0092_PROBE' then
        raise;
      end if;
  end;

  -- المتغيّرات تنجو من إرجاع المعاملة الفرعية، والصفوف لا — فالحكم بعدها
  if not v_done then
    raise exception '0092: المسبار لم يكتمل — لا حكم على نصف قياس';
  end if;
  if v_n1 <> 1 then
    raise exception '0092: المصالحة لمست % كتلةً لا واحدة', v_n1;
  end if;
  if v_got1 is distinct from v_items then
    raise exception '0092: 🔴 اللقطة الغائبة الحقل لم تكسب القائمة الحيّة — %',
      coalesce(v_got1::text, '∅');
  end if;
  if v_n2 <> 0 then
    raise exception '0092: 🔴 قائمةٌ فارغة صُولحت — إفراغُ المالك المتعمَّد لا ينفُذ أبداً';
  end if;
  if v_got2 is distinct from '[]'::jsonb then
    raise exception '0092: القائمة الفارغة تغيّرت إلى % — الغياب والفراغ اختلطا',
      coalesce(v_got2::text, '∅');
  end if;

  raise notice '✔ 0092 (٣-ج): لقطةٌ لا تعرف `items` تكسب القائمة الحيّة بمفاتيحها، و`items: []` تبقى فارغة — بصفر أثر';
end;
$$;
