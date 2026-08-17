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
--   (م) 🆕 0052: الكنس بقرب الموعد لا بعمر الحجز — أربعة حجوزات لا يفرّقها إلا المتغيّر المُختبَر.
--   (ن) 🆕 0052: `booking_hold_until` تعريفٌ واحد بثلاثة فروع، ومنحُها تطابق من يعرضها.
--   (س) 🆕 0067: عمود `min_lead_minutes` وقيده، و`trip_config` رباعية، و`booking_min_pickup_at`.
--   (ع) 🆕 0067: **الحارس في `create_booking`** — داخل النافذة مرفوض، وخارجها والحدُّ مقبولان،
--                والإعداد هو الحاكم (لا ثابتٌ مدفون)، وبلا موعدٍ يمرّ.
--   (ف) 🆕 0067: 🧬 **طفرة** — نزع الحارس يجعل الحجز يمرّ، فيثبت أن تأكيد (ع-٢) يحرسه فعلاً.
--   (ص) 🆕 0067: رقم الرحلة الجوية — يُطبَّع ويُقصّ، **ولا يرفض حجزاً**، ويصل اللقطة وبوابة المتعهد.
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
  --
  -- ⚠ و`min_lead_minutes` (‏0067) **داخل اللقطة**: هو مفتاح عالمي كأخيه — رفعُه
  --   يرفض كل حجزٍ قريب على القاعدة الحيّة. فلو بقي خارج اللقطة لصار الفحص (ل-٤)
  --   يقول «عادت كما كانت» عن قاعدةٍ تركها الاختبار ترفض حجوزات المالك.
  perform set_config(
    'tours.settings_before',
    (select t.unpaid_cancel_enabled::text || '/' || t.unpaid_timeout_minutes::text
            || '/' || t.min_lead_minutes::text
       from public.trip_settings t),
    false
  );

  -- فئة الاختبار — تُستخرج من الأسطول لا تُكتب بالاسم (تُستعمل في س و ع و ف و ص)
  perform set_config(
    'tours.test_class',
    coalesce((select vc.slug from public.vehicle_classes vc
               where vc.active order by vc.capacity asc limit 1), ''),
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
  -- 0052: النصّ يذكر المقبضين معاً لأن الكنس صار مشروطاً بهما معاً
  v_expect := 'إلغاء تلقائي — مضت مهلة الدفع (' || v_timeout || ' دقيقة) واقترب موعد الرحلة';

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
-- (م) 🆕 0052 — الكنس بقرب الموعد لا بعمر الحجز وحده
--
-- العطب المقيس: الشرط كان `b.created_at < now() - timeout` **وحده**، فحجزٌ
-- لرحلةٍ بعد سنة يُلغى بالساعة نفسها التي يُلغى بها حجزُ الغد.
--
-- أربعة حجوزات، ولا يختلف اثنان منها إلا في **المتغيّر المُختبَر وحده**:
--   البعيد   — قديمٌ جداً، وموعده بعيد   ⇒ يبقى  (وهو العطب الذي أُصلح)
--   القريب   — قديمٌ جداً، وموعده قريب   ⇒ يُلغى (الشاهد الإيجابي: الكنس يعمل)
--   الطازج   — جديد،      وموعده قريب   ⇒ يبقى  (المهلة المعلنة وعدٌ لا يُقصَّر)
--   بلا موعد — قديمٌ جداً، ولا `pickupAt` ⇒ يُلغى (السلوك القديم لم ينكسر)
-- ----------------------------------------------------------------------------
do $$
declare
  v_admin    text := nullif(current_setting('tours.test_admin', true), '');
  v_far      uuid := 'e0000000-0000-4000-8000-000000000052';
  v_near     uuid := 'e0000000-0000-4000-8000-000000000053';
  v_fresh    uuid := 'e0000000-0000-4000-8000-000000000054';
  v_nopick   uuid := 'e0000000-0000-4000-8000-000000000055';
  v_timeout  integer;
  v_total    integer;
  v_res      record;
  v_hold     timestamptz;
  v_st       text;
begin
  if to_regprocedure('public.booking_hold_until(timestamptz,timestamptz)') is null
     or to_regprocedure('public.trip_pickup_at(jsonb)') is null then
    raise exception '(م-٠) دوال 0052 مفقودة — نفّذ 0052_assignment_guards.sql أولاً';
  end if;

  if v_admin is not null then
    perform set_config('request.jwt.claim.sub', v_admin, true);
  end if;

  insert into public.trip_settings (id, unpaid_cancel_enabled, unpaid_timeout_minutes)
  values (true, true, 43200)
  on conflict (id) do update
    set unpaid_cancel_enabled  = excluded.unpaid_cancel_enabled,
        unpaid_timeout_minutes = excluded.unpaid_timeout_minutes;

  -- التوقّعات تُشتق من نفس مصدر الدالة، لا من رقمٍ محفور (اتفاقية ٨)
  select c.unpaid_timeout_minutes into v_timeout from public.trip_config() c;

  insert into public.bookings (
    id, reference, public_token, status, class_slug, class_title,
    total, currency, plan, amount_due, amount_remaining,
    customer_name, customer_phone, trip, created_at
  )
  select x.id, x.ref, md5(x.id::text) || md5(x.id::text || 'b'),
         'pending_payment', 'sweep-fixture', 'فئة اختبار الكنس',
         100, 'EGP', 'full', 100, 0,
         'عميل اختبار كنس', '01000000000',
         case when x.pick is null
              then jsonb_build_object('notes', 'TRIP_SWEEP_FIXTURE')
              else jsonb_build_object('notes', 'TRIP_SWEEP_FIXTURE',
                                      'pickupAt', to_char(x.pick, 'YYYY-MM-DD"T"HH24:MI:SSOF'))
         end,
         x.created
  from (values
    (v_far,    'TR-SWEEP-52', now() - interval '400 days',
                              now() + make_interval(mins => v_timeout) + interval '30 days'),
    (v_near,   'TR-SWEEP-53', now() - interval '400 days', now() + interval '1 hour'),
    (v_fresh,  'TR-SWEEP-54', now() - interval '1 minute', now() + interval '1 hour'),
    (v_nopick, 'TR-SWEEP-55', now() - interval '400 days', null::timestamptz)
  ) as x(id, ref, created, pick);

  -- ── مسبار المسبار (١): الموعد قُرئ فعلاً من اللقطة، وإلا فكل ما يلي يقيس null
  if public.trip_pickup_at((select b.trip from public.bookings b where b.id = v_far))
     is null then
    raise exception '(م-٠) trip_pickup_at لم تقرأ موعد الحجز البعيد — الفيكسترة لم تُبنَ';
  end if;

  -- ── مسبار المسبار (٢): البعيد **متقادمٌ بالقاعدة القديمة** — أي أنه كان يُكنَس
  if not (select b.created_at < now() - make_interval(mins => v_timeout)
            from public.bookings b where b.id = v_far) then
    raise exception '(م-٠) الحجز البعيد ليس متقادماً بالقاعدة القديمة — الفحص لا يقيس التغيير';
  end if;

  select public.booking_hold_until(b.created_at, public.trip_pickup_at(b.trip))
    into v_hold from public.bookings b where b.id = v_far;
  if v_hold <= now() then
    raise exception '(م-٠) موعد كنس الحجز البعيد % ماضٍ — الصيغة لا تحمي المبكّر', v_hold;
  end if;

  select count(*) into v_total from public.bookings b where b.status = 'pending_payment';
  select * into v_res from public.cancel_stale_bookings(v_total + 5);

  select b.status into v_st from public.bookings b where b.id = v_near;
  if v_st <> 'cancelled' then
    raise exception '(م-١) الحجز القريب لم يُكنَس (حالته «%») — الكنس لا يعمل، وكل ما بعده عمى', v_st;
  end if;

  select b.status into v_st from public.bookings b where b.id = v_far;
  if v_st <> 'pending_payment' then
    raise exception '(م-٢) 🔴 حجزٌ لرحلةٍ بعيدة أُلغي بساعة حجزِ الغد (حالته «%») — عطبُ 0052 قائم', v_st;
  end if;

  select b.status into v_st from public.bookings b where b.id = v_fresh;
  if v_st <> 'pending_payment' then
    raise exception '(م-٣) 🔴 حجزٌ صاحبُه ما زال داخل مهلته المعلنة أُلغي (حالته «%») — الوعد مكسور', v_st;
  end if;

  select b.status into v_st from public.bookings b where b.id = v_nopick;
  if v_st <> 'cancelled' then
    raise exception '(م-٤) حجزٌ بلا موعدٍ ومتقادم لم يُكنَس (حالته «%») — السلوك القديم انكسر', v_st;
  end if;

  raise notice '✔ (م) الكنس يحترم قرب الموعد: البعيد باقٍ والقريب مكنوس والطازج محفوظ وبلا موعدٍ كما كان (‏%، %، %)',
    v_res.scanned, v_res.cancelled, v_res.failed;
  raise exception 'ROLLBACK_MARKER';
exception
  when others then
    if sqlerrm <> 'ROLLBACK_MARKER' then raise; end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- (ن) 🆕 0052 — صيغة «حجزك محفوظ حتى…» مصدرٌ واحد، ومنحُها تطابق مَن يعرضها
-- ----------------------------------------------------------------------------
do $$
declare
  v_t   integer;
  v_c   timestamptz := now() - interval '2 hours';
  v_p   timestamptz;
  v_got timestamptz;
begin
  -- 🔴 هذه الكتلة تقرأ **مهلة المالك الحيّة** ولا تثبّتها — وهو مقصودٌ هنا: ما
  --    يُقاس فرعُ `greatest` الفائز، لا رقمٌ بعينه. لكن الفرعَ الفائز كان محسوماً
  --    بمسافتين محفورتين (`10 days` و`1 hour`)، فصار للتأكيد نطاقُ صلاحيةٍ ضمني:
  --    (ن-٢) يمرّ ما دامت المهلة ≤ ١٤٥٢٠ دقيقة، و(ن-٣) ما دامت ≥ ٩٠ — والعمود
  --    يقبل ١٥ … ٤٣٢٠٠. فمالكٌ يكتب «ادفع خلال ساعة» يُحمّر (ن-٣)، ومالكٌ يكتب
  --    «ثلاثون يوماً» يُحمّر (ن-٢) — وهي القيمة التي تثبّتها فيكسترات هذا الملف
  --    نفسه. (إصلاح حمرةٍ صنفية، 2026-08-17 · النمط ٦.)
  --
  -- 🔒 والعلاج: تُقاس المسافتان **من حدّ الفرعين نفسه**. الحدّ عند
  --    `pickup = created + 2×timeout` (لأن الفرعين `created+t` و`pickup−t`)،
  --    فساعةٌ فوقه وساعةٌ تحته تحسمان الفرع لأي مهلةٍ قانونية مهما بلغت.
  select c.unpaid_timeout_minutes into v_t from public.trip_config() c;

  -- بلا موعد: العمر وحده
  v_got := public.booking_hold_until(v_c, null);
  if v_got is distinct from v_c + make_interval(mins => v_t) then
    raise exception '(ن-١) بلا موعد: توقعنا % وحصلنا %', v_c + make_interval(mins => v_t), v_got;
  end if;

  -- موعدٌ بعيد (ساعةٌ **فوق** الحدّ): الموعد ناقص المهلة هو الحاكم
  v_p   := v_c + make_interval(mins => 2 * v_t) + interval '1 hour';
  v_got := public.booking_hold_until(v_c, v_p);
  if v_got is distinct from v_p - make_interval(mins => v_t) then
    raise exception '(ن-٢) موعدٌ بعيد: توقعنا % وحصلنا % (المهلة % دقيقة)',
      v_p - make_interval(mins => v_t), v_got, v_t;
  end if;

  -- موعدٌ قريب (ساعةٌ **تحت** الحدّ): المهلة الكاملة هي الحاكمة — فالوعد لا يُقصَّر
  v_p   := v_c + make_interval(mins => 2 * v_t) - interval '1 hour';
  v_got := public.booking_hold_until(v_c, v_p);
  if v_got is distinct from v_c + make_interval(mins => v_t) then
    raise exception '(ن-٣) موعدٌ قريب: توقعنا % وحصلنا % (المهلة % دقيقة)',
      v_c + make_interval(mins => v_t), v_got, v_t;
  end if;

  -- 🔒 والمنحة: `/booking/[token]` صفحةٌ عامة، فبلا anon لا وعدَ يُعرض
  if not has_function_privilege('anon',
       'public.booking_hold_until(timestamptz,timestamptz)', 'execute') then
    raise exception '(ن-٤) anon لا ينفّذ booking_hold_until — صفحة الحجز العامة لن تعرض «محفوظ حتى…»';
  end if;
  -- وفي المقابل: `trip_pickup_at` تلمس لقطة الرحلة، فلا تُمنح للزائر
  if has_function_privilege('anon', 'public.trip_pickup_at(jsonb)', 'execute') then
    raise exception '(ن-٥) anon ينفّذ trip_pickup_at — منحةٌ بلا حاجة';
  end if;

  raise notice '✔ (ن) booking_hold_until تعريفٌ واحد بثلاثة فروع صحيحة، ومنحُها تطابق من يعرضها';
end;
$$;


-- ============================================================================
-- 🆕 0067 — أدنى مهلة قبل الانطلاق (أ‑٢) ورقم الرحلة الجوية (ج‑٣)
--
-- ⚠⚠ **كل كتلة أدناه تتراجع عن نفسها** بـ`ROLLBACK_MARKER` — ولها هنا سببان
-- لا سبب واحد:
--   • `min_lead_minutes` مفتاحٌ **عالمي** كأخيه: رفعُه يرفض كل حجزٍ قريب على
--     القاعدة الحيّة، فبقاؤه مرفوعاً بعد الاختبار عطبٌ في تشغيل المالك.
--   • والكتل تنشئ حجوزاتٍ حقيقية عبر `create_booking` (مرجعاً وتوكناً وقيوداً
--     وإشعارات) — والتراجع أنظف من التنظيف بعد الحدث.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (س) البنية: العمود وقيده، و`trip_config()` الرباعية، و`booking_min_pickup_at`
--
-- ولماذا تُفحص البنية أصلاً وقد فحصتها الهجرة؟ لأن فحص الهجرة يقع **مرة واحدة
-- لحظة تطبيقها**، وهذا يقع في كل تشغيل — فيمسك من عدّل الدالة بعدها بيده أو
-- بهجرةٍ تالية غافلة.
-- ----------------------------------------------------------------------------
do $$
declare
  v_n      integer;
  v_ok     boolean;
  v_cols   text;
  v_min    timestamptz;
  v_before timestamptz;
begin
  -- (س-١) أعمدة `trip_config()` الأربعة بترتيبها
  select string_agg(x.name, ',' order by x.ord) into v_cols
  from (
    select p.proargnames[i] as name, i as ord
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace,
         generate_subscripts(p.proargnames, 1) i
    where n.nspname = 'public' and p.proname = 'trip_config'
  ) x;

  if v_cols is distinct from
     'unpaid_cancel_enabled,unpaid_timeout_minutes,driver_phone_lead_minutes,min_lead_minutes' then
    raise exception '(س-١) أعمدة trip_config() «%» — 0067 غير مطبَّقة أو أُزيحت', coalesce(v_cols, 'null');
  end if;

  -- (س-٢) القيد يرفض السالب و١٠٠٨١، **ومعه شاهدان إيجابيان**: صفر و١٠٠٨٠ تمرّان.
  --       بلا الشاهدين لا يفرّق الفحص بين «قيدٌ يعمل» و«جدولٌ لا يقبل شيئاً».
  v_ok := false;
  begin
    update public.trip_settings set min_lead_minutes = -1 where id;
  exception when check_violation then v_ok := true;
  end;
  if not v_ok then
    raise exception '(س-٢أ) القيد قبل مهلةً سالبة';
  end if;

  v_ok := false;
  begin
    update public.trip_settings set min_lead_minutes = 10081 where id;
  exception when check_violation then v_ok := true;
  end;
  if not v_ok then
    raise exception '(س-٢ب) القيد قبل ١٠٠٨١ دقيقة — السقف (سبعة أيام) لا يُفرض';
  end if;

  update public.trip_settings set min_lead_minutes = 0     where id;
  update public.trip_settings set min_lead_minutes = 10080 where id;

  -- (س-٣) 🔒 صفر يعني **«لا قيد»** لا «الآن»: الدالة ترجع `null` صراحةً.
  --       والفرق ليس لغوياً — عليه يسقط شرط الحارس كله، وعليه تمتنع الواجهة
  --       عن عرض جملةٍ تَعِد بقيدٍ لا وجود له.
  update public.trip_settings set min_lead_minutes = 0 where id;
  if public.booking_min_pickup_at() is not null then
    raise exception '(س-٣) المهلة صفر و`booking_min_pickup_at` ترجع % لا null',
      public.booking_min_pickup_at();
  end if;

  -- (س-٤) والقيمة تحكم الناتج: ٩٠ دقيقة ⇒ الآن + ٩٠ بالضبط
  update public.trip_settings set min_lead_minutes = 90 where id;
  v_before := now() + interval '90 minutes';
  v_min    := public.booking_min_pickup_at();
  if v_min is distinct from v_before then
    raise exception '(س-٤) ٩٠ دقيقة: توقعنا % وحصلنا %', v_before, v_min;
  end if;

  -- (س-٥) و**رقمٌ آخر يعطي حدّاً آخر** — الشاهد على أن الإعداد هو الذي يحكم
  --       لا ثابتٌ مدفون في جسم الدالة (وهو ما كان سيمرّ لو فُحصت قيمة واحدة).
  update public.trip_settings set min_lead_minutes = 240 where id;
  v_before := now() + interval '240 minutes';
  v_min    := public.booking_min_pickup_at();
  if v_min is distinct from v_before then
    raise exception '(س-٥) ٢٤٠ دقيقة: توقعنا % وحصلنا % — الحدّ لا يتبع الإعداد', v_before, v_min;
  end if;

  -- (س-٦) الصلاحيات: لا زائر ولا `authenticated` (وكل متعهد authenticated).
  --       والشاهد الإيجابي للمسبار مأخوذ في (هـ-٢) أعلاه.
  if has_function_privilege('authenticated', 'public.booking_min_pickup_at()', 'execute') then
    raise exception '(س-٦أ) booking_min_pickup_at ممنوحة لـ authenticated — سياسة تشغيل تُقرأ بلا حاجة';
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon')
     and has_function_privilege('anon', 'public.booking_min_pickup_at()', 'execute') then
    raise exception '(س-٦ب) booking_min_pickup_at ممنوحة لـ anon';
  end if;

  select count(*) into v_n from public.trip_settings;
  if v_n <> 1 then
    raise exception '(س-٧) trip_settings صار % صفاً أثناء الفحص', v_n;
  end if;

  raise notice '✔ (س) العمود وقيده (٠..١٠٠٨٠)، وtrip_config رباعية، وbooking_min_pickup_at تتبع الإعداد وترجع null عند الصفر';
  raise exception 'ROLLBACK_MARKER';
exception
  when others then
    if sqlerrm <> 'ROLLBACK_MARKER' then raise; end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- (ع) 🔴 الحارس نفسه — **القاعدة هي التي ترفض، لا الشاشة**
--
-- هذا هو القسم الذي يحمل البند كله: كل ما قبله بنية، وكل ما بعده طفرةٌ تقيس
-- قوّته. والتأكيدات الأربعة بأربع صياغات لا واحدة مكرّرة:
--   (ع-٢) داخل النافذة ⇒ **مرفوض** بتلميح `lead-time` لا برمزٍ عام
--   (ع-٣) خارجها بدقيقة ⇒ **مقبول** (شاهدٌ إيجابي: الرفض ليس لسببٍ آخر)
--   (ع-٤) على الحدّ بالضبط ⇒ **مقبول** — الحدّ أقرب لحظة مسموحة لا أول ممنوعة
--   (ع-٥) الإعداد هو الذي يحكم: موعدٌ **واحد** يُقبل بمهلةٍ ويُرفض بأخرى
--   (ع-٦) 🔴 بلا موعد ⇒ **يُرفض** بتلميح `pickup-required` (‏0081، قرار المالك)
-- ----------------------------------------------------------------------------
do $$
declare
  v_class  text := nullif(current_setting('tours.test_class', true), '');
  v_res    record;
  v_ok     boolean;
  v_hint   text;
  v_msg    text;
  v_when   timestamptz;
begin
  if v_class is null then
    raise notice '  ↳ (ع) لا فئة سيارات نشطة على هذه القاعدة — فحوص الحارس تُتخطّى';
    raise exception 'ROLLBACK_MARKER';
  end if;

  -- (ع-١) شاهدٌ إيجابي أولاً: بلا مهلة يمرّ موعدٌ بعد عشر دقائق.
  --       بدونه لا نعرف إن كان الرفض لاحقاً بسبب المهلة أم بسبب المحرّك نفسه.
  update public.trip_settings set min_lead_minutes = 0 where id;
  select * into v_res from public.create_booking(
    '{"label": "القاهرة", "lat": 30.0444, "lng": 31.2357}'::jsonb,
    '{"label": "الإسكندرية", "lat": 31.2001, "lng": 29.9187}'::jsonb,
    1, false, 0, 220, 180, 'osrm', v_class, 'full',
    'اختبار المهلة', '01000000000', null,
    now() + interval '10 minutes', 'TRIP_SWEEP_FIXTURE'
  );
  if v_res.public_token is null then
    raise exception '(ع-١) شاهد المسبار سقط: الحجز لم يُنشأ والمهلة مطفأة — فلا تصدّق أي رفضٍ بعده';
  end if;

  -- (ع-٢) ١٨٠ دقيقة ⇒ **نفس الحجز يُرفض**، وبتلميحٍ مسمّى
  update public.trip_settings set min_lead_minutes = 180 where id;

  v_ok := false;
  begin
    perform * from public.create_booking(
      '{"label": "القاهرة", "lat": 30.0444, "lng": 31.2357}'::jsonb,
      '{"label": "الإسكندرية", "lat": 31.2001, "lng": 29.9187}'::jsonb,
      1, false, 0, 220, 180, 'osrm', v_class, 'full',
      'اختبار المهلة', '01000000000', null,
      now() + interval '10 minutes', 'TRIP_SWEEP_FIXTURE'
    );
  exception when others then
    v_ok  := true;
    v_msg := sqlerrm;
    -- 🔒 التلميح لا نصّ الرسالة: الواجهة تفرّع عليه (‏`hint='lead-time'` ⇒ ٤٠٩
    --    وإعادةُ العميل إلى الخطوة الأولى). تلميحٌ عام كان يجعل الرسالة «راجع
    --    الحقول» على نموذجٍ كل ما فيه صحيح.
    get stacked diagnostics v_hint = pg_exception_hint;
  end;

  if not v_ok then
    raise exception '(ع-٢أ) 🔴 حجزٌ بعد عشر دقائق مرّ والمهلة ١٨٠ دقيقة — الحارس لا يعمل';
  end if;
  if coalesce(v_hint, '') <> 'lead-time' then
    raise exception '(ع-٢ب) رُفض بتلميح «%» لا «lead-time» — الواجهة تفرّع على التلميح (الرسالة: %)',
      coalesce(v_hint, 'بلا تلميح'), v_msg;
  end if;

  -- (ع-٣) خارج النافذة بدقيقة ⇒ يمرّ
  select * into v_res from public.create_booking(
    '{"label": "القاهرة", "lat": 30.0444, "lng": 31.2357}'::jsonb,
    '{"label": "الإسكندرية", "lat": 31.2001, "lng": 29.9187}'::jsonb,
    1, false, 0, 220, 180, 'osrm', v_class, 'full',
    'اختبار المهلة', '01000000000', null,
    now() + interval '181 minutes', 'TRIP_SWEEP_FIXTURE'
  );
  if v_res.public_token is null then
    raise exception '(ع-٣) موعدٌ خارج النافذة رُفض — الحارس يمنع ما يجب أن يمرّ';
  end if;

  -- (ع-٤) 🔒 **الحدّ بالضبط مقبول.** المقارنة `<` لا `<=` بقصد: ما تعرضه
  --       الشاشة بوصفه «أقرب موعد متاح» يجب أن يمرّ لو اختاره العميل، وإلا
  --       قدّمت الشاشة الرقم المستحيل بنفسها. و`now()` ثابتة داخل المعاملة
  --       فالمقارنة على الحدّ حتمية لا سباق.
  v_when := public.booking_min_pickup_at();
  if v_when is null then
    raise exception '(ع-٤أ) booking_min_pickup_at ترجع null والمهلة ١٨٠ — لا حدّ نختبره';
  end if;

  select * into v_res from public.create_booking(
    '{"label": "القاهرة", "lat": 30.0444, "lng": 31.2357}'::jsonb,
    '{"label": "الإسكندرية", "lat": 31.2001, "lng": 29.9187}'::jsonb,
    1, false, 0, 220, 180, 'osrm', v_class, 'full',
    'اختبار المهلة', '01000000000', null, v_when, 'TRIP_SWEEP_FIXTURE'
  );
  if v_res.public_token is null then
    raise exception '(ع-٤ب) الحدّ نفسه (%) رُفض — الشاشة تعرضه «أقرب موعد متاح»', v_when;
  end if;

  -- وميكرو ثانية قبله ⇒ يُرفض: الحدّ **حادّ** لا تقريبي
  v_ok := false;
  begin
    perform * from public.create_booking(
      '{"label": "القاهرة", "lat": 30.0444, "lng": 31.2357}'::jsonb,
      '{"label": "الإسكندرية", "lat": 31.2001, "lng": 29.9187}'::jsonb,
      1, false, 0, 220, 180, 'osrm', v_class, 'full',
      'اختبار المهلة', '01000000000', null,
      v_when - interval '1 microsecond', 'TRIP_SWEEP_FIXTURE'
    );
  exception when others then v_ok := true;
  end;
  if not v_ok then
    raise exception '(ع-٤ج) ميكرو ثانية قبل الحدّ مرّت — الحدّ ليس حادّاً';
  end if;

  -- (ع-٥) 🔑 **الإعداد هو الذي يحكم**: موعدٌ واحد بعينه (بعد ١٢٠ دقيقة) يُقبل
  --       بمهلة ٦٠ ويُرفض بمهلة ٢٤٠. ولولا هذا التأكيد لمرّ ثابتٌ مدفون في
  --       جسم الدالة بكل ما سبق.
  v_when := now() + interval '120 minutes';

  update public.trip_settings set min_lead_minutes = 60 where id;
  select * into v_res from public.create_booking(
    '{"label": "القاهرة", "lat": 30.0444, "lng": 31.2357}'::jsonb,
    '{"label": "الإسكندرية", "lat": 31.2001, "lng": 29.9187}'::jsonb,
    1, false, 0, 220, 180, 'osrm', v_class, 'full',
    'اختبار المهلة', '01000000000', null, v_when, 'TRIP_SWEEP_FIXTURE'
  );
  if v_res.public_token is null then
    raise exception '(ع-٥أ) موعدٌ بعد ساعتين رُفض والمهلة ٦٠ دقيقة';
  end if;

  update public.trip_settings set min_lead_minutes = 240 where id;
  v_ok := false;
  begin
    perform * from public.create_booking(
      '{"label": "القاهرة", "lat": 30.0444, "lng": 31.2357}'::jsonb,
      '{"label": "الإسكندرية", "lat": 31.2001, "lng": 29.9187}'::jsonb,
      1, false, 0, 220, 180, 'osrm', v_class, 'full',
      'اختبار المهلة', '01000000000', null, v_when, 'TRIP_SWEEP_FIXTURE'
    );
  exception when others then v_ok := true;
  end;
  if not v_ok then
    raise exception '(ع-٥ب) 🔴 الموعد نفسه مرّ بمهلة ٢٤٠ كما مرّ بمهلة ٦٠ — الحدّ ثابتٌ لا يتبع الإعداد';
  end if;

  -- (ع-٦) 🔴 **بلا موعد ⇒ مرفوض** — 0081، قرار المالك 2026-08-17: «غير موافق
  --       على الحجز بدون موعد».
  --
  --       وكان هذا التأكيد مقلوباً حتى 0081 («يمرّ»)، بحجّةٍ صحيحة في نطاقها:
  --       حجزٌ بلا موعد لا يخالف **مهلةً** أصلاً. لكن الحجّة كانت تُجيب عن سؤال
  --       المهلة وحده، وتترك الباب مفتوحاً لِما هو أوسع: حجزٌ بلا موعد لا يُبَثّ
  --       ولا يُكنس ولا يُنفَّذ، **ويتجاوز حارس المهلة كلياً** لأن شرطه مشروطٌ
  --       بـ`is not null`. فصار الرفض في الدالة نفسها.
  --
  -- 🔒 والتلميح لا نصّ الرسالة: الواجهة تفرّع عليه (‏`pickup-required` ⇒ ٤٠٠
  --    وإعادةُ العميل إلى الخطوة الأولى)، و`invalid-input` كان سيعطيه «راجع
  --    الحقول» على نموذجٍ حقلُه الناقص واحدٌ معروف.
  v_ok := false;
  begin
    perform * from public.create_booking(
      '{"label": "القاهرة", "lat": 30.0444, "lng": 31.2357}'::jsonb,
      '{"label": "الإسكندرية", "lat": 31.2001, "lng": 29.9187}'::jsonb,
      1, false, 0, 220, 180, 'osrm', v_class, 'full',
      'اختبار المهلة', '01000000000', null, null, 'TRIP_SWEEP_FIXTURE'
    );
  exception when others then
    v_ok  := true;
    v_msg := sqlerrm;
    get stacked diagnostics v_hint = pg_exception_hint;
  end;

  if not v_ok then
    raise exception '(ع-٦أ) 🔴 حجزٌ بلا موعد مرّ — قرار المالك «لا حجز بلا موعد» غير مفروضٍ في القاعدة';
  end if;
  if coalesce(v_hint, '') <> 'pickup-required' then
    raise exception '(ع-٦ب) رُفض بتلميح «%» لا «pickup-required» — الواجهة تفرّع على التلميح (الرسالة: %)',
      coalesce(v_hint, 'بلا تلميح'), v_msg;
  end if;

  -- (ع-٧) 🔒 **والحدّ لم يزحف**: الموعد الموجود الصحيح ما زال يمرّ بعد 0081.
  --       بدون هذا الشاهد قد يكون (ع-٦) رفضاً عاماً أصاب كل حجز.
  update public.trip_settings set min_lead_minutes = 0 where id;
  select * into v_res from public.create_booking(
    '{"label": "القاهرة", "lat": 30.0444, "lng": 31.2357}'::jsonb,
    '{"label": "الإسكندرية", "lat": 31.2001, "lng": 29.9187}'::jsonb,
    1, false, 0, 220, 180, 'osrm', v_class, 'full',
    'اختبار المهلة', '01000000000', null,
    now() + interval '3 days', 'TRIP_SWEEP_FIXTURE'
  );
  if v_res.public_token is null then
    raise exception '(ع-٧) حجزٌ بموعدٍ صحيح رُفض بعد 0081 — الحارس ابتلع الحالة السليمة';
  end if;

  raise notice '✔ (ع) الحارس في القاعدة: داخل النافذة مرفوض بـlead-time، وخارجها والحدُّ نفسه مقبولان، والإعداد هو الحاكم، وبلا موعدٍ **مرفوض** بـpickup-required';
  raise exception 'ROLLBACK_MARKER';
exception
  when others then
    if sqlerrm <> 'ROLLBACK_MARKER' then raise; end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- (ف) 🧬 **الطفرة** — هل للتأكيد (ع-٢) قوّة تمييز أصلاً؟
--
-- سؤال `handover/LESSONS.md` النمط ٥ حرفياً: «لو انعكس السلوك، هل يفشل؟».
-- ولا يُجاب عنه بالقراءة — يُجاب بأن **نكسر الحارس ونرى**.
--
-- والطفرة تقع على `booking_min_pickup_at()` لا على جسم `create_booking`: هي
-- **المصدر الوحيد** الذي يقرأ منه الحارس (وهو بالضبط عقد `booking_hold_until`
-- في 0052)، فتحييدها = نزع الحارس بلا لمس أربعمئة سطر. والدالة تعود بـ`null`
-- دائماً — وهو المعنى الحرفي لـ«لا قيد».
--
-- ثم يُعاد التعريف الأصلي **من `pg_get_functiondef`** (‏D-58: من الكتالوج الحيّ
-- لا من ملف)، ويُفحص أن الطفرة لم تنجُ.
-- ----------------------------------------------------------------------------
do $$
declare
  v_class    text := nullif(current_setting('tours.test_class', true), '');
  v_original text;
  v_res      record;
  v_survived boolean;
begin
  if v_class is null then
    raise notice '  ↳ (ف) لا فئة سيارات نشطة — اختبار الطفرة يُتخطّى';
    raise exception 'ROLLBACK_MARKER';
  end if;

  select pg_get_functiondef(p.oid) into v_original
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'booking_min_pickup_at';

  if v_original is null then
    raise exception '(ف-٠) booking_min_pickup_at غير موجودة — 0067 لم تُطبَّق';
  end if;

  update public.trip_settings set min_lead_minutes = 180 where id;

  -- 🧬 نزع الحارس: المصدر يعود null دائماً ⇒ شرط `create_booking` يسقط كله
  execute $mut$
    create or replace function public.booking_min_pickup_at()
    returns timestamptz
    language sql
    stable
    security definer
    set search_path = ''
    as $mutant$ select null::timestamptz /* MUTANT_0067 */ $mutant$;
  $mut$;

  -- ونعيد **نفس** نداء (ع-٢) الذي كان يُرفض
  v_survived := false;
  begin
    select * into v_res from public.create_booking(
      '{"label": "القاهرة", "lat": 30.0444, "lng": 31.2357}'::jsonb,
      '{"label": "الإسكندرية", "lat": 31.2001, "lng": 29.9187}'::jsonb,
      1, false, 0, 220, 180, 'osrm', v_class, 'full',
      'اختبار الطفرة', '01000000000', null,
      now() + interval '10 minutes', 'TRIP_SWEEP_FIXTURE'
    );
    v_survived := v_res.public_token is not null;
  exception when others then
    v_survived := false;
  end;

  -- 🔴 المطلوب أن **تنجو الطفرة**: أي أن نزع الحارس يجعل الحجز يمرّ.
  --    فلو بقي مرفوضاً لكان الرفض في (ع-٢) واقعاً لسببٍ آخر — تحقّقٍ في مكانٍ
  --    ثانٍ، أو مصادفةٍ في المدخلات — و**تأكيدُ (ع-٢) كله زينة**.
  if not v_survived then
    raise exception
      '(ف-١) 🧬 الطفرة قُتلت: نزعنا الحارس (booking_min_pickup_at ⇒ null) والحجز ما زال مرفوضاً. أي أن رفض (ع-٢) ليس من هذا الحارس — التأكيد لا يحرس ما نظنّه';
  end if;

  -- الاستعادة **من الكتالوج الحيّ** لا من نصٍّ مكتوب هنا (D-58)
  execute v_original;

  if position('MUTANT_0067' in (
       select pg_get_functiondef(p.oid)
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'booking_min_pickup_at')) > 0 then
    raise exception '(ف-٢) الطفرة نجت بعد الاستعادة — الدالة الحيّة ما زالت المُطفَّرة';
  end if;

  raise notice '✔ (ف) اختبار الطفرة: نزع الحارس يجعل الحجز يمرّ ⇒ تأكيد (ع-٢) يحرس الحارس نفسه لا شيئاً آخر';
  raise exception 'ROLLBACK_MARKER';
exception
  when others then
    if sqlerrm <> 'ROLLBACK_MARKER' then raise; end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- (ق) 🧬 **الطفرة الثانية** — هل لتأكيد (ع-٦) قوّة تمييز؟
--
-- (ع-٦) يقول: «حجزٌ بلا موعد يُرفض بـ`pickup-required`». وسؤال النمط ٥ هو
-- نفسه: **لو انعكس السلوك، هل يفشل التأكيد؟** ولا يُجاب بالقراءة.
--
-- ⚠ وموضع الطفرة هنا غير موضع أختها في (ف): هناك كان للحارس **مصدرٌ خارجي**
-- (`booking_min_pickup_at`) فكفى تحييده. وهنا الحارس **ثلاثة أسطر داخل جسم
-- `create_booking` نفسه**، فلا مصدرَ يُحيَّد — والطفرة تُبنى بنزع تلك الأسطر
-- من **الجسم الحيّ نصّاً** (‏D-58: من `pg_get_functiondef` لا من ملف هجرة)،
-- ثم يُعاد التعريف الأصلي من النسخة نفسها.
--
-- والمطلوب أن **تنجو الطفرة**: أي أن نزع الأسطر يجعل حجزاً بلا موعد يمرّ.
-- فلو بقي مرفوضاً لكان رفضُ (ع-٦) من مكانٍ آخر — و(ع-٦) كله زينة.
-- ----------------------------------------------------------------------------
do $$
declare
  v_class    text := nullif(current_setting('tours.test_class', true), '');
  v_original text;
  v_mutant   text;
  v_res      record;
  v_survived boolean;
begin
  if v_class is null then
    raise notice '  ↳ (ق) لا فئة سيارات نشطة — اختبار الطفرة الثانية يُتخطّى';
    raise exception 'ROLLBACK_MARKER';
  end if;

  select pg_get_functiondef(p.oid) into v_original
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'create_booking';

  if v_original is null then
    raise exception '(ق-٠) create_booking غير موجودة';
  end if;

  -- 🧬 نزع الحارس نصّاً من الجسم الحيّ. و`perform 1` بدل الحذف الكامل كي يبقى
  --    الفرع `if … then … end if;` نحوياً سليماً.
  v_mutant := replace(
    v_original,
    $need$    raise exception 'موعد الانطلاق مطلوب — لا يُنشأ حجزٌ بلا موعد'
      using hint = 'pickup-required';$need$,
    $none$    perform 1; /* MUTANT_0081 */$none$
  );

  -- 🔴 والطفرة **تُبنى فعلاً أو يسقط الاختبار**: نصٌّ لم يتغيّر يعني أن الحارس
  --    ليس في الجسم بهذه الصياغة — فلا يُقاس بعده شيء، ولا يُقال «نجحت».
  if v_mutant = v_original then
    raise exception '(ق-١) 🧬 الطفرة لم تُبنَ: أسطر الحارس غير موجودة في الجسم الحيّ بنصّها — إمّا 0081 لم تُطبَّق وإمّا صياغتها تغيّرت';
  end if;

  execute v_mutant;

  update public.trip_settings set min_lead_minutes = 0 where id;

  v_survived := false;
  begin
    select * into v_res from public.create_booking(
      '{"label": "القاهرة", "lat": 30.0444, "lng": 31.2357}'::jsonb,
      '{"label": "الإسكندرية", "lat": 31.2001, "lng": 29.9187}'::jsonb,
      1, false, 0, 220, 180, 'osrm', v_class, 'full',
      'اختبار الطفرة', '01000000000', null, null, 'TRIP_SWEEP_FIXTURE'
    );
    v_survived := v_res.public_token is not null;
  exception when others then
    v_survived := false;
  end;

  -- الاستعادة **قبل** أي رفع خطأ: لا تُترك دالةُ الحجز مُطفَّرة بحال
  execute v_original;

  if not v_survived then
    raise exception
      '(ق-٢) 🧬 الطفرة قُتلت: نزعنا أسطر الحارس والحجزُ بلا موعد ما زال مرفوضاً. أي أن رفض (ع-٦) ليس من هذا الحارس — التأكيد لا يحرس ما نظنّه';
  end if;

  if position('MUTANT_0081' in (
       select pg_get_functiondef(p.oid)
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'create_booking')) > 0 then
    raise exception '(ق-٣) الطفرة نجت بعد الاستعادة — create_booking الحيّة ما زالت المُطفَّرة';
  end if;

  raise notice '✔ (ق) 🧬 الطفرة الثانية: نزع أسطر الحارس يجعل الحجز بلا موعد يمرّ ⇒ تأكيد (ع-٦) حيّ';
  raise exception 'ROLLBACK_MARKER';
exception
  when others then
    if sqlerrm <> 'ROLLBACK_MARKER' then raise; end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- (ص) رقم الرحلة الجوية (ج‑٣) — **يُخزَّن ولا يَحكم**
--
--   (ص-١) التطبيع: مسافات وشرطات وحروف صغيرة ⇒ شكلٌ واحد
--   (ص-٢) شكلٌ غريب **لا يُرفض** — يُخزَّن كما وصل بعد التطبيع
--   (ص-٣) الفارغ ⇒ `null` لا نصٌّ فارغ (فلا يُعرض حقلٌ خالٍ للمتعهد)
--   (ص-٤) والمفتاح يصل لقطة الرحلة فعلاً — لا يُبتلع في الطريق
-- ----------------------------------------------------------------------------
do $$
declare
  v_class text := nullif(current_setting('tours.test_class', true), '');
  v_res   record;
  v_got   text;
begin
  if v_class is null then
    raise notice '  ↳ (ص) لا فئة سيارات نشطة — فحوص رقم الرحلة تُتخطّى';
    raise exception 'ROLLBACK_MARKER';
  end if;

  update public.trip_settings set min_lead_minutes = 0 where id;

  -- (ص-١) التطبيع — شاهدان سلوكيان على الدالة وحدها قبل أن تُنادى من الحجز
  if public.normalize_flight_number(' ms-736 ') is distinct from 'MS736' then
    raise exception '(ص-١أ) التطبيع: توقعنا MS736 وحصلنا «%»',
      coalesce(public.normalize_flight_number(' ms-736 '), 'null');
  end if;
  if public.normalize_flight_number('   ') is not null then
    raise exception '(ص-١ب) نصٌّ فارغ يجب أن يعود null لا نصاً فارغاً';
  end if;
  if length(coalesce(public.normalize_flight_number(repeat('A', 40)), '')) <> 12 then
    raise exception '(ص-١ج) القصّ إلى ١٢ محرفاً لا يعمل — الطول %',
      length(coalesce(public.normalize_flight_number(repeat('A', 40)), ''));
  end if;

  -- (ص-٢) 🔒 **شكلٌ غريب لا يُرفض.** هذا هو التأكيد الذي يحمل قرار البند:
  --       «معلومةٌ للمتعهد لا بوّابة». ورفضُ الحجز بسبب رقم رحلةٍ خاطئ
  --       خسارةُ العميل كله مقابل حقلٍ اختياري.
  select * into v_res from public.create_booking(
    '{"label": "مطار القاهرة", "lat": 30.1219, "lng": 31.4056}'::jsonb,
    '{"label": "الإسكندرية", "lat": 31.2001, "lng": 29.9187}'::jsonb,
    1, false, 0, 220, 180, 'osrm', v_class, 'full',
    'اختبار الرحلة', '01000000000', null,
    now() + interval '2 days', 'TRIP_SWEEP_FIXTURE',
    null, null, 0, null, 0, 'رحلتي غداً ؟؟'
  );
  if v_res.public_token is null then
    raise exception '(ص-٢) 🔴 رقم رحلةٍ غير معتاد أسقط الحجز — الحقل صار بوّابة';
  end if;

  select b.trip ->> 'flightNumber' into v_got
  from public.bookings b where b.id = v_res.id;

  -- ما بقي بعد التطبيع من «رحلتي غداً ؟؟» لا شيء لاتيني ⇒ null، والحجز قائم
  if v_got is not null then
    raise exception '(ص-٢ب) توقعنا null بعد تطبيع نصٍّ بلا حروف لاتينية وحصلنا «%»', v_got;
  end if;

  -- (ص-٣) و(ص-٤) الرقم السليم يصل اللقطة بشكله المعياري
  select * into v_res from public.create_booking(
    '{"label": "مطار القاهرة", "lat": 30.1219, "lng": 31.4056}'::jsonb,
    '{"label": "الإسكندرية", "lat": 31.2001, "lng": 29.9187}'::jsonb,
    1, false, 0, 220, 180, 'osrm', v_class, 'full',
    'اختبار الرحلة', '01000000000', null,
    now() + interval '2 days', 'TRIP_SWEEP_FIXTURE',
    null, null, 0, null, 0, ' ms 736 '
  );

  select b.trip ->> 'flightNumber' into v_got
  from public.bookings b where b.id = v_res.id;

  if v_got is distinct from 'MS736' then
    raise exception '(ص-٤) لقطة الرحلة تحمل «%» لا MS736 — الرقم يضيع بين المسار والتخزين',
      coalesce(v_got, 'null');
  end if;

  -- وبلا رقم: المفتاح موجود بقيمة null (لا مفقود) — فالقارئ يفرّق بين
  -- «لم يكتبه» و«حجزٌ سبق الهجرة»
  select * into v_res from public.create_booking(
    '{"label": "القاهرة", "lat": 30.0444, "lng": 31.2357}'::jsonb,
    '{"label": "الإسكندرية", "lat": 31.2001, "lng": 29.9187}'::jsonb,
    1, false, 0, 220, 180, 'osrm', v_class, 'full',
    'اختبار الرحلة', '01000000000', null,
    now() + interval '2 days', 'TRIP_SWEEP_FIXTURE'
  );
  if not ((select b.trip from public.bookings b where b.id = v_res.id) ? 'flightNumber') then
    raise exception '(ص-٥) المفتاح flightNumber غائب من اللقطة — القارئ لا يفرّق بين «لم يُكتب» و«حجزٌ قديم»';
  end if;

  -- (ص-٦) ويصل المتعهد **حقلاً مستقلاً** لا مدسوساً في الملاحظات
  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace,
         unnest(p.proargnames) as a(name)
    where n.nspname = 'public' and p.proname = 'portal_trips' and a.name = 'flight_number'
  ) then
    raise exception '(ص-٦) portal_trips() بلا عمود flight_number — نقلُ الرقم من notes صار انحداراً للمتعهد';
  end if;

  raise notice '✔ (ص) رقم الرحلة: يُطبَّع ويُقصّ، ولا يرفض حجزاً بحال، ويصل اللقطة وبوابة المتعهد حقلاً مستقلاً';
  raise exception 'ROLLBACK_MARKER';
exception
  when others then
    if sqlerrm <> 'ROLLBACK_MARKER' then raise; end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- (ق) م‑١١ — مفتاح خريطة المسار، والحارس الذي يمنع وجودها قبل التأكيد
--
-- ثلاثة توكيدات، وكلٌّ منها يمسك خطأً مختلفاً:
--
--   (ق-١) العمود موجود وافتراضه `true` — من أسقطه أو قلبه بهجرةٍ تالية يُمسَك.
--   (ق-٢) 🔴 **الحارس حيّ**: المُشغّل يرفض صفَّ خريطةٍ على حجزٍ بانتظار الدفع
--         ويقبله على حجزٍ مؤكَّد. وهذا هو تنفيذ D-48 مقلوباً: الحجز لحظة
--         `create_booking` حالته `pending_payment`، فنداءُ خرائطَ خارجيّ لا
--         يستطيع أن يدخل معاملة الحجز أصلاً — ثمرتُه مرفوضة في القاعدة.
--         **والشاهد الموجب لازم**: بلا قبولٍ على المؤكَّد لا يفرّق الفحص بين
--         «حارسٌ يعمل» و«جدولٌ لا يقبل شيئاً».
--   (ق-٣) الجدول مغلق على الأدوار العامة، وحارس الجمهور غير ممنوح لـ`anon`.
--
-- والقياس كله داخل معاملةٍ فرعية تُرجَع: لا حجز ولا صفَّ تدقيق يبقى.
-- ----------------------------------------------------------------------------
do $$
declare
  v_pend constant uuid := 'ac110000-0000-4000-8000-0000000000d1';
  v_conf constant uuid := 'ac110000-0000-4000-8000-0000000000c1';
  v_def  text;
  v_hint text;
  v_no   boolean := false;
  v_yes  boolean := false;
  v_open text;
begin
  -- (ق-١) العمود وافتراضه
  select column_default into v_def
  from information_schema.columns
  where table_schema = 'public'
    and table_name   = 'trip_settings'
    and column_name  = 'route_map_enabled';

  if v_def is null then
    raise exception '(ق-١) العمود route_map_enabled غائب — هجرة 0078 غير مطبَّقة أو أُزيح العمود';
  end if;
  if v_def not like 'true%' then
    raise exception '(ق-١) افتراض route_map_enabled «%» — المتوقع true', v_def;
  end if;

  -- (ق-٢) الحارس — بمحاولتَي إدراجٍ حيّتين، سالبةٍ ثم موجبة
  begin
    insert into public.bookings
      (id, reference, public_token, status, class_slug, class_title, total, currency,
       plan, amount_due, amount_remaining, customer_name, customer_phone, trip)
    values
      (v_pend, 'TR-Q11D11', repeat('q', 40), 'pending_payment', 'm11-probe',
       'م‑١١ فئة فحص', 1000, 'EGP', 'full', 1000, 0, 'فحص م‑١١', '01000000011',
       '{}'::jsonb),
      (v_conf, 'TR-Q11C11', repeat('w', 40), 'confirmed', 'm11-probe',
       'م‑١١ فئة فحص', 1000, 'EGP', 'full', 1000, 0, 'فحص م‑١١', '01000000011',
       '{}'::jsonb);

    begin
      insert into public.booking_route_maps
        (booking_id, storage_path, provider, width, height, byte_size)
      values (v_pend, 'probe/m11-d.png', 'google', 640, 360, 1);
    exception when others then
      get stacked diagnostics v_hint = pg_exception_hint;
      v_no := (v_hint = 'booking-not-confirmed');
    end;

    begin
      insert into public.booking_route_maps
        (booking_id, storage_path, provider, width, height, byte_size)
      values (v_conf, 'probe/m11-c.png', 'google', 640, 360, 1);
      v_yes := true;
    exception when others then
      v_yes := false;
    end;

    if not v_no then
      raise exception
        '(ق-٢) 🔴 المُشغّل قَبِل خريطةً على حجزٍ بانتظار الدفع (التلميح: %) — فلا شيء يمنع نداء خرائط داخل معاملة الحجز (D-48)',
        coalesce(v_hint, '(بلا)');
    end if;
    if not v_yes then
      raise exception
        '(ق-٢) المُشغّل رفض خريطةً على حجزٍ مؤكَّد — الحارس يمنع الميزة كلها لا ما قبل التأكيد';
    end if;

    raise exception 'ROLLBACK_MARKER';
  exception
    when others then
      if sqlerrm <> 'ROLLBACK_MARKER' then raise; end if;
  end;

  -- (ق-٣) المنح: لا شيء لدورٍ عام، ولا تنفيذ لـ`anon`
  select string_agg(distinct grantee || ':' || privilege_type, '، ') into v_open
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name   = 'booking_route_maps'
    and grantee in ('anon', 'authenticated', 'PUBLIC');
  if v_open is not null then
    raise exception '(ق-٣) booking_route_maps مفتوح لدورٍ عام (%)', v_open;
  end if;

  -- شاهدٌ موجب لكاشف منح الدوال قبل الحكم بالسالب
  if not has_function_privilege('authenticated',
        'public.partner_route_map_visible(uuid)', 'execute') then
    raise exception '(ق-٣) المتعهد لا يستطيع تنفيذ حارس الخريطة — الميزة مقفلة عليه كلها';
  end if;
  if has_function_privilege('anon', 'public.partner_route_map_visible(uuid)', 'execute') then
    raise exception '(ق-٣) partner_route_map_visible ممنوحة لـ anon — والزائر ليس متعهداً';
  end if;

  raise notice '✔ (ق) مفتاح الخريطة افتراضه true، والمُشغّل يرفضها قبل التأكيد ويقبلها بعده، والجدول مغلق';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ق-٤) 🔴 هندسةُ الخط تُخزَّن — فالنصّ تحت الصورة يصدق (0079)
--
-- ملاحظة المالك (2026-08-17): الخط المستقيم بين نقطتين غير منطقي — **والسعر
-- مشتقٌّ من مسافة طريق**، فمستقيمٌ يعبر النيل أو الصحراء يوحي بمسافةٍ لم
-- نُسعّرها. والهندسة قد تسقط (مزوّدٌ لا يردّ)، فالمختار: تُرسم مستقيمةً
-- **وتُوسم تقريبية**، والوسم يُقرأ من هذا العمود لا يُخمَّن.
--
-- ولذلك يُفحص شيئان: أن القيمة الرابعة مرفوضة، وأن الافتراضي هو **الأحوط**
-- (`straight`) لا الأجمل — فكاتبٌ ينسى العمود يحصل على «تقريبي» لا على ادّعاء
-- مسار قيادة لم يقع.
-- ----------------------------------------------------------------------------
do $$
declare
  v_conf constant uuid := 'ac110000-0000-4000-8000-0000000000c4';
  v_state text;
  v_def   text;
begin
  select column_default into v_def
  from information_schema.columns
  where table_schema = 'public'
    and table_name   = 'booking_route_maps'
    and column_name  = 'geometry_source';

  if v_def is null then
    raise exception '(ق-٤) العمود geometry_source غائب — هجرة 0079 غير مطبَّقة';
  end if;
  if v_def not like '''straight''%' then
    raise exception
      '(ق-٤) افتراض geometry_source «%» — والمتوقع straight (الأحوط: لا يدّعي مساراً)', v_def;
  end if;

  begin
    insert into public.bookings
      (id, reference, public_token, status, class_slug, class_title, total, currency,
       plan, amount_due, amount_remaining, customer_name, customer_phone, trip)
    values
      (v_conf, 'TR-Q11G11', repeat('e', 40), 'confirmed', 'm11-probe',
       'م‑١١ فئة فحص', 1000, 'EGP', 'full', 1000, 0, 'فحص م‑١١', '01000000011',
       '{}'::jsonb);

    v_state := null;
    begin
      insert into public.booking_route_maps
        (booking_id, storage_path, provider, width, height, byte_size, geometry_source)
      values (v_conf, 'probe/m11-g.png', 'google', 640, 360, 1, 'guess');
      v_state := '(قُبلت)';
    exception when others then
      get stacked diagnostics v_state = returned_sqlstate;
    end;

    if v_state <> '23514' then
      raise exception
        '(ق-٤) هندسةٌ بقيمةٍ رابعة انتهت بـ«%» لا 23514 — القيد غائب، والنصّ تحت الصورة يصير تخميناً',
        v_state;
    end if;

    -- شاهدٌ موجب: القيمة المشروعة تمرّ
    insert into public.booking_route_maps
      (booking_id, storage_path, provider, width, height, byte_size, geometry_source)
    values (v_conf, 'probe/m11-g.png', 'google', 640, 360, 1, 'osrm');

    raise exception 'ROLLBACK_MARKER';
  exception
    when others then
      if sqlerrm <> 'ROLLBACK_MARKER' then raise; end if;
  end;

  raise notice '✔ (ق-٤) هندسة الخط مخزَّنة ومقيَّدة بثلاث قيم، وافتراضها الأحوط (straight)';
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
         || '/' || t.min_lead_minutes::text
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
  perform set_config('tours.test_class', '', false);

  raise notice '✔ (ل) التنظيف تم — لا صفوف اختبار، وإعدادات المالك كما كانت (%)', v_after;
end;
$$;

-- ----------------------------------------------------------------------------
-- الخلاصة
-- ----------------------------------------------------------------------------
do $$
begin
  raise notice 'ALL PASSED — إعدادات الرحلات وكنس الطلبات غير المدفوعة (0027 ق١ و ق٢)، والكنس صار مشروطاً بقرب الموعد ومضيِّ المهلة معاً عبر booking_hold_until (0052) — والبعيد يبقى والطازج محفوظ وبلا موعدٍ كما كان';
end;
$$;
