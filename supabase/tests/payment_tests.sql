-- ============================================================================
-- payment_tests.sql — اختبارات قبول لبوابات الدفع الإلكترونية
--                     (المرحلة ٩: هجرة 0020_payments.sql)
--
-- كيف تشغّله: `pnpm db:test payment` أو الصق الملف كاملاً في SQL Editor واضغط Run.
-- النجاح = آخر سطر «ALL PASSED». أي فشل يرمي exception برسالة عربية تحدد
-- الاختبار والقيمة المتوقعة والفعلية.
--
-- ومن psql بدور صاحب القاعدة **لا بد** من ON_ERROR_STOP و‑1 معاً:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f supabase/tests/payment_tests.sql
-- الأول لأن psql بدونه يتابع بعد الكتلة الفاشلة فيطبع «ALL PASSED» رغم الفشل،
-- والثاني لأن الملف يعدّل إعدادات المزوّدين مؤقتاً ويعيدها في التنظيف.
--
-- ── حاجز الإصدار ────────────────────────────────────────────────────────────
-- القسم (د) هو سبب وجود هذا الملف: **الحدث نفسه يُعاد إرساله ثلاث مرات ويبقى
-- صف تحصيل واحد وقيد دفتر واحد.** المزوّدون يعيدون الإرسال عند كل شك (مهلة،
-- خطأ ٥٠٠، إعادة نشر يدوية من لوحتهم)، وأي خلل هنا يعني مضاعفة تحصيل صامتة في
-- دفتر المرحلة ٧. لا تُغلق المرحلة والقسم (د) راسب.
--
-- ── لماذا لا يلمس هذا الملف بيانات حقيقية ────────────────────────────────────
--   • إحداثيات **صحراوية نائية** (٢٥٫٠، ٢٧٫٥) ← (٢٤٫٥، ٢٨٫٢) — لا قائمة أسعار
--     حقيقية تغطيها، فالتسعير بالتعريفة حتماً ولا يتأثر بأي متعهد في القاعدة.
--   • حساب خزينة اختباري خاص بالملف: كل قيود الدفتر المولَّدة هنا تقع عليه
--     وحده، فلا تُخلط بأرصدة حقيقية ولا تحتاج الاختبارات معرفة أرقام سابقة.
--   • إعدادات المزوّدين (التفعيل والحساب) **تُحفظ وتُعاد** في القسم (م) — تشغيل
--     الملف على قاعدة حيّة لا يغيّر ما ضبطه المالك من اللوحة.
--   • كل رقم متوقَّع **مُشتق من القاعدة نفسها** (المستحق على الحجز) لا مثبَّت في
--     الكود، فتبقى الاختبارات صحيحة مهما عاير المالك التعريفة.
--   • الصفوف كلها بوسم PAYMENT_TESTS وتُمسح في البداية والنهاية معاً (فحتى
--     انهيار تشغيل سابق يبدأ التالي من أرض نظيفة).
--
-- المرجع: lib/payments-types.ts (العقد) + supabase/migrations/0020_payments.sql
--         + 0007/0009 (حارس الحالة) + 0015/0016 (الدفتر).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (٠) الشروط المسبقة + تنظيف بقايا تشغيل سابق
-- ----------------------------------------------------------------------------
do $$
declare
  v_missing text;
  v_classes text[];
  v_acc     constant uuid := '9a000000-0000-4000-8000-00000000000a';
begin
  select string_agg(x.rel, '، ')
    into v_missing
  from (values
    ('public.payment_providers'), ('public.payment_intents'), ('public.payment_events'),
    ('public.payments'), ('public.payment_accounts'), ('public.bookings'),
    ('public.ledger_entries'), ('public.v_account_balances')
  ) as x(rel)
  where to_regclass(x.rel) is null;

  if v_missing is not null then
    raise exception 'شرط مسبق: جداول مفقودة: % — نفّذ 0020_payments.sql', v_missing;
  end if;

  select string_agg(x.sig, '، ')
    into v_missing
  from (values
    ('public.create_payment_intent(uuid, text, integer, text)'),
    ('public.attach_intent_ref(uuid, text, text)'),
    ('public.settle_payment_intent(text, text, text, text, integer, jsonb)'),
    ('public.get_payment_intent_status(uuid)'),
    ('public.to_minor_units(numeric)'),
    -- ⚠ 0067: أُلحق `p_flight_number text` بتوقيع create_booking (وأُسقط
    --   التوقيع العشروني صراحةً كما فعلت 0031). هذا السطر **شرط وجود** لا يخصّ
    --   منطق الدفع، وتحديثه هنا وحده يُبقي المجموعة خضراء.
    ('public.create_booking(jsonb, jsonb, integer, boolean, numeric, numeric, numeric, text, text, text, text, text, text, timestamptz, text, text, timestamptz, integer, jsonb, integer, text)'),
    -- تصليب 0025 البند (١): الجسم انتقل إلى دالة داخلية، والغلافان يستدعيانها
    ('public.payment_accounts_within_caps(numeric)'),
    ('public.available_payment_accounts(numeric)'),
    ('public.available_payment_accounts(text, numeric)')
  ) as x(sig)
  where to_regprocedure(x.sig) is null;

  if v_missing is not null then
    raise exception 'شرط مسبق: دوال مفقودة: %', v_missing;
  end if;

  -- ── تنظيف بقايا ──
  -- القيود العاكسة أولاً (reverses_entry_id بـ on delete restrict)، ثم القيود،
  -- ثم الأحداث والجلسات، ثم الحجوزات، ثم الحساب (يمنع حذفَه أيُّ قيد باقٍ).
  delete from public.ledger_entries e
   where e.reverses_entry_id is not null
     and (e.account_id = v_acc
          or e.booking_id in (select b.id from public.bookings b
                               where b.trip ->> 'notes' like 'PAYMENT_TESTS_FIXTURE%'));

  delete from public.ledger_entries e
   where e.account_id = v_acc
      or e.booking_id in (select b.id from public.bookings b
                           where b.trip ->> 'notes' like 'PAYMENT_TESTS_FIXTURE%');

  delete from public.payment_events ev where ev.event_id like 'PT-EVT-%';

  delete from public.payment_intents i
   where i.booking_id in (select b.id from public.bookings b
                           where b.trip ->> 'notes' like 'PAYMENT_TESTS_FIXTURE%');

  delete from public.notifications n
   where n.payload ->> 'bookingId' in (
         select b.id::text from public.bookings b
          where b.trip ->> 'notes' like 'PAYMENT_TESTS_FIXTURE%');

  delete from public.bookings b where b.trip ->> 'notes' like 'PAYMENT_TESTS_FIXTURE%';

  update public.payment_providers pp set account_id = null where pp.account_id = v_acc;
  delete from public.payment_accounts pa where pa.id = v_acc or pa.label like 'PAYMENT_TESTS%';

  -- بقايا هوية المتعهد التي يبنيها القسم (ك) — تشغيلٌ منهار في منتصفه يتركها
  delete from public.subcontractors s where s.company_name like 'PAYMENT_TESTS%';
  delete from public.profiles p where p.id = '9a000000-0000-4000-8000-0000000000c1'::uuid;
  begin
    delete from auth.users u where u.id = '9a000000-0000-4000-8000-0000000000c1'::uuid;
  exception when others then null;
  end;

  -- الفئة المؤهلة لراكب واحد كما يرجعها المحرك نفسه لا تخميناً منّا
  select array_agg(q.class_slug order by q.capacity asc)
    into v_classes
  from public.quote_price(100, 1, false, 0) q;

  if v_classes is null or array_length(v_classes, 1) < 1 then
    raise exception 'شرط مسبق: لا فئة سيارة نشطة لها تعريفة — نفّذ بذرة 0005';
  end if;

  perform set_config('tours.p_class', v_classes[1], false);

  raise notice '✔ (٠) الشروط المسبقة سليمة — فئة الاختبار «%»', v_classes[1];
end;
$$;

-- ----------------------------------------------------------------------------
-- (٠-ب) التجهيزات — حساب خزينة اختباري + ضبط مؤقت لمزوّدَين
--
-- «test» مفعَّل وموجَّه إلى حساب الاختبار (فكل قيد يولّده الملف يقع هناك وحده)،
-- و«stripe» معطَّل قسراً ليُختبر رفض البوابة المعطّلة بلا اعتماد على حالة حيّة.
-- القيمتان الأصليتان تُحفظان في متغيّرات الجلسة وتُعادان في القسم (م).
-- ----------------------------------------------------------------------------
do $$
declare
  v_acc constant uuid := '9a000000-0000-4000-8000-00000000000a';
  v_row record;
begin
  insert into public.payment_accounts
    (id, kind, label, handle, holder_name, opening_balance, active, sort, customer_facing)
  values
    (v_acc, 'card', 'PAYMENT_TESTS بوابة اختبار', 'PT-GATEWAY-01', 'اختبار', 0, true, 950, false);

  select pp.enabled, pp.account_id into v_row
  from public.payment_providers pp where pp.provider = 'test';
  if not found then
    raise exception 'شرط مسبق: المزوّد «test» غير مبذور — أعد تنفيذ 0020';
  end if;
  perform set_config('tours.p_test_enabled', v_row.enabled::text, false);
  perform set_config('tours.p_test_account', coalesce(v_row.account_id::text, ''), false);

  select pp.enabled into v_row from public.payment_providers pp where pp.provider = 'stripe';
  perform set_config('tours.p_stripe_enabled', coalesce(v_row.enabled::text, 'false'), false);

  update public.payment_providers pp
     set enabled = true, account_id = v_acc
   where pp.provider = 'test';

  update public.payment_providers pp
     set enabled = false
   where pp.provider = 'stripe';

  perform set_config('tours.p_acc', v_acc::text, false);

  raise notice '✔ (٠-ب) حساب خزينة اختباري + «test» مفعّل و«stripe» معطّل مؤقتاً';
end;
$$;

-- ----------------------------------------------------------------------------
-- (٠-ج) حجوزات التجربة الأربعة
--   ١ — خطة كاملة: المسار السعيد وإعادة الإرسال.
--   ٢ — خطة عربون: يثبت أن المحصَّل هو **المستحق الآن** لا إجمالي الرحلة.
--   ٣ — يُنقل إلى «قيد المراجعة»: يثبت رفض بدء الدفع في حالة خاطئة.
--   ٤ — لاختبارات المبلغ المخالف والفشل والإلغاء.
-- ----------------------------------------------------------------------------
do $$
declare
  v_b     record;
  v_i     integer;
  v_keys  constant text[] := array['tours.p_b1', 'tours.p_b2', 'tours.p_b3', 'tours.p_b4'];
  v_dues  constant text[] := array['tours.p_due1', 'tours.p_due2', 'tours.p_due3', 'tours.p_due4'];
  v_plan  text;
begin
  for v_i in 1 .. 4 loop
    v_plan := case when v_i = 2 then 'deposit' else 'full' end;

    select * into v_b
    from public.create_booking(
      jsonb_build_object('label', 'موقع صحراوي أ', 'lat', 25.000000, 'lng', 27.500000),
      jsonb_build_object('label', 'موقع صحراوي ب', 'lat', 24.500000, 'lng', 28.200000),
      1, false, 0, 100, 90, 'test',
      current_setting('tours.p_class'), v_plan,
      'عميل اختبار الدفع', '01000009200', null, now() + interval '3 days',
      'PAYMENT_TESTS_FIXTURE-' || v_i
    );

    perform set_config(v_keys[v_i], v_b.id::text, false);
    perform set_config(v_dues[v_i], v_b.amount_due::text, false);

    if v_i = 2 then
      if v_b.amount_remaining <= 0 then
        raise exception
          '(٠-ج) خطة العربون لم تترك باقياً (الإجمالي %) — لا فرق بين المستحق والإجمالي لنختبره',
          v_b.total;
      end if;
      perform set_config('tours.p_total2', v_b.total::text, false);
    end if;
  end loop;

  -- الحجز الثالث إلى «قيد المراجعة» عبر الحارس القائم
  perform set_config('tours.booking_note', 'تجهيز اختبار', true);
  update public.bookings b set status = 'under_review'
   where b.id = current_setting('tours.p_b3')::uuid;

  raise notice '✔ (٠-ج) أربعة حجوزات — مستحق الأول % ومستحق الثاني % من إجمالي %',
    current_setting('tours.p_due1'), current_setting('tours.p_due2'),
    current_setting('tours.p_total2');
end;
$$;

-- ----------------------------------------------------------------------------
-- (أ) 🔒 إنشاء الجلسة يرفض كل ما لا يطابق الحجز
--
-- القاعدة الأولى في العقد: **المبلغ لا يُؤخذ من المتصفح**. الاختبار يمرّر أرقاماً
-- يستطيع مهاجم أن يمررها فعلاً — قرش واحد، وإجمالي الرحلة بدل العربون — ويتأكد
-- أن كلاً منها يُرفض وأن الرفض **لا يخلّف صفاً**.
-- ----------------------------------------------------------------------------
do $$
declare
  v_b2    uuid    := current_setting('tours.p_b2')::uuid;
  v_b3    uuid    := current_setting('tours.p_b3')::uuid;
  v_due2  numeric := current_setting('tours.p_due2')::numeric;
  v_tot2  numeric := current_setting('tours.p_total2')::numeric;
  v_res   record;
  v_hint  text;
  v_raise boolean;
  v_n     integer;
begin
  -- (أ-١) قرش واحد بدل المستحق
  v_raise := false;
  begin
    select * into v_res from public.create_payment_intent(v_b2, 'test', 1, 'EGP');
  exception when others then
    v_raise := true;
    get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if not v_raise or v_hint is distinct from 'amount-mismatch' then
    raise exception '(أ-١) ثغرة: قُبلت دفعة بقرش واحد بدل % (الرمز %)',
      v_due2, coalesce(v_hint, 'بلا');
  end if;

  -- (أ-٢) إجمالي الرحلة بدل المستحق الآن — الخلط الأخطر لأنه يبدو «منطقياً»
  v_raise := false;
  begin
    select * into v_res from public.create_payment_intent(
      v_b2, 'test', public.to_minor_units(v_tot2)::integer, 'EGP');
  exception when others then
    v_raise := true;
    get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if not v_raise or v_hint is distinct from 'amount-mismatch' then
    raise exception '(أ-٢) ثغرة: قُبل الإجمالي % بينما المستحق الآن % (الرمز %)',
      v_tot2, v_due2, coalesce(v_hint, 'بلا');
  end if;

  -- (أ-٣) بوابة معطّلة
  v_raise := false;
  begin
    select * into v_res from public.create_payment_intent(
      v_b2, 'stripe', public.to_minor_units(v_due2)::integer, 'EGP');
  exception when others then
    v_raise := true;
    get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if not v_raise or v_hint is distinct from 'provider-disabled' then
    raise exception '(أ-٣) ثغرة: بدأت دفعة على بوابة معطّلة (الرمز %)', coalesce(v_hint, 'بلا');
  end if;

  -- (أ-٤) مزوّد غير معروف — لا محوّل له أصلاً
  v_raise := false;
  begin
    select * into v_res from public.create_payment_intent(
      v_b2, 'nonexistent-gateway', public.to_minor_units(v_due2)::integer, 'EGP');
  exception when others then
    v_raise := true;
    get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if not v_raise or v_hint is distinct from 'provider-unknown' then
    raise exception '(أ-٤) ثغرة: قُبل مزوّد مجهول (الرمز %)', coalesce(v_hint, 'بلا');
  end if;

  -- (أ-٥) حالة حجز خاطئة (قيد المراجعة — إيصال يدوي بانتظار التحقق)
  v_raise := false;
  begin
    select * into v_res from public.create_payment_intent(
      v_b3, 'test', public.to_minor_units(current_setting('tours.p_due3')::numeric)::integer, 'EGP');
  exception when others then
    v_raise := true;
    get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if not v_raise or v_hint is distinct from 'invalid-status' then
    raise exception '(أ-٥) ثغرة: بدأت دفعة على حجز «قيد المراجعة» (الرمز %)', coalesce(v_hint, 'بلا');
  end if;

  -- (أ-٦) عملة مخالفة
  v_raise := false;
  begin
    select * into v_res from public.create_payment_intent(
      v_b2, 'test', public.to_minor_units(v_due2)::integer, 'USD');
  exception when others then
    v_raise := true;
    get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if not v_raise or v_hint is distinct from 'currency-mismatch' then
    raise exception '(أ-٦) ثغرة: قُبلت عملة مخالفة لعملة الحجز (الرمز %)', coalesce(v_hint, 'بلا');
  end if;

  -- (أ-٧) ولا صفَّ جلسة واحداً خلّفته المحاولات الستّ
  select count(*) into v_n
  from public.payment_intents i
  where i.booking_id in (v_b2, v_b3);

  if v_n <> 0 then
    raise exception '(أ-٧) محاولات التلاعب خلّفت % جلسة — المتوقع صفر', v_n;
  end if;

  -- (أ-٨) والمبلغ الصحيح يمر: القيمة المخزَّنة من الحجز لا من المستدعي
  select * into v_res from public.create_payment_intent(
    v_b2, 'test', public.to_minor_units(v_due2)::integer, 'EGP');

  if v_res.status <> 'created' then
    raise exception '(أ-٨) الجلسة الجديدة بحالة «%» — المتوقع created', v_res.status;
  end if;
  if v_res.amount_minor <> public.to_minor_units(v_due2)::integer then
    raise exception '(أ-٨) قيمة الجلسة % قرش والمستحق % جنيه', v_res.amount_minor, v_due2;
  end if;
  if v_res.provider_ref is not null or v_res.redirect_url is not null then
    raise exception '(أ-٨) جلسة وليدة ومعها مرجع أو رابط مزوّد — لم يُرفق شيء بعد';
  end if;

  perform set_config('tours.p_i2', v_res.id::text, false);

  raise notice '✔ (أ) رُفض القرش والإجمالي والبوابة المعطّلة والمزوّد المجهول والحالة والعملة — وقُبل المستحق % وحده', v_due2;
end;
$$;

-- ----------------------------------------------------------------------------
-- (ب) إرفاق مرجع المزوّد ورابط الدفع
-- ----------------------------------------------------------------------------
do $$
declare
  v_i2    uuid := current_setting('tours.p_i2')::uuid;
  v_res   record;
  v_hint  text;
  v_raise boolean;
begin
  -- (ب-١) رابط ليس http(s) — ناقل تنفيذ نصوص لو سُلّم للمتصفح
  v_raise := false;
  begin
    select * into v_res from public.attach_intent_ref(v_i2, 'PT-REF-X', 'javascript:alert(1)');
  exception when others then
    v_raise := true;
    get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if not v_raise or v_hint is distinct from 'invalid-redirect' then
    raise exception '(ب-١) ثغرة: قُبل رابط توجيه غير http(s) (الرمز %)', coalesce(v_hint, 'بلا');
  end if;

  -- (ب-٢) الإرفاق السليم ينقل الجلسة إلى pending
  select * into v_res from public.attach_intent_ref(
    v_i2, 'PT-REF-B2', 'https://gateway.invalid/pay/PT-REF-B2');

  if v_res.status <> 'pending' then
    raise exception '(ب-٢) الجلسة بحالة «%» بعد الإرفاق — المتوقع pending', v_res.status;
  end if;
  if v_res.provider_ref <> 'PT-REF-B2'
     or v_res.redirect_url <> 'https://gateway.invalid/pay/PT-REF-B2' then
    raise exception '(ب-٢) المرجع أو الرابط لم يُخزَّن كما أُرسل';
  end if;

  -- (ب-٣) إعادة الإرفاق بنفس المرجع = إعادة محاولة مشروعة من المسار
  select * into v_res from public.attach_intent_ref(
    v_i2, 'PT-REF-B2', 'https://gateway.invalid/pay/PT-REF-B2?r=1');
  if v_res.status <> 'pending' then
    raise exception '(ب-٣) إعادة الإرفاق بنفس المرجع فشلت';
  end if;

  -- (ب-٤) مرجع مختلف على جلسة معلّقة مرفوض: قبوله ييتّم المرجع الأول فتصل
  --       تسويته يوماً ولا تجد جلسة تطابقها
  v_raise := false;
  begin
    select * into v_res from public.attach_intent_ref(
      v_i2, 'PT-REF-OTHER', 'https://gateway.invalid/pay/other');
  exception when others then
    v_raise := true;
    get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if not v_raise or v_hint is distinct from 'ref-conflict' then
    raise exception '(ب-٤) ثغرة: استُبدل مرجع المزوّد على جلسة معلّقة (الرمز %)',
      coalesce(v_hint, 'بلا');
  end if;

  raise notice '✔ (ب) الرابط مفحوص، والمرجع مخزَّن، وإعادة الإرفاق بنفسه مقبولة وبغيره مرفوضة';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ج) المسار السعيد كاملاً — تسوية واحدة تُنتج صف تحصيل واحداً وقيداً واحداً
--
-- وهذا هو الوصل بالمرحلة ٧: لا سطر في 0020 يكتب في الدفتر؛ الدفتر يكتب نفسه
-- بمُشغّل الإيصال المعتمد كما لو كان تحويلاً يدوياً اعتمده المشرف.
-- ----------------------------------------------------------------------------
do $$
declare
  v_b1    uuid    := current_setting('tours.p_b1')::uuid;
  v_due1  numeric := current_setting('tours.p_due1')::numeric;
  v_acc   uuid    := current_setting('tours.p_acc')::uuid;
  v_int   record;
  v_res   record;
  v_pay   record;
  v_ent   record;
  v_n     integer;
  v_bal   numeric;
begin
  select * into v_int from public.create_payment_intent(
    v_b1, 'test', public.to_minor_units(v_due1)::integer, 'EGP');
  perform set_config('tours.p_i1', v_int.id::text, false);

  perform 1 from public.attach_intent_ref(
    v_int.id, 'PT-REF-C1', 'https://gateway.invalid/pay/PT-REF-C1');

  -- الـ webhook الموقَّع وصل (التحقق من التوقيع يقع في المسار قبل هذه الدالة)
  select * into v_res from public.settle_payment_intent(
    'test', 'PT-EVT-C1', 'PT-REF-C1', 'succeeded',
    public.to_minor_units(v_due1)::integer,
    jsonb_build_object('eventType', 'payment.succeeded', 'ref', 'PT-REF-C1')
  );

  if v_res.outcome <> 'settled' then
    raise exception '(ج-١) نتيجة التسوية «%» — المتوقع settled', v_res.outcome;
  end if;
  if v_res.intent_status <> 'succeeded' then
    raise exception '(ج-١) حالة الجلسة «%» بعد التسوية', v_res.intent_status;
  end if;
  if v_res.booking_status <> 'confirmed' then
    raise exception '(ج-١) حالة الحجز «%» بعد التسوية — المتوقع confirmed', v_res.booking_status;
  end if;
  if v_res.payment_id is null then
    raise exception '(ج-١) التسوية لم تُنتج صف تحصيل';
  end if;

  -- (ج-٢) صف تحصيل **واحد** بحالة معتمدة وبقيمة المستحق وعلى حساب البوابة
  select count(*) into v_n from public.payments p where p.booking_id = v_b1;
  if v_n <> 1 then
    raise exception '(ج-٢) عدد صفوف التحصيل % — المتوقع واحد', v_n;
  end if;

  select * into v_pay from public.payments p where p.booking_id = v_b1;
  if v_pay.status <> 'approved' then
    raise exception '(ج-٢) صف التحصيل بحالة «%» — المتوقع approved (وإلا لا يقيَّد)', v_pay.status;
  end if;
  if v_pay.amount <> v_due1 then
    raise exception '(ج-٢) قيمة التحصيل % والمستحق %', v_pay.amount, v_due1;
  end if;
  if v_pay.account_id is distinct from v_acc then
    raise exception '(ج-٢) التحصيل على حساب % لا على حساب البوابة %', v_pay.account_id, v_acc;
  end if;
  if v_pay.receipt_path is not null then
    raise exception '(ج-٢) دفعة بوابة ومعها مسار إيصال — لا إيصال في هذا المسار';
  end if;

  -- (ج-٣) قيد دفتر **واحد** ومصدره صف التحصيل نفسه
  select count(*) into v_n
  from public.ledger_entries e
  where e.source_type = 'payment' and e.source_id = v_pay.id;
  if v_n <> 1 then
    raise exception '(ج-٣) عدد قيود الدفتر % لصف تحصيل واحد', v_n;
  end if;

  select * into v_ent
  from public.ledger_entries e
  where e.source_type = 'payment' and e.source_id = v_pay.id;

  if v_ent.direction <> 'in' or v_ent.amount <> v_due1 then
    raise exception '(ج-٣) القيد «%» بقيمة % — المتوقع in بقيمة %',
      v_ent.direction, v_ent.amount, v_due1;
  end if;
  if v_ent.account_id is distinct from v_acc then
    raise exception '(ج-٣) القيد على حساب % لا على حساب البوابة', v_ent.account_id;
  end if;

  -- (ج-٤) ورصيد الخزينة تحرّك بمقدار المستحق تماماً (الافتتاحي صفر)
  select ab.balance into v_bal from public.v_account_balances ab where ab.account_id = v_acc;
  if v_bal is distinct from v_due1 then
    raise exception '(ج-٤) رصيد حساب البوابة % والمتوقع %', v_bal, v_due1;
  end if;

  -- (ج-٥) السجل والإشعارات: تأكيد واحد، ولا إشعار «رفع إيصال» كاذب
  select count(*) into v_n
  from public.booking_events ev
  where ev.booking_id = v_b1 and ev.to_status = 'confirmed';
  if v_n <> 1 then
    raise exception '(ج-٥) سجل الحجز يحوي % انتقالاً إلى confirmed', v_n;
  end if;

  select count(*) into v_n
  from public.notifications n
  where n.payload ->> 'bookingId' = v_b1::text
    and n.event = 'booking_confirmed';
  if v_n <> 1 then
    raise exception '(ج-٥) عدد إشعارات التأكيد % — المتوقع واحد', v_n;
  end if;

  select count(*) into v_n
  from public.notifications n
  where n.payload ->> 'bookingId' = v_b1::text
    and n.event = 'receipt_uploaded'
    and n.status = 'queued';
  if v_n <> 0 then
    raise exception '(ج-٥) بقي % إشعار «رفع إيصال» في الطابور — ولا إيصال في مسار البوابة', v_n;
  end if;

  perform set_config('tours.p_pay1', v_pay.id::text, false);

  raise notice '✔ (ج) تسوية واحدة ⇒ تحصيل واحد بقيمة % وقيد واحد ورصيد % وحجز مؤكَّد', v_due1, v_bal;
end;
$$;

-- ----------------------------------------------------------------------------
-- (د) 🔒🔒 حاجز الإصدار — الحدث نفسه ثلاث مرات
--
-- المزوّد يعيد الإرسال عند كل شك. التفرد على (provider, event_id) يجب أن يبتلع
-- كل إعادة بلا صف تحصيل ثانٍ وبلا قيد ثانٍ وبلا جنيه واحد على الرصيد.
-- ----------------------------------------------------------------------------
do $$
declare
  v_b1   uuid    := current_setting('tours.p_b1')::uuid;
  v_pay1 uuid    := current_setting('tours.p_pay1')::uuid;
  v_due1 numeric := current_setting('tours.p_due1')::numeric;
  v_acc  uuid    := current_setting('tours.p_acc')::uuid;
  v_res  record;
  v_i    integer;
  v_n    integer;
  v_bal  numeric;
begin
  for v_i in 1 .. 3 loop
    select * into v_res from public.settle_payment_intent(
      'test', 'PT-EVT-C1', 'PT-REF-C1', 'succeeded',
      public.to_minor_units(v_due1)::integer,
      jsonb_build_object('eventType', 'payment.succeeded', 'retry', v_i)
    );

    if v_res.outcome <> 'already_processed' then
      raise exception '(د) إعادة الإرسال رقم % أعادت «%» — المتوقع already_processed',
        v_i, v_res.outcome;
    end if;
    if v_res.payment_id is distinct from v_pay1 then
      raise exception '(د) إعادة الإرسال رقم % أشارت إلى تحصيل آخر (% بدل %)',
        v_i, v_res.payment_id, v_pay1;
    end if;
  end loop;

  -- 💰 الفحوص الثلاثة التي تحسم المرحلة
  select count(*) into v_n from public.payments p where p.booking_id = v_b1;
  if v_n <> 1 then
    raise exception '💰 (د) تضاعف التحصيل: % صف دفع بعد ٣ إعادات — المتوقع صف واحد', v_n;
  end if;

  select count(*) into v_n
  from public.ledger_entries e
  where e.source_type = 'payment' and e.source_id = v_pay1;
  if v_n <> 1 then
    raise exception '💰 (د) تضاعف القيد: % قيد دفتر بعد ٣ إعادات — المتوقع قيد واحد', v_n;
  end if;

  select count(*) into v_n from public.ledger_entries e where e.account_id = v_acc;
  if v_n <> 1 then
    raise exception '💰 (د) حساب البوابة عليه % قيد بعد ٣ إعادات — المتوقع قيد واحد', v_n;
  end if;

  select ab.balance into v_bal from public.v_account_balances ab where ab.account_id = v_acc;
  if v_bal is distinct from v_due1 then
    raise exception '💰 (د) الرصيد % بعد ٣ إعادات والمتوقع % — المال تضاعف', v_bal, v_due1;
  end if;

  -- ولا حدث ثانياً في السجل: الصف الوحيد هو الأول
  select count(*) into v_n
  from public.payment_events ev
  where ev.provider = 'test' and ev.event_id = 'PT-EVT-C1';
  if v_n <> 1 then
    raise exception '(د) سُجّل % حدثاً بنفس المعرّف — التفرد مكسور', v_n;
  end if;

  -- وحدث نجاح **بمعرّف مختلف** لنفس الجلسة لا يحصّل مرة أخرى كذلك
  select * into v_res from public.settle_payment_intent(
    'test', 'PT-EVT-C1-CAPTURE', 'PT-REF-C1', 'succeeded',
    public.to_minor_units(v_due1)::integer, '{"eventType":"payment.captured"}'::jsonb);

  if v_res.outcome <> 'already_processed' then
    raise exception '(د) حدث نجاح ثانٍ لنفس الجلسة أعاد «%»', v_res.outcome;
  end if;

  select count(*) into v_n from public.payments p where p.booking_id = v_b1;
  if v_n <> 1 then
    raise exception '💰 (د) حدث نجاح ثانٍ ولّد صف تحصيل إضافياً (% صفوف)', v_n;
  end if;

  raise notice '✔ (د) ٣ إعادات + حدث نجاح ثانٍ ⇒ صف تحصيل واحد وقيد واحد ورصيد % ثابت', v_bal;
end;
$$;

-- ----------------------------------------------------------------------------
-- (هـ) تسوية بمبلغ يخالف الجلسة — مرفوضة بلا أي أثر
--
-- سيناريو واقعي وخبيث: طرف يستطيع تزوير حمولة موقَّعة (سرّ مسرَّب) يرفع المبلغ
-- أو يخفضه. الجلسة قيمتها من الحجز، فأي مخالفة تُرمى ولا تُسجَّل — ٤٠٠ بلا أثر.
-- ----------------------------------------------------------------------------
do $$
declare
  v_b4    uuid    := current_setting('tours.p_b4')::uuid;
  v_due4  numeric := current_setting('tours.p_due4')::numeric;
  v_int   record;
  v_res   record;
  v_hint  text;
  v_raise boolean;
  v_n     integer;
  v_st    text;
begin
  select * into v_int from public.create_payment_intent(
    v_b4, 'test', public.to_minor_units(v_due4)::integer, 'EGP');
  perform set_config('tours.p_i4', v_int.id::text, false);

  perform 1 from public.attach_intent_ref(
    v_int.id, 'PT-REF-E1', 'https://gateway.invalid/pay/PT-REF-E1');

  -- (هـ-١) مبلغ أكبر
  v_raise := false;
  begin
    select * into v_res from public.settle_payment_intent(
      'test', 'PT-EVT-E1', 'PT-REF-E1', 'succeeded',
      public.to_minor_units(v_due4)::integer + 10000, '{}'::jsonb);
  exception when others then
    v_raise := true;
    get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if not v_raise or v_hint is distinct from 'amount-mismatch' then
    raise exception '(هـ-١) ثغرة: قُبلت تسوية بمبلغ أكبر من الجلسة (الرمز %)',
      coalesce(v_hint, 'بلا');
  end if;

  -- (هـ-٢) مبلغ أصغر
  v_raise := false;
  begin
    select * into v_res from public.settle_payment_intent(
      'test', 'PT-EVT-E2', 'PT-REF-E1', 'succeeded', 1, '{}'::jsonb);
  exception when others then
    v_raise := true;
    get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if not v_raise or v_hint is distinct from 'amount-mismatch' then
    raise exception '(هـ-٢) ثغرة: قُبلت تسوية بقرش واحد (الرمز %)', coalesce(v_hint, 'بلا');
  end if;

  -- (هـ-٣) صفر أثر: لا تحصيل، ولا قيد، ولا حدث مسجَّل، والجلسة والحجز كما كانا
  select count(*) into v_n from public.payments p where p.booking_id = v_b4;
  if v_n <> 0 then
    raise exception '(هـ-٣) التسوية المرفوضة ولّدت % صف تحصيل', v_n;
  end if;

  select count(*) into v_n
  from public.payment_events ev
  where ev.event_id in ('PT-EVT-E1', 'PT-EVT-E2');
  if v_n <> 0 then
    raise exception '(هـ-٣) التسوية المرفوضة خلّفت % حدثاً مسجَّلاً — والمطلوب صفر أثر', v_n;
  end if;

  select i.status into v_st from public.payment_intents i where i.id = v_int.id;
  if v_st <> 'pending' then
    raise exception '(هـ-٣) حالة الجلسة صارت «%» بعد رفض التسوية', v_st;
  end if;

  select b.status into v_st from public.bookings b where b.id = v_b4;
  if v_st <> 'pending_payment' then
    raise exception '(هـ-٣) حالة الحجز صارت «%» بعد رفض التسوية', v_st;
  end if;

  raise notice '✔ (هـ) المبلغ الأكبر والأصغر مرفوضان بلا صف ولا قيد ولا حدث';
end;
$$;

-- ----------------------------------------------------------------------------
-- (و) الفشل والإلغاء يحرّران الحجز ولا يمسّانه
-- ----------------------------------------------------------------------------
do $$
declare
  v_b1   uuid    := current_setting('tours.p_b1')::uuid;
  v_b4   uuid    := current_setting('tours.p_b4')::uuid;
  v_i4   uuid    := current_setting('tours.p_i4')::uuid;
  v_due1 numeric := current_setting('tours.p_due1')::numeric;
  v_due4 numeric := current_setting('tours.p_due4')::numeric;
  v_int  record;
  v_res  record;
  v_n    integer;
  v_st   text;
  v_why  text;
begin
  -- (و-١) حدث فشل على جلسة معلّقة
  select * into v_res from public.settle_payment_intent(
    'test', 'PT-EVT-F1', 'PT-REF-E1', 'failed', null,
    '{"eventType":"payment.failed","failureReason":"رُفضت البطاقة"}'::jsonb);

  if v_res.outcome <> 'failed' then
    raise exception '(و-١) نتيجة حدث الفشل «%» — المتوقع failed', v_res.outcome;
  end if;
  if v_res.booking_status <> 'pending_payment' then
    raise exception '(و-١) حالة الحجز «%» بعد الفشل — يجب أن يبقى بانتظار الدفع',
      v_res.booking_status;
  end if;

  select i.status, i.failure_reason into v_st, v_why
  from public.payment_intents i where i.id = v_i4;
  if v_st <> 'failed' then
    raise exception '(و-١) حالة الجلسة «%» بعد حدث الفشل', v_st;
  end if;
  -- سبب الفشل يُخزَّن كما أرسله المزوّد ليظهر للعميل وفي شاشة المطابقة
  if v_why is distinct from 'رُفضت البطاقة' then
    raise exception '(و-١) سبب الفشل المخزَّن «%» لا يطابق ما أرسله المزوّد', coalesce(v_why, 'بلا');
  end if;

  select count(*) into v_n from public.payments p where p.booking_id = v_b4;
  if v_n <> 0 then
    raise exception '(و-١) حدث الفشل ولّد % صف تحصيل', v_n;
  end if;

  -- (و-٢) جلسة ثانية على نفس الحجز ثم إلغاء — الحجز ما زال حرّاً للمحاولة
  select * into v_int from public.create_payment_intent(
    v_b4, 'test', public.to_minor_units(v_due4)::integer, 'EGP');
  perform 1 from public.attach_intent_ref(
    v_int.id, 'PT-REF-F2', 'https://gateway.invalid/pay/PT-REF-F2');

  select * into v_res from public.settle_payment_intent(
    'test', 'PT-EVT-F2', 'PT-REF-F2', 'cancelled', null,
    '{"eventType":"payment.cancelled"}'::jsonb);

  if v_res.outcome <> 'failed' or v_res.intent_status <> 'cancelled' then
    raise exception '(و-٢) الإلغاء أعطى «%»/«%»', v_res.outcome, v_res.intent_status;
  end if;

  select b.status into v_st from public.bookings b where b.id = v_b4;
  if v_st <> 'pending_payment' then
    raise exception '(و-٢) الحجز صار «%» بعد الإلغاء — والإلغاء يحرّره لا يقيّده', v_st;
  end if;

  select count(*) into v_n from public.payments p where p.booking_id = v_b4;
  if v_n <> 0 then
    raise exception '(و-٢) الإلغاء ولّد % صف تحصيل', v_n;
  end if;

  -- (و-٣) 🔒 حدث فشل **متأخر** على جلسة ناجحة لا ينقض تأكيداً ولا يمحو مالاً
  select * into v_res from public.settle_payment_intent(
    'test', 'PT-EVT-F3', 'PT-REF-C1', 'failed', null,
    '{"eventType":"payment.failed","failureReason":"حدث متأخر مصطنع"}'::jsonb);

  if v_res.outcome <> 'ignored' then
    raise exception '(و-٣) حدث الفشل المتأخر أعطى «%» — المتوقع ignored', v_res.outcome;
  end if;

  select b.status into v_st from public.bookings b where b.id = v_b1;
  if v_st <> 'confirmed' then
    raise exception '(و-٣) ثغرة: حدث فشل متأخر أعاد حجزاً مؤكَّداً إلى «%»', v_st;
  end if;

  select i.status into v_st from public.payment_intents i where i.provider_ref = 'PT-REF-C1';
  if v_st <> 'succeeded' then
    raise exception '(و-٣) ثغرة: جلسة ناجحة صارت «%» بحدث لاحق', v_st;
  end if;

  select count(*) into v_n from public.payments p where p.booking_id = v_b1;
  if v_n <> 1 then
    raise exception '(و-٣) عدد صفوف التحصيل % بعد الحدث المتأخر', v_n;
  end if;

  raise notice '✔ (و) الفشل والإلغاء يتركان الحجز بانتظار الدفع، والفشل المتأخر لا ينقض نجاحاً';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ز) حدث بلا جلسة مطابقة — يُحفظ للتدقيق ولا يحرّك شيئاً
-- ----------------------------------------------------------------------------
do $$
declare
  v_res   record;
  v_ev    record;
  v_case  record;
  v_hint  text;
  v_raise boolean;
begin
  select * into v_res from public.settle_payment_intent(
    'test', 'PT-EVT-G1', 'PT-REF-DOES-NOT-EXIST', 'succeeded', 12345,
    '{"eventType":"payment.succeeded"}'::jsonb);

  if v_res.outcome <> 'unmatched' then
    raise exception '(ز) حدث بمرجع مجهول أعطى «%» — المتوقع unmatched', v_res.outcome;
  end if;
  if v_res.payment_id is not null then
    raise exception '(ز) ثغرة: حدث بمرجع مجهول ولّد تحصيلاً';
  end if;

  select * into v_ev from public.payment_events ev
   where ev.provider = 'test' and ev.event_id = 'PT-EVT-G1';
  if not found or v_ev.intent_id is not null or v_ev.processed_at is null then
    raise exception '(ز) الحدث اليتيم لم يُحفظ للتدقيق كما ينبغي';
  end if;

  -- (ز-٢) حرّاس المدخلات — المسار يترجم هذه الرموز إلى ٤٠٠ فلا تُغيَّر بلا مقابل
  for v_case in
    select * from (values
      ('event-id-required', 'test',  '',           'succeeded'),
      ('provider-unknown',  'ghost', 'PT-EVT-G2',  'succeeded'),
      ('invalid-status',    'test',  'PT-EVT-G3',  'teleported')
    ) as t(want, prov, evt, st)
  loop
    v_raise := false;
    begin
      perform 1 from public.settle_payment_intent(
        v_case.prov, v_case.evt, 'PT-REF-C1', v_case.st, 1, '{}'::jsonb);
    exception when others then
      v_raise := true;
      get stacked diagnostics v_hint = pg_exception_hint;
    end;
    if not v_raise or v_hint is distinct from v_case.want then
      raise exception '(ز-٢) حارس «%» لم يعمل — الرمز العائد %',
        v_case.want, coalesce(v_hint, 'بلا');
    end if;
  end loop;

  raise notice '✔ (ز) الحدث بلا جلسة محفوظ للتدقيق، وحرّاس المدخلات الثلاثة تعمل';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ي) مال وصل لحجز لا يمكن تأكيده — يُقيَّد ولا يضيع
--
-- الحالة الواقعية: العميل بدأ الدفع، ثم أُلغي الحجز (أو ألغاه هو)، ثم وصل تأكيد
-- البوابة متأخراً. المال **خرج من حساب العميل فعلاً**، فلا يجوز أن يختفي من
-- الدفتر لأن الحجز لم يعد قابلاً للتأكيد. النتيجة `recorded` تنادي المشرف
-- ليردّه عبر `record_refund`.
-- ----------------------------------------------------------------------------
do $$
declare
  v_b3   uuid := current_setting('tours.p_b3')::uuid;
  v_due3 numeric := current_setting('tours.p_due3')::numeric;
  v_int  record;
  v_res  record;
  v_n    integer;
  v_st   text;
begin
  -- الحجز الثالث ما زال «قيد المراجعة» ⇒ نعيده بانتظار الدفع لنبدأ جلسة عليه
  perform set_config('tours.booking_note', 'تجهيز اختبار', true);
  update public.bookings b set status = 'pending_payment' where b.id = v_b3;

  select * into v_int from public.create_payment_intent(
    v_b3, 'test', public.to_minor_units(v_due3)::integer, 'EGP');
  perform 1 from public.attach_intent_ref(
    v_int.id, 'PT-REF-Y1', 'https://gateway.invalid/pay/PT-REF-Y1');

  -- العميل ألغى بينما هو عند البوابة
  perform set_config('tours.booking_note', 'إلغاء أثناء الدفع', true);
  update public.bookings b set status = 'cancelled' where b.id = v_b3;

  -- ثم وصل التأكيد الموقَّع
  select * into v_res from public.settle_payment_intent(
    'test', 'PT-EVT-Y1', 'PT-REF-Y1', 'succeeded',
    public.to_minor_units(v_due3)::integer, '{"eventType":"payment.succeeded"}'::jsonb);

  if v_res.outcome <> 'recorded' then
    raise exception '(ي) نتيجة التسوية «%» على حجز ملغى — المتوقع recorded', v_res.outcome;
  end if;
  if v_res.booking_status <> 'cancelled' then
    raise exception '(ي) حالة الحجز «%» — التسوية لا يجوز أن تُحيي حجزاً ملغى', v_res.booking_status;
  end if;

  -- المال مقيَّد: صف تحصيل واحد وقيد دفتر واحد
  select count(*) into v_n from public.payments p where p.booking_id = v_b3;
  if v_n <> 1 then
    raise exception '(ي) عدد صفوف التحصيل % — المال الواصل لا يضيع ولا يتضاعف', v_n;
  end if;

  select count(*) into v_n
  from public.ledger_entries e
  where e.booking_id = v_b3 and e.source_type = 'payment';
  if v_n <> 1 then
    raise exception '(ي) عدد قيود الدفتر % لمال وصل فعلاً', v_n;
  end if;

  select i.status into v_st from public.payment_intents i where i.id = v_int.id;
  if v_st <> 'succeeded' then
    raise exception '(ي) حالة الجلسة «%» رغم نجاح الدفع', v_st;
  end if;

  raise notice '✔ (ي) مال وصل لحجز ملغى: مقيَّد مرة واحدة، والحجز لم يُحيَ';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ح) عزل الزائر — لا صلاحية على الجداول الثلاثة ولا على الدوال الكاتبة
-- ----------------------------------------------------------------------------
do $$
declare
  v_leak   text;
  v_denied boolean := false;
  v_skip   boolean := false;
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    raise notice '  ↳ (ح) تخطٍّ: دور anon غير موجود في هذه القاعدة';
    v_skip := true;
  end if;

  if not v_skip then
    -- (ح-١) كتالوجياً: ولا صلاحية واحدة على أي جدول من الثلاثة
    select string_agg(distinct t.rel || '/' || p.priv, '، ')
      into v_leak
    from (values
      ('public.payment_providers'), ('public.payment_intents'), ('public.payment_events')
    ) as t(rel)
    cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE')) as p(priv)
    where has_table_privilege('anon', t.rel, p.priv);

    if v_leak is not null then
      raise exception '(ح-١) ثغرة: الزائر يملك % على جداول الدفع', v_leak;
    end if;

    -- (ح-٢) والدوال الكاتبة محجوبة عن الزائر **وعن المسجَّل** معاً
    select string_agg(distinct f.sig || '/' || r.who, '، ')
      into v_leak
    from (values
      ('public.create_payment_intent(uuid, text, integer, text)'),
      ('public.attach_intent_ref(uuid, text, text)'),
      ('public.settle_payment_intent(text, text, text, text, integer, jsonb)')
    ) as f(sig)
    cross join (values ('anon'), ('authenticated')) as r(who)
    where has_function_privilege(r.who, f.sig, 'EXECUTE');

    if v_leak is not null then
      raise exception '(ح-٢) ثغرة: دوال الدفع الكاتبة مكشوفة للمتصفح: %', v_leak;
    end if;

    -- (ح-٣) عملياً لا كتالوجياً فقط: قراءة بهوية الزائر تُرفض
    begin
      execute 'set local role anon';
      begin
        execute 'select count(*) from public.payment_intents';
      exception
        when insufficient_privilege then v_denied := true;
        when others then v_denied := true;
      end;
      execute 'reset role';
    exception
      when others then
        execute 'reset role';
        raise;
    end;

    if not v_denied then
      raise exception '(ح-٣) ثغرة: الزائر قرأ جلسات الدفع فعلياً';
    end if;

    raise notice '✔ (ح) الزائر: صفر صلاحية على الجداول الثلاثة وصفر تنفيذ على الدوال الكاتبة';
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- (ط) قارئ صفحة العودة — عمودان لا ثالث لهما
--
-- القاعدة ٢: صفحة العودة تعرض ولا تؤكد. فما تراه لا يتجاوز حالة الجلسة وتوكن
-- الحجز — ولا شيء من المزوّد إطلاقاً (لا حمولة ولا مرجع ولا مبلغ).
-- ----------------------------------------------------------------------------
do $$
declare
  v_i1   uuid := current_setting('tours.p_i1')::uuid;
  v_b1   uuid := current_setting('tours.p_b1')::uuid;
  v_cols text;
  v_res  record;
  v_tok  text;
begin
  select string_agg(x.name, ',' order by x.ord)
    into v_cols
  from (
    select unnest(p.proargnames) as name,
           generate_subscripts(p.proargnames, 1) as ord
    from pg_proc p
    where p.oid = 'public.get_payment_intent_status(uuid)'::regprocedure
  ) x
  where x.ord > 1;

  if v_cols is distinct from 'status,booking_token' then
    raise exception
      '(ط-١) قارئ صفحة العودة يُرجع «%» — المسموح status و booking_token فقط', coalesce(v_cols, 'بلا');
  end if;

  select * into v_res from public.get_payment_intent_status(v_i1);
  if v_res.status <> 'succeeded' then
    raise exception '(ط-٢) القارئ أعطى حالة «%» للجلسة الناجحة', v_res.status;
  end if;

  select b.public_token into v_tok from public.bookings b where b.id = v_b1;
  if v_res.booking_token is distinct from v_tok then
    raise exception '(ط-٢) التوكن المُعاد لا يطابق توكن الحجز';
  end if;

  -- معرّف مجهول ⇒ صفر صف (لا رسالة تُفرّق بين «غير موجود» و«ليس لك»)
  perform 1 from public.get_payment_intent_status('9a000000-0000-4000-8000-0000000000ff'::uuid);
  if found then
    raise exception '(ط-٣) القارئ أعاد صفاً لمعرّف جلسة مجهول';
  end if;

  raise notice '✔ (ط) صفحة العودة ترى الحالة والتوكن فقط';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ك) 🔒 أرقام حسابات التحصيل ليست لكل مسجَّل — تصليب 0025 البند (١)
--
-- ما يُختبر: `available_payment_accounts(numeric)` كانت ممنوحة لـ `authenticated`
-- بلا حارس (0009:722 ثم 0015:1555)، وهي تعيد `handle` (رقم المحفظة أو الآيبان)
-- و`holder_name` و`daily_headroom`/`monthly_headroom` — وفرقُ الأخيرين بين
-- يومين هو **الإيراد اليومي للمنصة**. وكل متعهد في البورتال مستخدم مسجَّل.
--
-- ثلاثة شواهد إيجابية قبل كل نفي (النمط ٩ في LESSONS): الحساب مرئي فعلاً من
-- اتصال المالك · هوية المتعهد فعّالة فعلاً · والزائر بالتوكن ما زال يراه.
-- بلا هذه الثلاثة يصير «صفر صف» نتيجةً لا تُميَّز عن فيكسترة فاشلة.
--
-- والشاهد الثالث تحديداً هو حارس الانحدار الأهم: الحارس لو وُضع في الجسم
-- المشترك بدل الغلاف الإداري لأُفرغت **صفحة تحويل العميل** من كل حساب بصمت.
-- ----------------------------------------------------------------------------
do $$
declare
  v_acc   constant uuid := '9a000000-0000-4000-8000-00000000000c';
  v_user  constant uuid := '9a000000-0000-4000-8000-0000000000c1';
  v_built boolean := false;
  v_b     record;
  v_tok   text;
  v_n     integer;
  v_ok    boolean;
  v_head  numeric;
begin
  -- ── الفيكسترة: محفظة معروضة للعميل + حجز ما زال بانتظار الدفع ──
  -- handle اصطناعي: 0009 تفرض تفرد (kind, handle) فرقمٌ واقعي قد يصطدم بحساب
  -- حقيقي للمالك على القاعدة الحيّة. واللصيقة PAYMENT_TESTS كي يلتقطها تنظيف (م).
  insert into public.payment_accounts
    (id, kind, label, handle, holder_name, opening_balance, active, sort, customer_facing)
  values
    (v_acc, 'wallet', 'PAYMENT_TESTS محفظة معروضة', 'PT-WALLET-0250000000', 'اختبار',
     0, true, 951, true)
  on conflict (id) do update
    set customer_facing = true, active = true, handle = 'PT-WALLET-0250000000';

  select * into v_b
  from public.create_booking(
    jsonb_build_object('label', 'موقع صحراوي أ', 'lat', 25.000000, 'lng', 27.500000),
    jsonb_build_object('label', 'موقع صحراوي ب', 'lat', 24.500000, 'lng', 28.200000),
    1, false, 0, 100, 90, 'test',
    current_setting('tours.p_class'), 'full',
    'عميل اختبار الحسابات', '01000009205', null, now() + interval '3 days',
    'PAYMENT_TESTS_FIXTURE-5'
  );

  select b.public_token into v_tok from public.bookings b where b.id = v_b.id;
  if v_tok is null or length(v_tok) < 32 then
    raise exception '(ك-٠) توكن الحجز غير صالح — لا معنى لاختبار غلاف التوكن بعده';
  end if;
  if (select b.status from public.bookings b where b.id = v_b.id) <> 'pending_payment' then
    raise exception '(ك-٠) حجز الفيكسترة ليس بانتظار الدفع — غلاف التوكن سيرفضه لسبب آخر';
  end if;

  -- (ك-١) شاهد إيجابي: من اتصال المالك تُرجع الدالة الحساب ومعه المتاح اليومي
  select count(*) into v_n
  from public.available_payment_accounts(0) a where a.id = v_acc;
  if v_n <> 1 then
    raise exception
      '(ك-١) الحساب المعروض للعميل غائب عن الدالة من اتصال المالك (% صفاً) — الحارس كسر مسار الإدارة/الهجرات', v_n;
  end if;

  -- (ك-٢) شاهد إيجابي ثانٍ: غلاف التوكن يعمل للزائر — مسار صفحة الدفع نفسه
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    raise notice '  ↳ (ك-٢) لا دور anon على هذه القاعدة — شاهد الزائر متخطّى';
  else
    begin
      execute 'set local role anon';
      execute format(
        'select count(*) from public.available_payment_accounts(%L, 0) a where a.id = %L',
        v_tok, v_acc) into v_n;
      execute 'reset role';
    exception
      when others then
        execute 'reset role';
        raise;
    end;
    if v_n <> 1 then
      raise exception
        '(ك-٢) الزائر بتوكن حجز صالح لم يرَ حساب التحويل (% صفاً) — صفحة الدفع فارغة', v_n;
    end if;

    -- وبتوكن فاسد: صفر — الحراسة القائمة لم تُنقض بإعادة الكتابة
    begin
      execute 'set local role anon';
      execute 'select count(*) from public.available_payment_accounts(''garbage'', 0)' into v_n;
      execute 'reset role';
    exception
      when others then
        execute 'reset role';
        raise;
    end;
    if v_n <> 0 then
      raise exception '(ك-٢ب) توكن فاسد فتح قائمة الحسابات للزائر (% صفاً)', v_n;
    end if;
  end if;

  -- (ك-٣) الحاجز نفسه: متعهد مسجَّل الدخول لا يرى رقم محفظة واحداً
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    raise notice '  ↳ (ك-٣) لا دور authenticated على هذه القاعدة — الفحص الحي متخطّى';
  else
    begin
      insert into auth.users (id, email) values (v_user, 'payment-tests-partner@local.invalid');
      insert into public.profiles (id, role, full_name)
      values (v_user, 'subcontractor', 'متعهد اختبار الدفع')
      on conflict (id) do update set role = excluded.role;
      insert into public.subcontractors (profile_id, company_name, contact_name, phone, status)
      values (v_user, 'PAYMENT_TESTS شركة اختبار', 'مسؤول اختبار', '01000009206', 'approved');
      v_built := true;
    exception
      when others then
        -- التخطّي مقصود لقاعدة بلا مخطط auth، لا لفيكسترة معطوبة. وهذا الفحص هو
        -- **الوحيد الحيّ** على ثغرة أرقام الحسابات، فابتلاعه يترك الهجرة بلا حارس
        -- سلوكي ويطبع ALL PASSED كاذباً (النمط ٩: فحصٌ لا يمكن أن يفشل).
        if to_regclass('auth.users') is not null then
          raise exception '(ك-٣) تعذّر بناء هوية المتعهد رغم وجود auth.users: % — أصلح الفيكسترة، لا تتخطَّ الفحص', sqlerrm;
        end if;
        raise notice '  ↳ (ك-٣) لا مخطط auth على هذه القاعدة — الفحص الحي متخطّى (%)', sqlerrm;
    end;

    if v_built then
      begin
        perform set_config('request.jwt.claim.sub', v_user::text, false);
        perform set_config('request.jwt.claims', jsonb_build_object('sub', v_user)::text, false);
        execute 'set local role authenticated';

        -- شاهد إيجابي ثالث: الهوية فعّالة — يقرأ صفَّ شركته بسياسة 0010
        execute $q$select count(*) from public.subcontractors
                   where company_name like 'PAYMENT_TESTS%'$q$ into v_n;
        if v_n <> 1 then
          raise exception
            '(ك-٣أ) المتعهد لا يقرأ صف شركته (% صفاً) — الهوية غير فعّالة فلا معنى لما بعدها', v_n;
        end if;

        -- 🔒 ومع ذلك: صفر حساب من النسخة أحادية الوسيط
        execute 'select count(*) from public.available_payment_accounts(0)' into v_n;
        if v_n <> 0 then
          raise exception
            '(ك-٣ب) متعهد مسجَّل قرأ % حساب تحصيل — أرقام المحافظ والإيراد اليومي مكشوفة', v_n;
        end if;

        -- ولا حتى بمبلغ آخر (الترشيح بالحد ليس هو الحارس)
        execute 'select count(*) from public.available_payment_accounts(999999)' into v_n;
        if v_n <> 0 then
          raise exception '(ك-٣ج) المتعهد قرأ % حساباً بمبلغ آخر', v_n;
        end if;

        -- ولا من الباب الخلفي: الدالة الداخلية ليست له
        v_ok := false;
        begin
          execute 'select count(*) from public.payment_accounts_within_caps(0)' into v_n;
        exception when others then v_ok := true;
        end;
        if not v_ok then
          raise exception
            '(ك-٣د) المتعهد نفّذ payment_accounts_within_caps مباشرة (% صفاً) — الحارس التفّ عليه', v_n;
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

      delete from public.subcontractors s where s.company_name like 'PAYMENT_TESTS%';
      delete from public.profiles p where p.id = v_user;
      begin
        delete from auth.users u where u.id = v_user;
      exception when others then null;
      end;
    end if;
  end if;

  -- (ك-٤) وبعد كل ذلك: المتاح اليومي ما زال يُحسب صحيحاً لمن يستحقه
  --       (الحارس أُضيف بلا مساس بالمنطق — والقيمة تُشتق من الحد لا من رقم محفور)
  update public.payment_accounts pa set daily_cap = 1000 where pa.id = v_acc;
  select a.daily_headroom into v_head
  from public.available_payment_accounts(0) a where a.id = v_acc;
  if v_head is distinct from 1000 then
    raise exception '(ك-٤) المتاح اليومي بعد التصليب: توقعنا الحد كاملاً وحصلنا %', v_head;
  end if;

  raise notice '✔ (ك) حسابات التحصيل: المالك واللوحة يرونها، والزائر بالتوكن يراها، والمتعهد المسجَّل لا يرى رقماً واحداً';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ل) 🔴 اللوحة تقرّر بالمفتاح لا بالنوع — حارس انحدار على عيبٍ عاش شهراً
--
-- ما يُختبر: صفحة التحويل كانت لا تعرض إلا المحافظ وانستا باي، وخانةُ «يظهر
-- للعملاء» على الحساب البنكي تُحفظ «بنجاح» ثم تعود مطفأة. والسبب لم يكن في
-- القاعدة — `payment_accounts_within_caps` لا تعرف النوع أصلاً — بل في إجراء
-- اللوحة الذي كان يقسر `customer_facing` إلى `false` لكل `bank`. **وهذا صنف
-- عيبٍ لا تمسكه قراءةُ كود ولا فحصُ بناء**: كل طبقة على حِدة سليمة.
--
-- فالفحص هنا **سلوكي على الطريق الكامل**: حساب `kind='bank'` بمفتاح مشغَّل
-- يجب أن يصل العميلَ عبر غلاف التوكن نفسه الذي تناديه `/booking/[token]`،
-- وإطفاء المفتاح وحده يجب أن يخفيه. ويكمله فحصان بنيويان: القائمة البيضاء
-- (لا رقم خزينة يصل المتصفح) والحارس البنيوي على وعاء تسوية البوابات (0060).
-- ----------------------------------------------------------------------------
do $$
declare
  v_bank  constant uuid := '9a000000-0000-4000-8000-00000000000b';
  v_b     record;
  v_tok   text;
  v_n     integer;
  v_gw    uuid;
  v_fired boolean;
  v_names text[];
begin
  insert into public.payment_accounts
    (id, kind, label, handle, holder_name, opening_balance, active, sort, customer_facing)
  values
    (v_bank, 'bank', 'PAYMENT_TESTS بنك معروض', 'PT-BANK-SELFCHECK', 'اختبار',
     0, true, 952, true)
  on conflict (id) do update
    set customer_facing = true, active = true, kind = 'bank';

  select * into v_b
  from public.create_booking(
    jsonb_build_object('label', 'موقع صحراوي أ', 'lat', 25.000000, 'lng', 27.500000),
    jsonb_build_object('label', 'موقع صحراوي ب', 'lat', 24.500000, 'lng', 28.200000),
    1, false, 0, 100, 90, 'test',
    current_setting('tours.p_class'), 'full',
    'عميل اختبار الحساب البنكي', '01000009207', null, now() + interval '3 days',
    'PAYMENT_TESTS_FIXTURE-6'
  );
  select b.public_token into v_tok from public.bookings b where b.id = v_b.id;
  if v_tok is null or length(v_tok) < 32 then
    raise exception '(ل-٠) توكن الحجز غير صالح — لا معنى لما بعده';
  end if;

  -- (ل-١) 🔴 الشاهد المباشر على العيب: البنكي المعروض يصل العميل
  select count(*) into v_n
  from public.available_payment_accounts(v_tok, 0) a where a.id = v_bank;
  if v_n <> 1 then
    raise exception
      '(ل-١) حساب بنكي مفعَّل و«يظهر للعملاء» غاب عن صفحة التحويل (% صفاً) — عاد ترشيحٌ بالنوع إلى الطريق', v_n;
  end if;

  -- (ل-٢) والمفتاح وحده هو ما يحكم: إطفاؤه يخفيه، وتشغيله يعيده — بلا لمس النوع
  update public.payment_accounts pa set customer_facing = false where pa.id = v_bank;
  select count(*) into v_n
  from public.available_payment_accounts(v_tok, 0) a where a.id = v_bank;
  if v_n <> 0 then
    raise exception '(ل-٢) إطفاء «يظهر للعملاء» لم يُخفِ الحساب (% صفاً)', v_n;
  end if;

  update public.payment_accounts pa set customer_facing = true where pa.id = v_bank;
  select count(*) into v_n
  from public.available_payment_accounts(v_tok, 0) a where a.id = v_bank;
  if v_n <> 1 then
    raise exception '(ل-٣) إعادة تشغيل المفتاح لم تُعِد الحساب (% صفاً)', v_n;
  end if;

  -- (ل-٤) والحساب المتوقف يبقى مخفياً مهما كان المفتاح — الشرطان معاً لا أحدهما
  update public.payment_accounts pa set active = false where pa.id = v_bank;
  select count(*) into v_n
  from public.available_payment_accounts(v_tok, 0) a where a.id = v_bank;
  if v_n <> 0 then
    raise exception '(ل-٤) حساب متوقف ظهر للعميل لأن مفتاح الظهور مشغَّل (% صفاً)', v_n;
  end if;
  update public.payment_accounts pa set active = true where pa.id = v_bank;

  -- (ل-٥) قائمة بيضاء: لا رقم خزينة في طريق الزائر (0060 البند ١)
  select coalesce(p.proargnames, '{}') into v_names
  from pg_proc p
  where p.oid = 'public.available_payment_accounts(text, numeric)'::regprocedure;
  if v_names && array['daily_headroom', 'monthly_headroom', 'opening_balance',
                      'daily_cap', 'monthly_cap'] then
    raise exception
      '(ل-٥) طريق الزائر يحمل عمود خزينة (%) — فرقُ المتاح بين لحظتين هو إيرادنا اليومي',
      array_to_string(v_names, ', ');
  end if;

  -- (ل-٦) وما كان قائماً يبقى: الغلاف الإداري ما زال يحمل المتاح لأشرطة اللوحة
  select coalesce(p.proargnames, '{}') into v_names
  from pg_proc p
  where p.oid = 'public.available_payment_accounts(numeric)'::regprocedure;
  if not (v_names @> array['daily_headroom', 'monthly_headroom']) then
    raise exception '(ل-٦) الغلاف الإداري فقد المتاح اليومي/الشهري — أشرطة اللوحة تنكسر';
  end if;

  -- (ل-٧) الحارس البنيوي: وعاء تسوية بوابة لا يصير وجهة تحويل ولو بنقرة ساهية.
  --       بنداءٍ حيّ يُلغى داخل كتلته — لا بقراءة تعريف المُشغّل (القاعدة ١٩).
  select pa.id into v_gw
  from public.payment_accounts pa
  where exists (select 1 from public.payment_providers pp where pp.account_id = pa.id)
  limit 1;

  if v_gw is null then
    raise exception '(ل-٧) لا حساب مرتبط بمزوّد دفع — الفيكسترة (٠-ب) لم تُبنَ، والفحص أعمى';
  end if;

  begin
    update public.payment_accounts pa set customer_facing = true where pa.id = v_gw;
    raise exception 'PT_GUARD_MISSING';
  exception
    when others then
      v_fired := sqlerrm <> 'PT_GUARD_MISSING';
  end;
  if not v_fired then
    raise exception
      '(ل-٧) حساب تسوية البوابات قَبِل «يظهر للعملاء» — الحارس البنيوي (0060) غائب';
  end if;

  raise notice '✔ (ل) المفتاح وحده يحكم: البنكي يظهر ويختفي بأمر اللوحة · لا رقم خزينة للزائر · ووعاء البوابات محجوب بنيوياً';
end;
$$;

-- ============================================================================
-- (ن) عمولة بوابات الدفع — ن‑١ (الهجرة 0066)
--
-- الادّعاء الذي يحرسه هذا القسم في جملة واحدة: **العمولة تُضاف إلى ما يدفعه
-- العميل، ولا تحرّك جنيهاً واحداً مما يخصّ المتعهد.** وهي الجملة التي تُنقَض
-- بسطرٍ واحد حسن النية (إضافة العمولة إلى `bookings.total`) بلا أن يحمرّ شيء:
-- الحساب يبقى صحيحاً، والصفحة تعرض الرقم الصحيح، **وسقف موجة البث يتسع** فيفوز
-- متعهدٌ أغلى بمالٍ دفعه العميل لفودافون كاش.
--
-- ولذلك القسم يقيس **زوجاً**: حجزٌ بعمولات وحجزٌ بلا عمولات، بمدخلات متطابقة
-- حرفياً، ويقارن أربعة أرقام تخصّ المتعهد. الفرق في أيٍّ منها = العمولة تسرّبت.
--
-- المرجع: `lib/payment-fee-types.ts` (العقد) + `0066_payment_account_fees.sql`.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (ن-٠) تجهيزات: حسابا عمولة بمثالَي بدر — فودافون كاش +١ · انستاباي +٢٠
--
-- حسابان **من الاختبار لا من قاعدة بدر**: تعديل عمولة حسابٍ حقيقي يجعل الاختبار
-- يقيس ما ضبطه المالك لا ما تفعله الشيفرة، ويترك أثراً إن انهار التشغيل.
-- ----------------------------------------------------------------------------
do $$
declare
  v_fix constant uuid := '9a000000-0000-4000-8000-00000000000f';  -- ثابتة  +١
  v_pct constant uuid := '9a000000-0000-4000-8000-00000000000e';  -- نسبة  ٢٪
begin
  if to_regprocedure('public.payment_fee_amount(text, numeric, numeric)') is null
     or to_regprocedure('public.booking_payment_fee(jsonb, uuid)') is null
     or to_regprocedure('public.attach_receipt(text, text, uuid)') is null then
    raise exception 'شرط مسبق: دوال العمولة مفقودة — نفّذ 0066_payment_account_fees.sql';
  end if;

  insert into public.payment_accounts
    (id, kind, label, handle, holder_name, opening_balance, active, sort,
     customer_facing, fee_kind, fee_value)
  values
    (v_fix, 'wallet',   'PAYMENT_TESTS محفظة عمولة',  'PT-FEE-WALLET', 'اختبار', 0, true, 951,
     true, 'fixed', 1),
    (v_pct, 'instapay', 'PAYMENT_TESTS نسبة عمولة',   'PT-FEE-INSTA',  'اختبار', 0, true, 952,
     true, 'percent', 2);

  perform set_config('tours.p_fee_fix', v_fix::text, false);
  perform set_config('tours.p_fee_pct', v_pct::text, false);

  raise notice '✔ (ن-٠) حسابا عمولة: ثابتة ١ جنيه ونسبة ٢٪';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ن-١) حجزان بمدخلات متطابقة: أحدهما وُلد والعمولات مضبوطة، والآخر بلا عمولة
--
-- ⚠ **والفرق بينهما لحظة الميلاد لا بعده**: اللقطة تُكتب في `before insert`،
--   فإطفاء العمولات ثم إنشاء الحجز الثاني يجعله شاهداً حقيقياً على «بلا عمولة»
--   لا نسخةً من الأول أُخفيت أرقامها.
-- ----------------------------------------------------------------------------
do $$
declare
  v_fix uuid := current_setting('tours.p_fee_fix')::uuid;
  v_pct uuid := current_setting('tours.p_fee_pct')::uuid;
  v_b   record;
begin
  select * into v_b
  from public.create_booking(
    jsonb_build_object('label', 'موقع صحراوي أ', 'lat', 25.000000, 'lng', 27.500000),
    jsonb_build_object('label', 'موقع صحراوي ب', 'lat', 24.500000, 'lng', 28.200000),
    1, false, 0, 100, 90, 'test',
    current_setting('tours.p_class'), 'deposit',
    'عميل اختبار العمولة', '01000009261', null, now() + interval '3 days',
    'PAYMENT_TESTS_FIXTURE-FEE'
  );
  perform set_config('tours.p_bfee', v_b.id::text, false);
  perform set_config('tours.p_bfee_due', v_b.amount_due::text, false);
  perform set_config('tours.p_bfee_total', v_b.total::text, false);

  if v_b.amount_remaining <= 0 then
    raise exception
      '(ن-١) خطة العربون لم تترك باقياً — لا فرق بين المستحق والإجمالي فلا يُقاس موضع العمولة';
  end if;

  -- الشاهد: العمولات مطفأة قبل ميلاده
  update public.payment_accounts set fee_kind = 'none', fee_value = 0
   where id in (v_fix, v_pct);

  select * into v_b
  from public.create_booking(
    jsonb_build_object('label', 'موقع صحراوي أ', 'lat', 25.000000, 'lng', 27.500000),
    jsonb_build_object('label', 'موقع صحراوي ب', 'lat', 24.500000, 'lng', 28.200000),
    1, false, 0, 100, 90, 'test',
    current_setting('tours.p_class'), 'deposit',
    'عميل اختبار بلا عمولة', '01000009262', null, now() + interval '3 days',
    'PAYMENT_TESTS_FIXTURE-NOFEE'
  );
  perform set_config('tours.p_bnofee', v_b.id::text, false);

  -- وتُعاد العمولات: الحجز الأول مجمَّد سلفاً، والباقي من القسم يقرأ الكتالوج حيّاً
  update public.payment_accounts set fee_kind = 'fixed',   fee_value = 1 where id = v_fix;
  update public.payment_accounts set fee_kind = 'percent', fee_value = 2 where id = v_pct;

  raise notice '✔ (ن-١) حجزان متطابقان — بعمولات وبلا عمولات (إجمالي %)',
    current_setting('tours.p_bfee_total');
end;
$$;

-- ----------------------------------------------------------------------------
-- (ن-٢) 🔒 العمولة تصل فاتورة العميل — بنوعيها، وبالحساب الصحيح لكل حساب
-- ----------------------------------------------------------------------------
do $$
declare
  v_b     uuid    := current_setting('tours.p_bfee')::uuid;
  v_fix   uuid    := current_setting('tours.p_fee_fix')::uuid;
  v_pct   uuid    := current_setting('tours.p_fee_pct')::uuid;
  v_due   numeric := current_setting('tours.p_bfee_due')::numeric;
  v_total numeric := current_setting('tours.p_bfee_total')::numeric;
  v_token text;
  v_row   record;
  v_seen  integer := 0;
begin
  select b.public_token into v_token from public.bookings b where b.id = v_b;

  for v_row in
    select a.id, a.fee, a.amount_due_with_fee, a.total_with_fee
    from public.available_payment_accounts(v_token, v_due) a
    where a.id in (v_fix, v_pct)
  loop
    v_seen := v_seen + 1;

    -- ★ العمولة الثابتة تساوي قيمتها، والنسبة تساوي نسبتها من **الإجمالي**
    if v_row.id = v_fix and v_row.fee <> 1 then
      raise exception '(ن-٢) العمولة الثابتة يجب أن تكون ١ وعادت %', v_row.fee;
    end if;
    if v_row.id = v_pct and v_row.fee <> round(v_total * 2 / 100, 2) then
      raise exception '(ن-٢) نسبة ٢٪ من % يجب أن تكون %، وعادت %',
        v_total, round(v_total * 2 / 100, 2), v_row.fee;
    end if;

    -- ★ وتُضاف إلى ما يحوّله العميل وإلى إجمالي فاتورته — لا إلى أحدهما
    if v_row.amount_due_with_fee <> round(v_due + v_row.fee, 2) then
      raise exception '(ن-٢) المطلوب تحويله ليس المستحق + العمولة (% ≠ % + %)',
        v_row.amount_due_with_fee, v_due, v_row.fee;
    end if;
    if v_row.total_with_fee <> round(v_total + v_row.fee, 2) then
      raise exception '(ن-٢) إجمالي الفاتورة ليس الإجمالي + العمولة (% ≠ % + %)',
        v_row.total_with_fee, v_total, v_row.fee;
    end if;
  end loop;

  if v_seen <> 2 then
    raise exception
      '(ن-٢) حسابا العمولة لم يبلغا مسار العميل (وصل % منهما) — العمولة موجودة ولا يراها أحد',
      v_seen;
  end if;

  raise notice '✔ (ن-٢) الثابتة والنسبة تصلان الفاتورة: المستحق + العمولة، والإجمالي + العمولة';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ن-٣) 🔴 **وهي لا تحرّك المتعهد** — أربعة أرقام متطابقة بين الحجزين
--
-- سقف الموجتين والهامش والإجمالي والمتبقي نقداً. لو دخلت العمولة `bookings.total`
-- لتحرّك أولها فوراً، ولمرّ ذلك في كل اختبار آخر في المستودع.
-- ----------------------------------------------------------------------------
do $$
declare
  v_fee   uuid := current_setting('tours.p_bfee')::uuid;
  v_no    uuid := current_setting('tours.p_bnofee')::uuid;
  a       record;
  b       record;
begin
  select bk.total, bk.margin_amount, bk.amount_remaining, bk.amount_due,
         public.dispatch_ceiling(bk.id, 1) as c1,
         public.dispatch_ceiling(bk.id, 2) as c2
    into a
  from public.bookings bk where bk.id = v_fee;

  select bk.total, bk.margin_amount, bk.amount_remaining, bk.amount_due,
         public.dispatch_ceiling(bk.id, 1) as c1,
         public.dispatch_ceiling(bk.id, 2) as c2
    into b
  from public.bookings bk where bk.id = v_no;

  if a.total <> b.total then
    raise exception
      '(ن-٣) العمولة دخلت bookings.total (% مقابل %) — ومعها تحرّك سقف البث وأساس الخصم وكسب النقاط',
      a.total, b.total;
  end if;
  if a.c1 <> b.c1 or a.c2 <> b.c2 then
    raise exception
      '(ن-٣) 🔴 سقف موجة البث تحرّك بالعمولة (%/% مقابل %/%) — متعهدٌ أغلى صار يفوز بمالٍ ليس من نصيبه',
      a.c1, a.c2, b.c1, b.c2;
  end if;
  if a.margin_amount is distinct from b.margin_amount then
    raise exception '(ن-٣) هامش الحجز تحرّك بالعمولة (% مقابل %)', a.margin_amount, b.margin_amount;
  end if;
  if a.amount_remaining <> b.amount_remaining then
    raise exception
      '(ن-٣) المتبقي نقداً مع السائق تحرّك بعمولة تحويلٍ إلكتروني (% مقابل %)',
      a.amount_remaining, b.amount_remaining;
  end if;
  if a.amount_due <> b.amount_due then
    raise exception '(ن-٣) المستحق المخزَّن تحرّك بالعمولة (% مقابل %)', a.amount_due, b.amount_due;
  end if;

  raise notice
    '✔ (ن-٣) الإجمالي % والهامش % وسقفا البث %/% والمتبقي % — متطابقة مع حجز بلا عمولة',
    a.total, coalesce(a.margin_amount::text, '—'), a.c1, a.c2, a.amount_remaining;
end;
$$;

-- ----------------------------------------------------------------------------
-- (ن-٤) الحدّ **في الجدول** لا في الواجهة — ثلاث محاولات تُرفض
-- ----------------------------------------------------------------------------
do $$
declare
  v_fix constant uuid := current_setting('tours.p_fee_fix')::uuid;
  v_bad text[] := array['percent:101', 'fixed:-1', 'bogus:1'];
  v_one text;
  v_ok  boolean;
begin
  foreach v_one in array v_bad loop
    begin
      update public.payment_accounts
         set fee_kind  = split_part(v_one, ':', 1),
             fee_value = split_part(v_one, ':', 2)::numeric
       where id = v_fix;
      raise exception 'PT_FEE_NO_BOUND';
    exception
      when others then
        v_ok := sqlerrm <> 'PT_FEE_NO_BOUND';
    end;
    if not v_ok then
      raise exception '(ن-٤) القيد قَبِل «%» — الحدّ ليس في الجدول', v_one;
    end if;
  end loop;

  -- والحارس: لا عمولة على وعاءٍ لا يُحوَّل إليه (النقدية ووعاء تسوية البوابات)
  begin
    update public.payment_accounts set fee_kind = 'fixed', fee_value = 5
     where id = current_setting('tours.p_acc')::uuid;   -- وعاء تسوية «test»
    raise exception 'PT_FEE_NO_GUARD';
  exception
    when others then
      v_ok := sqlerrm <> 'PT_FEE_NO_GUARD';
  end;
  if not v_ok then
    raise exception '(ن-٤) وعاء تسوية البوابات قَبِل عمولة — إعدادٌ يُحفظ ولا يصل عميلاً';
  end if;

  raise notice '✔ (ن-٤) نسبة ١٠١٪ ومبلغ سالب ونوع مجهول وعمولةُ وعاءٍ ميت — أربعتها مرفوضة في القاعدة';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ن-٥) 🔒 التجميد — تغيير العمولة اليوم لا يمسّ حجز الأمس
-- ----------------------------------------------------------------------------
do $$
declare
  v_b     uuid := current_setting('tours.p_bfee')::uuid;
  v_fix   uuid := current_setting('tours.p_fee_fix')::uuid;
  v_token text;
  v_before numeric;
  v_after  numeric;
  v_new    record;
  v_newfee numeric;
begin
  select b.public_token into v_token from public.bookings b where b.id = v_b;

  select a.fee into v_before
  from public.available_payment_accounts(v_token, current_setting('tours.p_bfee_due')::numeric) a
  where a.id = v_fix;

  update public.payment_accounts set fee_kind = 'fixed', fee_value = 999 where id = v_fix;

  select a.fee into v_after
  from public.available_payment_accounts(v_token, current_setting('tours.p_bfee_due')::numeric) a
  where a.id = v_fix;

  if v_after is distinct from v_before then
    raise exception
      '(ن-٥) 🔴 رفع العمولة غيّر حجزاً قائماً (% ⇐ %) — العميل يُطالَب بما لم يره',
      v_before, v_after;
  end if;

  -- وحجزٌ **جديد** يلتقط الإعداد الجديد: التجميد تجميد لا تعطيل
  select * into v_new
  from public.create_booking(
    jsonb_build_object('label', 'موقع صحراوي أ', 'lat', 25.000000, 'lng', 27.500000),
    jsonb_build_object('label', 'موقع صحراوي ب', 'lat', 24.500000, 'lng', 28.200000),
    1, false, 0, 100, 90, 'test',
    current_setting('tours.p_class'), 'full',
    'عميل اختبار العمولة الجديدة', '01000009263', null, now() + interval '3 days',
    'PAYMENT_TESTS_FIXTURE-FEE2'
  );

  select public.booking_payment_fee(b.trip, v_fix) into v_newfee
  from public.bookings b where b.id = v_new.id;

  if v_newfee <> 999 then
    raise exception
      '(ن-٥) الحجز الجديد لم يلتقط العمولة الجديدة (%) — اللقطة مجمَّدة على الماضي لا على لحظة الحجز',
      v_newfee;
  end if;

  update public.payment_accounts set fee_kind = 'fixed', fee_value = 1 where id = v_fix;

  raise notice '✔ (ن-٥) القائم ثابت على % والجديد يلتقط ٩٩٩ — اللقطة لحظة الحجز لا لحظة القراءة',
    v_before;
end;
$$;

-- ----------------------------------------------------------------------------
-- (ن-٦) قيمة الإيصال = المستحق + عمولة الحساب المُصرَّح به
--
-- ولماذا يهمّ: المشرف يقارن السطر بصورة الإيصال. فرقٌ دائم بينهما يعلّمه أن
-- يتجاهل الفرق — وهو اليوم الذي يمرّ فيه تحويلٌ ناقصٌ حقيقي.
-- ----------------------------------------------------------------------------
do $$
declare
  v_b     uuid    := current_setting('tours.p_bfee')::uuid;
  v_pct   uuid    := current_setting('tours.p_fee_pct')::uuid;
  v_due   numeric := current_setting('tours.p_bfee_due')::numeric;
  v_total numeric := current_setting('tours.p_bfee_total')::numeric;
  v_token text;
  v_res   record;
  v_amt   numeric;
  v_want  numeric;
  v_on    uuid;
begin
  select b.public_token into v_token from public.bookings b where b.id = v_b;
  v_want := round(v_due + round(v_total * 2 / 100, 2), 2);

  select * into v_res
  from public.attach_receipt(v_token, v_token || '/pt-fee.jpg', v_pct);

  select p.amount, p.account_id into v_amt, v_on
  from public.payments p where p.id = v_res.payment_id;

  if v_amt <> v_want then
    raise exception '(ن-٦) قيمة الإيصال % والمتوقع % (المستحق % + عمولة النسبة)',
      v_amt, v_want, v_due;
  end if;
  if v_on is distinct from v_pct then
    raise exception '(ن-٦) الإيصال سُجّل على حسابٍ غير المُصرَّح به — لا يُعرف أين وصل المال';
  end if;

  -- وإعادة الحجز إلى «بانتظار الدفع» كي لا يعتمد ما بعده على حالة غيّرها هو
  perform set_config('tours.booking_note', 'تجهيز اختبار', true);
  update public.bookings b set status = 'pending_payment' where b.id = v_b;
  delete from public.payments p where p.id = v_res.payment_id;

  raise notice '✔ (ن-٦) الإيصال سُجّل بـ% = المستحق % + عمولة الحساب المُصرَّح به', v_amt, v_due;
end;
$$;

-- ----------------------------------------------------------------------------
-- (ن-٧) 🧬 **طفرة** — الاختبار الذي لا يفشل حين يُنزع حارسه ليس اختباراً
--
-- النمط ٩ في `LESSONS.md` («حارسٌ يطمئنك ولا يحرس»)، والقاعدة ١٩ («الكاشف الذي
-- يقرأ النصّ يكذب في الاتجاهين»). أخطر ادّعاءٍ في هذا القسم هو **التجميد** —
-- ولو كان `booking_payment_fee` يقرأ الكتالوج الحيّ بدل اللقطة لبقي كل شيء
-- يعمل: الأرقام صحيحة، والصفحة تعرض، والقسم (ن-٢) أخضر. الفرق لا يظهر إلا
-- يوم يغيّر المالك عمولةً وحجزٌ قائم لم يُدفع بعد.
--
-- فتُزرع الطفرة بعينها — قارئٌ يقرأ الحيّ — ويُطلَب من (ن-٥) أن **يفشل**.
-- والاستعادة من `pg_get_functiondef` الحيّ المُلتقط قبل الطفرة، لا من نسخةٍ
-- مكتوبة هنا تنحرف عن الأصل بعد أول تعديل (D-58).
-- ----------------------------------------------------------------------------
do $$
declare
  v_b       uuid := current_setting('tours.p_bfee')::uuid;
  v_fix     uuid := current_setting('tours.p_fee_fix')::uuid;
  v_token   text;
  v_origin  text;
  v_before  numeric;
  v_after   numeric;
  v_caught  boolean := false;
begin
  select b.public_token into v_token from public.bookings b where b.id = v_b;

  -- المصدر الحيّ أولاً — قبل أي مساس
  select pg_get_functiondef('public.booking_payment_fee(jsonb, uuid)'::regprocedure)
    into v_origin;

  select a.fee into v_before
  from public.available_payment_accounts(v_token, current_setting('tours.p_bfee_due')::numeric) a
  where a.id = v_fix;

  -- 🧬 الطفرة: يتجاهل اللقطة ويقرأ الكتالوج الحيّ
  execute $mut$
    create or replace function public.booking_payment_fee(p_trip jsonb, p_account_id uuid)
    returns numeric
    language sql
    stable
    security definer
    set search_path = ''
    as $body$
      select coalesce(
        (select public.payment_fee_amount(pa.fee_kind, pa.fee_value, 100000)
           from public.payment_accounts pa where pa.id = p_account_id),
        0::numeric);
    $body$;
  $mut$;

  begin
    update public.payment_accounts set fee_value = 777 where id = v_fix;

    select a.fee into v_after
    from public.available_payment_accounts(v_token, current_setting('tours.p_bfee_due')::numeric) a
    where a.id = v_fix;

    -- نفس شرط (ن-٥) حرفياً — ويجب أن يرمي الآن
    if v_after is distinct from v_before then
      raise exception 'PT_FEE_MUTANT_CAUGHT';
    end if;
  exception
    when others then
      v_caught := sqlerrm = 'PT_FEE_MUTANT_CAUGHT';
  end;

  -- الاستعادة **قبل** الحكم: تشخيصٌ فاشل لا يجوز أن يترك القاعدة مطفَّرة
  execute v_origin;
  update public.payment_accounts set fee_kind = 'fixed', fee_value = 1 where id = v_fix;

  if not v_caught then
    raise exception
      '(ن-٧) 🔴 نُزع التجميد ومرّ الاختبار — أي أن (ن-٥) يؤكد ما يفترضه ولا يحرس شيئاً';
  end if;

  -- وبعد الاستعادة يعود الادّعاء صحيحاً: نفس القراءة، نفس الرقم
  select a.fee into v_after
  from public.available_payment_accounts(v_token, current_setting('tours.p_bfee_due')::numeric) a
  where a.id = v_fix;
  if v_after is distinct from v_before then
    raise exception '(ن-٧) لم تُستعَد الدالة الأصلية — القاعدة باقية على الطفرة (% ≠ %)',
      v_after, v_before;
  end if;

  raise notice
    '✔ (ن-٧) الطفرة أُمسكت: قارئٌ يقرأ الكتالوج الحيّ بدل اللقطة أسقط (ن-٥) — ثم استُعيد الأصل';
end;
$$;

-- ============================================================================
-- (س) قائمةٌ واحدة لا ثلاث — ن‑٩ (أ) والهجرة 0070
--
-- ما يُختبر ولماذا: بلّغ بدر أن الحسابات البنكية «تظهر في شاشة الإيصال ولا تظهر
-- في اختر الحساب». والقياس أسقط الفرضية المكتوبة (الحدّ اليومي) وأسقط ظاهر
-- البلاغ (القارئان صارا واحداً بعد ن‑١) — **وكشف قائمةً ثالثة في الكتابة**:
-- `attach_receipt` كانت تقبل أي حساب `active`، فحاملُ التوكن يسمّي وعاء تسوية
-- البوابات أو خزنة المكتب فيقع الإيصال ثم القيدُ على وعاءٍ لا علاقة له بتحويله.
--
-- 🔒 والادّعاء الذي يحرسه هذا القسم ليس «الكتابة ترفض المحجوب» وحده، بل
--    **«القراءة والكتابة تقرآن التعريف نفسه»**. ولذلك تُزرع الطفرة في التعريف
--    وحده (‏`payment_account_customer_visible`) ويُطلَب من **السطحين معاً** أن
--    يتحرّكا. فلو استنسخت إحداهما الشرط لبقيت ساكنة — وذلك بعينه ما يُمسك.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (س-٠) تجهيز: حسابٌ محجوب · وثلاثة بعمولات تخالف ترتيب اللوحة · وحجزٌ يجمّدها
--
-- ⚠ الترتيب مقصود: **الأغلى برقم ترتيبٍ أصغر**. فلو كان الفرز ما زال بترتيب
--   اللوحة وحده لجاء الأغلى أولاً — والاختبار لا يفرّق بين الفرضين إن اتفقا.
-- ----------------------------------------------------------------------------
do $$
declare
  v_hidden constant uuid := '9a000000-0000-4000-8000-0000000000d1';
  v_pricey constant uuid := '9a000000-0000-4000-8000-0000000000d2';
  v_cheap  constant uuid := '9a000000-0000-4000-8000-0000000000d3';
  v_tie    constant uuid := '9a000000-0000-4000-8000-0000000000d4';
  v_b      record;
begin
  if to_regprocedure('public.payment_account_customer_visible(uuid)') is null
     or to_regprocedure('public.payment_account_family(text)') is null then
    raise exception 'شرط مسبق: دوال ن‑٩ مفقودة — نفّذ 0070_payment_choice_one_source.sql';
  end if;

  insert into public.payment_accounts
    (id, kind, label, handle, holder_name, opening_balance, active, sort,
     customer_facing, fee_kind, fee_value)
  values
    -- مفعَّلٌ و**غير معروض** — هو موضع العيب كله
    (v_hidden, 'bank', 'PAYMENT_TESTS محجوب', 'PT-N9-HIDDEN', 'اختبار', 0, true, 953,
     false, 'none', 0),
    (v_pricey, 'bank',     'PAYMENT_TESTS غالٍ',   'PT-N9-PRICEY', 'اختبار', 0, true, 954,
     true, 'fixed', 50),
    (v_cheap,  'wallet',   'PAYMENT_TESTS رخيص',   'PT-N9-CHEAP',  'اختبار', 0, true, 955,
     true, 'fixed', 2),
    (v_tie,    'instapay', 'PAYMENT_TESTS متعادل', 'PT-N9-TIE',    'اختبار', 0, true, 956,
     true, 'fixed', 2)
  on conflict (id) do update
    set active = true, customer_facing = excluded.customer_facing,
        fee_kind = excluded.fee_kind, fee_value = excluded.fee_value,
        sort = excluded.sort, kind = excluded.kind;

  -- الحجز **بعد** ضبط العمولات: اللقطة تُكتب لحظة الإدراج (0066 §٣)
  select * into v_b
  from public.create_booking(
    jsonb_build_object('label', 'موقع صحراوي أ', 'lat', 25.000000, 'lng', 27.500000),
    jsonb_build_object('label', 'موقع صحراوي ب', 'lat', 24.500000, 'lng', 28.200000),
    1, false, 0, 100, 90, 'test',
    current_setting('tours.p_class'), 'full',
    'عميل اختبار القائمة الواحدة', '01000009270', null, now() + interval '3 days',
    'PAYMENT_TESTS_FIXTURE-N9'
  );
  perform set_config('tours.p_n9_b', v_b.id::text, false);
  perform set_config('tours.p_n9_due', v_b.amount_due::text, false);
  perform set_config('tours.p_n9_hidden', v_hidden::text, false);
  perform set_config('tours.p_n9_pricey', v_pricey::text, false);
  perform set_config('tours.p_n9_cheap', v_cheap::text, false);
  perform set_config('tours.p_n9_tie', v_tie::text, false);

  raise notice '✔ (س-٠) حسابٌ محجوب وثلاثةٌ بعمولات ٥٠ و٢ و٢ — وترتيب اللوحة يخالف الثمن';
end;
$$;

-- ----------------------------------------------------------------------------
-- (س-١) 🔴 ما لا تعرضه القراءة لا تقبله الكتابة — وما تعرضه تقبله
--
-- الشقّ الثاني ليس زينة: **حارسٌ يرفض كل شيء ليس حارساً بل عطلاً**، ويمرّ في
-- اختبارٍ يفحص الرفض وحده.
-- ----------------------------------------------------------------------------
do $$
declare
  v_b      uuid := current_setting('tours.p_n9_b')::uuid;
  v_hidden uuid := current_setting('tours.p_n9_hidden')::uuid;
  v_cheap  uuid := current_setting('tours.p_n9_cheap')::uuid;
  v_token  text;
  v_n      integer;
  v_raised boolean := false;
  v_hint   text;
  v_res    record;
begin
  select b.public_token into v_token from public.bookings b where b.id = v_b;

  -- القراءة: المحجوب غائب عن الطريقين معاً (طريق العميل وقائمة الحدود)
  select count(*) into v_n
  from public.available_payment_accounts(v_token, 0) a where a.id = v_hidden;
  if v_n <> 0 then
    raise exception '(س-١أ) حسابٌ غير معروض ظهر في طريق العميل (% صفاً)', v_n;
  end if;

  -- والكتابة: ترفضه برمزه المسمّى الذي يترجمه /api/booking/receipt
  begin
    perform 1 from public.attach_receipt(v_token, v_token || '/n9-hidden.jpg', v_hidden);
  exception
    when others then
      v_raised := true;
      get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if not v_raised or v_hint is distinct from 'account-unavailable' then
    raise exception
      '(س-١ب) 🔴 قُبل إيصالٌ على حسابٍ لا تعرضه الصفحة (رُفض=% رمز=%) — القائمة الثالثة مفتوحة، وتحصيلٌ يقع على وعاءٍ يسمّيه المتصفح',
      v_raised, coalesce(v_hint, 'بلا');
  end if;

  -- والصفّ لم يُكتب: الرفض قبل الإدراج لا بعده
  select count(*) into v_n from public.payments p
   where p.booking_id = v_b and p.account_id = v_hidden;
  if v_n <> 0 then
    raise exception '(س-١ج) رُفض النداء وبقي % صفَّ تحصيل على الحساب المحجوب', v_n;
  end if;

  -- والحجز لم يتحرك — رفضٌ بلا أثر
  if (select b.status from public.bookings b where b.id = v_b) <> 'pending_payment' then
    raise exception '(س-١د) رفضُ الحساب حرّك حالة الحجز';
  end if;

  -- ثم المعروض: يُقبل، ويقع على حسابه هو
  select * into v_res
  from public.attach_receipt(v_token, v_token || '/n9-ok.jpg', v_cheap);
  if (select p.account_id from public.payments p where p.id = v_res.payment_id)
       is distinct from v_cheap then
    raise exception '(س-١هـ) الإيصال المقبول سُجّل على حسابٍ غير المُصرَّح به';
  end if;

  -- وإعادة الأرض نظيفة لما بعده
  perform set_config('tours.booking_note', 'تجهيز اختبار', true);
  update public.bookings b set status = 'pending_payment' where b.id = v_b;
  delete from public.payments p where p.id = v_res.payment_id;

  raise notice '✔ (س-١) المحجوب مرفوضٌ برمزه وبلا أثر، والمعروض مقبولٌ على حسابه';
end;
$$;

-- ----------------------------------------------------------------------------
-- (س-٢) 🧬 **طفرة** — الادّعاء هو «تعريفٌ واحد»، فالطفرة تُزرع فيه وحده
--
-- النمط ٩ في `LESSONS.md` والقاعدة ١٩. ولو استنسخت القراءةُ أو الكتابةُ شرطَ
-- الظهور بدل تفويضه لبقي سطحُها ساكناً تحت الطفرة — **وهذا بالضبط ما يُمسك**:
-- المطلوب أن يتحرك السطحان **معاً**، وسكونُ أحدهما فشل.
--
-- والاستعادة من `pg_get_functiondef` الحيّ المُلتقط قبل الطفرة (D-58)، وقبل
-- الحكم — فتشخيصٌ فاشل لا يجوز أن يترك القاعدة مطفَّرة.
-- ----------------------------------------------------------------------------
do $$
declare
  v_b       uuid := current_setting('tours.p_n9_b')::uuid;
  v_hidden  uuid := current_setting('tours.p_n9_hidden')::uuid;
  v_token   text;
  v_origin  text;
  v_read    integer;
  v_write   boolean := false;
  v_caught  boolean := false;
  v_res     record;
begin
  select b.public_token into v_token from public.bookings b where b.id = v_b;

  select pg_get_functiondef('public.payment_account_customer_visible(uuid)'::regprocedure)
    into v_origin;

  -- 🧬 الطفرة: التعريف يقول «كل مفعَّلٍ مرئي» — أي `customer_facing` بلا أثر
  execute $mut$
    create or replace function public.payment_account_customer_visible(p_account_id uuid)
    returns boolean
    language sql
    stable
    security definer
    set search_path = ''
    as $body$
      select exists (
        select 1 from public.payment_accounts pa
        where pa.id = p_account_id and pa.active
      );
    $body$;
  $mut$;

  begin
    -- (١) القراءة تحرّكت؟
    select count(*) into v_read
    from public.available_payment_accounts(v_token, 0) a where a.id = v_hidden;

    -- (٢) والكتابة تحرّكت؟
    begin
      select * into v_res
      from public.attach_receipt(v_token, v_token || '/n9-mutant.jpg', v_hidden);
      v_write := true;
      -- تنظيف أثر الطفرة فوراً — لا يُترك لما بعد الاستعادة
      perform set_config('tours.booking_note', 'تجهيز اختبار', true);
      update public.bookings b set status = 'pending_payment' where b.id = v_b;
      delete from public.payments p where p.id = v_res.payment_id;
    exception
      when others then v_write := false;
    end;

    v_caught := v_read = 1 and v_write;
  exception
    when others then
      v_caught := false;
  end;

  -- الاستعادة **قبل** الحكم
  execute v_origin;

  if not v_caught then
    raise exception
      '(س-٢) 🔴 نُزع معنى «معروض للعميل» من التعريف الواحد ولم يتحرك السطحان معاً (قراءة=% كتابة=%) — أي أن أحدهما يحمل نسخته الخاصة من الشرط، وهو بعينه العيب الذي جاءت ن‑٩ تغلقه',
      v_read, v_write;
  end if;

  -- وبعد الاستعادة يعود الادّعاء صحيحاً على السطحين
  select count(*) into v_read
  from public.available_payment_accounts(v_token, 0) a where a.id = v_hidden;
  if v_read <> 0 then
    raise exception '(س-٢) لم تُستعَد الدالة الأصلية — القاعدة باقية على الطفرة';
  end if;

  begin
    perform 1 from public.attach_receipt(v_token, v_token || '/n9-after.jpg', v_hidden);
    raise exception '(س-٢) الكتابة ما زالت تقبل المحجوب بعد الاستعادة';
  exception
    when others then
      if sqlerrm like '(س-٢)%' then raise; end if;
  end;

  raise notice
    '✔ (س-٢) الطفرة أُمسكت: نزعُ المعنى من التعريف الواحد حرّك القراءة والكتابة معاً — ثم استُعيد الأصل';
end;
$$;

-- ----------------------------------------------------------------------------
-- (س-٣) العائلة تُشتقّ في القاعدة — ولا نوعٍ يسقط من الشاشة
--
-- التجميع في الواجهة يعتمد على هذا العمود. وقائمةٌ بيضاء هناك — أو عائلةٌ
-- فارغة هنا — تعني **حساباً لا يُعرض، أي مالاً لا يصل**.
-- ----------------------------------------------------------------------------
do $$
declare
  v_b      uuid := current_setting('tours.p_n9_b')::uuid;
  v_cheap  uuid := current_setting('tours.p_n9_cheap')::uuid;
  v_tie    uuid := current_setting('tours.p_n9_tie')::uuid;
  v_pricey uuid := current_setting('tours.p_n9_pricey')::uuid;
  v_token  text;
  v_bad    text;
  v_n      integer;
begin
  select b.public_token into v_token from public.bookings b where b.id = v_b;

  -- كل نوعٍ موجودٍ في الجدول فعلاً يُنتج عائلةً غير فارغة — لا افتراض عن الأنواع
  select string_agg(distinct pa.kind, '، ') into v_bad
  from public.payment_accounts pa
  where coalesce(nullif(btrim(public.payment_account_family(pa.kind)), ''), '') = '';
  if v_bad is not null then
    raise exception '(س-٣أ) أنواعٌ بلا عائلة (%) — التجميع سيُسقط حساباتها من الشاشة', v_bad;
  end if;

  -- والمجهول الذي لم يولد بعد كذلك: فرعُ `else` هو الحارس البنيوي
  if coalesce(nullif(btrim(public.payment_account_family('kind-does-not-exist')), ''), '') = '' then
    raise exception '(س-٣ب) نوعٌ مجهول بلا عائلة — أول نوعٍ يضيفه المالك يختفي';
  end if;

  -- المحفظة وانستا باي عائلةٌ واحدة، والبنك غيرهما — وإلا فالتجميع بلا معنى
  if public.payment_account_family('wallet') <> public.payment_account_family('instapay') then
    raise exception '(س-٣ج) المحفظة وانستا باي في عائلتين';
  end if;
  if public.payment_account_family('bank') = public.payment_account_family('wallet') then
    raise exception '(س-٣د) البنك والمحفظة عائلة واحدة';
  end if;

  -- والعمود يصل طريق العميل مملوءاً لكل صف
  select count(*) into v_n
  from public.available_payment_accounts(v_token, 0) a
  where coalesce(nullif(btrim(a.family), ''), '') = '';
  if v_n <> 0 then
    raise exception '(س-٣هـ) % صفاً بلا عائلة في طريق العميل', v_n;
  end if;

  -- والصفوف الثلاثة تقع حيث يتوقع العميل: محفظةٌ وانستا باي معاً، والبنك وحده
  if (select a.family from public.available_payment_accounts(v_token, 0) a where a.id = v_cheap)
     is distinct from
     (select a.family from public.available_payment_accounts(v_token, 0) a where a.id = v_tie) then
    raise exception '(س-٣و) المحفظة وانستا باي وصلتا الشاشة في مجموعتين';
  end if;
  if (select a.family from public.available_payment_accounts(v_token, 0) a where a.id = v_pricey)
     = (select a.family from public.available_payment_accounts(v_token, 0) a where a.id = v_cheap) then
    raise exception '(س-٣ز) البنك وصل مع المحافظ في مجموعة واحدة';
  end if;

  raise notice '✔ (س-٣) كل نوعٍ له عائلة — والمجهول عائلةُ نفسه، فلا حساب يسقط';
end;
$$;

-- ----------------------------------------------------------------------------
-- (س-٤) 🔴 الأرخص أولاً — والتعادل يفكّه ترتيب اللوحة
--
-- بعد ن‑١ صار لكل خيارٍ سعرٌ مختلف، فالترتيب هو المقارنة. والفحص **نسبيّ لا
-- مطلق**: حسابات المالك الحقيقية تشارك القائمة، فالمقيس موضعُ الرخيص من الغالي
-- لا رقمُ سطرٍ ثابت.
-- ----------------------------------------------------------------------------
do $$
declare
  v_b      uuid    := current_setting('tours.p_n9_b')::uuid;
  v_due    numeric := current_setting('tours.p_n9_due')::numeric;
  v_pricey uuid    := current_setting('tours.p_n9_pricey')::uuid;
  v_cheap  uuid    := current_setting('tours.p_n9_cheap')::uuid;
  v_tie    uuid    := current_setting('tours.p_n9_tie')::uuid;
  v_token  text;
  v_p_pos  integer;
  v_c_pos  integer;
  v_t_pos  integer;
  v_p_fee  numeric;
  v_c_fee  numeric;
begin
  select b.public_token into v_token from public.bookings b where b.id = v_b;

  with listed as (
    select a.id, a.fee, row_number() over () as pos
    from public.available_payment_accounts(v_token, v_due) a
  )
  select
    max(pos) filter (where id = v_pricey), max(pos) filter (where id = v_cheap),
    max(pos) filter (where id = v_tie),
    max(fee) filter (where id = v_pricey), max(fee) filter (where id = v_cheap)
  into v_p_pos, v_c_pos, v_t_pos, v_p_fee, v_c_fee
  from listed;

  if v_p_pos is null or v_c_pos is null or v_t_pos is null then
    raise exception '(س-٤أ) أحد حسابات الاختبار غاب عن القائمة — لا معنى لقياس ترتيبٍ ناقص';
  end if;

  -- شرط المعنى: العمولتان مختلفتان فعلاً، وإلا فالفحص يقيس تعادلاً لا ترتيباً
  if v_p_fee <= v_c_fee then
    raise exception '(س-٤ب) عمولة «الغالي» % ليست أكبر من «الرخيص» % — اللقطة لم تُجمَّد كما رُتّب',
      v_p_fee, v_c_fee;
  end if;

  -- 🔴 والأرخص أسبق رغم أن ترتيب اللوحة يضع الغالي قبله
  if v_c_pos > v_p_pos then
    raise exception
      '(س-٤ج) الغالي (+%) سبق الرخيص (+%) — الترتيب ما زال بترتيب اللوحة وحده، فالشاشة قائمةٌ لا مقارنة',
      v_p_fee, v_c_fee;
  end if;

  -- والمتعادلان يعودان إلى ترتيب بدر: الرخيص sort=955 قبل المتعادل sort=956
  if v_c_pos > v_t_pos then
    raise exception
      '(س-٤د) متساويا العمولة لم يعودا إلى ترتيب اللوحة — تعادلٌ يُفكّ عشوائياً يقلب الشاشة بين تحديثين';
  end if;

  raise notice '✔ (س-٤) الأرخص (+%) سبق الغالي (+%)، والتعادل عاد إلى ترتيب اللوحة', v_c_fee, v_p_fee;
end;
$$;

-- ============================================================================
-- (ص) علامة الوسيلة — البند ١٢ والهجرة 0093
--
-- ما يُختبر ولماذا: أراد بدر صورةً بجانب كل وسيلة دفع («الصورة أبلغ وأسرع في
-- توصيل المعلومة من المحتوى النصي»)، والقيد غير القابل للتفاوض أن **الموقع يصدر
-- صفر طلبات خارجية**. وحقلُ صورةٍ حرّ على جدولٍ يكتب فيه المشرف هو بابُ أول طلبٍ
-- خارجي — ولو وقع مرةً، فقد ذهب عنوان كل زائر ومُحيله إلى نطاقٍ غريب بلا مرور
-- على أي حارس، وهو قياسٌ من الباب الخلفي لا يراه D-44.
--
-- 🔒 **والادّعاء الذي يحرسه هذا القسم:** الشكل مفروضٌ **في القاعدة** لا في
--    TypeScript. فـ`safeMediaSrc` تحرس التصيير، ويكتب من تحتها كلُّ من لا يمرّ
--    بها: هجرةٌ قادمة، `service_role`، وسطرُ SQL بيد مشرف.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (ص-٠) تجهيز: حسابٌ معروض يخصّ هذا القسم وحده
-- ----------------------------------------------------------------------------
do $$
declare
  v_mark constant uuid := '9a000000-0000-4000-8000-0000000000e1';
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'payment_accounts'
      and column_name = 'image_url'
  ) then
    raise exception 'شرط مسبق: عمود image_url مفقود — نفّذ 0093_payment_account_mark.sql';
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'payment_accounts_image_internal_chk'
      and conrelid = 'public.payment_accounts'::regclass
  ) then
    raise exception 'شرط مسبق: قيد payment_accounts_image_internal_chk مفقود — نفّذ 0093';
  end if;

  insert into public.payment_accounts
    (id, kind, label, handle, holder_name, opening_balance, active, sort,
     customer_facing, fee_kind, fee_value)
  values
    (v_mark, 'wallet', 'PAYMENT_TESTS علامة', 'PT-MARK-1', 'اختبار', 0, true, 957,
     true, 'none', 0)
  on conflict (id) do update
    set active = true, customer_facing = true, kind = excluded.kind, sort = excluded.sort;

  perform set_config('tours.p_mark_acc', v_mark::text, false);
  raise notice '✔ (ص-٠) حساب علامةٍ معروض جاهز';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ص-١) 🔴 القيد يرفض كل شكلٍ يُنتج طلباً خارجياً — **بمحاولة كتابةٍ لكلٍّ منها**
--
-- ولا تُقاس صحّةُ قيدٍ بقراءة تعريفه (القاعدة ١٩): تُقاس بأن الكتابة تُرفَض فعلاً.
-- ----------------------------------------------------------------------------
do $$
declare
  v_acc  uuid := current_setting('tours.p_mark_acc')::uuid;
  v_bad  text;
  v_ok   boolean;
  v_got  text;
  v_evil constant text[] := array[
    'https://evil.com/logo.png',        -- نطاق صريح
    'http://evil.com/logo.png',         -- وبلا تشفير
    '//evil.com/logo.png',              -- بروتوكولٌ موروث — يُطلب فعلاً من المتصفح
    'https://cdn.jsdelivr.net/x.svg',   -- «شبكة توصيل» تبدو بريئة، وهي نطاق غريب
    'javascript:alert(1)',              -- مخطَّطٌ تنفيذي
    'data:image/svg+xml;base64,AAAA',   -- حمولةٌ مضمَّنة، وSVG يحمل سكربتاً
    '/img/../../etc/passwd',            -- صعودٌ في الشجرة
    '/',                                -- شرطةٌ بلا مسار
    'img/pay.avif'                      -- نسبيٌّ بلا شرطة — يُحلّ على مسار الصفحة
  ];
begin
  foreach v_bad in array v_evil loop
    v_ok := false;
    begin
      update public.payment_accounts set image_url = v_bad where id = v_acc;
    exception
      when check_violation then v_ok := true;
    end;
    if not v_ok then
      select pa.image_url into v_got from public.payment_accounts pa where pa.id = v_acc;
      -- تنظيفٌ فوري: القيمة الخبيثة لا تبقى في الجدول لحظةً بعد كشفها
      update public.payment_accounts set image_url = null where id = v_acc;
      raise exception
        '(ص-١) 🔴 قُبلت علامةٌ تُنتج طلباً خارجياً (%) — والمخزَّن كان %',
        v_bad, coalesce(v_got, 'NULL');
    end if;
  end loop;

  raise notice '✔ (ص-١) القيد رفض تسع صورٍ خبيثة — نطاقاً ومخطَّطاً وصعوداً ونسبياً';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ص-٢) والمقبول مقبول — قيدٌ يرفض كل شيء ليس قيداً بل عطلاً
--
-- ⚠ ونصفُ الاختبار هذا: حارسٌ لا يمرّر الصحيح يجعل الميزة **غير موجودة عند
--   مالكها** (النمط ٣ في LESSONS)، وهو عطلٌ صامت لا يمسكه فحصُ «هل رفض؟».
-- ----------------------------------------------------------------------------
do $$
declare
  v_acc  uuid := current_setting('tours.p_mark_acc')::uuid;
  v_one  text;
  v_good constant text[] := array[
    '/img/pay-vodafone-cash.avif',
    '/img/marks/instapay.webp',
    '/media/pay/nbk-2026.png'
  ];
begin
  foreach v_one in array v_good loop
    update public.payment_accounts set image_url = v_one where id = v_acc;
    if (select pa.image_url from public.payment_accounts pa where pa.id = v_acc)
       is distinct from v_one then
      raise exception '(ص-٢أ) مسارٌ داخليٌّ سليم (%) لم يُخزَّن — لا علامة تصل الشاشة', v_one;
    end if;
  end loop;

  -- و«بلا علامة» قرارٌ صالح: تعود البطاقة إلى أيقونة عائلتها
  update public.payment_accounts set image_url = null where id = v_acc;
  if (select pa.image_url from public.payment_accounts pa where pa.id = v_acc) is not null then
    raise exception '(ص-٢ب) تعذّر إفراغ العلامة — المالك لا يستطيع حذف صورة';
  end if;

  raise notice '✔ (ص-٢) ثلاثة مسارات داخلية خُزّنت، والإفراغ يعمل';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ص-٣) 🧬 **طفرة** — الادّعاء أن «القيد هو الرافض»، فيُنزَع القيدُ وحده
--
-- بلا هذه الطفرة يبقى (ص-١) مقبولاً حتى لو كان الرفضُ من شيءٍ آخر تماماً (نوعُ
-- العمود، مُشغّلٌ منسيّ، صلاحية). فيُنزَع **القيدُ بعينه** ويُطلَب من (ص-١) أن
-- **ينقلب**: القيمة الخبيثة تُخزَّن. فإن بقيت مرفوضة فالاختبار كان يقيس غير ما
-- يدّعي؛ وإن خُزّنت فقد ثبت أن هذا القيد هو ما يحمي.
--
-- 🔒 **والتعريف لا يُستنسخ هنا** (الذهبية ١٢): يُقرأ بـ`pg_get_constraintdef` قبل
--    النزع ويُعاد بحرفه. فيوم يضيق القيد أو يتوسّع لا يحتاج هذا الاختبار سطراً.
--
-- ⚠ **والإعادة مضمونة على كل مسار**: القيمة الخبيثة تُمسح **قبل** إعادة القيد
--   (وإلا رفض `add constraint` صفَّه هو)، والرفعُ يقع **بعد** الإعادة لا قبلها —
--   فلا تُترك قاعدة بدر بلا حارسها لأن الاختبار رسب.
-- ----------------------------------------------------------------------------
do $$
declare
  v_acc    uuid := current_setting('tours.p_mark_acc')::uuid;
  v_def    text;
  v_stored boolean := false;
  v_back   boolean := false;
begin
  select pg_get_constraintdef(c.oid) into v_def
  from pg_constraint c
  where c.conname = 'payment_accounts_image_internal_chk'
    and c.conrelid = 'public.payment_accounts'::regclass;

  if v_def is null then
    raise exception '(ص-٣) القيد غير موجود قبل الطفرة — لا شيء يُزرع فيه';
  end if;

  alter table public.payment_accounts drop constraint payment_accounts_image_internal_chk;

  begin
    update public.payment_accounts set image_url = 'https://evil.com/logo.png' where id = v_acc;
    v_stored := (select pa.image_url from public.payment_accounts pa where pa.id = v_acc)
                = 'https://evil.com/logo.png';
  exception
    when others then v_stored := false;
  end;

  -- التنظيف ثم الإعادة — بهذا الترتيب حتماً
  update public.payment_accounts set image_url = null where id = v_acc;
  execute format(
    'alter table public.payment_accounts add constraint payment_accounts_image_internal_chk %s',
    v_def
  );

  select exists (
    select 1 from pg_constraint c
    where c.conname = 'payment_accounts_image_internal_chk'
      and c.conrelid = 'public.payment_accounts'::regclass
  ) into v_back;

  if not v_back then
    raise exception
      '(ص-٣) 🔴 تعذّرت إعادة القيد بعد الطفرة — قاعدةٌ بلا حارس صورة. أعِدها يدوياً: %',
      v_def;
  end if;

  if not v_stored then
    raise exception
      '(ص-٣) 🧬 الطفرة لم تُغيّر شيئاً: نُزع القيد وبقي النطاق الخارجي مرفوضاً — '
      'فـ(ص-١) يقيس شيئاً آخر لا هذا القيد';
  end if;

  raise notice '✔ (ص-٣) الطفرة قلبت (ص-١) — القيد هو الرافض فعلاً، وعاد بحرفه';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ص-٤) العلامة تصل صفحة التحويل، ولا رقم خزينة يصل معها
--
-- توسيعُ نوع إرجاع `available_payment_accounts` يمسّ **القائمة البيضاء** التي
-- أرستها `0060` وأعاد تثبيتها `0070`. فيُعاد إثباتها بعد العمود العاشر — لا
-- بمطابقة نصّ بل بأسماء أعمدة الإرجاع الحيّة.
-- ----------------------------------------------------------------------------
do $$
declare
  v_acc    uuid    := current_setting('tours.p_mark_acc')::uuid;
  v_b      uuid    := current_setting('tours.p_n9_b')::uuid;
  v_due    numeric := current_setting('tours.p_n9_due')::numeric;
  v_token  text;
  v_names  text[];
  v_leaked text;
begin
  select b.public_token into v_token from public.bookings b where b.id = v_b;
  update public.payment_accounts set image_url = '/img/pay-vodafone-cash.avif' where id = v_acc;

  -- (أ) تصل مملوءةً للحساب الذي ضُبطت له
  if not exists (
    select 1 from public.available_payment_accounts(v_token, v_due) a
    where a.id = v_acc and a.image_url = '/img/pay-vodafone-cash.avif'
  ) then
    raise exception
      '(ص-٤أ) العلامة لا تصل صفحة التحويل — العمود مضبوط والدالة لا تحمله، فالميزة غير موجودة';
  end if;

  -- (ب) والغياب يصل `null` لا نصّاً فارغاً: العارضة تفرّق بينهما (`safeMediaSrc`)
  update public.payment_accounts set image_url = null where id = v_acc;
  if not exists (
    select 1 from public.available_payment_accounts(v_token, v_due) a
    where a.id = v_acc and a.image_url is null
  ) then
    raise exception '(ص-٤ب) حسابٌ بلا علامة لم يصل بـ null — الأيقونة الافتراضية لا تظهر';
  end if;

  -- (ج) 🔒 والقائمة البيضاء ما زالت مغلقة — نفس قائمة 0060/0070 حرفياً
  select coalesce(p.proargnames, '{}') into v_names
  from pg_proc p
  where p.oid = 'public.available_payment_accounts(text, numeric)'::regprocedure;

  select string_agg(x.col, '، ') into v_leaked
  from unnest(array['daily_headroom', 'monthly_headroom', 'opening_balance',
                    'daily_cap', 'monthly_cap', 'sort', 'active']) as x(col)
  where x.col = any (v_names);

  if v_leaked is not null then
    raise exception
      '(ص-٤ج) 🔴 طريق الزائر يحمل عمود خزينة (%) — توسيعُ العلامة ثقب القائمة البيضاء',
      v_leaked;
  end if;

  -- (د) وحسابٌ محجوب يبقى محجوباً: العلامة ليست شرط ظهورٍ ولا تفتح باباً
  update public.payment_accounts
     set image_url = '/img/pay-vodafone-cash.avif', customer_facing = false
   where id = v_acc;
  if exists (
    select 1 from public.available_payment_accounts(v_token, v_due) a where a.id = v_acc
  ) then
    raise exception
      '(ص-٤د) 🔴 حسابٌ customer_facing = false ظهر بعد ضبط علامته — 0070 انتُقضت';
  end if;
  update public.payment_accounts set customer_facing = true, image_url = null where id = v_acc;

  raise notice '✔ (ص-٤) العلامة تصل مملوءةً وغائبةً، ولا عمود خزينة دخل معها، والظهور كما كان';
end;
$$;

-- ----------------------------------------------------------------------------
-- (م) التنظيف — لا صف اختبار يبقى، وإعدادات المزوّدين تعود كما كانت
-- ----------------------------------------------------------------------------
do $$
declare
  v_acc   uuid := current_setting('tours.p_acc')::uuid;
  v_left  integer;
  v_teacc text := current_setting('tours.p_test_account', true);
begin
  -- إعدادات المزوّدين أولاً: تُعاد حتى لو تعثّر ما بعدها
  --
  -- 🔴 والاحتياط هنا `false` لا `true`، وهذا عيبٌ مقيسٌ لا احتمالٌ نظري:
  -- كان `'true'`، فحين غاب `tours.p_test_enabled` (تعثّرُ المجموعة قبل بلوغ
  -- التنظيف، أو جلسةٌ أُعيد استخدامها من الـSession pooler بعد أن أفرغه
  -- السطر ٢٥٠٤) **أشعل التنظيفُ بوابةَ الاختبار بدل أن يطفئها**. ووقع فعلاً في
  -- 2026-08-16 07:12:45 (‏`audit_log`: `enabled false→true` بلا قرينٍ يُعيدها)،
  -- فبقيت `payment_providers.test.enabled = true` أكثر من يوم — و`0021` كانت قد
  -- أطفأتها صراحةً لأنها على موقعٍ منشور «زرُّ تأكيدِ حجزٍ بلا دفع جنيه».
  --
  -- والأخطرُ أنها تُخفي نفسها: بعد أن بقيت مشتعلة صار السطر ١٥٦ يحفظ `true`
  -- كأنه «الأصل»، فكل تشغيلٍ تالٍ يُعيدها `true` بأمانة و`ALL PASSED` أخضر.
  -- فالاحتياط الآمن لبوابةِ اختبارٍ هو الإطفاء — كما في صفّ `stripe` تحته.
  update public.payment_providers pp
     set enabled    = coalesce(nullif(current_setting('tours.p_test_enabled', true), ''), 'false')::boolean,
         account_id = nullif(coalesce(v_teacc, ''), '')::uuid
   where pp.provider = 'test';

  update public.payment_providers pp
     set enabled = coalesce(nullif(current_setting('tours.p_stripe_enabled', true), ''), 'false')::boolean
   where pp.provider = 'stripe';

  delete from public.ledger_entries e
   where e.reverses_entry_id is not null
     and (e.account_id = v_acc
          or e.booking_id in (select b.id from public.bookings b
                               where b.trip ->> 'notes' like 'PAYMENT_TESTS_FIXTURE%'));

  delete from public.ledger_entries e
   where e.account_id = v_acc
      or e.booking_id in (select b.id from public.bookings b
                           where b.trip ->> 'notes' like 'PAYMENT_TESTS_FIXTURE%');

  delete from public.payment_events ev where ev.event_id like 'PT-EVT-%';

  delete from public.payment_intents i
   where i.booking_id in (select b.id from public.bookings b
                           where b.trip ->> 'notes' like 'PAYMENT_TESTS_FIXTURE%');

  delete from public.notifications n
   where n.payload ->> 'bookingId' in (
         select b.id::text from public.bookings b
          where b.trip ->> 'notes' like 'PAYMENT_TESTS_FIXTURE%');

  delete from public.bookings b where b.trip ->> 'notes' like 'PAYMENT_TESTS_FIXTURE%';

  -- هوية المتعهد التي يبنيها القسم (ك) — تُمسح هناك، وهذا احتياط تشغيلٍ منهار
  delete from public.subcontractors s where s.company_name like 'PAYMENT_TESTS%';
  delete from public.profiles p where p.id = '9a000000-0000-4000-8000-0000000000c1'::uuid;
  begin
    delete from auth.users u where u.id = '9a000000-0000-4000-8000-0000000000c1'::uuid;
  exception when others then null;
  end;

  delete from public.payment_accounts pa where pa.id = v_acc or pa.label like 'PAYMENT_TESTS%';

  select count(*) into v_left from public.bookings b
   where b.trip ->> 'notes' like 'PAYMENT_TESTS_FIXTURE%';
  if v_left <> 0 then
    raise exception '(م) بقي % حجز اختبار بعد التنظيف', v_left;
  end if;

  select count(*) into v_left from public.payment_intents i
   where i.provider_ref like 'PT-REF-%';
  if v_left <> 0 then
    raise exception '(م) بقيت % جلسة اختبار بعد التنظيف', v_left;
  end if;

  select count(*) into v_left from public.payment_events ev where ev.event_id like 'PT-EVT-%';
  if v_left <> 0 then
    raise exception '(م) بقي % حدث اختبار بعد التنظيف', v_left;
  end if;

  select count(*) into v_left from public.payment_accounts pa where pa.id = v_acc;
  if v_left <> 0 then
    raise exception '(م) بقي حساب خزينة الاختبار بعد التنظيف';
  end if;

  perform set_config('tours.p_class', '', false);
  perform set_config('tours.p_acc', '', false);
  perform set_config('tours.p_b1', '', false);
  perform set_config('tours.p_b2', '', false);
  perform set_config('tours.p_b3', '', false);
  perform set_config('tours.p_b4', '', false);
  perform set_config('tours.p_due1', '', false);
  perform set_config('tours.p_due2', '', false);
  perform set_config('tours.p_due3', '', false);
  perform set_config('tours.p_due4', '', false);
  perform set_config('tours.p_total2', '', false);
  perform set_config('tours.p_i1', '', false);
  perform set_config('tours.p_i2', '', false);
  perform set_config('tours.p_i4', '', false);
  perform set_config('tours.p_pay1', '', false);
  perform set_config('tours.p_test_enabled', '', false);
  perform set_config('tours.p_test_account', '', false);
  perform set_config('tours.p_stripe_enabled', '', false);
  -- القسم (ن)
  perform set_config('tours.p_fee_fix', '', false);
  perform set_config('tours.p_fee_pct', '', false);
  perform set_config('tours.p_bfee', '', false);
  perform set_config('tours.p_bnofee', '', false);
  perform set_config('tours.p_bfee_due', '', false);
  perform set_config('tours.p_bfee_total', '', false);
  -- القسم (ص)
  perform set_config('tours.p_mark_acc', '', false);
  -- القسم (س)
  perform set_config('tours.p_n9_b', '', false);
  perform set_config('tours.p_n9_due', '', false);
  perform set_config('tours.p_n9_hidden', '', false);
  perform set_config('tours.p_n9_pricey', '', false);
  perform set_config('tours.p_n9_cheap', '', false);
  perform set_config('tours.p_n9_tie', '', false);

  -- ⚠ حسابا العمولة يحملان `customer_facing = true`، فبقاء أيٍّ منهما يعني رقماً
  --   وهمياً في صفحة تحويل عميل حقيقي. حُذفا مع بقية صفوف `PAYMENT_TESTS%` أعلاه،
  --   وهذا شاهدٌ صريح لا اطمئنان.
  select count(*) into v_left from public.payment_accounts pa
   where pa.label like 'PAYMENT_TESTS%';
  if v_left <> 0 then
    raise exception '(م) بقي % حساب اختبار — أحدها قد يظهر للعملاء في صفحة التحويل', v_left;
  end if;

  raise notice '✔ (م) التنظيف تم — لا صفوف اختبار متبقية وإعدادات البوابات كما كانت';
end;
$$;

-- ----------------------------------------------------------------------------
-- الخلاصة
-- ----------------------------------------------------------------------------
do $$
begin
  raise notice 'ALL PASSED — المبلغ من الحجز، والإحكام على (provider, event_id)، وتحصيل واحد وقيد واحد مهما تكرر الحدث';
end;
$$;
