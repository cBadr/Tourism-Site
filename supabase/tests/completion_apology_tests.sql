-- ============================================================================
-- completion_apology_tests.sql — بوابةُ الاكتمال، والاعتذار بعد الإسناد،
--                                 وسقفُ الخصم  (هجرات 0119 و0121 و0124)
--
-- كيف تشغّله: `pnpm db:test completion_apology`
-- النجاح = آخر سطر «ALL PASSED». وأي فشل exception عربية فيها المتوقع والفعلي.
--
-- ══════════════════════════════════════════════════════════════════════════
--  ماذا يُثبت هذا الملف — وماذا كان يفشل قبل 0119
-- ══════════════════════════════════════════════════════════════════════════
--
-- كلُّ تأكيدٍ هنا كُتب بسؤال «**لو انعكس السلوك، هل يحمرّ؟**» (النمط ٥ في
-- `LESSONS`). وثلاثةٌ منها كانت **تحمرّ على المستودع كما كان قبل هذه الهجرة**:
--
--   (ح-٣) 🔴 `mark_booking_failed` كانت تقبل **أي** مبلغٍ موجب بلا سقف —
--         شرطها الوحيد `if v_amount <= 0`. فخصمُ عشرة أضعاف المستحق كان يمرّ،
--         ويصير المتعهد مديناً بمالٍ لم يقبضه. والتأكيد يقيس **الرفض**.
--   (د-١) الاكتمال كان يقع بتحديثٍ مباشر بلا أي طلبٍ ولا اعتماد — فلا وجود
--         لصفٍّ في `trip_completion_requests` أصلاً.
--   (و-٣) الرحلة المُسنَدة كانت **بلا مخرج**: `reject_offer` تعمل على عرضٍ
--         `pending` وحده، فيرتدّ الاعتذار بـ`already-assigned`.
--
-- ── ولا بيانات حقيقية (اتفاقية ٨ · النمط ٦) ────────────────────────────────
--   • إحداثيات **صحراوية نائية** لا يغطيها متعهد.
--   • المتعهد والفئة والتعريفة يخلقها الملف.
--   • وكل توقّع يُشتق من **مصدر الكود المُختبَر**: المستحق من `dispatches`،
--     والعتبة من `trip_closure_config()`، والوجهة من `apology_route()` نفسها.
--
-- ── ولا سطرَ `delete` واحداً ────────────────────────────────────────────────
--   `trip_withdrawals` مُلحَقٌ بمُشغّلٍ يرفض الحذف، و`ledger_entries` كذلك.
--   فالقياس كله داخل **معاملةٍ فرعية تُرجَع**، والقسم (ك) يقيس صفر الأثر.
--
-- ما يغطيه الملف:
--   (٠) الشروط المسبقة · (٠-ب) خط الأساس
--   (أ) الكتالوج بنطاقه: قيدُ «pay ممنوعة على partner»، وأسبابُ الصفر موجودة
--   (ب) العتبة: `apology_route` على طرفيها وعلى الغياب
--   (ج) الطلب: المتعهد يطلب — **ولا مالَ يتحرك**
--   (د) الاعتماد الإداري ⇒ المال يتحرك، والرفض يُعلَّل
--   (هـ) الاعتماد التلقائي بفاعلٍ اسمه `auto` لا فراغ
--   (و) الاعتذار: إخلاءٌ وعودةٌ إلى «مؤكَّد» و**استثناءٌ من الموجة التالية**
--   (ز) الحارس: `assigned⇒confirmed` مرفوضٌ ما دام الإسناد قائماً
--   (ح) 🔴 سقفُ الخصم — الرفضُ عند التجاوز، والسقوط على مبلغ الكتالوج
--   (ط) الخصم على الاعتذار **خاملٌ بالبذرة**، ومفتاحُه له منفِّذ
--   (ي) العزل: المتعهد لا يعتمد ولا يشغّل الدورة ولا يقرأ اعتذارات غيره
--   (ل) 🔴 0124 — الاعتماد التلقائي امتيازُ الصمت لا امتيازُ تجاوز قرار
--   (م) 🔴 0124 — سقفُ الخصم لكل **رحلة** لا لكل صفّ اعتذار
--   (ن) 🔴 0126 — والسقفُ نفسه يسري على مسار الفشل
--   (س) 🔴 0130 — مبلغٌ صريح ومبرَّرٌ مكتوبٌ بحدٍّ أدنى في **كل** خصم، ويصل
--       بوابةَ المتعهد — بحارسَين مستقلَّين يُنزعان ويُعادان
--   (ك) صفر أثر
--
-- ══════════════════════════════════════════════════════════════════════════
--  وما أضافته 0124 — عيبان **أُعيد إنتاجهما حيّاً** قبل إصلاحهما
-- ══════════════════════════════════════════════════════════════════════════
--
--   (ح‑١) رفضٌ إداريّ ⇒ طلبٌ ثانٍ ⇒ `settle_due_completions` تعتمده تلقائياً
--         بعد المهلة، والتظلّمُ المفتوح على الرحلة نفسها لا تراه الدورة أصلاً.
--         المقيس قبل الإصلاح: `scanned 1 · approved 1` والحجز `completed`
--         و**الدفتر +2 والولاء +1**.
--   (ح‑٢) خمسُ دورات «إسنادٌ يدويّ ⇐ اعتذار ⇐ خصم بحدّ المستحق» على رحلةٍ
--         مستحقُّها 1500 ⇒ **٥ صفوف · 7500 ج.م · ٥٫٠٠× المستحق**.
--
-- 🔬 **ولكلِّ حاجزٍ اختبارُ طفرة**: تُلتقط الدالةُ الحارسة بـ`pg_get_functiondef`،
--    ثم تُستبدل ببديلٍ بلا حراسة، **فيمرّ العيب أمام أعيننا**، ثم تُعاد الدالةُ
--    **حرفياً** بـ`execute` على نصّها الملتقَط فيُمنع من جديد. فلا تأكيدَ هنا
--    يمرّ لأن الحارس غائبٌ أصلاً.
--
-- المرجع: supabase/migrations/0119_completion_apology_and_loyalty_rate.sql
--         · supabase/migrations/0121_apology_route_one_source.sql
--         · supabase/migrations/0124_completion_guards_and_deduction_cap.sql
--         · supabase/migrations/0126_adversarial_fixes.sql
--         · supabase/migrations/0130_manual_deduction_needs_written_reason.sql
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (٠) الشروط المسبقة — قراءةٌ محضة
-- ----------------------------------------------------------------------------
do $$
declare
  v_missing text;
begin
  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claims', '', false);

  select string_agg(x.rel, '، ') into v_missing
  from (values
    ('public.trip_closure_settings'), ('public.trip_completion_requests'),
    ('public.trip_withdrawals'), ('public.partner_grievances'),
    ('public.failure_reasons'), ('public.dispatches'), ('public.trip_offers')
  ) as x(rel)
  where to_regclass(x.rel) is null;
  if v_missing is not null then
    raise exception 'شرط مسبق: كائنات مفقودة (نفّذ 0119 أولاً): %', v_missing;
  end if;

  select string_agg(x.sig, '، ') into v_missing
  from (values
    ('public.trip_closure_config()'),
    ('public.request_trip_completion(uuid, text)'),
    ('public.decide_trip_completion(uuid, boolean, text)'),
    ('public.settle_due_completions(integer)'),
    ('public.withdraw_from_trip(uuid, text, text)'),
    ('public.apply_withdrawal_deduction(uuid, numeric, text)'),
    -- 0130
    ('public.deduction_reason_min_chars()'),
    ('public.deduction_reason_norm(text)'),
    ('public.deduction_reason_ok(text)'),
    ('public.portal_deductions(integer)'),
    ('public.apology_route(numeric)'),
    ('public.file_grievance(uuid, text, text)'),
    ('public.resolve_grievance(uuid, boolean, text)'),
    ('public.guard_booking_unassign()'),
    -- 0124
    ('public.trip_completion_gate(uuid, boolean)'),
    ('public.approve_trip_completion(uuid, text, text, text)'),
    ('public.trip_deduction_room(uuid)')
  ) as x(sig)
  where to_regprocedure(x.sig) is null;
  if v_missing is not null then
    raise exception 'شرط مسبق: دوال مفقودة: %', v_missing;
  end if;

  -- 0124: عدّادُ المؤجَّل عمودٌ في نوع الإرجاع لا رقمٌ في رسالة
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'settle_due_completions'
      and 'held' = any(p.proargnames)
  ) then
    raise exception
      'شرط مسبق: settle_due_completions لا تُرجع عمود held — المؤجَّل ما زال مبتلَعاً صامتاً (نفّذ 0124)';
  end if;
  -- وعمودا سبب التأجيل
  select string_agg(x.col, '، ') into v_missing
  from (values ('auto_hold_reason'), ('auto_hold_at')) as x(col)
  where not exists (
    select 1 from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = 'trip_completion_requests'
      and c.column_name = x.col
  );
  if v_missing is not null then
    raise exception 'شرط مسبق: أعمدة مفقودة في trip_completion_requests: %', v_missing;
  end if;

  -- 🔒 والأثرُ العاري لا يُمنح لأحد: من يبلغ approve_trip_completion يُكمل حجزاً
  --    بلا أي فحص أهلية
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'approve_trip_completion'
      and (has_function_privilege('anon', p.oid, 'execute')
        or has_function_privilege('authenticated', p.oid, 'execute')
        or has_function_privilege('service_role', p.oid, 'execute'))
  ) then
    raise exception
      '🔴 approve_trip_completion ممنوحةٌ لدور — وهي تُكمل الحجز وتقيّد المستحق بلا فحصٍ واحد';
  end if;
  -- ومساحةُ الخصم تكشف تكلفة المتعهد ⇒ لا تبلغ authenticated (D-20)
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'trip_deduction_room'
      and (has_function_privilege('anon', p.oid, 'execute')
        or has_function_privilege('authenticated', p.oid, 'execute'))
  ) then
    raise exception
      '🔴 trip_deduction_room ممنوحةٌ لـanon/authenticated — ووسيطُها معرّفُ حجز، أي مستحقُّ أي رحلة بتخمينه';
  end if;
  -- 🔒 ودالةُ الأهلية `security definer` تتجاوز RLS: منحتُها الافتراضية PUBLIC،
  --    وتركُها كذلك يكشف حالةَ أي حجزٍ وتاريخَ أي تظلّمٍ لكل مسجَّل (النمط ١)
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'trip_completion_gate'
      and (has_function_privilege('anon', p.oid, 'execute')
        or has_function_privilege('authenticated', p.oid, 'execute'))
  ) then
    raise exception
      '🔴 trip_completion_gate ممنوحةٌ لـanon/authenticated — وهي definer تقرأ الحجز والتظلّم';
  end if;

  if not exists (select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
                  where c.relname = 'bookings' and t.tgname = 'bookings_guard_unassign') then
    raise exception 'شرط مسبق: مُشغّل bookings_guard_unassign غير مربوط — الحارس دالةٌ لا تعمل';
  end if;
  if not exists (select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
                  where c.relname = 'trip_withdrawals' and t.tgname = 'trip_withdrawals_freeze') then
    raise exception 'شرط مسبق: مُشغّل trip_withdrawals_freeze غير مربوط';
  end if;

  raise notice '✔ (٠) الشروط المسبقة سليمة';
end;
$$;

-- ----------------------------------------------------------------------------
-- (٠-ب) خط الأساس
-- ----------------------------------------------------------------------------
do $$
declare
  v_c integer; v_w integer; v_g integer; v_b integer; v_l integer; v_s integer; v_r integer;
begin
  select count(*)::integer into v_c from public.trip_completion_requests;
  select count(*)::integer into v_w from public.trip_withdrawals;
  select count(*)::integer into v_g from public.partner_grievances;
  select count(*)::integer into v_b from public.bookings;
  select count(*)::integer into v_l from public.ledger_entries;
  select count(*)::integer into v_s from public.subcontractors;
  select count(*)::integer into v_r from public.failure_reasons;

  perform set_config('tours.ca_c', v_c::text, false);
  perform set_config('tours.ca_w', v_w::text, false);
  perform set_config('tours.ca_g', v_g::text, false);
  perform set_config('tours.ca_b', v_b::text, false);
  perform set_config('tours.ca_l', v_l::text, false);
  perform set_config('tours.ca_s', v_s::text, false);
  perform set_config('tours.ca_r', v_r::text, false);

  raise notice '✔ (٠-ب) خط الأساس: % طلب · % اعتذار · % تظلّم · % حجز · % قيد · % متعهد · % سبب',
    v_c, v_w, v_g, v_b, v_l, v_s, v_r;
end;
$$;

-- ----------------------------------------------------------------------------
-- (أ) الكتالوج بنطاقه — قيودُ الجدول لا عُرفُ الشاشة
-- ----------------------------------------------------------------------------
do $$
declare
  v_n   integer;
  v_msg text;
begin
  -- 🔒 «ادفع كاملاً» لمن بادر بالانسحاب تناقضٌ — والقيد يمنعه بنيوياً
  v_msg := null;
  begin
    insert into public.failure_reasons (slug, label, default_action, applies_to, initiator)
    values ('catest-pay-partner', 'CA اختبار', 'pay', 'apology', 'partner');
    v_msg := '(قُبل)';
  exception when others then
    get stacked diagnostics v_msg = returned_sqlstate;
  end;
  if v_msg = '(قُبل)' then
    delete from public.failure_reasons where slug = 'catest-pay-partner';
    raise exception '(أ-١) 🔴 سببٌ بـpay ومُبادِرُه partner قُبل — «pay لا معنى لها إلا حين تسحب المنصة»';
  end if;
  if v_msg <> '23514' then
    raise exception '(أ-١) الرفض جاء بـ% لا بخرق قيد (23514)', v_msg;
  end if;

  -- ومبلغٌ افتراضي بلا إجراء خصمٍ رقمٌ لا يقرؤه أحد
  v_msg := null;
  begin
    insert into public.failure_reasons (slug, label, default_action, default_deduct_amount)
    values ('catest-amount-none', 'CA اختبار', 'none', 50);
    v_msg := '(قُبل)';
  exception when others then
    get stacked diagnostics v_msg = returned_sqlstate;
  end;
  if v_msg = '(قُبل)' then
    delete from public.failure_reasons where slug = 'catest-amount-none';
    raise exception '(أ-٢) مبلغٌ افتراضي على إجراءٍ ليس خصماً قُبل';
  end if;

  -- 🔒 وأسبابُ الصفر **واجبةُ الوجود**: حادثٌ حقيقي لا يُغرَّم، وإلا كذب
  --    المتعهدون في السبب ففقدت البيانات معناها — وهي علّةُ الكتالوج نفسها
  select count(*)::integer into v_n
  from public.failure_reasons r
  where r.active and r.default_action = 'none' and r.applies_to in ('apology', 'both');
  if v_n = 0 then
    raise exception '(أ-٣) 🔴 لا سببَ اعتذارٍ بلا خصم — من تعطّلت سيارته سيكذب في السبب';
  end if;

  -- وشاهدٌ إيجابي: الجدول ما زال يقبل صفاً سليماً، فالتأكيدان أعلاه ليسا عميين
  insert into public.failure_reasons (slug, label, default_action, applies_to, initiator, default_deduct_amount)
  values ('catest-ok', 'CA سببٌ سليم', 'deduct', 'both', 'partner', 75);
  delete from public.failure_reasons where slug = 'catest-ok';

  raise notice '✔ (أ) الكتالوج بنطاقه: pay ممنوعة على partner · المبلغ حكرٌ على deduct · وأسبابُ الصفر موجودة';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ب) العتبة — على طرفيها وعلى الغياب، من **الدالة الواحدة** لا من شرطٍ مكتوب
-- ----------------------------------------------------------------------------
do $$
declare
  v_thr integer;
begin
  select c.apology_manual_hours into v_thr from public.trip_closure_config() c;
  if v_thr is null then
    raise exception '(ب-٠) العتبة غير مقروءة من trip_closure_config()';
  end if;

  if public.apology_route(v_thr + 1) <> 'rebroadcast' then
    raise exception '(ب-١) ما فوق العتبة (%) لا يُبثّ — قرار المالك: بعيدٌ ⇒ موجةٌ جديدة', v_thr;
  end if;
  if public.apology_route(v_thr) <> 'rebroadcast' then
    raise exception '(ب-٢) العتبة نفسها ليست «بثاً» — الحدّ شامل لا حصري';
  end if;
  if public.apology_route(v_thr - 0.01) <> 'manual' then
    raise exception '(ب-٣) ما دون العتبة يُبثّ — قرار المالك: قريبٌ ⇒ إسنادٌ يدوي بتنبيه';
  end if;
  if public.apology_route(null) <> 'manual' then
    raise exception '(ب-٤) 🔴 رحلةٌ بلا موعدٍ مقروء تُبثّ آلياً — الاتجاه الآمن أن يراها إنسان';
  end if;
  if public.apology_route(-5) <> 'manual' then
    raise exception '(ب-٥) موعدٌ مضى يُبثّ آلياً';
  end if;

  raise notice '✔ (ب) العتبة (% ساعة) تتفرّع على طرفيها وعلى الغياب وعلى الماضي', v_thr;
end;
$$;

-- ============================================================================
-- (ج) — (ي) القياس الحيّ كله، داخل معاملةٍ فرعية تُرجَع بكاملها
-- ============================================================================
do $$
declare
  v_sub    constant uuid := '5ea11ed0-0000-4000-8000-00000000ca19';
  v_usr    constant uuid := '00000000-0000-4000-8000-00000000ca19';
  v_sub2   constant uuid := '5ea11ed0-0000-4000-8000-00000000ca20';
  v_usr2   constant uuid := '00000000-0000-4000-8000-00000000ca20';
  v_cls    constant uuid := 'c0000000-0000-4000-8000-00000000ca19';
  v_slug   constant text := 'catest-a';
  v_phone  constant text := '01000000919';
  v_pay    constant numeric := 500;
  v_admin  uuid;
  v_bk     record;
  v_res    record;
  v_w      record;
  v_ids    uuid[] := '{}';
  v_req    uuid;
  v_msg    text;
  v_n      integer;
  v_txt    text;
  v_ts     timestamptz;
  v_l0     integer;
  v_l1     integer;
  v_thr    integer;
  -- 0124
  v_def    text;      -- نصُّ الدالة الحارسة كما هو على القاعدة (لإعادته حرفياً)
  v_mut     text;
  v_trg    text;      -- 0130: ونصُّ المُشغّل الحارس كذلك
  v_room   record;
  v_amt    numeric;
  v_y0     integer;
  v_y1     integer;
  v_wid    uuid;
  v_reason text;
  v_g      uuid;
  v_r2     uuid[] := '{}';
begin
  select p.id into v_admin from public.profiles p where p.role = 'admin' limit 1;
  if v_admin is null then
    raise exception '(ج-٠) لا مشرف في القاعدة — كل ما يلي كان سيقيس رفضاً لا سلوكاً';
  end if;
  select c.apology_manual_hours into v_thr from public.trip_closure_config() c;

  begin
    -- ══ الفيكسترة ═════════════════════════════════════════════════════════
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                            created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
    values
      (v_usr,  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       'completion@example.invalid', 'x', now(), now(), '{}'::jsonb,
       '{"full_name": "COMPLETION_TESTS متعهد"}'::jsonb),
      (v_usr2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       'completion2@example.invalid', 'x', now(), now(), '{}'::jsonb,
       '{"full_name": "COMPLETION_TESTS متعهد٢"}'::jsonb);

    insert into public.subcontractors (id, profile_id, company_name, contact_name, phone, status)
    values (v_sub,  v_usr,  'COMPLETION_TESTS متعهد',  'CA',  '01000000001', 'approved'),
           (v_sub2, v_usr2, 'COMPLETION_TESTS متعهد٢', 'CA2', '01000000002', 'approved');

    insert into public.vehicle_classes (id, slug, title, capacity, luggage_capacity, active, sort)
    values (v_cls, v_slug, 'COMPLETION_TESTS فئة', 1, 4, true, 9919);
    insert into public.tariffs (class_id, per_km, base_fee, min_price,
                                waiting_hour_price, round_trip_factor)
    values (v_cls, 20, 1000, 0, 0, 1.8);

    perform set_config('request.jwt.claims',
      json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

    -- عشرون رحلةً مُسنَدة متطابقة — والسابعة لمتعهدٍ آخر كي يُقاس العزل،
    -- و٨‑١٢ لحواجز 0124 على الاعتماد التلقائي، و١٣‑١٤ لسقف الخصم عن الرحلة،
    -- و١٥‑١٦ لسريان السقف نفسه على **مسار الفشل** (‏0126)، و١٧‑٢٠ لشرط
    -- المبرر المكتوب على المسارين معاً (‏0130)
    for v_n in 1 .. 20 loop
      select * into v_bk from public.create_booking(
        jsonb_build_object('label', 'CA مبدأ' || v_n, 'lat', 25.0, 'lng', 27.5),
        jsonb_build_object('label', 'CA منتهى' || v_n, 'lat', 24.5, 'lng', 28.2),
        1, false, 0, 100, 90, 'estimate', v_slug, 'full',
        'COMPLETION_TESTS عميل' || v_n, v_phone, null,
        now() + interval '30 days' + make_interval(days => v_n),
        'COMPLETION_TESTS_FIXTURE', null, null, 0, null, 0);
      v_ids := v_ids || v_bk.id;

      update public.bookings set status = 'under_review' where id = v_bk.id;
      update public.bookings set status = 'confirmed'    where id = v_bk.id;
      insert into public.dispatches (booking_id, status, round,
                                     assigned_subcontractor_id, assigned_payout, assigned_at)
      values (v_bk.id, 'assigned', 1,
              case when v_n = 7 then v_sub2 else v_sub end, v_pay, now());
      insert into public.trip_offers (booking_id, subcontractor_id, round, payout, status,
                                      expires_at, responded_at)
      values (v_bk.id, case when v_n = 7 then v_sub2 else v_sub end, 1, v_pay, 'accepted',
              now() + interval '1 hour', now());
      update public.bookings set status = 'assigned' where id = v_bk.id;
    end loop;

    -- والحجوزُ ١‑٣ و٨‑١٢ موعدُها في الماضي (طلبُ الإتمام يشترط أن تكون قد جرت)
    foreach v_n in array array[1, 2, 3, 8, 9, 10, 11, 12] loop
      update public.bookings
         set trip = jsonb_set(trip, '{pickupAt}',
                              to_jsonb((now() - interval '2 hours')::text))
       where id = v_ids[v_n];
    end loop;

    raise notice '✔ (ج-٠) عشرون رحلةً مُسنَدة بمستحق % (والسابعة لمتعهدٍ آخر) داخل معاملةٍ فرعية تُرجَع', v_pay;

    -- ══ (ج) الطلب — و**لا مالَ يتحرك** ═════════════════════════════════════
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_usr, 'role', 'authenticated')::text, true);

    select count(*)::integer into v_l0 from public.ledger_entries;

    select * into v_res from public.request_trip_completion(v_ids[1], 'CA نُفِّذت بلا ملاحظات');
    v_req := v_res.request_id;
    if v_req is null then
      raise exception '(ج-١) طلب الإتمام لم يُنشئ صفاً';
    end if;

    -- 🔴 الحجز ما زال «مُسندة» — وهذه هي ضمانةُ «لا يتحرك المال قبل الاعتماد»
    select b.status into v_txt from public.bookings b where b.id = v_ids[1];
    if v_txt <> 'assigned' then
      raise exception '(ج-٢) 🔴 الطلب وحده نقل الحجز إلى «%» — المال يتحرك بكلمة المتعهد', v_txt;
    end if;

    select count(*)::integer into v_l1 from public.ledger_entries;
    if v_l1 <> v_l0 then
      raise exception '(ج-٣) 🔴 الطلب كتب % قيداً في الدفتر — والاعتماد لم يقع بعد', v_l1 - v_l0;
    end if;
    if exists (select 1 from public.loyalty_entries e where e.booking_id = v_ids[1]) then
      raise exception '(ج-٤) 🔴 الطلب سكّ نقاطاً للعميل قبل الاعتماد';
    end if;

    -- والمهلةُ **مجمَّدةٌ عند الطلب** لا مقروءةٌ لحظةَ الاعتماد
    select r.auto_approve_at, r.approve_hours into v_ts, v_n
    from public.trip_completion_requests r where r.id = v_req;
    if v_n <> (select c.completion_approve_hours from public.trip_closure_config() c) then
      raise exception '(ج-٥) المهلة المجمَّدة % لا تطابق إعداد اللوحة', v_n;
    end if;
    if v_ts <= now() then
      raise exception '(ج-٦) لحظة الاعتماد التلقائي في الماضي فور الطلب';
    end if;

    -- طلبان على رحلةٍ واحدة: الفهرس الجزئي هو الحَكَم
    v_msg := null;
    begin
      perform * from public.request_trip_completion(v_ids[1], null);
      v_msg := '(قُبل)';
    exception when others then
      get stacked diagnostics v_msg = message_text;
    end;
    if v_msg = '(قُبل)' then
      raise exception '(ج-٧) طلبان معلَّقان على رحلةٍ واحدة';
    end if;

    -- ورحلةٌ لم يحن موعدها لا «تتمّ»
    v_msg := null;
    begin
      perform * from public.request_trip_completion(v_ids[4], null);
      v_msg := '(قُبل)';
    exception when others then
      get stacked diagnostics v_msg = message_text;
    end;
    if v_msg = '(قُبل)' then
      raise exception '(ج-٨) 🔴 طُلب إتمام رحلةٍ موعدها بعد شهر';
    end if;

    -- ورحلةُ متعهدٍ آخر ليست له
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_usr2, 'role', 'authenticated')::text, true);
    v_msg := null;
    begin
      perform * from public.request_trip_completion(v_ids[2], null);
      v_msg := '(قُبل)';
    exception when others then
      get stacked diagnostics v_msg = message_text;
    end;
    if v_msg = '(قُبل)' then
      raise exception '(ج-٩) 🔴 متعهدٌ طلب إتمام رحلةٍ ليست مُسنَدة إليه';
    end if;

    raise notice '✔ (ج) الطلب يُسجَّل ولا يحرّك ديناراً: الحالة «مُسندة» · صفرُ قيد · صفرُ نقطة · ولا يطلبه غير صاحبه';

    -- ══ (د) الاعتماد الإداري ⇒ **هنا يتحرك المال** ═════════════════════════
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

    -- والرفض يُعلَّل: المتعهد ينتظر مستحقه
    v_msg := null;
    begin
      perform * from public.decide_trip_completion(v_req, false, null);
      v_msg := '(قُبل)';
    exception when others then
      get stacked diagnostics v_msg = message_text;
    end;
    if v_msg = '(قُبل)' then
      raise exception '(د-١) رُفض طلبُ إتمامٍ بلا سببٍ مكتوب';
    end if;

    select count(*)::integer into v_l0 from public.ledger_entries;
    select * into v_res from public.decide_trip_completion(v_req, true, 'CA اعتماد');
    if v_res.status <> 'approved' or v_res.decided_actor <> 'admin' then
      raise exception '(د-٢) الاعتماد لم يُسجَّل بفاعله: % / %', v_res.status, v_res.decided_actor;
    end if;

    select b.status into v_txt from public.bookings b where b.id = v_ids[1];
    if v_txt <> 'completed' then
      raise exception '(د-٣) الاعتماد لم ينقل الحجز إلى «مكتملة» بل «%»', v_txt;
    end if;

    select count(*)::integer into v_l1 from public.ledger_entries;
    if v_l1 <= v_l0 then
      raise exception '(د-٤) 🔴 الاعتماد لم يكتب قيداً واحداً — ledger_on_booking_completed لم تعمل';
    end if;
    if not exists (
      select 1 from public.ledger_entries e
      where e.booking_id = v_ids[1] and e.settlement_role = 'earned'
        and e.subcontractor_id = v_sub
    ) then
      raise exception '(د-٥) لا مستحقَ مكتوبٌ للمتعهد بعد الاعتماد';
    end if;

    -- وقرارٌ على طلبٍ مقرَّر لا يتكرر
    v_msg := null;
    begin
      perform * from public.decide_trip_completion(v_req, true, 'CA تكرار');
      v_msg := '(قُبل)';
    exception when others then
      get stacked diagnostics v_msg = message_text;
    end;
    if v_msg = '(قُبل)' then
      raise exception '(د-٦) قُرِّر طلبٌ مقرَّرٌ سلفاً مرتين';
    end if;

    raise notice '✔ (د) الاعتماد الإداري وحده يحرّك الدفتر — والرفض بلا سببٍ مرفوض';

    -- ══ (هـ) الاعتماد التلقائي — **فاعلٌ اسمه `auto` لا فراغ** ═════════════
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_usr, 'role', 'authenticated')::text, true);
    select * into v_res from public.request_trip_completion(v_ids[2], 'CA طلبٌ يهرم');
    v_req := v_res.request_id;

    -- تقديمُ اللحظة بدل انتظار ٢٤ ساعة — والدالةُ تقرأ العمود لا الساعة
    update public.trip_completion_requests r
       set auto_approve_at = now() - interval '1 minute'
     where r.id = v_req;

    perform set_config('request.jwt.claims',
      json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

    -- ومتعهدٌ لا يبلغ الدورة أصلاً — الحارس قبل المنحة
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_usr, 'role', 'authenticated')::text, true);
    v_msg := null;
    begin
      perform * from public.settle_due_completions(10);
      v_msg := '(قُبل)';
    exception when others then
      get stacked diagnostics v_msg = message_text;
    end;
    if v_msg = '(قُبل)' then
      raise exception '(هـ-١) 🔴 متعهدٌ شغّل الاعتماد التلقائي بنفسه';
    end if;

    perform set_config('request.jwt.claims',
      json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
    select * into v_res from public.settle_due_completions(10);
    if v_res.approved < 1 then
      raise exception '(هـ-٢) الدورة لم تعتمد الطلب المستحق (فُحص % واعتُمد %)',
        v_res.scanned, v_res.approved;
    end if;

    select r.decided_actor, r.decision_note into v_msg, v_txt
    from public.trip_completion_requests r where r.id = v_req;
    if v_msg <> 'auto' then
      raise exception '(هـ-٣) 🔴 الفاعل «%» لا «auto» — «اعتُمد تلقائياً» يجب أن يكون معلومةً بعد شهر',
        coalesce(v_msg, '(فارغ)');
    end if;
    if coalesce(btrim(v_txt), '') = '' then
      raise exception '(هـ-٤) الاعتماد التلقائي بلا ملاحظةٍ تشرح سببه';
    end if;

    select b.status into v_txt from public.bookings b where b.id = v_ids[2];
    if v_txt <> 'completed' then
      raise exception '(هـ-٥) الاعتماد التلقائي لم ينقل الحجز إلى «مكتملة»';
    end if;

    -- ونداءٌ ثانٍ بلا مستحقّ: صفرٌ لا تكرار
    select * into v_res from public.settle_due_completions(10);
    if v_res.approved <> 0 then
      raise exception '(هـ-٦) الدورة اعتمدت % طلباً في نداءٍ ثانٍ — ليست آمنة الإعادة', v_res.approved;
    end if;

    raise notice '✔ (هـ) الاعتماد التلقائي يقع بفاعلٍ اسمه auto وبملاحظةٍ تشرحه، ونداؤه الثاني صفر';

    -- ══ (و) الاعتذار بعد الإسناد ══════════════════════════════════════════
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_usr, 'role', 'authenticated')::text, true);

    -- سببُ فشلٍ لا يصلح للاعتذار — الكتالوج واحدٌ بنطاق
    v_msg := null;
    begin
      perform * from public.withdraw_from_trip(v_ids[4], 'driver-no-show', 'CA');
      v_msg := '(قُبل)';
    exception when others then
      get stacked diagnostics v_msg = message_text;
    end;
    if v_msg = '(قُبل)' then
      raise exception '(و-١) سببٌ نطاقُه «فشل» قُبل في الاعتذار';
    end if;

    -- وسببٌ تختاره الإدارة وحدها
    v_msg := null;
    begin
      perform * from public.withdraw_from_trip(v_ids[4], 'platform-withdrawn', 'CA');
      v_msg := '(قُبل)';
    exception when others then
      get stacked diagnostics v_msg = message_text;
    end;
    if v_msg = '(قُبل)' then
      raise exception '(و-٢) 🔴 المتعهد اختار «سحبت الإدارة الإسناد» ليُدفع له كاملاً';
    end if;

    -- 🔴 والاعتذار نفسه — وهذا ما كان **مستحيلاً** قبل 0119
    select * into v_w from public.withdraw_from_trip(v_ids[4], 'partner-emergency', 'CA ظرف طارئ');
    if v_w.booking_id is null then
      raise exception '(و-٣) الاعتذار لم يُرجع صفاً';
    end if;

    select b.status into v_txt from public.bookings b where b.id = v_ids[4];
    if v_txt <> 'confirmed' then
      raise exception '(و-٤) الحجز بعد الاعتذار «%» لا «مؤكَّد» — لا يبلغه بثٌّ ولا قبول', v_txt;
    end if;

    select count(*)::integer into v_n from public.dispatches d
    where d.booking_id = v_ids[4] and d.assigned_subcontractor_id is null
      and d.assigned_payout is null and d.assigned_at is null;
    if v_n <> 1 then
      raise exception '(و-٥) 🔴 صفّ الدورة ما زال يحمل إسناداً بعد الاعتذار';
    end if;

    -- 🔴 وأهمّ تأكيدٍ في القسم: **يُستثنى من الموجة التالية**
    if not exists (
      select 1 from public.trip_offers o
      where o.booking_id = v_ids[4] and o.subcontractor_id = v_sub and o.status = 'rejected'
    ) then
      raise exception
        '(و-٦) 🔴 عرضُ المنسحب ليس «مرفوضاً» — والموجةُ التالية ستعرض عليه الرحلة التي اعتذر عنها قبل ثانية';
    end if;
    -- والشاهدُ البنيوي: هذا بعينه ما تُصفّيه `dispatch_broadcast`
    if not exists (
      select 1 from pg_get_functiondef(to_regprocedure('public.dispatch_broadcast(uuid, integer)')::oid) d
      where d like '%''rejected''%'
    ) then
      raise exception
        '(و-٧) 🔴 `dispatch_broadcast` لم تعد تُصفّي المرفوضين — استثناءُ المنسحب سقط من حيث لا نراه';
    end if;

    -- والسجل: لقطةٌ مجمَّدة، وخصمٌ **غير مطبَّق**
    select w.* into v_w from public.trip_withdrawals w where w.booking_id = v_ids[4];
    if v_w.reason_label <> 'ظرف طارئ للمتعهد أو سائقه' then
      raise exception '(و-٨) تسمية السبب لم تُلقَط في السجل';
    end if;
    if v_w.payout_snapshot is distinct from v_pay then
      raise exception '(و-٩) مستحق الرحلة لم يُلقَط: % لا %', v_w.payout_snapshot, v_pay;
    end if;
    if v_w.deduct_applied then
      raise exception '(و-١٠) 🔴 خصمٌ نُفِّذ على اعتذار والمفتاح مطفأ';
    end if;

    -- والسجلُّ مُلحَق: لا حذف
    v_msg := null;
    begin
      delete from public.trip_withdrawals where booking_id = v_ids[4];
      v_msg := '(قُبل)';
    exception when others then
      get stacked diagnostics v_msg = message_text;
    end;
    if v_msg = '(قُبل)' then
      raise exception '(و-١١) سجل الاعتذارات قابلٌ للحذف';
    end if;

    -- ولا يُعتذر مرتين: الرحلة لم تعد مُسنَدة إليه
    v_msg := null;
    begin
      perform * from public.withdraw_from_trip(v_ids[4], 'partner-emergency', 'CA');
      v_msg := '(قُبل)';
    exception when others then
      get stacked diagnostics v_msg = message_text;
    end;
    if v_msg = '(قُبل)' then
      raise exception '(و-١٢) اعتذارٌ ثانٍ عن رحلةٍ لم تعد مُسنَدة';
    end if;

    raise notice '✔ (و) الاعتذار يُخلي الإسناد ويعيد الحجز مؤكَّداً ويستثني المنسحب من الموجة التالية — وسجلُّه مُلحَقٌ بخصمٍ خامل';

    -- ══ (ز) الحارس: لا عودةَ إلى «مؤكَّد» والإسنادُ قائم ════════════════════
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
    v_msg := null;
    begin
      update public.bookings set status = 'confirmed' where id = v_ids[5];
      v_msg := '(قُبل)';
    exception when others then
      get stacked diagnostics v_msg = message_text;
    end;
    if v_msg = '(قُبل)' then
      raise exception
        '(ز-١) 🔴 الحجز عاد «مؤكَّداً» وما زال dispatches يحمل متعهداً — الزوجُ الجديد صار باباً خلفياً';
    end if;
    if v_msg not like '%مُسنَداً%' then
      raise exception '(ز-١) الرفض جاء برسالة «%» — ليست رسالة guard_booking_unassign', v_msg;
    end if;

    raise notice '✔ (ز) assigned⇒confirmed مرفوضٌ ما دام الإسناد قائماً — الزوج الجديد بحارسه';

    -- ══ (ح) 🔴 سقفُ الخصم — التأكيد الذي كان يحمرّ قبل 0119 ═════════════════
    v_msg := null;
    begin
      perform * from public.mark_booking_failed(
        v_ids[5], 'driver-no-show', 'deduct', v_pay * 10, 'CA خصمٌ فاحش');
      v_msg := '(قُبل)';
    exception when others then
      get stacked diagnostics v_msg = message_text;
    end;
    if v_msg = '(قُبل)' then
      raise exception
        '(ح-١) 🔴 خُصم % من متعهدٍ مستحقُّه % — والقرار: لا يصير مديناً بمالٍ لم يقبضه',
        v_pay * 10, v_pay;
    end if;
    -- 0126: صار السقف «المتبقّي من مستحق الرحلة» بدل «مستحق الرحلة» — ورسالتُه
    -- تحمل الرقمين معاً. والتأكيد على الجذر المشترك كي لا يُقيَّد بصياغة.
    if v_msg not like '%يتجاوز%' or v_msg not like '%مستحق هذه الرحلة%' then
      raise exception '(ح-١) الرفض جاء برسالة «%» — ليست رسالة السقف', v_msg;
    end if;

    -- والسقفُ **شاملٌ لا حصري**: المستحق كاملاً يمرّ
    select count(*)::integer into v_l0 from public.ledger_entries;
    perform * from public.mark_booking_failed(
      v_ids[5], 'driver-no-show', 'deduct', v_pay, 'CA خصمٌ بحدّ السقف');
    select count(*)::integer into v_l1 from public.ledger_entries;
    if v_l1 <= v_l0 then
      raise exception '(ح-٢) 🔴 الخصم بحدّ السقف لم يكتب قيداً — السقف صار حاجزاً على المشروع';
    end if;
    if not exists (
      select 1 from public.booking_failures f
      where f.booking_id = v_ids[5] and f.deduct_amount = v_pay
    ) then
      raise exception '(ح-٢) الخصم المقبول لم يُلقَط في صفّ الفشل';
    end if;

    -- والمبلغُ يسقط على اقتراح الكتالوج حين لا يرسل المدير رقماً
    update public.failure_reasons set default_deduct_amount = 100 where slug = 'driver-no-show';
    perform * from public.mark_booking_failed(v_ids[6], 'driver-no-show', 'deduct', null,
                                              'CA مبلغٌ من الكتالوج');
    select f.deduct_amount into v_n from public.booking_failures f where f.booking_id = v_ids[6];
    if v_n is distinct from 100 then
      raise exception '(ح-٣) المبلغ الافتراضي في الكتالوج لم يُستعمل: % لا 100', v_n;
    end if;

    raise notice '✔ (ح) 🔴 الخصم مسقوفٌ بمستحق الرحلة — يُرفض فوقه ويمرّ عنده، ويسقط على اقتراح الكتالوج';

    -- ══ (ط) الخصم على الاعتذار خاملٌ، ومفتاحُه له منفِّذ ════════════════════
    select w.id into v_req from public.trip_withdrawals w where w.booking_id = v_ids[4];
    v_msg := null;
    begin
      perform public.apply_withdrawal_deduction(v_req, 50, 'CA محاولةٌ والمفتاح مطفأ');
      v_msg := '(قُبل)';
    exception when others then
      get stacked diagnostics v_msg = message_text;
    end;
    if v_msg = '(قُبل)' then
      raise exception '(ط-١) 🔴 نُفِّذ خصمُ اعتذارٍ والمفتاح مطفأ — «خامل» ليس خاملاً';
    end if;
    if v_msg not like '%مطفأ%' then
      raise exception '(ط-١) الرفض جاء برسالة «%» — ليست رسالة المفتاح', v_msg;
    end if;

    -- وحين يُشعله المالك: **له منفِّذ فعلاً** — لا مفتاحَ بلا جهةٍ تنفّذه (النمط ٣)
    update public.trip_closure_settings set apology_deduction_enabled = true where id;

    -- 🔴 (ط-٢) 0124: الفاحشُ **يُقصّ إلى سقف الرحلة ولا يمرّ بحاله**، والقصُّ
    --    ليس صامتاً: المُرجَع هو المنفَّذ، ونصُّ القيد يقول من كم إلى كم.
    select count(*)::integer into v_l0 from public.ledger_entries;
    v_amt := public.apply_withdrawal_deduction(v_req, v_pay * 10, 'CA خصمٌ فاحش يُقصّ');
    if v_amt <> v_pay then
      raise exception
        '(ط-٢) 🔴 طُلب خصمُ % فنُفِّذ % — والسقف مستحقُّ الرحلة %', v_pay * 10, v_amt, v_pay;
    end if;
    select count(*)::integer into v_l1 from public.ledger_entries;
    if v_l1 <= v_l0 then
      raise exception '(ط-٢) 🔴 المفتاح مُشعَلٌ والتنفيذ لم يكتب قيداً — مفتاحٌ بلا منفِّذ';
    end if;
    if not exists (
      select 1 from public.ledger_entries e
      where e.subcontractor_id = v_sub and e.note like '%قُصَّ%'
    ) then
      raise exception
        '(ط-٢) 🔴 قُصَّ المبلغ ولم يُكتب القصُّ في نصّ القيد — قصٌّ صامت يترك المدير يظن أنه خصم ما كتب';
    end if;
    if not exists (select 1 from public.trip_withdrawals w
                   where w.id = v_req and w.deduct_applied and w.ledger_effect = 'deduct'
                     and w.deduct_amount = v_pay) then
      raise exception '(ط-٢) السجل لم يُعلَّم بالمبلغ المنفَّذ فعلاً بعد القصّ';
    end if;

    -- ولا يُنفَّذ مرتين
    v_msg := null;
    begin
      perform public.apply_withdrawal_deduction(v_req, 10, 'CA تكرارُ التنفيذ');
      v_msg := '(قُبل)';
    exception when others then
      get stacked diagnostics v_msg = message_text;
    end;
    if v_msg = '(قُبل)' then
      raise exception '(ط-٣) خصمُ الاعتذار نُفِّذ مرتين على صفٍّ واحد';
    end if;
    update public.trip_closure_settings set apology_deduction_enabled = false where id;

    raise notice '✔ (ط) الخصم على الاعتذار خاملٌ بالبذرة، ومفتاحُه له منفِّذٌ حقيقي: يُقصّ عند سقف الرحلة ويُكتب القصُّ، ولا يُنفَّذ مرتين';

    -- ══ (ي) العزل ═════════════════════════════════════════════════════════
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_usr, 'role', 'authenticated')::text, true);

    v_msg := null;
    begin
      perform * from public.decide_trip_completion(
        (select r.id from public.trip_completion_requests r limit 1), true, 'CA');
      v_msg := '(قُبل)';
    exception when others then
      get stacked diagnostics v_msg = message_text;
    end;
    if v_msg = '(قُبل)' then
      raise exception '(ي-١) 🔴 متعهدٌ اعتمد طلب إتمامٍ بنفسه — البوابة بلا حارس';
    end if;

    v_msg := null;
    begin
      perform public.apply_withdrawal_deduction(v_req, 10, 'CA متعهدٌ ينفّذ خصماً');
      v_msg := '(قُبل)';
    exception when others then
      get stacked diagnostics v_msg = message_text;
    end;
    if v_msg = '(قُبل)' then
      raise exception '(ي-٢) 🔴 متعهدٌ نفّذ خصماً مالياً';
    end if;

    -- والتظلّم: بابٌ يُطرَق، ولا يُطرَق على رحلةِ غيره
    v_req := public.file_grievance(v_ids[4], 'apology', 'CA أعترض على تصنيف اعتذاري وأطلب المراجعة');
    if v_req is null then
      raise exception '(ي-٣) التظلّم لم يُنشئ صفاً — «خصمٌ ومعه بابٌ يُطرَق» بلا باب';
    end if;
    v_msg := null;
    begin
      perform public.file_grievance(v_ids[7], 'failure', 'CA تظلّمٌ على رحلةٍ ليست لي إطلاقاً');
      v_msg := '(قُبل)';
    exception when others then
      get stacked diagnostics v_msg = message_text;
    end;
    if v_msg = '(قُبل)' then
      raise exception '(ي-٤) 🔴 متعهدٌ تظلّم على رحلةٍ ليست ضمن سجلّه';
    end if;
    -- ولا يبتّ في تظلّمه بنفسه
    v_msg := null;
    begin
      perform public.resolve_grievance(v_req, true, 'CA أقبل تظلّمي');
      v_msg := '(قُبل)';
    exception when others then
      get stacked diagnostics v_msg = message_text;
    end;
    if v_msg = '(قُبل)' then
      raise exception '(ي-٥) 🔴 متعهدٌ بتّ في تظلّمه بنفسه';
    end if;
    -- والبتُّ بلا سببٍ مرفوض
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
    v_msg := null;
    begin
      perform public.resolve_grievance(v_req, false, null);
      v_msg := '(قُبل)';
    exception when others then
      get stacked diagnostics v_msg = message_text;
    end;
    if v_msg = '(قُبل)' then
      raise exception '(ي-٦) بُتَّ في تظلّمٍ بلا سببٍ يقرؤه المتعهد';
    end if;
    -- 🔒 وقبولُ التظلّم **لا يردّ مالاً من تلقائه** — أثرٌ ماليٌّ صامت مرفوض:
    --    ردُّ الخصم حركةٌ مسمّاة في الدفتر يجريها المشرف بيده. والقياس يلفّ
    --    النداء نفسه لا شيئاً بعده.
    select count(*)::integer into v_l0 from public.ledger_entries;
    if public.resolve_grievance(v_req, true, 'CA قُبل ويُراجَع الخصم يدوياً') <> 'accepted' then
      raise exception '(ي-٧) البتّ السليم لم يُرجع الحالة';
    end if;
    select count(*)::integer into v_l1 from public.ledger_entries;
    if v_l1 <> v_l0 then
      raise exception
        '(ي-٨) 🔴 قبولُ التظلّم حرّك الدفتر من تلقائه (% قيداً) — أثرٌ ماليٌّ صامت',
        v_l1 - v_l0;
    end if;

    raise notice '✔ (ي) العزل: المتعهد لا يعتمد ولا يخصم ولا يتظلّم على رحلة غيره ولا يبتّ في تظلّمه — والقبول بلا أثرٍ ماليٍّ صامت';

    -- ══ (ل) 🔴 0124 — الاعتماد التلقائي امتيازُ الصمت لا امتيازُ تجاوز قرار ══
    --
    -- المقيس على القاعدة الحيّة **قبل** 0124: رفضٌ إداريّ ⇒ طلبٌ ثانٍ ⇒
    -- `scanned 1 · approved 1` والحجز `completed` و**الدفتر +2 والولاء +1**.

    -- شاهدٌ على نظافة الميدان: لا طلبَ مستحقٌّ من خارج الفيكسترة، وإلا صارت
    -- عدّاداتُ هذا القسم تقيس عملَ غيرنا لا عملنا
    select count(*)::integer into v_n
    from public.trip_completion_requests r
    join public.bookings b on b.id = r.booking_id
    where r.status = 'pending' and r.auto_approve_at <= now()
      and coalesce(b.trip ->> 'notes', '') not like 'COMPLETION_TESTS%';
    if v_n <> 0 then
      raise exception
        '(ل-٠) % طلبٍ مستحقٍّ من خارج الفيكسترة — عدّادات هذا القسم كانت ستقيس غيرَنا', v_n;
    end if;

    -- نفس السيناريو على رحلتين: رفضٌ إداريّ ⇒ ثم طلبٌ ثانٍ حلّت مهلتُه
    foreach v_n in array array[8, 9] loop
      perform set_config('request.jwt.claims',
        json_build_object('sub', v_usr, 'role', 'authenticated')::text, true);
      select * into v_res from public.request_trip_completion(v_ids[v_n], 'CA طلبٌ أول');

      perform set_config('request.jwt.claims',
        json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
      perform * from public.decide_trip_completion(
        v_res.request_id, false, 'CA الرحلة لم تُنفَّذ — العميل أنكر وصولها');

      -- 🔒 والتقديمُ ثانيةً **مسموح**: القرار منعُ الاعتماد الصامت لا منعُ التصحيح
      perform set_config('request.jwt.claims',
        json_build_object('sub', v_usr, 'role', 'authenticated')::text, true);
      select * into v_res from public.request_trip_completion(v_ids[v_n], 'CA طلبٌ ثانٍ بعد التصحيح');
      if v_res.request_id is null then
        raise exception
          '(ل-١) 🔴 مُنع المتعهد من إعادة التقديم بعد الرفض — والعقوبة منعُ الاعتماد لا منعُ التصحيح';
      end if;
      v_r2 := v_r2 || v_res.request_id;

      update public.trip_completion_requests r
         set auto_approve_at = now() - interval '1 minute'
       where r.id = v_res.request_id;
    end loop;

    perform set_config('request.jwt.claims',
      json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
    select count(*)::integer into v_l0 from public.ledger_entries;
    select count(*)::integer into v_y0 from public.loyalty_entries;
    select * into v_res from public.settle_due_completions(50);
    select count(*)::integer into v_l1 from public.ledger_entries;
    select count(*)::integer into v_y1 from public.loyalty_entries;

    if v_res.approved <> 0 then
      raise exception
        '(ل-٢) 🔴 اعتمدت الدورة % طلباً تلقائياً بعد رفضٍ إداريّ — فصار الصمتُ تجاوزاً لقرارٍ بشريّ',
        v_res.approved;
    end if;
    if v_res.held <> 2 then
      raise exception
        '(ل-٣) المؤجَّل عُدَّ % لا ٢ — عدّادٌ يبتلع ما لم يُعتمد أسوأ من اعتمادٍ خاطئ، لأنه لا يُرى',
        v_res.held;
    end if;
    if v_l1 <> v_l0 or v_y1 <> v_y0 then
      raise exception
        '(ل-٤) 🔴 تحرّك المال بلا اعتماد: الدفتر +% والولاء +%', v_l1 - v_l0, v_y1 - v_y0;
    end if;

    foreach v_n in array array[8, 9] loop
      select b.status into v_txt from public.bookings b where b.id = v_ids[v_n];
      if v_txt <> 'assigned' then
        raise exception
          '(ل-٥) 🔴 الرحلة % صارت «%» — الدورة أكملت ما رفضه إنسان', v_n, v_txt;
      end if;
    end loop;

    select r.status, r.auto_hold_reason into v_txt, v_msg
    from public.trip_completion_requests r where r.id = v_r2[1];
    if v_txt <> 'pending' then
      raise exception
        '(ل-٦) الطلب صار «%» — والمطلوب أن يبقى معلّقاً بانتظار قرارٍ بشريّ لا أن يُغلق', v_txt;
    end if;
    if coalesce(btrim(coalesce(v_msg, '')), '') = '' then
      raise exception
        '(ل-٧) 🔴 أُجِّل بلا سببٍ مكتوبٍ في الصفّ — «لم يُعتمد» بلا «لماذا» شكوى بعد شهر';
    end if;
    if v_msg not like '%إداري%' then
      raise exception '(ل-٧) سببُ التأجيل «%» لا يذكر القرار الإداري', v_msg;
    end if;

    -- 🔬 اختبارُ الطفرة: تُلتقط الدالةُ الحارسة بنصّها، ثم تُستبدل بنسخةِ
    --    **ما قبل 0124** (الفحوص المشتركة وحدها بلا الحاجزين) ⇒ فيمرّ العيب،
    --    ثم تُعاد الدالةُ **حرفياً** بـ`execute` على النصّ الملتقَط.
    v_def := pg_get_functiondef(to_regprocedure('public.trip_completion_gate(uuid, boolean)')::oid);

    create or replace function public.trip_completion_gate(
      p_request_id uuid,
      p_auto       boolean default false
    )
    returns table (code text, reason text)
    language plpgsql
    stable
    security definer
    set search_path = ''
    as $stub$
    declare
      v_r record;
      v_b record;
    begin
      select r.* into v_r from public.trip_completion_requests r where r.id = p_request_id;
      if not found then
        code := 'request-not-found'; reason := 'طلب الإتمام غير موجود'; return next; return;
      end if;
      if v_r.status <> 'pending' then
        code := 'already-decided'; reason := 'مقرَّرٌ سلفاً'; return next; return;
      end if;
      select b.* into v_b from public.bookings b where b.id = v_r.booking_id;
      if not found then
        code := 'booking-missing'; reason := 'الحجز مفقود'; return next; return;
      end if;
      if v_b.status <> 'assigned' then
        code := 'invalid-status'; reason := 'حالة الحجز تغيّرت'; return next; return;
      end if;
      code := null; reason := null; return next;
    end;
    $stub$;

    select * into v_res from public.settle_due_completions(50);
    if v_res.approved < 1 then
      raise exception
        '(ل-٨) 🔬 نُزع الحارس ولم يمرّ العيب (اعتُمد %) — فتأكيداتُ (ل-٢) لا تقيس حارساً بل غيابَ مستحقّ',
        v_res.approved;
    end if;
    select b.status into v_txt from public.bookings b where b.id = v_ids[9];
    if v_txt <> 'completed' then
      raise exception '(ل-٨) 🔬 نُزع الحارس والرحلة ٩ ما زالت «%»', v_txt;
    end if;

    -- وتُعاد الدالة كما كانت على القاعدة حرفاً بحرف — لا نسخةً مكتوبةً بيد (D-58)
    execute v_def;

    -- وبعد إعادتها: نفس السيناريو على الرحلة ١١ ⇒ يُمنع من جديد
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_usr, 'role', 'authenticated')::text, true);
    select * into v_res from public.request_trip_completion(v_ids[11], 'CA طلبٌ أول');
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
    perform * from public.decide_trip_completion(v_res.request_id, false, 'CA رفضٌ إداريّ ثانٍ');
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_usr, 'role', 'authenticated')::text, true);
    select * into v_res from public.request_trip_completion(v_ids[11], 'CA طلبٌ ثانٍ');
    update public.trip_completion_requests r
       set auto_approve_at = now() - interval '1 minute'
     where r.id = v_res.request_id;

    perform set_config('request.jwt.claims',
      json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
    select * into v_res from public.settle_due_completions(50);
    if v_res.approved <> 0 then
      raise exception
        '(ل-٩) 🔬 أُعيد الحارس ولم يمنع (اعتُمد %) — فالإعادة لم تقع فعلاً', v_res.approved;
    end if;
    select b.status into v_txt from public.bookings b where b.id = v_ids[11];
    if v_txt <> 'assigned' then
      raise exception '(ل-٩) 🔬 أُعيد الحارس والرحلة ١١ صارت «%»', v_txt;
    end if;

    raise notice
      '✔ (ل-أ) 🔴 رفضٌ إداريّ ⇒ لا اعتماد تلقائي أبداً: يبقى معلّقاً بسببٍ مكتوب ويُعدّ في held، ولا يتحرك دينار — ونزعُ الحارس يُعيد العيب وإعادتُه تمنعه';

    -- ══ وتظلّمٌ مفتوح على الرحلة نفسها **يجمّد** الاعتماد حتى يُحسم ══════════
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_usr, 'role', 'authenticated')::text, true);
    select * into v_res from public.request_trip_completion(v_ids[12], 'CA طلبٌ سليمٌ بلا رفضٍ سابق');
    v_req := v_res.request_id;
    v_g   := public.file_grievance(
      v_ids[12], 'settlement', 'CA أعترض على حساب مستحق هذه الرحلة وأطلب المراجعة');
    update public.trip_completion_requests r
       set auto_approve_at = now() - interval '1 minute'
     where r.id = v_req;

    perform set_config('request.jwt.claims',
      json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
    select count(*)::integer into v_l0 from public.ledger_entries;
    select * into v_res from public.settle_due_completions(50);
    select count(*)::integer into v_l1 from public.ledger_entries;

    if v_res.approved <> 0 then
      raise exception
        '(ل-١٠) 🔴 اعتُمدت الرحلة تلقائياً وعليها تظلّمٌ مفتوح — المال يتحرك والاعتراض قائم';
    end if;
    if v_l1 <> v_l0 then
      raise exception '(ل-١٠) 🔴 كُتب % قيداً والتظلّم مفتوح', v_l1 - v_l0;
    end if;
    select r.auto_hold_reason into v_msg
    from public.trip_completion_requests r where r.id = v_req;
    if coalesce(v_msg, '') not like '%تظلّم%' then
      raise exception
        '(ل-١١) سببُ التأجيل «%» لا يذكر التظلّم — المتعهد لا يعرف لماذا وقف طلبه',
        coalesce(v_msg, '(فارغ)');
    end if;

    -- 🔒 والتجميدُ **يُرفع بالحسم ولا يدوم**: تظلّمٌ مبتوتٌ يُطلق الاعتماد،
    --    وإلا صار البابُ الذي فتحناه للمتعهد قفلاً على مستحقه
    perform public.resolve_grievance(v_g, false, 'CA رُوجع الحساب وتبيّن صحته');
    select * into v_res from public.settle_due_completions(50);
    if v_res.approved <> 1 then
      raise exception
        '(ل-١٢) 🔴 بُتَّ التظلّم ولم يُعتمد الطلب (اعتُمد %) — تجميدٌ لا يُرفع مصادرةٌ لا حراسة',
        v_res.approved;
    end if;
    select b.status into v_txt from public.bookings b where b.id = v_ids[12];
    if v_txt <> 'completed' then
      raise exception '(ل-١٢) بُتَّ التظلّم والرحلة ١٢ ما زالت «%»', v_txt;
    end if;

    raise notice
      '✔ (ل-ب) 🔴 تظلّمٌ مفتوح يجمّد الاعتماد التلقائي بسببٍ مكتوب ولا يحرّك ديناراً — والبتُّ يرفع التجميد فيقع الاعتماد';

    -- ══ (م) 🔴 0124 — سقفُ الخصم لكل **رحلة** لا لكل صفّ اعتذار ═════════════
    --
    -- المقيس على القاعدة الحيّة **قبل** 0124: خمسُ دورات «إسنادٌ يدويّ ⇐ اعتذار
    -- ⇐ خصمٌ بحدّ المستحق» على رحلةٍ مستحقُّها 1500 ⇒ ٥ صفوف · 7500 ج.م ·
    -- **٥٫٠٠× المستحق**. والنصّ الحاكم البند ٨: «سقف الخصم عن أي رحلة هو
    -- مستحقُّ تلك الرحلة نفسها ولا يتجاوزه بحال … فلا يترتب رصيدٌ سالب».
    update public.trip_closure_settings set apology_deduction_enabled = true where id;

    -- ── (م-أ) الرحلة ١٣: ثلاثُ دوراتٍ، والحارس يُنزع ويُعاد بينها ──────────
    for v_n in 1 .. 3 loop
      perform set_config('request.jwt.claims',
        json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
      update public.dispatches d
         set status = 'assigned', assigned_subcontractor_id = v_sub,
             assigned_payout = v_pay, assigned_at = now(), manual_assign = true
       where d.booking_id = v_ids[13];
      update public.bookings b set status = 'assigned' where b.id = v_ids[13];

      perform set_config('request.jwt.claims',
        json_build_object('sub', v_usr, 'role', 'authenticated')::text, true);
      perform * from public.withdraw_from_trip(
        v_ids[13], 'partner-emergency', 'CA اعتذارٌ متكرر ' || v_n::text);
    end loop;

    select count(*)::integer into v_n
    from public.trip_withdrawals w where w.booking_id = v_ids[13];
    if v_n <> 3 then
      raise exception '(م-٠) بُنيت % صفوف اعتذارٍ لا ٣ — الفيكسترة لا تقيس ما وُصف', v_n;
    end if;

    perform set_config('request.jwt.claims',
      json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

    -- الصفّ الأول: خصمٌ بحدّ المستحق كاملاً ⇒ يمرّ
    select w.id into v_wid from public.trip_withdrawals w
    where w.booking_id = v_ids[13] and not w.deduct_applied
    order by w.withdrawn_at limit 1;
    if public.apply_withdrawal_deduction(v_wid, v_pay, 'CA خصمُ الاعتذار الأول') <> v_pay then
      raise exception '(م-١) الخصم الأول لم يمرّ بحدّ المستحق — السقف صار حاجزاً على المشروع';
    end if;

    -- 🔴 والصفّ الثاني: **لا متبقّى** — وهذا بعينه ما كان يمرّ خمس مرات
    select w.id into v_wid from public.trip_withdrawals w
    where w.booking_id = v_ids[13] and not w.deduct_applied
    order by w.withdrawn_at limit 1;
    v_msg := null;
    begin
      perform public.apply_withdrawal_deduction(v_wid, v_pay, 'CA خصمٌ ثانٍ عن نفس الرحلة');
      v_msg := '(قُبل)';
    exception when others then
      get stacked diagnostics v_msg = message_text;
    end;
    if v_msg = '(قُبل)' then
      raise exception
        '(م-٢) 🔴 خُصم مستحقُّ الرحلة مرتين عن رحلةٍ واحدة — البند ٨ مخترق، والمتعهد صار مديناً بما لم يقبضه';
    end if;
    if v_msg not like '%استُنفد%' then
      raise exception '(م-٢) الرفض جاء برسالة «%» — ليست رسالة استنفاد سقف الرحلة', v_msg;
    end if;

    -- 🔬 اختبارُ الطفرة: تُنزع مساحةُ الرحلة (تصير «لم يُخصم شيء») ⇒ يمرّ العيب
    v_def := pg_get_functiondef(to_regprocedure('public.trip_deduction_room(uuid)')::oid);

    create or replace function public.trip_deduction_room(p_booking_id uuid)
    returns table (trip_due numeric, deducted numeric, room numeric)
    language sql
    stable
    security definer
    set search_path = ''
    as $stub$
      select s.v, 0::numeric, s.v
      from (
        select greatest(round(coalesce(
          (select d.assigned_payout from public.dispatches d where d.booking_id = p_booking_id),
          (select w.payout_snapshot from public.trip_withdrawals w
            where w.booking_id = p_booking_id and w.payout_snapshot is not null
            order by w.withdrawn_at desc, w.created_at desc
            limit 1),
          0), 2), 0) as v
      ) s;
    $stub$;

    if public.apply_withdrawal_deduction(v_wid, v_pay, 'CA خصمٌ بلا تجميع') <> v_pay then
      raise exception
        '(م-٣) 🔬 نُزع الحارس ولم يمرّ العيب — فتأكيد (م-٢) لا يقيس تجميعاً على الحجز';
    end if;
    select coalesce(sum(w.deduct_amount), 0) into v_amt
    from public.trip_withdrawals w where w.booking_id = v_ids[13] and w.deduct_applied;
    if v_amt <> v_pay * 2 then
      raise exception '(م-٣) 🔬 مجموع المخصوم % لا ضعفَ المستحق %', v_amt, v_pay * 2;
    end if;

    -- وتُعاد الدالة حرفياً كما كانت على القاعدة
    execute v_def;

    -- والصفّ الثالث بعد الإعادة ⇒ يُرفض من جديد
    select w.id into v_wid from public.trip_withdrawals w
    where w.booking_id = v_ids[13] and not w.deduct_applied
    order by w.withdrawn_at limit 1;
    v_msg := null;
    begin
      perform public.apply_withdrawal_deduction(v_wid, v_pay, 'CA خصمٌ ثالث');
      v_msg := '(قُبل)';
    exception when others then
      get stacked diagnostics v_msg = message_text;
    end;
    if v_msg = '(قُبل)' then
      raise exception '(م-٤) 🔬 أُعيد الحارس ولم يمنع — فالإعادة لم تقع فعلاً';
    end if;

    -- ── (م-ب) الرحلة ١٤: القصُّ إلى المتبقّي، والمجموع لا يتجاوز المستحق ────
    for v_n in 1 .. 3 loop
      perform set_config('request.jwt.claims',
        json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
      update public.dispatches d
         set status = 'assigned', assigned_subcontractor_id = v_sub,
             assigned_payout = v_pay, assigned_at = now(), manual_assign = true
       where d.booking_id = v_ids[14];
      update public.bookings b set status = 'assigned' where b.id = v_ids[14];

      perform set_config('request.jwt.claims',
        json_build_object('sub', v_usr, 'role', 'authenticated')::text, true);
      perform * from public.withdraw_from_trip(
        v_ids[14], 'partner-emergency', 'CA اعتذارٌ متكرر ' || v_n::text);
    end loop;

    perform set_config('request.jwt.claims',
      json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

    select w.id into v_wid from public.trip_withdrawals w
    where w.booking_id = v_ids[14] and not w.deduct_applied
    order by w.withdrawn_at limit 1;
    if public.apply_withdrawal_deduction(v_wid, v_pay * 0.6, 'CA خصمٌ جزئي') <> v_pay * 0.6 then
      raise exception '(م-٥) الخصم الجزئي لم يمرّ بقيمته';
    end if;

    -- 🔴 والثاني يطلب أكثر من المتبقّي ⇒ **يُقصّ إلى المتبقّي** ويُكتب القصّ
    select w.id into v_wid from public.trip_withdrawals w
    where w.booking_id = v_ids[14] and not w.deduct_applied
    order by w.withdrawn_at limit 1;
    v_amt := public.apply_withdrawal_deduction(v_wid, v_pay * 0.8, 'CA خصمٌ يتجاوز المتبقّي');
    if v_amt <> round(v_pay * 0.4, 2) then
      raise exception
        '(م-٦) 🔴 طُلب % والمتبقّي % فنُفِّذ % — القصُّ ليس إلى المتبقّي',
        v_pay * 0.8, round(v_pay * 0.4, 2), v_amt;
    end if;
    if not exists (
      select 1 from public.ledger_entries e
      where e.subcontractor_id = v_sub
        and e.amount = v_amt
        and e.note like '%قُصَّ%'
    ) then
      raise exception
        '(م-٦) 🔴 قُصَّ المبلغ ولم يُكتب القصُّ في نصّ قيده — قصٌّ صامتٌ يخالف نبرة 0119 صراحةً';
    end if;

    -- والثالث: لا متبقّى ⇒ رفضٌ مفهوم لا صفرٌ صامت
    select w.id into v_wid from public.trip_withdrawals w
    where w.booking_id = v_ids[14] and not w.deduct_applied
    order by w.withdrawn_at limit 1;
    v_msg := null;
    begin
      perform public.apply_withdrawal_deduction(v_wid, 10, 'CA محاولةٌ ثالثة');
      v_msg := '(قُبل)';
    exception when others then
      get stacked diagnostics v_msg = message_text;
    end;
    if v_msg = '(قُبل)' then
      raise exception '(م-٧) 🔴 خُصم والمتبقّي صفر';
    end if;
    if exists (select 1 from public.trip_withdrawals w
               where w.id = v_wid and w.deduct_applied) then
      raise exception '(م-٧) 🔴 كُتب صفرٌ صامتٌ في الصفّ بدل رفضٍ مفهوم';
    end if;

    -- 🔒 والحكم الأخير: المجموع = مستحقُّ الرحلة بالضبط، والمساحة صفر
    select coalesce(sum(w.deduct_amount), 0) into v_amt
    from public.trip_withdrawals w where w.booking_id = v_ids[14] and w.deduct_applied;
    if v_amt <> v_pay then
      raise exception
        '(م-٨) 🔴 مجموعُ ما خُصم عن الرحلة % ومستحقُّها % — «ولا يتجاوزه بحال»', v_amt, v_pay;
    end if;
    select * into v_room from public.trip_deduction_room(v_ids[14]);
    if v_room.trip_due <> v_pay or v_room.deducted <> v_pay or v_room.room <> 0 then
      raise exception
        '(م-٩) مساحةُ الرحلة تقول مستحق % ومخصوم % ومتبقٍّ % — والواقع %/%/0',
        v_room.trip_due, v_room.deducted, v_room.room, v_pay, v_pay;
    end if;

    update public.trip_closure_settings set apology_deduction_enabled = false where id;

    raise notice
      '✔ (م) 🔴 السقف صار لكل رحلة: خصمٌ بحدّ المستحق يمرّ مرةً واحدة، وما بعده يُقصّ إلى المتبقّي ثم يُرفض عند الصفر — ومجموعُ ما خُصم عن الرحلة لا يتجاوز مستحقَّها، ونزعُ التجميع يُعيد العيب ضعفين';


    -- ══ (ن) 🔴 0126 — والسقفُ نفسه يسري على **مسار الفشل** ═════════════════
    --
    --   0124 سقّفت `apply_withdrawal_deduction` وحدها. و`mark_booking_failed`
    --   بقيت تسقّف بـ`dispatches.assigned_payout` فقط، فمرّ على رحلةٍ واحدة:
    --   اعتذارٌ خُصم عنه ثم إسنادٌ جديد ثم فشلٌ بخصمٍ كامل ⇒ **أكثرُ من مستحقها**.
    --   والترتيب هنا مقصود: **الطفرة أولاً** (فيُرى العيب كما كان)، ثم الحارس.
    -- ────────────────────────────────────────────────────────────────────────
    update public.trip_closure_settings set apology_deduction_enabled = true where id;

    -- (ن-٠) اعتذارٌ على الرحلة ١٥ يستهلك ٤٠٪ من المستحق
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_usr, 'role', 'authenticated')::text, true);
    perform public.withdraw_from_trip(v_ids[15], 'partner-no-reason', 'CA اعتذارٌ يستهلك جزءاً');
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
    select w.id into v_wid from public.trip_withdrawals w
    where w.booking_id = v_ids[15] and not w.deduct_applied
    order by w.withdrawn_at limit 1;
    perform public.apply_withdrawal_deduction(v_wid, round(v_pay * 0.4, 2), 'CA خصمٌ جزئي');

    update public.dispatches d
       set status = 'assigned', assigned_subcontractor_id = v_sub,
           assigned_payout = v_pay, assigned_at = now()
     where d.booking_id = v_ids[15];
    update public.bookings b set status = 'assigned' where b.id = v_ids[15];

    select * into v_room from public.trip_deduction_room(v_ids[15]);
    if v_room.room <> round(v_pay * 0.6, 2) then
      raise exception '(ن-٠) المتبقّي % والمتوقَّع % — الفرضية نفسها لم تتحقق',
        v_room.room, round(v_pay * 0.6, 2);
    end if;

    -- 🔬 (ن-١) الطفرة: تُنزع كتلةُ سقف المتبقّي من `mark_booking_failed` وحدها
    v_def := pg_get_functiondef(
               to_regprocedure('public.mark_booking_failed(uuid,text,text,numeric,text)')::oid);
    if v_def not like '%v_cap := least(v_cap, round(v_room.room, 2));%' then
      raise exception
        '(ن-١) 🔴 لا كتلةَ سقفٍ للمتبقّي في mark_booking_failed — 0126 غير مطبَّقة أو نُقضت';
    end if;
    execute replace(v_def,
      'v_cap := least(v_cap, round(v_room.room, 2));',
      'v_cap := v_cap; -- طفرة');

    v_msg := null;
    begin
      perform public.mark_booking_failed(v_ids[15], 'driver-no-show', 'deduct', v_pay,
                                         'CA فشلٌ بكامل المستحق فوق خصمٍ سابق');
      v_msg := '(قُبل)';
    exception when others then
      get stacked diagnostics v_msg = message_text;
    end;
    -- تُعاد الدالةُ **حرفياً** من النصّ الملتقَط، لا من نسخةٍ مكتوبةٍ بيد (D-58)
    execute v_def;

    if v_msg <> '(قُبل)' then
      raise exception
        '(ن-١) 🔬 نُزع الحارس ولم يمرّ العيب («%») — فتأكيدُ (ن-٢) لا يقيس هذا الحارس', v_msg;
    end if;
    select * into v_room from public.trip_deduction_room(v_ids[15]);
    if v_room.deducted <= v_room.trip_due then
      raise exception
        '(ن-١) 🔬 بلا الحارس بقي المخصوم % ≤ المستحق % — الطفرة لم تُنتج التجاوز',
        v_room.deducted, v_room.trip_due;
    end if;
    raise notice '  🔬 (ن-١) بلا سقف المتبقّي: خُصم % عن رحلةٍ مستحقُّها % — أي %×',
      v_room.deducted, v_room.trip_due, round(v_room.deducted / v_room.trip_due, 2);

    -- (ن-٢) وبالحارس المُعاد: نفس السيناريو على الرحلة ١٦ ⇒ **يُرفض**
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_usr, 'role', 'authenticated')::text, true);
    perform public.withdraw_from_trip(v_ids[16], 'partner-no-reason', 'CA اعتذارٌ يستهلك جزءاً');
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
    select w.id into v_wid from public.trip_withdrawals w
    where w.booking_id = v_ids[16] and not w.deduct_applied
    order by w.withdrawn_at limit 1;
    perform public.apply_withdrawal_deduction(v_wid, round(v_pay * 0.4, 2), 'CA خصمٌ جزئي');
    update public.dispatches d
       set status = 'assigned', assigned_subcontractor_id = v_sub,
           assigned_payout = v_pay, assigned_at = now()
     where d.booking_id = v_ids[16];
    update public.bookings b set status = 'assigned' where b.id = v_ids[16];

    v_msg := null;
    begin
      perform public.mark_booking_failed(v_ids[16], 'driver-no-show', 'deduct', v_pay,
                                         'CA فشلٌ بكامل المستحق فوق خصمٍ سابق');
      v_msg := '(قُبل)';
    exception when others then
      get stacked diagnostics v_msg = message_text;
    end;
    if v_msg = '(قُبل)' then
      raise exception
        '(ن-٢) 🔴 خُصم فوق المتبقّي من مسار الفشل — سقفُ البند ٨ مثقوبٌ من الطرف الآخر';
    end if;
    if v_msg not like '%يتجاوز المتبقّي%' then
      raise exception '(ن-٢) الرفض جاء برسالة «%» — ليست رسالة تجاوز المتبقّي', v_msg;
    end if;

    -- (ن-٣) وليس حاجزاً أعمى: **المتبقّي بالضبط يمرّ**، والمجموع لا يتجاوز المستحق
    if (public.mark_booking_failed(v_ids[16], 'driver-no-show', 'deduct',
                                   round(v_pay * 0.6, 2), 'CA فشلٌ بالمتبقّي')).deduct_amount
       <> round(v_pay * 0.6, 2) then
      raise exception '(ن-٣) 🔴 رُفض المتبقّي المشروع — الحارس صار حاجزاً على المشروع';
    end if;
    select * into v_room from public.trip_deduction_room(v_ids[16]);
    if v_room.deducted <> v_pay or v_room.room <> 0 then
      raise exception
        '(ن-٣) المجموع % والمستحق % والمتبقّي % — المتوقَّع %/%/0',
        v_room.deducted, v_room.trip_due, v_room.room, v_pay, v_pay;
    end if;

    update public.trip_closure_settings set apology_deduction_enabled = false where id;

    raise notice
      '✔ (ن) 🔴 0126 — سقفُ الرحلة صار واحداً للمسارين: `mark_booking_failed` تسأل `trip_deduction_room` فتُرفض ما يتجاوز المتبقّي وتقبل المتبقّي بالضبط، ونزعُ السطر الواحد يُعيد التجاوز فوراً';


    -- ══ (س) 🔴 0130 — المبررُ المكتوب شرطٌ في **كل** خصم، ويصل بوابةَ المتعهد ═
    --
    --   البند ٨ من الاتفاقية المنشورة: «ولا تُقبل المخالفة إلا بمبرر مكتوب
    --   يُثبَّت في السجل **ويُتاح للمتعهد**». وبلا قيمةٍ افتراضية في الكتالوج
    --   (قرارُ المالك 2026-08-18) فكلُّ خصمٍ مخالفة ⇒ المبررُ واجبٌ في كل واقعة.
    --
    --   والقسمُ يملك فيكسترته: سببٌ من صنعه (`catest-0130`) بمبلغٍ افتراضي
    --   **فارغ** — فلا يثبّت رقماً يملكه المالك ولا صفّاً يملكه شريك.
    -- ────────────────────────────────────────────────────────────────────────
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

    insert into public.failure_reasons
      (slug, label, default_action, applies_to, initiator, default_deduct_amount, sort)
    values
      ('catest-0130', 'CA سببٌ بلا مبلغ افتراضي', 'deduct', 'both', 'partner', null, 9130);

    -- (س-٠) المسطرة نفسها التي يقرؤها المنفِّذان — لا شرطٌ منسوخٌ هنا (القاعدة ١٢)
    if public.deduction_reason_ok(null) or public.deduction_reason_ok('   ')
       or public.deduction_reason_ok('.') or public.deduction_reason_ok('ok')
       or public.deduction_reason_ok('تم') then
      raise exception '(س-٠) 🔴 مسطرةُ المبرر تقبل ما لا يشرح شيئاً لمن يقرأ السجل غداً';
    end if;
    -- 🔬 والحدُّ يُقاس **بعد طيّ المسافات**: عشرُ مسافاتٍ بين حرفين لا تشتريه،
    --    وإلا كان الحارسُ فحصاً لا يمكن أن يفشل (النمط ٩ في `LESSONS`)
    if public.deduction_reason_ok('ا' || repeat(' ', 40) || 'ب') then
      raise exception '(س-٠) 🔴 الحدُّ الأدنى يُشترى بضغطِ مسطرة المسافة';
    end if;
    -- وشاهدٌ إيجابي: المشروع يمرّ، فالتأكيدات أعلاه ليست عميّة
    if not public.deduction_reason_ok('السائق لم يحضر') then
      raise exception '(س-٠) مسطرةُ المبرر ترفض مبرراً مشروعاً — حاجزٌ على المشروع';
    end if;

    -- (س-١) مسارُ الفشل: خصمٌ بمبررٍ **فارغ** ⇒ رفض
    v_msg := null;
    begin
      -- 🔴 سالبٌ عمداً: المبررُ `null` هو المقصود، فلا يُملأ
      perform * from public.mark_booking_failed(v_ids[17], 'catest-0130', 'deduct', 100, null);
      v_msg := '(قُبل)';
    exception when others then
      get stacked diagnostics v_msg = message_text;
    end;
    if v_msg = '(قُبل)' then
      raise exception '(س-١) 🔴 خصمٌ مرّ بلا مبرر مكتوب — البند ٨ مثقوب';
    end if;
    if v_msg not like '%مبرر%' then
      raise exception '(س-١) الرفض جاء برسالة «%» — ليست رسالة المبرر', v_msg;
    end if;

    -- (س-١ب) ومسافاتٌ بيضاء ليست مبرراً: الفراغُ المموَّه يُرفض كالفراغ
    v_msg := null;
    begin
      perform * from public.mark_booking_failed(v_ids[17], 'catest-0130', 'deduct', 100,
                                                repeat(' ', 25));
      v_msg := '(قُبل)';
    exception when others then
      get stacked diagnostics v_msg = message_text;
    end;
    if v_msg = '(قُبل)' then
      raise exception '(س-١ب) 🔴 خمسٌ وعشرون مسافةً مرّت مبرراً';
    end if;

    -- (س-٢) وقصيرٌ ⇒ رفض، **والرسالة تقول الحدَّ من الدالة لا من رقمٍ محفور**
    v_msg := null;
    begin
      perform * from public.mark_booking_failed(v_ids[17], 'catest-0130', 'deduct', 100, '.');
      v_msg := '(قُبل)';
    exception when others then
      get stacked diagnostics v_msg = message_text;
    end;
    if v_msg = '(قُبل)' then
      raise exception '(س-٢) 🔴 «.» مرّت مبرراً لخصمٍ مالي';
    end if;
    if v_msg not like '%' || public.deduction_reason_min_chars()::text || '%' then
      raise exception '(س-٢) الرفض جاء برسالة «%» — لا تحمل الحدَّ الأدنى', v_msg;
    end if;

    -- (س-٣) ومبلغٌ غائبٌ ⇒ رفضٌ **برسالةِ الغياب** لا برسالةِ «غير موجب»:
    --       `catest-0130` بلا قيمةٍ افتراضية، فلا صفرَ صامتاً يسقط عليه
    v_msg := null;
    begin
      perform * from public.mark_booking_failed(v_ids[17], 'catest-0130', 'deduct', null,
                                                'CA مبررٌ سليمٌ ومبلغٌ غائب');
      v_msg := '(قُبل)';
    exception when others then
      get stacked diagnostics v_msg = message_text;
    end;
    if v_msg = '(قُبل)' then
      raise exception '(س-٣) 🔴 خصمٌ مرّ بلا مبلغ — وصفرٌ صامتٌ يخصم لا شيء ويقفل الرحلة';
    end if;
    if v_msg not like '%صريحاً%' then
      raise exception
        '(س-٣) الرفض جاء برسالة «%» — والمطلوب رسالةُ «اكتب الرقم» لا «رقمُك خطأ»', v_msg;
    end if;

    -- 🔒 ولا شيء وقع بعد ثلاثة رفوض: كلُّ نداءٍ معاملةٌ واحدة (**D-48**)
    select count(*)::integer into v_n
      from public.booking_failures f where f.booking_id = v_ids[17];
    if v_n <> 0 then
      raise exception '(س-٣) 🔴 بقي % صفَّ فشلٍ بعد نداءاتٍ مرفوضة — نصفُ خصمٍ في القاعدة', v_n;
    end if;

    -- (س-٤) والسليمُ يمرّ — ويُخزَّن **مطبَّعاً** لا كما كُتب
    select count(*)::integer into v_l0 from public.ledger_entries;
    select * into v_res from public.mark_booking_failed(
      v_ids[17], 'catest-0130', 'deduct', 120,
      '  CA السائق    لم يحضر وأبلغ العميل بنفسه  ');
    if v_res.action_taken <> 'deduct' or v_res.deduct_amount <> 120 then
      raise exception '(س-٤) المدخلُ الصحيح رُفض أو نُفِّذ بغير مبلغه: «%»/%',
        v_res.action_taken, v_res.deduct_amount;
    end if;
    select f.override_note into v_txt
      from public.booking_failures f where f.booking_id = v_ids[17];
    if v_txt <> 'CA السائق لم يحضر وأبلغ العميل بنفسه' then
      raise exception
        '(س-٤) 🔴 المبرر خُزِّن «%» — والمقيس هو المطبَّع، فما يُقاس غيرُ ما يُخزَّن', v_txt;
    end if;
    select count(*)::integer into v_l1 from public.ledger_entries;
    if v_l1 <= v_l0 then
      raise exception '(س-٤) الخصم قُبل ولم يكتب قيداً';
    end if;
    -- ونصُّ القيد يحمل المبرر: من يراجع الدفتر لا يملك صفَّ الفشل أمامه
    if not exists (
      select 1 from public.ledger_entries e
      where e.subcontractor_id = v_sub and e.note like '%وأبلغ العميل بنفسه%'
    ) then
      raise exception '(س-٤) 🔴 المبرر لم يسافر مع القيد — الدفتر يقول «خُصم» ولا يقول لماذا';
    end if;

    -- (س-٥) 🔴 «ويُتاح للمتعهد» — يقرؤه **بهويته هو** من بوابته
    --
    --   وقبل القراءة يُخصم على **متعهدٍ آخر** (الرحلة ٧ للمتعهد الثاني)، وإلا
    --   كان تأكيدُ العزل أدناه يقيس غياباً لا حجباً — أي فحصاً لا يمكن أن يفشل
    --   (النمط ٩ في `LESSONS`).
    perform * from public.mark_booking_failed(
      v_ids[7], 'catest-0130', 'deduct', 90, 'CA خصمٌ على متعهدٍ آخر لقياس العزل');
    if not exists (
      select 1 from public.booking_failures f
      where f.booking_id = v_ids[7] and f.subcontractor_id = v_sub2 and f.action_taken = 'deduct'
    ) then
      raise exception '(س-٥) الفرضية لم تتحقق: لا خصمَ على المتعهد الثاني ليُحجب عن الأول';
    end if;

    perform set_config('request.jwt.claims',
      json_build_object('sub', v_usr, 'role', 'authenticated')::text, true);
    select count(*)::integer into v_n
      from public.portal_deductions() d
     where d.booking_id = v_ids[17]
       and d.kind = 'failure'
       and d.amount = 120
       and d.written_reason = 'CA السائق لم يحضر وأبلغ العميل بنفسه';
    if v_n <> 1 then
      raise exception
        '(س-٥) 🔴 المتعهد يقرأ % بنداً عن خصمه بمبرِّره — والبند ٨ يشترط إتاحته له', v_n;
    end if;
    -- 🔒 وما لا يجوز أن يعبر لا يعبر (**D-19**): رمزُ الرحلة لا مرجعُ العميل
    if exists (
      select 1 from public.portal_deductions() d
      join public.bookings b on b.id = d.booking_id
      where d.trip_code = b.reference
    ) then
      raise exception '(س-٥) 🔴 مرجعُ العميل عبر إلى بوابة المتعهد مع الخصم';
    end if;
    -- 🔒 ولا يرى خصمَ غيره: الرحلة ٧ خُصم عليها فعلاً، ومع ذلك لا تصله
    if exists (select 1 from public.portal_deductions() d where d.booking_id = v_ids[7]) then
      raise exception '(س-٥) 🔴 المتعهد يقرأ خصماً وقع على متعهدٍ آخر — D-20';
    end if;
    -- وصاحبُه يراه: الحجبُ عزلٌ لا عطلٌ في الدالة
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_usr2, 'role', 'authenticated')::text, true);
    if not exists (
      select 1 from public.portal_deductions() d
      where d.booking_id = v_ids[7]
        and d.written_reason = 'CA خصمٌ على متعهدٍ آخر لقياس العزل'
    ) then
      raise exception '(س-٥) 🔴 صاحبُ الخصم لا يراه — الحجب صار عطلاً لا عزلاً';
    end if;
    if exists (select 1 from public.portal_deductions() d where d.booking_id = v_ids[17]) then
      raise exception '(س-٥) 🔴 والعزل في الاتجاه الآخر مثقوب كذلك';
    end if;
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

    -- 🔬 (س-٦أ) الطفرة الأولى: يُنزع من **الدالة** كلُّ ما يعتمد على المبرر —
    --     شرطُه الصريح، **ومعه** ضمُّه إلى نصّ القيد. والثاني يُنزع لأنه يحجب
    --     الأول عن القياس: `record_partner_adjustment` ترفض قيداً بلا نصّ،
    --     ونصُّنا يصير `null` بضمّ `v_note` الفارغ إليه — فيرتدّ النداءُ من
    --     الدفتر قبل أن يبلغ صفَّ الفشل، ويبقى حارسُ الصفّ **غيرَ مقيس**.
    --     وبعد نزعهما معاً يبقى حارسٌ واحد: مُشغّلُ الصفّ — وهو ما يقيسه هذا
    --     التأكيد (حارسان مستقلان لقدرةٍ خطرة، النمط ٧ في `LESSONS`).
    v_def := pg_get_functiondef(
               to_regprocedure('public.mark_booking_failed(uuid,text,text,numeric,text)')::oid);
    if v_def not like '%البند ٨ يشترط تثبيته في السجل%' then
      raise exception '(س-٦أ) 🔴 لا شرطَ مبررٍ في mark_booking_failed — 0130 غير مطبَّقة أو نُقضت';
    end if;
    /*
     * 🔴 الطفرةُ بتعبيرٍ نمطيّ لا بنصٍّ حرفيّ.
     *
     * كانت `replace(...)` تشترط مسافاتِ البادئة حرفاً بحرف، فلمّا كتبت `0130`
     * الحارسَ بمسافاتٍ أخرى **لم يقع الاستبدالُ أصلاً** — فبقي الحارسُ قائماً،
     * ومرّ المنعُ منه لا من مُشغّل الصفّ، **والطفرةُ صارت عقيماً تقيس نفسها**.
     * (وكشفَها التأكيدُ التالي، فالتصميمُ سليمٌ والنصُّ وحده كان هشّاً.)
     *
     * فالنمطُ الآن يمسك الكتلة من `if` إلى `end if;` أياً كانت بادئتُها،
     * ويشدّها إلى رسالةِ الحارس نفسِها فلا يبتلع كتلةً أخرى.
     */
    v_mut := regexp_replace(v_def,
      $mut$if[^;]*?v_note is null then\s*raise exception\s*'الخصم لا يقع بلا مبرر مكتوب[^']*'\s*using hint = 'override-note-required';\s*end if;$mut$,
      'null; -- طفرة 0130');
    if v_mut = v_def then
      raise exception '(س-٦أ) 🔬 الطفرةُ لم تُغيّر الجسم — النمطُ لم يطابق حارسَ 0130، فالقياسُ عقيم';
    end if;
    v_mut := regexp_replace(v_mut, $mut$\|\|\s*' — '\s*\|\|\s*v_note$mut$, '');
    execute v_mut;

    v_msg := null;
    begin
      -- 🔴 سالبٌ عمداً
      perform * from public.mark_booking_failed(v_ids[18], 'catest-0130', 'deduct', 100, null);
      v_msg := '(قُبل)';
    exception when others then
      get stacked diagnostics v_msg = message_text;
    end;
    if v_msg = '(قُبل)' then
      raise exception
        '(س-٦أ) 🔴 نُزع شرطُ الدالة فمرّ الخصم — حارسُ الصفّ لا يحرس، والقدرةُ بحارسٍ واحد';
    end if;
    if v_msg not like '%مبرَّرٍ مكتوب%' then
      raise exception '(س-٦أ) المنعُ جاء من رسالة «%» — ليست رسالة حارس الصفّ', v_msg;
    end if;

    -- 🔬 (س-٦ب) والطفرة الثانية: يُنزع حارسُ الصفّ **أيضاً** ⇒ العيبُ يمرّ أمام
    --     أعيننا، فيُعرف أن التأكيدات أعلاه تقيس حارسَين لا عدماً
    v_trg := pg_get_triggerdef(
               (select t.oid from pg_trigger t join pg_class c on c.oid = t.tgrelid
                 where c.relname = 'booking_failures'
                   and t.tgname = 'booking_failures_deduct_reason'));
    drop trigger booking_failures_deduct_reason on public.booking_failures;

    v_msg := null;
    begin
      -- 🔴 سالبٌ عمداً
      perform * from public.mark_booking_failed(v_ids[18], 'catest-0130', 'deduct', 100, null);
      v_msg := '(قُبل)';
    exception when others then
      get stacked diagnostics v_msg = message_text;
    end;
    -- ثم يُعاد الحارسان **حرفياً** من النصَّين الملتقَطين لا من نسخةٍ مكتوبةٍ بيد (D-58)
    execute v_trg;
    execute v_def;

    if v_msg <> '(قُبل)' then
      raise exception
        '(س-٦ب) 🔬 نُزع الحارسان ولم يمرّ العيب («%») — فتأكيدات (س-١) لا تقيس هذين الحارسين',
        v_msg;
    end if;
    if not exists (
      select 1 from public.booking_failures f
      where f.booking_id = v_ids[18] and f.action_taken = 'deduct'
        and coalesce(f.override_note, '') = ''
    ) then
      raise exception '(س-٦ب) 🔬 الطفرة لم تُنتج الصفَّ بلا مبرر — القياس بلا معنى';
    end if;

    -- (س-٦ج) وبالحارسَين المُعادين: نفسُ النداء على رحلةٍ أخرى ⇒ **يُرفض**
    v_msg := null;
    begin
      -- 🔴 سالبٌ عمداً
      perform * from public.mark_booking_failed(v_ids[19], 'catest-0130', 'deduct', 100, null);
      v_msg := '(قُبل)';
    exception when others then
      get stacked diagnostics v_msg = message_text;
    end;
    if v_msg = '(قُبل)' then
      raise exception '(س-٦ج) 🔴 أُعيد الحارسان ولم يُمنع الخصمُ بلا مبرر';
    end if;

    -- (س-٧) وحارسُ الصفّ **مستقلٌّ عن الدالة**: إدراجٌ مباشر بلا مبرر يُرفض
    v_msg := null;
    begin
      insert into public.booking_failures (
        booking_id, reason_id, reason_slug, reason_label, default_action,
        action_taken, deduct_amount, override_note, from_status,
        subcontractor_id, payout_snapshot, ledger_effect, failed_at, created_by
      )
      select v_ids[19], r.id, r.slug, r.label, r.default_action,
             'deduct', 50, 'ok', 'assigned',
             v_sub, v_pay, 'none', now(), v_admin
      from public.failure_reasons r where r.slug = 'catest-0130';
      v_msg := '(قُبل)';
    exception when others then
      get stacked diagnostics v_msg = message_text;
    end;
    if v_msg = '(قُبل)' then
      raise exception '(س-٧) 🔴 صفُّ خصمٍ بمبررٍ من حرفين دخل الجدول من خارج الدالة';
    end if;

    -- ══ (س-٨) ونفسُ المسطرة على مسار **الاعتذار** — والمفتاح يُشعَل ثم يُطفأ ══
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_usr, 'role', 'authenticated')::text, true);
    perform public.withdraw_from_trip(v_ids[20], 'catest-0130', 'CA اعتذارٌ لقياس المبرر');
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
    update public.trip_closure_settings set apology_deduction_enabled = true where id;

    select w.id into v_wid from public.trip_withdrawals w
     where w.booking_id = v_ids[20] and not w.deduct_applied
     order by w.withdrawn_at limit 1;

    -- قصيرٌ ⇒ رفض
    v_msg := null;
    begin
      perform public.apply_withdrawal_deduction(v_wid, 100, 'ok');
      v_msg := '(قُبل)';
    exception when others then
      get stacked diagnostics v_msg = message_text;
    end;
    if v_msg = '(قُبل)' then
      raise exception '(س-٨أ) 🔴 «ok» مرّت مبرراً لخصمِ اعتذار';
    end if;

    -- ومبلغٌ غائب ⇒ رفض: الاقتراحُ المسجَّل في الصفّ لا يُنفَّذ بنفسه
    v_msg := null;
    begin
      perform public.apply_withdrawal_deduction(v_wid, null, 'CA مبررٌ سليمٌ ومبلغٌ غائب');
      v_msg := '(قُبل)';
    exception when others then
      get stacked diagnostics v_msg = message_text;
    end;
    if v_msg = '(قُبل)' then
      raise exception '(س-٨ب) 🔴 نُفِّذ خصمُ اعتذارٍ بلا مبلغٍ صريح';
    end if;
    if v_msg not like '%صريحاً%' then
      raise exception '(س-٨ب) الرفض جاء برسالة «%» — ليست رسالة المبلغ الصريح', v_msg;
    end if;

    -- والسليمُ يمرّ، ويُثبَّت المبرر **في الصفّ** فيبلغ بوابةَ المتعهد
    v_amt := public.apply_withdrawal_deduction(
               v_wid, round(v_pay * 0.5, 2), 'CA اعتذارٌ متأخرٌ أربع ساعات قبل التحرك');
    if v_amt <> round(v_pay * 0.5, 2) then
      raise exception '(س-٨ج) نُفِّذ % والمطلوب %', v_amt, round(v_pay * 0.5, 2);
    end if;
    if not exists (
      select 1 from public.trip_withdrawals w
      where w.id = v_wid and w.deduct_applied
        and w.deduct_note = 'CA اعتذارٌ متأخرٌ أربع ساعات قبل التحرك'
    ) then
      raise exception '(س-٨ج) 🔴 المبرر لم يُثبَّت في صفّ الاعتذار — فلا سبيل للمتعهد إليه';
    end if;

    perform set_config('request.jwt.claims',
      json_build_object('sub', v_usr, 'role', 'authenticated')::text, true);
    if not exists (
      select 1 from public.portal_deductions() d
      where d.booking_id = v_ids[20] and d.kind = 'apology'
        and d.written_reason = 'CA اعتذارٌ متأخرٌ أربع ساعات قبل التحرك'
    ) then
      raise exception '(س-٨ج) 🔴 خصمُ الاعتذار لا يبلغ بوابةَ المتعهد بمبرِّره';
    end if;
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

    -- 🔬 (س-٨د) وحارسُ صفّ الاعتذار مستقلٌّ عن الدالة كذلك: يُسنَد الحجزُ من
    --     جديد ويُعتذَر عنه ثانيةً — ثم تُرفع رايةُ «خُصم» بتحديثٍ مباشر بلا
    --     مبرَّرٍ كافٍ، فتُرفض. (والصفُّ المستهدَف موجودٌ فعلاً، وإلا كان
    --     التأكيدُ يقيس تحديثاً على صفر صفوف — أي فحصاً لا يمكن أن يفشل.)
    update public.dispatches d
       set status = 'assigned', assigned_subcontractor_id = v_sub,
           assigned_payout = v_pay, assigned_at = now()
     where d.booking_id = v_ids[20];
    update public.bookings b set status = 'assigned' where b.id = v_ids[20];
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_usr, 'role', 'authenticated')::text, true);
    perform public.withdraw_from_trip(v_ids[20], 'catest-0130', 'CA اعتذارٌ ثانٍ لقياس الحارس');
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

    select count(*)::integer into v_n from public.trip_withdrawals w
     where w.booking_id = v_ids[20] and not w.deduct_applied;
    if v_n <> 1 then
      raise exception '(س-٨د) الفرضية لم تتحقق: % صفَّ اعتذارٍ غير منفَّذ لا واحداً', v_n;
    end if;

    v_msg := null;
    begin
      update public.trip_withdrawals w
         set deduct_applied = true, deduct_amount = 10, deduct_note = '.'
       where w.booking_id = v_ids[20] and not w.deduct_applied;
      v_msg := '(قُبل)';
    exception when others then
      get stacked diagnostics v_msg = message_text;
    end;
    if v_msg = '(قُبل)' then
      raise exception '(س-٨د) 🔴 رايةُ «خُصم» رُفعت بمبررٍ من محرفٍ واحد بتحديثٍ مباشر';
    end if;
    if v_msg not like '%مبرَّرٍ مكتوب%' then
      raise exception '(س-٨د) المنعُ جاء من رسالة «%» — ليست رسالة حارس الصفّ', v_msg;
    end if;

    update public.trip_closure_settings set apology_deduction_enabled = false where id;

    raise notice
      '✔ (س) 🔴 0130 — لا خصمَ بلا مبلغٍ صريحٍ موجب ولا بلا مبرَّرٍ مكتوبٍ يبلغ % حرفاً بعد طيّ المسافات، على المسارين معاً؛ والمبررُ يُخزَّن مطبَّعاً في الصفّ ويسافر مع القيد ويصل بوابةَ المتعهد بلا مرجعِ عميل؛ وحارسان مستقلان — نزعُ حارسِ الدالة وحده لا يُمرّر العيب، ونزعُهما معاً يُمرّره ثم تُعيدهما فيُمنع',
      public.deduction_reason_min_chars();

    raise exception 'COMPLETION_APOLOGY_TESTS_ROLLBACK';
  exception
    when others then
      execute 'reset role';
      perform set_config('request.jwt.claims', '', true);
      if sqlerrm <> 'COMPLETION_APOLOGY_TESTS_ROLLBACK' then raise; end if;
  end;

  raise notice '✔ القياس الحيّ تمّ داخل معاملةٍ فرعية أُرجعت بكاملها';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ك) 🔒 لم يبقَ أثر — وهذه **قاعدة الإنتاج نفسها**
-- ----------------------------------------------------------------------------
do $$
declare
  v_c integer; v_w integer; v_g integer; v_b integer; v_l integer; v_s integer; v_r integer;
  v_n integer;
  v_bc integer := current_setting('tours.ca_c')::integer;
  v_bw integer := current_setting('tours.ca_w')::integer;
  v_bg integer := current_setting('tours.ca_g')::integer;
  v_bb integer := current_setting('tours.ca_b')::integer;
  v_bl integer := current_setting('tours.ca_l')::integer;
  v_bs integer := current_setting('tours.ca_s')::integer;
  v_br integer := current_setting('tours.ca_r')::integer;
begin
  select count(*)::integer into v_c from public.trip_completion_requests;
  select count(*)::integer into v_w from public.trip_withdrawals;
  select count(*)::integer into v_g from public.partner_grievances;
  select count(*)::integer into v_b from public.bookings;
  select count(*)::integer into v_l from public.ledger_entries;
  select count(*)::integer into v_s from public.subcontractors;
  select count(*)::integer into v_r from public.failure_reasons;

  if v_c <> v_bc then raise exception 'تنظيف ناقص: طلبات الإتمام % والأساس %', v_c, v_bc; end if;
  if v_w <> v_bw then raise exception 'تنظيف ناقص: الاعتذارات % والأساس %', v_w, v_bw; end if;
  if v_g <> v_bg then raise exception 'تنظيف ناقص: التظلّمات % والأساس %', v_g, v_bg; end if;
  if v_b <> v_bb then raise exception 'تنظيف ناقص: الحجوزات % والأساس %', v_b, v_bb; end if;
  if v_l <> v_bl then
    raise exception 'تنظيف ناقص: قيود الدفتر % والأساس % — قيدٌ باقٍ يحرّك رصيد متعهد', v_l, v_bl;
  end if;
  if v_s <> v_bs then raise exception 'تنظيف ناقص: المتعهدون % والأساس %', v_s, v_bs; end if;
  if v_r <> v_br then raise exception 'تنظيف ناقص: أسباب الفشل % والأساس %', v_r, v_br; end if;

  select count(*)::integer into v_n
    from public.vehicle_classes vc where vc.slug like 'catest-%';
  if v_n <> 0 then raise exception 'تنظيف ناقص: % فئة سيارة اختبارية باقية', v_n; end if;
  select count(*)::integer into v_n
    from public.failure_reasons r where r.slug like 'catest-%';
  if v_n <> 0 then raise exception 'تنظيف ناقص: % سبب اختباري باقٍ', v_n; end if;
  select count(*)::integer into v_n
    from public.bookings b where b.trip ->> 'notes' like 'COMPLETION_TESTS%';
  if v_n <> 0 then raise exception 'تنظيف ناقص: % حجز اختباري باقٍ', v_n; end if;

  -- 🔴 والمفتاح كما تركه المالك: القياس أشعله ثم أطفأه، وإن بقي مُشعَلاً فقد
  --    تسرّب قرارٌ مالي من مجموعة اختبار — وهو بعينه ما وقع في `payment_tests`
  if exists (select 1 from public.trip_closure_settings c where c.apology_deduction_enabled) then
    raise exception
      '🔴 تنظيف ناقص: مفتاح الخصم على الاعتذار ما زال مُشعَلاً — قرارٌ مالي تسرّب من القياس';
  end if;
  -- والمبلغ الافتراضي الذي حقنه (ح-٣) لا يبقى في كتالوج المالك
  if exists (select 1 from public.failure_reasons r
             where r.slug = 'driver-no-show' and r.default_deduct_amount is not null) then
    raise exception '🔴 تنظيف ناقص: مبلغٌ افتراضي حقنه القياس ما زال في الكتالوج';
  end if;

  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claims', '', false);

  raise notice 'ALL PASSED — البوابة قائمة: المتعهد يطلب ولا يتحرك دينار، والاعتماد (إدارياً أو تلقائياً بفاعلٍ اسمه auto) هو وحده ما يحرّك الدفتر والولاء؛ و🔴 الاعتماد التلقائي صار امتيازَ الصمت وحده — طلبٌ يلي رفضاً إدارياً لا يُعتمد أبداً، وتظلّمٌ مفتوح يجمّده حتى يُحسم، وكلاهما بسببٍ مكتوبٍ في الصفّ وعدّادٍ منفصل؛ والاعتذار بعد الإسناد صار له مخرجٌ يُخلي الإسناد ويعيد الحجز مؤكَّداً ويستثني المنسحب من الموجة التالية ويتفرّع بعتبةٍ من اللوحة؛ و🔴 سقفُ الخصم صار عن الرحلة نفسها لا عن كل صفّ اعتذار — يُقصّ عند المتبقّي ويُرفض عند الصفر ومجموعُه لا يتجاوز المستحق، وخصمُ الاعتذار خاملٌ بالبذرة بمنفِّذٍ حقيقي خلف مفتاحه، ومعه بابُ تظلّمٍ لا يفتحه صاحبه على نفسه — و🔴 0130 — لا خصمَ بلا مبلغٍ صريحٍ موجب ولا بلا مبرَّرٍ مكتوبٍ يبلغ عشرة أحرف بعد طيّ المسافات، يُخزَّن مطبَّعاً في الصفّ ويسافر مع القيد **ويصل بوابةَ المتعهد** كما يشترط البند ٨، بحارسَين مستقلَّين؛ وكلُّ حاجزٍ منها مقيسٌ بنزعه ثم إعادته حرفياً، وصفر أثرٍ في القاعدة';
end;
$$;
