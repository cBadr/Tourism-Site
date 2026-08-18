-- ============================================================================
-- quote_request_tests.sql — طلب عرض السعر المُهيكل وآلة حالاته (ب‑١ · هجرة 0084)
--
-- كيف تشغّله:
--   pnpm db:test quote_request
-- أو من psql بدور صاحب القاعدة — و**لا بد** من ON_ERROR_STOP، وإلا تابع psql
-- بعد الكتلة الفاشلة وطبع «ALL PASSED» رغم الفشل:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/quote_request_tests.sql
--
-- النجاح = آخر سطر «ALL PASSED». وأي فشل يرمي exception برسالة عربية تحدد
-- الاختبار والقيمة المتوقعة والفعلية.
--
-- قابل لإعادة التنفيذ بلا حدود: كل صفوف الاختبار موسومة باسم عميلٍ ثابت
-- (`QR_TESTS_FIXTURE` داخل الاسم) وتُمسح في **بداية الملف ونهايته معاً** — فحتى
-- لو انهار تشغيل سابق في المنتصف يبدأ التالي من أرض نظيفة. والإشعارات تُمسح
-- أولاً لأنها بلا مفتاح أجنبي، ثم صفوف التدقيق التي خلّفها المُشغّل.
--
-- ⚠ **وب‑٣ (0088) أضافت حجوزاً إلى ما يُمسح**: «محوَّل» صارت تُنشئ حجزاً حقيقياً
--   بـ`convert_quote_request`، والحجز يحمل **اسم العميل نفسه** فيُمسح بالوسم
--   نفسه. والترتيب مقصود: الطلبات أولاً ثم الحجوزات، لأن
--   `quote_requests.booking_id` مفتاحٌ أجنبي بـ`on delete restrict`.
--
-- ⚠ ما الذي يجعل هذا الملف مختلفاً عن «اختبارٍ يطمئن»:
--   الادّعاءات هنا **مالية** (مبلغ العرض) و**بنيوية** (آلة الحالات)، ولو نُزع أيّ
--   حارس منها لبقي كل شيء يعمل ظاهرياً: الصفوف تُحفظ، والشاشة تعرض، والاختبار
--   الساذج يمرّ. لذلك كل حاجزٍ ماليّ هنا مقرونٌ بقسم **طفرة** (🧬) يقتلع الحارس
--   ويطلب من التأكيد نفسه أن **يفشل** — ثم يستعيد الأصل قبل الحكم.
--   (النمط ٩ في LESSONS.md، والقاعدة ١٩، ونظير (ن-٧) في payment_tests.sql.)
--
-- المرجع: supabase/migrations/0084_quote_request_structured.sql
--         supabase/migrations/0098_quote_request_lead_time.sql (‏القسم د-ب)
--         lib/place-search-types.ts (‏SERVICE_BOUNDS — مصر وحدها)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (٠) الشروط المسبقة + كنس أي بقايا
-- ----------------------------------------------------------------------------
do $$
declare
  v_left integer;
  v_sig  integer;
begin
  if to_regclass('public.quote_requests') is null then
    raise exception 'شرط مسبق: الجدول public.quote_requests غير موجود — نفّذ 0007 أولاً';
  end if;

  /*
   * 🔴 لا يُثبَّت التوقيع كاملاً — يُثبَّت **صدرُه**.
   *
   * كان الشرط `to_regprocedure('…13 نوعاً…')`، فلمّا أضافت 0127 خمسةَ معاملات
   * مصدرٍ **بافتراضيّ `NULL`** لم يعد ذلك التوقيع الحرفيّ موجوداً واحمرّت
   * المجموعة — **رغم أن كل نداءٍ فيها يعمل**، لأن الافتراضيات تغطّي المنادي
   * القديم. أي أن التوكيد أمسك **توسعةً** وسمّاها كسراً.
   *
   * والمقصودُ أن التوقيع «المُهيكل» قائم: المعاملات الثلاثة عشر الأولى هي هي
   * بترتيبها وأنواعها. فزيادةُ معاملٍ بافتراضيّ تمرّ، وتغييرُ واحدٍ من الثلاثة
   * عشر يحمرّ — وهو الفرق الذي يجب أن يقيسه الشاهد.
   */
  select count(*) into v_sig
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public'
    and p.proname = 'create_quote_request'
    and pg_catalog.pg_get_function_arguments(p.oid) like 'p_service_slug text, p_customer_name text, p_customer_phone text, p_details text, p_origin_label text, p_origin_lat numeric, p_origin_lng numeric, p_dest_label text, p_dest_lat numeric, p_dest_lng numeric, p_pickup_at timestamp with time zone, p_passengers integer, p_luggage integer%';
  if v_sig <> 1 then
    raise exception 'شرط مسبق: التوقيع المُهيكل غير موجود (طابقه % دالة) — نفّذ 0084 (pnpm db:migrate)', v_sig;
  end if;

  if to_regprocedure('public.set_quote_request_status(uuid,text,numeric,text)') is null then
    raise exception 'شرط مسبق: public.set_quote_request_status غير موجودة — نفّذ 0084';
  end if;

  -- 🔒 التوقيع الرباعي القديم يجب أن يكون قد سقط: بقاؤه بابٌ خلفيّ يُدرج طلباً
  --    بلا إحداثيات ولا موعد، فيبطل كل ما يفرضه هذا الملف
  if to_regprocedure('public.create_quote_request(text,text,text,text)') is not null then
    raise exception 'شرط مسبق: التوقيع الرباعي القديم ما زال قائماً — بابٌ خلفيّ بلا إحداثيات';
  end if;

  if to_regprocedure('public.convert_quote_request(uuid,text,numeric,text,uuid,text)') is null then
    raise exception 'شرط مسبق: public.convert_quote_request غير موجودة — نفّذ 0088';
  end if;

  -- الإشعارات أولاً (بلا مفتاح أجنبي)، ثم الطلبات ثم الحجوزات. و`audit_log`
  -- **لا يُمسّ**: سجلٌّ تدقيقيّ يُكتب بمُشغّل، ونفس ما يفعله `booking_tests.sql`.
  delete from public.notifications n where n.payload ->> 'customerName' like '%QR_TESTS_FIXTURE%';
  delete from public.quote_requests q where q.customer_name like '%QR_TESTS_FIXTURE%';
  delete from public.bookings      b where b.customer_name like '%QR_TESTS_FIXTURE%';

  select count(*) into v_left from public.quote_requests q
   where q.customer_name like '%QR_TESTS_FIXTURE%';
  if v_left <> 0 then
    raise exception '(٠) بقيت % من صفوف تشغيلٍ سابق بعد الكنس', v_left;
  end if;
  select count(*) into v_left from public.bookings b
   where b.customer_name like '%QR_TESTS_FIXTURE%';
  if v_left <> 0 then
    raise exception '(٠) بقيت % من حجوزات تشغيلٍ سابق بعد الكنس', v_left;
  end if;

  raise notice '✔ (٠) الشروط المسبقة سليمة والأرض نظيفة';
end;
$$;

-- ----------------------------------------------------------------------------
-- (٠-ب) هوية المشرف — لازمة لـ`set_quote_request_status` المحروسة بـ`is_admin()`
--
-- نفس نمط `booking_tests.sql` (٠-ب): يُبحث عن مشرف قائم، وإلا أُنشئ مؤقتٌ
-- يُحذف في التنظيف. و`request.jwt.claim.sub` تُضبط محليّاً بالمعاملة، فتقرؤها
-- `auth.uid()` داخل `is_admin()` — وهي تقرأ الطالب لا مالك الدالة رغم
-- `security definer`.
-- ----------------------------------------------------------------------------
do $$
declare
  v_admin uuid;
begin
  perform set_config('tours.qr_admin', '', false);
  perform set_config('tours.qr_admin_fixture', '0', false);

  select p.id into v_admin from public.profiles p where p.role = 'admin' limit 1;

  if v_admin is null then
    begin
      v_admin := '0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b'::uuid;
      delete from auth.users u where u.id = v_admin;
      insert into auth.users (id, email) values (v_admin, 'qr-tests-fixture@local.invalid');
      insert into public.profiles (id, role, full_name)
      values (v_admin, 'admin', 'مشرف اختبار مؤقت')
      on conflict (id) do update set role = 'admin';
      perform set_config('tours.qr_admin_fixture', '1', false);
      raise notice '  ↳ أُنشئ مشرف اختبار مؤقت (سيُحذف في النهاية)';
    exception
      when others then
        v_admin := null;
        raise notice '  ↳ تعذّر إنشاء مشرف مؤقت (%)', sqlerrm;
    end;
  end if;

  if v_admin is null then
    raise exception '(٠-ب) بلا هوية مشرف لا يمكن اختبار آلة الحالات — والتخطّي هنا يعني ملفاً أخضر لا يفحص شيئاً';
  end if;

  perform set_config('tours.qr_admin', v_admin::text, false);
  perform set_config('request.jwt.claim.sub', v_admin::text, true);

  if not public.is_admin() then
    raise exception '(٠-ب) تعذّر انتحال هوية المشرف — is_admin() ما زالت false';
  end if;

  -- ب‑٣: أصغر فئةٍ مفعَّلة تتسع لراكبين — يحتاجها (هـ-٤) للتحويل الحقيقي.
  -- وتُقرأ من القاعدة لا تُسمّى نصّاً: أسماء الفئات وسعاتها إعدادُ مالكٍ يتغيّر.
  declare v_slug text;
  begin
    select vc.slug into v_slug from public.vehicle_classes vc
     where vc.active and vc.capacity >= 2 order by vc.capacity asc limit 1;
    if v_slug is null then
      raise exception '(٠-ب) لا فئة مفعَّلة تتسع لراكبين — لا يُقاس التحويل';
    end if;
    perform set_config('tours.qr_class', v_slug, false);
  end;

  raise notice '✔ (٠-ب) هوية المشرف جاهزة، والفئة «%»', current_setting('tours.qr_class');
end;
$$;

-- ----------------------------------------------------------------------------
-- (أ) الحقول المُهيكلة تُحفظ فعلاً — لا «تُقبل» فحسب
--
-- القاعدة الذهبية ١٨: حقلٌ يُحفظ ليس حقلاً يعمل. فالفحص هنا يقرأ الصف بعد
-- الإدراج ويقارن **كل** قيمة بما أُرسل، لا يكتفي بأن النداء لم يرمِ.
-- ----------------------------------------------------------------------------
do $$
declare
  v_name  constant text := 'عميل QR_TESTS_FIXTURE أ';
  v_when  constant timestamptz := date_trunc('minute', now()) + interval '5 days';
  v_res   record;
  v_row   record;
begin
  select * into v_res from public.create_quote_request(
    'tours', v_name, '01000000001', 'جولة يوم كامل',
    'ميدان التحرير، القاهرة', 30.044400, 31.235700,
    'أهرامات الجيزة', 29.977300, 31.132500,
    v_when, 6, 4
  );

  if v_res.reference is null or v_res.reference !~ '^RQ-[0-9A-Z]{6,}$' then
    raise exception '(أ-١) مرجع غير صالح: %', coalesce(v_res.reference, 'بلا');
  end if;

  select * into v_row from public.quote_requests q where q.id = v_res.id;
  if not found then raise exception '(أ-١) الصف لم يُدرج أصلاً'; end if;

  if v_row.origin_label is distinct from 'ميدان التحرير، القاهرة'
     or v_row.origin_lat <> 30.044400 or v_row.origin_lng <> 31.235700 then
    raise exception '(أ-٢) الانطلاق لم يُحفظ كما أُرسل: % (% , %)',
      coalesce(v_row.origin_label, 'بلا'), v_row.origin_lat, v_row.origin_lng;
  end if;

  if v_row.dest_label is distinct from 'أهرامات الجيزة'
     or v_row.dest_lat <> 29.977300 or v_row.dest_lng <> 31.132500 then
    raise exception '(أ-٣) الوجهة لم تُحفظ كما أُرسلت: % (% , %)',
      coalesce(v_row.dest_label, 'بلا'), v_row.dest_lat, v_row.dest_lng;
  end if;

  if v_row.pickup_at is distinct from v_when then
    raise exception '(أ-٤) الموعد لم يُحفظ: توقعنا % وحصلنا %', v_when, v_row.pickup_at;
  end if;
  if v_row.passengers <> 6 or v_row.luggage <> 4 then
    raise exception '(أ-٥) العدد/الحقائب: توقعنا ٦/٤ وحصلنا %/%',
      v_row.passengers, v_row.luggage;
  end if;
  if v_row.service_slug <> 'tours' then
    raise exception '(أ-٦) الخدمة لم تُحفظ (%)', coalesce(v_row.service_slug, 'بلا');
  end if;
  if v_row.status <> 'new' then
    raise exception '(أ-٧) الحالة الابتدائية يجب أن تكون new وحصلنا %', v_row.status;
  end if;
  if v_row.quoted_amount is not null then
    raise exception '(أ-٨) طلبٌ جديد وُلد بمبلغ (%) — لا يجوز', v_row.quoted_amount;
  end if;

  -- (أ-٩) الوجهة اختيارية: الجولة والإيجار اليومي بلا وجهة واحدة، وهما سبب الصفحة
  select * into v_res from public.create_quote_request(
    null, v_name, '01000000001', 'إيجار يومي بلا وجهة محددة',
    'فندق في الزمالك', 30.061000, 31.219000,
    null, null, null,
    v_when, 2, null
  );
  select * into v_row from public.quote_requests q where q.id = v_res.id;
  if v_row.dest_label is not null or v_row.dest_lat is not null then
    raise exception '(أ-٩) وجهةٌ اختُرعت من العدم';
  end if;
  if v_row.luggage is not null then
    raise exception '(أ-١٠) الحقائب غير المذكورة صارت صفراً بدل «لم يُذكر»';
  end if;

  raise notice '✔ (أ) الحقول المُهيكلة تُحفظ كما أُرسلت، والوجهة والحقائب اختياريتان';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ب) 🔴 لا يُسعَّر نصٌّ لم يُحلّ إلى نقطة (D-09)
--
-- هذا هو الادّعاء الذي وُجدت المرحلة لأجله: سعرٌ مبنيٌّ على «فندق في الزمالك»
-- بلا إحداثيات سعرٌ نلتزم به ولا نعرف مسافته.
-- ----------------------------------------------------------------------------
do $$
declare
  v_name constant text := 'عميل QR_TESTS_FIXTURE ب';
  v_when constant timestamptz := now() + interval '5 days';
  v_hint text;
  v_ok   boolean;
begin
  -- (ب-١) انطلاقٌ نصّاً بلا إحداثيات ⇒ رفض
  v_ok := false;
  begin
    perform 1 from public.create_quote_request(
      null, v_name, '01000000002', 'تفاصيل',
      'فندق في الزمالك', null, null, null, null, null, v_when, 2, null);
  exception when others then
    v_ok := true; get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if not v_ok or v_hint is distinct from 'invalid-origin' then
    raise exception '(ب-١) نصٌّ بلا إحداثيات قُبل انطلاقاً (رُفض=% رمز=%)',
      v_ok, coalesce(v_hint, 'بلا');
  end if;

  -- (ب-٢) انطلاقٌ بإحداثيات بلا تسمية ⇒ رفض كذلك (الثلاثي لا يتجزأ)
  v_ok := false;
  begin
    perform 1 from public.create_quote_request(
      null, v_name, '01000000002', 'تفاصيل',
      null, 30.0444, 31.2357, null, null, null, v_when, 2, null);
  exception when others then
    v_ok := true; get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if not v_ok or v_hint is distinct from 'invalid-origin' then
    raise exception '(ب-٢) إحداثيات بلا تسمية قُبلت (رُفض=% رمز=%)',
      v_ok, coalesce(v_hint, 'بلا');
  end if;

  -- (ب-٣) وجهةٌ نصّاً بلا إحداثيات ⇒ رفض (لا تُقبل ناقصةً ولا تُبتر بصمت)
  v_ok := false;
  begin
    perform 1 from public.create_quote_request(
      null, v_name, '01000000002', 'تفاصيل',
      'ميدان التحرير', 30.0444, 31.2357,
      'مكانٌ كتبه العميل', null, null, v_when, 2, null);
  exception when others then
    v_ok := true; get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if not v_ok or v_hint is distinct from 'invalid-destination' then
    raise exception '(ب-٣) وجهة نصّية بلا إحداثيات قُبلت (رُفض=% رمز=%)',
      v_ok, coalesce(v_hint, 'بلا');
  end if;

  raise notice '✔ (ب) D-09: لا مكان بلا إحداثيات — لا انطلاقاً ولا وجهةً';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ج) 🔴 مصر وحدها — مرآة `SERVICE_BOUNDS` (‏٢٠..٣٤ عرضاً · ٢٣..٣٨ طولاً)
--
-- ولماذا يهمّ: طلبٌ من دبي أو الرياض ليس عميلاً بعيداً بل بياناً فاسداً — يدخل
-- طابور المبيعات ويُسعَّر بمسافةٍ لا نخدمها. وجوجل تُرجعهما ما لم تُقيَّد.
-- ----------------------------------------------------------------------------
do $$
declare
  v_name constant text := 'عميل QR_TESTS_FIXTURE ج';
  v_when constant timestamptz := now() + interval '5 days';
  v_hint text;
  v_ok   boolean;
  v_case record;
begin
  for v_case in
    select * from (values
      ('دبي انطلاقاً',    25.204800, 55.270800, null::numeric, null::numeric),
      ('الرياض انطلاقاً', 24.713600, 46.675300, null,          null),
      ('لندن انطلاقاً',   51.507400, -0.127800, null,          null),
      ('دبي وجهةً',       30.044400, 31.235700, 25.204800,     55.270800)
    ) as t(note, olat, olng, dlat, dlng)
  loop
    v_ok := false;
    begin
      perform 1 from public.create_quote_request(
        null, v_name, '01000000003', 'تفاصيل',
        'نقطة', v_case.olat, v_case.olng,
        case when v_case.dlat is null then null else 'وجهة' end, v_case.dlat, v_case.dlng,
        v_when, 2, null);
    exception when others then
      v_ok := true; get stacked diagnostics v_hint = pg_exception_hint;
    end;
    if not v_ok or v_hint is distinct from 'out-of-area' then
      raise exception '(ج) «%» قُبلت خارج نطاق التشغيل (رُفض=% رمز=%)',
        v_case.note, v_ok, coalesce(v_hint, 'بلا');
    end if;
  end loop;

  -- والقيد على الجدول مرآةٌ للدالة: حتى الإدراج من SQL Editor محكوم
  v_ok := false;
  begin
    insert into public.quote_requests (customer_name, customer_phone, details,
      origin_label, origin_lat, origin_lng)
    values (v_name, '01000000003', 'تفاصيل', 'دبي', 25.2048, 55.2708);
  exception when check_violation then v_ok := true; when others then v_ok := false;
  end;
  if not v_ok then
    raise exception '(ج-٥) قيد الحدود غير مفروض على الجدول — الدالة وحدها تحرس';
  end if;

  raise notice '✔ (ج) مصر وحدها: أربع نقاط خارجية رُفضت، والقيد مرآةٌ للدالة';
end;
$$;

-- ----------------------------------------------------------------------------
-- (د) الموعد والعدد — طلبٌ بلا موعد لا يُسعَّر، وبموعدٍ ماضٍ خطأُ إدخال
--
-- ونظيره المدفوع الثمن في الحجز: `POST /api/booking` بلا موعد كان يُرجع ٢٠٠
-- وينشئ حجزاً يتجاوز حارس المهلة كلياً. لا يتكرر هنا.
-- ----------------------------------------------------------------------------
do $$
declare
  v_name constant text := 'عميل QR_TESTS_FIXTURE د';
  v_when constant timestamptz := now() + interval '5 days';
  v_hint text;
  v_ok   boolean;
  v_case record;
begin
  for v_case in
    select * from (values
      ('بلا موعد',        null::timestamptz,          2,   'invalid-pickup'),
      ('موعد ماضٍ',       now() - interval '1 day',   2,   'pickup-past'),
      ('بلا عدد ركاب',    now() + interval '5 days',  null,'invalid-passengers'),
      ('صفر ركاب',        now() + interval '5 days',  0,   'invalid-passengers'),
      ('ركاب سالب',       now() + interval '5 days',  -3,  'invalid-passengers'),
      ('ركاب فوق السقف',  now() + interval '5 days',  201, 'invalid-passengers')
    ) as t(note, pickup, pax, expect)
  loop
    v_ok := false;
    begin
      perform 1 from public.create_quote_request(
        null, v_name, '01000000004', 'تفاصيل',
        'ميدان التحرير', 30.0444, 31.2357, null, null, null,
        v_case.pickup, v_case.pax, null);
    exception when others then
      v_ok := true; get stacked diagnostics v_hint = pg_exception_hint;
    end;
    if not v_ok or v_hint is distinct from v_case.expect then
      raise exception '(د) «%» قُبلت (رُفض=% رمز=% والمتوقع %)',
        v_case.note, v_ok, coalesce(v_hint, 'بلا'), v_case.expect;
    end if;
  end loop;

  -- والحقائب السالبة مرفوضة، والغائبة مقبولة (اختُبرت في أ-١٠)
  v_ok := false;
  begin
    perform 1 from public.create_quote_request(
      null, v_name, '01000000004', 'تفاصيل',
      'ميدان التحرير', 30.0444, 31.2357, null, null, null, v_when, 2, -1);
  exception when others then
    v_ok := true; get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if not v_ok or v_hint is distinct from 'invalid-luggage' then
    raise exception '(د-٧) حقائب سالبة قُبلت (رُفض=% رمز=%)', v_ok, coalesce(v_hint, 'بلا');
  end if;

  raise notice '✔ (د) الموعد مطلوب ومستقبلي، والركاب داخل مدىً معقول';
end;
$$;

-- ----------------------------------------------------------------------------
-- (د-ب) 🔴 أدنى مهلة قبل الانطلاق تُفرض في القاعدة (هجرة 0098)
--
-- ── ما يحرسه هذا القسم بالضبط ─────────────────────────────────────────────
-- نموذج `/quote-request` صار حقلاً واحداً (`datetime-local`) بأرضيةٍ (`min`) من
-- `booking_min_pickup_at()` وسطرٍ يقول «نحتاج مهلة N دقيقة على الأقل».
-- و**خاصية `min` تلميحٌ لا حارس**: تُتجاوَز بالكتابة اليدوية، وبمن يترك النموذج
-- مفتوحاً حتى يزحف «الآن»، وبنداءٍ مباشر بلا متصفح — والدالة ممنوحة لـ`anon`.
-- فبلا هذا الحارس تعلن الشاشةُ قيداً لا تفرضه القاعدة (النمط ٢ في LESSONS).
--
-- ── ولماذا التأكيدان معاً لا واحدٌ ────────────────────────────────────────
-- «الأرضية − دقيقة تُرفض» يفشل لو نُزع الحارس. و«الأرضية بالضبط تُقبل» يفشل لو
-- كُتبت المقارنة `<=` بدل `<` — أي لو صار ما تعرضه الشاشة بوصفه «أقرب موعد
-- متاح» مرفوضاً عند الضغط. فكلٌّ منهما يحرس عطلاً لا يمسكه الآخر.
--
-- ⚠ **والتوقع يُشتق من نفس مُدخل الكود المُختبَر** (LESSONS §٥): الحدّ يُقرأ من
--   `booking_min_pickup_at()` نفسها لا من ١٢٠ دقيقة مكتوبة هنا — فتغييرُ المالك
--   للإعداد من اللوحة لا يُسقط الاختبار.
--
-- ⚠ **ولا يُلمس أي إعداد**: لا يُشعل هذا القسم مهلةً ولا يطفئها، فلا احتياطَ
--   استرجاعٍ ينقلب (درسُ `payment_tests.sql` في 2026-08-16: احتياطٌ كان `'true'`
--   فأشعل بوابة الدفع أكثر من يوم وكل تشغيلٍ أخضر). وحين تكون المهلة مطفأةً
--   بقرار المالك يُعلن التخطّي صراحةً — لا يُخترع قيدٌ لقياسه.
-- ----------------------------------------------------------------------------
do $$
declare
  v_name  constant text := 'عميل QR_TESTS_FIXTURE د-ب';
  v_lead  integer;
  v_floor timestamptz;
  v_res   record;
  v_row   record;
  v_hint  text;
  v_ok    boolean;
begin
  select t.min_lead_minutes into v_lead from public.trip_config() t;
  v_floor := public.booking_min_pickup_at();

  if coalesce(v_lead, 0) <= 0 or v_floor is null then
    raise notice '  ↳ (د-ب) تخطٍّ: أدنى المهلة مطفأة بقرار المالك (min_lead_minutes=%)',
      coalesce(v_lead, 0);
    return;
  end if;

  -- (د-ب-١) موعدٌ داخل النافذة يُرفض برمزٍ مخصوص — لا برمزٍ جامع
  v_ok := false;
  begin
    perform 1 from public.create_quote_request(
      null, v_name, '01000000010', 'تفاصيل',
      'ميدان التحرير', 30.0444, 31.2357, null, null, null,
      v_floor - interval '1 minute', 2, null);
  exception when others then
    v_ok := true; get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if not v_ok or v_hint is distinct from 'lead-time' then
    raise exception
      '(د-ب-١) 🔴 موعدٌ داخل نافذة المهلة (% دقيقة) قُبل — أرضية المنتقي زينة (رُفض=% رمز=%)',
      v_lead, v_ok, coalesce(v_hint, 'بلا');
  end if;

  -- (د-ب-٢) والأرضية **بالضبط** مقبولة: `<` لا `<=` — وهي اللحظة التي تعرضها
  --         الشاشة بوصفها «أقرب موعد متاح»، فرفضُها يجعل الشاشة تكذب بالعكس.
  --         و`now()` طابعُ بدء المعاملة، والحارس يقرأ الطابع نفسه ⇒ مقارنةٌ
  --         حاسمة لا تسابق ساعةً.
  select * into v_res from public.create_quote_request(
    null, v_name, '01000000010', 'تفاصيل',
    'ميدان التحرير', 30.0444, 31.2357, null, null, null,
    v_floor, 2, null);

  select * into v_row from public.quote_requests q where q.id = v_res.id;
  if not found or v_row.pickup_at is distinct from v_floor then
    raise exception
      '(د-ب-٢) 🔴 «أقرب موعد متاح» نفسه رُفض أو لم يُحفظ كما أُرسل (توقعنا % وحصلنا %)',
      v_floor, coalesce(v_row.pickup_at::text, 'بلا صف');
  end if;

  raise notice
    '✔ (د-ب) حارس المهلة حيّ: الأرضية−دقيقة تُرفض بـlead-time، والأرضية نفسها تُقبل (% دقيقة)',
    v_lead;
end;
$$;

-- ----------------------------------------------------------------------------
-- (هـ) 🔴 آلة الحالات — جديد ← مسعَّر ← محوَّل · ومرفوض · وإعادة الفتح
--
-- والادّعاء الحاسم: الآلة **مُشغّلٌ على الجدول** لا شرطٌ في دالة. فالانتقال غير
-- المشروع يُرفض حتى بتحديثٍ مباشر (وهو ما تسمح به سياسة التحديث للمشرف اليوم).
-- ----------------------------------------------------------------------------
do $$
declare
  v_name constant text := 'عميل QR_TESTS_FIXTURE هـ';
  v_when constant timestamptz := now() + interval '5 days';
  v_id   uuid;
  v_res  record;
  v_row  record;
  v_hint text;
  v_ok   boolean;
  v_case record;
begin
  select * into v_res from public.create_quote_request(
    null, v_name, '01000000005', 'تفاصيل',
    'ميدان التحرير', 30.0444, 31.2357, null, null, null, v_when, 2, null);
  v_id := v_res.id;

  -- (هـ-١) الانتقالات غير المشروعة من «جديد» — تحديثٌ مباشر يمرّ بالمُشغّل
  for v_case in
    select * from (values ('new → converted', 'converted')) as t(note, target)
  loop
    v_ok := false;
    begin
      update public.quote_requests set status = v_case.target, quoted_amount = 500
       where id = v_id;
    exception when others then
      v_ok := true; get stacked diagnostics v_hint = pg_exception_hint;
    end;
    if not v_ok or v_hint is distinct from 'invalid-transition' then
      raise exception '(هـ-١) «%» مرّ (رُفض=% رمز=%)', v_case.note, v_ok, coalesce(v_hint, 'بلا');
    end if;
  end loop;

  -- (هـ-٢) جديد ← مسعَّر عبر الدالة، والمبلغ والطابع يُختمان
  perform 1 from public.set_quote_request_status(v_id, 'quoted', 4650, 'عرض أولي');
  select * into v_row from public.quote_requests q where q.id = v_id;
  if v_row.status <> 'quoted' or v_row.quoted_amount <> 4650 then
    raise exception '(هـ-٢) التسعير لم يُطبَّق: حالة=% مبلغ=%', v_row.status, v_row.quoted_amount;
  end if;
  if v_row.quoted_at is null or v_row.status_changed_at is null then
    raise exception '(هـ-٢) الطوابع لم تُختم: quoted_at=% status_changed_at=%',
      v_row.quoted_at, v_row.status_changed_at;
  end if;
  if v_row.admin_note is distinct from 'عرض أولي' then
    raise exception '(هـ-٢) الملاحظة الداخلية لم تُحفظ (%)', coalesce(v_row.admin_note, 'بلا');
  end if;

  -- (هـ-٣) إعادة التسعير تُجدِّد الطابع — وإلا كان `quoted_at` تاريخَ عرضٍ سُحب
  --
  -- ⚠ ولا يُقاس بفارقٍ زمنيّ: `now()` طابعُ **بدء المعاملة**، وهذا الملف كله
  --   معاملةٌ واحدة، فكل نداءاتها تعطي اللحظة نفسها. لذلك يُزرع طابعٌ قديم
  --   يدويّاً (وتحديث `quoted_at` وحده لا يُوقظ المُشغّل، فشرطه الحالة أو
  --   المبلغ) ثم يُطلَب من إعادة التسعير أن تكتب فوقه.
  declare v_planted constant timestamptz := now() - interval '9 days';
  begin
    update public.quote_requests set quoted_at = v_planted where id = v_id;

    perform 1 from public.set_quote_request_status(v_id, 'quoted', 5200, null);
    select * into v_row from public.quote_requests q where q.id = v_id;

    if v_row.quoted_amount <> 5200 then
      raise exception '(هـ-٣) إعادة التسعير لم تُغيّر المبلغ (%)', v_row.quoted_amount;
    end if;
    if v_row.quoted_at = v_planted then
      raise exception '(هـ-٣) طابع التسعير لم يُجدَّد بعد إعادة التسعير — بقي على %', v_planted;
    end if;
    if v_row.quoted_at is distinct from now() then
      raise exception '(هـ-٣) الطابع كُتب بغير لحظة المعاملة (% ≠ %)', v_row.quoted_at, now();
    end if;
    -- والملاحظة القائمة لا تُمحى بتمرير null
    if v_row.admin_note is distinct from 'عرض أولي' then
      raise exception '(هـ-٣) الملاحظة مُحيت بتمرير null';
    end if;
  end;

  -- (هـ-٤) مسعَّر ← محوَّل — **بدالة التحويل لا بنقلة حالة** (ب‑٣ · 0088)
  --
  -- 🔴 و«محوَّل» لم تبقَ وسماً: `set_quote_request_status` تردّها بـ`use-convert`
  --    لأنها صارت مقترنةً بحجزٍ قائم بقيدٍ على الجدول. والتفصيل والعدائيّ في
  --    `quote_conversion_tests.sql`؛ وما يُثبَته هنا أن الآلة نفسها تقبل النقلة
  --    من الطريق الصحيح، وأن التسعيرة القائمة تُورَّث.
  v_ok := false;
  begin
    perform 1 from public.set_quote_request_status(v_id, 'converted', null, null);
  exception when others then
    v_ok := true; get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if not v_ok or v_hint is distinct from 'use-convert' then
    raise exception
      '(هـ-٤) 🔴 نقلةُ حالةٍ وسمت الطلب «محوَّلاً» بلا حجز (رُفض=% رمز=%)',
      v_ok, coalesce(v_hint, 'بلا');
  end if;

  -- والتكلفة نصفُ السعر: أبعدُ من أرضية الهامش بأي إعداداتٍ معقولة
  -- (‏`cost + max(50, 15%·cost)` = ‎57.5٪‎ من السعر)، فلا يتعلّق الاختبار برقمٍ
  -- يملكه المالك ويغيّره غداً.
  perform 1 from public.convert_quote_request(
    v_id, current_setting('tours.qr_class'), round(5200 / 2.0, 2), 'الإسكندرية');

  select * into v_row from public.quote_requests q where q.id = v_id;
  if v_row.status <> 'converted' or v_row.quoted_amount <> 5200 then
    raise exception '(هـ-٤) التحويل: حالة=% مبلغ=%', v_row.status, v_row.quoted_amount;
  end if;
  if v_row.booking_id is null or v_row.converted_at is null then
    raise exception '(هـ-٤) «محوَّل» بلا حجزٍ مرتبط ولا طابع — الاقتران مكسور';
  end if;

  -- (هـ-٥) 🔴 «محوَّل» نهائية — بعدها حجزٌ حقيقي، وإرجاعها يجعل صفّين يدّعيان الرحلة
  for v_case in
    select * from (values ('new'), ('quoted'), ('rejected')) as t(target)
  loop
    v_ok := false;
    begin
      update public.quote_requests set status = v_case.target where id = v_id;
    exception when others then
      v_ok := true; get stacked diagnostics v_hint = pg_exception_hint;
    end;
    if not v_ok or v_hint is distinct from 'invalid-transition' then
      raise exception '(هـ-٥) «محوَّل ← %» مرّ (رُفض=% رمز=%)',
        v_case.target, v_ok, coalesce(v_hint, 'بلا');
    end if;
  end loop;

  raise notice '✔ (هـ) الآلة تحرس بمُشغّل: الانتقال غير المشروع يُرفض حتى بتحديثٍ مباشر';
end;
$$;

-- ----------------------------------------------------------------------------
-- (و) الرفض وإعادة الفتح — ومسحُ المبلغ عند العودة إلى «جديد»
-- ----------------------------------------------------------------------------
do $$
declare
  v_name constant text := 'عميل QR_TESTS_FIXTURE و';
  v_when constant timestamptz := now() + interval '5 days';
  v_id   uuid;
  v_res  record;
  v_row  record;
begin
  select * into v_res from public.create_quote_request(
    null, v_name, '01000000006', 'تفاصيل',
    'ميدان التحرير', 30.0444, 31.2357, null, null, null, v_when, 2, null);
  v_id := v_res.id;

  perform 1 from public.set_quote_request_status(v_id, 'quoted', 3000, null);
  perform 1 from public.set_quote_request_status(v_id, 'rejected', null, 'العميل اختار منافساً');

  select * into v_row from public.quote_requests q where q.id = v_id;
  if v_row.status <> 'rejected' then
    raise exception '(و-١) الرفض لم يُطبَّق (%)', v_row.status;
  end if;
  -- المرفوض يحتفظ بآخر سعر عُرض: دليلٌ على أن عرضاً قُدِّم ورُفض
  if v_row.quoted_amount <> 3000 then
    raise exception '(و-٢) المرفوض فقد سعره المعروض (%) — ضاع دليل أن عرضاً قُدِّم',
      coalesce(v_row.quoted_amount, 0);
  end if;

  -- (و-٣) إعادة الفتح تمسح المبلغ: عرضٌ سُحب لا يبقى رقماً يتيماً يدّعي التزاماً
  perform 1 from public.set_quote_request_status(v_id, 'new', null, null);
  select * into v_row from public.quote_requests q where q.id = v_id;
  if v_row.status <> 'new' then
    raise exception '(و-٣) إعادة الفتح لم تُطبَّق (%)', v_row.status;
  end if;
  if v_row.quoted_amount is not null or v_row.quoted_at is not null then
    raise exception '(و-٤) إعادة الفتح أبقت سعراً يتيماً (% في %)',
      v_row.quoted_amount, v_row.quoted_at;
  end if;

  raise notice '✔ (و) المرفوض يحتفظ بدليل العرض، وإعادة الفتح تمسح الرقم اليتيم';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ز) 🔴 الحاجز المالي — «مسعَّر» لا تقوم بلا رقم
--
-- ولو انكسر هذا وحده لبقي كل شيء يعمل: الشاشة تعرض، والحالة تُحدَّث، والطلب
-- يُحسب في معدل التحويل — **وهو لم يُعرض عليه شيء**. وذاك رقمٌ يبني عليه المالك
-- قراراً.
-- ----------------------------------------------------------------------------
do $$
declare
  v_name constant text := 'عميل QR_TESTS_FIXTURE ز';
  v_when constant timestamptz := now() + interval '5 days';
  v_id   uuid;
  v_res  record;
  v_hint text;
  v_ok   boolean;
begin
  select * into v_res from public.create_quote_request(
    null, v_name, '01000000007', 'تفاصيل',
    'ميدان التحرير', 30.0444, 31.2357, null, null, null, v_when, 2, null);
  v_id := v_res.id;

  -- (ز-١) الدالة ترفض التسعير بلا مبلغ
  v_ok := false;
  begin
    perform 1 from public.set_quote_request_status(v_id, 'quoted', null, null);
  exception when others then
    v_ok := true; get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if not v_ok or v_hint is distinct from 'amount-required' then
    raise exception '(ز-١) تسعيرٌ بلا مبلغ قُبل (رُفض=% رمز=%)', v_ok, coalesce(v_hint, 'بلا');
  end if;

  -- (ز-٢) وبمبلغٍ صفر أو سالب كذلك
  declare v_amt numeric;
  begin
    foreach v_amt in array array[0, -100]::numeric[] loop
      v_ok := false;
      begin
        perform 1 from public.set_quote_request_status(v_id, 'quoted', v_amt, null);
      exception when others then v_ok := true;
      end;
      if not v_ok then
        raise exception '(ز-٢) تسعيرٌ بمبلغ % قُبل', v_amt;
      end if;
    end loop;
  end;

  -- (ز-٣) والقيد على الجدول مرآةٌ للدالة: التحديث المباشر إلى «مسعَّر» بلا مبلغ يُرفض
  v_ok := false;
  begin
    update public.quote_requests set status = 'quoted' where id = v_id;
  exception when check_violation then v_ok := true; when others then v_ok := false;
  end;
  if not v_ok then
    raise exception '(ز-٣) 🔴 تحديثٌ مباشر جعل الطلب «مسعَّراً» بلا سعر — الحاجز في الدالة وحدها';
  end if;

  -- (ز-٤) والتحويل إلى حجزٍ بلا تسعيرة قائمة يُرفض كذلك — والصفّ ما زال «جديد»
  --       (فشلت كل محاولات تسعيره أعلاه)، فيقع الرفض على الحالة قبل أي حساب.
  v_ok := false;
  begin
    perform 1 from public.convert_quote_request(
      v_id, current_setting('tours.qr_class'), 1000, 'الإسكندرية');
  exception when others then
    v_ok := true; get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if not v_ok or v_hint is distinct from 'not-quoted' then
    raise exception '(ز-٤) تحويلٌ بلا تسعيرة قُبل (رُفض=% رمز=%)', v_ok, coalesce(v_hint, 'بلا');
  end if;

  raise notice '✔ (ز) «مسعَّر» لا تقوم بلا رقم، ولا يُحوَّل طلبٌ لم يُسعَّر';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ح) 🧬 **طفرة** — الاختبار الذي لا يفشل حين يُنزع حارسه ليس اختباراً
--
-- ثلاثة ادّعاءات هي عصب هذه المرحلة، وكلٌّ منها يُقتلع هنا ويُطلَب من تأكيده أن
-- **يفشل**. والاستعادة من التعريف الحيّ المُلتقط قبل الطفرة (D-58) لا من نسخةٍ
-- مكتوبة هنا تنحرف عن الأصل بعد أول تعديل — والاستعادة **قبل الحكم** دائماً،
-- فتشخيصٌ فاشل لا يجوز أن يترك القاعدة مطفَّرة.
-- ----------------------------------------------------------------------------
do $$
declare
  v_name   constant text := 'عميل QR_TESTS_FIXTURE ح';
  v_when   constant timestamptz := now() + interval '5 days';
  v_id     uuid;
  v_res    record;
  v_origin text;
  v_def    text;
  v_caught boolean;
  v_ok     boolean;
begin
  select * into v_res from public.create_quote_request(
    null, v_name, '01000000008', 'تفاصيل',
    'ميدان التحرير', 30.0444, 31.2357, null, null, null, v_when, 2, null);
  v_id := v_res.id;

  -- ══ (ح-١) طفرة الحاجز المالي: يُسقَط القيد، فيصير (ز-٣) كاذباً ══════════
  select pg_get_constraintdef(oid) into v_def
    from pg_constraint where conrelid = 'public.quote_requests'::regclass
     and conname = 'quote_requests_priced_states_chk';
  if v_def is null then
    raise exception '(ح-١) القيد المالي غير موجود أصلاً';
  end if;

  execute 'alter table public.quote_requests drop constraint quote_requests_priced_states_chk';

  v_caught := false;
  begin
    -- نفس تأكيد (ز-٣) حرفياً — ويجب أن يمرّ الآن، أي أن التأكيد كان حارساً حيّاً
    begin
      update public.quote_requests set status = 'quoted' where id = v_id;
      v_caught := true;   -- مرّ ⇒ الطفرة أُمسكت
    exception when others then
      v_caught := false;  -- ما زال يُرفض ⇒ القيد لم يكن هو الحارس
    end;
    -- تنظيف أثر الطفرة فوراً — لا يُترك لما بعد الاستعادة
    update public.quote_requests set status = 'new', quoted_amount = null where id = v_id;
  exception when others then
    null;
  end;

  -- الاستعادة قبل الحكم
  execute format('alter table public.quote_requests add constraint %I %s',
                 'quote_requests_priced_states_chk', v_def);

  if not v_caught then
    raise exception
      '(ح-١) 🔴 أُسقط القيد المالي وبقي التأكيد أخضر — أي أن (ز-٣) يؤكد ما يفترضه ولا يحرس';
  end if;

  -- وبعد الاستعادة يعود الادّعاء صحيحاً
  v_ok := false;
  begin
    update public.quote_requests set status = 'quoted' where id = v_id;
  exception when others then v_ok := true;
  end;
  if not v_ok then
    raise exception '(ح-١) لم يُستعَد القيد المالي — القاعدة باقية على الطفرة';
  end if;

  -- ══ (ح-٢) طفرة آلة الحالات: يُنزع المُشغّل، فيصير (هـ-١) كاذباً ═════════
  --
  -- ⚠ والانتقال المُختار «مرفوض ← مسعَّر» لا «محوَّل ← جديد»، والسبب أن ب‑٣
  --   أضافت قيداً يقترن فيه «محوَّل» بحجزٍ قائم: فالخروجُ من «محوَّل» يرفضه
  --   **القيدُ** كما يرفضه المُشغّل، ونزعُ المُشغّل وحده لا يُظهر أثراً ⇒ طفرةٌ
  --   تبدو «مُمسَكة» بحارسٍ آخر، فلا تقيس ما وُضعت لقياسه. و«مرفوض ← مسعَّر»
  --   انتقالٌ يحرسه المُشغّل **وحده** (الخريطة: rejected → new فقط).
  select pg_get_functiondef('public.guard_quote_request_transition()'::regprocedure)
    into v_origin;

  -- تهيئة: الطلب إلى «مرفوض» بالطريق المشروع
  perform 1 from public.set_quote_request_status(v_id, 'quoted', 1000, null);
  perform 1 from public.set_quote_request_status(v_id, 'rejected', null, null);

  -- والادّعاء قائمٌ قبل الطفرة: الانتقال مرفوضٌ فعلاً
  v_ok := false;
  begin
    update public.quote_requests set status = 'quoted' where id = v_id;
  exception when others then v_ok := true;
  end;
  if not v_ok then
    raise exception '(ح-٢) «مرفوض ← مسعَّر» مرّ قبل الطفرة — الآلة مكسورة سلفاً';
  end if;

  -- 🧬 الطفرة: مُشغّلٌ يمرّر كل شيء (وهي بالضبط صورة «لا آلة حالات إطلاقاً»)
  execute $mut$
    create or replace function public.guard_quote_request_transition()
    returns trigger
    language plpgsql
    volatile
    set search_path = ''
    as $body$
    begin
      new.status_changed_at := now();
      return new;
    end;
    $body$;
  $mut$;

  v_caught := false;
  begin
    update public.quote_requests set status = 'quoted' where id = v_id;
    v_caught := true;   -- مرّ ⇒ الطفرة أُمسكت
  exception when others then
    v_caught := false;
  end;

  -- الاستعادة قبل الحكم
  execute v_origin;

  if not v_caught then
    raise exception
      '(ح-٢) 🔴 نُزعت آلة الحالات وبقي التأكيد أخضر — أي أن (هـ-١) لا يحرس شيئاً';
  end if;

  -- وبعد الاستعادة: الانتقال غير المشروع يُرفض من جديد.
  -- ⚠ والطفرة تركت الصف على «مسعَّر» (وهي النقلة التي سمحت بها)، فيُرجَع إلى
  --   «مرفوض» بالطريق المشروع قبل إعادة التأكيد.
  perform 1 from public.set_quote_request_status(v_id, 'rejected', null, null);

  v_ok := false;
  begin
    update public.quote_requests set status = 'quoted' where id = v_id;
  exception when others then v_ok := true;
  end;
  if not v_ok then
    raise exception '(ح-٢) لم تُستعَد آلة الحالات — القاعدة باقية على الطفرة';
  end if;

  -- ══ (ح-٣) طفرة حدود مصر: يُسقَط قيد الانطلاق، فيصير (ج-٥) كاذباً ════════
  select pg_get_constraintdef(oid) into v_def
    from pg_constraint where conrelid = 'public.quote_requests'::regclass
     and conname = 'quote_requests_origin_bounds_chk';
  if v_def is null then
    raise exception '(ح-٣) قيد الحدود غير موجود أصلاً';
  end if;

  execute 'alter table public.quote_requests drop constraint quote_requests_origin_bounds_chk';

  v_caught := false;
  begin
    begin
      insert into public.quote_requests (customer_name, customer_phone, details,
        origin_label, origin_lat, origin_lng)
      values (v_name, '01000000008', 'طفرة', 'دبي', 25.2048, 55.2708);
      v_caught := true;
    exception when others then
      v_caught := false;
    end;
    delete from public.quote_requests q
     where q.customer_name = v_name and q.origin_label = 'دبي';
  exception when others then
    null;
  end;

  execute format('alter table public.quote_requests add constraint %I %s',
                 'quote_requests_origin_bounds_chk', v_def);

  if not v_caught then
    raise exception
      '(ح-٣) 🔴 أُسقط قيد الحدود وبقي التأكيد أخضر — أي أن (ج-٥) لا يحرس نطاق التشغيل';
  end if;

  v_ok := false;
  begin
    insert into public.quote_requests (customer_name, customer_phone, details,
      origin_label, origin_lat, origin_lng)
    values (v_name, '01000000008', 'تفاصيل', 'دبي', 25.2048, 55.2708);
  exception when others then v_ok := true;
  end;
  if not v_ok then
    raise exception '(ح-٣) لم يُستعَد قيد الحدود — القاعدة باقية على الطفرة';
  end if;

  raise notice '✔ (ح) الطفرات الثلاث أُمسكت: الحاجز المالي وآلة الحالات وحدود مصر — ثم استُعيدت';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ط) الصلاحيات — من يملك ماذا بعد 0084
-- ----------------------------------------------------------------------------
do $$
declare
  v_can boolean;
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    raise notice '  ↳ (ط) تخطٍّ: دور anon غير موجود';
    return;
  end if;

  /*
   * (ط-١) الزائر ينشئ طلباً ولا يقرأ الجدول ولا يكتب فيه مباشرةً.
   *
   * 🔴 والفحصُ بالمعرّف لا بقائمة أنواعٍ حرفية: 0127 أضافت خمسةَ معاملات مصدرٍ
   * بافتراضيّ `NULL`، فسقط التوقيعُ المثبَّت واحمرّ التوكيد على **توسعة** لا
   * على كسر — والنداءات كلُّها تعمل لأن الافتراضيات تغطّي المنادي القديم.
   *
   * و`coalesce(…, false)` مقصودة: `bool_and` على مجموعةٍ فارغة تُرجع `null`،
   * و`not null` لا يُشعل `if` — فتختفي الدالة من القاعدة ويبقى الشاهد أخضر.
   */
  select coalesce(bool_and(has_function_privilege('anon', p.oid, 'EXECUTE')), false)
    into v_can
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and p.proname = 'create_quote_request';
  if not v_can then
    raise exception '(ط-١) الزائر لا يستطيع إنشاء طلب عرض سعر';
  end if;
  if has_table_privilege('anon', 'public.quote_requests', 'SELECT')
     or has_table_privilege('anon', 'public.quote_requests', 'INSERT')
     or has_table_privilege('anon', 'public.quote_requests', 'UPDATE') then
    raise exception '(ط-٢) الزائر يملك صلاحية مباشرة على quote_requests';
  end if;

  -- (ط-٣) 🔒 نقلة الحالة ليست للزائر إطلاقاً
  if has_function_privilege('anon', 'public.set_quote_request_status(uuid, text, numeric, text)',
       'EXECUTE') then
    raise exception '(ط-٣) 🔴 الزائر يستطيع تغيير حالة طلب عرض سعر';
  end if;

  -- (ط-٤) ودالة المُشغّل لا تُستدعى نداءً من أحد
  if has_function_privilege('anon', 'public.guard_quote_request_transition()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.guard_quote_request_transition()', 'EXECUTE') then
    raise exception '(ط-٤) دالة المُشغّل قابلة للاستدعاء نداءً';
  end if;

  raise notice '✔ (ط) الصلاحيات: الزائر يُنشئ فقط، والنقلة للوحة، والمُشغّل لا يُنادى';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ك) 🔴 D-20 — `authenticated` يشمل كل متعهّد من الباطن فلا يعني مشرفاً
--
-- والصلاحية وحدها لا تكفي حارساً: `set_quote_request_status` ممنوحة لـ
-- `authenticated` كاملاً، فلو غاب فحص `is_admin()` من جسمها لصار **كل شريك**
-- قادراً على تسعير طلبات العملاء وتحويلها. الفحص هنا بهويةٍ حقيقية غير مشرف.
-- ----------------------------------------------------------------------------
do $$
declare
  v_name  constant text := 'عميل QR_TESTS_FIXTURE ك';
  v_when  constant timestamptz := now() + interval '5 days';
  v_admin constant text := current_setting('tours.qr_admin', true);
  v_other uuid := '0c0c0c0c-0c0c-4c0c-8c0c-0c0c0c0c0c0c'::uuid;
  v_res   record;
  v_hint  text;
  v_ok    boolean := false;
  v_made  boolean := false;
begin
  select * into v_res from public.create_quote_request(
    null, v_name, '01000000009', 'تفاصيل',
    'ميدان التحرير', 30.0444, 31.2357, null, null, null, v_when, 2, null);

  -- هويةٌ مصدَّقة وليست مشرفاً — و`subcontractor` هو الدور الذي تسمّيه D-20
  -- بعينه: متعهّدٌ من الباطن يحمل `authenticated` ولا يعني مشرفاً أبداً.
  -- (الأدوار المسموحة في `profiles_role_check`: admin · ops · subcontractor · customer)
  begin
    delete from auth.users u where u.id = v_other;
    insert into auth.users (id, email) values (v_other, 'qr-tests-partner@local.invalid');
    insert into public.profiles (id, role, full_name)
    values (v_other, 'subcontractor', 'متعهّد اختبار مؤقت')
    on conflict (id) do update set role = 'subcontractor';
    v_made := true;
  exception when others then
    raise notice '  ↳ (ك) تعذّر إنشاء هوية المتعهّد: %', sqlerrm;
  end;

  -- ⚠ ولا سقوطَ إلى «هوية فارغة»: تلك حالة الضيف، وهي تُرفض لأسبابٍ أخرى
  --   (‏`auth.uid()` فارغة) فتعطي ملفاً أخضر لا يفحص D-20 إطلاقاً — وهو بعينه
  --   «الحارس الذي يطمئنك ولا يحرس».
  if not v_made then
    raise exception '(ك) تعذّر إنشاء هوية متعهّد — ولا يُفحص D-20 بهوية فارغة';
  end if;

  perform set_config('request.jwt.claim.sub', v_other::text, true);

  if public.is_admin() then
    raise exception '(ك-٠) الهوية البديلة تُعدّ مشرفاً — الفحص بلا معنى';
  end if;

  begin
    perform 1 from public.set_quote_request_status(v_res.id, 'quoted', 9999, 'محاولة شريك');
  exception when others then
    v_ok := true; get stacked diagnostics v_hint = pg_exception_hint;
  end;

  -- تُستعاد هوية المشرف قبل الحكم — فشلٌ هنا لا يجوز أن يترك الجلسة بلا صلاحية
  perform set_config('request.jwt.claim.sub', coalesce(v_admin, ''), true);
  if v_made then
    delete from public.profiles p where p.id = v_other;
    delete from auth.users    u where u.id = v_other;
  end if;

  if not v_ok or v_hint is distinct from 'forbidden' then
    raise exception
      '(ك) 🔴 غيرُ المشرف سعّر طلب عميل (رُفض=% رمز=%) — D-20 مكسورة',
      v_ok, coalesce(v_hint, 'بلا');
  end if;

  raise notice '✔ (ك) D-20: هويةٌ مصدَّقة غير مشرفة لا تُسعّر ولا تُحوّل';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ي) التنظيف — إزالة كل ما أنشأه الملف، والتأكد أنه أُزيل فعلاً
--
-- ⚠ ومُشغّل الاختبارات يُنفّذ الملف في معاملةٍ ضمنية واحدة: الفشل يُرجع كل شيء،
--   لكن **النجاح يُثبِّت**. فبلا هذا القسم يتسرّب صفٌّ في كل تشغيل ناجح.
-- ----------------------------------------------------------------------------
do $$
declare
  v_left integer;
begin
  delete from public.notifications n where n.payload ->> 'customerName' like '%QR_TESTS_FIXTURE%';
  delete from public.quote_requests q where q.customer_name like '%QR_TESTS_FIXTURE%';
  -- ب‑٣: الحجوزات بعد الطلبات (المفتاح الأجنبي `on delete restrict`)
  delete from public.bookings b where b.customer_name like '%QR_TESTS_FIXTURE%';

  select count(*) into v_left from public.quote_requests q
   where q.customer_name like '%QR_TESTS_FIXTURE%';
  if v_left <> 0 then
    raise exception '(ي) بقيت % من صفوف الاختبار بعد التنظيف', v_left;
  end if;

  select count(*) into v_left from public.bookings b
   where b.customer_name like '%QR_TESTS_FIXTURE%';
  if v_left <> 0 then
    raise exception '(ي) بقيت % من حجوزات الاختبار بعد التنظيف', v_left;
  end if;

  select count(*) into v_left from public.notifications n
   where n.payload ->> 'customerName' like '%QR_TESTS_FIXTURE%';
  if v_left <> 0 then
    raise exception '(ي) بقيت % من إشعارات الاختبار بعد التنظيف', v_left;
  end if;

  -- المشرف المؤقت — يُحذف إن كان هذا الملف من أنشأه وحده
  if coalesce(current_setting('tours.qr_admin_fixture', true), '0') = '1' then
    delete from public.profiles p where p.id = current_setting('tours.qr_admin')::uuid;
    delete from auth.users    u where u.id = current_setting('tours.qr_admin')::uuid;
    raise notice '  ↳ حُذف المشرف المؤقت';
  end if;

  perform set_config('tours.qr_admin', '', false);
  perform set_config('tours.qr_admin_fixture', '', false);
  perform set_config('tours.qr_class', '', false);
  perform set_config('request.jwt.claim.sub', '', true);

  raise notice '✔ (ي) التنظيف تم — لا صفوف ولا إشعارات ولا هوية متبقية';
end;
$$;

-- ----------------------------------------------------------------------------
-- الخلاصة
-- ----------------------------------------------------------------------------
do $$
begin
  raise notice 'ALL PASSED — طلب عرض السعر مُهيكل، وآلته تحرس، وطفراته أُمسكت';
end;
$$;
