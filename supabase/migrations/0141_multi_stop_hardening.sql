-- ============================================================================
-- 0141_multi_stop_hardening.sql — حصيلتا مراجعةٍ عدائية على 0140
--
-- ملفُّ تصليبٍ لا ميزة. لا يمسّ تسعيراً ولا تغطيةً ولا بثّاً، ولا يغيّر سلوكَ
-- أيّ حجزٍ قائمٍ ولا أيّ إعدادٍ حاليّ للمالك (السقفُ يبقى ٣ كما بُذر في 0140).
--
-- ── (١) 🔴 دالةُ مُشغّلٍ `security definer` وُلدت بمنحة `PUBLIC` ────────────
--
-- `bookings_guard_trip_stops()` أُنشئت في 0140 بـ`create or replace` **بلا كتلة
-- revoke**، فورثت منحةَ Postgres الافتراضية `EXECUTE` لـ`PUBLIC` — أي `anon`
-- و`authenticated` وكلَّ متعهد. مقيسٌ على القاعدة الحيّة قبل هذا الملف:
--
--     proacl = {=X/postgres, postgres=X/postgres, anon=X/postgres,
--               authenticated=X/postgres, service_role=X/postgres}
--
-- وهي **نفسُ الحادثة** التي وقعت في 2026-08-18 مع `trip_completion_gate`
-- (‏`STANDING-ORDERS §٢د`)، ونفسُ ما تحذّر منه `CONVENTIONS §٦`: الإنشاء يعيد
-- المنحةَ الافتراضية، والسطرُ الغائب يفتح ما لم يُقصَد فتحُه.
--
-- ⚠ **وحدُّ الخطورة يُقال كما قِيس، لا أكبر**: الأثرُ اليوم **صفر عملياً** —
--   Postgres يرفض النداءَ المباشر لأي دالة مُشغّل («trigger functions can only
--   be called as triggers»، ‏0A000)، وقد قِيس ذلك بدور `authenticated` قبل
--   السحب. فهذا **تصليبٌ بنيويّ** لا إغلاقُ ثغرةٍ مستغَلّة: المنحةُ الزائدة
--   تُسحب لأن وجودَها بلا سببٍ هو ما يجعل المرةَ القادمة مختلفة، لا لأنها
--   تُستغَلّ الآن.
--
-- 🔒 **والسحبُ لا يُعطّل الحارس**: المُشغّل يُنفَّذ بصلاحيات مالك الجدول ولا
--    يُفحص `EXECUTE` عند إطلاقه. مقيسٌ حياً بعد السحب داخل معاملةٍ مُرجَعة:
--    إدراجٌ يتجاوز السقف ⇒ «عدد المحطات (4) يتجاوز الحدّ المسموح (3)»،
--    و`update ... set trip = trip` بدور `authenticated` ⇒ بلا خطأ صلاحيات.
--
-- ── (٢) إعدادُ مالكٍ نصفُ مداه يرفضه المسار العام ──────────────────────────
--
-- 0140 بذرت `trip_settings.max_trip_stops` بـ`check between 0 and 10`، بينما
-- الحدُّ الصلب في `lib/booking-types.ts` هو `MAX_TRIP_STOPS = 5` ويفرضه
-- `parseStops` في `app/api/quote/route.ts` و`app/api/booking/route.ts`
-- **قبل** أن تصل المحطات إلى القاعدة أصلاً.
--
-- فمالكٌ يرفع السقف إلى ٦ من شاشة الإعدادات يحصل على حالةٍ متناقضة، مقيسةٍ
-- بالقراءة على المسارين: الحاسبةُ تعرض صفَّ محطةٍ سادساً (سقفُها من القاعدة)،
-- ثم يردّ `/api/quote` بـ400 ورسالةٍ تقول «وحتى ٥ محطات وسطى». وهو النمط ٨ في
-- `LESSONS.md` (مصدران لرقمٍ واحد) في أسوأ شكلٍ له: **إعدادٌ نصفُ مداه مكسور**.
--
-- ⇒ يُضيَّق القيدُ إلى `between 0 and 5` فيصير مدى الإعداد كلُّه صالحاً.
--
-- ⚠ **وهذا حدٌّ هندسيّ لا قرارُ منتج**: الافتراضُ يبقى ٣ (وهو الرقم الذي يملكه
--   المالك)، والقيمةُ الحيّة اليوم ٣ فلا صفَّ يتغيّر ولا سلوكَ يتحرّك. و٥ ليست
--   رقماً جديداً بل **الحدُّ القائم سلفاً** في TypeScript.
--
-- 📌 **والحلُّ الجذريّ يبقى مفتوحاً بقرار المالك**: أن تقرأ الطبقةُ العليا
--    `max_trip_stops()` بدل ثابتٍ محفور — كما فعلت `components/booking/stops-cap.ts`
--    للحاسبة. وحينها يُوسَّع هذا القيد بهجرةٍ واحدة. مسجَّلٌ في تقرير المراجعة.
--
-- المرجع: 0140 · D-04 · D-20 · `CONVENTIONS §٦` · `LESSONS` النمطان ٧ و٨.
-- الاختبار: supabase/tests/multi_stop_tests.sql — القسم (ي-٤) وُسِّع ليشمل
--           دالةَ المُشغّل، والقسم (ي-٥) يحرس مدى القيد.
-- آمنة لإعادة التنفيذ بالكامل.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (١) سحبُ منحة PUBLIC عن دالة المُشغّل
--
-- ⚠ ولا `grant` لأحد: المُشغّل لا يحتاج منحةً ليعمل، ومن ينادي الدالةَ مباشرةً
--   يُرفض بـ0A000 مهما كانت صلاحيته. فالأقلُّ صلاحية هنا هو **لا أحد**.
-- ----------------------------------------------------------------------------
revoke all on function public.bookings_guard_trip_stops()
  from public, anon, authenticated;

comment on function public.bookings_guard_trip_stops() is
  'يفرض سقفَ المحطات المقروء من trip_settings.max_trip_stops على كل كتابةٍ في bookings.trip. في مُشغّل لا في check لأن الأخير لا يقرأ جدولاً (نفس حدّ 0075). والشكلُ ليس هنا بل في القيد bookings_trip_stops_shape_chk — حارسان لا يتظالّان، فلكلٍّ طفرتُه. ومنحُ EXECUTE مسحوبٌ من الجميع منذ 0141: المُشغّل يعمل بصلاحيات مالك الجدول، ودالةُ مُشغّلٍ لا تُنادى مباشرةً بحال.';

-- ----------------------------------------------------------------------------
-- (٢) تضييقُ مدى السقف إلى ما يقبله المسار العام فعلاً
--
-- ⚠ يُسبق بتقليمٍ دفاعيّ: لو كان صفٌّ قائم قد رُفع فوق ٥ قبل هذه الهجرة لَفشل
--   `alter table` وتوقفت الترحيلة. والتقليمُ `least(..., 5)` لا يمسّ القيمة
--   الحالية (‏٣) ولا أيَّ قيمةٍ مشروعة في المدى الجديد.
-- ----------------------------------------------------------------------------
update public.trip_settings
   set max_trip_stops = least(max_trip_stops, 5)
 where max_trip_stops > 5;

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.trip_settings'::regclass
      and conname  = 'trip_settings_max_trip_stops_chk'
  ) then
    alter table public.trip_settings
      drop constraint trip_settings_max_trip_stops_chk;
  end if;

  alter table public.trip_settings
    add constraint trip_settings_max_trip_stops_chk
    check (max_trip_stops between 0 and 5);
end;
$$;

comment on column public.trip_settings.max_trip_stops is
  'أقصى عددٍ من المحطات الوسطى في الرحلة الواحدة (‏0140). الافتراض ٣: ما فوقه جولةٌ أو تأجيرٌ بالساعة — نموذج تسعيرٍ آخر ينتظر قرار المالك، لا امتداد للقائم. وصفرٌ يعني إطفاء الميزة: كلُّ حجزٍ بمحطةٍ يُرفض. والسقفُ الأعلى ٥ منذ 0141 لأنه الحدُّ الصلب في MAX_TRIP_STOPS (‏lib/booking-types.ts) الذي يفرضه parseStops في /api/quote و/api/booking قبل أن تصل المحطات إلى القاعدة — فما فوق ٥ إعدادٌ يرفضه المسار العام. يقرؤه max_trip_stops() ويفرضه المُشغّل bookings_guard_trip_stops.';

-- ----------------------------------------------------------------------------
-- (٣) الفحوص الذاتية
-- ----------------------------------------------------------------------------

-- (٣-أ) لا منحةَ PUBLIC ولا دورَ متصفحٍ على دالة المُشغّل
do $$
declare v_acl text;
begin
  select coalesce(array_to_string(p.proacl::text[], ' '), '(المالك وحده)')
    into v_acl
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'bookings_guard_trip_stops';

  if has_function_privilege('anon', 'public.bookings_guard_trip_stops()', 'execute')
     or has_function_privilege('authenticated', 'public.bookings_guard_trip_stops()', 'execute') then
    raise exception
      '0141 (٣-أ): 🔴 دالةُ المُشغّل ما زالت متاحةً لدورِ متصفّح — proacl = %', v_acl;
  end if;
end;
$$;

-- (٣-ب) والحارسُ ما زال حيّاً بعد السحب — يُقاس **سلوكاً** لا بوجود المُشغّل
--
-- 🔴 هذا هو التوكيد الحامل: سحبُ منحةٍ لا يُثبت أنه لم يُعطّل شيئاً إلا بأن
--    يُجرَّب المنعُ نفسُه. والإدراجُ يقع في معاملةٍ فرعية تُرجَع دائماً، فلا صفَّ
--    يبقى ولا رقمَ يتحرك في جداول المالك.
do $$
declare
  v_max    integer := public.max_trip_stops();
  v_hint   text;
  v_state  text := 'قُبل';
  v_class  text;
begin
  select vc.slug into v_class from public.vehicle_classes vc where vc.active order by vc.capacity limit 1;
  if v_class is null then
    raise notice '0141 (٣-ب): لا فئةَ نشطة — تُخطّى تجربةُ المنع';
    return;
  end if;

  begin
    insert into public.bookings
      (status, class_slug, class_title, total, currency, plan, amount_due, amount_remaining,
       customer_name, customer_phone, trip, price_source)
    values ('pending_payment', v_class, 'فحص 0141', 100, 'EGP', 'full', 100, 0,
            'MIGRATION_0141_PROBE', '01000000141',
            jsonb_build_object(
              'originLabel', 'أ', 'originLat', 28.5, 'originLng', 29.5,
              'destLabel',   'ب', 'destLat',   27.5, 'destLng',   30.5,
              'distanceKm',  372,
              'stops', (select jsonb_agg(jsonb_build_object(
                                 'label', 'م' || g, 'lat', 28.0, 'lng', 31.0 + g * 0.01))
                          from generate_series(1, v_max + 1) g)),
            'tariff');
    raise exception 'M0141_PROBE_FAILED_OPEN';
  exception
    when others then
      if sqlerrm = 'M0141_PROBE_FAILED_OPEN' then
        raise exception
          '0141 (٣-ب): 🔴 بعد سحب المنحة مرّ إدراجٌ يتجاوز السقف (% > %) — السحبُ عطّل الحارس',
          v_max + 1, v_max;
      end if;
      v_state := 'رُفض';
      get stacked diagnostics v_hint = pg_exception_hint;
  end;

  if v_hint is distinct from 'stops-too-many' then
    raise exception
      '0141 (٣-ب): المنعُ وقع بالرمز «%» لا «stops-too-many» — ليس المُشغّلُ من رفض',
      coalesce(v_hint, 'بلا رمز');
  end if;
end;
$$;

-- (٣-ج) مدى القيد صار ٠…٥ — يُقاس سلوكاً: ٥ تُقبل و٦ تُرفض
--
-- 🔒 والتجربةُ كلُّها داخل **معاملةٍ فرعية تُرجَع دائماً**، لا «تُعاد القيمة
--    بعدها»: على `trip_settings` مُشغّلا `log_audit` و`touch_updated_at`، فإعادةُ
--    الرقم وحدَه كانت ستترك صفَّي تدقيقٍ و`updated_at` متحرّكاً في بيانات المالك.
--    والمتغيّراتُ المحلية تنجو من الإرجاع، فالتوكيداتُ بعده تقرأ ما قِيس.
do $$
declare
  v_saved integer;
  v_ok6   boolean := false;
  v_ok5   boolean := false;
begin
  select t.max_trip_stops into v_saved from public.trip_settings t where t.id limit 1;
  if v_saved is null then
    raise notice '0141 (٣-ج): لا صفَّ trip_settings — يُتخطّى';
    return;
  end if;

  begin
    begin
      update public.trip_settings set max_trip_stops = 5 where id;
      v_ok5 := true;
    exception when check_violation then
      v_ok5 := false;
    end;

    begin
      update public.trip_settings set max_trip_stops = 6 where id;
      v_ok6 := true;
    exception when check_violation then
      v_ok6 := false;
    end;

    raise exception 'M0141_PROBE_ROLLBACK';
  exception when others then
    if sqlerrm <> 'M0141_PROBE_ROLLBACK' then raise; end if;
  end;

  if not v_ok5 then
    raise exception '0141 (٣-ج): القيدُ يرفض ٥ — وهي الحدُّ الذي يقبله المسار العام';
  end if;
  if v_ok6 then
    raise exception '0141 (٣-ج): القيدُ ما زال يقبل ٦ — إعدادٌ يرفضه /api/quote بـ400';
  end if;

  if (select t.max_trip_stops from public.trip_settings t where t.id limit 1) is distinct from v_saved then
    raise exception '0141 (٣-ج): 🔴 لم تُعَد قيمةُ المالك الأصلية (%) بعد التجربة', v_saved;
  end if;
end;
$$;

-- (٣-د) ولم يُمسّ شيءٌ من دوالّ 0140 — بصمةُ الأربع كما هي
do $$
declare v_bad text := '';
begin
  -- الشكل: هذه الهجرة لا تُعيد إنشاء أيٍّ منها، والفحصُ يمنع من «يُصلح» فيها غداً
  if to_regprocedure(
       'public.quote_price(numeric,integer,boolean,numeric,numeric,numeric,numeric,numeric,integer,jsonb)'
     ) is null
  then v_bad := v_bad || 'quote_price، '; end if;

  if not has_function_privilege('anon',
       'public.quote_public(numeric,integer,boolean,numeric,numeric,numeric,numeric,numeric,text,integer,jsonb,jsonb)',
       'execute')
  then v_bad := v_bad || 'quote_public/anon، '; end if;

  if not has_function_privilege('authenticated', 'public.trip_stops_reject_reason(jsonb)', 'execute')
     or not has_function_privilege('authenticated', 'public.point_in_service_area(numeric,numeric)', 'execute')
  then v_bad := v_bad || 'دالّتا القيد، '; end if;

  if v_bad <> '' then
    raise exception '0141 (٣-د): 🔴 عقدُ 0140 اختلّ — %', rtrim(v_bad, '، ');
  end if;
end;
$$;
