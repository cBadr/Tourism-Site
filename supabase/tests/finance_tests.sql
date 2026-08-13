-- ============================================================================
-- finance_tests.sql — اختبارات قبول للخزينة والدفتر والمقاصة والتدفق النقدي
--                     (المرحلة ٧: هجرة 0015_finance.sql)
--
-- كيف تشغّله: `pnpm db:test finance` أو الصق الملف كاملاً في SQL Editor واضغط Run.
-- النجاح = آخر سطر «ALL PASSED». أي فشل يرمي exception برسالة عربية تحدد
-- الاختبار والقيمة المتوقعة والفعلية.
--
-- ومن psql بدور صاحب القاعدة **لا بد** من ON_ERROR_STOP و‑1 معاً:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f supabase/tests/finance_tests.sql
-- الأول لأن psql بدونه يتابع بعد الكتلة الفاشلة فيطبع «ALL PASSED» رغم الفشل،
-- والثاني لأن الملف يعدّل إعدادات الإسناد مؤقتاً. ومشغّل المشروع
-- (`pnpm db:test finance`) ينفّذ الملف في معاملة واحدة أصلاً فيكفيه.
--
-- ── لماذا لا يلمس هذا الملف بيانات حقيقية ────────────────────────────────────
-- كسرت مرحلةٌ سابقة اختباراتها لأنها استعملت ممر القاهرة–الإسكندرية الحقيقي،
-- فلما غطّاه متعهد فعلي انقلب مصدر التسعير وسقطت الاختبارات. لذلك هنا:
--   • إحداثيات **صحراوية نائية** (٢٥٫٠، ٢٧٫٥) ← (٢٤٫٥، ٢٨٫٢) — لا قائمة أسعار
--     حقيقية تغطيها، فالتسعير بالتعريفة حتماً ولا يتأثر بأي متعهد في القاعدة.
--   • كل الصفوف بمعرّفات ثابتة تبدأ بـ f0/f1/f2 ووسوم FINANCE_TESTS، وتُمسح في
--     بداية الملف ونهايته معاً (فحتى انهيار تشغيل سابق يبدأ التالي من أرض نظيفة).
--   • كل رقم متوقَّع **مُشتق من القاعدة نفسها** (إجمالي الحجز، العربون، الباقي)
--     لا مثبَّت في الكود، فتبقى الاختبارات صحيحة مهما عاير المالك التعريفة.
--   • ما لا يمكن عزله عن البيانات الحقيقية (النقد في اليد، صافي كل المقاصات)
--     يُختبر كـ **متطابقة** بين مصدرين مستقلين لا كرقم ثابت.
--   • قيود الاختبار تُؤرَّخ في نافذة مارس ٢٠١٩ — قبل عمر المشروع كله — فتقارير
--     الفترة تقيس الحجوزات المصنوعة هنا وحدها.
--
-- المرجع: lib/finance-types.ts (العقد) + docs/VISION.md («المالية»)
--         + supabase/migrations/0015_finance.sql.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (٠) الشروط المسبقة + تنظيف بقايا + حفظ الإعدادات
-- ----------------------------------------------------------------------------
do $$
declare
  v_missing text;
  v_classes text[];
  v_acc     uuid[] := array['f0000000-0000-4000-8000-00000000000a'::uuid,
                            'f0000000-0000-4000-8000-00000000000c'::uuid];
  v_sub     uuid   := 'f1000000-0000-4000-8000-00000000000a';
begin
  select string_agg(x.rel, '، ')
    into v_missing
  from (values
    ('public.expense_categories'), ('public.expenses'),
    ('public.partner_payouts'), ('public.ledger_entries'),
    ('public.v_ledger_resolved'), ('public.v_account_balances'),
    ('public.v_booking_profit'), ('public.v_partner_settlements'),
    ('public.payment_accounts'), ('public.bookings'), ('public.dispatches'),
    ('public.subcontractors'), ('public.booking_events')
  ) as x(rel)
  where to_regclass(x.rel) is null;

  if v_missing is not null then
    raise exception 'شرط مسبق: كائنات مفقودة (نفّذ 0015_finance.sql أولاً): %', v_missing;
  end if;

  select string_agg(x.sig, '، ')
    into v_missing
  from (values
    ('public.partner_statement(uuid, date, date)'),
    ('public.cash_flow(date, date, text)'),
    ('public.finance_kpis(date, date)'),
    ('public.record_expense(uuid, uuid, numeric, timestamptz, text, text)'),
    ('public.record_partner_payout(uuid, uuid, numeric, timestamptz, text)'),
    ('public.record_adjustment(uuid, text, numeric, timestamptz, text)'),
    ('public.available_payment_accounts(numeric)'),
    ('public.create_booking(jsonb, jsonb, integer, boolean, numeric, numeric, numeric, text, text, text, text, text, text, timestamptz, text, text)')
  ) as x(sig)
  where to_regprocedure(x.sig) is null;

  if v_missing is not null then
    raise exception 'شرط مسبق: دوال مفقودة: %', v_missing;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'payment_accounts'
      and column_name = 'customer_facing'
  ) then
    raise exception 'شرط مسبق: عمود payment_accounts.customer_facing غير موجود';
  end if;

  -- ── تنظيف بقايا تشغيل سابق ──
  -- القيود العاكسة أولاً (reverses_entry_id بـ on delete restrict)، ثم الأصول،
  -- ثم المصروفات والدفعات (فلا يجد مُشغّل الحذف قيداً يعكسه)، ثم الحجوزات.
  delete from public.ledger_entries e
   where e.reverses_entry_id is not null
     and (e.account_id = any (v_acc)
          or e.subcontractor_id = v_sub
          or e.booking_id in (select b.id from public.bookings b
                               where b.trip ->> 'notes' like 'FINANCE_TESTS_FIXTURE%'));

  delete from public.ledger_entries e
   where e.account_id = any (v_acc)
      or e.subcontractor_id = v_sub
      or e.booking_id in (select b.id from public.bookings b
                           where b.trip ->> 'notes' like 'FINANCE_TESTS_FIXTURE%');

  delete from public.expenses x        where x.account_id = any (v_acc);
  delete from public.partner_payouts p where p.subcontractor_id = v_sub or p.account_id = any (v_acc);

  delete from public.notifications n
   where n.payload ->> 'bookingId' in (
         select b.id::text from public.bookings b
          where b.trip ->> 'notes' like 'FINANCE_TESTS_FIXTURE%');
  delete from public.bookings b where b.trip ->> 'notes' like 'FINANCE_TESTS_FIXTURE%';
  delete from public.subcontractors s where s.company_name like 'FINANCE_TESTS%';
  delete from public.payment_accounts pa where pa.label like 'FINANCE_TESTS%';

  delete from public.profiles p where p.id = 'f2000000-0000-4000-8000-00000000000b'::uuid;
  begin
    delete from auth.users u where u.id = 'f2000000-0000-4000-8000-00000000000b'::uuid;
  exception when others then null;
  end;

  -- الفئة المؤهلة لراكب واحد كما يرجعها المحرك نفسه لا تخميناً منّا
  select array_agg(q.class_slug order by q.capacity asc)
    into v_classes
  from public.quote_price(100, 1, false, 0) q;

  if v_classes is null or array_length(v_classes, 1) < 1 then
    raise exception 'شرط مسبق: لا فئة سيارة نشطة لها تعريفة — نفّذ بذرة 0005';
  end if;

  perform set_config('tours.f_class', v_classes[1], false);

  -- إعدادات الإسناد تُحفظ لتُعاد في التنظيف: نُصفّر أرضية الهامش حتى نتحكم في
  -- مستحق المتعهد بدقة (هو المتغيّر الذي تُقاس عليه المقاصة كلها).
  perform set_config('tours.f_dispatch', (
    select jsonb_build_object(
             'window_minutes', ds.window_minutes, 'max_rounds', ds.max_rounds,
             'auto_start', ds.auto_start, 'min_margin_amount', ds.min_margin_amount
           )::text
    from public.dispatch_settings ds limit 1
  ), false);

  update public.dispatch_settings
     set auto_start = false, min_margin_amount = 0
   where id = true;

  raise notice '✔ (٠) الشروط المسبقة سليمة — فئة الاختبار «%»', v_classes[1];
end;
$$;

-- ----------------------------------------------------------------------------
-- (٠-ب) هوية المشرف — تلزم لمسار verify_payment ولاختبار حراسة الدوال
-- ----------------------------------------------------------------------------
do $$
declare
  v_admin uuid;
begin
  perform set_config('tours.f_admin', '', false);
  perform set_config('tours.f_admin_fixture', '0', false);

  select p.id into v_admin from public.profiles p where p.role = 'admin' limit 1;

  if v_admin is null then
    begin
      v_admin := 'f2000000-0000-4000-8000-0000000000ad'::uuid;
      delete from public.profiles p where p.id = v_admin;
      delete from auth.users u where u.id = v_admin;
      insert into auth.users (id, email) values (v_admin, 'finance-tests-admin@local.invalid');
      insert into public.profiles (id, role, full_name)
      values (v_admin, 'admin', 'مشرف اختبار مؤقت')
      on conflict (id) do update set role = 'admin';
      perform set_config('tours.f_admin_fixture', '1', false);
    exception
      when others then
        v_admin := null;
        raise notice '  ↳ تعذّر إنشاء مشرف مؤقت (%) — سيُستعمل المسار المباشر', sqlerrm;
    end;
  end if;

  if v_admin is not null then
    perform set_config('tours.f_admin', v_admin::text, false);
    raise notice '✔ (٠-ب) هوية المشرف جاهزة';
  else
    raise notice '⚠ (٠-ب) بلا هوية مشرف — أقسام حراسة الدوال ستُتخطّى';
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- (٠-ج) حسابات الخزينة والمتعهد
--
-- محفظة معروضة للعميل (تستقبل التحويلات)، وخزينة نقدية داخلية غير معروضة
-- (منها تُصرف المصروفات ودفعات المقاصة) — وهذا الفصل بالضبط ما تختبره (ي).
-- ----------------------------------------------------------------------------
do $$
declare
  v_w   constant uuid := 'f0000000-0000-4000-8000-00000000000a';
  v_c   constant uuid := 'f0000000-0000-4000-8000-00000000000c';
  v_sub constant uuid := 'f1000000-0000-4000-8000-00000000000a';
begin
  insert into public.payment_accounts
    (id, kind, label, handle, holder_name, opening_balance, active, sort, customer_facing)
  values
    (v_w, 'wallet', 'FINANCE_TESTS محفظة التحصيل', 'FT-01000000000', 'اختبار', 1000, true, 900, true),
    (v_c, 'cash',   'FINANCE_TESTS خزينة نقدية',   'FT-CASH-BOX',    'اختبار',  500, true, 901, false);

  insert into public.subcontractors (id, company_name, phone, email, status)
  values (v_sub, 'FINANCE_TESTS المتعهد', '01000009001', 'finance-p@local.invalid', 'approved');

  perform set_config('tours.f_wallet', v_w::text, false);
  perform set_config('tours.f_cash',   v_c::text, false);
  perform set_config('tours.f_sub',    v_sub::text, false);

  raise notice '✔ (٠-ج) حسابان (محفظة معروضة + نقدية داخلية) ومتعهد معتمد';
end;
$$;

-- ----------------------------------------------------------------------------
-- (أ) السيناريو الكامل للحجز الأول: عربون محصَّل ← إسناد ← اكتمال
--
-- وهو بالضبط الالتواء المحاسبي للنشاط: العميل حوّل العربون إلى محفظتنا، وسلّم
-- الباقي **نقداً للسائق**. فالمتعهد خرج من الرحلة وقد قبض جزءاً من مالنا.
-- ----------------------------------------------------------------------------
do $$
declare
  v_b       record;
  v_pay     uuid;
  v_sub     uuid := current_setting('tours.f_sub')::uuid;
  v_wallet  uuid := current_setting('tours.f_wallet')::uuid;
  v_payout  numeric;
  v_before  numeric;
  v_after   numeric;
  v_n       integer;
begin
  select * into v_b
  from public.create_booking(
    jsonb_build_object('label', 'موقع صحراوي أ', 'lat', 25.000000, 'lng', 27.500000),
    jsonb_build_object('label', 'موقع صحراوي ب', 'lat', 24.500000, 'lng', 28.200000),
    1, false, 0, 100, 90, 'test',
    current_setting('tours.f_class'), 'deposit',
    'عميل اختبار المالية', '01000009100', null, now() + interval '2 days',
    'FINANCE_TESTS_FIXTURE-1'
  );

  if v_b.amount_remaining <= 0 then
    raise exception '(أ) خطة العربون لم تترك باقياً — لا التواء لنختبره (الإجمالي %)', v_b.total;
  end if;

  perform set_config('tours.f_b1',    v_b.id::text, false);
  perform set_config('tours.f_t1',    v_b.total::text, false);
  perform set_config('tours.f_d1',    v_b.amount_due::text, false);
  perform set_config('tours.f_r1',    v_b.amount_remaining::text, false);

  -- (أ-١) العربون: إيصال على المحفظة ← اعتماد ⇒ قيد تحصيل داخل الخزينة.
  -- نعتمده بتحديث مباشر على الجدول عمداً: القيد يجب أن يُكتب من **أي** مسار
  -- كتابة لا من verify_payment وحدها (المسار الرسمي يُختبر في القسم (هـ)).
  insert into public.payments as p (booking_id, account_id, amount, status, receipt_path)
  values (v_b.id, v_wallet, v_b.amount_due, 'pending', 'FINANCE_TESTS/receipt-1.png')
  returning p.id into v_pay;

  update public.bookings b set status = 'under_review' where b.id = v_b.id;
  update public.payments p set status = 'approved', verified_at = now() where p.id = v_pay;
  update public.bookings b set status = 'confirmed' where b.id = v_b.id;

  select count(*) into v_n
  from public.ledger_entries e
  where e.source_type = 'payment' and e.source_id = v_pay;
  if v_n <> 1 then
    raise exception '(أ-١) الإيصال المعتمد ولّد % قيداً — المتوقع قيد واحد', v_n;
  end if;

  -- (أ-٢) الإسناد: مستحق المنفّذ نصف ما سيقبضه نقداً — فالمقاصة تخرج سالبة حتماً
  v_payout := round(v_b.amount_remaining * 0.5, 2);
  perform set_config('tours.f_pay1', v_payout::text, false);

  insert into public.dispatches
    (booking_id, status, round, assigned_subcontractor_id, assigned_at, assigned_payout, manual_assign)
  values (v_b.id, 'assigned', 1, v_sub, now(), v_payout, true);

  update public.bookings b set status = 'assigned' where b.id = v_b.id;

  -- (أ-٣) رصيد الخزينة قبل الاكتمال وبعده — يجب ألّا يتغيّر بجنيه واحد
  select coalesce(sum(ab.balance), 0) into v_before from public.v_account_balances ab;

  update public.bookings b set status = 'completed' where b.id = v_b.id;

  select coalesce(sum(ab.balance), 0) into v_after from public.v_account_balances ab;

  if v_before is distinct from v_after then
    raise exception
      '(أ-٣) اكتمال الرحلة حرّك الخزينة من % إلى % — والمستحق التزام لا نقد',
      v_before, v_after;
  end if;

  raise notice '✔ (أ) حجز بإجمالي % وعربون % وباقٍ % ومستحق متعهد % — والخزينة لم تتحرك بالاكتمال',
    v_b.total, v_b.amount_due, v_b.amount_remaining, v_payout;
end;
$$;

-- ----------------------------------------------------------------------------
-- (ب) القيدان التلقائيان للاكتمال — الشكل قبل الرقم
-- ----------------------------------------------------------------------------
do $$
declare
  v_b1  uuid    := current_setting('tours.f_b1')::uuid;
  v_sub uuid    := current_setting('tours.f_sub')::uuid;
  v_pay numeric := current_setting('tours.f_pay1')::numeric;
  v_r1  numeric := current_setting('tours.f_r1')::numeric;
  v_e   record;
  v_n   integer;
begin
  -- (ب-١) مستحق المتعهد: التزام بلا حساب، اتجاه out، مصدر partner_payout
  select * into v_e
  from public.ledger_entries e
  where e.booking_id = v_b1 and e.source_type = 'partner_payout';

  if not found then
    raise exception '(ب-١) لا قيد مستحق للمتعهد بعد اكتمال الرحلة';
  end if;
  if v_e.account_id is not null then
    raise exception '(ب-١) قيد المستحق مربوط بحساب خزينة % — والالتزام ليس نقداً', v_e.account_id;
  end if;
  if v_e.direction <> 'out' or v_e.amount <> v_pay then
    raise exception '(ب-١) قيد المستحق «% %» — المتوقع «out %»', v_e.direction, v_e.amount, v_pay;
  end if;
  if v_e.subcontractor_id is distinct from v_sub then
    raise exception '(ب-١) قيد المستحق بلا هوية المتعهد الصحيحة';
  end if;
  if v_e.settlement_role is distinct from 'earned' then
    raise exception '(ب-١) دور القيد في المقاصة «%» — المتوقع earned مخزَّناً لا مستنتَجاً',
      coalesce(v_e.settlement_role, 'بلا');
  end if;

  -- (ب-٢) ما حصّله المتعهد نقداً: بلا حساب أيضاً، اتجاه in، بقيمة الباقي
  select * into v_e
  from public.ledger_entries e
  where e.booking_id = v_b1 and e.source_type = 'partner_collection';

  if not found then
    raise exception '(ب-٢) لا قيد للتحصيل النقدي الذي قبضه المتعهد';
  end if;
  if v_e.account_id is not null then
    raise exception '(ب-٢) التحصيل النقدي مربوط بحساب خزينة — والمال في جيب المتعهد لا عندنا';
  end if;
  if v_e.direction <> 'in' or v_e.amount <> v_r1 then
    raise exception '(ب-٢) قيد التحصيل «% %» — المتوقع «in %»', v_e.direction, v_e.amount, v_r1;
  end if;
  if v_e.settlement_role is distinct from 'collected' then
    raise exception '(ب-٢) دور قيد التحصيل «%» — المتوقع collected',
      coalesce(v_e.settlement_role, 'بلا');
  end if;

  -- (ب-٣) لا قيد ثانٍ لو تكرر مسار الاكتمال (حارس التكرار)
  select count(*) into v_n
  from public.ledger_entries e
  where e.booking_id = v_b1 and e.account_id is null;
  if v_n <> 2 then
    raise exception '(ب-٣) عدد القيود بلا حساب للحجز = % — المتوقع ٢', v_n;
  end if;

  -- (ب-٤) القيد الوحيد ذو الحساب لهذا الحجز هو العربون
  select count(*) into v_n
  from public.ledger_entries e
  where e.booking_id = v_b1 and e.account_id is not null;
  if v_n <> 1 then
    raise exception '(ب-٤) قيود الخزينة للحجز = % — المتوقع واحد (العربون)', v_n;
  end if;

  -- (ب-٥) ولا تستطيع القاعدة نفسها ربط قيد الاستحقاق بحساب خزينة — قيد بنيوي
  declare
    v_raised boolean := false;
    v_wallet uuid := current_setting('tours.f_wallet')::uuid;
  begin
    begin
      update public.ledger_entries e set account_id = v_wallet
       where e.booking_id = v_b1 and e.settlement_role = 'earned';
    exception
      when check_violation then
        v_raised := true;
    end;
    if not v_raised then
      raise exception '(ب-٥) نجح ربط قيد المستحق بحساب خزينة — الالتزام صار قادراً على تحريك رصيد';
    end if;
  end;

  raise notice '✔ (ب) قيدا الاكتمال بلا حساب ودورهما مخزَّن، والقاعدة تمنع ربطهما بخزينة';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ج) قاعدة الإشارة — المقاصة تخرج **سالبة** لأن ما قبضه يفوق مستحقه
-- ----------------------------------------------------------------------------
do $$
declare
  v_sub   uuid    := current_setting('tours.f_sub')::uuid;
  v_cash  uuid    := current_setting('tours.f_cash')::uuid;
  v_t1    numeric := current_setting('tours.f_t1')::numeric;
  v_pay1  numeric := current_setting('tours.f_pay1')::numeric;
  v_r1    numeric := current_setting('tours.f_r1')::numeric;
  v_po    numeric;
  v_s     record;
  v_rec   record;
begin
  v_po := round(v_t1 * 0.10, 2);
  perform set_config('tours.f_po', v_po::text, false);

  -- 0027 غيّر القاعدة هنا بقرار صريح من المالك: **لا نَدفع لمتعهد بينما لنا عنده
  -- مال**. وهذا المتعهد مدين لنا بالضبط (وهو ما تثبته هذه الفقرة أصلاً)، فالدفع
  -- إليه صار مقدَّماً يحتاج قراراً بشرياً مكتوباً. نثبّت الرفض أولاً ثم نمرّ من
  -- الباب الصريح — فيبقى ما تثبته الفقرة كما هو: القيد ودوره وحسابه والإشارة.
  declare
    v_hint text := '';
  begin
    begin
      perform public.record_partner_payout(v_sub, v_cash, v_po, now(), 'FINANCE_TESTS دفعة مقاصة');
    exception
      when others then
        get stacked diagnostics v_hint = pg_exception_hint;
    end;

    -- الرمز لا مجرد «وقع استثناء»: لولاه لمرّ الفحص لو غابت الدالة أصلاً
    if coalesce(v_hint, '') <> 'partner-owing' then
      raise exception '(ج-٠أ) الدفع لمتعهد مدين لنا لم يُرفض بـ partner-owing — الرمز الفعلي «%»',
        coalesce(nullif(v_hint, ''), 'بلا استثناء');
    end if;
  end;

  select * into v_rec
  from public.record_partner_payout_advance(
         v_sub, v_cash, v_po, now(),
         'FINANCE_TESTS دفعة مقاصة — مقدَّم صريح لمتعهد رصيده سالب'
       );

  if v_rec.entry_id is null then
    raise exception '(ج) record_partner_payout لم تولّد قيداً في الدفتر';
  end if;

  -- الدفعة نقد فعلي: دورها paid ولها حساب خزينة — والتمييز مخزَّن لا مستنتَج،
  -- فحذف حساب لاحقاً لا يقلبها «مستحقاً» ويُفسد مقاصة شهور مضت.
  declare
    v_pe record;
  begin
    select * into v_pe from public.ledger_entries e where e.id = v_rec.entry_id;
    if v_pe.settlement_role is distinct from 'paid' or v_pe.account_id is null then
      raise exception '(ج-٠) قيد الدفعة: الدور «%» والحساب «%» — المتوقع paid وحساباً حقيقياً',
        coalesce(v_pe.settlement_role, 'بلا'), coalesce(v_pe.account_id::text, 'بلا');
    end if;
  end;

  select * into v_s
  from public.v_partner_settlements ps where ps.subcontractor_id = v_sub;

  if not found then
    raise exception '(ج) المتعهد غائب عن عرض المقاصة رغم وجود مستحق ودفعة';
  end if;

  if v_s.earned <> v_pay1 then
    raise exception '(ج-١) المستحق % — المتوقع %', v_s.earned, v_pay1;
  end if;
  if v_s.collected <> v_r1 then
    raise exception '(ج-٢) المحصَّل نقداً % — المتوقع %', v_s.collected, v_r1;
  end if;
  if v_s.paid <> v_po then
    raise exception '(ج-٣) المدفوع % — المتوقع %', v_s.paid, v_po;
  end if;

  -- المتطابقة الجوهرية للمرحلة
  if v_s.net_due <> v_s.earned - v_s.collected - v_s.paid then
    raise exception '(ج-٤) الصافي % لا يساوي (% − % − %)',
      v_s.net_due, v_s.earned, v_s.collected, v_s.paid;
  end if;

  -- وقاعدة الإشارة: حصّل أكثر من مستحقه ⇒ **هو** المدين لنا
  if v_s.net_due >= 0 then
    raise exception '(ج-٥) الصافي % ليس سالباً رغم أن ما قبضه (%) يفوق مستحقه (%) — النظام يفترض اتجاهاً واحداً',
      v_s.net_due, v_s.collected, v_s.earned;
  end if;

  if v_rec.net_due <> v_s.net_due then
    raise exception '(ج-٦) الصافي من الدالة % والعرض % — مصدران متضاربان',
      v_rec.net_due, v_s.net_due;
  end if;

  if v_s.trips_count <> 1 then
    raise exception '(ج-٧) عدد الرحلات % — المتوقع ١', v_s.trips_count;
  end if;

  raise notice '✔ (ج) الصافي % سالب («عليه لنا») — مستحق % وقبض % ودُفع له %',
    v_s.net_due, v_s.earned, v_s.collected, v_s.paid;
end;
$$;

-- ----------------------------------------------------------------------------
-- (د) المصروف وأرصدة الخزينة — الافتتاحي + الداخل − الخارج
-- ----------------------------------------------------------------------------
do $$
declare
  v_wallet uuid    := current_setting('tours.f_wallet')::uuid;
  v_cash   uuid    := current_setting('tours.f_cash')::uuid;
  v_d1     numeric := current_setting('tours.f_d1')::numeric;
  v_t1     numeric := current_setting('tours.f_t1')::numeric;
  v_po     numeric := current_setting('tours.f_po')::numeric;
  v_exp    numeric;
  v_cat    uuid;
  v_rec    record;
  v_bal    numeric;
begin
  select c.id into v_cat from public.expense_categories c
   where lower(btrim(c.name)) = 'وقود' limit 1;
  if v_cat is null then
    select c.id into v_cat from public.expense_categories c order by c.sort limit 1;
  end if;
  if v_cat is null then
    raise exception '(د) لا فئة مصروفات — بذرة 0015 لم تُنفَّذ';
  end if;

  v_exp := greatest(round(v_t1 * 0.05, 2), 1);
  perform set_config('tours.f_exp', v_exp::text, false);

  select * into v_rec
  from public.record_expense(v_cash, v_cat, v_exp, now(),
                             'FINANCE_TESTS وقود رحلة', 'expenses/FINANCE_TESTS/fuel.png');

  if v_rec.entry_id is null then
    raise exception '(د-١) record_expense لم تولّد قيد صرف';
  end if;

  -- (د-٢) رصيد المحفظة = الافتتاحي + العربون (ولا شيء من الاكتمال)
  select ab.balance into v_bal from public.v_account_balances ab where ab.account_id = v_wallet;
  if v_bal <> 1000 + v_d1 then
    raise exception '(د-٢) رصيد المحفظة % — المتوقع % (١٠٠٠ افتتاحي + % عربون)',
      v_bal, 1000 + v_d1, v_d1;
  end if;

  -- (د-٣) رصيد النقدية = الافتتاحي − المصروف − دفعة المقاصة
  select ab.balance into v_bal from public.v_account_balances ab where ab.account_id = v_cash;
  if v_bal <> 500 - v_exp - v_po then
    raise exception '(د-٣) رصيد النقدية % — المتوقع % (٥٠٠ − % مصروف − % دفعة)',
      v_bal, 500 - v_exp - v_po, v_exp, v_po;
  end if;

  -- والرقم الذي أعادته الدالة هو رصيد الحساب لحظتها (بعد دفعة المقاصة والمصروف)
  if v_rec.balance <> 500 - v_po - v_exp then
    raise exception '(د-٤) الرصيد الذي أعادته record_expense % لا يطابق % لحظة التسجيل',
      v_rec.balance, 500 - v_po - v_exp;
  end if;

  raise notice '✔ (د) الأرصدة تطابق «الافتتاحي + الداخل − الخارج» بالقرش';
end;
$$;

-- ----------------------------------------------------------------------------
-- (هـ) رحلة ثانية بالدفع الكامل — الإشارة تنقلب موجبة
--
-- بلا باقٍ نقدي، فمستحق المتعهد يُضاف بلا تحصيل يقابله ⇒ نصير نحن المدينين.
-- وهذه المرة عبر المسار الرسمي: attach_receipt ثم verify_payment.
-- ----------------------------------------------------------------------------
do $$
declare
  v_b      record;
  v_sub    uuid := current_setting('tours.f_sub')::uuid;
  v_wallet uuid := current_setting('tours.f_wallet')::uuid;
  v_admin  text := nullif(current_setting('tours.f_admin', true), '');
  v_payout numeric;
  v_s      record;
  v_bal    numeric;
  v_d1     numeric := current_setting('tours.f_d1')::numeric;
begin
  select * into v_b
  from public.create_booking(
    jsonb_build_object('label', 'موقع صحراوي أ', 'lat', 25.000000, 'lng', 27.500000),
    jsonb_build_object('label', 'موقع صحراوي ب', 'lat', 24.500000, 'lng', 28.200000),
    1, false, 0, 100, 90, 'test',
    current_setting('tours.f_class'), 'full',
    'عميل اختبار المالية ٢', '01000009200', null, now() + interval '3 days',
    'FINANCE_TESTS_FIXTURE-2'
  );

  perform set_config('tours.f_b3', v_b.id::text, false);
  perform set_config('tours.f_t3', v_b.total::text, false);

  perform public.attach_receipt(v_b.public_token, 'FINANCE_TESTS/receipt-2.png',
                                v_wallet, v_b.amount_due);

  if v_admin is not null then
    perform set_config('request.jwt.claim.sub', v_admin, false);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', v_admin)::text, false);
    begin
      perform public.verify_payment(v_b.id, true, 'FINANCE_TESTS اعتماد');
    exception
      when others then
        perform set_config('request.jwt.claim.sub', '', false);
        perform set_config('request.jwt.claims', '', false);
        raise;
    end;
    perform set_config('request.jwt.claim.sub', '', false);
    perform set_config('request.jwt.claims', '', false);
  else
    update public.payments p set status = 'approved', verified_at = now()
     where p.booking_id = v_b.id and p.status = 'pending';
    update public.bookings b set status = 'confirmed' where b.id = v_b.id;
  end if;

  if not exists (
    select 1 from public.ledger_entries e
    join public.payments p on p.id = e.source_id
    where e.source_type = 'payment' and p.booking_id = v_b.id
  ) then
    raise exception '(هـ-١) اعتماد التحويل عبر المسار الرسمي لم يكتب قيد تحصيل';
  end if;

  v_payout := round(v_b.total * 0.90, 2);
  perform set_config('tours.f_pay3', v_payout::text, false);

  insert into public.dispatches
    (booking_id, status, round, assigned_subcontractor_id, assigned_at, assigned_payout, manual_assign)
  values (v_b.id, 'assigned', 1, v_sub, now(), v_payout, true);

  update public.bookings b set status = 'assigned'  where b.id = v_b.id;
  update public.bookings b set status = 'completed' where b.id = v_b.id;

  -- بلا باقٍ ⇒ لا قيد تحصيل نقدي لهذه الرحلة
  if exists (
    select 1 from public.ledger_entries e
    where e.booking_id = v_b.id and e.source_type = 'partner_collection'
  ) then
    raise exception '(هـ-٢) رحلة مدفوعة بالكامل ولّدت قيد تحصيل نقدي للمتعهد';
  end if;

  select * into v_s from public.v_partner_settlements ps where ps.subcontractor_id = v_sub;

  if v_s.net_due <> v_s.earned - v_s.collected - v_s.paid then
    raise exception '(هـ-٣) الصافي % لا يساوي (% − % − %)',
      v_s.net_due, v_s.earned, v_s.collected, v_s.paid;
  end if;
  if v_s.net_due <= 0 then
    raise exception '(هـ-٤) الصافي % لم ينقلب موجباً بعد رحلة بلا تحصيل نقدي', v_s.net_due;
  end if;
  if v_s.trips_count <> 2 then
    raise exception '(هـ-٥) عدد الرحلات % — المتوقع ٢', v_s.trips_count;
  end if;

  select ab.balance into v_bal from public.v_account_balances ab where ab.account_id = v_wallet;
  if v_bal <> 1000 + v_d1 + v_b.total then
    raise exception '(هـ-٦) رصيد المحفظة % — المتوقع %', v_bal, 1000 + v_d1 + v_b.total;
  end if;

  raise notice '✔ (هـ) الصافي انقلب إلى % موجب («له علينا») — الإشارتان تعملان معاً', v_s.net_due;
end;
$$;

-- ----------------------------------------------------------------------------
-- (و) الإلغاء يعكس ولا يحذف
-- ----------------------------------------------------------------------------
do $$
declare
  v_b       record;
  v_wallet  uuid := current_setting('tours.f_wallet')::uuid;
  v_orig    record;
  v_rev     record;
  v_bal_b   numeric;
  v_bal_a   numeric;
  v_n       integer;
  v_raised  boolean := false;
  v_state   text;
begin
  select * into v_b
  from public.create_booking(
    jsonb_build_object('label', 'موقع صحراوي أ', 'lat', 25.000000, 'lng', 27.500000),
    jsonb_build_object('label', 'موقع صحراوي ب', 'lat', 24.500000, 'lng', 28.200000),
    1, false, 0, 100, 90, 'test',
    current_setting('tours.f_class'), 'full',
    'عميل اختبار الإلغاء', '01000009300', null, now() + interval '4 days',
    'FINANCE_TESTS_FIXTURE-3'
  );

  perform set_config('tours.f_b2', v_b.id::text, false);
  perform set_config('tours.f_t2', v_b.total::text, false);

  insert into public.payments (booking_id, account_id, amount, status, receipt_path)
  values (v_b.id, v_wallet, v_b.amount_due, 'pending', 'FINANCE_TESTS/receipt-3.png');

  update public.bookings b set status = 'under_review' where b.id = v_b.id;
  update public.payments p set status = 'approved', verified_at = now()
   where p.booking_id = v_b.id and p.status = 'pending';
  update public.bookings b set status = 'confirmed' where b.id = v_b.id;

  select ab.balance into v_bal_b from public.v_account_balances ab where ab.account_id = v_wallet;

  select * into v_orig
  from public.ledger_entries e where e.booking_id = v_b.id and e.source_type = 'payment';

  update public.bookings b set status = 'cancelled' where b.id = v_b.id;

  -- (و-١) القيد الأصلي **باقٍ** كما هو
  select count(*) into v_n
  from public.ledger_entries e where e.id = v_orig.id and e.amount = v_orig.amount;
  if v_n <> 1 then
    raise exception '(و-١) القيد الأصلي اختفى أو تغيّر مبلغه بعد الإلغاء — الدفتر لا يُمحى';
  end if;

  -- (و-٢) الإلغاء **لا** يعكس تحصيل العميل تلقائياً (هجرة 0016)
  --
  -- المال ما زال في الخزينة فعلاً ما دام لم يُردَّ؛ العكس التلقائي كان يُظهر
  -- الرصيد أقل من الواقع كلما احتُجز العربون. الردّ حدث مستقل يُسجَّل عند
  -- خروج المال حقيقةً عبر `record_refund`.
  if exists (select 1 from public.ledger_entries e where e.reverses_entry_id = v_orig.id) then
    raise exception '(و-٢) الإلغاء عكس تحصيل العميل تلقائياً — الردّ يجب أن يكون قراراً صريحاً';
  end if;

  select ab.balance into v_bal_a from public.v_account_balances ab where ab.account_id = v_wallet;
  if v_bal_a <> v_bal_b then
    raise exception '(و-٢) تغيّر الرصيد بالإلغاء وحده: % ← %', v_bal_b, v_bal_a;
  end if;

  -- ثم يُسجَّل الردّ صراحةً فيخرج المال ويظهر القيد العاكس
  perform public.record_refund(v_b.id, v_wallet, v_orig.amount, now(), 'ردّ العربون بعد الإلغاء');

  select * into v_rev
  from public.ledger_entries e
  where e.booking_id = v_b.id and e.source_type = 'refund'
  order by e.created_at desc limit 1;
  if not found then
    raise exception '(و-٢) تسجيل الردّ لم يولّد قيداً';
  end if;
  if v_rev.direction <> 'out' or v_rev.amount <> v_orig.amount then
    raise exception '(و-٢) القيد العاكس «% %» — المتوقع «out %»',
      v_rev.direction, v_rev.amount, v_orig.amount;
  end if;
  if v_rev.source_type <> 'refund' then
    raise exception '(و-٢) مصدر القيد العاكس «%» — المتوقع refund', v_rev.source_type;
  end if;
  if v_rev.account_id is distinct from v_orig.account_id then
    raise exception '(و-٢) قيد الردّ على حساب مغاير للأصل';
  end if;

  -- (و-٣) وبعد الردّ الفعلي يعود الرصيد كما كان قبل التحصيل
  select ab.balance into v_bal_a from public.v_account_balances ab where ab.account_id = v_wallet;
  if v_bal_a <> v_bal_b - v_orig.amount then
    raise exception '(و-٣) الرصيد بعد الردّ % — المتوقع %', v_bal_a, v_bal_b - v_orig.amount;
  end if;

  -- (و-٤) ولا يُعكس قيدٌ مرتين — الفهرس الفريد الجزئي يمنعه بنيوياً
  begin
    insert into public.ledger_entries
      (account_id, direction, amount, source_type, source_id, booking_id, reverses_entry_id, note)
    values (v_orig.account_id, 'out', v_orig.amount, 'refund', v_orig.source_id,
            v_orig.booking_id, v_orig.id, 'عكس أول');
    insert into public.ledger_entries
      (account_id, direction, amount, source_type, source_id, booking_id, reverses_entry_id, note)
    values (v_orig.account_id, 'out', v_orig.amount, 'refund', v_orig.source_id,
            v_orig.booking_id, v_orig.id, 'محاولة عكس مزدوج');
  exception
    when unique_violation then
      v_raised := true;
    when others then
      get stacked diagnostics v_state = returned_sqlstate;
      raise exception '(و-٤) العكس المزدوج فشل بـ % لا بـ 23505', v_state;
  end;
  if not v_raised then
    raise exception '(و-٤) نجح عكس القيد مرتين — الخزينة تُفرَّغ بردٍّ مكرر';
  end if;

  -- (و-٥) الحجز الملغى لا يظهر في ربحية الفترة (وهو غير مكتمل أصلاً)
  select count(*) into v_n
  from public.v_booking_profit p where p.booking_id = v_b.id and p.status = 'cancelled';
  if v_n <> 1 then
    raise exception '(و-٥) الحجز الملغى غائب عن v_booking_profit';
  end if;

  raise notice '✔ (و) الإلغاء عكس القيد ولم يحذفه، والرصيد عاد، والعكس المزدوج مستحيل';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ز) تأريخ قيود الاختبار في نافذة مارس ٢٠١٩
--
-- لماذا: تقارير الفترة (التدفق النقدي والمؤشرات) تقرأ القاعدة كلها، وفيها بيانات
-- حقيقية. بنقل قيود الاختبار إلى نافذة أسبق من عمر المشروع كله تصير الفترة
-- المفحوصة **مملوكة للاختبار وحده**، فتُقارَن بأرقام محسوبة يدوياً بلا تلوّث.
-- ----------------------------------------------------------------------------
do $$
declare
  v_acc  uuid[] := array[current_setting('tours.f_wallet')::uuid,
                         current_setting('tours.f_cash')::uuid];
  v_sub  uuid   := current_setting('tours.f_sub')::uuid;
  v_bk   uuid[] := array[current_setting('tours.f_b1')::uuid,
                         current_setting('tours.f_b2')::uuid,
                         current_setting('tours.f_b3')::uuid];
begin
  update public.ledger_entries e
     set occurred_at = case
           when e.reverses_entry_id is not null                then timestamptz '2019-03-18 12:00:00+02'
           when e.source_type = 'payment'                      then timestamptz '2019-03-10 12:00:00+02'
           when e.source_type in ('partner_payout', 'partner_collection')
                and e.account_id is null                       then timestamptz '2019-03-12 12:00:00+02'
           when e.source_type = 'expense'                      then timestamptz '2019-03-14 12:00:00+02'
           else                                                     timestamptz '2019-03-16 12:00:00+02'
         end
   where e.account_id = any (v_acc)
      or e.subcontractor_id = v_sub
      or e.booking_id = any (v_bk);

  update public.expenses x
     set occurred_at = timestamptz '2019-03-14 12:00:00+02'
   where x.account_id = any (v_acc);

  update public.partner_payouts p
     set occurred_at = timestamptz '2019-03-16 12:00:00+02'
   where p.subcontractor_id = v_sub;

  update public.booking_events ev
     set created_at = timestamptz '2019-03-12 12:00:00+02'
   where ev.booking_id = any (v_bk) and ev.to_status = 'completed';

  raise notice '✔ (ز) قيود الاختبار مؤرَّخة في مارس ٢٠١٩ — نافذة يملكها الاختبار وحده';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ح) التدفق النقدي — السلال تُجمَّع فتعطي نفس الصافي في الحبيبات الثلاث
-- ----------------------------------------------------------------------------
do $$
declare
  v_d1    numeric := current_setting('tours.f_d1')::numeric;
  v_t2    numeric := current_setting('tours.f_t2')::numeric;
  v_t3    numeric := current_setting('tours.f_t3')::numeric;
  v_exp   numeric := current_setting('tours.f_exp')::numeric;
  v_po    numeric := current_setting('tours.f_po')::numeric;
  v_expect numeric;
  v_in    numeric;
  v_out   numeric;
  v_net   numeric;
  v_last  numeric;
  v_n     integer;
  v_gran  text;
  v_open  numeric;
begin
  -- الصافي المتوقَّع: العربون + الدفعة الكاملة للرحلة الثانية + دفعة الحجز
  -- الملغى ثم ردّها، ناقص المصروف ودفعة المقاصة.
  v_expect := v_d1 + v_t3 + v_t2 - v_t2 - v_exp - v_po;

  foreach v_gran in array array['day', 'week', 'month'] loop
    select coalesce(sum(c.inflow), 0), coalesce(sum(c.outflow), 0),
           coalesce(sum(c.net), 0), count(*)
      into v_in, v_out, v_net, v_n
    from public.cash_flow('2019-03-01', '2019-03-31', v_gran) c;

    if v_n = 0 then
      raise exception '(ح) التدفق النقدي بحبيبة «%» أرجع صفر سلة', v_gran;
    end if;
    if v_net <> v_in - v_out then
      raise exception '(ح) بحبيبة «%»: الصافي % ≠ الداخل % − الخارج %',
        v_gran, v_net, v_in, v_out;
    end if;
    if v_net <> v_expect then
      raise exception '(ح) بحبيبة «%»: مجموع السلال % — المتوقع %', v_gran, v_net, v_expect;
    end if;
    if v_in <> v_d1 + v_t3 + v_t2 then
      raise exception '(ح) بحبيبة «%»: الداخل % — المتوقع %', v_gran, v_in, v_d1 + v_t3 + v_t2;
    end if;
    if v_out <> v_t2 + v_exp + v_po then
      raise exception '(ح) بحبيبة «%»: الخارج % — المتوقع %', v_gran, v_out, v_t2 + v_exp + v_po;
    end if;
  end loop;

  -- الرصيد المتحرك ينتهي عند النقد في اليد فعلياً (افتتاحي الخزينة + صافي الحركة)
  select coalesce(sum(pa.opening_balance), 0) into v_open from public.payment_accounts pa;

  select c.running_balance into v_last
  from public.cash_flow('2019-03-01', '2019-03-31', 'day') c
  order by c.bucket desc limit 1;

  if v_last <> v_open + v_expect then
    raise exception '(ح) آخر رصيد متحرك % — المتوقع % (افتتاحي % + صافي %)',
      v_last, v_open + v_expect, v_open, v_expect;
  end if;

  -- وسلال «اليوم» أكثر من سلة واحدة (وإلا لم نختبر التجميع أصلاً)
  select count(*) into v_n from public.cash_flow('2019-03-01', '2019-03-31', 'day') c;
  if v_n < 3 then
    raise exception '(ح) سلال اليوم % — التوزيع الزمني لم يقع', v_n;
  end if;

  raise notice '✔ (ح) التدفق النقدي: يوم/أسبوع/شهر تعطي نفس الصافي %، والرصيد المتحرك ينتهي عند النقد في اليد',
    v_net;
end;
$$;

-- ----------------------------------------------------------------------------
-- (ط) المؤشرات المالية تطابق الحساب اليدوي
-- ----------------------------------------------------------------------------
do $$
declare
  v_k      record;
  v_t1     numeric := current_setting('tours.f_t1')::numeric;
  v_t3     numeric := current_setting('tours.f_t3')::numeric;
  v_pay1   numeric := current_setting('tours.f_pay1')::numeric;
  v_pay3   numeric := current_setting('tours.f_pay3')::numeric;
  v_exp    numeric := current_setting('tours.f_exp')::numeric;
  v_cash   numeric;
  v_due    numeric;
  v_recv   numeric;
begin
  select * into v_k from public.finance_kpis('2019-03-01', '2019-03-31');

  if v_k.revenue <> v_t1 + v_t3 then
    raise exception '(ط-١) الإيراد % — المتوقع % (% + %)', v_k.revenue, v_t1 + v_t3, v_t1, v_t3;
  end if;
  if v_k.partner_costs <> v_pay1 + v_pay3 then
    raise exception '(ط-٢) تكلفة المتعهدين % — المتوقع %', v_k.partner_costs, v_pay1 + v_pay3;
  end if;
  if v_k.expenses <> v_exp then
    raise exception '(ط-٣) المصروفات % — المتوقع %', v_k.expenses, v_exp;
  end if;
  if v_k.net_profit <> (v_t1 + v_t3) - (v_pay1 + v_pay3) - v_exp then
    raise exception '(ط-٤) صافي الربح % — المتوقع %',
      v_k.net_profit, (v_t1 + v_t3) - (v_pay1 + v_pay3) - v_exp;
  end if;

  -- الأرصدة اللحظية تُقارَن بمصدرها المستقل لا برقم ثابت (القاعدة فيها بيانات حقيقية)
  select coalesce(sum(ab.balance), 0) into v_cash from public.v_account_balances ab;
  if v_k.cash_on_hand <> v_cash then
    raise exception '(ط-٥) النقد في اليد % والعرض يقول % — مصدران متضاربان',
      v_k.cash_on_hand, v_cash;
  end if;

  select coalesce(sum(ps.net_due), 0) into v_due from public.v_partner_settlements ps;
  if v_k.partner_net_due <> v_due then
    raise exception '(ط-٦) صافي المقاصات % والعرض يقول %', v_k.partner_net_due, v_due;
  end if;

  select coalesce(sum(b.amount_remaining), 0) into v_recv
  from public.bookings b
  where b.status in ('confirmed', 'assigned') and b.amount_remaining > 0;
  if v_k.receivables <> v_recv then
    raise exception '(ط-٧) المستحق على العملاء % — المتوقع %', v_k.receivables, v_recv;
  end if;

  -- وربحية الرحلة الأولى مفصّلة: إيراد وتكلفة وما حُصّل منا وما حصّله المتعهد
  declare
    v_p record;
    v_d1 numeric := current_setting('tours.f_d1')::numeric;
    v_r1 numeric := current_setting('tours.f_r1')::numeric;
  begin
    select * into v_p
    from public.v_booking_profit p where p.booking_id = current_setting('tours.f_b1')::uuid;

    if v_p.revenue <> v_t1 or v_p.partner_cost <> v_pay1 then
      raise exception '(ط-٨) ربحية الحجز: إيراد % وتكلفة % — المتوقع % و%',
        v_p.revenue, v_p.partner_cost, v_t1, v_pay1;
    end if;
    if v_p.gross_profit <> v_t1 - v_pay1 then
      raise exception '(ط-٨) الربح الإجمالي % — المتوقع %', v_p.gross_profit, v_t1 - v_pay1;
    end if;
    if v_p.collected_by_us <> v_d1 then
      raise exception '(ط-٩) المحصَّل منا % — المتوقع % (العربون)', v_p.collected_by_us, v_d1;
    end if;
    if v_p.collected_by_partner <> v_r1 then
      raise exception '(ط-٩) ما حصّله المتعهد % — المتوقع %', v_p.collected_by_partner, v_r1;
    end if;
  end;

  raise notice '✔ (ط) المؤشرات: إيراد % وتكلفة % ومصروفات % وصافي ربح %',
    v_k.revenue, v_k.partner_costs, v_k.expenses, v_k.net_profit;
end;
$$;

-- ----------------------------------------------------------------------------
-- (ي) كشف الحساب — زمني، وآخر رصيد فيه هو رقم المقاصة نفسه
-- ----------------------------------------------------------------------------
do $$
declare
  v_sub  uuid := current_setting('tours.f_sub')::uuid;
  v_last numeric;
  v_net  numeric;
  v_n    integer;
  v_bad  integer;
begin
  select count(*) into v_n from public.partner_statement(v_sub, null, null);
  if v_n <> 4 then
    raise exception '(ي-١) سطور الكشف % — المتوقع ٤ (مستحقان وتحصيل ودفعة)', v_n;
  end if;

  -- الترتيب زمني تصاعدي
  select count(*) into v_bad
  from (
    select s.occurred_at,
           lag(s.occurred_at) over (order by s.occurred_at) as prev
    from public.partner_statement(v_sub, null, null) s
  ) x
  where x.prev is not null and x.occurred_at < x.prev;
  if v_bad <> 0 then
    raise exception '(ي-٢) الكشف ليس مرتباً زمنياً (% سطر خارج الترتيب)', v_bad;
  end if;

  -- كل سطر إما مدين أو دائن لا كلاهما ولا صفر
  select count(*) into v_bad
  from public.partner_statement(v_sub, null, null) s
  where (s.debit > 0 and s.credit > 0) or (s.debit = 0 and s.credit = 0);
  if v_bad <> 0 then
    raise exception '(ي-٣) % سطر بلا طرف واحد واضح في الكشف', v_bad;
  end if;

  -- 🔑 آخر رصيد متحرك = صافي المقاصة تماماً
  select s.balance into v_last
  from public.partner_statement(v_sub, null, null) s
  order by s.occurred_at desc, s.balance desc limit 1;

  select ps.net_due into v_net from public.v_partner_settlements ps where ps.subcontractor_id = v_sub;

  if v_last <> v_net then
    raise exception '(ي-٤) آخر رصيد في الكشف % وصافي المقاصة % — الكشف لا يصالح المقاصة',
      v_last, v_net;
  end if;

  -- وأنواع السطور مطابقة للعقد
  select count(*) into v_bad
  from public.partner_statement(v_sub, null, null) s
  where s.kind not in ('trip', 'collection', 'payout', 'adjustment');
  if v_bad <> 0 then
    raise exception '(ي-٥) % سطر بنوع خارج العقد', v_bad;
  end if;

  -- (ي-٦) كشف بفترة تبدأ بعد أول الحركات: الرصيد يبدأ من صافي ما قبلها لا من صفر،
  -- فآخر سطر فيه يبقى مساوياً للمقاصة (كشف حقيقي لا مبتور)
  select s.balance into v_last
  from public.partner_statement(v_sub, '2019-03-15', '2019-03-31') s
  order by s.occurred_at desc, s.balance desc limit 1;

  if v_last is null then
    raise exception '(ي-٦) الكشف المحدود بفترة أرجع صفر سطر رغم وجود دفعة داخلها';
  end if;
  if v_last <> v_net then
    raise exception '(ي-٦) آخر رصيد في كشف الفترة % — المتوقع % (رصيد ما قبل الفترة لم يُرحَّل)',
      v_last, v_net;
  end if;

  raise notice '✔ (ي) الكشف ٤ سطور، زمني، وآخر رصيد % يطابق المقاصة — ومُرحَّل عند تحديد فترة', v_net;
end;
$$;

-- ----------------------------------------------------------------------------
-- (ي-ب) التسوية اليدوية — بسبب مكتوب، وأثر معكوس بتسوية مضادة
-- ----------------------------------------------------------------------------
do $$
declare
  v_cash   uuid := current_setting('tours.f_cash')::uuid;
  v_before numeric;
  v_after  numeric;
  v_rec    record;
  v_raised boolean;
  v_hint   text;
begin
  select ab.balance into v_before from public.v_account_balances ab where ab.account_id = v_cash;

  -- (ي-ب-١) تسوية بلا سبب مكتوب مرفوضة
  v_raised := false;
  begin
    perform public.record_adjustment(v_cash, 'in', 50, now(), '   ');
  exception
    when others then
      v_raised := true;
      get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if not v_raised then
    raise exception '(ي-ب-١) قُبلت تسوية بلا سبب مكتوب — رقم بلا أصل في الدفاتر';
  end if;
  if coalesce(v_hint, '') <> 'note-required' then
    raise exception '(ي-ب-١) رمز الرفض «%» — المتوقع note-required', coalesce(v_hint, 'بلا');
  end if;

  -- (ي-ب-٢) واتجاه غير معروف مرفوض
  v_raised := false;
  begin
    perform public.record_adjustment(v_cash, 'sideways', 50, now(), 'اتجاه خاطئ');
  exception
    when others then v_raised := true;
  end;
  if not v_raised then
    raise exception '(ي-ب-٢) قُبلت تسوية باتجاه خارج (in|out)';
  end if;

  -- (ي-ب-٣) تسوية داخلة ترفع الرصيد، ومضادتها تعيده تماماً
  select * into v_rec
  from public.record_adjustment(v_cash, 'in', 50, now(), 'FINANCE_TESTS فرق جرد');
  if v_rec.balance <> v_before + 50 then
    raise exception '(ي-ب-٣) الرصيد بعد التسوية % — المتوقع %', v_rec.balance, v_before + 50;
  end if;

  select * into v_rec
  from public.record_adjustment(v_cash, 'out', 50, now(), 'FINANCE_TESTS عكس فرق الجرد');

  select ab.balance into v_after from public.v_account_balances ab where ab.account_id = v_cash;
  if v_after <> v_before then
    raise exception '(ي-ب-٣) الرصيد بعد التسويتين % — المتوقع %', v_after, v_before;
  end if;

  -- (ي-ب-٤) والتسويات لا تدخل مقاصة أحد (بلا هوية متعهد)
  if exists (
    select 1 from public.ledger_entries e
    where e.source_type = 'adjustment' and e.note like 'FINANCE_TESTS%'
      and (e.subcontractor_id is not null or e.settlement_role is not null)
  ) then
    raise exception '(ي-ب-٤) تسوية خزينة دخلت مقاصة متعهد';
  end if;

  raise notice '✔ (ي-ب) التسوية تتطلب سبباً، وتحرّك الرصيد، وتُعكس بمضادتها بلا أثر';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ك) الخزينة الداخلية لا تُعرض للعميل عند الدفع
-- ----------------------------------------------------------------------------
do $$
declare
  v_wallet uuid := current_setting('tours.f_wallet')::uuid;
  v_cash   uuid := current_setting('tours.f_cash')::uuid;
  v_seen   boolean;
  v_b2     uuid := current_setting('tours.f_b2')::uuid;
  v_token  text;
begin
  select true into v_seen
  from public.available_payment_accounts(0) a where a.id = v_wallet;
  if not coalesce(v_seen, false) then
    raise exception '(ك-١) المحفظة المعروضة للعميل غائبة عن الحسابات المتاحة';
  end if;

  v_seen := null;
  select true into v_seen
  from public.available_payment_accounts(0) a where a.id = v_cash;
  if coalesce(v_seen, false) then
    raise exception '(ك-٢) خزينة النقدية الداخلية ظهرت للعميل في صفحة التحويل';
  end if;

  -- والتحميل الزائد المربوط بالتوكن ورث الشرط بلا أن يفقد حراسته
  update public.payment_accounts pa set customer_facing = true where pa.id = v_cash;
  select b.public_token into v_token from public.bookings b where b.id = v_b2;
  v_seen := null;
  select true into v_seen
  from public.available_payment_accounts(v_token, 0) a where a.id = v_cash;
  if coalesce(v_seen, false) then
    raise exception '(ك-٣) الحجز الملغى فتح قائمة الحسابات — التوكن لم يعد يحرسها';
  end if;
  update public.payment_accounts pa set customer_facing = false where pa.id = v_cash;

  raise notice '✔ (ك) available_payment_accounts تُظهر المعروض للعميل وحده، وحراسة التوكن سليمة';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ل) العزل — لا anon ولا authenticated يقرأ جنيهاً واحداً
--
-- المال ليس من شأن العميل ولا المتعهد. anon بلا صلاحية أصلاً، والمسجَّل غير
-- المشرف يمر على السياسات فيرى صفر صف — من الجداول **ومن العروض معاً**
-- (وهذا هو فخّ العرض: بلا security_invoker يتجاوز العرض RLS ويكشف كل شيء).
-- ----------------------------------------------------------------------------
do $$
declare
  v_rels text[] := array[
    'public.expense_categories', 'public.expenses',
    'public.partner_payouts', 'public.ledger_entries',
    'public.v_ledger_resolved', 'public.v_account_balances',
    'public.v_booking_profit', 'public.v_partner_settlements'
  ];
  v_sigs text[] := array[
    'public.partner_statement(uuid, date, date)',
    'public.cash_flow(date, date, text)',
    'public.finance_kpis(date, date)',
    'public.record_expense(uuid, uuid, numeric, timestamptz, text, text)',
    'public.record_partner_payout(uuid, uuid, numeric, timestamptz, text)',
    'public.record_adjustment(uuid, text, numeric, timestamptz, text)',
    'public.finance_admin_allowed()'
  ];
  v_rel  text;
  v_sig  text;
  v_priv text;
  v_n    integer;
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    raise notice '  ↳ (ل) لا دور anon على هذه القاعدة — تُتخطّى فحوص الزائر';
  else
    foreach v_rel in array v_rels loop
      foreach v_priv in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'] loop
        if has_table_privilege('anon', v_rel, v_priv) then
          raise exception '(ل-١) ثغرة: anon يملك % على %', v_priv, v_rel;
        end if;
      end loop;
    end loop;

    foreach v_sig in array v_sigs loop
      if has_function_privilege('anon', v_sig, 'EXECUTE') then
        raise exception '(ل-٢) ثغرة: anon يملك EXECUTE على %', v_sig;
      end if;
    end loop;

    select count(*) into v_n
    from pg_policies p
    where p.schemaname = 'public'
      and p.tablename in ('expense_categories', 'expenses', 'partner_payouts', 'ledger_entries')
      and 'anon' = any (p.roles);
    if v_n <> 0 then
      raise exception '(ل-٣) توجد % سياسة تستهدف anon على الجداول المالية', v_n;
    end if;
  end if;

  -- الدفتر مضاف فقط: لا تعديل ولا حذف ولا إدراج مباشر من اللوحة
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    foreach v_priv in array array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'] loop
      if has_table_privilege('authenticated', 'public.ledger_entries', v_priv) then
        raise exception '(ل-٤) الدفتر ليس مضافاً فقط: للمسجَّل صلاحية % عليه', v_priv;
      end if;
    end loop;
  end if;

  raise notice '✔ (ل) لا صلاحية واحدة للزائر على أي كائن مالي، والدفتر مضاف فقط';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ل-ب) والمسجَّل غير المشرف يقرأ صفر صف فعلياً — لا نظرياً
-- ----------------------------------------------------------------------------
do $$
declare
  v_rels text[] := array[
    'public.expense_categories', 'public.expenses',
    'public.partner_payouts', 'public.ledger_entries',
    'public.v_ledger_resolved', 'public.v_account_balances',
    'public.v_booking_profit', 'public.v_partner_settlements'
  ];
  v_rel     text;
  v_n       integer;
  v_partner uuid := 'f2000000-0000-4000-8000-00000000000b';
  v_sub     uuid := current_setting('tours.f_sub')::uuid;
  v_linked  boolean := false;
  v_raised  boolean;
  v_hint    text;
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    raise notice '  ↳ (ل-ب) لا دور authenticated — يُتخطّى';
    return;
  end if;

  -- هوية متعهد حقيقية إن أمكن: أقوى من جلسة مسجَّلة بلا هوية
  begin
    insert into auth.users (id, email) values (v_partner, 'finance-partner@local.invalid');
    insert into public.profiles (id, role, full_name)
    values (v_partner, 'subcontractor', 'متعهد اختبار المالية')
    on conflict (id) do update set role = 'subcontractor';
    update public.subcontractors s set profile_id = v_partner where s.id = v_sub;
    v_linked := true;
  exception
    when others then
      raise notice '  ↳ (ل-ب) تعذّر ربط هوية متعهد (%) — يُفحص المسجَّل بلا هوية', sqlerrm;
  end;

  if v_linked then
    perform set_config('request.jwt.claim.sub', v_partner::text, false);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', v_partner)::text, false);
  end if;

  begin
    execute 'set local role authenticated';

    foreach v_rel in array v_rels loop
      begin
        execute format('select count(*) from %s', v_rel) into v_n;
      exception
        when insufficient_privilege then
          v_n := 0;   -- الحجب بالصلاحية أشد من الحجب بالسياسة: يُقبل
      end;
      if v_n <> 0 then
        execute 'reset role';
        raise exception '(ل-ب) ثغرة: المسجَّل غير المشرف قرأ % صفاً من %', v_n, v_rel;
      end if;
    end loop;

    -- والدوال المالية ترفضه صراحةً
    v_raised := false;
    begin
      perform public.finance_kpis(null, null);
    exception
      when others then
        v_raised := true;
        get stacked diagnostics v_hint = pg_exception_hint;
    end;
    if not v_raised then
      execute 'reset role';
      raise exception '(ل-ب) ثغرة فادحة: المسجَّل غير المشرف قرأ المؤشرات المالية';
    end if;

    v_raised := false;
    begin
      perform public.partner_statement(v_sub, null, null);
    exception
      when others then
        v_raised := true;
    end;
    if not v_raised then
      execute 'reset role';
      raise exception '(ل-ب) ثغرة: المتعهد قرأ كشف حساب عبر partner_statement';
    end if;

    execute 'reset role';
  exception
    when others then
      execute 'reset role';
      perform set_config('request.jwt.claim.sub', '', false);
      perform set_config('request.jwt.claims', '', false);
      raise;
  end;

  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claims', '', false);

  raise notice '✔ (ل-ب) المسجَّل غير المشرف: صفر صف من الجداول الأربعة والعروض الأربعة، والدوال ترفضه';
end;
$$;

-- ----------------------------------------------------------------------------
-- (م) التنظيف — وإعادة الإعدادات كما كانت
-- ----------------------------------------------------------------------------
do $$
declare
  v_dispatch jsonb := nullif(current_setting('tours.f_dispatch', true), '')::jsonb;
  v_acc      uuid[] := array[current_setting('tours.f_wallet')::uuid,
                             current_setting('tours.f_cash')::uuid];
  v_sub      uuid   := current_setting('tours.f_sub')::uuid;
  v_admin    text   := nullif(current_setting('tours.f_admin', true), '');
  v_fixture  text   := current_setting('tours.f_admin_fixture', true);
  v_left     integer;
begin
  if v_dispatch is not null then
    update public.dispatch_settings
       set window_minutes    = (v_dispatch ->> 'window_minutes')::integer,
           max_rounds        = (v_dispatch ->> 'max_rounds')::integer,
           auto_start        = (v_dispatch ->> 'auto_start')::boolean,
           min_margin_amount = (v_dispatch ->> 'min_margin_amount')::numeric
     where id = true;
  end if;

  -- العاكسة أولاً ثم الأصول (reverses_entry_id بـ on delete restrict)، ثم
  -- المصروفات والدفعات فلا يجد مُشغّل الحذف قيداً يعكسه ولا يولّد صفوفاً جديدة.
  delete from public.ledger_entries e
   where e.reverses_entry_id is not null
     and (e.account_id = any (v_acc)
          or e.subcontractor_id = v_sub
          or e.booking_id in (select b.id from public.bookings b
                               where b.trip ->> 'notes' like 'FINANCE_TESTS_FIXTURE%'));

  delete from public.ledger_entries e
   where e.account_id = any (v_acc)
      or e.subcontractor_id = v_sub
      or e.booking_id in (select b.id from public.bookings b
                           where b.trip ->> 'notes' like 'FINANCE_TESTS_FIXTURE%');

  delete from public.expenses x        where x.account_id = any (v_acc);
  delete from public.partner_payouts p where p.subcontractor_id = v_sub or p.account_id = any (v_acc);

  delete from public.notifications n
   where n.payload ->> 'bookingId' in (
         select b.id::text from public.bookings b
          where b.trip ->> 'notes' like 'FINANCE_TESTS_FIXTURE%');
  delete from public.bookings b where b.trip ->> 'notes' like 'FINANCE_TESTS_FIXTURE%';
  delete from public.subcontractors s where s.company_name like 'FINANCE_TESTS%';
  delete from public.payment_accounts pa where pa.label like 'FINANCE_TESTS%';

  delete from public.profiles p where p.id = 'f2000000-0000-4000-8000-00000000000b'::uuid;
  begin
    delete from auth.users u where u.id = 'f2000000-0000-4000-8000-00000000000b'::uuid;
  exception when others then null;
  end;

  if v_fixture = '1' and v_admin is not null then
    delete from public.profiles p where p.id = v_admin::uuid;
    begin
      delete from auth.users u where u.id = v_admin::uuid;
    exception when others then null;
    end;
  end if;

  select count(*) into v_left from public.bookings b
   where b.trip ->> 'notes' like 'FINANCE_TESTS_FIXTURE%';
  if v_left <> 0 then
    raise exception '(م) بقي % حجز اختبار بعد التنظيف', v_left;
  end if;

  select count(*) into v_left from public.payment_accounts pa where pa.label like 'FINANCE_TESTS%';
  if v_left <> 0 then
    raise exception '(م) بقي % حساب خزينة اختبار بعد التنظيف', v_left;
  end if;

  select count(*) into v_left from public.ledger_entries e
   where e.booking_id is null and e.account_id is null and e.subcontractor_id is null
     and e.note like 'FINANCE_TESTS%';
  if v_left <> 0 then
    raise exception '(م) بقي % قيد يتيم بعد التنظيف', v_left;
  end if;

  perform set_config('tours.f_class', '', false);
  perform set_config('tours.f_dispatch', '', false);
  perform set_config('tours.f_wallet', '', false);
  perform set_config('tours.f_cash', '', false);
  perform set_config('tours.f_sub', '', false);
  perform set_config('tours.f_b1', '', false);
  perform set_config('tours.f_b2', '', false);
  perform set_config('tours.f_b3', '', false);
  perform set_config('tours.f_t1', '', false);
  perform set_config('tours.f_t2', '', false);
  perform set_config('tours.f_t3', '', false);
  perform set_config('tours.f_d1', '', false);
  perform set_config('tours.f_r1', '', false);
  perform set_config('tours.f_pay1', '', false);
  perform set_config('tours.f_pay3', '', false);
  perform set_config('tours.f_po', '', false);
  perform set_config('tours.f_exp', '', false);
  perform set_config('tours.f_admin', '', false);
  perform set_config('tours.f_admin_fixture', '', false);
  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claims', '', false);

  raise notice '✔ (م) التنظيف تم — لا صفوف اختبار متبقية والإعدادات كما كانت';
end;
$$;

-- ----------------------------------------------------------------------------
-- الخلاصة
-- ----------------------------------------------------------------------------
do $$
begin
  raise notice 'ALL PASSED — الخزينة والدفتر والمقاصة بإشارتيها والتدفق النقدي والعزل: كلها نجحت';
end;
$$;
