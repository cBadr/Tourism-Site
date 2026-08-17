-- ============================================================================
-- timezone_tests.sql — المنطقة الزمنية إعدادُ مالك (هجرة 0075)
--
-- كيف تشغّله:
--   node scripts/db-test.mjs timezone
-- النجاح = آخر سطر في الرسائل «ALL PASSED». أي فشل exception عربية تحمل اسم
-- التأكيد والقيمة المتوقعة والفعلية.
--
-- ⚠⚠ لماذا كل كتلة تلمس الإعداد تتراجع عن نفسها ⚠⚠
-- الملف يُرسَل كاملاً كاستعلام واحد ⇒ معاملة واحدة على القاعدة **الحيّة**،
-- و`trip_settings.time_zone` مفتاحٌ **عالمي**: تغييرُه يغيّر كل تاريخٍ يُعرض
-- وكل تجميعٍ يومي في القاعدة. فكل كتلة تلمسه تنتهي بـ
-- `raise exception 'ROLLBACK_MARKER'` — وكتلة الاستثناء في plpgsql نقطة حفظ
-- ضمنية، فيُلغى كل ما بداخلها. وتأكيدات الاختبار ترمي هي الأخرى، ورميها
-- **يمرّ** (ليس هو العلامة) فيصل الفشل إلى المشغّل. والقسم (ي) يقارن الإعداد
-- بلقطته الأولى فيثبت أن القاعدة عادت كما كانت.
--
-- ما يغطيه الملف:
--   (أ) البنية: العمود وقيده الشكلي والمُشغّل، والافتراضي `Africa/Cairo`.
--   (ب) الحارس في القاعدة: اسمٌ لا وجود له يُرفض بتلميح `invalid-timezone`،
--       ومنطقةٌ حقيقية تُقبل (شاهد إيجابي: الرفض ليس لسببٍ آخر).
--   (ج) 🔴 **الماضي لا يُعاد تفسيره** — حجزٌ حقيقي: اللحظة المخزَّنة لا تتحرّك
--       بتغيير الإعداد، والمعروض ينزاح بفارق المنطقتين **بالضبط**.
--   (د) 🔴 **الإعداد هو الذي يقود التحويل** — `derive_waiting_hours` تُعطي
--       نتيجتين مختلفتين لِـ**نفس** اللحظتين بتغيير المنطقة وحدها.
--   (هـ) مصدرٌ واحد: صفر نصٍّ حرفيّ `'Africa/Cairo'` في أي دالة أو عرض.
--   (و) `site_time_zone()` بلا وسيط، وحيدةٌ بالاسم، وممنوحة للأدوار الثلاثة.
--   (ز) العروض الخمسة بقيت `security_invoker` بعد إعادة إنشائها.
--   (ح) 🧬 **طفرة** — تجاهُل الإعداد داخل `site_time_zone()` يجعل تأكيد (د)
--       يفشل، فيثبت أن (د) يقيس الإعداد لا شيئاً آخر.
--   (ي) التنظيف: إعدادات المالك كما كانت حرفاً.
--
-- المرجع: supabase/migrations/0075_site_time_zone.sql
--         · supabase/migrations/0031_trip_extras.sql (‏derive_waiting_hours · D-57)
--         · lib/site-timezone.ts (الطرف المقابل في TypeScript)
--         · lib/booking-types.ts (‏TripSettings.timeZone)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (٠) الشروط المسبقة + لقطة الإعداد + فئة الاختبار
-- ----------------------------------------------------------------------------
do $$
declare
  v_missing text;
begin
  select string_agg(x.sig, '، ')
    into v_missing
  from (values
    ('public.site_time_zone()'),
    ('public.derive_waiting_hours(timestamptz,timestamptz)'),
    ('public.trip_settings_time_zone_guard()')
  ) as x(sig)
  where to_regprocedure(x.sig) is null;

  if v_missing is not null then
    raise exception 'شرط مسبق: دوال مفقودة (نفّذ 0075_site_time_zone.sql أولاً): %', v_missing;
  end if;

  if to_regclass('public.trip_settings') is null then
    raise exception 'شرط مسبق: جدول public.trip_settings مفقود (0027)';
  end if;

  -- منطقتا الاختبار يجب أن تعرفهما هذه النسخة من Postgres، وإلا فالفحوص كذبة
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = 'Africa/Cairo')
     or not exists (select 1 from pg_catalog.pg_timezone_names where name = 'America/New_York')
  then
    raise exception 'شرط مسبق: قاعدة المناطق لا تعرف Africa/Cairo أو America/New_York';
  end if;

  -- 🔴 لقطة الإعداد قبل أي عبث — بها وحدها يُثبَت في (ي) أن القاعدة عادت كما كانت
  perform set_config(
    'tours.tz_before',
    (select t.time_zone || '/' || t.unpaid_cancel_enabled::text
            || '/' || t.min_lead_minutes::text
       from public.trip_settings t),
    false
  );

  -- فئة الاختبار تُستخرج من الأسطول لا تُكتب بالاسم (تُستعمل في ج)
  perform set_config(
    'tours.tz_class',
    coalesce((select vc.slug from public.vehicle_classes vc
               where vc.active order by vc.capacity asc limit 1), ''),
    false
  );

  raise notice '✔ (٠) الشروط المسبقة سليمة — الإعداد الآن «%»',
    current_setting('tours.tz_before', true);
end;
$$;

-- ----------------------------------------------------------------------------
-- (أ) البنية — العمود وقيده والمُشغّل والافتراضي
-- ----------------------------------------------------------------------------
do $$
declare
  v_default  text;
  v_nullable text;
  v_n        integer;
begin
  select c.column_default, c.is_nullable
    into v_default, v_nullable
  from information_schema.columns c
  where c.table_schema = 'public' and c.table_name = 'trip_settings' and c.column_name = 'time_zone';

  if v_default is null then
    raise exception '(أ-١) العمود trip_settings.time_zone غير موجود — 0075 لم تُطبَّق';
  end if;

  -- الافتراضي هو القاهرة ⇒ التركيب القائم لا يتغيّر سلوكه لحظةَ الهجرة
  if v_default not like '%Africa/Cairo%' then
    raise exception '(أ-٢) افتراضي العمود «%» — المتوقع Africa/Cairo', v_default;
  end if;

  if v_nullable <> 'NO' then
    raise exception '(أ-٣) العمود يقبل NULL — منطقةٌ فارغة تعني تنسيقاً بلا مرجع';
  end if;

  select count(*) into v_n
  from pg_constraint
  where conrelid = 'public.trip_settings'::regclass
    and conname = 'trip_settings_time_zone_shape_chk';
  if v_n <> 1 then
    raise exception '(أ-٤) قيد الشكل trip_settings_time_zone_shape_chk مفقود';
  end if;

  select count(*) into v_n
  from pg_trigger
  where tgrelid = 'public.trip_settings'::regclass
    and tgname = 'trip_settings_time_zone_guard'
    and not tgisinternal;
  if v_n <> 1 then
    raise exception '(أ-٥) مُشغّل التحقق trip_settings_time_zone_guard مفقود — الواجهة وحدها ليست حارساً';
  end if;

  raise notice '✔ (أ) البنية: عمودٌ إلزامي بافتراضي القاهرة، وقيد شكل، ومُشغّل تحقق';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ب) الحارس يرفض فعلاً — **وشاهدٌ إيجابي بجواره**
--
-- الشاهد الإيجابي ليس زينة: بدونه لا نعرف إن كان الرفض في (ب-١) من الحارس أم
-- من قيد الشكل أم من RLS. فمنطقةٌ حقيقية تمرّ ⇒ الرفض جاء من عدم وجود الاسم.
-- ----------------------------------------------------------------------------
do $$
declare
  v_caught boolean;
  v_hint   text;
begin
  -- (ب-١) اسمٌ لا وجود له في قاعدة المناطق
  v_caught := false;
  begin
    update public.trip_settings set time_zone = 'Mars/Olympus_Mons' where id;
  exception when others then
    v_caught := true;
    get stacked diagnostics v_hint = PG_EXCEPTION_HINT;
  end;

  if not v_caught then
    raise exception '(ب-١) المُشغّل قَبِل «Mars/Olympus_Mons» — منطقةٌ لا يعرفها Postgres مرّت إلى الإعداد';
  end if;
  if v_hint is distinct from 'invalid-timezone' then
    raise exception '(ب-٢) التلميح «%» لا «invalid-timezone» — الواجهة تميّز خطأ الإدخال عن خطأ الصلاحيات بالتلميح',
      coalesce(v_hint, '(بلا)');
  end if;

  -- (ب-٣) اسمٌ بشكلٍ سليم ولا وجود له كذلك — الشكل وحده ليس حارساً
  v_caught := false;
  begin
    update public.trip_settings set time_zone = 'Africa/Atlantis' where id;
  exception when others then
    v_caught := true;
  end;
  if not v_caught then
    raise exception '(ب-٣) «Africa/Atlantis» مرّت — قيد الشكل يمرّرها، والمُشغّل هو من يجب أن يرفضها';
  end if;

  -- (ب-٤) 🟢 شاهدٌ إيجابي: منطقةٌ حقيقية تُقبل
  update public.trip_settings set time_zone = 'America/New_York' where id;
  if (select t.time_zone from public.trip_settings t) <> 'America/New_York' then
    raise exception '(ب-٤) منطقةٌ حقيقية لم تُحفظ — الرفض في (ب-١) قد يكون لسببٍ آخر';
  end if;

  raise notice '✔ (ب) الحارس يرفض ما لا تعرفه قاعدة المناطق ويقبل ما تعرفه';
  raise exception 'ROLLBACK_MARKER';
exception
  when others then
    if sqlerrm <> 'ROLLBACK_MARKER' then raise; end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- (ج) 🔴 **الماضي لا يُعاد تفسيره** — البند الذي تقوم عليه سلامة الإعداد كله
--
-- حجزٌ حقيقي بموعدٍ ثابت، ثم تُبدَّل المنطقة، ثم يُسأل سؤالان:
--   (ج-٢) هل تحرّكت **اللحظة المخزَّنة**؟  ← يجب: لا، ولا ميكروثانية.
--   (ج-٤) هل تحرّك **المعروض**؟           ← يجب: نعم، بفارق المنطقتين بالضبط.
--
-- ولماذا هما سؤالان لا واحد: لو ثبت الأول وحده لجاز أن يكون العرض مجمَّداً هو
-- الآخر (إعدادٌ لا يفعل شيئاً)، ولو ثبت الثاني وحده لجاز أن يكون التبديل قد
-- زحزح الحجز فعلاً. والاثنان معاً هما تعريف «تفسيرٌ وتنسيق، لا تخزين».
--
-- والموعد **ثابتٌ مكتوب** لا `now()`: فارق القاهرة عن نيويورك يتغيّر عبر السنة
-- (‏التوقيت الصيفي يبدأ وينتهي في تاريخين مختلفين)، واختبارٌ يعتمد على لحظة
-- التشغيل يمرّ في أغسطس ويسقط في نوفمبر.
-- ----------------------------------------------------------------------------
do $$
declare
  v_class     text := nullif(current_setting('tours.tz_class', true), '');
  v_res       record;
  v_pickup    constant timestamptz := timestamptz '2026-09-14 07:00:00+00';
  v_stored_a  timestamptz;
  v_stored_b  timestamptz;
  v_wall_a    timestamp;
  v_wall_b    timestamp;
  v_expected  interval;
begin
  if v_class is null then
    raise notice '  ↳ (ج) لا فئة سيارات نشطة على هذه القاعدة — برهان «الماضي لا ينزاح» يُتخطّى';
    raise exception 'ROLLBACK_MARKER';
  end if;

  -- بيئةٌ لا تعترض: المهلة مطفأة والكنس مطفأ، والمنطقة تبدأ من القاهرة
  update public.trip_settings
     set time_zone = 'Africa/Cairo',
         min_lead_minutes = 0,
         unpaid_cancel_enabled = false
   where id;

  select * into v_res from public.create_booking(
    '{"label": "القاهرة", "lat": 30.0444, "lng": 31.2357}'::jsonb,
    '{"label": "الإسكندرية", "lat": 31.2001, "lng": 29.9187}'::jsonb,
    1, false, 0, 220, 180, 'osrm', v_class, 'full',
    'اختبار المنطقة الزمنية', '01000000000', null,
    v_pickup, 'TIMEZONE_TESTS_FIXTURE'
  );
  if v_res.public_token is null then
    raise exception '(ج-٠) لم يُنشأ الحجز — لا شيء يُبرهَن عليه';
  end if;

  -- موعد الانطلاق يعيش في **لقطة الرحلة** لا في عمودٍ مستقل (0031): وهي
  -- الحمولة نفسها التي تصل صفحة متابعة العميل، فالبرهان يقع على ما يراه فعلاً.
  select (b.trip->>'pickupAt')::timestamptz into v_stored_a
    from public.bookings b where b.id = v_res.id;
  v_wall_a := v_stored_a at time zone public.site_time_zone();

  -- 🟢 شاهدٌ إيجابي: التخزين UTC صحيحٌ سلفاً — ١٠:٠٠ بالقاهرة = ٠٧:٠٠Z
  if v_stored_a <> v_pickup then
    raise exception '(ج-١) اللحظة المخزَّنة % تخالف المُرسَلة % — الحجز نفسه انزاح قبل أي تبديل',
      v_stored_a, v_pickup;
  end if;

  -- ── التبديل ───────────────────────────────────────────────────────────────
  update public.trip_settings set time_zone = 'America/New_York' where id;

  select (b.trip->>'pickupAt')::timestamptz into v_stored_b
    from public.bookings b where b.id = v_res.id;
  v_wall_b := v_stored_b at time zone public.site_time_zone();

  -- (ج-٢) 🔴 اللحظة المخزَّنة **لم تتحرّك**
  if v_stored_b <> v_stored_a then
    raise exception '(ج-٢) 🔴 تبديل الإعداد زحزح حجزاً قائماً! قبل % وبعد % — الإعداد يعيد تفسير الماضي، وهذا عطبٌ لا ميزة',
      v_stored_a, v_stored_b;
  end if;
  if extract(epoch from v_stored_b) <> extract(epoch from v_stored_a) then
    raise exception '(ج-٢ب) الطابعان متساويان بالمقارنة ومختلفان بالثواني — فرقٌ دون الثانية انزاح';
  end if;

  -- (ج-٣) المعروض **تحرّك** — وإلا فالإعداد لا يفعل شيئاً أصلاً
  if v_wall_b = v_wall_a then
    raise exception '(ج-٣) المعروض لم يتحرّك بعد تبديل المنطقة (%) — الإعداد لا يصل إلى العرض', v_wall_a;
  end if;

  -- (ج-٤) 🔴 والانزياح **بفارق المنطقتين بالضبط**، مقيساً باسمَيهما صراحةً
  --       لا بنداء `site_time_zone()` — وإلا كان القياس يقيس نفسه.
  v_expected := (v_stored_a at time zone 'Africa/Cairo')
              - (v_stored_a at time zone 'America/New_York');
  if v_expected = interval '0' then
    raise exception '(ج-٤أ) المنطقتان بلا فارقٍ عند هذه اللحظة — الاختبار يقيس فراغاً، غيّر اللحظة أو المنطقة';
  end if;
  if (v_wall_a - v_wall_b) <> v_expected then
    raise exception '(ج-٤) الانزياح % والمتوقع % — المعروض تحرّك بغير فارق المنطقتين',
      (v_wall_a - v_wall_b), v_expected;
  end if;

  -- (ج-٥) وكل منظور يطابق منطقته حرفاً — لا «قريباً منها»
  if v_wall_a <> (v_stored_a at time zone 'Africa/Cairo')
     or v_wall_b <> (v_stored_a at time zone 'America/New_York') then
    raise exception '(ج-٥) المعروض لا يطابق ما تُنتجه المنطقة المسمّاة — الإعداد يصل مشوَّهاً';
  end if;

  raise notice
    '✔ (ج) 🔴 اللحظة المخزَّنة ثابتة (%) والمعروض انزاح من % إلى % — أي بفارق % بالضبط',
    v_stored_a, v_wall_a, v_wall_b, v_expected;
  raise exception 'ROLLBACK_MARKER';
exception
  when others then
    if sqlerrm <> 'ROLLBACK_MARKER' then raise; end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- (د) 🔴 **الإعداد هو الذي يقود التحويل** — لا نصٌّ مدفون
--
-- `derive_waiting_hours` تُرجع صفراً حين تقع العودة في **يومٍ آخر** بمنطقة
-- الموقع (D-57). واللحظتان أدناه ثابتتان مكتوبتان:
--
--   ‏2026-02-10 20:00Z → 23:00Z
--   • بالقاهرة (‏+02:00 في فبراير): ٢٢:٠٠ يوم ١٠ ← ٠١:٠٠ يوم ١١ ⇒ **يومان** ⇒ 0
--   • بنيويورك (‏−05:00 في فبراير): ١٥:٠٠ يوم ١٠ ← ١٨:٠٠ يوم ١٠ ⇒ **يوم واحد** ⇒ 3
--
-- فنفس اللحظتين تُعطيان رقمين بتبديل الإعداد وحده. والقيمتان تُشتقّان من
-- التقويم لا من رقمٍ محفور: نفحص **الاختلاف** وسببه (حدُّ اليوم) لا الرقمين.
-- ----------------------------------------------------------------------------
do $$
declare
  v_pick  constant timestamptz := timestamptz '2026-02-10 20:00:00+00';
  v_back  constant timestamptz := timestamptz '2026-02-10 23:00:00+00';
  v_cairo numeric;
  v_ny    numeric;
begin
  update public.trip_settings set time_zone = 'Africa/Cairo' where id;
  v_cairo := public.derive_waiting_hours(v_pick, v_back);

  update public.trip_settings set time_zone = 'America/New_York' where id;
  v_ny := public.derive_waiting_hours(v_pick, v_back);

  -- (د-١) الفرضية القائمة: بالقاهرة اللحظتان في يومين ⇒ لا انتظار مشتقّ
  if (v_pick at time zone 'Africa/Cairo')::date = (v_back at time zone 'Africa/Cairo')::date then
    raise exception '(د-١) اللحظتان في يومٍ واحد بالقاهرة — الاختبار فقد شرطه، غيّر اللحظتين';
  end if;
  if v_cairo <> 0 then
    raise exception '(د-١ب) بالقاهرة المتوقع ٠ والفعلي % — العودة في يومٍ آخر يجب ألا تُنتج انتظاراً', v_cairo;
  end if;

  -- (د-٢) وبنيويورك في يومٍ واحد ⇒ انتظارٌ مشتقّ موجب
  if (v_pick at time zone 'America/New_York')::date
     <> (v_back at time zone 'America/New_York')::date then
    raise exception '(د-٢) اللحظتان في يومين بنيويورك أيضاً — الاختبار فقد شرطه';
  end if;
  if v_ny <= 0 then
    raise exception '(د-٢ب) بنيويورك المتوقع أكبر من صفر والفعلي % — الرحلة في يومٍ واحد هناك', v_ny;
  end if;

  -- (د-٣) 🔴 الخلاصة: **نفس** اللحظتين، ونتيجتان — فالإعداد هو الحاكم
  if v_cairo = v_ny then
    raise exception '(د-٣) 🔴 النتيجة واحدة (%) في المنطقتين — الدالة تتجاهل الإعداد وتقرأ منطقةً مدفونة', v_cairo;
  end if;

  raise notice '✔ (د) 🔴 نفس اللحظتين: بالقاهرة % ساعة وبنيويورك % ساعة — الإعداد يقود التحويل',
    v_cairo, v_ny;
  raise exception 'ROLLBACK_MARKER';
exception
  when others then
    if sqlerrm <> 'ROLLBACK_MARKER' then raise; end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- (هـ) 🔴 **مصدرٌ واحد** — صفر نصٍّ حرفيّ في أي دالة أو عرض
--
-- هذا هو الحارس الذي يعيش بعد الهجرة: دالةٌ جديدة تُكتب غداً بـ
-- `at time zone 'Africa/Cairo'` تُمسك هنا لا في مراجعةٍ بشرية. و«إعدادٌ
-- يتجاهله عشرة مستدعين أسوأ من ثابت» — لأنه يكذب.
--
-- و`site_time_zone` وحدها مستثناة: النصّ فيها هو الـfallback نفسه (D-04).
-- ----------------------------------------------------------------------------
do $$
declare
  v_names text;
  v_fns   integer;
  v_views integer;
begin
  select string_agg(p.proname, '، ' order by p.proname) into v_names
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prokind in ('f', 'p')
    and p.prosrc like '%Africa/Cairo%'
    and p.proname <> 'site_time_zone';
  if v_names is not null then
    raise exception '(هـ-١) 🔴 دوال ما زالت تحمل منطقةً مثبّتة نصّاً: % — الإعداد يكذب عليها', v_names;
  end if;

  select string_agg(c.relname, '، ' order by c.relname) into v_names
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind in ('v', 'm')
    and pg_get_viewdef(c.oid) like '%Africa/Cairo%';
  if v_names is not null then
    raise exception '(هـ-٢) 🔴 عروض ما زالت تحمل منطقةً مثبّتة نصّاً: %', v_names;
  end if;

  -- 🟢 شاهدٌ إيجابي: النداء موجودٌ فعلاً حيث كان النصّ — وإلا فالفحصان أعلاه
  --    يمرّان على قاعدةٍ لم تُطبَّق عليها الهجرة أصلاً (فحصٌ لا يمكن أن يفشل).
  select count(*) into v_fns
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prokind in ('f','p')
    and p.prosrc like '%site_time_zone()%';
  if v_fns < 12 then
    raise exception '(هـ-٣) عدد الدوال التي تنادي site_time_zone() = % (المتوقع ١٢ على الأقل) — الهجرة غير مكتملة',
      v_fns;
  end if;

  select count(*) into v_views
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('v','m')
    and pg_get_viewdef(c.oid) like '%site_time_zone()%';
  if v_views < 5 then
    raise exception '(هـ-٤) عدد العروض التي تنادي site_time_zone() = % (المتوقع ٥ على الأقل)', v_views;
  end if;

  raise notice '✔ (هـ) 🔴 صفر نصٍّ حرفيّ باقٍ، و% دالة و% عروض تنادي المصدر الواحد', v_fns, v_views;
end;
$$;

-- ----------------------------------------------------------------------------
-- (و) `site_time_zone()` — **بلا وسيط، ووحيدةٌ بالاسم**
--
-- العدّ **بالاسم** في `pg_proc` لا بـ`regprocedure`: هذه لا تُحلّ إلا إلى دالة
-- الصفر وسيط، فحارسٌ مكتوبٌ بها يؤكّد ما يفترضه ولا يمكن أن يفشل — وهو النمط ٩
-- في `handover/LESSONS.md` حرفاً (وقع في `0029` وصُحّح في `0030`).
-- ----------------------------------------------------------------------------
do $$
declare
  v_n     integer;
  v_roles text;
begin
  select count(*) into v_n
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'site_time_zone';
  if v_n <> 1 then
    raise exception '(و-١) عدد دوال site_time_zone بالاسم = % (المتوقع ١)', v_n;
  end if;

  select count(*) into v_n
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'site_time_zone' and p.pronargs <> 0;
  if v_n <> 0 then
    raise exception '(و-٢) site_time_zone اكتسبت وسيطاً — النطاق يجب أن يبقى داخل التوقيع (D-51)';
  end if;

  -- `security definer` ليست تشديداً: `trip_settings` محروسٌ بـ`is_admin()`،
  -- وقراءةٌ بهوية الزائر تعود بصفر صفوف بلا خطأ ⇒ سقوطٌ صامت إلى الافتراضي.
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'site_time_zone' and p.prosecdef
  ) then
    raise exception '(و-٣) site_time_zone ليست security definer — الزائر سيقرأ الافتراضي دائماً بلا خطأ';
  end if;

  -- والثلاثة تحتاجها: `anon` لمسار الحجز العام، و`authenticated` للبورتال،
  -- و`service_role` للعامل. وما تكشفه اسمُ منطقةٍ ظاهرٌ في كل تاريخٍ مُنسَّق.
  select string_agg(r, '، ' order by r) into v_roles
  from unnest(array['anon', 'authenticated', 'service_role']) as r
  where not has_function_privilege(r, 'public.site_time_zone()', 'EXECUTE');
  if v_roles is not null then
    raise exception '(و-٤) أدوارٌ بلا صلاحية تنفيذ site_time_zone: %', v_roles;
  end if;

  raise notice '✔ (و) دالةٌ وحيدة بلا وسيط، definer، وممنوحة للأدوار الثلاثة';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ز) العروض الخمسة بقيت `security_invoker`
--
-- `create or replace view` بلا `with (security_invoker=true)` يُعيدها إلى
-- صلاحيات مالكها فتتجاوز RLS — أي أن هجرةً تُصلح المنطقة كانت تفتح البيانات.
-- الفحص هنا يحرس **ما كان قائماً** لا ما أُضيف (D-58 القاعدة ٢).
-- ----------------------------------------------------------------------------
do $$
declare
  v_names text;
begin
  select string_agg(c.relname, '، ' order by c.relname) into v_names
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'v'
    and c.relname like 'v_stats_%'
    and not coalesce(c.reloptions, '{}') @> array['security_invoker=true'];
  if v_names is not null then
    raise exception '(ز-١) 🔴 عروضٌ فقدت security_invoker فصارت تتجاوز RLS: %', v_names;
  end if;

  raise notice '✔ (ز) عروض الإحصاءات ما زالت security_invoker بعد إعادة إنشائها';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ح) 🧬 **الطفرة** — هل لتأكيد (د) قوّة تمييز أصلاً؟
--
-- سؤال `handover/LESSONS.md` النمط ٥ حرفياً: «لو انعكس السلوك، هل يفشل؟».
-- ولا يُجاب عنه بالقراءة — يُجاب بأن **نجعل الإعداد مُتجاهَلاً ونرى**.
--
-- والطفرة تقع على `site_time_zone()` وحدها: هي المصدر الذي تقرأ منه الدوال
-- الاثنتا عشرة والعروض الخمسة، فتثبيتُها على القاهرة = «الإعداد مُهمَل» بلا
-- لمس سطرٍ واحد في أيٍّ منها. وهذا بالضبط الشكل الذي كان عليه المستودع قبل
-- 0075 — أي أن الطفرة تُعيد الماضي حرفياً.
--
-- ثم يُعاد التعريف الأصلي **من `pg_get_functiondef`** (‏D-58) ويُفحص أنها لم تنجُ.
-- ----------------------------------------------------------------------------
do $$
declare
  v_original text;
  v_pick     constant timestamptz := timestamptz '2026-02-10 20:00:00+00';
  v_back     constant timestamptz := timestamptz '2026-02-10 23:00:00+00';
  v_cairo    numeric;
  v_ny       numeric;
  v_survived boolean;
begin
  select pg_get_functiondef(p.oid) into v_original
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'site_time_zone';
  if v_original is null then
    raise exception '(ح-٠) site_time_zone غير موجودة — 0075 لم تُطبَّق';
  end if;

  -- 🧬 الطفرة: المصدر يتجاهل الصفّ ويُرجع القاهرة دائماً
  execute $mut$
    create or replace function public.site_time_zone()
    returns text
    language sql
    stable
    security definer
    set search_path = ''
    as $mutant$ select 'Africa/Cairo'::text /* MUTANT_0075 */ $mutant$;
  $mut$;

  -- ونعيد **نفس** قياس (د) حرفاً
  update public.trip_settings set time_zone = 'Africa/Cairo' where id;
  v_cairo := public.derive_waiting_hours(v_pick, v_back);
  update public.trip_settings set time_zone = 'America/New_York' where id;
  v_ny := public.derive_waiting_hours(v_pick, v_back);

  -- 🔴 المطلوب أن **تنجو الطفرة**: أي أن تجاهُل الإعداد يجعل النتيجتين متساويتين
  --    فيسقط تأكيد (د-٣). ولو بقيتا مختلفتين لكان اختلافُهما في (د) واقعاً
  --    لسببٍ آخر — و**تأكيد (د) كله زينة**.
  v_survived := (v_cairo = v_ny);

  -- الاستعادة أولاً ثم الحكم: لا نترك القاعدة مطفَّرة على أي مسارٍ خرج
  execute v_original;

  if not v_survived then
    raise exception
      '(ح-١) 🧬 الطفرة قُتلت: جعلنا site_time_zone() تتجاهل الإعداد والنتيجتان ما زالتا مختلفتين (% و%). أي أن اختلاف (د) ليس من الإعداد — التأكيد لا يقيس ما نظنّه',
      v_cairo, v_ny;
  end if;

  if position('MUTANT_0075' in (
       select pg_get_functiondef(p.oid)
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'site_time_zone')) > 0 then
    raise exception '(ح-٢) الطفرة نجت بعد الاستعادة — الدالة الحيّة ما زالت المُطفَّرة';
  end if;

  raise notice
    '✔ (ح) 🧬 تجاهُل الإعداد يجعل النتيجتين % و% متساويتين ⇒ تأكيد (د-٣) يقيس الإعداد نفسه',
    v_cairo, v_ny;
  raise exception 'ROLLBACK_MARKER';
exception
  when others then
    if sqlerrm <> 'ROLLBACK_MARKER' then raise; end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- (ي) التنظيف — إعدادات المالك كما كانت حرفاً
-- ----------------------------------------------------------------------------
do $$
declare
  v_before text;
  v_after  text;
  v_rows   integer;
  v_left   integer;
begin
  select count(*) into v_rows from public.trip_settings;
  if v_rows <> 1 then
    raise exception '(ي-١) trip_settings انتهى بـ % صفاً — أحد التعديلات لم يتراجع', v_rows;
  end if;

  -- لا حجز اختبارٍ نجا من التراجع
  select count(*) into v_left from public.bookings b
   where b.trip->>'notes' = 'TIMEZONE_TESTS_FIXTURE';
  if v_left <> 0 then
    raise exception '(ي-٢) بقي % حجز اختبار في القاعدة — كتلة (ج) لم تتراجع', v_left;
  end if;

  v_before := nullif(current_setting('tours.tz_before', true), '');
  select t.time_zone || '/' || t.unpaid_cancel_enabled::text || '/' || t.min_lead_minutes::text
    into v_after
  from public.trip_settings t;

  if v_before is null then
    raise exception '(ي-٣) لقطة الإعدادات الأولى مفقودة — لا سبيل لإثبات أن القاعدة عادت كما كانت';
  end if;
  if v_after is distinct from v_before then
    raise exception '(ي-٤) إعدادات المالك تغيّرت! قبل «%» وبعد «%» — كتلةٌ ما لم تتراجع، والمنطقة مفتاحٌ عالمي',
      v_before, v_after;
  end if;

  -- والدالة تعكس الصفّ لا قيمةً ثانية
  if public.site_time_zone() is distinct from
     (select t.time_zone from public.trip_settings t) then
    raise exception '(ي-٥) site_time_zone() لا تطابق الصفّ بعد التنظيف — الطفرة نجت أو التعريف انحرف';
  end if;

  perform set_config('tours.tz_before', '', false);
  perform set_config('tours.tz_class', '', false);

  raise notice '✔ (ي) التنظيف تم — لا حجوزات اختبار، وإعدادات المالك كما كانت (%)', v_after;
end;
$$;

-- ----------------------------------------------------------------------------
-- الخلاصة
-- ----------------------------------------------------------------------------
do $$
begin
  raise notice 'ALL PASSED — المنطقة الزمنية إعدادُ مالك (0075): مصدرٌ واحد بلا نصٍّ حرفيّ باقٍ، وحارسٌ في القاعدة من قاعدة المناطق نفسها، والإعداد يقود التحويل — واللحظة المخزَّنة لا تتحرّك بتبديله';
end;
$$;
