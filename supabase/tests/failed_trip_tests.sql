-- ============================================================================
-- failed_trip_tests.sql — اختبارات قبول للرحلة الفاشلة
--                          (الموجة الثانية · هجرة 0051_failed_trips.sql)
--
-- كيف تشغّله: `pnpm db:test failed_trip` أو الصق الملف كاملاً في SQL Editor.
-- النجاح = آخر سطر «ALL PASSED». وأي فشل exception عربية فيها المتوقع والفعلي.
--
-- ومن psql بدور صاحب القاعدة **لا بد** من ON_ERROR_STOP و‑1 معاً:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f supabase/tests/failed_trip_tests.sql
--
-- ══════════════════════════════════════════════════════════════════════════
--  🔒 لماذا لا سطرَ `delete` واحداً في هذا الملف
-- ══════════════════════════════════════════════════════════════════════════
--
-- `booking_failures` مُلحَقٌ بمُشغّلٍ يرفض الحذف، و`ledger_entries` و
-- `loyalty_entries` كذلك. فمجموعةٌ تكتب فيها **لا تستطيع أن تنظّف نفسها** — ولو
-- فُتح لها بابٌ لكان ذلك الباب هو العطب بعينه.
--
-- فالقياس كله داخل **معاملةٍ فرعية تُرجَع**، و«صفر أثر» تصير خاصيةً بنيوية:
-- لا صفَّ يُكتب ولو انهار التشغيل في منتصفه، ولا إعداداتٍ تُحفظ وتُستعاد.
-- والقسم (ي) يقيس ذلك بأعداد الصفوف **قبل وبعد**.
--
-- ⚠ وهذه **قاعدة الإنتاج نفسها** (اتفاقية ٨): صفٌّ يبقى هنا هو رحلةٌ فاشلة
--    في سجلٍّ حقيقي، أو قيدٌ في حساب متعهدٍ حقيقي.
--
-- ── ولا بيانات حقيقية ──────────────────────────────────────────────────────
--   • إحداثيات **صحراوية نائية** (٢٥٫٠، ٢٧٫٥) ← (٢٤٫٥، ٢٨٫٢): لا متعهد
--     يغطيها، فلا يفشل الاختبار **لأن المشروع نجح** (النمط ٦).
--   • المتعهد والفئة والتعريفة **يخلقها الملف**، فلا رقم من كتالوج المالك.
--   • وكل توقّع يُشتق من مصدر الكود المُختبَر: مستحق الإسناد من `dispatches`،
--     والنقاط من `loyalty_config()`، والنافذة من `failed_reclass_window()`.
--
-- ما يغطيه الملف:
--   (٠)  الشروط المسبقة · (٠-ب) خط الأساس
--   (أ)  الكتالوج: البذرة الستّ بإجراءاتها، وقيودُه ترفض ما يجب
--   (ب)  الانتقالات: `assigned⇒failed` و`completed⇒failed`، و`failed` نهائية
--   (ج)  لا فشلَ بلا صفِّ سبب — ولا كاتبَ غير `mark_booking_failed`
--   (د)  اللقطة لا تتبع الكتالوج، والحذف ممنوعٌ بنيوياً
--   (هـ) جدول الأثر المالي الست حالات كاملاً
--   (و)  الولاء: يُعكس من `completed`، ولا شيء يُعكس من `assigned`،
--        و**عميلٌ أنفق نقاطه لا يمنع إعادة التصنيف** (‏و-٦ · هجرة `0053`)
--   (ز)  نافذة الـ٤٨ ساعة: تفتح وتغلق، والرفض بلا أثر (D-48)
--   (ح)  المدخلات المرفوضة (سبب مجهول · معطَّل · تجاوز بلا مبرر · خصم بلا مبلغ)
--   (ط)  العزل: المتعهد والزائر — والبورتال يرى الحالة ولا يرى السبب
--   (ي)  صفر أثر
--
-- المرجع: supabase/migrations/0051_failed_trips.sql
--         · docs/phase-briefs/FAILED-TRIPS-AND-PARTNER-ALERTS.md
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (٠) الشروط المسبقة — قراءةٌ محضة، ولا كتابة قبل المعاملة الفرعية
-- ----------------------------------------------------------------------------
do $$
declare
  v_missing text;
begin
  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claims', '', false);

  select string_agg(x.rel, '، ') into v_missing
  from (values
    ('public.failure_reasons'), ('public.booking_failures'),
    ('public.bookings'), ('public.dispatches'), ('public.ledger_entries'),
    ('public.loyalty_entries'), ('public.v_partner_settlements')
  ) as x(rel)
  where to_regclass(x.rel) is null;
  if v_missing is not null then
    raise exception 'شرط مسبق: كائنات مفقودة (نفّذ 0051_failed_trips.sql أولاً): %', v_missing;
  end if;

  select string_agg(x.sig, '، ') into v_missing
  from (values
    ('public.mark_booking_failed(uuid, text, text, numeric, text)'),
    ('public.failed_reclass_window()'),
    ('public.booking_completed_at(uuid)'),
    ('public.loyalty_reverse_booking(uuid, text)'),
    ('public.guard_booking_failed()'),
    ('public.record_partner_adjustment(uuid, text, numeric, timestamptz, text)'),
    ('public.reverse_ledger_entry(uuid, text)')
  ) as x(sig)
  where to_regprocedure(x.sig) is null;
  if v_missing is not null then
    raise exception 'شرط مسبق: دوال مفقودة: %', v_missing;
  end if;

  -- المُشغّلان الجديدان مربوطان فعلاً — دالةٌ بلا مُشغّل لا تعمل
  if not exists (select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
                  where c.relname = 'bookings' and t.tgname = 'bookings_guard_failed') then
    raise exception 'شرط مسبق: مُشغّل bookings_guard_failed غير مربوط';
  end if;
  if not exists (select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
                  where c.relname = 'bookings' and t.tgname = 'bookings_loyalty_failed') then
    raise exception 'شرط مسبق: مُشغّل bookings_loyalty_failed غير مربوط';
  end if;

  raise notice '✔ (٠) الشروط المسبقة سليمة';
end;
$$;

-- ----------------------------------------------------------------------------
-- (٠-ب) خط الأساس — يُقرأ **قبل** أي شيء ويُقارَن به في (ي)
-- ----------------------------------------------------------------------------
do $$
declare
  v_f integer; v_r integer; v_b integer; v_l integer; v_y integer; v_s integer;
begin
  select count(*)::integer into v_f from public.booking_failures;
  select count(*)::integer into v_r from public.failure_reasons;
  select count(*)::integer into v_b from public.bookings;
  select count(*)::integer into v_l from public.ledger_entries;
  select count(*)::integer into v_y from public.loyalty_entries;
  select count(*)::integer into v_s from public.subcontractors;

  perform set_config('tours.ft_f', v_f::text, false);
  perform set_config('tours.ft_r', v_r::text, false);
  perform set_config('tours.ft_b', v_b::text, false);
  perform set_config('tours.ft_l', v_l::text, false);
  perform set_config('tours.ft_y', v_y::text, false);
  perform set_config('tours.ft_s', v_s::text, false);

  raise notice '✔ (٠-ب) خط الأساس: % رحلة فاشلة · % سبباً · % حجزاً · % قيد دفتر · % قيد ولاء · % متعهداً',
    v_f, v_r, v_b, v_l, v_y, v_s;
end;
$$;

-- ----------------------------------------------------------------------------
-- (أ) الكتالوج — يُقرأ قبل المعاملة الفرعية لأنه يصف حالة القاعدة الحقيقية
--
-- 🔒 البذرة المتفق عليها في الموجز §١-هـ **حرفياً**، وأهمّ بنودها أن «العميل لم
--    يحضر» ⇒ **دفعٌ كامل**: المتعهد أدّى ما عليه، فالخصم عليه ظلمٌ يُقاس.
-- ----------------------------------------------------------------------------
do $$
declare
  v_bad  text;
  v_n    integer;
begin
  select string_agg(x.slug || '⇒' || x.act, '، ') into v_bad
  from (values
    ('driver-no-show',    'deduct'),
    ('severe-delay',      'deduct'),
    ('vehicle-breakdown', 'none'),
    ('customer-no-show',  'pay'),
    ('force-majeure',     'none'),
    ('admin-decision',    'none')
  ) as x(slug, act)
  where not exists (
    select 1 from public.failure_reasons r
    where r.slug = x.slug and r.default_action = x.act
  );
  if v_bad is not null then
    raise exception '(أ-١) البذرة لا تطابق قرار المالك في: % — الجدول في §١-هـ لا يُخترع', v_bad;
  end if;

  -- والأهمّ فيها بعينه: من أدّى عمله يُدفع له كاملاً
  select count(*)::integer into v_n
  from public.failure_reasons r
  where r.slug = 'customer-no-show' and r.default_action = 'pay' and r.active;
  if v_n <> 1 then
    raise exception '(أ-٢) 🔴 «العميل لم يحضر» ليس افتراضه «دفعٌ كامل» — المتعهد أدّى ما عليه (§١-هـ)';
  end if;

  raise notice '✔ (أ) الكتالوج مبذورٌ بالقرار: ستةُ أسبابٍ بإجراءاتها، و«العميل لم يحضر» يُدفع كاملاً';
end;
$$;

-- ============================================================================
-- (ب) — (ط) القياس الحيّ كله، داخل معاملةٍ فرعية تُرجَع بكاملها
-- ============================================================================
do $$
declare
  v_sub    constant uuid := '5ea11ed0-0000-4000-8000-00000000f751';
  v_usr    constant uuid := '00000000-0000-4000-8000-00000000f751';
  v_cls    constant uuid := 'c0000000-0000-4000-8000-00000000f751';
  v_slug   constant text := 'fttest-a';
  v_phone  constant text := '01000000751';
  v_pay    constant numeric := 640;
  v_admin  uuid;
  v_norm   text;
  v_bk     record;
  v_res    record;
  v_cfg    record;
  v_f      record;
  v_ids    uuid[] := '{}';
  v_id     uuid;
  v_state  text;
  v_msg    text;
  v_n      integer;
  v_net0   numeric;
  v_net1   numeric;
  v_bal    integer;
  v_total  numeric;
  v_exp    integer;
  v_win    interval;
begin
  -- مسبار المسبار: بلا مشرفٍ حقيقي لا معنى لأي قياس صلاحيات
  select p.id into v_admin from public.profiles p where p.role = 'admin' limit 1;
  if v_admin is null then
    raise exception '(ب-٠) لا مشرف في القاعدة — كل ما يلي كان سيقيس رفضاً لا سلوكاً';
  end if;
  v_win := public.failed_reclass_window();

  begin
    -- ══ الفيكسترة ═════════════════════════════════════════════════════════
    update public.loyalty_settings set enabled = true, points_per_currency = 1;

    -- ⚠ والقراءة **بعد** الفيكسترة لا قبلها — وهذا موضعُ حمرةٍ مقيسة:
    --   كانت `loyalty_config()` تُقرأ قبل السطر أعلاه، فتُرجع سعرَ المالك الحيّ.
    --   ويوم 2026-08-17 رفعه بدر إلى 1.25، فصار (و-٢) يقارن ما سكّه المُشغّل
    --   بسعرٍ **لم يعمل به** (‏3000 مقابل 3750) — أي مجموعةٌ تحمرّ كلما غيّر
    --   المالك رقماً في لوحته، وهو النمط ٦ في `handover/LESSONS.md` حرفياً.
    --   والاختبار يملك بياناته: التوقّع يُشتق من **نفس المدخل** الذي رآه الكود.
    select * into v_cfg from public.loyalty_config();

    insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                            created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
    values (v_usr, '00000000-0000-0000-0000-000000000000', 'authenticated',
            'authenticated', 'failedtrip@example.invalid', 'x', now(), now(),
            '{}'::jsonb, '{"full_name": "FAILED_TRIP_TESTS متعهد"}'::jsonb);

    insert into public.subcontractors (id, profile_id, company_name, contact_name, phone, status)
    values (v_sub, v_usr, 'FAILED_TRIP_TESTS متعهد', 'FT', '01000000000', 'approved');

    insert into public.vehicle_classes (id, slug, title, capacity, luggage_capacity, active, sort)
    values (v_cls, v_slug, 'FAILED_TRIP_TESTS فئة', 1, 4, true, 9751);
    insert into public.tariffs (class_id, per_km, base_fee, min_price,
                                waiting_hour_price, round_trip_factor)
    values (v_cls, 20, 1000, 0, 0, 1.8);

    v_norm := public.normalize_phone(v_phone);
    if v_norm is null then
      raise exception '(ب-٠) هاتف الفيكسترة لا يُطبَّع — وعاء النقاط غير موجود';
    end if;

    perform set_config('request.jwt.claims',
      json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

    -- ست حجوزات مُسندة متطابقة تماماً: لا يفرّق بينها إلا الإجراء المُختبَر
    for v_n in 1 .. 6 loop
      select * into v_bk from public.create_booking(
        jsonb_build_object('label', 'FT مبدأ' || v_n, 'lat', 25.0, 'lng', 27.5),
        jsonb_build_object('label', 'FT منتهى' || v_n, 'lat', 24.5, 'lng', 28.2),
        1, false, 0, 100, 90, 'estimate', v_slug, 'full',
        'FAILED_TRIP_TESTS عميل' || v_n, v_phone, null,
        now() + interval '3 days' + make_interval(days => v_n),
        'FAILED_TRIP_TESTS_FIXTURE', null, null, 0, null, 0);
      v_ids := v_ids || v_bk.id;

      update public.bookings set status = 'under_review' where id = v_bk.id;
      update public.bookings set status = 'confirmed'    where id = v_bk.id;
      insert into public.dispatches (booking_id, status, round,
                                     assigned_subcontractor_id, assigned_payout, assigned_at)
      values (v_bk.id, 'assigned', 1, v_sub, v_pay, now());
      update public.bookings set status = 'assigned' where id = v_bk.id;
    end loop;

    select b.total into v_total from public.bookings b where b.id = v_ids[1];
    if coalesce(v_total, 0) <= 0 then
      raise exception '(ب-٠) إجمالي الحجز صفر — كل قياس مالي بعده يقارن أصفاراً';
    end if;

    raise notice '✔ (ب-٠) ستةُ حجوزات مُسندة (إجمالي % · مستحق %) داخل معاملةٍ فرعية تُرجَع',
      v_total, v_pay;

    -- ══ (ب) الانتقالات ═════════════════════════════════════════════════════
    if not public.booking_transition_allowed('assigned', 'failed') then
      raise exception '(ب-١) assigned ⇒ failed غير مسموح';
    end if;
    if not public.booking_transition_allowed('completed', 'failed') then
      raise exception '(ب-٢) completed ⇒ failed غير مسموح — الشكوى بعد الاكتمال بلا مخرج';
    end if;
    -- 🔒 ولا زوجَ ينطلق من `failed`
    for v_state in select unnest(array['pending_payment','under_review','confirmed',
                                       'assigned','completed','cancelled','failed']) loop
      if public.booking_transition_allowed('failed', v_state) then
        raise exception '(ب-٣) 🔴 failed ⇒ % مسموح — الحالة ليست نهائية (§١-ج)', v_state;
      end if;
    end loop;
    -- وشاهدٌ إيجابي: الدالة ما زالت تقول «نعم» لزوجٍ قديم، فالحلقة أعلاه ليست عمياء
    if not public.booking_transition_allowed('confirmed', 'assigned') then
      raise exception '(ب-٣) الدالة ترفض confirmed⇒assigned — الحلقة أعلاه كانت ستمرّ على دالةٍ معطوبة';
    end if;

    -- ══ (ج) لا فشلَ بلا صفِّ سبب ════════════════════════════════════════════
    v_msg := null;
    begin
      update public.bookings set status = 'failed' where id = v_ids[1];
      v_msg := '(قُبل)';
    exception when others then
      get stacked diagnostics v_msg = message_text;
    end;
    if v_msg = '(قُبل)' then
      raise exception '(ج-١) 🔴 تحديثٌ مباشر علّم الرحلة فاشلة بلا سببٍ ولا قرارٍ مالي';
    end if;
    if v_msg not like '%mark_booking_failed%' then
      raise exception '(ج-١) الرفض جاء برسالة «%» — ليست رسالة الحارس', v_msg;
    end if;

    -- وحتى المدخل الإداري الرسمي لا يفتح الباب: `set_booking_status` تصطدم به
    v_msg := null;
    begin
      perform public.set_booking_status(v_ids[1], 'failed', 'محاولة من اللوحة');
      v_msg := '(قُبل)';
    exception when others then
      get stacked diagnostics v_msg = message_text;
    end;
    if v_msg = '(قُبل)' then
      raise exception '(ج-٢) 🔴 set_booking_status علّمت رحلةً فاشلة — مسارٌ ثانٍ بلا سببٍ ولا مال';
    end if;

    raise notice '✔ (ج) لا مسار إلى «فاشلة» غير mark_booking_failed — لا بالتحديث المباشر ولا بمدخل اللوحة';

    -- ══ (هـ) جدول الأثر المالي — الحالات الست ═══════════════════════════════

    -- (هـ-١) assigned + none ⇒ لا قيد. والقياس **بالفرق** لا بالعدّ المطلق.
    select coalesce(v.net_due, 0) into v_net0
      from public.v_partner_settlements v where v.subcontractor_id = v_sub;
    v_net0 := coalesce(v_net0, 0);
    select * into v_res from public.mark_booking_failed(
      v_ids[1], 'vehicle-breakdown', null, null, null);
    if v_res.action_taken <> 'none' or v_res.ledger_effect <> 'none' then
      raise exception '(هـ-١) «عطل مركبة» على رحلةٍ لم تكتمل: الإجراء «%» والأثر «%» — المتوقع none/none',
        v_res.action_taken, v_res.ledger_effect;
    end if;
    select coalesce(v.net_due, 0) into v_net1
      from public.v_partner_settlements v where v.subcontractor_id = v_sub;
    if coalesce(v_net1, 0) <> v_net0 then
      raise exception '(هـ-١) net_due تحرّك % ⇐ % مع إجراء «لا شيء»', v_net0, coalesce(v_net1, 0);
    end if;

    -- (هـ-٢) assigned + pay ⇒ إنشاء `earned` بمقدار مستحق الإسناد
    v_net0 := coalesce(v_net1, 0);
    select * into v_res from public.mark_booking_failed(
      v_ids[2], 'customer-no-show', null, null, null);
    if v_res.action_taken <> 'pay' or v_res.ledger_effect <> 'payout-created' then
      raise exception '(هـ-٢) «العميل لم يحضر»: «%»/«%» — المتوقع pay/payout-created',
        v_res.action_taken, v_res.ledger_effect;
    end if;
    select coalesce(v.net_due, 0) into v_net1
      from public.v_partner_settlements v where v.subcontractor_id = v_sub;
    if coalesce(v_net1, 0) - v_net0 <> v_pay then
      raise exception '(هـ-٢) مستحق المتعهد ارتفع % والمتوقع % — «ادفع» بلا رجلٍ سابقة تُنشئ earned',
        coalesce(v_net1, 0) - v_net0, v_pay;
    end if;

    -- (هـ-٣) assigned + deduct ⇒ `collected` بمبلغ الخصم، على المسار القائم
    v_net0 := coalesce(v_net1, 0);
    select * into v_res from public.mark_booking_failed(
      v_ids[3], 'driver-no-show', null, 250, null);
    if v_res.action_taken <> 'deduct' or v_res.ledger_effect <> 'deduct' then
      raise exception '(هـ-٣) «السائق لم يحضر»: «%»/«%» — المتوقع deduct/deduct',
        v_res.action_taken, v_res.ledger_effect;
    end if;
    select coalesce(v.net_due, 0) into v_net1
      from public.v_partner_settlements v where v.subcontractor_id = v_sub;
    if v_net0 - coalesce(v_net1, 0) <> 250 then
      raise exception '(هـ-٣) net_due انخفض % والمتوقع ٢٥٠ — الخصم لا يركب على collected',
        v_net0 - coalesce(v_net1, 0);
    end if;
    select count(*)::integer into v_n
    from public.ledger_entries e
    where e.subcontractor_id = v_sub and e.source_type = 'adjustment'
      and e.settlement_role = 'collected' and e.amount = 250;
    if v_n <> 1 then
      raise exception '(هـ-٣) % قيدَ خصم — الخصم لا يمرّ من record_partner_adjustment (مسارُ مالٍ ثانٍ)', v_n;
    end if;

    -- ── والثلاث الباقية من `completed`: نُكمل الحجوزات ٤ و٥ و٦ أولاً
    for v_n in 4 .. 6 loop
      update public.bookings set status = 'completed' where id = v_ids[v_n];
    end loop;

    -- مسبار المسبار: الاكتمال كتب الرجلين فعلاً، وإلا فما بعده يقيس عدماً
    select count(*)::integer into v_n
    from public.ledger_entries e
    where e.source_id = v_ids[4] and e.settlement_role = 'earned'
      and e.source_type = 'partner_payout';
    if v_n <> 1 then
      raise exception '(هـ-٠) الاكتمال لم يكتب رجل المستحق (% صفاً) — قياسُ العكس بلا معنى', v_n;
    end if;

    -- (هـ-٤) completed + pay ⇒ التسوية تبقى كما كُتبت
    select coalesce(v.net_due, 0) into v_net0
      from public.v_partner_settlements v where v.subcontractor_id = v_sub;
    select * into v_res from public.mark_booking_failed(
      v_ids[4], 'customer-no-show', null, null, null);
    if v_res.ledger_effect <> 'payout-kept' then
      raise exception '(هـ-٤) «ادفع» على رحلةٍ مرّت بالتسوية: الأثر «%» — المتوقع payout-kept',
        v_res.ledger_effect;
    end if;
    select coalesce(v.net_due, 0) into v_net1
      from public.v_partner_settlements v where v.subcontractor_id = v_sub;
    if coalesce(v_net1, 0) <> coalesce(v_net0, 0) then
      raise exception '(هـ-٤) net_due تحرّك % ⇐ % مع «ادفع» — التسوية لُمست بلا داع',
        v_net0, coalesce(v_net1, 0);
    end if;

    -- (هـ-٥) completed + none ⇒ عكسُ `earned` وحده، ورجلُ التحصيل **باقية**
    v_net0 := coalesce(v_net1, 0);
    select * into v_res from public.mark_booking_failed(
      v_ids[5], 'vehicle-breakdown', null, null, null);
    if v_res.ledger_effect <> 'payout-reversed' then
      raise exception '(هـ-٥) «لا يُدفع» على رحلةٍ مرّت بالتسوية: الأثر «%» — المتوقع payout-reversed',
        v_res.ledger_effect;
    end if;
    select coalesce(v.net_due, 0) into v_net1
      from public.v_partner_settlements v where v.subcontractor_id = v_sub;
    if v_net0 - coalesce(v_net1, 0) <> v_pay then
      raise exception '(هـ-٥) net_due انخفض % والمتوقع % — عكسُ المستحق لم يقع بمقداره',
        v_net0 - coalesce(v_net1, 0), v_pay;
    end if;
    select count(*)::integer into v_n
    from public.ledger_entries e
    where e.source_type = 'partner_collection' and e.source_id = v_ids[5]
      and e.reverses_entry_id is null
      and not exists (select 1 from public.ledger_entries x where x.reverses_entry_id = e.id);
    if v_n <> 1 then
      raise exception '(هـ-٥) 🔴 رجل التحصيل غير قائمة (% غير معكوسة) — نقدٌ في يد المتعهد سقط من الحساب', v_n;
    end if;

    -- (هـ-٦) completed + deduct ⇒ عكسُ `earned` **و** خصمٌ فوقه
    v_net0 := coalesce(v_net1, 0);
    select * into v_res from public.mark_booking_failed(
      v_ids[6], 'severe-delay', null, 150, null);
    if v_res.ledger_effect <> 'payout-reversed+deduct' then
      raise exception '(هـ-٦) الأثر «%» — المتوقع payout-reversed+deduct', v_res.ledger_effect;
    end if;
    select coalesce(v.net_due, 0) into v_net1
      from public.v_partner_settlements v where v.subcontractor_id = v_sub;
    if v_net0 - coalesce(v_net1, 0) <> v_pay + 150 then
      raise exception '(هـ-٦) net_due انخفض % والمتوقع % — العكس والخصم لا يجتمعان',
        v_net0 - coalesce(v_net1, 0), v_pay + 150;
    end if;

    raise notice '✔ (هـ) جدول الأثر المالي الست حالات: لا شيء · إنشاء · خصم · إبقاء · عكس · عكسٌ وخصم — كلها على record_partner_adjustment وreverse_ledger_entry وحدهما';

    -- ══ (و) الولاء ═════════════════════════════════════════════════════════
    -- الحجوزات ١–٣ لم تكتمل قط ⇒ لا نقطة سُكّت ⇒ لا شيء يُعكس (§١-ب)
    select count(*)::integer into v_n
    from public.loyalty_entries e where e.booking_id in (v_ids[1], v_ids[2], v_ids[3]);
    if v_n <> 0 then
      raise exception '(و-١) % قيدَ ولاءٍ على رحلاتٍ لم تبلغ الاكتمال — المشكلة كان يجب أن تختفي بالبناء', v_n;
    end if;

    -- والحجز ٥ اكتمل فسُكّت له نقاط ثم فشل ⇒ عُكست
    select e.points into v_exp
    from public.loyalty_entries e
    where e.booking_id = v_ids[5] and e.direction = 'earn' and e.reverses_entry_id is null;
    if coalesce(v_exp, 0) <= 0 then
      raise exception '(و-٢) الاكتمال لم يسكّ نقاطاً — فحصُ العكس كان سيمرّ فوق صفر';
    end if;
    -- والتوقّع مشتقٌّ من نفس اللقطة ومن `loyalty_config()` لا من رقمٍ محفور
    if v_exp <> floor(v_total * v_cfg.points_per_currency)::integer then
      raise exception '(و-٢) النقاط المسكوكة % والمتوقع % — أساس الكسب تغيّر',
        v_exp, floor(v_total * v_cfg.points_per_currency)::integer;
    end if;
    select count(*)::integer into v_n
    from public.loyalty_entries e
    where e.booking_id = v_ids[5] and e.direction = 'reverse';
    if v_n <> 1 then
      raise exception '(و-٣) 🔴 % قيداً عاكساً على رحلةٍ فاشلة مكتملة — النقاط بقيت أو تكرر العكس', v_n;
    end if;

    -- والرصيد: ثلاث رحلاتٍ اكتملت (٤ و٥ و٦) وفشل منها ثلاثتها، فما بقي هو ما لم يُعكس
    select a.points_balance into v_bal
      from public.loyalty_accounts a where a.phone_norm = v_norm;
    select coalesce(sum(e.points), 0)::integer into v_exp
      from public.loyalty_entries e where e.phone_norm = v_norm;
    if coalesce(v_bal, 0) <> v_exp then
      raise exception '(و-٤) الرصيد المادّي % ومجموع الدفتر % — مصدران لرقمٍ واحد (النمط ٨)',
        coalesce(v_bal, 0), v_exp;
    end if;
    if coalesce(v_bal, 0) <> 0 then
      raise exception '(و-٤) بقي % نقطة على ثلاث رحلاتٍ فشلت كلها', coalesce(v_bal, 0);
    end if;

    -- 🔒 وآليةُ العكس **واحدة**: `loyalty_on_booking_cancelled` تفوّض ولا تستنسخ
    if position('loyalty_reverse_booking' in
         pg_get_functiondef('public.loyalty_on_booking_cancelled()'::regprocedure)) = 0 then
      raise exception '(و-٥) مُشغّل الإلغاء لا يفوّض إلى loyalty_reverse_booking — نسختان تنحرفان (القاعدة ١٢)';
    end if;
    if position('loyalty_reverse_booking' in
         pg_get_functiondef('public.loyalty_on_booking_failed()'::regprocedure)) = 0 then
      raise exception '(و-٥) مُشغّل الفشل لا يفوّض إلى loyalty_reverse_booking';
    end if;

    -- ══ (و-٦) 🔴 والعميل الذي **أنفق** نقاطه لا يمنع إعادة التصنيف (0053) ═════
    --
    -- هذه هي الحالة التي عطّلت قرار المالك «`completed ⇒ failed` بنافذة ٤٨
    -- ساعة» (§١-د) عملياً حتى `0053`: القيد `check (points_balance >= 0)` على
    -- `loyalty_accounts` كان يرمي عند القيد العاكس، و**كل نداء معاملةٌ واحدة
    -- (D-48)** فيُرجَع معه صفُّ الفشل والقيدُ المالي والحالة معاً — فلا تُعلَّم
    -- الرحلة فاشلة أصلاً. (مقيسٌ حياً قبل الإصلاح: 23514 والحالة تبقى
    -- `completed`.) والصواب أن يهبط الرصيد سالباً — **صمّامَ أمان لا سياسة**.
    --
    -- حجزان جديدان لا صلة لهما بالستة: الأول يكتمل فيسكّ، والثاني يُنفَق عليه.
    select * into v_bk from public.create_booking(
      jsonb_build_object('label', 'FT مبدأ نقاط', 'lat', 25.0, 'lng', 27.5),
      jsonb_build_object('label', 'FT منتهى نقاط', 'lat', 24.5, 'lng', 28.2),
      1, false, 0, 100, 90, 'estimate', v_slug, 'full',
      'FAILED_TRIP_TESTS عميل النقاط', v_phone, null, now() + interval '11 days',
      'FAILED_TRIP_TESTS_FIXTURE', null, null, 0, null, 0);
    v_id := v_bk.id;
    update public.bookings set status = 'under_review' where id = v_id;
    update public.bookings set status = 'confirmed'    where id = v_id;
    update public.bookings set status = 'completed'    where id = v_id;

    select a.points_balance into v_bal
      from public.loyalty_accounts a where a.phone_norm = v_norm;
    if coalesce(v_bal, 0) <= 0 then
      raise exception
        '(و-٦-٠) الاكتمال لم يسكّ نقاطاً (رصيد %) — الطفرة لم تُبنَ وكل ما بعدها يمرّ فوق صفر',
        coalesce(v_bal, 0);
    end if;

    select * into v_bk from public.create_booking(
      jsonb_build_object('label', 'FT مبدأ إنفاق', 'lat', 25.0, 'lng', 27.5),
      jsonb_build_object('label', 'FT منتهى إنفاق', 'lat', 24.5, 'lng', 28.2),
      1, false, 0, 100, 90, 'estimate', v_slug, 'full',
      'FAILED_TRIP_TESTS عميل الإنفاق', v_phone, null, now() + interval '12 days',
      'FAILED_TRIP_TESTS_FIXTURE', null, null, 0, null, 0);
    perform public.redeem_points(v_bk.id, v_phone, v_bal, 1);

    -- 🔒 مسبار المسبار: أُنفق الرصيد **كله**، وإلا لم تُبنَ الحالة المُختبَرة
    select a.points_balance into v_exp
      from public.loyalty_accounts a where a.phone_norm = v_norm;
    if coalesce(v_exp, -1) <> 0 then
      raise exception '(و-٦-٠) الرصيد بعد الإنفاق % لا صفر — لم يُنفَق كلُّه', coalesce(v_exp, -1);
    end if;

    -- ★ والنداء **يجب أن ينجح** — هذا هو التأكيد كله
    select * into v_res from public.mark_booking_failed(
      v_id, 'vehicle-breakdown', null, null, null);

    if (select b.status from public.bookings b where b.id = v_id) <> 'failed' then
      raise exception
        '(و-٦-١) 🔴 الحجز بقي «%» — عميلٌ أنفق نقاطه ما زال يمنع completed⇒failed (§١-د · D-48)',
        (select b.status from public.bookings b where b.id = v_id);
    end if;
    if v_res.points_reversed < 1 then
      raise exception '(و-٦-١) عُكس % قيداً — النقاط بقيت على رحلةٍ فاشلة', v_res.points_reversed;
    end if;

    -- والرصيد **يهبط سالباً**: صمّام الأمان عمل، ولم يُحجَب ردٌّ ولم تُؤخذ قيمةٌ مجاناً
    select a.points_balance into v_bal
      from public.loyalty_accounts a where a.phone_norm = v_norm;
    if coalesce(v_bal, 0) >= 0 then
      raise exception
        '(و-٦-٢) الرصيد بعد العكس % — لم يسلب، فالقيد العاكس لم يُطبَّق كاملاً', coalesce(v_bal, 0);
    end if;
    -- ويطابق الدفتر ولو كان سالباً — لا حساباً موازياً (النمط ٨)
    select coalesce(sum(e.points), 0)::integer into v_exp
      from public.loyalty_entries e where e.phone_norm = v_norm;
    if v_bal <> v_exp then
      raise exception '(و-٦-٢) الرصيد % ومجموع الدفتر % — مصدران لرقمٍ واحد', v_bal, v_exp;
    end if;

    -- 🔒 والطفرة المعاكسة: الحاجز **لم يُلغَ** بل تعلّم الاتجاه. قيدٌ غير عاكس
    --    ينزل بالرصيد ما زال مرفوضاً بـ23514، وإلا كان (و-٦-١) يقيس «فُتح الباب».
    v_state := null;
    begin
      insert into public.loyalty_entries (phone_norm, direction, points, note)
      values (v_norm, 'adjust', -1000000, 'FAILED_TRIP_TESTS سحبٌ على المكشوف');
      v_state := '(قُبل)';
    exception when others then
      get stacked diagnostics v_state = returned_sqlstate;
    end;
    if v_state = '(قُبل)' then
      raise exception '(و-٦-٣) 🔴 قيدٌ غير عاكس أنزل الرصيد تحت الصفر — الحاجز صار باباً';
    end if;
    if v_state <> '23514' then
      raise exception '(و-٦-٣) الرفض جاء بـ«%» لا 23514 — رمزُ القيد تغيّر ففحوصٌ قائمة تعمى', v_state;
    end if;

    raise notice '✔ (و) لا نقطة تُسكّ على ما لم يكتمل، والمكتملُ الفاشل تُعكس نقاطه بآليةٍ واحدة مفوَّض إليها — **وعميلٌ أنفق نقاطه لا يمنع إعادة التصنيف**: الرصيد يسلب بالقيد العاكس ويطابق الدفتر، والسحبُ على المكشوف ما زال 23514';

    -- ══ (د) اللقطة لا تتبع الكتالوج، والحذف ممنوعٌ بنيوياً ═══════════════════
    v_state := null;
    begin
      delete from public.failure_reasons where slug = 'driver-no-show';
      v_state := '(حُذف)';
    exception when others then
      get stacked diagnostics v_state = returned_sqlstate;
    end;
    if v_state = '(حُذف)' then
      raise exception '(د-١) 🔴 حُذف سببٌ مستعمَل — المفتاح الأجنبي ليس restrict';
    end if;
    if v_state <> '23503' then
      raise exception '(د-١) رمز الرفض «%» لا 23503 — المنع جاء من مكانٍ آخر', v_state;
    end if;

    -- وسببٌ **غير** مستعمَل يُحذف: وإلا كان (د-١) يمسك «الحذف ممنوع مطلقاً»
    insert into public.failure_reasons (slug, label, default_action, active, sort)
    values ('fttest-unused', 'FAILED_TRIP_TESTS سببٌ بلا استعمال', 'none', true, 999);
    delete from public.failure_reasons where slug = 'fttest-unused';

    update public.failure_reasons
       set label = 'FAILED_TRIP_TESTS اسمٌ جديد', default_action = 'pay'
     where slug = 'driver-no-show';
    select f.reason_label, f.default_action, f.action_taken into v_f
      from public.booking_failures f where f.booking_id = v_ids[3];
    if v_f.reason_label <> 'السائق لم يحضر' or v_f.default_action <> 'deduct' then
      raise exception '(د-٢) 🔴 اللقطة تبعت الكتالوج (تسمية «%» وافتراضي «%») — تقارير الماضي تُعاد كتابتها',
        v_f.reason_label, v_f.default_action;
    end if;
    if v_f.action_taken <> 'deduct' then
      raise exception '(د-٢) الإجراء المنفَّذ صار «%» — المخزَّن مع الحدث يتبع الافتراضي المتغيّر',
        v_f.action_taken;
    end if;

    -- والسجل مُلحَقٌ فقط
    v_state := null;
    begin
      update public.booking_failures set action_taken = 'pay' where booking_id = v_ids[3];
      v_state := '(عُدّل)';
    exception when others then
      get stacked diagnostics v_state = returned_sqlstate;
    end;
    if v_state = '(عُدّل)' then
      raise exception '(د-٣) 🔴 عُدِّل صفُّ فشلٍ — القرار المالي قابل لإعادة الكتابة';
    end if;

    -- وقيدُ التعطيل: المعطَّل لا يُختار من جديد وإن بقي مرجعاً لصفٍّ قديم
    update public.failure_reasons set active = false where slug = 'force-majeure';
    raise notice '✔ (د) الكتالوج: لا حذفَ لمستعمَل (٢٣٥٠٣) وحذفٌ لغير المستعمَل، واللقطة مجمَّدة، والسجل مُلحَق';

    -- ══ (ز) نافذة الـ٤٨ ساعة ═══════════════════════════════════════════════
    -- حجزٌ سابعٌ يكتمل، ثم نُقدّم زمن اكتماله في السجل ما وراء النافذة
    select * into v_bk from public.create_booking(
      jsonb_build_object('label', 'FT نافذة', 'lat', 25.0, 'lng', 27.5),
      jsonb_build_object('label', 'FT منتهى', 'lat', 24.5, 'lng', 28.2),
      1, false, 0, 100, 90, 'estimate', v_slug, 'full',
      'FAILED_TRIP_TESTS نافذة', v_phone, null, now() + interval '9 days',
      'FAILED_TRIP_TESTS_FIXTURE', null, null, 0, null, 0);
    v_id := v_bk.id;
    update public.bookings set status = 'under_review' where id = v_id;
    update public.bookings set status = 'confirmed'    where id = v_id;
    insert into public.dispatches (booking_id, status, round,
                                   assigned_subcontractor_id, assigned_payout, assigned_at)
    values (v_id, 'assigned', 1, v_sub, v_pay, now());
    update public.bookings set status = 'assigned'  where id = v_id;
    update public.bookings set status = 'completed' where id = v_id;

    update public.booking_events set created_at = now() - v_win - interval '1 minute'
     where booking_id = v_id and to_status = 'completed';

    -- والمسبار: `booking_completed_at` تقرأ الزمن المزروع فعلاً
    if public.booking_completed_at(v_id) > now() - v_win then
      raise exception '(ز-٠) زمن الاكتمال المزروع لم يُقرأ — الطفرة لم تُبنَ';
    end if;

    select coalesce(v.net_due, 0) into v_net0
      from public.v_partner_settlements v where v.subcontractor_id = v_sub;
    v_msg := null;
    begin
      perform * from public.mark_booking_failed(v_id, 'vehicle-breakdown', null, null, null);
      v_msg := '(قُبل)';
    exception when others then
      get stacked diagnostics v_msg = message_text;
    end;
    if v_msg = '(قُبل)' then
      raise exception '(ز-١) 🔴 إعادة تصنيفٍ بعد انقضاء النافذة (%) نُفِّذت', v_win;
    end if;
    if v_msg not like '%نافذة%' then
      raise exception '(ز-١) الرفض جاء برسالة «%» لا برسالة النافذة', v_msg;
    end if;

    -- 🔒 والرفضُ بلا أثر: كل نداءٍ معاملةٌ واحدة (**D-48**)
    select count(*)::integer into v_n
      from public.booking_failures f where f.booking_id = v_id;
    if v_n <> 0 then
      raise exception '(ز-٢) 🔴 بقي % صفَّ فشلٍ بعد نداءٍ مرفوض — نصفُ فشلٍ في القاعدة', v_n;
    end if;
    select coalesce(v.net_due, 0) into v_net1
      from public.v_partner_settlements v where v.subcontractor_id = v_sub;
    if coalesce(v_net1, 0) <> coalesce(v_net0, 0) then
      raise exception '(ز-٢) net_due تحرّك % ⇐ % بعد نداءٍ مرفوض — مالٌ تحرّك بلا سبب',
        v_net0, coalesce(v_net1, 0);
    end if;
    if (select b.status from public.bookings b where b.id = v_id) <> 'completed' then
      raise exception '(ز-٢) حالة الحجز تغيّرت بعد نداءٍ مرفوض';
    end if;

    -- (ز-٣) وداخل النافذة يمرّ — وإلا كان (ز-١) يمسك «لا شيء يعمل»
    update public.booking_events set created_at = now() - interval '1 hour'
     where booking_id = v_id and to_status = 'completed';
    select * into v_res from public.mark_booking_failed(v_id, 'vehicle-breakdown', null, null, null);
    if (select b.status from public.bookings b where b.id = v_id) <> 'failed' then
      raise exception '(ز-٣) إعادة التصنيف داخل النافذة لم تقع — الحارس يمنع الجميع';
    end if;

    raise notice '✔ (ز) نافذة الـ٤٨ ساعة تغلق وتفتح، والرفض لا يترك صفاً ولا يحرّك جنيهاً (D-48)';

    -- ══ (ح) المدخلات المرفوضة ═══════════════════════════════════════════════
    -- حجزٌ ثامن حيّ لكل المحاولات
    select * into v_bk from public.create_booking(
      jsonb_build_object('label', 'FT مدخلات', 'lat', 25.0, 'lng', 27.5),
      jsonb_build_object('label', 'FT منتهى', 'lat', 24.5, 'lng', 28.2),
      1, false, 0, 100, 90, 'estimate', v_slug, 'full',
      'FAILED_TRIP_TESTS مدخلات', v_phone, null, now() + interval '11 days',
      'FAILED_TRIP_TESTS_FIXTURE', null, null, 0, null, 0);
    v_id := v_bk.id;
    update public.bookings set status = 'under_review' where id = v_id;
    update public.bookings set status = 'confirmed'    where id = v_id;
    insert into public.dispatches (booking_id, status, round,
                                   assigned_subcontractor_id, assigned_payout, assigned_at)
    values (v_id, 'assigned', 1, v_sub, v_pay, now());
    update public.bookings set status = 'assigned' where id = v_id;

    for v_state, v_msg in
      select * from (values
        ('سببٌ مجهول',            'no-such-reason'),
        ('سببٌ معطَّل',            'force-majeure')
      ) t(a, b)
    loop
      v_n := null;
      begin
        perform * from public.mark_booking_failed(v_id, v_msg, null, null, null);
        v_n := 1;
      exception when others then
        v_n := 0;
      end;
      if v_n = 1 then
        raise exception '(ح-١) 🔴 قُبل % («%»)', v_state, v_msg;
      end if;
    end loop;

    -- تجاوزٌ بلا مبرر
    v_msg := null;
    begin
      perform * from public.mark_booking_failed(v_id, 'vehicle-breakdown', 'deduct', 90, null);
      v_msg := '(قُبل)';
    exception when others then
      get stacked diagnostics v_msg = message_text;
    end;
    if v_msg = '(قُبل)' then
      raise exception '(ح-٢) 🔴 تجاوزُ الإجراء الافتراضي مرّ بلا مبرر مكتوب';
    end if;
    if v_msg not like '%مبرر%' then
      raise exception '(ح-٢) الرفض جاء برسالة «%» لا برسالة المبرر', v_msg;
    end if;

    -- خصمٌ بلا مبلغ · ومبلغٌ مع إجراءٍ لا يخصم
    v_n := null;
    begin
      perform * from public.mark_booking_failed(v_id, 'severe-delay', null, null, null);
      v_n := 1;
    exception when others then v_n := 0; end;
    if v_n = 1 then
      raise exception '(ح-٣) 🔴 خصمٌ بلا مبلغ مرّ';
    end if;

    v_n := null;
    begin
      perform * from public.mark_booking_failed(v_id, 'vehicle-breakdown', null, 50, null);
      v_n := 1;
    exception when others then v_n := 0; end;
    if v_n = 1 then
      raise exception '(ح-٤) 🔴 مبلغُ خصمٍ مع إجراء «لا شيء» مرّ — رقمٌ يُدخَل ولا يُنفَّذ';
    end if;

    -- والشاهد الإيجابي: نفس الحجز يُقبل بمدخلٍ صحيح
    -- (‏«تأخّر فادح» افتراضه deduct ولم تلمسه (د)، فالقياس هنا مستقلٌّ عنها)
    select * into v_res from public.mark_booking_failed(
      v_id, 'severe-delay', null, 30, null);
    if v_res.action_taken <> 'deduct' then
      raise exception '(ح-٥) المدخل الصحيح رُفض كذلك — الفحوص أعلاه كانت تمسك عطباً عاماً';
    end if;

    -- ولا يُعلَّم مرتين
    v_n := null;
    begin
      perform * from public.mark_booking_failed(v_id, 'vehicle-breakdown', null, null, null);
      v_n := 1;
    exception when others then v_n := 0; end;
    if v_n = 1 then
      raise exception '(ح-٦) 🔴 عُلِّمت الرحلة فاشلة مرتين — صفّان لحدثٍ واحد';
    end if;

    raise notice '✔ (ح) المدخلات: سببٌ مجهول ومعطَّل، وتجاوزٌ بلا مبرر، وخصمٌ بلا مبلغ، ومبلغٌ بلا خصم، وتكرارٌ — كلها مرفوضة، والصحيح يمرّ';

    -- ══ (ط) العزل ═══════════════════════════════════════════════════════════
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_usr, 'role', 'authenticated')::text, true);

    -- (ط-١) البورتال يرى الحالة — الرحلة لا تختفي ممن نفّذها
    select count(*)::integer into v_n
      from public.portal_trips() t where t.status = 'failed';
    if v_n < 1 then
      raise exception '(ط-١) المتعهد لا يرى رحلةً فاشلة واحدة — الرحلة تختفي من عنده بلا تفسير';
    end if;
    -- 🔒 ولا يرى السبب ولا الإجراء: ليسا في نوع الإرجاع أصلاً (أمانٌ بنيوي)
    select count(*)::integer into v_n
    from jsonb_object_keys(to_jsonb((select t from public.portal_trips() t limit 1))) k
    where k in ('reason_slug', 'reason_label', 'action_taken', 'deduct_amount', 'ledger_effect');
    if v_n <> 0 then
      raise exception '(ط-١) 🔴 % حقلاً من قرار الفشل يعبر إلى البورتال', v_n;
    end if;

    execute 'set local role authenticated';
    v_state := null;
    begin
      select count(*) into v_n from public.booking_failures;
      v_state := '(قُرئ)';
    exception when others then
      get stacked diagnostics v_state = returned_sqlstate;
    end;
    if v_state = '(قُرئ)' and v_n > 0 then
      raise exception '(ط-٢) 🔴 المتعهد قرأ % صفَّ فشلٍ — السبب والخصم مكشوفان له', v_n;
    end if;

    v_state := null;
    begin
      perform * from public.mark_booking_failed(v_ids[1], 'driver-no-show', null, 10, null);
      v_state := '(نُفِّذت)';
    exception when others then
      get stacked diagnostics v_state = returned_sqlstate;
    end;
    if v_state = '(نُفِّذت)' then
      raise exception '(ط-٣) 🔴 متعهدٌ علّم رحلةً فاشلة';
    end if;

    v_state := null;
    begin
      insert into public.booking_failures (
        booking_id, reason_id, reason_slug, reason_label, default_action,
        action_taken, from_status)
      select v_ids[1], r.id, r.slug, r.label, r.default_action, r.default_action, 'assigned'
      from public.failure_reasons r where r.slug = 'admin-decision';
      v_state := '(كُتب)';
    exception when others then
      get stacked diagnostics v_state = returned_sqlstate;
    end;
    if v_state <> '42501' then
      raise exception '(ط-٤) 🔴 دورُ المتصفح كتب في booking_failures («%») — الحارس عُرفٌ لا منحة', v_state;
    end if;
    execute 'reset role';
    perform set_config('request.jwt.claims', '', true);

    -- (ط-٥) والزائر: لا يقرأ جدولاً ولا ينفّذ دالة
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute 'set local role anon';
      for v_state in select unnest(array['failure_reasons', 'booking_failures']) loop
        v_msg := null;
        begin
          execute format('select count(*) from public.%I', v_state);
          v_msg := '(قُرئ)';
        exception when others then
          get stacked diagnostics v_msg = returned_sqlstate;
        end;
        if v_msg <> '42501' then
          raise exception '(ط-٥) 🔴 anon بلغ % والنتيجة «%» لا 42501', v_state, v_msg;
        end if;
      end loop;

      v_msg := null;
      begin
        perform * from public.mark_booking_failed(v_ids[1], 'driver-no-show', null, 10, null);
        v_msg := '(نُفِّذت)';
      exception when others then
        get stacked diagnostics v_msg = returned_sqlstate;
      end;
      if v_msg <> '42501' then
        raise exception '(ط-٥) 🔴 anon نفّذ mark_booking_failed والنتيجة «%» لا 42501', v_msg;
      end if;
      execute 'reset role';
      raise notice '✔ (ط) العزل: البورتال يرى الحالة ولا يرى القرار · المتعهد لا يقرأ ولا يكتب ولا ينفّذ · anon لا يبلغ شيئاً';
    else
      raise notice '⚠ (ط) دور anon غير موجود — قياسُ الزائر متخطّى';
    end if;

    raise exception 'FAILED_TRIP_TESTS_ROLLBACK';
  exception
    when others then
      execute 'reset role';
      perform set_config('request.jwt.claims', '', true);
      if sqlerrm <> 'FAILED_TRIP_TESTS_ROLLBACK' then raise; end if;
  end;

  raise notice '✔ القياس الحيّ تمّ داخل معاملةٍ فرعية أُرجعت بكاملها';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ي) 🔒 لم يبقَ أثر — وهذه **قاعدة الإنتاج نفسها**
-- ----------------------------------------------------------------------------
do $$
declare
  v_f integer; v_r integer; v_b integer; v_l integer; v_y integer; v_s integer;
  v_bf integer := current_setting('tours.ft_f')::integer;
  v_br integer := current_setting('tours.ft_r')::integer;
  v_bb integer := current_setting('tours.ft_b')::integer;
  v_bl integer := current_setting('tours.ft_l')::integer;
  v_by integer := current_setting('tours.ft_y')::integer;
  v_bs integer := current_setting('tours.ft_s')::integer;
begin
  select count(*)::integer into v_f from public.booking_failures;
  select count(*)::integer into v_r from public.failure_reasons;
  select count(*)::integer into v_b from public.bookings;
  select count(*)::integer into v_l from public.ledger_entries;
  select count(*)::integer into v_y from public.loyalty_entries;
  select count(*)::integer into v_s from public.subcontractors;

  if v_f <> v_bf then
    raise exception 'تنظيف ناقص: رحلاتٌ فاشلة % والأساس % — صفٌّ باقٍ هنا قرارٌ مالي على متعهدٍ حقيقي', v_f, v_bf;
  end if;
  if v_r <> v_br then
    raise exception 'تنظيف ناقص: أسبابُ الفشل % والأساس % — كتالوج المالك تغيّر', v_r, v_br;
  end if;
  if v_b <> v_bb then
    raise exception 'تنظيف ناقص: الحجوزات % والأساس %', v_b, v_bb;
  end if;
  if v_l <> v_bl then
    raise exception 'تنظيف ناقص: قيود الدفتر % والأساس % — قيدٌ باقٍ يحرّك رصيد متعهد', v_l, v_bl;
  end if;
  if v_y <> v_by then
    raise exception 'تنظيف ناقص: قيود الولاء % والأساس %', v_y, v_by;
  end if;
  if v_s <> v_bs then
    raise exception 'تنظيف ناقص: المتعهدون % والأساس %', v_s, v_bs;
  end if;

  -- وبقايا الفيكسترة بأسمائها، لو تسرّبت من بابٍ آخر
  select count(*)::integer into v_f
    from public.vehicle_classes vc where vc.slug like 'fttest-%';
  if v_f <> 0 then
    raise exception 'تنظيف ناقص: % فئة سيارة اختبارية باقية', v_f;
  end if;
  select count(*)::integer into v_f
    from public.failure_reasons r where r.slug like 'fttest-%';
  if v_f <> 0 then
    raise exception 'تنظيف ناقص: % سبب فشلٍ اختباري باقٍ', v_f;
  end if;
  select count(*)::integer into v_f
    from public.bookings b where b.trip ->> 'notes' like 'FAILED_TRIP_TESTS%';
  if v_f <> 0 then
    raise exception 'تنظيف ناقص: % حجز اختباري باقٍ', v_f;
  end if;

  -- والكتالوج كما كان: لا سببَ عُطِّل ولا أُعيدت تسميته لأن اختباراً سقط
  if not exists (
    select 1 from public.failure_reasons r
    where r.slug = 'driver-no-show' and r.label = 'السائق لم يحضر'
      and r.default_action = 'deduct' and r.active
  ) then
    raise exception 'تنظيف ناقص: كتالوج الأسباب تغيّر — تسميةٌ أو إجراءٌ أو تعطيلٌ تسرّب من القياس';
  end if;
  if not exists (
    select 1 from public.failure_reasons r where r.slug = 'force-majeure' and r.active
  ) then
    raise exception 'تنظيف ناقص: «ظرف قاهر» ما زال معطَّلاً — التعطيل تسرّب من القياس';
  end if;

  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claims', '', false);

  raise notice 'ALL PASSED — «فشل» لا «إلغاء»: الحالة نهائية ولا مسار إليها غير mark_booking_failed، والكتالوج مُدارٌ بلقطةٍ مجمَّدة لا يعيد كتابة تقارير الماضي ولا يُحذف منه مستعمَل، وجدول الأثر المالي الست حالات على record_partner_adjustment وreverse_ledger_entry وحدهما — و«لا يُدفع» بعد التسوية = عكسُ earned ورجلُ التحصيل باقية، والنقاط تُعكس بآليةٍ واحدة مفوَّض إليها، ونافذة الـ٤٨ ساعة تفتح وتغلق والرفض بلا أثر، والمتعهد يرى الحالة ولا يرى القرار — وصفر أثرٍ في القاعدة';
end;
$$;
