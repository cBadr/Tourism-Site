-- ============================================================================
-- driver_docs_tests.sql — اختبارات قبول لصورة السائق ورخصته (الهجرة 0120)
--
-- كيف تشغّله: `pnpm db:test driver_docs`  ·  النجاح = آخر سطر «ALL PASSED».
-- والعقد الملزم: `lib/driver-docs-types.ts`.
--
-- ── ما يقيسه هذا الملف، ولماذا كلُّ بندٍ فيه ────────────────────────────────
--
-- **(١) مصفوفة الوصول بالأدوار لا بقراءة السياسات.** `authenticated` هو **كلُّ
-- متعهد** (D-20)، فسياسةٌ تبدو محكمة في نصّها قد تكون مفتوحةً للجميع. ولذلك
-- يُنشئ هذا الملف **شريكَين حقيقيَّين بحسابَيهما** وملفّاً لكلٍّ منهما، ثم يقيس
-- ما يراه كلُّ دورٍ بنداءٍ حيّ داخل معاملةٍ تُرجَع. (القاعدة الذهبية ١٩: الكاشف
-- الذي يقرأ النصّ يكذب في الاتجاهين.)
--
-- **(٢) الكنس يُقاس على `storage.objects` لا على أعمدتنا.** «صفٌّ مُفرَّغ» ليس
-- «ملفٌّ حُذف» — والفرق بينهما هو الفرق بين مهلة حفظٍ حقيقية وادّعاء. فالتأكيد
-- (ط) يقرأ الدلو نفسه ويشترط ألّا يبقى فيه مفتاحٌ مستحقّ.
--
-- **(٣) الحدود الثلاث في القسم (ل)**: لا رخصةَ ولا صورة في حمولة البثّ ولا في
-- حمولة العميل — مقروءةً من الكتالوج الحيّ لا من ملف هجرة (D-58).
--
-- ── ولماذا لا يلمس هذا الملف بياناً حقيقياً ────────────────────────────────
--   • كل الفيكسترة بمعرّفات ثابتة تبدأ بـ`DDOC_TESTS`، وتُمسح بدايةً ونهايةً.
--   • وكلُّ ما يُكتب في `storage.objects` **داخل كتلةٍ راجعةٍ ذاتياً** تنتهي
--     بـ`ROLLBACK_MARKER` — لأن الحذف المباشر من `storage.objects` ممنوع بمُشغّل
--     Supabase‏ `protect_objects_delete`، وتسريبُ عشرة صفوف في كل جولة حتى بلغت
--     ١٨٦٠ صفاً هو بالضبط ما وقع في `booking_tests` قبل أن يُصلَح. ولا نمط ثانٍ.
--   • وحارسُ تسريبٍ بعد الكتلة يقارن العدّ بما كان — فالنمط لا يُقاس بنيّته.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (٠) الشروط المسبقة + تنظيف بقايا تشغيل سابق
-- ----------------------------------------------------------------------------
do $$
declare
  v_missing text;
begin
  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claims', '', false);

  select string_agg(x.f, '، ') into v_missing
  from (values
    ('public.driver_doc_path_ok(text)'),
    ('public.driver_doc_path_owner(text)'),
    ('public.driver_doc_path_driver(text)'),
    ('public.driver_doc_upload_allowed(text)'),
    ('public.admin_verify_driver_license(uuid,boolean)'),
    ('public.driver_documents_due_for_purge(integer)'),
    ('public.mark_driver_documents_purged(text[])')
  ) as x(f)
  where to_regprocedure(x.f) is null;
  if v_missing is not null then
    raise exception 'شرط مسبق: دوال مفقودة (نفّذ 0120_driver_documents.sql): %', v_missing;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'subcontractor_drivers'
      and column_name = 'license_photo_path'
  ) then
    raise exception 'شرط مسبق: عمود license_photo_path مفقود — نفّذ 0120';
  end if;

  delete from public.subcontractor_drivers where name like 'DDOC_TESTS%';
  delete from public.subcontractors      where company_name like 'DDOC_TESTS%';

  raise notice '✔ (٠) الشروط المسبقة سليمة — سبع دوال وعمودان';
end;
$$;

-- ----------------------------------------------------------------------------
-- (أ) شكل المسار — يرفض الخمسة التي قِيست على سابقته (0093) ويقبل الصالح
-- ----------------------------------------------------------------------------
do $$
declare
  v_bad text;
  v_good text := 'aaaaaaaa-0000-4000-8000-00000000000a/cccccccc-0000-4000-8000-00000000000c/license-0123456789abcdef.jpg';
begin
  foreach v_bad in array array[
    'https://evil.com/x.jpg',
    '//cdn.evil.com/x.jpg',
    'data:image/png;base64,AAAA',
    '/../../etc/passwd',
    'receipts/anything/x.jpg',
    'aaaaaaaa-0000-4000-8000-00000000000a/cccccccc-0000-4000-8000-00000000000c/../escape.jpg',
    'aaaaaaaa-0000-4000-8000-00000000000a/cccccccc-0000-4000-8000-00000000000c/license-0123456789abcdef.exe',
    'aaaaaaaa-0000-4000-8000-00000000000a/license-0123456789abcdef.jpg',
    'not-a-uuid/cccccccc-0000-4000-8000-00000000000c/photo-0123456789abcdef.jpg',
    ''
  ] loop
    if public.driver_doc_path_ok(v_bad) then
      raise exception '(أ) شكل المسار قَبِل «%» وكان يجب رفضه', v_bad;
    end if;
  end loop;

  if public.driver_doc_path_ok(null) then
    raise exception '(أ) شكل المسار قَبِل NULL';
  end if;

  -- الشاهد الإيجابي: بدونه يصير ما سبق «فحصاً لا يمكن أن يفشل» (النمط ٩)
  if not public.driver_doc_path_ok(v_good) then
    raise exception '(أ) شكل المسار رفض مساراً سليماً — الفحص كله بلا معنى';
  end if;

  -- والمالك يُشتقّ من المقطع الأول، ويُرجع NULL لكل مخالف
  if public.driver_doc_path_owner(v_good) <> 'aaaaaaaa-0000-4000-8000-00000000000a'::uuid then
    raise exception '(أ) driver_doc_path_owner لا يُرجع المقطع الأول';
  end if;
  if public.driver_doc_path_driver(v_good) <> 'cccccccc-0000-4000-8000-00000000000c'::uuid then
    raise exception '(أ) driver_doc_path_driver لا يُرجع المقطع الثاني';
  end if;
  if public.driver_doc_path_owner('https://evil.com/x.jpg') is not null then
    raise exception '(أ) 🔴 مسارٌ مخالف أعطى مالكاً — والسياسة تقارن به';
  end if;

  raise notice '✔ (أ) الشكل يرفض عشرة أنماط ويقبل الصالح، والمالك NULL لكل مخالف';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ب) و(ج) القيد والمُشغّل على الصف — حزامان لا حزام واحد
-- ----------------------------------------------------------------------------
do $$
declare
  v_sub    uuid;
  v_driver uuid;
  v_ok     boolean;
begin
  select id into v_sub from public.subcontractors order by created_at limit 1;
  if v_sub is null then
    raise notice '  ↳ (ب) لا متعهدين — الفحص متخطّى';
    return;
  end if;

  insert into public.subcontractor_drivers (subcontractor_id, name, phone)
  values (v_sub, 'DDOC_TESTS سائق', '01099887766')
  returning id into v_driver;

  -- (ب-١) القيد يرفض رابطاً خارجياً في عمود المسار
  v_ok := false;
  begin
    update public.subcontractor_drivers set photo_path = 'https://evil.com/x.jpg' where id = v_driver;
  exception when others then v_ok := true;
  end;
  if not v_ok then
    raise exception '(ب-١) 🔴 رابط خارجي مرّ في photo_path — صفر طلبات خارجية مكسورة';
  end if;

  -- (ب-٢) مسارٌ سليم الشكل لكنه يخصّ **متعهداً آخر** يُرفض بالمُشغّل
  v_ok := false;
  begin
    update public.subcontractor_drivers
       set photo_path = 'bbbbbbbb-0000-4000-8000-00000000000b/' || v_driver::text || '/photo-0123456789abcdef.jpg'
     where id = v_driver;
  exception when others then v_ok := true;
  end;
  if not v_ok then
    raise exception '(ب-٢) 🔴 مسارٌ تحت مجلّد متعهد آخر قُبل — الملف لا يُربط بمالكه';
  end if;

  -- (ب-٣) ومسارٌ سليم الشكل يخصّ **سائقاً آخر** يُرفض كذلك
  v_ok := false;
  begin
    update public.subcontractor_drivers
       set photo_path = v_sub::text || '/cccccccc-0000-4000-8000-00000000000c/photo-0123456789abcdef.jpg'
     where id = v_driver;
  exception when others then v_ok := true;
  end;
  if not v_ok then
    raise exception '(ب-٣) 🔴 مسارٌ يخصّ سائقاً آخر قُبل';
  end if;

  -- (ب-٤) الشاهد الإيجابي: المسار الصحيح يمرّ
  update public.subcontractor_drivers
     set photo_path = v_sub::text || '/' || v_driver::text || '/photo-0123456789abcdef.jpg'
   where id = v_driver;

  -- (ج) 🔒 التوثيق يسقط عند أي تعديل على الرخصة
  --
  -- ⚠ والبيانان منفصلان بقصد: المُشغّل يمحو التوثيق في **نفس** البيان الذي يغيّر
  --   الرخصة، فكتابتهما معاً كانت تُنتج «تهيئةً» فارغة ثم تأكيداً لا يمكن أن
  --   يفشل. فالرقم أولاً، ثم التوثيق وحده — كما يقع في الواقع تماماً: الشريك
  --   يكتب الرقم، ثم تشهد اللوحة عليه بعد ذلك.
  update public.subcontractor_drivers set license_no = 'DL-0001' where id = v_driver;
  update public.subcontractor_drivers set license_verified_at = now() where id = v_driver;
  if (select license_verified_at from public.subcontractor_drivers where id = v_driver) is null then
    raise exception '(ج) تعذّر تهيئة التوثيق للقياس';
  end if;

  update public.subcontractor_drivers set license_no = 'DL-0002' where id = v_driver;
  if (select license_verified_at from public.subcontractor_drivers where id = v_driver) is not null then
    raise exception '(ج) 🔴 تغيّر رقم الرخصة والتوثيق باقٍ — الوسم يشهد على ما لم يره أحد';
  end if;

  delete from public.subcontractor_drivers where id = v_driver;

  raise notice '✔ (ب) القيد والمُشغّل يرفضان الرابط والمالك الخطأ والسائق الخطأ · (ج) التوثيق يسقط عند تعديل الرخصة';
end;
$$;

-- ----------------------------------------------------------------------------
-- (د) 🔴 **مصفوفة الوصول، مقيسةً بأربعة أدوار حقيقية**
-- (هـ) وشرط الرفع: شريكٌ لا يكتب في مجلّد شريك
-- (و) والتوثيق للوحة وحدها
-- (ز) و(ح) وساعةُ مدّة الحفظ والمستحقّ للكنس
--
-- كلُّها في كتلةٍ واحدة **راجعةٍ ذاتياً**، لأنها تكتب في `storage.objects`
-- والحذف المباشر منه ممنوع بمُشغّل Supabase.
-- ----------------------------------------------------------------------------
do $$
declare
  v_uid_a   uuid := '11111111-1111-4111-8111-111111111111';
  v_uid_b   uuid := '22222222-2222-4222-8222-222222222222';
  v_uid_adm uuid := '33333333-3333-4333-8333-333333333333';
  v_sub_a   uuid := 'aaaaaaaa-0000-4000-8000-00000000000a';
  v_sub_b   uuid := 'bbbbbbbb-0000-4000-8000-00000000000b';
  v_drv_a   uuid := 'cccccccc-0000-4000-8000-00000000000c';
  v_drv_b   uuid := 'dddddddd-0000-4000-8000-00000000000d';
  v_path_a  text;
  v_path_b  text;
  v_orphan  text;
  v_n       integer;
  v_ok      boolean;
  v_before  bigint;
  v_i       integer;
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated')
     or not exists (select 1 from pg_roles where rolname = 'anon') then
    raise notice '  ↳ (د) لا أدوار المتصفح — الفحص متخطّى';
    return;
  end if;

  v_path_a := v_sub_a || '/' || v_drv_a || '/license-00000000000000a1.jpg';
  v_path_b := v_sub_b || '/' || v_drv_b || '/license-00000000000000b1.jpg';
  v_orphan := v_sub_a || '/' || v_drv_a || '/photo-00000000000000a9.jpg';

  select count(*) into v_before from storage.objects where bucket_id = 'driver-docs';

  -- ── بداية الكتلة الراجعة ذاتياً ──────────────────────────────────────────
  begin

  -- الفيكسترة: ثلاثة حسابات، شريكان، سائقان
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                          created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  values
    (v_uid_a,   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'ddoc-a@tests.invalid',   '', now(), now(), '{}'::jsonb, '{}'::jsonb),
    (v_uid_b,   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'ddoc-b@tests.invalid',   '', now(), now(), '{}'::jsonb, '{}'::jsonb),
    (v_uid_adm, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'ddoc-adm@tests.invalid', '', now(), now(), '{}'::jsonb, '{}'::jsonb);

  insert into public.profiles (id, role) values (v_uid_a, 'subcontractor')
    on conflict (id) do update set role = 'subcontractor';
  insert into public.profiles (id, role) values (v_uid_b, 'subcontractor')
    on conflict (id) do update set role = 'subcontractor';
  insert into public.profiles (id, role) values (v_uid_adm, 'admin')
    on conflict (id) do update set role = 'admin';

  insert into public.subcontractors (id, profile_id, company_name, phone, status)
  values (v_sub_a, v_uid_a, 'DDOC_TESTS شريك أ', '01000000001', 'approved'),
         (v_sub_b, v_uid_b, 'DDOC_TESTS شريك ب', '01000000002', 'approved');

  insert into public.subcontractor_drivers (id, subcontractor_id, name, phone, license_no)
  values (v_drv_a, v_sub_a, 'DDOC_TESTS سائق أ', '01011111111', 'DL-A-1'),
         (v_drv_b, v_sub_b, 'DDOC_TESTS سائق ب', '01022222222', 'DL-B-1');

  update public.subcontractor_drivers set license_photo_path = v_path_a where id = v_drv_a;
  update public.subcontractor_drivers set license_photo_path = v_path_b where id = v_drv_b;

  insert into storage.objects (bucket_id, name) values ('driver-docs', v_path_a);
  insert into storage.objects (bucket_id, name) values ('driver-docs', v_path_b);

  -- ── (د) مصفوفة الوصول ───────────────────────────────────────────────────

  -- (د-١) الشريك أ يرى ملفّه هو
  perform set_config('request.jwt.claim.sub', v_uid_a::text, true);
  set local role authenticated;
  select count(*) into v_n from storage.objects
   where bucket_id = 'driver-docs' and name = v_path_a;
  if v_n <> 1 then
    reset role;
    raise exception '(د-١) الشريك أ لا يرى ملفّه هو (%) — السياسة أضيق مما يجب', v_n;
  end if;

  -- (د-٢) 🔴 ولا يرى ملفّ الشريك ب — وهذا هو الحاجز كلّه (D-19 · D-20)
  select count(*) into v_n from storage.objects
   where bucket_id = 'driver-docs' and name = v_path_b;
  if v_n <> 0 then
    reset role;
    raise exception '(د-٢) 🔴 الشريك أ يرى رخصة سائق الشريك ب — سياسةٌ كُتبت لـauthenticated لا لمالك';
  end if;
  reset role;

  -- (د-٣) والعكس بالعكس
  perform set_config('request.jwt.claim.sub', v_uid_b::text, true);
  set local role authenticated;
  select count(*) into v_n from storage.objects
   where bucket_id = 'driver-docs' and name in (v_path_a, v_path_b);
  if v_n <> 1 then
    reset role;
    raise exception '(د-٣) 🔴 الشريك ب يرى % ملفاً بدل ملفّه وحده', v_n;
  end if;
  reset role;

  -- (د-٤) الزائر المجهول لا يرى شيئاً — ولا سياسة `anon` على هذا الدلو أصلاً
  perform set_config('request.jwt.claim.sub', '', true);
  set local role anon;
  select count(*) into v_n from storage.objects
   where bucket_id = 'driver-docs' and name in (v_path_a, v_path_b);
  if v_n <> 0 then
    reset role;
    raise exception '(د-٤) 🔴 الزائر يرى % من مستندات السائقين', v_n;
  end if;
  reset role;

  -- (د-٥) واللوحة ترى الاثنين
  perform set_config('request.jwt.claim.sub', v_uid_adm::text, true);
  set local role authenticated;
  select count(*) into v_n from storage.objects
   where bucket_id = 'driver-docs' and name in (v_path_a, v_path_b);
  if v_n <> 2 then
    reset role;
    raise exception '(د-٥) اللوحة ترى % بدل ملفَّين — قرار المالك «يراها من في لوحة التحكم»', v_n;
  end if;
  reset role;

  -- ── (هـ) شرط الرفع: شريكٌ لا يكتب في مجلّد شريك ────────────────────────

  perform set_config('request.jwt.claim.sub', v_uid_a::text, true);
  set local role authenticated;

  if not public.driver_doc_upload_allowed(
       v_sub_a || '/' || v_drv_a || '/photo-00000000000000a2.jpg') then
    reset role;
    raise exception '(هـ-١) الشريك أ مُنع من الرفع لسائقه — الفحص التالي بلا معنى';
  end if;

  if public.driver_doc_upload_allowed(
       v_sub_b || '/' || v_drv_b || '/photo-00000000000000b2.jpg') then
    reset role;
    raise exception '(هـ-٢) 🔴 الشريك أ يرفع في مجلّد الشريك ب';
  end if;

  -- ومسارٌ يدّعي مجلّد أ لسائقٍ ليس له
  if public.driver_doc_upload_allowed(
       v_sub_a || '/' || v_drv_b || '/photo-00000000000000b3.jpg') then
    reset role;
    raise exception '(هـ-٣) 🔴 رفعٌ لسائقٍ لا يملكه الرافع';
  end if;
  reset role;

  -- ── (و) التوثيق للوحة وحدها ─────────────────────────────────────────────

  perform set_config('request.jwt.claim.sub', v_uid_a::text, true);
  set local role authenticated;
  v_ok := false;
  begin
    perform public.admin_verify_driver_license(v_drv_a, true);
  exception when others then v_ok := true;
  end;
  reset role;
  if not v_ok then
    raise exception '(و-١) 🔴 متعهدٌ وثّق رخصة سائقه بنفسه';
  end if;

  perform set_config('request.jwt.claim.sub', v_uid_adm::text, true);
  set local role authenticated;
  perform public.admin_verify_driver_license(v_drv_a, true);
  reset role;
  perform set_config('request.jwt.claim.sub', '', true);
  if (select license_verified_at from public.subcontractor_drivers where id = v_drv_a) is null then
    raise exception '(و-٢) اللوحة نادت التوثيق ولم يُكتب';
  end if;

  -- ── (ز) ساعة مدّة الحفظ ─────────────────────────────────────────────────

  if (select relationship_ended_at from public.subcontractors where id = v_sub_a) is not null then
    raise exception '(ز-١) شريكٌ معتمد وساعته تعمل — الحذف يبدأ على علاقةٍ قائمة';
  end if;

  update public.subcontractors set status = 'suspended' where id = v_sub_a;
  if (select relationship_ended_at from public.subcontractors where id = v_sub_a) is null then
    raise exception '(ز-٢) الإيقاف لم يبدأ ساعة مدّة الحفظ — «خمس سنوات» بلا مبدأ';
  end if;

  update public.subcontractors set status = 'approved' where id = v_sub_a;
  if (select relationship_ended_at from public.subcontractors where id = v_sub_a) is not null then
    raise exception '(ز-٣) 🔴 عاد الشريك للعمل وساعته ما زالت تعمل — إيقافٌ مؤقت يُفقده صوره';
  end if;

  -- ── (ح) المستحقّ للكنس — يُقرأ من الدلو لا من أعمدتنا ──────────────────

  -- (ح-١) علاقةٌ قائمة ⇒ لا شيء مستحق
  select count(*) into v_n from public.driver_documents_due_for_purge(500) d
   where d.path in (v_path_a, v_path_b);
  if v_n <> 0 then
    raise exception '(ح-١) 🔴 ملفُّ شريكٍ عامل صار مستحقاً للحذف — المدة تُقاس من الرفع لا من انتهاء العلاقة';
  end if;

  -- (ح-٢) خمس سنواتٍ على انتهاء العلاقة ⇒ ملفُّ أ وحده يُستحق
  update public.subcontractors set status = 'suspended' where id = v_sub_a;
  update public.subcontractors set relationship_ended_at = now() - interval '6 years'
   where id = v_sub_a;

  select count(*) into v_n from public.driver_documents_due_for_purge(500) d
   where d.path = v_path_a;
  if v_n <> 1 then
    raise exception '(ح-٢) 🔴 انقضت ستُّ سنوات ولم يُستحق الملف — الوعد في اتفاقية 0113 بلا تنفيذ';
  end if;

  select count(*) into v_n from public.driver_documents_due_for_purge(500) d
   where d.path = v_path_b;
  if v_n <> 0 then
    raise exception '(ح-٣) 🔴 استُحق ملفُّ شريكٍ علاقتُه قائمة — الكنس يتجاوز صاحبه';
  end if;

  -- (ح-٤) اليتيم الجديد **لا** يُستحق (مهلة اليوم تحمي رفعاً جارياً)
  insert into storage.objects (bucket_id, name) values ('driver-docs', v_orphan);
  select count(*) into v_n from public.driver_documents_due_for_purge(500) d
   where d.path = v_orphan;
  if v_n <> 0 then
    raise exception '(ح-٤) 🔴 ملفٌّ رُفع الآن استُحق للحذف — الكنس يحذف ما يُرفع في اللحظة';
  end if;

  -- (ح-٥) واليتيم القديم يُستحق بسبب `orphan`
  update storage.objects set created_at = now() - interval '3 days'
   where bucket_id = 'driver-docs' and name = v_orphan;
  select count(*) into v_n from public.driver_documents_due_for_purge(500) d
   where d.path = v_orphan and d.reason = 'orphan';
  if v_n <> 1 then
    raise exception '(ح-٥) ملفٌّ يتيمٌ عمره ثلاثة أيام لم يُستحق — الملفات المتروكة تتراكم للأبد';
  end if;

  -- (ح-٦) والتصفير يمحو المسار **ويُبقي النصّ**: الاسم ورقم الرخصة لا يُحذفان
  perform public.mark_driver_documents_purged(array[v_path_a]);
  if (select license_photo_path from public.subcontractor_drivers where id = v_drv_a) is not null then
    raise exception '(ح-٦) المسار لم يُمحَ بعد حذف الملف';
  end if;
  if (select license_no from public.subcontractor_drivers where id = v_drv_a) is distinct from 'DL-A-1' then
    raise exception '(ح-٦) 🔴 الكنس محا رقم الرخصة — والنصّ يبقى بلا أجل كي لا تفقد رحلةٌ قديمة سائقها';
  end if;
  if (select docs_purged_at from public.subcontractor_drivers where id = v_drv_a) is null then
    raise exception '(ح-٦) لم يُسجَّل تاريخ الكنس — فيُقرأ غياب الصورة عطلاً';
  end if;
  -- ولم يمسّ صفَّ الشريك ب
  if (select license_photo_path from public.subcontractor_drivers where id = v_drv_b) is null then
    raise exception '(ح-٦) 🔴 الكنس مسح مسار شريكٍ لم يُطلب';
  end if;

  -- ── (ح-٧) سقفُ ستة ملفات لكل سائق ───────────────────────────────────────
  --
  -- 🔴 **العيب الذي أُصلح هنا (2026-08-18) كان في الشاهد لا في الآلية.**
  --
  -- كان المسار يُبنى بـ`'photo-0000000000000c' || v_i` — أي **خمس عشرة** خانة
  -- hex، و`driver_doc_path_ok` يشترط `[0-9a-f]{16,64}` (مقروءاً من
  -- `pg_get_functiondef` على القاعدة الحيّة لا من ملفّ الهجرة — D-58). فكانت
  -- `driver_doc_upload_allowed` ترجع `false` **لفسادِ المسار**، والتأكيد يخضرّ
  -- وهو يسمّي سبباً آخر. ولو نُزع سقفُ الستة كلُّه لبقي أخضر — وهو النمط ٥ في
  -- `LESSONS.md` حرفياً: اختبارٌ لا يفشل عند العطب.
  --
  -- والسدّ بنيويّ لا بعدّ الأصفار بالعين: `lpad(to_hex(v_i), 16, '0')` يعطي
  -- ستَّ عشرة خانة hex مهما تغيّر الرقم.
  --
  -- وتأكيدان متتابعان لا واحد — كي يستحيل أن يمرّ الثاني مجاناً:
  --   (أ) **بخمسة ملفات: مسموح.** وهذا هو الضابط الموجب: يُثبت أن المسار سليم
  --       والملكية قائمة والدور صحيح، فلا يبقى شيءٌ يقلب الجواب إلى `false`
  --       غير العدّ نفسه. (والدلو يحمل وقتها ملفات السائق «أ» أيضاً، فمروره
  --       يُثبت ضمناً أن العدّ **لكل سائق** لا لكل دلو.)
  --   (ب) **وبستة: ممنوع.** فالسقف مفروض.
  perform set_config('request.jwt.claim.sub', v_uid_b::text, true);

  -- 🔴 والعدُّ يبدأ من الواقع لا من الصفر: مجلّد هذا السائق يحمل سلفاً صورةَ
  --    رخصته (`v_path_b`) من التهيئة. فبذرُ ستةٍ فوقها كان يبلغ **سبعة** —
  --    ويجعل الضابطَ الموجب أدناه يسقط لسببٍ صحيح. نُملأ إلى خمسةٍ بالطرح.
  select count(*) into v_n
    from storage.objects o
   where o.bucket_id = 'driver-docs'
     and split_part(o.name, '/', 1) = v_sub_b::text
     and split_part(o.name, '/', 2) = v_drv_b::text;
  if v_n >= 5 then
    raise exception
      '(ح-٧) التهيئة تركت % ملفاً في مجلّد السائق ب — والسقف ستة، فلا مساحة للضابط الموجب. عدِّل التهيئة لا التأكيد',
      v_n;
  end if;

  for v_i in 1 .. (5 - v_n) loop
    insert into storage.objects (bucket_id, name)
    values ('driver-docs',
            v_sub_b || '/' || v_drv_b || '/photo-' || lpad(to_hex(v_i), 16, '0') || '.jpg');
  end loop;

  set local role authenticated;
  if not public.driver_doc_upload_allowed(
       v_sub_b || '/' || v_drv_b || '/photo-' || lpad(to_hex(6), 16, '0') || '.jpg') then
    reset role;
    raise exception
      '(ح-٧أ) 🔴 الرفع مرفوضٌ وفي المجلّد خمسة ملفات والسقف ستة — أي أن الرفض لسببٍ آخر (مسارٌ لا يطابق النمط، أو ملكية، أو دور)، والتأكيد التالي سيخضرّ مجاناً';
  end if;
  reset role;

  -- والسادس يُدخِل المجلّد إلى السقف بالضبط
  insert into storage.objects (bucket_id, name)
  values ('driver-docs',
          v_sub_b || '/' || v_drv_b || '/photo-' || lpad(to_hex(6), 16, '0') || '.jpg');

  set local role authenticated;
  if public.driver_doc_upload_allowed(
       v_sub_b || '/' || v_drv_b || '/photo-' || lpad(to_hex(7), 16, '0') || '.jpg') then
    reset role;
    raise exception '(ح-٧ب) سقف الملفات لكل سائق غير مفروض — الدلو قابل للإغراق';
  end if;
  reset role;
  perform set_config('request.jwt.claim.sub', '', true);

  raise notice '✔ (د) المصفوفة بأربعة أدوار · (هـ) لا رفع في مجلّد الغير · (و) التوثيق للوحة · (ز) الساعة تبدأ وتُمحى · (ح) الكنس يُقاس من الدلو ويُبقي النصّ';

  raise exception 'ROLLBACK_MARKER';
exception
  when others then
    begin
      execute 'reset role';
    exception when others then null;
    end;
    if sqlerrm <> 'ROLLBACK_MARKER' then raise; end if;
  end;
  -- ── نهاية الكتلة الراجعة ذاتياً ──────────────────────────────────────────

  -- 🔴 حارس التسريب: العدّ عاد إلى ما كان بالضبط. من ينقل الإدراج خارج الكتلة
  --    يُسقط هذا السطر أحمر بدل أن يتراكم الدلو بصمت (سابقة `booking_tests`:
  --    عشرة صفوف في كل جولة حتى بلغت ١٨٦٠).
  select count(*) into v_n from storage.objects where bucket_id = 'driver-docs';
  if v_n <> v_before then
    raise exception
      '(د-ح) 🔴 تسريب في storage.objects: كان % كائناً في driver-docs وصار % — الكتلة الراجعة لم ترجع',
      v_before, v_n;
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- (ط) 🔴 **الثابت على البيانات الحيّة**: لا مفتاحَ مستحقٍّ باقٍ في الدلو
--
-- وهذا هو التأكيد الذي يفرّق «حُذف الصف» عن «حُذف الملف»: مصدره
-- `storage.objects` نفسه. فلو عمل الكنس على دفترنا وحده لَبقيت ملفاتٌ في الدلو
-- ولَظلّ هذا السطر أحمر.
-- ----------------------------------------------------------------------------
do $$
declare
  v_n integer;
  v_first text;
begin
  select count(*), min(d.path) into v_n, v_first
    from public.driver_documents_due_for_purge(1000) d;

  if v_n > 0 then
    raise exception
      '(ط) 🔴 % مفتاحاً مستحقاً للحذف ما زال في الدلو (أولها %) — دورةُ الكنس لا تعمل، ومهلةُ الحفظ في اتفاقية 0113 وعدٌ لا ينفّذه شيء',
      v_n, v_first;
  end if;

  select count(*) into v_n from storage.objects where bucket_id = 'driver-docs';
  raise notice '✔ (ط) صفر مفتاحٍ مستحق في الدلو — و% كائناً فيه الآن', v_n;
end;
$$;

-- ----------------------------------------------------------------------------
-- (ي) البنية: الدلو خاصّ · أربع سياسات · ولا `anon` · والدوال محجوبة
-- ----------------------------------------------------------------------------
do $$
declare
  v_n      integer;
  v_public boolean;
begin
  select b.public into v_public from storage.buckets b where b.id = 'driver-docs';
  if v_public is null then
    raise exception '(ي-١) دلو driver-docs غير موجود — نفّذ 0120';
  end if;
  if v_public then
    raise exception '(ي-١) 🔴 دلو driver-docs عامّ — أي أحد يقرأ الرخصة بالمسار';
  end if;

  select count(*) into v_n from pg_policies p
   where p.schemaname = 'storage' and p.tablename = 'objects'
     and p.policyname like 'driver_docs%';
  if v_n <> 4 then
    raise exception '(ي-٢) سياسات الدلو % لا أربع', v_n;
  end if;

  select count(*) into v_n from pg_policies p
   where p.schemaname = 'storage' and p.tablename = 'objects'
     and p.policyname like 'driver_docs%' and 'anon' = any (p.roles);
  if v_n > 0 then
    raise exception '(ي-٣) 🔴 % سياسة تشمل anon على دلو المستندات', v_n;
  end if;

  -- وكلُّ سياسة تذكر المالك أو is_admin — سياسةٌ بلا قيدٍ تعني «كل شريك يرى الكل»
  select count(*) into v_n from pg_policies p
   where p.schemaname = 'storage' and p.tablename = 'objects'
     and p.policyname like 'driver_docs%'
     and coalesce(p.qual, '') || coalesce(p.with_check, '')
         not like '%driver_doc_%';
  if v_n > 0 then
    raise exception '(ي-٤) 🔴 % سياسة بلا قيدِ ملكية — authenticated هو كلُّ متعهد (D-20)', v_n;
  end if;

  -- دوالُّ الكنس ليست لأي دور متصفح
  if has_function_privilege('anon', 'public.driver_documents_due_for_purge(integer)', 'execute')
     or has_function_privilege('authenticated', 'public.driver_documents_due_for_purge(integer)', 'execute')
     or has_function_privilege('anon', 'public.mark_driver_documents_purged(text[])', 'execute')
     or has_function_privilege('authenticated', 'public.mark_driver_documents_purged(text[])', 'execute') then
    raise exception '(ي-٥) 🔴 دالةُ كنسٍ ممنوحةٌ لدور متصفح — الحذف الجماعي بيد المتصفح';
  end if;

  raise notice '✔ (ي) الدلو خاصّ · أربع سياسات مقيَّدة بالمالك · صفر anon · دوال الكنس محجوبة';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ك) 🔒 الحدود الثلاث: لا رخصةَ في حمولة البثّ ولا في حمولة العميل
--     مقروءةً من الكتالوج الحيّ لا من ملف هجرة (D-58)
-- ----------------------------------------------------------------------------
do $$
declare
  v_def text;
begin
  v_def := pg_get_functiondef('public.dispatch_trip_payload(uuid,boolean)'::regprocedure);
  if v_def ~* '(license|photo_path|driver_doc|subcontractor_drivers)' then
    raise exception '(ك-١) 🔴 حمولة البثّ صارت تمسّ مستندات السائق — النصف العام يبقى نظيفاً (D-56)';
  end if;

  v_def := pg_get_function_result('public.get_booking_by_token(text)'::regprocedure);
  if v_def ~* '(license|photo)' then
    raise exception '(ك-٢) 🔴 نوع إرجاع get_booking_by_token صار يحمل رخصةً أو صورة — العميل لا يعرفهما';
  end if;

  -- وحمولةُ `crew` التي تصل العميل: ستةُ مفاتيح، وليس فيها رخصةٌ ولا مسار
  v_def := pg_get_functiondef('public.get_booking_by_token(text)'::regprocedure);
  if v_def ~* '(dr\.license|dr\.photo_path|license_photo_path)' then
    raise exception '(ك-٣) 🔴 جسم get_booking_by_token يقرأ رخصة السائق أو صورته';
  end if;

  raise notice '✔ (ك) حمولة البثّ وحمولة العميل نظيفتان من الرخصة والصورة';
end;
$$;

-- ----------------------------------------------------------------------------
-- (م) 🔴 **المسار الذي تسلكه اللوحة فعلاً** — صفٌّ مقروء ومفتاحٌ قابلٌ للتوقيع
--
-- ── لماذا لم تكفِ (د)، وقد قاست الأدوار الأربعة ──────────────────────────
--
-- (د) تقيس `storage.objects` وحده. واللوحة تقرأ **شيئين بهويةٍ واحدة**:
--   ١) صفَّ السائق من `public.subcontractor_drivers` ← ومنه المسار،
--   ٢) ثم تطلب توقيع ذلك المسار — وهو `select` على `storage.objects`.
--
-- فالعطل الذي أبلغ عنه المالك في 2026-08-18 («لا أرى الصور») شكلُه بالضبط:
-- **المسار يُقرأ والمفتاح لا يُرى**. وحينها لا يخفق شيء ولا يُرمى استثناء —
-- تعود خريطةٌ ناقصة، ويُرسم مربّعٌ فارغ. فالتأكيد هنا يقيس **الفارق بين
-- العددين** لا كلَّ عددٍ وحده، لأن الفارق هو العطل.
--
-- ── وفيكسترتُه فيكسترتُه هو ────────────────────────────────────────────────
-- لا يُقرأ هنا صفُّ مالكٍ ولا رقمُه: شريكان وسائقان ومفتاحان يبنيهم هذا القسم
-- داخل كتلةٍ راجعةٍ ذاتياً، فلا يسقط التأكيد يوم يحذف شريكٌ صورة.
--
-- ── وطفرتان، لأن تأكيداً لا يحمرّ عند العطب زينة (النمط ٩) ───────────────
--   (م-٥) تُسحب صفةُ الإدارة من مشرف الفيكسترة  ⇒ يجب أن يهبط الشاهد إلى صفر.
--   (م-٦) يُوجَّه مسارُ السائق إلى مفتاحٍ لا كائنَ له ⇒ يجب أن يظهر الفارق.
-- وكلتاهما تُقاسان بأنفسهما: إن **لم** يتغيّر الشاهد بعد الكسر، يُرفع استثناء
-- يقول إن الشاهد لا يشهد.
-- ----------------------------------------------------------------------------
do $$
declare
  v_uid_m1  uuid := '44444444-4444-4444-8444-444444444444';
  v_uid_m2  uuid := '55555555-5555-4555-8555-555555555555';
  v_uid_mad uuid := '66666666-6666-4666-8666-666666666666';
  v_sub_1   uuid := 'eeeeeeee-0000-4000-8000-00000000000e';
  v_sub_2   uuid := 'ffffffff-0000-4000-8000-00000000000f';
  v_drv_1   uuid := '99999999-0000-4000-8000-000000000009';
  v_photo   text;
  v_lic     text;
  v_dangling text;
  v_paths   integer;   -- كم مساراً غير فارغ يقرؤه هذا القارئ من صفوف السائقين
  v_signable integer;  -- وكم منها يستطيع أن يوقّعه فعلاً (أي يراه في الدلو)
  v_before  bigint;
  v_n       integer;
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated')
     or not exists (select 1 from pg_roles where rolname = 'anon') then
    raise notice '  ↳ (م) لا أدوار المتصفح — الفحص متخطّى';
    return;
  end if;

  -- ⚠ ستَّ عشرة خانة hex — النمط يفرضها، وحرفٌ خارج `[0-9a-f]` يُسقط الإدراج
  v_photo    := v_sub_1 || '/' || v_drv_1 || '/photo-00000000000000e1.jpg';
  v_lic      := v_sub_1 || '/' || v_drv_1 || '/license-00000000000000e2.jpg';
  v_dangling := v_sub_1 || '/' || v_drv_1 || '/photo-00000000000000ed.jpg';

  select count(*) into v_before from storage.objects where bucket_id = 'driver-docs';

  -- ── بداية الكتلة الراجعة ذاتياً ──────────────────────────────────────────
  begin

  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                          created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  values
    (v_uid_m1,  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'ddoc-m1@tests.invalid',  '', now(), now(), '{}'::jsonb, '{}'::jsonb),
    (v_uid_m2,  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'ddoc-m2@tests.invalid',  '', now(), now(), '{}'::jsonb, '{}'::jsonb),
    (v_uid_mad, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'ddoc-mad@tests.invalid', '', now(), now(), '{}'::jsonb, '{}'::jsonb);

  insert into public.profiles (id, role) values (v_uid_m1, 'subcontractor')
    on conflict (id) do update set role = 'subcontractor';
  insert into public.profiles (id, role) values (v_uid_m2, 'subcontractor')
    on conflict (id) do update set role = 'subcontractor';
  insert into public.profiles (id, role) values (v_uid_mad, 'admin')
    on conflict (id) do update set role = 'admin';

  insert into public.subcontractors (id, profile_id, company_name, phone, status)
  values (v_sub_1, v_uid_m1, 'DDOC_TESTS مسار اللوحة ١', '01000000011', 'approved'),
         (v_sub_2, v_uid_m2, 'DDOC_TESTS مسار اللوحة ٢', '01000000012', 'approved');

  insert into public.subcontractor_drivers (id, subcontractor_id, name, phone, license_no)
  values (v_drv_1, v_sub_1, 'DDOC_TESTS سائق المسار', '01033333333', 'DL-M-1');

  update public.subcontractor_drivers
     set photo_path = v_photo, license_photo_path = v_lic
   where id = v_drv_1;

  insert into storage.objects (bucket_id, name) values ('driver-docs', v_photo);
  insert into storage.objects (bucket_id, name) values ('driver-docs', v_lic);

  -- (م-١) 🔴 اللوحة: مساران يُقرآن، ومفتاحان يُوقَّعان — ولا فارق بينهما
  perform set_config('request.jwt.claim.sub', v_uid_mad::text, true);
  set local role authenticated;

  select count(*) into v_paths
    from public.subcontractor_drivers d,
         lateral (values (d.photo_path), (d.license_photo_path)) as x(p)
   where d.subcontractor_id = v_sub_1 and x.p is not null;

  select count(*) into v_signable
    from public.subcontractor_drivers d
    join lateral (values (d.photo_path), (d.license_photo_path)) as x(p) on x.p is not null
    join storage.objects o on o.bucket_id = 'driver-docs' and o.name = x.p
   where d.subcontractor_id = v_sub_1;
  reset role;

  if v_paths <> 2 then
    raise exception
      '(م-١أ) تهيئةٌ خاطئة: اللوحة تقرأ % مساراً بدل اثنين — التأكيد التالي بلا معنى', v_paths;
  end if;
  if v_signable <> v_paths then
    raise exception
      '(م-١ب) 🔴 اللوحة تقرأ % مساراً ولا ترى منها إلا % في الدلو — وهذا بعينه المربّع الفارغ الذي أبلغ عنه المالك',
      v_paths, v_signable;
  end if;

  -- (م-٢) والشريك المالك يرى مستنداتِ سائقه هو بنفس المسار (بوابة `/portal/drivers`)
  perform set_config('request.jwt.claim.sub', v_uid_m1::text, true);
  set local role authenticated;
  select count(*) into v_signable
    from public.subcontractor_drivers d
    join lateral (values (d.photo_path), (d.license_photo_path)) as x(p) on x.p is not null
    join storage.objects o on o.bucket_id = 'driver-docs' and o.name = x.p
   where d.subcontractor_id = v_sub_1;
  reset role;
  if v_signable <> 2 then
    raise exception '(م-٢) الشريك المالك يوقّع % من مستنداته بدل اثنين', v_signable;
  end if;

  -- (م-٣) والشريك الآخر لا يبلغ منها شيئاً — لا صفّاً ولا مفتاحاً
  perform set_config('request.jwt.claim.sub', v_uid_m2::text, true);
  set local role authenticated;
  select count(*) into v_n from public.subcontractor_drivers where subcontractor_id = v_sub_1;
  select count(*) into v_signable from storage.objects
   where bucket_id = 'driver-docs' and name in (v_photo, v_lic);
  reset role;
  if v_n <> 0 or v_signable <> 0 then
    raise exception
      '(م-٣) 🔴 الشريك الثاني بلغ % صفَّ سائقٍ و% مفتاحاً ليسا له — العزل مكسور (D-19 · D-20)',
      v_n, v_signable;
  end if;

  -- (م-٤) والزائر المجهول: صفر وصفر
  --
  -- ⚠ وجدولُ السائقين محجوبٌ عنه **بالمنحة** لا بالسياسة: `anon` بلا
  --   `SELECT` أصلاً، فالاستعلام يرمي `insufficient_privilege` بدل أن يعيد
  --   صفراً. وهذا حجبٌ **أقوى** لا أضعف — فيُقبل، ولا يُقرأ خطؤه فشلاً.
  --   ولذلك يُلتقط الاستثناء ويُعدّ صفراً صراحةً، ولا يُبتلع غيرُه.
  perform set_config('request.jwt.claim.sub', '', true);
  set local role anon;
  begin
    select count(*) into v_n from public.subcontractor_drivers where subcontractor_id = v_sub_1;
  exception
    when insufficient_privilege then v_n := 0;
  end;
  select count(*) into v_signable from storage.objects
   where bucket_id = 'driver-docs' and name in (v_photo, v_lic);
  reset role;
  if v_n <> 0 or v_signable <> 0 then
    raise exception '(م-٤) 🔴 الزائر بلغ % صفاً و% مفتاحاً من مستندات السائقين', v_n, v_signable;
  end if;

  -- ── (م-٥) الطفرة الأولى: تُسحب صفةُ الإدارة ⇒ الشاهد يجب أن يحمرّ ────────
  update public.profiles set role = 'subcontractor' where id = v_uid_mad;

  perform set_config('request.jwt.claim.sub', v_uid_mad::text, true);
  set local role authenticated;
  select count(*) into v_signable from storage.objects
   where bucket_id = 'driver-docs' and name in (v_photo, v_lic);
  reset role;

  if v_signable <> 0 then
    raise exception
      '(م-٥) 🔴 سُحبت صفةُ الإدارة والمفاتيح ما زالت مرئية (%) — أي أن الشاهد (م-١) لا يشهد على `is_admin()` بل يمرّ من بابٍ آخر',
      v_signable;
  end if;
  update public.profiles set role = 'admin' where id = v_uid_mad;

  -- ── (م-٦) الطفرة الثانية: مسارٌ بلا كائن ⇒ يجب أن يظهر الفارق ────────────
  --
  -- وهذه هي **صورةُ العطل نفسها** في القاعدة: صفٌّ يحمل مساراً، والدلو لا يحمل
  -- مفتاحه. فإن لم يهبط `v_signable` تحت `v_paths` هنا، فالتأكيد (م-١ب) زينةٌ
  -- تمرّ مهما انكسر ما تحتها.
  update public.subcontractor_drivers set photo_path = v_dangling where id = v_drv_1;

  perform set_config('request.jwt.claim.sub', v_uid_mad::text, true);
  set local role authenticated;
  select count(*) into v_paths
    from public.subcontractor_drivers d,
         lateral (values (d.photo_path), (d.license_photo_path)) as x(p)
   where d.subcontractor_id = v_sub_1 and x.p is not null;
  select count(*) into v_signable
    from public.subcontractor_drivers d
    join lateral (values (d.photo_path), (d.license_photo_path)) as x(p) on x.p is not null
    join storage.objects o on o.bucket_id = 'driver-docs' and o.name = x.p
   where d.subcontractor_id = v_sub_1;
  reset role;

  if v_paths <> 2 or v_signable <> 1 then
    raise exception
      '(م-٦) 🔴 وُجِّه مسارٌ إلى مفتاحٍ لا وجود له فقرأ الشاهد %/% بدل ١/٢ — أي أن (م-١ب) لا يمسك المربّع الفارغ',
      v_signable, v_paths;
  end if;

  raise notice '✔ (م) مسار اللوحة: مساران يُقرآن ويُوقَّعان · الشريك المالك مثلُه · الآخر والزائر صفر · وطفرتان أحمرّ بهما الشاهد';

  raise exception 'ROLLBACK_MARKER';
exception
  when others then
    begin
      execute 'reset role';
    exception when others then null;
    end;
    if sqlerrm <> 'ROLLBACK_MARKER' then raise; end if;
  end;
  -- ── نهاية الكتلة الراجعة ذاتياً ──────────────────────────────────────────

  perform set_config('request.jwt.claim.sub', '', false);

  -- حارس التسريب — نفس حارس (د-ح): الدلو عاد إلى ما كان بالضبط
  select count(*) into v_n from storage.objects where bucket_id = 'driver-docs';
  if v_n <> v_before then
    raise exception
      '(م) 🔴 تسريب في storage.objects: كان % كائناً وصار % — الكتلة الراجعة لم ترجع',
      v_before, v_n;
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- (ل) التنظيف — وما بقي يُعلَن
-- ----------------------------------------------------------------------------
do $$
declare
  v_n integer;
begin
  delete from public.subcontractor_drivers where name like 'DDOC_TESTS%';
  delete from public.subcontractors      where company_name like 'DDOC_TESTS%';

  select count(*) into v_n from public.subcontractor_drivers where name like 'DDOC_TESTS%';
  if v_n > 0 then
    raise exception '(ل) بقي % صفَّ فيكسترة', v_n;
  end if;

  raise notice '✔ (ل) لا فيكسترة باقية';
end;
$$;

do $$
begin
  raise notice '════════════════════════════════════════════════════════';
  raise notice ' DRIVER_DOCS TESTS: ALL PASSED';
  raise notice '════════════════════════════════════════════════════════';
end;
$$;
