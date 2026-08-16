-- ============================================================================
-- phone_tests.sql — اختبارات قبول لتطبيع رقم الهاتف وتوحيد هوية العميل
--                   (هجرة 0026_phone_normalization.sql — المجموعة العاشرة)
--
-- كيف تشغّله: `pnpm db:test phone` أو الصق الملف كاملاً في SQL Editor واضغط Run.
-- النجاح = آخر سطر «ALL PASSED». أي فشل يرمي exception برسالة عربية تحدد
-- الاختبار والقيمة المتوقعة والفعلية.
--
-- ومن psql بدور صاحب القاعدة **لا بد** من ON_ERROR_STOP و‑1 معاً:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f supabase/tests/phone_tests.sql
-- الأول لأن psql بدونه يتابع بعد الكتلة الفاشلة فيطبع «ALL PASSED» رغم الفشل،
-- والثاني لأن الملف يبدّل هوية الدور مؤقتاً ويشغّل نظام الخصومات ثم يعيده.
-- (‏`pnpm db:test` يرسل الملف كاملاً في استعلام واحد ⇒ معاملة ضمنية واحدة.)
--
-- ── حواجز هذا الملف (لا تُغلق المرحلة وأحدها راسب) ──────────────────────────
-- (١) القسم (د): **سقف «مرة لكل عميل» يمسك الشكلين المختلفين لنفس الرقم.**
--     هذا هو أهم تأكيد في الملف. سقوطه يعني أن كل حملة بسقف لكل عميل تُخترق
--     بإضافة «+2» أمام الرقم — أي أن السقف زينة لا حاجز.
-- (٢) القسم (هـ): **حجزان بشكلين مختلفين لنفس الرقم = عميل واحد لا اثنان.**
--     سقوطه يعني أن «العميل العائد» و«نسبة العودة» يقيسان صيغ الكتابة لا الناس.
-- (٣) القسم (ب): **الرقم الأجنبي لا يُفسد.** تطبيعٌ يخمّن على رقم غير مصري
--     يحوّل هاتف سائح إلى رقم لا يردّ عليه أحد، والحجز عندها بلا وسيلة تواصل.
--
-- ── منهج الملف ──────────────────────────────────────────────────────────────
--   • **كل رقم يُقاس بالفرق عن خط أساس لا بقيمة مطلقة**: القاعدة الحيّة فيها
--     بيانات ديمو تحاكي ستة أشهر تشغيل (‏٣٣٥ حجزاً). أي تأكيد يثبّت رقماً
--     مطلقاً كان سيسقط بمجرد نجاح المشروع — وقد وقع ذلك مرتين في هذا المشروع.
--   • إحداثيات **صحراوية نائية** (٢٥٫٠، ٢٧٫٥) ← (٢٤٫٥، ٢٨٫٢): لا قائمة أسعار
--     حقيقية تغطيها، فلا يلتقط التجهيزُ متعهداً حياً.
--   • أرقام هواتف التجهيز من نطاق **`010000799xx`** — لا تطابق أي رقم ديمو ولا
--     حقيقياً، وكلها تُمسح في القسم (ز).
--   • **لكل فحص سالب شاهد إيجابي بجواره**: «العميل الآخر لا يُمنع» بجوار «نفس
--     العميل يُمنع»، و«الزائر ما زال يسعّر» بجوار «الزائر لا ينفّذ الجديد».
--     فحصٌ يمنع كل شيء ينجح دائماً ولا يثبت شيئاً (النمط ٩ في LESSONS).
--   • الصفوف كلها بوسم `PTEST-` / `PHONE_TESTS` وتُمسح في البداية والنهاية معاً.
--
-- المرجع: supabase/migrations/0026_phone_normalization.sql
--         + 0022_analytics.sql (v_stats_customers) + 0024_discounts.sql (السقف)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (٠) الشروط المسبقة + تنظيف بقايا تشغيل سابق
-- ----------------------------------------------------------------------------
do $$
declare
  v_missing text;
  v_classes text[];
begin
  -- الهوية تُفرَّغ أولاً: أي بقية من مطالبة jwt تجعل analytics_admin_allowed
  -- تحسبنا مستخدماً عادياً فترفض section_stats بلا سبب مفهوم.
  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claims', '', false);

  select string_agg(x.sig, '، ')
    into v_missing
  from (values
    ('public.normalize_phone(text)'),
    ('public.apply_discount(text, numeric, text, numeric, text)'),
    ('public.redeem_coupon(text, uuid, numeric, text)'),
    ('public.section_stats(text, date, date)'),
    ('public.analytics_admin_allowed()'),
    ('public.create_booking(jsonb, jsonb, integer, boolean, numeric, numeric, numeric, text, text, text, text, text, text, timestamptz, text, text, timestamptz, integer, jsonb, integer, text)')
  ) as x(sig)
  where to_regprocedure(x.sig) is null;

  if v_missing is not null then
    raise exception 'شرط مسبق: دوال مفقودة (نفّذ 0026_phone_normalization.sql أولاً): %', v_missing;
  end if;

  if to_regclass('public.v_stats_customers') is null then
    raise exception 'شرط مسبق: v_stats_customers مفقود';
  end if;

  if not exists (
    select 1 from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = 'bookings'
      and c.column_name = 'phone_norm'
  ) then
    raise exception 'شرط مسبق: bookings.phone_norm غير موجود — 0026 لم تُنفَّذ';
  end if;

  if not public.analytics_admin_allowed() then
    raise exception
      'شرط مسبق: analytics_admin_allowed ترفض اتصال الاختبار (session_user = %) — لا يمكن قياس قسم العملاء',
      session_user;
  end if;

  -- ── تنظيف بقايا ── سجل الاستخدام أولاً (مفتاحه إلى الكوبون `on delete
  -- restrict`)، ثم الحجوزات، ثم الكوبونات.
  delete from public.coupon_redemptions r where r.code like 'PTEST-%';
  delete from public.coupon_redemptions r
   where r.booking_id in (select b.id from public.bookings b
                           where b.trip ->> 'notes' like 'PHONE_TESTS_FIXTURE%');
  delete from public.bookings b where b.trip ->> 'notes' like 'PHONE_TESTS_FIXTURE%';
  delete from public.coupons c where c.code like 'PTEST-%' or c.note = 'PHONE_TESTS';

  -- الفئة الحيّة المؤهلة لراكب واحد كما يرجعها المحرك نفسه لا تخميناً منّا
  select array_agg(q.class_slug order by q.capacity asc)
    into v_classes
  from public.quote_price(100, 1, false, 0) q;

  if v_classes is null or array_length(v_classes, 1) < 1 then
    raise exception 'شرط مسبق: لا فئة سيارة نشطة لها تعريفة — نفّذ بذرة 0005';
  end if;

  perform set_config('tours.pt_class', v_classes[1], false);
  perform set_config('tours.pt_day', (now() at time zone 'Africa/Cairo')::date::text, false);

  raise notice '✔ (٠) الشروط المسبقة سليمة — فئة الاختبار «%» ويوم القياس %',
    v_classes[1], current_setting('tours.pt_day');
end;
$$;

-- (٠-ب) حفظ إعدادات الخصم الحقيقية ثم تشغيل النظام مؤقتاً
--
-- النظام مطفأ في البذرة (قرار ١٠ في 0024 · D-25 · D-31)، و`apply_discount`
-- ترجع «not-found» وهو مطفأ. فنشغّله للقسم (د) ثم نعيد كل قيمة كما كانت في (ز).
do $$
declare
  v_saved jsonb;
begin
  select to_jsonb(d) into v_saved from public.discount_settings d limit 1;

  if v_saved is null then
    raise exception '(٠-ب) لا صف في discount_settings — بذرة 0024 لم تُنفَّذ';
  end if;

  perform set_config('tours.pt_saved', v_saved::text, false);

  update public.discount_settings set enabled = true where id;

  raise notice '✔ (٠-ب) إعدادات الخصم محفوظة للاستعادة (enabled الأصلية = %)',
    (v_saved ->> 'enabled');
end;
$$;

-- ----------------------------------------------------------------------------
-- (أ) الأشكال المصرية كلها تنتهي إلى شكل معياري واحد
--
-- المُدخلات هي **ما يكتبه العميل فعلاً** في حقل الهاتف: بالصفر، وبمفتاح الدولة،
-- وبالبادئة الدولية `00`، وبمسافات، وبأقواس وشُرَط، وبلا صفر البداية، وبالأرقام
-- العربية الهندية التي تنتجها لوحة المفاتيح العربية.
-- ----------------------------------------------------------------------------
do $$
declare
  v_bad text;
begin
  -- ⚠ `coalesce` داخل التجميع لا خارجه: `string_agg` تتخطى القيم الفارغة، فمُدخل
  -- ينتج null كان سيعطي v_bad = null ⇒ تأكيدٌ يستحيل أن يفشل (النمط ٩).
  select string_agg(t.inp || ' ⇒ ' || coalesce(x.got, 'null'), '  |  ')
    into v_bad
  from (values
    ('01000079901'),
    ('+201000079901'),
    ('00201000079901'),
    ('010 0007 9901'),
    ('(010) 0007-9901'),
    ('1000079901'),
    ('20 100 007 9901'),
    ('٠١٠٠٠٠٧٩٩٠١')
  ) as t(inp)
  cross join lateral (select public.normalize_phone(t.inp) as got) x
  where x.got is distinct from '01000079901';

  if v_bad is not null then
    raise exception
      '(أ-١) أشكال لم تُطبَّع إلى 01000079901: %', v_bad;
  end if;

  -- شاهد إيجابي: الدالة تفرّق فعلاً ولا تُرجع الرقم نفسه لكل مُدخل
  if public.normalize_phone('01000079902') = public.normalize_phone('01000079901') then
    raise exception '(أ-٢) رقمان مختلفان أُعيدا متطابقين — الدالة تطمس الفروق لا توحّد الصيغ';
  end if;

  raise notice '✔ (أ) ثمانية أشكال لرقم واحد ⇒ 01000079901، ورقمان مختلفان يبقيان مختلفين';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ب) الرقم الأجنبي لا يُفسد · التطبيع مستقر · وما لا رقم فيه = null
--
-- 🔒 القاعدة الخامسة في الخوارزمية: ما لا يطابق الشكل المصري تخرج أرقامه كما
-- هي **بلا تخمين**. تخمينٌ هنا يحوّل هاتف سائح إلى رقم لا يردّ عليه أحد.
-- ----------------------------------------------------------------------------
do $$
declare
  v_bad text;
begin
  select string_agg(t.inp || ' ⇒ ' || coalesce(x.got, 'null') || ' (المتوقع ' || t.exp || ')', '  |  ')
    into v_bad
  from (values
    ('+44 20 7946 0958', '442079460958'),   -- بريطاني — و«20» في وسطه لا في أوله
    ('0044 20 7946 0958', '442079460958'),  -- بالبادئة الدولية
    ('+966 50 123 4567',  '966501234567'),  -- سعودي
    ('+1 202 555 0173',   '12025550173'),   -- أمريكي: يبدأ بـ 1 وطوله ١١ لا ١٠ ⇒ لا يُصفَّر
    ('0223456789',        '0223456789'),    -- أرضي مصري: عشر خانات تبدأ بصفر ⇒ كما هو
    ('201000079901234',   '201000079901234')-- يبدأ بـ 20 وطوله ١٥ ⇒ لا يُقصّ
  ) as t(inp, exp)
  cross join lateral (select public.normalize_phone(t.inp) as got) x
  where x.got is distinct from t.exp;

  if v_bad is not null then
    raise exception '(ب-١) أرقام غير مصرية أُفسدت: %', v_bad;
  end if;

  -- التطبيع مستقر: تمريره على ناتجه لا يغيّره (شرط سلامة عمود مولَّد وفهرس)
  select string_agg(t.inp, '، ')
    into v_bad
  from (values
    ('01000079901'), ('+201000079901'), ('+44 20 7946 0958'), ('0223456789')
  ) as t(inp)
  where public.normalize_phone(public.normalize_phone(t.inp))
        is distinct from public.normalize_phone(t.inp);

  if v_bad is not null then
    raise exception '(ب-٢) التطبيع غير مستقر على: % — تمريره مرتين يعطي نتيجتين', v_bad;
  end if;

  -- ما لا خانة رقمية فيه ⇒ null، لا نصٌّ فارغ يتجمّع فيه كل مجهول
  if public.normalize_phone(null)      is not null then raise exception '(ب-٣) null ⇒ ليس null'; end if;
  if public.normalize_phone('')        is not null then raise exception '(ب-٣) نص فارغ ⇒ ليس null'; end if;
  if public.normalize_phone('   ')     is not null then raise exception '(ب-٣) مسافات ⇒ ليس null'; end if;
  if public.normalize_phone('بلا رقم') is not null then raise exception '(ب-٣) نص بلا أرقام ⇒ ليس null'; end if;

  raise notice '✔ (ب) الأجنبي يخرج بأرقامه بلا تخمين، والتطبيع مستقر، وما لا رقم فيه null';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ج) العمود المولَّد: يُملأ عند الإنشاء **ويتحدّث مع التعديل**
--
-- التحديث هو نصف الاختبار وليس زينة: عمودٌ يُملأ مرة ثم يتجمّد يجعل تصحيح رقم
-- من اللوحة يترك الهوية على الرقم الخطأ إلى الأبد.
-- ----------------------------------------------------------------------------
do $$
declare
  v_cls  text := current_setting('tours.pt_class');
  v_b    record;
  v_row  record;
begin
  select * into v_b
  from public.create_booking(
    jsonb_build_object('label', 'موقع صحراوي أ', 'lat', 25.000000, 'lng', 27.500000),
    jsonb_build_object('label', 'موقع صحراوي ب', 'lat', 24.500000, 'lng', 28.200000),
    1, false, 0, 100, 90, 'test',
    v_cls, 'full',
    'عميل اختبار التطبيع', '+20 100 007 9911', null, now() + interval '3 days',
    'PHONE_TESTS_FIXTURE-C'
  );

  select b.* into v_row from public.bookings b where b.id = v_b.id;

  -- (ج-١) الخام كما كتبه العميل حرفاً بحرف — لا نعيد كتابة مُدخل المستخدم
  if v_row.customer_phone is distinct from '+20 100 007 9911' then
    raise exception '(ج-١) الهاتف الخام صار «%» — التطبيع أعاد كتابة مُدخل العميل',
      v_row.customer_phone;
  end if;

  -- (ج-٢) والمشتق مطبَّع
  if v_row.phone_norm is distinct from '01000079911' then
    raise exception '(ج-٢) phone_norm = «%» والمتوقع 01000079911',
      coalesce(v_row.phone_norm, 'null');
  end if;

  -- (ج-٣) 🔒 يتحدّث مع التعديل
  update public.bookings set customer_phone = '00201000079912' where id = v_b.id;

  select b.* into v_row from public.bookings b where b.id = v_b.id;
  if v_row.phone_norm is distinct from '01000079912' then
    raise exception
      '(ج-٣) بعد تعديل الهاتف بقي phone_norm = «%» — العمود لا يتحدّث، فالهوية تتجمّد على الرقم القديم',
      coalesce(v_row.phone_norm, 'null');
  end if;

  -- (ج-٤) ولا صفّ في القاعدة كلها يخالف ناتج الدالة (يمسك ردماً ناقصاً في
  --       المسار الاحتياطي، أو جسم دالة تغيّر بلا إعادة بناء العمود)
  if exists (
    select 1 from public.bookings b
    where b.phone_norm is distinct from public.normalize_phone(b.customer_phone)
  ) then
    raise exception '(ج-٤) صفوف في bookings قيمتها المخزَّنة تخالف normalize_phone — العمود منحرف';
  end if;

  raise notice '✔ (ج) الخام محفوظ، والمشتق مطبَّع، ويتحدّث مع التعديل، ولا انحراف في أي صف';
end;
$$;

-- ----------------------------------------------------------------------------
-- (د) 🔒 **أهم تأكيد في الملف** — سقف الكوبون لكل عميل يمسك الشكلين
--
-- قبل 0026 كانت المطابقة على `btrim(phone)` حرفياً، فـ «01000079921» و
-- «+20 100 007 9921» عميلان عند القاعدة: كوبون «مرة واحدة لكل عميل» يُستخدم
-- مرتين من نفس الهاتف — بل بلا حد، فصيغ الكتابة لا تنفد.
--
-- ويُفحص الموضعان معاً: `redeem_coupon` (الفحص الملزم داخل معاملة الحجز) و
-- `apply_discount` (الفحص المتقدّم في شاشة التحقق). تطبيعُ أحدهما دون الآخر
-- ينتج «تحقق ناجح ثم حجز يفشل» — وهو أسوأ من الاثنين معاً.
-- ----------------------------------------------------------------------------
do $$
declare
  v_cls    text := current_setting('tours.pt_class');
  v_b1     uuid;
  v_b2     uuid;
  v_b3     uuid;
  v_b      record;
  v_ok     boolean;
  v_hint   text;
  v_rej    text;
  v_used   integer;
begin
  insert into public.coupons
    (code, kind, value, enabled, max_uses, max_uses_per_phone, note)
  values
    ('PTEST-CAP', 'percent', 10, true, null, 1, 'PHONE_TESTS');

  -- ثلاثة حجوزات: الأول والثاني **نفس الرقم بشكلين**، والثالث رقم آخر
  select * into v_b from public.create_booking(
    jsonb_build_object('label', 'موقع صحراوي أ', 'lat', 25.000000, 'lng', 27.500000),
    jsonb_build_object('label', 'موقع صحراوي ب', 'lat', 24.500000, 'lng', 28.200000),
    1, false, 0, 100, 90, 'test', v_cls, 'full',
    'عميل السقف أ', '01000079921', null, now() + interval '3 days',
    'PHONE_TESTS_FIXTURE-D1');
  v_b1 := v_b.id;

  select * into v_b from public.create_booking(
    jsonb_build_object('label', 'موقع صحراوي أ', 'lat', 25.000000, 'lng', 27.500000),
    jsonb_build_object('label', 'موقع صحراوي ب', 'lat', 24.500000, 'lng', 28.200000),
    1, false, 0, 100, 90, 'test', v_cls, 'full',
    'عميل السقف أ نفسه', '+20 100 007 9921', null, now() + interval '3 days',
    'PHONE_TESTS_FIXTURE-D2');
  v_b2 := v_b.id;

  select * into v_b from public.create_booking(
    jsonb_build_object('label', 'موقع صحراوي أ', 'lat', 25.000000, 'lng', 27.500000),
    jsonb_build_object('label', 'موقع صحراوي ب', 'lat', 24.500000, 'lng', 28.200000),
    1, false, 0, 100, 90, 'test', v_cls, 'full',
    'عميل آخر', '01000079931', null, now() + interval '3 days',
    'PHONE_TESTS_FIXTURE-D3');
  v_b3 := v_b.id;

  -- شاهد إيجابي أولاً: التجهيز صحيح والحجزان يحملان الهوية نفسها فعلاً
  if (select b.phone_norm from public.bookings b where b.id = v_b1)
     is distinct from (select b.phone_norm from public.bookings b where b.id = v_b2) then
    raise exception '(د-٠) الحجزان لا يحملان الهوية نفسها — التجهيز نفسه خطأ';
  end if;

  -- (د-١) أول استخدام يمر
  perform public.redeem_coupon('PTEST-CAP', v_b1, 10, '01000079921');

  select count(*)::integer into v_used
  from public.coupon_redemptions r where r.booking_id = v_b1;
  if v_used <> 1 then
    raise exception '(د-١) الاستخدام الأول لم يُسجَّل (% صف)', v_used;
  end if;

  -- (د-٢) 🔒 والثاني **بشكل آخر لنفس الرقم** يُرفض — وبالسبب الصحيح
  v_ok := false; v_hint := null;
  begin
    perform public.redeem_coupon('PTEST-CAP', v_b2, 10, '+20 100 007 9921');
    v_ok := true;
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
  end;

  if v_ok then
    raise exception
      '(د-٢) 🔒 «+20 100 007 9921» استُخدم بعد «01000079921» — سقف «مرة لكل عميل» مخترق بإضافة مفتاح الدولة';
  end if;
  if v_hint is distinct from 'coupon-per-customer' then
    raise exception
      '(د-٢) الرفض جاء بالسبب «%» لا coupon-per-customer — الاختبار غير حاسم (قد يكون رفضاً لسبب آخر)',
      coalesce(v_hint, 'بلا');
  end if;

  -- (د-٣) شاهد إيجابي: عميل **آخر** لا يُمنع. بدونه كان (د-٢) يمر حتى لو صار
  --       السقف يرفض الجميع.
  perform public.redeem_coupon('PTEST-CAP', v_b3, 10, '01000079931');

  select count(*)::integer into v_used
  from public.coupon_redemptions r where r.booking_id = v_b3;
  if v_used <> 1 then
    raise exception '(د-٣) عميل آخر مُنع من الاستخدام — السقف صار يرفض الجميع';
  end if;

  -- (د-٤) نفس الحكم في الفحص المتقدّم `apply_discount`
  select a.rejection into v_rej
  from public.apply_discount('PTEST-CAP', 1000, v_cls, 0, '+20 100 007 9921') a;

  if v_rej is distinct from 'per-customer-limit' then
    raise exception
      '(د-٤) apply_discount ردّت «%» على شكل آخر لرقم بلغ سقفه — المتوقع per-customer-limit',
      coalesce(v_rej, 'بلا رفض (أي أن الخصم يُعرض ثم يفشل الحجز)');
  end if;

  -- (د-٥) شاهد إيجابي مقابل: رقم لم يستخدم الكوبون لا يُرفض بهذا السبب
  select a.rejection into v_rej
  from public.apply_discount('PTEST-CAP', 1000, v_cls, 0, '01000079941') a;

  if v_rej = 'per-customer-limit' then
    raise exception
      '(د-٥) رقم لم يستخدم الكوبون رُفض بـ per-customer-limit — المطابقة تجمع أرقاماً مختلفة';
  end if;

  raise notice
    '✔ (د) 🔒 السقف لكل عميل يمسك «01000079921» و«+20 100 007 9921» بوصفهما عميلاً واحداً — في redeem_coupon و apply_discount معاً';
end;
$$;

-- ----------------------------------------------------------------------------
-- (هـ) الإحصائيات: حجزان بشكلين مختلفين = **عميل واحد**
--
-- خط الأساس يُقرأ **قبل** الزرع مباشرة، والتأكيد على **الفرق** لا على قيمة
-- مطلقة — فالقاعدة فيها ستة أشهر بيانات ديمو.
-- ----------------------------------------------------------------------------
do $$
declare
  v_cls   text := current_setting('tours.pt_class');
  v_day   date := current_setting('tours.pt_day')::date;
  v_b     record;
  v_c0    numeric; v_c1 numeric;
  v_n0    numeric; v_n1 numeric;
  v_o0    numeric; v_o1 numeric;
  v_vc0   integer; v_vc1 integer;
  v_vo0   integer; v_vo1 integer;
  v_vr0   integer; v_vr1 integer;
begin
  -- التجهيز يملك بياناته: هوية لم تحجز قبل اليوم إطلاقاً. بلا هذا الحارس كان
  -- رسوبُ (هـ-٣) سيبدو عطلاً في التطبيع وهو في الحقيقة تصادمُ رقمٍ مع بيانات
  -- قائمة — رسالة مفهومة خيرٌ من ساعة تشخيص.
  if exists (select 1 from public.bookings b where b.phone_norm = '01000079951') then
    raise exception
      '(هـ-٠) الهوية 01000079951 موجودة في القاعدة سلفاً — غيّر رقم التجهيز، فقياس «عميل جديد» لن يصح';
  end if;

  -- خط الأساس من الدالة
  select coalesce(max(s.value) filter (where s.key = 'customers_count'), 0),
         coalesce(max(s.value) filter (where s.key = 'new_customers'), 0),
         coalesce(max(s.value) filter (where s.key = 'orders_count'), 0)
    into v_c0, v_n0, v_o0
  from public.section_stats('customers', v_day, v_day) s;

  -- وخط الأساس من العرض نفسه
  select coalesce(sum(v.customers_count), 0), coalesce(sum(v.orders_count), 0),
         coalesce(sum(v.returning_orders), 0)
    into v_vc0, v_vo0, v_vr0
  from public.v_stats_customers v where v.day = v_day;

  -- حجزان لنفس الرقم بشكلين مختلفين — ورقمٌ لم يحجز قبل اليوم إطلاقاً
  select * into v_b from public.create_booking(
    jsonb_build_object('label', 'موقع صحراوي أ', 'lat', 25.000000, 'lng', 27.500000),
    jsonb_build_object('label', 'موقع صحراوي ب', 'lat', 24.500000, 'lng', 28.200000),
    1, false, 0, 100, 90, 'test', v_cls, 'full',
    'عميل الإحصاء', '01000079951', null, now() + interval '3 days',
    'PHONE_TESTS_FIXTURE-E1');

  select * into v_b from public.create_booking(
    jsonb_build_object('label', 'موقع صحراوي أ', 'lat', 25.000000, 'lng', 27.500000),
    jsonb_build_object('label', 'موقع صحراوي ب', 'lat', 24.500000, 'lng', 28.200000),
    1, false, 0, 100, 90, 'test', v_cls, 'full',
    'عميل الإحصاء نفسه', '0020 100 007 9951', null, now() + interval '3 days',
    'PHONE_TESTS_FIXTURE-E2');

  select coalesce(max(s.value) filter (where s.key = 'customers_count'), 0),
         coalesce(max(s.value) filter (where s.key = 'new_customers'), 0),
         coalesce(max(s.value) filter (where s.key = 'orders_count'), 0)
    into v_c1, v_n1, v_o1
  from public.section_stats('customers', v_day, v_day) s;

  -- (هـ-١) طلبان اثنان — شاهد إيجابي على أن الحجزين وصلا القياس أصلاً
  if (v_o1 - v_o0) <> 2 then
    raise exception '(هـ-١) طلبات الفترة زادت % لا ٢ — الحجزان لم يصلا القياس', (v_o1 - v_o0);
  end if;

  -- (هـ-٢) 🔒 وعميل **واحد** لا اثنان
  if (v_c1 - v_c0) <> 1 then
    raise exception
      '(هـ-٢) 🔒 عملاء الفترة زادوا % لا ١ — «01000079951» و«0020 100 007 9951» ما زالا عميلين مختلفين',
      (v_c1 - v_c0);
  end if;

  -- (هـ-٣) وعميل جديد **واحد**
  if (v_n1 - v_n0) <> 1 then
    raise exception '(هـ-٣) العملاء الجدد زادوا % لا ١', (v_n1 - v_n0);
  end if;

  -- (هـ-٤) والعرض نفسه يقول القول ذاته: طلبان، عميل واحد، وطلب عائد واحد
  select coalesce(sum(v.customers_count), 0), coalesce(sum(v.orders_count), 0),
         coalesce(sum(v.returning_orders), 0)
    into v_vc1, v_vo1, v_vr1
  from public.v_stats_customers v where v.day = v_day;

  if (v_vo1 - v_vo0) <> 2 then
    raise exception '(هـ-٤) v_stats_customers: الطلبات زادت % لا ٢', (v_vo1 - v_vo0);
  end if;
  if (v_vc1 - v_vc0) <> 1 then
    raise exception
      '(هـ-٤) 🔒 v_stats_customers: العملاء زادوا % لا ١ — العرض ما زال يطابق بالنص الخام',
      (v_vc1 - v_vc0);
  end if;
  if (v_vr1 - v_vr0) <> 1 then
    raise exception
      '(هـ-٤) v_stats_customers: الطلبات العائدة زادت % لا ١ — الحجز الثاني لم يُحسب عودةً لنفس العميل',
      (v_vr1 - v_vr0);
  end if;

  raise notice
    '✔ (هـ) حجزان بشكلين مختلفين ⇒ طلبان وعميل واحد وطلب عائد واحد — في section_stats و v_stats_customers معاً';
end;
$$;

-- ----------------------------------------------------------------------------
-- (و) 🔒 الزائر لا ينفّذ شيئاً جديداً
--
-- 0026 أضافت دالة ولمست عرضاً؛ والسؤال الدائم في هذا المستودع: ماذا يرى
-- **زائر** وماذا يرى **متعهد مسجَّل دخول**؟ الفحص الكتالوجي يثبت المنح،
-- والفحص الحيّ يثبت السلوك بنفس المسار الذي يسلكه PostgREST.
-- ----------------------------------------------------------------------------
do $$
declare
  v_n     integer;
  v_ok    boolean;
  v_state text;
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    if has_function_privilege('anon', 'public.normalize_phone(text)', 'execute') then
      raise exception '(و-١) الزائر ينفّذ normalize_phone — منحٌ بلا مستهلك واحد';
    end if;
    if has_table_privilege('anon', 'public.v_stats_customers', 'select') then
      raise exception '(و-١) الزائر يقرأ v_stats_customers';
    end if;
    -- والعمود الجديد لا يفتح باباً على bookings: الزائر بلا أي صلاحية عليها
    if has_table_privilege('anon', 'public.bookings', 'select')
       or has_table_privilege('anon', 'public.bookings', 'update')
       or has_table_privilege('anon', 'public.bookings', 'insert') then
      raise exception '(و-١) الزائر اكتسب صلاحية على bookings — نقض 0007';
    end if;
  end if;

  -- والمسجَّل (وكل متعهد مسجَّل) لا ينفّذ دالتَي الخصم — 0026 لم تضعّف 0024
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    if has_function_privilege('authenticated', 'public.apply_discount(text, numeric, text, numeric, text)', 'execute')
       or has_function_privilege('authenticated', 'public.redeem_coupon(text, uuid, numeric, text)', 'execute') then
      raise exception '(و-١) المسجَّل ينفّذ دالة خصم — أُضعف قرار 0024';
    end if;
    -- normalize_phone **ممنوحة** له عمداً: تعديل أي حجز من اللوحة يعيد حساب
    -- العمود المولَّد بصلاحيات جلسة المستخدم، فبلا المنح تنكسر شاشة الطلبات.
    if not has_function_privilege('authenticated', 'public.normalize_phone(text)', 'execute') then
      raise exception
        '(و-١) المسجَّل لا ينفّذ normalize_phone — كل تعديل إداري على حجز سيفشل بـ permission denied';
    end if;
  end if;

  if not exists (select 1 from pg_roles where rolname = 'anon') then
    raise notice '  ↳ (و-٢) لا دور anon — الفحص الحي متخطّى';
    return;
  end if;

  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claims', '', false);

  begin
    execute 'set local role anon';

    v_ok := false; v_state := null;
    begin
      execute 'select public.normalize_phone(''01000079901'')' into v_state;
      v_ok := true;
    exception when others then
      get stacked diagnostics v_state = returned_sqlstate;
    end;
    if v_ok then
      raise exception '(و-٢) الزائر نفّذ normalize_phone حيّاً';
    end if;
    if v_state is distinct from '42501' then
      raise exception '(و-٢) الرفض جاء بالرمز «%» لا 42501 — الاختبار غير حاسم',
        coalesce(v_state, 'بلا');
    end if;

    v_ok := false; v_state := null;
    begin
      execute 'select count(*) from public.v_stats_customers' into v_n;
      v_ok := true;
    exception when others then
      get stacked diagnostics v_state = returned_sqlstate;
    end;
    if v_ok then
      raise exception '(و-٢) الزائر قرأ v_stats_customers';
    end if;
    if v_state is distinct from '42501' then
      raise exception '(و-٢) قراءة العرض فشلت بالرمز «%» لا 42501 — الاختبار غير حاسم',
        coalesce(v_state, 'بلا');
    end if;

    -- 🔒 شاهد إيجابي: ما كان يعمل للزائر ما زال يعمل. بدونه يمر القسم كله لو
    -- انهار كل شيء للزائر لسبب لا علاقة له بهذه الهجرة.
    execute 'select count(*) from public.quote_public(100, 1, false, 0, 25.0, 27.5, 24.5, 28.2, null)' into v_n;
    if v_n < 1 then
      raise exception '(و-٣) الزائر لم يعد يسعّر — كسرٌ عام لا علاقة له بالتطبيع';
    end if;

    execute 'reset role';
  exception
    when others then
      execute 'reset role';
      raise;
  end;

  raise notice '✔ (و) الزائر لا ينفّذ normalize_phone ولا يقرأ العرض، وما زال يسعّر — والمسجَّل ينفّذها ولا يلمس دوال الخصم';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ز) الاستعادة والتنظيف — إعدادات الخصم تعود كما كانت بالضبط
--
-- النظام مطفأ في البذرة (قرار ١٠ في 0024)، وهذا الملف شغّله مؤقتاً. تركُه
-- مفعَّلاً بعد تشغيل اختبارات يعني حملة بدأت بلا قرار بشري.
-- ----------------------------------------------------------------------------
do $$
declare
  v_saved jsonb := current_setting('tours.pt_saved')::jsonb;
begin
  delete from public.coupon_redemptions r where r.code like 'PTEST-%';
  delete from public.coupon_redemptions r
   where r.booking_id in (select b.id from public.bookings b
                           where b.trip ->> 'notes' like 'PHONE_TESTS_FIXTURE%');
  delete from public.bookings b where b.trip ->> 'notes' like 'PHONE_TESTS_FIXTURE%';
  delete from public.coupons c where c.code like 'PTEST-%' or c.note = 'PHONE_TESTS';

  update public.discount_settings
     set enabled                           = (v_saved ->> 'enabled')::boolean,
         max_percent                       = (v_saved ->> 'max_percent')::numeric,
         min_margin_percent_after_discount = (v_saved ->> 'min_margin_percent_after_discount')::numeric,
         min_margin_amount_after_discount  = (v_saved ->> 'min_margin_amount_after_discount')::numeric,
         verify_rate_limit_per_minute      = (v_saved ->> 'verify_rate_limit_per_minute')::integer
   where id;

  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claims', '', false);

  raise notice '✔ (ز) التجهيزات مُزالة وإعدادات الخصم مُستعادة (enabled = %)',
    (v_saved ->> 'enabled');
end;
$$;

-- ----------------------------------------------------------------------------
-- فحص أخير: لم يبقَ أثر
-- ----------------------------------------------------------------------------
do $$
declare
  v_n integer;
begin
  select count(*)::integer into v_n from public.coupons c where c.code like 'PTEST-%';
  if v_n <> 0 then
    raise exception 'تنظيف ناقص: % كوبون اختباري باقٍ', v_n;
  end if;

  select count(*)::integer into v_n
  from public.bookings b where b.trip ->> 'notes' like 'PHONE_TESTS_FIXTURE%';
  if v_n <> 0 then
    raise exception 'تنظيف ناقص: % حجز اختباري باقٍ', v_n;
  end if;

  if (select d.enabled from public.discount_settings d limit 1)
     is distinct from (current_setting('tours.pt_saved')::jsonb ->> 'enabled')::boolean then
    raise exception 'استعادة ناقصة: إعداد enabled للخصومات لم يعد كما كان';
  end if;

  raise notice 'ALL PASSED — التطبيع يوحّد الأشكال المصرية ولا يفسد الأجنبي، والعمود المولَّد يتحدّث، وسقف الكوبون لكل عميل يمسك الشكلين، والإحصاء يعدّ الناس لا الصيغ، والزائر لا ينفّذ شيئاً جديداً';
end;
$$;
