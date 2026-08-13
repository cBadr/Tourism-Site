-- ============================================================================
-- lookup_tests.sql — اختبارات قبول لـ «تابع حجزك»
--                    (هجرة 0027_batch_two.sql · القسم ق١٣ · الملاحظة ١)
--
-- كيف تشغّله: `node scripts/db-test.mjs lookup` أو الصق الملف كاملاً في SQL
-- Editor واضغط Run. النجاح = آخر سطر «ALL PASSED». أي فشل يرمي exception برسالة
-- عربية تحدد التأكيد والقيمة المتوقعة والفعلية.
-- (‏`db-test.mjs` يرسل الملف كاملاً في استعلام واحد ⇒ **معاملة ضمنية واحدة**،
--  فلا `begin` ولا `commit` في المستوى الأعلى، وأي فشل يُرجع كل ما في الملف.)
--
-- ── حواجز هذا الملف (لا تُغلق الدفعة وأحدها راسب) ───────────────────────────
-- (١) القسم (د-١): **المحاولة الخاطئة تُحسب.** مسار «لا نتيجة» يرجع صفر صفوف
--     **ولا يرمي**، فلو رمى لأُرجعت المعاملة ومعها صفُّ العدّاد ⇒ التعدادُ — وهو
--     كل ما يفعله المهاجم — بلا خانق، والقفل يقع على العميل الشرعي وحده.
--     التأكيد على **بقاء العدّاد وازدياده** هو بيت القصيد لا رجوعُ الصفر.
-- (٢) القسم (ج-٣): **المرجع العشري يُوجد.** `next_booking_reference` تطيل الرمز
--     إلى ١٠ محارف بعد ٢٥ تصادماً؛ فنمطٌ يفرض ٦ محارف يقفل تلك الحجوزات إلى
--     الأبد ولا يظهر العطب إلا بعد أن يكبر الجدول.
-- (٣) القسم (د-٢): **هاتفٌ بلا أرقام لا يفتح حجزاً `phone_norm is null`.**
--     مطابقة `is not distinct from` كانت ستجعل المرجعَ وحده كافياً. حارسان
--     مستقلان: حارس طول الهاتف سلوكاً، وصيغة المطابقة `=` في المصدر — لأن
--     الصيغتين لا يفرّق بينهما أي مُدخل ما دام الحارس قائماً.
-- (٤) القسم (و): **الدالة غير ممنوحة لـ anon ولا لـ authenticated.** من ينادي
--     الدالة مباشرة يختار `p_client_key` بنفسه ⇒ دلوٌ جديد لكل طلب عدّاده ١
--     ولا يبلغ الحدّ أبداً ⇒ خانقٌ بالاسم فقط.
--
-- ── منهج الملف ──────────────────────────────────────────────────────────────
--   • **التجهيز يملك بياناته**: ثلاثة حجوزات بمعرّفات ثابتة
--     `e3000000-…-0000000000xx` ووسم `BOOKING_LOOKUP_FIXTURE` داخل لقطة الرحلة،
--     تُمسح في البداية والنهاية معاً (فتشغيل انهار في المنتصف لا يمنع التالي).
--   • **كل توقّع مشتق من نفس مُدخل الكود المُختبَر**: هوية الهاتف تُقرأ من
--     `bookings.phone_norm` وتُقارَن بناتج `normalize_phone`، والتوكن المتوقَّع
--     يُقرأ من الصف نفسه — لا رقم ولا نص محفور بيد.
--   • **مفتاح عميل جديد لكل نداء** (‏`BOOKING_LOOKUP_FIXTURE-<uuid>`): الحدّ ٨
--     لكل ربع ساعة، و`now()` ثابتة داخل المعاملة الواحدة ⇒ كل نداءات الملف تقع
--     في **دلو واحد**؛ فبمفتاح مشترك كان القسم الثالث سيرسب بـ rate-limited.
--   • **إحداثيات صحراوية** في لقطة الرحلة (٢٥٫٠، ٢٧٫٥) ← (٢٤٫٥، ٢٨٫٢) على قاعدة
--     الملفات الأخرى: لا قائمة أسعار حقيقية تغطيها.
--   • أرقام التجهيز من نطاق **`010000798xx`** — لا تصادم أرقام `phone_tests`
--     (‏`010000799xx`) ولا أي رقم ديمو أو حقيقي.
--   • قسم الخانق يعمل داخل **كتلة تُرجع نفسها** (‏`ROLLBACK_MARKER`) فلا يبقى
--     أثر لثمانية عشر صفَّ محاولة حتى لو نجح الملف كله.
--
-- ⚠ ما يلمسه هذا الملف من صفوف حقيقية: لا شيء. `find_booking_by_reference` لا
--   تكتب إلا في `booking_lookup_attempts` (بمفاتيحنا وحدها)، وتحذف انتهازياً
--   صفوف المحاولات الأقدم من ساعة — وهو عين عملها المصمَّم، وصفوفٌ تنتهي
--   صلاحيتها أصلاً. ولا مفتاح عام (global switch) في هذا القسم من 0027.
--
-- المرجع: supabase/migrations/0027_batch_two.sql (ق١٣)
--         + lib/booking-types.ts (‏`BookingLookupErrorCode` وتواقيع 0027)
--         + supabase/tests/phone_tests.sql (‏`normalize_phone` ممنوعة على anon)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (٠) الشروط المسبقة · تنظيف بقايا تشغيل سابق · زرع التجهيز
-- ----------------------------------------------------------------------------
do $$
declare
  v_missing text;
  v_clash   text;
begin
  -- الهوية تُفرَّغ أولاً: بقيةُ مطالبة jwt من ملف سابق في نفس الاتصال تغيّر
  -- `current_actor()` في سجل الحجز بلا داعٍ.
  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claims', '', false);

  select string_agg(x.sig, '، ')
    into v_missing
  from (values
    ('public.find_booking_by_reference(text, text, text)'),
    ('public.normalize_phone(text)'),
    ('public.get_booking_by_token(text)')
  ) as x(sig)
  where to_regprocedure(x.sig) is null;

  if v_missing is not null then
    raise exception
      'شرط مسبق: دوال مفقودة (نفّذ 0027_batch_two.sql أولاً): %', v_missing;
  end if;

  if to_regclass('public.booking_lookup_attempts') is null then
    raise exception 'شرط مسبق: جدول booking_lookup_attempts مفقود — 0027 لم تُنفَّذ';
  end if;

  if not exists (
    select 1 from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = 'bookings'
      and c.column_name = 'phone_norm'
  ) then
    raise exception 'شرط مسبق: bookings.phone_norm غير موجود — 0026 لم تُنفَّذ';
  end if;

  -- ── تنظيف بقايا ── الإشعارات أولاً (بلا مفتاح أجنبي)، ثم الحجوزات
  -- (‏`booking_events` تسقط بالتتالي)، ثم صفوف المحاولات بمفاتيحنا.
  delete from public.notifications n
   where n.payload ->> 'bookingId' in (
     'e3000000-0000-4000-8000-000000000001',
     'e3000000-0000-4000-8000-000000000002',
     'e3000000-0000-4000-8000-000000000003');

  delete from public.bookings b
   where b.id in ('e3000000-0000-4000-8000-000000000001',
                  'e3000000-0000-4000-8000-000000000002',
                  'e3000000-0000-4000-8000-000000000003')
      or b.trip ->> 'notes' = 'BOOKING_LOOKUP_FIXTURE';

  delete from public.booking_lookup_attempts a
   where a.client_key like 'BOOKING_LOOKUP_FIXTURE%';

  -- التجهيز يملك مراجعه: مرجعٌ من مراجعنا يخص حجزاً حقيقياً يعني أن الإدراج
  -- سيسقط على قيد التفرد برسالة غامضة، وأن كل تأكيد بعده يقيس حجز غيرنا.
  select string_agg(b.reference, '، ')
    into v_clash
  from public.bookings b
  where b.reference in ('TR-QK7WX2', 'TR-QK7WX2ZH34', 'TR-QK7WX4');

  if v_clash is not null then
    raise exception
      '(٠) مراجع التجهيز (%) مأخوذة بحجوزات قائمة — غيّر رموز الاختبار', v_clash;
  end if;

  raise notice '✔ (٠) الشروط المسبقة سليمة والأرض نظيفة';
end;
$$;

-- (٠-ب) الحجوزات الثلاثة — إدراج مباشر لا `create_booking`
--
-- لماذا الإدراج المباشر: هذا الملف يختبر **البحث** لا التسعير، ويحتاج التحكم في
-- ثلاثة أشياء لا تنتجها `create_booking`: مرجعٌ معلوم، ومرجعٌ بالشكل العشري
-- النادر، وحجزٌ `phone_norm is null`. والمُشغّلات كلها تعمل كالمعتاد (المرجع
-- والتوكن يُملآن إن غابا، والعمود المولَّد يُحسب، والسجل والإشعار يُكتبان).
--
-- ⚠ الحجز الثاني مرجعه **يبدأ برمز الأول** (‏QK7WX2 ⊂ QK7WX2ZH34) عمداً: مطابقةٌ
-- بـ `like ... || '%'` بدل `=` كانت ستُرجع صفين للأول، و`limit 1` بلا ترتيب قد
-- تعطي توكن الحجز الخطأ — أي تسليم رابط حجز إلى صاحب حجز آخر.
do $$
declare
  v_n integer;
begin
  insert into public.bookings
    (id, reference, public_token, status, class_slug, class_title,
     total, currency, plan, amount_due, amount_remaining,
     customer_name, customer_phone, trip)
  values
    ('e3000000-0000-4000-8000-000000000001', 'TR-QK7WX2', encode(public.secure_random_bytes(24), 'hex'),
     'pending_payment', 'lookup-fixture', 'فئة تجهيز البحث',
     100, 'EGP', 'full', 100, 0,
     'عميل تجهيز البحث', '01000079801',
     jsonb_build_object(
       'notes', 'BOOKING_LOOKUP_FIXTURE',
       'origin', jsonb_build_object('label', 'موقع صحراوي أ', 'lat', 25.000000, 'lng', 27.500000),
       'destination', jsonb_build_object('label', 'موقع صحراوي ب', 'lat', 24.500000, 'lng', 28.200000))),

    -- المرجع العشري النادر: ما تنتجه `next_booking_reference` بعد ٢٥ تصادماً
    ('e3000000-0000-4000-8000-000000000002', 'TR-QK7WX2ZH34', encode(public.secure_random_bytes(24), 'hex'),
     'pending_payment', 'lookup-fixture', 'فئة تجهيز البحث',
     100, 'EGP', 'full', 100, 0,
     'عميل المرجع العشري', '01000079802',
     jsonb_build_object(
       'notes', 'BOOKING_LOOKUP_FIXTURE',
       'origin', jsonb_build_object('label', 'موقع صحراوي أ', 'lat', 25.000000, 'lng', 27.500000),
       'destination', jsonb_build_object('label', 'موقع صحراوي ب', 'lat', 24.500000, 'lng', 28.200000))),

    -- حجزٌ هاتفه بلا خانة رقمية واحدة ⇒ `phone_norm is null` (فخ
    -- `is not distinct from`). يحاكي الحجوزات القديمة التي أُدخلت هاتفياً.
    ('e3000000-0000-4000-8000-000000000003', 'TR-QK7WX4', encode(public.secure_random_bytes(24), 'hex'),
     'pending_payment', 'lookup-fixture', 'فئة تجهيز البحث',
     100, 'EGP', 'full', 100, 0,
     'عميل بلا رقم', 'يُراجع لاحقاً',
     jsonb_build_object(
       'notes', 'BOOKING_LOOKUP_FIXTURE',
       'origin', jsonb_build_object('label', 'موقع صحراوي أ', 'lat', 25.000000, 'lng', 27.500000),
       'destination', jsonb_build_object('label', 'موقع صحراوي ب', 'lat', 24.500000, 'lng', 28.200000)));

  -- شاهد إيجابي على التجهيز نفسه: الهوية اشتُقت فعلاً، والثالث بلا هوية فعلاً.
  -- بدون هذا يمر القسم (د-٢) حتى لو كان `phone_norm` مملوءاً بشيء ما.
  select count(*)::integer into v_n
  from public.bookings b
  where b.id = 'e3000000-0000-4000-8000-000000000001'
    and b.phone_norm = public.normalize_phone('01000079801');
  if v_n <> 1 then
    raise exception
      '(٠-ب) هوية الحجز الأول لا تساوي normalize_phone(''01000079801'') — التجهيز نفسه خطأ';
  end if;

  if (select b.phone_norm from public.bookings b
       where b.id = 'e3000000-0000-4000-8000-000000000003') is not null then
    raise exception
      '(٠-ب) الحجز الثالث phone_norm = «%» والمتوقع null — فخ is-not-distinct-from لن يُختبر',
      (select b.phone_norm from public.bookings b
        where b.id = 'e3000000-0000-4000-8000-000000000003');
  end if;

  raise notice
    '✔ (٠-ب) ثلاثة حجوزات تجهيز: مرجع سداسي · مرجع عشري · حجز بلا هوية هاتف';
end;
$$;

-- ----------------------------------------------------------------------------
-- (أ) المسار السعيد — التوكن وحده ولا شيء غيره
--
-- «ولا شيء غيره» ليس تجميلاً: من عرف المرجع والهاتف يستحق ما يستحقه حاملُ
-- الرابط، أما عمودٌ زائد في نوع الإرجاع (اسم · حالة · مبلغ) فيصير تسريباً
-- **بنيوياً** يكفي فيه المرجعُ والهاتف بلا فتح الرابط (قاعدة CONVENTIONS §٧:
-- ما لا يوجد في نوع الإرجاع لا يُسرَّب بخطأ في الواجهة).
-- ----------------------------------------------------------------------------
do $$
declare
  v_expected   text;
  v_ref        text;
  v_got        text;
  v_rows       integer;
  v_cols       integer;
  v_cols_wit   integer;
  v_colname    text;
  v_backref    text;
begin
  select b.public_token, b.reference into v_expected, v_ref
  from public.bookings b where b.id = 'e3000000-0000-4000-8000-000000000001';

  -- (أ-١) المطابقة بالمرجع والهاتف تُرجع توكن الحجز نفسه (متوقَّعٌ مقروء من
  --       الصف لا مكتوب بيد)
  select f.public_token into v_got
  from public.find_booking_by_reference(
         v_ref, '01000079801',
         'BOOKING_LOOKUP_FIXTURE-' || gen_random_uuid()::text) f;

  if v_got is distinct from v_expected then
    raise exception
      '(أ-١) البحث بمرجع «%» وهاتف صحيح أرجع «%» والمتوقع توكن الحجز «%»',
      v_ref, coalesce(v_got, 'لا شيء'), v_expected;
  end if;

  -- (أ-٢) صفٌّ واحد لا أكثر
  select count(*)::integer into v_rows
  from public.find_booking_by_reference(
         v_ref, '01000079801',
         'BOOKING_LOOKUP_FIXTURE-' || gen_random_uuid()::text);

  if v_rows <> 1 then
    raise exception '(أ-٢) عدد الصفوف % لا ١', v_rows;
  end if;

  -- (أ-٣) 🔒 نوع الإرجاع **عمود واحد** اسمه public_token
  select count(*) filter (where t.m::text = 't'),
         min(t.nm) filter (where t.m::text = 't')
    into v_cols, v_colname
  from pg_proc p
  cross join lateral unnest(p.proargnames, p.proargmodes) as t(nm, m)
  where p.oid = to_regprocedure('public.find_booking_by_reference(text, text, text)');

  -- شاهد إيجابي للمسبار: نفس العدّاد على دالة نعلم أنها متعددة الأعمدة. بدونه
  -- كان مسبارٌ يرجع ١ دائماً (أو صفراً) سيجعل (أ-٣) تأكيداً لا يفشل أبداً.
  select count(*) filter (where t.m::text = 't')
    into v_cols_wit
  from pg_proc p
  cross join lateral unnest(p.proargnames, p.proargmodes) as t(nm, m)
  where p.oid = to_regprocedure('public.get_booking_by_token(text)');

  if coalesce(v_cols_wit, 0) < 2 then
    raise exception
      '(أ-٣) مسبار عدّ أعمدة الإرجاع معطّل: get_booking_by_token أعطى % عموداً — لا تصدّق ما بعده',
      coalesce(v_cols_wit, 0);
  end if;

  if v_cols <> 1 then
    raise exception
      '(أ-٣) 🔒 نوع إرجاع find_booking_by_reference فيه % عموداً لا عموداً واحداً — تسريبٌ بنيوي بلا فتح الرابط',
      v_cols;
  end if;

  if v_colname is distinct from 'public_token' then
    raise exception
      '(أ-٣) اسم العمود الوحيد «%» لا public_token — العقد في lib/booking-types.ts',
      coalesce(v_colname, 'بلا اسم');
  end if;

  -- (أ-٤) والتوكن الراجع **يفتح الحجز فعلاً** — شاهد نهاية إلى نهاية على أن
  --       الرقم المُعاد توكن حقيقي لا نصٌّ ما
  select g.reference into v_backref
  from public.get_booking_by_token(v_got) g;

  if v_backref is distinct from v_ref then
    raise exception
      '(أ-٤) get_booking_by_token على التوكن الراجع أعطى مرجع «%» والمتوقع «%»',
      coalesce(v_backref, 'لا شيء'), v_ref;
  end if;

  raise notice
    '✔ (أ) المسار السعيد: صفٌّ واحد بعمود واحد اسمه public_token، والتوكن يفتح الحجز نفسه';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ب) أشكال الهاتف — ما يكتبه العميل فعلاً في حقل «الهاتف»
--
-- التوقّع مشتق من `normalize_phone` ومن `bookings.phone_norm` معاً لا من نصّ
-- مكتوب: الشكل يمر أولاً على الدالة (فحص الاشتقاق) ثم على البحث (فحص السلوك).
-- ----------------------------------------------------------------------------
do $$
declare
  v_norm     text;
  v_expected text;
  v_ref      text;
  v_bad      text;
begin
  select b.phone_norm, b.public_token, b.reference
    into v_norm, v_expected, v_ref
  from public.bookings b where b.id = 'e3000000-0000-4000-8000-000000000001';

  -- (ب-١) الاشتقاق: كل شكل يُطبَّع إلى هوية الحجز نفسها
  -- ⚠ `coalesce` داخل التجميع لا خارجه: `string_agg` تتخطى القيم الفارغة، فمُدخل
  --   ينتج null كان سيعطي v_bad = null ⇒ تأكيدٌ يستحيل أن يفشل (النمط ٩).
  select string_agg(t.inp || ' ⇒ ' || coalesce(public.normalize_phone(t.inp), 'null'), '  |  ')
    into v_bad
  from (values
    ('01000079801'),          -- كما هو
    ('+201000079801'),        -- بمفتاح الدولة
    ('00201000079801'),       -- بالبادئة الدولية
    ('010 0007 9801'),        -- بمسافات
    ('(010) 0007-9801'),      -- بأقواس وشُرَط
    ('٠١٠٠٠٠٧٩٨٠١')           -- بالأرقام العربية الهندية (لوحة المفاتيح العربية)
  ) as t(inp)
  where public.normalize_phone(t.inp) is distinct from v_norm;

  if v_bad is not null then
    raise exception
      '(ب-١) أشكال لم تُطبَّع إلى هوية الحجز «%»: %', v_norm, v_bad;
  end if;

  -- (ب-٢) والسلوك: كل شكل يجد الحجز نفسه ويرجع توكنه
  -- مفتاح عميل جديد لكل شكل: الحدّ ٨ لكل ربع ساعة و`now()` ثابتة داخل المعاملة.
  select string_agg(t.inp || ' ⇒ ' || coalesce(x.got, 'لا شيء'), '  |  ')
    into v_bad
  from (values
    ('01000079801'),
    ('+201000079801'),
    ('00201000079801'),
    ('010 0007 9801'),
    ('(010) 0007-9801'),
    ('٠١٠٠٠٠٧٩٨٠١')
  ) as t(inp)
  cross join lateral (
    select (select f.public_token
              from public.find_booking_by_reference(
                     v_ref, t.inp,
                     'BOOKING_LOOKUP_FIXTURE-' || gen_random_uuid()::text) f
             limit 1) as got
  ) x
  where x.got is distinct from v_expected;

  if v_bad is not null then
    raise exception
      '(ب-٢) أشكال هاتف لم تجد الحجز «%»: %  (المتوقع توكنه)', v_ref, v_bad;
  end if;

  raise notice
    '✔ (ب) ستة أشكال لنفس الرقم — بالصفر وبمفتاح الدولة وبالبادئة وبمسافات وبأقواس وبالأرقام العربية — كلها تجد الحجز';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ج) أشكال المرجع — والمرجع العشري النادر
--
-- 🔒 (ج-٣): `next_booking_reference` تطيل الرمز إلى ١٠ محارف بعد ٢٥ تصادماً.
-- نمطٌ يفرض `{6}` في أي موضع يقفل تلك الحجوزات إلى الأبد، والعطب لا يظهر إلا
-- بعد أن يكبر الجدول — أي بعد نجاح المشروع (النمط ٦ في LESSONS).
-- ----------------------------------------------------------------------------
do $$
declare
  v_expected  text;
  v_expected2 text;
  v_bad       text;
begin
  select b.public_token into v_expected
  from public.bookings b where b.id = 'e3000000-0000-4000-8000-000000000001';

  select b.public_token into v_expected2
  from public.bookings b where b.id = 'e3000000-0000-4000-8000-000000000002';

  -- (ج-١) الشكل السداسي بكل ما قد يكتبه العميل: بالبادئة وبدونها، حروفاً صغيرة،
  --       بمسافات، وبشُرَط زائدة
  select string_agg('«' || t.inp || '» ⇒ ' || coalesce(x.got, 'لا شيء'), '  |  ')
    into v_bad
  from (values
    ('TR-QK7WX2'),
    ('QK7WX2'),
    ('tr-qk7wx2'),
    ('qk7wx2'),
    ('  TR - QK7 WX2  '),
    ('tr qk7wx2')
  ) as t(inp)
  cross join lateral (
    select (select f.public_token
              from public.find_booking_by_reference(
                     t.inp, '01000079801',
                     'BOOKING_LOOKUP_FIXTURE-' || gen_random_uuid()::text) f
             limit 1) as got
  ) x
  where x.got is distinct from v_expected;

  if v_bad is not null then
    raise exception '(ج-١) أشكال مرجع لم تجد الحجز الأول: %', v_bad;
  end if;

  -- (ج-٢) شاهد إيجابي مقابل: مرجعٌ آخر لا يرجع توكن الأول. بدونه كان (ج-١) يمر
  --       حتى لو صارت الدالة ترجع أول حجز مهما كان المرجع.
  select f.public_token into v_bad
  from public.find_booking_by_reference(
         'TR-QK7WX4', '01000079801',
         'BOOKING_LOOKUP_FIXTURE-' || gen_random_uuid()::text) f;

  if v_bad is not null then
    raise exception
      '(ج-٢) مرجع حجزٍ آخر مع هاتف الحجز الأول أرجع «%» — المطابقة لا تجمع الشرطين',
      v_bad;
  end if;

  -- (ج-٣) 🔒 المرجع العشري يُوجد — بالبادئة وبدونها
  select string_agg('«' || t.inp || '» ⇒ ' || coalesce(x.got, 'لا شيء'), '  |  ')
    into v_bad
  from (values
    ('TR-QK7WX2ZH34'),
    ('qk7wx2zh34'),
    ('TR-QK7 WX2-ZH34')
  ) as t(inp)
  cross join lateral (
    select (select f.public_token
              from public.find_booking_by_reference(
                     t.inp, '01000079802',
                     'BOOKING_LOOKUP_FIXTURE-' || gen_random_uuid()::text) f
             limit 1) as got
  ) x
  where x.got is distinct from v_expected2;

  if v_bad is not null then
    raise exception
      '(ج-٣) 🔒 المرجع العشري (ما تنتجه next_booking_reference بعد ٢٥ تصادماً) لم يُوجد: % — كل حجز بمرجع طويل مقفل إلى الأبد',
      v_bad;
  end if;

  -- (ج-٤) والمرجع العشري لا يُخلط بالسداسي الذي يبدأ به: البحث عن السداسي يرجع
  --       توكن السداسي وحده. مطابقةٌ بـ `like` كانت ستُرجع صفين هنا.
  select f.public_token into v_bad
  from public.find_booking_by_reference(
         'TR-QK7WX2', '01000079802',
         'BOOKING_LOOKUP_FIXTURE-' || gen_random_uuid()::text) f;

  if v_bad is not null then
    raise exception
      '(ج-٤) مرجع الحجز الأول مع هاتف الحجز الثاني أرجع «%» — المطابقة بالبادئة لا بالتساوي',
      v_bad;
  end if;

  raise notice
    '✔ (ج) المرجع يُقبل بالبادئة وبدونها وبحروف صغيرة وبمسافات وشُرَط، والمرجع العشري يُوجد ولا يُخلط بالسداسي الذي يبدأ به';
end;
$$;

-- ----------------------------------------------------------------------------
-- (د) 🔒 المسارات السالبة — وهي بيت القصيد
--
-- (د-١) هاتف خطأ مع مرجع صحيح: **صفر صفوف بلا استثناء، والمحاولة محسوبة.**
--       الاستثناء هنا كان سيُرجع المعاملة ومعها صفُّ العدّاد ⇒ المحاولة الفاشلة
--       لا تُحسب أبداً ⇒ التعداد (وهو كل ما يفعله المهاجم) بلا خانق، والقفل
--       يقع على العميل الشرعي وحده.
-- (د-٢) هاتف بلا أرقام لا يفتح حجزاً `phone_norm is null` (فخ
--       `is not distinct from`).
-- (د-٣) التحقق الشكلي قبل العدّ فلا يحرق خطأٌ مطبعي رصيد الزائر.
-- ----------------------------------------------------------------------------
do $$
declare
  v_key     text := 'BOOKING_LOOKUP_FIXTURE-' || gen_random_uuid()::text;
  v_key2    text := 'BOOKING_LOOKUP_FIXTURE-' || gen_random_uuid()::text;
  v_before  integer;
  v_after   integer;
  v_rows    integer;
  v_raised  boolean;
  v_hint    text;
  v_msg     text;
  v_src     text;
  v_p_check integer;
  v_p_count integer;
begin
  -- ══ (د-١) الهاتف الخطأ: صفر صفوف · بلا استثناء · والعدّاد يزيد ═══════════
  select coalesce((select a.attempts from public.booking_lookup_attempts a
                    where a.client_key = v_key), 0)
    into v_before;

  v_raised := false;
  begin
    select count(*)::integer into v_rows
    from public.find_booking_by_reference('TR-QK7WX2', '01000079888', v_key);
  exception when others then
    v_raised := true;
    v_msg := sqlerrm;
  end;

  -- الترتيب مقصود: «لم يرمِ» أولاً، لأن الرمي يُرجع الكتلة الفرعية ومعها زيادة
  -- العدّاد — فتأكيدُ العدّاد بعده كان سيرسب برسالة مضلِّلة عن العدّ لا عن الرمي.
  if v_raised then
    raise exception
      '(د-١) 🔒 مسار «لا نتيجة» رمى استثناءً («%») — والاستثناء يُرجع صفَّ العدّاد معه فلا تُحسب المحاولة الفاشلة أبداً ⇒ التعداد بلا خانق',
      v_msg;
  end if;

  if v_rows <> 0 then
    raise exception
      '(د-١) هاتف خطأ مع مرجع صحيح أرجع % صفاً لا صفراً — الشرطان لا يجتمعان في المطابقة',
      v_rows;
  end if;

  select coalesce((select a.attempts from public.booking_lookup_attempts a
                    where a.client_key = v_key), 0)
    into v_after;

  if v_after <> v_before + 1 then
    raise exception
      '(د-١) 🔒 بعد محاولة فاشلة صار العدّاد % وكان % — المتوقع %: المحاولة الخاطئة لا تُحسب فالخانق لا يبلغ حدّه أبداً',
      v_after, v_before, v_before + 1;
  end if;

  -- ══ (د-٢) الفخ: هاتف بلا أرقام وحجز بلا هوية ══════════════════════════════
  -- أولاً: الحارس يرفض المُدخل قبل أن يصل إلى المطابقة أصلاً
  v_raised := false; v_hint := null;
  begin
    perform * from public.find_booking_by_reference(
      'TR-QK7WX4', 'لا يوجد',
      'BOOKING_LOOKUP_FIXTURE-' || gen_random_uuid()::text);
  exception when others then
    v_raised := true;
    get stacked diagnostics v_hint = pg_exception_hint;
  end;

  if not v_raised or v_hint is distinct from 'invalid-input' then
    raise exception
      '(د-٢) 🔒 هاتف بلا خانة رقمية لم يُرفض بـ invalid-input (رُفض=% الرمز=%) — وحجز TR-QK7WX4 هاتفه المطبَّع null فمطابقة is-not-distinct-from تفتحه بالمرجع وحده',
      v_raised, coalesce(v_hint, 'بلا');
  end if;

  -- وثانياً — شاهد اتساق: الحجز الذي هويته null لا يُرجع لأي هاتف سليم
  v_raised := false;
  begin
    select count(*)::integer into v_rows
    from public.find_booking_by_reference(
      'TR-QK7WX4', '01000079801',
      'BOOKING_LOOKUP_FIXTURE-' || gen_random_uuid()::text);
  exception when others then
    v_raised := true;
    v_msg := sqlerrm;
  end;

  if v_raised then
    raise exception '(د-٢) البحث عن حجز بلا هوية رمى استثناءً («%») بدل صفر صفوف', v_msg;
  end if;

  if v_rows <> 0 then
    raise exception
      '(د-٢) حجزٌ phone_norm فيه null أُرجع لهاتف لا يطابقه (% صفاً)', v_rows;
  end if;

  -- وثالثاً — 🔒 المطابقة بـ `=` في المصدر نفسه.
  -- ⚠ لماذا مسبار مصدر ولا يكفي السلوك: مع هاتف **غير فارغ** يتصرف
  -- `is not distinct from` تصرّف `=` حرفاً بحرف، والهاتفُ الفارغ يرتدّ على حارس
  -- الطول قبل أن يبلغ المطابقة. فلا مُدخل يفرّق بين الصيغتين ما دام الحارس
  -- قائماً ⇒ التأكيدان السلوكيان أعلاه يمران في الحالتين، والفرق نفسه — وهو
  -- «المرجع وحده يكفي لكل حجز قديم بلا هاتف» — لا يظهر إلا لو سقط الحارس.
  -- فالحكم على الصيغة يقع على المصدر، وحارسان مستقلان خير من واحد.
  v_src := pg_get_functiondef(
             to_regprocedure('public.find_booking_by_reference(text, text, text)')::oid);

  -- شاهد إيجابي للمسبار: يلتقط اسم العمود الذي نعلم وجوده يقيناً
  if coalesce(v_src, '') !~ 'phone_norm' then
    raise exception
      '(د-٢) مسبار مصدر المطابقة لا يلتقط phone_norm — المطابقة النصية معطّلة فلا تصدّق ما بعدها';
  end if;

  if v_src !~ 'phone_norm\s*=\s*v_phone' then
    raise exception
      '(د-٢) 🔒 المطابقة في المصدر ليست b.phone_norm = v_phone — راجع الصيغة قبل أي شيء';
  end if;

  if v_src ~ 'phone_norm\s+is\s+not\s+distinct\s+from' then
    raise exception
      '(د-٢) 🔒 المطابقة بـ is not distinct from — هاتفٌ فارغ يطابق كل حجز phone_norm فيه null ⇒ المرجع وحده يفتح الحجز';
  end if;

  -- ══ (د-٣) التحقق الشكلي قبل العدّ ═════════════════════════════════════════
  -- سلوكياً: مفتاح جديد تماماً، فمُدخل مرفوض شكلياً لا يترك له صفاً.
  v_raised := false; v_hint := null;
  begin
    perform * from public.find_booking_by_reference('TR-Q', '01000079801', v_key2);
  exception when others then
    v_raised := true;
    get stacked diagnostics v_hint = pg_exception_hint;
  end;

  if not v_raised or v_hint is distinct from 'invalid-input' then
    raise exception
      '(د-٣) مرجع مشوَّه «TR-Q» لم يُرفض بـ invalid-input (رُفض=% الرمز=%)',
      v_raised, coalesce(v_hint, 'بلا');
  end if;

  v_raised := false; v_hint := null;
  begin
    perform * from public.find_booking_by_reference('TR-QK7WX2', '0123', v_key2);
  exception when others then
    v_raised := true;
    get stacked diagnostics v_hint = pg_exception_hint;
  end;

  if not v_raised or v_hint is distinct from 'invalid-input' then
    raise exception
      '(د-٣) هاتف قصير «0123» لم يُرفض بـ invalid-input (رُفض=% الرمز=%)',
      v_raised, coalesce(v_hint, 'بلا');
  end if;

  select coalesce((select a.attempts from public.booking_lookup_attempts a
                    where a.client_key = v_key2), 0)
    into v_after;

  if v_after <> 0 then
    raise exception
      '(د-٣) بعد رفضين شكليين صار عدّاد المفتاح الجديد % لا صفراً — خطأٌ مطبعي يحرق رصيد الزائر',
      v_after;
  end if;

  -- شاهد إيجابي **على نفس المفتاح**: نداء سليم يحرّك العدّاد فعلاً. بدونه كان
  -- التأكيد أعلاه يمر حتى لو كان المفتاح غير قابل للكتابة أصلاً.
  perform * from public.find_booking_by_reference('TR-QK7WX2', '01000079801', v_key2);

  select coalesce((select a.attempts from public.booking_lookup_attempts a
                    where a.client_key = v_key2), 0)
    into v_after;

  if v_after <> 1 then
    raise exception
      '(د-٣) الشاهد الإيجابي: بعد نداء سليم صار العدّاد % لا ١ — مسبار العدّاد لا يرى الزيادة فلا تصدّق التأكيد قبله',
      v_after;
  end if;

  -- وبنيوياً: الترتيب في المصدر نفسه. ⚠ التأكيد السلوكي أعلاه **وحده لا يكفي**:
  -- الاستثناء يُرجع الكتلة الفرعية، فحتى لو عُدَّت المحاولة قبل الرفض لعاد
  -- العدّاد صفراً بعد الالتقاط — أي تأكيدٌ يمر في الحالتين. فالحكم على الترتيب
  -- يقع على المصدر: رفضُ `invalid-input` قبل الكتابة في جدول المحاولات.
  v_src := pg_get_functiondef(
             to_regprocedure('public.find_booking_by_reference(text, text, text)')::oid);
  v_p_check := position('invalid-input' in coalesce(v_src, ''));
  v_p_count := position('booking_lookup_attempts' in coalesce(v_src, ''));

  if v_p_check = 0 or v_p_count = 0 then
    raise exception
      '(د-٣) مسبار مصدر find_booking_by_reference معطّل (invalid-input عند % وجدول المحاولات عند %) — لا تصدّق ما بعده',
      v_p_check, v_p_count;
  end if;

  if v_p_check > v_p_count then
    raise exception
      '(د-٣) التحقق الشكلي يقع **بعد** العدّ في المصدر (% مقابل %) — كل خطأ مطبعي يستهلك من رصيد الزائر',
      v_p_check, v_p_count;
  end if;

  raise notice
    '✔ (د) 🔒 الهاتف الخطأ ⇒ صفر صفوف بلا رمي **والمحاولة محسوبة**، وحجز بلا هوية لا يُفتح (حارسُ الطول سلوكاً + المطابقة بـ = مصدراً)، والتحقق الشكلي قبل العدّ سلوكاً ومصدراً';
end;
$$;

-- ----------------------------------------------------------------------------
-- (هـ) 🔒 الخانق — التاسع في الدلو الواحد يُرفض، ومفتاح آخر لا يتأثر
--
-- ⚠ داخل **كتلة تُرجع نفسها**: كتلة plpgsql لها `exception` هي نقطة حفظ ضمنية،
-- فكل ما تكتبه — ومنه تسعة صفوف محاولات — يُمحى عند الخروج بعلامة
-- `ROLLBACK_MARKER`. وتأكيدٌ راسب يرمي رسالته فيمرّ من الحارس ويُسقط الملف.
--
-- والحدّ ٨ في `0027` ثابتٌ في جسم الدالة لا إعداد في اللوحة — فلا يخالف قاعدة
-- «لا تؤكد رقماً يغيّره المالك من الإعدادات». وإن غُيّر في هجرة لاحقة وجب أن
-- يفشل هذا التأكيد ويُحدَّث معها.
--
-- ⚠ `now()` ثابتة داخل المعاملة ⇒ الدلو واحد لكل النداءات، فلا حدود ربع ساعة
-- تنزلق تحت الاختبار.
-- ----------------------------------------------------------------------------
do $$
declare
  v_key    text := 'BOOKING_LOOKUP_FIXTURE-' || gen_random_uuid()::text;
  v_other  text := 'BOOKING_LOOKUP_FIXTURE-' || gen_random_uuid()::text;
  v_i      integer;
  v_n      integer;
  v_raised boolean;
  v_hint   text;
  v_msg    text;
begin
  -- ثمانية نداءات مقبولة (بحثٌ لا يجد شيئاً — الخانق يعدّ النداء لا النتيجة)
  for v_i in 1 .. 8 loop
    v_raised := false;
    begin
      perform * from public.find_booking_by_reference('TR-ZZZZZZ', '01000079888', v_key);
    exception when others then
      v_raised := true;
      v_msg := sqlerrm;
    end;

    if v_raised then
      raise exception
        '(هـ-١) النداء رقم % رُفض («%») والحدّ ٨ لكل ربع ساعة — الخانق يخنق قبل أوانه',
        v_i, v_msg;
    end if;
  end loop;

  select coalesce((select a.attempts from public.booking_lookup_attempts a
                    where a.client_key = v_key), 0)
    into v_n;

  if v_n <> 8 then
    raise exception
      '(هـ-١) بعد ثمانية نداءات صار العدّاد % لا ٨ — العدّ لا يطابق النداءات', v_n;
  end if;

  -- (هـ-٢) 🔒 والتاسع يُرفض بـ rate-limited
  v_raised := false; v_hint := null;
  begin
    perform * from public.find_booking_by_reference('TR-ZZZZZZ', '01000079888', v_key);
  exception when others then
    v_raised := true;
    get stacked diagnostics v_hint = pg_exception_hint;
  end;

  if not v_raised then
    raise exception
      '(هـ-٢) 🔒 النداء التاسع في نفس الدلو مرّ — لا خانق، وفضاء TR-XXXXXX (٢٩٫٧ بت) قابل للمسح';
  end if;

  if v_hint is distinct from 'rate-limited' then
    raise exception
      '(هـ-٢) النداء التاسع رُفض بالرمز «%» لا rate-limited — الاختبار غير حاسم (قد يكون رفضاً لسبب آخر)',
      coalesce(v_hint, 'بلا');
  end if;

  -- (هـ-٣) شاهد إيجابي: مفتاح عميل **آخر** لا يتأثر. بدونه كان (هـ-٢) يمر حتى
  --        لو صار الخانق يرفض الجميع بعد أول امتلاء لأي دلو.
  v_raised := false;
  begin
    perform * from public.find_booking_by_reference('TR-QK7WX2', '01000079801', v_other);
  exception when others then
    v_raised := true;
    v_msg := sqlerrm;
  end;

  if v_raised then
    raise exception
      '(هـ-٣) مفتاح عميل آخر رُفض («%») — الخانق عام لا لكل عميل، فزائرٌ واحد يقفل الخدمة على الجميع',
      v_msg;
  end if;

  select coalesce((select a.attempts from public.booking_lookup_attempts a
                    where a.client_key = v_other), 0)
    into v_n;

  if v_n <> 1 then
    raise exception '(هـ-٣) عدّاد المفتاح الآخر % لا ١ — الدلاء ليست مستقلة', v_n;
  end if;

  raise notice
    '✔ (هـ) 🔒 ثمانية نداءات تمر والتاسع rate-limited في نفس الدلو، ومفتاح عميل آخر لا يتأثر (كل صفوف هذا القسم تُمحى الآن)';

  raise exception 'ROLLBACK_MARKER';
exception when others then
  if sqlerrm <> 'ROLLBACK_MARKER' then raise; end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- (و) 🔒 الصلاحيات — من ينفّذ الدالة ومن يقرأ جدول المحاولات
--
-- الدالة **غير ممنوحة لـ anon ولا لـ authenticated**: `p_client_key` بصمةٌ
-- يحسبها الخادم من الترويسات، فمن نادى الدالة مباشرة عبر PostgREST اختار بصمة
-- جديدة كل طلب ⇒ دلوٌ لكل محاولة عدّاده ١ **ولا يبلغ الحدّ أبداً** ⇒ خانقٌ
-- بالاسم فقط. والمسار الوحيد إجراء الخادم بمفتاح الخدمة.
--
-- وكل متعهد مستخدم `authenticated` (النمط ١ في LESSONS) — فالمنع يشملهما معاً.
-- ----------------------------------------------------------------------------
do $$
declare
  v_n      integer;
  v_ok     boolean;
  v_state  text;
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    raise notice '  ↳ (و) لا دور anon على هذه القاعدة — فحص الزائر متخطّى';
  else
    -- 🔒 شاهد إيجابي أولاً: مسبار صلاحيات الدوال يعمل فعلاً (الزائر ينفّذ
    -- get_booking_by_token يقيناً — وهي بوابة صفحة /booking/[token]).
    if not has_function_privilege('anon', 'public.get_booking_by_token(text)', 'execute') then
      raise exception
        '(و-١) مسبار صلاحيات الدوال معطّل — الزائر يُفترض أن ينفّذ get_booking_by_token — لا تصدّق ما بعده';
    end if;

    if has_function_privilege('anon', 'public.find_booking_by_reference(text, text, text)', 'execute') then
      raise exception
        '(و-١) 🔒 find_booking_by_reference ممنوحة لـ anon — بصمة جديدة كل طلب ⇒ دلوٌ عدّاده ١ ولا يبلغ الحدّ أبداً';
    end if;

    -- ونظيرها في 0026: تطبيع الهاتف يبقى ممنوعاً على الزائر (الدالة تناديه
    -- بهوية مالكها). منحُه يُسقط فحصَ 0026 ويُرسب `phone_tests` كلها.
    if has_function_privilege('anon', 'public.normalize_phone(text)', 'execute') then
      raise exception
        '(و-١) الزائر ينفّذ normalize_phone — نقض 0026 (وفحصها يُسقط الهجرة و phone_tests معاً)';
    end if;
  end if;

  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    if has_function_privilege('authenticated', 'public.find_booking_by_reference(text, text, text)', 'execute') then
      raise exception
        '(و-١) 🔒 find_booking_by_reference ممنوحة لـ authenticated — وكل متعهد مسجَّل واحدٌ منهم، والخانق يُلتفّ عليه ببصمة يختارها المنادي';
    end if;
  end if;

  -- ── جدول المحاولات: لا وصول لأي دور مستخدم، ولا حتى قراءة ────────────────
  -- 🔒 شاهد إيجابي لمسبار الجداول: `trip_settings` ممنوحة لـ authenticated في
  -- 0027 (بسياسة is_admin فوقها) — فلو كان المسبار يرجع false دائماً لانكشف هنا.
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    if not has_table_privilege('authenticated', 'public.trip_settings', 'select') then
      raise exception
        '(و-٢) مسبار صلاحيات الجداول معطّل — authenticated يُفترض أن يملك select على trip_settings — لا تصدّق ما بعده';
    end if;
  end if;

  -- الأدوار تُقرأ من `pg_roles` نفسه لا من قائمة نصية: `has_table_privilege`
  -- ترمي على دور غير موجود، وترتيب تقييم شروط `where` غير مضمون — فالفلترة
  -- بالانضمام لا بشرط جانبي.
  select string_agg(r.rolname || '/' || p.priv, '، ')
    into v_state
  from pg_roles r
  cross join (values ('select'), ('insert'), ('update'), ('delete'), ('truncate')) as p(priv)
  where r.rolname in ('anon', 'authenticated')
    and has_table_privilege(r.oid, 'public.booking_lookup_attempts', p.priv);

  if v_state is not null then
    raise exception
      '(و-٢) 🔒 booking_lookup_attempts ممنوحة لدور مستخدم (%) — الجدول بلا أي منح بحال (‏TRUNCATE لا تخضع لـ RLS أصلاً)',
      v_state;
  end if;

  -- ── الفحص الحيّ: نفس المسار الذي يسلكه PostgREST ─────────────────────────
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    raise notice '  ↳ (و-٣) لا دور anon — الفحص الحي متخطّى';
    return;
  end if;

  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claims', '', false);

  begin
    execute 'set local role anon';

    v_ok := false; v_state := null;
    begin
      execute 'select count(*) from public.find_booking_by_reference(''TR-QK7WX2'', ''01000079801'', ''BOOKING_LOOKUP_FIXTURE-live'')'
        into v_n;
      v_ok := true;
    exception when others then
      get stacked diagnostics v_state = returned_sqlstate;
    end;

    if v_ok then
      raise exception '(و-٣) 🔒 الزائر نفّذ find_booking_by_reference حيّاً';
    end if;
    if v_state is distinct from '42501' then
      raise exception
        '(و-٣) الرفض جاء بالرمز «%» لا 42501 — الاختبار غير حاسم', coalesce(v_state, 'بلا');
    end if;

    v_ok := false; v_state := null;
    begin
      execute 'select count(*) from public.booking_lookup_attempts' into v_n;
      v_ok := true;
    exception when others then
      get stacked diagnostics v_state = returned_sqlstate;
    end;

    if v_ok then
      raise exception '(و-٣) الزائر قرأ booking_lookup_attempts (% صفاً)', v_n;
    end if;
    if v_state is distinct from '42501' then
      raise exception
        '(و-٣) قراءة جدول المحاولات فشلت بالرمز «%» لا 42501 — الاختبار غير حاسم',
        coalesce(v_state, 'بلا');
    end if;

    -- 🔒 الشاهد الإيجابي الحيّ: ما يُفترض أن يعمل للزائر ما زال يعمل. بدونه يمر
    -- القسم كله لو انهار كل شيء للزائر لسبب لا علاقة له بهذه الهجرة.
    execute 'select count(*) from public.get_booking_by_token(' || quote_literal(repeat('0', 48)) || ')'
      into v_n;

    execute 'reset role';
  exception
    when others then
      execute 'reset role';
      raise;
  end;

  raise notice
    '✔ (و) 🔒 الدالة غير ممنوحة لـ anon ولا authenticated (كتالوجاً وحيّاً)، وجدول المحاولات بلا أي منح — والزائر ما زال ينفّذ get_booking_by_token';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ز) التنظيف — الأرض تعود كما وجدناها
-- ----------------------------------------------------------------------------
do $$
begin
  delete from public.notifications n
   where n.payload ->> 'bookingId' in (
     'e3000000-0000-4000-8000-000000000001',
     'e3000000-0000-4000-8000-000000000002',
     'e3000000-0000-4000-8000-000000000003');

  delete from public.bookings b
   where b.id in ('e3000000-0000-4000-8000-000000000001',
                  'e3000000-0000-4000-8000-000000000002',
                  'e3000000-0000-4000-8000-000000000003')
      or b.trip ->> 'notes' = 'BOOKING_LOOKUP_FIXTURE';

  delete from public.booking_lookup_attempts a
   where a.client_key like 'BOOKING_LOOKUP_FIXTURE%';

  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claims', '', false);

  raise notice '✔ (ز) التجهيزات وصفوف المحاولات مُزالة';
end;
$$;

-- ----------------------------------------------------------------------------
-- فحص أخير: لم يبقَ أثر
-- ----------------------------------------------------------------------------
do $$
declare
  v_n integer;
begin
  select count(*)::integer into v_n
  from public.bookings b where b.trip ->> 'notes' = 'BOOKING_LOOKUP_FIXTURE';
  if v_n <> 0 then
    raise exception 'تنظيف ناقص: % حجز تجهيز باقٍ', v_n;
  end if;

  select count(*)::integer into v_n
  from public.booking_lookup_attempts a where a.client_key like 'BOOKING_LOOKUP_FIXTURE%';
  if v_n <> 0 then
    raise exception 'تنظيف ناقص: % صف محاولات باقٍ', v_n;
  end if;

  raise notice 'ALL PASSED — «تابع حجزك»: مرجع + هاتف يُرجعان التوكن وحده في عمود واحد، وكل أشكال الهاتف والمرجع تصل (بما فيها المرجع العشري)، والمحاولة الخاطئة تُرجع صفر صفوف بلا رمي **وتُحسب**، وهاتف بلا أرقام لا يفتح حجزاً بلا هوية، والتحقق الشكلي يسبق العدّ، والتاسع في الدلو يُخنق ومفتاح آخر لا يتأثر، والدالة ممنوعة على الزائر والمسجَّل معاً';
end;
$$;
