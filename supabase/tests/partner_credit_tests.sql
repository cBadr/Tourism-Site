-- ============================================================================
-- partner_credit_tests.sql — اختبارات قبول لسقف ديون المتعهدين
--                            (الملاحظة ١٧ من الدفعة ٢ — هجرة 0027_batch_two.sql)
--
-- كيف تشغّله: `node scripts/db-test.mjs partner_credit` أو الصق الملف كاملاً في
-- SQL Editor واضغط Run. النجاح = آخر سطر «ALL PASSED». أي فشل يرمي exception
-- برسالة عربية تحدد الاختبار والقيمة المتوقعة والفعلية.
--
-- ومن psql بدور صاحب القاعدة **لا بد** من ON_ERROR_STOP و‑1 معاً:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f supabase/tests/partner_credit_tests.sql
-- الأول لأن psql بدونه يتابع بعد الكتلة الفاشلة فيطبع «ALL PASSED» رغم الفشل،
-- والثاني لأن الملف يبدّل صف `partner_credit_settings` مؤقتاً.
-- (‏`db-test.mjs` يرسل الملف كاملاً في استعلام واحد ⇒ معاملة ضمنية واحدة.)
--
-- ── 🔒 لماذا كل اختبار إنفاذ هنا داخل كتلة تُرجِع نفسها ───────────────────────
-- `partner_credit_settings` **صف وحيد يحكم القاعدة كلها**: لحظة نضع فيه
-- `debt_limit` نكون قد غيّرنا سلوك كل متعهد في القاعدة لا متعهدي التجهيز. وهذه
-- قاعدة حيّة فيها ستة أشهر تشغيل مُحاكى وحجزان حقيقيان. لذلك:
--
--   • كل قسم يلمس الإعدادات يجري داخل كتلة `raise exception 'ROLLBACK_MARKER'`
--     — وكتلة استثناء plpgsql نقطة حفظ ضمنية، فكل ما بداخلها يُرجَع: تعديل
--     الإعدادات، والعروض، والدفعات، وقيود الدفتر التي ولّدتها المُشغّلات.
--   • ودَينُ متعهد التجهيز **أكبر من دين أي متعهد في القاعدة مضروباً في اثنين**
--     (‏يُشتق في القسم ٠-د من العرض نفسه لا برقم مكتوب)، فحتى في اللحظة التي
--     يكون فيها السقف مضبوطاً لا يبلغه أحد سواه. أي أن أثر أي خطأ صفرٌ لا صغير.
--   • ولا شيء في هذا الملف يستدعي `cancel_stale_bookings` ولا يمسّ `trip_settings`.
--
-- ── منهج الملف ──────────────────────────────────────────────────────────────
--   • **إثبات الإشارة من البيانات لا من الأسماء**: القسم (أ) يبني متعهداً حصّل
--     أكثر من مستحقه فيثبت أن `net_due` سالب وأن `partner_debt = -net_due`، ثم
--     متعهداً نحن مدينون له فيثبت أن الدين صفر. وثالثاً **بلا قيد واحد في
--     الدفتر** — وهو فخّ `coalesce` (غائب عن العرض أصلاً، فبلا coalesce = null).
--   • **كل رقم متوقَّع مشتق من نفس المُدخل الذي تقرؤه الدالة**: السقف يُضبط على
--     `partner_debt()` الحيّة لا على ثابت مكتوب، والحدود تُختبر بفارق قرش واحد.
--   • إحداثيات **صحراوية نائية** (٢٥٫٠، ٢٧٫٥) ← (٢٤٫٥، ٢٨٫٢) وقوائم أسعار
--     يملكها التجهيز وحده — والقسم (٠) يتحقق أن **لا متعهد حقيقي يغطي المسار**
--     قبل أن يزرع شيئاً، فحوض البث ملكٌ للاختبار.
--   • **لكل فحص سالب شاهد إيجابي بجواره**: «السليم يصله عرض» بجوار «المتجاوز لا
--     يصله»، و«غير المدين تُسجَّل له دفعة» بجوار «المدين تُرفض دفعته». فحصٌ يمنع
--     الجميع ينجح دائماً ولا يثبت شيئاً (النمط ٩ في handover/LESSONS.md).
--   • الصفوف كلها بوسم `PARTNER_CREDIT_FIXTURE` وبمعرّفات ثابتة تبدأ بـ
--     `e2000000-0000-4000-8000-0000000000` وتُمسح في البداية والنهاية معاً.
--
-- ── حواجز هذا الملف (لا تُغلق المرحلة وأحدها راسب) ──────────────────────────
-- (١) القسم (د-٥): **مُشغّل `partner_payouts` يرفض الإدراج المباشر.** سقوطه
--     يعني أن الفحص داخل `record_partner_payout` زينة: أي مشرف يُدرج صفاً عبر
--     PostgREST فيحصل على قيد صرف في الدفتر ويتخطى القاعدة كلها.
-- (٢) القسم (ج-٣): **`over_limit` في العرض لا يقرأ `block_dispatch`.** الانفصال
--     مقصود (المالك يرى المتجاوزين حتى وهو لا يحجبهم)، وجلسة قادمة ستُصلحه
--     بوصفه عطلاً ما لم يثبّته اختبار.
-- (٣) القسم (هـ): **الدوال الثلاث ممنوعة على `anon` و`authenticated` معاً.**
--     كل متعهد مستخدم `authenticated`؛ فمنحُها يجعله يستكشف دين منافسه بالتجربة.
--
-- المرجع: supabase/migrations/0027_batch_two.sql (ق٦ .. ق١٢)
--         + lib/finance-types.ts (‏`PartnerCreditSettings` و`PartnerSettlement`)
--         + supabase/tests/finance_tests.sql القسم (ج) — إثبات قاعدة الإشارة
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (٠) الشروط المسبقة + تنظيف بقايا تشغيل سابق + حفظ الإعدادات
-- ----------------------------------------------------------------------------
do $$
declare
  v_missing text;
  v_classes text[];
  v_n       integer;
  v_saved   jsonb;
begin
  -- الهوية تُفرَّغ أولاً: أي بقية من مطالبة jwt تجعل finance_admin_allowed تحسبنا
  -- مستخدماً عادياً فترفض دوال المقاصة بلا سبب مفهوم.
  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claims', '', false);

  -- ومفتاحا التجاوز البشري يُطفآن صراحةً: كلاهما `set_config(..., true)` أي
  -- **محلي للمعاملة لا للدالة**، فتسرّبه يُبطل كل فحص إنفاذ بعده بهدوء.
  perform set_config('tours.allow_partner_debt', 'off', false);
  perform set_config('tours.allow_partner_advance', 'off', false);

  select string_agg(x.sig, '، ')
    into v_missing
  from (values
    ('public.partner_credit_config()'),
    ('public.partner_debt(uuid)'),
    ('public.partner_over_debt_limit(uuid)'),
    ('public.partner_payouts_guard_owing()'),
    ('public.trip_offers_guard_accept()'),
    ('public.record_partner_payout(uuid, uuid, numeric, timestamptz, text)'),
    ('public.record_partner_payout_advance(uuid, uuid, numeric, timestamptz, text)'),
    ('public.dispatch_broadcast(uuid, integer)'),
    ('public.dispatch_pool(uuid, integer)'),
    ('public.portal_offers()'),
    ('public.coverage_matches(numeric, numeric, numeric, numeric)'),
    ('public.create_booking(jsonb, jsonb, integer, boolean, numeric, numeric, numeric, text, text, text, text, text, text, timestamptz, text, text, timestamptz, integer, jsonb)')
  ) as x(sig)
  where to_regprocedure(x.sig) is null;

  if v_missing is not null then
    raise exception 'شرط مسبق: دوال مفقودة (نفّذ 0027_batch_two.sql أولاً): %', v_missing;
  end if;

  select string_agg(x.rel, '، ')
    into v_missing
  from (values
    ('public.partner_credit_settings'), ('public.v_partner_settlements'),
    ('public.ledger_entries'), ('public.partner_payouts'), ('public.payment_accounts'),
    ('public.subcontractors'), ('public.subcontractor_vehicles'),
    ('public.price_lists'), ('public.price_list_items'),
    ('public.trip_offers'), ('public.dispatches'), ('public.bookings')
  ) as x(rel)
  where to_regclass(x.rel) is null;

  if v_missing is not null then
    raise exception 'شرط مسبق: كائنات مفقودة: %', v_missing;
  end if;

  -- عمودا 0027 في العرض
  select string_agg(x.col, '، ')
    into v_missing
  from (values ('owed_to_us'), ('over_limit')) as x(col)
  where not exists (
    select 1 from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = 'v_partner_settlements'
      and c.column_name = x.col
  );

  if v_missing is not null then
    raise exception 'شرط مسبق: أعمدة v_partner_settlements من 0027 مفقودة: %', v_missing;
  end if;

  -- المُشغّلان — لأن نصف هذه الميزة **في الجدول** لا في الدوال
  if not exists (
    select 1 from pg_trigger t
    where t.tgrelid = 'public.partner_payouts'::regclass
      and t.tgname  = 'partner_payouts_guard_owing'
      and not t.tgisinternal
  ) then
    raise exception 'شرط مسبق: مُشغّل partner_payouts_guard_owing غير مركَّب — الحاجز في الجدول مفقود';
  end if;

  if not exists (
    select 1 from pg_trigger t
    where t.tgrelid = 'public.trip_offers'::regclass
      and t.tgname  = 'trip_offers_guard_accept'
      and not t.tgisinternal
  ) then
    raise exception 'شرط مسبق: مُشغّل trip_offers_guard_accept غير مركَّب';
  end if;

  -- صف الإعدادات الوحيد — وبلا صفٍّ تسقط كل الأقسام إلى القيم الافتراضية بهدوء
  select count(*) into v_n from public.partner_credit_settings;
  if v_n <> 1 then
    raise exception
      'شرط مسبق: partner_credit_settings يجب أن يحوي صفاً واحداً (وجدنا %) — بذرة 0027 لم تُنفَّذ', v_n;
  end if;

  select to_jsonb(c) into v_saved from public.partner_credit_settings c limit 1;
  perform set_config('tours.pc_saved', v_saved::text, false);

  -- الحارس المالي: بلا هوية مقبولة تسقط أقسام الدفعات بـ forbidden لا بعطل حقيقي
  if not public.finance_admin_allowed() then
    raise exception
      'شرط مسبق: finance_admin_allowed ترفض اتصال الاختبار (session_user = %) — دوال المقاصة لا تُختبر بهذه الهوية',
      session_user;
  end if;

  -- ── تنظيف بقايا تشغيل سابق ──
  -- الدفتر أولاً (‏`subcontractor_id` بـ on delete set null فيترك الحذفُ قيوداً
  -- يتيمة تُفسد مقاصة القاعدة)، ثم الدفعات، ثم الإشعارات، ثم الحجوزات،
  -- ثم المتعهدون فتتالى عليهم قوائم الأسعار والمركبات.
  delete from public.ledger_entries e
   where e.subcontractor_id in (select s.id from public.subcontractors s
                                 where s.company_name like 'PARTNER_CREDIT_FIXTURE%')
      or e.account_id in (select pa.id from public.payment_accounts pa
                           where pa.label like 'PARTNER_CREDIT_FIXTURE%')
      or e.booking_id in (select b.id from public.bookings b
                           where b.trip ->> 'notes' like 'PARTNER_CREDIT_FIXTURE%');

  delete from public.partner_payouts p
   where p.subcontractor_id in (select s.id from public.subcontractors s
                                 where s.company_name like 'PARTNER_CREDIT_FIXTURE%')
      or p.account_id in (select pa.id from public.payment_accounts pa
                           where pa.label like 'PARTNER_CREDIT_FIXTURE%');

  delete from public.notifications n
   where n.payload ->> 'bookingId' in (
         select b.id::text from public.bookings b
          where b.trip ->> 'notes' like 'PARTNER_CREDIT_FIXTURE%');

  delete from public.bookings b where b.trip ->> 'notes' like 'PARTNER_CREDIT_FIXTURE%';
  delete from public.subcontractors s where s.company_name like 'PARTNER_CREDIT_FIXTURE%';
  delete from public.payment_accounts pa where pa.label like 'PARTNER_CREDIT_FIXTURE%';

  delete from public.profiles p
   where p.id in ('e2000000-0000-4000-8000-0000000000aa'::uuid,
                  'e2000000-0000-4000-8000-0000000000ad'::uuid);
  begin
    delete from auth.users u
     where u.id in ('e2000000-0000-4000-8000-0000000000aa'::uuid,
                    'e2000000-0000-4000-8000-0000000000ad'::uuid);
  exception when others then null;
  end;

  -- الفئة المؤهلة لراكب واحد كما يرجعها المحرك نفسه لا تخميناً منّا
  select array_agg(q.class_slug order by q.capacity asc)
    into v_classes
  from public.quote_price(100, 1, false, 0) q;

  if v_classes is null or array_length(v_classes, 1) < 1 then
    raise exception 'شرط مسبق: لا فئة سيارة نشطة لها تعريفة — نفّذ بذرة 0005';
  end if;

  perform set_config('tours.pc_class', v_classes[1], false);

  -- 🔒 المسار الصحراوي **غير مغطّى** قبل أن نزرع فيه شيئاً. بلا هذا الفحص قد
  -- يدخل متعهد حقيقي أرخص إلى الحوض فينقلب مرجع التكلفة، فيخرج متعهدا التجهيز
  -- من الحوض ويسقط القسم (د) برسالة تبدو عطلاً في سقف الدين وهي تصادم تغطية.
  select count(*) into v_n
  from public.coverage_matches(25.000000, 27.500000, 24.500000, 28.200000);
  if v_n <> 0 then
    raise exception
      'شرط مسبق: المسار الصحراوي صار مغطّى بـ % قائمة أسعار حقيقية — غيّر إحداثيات التجهيز', v_n;
  end if;

  raise notice '✔ (٠) الشروط المسبقة سليمة — فئة الاختبار «%»، والإعدادات محفوظة (سقف أصلي = %)',
    v_classes[1], (v_saved ->> 'debt_limit');
end;
$$;

-- ----------------------------------------------------------------------------
-- (٠-ب) هوية المشرف — احتياطي إن لم يكن الاتصال بدور صاحب القاعدة
--
-- نمط `booking_tests.sql` القسم (٠-ب) حرفياً: يبحث عن مشرف قائم، وإلا أنشأ
-- مستخدماً مؤقتاً ليُحذف في التنظيف، وإلا مضى بلا هوية (الشرط المسبق أعلاه
-- أثبت أصلاً أن `finance_admin_allowed` تقبلنا).
-- ----------------------------------------------------------------------------
do $$
declare
  v_admin uuid;
begin
  perform set_config('tours.pc_admin', '', false);
  perform set_config('tours.pc_admin_fixture', '0', false);

  select p.id into v_admin from public.profiles p where p.role = 'admin' limit 1;

  if v_admin is null then
    begin
      v_admin := 'e2000000-0000-4000-8000-0000000000ad'::uuid;
      delete from public.profiles p where p.id = v_admin;
      delete from auth.users u where u.id = v_admin;
      insert into auth.users (id, email) values (v_admin, 'partner-credit-admin@local.invalid');
      insert into public.profiles (id, role, full_name)
      values (v_admin, 'admin', 'مشرف اختبار مؤقت')
      on conflict (id) do update set role = 'admin';
      perform set_config('tours.pc_admin_fixture', '1', false);
      raise notice '  ↳ أُنشئ مشرف اختبار مؤقت (سيُحذف في النهاية)';
    exception
      when others then
        v_admin := null;
        raise notice '  ↳ تعذّر إنشاء مشرف مؤقت (%) — يُعتمد على دور صاحب القاعدة', sqlerrm;
    end;
  end if;

  if v_admin is not null then
    perform set_config('tours.pc_admin', v_admin::text, false);
  end if;

  raise notice '✔ (٠-ب) الحارس المالي يقبل هذا الاتصال';
end;
$$;

-- ----------------------------------------------------------------------------
-- (٠-ج) المتعهدون الأربعة وحساب الخزينة وهوية دخول المدين
--
--   المدين  (‏01): حصّل أكثر من مستحقه ⇒ `net_due` سالب — عليه السقف يقع.
--   الدائن  (‏02): مستحقه يفوق ما حصّله ⇒ نحن المدينون له.
--   السليم  (‏03): **بلا قيد واحد في الدفتر** — غائب عن العرض، وهو فخّ coalesce،
--                  وهو أيضاً المتعهد الصحّي في اختبارات البث.
--   الموقوف (‏04): `pending` لا `approved` — لإثبات بقاء قاعدة 0014 الأصلية.
--
-- المدين والسليم وحدهما يملكان تغطية ومركبة: البث يقارنهما، والباقيان لا يدخلان
-- الحوض أصلاً فلا يشوّشان العدّ.
-- ----------------------------------------------------------------------------
do $$
declare
  v_deb  constant uuid := 'e2000000-0000-4000-8000-000000000001';
  v_cre  constant uuid := 'e2000000-0000-4000-8000-000000000002';
  v_ok   constant uuid := 'e2000000-0000-4000-8000-000000000003';
  v_pend constant uuid := 'e2000000-0000-4000-8000-000000000004';
  v_ldeb constant uuid := 'e2000000-0000-4000-8000-000000000011';
  v_lok  constant uuid := 'e2000000-0000-4000-8000-000000000013';
  v_acc  constant uuid := 'e2000000-0000-4000-8000-000000000021';
  v_prof constant uuid := 'e2000000-0000-4000-8000-0000000000aa';
  v_cls  text    := current_setting('tours.pc_class');
  v_cost constant numeric := 1500;
begin
  insert into public.subcontractors (id, company_name, phone, email, status)
  values
    (v_deb,  'PARTNER_CREDIT_FIXTURE المدين',  '01000079801', 'pc-debtor@local.invalid',  'approved'),
    (v_cre,  'PARTNER_CREDIT_FIXTURE الدائن',  '01000079802', 'pc-creditor@local.invalid','approved'),
    (v_ok,   'PARTNER_CREDIT_FIXTURE السليم',  '01000079803', 'pc-clean@local.invalid',   'approved'),
    (v_pend, 'PARTNER_CREDIT_FIXTURE الموقوف', '01000079804', 'pc-pending@local.invalid', 'pending');

  insert into public.subcontractor_vehicles (subcontractor_id, class_slug, label, active)
  values (v_deb, v_cls, 'مركبة اختبار المدين', true),
         (v_ok,  v_cls, 'مركبة اختبار السليم', true);

  -- قائمتان بنفس التكلفة تماماً على نفس المسار الصحراوي: فالفارق الوحيد بين
  -- المتعهدَين في الحوض هو **الدين** لا السعر ولا التغطية.
  insert into public.price_lists
    (id, subcontractor_id, title, origin_label, origin_lat, origin_lng, origin_radius_km,
     dest_label, dest_lat, dest_lng, dest_radius_km, bidirectional, status)
  values
    (v_ldeb, v_deb, 'PARTNER_CREDIT_FIXTURE قائمة المدين', 'موقع صحراوي أ', 25.000000, 27.500000, 50,
     'موقع صحراوي ب', 24.500000, 28.200000, 50, true, 'approved'),
    (v_lok,  v_ok,  'PARTNER_CREDIT_FIXTURE قائمة السليم', 'موقع صحراوي أ', 25.000000, 27.500000, 50,
     'موقع صحراوي ب', 24.500000, 28.200000, 50, true, 'approved');

  insert into public.price_list_items (price_list_id, class_slug, cost)
  values (v_ldeb, v_cls, v_cost),
         (v_lok,  v_cls, v_cost);

  -- خزينة نقدية داخلية غير معروضة للعميل — منها تُصرف دفعات المقاصة
  insert into public.payment_accounts
    (id, kind, label, handle, holder_name, opening_balance, active, sort, customer_facing)
  values
    (v_acc, 'cash', 'PARTNER_CREDIT_FIXTURE خزينة نقدية', 'PCF-CASH-BOX', 'اختبار', 0, true, 990, false);

  perform set_config('tours.pc_debtor',   v_deb::text,  false);
  perform set_config('tours.pc_creditor', v_cre::text,  false);
  perform set_config('tours.pc_clean',    v_ok::text,   false);
  perform set_config('tours.pc_pending',  v_pend::text, false);
  perform set_config('tours.pc_account',  v_acc::text,  false);
  perform set_config('tours.pc_cost',     v_cost::text, false);

  -- هوية دخول للمدين — أساس اختبار `portal_offers` (يقرأ current_subcontractor_id)
  perform set_config('tours.pc_identity', '0', false);
  begin
    insert into auth.users (id, email) values (v_prof, 'pc-debtor@local.invalid');
    insert into public.profiles (id, role, full_name)
    values (v_prof, 'subcontractor', 'متعهد اختبار مدين')
    on conflict (id) do update set role = 'subcontractor';
    update public.subcontractors set profile_id = v_prof where id = v_deb;
    perform set_config('tours.pc_identity', '1', false);
  exception
    when others then
      raise notice '  ↳ تعذّر إنشاء هوية دخول للمدين (%) — قسم البورتال سيُتخطّى', sqlerrm;
  end;

  raise notice '✔ (٠-ج) أربعة متعهدين وخزينة نقدية وقائمتا أسعار بتكلفة % على المسار الصحراوي', v_cost;
end;
$$;

-- ----------------------------------------------------------------------------
-- (٠-د) قيود الدفتر — والدَّين يُشتق ليفوق كل دين في القاعدة
--
-- 🔒 لماذا الاشتقاق لا رقم مكتوب: الأقسام التالية تضبط `debt_limit` على دين
-- المدين بالضبط. فلو كان في القاعدة متعهد حقيقي دينه أكبر أو مساوٍ لبلغ السقف
-- معه أيضاً في تلك اللحظة. باشتقاق الدين من **أقصى دين قائم × ٢ + هامش** يصير
-- المدين وحده فوق أي سقف نضعه، فأثر التجربة صفرٌ لا صغير.
-- ----------------------------------------------------------------------------
do $$
declare
  v_deb    uuid := current_setting('tours.pc_debtor')::uuid;
  v_cre    uuid := current_setting('tours.pc_creditor')::uuid;
  v_max    numeric;
  v_debt   numeric;
  v_earned constant numeric := 1000000;
  v_at     constant timestamptz := timestamptz '2019-03-12 12:00:00+02';
begin
  -- أقصى «ما على متعهد لنا» في القاعدة كما يقيسه العرض نفسه
  select coalesce(max(ps.owed_to_us), 0) into v_max from public.v_partner_settlements ps;

  v_debt := greatest(round(v_max * 2, 2) + 1000000, 7000000);

  -- صمام: `numeric(12,2)` تتسع لعشرة مليارات، ولا معنى لتجهيز يقترب منها
  if v_earned + v_debt > 900000000 then
    raise exception
      '(٠-د) دين التجهيز المشتق % ضخم إلى حدٍّ يقارب سعة العمود — راجع بيانات القاعدة',
      v_debt;
  end if;

  perform set_config('tours.pc_debt', v_debt::text, false);

  -- المدين: مستحق مليون، وحصّل نقداً مليوناً + الدَّين ⇒ الصافي سالب حتماً
  insert into public.ledger_entries
    (account_id, direction, amount, occurred_at, source_type, subcontractor_id,
     settlement_role, note)
  values
    (null, 'out', v_earned,           v_at, 'partner_payout',     v_deb, 'earned',
     'PARTNER_CREDIT_FIXTURE مستحق المدين'),
    (null, 'in',  v_earned + v_debt,  v_at, 'partner_collection', v_deb, 'collected',
     'PARTNER_CREDIT_FIXTURE ما حصّله المدين نقداً');

  -- الدائن: مستحقه يفوق ما حصّله ⇒ الصافي موجب («له علينا»)
  insert into public.ledger_entries
    (account_id, direction, amount, occurred_at, source_type, subcontractor_id,
     settlement_role, note)
  values
    (null, 'out', v_earned * 5, v_at, 'partner_payout',     v_cre, 'earned',
     'PARTNER_CREDIT_FIXTURE مستحق الدائن'),
    (null, 'in',  v_earned,     v_at, 'partner_collection', v_cre, 'collected',
     'PARTNER_CREDIT_FIXTURE ما حصّله الدائن نقداً');

  raise notice
    '✔ (٠-د) دين التجهيز % (أقصى دين قائم في القاعدة % — فلا يبلغه أحد سواه)', v_debt, v_max;
end;
$$;

-- ----------------------------------------------------------------------------
-- (٠-هـ) حجزان مؤكَّدان على المسار الصحراوي — مرجع البث وحوضه
-- ----------------------------------------------------------------------------
do $$
declare
  v_cls  text := current_setting('tours.pc_class');
  v_cost numeric := current_setting('tours.pc_cost')::numeric;
  v_res  record;
  v_b    record;
  v_i    integer;
begin
  for v_i in 1..2 loop
    select * into v_res from public.create_booking(
      jsonb_build_object('label', 'موقع صحراوي أ', 'lat', 25.000000, 'lng', 27.500000),
      jsonb_build_object('label', 'موقع صحراوي ب', 'lat', 24.500000, 'lng', 28.200000),
      1, false, 0, 100, 90, 'test',
      v_cls, 'full',
      'عميل اختبار سقف الدين ' || v_i, '0100007980' || v_i, null, now() + interval '3 days',
      'PARTNER_CREDIT_FIXTURE-B' || v_i
    );

    perform set_config('tours.pc_b' || v_i, v_res.id::text, false);

    -- إلى «مؤكَّد» عبر الحارس نفسه لا حوله (شرط البث و`portal_offers`)
    update public.bookings set status = 'under_review' where id = v_res.id;
    update public.bookings set status = 'confirmed'    where id = v_res.id;
  end loop;

  select b.* into v_b from public.bookings b
   where b.id = current_setting('tours.pc_b1')::uuid;

  -- شاهد إيجابي على أن التسعير التقط قائمتَي التجهيز: بلا ذلك يصير سقف البث
  -- مشتقاً من الإجمالي لا من التكلفة، فيتغيّر معنى الحوض كله.
  if coalesce(v_b.price_source, '') <> 'subcontractor' then
    raise exception '(٠-هـ) مصدر سعر الحجز «%» — المتوقع subcontractor', coalesce(v_b.price_source, 'بلا');
  end if;
  if v_b.subcontractor_cost is distinct from v_cost then
    raise exception '(٠-هـ) تكلفة الحجز المسجَّلة % — المتوقع %',
      coalesce(v_b.subcontractor_cost::text, 'بلا'), v_cost;
  end if;

  raise notice '✔ (٠-هـ) حجزان مؤكَّدان بتكلفة متعهد % وإجمالي %', v_b.subcontractor_cost, v_b.total;
end;
$$;

-- ----------------------------------------------------------------------------
-- (أ) 🔒 إثبات الإشارة **من البيانات لا من الأسماء**
--
-- `partner_debt` تقرأ `net_due` من `v_partner_settlements` وتقلب إشارته. فلو كان
-- الاصطلاح معكوساً لصار «المدين» دائناً وسقط السقف على من نحن مدينون له. لذلك
-- تُقرأ الإشارة من العرض ويُشتق منها المتوقَّع، ولا يُكتب رقم واحد بيدنا.
-- ----------------------------------------------------------------------------
do $$
declare
  v_deb  uuid := current_setting('tours.pc_debtor')::uuid;
  v_cre  uuid := current_setting('tours.pc_creditor')::uuid;
  v_ok   uuid := current_setting('tours.pc_clean')::uuid;
  v_s    record;
  v_d    numeric;
begin
  -- (أ-١) المدين: الصافي سالب، والدَّين = −الصافي بالقرش
  select * into v_s from public.v_partner_settlements ps where ps.subcontractor_id = v_deb;
  if not found then
    raise exception '(أ-١) المدين غائب عن عرض المقاصة رغم قيدَيه في الدفتر';
  end if;

  if v_s.net_due <> v_s.earned - v_s.collected - v_s.paid then
    raise exception '(أ-١) الصافي % لا يساوي (% − % − %) — أساس القسم كله منهار',
      v_s.net_due, v_s.earned, v_s.collected, v_s.paid;
  end if;

  if v_s.net_due >= 0 then
    raise exception
      '(أ-١) 🔒 الصافي % ليس سالباً رغم أن ما حصّله (%) يفوق مستحقه (%) — اصطلاح الإشارة انقلب',
      v_s.net_due, v_s.collected, v_s.earned;
  end if;

  v_d := public.partner_debt(v_deb);
  if v_d is distinct from -v_s.net_due then
    raise exception '(أ-٢) partner_debt = % والمتوقع % (‏= −net_due)', coalesce(v_d::text, 'null'), -v_s.net_due;
  end if;
  if v_d <= 0 then
    raise exception '(أ-٢) دين المدين % ليس موجباً — التجهيز نفسه بلا معنى', v_d;
  end if;

  -- (أ-٣) الدائن: نحن المدينون له ⇒ الدين **صفر** لا رقم سالب ولا القيمة المطلقة
  select * into v_s from public.v_partner_settlements ps where ps.subcontractor_id = v_cre;
  if not found then
    raise exception '(أ-٣) الدائن غائب عن عرض المقاصة رغم قيدَيه';
  end if;
  if v_s.net_due <= 0 then
    raise exception
      '(أ-٣) صافي الدائن % ليس موجباً — التجهيز لا يختبر الاتجاه المقابل', v_s.net_due;
  end if;

  v_d := public.partner_debt(v_cre);
  if v_d is distinct from 0 then
    raise exception
      '(أ-٣) 🔒 دين الدائن % لا صفر — من له علينا صار مديناً لنا، والسقف يقع على الطرف الخطأ', v_d;
  end if;

  -- (أ-٤) 🔒 فخّ `coalesce`: من لا قيد له في الدفتر **غائب عن العرض أصلاً**
  --       (‏`join subcontractors` لا `left join`)، فبلا coalesce يعود null.
  if exists (select 1 from public.v_partner_settlements ps where ps.subcontractor_id = v_ok) then
    raise exception
      '(أ-٤) المتعهد بلا قيود حاضر في عرض المقاصة — فخّ coalesce غير مُختبَر أصلاً، غيّر التجهيز';
  end if;

  v_d := public.partner_debt(v_ok);
  if v_d is null then
    raise exception
      '(أ-٤) 🔒 دين متعهد بلا قيود = null لا صفر — كل شرط يقارنه يسقط في الاتجاه غير المقصود';
  end if;
  if v_d <> 0 then
    raise exception '(أ-٤) دين متعهد بلا قيود % — المتوقع صفر', v_d;
  end if;

  raise notice
    '✔ (أ) الإشارة مثبتة من البيانات: المدين دينه % ( = −net_due)، والدائن صفر، ومن بلا قيود صفر لا null',
    public.partner_debt(v_deb);
end;
$$;

-- ----------------------------------------------------------------------------
-- (ب) `partner_over_debt_limit` — جدول الحقيقة كاملاً
--
-- ⚠ الكتلة كلها تُرجِع نفسها: `debt_limit` مفتاح عام يحكم كل متعهد في القاعدة.
-- ----------------------------------------------------------------------------
do $$
declare
  v_deb  uuid := current_setting('tours.pc_debtor')::uuid;
  v_cre  uuid := current_setting('tours.pc_creditor')::uuid;
  v_at   numeric;
  v_got  boolean;
begin
  -- السقف يُشتق من الدالة نفسها لحظة الاختبار، لا من ثابت مكتوب
  v_at := public.partner_debt(v_deb);

  -- (ب-١) الميزة خاملة بسقف صفر — ولو كان الحجب مفعّلاً
  update public.partner_credit_settings set debt_limit = 0, block_dispatch = true where id;
  v_got := public.partner_over_debt_limit(v_deb);
  if v_got then
    raise exception
      '(ب-١) متعهد دينه % حُجب والسقف صفر — صفرٌ تعني «بلا سقف»، فتطبيق الهجرة وحده يحجب شركاء قائمين',
      v_at;
  end if;

  -- (ب-٢) وبالحجب مطفأ لا يُحجب أحد مهما بلغ السقف
  update public.partner_credit_settings set debt_limit = v_at, block_dispatch = false where id;
  v_got := public.partner_over_debt_limit(v_deb);
  if v_got then
    raise exception '(ب-٢) الحجب مطفأ ومع ذلك حُجب متعهد دينه % عند سقف %', v_at, v_at;
  end if;

  -- (ب-٣) 🔒 «بلغ السقف» لا «تجاوزه»: من وصل إلى الحد بالضبط يتوقف عنده
  update public.partner_credit_settings set debt_limit = v_at, block_dispatch = true where id;
  v_got := public.partner_over_debt_limit(v_deb);
  if not v_got then
    raise exception
      '(ب-٣) 🔒 دين % عند سقف % لم يُحجب — القاعدة «بلغ» لا «تجاوز»، وإلا مرّ من هو على الحد تماماً',
      v_at, v_at;
  end if;

  -- (ب-٤) وبقرش واحد فوق الدين لا يُحجب — الحد الأدنى للفارق في numeric(12,2)
  update public.partner_credit_settings set debt_limit = v_at + 0.01 where id;
  v_got := public.partner_over_debt_limit(v_deb);
  if v_got then
    raise exception '(ب-٤) دين % حُجب عند سقف % — الحجب يبدأ قبل بلوغ السقف', v_at, v_at + 0.01;
  end if;

  -- (ب-٥) شاهد إيجابي: الدائن لا يُحجب عند نفس السقف الذي يحجب المدين.
  --        بدونه يمر (ب-٣) حتى لو صارت الدالة ترجع true للجميع.
  update public.partner_credit_settings set debt_limit = v_at, block_dispatch = true where id;
  if public.partner_over_debt_limit(v_cre) then
    raise exception '(ب-٥) الدائن (دينه %) حُجب عند سقف % — الدالة تحجب الجميع',
      public.partner_debt(v_cre), v_at;
  end if;

  raise notice
    '✔ (ب) جدول الحقيقة: سقف صفر ⇒ لا حجب · الحجب مطفأ ⇒ لا حجب · عند السقف % ⇒ حجب · بقرش فوقه ⇒ لا حجب · والدائن لا يُحجب',
    v_at;

  raise exception 'ROLLBACK_MARKER';
exception
  when others then
    if sqlerrm <> 'ROLLBACK_MARKER' then raise; end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- (ج) عمودا العرض الجديدان — و**الانفصال المقصود** بينهما وبين الحجب
-- ----------------------------------------------------------------------------

-- (ج-١) `owed_to_us` = `partner_debt` لكل صف في العرض — بلا لمس أي إعداد
do $$
declare
  v_deb uuid := current_setting('tours.pc_debtor')::uuid;
  v_bad text;
  v_n   integer;
begin
  select string_agg(x.line, '  |  ')
    into v_bad
  from (
    select ps.company_name || ': العرض ' || ps.owed_to_us
           || ' والدالة ' || coalesce(public.partner_debt(ps.subcontractor_id)::text, 'null') as line
    from public.v_partner_settlements ps
    where ps.owed_to_us is distinct from public.partner_debt(ps.subcontractor_id)
  ) x;

  if v_bad is not null then
    raise exception
      '(ج-١) صفوف يختلف فيها owed_to_us عن partner_debt — مصدران للحقيقة نفسها: %', v_bad;
  end if;

  -- شاهد إيجابي: المقارنة ليست فارغة، وفيها صفٌّ دينه موجب فعلاً
  select count(*)::integer into v_n
  from public.v_partner_settlements ps
  where ps.subcontractor_id = v_deb and ps.owed_to_us > 0;
  if v_n <> 1 then
    raise exception '(ج-١) المدين لا يظهر بـ owed_to_us موجب — المقارنة أعلاه كانت فارغة المعنى';
  end if;

  raise notice '✔ (ج-١) owed_to_us يطابق partner_debt في كل صفوف العرض، والمدين شاهد موجب';
end;
$$;

-- (ج-٢/ج-٣) `over_limit` يقيس بلوغ السقف وحده — ولا يقرأ `block_dispatch`
do $$
declare
  v_deb uuid := current_setting('tours.pc_debtor')::uuid;
  v_cre uuid := current_setting('tours.pc_creditor')::uuid;
  v_at  numeric;
  v_ol  boolean;
  v_fn  boolean;
begin
  v_at := public.partner_debt(v_deb);

  -- (ج-٢) بالحجب مفعّلاً: العمود والدالة يتفقان
  update public.partner_credit_settings set debt_limit = v_at, block_dispatch = true where id;

  select ps.over_limit into v_ol from public.v_partner_settlements ps where ps.subcontractor_id = v_deb;
  v_fn := public.partner_over_debt_limit(v_deb);
  if not v_ol or not v_fn then
    raise exception '(ج-٢) عند السقف: over_limit = % والدالة = % — المتوقع صحيحان', v_ol, v_fn;
  end if;

  select ps.over_limit into v_ol from public.v_partner_settlements ps where ps.subcontractor_id = v_cre;
  if v_ol then
    raise exception '(ج-٢) الدائن موسوم over_limit — العمود يسم الجميع';
  end if;

  -- (ج-٣) 🔒 وبإطفاء الحجب: **العمود يبقى صحيحاً والدالة تصير كاذبة**.
  -- الانفصال مقصود ومكتوب في الهجرة: لو خلطهما لاختفى وسمُ كل المتجاوزين عن
  -- شاشة المالك بمجرد إطفاء الحجب — فيفقد رؤيتهم لا مجرد حجبهم.
  update public.partner_credit_settings set block_dispatch = false where id;

  select ps.over_limit into v_ol from public.v_partner_settlements ps where ps.subcontractor_id = v_deb;
  v_fn := public.partner_over_debt_limit(v_deb);

  if not v_ol then
    raise exception
      '(ج-٣) 🔒 over_limit صار كاذباً بإطفاء block_dispatch — العمود صار يقيس الحجب لا بلوغ السقف، فيختفي المتجاوزون عن شاشة المالك';
  end if;
  if v_fn then
    raise exception
      '(ج-٣) partner_over_debt_limit ما زالت صحيحة والحجب مطفأ — الإطفاء بلا أثر';
  end if;

  raise notice
    '✔ (ج-٢/٣) 🔒 over_limit يتبع بلوغ السقف وحده (‏% مع الحجب وبدونه)، والدالة تتبع الحجب أيضاً — انفصال مقصود مثبَّت', v_ol;

  raise exception 'ROLLBACK_MARKER';
exception
  when others then
    if sqlerrm <> 'ROLLBACK_MARKER' then raise; end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- (د) الإنفاذ — وهو ما تقوم عليه الميزة كلها
--
-- (د-١) مُشغّل `trip_offers` يرفض فوز من بلغ سقفه بـ hint = debt-limit
-- (د-٢) ويرفض غير المعتمد بـ hint = forbidden — قاعدة 0014 لم تُنقض
-- (د-٣) شاهد إيجابي: السليم يفوز والسقف مضبوط
-- (د-٤) باب التجاوز الوحيد `tours.allow_partner_debt` يفتح، وإغلاقه يعيد الرفض
-- ----------------------------------------------------------------------------
do $$
declare
  v_deb   uuid := current_setting('tours.pc_debtor')::uuid;
  v_ok    uuid := current_setting('tours.pc_clean')::uuid;
  v_pend  uuid := current_setting('tours.pc_pending')::uuid;
  v_b1    uuid := current_setting('tours.pc_b1')::uuid;
  v_b2    uuid := current_setting('tours.pc_b2')::uuid;
  v_at    numeric;
  v_o1    uuid;
  v_o2    uuid;
  v_o3    uuid;
  v_o4    uuid;
  v_raise boolean;
  v_hint  text;
  v_st    text;
begin
  v_at := public.partner_debt(v_deb);
  update public.partner_credit_settings set debt_limit = v_at, block_dispatch = true where id;

  -- عروض معلّقة: إنشاؤها لا يمرّ بالحارس (الحارس على الحالة `accepted` وحدها)
  insert into public.trip_offers (booking_id, subcontractor_id, round, payout, status, expires_at)
  values (v_b1, v_deb,  1, 100, 'pending', now() + interval '1 hour') returning id into v_o1;
  insert into public.trip_offers (booking_id, subcontractor_id, round, payout, status, expires_at)
  values (v_b1, v_pend, 1, 100, 'pending', now() + interval '1 hour') returning id into v_o2;
  insert into public.trip_offers (booking_id, subcontractor_id, round, payout, status, expires_at)
  values (v_b2, v_ok,   1, 100, 'pending', now() + interval '1 hour') returning id into v_o3;

  -- (د-١) المتجاوز لا يفوز
  v_raise := false; v_hint := null;
  begin
    update public.trip_offers set status = 'accepted' where id = v_o1;
  exception when others then
    v_raise := true;
    get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if not v_raise then
    raise exception
      '(د-١) 🔒 متعهد دينه % بلغ سقفه ومع ذلك فاز بالرحلة — الحاجز في الجدول لا يعمل', v_at;
  end if;
  if v_hint is distinct from 'debt-limit' then
    raise exception
      '(د-١) الرفض جاء بالرمز «%» لا debt-limit — الاختبار غير حاسم (قد يكون رفضاً لسبب آخر)',
      coalesce(v_hint, 'بلا');
  end if;

  select o.status into v_st from public.trip_offers o where o.id = v_o1;
  if v_st <> 'pending' then
    raise exception '(د-١) حالة العرض صارت «%» بعد محاولة فاشلة', v_st;
  end if;

  -- (د-٢) وقاعدة 0014 الأصلية قائمة: غير المعتمد يُرفض بـ forbidden لا بـ debt-limit
  v_raise := false; v_hint := null;
  begin
    update public.trip_offers set status = 'accepted' where id = v_o2;
  exception when others then
    v_raise := true;
    get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if not v_raise then
    raise exception '(د-٢) متعهد غير معتمد فاز برحلة — أُضعفت قاعدة 0014 بإضافة سقف الدين';
  end if;
  if v_hint is distinct from 'forbidden' then
    raise exception '(د-٢) رفض غير المعتمد جاء بالرمز «%» لا forbidden', coalesce(v_hint, 'بلا');
  end if;

  -- (د-٣) شاهد إيجابي: السليم يفوز والسقف مضبوط — فالحارس ليس رفضاً شاملاً
  update public.trip_offers set status = 'accepted' where id = v_o3;
  select o.status into v_st from public.trip_offers o where o.id = v_o3;
  if v_st <> 'accepted' then
    raise exception '(د-٣) المتعهد السليم لم يفز — الحارس يرفض الجميع';
  end if;

  -- (د-٤) باب التجاوز الوحيد: نفس القبول ينجح بعد رفع علم القرار البشري
  perform set_config('tours.allow_partner_debt', 'on', true);
  update public.trip_offers set status = 'accepted' where id = v_o1;
  select o.status into v_st from public.trip_offers o where o.id = v_o1;
  if v_st <> 'accepted' then
    raise exception '(د-٤) التجاوز الصريح لم يُمرّر القبول — مسار manual_assign_over_limit مغلق';
  end if;

  -- (د-٥) وإغلاق الباب يعيد الرفض فوراً — فالعلم مفتاحٌ لا حالة دائمة
  perform set_config('tours.allow_partner_debt', 'off', true);
  insert into public.trip_offers (booking_id, subcontractor_id, round, payout, status, expires_at)
  values (v_b1, v_deb, 2, 100, 'pending', now() + interval '1 hour') returning id into v_o4;

  v_raise := false; v_hint := null;
  begin
    update public.trip_offers set status = 'accepted' where id = v_o4;
  exception when others then
    v_raise := true;
    get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if not v_raise or v_hint is distinct from 'debt-limit' then
    raise exception
      '(د-٥) بعد إغلاق tours.allow_partner_debt: رُفض=% والرمز «%» — التجاوز صار حالة دائمة في المعاملة',
      v_raise, coalesce(v_hint, 'بلا');
  end if;

  raise notice
    '✔ (د) المتجاوز لا يفوز (debt-limit) وغير المعتمد لا يفوز (forbidden) والسليم يفوز، والتجاوز الصريح يفتح ويُغلق';

  raise exception 'ROLLBACK_MARKER';
exception
  when others then
    if sqlerrm <> 'ROLLBACK_MARKER' then raise; end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- (هـ) `dispatch_broadcast` — من بلغ سقفه لا يصله عرض أصلاً
--
-- الشاهد الإيجابي هنا ليس «متعهداً آخر» فحسب: نفس المتعهد المحجوب يصله عرض في
-- الموجة التالية بمجرد إخماد السقف. فالفارق الوحيد بين الحالتين هو السقف.
-- ----------------------------------------------------------------------------
do $$
declare
  v_deb   uuid := current_setting('tours.pc_debtor')::uuid;
  v_ok    uuid := current_setting('tours.pc_clean')::uuid;
  v_b1    uuid := current_setting('tours.pc_b1')::uuid;
  v_at    numeric;
  v_pool  integer;
  v_made  integer;
begin
  v_at := public.partner_debt(v_deb);

  -- شاهد إيجابي أول: المتعهدان **كلاهما** في الحوض المؤهل قبل أي حجب. بدونه
  -- يمر القسم لو خرج المدين من الحوض لسبب لا علاقة له بالدين (تغطية أو مركبة).
  select count(*)::integer into v_pool
  from public.dispatch_pool(v_b1, 1) p
  where p.subcontractor_id in (v_deb, v_ok);
  if v_pool <> 2 then
    raise exception
      '(هـ-٠) حوض الموجة ١ يضم % من متعهدَي التجهيز لا ٢ — التجهيز نفسه خطأ فالغياب لاحقاً لن يعني شيئاً',
      v_pool;
  end if;

  update public.partner_credit_settings set debt_limit = v_at, block_dispatch = true where id;

  v_made := public.dispatch_broadcast(v_b1, 1);

  if not exists (
    select 1 from public.trip_offers o
    where o.booking_id = v_b1 and o.subcontractor_id = v_ok and o.round = 1
  ) then
    raise exception '(هـ-١) البث لم يصنع عرضاً للمتعهد السليم (% عرضاً في الموجة) — الحجب صار شاملاً', v_made;
  end if;

  if exists (
    select 1 from public.trip_offers o
    where o.booking_id = v_b1 and o.subcontractor_id = v_deb and o.round = 1
  ) then
    raise exception
      '(هـ-٢) 🔒 وصل عرضٌ لمتعهد دينه % بلغ السقف % — البث لا يقرأ الحكم', v_at, v_at;
  end if;

  -- (هـ-٣) وبإخماد السقف يصله العرض في الموجة التالية — نفس المتعهد ونفس الحجز
  update public.partner_credit_settings set debt_limit = 0 where id;
  v_made := public.dispatch_broadcast(v_b1, 2);

  if not exists (
    select 1 from public.trip_offers o
    where o.booking_id = v_b1 and o.subcontractor_id = v_deb and o.round = 2
  ) then
    raise exception
      '(هـ-٣) المدين لم يصله عرض حتى بعد إخماد السقف (% عرضاً) — غيابه في (هـ-٢) لم يكن بسبب الدين',
      v_made;
  end if;

  raise notice
    '✔ (هـ) البث يتخطى من بلغ سقفه ويصل السليم — وبإخماد السقف يصل المدين نفسه في الموجة التالية';

  raise exception 'ROLLBACK_MARKER';
exception
  when others then
    if sqlerrm <> 'ROLLBACK_MARKER' then raise; end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- (و) `portal_offers` — لا يبقى زرٌّ يفشل دائماً
--
-- العرض الذي بُث قبل بلوغ السقف يبقى في الجدول. فلولا شرط ق١٠ لرأى المتعهد زراً
-- يرفضه حارس ق٨ في كل مرة — وهو نمط الفشل ٣ (طريق مسدود).
-- ----------------------------------------------------------------------------
do $$
declare
  v_deb   uuid := current_setting('tours.pc_debtor')::uuid;
  v_prof  constant uuid := 'e2000000-0000-4000-8000-0000000000aa';
  v_b1    uuid := current_setting('tours.pc_b1')::uuid;
  v_ident text := current_setting('tours.pc_identity', true);
  v_at    numeric;
  v_seen  integer;
begin
  if v_ident is distinct from '1' then
    raise notice '  ↳ (و) تخطٍّ: بلا هوية دخول للمتعهد المدين';
    return;
  end if;

  v_at := public.partner_debt(v_deb);

  insert into public.dispatches as d (booking_id, status, round, last_broadcast_at)
  values (v_b1, 'broadcasting', 1, now())
  on conflict (booking_id) do update set status = 'broadcasting', round = 1;

  insert into public.trip_offers (booking_id, subcontractor_id, round, payout, status, expires_at)
  values (v_b1, v_deb, 1, 100, 'pending', now() + interval '1 hour');

  perform set_config('request.jwt.claim.sub', v_prof::text, false);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_prof)::text, false);

  -- (و-٠) شاهد إيجابي: بالسقف مخموداً يرى المتعهد عرضه فعلاً — فالغياب لاحقاً
  --       ليس عطلاً في الهوية ولا في شروط الصندوق السبعة.
  update public.partner_credit_settings set debt_limit = 0, block_dispatch = true where id;
  select count(*)::integer into v_seen from public.portal_offers() o where o.reference is not null;
  if v_seen < 1 then
    raise exception
      '(و-٠) المتعهد لا يرى عرضه والسقف مخمود — التجهيز أو الهوية خطأ، فالغياب لاحقاً بلا معنى';
  end if;

  -- (و-٠ب) 🔒 وما يراه في خانة «المرجع» **ليس مرجع العميل** (هجرة 0028).
  --        العيب الذي أُغلق: `portal_trips` تعطيه هاتف العميل بحكم التنفيذ، فلو
  --        رأى المرجع أيضاً لاجتمع لديه عاملا «تابع حجزك» ⇒ توكن الحجز ⇒ سعر
  --        العميل ⇒ **هامشنا**. فالاختبار يقارن بالمرجع الحقيقي لا بالشكل.
  declare
    v_seen_ref text;
    v_real_ref text;
  begin
    select o.reference into v_seen_ref from public.portal_offers() o limit 1;
    select b.reference into v_real_ref from public.bookings b where b.id = v_b1;

    if v_seen_ref = v_real_ref then
      raise exception
        '(و-٠ب) 🔒 البورتال يعرض مرجع العميل «%» — العامل الثاني في «تابع حجزك» بيد المتعهد', v_real_ref;
    end if;

    if v_seen_ref is distinct from public.partner_trip_code(v_b1) then
      raise exception '(و-٠ب) المرجع المعروض «%» لا يطابق partner_trip_code المتوقع «%»',
        coalesce(v_seen_ref, 'بلا'), coalesce(public.partner_trip_code(v_b1), 'بلا');
    end if;
  end;

  -- (و-١) وبضبط السقف يختفي العرض من صندوقه
  update public.partner_credit_settings set debt_limit = v_at, block_dispatch = true where id;
  select count(*)::integer into v_seen from public.portal_offers() o where o.reference is not null;
  if v_seen <> 0 then
    raise exception
      '(و-١) 🔒 المتعهد الذي بلغ سقفه ما زال يرى % عرضاً — زرٌّ يفشل في كل مرة يُضغط', v_seen;
  end if;

  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claims', '', false);

  raise notice '✔ (و) صندوق البورتال يُخفي عرض من بلغ سقفه، ويُظهره حين يخمد السقف';

  raise exception 'ROLLBACK_MARKER';
exception
  when others then
    perform set_config('request.jwt.claim.sub', '', false);
    perform set_config('request.jwt.claims', '', false);
    if sqlerrm <> 'ROLLBACK_MARKER' then raise; end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- (ز) قواعد الدفع — «فلا ندفع لمتعهد بينما لنا عنده مال»
--
-- ⚠ ترتيب الاختبارات هنا **ليس اعتباطاً**: `record_partner_payout_advance` ترفع
-- `tours.allow_partner_advance` بـ `set_config(..., true)` — أي محلياً للمعاملة
-- لا للدالة. فاستدعاؤها أولاً كان سيُبطل كل فحص بعدها بهدوء. لذلك: الرفض أولاً،
-- ثم التجاوز، ثم إغلاق الباب وإعادة التحقق.
-- ----------------------------------------------------------------------------
do $$
declare
  v_deb   uuid := current_setting('tours.pc_debtor')::uuid;
  v_cre   uuid := current_setting('tours.pc_creditor')::uuid;
  v_acc   uuid := current_setting('tours.pc_account')::uuid;
  v_debt  numeric;
  v_amt   numeric;
  v_raise boolean;
  v_hint  text;
  v_rec   record;
  v_n     integer;
begin
  update public.partner_credit_settings set block_payout = true where id;

  v_debt := public.partner_debt(v_deb);
  -- مبلغ الدفعة مشتق من الدين لا مكتوب: أي جزء منه يكفي، والقاعدة لا تقرأ المبلغ
  v_amt  := round(v_debt / 10, 2);

  -- (ز-١) الدالة ترفض الدفع لمن هو مدين لنا
  v_raise := false; v_hint := null;
  begin
    perform public.record_partner_payout(v_deb, v_acc, v_amt, now(), 'PARTNER_CREDIT_FIXTURE دفعة');
  exception when others then
    v_raise := true;
    get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if not v_raise then
    raise exception '(ز-١) سُجّلت دفعة لمتعهد مدين لنا بـ % — قاعدة block_payout بلا أثر', v_debt;
  end if;
  if v_hint is distinct from 'partner-owing' then
    raise exception '(ز-١) الرفض جاء بالرمز «%» لا partner-owing — الاختبار غير حاسم',
      coalesce(v_hint, 'بلا');
  end if;

  -- (ز-٢) 🔒 **الحاجز في الجدول**: إدراج مباشر يتخطى الدالة بالكامل — وهو ما
  --        يستطيعه أي مشرف عبر PostgREST بحكم منح 0015 وسياسته.
  v_raise := false; v_hint := null;
  begin
    insert into public.partner_payouts (subcontractor_id, account_id, amount, occurred_at, note)
    values (v_deb, v_acc, v_amt, now(), 'PARTNER_CREDIT_FIXTURE إدراج مباشر');
  exception when others then
    v_raise := true;
    get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if not v_raise then
    raise exception
      '(ز-٢) 🔒 نجح إدراج دفعة مباشرةً في partner_payouts لمتعهد مدين بـ % — الفحص داخل الدالة وحده لا يكفي، وأي مشرف يتخطاه من PostgREST',
      v_debt;
  end if;
  if v_hint is distinct from 'partner-owing' then
    raise exception '(ز-٢) رفض الإدراج المباشر جاء بالرمز «%» لا partner-owing', coalesce(v_hint, 'بلا');
  end if;

  -- (ز-٣) شاهد إيجابي: غير المدين تُسجَّل دفعته والقاعدة مفعّلة
  select * into v_rec
  from public.record_partner_payout(v_cre, v_acc, v_amt, now(), 'PARTNER_CREDIT_FIXTURE دفعة للدائن');
  if v_rec.id is null or v_rec.entry_id is null then
    raise exception '(ز-٣) دفعة الدائن لم تُسجَّل أو لم تولّد قيداً — القاعدة تمنع الجميع';
  end if;

  -- (ز-٤) المقدَّم الصريح بلا سبب مكتوب يُرفض — رقمٌ بلا مصدر يفسد الدفاتر
  v_raise := false; v_hint := null;
  begin
    perform public.record_partner_payout_advance(v_deb, v_acc, v_amt, now(), '   ');
  exception when others then
    v_raise := true;
    get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if not v_raise then
    raise exception '(ز-٤) قُبل مقدَّم بلا سبب مكتوب — بعد ستة أشهر لا أحد يعرف مصدر الرقم';
  end if;
  if v_hint is distinct from 'note-required' then
    raise exception '(ز-٤) رفض المقدَّم بلا سبب جاء بالرمز «%» لا note-required', coalesce(v_hint, 'بلا');
  end if;

  -- (ز-٥) وبسبب مكتوب يمر — وهو باب التجاوز البشري الوحيد
  select * into v_rec
  from public.record_partner_payout_advance(
         v_deb, v_acc, v_amt, now(), 'PARTNER_CREDIT_FIXTURE مقدَّم عن رحلات قادمة');
  if v_rec.id is null or v_rec.entry_id is null then
    raise exception '(ز-٥) المقدَّم بسبب مكتوب لم يُسجَّل — باب التجاوز مغلق فلا مخرج للمالك';
  end if;

  select count(*)::integer into v_n
  from public.partner_payouts p where p.id = v_rec.id;
  if v_n <> 1 then
    raise exception '(ز-٥) صف الدفعة غير موجود بعد نجاح المقدَّم';
  end if;

  -- (ز-٦) وإغلاق الباب يعيد الرفض على الإدراج المباشر نفسه
  perform set_config('tours.allow_partner_advance', 'off', true);
  v_raise := false; v_hint := null;
  begin
    insert into public.partner_payouts (subcontractor_id, account_id, amount, occurred_at, note)
    values (v_deb, v_acc, v_amt, now(), 'PARTNER_CREDIT_FIXTURE إدراج بعد إغلاق الباب');
  exception when others then
    v_raise := true;
    get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if not v_raise or v_hint is distinct from 'partner-owing' then
    raise exception
      '(ز-٦) بعد إغلاق tours.allow_partner_advance: رُفض=% والرمز «%» — التجاوز صار حالة دائمة في المعاملة',
      v_raise, coalesce(v_hint, 'بلا');
  end if;

  raise notice
    '✔ (ز) الدفع لمدين مرفوض من الدالة **ومن الجدول**، والدائن يُدفع له، والمقدَّم يلزمه سبب مكتوب، والباب يُغلق بعده';

  raise exception 'ROLLBACK_MARKER';
exception
  when others then
    if sqlerrm <> 'ROLLBACK_MARKER' then raise; end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- (ز-ب) 🔒 البرهان على أن الكتل أرجعت نفسها فعلاً
--
-- هذا القسم يختبر **آلية أمان هذا الملف** لا الهجرة: الأقسام (ب) و(ج-٢) و(د)
-- و(هـ) و(و) و(ز) ضبطت `debt_limit` وحجبت شركاء وسجّلت دفعات وقيوداً في الدفتر
-- على قاعدة حيّة. فلو لم تكن نقطة الحفظ الضمنية تُرجِع ما بداخلها لكانت سياسة
-- الائتمان الآن مضبوطة على سقف التجهيز — أي أن كل متعهد حقيقي دينه أعلى صار
-- محجوباً بلا قرار من المالك. يُفحص هذا **قبل** التنظيف لأن التنظيف يستعيد
-- الإعدادات على أي حال فيطمس الدليل.
-- ----------------------------------------------------------------------------
do $$
declare
  v_saved jsonb := current_setting('tours.pc_saved')::jsonb;
  v_now   jsonb;
  v_n     integer;
begin
  select to_jsonb(c) into v_now from public.partner_credit_settings c limit 1;

  if (v_now ->> 'debt_limit')::numeric is distinct from (v_saved ->> 'debt_limit')::numeric
     or (v_now ->> 'block_dispatch')::boolean is distinct from (v_saved ->> 'block_dispatch')::boolean
     or (v_now ->> 'block_payout')::boolean is distinct from (v_saved ->> 'block_payout')::boolean then
    raise exception
      '(ز-ب) 🔒 سياسة الائتمان لم تعد كما كانت قبل التنظيف — كتلة ROLLBACK_MARKER لم تُرجِع نفسها، وسقف التجهيز (%) بقي نافذاً على القاعدة كلها',
      v_now ->> 'debt_limit';
  end if;

  -- ولا بقي أثرٌ لما صنعته تلك الكتل: عروض، ولا دفعات، ولا قيود دفتر
  select count(*)::integer into v_n
  from public.trip_offers o
  join public.bookings b on b.id = o.booking_id
  where b.trip ->> 'notes' like 'PARTNER_CREDIT_FIXTURE%';
  if v_n <> 0 then
    raise exception '(ز-ب) بقي % عرض من كتل الإنفاذ — الإرجاع لم يقع', v_n;
  end if;

  select count(*)::integer into v_n
  from public.partner_payouts p
  join public.subcontractors s on s.id = p.subcontractor_id
  where s.company_name like 'PARTNER_CREDIT_FIXTURE%';
  if v_n <> 0 then
    raise exception '(ز-ب) بقيت % دفعة من كتلة (ز) — الإرجاع لم يقع', v_n;
  end if;

  select count(*)::integer into v_n
  from public.ledger_entries e where e.source_type = 'partner_payout' and e.settlement_role = 'paid'
    and e.subcontractor_id in (select s.id from public.subcontractors s
                                where s.company_name like 'PARTNER_CREDIT_FIXTURE%');
  if v_n <> 0 then
    raise exception '(ز-ب) بقي % قيد صرف من كتلة (ز) — الإرجاع لم يقع', v_n;
  end if;

  -- شاهد إيجابي: ما زُرع **خارج** الكتل باقٍ. بدونه يمر القسم لو كان كل شيء
  -- قد رُجع (بما فيه التجهيز) فصار الفحص أعلاه صحيحاً لسبب آخر تماماً.
  select count(*)::integer into v_n
  from public.subcontractors s where s.company_name like 'PARTNER_CREDIT_FIXTURE%';
  if v_n <> 4 then
    raise exception
      '(ز-ب) متعهدو التجهيز % لا ٤ — الإرجاع ابتلع ما زُرع خارج الكتل أيضاً، فالفحوص أعلاه بلا معنى', v_n;
  end if;

  raise notice
    '✔ (ز-ب) 🔒 كل كتلة إنفاذ أرجعت نفسها: سياسة الائتمان كما كانت، ولا عرض ولا دفعة ولا قيد باقٍ — والتجهيز خارجها سليم';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ح) 🔒 العزل — لا الزائر ولا المسجَّل ينفّذ حساب الدين
--
-- كل متعهد مستخدم `authenticated`. فمنح أيٍّ من الثلاث له يجعله يستكشف دين
-- منافسه بالتجربة الثنائية على السقف (سابقة `coverage_matches` في 0011).
-- ----------------------------------------------------------------------------
do $$
declare
  v_bad text;
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    select string_agg(x.sig, '، ')
      into v_bad
    from (values
      ('public.partner_debt(uuid)'),
      ('public.partner_over_debt_limit(uuid)'),
      ('public.partner_credit_config()')
    ) as x(sig)
    where has_function_privilege('anon', x.sig, 'execute');

    if v_bad is not null then
      raise exception '(ح-١) الزائر ينفّذ دوال حساب الدين: %', v_bad;
    end if;

    if has_table_privilege('anon', 'public.partner_credit_settings', 'select') then
      raise exception '(ح-١) الزائر يقرأ partner_credit_settings — سياسة ائتمان داخلية على الملأ';
    end if;
  end if;

  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    select string_agg(x.sig, '، ')
      into v_bad
    from (values
      ('public.partner_debt(uuid)'),
      ('public.partner_over_debt_limit(uuid)'),
      ('public.partner_credit_config()')
    ) as x(sig)
    where has_function_privilege('authenticated', x.sig, 'execute');

    if v_bad is not null then
      raise exception
        '(ح-٢) 🔒 المسجَّل ينفّذ دوال حساب الدين: % — وكل متعهد مسجَّل، فيستكشف دين منافسه بالتجربة',
        v_bad;
    end if;

    -- شاهد إيجابي للمسبار نفسه: has_function_privilege ترجع true لما هو ممنوح
    -- فعلاً. بلا هذا يمر القسم كله لو صارت الدالة ترجع false دائماً.
    if not has_function_privilege(
             'authenticated',
             'public.record_partner_payout_advance(uuid,uuid,numeric,timestamptz,text)',
             'execute') then
      raise exception
        '(ح-٣) المسجَّل لا ينفّذ record_partner_payout_advance — إمّا انكسر منح 0027 أو أن المسبار نفسه معطّل فلا يصدَّق ما قبله';
    end if;
    if not has_function_privilege('authenticated', 'public.portal_offers()', 'execute') then
      raise exception '(ح-٣) المسجَّل لا ينفّذ portal_offers — انكسر منح 0013، أو المسبار معطّل';
    end if;
  end if;

  raise notice
    '✔ (ح) partner_debt و partner_over_debt_limit و partner_credit_config ممنوعة على anon و authenticated معاً — والمسبار مُثبَت بشاهد إيجابي';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ط) شكل العرض — `security_invoker` باقٍ، والعمودان **بعد** `abs_net_due`
--
-- الترتيب ليس ذوقاً: `create or replace view` لا تسمح بإعادة ترتيب الأعمدة
-- القائمة، فأي إدراج في الوسط يعني أن هجرة لاحقة لن تُطبَّق على قاعدة قائمة.
-- ----------------------------------------------------------------------------
do $$
declare
  v_abs integer;
  v_owe integer;
  v_ovl integer;
begin
  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'v_partner_settlements'
      and c.reloptions::text like '%security_invoker=true%'
  ) then
    raise exception
      '(ط-١) 🔒 v_partner_settlements فقدت security_invoker — العرض صار يتجاوز RLS الدفتر فيكشف مقاصة الشركاء لكل مسجَّل';
  end if;

  select max(c.ordinal_position) filter (where c.column_name = 'abs_net_due'),
         max(c.ordinal_position) filter (where c.column_name = 'owed_to_us'),
         max(c.ordinal_position) filter (where c.column_name = 'over_limit')
    into v_abs, v_owe, v_ovl
  from information_schema.columns c
  where c.table_schema = 'public' and c.table_name = 'v_partner_settlements';

  if v_abs is null or v_owe is null or v_ovl is null then
    raise exception '(ط-٢) أعمدة العرض ناقصة (abs=% owed=% over=%)',
      coalesce(v_abs::text, 'بلا'), coalesce(v_owe::text, 'بلا'), coalesce(v_ovl::text, 'بلا');
  end if;

  if v_owe <= v_abs or v_ovl <= v_owe then
    raise exception
      '(ط-٢) ترتيب الأعمدة abs_net_due=% owed_to_us=% over_limit=% — الجديدان يجب أن يقعا بعد abs_net_due بالترتيب',
      v_abs, v_owe, v_ovl;
  end if;

  raise notice '✔ (ط) العرض security_invoker، و owed_to_us (%) و over_limit (%) بعد abs_net_due (%)',
    v_owe, v_ovl, v_abs;
end;
$$;

-- ----------------------------------------------------------------------------
-- (ي) التنظيف — وإعادة الإعدادات كما كانت بالضبط
-- ----------------------------------------------------------------------------
do $$
declare
  v_saved   jsonb := nullif(current_setting('tours.pc_saved', true), '')::jsonb;
  v_admin   uuid  := nullif(current_setting('tours.pc_admin', true), '')::uuid;
  v_fixture text  := current_setting('tours.pc_admin_fixture', true);
begin
  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claims', '', false);
  perform set_config('tours.allow_partner_debt', 'off', false);
  perform set_config('tours.allow_partner_advance', 'off', false);

  delete from public.ledger_entries e
   where e.subcontractor_id in (select s.id from public.subcontractors s
                                 where s.company_name like 'PARTNER_CREDIT_FIXTURE%')
      or e.account_id in (select pa.id from public.payment_accounts pa
                           where pa.label like 'PARTNER_CREDIT_FIXTURE%')
      or e.booking_id in (select b.id from public.bookings b
                           where b.trip ->> 'notes' like 'PARTNER_CREDIT_FIXTURE%');

  delete from public.partner_payouts p
   where p.subcontractor_id in (select s.id from public.subcontractors s
                                 where s.company_name like 'PARTNER_CREDIT_FIXTURE%')
      or p.account_id in (select pa.id from public.payment_accounts pa
                           where pa.label like 'PARTNER_CREDIT_FIXTURE%');

  delete from public.notifications n
   where n.payload ->> 'bookingId' in (
         select b.id::text from public.bookings b
          where b.trip ->> 'notes' like 'PARTNER_CREDIT_FIXTURE%');

  delete from public.bookings b where b.trip ->> 'notes' like 'PARTNER_CREDIT_FIXTURE%';
  delete from public.subcontractors s where s.company_name like 'PARTNER_CREDIT_FIXTURE%';
  delete from public.payment_accounts pa where pa.label like 'PARTNER_CREDIT_FIXTURE%';

  delete from public.profiles p where p.id = 'e2000000-0000-4000-8000-0000000000aa'::uuid;
  begin
    delete from auth.users u where u.id = 'e2000000-0000-4000-8000-0000000000aa'::uuid;
  exception when others then null;
  end;

  if v_fixture = '1' and v_admin is not null then
    delete from public.profiles p where p.id = v_admin;
    begin
      delete from auth.users u where u.id = v_admin;
    exception when others then null;
    end;
  end if;

  -- الإعدادات تُعاد صراحةً — لا اتكالاً على أن كل كتلة أرجعت نفسها
  if v_saved is not null then
    update public.partner_credit_settings
       set debt_limit     = (v_saved ->> 'debt_limit')::numeric,
           block_dispatch = (v_saved ->> 'block_dispatch')::boolean,
           block_payout   = (v_saved ->> 'block_payout')::boolean
     where id;
  end if;

  raise notice '✔ (ي) التنظيف تم وإعدادات الائتمان مُستعادة (سقف = %)', (v_saved ->> 'debt_limit');
end;
$$;

-- ----------------------------------------------------------------------------
-- فحص أخير: لم يبقَ أثر، ولا إعداد انزاح
-- ----------------------------------------------------------------------------
do $$
declare
  v_saved jsonb := current_setting('tours.pc_saved')::jsonb;
  v_now   jsonb;
  v_n     integer;
begin
  select count(*)::integer into v_n
  from public.subcontractors s where s.company_name like 'PARTNER_CREDIT_FIXTURE%';
  if v_n <> 0 then
    raise exception 'تنظيف ناقص: % متعهد اختباري باقٍ', v_n;
  end if;

  select count(*)::integer into v_n
  from public.bookings b where b.trip ->> 'notes' like 'PARTNER_CREDIT_FIXTURE%';
  if v_n <> 0 then
    raise exception 'تنظيف ناقص: % حجز اختباري باقٍ', v_n;
  end if;

  select count(*)::integer into v_n
  from public.ledger_entries e where e.note like 'PARTNER_CREDIT_FIXTURE%';
  if v_n <> 0 then
    raise exception 'تنظيف ناقص: % قيد اختباري باقٍ في الدفتر', v_n;
  end if;

  select count(*)::integer into v_n
  from public.trip_offers o
  where not exists (select 1 from public.bookings b where b.id = o.booking_id);
  if v_n <> 0 then
    raise exception 'تنظيف ناقص: % عرض يتيم باقٍ', v_n;
  end if;

  select to_jsonb(c) into v_now from public.partner_credit_settings c limit 1;

  if (v_now ->> 'debt_limit')::numeric     is distinct from (v_saved ->> 'debt_limit')::numeric
     or (v_now ->> 'block_dispatch')::boolean is distinct from (v_saved ->> 'block_dispatch')::boolean
     or (v_now ->> 'block_payout')::boolean   is distinct from (v_saved ->> 'block_payout')::boolean then
    raise exception
      'استعادة ناقصة: سياسة الائتمان لم تعد كما كانت — الآن (سقف % حجب % دفع %) والأصل (سقف % حجب % دفع %)',
      v_now ->> 'debt_limit', v_now ->> 'block_dispatch', v_now ->> 'block_payout',
      v_saved ->> 'debt_limit', v_saved ->> 'block_dispatch', v_saved ->> 'block_payout';
  end if;

  perform set_config('tours.pc_saved', '', false);

  raise notice 'ALL PASSED — الإشارة مثبتة من البيانات، وجدول حقيقة السقف كامل، والعرض يسم المتجاوز حتى بلا حجب، والبث والقبول والبورتال تحجب من بلغ سقفه، والدفع لمدين مرفوض من الدالة ومن الجدول معاً، والدوال الثلاث ممنوعة على anon و authenticated';
end;
$$;
