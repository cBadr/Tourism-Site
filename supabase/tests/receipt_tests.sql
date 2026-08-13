-- ============================================================================
-- receipt_tests.sql — اختبارات قبول لرفع الأدمن للإيصال والتحكم في ظهوره
--                      (الملاحظة ٢ من الدفعة ٢ — هجرة 0027 قسما ق٣ و ق٤)
--
-- كيف تشغّله:
--   node scripts/db-test.mjs receipt
-- النجاح = آخر سطر في الرسائل «ALL PASSED». أي فشل يرمي exception برسالة عربية
-- تحدد الاختبار والقيمة المتوقعة والفعلية.
--
-- ⚠ الملف كله معاملة واحدة على **القاعدة الحية** (مُشغّل الاختبارات يرسله استعلاماً
--   واحداً)، فلا `begin` ولا `commit` في أي مستوى أعلى.
--
-- ⚠ **لا مفتاح عام يُقلَب هنا إطلاقاً.** ق٣ و ق٤ سلوكهما لكل صف: عمودا `payments`
--   والحجب داخل `get_booking_by_token` و`admin_attach_receipt` و
--   `set_receipt_visibility` — لا `trip_settings` ولا `partner_credit_settings`.
--   من يضيف هنا اختباراً يمسّ إعداداً عاماً (كنس الطلبات، سقف الدين) **يلزمه**
--   نمط الكتلة الراجعة الموصوف في handover/CONVENTIONS.md §٨.
--
-- ⚠ **ومع ذلك القسم (ج) كله داخل كتلة راجعة ذاتياً — لسبب آخر:** مساره السعيد
--   يحتاج كائناً حقيقياً في دلو `receipts` (‏`admin_attach_receipt` تتحقق من وجود
--   الملف لا تصدّق المسار)، و**الحذف المباشر من `storage.objects` ممنوع** بمُشغّل
--   Supabase‏ `protect_objects_delete` الذي يرمي «Direct deletion from storage
--   tables is not allowed» ما لم يُرفع العَلَم `storage.allow_delete_query`.
--   ورفع ذلك العَلَم يفتح الحذف على كل الدلو لأي جملة تالية في المعاملة — ثمنٌ لا
--   يستحق التنظيف. فالكتلة الراجعة تُلغي الإدراج أصلاً: لا كائن يُلتزم به، ولا
--   حذف يُطلب. والقسم (و) يتحقق من ذلك عدّاً، فلو نقل أحدٌ الإدراج خارج الكتلة
--   سقط الاختبار بدل أن تتراكم الكائنات بصمت.
--
-- قابل لإعادة التنفيذ بلا حدود:
--   • كل الحجوزات موسومة بـ ADMIN_RECEIPT_FIXTURE داخل لقطة الرحلة، وتُمسح في
--     البداية والنهاية معاً،
--   • وكائنات التخزين تحمل الوسم في **اسم الملف** نفسه فيُعدّها القسم (و).
--
-- معرّفات الـ fixture الثابتة: e1000000-0000-4000-8000-0000000000xx
--
-- المرجع: supabase/migrations/0027_batch_two.sql (ق٣ و ق٤)
--         lib/booking-types.ts (‏PaymentReceiptRow + تواقيع 0027)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (٠) الشروط المسبقة + تنظيف أي بقايا + معطيات التشغيل
-- ----------------------------------------------------------------------------
do $$
declare
  v_missing text;
  v_slug    text;
  v_cap     integer;
begin
  select string_agg(x.sig, '، ')
    into v_missing
  from (values
    ('public.admin_attach_receipt(uuid, numeric, text, text, boolean)'),
    ('public.set_receipt_visibility(uuid, boolean)'),
    ('public.get_booking_by_token(text)'),
    ('public.attach_receipt(text, text, uuid, numeric)'),
    ('public.set_booking_status(uuid, text, text)'),
    ('public.create_booking(jsonb, jsonb, integer, boolean, numeric, numeric, numeric, text, text, text, text, text, text, timestamptz, text, text, timestamptz, integer, jsonb)')
  ) as x(sig)
  where to_regprocedure(x.sig) is null;

  if v_missing is not null then
    raise exception 'شرط مسبق: دوال مفقودة (نفّذ 0027_batch_two.sql أولاً): %', v_missing;
  end if;

  if to_regclass('public.payments') is null or to_regclass('public.bookings') is null then
    raise exception 'شرط مسبق: جداول الحجز والدفع مفقودة';
  end if;

  -- تنظيف البقايا. ولا حذف لكائنات التخزين هنا: المُشغّل protect_objects_delete
  -- يمنعه أصلاً، والملف لا يُلزم بأي كائن (القسم ج داخل كتلة راجعة).
  delete from public.notifications n
   where n.payload ->> 'bookingId' in (
         select b.id::text from public.bookings b
          where b.trip ->> 'notes' = 'ADMIN_RECEIPT_FIXTURE');
  delete from public.ledger_entries le
   where le.booking_id in (
         select b.id from public.bookings b
          where b.trip ->> 'notes' = 'ADMIN_RECEIPT_FIXTURE');
  delete from public.bookings b where b.trip ->> 'notes' = 'ADMIN_RECEIPT_FIXTURE';

  -- أصغر فئة نشطة لها تعريفة — هي فئة الاختبار (مؤهلة دائماً لراكب واحد)
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

  perform set_config('tours.test_class', v_slug, false);
  raise notice '✔ (٠) الشروط المسبقة سليمة — فئة الاختبار «%» بسعة %', v_slug, v_cap;
end;
$$;

-- ----------------------------------------------------------------------------
-- (٠-ب) هوية المشرف — الدالتان الجديدتان محروستان بـ is_admin()
-- نفس نمط booking_tests.sql: مشرف قائم، وإلا مشرف مؤقت يُحذف، وإلا تخطٍّ معلن.
-- ----------------------------------------------------------------------------
do $$
declare
  v_admin uuid;
begin
  perform set_config('tours.test_admin', '', false);
  perform set_config('tours.test_admin_fixture', '0', false);
  perform set_config('request.jwt.claim.sub', '', false);

  select p.id into v_admin from public.profiles p where p.role = 'admin' limit 1;

  if v_admin is null then
    begin
      v_admin := 'e1000000-0000-4000-8000-000000000001'::uuid;
      delete from public.profiles p where p.id = v_admin;
      delete from auth.users u where u.id = v_admin;
      insert into auth.users (id, email) values (v_admin, 'receipt-tests-fixture@local.invalid');
      insert into public.profiles (id, role, full_name)
      values (v_admin, 'admin', 'مشرف اختبار الإيصالات')
      on conflict (id) do update set role = 'admin';
      perform set_config('tours.test_admin_fixture', '1', false);
      raise notice '  ↳ أُنشئ مشرف اختبار مؤقت (سيُحذف في النهاية)';
    exception
      when others then
        v_admin := null;
        raise notice '  ↳ تعذّر إنشاء مشرف مؤقت (%) — ستُتخطّى أقسام اللوحة', sqlerrm;
    end;
  end if;

  if v_admin is not null then
    perform set_config('tours.test_admin', v_admin::text, false);
    raise notice '✔ (٠-ب) هوية المشرف جاهزة';
  else
    raise notice '⚠ (٠-ب) بلا هوية مشرف — أقسام (ج) و(د) ستُتخطّى';
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- (أ) عمودا payments الجديدان — الوجود و not null والافتراضي، وأهم من ذلك:
--     **إدراج لا يذكرهما ينجح**. هذا هو ما يُبقي مسار البوابة (0020) ومسار
--     attach_receipt (0009) حيّين: كلاهما لا يذكر أي عمود جديد في جملة الإدراج.
-- ----------------------------------------------------------------------------
do $$
declare
  v_class   text := current_setting('tours.test_class', true);
  v_book    record;
  v_att     record;
  v_pay     record;
  v_missing text;
begin
  -- (أ-١) الكتالوج: العمودان موجودان، not null، ولهما قيمة افتراضية
  select string_agg(x.col, '، ')
    into v_missing
  from (values ('visible_to_customer'), ('uploaded_by_admin')) as x(col)
  where not exists (
    select 1
    from information_schema.columns c
    where c.table_schema     = 'public'
      and c.table_name       = 'payments'
      and c.column_name      = x.col
      and c.data_type        = 'boolean'
      and c.is_nullable      = 'NO'
      and c.column_default is not null
  );

  if v_missing is not null then
    raise exception
      '(أ-١) أعمدة payments الجديدة مفقودة أو بلا (boolean not null default): %', v_missing;
  end if;

  select * into v_book from public.create_booking(
    '{"label": "القاهرة", "lat": 30.0444, "lng": 31.2357}'::jsonb,
    '{"label": "الإسكندرية", "lat": 31.2001, "lng": 29.9187}'::jsonb,
    1, false, 0, 220, 180, 'osrm', v_class, 'deposit',
    'اختبار إيصال الأدمن', '01000000000', null, null, 'ADMIN_RECEIPT_FIXTURE'
  );

  -- (أ-٢) إدراج خام لا يذكر العمودين إطلاقاً — هذا هو شكل إدراج 0020 حرفياً
  insert into public.payments (booking_id, amount, status)
  values (v_book.id, 1, 'pending')
  returning * into v_pay;

  -- القيمتان تُقرآن من الصف الناتج لا من الكتالوج: الافتراضي الذي **يقع فعلاً**
  if v_pay.visible_to_customer is not true then
    raise exception
      '(أ-٢) افتراضي visible_to_customer: توقعنا true (نص العقد PaymentReceiptRow) وحصلنا %',
      coalesce(v_pay.visible_to_customer::text, 'null');
  end if;
  if v_pay.uploaded_by_admin is not false then
    raise exception
      '(أ-٣) افتراضي uploaded_by_admin: توقعنا false (نص العقد PaymentReceiptRow) وحصلنا %',
      coalesce(v_pay.uploaded_by_admin::text, 'null');
  end if;

  delete from public.payments p where p.id = v_pay.id;

  -- (أ-٤) مسار الضيف القائم (0009) ما زال يعمل بلا ذكر العمودين، وصفّه ظاهر
  --       للعميل وغير مرفوع من الأدمن — أي أن سلوك الصفوف القائمة لم يتغيّر.
  select * into v_att from public.attach_receipt(
    v_book.public_token, v_book.public_token || '/fixture.jpg', null, null
  );
  select * into v_pay from public.payments p where p.id = v_att.payment_id;

  if v_pay.visible_to_customer is not true or v_pay.uploaded_by_admin is not false then
    raise exception
      '(أ-٤) صفّ attach_receipt: توقعنا (ظاهر=true، رفعه الأدمن=false) وحصلنا (% ، %)',
      v_pay.visible_to_customer, v_pay.uploaded_by_admin;
  end if;

  raise notice '✔ (أ) العمودان: not null بافتراضيّ العقد، وإدراجٌ لا يذكرهما ينجح';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ب) 🔒 قلب الملاحظة — get_booking_by_token تُسقط الإيصال المخفي من الحمولة
--
-- الحجب في القاعدة لا في العرض: حامل التوكن يقرأ الحمولة الخام من PostgREST،
-- فإخفاءٌ في JSX ليس إخفاءً. والإسقاط **صفٌّ كامل** لا حقلٌ منه، لأن `note`
-- يحمل ملاحظة المشرف التشغيلية.
-- ----------------------------------------------------------------------------
do $$
declare
  v_class   text := current_setting('tours.test_class', true);
  v_book    record;
  v_row     record;
  v_vis     uuid;
  v_hid     uuid;
  v_n       integer;
  v_elem    jsonb;
  v_key     text;
begin
  select * into v_book from public.create_booking(
    '{"label": "القاهرة", "lat": 30.0444, "lng": 31.2357}'::jsonb,
    '{"label": "الإسكندرية", "lat": 31.2001, "lng": 29.9187}'::jsonb,
    1, false, 0, 220, 180, 'osrm', v_class, 'deposit',
    'اختبار إيصال الأدمن', '01000000000', null, null, 'ADMIN_RECEIPT_FIXTURE'
  );

  -- إيصالان: أحدهما ظاهر والآخر مخفي. الإدراج مباشر عمداً — المُختبَر هنا دالة
  -- التوكن لا مسار الرفع، وحارس «إيصال معلّق واحد» يخصّ admin_attach_receipt.
  -- ويُملأ receipt_path و verified_by حتى يكون مسبار التسريب أدناه ذا معنى.
  insert into public.payments
    (booking_id, amount, status, receipt_path, note, verified_by, verified_at, visible_to_customer)
  values
    (v_book.id, 1, 'pending', 'admin/' || v_book.id || '/ADMIN_RECEIPT_FIXTURE-vis.jpg',
     'إيصال ظاهر', gen_random_uuid(), now(), true)
  returning id into v_vis;

  insert into public.payments
    (booking_id, amount, status, receipt_path, note, visible_to_customer)
  values
    (v_book.id, 2, 'pending', 'admin/' || v_book.id || '/ADMIN_RECEIPT_FIXTURE-hid.jpg',
     'ملاحظة تشغيلية داخلية', false)
  returning id into v_hid;

  select * into v_row from public.get_booking_by_token(v_book.public_token);
  if not found then
    raise exception '(ب-١) دالة التوكن لم ترجع صف الحجز أصلاً';
  end if;

  -- (ب-١) الحمولة مصفوفة بعنصر واحد: الظاهر حاضر والمخفي غائب
  if jsonb_typeof(v_row.payments) <> 'array' then
    raise exception '(ب-١) payments يجب أن تكون مصفوفة (وجدنا %)', jsonb_typeof(v_row.payments);
  end if;

  v_n := jsonb_array_length(v_row.payments);
  if v_n <> 1 then
    raise exception '(ب-٢) عدد الإيصالات الظاهرة: توقعنا ١ (ظاهر واحد ومخفي واحد) وحصلنا % — الحمولة %',
      v_n, v_row.payments;
  end if;

  -- شاهد إيجابي: بلا هذا يصير التأكيد التالي «غياب في مصفوفة فارغة» ولا يثبت شيئاً
  if not exists (
    select 1 from jsonb_array_elements(v_row.payments) e where e.value ->> 'id' = v_vis::text
  ) then
    raise exception '(ب-٣) الإيصال الظاهر % غائب عن الحمولة — الحمولة %', v_vis, v_row.payments;
  end if;

  if exists (
    select 1 from jsonb_array_elements(v_row.payments) e where e.value ->> 'id' = v_hid::text
  ) then
    raise exception '(ب-٤) 🔒 الإيصال المخفي % ظاهر في حمولة العميل — الحجب غير مفروض في القاعدة',
      v_hid;
  end if;

  -- (ب-٥) الشكل: مفاتيح العقد الستة كلها موجودة (‏note منها — سبب الرفض يُقرأ منه)
  select e.value into v_elem
  from jsonb_array_elements(v_row.payments) e
  where e.value ->> 'id' = v_vis::text;

  foreach v_key in array array['id', 'amount', 'status', 'note', 'createdAt', 'verifiedAt'] loop
    if not (v_elem ? v_key) then
      raise exception '(ب-٥) مفتاح «%» مفقود من عنصر الإيصال — العقد PaymentReceiptRow مكسور: %',
        v_key, v_elem;
    end if;
  end loop;

  -- (ب-٦) لا تسريب لمفتاح داخلي. شاهد إيجابي للمسبار أولاً: نفس أسلوب المطابقة
  --       يلتقط مفتاحاً نعلم وجوده يقيناً، وإلا فالمطابقة معطّلة ولا تصدّق ما بعدها.
  if v_row.payments::text not like '%"id"%' then
    raise exception '(ب-٦) مسبار التسريب معطّل: لم يلتقط المفتاح "id" في %', v_row.payments;
  end if;
  if v_row.payments::text like '%receiptPath%'
     or v_row.payments::text like '%receipt_path%'
     or v_row.payments::text like '%accountId%'
     or v_row.payments::text like '%verifiedBy%' then
    raise exception '(ب-٧) بيانات إيصال داخلية مكشوفة للعميل: %', v_row.payments;
  end if;

  -- (ب-٨) كل الإيصالات مخفية ⇒ الحمولة **مصفوفة فارغة** لا null
  --       (‏booking_tests.sql ح-٣ يؤكد jsonb_typeof = array، فكسرُه يُسقط ملفين)
  update public.payments p set visible_to_customer = false where p.booking_id = v_book.id;

  select * into v_row from public.get_booking_by_token(v_book.public_token);
  if jsonb_typeof(v_row.payments) <> 'array' then
    raise exception '(ب-٨) بإخفاء الجميع صارت payments من نوع % بدل array', jsonb_typeof(v_row.payments);
  end if;
  if jsonb_array_length(v_row.payments) <> 0 then
    raise exception '(ب-٩) بإخفاء الجميع: توقعنا مصفوفة فارغة وحصلنا %', v_row.payments;
  end if;

  -- (ب-١٠) والعكس: بإظهار الجميع يعود الاثنان — فالفارق هو العَلَم لا شيء آخر
  update public.payments p set visible_to_customer = true where p.booking_id = v_book.id;

  select * into v_row from public.get_booking_by_token(v_book.public_token);
  v_n := jsonb_array_length(v_row.payments);
  if v_n <> 2 then
    raise exception '(ب-١٠) بإظهار الجميع: توقعنا ٢ وحصلنا % — الفلترة لا تتبع visible_to_customer',
      v_n;
  end if;

  raise notice '✔ (ب) الحجب في القاعدة: المخفي يسقط من الحمولة، والحمولة مصفوفة دائماً';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ج) admin_attach_receipt — الحراسات ثم المسار السعيد
--
-- ⚠ الجسم كله داخل كتلة استثناء تنتهي بـ ROLLBACK_MARKER: كتلة الاستثناء في
--    plpgsql نقطةُ حفظ ضمنية، فرفعُ العلامة في آخرها يُرجع **كل** ما كتبه القسم —
--    ومنه كائنا التخزين اللذان لا يمكن حذفهما بعد الالتزام (انظر ترويسة الملف).
--    وأي تأكيد يفشل يرفع رسالته هو، والمعالج يعيد رفعها لأنها ليست العلامة، فلا
--    يبتلع هذا النمط فشلاً أبداً.
--    ولا `return` داخل الكتلة بحال: يخرج من الدالة قبل بلوغ العلامة ⇒ التزامٌ صامت.
-- ----------------------------------------------------------------------------
do $$
declare
  v_admin    text := nullif(current_setting('tours.test_admin', true), '');
  v_class    text := current_setting('tours.test_class', true);
  v_bk       record;
  v_other    record;
  v_walk     record;
  v_pend     record;
  v_ok       record;
  v_ok2      record;
  v_pay      record;
  v_pid      uuid;
  v_raised   boolean;
  v_hint     text;
  v_status   text;
  v_target   text;
  v_amount   numeric;
  v_path     text;
  v_bad      text;
  v_store_ok boolean := true;
  v_queued   integer;
  v_skipped  integer;
  v_total    integer;
begin
  if v_admin is null then
    raise notice '  ↳ (ج) تخطٍّ: بلا هوية مشرف';
    return;
  end if;

  -- ── بداية الكتلة الراجعة ذاتياً ────────────────────────────────────────────
  begin

  -- (ج-١) بلا هوية مشرف الدالة ترفض قبل أن تلمس أي صف
  perform set_config('request.jwt.claim.sub', '', true);

  select * into v_bk from public.create_booking(
    '{"label": "القاهرة", "lat": 30.0444, "lng": 31.2357}'::jsonb,
    '{"label": "الإسكندرية", "lat": 31.2001, "lng": 29.9187}'::jsonb,
    1, false, 0, 220, 180, 'osrm', v_class, 'deposit',
    'اختبار إيصال الأدمن', '01000000000', null, null, 'ADMIN_RECEIPT_FIXTURE'
  );

  v_raised := false;
  begin
    v_pid := public.admin_attach_receipt(
      v_bk.id, v_bk.amount_due,
      'admin/' || v_bk.id || '/ADMIN_RECEIPT_FIXTURE.jpg', null, true
    );
  exception
    when others then
      v_raised := true;
      get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if not v_raised or v_hint is distinct from 'forbidden' then
    raise exception '(ج-١) غير المشرف رفع إيصالاً! توقعنا رفضاً بـ forbidden (رُفض=% رمز=%)',
      v_raised, coalesce(v_hint, 'بلا');
  end if;
  if exists (select 1 from public.payments p where p.booking_id = v_bk.id) then
    raise exception '(ج-٢) الرفض المفترض ترك صف تحصيل خلفه';
  end if;

  -- من هنا نعمل بهوية المشرف
  perform set_config('request.jwt.claim.sub', v_admin, true);
  if not public.is_admin() then
    raise exception '(ج) تعذّر انتحال هوية المشرف — is_admin() ما زالت false';
  end if;

  -- (ج-٣) حجز غير موجود
  v_raised := false;
  begin
    v_pid := public.admin_attach_receipt(
      'e1000000-0000-4000-8000-0000000000ff'::uuid, 100, 'admin/x/y.jpg', null, true
    );
  exception
    when others then
      v_raised := true;
      get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if not v_raised or v_hint is distinct from 'booking-not-found' then
    raise exception '(ج-٣) حجز وهمي: توقعنا booking-not-found (رُفض=% رمز=%)',
      v_raised, coalesce(v_hint, 'بلا');
  end if;

  -- (ج-٤) الحالات المرفوضة: cancelled و confirmed و assigned و completed
  --       كل حالة تُبلَغ عبر آلة الحالات نفسها (set_booking_status) لا بتحديث خام.
  select * into v_other from public.create_booking(
    '{"label": "القاهرة", "lat": 30.0444, "lng": 31.2357}'::jsonb,
    '{"label": "الإسكندرية", "lat": 31.2001, "lng": 29.9187}'::jsonb,
    1, false, 0, 220, 180, 'osrm', v_class, 'deposit',
    'اختبار إيصال الأدمن', '01000000000', null, null, 'ADMIN_RECEIPT_FIXTURE'
  );
  perform public.set_booking_status(v_other.id, 'cancelled', 'اختبار: حجز ملغى');

  v_raised := false;
  begin
    v_pid := public.admin_attach_receipt(
      v_other.id, 100,
      'admin/' || v_other.id || '/ADMIN_RECEIPT_FIXTURE.jpg', null, true
    );
  exception
    when others then
      v_raised := true;
      get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if not v_raised or v_hint is distinct from 'invalid-status' then
    raise exception '(ج-٤) الحجز الملغى قَبِل إيصالاً! توقعنا invalid-status (رُفض=% رمز=%)',
      v_raised, coalesce(v_hint, 'بلا');
  end if;

  select * into v_walk from public.create_booking(
    '{"label": "القاهرة", "lat": 30.0444, "lng": 31.2357}'::jsonb,
    '{"label": "الإسكندرية", "lat": 31.2001, "lng": 29.9187}'::jsonb,
    1, false, 0, 220, 180, 'osrm', v_class, 'deposit',
    'اختبار إيصال الأدمن', '01000000000', null, null, 'ADMIN_RECEIPT_FIXTURE'
  );
  -- المرور بـ under_review إلزامي في آلة الحالات (0007) — وهي حالة **مقبولة**
  perform public.set_booking_status(v_walk.id, 'under_review', 'اختبار: مرور');

  foreach v_target in array array['confirmed', 'assigned', 'completed'] loop
    perform public.set_booking_status(v_walk.id, v_target, 'اختبار: حالة مرفوضة');

    select b.status into v_status from public.bookings b where b.id = v_walk.id;
    if v_status <> v_target then
      raise exception '(ج-٥) تعذّر بلوغ الحالة «%» (الحالة الآن «%») — الاختبار التالي بلا معنى',
        v_target, v_status;
    end if;

    v_raised := false;
    begin
      v_pid := public.admin_attach_receipt(
        v_walk.id, 100,
        'admin/' || v_walk.id || '/ADMIN_RECEIPT_FIXTURE.jpg', null, true
      );
    exception
      when others then
        v_raised := true;
        get stacked diagnostics v_hint = pg_exception_hint;
    end;
    if not v_raised or v_hint is distinct from 'invalid-status' then
      raise exception '(ج-٥) الحجز في «%» قَبِل إيصالاً! توقعنا invalid-status (رُفض=% رمز=%)',
        v_target, v_raised, coalesce(v_hint, 'بلا');
    end if;
  end loop;

  -- (ج-٦) إيصال معلّق آخر ⇒ رفض بـ receipt-pending
  --       (‏verify_payment تعالج الأحدث المعلّق وحده، فصفٌّ ثانٍ يترك الأول للأبد)
  select * into v_pend from public.create_booking(
    '{"label": "القاهرة", "lat": 30.0444, "lng": 31.2357}'::jsonb,
    '{"label": "الإسكندرية", "lat": 31.2001, "lng": 29.9187}'::jsonb,
    1, false, 0, 220, 180, 'osrm', v_class, 'deposit',
    'اختبار إيصال الأدمن', '01000000000', null, null, 'ADMIN_RECEIPT_FIXTURE'
  );
  insert into public.payments (booking_id, amount, status)
  values (v_pend.id, v_pend.amount_due, 'pending');

  v_raised := false;
  begin
    v_pid := public.admin_attach_receipt(
      v_pend.id, v_pend.amount_due,
      'admin/' || v_pend.id || '/ADMIN_RECEIPT_FIXTURE.jpg', null, true
    );
  exception
    when others then
      v_raised := true;
      get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if not v_raised or v_hint is distinct from 'receipt-pending' then
    raise exception '(ج-٦) رُفع إيصال ثانٍ وأولٌ معلّق! توقعنا receipt-pending (رُفض=% رمز=%)',
      v_raised, coalesce(v_hint, 'بلا');
  end if;

  -- ── حجز نظيف تُجرَّب عليه حراسات القيمة والمسار ثم يُختم بالمسار السعيد ──
  select * into v_ok from public.create_booking(
    '{"label": "القاهرة", "lat": 30.0444, "lng": 31.2357}'::jsonb,
    '{"label": "الإسكندرية", "lat": 31.2001, "lng": 29.9187}'::jsonb,
    1, false, 0, 220, 180, 'osrm', v_class, 'deposit',
    'اختبار إيصال الأدمن', '01000000000', null, null, 'ADMIN_RECEIPT_FIXTURE'
  );
  v_path := 'admin/' || v_ok.id || '/ADMIN_RECEIPT_FIXTURE.jpg';

  -- (ج-٧) قيمة صفر أو سالبة أو null أو ما يُقرَّب إلى صفر ⇒ invalid-input.
  --       المسار المُمرَّر **صحيح البادئة وبلا كائن**، فلو سقط حارس القيمة لعاد
  --       الرمز receipt-missing لا invalid-input — أي أن التأكيد يقيس ما نريده.
  foreach v_amount in array array[0, -5, 0.004, null]::numeric[] loop
    v_raised := false;
    begin
      v_pid := public.admin_attach_receipt(v_ok.id, v_amount, v_path, null, true);
    exception
      when others then
        v_raised := true;
        get stacked diagnostics v_hint = pg_exception_hint;
    end;
    if not v_raised or v_hint is distinct from 'invalid-input' then
      raise exception '(ج-٧) القيمة «%» قُبلت! توقعنا invalid-input (رُفض=% رمز=%)',
        coalesce(v_amount::text, 'null'), v_raised, coalesce(v_hint, 'بلا');
    end if;
  end loop;

  -- (ج-٨) مسار لا يخص هذا الحجز ⇒ invalid-input (فارغ، مسار الضيف، بادئة حجز آخر)
  foreach v_bad in array array[
    '',
    '   ',
    'ADMIN_RECEIPT_FIXTURE.jpg',
    'admin/' || v_other.id || '/ADMIN_RECEIPT_FIXTURE.jpg'
  ] loop
    v_raised := false;
    begin
      v_pid := public.admin_attach_receipt(v_ok.id, v_ok.amount_due, v_bad, null, true);
    exception
      when others then
        v_raised := true;
        get stacked diagnostics v_hint = pg_exception_hint;
    end;
    if not v_raised or v_hint is distinct from 'invalid-input' then
      raise exception '(ج-٨) المسار «%» قُبل! توقعنا invalid-input (رُفض=% رمز=%)',
        v_bad, v_raised, coalesce(v_hint, 'بلا');
    end if;
  end loop;

  -- مسار الضيف (‏<token>/<file>) لا يمرّ من هنا أصلاً — بادئته ليست admin/<id>
  v_raised := false;
  begin
    v_pid := public.admin_attach_receipt(
      v_ok.id, v_ok.amount_due, v_ok.public_token || '/ADMIN_RECEIPT_FIXTURE.jpg', null, true
    );
  exception
    when others then
      v_raised := true;
      get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if not v_raised or v_hint is distinct from 'invalid-input' then
    raise exception '(ج-٩) مسار الضيف قُبل في الرفع الإداري! (رُفض=% رمز=%)',
      v_raised, coalesce(v_hint, 'بلا');
  end if;

  -- مسار null
  v_raised := false;
  begin
    v_pid := public.admin_attach_receipt(v_ok.id, v_ok.amount_due, null, null, true);
  exception
    when others then
      v_raised := true;
      get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if not v_raised or v_hint is distinct from 'invalid-input' then
    raise exception '(ج-١٠) مسار null قُبل! (رُفض=% رمز=%)', v_raised, coalesce(v_hint, 'بلا');
  end if;

  -- (ج-١١) بادئة صحيحة وبلا كائن في الدلو ⇒ receipt-missing
  v_raised := false;
  begin
    v_pid := public.admin_attach_receipt(v_ok.id, v_ok.amount_due, v_path, null, true);
  exception
    when others then
      v_raised := true;
      get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if not v_raised or v_hint is distinct from 'receipt-missing' then
    raise exception '(ج-١١) مسار بلا ملف في الدلو قُبل! توقعنا receipt-missing (رُفض=% رمز=%)',
      v_raised, coalesce(v_hint, 'بلا');
  end if;

  -- كل ما سبق رُفض ⇒ لا صف تحصيل ولا تغيّرت الحالة
  if exists (select 1 from public.payments p where p.booking_id = v_ok.id) then
    raise exception '(ج-١٢) إحدى المحاولات المرفوضة تركت صف تحصيل خلفها';
  end if;
  select b.status into v_status from public.bookings b where b.id = v_ok.id;
  if v_status <> 'pending_payment' then
    raise exception '(ج-١٢) الحالة تغيّرت رغم رفض كل المحاولات (وجدنا %)', v_status;
  end if;

  -- ── المسار السعيد: كائن حقيقي في الدلو ثم رفع ──────────────────────────────
  begin
    insert into storage.objects (bucket_id, name) values ('receipts', v_path);
  exception
    when others then
      v_store_ok := false;
      raise notice '  ↳ (ج-١٣) تخطٍّ: تعذّر إدراج كائن تجريبي في storage.objects (%)', sqlerrm;
  end;

  if not v_store_ok then
    raise notice '⚠ (ج) الحراسات نجحت، والمسار السعيد تُخطّي لتعذّر الكتابة في storage.objects';
  else

  v_pid := public.admin_attach_receipt(
    v_ok.id, v_ok.amount_due, v_path, 'وصل على واتساب', true
  );

  if v_pid is null then
    raise exception '(ج-١٣) الرفع الناجح لم يُرجع معرّف صف التحصيل';
  end if;

  select * into v_pay from public.payments p where p.id = v_pid;
  if not found then
    raise exception '(ج-١٣) المعرّف المُرجَع % لا يقابل صفاً في payments', v_pid;
  end if;
  if v_pay.booking_id <> v_ok.id then
    raise exception '(ج-١٤) صف التحصيل عُلّق على حجز آخر (% بدل %)', v_pay.booking_id, v_ok.id;
  end if;
  if v_pay.status <> 'pending' then
    raise exception '(ج-١٥) حالة الإيصال: توقعنا pending وحصلنا %', v_pay.status;
  end if;
  -- التوقّع مشتق من نفس مُدخل الدالة (‏round(p_amount, 2)) لا من رقم محفور
  if v_pay.amount <> round(v_ok.amount_due, 2) then
    raise exception '(ج-١٦) قيمة الإيصال: توقعنا % وحصلنا %', round(v_ok.amount_due, 2), v_pay.amount;
  end if;
  if v_pay.receipt_path <> v_path then
    raise exception '(ج-١٧) مسار الإيصال: توقعنا «%» وحصلنا «%»', v_path, v_pay.receipt_path;
  end if;
  if v_pay.account_id is not null then
    raise exception '(ج-١٨) حساب الاستقبال يُثبَّت عند الاعتماد لا عند الرفع (وجدنا %)',
      v_pay.account_id;
  end if;
  if v_pay.uploaded_by_admin is not true then
    raise exception '(ج-١٩) uploaded_by_admin: توقعنا true وحصلنا %',
      coalesce(v_pay.uploaded_by_admin::text, 'null');
  end if;
  if v_pay.visible_to_customer is not true then
    raise exception '(ج-٢٠) p_visible = true لم يُحترم (وجدنا %)',
      coalesce(v_pay.visible_to_customer::text, 'null');
  end if;

  -- (ج-٢١) الحجز انتقل من pending_payment إلى under_review
  select b.status into v_status from public.bookings b where b.id = v_ok.id;
  if v_status <> 'under_review' then
    raise exception '(ج-٢١) الحالة بعد الرفع: توقعنا under_review وحصلنا %', v_status;
  end if;

  -- (ج-٢٢) الإشعار الوسيط «رفع العميل إيصالاً» رسالة كاذبة هنا ⇒ يُطفأ.
  --        شاهد إيجابي أولاً: الإشعار وُلّد فعلاً، وإلا صار «لا queued» فراغاً.
  select count(*) filter (where n.status = 'queued'),
         count(*) filter (where n.status = 'skipped'),
         count(*)
    into v_queued, v_skipped, v_total
  from public.notifications n
  where n.event = 'receipt_uploaded'
    and n.payload ->> 'bookingId' = v_ok.id::text;

  if v_total < 1 then
    raise exception '(ج-٢٢) لم يُولَّد إشعار receipt_uploaded أصلاً — تأكيد الإطفاء بلا معنى';
  end if;
  if v_queued <> 0 or v_skipped <> v_total then
    raise exception
      '(ج-٢٢) إشعار receipt_uploaded لم يُطفأ: من % إشعاراً وجدنا % في queued و % في skipped',
      v_total, v_queued, v_skipped;
  end if;

  -- (ج-٢٣) p_visible = null ⇒ الافتراضي الآمن: مخفي عن العميل
  select * into v_ok2 from public.create_booking(
    '{"label": "القاهرة", "lat": 30.0444, "lng": 31.2357}'::jsonb,
    '{"label": "الإسكندرية", "lat": 31.2001, "lng": 29.9187}'::jsonb,
    1, false, 0, 220, 180, 'osrm', v_class, 'deposit',
    'اختبار إيصال الأدمن', '01000000000', null, null, 'ADMIN_RECEIPT_FIXTURE'
  );
  v_path := 'admin/' || v_ok2.id || '/ADMIN_RECEIPT_FIXTURE.jpg';
  insert into storage.objects (bucket_id, name) values ('receipts', v_path);

  v_pid := public.admin_attach_receipt(v_ok2.id, v_ok2.amount_due, v_path, null, null);
  select * into v_pay from public.payments p where p.id = v_pid;
  if v_pay.visible_to_customer is not false then
    raise exception '(ج-٢٣) p_visible = null: توقعنا مخفياً (false) وحصلنا %',
      coalesce(v_pay.visible_to_customer::text, 'null');
  end if;

  -- ونتيجته الظاهرة للعميل: لا شيء
  select * into v_pay from public.get_booking_by_token(v_ok2.public_token);
  if jsonb_array_length(v_pay.payments) <> 0 then
    raise exception '(ج-٢٤) إيصال الأدمن المخفي ظهر للعميل: %', v_pay.payments;
  end if;

  end if;  -- v_store_ok

  -- كل ما سبق يُرجَع الآن: الحجوزات والإيصالات والإشعارات وكائنا التخزين
  raise exception 'ROLLBACK_MARKER';
exception
  when others then
    if sqlerrm <> 'ROLLBACK_MARKER' then raise; end if;
  end;
  -- ── نهاية الكتلة الراجعة ذاتياً ────────────────────────────────────────────

  raise notice '✔ (ج) admin_attach_receipt: الحارس والحالات والتعدد والقيمة والمسار، ثم الرفع وإطفاء الإشعار';
end;
$$;

-- ----------------------------------------------------------------------------
-- (د) set_receipt_visibility — التبديل في الاتجاهين، وأثره في حمولة العميل
-- ----------------------------------------------------------------------------
do $$
declare
  v_admin  text := nullif(current_setting('tours.test_admin', true), '');
  v_class  text := current_setting('tours.test_class', true);
  v_book   record;
  v_row    record;
  v_pid    uuid;
  v_ret    boolean;
  v_db     boolean;
  v_raised boolean;
  v_hint   text;
begin
  if v_admin is null then
    raise notice '  ↳ (د) تخطٍّ: بلا هوية مشرف';
    return;
  end if;

  select * into v_book from public.create_booking(
    '{"label": "القاهرة", "lat": 30.0444, "lng": 31.2357}'::jsonb,
    '{"label": "الإسكندرية", "lat": 31.2001, "lng": 29.9187}'::jsonb,
    1, false, 0, 220, 180, 'osrm', v_class, 'deposit',
    'اختبار إيصال الأدمن', '01000000000', null, null, 'ADMIN_RECEIPT_FIXTURE'
  );

  insert into public.payments (booking_id, amount, status, visible_to_customer)
  values (v_book.id, v_book.amount_due, 'pending', true)
  returning id into v_pid;

  -- (د-١) بلا هوية مشرف ⇒ رفض، والعَلَم لم يتغيّر
  perform set_config('request.jwt.claim.sub', '', true);
  v_raised := false;
  begin
    v_ret := public.set_receipt_visibility(v_pid, false);
  exception
    when others then
      v_raised := true;
      get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if not v_raised or v_hint is distinct from 'forbidden' then
    raise exception '(د-١) غير المشرف غيّر ظهور إيصال! توقعنا forbidden (رُفض=% رمز=%)',
      v_raised, coalesce(v_hint, 'بلا');
  end if;

  select p.visible_to_customer into v_db from public.payments p where p.id = v_pid;
  if v_db is not true then
    raise exception '(د-٢) الرفض غيّر العَلَم فعلاً (صار %)', coalesce(v_db::text, 'null');
  end if;

  perform set_config('request.jwt.claim.sub', v_admin, true);

  -- (د-٣) إخفاء: القيمة المُرجَعة والصف والحمولة الثلاثة متفقة
  v_ret := public.set_receipt_visibility(v_pid, false);
  select p.visible_to_customer into v_db from public.payments p where p.id = v_pid;
  if v_ret is not false or v_db is not false then
    raise exception '(د-٣) الإخفاء: المُرجَع % والصف % — توقعنا false في الاثنين',
      coalesce(v_ret::text, 'null'), coalesce(v_db::text, 'null');
  end if;

  select * into v_row from public.get_booking_by_token(v_book.public_token);
  if jsonb_array_length(v_row.payments) <> 0 then
    raise exception '(د-٤) بعد الإخفاء ما زال الإيصال في حمولة العميل: %', v_row.payments;
  end if;

  -- (د-٥) إظهار: الطريق يعود مفتوحاً — الحجب قابل للتراجع
  v_ret := public.set_receipt_visibility(v_pid, true);
  select p.visible_to_customer into v_db from public.payments p where p.id = v_pid;
  if v_ret is not true or v_db is not true then
    raise exception '(د-٥) الإظهار: المُرجَع % والصف % — توقعنا true في الاثنين',
      coalesce(v_ret::text, 'null'), coalesce(v_db::text, 'null');
  end if;

  select * into v_row from public.get_booking_by_token(v_book.public_token);
  if not exists (
    select 1 from jsonb_array_elements(v_row.payments) e where e.value ->> 'id' = v_pid::text
  ) then
    raise exception '(د-٦) بعد الإظهار لم يعد الإيصال إلى حمولة العميل: %', v_row.payments;
  end if;

  -- (د-٧) p_visible = null ⇒ الافتراضي الآمن (coalesce إلى false)
  v_ret := public.set_receipt_visibility(v_pid, null);
  select p.visible_to_customer into v_db from public.payments p where p.id = v_pid;
  if v_ret is not false or v_db is not false then
    raise exception '(د-٧) p_visible = null: توقعنا false وحصلنا (مُرجَع=% صف=%)',
      coalesce(v_ret::text, 'null'), coalesce(v_db::text, 'null');
  end if;

  -- (د-٨) معرّف لا وجود له ⇒ payment-not-found لا «نجاح» صامت
  v_raised := false;
  begin
    v_ret := public.set_receipt_visibility('e1000000-0000-4000-8000-0000000000fe'::uuid, true);
  exception
    when others then
      v_raised := true;
      get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if not v_raised or v_hint is distinct from 'payment-not-found' then
    raise exception '(د-٨) معرّف وهمي: توقعنا payment-not-found (رُفض=% رمز=%)',
      v_raised, coalesce(v_hint, 'بلا');
  end if;

  raise notice '✔ (د) set_receipt_visibility: تبديل في الاتجاهين ينعكس في حمولة العميل، ومعرّف وهمي يرمي';
end;
$$;

-- ----------------------------------------------------------------------------
-- (هـ) الصلاحيات — الزائر لا ينفّذ أياً من الدالتين، والشاهد الإيجابي أنه ما زال
--      ينفّذ get_booking_by_token (وإلا صار الفحص «الزائر لا ينفّذ شيئاً» بلا معنى)
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    raise notice '  ↳ (هـ) تخطٍّ: دور anon غير موجود (قاعدة ليست Supabase)';
    return;
  end if;

  -- (هـ-١) الشاهد الإيجابي أولاً: مسار المتابعة بالتوكن ما زال مفتوحاً للزائر
  if not has_function_privilege('anon', 'public.get_booking_by_token(text)', 'EXECUTE') then
    raise exception
      '(هـ-١) الزائر فقد get_booking_by_token — صفحة /booking/[token] معطّلة، والفحوص التالية بلا مرجع';
  end if;

  -- (هـ-٢) الرفع الإداري ليس بيد الزائر
  if has_function_privilege(
       'anon', 'public.admin_attach_receipt(uuid, numeric, text, text, boolean)', 'EXECUTE') then
    raise exception '(هـ-٢) 🔒 admin_attach_receipt ممنوحة لـ anon — رفعٌ إداري بيد الزائر';
  end if;

  -- (هـ-٣) ولا كشف الإيصالات المخفية
  if has_function_privilege('anon', 'public.set_receipt_visibility(uuid, boolean)', 'EXECUTE') then
    raise exception '(هـ-٣) 🔒 set_receipt_visibility ممنوحة لـ anon — الزائر يكشف المخفي';
  end if;

  -- (هـ-٤) والمشرف (‏authenticated) ينفّذهما — وإلا صارت اللوحة بلا زر يعمل
  if not has_function_privilege(
       'authenticated', 'public.admin_attach_receipt(uuid, numeric, text, text, boolean)', 'EXECUTE')
     or not has_function_privilege(
       'authenticated', 'public.set_receipt_visibility(uuid, boolean)', 'EXECUTE') then
    raise exception '(هـ-٤) authenticated لا ينفّذ إحدى دالتي 0027 — شاشة اللوحة معطّلة';
  end if;

  raise notice '✔ (هـ) الصلاحيات: الزائر يتابع بالتوكن ولا يرفع ولا يكشف، والمشرف ينفّذ الاثنتين';
end;
$$;

-- ----------------------------------------------------------------------------
-- (و) التنظيف — إزالة كل ما أنشأه الملف وإعادة الجلسة كما كانت
-- ----------------------------------------------------------------------------
do $$
declare
  v_admin   uuid := nullif(current_setting('tours.test_admin', true), '')::uuid;
  v_fixture text := current_setting('tours.test_admin_fixture', true);
  v_left    integer;
  v_objs    integer;
begin
  delete from public.notifications n
   where n.payload ->> 'bookingId' in (
         select b.id::text from public.bookings b
          where b.trip ->> 'notes' = 'ADMIN_RECEIPT_FIXTURE');
  delete from public.ledger_entries le
   where le.booking_id in (
         select b.id from public.bookings b
          where b.trip ->> 'notes' = 'ADMIN_RECEIPT_FIXTURE');
  delete from public.bookings b where b.trip ->> 'notes' = 'ADMIN_RECEIPT_FIXTURE';

  if v_fixture = '1' and v_admin is not null then
    delete from public.profiles p where p.id = v_admin;
    delete from auth.users u where u.id = v_admin;
  end if;

  select count(*) into v_left
  from public.bookings b where b.trip ->> 'notes' = 'ADMIN_RECEIPT_FIXTURE';
  if v_left <> 0 then
    raise exception '(و) بقيت % من حجوزات الاختبار بعد التنظيف', v_left;
  end if;

  -- (و-٢) البرهان على أن الكتلة الراجعة في (ج) رجعت فعلاً: صفر كائن تجريبي.
  -- هذا التأكيد هو الحارس الوحيد على قاعدة «لا إدراج في storage.objects خارج
  -- كتلة راجعة» — لأن الحذف بعد الالتزام ممنوع بمُشغّل protect_objects_delete.
  select count(*) into v_objs
  from storage.objects o
  where o.bucket_id = 'receipts' and o.name like '%ADMIN_RECEIPT_FIXTURE%';
  if v_objs <> 0 then
    raise exception
      '(و-٢) بقي % كائناً تجريبياً في دلو receipts — إدراجٌ وقع خارج الكتلة الراجعة، والحذف المباشر ممنوع',
      v_objs;
  end if;

  perform set_config('tours.test_admin', '', false);
  perform set_config('tours.test_admin_fixture', '', false);
  perform set_config('tours.test_class', '', false);
  perform set_config('request.jwt.claim.sub', '', false);

  raise notice '✔ (و) التنظيف تم — لا حجوزات ولا كائنات اختبار متبقية';
end;
$$;

-- ----------------------------------------------------------------------------
-- الخلاصة
-- ----------------------------------------------------------------------------
do $$
begin
  raise notice 'ALL PASSED — كل اختبارات رفع الأدمن للإيصال والتحكم في ظهوره نجحت';
end;
$$;
