-- ============================================================================
-- multi_stop_tests.sql — الرحلةُ ذاتُ المحطات الوسطى (هجرة 0140_multi_stop_trips.sql)
--
-- كيف تشغّله:
--   node scripts/db-test.mjs multi_stop
-- أو من psql بدور صاحب القاعدة (‏`ON_ERROR_STOP` **إلزامي**، وإلا تابع psql بعد
-- الكتلة الفاشلة وطبع «ALL PASSED» رغم الفشل):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/multi_stop_tests.sql
--
-- النجاح = آخر سطر «ALL PASSED». وكلُّ فشلٍ استثناءٌ عربيٌّ فيه المتوقَّع والفعلي.
--
-- ── 🔴 ما تثبته هذه المجموعة، والسببُ ماليٌّ لا واجهيّ ────────────────────────
--
-- المتعهد سعّر في قائمته **مساراً مباشراً** من منطلقٍ إلى وجهة. ورحلةٌ بمحطةٍ
-- وسطى أطولُ زمناً ومسافةً ومستحقُّه لا يتغيّر — فلو سُعِّرت من قائمته لَدفعنا
-- له ثمنَ رحلةٍ قصيرة وقاد أطول، وهو **نقضٌ عمليّ للاتفاقية**.
--
-- ⇒ **رحلةٌ بمحطاتٍ تُسعَّر بالتعريفة دائماً**، على المسافة الحقيقية متعددة
--   الأرجل، و`price_source = 'tariff'`.
--
-- ── والشرطُ الثاني الذي لا يُساوَم: التوافقُ الرجعيّ ────────────────────────
--
-- ثمانيةَ عشرَ حجزاً قائماً بلا محطات. فـ**غيابُ المفتاح = رحلةٌ بنقطتين** في
-- كل قارئ، و`create_booking` لا تكتب المفتاح أصلاً حين لا محطات. والقسم (هـ)
-- يقيس ذلك على حجزٍ حقيقيٍّ يُنشئه هذا الملف، لا على وعد.
--
-- ── 🔴 وكلُّ حارسٍ هنا مقرونٌ بطفرته ─────────────────────────────────────────
--
-- درسُ 2026-08-18 المدفوع: عشرةُ توكيداتٍ سقطت في يومين لأنها كانت تقيس **شكل**
-- الكود أو **محتوى** القاعدة بدل **سلوكه**. فلا رقمَ هنا يخصّ المالك ولا شريكاً:
-- كلُّ متعهدٍ وكلُّ قائمةٍ وكلُّ حجزٍ **من صنع هذا الملف**، وكلُّ توقّعٍ مشتقٌّ
-- من نفس المدخلات التي أُعطيت للمحرّك. والطفرات المُنفَّذة فعلاً:
--
--   · (ح-١) **يُنزع القيد** ⇒ تمرّ محطةٌ خارج مصر ⇒ يُعاد القيد بالتراجع.
--   · (ح-٢) **يُعطَّل المُشغّل** ⇒ يمرّ تجاوزُ السقف ⇒ يُعاد بالتراجع.
--   · (د)/(و) **الفارقُ يُقاس لا يُفترض**: نفسُ الرحلة ونفسُ المسافة بمحطةٍ
--     وبلا محطة ⇒ `tariff` مقابل `subcontractor`. فلو أُلغي الشرط في
--     `quote_price` غداً لَتساوى المساران وسقط القسمان.
--   · (ب) `trip_straight_km` تُقارن **رقماً برقم** بمجموع أرجلٍ يحسبه هذا الملف
--     بـ`haversine_km` مباشرةً — فدالةٌ تُرجع الوترَ المباشر تسقط فوراً.
--
-- ── الممرّ الصحراوي، وخلوُّه **مقيسٌ** لا مفترَض ───────────────────────────
--
--   المنطلق  O = (28.500000, 29.500000)
--   الوجهة   D = (27.500000, 30.500000)      ← مباشرةً ‎148.334‎ كم
--   المحطة   S = (28.000000, 31.800000)      ← بها تصير السلسلة ‎371.527‎ كم
--
-- والانحرافُ مقصودٌ بحجمه: ‎371.5‎ **أطولُ من ٩٠٪ من نفسها** و**أقصرُ من ثلاثة
-- أضعاف المباشر (‎445‎)** — فمسافةٌ واحدة (‎372‎ كم) تجتاز حاجزَ D-09 في
-- الحالتين، وهو ما يجعل مقارنةَ «بمحطة/بلا محطة» مقارنةً **بمتغيّرٍ واحد**.
--
-- الأقسام:
--   (٠)    الشروط المسبقة · خلوُّ الممرّ مقيساً · الفئة من المحرّك · تجميد الإعدادات
--   (٠-ب)  الفيكسترة: متعهدٌ ومركبةٌ وقائمةٌ معتمدة على الممرّ
--   (٠-ج)  هويةُ دخولٍ للمتعهد (وثانيةٌ للعزل)
--   (أ)    `point_in_service_area` — الحدودُ الأربعة شاملة، وغيرُ المنتهي يُرفض
--   (ب)    `trip_straight_km` — بلا محطاتٍ = الوتر حرفاً، وبمحطةٍ = مجموع الأرجل
--   (ج)    `trip_stops_reject_reason` — رمزٌ لكل سبب، والغيابُ سليم
--   (د)    🔴 `quote_price`: تغطيةٌ قائمة ⇒ متعهد · ومحطةٌ واحدة ⇒ **تعريفة**
--   (هـ)   `create_booking` بلا محطات ⇒ المسارُ القديم حرفاً، ولا مفتاحَ جديد
--   (و)    🔴 `create_booking` بمحطات ⇒ tariff · لقطةٌ مطبَّعة · straightKm للأرجل
--   (ز)    الرفضُ من `create_booking` — رمزٌ مستقلٌّ لكل سبب
--   (ح)    الحاجزان على الجدول + **طفرةُ كلٍّ منهما**، والسقفُ من الإعداد
--   (ط)    المتعهد يرى المحطات — ومعمّاةً قبل القبول (D-19)، ولا يرى ما ليس له
--   (ي)    المنح — ما انفتح وما بقي مغلقاً، ودالةُ المُشغّل منها (‏0141)
--   (ل)    0141 — مدى `max_trip_stops` لا يتجاوز ما يقبله `/api/quote`
--   (م)    🔴 0142 — فيكسترةٌ **معكوسةُ الاتجاه الاقتصادي**: سعرُ المتعهد أعلى
--   (ن)    🔴 0142 — الحالاتُ الأربع للأرضية، **وطفرةُ نزعها**
--   (ص)    🔴 0142 — `create_booking` يخزّن المُؤرَّض، والبثُّ يعود من الصفر
--   (ف)    🔴 0142 — رحلةٌ بلا محطات: الأرضيةُ لا تمسّ رقماً على ممرّاتٍ حقيقية
--   (ك)    التنظيف واستعادة الإعدادات
--
-- ── 🔴 وما تضيفه 0142، ولماذا الفيكسترةُ القائمة لا تكفي ──────────────────
--
-- قرارُ 0140 (‏«بمحطاتٍ ⇒ تعريفة») كان أثرُه على قوائم بدر **عكسَ غرضه**: على
-- ممرٍّ **قصيرٍ مغطّى** تكون التعريفةُ أرخصَ من سعر المتعهد، فمحطةٌ في منتصف
-- الطريق تُسقط الفاتورة (‏٣١ زوجاً من ١٠٠ · متوسط −١٥٫٥٪ · ١٢ منها تبيع دون
-- تكلفة المتعهد)، ويهبط معها `dispatch_ceiling` دون تكلفته فيصير البثُّ صفراً.
--
-- ⇒ 0142: **الإجمالي = الأكبر من تعريفةِ الأرجل وسعرِ نفسِ الرحلة بنقطتين.**
--
-- ⚠ **وفيكسترةُ (٠-ب) لا تُظهر هذا الاتجاه إطلاقاً**: تكلفتُها ١٥٠٠ على ممرٍّ
--   طوله ٣٧٢ كم، فالتعريفةُ هناك **أعلى دائماً** والأرضيةُ لا تمسك أبداً.
--   ولذلك تولد في (م) فيكسترةٌ ثانية **معكوسة**: ممرٌّ قصيرٌ (نحو ٢١ كم)
--   وتكلفةٌ تجعل سعرَ المتعهد أعلى من تعريفة الأرجل — وهي الحالةُ التي كان
--   العيبُ يعيش فيها. **وتكلفتُها تُشتقّ من المحرّك نفسِه** لا رقماً محفوراً،
--   فتغييرُ تعريفةٍ من اللوحة لا يُسقط الأقسام.
--
-- المرجع: `supabase/migrations/0140_multi_stop_trips.sql` ·
--         `supabase/migrations/0142_multi_stop_price_floor.sql` · D-05 · D-09
--         · D-10 · D-11 · D-14 · D-16 · D-18 · D-19 · D-20 · D-58.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (٠) الشروط المسبقة + تنظيف بقايا + خلوُّ الممرّ + معطيات التشغيل
-- ----------------------------------------------------------------------------
do $$
declare
  v_missing text;
  v_classes text[];
  v_n       integer;
  v_rows    integer;
begin
  select string_agg(x.sig, '، ')
    into v_missing
  from (values
    ('public.point_in_service_area(numeric, numeric)'),
    ('public.trip_stops_reject_reason(jsonb)'),
    ('public.trip_straight_km(numeric, numeric, numeric, numeric, jsonb)'),
    ('public.trip_stops_full(jsonb)'),
    ('public.trip_stops_public(jsonb)'),
    ('public.max_trip_stops()'),
    ('public.haversine_km(numeric, numeric, numeric, numeric)'),
    ('public.coverage_matches(numeric, numeric, numeric, numeric)'),
    ('public.quote_price(numeric, integer, boolean, numeric, numeric, numeric, numeric, numeric, integer, jsonb)'),
    ('public.portal_offers()'),
    ('public.portal_trips()')
  ) as x(sig)
  where to_regprocedure(x.sig) is null;

  if v_missing is not null then
    raise exception
      'شرط مسبق: دوال مفقودة (نفّذ 0140_multi_stop_trips.sql أولاً): %', v_missing;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.bookings'::regclass
      and conname  = 'bookings_trip_stops_shape_chk'
  ) then
    raise exception 'شرط مسبق: قيدُ شكل المحطات غائب عن bookings — نفّذ 0140';
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.bookings'::regclass
      and tgname  = 'bookings_guard_trip_stops'
  ) then
    raise exception 'شرط مسبق: مُشغّل سقف المحطات غائب عن bookings — نفّذ 0140';
  end if;

  select count(*) into v_rows from public.pricing_settings;
  if v_rows <> 1 then
    raise exception 'شرط مسبق: pricing_settings يجب أن يحوي صفاً واحداً بالضبط (وجدنا %)', v_rows;
  end if;

  -- تنظيف بقايا تشغيلٍ سابق (إشعارات ← عروض ← دورات ← حجوزات ← متعهدون)
  delete from public.notifications n
   where n.payload ->> 'bookingId' in (
         select b.id::text from public.bookings b
          where b.trip ->> 'notes' like 'MULTI_STOP_TESTS_FIXTURE%');
  delete from public.trip_offers o
   where o.booking_id in (select b.id from public.bookings b
                           where b.trip ->> 'notes' like 'MULTI_STOP_TESTS_FIXTURE%');
  delete from public.dispatches d
   where d.booking_id in (select b.id from public.bookings b
                           where b.trip ->> 'notes' like 'MULTI_STOP_TESTS_FIXTURE%');
  delete from public.bookings b where b.trip ->> 'notes' like 'MULTI_STOP_TESTS_FIXTURE%';
  delete from public.subcontractors s where s.company_name like 'MULTI_STOP_TESTS%';

  -- ── خلوُّ الممرّ **بالاتجاهين**: قائمةٌ ثنائيةُ الاتجاه قد تطابق المعكوس وحده
  select (select count(*) from public.coverage_matches(28.5, 29.5, 27.5, 30.5))
       + (select count(*) from public.coverage_matches(27.5, 30.5, 28.5, 29.5))
    into v_n;

  if v_n <> 0 then
    raise exception
      'شرط مسبق: الممرّ الصحراوي لم يعد خالياً (% مطابقة) — اختر ممرّاً آخر ولا تُضعف التوكيدات', v_n;
  end if;

  -- الفئةُ المؤهلة لراكبٍ واحد — من المحرّك نفسِه لا تخميناً منّا
  select array_agg(q.class_slug order by q.capacity asc)
    into v_classes
  from public.quote_price(150, 1, false, 0) q;

  if v_classes is null or array_length(v_classes, 1) < 1 then
    raise exception 'شرط مسبق: لا فئة سيارة نشطة لها تعريفة — نفّذ بذرة 0005';
  end if;

  perform set_config('tours.ms_class', v_classes[1], false);

  -- إعدادات التسعير الأصلية تُحفظ مرة واحدة وتُعاد في (ك)
  perform set_config('tours.ms_settings', (
    select jsonb_build_object(
             'peak_enabled', ps.peak_enabled, 'peak_percent', ps.peak_percent,
             'margin_type', ps.margin_type, 'margin_value', ps.margin_value,
             'margin_min_amount', ps.margin_min_amount
           )::text
    from public.pricing_settings ps limit 1
  ), false);
  perform set_config('tours.ms_maxstops',
    (select t.max_trip_stops::text from public.trip_settings t where t.id limit 1), false);

  -- ثبات الأرقام: بلا ذروة، وهامشٌ نسبيٌّ معلوم. تُعاد الأصول في (ك).
  update public.pricing_settings
     set peak_enabled = false, margin_type = 'percent',
         margin_value = 20,    margin_min_amount = 100;

  raise notice '✔ (٠) الشروط سليمة · الممرّ خالٍ (٠ مطابقة) · فئة الاختبار «%» · سقف المحطات الحالي %',
    v_classes[1], public.max_trip_stops();
end;
$$;

-- ----------------------------------------------------------------------------
-- (٠-ب) الفيكسترة — متعهدٌ واحد على الممرّ، وقائمتُه **معتمدة**
--
-- 🔴 والاعتمادُ شرطٌ لا زينة: بلا تغطيةٍ حيّةٍ على الممرّ يصير القسمُ (د) كلُّه
--    بلا معنى — «الرحلةُ بمحطاتٍ تُسعَّر بالتعريفة» توكيدٌ فارغ إن كانت الرحلةُ
--    بلا محطاتٍ تُسعَّر بالتعريفة أيضاً. ولذلك يبدأ (د) بشاهدٍ موجب.
--
-- ⚠ والعناصر تُدرج **قبل** الاعتماد: المُشغّل `price_list_items_demote_parent`
--   يُعيد القائمة المعتمَدة إلى `pending` عند تعديل عناصرها.
-- ----------------------------------------------------------------------------
do $$
declare
  v_sub   constant uuid := '5f000000-0000-4000-8000-000000000001';
  v_sub2  constant uuid := '5f000000-0000-4000-8000-000000000002';
  v_list  constant uuid := '5f100000-0000-4000-8000-000000000001';
  v_class text := current_setting('tours.ms_class', true);
begin
  insert into public.subcontractors (id, company_name, phone, status)
  values
    (v_sub,  'MULTI_STOP_TESTS متعهد الممرّ', '01000000501', 'approved'),
    (v_sub2, 'MULTI_STOP_TESTS متعهد آخر',    '01000000502', 'approved');

  insert into public.subcontractor_vehicles (subcontractor_id, class_slug, label, active)
  values (v_sub, v_class, 'مركبة اختبار المحطات', true);

  insert into public.price_lists
    (id, subcontractor_id, title, origin_label, origin_lat, origin_lng, origin_radius_km,
     dest_label, dest_lat, dest_lng, dest_radius_km, bidirectional, status)
  values
    (v_list, v_sub, 'MS قائمة الممرّ', 'مركز الممرّ', 28.500000, 29.500000, 30,
     'وجهة الممرّ', 27.500000, 30.500000, 30, false, 'draft');

  insert into public.price_list_items (price_list_id, class_slug, cost)
  values (v_list, v_class, 1500);

  update public.price_lists set status = 'approved' where id = v_list;

  raise notice '✔ (٠-ب) الفيكسترة جاهزة — متعهدٌ معتمَدٌ يغطّي الممرّ بتكلفة ١٥٠٠، ومتعهدٌ ثانٍ للعزل';
end;
$$;

-- ----------------------------------------------------------------------------
-- (٠-ج) هويتا دخول — بلاهما تُتخطّى أقسامُ البورتال بإشعارٍ صريح لا بصمت
-- ----------------------------------------------------------------------------
do $$
declare
  v_sub   constant uuid := '5f000000-0000-4000-8000-000000000001';
  v_sub2  constant uuid := '5f000000-0000-4000-8000-000000000002';
  v_prof  constant uuid := '5f200000-0000-4000-8000-000000000001';
  v_prof2 constant uuid := '5f200000-0000-4000-8000-000000000002';
begin
  perform set_config('tours.ms_identities', '0', false);

  begin
    insert into auth.users (id, email) values
      (v_prof,  'multi-stop-a@local.invalid'),
      (v_prof2, 'multi-stop-b@local.invalid');
    insert into public.profiles (id, role, full_name) values
      (v_prof,  'subcontractor', 'متعهد المحطات أ'),
      (v_prof2, 'subcontractor', 'متعهد المحطات ب')
    on conflict (id) do update set role = 'subcontractor';
    update public.subcontractors set profile_id = v_prof  where id = v_sub;
    update public.subcontractors set profile_id = v_prof2 where id = v_sub2;
    perform set_config('tours.ms_identities', '1', false);
    raise notice '✔ (٠-ج) هويتا دخولٍ جاهزتان';
  exception
    when others then
      raise notice '⚠ (٠-ج) تعذّر إنشاء هويتي دخول (%) — القسم (ط) سيُتخطّى', sqlerrm;
  end;
end;
$$;

-- ----------------------------------------------------------------------------
-- (أ) `point_in_service_area` — الحدودُ الأربعة **شاملة**، وغيرُ المنتهي يُرفض
--
-- القياسُ على الحافة لا في وسط المدى: شرطٌ بـ`>` بدل `>=` يمرّ من أي اختبارٍ
-- يجرّب القاهرة، ويسقط هنا وحده. والميكرودرجةُ هي أضيقُ فرقٍ يُفرَّق به.
--
-- 🔴 و`Infinity`/`NaN` **يُرفضان بنيوياً**: `numeric` ترتّبهما خارج المدى، ولم
--    يُكتب لهما شرطٌ مستقلّ عمداً — شرطٌ لا يمكن أن يفشل ليس حارساً (النمط ٩).
--    وهذه الأسطرُ تُثبت الرفضَ **سلوكاً**، وهو ما يهمّ.
-- ----------------------------------------------------------------------------
do $$
declare
  v_p    record;
  v_got  boolean;
begin
  for v_p in
    select * from (values
      (20.000000::numeric, 31.000000::numeric, true,  'حافة العرض الدنيا ٢٠ — شاملة'),
      (19.999999::numeric, 31.000000::numeric, false, 'تحت الحافة الدنيا بميكرودرجة'),
      (34.000000::numeric, 31.000000::numeric, true,  'حافة العرض العليا ٣٤ — شاملة'),
      (34.000001::numeric, 31.000000::numeric, false, 'فوق الحافة العليا بميكرودرجة'),
      (30.000000::numeric, 23.000000::numeric, true,  'حافة الطول الدنيا ٢٣ — شاملة'),
      (30.000000::numeric, 22.999999::numeric, false, 'غرب الحافة الدنيا بميكرودرجة'),
      (30.000000::numeric, 38.000000::numeric, true,  'حافة الطول العليا ٣٨ — شاملة'),
      (30.000000::numeric, 38.000001::numeric, false, 'شرق الحافة العليا بميكرودرجة'),
      (30.044400::numeric, 31.235700::numeric, true,  'ميدان التحرير — شاهدٌ موجب'),
      (25.197197::numeric, 55.274376::numeric, false, 'برج خليفة، دبي'),
      (41.902800::numeric, 12.496400::numeric, false, 'روما'),
      (30.100000::numeric, 55.274376::numeric, false, 'عرضٌ مصريّ مع طولٍ إماراتي — نصفُ إحداثيّ'),
      ('Infinity'::numeric,  31.000000::numeric, false, 'عرضٌ لا نهائي'),
      ('-Infinity'::numeric, 31.000000::numeric, false, 'عرضٌ سالبٌ لا نهائي'),
      ('NaN'::numeric,       31.000000::numeric, false, 'عرضٌ ليس رقماً'),
      (30.000000::numeric, 'Infinity'::numeric,  false, 'طولٌ لا نهائي'),
      (null::numeric,      31.000000::numeric,   false, 'عرضٌ غائب ⇒ false لا null'),
      (30.000000::numeric, null::numeric,        false, 'طولٌ غائب ⇒ false لا null')
    ) as p(lat, lng, expect, name)
  loop
    v_got := public.point_in_service_area(v_p.lat, v_p.lng);
    if v_got is distinct from v_p.expect then
      raise exception
        '(أ) 🔴 «%» (%، %) أعطت «%» والمتوقع «%» — الصندوقُ لم يعد SERVICE_BOUNDS (٢٠/٣٤/٢٣/٣٨)',
        v_p.name, v_p.lat, v_p.lng, coalesce(v_got::text, 'null'), v_p.expect;
    end if;
  end loop;

  raise notice '✔ (أ) صندوقُ منطقة الخدمة سليم — ١٨ نقطةً على الحواف وخارجها وبلا نهاية';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ب) `trip_straight_km` — الرحلةُ بنقطتين حالةٌ خاصةٌ من متعددة الأرجل
--
-- 🔴 التوكيدُ الأول هو **عقدُ التوافق الرجعيّ كلّه**: حاجزُ D-09 في
--    `create_booking` (‏٠٫٩× و٣×) يقيس على مخرَج هذه الدالة. فلو اختلفت عن
--    `haversine_km` بمقدارٍ ما بلا محطات، لَتغيّر حاجزُ **كل حجزٍ في المشروع**.
--
-- والتوكيدُ الثاني يمنعها أن تكون زينةً: تُقارن بمجموعٍ يحسبه هذا الملف بنفسه
-- بنداءَين مباشرين لـ`haversine_km` — فدالةٌ تُرجع الوترَ وتتجاهل المحطات تسقط.
-- ----------------------------------------------------------------------------
do $$
declare
  v_direct numeric := public.haversine_km(28.5, 29.5, 27.5, 30.5);
  v_none   numeric := public.trip_straight_km(28.5, 29.5, 27.5, 30.5, null);
  v_empty  numeric := public.trip_straight_km(28.5, 29.5, 27.5, 30.5, '[]'::jsonb);
  v_one    numeric := public.trip_straight_km(28.5, 29.5, 27.5, 30.5,
                        '[{"label":"محطة","lat":28.0,"lng":31.8}]'::jsonb);
  v_legs   numeric := public.haversine_km(28.5, 29.5, 28.0, 31.8)
                    + public.haversine_km(28.0, 31.8, 27.5, 30.5);
  v_ab     numeric := public.trip_straight_km(28.5, 29.5, 27.5, 30.5,
                        '[{"label":"أ","lat":28.0,"lng":31.8},{"label":"ب","lat":27.9,"lng":31.0}]'::jsonb);
  v_ba     numeric := public.trip_straight_km(28.5, 29.5, 27.5, 30.5,
                        '[{"label":"ب","lat":27.9,"lng":31.0},{"label":"أ","lat":28.0,"lng":31.8}]'::jsonb);
begin
  if v_none is distinct from v_direct then
    raise exception
      '(ب-١) 🔴 بلا محطات أعطت % بينما haversine_km = % — حاجزُ D-09 تغيّر لكل حجزٍ في المشروع',
      v_none, v_direct;
  end if;

  if v_empty is distinct from v_direct then
    raise exception '(ب-١ب) مصفوفةٌ فارغة أعطت % لا % — الفراغُ يجب أن يكون كالغياب', v_empty, v_direct;
  end if;

  if v_one is distinct from v_legs then
    raise exception
      '(ب-٢) بمحطةٍ واحدة أعطت % ومجموعُ الرِّجلين المحسوبُ هنا % — الدالةُ لا تجمع الأرجل',
      v_one, v_legs;
  end if;

  -- طفرةٌ منطقية: لو تجاهلت الدالةُ المحطات لتساوى هذا بالمباشر
  if v_one <= v_direct then
    raise exception '(ب-٣) المسارُ عبر محطةٍ منحرفة (%) ليس أطولَ من المباشر (%)', v_one, v_direct;
  end if;

  -- والترتيبُ مُدخَلُ عميلٍ لا تفصيلَ تخزين: عكسُه يغيّر الطول
  if v_ab is not distinct from v_ba then
    raise exception '(ب-٤) عكسُ ترتيب المحطتين لم يغيّر الطول (%) — الترتيبُ مُهمَل', v_ab;
  end if;

  raise notice '✔ (ب) الأرجل — بلا محطاتٍ = % كم حرفاً، وبمحطةٍ = % كم = مجموعُ رِجلين، والترتيبُ محسوب',
    round(v_direct, 3), round(v_one, 3);
end;
$$;

-- ----------------------------------------------------------------------------
-- (ج) `trip_stops_reject_reason` — رمزٌ مستقلٌّ لكل سبب، والغيابُ سليم
--
-- ⚠ ورمزٌ واحدٌ عامّ لكل الأسباب كان سيمرّ من اختبارٍ يفحص «هل رُفض؟» وحده.
--   ولذلك يُقارَن الرمزُ نفسه: من «بسّط» الدالةَ إلى `raise` واحد يسقط هنا.
-- ----------------------------------------------------------------------------
do $$
declare
  v_c   record;
  v_got text;
begin
  for v_c in
    select * from (values
      ('{"originLabel":"أ"}',                                          null::text,          'المفتاح غائب ⇒ رحلةٌ بنقطتين'),
      ('{"stops": []}',                                                null::text,          'مصفوفةٌ فارغة'),
      ('{"stops": [{"label":"الجيزة","lat":30.0131,"lng":31.2089}]}',  null::text,          'محطةٌ سليمة'),
      ('{"stops": "الجيزة"}',                                          'stops-not-array',   'نصٌّ بدل مصفوفة'),
      ('{"stops": {"label":"أ"}}',                                     'stops-not-array',   'كائنٌ بدل مصفوفة'),
      ('{"stops": null}',                                              'stops-not-array',   'قيمةُ null صريحة'),
      ('{"stops": [7]}',                                               'stop-not-object',   'رقمٌ بدل كائن'),
      ('{"stops": [{"lat":30,"lng":31}]}',                             'stop-label-missing','بلا وسم'),
      ('{"stops": [{"label":"   ","lat":30,"lng":31}]}',               'stop-label-missing','وسمٌ فراغات'),
      ('{"stops": [{"label":"م","lng":31}]}',                          'stop-coords-missing','بلا خط عرض'),
      ('{"stops": [{"label":"م","lat":30}]}',                          'stop-coords-missing','بلا خط طول'),
      ('{"stops": [{"label":"م","lat":"30","lng":"31"}]}',             'stop-coords-missing','إحداثيتان نصّيّتان'),
      ('{"stops": [{"label":"م","lat":null,"lng":31}]}',               'stop-coords-missing','عرضٌ null صريح'),
      ('{"stops": [{"label":"دبي","lat":25.197,"lng":55.274}]}',       'stop-out-of-area',  'خارج مصر'),
      ('{"stops": [{"label":"م","lat":1e400,"lng":31}]}',              'stop-out-of-area',  'عرضٌ لا يُمثَّل — خارج الصندوق'),
      -- والسببُ الأول بالترتيب هو الذي يُسمّى، لا آخرُ ما وُجد
      ('{"stops": [{"label":"دبي","lat":25.197,"lng":55.274},{"lat":30,"lng":31}]}',
                                                                       'stop-out-of-area',  'أولُ خللٍ بالترتيب يفوز')
    ) as c(trip, expect, name)
  loop
    v_got := public.trip_stops_reject_reason(v_c.trip::jsonb);
    if v_got is distinct from v_c.expect then
      raise exception
        '(ج) «%» أعطت «%» والمتوقع «%»',
        v_c.name, coalesce(v_got, 'سليمة'), coalesce(v_c.expect, 'سليمة');
    end if;
  end loop;

  raise notice '✔ (ج) قاعدةُ الشكل — ١٦ حالةً، وخمسةُ رموزٍ متمايزة لا رمزٌ واحد';
end;
$$;

-- ----------------------------------------------------------------------------
-- (د) 🔴 قلبُ الدفعة — المحطاتُ تُخرج الرحلةَ من تغطية المتعهدين
--
-- ثلاثُ خطوات بترتيبها:
--   (د-١) **شاهدٌ موجب**: بلا محطاتٍ على هذا الممرّ ⇒ `subcontractor`. ولولاه
--         لكان (د-٢) يثبت أن الممرّ بلا تغطيةٍ أصلاً — لا أن المحطات فعلت شيئاً.
--   (د-٢) بمحطةٍ واحدة ⇒ `tariff`، وبلا معرّف متعهدٍ ولا تكلفةٍ ولا هامش.
--   (د-٣) والسعرُ الناتج **مطابقٌ لمسار التعريفة المحض** (نداءٌ بإحداثياتٍ
--         فارغة، وهو المسارُ القائم منذ 0012 لكل رحلةٍ بلا تغطية) — أي أن
--         المحطات **لا تنشئ تسعيراً ثالثاً**، بل تُحوِّل إلى القائم.
-- ----------------------------------------------------------------------------
do $$
declare
  v_class   text := current_setting('tours.ms_class', true);
  v_stops   constant jsonb := '[{"label":"محطة الواحة","lat":28.0,"lng":31.8}]'::jsonb;
  v_plain   record;
  v_multi   record;
  v_tariff  record;
begin
  perform set_config('tours.pricing_internals', 'on', true);

  select * into v_plain
  from public.quote_price(372, 1, false, 0, 28.5, 29.5, 27.5, 30.5, 0, null) q
  where q.class_slug = v_class;

  select * into v_multi
  from public.quote_price(372, 1, false, 0, 28.5, 29.5, 27.5, 30.5, 0, v_stops) q
  where q.class_slug = v_class;

  -- مسارُ التعريفة المحض: بلا إحداثيات ⇒ بلا تغطية (السلوكُ القائم منذ 0012)
  select * into v_tariff
  from public.quote_price(372, 1, false, 0, null, null, null, null, 0, null) q
  where q.class_slug = v_class;

  perform set_config('tours.pricing_internals', '', true);

  -- (د-١) الشاهدُ الموجب
  if v_plain.class_slug is null then
    raise exception '(د-١) المحرّك لم يُرجع الفئة «%» أصلاً — الفيكسترة معطوبة', v_class;
  end if;
  if v_plain.price_source <> 'subcontractor' then
    raise exception
      '(د-١) 🔴 الشاهدُ الموجب سقط: رحلةٌ بلا محطاتٍ على ممرٍّ مغطّى سُعِّرت «%» لا «subcontractor» — فما بعده لا يثبت شيئاً',
      v_plain.price_source;
  end if;
  if v_plain.subcontractor_id is null or v_plain.subcontractor_cost is null then
    raise exception '(د-١) مسارُ المتعهد بلا معرّفٍ أو بلا تكلفة — التغطيةُ ليست حيّة';
  end if;

  -- (د-٢) 🔴 المحطةُ تُحوِّل المصدر
  if v_multi.price_source <> 'tariff' then
    raise exception
      '(د-٢) 🔴 رحلةٌ بمحطةٍ وسطى سُعِّرت «%» — المتعهد سعّر مساراً مباشراً وسيقود أطول بنفس المستحق',
      v_multi.price_source;
  end if;
  if v_multi.subcontractor_id is not null then
    raise exception '(د-٢) رحلةٌ بمحطاتٍ حملت معرّف متعهد % — لا يُطلب منه ما لم يسعّره',
      v_multi.subcontractor_id;
  end if;
  if v_multi.subcontractor_cost is not null or v_multi.margin_amount is not null then
    raise exception '(د-٢) رحلةٌ بمحطاتٍ حملت تكلفةً (%) أو هامشاً (%)',
      v_multi.subcontractor_cost, v_multi.margin_amount;
  end if;

  -- (د-٣) ولا تسعيرَ ثالثاً: هو مسارُ التعريفة القائم حرفاً
  if v_multi.total is distinct from v_tariff.total
     or v_multi.base_fee is distinct from v_tariff.base_fee
     or v_multi.distance_cost is distinct from v_tariff.distance_cost then
    raise exception
      '(د-٣) سعرُ الرحلة بمحطاتٍ (%) لا يطابق مسارَ التعريفة المحض (%) — أُنشئ مسارُ تسعيرٍ ثالث',
      v_multi.total, v_tariff.total;
  end if;

  -- طفرةُ المعنى: لو أُلغي الشرطُ في quote_price لتساوى المساران
  if v_multi.total is not distinct from v_plain.total then
    raise exception
      '(د-٤) سعرُ المسارين متساوٍ (%) — الفيكسترة لا تفرّق بين تغطيةٍ وتعريفة، فالتوكيدُ أعلاه بلا أسنان',
      v_multi.total;
  end if;

  raise notice
    '✔ (د) 🔴 بلا محطات ⇒ subcontractor بـ% · وبمحطةٍ ⇒ tariff بـ% = مسارُ التعريفة المحض تماماً',
    v_plain.total, v_multi.total;
end;
$$;

-- ----------------------------------------------------------------------------
-- (هـ) `create_booking` بلا محطات ⇒ **المسارُ القديم حرفاً**
--
-- 🔒 وأهمُّ توكيدٍ هنا: **لا مفتاح `stops` في اللقطة**. لأن كتابةَ `[]` في كل
--    لقطةٍ جديدة كانت ستُفرّق حجوزات اليوم عن الثمانية عشر القائمة بلا أن يطلب
--    ذلك أحد — والقارئُ يجب أن يعامل الغياب والفراغ سواءً (D-60).
-- ----------------------------------------------------------------------------
do $$
declare
  v_class text := current_setting('tours.ms_class', true);
  v_row   record;
  v_b     record;
begin
  select * into v_row
  from public.create_booking(
    p_origin          => '{"label":"مركز الممرّ","lat":28.5,"lng":29.5}'::jsonb,
    p_destination     => '{"label":"وجهة الممرّ","lat":27.5,"lng":30.5}'::jsonb,
    p_passengers      => 1,
    p_round_trip      => false,
    p_waiting_hours   => 0,
    p_distance_km     => 372,
    p_duration_min    => 200,
    p_distance_source => 'osrm',
    p_class_slug      => v_class,
    p_plan            => 'full',
    p_customer_name   => 'عميل اختبار المحطات',
    p_customer_phone  => '01000000599',
    p_customer_whatsapp => null,
    p_pickup_at       => now() + interval '7 days',
    p_notes           => 'MULTI_STOP_TESTS_FIXTURE بلا محطات'
  );

  select * into v_b from public.bookings b where b.id = v_row.id;

  if v_b.trip ? 'stops' then
    raise exception
      '(هـ-١) 🔴 لقطةُ حجزٍ بلا محطاتٍ كتبت مفتاح stops (%) — لقطاتُ اليوم تفترق عن الحجوزات القائمة بلا سبب',
      v_b.trip -> 'stops';
  end if;

  if v_b.price_source <> 'subcontractor' then
    raise exception '(هـ-٢) حجزٌ بنقطتين على ممرٍّ مغطّى سُعِّر «%» — المسارُ القديم انكسر', v_b.price_source;
  end if;

  if public.jsonb_number(v_b.trip, 'straightKm', -1)
     is distinct from public.haversine_km(28.5, 29.5, 27.5, 30.5) then
    raise exception
      '(هـ-٣) straightKm في اللقطة (%) لا يساوي الوترَ المباشر (%) — تغيّرت لقطةُ كل حجزٍ بنقطتين',
      v_b.trip ->> 'straightKm', public.haversine_km(28.5, 29.5, 27.5, 30.5);
  end if;

  perform set_config('tours.ms_plain_total', v_b.total::text, false);
  perform set_config('tours.ms_plain_id', v_b.id::text, false);

  raise notice '✔ (هـ) حجزٌ بلا محطات — لا مفتاحَ جديداً · المصدر subcontractor · straightKm = الوتر حرفاً';
end;
$$;

-- ----------------------------------------------------------------------------
-- (و) 🔴 `create_booking` بمحطات — تعريفةٌ ولقطةٌ مطبَّعة
--
-- **المتغيّرُ واحد**: نفسُ الممرّ ونفسُ المسافة (‏٣٧٢ كم) ونفسُ الفئة كما في
-- (هـ) — والفارقُ الوحيد وجودُ محطة. فأيُّ اختلافٍ في النتيجة سببُه المحطة.
--
-- ويُقاس معه أنّ اللقطة **تُطبَّع**: مفتاحٌ زائدٌ يصل من طبقة البحث
-- (‏`placeId`) لا يُخزَّن — واللقطةُ تخرج كاملةً إلى `anon` عبر
-- `get_booking_by_token`.
-- ----------------------------------------------------------------------------
do $$
declare
  v_class  text := current_setting('tours.ms_class', true);
  v_stops  constant jsonb :=
    '[{"label":"  محطة الواحة  ","lat":28.0,"lng":31.8,"placeId":"ChIJ_TEST_SHOULD_NOT_PERSIST"}]'::jsonb;
  v_row    record;
  v_b      record;
  v_keys   text[];
  v_plain  numeric := current_setting('tours.ms_plain_total', true)::numeric;
begin
  select * into v_row
  from public.create_booking(
    p_origin          => '{"label":"مركز الممرّ","lat":28.5,"lng":29.5}'::jsonb,
    p_destination     => '{"label":"وجهة الممرّ","lat":27.5,"lng":30.5}'::jsonb,
    p_passengers      => 1,
    p_round_trip      => false,
    p_waiting_hours   => 0,
    p_distance_km     => 372,
    p_duration_min    => 420,
    p_distance_source => 'osrm',
    p_class_slug      => v_class,
    p_plan            => 'full',
    p_customer_name   => 'عميل اختبار المحطات',
    p_customer_phone  => '01000000599',
    p_customer_whatsapp => null,
    p_pickup_at       => now() + interval '7 days',
    p_notes           => 'MULTI_STOP_TESTS_FIXTURE بمحطة',
    p_stops           => v_stops
  );

  select * into v_b from public.bookings b where b.id = v_row.id;

  -- (و-١) 🔴 المصدر
  if v_b.price_source <> 'tariff' then
    raise exception
      '(و-١) 🔴 حجزٌ بمحطةٍ وسطى سُعِّر «%» — ندفع للمتعهد ثمنَ رحلةٍ قصيرة ويقود أطول',
      v_b.price_source;
  end if;
  if v_b.subcontractor_id is not null or v_b.subcontractor_cost is not null
     or v_b.margin_amount is not null then
    raise exception '(و-١ب) حجزٌ بمحطاتٍ حمل متعهداً أو تكلفةً أو هامشاً';
  end if;

  -- (و-٢) الفارقُ مقيسٌ لا مفترَض: نفسُ الرحلة بلا محطةٍ كلّفت غير هذا
  if v_b.total is not distinct from v_plain then
    raise exception
      '(و-٢) إجمالي الرحلة بمحطةٍ (%) يساوي إجمالي نفسِها بلا محطة — المحطةُ لم تغيّر شيئاً',
      v_b.total;
  end if;

  -- (و-٣) اللقطة: المفتاح موجود، مرتَّب، ومطبَّع على ثلاثة حقولٍ لا أكثر
  if not (v_b.trip ? 'stops') then
    raise exception '(و-٣) مفتاح stops غائبٌ عن لقطة حجزٍ بمحطة';
  end if;
  if jsonb_array_length(v_b.trip -> 'stops') <> 1 then
    raise exception '(و-٣ب) عددُ المحطات في اللقطة % لا ١', jsonb_array_length(v_b.trip -> 'stops');
  end if;

  select array_agg(k order by k) into v_keys
  from jsonb_object_keys(v_b.trip -> 'stops' -> 0) k;

  if v_keys is distinct from array['label', 'lat', 'lng'] then
    raise exception
      '(و-٣ج) 🔴 مفاتيحُ المحطة المخزَّنة % — والمتوقع {label, lat, lng} وحدها. واللقطةُ تخرج إلى anon',
      v_keys;
  end if;
  if (v_b.trip -> 'stops' -> 0) ? 'placeId' then
    raise exception '(و-٣د) 🔴 مفتاحُ طبقة البحث placeId خُزِّن في اللقطة وخرج إلى anon';
  end if;
  if v_b.trip -> 'stops' -> 0 ->> 'label' <> 'محطة الواحة' then
    raise exception '(و-٣هـ) وسمُ المحطة لم يُطهَّر من الفراغات: «%»',
      v_b.trip -> 'stops' -> 0 ->> 'label';
  end if;

  -- (و-٤) و`straightKm` صارت **سلسلةَ الأرجل** لا الوتر
  if public.jsonb_number(v_b.trip, 'straightKm', -1)
     is distinct from public.trip_straight_km(28.5, 29.5, 27.5, 30.5,
                        '[{"label":"محطة الواحة","lat":28.0,"lng":31.8}]'::jsonb) then
    raise exception
      '(و-٤) straightKm في اللقطة (%) ليس مجموعَ الأرجل — حاجزُ D-09 يقيس على وترٍ لا يقوده أحد',
      v_b.trip ->> 'straightKm';
  end if;
  if public.jsonb_number(v_b.trip, 'straightKm', -1)
     <= public.haversine_km(28.5, 29.5, 27.5, 30.5) then
    raise exception '(و-٤ب) straightKm لم يتجاوز الوترَ المباشر — الأرجلُ لم تُجمع';
  end if;

  perform set_config('tours.ms_multi_id', v_b.id::text, false);

  raise notice
    '✔ (و) 🔴 حجزٌ بمحطة — tariff · إجمالي % مقابل % بلا محطة · لقطةٌ بثلاثة مفاتيح · straightKm = الأرجل',
    v_b.total, v_plain;
end;
$$;

-- ----------------------------------------------------------------------------
-- (ز) الرفضُ من `create_booking` — **رمزٌ مستقلٌّ لكل سبب**
--
-- ⚠ والرمزُ هو ما يُقارَن لا مجرّدُ الرفض: حارسٌ واحدٌ عامّ («محطة غير صالحة»)
--   كان سيمرّ من اختبارٍ يسأل «هل رُفض؟» — والشاشةُ حينها لا تعرف ماذا تُصلح.
-- ----------------------------------------------------------------------------
do $$
declare
  v_class  text := current_setting('tours.ms_class', true);
  v_c      record;
  v_hint   text;
  v_state  text;
  v_max    integer := public.max_trip_stops();
  v_over   jsonb;
begin
  -- محطاتٌ صالحةٌ تتجاوز السقف بواحدة — تُبنى من السقف الحيّ لا من رقمٍ محفور
  select jsonb_agg(jsonb_build_object('label', 'محطة ' || g, 'lat', 28.0, 'lng', 31.0 + g * 0.01))
    into v_over
  from generate_series(1, v_max + 1) g;

  for v_c in
    select * from (values
      ('"نصّ"'::jsonb,                                              'stops-not-array',    'نصٌّ بدل مصفوفة'),
      ('[{"lat":28.0,"lng":31.8}]'::jsonb,                          'stop-label-missing', 'محطةٌ بلا وسم'),
      ('[{"label":"م","lat":28.0}]'::jsonb,                         'stop-coords-missing','محطةٌ بلا إحداثيات'),
      ('[{"label":"م","lat":"28.0","lng":"31.8"}]'::jsonb,          'stop-coords-missing','إحداثيتان نصّيّتان'),
      ('[{"label":"دبي","lat":25.197,"lng":55.274}]'::jsonb,        'stop-out-of-area',   'محطةٌ خارج مصر'),
      ('[{"label":"م","lat":1e400,"lng":31.8}]'::jsonb,             'stop-out-of-area',   'إحداثيةٌ غيرُ منتهية'),
      (v_over,                                                      'stops-too-many',     'تجاوزُ السقف بواحدة')
    ) as c(stops, expect, name)
  loop
    v_hint  := null;
    v_state := 'قُبل';
    begin
      perform * from public.create_booking(
        p_origin          => '{"label":"مركز الممرّ","lat":28.5,"lng":29.5}'::jsonb,
        p_destination     => '{"label":"وجهة الممرّ","lat":27.5,"lng":30.5}'::jsonb,
        p_passengers      => 1,
        p_round_trip      => false,
        p_waiting_hours   => 0,
        p_distance_km     => 372,
        p_duration_min    => 420,
        p_distance_source => 'osrm',
        p_class_slug      => v_class,
        p_plan            => 'full',
        p_customer_name   => 'عميل اختبار المحطات',
        p_customer_phone  => '01000000599',
        p_customer_whatsapp => null,
        p_pickup_at       => now() + interval '7 days',
        p_notes           => 'MULTI_STOP_TESTS_FIXTURE رفض',
        p_stops           => v_c.stops
      );
    exception when others then
      v_state := 'رُفض';
      get stacked diagnostics v_hint = pg_exception_hint;
    end;

    if v_state <> 'رُفض' then
      raise exception '(ز) 🔴 «%» قُبلت — والحجزُ نشأ فعلاً على قاعدةٍ حيّة', v_c.name;
    end if;
    if v_hint is distinct from v_c.expect then
      raise exception
        '(ز) «%» رُفضت بالرمز «%» والمتوقع «%» — الشاشةُ لا تعرف ماذا تُصلح',
        v_c.name, coalesce(v_hint, 'بلا رمز'), v_c.expect;
    end if;
  end loop;

  raise notice '✔ (ز) سبعةُ أسبابِ رفضٍ، وستةُ رموزٍ متمايزة — والسقفُ مبنيٌّ من الإعداد الحيّ (%)', v_max;
end;
$$;

-- ----------------------------------------------------------------------------
-- (ح) الحاجزان على الجدول — و**طفرةُ كلٍّ منهما**
--
-- `create_booking` ليست الطريق الوحيد إلى صفِّ حجزٍ في نظر مالك القاعدة ومفتاح
-- الخدمة ومحرّر SQL. ولذلك حاجزان على الجدول نفسه، **ولا يتظالّان**:
--   · القيدُ يمسك **الشكل** (‏`check` — يسري على `COPY` ولا يُعطَّل).
--   · والمُشغّلُ يمسك **السقف** (يقرأ `trip_settings`، و`check` لا تقرأ جدولاً).
--
-- والطفرةُ هي البرهان: يُنزع الحارسُ ⇒ تمرّ الحالةُ الممنوعة ⇒ يُعاد بالتراجع.
-- وحارسٌ لا يحمرّ عند نزعه **كاذبٌ وأخطرُ من غيابه**.
-- ----------------------------------------------------------------------------
do $$
declare
  v_class  text := current_setting('tours.ms_class', true);
  v_bad    constant jsonb := '{"originLabel":"أ","originLat":28.5,"originLng":29.5,'
                          || '"destLabel":"ب","destLat":27.5,"destLng":30.5,"distanceKm":372,'
                          || '"notes":"MULTI_STOP_TESTS_FIXTURE مباشر",'
                          || '"stops":[{"label":"دبي","lat":25.197,"lng":55.274}]}';
  v_state  text;
  v_passed boolean := false;
begin
  -- (ح-١) القيدُ يرفض الشكل
  v_state := 'قُبل';
  begin
    insert into public.bookings
      (status, class_slug, class_title, total, currency, plan, amount_due, amount_remaining,
       customer_name, customer_phone, trip, price_source)
    values ('pending_payment', v_class, 'اختبار', 100, 'EGP', 'full', 100, 0,
            'عميل اختبار المحطات', '01000000599', v_bad::jsonb, 'tariff');
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate;
  end;

  if v_state <> '23514' then
    raise exception
      '(ح-١) محطةٌ خارج مصر أُدرجت مباشرةً وانتهت بـ«%» لا 23514 — القيدُ غائبٌ عن الجدول', v_state;
  end if;

  -- (ح-١ب) 🔴 الطفرة: يُنزع القيد ⇒ **يجب** أن تمرّ ⇒ ثم يُعاد بالتراجع
  begin
    alter table public.bookings drop constraint bookings_trip_stops_shape_chk;

    begin
      insert into public.bookings
        (status, class_slug, class_title, total, currency, plan, amount_due, amount_remaining,
         customer_name, customer_phone, trip, price_source)
      values ('pending_payment', v_class, 'اختبار', 100, 'EGP', 'full', 100, 0,
              'عميل اختبار المحطات', '01000000599', v_bad::jsonb, 'tariff');
      v_passed := true;
    exception when others then
      v_passed := false;
    end;

    raise exception 'MS_PROBE_ROLLBACK';
  exception
    when others then
      if sqlerrm <> 'MS_PROBE_ROLLBACK' then raise; end if;
  end;

  if not v_passed then
    raise exception
      '(ح-١ب) 🔴 بنزع القيد بقي الصفُّ مرفوضاً — إذن ليس القيدُ هو ما يرفض، والتوكيدُ (ح-١) يقيس حارساً آخر';
  end if;

  -- والقيدُ عاد بالتراجع، وإلا لَما كانت هذه المجموعةُ تصلح للتشغيل مرتين
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.bookings'::regclass
      and conname  = 'bookings_trip_stops_shape_chk'
  ) then
    raise exception '(ح-١ج) 🔴 القيدُ لم يعد بعد الطفرة — القاعدةُ الحيّة صارت بلا حارس';
  end if;

  raise notice '✔ (ح-١) قيدُ الشكل حيٌّ ومُثبَتٌ بالطفرة — نزعُه يُمرّر محطةً في دبي';
end;
$$;

do $$
declare
  v_class  text := current_setting('tours.ms_class', true);
  v_max    integer := public.max_trip_stops();
  v_trip   jsonb;
  v_state  text;
  v_hint   text;
  v_passed boolean := false;
begin
  -- لقطةٌ **سليمةُ الشكل تماماً** يتجاوز عددُها السقف — فلا شيء يرفضها إلا المُشغّل
  v_trip := jsonb_build_object(
    'originLabel', 'أ', 'originLat', 28.5, 'originLng', 29.5,
    'destLabel',   'ب', 'destLat',   27.5, 'destLng',   30.5,
    'distanceKm',  372, 'notes', 'MULTI_STOP_TESTS_FIXTURE سقف',
    'stops', (select jsonb_agg(jsonb_build_object(
                       'label', 'محطة ' || g, 'lat', 28.0, 'lng', 31.0 + g * 0.01))
                from generate_series(1, v_max + 1) g)
  );

  -- شاهدٌ إيجابي على الفيكسترة: الشكلُ سليم، فالرفضُ سيكون للعدد وحده
  if public.trip_stops_reject_reason(v_trip) is not null then
    raise exception '(ح-٢) فيكسترةُ السقف مخالفةُ الشكل (%) — فالرفضُ لن يكون للعدد',
      public.trip_stops_reject_reason(v_trip);
  end if;

  v_state := 'قُبل';
  begin
    insert into public.bookings
      (status, class_slug, class_title, total, currency, plan, amount_due, amount_remaining,
       customer_name, customer_phone, trip, price_source)
    values ('pending_payment', v_class, 'اختبار', 100, 'EGP', 'full', 100, 0,
            'عميل اختبار المحطات', '01000000599', v_trip, 'tariff');
  exception when others then
    v_state := 'رُفض';
    get stacked diagnostics v_hint = pg_exception_hint;
  end;

  if v_state <> 'رُفض' then
    raise exception '(ح-٢) % محطةً أُدرجت مباشرةً والسقفُ % — المُشغّل لا يعمل', v_max + 1, v_max;
  end if;
  if v_hint is distinct from 'stops-too-many' then
    raise exception '(ح-٢) رُفض بالرمز «%» لا «stops-too-many»', coalesce(v_hint, 'بلا رمز');
  end if;

  -- (ح-٢ب) 🔴 الطفرة: يُعطَّل المُشغّل ⇒ **يجب** أن تمرّ ⇒ ثم يُعاد بالتراجع
  begin
    alter table public.bookings disable trigger bookings_guard_trip_stops;

    begin
      insert into public.bookings
        (status, class_slug, class_title, total, currency, plan, amount_due, amount_remaining,
         customer_name, customer_phone, trip, price_source)
      values ('pending_payment', v_class, 'اختبار', 100, 'EGP', 'full', 100, 0,
              'عميل اختبار المحطات', '01000000599', v_trip, 'tariff');
      v_passed := true;
    exception when others then
      v_passed := false;
    end;

    raise exception 'MS_PROBE_ROLLBACK';
  exception
    when others then
      if sqlerrm <> 'MS_PROBE_ROLLBACK' then raise; end if;
  end;

  if not v_passed then
    raise exception
      '(ح-٢ب) 🔴 بتعطيل المُشغّل بقي الصفُّ مرفوضاً — إذن ليس المُشغّلُ هو ما يفرض السقف';
  end if;

  -- (ح-٣) والسقفُ **يُقرأ من الإعداد** لا رقمٌ محفور: يُحرَّك فيتحرك السلوك
  update public.trip_settings set max_trip_stops = 1 where id;

  v_state := 'قُبل';
  begin
    insert into public.bookings
      (status, class_slug, class_title, total, currency, plan, amount_due, amount_remaining,
       customer_name, customer_phone, trip, price_source)
    values ('pending_payment', v_class, 'اختبار', 100, 'EGP', 'full', 100, 0,
            'عميل اختبار المحطات', '01000000599',
            jsonb_set(v_trip, '{stops}', '[{"label":"م١","lat":28.0,"lng":31.0},
                                           {"label":"م٢","lat":28.1,"lng":31.1}]'::jsonb),
            'tariff');
  exception when others then
    v_state := 'رُفض';
  end;
  if v_state <> 'رُفض' then
    raise exception '(ح-٣) بسقفٍ = ١ مرّت محطتان — الرقمُ لا يُقرأ من الإعداد';
  end if;

  update public.trip_settings set max_trip_stops = 5 where id;

  v_state := 'قُبل';
  begin
    insert into public.bookings
      (status, class_slug, class_title, total, currency, plan, amount_due, amount_remaining,
       customer_name, customer_phone, trip, price_source)
    values ('pending_payment', v_class, 'اختبار', 100, 'EGP', 'full', 100, 0,
            'عميل اختبار المحطات', '01000000599',
            jsonb_set(v_trip, '{stops}', '[{"label":"م١","lat":28.0,"lng":31.0},
                                           {"label":"م٢","lat":28.1,"lng":31.1}]'::jsonb),
            'tariff');
  exception when others then
    v_state := 'رُفض';
    get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if v_state <> 'قُبل' then
    raise exception '(ح-٣ب) بسقفٍ = ٥ رُفضت محطتان (%) — السقفُ يرفض ما يسمح به المالك',
      coalesce(v_hint, 'بلا رمز');
  end if;

  update public.trip_settings
     set max_trip_stops = current_setting('tours.ms_maxstops', true)::integer where id;

  raise notice '✔ (ح-٢/ح-٣) مُشغّلُ السقف حيٌّ ومُثبَتٌ بالطفرة، والرقمُ يُقرأ من trip_settings لا من الكود';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ط) المتعهد يرى المحطات — ومعمّاةً قبل القبول، ولا يرى ما ليس له
--
-- ثلاثةُ أوجه:
--   (ط-١) **بنيويّ**: `portal_offers` لم تكتسب عمود عميلٍ ولا سعرٍ بعد إعادة
--         إنشائها (D-19). والإسقاطُ يمحو كلَّ شيء، فالعقدُ يُعاد قياسه لا يُفترض.
--   (ط-٢) **قبل القبول**: وسمُ المحطة معمّى ولا `lat` ولا `lng` في الكائن أصلاً.
--   (ط-٣) **بعد الإسناد**: المحطة كاملةٌ بإحداثياتها (يقود إليها فعلاً)،
--         ومتعهدٌ آخر يرى صفراً.
-- ----------------------------------------------------------------------------
do $$
declare
  v_ident  text := current_setting('tours.ms_identities', true);
  v_class  text := current_setting('tours.ms_class', true);
  v_sub    constant uuid := '5f000000-0000-4000-8000-000000000001';
  v_sub2   constant uuid := '5f000000-0000-4000-8000-000000000002';
  v_prof   constant uuid := '5f200000-0000-4000-8000-000000000001';
  v_prof2  constant uuid := '5f200000-0000-4000-8000-000000000002';
  v_leak   text;
  v_b_off  uuid;
  v_b_trip uuid;
  v_trip   jsonb;
  v_row    record;
  v_n      integer;
  v_keys   text[];
begin
  -- (ط-١) العقدُ البنيويّ — يُقاس أولاً لأنه لا يحتاج هوية
  if not exists (
    select 1 from pg_proc p,
         unnest(p.proargnames, p.proargmodes) as a(argname, argmode)
    where p.oid = 'public.portal_offers()'::regprocedure
      and a.argmode in ('o', 't') and a.argname = 'stops'
  ) then
    raise exception '(ط-١) portal_offers لا تُرجع عمود stops — المتعهد يقبل رحلةً لا يعرف مسارها';
  end if;
  if not exists (
    select 1 from pg_proc p,
         unnest(p.proargnames, p.proargmodes) as a(argname, argmode)
    where p.oid = 'public.portal_trips()'::regprocedure
      and a.argmode in ('o', 't') and a.argname = 'stops'
  ) then
    raise exception '(ط-١) portal_trips لا تُرجع عمود stops — المتعهد لا يعرف إلى أين يمرّ';
  end if;

  select string_agg(a.argname, '، ') into v_leak
  from pg_proc p,
       unnest(p.proargnames, p.proargmodes) as a(argname, argmode)
  where p.oid = 'public.portal_offers()'::regprocedure
    and a.argmode in ('o', 't')
    and (a.argname ilike '%customer%'
      or a.argname in ('total', 'margin_amount', 'subcontractor_cost', 'phone', 'whatsapp',
                       'booking_id', 'origin_lat', 'origin_lng', 'dest_lat', 'dest_lng'));
  if v_leak is not null then
    raise exception '(ط-١ب) 🔴 portal_offers اكتسبت عموداً ممنوعاً بعد إعادة إنشائها (%)', v_leak;
  end if;

  if v_ident is distinct from '1' then
    raise notice '  ↳ (ط-٢/ط-٣) تخطٍّ: بلا هوية دخول';
    return;
  end if;

  -- ── الفيكسترة: حجزٌ معروضٌ وحجزٌ مُسنَد، كلاهما بمحطةٍ **وسمُها يحمل رقماً**
  --    (‏«شارع 9» ⇒ `dispatch_public_label` تُسقط المقطع الحامل للرقم)
  v_trip := jsonb_build_object(
    'originLabel', 'مركز الممرّ 12', 'originLat', 28.5, 'originLng', 29.5,
    'destLabel',   'وجهة الممرّ',    'destLat',   27.5, 'destLng',   30.5,
    'distanceKm',  372, 'passengers', 1, 'roundTrip', false, 'waitingHours', 0,
    'pickupAt', (now() + interval '7 days')::text,
    'notes', 'MULTI_STOP_TESTS_FIXTURE بورتال',
    'stops', '[{"label":"شارع 9، المعادي","lat":28.0,"lng":31.8}]'::jsonb
  );

  insert into public.bookings
    (status, class_slug, class_title, total, currency, plan, amount_due, amount_remaining,
     customer_name, customer_phone, trip, price_source)
  values ('confirmed', v_class, 'اختبار', 3000, 'EGP', 'full', 3000, 0,
          'عميل اختبار المحطات', '01000000599', v_trip, 'tariff')
  returning id into v_b_off;

  insert into public.bookings
    (status, class_slug, class_title, total, currency, plan, amount_due, amount_remaining,
     customer_name, customer_phone, trip, price_source)
  values ('assigned', v_class, 'اختبار', 3000, 'EGP', 'full', 3000, 0,
          'عميل اختبار المحطات', '01000000599', v_trip, 'tariff')
  returning id into v_b_trip;

  insert into public.dispatches (booking_id, status, round, last_broadcast_at)
  values (v_b_off, 'broadcasting', 1, now());

  insert into public.trip_offers (booking_id, subcontractor_id, round, payout, status, expires_at)
  values (v_b_off, v_sub, 1, 1500, 'pending', now() + interval '30 minutes');

  insert into public.dispatches
    (booking_id, status, round, assigned_subcontractor_id, assigned_at, assigned_payout)
  values (v_b_trip, 'assigned', 1, v_sub, now(), 1500);

  -- ── (ط-٢) بهوية المتعهد: العرضُ قبل القبول ──────────────────────────────
  perform set_config('request.jwt.claim.sub', v_prof::text, false);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_prof)::text, false);

  select count(*) into v_n from public.portal_offers() o where o.reference is not null;
  if v_n <> 1 then
    raise exception '(ط-٢) portal_offers أرجعت % صفاً — المتوقع ١', v_n;
  end if;

  select * into v_row from public.portal_offers();

  if jsonb_typeof(v_row.stops) <> 'array' or jsonb_array_length(v_row.stops) <> 1 then
    raise exception '(ط-٢ب) العرضُ لا يحمل محطةً واحدة بل «%»', v_row.stops;
  end if;

  select array_agg(k order by k) into v_keys from jsonb_object_keys(v_row.stops -> 0) k;
  if v_keys is distinct from array['label'] then
    raise exception
      '(ط-٢ج) 🔴 محطةُ العرض تحمل % — والمتوقع الوسمَ وحده. إحداثيةُ محطةٍ تكشف حيَّ العميل قبل القبول (D-19)',
      v_keys;
  end if;

  if (v_row.stops -> 0 ->> 'label') ~ '[0-9٠-٩]' then
    raise exception
      '(ط-٢د) 🔴 وسمُ المحطة في العرض يحمل رقماً («%») — العنوانُ الدقيق يتسرّب قبل القبول',
      v_row.stops -> 0 ->> 'label';
  end if;
  if (v_row.stops -> 0 ->> 'label') is not distinct from 'شارع 9، المعادي' then
    raise exception '(ط-٢هـ) وسمُ المحطة عاد خاماً كما هو — dispatch_public_label لم تُنادَ';
  end if;
  if nullif(btrim(coalesce(v_row.stops -> 0 ->> 'label', '')), '') is null then
    raise exception '(ط-٢و) وسمُ المحطة اختفى كلياً — التعميةُ ابتلعت المعلومة بدل أن تعمّيها';
  end if;

  -- ── (ط-٣) وبعد الإسناد: كاملةً بإحداثياتها ──────────────────────────────
  select count(*) into v_n from public.portal_trips();
  if v_n <> 1 then
    raise exception '(ط-٣) portal_trips أرجعت % صفاً — المتوقع ١', v_n;
  end if;

  select * into v_row from public.portal_trips();

  select array_agg(k order by k) into v_keys from jsonb_object_keys(v_row.stops -> 0) k;
  if v_keys is distinct from array['label', 'lat', 'lng'] then
    raise exception '(ط-٣ب) محطةُ الرحلة المُسنَدة تحمل % — والمتعهد يقود إليها فعلاً', v_keys;
  end if;
  if (v_row.stops -> 0 ->> 'lat')::numeric is distinct from 28.0
     or (v_row.stops -> 0 ->> 'lng')::numeric is distinct from 31.8 then
    raise exception '(ط-٣ج) إحداثياتُ المحطة المُسنَدة (%، %) لا تطابق اللقطة',
      v_row.stops -> 0 ->> 'lat', v_row.stops -> 0 ->> 'lng';
  end if;

  -- ── (ط-٤) والعزل: متعهدٌ آخر لا يرى شيئاً ───────────────────────────────
  perform set_config('request.jwt.claim.sub', v_prof2::text, false);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_prof2)::text, false);

  select count(*) into v_n from public.portal_offers();
  if v_n <> 0 then
    raise exception '(ط-٤) 🔴 متعهدٌ آخر رأى % عرضاً ليس له (D-20)', v_n;
  end if;
  select count(*) into v_n from public.portal_trips();
  if v_n <> 0 then
    raise exception '(ط-٤ب) 🔴 متعهدٌ آخر رأى % رحلةً ليست له (D-20)', v_n;
  end if;

  -- ── (ط-٥) وبلا هوية: صفرُ صفوف لا خطأ ───────────────────────────────────
  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claims', '', false);

  select count(*) into v_n from public.portal_offers();
  if v_n <> 0 then
    raise exception '(ط-٥) بلا هويةٍ عادت % عرضاً', v_n;
  end if;

  raise notice '✔ (ط) المتعهد يرى المحطات — معمّاةً بلا إحداثيات قبل القبول، وكاملةً بعد الإسناد، ولا يراها غيرُه';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ي) المنح — الإسقاطُ يمحو `revoke` و`grant` معاً، فيُقاس الطرفان
-- ----------------------------------------------------------------------------
do $$
declare
  v_qp constant text :=
    'public.quote_price(numeric,integer,boolean,numeric,numeric,numeric,numeric,numeric,integer,jsonb)';
  v_qpub constant text :=
    'public.quote_public(numeric,integer,boolean,numeric,numeric,numeric,numeric,numeric,text,integer,jsonb,jsonb)';
  v_cb constant text :=
    'public.create_booking(jsonb,jsonb,integer,boolean,numeric,numeric,numeric,text,text,text,text,text,text,timestamptz,text,text,timestamptz,integer,jsonb,integer,text,jsonb)';
  v_pub integer;
begin
  -- (ي-١) ما يجب أن يبقى مغلقاً — وquote_price تحمل التكلفة والهامش (D-20)
  if has_function_privilege('anon', v_qp, 'execute')
     or has_function_privilege('authenticated', v_qp, 'execute') then
    raise exception '(ي-١) 🔴 quote_price متاحةٌ لدورٍ عام — متعهدٌ يقرأ تكاليفَ منافسيه';
  end if;
  if has_function_privilege('anon', v_cb, 'execute')
     or has_function_privilege('authenticated', v_cb, 'execute') then
    raise exception '(ي-١ب) 🔴 create_booking متاحةٌ لدورٍ عام (D-09)';
  end if;
  if has_function_privilege('anon', 'public.portal_trips()', 'execute')
     or has_function_privilege('anon', 'public.portal_offers()', 'execute') then
    raise exception '(ي-١ج) دالةُ بورتالٍ متاحةٌ لـanon';
  end if;
  if has_function_privilege('authenticated', 'public.trip_stops_full(jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public.trip_stops_public(jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public.max_trip_stops()', 'execute')
     or has_function_privilege('authenticated',
          'public.trip_straight_km(numeric,numeric,numeric,numeric,jsonb)', 'execute') then
    raise exception '(ي-١د) دالةٌ مساعدةٌ من 0140 انفتحت لـauthenticated';
  end if;

  -- (ي-٢) وما يجب أن يبقى **مفتوحاً**: الإسقاط يمحو المنح، والسكوت يكسر الموقع
  if not has_function_privilege('anon', v_qpub, 'execute') then
    raise exception '(ي-٢) 🔴 quote_public لم تعد متاحةً لـanon — الموقعُ لا يسعّر';
  end if;
  if not has_function_privilege('authenticated', 'public.portal_trips()', 'execute')
     or not has_function_privilege('authenticated', 'public.portal_offers()', 'execute') then
    raise exception '(ي-٢ب) دوالُّ البورتال لم تعد متاحةً للمتعهد';
  end if;
  if not has_function_privilege('service_role', v_cb, 'execute') then
    raise exception '(ي-٢ج) create_booking لم تعد متاحةً لـservice_role';
  end if;

  -- (ي-٣) 🔴 ودالّتا القيد **يجب** أن تبقيا مفتوحتين: تعبيرُ `check` يُقيَّم
  --       بصلاحيات الكاتب، واللوحة تُحدّث `bookings` بدور `authenticated`.
  if not has_function_privilege('authenticated', 'public.trip_stops_reject_reason(jsonb)', 'execute')
     or not has_function_privilege('authenticated',
          'public.point_in_service_area(numeric,numeric)', 'execute') then
    raise exception
      '(ي-٣) 🔴 دالّةُ قيدٍ سُحبت من authenticated — أولُ تعديلِ حجزٍ من اللوحة سيُرفض بـpermission denied';
  end if;

  -- (ي-٤) ولا منحةَ PUBLIC ضمنية على ما يحمل أرقاماً داخلية
  --
  -- 🔴 و`bookings_guard_trip_stops` **منها** منذ 0141: أُنشئت في 0140 بلا كتلة
  --    revoke فورثت منحةَ Postgres الافتراضية لـPUBLIC وهي `security definer`.
  --    وهذه القائمةُ كانت تُغفلها فمرّت خضراء — والقائمةُ التي لا تذكر اسماً
  --    لا تحرسه. (‏سابقةُ `trip_completion_gate` في `STANDING-ORDERS §٢د`.)
  --
  -- ⚠ ولا تُستثنى `point_in_service_area` و`trip_stops_reject_reason` سهواً:
  --   منحتُهما لـPUBLIC **مقصودةٌ ومقيسة** (تعبيرُ `check` يُقيَّم بصلاحيات
  --   الكاتب، و(ي-٣) أعلاه يحرس بقاءهما مفتوحتين)، وهما `security invoker`
  --   بلا قراءةٍ من أي جدول.
  select count(*) into v_pub
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  cross join lateral unnest(coalesce(p.proacl, '{}'::aclitem[])) a(item)
  where n.nspname = 'public'
    and p.proname in ('quote_price', 'quote_public', 'create_booking',
                      'portal_trips', 'portal_offers',
                      'max_trip_stops', 'trip_stops_full', 'trip_stops_public',
                      'trip_straight_km', 'bookings_guard_trip_stops')
    and a.item::text like '=%';
  if v_pub > 0 then
    raise exception '(ي-٤) % منحةَ PUBLIC ضمنية على دوالِّ 0140', v_pub;
  end if;

  -- (ي-٥) ودالةُ المُشغّل مغلقةٌ على أدوار المتصفح صراحةً — لا بالعدّ وحده
  if has_function_privilege('anon', 'public.bookings_guard_trip_stops()', 'execute')
     or has_function_privilege('authenticated', 'public.bookings_guard_trip_stops()', 'execute') then
    raise exception
      '(ي-٥) 🔴 دالةُ مُشغّلٍ security definer متاحةٌ لدورِ متصفّح — 0141 نُقضت';
  end if;

  raise notice '✔ (ي) المنحُ سليم — ما أُغلق مغلق، وما كان مفتوحاً بقي، ولا PUBLIC ضمنية';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ل) 0141 — مدى `max_trip_stops` لا يتجاوز ما يقبله المسار العام
--
-- 🔴 السببُ مقيس: `MAX_TRIP_STOPS = 5` في `lib/booking-types.ts` يفرضه
--    `parseStops` في `/api/quote` و`/api/booking` **قبل** أن تبلغ المحطاتُ
--    القاعدة. فسقفٌ في الإعدادات فوق ٥ يجعل الحاسبةَ تعرض صفَّ محطةٍ سادساً
--    (سقفُها من القاعدة عبر `getStopsCap()`) ثم يردّ `/api/quote` بـ400 —
--    إعدادٌ نصفُ مداه مكسور (النمط ٨).
--
-- والتجربةُ كلُّها في **معاملةٍ فرعية تُرجَع**: على `trip_settings` مُشغّلا
-- `log_audit` و`touch_updated_at`، فإعادةُ الرقم وحدَه تترك أثراً في بيانات
-- المالك. والمتغيّراتُ المحلية تنجو من الإرجاع.
-- ----------------------------------------------------------------------------
do $$
declare
  v_saved integer;
  v_ok5   boolean := false;
  v_ok6   boolean := false;
begin
  select t.max_trip_stops into v_saved from public.trip_settings t where t.id limit 1;

  begin
    begin
      update public.trip_settings set max_trip_stops = 5 where id;
      v_ok5 := true;
    exception when check_violation then v_ok5 := false;
    end;

    begin
      update public.trip_settings set max_trip_stops = 6 where id;
      v_ok6 := true;
    exception when check_violation then v_ok6 := false;
    end;

    raise exception 'MS_CAP_PROBE_ROLLBACK';
  exception when others then
    if sqlerrm <> 'MS_CAP_PROBE_ROLLBACK' then raise; end if;
  end;

  if not v_ok5 then
    raise exception '(ل-١) القيدُ يرفض ٥ — وهي الحدُّ الذي يقبله /api/quote فعلاً';
  end if;
  if v_ok6 then
    raise exception
      '(ل-٢) 🔴 القيدُ يقبل ٦ — المالكُ يستطيع ضبطَ سقفٍ تعرضه الحاسبة ويرفضه /api/quote بـ400';
  end if;
  if (select t.max_trip_stops from public.trip_settings t where t.id limit 1)
     is distinct from v_saved then
    raise exception '(ل-٣) 🔴 لم تُرجَع قيمةُ المالك الأصلية (%) بعد التجربة', v_saved;
  end if;

  raise notice '✔ (ل) مدى سقف المحطات ٠…٥ — يطابق الحدَّ الصلب في MAX_TRIP_STOPS، وقيمةُ المالك (%) سليمة', v_saved;
end;
$$;

-- ----------------------------------------------------------------------------
-- (م) 🔴 0142 — فيكسترةٌ **معكوسةُ الاتجاه الاقتصادي**
--
-- ممرٌّ **قصيرٌ** (نحو ٢١ كم) مغطّى بقائمةٍ معتمدة تكلفتُها تجعل سعرَ المتعهد
-- **أعلى** من تعريفة الأرجل — عكسُ فيكسترة (٠-ب) تماماً. وهذه هي الحالةُ التي
-- كان العيبُ يعيش فيها، والتي أخفتها المجموعةُ القائمة.
--
-- 🔴 **والتكلفةُ تُشتقّ من المحرّك لا تُحفَر**: تُقاس تعريفةُ الأرجل في
--    الحالتين (المنتصف والانحراف)، ثم تُختار تكلفةٌ تقع سعرُها **بينهما**:
--      · فوق تعريفة رحلةِ المنتصف ⇒ الأرضيةُ **تمسك** هناك.
--      · ودون تعريفة رحلةِ الانحراف ⇒ الأرضيةُ **لا تمسك** هناك.
--    فالفيكسترةُ الواحدة تُنتج الحالتين المتضادّتين، ولا تنكسر بتغيير تعريفةٍ
--    من اللوحة. وإن تعذّر ذلك (تعريفةٌ مسطّحة) **يُرفع استثناء** لا يُتخطّى:
--    فيكسترةٌ لا تُظهر الاتجاه أسوأُ من غيابها (وهو درسُ (٠-ب) نفسِه).
--
-- ⚠ وخلوُّ الممرّ **يُقاس** بالاتجاهين قبل زرع القائمة، وإلا خالطت تغطيةُ
--   المالك الحقيقيةُ الفيكسترةَ وصارت الأرقامُ غيرَ منسوبة.
-- ----------------------------------------------------------------------------
do $$
declare
  v_class  text := current_setting('tours.ms_class', true);
  v_sub3   constant uuid := '5f000000-0000-4000-8000-000000000003';
  v_list3  constant uuid := '5f100000-0000-4000-8000-000000000003';
  v_mid    constant jsonb := '[{"label":"منتصف الطريق","lat":26.0,"lng":28.1}]'::jsonb;
  v_det    constant jsonb := '[{"label":"انحراف شمالي","lat":27.0,"lng":28.1}]'::jsonb;
  v_km_mid numeric;
  v_km_det numeric;
  v_t_mid  numeric;
  v_t_det  numeric;
  v_cost   numeric;
  v_plain  numeric;
  v_n      integer;
begin
  select (select count(*) from public.coverage_matches(26.0, 28.0, 26.0, 28.2))
       + (select count(*) from public.coverage_matches(26.0, 28.2, 26.0, 28.0))
    into v_n;
  if v_n <> 0 then
    raise exception
      '(م-٠) الممرُّ القصير لم يعد خالياً (% مطابقة) — اختر ممرّاً آخر ولا تُضعف التوكيدات', v_n;
  end if;

  -- المسافةُ الطرقيّة تُشتقّ من السلسلة نفسِها ×١٫٠٥، فتجتاز حاجزَ D-09
  -- (‏٠٫٩× … ٣×) في الحالتين بلا رقمٍ محفور.
  v_km_mid := round(public.trip_straight_km(26.0, 28.0, 26.0, 28.2, v_mid) * 1.05, 3);
  v_km_det := round(public.trip_straight_km(26.0, 28.0, 26.0, 28.2, v_det) * 1.05, 3);

  -- تعريفةُ الأرجل المحضة: بلا إحداثيات ⇒ بلا تغطية (المسارُ القائم منذ 0012)
  select q.total into v_t_mid
  from public.quote_price(v_km_mid, 1, false, 0, null, null, null, null, 0, null) q
  where q.class_slug = v_class;
  select q.total into v_t_det
  from public.quote_price(v_km_det, 1, false, 0, null, null, null, null, 0, null) q
  where q.class_slug = v_class;

  if v_t_mid is null or v_t_det is null then
    raise exception '(م-١) المحرّك لم يُسعّر الفئة «%» — الفيكسترة معطوبة', v_class;
  end if;
  if v_t_det <= v_t_mid then
    raise exception
      '(م-١ب) تعريفةُ رحلةِ الانحراف (%) ليست أعلى من تعريفة رحلةِ المنتصف (%) — لا حالتين متضادّتين',
      v_t_det, v_t_mid;
  end if;

  -- ‏(‏سعرُ المتعهد = تكلفة + أكبرِ (٢٠٪ · ١٠٠) — إعداداتٌ مجمَّدة في (٠))
  v_cost := round((v_t_mid + v_t_det) / 2 / 1.2);

  insert into public.subcontractors (id, company_name, phone, status)
  values (v_sub3, 'MULTI_STOP_TESTS متعهد الممرّ القصير', '01000000503', 'approved');

  insert into public.subcontractor_vehicles (subcontractor_id, class_slug, label, active)
  values (v_sub3, v_class, 'مركبة الممرّ القصير', true);

  insert into public.price_lists
    (id, subcontractor_id, title, origin_label, origin_lat, origin_lng, origin_radius_km,
     dest_label, dest_lat, dest_lng, dest_radius_km, bidirectional, status)
  values
    (v_list3, v_sub3, 'MS قائمة الممرّ القصير', 'بداية القصير', 26.000000, 28.000000, 30,
     'نهاية القصير', 26.000000, 28.200000, 30, false, 'draft');

  insert into public.price_list_items (price_list_id, class_slug, cost)
  values (v_list3, v_class, v_cost);

  update public.price_lists set status = 'approved' where id = v_list3;

  -- 🔴 الشاهدُ الذي يجعل كلَّ ما بعده ذا معنى: سعرُ المتعهد **أعلى** من تعريفة
  --    رحلةِ المنتصف، **وأدنى** من تعريفة رحلةِ الانحراف. ولولاه لكان (ن) يثبت
  --    تساوياً بلا سبب.
  perform set_config('tours.pricing_internals', 'on', true);
  select q.total into v_plain
  from public.quote_price(v_km_mid, 1, false, 0, 26.0, 28.0, 26.0, 28.2, 0, null) q
  where q.class_slug = v_class;
  perform set_config('tours.pricing_internals', '', true);

  if v_plain is null then
    raise exception '(م-٢) الممرُّ القصير لم يُسعَّر أصلاً — القائمةُ لم تُعتمد؟';
  end if;
  if v_plain <= v_t_mid then
    raise exception
      '(م-٢ب) 🔴 سعرُ المتعهد (%) ليس أعلى من تعريفة الأرجل (%) — الفيكسترةُ تُخفي الاتجاه الاقتصادي كما أخفته (٠-ب)',
      v_plain, v_t_mid;
  end if;
  if v_plain >= v_t_det then
    raise exception
      '(م-٢ج) سعرُ المتعهد (%) ليس أدنى من تعريفة رحلةِ الانحراف (%) — تسقط حالةُ «الأرضيةُ لا تمسك»',
      v_plain, v_t_det;
  end if;

  perform set_config('tours.ms_cost3',   v_cost::text,   false);
  perform set_config('tours.ms_kmmid',   v_km_mid::text, false);
  perform set_config('tours.ms_kmdet',   v_km_det::text, false);
  perform set_config('tours.ms_tarmid',  v_t_mid::text,  false);
  perform set_config('tours.ms_tardet',  v_t_det::text,  false);
  perform set_config('tours.ms_plain3',  v_plain::text,  false);

  raise notice
    '✔ (م) فيكسترةٌ معكوسة — ممرٌّ % كم بتكلفة % ⇒ سعرُ متعهدٍ % **فوق** تعريفة الأرجل % و**دون** تعريفة الانحراف %',
    v_km_mid, v_cost, v_plain, v_t_mid, v_t_det;
end;
$$;

-- ----------------------------------------------------------------------------
-- (ن) 🔴 0142 — الحالاتُ الأربع للأرضية، وطفرةُ نزعها
--
--   (ن-١) محطةٌ في **منتصف الطريق** (طولٌ إضافيّ ≈ صفر)
--         ⇒ الإجمالي = إجماليُّ المباشر **بالضبط**، لا تقريباً.
--   (ن-٢) **انحرافٌ حقيقيّ** (تعريفةُ الأرجل > المباشر)
--         ⇒ الإجمالي = تعريفةُ الأرجل بالضبط — الأرضيةُ لا تبلغ.
--   (ن-٣) ممرٌّ **غيرُ مغطّى** + محطات ⇒ لا شيء يتغيّر — لا أرضيةَ من عدم.
--   (ن-٤) و`price_source` تبقى `tariff` بلا متعهدٍ ولا تكلفةٍ ولا هامش:
--         الأرضيةُ **حدٌّ أدنى للإجمالي** لا عودةٌ إلى قوائم المتعهدين (0140).
--   (ن-٥) 🔴 **الطفرة**: يُنزع شرطُ الأرضية من جسم `quote_price` الحيّ ⇒
--         **يجب** أن يهبط (ن-١) إلى تعريفة الأرجل ⇒ ثم يعود الجسمُ بالتراجع.
--
-- ⚠ **والطفرةُ تُحرّر النصَّ بمرساةٍ دلاليّة قصيرة** (`dr.total > l.total`).
--   فإن لم تُوجد لم تُنفَّذ الطفرةُ **ويُرفع استثناء صريح**: شاهدٌ لا يمكن
--   إثباتُه بالطفرة يُعلن ذلك ولا يمرّ أخضرَ صامتاً. ومن أعاد كتابة المقارنة
--   بصيغةٍ أخرى فعليه تحديثُ المرساة — وهو تنبيهٌ مقصود لا هشاشة.
-- ----------------------------------------------------------------------------
do $$
declare
  v_class   text    := current_setting('tours.ms_class', true);
  v_km_mid  numeric := current_setting('tours.ms_kmmid',  true)::numeric;
  v_km_det  numeric := current_setting('tours.ms_kmdet',  true)::numeric;
  v_t_mid   numeric := current_setting('tours.ms_tarmid', true)::numeric;
  v_t_det   numeric := current_setting('tours.ms_tardet', true)::numeric;
  v_plain   numeric := current_setting('tours.ms_plain3', true)::numeric;
  v_mid     constant jsonb := '[{"label":"منتصف الطريق","lat":26.0,"lng":28.1}]'::jsonb;
  v_det     constant jsonb := '[{"label":"انحراف شمالي","lat":27.0,"lng":28.1}]'::jsonb;
  v_sig     constant text  :=
    'public.quote_price(numeric,integer,boolean,numeric,numeric,numeric,numeric,numeric,integer,jsonb)';
  v_rm      record;
  v_rd      record;
  v_free_a  numeric;
  v_free_b  numeric;
  v_free_s  text;
  v_def     text;
  v_mut     text;
  v_probe   numeric;
begin
  perform set_config('tours.pricing_internals', 'on', true);

  select * into v_rm
  from public.quote_price(v_km_mid, 1, false, 0, 26.0, 28.0, 26.0, 28.2, 0, v_mid) q
  where q.class_slug = v_class;

  select * into v_rd
  from public.quote_price(v_km_det, 1, false, 0, 26.0, 28.0, 26.0, 28.2, 0, v_det) q
  where q.class_slug = v_class;

  perform set_config('tours.pricing_internals', '', true);

  -- (ن-١) محطةٌ في المنتصف ⇒ **مبلغُ المباشر بالضبط**
  if v_rm.total is distinct from v_plain then
    raise exception
      '(ن-١) 🔴 محطةٌ في منتصف الطريق أعطت % والمباشرُ % — الأرضيةُ لا تُساوي بينهما',
      v_rm.total, v_plain;
  end if;
  -- وهي **رفعتها فعلاً**: تعريفةُ الأرجل وحدها كانت ستعطي رقماً أقلّ
  if v_rm.total <= v_t_mid then
    raise exception
      '(ن-١ب) الإجمالي (%) ليس فوق تعريفة الأرجل (%) — الأرضيةُ لم ترفع شيئاً، والتوكيدُ أعلاه بلا أسنان',
      v_rm.total, v_t_mid;
  end if;

  -- (ن-٢) انحرافٌ حقيقيّ ⇒ **تعريفةُ الأرجل**، والأرضيةُ لا تبلغ
  if v_rd.total is distinct from v_t_det then
    raise exception
      '(ن-٢) 🔴 رحلةُ الانحراف أعطت % وتعريفةُ الأرجل % — الأرضيةُ سقفٌ لا أرضية',
      v_rd.total, v_t_det;
  end if;
  if v_rd.total <= v_plain then
    raise exception
      '(ن-٢ب) رحلةُ الانحراف (%) ليست فوق مبلغ المباشر (%) — الفيكسترةُ لا تفرّق بين الحالتين',
      v_rd.total, v_plain;
  end if;

  -- (ن-٣) ممرٌّ **غيرُ مغطّى** ⇒ لا أرضيةَ تُخترع من عدم
  select q.total, q.price_source into v_free_a, v_free_s
  from public.quote_price(200, 1, false, 0, 24.0, 33.0, 23.5, 33.5, 0, null) q
  where q.class_slug = v_class;

  select q.total into v_free_b
  from public.quote_price(200, 1, false, 0, 24.0, 33.0, 23.5, 33.5, 0,
        '[{"label":"محطة صحراوية","lat":23.8,"lng":33.2}]'::jsonb) q
  where q.class_slug = v_class;

  if v_free_s <> 'tariff' then
    raise exception '(ن-٣) الممرُّ الصحراويّ الثاني صار مغطّى («%») — اختر ممرّاً خالياً', v_free_s;
  end if;
  if v_free_b is distinct from v_free_a then
    raise exception
      '(ن-٣ب) 🔴 على ممرٍّ بلا تغطية اختلف الإجمالي بمحطة (%) عنه بلا محطة (%) — الأرضيةُ تخترع رقماً',
      v_free_b, v_free_a;
  end if;

  -- (ن-٤) والأرضيةُ لا تُعيد الرحلةَ إلى قوائم المتعهدين (قرارُ 0140 قائم)
  if v_rm.price_source <> 'tariff' or v_rd.price_source <> 'tariff' then
    raise exception
      '(ن-٤) 🔴 رحلةٌ بمحطاتٍ سُعِّرت «%»/«%» — الأرضيةُ حدٌّ أدنى للإجمالي لا مصدرُ تسعير',
      v_rm.price_source, v_rd.price_source;
  end if;
  if v_rm.subcontractor_id is not null or v_rm.subcontractor_cost is not null
     or v_rm.margin_amount is not null then
    raise exception
      '(ن-٤ب) 🔴 رحلةٌ أُرضيت حملت متعهداً (%) أو تكلفةً (%) أو هامشاً (%) — يُطلب منه ما لم يسعّره',
      v_rm.subcontractor_id, v_rm.subcontractor_cost, v_rm.margin_amount;
  end if;

  -- (ن-٥) 🔴 الطفرة — تُنزع الأرضيةُ من الجسم الحيّ فيهبط الرقم
  v_def := pg_get_functiondef(v_sig::regprocedure);
  v_mut := replace(v_def, 'dr.total > l.total', 'false');

  if v_mut = v_def then
    raise exception
      '(ن-٥) 🔴 مرساةُ الطفرة «dr.total > l.total» غائبةٌ عن جسم quote_price — لا يمكن إثباتُ الأرضية بالطفرة. من أعاد صياغتها فليُحدّث المرساة أو يُثبت الحارسَ بطريقٍ آخر';
  end if;

  begin
    execute v_mut;
    select q.total into v_probe
    from public.quote_price(v_km_mid, 1, false, 0, 26.0, 28.0, 26.0, 28.2, 0, v_mid) q
    where q.class_slug = v_class;
    raise exception 'MS_FLOOR_PROBE_ROLLBACK';
  exception when others then
    if sqlerrm <> 'MS_FLOOR_PROBE_ROLLBACK' then raise; end if;
  end;

  if v_probe is distinct from v_t_mid then
    raise exception
      '(ن-٥ب) 🔴 بنزع الأرضية أعطت الرحلةُ % لا تعريفةَ الأرجل % — إذن ليست الأرضيةُ هي ما رفع الرقم في (ن-١)',
      v_probe, v_t_mid;
  end if;

  -- والجسمُ عاد **حرفاً** بالتراجع، وإلا لبقيت القاعدةُ الحيّة بلا أرضية
  if pg_get_functiondef(v_sig::regprocedure) is distinct from v_def then
    raise exception '(ن-٥ج) 🔴 لم يعد جسمُ quote_price بعد الطفرة — القاعدةُ الحيّة بلا أرضية';
  end if;

  select q.total into v_probe
  from public.quote_price(v_km_mid, 1, false, 0, 26.0, 28.0, 26.0, 28.2, 0, v_mid) q
  where q.class_slug = v_class;
  if v_probe is distinct from v_plain then
    raise exception '(ن-٥د) بعد التراجع أعطت الرحلةُ % لا % — الخطةُ المخبَّأة ما زالت على الجسم المطفور',
      v_probe, v_plain;
  end if;

  raise notice
    '✔ (ن) 🔴 المنتصف ⇒ % (= المباشر، ولولا الأرضية %) · الانحراف ⇒ % (= تعريفة الأرجل) · بلا تغطية ⇒ % بلا تغيّر',
    v_rm.total, v_t_mid, v_rd.total, v_free_a;
end;
$$;

-- ----------------------------------------------------------------------------
-- (ص) 🔴 0142 — `create_booking` يخزّن المُؤرَّض، والبثُّ يعود من الصفر
--
-- 🔴 **الوجهُ الأول**: الإجمالي المخزَّن في الحجز = المُؤرَّض لا الخام. ولو
--    كانت الأرضيةُ فوق المحرّك لا داخله لَسعّرنا بمبلغٍ وحجزنا بآخر.
--
-- 🔴 **والوجهُ الثاني — وهو الحصيلةُ العملية**: `dispatch_ceiling` تُشتقّ من
--    الإجمالي، فبالأرضية تعود فوق تكلفة المتعهد المُدرجة ⇒ `dispatch_pool`
--    تُرجع المتعهدَ المغطّي. **وبلا الأرضية تُرجع صفراً** — وهو حالُ اليوم:
--    كلُّ حجزٍ بمحطةٍ على ممرٍّ مغطّى إسنادٌ يدويّ. والطفرةُ تقيس الصفرَ نفسَه.
--
-- ⚠ ولا تُقارن الأرقامُ بثوابت: `v_cost` هي تكلفةُ القائمة التي زرعها (م)،
--   والسقفُ يُقارن بها لا برقمٍ مكتوب.
-- ----------------------------------------------------------------------------
do $$
declare
  v_class  text    := current_setting('tours.ms_class', true);
  v_cost   numeric := current_setting('tours.ms_cost3', true)::numeric;
  v_km     numeric := current_setting('tours.ms_kmmid', true)::numeric;
  v_plain  numeric := current_setting('tours.ms_plain3', true)::numeric;
  v_t_mid  numeric := current_setting('tours.ms_tarmid', true)::numeric;
  v_mid    constant jsonb := '[{"label":"منتصف الطريق","lat":26.0,"lng":28.1}]'::jsonb;
  v_sig    constant text  :=
    'public.quote_price(numeric,integer,boolean,numeric,numeric,numeric,numeric,numeric,integer,jsonb)';
  v_row    record;
  v_b      record;
  v_ceil   numeric;
  v_pool   integer;
  v_payout numeric;
  v_def    text;
  v_mut    text;
  v_p_tot  numeric;
  v_p_ceil numeric;
  v_p_pool integer;
begin
  select * into v_row
  from public.create_booking(
    p_origin          => '{"label":"بداية القصير","lat":26.0,"lng":28.0}'::jsonb,
    p_destination     => '{"label":"نهاية القصير","lat":26.0,"lng":28.2}'::jsonb,
    p_passengers      => 1,
    p_round_trip      => false,
    p_waiting_hours   => 0,
    p_distance_km     => v_km,
    p_duration_min    => 30,
    p_distance_source => 'osrm',
    p_class_slug      => v_class,
    p_plan            => 'full',
    p_customer_name   => 'عميل اختبار الأرضية',
    p_customer_phone  => '01000000599',
    p_customer_whatsapp => null,
    p_pickup_at       => now() + interval '7 days',
    p_notes           => 'MULTI_STOP_TESTS_FIXTURE أرضية',
    p_stops           => v_mid
  );

  select * into v_b from public.bookings b where b.id = v_row.id;

  -- (ص-١) الإجمالي المخزَّن هو المُؤرَّض
  if v_b.total is distinct from v_plain then
    raise exception
      '(ص-١) 🔴 الحجزُ خُزِّن بـ% والتسعيرُ يعطي % — سعّرنا بمبلغٍ وحجزنا بآخر',
      v_b.total, v_plain;
  end if;
  if v_b.total <= v_t_mid then
    raise exception
      '(ص-١ب) الإجمالي المخزَّن (%) ليس فوق تعريفة الأرجل (%) — الأرضيةُ لم تبلغ مسارَ الحجز',
      v_b.total, v_t_mid;
  end if;
  if v_b.price_source <> 'tariff' or v_b.subcontractor_id is not null
     or v_b.subcontractor_cost is not null or v_b.margin_amount is not null then
    raise exception
      '(ص-١ج) 🔴 حجزٌ أُرضي حمل مصدراً «%» أو متعهداً أو تكلفةً — قرارُ 0140 نُقض في مسار الحجز',
      v_b.price_source;
  end if;

  -- (ص-٢) والسقفُ عاد فوق تكلفة المتعهد المُدرجة
  v_ceil := public.dispatch_ceiling(v_b.id, 1);
  if v_ceil is null or v_ceil < v_cost then
    raise exception
      '(ص-٢) 🔴 سقفُ الموجة الأولى (%) دون تكلفة المتعهد المُدرجة (%) — لن يبلغه العرضُ أبداً',
      coalesce(v_ceil::text, 'null'), v_cost;
  end if;

  -- (ص-٣) 🔴 والمتعهدُ المغطّي **يبلغه العرض** — وهو صفرٌ بلا الأرضية
  select count(*) into v_pool from public.dispatch_pool(v_b.id, 1);
  if v_pool < 1 then
    raise exception
      '(ص-٣) 🔴 dispatch_pool أرجعت صفراً بسقفٍ % وتكلفةٍ % — كلُّ حجزٍ بمحطةٍ يسقط إلى الطابور اليدوي',
      v_ceil, v_cost;
  end if;

  select p.payout into v_payout from public.dispatch_pool(v_b.id, 1) p order by p.payout limit 1;
  if v_payout is distinct from round(v_cost, 2) then
    raise exception
      '(ص-٣ب) المستحقُّ المعروض (%) ليس تكلفةَ القائمة (%) — تغيّر ما لا تخصّه هذه الهجرة',
      v_payout, v_cost;
  end if;

  -- (ص-٤) 🔴 الطفرة: تُنزع الأرضيةُ ⇒ الإجمالي يهبط ⇒ السقفُ دون التكلفة ⇒
  --       **صفرُ متعهد**. وهو حرفياً العيبُ الذي قِيس قبل هذا الملف.
  v_def := pg_get_functiondef(v_sig::regprocedure);
  v_mut := replace(v_def, 'dr.total > l.total', 'false');
  if v_mut = v_def then
    raise exception '(ص-٤) 🔴 مرساةُ الطفرة غائبة — لا يمكن إثباتُ أثر الأرضية على البثّ';
  end if;

  begin
    execute v_mut;

    select q.total into v_p_tot
    from public.quote_price(v_km, 1, false, 0, 26.0, 28.0, 26.0, 28.2, 0, v_mid) q
    where q.class_slug = v_class;

    update public.bookings
       set total = v_p_tot, amount_due = v_p_tot, amount_remaining = 0
     where id = v_b.id;

    v_p_ceil := public.dispatch_ceiling(v_b.id, 1);
    select count(*) into v_p_pool from public.dispatch_pool(v_b.id, 1);

    raise exception 'MS_DISPATCH_PROBE_ROLLBACK';
  exception when others then
    if sqlerrm <> 'MS_DISPATCH_PROBE_ROLLBACK' then raise; end if;
  end;

  if v_p_pool <> 0 then
    raise exception
      '(ص-٤ب) 🔴 بنزع الأرضية بقي في الطابور % متعهداً (سقف % · تكلفة %) — إذن ليست الأرضيةُ هي ما أحيا البثَّ',
      v_p_pool, v_p_ceil, v_cost;
  end if;

  -- والجسمُ والإجماليُّ عادا معاً بالتراجع
  if pg_get_functiondef(v_sig::regprocedure) is distinct from v_def then
    raise exception '(ص-٤ج) 🔴 لم يعد جسمُ quote_price بعد الطفرة';
  end if;
  if (select b.total from public.bookings b where b.id = v_b.id) is distinct from v_plain then
    raise exception '(ص-٤د) 🔴 لم يعد إجماليُّ الحجز بعد الطفرة';
  end if;

  raise notice
    '✔ (ص) 🔴 حجزٌ بمحطةٍ خُزِّن بـ% (لا %) · سقفُ الموجة ١ = % ≥ تكلفة % · الطابور % متعهد — وبنزع الأرضية % و%',
    v_b.total, v_t_mid, v_ceil, v_cost, v_pool, v_p_tot, v_p_pool;
end;
$$;

-- ----------------------------------------------------------------------------
-- (ف) 🔴 0142 — رحلةٌ **بلا محطات**: الأرضيةُ لا تمسّ رقماً واحداً
--
-- عقدُ التوافق الرجعيّ كلّه في سطرٍ واحد: ثمانيةَ عشرَ حجزاً قائماً وكلُّ حجزٍ
-- جديدٍ بنقطتين يجب أن يعطي **نفسَ الرقم بالضبط** الذي كان يعطيه قبل 0142.
--
-- 🔴 **ويُقاس بمقارنةٍ حقيقية لا بادّعاء**: تُقرأ الأرقامُ على **خمسة ممرّاتٍ
--    حقيقية** من قوائم المالك المعتمدة، ثم يُطفَر الجسمُ الحيّ بنزع الأرضية
--    وتُقرأ الأرقامُ ثانيةً. والجسمُ المطفور **هو بعينه سلوكُ ما قبل 0142**
--    لرحلةٍ بلا محطات. فالمقارنةُ «قبل/بعد» مقيسةٌ في الجلسة نفسها.
--
-- ⚠ والممرّاتُ حقيقيةٌ بقصد (والمجموعةُ لا تكتبها ولا تعدّلها — قراءةٌ محضة):
--   المطلوبُ إثباتُ أن **مالَ المالك القائم** لم يتحرّك، لا أن فيكسترةً لم
--   تتحرّك. ولا يُحفَر رقمٌ منها في هذا الملف، فتغييرُ تعريفةٍ أو قائمةٍ لا
--   يُسقط القسم — تسقطه **الأرضيةُ وحدها** لو مسّت رحلةً بلا محطات.
--
-- ⚠ ويُتخطّى بإشعارٍ صريح حين لا قائمةَ معتمدة (نسخةُ whitelabel جديدة).
-- ----------------------------------------------------------------------------
do $$
declare
  v_sig  constant text :=
    'public.quote_price(numeric,integer,boolean,numeric,numeric,numeric,numeric,numeric,integer,jsonb)';
  v_def  text;
  v_mut  text;
  v_pre  jsonb;
  v_post jsonb;
  v_n    integer;
  v_cov  integer;
begin
  -- ⚠ `on commit drop` وحدها بلا `drop … if exists`: الأخيرةُ تطبع إشعاراً في
  --   كل جولةٍ نظيفة، وإشعارٌ يُطبع دائماً لا يُقرأ (نفس منطق «إنذارٌ يرنّ في
  --   كل عملية سليمة» في LESSONS).
  create temporary table ms_f_corridors on commit drop as
  select distinct
    pl.origin_lat o1, pl.origin_lng o2, pl.dest_lat d1, pl.dest_lng d2, pli.class_slug cls
  from public.price_lists pl
  join public.price_list_items pli on pli.price_list_id = pl.id
  join public.subcontractors s on s.id = pl.subcontractor_id
  where pl.status = 'approved'
    and s.company_name not like 'MULTI_STOP_TESTS%'
    and pl.origin_lat is not null and pl.origin_lng is not null
    and pl.dest_lat   is not null and pl.dest_lng   is not null
  order by 1, 2, 3, 4, 5
  limit 5;

  select count(*) into v_n from ms_f_corridors;
  if v_n = 0 then
    raise notice '  ↳ (ف) تخطٍّ: لا قائمةَ أسعارٍ معتمدة على هذه القاعدة';
    return;
  end if;

  perform set_config('tours.pricing_internals', 'on', true);

  select jsonb_agg(x order by x ->> 'k') into v_pre
  from (
    select jsonb_build_object(
             'k', c.cls || '@' || c.o1 || ',' || c.o2 || '→' || c.d1 || ',' || c.d2,
             'total', q.total, 'src', q.price_source, 'base', q.base_fee,
             'dist', q.distance_cost, 'wait', q.waiting_cost, 'min', q.min_applied,
             'cost', q.subcontractor_cost, 'margin', q.margin_amount) as x
    from ms_f_corridors c
    cross join lateral public.quote_price(
      public.haversine_km(c.o1, c.o2, c.d1, c.d2) * 1.3,
      2, false, 1, c.o1, c.o2, c.d1, c.d2, 1, null) q
  ) s;

  select count(*) into v_cov
  from jsonb_array_elements(v_pre) e
  where e ->> 'src' = 'subcontractor';

  v_def := pg_get_functiondef(v_sig::regprocedure);
  v_mut := replace(v_def, 'dr.total > l.total', 'false');
  if v_mut = v_def then
    raise exception '(ف) 🔴 مرساةُ الطفرة غائبة — لا يمكن قياسُ «قبل/بعد» على رحلةٍ بلا محطات';
  end if;

  begin
    execute v_mut;
    select jsonb_agg(x order by x ->> 'k') into v_post
    from (
      select jsonb_build_object(
               'k', c.cls || '@' || c.o1 || ',' || c.o2 || '→' || c.d1 || ',' || c.d2,
               'total', q.total, 'src', q.price_source, 'base', q.base_fee,
               'dist', q.distance_cost, 'wait', q.waiting_cost, 'min', q.min_applied,
               'cost', q.subcontractor_cost, 'margin', q.margin_amount) as x
      from ms_f_corridors c
      cross join lateral public.quote_price(
        public.haversine_km(c.o1, c.o2, c.d1, c.d2) * 1.3,
        2, false, 1, c.o1, c.o2, c.d1, c.d2, 1, null) q
    ) s;
    raise exception 'MS_IDENT_PROBE_ROLLBACK';
  exception when others then
    if sqlerrm <> 'MS_IDENT_PROBE_ROLLBACK' then raise; end if;
  end;

  perform set_config('tours.pricing_internals', '', true);

  if v_pre is distinct from v_post then
    raise exception
      '(ف) 🔴 رحلةٌ بلا محطاتٍ تغيّر رقمُها بالأرضية — التوافقُ الرجعيّ انكسر. بالأرضية: % · بلا الأرضية: %',
      v_pre, v_post;
  end if;

  if v_cov = 0 then
    raise exception
      '(ف-ب) 🔴 لا صفَّ واحدٌ من الخمسة سُعِّر subcontractor — فالمقارنةُ تقيس مسارَ التعريفة وحده ولا تثبت شيئاً عن الأرضية';
  end if;

  raise notice
    '✔ (ف) خمسةُ ممرّاتٍ حقيقية (% صفاً · % منها بتغطية) — رقمٌ برقمٍ مطابق بالأرضية وبنزعها',
    jsonb_array_length(v_pre), v_cov;
end;
$$;

-- ----------------------------------------------------------------------------
-- (ق) 🔴 0143 — الأرضيةُ لا تُسعَّر على مسافةٍ أطولَ ممّا سيُقاد
--
-- 0142 اشتقّت المسافةَ المباشرةَ نسبياً: `distance_km × (الوتر ÷ مجموعِ أوتار
-- الأرجل)`، واتّكأت على متباينةِ المثلث لتقول إن النسبة ≤ ١. **والمتباينةُ
-- تسقط حين لا تكون `s_multi` مجموعَ كل الأرجل**: `trip_straight_km` تُسقط
-- الرِّجلَ التي طرفُها بلا إحداثيات (‏`where l.a_lat is not null` من جهة،
-- و`sum()` تتخطّى `null` من الأخرى) فتُرجع **مجموعاً جزئياً**. ومحطةٌ سليمةٌ
-- بجوار محطةٍ عمياء ⇒ النسبةُ > ١ ⇒ سعرٌ فوق تعريفة الأرجل على ممرٍّ لا
-- تغطيةَ فيه — أي أرضيةٌ تخترع رقماً، وهو ما ينفيه (ن-٣) للحالة السليمة وحدها.
--
-- ⚠ **والفيكسترةُ تُثبت أولاً أنها تُشغّل العيب**: يُقاس المجموعُ الجزئيّ
--   ويُشترط أن يقلّ عن الوتر المباشر. فلو غُيّرت `trip_straight_km` يوماً
--   لترفض المحطةَ العمياء بدل إسقاطها، **يحمرّ هذا القسم بدل أن يمرّ فارغاً**.
-- ----------------------------------------------------------------------------
do $$
declare
  v_class  text := current_setting('tours.ms_class', true);
  -- ممرٌّ صحراويّ — نفسُ الذي يقيس (ن-٣) خلوَّه، ويُعاد قياسُه هنا بالاتجاهين
  v_olat   constant numeric := 24.0;
  v_olng   constant numeric := 33.0;
  v_dlat   constant numeric := 23.5;
  v_dlng   constant numeric := 33.5;
  v_km     constant numeric := 200;
  v_good   constant jsonb := '[{"label":"محطة صحراوية","lat":23.75,"lng":33.25}]'::jsonb;
  -- 🔴 المدخلُ المُعطِب: سليمةٌ ثم عمياء ⇒ رِجلٌ واحدةٌ تنجو من المجموع
  v_mixed  constant jsonb :=
    '[{"label":"سليمة","lat":23.9,"lng":33.1},{"label":"عمياء بلا إحداثيات"}]'::jsonb;
  v_sig    constant text := 'public.quote_price(numeric,integer,boolean,numeric,numeric,numeric,numeric,numeric,integer,jsonb)';
  v_anchor constant text := 'least(' || chr(10) || '        case when g.s_multi > 0';
  v_undo   constant text := 'greatest(' || chr(10) || '        case when g.s_multi > 0';
  v_direct numeric;
  v_part   numeric;
  v_n      integer;
  v_plain  numeric;
  v_src    text;
  v_g      numeric;
  v_m      numeric;
  v_probe  numeric;
  v_mutres numeric;
  v_def    text;
  v_mut    text;
begin
  -- (ق-٠) الممرُّ خالٍ بالاتجاهين — وإلا قِيس فرعُ المتعهد لا فرعُ التعريفة
  select (select count(*) from public.coverage_matches(v_olat, v_olng, v_dlat, v_dlng))
       + (select count(*) from public.coverage_matches(v_dlat, v_dlng, v_olat, v_olng))
    into v_n;
  if v_n <> 0 then
    raise exception '(ق-٠) الممرُّ الصحراويّ لم يعد خالياً (% مطابقة) — اختر ممرّاً آخر', v_n;
  end if;

  -- (ق-١) 🔴 الفيكسترةُ تُشغّل العيب فعلاً: المجموعُ الجزئيّ **دون** الوتر
  v_direct := public.haversine_km(v_olat, v_olng, v_dlat, v_dlng);
  v_part   := public.trip_straight_km(v_olat, v_olng, v_dlat, v_dlng, v_mixed);
  if v_part is null or v_direct is null then
    raise exception '(ق-١) قياسُ الأوتار أعطى null (مباشر=% · جزئي=%)', v_direct, v_part;
  end if;
  if v_part >= v_direct then
    raise exception
      '(ق-١ب) 🔴 المجموعُ الجزئيّ (%) ليس دون الوتر المباشر (%) — المدخلُ لم يعد يُشغّل العيب، والقسمُ كلُّه صار زينة. غُيّرت trip_straight_km؟ حدِّث الفيكسترة أو احذف القسم بوعي',
      v_part, v_direct;
  end if;

  -- (ق-٢) الحصيلة: ثلاثتُها سواء — لا الأرضيةُ تخترع رقماً ولا تُسعِّر على وهم
  select q.total, q.price_source into v_plain, v_src
  from public.quote_price(v_km, 1, false, 0, v_olat, v_olng, v_dlat, v_dlng, 0, null) q
  where q.class_slug = v_class;

  if v_src <> 'tariff' then
    raise exception '(ق-٢) الممرُّ الصحراويّ سُعِّر «%» لا tariff', v_src;
  end if;

  select q.total into v_g
  from public.quote_price(v_km, 1, false, 0, v_olat, v_olng, v_dlat, v_dlng, 0, v_good) q
  where q.class_slug = v_class;

  select q.total into v_m
  from public.quote_price(v_km, 1, false, 0, v_olat, v_olng, v_dlat, v_dlng, 0, v_mixed) q
  where q.class_slug = v_class;

  if v_g is distinct from v_plain then
    raise exception '(ق-٢ب) محطةٌ سليمة غيّرت الإجمالي على ممرٍّ بلا تغطية: % ≠ %', v_g, v_plain;
  end if;
  if v_m is distinct from v_plain then
    raise exception
      '(ق-٢ج) 🔴 محطةٌ عمياء بجوار سليمة أعطت % بدل % على ممرٍّ **بلا تغطية** — الأرضيةُ تُسعِّر مسافةً أطولَ ممّا سيُقاد (حارسُ least في 0143)',
      v_m, v_plain;
  end if;

  -- (ق-٣) 🔴 الطفرة — يُقلب `least` إلى `greatest` في الجسم الحيّ فيرتفع الرقم
  v_def := pg_get_functiondef(v_sig::regprocedure);
  if position(v_anchor in v_def) = 0 then
    raise exception
      '(ق-٣) 🔴 مرساةُ الطفرة (‏least على direct_km) غائبةٌ عن جسم quote_price — حارسُ 0143 نُزع أو أُعيدت صياغتُه. لا يمكن إثباتُه بالطفرة';
  end if;
  v_mut := replace(v_def, v_anchor, v_undo);

  begin
    execute v_mut;
    select q.total into v_mutres
    from public.quote_price(v_km, 1, false, 0, v_olat, v_olng, v_dlat, v_dlng, 0, v_mixed) q
    where q.class_slug = v_class;
    raise exception 'MS_CLAMP_PROBE_ROLLBACK';
  exception when others then
    if sqlerrm <> 'MS_CLAMP_PROBE_ROLLBACK' then raise; end if;
  end;

  if v_mutres is null or v_mutres <= v_plain then
    raise exception
      '(ق-٣ب) 🔴 بقلب الحارس بقي الرقمُ % ≤ % — إذن ليس `least` هو ما منع التضخّم، والتوكيدُ في (ق-٢ج) بلا أسنان',
      v_mutres, v_plain;
  end if;

  -- والجسمُ عاد حرفاً بالتراجع، ثم يُعاد التسعيرُ لإبطال أي خطةٍ مخبَّأة
  if pg_get_functiondef(v_sig::regprocedure) is distinct from v_def then
    raise exception '(ق-٣ج) 🔴 لم يعد جسمُ quote_price بعد الطفرة — القاعدةُ الحيّة بلا حارس';
  end if;

  select q.total into v_probe
  from public.quote_price(v_km, 1, false, 0, v_olat, v_olng, v_dlat, v_dlng, 0, v_mixed) q
  where q.class_slug = v_class;
  if v_probe is distinct from v_plain then
    raise exception '(ق-٣د) بعد التراجع أعطت الرحلةُ % لا % — الخطةُ المخبَّأة على الجسم المطفور', v_probe, v_plain;
  end if;

  raise notice
    '✔ (ق) 🔴 المجموعُ الجزئيّ % كم دون الوتر % كم — والإجمالي % في الحالات الثلاث، ولولا الحارس %',
    v_part, v_direct, v_plain, v_mutres;
end;
$$;

-- ----------------------------------------------------------------------------
-- (ك) التنظيف واستعادة الإعدادات
--
-- ⚠ `db-test.mjs` يلفّ الملف في `BEGIN … ROLLBACK` فلا شيء يُكمَّ أصلاً.
--    وهذا القسم للتشغيل اليدوي من psql — وهو زائدٌ لا ضارّ.
-- ----------------------------------------------------------------------------
do $$
declare
  v_saved jsonb := nullif(current_setting('tours.ms_settings', true), '')::jsonb;
  v_max   text  := nullif(current_setting('tours.ms_maxstops', true), '');
begin
  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claims', '', false);

  delete from public.notifications n
   where n.payload ->> 'bookingId' in (
         select b.id::text from public.bookings b
          where b.trip ->> 'notes' like 'MULTI_STOP_TESTS_FIXTURE%');
  delete from public.trip_offers o
   where o.booking_id in (select b.id from public.bookings b
                           where b.trip ->> 'notes' like 'MULTI_STOP_TESTS_FIXTURE%');
  delete from public.dispatches d
   where d.booking_id in (select b.id from public.bookings b
                           where b.trip ->> 'notes' like 'MULTI_STOP_TESTS_FIXTURE%');
  delete from public.bookings b where b.trip ->> 'notes' like 'MULTI_STOP_TESTS_FIXTURE%';
  delete from public.subcontractors s where s.company_name like 'MULTI_STOP_TESTS%';

  if v_saved is not null then
    update public.pricing_settings
       set peak_enabled      = (v_saved ->> 'peak_enabled')::boolean,
           peak_percent      = (v_saved ->> 'peak_percent')::numeric,
           margin_type       = v_saved ->> 'margin_type',
           margin_value      = (v_saved ->> 'margin_value')::numeric,
           margin_min_amount = (v_saved ->> 'margin_min_amount')::numeric;
  end if;
  if v_max is not null then
    update public.trip_settings set max_trip_stops = v_max::integer where id;
  end if;

  raise notice '✔ (ك) تنظيفٌ تامّ واستعادةُ إعدادات التسعير وسقف المحطات';
end;
$$;

do $$
begin
  raise notice 'ALL PASSED';
end;
$$;
