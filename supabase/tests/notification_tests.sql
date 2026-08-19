-- ============================================================================
-- notification_tests.sql — اختبارات قبول لحالة عرض الإشعارات (هجرة 0077)
--
-- كيف تشغّله: `pnpm db:test notification` أو الصق الملف كاملاً في SQL Editor.
-- النجاح = آخر سطر «ALL PASSED». وأي فشل exception عربية فيها المتوقع والفعلي.
--
-- ══════════════════════════════════════════════════════════════════════════
--  🔬 كل تأكيد هنا يُسمّي **الطفرة التي يمسكها** — والطفرات تُبنى وتُشغَّل
-- ══════════════════════════════════════════════════════════════════════════
--
-- «ماذا يثبت هذا التأكيد فعلاً؟» لا يُجاب عنه بالنية بل بالطفرة: تأكيدٌ لا
-- توجد تعديلةٌ معقولة في الكود تُسقطه هو تأكيدٌ يزيّن التقرير ولا يحرس شيئاً.
-- ولذلك القسم (ح) **يبني ثلاث طفرات فعلاً ويشغّلها**:
--
--   | الطفرة | ما تمثّله من خطأٍ واقعي | التأكيد الذي يجب أن تُسقطه |
--   |---|---|---|
--   | `nt_mut_dismiss`   يحذف الصف بدل أن يكتب `dismissed_at` | «مسح الكل» مكتوباً `delete` — وهو أول ما يخطر لمن يقرأ الطلب حرفياً | (أ-٢) الصف باقٍ بكل حقول تسليمه |
--   | `nt_mut_mark_read` بلا شرط `recipient_kind = 'ops'`      | «تعليم الكل كمقروء» يكنس صناديق المتعهدين | (ب-٢) صفُّ المتعهد لم يُمسّ |
--   | سياسة `select` مفتوحة لـ`authenticated`                  | `using (true)` بدل `is_admin()` | (ج-١) المتعهد يقرأ صفر صف |
--
-- ── 🔴 ما يحرسه هذا الملف، ولماذا هو حرجٌ لا تجميلي ────────────────────────
--
-- (١) **`notifications` سجلُّ تسليم لا قائمةُ واجهة.** منه شُخِّص عيبٌ حقيقي
--     (‏`trip_offered` لا يبلغ أحداً). فـ«الإخفاء» يجب أن يكون **حالةَ عرضٍ
--     تُكتب** لا `delete` — وإلا صار عطل التسليم القادم غير قابل للتشخيص.
--
-- (٢) **الجدول يحمل اسم العميل وهاتفه وإجمالي حجزه.** و`authenticated` تشمل
--     **كل متعهد** (D-20). فقراءةُ متعهدٍ للجدول مباشرةً تسريبٌ مباشر — وهو
--     ما تمنعه `is_admin()` في سياسة `SELECT`، ويقيسه القسم (ج) **بنداءٍ حيٍّ
--     بدور المتعهد** لا بقراءة السياسة.
--
-- (٣) **`read_at` على صفّ متعهد ليست ملكَ المالك**: هي علامةُ قراءته هو في
--     `portal_inbox` (‏`0054`). و«تعليم الكل كمقروء» بلا حارسٍ كان سيُطفئ
--     صناديق كل المتعهدين دفعةً واحدة — عرضٌ معلّقٌ يصير مقروءاً بلا أن يفتحه
--     صاحبه، فيسقط الاحتياطي في الحالة التي وُجد لها.
--
-- ── ولماذا كلُّ القياس داخل معاملةٍ فرعية تُرجَع ─────────────────────────────
--
-- هذه **قاعدة الإنتاج نفسها**: صفُّ إشعارٍ باقٍ يُرسَل فعلاً في الدورة التالية،
-- وسياسةٌ باقية تفتح الجدول للجميع. فـ«صفر أثر» خاصيةٌ بنيوية لا خطوةُ تنظيف.
--
-- ما يغطيه الملف:
--   (٠)  الشروط المسبقة · (٠-ب) خط الأساس · (٠-ج) مسبار المسبار
--   (أ)  🔴 الإخفاء يكتب ولا يمحو: الصف باقٍ بكل حقول تسليمه حرفاً بحرف
--   (ب)  🔴 الحارس `ops`: لا يُمسّ صفُّ متعهدٍ بأيٍّ من الدوالّ الثلاث
--   (ج)  🔴 العزل: المتعهد لا يقرأ الجدول ولا ينفّذ الدوالّ · والزائر لا شيء
--   (د)  «مكنوس» ≠ «مقروء» · والاستعادة تُرجع الاثنين
--   (هـ) لا بابَ حذفٍ واحد: صفر منح delete/truncate لـanon/authenticated
--   (ح)  🔬 الطفرات الثلاث تُبنى وتُشغَّل ويُثبَت أنها تُسقط تأكيداتها
--   (ط)  🚏 المحطاتُ تبلغ الحمولةَ والصندوق (0144): حمولةُ العرض والتشغيل
--        والعميل · إسقاطُ `portal_inbox` **بجلسة المتعهد نفسه** · التوافقُ
--        الرجعيّ للرحلة المباشرة · و🔒 لا إحداثيةَ محطةٍ في صفِّ إشعارٍ أبداً
--   (ي)  صفر أثر
--
-- المرجع: supabase/migrations/0077_notification_view_state.sql · 0054 · D-19 · D-20
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

  if to_regclass('public.notifications') is null then
    raise exception 'شرط مسبق: public.notifications غير موجود';
  end if;

  select string_agg(x.c, '، ') into v_missing
  from (values ('read_at'), ('dismissed_at'), ('channel_outcomes'), ('recipient_kind')) as x(c)
  where not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'notifications' and column_name = x.c
  );
  if v_missing is not null then
    raise exception 'شرط مسبق: أعمدة مفقودة (نفّذ 0077 و0054): %', v_missing;
  end if;

  select string_agg(x.s, '، ') into v_missing
  from (values
    ('public.ops_notifications_mark_read(uuid)'),
    ('public.ops_notifications_dismiss(uuid)'),
    ('public.ops_notifications_restore(uuid)'),
    ('public.is_admin()')
  ) as x(s)
  where to_regprocedure(x.s) is null;
  if v_missing is not null then
    raise exception 'شرط مسبق: دوالّ مفقودة (نفّذ 0077_notification_view_state.sql): %', v_missing;
  end if;

  raise notice '✔ (٠) الشروط المسبقة سليمة';
end;
$$;

-- ----------------------------------------------------------------------------
-- (٠-ب) خط الأساس — تُقارَن به نهايةُ الملف
-- ----------------------------------------------------------------------------
do $$
declare
  v_n integer; v_r integer; v_d integer; v_u integer; v_s integer;
begin
  select count(*)::integer,
         count(*) filter (where read_at is not null)::integer,
         count(*) filter (where dismissed_at is not null)::integer
    into v_n, v_r, v_d
  from public.notifications;
  select count(*)::integer into v_u from auth.users;
  select count(*)::integer into v_s from public.subcontractors;

  perform set_config('tours.nt_n', v_n::text, false);
  perform set_config('tours.nt_r', v_r::text, false);
  perform set_config('tours.nt_d', v_d::text, false);
  perform set_config('tours.nt_u', v_u::text, false);
  perform set_config('tours.nt_s', v_s::text, false);

  raise notice '✔ (٠-ب) خط الأساس: % صفاً (% مقروء · % مكنوس)', v_n, v_r, v_d;
end;
$$;

-- ----------------------------------------------------------------------------
-- (٠-ج) مسبار المسبار — مشرفٌ حقيقي موجود
--
-- بلا هذا، كلُّ ما بعده يقيس **غياب جلسة** لا حارساً: دوالُّ 0077 ترفض غير
-- الإداري، فلو لم يكن في القاعدة مشرفٌ أصلاً لمرّ القسمان (أ) و(ب) بلا أن
-- ينفّذا بياناً واحداً.
-- ----------------------------------------------------------------------------
do $$
declare
  v_admin uuid;
begin
  select p.id into v_admin from public.profiles p where p.role = 'admin' limit 1;
  if v_admin is null then
    raise exception '(٠-ج) لا مشرف في القاعدة — القياس كان سيقيس غياب جلسة لا حارساً';
  end if;
  perform set_config('tours.nt_admin', v_admin::text, false);
  raise notice '✔ (٠-ج) مسبار المسبار: مشرفٌ موجود';
end;
$$;

-- ============================================================================
-- القياس الحيّ كله — داخل معاملةٍ فرعية تُرجَع بكاملها
-- ============================================================================
do $$
declare
  v_admin  uuid := current_setting('tours.nt_admin', true)::uuid;
  v_usr    constant uuid := 'b0000000-0000-4000-8000-00000000001a';
  v_sub    constant uuid := 'b0000000-0000-4000-8000-00000000002b';
  v_ops1   constant uuid := 'b1000000-0000-4000-8000-00000000001a';
  v_ops2   constant uuid := 'b1000000-0000-4000-8000-00000000002b';
  v_par    constant uuid := 'b1000000-0000-4000-8000-00000000003c';
  v_before record;
  v_after  record;
  v_n      integer;
  v_total  integer;
  v_base   integer;
  v_ok     boolean;
  v_msg    text;
  -- (ط) المحطات الوسطى في الحمولات وفي صندوق البورتال — 0144
  v_bk     uuid;
  v_bk0    uuid;
  v_trip   jsonb;
  v_pl     jsonb;
  v_sum    jsonb;
  v_inb    constant uuid := 'b1000000-0000-4000-8000-00000000004d';
begin
  begin
    -- ══ الفيكسترة ═════════════════════════════════════════════════════════
    -- ثلاثة صفوف: اثنان لفريق التشغيل وواحدٌ لمتعهد. والحمولة تحمل **مادّةً
    -- شبيهةً بالحقيقية** (اسمٌ وهاتفٌ وإجمالي) لأن القسم (ج) يقيس تسريبَها.
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                            created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
    values (v_usr, '00000000-0000-0000-0000-000000000000', 'authenticated',
            'authenticated', 'notiftests@example.invalid', 'x', now(), now(),
            '{}'::jsonb, '{"full_name": "NOTIF_TESTS متعهد"}'::jsonb);

    insert into public.subcontractors (id, profile_id, company_name, phone, email, status)
    values (v_sub, v_usr, 'NT_TESTS متعهد', '01000000201', 'nt@example.invalid', 'approved');

    select count(*)::integer into v_base from public.notifications;

    insert into public.notifications
      (id, event, payload, channels, status, attempts, error, delivered_at,
       recipient_kind, recipient_id, channel_outcomes)
    values
      (v_ops1, 'booking_created',
       '{"bookingId":"b1000000-0000-4000-8000-0000000000ff","customerName":"NOTIF_TESTS عميل","customerPhone":"01000000299","total":3845}'::jsonb,
       array['dashboard','telegram'], 'sent', 1, null, now(), 'ops', null,
       '[{"channel":"telegram","result":"sent"}]'::jsonb),
      (v_ops2, 'receipt_uploaded',
       '{"bookingId":"b1000000-0000-4000-8000-0000000000ee","customerName":"NOTIF_TESTS عميل ٢"}'::jsonb,
       array['dashboard','email'], 'failed', 2, 'البريد: فشل — NT_TESTS', null, 'ops', null,
       '[{"channel":"email","result":"failed","reason":"NT_TESTS"}]'::jsonb),
      (v_par, 'trip_offered',
       '{"bookingId":"b1000000-0000-4000-8000-0000000000dd"}'::jsonb,
       array['telegram','inbox'], 'sent', 1, null, now(), 'partner', v_sub, null);

    perform set_config('request.jwt.claims',
      json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

    -- ══ (أ) 🔴 الإخفاء يكتب ولا يمحو ═══════════════════════════════════════

    -- (أ-١) لقطةُ حقول التسليم **قبل** الإخفاء — وهي المرجع الذي يُقارَن به
    select event, payload, channels, status, attempts, error, created_at,
           delivered_at, recipient_kind, recipient_id, escalation, channel_outcomes
      into v_before
    from public.notifications where id = v_ops1;

    select public.ops_notifications_dismiss(v_ops1) into v_n;
    if v_n <> 1 then
      raise exception '(أ-١) الإخفاء أثّر في % صفاً بدل ١', v_n;
    end if;

    -- (أ-٢) 🔴 التأكيد المركزي: الصف **باقٍ**، وكلُّ حقلٍ من حقول التسليم كما كان
    if not exists (select 1 from public.notifications where id = v_ops1) then
      raise exception '(أ-٢) 🔴 الصف اختفى بعد الإخفاء — «مسح» صار حذفاً، وعطل التسليم القادم لا يُشخَّص';
    end if;

    select event, payload, channels, status, attempts, error, created_at,
           delivered_at, recipient_kind, recipient_id, escalation, channel_outcomes
      into v_after
    from public.notifications where id = v_ops1;

    if v_after is distinct from v_before then
      raise exception '(أ-٢) 🔴 الإخفاء مسّ حقلَ تسليم: قبل [%] وبعد [%]', v_before, v_after;
    end if;

    -- (أ-٣) وعدد الصفوف كله لم ينقص
    select count(*)::integer into v_total from public.notifications;
    if v_total <> v_base + 3 then
      raise exception '(أ-٣) العدد % والمتوقع % — الإخفاء أنقص صفوفاً', v_total, v_base + 3;
    end if;

    raise notice '✔ (أ) الإخفاء حالةُ عرضٍ لا حذف: الصف باقٍ و١٢ حقلَ تسليمٍ لم يتغيّر منها حرف';

    -- ══ (د) «مكنوس» ≠ «مقروء» ══════════════════════════════════════════════
    select read_at is null and dismissed_at is not null into v_ok
    from public.notifications where id = v_ops1;
    if not v_ok then
      raise exception '(د-١) الإخفاء كتب read_at — و«كُنس بلا قراءة» معلومةٌ تشغيلية تضيع بذلك';
    end if;

    -- ══ (ب) 🔴 الحارس `ops` — لا يُمسّ صفُّ متعهد ═════════════════════════
    select public.ops_notifications_mark_read(null) into v_n;
    if v_n < 1 then
      raise exception '(ب-١) «تعليم الكل» أثّر في صفر صف — التأكيد كان سيمرّ على لا شيء';
    end if;

    -- (ب-٢) 🔴 صفُّ المتعهد لم يُمسّ — الطفرة الثانية في (ح) تُسقط هذا التأكيد
    select read_at is null and dismissed_at is null into v_ok
    from public.notifications where id = v_par;
    if not v_ok then
      raise exception
        '(ب-٢) 🔴 «تعليم الكل كمقروء» مسّ صفَّ متعهد — عرضٌ معلّقٌ صار مقروءاً بلا أن يفتحه صاحبه';
    end if;

    -- وصفوف التشغيل قُرئت فعلاً (وإلا كان (ب-٢) يمرّ لأن شيئاً لم يحدث)
    select count(*)::integer into v_n from public.notifications
     where id in (v_ops1, v_ops2) and read_at is not null;
    if v_n <> 2 then
      raise exception '(ب-١) % صفَّ تشغيلٍ من ٢ صار مقروءاً', v_n;
    end if;

    -- (ب-٣) والإخفاء الجماعي لا يمسّ المتعهد كذلك
    perform public.ops_notifications_dismiss(null);
    select dismissed_at is null into v_ok from public.notifications where id = v_par;
    if not v_ok then
      raise exception '(ب-٣) 🔴 «مسح الكل» كنس صفَّ متعهد';
    end if;

    -- (د-٢) الاستعادة تُرجع الحالتين معاً — وبها يصير المسح قراراً غير نهائي
    perform public.ops_notifications_restore(v_ops1);
    select read_at is null and dismissed_at is null into v_ok
    from public.notifications where id = v_ops1;
    if not v_ok then
      raise exception '(د-٢) الاستعادة لم تُرجع الصف إلى الجرس — فالمسح حذفٌ عملياً';
    end if;

    select count(*)::integer into v_total from public.notifications;
    if v_total <> v_base + 3 then
      raise exception '(د-٢) العدد تغيّر بعد القراءة/المسح/الاستعادة: % والمتوقع %', v_total, v_base + 3;
    end if;

    raise notice '✔ (ب) الحارس ops حيّ في الدوالّ الثلاث · و(د) المكنوس ليس مقروءاً والاستعادة تُرجعهما';

    -- ══ (ج) 🔴 العزل — بنداءٍ حيٍّ بدور المتعهد لا بقراءة سياسة ════════════
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_usr, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';

    select count(*)::integer into v_n from public.notifications;
    if v_n <> 0 then
      raise exception
        '(ج-١) 🔴 المتعهد قرأ % صفاً من notifications مباشرةً — وفيها أسماء عملاء وهواتفهم وإجمالياتهم', v_n;
    end if;

    -- (ج-٢) ولا ينفّذ أياً من الدوالّ الثلاث
    foreach v_msg in array array['mark_read', 'dismiss', 'restore'] loop
      begin
        execute format('select public.ops_notifications_%s(null)', v_msg);
        execute 'reset role';
        raise exception '(ج-٢) 🔴 المتعهد نفّذ ops_notifications_% — والحارس is_admin() ساقط', v_msg;
      exception
        when insufficient_privilege or raise_exception then
          null; -- المتوقع: إمّا منعُ التنفيذ وإمّا استثناء `forbidden` من داخلها
      end;
    end loop;

    execute 'reset role';
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

    -- (ج-٣) والزائر لا يملك تنفيذاً أصلاً
    select count(*)::integer into v_n
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public'
      and p.proname in ('ops_notifications_mark_read', 'ops_notifications_dismiss',
                        'ops_notifications_restore')
      and has_function_privilege('anon', p.oid, 'execute');
    if v_n <> 0 then
      raise exception '(ج-٣) الزائر يملك تنفيذ % دالة من دوالّ الإشعارات', v_n;
    end if;

    raise notice '✔ (ج) العزل: المتعهد صفر صفٍّ وصفر تنفيذ · والزائر صفر تنفيذ';

    -- ══ (هـ) لا بابَ حذفٍ واحد ══════════════════════════════════════════════
    select count(*)::integer into v_n
    from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'notifications'
      and privilege_type in ('DELETE', 'TRUNCATE')
      and grantee in ('anon', 'authenticated');
    if v_n <> 0 then
      raise exception '(هـ) % منحَ حذفٍ باقٍ لـanon/authenticated على سجل التسليم', v_n;
    end if;
    raise notice '✔ (هـ) صفر منحِ delete/truncate لدورَي المتصفح';

    -- ══ (ح) 🔬 الطفرات — تُبنى وتُشغَّل ويُثبَت أنها تُسقط تأكيداتها ═══════

    -- ── (ح-١) طفرة «المسح = حذف» ⇒ يجب أن تُسقط (أ-٢)
    execute $mut$
      create or replace function public.nt_mut_dismiss(p_id uuid)
      returns integer language plpgsql security definer set search_path = ''
      as $body$
      declare v_n integer;
      begin
        delete from public.notifications n where n.id = p_id;
        get diagnostics v_n = row_count;
        return v_n;
      end;
      $body$;
    $mut$;

    perform public.nt_mut_dismiss(v_ops2);
    if exists (select 1 from public.notifications where id = v_ops2) then
      raise exception '(ح-١) 🔬 الطفرة لم تحذف شيئاً — فالتأكيد (أ-٢) لم يُختبَر أصلاً';
    end if;
    -- ⬅ هنا بالضبط يُثبت أن (أ-٢) حيّ: نفس المسند الذي مرّ على الإخفاء يسقط
    --    على الحذف. ولو كان (أ-٢) مكتوباً «العدد ≥ ٠» لمرّ على الاثنين.
    select count(*)::integer into v_total from public.notifications;
    if v_total <> v_base + 2 then
      raise exception '(ح-١) 🔬 العدد بعد الطفرة % والمتوقع % — القياس نفسه معطوب', v_total, v_base + 2;
    end if;
    raise notice '✔ (ح-١) 🔬 طفرة «المسح = حذف» بُنيت وشُغّلت فأسقطت (أ-٢) — التأكيد حيّ';

    -- ── (ح-٢) طفرة «تعليم الكل بلا حارس ops» ⇒ يجب أن تُسقط (ب-٢)
    execute $mut$
      create or replace function public.nt_mut_mark_read(p_id uuid default null)
      returns integer language plpgsql security definer set search_path = ''
      as $body$
      declare v_n integer;
      begin
        update public.notifications n set read_at = now()
         where n.read_at is null and (p_id is null or n.id = p_id);
        get diagnostics v_n = row_count;
        return v_n;
      end;
      $body$;
    $mut$;

    perform public.nt_mut_mark_read(null);
    select read_at is not null into v_ok from public.notifications where id = v_par;
    if not v_ok then
      raise exception
        '(ح-٢) 🔬 الطفرة بلا حارسٍ لم تمسّ صفَّ المتعهد — فالتأكيد (ب-٢) لا يقيس الحارس بل شيئاً آخر';
    end if;
    raise notice '✔ (ح-٢) 🔬 طفرة «بلا شرط ops» بُنيت وشُغّلت فكنست صندوق المتعهد — فـ(ب-٢) حيّ';

    -- ── (ح-٣) طفرة «سياسة select مفتوحة» ⇒ يجب أن تُسقط (ج-١)
    execute 'create policy nt_mut_open on public.notifications for select to authenticated using (true)';

    perform set_config('request.jwt.claims',
      json_build_object('sub', v_usr, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select count(*)::integer into v_n from public.notifications;
    execute 'reset role';
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

    if v_n = 0 then
      raise exception
        '(ح-٣) 🔬 سياسةٌ مفتوحة أُضيفت والمتعهد ما زال يقرأ صفراً — فـ(ج-١) لا يقيس RLS بل غيابَ جلسةٍ أو جدولاً فارغاً';
    end if;
    raise notice '✔ (ح-٣) 🔬 سياسة select مفتوحة أُضيفت فقرأ المتعهد % صفاً — فـ(ج-١) حيّ', v_n;

    execute 'drop policy nt_mut_open on public.notifications';
    execute 'drop function if exists public.nt_mut_dismiss(uuid)';
    execute 'drop function if exists public.nt_mut_mark_read(uuid)';

    -- ══ (ط) 🚏 المحطاتُ تبلغ الرسالةَ والصندوق (0144) ══════════════════════
    --
    -- 🔴 **ما يمسكه هذا القسم:** نزلت المحطاتُ في `0140` وعرضتها بطاقةُ
    -- البورتال، **وبقيت حمولةُ الإشعار بلا `stops`** — فيصل المتعهدَ «من ← إلى»
    -- عن رحلةٍ بمحطتين، **ويقبل على ذلك**. والشاهدُ على `portal_offers()` وحده
    -- (النمط ٦ج في `LESSONS.md`) كان يبقى أخضرَ والضررُ واقع، لأن القرار يُتّخذ
    -- على الرسالة لا على الشاشة.
    --
    -- ولذلك يقيس القسمُ الطبقاتِ الثلاث: **الحمولة** ⇐ **إسقاط الصندوق** ⇐
    -- **السلوك عند المتعهد نفسه بجلسته هو**.

    insert into public.bookings (reference, public_token, status, class_slug, class_title,
                                 total, currency, plan, amount_due, amount_remaining,
                                 customer_name, customer_phone, trip)
    values ('TR-NT0144A', repeat('s', 48), 'under_review', 'nt-sedan', 'NT_TESTS فئة',
            2400, 'EGP', 'full', 2400, 0, 'NT_TESTS عميل محطات', '01000000202',
            jsonb_build_object(
              'originLabel', 'NT_TESTS منطلق',
              'destLabel',   'NT_TESTS وجهة',
              'distanceKm',  120,
              'passengers',  3,
              'pickupAt',    (now() + interval '5 days')::text,
              'stops', jsonb_build_array(
                jsonb_build_object('label', 'NT_TESTS محطة أولى', 'lat', 29.96, 'lng', 31.26),
                jsonb_build_object('label', 'NT_TESTS محطة ثانية', 'lat', 29.99, 'lng', 31.30))))
    returning id, trip into v_bk, v_trip;

    insert into public.bookings (reference, public_token, status, class_slug, class_title,
                                 total, currency, plan, amount_due, amount_remaining,
                                 customer_name, customer_phone, trip)
    values ('TR-NT0144B', repeat('t', 48), 'under_review', 'nt-sedan', 'NT_TESTS فئة',
            2400, 'EGP', 'full', 2400, 0, 'NT_TESTS عميل مباشر', '01000000203',
            jsonb_build_object(
              'originLabel', 'NT_TESTS منطلق',
              'destLabel',   'NT_TESTS وجهة',
              'distanceKm',  120,
              'passengers',  3,
              'pickupAt',    (now() + interval '5 days')::text))
    returning id into v_bk0;

    -- ── (ط-١) حمولةُ العرض: وسمان بترتيبهما، **ولا إحداثية**
    v_pl := public.dispatch_trip_payload(v_bk, true);
    if jsonb_typeof(v_pl -> 'stops') <> 'array' or jsonb_array_length(v_pl -> 'stops') <> 2 then
      raise exception
        '(ط-١) 🔴 حمولةُ العرض بلا محطتين — المتعهد يقرأ «من ← إلى» عن رحلةٍ بمحطتين ويقبل عليها. الفعليّ: %',
        coalesce(v_pl -> 'stops', 'null'::jsonb);
    end if;
    if (v_pl -> 'stops' -> 0) ? 'lat' or (v_pl -> 'stops' -> 0) ? 'lng'
       or (v_pl -> 'stops' -> 1) ? 'lat' or (v_pl -> 'stops' -> 1) ? 'lng' then
      raise exception '(ط-١) 🔒 إحداثيةُ محطةٍ في حمولةِ عرضٍ قبل القبول — نقضٌ لـD-19';
    end if;
    if (v_pl -> 'stops' -> 1 ->> 'label') not like '%محطة ثانية%' then
      raise exception '(ط-١) ترتيبُ المحطات انقلب: الثانيةُ «%»', (v_pl -> 'stops' -> 1 ->> 'label');
    end if;

    -- ── (ط-٢) والحمولةُ التشغيلية كذلك بلا إحداثيات — الثابتُ المعلَن في 0144:
    --         «لا إحداثيةَ محطةٍ تدخل صفَّ إشعارٍ أبداً»
    v_pl := public.dispatch_trip_payload(v_bk, false);
    if jsonb_array_length(v_pl -> 'stops') <> 2
       or (v_pl -> 'stops' -> 0) ? 'lat' then
      raise exception '(ط-٢) 🔒 حمولةُ التشغيل: محطاتٌ ناقصةٌ أو بإحداثيات';
    end if;

    -- ── (ط-٣) وحمولةُ العميل — أربعةُ إشعاراتٍ تصف رحلته، ومنها التذكير
    v_pl := public.customer_notification_payload(v_bk);
    if jsonb_array_length(v_pl -> 'stops') <> 2 then
      raise exception
        '(ط-٣) 🔴 حمولةُ العميل بلا محطات — تذكيرُ ما قبل الموعد يصفُ رحلةً غير التي حجزها';
    end if;

    -- ── (ط-٤) 🔒 التوافقُ الرجعيّ: الرحلةُ المباشرة بحمولةٍ **لم تتغيّر شكلاً**
    if public.dispatch_trip_payload(v_bk0, true) -> 'stops' <> 'null'::jsonb then
      raise exception '(ط-٤) رحلةٌ بلا محطات وحمولتُها تحمل قيمةً في stops: %',
        public.dispatch_trip_payload(v_bk0, true) -> 'stops';
    end if;
    if public.customer_notification_payload(v_bk0) ? 'stops' then
      raise exception '(ط-٤) حمولةُ عميلٍ لرحلةٍ مباشرة اكتسبت مفتاح stops — تغيّرَ شكلُ ما لم يتغيّر';
    end if;

    -- ── (ط-٥) 🔴 صندوقُ البورتال **بجلسة المتعهد نفسه** — لا بقراءة الدالة
    --         (النمط ٦ج: الشاهدُ على الدالة نصفُ شاهد؛ الإسقاطُ هو موضعُ الضرر)
    insert into public.notifications
      (id, event, payload, channels, status, attempts, delivered_at,
       recipient_kind, recipient_id)
    values (v_inb, 'trip_offered', public.dispatch_trip_payload(v_bk, true),
            array['telegram','inbox'], 'sent', 1, now(), 'partner', v_sub);

    perform set_config('request.jwt.claims',
      json_build_object('sub', v_usr, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select i.summary into v_sum from public.portal_inbox(200) i where i.id = v_inb;
    execute 'reset role';
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

    if v_sum is null then
      raise exception '(ط-٥) لم يقرأ المتعهد صفَّه — القياسُ كان سيقيس صندوقاً فارغاً لا إسقاطاً';
    end if;
    if jsonb_typeof(v_sum -> 'stops') <> 'array' or jsonb_array_length(v_sum -> 'stops') <> 2 then
      raise exception
        '(ط-٥) 🔴 القائمةُ البيضاء في portal_inbox تُسقط stops — الصفُّ يحملها والصندوقُ لا يعرضها. الملخّصُ: %',
        v_sum;
    end if;
    if (v_sum -> 'stops' -> 0) ? 'lat' then
      raise exception '(ط-٥) 🔒 إحداثيةٌ عبرت إلى ملخّص الصندوق';
    end if;

    -- ── (ط-٦) 🔬 الطفرةُ التي يمسكها تأكيدُ D-19 أعلاه — وتُشغَّل فعلاً
    --         الخطأُ الواقعيّ الوحيد هنا هو استعمالُ `trip_stops_full` (وهي
    --         موجودةٌ وتغري) بدل `trip_stops_public`. فإن لم تكن الأولى تحمل
    --         إحداثياتٍ فعلاً، فتأكيدُ «لا lat» زينةٌ لا يميّز شيئاً.
    if not ((public.trip_stops_full(v_trip) -> 0) ? 'lat') then
      raise exception
        '(ط-٦) 🔬 trip_stops_full بلا إحداثيات — فتأكيدا D-19 في (ط-١) و(ط-٥) لا يميّزان بديلاً خاطئاً';
    end if;
    if jsonb_array_length(public.trip_stops_public(v_trip)) <> 2 then
      raise exception '(ط-٦) 🔬 trip_stops_public لم تُخرج وسمين — المصدرُ نفسه مكسور';
    end if;

    raise notice '✔ (ط) 🚏 المحطات في حمولة العرض وحمولة التشغيل وحمولة العميل وملخّص صندوق المتعهد — وسومٌ بترتيبها بلا إحداثيات · والرحلةُ المباشرة بحمولةٍ لم تتغيّر · و🔬 البديلُ الخاطئ (trip_stops_full) يحمل إحداثياتٍ فعلاً فالتأكيدُ يميّز';

    raise exception 'NOTIFICATION_TESTS_ROLLBACK';
  exception
    when others then
      if sqlerrm <> 'NOTIFICATION_TESTS_ROLLBACK' then raise; end if;
  end;

  raise notice '✔ القياس الحيّ اكتمل وأُرجعت المعاملة الفرعية';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ي) 🔒 لم يبقَ أثر — وهذه **قاعدة الإنتاج نفسها**
-- ----------------------------------------------------------------------------
do $$
declare
  v_n integer; v_r integer; v_d integer; v_u integer; v_s integer;
  v_bn integer := current_setting('tours.nt_n')::integer;
  v_br integer := current_setting('tours.nt_r')::integer;
  v_bd integer := current_setting('tours.nt_d')::integer;
  v_bu integer := current_setting('tours.nt_u')::integer;
  v_bs integer := current_setting('tours.nt_s')::integer;
begin
  select count(*)::integer,
         count(*) filter (where read_at is not null)::integer,
         count(*) filter (where dismissed_at is not null)::integer
    into v_n, v_r, v_d
  from public.notifications;
  select count(*)::integer into v_u from auth.users;
  select count(*)::integer into v_s from public.subcontractors;

  if v_n <> v_bn then
    raise exception 'تنظيف ناقص: الإشعارات % والأساس % — صفٌّ باقٍ يُرسَل فعلاً في الدورة التالية', v_n, v_bn;
  end if;
  -- 🔴 وحالةُ العرض كما كانت: علامةُ قراءةٍ باقية تُخفي عن المالك إشعاراً حقيقياً،
  --    وعلامةٌ باقية على صفِّ متعهدٍ تُطفئ عرضاً معلّقاً في صندوقه هو
  if v_r <> v_br then
    raise exception 'تنظيف ناقص: المقروء % والأساس % — علامةُ قراءةٍ باقية تُخفي إشعاراً حقيقياً', v_r, v_br;
  end if;
  if v_d <> v_bd then
    raise exception 'تنظيف ناقص: المكنوس % والأساس %', v_d, v_bd;
  end if;
  if v_u <> v_bu then raise exception 'تنظيف ناقص: المستخدمون % والأساس %', v_u, v_bu; end if;
  if v_s <> v_bs then raise exception 'تنظيف ناقص: المتعهدون % والأساس % — متعهدٌ اختباري يدخل حوض بثٍّ حقيقي', v_s, v_bs; end if;

  -- ولا دوالَ طفراتٍ باقية في المخطط
  select count(*)::integer into v_n from pg_proc p
    join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname like 'nt\_mut\_%';
  if v_n <> 0 then raise exception 'تنظيف ناقص: % دالة طفرةٍ باقية في المخطط', v_n; end if;

  -- 🔴 ولا سياسةَ طفرةٍ باقية — سياسةٌ مفتوحة باقية تفتح الجدول للجميع صامتةً
  select count(*)::integer into v_n from pg_policy
   where polrelid = 'public.notifications'::regclass and polname like 'nt\_mut\_%';
  if v_n <> 0 then raise exception '🔴 تنظيف ناقص: % سياسةَ طفرةٍ باقية على notifications', v_n; end if;

  -- والسياستان الأصليتان قائمتان كما كانتا
  select count(*)::integer into v_n from pg_policy
   where polrelid = 'public.notifications'::regclass;
  if v_n <> 2 then
    raise exception '🔴 عدد سياسات notifications % والمتوقع ٢ (select/update بـis_admin)', v_n;
  end if;

  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claims', '', false);

  raise notice 'ALL PASSED — 🔴 «المسح» حالةُ عرضٍ لا حذف (الصف باقٍ و١٢ حقلَ تسليمٍ لم يتغيّر منها حرف، والعدد لم ينقص) · والحارس ops حيّ في الدوالّ الثلاث فلا يُمسّ صندوق متعهدٍ بتعليمٍ ولا بمسح · و«مكنوس» ≠ «مقروء» والاستعادة تُرجعهما · والمتعهد يقرأ صفر صفٍّ من الجدول ولا ينفّذ دالةً والزائر كذلك · وصفر منحِ delete/truncate لدورَي المتصفح · و🔬 ثلاث طفرات بُنيت وشُغّلت (الحذف بدل الكتابة · بلا شرط ops · سياسة select مفتوحة) فأسقطت كلٌّ منها تأكيدها — فالثلاثة أحياء — وصفر أثر';
end;
$$;
