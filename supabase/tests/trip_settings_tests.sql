-- ============================================================================
-- trip_settings_tests.sql — اختبارات قبول للقسمين ١ و٢ من هجرة 0027_batch_two
--                            (إعدادات الرحلات + كنس الطلبات غير المدفوعة)
--
-- كيف تشغّله:
--   node scripts/db-test.mjs trip_settings
-- النجاح = آخر سطر في الرسائل «ALL PASSED». أي فشل exception عربية تحمل اسم
-- التأكيد والقيمة المتوقعة والفعلية.
--
-- ⚠⚠ لماذا كل اختبار كنس هنا داخل كتلة تتراجع عن نفسها ⚠⚠
-- الملف يُرسَل كاملاً كاستعلام واحد ⇒ معاملة واحدة على القاعدة **الحيّة**.
-- و`unpaid_cancel_enabled` مفتاح **عالمي**: تشغيله يغيّر سلوك كل صف في القاعدة،
-- و`cancel_stale_bookings()` بلا أي مُرشِّح fixture — تلغي كل حجز `pending_payment`
-- انقضت مهلته أياً كان صاحبه. فكل كتلة تلمس المفتاح أو تنادي الدالة تنتهي بـ
-- `raise exception 'ROLLBACK_MARKER'`: كتلة الاستثناء في plpgsql نقطة حفظ ضمنية،
-- فيُلغى كل ما بداخلها — بما فيه أي صف حقيقي لمسته الدالة. وتأكيدات الاختبار
-- ترمي هي الأخرى، ورميها **يمرّ** (ليس هو العلامة) فيصل الفشل إلى المشغّل.
-- وزيادةً: كل صفوف الاختبار مؤرَّخة قبل ٤٠٠ يوماً والمهلة تُضبط على أقصاها
-- (٣٠ يوماً) فحتى الخطأ لا يبلغ صفوف المالك الحديثة.
--
-- ما يغطيه الملف:
--   (أ) بنية `trip_settings`: صف وحيد، مبذور، RLS مفعّلة.
--   (ب) قيد المهلة يرفض ١٤ و٤٣٢٠١ فعلاً (مع شاهد إيجابي: ١٥ و٤٣٢٠٠ تمران).
--   (ج) حيلة الصف الوحيد: الإدراج الثاني مرفوض بشقّيه.
--   (د) `trip_config()` تُرجع صفاً واحداً حتى والجدول فارغ.
--   (هـ) الصلاحيات: لا شيء لـ anon، و`trip_config` ليست لـ authenticated عمداً.
--   (و) المفتاح مطفأ ⇒ أصفار ولا إلغاء (وشاهد إيجابي أن الصف كان مؤهلاً فعلاً).
--   (ز) المفتاح مشتغل ⇒ المتقادم يُلغى والحديث لا.
--   (ح) المال في الطريق: جلسة بوابة حيّة تحمي، والبائتة والفاشلة لا تحميان.
--   (ط) الملاحظة التلقائية تصل إلى `booking_events` **لكل صف**، وبلا قيد دفتر.
--   (ي) `p_limit` مُحترَم.
--   (ك) عدّاد `failed`: كتلة الاستثناء لكل صف موجودة، وشكل الإرجاع ثلاثي مرتّب.
--
-- المرجع: supabase/migrations/0027_batch_two.sql (ق١ و ق٢)
--         · lib/booking-types.ts (‏TripSettings و DEFAULT_TRIP_SETTINGS)
--         · supabase/migrations/0007_booking.sql (‏bookings و booking_events)
--         · supabase/migrations/0020_payments.sql (‏payment_intents)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (٠) الشروط المسبقة + قفل الكنس + تنظيف بقايا أي تشغيل سابق
-- ----------------------------------------------------------------------------
do $$
declare
  v_missing text;
  v_n       integer;
begin
  select string_agg(x.sig, '، ')
    into v_missing
  from (values
    ('public.trip_config()'),
    ('public.cancel_stale_bookings(integer)'),
    ('public.dispatch_ops_allowed()'),
    ('public.is_admin()')
  ) as x(sig)
  where to_regprocedure(x.sig) is null;

  if v_missing is not null then
    raise exception 'شرط مسبق: دوال مفقودة (نفّذ 0027_batch_two.sql أولاً): %', v_missing;
  end if;

  select string_agg(x.rel, '، ')
    into v_missing
  from (values
    ('public.trip_settings'), ('public.bookings'), ('public.booking_events'),
    ('public.payments'), ('public.payment_intents'), ('public.payment_providers'),
    ('public.ledger_entries')
  ) as x(rel)
  where to_regclass(x.rel) is null;

  if v_missing is not null then
    raise exception 'شرط مسبق: جداول مفقودة: %', v_missing;
  end if;

  -- ⚠ القفل الاستشاري نفسه الذي تأخذه الدالة (913027): نأخذه هنا على مستوى
  -- المعاملة كلها. الغرض شقّان: ألّا تتداخل دورة كنس حقيقية مع صفوفنا، وألّا
  -- تعود نداءاتنا بأصفار «بهدوء» فنقرأها بوصفها سلوكاً بينما هي تنافس على القفل.
  -- والقفل معاود الدخول لنفس المعاملة، فنداء الدالة بعده يمرّ.
  if not pg_try_advisory_xact_lock(913027) then
    raise exception 'شرط مسبق: قفل الكنس (913027) محجوز بجلسة أخرى — دورة كنس تعمل الآن. أعد التشغيل بعد قليل.';
  end if;

  -- تنظيف أولي: تشغيل انهار في المنتصف لا يمنع التالي.
  -- الترتيب: الإشعارات (بلا مفتاح أجنبي) ← الدفتر (‏booking_id بـ set null فلا
  -- يمنع الحذف لكنه يترك يتيماً) ← الحجوزات (تجرّ الأحداث والجلسات بالتتالي).
  delete from public.notifications n
   where n.payload ->> 'bookingId' in (
         select b.id::text from public.bookings b
          where b.trip ->> 'notes' = 'TRIP_SWEEP_FIXTURE');
  delete from public.ledger_entries le
   where le.booking_id in (
         select b.id from public.bookings b
          where b.trip ->> 'notes' = 'TRIP_SWEEP_FIXTURE');
  delete from public.bookings b where b.trip ->> 'notes' = 'TRIP_SWEEP_FIXTURE';

  select count(*) into v_n from public.payment_providers;
  if v_n = 0 then
    raise exception 'شرط مسبق: لا مزوّد دفع مبذور — نفّذ 0020_payments.sql (اختبار المال في الطريق يحتاج صف payment_intents)';
  end if;

  -- مزوّد الاختبار يُشتق من القاعدة لا يُكتب بالاسم: بذرة المزوّدين قد تتغير.
  perform set_config(
    'tours.test_provider',
    (select p.provider from public.payment_providers p order by p.sort, p.provider limit 1),
    false
  );

  -- لقطة إعدادات المالك قبل أي عبث — يقارنها القسم (ل) بعد كل الكتل. هذا هو
  -- البرهان العملي على أن كل كتلة تراجعت فعلاً: لو نسي أحدها علامة التراجع
  -- لبقي المفتاح مشتغلاً على قاعدة حيّة، وهو أسوأ ما قد يخلّفه ملف اختبار.
  perform set_config(
    'tours.settings_before',
    (select t.unpaid_cancel_enabled::text || '/' || t.unpaid_timeout_minutes::text
       from public.trip_settings t),
    false
  );

  raise notice '✔ (٠) الشروط المسبقة سليمة، وقفل الكنس بيدنا (الإعدادات الآن: %)',
    current_setting('tours.settings_before', true);
end;
$$;

-- ----------------------------------------------------------------------------
-- (٠-ب) هوية المشرف — `cancel_stale_bookings` محروسة بـ `dispatch_ops_allowed()`
--
-- الحارس يقبل المشرف **أو** رمزاً بلا هوية مستخدم (شكل مفتاح الخدمة). واتصال
-- الاختبار بلا مطالبة jwt فيمرّ من الباب الثاني — ومع ذلك نُنشئ هوية مشرف
-- ونستعملها كي يمرّ النداء من الباب المقصود فعلاً في اللوحة.
-- ----------------------------------------------------------------------------
do $$
declare
  v_admin uuid;
begin
  perform set_config('tours.test_admin', '', false);
  perform set_config('tours.test_admin_fixture', '0', false);

  select p.id into v_admin from public.profiles p where p.role = 'admin' limit 1;

  if v_admin is null then
    begin
      v_admin := 'e0000000-0000-4000-8000-0000000000aa'::uuid;
      delete from auth.users u where u.id = v_admin;
      insert into auth.users (id, email) values (v_admin, 'trip-sweep-tests-fixture@local.invalid');
      insert into public.profiles (id, role, full_name)
      values (v_admin, 'admin', 'مشرف اختبار مؤقت')
      on conflict (id) do update set role = 'admin';
      perform set_config('tours.test_admin_fixture', '1', false);
      raise notice '  ↳ أُنشئ مشرف اختبار مؤقت (سيُحذف في النهاية)';
    exception
      when others then
        v_admin := null;
        raise notice '  ↳ تعذّر إنشاء مشرف مؤقت (%) — يمرّ النداء بمسار «بلا هوية» وهو مسار مشروع للحارس', sqlerrm;
    end;
  end if;

  if v_admin is not null then
    perform set_config('tours.test_admin', v_admin::text, false);
    raise notice '✔ (٠-ب) هوية المشرف جاهزة';
  else
    raise notice '⚠ (٠-ب) بلا هوية مشرف — الاختبارات تمضي بهوية الخادم';
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- (أ) بنية `trip_settings` — جدول صف وحيد مبذور ومحروس بـ RLS
-- ----------------------------------------------------------------------------
do $$
declare
  v_type   text;
  v_pk     text;
  v_rls    boolean;
  v_rows   integer;
  v_chk_id boolean;
  v_chk_to boolean;
begin
  select c.data_type into v_type
  from information_schema.columns c
  where c.table_schema = 'public' and c.table_name = 'trip_settings' and c.column_name = 'id';

  if v_type is distinct from 'boolean' then
    raise exception '(أ-١) عمود trip_settings.id: توقعنا boolean وحصلنا «%»', coalesce(v_type, 'غير موجود');
  end if;

  -- المفتاح الأساسي على العمود المنطقي وحده — نصف حيلة الصف الوحيد
  select string_agg(a.attname, ',' order by a.attnum) into v_pk
  from pg_constraint con
  join unnest(con.conkey) as k(attnum) on true
  join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.attnum
  where con.conrelid = 'public.trip_settings'::regclass and con.contype = 'p';

  if v_pk is distinct from 'id' then
    raise exception '(أ-٢) المفتاح الأساسي: توقعنا (id) وحصلنا «%»', coalesce(v_pk, 'بلا مفتاح');
  end if;

  -- النصف الثاني: قيد فحص على العمود المنطقي (‏check (id)) يمنع الصف الثاني
  select exists (
    select 1 from pg_constraint con
    where con.conrelid = 'public.trip_settings'::regclass
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ~ 'CHECK \(\(?id\)?\)'
  ) into v_chk_id;

  if not v_chk_id then
    raise exception '(أ-٣) لا قيد فحص على العمود id — حيلة الصف الوحيد ناقصة، فصفٌّ ثانٍ بـ id = false يمرّ';
  end if;

  select exists (
    select 1 from pg_constraint con
    where con.conrelid = 'public.trip_settings'::regclass
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) like '%unpaid_timeout_minutes%'
  ) into v_chk_to;

  if not v_chk_to then
    raise exception '(أ-٤) لا قيد فحص على unpaid_timeout_minutes — صمام أمان المهلة مفقود';
  end if;

  select c.relrowsecurity into v_rls from pg_class c where c.oid = 'public.trip_settings'::regclass;
  if not coalesce(v_rls, false) then
    raise exception '(أ-٥) RLS غير مفعّلة على trip_settings — السياسات الأربع بلا أثر';
  end if;

  select count(*) into v_rows from public.trip_settings;
  if v_rows <> 1 then
    raise exception '(أ-٦) البذرة: توقعنا صفاً واحداً في trip_settings وحصلنا %', v_rows;
  end if;

  raise notice '✔ (أ) trip_settings: id منطقي مفتاحاً، قيدا الفحص، RLS مفعّلة، وصف وحيد مبذور';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ب) قيد المهلة يرفض ١٤ و٤٣٢٠١ — داخل كتلة تتراجع
--
-- ⚠ الكتلة ضرورية لا احتياطية: لو كان القيد مفقوداً لنجح التحديث إلى ١٤ فعلاً
-- **فغيّر إعداد المالك العالمي**. والشاهد الإيجابي (١٥ و٤٣٢٠٠ تمران) يمنع فحصاً
-- لا يمكن أن يفشل: بدونه قد يكون الرفض من سبب آخر لا من القيد.
-- ----------------------------------------------------------------------------
do $$
declare
  v_lo     integer;
  v_hi     integer;
  v_raised boolean;
  v_state  text;
begin
  -- الشاهد الإيجابي أولاً: طرفا المدى المسموح يمرّان
  update public.trip_settings t set unpaid_timeout_minutes = 15 where t.id;
  select t.unpaid_timeout_minutes into v_lo from public.trip_settings t;
  if v_lo <> 15 then
    raise exception '(ب-١) شاهد إيجابي: توقعنا قبول ١٥ فصارت المهلة %', v_lo;
  end if;

  update public.trip_settings t set unpaid_timeout_minutes = 43200 where t.id;
  select t.unpaid_timeout_minutes into v_hi from public.trip_settings t;
  if v_hi <> 43200 then
    raise exception '(ب-٢) شاهد إيجابي: توقعنا قبول ٤٣٢٠٠ فصارت المهلة %', v_hi;
  end if;

  -- ثم الرفضان
  v_raised := false;
  begin
    update public.trip_settings t set unpaid_timeout_minutes = 14 where t.id;
  exception
    when check_violation then
      v_raised := true;
    when others then
      get stacked diagnostics v_state = returned_sqlstate;
      raise exception '(ب-٣) رفض ١٤ جاء بخطأ غير قيد الفحص (‏%)', v_state;
  end;
  if not v_raised then
    select t.unpaid_timeout_minutes into v_lo from public.trip_settings t;
    raise exception '(ب-٣) القيد قبل المهلة ١٤ دقيقة! (صارت المهلة % بدل رفض 23514)', v_lo;
  end if;

  v_raised := false;
  begin
    update public.trip_settings t set unpaid_timeout_minutes = 43201 where t.id;
  exception
    when check_violation then
      v_raised := true;
    when others then
      get stacked diagnostics v_state = returned_sqlstate;
      raise exception '(ب-٤) رفض ٤٣٢٠١ جاء بخطأ غير قيد الفحص (‏%)', v_state;
  end;
  if not v_raised then
    select t.unpaid_timeout_minutes into v_hi from public.trip_settings t;
    raise exception '(ب-٤) القيد قبل المهلة ٤٣٢٠١ دقيقة! (صارت المهلة % بدل رفض 23514)', v_hi;
  end if;

  raise notice '✔ (ب) قيد المهلة: ١٥ و٤٣٢٠٠ تمران، و١٤ و٤٣٢٠١ مرفوضتان';
  raise exception 'ROLLBACK_MARKER';
exception
  when others then
    if sqlerrm <> 'ROLLBACK_MARKER' then raise; end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- (ج) حيلة الصف الوحيد — الإدراج الثاني مرفوض بشقّيه
--
-- ⚠ داخل كتلة تتراجع: لو انفرط أحد الشقّين لنجح الإدراج **فصار للجدول صفان**
-- و`trip_config()` تصير غير حتمية على قاعدة المالك.
-- ----------------------------------------------------------------------------
do $$
declare
  v_raised boolean;
  v_rows   integer;
  v_state  text;
begin
  -- id = false ⇒ يصطدم بقيد الفحص
  v_raised := false;
  begin
    insert into public.trip_settings (id) values (false);
  exception
    when check_violation then
      v_raised := true;
    when others then
      get stacked diagnostics v_state = returned_sqlstate;
      raise exception '(ج-١) إدراج id = false جاء بخطأ غير قيد الفحص (‏%)', v_state;
  end;
  if not v_raised then
    raise exception '(ج-١) قُبل صف ثانٍ بـ id = false — الجدول لم يعد صفاً وحيداً';
  end if;

  -- id = true ⇒ يصطدم بالمفتاح الأساسي
  v_raised := false;
  begin
    insert into public.trip_settings (id) values (true);
  exception
    when unique_violation then
      v_raised := true;
    when others then
      get stacked diagnostics v_state = returned_sqlstate;
      raise exception '(ج-٢) إدراج id = true جاء بخطأ غير تفرد المفتاح (‏%)', v_state;
  end;
  if not v_raised then
    raise exception '(ج-٢) قُبل صف ثانٍ بـ id = true — المفتاح الأساسي غائب';
  end if;

  select count(*) into v_rows from public.trip_settings;
  if v_rows <> 1 then
    raise exception '(ج-٣) بعد محاولتَي الإدراج: توقعنا صفاً واحداً وحصلنا %', v_rows;
  end if;

  raise notice '✔ (ج) الصف الوحيد: id = false يصطدم بالفحص، و id = true بالمفتاح';
  raise exception 'ROLLBACK_MARKER';
exception
  when others then
    if sqlerrm <> 'ROLLBACK_MARKER' then raise; end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- (د) `trip_config()` تُرجع صفاً واحداً — بصف إعدادات وبلا صف
--
-- ⚠ حذف صف الإعدادات داخل كتلة تتراجع: القاعدة الحيّة لا تُترك بلا إعدادات.
-- والتوقع مشتقٌّ من **قيم العمودين الافتراضية في الجدول نفسه** لا من رقم محفور:
-- إن انحرف تدهور الدالة عن افتراضي العقد ظهر الانحراف هنا.
-- ----------------------------------------------------------------------------
do $$
declare
  v_n         integer;
  v_enabled   boolean;
  v_timeout   integer;
  v_row_en    boolean;
  v_row_to    integer;
  v_def_en    boolean;
  v_def_to    integer;
begin
  -- (د-١) والصف موجود: صف واحد يطابق الجدول
  select t.unpaid_cancel_enabled, t.unpaid_timeout_minutes
    into v_row_en, v_row_to
  from public.trip_settings t;

  select count(*) into v_n from public.trip_config();
  if v_n <> 1 then
    raise exception '(د-١) trip_config() والصف موجود: توقعنا صفاً واحداً وحصلنا %', v_n;
  end if;

  select c.unpaid_cancel_enabled, c.unpaid_timeout_minutes
    into v_enabled, v_timeout
  from public.trip_config() c;

  if v_enabled is distinct from v_row_en or v_timeout is distinct from v_row_to then
    raise exception '(د-٢) trip_config() لا تطابق الجدول: القارئ (%، %) والجدول (%، %)',
      v_enabled, v_timeout, v_row_en, v_row_to;
  end if;

  -- التوقع عند الفراغ = القيم الافتراضية المعلنة على أعمدة الجدول
  select (c.column_default ilike 'true%') into v_def_en
  from information_schema.columns c
  where c.table_schema = 'public' and c.table_name = 'trip_settings'
    and c.column_name = 'unpaid_cancel_enabled';

  select nullif(regexp_replace(c.column_default, '\D', '', 'g'), '')::integer into v_def_to
  from information_schema.columns c
  where c.table_schema = 'public' and c.table_name = 'trip_settings'
    and c.column_name = 'unpaid_timeout_minutes';

  if v_def_en is null or v_def_to is null then
    raise exception '(د-٣) تعذّرت قراءة القيم الافتراضية لأعمدة trip_settings — لا توقّع نشتقّه';
  end if;

  -- (د-٤) والجدول فارغ: صف واحد لا صفر
  delete from public.trip_settings;

  select count(*) into v_n from public.trip_config();
  if v_n <> 1 then
    raise exception '(د-٤) trip_config() والجدول فارغ: توقعنا صفاً واحداً وحصلنا % — المستهلك ينكسر على قاعدة لم تُبذر', v_n;
  end if;

  select c.unpaid_cancel_enabled, c.unpaid_timeout_minutes
    into v_enabled, v_timeout
  from public.trip_config() c;

  if v_enabled is distinct from v_def_en then
    raise exception '(د-٥) التدهور الرشيق: توقعنا التفعيل % (افتراضي العمود) وحصلنا %', v_def_en, v_enabled;
  end if;

  if v_timeout is distinct from v_def_to then
    raise exception '(د-٦) التدهور الرشيق: توقعنا المهلة % (افتراضي العمود) وحصلنا %', v_def_to, v_timeout;
  end if;

  if v_enabled then
    raise exception '(د-٧) قاعدة بلا صف إعدادات تُقرأ بالكنس **مفعّلاً** — أخطر افتراضي ممكن';
  end if;

  raise notice '✔ (د) trip_config(): صف واحد بصف إعدادات وبدونه، والتدهور إلى (مطفأ، % دقيقة)', v_def_to;
  raise exception 'ROLLBACK_MARKER';
exception
  when others then
    if sqlerrm <> 'ROLLBACK_MARKER' then raise; end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- (هـ) الصلاحيات — ومعها شاهد إيجابي لكل مسبار
--
-- المسبار الذي يعود دائماً بـ false (اسم خاطئ، دور غير موجود، توقيع مختلف) يقول
-- «آمن» عن كل شيء. فلكل نفي هنا إثباتٌ بنفس المسبار على منحة نعلم وجودها.
-- ----------------------------------------------------------------------------
do $$
declare
  v_has_anon boolean;
begin
  select exists (select 1 from pg_roles where rolname = 'anon') into v_has_anon;

  -- (هـ-١) الشاهد الإيجابي لمسبار الجداول: authenticated **يملك** select
  if not has_table_privilege('authenticated', 'public.trip_settings', 'select') then
    raise exception '(هـ-١) شاهد المسبار سقط: authenticated لا يملك select على trip_settings — المسبار معطّل فلا تصدّق ما بعده';
  end if;

  -- (هـ-٢) الشاهد الإيجابي لمسبار الدوال: authenticated **يملك** execute على الكنس
  if not has_function_privilege('authenticated', 'public.cancel_stale_bookings(integer)', 'execute') then
    raise exception '(هـ-٢) شاهد المسبار سقط: authenticated لا يملك execute على cancel_stale_bookings — المسبار معطّل فلا تصدّق ما بعده';
  end if;

  -- (هـ-٣) `trip_config()` **ليست** لـ authenticated — وكل متعهد authenticated
  if has_function_privilege('authenticated', 'public.trip_config()', 'execute') then
    raise exception '(هـ-٣) trip_config() ممنوحة لـ authenticated — كل متعهد يقرأ سياسة الكنس التشغيلية بلا حاجة';
  end if;

  if not v_has_anon then
    raise notice '  ↳ (هـ) لا دور anon على هذه القاعدة — فحوص الزائر تُتخطّى';
  else
    -- (هـ-٤) الزائر لا يقرأ trip_settings
    if has_table_privilege('anon', 'public.trip_settings', 'select') then
      raise exception '(هـ-٤) anon يقرأ trip_settings — سياسة تشغيلية على الملأ';
    end if;

    -- (هـ-٥) الزائر لا ينفّذ الكنس
    if has_function_privilege('anon', 'public.cancel_stale_bookings(integer)', 'execute') then
      raise exception '(هـ-٥) cancel_stale_bookings ممنوحة لـ anon — إلغاء حجوزات الناس بيد الزائر';
    end if;

    -- (هـ-٦) ولا trip_config
    if has_function_privilege('anon', 'public.trip_config()', 'execute') then
      raise exception '(هـ-٦) trip_config() ممنوحة لـ anon';
    end if;
  end if;

  raise notice '✔ (هـ) الصلاحيات: الشاهدان قائمان، ولا anon على الجدول ولا على الكنس، ولا trip_config لـ authenticated';
end;
$$;

-- ----------------------------------------------------------------------------
-- (و) المفتاح مطفأ ⇒ أصفار ولا إلغاء
--
-- ⚠ الشاهد الإيجابي داخل نفس الكتلة: بعد إثبات الأصفار نشغّل المفتاح ونعيد
-- النداء على **الصف نفسه** فيُلغى. بدونه لا يثبت شيء: صفٌّ غير مؤهل أصلاً يعطي
-- أصفاراً أيضاً، فيصير الاختبار أخضر مهما تعطّل المفتاح.
-- ----------------------------------------------------------------------------
do $$
declare
  v_admin  text := nullif(current_setting('tours.test_admin', true), '');
  v_id     uuid := 'e0000000-0000-4000-8000-000000000001';
  v_older  integer;
  v_res    record;
  v_status text;
begin
  if v_admin is not null then
    perform set_config('request.jwt.claim.sub', v_admin, true);
  end if;

  -- الحجز المؤهل: متقادم ٤٠٠ يوماً فلا تبلغه مهلة ٣٠ يوماً بأي خطأ حساب
  insert into public.bookings (
    id, reference, public_token, status, class_slug, class_title,
    total, currency, plan, amount_due, amount_remaining,
    customer_name, customer_phone, trip, created_at
  ) values (
    v_id, 'TR-SWEEP-01', md5(v_id::text) || md5(v_id::text || 'b'),
    'pending_payment', 'sweep-fixture', 'فئة اختبار الكنس',
    100, 'EGP', 'full', 100, 0,
    'عميل اختبار كنس', '01000000000',
    jsonb_build_object('notes', 'TRIP_SWEEP_FIXTURE'), now() - interval '400 days'
  );

  -- سقف النداء = ما هو أقدم من صفوفنا + صفوفنا. الترتيب في الدالة تصاعدي حسب
  -- created_at، فهذا يضمن بلوغ صفوفنا **ويحصر** ما قد تمسّه من صفوف المالك.
  select count(*) into v_older
  from public.bookings b
  where b.status = 'pending_payment' and b.created_at < now() - interval '400 days';

  -- المفتاح مطفأ صراحةً
  insert into public.trip_settings (id, unpaid_cancel_enabled, unpaid_timeout_minutes)
  values (true, false, 43200)
  on conflict (id) do update
    set unpaid_cancel_enabled  = excluded.unpaid_cancel_enabled,
        unpaid_timeout_minutes = excluded.unpaid_timeout_minutes;

  select * into v_res from public.cancel_stale_bookings(v_older + 1);

  if v_res.scanned <> 0 or v_res.cancelled <> 0 or v_res.failed <> 0 then
    raise exception '(و-١) والمفتاح مطفأ: توقعنا (٠،٠،٠) وحصلنا (%، %، %)',
      v_res.scanned, v_res.cancelled, v_res.failed;
  end if;

  select b.status into v_status from public.bookings b where b.id = v_id;
  if v_status <> 'pending_payment' then
    raise exception '(و-٢) والمفتاح مطفأ: الحجز المتقادم صار «%» بدل pending_payment', v_status;
  end if;

  -- الشاهد الإيجابي: نفس الصف يُلغى فور تشغيل المفتاح ⇒ كان مؤهلاً فعلاً
  update public.trip_settings t set unpaid_cancel_enabled = true where t.id;

  select * into v_res from public.cancel_stale_bookings(v_older + 1);

  select b.status into v_status from public.bookings b where b.id = v_id;
  if v_status <> 'cancelled' then
    raise exception '(و-٣) شاهد إيجابي سقط: بعد تشغيل المفتاح بقي الحجز «%» — فأصفار (و-١) لا تثبت شيئاً', v_status;
  end if;
  if v_res.cancelled < 1 then
    raise exception '(و-٤) شاهد إيجابي سقط: العدّاد cancelled = % بعد تشغيل المفتاح', v_res.cancelled;
  end if;

  raise notice '✔ (و) المفتاح مطفأ: أصفار ولا إلغاء — والصف نفسه يُلغى فور تشغيله';
  raise exception 'ROLLBACK_MARKER';
exception
  when others then
    if sqlerrm <> 'ROLLBACK_MARKER' then raise; end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- (ز) المفتاح مشتغل ⇒ المتقادم يُلغى والحديث لا
--
-- ⚠ لماذا السقف هنا واسع (كل صفوف pending_payment + هامش) ولا هو محصور كبقية
-- الكتل: الترتيب تصاعدي حسب `created_at`، فالصف الحديث **لا تبلغه** الحلقة أصلاً
-- مع سقف ضيّق — فيبقى سليماً بفضل السقف لا بفضل شرط المهلة، وهو فحص لا يمكن أن
-- يفشل. بسقف يتجاوز عدد المؤهلين كلهم، بقاء الصف الحديث يعود إلى شرط المهلة
-- وحده. وكل ما تمسّه الدالة من صفوف المالك يعود بالتراجع في نهاية الكتلة.
-- ----------------------------------------------------------------------------
do $$
declare
  v_admin   text := nullif(current_setting('tours.test_admin', true), '');
  v_old     uuid := 'e0000000-0000-4000-8000-000000000001';
  v_fresh   uuid := 'e0000000-0000-4000-8000-000000000002';
  v_total   integer;
  v_res     record;
  v_st_old  text;
  v_st_new  text;
begin
  if v_admin is not null then
    perform set_config('request.jwt.claim.sub', v_admin, true);
  end if;

  insert into public.bookings (
    id, reference, public_token, status, class_slug, class_title,
    total, currency, plan, amount_due, amount_remaining,
    customer_name, customer_phone, trip, created_at
  )
  select x.id, x.ref, md5(x.id::text) || md5(x.id::text || 'b'),
         'pending_payment', 'sweep-fixture', 'فئة اختبار الكنس',
         100, 'EGP', 'full', 100, 0,
         'عميل اختبار كنس', '01000000000',
         jsonb_build_object('notes', 'TRIP_SWEEP_FIXTURE'), x.created
  from (values
    (v_old,   'TR-SWEEP-01', now() - interval '400 days'),
    (v_fresh, 'TR-SWEEP-02', now() - interval '1 minute')
  ) as x(id, ref, created);

  insert into public.trip_settings (id, unpaid_cancel_enabled, unpaid_timeout_minutes)
  values (true, true, 43200)
  on conflict (id) do update
    set unpaid_cancel_enabled  = excluded.unpaid_cancel_enabled,
        unpaid_timeout_minutes = excluded.unpaid_timeout_minutes;

  select count(*) into v_total from public.bookings b where b.status = 'pending_payment';
  raise notice '  ↳ (ز) صفوف pending_payment في القاعدة الآن: % (كلها ضمن مدى النداء ثم تعود بالتراجع)', v_total;

  select * into v_res from public.cancel_stale_bookings(v_total + 5);

  select b.status into v_st_old  from public.bookings b where b.id = v_old;
  select b.status into v_st_new  from public.bookings b where b.id = v_fresh;

  if v_st_old <> 'cancelled' then
    raise exception '(ز-١) الحجز المتقادم (٤٠٠ يوم) لم يُلغَ — حالته «%»', v_st_old;
  end if;

  if v_st_new <> 'pending_payment' then
    raise exception '(ز-٢) الحجز الحديث (دقيقة واحدة) أُلغي! حالته «%» — شرط المهلة لا يحمي أحداً', v_st_new;
  end if;

  if v_res.cancelled < 1 then
    raise exception '(ز-٣) العدّاد cancelled = % مع إلغاء مؤكَّد في الجدول — الردّ لا يصف ما جرى', v_res.cancelled;
  end if;

  if v_res.failed <> 0 then
    raise exception '(ز-٤) العدّاد failed = % في كنسٍ شامل — صفٌّ سامّ يبتلَع خطؤه', v_res.failed;
  end if;

  if v_res.scanned < v_res.cancelled then
    raise exception '(ز-٥) scanned (%) أقل من cancelled (%) — الردّ غير متسق', v_res.scanned, v_res.cancelled;
  end if;

  raise notice '✔ (ز) المفتاح مشتغل: المتقادم أُلغي والحديث لم يُمسّ (‏%، %، %)',
    v_res.scanned, v_res.cancelled, v_res.failed;
  raise exception 'ROLLBACK_MARKER';
exception
  when others then
    if sqlerrm <> 'ROLLBACK_MARKER' then raise; end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- (ح) المال في الطريق — جلسة البوابة الحيّة تحمي، والبائتة والفاشلة لا
--
-- ثلاثة حجوزات متطابقة تماماً (٤٠٠ يوم، pending_payment) ولا تختلف إلا في جلسة
-- الدفع المرتبطة بها. فما يفرّق بينها هو الشرط المُختبَر وحده لا شيء آخر:
--   ٥ ← جلسة created عمرها لحظات   ⇒ **لا تُلغى** (المال في الطريق)
--   ٦ ← جلسة created عمرها ٤٠٠ يوم ⇒ تُلغى (أقدم من المهلة، وإلا خُلّد الحجز)
--   ٧ ← جلسة failed عمرها لحظات    ⇒ تُلغى (الحماية للحالتين created/pending)
-- ----------------------------------------------------------------------------
do $$
declare
  v_admin    text := nullif(current_setting('tours.test_admin', true), '');
  v_provider text := current_setting('tours.test_provider', true);
  v_live     uuid := 'e0000000-0000-4000-8000-000000000005';
  v_stale    uuid := 'e0000000-0000-4000-8000-000000000006';
  v_failed   uuid := 'e0000000-0000-4000-8000-000000000007';
  v_older    integer;
  v_res      record;
  v_s_live   text;
  v_s_stale  text;
  v_s_failed text;
begin
  if v_admin is not null then
    perform set_config('request.jwt.claim.sub', v_admin, true);
  end if;

  insert into public.bookings (
    id, reference, public_token, status, class_slug, class_title,
    total, currency, plan, amount_due, amount_remaining,
    customer_name, customer_phone, trip, created_at
  )
  select x.id, x.ref, md5(x.id::text) || md5(x.id::text || 'b'),
         'pending_payment', 'sweep-fixture', 'فئة اختبار الكنس',
         100, 'EGP', 'full', 100, 0,
         'عميل اختبار كنس', '01000000000',
         jsonb_build_object('notes', 'TRIP_SWEEP_FIXTURE'), now() - interval '400 days'
  from (values
    (v_live,   'TR-SWEEP-05'),
    (v_stale,  'TR-SWEEP-06'),
    (v_failed, 'TR-SWEEP-07')
  ) as x(id, ref);

  insert into public.payment_intents (booking_id, provider, amount_minor, currency, status, created_at)
  select x.id, v_provider, 10000, 'EGP', x.st, x.created
  from (values
    (v_live,   'created', now()),
    (v_stale,  'created', now() - interval '400 days'),
    (v_failed, 'failed',  now())
  ) as x(id, st, created);

  insert into public.trip_settings (id, unpaid_cancel_enabled, unpaid_timeout_minutes)
  values (true, true, 43200)
  on conflict (id) do update
    set unpaid_cancel_enabled  = excluded.unpaid_cancel_enabled,
        unpaid_timeout_minutes = excluded.unpaid_timeout_minutes;

  select count(*) into v_older
  from public.bookings b
  where b.status = 'pending_payment' and b.created_at < now() - interval '400 days';

  select * into v_res from public.cancel_stale_bookings(v_older + 3);

  select b.status into v_s_live   from public.bookings b where b.id = v_live;
  select b.status into v_s_stale  from public.bookings b where b.id = v_stale;
  select b.status into v_s_failed from public.bookings b where b.id = v_failed;

  if v_s_live <> 'pending_payment' then
    raise exception '(ح-١) حجزٌ جلسته حيّة (created الآن) أُلغي! حالته «%» — مالٌ في الدفتر بلا حجز', v_s_live;
  end if;

  if v_s_stale <> 'cancelled' then
    raise exception '(ح-٢) حجزٌ جلسته بائتة (created قبل ٤٠٠ يوم) لم يُلغَ — حالته «%» فالحجز خالد', v_s_stale;
  end if;

  if v_s_failed <> 'cancelled' then
    raise exception '(ح-٣) حجزٌ جلسته failed لم يُلغَ — حالته «%» فالحماية تشمل حالات لا مال فيها', v_s_failed;
  end if;

  if v_res.failed <> 0 then
    raise exception '(ح-٤) العدّاد failed = % وكان صفراً متوقعاً', v_res.failed;
  end if;

  raise notice '✔ (ح) المال في الطريق: الجلسة الحيّة حمت، والبائتة والفاشلة لم تحميا';
  raise exception 'ROLLBACK_MARKER';
exception
  when others then
    if sqlerrm <> 'ROLLBACK_MARKER' then raise; end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- (ط) الملاحظة التلقائية تصل **لكل صف**، وبلا أي قيد في الدفتر
--
-- ⚠ صفّان متقادمان في نداء واحد عمداً: `tours.booking_note` يستهلكه أول مُشغّل
-- ويصفّره، فلو استُبدلت الحلقة بتحديث جماعي — أو ضُبطت الملاحظة مرة قبل الحلقة —
-- لحمل الصف الأول ملاحظته وبقي الثاني بلا سبب مكتوب. فحصُ صفٍّ واحد لا يمسك ذلك.
--
-- والدفتر: حجز `pending_payment` بلا قيود، فالإلغاء لا ينشئ قيداً. والشاهد
-- الإيجابي (صفٌّ ثالث زُرع له قيد يدوياً فظهرت له عاكسة) يثبت أن المسبار يرى
-- الدفتر أصلاً، فصفر الصفين ليس عمى قراءة.
-- ----------------------------------------------------------------------------
do $$
declare
  v_admin   text := nullif(current_setting('tours.test_admin', true), '');
  v_a       uuid := 'e0000000-0000-4000-8000-000000000001';
  v_b       uuid := 'e0000000-0000-4000-8000-000000000003';
  v_witness uuid := 'e0000000-0000-4000-8000-000000000004';
  v_older   integer;
  v_timeout integer;
  v_expect  text;
  v_bad     text;
  v_note_a  text;
  v_note_b  text;
  v_from_a  text;
  v_res     record;
  v_ledger  integer;
  v_wit     integer;
begin
  if v_admin is not null then
    perform set_config('request.jwt.claim.sub', v_admin, true);
  end if;

  insert into public.bookings (
    id, reference, public_token, status, class_slug, class_title,
    total, currency, plan, amount_due, amount_remaining,
    customer_name, customer_phone, trip, created_at
  )
  select x.id, x.ref, md5(x.id::text) || md5(x.id::text || 'b'),
         'pending_payment', 'sweep-fixture', 'فئة اختبار الكنس',
         100, 'EGP', 'full', 100, 0,
         'عميل اختبار كنس', '01000000000',
         jsonb_build_object('notes', 'TRIP_SWEEP_FIXTURE'), now() - interval '400 days'
  from (values
    (v_a,       'TR-SWEEP-01'),
    (v_b,       'TR-SWEEP-03'),
    (v_witness, 'TR-SWEEP-04')
  ) as x(id, ref);

  -- شاهد المسبار: قيد دفتر مزروع يدوياً على الحجز الثالث (لا ينشئه مسار حقيقي
  -- لحجز pending_payment — الغرض إثبات أن المسبار يقرأ ledger_entries فعلاً).
  -- ⚠ لا بد أن يحمل `settlement_role`: العكس عند الإلغاء يمسّ **أرجل المتعهد
  -- وحدها** منذ 0016 (تحصيل العميل يبقى لأن المال فعلاً في الخزينة)، فقيد بلا
  -- دور لا يُعكس — وشاهدٌ لا يُعكس ليس شاهداً. و`account_id` يبقى فارغاً لأن
  -- قيد الاستحقاق التزام لا نقد (‏ledger_entries_liability_no_account_chk).
  insert into public.ledger_entries
    (account_id, direction, amount, source_type, booking_id, settlement_role, note)
  values (null, 'out', 100, 'partner_payout', v_witness, 'earned', 'قيد شاهد — اختبار كنس');

  insert into public.trip_settings (id, unpaid_cancel_enabled, unpaid_timeout_minutes)
  values (true, true, 43200)
  on conflict (id) do update
    set unpaid_cancel_enabled  = excluded.unpaid_cancel_enabled,
        unpaid_timeout_minutes = excluded.unpaid_timeout_minutes;

  -- المهلة تُقرأ من نفس المصدر الذي تقرؤه الدالة، فنص الملاحظة مشتقٌّ لا محفور
  select c.unpaid_timeout_minutes into v_timeout from public.trip_config() c;
  v_expect := 'إلغاء تلقائي — انتهت مهلة الدفع (' || v_timeout || ' دقيقة)';

  select count(*) into v_older
  from public.bookings b
  where b.status = 'pending_payment' and b.created_at < now() - interval '400 days';

  select * into v_res from public.cancel_stale_bookings(v_older + 3);

  -- الحالات أولاً: تأكيدٌ على الملاحظة أو على الدفتر بلا إلغاء واقع لا يعني شيئاً
  select string_agg(b.reference || '=' || b.status, '، ' order by b.reference)
    into v_bad
  from public.bookings b where b.id in (v_a, v_b, v_witness) and b.status <> 'cancelled';

  if v_bad is not null then
    raise exception '(ط-٠) لم تُلغَ كل صفوف الكتلة (‏%) والردّ (%، %، %)',
      v_bad, v_res.scanned, v_res.cancelled, v_res.failed;
  end if;

  select be.note, be.from_status into v_note_a, v_from_a
  from public.booking_events be
  where be.booking_id = v_a and be.to_status = 'cancelled'
  order by be.created_at desc limit 1;

  select be.note into v_note_b
  from public.booking_events be
  where be.booking_id = v_b and be.to_status = 'cancelled'
  order by be.created_at desc limit 1;

  if v_note_a is null then
    raise exception '(ط-١) لا سطر إلغاء في booking_events للحجز الأول — الإلغاء بلا أثر مُدقَّق';
  end if;

  if v_from_a is distinct from 'pending_payment' then
    raise exception '(ط-٢) سطر السجل: توقعنا from_status = pending_payment وحصلنا «%»', coalesce(v_from_a, 'null');
  end if;

  if v_note_a <> v_expect then
    raise exception '(ط-٣) ملاحظة الصف الأول: توقعنا «%» وحصلنا «%»', v_expect, v_note_a;
  end if;

  if v_note_b is distinct from v_expect then
    raise exception '(ط-٤) ملاحظة الصف **الثاني** في نفس النداء: توقعنا «%» وحصلنا «%» — الملاحظة تُستهلك مرة واحدة، فهذا تحديث جماعي أو ضبطٌ خارج الحلقة',
      v_expect, coalesce(v_note_b, 'بلا ملاحظة');
  end if;

  -- الدفتر: صفر قيود للحجزين اللذين لا قيود لهما
  select count(*) into v_ledger
  from public.ledger_entries le where le.booking_id in (v_a, v_b);

  if v_ledger <> 0 then
    raise exception '(ط-٥) الإلغاء التلقائي أنشأ % قيداً في الدفتر لحجزين بلا قيود — أثر مالي لا يقابله مال', v_ledger;
  end if;

  -- شاهد المسبار: الحجز الثالث صار له قيدان (الأصل + عاكسته)
  select count(*) into v_wit
  from public.ledger_entries le where le.booking_id = v_witness;

  if v_wit < 2 then
    raise exception '(ط-٦) شاهد المسبار سقط: الحجز ذو القيد المزروع عنده % قيداً بعد الإلغاء (توقعنا الأصل وعاكسته) — فصفر (ط-٥) عمى قراءة لا نتيجة', v_wit;
  end if;

  if v_res.cancelled < 3 then
    raise exception '(ط-٧) توقعنا إلغاء ثلاثة حجوزات على الأقل وحصلنا %', v_res.cancelled;
  end if;

  raise notice '✔ (ط) الملاحظة التلقائية وصلت للصفين معاً، ولا قيد دفتر (والشاهد يرى الدفتر)';
  raise exception 'ROLLBACK_MARKER';
exception
  when others then
    if sqlerrm <> 'ROLLBACK_MARKER' then raise; end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- (ي) `p_limit` مُحترَم
--
-- أربعة صفوف مؤهلة تحت أيدينا، فسقف ١ ثم ٢ يجب أن يعطي scanned = ١ ثم ٢ بالضبط
-- (والرابع يبقى وقوداً لفحص المشبك).
-- ⚠ الفحص على `scanned` **الخام** لا على ما بعده: `greatest(coalesce(p_limit,200),1)`
-- تقع بين المُدخل والحلقة، فلو أكّدنا على النتيجة المقصوصة لكنّا نختبر المشبك.
-- والسقف ٠ يُختبر منفصلاً بوصفه مشبكاً معلوماً (يصير ١ لا صفراً).
-- ----------------------------------------------------------------------------
do $$
declare
  v_admin text := nullif(current_setting('tours.test_admin', true), '');
  v_i1    uuid := 'e0000000-0000-4000-8000-000000000001';
  v_i2    uuid := 'e0000000-0000-4000-8000-000000000003';
  v_i3    uuid := 'e0000000-0000-4000-8000-000000000004';
  v_i4    uuid := 'e0000000-0000-4000-8000-000000000005';
  v_res   record;
  v_left  integer;
begin
  if v_admin is not null then
    perform set_config('request.jwt.claim.sub', v_admin, true);
  end if;

  insert into public.bookings (
    id, reference, public_token, status, class_slug, class_title,
    total, currency, plan, amount_due, amount_remaining,
    customer_name, customer_phone, trip, created_at
  )
  select x.id, x.ref, md5(x.id::text) || md5(x.id::text || 'b'),
         'pending_payment', 'sweep-fixture', 'فئة اختبار الكنس',
         100, 'EGP', 'full', 100, 0,
         'عميل اختبار كنس', '01000000000',
         jsonb_build_object('notes', 'TRIP_SWEEP_FIXTURE'), now() - interval '400 days'
  from (values
    (v_i1, 'TR-SWEEP-01'),
    (v_i2, 'TR-SWEEP-03'),
    (v_i3, 'TR-SWEEP-04'),
    (v_i4, 'TR-SWEEP-05')
  ) as x(id, ref);

  insert into public.trip_settings (id, unpaid_cancel_enabled, unpaid_timeout_minutes)
  values (true, true, 43200)
  on conflict (id) do update
    set unpaid_cancel_enabled  = excluded.unpaid_cancel_enabled,
        unpaid_timeout_minutes = excluded.unpaid_timeout_minutes;

  -- سقف ١: صفٌّ واحد لا غير مهما كثر المؤهلون
  select * into v_res from public.cancel_stale_bookings(1);
  if v_res.scanned <> 1 then
    raise exception '(ي-١) p_limit = 1: توقعنا scanned = 1 وحصلنا % — السقف غير محترم', v_res.scanned;
  end if;
  if v_res.cancelled <> 1 then
    raise exception '(ي-٢) p_limit = 1: توقعنا cancelled = 1 وحصلنا %', v_res.cancelled;
  end if;

  -- سقف ٢: صفّان بالضبط (المؤهلون تحت أيدينا ما زالوا اثنين على الأقل)
  select * into v_res from public.cancel_stale_bookings(2);
  if v_res.scanned <> 2 then
    raise exception '(ي-٣) p_limit = 2: توقعنا scanned = 2 وحصلنا %', v_res.scanned;
  end if;

  -- المشبك المعلوم: صفر يصير واحداً لا صفراً (وإلا توقّف الكنس بلا سبب)
  select count(*) into v_left
  from public.bookings b
  where b.id in (v_i1, v_i2, v_i3, v_i4) and b.status = 'pending_payment';

  if v_left >= 1 then
    select * into v_res from public.cancel_stale_bookings(0);
    if v_res.scanned <> 1 then
      raise exception '(ي-٤) p_limit = 0 (مشبك greatest): توقعنا scanned = 1 وحصلنا %', v_res.scanned;
    end if;
  else
    raise notice '  ↳ (ي-٤) تُخطّي مشبك الصفر: لم يبقَ من صفوفنا مؤهل';
  end if;

  raise notice '✔ (ي) p_limit محترم: ١ ⇒ صف، و٢ ⇒ صفان، و٠ ⇒ صف واحد بالمشبك';
  raise exception 'ROLLBACK_MARKER';
exception
  when others then
    if sqlerrm <> 'ROLLBACK_MARKER' then raise; end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- (ك) عدّاد `failed` — كتلة الاستثناء لكل صف، وشكل الإرجاع
--
-- لماذا من المصدر لا بالتجربة: تفجير صفٍّ بعينه داخل الحلقة يحتاج زرع مُشغّل
-- فاشل على `bookings` — أي عبثاً بجدول حيّ لأجل اختبار. والقراءة من
-- `pg_get_functiondef` تجيب على السؤال نفسه: هل الابتلاع لكل صف أم للحلقة كلها؟
-- ومعها شاهد إيجابي حتى لا يكون المسبار مطفأً فيصمت عن كل شيء.
-- ----------------------------------------------------------------------------
do $$
declare
  v_src   text;
  v_names text[];
  v_types text[];
begin
  v_src := pg_get_functiondef(to_regprocedure('public.cancel_stale_bookings(integer)')::oid);

  if v_src is null or length(v_src) = 0 then
    raise exception '(ك-١) تعذّرت قراءة مصدر cancel_stale_bookings';
  end if;

  -- شاهد إيجابي للمسبار: رمز نعلم وجوده يقيناً بنفس أسلوب المطابقة
  if position('pg_try_advisory_xact_lock' in v_src) = 0 then
    raise exception '(ك-٢) مسبار المصدر لا يلتقط pg_try_advisory_xact_lock — المطابقة معطّلة فلا تصدّق ما بعدها';
  end if;

  if position('when others then' in v_src) = 0 then
    raise exception '(ك-٣) لا معالج «when others» في جسم الدالة — صفٌّ واحد فاشل يُسقط الكنس كله ويعيد الدورة على الصف السام إلى الأبد';
  end if;

  if position('v_failed := v_failed + 1' in v_src) = 0 then
    raise exception '(ك-٤) المعالج لا يزيد العدّاد failed — الابتلاع صامت فلا يُرى العطب';
  end if;

  if position('raise warning' in v_src) = 0 then
    raise exception '(ك-٥) المعالج لا يكتب raise warning — لا أثر في سجل الخادم للصف الفاشل';
  end if;

  -- المعالج **داخل** الحلقة: يسبقه `loop` ويليه `end loop`
  if position('loop' in v_src) = 0
     or position('when others then' in v_src) < position('loop' in v_src)
     or position('when others then' in v_src) > position('end loop' in v_src) then
    raise exception '(ك-٦) معالج الاستثناء ليس داخل حلقة الصفوف — الابتلاع للحلقة كلها لا لكل صف';
  end if;

  -- شكل الإرجاع: ثلاثة أعمدة صحيحة بالترتيب (العقد الذي تقرؤه شاشة الإعدادات)
  select array_agg(u.nm order by u.ord), array_agg(format_type(u.tp, null) order by u.ord)
    into v_names, v_types
  from pg_proc p,
       unnest(p.proargnames, p.proallargtypes, p.proargmodes) with ordinality as u(nm, tp, md, ord)
  where p.oid = to_regprocedure('public.cancel_stale_bookings(integer)')::oid
    and u.md = 't';

  if v_names is distinct from array['scanned', 'cancelled', 'failed']::text[] then
    raise exception '(ك-٧) أعمدة الإرجاع: توقعنا {scanned, cancelled, failed} بالترتيب وحصلنا %',
      coalesce(v_names::text, 'بلا أعمدة جدولية');
  end if;

  if v_types is distinct from array['integer', 'integer', 'integer']::text[] then
    raise exception '(ك-٨) أنواع أعمدة الإرجاع: توقعنا ثلاثة integer وحصلنا %', v_types::text;
  end if;

  raise notice '✔ (ك) عدّاد failed: معالج لكل صف داخل الحلقة يرفع العدّاد ويكتب تحذيراً، والإرجاع {scanned, cancelled, failed}';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ل) التنظيف — لا شيء من صفوف الاختبار يبقى، والجلسة تعود كما كانت
--
-- كل كتلة كنس تراجعت عن نفسها، فلا يُتوقع بقاء صف. والتنظيف هنا يغطي تشغيلاً
-- يدوياً سابقاً من محرر SQL، ويحذف المشرف المؤقت إن أنشأناه.
-- ----------------------------------------------------------------------------
do $$
declare
  v_admin   uuid := nullif(current_setting('tours.test_admin', true), '')::uuid;
  v_fixture text := current_setting('tours.test_admin_fixture', true);
  v_left    integer;
  v_rows    integer;
  v_before  text;
  v_after   text;
begin
  delete from public.notifications n
   where n.payload ->> 'bookingId' in (
         select b.id::text from public.bookings b
          where b.trip ->> 'notes' = 'TRIP_SWEEP_FIXTURE');
  delete from public.ledger_entries le
   where le.booking_id in (
         select b.id from public.bookings b
          where b.trip ->> 'notes' = 'TRIP_SWEEP_FIXTURE');
  delete from public.bookings b where b.trip ->> 'notes' = 'TRIP_SWEEP_FIXTURE';

  if v_fixture = '1' and v_admin is not null then
    delete from public.profiles p where p.id = v_admin;
    delete from auth.users u where u.id = v_admin;
  end if;

  select count(*) into v_left
  from public.bookings b where b.trip ->> 'notes' = 'TRIP_SWEEP_FIXTURE';
  if v_left <> 0 then
    raise exception '(ل-١) بقيت % من صفوف الاختبار بعد التنظيف', v_left;
  end if;

  -- صف الإعدادات سليم بعد كل ذلك العبث (كل تعديل كان داخل كتلة تراجعت)
  select count(*) into v_rows from public.trip_settings;
  if v_rows <> 1 then
    raise exception '(ل-٢) trip_settings انتهى بـ % صفاً — أحد التعديلات لم يتراجع', v_rows;
  end if;

  v_before := nullif(current_setting('tours.settings_before', true), '');
  select t.unpaid_cancel_enabled::text || '/' || t.unpaid_timeout_minutes::text
    into v_after
  from public.trip_settings t;

  if v_before is null then
    raise exception '(ل-٣) لقطة الإعدادات الأولى مفقودة — لا سبيل لإثبات أن القاعدة عادت كما كانت';
  end if;

  if v_after is distinct from v_before then
    raise exception '(ل-٤) إعدادات المالك تغيّرت! قبل «%» وبعد «%» — كتلةٌ ما لم تتراجع، والمفتاح العالمي بيد الاختبار',
      v_before, v_after;
  end if;

  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('tours.test_admin', '', false);
  perform set_config('tours.test_admin_fixture', '', false);
  perform set_config('tours.test_provider', '', false);
  perform set_config('tours.settings_before', '', false);

  raise notice '✔ (ل) التنظيف تم — لا صفوف اختبار، وإعدادات المالك كما كانت (%)', v_after;
end;
$$;

-- ----------------------------------------------------------------------------
-- الخلاصة
-- ----------------------------------------------------------------------------
do $$
begin
  raise notice 'ALL PASSED — إعدادات الرحلات وكنس الطلبات غير المدفوعة (0027 ق١ و ق٢)';
end;
$$;
