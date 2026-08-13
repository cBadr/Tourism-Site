-- ============================================================================
-- i18n_tests.sql — اختبارات قبول للغات والترجمة (المرحلة ٨: هجرة 0018_i18n.sql)
--
-- كيف تشغّله: `pnpm db:test i18n` أو الصق الملف كاملاً في SQL Editor واضغط Run.
-- النجاح = آخر سطر «ALL PASSED». أي فشل يرمي exception برسالة عربية تحدد
-- الاختبار والقيمة المتوقعة والفعلية.
--
-- ومن psql بدور صاحب القاعدة **لا بد** من ON_ERROR_STOP و‑1 معاً:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f supabase/tests/i18n_tests.sql
-- الأول لأن psql بدونه يتابع بعد الكتلة الفاشلة فيطبع «ALL PASSED» رغم الفشل،
-- والثاني لأن الملف يبدّل هوية الدور مؤقتاً في قسم الصلاحيات.
--
-- ── لماذا لا يلمس هذا الملف محتوى الموقع الحقيقي ─────────────────────────────
-- كل ما يُقاس هنا مصنوعٌ هنا: **لغة** اختبار (zz) و**صفحة** اختبار بقسمَين،
-- بمعرّفات ثابتة تبدأ بـ e0/e1/e2. فلو غيّر المالك نصاً في الرئيسية غداً لم
-- يسقط اختبار واحد. والفهرس الحي (translation_corpus) يضم محتوى الموقع كله
-- بطبيعته، لذلك كل عدّ هنا مقصور على لغة الاختبار وحدها — و«الكون» المشترك
-- (إجمالي الفهرس) يُختبر كعلاقة لا كرقم ثابت.
--
-- التنظيف يجري في البداية والنهاية معاً، فحتى انهيار تشغيل سابق يبدأ التالي
-- من أرض نظيفة.
--
-- المرجع: lib/i18n-types.ts (العقد) + supabase/migrations/0018_i18n.sql.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (٠) الشروط المسبقة + تنظيف بقايا
-- ----------------------------------------------------------------------------
do $$
declare
  v_missing text;
begin
  select string_agg(x.rel, '، ')
    into v_missing
  from (values ('public.locales'), ('public.translations'),
               ('public.pages'), ('public.sections'),
               ('public.site_settings'), ('public.vehicle_classes')) as x(rel)
  where to_regclass(x.rel) is null;
  if v_missing is not null then
    raise exception 'شرط مسبق: كائنات مفقودة (نفّذ 0018_i18n.sql أولاً): %', v_missing;
  end if;

  select string_agg(x.sig, '، ')
    into v_missing
  from (values
    ('public.t(text, text, text)'),
    ('public.localized_page(text, text)'),
    ('public.localized_settings(text)'),
    ('public.translation_corpus()'),
    ('public.translation_progress()'),
    ('public.translation_queue(text, text)'),
    ('public.upsert_translations(jsonb)'),
    ('public.review_translation(uuid, text, boolean)'),
    ('public.publish_locale(text)'),
    ('public.i18n_source_hash(text)')
  ) as x(sig)
  where to_regprocedure(x.sig) is null;
  if v_missing is not null then
    raise exception 'شرط مسبق: دوال مفقودة: %', v_missing;
  end if;

  -- ── تنظيف بقايا تشغيل سابق (الترجمات تسقط مع اللغة بـ on delete cascade) ──
  delete from public.translations t where t.locale = 'zz';
  delete from public.locales      l where l.code   = 'zz';
  delete from public.sections     s where s.page_id = 'e0000000-0000-4000-8000-000000000001'::uuid;
  delete from public.pages        p where p.slug   = 'i18n-tests-fixture';

  delete from public.profiles p where p.id = 'e2000000-0000-4000-8000-0000000000ad'::uuid;
  begin
    delete from auth.users u where u.id = 'e2000000-0000-4000-8000-0000000000ad'::uuid;
  exception when others then null;
  end;

  -- بقايا فيكسترة (ك-ن) — تصليب 0025 البند (٢)
  delete from public.sections s
   where s.page_id in ('e5000000-0000-4000-8000-00000000d001'::uuid,
                       'e5000000-0000-4000-8000-00000000d002'::uuid);
  delete from public.pages p where p.slug in ('hardening-tests-draft', 'hardening-tests-live');
  delete from public.vehicle_classes vc where vc.slug = 'hardening-tests-off';
  delete from public.locales l where l.code = 'zy';
  delete from public.profiles p
   where p.id in ('e5000000-0000-4000-8000-0000000000a1'::uuid,
                  'e5000000-0000-4000-8000-0000000000a2'::uuid);
  begin
    delete from auth.users u
     where u.id in ('e5000000-0000-4000-8000-0000000000a1'::uuid,
                    'e5000000-0000-4000-8000-0000000000a2'::uuid);
  exception when others then null;
  end;

  raise notice '✔ (٠) الشروط المسبقة سليمة والأرض نظيفة';
end;
$$;

-- ----------------------------------------------------------------------------
-- (٠-ب) هوية المشرف — تلزم للدوال الإدارية
-- اتصال مالك القاعدة يمرّ من i18n_admin_allowed أصلاً؛ وإن لم يمرّ نصنع مشرفاً
-- مؤقتاً بمطالبة jwt مزوَّرة، ونحذفه في التنظيف.
-- ----------------------------------------------------------------------------
do $$
declare
  v_admin uuid := 'e2000000-0000-4000-8000-0000000000ad'::uuid;
begin
  perform set_config('tours.i18n_admin_fixture', '0', false);

  if public.i18n_admin_allowed() then
    raise notice '✔ (٠-ب) الاتصال الحالي يمرّ من حارس الإدارة';
    return;
  end if;

  begin
    insert into auth.users (id, email) values (v_admin, 'i18n-tests-admin@local.invalid');
    insert into public.profiles (id, role, full_name)
    values (v_admin, 'admin', 'مشرف اختبار الترجمة')
    on conflict (id) do update set role = 'admin';
    perform set_config('request.jwt.claim.sub', v_admin::text, false);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', v_admin)::text, false);
    perform set_config('tours.i18n_admin_fixture', '1', false);
  exception
    when others then
      raise exception 'تعذّر تجهيز هوية مشرف للاختبار (%) — شغّل الملف بدور صاحب القاعدة', sqlerrm;
  end;

  if not public.i18n_admin_allowed() then
    raise exception '(٠-ب) هوية المشرف المؤقتة لم تمرّ من الحارس';
  end if;
  raise notice '✔ (٠-ب) هوية مشرف مؤقتة جاهزة';
end;
$$;

-- ----------------------------------------------------------------------------
-- (أ) الفيكسترة — لغة اختبار + صفحة بقسمَين (نصّي وأسئلة بعناصر items)
-- ----------------------------------------------------------------------------
do $$
declare
  v_page constant uuid := 'e0000000-0000-4000-8000-000000000001';
  v_s1   constant uuid := 'e1000000-0000-4000-8000-000000000001';
  v_s2   constant uuid := 'e1000000-0000-4000-8000-000000000002';
begin
  insert into public.locales (code, name, native_name, dir, is_default, enabled, auto_publish, sort)
  values ('zz', 'لغة اختبار', 'Testish', 'ltr', false, true, false, 99);

  insert into public.pages (id, slug, kind, title, meta, published, sort)
  values (
    v_page, 'i18n-tests-fixture', 'static', 'صفحة اختبار الترجمة',
    '{"title":"عنوان سيو لاختبار الترجمة","description":"وصف سيو لاختبار الترجمة."}'::jsonb,
    true, 999);

  insert into public.sections (id, page_id, type, content, sort, visible)
  values
    (v_s1, v_page, 'rich-text',
     '{"title":"عنوان القسم النصي للاختبار","body":"فقرة عربية أصلية لاختبار الترجمة."}'::jsonb,
     0, true),
    (v_s2, v_page, 'faq',
     '{"title":"أسئلة اختبار الترجمة","items":[{"q":"السؤال الأول للاختبار؟","a":"الجواب الأول للاختبار."},{"q":"السؤال الثاني للاختبار؟","a":"الجواب الثاني للاختبار."}]}'::jsonb,
     1, true);

  raise notice '✔ (أ) الفيكسترة جاهزة: لغة zz وصفحة بقسمَين';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ب) الفهرس الحي يلتقط الفيكسترة بمفاتيحها الصحيحة
--     (هذا ما يعفي TypeScript من المشي على شجرة المحتوى)
-- ----------------------------------------------------------------------------
do $$
declare
  v_page constant uuid := 'e0000000-0000-4000-8000-000000000001';
  v_s1   constant uuid := 'e1000000-0000-4000-8000-000000000001';
  v_s2   constant uuid := 'e1000000-0000-4000-8000-000000000002';
  v_missing text;
  v_src     text;
  v_total   integer;
begin
  select string_agg(x.k, '، ')
    into v_missing
  from (values
    ('page',    v_page::text || '.title'),
    ('page',    v_page::text || '.meta.title'),
    ('page',    v_page::text || '.meta.description'),
    ('section', v_s1::text   || '.title'),
    ('section', v_s1::text   || '.body'),
    ('section', v_s2::text   || '.title'),
    ('section', v_s2::text   || '.items.0.q'),
    ('section', v_s2::text   || '.items.0.a'),
    ('section', v_s2::text   || '.items.1.q'),
    ('section', v_s2::text   || '.items.1.a')
  ) as x(ns, k)
  where not exists (
    select 1 from public.translation_corpus() c
    where c.namespace = x.ns and c.key = x.k
  );
  if v_missing is not null then
    raise exception '(ب-١) مفاتيح غائبة عن الفهرس الحي: %', v_missing;
  end if;

  -- النص المصاحب هو العربي نفسه لا شيئاً آخر
  select c.source_text into v_src
  from public.translation_corpus() c
  where c.namespace = 'section' and c.key = v_s2::text || '.items.1.q';
  if v_src is distinct from 'السؤال الثاني للاختبار؟' then
    raise exception '(ب-٢) نص العنصر الثاني: توقعنا «السؤال الثاني للاختبار؟» وحصلنا «%»',
      coalesce(v_src, 'بلا');
  end if;

  -- الفهرس يغطي كل مساحة **لها مصدر حيّ في القاعدة** (ui وحدها من المستودع).
  -- الشرط مبنيّ على وجود المصدر لا على صفوف بعينها، فلا يسقط على قاعدة عارية.
  if exists (select 1 from public.site_settings ss
              where ss.key = 'brand' and btrim(coalesce(ss.value ->> 'name', '')) <> '')
     and not exists (select 1 from public.translation_corpus() c
                      where c.namespace = 'settings' and c.key = 'brand.name') then
    raise exception '(ب-٣) اسم العلامة موجود في الإعدادات وغائب عن الفهرس';
  end if;

  if exists (select 1 from public.pages p where p.kind = 'service' and p.published)
     and not exists (select 1 from public.translation_corpus() c where c.namespace = 'service') then
    raise exception '(ب-٤) توجد صفحات خدمات منشورة ولا مفتاح خدمة واحد في الفهرس';
  end if;

  if exists (select 1 from public.vehicle_classes vc where vc.active)
     and not exists (select 1 from public.translation_corpus() c where c.namespace = 'vehicle') then
    raise exception '(ب-٥) توجد فئات سيارات نشطة ولا مفتاح فئة واحد في الفهرس';
  end if;

  -- فيكسترة الاختبار وحدها تعطي ٧ مفاتيح قسم (٢ نصّي + ١ عنوان أسئلة + ٤ عناصر)
  select count(*) into v_total from public.translation_corpus() c where c.namespace = 'section';
  if v_total < 7 then
    raise exception '(ب-٦) الفهرس التقط % مفتاح قسم فقط — فيكسترة الاختبار وحدها تعطي ٧', v_total;
  end if;

  -- ولا يسرّب صفحة غير منشورة
  update public.pages set published = false where id = v_page;
  if exists (select 1 from public.translation_corpus() c
             where c.namespace = 'page' and c.key = v_page::text || '.title') then
    update public.pages set published = true where id = v_page;
    raise exception '(ب-٧) الفهرس أدرج صفحة غير منشورة';
  end if;
  update public.pages set published = true where id = v_page;

  raise notice '✔ (ب) الفهرس الحي: مفاتيح الصفحة والأقسام وعناصر items، بلا مسودات';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ج) بلا ترجمة ⇒ عربي في كل حقل — القاعدة الرابعة: لا مفتاح ولا فراغ أبداً
-- ----------------------------------------------------------------------------
do $$
declare
  v_page constant uuid := 'e0000000-0000-4000-8000-000000000001';
  v_s1   constant uuid := 'e1000000-0000-4000-8000-000000000001';
  v_doc  jsonb;
  v_txt  text;
begin
  v_doc := public.localized_page('i18n-tests-fixture', 'zz');
  if v_doc is null then
    raise exception '(ج-١) localized_page لم ترجع الصفحة أصلاً';
  end if;

  if v_doc ->> 'title' is distinct from 'صفحة اختبار الترجمة' then
    raise exception '(ج-١) العنوان بلا ترجمة: توقعنا العربي وحصلنا «%»', v_doc ->> 'title';
  end if;
  if v_doc -> 'meta' ->> 'title' is distinct from 'عنوان سيو لاختبار الترجمة' then
    raise exception '(ج-٢) عنوان السيو بلا ترجمة: حصلنا «%»', v_doc -> 'meta' ->> 'title';
  end if;
  if v_doc -> 'meta' ->> 'description' is distinct from 'وصف سيو لاختبار الترجمة.' then
    raise exception '(ج-٣) وصف السيو بلا ترجمة: حصلنا «%»', v_doc -> 'meta' ->> 'description';
  end if;

  if jsonb_array_length(v_doc -> 'sections') <> 2 then
    raise exception '(ج-٤) عدد الأقسام: توقعنا ٢ وحصلنا %', jsonb_array_length(v_doc -> 'sections');
  end if;

  v_txt := v_doc -> 'sections' -> 0 -> 'content' ->> 'body';
  if v_txt is distinct from 'فقرة عربية أصلية لاختبار الترجمة.' then
    raise exception '(ج-٥) نص القسم بلا ترجمة: حصلنا «%»', coalesce(v_txt, 'بلا');
  end if;

  v_txt := v_doc -> 'sections' -> 1 -> 'content' -> 'items' -> 0 ->> 'q';
  if v_txt is distinct from 'السؤال الأول للاختبار؟' then
    raise exception '(ج-٦) عنصر الأسئلة بلا ترجمة: حصلنا «%»', coalesce(v_txt, 'بلا');
  end if;

  -- ولا مفتاح تسرّب إلى أي حقل (اسم القسم/المعرّف لا يظهر كنصّ)
  if v_doc::text like '%' || v_s1::text || '.body%' then
    raise exception '(ج-٧) تسرّب مفتاح ترجمة إلى مخرجات الصفحة';
  end if;

  if public.t('zz', 'section', v_s1::text || '.body') is not null then
    raise exception '(ج-٨) t() أرجعت قيمة بلا أي صف ترجمة';
  end if;

  -- والإعدادات كذلك: العربية حتى تُنشر ترجمة
  if public.localized_settings('zz') -> 'brand' ->> 'name'
     is distinct from (select ss.value ->> 'name' from public.site_settings ss where ss.key = 'brand') then
    raise exception '(ج-٩) اسم العلامة بلا ترجمة يجب أن يبقى عربياً';
  end if;

  raise notice '✔ (ج) بلا ترجمة: كل حقل عربي، ولا مفتاح ولا فراغ';
end;
$$;

-- ----------------------------------------------------------------------------
-- (د) المسودة والمراجَعة لا تصلان الزائر — والمنشور وحده يصل
--     (القرار ٣ مكتوباً في القاعدة)
-- ----------------------------------------------------------------------------
do $$
declare
  v_page constant uuid := 'e0000000-0000-4000-8000-000000000001';
  v_s1   constant uuid := 'e1000000-0000-4000-8000-000000000001';
  v_res   jsonb;
  v_id    uuid;
  v_st    text;
  v_doc   jsonb;
  v_brand text;
  v_batch jsonb;
begin
  -- دفعة «ترجمة آلية». مفتاح الإعدادات يُضاف فقط إن كان للعلامة اسم في القاعدة،
  -- فلا يسقط الاختبار على قاعدة بلا بذرة إعدادات.
  select ss.value ->> 'name' into v_brand from public.site_settings ss where ss.key = 'brand';

  v_batch := jsonb_build_array(
    jsonb_build_object('locale', 'zz', 'namespace', 'page',
                       'key', v_page::text || '.title',
                       'sourceText', 'صفحة اختبار الترجمة',
                       'value', 'Translation test page', 'provider', 'mymemory'),
    jsonb_build_object('locale', 'zz', 'namespace', 'section',
                       'key', v_s1::text || '.body',
                       'sourceText', 'فقرة عربية أصلية لاختبار الترجمة.',
                       'value', 'Original Arabic paragraph for translation testing.',
                       'provider', 'mymemory'));

  if btrim(coalesce(v_brand, '')) <> '' then
    v_batch := v_batch || jsonb_build_array(
      jsonb_build_object('locale', 'zz', 'namespace', 'settings',
                         'key', 'brand.name', 'sourceText', v_brand,
                         'value', 'Test Brand', 'provider', 'mymemory'));
  end if;

  v_res := public.upsert_translations(v_batch);

  if (v_res ->> 'inserted')::integer <> jsonb_array_length(v_batch) then
    raise exception '(د-١) توقعنا إدراج % صفاً وحصلنا % (%)',
      jsonb_array_length(v_batch), v_res ->> 'inserted', v_res::text;
  end if;

  if exists (select 1 from public.translations t where t.locale = 'zz' and t.status <> 'draft') then
    raise exception '(د-٢) الترجمة الآلية دخلت بحالة غير draft — نشر تلقائي محظور';
  end if;

  -- مسودة ⇒ الزائر يرى العربية
  v_doc := public.localized_page('i18n-tests-fixture', 'zz');
  if v_doc ->> 'title' is distinct from 'صفحة اختبار الترجمة' then
    raise exception '(د-٣) مسودة ظهرت للزائر: «%»', v_doc ->> 'title';
  end if;
  if public.t('zz', 'section', v_s1::text || '.body') is not null then
    raise exception '(د-٤) t() أرجعت مسودة';
  end if;
  if btrim(coalesce(v_brand, '')) <> ''
     and public.localized_settings('zz') -> 'brand' ->> 'name' is distinct from v_brand then
    raise exception '(د-٥) مسودة الإعدادات ظهرت للزائر: «%»',
      public.localized_settings('zz') -> 'brand' ->> 'name';
  end if;

  -- مراجَعة بلا نشر ⇒ الزائر ما زال يرى العربية
  select t.id into v_id from public.translations t
   where t.locale = 'zz' and t.namespace = 'page' and t.key = v_page::text || '.title';
  perform public.review_translation(v_id, 'Translation test page', false);

  select t.status into v_st from public.translations t where t.id = v_id;
  if v_st <> 'reviewed' then
    raise exception '(د-٦) بعد المراجعة بلا نشر: توقعنا reviewed وحصلنا %', v_st;
  end if;

  v_doc := public.localized_page('i18n-tests-fixture', 'zz');
  if v_doc ->> 'title' is distinct from 'صفحة اختبار الترجمة' then
    raise exception '(د-٧) مراجَعة غير منشورة ظهرت للزائر: «%»', v_doc ->> 'title';
  end if;

  -- نشر ⇒ الآن وحده يظهر
  perform public.review_translation(v_id, 'Translation test page', true);
  v_doc := public.localized_page('i18n-tests-fixture', 'zz');
  if v_doc ->> 'title' is distinct from 'Translation test page' then
    raise exception '(د-٨) بعد النشر: توقعنا الإنجليزية وحصلنا «%»', v_doc ->> 'title';
  end if;

  -- الحقول التي لا ترجمة منشورة لها تبقى عربية في نفس الصفحة
  if v_doc -> 'meta' ->> 'title' is distinct from 'عنوان سيو لاختبار الترجمة' then
    raise exception '(د-٩) حقل بلا ترجمة تأثّر بنشر حقل آخر: «%»', v_doc -> 'meta' ->> 'title';
  end if;
  if v_doc -> 'sections' -> 0 -> 'content' ->> 'body'
     is distinct from 'فقرة عربية أصلية لاختبار الترجمة.' then
    raise exception '(د-١٠) مسودة القسم ظهرت بعد نشر عنوان الصفحة';
  end if;

  -- لا يُنشر فراغ أبداً
  begin
    perform public.review_translation(v_id, '   ', true);
    raise exception '(د-١١) قُبلت مراجعة بقيمة فارغة';
  exception
    when others then
      if sqlerrm like '%(د-١١)%' then raise; end if;
  end;

  raise notice '✔ (د) draft/reviewed محجوبان عن الزائر، والمنشور وحده يظهر';
end;
$$;

-- ----------------------------------------------------------------------------
-- (هـ) عناصر items تُستبدل عنصراً عنصراً وحقلاً حقلاً، ويبقى ترتيبها
-- ----------------------------------------------------------------------------
do $$
declare
  v_s2  constant uuid := 'e1000000-0000-4000-8000-000000000002';
  v_id  uuid;
  v_doc jsonb;
  v_it  jsonb;
begin
  perform public.upsert_translations(jsonb_build_array(
    jsonb_build_object('locale', 'zz', 'namespace', 'section',
                       'key', v_s2::text || '.items.0.q',
                       'sourceText', 'السؤال الأول للاختبار؟',
                       'value', 'First test question?', 'provider', 'mymemory')));

  select t.id into v_id from public.translations t
   where t.locale = 'zz' and t.namespace = 'section' and t.key = v_s2::text || '.items.0.q';
  perform public.review_translation(v_id, 'First test question?', true);

  v_doc := public.localized_page('i18n-tests-fixture', 'zz');
  v_it  := v_doc -> 'sections' -> 1 -> 'content' -> 'items';

  if jsonb_array_length(v_it) <> 2 then
    raise exception '(هـ-١) عدد العناصر تغيّر: %', jsonb_array_length(v_it);
  end if;
  if v_it -> 0 ->> 'q' is distinct from 'First test question?' then
    raise exception '(هـ-٢) العنصر الأول لم يُستبدل: «%»', v_it -> 0 ->> 'q';
  end if;
  if v_it -> 0 ->> 'a' is distinct from 'الجواب الأول للاختبار.' then
    raise exception '(هـ-٣) جواب العنصر الأول تأثّر بلا ترجمة: «%»', v_it -> 0 ->> 'a';
  end if;
  if v_it -> 1 ->> 'q' is distinct from 'السؤال الثاني للاختبار؟' then
    raise exception '(هـ-٤) العنصر الثاني تغيّر أو انزاح الترتيب: «%»', v_it -> 1 ->> 'q';
  end if;
  if v_doc -> 'sections' -> 1 -> 'content' ->> 'title' is distinct from 'أسئلة اختبار الترجمة' then
    raise exception '(هـ-٥) عنوان قسم الأسئلة تأثّر بترجمة عنصر';
  end if;

  raise notice '✔ (هـ) استبدال عناصر items: العنصر المطلوب وحده، والترتيب محفوظ';
end;
$$;

-- ----------------------------------------------------------------------------
-- (و) كشف «قديم» — تغيّر الأصل العربي يقلب الوسم، والمنشور يبقى ظاهراً
-- ----------------------------------------------------------------------------
do $$
declare
  v_s1   constant uuid := 'e1000000-0000-4000-8000-000000000001';
  v_key  text := v_s1::text || '.body';
  v_id   uuid;
  v_p    record;
  v_q    record;
  v_doc  jsonb;
begin
  -- ننشر ترجمة القسم النصي أولاً
  select t.id into v_id from public.translations t
   where t.locale = 'zz' and t.namespace = 'section' and t.key = v_key;
  perform public.review_translation(v_id, 'Original Arabic paragraph for translation testing.', true);

  select * into v_p from public.translation_progress() p where p.locale = 'zz';
  if not found then
    raise exception '(و-١) translation_progress لم ترجع صفاً للغة zz';
  end if;
  if v_p.stale <> 0 then
    raise exception '(و-١) قبل تغيير الأصل: توقعنا stale=0 وحصلنا %', v_p.stale;
  end if;
  if v_p.published <> 3 then
    raise exception '(و-٢) توقعنا ٣ صفوف منشورة وحصلنا %', v_p.published;
  end if;
  if v_p.total <= v_p.published then
    raise exception '(و-٣) الإجمالي (%) يجب أن يفوق المنشور (%) — الفهرس يضم الموقع كله',
      v_p.total, v_p.published;
  end if;
  if v_p.missing <> v_p.total - v_p.published - v_p.reviewed - v_p.draft then
    raise exception '(و-٤) الناقص لا يساوي الإجمالي ناقص البقية';
  end if;

  select * into v_q from public.translation_queue('zz', null) q where q.id = v_id;
  if v_q.stale then
    raise exception '(و-٥) الطابور وسم صفاً سليماً بأنه قديم';
  end if;

  -- ── يغيّر المالك الأصل العربي من اللوحة ──
  update public.sections
     set content = jsonb_set(content, '{body}', to_jsonb('فقرة عربية مُعدَّلة بعد الترجمة.'::text))
   where id = v_s1;

  select * into v_p from public.translation_progress() p where p.locale = 'zz';
  if v_p.stale <> 1 then
    raise exception '(و-٦) بعد تغيير الأصل: توقعنا stale=1 وحصلنا %', v_p.stale;
  end if;
  if v_p.published <> 3 then
    raise exception '(و-٧) القديم لا يُنقص عدد المنشور: حصلنا %', v_p.published;
  end if;

  select * into v_q from public.translation_queue('zz', 'stale') q where q.id = v_id;
  if not found then
    raise exception '(و-٨) تصفية الطابور بـ stale لم ترجع الصف القديم';
  end if;
  if not v_q.stale then
    raise exception '(و-٩) وسم القديم لم ينقلب في الطابور';
  end if;
  if v_q.source_text is distinct from 'فقرة عربية مُعدَّلة بعد الترجمة.' then
    raise exception '(و-١٠) الطابور يجب أن يعرض **الأصل الحي**: حصلنا «%»', v_q.source_text;
  end if;
  if v_q.stored_source is distinct from 'فقرة عربية أصلية لاختبار الترجمة.' then
    raise exception '(و-١١) الطابور يجب أن يعرض الأصل المخزَّن أيضاً: حصلنا «%»', v_q.stored_source;
  end if;

  -- والقديم يبقى ظاهراً للزائر: نصّ قديم خير من عودة مفاجئة للعربية
  v_doc := public.localized_page('i18n-tests-fixture', 'zz');
  if v_doc -> 'sections' -> 0 -> 'content' ->> 'body'
     is distinct from 'Original Arabic paragraph for translation testing.' then
    raise exception '(و-١٢) الترجمة القديمة اختفت من الصفحة قبل مراجعتها';
  end if;

  raise notice '✔ (و) كشف القديم ينقلب بتغيّر الأصل، والمنشور يبقى ظاهراً موسوماً';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ز) upsert_translations: لا تدهس عمل الإنسان، وتنعش القديم
-- ----------------------------------------------------------------------------
do $$
declare
  v_page constant uuid := 'e0000000-0000-4000-8000-000000000001';
  v_s1   constant uuid := 'e1000000-0000-4000-8000-000000000001';
  v_res  jsonb;
  v_row  record;
  v_id   uuid;
  v_doc  jsonb;
  v_p    record;
begin
  -- (ز-١) صف منشور وأصله لم يتغيّر ⇒ لا يُمسّ ولو جاءت ترجمة آلية مغايرة
  v_res := public.upsert_translations(jsonb_build_array(
    jsonb_build_object('locale', 'zz', 'namespace', 'page',
                       'key', v_page::text || '.title',
                       'sourceText', 'صفحة اختبار الترجمة',
                       'value', 'MACHINE OVERWRITE', 'provider', 'mymemory')));

  select t.value, t.status into v_row
  from public.translations t
  where t.locale = 'zz' and t.namespace = 'page' and t.key = v_page::text || '.title';

  if v_row.value <> 'Translation test page' or v_row.status <> 'published' then
    raise exception '(ز-١) دُهست قيمة منشورة أصلها لم يتغيّر: «%» (%)', v_row.value, v_row.status;
  end if;
  if (v_res ->> 'preserved')::integer < 1 then
    raise exception '(ز-١) الملخص لم يحسب الصف محفوظاً: %', v_res::text;
  end if;

  -- (ز-٢) صف قديم بلا ترجمة جديدة ⇒ يبقى منشوراً (لا يُطاح به من الموقع)
  v_res := public.upsert_translations(jsonb_build_array(
    jsonb_build_object('locale', 'zz', 'namespace', 'section',
                       'key', v_s1::text || '.body',
                       'sourceText', 'فقرة عربية مُعدَّلة بعد الترجمة.')));

  select t.status, t.source_text into v_row
  from public.translations t
  where t.locale = 'zz' and t.namespace = 'section' and t.key = v_s1::text || '.body';
  if v_row.status <> 'published' then
    raise exception '(ز-٢) تحديث الأصل بلا ترجمة أطاح بالمنشور: %', v_row.status;
  end if;
  if v_row.source_text <> 'فقرة عربية أصلية لاختبار الترجمة.' then
    raise exception '(ز-٢) الأصل المخزَّن تغيّر بلا مراجعة فسقط وسم القديم';
  end if;

  -- (ز-٣) صف قديم مع ترجمة جديدة ⇒ يُنعَش ويعود مسودة (آليٌّ لا يُنشر بلا مراجعة)
  v_res := public.upsert_translations(jsonb_build_array(
    jsonb_build_object('locale', 'zz', 'namespace', 'section',
                       'key', v_s1::text || '.body',
                       'sourceText', 'فقرة عربية مُعدَّلة بعد الترجمة.',
                       'value', 'Arabic paragraph edited after translation.',
                       'provider', 'mymemory')));

  select t.id, t.status, t.value, t.source_text into v_row
  from public.translations t
  where t.locale = 'zz' and t.namespace = 'section' and t.key = v_s1::text || '.body';

  if v_row.status <> 'draft' then
    raise exception '(ز-٣) ترجمة آلية جديدة يجب أن تعود مسودة: %', v_row.status;
  end if;
  if v_row.value <> 'Arabic paragraph edited after translation.' then
    raise exception '(ز-٣) لم تُنعش قيمة الصف القديم: «%»', v_row.value;
  end if;
  if v_row.source_text <> 'فقرة عربية مُعدَّلة بعد الترجمة.' then
    raise exception '(ز-٣) لم يُحدَّث الأصل المخزَّن: «%»', v_row.source_text;
  end if;
  if (v_res ->> 'updated')::integer <> 1 then
    raise exception '(ز-٣) الملخص: توقعنا updated=1 وحصلنا %', v_res::text;
  end if;

  -- ولم يعد قديماً بعد الإنعاش، لكنه مسودة ⇒ الزائر يرى العربية الجديدة
  select * into v_p from public.translation_progress() p where p.locale = 'zz';
  if v_p.stale <> 0 then
    raise exception '(ز-٤) بعد الإنعاش: توقعنا stale=0 وحصلنا %', v_p.stale;
  end if;

  v_doc := public.localized_page('i18n-tests-fixture', 'zz');
  if v_doc -> 'sections' -> 0 -> 'content' ->> 'body'
     is distinct from 'فقرة عربية مُعدَّلة بعد الترجمة.' then
    raise exception '(ز-٥) مسودة منعَشة ظهرت للزائر: «%»',
      v_doc -> 'sections' -> 0 -> 'content' ->> 'body';
  end if;

  -- (ز-٦) صف بمساحة خارج الفهرس (ui من المستودع) يُقبل ولا يُحسب قديماً أبداً
  perform public.upsert_translations(jsonb_build_array(
    jsonb_build_object('locale', 'zz', 'namespace', 'ui',
                       'key', 'nav.book',
                       'sourceText', 'احجز الآن',
                       'value', 'Book now', 'provider', 'mymemory')));
  select t.id into v_id from public.translations t
   where t.locale = 'zz' and t.namespace = 'ui' and t.key = 'nav.book';
  if v_id is null then
    raise exception '(ز-٦) لم يُقبل مفتاح مساحة ui القادم من المستودع';
  end if;
  perform public.review_translation(v_id, 'Book now', true);
  if public.t('zz', 'ui', 'nav.book') is distinct from 'Book now' then
    raise exception '(ز-٧) t() لا ترجع مفتاح ui المنشور';
  end if;
  select * into v_p from public.translation_progress() p where p.locale = 'zz';
  if v_p.stale <> 0 then
    raise exception '(ز-٨) مفتاح خارج الفهرس حُسب قديماً: stale=%', v_p.stale;
  end if;

  -- (ز-٩) لغة غير مسجَّلة أو لغة الأساس تُتخطّى بلا انفجار
  v_res := public.upsert_translations(jsonb_build_array(
    jsonb_build_object('locale', 'ar', 'namespace', 'ui', 'key', 'x.y',
                       'sourceText', 'نص', 'value', 'text'),
    jsonb_build_object('locale', 'qq', 'namespace', 'ui', 'key', 'x.y',
                       'sourceText', 'نص', 'value', 'text'),
    jsonb_build_object('locale', 'zz', 'namespace', 'ui', 'key', '  ',
                       'sourceText', 'نص', 'value', 'text')));
  if (v_res ->> 'skipped')::integer <> 3 or (v_res ->> 'inserted')::integer <> 0 then
    raise exception '(ز-٩) صفوف غير صالحة لم تُتخطَّ: %', v_res::text;
  end if;
  if exists (select 1 from public.translations t where t.locale in ('ar', 'qq')) then
    raise exception '(ز-٩) كُتبت ترجمة للغة الأساس أو للغة غير مسجَّلة';
  end if;

  raise notice '✔ (ز) upsert: يحمي المنشور، وينعش القديم، ويتخطى غير الصالح';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ح) publish_locale ينشر المراجَع وحده — المسودة تبقى مسودة
-- ----------------------------------------------------------------------------
do $$
declare
  v_s1   constant uuid := 'e1000000-0000-4000-8000-000000000001';
  v_s2   constant uuid := 'e1000000-0000-4000-8000-000000000002';
  v_id_r uuid;
  v_id_d uuid;
  v_n    integer;
  v_st   text;
begin
  -- مراجَع ينتظر النشر
  perform public.upsert_translations(jsonb_build_array(
    jsonb_build_object('locale', 'zz', 'namespace', 'section',
                       'key', v_s1::text || '.title',
                       'sourceText', 'عنوان القسم النصي للاختبار',
                       'value', 'Rich text test heading', 'provider', 'mymemory'),
    jsonb_build_object('locale', 'zz', 'namespace', 'section',
                       'key', v_s2::text || '.title',
                       'sourceText', 'أسئلة اختبار الترجمة',
                       'value', 'Translation test FAQ', 'provider', 'mymemory')));

  select t.id into v_id_r from public.translations t
   where t.locale = 'zz' and t.namespace = 'section' and t.key = v_s1::text || '.title';
  select t.id into v_id_d from public.translations t
   where t.locale = 'zz' and t.namespace = 'section' and t.key = v_s2::text || '.title';

  perform public.review_translation(v_id_r, 'Rich text test heading', false);

  -- عدد المراجَع الآن واحد بالضبط (والمسودة القادمة من (ز-٣) ما زالت مسودة)
  select count(*) into v_n from public.translations t
   where t.locale = 'zz' and t.status = 'reviewed';
  if v_n <> 1 then
    raise exception '(ح-١) توقعنا صفاً مراجَعاً واحداً وحصلنا %', v_n;
  end if;

  v_n := public.publish_locale('zz');
  if v_n <> 1 then
    raise exception '(ح-٢) publish_locale: توقعنا نشر صف واحد وحصلنا %', v_n;
  end if;

  select t.status into v_st from public.translations t where t.id = v_id_r;
  if v_st <> 'published' then
    raise exception '(ح-٣) المراجَع لم يُنشر: %', v_st;
  end if;

  select t.status into v_st from public.translations t where t.id = v_id_d;
  if v_st <> 'draft' then
    raise exception '(ح-٤) publish_locale رفعت مسودة إلى %', v_st;
  end if;

  if exists (select 1 from public.translations t
              where t.locale = 'zz' and t.status = 'published'
                and (t.value is null or btrim(t.value) = '')) then
    raise exception '(ح-٥) صف منشور بقيمة فارغة';
  end if;

  -- ولغة غير مسجَّلة تُرفض بوضوح
  begin
    perform public.publish_locale('qq');
    raise exception '(ح-٦) publish_locale قبلت لغة غير مسجَّلة';
  exception
    when others then
      if sqlerrm like '%(ح-٦)%' then raise; end if;
  end;

  raise notice '✔ (ح) النشر الجماعي يرفع المراجَع وحده';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ط) لغة معطَّلة لا تصل الزائر إطلاقاً
-- ----------------------------------------------------------------------------
do $$
declare
  v_doc jsonb;
begin
  update public.locales set enabled = false where code = 'zz';

  v_doc := public.localized_page('i18n-tests-fixture', 'zz');
  if v_doc ->> 'title' is distinct from 'صفحة اختبار الترجمة' then
    raise exception '(ط-١) لغة معطَّلة ما زالت تُترجم: «%»', v_doc ->> 'title';
  end if;
  if public.t('zz', 'ui', 'nav.book') is not null then
    raise exception '(ط-٢) t() ترجع نص لغة معطَّلة';
  end if;
  if exists (select 1 from jsonb_array_elements(public.localized_settings('ar') -> 'locales') e
              where e.value ->> 'code' = 'zz') then
    raise exception '(ط-٣) لغة معطَّلة ظهرت في قائمة المبدّل';
  end if;

  update public.locales set enabled = true where code = 'zz';

  if not exists (select 1 from jsonb_array_elements(public.localized_settings('ar') -> 'locales') e
                  where e.value ->> 'code' = 'zz') then
    raise exception '(ط-٤) لغة مفعّلة غائبة عن قائمة المبدّل';
  end if;

  raise notice '✔ (ط) التفعيل مفتاحٌ فعلي: المعطَّلة محجوبة عن الزائر وعن المبدّل';
exception
  when others then
    update public.locales set enabled = true where code = 'zz';
    raise;
end;
$$;

-- ----------------------------------------------------------------------------
-- (ي) لغة الأساس محميّة بنيوياً
-- ----------------------------------------------------------------------------
do $$
declare
  v_ok boolean;
begin
  v_ok := false;
  begin
    delete from public.locales where code = 'ar';
  exception when others then v_ok := true;
  end;
  if not v_ok then
    raise exception '(ي-١) حُذفت لغة الأساس';
  end if;

  v_ok := false;
  begin
    update public.locales set enabled = false where code = 'ar';
  exception when others then v_ok := true;
  end;
  if not v_ok then
    raise exception '(ي-٢) عُطّلت لغة الأساس';
  end if;

  v_ok := false;
  begin
    update public.locales set is_default = true where code = 'zz';
  exception when others then v_ok := true;
  end;
  if not v_ok then
    raise exception '(ي-٣) صارت هناك لغتا أساس';
  end if;

  raise notice '✔ (ي) لغة الأساس: لا تُحذف ولا تُعطَّل ولا تُزاحَم';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ك) الصلاحيات — الزائر يقرأ عبر الدوال الثلاث وحدها
--
-- فحص كتالوجي يعمل دائماً، ثم فحص حيّ بـ `set local role anon` إن أمكن.
-- ----------------------------------------------------------------------------
do $$
declare
  v_priv text;
  v_pol  integer;
begin
  foreach v_priv in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']
  loop
    if has_table_privilege('anon', 'public.locales', v_priv) then
      raise exception '(ك-١) anon يملك % على locales', v_priv;
    end if;
    if has_table_privilege('anon', 'public.translations', v_priv) then
      raise exception '(ك-٢) anon يملك % على translations', v_priv;
    end if;
    if has_table_privilege('authenticated', 'public.translations', v_priv) then
      raise exception '(ك-٣) authenticated يملك % على translations — الوصول عبر الدوال حصراً', v_priv;
    end if;
  end loop;

  if not has_table_privilege('authenticated', 'public.locales', 'SELECT') then
    raise exception '(ك-٤) المسجَّل لا يقرأ locales — مدير اللغات في اللوحة يحتاجها';
  end if;

  select count(*) into v_pol
  from pg_policies p
  where p.schemaname = 'public'
    and p.tablename in ('locales', 'translations')
    and 'anon' = any (p.roles);
  if v_pol <> 0 then
    raise exception '(ك-٥) % سياسة تستهدف anon على جدولي اللغات', v_pol;
  end if;

  if not has_function_privilege('anon', 'public.t(text, text, text)', 'EXECUTE')
     or not has_function_privilege('anon', 'public.localized_page(text, text)', 'EXECUTE')
     or not has_function_privilege('anon', 'public.localized_settings(text)', 'EXECUTE') then
    raise exception '(ك-٦) الدوال العامة الثلاث ليست كلها متاحة لـ anon';
  end if;

  if has_function_privilege('anon', 'public.upsert_translations(jsonb)', 'EXECUTE')
     or has_function_privilege('anon', 'public.review_translation(uuid, text, boolean)', 'EXECUTE')
     or has_function_privilege('anon', 'public.publish_locale(text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.translation_progress()', 'EXECUTE')
     or has_function_privilege('anon', 'public.translation_queue(text, text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.translation_corpus()', 'EXECUTE')
     or has_function_privilege('anon', 'public.i18n_corpus_rows()', 'EXECUTE') then
    raise exception '(ك-٧) anon يملك تنفيذ دالة إدارية';
  end if;

  raise notice '✔ (ك) الفحص الكتالوجي للصلاحيات سليم';
end;
$$;

do $$
declare
  v_n     integer;
  v_txt   text;
  v_doc   jsonb;
  v_ok    boolean;
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    raise notice '  ↳ (ك-ح) لا دور anon في هذه القاعدة — الفحص الحي متخطّى';
    return;
  end if;

  -- نُفرغ مطالبة الـ jwt أولاً حتى لا يتسلل مشرف الاختبار إلى جلسة الزائر
  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claims', '', false);

  begin
    execute 'set local role anon';

    -- (ك-ح-١) القراءة المباشرة من الجدولين ممنوعة
    v_ok := false;
    begin
      execute 'select count(*) from public.locales' into v_n;
    exception when others then v_ok := true;
    end;
    if not v_ok then
      raise exception '(ك-ح-١) anon قرأ جدول locales مباشرة (% صفاً)', v_n;
    end if;

    v_ok := false;
    begin
      execute 'select count(*) from public.translations' into v_n;
    exception when others then v_ok := true;
    end;
    if not v_ok then
      raise exception '(ك-ح-٢) anon قرأ جدول translations مباشرة (% صفاً)', v_n;
    end if;

    -- (ك-ح-٣) الدوال الإدارية ممنوعة
    v_ok := false;
    begin
      execute 'select count(*) from public.translation_progress()' into v_n;
    exception when others then v_ok := true;
    end;
    if not v_ok then
      raise exception '(ك-ح-٣) anon نفّذ translation_progress';
    end if;

    v_ok := false;
    begin
      execute $q$select public.upsert_translations('[]'::jsonb)$q$;
    exception when others then v_ok := true;
    end;
    if not v_ok then
      raise exception '(ك-ح-٤) anon نفّذ upsert_translations';
    end if;

    v_ok := false;
    begin
      execute 'select public.publish_locale(''zz'')';
    exception when others then v_ok := true;
    end;
    if not v_ok then
      raise exception '(ك-ح-٥) anon نفّذ publish_locale';
    end if;

    v_ok := false;
    begin
      execute 'select count(*) from public.translation_queue(''zz'', null)' into v_n;
    exception when others then v_ok := true;
    end;
    if not v_ok then
      raise exception '(ك-ح-٦) anon نفّذ translation_queue';
    end if;

    -- (ك-ح-٧) لكن الدوال العامة الثلاث تعمل وتعطيه المنشور والعربية
    execute 'select public.t(''zz'', ''ui'', ''nav.book'')' into v_txt;
    if v_txt is distinct from 'Book now' then
      raise exception '(ك-ح-٧) t() للزائر: توقعنا Book now وحصلنا «%»', coalesce(v_txt, 'بلا');
    end if;

    execute 'select public.localized_page(''i18n-tests-fixture'', ''zz'')' into v_doc;
    if v_doc -> 'sections' -> 0 -> 'content' ->> 'body'
       is distinct from 'فقرة عربية مُعدَّلة بعد الترجمة.' then
      raise exception '(ك-ح-٨) الزائر رأى مسودة بدل العربية: «%»',
        v_doc -> 'sections' -> 0 -> 'content' ->> 'body';
    end if;
    -- ما نشرته publish_locale يصل الزائر
    if v_doc -> 'sections' -> 0 -> 'content' ->> 'title' is distinct from 'Rich text test heading' then
      raise exception '(ك-ح-٩) الزائر لم يرَ ما نشرته publish_locale: «%»',
        v_doc -> 'sections' -> 0 -> 'content' ->> 'title';
    end if;
    -- وما بقي مسودة لا يصله (عنوان قسم الأسئلة لم تنشره publish_locale)
    if v_doc -> 'sections' -> 1 -> 'content' ->> 'title' is distinct from 'أسئلة اختبار الترجمة' then
      raise exception '(ك-ح-١٠) مسودة وصلت الزائر: «%»',
        v_doc -> 'sections' -> 1 -> 'content' ->> 'title';
    end if;
    -- والعنصر المنشور داخل items يصله كذلك
    if v_doc -> 'sections' -> 1 -> 'content' -> 'items' -> 0 ->> 'q'
       is distinct from 'First test question?' then
      raise exception '(ك-ح-١١) الزائر لم يرَ العنصر المنشور داخل items: «%»',
        v_doc -> 'sections' -> 1 -> 'content' -> 'items' -> 0 ->> 'q';
    end if;

    execute 'select public.localized_settings(''zz'')' into v_doc;
    if jsonb_array_length(v_doc -> 'locales') < 2 then
      raise exception '(ك-ح-١٢) الزائر لا يحصل على قائمة اللغات للمبدّل';
    end if;

    execute 'reset role';
  exception
    when others then
      execute 'reset role';
      raise;
  end;

  raise notice '✔ (ك-ح) الفحص الحي: anon محجوب عن الجدولين والدوال الإدارية، ويقرأ عبر الثلاث';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ك-م) مسار اللوحة الحقيقي: دور authenticated بمطالبة jwt لمشرف
--
-- الفحص السابق أثبت أن الزائر محجوب؛ وهذا يثبت أن **المشرف يعمل فعلاً** عبر
-- نفس المسار الذي يسلكه PostgREST — وأن مستخدماً مسجَّلاً غير مشرف لا يمر.
-- ملاحظة الفخّ الصامت: كتابة غير المشرف على locales لا ترمي خطأ بل تصيب صفر
-- صفوف، فالفحص على عدد الصفوف لا على وقوع استثناء.
-- ----------------------------------------------------------------------------
do $$
declare
  v_admin constant uuid := 'e2000000-0000-4000-8000-0000000000a1';
  v_user  constant uuid := 'e2000000-0000-4000-8000-0000000000a2';
  v_built boolean := false;
  v_n     integer;
  v_ok    boolean;
begin
  begin
    insert into auth.users (id, email) values
      (v_admin, 'i18n-tests-admin2@local.invalid'),
      (v_user,  'i18n-tests-user@local.invalid');
    insert into public.profiles (id, role, full_name) values
      (v_admin, 'admin',    'مشرف اختبار اللوحة'),
      (v_user,  'customer', 'مستخدم اختبار')
    on conflict (id) do update set role = excluded.role;
    v_built := true;
  exception
    when others then
      -- التخطّي مقصود لقاعدة بلا مخطط auth، لا لفيكسترة معطوبة
      -- (النمط ٩: فحصٌ لا يمكن أن يفشل).
      if to_regclass('auth.users') is not null then
        raise exception '(ك-م) تعذّر بناء الهوية رغم وجود auth.users: % — أصلح الفيكسترة، لا تتخطَّ الفحص', sqlerrm;
      end if;
      raise notice '  ↳ (ك-م) لا مخطط auth — تعذّر بناء هويتَي دخول (%) — الفحص متخطّى', sqlerrm;
  end;

  if not v_built then
    return;
  end if;

  begin
    -- ── مشرف ──
    perform set_config('request.jwt.claim.sub', v_admin::text, false);
    execute 'set local role authenticated';

    select count(*) into v_n from public.translation_progress();
    if v_n < 1 then
      raise exception '(ك-م-١) المشرف لم يحصل على تقدم أي لغة';
    end if;

    select count(*) into v_n from public.locales;
    if v_n < 2 then
      raise exception '(ك-م-٢) المشرف لا يقرأ جدول اللغات (% صفاً)', v_n;
    end if;

    update public.locales set sort = sort where code = 'en';
    get diagnostics v_n = row_count;
    if v_n <> 1 then
      raise exception '(ك-م-٣) المشرف لا يعدّل اللغات (% صفاً)', v_n;
    end if;

    perform public.upsert_translations(jsonb_build_array(
      jsonb_build_object('locale', 'zz', 'namespace', 'ui', 'key', 'probe.admin',
                         'sourceText', 'نص فحص', 'value', 'probe')));
    execute 'reset role';

    if not exists (select 1 from public.translations t
                    where t.locale = 'zz' and t.key = 'probe.admin') then
      raise exception '(ك-م-٤) كتابة المشرف عبر upsert_translations لم تصل الجدول';
    end if;

    -- ── مسجَّل غير مشرف ──
    perform set_config('request.jwt.claim.sub', v_user::text, false);
    execute 'set local role authenticated';

    v_ok := false;
    begin
      select count(*) into v_n from public.translation_progress();
    exception when others then v_ok := true;
    end;
    if not v_ok then
      raise exception '(ك-م-٥) مستخدم غير مشرف قرأ تقدم الترجمة';
    end if;

    v_ok := false;
    begin
      perform public.upsert_translations('[]'::jsonb);
    exception when others then v_ok := true;
    end;
    if not v_ok then
      raise exception '(ك-م-٦) مستخدم غير مشرف نفّذ upsert_translations';
    end if;

    update public.locales set sort = 77 where code = 'en';
    get diagnostics v_n = row_count;
    if v_n <> 0 then
      raise exception '(ك-م-٧) مستخدم غير مشرف عدّل % صفاً من اللغات', v_n;
    end if;

    execute 'reset role';
    perform set_config('request.jwt.claim.sub', '', false);
  exception
    when others then
      execute 'reset role';
      perform set_config('request.jwt.claim.sub', '', false);
      raise;
  end;

  delete from public.translations t where t.locale = 'zz' and t.key = 'probe.admin';
  delete from public.profiles p where p.id in (v_admin, v_user);
  begin
    delete from auth.users u where u.id in (v_admin, v_user);
  exception when others then null;
  end;

  raise notice '✔ (ك-م) المشرف يمرّ عبر دور authenticated، وغير المشرف لا يمرّ ولا يكتب';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ك-ن) 🔒 المسجَّل لم يعد يرى ما يُحجب عن الزائر — تصليب 0025 البند (٢)
--
-- أربع سياسات كانت `using (true)` على دور `authenticated`:
--   pages (0003:74) · sections (0003:124) · vehicle_classes (0005:147)
--   · locales (0018:1087)
-- فكل متعهد في البورتال — وهو مستخدم مسجَّل — يقرأ بها الصفحات غير المنشورة
-- **بميتاداتاها**، والأقسام المخفية، وفئات السيارات المعطَّلة، واللغات التي لم
-- تُفعَّل بعد. أي أن مسودة إطلاق أو صفحة تسعير قيد الإعداد كانت مقروءة لمن
-- يُفترض أنه شريك تنفيذ لا شريك تخطيط.
--
-- الفحص هنا حيٌّ لا كتالوجي: هويتان حقيقيتان و`set local role authenticated`.
-- وكل نفي يسبقه شاهد إيجابي من **نفس الجدول ونفس الدور** — بلا ذلك يمرّ
-- «صفر صف» حتى لو كان سببه فيكسترة لم تُدرج (النمط ٩ في LESSONS).
-- ----------------------------------------------------------------------------
do $$
declare
  v_admin  constant uuid := 'e5000000-0000-4000-8000-0000000000a1';
  v_user   constant uuid := 'e5000000-0000-4000-8000-0000000000a2';
  v_draft  constant uuid := 'e5000000-0000-4000-8000-00000000d001';
  v_live   constant uuid := 'e5000000-0000-4000-8000-00000000d002';
  v_s_hid  constant uuid := 'e5000000-0000-4000-8000-00000000e001';
  v_s_vis  constant uuid := 'e5000000-0000-4000-8000-00000000e002';
  v_s_orph constant uuid := 'e5000000-0000-4000-8000-00000000e003';
  v_class  constant uuid := 'e5000000-0000-4000-8000-00000000c001';
  v_built  boolean := false;
  v_n      integer;
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    raise notice '  ↳ (ك-ن) لا دور authenticated على هذه القاعدة — الفحص متخطّى';
    return;
  end if;

  -- ── الفيكسترة: لكل حالة محجوبة نظيرٌ ظاهر، وإلا لم يثبت الفحص إلا الحجب ──
  delete from public.sections s where s.page_id in (v_draft, v_live);
  delete from public.pages p where p.id in (v_draft, v_live);
  delete from public.vehicle_classes vc where vc.id = v_class;
  delete from public.locales l where l.code = 'zy';

  insert into public.pages (id, slug, kind, title, meta, published, sort) values
    (v_draft, 'hardening-tests-draft', 'static', 'مسودة إطلاق سرّية',
     '{"title":"عنوان سيو لم يُنشر","description":"وصف سيو لمسودة."}'::jsonb, false, 998),
    (v_live,  'hardening-tests-live',  'static', 'صفحة منشورة للاختبار',
     '{"title":"عنوان سيو منشور","description":"وصف سيو منشور."}'::jsonb, true, 997);

  insert into public.sections (id, page_id, type, content, sort, visible) values
    (v_s_vis,  v_live,  'rich-text', '{"title":"قسم ظاهر على صفحة منشورة"}'::jsonb, 0, true),
    (v_s_hid,  v_live,  'rich-text', '{"title":"قسم مخفي على صفحة منشورة"}'::jsonb, 1, false),
    -- الحالة المركّبة: قسم **ظاهر** لكن صفحته الأمّ مسودة — يجب أن يُحجب أيضاً
    (v_s_orph, v_draft, 'rich-text', '{"title":"قسم ظاهر تحت مسودة"}'::jsonb, 0, true);

  insert into public.vehicle_classes (id, slug, title, capacity, active, sort)
  values (v_class, 'hardening-tests-off', 'فئة معطَّلة للاختبار', 4, false, 998);

  insert into public.locales (code, name, native_name, dir, is_default, enabled, auto_publish, sort)
  values ('zy', 'لغة غير مفعّلة', 'Offish', 'ltr', false, false, false, 98);

  -- اللغة zz من القسم (أ) مفعّلة — نتأكد لأنها شاهدنا الإيجابي على locales
  update public.locales set enabled = true where code = 'zz';

  begin
    insert into auth.users (id, email) values
      (v_admin, 'hardening-tests-admin@local.invalid'),
      (v_user,  'hardening-tests-partner@local.invalid');
    insert into public.profiles (id, role, full_name) values
      (v_admin, 'admin',         'مشرف اختبار التصليب'),
      (v_user,  'subcontractor', 'متعهد اختبار التصليب')
    on conflict (id) do update set role = excluded.role;
    v_built := true;
  exception
    when others then
      -- التخطّي مقصود لقاعدة بلا مخطط auth، لا لفيكسترة معطوبة
      -- (النمط ٩: فحصٌ لا يمكن أن يفشل).
      if to_regclass('auth.users') is not null then
        raise exception '(ك-ن) تعذّر بناء الهوية رغم وجود auth.users: % — أصلح الفيكسترة، لا تتخطَّ الفحص', sqlerrm;
      end if;
      raise notice '  ↳ (ك-ن) لا مخطط auth — تعذّر بناء هويتَي دخول (%) — الفحص متخطّى', sqlerrm;
  end;

  if not v_built then
    delete from public.sections s where s.page_id in (v_draft, v_live);
    delete from public.pages p where p.id in (v_draft, v_live);
    delete from public.vehicle_classes vc where vc.id = v_class;
    delete from public.locales l where l.code = 'zy';
    return;
  end if;

  begin
    -- ══ متعهد مسجَّل (غير مشرف) ══
    perform set_config('request.jwt.claim.sub', v_user::text, false);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', v_user)::text, false);
    execute 'set local role authenticated';

    -- (ك-ن-١) شاهد إيجابي: يرى المنشور — فالسياسة لم تُغلق بالكامل
    execute format('select count(*) from public.pages where id = %L', v_live) into v_n;
    if v_n <> 1 then
      raise exception
        '(ك-ن-١) المسجَّل لا يرى الصفحة المنشورة (% صفاً) — السياسة أُغلقت أكثر من اللازم', v_n;
    end if;

    -- (ك-ن-٢) 🔒 ولا يرى المسودة ولا ميتاداتاها
    execute format('select count(*) from public.pages where id = %L', v_draft) into v_n;
    if v_n <> 0 then
      raise exception '(ك-ن-٢) المسجَّل قرأ صفحة غير منشورة بميتاداتاها (% صفاً)', v_n;
    end if;

    -- (ك-ن-٣) شاهد إيجابي: القسم الظاهر تحت صفحة منشورة يصله
    execute format('select count(*) from public.sections where id = %L', v_s_vis) into v_n;
    if v_n <> 1 then
      raise exception '(ك-ن-٣) المسجَّل لا يرى القسم الظاهر على صفحة منشورة (% صفاً)', v_n;
    end if;

    -- (ك-ن-٤) 🔒 ولا القسم المخفي
    execute format('select count(*) from public.sections where id = %L', v_s_hid) into v_n;
    if v_n <> 0 then
      raise exception '(ك-ن-٤) المسجَّل قرأ قسماً مخفياً (% صفاً)', v_n;
    end if;

    -- (ك-ن-٥) 🔒 والشرط مركّب فعلاً: قسم ظاهر تحت **مسودة** محجوب أيضاً.
    --         هذا التأكيد وحده يفشل لو نُسخ شرط الزائر ناقصاً (visible فقط).
    execute format('select count(*) from public.sections where id = %L', v_s_orph) into v_n;
    if v_n <> 0 then
      raise exception
        '(ك-ن-٥) المسجَّل قرأ قسماً ظاهراً تحت صفحة مسودة (% صفاً) — شرط نشر الصفحة الأمّ سقط', v_n;
    end if;

    -- (ك-ن-٦) شاهد إيجابي: الفئات النشطة تصله (البورتال يبني عليها قوائمه)
    execute 'select count(*) from public.vehicle_classes where active' into v_n;
    if v_n < 1 then
      raise exception
        '(ك-ن-٦) المسجَّل لا يرى فئة نشطة واحدة — البورتال (app/portal/_lib/data.ts:32) ينكسر';
    end if;

    -- (ك-ن-٧) 🔒 ولا يرى الفئة المعطَّلة
    execute format('select count(*) from public.vehicle_classes where id = %L', v_class) into v_n;
    if v_n <> 0 then
      raise exception '(ك-ن-٧) المسجَّل قرأ فئة سيارات معطَّلة (% صفاً)', v_n;
    end if;

    -- (ك-ن-٨) شاهد إيجابي: اللغة المفعّلة تصله
    execute 'select count(*) from public.locales where code = ''zz''' into v_n;
    if v_n <> 1 then
      raise exception '(ك-ن-٨) المسجَّل لا يرى اللغة المفعّلة (% صفاً)', v_n;
    end if;

    -- (ك-ن-٩) 🔒 ولا يرى غير المفعّلة
    execute 'select count(*) from public.locales where code = ''zy''' into v_n;
    if v_n <> 0 then
      raise exception '(ك-ن-٩) المسجَّل قرأ لغة غير مفعّلة (% صفاً)', v_n;
    end if;

    execute 'reset role';

    -- ══ المشرف: اللوحة لم تتعطل — وهذا نصف الاختبار لا زينته ══
    perform set_config('request.jwt.claim.sub', v_admin::text, false);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', v_admin)::text, false);
    execute 'set local role authenticated';

    execute format('select count(*) from public.pages where id = %L', v_draft) into v_n;
    if v_n <> 1 then
      raise exception
        '(ك-ن-١٠) المشرف لا يرى المسودة (% صفاً) — شاشة /admin/content فارغة من المسودات', v_n;
    end if;

    execute format('select count(*) from public.sections where id in (%L, %L)', v_s_hid, v_s_orph)
      into v_n;
    if v_n <> 2 then
      raise exception
        '(ك-ن-١١) المشرف يرى % قسماً من ٢ مخفيَّين — محرر الأقسام يفقد ما يحرره', v_n;
    end if;

    execute format('select count(*) from public.vehicle_classes where id = %L', v_class) into v_n;
    if v_n <> 1 then
      raise exception '(ك-ن-١٢) المشرف لا يرى الفئة المعطَّلة — شاشة /admin/fleet تفقدها';
    end if;

    execute 'select count(*) from public.locales where code = ''zy''' into v_n;
    if v_n <> 1 then
      raise exception '(ك-ن-١٣) المشرف لا يرى اللغة غير المفعّلة — شاشة /admin/languages تفقدها';
    end if;

    execute 'reset role';
    perform set_config('request.jwt.claim.sub', '', false);
    perform set_config('request.jwt.claims', '', false);
  exception
    when others then
      execute 'reset role';
      perform set_config('request.jwt.claim.sub', '', false);
      perform set_config('request.jwt.claims', '', false);
      raise;
  end;

  -- ── التنظيف الموضعي ──
  delete from public.sections s where s.page_id in (v_draft, v_live);
  delete from public.pages p where p.id in (v_draft, v_live);
  delete from public.vehicle_classes vc where vc.id = v_class;
  delete from public.locales l where l.code = 'zy';
  delete from public.profiles p where p.id in (v_admin, v_user);
  begin
    delete from auth.users u where u.id in (v_admin, v_user);
  exception when others then null;
  end;

  raise notice '✔ (ك-ن) المسجَّل يرى المنشور والظاهر والنشط والمفعّل وحدها، والمشرف ما زال يرى الكل';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ل) التنظيف — الفيكسترة كلها تزول، وما عداها لم يُمس
-- ----------------------------------------------------------------------------
do $$
declare
  v_admin constant uuid := 'e2000000-0000-4000-8000-0000000000ad';
begin
  delete from public.translations t where t.locale = 'zz';
  delete from public.locales      l where l.code   = 'zz';
  delete from public.sections     s where s.page_id = 'e0000000-0000-4000-8000-000000000001'::uuid;
  delete from public.pages        p where p.slug   = 'i18n-tests-fixture';

  -- فيكسترة (ك-ن) تُمسح في موضعها؛ وهذا احتياط تشغيلٍ انهار في منتصفه
  delete from public.sections s
   where s.page_id in ('e5000000-0000-4000-8000-00000000d001'::uuid,
                       'e5000000-0000-4000-8000-00000000d002'::uuid);
  delete from public.pages p where p.slug in ('hardening-tests-draft', 'hardening-tests-live');
  delete from public.vehicle_classes vc where vc.slug = 'hardening-tests-off';
  delete from public.locales l where l.code = 'zy';
  delete from public.profiles p
   where p.id in ('e5000000-0000-4000-8000-0000000000a1'::uuid,
                  'e5000000-0000-4000-8000-0000000000a2'::uuid);
  begin
    delete from auth.users u
     where u.id in ('e5000000-0000-4000-8000-0000000000a1'::uuid,
                    'e5000000-0000-4000-8000-0000000000a2'::uuid);
  exception when others then null;
  end;

  if current_setting('tours.i18n_admin_fixture', true) = '1' then
    perform set_config('request.jwt.claim.sub', '', false);
    perform set_config('request.jwt.claims', '', false);
    delete from public.profiles p where p.id = v_admin;
    begin
      delete from auth.users u where u.id = v_admin;
    exception when others then null;
    end;
  end if;

  if exists (select 1 from public.translations t where t.locale = 'zz')
     or exists (select 1 from public.pages p where p.slug = 'i18n-tests-fixture') then
    raise exception '(ل) التنظيف لم يكتمل';
  end if;

  raise notice '✔ (ل) التنظيف تام — لا أثر للفيكسترة';
end;
$$;

-- ----------------------------------------------------------------------------
-- الخلاصة
-- ----------------------------------------------------------------------------
do $$
begin
  raise notice 'ALL PASSED — كل اختبارات اللغات والترجمة نجحت';
end;
$$;
