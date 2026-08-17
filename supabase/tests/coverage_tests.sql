-- ============================================================================
-- coverage_tests.sql — اختبارات قبول للتغطية الجغرافية والهامش ولقطة الحجز
--                      (المرحلة ٥: هجرة 0010_subcontractors.sql)
--
-- كيف تشغّله: افتح SQL Editor في لوحة Supabase، الصق الملف كاملاً واضغط Run.
-- النجاح = آخر سطر في الرسائل «ALL PASSED». أي فشل يرمي exception برسالة عربية
-- تحدد الاختبار والقيمة المتوقعة والفعلية.
--
-- ومن psql بدور صاحب القاعدة **لا بد** من الخيار ON_ERROR_STOP، وإلا تابع psql
-- بعد الكتلة الفاشلة وطبع «ALL PASSED» رغم وجود فشل:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/coverage_tests.sql
--
-- قابل لإعادة التنفيذ بلا حدود:
--   • كل صفوف الاختبار بمعرّفات ثابتة تبدأ بـ c0/c1/c2، وتُمسح في بداية الملف
--     ونهايته معاً (فحتى لو انهار تشغيل سابق في المنتصف يبدأ التالي من أرض نظيفة).
--   • ما يعدّله مؤقتاً (الذروة وإعدادات الهامش) يُعاد كما كان حتى عند الفشل.
--   • حجوزات الاختبار موسومة بـ COVERAGE_TESTS_FIXTURE داخل لقطة الرحلة.
--
-- الاختبارات لا تفترض تعريفة مثبتة ولا فئات بعينها: تستخرج الفئتين المؤهلتين من
-- المحرك نفسه وتعيد اشتقاق كل رقم متوقع من tariffs ومن إعدادات الهامش الحية،
-- فتبقى صحيحة بعد أن يعاير المالك الأسعار من اللوحة.
--
-- الأقسام:
--   (أ) مثال الرؤية: القاهرة ← الإسكندرية بنطاقاته يغطي مصر الجديدة ← المعمورة
--       ولا يغطي القاهرة ← أسوان
--   (ب) ثنائية الاتجاه: المعكوس يطابق ويُعلَّم reversed، وإطفاؤها يمنع المطابقة
--   (ج) الاستبعاد: متعهد غير معتمد وقائمة غير معتمدة لا يظهر سعرهما إطلاقاً
--   (د) تعدد المتعهدين ← الأرخص يفوز
--   (هـ) الهامش: نسبة، مبلغ ثابت، وأرضية الحد الأدنى
--   (و) المسار المتعهَّد مقابل التعريفة لفئة بلا تغطية — في نفس الاستدعاء
--   (ز) الذروة تتراكم فوق سعر مصدره متعهد
--   (ح) عزل RLS: المتعهد «أ» لا يرى قوائم «ب» ولا يغيّر حالته ولا يعتمد قائمته
--   (ط) لقطة الحجز: price_source و subcontractor_id و التكلفة والهامش
--   (ي) الصلاحيات كتالوجياً + تنقيح الأرقام الداخلية عن مفتاح anon
--   (ك) دورة الاعتماد: إنشاء ← إرسال ← اعتماد ← تعديل يعيدها pending
--
-- المرجع: lib/subcontractor-types.ts (العقد) + docs/VISION.md («المتعهدون» و«آلية
--         التسعير») + supabase/migrations/0010_subcontractors.sql.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (٠) الشروط المسبقة + تنظيف أي بقايا + معطيات التشغيل
-- ----------------------------------------------------------------------------
do $$
declare
  v_missing text;
  v_classes text[];
  v_rows    integer;
begin
  -- الدوال المطلوبة
  select string_agg(x.sig, '، ')
    into v_missing
  from (values
    ('public.current_subcontractor_id()'),
    ('public.current_subcontractor_status()'),
    ('public.coverage_matches(numeric, numeric, numeric, numeric)'),
    ('public.upsert_price_list(uuid, text, text, numeric, numeric, numeric, text, numeric, numeric, numeric, boolean, jsonb, uuid)'),
    ('public.submit_price_list(uuid)'),
    ('public.review_price_list(uuid, boolean, text)'),
    ('public.quote_price(numeric, integer, boolean, numeric)'),
    ('public.quote_price(numeric, integer, boolean, numeric, numeric, numeric, numeric, numeric, integer)'),
    ('public.haversine_km(numeric, numeric, numeric, numeric)')
  ) as x(sig)
  where to_regprocedure(x.sig) is null;

  if v_missing is not null then
    raise exception 'شرط مسبق: دوال مفقودة (نفّذ 0010_subcontractors.sql أولاً): %', v_missing;
  end if;

  -- الجداول المطلوبة
  select string_agg(x.rel, '، ')
    into v_missing
  from (values
    ('public.subcontractors'), ('public.subcontractor_vehicles'),
    ('public.price_lists'), ('public.price_list_items')
  ) as x(rel)
  where to_regclass(x.rel) is null;

  if v_missing is not null then
    raise exception 'شرط مسبق: جداول المرحلة ٥ مفقودة: %', v_missing;
  end if;

  -- أعمدة الهامش في الإعدادات
  select string_agg(x.col, '، ')
    into v_missing
  from (values ('margin_type'), ('margin_value'), ('margin_min_amount')) as x(col)
  where not exists (
    select 1 from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = 'pricing_settings'
      and c.column_name = x.col
  );

  if v_missing is not null then
    raise exception 'شرط مسبق: أعمدة الهامش غير موجودة في pricing_settings: %', v_missing;
  end if;

  -- أعمدة لقطة السعر في الحجوزات
  select string_agg(x.col, '، ')
    into v_missing
  from (values ('price_source'), ('subcontractor_id'), ('subcontractor_cost'), ('margin_amount')) as x(col)
  where not exists (
    select 1 from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = 'bookings'
      and c.column_name = x.col
  );

  if v_missing is not null then
    raise exception 'شرط مسبق: أعمدة لقطة السعر غير موجودة في bookings: %', v_missing;
  end if;

  select count(*) into v_rows from public.pricing_settings;
  if v_rows <> 1 then
    raise exception 'شرط مسبق: pricing_settings يجب أن يحوي صفاً واحداً بالضبط (وجدنا %)', v_rows;
  end if;

  -- تنظيف بقايا تشغيل سابق (الترتيب: إشعارات ← حجوزات ← متعهدون بالتتالي)
  delete from public.notifications n
   where n.payload ->> 'bookingId' in (
         select b.id::text from public.bookings b
          where b.trip ->> 'notes' = 'COVERAGE_TESTS_FIXTURE');
  delete from public.bookings b where b.trip ->> 'notes' = 'COVERAGE_TESTS_FIXTURE';
  delete from public.subcontractors s where s.company_name like 'COVERAGE_TESTS%';
  delete from public.profiles p
   where p.id in ('c2000000-0000-4000-8000-00000000000a'::uuid,
                  'c2000000-0000-4000-8000-00000000000b'::uuid);
  begin
    delete from auth.users u
     where u.id in ('c2000000-0000-4000-8000-00000000000a'::uuid,
                    'c2000000-0000-4000-8000-00000000000b'::uuid);
  exception when others then null;
  end;

  -- الفئتان المؤهلتان لراكب واحد — هما ما يرجعه المحرك فعلاً، لا تخميناً منّا
  select array_agg(q.class_slug order by q.capacity asc)
    into v_classes
  from public.quote_price(200, 1, false, 0) q;

  if v_classes is null or array_length(v_classes, 1) < 1 then
    raise exception 'شرط مسبق: لا فئة سيارة نشطة لها تعريفة — نفّذ بذرة 0005';
  end if;

  perform set_config('tours.cov_c1', v_classes[1], false);
  perform set_config('tours.cov_c2',
    case when array_length(v_classes, 1) >= 2 then v_classes[2] else '' end, false);

  -- الإعدادات الأصلية تُحفظ مرة واحدة وتُعاد في قسم التنظيف
  perform set_config('tours.cov_settings', (
    select jsonb_build_object(
             'peak_enabled', ps.peak_enabled, 'peak_percent', ps.peak_percent,
             'margin_type', ps.margin_type, 'margin_value', ps.margin_value,
             'margin_min_amount', ps.margin_min_amount
           )::text
    from public.pricing_settings ps limit 1
  ), false);

  raise notice '✔ (٠) الشروط المسبقة سليمة — فئة التغطية «%» وفئة التعريفة «%»',
    v_classes[1], coalesce(v_classes[2], 'لا شيء');
end;
$$;

-- ----------------------------------------------------------------------------
-- (٠-ب) هوية المشرف — لازمة لـ review_price_list
-- ----------------------------------------------------------------------------
do $$
declare
  v_admin uuid;
begin
  perform set_config('tours.cov_admin', '', false);
  perform set_config('tours.cov_admin_fixture', '0', false);

  select p.id into v_admin from public.profiles p where p.role = 'admin' limit 1;

  if v_admin is null then
    begin
      v_admin := 'c2000000-0000-4000-8000-0000000000ad'::uuid;
      delete from public.profiles p where p.id = v_admin;
      delete from auth.users u where u.id = v_admin;
      insert into auth.users (id, email) values (v_admin, 'coverage-tests-admin@local.invalid');
      insert into public.profiles (id, role, full_name)
      values (v_admin, 'admin', 'مشرف اختبار مؤقت')
      on conflict (id) do update set role = 'admin';
      perform set_config('tours.cov_admin_fixture', '1', false);
      raise notice '  ↳ أُنشئ مشرف اختبار مؤقت (سيُحذف في النهاية)';
    exception
      when others then
        v_admin := null;
        raise notice '  ↳ تعذّر إنشاء مشرف مؤقت (%) — ستُتخطّى اختبارات المراجعة', sqlerrm;
    end;
  end if;

  if v_admin is not null then
    perform set_config('tours.cov_admin', v_admin::text, false);
    raise notice '✔ (٠-ب) هوية المشرف جاهزة';
  else
    raise notice '⚠ (٠-ب) بلا هوية مشرف — أقسام (ح) و(ك) ستُتخطّى جزئياً';
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- (٠-ج) بيانات التغطية — متعهدان معتمدان وثالث موقوف، وقوائمهم
--
-- الإحداثيات حقيقية: القاهرة والإسكندرية نقطتا القائمة، ومصر الجديدة والمعمورة
-- نقطتا رحلة العميل في مثال الرؤية، وأسوان الحالة السالبة.
-- ----------------------------------------------------------------------------
do $$
declare
  v_sub_a   constant uuid := 'c0000000-0000-4000-8000-00000000000a';
  v_sub_b   constant uuid := 'c0000000-0000-4000-8000-00000000000b';
  v_sub_c   constant uuid := 'c0000000-0000-4000-8000-00000000000c';
  v_list_a  constant uuid := 'c1000000-0000-4000-8000-00000000000a';
  v_list_b  constant uuid := 'c1000000-0000-4000-8000-00000000000b';
  v_list_c  constant uuid := 'c1000000-0000-4000-8000-00000000000c';
  v_list_d  constant uuid := 'c1000000-0000-4000-8000-00000000000d';
  v_c1      text := current_setting('tours.cov_c1', true);
  v_min     numeric;
  v_cost_a  numeric;
  v_cost_b  numeric;
begin
  -- تكلفة أعلى بوضوح من أرضية الفئة حتى لا تتداخل الأرضية مع اختبار الهامش
  select t.min_price into v_min
  from public.tariffs t
  join public.vehicle_classes vc on vc.id = t.class_id
  where vc.slug = v_c1;

  v_cost_a := greatest(coalesce(v_min, 0) * 3, 1500);
  v_cost_b := v_cost_a - 200;

  perform set_config('tours.cov_cost_a', v_cost_a::text, false);
  perform set_config('tours.cov_cost_b', v_cost_b::text, false);

  insert into public.subcontractors (id, company_name, phone, status)
  values
    (v_sub_a, 'COVERAGE_TESTS متعهد أ', '01000000001', 'approved'),
    (v_sub_b, 'COVERAGE_TESTS متعهد ب', '01000000002', 'approved'),
    (v_sub_c, 'COVERAGE_TESTS متعهد موقوف', '01000000003', 'suspended');

  -- القائمة المعتمدة للمتعهد أ: القاهرة ← الإسكندرية بنطاق ٤٠ كم حول كل طرف
  insert into public.price_lists (
    id, subcontractor_id, title,
    origin_label, origin_lat, origin_lng, origin_radius_km,
    dest_label,   dest_lat,   dest_lng,   dest_radius_km,
    bidirectional, status
  )
  values
    (v_list_a, v_sub_a, 'القاهرة ← الإسكندرية (أ)',
     'القاهرة', 30.044400, 31.235700, 40,
     'الإسكندرية', 31.200100, 29.918700, 40, true, 'approved'),
    (v_list_b, v_sub_b, 'القاهرة ← الإسكندرية (ب)',
     'القاهرة', 30.044400, 31.235700, 40,
     'الإسكندرية', 31.200100, 29.918700, 40, true, 'approved'),
    -- متعهد موقوف بسعر بخس: لو ظهر يوماً في عرض فالاختبار يسقط فوراً
    (v_list_c, v_sub_c, 'القاهرة ← الإسكندرية (موقوف)',
     'القاهرة', 30.044400, 31.235700, 40,
     'الإسكندرية', 31.200100, 29.918700, 40, true, 'approved'),
    -- قائمة معلّقة لمتعهد معتمد بسعر بخس أيضاً
    (v_list_d, v_sub_a, 'القاهرة ← الإسكندرية (معلّقة)',
     'القاهرة', 30.044400, 31.235700, 40,
     'الإسكندرية', 31.200100, 29.918700, 40, true, 'pending');

  insert into public.price_list_items (price_list_id, class_slug, cost)
  values
    (v_list_a, v_c1, v_cost_a),
    (v_list_b, v_c1, v_cost_b),
    (v_list_c, v_c1, 1),
    (v_list_d, v_c1, 2);

  raise notice '✔ (٠-ج) بيانات التغطية جاهزة — تكلفة أ % وتكلفة ب %', v_cost_a, v_cost_b;
end;
$$;

-- ----------------------------------------------------------------------------
-- (أ) مثال الرؤية — مصر الجديدة ← المعمورة داخل نطاق القاهرة ← الإسكندرية
-- ----------------------------------------------------------------------------
do $$
declare
  v_sub_a  constant uuid := 'c0000000-0000-4000-8000-00000000000a';
  v_list_a constant uuid := 'c1000000-0000-4000-8000-00000000000a';
  v_count  integer;
  v_row    record;
  v_km     numeric;
begin
  -- (أ-١) الطرفان داخل نطاقيهما فعلاً (فحص المسافة نفسها قبل فحص المطابقة)
  v_km := public.haversine_km(30.080800, 31.322200, 30.044400, 31.235700);
  if v_km is null or v_km > 40 then
    raise exception '(أ-١) مصر الجديدة خارج نطاق القاهرة (% كم) — راجع إحداثيات الاختبار', v_km;
  end if;
  v_km := public.haversine_km(31.279000, 30.017000, 31.200100, 29.918700);
  if v_km is null or v_km > 40 then
    raise exception '(أ-٢) المعمورة خارج نطاق الإسكندرية (% كم) — راجع إحداثيات الاختبار', v_km;
  end if;

  -- (أ-٣) المطابقة تُرجع قائمة المتعهد أ ضمن نتائجها بالاتجاه المباشر
  select count(*) into v_count
  from public.coverage_matches(30.080800, 31.322200, 31.279000, 30.017000) cm
  where cm.price_list_id = v_list_a;
  if v_count <> 1 then
    raise exception '(أ-٣) مصر الجديدة ← المعمورة لم تطابق قائمة القاهرة–الإسكندرية (صفوف %)', v_count;
  end if;

  select * into v_row
  from public.coverage_matches(30.080800, 31.322200, 31.279000, 30.017000) cm
  where cm.price_list_id = v_list_a;

  if v_row.reversed then
    raise exception '(أ-٤) المطابقة المباشرة وُسمت معكوسة';
  end if;
  if v_row.subcontractor_id <> v_sub_a then
    raise exception '(أ-٥) معرّف المتعهد في نتيجة المطابقة خاطئ (%)', v_row.subcontractor_id;
  end if;
  if v_row.company_name is null or v_row.title is null then
    raise exception '(أ-٦) نتيجة المطابقة بلا اسم شركة أو عنوان قائمة';
  end if;

  -- (أ-٧) الحالة السالبة: القاهرة ← أسوان خارج التغطية تماماً
  select count(*) into v_count
  from public.coverage_matches(30.044400, 31.235700, 24.088900, 32.899800) cm;
  if v_count <> 0 then
    raise exception '(أ-٧) القاهرة ← أسوان طابقت % قائمة والمفروض صفر', v_count;
  end if;

  -- (أ-٨) وطرف واحد داخل النطاق لا يكفي: مصر الجديدة ← أسوان أيضاً بلا تغطية
  select count(*) into v_count
  from public.coverage_matches(30.080800, 31.322200, 24.088900, 32.899800) cm;
  if v_count <> 0 then
    raise exception '(أ-٨) طرف واحد داخل النطاق كفى للمطابقة (% صفاً)', v_count;
  end if;

  raise notice '✔ (أ) مثال الرؤية: المعمورة داخل التغطية وأسوان خارجها';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ب) ثنائية الاتجاه — المعكوس يطابق ويُعلَّم، وإطفاؤها يمنعه بلا مساس بالمباشر
-- ----------------------------------------------------------------------------
do $$
declare
  v_list_a constant uuid := 'c1000000-0000-4000-8000-00000000000a';
  v_row    record;
  v_count  integer;
begin
  -- (ب-١) المعمورة ← مصر الجديدة تطابق وتُعلَّم reversed
  select * into v_row
  from public.coverage_matches(31.279000, 30.017000, 30.080800, 31.322200) cm
  where cm.price_list_id = v_list_a;
  if not found then
    raise exception '(ب-١) الاتجاه المعكوس لم يطابق رغم أن القائمة ثنائية الاتجاه';
  end if;
  if not v_row.reversed then
    raise exception '(ب-٢) المطابقة المعكوسة لم تُوسم reversed';
  end if;

  -- (ب-٣) إطفاء ثنائية الاتجاه يمنع المعكوس
  update public.price_lists set bidirectional = false where id = v_list_a;

  select count(*) into v_count
  from public.coverage_matches(31.279000, 30.017000, 30.080800, 31.322200) cm
  where cm.price_list_id = v_list_a;
  if v_count <> 0 then
    raise exception '(ب-٣) القائمة أحادية الاتجاه ما زالت تطابق المعكوس (% صفاً)', v_count;
  end if;

  -- (ب-٤) والمباشر ما زال يطابق
  select count(*) into v_count
  from public.coverage_matches(30.080800, 31.322200, 31.279000, 30.017000) cm
  where cm.price_list_id = v_list_a;
  if v_count <> 1 then
    raise exception '(ب-٤) إطفاء ثنائية الاتجاه أسقط المطابقة المباشرة (% صفاً)', v_count;
  end if;

  update public.price_lists set bidirectional = true where id = v_list_a;

  raise notice '✔ (ب) ثنائية الاتجاه: المعكوس يطابق ويُعلَّم، وإطفاؤها يمنعه وحده';
exception
  when others then
    update public.price_lists set bidirectional = true where id = v_list_a;
    raise;
end;
$$;

-- ----------------------------------------------------------------------------
-- (ج) الاستبعاد — متعهد موقوف وقائمة معلّقة لا يشاركان في أي عرض
-- ----------------------------------------------------------------------------
do $$
declare
  v_list_c constant uuid := 'c1000000-0000-4000-8000-00000000000c';
  v_list_d constant uuid := 'c1000000-0000-4000-8000-00000000000d';
  v_count  integer;
begin
  select count(*) into v_count
  from public.coverage_matches(30.080800, 31.322200, 31.279000, 30.017000) cm
  where cm.price_list_id = v_list_c;
  if v_count <> 0 then
    raise exception '(ج-١) قائمة متعهد **موقوف** ظهرت في المطابقة';
  end if;

  select count(*) into v_count
  from public.coverage_matches(30.080800, 31.322200, 31.279000, 30.017000) cm
  where cm.price_list_id = v_list_d;
  if v_count <> 0 then
    raise exception '(ج-٢) قائمة **معلّقة** ظهرت في المطابقة';
  end if;

  -- (ج-٣) وحتى لو رُفعت حالة القائمة، المتعهد الموقوف يبقى مستبعداً
  update public.subcontractors set status = 'pending'
   where id = 'c0000000-0000-4000-8000-00000000000c'::uuid;

  select count(*) into v_count
  from public.coverage_matches(30.080800, 31.322200, 31.279000, 30.017000) cm
  where cm.price_list_id = v_list_c;
  if v_count <> 0 then
    raise exception '(ج-٣) متعهد بحالة pending شارك في المطابقة';
  end if;

  update public.subcontractors set status = 'suspended'
   where id = 'c0000000-0000-4000-8000-00000000000c'::uuid;

  raise notice '✔ (ج) غير المعتمد لا يشارك: لا المتعهد ولا القائمة';
exception
  when others then
    update public.subcontractors set status = 'suspended'
     where id = 'c0000000-0000-4000-8000-00000000000c'::uuid;
    raise;
end;
$$;

-- ----------------------------------------------------------------------------
-- (د) تعدد المتعهدين ← الأرخص يفوز (قرار الرؤية)
-- ----------------------------------------------------------------------------
do $$
declare
  v_sub_b  constant uuid := 'c0000000-0000-4000-8000-00000000000b';
  v_c1     text    := current_setting('tours.cov_c1', true);
  v_cost_b numeric := current_setting('tours.cov_cost_b', true)::numeric;
  v_settings jsonb := current_setting('tours.cov_settings', true)::jsonb;
  v_row    record;
begin
  update public.pricing_settings
     set peak_enabled = false, margin_type = 'percent', margin_value = 20, margin_min_amount = 0
   where id = true;

  select * into v_row
  from public.quote_price(220, 1, false, 0,
                          30.080800, 31.322200, 31.279000, 30.017000) q
  where q.class_slug = v_c1;
  if not found then
    raise exception '(د-١) لم يرجع عرض للفئة «%»', v_c1;
  end if;

  if v_row.price_source is distinct from 'subcontractor' then
    raise exception '(د-٢) مصدر السعر: توقعنا subcontractor وحصلنا «%»',
      coalesce(v_row.price_source, 'بلا');
  end if;
  if v_row.subcontractor_id is distinct from v_sub_b then
    raise exception '(د-٣) لم يفز الأرخص: توقعنا المتعهد ب وحصلنا %',
      coalesce(v_row.subcontractor_id::text, 'بلا');
  end if;
  if v_row.subcontractor_cost is distinct from round(v_cost_b, 2) then
    raise exception '(د-٤) التكلفة المسجَّلة: توقعنا % وحصلنا %',
      round(v_cost_b, 2), coalesce(v_row.subcontractor_cost, -1);
  end if;

  update public.pricing_settings
     set peak_enabled      = (v_settings ->> 'peak_enabled')::boolean,
         peak_percent      = (v_settings ->> 'peak_percent')::numeric,
         margin_type       = v_settings ->> 'margin_type',
         margin_value      = (v_settings ->> 'margin_value')::numeric,
         margin_min_amount = (v_settings ->> 'margin_min_amount')::numeric
   where id = true;

  raise notice '✔ (د) عند تعدد المتعهدين المغطّين يُحتسب الأرخص';
exception
  when others then
    update public.pricing_settings
       set peak_enabled      = (v_settings ->> 'peak_enabled')::boolean,
           peak_percent      = (v_settings ->> 'peak_percent')::numeric,
           margin_type       = v_settings ->> 'margin_type',
           margin_value      = (v_settings ->> 'margin_value')::numeric,
           margin_min_amount = (v_settings ->> 'margin_min_amount')::numeric
     where id = true;
    raise;
end;
$$;

-- ----------------------------------------------------------------------------
-- (هـ) الهامش — نسبة، مبلغ ثابت، وأرضية الحد الأدنى
-- ----------------------------------------------------------------------------
do $$
declare
  v_c1     text    := current_setting('tours.cov_c1', true);
  v_cost_b numeric := current_setting('tours.cov_cost_b', true)::numeric;
  v_settings jsonb := current_setting('tours.cov_settings', true)::jsonb;
  v_row    record;
  v_margin numeric;
  v_min    numeric;
  v_expect numeric;
begin
  select t.min_price into v_min
  from public.tariffs t
  join public.vehicle_classes vc on vc.id = t.class_id
  where vc.slug = v_c1;
  v_min := coalesce(v_min, 0);

  -- (هـ-١) نسبة مئوية ٢٥٪
  update public.pricing_settings
     set peak_enabled = false, margin_type = 'percent', margin_value = 25, margin_min_amount = 0
   where id = true;

  select * into v_row
  from public.quote_price(220, 1, false, 0,
                          30.080800, 31.322200, 31.279000, 30.017000) q
  where q.class_slug = v_c1;
  if not found then raise exception '(هـ-١) لم يرجع عرض للفئة «%»', v_c1; end if;

  v_margin := round(v_cost_b * 25 / 100, 2);
  if v_row.margin_amount is distinct from v_margin then
    raise exception '(هـ-١) هامش النسبة: توقعنا % وحصلنا %',
      v_margin, coalesce(v_row.margin_amount, -1);
  end if;
  v_expect := round(greatest(v_cost_b + v_cost_b * 25 / 100, v_min));
  if v_row.total <> v_expect then
    raise exception '(هـ-٢) الإجمالي بهامش النسبة: توقعنا % وحصلنا %', v_expect, v_row.total;
  end if;

  -- (هـ-٣) مبلغ ثابت — لا علاقة له بقيمة التكلفة
  update public.pricing_settings
     set margin_type = 'fixed', margin_value = 333, margin_min_amount = 0
   where id = true;

  select * into v_row
  from public.quote_price(220, 1, false, 0,
                          30.080800, 31.322200, 31.279000, 30.017000) q
  where q.class_slug = v_c1;
  if not found then raise exception '(هـ-٣) لم يرجع عرض للفئة «%»', v_c1; end if;

  if v_row.margin_amount is distinct from 333::numeric then
    raise exception '(هـ-٣) الهامش الثابت: توقعنا ٣٣٣ وحصلنا %', coalesce(v_row.margin_amount, -1);
  end if;
  v_expect := round(greatest(v_cost_b + 333, v_min));
  if v_row.total <> v_expect then
    raise exception '(هـ-٤) الإجمالي بالهامش الثابت: توقعنا % وحصلنا %', v_expect, v_row.total;
  end if;

  -- (هـ-٥) أرضية الهامش تفوز على نسبة ضئيلة
  update public.pricing_settings
     set margin_type = 'percent', margin_value = 1, margin_min_amount = greatest(v_cost_b, 500)
   where id = true;

  select * into v_row
  from public.quote_price(220, 1, false, 0,
                          30.080800, 31.322200, 31.279000, 30.017000) q
  where q.class_slug = v_c1;
  if not found then raise exception '(هـ-٥) لم يرجع عرض للفئة «%»', v_c1; end if;

  v_margin := round(greatest(v_cost_b, 500), 2);
  if v_row.margin_amount is distinct from v_margin then
    raise exception '(هـ-٥) أرضية الهامش لم تُطبَّق: توقعنا % وحصلنا %',
      v_margin, coalesce(v_row.margin_amount, -1);
  end if;
  if v_row.margin_amount <= round(v_cost_b * 1 / 100, 2) then
    raise exception '(هـ-٦) الأرضية لم ترفع الهامش فوق النسبة الضئيلة (%)', v_row.margin_amount;
  end if;

  update public.pricing_settings
     set peak_enabled      = (v_settings ->> 'peak_enabled')::boolean,
         peak_percent      = (v_settings ->> 'peak_percent')::numeric,
         margin_type       = v_settings ->> 'margin_type',
         margin_value      = (v_settings ->> 'margin_value')::numeric,
         margin_min_amount = (v_settings ->> 'margin_min_amount')::numeric
   where id = true;

  raise notice '✔ (هـ) الهامش: نسبة ومبلغ ثابت وأرضية حد أدنى';
exception
  when others then
    update public.pricing_settings
       set peak_enabled      = (v_settings ->> 'peak_enabled')::boolean,
           peak_percent      = (v_settings ->> 'peak_percent')::numeric,
           margin_type       = v_settings ->> 'margin_type',
           margin_value      = (v_settings ->> 'margin_value')::numeric,
           margin_min_amount = (v_settings ->> 'margin_min_amount')::numeric
     where id = true;
    raise;
end;
$$;

-- ----------------------------------------------------------------------------
-- (و) المساران في استدعاء واحد — فئة مغطاة بالمتعهد وفئة بلا تغطية بالتعريفة
-- ----------------------------------------------------------------------------
do $$
declare
  v_c1     text    := current_setting('tours.cov_c1', true);
  v_c2     text    := nullif(current_setting('tours.cov_c2', true), '');
  v_cost_b numeric := current_setting('tours.cov_cost_b', true)::numeric;
  v_settings jsonb := current_setting('tours.cov_settings', true)::jsonb;
  v_row    record;
  v_tar    record;
  v_expect numeric;
begin
  update public.pricing_settings
     set peak_enabled = false, margin_type = 'percent', margin_value = 20, margin_min_amount = 0
   where id = true;

  if v_c2 is null then
    raise notice '  ↳ (و) تخطٍّ: لا توجد فئة ثانية مؤهلة لمقارنة مسار التعريفة';
  else
    -- ⚠ إحداثيات الصحراء الغربية عمداً: هذا القسم يثبت «بلا تغطية ⇒ تعريفة»،
    -- فلا يصح أن يمر بمسار القاهرة–الإسكندرية الذي قد تغطيه قائمة **حقيقية**
    -- لمتعهد فعلي. استعمال مسار مأهول هنا كان يجعل الاختبار يفشل كلما دخل
    -- المنصةَ متعهدٌ يغطي المسار — أي كلما نجح المشروع.
    select * into v_row
    from public.quote_price(220, 1, false, 0,
                            25.500000, 27.000000, 24.800000, 28.400000) q
    where q.class_slug = v_c2;
    if not found then raise exception '(و-١) لم يرجع عرض للفئة الثانية «%»', v_c2; end if;

    if v_row.price_source is distinct from 'tariff' then
      raise exception '(و-١) فئة بلا تغطية: توقعنا tariff وحصلنا «%»',
        coalesce(v_row.price_source, 'بلا');
    end if;
    if v_row.subcontractor_id is not null
       or v_row.subcontractor_cost is not null
       or v_row.margin_amount is not null then
      raise exception '(و-٢) مسار التعريفة يجب أن يُرجع الأعمدة الثلاثة null (%, %, %)',
        v_row.subcontractor_id, v_row.subcontractor_cost, v_row.margin_amount;
    end if;

    -- الرقم نفسه يجب أن يطابق معادلة المرحلة ٣ حرفياً
    select t.* into v_tar
    from public.tariffs t
    join public.vehicle_classes vc on vc.id = t.class_id
    where vc.slug = v_c2;
    v_expect := round(greatest(v_tar.base_fee + 220 * v_tar.per_km, v_tar.min_price));
    if v_row.total <> v_expect then
      raise exception '(و-٣) إجمالي مسار التعريفة: توقعنا % وحصلنا %', v_expect, v_row.total;
    end if;
  end if;

  -- (و-٤) نفس الاستدعاء بلا إحداثيات = سلوك المرحلة ٣ للفئة المغطاة أيضاً
  select * into v_row from public.quote_price(220, 1, false, 0) q where q.class_slug = v_c1;
  if not found then raise exception '(و-٤) التوقيع الرباعي لم يرجع عرضاً'; end if;

  select t.* into v_tar
  from public.tariffs t
  join public.vehicle_classes vc on vc.id = t.class_id
  where vc.slug = v_c1;
  v_expect := round(greatest(v_tar.base_fee + 220 * v_tar.per_km, v_tar.min_price));
  if v_row.total <> v_expect then
    raise exception '(و-٤) التوقيع الرباعي تأثر بالتغطية: توقعنا % وحصلنا %', v_expect, v_row.total;
  end if;

  -- (و-٥) والتوقيع الثماني بإحداثيات فارغة مطابق له
  select * into v_row
  from public.quote_price(220, 1, false, 0, null, null, null, null) q
  where q.class_slug = v_c1;
  if not found then raise exception '(و-٥) الثماني بإحداثيات فارغة لم يرجع عرضاً'; end if;
  if v_row.total <> v_expect or v_row.price_source is distinct from 'tariff' then
    raise exception '(و-٥) الثماني بلا إحداثيات: إجمالي % ومصدر «%»',
      v_row.total, coalesce(v_row.price_source, 'بلا');
  end if;

  -- (و-٦) وبإحداثيات المسار المغطى يصير المصدر متعهداً والسعر غيره
  select * into v_row
  from public.quote_price(220, 1, false, 0,
                          30.080800, 31.322200, 31.279000, 30.017000) q
  where q.class_slug = v_c1;
  if v_row.price_source is distinct from 'subcontractor' then
    raise exception '(و-٦) المسار المغطى لم يُسعَّر من المتعهد';
  end if;
  if v_row.base_fee is distinct from round(v_cost_b + v_cost_b * 20 / 100, 2)
     or v_row.distance_cost <> 0 then
    raise exception '(و-٧) تفصيل المسار المتعهَّد: أساس=% مسافة=% (المتوقع %/٠)',
      v_row.base_fee, v_row.distance_cost, round(v_cost_b * 1.2, 2);
  end if;

  update public.pricing_settings
     set peak_enabled      = (v_settings ->> 'peak_enabled')::boolean,
         peak_percent      = (v_settings ->> 'peak_percent')::numeric,
         margin_type       = v_settings ->> 'margin_type',
         margin_value      = (v_settings ->> 'margin_value')::numeric,
         margin_min_amount = (v_settings ->> 'margin_min_amount')::numeric
   where id = true;

  raise notice '✔ (و) المغطاة بالمتعهد وغير المغطاة بالتعريفة — والاستدعاء بلا إحداثيات كما كان';
exception
  when others then
    update public.pricing_settings
       set peak_enabled      = (v_settings ->> 'peak_enabled')::boolean,
           peak_percent      = (v_settings ->> 'peak_percent')::numeric,
           margin_type       = v_settings ->> 'margin_type',
           margin_value      = (v_settings ->> 'margin_value')::numeric,
           margin_min_amount = (v_settings ->> 'margin_min_amount')::numeric
     where id = true;
    raise;
end;
$$;

-- ----------------------------------------------------------------------------
-- (ز) الذروة فوق سعر مصدره متعهد — آخر خطوة دائماً أياً كان المصدر
-- ----------------------------------------------------------------------------
do $$
declare
  v_c1     text    := current_setting('tours.cov_c1', true);
  v_cost_b numeric := current_setting('tours.cov_cost_b', true)::numeric;
  v_settings jsonb := current_setting('tours.cov_settings', true)::jsonb;
  v_plain  numeric;
  v_row    record;
  v_min    numeric;
  v_pre    numeric;
  v_expect numeric;
begin
  select t.min_price into v_min
  from public.tariffs t
  join public.vehicle_classes vc on vc.id = t.class_id
  where vc.slug = v_c1;
  v_min := coalesce(v_min, 0);

  update public.pricing_settings
     set peak_enabled = false, margin_type = 'percent', margin_value = 20, margin_min_amount = 0
   where id = true;

  select q.total into v_plain
  from public.quote_price(220, 1, false, 0,
                          30.080800, 31.322200, 31.279000, 30.017000) q
  where q.class_slug = v_c1;

  update public.pricing_settings set peak_enabled = true, peak_percent = 15 where id = true;

  select * into v_row
  from public.quote_price(220, 1, false, 0,
                          30.080800, 31.322200, 31.279000, 30.017000) q
  where q.class_slug = v_c1;
  if not found then raise exception '(ز-١) لم يرجع عرض بعد تفعيل الذروة'; end if;

  v_pre    := greatest(v_cost_b + v_cost_b * 20 / 100, v_min);
  v_expect := round(v_pre * (1 + 15 / 100.0::numeric));

  if v_row.total <> v_expect then
    raise exception '(ز-١) الذروة فوق سعر المتعهد: توقعنا % وحصلنا %', v_expect, v_row.total;
  end if;
  if not v_row.peak_applied then
    raise exception '(ز-٢) peak_applied يجب أن يكون true';
  end if;
  if v_row.total <= v_plain then
    raise exception '(ز-٣) الذروة لم ترفع سعر المتعهد: قبلها % وبعدها %', v_plain, v_row.total;
  end if;
  -- الذروة لا تُضخّم التكلفة المسجَّلة ولا الهامش: هما لقطة شراء لا سعر بيع
  if v_row.subcontractor_cost is distinct from round(v_cost_b, 2) then
    raise exception '(ز-٤) الذروة غيّرت التكلفة المسجَّلة (%)', v_row.subcontractor_cost;
  end if;

  update public.pricing_settings
     set peak_enabled      = (v_settings ->> 'peak_enabled')::boolean,
         peak_percent      = (v_settings ->> 'peak_percent')::numeric,
         margin_type       = v_settings ->> 'margin_type',
         margin_value      = (v_settings ->> 'margin_value')::numeric,
         margin_min_amount = (v_settings ->> 'margin_min_amount')::numeric
   where id = true;

  raise notice '✔ (ز) عمولة الذروة تتراكم فوق سعر مصدره متعهد';
exception
  when others then
    update public.pricing_settings
       set peak_enabled      = (v_settings ->> 'peak_enabled')::boolean,
           peak_percent      = (v_settings ->> 'peak_percent')::numeric,
           margin_type       = v_settings ->> 'margin_type',
           margin_value      = (v_settings ->> 'margin_value')::numeric,
           margin_min_amount = (v_settings ->> 'margin_min_amount')::numeric
     where id = true;
    raise;
end;
$$;

-- ----------------------------------------------------------------------------
-- (ح) عزل RLS — أساس البورتال كله
--
-- نحاول العزل الحقيقي: حساب دخول لكل متعهد + `set local role authenticated` مع
-- مطالبة jwt مزوَّرة. إن تعذّر إنشاء المستخدمين (قاعدة بلا صلاحية على auth) نسقط
-- إلى فحص كتالوجي يثبت أن السياسات موجودة ومبنية على current_subcontractor_id
-- وأن أياً منها لا يستهدف anon.
-- ----------------------------------------------------------------------------
do $$
declare
  v_sub_a  constant uuid := 'c0000000-0000-4000-8000-00000000000a';
  v_sub_b  constant uuid := 'c0000000-0000-4000-8000-00000000000b';
  v_prof_a constant uuid := 'c2000000-0000-4000-8000-00000000000a';
  v_prof_b constant uuid := 'c2000000-0000-4000-8000-00000000000b';
  v_list_b constant uuid := 'c1000000-0000-4000-8000-00000000000b';
  v_list_d constant uuid := 'c1000000-0000-4000-8000-00000000000d';
  v_ok     boolean := true;
  v_mine   integer;
  v_theirs integer;
  v_rows   integer;
  v_raised boolean;
  v_pol    integer;
begin
  perform set_config('tours.cov_identities', '0', false);

  -- (ح-٠) فحص كتالوجي يعمل دائماً: لا سياسة تمنح anon شيئاً على الجداول الأربعة
  select count(*) into v_pol
  from pg_policies p
  where p.schemaname = 'public'
    and p.tablename in ('subcontractors', 'subcontractor_vehicles',
                        'price_lists', 'price_list_items')
    and 'anon' = any (p.roles);
  if v_pol <> 0 then
    raise exception '(ح-٠) توجد % سياسة تستهدف anon على جداول المتعهدين', v_pol;
  end if;

  select count(*) into v_pol
  from pg_policies p
  where p.schemaname = 'public'
    and p.tablename in ('subcontractors', 'subcontractor_vehicles',
                        'price_lists', 'price_list_items');
  if v_pol < 16 then
    raise exception '(ح-٠) عدد سياسات جداول المتعهدين % — المتوقع ١٦ على الأقل', v_pol;
  end if;

  -- (ح-١) محاولة بناء هويتي دخول حقيقيتين
  begin
    insert into auth.users (id, email) values
      (v_prof_a, 'coverage-a@local.invalid'),
      (v_prof_b, 'coverage-b@local.invalid');
    insert into public.profiles (id, role, full_name) values
      (v_prof_a, 'subcontractor', 'متعهد أ'),
      (v_prof_b, 'subcontractor', 'متعهد ب')
    on conflict (id) do update set role = 'subcontractor';
    update public.subcontractors set profile_id = v_prof_a where id = v_sub_a;
    update public.subcontractors set profile_id = v_prof_b where id = v_sub_b;
    perform set_config('tours.cov_identities', '1', false);
  exception
    when others then
      v_ok := false;
      raise notice '  ↳ (ح) تعذّر إنشاء حسابي دخول (%) — الاكتفاء بالفحص الكتالوجي', sqlerrm;
  end;

  if not v_ok then
    raise notice '✔ (ح) السياسات موجودة ولا شيء منها لـ anon (العزل الحي متخطّى)';
    return;
  end if;

  -- (ح-٢) هوية المتعهد تُحل صحيحة
  perform set_config('request.jwt.claim.sub', v_prof_a::text, false);
  if public.current_subcontractor_id() is distinct from v_sub_a then
    raise exception '(ح-٢) current_subcontractor_id لم تُرجع معرّف المتعهد أ (%)',
      coalesce(public.current_subcontractor_id()::text, 'بلا');
  end if;

  -- (ح-٣) بهوية «أ» لا تظهر قوائم «ب» إطلاقاً
  begin
    execute 'set local role authenticated';

    select count(*) filter (where pl.subcontractor_id = v_sub_a),
           count(*) filter (where pl.subcontractor_id = v_sub_b)
      into v_mine, v_theirs
    from public.price_lists pl;

    execute 'reset role';
  exception
    when others then
      execute 'reset role';
      raise;
  end;

  if v_theirs <> 0 then
    raise exception '(ح-٣) ثغرة عزل: المتعهد أ رأى % من قوائم المتعهد ب', v_theirs;
  end if;
  if v_mine = 0 then
    raise exception '(ح-٤) المتعهد أ لا يرى قوائمه هو (% صفاً)', v_mine;
  end if;

  -- (ح-٥) ولا يرى أصناف أسعار غيره
  begin
    execute 'set local role authenticated';
    select count(*) into v_theirs
    from public.price_list_items pli where pli.price_list_id = v_list_b;
    execute 'reset role';
  exception
    when others then
      execute 'reset role';
      raise;
  end;
  if v_theirs <> 0 then
    raise exception '(ح-٥) ثغرة عزل: المتعهد أ قرأ % صفاً من أسعار المتعهد ب', v_theirs;
  end if;

  -- (ح-٦) تعديل صف الغير لا يرمي خطأ بل يصيب صفر صفوف (فخّ التحديث الصامت)
  begin
    execute 'set local role authenticated';
    update public.subcontractors set phone = '01999999999' where id = v_sub_b;
    get diagnostics v_rows = row_count;
    execute 'reset role';
  exception
    when others then
      execute 'reset role';
      raise;
  end;
  if v_rows <> 0 then
    raise exception '(ح-٦) ثغرة عزل: المتعهد أ عدّل % صفاً من بيانات المتعهد ب', v_rows;
  end if;

  -- (ح-٧) ولا يغيّر حالة حسابه هو
  --
  -- ملاحظة مهمة: المتعهد «أ» في هذه التركيبة حالته approved أصلاً، فمحاولة
  -- ضبطها إلى approved ليست تغييراً ولا يُتوقع لها استثناء — لذلك نطلب حالة
  -- **مغايرة** فعلاً. (كانت النسخة الأولى تجرّب approved فتفشل بلا سبب حقيقي.)
  v_raised := false;
  begin
    execute 'set local role authenticated';
    begin
      update public.subcontractors set status = 'suspended' where id = v_sub_a;
    exception
      when others then v_raised := true;
    end;
    execute 'reset role';
  exception
    when others then
      execute 'reset role';
      raise;
  end;
  if not v_raised then
    raise exception '(ح-٧) ثغرة: المتعهد غيّر حالة حسابه بنفسه';
  end if;

  -- (ح-٧-ب) وضبط الحالة على قيمتها الحالية لا يُعد تغييراً فلا يُرفض
  begin
    execute 'set local role authenticated';
    update public.subcontractors set status = 'approved' where id = v_sub_a;
    get diagnostics v_rows = row_count;
    execute 'reset role';
  exception
    when others then
      execute 'reset role';
      raise exception '(ح-٧-ب) رُفضت كتابة لا تغيّر الحالة فعلاً';
  end;

  -- (ح-٨) ولا يعتمد قائمته بنفسه
  v_raised := false;
  begin
    execute 'set local role authenticated';
    begin
      update public.price_lists set status = 'approved' where id = v_list_d;
    exception
      when others then v_raised := true;
    end;
    execute 'reset role';
  exception
    when others then
      execute 'reset role';
      raise;
  end;
  if not v_raised then
    raise exception '(ح-٨) ثغرة: المتعهد اعتمد قائمته بنفسه';
  end if;

  perform set_config('request.jwt.claim.sub', '', false);
  raise notice '✔ (ح) العزل الحي: لا قراءة ولا كتابة عبر المتعهدين، ولا اعتماد ذاتي';
exception
  when others then
    perform set_config('request.jwt.claim.sub', '', false);
    raise;
end;
$$;

-- ----------------------------------------------------------------------------
-- (ط) لقطة الحجز — الأعمدة الأربعة تُملأ من العرض المختار لا من المستدعي
-- ----------------------------------------------------------------------------
do $$
declare
  v_sub_b  constant uuid := 'c0000000-0000-4000-8000-00000000000b';
  v_c1     text    := current_setting('tours.cov_c1', true);
  v_cost_b numeric := current_setting('tours.cov_cost_b', true)::numeric;
  v_settings jsonb := current_setting('tours.cov_settings', true)::jsonb;
  v_book   record;
  v_row    record;
begin
  update public.pricing_settings
     set peak_enabled = false, margin_type = 'percent', margin_value = 20, margin_min_amount = 0
   where id = true;

  -- (ط-١) رحلة مغطاة: مصر الجديدة ← المعمورة
  select * into v_book from public.create_booking(
    '{"label": "مصر الجديدة", "lat": 30.0808, "lng": 31.3222}'::jsonb,
    '{"label": "المعمورة", "lat": 31.2790, "lng": 30.0170}'::jsonb,
    1, false, 0, 220, 180, 'osrm', v_c1, 'full',
    'عميل اختبار التغطية', '01000000000', null, now() + interval '30 days', 'COVERAGE_TESTS_FIXTURE'
  );

  select b.* into v_row from public.bookings b where b.id = v_book.id;
  if not found then raise exception '(ط-١) لم يُنشأ الحجز'; end if;

  if v_row.price_source is distinct from 'subcontractor' then
    raise exception '(ط-١) مصدر السعر في الحجز: توقعنا subcontractor وحصلنا «%»',
      coalesce(v_row.price_source, 'بلا');
  end if;
  if v_row.subcontractor_id is distinct from v_sub_b then
    raise exception '(ط-٢) معرّف المتعهد في الحجز خاطئ (%)',
      coalesce(v_row.subcontractor_id::text, 'بلا');
  end if;
  if v_row.subcontractor_cost is distinct from round(v_cost_b, 2) then
    raise exception '(ط-٣) تكلفة المتعهد في الحجز: توقعنا % وحصلنا %',
      round(v_cost_b, 2), coalesce(v_row.subcontractor_cost, -1);
  end if;
  if v_row.margin_amount is distinct from round(v_cost_b * 20 / 100, 2) then
    raise exception '(ط-٤) الهامش في الحجز: توقعنا % وحصلنا %',
      round(v_cost_b * 20 / 100, 2), coalesce(v_row.margin_amount, -1);
  end if;
  -- المتطابقة المحاسبية التي ستقرأها المرحلة ٧
  if v_row.total < v_row.subcontractor_cost then
    raise exception '(ط-٥) إجمالي الحجز (%) أقل من تكلفة المتعهد (%)',
      v_row.total, v_row.subcontractor_cost;
  end if;

  -- (ط-٦) رحلة غير مغطاة: القاهرة ← أسوان ⇒ tariff وثلاثة أعمدة فارغة
  select * into v_book from public.create_booking(
    '{"label": "القاهرة", "lat": 30.0444, "lng": 31.2357}'::jsonb,
    '{"label": "أسوان", "lat": 24.0889, "lng": 32.8998}'::jsonb,
    1, false, 0, 900, 600, 'osrm', v_c1, 'full',
    'عميل اختبار التغطية', '01000000000', null, now() + interval '30 days', 'COVERAGE_TESTS_FIXTURE'
  );

  select b.* into v_row from public.bookings b where b.id = v_book.id;
  if v_row.price_source is distinct from 'tariff' then
    raise exception '(ط-٦) رحلة غير مغطاة: توقعنا tariff وحصلنا «%»',
      coalesce(v_row.price_source, 'بلا');
  end if;
  if v_row.subcontractor_id is not null
     or v_row.subcontractor_cost is not null
     or v_row.margin_amount is not null then
    raise exception '(ط-٧) رحلة غير مغطاة سجّلت أرقام متعهد (%, %, %)',
      v_row.subcontractor_id, v_row.subcontractor_cost, v_row.margin_amount;
  end if;

  update public.pricing_settings
     set peak_enabled      = (v_settings ->> 'peak_enabled')::boolean,
         peak_percent      = (v_settings ->> 'peak_percent')::numeric,
         margin_type       = v_settings ->> 'margin_type',
         margin_value      = (v_settings ->> 'margin_value')::numeric,
         margin_min_amount = (v_settings ->> 'margin_min_amount')::numeric
   where id = true;

  raise notice '✔ (ط) لقطة الحجز تسجّل المصدر والتكلفة والهامش — وتتركها فارغة بلا تغطية';
exception
  when others then
    update public.pricing_settings
       set peak_enabled      = (v_settings ->> 'peak_enabled')::boolean,
           peak_percent      = (v_settings ->> 'peak_percent')::numeric,
           margin_type       = v_settings ->> 'margin_type',
           margin_value      = (v_settings ->> 'margin_value')::numeric,
           margin_min_amount = (v_settings ->> 'margin_min_amount')::numeric
     where id = true;
    raise;
end;
$$;

-- ----------------------------------------------------------------------------
-- (ي) الصلاحيات + تنقيح الأرقام الداخلية
--
-- الفخّان المُوثَّقان: TRUNCATE لا تخضع لـ RLS، وEXECUTE يأتي من مصدرين (منح
-- ضمني لـ PUBLIC ومنح صريح لـ anon من إعدادات Supabase الافتراضية).
-- ----------------------------------------------------------------------------
do $$
declare
  v_tbl  text;
  v_priv text;
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    raise notice '  ↳ (ي) تخطٍّ: دور anon غير موجود في هذه القاعدة';
    return;
  end if;

  -- (ي-١) anon بلا أي صلاحية على الجداول الأربعة — بما فيها TRUNCATE
  foreach v_tbl in array array['public.subcontractors', 'public.subcontractor_vehicles',
                               'public.price_lists', 'public.price_list_items'] loop
    foreach v_priv in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES'] loop
      if has_table_privilege('anon', v_tbl, v_priv) then
        raise exception '(ي-١) ثغرة: anon يملك % على %', v_priv, v_tbl;
      end if;
    end loop;
  end loop;

  -- (ي-٢) المسجَّل يملك ما تحتاجه سياساته (والعزل تفرضه السياسة لا المنع)
  if not has_table_privilege('authenticated', 'public.price_lists', 'SELECT')
     or not has_table_privilege('authenticated', 'public.price_list_items', 'UPDATE') then
    raise exception '(ي-٢) المسجَّل يفتقد صلاحيات جداول المتعهدين المطلوبة للبورتال';
  end if;

  -- (ي-٣) مطابقة التغطية ليست لأي دور مستخدم — لا الزائر ولا المسجَّل
  --
  -- الدالة security definer تتجاوز RLS، فمنحها لـ authenticated كان يعني أن أي
  -- متعهد يمسح الخريطة فيحصل على كشف بمنافسيه المعتمدين ومساراتهم (هجرة 0011).
  -- quote_price تستدعيها كمالكها فلا تحتاج منحاً لأي دور.
  if has_function_privilege('anon',
       'public.coverage_matches(numeric, numeric, numeric, numeric)', 'EXECUTE') then
    raise exception '(ي-٣) ثغرة: anon يستطيع تنفيذ coverage_matches';
  end if;
  if has_function_privilege('authenticated',
       'public.coverage_matches(numeric, numeric, numeric, numeric)', 'EXECUTE') then
    raise exception '(ي-٣) ثغرة عزل: المتعهد يستطيع تنفيذ coverage_matches فيعدّ منافسيه';
  end if;

  -- (ي-٣-ب) وأعمدة الهامش محجوبة عن كل دور مستخدم — لأن base_fee في مسار
  -- المتعهد = التكلفة + الهامش، فمعرفة الهامش تكشف تكلفة المنافس بعملية عكسية
  if has_column_privilege('authenticated', 'public.pricing_settings', 'margin_value', 'SELECT')
     or has_column_privilege('anon', 'public.pricing_settings', 'margin_value', 'SELECT') then
    raise exception '(ي-٣-ب) ثغرة: أعمدة الهامش مقروءة لدور مستخدم';
  end if;
  if not has_column_privilege('authenticated', 'public.pricing_settings', 'peak_percent', 'SELECT') then
    raise exception '(ي-٣-ب) أعمدة التسعير العامة حُجبت بالخطأ عن المسجَّل';
  end if;

  -- (ي-٣-ج) والتوقيع الثماني للتسعير للخادم وحده (الرباعي يبقى متاحاً)
  if has_function_privilege('authenticated',
       'public.quote_price(numeric, integer, boolean, numeric, numeric, numeric, numeric, numeric, integer)',
       'EXECUTE') then
    raise exception '(ي-٣-ج) ثغرة: المسجَّل ينفّذ التسعير المُفصَّل بالإحداثيات';
  end if;

  -- (ي-٤) دوال البورتال واللوحة ليست للزائر
  if has_function_privilege('anon', 'public.submit_price_list(uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.review_price_list(uuid, boolean, text)', 'EXECUTE')
     or has_function_privilege('anon',
          'public.upsert_price_list(uuid, text, text, numeric, numeric, numeric, text, numeric, numeric, numeric, boolean, jsonb, uuid)',
          'EXECUTE') then
    raise exception '(ي-٤) ثغرة: anon يستطيع تنفيذ إحدى دوال قوائم الأسعار';
  end if;

  -- (ي-٥) دوال داخلية بحتة
  if has_function_privilege('anon', 'public.pricing_internals_visible()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.pricing_internals_visible()', 'EXECUTE') then
    raise exception '(ي-٥) ثغرة: دالة كشف الأرقام الداخلية متاحة لدور عام';
  end if;

  -- (ي-٦)🔒 **غلافا التسعير مسحوبان عن الزائر** (هجرة 0032) — وهذا الفحص كان
  -- قبلها يحرس وهماً، وهو النمط ٩ في `LESSONS.md` بنصّه.
  --
  -- كان يؤكد أن الزائر **يملك بتّ المنحة** على الغلاف الرباعي، ويقرأ ذلك على أنه
  -- «التسعير الأساسي متاح له». والحقيقة أن النداء كان يفشل دائماً: الغلاف
  -- `security invoker` وينادي التاسعة `security definer` المسحوبة من `anon` منذ
  -- 0011 — فيموت في الإطار التالي بـ«permission denied». أي أن البتّ كان مضلِّلاً،
  -- وقد بُني عليه في 0031 حكمٌ خاطئ («باب خلفي مفتوح») ثم قرارُ إبقاءٍ خاطئ.
  --
  -- والفحص الآن **ينفّذ** لا يقرأ بتّاً: هذا هو الفرق بين حارس وطمأنينة.
  if has_function_privilege('anon', 'public.quote_price(numeric, integer, boolean, numeric)', 'EXECUTE')
     or has_function_privilege('anon', 'public.quote_price(numeric, integer, boolean, numeric, integer)', 'EXECUTE') then
    raise exception '(ي-٦) غلاف التسعير عاد ممنوحاً للزائر — منحةٌ لا يستطيع استعمالها تُبنى عليها أحكام خاطئة';
  end if;

  -- والتنفيذ الحيّ: الزائر يسعّر رحلته عبر `quote_public` وحدها ولا شيء غيرها
  declare
    v_anon_ok boolean := false;
  begin
    set local role anon;
    perform 1 from public.quote_public(220, 1, false, 0, null, null, null, null, null, 0, null) limit 1;
    v_anon_ok := true;
    reset role;
  exception
    when others then
      reset role;
      raise exception '(ي-٦) الزائر لم يعد يسعّر رحلته عبر quote_public — المسار العام مقطوع: %', sqlerrm;
  end;
  if has_function_privilege('anon',
       'public.quote_price(numeric, integer, boolean, numeric, numeric, numeric, numeric, numeric, integer)',
       'EXECUTE') then
    raise exception '(ي-٦) ثغرة: الزائر ينفّذ التسعير المُفصَّل بالإحداثيات';
  end if;

  -- (ي-٧) إنشاء الحجز يبقى محجوباً عن الزائر (تصليب 0009 لم يُمس)
  --
  -- ⚠ حارس وجودٍ **قبل** فحص الصلاحية، ودرسٌ مدفوع الثمن: `has_function_privilege`
  -- على **نصّ** توقيعٍ غير موجود لا تُرجع false — بل ترمي 42883 لأن النص يُحوَّل
  -- إلى `regprocedure` قبل الفحص، فتسقط المجموعة كلها بخطأ Postgres وتتوقف هذه
  -- الحراسة عن الحراسة بصمت. وقع ذلك حين أسقطت 0024 التوقيع الخماسي عشر.
  -- فالحارس هنا يحوّل «تغيّر التوقيع» إلى رسالة صريحة تقول ما يجب تحديثه.
  if to_regprocedure('public.create_booking(
       jsonb, jsonb, integer, boolean, numeric, numeric, numeric,
       text, text, text, text, text, text, timestamptz, text, text,
       timestamptz, integer, jsonb, integer, text)') is null then
    raise exception '(ي-٧) توقيع create_booking تغيّر عمّا يفحصه هذا الاختبار — حدّث النص هنا قبل أي شيء';
  end if;

  if has_function_privilege('anon', 'public.create_booking(
       jsonb, jsonb, integer, boolean, numeric, numeric, numeric,
       text, text, text, text, text, text, timestamptz, text, text,
       timestamptz, integer, jsonb, integer, text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.create_booking(
       jsonb, jsonb, integer, boolean, numeric, numeric, numeric,
       text, text, text, text, text, text, timestamptz, text, text,
       timestamptz, integer, jsonb, integer, text)', 'EXECUTE') then
    raise exception '(ي-٧) ثغرة: create_booking عادت متاحة لدور عام (نقض د١ من 0009)';
  end if;

  -- (ي-٨) نسبة الهامش سرّ تجاري: الزائر يقرأ الذروة ولا يقرأ الهامش
  if has_column_privilege('anon', 'public.pricing_settings', 'margin_value', 'SELECT')
     or has_column_privilege('anon', 'public.pricing_settings', 'margin_type', 'SELECT')
     or has_column_privilege('anon', 'public.pricing_settings', 'margin_min_amount', 'SELECT') then
    raise exception '(ي-٨) ثغرة: الزائر يقرأ إعدادات الهامش من pricing_settings';
  end if;
  if not has_column_privilege('anon', 'public.pricing_settings', 'peak_percent', 'SELECT')
     or not has_column_privilege('anon', 'public.pricing_settings', 'currency', 'SELECT') then
    raise exception '(ي-٨) الزائر فقد قراءة أعمدة التسعير العامة';
  end if;

  raise notice '✔ (ي) الصلاحيات: anon صفر على الجداول، والتسعير الفوري سليم';
end;
$$;

-- (ي-٩) التنقيح الحي: نفس الاستدعاء بمفتاح anon يُرجع السعر بلا أرقام داخلية
do $$
declare
  v_c1     text := current_setting('tours.cov_c1', true);
  v_settings jsonb := current_setting('tours.cov_settings', true)::jsonb;
  v_source text;
  v_sub    uuid;
  v_cost   numeric;
  v_margin numeric;
  v_total  numeric;
  v_total2 numeric;
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    raise notice '  ↳ (ي-٩) تخطٍّ: دور anon غير موجود';
    return;
  end if;

  update public.pricing_settings
     set peak_enabled = false, margin_type = 'percent', margin_value = 20, margin_min_amount = 0
   where id = true;

  -- بهوية المالك (سياق خادم موثوق) الأرقام ظاهرة
  select q.total into v_total
  from public.quote_price(220, 1, false, 0,
                          30.080800, 31.322200, 31.279000, 30.017000) q
  where q.class_slug = v_c1;

  perform set_config('request.jwt.claim.sub', '', false);

  -- (ي-٩) الزائر يسعّر عبر `quote_public` (هجرة 0012): الأعمدة الداخلية ليست
  -- في نوع إرجاعها إطلاقاً، فالتسريب مستحيل بنيوياً لا بالتنقيح في الكود.
  begin
    execute 'set local role anon';
    select q.total into v_total2
    from public.quote_public(220, 1, false, 0,
                             30.080800, 31.322200, 31.279000, 30.017000) q
    where q.class_slug = v_c1;
    execute 'reset role';
  exception
    when others then
      execute 'reset role';
      raise;
  end;

  if v_total2 is distinct from v_total then
    raise exception '(ي-١٠) واجهة الزائر غيّرت السعر: للخادم % وللزائر %', v_total, v_total2;
  end if;

  -- ولا يحمل نوع الإرجاع أي عمود داخلي أصلاً.
  --
  -- الفحص من pg_proc لا من information_schema.parameters: الأخيرة تسمّي أعمدة
  -- `returns table` بـ OUT في هذا الإصدار وTABLE في غيره، فشرط
  -- `parameter_mode = 'TABLE'` كان يجعل هذا الفحص **يمرّ بلا أن يفحص شيئاً** —
  -- حارسُ تسريب whitelabel صامتٌ منذ كُتب. نفس الفخّ موثَّق في dispatch_tests (ب-١).
  -- ولذلك يسبقه شاهد إيجابي: لو لم نجد عمود total فآلية الفحص نفسها معطلة.
  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    cross join lateral unnest(p.proargnames, p.proargmodes) as a(argname, argmode)
    where n.nspname = 'public' and p.proname = 'quote_public'
      and a.argmode in ('o', 't') and a.argname = 'total'
  ) then
    raise exception '(ي-٩) آلية فحص أعمدة الإرجاع معطلة: لم يُعثر على العمود total';
  end if;

  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    cross join lateral unnest(p.proargnames, p.proargmodes) as a(argname, argmode)
    where n.nspname = 'public' and p.proname = 'quote_public'
      and a.argmode in ('o', 't')
      and a.argname in ('price_source', 'subcontractor_id',
                        'subcontractor_cost', 'margin_amount')
  ) then
    raise exception '(ي-٩) ثغرة whitelabel: quote_public تُرجع عموداً داخلياً';
  end if;

  -- وبصمة المسار مُزالة: تفصيل السعر لا يميّز مصدره (لا distance_cost = 0)
  if exists (
    select 1
    from public.quote_public(220, 1, false, 0,
                             30.080800, 31.322200, 31.279000, 30.017000) q
    where q.class_slug = v_c1 and q.distance_cost = 0 and q.base_fee > 0
  ) then
    raise exception '(ي-٩) بصمة: تفصيل سعر المتعهد يميّزه عن سعر التعريفة';
  end if;

  update public.pricing_settings
     set peak_enabled      = (v_settings ->> 'peak_enabled')::boolean,
         peak_percent      = (v_settings ->> 'peak_percent')::numeric,
         margin_type       = v_settings ->> 'margin_type',
         margin_value      = (v_settings ->> 'margin_value')::numeric,
         margin_min_amount = (v_settings ->> 'margin_min_amount')::numeric
   where id = true;

  raise notice '✔ (ي-٩) مفتاح anon يرى السعر ومصدره فقط — لا تكلفة ولا هامش ولا هوية متعهد';
exception
  when others then
    update public.pricing_settings
       set peak_enabled      = (v_settings ->> 'peak_enabled')::boolean,
           peak_percent      = (v_settings ->> 'peak_percent')::numeric,
           margin_type       = v_settings ->> 'margin_type',
           margin_value      = (v_settings ->> 'margin_value')::numeric,
           margin_min_amount = (v_settings ->> 'margin_min_amount')::numeric
     where id = true;
    raise;
end;
$$;

-- ----------------------------------------------------------------------------
-- (ك) دورة الاعتماد — إنشاء ← إرسال ← اعتماد ← تعديل يعيدها pending
-- ----------------------------------------------------------------------------
do $$
declare
  v_admin    text := nullif(current_setting('tours.cov_admin', true), '');
  v_ident    text := current_setting('tours.cov_identities', true);
  v_prof_a   constant uuid := 'c2000000-0000-4000-8000-00000000000a';
  v_c1       text := current_setting('tours.cov_c1', true);
  v_res      record;
  v_status   text;
  v_raised   boolean;
  v_hint     text;
  v_id       uuid;
  v_items    integer;
begin
  if v_ident is distinct from '1' then
    raise notice '  ↳ (ك) تخطٍّ: بلا هوية متعهد (تعذّر إنشاء حسابات الدخول)';
    return;
  end if;

  perform set_config('request.jwt.claim.sub', v_prof_a::text, false);

  -- (ك-١) الإنشاء يبدأ مسودة دائماً
  select * into v_res from public.upsert_price_list(
    null, 'COVERAGE_TESTS دورة الاعتماد',
    'القاهرة', 30.044400, 31.235700, 30,
    'الغردقة', 27.257900, 33.812900, 30,
    true,
    jsonb_build_array(jsonb_build_object('classSlug', v_c1, 'cost', 2500))
  );
  v_id := v_res.id;
  if v_res.status <> 'draft' then
    raise exception '(ك-١) القائمة الجديدة: توقعنا draft وحصلنا «%»', v_res.status;
  end if;

  select count(*) into v_items from public.price_list_items pli where pli.price_list_id = v_id;
  if v_items <> 1 then
    raise exception '(ك-٢) أصناف القائمة الجديدة: توقعنا صفاً واحداً وحصلنا %', v_items;
  end if;

  -- (ك-٣) فئة مجهولة تُرفض ولا تُبتلع
  v_raised := false;
  begin
    perform 1 from public.upsert_price_list(
      v_id, 'COVERAGE_TESTS دورة الاعتماد',
      'القاهرة', 30.044400, 31.235700, 30,
      'الغردقة', 27.257900, 33.812900, 30,
      true, jsonb_build_array(jsonb_build_object('classSlug', 'طائرة-خاصة', 'cost', 1))
    );
  exception
    when others then
      v_raised := true;
      get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if not v_raised or v_hint is distinct from 'invalid-input' then
    raise exception '(ك-٣) فئة مجهولة قُبلت (رُفض=% رمز=%)', v_raised, coalesce(v_hint, 'بلا');
  end if;

  -- (ك-٤) نطاق خارج الحدود يُرفض
  v_raised := false;
  begin
    perform 1 from public.upsert_price_list(
      v_id, 'COVERAGE_TESTS دورة الاعتماد',
      'القاهرة', 30.044400, 31.235700, 900,
      'الغردقة', 27.257900, 33.812900, 30, true, null
    );
  exception
    when others then
      v_raised := true;
      get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if not v_raised or v_hint is distinct from 'invalid-input' then
    raise exception '(ك-٤) نطاق ٩٠٠ كم قُبل (رُفض=% رمز=%)', v_raised, coalesce(v_hint, 'بلا');
  end if;

  -- (ك-٥) الإرسال للمراجعة
  v_status := public.submit_price_list(v_id);
  if v_status <> 'pending' then
    raise exception '(ك-٥) الإرسال للمراجعة: توقعنا pending وحصلنا «%»', v_status;
  end if;

  -- (ك-٦) المتعهد لا يراجع قائمته
  v_raised := false;
  begin
    perform public.review_price_list(v_id, true, null);
  exception
    when others then
      v_raised := true;
      get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if not v_raised or v_hint is distinct from 'forbidden' then
    raise exception '(ك-٦) المتعهد اعتمد قائمته عبر الدالة (رُفض=% رمز=%)',
      v_raised, coalesce(v_hint, 'بلا');
  end if;

  if v_admin is null then
    raise notice '  ↳ (ك-٧..١١) تخطٍّ: بلا هوية مشرف';
    perform set_config('request.jwt.claim.sub', '', false);
    delete from public.price_lists pl where pl.id = v_id;
    return;
  end if;

  -- (ك-٧) الرفض بلا سبب مرفوض
  perform set_config('request.jwt.claim.sub', v_admin, false);
  v_raised := false;
  begin
    perform public.review_price_list(v_id, false, '   ');
  exception
    when others then
      v_raised := true;
      get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if not v_raised or v_hint is distinct from 'invalid-input' then
    raise exception '(ك-٧) الرفض بلا سبب قُبل (رُفض=% رمز=%)', v_raised, coalesce(v_hint, 'بلا');
  end if;

  -- (ك-٨) الاعتماد
  v_status := public.review_price_list(v_id, true, 'أسعار منطقية');
  if v_status <> 'approved' then
    raise exception '(ك-٨) الاعتماد: توقعنا approved وحصلنا «%»', v_status;
  end if;

  -- (ك-٩) تعديل المتعهد لقائمة معتمدة يعيدها pending تلقائياً
  perform set_config('request.jwt.claim.sub', v_prof_a::text, false);
  select * into v_res from public.upsert_price_list(
    v_id, 'COVERAGE_TESTS دورة الاعتماد',
    'القاهرة', 30.044400, 31.235700, 35,
    'الغردقة', 27.257900, 33.812900, 30,
    true, jsonb_build_array(jsonb_build_object('classSlug', v_c1, 'cost', 2600))
  );
  if v_res.status <> 'pending' then
    raise exception '(ك-٩) تعديل قائمة معتمدة: توقعنا pending وحصلنا «%»', v_res.status;
  end if;

  select pl.review_note into v_hint from public.price_lists pl where pl.id = v_id;
  if v_hint is not null then
    raise exception '(ك-١٠) ملاحظة المراجعة لم تُمسح بعد التعديل («%»)', v_hint;
  end if;

  -- (ك-١١) وتغيير **سعر** داخل قائمة معتمدة يعيدها pending كذلك (مُشغّل الأصناف)
  perform set_config('request.jwt.claim.sub', v_admin, false);
  perform public.review_price_list(v_id, true, 'اعتماد ثانٍ');

  perform set_config('request.jwt.claim.sub', v_prof_a::text, false);
  update public.price_list_items pli set cost = cost + 10 where pli.price_list_id = v_id;

  select pl.status into v_status from public.price_lists pl where pl.id = v_id;
  if v_status <> 'pending' then
    raise exception '(ك-١١) تعديل السعر داخل قائمة معتمدة أبقاها «%»', v_status;
  end if;

  perform set_config('request.jwt.claim.sub', '', false);
  delete from public.price_lists pl where pl.id = v_id;

  raise notice '✔ (ك) دورة الاعتماد: مسودة ← مراجعة ← اعتماد، وأي تعديل يعيدها pending';
exception
  when others then
    perform set_config('request.jwt.claim.sub', '', false);
    raise;
end;
$$;

-- ----------------------------------------------------------------------------
-- (ل) التنظيف — إزالة كل ما أنشأه الملف وإعادة الجلسة والإعدادات كما كانت
-- ----------------------------------------------------------------------------
do $$
declare
  v_settings jsonb := current_setting('tours.cov_settings', true)::jsonb;
  v_admin    uuid  := nullif(current_setting('tours.cov_admin', true), '')::uuid;
  v_fixture  text  := current_setting('tours.cov_admin_fixture', true);
  v_left     integer;
begin
  if v_settings is not null then
    update public.pricing_settings
       set peak_enabled      = (v_settings ->> 'peak_enabled')::boolean,
           peak_percent      = (v_settings ->> 'peak_percent')::numeric,
           margin_type       = v_settings ->> 'margin_type',
           margin_value      = (v_settings ->> 'margin_value')::numeric,
           margin_min_amount = (v_settings ->> 'margin_min_amount')::numeric
     where id = true;
  end if;

  delete from public.notifications n
   where n.payload ->> 'bookingId' in (
         select b.id::text from public.bookings b
          where b.trip ->> 'notes' = 'COVERAGE_TESTS_FIXTURE');
  delete from public.bookings b where b.trip ->> 'notes' = 'COVERAGE_TESTS_FIXTURE';
  delete from public.price_lists pl where pl.title like 'COVERAGE_TESTS%';
  delete from public.subcontractors s where s.company_name like 'COVERAGE_TESTS%';
  delete from public.profiles p
   where p.id in ('c2000000-0000-4000-8000-00000000000a'::uuid,
                  'c2000000-0000-4000-8000-00000000000b'::uuid);
  begin
    delete from auth.users u
     where u.id in ('c2000000-0000-4000-8000-00000000000a'::uuid,
                    'c2000000-0000-4000-8000-00000000000b'::uuid);
  exception when others then null;
  end;

  if v_fixture = '1' and v_admin is not null then
    delete from public.profiles p where p.id = v_admin;
    begin
      delete from auth.users u where u.id = v_admin;
    exception when others then null;
    end;
  end if;

  select count(*) into v_left
  from public.subcontractors s where s.company_name like 'COVERAGE_TESTS%';
  if v_left <> 0 then
    raise exception '(ل) بقي % متعهد اختبار بعد التنظيف', v_left;
  end if;

  select count(*) into v_left
  from public.bookings b where b.trip ->> 'notes' = 'COVERAGE_TESTS_FIXTURE';
  if v_left <> 0 then
    raise exception '(ل) بقي % حجز اختبار بعد التنظيف', v_left;
  end if;

  perform set_config('tours.cov_c1', '', false);
  perform set_config('tours.cov_c2', '', false);
  perform set_config('tours.cov_cost_a', '', false);
  perform set_config('tours.cov_cost_b', '', false);
  perform set_config('tours.cov_settings', '', false);
  perform set_config('tours.cov_admin', '', false);
  perform set_config('tours.cov_admin_fixture', '', false);
  perform set_config('tours.cov_identities', '', false);
  perform set_config('request.jwt.claim.sub', '', false);

  raise notice '✔ (ل) التنظيف تم — لا صفوف اختبار متبقية والإعدادات كما كانت';
end;
$$;

-- ----------------------------------------------------------------------------
-- الخلاصة
-- ----------------------------------------------------------------------------
do $$
begin
  raise notice 'ALL PASSED — كل اختبارات التغطية والهامش ولقطة الحجز نجحت';
end;
$$;
