-- ============================================================================
-- price_sheet_tests.sql — كشف أسعار واحد يحمل مسارات كثيرة (هجرة 0102)
--
-- كيف تشغّله:
--   node scripts/db-test.mjs price_sheet
--   أو من psql:  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/price_sheet_tests.sql
-- النجاح = آخر سطر «ALL PASSED». أي فشل exception عربية فيها المتوقع والفعلي.
--
-- 🔴 كل ما يخصّ المتعهد في هذا الملف يُنفَّذ **بهوية متعهدٍ مسجَّل الدخول** لا
--    بهوية مالك القاعدة (D-20: كل متعهد مستخدم `authenticated`، فاختبارٌ يجري
--    بصلاحيات المالك يثبت أن الشيفرة تعمل ولا يثبت أن الحاجز قائم).
--    والاعتماد وحده يجري بهوية مشرف.
--
-- قابل لإعادة التنفيذ بلا حدود: كل صفوف الاختبار بمعرّفات ثابتة تبدأ بـ 55ee70،
-- وأسماء الشركات موسومة PRICE_SHEET_TESTS، والتنظيف يقع في البداية والنهاية معاً
-- (فتشغيلٌ منهارٌ في المنتصف لا يمنع التالي). ولا يلمس هذا الملف صفاً حقيقياً
-- واحداً: لا متعهد المالك ولا قوائمه ولا حجوزاته ولا سجل الإشعارات.
--
-- إحداثيات الاختبار **صحراوية داخل مصر** (شرط `SERVICE_BOUNDS` في الاستيراد)
-- وبعيدة مئات الكيلومترات عن مسارات المالك الحقيقية، فلا يفشل هذا الملف لأن
-- المشروع نجح ولا ينجح لأن مسار المالك موجود.
--
-- الأقسام:
--   (أ) الشروط المسبقة + التنظيف + التركيب والهويات
--   (ب) كشفٌ واحد يحمل مساراتٍ كثيرة
--   (ج) الاستيراد: يقبل الصحيح ويرفض الفاسد بسببٍ مذكور، والفحص لا يكتب حرفاً
--   (د) الفئات مقصورة على أسطول المتعهد — والمُسعَّرة سلفاً لا تُحذف بصمت
--   (هـ) 🔴 قبل الاعتماد: لا تغطية ولا سعر متعهد ولا مدخل إلى الإرسال
--   (و) اعتمادٌ واحدٌ للدفعة كلها — وبعده وحده يشتغل التسعير
--   (ز) المتعهد لا يعتمد كشفه، ولا يقرأ كشف غيره ولا يستورد فيه
--   (ح) حارس الملكية وحارس الحذف
--   (ط) الصلاحيات: صفرٌ لـ anon على الجدول وعلى الدوال الست
--   (ي) صدق الاستيراد: الخانة الفارغة · المبهم · العمود المكرّر · الفئة الساقطة
--   (ك) 🔴 الاعتماد لا يتجاوز ما عُرض — كشفٌ أكبر من سقف الطابور
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (أ-١) الشروط المسبقة
-- ----------------------------------------------------------------------------
do $$
declare
  v_missing text;
begin
  select string_agg(x.sig, '، ') into v_missing
  from (values
    ('public.price_sheet_classes(uuid, uuid)'),
    ('public.upsert_price_sheet(uuid, text, text, uuid)'),
    ('public.import_price_sheet_rows(uuid, jsonb, boolean, uuid)'),
    ('public.submit_price_sheet(uuid)'),
    ('public.review_price_sheet(uuid, boolean, text, integer)'),
    ('public.price_sheet_stats(uuid)'),
    ('public.coverage_matches(numeric, numeric, numeric, numeric)'),
    ('public.quote_price(numeric, integer, boolean, numeric, numeric, numeric, numeric, numeric, integer, jsonb)')
  ) as x(sig)
  where to_regprocedure(x.sig) is null;

  if v_missing is not null then
    raise exception 'شرط مسبق: دوال مفقودة (نفّذ 0102 أولاً): %', v_missing;
  end if;

  if to_regclass('public.price_sheets') is null then
    raise exception 'شرط مسبق: جدول price_sheets مفقود — نفّذ 0102';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'price_lists' and column_name = 'sheet_id'
  ) then
    raise exception 'شرط مسبق: عمود price_lists.sheet_id مفقود — نفّذ 0102';
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- (أ-٢) التنظيف الأولي — المسارات أولاً، فحارس الحذف يمنع كشفاً فيه مسار معتمد
-- ----------------------------------------------------------------------------
delete from public.price_list_items pli
 where pli.price_list_id in (
   select pl.id from public.price_lists pl
   join public.subcontractors s on s.id = pl.subcontractor_id
   where s.company_name like 'PRICE_SHEET_TESTS%');
delete from public.price_lists pl
 where pl.subcontractor_id in (
   select s.id from public.subcontractors s where s.company_name like 'PRICE_SHEET_TESTS%');
delete from public.price_sheets ps
 where ps.subcontractor_id in (
   select s.id from public.subcontractors s where s.company_name like 'PRICE_SHEET_TESTS%');
delete from public.subcontractors s where s.company_name like 'PRICE_SHEET_TESTS%';
delete from public.profiles p
 where p.id in ('55ee7002-0000-4000-8000-00000000000a'::uuid,
                '55ee7002-0000-4000-8000-00000000000b'::uuid,
                '55ee7002-0000-4000-8000-0000000000ad'::uuid);
do $$
begin
  delete from auth.users u
   where u.id in ('55ee7002-0000-4000-8000-00000000000a'::uuid,
                  '55ee7002-0000-4000-8000-00000000000b'::uuid,
                  '55ee7002-0000-4000-8000-0000000000ad'::uuid);
exception when others then null;
end;
$$;

-- ----------------------------------------------------------------------------
-- (أ-٣) التركيب: متعهدان معتمدان بأسطولين مختلفين + هويات دخول حقيقية
-- ----------------------------------------------------------------------------
do $$
declare
  v_a       constant uuid := '55ee7000-0000-4000-8000-00000000000a';
  v_b       constant uuid := '55ee7000-0000-4000-8000-00000000000b';
  v_pa      constant uuid := '55ee7002-0000-4000-8000-00000000000a';
  v_pb      constant uuid := '55ee7002-0000-4000-8000-00000000000b';
  v_padm    constant uuid := '55ee7002-0000-4000-8000-0000000000ad';
  v_classes text[];
  v_admin   uuid;
begin
  select array_agg(vc.slug order by vc.sort, vc.capacity, vc.slug) into v_classes
  from public.vehicle_classes vc where vc.active;

  if coalesce(array_length(v_classes, 1), 0) < 3 then
    raise exception 'شرط مسبق: نحتاج ٣ فئات سيارات فعّالة على الأقل (وجدنا %)',
      coalesce(array_length(v_classes, 1), 0);
  end if;

  -- الفئات تُشتق من الجدول نفسه فلا يفشل الملف إن أعاد المالك تسمية فئة
  perform set_config('tours.ps_c1', v_classes[1], false);
  perform set_config('tours.ps_c2', v_classes[2], false);
  perform set_config('tours.ps_c3', v_classes[3], false);

  insert into public.subcontractors (id, company_name, phone, status)
  values (v_a, 'PRICE_SHEET_TESTS شركة أ', '01000000001', 'approved'),
         (v_b, 'PRICE_SHEET_TESTS شركة ب', '01000000002', 'approved');

  -- «أ» يغطي الفئتين ١ و٢ ولا يغطي ٣؛ و«ب» يغطي الفئة ١ وحدها
  insert into public.subcontractor_vehicles (subcontractor_id, class_slug, label, active)
  values (v_a, v_classes[1], 'PS مركبة أ١', true),
         (v_a, v_classes[2], 'PS مركبة أ٢', true),
         (v_b, v_classes[1], 'PS مركبة ب١', true);

  -- الهويات: بدونها لا يثبت هذا الملف شيئاً عن الحواجز، فغيابها فشلٌ لا تخطٍّ
  begin
    insert into auth.users (id, email) values
      (v_pa,   'price-sheet-a@local.invalid'),
      (v_pb,   'price-sheet-b@local.invalid'),
      (v_padm, 'price-sheet-admin@local.invalid');
  exception
    when others then
      raise exception 'تعذّر إنشاء هويات الاختبار في auth.users (%) — هذا الملف يقيس حواجز صلاحيات ولا يجوز تشغيله بهوية المالك', sqlerrm;
  end;

  insert into public.profiles (id, role, full_name) values
    (v_pa,   'subcontractor', 'PS متعهد أ'),
    (v_pb,   'subcontractor', 'PS متعهد ب'),
    (v_padm, 'admin',         'PS مشرف اختبار')
  on conflict (id) do update set role = excluded.role;

  update public.subcontractors set profile_id = v_pa where id = v_a;
  update public.subcontractors set profile_id = v_pb where id = v_b;

  -- تحقّق أن الهوية تُحلّ فعلاً قبل أن نبني عليها اختبارات
  perform set_config('request.jwt.claim.sub', v_pa::text, false);
  if public.current_subcontractor_id() is distinct from v_a then
    raise exception '(أ-٣) الهوية لا تُحلّ: current_subcontractor_id = % والمتوقع %',
      coalesce(public.current_subcontractor_id()::text, 'بلا'), v_a;
  end if;

  perform set_config('request.jwt.claim.sub', v_padm::text, false);
  if not public.is_admin() then
    raise exception '(أ-٣) هوية المشرف لا تُحلّ — is_admin() = false';
  end if;

  -- نبدأ العمل بهوية المتعهد «أ»
  perform set_config('request.jwt.claim.sub', v_pa::text, false);

  raise notice '✔ (أ) التركيب: متعهدان + مشرف بهويات حقيقية · «أ» يغطي % و% ولا يغطي %',
    v_classes[1], v_classes[2], v_classes[3];
end;
$$;

-- ----------------------------------------------------------------------------
-- (ب) كشفٌ واحد يحمل مساراتٍ كثيرة — جوهر شكوى المالك
-- ----------------------------------------------------------------------------
do $$
declare
  v_a     constant uuid := '55ee7000-0000-4000-8000-00000000000a';
  v_c1    text := current_setting('tours.ps_c1');
  v_c2    text := current_setting('tours.ps_c2');
  v_sheet uuid;
  v_rows  jsonb;
  v_ok    integer;
  v_bad   integer;
  v_cnt   integer;
  v_pt    record;
  v_st    record;
begin
  select s.id into v_sheet
  from public.upsert_price_sheet(null, 'PS كشف أ الأساسي', 'من ملف المتعهد') s;

  if v_sheet is null then
    raise exception '(ب-١) upsert_price_sheet لم تُرجع معرّف كشف';
  end if;
  perform set_config('tours.ps_sheet', v_sheet::text, false);

  -- أربعة مسارات في نداءٍ واحد — وهذا بالضبط ما كان مستحيلاً قبل 0102
  v_rows := jsonb_build_array(
    jsonb_build_object(
      'title', 'PS مسار ١', 'originLabel', 'PS_ALPHA',
      'originLat', 25.5, 'originLng', 27.5, 'originRadiusKm', 20,
      'destLabel', 'PS_BETA', 'destLat', 26.5, 'destLng', 29.0, 'destRadiusKm', 20,
      'bidirectional', true,
      'prices', jsonb_build_object(v_c1, 1000, v_c2, 1500)),
    jsonb_build_object(
      'title', 'PS مسار ٢', 'originLabel', 'PS_ALPHA',
      'originLat', 25.5, 'originLng', 27.5, 'originRadiusKm', 20,
      'destLabel', 'PS_GAMMA', 'destLat', 24.0, 'destLng', 30.5, 'destRadiusKm', 20,
      'prices', jsonb_build_object(v_c1, 1200)),
    jsonb_build_object(
      'title', 'PS مسار ٣', 'originLabel', 'PS_BETA',
      'originLat', 26.5, 'originLng', 29.0, 'originRadiusKm', 20,
      'destLabel', 'PS_DELTA', 'destLat', 27.5, 'destLng', 26.0, 'destRadiusKm', 20,
      'prices', jsonb_build_object(v_c2, 1800)),
    -- 🔴 الصف الرابع بلا إحداثيات: النقطتان عُرِّفتا في صفوف أسبق من نفس الملف
    jsonb_build_object(
      'title', 'PS مسار ٤', 'originLabel', 'PS_GAMMA', 'destLabel', 'PS_DELTA',
      'prices', jsonb_build_object(v_c1, 900))
  );

  select count(*) filter (where r.accepted), count(*) filter (where not r.accepted)
    into v_ok, v_bad
  from public.import_price_sheet_rows(v_sheet, v_rows, true) r;

  if v_bad <> 0 or v_ok <> 4 then
    raise exception '(ب-٢) الاستيراد: متوقع ٤ مقبولة و٠ مرفوضة — الفعلي % و%', v_ok, v_bad;
  end if;

  select count(*) into v_cnt from public.price_lists pl where pl.sheet_id = v_sheet;
  if v_cnt <> 4 then
    raise exception '(ب-٣) الكشف يحمل % مساراً — المتوقع ٤', v_cnt;
  end if;

  -- كلها مسودات: الاستيراد لا يُرسل ولا يعتمد
  select count(*) into v_cnt
  from public.price_lists pl where pl.sheet_id = v_sheet and pl.status = 'draft';
  if v_cnt <> 4 then
    raise exception '(ب-٤) المستورد ليس كله مسودة (% من ٤)', v_cnt;
  end if;

  -- الصف الرابع أخذ إحداثياته من الصفين ٢ و٣ لا من فراغ
  select pl.origin_lat, pl.origin_lng, pl.dest_lat, pl.dest_lng into v_pt
  from public.price_lists pl
  where pl.sheet_id = v_sheet and pl.title = 'PS مسار ٤';
  if v_pt.origin_lat is distinct from 24.0 or v_pt.dest_lng is distinct from 26.0 then
    raise exception '(ب-٥) لم تُحلّ إحداثيات الصف الرابع من نقاط الصفوف السابقة (%,% / %,%)',
      v_pt.origin_lat, v_pt.origin_lng, v_pt.dest_lat, v_pt.dest_lng;
  end if;

  -- عدّادات الكشف مصدرها واحد ولا تُحسب في الواجهة
  select * into v_st from public.price_sheet_stats(v_a) x where x.id = v_sheet;
  if v_st.routes <> 4 or v_st.draft_count <> 4 or v_st.approved_count <> 0 then
    raise exception '(ب-٦) price_sheet_stats: مسارات=% مسودة=% معتمدة=% — المتوقع ٤/٤/٠',
      v_st.routes, v_st.draft_count, v_st.approved_count;
  end if;

  raise notice '✔ (ب) كشف واحد يحمل ٤ مسارات، كلها مسودات، والنقاط تُحلّ بالاسم';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ج) الاستيراد: يقبل الصحيح ويرفض الفاسد **بسببٍ مذكور لكل صف**
--     ووضع الفحص يُنتج نفس الحكم بلا أن يكتب حرفاً واحداً.
-- ----------------------------------------------------------------------------
do $$
declare
  v_c1       text := current_setting('tours.ps_c1');
  v_c3       text := current_setting('tours.ps_c3');   -- فئة لا يغطّيها «أ»
  v_sheet2   uuid;
  v_rows     jsonb;
  v_before   integer;
  v_after    integer;
  v_ok       integer;
  v_bad      integer;
  v_noreason integer;
  v_dry      jsonb;
  v_wet      jsonb;
  v_why      text;
begin
  select s.id into v_sheet2
  from public.upsert_price_sheet(null, 'PS كشف الفحص', null) s;
  perform set_config('tours.ps_sheet2', v_sheet2::text, false);

  v_rows := jsonb_build_array(
    -- (١) صحيح
    jsonb_build_object('title', 'PS فحص ١', 'originLabel', 'PS_EPS',
      'originLat', 26.0, 'originLng', 28.0, 'originRadiusKm', 20,
      'destLabel', 'PS_ZETA', 'destLat', 27.0, 'destLng', 31.0, 'destRadiusKm', 20,
      'prices', jsonb_build_object(v_c1, 700)),
    -- (٢) تكلفة سالبة
    jsonb_build_object('title', 'PS فحص ٢', 'originLabel', 'PS_EPS',
      'originLat', 26.0, 'originLng', 28.0,
      'destLabel', 'PS_ZETA', 'destLat', 27.0, 'destLng', 31.0,
      'prices', jsonb_build_object(v_c1, -5)),
    -- (٣) فئة لا يغطّيها أسطوله — ملاحظة المالك ٥
    jsonb_build_object('title', 'PS فحص ٣', 'originLabel', 'PS_EPS',
      'originLat', 26.0, 'originLng', 28.0,
      'destLabel', 'PS_ZETA', 'destLat', 27.0, 'destLng', 31.0,
      'prices', jsonb_build_object(v_c3, 800)),
    -- (٤) نقطة بلا إحداثيات ولم تُعرَّف من قبل
    jsonb_build_object('title', 'PS فحص ٤', 'originLabel', 'PS_MAJHOOL',
      'destLabel', 'PS_ZETA', 'destLat', 27.0, 'destLng', 31.0,
      'prices', jsonb_build_object(v_c1, 900)),
    -- (٥) عنوان مكرّر داخل نفس الملف
    jsonb_build_object('title', 'PS فحص ١', 'originLabel', 'PS_EPS',
      'originLat', 26.0, 'originLng', 28.0,
      'destLabel', 'PS_ZETA', 'destLat', 27.0, 'destLng', 31.0,
      'prices', jsonb_build_object(v_c1, 750)),
    -- (٦) إحداثيات خارج مصر — قلبُ lat/lng أو مدينة أخرى
    jsonb_build_object('title', 'PS فحص ٦', 'originLabel', 'PS_KHARIJ',
      'originLat', 48.85, 'originLng', 2.35,
      'destLabel', 'PS_ZETA', 'destLat', 27.0, 'destLng', 31.0,
      'prices', jsonb_build_object(v_c1, 950)),
    -- (٧) بلا أي سعر
    jsonb_build_object('title', 'PS فحص ٧', 'originLabel', 'PS_EPS',
      'originLat', 26.0, 'originLng', 28.0,
      'destLabel', 'PS_ZETA', 'destLat', 27.0, 'destLng', 31.0,
      'prices', jsonb_build_object())
  );

  select count(*) into v_before from public.price_lists pl where pl.sheet_id = v_sheet2;

  -- (ج-١) وضع الفحص: حكمٌ كامل بلا كتابة
  select jsonb_agg(jsonb_build_object('n', r.row_no, 'a', r.accepted) order by r.row_no)
    into v_dry
  from public.import_price_sheet_rows(v_sheet2, v_rows, false) r;

  select count(*) into v_after from public.price_lists pl where pl.sheet_id = v_sheet2;
  if v_after <> v_before then
    raise exception '(ج-١) وضع الفحص كتب % صفاً — يجب ألا يكتب شيئاً', v_after - v_before;
  end if;

  -- (ج-٢) التنفيذ: يقبل الصحيح ويرفض الفاسد، والحكم مطابق لحكم الفحص
  select jsonb_agg(jsonb_build_object('n', r.row_no, 'a', r.accepted) order by r.row_no),
         count(*) filter (where r.accepted),
         count(*) filter (where not r.accepted),
         count(*) filter (where not r.accepted and coalesce(btrim(r.reason), '') = '')
    into v_wet, v_ok, v_bad, v_noreason
  from public.import_price_sheet_rows(v_sheet2, v_rows, true) r;

  if v_dry is distinct from v_wet then
    raise exception '(ج-٢) حكم الفحص خالف حكم التنفيذ — الفحص % والتنفيذ %', v_dry, v_wet;
  end if;
  if v_ok <> 1 or v_bad <> 6 then
    raise exception '(ج-٣) المتوقع ١ مقبول و٦ مرفوضة — الفعلي % و%', v_ok, v_bad;
  end if;
  if v_noreason <> 0 then
    raise exception '(ج-٤) % صفاً مرفوضاً بلا سبب مذكور — الرفض الصامت ممنوع', v_noreason;
  end if;

  -- (ج-٥) والسبب يصف الخطأ الحقيقي لا رسالة عامة: الصف ٣ عن الفئة غير المغطّاة
  select r.reason into v_why
  from public.import_price_sheet_rows(v_sheet2, v_rows, false) r where r.row_no = 3;
  if v_why not like '%' || v_c3 || '%' then
    raise exception '(ج-٥) سبب رفض الصف ٣ «%» لا يذكر الفئة % — المستورد لا يعرف ما يصحّح',
      v_why, v_c3;
  end if;

  select r.reason into v_why
  from public.import_price_sheet_rows(v_sheet2, v_rows, false) r where r.row_no = 6;
  if v_why not like '%مصر%' then
    raise exception '(ج-٦) سبب رفض الصف ٦ «%» لا يذكر الخروج عن مصر', v_why;
  end if;

  -- (ج-٧) والمرفوض لم يُكتب: صفٌّ واحد فقط دخل الكشف
  select count(*) into v_after from public.price_lists pl where pl.sheet_id = v_sheet2;
  if v_after <> 1 then
    raise exception '(ج-٧) دخل الكشف % مساراً — المتوقع ١ (المقبول وحده)', v_after;
  end if;

  -- (ج-٨) ولا بندَ سعرٍ يتيماً من صفٍّ مرفوض
  select count(*) into v_after
  from public.price_list_items pli
  join public.price_lists pl on pl.id = pli.price_list_id
  where pl.sheet_id = v_sheet2;
  if v_after <> 1 then
    raise exception '(ج-٨) بنود الأسعار في كشف الفحص % — المتوقع ١', v_after;
  end if;

  raise notice '✔ (ج) الاستيراد: ١ مقبول و٦ مرفوضة بأسباب مُحدَّدة، والفحص لا يكتب ويطابق التنفيذ';
end;
$$;

-- ----------------------------------------------------------------------------
-- (د) الفئات المعروضة = فئات أسطوله وحدها (ملاحظة المالك ٥)
--     ومع ذلك: فئةٌ مُسعَّرة سلفاً تبقى ظاهرة بعلامة «غير مغطّاة» فلا تُحذف بصمت
-- ----------------------------------------------------------------------------
do $$
declare
  v_a    constant uuid := '55ee7000-0000-4000-8000-00000000000a';
  v_c1   text := current_setting('tours.ps_c1');
  v_c2   text := current_setting('tours.ps_c2');
  v_c3   text := current_setting('tours.ps_c3');
  v_got  text[];
  v_exp  text[];
  v_list uuid;
  v_cov  boolean;
begin
  select array_agg(c.slug order by c.slug) into v_got
  from public.price_sheet_classes(v_a, null) c;
  select array_agg(x order by x) into v_exp from unnest(array[v_c1, v_c2]) x;

  if v_got is distinct from v_exp then
    raise exception '(د-١) الفئات المعروضة % — المتوقع %', v_got, v_exp;
  end if;

  if v_c3 = any (v_got) then
    raise exception '(د-٢) الفئة % معروضة للتسعير رغم أن المتعهد لا يملك فيها مركبة', v_c3;
  end if;

  -- فئةٌ مُسعَّرة سلفاً في مسارٍ قائم (كما لو سُعِّرت قبل تغيير الأسطول)
  select pl.id into v_list
  from public.price_lists pl
  where pl.sheet_id = current_setting('tours.ps_sheet')::uuid and pl.title = 'PS مسار ١';
  insert into public.price_list_items (price_list_id, class_slug, cost)
  values (v_list, v_c3, 2500)
  on conflict (price_list_id, class_slug) do update set cost = excluded.cost;

  select array_agg(c.slug order by c.slug) into v_got
  from public.price_sheet_classes(v_a, v_list) c;
  if not (v_c3 = any (v_got)) then
    raise exception '(د-٣) الفئة المُسعَّرة سلفاً % اختفت من المحرِّر — أول حفظ يمحو سعرها بصمت',
      v_c3;
  end if;

  select c.covered into v_cov
  from public.price_sheet_classes(v_a, v_list) c where c.slug = v_c3;
  if v_cov is distinct from false then
    raise exception '(د-٤) الفئة % ظهرت بعلامة «مغطّاة» رغم غياب المركبة', v_c3;
  end if;

  delete from public.price_list_items pli
   where pli.price_list_id = v_list and pli.class_slug = v_c3;

  raise notice '✔ (د) الفئات = أسطوله وحده، والمُسعَّرة سلفاً تبقى ظاهرة بعلامة «غير مغطّاة»';
end;
$$;

-- ----------------------------------------------------------------------------
-- (هـ) 🔴 قبل الاعتماد لا شيء يعمل — يُقاس **قبل** الاعتماد عمداً
-- ----------------------------------------------------------------------------
do $$
declare
  v_sheet uuid := current_setting('tours.ps_sheet')::uuid;
  v_c1    text := current_setting('tours.ps_c1');
  v_hits  integer;
  v_src   text;
begin
  -- المسار الأول: PS_ALPHA (25.5, 27.5) ← PS_BETA (26.5, 29.0)
  select count(*) into v_hits
  from public.coverage_matches(25.5, 27.5, 26.5, 29.0) cm
  join public.price_lists pl on pl.id = cm.price_list_id
  where pl.sheet_id = v_sheet;
  if v_hits <> 0 then
    raise exception '(هـ-١) كشف غير معتمد يطابق التغطية % مرة — يجب صفر', v_hits;
  end if;

  select q.price_source into v_src
  from public.quote_price(180, 1, false, 0, 25.5, 27.5, 26.5, 29.0, 0) q
  where q.class_slug = v_c1;
  if v_src is distinct from 'tariff' then
    raise exception '(هـ-٢) مصدر السعر «%» قبل الاعتماد — المتوقع tariff', coalesce(v_src, 'بلا');
  end if;

  /*
   * (هـ-٣) ولا مدخلَ ثانٍ إلى تكلفة المتعهد: كلُّ ما يصل الإرسالَ يمرّ بـ
   * `coverage_matches`، فما لا تُرجعه التغطيةُ لا يبلغ متعهداً أصلاً.
   *
   * 🔴 والفحصُ يتتبّع **السلسلة** لا الحرفَ في جسمٍ واحد. وكان يشترط أن يظهر
   * اسمُ `coverage_matches` داخل `dispatch_pool` نفسها — فلمّا أدخلت `0132`
   * وسيطاً مشروعاً (`coverage_best_costs` وهي نفسُها تنادي `coverage_matches`)
   * احمرّ التوكيدُ **على إعادة تنظيمٍ سليمة**، والضمانةُ لم تنكسر لحظةً.
   * وهي القاعدة ١٩ بعينها: **مكتشِفٌ يقرأ نصّاً يكذب في الاتجاهين** — يرفض
   * وسيطاً صحيحاً، ويقبل جسماً يذكر الاسم في تعليقٍ ولا ينادِيه.
   *
   * فالتتبّعُ الآن عبر `pg_depend`: هل يصل `dispatch_pool` إلى `coverage_matches`
   * بأي عدد من الوسطاء؟ ⇒ يمرّ الوسيطُ المشروع، ويحمرّ قطعُ السلسلة حقاً.
   */
  if not exists (
    with recursive reached(oid, name) as (
      select p.oid, p.proname
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'dispatch_pool'
      union
      select callee.oid, callee.proname
      from reached r
      join pg_proc caller on caller.oid = r.oid
      join pg_proc callee on true
      join pg_namespace callee_ns on callee_ns.oid = callee.pronamespace
      where callee_ns.nspname = 'public'
        and callee.oid <> caller.oid
        and pg_get_functiondef(caller.oid) like '%public.' || callee.proname || '(%'
    )
    select 1 from reached where name = 'coverage_matches'
  ) then
    raise exception '(هـ-٣) لا سبيلَ من dispatch_pool إلى coverage_matches — الضمانة انكسرت';
  end if;
  if exists (select 1 from pg_proc p
             join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'dispatch_pool'
               and pg_get_functiondef(p.oid) like '%from public.price_lists%') then
    raise exception '(هـ-٤) dispatch_pool صار يقرأ price_lists مباشرةً — مدخلٌ يتجاوز شرط الاعتماد';
  end if;

  raise notice '✔ (هـ) قبل الاعتماد: صفر تغطية · السعر من التعريفة · ولا مدخل للإرسال';
end;
$$;

-- ----------------------------------------------------------------------------
-- (و) اعتمادٌ واحدٌ يغطي الدفعة كلها — لا اعتماد لكل مسار
-- ----------------------------------------------------------------------------
do $$
declare
  v_padm  constant uuid := '55ee7002-0000-4000-8000-0000000000ad';
  v_pa    constant uuid := '55ee7002-0000-4000-8000-00000000000a';
  v_sheet uuid := current_setting('tours.ps_sheet')::uuid;
  v_c1    text := current_setting('tours.ps_c1');
  v_sub   record;
  v_rev   record;
  v_cnt   integer;
  v_hits  integer;
  v_src   text;
  v_cost  numeric;
  v_msg   text;
begin
  -- (و-١) إرسالٌ واحد ينقل مسودات الكشف كلها (بهوية المتعهد)
  select * into v_sub from public.submit_price_sheet(v_sheet);
  if v_sub.submitted <> 4 then
    raise exception '(و-١) submit_price_sheet نقلت % مساراً — المتوقع ٤', v_sub.submitted;
  end if;

  select count(*) into v_cnt
  from public.price_lists pl where pl.sheet_id = v_sheet and pl.status = 'pending';
  if v_cnt <> 4 then
    raise exception '(و-٢) بعد الإرسال % مساراً pending — المتوقع ٤', v_cnt;
  end if;

  -- (و-٣) الاعتماد بهوية المشرف: نداءٌ واحد يعتمد الأربعة
  perform set_config('request.jwt.claim.sub', v_padm::text, false);

  -- والرفض بلا سبب مرفوض برسالته هو لا بأي خطأ عابر
  v_msg := null;
  begin
    perform 1 from public.review_price_sheet(v_sheet, false, null, 4);
  exception when others then v_msg := sqlerrm;
  end;
  if v_msg is null or v_msg not like '%سبب الرفض%' then
    raise exception '(و-٣) رفضٌ بلا سبب لم يُرفض برسالته — الرسالة: %',
      coalesce(v_msg, 'لا خطأ إطلاقاً');
  end if;

  select * into v_rev from public.review_price_sheet(v_sheet, true, 'دفعة مقبولة', 4);
  if v_rev.affected <> 4 or v_rev.new_status <> 'approved' then
    raise exception '(و-٤) review_price_sheet: أثّرت في % بحالة % — المتوقع ٤/approved',
      v_rev.affected, v_rev.new_status;
  end if;

  select count(*) into v_cnt
  from public.price_lists pl where pl.sheet_id = v_sheet and pl.status = 'approved';
  if v_cnt <> 4 then
    raise exception '(و-٥) بعد الاعتماد % مساراً معتمداً — المتوقع ٤', v_cnt;
  end if;

  -- (و-٦) وبعد الاعتماد **وحده** تشتغل التغطية ويتحوّل مصدر السعر
  select count(*) into v_hits
  from public.coverage_matches(25.5, 27.5, 26.5, 29.0) cm
  join public.price_lists pl on pl.id = cm.price_list_id
  where pl.sheet_id = v_sheet;
  if v_hits < 1 then
    raise exception '(و-٦) بعد الاعتماد لا تطابق التغطية — الاعتماد لم يُفعّل شيئاً';
  end if;

  select q.price_source, q.subcontractor_cost into v_src, v_cost
  from public.quote_price(180, 1, false, 0, 25.5, 27.5, 26.5, 29.0, 0) q
  where q.class_slug = v_c1;
  if v_src is distinct from 'subcontractor' then
    raise exception '(و-٧) مصدر السعر «%» بعد الاعتماد — المتوقع subcontractor',
      coalesce(v_src, 'بلا');
  end if;
  if v_cost is distinct from 1000::numeric then
    raise exception '(و-٨) التكلفة المستعملة % — المتوقع ١٠٠٠ (سعر الفئة % في المسار ١)',
      v_cost, v_c1;
  end if;

  -- (و-٩) والاستيراد لا يعدّل مساراً معتمداً — يرفضه برسالة لا يبتلعه
  perform set_config('request.jwt.claim.sub', v_pa::text, false);
  select r.reason into v_msg
  from public.import_price_sheet_rows(
    v_sheet,
    jsonb_build_array(jsonb_build_object(
      'title', 'PS مسار ١', 'originLabel', 'PS_ALPHA',
      'originLat', 25.5, 'originLng', 27.5,
      'destLabel', 'PS_BETA', 'destLat', 26.5, 'destLng', 29.0,
      'prices', jsonb_build_object(v_c1, 1))),
    true) r
  where r.row_no = 1;
  if coalesce(v_msg, '') not like '%معتمد%' then
    raise exception '(و-٩) الاستيراد قبل تعديل مسار معتمد — السبب المُعاد: %',
      coalesce(v_msg, 'لا سبب');
  end if;

  select pli.cost into v_cost
  from public.price_list_items pli
  join public.price_lists pl on pl.id = pli.price_list_id
  where pl.sheet_id = v_sheet and pl.title = 'PS مسار ١' and pli.class_slug = v_c1;
  if v_cost is distinct from 1000::numeric then
    raise exception '(و-١٠) 🔴 تكلفة مسار معتمد تغيّرت إلى % من ملف مستورد', v_cost;
  end if;

  raise notice '✔ (و) اعتمادٌ واحد لأربعة مسارات · بعده وحده يعمل التسعير · والمعتمد محميّ من الاستيراد';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ز) العزل والصلاحيات الحيّة — بدور `authenticated` لا بدور المالك
-- ----------------------------------------------------------------------------
do $$
declare
  v_a      constant uuid := '55ee7000-0000-4000-8000-00000000000a';
  v_b      constant uuid := '55ee7000-0000-4000-8000-00000000000b';
  v_pa     constant uuid := '55ee7002-0000-4000-8000-00000000000a';
  v_pb     constant uuid := '55ee7002-0000-4000-8000-00000000000b';
  v_sheet  uuid := current_setting('tours.ps_sheet')::uuid;
  v_bsheet uuid;
  v_draft  uuid;
  v_theirs integer;
  v_mine   integer;
  v_msg    text;
  v_pol    integer;
begin
  -- (ز-٠) فحص كتالوجي: لا سياسة على price_sheets تستهدف anon
  select count(*) into v_pol
  from pg_policies p
  where p.schemaname = 'public' and p.tablename = 'price_sheets' and 'anon' = any (p.roles);
  if v_pol <> 0 then
    raise exception '(ز-٠) % سياسة على price_sheets تستهدف anon', v_pol;
  end if;

  select count(*) into v_pol
  from pg_policies p where p.schemaname = 'public' and p.tablename = 'price_sheets';
  if v_pol < 4 then
    raise exception '(ز-٠ب) سياسات price_sheets % — المتوقع ٤ على الأقل', v_pol;
  end if;

  -- كشفٌ لـ«ب» حتى تكون قراءته لكشوفه دليلاً حياً لا فراغاً يمرّ
  perform set_config('request.jwt.claim.sub', v_pb::text, false);
  select s.id into v_bsheet from public.upsert_price_sheet(null, 'PS كشف ب', null) s;

  -- (ز-١) بدور authenticated: «ب» يرى كشفه ولا يرى كشف «أ» إطلاقاً
  begin
    execute 'set local role authenticated';
    select count(*) filter (where ps.subcontractor_id = v_a),
           count(*) filter (where ps.subcontractor_id = v_b)
      into v_theirs, v_mine
    from public.price_sheets ps;
    execute 'reset role';
  exception when others then execute 'reset role'; raise;
  end;

  if v_theirs <> 0 then
    raise exception '(ز-١) ثغرة عزل: «ب» رأى % من كشوف «أ»', v_theirs;
  end if;
  if v_mine < 1 then
    raise exception '(ز-١ب) «ب» لا يرى كشفه هو — الاختبار يقيس فراغاً لا عزلاً';
  end if;

  -- (ز-٢) ولا عبر price_sheet_stats — وهي `definer` تتجاوز RLS، وهذا بالضبط
  -- الموضع الذي انكشفت منه قوائم المنافسين في المرحلة ٥
  begin
    execute 'set local role authenticated';
    select count(*) filter (where x.subcontractor_id = v_a),
           count(*) filter (where x.subcontractor_id = v_b)
      into v_theirs, v_mine
    from public.price_sheet_stats(v_a) x;    -- «ب» يطلب كشوف «أ» صراحةً
    execute 'reset role';
  exception when others then execute 'reset role'; raise;
  end;
  if v_theirs <> 0 then
    raise exception '(ز-٢) 🔴 price_sheet_stats سرّبت % كشفاً من متعهد آخر', v_theirs;
  end if;
  if v_mine < 1 then
    raise exception '(ز-٢ب) price_sheet_stats لم تُرجع كشوف «ب» نفسه';
  end if;

  -- (ز-٣) ولا عبر price_sheet_classes
  v_msg := null;
  begin
    execute 'set local role authenticated';
    begin
      perform 1 from public.price_sheet_classes(v_a, null);
    exception when others then v_msg := sqlerrm;
    end;
    execute 'reset role';
  exception when others then execute 'reset role'; raise;
  end;
  if v_msg is null then
    raise exception '(ز-٣) ثغرة: «ب» قرأ فئات «أ» من price_sheet_classes';
  end if;

  -- (ز-٤) ولا يستورد في كشف غيره
  v_msg := null;
  begin
    execute 'set local role authenticated';
    begin
      perform 1 from public.import_price_sheet_rows(
        v_sheet,
        jsonb_build_array(jsonb_build_object(
          'title', 'PS اقتحام', 'originLabel', 'x', 'originLat', 26.0, 'originLng', 28.0,
          'destLabel', 'y', 'destLat', 27.0, 'destLng', 31.0,
          'prices', jsonb_build_object(current_setting('tours.ps_c1'), 10))),
        true);
    exception when others then v_msg := sqlerrm;
    end;
    execute 'reset role';
  exception when others then execute 'reset role'; raise;
  end;
  if v_msg is null or v_msg not like '%غير موجود%' then
    raise exception '(ز-٤) ثغرة: «ب» استورد في كشف «أ» — الرسالة: %',
      coalesce(v_msg, 'لا خطأ');
  end if;
  if exists (select 1 from public.price_lists pl
             where pl.sheet_id = v_sheet and pl.title = 'PS اقتحام') then
    raise exception '(ز-٤ب) 🔴 دخل مسارٌ من متعهد آخر إلى كشف «أ»';
  end if;

  -- (ز-٥) 🔴 والمتعهد لا يعتمد كشفه هو
  perform set_config('request.jwt.claim.sub', v_pa::text, false);
  v_msg := null;
  begin
    execute 'set local role authenticated';
    begin
      perform 1 from public.review_price_sheet(v_sheet, true, 'أعتمد نفسي', 4);
    exception when others then v_msg := sqlerrm;
    end;
    execute 'reset role';
  exception when others then execute 'reset role'; raise;
  end;
  if v_msg is null or v_msg not like '%للمشرف وحده%' then
    raise exception '(ز-٥) 🔴 ثغرة: المتعهد اعتمد كشفه بنفسه — الرسالة: %',
      coalesce(v_msg, 'لا خطأ');
  end if;

  -- (ز-٦) والطبقة الثانية قائمة: الكتابة المباشرة على حالة مسارٍ غير معتمد مرفوضة
  insert into public.price_lists (subcontractor_id, sheet_id, title,
    origin_label, origin_lat, origin_lng, dest_label, dest_lat, dest_lng, status)
  values (v_a, v_sheet, 'PS مسار مسودة', 'd1', 26.0, 28.0, 'd2', 27.0, 31.0, 'draft')
  returning id into v_draft;

  v_msg := null;
  begin
    execute 'set local role authenticated';
    begin
      update public.price_lists set status = 'approved' where id = v_draft;
    exception when others then v_msg := sqlerrm;
    end;
    execute 'reset role';
  exception when others then execute 'reset role'; raise;
  end;
  if v_msg is null then
    raise exception '(ز-٦) 🔴 ثغرة: المتعهد كتب approved مباشرةً على مساره';
  end if;
  if (select pl.status from public.price_lists pl where pl.id = v_draft) <> 'draft' then
    raise exception '(ز-٦ب) 🔴 حالة المسار تغيّرت رغم الرفض';
  end if;

  delete from public.price_lists where id = v_draft;
  delete from public.price_sheets where id = v_bsheet;

  raise notice '✔ (ز) العزل الحي بدور authenticated: لا قراءة ولا استيراد ولا اعتماد ذاتي (طبقتان)';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ح) حارس الملكية وحارس الحذف
-- ----------------------------------------------------------------------------
do $$
declare
  v_a      constant uuid := '55ee7000-0000-4000-8000-00000000000a';
  v_b      constant uuid := '55ee7000-0000-4000-8000-00000000000b';
  v_c      constant uuid := '55ee7000-0000-4000-8000-00000000000c';
  v_sheet  uuid := current_setting('tours.ps_sheet')::uuid;
  v_sheet2 uuid := current_setting('tours.ps_sheet2')::uuid;
  v_msg    text;
  v_id     uuid;
begin
  -- (ح-١) مسارٌ لمتعهد لا يُضم إلى كشف متعهدٍ آخر — ولو بيد مالك القاعدة
  v_msg := null;
  begin
    insert into public.price_lists (subcontractor_id, sheet_id, title,
      origin_label, origin_lat, origin_lng, dest_label, dest_lat, dest_lng)
    values (v_b, v_sheet, 'PS اختراق', 'x', 26.0, 28.0, 'y', 27.0, 31.0);
  exception when others then v_msg := sqlerrm;
  end;
  if v_msg is null then
    raise exception '(ح-١) 🔴 ثغرة: مسار المتعهد «ب» دخل كشف المتعهد «أ»';
  end if;

  -- (ح-٢) كشفٌ فيه مسارٌ معتمد لا يُحذف — ولا حتى بيد مالك القاعدة
  v_msg := null;
  begin
    delete from public.price_sheets where id = v_sheet;
  exception when others then v_msg := sqlerrm;
  end;
  if v_msg is null then
    raise exception '(ح-٢) 🔴 كشفٌ فيه مسار معتمد حُذف — سُحبت تغطية حيّة بصمت';
  end if;
  if not exists (select 1 from public.price_sheets ps where ps.id = v_sheet) then
    raise exception '(ح-٢ب) 🔴 الكشف اختفى رغم رفع الخطأ';
  end if;

  -- (ح-٣) وكشفٌ بلا مسارٍ معتمد يُحذف ومعه مساراته
  delete from public.price_sheets where id = v_sheet2;
  if exists (select 1 from public.price_lists pl where pl.sheet_id = v_sheet2) then
    raise exception '(ح-٣) بقيت مسارات يتيمة بعد حذف الكشف';
  end if;

  -- (ح-٤) وحذف المتعهد نفسه يبقى ممكناً رغم الحارس (تتالٍ لا حذفَ كشف)
  insert into public.subcontractors (id, company_name, phone, status)
  values (v_c, 'PRICE_SHEET_TESTS شركة ج', '01000000003', 'approved');
  insert into public.price_sheets (id, subcontractor_id, title)
  values ('55ee7001-0000-4000-8000-00000000000c', v_c, 'PS كشف ج')
  returning id into v_id;
  insert into public.price_lists (subcontractor_id, sheet_id, title,
    origin_label, origin_lat, origin_lng, dest_label, dest_lat, dest_lng, status)
  values (v_c, v_id, 'PS مسار ج', 'g1', 26.0, 28.0, 'g2', 27.0, 31.0, 'approved');

  delete from public.subcontractors where id = v_c;
  if exists (select 1 from public.price_sheets ps where ps.id = v_id) then
    raise exception '(ح-٤) حذف المتعهد لم يتتالَ على كشفه — الحارس منع تتالياً مشروعاً';
  end if;

  raise notice '✔ (ح) الملكية محروسة · الكشف المعتمد لا يُحذف · وحذف المتعهد يتتالى';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ط) الصلاحيات كتالوجياً — صفرٌ لـ anon على الجدول وعلى الدوال الست
-- ----------------------------------------------------------------------------
do $$
declare
  v_bad  text;
  v_sigs text[] := array[
    'public.price_sheet_classes(uuid, uuid)',
    'public.upsert_price_sheet(uuid, text, text, uuid)',
    'public.import_price_sheet_rows(uuid, jsonb, boolean, uuid)',
    'public.submit_price_sheet(uuid)',
    'public.review_price_sheet(uuid, boolean, text, integer)',
    'public.price_sheet_stats(uuid)'
  ];
  v_sig  text;
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    raise exception '(ط) دور anon غير موجود — لا يمكن قياس ما يراه الزائر على هذه القاعدة';
  end if;

  foreach v_sig in array v_sigs loop
    if has_function_privilege('anon', v_sig, 'execute') then
      raise exception '(ط-١) anon يستطيع تنفيذ % — تكلفة المتعهد سرٌّ تجاري', v_sig;
    end if;
    if not has_function_privilege('authenticated', v_sig, 'execute') then
      raise exception '(ط-٢) authenticated لا يستطيع تنفيذ % — البورتال لن يعمل', v_sig;
    end if;
  end loop;

  select string_agg(x.p, '، ') into v_bad
  from (values ('select'), ('insert'), ('update'), ('delete'), ('truncate')) as x(p)
  where has_table_privilege('anon', 'public.price_sheets', x.p);
  if v_bad is not null then
    raise exception '(ط-٣) anon يملك % على price_sheets', v_bad;
  end if;

  if not (select relrowsecurity from pg_class where oid = 'public.price_sheets'::regclass) then
    raise exception '(ط-٤) RLS غير مفعّلة على price_sheets';
  end if;

  raise notice '✔ (ط) صفرٌ لـ anon جدولاً ودوالّاً · RLS مفعّلة · authenticated يعمل';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ي) صدق الاستيراد — الخانة الفارغة، والقيمة غير المفهومة، والعمود المكرّر،
--     والفئة الساقطة. وكل تأكيد هنا **مسبوقٌ بإثبات أنه ليس أعمى**: يُعاد بناء
--     الحكم القديم بحرفه ويُظهَر أنه يُنتج العيب، فيصير نجاح الجديد دليلاً لا زينة.
-- ----------------------------------------------------------------------------

-- الحكم القديم على عمود الاتجاهين — نصُّ 0102:581 بحرفه، للمقارنة لا للاستعمال
create function pg_temp.ps_legacy_bidi(p text) returns boolean
language sql immutable as $$
  select lower(btrim(coalesce(p, 'true'))) in ('true', 't', '1', 'نعم', 'yes', 'y');
$$;

do $$
declare
  v_pa    constant uuid := '55ee7002-0000-4000-8000-00000000000a';
  v_c1    text := current_setting('tours.ps_c1');
  v_sheet uuid;
  v_rows  jsonb;
  v_got   boolean;
  v_why   text;
  v_acc   boolean;
begin
  perform set_config('request.jwt.claim.sub', v_pa::text, false);
  select s.id into v_sheet from public.upsert_price_sheet(null, 'PS كشف الصدق', null) s;
  perform set_config('tours.ps_sheet3', v_sheet::text, false);

  -- (ي-٠) 🔴 إثبات أن ما بعده ليس أعمى: الحكم القديم **يُنتج العيب** على نفس المدخلات
  if pg_temp.ps_legacy_bidi('') is not false then
    raise exception '(ي-٠) الحكم القديم لا يقلب الخانة الفارغة — فالتأكيد التالي لا يفرّق قديماً من جديد';
  end if;
  if pg_temp.ps_legacy_bidi('   ') is not false then
    raise exception '(ي-٠ب) الحكم القديم لا يقلب المسافات — الفرضية خاطئة';
  end if;
  if pg_temp.ps_legacy_bidi(null) is not true then
    raise exception '(ي-٠ج) الحكم القديم لم يكن يُعطي الاتجاهين عند غياب العمود — الفرضية خاطئة';
  end if;
  if pg_temp.ps_legacy_bidi('maybe') is not false then
    raise exception '(ي-٠د) الحكم القديم لا يقلب القيمة المبهمة — الفرضية خاطئة';
  end if;

  -- (ي-١) المصفوفة كاملةً في ملفٍ واحد
  v_rows := jsonb_build_array(
    jsonb_build_object('title', 'PS اتجاه فارغ', 'originLabel', 'PS_SDQ_A',
      'originLat', 23.5, 'originLng', 30.5, 'destLabel', 'PS_SDQ_B',
      'destLat', 24.5, 'destLng', 32.0, 'bidirectional', '',
      'prices', jsonb_build_object(v_c1, 100)),
    jsonb_build_object('title', 'PS اتجاه مسافات', 'originLabel', 'PS_SDQ_A',
      'destLabel', 'PS_SDQ_B', 'bidirectional', '   ',
      'prices', jsonb_build_object(v_c1, 100)),
    jsonb_build_object('title', 'PS اتجاه غائب', 'originLabel', 'PS_SDQ_A',
      'destLabel', 'PS_SDQ_B',
      'prices', jsonb_build_object(v_c1, 100)),
    jsonb_build_object('title', 'PS اتجاه صريح', 'originLabel', 'PS_SDQ_A',
      'destLabel', 'PS_SDQ_B', 'bidirectional', 'true',
      'prices', jsonb_build_object(v_c1, 100)),
    jsonb_build_object('title', 'PS اتجاه نعم', 'originLabel', 'PS_SDQ_A',
      'destLabel', 'PS_SDQ_B', 'bidirectional', 'نعم',
      'prices', jsonb_build_object(v_c1, 100)),
    jsonb_build_object('title', 'PS اتجاه واحد', 'originLabel', 'PS_SDQ_A',
      'destLabel', 'PS_SDQ_B', 'bidirectional', 'false',
      'prices', jsonb_build_object(v_c1, 100)),
    jsonb_build_object('title', 'PS اتجاه لا', 'originLabel', 'PS_SDQ_A',
      'destLabel', 'PS_SDQ_B', 'bidirectional', 'لا',
      'prices', jsonb_build_object(v_c1, 100)),
    jsonb_build_object('title', 'PS اتجاه مبهم', 'originLabel', 'PS_SDQ_A',
      'destLabel', 'PS_SDQ_B', 'bidirectional', 'maybe',
      'prices', jsonb_build_object(v_c1, 100))
  );

  perform 1 from public.import_price_sheet_rows(v_sheet, v_rows, true);

  -- 🔴 الفارغ والمسافات والغياب: ثلاثتها الاتجاهان. وهذا بالضبط ما كان ينقلب.
  for v_why, v_got in
    select pl.title, pl.bidirectional from public.price_lists pl
    where pl.sheet_id = v_sheet and pl.title in
      ('PS اتجاه فارغ', 'PS اتجاه مسافات', 'PS اتجاه غائب', 'PS اتجاه صريح', 'PS اتجاه نعم')
  loop
    if v_got is not true then
      raise exception '(ي-١) 🔴 «%» صار اتجاهاً واحداً — رحلة العودة تخرج من التغطية وتُسعَّر بالتعريفة',
        v_why;
    end if;
  end loop;

  -- ولا يقع العكس: «لا» و«false» تعنيان اتجاهاً واحداً فعلاً
  for v_why, v_got in
    select pl.title, pl.bidirectional from public.price_lists pl
    where pl.sheet_id = v_sheet and pl.title in ('PS اتجاه واحد', 'PS اتجاه لا')
  loop
    if v_got is not false then
      raise exception '(ي-٢) «%» صار الاتجاهين رغم أن الملف يقول لا', v_why;
    end if;
  end loop;

  -- (ي-٣) والقيمة المكتوبة غير المفهومة **تُرفض** ولا تُفسَّر
  select r.accepted, r.reason into v_acc, v_why
  from public.import_price_sheet_rows(v_sheet, v_rows, false) r where r.row_no = 8;
  if v_acc is not false then
    raise exception '(ي-٣) 🔴 «maybe» قُبلت — قيمةٌ مبهمة تقلب المسار صامتاً كما كان';
  end if;
  if v_why not like '%maybe%' or v_why not like '%الاتجاهين%' then
    raise exception '(ي-٣ب) سبب رفض القيمة المبهمة «%» لا يسمّيها ولا يسمّي العمود', v_why;
  end if;
  if exists (select 1 from public.price_lists pl
             where pl.sheet_id = v_sheet and pl.title = 'PS اتجاه مبهم') then
    raise exception '(ي-٣ج) دخل صفُّ القيمة المبهمة رغم رفضه';
  end if;

  raise notice '✔ (ي-١..٣) الخانة الفارغة = الاتجاهان (والقديم كان يقلبها) · والمبهم يُرفض بالاسم';
end;
$$;

do $$
declare
  v_pa    constant uuid := '55ee7002-0000-4000-8000-00000000000a';
  v_c1    text := current_setting('tours.ps_c1');
  v_c2    text := current_setting('tours.ps_c2');
  v_sheet uuid := current_setting('tours.ps_sheet3')::uuid;
  v_why   text;
  v_acc   boolean;
  v_saved integer;
  v_cnt   integer;
  v_dup   jsonb;
  v_row   jsonb;
begin
  perform set_config('request.jwt.claim.sub', v_pa::text, false);

  -- (ي-٤) عمودا فئةٍ يؤولان إلى slug واحد: يُلتقطان في **الفحص** برسالة عربية،
  -- لا عند الكتابة بنصّ Postgres الإنجليزي الذي لا يقرؤه متعهد.
  v_dup := jsonb_build_array(
    jsonb_build_object('title', 'PS فئة مكرّرة', 'originLabel', 'PS_SDQ_A',
      'destLabel', 'PS_SDQ_B',
      'prices', jsonb_build_object(v_c1, 100, upper(v_c1), 200)));

  select r.accepted, r.reason into v_acc, v_why
  from public.import_price_sheet_rows(v_sheet, v_dup, false) r where r.row_no = 1;
  if v_acc is not false then
    raise exception '(ي-٤) 🔴 الفحص قبل عمودَي فئةٍ مكرّرين — والكتابة ستفشل بنصّ إنجليزي';
  end if;
  if v_why not like '%' || v_c1 || '%' then
    raise exception '(ي-٤ب) سبب رفض العمود المكرّر «%» لا يسمّي الفئة %', v_why, v_c1;
  end if;
  if v_why like '%ON CONFLICT%' or v_why like '%cannot affect row%' then
    raise exception '(ي-٤ج) 🔴 نصّ Postgres الإنجليزي ما زال يصل المتعهد: %', v_why;
  end if;

  -- والتنفيذ يقول الشيء نفسه حرفاً، ولا صفَّ يُكتب
  select r.accepted, r.reason into v_acc, v_why
  from public.import_price_sheet_rows(v_sheet, v_dup, true) r where r.row_no = 1;
  if v_acc is not false or v_why like '%ON CONFLICT%' then
    raise exception '(ي-٤د) التنفيذ خالف الفحص على العمود المكرّر: قبول=% سبب=%', v_acc, v_why;
  end if;
  if exists (select 1 from public.price_lists pl
             where pl.sheet_id = v_sheet and pl.title = 'PS فئة مكرّرة') then
    raise exception '(ي-٤هـ) دخل صفُّ العمود المكرّر رغم رفضه';
  end if;

  -- (ي-٥) 🔴 إعادة استيرادٍ تُسقط فئةً مسعَّرة: تبقى الدلالة (الملف هو الحقيقة)
  -- ويُرفع الصوت — تنبيهٌ يسمّي الفئة وتكلفتها، **في الفحص كما في التنفيذ**.
  v_row := jsonb_build_object('title', 'PS إعادة استيراد', 'originLabel', 'PS_SDQ_A',
    'destLabel', 'PS_SDQ_B', 'prices', jsonb_build_object(v_c1, 100, v_c2, 200));
  perform 1 from public.import_price_sheet_rows(v_sheet, jsonb_build_array(v_row), true);

  select count(*) into v_cnt
  from public.price_list_items pli
  join public.price_lists pl on pl.id = pli.price_list_id
  where pl.sheet_id = v_sheet and pl.title = 'PS إعادة استيراد';
  if v_cnt <> 2 then
    raise exception '(ي-٥) التركيب فشل: المسار يحمل % فئة والمتوقع ٢', v_cnt;
  end if;

  -- 🔑 المميِّز الذي يمنع التنبيه من أن يكون زينةً: ملفٌّ **لا يُسقط شيئاً** لا ينبّه.
  -- (‏تنبيهٌ يرنّ دائماً لا يُسمع — نمطٌ موثَّق في handover/LESSONS.md)
  select r.reason into v_why
  from public.import_price_sheet_rows(v_sheet, jsonb_build_array(v_row), false) r
  where r.row_no = 1;
  if v_why is not null then
    raise exception '(ي-٥ب) تنبيهٌ على إعادة استيرادٍ لا تُسقط شيئاً: %', v_why;
  end if;

  v_row := v_row || jsonb_build_object('prices', jsonb_build_object(v_c1, 150));

  select r.reason into v_why
  from public.import_price_sheet_rows(v_sheet, jsonb_build_array(v_row), false) r
  where r.row_no = 1;
  if v_why is null then
    raise exception '(ي-٥ج) 🔴 الفحص لا ينبّه إلى سقوط الفئة % — المتعهد يضغط «استيراد» وهو لا يعلم',
      v_c2;
  end if;
  if v_why not like '%' || v_c2 || '%' then
    raise exception '(ي-٥د) التنبيه «%» لا يسمّي الفئة الساقطة %', v_why, v_c2;
  end if;
  if v_why not like '%200%' then
    raise exception '(ي-٥هـ) التنبيه «%» لا يذكر التكلفة التي ستُفقد', v_why;
  end if;

  select r.accepted, r.classes_saved, r.reason into v_acc, v_saved, v_why
  from public.import_price_sheet_rows(v_sheet, jsonb_build_array(v_row), true) r
  where r.row_no = 1;
  if v_acc is not true or v_saved <> 1 then
    raise exception '(ي-٥و) التنفيذ: قبول=% فئات=% — المتوقع قبولٌ بفئة واحدة', v_acc, v_saved;
  end if;
  if v_why is null or v_why not like '%' || v_c2 || '%' then
    raise exception '(ي-٥ز) التنفيذ لم يحمل التنبيه نفسه: %', coalesce(v_why, 'بلا');
  end if;

  select count(*) into v_cnt
  from public.price_list_items pli
  join public.price_lists pl on pl.id = pli.price_list_id
  where pl.sheet_id = v_sheet and pl.title = 'PS إعادة استيراد';
  if v_cnt <> 1 then
    raise exception '(ي-٥ح) بعد إعادة الاستيراد % فئة — المتوقع ١ (الملف هو الحقيقة)', v_cnt;
  end if;

  raise notice '✔ (ي-٤..٥) العمود المكرّر يُرفض بالعربية · والفئة الساقطة تُسمّى بتكلفتها فحصاً وتنفيذاً';
end;
$$;

do $$
declare
  v_pa    constant uuid := '55ee7002-0000-4000-8000-00000000000a';
  v_c1    text := current_setting('tours.ps_c1');
  v_sheet uuid := current_setting('tours.ps_sheet3')::uuid;
  v_why   text;
  v_acc   boolean;
  v_hits  integer;
  v_src   text;
begin
  perform set_config('request.jwt.claim.sub', v_pa::text, false);

  -- (ي-٦) نصٌّ مكتوبٌ لا يتحوّل إلى رقم لا يُعامَل معاملة الفراغ: كان النطاق
  -- الفاسد يصير ٢٥ كم صامتاً، والإحداثية الفاسدة تُحلّ من نقطةٍ أخرى بنفس الاسم.
  select r.accepted, r.reason into v_acc, v_why
  from public.import_price_sheet_rows(v_sheet, jsonb_build_array(
    jsonb_build_object('title', 'PS نطاق فاسد', 'originLabel', 'PS_SDQ_A',
      'destLabel', 'PS_SDQ_B', 'originRadiusKm', 'خمسة وعشرون',
      'prices', jsonb_build_object(v_c1, 100))), false) r
  where r.row_no = 1;
  if v_acc is not false then
    raise exception '(ي-٦) 🔴 نطاقٌ غير رقمي قُبل — سيصير ٢٥ كم صامتة';
  end if;
  if v_why not like '%خمسة وعشرون%' then
    raise exception '(ي-٦ب) سبب رفض النطاق «%» لا يعرض ما كتبه المتعهد', v_why;
  end if;

  select r.accepted, r.reason into v_acc, v_why
  from public.import_price_sheet_rows(v_sheet, jsonb_build_array(
    jsonb_build_object('title', 'PS إحداثية فاسدة', 'originLabel', 'PS_SDQ_A',
      'originLat', '23,5', 'originLng', 30.5,
      'destLabel', 'PS_SDQ_B', 'prices', jsonb_build_object(v_c1, 100))), false) r
  where r.row_no = 1;
  if v_acc is not false then
    raise exception '(ي-٦ج) 🔴 إحداثيةٌ فاسدة قُبلت — ستُحلّ من نقطةٍ أخرى بنفس الاسم بلا كلمة';
  end if;
  if v_why not like '%23,5%' then
    raise exception '(ي-٦د) سبب رفض الإحداثية «%» لا يعرض ما كتبه المتعهد', v_why;
  end if;

  -- (ي-٧) و`NaN` تسقط في كل موضعٍ رقمي — لا تكلفةً ولا نطاقاً
  select r.accepted into v_acc
  from public.import_price_sheet_rows(v_sheet, jsonb_build_array(
    jsonb_build_object('title', 'PS تكلفة NaN', 'originLabel', 'PS_SDQ_A',
      'destLabel', 'PS_SDQ_B', 'prices', jsonb_build_object(v_c1, 'NaN'))), false) r
  where r.row_no = 1;
  if v_acc is not false then
    raise exception '(ي-٧) 🔴 تكلفة NaN قُبلت';
  end if;

  select r.accepted into v_acc
  from public.import_price_sheet_rows(v_sheet, jsonb_build_array(
    jsonb_build_object('title', 'PS نطاق NaN', 'originLabel', 'PS_SDQ_A',
      'destLabel', 'PS_SDQ_B', 'originRadiusKm', 'NaN',
      'prices', jsonb_build_object(v_c1, 100))), false) r
  where r.row_no = 1;
  if v_acc is not false then
    raise exception '(ي-٧ب) 🔴 نطاق NaN قُبل';
  end if;

  -- (ي-٨) 🔴 الضمانة التي لا تتحرّك: كشفٌ غير معتمد لا يُسعّر ولا يُبثّ.
  -- تُقاس على الكشف الجديد نفسه وهو مسوَّدات — لا على كشفٍ سبق اعتماده.
  select count(*) into v_hits
  from public.coverage_matches(23.5, 30.5, 24.5, 32.0) cm
  join public.price_lists pl on pl.id = cm.price_list_id
  where pl.sheet_id = v_sheet;
  if v_hits <> 0 then
    raise exception '(ي-٨) 🔴 كشفٌ غير معتمد يطابق التغطية % مرة — يجب صفر', v_hits;
  end if;

  select q.price_source into v_src
  from public.quote_price(400, 1, false, 0, 23.5, 30.5, 24.5, 32.0, 0) q
  where q.class_slug = v_c1;
  if v_src is distinct from 'tariff' then
    raise exception '(ي-٨ب) 🔴 مصدر السعر «%» على مسارٍ لم يُعتمد — المتوقع tariff',
      coalesce(v_src, 'بلا');
  end if;

  raise notice '✔ (ي-٦..٨) الرقم الفاسد يُسمّى ولا يُفترض · وNaN تسقط · والكشف غير المعتمد صفرُ تغطية وصفرُ بثّ';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ك) 🔴 الاعتماد لا يتجاوز ما عُرض — عند حجم المالك بالضبط
--
-- السيناريو المقيس حيّاً 2026-08-18: كشفٌ بـ١٢٠ مساراً، الطابور يعرض ١٠٠ (سقفٌ
-- **عالميّ** على `price_lists`)، و`review_price_sheet` تعتمد ١٢٠ ⇒ عشرون تكلفة
-- لم يرها أحد تدخل `coverage_matches` وتُسعّر عروضاً حقيقية.
-- ----------------------------------------------------------------------------
do $$
declare
  v_a      constant uuid := '55ee7000-0000-4000-8000-00000000000a';
  v_pa     constant uuid := '55ee7002-0000-4000-8000-00000000000a';
  v_padm   constant uuid := '55ee7002-0000-4000-8000-0000000000ad';
  v_c1     text := current_setting('tours.ps_c1');
  v_sheet  uuid;
  v_sub    record;
  v_rev    record;
  v_shown  integer;
  v_pend   integer;
  v_appr   integer;
  v_msg    text;
  v_hint   text;
  v_ids    uuid[];
  v_n      integer;
  v_def    text;
begin
  perform set_config('request.jwt.claim.sub', v_pa::text, false);
  select s.id into v_sheet from public.upsert_price_sheet(null, 'PS كشف كبير', null) s;

  -- ١٢٠ مساراً — تُبنى مباشرةً لا عبر المستورد (المستورد مُختبَرٌ في (ب) و(ج)،
  -- والمقصود هنا حجم الدفعة لا طريق دخولها)
  insert into public.price_lists (subcontractor_id, sheet_id, title,
    origin_label, origin_lat, origin_lng, origin_radius_km,
    dest_label, dest_lat, dest_lng, dest_radius_km, status)
  select v_a, v_sheet, 'PS كبير ' || lpad(g::text, 3, '0'),
         'PS_BIG_A', 23.9, 30.9, 10, 'PS_BIG_B', 24.1, 31.1, 10, 'draft'
  from generate_series(1, 120) g;

  insert into public.price_list_items (price_list_id, class_slug, cost)
  select pl.id, v_c1, 100
  from public.price_lists pl where pl.sheet_id = v_sheet;

  select * into v_sub from public.submit_price_sheet(v_sheet);
  if v_sub.submitted <> 120 then
    raise exception '(ك-٠) التركيب: أُرسل % مساراً والمتوقع ١٢٠', v_sub.submitted;
  end if;

  select count(*) into v_pend
  from public.price_lists pl where pl.sheet_id = v_sheet and pl.status = 'pending';
  if v_pend <> 120 then
    raise exception '(ك-٠ب) في الكشف % مساراً منتظراً والمتوقع ١٢٠', v_pend;
  end if;

  -- (ك-١) 🔑 إثبات أن السيناريو حقيقي: استعلام الطابور القديم بنصّه
  -- (`status='pending' order by created_at asc limit 100` عبر **كل** المتعهدين)
  -- يعرض من هذا الكشف أقلّ ممّا فيه. بدون هذا التأكيد يكون ما بعده حبراً.
  select count(*) into v_shown
  from (select pl.id from public.price_lists pl
         where pl.status = 'pending'
         order by pl.created_at asc
         limit 100) q
  join public.price_lists pl2 on pl2.id = q.id
  where pl2.sheet_id = v_sheet;
  if v_shown >= v_pend then
    raise exception '(ك-١) السقف القديم لا يقتطع هذا الكشف (عرض % من %) — الاختبار يقيس فراغاً',
      v_shown, v_pend;
  end if;

  -- (ك-٢) نداءٌ بعددٍ أقلّ ممّا في الكشف ⇒ **لا كتابة إطلاقاً**، ورمزٌ مخصَّص
  perform set_config('request.jwt.claim.sub', v_padm::text, false);
  v_msg := null; v_hint := null;
  begin
    perform 1 from public.review_price_sheet(v_sheet, true, 'دفعة', v_shown);
  exception when others then
    v_msg := sqlerrm;
    get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if v_msg is null then
    raise exception '(ك-٢) 🔴 اعتُمدت دفعةٌ أوسع ممّا عُرض (% من %) بلا اعتراض', v_shown, v_pend;
  end if;
  if v_hint is distinct from 'count-changed' then
    raise exception '(ك-٢ب) رمز الخطأ «%» — المتوقع count-changed فتعرف الواجهة ما تقول',
      coalesce(v_hint, 'بلا');
  end if;
  if v_msg not like '%' || v_shown::text || '%' or v_msg not like '%' || v_pend::text || '%' then
    raise exception '(ك-٢ج) الرسالة «%» لا تحمل الرقمين (% و%)', v_msg, v_shown, v_pend;
  end if;

  select count(*) into v_appr
  from public.price_lists pl where pl.sheet_id = v_sheet and pl.status = 'approved';
  if v_appr <> 0 then
    raise exception '(ك-٢د) 🔴 كُتبت % حالة رغم رفض النداء — الرفض يجب أن يكون كليّاً', v_appr;
  end if;

  -- (ك-٣) ونداءٌ **لا يقول عدداً أصلاً** مرفوض: لا طريق للاعتماد بلا تصريح بالعدد
  v_msg := null;
  begin
    perform 1 from public.review_price_sheet(v_sheet, true, 'دفعة');
  exception when others then v_msg := sqlerrm;
  end;
  if v_msg is null then
    raise exception '(ك-٣) 🔴 نداءٌ بلا p_expected اعتمد الدفعة — الضمانة اختيارية لا بنيوية';
  end if;

  -- (ك-٣ب) والتوقيع الثلاثي **غير موجود**: لا بابَ خلفياً إلى السلوك القديم
  if to_regprocedure('public.review_price_sheet(uuid, boolean, text)') is not null then
    raise exception '(ك-٣ب) 🔴 التوقيع الثلاثي ما زال قائماً — النداء القديم يعتمد كل شيء';
  end if;

  select count(*) into v_appr
  from public.price_lists pl where pl.sheet_id = v_sheet and pl.status = 'approved';
  if v_appr <> 0 then
    raise exception '(ك-٣ج) كُتبت % حالة من نداءٍ بلا عدد', v_appr;
  end if;

  -- (ك-٤) 🔑 وإثباتٌ أن السلوك القديم كان **يكتب أكثر ممّا يُعرض**: تُشغَّل جملته
  -- بحرفها، ويُقاس أثرها، ثم تُعاد. بدونه يبقى «الإصلاح» ادّعاءً بلا خط أساس.
  select coalesce(array_agg(pl.id), '{}'::uuid[]) into v_ids
  from public.price_lists pl where pl.sheet_id = v_sheet and pl.status = 'pending';

  update public.price_lists pl
     set status = 'approved', review_note = 'خط أساس', reviewed_at = now()
   where pl.sheet_id = v_sheet and pl.status = 'pending';
  get diagnostics v_n = row_count;

  if v_n <= v_shown then
    raise exception '(ك-٤) الجملة القديمة كتبت % وهو ليس أوسع من المعروض % — الفرضية خاطئة',
      v_n, v_shown;
  end if;

  update public.price_lists pl
     set status = 'pending', review_note = null, reviewed_at = null
   where pl.id = any (v_ids);

  select count(*) into v_pend
  from public.price_lists pl where pl.sheet_id = v_sheet and pl.status = 'pending';
  if v_pend <> 120 then
    raise exception '(ك-٤ب) إعادة خط الأساس فشلت: % منتظراً بدل ١٢٠', v_pend;
  end if;

  -- (ك-٥) وبالعدد الصحيح: يُكتب، والمكتوب **يساوي المُعلن** لا يزيد
  select * into v_rev from public.review_price_sheet(v_sheet, true, 'دفعة كاملة', 120);
  if v_rev.affected <> 120 then
    raise exception '(ك-٥) أثّرت في % والمُعلن ١٢٠', v_rev.affected;
  end if;
  select count(*) into v_appr
  from public.price_lists pl where pl.sheet_id = v_sheet and pl.status = 'approved';
  if v_appr <> 120 then
    raise exception '(ك-٥ب) المعتمد % بينما الدالة قالت %', v_appr, v_rev.affected;
  end if;

  -- (ك-٦) والكتابة تقع على صفوفٍ **مقفولة بأعيانها** لا على شرطٍ يُعاد تقييمه —
  -- فحصٌ على الجسم الحيّ (D-58) لأن السباق الحقيقي لا يُصطنع داخل جلسة واحدة.
  v_def := pg_get_functiondef(
    to_regprocedure('public.review_price_sheet(uuid, boolean, text, integer)'));
  if v_def not like '%any (v_ids)%' then
    raise exception '(ك-٦) الدالة لم تعد تكتب على المصفوفة المقفولة — صفٌّ يصير pending بعد العدّ قد يُعتمد';
  end if;
  if v_def not like '%for update%' then
    raise exception '(ك-٦ب) الدالة لم تعد تقفل الصفوف قبل العدّ';
  end if;

  raise notice '✔ (ك) كشفٌ بـ١٢٠: القديم يكتب ١٢٠ ويعرض % · والجديد لا يكتب حرفاً إلا بالعدد المطابق',
    v_shown;
end;
$$;

-- ----------------------------------------------------------------------------
-- التنظيف النهائي — لا صفّ fixture يبقى
-- ----------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '', false);

delete from public.price_list_items pli
 where pli.price_list_id in (
   select pl.id from public.price_lists pl
   join public.subcontractors s on s.id = pl.subcontractor_id
   where s.company_name like 'PRICE_SHEET_TESTS%');
delete from public.price_lists pl
 where pl.subcontractor_id in (
   select s.id from public.subcontractors s where s.company_name like 'PRICE_SHEET_TESTS%');
delete from public.price_sheets ps
 where ps.subcontractor_id in (
   select s.id from public.subcontractors s where s.company_name like 'PRICE_SHEET_TESTS%');
delete from public.subcontractors s where s.company_name like 'PRICE_SHEET_TESTS%';
delete from public.profiles p
 where p.id in ('55ee7002-0000-4000-8000-00000000000a'::uuid,
                '55ee7002-0000-4000-8000-00000000000b'::uuid,
                '55ee7002-0000-4000-8000-0000000000ad'::uuid);
do $$
begin
  delete from auth.users u
   where u.id in ('55ee7002-0000-4000-8000-00000000000a'::uuid,
                  '55ee7002-0000-4000-8000-00000000000b'::uuid,
                  '55ee7002-0000-4000-8000-0000000000ad'::uuid);
exception when others then null;
end;
$$;

-- تحقّق أن التنظيف تمّ فعلاً — مجموعة تترك صفوفاً خلفها عيبٌ موثَّق في هذا المستودع
do $$
declare
  v_left integer;
begin
  select count(*) into v_left from public.subcontractors s
   where s.company_name like 'PRICE_SHEET_TESTS%';
  if v_left <> 0 then
    raise exception 'تنظيف ناقص: بقي % متعهد fixture', v_left;
  end if;

  select count(*) into v_left from public.price_sheets ps where ps.title like 'PS %';
  if v_left <> 0 then
    raise exception 'تنظيف ناقص: بقي % كشف fixture', v_left;
  end if;

  select count(*) into v_left from public.price_lists pl where pl.title like 'PS %';
  if v_left <> 0 then
    raise exception 'تنظيف ناقص: بقي % مسار fixture', v_left;
  end if;

  raise notice '✔ التنظيف: صفر صفوف fixture باقية';
end;
$$;

do $$
begin
  raise notice 'ALL PASSED';
end;
$$;
