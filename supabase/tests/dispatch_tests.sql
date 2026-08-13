-- ============================================================================
-- dispatch_tests.sql — اختبارات قبول للبث والإسناد الذرّي
--                      (المرحلة ٦: هجرة 0013_dispatch.sql)
--
-- كيف تشغّله: `pnpm db:test dispatch` أو الصق الملف كاملاً في SQL Editor واضغط Run.
-- النجاح = آخر سطر «ALL PASSED». أي فشل يرمي exception برسالة عربية تحدد
-- الاختبار والقيمة المتوقعة والفعلية.
--
-- ومن psql بدور صاحب القاعدة **لا بد** من ON_ERROR_STOP و‑1 معاً:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f supabase/tests/dispatch_tests.sql
-- الأول لأن psql بدونه يتابع بعد الكتلة الفاشلة فيطبع «ALL PASSED» رغم الفشل،
-- والثاني لأن الملف يعدّل إعدادات التسعير والبث مؤقتاً: مع ‑1 يتراجع كل شيء عند
-- أي فشل، ومع النجاح يعيدها قسم التنظيف (ل) كما كانت. ومشغّل المشروع
-- (`pnpm db:test dispatch`) ينفّذ الملف في معاملة واحدة أصلاً فيكفيه.
--
-- قابل لإعادة التنفيذ بلا حدود: كل صفوف الاختبار بمعرّفات ثابتة تبدأ بـ d0/d1/d2،
-- وتُمسح في بداية الملف ونهايته معاً (فحتى لو انهار تشغيل سابق في المنتصف يبدأ
-- التالي من أرض نظيفة).
--
-- الأرقام غير مثبتة في الكود: تكلفة المتعهد الأول ثابتة، ثم تُشتق تكاليف الباقين
-- من **الهامش الفعلي الذي سجّله الحجز**، فتبقى الاختبارات صحيحة مهما عاير المالك
-- التعريفة أو نسبة الهامش من اللوحة.
--
-- ── عن «القبولان المتزامنان» (شرط إغلاق المرحلة) ────────────────────────────
-- مشغّل الاختبارات ينفّذ الملف كله في **معاملة واحدة على اتصال واحد**، فلا سبيل
-- إلى اتصال ثانٍ من داخله. لذلك يثبت القسم (و) الاستحالة ثلاث مرات بثلاث طرق
-- مستقلة، وأقواها الأولى لأنها بنيوية لا سلوكية:
--   (١) الفهرس الفريد الجزئي `trip_offers (booking_id) where status='accepted'`
--       موجود وفريد ⇒ صفّان مقبولان لحجز واحد **مستحيلان** مهما تزامن القابلون.
--       ويُثبَت عملياً بمحاولة فرض قبول ثانٍ مباشرة على الجدول ورصد 23505.
--   (٢) accept_offer تقفل صف dispatches بـ `for update` قبل أي قراءة للعرض ⇒
--       القبولان يتسلسلان حتماً ولا يتسابقان.
--   (٣) القبول الثاني الحيّ بعد إسناد فعلي يرجع hint = 'already-assigned'.
-- ولمن أراد التجربة بيدين اثنتين (الدليل النهائي على قاعدة حيّة):
--   جلسة ١: begin; select accept_offer('<عرض المتعهد أ>');            -- بلا commit
--   جلسة ٢: select accept_offer('<عرض المتعهد ب>');                   -- تتجمّد منتظرة القفل
--   جلسة ١: commit;  ⇒ الجلسة ٢ تُكمل فوراً وترفع «سبقك متعهد آخر» (already-assigned)
--
-- ⇢ نُفِّذت هذه التجربة فعلاً على قاعدة Postgres 18 محلية بنسخة كاملة من الهجرات
--   0001–0013 وبعرضين معلّقين بنفس التكلفة على الحجز نفسه، والمرصود:
--     الجلسة ٢ نادت accept_offer بعد ١٫١ ثانية من قبول الجلسة ١، **فتجمّدت**
--     ٢٫٩ ثانية على قفل صف dispatches، ثم أُفرج عنها في نفس ملّي ثانية COMMIT
--     الجلسة ١ فرفعت: ERROR «سبقك متعهد آخر إلى هذا الطلب» / HINT already-assigned.
--     والحصيلة في القاعدة: عرض واحد accepted وآخر revoked، ودورة واحدة assigned،
--     والحجز assigned — أي فائز واحد لا اثنان.
--
-- المرجع: lib/dispatch-types.ts (العقد) + docs/VISION.md («المتعهدون» + ملحق ٢)
--         + supabase/migrations/0013_dispatch.sql.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (٠) الشروط المسبقة + تنظيف أي بقايا + حفظ الإعدادات
-- ----------------------------------------------------------------------------
do $$
declare
  v_missing text;
  v_classes text[];
  v_rows    integer;
begin
  select string_agg(x.sig, '، ')
    into v_missing
  from (values
    ('public.start_dispatch(uuid)'),
    ('public.accept_offer(uuid)'),
    ('public.reject_offer(uuid, text)'),
    ('public.dispatch_tick()'),
    ('public.manual_assign(uuid, uuid, numeric, text)'),
    ('public.portal_offers()'),
    ('public.portal_trips()'),
    ('public.dispatch_pool(uuid, integer)'),
    ('public.dispatch_ceiling(uuid, integer)'),
    ('public.current_subcontractor_id()'),
    ('public.create_booking(jsonb, jsonb, integer, boolean, numeric, numeric, numeric, text, text, text, text, text, text, timestamptz, text, text, timestamptz, integer, jsonb)')
  ) as x(sig)
  where to_regprocedure(x.sig) is null;

  if v_missing is not null then
    raise exception 'شرط مسبق: دوال مفقودة (نفّذ 0013_dispatch.sql أولاً): %', v_missing;
  end if;

  select string_agg(x.rel, '، ')
    into v_missing
  from (values
    ('public.dispatch_settings'), ('public.dispatches'), ('public.trip_offers'),
    ('public.bookings'), ('public.subcontractors'), ('public.price_lists'),
    ('public.price_list_items'), ('public.subcontractor_vehicles'), ('public.notifications')
  ) as x(rel)
  where to_regclass(x.rel) is null;

  if v_missing is not null then
    raise exception 'شرط مسبق: جداول مفقودة: %', v_missing;
  end if;

  select count(*) into v_rows from public.pricing_settings;
  if v_rows <> 1 then
    raise exception 'شرط مسبق: pricing_settings يجب أن يحوي صفاً واحداً (وجدنا %)', v_rows;
  end if;

  -- تنظيف بقايا تشغيل سابق (الإشعارات ← الحجوزات ← المتعهدون، والباقي بالتتالي)
  delete from public.notifications n
   where n.payload ->> 'bookingId' in (
         select b.id::text from public.bookings b
          where b.trip ->> 'notes' like 'DISPATCH_TESTS_FIXTURE%');
  delete from public.bookings b where b.trip ->> 'notes' like 'DISPATCH_TESTS_FIXTURE%';
  delete from public.subcontractors s where s.company_name like 'DISPATCH_TESTS%';
  delete from public.profiles p
   where p.id in ('d2000000-0000-4000-8000-00000000000a'::uuid,
                  'd2000000-0000-4000-8000-00000000000b'::uuid);
  begin
    delete from auth.users u
     where u.id in ('d2000000-0000-4000-8000-00000000000a'::uuid,
                    'd2000000-0000-4000-8000-00000000000b'::uuid);
  exception when others then null;
  end;

  -- الفئة المؤهلة لراكب واحد كما يرجعها المحرك نفسه لا تخميناً منّا
  select array_agg(q.class_slug order by q.capacity asc)
    into v_classes
  from public.quote_price(200, 1, false, 0) q;

  if v_classes is null or array_length(v_classes, 1) < 1 then
    raise exception 'شرط مسبق: لا فئة سيارة نشطة لها تعريفة — نفّذ بذرة 0005';
  end if;

  perform set_config('tours.d_class', v_classes[1], false);

  -- الإعدادات الأصلية (التسعير والبث) تُحفظ لتُعاد في قسم التنظيف
  perform set_config('tours.d_pricing', (
    select jsonb_build_object(
             'peak_enabled', ps.peak_enabled, 'peak_percent', ps.peak_percent,
             'margin_type', ps.margin_type, 'margin_value', ps.margin_value,
             'margin_min_amount', ps.margin_min_amount
           )::text
    from public.pricing_settings ps limit 1
  ), false);

  perform set_config('tours.d_dispatch', (
    select jsonb_build_object(
             'window_minutes', ds.window_minutes, 'max_rounds', ds.max_rounds,
             'auto_start', ds.auto_start, 'min_margin_amount', ds.min_margin_amount
           )::text
    from public.dispatch_settings ds limit 1
  ), false);

  -- إعدادات معلومة أثناء الاختبار: هامش ٢٠٪ بلا أرضية، بلا ذروة، موجتان،
  -- والبدء التلقائي مطفأ حتى لا تلتقط الدورة حجوزات مؤكدة أخرى في القاعدة.
  update public.pricing_settings
     set peak_enabled = false, margin_type = 'percent',
         margin_value = 20, margin_min_amount = 0
   where id = true;

  update public.dispatch_settings
     set window_minutes = 30, max_rounds = 2, auto_start = false, min_margin_amount = 0
   where id = true;

  raise notice '✔ (٠) الشروط المسبقة سليمة — فئة الاختبار «%»', v_classes[1];
end;
$$;

-- ----------------------------------------------------------------------------
-- (٠-ب) هوية المشرف — لازمة لاختبارات الصلاحيات والإسناد اليدوي
-- ----------------------------------------------------------------------------
do $$
declare
  v_admin uuid;
begin
  perform set_config('tours.d_admin', '', false);
  perform set_config('tours.d_admin_fixture', '0', false);

  select p.id into v_admin from public.profiles p where p.role = 'admin' limit 1;

  if v_admin is null then
    begin
      v_admin := 'd2000000-0000-4000-8000-0000000000ad'::uuid;
      delete from public.profiles p where p.id = v_admin;
      delete from auth.users u where u.id = v_admin;
      insert into auth.users (id, email) values (v_admin, 'dispatch-tests-admin@local.invalid');
      insert into public.profiles (id, role, full_name)
      values (v_admin, 'admin', 'مشرف اختبار مؤقت')
      on conflict (id) do update set role = 'admin';
      perform set_config('tours.d_admin_fixture', '1', false);
      raise notice '  ↳ أُنشئ مشرف اختبار مؤقت (سيُحذف في النهاية)';
    exception
      when others then
        v_admin := null;
        raise notice '  ↳ تعذّر إنشاء مشرف مؤقت (%) — ستُتخطّى اختبارات المشرف', sqlerrm;
    end;
  end if;

  if v_admin is not null then
    perform set_config('tours.d_admin', v_admin::text, false);
    raise notice '✔ (٠-ب) هوية المشرف جاهزة';
  else
    raise notice '⚠ (٠-ب) بلا هوية مشرف — أقسام الإسناد اليدوي ستُتخطّى';
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- (٠-ج) المتعهدون: المؤهل، والأغلى، والموقوف، ومن بلا مركبة
--
-- «أ» و«هـ» يُنشآن **قبل** الحجز لأن التسعير يقرأ قوائمهما؛ و«هـ» موقوف فيجب
-- ألّا يدخل التسعير رغم أنه الأرخص. أما «ب» و«ج» و«د» فتُشتق تكاليفهم من الهامش
-- الفعلي بعد إنشاء الحجز (القسم ٠-هـ)، فتصير حدود الموجات دقيقة لا تقريبية.
-- ----------------------------------------------------------------------------
do $$
declare
  v_a    constant uuid := 'd0000000-0000-4000-8000-00000000000a';
  v_e    constant uuid := 'd0000000-0000-4000-8000-00000000000e';
  v_la   constant uuid := 'd1000000-0000-4000-8000-00000000000a';
  v_le   constant uuid := 'd1000000-0000-4000-8000-00000000000e';
  v_cls  text := current_setting('tours.d_class', true);
  v_cost numeric := 1500;
begin
  perform set_config('tours.d_cost_a', v_cost::text, false);

  insert into public.subcontractors (id, company_name, phone, email, status)
  values
    (v_a, 'DISPATCH_TESTS المتعهد أ', '01000000001', 'dispatch-a@local.invalid', 'approved'),
    (v_e, 'DISPATCH_TESTS الموقوف هـ', '01000000005', 'dispatch-e@local.invalid', 'suspended');

  -- مركبة في الفئة المحجوزة — شرط دخول الحوض
  insert into public.subcontractor_vehicles (subcontractor_id, class_slug, label, active)
  values (v_a, v_cls, 'مركبة اختبار أ', true),
         (v_e, v_cls, 'مركبة اختبار هـ', true);

  -- القاهرة ← الإسكندرية بنطاقَي ٤٠ كم (نفس مثال الرؤية)
  insert into public.price_lists
    (id, subcontractor_id, title, origin_label, origin_lat, origin_lng, origin_radius_km,
     dest_label, dest_lat, dest_lng, dest_radius_km, bidirectional, status)
  values
    (v_la, v_a, 'DISPATCH_TESTS قائمة أ', 'القاهرة', 30.044400, 31.235700, 40,
     'الإسكندرية', 31.200100, 29.918700, 40, true, 'approved'),
    (v_le, v_e, 'DISPATCH_TESTS قائمة هـ', 'القاهرة', 30.044400, 31.235700, 40,
     'الإسكندرية', 31.200100, 29.918700, 40, true, 'approved');

  insert into public.price_list_items (price_list_id, class_slug, cost)
  values (v_la, v_cls, v_cost),
         (v_le, v_cls, v_cost - 100);   -- الأرخص لكنه موقوف: يجب ألّا يُسعَّر به

  raise notice '✔ (٠-ج) متعهد مؤهل بتكلفة % وآخر موقوف أرخص منه', v_cost;
end;
$$;

-- ----------------------------------------------------------------------------
-- (٠-د) الحجز المؤكَّد الأول — ولقطة سعره هي مرجع سقوف الموجات
-- ----------------------------------------------------------------------------
do $$
declare
  v_cls   text := current_setting('tours.d_class', true);
  v_cost  numeric := current_setting('tours.d_cost_a', true)::numeric;
  v_res   record;
  v_b     record;
begin
  select * into v_res from public.create_booking(
    jsonb_build_object('label', 'مصر الجديدة، القاهرة', 'lat', 30.080800, 'lng', 31.322200),
    jsonb_build_object('label', '١٢ شارع الجيش، المعمورة، الإسكندرية', 'lat', 31.279000, 'lng', 30.017000),
    1, false, 0,
    220, null, 'test',
    v_cls, 'full',
    'عميل اختبار البث', '01111111111', null, now() + interval '2 days',
    'DISPATCH_TESTS_FIXTURE — كلّمني على 01001234567 أو bad@example.com قبل الموعد'
  );

  perform set_config('tours.d_booking1', v_res.id::text, false);

  select b.* into v_b from public.bookings b where b.id = v_res.id;

  if coalesce(v_b.price_source, '') <> 'subcontractor' then
    raise exception '(٠-د) مصدر سعر الحجز «%» — المتوقع subcontractor', coalesce(v_b.price_source, 'بلا');
  end if;

  if v_b.subcontractor_cost is distinct from v_cost then
    raise exception '(٠-د) تكلفة الحجز المسجَّلة % — المتوقع % (الموقوف تسرّب إلى التسعير؟)',
      coalesce(v_b.subcontractor_cost::text, 'بلا'), v_cost;
  end if;

  if coalesce(v_b.margin_amount, 0) <= 0 then
    raise exception '(٠-د) هامش الحجز % — الاختبارات تحتاج هامشاً موجباً',
      coalesce(v_b.margin_amount::text, 'بلا');
  end if;

  perform set_config('tours.d_margin', v_b.margin_amount::text, false);
  perform set_config('tours.d_total',  v_b.total::text, false);

  -- إلى «مؤكَّد» عبر الحارس نفسه لا حوله
  update public.bookings set status = 'under_review' where id = v_res.id;
  update public.bookings set status = 'confirmed'    where id = v_res.id;

  raise notice '✔ (٠-د) حجز مؤكَّد % — تكلفة % وهامش % وإجمالي %',
    v_res.reference, v_b.subcontractor_cost, v_b.margin_amount, v_b.total;
end;
$$;

-- ----------------------------------------------------------------------------
-- (٠-هـ) بقية المتعهدين بتكاليف مشتقة من الهامش الفعلي
--   ب: داخل سقف الموجة ٢ وخارج سقف الموجة ١  (تكلفة + نصف الهامش)
--   ج: خارج السقفين معاً                      (تكلفة + الهامش + ٥٠٠)
--   د: بسعر «أ» تماماً لكن **بلا مركبة** في الفئة ⇒ لا يدخل الحوض أبداً
-- ----------------------------------------------------------------------------
do $$
declare
  v_b_id  constant uuid := 'd0000000-0000-4000-8000-00000000000b';
  v_c_id  constant uuid := 'd0000000-0000-4000-8000-00000000000c';
  v_d_id  constant uuid := 'd0000000-0000-4000-8000-00000000000d';
  v_lb    constant uuid := 'd1000000-0000-4000-8000-00000000000b';
  v_lc    constant uuid := 'd1000000-0000-4000-8000-00000000000c';
  v_ld    constant uuid := 'd1000000-0000-4000-8000-00000000000d';
  v_cls   text := current_setting('tours.d_class', true);
  v_cost  numeric := current_setting('tours.d_cost_a', true)::numeric;
  v_marg  numeric := current_setting('tours.d_margin', true)::numeric;
  v_cost_b numeric := round(v_cost + v_marg / 2, 2);
  v_cost_c numeric := round(v_cost + v_marg + 500, 2);
begin
  perform set_config('tours.d_cost_b', v_cost_b::text, false);

  insert into public.subcontractors (id, company_name, phone, email, status)
  values
    (v_b_id, 'DISPATCH_TESTS المتعهد ب', '01000000002', 'dispatch-b@local.invalid', 'approved'),
    (v_c_id, 'DISPATCH_TESTS الغالي ج',  '01000000003', 'dispatch-c@local.invalid', 'approved'),
    (v_d_id, 'DISPATCH_TESTS بلا مركبة د', '01000000004', 'dispatch-d@local.invalid', 'approved');

  insert into public.subcontractor_vehicles (subcontractor_id, class_slug, label, active)
  values (v_b_id, v_cls, 'مركبة اختبار ب', true),
         (v_c_id, v_cls, 'مركبة اختبار ج', true);
  -- «د» بلا مركبة عمداً

  insert into public.price_lists
    (id, subcontractor_id, title, origin_label, origin_lat, origin_lng, origin_radius_km,
     dest_label, dest_lat, dest_lng, dest_radius_km, bidirectional, status)
  values
    (v_lb, v_b_id, 'DISPATCH_TESTS قائمة ب', 'القاهرة', 30.044400, 31.235700, 40,
     'الإسكندرية', 31.200100, 29.918700, 40, true, 'approved'),
    (v_lc, v_c_id, 'DISPATCH_TESTS قائمة ج', 'القاهرة', 30.044400, 31.235700, 40,
     'الإسكندرية', 31.200100, 29.918700, 40, true, 'approved'),
    (v_ld, v_d_id, 'DISPATCH_TESTS قائمة د', 'القاهرة', 30.044400, 31.235700, 40,
     'الإسكندرية', 31.200100, 29.918700, 40, true, 'approved');

  insert into public.price_list_items (price_list_id, class_slug, cost)
  values (v_lb, v_cls, v_cost_b),
         (v_lc, v_cls, v_cost_c),
         (v_ld, v_cls, v_cost);

  raise notice '✔ (٠-هـ) تكاليف المتعهدين: أ=% ب=% ج=% د=% (بلا مركبة)',
    v_cost, v_cost_b, v_cost_c, v_cost;
end;
$$;

-- ----------------------------------------------------------------------------
-- (٠-و) هويتا دخول للمتعهدين «أ» و«ب» — أساس اختبارات العزل والخصوصية
-- ----------------------------------------------------------------------------
do $$
declare
  v_a      constant uuid := 'd0000000-0000-4000-8000-00000000000a';
  v_b      constant uuid := 'd0000000-0000-4000-8000-00000000000b';
  v_prof_a constant uuid := 'd2000000-0000-4000-8000-00000000000a';
  v_prof_b constant uuid := 'd2000000-0000-4000-8000-00000000000b';
begin
  perform set_config('tours.d_identities', '0', false);

  begin
    insert into auth.users (id, email) values
      (v_prof_a, 'dispatch-a@local.invalid'),
      (v_prof_b, 'dispatch-b@local.invalid');
    insert into public.profiles (id, role, full_name) values
      (v_prof_a, 'subcontractor', 'متعهد أ'),
      (v_prof_b, 'subcontractor', 'متعهد ب')
    on conflict (id) do update set role = 'subcontractor';
    update public.subcontractors set profile_id = v_prof_a where id = v_a;
    update public.subcontractors set profile_id = v_prof_b where id = v_b;
    perform set_config('tours.d_identities', '1', false);
    raise notice '✔ (٠-و) هويتا دخول جاهزتان للمتعهدين أ وب';
  exception
    when others then
      raise notice '⚠ (٠-و) تعذّر إنشاء هويتي دخول (%) — أقسام الخصوصية والقبول ستُتخطّى', sqlerrm;
  end;
end;
$$;

-- ----------------------------------------------------------------------------
-- (أ) start_dispatch — الحالة والسقف والحوض المؤهل
-- ----------------------------------------------------------------------------
do $$
declare
  v_b1     uuid := current_setting('tours.d_booking1', true)::uuid;
  v_a      constant uuid := 'd0000000-0000-4000-8000-00000000000a';
  v_b      constant uuid := 'd0000000-0000-4000-8000-00000000000b';
  v_c      constant uuid := 'd0000000-0000-4000-8000-00000000000c';
  v_d      constant uuid := 'd0000000-0000-4000-8000-00000000000d';
  v_e      constant uuid := 'd0000000-0000-4000-8000-00000000000e';
  v_cost   numeric := current_setting('tours.d_cost_a', true)::numeric;
  v_marg   numeric := current_setting('tours.d_margin', true)::numeric;
  v_res    record;
  v_row    record;
  v_n      integer;
  v_raised boolean;
  v_hint   text;
begin
  -- (أ-١) السقفان محسوبان من لقطة الحجز لا من إعدادات لحظة البث
  if public.dispatch_ceiling(v_b1, 1) is distinct from v_cost then
    raise exception '(أ-١) سقف الموجة ١ = % والمتوقع %',
      public.dispatch_ceiling(v_b1, 1), v_cost;
  end if;
  if public.dispatch_ceiling(v_b1, 2) is distinct from round(v_cost + v_marg, 2) then
    raise exception '(أ-١) سقف الموجة ٢ = % والمتوقع %',
      public.dispatch_ceiling(v_b1, 2), round(v_cost + v_marg, 2);
  end if;

  -- (أ-٢) حجز غير مؤكَّد لا يُبث عليه
  v_raised := false;
  begin
    perform public.start_dispatch(
      (select b.id from public.bookings b where b.status = 'pending_payment' limit 1)
    );
  exception
    when others then
      v_raised := true;
      get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if not v_raised then
    -- لا حجز غير مؤكَّد في القاعدة؟ نصنع الحالة صراحةً بحجز مُلغى لاحقاً
    raise notice '  ↳ (أ-٢) لا حجز غير مؤكَّد للاختبار — تخطٍّ';
  elsif coalesce(v_hint, '') not in ('booking-not-confirmed', 'invalid-input', 'booking-not-found') then
    raise exception '(أ-٢) رمز رفض غير المؤكَّد «%» — المتوقع booking-not-confirmed', coalesce(v_hint, 'بلا');
  end if;

  -- (أ-٣) البث الأول
  select * into v_res from public.start_dispatch(v_b1);

  if v_res.status <> 'broadcasting' or v_res.round <> 1 then
    raise exception '(أ-٣) بعد البدء: الحالة «%» والموجة % — المتوقع broadcasting/1',
      v_res.status, v_res.round;
  end if;
  if v_res.offers <> 1 then
    raise exception '(أ-٣) عدد عروض الموجة ١ = % — المتوقع ١ (المتعهد أ وحده)', v_res.offers;
  end if;

  -- (أ-٤) الحوض: «أ» وحده. ب أغلى من السقف، ج أغلى من السقفين،
  --       د بلا مركبة، هـ موقوف.
  select count(*) into v_n from public.trip_offers o where o.booking_id = v_b1;
  if v_n <> 1 then
    raise exception '(أ-٤) عدد صفوف العروض % — المتوقع ١', v_n;
  end if;

  select o.* into v_row from public.trip_offers o where o.booking_id = v_b1;
  if v_row.subcontractor_id <> v_a then
    raise exception '(أ-٤) صاحب العرض ليس المتعهد أ';
  end if;
  if v_row.payout is distinct from v_cost then
    raise exception '(أ-٤) مستحق العرض % — المتوقع % (تكلفة المتعهد نفسه)', v_row.payout, v_cost;
  end if;
  if v_row.status <> 'pending' or v_row.round <> 1 then
    raise exception '(أ-٤) حالة العرض «%» وموجته % — المتوقع pending/1', v_row.status, v_row.round;
  end if;
  if v_row.expires_at <= now() then
    raise exception '(أ-٤) مهلة العرض منتهية لحظة إنشائه';
  end if;

  if exists (select 1 from public.trip_offers o
              where o.booking_id = v_b1 and o.subcontractor_id in (v_b, v_c, v_d, v_e)) then
    raise exception '(أ-٤) دخل الحوضَ من لا يستحق (أغلى من السقف أو بلا مركبة أو موقوف)';
  end if;

  -- (أ-٥) صف الدورة
  select d.* into v_row from public.dispatches d where d.booking_id = v_b1;
  if v_row.status <> 'broadcasting' or v_row.round <> 1 or v_row.last_broadcast_at is null then
    raise exception '(أ-٥) صف الدورة غير مضبوط (حالة % موجة %)', v_row.status, v_row.round;
  end if;

  -- (أ-٦) إشعار عرض واحد لكل متعهد مبثوث عليه
  select count(*) into v_n from public.notifications n
   where n.event = 'trip_offered' and n.payload ->> 'bookingId' = v_b1::text;
  if v_n <> 1 then
    raise exception '(أ-٦) إشعارات العرض % — المتوقع ١', v_n;
  end if;

  -- (أ-٧) إعادة النداء لا تضاعف العروض ولا تجدد المهلة
  select * into v_res from public.start_dispatch(v_b1);
  if v_res.offers <> 0 then
    raise exception '(أ-٧) النداء المكرر أنشأ % عرضاً — المتوقع صفر', v_res.offers;
  end if;
  select count(*) into v_n from public.trip_offers o where o.booking_id = v_b1;
  if v_n <> 1 then
    raise exception '(أ-٧) بعد النداء المكرر صار عدد العروض %', v_n;
  end if;

  raise notice '✔ (أ) البث الأول: الحوض = من تكلفته داخل سقف الموجة وله مركبة في الفئة، والنداء المكرر بلا أثر';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ب) الخصوصية قبل القبول — بنيوية في نوع الإرجاع، لا تنقيحاً في الواجهة
-- ----------------------------------------------------------------------------
do $$
declare
  v_ident  text := current_setting('tours.d_identities', true);
  v_prof_a constant uuid := 'd2000000-0000-4000-8000-00000000000a';
  v_prof_b constant uuid := 'd2000000-0000-4000-8000-00000000000b';
  v_leak   text;
  v_row    record;
  v_n      integer;
begin
  -- (ب-١) نوع إرجاع portal_offers لا يحمل عمود عميل أصلاً.
  --
  -- الفحص من pg_proc مباشرة لا من information_schema.parameters: الأخيرة تسمّي
  -- أعمدة `returns table` بـ OUT في بعض إصدارات Postgres وTABLE في أخرى، فشرط
  -- `parameter_mode = 'TABLE'` ينجح **بلا أن يفحص شيئاً**. ولذلك يبدأ القسم
  -- بشاهد إيجابي: لو لم نجد عمود payout فآلية الفحص نفسها معطلة.
  if not exists (
    select 1
    from pg_proc p,
         unnest(p.proargnames, p.proargmodes) as a(argname, argmode)
    where p.oid = 'public.portal_offers()'::regprocedure
      and a.argmode in ('o', 't')
      and a.argname = 'payout'
  ) then
    raise exception '(ب-١) آلية فحص نوع الإرجاع معطلة — لم نجد عمود payout في portal_offers';
  end if;

  select string_agg(a.argname, '، ')
    into v_leak
  from pg_proc p,
       unnest(p.proargnames, p.proargmodes) as a(argname, argmode)
  where p.oid = 'public.portal_offers()'::regprocedure
    and a.argmode in ('o', 't')
    and (a.argname ilike '%customer%'
      or a.argname in ('total', 'margin_amount', 'subcontractor_cost', 'phone', 'whatsapp',
                       'customer_name', 'customer_phone', 'customer_whatsapp'));
  if v_leak is not null then
    raise exception '(ب-١) ثغرة خصوصية: portal_offers تُرجع عمود عميل/سعر (%)', v_leak;
  end if;

  -- وportal_trips تحملها (وإلا لا يستطيع المتعهد تنفيذ الرحلة)
  if not exists (
    select 1
    from pg_proc p,
         unnest(p.proargnames, p.proargmodes) as a(argname, argmode)
    where p.oid = 'public.portal_trips()'::regprocedure
      and a.argmode in ('o', 't')
      and a.argname = 'customer_phone'
  ) then
    raise exception '(ب-١) portal_trips لا تُرجع هاتف العميل — المتعهد لا يستطيع التنفيذ';
  end if;

  if v_ident is distinct from '1' then
    raise notice '  ↳ (ب-٢..٦) تخطٍّ: بلا هويتي دخول';
    return;
  end if;

  -- (ب-٢) بهوية «أ»: عرض واحد بمستحقه هو
  perform set_config('request.jwt.claim.sub', v_prof_a::text, false);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_prof_a)::text, false);

  select count(*) into v_n from public.portal_offers();
  if v_n <> 1 then
    raise exception '(ب-٢) portal_offers أرجعت % صفاً للمتعهد أ — المتوقع ١', v_n;
  end if;

  select * into v_row from public.portal_offers();

  if v_row.payout is distinct from current_setting('tours.d_cost_a', true)::numeric then
    raise exception '(ب-٢) المستحق المعروض % — المتوقع تكلفة المتعهد نفسه', v_row.payout;
  end if;

  -- (ب-٣) الملاحظة منقّحة: لا هاتف ولا بريد
  if v_row.notes is null or v_row.notes not like 'DISPATCH_TESTS_FIXTURE%' then
    raise exception '(ب-٣) الملاحظة اختفت كلياً — المتوقع نصها بلا وسائل تواصل (%)',
      coalesce(v_row.notes, 'بلا');
  end if;
  if v_row.notes like '%01001234567%' then
    raise exception '(ب-٣) ثغرة خصوصية: رقم هاتف العميل ظهر في ملاحظة العرض';
  end if;
  if v_row.notes like '%@%' then
    raise exception '(ب-٣) ثغرة خصوصية: بريد العميل ظهر في ملاحظة العرض';
  end if;

  -- (ب-٤) العنوان الدقيق مُعمَّم: لا رقم عقار في وسم الوصول
  if v_row.dest_label ~ '[0-9٠-٩]' then
    raise exception '(ب-٤) ثغرة خصوصية: وسم الوصول يحمل رقماً («%»)', v_row.dest_label;
  end if;
  if v_row.dest_label not like '%المعمورة%' and v_row.dest_label not like '%الإسكندرية%' then
    raise exception '(ب-٤) وسم الوصول فقد معناه الجغرافي («%»)', v_row.dest_label;
  end if;

  -- (ب-٥) حمولة إشعار العرض بلا أي حقل عميل
  if exists (
    select 1 from public.notifications n
    where n.event = 'trip_offered'
      and n.payload ->> 'bookingId' = current_setting('tours.d_booking1', true)
      and (n.payload ? 'customerName' or n.payload ? 'customerPhone'
        or n.payload ? 'customerWhatsapp' or n.payload ? 'total')
  ) then
    raise exception '(ب-٥) ثغرة خصوصية: حمولة trip_offered تحمل بيانات عميل أو سعره';
  end if;

  -- (ب-٦) المتعهد «ب» لا عروض له الآن
  perform set_config('request.jwt.claim.sub', v_prof_b::text, false);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_prof_b)::text, false);
  select count(*) into v_n from public.portal_offers();
  if v_n <> 0 then
    raise exception '(ب-٦) portal_offers أرجعت % صفاً للمتعهد ب وهو خارج الموجة ١', v_n;
  end if;

  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claims', '', false);
  raise notice '✔ (ب) قبل القبول: لا اسم ولا هاتف ولا عنوان دقيق ولا سعر عميل — ومستحقه وحده';
exception
  when others then
    perform set_config('request.jwt.claim.sub', '', false);
    perform set_config('request.jwt.claims', '', false);
    raise;
end;
$$;

-- ----------------------------------------------------------------------------
-- (ج) عزل متعهد ضد متعهد — لا قراءة ولا قبول لعرض الغير
-- ----------------------------------------------------------------------------
do $$
declare
  v_ident  text := current_setting('tours.d_identities', true);
  v_b1     uuid := current_setting('tours.d_booking1', true)::uuid;
  v_prof_a constant uuid := 'd2000000-0000-4000-8000-00000000000a';
  v_prof_b constant uuid := 'd2000000-0000-4000-8000-00000000000b';
  v_offer  uuid;
  v_seen   integer;
  v_raised boolean;
  v_hint   text;
  v_status text;
begin
  if v_ident is distinct from '1' then
    raise notice '  ↳ (ج) تخطٍّ: بلا هويتي دخول';
    return;
  end if;

  select o.id into v_offer from public.trip_offers o where o.booking_id = v_b1 limit 1;

  -- (ج-١) لا سياسة على جداول البث تستهدف anon
  select count(*) into v_seen
  from pg_policies p
  where p.schemaname = 'public'
    and p.tablename in ('dispatches', 'trip_offers', 'dispatch_settings')
    and 'anon' = any (p.roles);
  if v_seen <> 0 then
    raise exception '(ج-١) توجد % سياسة تستهدف anon على جداول البث', v_seen;
  end if;

  -- (ج-٢) «ب» لا يقرأ صف عرض «أ» عبر RLS
  perform set_config('request.jwt.claim.sub', v_prof_b::text, false);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_prof_b)::text, false);
  begin
    execute 'set local role authenticated';
    select count(*) into v_seen from public.trip_offers o where o.booking_id = v_b1;
    execute 'reset role';
  exception
    when others then
      execute 'reset role';
      raise;
  end;
  if v_seen <> 0 then
    raise exception '(ج-٢) ثغرة عزل: المتعهد ب قرأ % من عروض غيره', v_seen;
  end if;

  -- (ج-٣) ولا يقرأ صف دورة البث إطلاقاً (فيه هوية الفائز ومستحقه)
  begin
    execute 'set local role authenticated';
    select count(*) into v_seen from public.dispatches d where d.booking_id = v_b1;
    execute 'reset role';
  exception
    when others then
      execute 'reset role';
      raise;
  end;
  if v_seen <> 0 then
    raise exception '(ج-٣) ثغرة عزل: المتعهد قرأ صف دورة البث';
  end if;

  -- (ج-٤) ولا إعدادات البث (استراتيجية الموجات والهامش)
  begin
    execute 'set local role authenticated';
    select count(*) into v_seen from public.dispatch_settings;
    execute 'reset role';
  exception
    when others then
      execute 'reset role';
      raise;
  end;
  if v_seen <> 0 then
    raise exception '(ج-٤) ثغرة: المتعهد يقرأ إعدادات البث';
  end if;

  -- (ج-٥) ولا يقبل عرض غيره — والعرض يبقى كما هو
  v_raised := false;
  begin
    perform public.accept_offer(v_offer);
  exception
    when others then
      v_raised := true;
      get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if not v_raised then
    raise exception '(ج-٥) ثغرة فادحة: المتعهد ب قبل عرضاً مبثوثاً على «أ»';
  end if;
  if coalesce(v_hint, '') <> 'forbidden' then
    raise exception '(ج-٥) رمز الرفض «%» — المتوقع forbidden', coalesce(v_hint, 'بلا');
  end if;

  select o.status into v_status from public.trip_offers o where o.id = v_offer;
  if v_status <> 'pending' then
    raise exception '(ج-٥) تغيّرت حالة العرض إلى «%» بعد محاولة فاشلة', v_status;
  end if;

  -- (ج-٦) ولا يرفضه
  v_raised := false;
  begin
    perform public.reject_offer(v_offer, 'محاولة رفض عرض الغير');
  exception
    when others then
      v_raised := true;
      get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if not v_raised or coalesce(v_hint, '') <> 'forbidden' then
    raise exception '(ج-٦) المتعهد ب رفض عرض «أ» (رُفض=% رمز=%)', v_raised, coalesce(v_hint, 'بلا');
  end if;

  -- (ج-٧) ولا يشغّل عمليات التشغيل (البث والإسناد اليدوي والدورة)
  v_raised := false;
  begin
    perform public.start_dispatch(v_b1);
  exception
    when others then
      v_raised := true;
      get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if not v_raised or coalesce(v_hint, '') <> 'forbidden' then
    raise exception '(ج-٧) المتعهد بدأ البث بنفسه (رُفض=% رمز=%)', v_raised, coalesce(v_hint, 'بلا');
  end if;

  v_raised := false;
  begin
    perform public.dispatch_tick();
  exception
    when others then
      v_raised := true;
      get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if not v_raised or coalesce(v_hint, '') <> 'forbidden' then
    raise exception '(ج-٧) المتعهد شغّل دورة البث (رُفض=% رمز=%)', v_raised, coalesce(v_hint, 'بلا');
  end if;

  v_raised := false;
  begin
    perform public.manual_assign(v_b1, 'd0000000-0000-4000-8000-00000000000b'::uuid, 1, 'محاولة');
  exception
    when others then
      v_raised := true;
      get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if not v_raised or coalesce(v_hint, '') <> 'forbidden' then
    raise exception '(ج-٧) المتعهد أسند الطلب لنفسه (رُفض=% رمز=%)', v_raised, coalesce(v_hint, 'بلا');
  end if;

  -- (ج-٨) 🔒 ولا يكتب في جدول العروض مباشرةً: لو استطاع لَقَبِل نفسه بنفسه
  -- متجاوزاً القفل والفهرس معاً. والرفض هنا **صفر صفوف** لا استثناء (فخّ
  -- التحديث الصامت) — ولذلك يُقاس بعدد الصفوف لا بوقوع خطأ.
  perform set_config('request.jwt.claim.sub', v_prof_a::text, false);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_prof_a)::text, false);
  begin
    execute 'set local role authenticated';
    update public.trip_offers o set status = 'accepted' where o.id = v_offer;
    get diagnostics v_seen = row_count;
    execute 'reset role';
  exception
    when others then
      execute 'reset role';
      v_seen := 0;   -- الرفض باستثناء مقبول أيضاً
  end;
  if v_seen <> 0 then
    raise exception '(ج-٨) ثغرة فادحة: المتعهد قبل عرضه بكتابة مباشرة على الجدول (% صفاً)', v_seen;
  end if;

  select o.status into v_status from public.trip_offers o where o.id = v_offer;
  if v_status <> 'pending' then
    raise exception '(ج-٨) حالة العرض صارت «%» بكتابة مباشرة', v_status;
  end if;

  -- ولا يُدرج لنفسه عرضاً على حجز لم يُبث عليه
  begin
    execute 'set local role authenticated';
    insert into public.trip_offers (booking_id, subcontractor_id, round, payout, status, expires_at)
    values (v_b1, 'd0000000-0000-4000-8000-00000000000a'::uuid, 7, 1, 'accepted', now() + interval '1 hour');
    get diagnostics v_seen = row_count;
    execute 'reset role';
  exception
    when others then
      execute 'reset role';
      v_seen := 0;
  end;
  if v_seen <> 0 then
    raise exception '(ج-٨) ثغرة فادحة: المتعهد أنشأ لنفسه عرضاً مقبولاً';
  end if;

  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claims', '', false);
  raise notice '✔ (ج) العزل: لا قراءة ولا كتابة ولا قبول ولا رفض ولا تشغيل عبر المتعهدين';
exception
  when others then
    begin execute 'reset role'; exception when others then null; end;
    perform set_config('request.jwt.claim.sub', '', false);
    perform set_config('request.jwt.claims', '', false);
    raise;
end;
$$;

-- ----------------------------------------------------------------------------
-- (د) انتهاء المهلة ← الموجة الثانية بسقف أوسع
--
-- المهلة تُقدَّم زمنياً بدل الانتظار: `now()` مجمّدة داخل معاملة المشغّل، فتقديم
-- expires_at إلى الماضي هو المحاكاة الأمينة الوحيدة لمرور المهلة.
-- ----------------------------------------------------------------------------
do $$
declare
  v_b1    uuid := current_setting('tours.d_booking1', true)::uuid;
  v_a     constant uuid := 'd0000000-0000-4000-8000-00000000000a';
  v_b     constant uuid := 'd0000000-0000-4000-8000-00000000000b';
  v_c     constant uuid := 'd0000000-0000-4000-8000-00000000000c';
  v_cost  numeric := current_setting('tours.d_cost_a', true)::numeric;
  v_costb numeric := current_setting('tours.d_cost_b', true)::numeric;
  v_tick  record;
  v_row   record;
  v_n     integer;
begin
  update public.trip_offers o
     set expires_at = now() - interval '1 minute'
   where o.booking_id = v_b1 and o.status = 'pending';

  select * into v_tick from public.dispatch_tick();

  if v_tick.expired_offers < 1 then
    raise exception '(د-١) الدورة لم تُنهِ أي مهلة (%)', v_tick.expired_offers;
  end if;
  if v_tick.new_rounds < 1 then
    raise exception '(د-١) الدورة لم تفتح الموجة التالية (%)', v_tick.new_rounds;
  end if;

  select d.* into v_row from public.dispatches d where d.booking_id = v_b1;
  if v_row.status <> 'broadcasting' or v_row.round <> 2 then
    raise exception '(د-٢) بعد الدورة: الحالة «%» والموجة % — المتوقع broadcasting/2',
      v_row.status, v_row.round;
  end if;

  -- (د-٣) عرض الموجة ١ صار expired لا revoked ولا معلّقاً
  select o.status into v_row from public.trip_offers o
   where o.booking_id = v_b1 and o.round = 1;
  if v_row.status <> 'expired' then
    raise exception '(د-٣) حالة عرض الموجة ١ «%» — المتوقع expired', v_row.status;
  end if;

  -- (د-٤) الموجة ٢: «أ» (تجاهل لا رفض ⇒ يُعاد عليه) و«ب» (دخل بالسقف الأوسع)،
  --       و«ج» ما زال خارجاً
  select count(*) into v_n from public.trip_offers o
   where o.booking_id = v_b1 and o.round = 2 and o.status = 'pending';
  if v_n <> 2 then
    raise exception '(د-٤) عروض الموجة ٢ = % — المتوقع ٢ (أ وب)', v_n;
  end if;

  if not exists (select 1 from public.trip_offers o
                  where o.booking_id = v_b1 and o.round = 2 and o.subcontractor_id = v_a
                    and o.payout = v_cost) then
    raise exception '(د-٤) المتعهد أ فقد عرضه في الموجة ٢ أو تغيّر مستحقه';
  end if;
  if not exists (select 1 from public.trip_offers o
                  where o.booking_id = v_b1 and o.round = 2 and o.subcontractor_id = v_b
                    and o.payout = v_costb) then
    raise exception '(د-٤) المتعهد ب لم يدخل الموجة ٢ بمستحقه %', v_costb;
  end if;
  if exists (select 1 from public.trip_offers o
              where o.booking_id = v_b1 and o.subcontractor_id = v_c) then
    raise exception '(د-٤) المتعهد ج (أغلى من سقف التعادل) دخل البث';
  end if;

  -- (د-٥) إشعار انتهاء الموجة
  select count(*) into v_n from public.notifications n
   where n.event = 'dispatch_round_expired' and n.payload ->> 'bookingId' = v_b1::text;
  if v_n <> 1 then
    raise exception '(د-٥) إشعارات انتهاء الموجة % — المتوقع ١', v_n;
  end if;

  raise notice '✔ (د) انتهاء المهلة يفتح موجة أوسع: من تكلفته ≤ التكلفة + الهامش يدخل، وما فوقه لا';
end;
$$;

-- ----------------------------------------------------------------------------
-- (هـ) القبول الذرّي — الفائز يُغلق الطلب والخاسر يسمع «أُسند»
-- ----------------------------------------------------------------------------
do $$
declare
  v_ident   text := current_setting('tours.d_identities', true);
  v_b1      uuid := current_setting('tours.d_booking1', true)::uuid;
  v_a       constant uuid := 'd0000000-0000-4000-8000-00000000000a';
  v_b       constant uuid := 'd0000000-0000-4000-8000-00000000000b';
  v_prof_a  constant uuid := 'd2000000-0000-4000-8000-00000000000a';
  v_prof_b  constant uuid := 'd2000000-0000-4000-8000-00000000000b';
  v_cost    numeric := current_setting('tours.d_cost_a', true)::numeric;
  v_offer_a uuid;
  v_offer_b uuid;
  v_res     record;
  v_row     record;
  v_raised  boolean;
  v_hint    text;
  v_n       integer;
begin
  if v_ident is distinct from '1' then
    raise notice '  ↳ (هـ) تخطٍّ: بلا هويتي دخول';
    return;
  end if;

  select o.id into v_offer_a from public.trip_offers o
   where o.booking_id = v_b1 and o.round = 2 and o.subcontractor_id = v_a;
  select o.id into v_offer_b from public.trip_offers o
   where o.booking_id = v_b1 and o.round = 2 and o.subcontractor_id = v_b;

  perform set_config('tours.d_offer_b', v_offer_b::text, false);

  -- (هـ-١) «أ» يقبل
  perform set_config('request.jwt.claim.sub', v_prof_a::text, false);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_prof_a)::text, false);

  select * into v_res from public.accept_offer(v_offer_a);

  if v_res.booking_id is distinct from v_b1 or v_res.payout is distinct from v_cost then
    raise exception '(هـ-١) رد القبول غير متوقع (حجز % مستحق %)', v_res.booking_id, v_res.payout;
  end if;

  -- (هـ-٢) عرضه مقبول وعرض «ب» مسحوب
  select o.status into v_row from public.trip_offers o where o.id = v_offer_a;
  if v_row.status <> 'accepted' then
    raise exception '(هـ-٢) حالة عرض الفائز «%» — المتوقع accepted', v_row.status;
  end if;
  select o.status into v_row from public.trip_offers o where o.id = v_offer_b;
  if v_row.status <> 'revoked' then
    raise exception '(هـ-٢) حالة عرض المنافس «%» — المتوقع revoked', v_row.status;
  end if;

  -- (هـ-٣) دورة البث والحجز
  select d.* into v_row from public.dispatches d where d.booking_id = v_b1;
  if v_row.status <> 'assigned'
     or v_row.assigned_subcontractor_id <> v_a
     or v_row.assigned_payout is distinct from v_cost
     or v_row.manual_assign then
    raise exception '(هـ-٣) صف الدورة بعد القبول غير مضبوط (حالة % متعهد % مستحق %)',
      v_row.status, v_row.assigned_subcontractor_id, v_row.assigned_payout;
  end if;

  select b.status into v_row from public.bookings b where b.id = v_b1;
  if v_row.status <> 'assigned' then
    raise exception '(هـ-٣) حالة الحجز «%» — المتوقع assigned (عبر حارس الانتقالات)', v_row.status;
  end if;

  -- (هـ-٤) الانتقال مرّ بالحارس فسُجِّل في سجل الأحداث
  select count(*) into v_n from public.booking_events e
   where e.booking_id = v_b1 and e.to_status = 'assigned';
  if v_n <> 1 then
    raise exception '(هـ-٤) سجل الأحداث لا يحمل انتقال الإسناد (% صفاً)', v_n;
  end if;

  -- (هـ-٥) لقطة تسعير الحجز لم تُمس — أساس تقرير الهامش في المرحلة ٧
  select b.subcontractor_cost, b.margin_amount into v_row from public.bookings b where b.id = v_b1;
  if v_row.subcontractor_cost is distinct from v_cost then
    raise exception '(هـ-٥) الإسناد غيّر لقطة تكلفة الحجز (% )', v_row.subcontractor_cost;
  end if;

  -- (هـ-٦) إشعار الإسناد وفيه الهامش الحقيقي
  select count(*) into v_n from public.notifications n
   where n.event = 'trip_assigned' and n.payload ->> 'bookingId' = v_b1::text;
  if v_n <> 1 then
    raise exception '(هـ-٦) إشعارات الإسناد % — المتوقع ١', v_n;
  end if;
  if not exists (
    select 1 from public.notifications n
    where n.event = 'trip_assigned'
      and n.payload ->> 'bookingId' = v_b1::text
      and (n.payload ->> 'payout')::numeric = v_cost
      and (n.payload ->> 'realMargin')::numeric
          = round(current_setting('tours.d_total', true)::numeric - v_cost, 2)
  ) then
    raise exception '(هـ-٦) حمولة الإسناد بلا مستحق أو بلا هامش حقيقي صحيح';
  end if;

  -- (هـ-٧) «ب» يقبل بعد فوات الأوان ⇒ جواب نظيف لا انهيار
  perform set_config('request.jwt.claim.sub', v_prof_b::text, false);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_prof_b)::text, false);

  v_raised := false;
  begin
    perform public.accept_offer(v_offer_b);
  exception
    when others then
      v_raised := true;
      get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if not v_raised then
    raise exception '(هـ-٧) ثغرة فادحة: قَبِل متعهدان الطلب نفسه';
  end if;
  if coalesce(v_hint, '') <> 'already-assigned' then
    raise exception '(هـ-٧) رمز الخاسر «%» — المتوقع already-assigned', coalesce(v_hint, 'بلا');
  end if;

  -- (هـ-٨) ولا يظهر له الطلب في صندوقه بعد الإسناد
  select count(*) into v_n from public.portal_offers();
  if v_n <> 0 then
    raise exception '(هـ-٨) صندوق الخاسر ما زال يعرض % عرضاً', v_n;
  end if;

  -- (هـ-٩) والفائز نفسه لو أعاد القبول: نفس الجواب النظيف
  perform set_config('request.jwt.claim.sub', v_prof_a::text, false);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_prof_a)::text, false);
  v_raised := false;
  begin
    perform public.accept_offer(v_offer_a);
  exception
    when others then
      v_raised := true;
      get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if not v_raised or coalesce(v_hint, '') <> 'already-assigned' then
    raise exception '(هـ-٩) القبول المكرر من الفائز لم يُرَد بـ already-assigned (رُفض=% رمز=%)',
      v_raised, coalesce(v_hint, 'بلا');
  end if;

  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claims', '', false);
  raise notice '✔ (هـ) أول قابل يفوز: العروض تُسحب، والحجز يصير assigned عبر الحارس، والخاسر يسمع «أُسند»';
exception
  when others then
    perform set_config('request.jwt.claim.sub', '', false);
    perform set_config('request.jwt.claims', '', false);
    raise;
end;
$$;

-- ----------------------------------------------------------------------------
-- (و) 🔒 استحالة الفائزَين — شرط إغلاق المرحلة
--
-- ثلاث طبقات مستقلة: الفهرس الفريد الجزئي (بنيوي)، ثم قفل الصف بالترتيب
-- الصحيح (سلوكي)، ثم الجواب المُنمَّط للخاسر (تجربة حية في القسم هـ-٧).
-- ----------------------------------------------------------------------------
do $$
declare
  v_b1     uuid := current_setting('tours.d_booking1', true)::uuid;
  v_def    text;
  v_idx    text;
  v_isuniq boolean;
  v_offer  uuid;
  v_state  text;
  v_raised boolean := false;
begin
  -- (و-١) الفهرس موجود وفريد ومشروط بالمقبولة وحدها
  select i.indexdef into v_idx
  from pg_indexes i
  where i.schemaname = 'public' and i.tablename = 'trip_offers'
    and i.indexname = 'trip_offers_one_accepted_key';

  if v_idx is null then
    raise exception '(و-١) الفهرس الفريد الجزئي غير موجود — لا تُغلق المرحلة بدونه';
  end if;

  select ix.indisunique into v_isuniq
  from pg_class c
  join pg_index ix on ix.indexrelid = c.oid
  where c.relname = 'trip_offers_one_accepted_key';

  if not coalesce(v_isuniq, false) then
    raise exception '(و-١) فهرس الفائز الواحد غير فريد: %', v_idx;
  end if;
  if v_idx !~* 'where[[:space:]]*\(*[[:space:]]*status[[:space:]]*=' then
    raise exception '(و-١) شرط الفهرس ليس على الحالة: %', v_idx;
  end if;
  if v_idx !~* '\(booking_id\)' then
    raise exception '(و-١) الفهرس ليس على booking_id: %', v_idx;
  end if;

  -- (و-٢) المحاولة العملية: فرض قبول ثانٍ على الحجز نفسه مباشرة على الجدول
  --       (تجاوز الدوال كلها) ⇒ يجب أن تصطدم بـ 23505.
  insert into public.trip_offers (booking_id, subcontractor_id, round, payout, status, expires_at)
  values (v_b1, 'd0000000-0000-4000-8000-00000000000c'::uuid, 9, 1, 'pending', now() + interval '1 hour')
  returning id into v_offer;

  begin
    update public.trip_offers o set status = 'accepted' where o.id = v_offer;
  exception
    when unique_violation then
      v_raised := true;
  end;

  if not v_raised then
    raise exception '(و-٢) ثغرة فادحة: قُبل عرضان لحجز واحد — الفهرس الجزئي لا يحمي';
  end if;

  delete from public.trip_offers o where o.id = v_offer;

  -- (و-٣) accept_offer تقفل صف الدورة **قبل** قراءة العرض (ترتيب أقفال موحّد)
  v_def := pg_get_functiondef(to_regprocedure('public.accept_offer(uuid)'));
  if v_def !~* 'from public\.dispatches[^;]*for update' then
    raise exception '(و-٣) accept_offer لا تقفل صف dispatches بـ for update';
  end if;
  if v_def !~* 'from public\.trip_offers[^;]*for update' then
    raise exception '(و-٣) accept_offer لا تقفل صف العرض بـ for update';
  end if;
  if position('public.dispatches' in v_def) > position('for update' in v_def) then
    raise exception '(و-٣) ترتيب الأقفال معكوس: العرض يُقفل قبل دورة البث';
  end if;

  -- (و-٤) وحالة الحجز ما زالت مُسندة لمتعهد واحد
  select count(*)::text into v_state from public.trip_offers o
   where o.booking_id = v_b1 and o.status = 'accepted';
  if v_state <> '1' then
    raise exception '(و-٤) عدد العروض المقبولة لهذا الحجز % — المتوقع ١', v_state;
  end if;

  raise notice '✔ (و) فائز واحد بنيوياً: فهرس فريد جزئي + قفل صف الدورة أولاً + جواب مُنمَّط للخاسر';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ز) portal_trips — بيانات التنفيذ تظهر بعد الإسناد وحده
-- ----------------------------------------------------------------------------
do $$
declare
  v_ident  text := current_setting('tours.d_identities', true);
  v_b1     uuid := current_setting('tours.d_booking1', true)::uuid;
  v_prof_a constant uuid := 'd2000000-0000-4000-8000-00000000000a';
  v_prof_b constant uuid := 'd2000000-0000-4000-8000-00000000000b';
  v_row    record;
  v_n      integer;
begin
  if v_ident is distinct from '1' then
    raise notice '  ↳ (ز) تخطٍّ: بلا هويتي دخول';
    return;
  end if;

  perform set_config('request.jwt.claim.sub', v_prof_a::text, false);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_prof_a)::text, false);

  select count(*) into v_n from public.portal_trips();
  if v_n <> 1 then
    raise exception '(ز-١) رحلات الفائز % — المتوقع ١', v_n;
  end if;

  select * into v_row from public.portal_trips();
  if v_row.customer_phone is distinct from '01111111111' then
    raise exception '(ز-٢) هاتف العميل لم يظهر للمنفّذ بعد الإسناد (%)',
      coalesce(v_row.customer_phone, 'بلا');
  end if;
  if v_row.customer_name is null then
    raise exception '(ز-٢) اسم العميل لم يظهر للمنفّذ بعد الإسناد';
  end if;
  if v_row.payout is distinct from current_setting('tours.d_cost_a', true)::numeric then
    raise exception '(ز-٢) مستحق الرحلة المعروض % — المتوقع %',
      v_row.payout, current_setting('tours.d_cost_a', true);
  end if;
  -- العنوان الدقيق يظهر الآن (وهو ما كان مخفياً قبل القبول)
  if v_row.dest_label !~ '[0-9٠-٩]' then
    raise exception '(ز-٢) وسم الوصول بعد الإسناد ما زال معمَّماً («%») — المنفّذ يحتاج العنوان',
      v_row.dest_label;
  end if;
  if v_row.status <> 'assigned' then
    raise exception '(ز-٢) حالة الرحلة «%» — المتوقع assigned', v_row.status;
  end if;

  -- (ز-٣) الخاسر لا يرى الرحلة
  perform set_config('request.jwt.claim.sub', v_prof_b::text, false);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_prof_b)::text, false);
  select count(*) into v_n from public.portal_trips();
  if v_n <> 0 then
    raise exception '(ز-٣) ثغرة: الخاسر يرى % رحلة مُسندة لغيره', v_n;
  end if;

  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claims', '', false);
  raise notice '✔ (ز) بعد الإسناد وحده: اسم العميل وهاتفه والعنوان الدقيق للمنفّذ لا لغيره';
exception
  when others then
    perform set_config('request.jwt.claim.sub', '', false);
    perform set_config('request.jwt.claims', '', false);
    raise;
end;
$$;

-- ----------------------------------------------------------------------------
-- (ح) الرفض الصريح ← لا يُعاد عليه، ثم الاستنفاد ← الطابور اليدوي بإشعار
-- ----------------------------------------------------------------------------
do $$
declare
  v_ident constant text := current_setting('tours.d_identities', true);
  v_cls   text := current_setting('tours.d_class', true);
  v_a     constant uuid := 'd0000000-0000-4000-8000-00000000000a';
  v_b     constant uuid := 'd0000000-0000-4000-8000-00000000000b';
  v_prof_a constant uuid := 'd2000000-0000-4000-8000-00000000000a';
  v_res   record;
  v_tick  record;
  v_row   record;
  v_id    uuid;
  v_offer uuid;
  v_n     integer;
begin
  select * into v_res from public.create_booking(
    jsonb_build_object('label', 'مصر الجديدة، القاهرة', 'lat', 30.080800, 'lng', 31.322200),
    jsonb_build_object('label', 'المعمورة، الإسكندرية', 'lat', 31.279000, 'lng', 30.017000),
    1, false, 0,
    220, null, 'test',
    v_cls, 'full',
    'عميل اختبار الاستنفاد', '01222222222', null, now() + interval '3 days',
    'DISPATCH_TESTS_FIXTURE — حجز الاستنفاد'
  );
  v_id := v_res.id;
  perform set_config('tours.d_booking2', v_id::text, false);

  update public.bookings set status = 'under_review' where id = v_id;
  update public.bookings set status = 'confirmed'    where id = v_id;

  -- (ح-١) الموجة ١: «أ» وحده
  select * into v_res from public.start_dispatch(v_id);
  if v_res.offers <> 1 then
    raise exception '(ح-١) عروض الموجة ١ للحجز الثاني = % — المتوقع ١', v_res.offers;
  end if;

  select o.id into v_offer from public.trip_offers o
   where o.booking_id = v_id and o.subcontractor_id = v_a;

  -- (ح-٢) رفض صريح بسبب
  if v_ident = '1' then
    perform set_config('request.jwt.claim.sub', v_prof_a::text, false);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', v_prof_a)::text, false);

    if public.reject_offer(v_offer, 'مشغول في هذا التوقيت') <> 'rejected' then
      raise exception '(ح-٢) reject_offer لم تُرجع rejected';
    end if;
    -- النداء المكرر لا يرمي
    if public.reject_offer(v_offer, null) <> 'rejected' then
      raise exception '(ح-٢) الرفض المكرر لم يرجع rejected';
    end if;

    perform set_config('request.jwt.claim.sub', '', false);
    perform set_config('request.jwt.claims', '', false);
  else
    update public.trip_offers o
       set status = 'rejected', responded_at = now(), reason = 'مشغول في هذا التوقيت'
     where o.id = v_offer;
  end if;

  select o.* into v_row from public.trip_offers o where o.id = v_offer;
  if v_row.status <> 'rejected' or v_row.reason is null or v_row.responded_at is null then
    raise exception '(ح-٢) صف الرفض ناقص (حالة % سبب %)', v_row.status, coalesce(v_row.reason, 'بلا');
  end if;

  -- (ح-٣) الموجة ٢ لا تُعاد على من رفض صراحةً، وتضم «ب» وحده
  select * into v_tick from public.dispatch_tick();
  if v_tick.new_rounds < 1 then
    raise exception '(ح-٣) الدورة لم تفتح الموجة ٢ بعد الرفض الصريح';
  end if;

  select count(*) into v_n from public.trip_offers o
   where o.booking_id = v_id and o.round = 2;
  if v_n <> 1 then
    raise exception '(ح-٣) عروض الموجة ٢ = % — المتوقع ١ (ب وحده، وأ رفض)', v_n;
  end if;
  if exists (select 1 from public.trip_offers o
              where o.booking_id = v_id and o.round = 2 and o.subcontractor_id = v_a) then
    raise exception '(ح-٣) أُعيد البث على من رفض الطلب صراحةً';
  end if;
  if not exists (select 1 from public.trip_offers o
                  where o.booking_id = v_id and o.round = 2 and o.subcontractor_id = v_b) then
    raise exception '(ح-٣) المتعهد ب لم يدخل الموجة ٢';
  end if;

  -- (ح-٤) انتهاء الموجة الأخيرة ⇒ الطابور اليدوي بإشعار تصعيد
  update public.trip_offers o
     set expires_at = now() - interval '1 minute'
   where o.booking_id = v_id and o.status = 'pending';

  select * into v_tick from public.dispatch_tick();
  if v_tick.escalated < 1 then
    raise exception '(ح-٤) الدورة لم تُصعّد الحجز المستنفد (%)', v_tick.escalated;
  end if;

  select d.* into v_row from public.dispatches d where d.booking_id = v_id;
  if v_row.status <> 'manual' then
    raise exception '(ح-٤) حالة الدورة بعد الاستنفاد «%» — المتوقع manual', v_row.status;
  end if;

  select b.status into v_row from public.bookings b where b.id = v_id;
  if v_row.status <> 'confirmed' then
    raise exception '(ح-٤) الاستنفاد غيّر حالة الحجز إلى «%» — المتوقع بقاؤه confirmed', v_row.status;
  end if;

  select count(*) into v_n from public.notifications n
   where n.event = 'dispatch_exhausted' and n.payload ->> 'bookingId' = v_id::text;
  if v_n <> 1 then
    raise exception '(ح-٤) إشعارات التصعيد % — المتوقع ١', v_n;
  end if;

  -- (ح-٥) دورة إضافية لا تُصعّد مرتين ولا تُشعر مرتين
  perform public.dispatch_tick();
  select count(*) into v_n from public.notifications n
   where n.event = 'dispatch_exhausted' and n.payload ->> 'bookingId' = v_id::text;
  if v_n <> 1 then
    raise exception '(ح-٥) تكرر إشعار التصعيد % مرة', v_n;
  end if;

  raise notice '✔ (ح) الرفض الصريح يُخرج صاحبه من الموجات، والاستنفاد يُصعّد للطابور اليدوي بإشعار واحد';
exception
  when others then
    perform set_config('request.jwt.claim.sub', '', false);
    perform set_config('request.jwt.claims', '', false);
    raise;
end;
$$;

-- ----------------------------------------------------------------------------
-- (ط) الإسناد اليدوي — من الطابور اليدوي وبأي مستحق يقرره التشغيل
-- ----------------------------------------------------------------------------
do $$
declare
  v_admin  text := nullif(current_setting('tours.d_admin', true), '');
  v_ident  text := current_setting('tours.d_identities', true);
  v_id     uuid := current_setting('tours.d_booking2', true)::uuid;
  v_b      constant uuid := 'd0000000-0000-4000-8000-00000000000b';
  v_e      constant uuid := 'd0000000-0000-4000-8000-00000000000e';
  v_prof_b constant uuid := 'd2000000-0000-4000-8000-00000000000b';
  v_payout numeric := round(current_setting('tours.d_cost_b', true)::numeric + 250, 2);
  v_res    record;
  v_row    record;
  v_n      integer;
  v_raised boolean;
  v_hint   text;
begin
  if v_admin is null then
    raise notice '  ↳ (ط) تخطٍّ: بلا هوية مشرف';
    return;
  end if;

  perform set_config('request.jwt.claim.sub', v_admin, false);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_admin)::text, false);

  -- (ط-١) المتعهد الموقوف لا يُسند إليه
  v_raised := false;
  begin
    perform public.manual_assign(v_id, v_e, v_payout, 'محاولة إسناد لموقوف');
  exception
    when others then
      v_raised := true;
      get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if not v_raised or coalesce(v_hint, '') <> 'invalid-input' then
    raise exception '(ط-١) أُسند الطلب لمتعهد موقوف (رُفض=% رمز=%)', v_raised, coalesce(v_hint, 'بلا');
  end if;

  -- (ط-١-ب) أرضية الهامش مفروضة في القاعدة (هجرة 0014): مستحق يفوق الإجمالي
  -- يُرفض، والتجاوز المقصود له دالته المسمّاة وحدها.
  declare
    v_total numeric;
    v_loss  numeric;
  begin
    select b.total into v_total from public.bookings b where b.id = v_id;
    v_loss := round(v_total + 100, 2);

    v_raised := false;
    begin
      perform public.manual_assign(v_id, v_b, v_loss, 'محاولة إسناد بخسارة');
    exception
      when others then
        v_raised := true;
        get stacked diagnostics v_hint = pg_exception_hint;
    end;
    if not v_raised or coalesce(v_hint, '') <> 'margin-floor' then
      raise exception '(ط-١-ب) الإسناد بخسارة لم يُرفض (رُفض=% رمز=%)', v_raised, coalesce(v_hint, 'بلا');
    end if;

    -- والمستحق يبقى داخل الأرضية للاختبار التالي
    v_payout := least(v_payout, round(v_total * 0.9, 2));
  end;

  -- (ط-٢) الإسناد اليدوي من حالة manual
  select * into v_res from public.manual_assign(v_id, v_b, v_payout, 'اتفاق هاتفي مع المتعهد');

  if v_res.partner is distinct from v_b or v_res.payout_amount is distinct from v_payout then
    raise exception '(ط-٢) رد الإسناد اليدوي غير متوقع (متعهد % مستحق %)',
      v_res.partner, v_res.payout_amount;
  end if;

  select d.* into v_row from public.dispatches d where d.booking_id = v_id;
  if v_row.status <> 'assigned' or not v_row.manual_assign
     or v_row.assigned_subcontractor_id <> v_b
     or v_row.assigned_payout is distinct from v_payout then
    raise exception '(ط-٢) صف الدورة بعد الإسناد اليدوي غير مضبوط (حالة % يدوي %)',
      v_row.status, v_row.manual_assign;
  end if;

  select b.status into v_row from public.bookings b where b.id = v_id;
  if v_row.status <> 'assigned' then
    raise exception '(ط-٢) حالة الحجز بعد الإسناد اليدوي «%» — المتوقع assigned', v_row.status;
  end if;

  -- (ط-٣) لا عرض معلّق باقياً، وعرض واحد مقبول للفائز
  select count(*) into v_n from public.trip_offers o
   where o.booking_id = v_id and o.status = 'pending';
  if v_n <> 0 then
    raise exception '(ط-٣) بقي % عرض معلّق بعد الإسناد اليدوي', v_n;
  end if;

  select count(*) into v_n from public.trip_offers o
   where o.booking_id = v_id and o.status = 'accepted';
  if v_n <> 1 then
    raise exception '(ط-٣) عروض مقبولة للحجز % — المتوقع ١', v_n;
  end if;
  if not exists (select 1 from public.trip_offers o
                  where o.booking_id = v_id and o.status = 'accepted'
                    and o.subcontractor_id = v_b and o.payout = v_payout) then
    raise exception '(ط-٣) العرض المقبول ليس للفائز اليدوي أو بمستحق مختلف';
  end if;

  -- (ط-٤) إشعار إسناد يدوي واحد
  select count(*) into v_n from public.notifications n
   where n.event = 'trip_assigned' and n.payload ->> 'bookingId' = v_id::text
     and n.payload ->> 'manualAssign' = 'true';
  if v_n <> 1 then
    raise exception '(ط-٤) إشعارات الإسناد اليدوي % — المتوقع ١', v_n;
  end if;

  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claims', '', false);

  -- (ط-٥) والمُسنَد إليه يرى رحلته الآن
  if v_ident = '1' then
    perform set_config('request.jwt.claim.sub', v_prof_b::text, false);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', v_prof_b)::text, false);
    select count(*) into v_n from public.portal_trips();
    if v_n <> 1 then
      raise exception '(ط-٥) رحلات المُسنَد إليه يدوياً % — المتوقع ١', v_n;
    end if;
    perform set_config('request.jwt.claim.sub', '', false);
    perform set_config('request.jwt.claims', '', false);
  end if;

  raise notice '✔ (ط) الإسناد اليدوي: يُغلق العروض ويوثّق الفائز ويرفع الحجز إلى assigned بإشعار';
exception
  when others then
    perform set_config('request.jwt.claim.sub', '', false);
    perform set_config('request.jwt.claims', '', false);
    raise;
end;
$$;

-- ----------------------------------------------------------------------------
-- (ي) الصلاحيات كتالوجياً + حدود المرحلتين ٤ و٥ لم تُمس
-- ----------------------------------------------------------------------------
do $$
declare
  v_n integer;
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    raise notice '  ↳ (ي) تخطٍّ جزئي: دور anon غير موجود على هذه القاعدة';
  else
    -- (ي-١) anon صفر على الجداول الثلاثة — بما فيها TRUNCATE التي لا تخضع لـ RLS
    select count(*) into v_n
    from (values ('dispatch_settings'), ('dispatches'), ('trip_offers')) as t(rel)
    cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES')) as p(priv)
    where has_table_privilege('anon', 'public.' || t.rel, p.priv);
    if v_n <> 0 then
      raise exception '(ي-١) للزائر % صلاحية على جداول البث', v_n;
    end if;

    -- (ي-٢) ولا EXECUTE على أي دالة من دوال المرحلة
    select count(*) into v_n
    from (values
      ('public.start_dispatch(uuid)'), ('public.accept_offer(uuid)'),
      ('public.reject_offer(uuid, text)'), ('public.dispatch_tick()'),
      ('public.manual_assign(uuid, uuid, numeric, text)'),
      ('public.portal_offers()'), ('public.portal_trips()'),
      ('public.dispatch_pool(uuid, integer)'), ('public.dispatch_ceiling(uuid, integer)'),
      ('public.dispatch_broadcast(uuid, integer)'), ('public.dispatch_config()'),
      ('public.dispatch_trip_payload(uuid, boolean)'), ('public.dispatch_ops_allowed()')
    ) as f(sig)
    where has_function_privilege('anon', f.sig, 'EXECUTE');
    if v_n <> 0 then
      raise exception '(ي-٢) الزائر ينفّذ % من دوال البث', v_n;
    end if;
  end if;

  -- (ي-٣) الدوال الداخلية ليست للمسجَّل أيضاً (المتعهد مستخدم مسجَّل)
  select count(*) into v_n
  from (values
    ('public.dispatch_pool(uuid, integer)'), ('public.dispatch_ceiling(uuid, integer)'),
    ('public.dispatch_broadcast(uuid, integer)'), ('public.dispatch_config()'),
    ('public.dispatch_trip_payload(uuid, boolean)'), ('public.dispatch_ops_allowed()')
  ) as f(sig)
  where has_function_privilege('authenticated', f.sig, 'EXECUTE');
  if v_n <> 0 then
    raise exception '(ي-٣) المسجَّل ينفّذ % من الدوال الداخلية (سقف الموجة/الحوض)', v_n;
  end if;

  -- (ي-٤) وواجهات البورتال متاحة للمسجَّل (وإلا لا بورتال أصلاً)
  if not has_function_privilege('authenticated', 'public.portal_offers()', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.portal_trips()', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.accept_offer(uuid)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.reject_offer(uuid, text)', 'EXECUTE') then
    raise exception '(ي-٤) دوال البورتال ليست متاحة للمسجَّل';
  end if;

  -- (ي-٥) RLS مفعّلة على الثلاثة
  select count(*) into v_n
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname in ('dispatch_settings', 'dispatches', 'trip_offers')
    and c.relrowsecurity;
  if v_n <> 3 then
    raise exception '(ي-٥) RLS مفعّلة على % جدول من ٣', v_n;
  end if;

  -- (ي-٦) حدود المرحلتين ٤ و٥ كما هي: لا إضعاف عرضي
  if has_function_privilege('anon', 'public.create_booking(
       jsonb, jsonb, integer, boolean, numeric, numeric, numeric,
       text, text, text, text, text, text, timestamptz, text, text,
       timestamptz, integer, jsonb)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.create_booking(
       jsonb, jsonb, integer, boolean, numeric, numeric, numeric,
       text, text, text, text, text, text, timestamptz, text, text,
       timestamptz, integer, jsonb)', 'EXECUTE') then
    raise exception '(ي-٦) نقض تصليب 0009: create_booking عادت متاحة لدور عام';
  end if;

  if has_function_privilege('authenticated',
       'public.coverage_matches(numeric, numeric, numeric, numeric)', 'EXECUTE') then
    raise exception '(ي-٦) نقض عزل 0011: coverage_matches عادت متاحة للمسجَّل';
  end if;

  if has_function_privilege('authenticated',
       'public.quote_price(numeric, integer, boolean, numeric, numeric, numeric, numeric, numeric, integer)',
       'EXECUTE') then
    raise exception '(ي-٦) نقض عزل 0011: التسعير المُفصَّل عاد متاحاً للمسجَّل';
  end if;

  if has_column_privilege('authenticated', 'public.pricing_settings', 'margin_value', 'SELECT') then
    raise exception '(ي-٦) نقض عزل 0011: أعمدة الهامش عادت مقروءة للمسجَّل';
  end if;

  raise notice '✔ (ي) الصلاحيات: anon صفر، الداخلية محجوبة عن المسجَّل، وحدود المرحلتين ٤ و٥ سليمة';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ي-ب) 🔒 حارس التشغيل يفشل مغلقاً فعلاً — تصليب 0025 البند (٣)
--
-- العيب: `0014:131` كان يفحص `current_user in ('postgres','supabase_admin')`
-- داخل `security definer`. و`current_user` هناك هو **مالك الدالة** (postgres)
-- لا المستدعي، فالسطر يرجع `true` لكل من بلغه. ومن يبلغه؟ كل جلسة بدور
-- `authenticated` بلا `sub` في مطالباتها: `is_admin()` تكذب، و`auth.uid()`
-- فارغة، فتسقط على سطر مالك القاعدة وتُمنح **كامل صلاحيات التشغيل**.
-- وهذا هو بالضبط ما تصفه LESSONS: «الحارس كان يفشل مفتوحاً: بلا هوية =
-- صلاحيات كاملة» — أُصلح في 0014 لطبقة واحدة وبقي مفتوحاً في الأخرى.
--
-- ⚠ التأكيد (ي-ب-٢) هو المميِّز الحقيقي: على الحارس القديم يمرّ الاستدعاء إلى
--    ما بعد الحارس فيفشل بـ `invalid-input`؛ وعلى المصحَّح يُردّ بـ `forbidden`.
--    أي أنه **يحمرّ فعلاً** لو نُقض التصحيح، لا يزيّن نجاحاً قائماً.
--
-- والمسبار على مبلغ `null` مقصود: الحارس يسبق كل تحقق آخر في `start_dispatch`
-- (0013:604 قبل 0013:608)، فالنتيجة تُميَّز بالـ hint وحده بلا أي أثر جانبي —
-- لا دورة بث تبدأ ولا عرض يُرسل ولا حالة حجز تتغيّر.
-- ----------------------------------------------------------------------------
do $$
declare
  v_admin  text := current_setting('tours.d_admin', true);
  v_ident  text := current_setting('tours.d_identities', true);
  v_prof_b constant uuid := 'd2000000-0000-4000-8000-00000000000b';
  v_src    text;
  v_hint   text;
  v_raised boolean;
  v_n      integer;
begin
  -- ── (ي-ب-١) بنية الحارس ──
  v_src := pg_get_functiondef('public.dispatch_ops_allowed()'::regprocedure);

  -- شاهد إيجابي للمسبار: نفس أسلوب المطابقة يلتقط رمزاً نعلم وجوده يقيناً.
  -- بدونه، مسبارٌ معطوب (مصدر فارغ) كان «ينجح» في كل نفي بعده.
  if position('is_admin' in coalesce(v_src, '')) = 0 then
    raise exception
      '(ي-ب-١أ) مسبار المصدر لا يلتقط is_admin — المطابقة معطّلة فلا تصدّق ما بعدها';
  end if;

  if position('current_user' in v_src) > 0 then
    raise exception
      '(ي-ب-١ب) dispatch_ops_allowed ما زالت تفحص current_user — وهو مالك الدالة لا المستدعي، فالحارس يمرّر كل من بلغه';
  end if;

  if position('session_user' in v_src) = 0 then
    raise exception
      '(ي-ب-١ج) dispatch_ops_allowed بلا session_user — اتصال الهجرات والاختبارات سيُرفض';
  end if;

  -- والحاجز المبكر **بعد** is_admin لا قبله: المشرف يصل manual_assign بدور
  -- authenticated (app/admin/orders/[id]/dispatch-actions.ts:174)
  if position('current_setting(''role''' in v_src) = 0 then
    raise exception '(ي-ب-١د) بلا حاجز مبكر على متغيّر role';
  end if;
  if position('is_admin' in v_src) > position('current_setting(''role''' in v_src) then
    raise exception
      '(ي-ب-١هـ) الحاجز المبكر سبق فحص is_admin — المشرف نفسه سيُرفض من اللوحة';
  end if;

  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    raise notice '  ↳ (ي-ب) لا دور authenticated على هذه القاعدة — الفحوص الحية متخطّاة';
    raise notice '✔ (ي-ب) بنية حارس التشغيل سليمة (session_user لا current_user، وحاجز بعد is_admin)';
    return;
  end if;

  -- ── (ي-ب-٢) 🔒 المميِّز: جلسة بدور authenticated بلا هوية تُردّ ──
  begin
    perform set_config('request.jwt.claim.sub', '', false);
    perform set_config('request.jwt.claims', '', false);
    execute 'set local role authenticated';

    v_raised := false;
    v_hint   := null;
    begin
      execute 'select count(*) from public.start_dispatch(null::uuid)' into v_n;
    exception
      when others then
        v_raised := true;
        get stacked diagnostics v_hint = pg_exception_hint;
    end;

    execute 'reset role';
  exception
    when others then
      execute 'reset role';
      raise;
  end;

  if not v_raised then
    raise exception
      '(ي-ب-٢) جلسة authenticated بلا هوية نفّذت start_dispatch بلا أي رفض — الحارس يفشل مفتوحاً';
  end if;
  if coalesce(v_hint, '') <> 'forbidden' then
    raise exception
      '(ي-ب-٢) جلسة authenticated بلا هوية اجتازت الحارس (hint=«%») — الرفض جاء من تحقق لاحق لا من الحارس',
      coalesce(v_hint, 'بلا');
  end if;

  -- ── (ي-ب-٣) ومتعهد مسجَّل بهوية حقيقية يُردّ كذلك ──
  if v_ident is distinct from '1' then
    raise notice '  ↳ (ي-ب-٣) بلا هويتي متعهدين — متخطّى';
  else
    begin
      perform set_config('request.jwt.claim.sub', v_prof_b::text, false);
      perform set_config('request.jwt.claims', jsonb_build_object('sub', v_prof_b)::text, false);
      execute 'set local role authenticated';

      v_raised := false;
      v_hint   := null;
      begin
        execute 'select count(*) from public.start_dispatch(null::uuid)' into v_n;
      exception
        when others then
          v_raised := true;
          get stacked diagnostics v_hint = pg_exception_hint;
      end;

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

    if not v_raised or coalesce(v_hint, '') <> 'forbidden' then
      raise exception
        '(ي-ب-٣) متعهد مسجَّل اجتاز حارس التشغيل (رُفض=% hint=«%»)',
        v_raised, coalesce(v_hint, 'بلا');
    end if;
  end if;

  -- ── (ي-ب-٤) والمشرف ما زال يمرّ — نصف الاختبار لا زينته ──
  --    لولا هذا التأكيد لكان «حاجزٌ يردّ authenticated دائماً» اختباراً أخضر
  --    ولوحةً معطوبة: زرّ «ابدأ البث» و«الإسناد اليدوي» يصلان بدور authenticated.
  if coalesce(v_admin, '') = '' then
    raise notice '  ↳ (ي-ب-٤) بلا هوية مشرف — شاهد المشرف متخطّى';
  else
    begin
      perform set_config('request.jwt.claim.sub', v_admin, false);
      perform set_config('request.jwt.claims', jsonb_build_object('sub', v_admin)::text, false);
      execute 'set local role authenticated';

      v_raised := false;
      v_hint   := null;
      begin
        execute 'select count(*) from public.start_dispatch(null::uuid)' into v_n;
      exception
        when others then
          v_raised := true;
          get stacked diagnostics v_hint = pg_exception_hint;
      end;

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

    -- المتوقع: يتجاوز الحارس ثم يفشل على «معرّف الحجز مطلوب» (0013:608-610)
    if coalesce(v_hint, '') = 'forbidden' then
      raise exception
        '(ي-ب-٤) الحارس ردّ **المشرف** — الحاجز المبكر وُضع قبل is_admin، واللوحة لا تبثّ ولا تُسند يدوياً';
    end if;
    if not v_raised or coalesce(v_hint, '') <> 'invalid-input' then
      raise exception
        '(ي-ب-٤) المشرف لم يبلغ تحقق المدخلات (رُفض=% hint=«%») — المسبار لم يعد يقيس ما يظن',
        v_raised, coalesce(v_hint, 'بلا');
    end if;
  end if;

  raise notice '✔ (ي-ب) حارس التشغيل: session_user لا current_user، ويردّ كل authenticated بلا صفة مشرف، والمشرف يمرّ';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ك) مسارات الحافة: البدء التلقائي، إلغاء الحجز، والإسناد بلا دورة سابقة
--
-- ⚠ اختبار البدء التلقائي يُشغّل الدورة و`auto_start` مرفوع، فتلتقط الدورة **كل**
-- حجز مؤكَّد بلا دورة بث في القاعدة. لذلك لا يُشغَّل إلا إن لم يكن في القاعدة حجز
-- مؤكَّد غريب عن هذا الملف — فلا يبث اختبارٌ على طلب عميل حقيقي أجّله التشغيل.
-- ----------------------------------------------------------------------------
do $$
declare
  v_cls    text := current_setting('tours.d_class', true);
  v_b      constant uuid := 'd0000000-0000-4000-8000-00000000000b';
  v_a      constant uuid := 'd0000000-0000-4000-8000-00000000000a';
  v_res    record;
  v_tick   record;
  v_row    record;
  v_id1    uuid;
  v_id2    uuid;
  v_alien  integer;
  v_n      integer;
begin
  -- (ك-١) حجز مؤكَّد بلا دورة بث ⇒ شبكة أمان البدء التلقائي تلتقطه
  select count(*) into v_alien
  from public.bookings b
  left join public.dispatches d on d.booking_id = b.id
  where b.status = 'confirmed'
    and d.booking_id is null
    and coalesce(b.trip ->> 'notes', '') not like 'DISPATCH_TESTS_FIXTURE%';

  if v_alien > 0 then
    raise notice '  ↳ (ك-١) تخطٍّ: في القاعدة % حجز مؤكَّد غريب — لن نرفع auto_start عليه', v_alien;
  else
    select * into v_res from public.create_booking(
      jsonb_build_object('label', 'مصر الجديدة، القاهرة', 'lat', 30.080800, 'lng', 31.322200),
      jsonb_build_object('label', 'المعمورة، الإسكندرية', 'lat', 31.279000, 'lng', 30.017000),
      1, false, 0, 220, null, 'test', v_cls, 'full',
      'عميل اختبار البدء التلقائي', '01333333333', null, now() + interval '4 days',
      'DISPATCH_TESTS_FIXTURE — البدء التلقائي'
    );
    v_id1 := v_res.id;
    update public.bookings set status = 'under_review' where id = v_id1;
    update public.bookings set status = 'confirmed'    where id = v_id1;

    update public.dispatch_settings set auto_start = true where id = true;
    select * into v_tick from public.dispatch_tick();
    update public.dispatch_settings set auto_start = false where id = true;

    select d.* into v_row from public.dispatches d where d.booking_id = v_id1;
    if v_row.booking_id is null or v_row.status <> 'broadcasting' or v_row.round <> 1 then
      raise exception '(ك-١) البدء التلقائي لم يفتح الموجة ١ (حالة %)',
        coalesce(v_row.status, 'بلا دورة');
    end if;
    select count(*) into v_n from public.trip_offers o
     where o.booking_id = v_id1 and o.status = 'pending';
    if v_n < 1 then
      raise exception '(ك-١) البدء التلقائي بلا عروض';
    end if;

    -- (ك-٢) إلغاء الحجز يُغلق دورته ويسحب عروضه في الدورة التالية
    update public.bookings set status = 'cancelled' where id = v_id1;
    select * into v_tick from public.dispatch_tick();

    select d.status into v_row from public.dispatches d where d.booking_id = v_id1;
    if v_row.status <> 'cancelled' then
      raise exception '(ك-٢) حالة الدورة بعد إلغاء الحجز «%» — المتوقع cancelled', v_row.status;
    end if;
    select count(*) into v_n from public.trip_offers o
     where o.booking_id = v_id1 and o.status = 'pending';
    if v_n <> 0 then
      raise exception '(ك-٢) بقي % عرض معلّق على حجز مُلغى', v_n;
    end if;
  end if;

  -- (ك-٣) إسناد يدوي لحجز لم يُبث عليه قط، بلا مبلغ صريح ⇒ يُشتق من قائمة المتعهد
  if nullif(current_setting('tours.d_admin', true), '') is null then
    raise notice '  ↳ (ك-٣) تخطٍّ: بلا هوية مشرف';
    return;
  end if;

  perform set_config('request.jwt.claim.sub', current_setting('tours.d_admin', true), false);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', current_setting('tours.d_admin', true))::text, false);

  select * into v_res from public.create_booking(
    jsonb_build_object('label', 'مصر الجديدة، القاهرة', 'lat', 30.080800, 'lng', 31.322200),
    jsonb_build_object('label', 'المعمورة، الإسكندرية', 'lat', 31.279000, 'lng', 30.017000),
    1, false, 0, 220, null, 'test', v_cls, 'full',
    'عميل اختبار الإسناد المباشر', '01444444444', null, now() + interval '5 days',
    'DISPATCH_TESTS_FIXTURE — إسناد مباشر'
  );
  v_id2 := v_res.id;
  update public.bookings set status = 'under_review' where id = v_id2;
  update public.bookings set status = 'confirmed'    where id = v_id2;

  select * into v_row from public.manual_assign(v_id2, v_b, null, 'إسناد مباشر بلا بث');
  if v_row.payout_amount is distinct from current_setting('tours.d_cost_b', true)::numeric then
    raise exception '(ك-٣) المستحق المشتق % — المتوقع تكلفة المتعهد من قائمته %',
      v_row.payout_amount, current_setting('tours.d_cost_b', true);
  end if;

  -- (ك-٤) إعادة الإسناد إلى متعهد آخر تُبقي عرضاً مقبولاً واحداً (الفهرس الجزئي)
  perform public.manual_assign(v_id2, v_a, 1400, 'إعادة إسناد');

  select count(*) into v_n from public.trip_offers o
   where o.booking_id = v_id2 and o.status = 'accepted';
  if v_n <> 1 then
    raise exception '(ك-٤) عروض مقبولة بعد إعادة الإسناد = % — المتوقع ١', v_n;
  end if;

  select d.assigned_subcontractor_id into v_row from public.dispatches d where d.booking_id = v_id2;
  if v_row.assigned_subcontractor_id <> v_a then
    raise exception '(ك-٤) إعادة الإسناد لم تنقل الرحلة للمتعهد الجديد';
  end if;

  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claims', '', false);
  raise notice '✔ (ك) الحافة: البدء التلقائي شبكة أمان، والإلغاء يُغلق الدورة، والإسناد المباشر وإعادته يبقيان فائزاً واحداً';
exception
  when others then
    update public.dispatch_settings set auto_start = false where id = true;
    perform set_config('request.jwt.claim.sub', '', false);
    perform set_config('request.jwt.claims', '', false);
    raise;
end;
$$;

-- ----------------------------------------------------------------------------
-- (ل) التنظيف — إزالة كل ما أنشأه الملف وإعادة الإعدادات كما كانت
-- ----------------------------------------------------------------------------
do $$
declare
  v_pricing  jsonb := nullif(current_setting('tours.d_pricing', true), '')::jsonb;
  v_dispatch jsonb := nullif(current_setting('tours.d_dispatch', true), '')::jsonb;
  v_admin    uuid  := nullif(current_setting('tours.d_admin', true), '')::uuid;
  v_fixture  text  := current_setting('tours.d_admin_fixture', true);
  v_left     integer;
begin
  if v_pricing is not null then
    update public.pricing_settings
       set peak_enabled      = (v_pricing ->> 'peak_enabled')::boolean,
           peak_percent      = (v_pricing ->> 'peak_percent')::numeric,
           margin_type       = v_pricing ->> 'margin_type',
           margin_value      = (v_pricing ->> 'margin_value')::numeric,
           margin_min_amount = (v_pricing ->> 'margin_min_amount')::numeric
     where id = true;
  end if;

  if v_dispatch is not null then
    update public.dispatch_settings
       set window_minutes    = (v_dispatch ->> 'window_minutes')::integer,
           max_rounds        = (v_dispatch ->> 'max_rounds')::integer,
           auto_start        = (v_dispatch ->> 'auto_start')::boolean,
           min_margin_amount = (v_dispatch ->> 'min_margin_amount')::numeric
     where id = true;
  end if;

  -- الإشعارات أولاً (لا مفتاح أجنبي لها على الحجز)، ثم الحجوزات فتتالى عليها
  -- dispatches و trip_offers و booking_events، ثم المتعهدون فتتالى قوائمهم.
  delete from public.notifications n
   where n.payload ->> 'bookingId' in (
         select b.id::text from public.bookings b
          where b.trip ->> 'notes' like 'DISPATCH_TESTS_FIXTURE%');
  delete from public.bookings b where b.trip ->> 'notes' like 'DISPATCH_TESTS_FIXTURE%';
  delete from public.subcontractors s where s.company_name like 'DISPATCH_TESTS%';
  delete from public.profiles p
   where p.id in ('d2000000-0000-4000-8000-00000000000a'::uuid,
                  'd2000000-0000-4000-8000-00000000000b'::uuid);
  begin
    delete from auth.users u
     where u.id in ('d2000000-0000-4000-8000-00000000000a'::uuid,
                    'd2000000-0000-4000-8000-00000000000b'::uuid);
  exception when others then null;
  end;

  if v_fixture = '1' and v_admin is not null then
    delete from public.profiles p where p.id = v_admin;
    begin
      delete from auth.users u where u.id = v_admin;
    exception when others then null;
    end;
  end if;

  select count(*) into v_left from public.bookings b
   where b.trip ->> 'notes' like 'DISPATCH_TESTS_FIXTURE%';
  if v_left <> 0 then
    raise exception '(ل) بقي % حجز اختبار بعد التنظيف', v_left;
  end if;

  select count(*) into v_left from public.subcontractors s
   where s.company_name like 'DISPATCH_TESTS%';
  if v_left <> 0 then
    raise exception '(ل) بقي % متعهد اختبار بعد التنظيف', v_left;
  end if;

  select count(*) into v_left from public.trip_offers o
   where not exists (select 1 from public.bookings b where b.id = o.booking_id);
  if v_left <> 0 then
    raise exception '(ل) بقي % عرض يتيم بعد التنظيف', v_left;
  end if;

  perform set_config('tours.d_class', '', false);
  perform set_config('tours.d_cost_a', '', false);
  perform set_config('tours.d_cost_b', '', false);
  perform set_config('tours.d_margin', '', false);
  perform set_config('tours.d_total', '', false);
  perform set_config('tours.d_booking1', '', false);
  perform set_config('tours.d_booking2', '', false);
  perform set_config('tours.d_offer_b', '', false);
  perform set_config('tours.d_pricing', '', false);
  perform set_config('tours.d_dispatch', '', false);
  perform set_config('tours.d_admin', '', false);
  perform set_config('tours.d_admin_fixture', '', false);
  perform set_config('tours.d_identities', '', false);
  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claims', '', false);

  raise notice '✔ (ل) التنظيف تم — لا صفوف اختبار متبقية والإعدادات كما كانت';
end;
$$;

-- ----------------------------------------------------------------------------
-- الخلاصة
-- ----------------------------------------------------------------------------
do $$
begin
  raise notice 'ALL PASSED — البث بموجات، والقبول الذرّي، والخصوصية قبل القبول، والتصعيد اليدوي: كلها نجحت';
end;
$$;
