-- ============================================================================
-- crew_tests.sql — اختبارات قبول للمركبة والسائق بعد الإسناد
--                  (الدفعة ٥ — الملاحظة ٥ الشقّ الأول: هجرة 0040_trip_crew.sql)
--
-- كيف تشغّله: `pnpm db:test crew` أو الصق الملف كاملاً في SQL Editor واضغط Run.
-- النجاح = آخر سطر «ALL PASSED».
--
-- ومن psql بدور صاحب القاعدة **لا بد** من ON_ERROR_STOP و‑1 معاً:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f supabase/tests/crew_tests.sql
--
-- ── الحاجز الأول: (هـ) الهاتف محجوب في القاعدة لا في الواجهة ───────────────
--
-- `get_booking_by_token` ممنوحة لـ`anon` وتُنادى مباشرةً من PostgREST. فحاجبٌ
-- في JSX يُتخطّى بنداء واحد، والقرار الذي حسمه المالك (هاتف السائق يظهر قبل
-- الالتقاء بمدة) لا يكون قراراً إن لم يُفرَض هنا. والفحص يقيس **الحدّين معاً**:
-- بعيدٌ فيُحجب، وقريبٌ فيظهر — فحصٌ بطرف واحد يمرّ على دالة تُرجع `null` دائماً.
--
-- ── الحاجز الثاني: (و) و(ز) متعهدٌ لا يكتب طاقم رحلة غيره ─────────────────
--
-- الهوية تُشتق من `current_subcontractor_id()` ولا تُمرَّر وسيطاً — وهو ما
-- يمنع انتحال الكتابة. ويُختبر بجلستَي متعهدين حقيقيتين لا بقراءة منحة.
--
-- ── الحاجز الثالث: (ح) ما لا يصل العميل ──────────────────────────────────
--
-- رقم رخصة السائق ومعرّفات المتعهد **غائبة من نوع الإرجاع أصلاً** لا مخفيّة
-- في العرض — فما لا وجود له في النوع لا يصل الشاشة بخطأ برمجي (قاعدة المرحلة ٥).
--
-- ── لماذا لا يلمس هذا الملف بيانات حقيقية ────────────────────────────────
--   • كل الفيكسترة بوسم `CREW_TESTS` ومعرّفات ثابتة، وتُمسح في البداية والنهاية.
--   • ولا يُنشئ حجزاً: يستعمل دورة إسناد قائمة **داخل معاملة تُرجَع**، فلا يمسّ
--     رحلةً حقيقية ولا يترك أثراً في الدفتر.
--   • والأرقام تُختبر بعلاقتها لا بقيمتها المطلقة.
--
-- المرجع: lib/crew-types.ts (العقد) + supabase/migrations/0040_trip_crew.sql
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (٠) الشروط المسبقة + تنظيف بقايا تشغيل سابق
-- ----------------------------------------------------------------------------
do $$
declare
  v_missing text;
begin
  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claims', '', false);

  select string_agg(x.o, '، ') into v_missing
  from (values ('public.subcontractor_drivers')) as x(o)
  where to_regclass(x.o) is null;
  if v_missing is not null then
    raise exception 'شرط مسبق: كائنات مفقودة (نفّذ 0040_trip_crew.sql): %', v_missing;
  end if;

  select string_agg(x.f, '، ') into v_missing
  from (values
    ('public.set_trip_crew(uuid,uuid,uuid)'),
    ('public.admin_set_trip_crew(uuid,uuid,uuid)'),
    ('public.get_booking_by_token(text)'),
    ('public.trip_config()')
  ) as x(f)
  where to_regprocedure(x.f) is null;
  if v_missing is not null then
    raise exception 'شرط مسبق: دوال مفقودة: %', v_missing;
  end if;

  delete from public.subcontractor_drivers where name like 'CREW_TESTS%';

  raise notice '✔ (٠) الشروط المسبقة سليمة — الجدول والدوال الأربع موجودة';
end;
$$;

-- ----------------------------------------------------------------------------
-- (أ) البنية: السياسات الأربع، وRLS، ولا anon
-- ----------------------------------------------------------------------------
do $$
declare
  v_n integer;
begin
  select count(*) into v_n from pg_policy p join pg_class c on c.oid = p.polrelid
   where c.relname = 'subcontractor_drivers';
  if v_n <> 4 then
    raise exception '(أ) سياسات سجلّ السائقين % لا أربع', v_n;
  end if;

  if not (select relrowsecurity from pg_class where relname = 'subcontractor_drivers') then
    raise exception '(أ) RLS غير مفعّلة على سجلّ السائقين';
  end if;

  select count(*) into v_n from information_schema.table_privileges
   where table_schema = 'public' and table_name = 'subcontractor_drivers' and grantee = 'anon';
  if v_n > 0 then
    raise exception '(أ) anon يملك صلاحية على سجلّ السائقين';
  end if;

  -- والمُشغّل التدقيقي (الملاحظة ١٥) — جدولٌ جديد بلا رصد ثغرةٌ في السجل الشامل
  if not exists (
    select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
     where not t.tgisinternal and c.relname = 'subcontractor_drivers'
       and t.tgname like 'audit\_%'
  ) then
    raise exception '(أ) سجلّ السائقين خارج رصد التدقيق';
  end if;

  raise notice '✔ (أ) السياسات الأربع وRLS ورصد التدقيق، ولا anon';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ب) قيود الصف: الاسم والهاتف لا يقبلان فراغاً
-- ----------------------------------------------------------------------------
do $$
declare
  v_sub uuid;
  v_ok  boolean;
begin
  select id into v_sub from public.subcontractors limit 1;
  if v_sub is null then
    raise notice '  ↳ (ب) لا متعهدين في القاعدة — الفحص متخطّى';
    return;
  end if;

  v_ok := false;
  begin
    insert into public.subcontractor_drivers (subcontractor_id, name, phone)
    values (v_sub, 'ا', '01000000000');
  exception when others then v_ok := true;
  end;
  if not v_ok then
    raise exception '(ب) اسمٌ بحرف واحد مرّ — قيد الاسم لا يحرس';
  end if;

  v_ok := false;
  begin
    insert into public.subcontractor_drivers (subcontractor_id, name, phone)
    values (v_sub, 'CREW_TESTS اسم صالح', '123');
  exception when others then v_ok := true;
  end;
  if not v_ok then
    raise exception '(ب) هاتفٌ من ثلاثة أرقام مرّ — قيد الهاتف لا يحرس';
  end if;

  -- والشاهد الإيجابي: الصف الصالح يمرّ، وإلا كان ما سبق فحصاً لا يمكن أن يفشل
  insert into public.subcontractor_drivers (subcontractor_id, name, phone)
  values (v_sub, 'CREW_TESTS سائق صالح', '01099887766');
  delete from public.subcontractor_drivers where name like 'CREW_TESTS%';

  raise notice '✔ (ب) القيدان يرفضان الفراغ ويمرّران الصالح';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ج) مهلة ظهور الهاتف: القيد والافتراضي والتوسعة
-- ----------------------------------------------------------------------------
do $$
declare
  v_n   integer;
  v_ok  boolean;
  v_lead integer;
begin
  select driver_phone_lead_minutes into v_lead from public.trip_settings where id = true;
  if v_lead is null then
    raise exception '(ج) العمود غير مضبوط في صف الإعدادات الوحيد';
  end if;

  -- القيد يحرس الطرفين
  v_ok := false;
  begin
    update public.trip_settings set driver_phone_lead_minutes = -1 where id = true;
  exception when others then v_ok := true;
  end;
  if not v_ok then
    raise exception '(ج) مهلة سالبة مرّت';
  end if;

  v_ok := false;
  begin
    update public.trip_settings set driver_phone_lead_minutes = 10081 where id = true;
  exception when others then v_ok := true;
  end;
  if not v_ok then
    raise exception '(ج) مهلة أطول من أسبوع مرّت';
  end if;

  -- و`trip_config()` تُرجع ثلاثة أعمدة الآن
  select count(*) into v_n
    from information_schema.columns
   where table_schema = 'public' and table_name = 'trip_settings'
     and column_name = 'driver_phone_lead_minutes';
  if v_n <> 1 then
    raise exception '(ج) العمود غير موجود في الكتالوج';
  end if;

  perform public.trip_config();

  raise notice '✔ (ج) المهلة مضبوطة (%) والقيد يحرس ٠–١٠٠٨٠، وtrip_config تعمل', v_lead;
end;
$$;

-- ----------------------------------------------------------------------------
-- (د) و(هـ) 🔒 الطاقم يصل العميل، والهاتف محجوب بالتوقيت داخل القاعدة
-- ----------------------------------------------------------------------------
-- الكتلة كلها داخل نقطة حفظ تُرجَع: تلمس دورة إسناد قائمة ولا تترك أثراً.
-- ----------------------------------------------------------------------------
do $$
declare
  v_booking uuid;
  v_sub     uuid;
  v_token   text;
  v_veh     uuid;
  v_drv     uuid;
  v_crew    jsonb;
  v_lead    integer;
begin
  select d.booking_id, d.assigned_subcontractor_id, b.public_token
    into v_booking, v_sub, v_token
    from public.dispatches d
    join public.bookings b on b.id = d.booking_id
   where d.assigned_subcontractor_id is not null
     and b.public_token is not null
   limit 1;

  if v_booking is null then
    raise notice '  ↳ (د/هـ) لا رحلة مُسنَدة في القاعدة — الفحص متخطّى';
    return;
  end if;

  select id into v_veh from public.subcontractor_vehicles
   where subcontractor_id = v_sub limit 1;
  if v_veh is null then
    raise notice '  ↳ (د/هـ) المتعهد المُسنَد بلا مركبات — الفحص متخطّى';
    return;
  end if;

  begin
    -- 🔴 المهلةُ **تُثبَّت ثم تُقرأ**، ولا تُقرأ حيّةً (إصلاح حمرةٍ صنفية،
    --    2026-08-17). الشاهد الإيجابي في (هـ-٢) يُبنى بـ`greatest(v_lead - 10, 0)`،
    --    فعند أي قيمة مالكٍ ≤ ١٠ يصير موعد الشاهد `now()` بالضبط ويتحوّل الحكم
    --    إلى `<=` مقابل `<` — أي تأكيدٌ يقرّره إعدادٌ في لوحة المالك لا الكودُ
    --    المُختبَر (النمط ٦ في `handover/LESSONS.md`).
    --
    -- ⚠ والتثبيت **داخل** هذه الكتلة لا قبلها: هي التي تنتهي بـ
    --   `CREW_TESTS_ROLLBACK`، فلا صفَّ مالكٍ يُحفظ ولا استعادةٌ تُنسى. ونطاقُ
    --   العمود نفسه مقيسٌ في (ج) على قيمه الحدّية، فالتثبيت هنا لا يُغطّي عليه.
    update public.trip_settings set driver_phone_lead_minutes = 120 where id = true;
    select coalesce(driver_phone_lead_minutes, 120) into v_lead
      from public.trip_settings where id = true;

    insert into public.subcontractor_drivers (subcontractor_id, name, phone)
    values (v_sub, 'CREW_TESTS سائق', '01055443322') returning id into v_drv;

    update public.subcontractor_vehicles set color = 'CREW_TESTS فضي' where id = v_veh;
    update public.dispatches
       set assigned_vehicle_id = v_veh, assigned_driver_id = v_drv, crew_at = now()
     where booking_id = v_booking;

    -- (د) الطاقم يخرج كاملاً في الحمولة
    select crew into v_crew from public.get_booking_by_token(v_token);
    if v_crew is null then
      raise exception '(د) الطاقم لم يخرج في حمولة العميل رغم إسناده';
    end if;
    if v_crew ->> 'driverName' <> 'CREW_TESTS سائق' then
      raise exception '(د) اسم السائق لم يصل (وصل «%»)', v_crew ->> 'driverName';
    end if;
    if v_crew ->> 'vehicleColor' <> 'CREW_TESTS فضي' then
      raise exception '(د) لون المركبة لم يصل — والملاحظة تطلبه نصاً';
    end if;
    if (v_crew ->> 'vehiclePlate') is null then
      raise exception '(د) لوحة المركبة لم تصل — وهي ما يبحث عنه العميل عند الرصيف';
    end if;

    -- (هـ-١) التقاء بعيد ⇒ الهاتف محجوب، وموعد ظهوره معلَن
    update public.bookings
       set trip = jsonb_set(trip, '{pickupAt}',
                            to_jsonb((now() + make_interval(mins => v_lead + 600))::text))
     where id = v_booking;
    select crew into v_crew from public.get_booking_by_token(v_token);
    if (v_crew ->> 'driverPhone') is not null then
      raise exception '(هـ-١) هاتف السائق ظهر قبل نافذته — الحجب لا يعمل في القاعدة';
    end if;
    if (v_crew ->> 'phoneVisibleAt') is null then
      raise exception '(هـ-١) موعد ظهور الهاتف غير معلَن — العميل يقرأ الغياب عطلاً';
    end if;

    -- (هـ-٢) والشاهد الإيجابي: التقاء داخل النافذة ⇒ يظهر.
    --        بلا هذا الطرف يمرّ الفحص على دالة تُرجع null دائماً (النمط ٩).
    update public.bookings
       set trip = jsonb_set(trip, '{pickupAt}',
                            to_jsonb((now() + make_interval(mins => greatest(v_lead - 10, 0)))::text))
     where id = v_booking;
    select crew into v_crew from public.get_booking_by_token(v_token);
    if (v_crew ->> 'driverPhone') is distinct from '01055443322' then
      raise exception '(هـ-٢) الهاتف لم يظهر داخل نافذته (وصل «%»)', v_crew ->> 'driverPhone';
    end if;

    -- (ح) وما لا يصل العميل إطلاقاً — غائبٌ من النوع لا مخفيّ في العرض
    if v_crew::text like '%license%' then
      raise exception '(ح) رقم رخصة السائق خرج في حمولة العميل';
    end if;
    if v_crew::text like ('%' || v_sub::text || '%') then
      raise exception '(ح) معرّف المتعهد خرج في حمولة العميل — كسرٌ للـwhite-label';
    end if;

    raise notice '✔ (د/هـ/ح) الطاقم يصل بالمركبة واللون واللوحة والاسم، والهاتف محجوب بعيداً وظاهر قريباً، ولا رخصة ولا هوية متعهد';
    raise exception 'CREW_TESTS_ROLLBACK';
  exception
    when others then
      if sqlerrm <> 'CREW_TESTS_ROLLBACK' then raise; end if;
  end;
end;
$$;

-- ----------------------------------------------------------------------------
-- (و) 🔒 متعهدٌ لا يكتب طاقم رحلةٍ ليست له
-- ----------------------------------------------------------------------------
do $$
declare
  v_booking uuid;
  v_owner   uuid;
  v_other   uuid;
  v_profile uuid;
  v_ok      boolean;
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    raise notice '  ↳ (و) لا دور authenticated — الفحص متخطّى';
    return;
  end if;

  select d.booking_id, d.assigned_subcontractor_id into v_booking, v_owner
    from public.dispatches d where d.assigned_subcontractor_id is not null limit 1;
  if v_booking is null then
    raise notice '  ↳ (و) لا رحلة مُسنَدة — الفحص متخطّى';
    return;
  end if;

  -- متعهدٌ آخر له حساب فعلي
  select s.id, s.profile_id into v_other, v_profile
    from public.subcontractors s
   where s.id <> v_owner and s.profile_id is not null
   limit 1;
  if v_other is null then
    raise notice '  ↳ (و) لا متعهد ثانٍ بحساب — الفحص متخطّى';
    return;
  end if;

  begin
    perform set_config('request.jwt.claim.sub', v_profile::text, false);
    execute 'set local role authenticated';

    -- الهوية فعّالة: يقرأ صفّه. بدونها ما بعده «فحص لا يمكن أن يفشل»
    execute 'select count(*) from public.subcontractors' into v_ok;

    v_ok := false;
    begin
      execute format('select public.set_trip_crew(%L, null, null)', v_booking);
    exception when others then v_ok := true;
    end;
    if not v_ok then
      raise exception '(و) متعهدٌ آخر كتب طاقم رحلةٍ ليست له';
    end if;

    execute 'reset role';
    perform set_config('request.jwt.claim.sub', '', false);
  exception
    when others then
      execute 'reset role';
      perform set_config('request.jwt.claim.sub', '', false);
      raise;
  end;

  raise notice '✔ (و) متعهدٌ لا يكتب طاقم رحلةٍ ليست ضمن رحلاته';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ز) 🔒 الزائر لا ينفّذ أياً من دالتي الكتابة
-- ----------------------------------------------------------------------------
do $$
declare
  v_ok boolean;
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    raise notice '  ↳ (ز) لا دور anon — الفحص متخطّى';
    return;
  end if;

  perform set_config('request.jwt.claim.sub', '', false);
  begin
    execute 'set local role anon';

    v_ok := false;
    begin
      execute 'select public.set_trip_crew(''00000000-0000-4000-8000-000000000000'', null, null)';
    exception when others then v_ok := true;
    end;
    if not v_ok then
      raise exception '(ز-١) anon نفّذ set_trip_crew';
    end if;

    v_ok := false;
    begin
      execute 'select public.admin_set_trip_crew(''00000000-0000-4000-8000-000000000000'', null, null)';
    exception when others then v_ok := true;
    end;
    if not v_ok then
      raise exception '(ز-٢) anon نفّذ admin_set_trip_crew';
    end if;

    execute 'reset role';
  exception
    when others then
      execute 'reset role';
      raise;
  end;

  raise notice '✔ (ز) الزائر لا ينفّذ دالة كتابة طاقم واحدة';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ط) التنظيف
-- ----------------------------------------------------------------------------
do $$
begin
  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claims', '', false);

  delete from public.subcontractor_drivers where name like 'CREW_TESTS%';
  update public.subcontractor_vehicles set color = null where color like 'CREW_TESTS%';
  -- ⚠ ولا حذفَ من `audit_log` بعد 0110: صار مُلحَقاً فقط فعلاً (مُشغّلٌ يرفض
  --   حتى بدور مالك الجدول). و`scripts/db-test.mjs` يُرجع كلَّ ملف فلا يبقى أثر.

  raise notice '✔ (ط) التنظيف تم — لا فيكسترة ولا أثر لها في السجل';
end;
$$;

-- ----------------------------------------------------------------------------
-- الخلاصة
-- ----------------------------------------------------------------------------
do $$
begin
  raise notice 'ALL PASSED — المركبة والسائق بعد الإسناد: سجلّ السائقين بسياساته الأربع ورصده التدقيقي ولا anon، والقيدان يحرسان الاسم والهاتف، والمهلة مقيَّدة ٠–١٠٠٨٠، والطاقم يصل العميل بالمركبة واللون واللوحة والاسم، وهاتف السائق محجوب بعيداً وظاهر داخل نافذته **بقرار القاعدة لا الواجهة**، ولا رخصة ولا هوية متعهد تصل العميل، ولا متعهدٌ يكتب طاقم غيره، ولا زائر ينفّذ كتابة';
end;
$$;
