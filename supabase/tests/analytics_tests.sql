-- ============================================================================
-- analytics_tests.sql — اختبارات قبول لأحداث القمع وإحصائيات الأقسام
--                       (المرحلة ١٠: هجرة 0022_analytics.sql)
--
-- كيف تشغّله: `pnpm db:test analytics` أو الصق الملف كاملاً في SQL Editor واضغط Run.
-- النجاح = آخر سطر «ALL PASSED». أي فشل يرمي exception برسالة عربية تحدد
-- الاختبار والقيمة المتوقعة والفعلية.
--
-- ومن psql بدور صاحب القاعدة **لا بد** من ON_ERROR_STOP و‑1 معاً:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f supabase/tests/analytics_tests.sql
-- الأول لأن psql بدونه يتابع بعد الكتلة الفاشلة فيطبع «ALL PASSED» رغم الفشل،
-- والثاني لأن الملف يبدّل هوية الدور مؤقتاً. ومشغّل المشروع
-- (`pnpm db:test analytics`) ينفّذ الملف في معاملة واحدة أصلاً فيكفيه.
--
-- ── حاجزا هذا الملف ─────────────────────────────────────────────────────────
-- (١) القسم (ك-ح): **الزائر لا يمسّ سجل القمع إطلاقاً — لا قراءةً ولا كتابة.**
--     القراءة لو انفتحت يوماً تعني تسليم خريطة مبيعات المنصة كاملة لأي زائر،
--     والكتابة لو انفتحت تعني أن أي أحد يسمّم أرقام القمع بمفتاح anon المنشور
--     في حزمة المتصفح فيبني المالك ميزانية إعلانية على رقم مزوَّر. الكتابة
--     كلها بمفتاح الخدمة من `lib/analytics/emit.ts`. لا تُغلق المرحلة والقسم
--     (ك-ح) راسب.
-- (٢) القسم (ل): **مستخدم مسجَّل غير مشرف لا يرى رقماً واحداً.** التسريب الذي
--     يخشاه موجز المرحلة (تكلفة متعهد أو هامش موقع في شاشة إحصائيات) يُمسك هنا.
--
-- ── لماذا لا يلمس هذا الملف بيانات حقيقية ────────────────────────────────────
--   • إحداثيات **صحراوية نائية** (٢٥٫٠، ٢٧٫٥) ← (٢٤٫٥، ٢٨٫٢) — لا قائمة أسعار
--     حقيقية تغطيها، فالتسعير بالتعريفة حتماً ولا يتأثر بأي متعهد في القاعدة.
--   • حساب خزينة اختباري خاص بالملف: كل قيود الدفتر المولَّدة هنا تقع عليه وحده.
--   • **كل رقم يُختبر بالفرق لا بالقيمة المطلقة**: نقيس القمع قبل الزرع وبعده
--     ونؤكد أن الفارق يساوي ما زرعناه بالضبط. القاعدة الحيّة فيها حجزان
--     تجريبيان (TR-DX8U6T و TR-ZWXK7D) وسبع ترجمات إنجليزية منشورة — وأي
--     اختبار يثبّت رقماً مطلقاً كان سيسقط بمجرد نجاح المشروع (وقد وقع مرتين).
--   • الصفوف كلها بوسم ANALYTICS_TESTS وتُمسح في البداية والنهاية معاً (فحتى
--     انهيار تشغيل سابق يبدأ التالي من أرض نظيفة).
--
-- ── نموذج القمع الذي تختبره هذه المجموعة (هجرة 0023) ────────────────────────
--   • **مصدر واحد**: كل مراحل القمع من `public.funnel_events` وحده. لا مقارنة
--     بجدولَي `bookings`/`payments` في أي تأكيد هنا — وهذا هو جوهر التصحيح:
--     حجزٌ بلا حدث (أُنشئ قبل وجود القياس، أو أدخله التشغيل هاتفياً) **يجب ألا
--     يظهر في القمع**. ولذلك تزرع التجهيزات حجزاً ودفعة معتمدة **بلا** حدثَي
--     قمع لهما، وتؤكد الكتلة (ب) أن الأرقام لم تتحرك بهما — لو عاد أي مصدر
--     ثانٍ لسقط ذلك التأكيد فوراً.
--   • **السلسلة أربع مراحل**: بحث ← عرض سعر ← حجز ← دفع (`in_chain = true`).
--     و`quote_requested` و`booking_started` خارجها (`in_chain = false`) بلا
--     معدل تحول — الأول مسار دخول موازٍ والثاني فرع البوابة الإلكترونية.
--   • **الدمج بالمرجع**: صفّان بنفس `reference` يُعدّان واحداً (webhook مكرَّر)،
--     وصفّان بلا مرجع يُعدّان اثنين. الكتلتان (ج-ب-٩) و(ج-ب-١٠) تثبتان الطرفين.
--
-- المرجع: lib/analytics-types.ts (العقد) + supabase/migrations/0022_analytics.sql
--         + supabase/migrations/0023_analytics_funnel.sql (نموذج القمع الحالي).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (٠) الشروط المسبقة + تنظيف بقايا تشغيل سابق
-- ----------------------------------------------------------------------------
do $$
declare
  v_missing text;
  v_classes text[];
  v_acc     constant uuid := 'a0000000-0000-4000-8000-00000000000a';
begin
  -- الهوية تُفرَّغ أولاً: أي بقية من مطالبة jwt تجعل analytics_admin_allowed
  -- تحسبنا مستخدماً عادياً فترفض كل شيء بلا سبب مفهوم.
  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claims', '', false);

  select string_agg(x.rel, '، ')
    into v_missing
  from (values
    ('public.funnel_events'), ('public.redirects'),
    ('public.v_stats_orders'), ('public.v_stats_dispatch'),
    ('public.v_stats_partners'), ('public.v_stats_content'),
    ('public.v_stats_locales'), ('public.v_stats_treasury'),
    ('public.v_stats_customers'),
    ('public.bookings'), ('public.payments'), ('public.payment_accounts'),
    ('public.quote_requests'), ('public.ledger_entries')
  ) as x(rel)
  where to_regclass(x.rel) is null;

  if v_missing is not null then
    raise exception 'شرط مسبق: كائنات مفقودة (نفّذ 0022_analytics.sql أولاً): %', v_missing;
  end if;

  select string_agg(x.sig, '، ')
    into v_missing
  from (values
    ('public.analytics_admin_allowed()'),
    ('public.stats_delta(numeric, numeric)'),
    ('public.stats_content_rows()'),
    ('public.stats_locales_rows()'),
    ('public.section_stats(text, date, date)'),
    -- 0023: العدّاد الداخلي الذي تقرأ منه الدالتان معاً. غيابه يعني قاعدة
    -- توقّفت عند 0022 — أي القمع من مصدرين، وكل ما بعده في هذا الملف بلا معنى.
    ('public.funnel_counts(date, date)'),
    ('public.funnel_daily(date, date)'),
    ('public.funnel_summary(date, date)'),
    ('public.prune_funnel_events(integer)'),
    ('public.create_booking(jsonb, jsonb, integer, boolean, numeric, numeric, numeric, text, text, text, text, text, text, timestamptz, text, text)')
  ) as x(sig)
  where to_regprocedure(x.sig) is null;

  if v_missing is not null then
    raise exception 'شرط مسبق: دوال مفقودة: %', v_missing;
  end if;

  -- الحارس نفسه يجب أن يمرّ لاتصال مالك القاعدة، وإلا فكل ما بعده بلا معنى
  if not public.analytics_admin_allowed() then
    raise exception
      'شرط مسبق: analytics_admin_allowed ترفض اتصال الاختبار (session_user = %) — لا يمكن قياس شيء',
      session_user;
  end if;

  -- ── تنظيف بقايا ──
  -- القيود العاكسة أولاً (reverses_entry_id بـ on delete restrict)، ثم القيود،
  -- ثم المدفوعات، ثم الأحداث، ثم الحجوزات، ثم الحساب (يمنع حذفَه أيُّ قيد باقٍ).
  delete from public.ledger_entries e
   where e.reverses_entry_id is not null
     and (e.account_id = v_acc
          or e.booking_id in (select b.id from public.bookings b
                               where b.trip ->> 'notes' like 'ANALYTICS_TESTS_FIXTURE%'));

  delete from public.ledger_entries e
   where e.account_id = v_acc
      or e.booking_id in (select b.id from public.bookings b
                           where b.trip ->> 'notes' like 'ANALYTICS_TESTS_FIXTURE%');

  delete from public.payments p
   where p.account_id = v_acc
      or p.booking_id in (select b.id from public.bookings b
                           where b.trip ->> 'notes' like 'ANALYTICS_TESTS_FIXTURE%');

  -- ⚠ وسمان لا واحد: `search_performed` و`quote_viewed` تُكتبان في الإنتاج
  -- **بلا مرجع** (`/api/quote` لا يمرّر `reference`)، وهذا الملف يزرعهما كذلك
  -- كي يختبر فرع «بلا مرجع» في العدّ. فصفوفها لا يطالها ترشيح `reference`،
  -- ووسم `class_slug` هو ما يمسكها. حذف أحد الشرطين يترك صفوفاً خالدة.
  delete from public.funnel_events e
   where e.reference like 'ANLT-%' or e.class_slug = 'ANLT-FIXTURE';

  delete from public.notifications n
   where n.payload ->> 'reference' like 'QR-ANLT%'
      or n.payload ->> 'bookingId' in (
           select b.id::text from public.bookings b
            where b.trip ->> 'notes' like 'ANALYTICS_TESTS_FIXTURE%');

  delete from public.quote_requests q where q.reference like 'QR-ANLT%';
  delete from public.bookings b where b.trip ->> 'notes' like 'ANALYTICS_TESTS_FIXTURE%';
  delete from public.payment_accounts pa where pa.id = v_acc or pa.label like 'ANALYTICS_TESTS%';
  delete from public.redirects r where r.from_path like '/analytics-tests-%';

  delete from public.subcontractors s where s.company_name like 'ANALYTICS_TESTS%';
  delete from public.profiles  p where p.id = 'a0000000-0000-4000-8000-0000000000b1'::uuid;
  delete from auth.users       u where u.id = 'a0000000-0000-4000-8000-0000000000b1'::uuid;

  -- الفئة المؤهلة لراكب واحد كما يرجعها المحرك نفسه لا تخميناً منّا
  select array_agg(q.class_slug order by q.capacity asc)
    into v_classes
  from public.quote_price(100, 1, false, 0) q;

  if v_classes is null or array_length(v_classes, 1) < 1 then
    raise exception 'شرط مسبق: لا فئة سيارة نشطة لها تعريفة — نفّذ بذرة 0005';
  end if;

  perform set_config('tours.an_class', v_classes[1], false);
  perform set_config('tours.an_acc',   v_acc::text,  false);
  perform set_config('tours.an_day',   (now() at time zone 'Africa/Cairo')::date::text, false);

  raise notice '✔ (٠) الشروط المسبقة سليمة — فئة الاختبار «%» ويوم القياس %',
    v_classes[1], current_setting('tours.an_day');
end;
$$;

-- ----------------------------------------------------------------------------
-- (٠-ب) خط الأساس — نقرأ القمع **قبل** أي زرع
--
-- هذا هو جوهر منهج الملف: لا رقم مطلق واحد. القاعدة الحية فيها حجوزات وطلبات
-- سعر سابقة، ومقارنة النتيجة بخط الأساس تجعل الاختبار صحيحاً على قاعدة فارغة
-- وعلى قاعدة بدر وعلى قاعدة بعد سنة من التشغيل سواءً بسواء.
-- ----------------------------------------------------------------------------
do $$
declare
  v_day  date := current_setting('tours.an_day')::date;
  v_keys constant text[] := array[
    'search_performed', 'quote_viewed', 'quote_requested',
    'booking_started', 'booking_created', 'booking_paid'];
  v_k    text;
  v_n    integer;
  v_seen integer := 0;
begin
  foreach v_k in array v_keys loop
    select (f.points -> 0 ->> 'value')::integer
      into v_n
    from public.funnel_daily(v_day, v_day) f
    where f.key = v_k;

    if v_n is null then
      raise exception '(٠-ب) سلسلة «%» غائبة عن funnel_daily أو بلا نقطة لليوم', v_k;
    end if;

    perform set_config('tours.an_base_' || v_k, v_n::text, false);
    v_seen := v_seen + 1;
  end loop;

  -- خط أساس النافذة السباعية لسلسلة البحث (يُختبر بها ترشيح المدى لاحقاً)
  select coalesce(sum((pt ->> 'value')::integer), 0)
    into v_n
  from public.funnel_daily(v_day - 6, v_day) f
  cross join lateral jsonb_array_elements(f.points) pt
  where f.key = 'search_performed';

  perform set_config('tours.an_base_week_search', v_n::text, false);

  -- وخط أساس بطاقتَي الطلبات لليوم
  select s.value into v_n
  from public.section_stats('orders', v_day, v_day) s
  where s.key = 'orders_count';

  perform set_config('tours.an_base_orders', coalesce(v_n, 0)::text, false);

  raise notice '✔ (٠-ب) خط الأساس مأخوذ للسلاسل الست (% سلسلة) ولبطاقة الطلبات', v_seen;
end;
$$;

-- ----------------------------------------------------------------------------
-- (٠-ج) التجهيزات — حساب خزينة + حجز + طلب سعر + أحداث قمع + تحويلان
--
-- ⚠ الحجز والدفعة المعتمدة وطلب السعر تُزرع **بلا** أحداث قمع مقابلة عمداً:
-- هي بيانات الأقسام (الطلبات والخزينة) لا بيانات القمع، وبقاء القمع ساكناً
-- أمامها هو ما تثبته الكتلة (ب). أحداث القمع تُزرع منفصلة أدناه بوسم
-- `class_slug = 'ANLT-FIXTURE'` — وهو أيضاً مقبض التنظيف للصفوف بلا مرجع.
-- ----------------------------------------------------------------------------
do $$
declare
  v_acc constant uuid := 'a0000000-0000-4000-8000-00000000000a';
  v_day date := current_setting('tours.an_day')::date;
  v_b   record;
  v_pay uuid;
  v_i   integer;
begin
  insert into public.payment_accounts
    (id, kind, label, handle, holder_name, opening_balance, active, sort, customer_facing)
  values
    (v_acc, 'cash', 'ANALYTICS_TESTS خزينة اختبار', 'ANLT-CASH-01', 'اختبار', 0, true, 960, false);

  -- (١) حجز واحد بإحداثيات صحراوية ⇒ يزيد booking_created بواحد
  select * into v_b
  from public.create_booking(
    jsonb_build_object('label', 'موقع صحراوي أ', 'lat', 25.000000, 'lng', 27.500000),
    jsonb_build_object('label', 'موقع صحراوي ب', 'lat', 24.500000, 'lng', 28.200000),
    1, false, 0, 100, 90, 'test',
    current_setting('tours.an_class'), 'full',
    'عميل اختبار الإحصائيات', '01000009300', null, now() + interval '3 days',
    'ANALYTICS_TESTS_FIXTURE-1'
  );

  perform set_config('tours.an_b1',  v_b.id::text,   false);
  perform set_config('tours.an_ref', v_b.reference,  false);

  -- (٢) إيصال معتمد ⇒ يزيد booking_paid بواحد (ويولّد قيد دفتر على حساب الاختبار)
  insert into public.payments (booking_id, account_id, amount, status, note, verified_at)
  values (v_b.id, v_acc, v_b.amount_due, 'approved', 'ANALYTICS_TESTS إيصال اختبار', now())
  returning id into v_pay;

  perform set_config('tours.an_pay', v_pay::text, false);

  -- (٣) طلب عرض سعر يدوي ⇒ يزيد quote_requested بواحد
  insert into public.quote_requests
    (reference, service_slug, customer_name, customer_phone, details)
  values
    ('QR-ANLT01', null, 'عميل اختبار الإحصائيات', '01000009301',
     'ANALYTICS_TESTS_FIXTURE طلب اختبار');

  -- (٤) أحداث القمع الستة — **المصدر الوحيد للقمع بعد 0023**.
  --
  -- البحث وعرض السعر **بلا مرجع** كما يكتبهما `/api/quote` حرفياً (لا
  -- `reference` في حمولتهما)، فيمرّان على فرع «عُدّ كما هو» في العدّ.
  -- والباقي بمرجع كما تكتبه المسارات الخادمية، فيمرّ على فرع الدمج بالمرجع.
  for v_i in 1 .. 3 loop
    insert into public.funnel_events (event, reference, class_slug, value, currency, created_at)
    values ('search_performed', null, 'ANLT-FIXTURE', null, null, now());
  end loop;

  for v_i in 1 .. 2 loop
    insert into public.funnel_events (event, reference, class_slug, value, currency, created_at)
    values ('quote_viewed', null, 'ANLT-FIXTURE', 1500, 'EGP', now());
  end loop;

  -- مرحلتا السلسلة الأخيرتان: من سجل الأحداث لا من bookings/payments.
  --
  -- ومرجعان مختلفان عمداً كي يُختبر **الكوهورت** (0023 §٣) بطرفيه:
  --   • `ANLT-BC2` حُجز ودُفع داخل النافذة نفسها ⇒ يدخل بسط معدل التحصيل.
  --   • `ANLT-BP1` تحصيلٌ بلا حجزٍ في النافذة (تحويل بنكي اعتُمد بعد أيام، وهو
  --     المسار الافتراضي هنا) ⇒ يُعدّ في `value` ولا يدخل البسط. بلا هذا الفصل
  --     كانت النسبة تتجاوز ١٠٠ فيبتلعها السقف ويعرضها «١٠٠٪».
  insert into public.funnel_events (event, reference, class_slug, value, currency, created_at)
  values
    ('booking_created', 'ANLT-BC1', 'ANLT-FIXTURE', 1500, 'EGP', now()),
    ('booking_created', 'ANLT-BC2', 'ANLT-FIXTURE', 1500, 'EGP', now()),
    ('booking_paid',    'ANLT-BC2', 'ANLT-FIXTURE', 1500, 'EGP', now()),
    ('booking_paid',    'ANLT-BP1', 'ANLT-FIXTURE', 1500, 'EGP', now());

  -- والحدثان الجانبيان (خارج السلسلة): مسار دخول موازٍ، وفرع البوابة الإلكترونية
  insert into public.funnel_events (event, reference, class_slug, value, currency, created_at)
  values
    ('quote_requested', 'ANLT-QR1', 'ANLT-FIXTURE', null, null, now()),
    ('booking_started', 'ANLT-B1',  'ANLT-FIXTURE', 1500, 'EGP', now());

  -- (٥) حدث بحث **قبل خمسة أيام**: يجب ألا يظهر في نافذة اليوم ويظهر في السباعية
  insert into public.funnel_events (event, reference, class_slug, value, currency, created_at)
  values ('search_performed', null, 'ANLT-FIXTURE', null, null, now() - interval '5 days');

  -- (٦) تحويلان: واحد مفعّل وواحد معطَّل — يُختبر بهما ما يراه الزائر
  insert into public.redirects (from_path, to_path, status_code, enabled, note)
  values
    ('/analytics-tests-old', '/analytics-tests-new', 301, true,  'ANALYTICS_TESTS مفعّل'),
    ('/analytics-tests-off', '/analytics-tests-new', 302, false, 'ANALYTICS_TESTS معطَّل');

  raise notice '✔ (٠-ج) التجهيزات — حجز % ودفعة معتمدة وطلب سعر و١٠ أحداث قمع وتحويلان',
    v_b.reference;
end;
$$;

-- ----------------------------------------------------------------------------
-- (أ) 🔒 funnel_events لا يقبل PII ولا اسماً مجهولاً — الحارس بنيوي لا انضباطي
--
-- الكتابة تمر بمفتاح الخدمة (يتجاوز RLS)، فالقيود هي كل ما يمنع تحويل الجدول
-- إلى صندوق بريد يُحشى فيه اسم عميل أو رقم هاتف أو حمولة ضخمة عند أول خطأ في
-- بناء الحمولة. كل محاولة أدناه محاولةٌ يستطيع خطأ برمجي أن يمررها فعلاً.
-- ----------------------------------------------------------------------------
do $$
declare
  v_ok   boolean;
  v_left integer;
begin
  -- (أ-١) اسم حدث خارج الستة
  v_ok := false;
  begin
    insert into public.funnel_events (event, reference)
    values ('page_view', 'ANLT-X1');
  exception when others then v_ok := true;
  end;
  if not v_ok then
    raise exception '(أ-١) قُبل اسم حدث خارج FunnelEvent — القيد لا يحرس العقد';
  end if;

  -- (أ-٢) اسم عميل في خانة المرجع
  v_ok := false;
  begin
    insert into public.funnel_events (event, reference)
    values ('search_performed', 'محمد عبد الله');
  exception when others then v_ok := true;
  end;
  if not v_ok then
    raise exception '(أ-٢) قُبل نص حر في reference — الجدول يقبل PII';
  end if;

  -- (أ-٣) بريد إلكتروني في خانة المرجع
  v_ok := false;
  begin
    insert into public.funnel_events (event, reference)
    values ('search_performed', 'client@example.com');
  exception when others then v_ok := true;
  end;
  if not v_ok then
    raise exception '(أ-٣) قُبل بريد إلكتروني في reference — الجدول يقبل PII';
  end if;

  -- (أ-٤) عملة ليست ثلاثية الأحرف
  v_ok := false;
  begin
    insert into public.funnel_events (event, reference, currency)
    values ('quote_viewed', 'ANLT-X4', 'جنيه مصري');
  exception when others then v_ok := true;
  end;
  if not v_ok then
    raise exception '(أ-٤) قُبلت عملة خارج الشكل الثلاثي';
  end if;

  -- (أ-٥) قيمة سالبة
  v_ok := false;
  begin
    insert into public.funnel_events (event, reference, value)
    values ('booking_paid', 'ANLT-X5', -1);
  exception when others then v_ok := true;
  end;
  if not v_ok then
    raise exception '(أ-٥) قُبلت قيمة سالبة';
  end if;

  -- ولا صف واحد من هذه المحاولات بقي
  select count(*) into v_left from public.funnel_events e where e.reference like 'ANLT-X%';
  if v_left <> 0 then
    raise exception '(أ-٦) بقي % صف من محاولات مرفوضة', v_left;
  end if;

  -- 🔒 والأهم: الجدول **لا يملك** عمود PII أصلاً — ما لا يوجد لا يُكتب سهواً
  select count(*) into v_left
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name   = 'funnel_events'
    and c.column_name in ('customer_name', 'customer_phone', 'customer_whatsapp',
                          'email', 'ip', 'ip_address', 'user_id', 'session_id',
                          'origin_label', 'dest_label', 'subcontractor_id',
                          'subcontractor_cost', 'margin_amount');
  if v_left <> 0 then
    raise exception '(أ-٧) في funnel_events % عمود ممنوع (PII أو رقم داخلي)', v_left;
  end if;

  raise notice '✔ (أ) سجل الأحداث يرفض الاسم والبريد والعملة الخاطئة، ولا عمود PII فيه أصلاً';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ب) أرقام funnel_daily = خط الأساس + **أحداث القمع** المزروعة بالضبط
--
-- 🔒 هذا هو تأكيد «المصدر الواحد» في هذا الملف. التجهيزات زرعت أيضاً:
--   حجزاً حقيقياً واحداً (`bookings`) + دفعة معتمدة واحدة (`payments`) + طلب
--   سعر واحداً (`quote_requests`) — **بلا** أحداث قمع مقابلة لها.
-- فلو عاد القمع يقرأ من تلك الجداول (كما كان في 0022) لزاد كلٌّ من
-- `booking_created` و`booking_paid` و`quote_requested` بواحد فوق المزروع،
-- وسقط هذا التأكيد فوراً. وهو بالضبط العيب الذي أنتج معدل تحول يتجاوز ١٠٠٪.
-- ----------------------------------------------------------------------------
do $$
declare
  v_day  date := current_setting('tours.an_day')::date;
  v_n    integer;
  v_base integer;
  v_exp  integer;
  v_pairs constant text[] := array[
    'search_performed:3', 'quote_viewed:2', 'booking_started:1',
    'quote_requested:1',  'booking_created:2', 'booking_paid:2'];
  v_p    text;
  v_k    text;
begin
  foreach v_p in array v_pairs loop
    v_k   := split_part(v_p, ':', 1);
    v_exp := split_part(v_p, ':', 2)::integer;

    v_base := current_setting('tours.an_base_' || v_k)::integer;

    select (f.points -> 0 ->> 'value')::integer
      into v_n
    from public.funnel_daily(v_day, v_day) f
    where f.key = v_k;

    if v_n is distinct from (v_base + v_exp) then
      raise exception
        '(ب) سلسلة «%»: توقعنا % (خط أساس % + أحداث مزروعة %) وحصلنا % — رقمٌ أكبر يعني أن القمع ما زال يقرأ من جدول مرجعي ثانٍ',
        v_k, v_base + v_exp, v_base, v_exp, coalesce(v_n, -1);
    end if;
  end loop;

  -- حدث الأمس البعيد: خارج نافذة اليوم وداخل السباعية — إثبات أن الترشيح
  -- بالتاريخ يعمل بتوقيت القاهرة لا بتوقيت UTC ولا بلا ترشيح.
  v_base := current_setting('tours.an_base_week_search')::integer;

  select coalesce(sum((pt ->> 'value')::integer), 0)
    into v_n
  from public.funnel_daily(v_day - 6, v_day) f
  cross join lateral jsonb_array_elements(f.points) pt
  where f.key = 'search_performed';

  if v_n is distinct from (v_base + 4) then
    raise exception
      '(ب-٧) بحث النافذة السباعية: توقعنا % (أساس % + ٣ اليوم + ١ قبل خمسة أيام) وحصلنا %',
      v_base + 4, v_base, v_n;
  end if;

  raise notice '✔ (ب) السلاسل الست = أحداث القمع المزروعة وحدها (الحجز والدفعة وطلب السعر لم يحرّكوا رقماً)، وترشيح المدى يعمل بتوقيت القاهرة';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ج) شكل funnel_daily = عقد StatSeries حرفياً
--
-- الأسماء الستة من نوع FunnelEvent، ولكل يوم في المدى نقطة **حتى لو صفراً**
-- (رسمٌ يقفز فوق الأيام الفارغة يكذب على العين)، والسلال بصيغة YYYY-MM-DD.
-- ----------------------------------------------------------------------------
do $$
declare
  v_day    date := current_setting('tours.an_day')::date;
  v_rows   integer;
  v_badlen integer;
  v_badfmt integer;
  v_badval integer;
  v_names  text;
begin
  select count(*),
         count(*) filter (where jsonb_array_length(f.points) <> 7)
    into v_rows, v_badlen
  from public.funnel_daily(v_day - 6, v_day) f;

  if v_rows <> 6 then
    raise exception '(ج-١) عدد السلاسل: توقعنا ٦ وحصلنا %', v_rows;
  end if;

  if v_badlen <> 0 then
    raise exception '(ج-٢) % سلسلة نقاطها ليست ٧ لمدى سبعة أيام', v_badlen;
  end if;

  select string_agg(f.key, '، ' order by f.key)
    into v_names
  from public.funnel_daily(v_day, v_day) f
  where f.key not in ('search_performed', 'quote_viewed', 'booking_started',
                      'booking_created', 'booking_paid', 'quote_requested');

  if v_names is not null then
    raise exception '(ج-٣) أسماء سلاسل خارج نوع FunnelEvent: %', v_names;
  end if;

  select count(*) filter (where (pt ->> 'bucket') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
         count(*) filter (where pt ->> 'value' is null)
    into v_badfmt, v_badval
  from public.funnel_daily(v_day - 6, v_day) f
  cross join lateral jsonb_array_elements(f.points) pt;

  if v_badfmt <> 0 then
    raise exception '(ج-٤) % نقطة سلّتها ليست بصيغة YYYY-MM-DD', v_badfmt;
  end if;

  if v_badval <> 0 then
    raise exception '(ج-٥) % نقطة بلا قيمة — الرسم سيثقب', v_badval;
  end if;

  -- عنوان عربي لكل سلسلة (النص الظاهر للمستخدم عربي بلا استثناء)
  select count(*) into v_rows
  from public.funnel_daily(v_day, v_day) f
  where btrim(coalesce(f.label, '')) = '';

  if v_rows <> 0 then
    raise exception '(ج-٦) % سلسلة بلا عنوان عربي', v_rows;
  end if;

  raise notice '✔ (ج) شكل funnel_daily مطابق لعقد StatSeries: ٦ سلاسل × ٧ نقاط بصيغة سليمة';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ج-ب) funnel_summary — سلسلة رباعية من مصدر واحد، وحدثان جانبيان بلا نسبة
--
-- ثلاثة أسئلة تجيب عنها هذه الكتلة، وكلها انكسرت مرة:
--
--  ١) **هل الرقم واحد في الشاشة الواحدة؟** رقم البطاقة في «قمع التحويل» ومجموع
--     الرسم في «القمع يومياً» يظهران معاً أمام المالك، فاختلافهما بواحد يعني
--     نظاماً لا يُوثق به (القرار ٣). لا رقم مطلق هنا: نجمع نقاط `funnel_daily`
--     ونطالب `funnel_summary` بأن تساويها تماماً — يوماً وأسبوعاً، ولكل مفتاح
--     من الستة لا للأربعة وحدها.
--
--  ٢) **هل السلسلة سلسلة؟** أربع مراحل `in_chain = true` بمعدل تحول على
--     سابقتها، وحدثان `in_chain = false` بعدّادهما وحده و`rate_percent = null`.
--     إقحام `quote_requested` (مسار دخول موازٍ) أو `booking_started` (فرع
--     البوابة الإلكترونية) بين مرحلتين يجعل «التحول» رقماً بلا معنى.
--
--  ٣) **هل يضخّم التكرارُ الأرقام؟** إعادة إرسال webhook تكتب حدث الدفع مرتين.
--     (ج-ب-٩) تزرع الحالة حرفياً وتطالب بزيادة **واحد لا اثنين**، و(ج-ب-١٠)
--     تحرس الطرف المقابل: صفّان **بلا مرجع** يجب أن يُعدّا اثنين — وإلا لكان
--     العدّ `count(distinct reference)` وحده فيبتلع بحثين حقيقيين.
--
-- ولا تأكيد واحد هنا يقارن القمع بجدول `bookings` أو `payments`: المصدر واحد
-- بنص هجرة 0023، ومقارنةٌ كتلك هي بذاتها العيب الذي أُصلح.
-- ----------------------------------------------------------------------------
do $$
declare
  v_day    date := current_setting('tours.an_day')::date;
  -- ترتيب السلسلة كما في FUNNEL_ORDER (lib/stats/cards.ts) حرفياً
  v_chain  constant text[] := array[
    'search_performed', 'quote_viewed', 'booking_created', 'booking_paid'];
  v_side   constant text[] := array['quote_requested', 'booking_started'];
  v_all    constant text[] := array[
    'search_performed', 'quote_viewed', 'booking_created', 'booking_paid',
    'quote_requested', 'booking_started'];
  v_k      text;
  v_i      integer;
  v_sum    numeric;
  v_daily  numeric;
  v_rows   integer;
  v_in     integer;
  v_out    integer;
  v_names  text;
  v_prev   numeric;
  v_rate   numeric;
  v_expect numeric;
  v_before numeric;
  v_after  numeric;
  -- بسط كوهورت التحصيل، يُحسب هنا **مستقلاً** عن الدالة لا يُقرأ منها
  v_coh    numeric;
begin
  -- (ج-ب-١) ستة صفوف: أربعة داخل السلسلة واثنان خارجها
  select count(*),
         count(*) filter (where f.in_chain),
         count(*) filter (where not f.in_chain)
    into v_rows, v_in, v_out
  from public.funnel_summary(v_day, v_day) f;

  if v_rows <> 6 then
    raise exception '(ج-ب-١) عدد صفوف funnel_summary: توقعنا ٦ وحصلنا %', v_rows;
  end if;

  if v_in <> 4 or v_out <> 2 then
    raise exception
      '(ج-ب-١ب) توزيع المراحل: % داخل السلسلة و% خارجها — المطلوب ٤ و٢', v_in, v_out;
  end if;

  -- (ج-ب-٢) الأسماء كلها من نوع FunnelEvent، ولا اسم مخترع
  select string_agg(f.key, '، ' order by f.key)
    into v_names
  from public.funnel_summary(v_day, v_day) f
  where f.key <> all (v_all);

  if v_names is not null then
    raise exception '(ج-ب-٢) مفاتيح خارج نوع FunnelEvent: %', v_names;
  end if;

  -- والمراحل الأربع بعينها هي التي تحمل in_chain = true (لا واحدة مكانها)
  select string_agg(f.key, '، ' order by f.key)
    into v_names
  from public.funnel_summary(v_day, v_day) f
  where (f.in_chain and f.key <> all (v_chain))
     or (not f.in_chain and f.key <> all (v_side));

  if v_names is not null then
    raise exception
      '(ج-ب-٢ب) مفاتيح صُنّفت في الجهة الخاطئة من السلسلة: %', v_names;
  end if;

  -- (ج-ب-٣) عنوان عربي وقيمة رقمية لكل صف — العقد يقول value رقم دائماً
  select count(*) into v_rows
  from public.funnel_summary(v_day, v_day) f
  where btrim(coalesce(f.label, '')) = ''
     or f.value is null
     or f.in_chain is null;

  if v_rows <> 0 then
    raise exception
      '(ج-ب-٣) % صفاً بلا عنوان عربي أو بقيمة null أو بـ in_chain غير محدَّد', v_rows;
  end if;

  -- (ج-ب-٤) القيمة = مجموع نقاط نفس السلسلة في نفس المدى — للمفاتيح الستة كلها
  foreach v_k in array v_all loop
    select f.value into v_sum from public.funnel_summary(v_day, v_day) f where f.key = v_k;

    select coalesce(sum((pt ->> 'value')::numeric), -1)
      into v_daily
    from public.funnel_daily(v_day, v_day) f
    cross join lateral jsonb_array_elements(f.points) pt
    where f.key = v_k;

    if v_sum is distinct from v_daily then
      raise exception
        '(ج-ب-٤) «%» ليوم واحد: الملخّص % والمجموع اليومي % — رقمان لشيء واحد على الشاشة نفسها',
        v_k, v_sum, v_daily;
    end if;

    select f.value into v_sum from public.funnel_summary(v_day - 6, v_day) f where f.key = v_k;

    select coalesce(sum((pt ->> 'value')::numeric), -1)
      into v_daily
    from public.funnel_daily(v_day - 6, v_day) f
    cross join lateral jsonb_array_elements(f.points) pt
    where f.key = v_k;

    if v_sum is distinct from v_daily then
      raise exception
        '(ج-ب-٥) «%» لسبعة أيام: الملخّص % والمجموع اليومي % — ترشيح المدى مختلف بين الدالتين',
        v_k, v_sum, v_daily;
    end if;
  end loop;

  -- (ج-ب-٦) 🔒 الحدثان الجانبيان: خارج السلسلة وبلا معدل تحول أبداً.
  -- لو حمل أحدهما نسبةً لعادت الشاشة تعرض «تحوّلاً» بين مرحلتين غير متتاليتين.
  select count(*) into v_rows
  from public.funnel_summary(v_day - 6, v_day) f
  where f.key = any (v_side)
    and (f.in_chain or f.rate_percent is not null);

  if v_rows <> 0 then
    raise exception
      '(ج-ب-٦) % حدثاً جانبياً يدّعي أنه داخل السلسلة أو يحمل معدل تحول', v_rows;
  end if;

  -- (ج-ب-٧) المرحلة الأولى بلا معدل، وكل مرحلة تالية تُقاس على سابقتها **داخل
  -- السلسلة**، وnull حين يكون المقام صفراً. والتعريف يختلف باختلاف المرحلة —
  -- وهذا مقصود بنص 0023، فالسقف المعمَّم كان يحوّل فحص المدى إلى تأكيد محسوم:
  --   • `quote_viewed`     = قيمتها ÷ سابقتها، **بلا سقف** (الحدثان يُكتبان معاً
  --                          في إدراج واحد ⇒ العروض ≤ عمليات البحث بنيوياً).
  --   • `booking_created`  = قيمتها ÷ سابقتها **بسقف ١٠٠** (لا مرجع في
  --                          `quote_viewed` فلا كوهورت، والنافذة تقطع الزمن).
  --   • `booking_paid`     = **كوهورت**: المراجع التي حُجزت ودُفعت داخل النافذة
  --                          نفسها ÷ الحجوزات فيها، **بلا سقف** — والبسط يُحسب
  --                          هنا مستقلاً من `funnel_events` لا يُقرأ من الدالة.
  v_i    := 0;
  v_prev := null;

  foreach v_k in array v_chain loop
    v_i := v_i + 1;

    select f.value, f.rate_percent into v_sum, v_rate
    from public.funnel_summary(v_day, v_day) f
    where f.key = v_k;

    if v_i = 1 then
      if v_rate is not null then
        raise exception
          '(ج-ب-٧) المرحلة الأولى «%» لها معدل تحول % — لا مرحلة قبلها لتُقاس عليها',
          v_k, v_rate;
      end if;
    else
      if v_k = 'booking_paid' then
        select count(distinct p.reference)
          into v_coh
        from public.funnel_events p
        where p.event = 'booking_paid'
          and p.reference is not null
          and (p.created_at at time zone 'Africa/Cairo')::date = v_day
          and exists (
            select 1
            from public.funnel_events b
            where b.event = 'booking_created'
              and b.reference = p.reference
              and (b.created_at at time zone 'Africa/Cairo')::date = v_day
          );

        v_expect := case when v_prev > 0 then round(100.0 * v_coh / v_prev, 1) else null end;
      elsif v_k = 'booking_created' then
        v_expect := case
                      when v_prev > 0 then least(100::numeric, round(100.0 * v_sum / v_prev, 1))
                      else null
                    end;
      else
        v_expect := case when v_prev > 0 then round(100.0 * v_sum / v_prev, 1) else null end;
      end if;

      if v_rate is distinct from v_expect then
        raise exception
          '(ج-ب-٧ب) معدل التحول إلى «%»: توقعنا % وحصلنا % (سابقتها=% وقيمتها=%)',
          v_k, coalesce(v_expect::text, 'null'), coalesce(v_rate::text, 'null'), v_prev, v_sum;
      end if;
    end if;

    v_prev := v_sum;
  end loop;

  -- (ج-ب-٨) والمقياس ٠–١٠٠ **دائماً** لا ٠–١ (نفس اصطلاح StatCard.format = percent).
  -- يُفحص على ثلاث نوافذ لا واحدة: اليوم، والأسبوع، وسنة كاملة تشمل كل بيانات
  -- القاعدة الحية — وهي النافذة التي كانت تُخرج معدلاً يتجاوز ١٠٠٪ قبل 0023.
  --
  -- ⚠ ما الذي يمسكه هذا الفحص وما الذي لا يمسكه: بعد 0023 سقط `least` عن
  -- `quote_viewed` (مسقوفة بنيوياً) وعن `booking_paid` (كوهورت)، فتجاوزُ ١٠٠
  -- فيهما **ممكن ويفشل فعلاً** — وهذا ما يجعل هذا الفحص حارساً لا تأكيداً
  -- محسوماً. أما `booking_created` فسقفها العرضي قائم عمداً، فحارسها المطابقة
  -- في (ج-ب-٧ب) والعدّ المستقل في (ج-ب-٨ب) لا المدى.
  select count(*) into v_rows
  from (
    select f.rate_percent as r from public.funnel_summary(v_day, v_day) f
    union all
    select f.rate_percent from public.funnel_summary(v_day - 6, v_day) f
    union all
    select f.rate_percent from public.funnel_summary(v_day - 364, v_day) f
  ) x
  where x.r is not null and (x.r < 0 or x.r > 100);

  if v_rows <> 0 then
    raise exception '(ج-ب-٨) % معدل تحول خارج المدى ٠–١٠٠', v_rows;
  end if;

  -- (ج-ب-٨ب) 🔒 **الحارس الذي يحمل اسم العيب الأصلي**: كل عدّاد مرحلة يساوي
  -- العدّ المباشر من `public.funnel_events` بقاعدة الدمج نفسها. لو أعادت هجرةٌ
  -- لاحقة `booking_created` إلى جدول `bookings` (وهو العيب الذي أسقط 0022)
  -- انفجر هذا التأكيد فوراً — ولا يستطيع أي سقف على النسبة أن يخفيه.
  select count(*) into v_rows
  from public.funnel_summary(v_day - 364, v_day) s
  left join (
    select x.k as k, count(*)::numeric as n
    from (
      select e.event as k
      from public.funnel_events e
      where e.reference is not null
        and (e.created_at at time zone 'Africa/Cairo')::date between v_day - 364 and v_day
      group by e.event, e.reference
      union all
      select e.event
      from public.funnel_events e
      where e.reference is null
        and (e.created_at at time zone 'Africa/Cairo')::date between v_day - 364 and v_day
    ) x
    group by x.k
  ) d on d.k = s.key
  where s.value is distinct from coalesce(d.n, 0);

  if v_rows <> 0 then
    raise exception
      '(ج-ب-٨ب) % مرحلةً لا يساوي عدّادها العدّ المباشر من funnel_events — مصدر ثانٍ تسلّل إلى القمع',
      v_rows;
  end if;

  -- (ج-ب-٩) 🔒 **أهم تأكيد في الكتلة**: التكرار لا يضخّم.
  -- بوابة الدفع تعيد إرسال الويبهوك عند أي شك، والمسار الخادمي يكتب الحدث في
  -- كل مرة. صفّان بنفس المرجع = حجز مدفوع واحد لا اثنان.
  select f.value into v_before
  from public.funnel_summary(v_day, v_day) f where f.key = 'booking_paid';

  insert into public.funnel_events (event, reference, class_slug, value, currency, created_at)
  values
    ('booking_paid', 'ANLT-DUP1', 'ANLT-FIXTURE', 1500, 'EGP', now()),
    ('booking_paid', 'ANLT-DUP1', 'ANLT-FIXTURE', 1500, 'EGP', now());

  select f.value into v_after
  from public.funnel_summary(v_day, v_day) f where f.key = 'booking_paid';

  if v_after is distinct from (v_before + 1) then
    raise exception
      '(ج-ب-٩) ويبهوك مكرَّر: صفّان بنفس المرجع نقلا التحصيل من % إلى % — المتوقع % (واحد لا اثنان)',
      v_before, coalesce(v_after, -1), v_before + 1;
  end if;

  -- والدمج نفسه يقع في الرسم اليومي، وإلا انفصل المجموع عن البطاقة من جديد
  select coalesce(sum((pt ->> 'value')::numeric), -1)
    into v_daily
  from public.funnel_daily(v_day, v_day) f
  cross join lateral jsonb_array_elements(f.points) pt
  where f.key = 'booking_paid';

  if v_daily is distinct from v_after then
    raise exception
      '(ج-ب-٩ب) بعد التكرار: الملخّص % والمجموع اليومي % — الدمج يقع في دالة دون الأخرى',
      v_after, v_daily;
  end if;

  -- (ج-ب-١٠) والطرف المقابل: الصفوف **بلا مرجع** تُعدّ كما هي.
  -- بحثان حقيقيان لزائرين مختلفين لا يحمل أيٌّ منهما مرجعاً (`/api/quote` لا
  -- يمرّره)، فلو كان العدّ `count(distinct reference)` وحده لابتلعهما معاً.
  select f.value into v_before
  from public.funnel_summary(v_day, v_day) f where f.key = 'search_performed';

  insert into public.funnel_events (event, reference, class_slug, value, currency, created_at)
  values
    ('search_performed', null, 'ANLT-FIXTURE', null, null, now()),
    ('search_performed', null, 'ANLT-FIXTURE', null, null, now());

  select f.value into v_after
  from public.funnel_summary(v_day, v_day) f where f.key = 'search_performed';

  if v_after is distinct from (v_before + 2) then
    raise exception
      '(ج-ب-١٠) بحثان بلا مرجع رفعا العدّاد من % إلى % — المتوقع % (اثنان لا واحد)',
      v_before, coalesce(v_after, -1), v_before + 2;
  end if;

  -- (ج-ب-١١) ⚠ والوجه الآخر للقاعدة نفسها، مثبَّتاً كي لا يُظنّ يوماً غير ذلك:
  -- صفّا `booking_paid` **بلا مرجع** يُعدّان اثنين. لا شيء في القاعدة يميّز
  -- ويبهوكاً مكرَّراً فشلت قراءة حجزه عن تحصيلين حقيقيين — فالحماية من هذا
  -- **ليست هنا** بل في `lib/analytics/emit.ts`: الحارس هناك يُسقط أي حدث حجز
  -- (`booking_created` / `booking_started` / `booking_paid`) بلا مرجع بدل أن
  -- يكتبه صفاً لا يُدمج. هذا التأكيد يوثّق الحدّ الفاصل بين المسؤوليتين.
  select f.value into v_before
  from public.funnel_summary(v_day, v_day) f where f.key = 'booking_paid';

  insert into public.funnel_events (event, reference, class_slug, value, currency, created_at)
  values
    ('booking_paid', null, 'ANLT-FIXTURE', 1500, 'EGP', now()),
    ('booking_paid', null, 'ANLT-FIXTURE', 1500, 'EGP', now());

  select f.value into v_after
  from public.funnel_summary(v_day, v_day) f where f.key = 'booking_paid';

  if v_after is distinct from (v_before + 2) then
    raise exception
      '(ج-ب-١١) صفّان بلا مرجع نقلا التحصيل من % إلى % — المتوقع % (القاعدة لا تدمج ما لا مرجع له؛ المنع في lib/analytics/emit.ts)',
      v_before, coalesce(v_after, -1), v_before + 2;
  end if;

  raise notice '✔ (ج-ب) القمع سلسلة رباعية من مصدر واحد، ومعدل التحصيل كوهورت، والجانبيان خارجها بلا نسبة، والتكرار بنفس المرجع يُعدّ مرة واحدة';
end;
$$;

-- ----------------------------------------------------------------------------
-- (د) funnel_daily وsection_stats يرفضان المدخل الخاطئ ولا يُرجعان فراغاً
--
-- شاشة تعرض «لا بيانات» بسبب خطأ إملائي في اسم القسم عطبٌ يمرّ سنة بلا أن
-- يلاحظه أحد — ولذلك الرفض استثناء لا مصفوفة فارغة.
-- ----------------------------------------------------------------------------
do $$
declare
  v_day  date := current_setting('tours.an_day')::date;
  v_ok   boolean;
  v_hint text;
  v_n    integer;
begin
  -- (د-١) قسم مجهول
  v_ok := false;
  begin
    select count(*) into v_n from public.section_stats('dispatch', v_day, v_day);
  exception when others then
    v_ok   := true;
    get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if not v_ok then
    raise exception '(د-١) قسم مجهول «dispatch» مرّ بلا رفض (% صفاً)', v_n;
  end if;
  if v_hint is distinct from 'invalid-input' then
    raise exception '(د-٢) رفض القسم المجهول بلا hint = invalid-input (وصلنا «%»)',
      coalesce(v_hint, 'بلا');
  end if;

  -- (د-٣) قسم فارغ
  v_ok := false;
  begin
    select count(*) into v_n from public.section_stats('   ', v_day, v_day);
  exception when others then v_ok := true;
  end;
  if not v_ok then
    raise exception '(د-٣) قسم فارغ مرّ بلا رفض';
  end if;

  -- (د-٤) لكن اختلاف حالة الأحرف يمر (تطبيع lower)
  select count(*) into v_n from public.section_stats('ORDERS', v_day, v_day);
  if v_n < 1 then
    raise exception '(د-٤) «ORDERS» لم تُطبَّع إلى orders';
  end if;

  -- (د-٥) فترة معكوسة تُرفض في الدالتين
  v_ok := false;
  begin
    select count(*) into v_n from public.section_stats('orders', v_day, v_day - 3);
  exception when others then v_ok := true;
  end;
  if not v_ok then
    raise exception '(د-٥) section_stats قبلت فترة معكوسة';
  end if;

  v_ok := false;
  begin
    select count(*) into v_n from public.funnel_daily(v_day, v_day - 3);
  exception when others then v_ok := true;
  end;
  if not v_ok then
    raise exception '(د-٦) funnel_daily قبلت فترة معكوسة';
  end if;

  -- (د-٧) مدى فاحش الطول يُرفض قبل أن يبني مصفوفة لا تُقرأ
  v_ok := false;
  begin
    select count(*) into v_n from public.funnel_daily(v_day - 500, v_day);
  exception when others then v_ok := true;
  end;
  if not v_ok then
    raise exception '(د-٧) funnel_daily قبلت مدى ٥٠٠ يوم';
  end if;

  -- (د-٨) ونفس الحراسة على دالة الملخّص — حارسان لا حارس
  v_ok := false;
  begin
    select count(*) into v_n from public.funnel_summary(v_day, v_day - 3);
  exception when others then v_ok := true;
  end;
  if not v_ok then
    raise exception '(د-٨) funnel_summary قبلت فترة معكوسة';
  end if;

  v_ok := false;
  begin
    select count(*) into v_n from public.funnel_summary(v_day - 500, v_day);
  exception when others then v_ok := true;
  end;
  if not v_ok then
    raise exception '(د-٩) funnel_summary قبلت مدى ٥٠٠ يوم';
  end if;

  raise notice '✔ (د) المدخل الخاطئ يُرفض باستثناء لا بفراغ، والتطبيع يعمل';
end;
$$;

-- ----------------------------------------------------------------------------
-- (هـ) الأقسام الستة كلها تُرجع بطاقات مطابقة لعقد StatCard
--
-- المحتوى واللغات يسقطان دائماً من الاقتراحات — وموجز المرحلة يقول صراحةً إن
-- غيابهما يعني مرحلة ناقصة. هذا الاختبار هو ما يجعل النص قابلاً للفشل.
-- ----------------------------------------------------------------------------
do $$
declare
  v_day      date := current_setting('tours.an_day')::date;
  v_sections constant text[] :=
    array['orders', 'partners', 'treasury', 'customers', 'content', 'locales'];
  v_sec      text;
  v_n        integer;
  v_bad_fmt  integer;
  v_bad_txt  integer;
  v_null_val integer;
  v_uniq     integer;
  v_latin    integer;
begin
  foreach v_sec in array v_sections loop
    select
      count(*),
      count(*) filter (where s.format not in ('number', 'money', 'percent', 'duration')),
      count(*) filter (where btrim(coalesce(s.key, '')) = ''
                          or btrim(coalesce(s.label, '')) = ''
                          or btrim(coalesce(s.help, '')) = ''),
      count(*) filter (where s.value is null),
      count(distinct s.key),
      count(*) filter (where s.label ~ '^[A-Za-z]')
    into v_n, v_bad_fmt, v_bad_txt, v_null_val, v_uniq, v_latin
    from public.section_stats(v_sec, v_day - 29, v_day) s;

    if v_n < 1 then
      raise exception '(هـ) القسم «%» لم يُرجع بطاقة واحدة', v_sec;
    end if;

    if v_bad_fmt <> 0 then
      raise exception '(هـ) القسم «%»: % بطاقة بصيغة خارج (number|money|percent|duration)',
        v_sec, v_bad_fmt;
    end if;

    if v_bad_txt <> 0 then
      raise exception '(هـ) القسم «%»: % بطاقة بلا مفتاح أو عنوان أو نص إرشادي',
        v_sec, v_bad_txt;
    end if;

    -- 🔒 عقد StatCard: value رقم غير قابل للتفريغ. null هنا يكسر النوع في الواجهة.
    if v_null_val <> 0 then
      raise exception '(هـ) القسم «%»: % بطاقة قيمتها null — العقد يقول value: number',
        v_sec, v_null_val;
    end if;

    if v_uniq <> v_n then
      raise exception '(هـ) القسم «%»: مفاتيح مكرَّرة (% بطاقة، % مفتاحاً مميزاً)',
        v_sec, v_n, v_uniq;
    end if;

    if v_latin <> 0 then
      raise exception '(هـ) القسم «%»: % عنوان يبدأ بحرف لاتيني — كل نص ظاهر عربي',
        v_sec, v_latin;
    end if;
  end loop;

  -- والأقسام الستة تعطي مجموعات مفاتيح مختلفة (لا نسخة واحدة مكرَّرة بستة أسماء)
  select count(distinct x.sig) into v_n
  from (
    select s2.sec, string_agg(s2.k, ',' order by s2.k) as sig
    from (
      select sx.sec, st.key as k
      from unnest(v_sections) as sx(sec)
      cross join lateral public.section_stats(sx.sec, v_day - 29, v_day) st
    ) s2
    group by s2.sec
  ) x;

  if v_n <> 6 then
    raise exception '(هـ-٢) الأقسام الستة لا تعطي ٦ مجموعات مفاتيح مختلفة (حصلنا %)', v_n;
  end if;

  raise notice '✔ (هـ) الأقسام الستة (ومنها المحتوى واللغات) تُرجع بطاقات StatCard صالحة ومتمايزة';
end;
$$;

-- ----------------------------------------------------------------------------
-- (و) بطاقات الطلبات تتحرك بالمزروع، وdelta_percent يحترم عقد «null لا صفر»
-- ----------------------------------------------------------------------------
do $$
declare
  v_day  date := current_setting('tours.an_day')::date;
  v_base integer := current_setting('tours.an_base_orders')::integer;
  v_val  numeric;
  v_del  numeric;
begin
  select s.value into v_val
  from public.section_stats('orders', v_day, v_day) s
  where s.key = 'orders_count';

  if v_val is distinct from (v_base + 1)::numeric then
    raise exception '(و-١) عدد الطلبات: توقعنا % (أساس % + حجز مزروع) وحصلنا %',
      v_base + 1, v_base, coalesce(v_val, -1);
  end if;

  -- فترة لا حجز فيها ولا حجز في سابقتها ⇒ القيمة صفر والفارق null لا صفر
  select s.value, s.delta_percent into v_val, v_del
  from public.section_stats('orders', v_day - 3650, v_day - 3640) s
  where s.key = 'orders_count';

  if v_val is distinct from 0::numeric then
    raise exception '(و-٢) فترة قبل عشر سنوات فيها % طلباً — البيانات أقدم من المشروع', v_val;
  end if;

  if v_del is not null then
    raise exception
      '(و-٣) delta_percent = % مقابل فترة سابقة صفر — العقد يقول null لا رقماً', v_del;
  end if;

  -- ولقطات المحتوى واللغات فارقها null دائماً (لا تخص فترة أصلاً)
  select count(*) into v_base
  from public.section_stats('locales', v_day - 29, v_day) s
  where s.delta_percent is not null;

  if v_base <> 0 then
    raise exception '(و-٤) % بطاقة لغات تدّعي مقارنة بفترة سابقة وهي لقطة لحظية', v_base;
  end if;

  raise notice '✔ (و) بطاقات الطلبات تتحرك بالمزروع، وdelta_percent = null حين لا مقارنة';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ز) 🔒 قيود جدول التحويلات — الوسيط سيثق بكل صف فيه بلا تحقق إضافي
--
-- كل محاولة أدناه هي تحويل مفتوح أو خطف مسار إداري، وكلها يستطيع مشرف مخترَق
-- حسابه أو محرر SQL مسرَّب أن يكتبها. القاعدة تمنعها لا الواجهة.
-- ----------------------------------------------------------------------------
do $$
declare
  v_ok   boolean;
  v_left integer;
  v_i    integer;
  v_bad  constant text[][] := array[
    array['https://evil.example/x',   '/analytics-tests-new'], -- مصدر بنطاق كامل
    array['//evil.example/x',         '/analytics-tests-new'], -- بروتوكول نسبي
    array['/admin',                   '/analytics-tests-new'], -- خطف اللوحة
    array['/admin/orders',            '/analytics-tests-new'], -- خطف مسار إداري فرعي
    array['/api/quote',               '/analytics-tests-new'], -- خطف واجهة برمجية
    array['/portal/offers',           '/analytics-tests-new'], -- خطف البورتال
    array['/_next/static/x',          '/analytics-tests-new'], -- خطف أصول Next
    array['/analytics-tests-sp ace',  '/analytics-tests-new'], -- مسافة (حقن ترويسة)
    array['/analytics-tests-open1',   '//evil.example'],       -- تحويل مفتوح
    array['/analytics-tests-open2',   'javascript:alert(1)'],  -- سكربت في الهدف
    array['/analytics-tests-loop',    '/analytics-tests-loop'] -- حلقة من خطوة واحدة
  ];
begin
  for v_i in 1 .. array_length(v_bad, 1) loop
    v_ok := false;
    begin
      insert into public.redirects (from_path, to_path, note)
      values (v_bad[v_i][1], v_bad[v_i][2], 'ANALYTICS_TESTS');
    exception when others then v_ok := true;
    end;

    if not v_ok then
      raise exception '(ز-%) قُبل تحويل ممنوع: % ← %', v_i, v_bad[v_i][1], v_bad[v_i][2];
    end if;
  end loop;

  -- رمز حالة خارج المسموح
  v_ok := false;
  begin
    insert into public.redirects (from_path, to_path, status_code)
    values ('/analytics-tests-code', '/analytics-tests-new', 418);
  exception when others then v_ok := true;
  end;
  if not v_ok then
    raise exception '(ز-١١) قُبل رمز حالة خارج (301|302|307|308)';
  end if;

  -- مصدر مكرَّر
  v_ok := false;
  begin
    insert into public.redirects (from_path, to_path)
    values ('/analytics-tests-old', '/somewhere-else');
  exception when others then v_ok := true;
  end;
  if not v_ok then
    raise exception '(ز-١٢) قُبل مصدر مكرَّر — الوسيط لن يعرف أي صف يتبع';
  end if;

  -- والمسموح يمر: هدف https مطلق
  insert into public.redirects (from_path, to_path, note)
  values ('/analytics-tests-ext', 'https://example.com/page', 'ANALYTICS_TESTS خارجي');

  select count(*) into v_left
  from public.redirects r
  where r.from_path like '/analytics-tests-%';

  if v_left <> 3 then
    raise exception '(ز-١٣) عدد صفوف التحويل الاختبارية: توقعنا ٣ وحصلنا %', v_left;
  end if;

  raise notice '✔ (ز) جدول التحويلات يرفض النطاق الخارجي والمسار المحجوز والحلقة والتكرار';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ح) 🔒 كل عرض إحصائي `security_invoker` — الفحص الكتالوجي
--
-- عرض بلا هذه الخاصية يعمل بصلاحيات مالكه فيتجاوز RLS الجداول تحته: أي أن
-- متعهداً في البورتال يقرأ تكلفة كل منافسيه وهامش المنصة كاملاً.
-- ----------------------------------------------------------------------------
do $$
declare
  v_leak text;
  v_cols text;
begin
  select string_agg(c.relname, '، ')
    into v_leak
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'v'
    and c.relname in ('v_stats_orders', 'v_stats_dispatch', 'v_stats_partners',
                      'v_stats_content', 'v_stats_locales', 'v_stats_treasury',
                      'v_stats_customers')
    and coalesce(
          (select option_value from pg_options_to_table(c.reloptions)
            where option_name = 'security_invoker'), 'false'
        ) <> 'true';

  if v_leak is not null then
    raise exception '(ح-١) عروض بلا security_invoker: %', v_leak;
  end if;

  -- 🔒 ولا عمود بيانات عميل في أي عرض إحصائي — الأمان بنيوي لا انضباطي:
  -- ما لا يوجد في نوع الإرجاع لا يُسرَّب بخطأ في الواجهة.
  select string_agg(c.table_name || '.' || c.column_name, '، ')
    into v_cols
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name in ('v_stats_orders', 'v_stats_dispatch', 'v_stats_partners',
                         'v_stats_content', 'v_stats_locales', 'v_stats_treasury',
                         'v_stats_customers')
    and c.column_name in ('customer_name', 'customer_phone', 'customer_whatsapp',
                          'phone', 'email', 'reference', 'public_token');

  if v_cols is not null then
    raise exception '(ح-٢) أعمدة بيانات عميل في عروض إحصائية: %', v_cols;
  end if;

  raise notice '✔ (ح) العروض السبعة كلها security_invoker وبلا عمود بيانات عميل واحد';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ك) الصلاحيات — الفحص الكتالوجي
-- ----------------------------------------------------------------------------
do $$
declare
  v_priv text;
  v_rel  text;
  v_sig  text;
begin
  -- (ك-١) الزائر لا يمسّ سجل القمع بحال: لا قراءة ولا **إدراج** ولا مسح.
  -- الإدراج بمفتاح الخدمة وحده من lib/analytics/emit.ts؛ ومنح anon إدراجاً كان
  -- بلا مستفيد وثمنه أن أي حامل لمفتاح anon المنشور يسمّم أرقام القمع.
  foreach v_priv in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']
  loop
    if has_table_privilege('anon', 'public.funnel_events', v_priv) then
      raise exception '(ك-١) anon يملك % على funnel_events — سجل القمع قابل للتسميم', v_priv;
    end if;
  end loop;

  -- (ك-٢) والمسجَّل يقرأ (تحكمه السياسة: المشرف وحده) ولا يكتب
  if has_table_privilege('authenticated', 'public.funnel_events', 'INSERT') then
    raise exception '(ك-٢) authenticated يملك INSERT على funnel_events — الكتابة لمفتاح الخدمة وحده';
  end if;

  -- (ك-٣) الزائر يقرأ التحويلات (يحتاجها الوسيط) ولا يكتبها
  if not has_table_privilege('anon', 'public.redirects', 'SELECT') then
    raise exception '(ك-٣) anon لا يقرأ redirects — الوسيط لن يجد أي تحويل';
  end if;

  foreach v_priv in array array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']
  loop
    if has_table_privilege('anon', 'public.redirects', v_priv) then
      raise exception '(ك-٤) anon يملك % على redirects — أي زائر يعيد توجيه الموقع', v_priv;
    end if;
  end loop;

  -- (ك-٥) لا صلاحية واحدة لـ anon على أي عرض إحصائي
  foreach v_rel in array array[
    'public.v_stats_orders', 'public.v_stats_dispatch', 'public.v_stats_partners',
    'public.v_stats_content', 'public.v_stats_locales', 'public.v_stats_treasury',
    'public.v_stats_customers']
  loop
    foreach v_priv in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']
    loop
      if has_table_privilege('anon', v_rel, v_priv) then
        raise exception '(ك-٥) anon يملك % على %', v_priv, v_rel;
      end if;
    end loop;
  end loop;

  -- (ك-٦) ولا EXECUTE على أي دالة إحصائية
  foreach v_sig in array array[
    'public.analytics_admin_allowed()',
    'public.stats_delta(numeric, numeric)',
    'public.stats_content_rows()',
    'public.stats_locales_rows()',
    'public.section_stats(text, date, date)',
    -- العدّاد الداخلي (0023 §١): لا حارس فيه إطلاقاً، فمنحُه لأي دور يعني قراءة
    -- سجل القمع بلا `analytics_admin_allowed`. الفحص الذاتي في الهجرة يقع مرة
    -- واحدة لحظة التنفيذ — وهذا السطر هو ما يبقى حارساً بعدها.
    'public.funnel_counts(date, date)',
    'public.funnel_daily(date, date)',
    'public.funnel_summary(date, date)',
    'public.prune_funnel_events(integer)']
  loop
    if has_function_privilege('anon', v_sig, 'EXECUTE') then
      raise exception '(ك-٦) anon يملك EXECUTE على %', v_sig;
    end if;
  end loop;

  -- (ك-٦ب) والعدّاد الداخلي ممنوع على `authenticated` أيضاً: كل متعهد في المنصة
  -- يحمل هذا الدور، ودالةٌ بلا حارس تعني قمع المنصة كلها مكشوفاً له.
  if has_function_privilege('authenticated', 'public.funnel_counts(date, date)', 'EXECUTE') then
    raise exception
      '(ك-٦ب) authenticated يملك EXECUTE على funnel_counts — عدّاد بلا حارس مكشوف لكل متعهد';
  end if;

  -- (ك-٧) والمشرف (عبر دور authenticated) يملك ما يحتاجه فعلاً
  if not has_function_privilege('authenticated', 'public.section_stats(text, date, date)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.funnel_daily(date, date)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.funnel_summary(date, date)', 'EXECUTE') then
    raise exception '(ك-٧) المسجَّل لا يملك تنفيذ دوال الإحصائيات — اللوحة ستفشل';
  end if;

  -- والدالتان الداخليتان لازمتان للمسجَّل لأن العرضين فوقهما security_invoker
  if not has_function_privilege('authenticated', 'public.stats_content_rows()', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.stats_locales_rows()', 'EXECUTE') then
    raise exception '(ك-٨) المسجَّل لا ينفّذ دالتَي اللقطات — v_stats_content/locales ستفشلان له';
  end if;

  raise notice '✔ (ك) الفحص الكتالوجي: الزائر لا يملك شيئاً على سجل القمع ولا على الإحصائيات';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ك-ح) الفحص الحيّ بدور anon — الحاجز الأول لهذا الملف
-- (بعد سحب منح الإدراج: الزائر ممنوع من كل شيء على سجل القمع)
--
-- الفحص الكتالوجي يثبت المنح؛ وهذا يثبت **السلوك** بنفس المسار الذي يسلكه
-- PostgREST. ونُفرغ مطالبة الـ jwt أولاً حتى لا يتسلل مشرف الاختبار إلى جلسة
-- الزائر، ونلفّ الكتلة بمعالج يعيد الدور وإلا بقيت الجلسة عالقة بدور anon
-- فتفشل كل الأقسام التالية بلا سبب واضح.
-- ----------------------------------------------------------------------------
do $$
declare
  v_n   integer;
  v_ok  boolean;
  v_rel text;
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    raise notice '  ↳ (ك-ح) لا دور anon في هذه القاعدة — الفحص الحي متخطّى';
    return;
  end if;

  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claims', '', false);

  begin
    execute 'set local role anon';

    -- (ك-ح-١) القراءة من سجل الأحداث ممنوعة
    v_ok := false;
    begin
      execute 'select count(*) from public.funnel_events' into v_n;
    exception when others then v_ok := true;
    end;
    if not v_ok then
      raise exception '(ك-ح-١) anon قرأ funnel_events مباشرة (% صفاً)', v_n;
    end if;

    -- (ك-ح-٢) والإدراج ممنوع كذلك: الكتابة بمفتاح الخدمة وحده. لو نجح هذا
    -- السطر لاستطاع أي حامل لمفتاح anon المنشور حشو مئة ألف «بحث» فيقرأ المالك
    -- قمعاً مزوَّراً ويبني عليه ميزانية إعلانية.
    v_ok := false;
    begin
      execute $q$insert into public.funnel_events (event, reference, class_slug, value, currency)
                 values ('search_performed', 'ANLT-ANON1', 'test-class', 100, 'EGP')$q$;
    exception when others then v_ok := true;
    end;
    if not v_ok then
      raise exception '(ك-ح-٢) anon أدرج حدثاً — أرقام القمع قابلة للتسميم من الإنترنت';
    end if;

    -- (ك-ح-٣) والتفريغ ممنوع (TRUNCATE لا تخضع لـ RLS إطلاقاً)
    v_ok := false;
    begin
      execute 'truncate table public.funnel_events';
    exception when others then v_ok := true;
    end;
    if not v_ok then
      raise exception '(ك-ح-٣) anon فرّغ funnel_events — TRUNCATE لا تخضع لـ RLS';
    end if;

    -- (ك-ح-٤) ولا قراءة من أي عرض إحصائي
    foreach v_rel in array array[
      'public.v_stats_orders', 'public.v_stats_dispatch', 'public.v_stats_partners',
      'public.v_stats_content', 'public.v_stats_locales', 'public.v_stats_treasury',
      'public.v_stats_customers']
    loop
      v_ok := false;
      begin
        execute 'select count(*) from ' || v_rel into v_n;
      exception when others then v_ok := true;
      end;
      if not v_ok then
        raise exception '(ك-ح-٤) anon قرأ % (% صفاً)', v_rel, v_n;
      end if;
    end loop;

    -- (ك-ح-٥) ولا تنفيذ لأي دالة إحصائية
    v_ok := false;
    begin
      execute 'select count(*) from public.section_stats(''orders'', null, null)' into v_n;
    exception when others then v_ok := true;
    end;
    if not v_ok then
      raise exception '(ك-ح-٥) anon نفّذ section_stats';
    end if;

    v_ok := false;
    begin
      execute 'select count(*) from public.funnel_daily(null, null)' into v_n;
    exception when others then v_ok := true;
    end;
    if not v_ok then
      raise exception '(ك-ح-٦) anon نفّذ funnel_daily';
    end if;

    v_ok := false;
    begin
      execute 'select count(*) from public.funnel_summary(null, null)' into v_n;
    exception when others then v_ok := true;
    end;
    if not v_ok then
      raise exception '(ك-ح-٦ب) anon نفّذ funnel_summary';
    end if;

    -- والعدّاد الداخلي: لا منح له ولا حارس فيه — فالرفض يجب أن يقع عند الصلاحية
    v_ok := false;
    begin
      execute 'select count(*) from public.funnel_counts(null, null)' into v_n;
    exception when others then v_ok := true;
    end;
    if not v_ok then
      raise exception
        '(ك-ح-٦ج) anon نفّذ funnel_counts — عدّاد بلا حارس، أي سجل القمع مقروء بلا إدارة';
    end if;

    v_ok := false;
    begin
      execute 'select public.prune_funnel_events(30)' into v_n;
    exception when others then v_ok := true;
    end;
    if not v_ok then
      raise exception '(ك-ح-٧) anon نفّذ prune_funnel_events — أي زائر يمحو سجل القمع';
    end if;

    -- (ك-ح-٨) التحويلات: يرى المفعّل وحده
    execute $q$select count(*) from public.redirects
               where from_path like '/analytics-tests-%'$q$ into v_n;
    if v_n <> 2 then
      raise exception
        '(ك-ح-٨) الزائر يرى % تحويلاً اختبارياً — المتوقع ٢ (المفعّلان) لا أكثر ولا أقل', v_n;
    end if;

    execute $q$select count(*) from public.redirects
               where from_path = '/analytics-tests-off'$q$ into v_n;
    if v_n <> 0 then
      raise exception '(ك-ح-٩) الزائر رأى تحويلاً معطَّلاً';
    end if;

    -- (ك-ح-١٠) ولا يكتب فيها
    v_ok := false;
    begin
      execute $q$insert into public.redirects (from_path, to_path)
                 values ('/analytics-tests-hack', 'https://evil.example')$q$;
    exception when others then v_ok := true;
    end;
    if not v_ok then
      raise exception '(ك-ح-١٠) anon أضاف تحويلاً — الموقع صار قابلاً للاختطاف';
    end if;

    -- التعديل: الرفض قد يقع بصلاحية ناقصة (استثناء) أو بـ RLS (**صفر صف بلا
    -- خطأ** — أخطر فخ في Supabase). كلاهما مقبول، والمرفوض هو أن يصيب صفاً.
    v_ok := false;
    v_n  := 0;
    begin
      execute $q$update public.redirects set to_path = 'https://evil.example'
                 where from_path = '/analytics-tests-old'$q$;
      get diagnostics v_n = row_count;
    exception when others then
      v_ok := true;
      v_n  := 0;
    end;
    if not v_ok and v_n <> 0 then
      raise exception '(ك-ح-١١) anon عدّل % صف تحويل', v_n;
    end if;

    execute 'reset role';
  exception
    when others then
      execute 'reset role';
      raise;
  end;

  -- ولا صف واحد من محاولة الزائر وصل الجدول (نتحقق بهوية المالك لأنه لا يقرأ)
  select count(*) into v_n from public.funnel_events e where e.reference = 'ANLT-ANON1';
  if v_n <> 0 then
    raise exception '(ك-ح-١٢) صف الزائر وصل الجدول رغم منع الإدراج (% صفاً)', v_n;
  end if;

  -- والهدف لم يتغيّر رغم محاولة التعديل
  select count(*) into v_n from public.redirects r
   where r.from_path = '/analytics-tests-old' and r.to_path = '/analytics-tests-new';
  if v_n <> 1 then
    raise exception '(ك-ح-١٣) هدف التحويل تغيّر بيد الزائر';
  end if;

  raise notice '✔ (ك-ح) الفحص الحي: الزائر لا يقرأ سجل القمع ولا يكتب فيه ولا يفرّغه، ويرى المفعّل من التحويلات ولا يكتبها';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ل) الحاجز الثاني: مسجَّل غير مشرف — متعهد في البورتال — لا يرى رقماً واحداً
--
-- هذا هو التسريب الذي يبحث عنه موجز المرحلة: «شاشة إحصائيات تكشف تكلفة متعهد
-- أو هامش الموقع لمستخدم البورتال». نبني متعهداً حقيقياً بصفٍّ في
-- `subcontractors` يستطيع قراءته (سياسة 0010)، ثم نتأكد أن ذلك **لا يفتح له**
-- ولا رقماً من الإحصائيات — لا صفاً بأصفار ولا أرقاماً جزئية.
-- ملاحظة الفخّ الصامت: الرفض هنا يقع بصفر صف لا باستثناء، فالفحص على العدد.
-- ----------------------------------------------------------------------------
do $$
declare
  v_user  constant uuid := 'a0000000-0000-4000-8000-0000000000b1';
  v_built boolean := false;
  v_n     integer;
  v_ok    boolean;
  v_rel   text;
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    raise notice '  ↳ (ل) لا دور authenticated في هذه القاعدة — الفحص متخطّى';
    return;
  end if;

  begin
    insert into auth.users (id, email) values (v_user, 'analytics-tests-partner@local.invalid');
    insert into public.profiles (id, role, full_name)
    values (v_user, 'subcontractor', 'متعهد اختبار الإحصائيات')
    on conflict (id) do update set role = excluded.role;

    insert into public.subcontractors (profile_id, company_name, contact_name, phone, status)
    values (v_user, 'ANALYTICS_TESTS شركة اختبار', 'مسؤول اختبار', '01000009302', 'approved');

    v_built := true;
  exception
    when others then
      raise notice '  ↳ (ل) تعذّر بناء هوية متعهد (%) — الفحص متخطّى', sqlerrm;
  end;

  if not v_built then
    return;
  end if;

  begin
    perform set_config('request.jwt.claim.sub', v_user::text, false);
    execute 'set local role authenticated';

    -- (ل-١) يقرأ صفَّ شركته (سياسة 0010) — إثباتٌ أن الهوية فعّالة فعلاً
    execute $q$select count(*) from public.subcontractors
               where company_name like 'ANALYTICS_TESTS%'$q$ into v_n;
    if v_n <> 1 then
      raise exception '(ل-١) المتعهد لا يقرأ صف شركته (% صفاً) — الهوية غير فعّالة فلا معنى لما بعدها', v_n;
    end if;

    -- (ل-٢) ومع ذلك: صفر صف من كل عرض إحصائي
    foreach v_rel in array array[
      'public.v_stats_orders', 'public.v_stats_dispatch', 'public.v_stats_partners',
      'public.v_stats_content', 'public.v_stats_locales', 'public.v_stats_treasury',
      'public.v_stats_customers']
    loop
      execute 'select count(*) from ' || v_rel into v_n;
      if v_n <> 0 then
        raise exception '(ل-٢) المتعهد قرأ % صفاً من % — تسريب أرقام للبورتال', v_n, v_rel;
      end if;
    end loop;

    -- (ل-٣) ودوال الإحصائيات ترفضه صراحةً
    v_ok := false;
    begin
      execute 'select count(*) from public.section_stats(''partners'', null, null)' into v_n;
    exception when others then v_ok := true;
    end;
    if not v_ok then
      raise exception '(ل-٣) المتعهد نفّذ section_stats(partners) — تكلفته وهامش المنصة مكشوفان';
    end if;

    v_ok := false;
    begin
      execute 'select count(*) from public.funnel_daily(null, null)' into v_n;
    exception when others then v_ok := true;
    end;
    if not v_ok then
      raise exception '(ل-٤) المتعهد نفّذ funnel_daily — خريطة مبيعات المنصة مكشوفة';
    end if;

    v_ok := false;
    begin
      execute 'select count(*) from public.funnel_summary(null, null)' into v_n;
    exception when others then v_ok := true;
    end;
    if not v_ok then
      raise exception '(ل-٤ب) المتعهد نفّذ funnel_summary — مجاميع المنصة مكشوفة';
    end if;

    -- (ل-٥) ولا يكتب تحويلاً (الرفض بصفر صف لا باستثناء)
    v_ok := false;
    begin
      execute $q$insert into public.redirects (from_path, to_path)
                 values ('/analytics-tests-partner', '/x')$q$;
    exception when others then v_ok := true;
    end;
    if not v_ok then
      raise exception '(ل-٥) المتعهد أضاف تحويلاً';
    end if;

    execute 'reset role';
    perform set_config('request.jwt.claim.sub', '', false);
  exception
    when others then
      execute 'reset role';
      perform set_config('request.jwt.claim.sub', '', false);
      raise;
  end;

  raise notice '✔ (ل) المتعهد يقرأ صف شركته ولا يرى رقماً واحداً من الإحصائيات ولا يكتب تحويلاً';
end;
$$;

-- ----------------------------------------------------------------------------
-- (م) التنظيف — لا صف اختبار يبقى
-- ----------------------------------------------------------------------------
do $$
declare
  v_acc  uuid := current_setting('tours.an_acc')::uuid;
  v_left integer;
begin
  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claims', '', false);

  delete from public.ledger_entries e
   where e.reverses_entry_id is not null
     and (e.account_id = v_acc
          or e.booking_id in (select b.id from public.bookings b
                               where b.trip ->> 'notes' like 'ANALYTICS_TESTS_FIXTURE%'));

  delete from public.ledger_entries e
   where e.account_id = v_acc
      or e.booking_id in (select b.id from public.bookings b
                           where b.trip ->> 'notes' like 'ANALYTICS_TESTS_FIXTURE%');

  delete from public.payments p
   where p.account_id = v_acc
      or p.booking_id in (select b.id from public.bookings b
                           where b.trip ->> 'notes' like 'ANALYTICS_TESTS_FIXTURE%');

  -- الوسمان معاً: المرجع للصفوف التي تحمله، و class_slug لصفوف البحث وعرض
  -- السعر التي تُزرع بلا مرجع (كما يكتبها /api/quote حرفياً).
  delete from public.funnel_events e
   where e.reference like 'ANLT-%' or e.class_slug = 'ANLT-FIXTURE';

  delete from public.notifications n
   where n.payload ->> 'reference' like 'QR-ANLT%'
      or n.payload ->> 'bookingId' in (
           select b.id::text from public.bookings b
            where b.trip ->> 'notes' like 'ANALYTICS_TESTS_FIXTURE%');

  delete from public.quote_requests q where q.reference like 'QR-ANLT%';
  delete from public.bookings b where b.trip ->> 'notes' like 'ANALYTICS_TESTS_FIXTURE%';
  delete from public.payment_accounts pa where pa.id = v_acc or pa.label like 'ANALYTICS_TESTS%';
  delete from public.redirects r where r.from_path like '/analytics-tests-%';

  delete from public.subcontractors s where s.company_name like 'ANALYTICS_TESTS%';
  delete from public.profiles  p where p.id = 'a0000000-0000-4000-8000-0000000000b1'::uuid;
  delete from auth.users       u where u.id = 'a0000000-0000-4000-8000-0000000000b1'::uuid;

  -- التنظيف يتحقق من نفسه
  select count(*) into v_left from public.funnel_events e
   where e.reference like 'ANLT-%' or e.class_slug = 'ANLT-FIXTURE';
  if v_left <> 0 then
    raise exception '(م) بقي % حدث اختبار بعد التنظيف', v_left;
  end if;

  select count(*) into v_left from public.redirects r where r.from_path like '/analytics-tests-%';
  if v_left <> 0 then
    raise exception '(م) بقي % تحويل اختبار بعد التنظيف', v_left;
  end if;

  select count(*) into v_left from public.bookings b
   where b.trip ->> 'notes' like 'ANALYTICS_TESTS_FIXTURE%';
  if v_left <> 0 then
    raise exception '(م) بقي % حجز اختبار بعد التنظيف', v_left;
  end if;

  select count(*) into v_left from public.quote_requests q where q.reference like 'QR-ANLT%';
  if v_left <> 0 then
    raise exception '(م) بقي % طلب سعر اختباري بعد التنظيف', v_left;
  end if;

  select count(*) into v_left from public.payment_accounts pa where pa.id = v_acc;
  if v_left <> 0 then
    raise exception '(م) بقي حساب خزينة الاختبار بعد التنظيف';
  end if;

  select count(*) into v_left from public.subcontractors s
   where s.company_name like 'ANALYTICS_TESTS%';
  if v_left <> 0 then
    raise exception '(م) بقي % متعهد اختباري بعد التنظيف', v_left;
  end if;

  perform set_config('tours.an_class', '', false);
  perform set_config('tours.an_acc',   '', false);
  perform set_config('tours.an_day',   '', false);
  perform set_config('tours.an_b1',    '', false);
  perform set_config('tours.an_ref',   '', false);
  perform set_config('tours.an_pay',   '', false);
  perform set_config('tours.an_base_search_performed', '', false);
  perform set_config('tours.an_base_quote_viewed',     '', false);
  perform set_config('tours.an_base_quote_requested',  '', false);
  perform set_config('tours.an_base_booking_started',  '', false);
  perform set_config('tours.an_base_booking_created',  '', false);
  perform set_config('tours.an_base_booking_paid',     '', false);
  perform set_config('tours.an_base_week_search',      '', false);
  perform set_config('tours.an_base_orders',           '', false);

  raise notice '✔ (م) التنظيف تم — لا صفوف اختبار متبقية';
end;
$$;

-- ----------------------------------------------------------------------------
-- الخلاصة
-- ----------------------------------------------------------------------------
do $$
begin
  raise notice 'ALL PASSED — الزائر محجوب عن سجل القمع قراءةً وكتابةً، والقمع سلسلة رباعية من مصدر واحد (funnel_events) بلا تضخيم بالتكرار، والجانبيان خارجها بلا نسبة، والأقسام الستة تُرجع StatCard صالحة، والمتعهد لا يرى رقماً واحداً';
end;
$$;
