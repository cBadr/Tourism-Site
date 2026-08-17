-- ============================================================================
-- i18n_bulk_tests.sql — «انشر كل المسودات»: ما يعتمده الزرّ وما يرفضه
--                       (هجرة 0100_review_and_publish_drafts.sql)
--
-- كيف تشغّله: `pnpm db:test i18n_bulk` أو الصقه في SQL Editor واضغط Run.
-- النجاح = آخر سطر «ALL PASSED». والفشل exception عربية فيها المتوقع والفعلي.
--
-- ومن psql بدور صاحب القاعدة **لا بد** من ON_ERROR_STOP و‑1 معاً:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f supabase/tests/i18n_bulk_tests.sql
-- الأول لأن psql بدونه يتابع بعد كتلةٍ فاشلة فيطبع «ALL PASSED» رغم الفشل،
-- والثاني لأن الملف يبدّل هوية الدور مؤقتاً في قسم الصلاحيات.
--
-- ══════════════════════════════════════════════════════════════════════════
--  لماذا لا يلمس هذا الملف لغة المالك ولا محتواه
-- ══════════════════════════════════════════════════════════════════════════
--
-- كل ما يُقاس هنا مصنوعٌ هنا: لغة `zb`، وصفحة `i18n-bulk-fixture` بقسمَين،
-- وستّة صفوف ترجمة **بحالاتٍ مختلفة بقصد**. فلا يتغيّر رقمٌ واحد لو حرّر
-- المالك نصاً في الرئيسية غداً، ولا يُنشر حرفٌ في `en`.
--
-- ⚠ **ولا يُقاس هنا عددٌ مطلقٌ من الفهرس الحيّ** — الفهرس يضمّ محتوى الموقع كله،
--   فأي رقمٍ محفور منه يفشل لأن المالك أضاف صفحة. كل عدٍّ مقصورٌ على `zb`.
--
-- ══════════════════════════════════════════════════════════════════════════
--  🔴 وما تحرسه هذه المجموعة تحديداً — درسٌ مدفوع الثمن
-- ══════════════════════════════════════════════════════════════════════════
--
-- مجموعةٌ كاملة في هذا المستودع مرّت خضراء على حارسٍ **مكسور** لأن تأكيداتها
-- كتبت `update` بينما التطبيق يُصدر `insert … on conflict`. فالتأكيدات هنا
-- **بالشكل الذي يستعمله التطبيق فعلاً**: الدوال تُنادى بأسمائها ومعاملاتها كما
-- تناديها `app/admin/languages/[locale]/actions.ts` حرفاً — لا `update` مباشر
-- على `translations` يُثبت شيئاً عن الدالة.
--
-- والتأكيد المركزي (ج-٣) **يفشل على السلوك القديم**: لو نُسخ فرعُ تبنّي الأصل من
-- `review_translation` كما هو لصار الصفّ القديم منشوراً — وهو ما يُثبته هذا
-- الملف بأنه لا يقع.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (٠) الشروط المسبقة + تنظيف بقايا
-- ----------------------------------------------------------------------------
do $$
declare
  v_missing text;
begin
  select string_agg(x.sig, '، ')
    into v_missing
  from (values
    ('public.draft_publish_plan(text)'),
    ('public.draft_publish_preview(text)'),
    ('public.review_and_publish_drafts(text)'),
    ('public.publish_locale(text)'),
    ('public.review_translation(uuid, text, boolean)'),
    ('public.i18n_source_hash(text)'),
    ('public.i18n_corpus_rows()'),
    ('public.enabled_locales()')
  ) as x(sig)
  where to_regprocedure(x.sig) is null;
  if v_missing is not null then
    raise exception 'شرط مسبق: دوال مفقودة (نفّذ 0100 أولاً): %', v_missing;
  end if;

  -- ── تنظيف بقايا تشغيلٍ انهار في منتصفه ──
  delete from public.translations t where t.locale = 'zb';
  delete from public.locales      l where l.code   = 'zb';
  delete from public.sections     s
   where s.page_id = 'eb000000-0000-4000-8000-000000000001'::uuid;
  delete from public.pages        p where p.slug   = 'i18n-bulk-fixture';

  delete from public.profiles p
   where p.id in ('eb200000-0000-4000-8000-0000000000ad'::uuid,
                  'eb200000-0000-4000-8000-0000000000a2'::uuid);
  begin
    delete from auth.users u
     where u.id in ('eb200000-0000-4000-8000-0000000000ad'::uuid,
                    'eb200000-0000-4000-8000-0000000000a2'::uuid);
  exception when others then null;
  end;

  raise notice '✔ (٠) الشروط المسبقة سليمة والأرض نظيفة';
end;
$$;

-- ----------------------------------------------------------------------------
-- (٠-ب) هوية المشرف — الدوال الثلاث كلها محروسة بـ i18n_admin_allowed()
-- ----------------------------------------------------------------------------
do $$
declare
  v_admin uuid := 'eb200000-0000-4000-8000-0000000000ad'::uuid;
begin
  perform set_config('tours.bulk_admin_fixture', '0', false);

  if public.i18n_admin_allowed() then
    raise notice '✔ (٠-ب) الاتصال الحالي يمرّ من حارس الإدارة';
    return;
  end if;

  begin
    insert into auth.users (id, email) values (v_admin, 'i18n-bulk-admin@local.invalid');
    insert into public.profiles (id, role, full_name)
    values (v_admin, 'admin', 'مشرف اختبار النشر الجماعي')
    on conflict (id) do update set role = 'admin';
    perform set_config('request.jwt.claim.sub', v_admin::text, false);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', v_admin)::text, false);
    perform set_config('tours.bulk_admin_fixture', '1', false);
  exception
    when others then
      raise exception 'تعذّر تجهيز هوية مشرف (%) — شغّل الملف بدور صاحب القاعدة', sqlerrm;
  end;

  if not public.i18n_admin_allowed() then
    raise exception '(٠-ب) هوية المشرف المؤقتة لم تمرّ من الحارس';
  end if;
  raise notice '✔ (٠-ب) هوية مشرف مؤقتة جاهزة';
end;
$$;

-- ----------------------------------------------------------------------------
-- (أ) الفيكسترة — لغة + صفحة منشورة بقسمَين، وستّة صفوف ترجمة بحالاتٍ مقصودة
--
-- ⚠ اللغة **مخفية** (`enabled = false`): وهي شرطٌ للتأكيد (هـ) — نشرُ ثمانمئة
--    نصٍّ لا يجوز أن يُظهر لغةً للزوار، والشاهد الإيجابي أن `ar` تبقى وحدها.
-- ----------------------------------------------------------------------------
do $$
declare
  v_page constant uuid := 'eb000000-0000-4000-8000-000000000001';
  v_s1   constant uuid := 'eb100000-0000-4000-8000-000000000001';
  v_s2   constant uuid := 'eb100000-0000-4000-8000-000000000002';
  v_n    integer;
begin
  insert into public.locales (code, name, native_name, dir, is_default, enabled, auto_publish, sort)
  values ('zb', 'لغة اختبار النشر', 'Bulkish', 'ltr', false, false, false, 97);

  insert into public.pages (id, slug, kind, title, meta, published, sort)
  values (v_page, 'i18n-bulk-fixture', 'static', 'صفحة اختبار النشر الجماعي',
          '{"title":"عنوان سيو لاختبار النشر","description":"وصف سيو لاختبار النشر."}'::jsonb,
          true, 996);

  insert into public.sections (id, page_id, type, content, sort, visible)
  values
    (v_s1, v_page, 'rich-text',
     '{"title":"عنوان القسم الأول للنشر الجماعي","body":"فقرة عربية أولى."}'::jsonb, 0, true),
    (v_s2, v_page, 'rich-text',
     '{"title":"عنوان القسم الثاني للنشر الجماعي","body":"فقرة عربية ثانية."}'::jsonb, 1, true);

  /*
   * الصفوف الستّة — واحدٌ لكل حكم، **والأصل يُكتب صحيحاً أو محرَّفاً بقصد**.
   * `source_hash` عمودٌ محسوبٌ من `source_text`، فتحريف الأصل هو **بعينه** ما
   * يجعل الصفّ «قديماً» — لا عمودٌ يُكتب باليد.
   */
  insert into public.translations (locale, namespace, key, source_text, value, status, provider)
  values
    -- (١) مؤهَّل: بشريّ · غير فارغ · أصلُه يطابق الفهرس
    ('zb', 'section', v_s1::text || '.title',
     'عنوان القسم الأول للنشر الجماعي', 'First bulk section title', 'draft', 'human'),
    -- (٢) مؤهَّل ثانٍ (بلا مزوِّد — و`null` بشرٌ كما تكتبه شاشة المراجعة)
    ('zb', 'section', v_s1::text || '.body',
     'فقرة عربية أولى.', 'First Arabic paragraph.', 'draft', null),
    -- (٣) 🔴 **قديم**: الأصل المخزَّن لا يطابق الفهرس ⇒ يجب أن يبقى مسودةً
    ('zb', 'section', v_s2::text || '.title',
     'عنوانٌ عربيٌّ قديمٌ تغيّر بعد الترجمة', 'Stale section title', 'draft', 'human'),
    -- (٤) آليّ: يُستثنى بقرار المالك أياً كانت بقية أحواله
    ('zb', 'section', v_s2::text || '.body',
     'فقرة عربية ثانية.', 'Machine paragraph.', 'draft', 'mymemory'),
    -- (٥) فارغ: `publish_locale` لا تنشره، ونحن لا نعتمده
    ('zb', 'page', v_page::text || '.title',
     'صفحة اختبار النشر الجماعي', '   ', 'draft', 'human'),
    -- (٦) مراجَعٌ سلفاً: ليس من عمل الزرّ، لكن `publish_locale` تنشره معنا
    ('zb', 'page', v_page::text || '.meta.title',
     'عنوان سيو لاختبار النشر', 'Bulk SEO title', 'reviewed', 'human');

  select count(*) into v_n from public.translations t where t.locale = 'zb';
  if v_n <> 6 then
    raise exception '(أ) الفيكسترة كتبت % صفاً من ٦ — أصلح الفيكسترة لا الاختبار', v_n;
  end if;

  raise notice '✔ (أ) الفيكسترة: لغة zb مخفية + ٦ صفوف (مؤهَّل ×٢ · قديم · آليّ · فارغ · مراجَع)';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ب) المصنِّف يحكم على كل صفٍّ حكمه — **والأحكام متنافية فمجموعها العدد**
-- ----------------------------------------------------------------------------
do $$
declare
  v_s1   constant uuid := 'eb100000-0000-4000-8000-000000000001';
  v_s2   constant uuid := 'eb100000-0000-4000-8000-000000000002';
  v_page constant uuid := 'eb000000-0000-4000-8000-000000000001';
  v_got  text;
  v_n    integer;
begin
  for v_got, v_n in
    select x.expect, count(*)::int
    from (values
      (v_s1::text || '.title',      'section', 'approve'),
      (v_s1::text || '.body',       'section', 'approve'),
      (v_s2::text || '.title',      'section', 'stale'),
      (v_s2::text || '.body',       'section', 'machine'),
      (v_page::text || '.title',    'page',    'blank'),
      (v_page::text || '.meta.title','page',   'reviewed')
    ) as x(k, ns, expect)
    join public.translations tr
      on tr.locale = 'zb' and tr.namespace = x.ns and tr.key = x.k
    join public.draft_publish_plan('zb') p on p.id = tr.id
    where p.verdict <> x.expect
    group by x.expect
  loop
    raise exception '(ب-١) حكمٌ خاطئ: % صفاً كان متوقَّعاً «%»', v_n, v_got;
  end loop;

  select count(*) into v_n from public.draft_publish_plan('zb');
  if v_n <> 6 then
    raise exception '(ب-٢) المصنِّف حكم على % صفاً من ٦ — حكمٌ ساقط يعني صفاً بلا قرار', v_n;
  end if;

  raise notice '✔ (ب) المصنِّف: approve×٢ · stale · machine · blank · reviewed — بلا صفٍّ مهمَل';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ج) 🔴 التأكيد المركزي — الأعداد صحيحة، والقديم **لا يُعتمد ولا يُنشر**
-- ----------------------------------------------------------------------------
do $$
declare
  v_s2   constant uuid := 'eb100000-0000-4000-8000-000000000002';
  v_page constant uuid := 'eb000000-0000-4000-8000-000000000001';
  v_prev jsonb;
  v_res  jsonb;
  v_row  public.translations%rowtype;
  v_n    integer;
begin
  -- (ج-١) المعاينة قبل الضغط = ما سيقع بعده. والرقم على الزرّ منها.
  v_prev := public.draft_publish_preview('zb');
  if (v_prev ->> 'eligible')::int <> 2
     or (v_prev ->> 'drafts')::int <> 5
     or (v_prev ->> 'skippedStale')::int <> 1
     or (v_prev ->> 'skippedMachine')::int <> 1
     or (v_prev ->> 'skippedBlank')::int <> 1
     or (v_prev ->> 'alreadyReviewed')::int <> 1 then
    raise exception '(ج-١) معاينةٌ خاطئة: %', v_prev::text;
  end if;
  if (v_prev ->> 'ran')::boolean then
    raise exception '(ج-١ب) المعاينة تدّعي أنها نفّذت — وهي stable لا تكتب';
  end if;

  -- (ج-١ج) والمعاينة **لم تكتب شيئاً فعلاً**: الحالات كما هي بعد استدعائها
  select count(*) into v_n
  from public.translations t where t.locale = 'zb' and t.status = 'published';
  if v_n <> 0 then
    raise exception '(ج-١ج) المعاينة نشرت % صفاً — دالةُ قراءةٍ كتبت', v_n;
  end if;

  -- (ج-٢) التنفيذ — بنفس الشكل الذي تستدعيه به `actions.ts` حرفاً
  v_res := public.review_and_publish_drafts('zb');

  if (v_res ->> 'approved')::int <> 2 then
    raise exception '(ج-٢أ) اعتُمد % صفاً من ٢ مؤهَّلَين', (v_res ->> 'approved')::int;
  end if;
  -- ٢ اعتُمدا + ١ مراجَعٌ سلفاً = ٣. والحساب يجب أن **يقفل**، وإلا فرقمٌ يُخفي صفاً.
  if (v_res ->> 'published')::int <> 3 then
    raise exception
      '(ج-٢ب) نُشر % صفاً والمتوقَّع ٣ (٢ اعتُمدا + ١ مراجَعٌ سلفاً)',
      (v_res ->> 'published')::int;
  end if;
  if not (v_res ->> 'ran')::boolean then
    raise exception '(ج-٢ج) الحصيلة لا تقول إنها نفّذت';
  end if;

  /* ══════════════════════════════════════════════════════════════════════
     (ج-٣) 🔴 **التأكيد الذي يفشل على السلوك القديم**

     `review_translation` تكتب `source_text = coalesce(v_live, tr.source_text)`
     — أي **تتبنّى الأصل الحيّ**، و`source_hash` محسوبٌ منه فيزول وسم القِدَم.
     ولو نُسخ ذلك الفرع إلى الاعتماد الجماعي لصار هذا الصفّ `published`
     وأصلُه المخزَّن مطابقاً — فيقرأ الزائر ترجمةً لنصٍّ لم يعد موجوداً.

     فثلاثة تُؤكَّد معاً: الحالة بقيت `draft`، **والأصل المخزَّن لم يُتبنَّ**،
     والوسم ما زال يقول «قديم» فيظهر في الطابور.
     ══════════════════════════════════════════════════════════════════════ */
  select * into v_row from public.translations t
   where t.locale = 'zb' and t.namespace = 'section' and t.key = v_s2::text || '.title';

  if v_row.status <> 'draft' then
    raise exception
      '(ج-٣أ) الصفّ القديم صار «%» — ترجمةٌ لا تطابق أصلها نُشرت', v_row.status;
  end if;
  if v_row.source_text <> 'عنوانٌ عربيٌّ قديمٌ تغيّر بعد الترجمة' then
    raise exception
      '(ج-٣ب) الأصل المخزَّن تُبنّي (%) — فرعُ review_translation نُسخ إلى الدفعة، ومعه يزول الدليل',
      v_row.source_text;
  end if;
  if v_row.source_hash = public.i18n_source_hash('عنوان القسم الثاني للنشر الجماعي') then
    raise exception '(ج-٣ج) بصمة الصفّ القديم صارت تطابق الأصل الحيّ — زال وسم «الأصل تغيّر»';
  end if;

  -- (ج-٤) الآليّ لم يُمس: لا حالته ولا قيمته
  select * into v_row from public.translations t
   where t.locale = 'zb' and t.namespace = 'section' and t.key = v_s2::text || '.body';
  if v_row.status <> 'draft' or v_row.provider <> 'mymemory'
     or v_row.value <> 'Machine paragraph.' then
    raise exception '(ج-٤) الصفّ الآليّ تغيّر: % / % / %',
      v_row.status, v_row.provider, v_row.value;
  end if;

  -- (ج-٥) الفارغ لم يُعتمد — واعتمادُه كان سينشر فراغاً مكان النص العربي
  select * into v_row from public.translations t
   where t.locale = 'zb' and t.namespace = 'page' and t.key = v_page::text || '.title';
  if v_row.status <> 'draft' then
    raise exception '(ج-٥) الصفّ الفارغ صار «%»', v_row.status;
  end if;

  -- (ج-٦) والمؤهَّلان وحدهما مع المراجَع سلفاً = ٣ منشورة، لا رابع
  select count(*) into v_n
  from public.translations t where t.locale = 'zb' and t.status = 'published';
  if v_n <> 3 then
    raise exception '(ج-٦) المنشور % صفاً من ٣', v_n;
  end if;

  /*
   * (ج-٧) الاعتماد يكتب **الفاعل الحاليّ** في `updated_by` — فيبقى لسؤال «من
   *       اعتمد هذا النص؟» جواب. والتأكيد `is not distinct from` فيصحّ في
   *       الحالتين.
   *
   *  ⚠ **وقوّة هذا التأكيد تتبع الاتصال، فتُعلَن لا تُخفى**: `current_actor()`
   *     = `auth.uid()`، وهي `null` على اتصال صاحب القاعدة (وهو اتصال
   *     `db-test.mjs`). فالتأكيد حينها يثبت «لم يُكتب فاعلٌ خاطئ» لا «كُتب فاعل».
   *     ويصير ذا أسنانٍ كاملة على هوية مشرفٍ مزوَّرة (‏٠-ب) أو من الشاشة نفسها.
   */
  select count(*) into v_n
  from public.translations t
  where t.locale = 'zb' and t.status = 'published'
    and t.updated_by is distinct from public.current_actor();
  if v_n <> 0 then
    raise exception '(ج-٧) % صفاً منشوراً و`updated_by` فيه لا يطابق الفاعل (%)',
      v_n, coalesce(public.current_actor()::text, 'null');
  end if;

  raise notice '✔ (ج) اعتُمد المؤهَّل وحده · القديم بقي مسودةً بأصله ووسمه · الآليّ والفارغ لم يُمسّا (الفاعل: %)',
    coalesce(public.current_actor()::text, 'null — اتصال صاحب القاعدة');
end;
$$;

-- ----------------------------------------------------------------------------
-- (د) تشغيلٌ ثانٍ فور الأول — **لا شيء يبقى ليُعتمد**، ولا خطأ يُرمى
--     (زرٌّ يُضغط مرتين بالخطأ حالةٌ واقعية لا حافّة)
-- ----------------------------------------------------------------------------
do $$
declare
  v_res jsonb;
begin
  v_res := public.review_and_publish_drafts('zb');
  if (v_res ->> 'approved')::int <> 0 or (v_res ->> 'published')::int <> 0 then
    raise exception '(د) تشغيلٌ ثانٍ اعتمد % ونشر % — الزرّ ليس خاملاً عند الفراغ',
      v_res ->> 'approved', v_res ->> 'published';
  end if;
  -- والمستثنَيان الثلاثة ما زالوا مستثنَين، لا صاروا مؤهَّلين
  if (v_res ->> 'eligible')::int <> 0 or (v_res ->> 'skippedStale')::int <> 1
     or (v_res ->> 'skippedMachine')::int <> 1 or (v_res ->> 'skippedBlank')::int <> 1 then
    raise exception '(د-٢) حصيلة التشغيل الثاني: %', v_res::text;
  end if;
  raise notice '✔ (د) التشغيل الثاني خاملٌ تماماً — والمستثنى باقٍ مستثنى';
end;
$$;

-- ----------------------------------------------------------------------------
-- (هـ) 🔴 النشر **لا يُظهر لغةً للزوار** — د-٢٥
--
-- `enabled_locales()` ترشِّح بـ`l.enabled` وحده، و`published_count` عمودٌ مُرجَعٌ
-- لا مُرشِّح. فنشرُ ثلاثة صفوف في `zb` (وهي مخفية) لا يجوز أن يضيفها.
--
-- ⚠ **والتأكيد بالثبات لا بقائمةٍ محفورة**: `enabled_locales()` تُقاس **قبل**
--   العمل و**بعده** ويُقارن الاثنان. وسببه مقيس: كُتب هذا الملف يوم 2026-08-17
--   والقاعدة الحيّة `locales.en.enabled = true` (‏أشعلها فاعلٌ مشرف 15:43Z، لا
--   هذه المجموعة). فتأكيدٌ يقول «`ar` وحدها» كان سيفشل **لسببٍ خارج الدالة
--   المُختبَرة** — وهو أسوأ أنواع الاختبار: أحمرُ لا يدلّ على عيبه.
--   والعقد الحقيقي للدالة أنها **لا تغيّر شيئاً** في `locales`، وهذا ما يُقاس.
-- ----------------------------------------------------------------------------
do $$
declare
  v_before  text;
  v_after   text;
  v_lbefore text;
  v_lafter  text;
  v_res     jsonb;
begin
  select string_agg(e.code, ',' order by e.code) into v_before from public.enabled_locales() e;
  select string_agg(l.code || ':' || l.enabled::text || ':' || l.auto_publish::text, ',' order by l.code)
    into v_lbefore from public.locales l;

  -- شاهدٌ إيجابي: `zb` مخفية أصلاً فليست في القائمة قبل العمل
  if position('zb' in coalesce(v_before, '')) > 0 then
    raise exception '(هـ-٠) zb ظاهرة للزوار قبل النشر — الفيكسترة معطوبة لا الدالة';
  end if;

  -- نصنع مسودةً مؤهَّلة جديدة لتكون هناك دفعةٌ حقيقية تُنشر
  -- الأصل يُقرأ من الإعداد الحيّ (وهو ما يُدخله الفهرس) — و`coalesce` لأن العمود
  -- `not null` بقيدٍ يمنع الفراغ، فلا يجوز أن تنهار الفيكسترة لو غاب الإعداد.
  insert into public.translations (locale, namespace, key, source_text, value, status, provider)
  values ('zb', 'settings', 'brand.name',
          coalesce(
            nullif(btrim((select ss.value ->> 'name' from public.site_settings ss
                           where ss.key = 'brand')), ''),
            'اسم علامةٍ للاختبار'),
          'Bulk Brand', 'draft', 'human')
  on conflict (locale, namespace, key) do update
     set value = 'Bulk Brand', status = 'draft', provider = 'human';

  v_res := public.review_and_publish_drafts('zb');
  if (v_res ->> 'approved')::int < 1 then
    raise exception '(هـ-١) لم يُنشر شيء فالتأكيد لا يثبت شيئاً — الفيكسترة لم تنتج مؤهَّلاً';
  end if;

  select string_agg(e.code, ',' order by e.code) into v_after from public.enabled_locales() e;
  select string_agg(l.code || ':' || l.enabled::text || ':' || l.auto_publish::text, ',' order by l.code)
    into v_lafter from public.locales l;

  if v_after is distinct from v_before then
    raise exception '(هـ-٢) enabled_locales() تغيّرت بالنشر: «%» ⇒ «%» — النشر أظهر لغةً',
      coalesce(v_before, 'بلا'), coalesce(v_after, 'بلا');
  end if;
  if v_lafter is distinct from v_lbefore then
    raise exception '(هـ-٣) جدول locales تغيّر بالنشر: «%» ⇒ «%»',
      coalesce(v_lbefore, 'بلا'), coalesce(v_lafter, 'بلا');
  end if;
  if position('zb' in coalesce(v_after, '')) > 0 then
    raise exception '(هـ-٤) zb صارت ظاهرة للزوار بمجرد نشر نصوصها — د-٢٥ مكسور';
  end if;

  raise notice '✔ (هـ) نشرُ النصوص لم يغيّر locales ولا enabled_locales() — واللغة المخفية بقيت مخفية';
end;
$$;

-- ----------------------------------------------------------------------------
-- (و) اللغة المجهولة ولغة الأساس ترفضان — بنفس تلميح `publish_locale`
-- ----------------------------------------------------------------------------
do $$
declare
  v_hint text;
  v_ok   boolean;
begin
  -- (و-١) لغة غير مسجَّلة
  v_ok := false;
  begin
    perform public.review_and_publish_drafts('zq');
  exception when others then
    v_ok := true;
    get stacked diagnostics v_hint = pg_exception_hint;
    if coalesce(v_hint, '') <> 'not-found' then
      raise exception '(و-١) التلميح «%» لا «not-found» — الواجهة تُترجم التلميح لا النص',
        coalesce(v_hint, 'بلا');
    end if;
  end;
  if not v_ok then
    raise exception '(و-١ب) لغة غير مسجَّلة عبرت بلا خطأ';
  end if;

  -- (و-٢) لغة الأساس: العربية أصلٌ لا صفوف ترجمة لها
  v_ok := false;
  begin
    perform public.review_and_publish_drafts(
      (select l.code from public.locales l where l.is_default limit 1));
  exception when others then
    v_ok := true;
    get stacked diagnostics v_hint = pg_exception_hint;
    if coalesce(v_hint, '') <> 'not-found' then
      raise exception '(و-٢) تلميح لغة الأساس «%» لا «not-found»', coalesce(v_hint, 'بلا');
    end if;
  end;
  if not v_ok then
    raise exception '(و-٢ب) لغة الأساس عبرت بلا خطأ — يمكن «ترجمة» العربية إلى نفسها';
  end if;

  -- (و-٣) والمعاينة ترفض المثلَين كذلك — وإلا انكشف عددٌ لغةٍ لا تخصّنا
  v_ok := false;
  begin
    perform public.draft_publish_preview('zq');
  exception when others then v_ok := true;
  end;
  if not v_ok then
    raise exception '(و-٣) المعاينة قبلت لغة غير مسجَّلة';
  end if;

  raise notice '✔ (و) اللغة المجهولة ولغة الأساس مرفوضتان بتلميح not-found';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ز) 🔴 الصلاحيات — **متعهدٌ مسجَّل الدخول ليس مشرفاً** (د-٢٠)
--
-- كل متعهد في البورتال مستخدم `authenticated`، والدوال الثلاث ممنوحةٌ له
-- بالضبط كما `publish_locale`. **فالحاجز هو الحارس داخلها لا الـgrant.**
-- والفحص حيٌّ: هويةٌ حقيقية دورها `subcontractor` و`set local role authenticated`.
-- ----------------------------------------------------------------------------
do $$
declare
  v_part constant uuid := 'eb200000-0000-4000-8000-0000000000a2';
  v_built boolean := false;
  v_ok    boolean;
  v_hint  text;
  v_n     integer;
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    raise notice '  ↳ (ز) لا دور authenticated على هذه القاعدة — الفحص متخطّى';
    return;
  end if;

  begin
    insert into auth.users (id, email) values (v_part, 'i18n-bulk-partner@local.invalid');
    insert into public.profiles (id, role, full_name)
    values (v_part, 'subcontractor', 'متعهد اختبار النشر الجماعي')
    on conflict (id) do update set role = 'subcontractor';
    v_built := true;
  exception when others then
    if to_regclass('auth.users') is not null then
      raise exception '(ز) تعذّر بناء هوية المتعهد رغم وجود auth.users: % — أصلح الفيكسترة لا تتخطَّ الفحص', sqlerrm;
    end if;
    raise notice '  ↳ (ز) لا مخطط auth — الفحص متخطّى (%)', sqlerrm;
  end;
  if not v_built then return; end if;

  begin
    perform set_config('request.jwt.claim.sub', v_part::text, false);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', v_part)::text, false);
    execute 'set local role authenticated';

    -- (ز-١) شاهد إيجابي: الاستدعاء **يصل** الدالة (الـgrant قائم) — وإلا لأثبت
    --       الفحصُ غيابَ صلاحيةٍ لا عملَ حارس
    v_ok := false;
    begin
      execute 'select public.review_and_publish_drafts(''zb'')';
    exception when others then
      v_ok := true;
      get stacked diagnostics v_hint = pg_exception_hint;
      if coalesce(v_hint, '') <> 'forbidden' then
        raise exception
          '(ز-١) رُفض بتلميح «%» لا «forbidden» — إن كان 42501 فالـgrant ناقص، وحينها الحارس غيرُ مُختبَر',
          coalesce(v_hint, 'بلا');
      end if;
    end;
    if not v_ok then
      raise exception '(ز-١ب) 🔴 متعهدٌ مسجَّل نشر ترجمات — الحارس مفتوح';
    end if;

    -- (ز-٢) والمعاينة كذلك: عددُ مسودات لغةٍ ليست من شأنه
    v_ok := false;
    begin
      execute 'select public.draft_publish_preview(''zb'')';
    exception when others then
      v_ok := true;
      get stacked diagnostics v_hint = pg_exception_hint;
      if coalesce(v_hint, '') <> 'forbidden' then
        raise exception '(ز-٢) رُفضت المعاينة بتلميح «%» لا «forbidden»', coalesce(v_hint, 'بلا');
      end if;
    end;
    if not v_ok then
      raise exception '(ز-٢ب) متعهدٌ مسجَّل قرأ معاينة النشر';
    end if;

    -- (ز-٣) والمصنِّف **غير ممنوح له إطلاقاً** — دفاعٌ في العمق فوق الحارس
    v_ok := false;
    begin
      execute 'select count(*) from public.draft_publish_plan(''zb'')';
    exception when others then v_ok := true;
    end;
    if not v_ok then
      raise exception '(ز-٣) متعهدٌ مسجَّل نفّذ draft_publish_plan — الـgrant أوسع من publish_locale';
    end if;

    execute 'reset role';
    perform set_config('request.jwt.claim.sub', '', false);
    perform set_config('request.jwt.claims', '', false);
  exception when others then
    execute 'reset role';
    perform set_config('request.jwt.claim.sub', '', false);
    perform set_config('request.jwt.claims', '', false);
    raise;
  end;

  -- والرفض لم يترك أثراً: القديم والآليّ والفارغ كما هم
  select count(*) into v_n
  from public.translations t where t.locale = 'zb' and t.status = 'draft';
  if v_n <> 3 then
    raise exception '(ز-٤) بعد المحاولة المرفوضة صار المسودات % لا ٣', v_n;
  end if;

  delete from public.profiles p where p.id = v_part;
  begin
    delete from auth.users u where u.id = v_part;
  exception when others then null;
  end;

  raise notice '✔ (ز) المتعهد المسجَّل مرفوضٌ من الثلاث بتلميح forbidden — والـgrant ليس هو الحاجز';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ح) التنظيف — الفيكسترة كلها تزول، وما عداها لم يُمس
-- ----------------------------------------------------------------------------
do $$
declare
  v_admin constant uuid := 'eb200000-0000-4000-8000-0000000000ad';
begin
  delete from public.translations t where t.locale = 'zb';
  delete from public.locales      l where l.code   = 'zb';
  delete from public.sections     s
   where s.page_id = 'eb000000-0000-4000-8000-000000000001'::uuid;
  delete from public.pages        p where p.slug   = 'i18n-bulk-fixture';
  delete from public.profiles     p
   where p.id = 'eb200000-0000-4000-8000-0000000000a2'::uuid;
  begin
    delete from auth.users u where u.id = 'eb200000-0000-4000-8000-0000000000a2'::uuid;
  exception when others then null;
  end;

  if current_setting('tours.bulk_admin_fixture', true) = '1' then
    perform set_config('request.jwt.claim.sub', '', false);
    perform set_config('request.jwt.claims', '', false);
    delete from public.profiles p where p.id = v_admin;
    begin
      delete from auth.users u where u.id = v_admin;
    exception when others then null;
    end;
  end if;

  if exists (select 1 from public.translations t where t.locale = 'zb')
     or exists (select 1 from public.locales l where l.code = 'zb')
     or exists (select 1 from public.pages p where p.slug = 'i18n-bulk-fixture') then
    raise exception '(ح) التنظيف لم يكتمل';
  end if;

  raise notice '✔ (ح) التنظيف تام — لا أثر للفيكسترة';
end;
$$;

-- ----------------------------------------------------------------------------
-- ⚠ **`raise notice` لا `select`** — و`select 'ALL PASSED'` عيبٌ قِيس هنا حياً:
--    `scripts/db-test.mjs` يطبع أحداث `notice` وحدها ولا يطبع نتائج الاستعلامات
--    (السطر ٤٠: `client.on("notice", …)`). فالنسخة الأولى من هذا الملف انتهت
--    بـ`select` **فمرّت خضراء ولم تطبع السطر إطلاقاً** — أي أن معيار «كل مجموعة
--    تطبع ALL PASSED» كان يسقط عنها صامتاً. وبقية المجموعات كلها تستعمل notice.
-- ----------------------------------------------------------------------------
do $$
begin
  raise notice 'ALL PASSED — «انشر كل المسودات» يعتمد المؤهَّل وحده ويرفض القديم';
end;
$$;
