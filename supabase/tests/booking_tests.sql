-- ============================================================================
-- booking_tests.sql — اختبارات قبول لمنظومة الحجز والدفع
--                      (المرحلة ٤: هجرة 0007 + تصليب 0009)
--
-- كيف تشغّله: افتح SQL Editor في لوحة Supabase، الصق الملف كاملاً واضغط Run.
-- النجاح = آخر سطر في الرسائل «ALL PASSED». أي فشل يرمي exception برسالة عربية
-- تحدد الاختبار والقيمة المتوقعة والفعلية.
--
-- ومن psql بدور صاحب القاعدة **لا بد** من الخيار ON_ERROR_STOP، وإلا تابع psql
-- بعد الكتلة الفاشلة وطبع «ALL PASSED» رغم وجود فشل:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/booking_tests.sql
--
-- قابل لإعادة التنفيذ بلا حدود:
--   • كل صفوف الاختبار موسومة بملاحظة BOOKING_TESTS_FIXTURE داخل لقطة الرحلة،
--     وتُمسح في بداية الملف ونهايته معاً (فحتى لو انهار تشغيل سابق في المنتصف
--     يبدأ التشغيل التالي من أرض نظيفة).
--   • ما يعدّله مؤقتاً (مفتاح إعدادات payment) يُعاد كما كان حتى عند الفشل.
--   • حساب استقبال الاختبار بمعرّف ثابت يُحذف في الطرفين.
--
-- الاختبارات لا تفترض أسعاراً مثبتة ولا فئات بعينها: تستخرج أصغر فئة نشطة من
-- المحرك نفسه وتعيد اشتقاق كل رقم متوقع من quote_price ومن إعدادات الدفع الحية،
-- فتبقى صحيحة بعد أن يعاير المالك التعريفة أو نسبة العربون من اللوحة.
--
-- هوية المشرف: دوال verify_payment و set_booking_status محروسة بـ is_admin().
-- يبحث الملف عن حساب admin موجود، وإلا أنشأ مستخدماً مؤقتاً وحذفه في النهاية،
-- وإن تعذّر الأمران تخطّى الاختبارات التي تحتاج مشرفاً بإشعار واضح بدل الفشل.
--
-- الأقسام (أ) حتى (ط) تغطي منظومة 0007، والأقسام (ي) حتى (س) تثبّت ما أغلقته
-- هجرة 0009_booking_hardening.sql بعد المراجعة الخصمية:
--   (ي) د١ أرضية وسقف المسافة داخل create_booking
--   (ك) د٢ قيمة الإيصال تُثبَّت من الحجز لا من المستدعي
--   (ل) د٣ حدود دلو الإيصالات وشرط الرفع الأضيق وسياسة الحذف
--   (م) د٤ منع الإدراج المباشر في quote_requests والتحقق داخل الدالة
--   (ن) د٥ قائمة حسابات الاستقبال مربوطة بتوكن حجز
--   (س) د٩ تفرد (kind, handle) و د٨ قنوات الإشعار الافتراضية
-- وقسم الصلاحيات (ط) يفحص كتالوجياً أن anon فقد ما يجب أن يفقده.
--
-- المرجع: lib/booking-types.ts (العقد) + supabase/migrations/0007_booking.sql
--         + supabase/migrations/0009_booking_hardening.sql.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (٠) الشروط المسبقة + تنظيف أي بقايا + استخراج معطيات التشغيل
-- ----------------------------------------------------------------------------
do $$
declare
  v_missing  text;
  v_slug     text;
  v_cap      integer;
  v_max_cap  integer;
  v_rows     integer;
begin
  -- الدوال المطلوبة كلها موجودة؟
  select string_agg(x.sig, '، ')
    into v_missing
  from (values
    ('public.create_booking(jsonb, jsonb, integer, boolean, numeric, numeric, numeric, text, text, text, text, text, text, timestamptz, text)'),
    ('public.get_booking_by_token(text)'),
    ('public.available_payment_accounts(numeric)'),
    ('public.attach_receipt(text, text, uuid, numeric)'),
    ('public.attach_receipt(text, text)'),
    ('public.verify_payment(uuid, boolean, text)'),
    ('public.set_booking_status(uuid, text, text)'),
    ('public.booking_transition_allowed(text, text)')
  ) as x(sig)
  where to_regprocedure(x.sig) is null;

  if v_missing is not null then
    raise exception 'شرط مسبق: دوال مفقودة (نفّذ 0007_booking.sql أولاً): %', v_missing;
  end if;

  -- دوال التصليب (هجرة 0009) — أقسام (ي) حتى (س) تعتمد عليها
  select string_agg(x.sig, '، ')
    into v_missing
  from (values
    ('public.haversine_km(numeric, numeric, numeric, numeric)'),
    ('public.available_payment_accounts(text, numeric)')
  ) as x(sig)
  where to_regprocedure(x.sig) is null;

  if v_missing is not null then
    raise exception
      'شرط مسبق: دوال التصليب مفقودة (نفّذ 0009_booking_hardening.sql أولاً): %', v_missing;
  end if;

  select string_agg(x.rel, '، ')
    into v_missing
  from (values
    ('public.bookings'), ('public.booking_events'), ('public.payment_accounts'),
    ('public.payments'), ('public.quote_requests'), ('public.notifications')
  ) as x(rel)
  where to_regclass(x.rel) is null;

  if v_missing is not null then
    raise exception 'شرط مسبق: جداول مفقودة: %', v_missing;
  end if;

  if to_regprocedure('public.quote_price(numeric, integer, boolean, numeric)') is null then
    raise exception 'شرط مسبق: public.quote_price غير موجودة — نفّذ 0005_pricing.sql أولاً';
  end if;

  select count(*) into v_rows from public.site_settings s where s.key = 'payment';
  if v_rows <> 1 then
    raise exception 'شرط مسبق: مفتاح الإعدادات payment غير مبذور (وجدنا % صفاً)', v_rows;
  end if;

  -- تنظيف بقايا تشغيل سابق (الإشعارات أولاً لأنها بلا مفتاح أجنبي)
  delete from public.notifications n
   where n.payload ->> 'bookingId' in (
         select b.id::text from public.bookings b
          where b.trip ->> 'notes' = 'BOOKING_TESTS_FIXTURE');
  delete from public.notifications n
   where n.payload ->> 'customerName' = 'عميل اختبار آلي 0009';
  delete from public.quote_requests q
   where q.customer_name = 'عميل اختبار آلي 0009';
  delete from public.bookings b where b.trip ->> 'notes' = 'BOOKING_TESTS_FIXTURE';
  -- قيود الدفتر أولاً: منذ هجرة 0016 صار مفتاح الحساب `on delete restrict` حتى
  -- لا يمحو حذفُ حسابٍ تاريخَه المالي. الاختبار ينظّف قيوده هو، ولا يُضعَّف القيد.
  delete from public.ledger_entries le
   where le.account_id in ('0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f',
                           '0e0e0e0e-0e0e-4e0e-8e0e-0e0e0e0e0e0e',
                           '0d0d0d0d-0d0d-4d0d-8d0d-0d0d0d0d0d0d',
                           '0d0d0d0d-0d0d-4d0d-8d0d-0d0d0d0d0d0e');
  delete from public.payment_accounts pa
   where pa.id in ('0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f',
                   '0e0e0e0e-0e0e-4e0e-8e0e-0e0e0e0e0e0e',
                   '0d0d0d0d-0d0d-4d0d-8d0d-0d0d0d0d0d0d',
                   '0d0d0d0d-0d0d-4d0d-8d0d-0d0d0d0d0d0e');

  -- أصغر فئة نشطة لها تعريفة — هي فئة الاختبار (وهي مؤهلة دائماً لراكب واحد)
  select vc.slug, vc.capacity
    into v_slug, v_cap
  from public.vehicle_classes vc
  join public.tariffs t on t.class_id = vc.id
  where vc.active
  order by vc.capacity asc, vc.sort asc, vc.slug asc
  limit 1;

  if v_slug is null then
    raise exception 'شرط مسبق: لا توجد فئة سيارة نشطة لها تعريفة — نفّذ بذرة 0005';
  end if;

  select max(vc.capacity)
    into v_max_cap
  from public.vehicle_classes vc
  join public.tariffs t on t.class_id = vc.id
  where vc.active;

  perform set_config('tours.test_class', v_slug, false);
  -- عدد ركاب يستبعد فئة الاختبار ويُبقي فئة أكبر مؤهلة (شرط اختبار التلاعب)
  perform set_config(
    'tours.test_tamper_pax',
    case when v_max_cap > v_cap then (v_cap + 1)::text else '' end,
    false
  );

  raise notice '✔ (٠) الشروط المسبقة سليمة — فئة الاختبار «%» بسعة %', v_slug, v_cap;
end;
$$;

-- ----------------------------------------------------------------------------
-- (٠-ب) هوية المشرف — لازمة لدوال اللوحة (verify_payment / set_booking_status)
-- ----------------------------------------------------------------------------
do $$
declare
  v_admin uuid;
begin
  perform set_config('tours.test_admin', '', false);
  perform set_config('tours.test_admin_fixture', '0', false);

  select p.id into v_admin from public.profiles p where p.role = 'admin' limit 1;

  if v_admin is null then
    begin
      v_admin := '0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a'::uuid;
      delete from auth.users u where u.id = v_admin;
      insert into auth.users (id, email) values (v_admin, 'booking-tests-fixture@local.invalid');
      insert into public.profiles (id, role, full_name)
      values (v_admin, 'admin', 'مشرف اختبار مؤقت')
      on conflict (id) do update set role = 'admin';
      perform set_config('tours.test_admin_fixture', '1', false);
      raise notice '  ↳ أُنشئ مشرف اختبار مؤقت (سيُحذف في النهاية)';
    exception
      when others then
        v_admin := null;
        raise notice '  ↳ تعذّر إنشاء مشرف مؤقت (%) — ستُتخطّى اختبارات اللوحة', sqlerrm;
    end;
  end if;

  if v_admin is not null then
    perform set_config('tours.test_admin', v_admin::text, false);
    raise notice '✔ (٠-ب) هوية المشرف جاهزة';
  else
    raise notice '⚠ (٠-ب) بلا هوية مشرف — اختبارات (هـ) و(و) ستُتخطّى';
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- (أ) إنشاء الحجز — خطة العربون: الأرقام تُعاد اشتقاقها من المحرك والإعدادات
-- ----------------------------------------------------------------------------
do $$
declare
  v_class      text := current_setting('tours.test_class', true);
  v_res        record;
  v_row        record;
  v_expected   numeric;
  v_percent    numeric;
  v_min        numeric;
  v_due        numeric;
  v_events     integer;
  v_notifs     integer;
  v_channels   text[];
begin
  -- التوقّع يُحسب **بنفس مدخلات الحجز** بما فيها الإحداثيات: منذ المرحلة ٥
  -- قد يكون المسار مغطى بقائمة أسعار متعهد حقيقية، فيسعَّر بالمتعهد لا بالتعريفة.
  -- مقارنة الحجز بنتيجة استدعاء بلا إحداثيات كانت تجعل الاختبار يفشل لمجرد
  -- وجود متعهد يغطي القاهرة–الإسكندرية في قاعدة حقيقية.
  select q.total into v_expected
  from public.quote_price(220, 1, false, 0,
                          30.0444, 31.2357, 31.2001, 29.9187) q
  where q.class_slug = v_class;
  if not found then
    raise exception '(أ) المحرك لم يرجع عرضاً لفئة الاختبار «%»', v_class;
  end if;

  select public.jsonb_number(s.value, 'depositPercent', 30),
         public.jsonb_number(s.value, 'depositMinAmount', 200)
    into v_percent, v_min
  from public.site_settings s where s.key = 'payment';

  select * into v_res from public.create_booking(
    '{"label": "القاهرة", "lat": 30.0444, "lng": 31.2357}'::jsonb,
    '{"label": "الإسكندرية", "lat": 31.2001, "lng": 29.9187}'::jsonb,
    1, false, 0, 220, 180, 'osrm', v_class, 'deposit',
    'اختبار آلي', '01000000000', '01000000000', null, 'BOOKING_TESTS_FIXTURE'
  );

  -- (أ-١) الإجمالي = ناتج quote_price حرفياً (لا سعر من المستدعي إطلاقاً)
  if v_res.total <> v_expected then
    raise exception '(أ-١) الإجمالي: توقعنا % وحصلنا %', v_expected, v_res.total;
  end if;

  -- (أ-٢) العربون = أكبر من (النسبة، الحد الأدنى) وبسقف الإجمالي
  v_due := least(v_expected, greatest(round(v_expected * v_percent / 100), v_min));
  if v_res.amount_due <> v_due then
    raise exception '(أ-٢) العربون بنسبة %٪ وحد أدنى %: توقعنا % وحصلنا %',
      v_percent, v_min, v_due, v_res.amount_due;
  end if;
  if v_res.amount_remaining <> v_expected - v_due then
    raise exception '(أ-٣) المتبقي: توقعنا % وحصلنا %', v_expected - v_due, v_res.amount_remaining;
  end if;
  if v_res.amount_due + v_res.amount_remaining <> v_res.total then
    raise exception '(أ-٤) العربون + المتبقي لا يساوي الإجمالي (% + % ≠ %)',
      v_res.amount_due, v_res.amount_remaining, v_res.total;
  end if;

  -- (أ-٥) المرجع والتوكن والحالة الابتدائية
  select * into v_row from public.bookings b where b.id = v_res.id;
  if v_row.status <> 'pending_payment' then
    raise exception '(أ-٥) الحالة الابتدائية: توقعنا pending_payment وحصلنا %', v_row.status;
  end if;
  if v_res.reference !~ '^TR-[0-9A-Z]{6,}$' then
    raise exception '(أ-٦) صيغة المرجع غير متوقعة: %', v_res.reference;
  end if;
  if length(v_res.public_token) < 48 or v_res.public_token !~ '^[0-9a-f]+$' then
    raise exception '(أ-٧) التوكن يجب أن يكون ٤٨ محرفاً ست عشرياً على الأقل (طوله %)',
      length(v_res.public_token);
  end if;
  if v_row.class_title is null or btrim(v_row.class_title) = '' then
    raise exception '(أ-٨) عنوان الفئة لم يُحفظ في لقطة الحجز';
  end if;
  if v_row.trip ->> 'distanceKm' is null or (v_row.trip ->> 'passengers')::integer <> 1 then
    raise exception '(أ-٩) لقطة الرحلة ناقصة: %', v_row.trip;
  end if;

  -- (أ-١٠) السجل والإشعار كُتبا داخل نفس المعاملة
  select count(*) into v_events
  from public.booking_events e
  where e.booking_id = v_res.id and e.to_status = 'pending_payment' and e.from_status is null;
  if v_events <> 1 then
    raise exception '(أ-١٠) توقعنا سطر سجل ابتدائياً واحداً وحصلنا %', v_events;
  end if;

  select count(*), max(n.channels) into v_notifs, v_channels
  from public.notifications n
  where n.event = 'booking_created' and n.payload ->> 'bookingId' = v_res.id::text;
  if v_notifs <> 1 then
    raise exception '(أ-١١) توقعنا إشعار booking_created واحداً وحصلنا %', v_notifs;
  end if;
  if not ('dashboard' = any (v_channels)) then
    raise exception '(أ-١٢) جرس اللوحة يجب أن يكون ضمن القنوات دائماً (وجدنا %)', v_channels;
  end if;

  raise notice '✔ (أ) إنشاء الحجز بخطة العربون: السعر والعربون والسجل والإشعار';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ب) مكافحة التلاعب — فئة خارج العروض المؤهلة تُرفض ولا يُنشأ أي حجز
-- ----------------------------------------------------------------------------
do $$
declare
  v_class  text := current_setting('tours.test_class', true);
  v_pax    text := current_setting('tours.test_tamper_pax', true);
  v_before integer;
  v_after  integer;
  v_raised boolean;
  v_hint   text;
  v_ref    text;
begin
  select count(*) into v_before from public.bookings;

  if coalesce(v_pax, '') = '' then
    raise notice '  ↳ (ب-١) تخطٍّ: لا توجد فئة أكبر من فئة الاختبار لبناء الحالة';
  else
    v_raised := false;
    begin
      select t.reference into v_ref from public.create_booking(
        '{"label": "القاهرة", "lat": 30.0444, "lng": 31.2357}'::jsonb,
        '{"label": "الإسكندرية", "lat": 31.2001, "lng": 29.9187}'::jsonb,
        v_pax::integer, false, 0, 220, 180, 'osrm', v_class, 'full',
        'اختبار آلي', '01000000000', null, null, 'BOOKING_TESTS_FIXTURE'
      ) t;
    exception
      when others then
        v_raised := true;
        get stacked diagnostics v_hint = pg_exception_hint;
    end;

    if not v_raised then
      raise exception
        '(ب-١) ثغرة تلاعب: قُبلت الفئة «%» لـ % راكباً وأُنشئ الحجز %', v_class, v_pax, v_ref;
    end if;
    if v_hint is distinct from 'class-unavailable' then
      raise exception '(ب-٢) رمز الخطأ: توقعنا class-unavailable وحصلنا «%»', coalesce(v_hint, 'بلا');
    end if;
  end if;

  -- (ب-٣) فئة غير موجودة أصلاً تُرفض بنفس الرمز
  v_raised := false;
  begin
    select t.reference into v_ref from public.create_booking(
      '{"label": "القاهرة", "lat": 30.0444, "lng": 31.2357}'::jsonb,
      '{"label": "الإسكندرية", "lat": 31.2001, "lng": 29.9187}'::jsonb,
      1, false, 0, 220, 180, 'osrm', 'طائرة-مروحية', 'full',
      'اختبار آلي', '01000000000', null, null, 'BOOKING_TESTS_FIXTURE'
    ) t;
  exception
    when others then
      v_raised := true;
      get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if not v_raised then
    raise exception '(ب-٣) فئة وهمية قُبلت وأُنشئ الحجز %', v_ref;
  end if;
  if v_hint is distinct from 'class-unavailable' then
    raise exception '(ب-٤) رمز خطأ الفئة الوهمية: توقعنا class-unavailable وحصلنا «%»',
      coalesce(v_hint, 'بلا');
  end if;

  -- (ب-٥) مدخلات ناقصة تُرفض بـ invalid-input لا بانهيار
  v_raised := false;
  begin
    select t.reference into v_ref from public.create_booking(
      '{"label": "القاهرة", "lat": 30.0444, "lng": 31.2357}'::jsonb,
      '{"label": "الإسكندرية", "lat": 31.2001, "lng": 29.9187}'::jsonb,
      1, false, 0, 220, 180, 'osrm', v_class, 'full',
      '   ', '01000000000', null, null, 'BOOKING_TESTS_FIXTURE'
    ) t;
  exception
    when others then
      v_raised := true;
      get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if not v_raised or v_hint is distinct from 'invalid-input' then
    raise exception '(ب-٥) اسم فارغ: توقعنا رفضاً بـ invalid-input (رُفض=% رمز=%)',
      v_raised, coalesce(v_hint, 'بلا');
  end if;

  -- (ب-٦) لا صف حجز تسرّب من أي محاولة مرفوضة
  select count(*) into v_after from public.bookings;
  if v_after <> v_before then
    raise exception '(ب-٦) محاولة مرفوضة خلّفت صفوفاً: قبل % وبعد %', v_before, v_after;
  end if;

  raise notice '✔ (ب) مكافحة التلاعب: الفئة غير المؤهلة والمدخلات الناقصة مرفوضة بلا أثر';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ج) خطة الدفع الكامل — المتبقي صفر، والعربون يُقصّ عند سقف الإجمالي
-- ----------------------------------------------------------------------------
do $$
declare
  v_class    text := current_setting('tours.test_class', true);
  v_backup   jsonb;
  v_res      record;
  v_expected numeric;
begin
  -- بنفس إحداثيات الحجز أدناه — وإلا قارنّا رحلةً برحلة أخرى (انظر الشرح في «أ»)
  select q.total into v_expected
  from public.quote_price(220, 1, false, 0,
                          30.0444, 31.2357, 31.2001, 29.9187) q
  where q.class_slug = v_class;

  -- (ج-١) الدفع الكامل
  select * into v_res from public.create_booking(
    '{"label": "القاهرة", "lat": 30.0444, "lng": 31.2357}'::jsonb,
    '{"label": "الإسكندرية", "lat": 31.2001, "lng": 29.9187}'::jsonb,
    1, false, 0, 220, 180, 'osrm', v_class, 'full',
    'اختبار آلي', '01000000000', null, null, 'BOOKING_TESTS_FIXTURE'
  );

  if v_res.amount_due <> v_res.total then
    raise exception '(ج-١) الدفع الكامل: المطلوب % والإجمالي %', v_res.amount_due, v_res.total;
  end if;
  if v_res.amount_remaining <> 0 then
    raise exception '(ج-٢) الدفع الكامل: المتبقي يجب أن يكون صفراً وحصلنا %', v_res.amount_remaining;
  end if;
  if v_res.total <> v_expected then
    raise exception '(ج-٣) الدفع الكامل: الإجمالي % ≠ ناتج المحرك %', v_res.total, v_expected;
  end if;

  -- (ج-٤) حد أدنى للعربون يفوق الإجمالي ← يُقصّ عند الإجمالي ولا يتجاوزه أبداً
  select s.value into v_backup from public.site_settings s where s.key = 'payment';

  update public.site_settings
     set value = v_backup || jsonb_build_object('depositMinAmount', v_expected + 1000)
   where key = 'payment';

  select * into v_res from public.create_booking(
    '{"label": "القاهرة", "lat": 30.0444, "lng": 31.2357}'::jsonb,
    '{"label": "الإسكندرية", "lat": 31.2001, "lng": 29.9187}'::jsonb,
    1, false, 0, 220, 180, 'osrm', v_class, 'deposit',
    'اختبار آلي', '01000000000', null, null, 'BOOKING_TESTS_FIXTURE'
  );

  if v_res.amount_due <> v_res.total or v_res.amount_remaining <> 0 then
    raise exception '(ج-٤) عربون يفوق الإجمالي لم يُقصّ: مطلوب % متبقٍّ % إجمالي %',
      v_res.amount_due, v_res.amount_remaining, v_res.total;
  end if;

  update public.site_settings set value = v_backup where key = 'payment';

  raise notice '✔ (ج) خطة الدفع الكامل وقصّ العربون عند سقف الإجمالي';
exception
  when others then
    if v_backup is not null then
      update public.site_settings set value = v_backup where key = 'payment';
    end if;
    raise;
end;
$$;

-- ----------------------------------------------------------------------------
-- (د) إرفاق الإيصال — ينقل الحجز إلى «قيد المراجعة» ويُرفض من أي حالة أخرى
-- ----------------------------------------------------------------------------
do $$
declare
  v_class   text := current_setting('tours.test_class', true);
  v_book    record;
  v_att     record;
  v_pay     record;
  v_status  text;
  v_raised  boolean;
  v_hint    text;
  v_notifs  integer;
begin
  select * into v_book from public.create_booking(
    '{"label": "القاهرة", "lat": 30.0444, "lng": 31.2357}'::jsonb,
    '{"label": "الإسكندرية", "lat": 31.2001, "lng": 29.9187}'::jsonb,
    1, false, 0, 220, 180, 'osrm', v_class, 'deposit',
    'اختبار آلي', '01000000000', null, null, 'BOOKING_TESTS_FIXTURE'
  );

  -- (د-١) الرفع من pending_payment ينجح وينقل الحالة
  select * into v_att from public.attach_receipt(
    v_book.public_token, v_book.public_token || '/fixture.jpg', null, null
  );

  if v_att.status <> 'under_review' then
    raise exception '(د-١) الحالة بعد الرفع: توقعنا under_review وحصلنا %', v_att.status;
  end if;

  select b.status into v_status from public.bookings b where b.id = v_book.id;
  if v_status <> 'under_review' then
    raise exception '(د-٢) حالة الصف في الجدول: توقعنا under_review وحصلنا %', v_status;
  end if;

  select * into v_pay from public.payments p where p.id = v_att.payment_id;
  if v_pay.status <> 'pending' then
    raise exception '(د-٣) حالة الإيصال: توقعنا pending وحصلنا %', v_pay.status;
  end if;
  if v_pay.amount <> v_book.amount_due then
    raise exception '(د-٤) قيمة الإيصال الافتراضية: توقعنا % وحصلنا %',
      v_book.amount_due, v_pay.amount;
  end if;
  if v_pay.receipt_path is null then
    raise exception '(د-٥) مسار الإيصال لم يُحفظ';
  end if;

  select count(*) into v_notifs
  from public.notifications n
  where n.event = 'receipt_uploaded' and n.payload ->> 'bookingId' = v_book.id::text;
  if v_notifs <> 1 then
    raise exception '(د-٦) توقعنا إشعار receipt_uploaded واحداً وحصلنا %', v_notifs;
  end if;

  -- (د-٧) رفع ثانٍ والحجز قيد المراجعة ← مرفوض
  v_raised := false;
  begin
    perform 1 from public.attach_receipt(
      v_book.public_token, v_book.public_token || '/again.jpg', null, null
    );
  exception
    when others then
      v_raised := true;
      get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if not v_raised or v_hint is distinct from 'invalid-status' then
    raise exception '(د-٧) الرفع المكرر: توقعنا رفضاً بـ invalid-status (رُفض=% رمز=%)',
      v_raised, coalesce(v_hint, 'بلا');
  end if;

  -- (د-٨) توكن مزيف ← مرفوض بلا تسريب أي معلومة
  v_raised := false;
  begin
    perform 1 from public.attach_receipt(
      repeat('f', 48), 'x/y.jpg', null, null
    );
  exception
    when others then
      v_raised := true;
      get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if not v_raised or v_hint is distinct from 'booking-not-found' then
    raise exception '(د-٨) توكن مزيف: توقعنا booking-not-found (رُفض=% رمز=%)',
      v_raised, coalesce(v_hint, 'بلا');
  end if;

  raise notice '✔ (د) إرفاق الإيصال: النقل إلى قيد المراجعة والحراسة من الحالات الأخرى';
end;
$$;

-- ----------------------------------------------------------------------------
-- (هـ) تحقق التشغيل — الاعتماد يؤكد الحجز، والرفض يعيده لانتظار الدفع
-- ----------------------------------------------------------------------------
do $$
declare
  v_admin  text := nullif(current_setting('tours.test_admin', true), '');
  v_class  text := current_setting('tours.test_class', true);
  v_book   record;
  v_att    record;
  v_new    text;
  v_status text;
  v_pstat  text;
  v_raised boolean;
  v_hint   text;
  v_notifs integer;
begin
  if v_admin is null then
    raise notice '  ↳ (هـ) تخطٍّ: بلا هوية مشرف';
    return;
  end if;

  -- (هـ-١) بلا هوية مشرف الدالة ترفض أصلاً
  perform set_config('request.jwt.claim.sub', '', true);
  select * into v_book from public.create_booking(
    '{"label": "القاهرة", "lat": 30.0444, "lng": 31.2357}'::jsonb,
    '{"label": "الإسكندرية", "lat": 31.2001, "lng": 29.9187}'::jsonb,
    1, false, 0, 220, 180, 'osrm', v_class, 'full',
    'اختبار آلي', '01000000000', null, null, 'BOOKING_TESTS_FIXTURE'
  );
  select * into v_att from public.attach_receipt(
    v_book.public_token, v_book.public_token || '/ok.jpg', null, null
  );

  v_raised := false;
  begin
    v_new := public.verify_payment(v_book.id, true, 'محاولة بلا صلاحية');
  exception
    when others then
      v_raised := true;
      get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if not v_raised or v_hint is distinct from 'forbidden' then
    raise exception '(هـ-١) غير المشرف اعتمد تحويلاً! (رُفض=% رمز=%)',
      v_raised, coalesce(v_hint, 'بلا');
  end if;

  -- من هنا نعمل بهوية المشرف (محلية للمعاملة فقط)
  perform set_config('request.jwt.claim.sub', v_admin, true);
  if not public.is_admin() then
    raise exception '(هـ) تعذّر انتحال هوية المشرف — is_admin() ما زالت false';
  end if;

  -- (هـ-٢) الاعتماد
  v_new := public.verify_payment(v_book.id, true, 'وصل التحويل');
  if v_new <> 'confirmed' then
    raise exception '(هـ-٢) الاعتماد: توقعنا confirmed وحصلنا %', v_new;
  end if;

  select b.status into v_status from public.bookings b where b.id = v_book.id;
  select p.status into v_pstat from public.payments p where p.id = v_att.payment_id;
  if v_status <> 'confirmed' or v_pstat <> 'approved' then
    raise exception '(هـ-٣) بعد الاعتماد: الحجز % والإيصال %', v_status, v_pstat;
  end if;

  select count(*) into v_notifs
  from public.notifications n
  where n.event = 'booking_confirmed' and n.payload ->> 'bookingId' = v_book.id::text;
  if v_notifs <> 1 then
    raise exception '(هـ-٤) توقعنا إشعار booking_confirmed واحداً وحصلنا %', v_notifs;
  end if;

  -- (هـ-٥) الرفض على حجز آخر يعيده لانتظار الدفع ويتيح رفعاً جديداً
  select * into v_book from public.create_booking(
    '{"label": "القاهرة", "lat": 30.0444, "lng": 31.2357}'::jsonb,
    '{"label": "الإسكندرية", "lat": 31.2001, "lng": 29.9187}'::jsonb,
    1, false, 0, 220, 180, 'osrm', v_class, 'full',
    'اختبار آلي', '01000000000', null, null, 'BOOKING_TESTS_FIXTURE'
  );
  select * into v_att from public.attach_receipt(
    v_book.public_token, v_book.public_token || '/bad.jpg', null, null
  );

  v_new := public.verify_payment(v_book.id, false, 'صورة غير واضحة');
  if v_new <> 'pending_payment' then
    raise exception '(هـ-٥) الرفض: توقعنا pending_payment وحصلنا %', v_new;
  end if;

  select b.status into v_status from public.bookings b where b.id = v_book.id;
  select p.status into v_pstat from public.payments p where p.id = v_att.payment_id;
  if v_status <> 'pending_payment' or v_pstat <> 'rejected' then
    raise exception '(هـ-٦) بعد الرفض: الحجز % والإيصال %', v_status, v_pstat;
  end if;

  -- (هـ-٧) بعد الرفض يستطيع العميل رفع إيصال جديد (الدورة لا تُغلق عليه)
  select * into v_att from public.attach_receipt(
    v_book.public_token, v_book.public_token || '/retry.jpg', null, null
  );
  if v_att.status <> 'under_review' then
    raise exception '(هـ-٧) إعادة الرفع بعد الرفض فشلت (الحالة %)', v_att.status;
  end if;

  raise notice '✔ (هـ) تحقق التشغيل: اعتماد ← مؤكد، رفض ← انتظار الدفع مع إتاحة إعادة الرفع';
end;
$$;

-- ----------------------------------------------------------------------------
-- (و) حراسة الانتقالات — الممنوع يرمي، والمسموح يمر، والـ UPDATE المباشر محروس
-- ----------------------------------------------------------------------------
do $$
declare
  v_admin  text := nullif(current_setting('tours.test_admin', true), '');
  v_class  text := current_setting('tours.test_class', true);
  v_book   record;
  v_status text;
  v_raised boolean;
  v_hint   text;
  v_events integer;
begin
  -- (و-١) جدول الانتقالات نفسه (لا يحتاج صلاحية)
  if not public.booking_transition_allowed('pending_payment', 'under_review')
     or not public.booking_transition_allowed('under_review', 'confirmed')
     or not public.booking_transition_allowed('under_review', 'pending_payment')
     or not public.booking_transition_allowed('confirmed', 'assigned')
     or not public.booking_transition_allowed('assigned', 'completed') then
    raise exception '(و-١) انتقال مسموح مرفوض في جدول الانتقالات';
  end if;
  if public.booking_transition_allowed('pending_payment', 'confirmed')
     or public.booking_transition_allowed('confirmed', 'pending_payment')
     or public.booking_transition_allowed('completed', 'cancelled')
     or public.booking_transition_allowed('cancelled', 'confirmed')
     or public.booking_transition_allowed('completed', 'assigned') then
    raise exception '(و-٢) انتقال ممنوع مسموح في جدول الانتقالات';
  end if;

  if v_admin is null then
    raise notice '  ↳ (و-٣..٧) تخطٍّ: بلا هوية مشرف';
    raise notice '✔ (و) جدول الانتقالات صحيح (اختبارات اللوحة متخطّاة)';
    return;
  end if;

  perform set_config('request.jwt.claim.sub', v_admin, true);

  select * into v_book from public.create_booking(
    '{"label": "القاهرة", "lat": 30.0444, "lng": 31.2357}'::jsonb,
    '{"label": "الإسكندرية", "lat": 31.2001, "lng": 29.9187}'::jsonb,
    1, false, 0, 220, 180, 'osrm', v_class, 'full',
    'اختبار آلي', '01000000000', null, null, 'BOOKING_TESTS_FIXTURE'
  );

  -- (و-٣) قفزة ممنوعة: انتظار الدفع ← مؤكد مباشرة
  v_raised := false;
  begin
    perform public.set_booking_status(v_book.id, 'confirmed', 'قفزة');
  exception
    when others then
      v_raised := true;
      get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if not v_raised or v_hint is distinct from 'illegal-transition' then
    raise exception '(و-٣) القفزة إلى confirmed لم تُرفض (رُفض=% رمز=%)',
      v_raised, coalesce(v_hint, 'بلا');
  end if;

  -- (و-٤) حتى UPDATE مباشر على الجدول محروس بالمُشغّل لا بالدالة وحدها
  v_raised := false;
  begin
    update public.bookings b set status = 'completed' where b.id = v_book.id;
  exception
    when others then
      v_raised := true;
      get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if not v_raised or v_hint is distinct from 'illegal-transition' then
    raise exception '(و-٤) UPDATE مباشر تجاوز الحراسة! (رُفض=% رمز=%)',
      v_raised, coalesce(v_hint, 'بلا');
  end if;

  -- (و-٥) المسار المسموح يمر كاملاً ويُسجَّل
  perform public.set_booking_status(v_book.id, 'cancelled', 'إلغاء تجريبي');
  select b.status into v_status from public.bookings b where b.id = v_book.id;
  if v_status <> 'cancelled' then
    raise exception '(و-٥) الإلغاء المسموح لم يُطبَّق (الحالة %)', v_status;
  end if;

  select count(*) into v_events
  from public.booking_events e
  where e.booking_id = v_book.id
    and e.from_status = 'pending_payment'
    and e.to_status = 'cancelled'
    and e.note = 'إلغاء تجريبي';
  if v_events <> 1 then
    raise exception '(و-٦) سجل الإلغاء مع ملاحظته: توقعنا سطراً واحداً وحصلنا %', v_events;
  end if;

  -- (و-٧) الحالة النهائية لا تقبل شيئاً بعدها
  v_raised := false;
  begin
    perform public.set_booking_status(v_book.id, 'confirmed', 'إحياء ملغى');
  exception
    when others then v_raised := true;
  end;
  if not v_raised then
    raise exception '(و-٧) حجز ملغى قَبِل انتقالاً جديداً';
  end if;

  raise notice '✔ (و) حراسة الانتقالات: الدالة والمُشغّل يمنعان القفزات، والسجل يوثّق المسموح';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ز) حدود حسابات الاستقبال — الحساب المُشبع يختفي من صفحة الدفع آلياً
-- ----------------------------------------------------------------------------
do $$
declare
  v_class   text := current_setting('tours.test_class', true);
  v_acc     uuid := '0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f';
  v_book    record;
  v_seen    boolean;
  v_head    numeric;
begin
  -- handle اصطناعي عمداً: هجرة 0009 تفرض تفرد (kind, handle)، فرقم واقعي قد
  -- يصطدم بحساب حقيقي للمالك ويُفشل الاختبار على قاعدة حيّة.
  insert into public.payment_accounts (id, kind, label, handle, holder_name,
                                       opening_balance, daily_cap, monthly_cap, active, sort)
  values (v_acc, 'wallet', 'محفظة اختبار آلي', 'FIXTURE-CAP-0100000000', 'اختبار',
          0, 1000, null, true, 999)
  on conflict (id) do update
    set handle = 'FIXTURE-CAP-0100000000', daily_cap = 1000, monthly_cap = null, active = true;

  -- (ز-١) حساب فارغ بحد يومي ١٠٠٠ يظهر لمبلغ ٥٠٠
  select true, a.daily_headroom into v_seen, v_head
  from public.available_payment_accounts(500) a where a.id = v_acc;
  if not coalesce(v_seen, false) then
    raise exception '(ز-١) حساب ضمن حدّه لم يظهر';
  end if;
  if v_head <> 1000 then
    raise exception '(ز-٢) المتاح اليومي قبل أي تحصيل: توقعنا ١٠٠٠ وحصلنا %', v_head;
  end if;

  -- تحصيل معتمد بـ ٩٠٠ اليوم على نفس الحساب
  select * into v_book from public.create_booking(
    '{"label": "القاهرة", "lat": 30.0444, "lng": 31.2357}'::jsonb,
    '{"label": "الإسكندرية", "lat": 31.2001, "lng": 29.9187}'::jsonb,
    1, false, 0, 220, 180, 'osrm', v_class, 'full',
    'اختبار آلي', '01000000000', null, null, 'BOOKING_TESTS_FIXTURE'
  );
  insert into public.payments (booking_id, account_id, amount, receipt_path, status)
  values (v_book.id, v_acc, 900, 'fixture/paid.jpg', 'approved');

  -- (ز-٣) المتاح انخفض إلى ١٠٠
  v_seen := false;
  select true, a.daily_headroom into v_seen, v_head
  from public.available_payment_accounts(0) a where a.id = v_acc;
  if not coalesce(v_seen, false) or v_head <> 100 then
    raise exception '(ز-٣) بعد تحصيل ٩٠٠: ظهر=% والمتاح=%', coalesce(v_seen, false), v_head;
  end if;

  -- (ز-٤) مبلغ يبلغ الحد تماماً ما زال مقبولاً
  v_seen := false;
  select true into v_seen from public.available_payment_accounts(100) a where a.id = v_acc;
  if not coalesce(v_seen, false) then
    raise exception '(ز-٤) مبلغ يساوي المتاح تماماً استُبعد بلا داعٍ';
  end if;

  -- (ز-٥) مبلغ يتجاوز الحد ← الحساب يختفي
  v_seen := false;
  select true into v_seen from public.available_payment_accounts(200) a where a.id = v_acc;
  if coalesce(v_seen, false) then
    raise exception '(ز-٥) حساب متجاوز حدَّه اليومي ما زال معروضاً على العميل';
  end if;

  -- (ز-٦) الإيصال المعلّق لا يحجز سعة (المعتمد وحده يُحسب)
  insert into public.payments (booking_id, account_id, amount, receipt_path, status)
  values (v_book.id, v_acc, 5000, 'fixture/pending.jpg', 'pending');
  v_seen := false;
  select true, a.daily_headroom into v_seen, v_head
  from public.available_payment_accounts(100) a where a.id = v_acc;
  if not coalesce(v_seen, false) or v_head <> 100 then
    raise exception '(ز-٦) إيصال معلّق أثّر في الحد: ظهر=% والمتاح=%',
      coalesce(v_seen, false), v_head;
  end if;

  -- (ز-٧) الحساب المعطّل لا يظهر مهما كان المبلغ
  update public.payment_accounts set active = false where id = v_acc;
  v_seen := false;
  select true into v_seen from public.available_payment_accounts(1) a where a.id = v_acc;
  if coalesce(v_seen, false) then
    raise exception '(ز-٧) حساب معطّل معروض على العميل';
  end if;

  raise notice '✔ (ز) الحدود اليومية تُفرض في SQL: المُشبع والمعطّل يختفيان تلقائياً';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ح) المتابعة بالتوكن — صف واحد للتوكن الصحيح، وصفر لأي شيء آخر
-- ----------------------------------------------------------------------------
do $$
declare
  v_class  text := current_setting('tours.test_class', true);
  v_book   record;
  v_n      integer;
  v_row    record;
  v_result text;
begin
  select * into v_book from public.create_booking(
    '{"label": "القاهرة", "lat": 30.0444, "lng": 31.2357}'::jsonb,
    '{"label": "الإسكندرية", "lat": 31.2001, "lng": 29.9187}'::jsonb,
    1, false, 0, 220, 180, 'osrm', v_class, 'deposit',
    'اختبار آلي', '01000000000', null, null, 'BOOKING_TESTS_FIXTURE'
  );

  select count(*) into v_n from public.get_booking_by_token(v_book.public_token);
  if v_n <> 1 then
    raise exception '(ح-١) التوكن الصحيح: توقعنا صفاً واحداً وحصلنا %', v_n;
  end if;

  select * into v_row from public.get_booking_by_token(v_book.public_token);
  if v_row.reference <> v_book.reference or v_row.total <> v_book.total then
    raise exception '(ح-٢) الصف المرجَع لا يطابق الحجز (% ≠ %)', v_row.reference, v_book.reference;
  end if;
  if jsonb_typeof(v_row.payments) <> 'array' then
    raise exception '(ح-٣) حقل payments يجب أن يكون مصفوفة دائماً (وجدنا %)',
      jsonb_typeof(v_row.payments);
  end if;

  -- (ح-٤) لا تسريب لأعمدة داخلية في توقيع الدالة
  v_result := pg_get_function_result('public.get_booking_by_token(text)'::regprocedure);
  if position('public_token' in v_result) > 0 then
    raise exception '(ح-٤) الدالة تُرجع public_token — تسريب للسر نفسه';
  end if;

  -- (ح-٥) الإيصال لا يكشف مساره الداخلي ولا حساب الاستقبال
  perform 1 from public.attach_receipt(
    v_book.public_token, v_book.public_token || '/priv.jpg', null, null
  );
  select * into v_row from public.get_booking_by_token(v_book.public_token);
  if v_row.payments::text like '%receiptPath%'
     or v_row.payments::text like '%receipt_path%'
     or v_row.payments::text like '%accountId%'
     or v_row.payments::text like '%verifiedBy%' then
    raise exception '(ح-٥) بيانات إيصال داخلية مكشوفة للعميل: %', v_row.payments;
  end if;

  -- (ح-٦) أي توكن غير صحيح ← صفر صفوف (بلا خطأ يكشف الوجود من عدمه)
  select count(*) into v_n from public.get_booking_by_token('garbage');
  if v_n <> 0 then raise exception '(ح-٦) توكن عشوائي أرجع % صفاً', v_n; end if;

  select count(*) into v_n from public.get_booking_by_token('');
  if v_n <> 0 then raise exception '(ح-٧) توكن فارغ أرجع % صفاً', v_n; end if;

  select count(*) into v_n from public.get_booking_by_token(null);
  if v_n <> 0 then raise exception '(ح-٨) توكن null أرجع % صفاً', v_n; end if;

  select count(*) into v_n from public.get_booking_by_token(repeat('a', 48));
  if v_n <> 0 then raise exception '(ح-٩) توكن بطول صحيح وقيمة خاطئة أرجع % صفاً', v_n; end if;

  raise notice '✔ (ح) المتابعة بالتوكن: صف واحد للصحيح وصفر لغيره بلا تسريب';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ط) الصلاحيات — الفخّ المعروف: المنح يأتي من مصدرين، والفحص هنا على الكتالوج
-- ----------------------------------------------------------------------------
do $$
declare
  v_public boolean;
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    raise notice '  ↳ (ط) تخطٍّ: دور anon غير موجود (قاعدة ليست Supabase)';
    return;
  end if;

  -- (ط-١) الزائر بلا أي وصول مباشر لبيانات الحجز والدفع
  if has_table_privilege('anon', 'public.bookings', 'SELECT')
     or has_table_privilege('anon', 'public.payments', 'SELECT')
     or has_table_privilege('anon', 'public.payment_accounts', 'SELECT')
     or has_table_privilege('anon', 'public.booking_events', 'SELECT')
     or has_table_privilege('anon', 'public.notifications', 'SELECT')
     or has_table_privilege('anon', 'public.quote_requests', 'SELECT') then
    raise exception '(ط-١) الزائر يملك SELECT مباشراً على أحد جداول الحجز';
  end if;

  -- (ط-٢) فخّ TRUNCATE: لا يخضع لـ RLS إطلاقاً فوجوده مع anon كارثة صامتة
  if has_table_privilege('anon', 'public.bookings', 'TRUNCATE')
     or has_table_privilege('anon', 'public.payments', 'TRUNCATE')
     or has_table_privilege('anon', 'public.payment_accounts', 'TRUNCATE')
     or has_table_privilege('anon', 'public.notifications', 'TRUNCATE')
     or has_table_privilege('anon', 'public.quote_requests', 'TRUNCATE') then
    raise exception '(ط-٢) الزائر يملك TRUNCATE على أحد جداول الحجز';
  end if;

  -- (ط-٣) 🔒 د٤ — الإدراج المباشر على quote_requests سُحب من الزائر:
  --       الطريق الوحيد الآن دالة create_quote_request المتحقِّقة (اختبار «م»).
  if has_table_privilege('anon', 'public.quote_requests', 'INSERT') then
    raise exception '(ط-٣) الزائر ما زال يملك INSERT مباشراً على quote_requests';
  end if;

  -- (ط-٤) ما يحتاجه الزائر فعلاً بعد التصليب: المتابعة بالتوكن، الغلاف الثنائي
  --       للإيصال، الحسابات المربوطة بالتوكن، وتسجيل طلب عرض السعر.
  if not has_function_privilege('anon', 'public.get_booking_by_token(text)', 'EXECUTE')
     or not has_function_privilege('anon', 'public.attach_receipt(text, text)', 'EXECUTE')
     or not has_function_privilege('anon', 'public.available_payment_accounts(text, numeric)', 'EXECUTE')
     or not has_function_privilege('anon', 'public.create_quote_request(text, text, text, text)', 'EXECUTE')
     or not has_function_privilege('anon', 'public.receipt_upload_allowed(text)', 'EXECUTE') then
    raise exception '(ط-٤) إحدى دوال الضيف غير قابلة للتنفيذ من anon';
  end if;

  -- (ط-٥) 🔒 الدوال المسحوبة في هجرة 0009 — فحص كتالوجي مستقل لكل واحدة
  --       حتى تقول رسالة الفشل أيّها بالضبط انفتح من جديد.
  --       (تذكير الفخّ: alter default privileges في Supabase تمنح anon صلاحية
  --        EXECUTE على كل دالة جديدة، فسحب PUBLIC وحده لا يُغلق شيئاً.)
  if has_function_privilege('anon',
       'public.create_booking(jsonb, jsonb, integer, boolean, numeric, numeric, numeric, text, text, text, text, text, text, timestamptz, text)',
       'EXECUTE') then
    raise exception '(ط-٥-أ) د١ مكسورة: anon ما زال يستطيع تنفيذ create_booking مباشرة';
  end if;
  if has_function_privilege('authenticated',
       'public.create_booking(jsonb, jsonb, integer, boolean, numeric, numeric, numeric, text, text, text, text, text, text, timestamptz, text)',
       'EXECUTE') then
    raise exception '(ط-٥-ب) د١ مكسورة: authenticated ما زال يستطيع تنفيذ create_booking مباشرة';
  end if;
  if has_function_privilege('anon', 'public.attach_receipt(text, text, uuid, numeric)', 'EXECUTE') then
    raise exception '(ط-٥-ج) د٢ مكسورة: anon يستطيع تنفيذ التوقيع الأربعي لـ attach_receipt';
  end if;
  if has_function_privilege('anon', 'public.available_payment_accounts(numeric)', 'EXECUTE') then
    raise exception '(ط-٥-د) د٥ مكسورة: anon يستطيع تعداد حسابات الاستقبال بلا توكن';
  end if;
  if has_function_privilege('anon', 'public.haversine_km(numeric, numeric, numeric, numeric)', 'EXECUTE') then
    raise exception '(ط-٥-هـ) دالة المسافة الداخلية مكشوفة لـ anon';
  end if;

  -- (ط-٥-و) مفتاح الخدمة وحده هو من يُنشئ الحجوزات الآن
  if exists (select 1 from pg_roles where rolname = 'service_role')
     and not has_function_privilege('service_role',
       'public.create_booking(jsonb, jsonb, integer, boolean, numeric, numeric, numeric, text, text, text, text, text, text, timestamptz, text)',
       'EXECUTE') then
    raise exception '(ط-٥-و) service_role لا يستطيع تنفيذ create_booking — مسار /api/booking معطّل';
  end if;

  -- (ط-٦) دوال اللوحة والدوال الداخلية محجوبة عن الزائر
  if has_function_privilege('anon', 'public.verify_payment(uuid, boolean, text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.set_booking_status(uuid, text, text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.queue_notification(text, jsonb)', 'EXECUTE')
     or has_function_privilege('anon', 'public.next_booking_reference()', 'EXECUTE') then
    raise exception '(ط-٦) الزائر يستطيع تنفيذ دالة إدارية أو داخلية';
  end if;

  -- (ط-٧) RLS مفعّل على الجداول الستة
  if exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('bookings', 'booking_events', 'payment_accounts',
                        'payments', 'quote_requests', 'notifications')
      and not c.relrowsecurity
  ) then
    raise exception '(ط-٧) RLS غير مفعّل على أحد جداول الحجز';
  end if;

  -- (ط-٨) دلو الإيصالات خاص وليس عاماً
  select b.public into v_public from storage.buckets b where b.id = 'receipts';
  if v_public is null then
    raise exception '(ط-٨) دلو receipts غير موجود';
  end if;
  if v_public then
    raise exception '(ط-٩) دلو receipts عام — الإيصالات مكشوفة للإنترنت';
  end if;

  -- (ط-١٠) سياسة إدراج المتساهلة على quote_requests أُزيلت (د٤)
  if exists (
    select 1 from pg_policies p
    where p.schemaname = 'public'
      and p.tablename = 'quote_requests'
      and p.policyname = 'quote_requests_insert_public'
  ) then
    raise exception '(ط-١٠) سياسة quote_requests_insert_public ما زالت قائمة';
  end if;

  raise notice '✔ (ط) الصلاحيات: صفر وصول مباشر للزائر، ودلو الإيصالات خاص';
end;
$$;

-- ============================================================================
-- اختبارات التصليب — هجرة 0009_booking_hardening.sql
-- كل قسم هنا يثبّت ثغرة أغلقتها الهجرة، فلا تعود بصمت في تعديل لاحق.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (ي) د١ — المسافة تُقاس على الخريطة: أرضية وسقف حول الخط المستقيم
--
-- الثغرة الأصلية: من يستدعي create_booking مباشرة يُعلن مسافة ١ كم لرحلة
-- القاهرة–الإسكندرية فيشتريها بسعر مشوار. الحراسة الآن داخل SQL نفسه.
-- ----------------------------------------------------------------------------
do $$
declare
  v_class  text := current_setting('tours.test_class', true);
  v_hav    numeric;
  v_before integer;
  v_after  integer;
  v_raised boolean;
  v_hint   text;
  v_msg    text;
  v_ref    text;
begin
  -- (ي-١) الدالة نفسها: القاهرة ← الإسكندرية بين ١٧٥ و١٩٠ كم بالخط المستقيم
  v_hav := public.haversine_km(30.0444, 31.2357, 31.2001, 29.9187);
  if v_hav is null or v_hav < 175 or v_hav > 190 then
    raise exception '(ي-١) haversine_km للقاهرة–الإسكندرية: توقعنا ~١٨٠ كم وحصلنا %', v_hav;
  end if;
  if public.haversine_km(30.0444, 31.2357, 30.0444, 31.2357) <> 0 then
    raise exception '(ي-٢) المسافة بين نقطة ونفسها يجب أن تكون صفراً';
  end if;
  if public.haversine_km(null, 31.2357, 31.2001, 29.9187) is not null then
    raise exception '(ي-٣) إحداثية ناقصة يجب أن تُرجع null لا رقماً';
  end if;

  select count(*) into v_before from public.bookings;

  -- (ي-٤) مسافة مُقلَّصة (١٠٠ كم على مسار مستقيمه ~١٨٠) ← invalid-input
  v_raised := false;
  begin
    select t.reference into v_ref from public.create_booking(
      '{"label": "القاهرة", "lat": 30.0444, "lng": 31.2357}'::jsonb,
      '{"label": "الإسكندرية", "lat": 31.2001, "lng": 29.9187}'::jsonb,
      1, false, 0, 100, 90, 'osrm', v_class, 'full',
      'اختبار آلي', '01000000000', null, null, 'BOOKING_TESTS_FIXTURE'
    ) t;
  exception
    when others then
      v_raised := true;
      get stacked diagnostics v_hint = pg_exception_hint;
      v_msg := sqlerrm;
  end;
  if not v_raised or v_hint is distinct from 'invalid-input' then
    raise exception
      '(ي-٤) ثغرة تسعير: مسافة مُقلَّصة قُبلت وأُنشئ الحجز % (رُفض=% رمز=%)',
      coalesce(v_ref, 'بلا'), v_raised, coalesce(v_hint, 'بلا');
  end if;
  -- الرسالة تميّز الحارس الجديد عن حارس «> 5000 كم» القديم
  if position('المستقيم' in coalesce(v_msg, '')) = 0 then
    raise exception '(ي-٥) الرفض جاء من حارس آخر لا من فحص الخط المستقيم: %', v_msg;
  end if;

  -- (ي-٦) مسافة مضخّمة (٤٠٠٠ كم — دون سقف الـ ٥٠٠٠ القديم) ← invalid-input
  v_raised := false;
  v_msg    := null;
  begin
    select t.reference into v_ref from public.create_booking(
      '{"label": "القاهرة", "lat": 30.0444, "lng": 31.2357}'::jsonb,
      '{"label": "الإسكندرية", "lat": 31.2001, "lng": 29.9187}'::jsonb,
      1, false, 0, 4000, 3000, 'osrm', v_class, 'full',
      'اختبار آلي', '01000000000', null, null, 'BOOKING_TESTS_FIXTURE'
    ) t;
  exception
    when others then
      v_raised := true;
      get stacked diagnostics v_hint = pg_exception_hint;
      v_msg := sqlerrm;
  end;
  if not v_raised or v_hint is distinct from 'invalid-input'
     or position('المستقيم' in coalesce(v_msg, '')) = 0 then
    raise exception '(ي-٦) مسافة مضخّمة ثلاثة أضعاف لم تُرفض (رُفض=% رمز=% رسالة=%)',
      v_raised, coalesce(v_hint, 'بلا'), coalesce(v_msg, 'بلا');
  end if;

  -- (ي-٧) المسافة الواقعية (٢٢٠ كم لمسار مستقيمه ~١٨٠) ما زالت مقبولة،
  --       واللقطة تحفظ الخط المستقيم للتدقيق اللاحق
  select t.reference into v_ref from public.create_booking(
    '{"label": "القاهرة", "lat": 30.0444, "lng": 31.2357}'::jsonb,
    '{"label": "الإسكندرية", "lat": 31.2001, "lng": 29.9187}'::jsonb,
    1, false, 0, 220, 180, 'osrm', v_class, 'full',
    'اختبار آلي', '01000000000', null, null, 'BOOKING_TESTS_FIXTURE'
  ) t;
  if v_ref is null then
    raise exception '(ي-٧) مسافة واقعية رُفضت — الحارس أضيق مما ينبغي';
  end if;
  if not exists (
    select 1 from public.bookings b
    where b.reference = v_ref and (b.trip ->> 'straightKm')::numeric > 0
  ) then
    raise exception '(ي-٨) لقطة الرحلة لا تحفظ straightKm للتدقيق';
  end if;

  -- (ي-٩) المحاولتان المرفوضتان لم تخلّفا صفاً (الناجحة وحدها زادت العدد)
  select count(*) into v_after from public.bookings;
  if v_after <> v_before + 1 then
    raise exception '(ي-٩) عدد الحجوزات: توقعنا % وحصلنا %', v_before + 1, v_after;
  end if;

  raise notice '✔ (ي) د١: المسافة المُقلَّصة والمضخّمة مرفوضتان، والواقعية تمر';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ك) د٢ — قيمة الإيصال تُثبَّت من الحجز لا من المستدعي
--
-- «كم حوّلت» لم يعد إقراراً من المتصفح: إقرار ضخم يستهلك سعة حساب الاستقبال
-- ويُخفيه عن بقية العملاء، وإقرار ضئيل يُفسد المطابقة المحاسبية.
-- ----------------------------------------------------------------------------
do $$
declare
  v_class  text := current_setting('tours.test_class', true);
  v_admin  text := nullif(current_setting('tours.test_admin', true), '');
  v_book   record;
  v_att    record;
  v_amount numeric;
begin
  -- بلا هوية: is_admin() = false، وهي حالة الضيف بالضبط
  perform set_config('request.jwt.claim.sub', '', true);

  select * into v_book from public.create_booking(
    '{"label": "القاهرة", "lat": 30.0444, "lng": 31.2357}'::jsonb,
    '{"label": "الإسكندرية", "lat": 31.2001, "lng": 29.9187}'::jsonb,
    1, false, 0, 220, 180, 'osrm', v_class, 'deposit',
    'اختبار آلي', '01000000000', null, null, 'BOOKING_TESTS_FIXTURE'
  );

  -- (ك-١) مبلغ خرافي من غير مشرف يُتجاهَل ويُثبَّت عند amount_due
  select * into v_att from public.attach_receipt(
    v_book.public_token, v_book.public_token || '/tamper.jpg', null, 999999999
  );
  select p.amount into v_amount from public.payments p where p.id = v_att.payment_id;
  if v_amount <> v_book.amount_due then
    raise exception
      '(ك-١) ثغرة مبلغ: الإيصال سُجّل بـ % بينما المطلوب على الحجز % — المبلغ ما زال يُؤخذ من المستدعي',
      v_amount, v_book.amount_due;
  end if;

  -- (ك-٢) مبلغ ضئيل كذلك يُتجاهَل (الاتجاه الآخر من نفس الثغرة)
  select * into v_book from public.create_booking(
    '{"label": "القاهرة", "lat": 30.0444, "lng": 31.2357}'::jsonb,
    '{"label": "الإسكندرية", "lat": 31.2001, "lng": 29.9187}'::jsonb,
    1, false, 0, 220, 180, 'osrm', v_class, 'deposit',
    'اختبار آلي', '01000000000', null, null, 'BOOKING_TESTS_FIXTURE'
  );
  select * into v_att from public.attach_receipt(
    v_book.public_token, v_book.public_token || '/dust.jpg', null, 1
  );
  select p.amount into v_amount from public.payments p where p.id = v_att.payment_id;
  if v_amount <> v_book.amount_due then
    raise exception '(ك-٢) مبلغ ضئيل (١) سُجّل كما هو: % بدل %', v_amount, v_book.amount_due;
  end if;

  -- (ك-٣) المشرف وحده يستطيع التسوية اليدوية بمبلغ مختلف
  if v_admin is not null then
    select * into v_book from public.create_booking(
      '{"label": "القاهرة", "lat": 30.0444, "lng": 31.2357}'::jsonb,
      '{"label": "الإسكندرية", "lat": 31.2001, "lng": 29.9187}'::jsonb,
      1, false, 0, 220, 180, 'osrm', v_class, 'deposit',
      'اختبار آلي', '01000000000', null, null, 'BOOKING_TESTS_FIXTURE'
    );
    perform set_config('request.jwt.claim.sub', v_admin, true);
    select * into v_att from public.attach_receipt(
      v_book.public_token, v_book.public_token || '/partial.jpg', null, 1
    );
    select p.amount into v_amount from public.payments p where p.id = v_att.payment_id;
    if v_amount <> 1 then
      raise exception '(ك-٣) المشرف لم يستطع تسجيل تحويل جزئي (% بدل ١)', v_amount;
    end if;
    perform set_config('request.jwt.claim.sub', '', true);
  else
    raise notice '  ↳ (ك-٣) تخطٍّ: بلا هوية مشرف';
  end if;

  raise notice '✔ (ك) د٢: قيمة الإيصال من الحجز دائماً، والتسوية اليدوية للمشرف وحده';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ل) د٣ — التخزين يفرض حدوده بنفسه، وشرط الرفع أضيق بكثير
-- ----------------------------------------------------------------------------
do $$
declare
  v_class   text := current_setting('tours.test_class', true);
  v_book    record;
  v_token   text;
  v_limit   bigint;
  v_mimes   text[];
  v_has_col boolean;
  v_can_obj boolean := true;
  v_flood   boolean := false;
  v_i       integer;
begin
  -- (ل-١) حدود الدلو نفسه: ٥ ميغابايت وأربعة أنواع
  select exists (
    select 1 from information_schema.columns c
    where c.table_schema = 'storage' and c.table_name = 'buckets'
      and c.column_name = 'file_size_limit'
  ) into v_has_col;

  if not v_has_col then
    raise notice '  ↳ (ل-١) تخطٍّ: نسخة storage بلا عمود file_size_limit';
  else
    execute 'select b.file_size_limit, b.allowed_mime_types from storage.buckets b where b.id = ''receipts'''
      into v_limit, v_mimes;

    if coalesce(v_limit, 0) <> 5242880 then
      raise exception '(ل-١) حد حجم دلو receipts: توقعنا ٥٢٤٢٨٨٠ بايت وحصلنا %',
        coalesce(v_limit::text, 'بلا حد');
    end if;
    if v_mimes is null
       or not ('image/jpeg' = any (v_mimes) and 'image/png' = any (v_mimes)
               and 'image/webp' = any (v_mimes) and 'application/pdf' = any (v_mimes)) then
      raise exception '(ل-٢) أنواع الملفات المسموحة على الدلو غير مضبوطة (%)', v_mimes;
    end if;
    if 'text/html' = any (v_mimes) or 'application/octet-stream' = any (v_mimes) then
      raise exception '(ل-٣) قائمة الأنواع المسموحة أوسع مما يجب (%)', v_mimes;
    end if;
  end if;

  -- (ل-٤) شرط الرفع: مقطعان بالضبط، التوكن أولاً، امتداد من القائمة
  select * into v_book from public.create_booking(
    '{"label": "القاهرة", "lat": 30.0444, "lng": 31.2357}'::jsonb,
    '{"label": "الإسكندرية", "lat": 31.2001, "lng": 29.9187}'::jsonb,
    1, false, 0, 220, 180, 'osrm', v_class, 'full',
    'اختبار آلي', '01000000000', null, null, 'BOOKING_TESTS_FIXTURE'
  );
  v_token := v_book.public_token;

  if not public.receipt_upload_allowed(v_token || '/receipt.jpg') then
    raise exception '(ل-٤) المسار الصحيح «<token>/<file>.jpg» رُفض';
  end if;
  if not public.receipt_upload_allowed(v_token || '/RECEIPT.PDF') then
    raise exception '(ل-٥) الامتداد بحروف كبيرة رُفض (المقارنة يجب أن تتجاهل الحالة)';
  end if;
  if public.receipt_upload_allowed(v_token || '/sub/receipt.jpg') then
    raise exception '(ل-٦) مسار بثلاثة مقاطع قُبل — سقف المقطعين غير مفروض';
  end if;
  if public.receipt_upload_allowed('anything/' || v_token || '/receipt.jpg') then
    raise exception '(ل-٧) توكن في مقطع غير الأول قُبل — الشرط ما زال متساهلاً';
  end if;
  if public.receipt_upload_allowed(v_token || '/payload.exe') then
    raise exception '(ل-٨) امتداد خارج القائمة قُبل';
  end if;
  if public.receipt_upload_allowed(v_token || '/receipt.jpg.exe') then
    raise exception '(ل-٩) امتداد مزدوج مخادع قُبل';
  end if;
  if public.receipt_upload_allowed(v_token) then
    raise exception '(ل-١٠) مسار بمقطع واحد (بلا اسم ملف) قُبل';
  end if;
  if public.receipt_upload_allowed('') or public.receipt_upload_allowed(null) then
    raise exception '(ل-١١) مسار فارغ أو null قُبل';
  end if;
  if public.receipt_upload_allowed(repeat('f', 48) || '/receipt.jpg') then
    raise exception '(ل-١٢) توكن لا يخص أي حجز قُبل';
  end if;

  -- (ل-١٣) سقف ١٠ ملفات لكل توكن — يحتاج كتابة في storage.objects
  begin
    for v_i in 1 .. 10 loop
      insert into storage.objects (bucket_id, name)
      values ('receipts', v_token || '/f' || v_i || '.jpg');
    end loop;
  exception
    when others then
      v_can_obj := false;
      raise notice '  ↳ (ل-١٣) تخطٍّ: تعذّر إدراج كائنات تجريبية في storage.objects (%)', sqlerrm;
  end;

  if v_can_obj then
    v_flood := public.receipt_upload_allowed(v_token || '/f11.jpg');
  end if;

  -- التنظيف قبل الحكم حتى لا يبقى أثر مهما كانت النتيجة
  begin
    delete from storage.objects o
     where o.bucket_id = 'receipts'
       and left(o.name, length(v_token) + 1) = v_token || '/';
  exception
    when others then
      raise notice '  ↳ تعذّر حذف الكائنات التجريبية (%)', sqlerrm;
  end;

  if v_can_obj and v_flood then
    raise exception '(ل-١٣) سقف العشرة ملفات لكل توكن غير مفروض — الدلو قابل للإغراق';
  end if;

  -- (ل-١٤) سياسة الحذف للضيف موجودة بنفس الشرط (تنظيف الملف اليتيم)
  if not exists (
    select 1 from pg_policies p
    where p.schemaname = 'storage' and p.tablename = 'objects'
      and p.policyname = 'receipts_delete_guest' and p.cmd = 'DELETE'
      and 'anon' = any (p.roles)
  ) then
    raise exception '(ل-١٤) سياسة receipts_delete_guest غائبة — الملف اليتيم يبقى للأبد';
  end if;
  if not exists (
    select 1 from pg_policies p
    where p.schemaname = 'storage' and p.tablename = 'objects'
      and p.policyname = 'receipts_delete_guest'
      and p.qual like '%receipt_upload_allowed%'
  ) then
    raise exception '(ل-١٥) سياسة الحذف لا تستدعي receipt_upload_allowed — الشرط غير مطابق';
  end if;

  -- (ل-١٦) الحجز الذي غادر انتظار الدفع يُغلق مساره فوراً
  perform 1 from public.attach_receipt(v_token, v_token || '/done.jpg', null, null);
  if public.receipt_upload_allowed(v_token || '/more.jpg') then
    raise exception '(ل-١٦) حجز قيد المراجعة ما زال يقبل رفعاً جديداً';
  end if;

  raise notice '✔ (ل) د٣: حدود الدلو مثبّتة، وشرط الرفع مقطعان بامتداد مسموح وسقف عدد';
end;
$$;

-- ----------------------------------------------------------------------------
-- (م) د٤ — طلبات عروض الأسعار: الإدراج المباشر ممنوع، والدالة تتحقق وتقصّ
-- ----------------------------------------------------------------------------
do $$
declare
  v_name     constant text := 'عميل اختبار آلي 0009';
  v_denied   boolean := false;
  v_res      record;
  v_len      integer;
  v_slug     text;
  v_raised   boolean;
  v_hint     text;
  v_skip     boolean := false;
begin
  delete from public.notifications n
   where n.payload ->> 'customerName' = v_name;
  delete from public.quote_requests q where q.customer_name = v_name;

  if not exists (select 1 from pg_roles where rolname = 'anon') then
    raise notice '  ↳ (م-١..٣) تخطٍّ: دور anon غير موجود';
    v_skip := true;
  end if;

  if not v_skip then
    -- (م-١) الإدراج المباشر بهوية الزائر مرفوض فعلياً (لا كتالوجياً فقط)
    begin
      execute 'set local role anon';

      begin
        execute format(
          'insert into public.quote_requests (customer_name, customer_phone, details) '
          'values (%L, %L, %L)', v_name, '01000000000', 'محاولة إدراج مباشر'
        );
      exception
        when insufficient_privilege then v_denied := true;
        when others then v_denied := true;
      end;

      -- (م-٢) والدالة المتحقِّقة تعمل بنفس الهوية وتقصّ التفاصيل عند ٢٠٠٠
      select * into v_res from public.create_quote_request(
        'tours', v_name, '01000000000', repeat('ت', 5000)
      );

      execute 'reset role';
    exception
      when others then
        execute 'reset role';
        raise;
    end;

    if not v_denied then
      raise exception '(م-١) ثغرة: الزائر أدرج صفاً مباشراً في quote_requests';
    end if;

    if v_res.reference is null or v_res.reference !~ '^RQ-[0-9A-Z]{6,}$' then
      raise exception '(م-٢) الدالة لم تُرجع مرجعاً صالحاً للزائر (%)',
        coalesce(v_res.reference, 'بلا');
    end if;

    select length(q.details), q.service_slug into v_len, v_slug
    from public.quote_requests q where q.id = v_res.id;
    if v_len <> 2000 then
      raise exception '(م-٣) قصّ التفاصيل عند ٢٠٠٠ حرف: وجدنا % حرفاً', v_len;
    end if;
    if v_slug <> 'tours' then
      raise exception '(م-٤) الخدمة لم تُحفظ (%)', coalesce(v_slug, 'بلا');
    end if;
  end if;

  -- (م-٥) اسم قصير يُرفض بـ invalid-input
  v_raised := false;
  begin
    perform 1 from public.create_quote_request(null, 'ab', '01000000000', 'تفاصيل');
  exception
    when others then
      v_raised := true;
      get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if not v_raised or v_hint is distinct from 'invalid-input' then
    raise exception '(م-٥) اسم من حرفين قُبل (رُفض=% رمز=%)', v_raised, coalesce(v_hint, 'بلا');
  end if;

  -- (م-٦) هاتف بأرقام أقل من ثمانية يُرفض
  v_raised := false;
  begin
    perform 1 from public.create_quote_request(null, v_name, '0100', 'تفاصيل');
  exception
    when others then
      v_raised := true;
      get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if not v_raised or v_hint is distinct from 'invalid-input' then
    raise exception '(م-٦) هاتف قصير قُبل (رُفض=% رمز=%)', v_raised, coalesce(v_hint, 'بلا');
  end if;

  -- (م-٧) خدمة غير معروفة تُرفض بدل أن تُخزَّن نصاً حراً
  v_raised := false;
  begin
    perform 1 from public.create_quote_request('طائرة-خاصة', v_name, '01000000000', 'تفاصيل');
  exception
    when others then
      v_raised := true;
      get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if not v_raised or v_hint is distinct from 'invalid-input' then
    raise exception '(م-٧) خدمة وهمية قُبلت (رُفض=% رمز=%)', v_raised, coalesce(v_hint, 'بلا');
  end if;

  -- (م-٨) قيود CHECK مرآة للتحقق: حتى الإدراج من SQL Editor محكوم
  v_raised := false;
  begin
    insert into public.quote_requests (customer_name, customer_phone, details)
    values (v_name, '01000000000', repeat('x', 2001));
  exception
    when check_violation then v_raised := true;
    when others then v_raised := false;
  end;
  if not v_raised then
    raise exception '(م-٨) قيد طول التفاصيل غير مفروض على الجدول';
  end if;

  v_raised := false;
  begin
    insert into public.quote_requests (service_slug, customer_name, customer_phone, details)
    values ('خدمة-وهمية', v_name, '01000000000', 'تفاصيل');
  exception
    when check_violation then v_raised := true;
    when others then v_raised := false;
  end;
  if not v_raised then
    raise exception '(م-٩) قيد قائمة الخدمات غير مفروض على الجدول';
  end if;

  v_raised := false;
  begin
    insert into public.quote_requests (customer_name, customer_phone, details)
    values ('ا', '01000000000', 'تفاصيل');
  exception
    when check_violation then v_raised := true;
    when others then v_raised := false;
  end;
  if not v_raised then
    raise exception '(م-١٠) قيد طول الاسم غير مفروض على الجدول';
  end if;

  -- تنظيف صفوف هذا القسم
  delete from public.notifications n
   where n.payload ->> 'customerName' = v_name;
  delete from public.quote_requests q where q.customer_name = v_name;

  raise notice '✔ (م) د٤: الإدراج المباشر ممنوع، والدالة تتحقق وتقصّ، والقيود مرآة لها';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ن) د٥ — حسابات الاستقبال مربوطة بتوكن حجز بانتظار الدفع
-- ----------------------------------------------------------------------------
do $$
declare
  v_class text := current_setting('tours.test_class', true);
  v_acc   uuid := '0e0e0e0e-0e0e-4e0e-8e0e-0e0e0e0e0e0e';
  v_book  record;
  v_n     integer;
  v_all   integer;
begin
  delete from public.ledger_entries le where le.account_id = v_acc;
  delete from public.payment_accounts pa where pa.id = v_acc;
  insert into public.payment_accounts (id, kind, label, handle, holder_name,
                                       opening_balance, daily_cap, monthly_cap, active, sort)
  values (v_acc, 'instapay', 'إنستاباي اختبار آلي', 'FIXTURE-TOKEN-SCOPE', 'اختبار',
          0, null, null, true, 998);

  select * into v_book from public.create_booking(
    '{"label": "القاهرة", "lat": 30.0444, "lng": 31.2357}'::jsonb,
    '{"label": "الإسكندرية", "lat": 31.2001, "lng": 29.9187}'::jsonb,
    1, false, 0, 220, 180, 'osrm', v_class, 'deposit',
    'اختبار آلي', '01000000000', null, null, 'BOOKING_TESTS_FIXTURE'
  );

  -- (ن-١) التوكن الصحيح يرى نفس ما تراه النسخة أحادية الوسيط
  select count(*) into v_n
  from public.available_payment_accounts(v_book.public_token, v_book.amount_due);
  select count(*) into v_all
  from public.available_payment_accounts(v_book.amount_due);
  if v_n <> v_all or v_n < 1 then
    raise exception '(ن-١) بالتوكن % صفاً وبلا توكن % صفاً (والمتوقع تطابقهما وألا يكونا صفراً)',
      v_n, v_all;
  end if;

  -- (ن-٢) توكن مزيف بطول صحيح ← صفر صفوف (لا تعداد للمحافظ)
  select count(*) into v_n
  from public.available_payment_accounts(repeat('f', 48), 0);
  if v_n <> 0 then
    raise exception '(ن-٢) توكن مزيف أرجع % حساباً — أرقام المحافظ قابلة للتعداد', v_n;
  end if;

  -- (ن-٣) توكن قصير/فارغ/null ← صفر صفوف
  select count(*) into v_n from public.available_payment_accounts('garbage', 0);
  if v_n <> 0 then raise exception '(ن-٣) توكن قصير أرجع % حساباً', v_n; end if;
  select count(*) into v_n from public.available_payment_accounts('', 0);
  if v_n <> 0 then raise exception '(ن-٤) توكن فارغ أرجع % حساباً', v_n; end if;
  select count(*) into v_n from public.available_payment_accounts(null::text, 0);
  if v_n <> 0 then raise exception '(ن-٥) توكن null أرجع % حساباً', v_n; end if;

  -- (ن-٦) حجز غادر انتظار الدفع ← توكنه لم يعد يفتح قائمة الحسابات
  perform 1 from public.attach_receipt(
    v_book.public_token, v_book.public_token || '/scope.jpg', null, null
  );
  select count(*) into v_n
  from public.available_payment_accounts(v_book.public_token, v_book.amount_due);
  if v_n <> 0 then
    raise exception '(ن-٦) حجز قيد المراجعة ما زال يفتح قائمة الحسابات (% صفاً)', v_n;
  end if;

  delete from public.ledger_entries le where le.account_id = v_acc;

  delete from public.payment_accounts pa where pa.id = v_acc;

  raise notice '✔ (ن) د٥: قائمة الحسابات لا تُفتح إلا بتوكن حجز بانتظار الدفع';
end;
$$;

-- ----------------------------------------------------------------------------
-- (س) د٩ + د٨ — تفرد (kind, handle) وقنوات الإشعار الافتراضية
-- ----------------------------------------------------------------------------
do $$
declare
  v_a      uuid := '0d0d0d0d-0d0d-4d0d-8d0d-0d0d0d0d0d0d';
  v_b      uuid := '0d0d0d0d-0d0d-4d0d-8d0d-0d0d0d0d0d0e';
  v_raised boolean := false;
  v_value  jsonb;
begin
  -- (س-١) الفهرس موجود وفريد فعلاً
  if not exists (
    select 1
    from pg_index i
    join pg_class c on c.oid = i.indexrelid
    join pg_class t on t.oid = i.indrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'payment_accounts'
      and c.relname = 'payment_accounts_kind_handle_key'
      and i.indisunique
  ) then
    raise exception '(س-١) الفهرس الفريد payment_accounts_kind_handle_key غائب أو غير فريد';
  end if;

  -- (س-٢) وهو مفروض فعلياً لا اسماً على ورق
  delete from public.ledger_entries le where le.account_id in (v_a, v_b);
  delete from public.payment_accounts pa where pa.id in (v_a, v_b);
  insert into public.payment_accounts (id, kind, label, handle, sort)
  values (v_a, 'wallet', 'محفظة تكرار ١', 'FIXTURE-DUP-HANDLE', 997);

  begin
    insert into public.payment_accounts (id, kind, label, handle, sort)
    values (v_b, 'wallet', 'محفظة تكرار ٢', 'FIXTURE-DUP-HANDLE', 997);
  exception
    when unique_violation then v_raised := true;
  end;

  -- (س-٣) النوع المختلف بنفس الرقم مسموح (المحفظة وإنستاباي كيانان مختلفان)
  if not v_raised then
    delete from public.ledger_entries le where le.account_id in (v_a, v_b);
    delete from public.payment_accounts pa where pa.id in (v_a, v_b);
    raise exception '(س-٢) تكرار (kind, handle) قُبل رغم الفهرس';
  end if;

  insert into public.payment_accounts (id, kind, label, handle, sort)
  values (v_b, 'instapay', 'إنستاباي بنفس الرقم', 'FIXTURE-DUP-HANDLE', 997);

  delete from public.ledger_entries le where le.account_id in (v_a, v_b);

  delete from public.payment_accounts pa where pa.id in (v_a, v_b);

  -- (س-٤) قنوات الإشعار: الصف الحي يطابق ما يشحنه lib/site-config.ts
  select s.value into v_value from public.site_settings s where s.key = 'notifications';
  if v_value is null then
    raise exception '(س-٤) مفتاح الإعدادات notifications غير موجود';
  end if;
  if v_value -> 'telegramEnabled' is distinct from 'true'::jsonb
     or v_value -> 'emailEnabled' is distinct from 'true'::jsonb then
    raise exception '(س-٥) قنوات الإشعار الافتراضية ليست true/true: %', v_value;
  end if;

  raise notice '✔ (س) د٩ د٨: تفرد (النوع، الرقم) مفروض، وقنوات الإشعار true/true';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ع) التنظيف — إزالة كل ما أنشأه الملف وإعادة الجلسة كما كانت
-- ----------------------------------------------------------------------------
do $$
declare
  v_admin   uuid := nullif(current_setting('tours.test_admin', true), '')::uuid;
  v_fixture text := current_setting('tours.test_admin_fixture', true);
  v_left    integer;
begin
  delete from public.notifications n
   where n.payload ->> 'bookingId' in (
         select b.id::text from public.bookings b
          where b.trip ->> 'notes' = 'BOOKING_TESTS_FIXTURE');
  delete from public.notifications n
   where n.payload ->> 'customerName' = 'عميل اختبار آلي 0009';
  delete from public.quote_requests q
   where q.customer_name = 'عميل اختبار آلي 0009';
  delete from public.bookings b where b.trip ->> 'notes' = 'BOOKING_TESTS_FIXTURE';
  -- قيود الدفتر أولاً: منذ هجرة 0016 صار مفتاح الحساب `on delete restrict` حتى
  -- لا يمحو حذفُ حسابٍ تاريخَه المالي. الاختبار ينظّف قيوده هو، ولا يُضعَّف القيد.
  delete from public.ledger_entries le
   where le.account_id in ('0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f',
                           '0e0e0e0e-0e0e-4e0e-8e0e-0e0e0e0e0e0e',
                           '0d0d0d0d-0d0d-4d0d-8d0d-0d0d0d0d0d0d',
                           '0d0d0d0d-0d0d-4d0d-8d0d-0d0d0d0d0d0e');
  delete from public.payment_accounts pa
   where pa.id in ('0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f',
                   '0e0e0e0e-0e0e-4e0e-8e0e-0e0e0e0e0e0e',
                   '0d0d0d0d-0d0d-4d0d-8d0d-0d0d0d0d0d0d',
                   '0d0d0d0d-0d0d-4d0d-8d0d-0d0d0d0d0d0e');

  if v_fixture = '1' and v_admin is not null then
    delete from auth.users u where u.id = v_admin;
    delete from public.profiles p where p.id = v_admin;
  end if;

  select count(*) into v_left
  from public.bookings b where b.trip ->> 'notes' = 'BOOKING_TESTS_FIXTURE';
  if v_left <> 0 then
    raise exception '(ع) بقيت % من صفوف الاختبار بعد التنظيف', v_left;
  end if;

  perform set_config('tours.test_admin', '', false);
  perform set_config('tours.test_admin_fixture', '', false);
  perform set_config('tours.test_class', '', false);
  perform set_config('tours.test_tamper_pax', '', false);
  perform set_config('request.jwt.claim.sub', '', false);

  raise notice '✔ (ع) التنظيف تم — لا صفوف اختبار متبقية';
end;
$$;

-- ----------------------------------------------------------------------------
-- الخلاصة
-- ----------------------------------------------------------------------------
do $$
begin
  raise notice 'ALL PASSED — كل اختبارات الحجز والدفع والإشعارات نجحت';
end;
$$;

