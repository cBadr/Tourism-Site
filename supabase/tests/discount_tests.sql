-- ============================================================================
-- discount_tests.sql — اختبارات قبول لنظام الخصومات والتحفيز
--                      (المرحلة ١٢أ: هجرة 0024_discounts.sql)
--
-- كيف تشغّله: `pnpm db:test discount` أو الصق الملف كاملاً في SQL Editor واضغط Run.
-- النجاح = آخر سطر «ALL PASSED». أي فشل يرمي exception برسالة عربية تحدد
-- الاختبار والقيمة المتوقعة والفعلية.
--
-- ومن psql بدور صاحب القاعدة **لا بد** من ON_ERROR_STOP و‑1 معاً:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f supabase/tests/discount_tests.sql
-- الأول لأن psql بدونه يتابع بعد الكتلة الفاشلة فيطبع «ALL PASSED» رغم الفشل،
-- والثاني لأن الملف يبدّل هوية الدور مؤقتاً ويعدّل إعدادات الخصم ثم يعيدها.
--
-- ── حواجز هذا الملف (لا تُغلق المرحلة وأحدها راسب) ──────────────────────────
-- (١) القسم (د) و(هـ): **الخصم لا يُنزل الهامش تحت أرضيته ولا الإجمالي تحت
--     `min_price` للفئة — والحاجز في القاعدة لا في الشاشة.** هذا هو القرار
--     المحوري للمرحلة (§٤ في الموجز)؛ سقوطه يعني أن كوبوناً واحداً يُبطل صمام
--     الأمان الذي تسمّيه الخارطة بهذا الاسم، ويجعل الإسناد الآلي بخسارة ممكناً.
-- (٢) القسم (ح): **حجزان متزامنان على آخر استخدام متاح ⇒ واحد يفوز.**
--     `used_count` بلا ذرّية يعني كوبوناً بسقف ١٠٠ يُستخدم ١٠٣ مرات.
-- (٣) القسم (ط): **الزائر لا يقرأ الكوبونات ولا سجل الاستخدام ولا ينفّذ
--     redeem_coupon.** سجل الاستخدام فيه أرقام هواتف العملاء، والكوبونات فيها
--     كل رمز صالح في المنصة — فتحُ أيٍّ منهما تسليمٌ مباشر.
--
-- ── لماذا لا يلمس هذا الملف بيانات حقيقية ────────────────────────────────────
--   • إحداثيات **صحراوية نائية** (٢٥٫٠، ٢٧٫٥) ← (٢٤٫٥، ٢٨٫٢) — لا قائمة أسعار
--     حقيقية تغطيها، فالتسعير بالتعريفة حتماً ولا يتأثر بأي متعهد في القاعدة.
--   • فئتا سيارة اختباريتان **غير مفعّلتين** (`active = false`) فلا تظهران في
--     أي تسعير حيّ، ومع ذلك تُقرأ `min_price` منهما (وهو ما تفعله apply_discount
--     بالضبط) — فنختبر حاجز الأرضية بلا أن نمسّ تعريفة حقيقية.
--   • **كل رقم يُقاس بالفرق عن خط أساس لا بقيمة مطلقة**: القاعدة الحيّة فيها
--     بيانات ديمو تحاكي ستة أشهر تشغيل (٣٣٠ حجزاً). أي تأكيد يثبّت رقماً مطلقاً
--     كان سيسقط بمجرد نجاح المشروع — وقد وقع ذلك مرتين في هذا المشروع.
--   • التوقعات تُشتق من **نفس** الإعدادات التي يقرأها الكود المُختبَر (أرضية
--     البث تُقرأ من `dispatch_config()` لا تُخمَّن)، فتغيير المالك لأي معيار من
--     اللوحة لا يُسقط الاختبار.
--   • الصفوف كلها بوسم `DTEST-` / `DISCOUNT_TESTS` وتُمسح في البداية والنهاية
--     معاً، فحتى انهيار تشغيل سابق يبدأ التالي من أرض نظيفة.
--   • **إعدادات الخصم تُحفظ ثم تُستعاد**: النظام مطفأ في البذرة (قرار ١٠)،
--     وهذا الملف يشغّله مؤقتاً ثم يعيد كل قيمة كما كانت.
--
-- المرجع: lib/discount-types.ts (العقد) + supabase/migrations/0024_discounts.sql
--         + docs/phase-briefs/PHASE-12A.md
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (٠) الشروط المسبقة + تنظيف بقايا تشغيل سابق
-- ----------------------------------------------------------------------------
do $$
declare
  v_missing text;
  v_classes text[];
  v_cls_a   constant uuid := 'c0000000-0000-4000-8000-00000000000a';
  v_cls_b   constant uuid := 'c0000000-0000-4000-8000-00000000000b';
begin
  -- الهوية تُفرَّغ أولاً: أي بقية من مطالبة jwt تجعل analytics_admin_allowed
  -- تحسبنا مستخدماً عادياً فترفض section_stats بلا سبب مفهوم.
  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claims', '', false);

  select string_agg(x.rel, '، ')
    into v_missing
  from (values
    ('public.coupons'), ('public.coupon_redemptions'), ('public.promo_banners'),
    ('public.discount_settings'), ('public.v_stats_discounts'),
    ('public.bookings'), ('public.vehicle_classes'), ('public.tariffs')
  ) as x(rel)
  where to_regclass(x.rel) is null;

  if v_missing is not null then
    raise exception 'شرط مسبق: كائنات مفقودة (نفّذ 0024_discounts.sql أولاً): %', v_missing;
  end if;

  select string_agg(x.sig, '، ')
    into v_missing
  from (values
    ('public.apply_discount(text, numeric, text, numeric, text)'),
    ('public.redeem_coupon(text, uuid, numeric, text)'),
    ('public.discount_config()'),
    ('public.discount_enabled()'),
    ('public.discount_normalize_code(text)'),
    ('public.discount_implied_cost(numeric, numeric)'),
    ('public.dispatch_config()'),
    ('public.analytics_admin_allowed()'),
    ('public.section_stats(text, date, date)'),
    -- التوقيعان الموسَّعان: غيابهما يعني قاعدة توقّفت قبل 0024
    ('public.quote_public(numeric, integer, boolean, numeric, numeric, numeric, numeric, numeric, text, integer, jsonb)'),
    ('public.create_booking(jsonb, jsonb, integer, boolean, numeric, numeric, numeric, text, text, text, text, text, text, timestamptz, text, text, timestamptz, integer, jsonb)')
  ) as x(sig)
  where to_regprocedure(x.sig) is null;

  if v_missing is not null then
    raise exception 'شرط مسبق: دوال مفقودة: %', v_missing;
  end if;

  -- 🔒 التوقيعان القديمان **يجب** أن يكونا قد أُسقطا، وإلا صار كل نداء بالعدد
  -- القديم من المعاملات ملتبساً بين توقيعين فيفشل بـ «function is not unique».
  if to_regprocedure('public.quote_public(numeric, integer, boolean, numeric, numeric, numeric, numeric, numeric)') is not null then
    raise exception 'شرط مسبق: التوقيع الثماني لـ quote_public ما زال موجوداً — النداء بثمانية معاملات سيفشل بـ «function is not unique»';
  end if;

  if to_regprocedure('public.create_booking(jsonb, jsonb, integer, boolean, numeric, numeric, numeric, text, text, text, text, text, text, timestamptz, text)') is not null then
    raise exception 'شرط مسبق: التوقيع الخماسي عشر لـ create_booking ما زال موجوداً — «function is not unique»';
  end if;

  if not public.analytics_admin_allowed() then
    raise exception
      'شرط مسبق: analytics_admin_allowed ترفض اتصال الاختبار (session_user = %) — لا يمكن قياس القسم الإحصائي',
      session_user;
  end if;

  -- ── تنظيف بقايا ──
  -- سجل الاستخدام أولاً (مفتاحه إلى الكوبون `on delete restrict`)، ثم الحجوزات،
  -- ثم الكوبونات، ثم التعريفات ففئات السيارات.
  delete from public.coupon_redemptions r where r.code like 'DTEST-%';
  delete from public.coupon_redemptions r
   where r.booking_id in (select b.id from public.bookings b
                           where b.trip ->> 'notes' like 'DISCOUNT_TESTS_FIXTURE%');
  delete from public.bookings b where b.trip ->> 'notes' like 'DISCOUNT_TESTS_FIXTURE%';
  -- بالوسم أيضاً لا بالرمز وحده: لو انهار تشغيل قبل تطبيع الرمز بقي صفٌّ لا
  -- يطابق «DTEST-%» فيخلد في القاعدة
  delete from public.coupons c where c.code like 'DTEST-%' or c.note = 'DISCOUNT_TESTS';
  delete from public.promo_banners p where p.title like 'DISCOUNT_TESTS%';
  delete from public.tariffs t
   where t.class_id in (select vc.id from public.vehicle_classes vc where vc.slug like 'dtest-%');
  delete from public.vehicle_classes vc where vc.slug like 'dtest-%';

  -- ── فئتان اختباريتان **غير مفعّلتين**: لا تظهران في أي تسعير حيّ، و`min_price`
  --    فيهما هو ما يقرأه حاجز الأرضية داخل apply_discount.
  insert into public.vehicle_classes (id, slug, title, capacity, active, sort)
  values
    (v_cls_a, 'dtest-floor',    'DISCOUNT_TESTS فئة أرضية الهامش', 99, false, 990),
    (v_cls_b, 'dtest-minprice', 'DISCOUNT_TESTS فئة أرضية السعر',  99, false, 991);

  insert into public.tariffs (class_id, per_km, base_fee, min_price, waiting_hour_price, round_trip_factor)
  values
    (v_cls_a, 1, 0,   0, 0, 1.8),   -- بلا أرضية سعر ⇒ الحاجز الملزم هو الهامش
    (v_cls_b, 1, 0, 900, 0, 1.8);   -- أرضية سعر عالية ⇒ الحاجز الملزم هو min_price

  -- الفئة الحيّة المؤهلة لراكب واحد كما يرجعها المحرك نفسه لا تخميناً منّا
  select array_agg(q.class_slug order by q.capacity asc)
    into v_classes
  from public.quote_price(100, 1, false, 0) q;

  if v_classes is null or array_length(v_classes, 1) < 1 then
    raise exception 'شرط مسبق: لا فئة سيارة نشطة لها تعريفة — نفّذ بذرة 0005';
  end if;

  perform set_config('tours.dt_class', v_classes[1], false);
  perform set_config('tours.dt_day', (now() at time zone 'Africa/Cairo')::date::text, false);

  raise notice '✔ (٠) الشروط المسبقة سليمة — فئة الاختبار الحيّة «%» ويوم القياس %',
    v_classes[1], current_setting('tours.dt_day');
end;
$$;

-- ----------------------------------------------------------------------------
-- (٠-ب) حفظ إعدادات الخصم الحقيقية + قراءة أرضية البث
--
-- النظام مطفأ في البذرة (قرار ١٠ · D-25 · D-31)، فلا بد من تشغيله لاختباره ثم
-- إعادته كما كان بالضبط في القسم (م). وأرضية البث تُقرأ من `dispatch_config()`
-- **ولا تُخمَّن ولا تُعدَّل**: هي إعداد وحدة أخرى، وتدخل في حساب أرضية الخصم،
-- فاشتقاق التوقعات منها هو ما يُبقي هذا الملف صحيحاً مهما عايرها المالك.
-- ----------------------------------------------------------------------------
do $$
declare
  v_saved jsonb;
  v_disp  numeric;
begin
  select to_jsonb(d) into v_saved from public.discount_settings d limit 1;

  if v_saved is null then
    raise exception '(٠-ب) لا صف في discount_settings — بذرة 0024 لم تُنفَّذ';
  end if;

  perform set_config('tours.dt_saved', v_saved::text, false);

  select c.min_margin_amount into v_disp from public.dispatch_config() c;
  perform set_config('tours.dt_dispatch_floor', coalesce(v_disp, 0)::text, false);

  raise notice '✔ (٠-ب) إعدادات الخصم محفوظة للاستعادة — وأرضية البث المقروءة %',
    coalesce(v_disp, 0);
end;
$$;

-- ----------------------------------------------------------------------------
-- (٠-ج) خط الأساس — يُقرأ **قبل** أي زرع
--
-- جوهر منهج الملف: لا رقم مطلق واحد. مقارنة النتيجة بخط الأساس تجعل الاختبار
-- صحيحاً على قاعدة فارغة وعلى قاعدة فيها بيانات ديمو ستة أشهر سواءً بسواء.
-- ----------------------------------------------------------------------------
do $$
declare
  v_day date := current_setting('tours.dt_day')::date;
  v_n   numeric;
begin
  select coalesce(s.value, 0) into v_n
  from public.section_stats('discounts', v_day, v_day) s
  where s.key = 'redemptions_count';

  perform set_config('tours.dt_base_uses', coalesce(v_n, 0)::text, false);

  select coalesce(s.value, 0) into v_n
  from public.section_stats('discounts', v_day, v_day) s
  where s.key = 'discount_amount';

  perform set_config('tours.dt_base_amount', coalesce(v_n, 0)::text, false);

  select count(*)::numeric into v_n from public.bookings;
  perform set_config('tours.dt_base_bookings', v_n::text, false);

  raise notice '✔ (٠-ج) خط الأساس: % استخداماً بقيمة % اليوم، و% حجزاً في القاعدة',
    current_setting('tours.dt_base_uses'), current_setting('tours.dt_base_amount'),
    current_setting('tours.dt_base_bookings');
end;
$$;

-- ----------------------------------------------------------------------------
-- (أ) الرمز يُطبَّع، والكوبون يُنشأ ويُطبَّق
--
-- العقد: «يُقارَن بلا حساسية لحالة الأحرف ولا مسافات». والمُشغّل هو من يطبّع عند
-- الكتابة، فالفهرس الفريد يعمل على قيمة مطبَّعة دائماً ولا يعتمد على انضباط
-- المستدعي.
-- ----------------------------------------------------------------------------
do $$
declare
  v_stored text;
  v_d      record;
  v_raised boolean;
begin
  update public.discount_settings
     set enabled = true,
         max_percent = 100,
         min_margin_percent_after_discount = 0,
         min_margin_amount_after_discount = 0
   where id;

  insert into public.coupons (code, kind, value, enabled, note)
  values ('  dtest-p20  ', 'percent', 20, true, 'DISCOUNT_TESTS');

  select c.code into v_stored from public.coupons c where c.id is not null and c.note = 'DISCOUNT_TESTS' limit 1;

  if v_stored is distinct from 'DTEST-P20' then
    raise exception '(أ-١) الرمز المخزَّن «%» — المتوقع «DTEST-P20» (المُشغّل لا يطبّع)', v_stored;
  end if;

  -- (أ-٢) البحث بلا حساسية للحالة ولا للمسافات
  select * into v_d
  from public.apply_discount(' Dtest-P20 ', 1000, 'dtest-floor', 500, null);

  if not v_d.applied then
    raise exception '(أ-٢) الكوبون لم يُطبَّق مع رمز بمسافات وحالة مختلفة (سبب: %)',
      coalesce(v_d.rejection, 'بلا');
  end if;

  -- (أ-٣) رمز لا وجود له ⇒ not-found بلا أي أثر
  select * into v_d
  from public.apply_discount('DTEST-LA-WOJOOD-LAH', 1000, 'dtest-floor', 500, null);

  if v_d.applied or v_d.rejection is distinct from 'not-found' or v_d.amount <> 0
     or v_d.total_after is distinct from 1000 then
    raise exception '(أ-٣) رمز مجهول: applied=% rejection=% amount=% total_after=%',
      v_d.applied, v_d.rejection, v_d.amount, v_d.total_after;
  end if;

  -- (أ-٤) بلا رمز أصلاً ⇒ **ليس رفضاً**: الرحلة ببساطة بلا خصم
  select * into v_d from public.apply_discount(null, 1000, 'dtest-floor', 500, null);
  if v_d.applied or v_d.rejection is not null or v_d.total_after is distinct from 1000 then
    raise exception '(أ-٤) بلا رمز: rejection=% total_after=% — المتوقع null و ١٠٠٠',
      v_d.rejection, v_d.total_after;
  end if;

  -- (أ-٥) رمزان متطابقان بعد التطبيع مستحيلان (الفهرس الفريد على القيمة المطبَّعة)
  v_raised := false;
  begin
    insert into public.coupons (code, kind, value, enabled, note)
    values ('DTEST P20', 'percent', 5, true, 'DISCOUNT_TESTS');
  exception
    when unique_violation then
      v_raised := true;
  end;

  -- «DTEST P20» تُطبَّع إلى «DTESTP20» وهي رمز آخر فعلاً؛ ما يجب أن يُرفض هو
  -- «dtest-p20» بأي حالة أو مسافات محيطة.
  if v_raised then
    raise exception '(أ-٥) التطبيع أزال شرطة داخل الرمز — «DTEST P20» ليست «DTEST-P20»';
  end if;
  delete from public.coupons c where c.code = 'DTESTP20';

  v_raised := false;
  begin
    insert into public.coupons (code, kind, value, enabled, note)
    values (' dTeSt-P20 ', 'amount', 5, true, 'DISCOUNT_TESTS');
  exception
    when unique_violation then
      v_raised := true;
  end;

  if not v_raised then
    raise exception '(أ-٥) رمز مكرر بعد التطبيع قُبِل — الفهرس الفريد لا يعمل على القيمة المطبَّعة';
  end if;

  raise notice '✔ (أ) الرمز يُطبَّع عند الكتابة وعند البحث، والمكرر مرفوض، وبلا رمز لا رفض';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ب) نافذة الصلاحية وسقف الاستخدام والفئة والحد الأدنى
--
-- كل سبب رفض في `DiscountRejection` له هنا حالة تُنتجه. والاتحاد مغلق في العقد،
-- فرمزٌ غير معروف في هذه القائمة يعني انحرافاً عن العقد لا ميزة جديدة.
-- ----------------------------------------------------------------------------
do $$
declare
  v_d record;
begin
  insert into public.coupons (code, kind, value, enabled, note, ends_at)
  values ('DTEST-EXPIRED', 'percent', 20, true, 'DISCOUNT_TESTS', now() - interval '1 hour');

  insert into public.coupons (code, kind, value, enabled, note, starts_at)
  values ('DTEST-SOON', 'percent', 20, true, 'DISCOUNT_TESTS', now() + interval '1 hour');

  insert into public.coupons (code, kind, value, enabled, note)
  values ('DTEST-OFF', 'percent', 20, false, 'DISCOUNT_TESTS');

  insert into public.coupons (code, kind, value, enabled, note, class_slugs)
  values ('DTEST-CLASS', 'percent', 20, true, 'DISCOUNT_TESTS', array['dtest-minprice']);

  insert into public.coupons (code, kind, value, enabled, note, min_trip_total)
  values ('DTEST-MIN', 'percent', 20, true, 'DISCOUNT_TESTS', 5000);

  insert into public.coupons (code, kind, value, enabled, note, max_uses, used_count)
  values ('DTEST-CAP', 'percent', 20, true, 'DISCOUNT_TESTS', 1, 1);

  select * into v_d from public.apply_discount('DTEST-EXPIRED', 1000, 'dtest-floor', 500, null);
  if v_d.applied or v_d.rejection is distinct from 'expired' then
    raise exception '(ب-١) كوبون منتهٍ: applied=% rejection=% — المتوقع expired',
      v_d.applied, v_d.rejection;
  end if;

  select * into v_d from public.apply_discount('DTEST-SOON', 1000, 'dtest-floor', 500, null);
  if v_d.applied or v_d.rejection is distinct from 'not-started' then
    raise exception '(ب-٢) كوبون لم يبدأ: applied=% rejection=% — المتوقع not-started',
      v_d.applied, v_d.rejection;
  end if;

  -- 🔒 «معطَّل» يخرج بنفس رمز «غير موجود» (قرار ٨): التفريق يخبر من يخمّن أنه اقترب
  select * into v_d from public.apply_discount('DTEST-OFF', 1000, 'dtest-floor', 500, null);
  if v_d.applied or v_d.rejection is distinct from 'not-found' then
    raise exception '(ب-٣) كوبون معطَّل: rejection=% — المتوقع not-found (لا رمزاً يميّزه عن المجهول)',
      v_d.rejection;
  end if;

  select * into v_d from public.apply_discount('DTEST-CLASS', 1000, 'dtest-floor', 500, null);
  if v_d.applied or v_d.rejection is distinct from 'class-not-eligible' then
    raise exception '(ب-٤) فئة غير مشمولة: rejection=% — المتوقع class-not-eligible', v_d.rejection;
  end if;

  select * into v_d from public.apply_discount('DTEST-CLASS', 1000, 'dtest-minprice', 0, null);
  if not v_d.applied then
    raise exception '(ب-٤) الفئة المشمولة رُفضت أيضاً (سبب: %)', coalesce(v_d.rejection, 'بلا');
  end if;

  select * into v_d from public.apply_discount('DTEST-MIN', 1000, 'dtest-floor', 500, null);
  if v_d.applied or v_d.rejection is distinct from 'below-min-total' then
    raise exception '(ب-٥) إجمالي دون الحد: rejection=% — المتوقع below-min-total', v_d.rejection;
  end if;

  select * into v_d from public.apply_discount('DTEST-CAP', 1000, 'dtest-floor', 500, null);
  if v_d.applied or v_d.rejection is distinct from 'exhausted' then
    raise exception '(ب-٦) بلغ سقف الاستخدام: rejection=% — المتوقع exhausted', v_d.rejection;
  end if;

  raise notice '✔ (ب) الرفض بعد الانتهاء وقبل البداية وعند التعطيل والفئة والحد الأدنى وسقف الاستخدام';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ج) النظام المطفأ لا يمنح خصماً — ولا يكشف أنه مطفأ
-- ----------------------------------------------------------------------------
do $$
declare
  v_d record;
begin
  update public.discount_settings set enabled = false where id;

  select * into v_d from public.apply_discount('DTEST-P20', 1000, 'dtest-floor', 500, null);

  if v_d.applied then
    raise exception '(ج-١) النظام مطفأ ومع ذلك طُبِّق خصم — الحارس في الدالة معطَّل';
  end if;
  if v_d.rejection is distinct from 'not-found' then
    raise exception '(ج-١) النظام مطفأ ورمز الرفض «%» — المتوقع not-found (حالة النظام ليست معلومة عامة)',
      v_d.rejection;
  end if;

  if public.discount_enabled() then
    raise exception '(ج-٢) discount_enabled تقول «مفعَّل» والنظام مطفأ';
  end if;

  update public.discount_settings set enabled = true where id;

  if not public.discount_enabled() then
    raise exception '(ج-٢) discount_enabled تقول «مطفأ» والنظام مفعَّل';
  end if;

  raise notice '✔ (ج) النظام المطفأ لا يمنح خصماً ولا يفرّق رسالته عن «رمز مجهول»';
end;
$$;

-- ----------------------------------------------------------------------------
-- (د) 🔒 **أهم تأكيد في المجموعة**: أرضية الهامش تُقلّص الخصم ولا تُبطله
--
-- كوبون ٩٠٪ على رحلة هامشها لا يحتمل إلا جزءاً: القاعدة **لا ترفضه** بل تقلّصه
-- إلى ما تحتمله الأرضية وتُعلم بـ `clamped = true`. الشفافية هنا مقصودة: المالك
-- يجب أن يرى أن حملته لم تُطبَّق كما أعلنها لا أن يكتشفه من فرق في التقارير.
--
-- التوقع يُشتق من نفس مدخلات الكود: الأرضية = أكبر (أرضية الجنيه، نسبة التكلفة،
-- **أرضية البث**). ولذلك تُقرأ أرضية البث من `dispatch_config()` لا تُخمَّن.
-- ----------------------------------------------------------------------------
do $$
declare
  v_disp     numeric := current_setting('tours.dt_dispatch_floor')::numeric;
  v_total    constant numeric := 10000;
  v_cost     constant numeric := 6000;
  v_setfloor constant numeric := 200;
  v_floor    numeric;
  v_expected numeric;
  v_d        record;
begin
  update public.discount_settings
     set enabled = true,
         max_percent = 100,
         min_margin_percent_after_discount = 0,
         min_margin_amount_after_discount = v_setfloor
   where id;

  insert into public.coupons (code, kind, value, enabled, note)
  values ('DTEST-P90', 'percent', 90, true, 'DISCOUNT_TESTS');

  -- `floor` لا `round(...,2)`: طبقة الخصم تعمل بالجنيه الصحيح كما يعمل
  -- `quote_price`، والتقريب في اتجاه الأمان (لا يخترق الأرضية بنصف جنيه).
  -- التوقع يُشتق من نفس القاعدة لا من رقم محفور.
  v_floor    := greatest(v_setfloor, 0, v_disp);
  v_expected := floor(v_total - (v_cost + v_floor));

  if v_expected <= 0 then
    raise exception
      '(د) أرضية البث (%) أكبر من أن تترك مساحة خصم في التجهيز — عايرها أو عدّل التجهيز', v_disp;
  end if;

  select * into v_d
  from public.apply_discount('DTEST-P90', v_total, 'dtest-floor', v_cost, null);

  -- (د-١) قُلِّص ولم يُرفض
  if not v_d.applied then
    raise exception '(د-١) الخصم رُفض بدل أن يُقلَّص (سبب: %) — القرار المحوري ينص على التقليص حين يمكن',
      coalesce(v_d.rejection, 'بلا');
  end if;
  if not v_d.clamped then
    raise exception '(د-١) clamped = false مع أن الاسمي ٩٠٪ (%) والمسموح % — المالك لن يعرف أن حملته قُلِّصت',
      round(v_total * 0.9), v_d.amount;
  end if;

  -- (د-٢) والمقدار هو ما تحتمله الأرضية بالضبط
  if v_d.amount is distinct from v_expected then
    raise exception '(د-٢) قيمة الخصم % — المتوقع % (إجمالي % تكلفة % أرضية %)',
      v_d.amount, v_expected, v_total, v_cost, v_floor;
  end if;
  if v_d.total_after is distinct from (v_total - v_expected) then
    raise exception '(د-٢) الإجمالي بعد الخصم % — المتوقع %',
      v_d.total_after, v_total - v_expected;
  end if;

  -- (د-٣) وهي الخاصية نفسها لا الصيغة: الهامش المتبقي ≥ الأرضية
  if (v_d.total_after - v_cost) < v_floor then
    raise exception '(د-٣) الهامش المتبقي % دون الأرضية % — الحاجز خُرِق',
      round(v_d.total_after - v_cost, 2), v_floor;
  end if;

  -- (د-٤) وأرضية **النسبة** تعمل كأرضية الجنيه: نرفع النسبة ونتوقع خصماً أقل
  update public.discount_settings
     set min_margin_percent_after_discount = 20,
         min_margin_amount_after_discount = 0
   where id;

  v_floor    := greatest(0, round(v_cost * 20 / 100, 2), v_disp);
  v_expected := floor(v_total - (v_cost + v_floor));

  select * into v_d
  from public.apply_discount('DTEST-P90', v_total, 'dtest-floor', v_cost, null);

  if v_d.amount is distinct from v_expected or not v_d.clamped then
    raise exception '(د-٤) أرضية النسبة: الخصم % وclamped=% — المتوقع % وtrue',
      v_d.amount, v_d.clamped, v_expected;
  end if;

  -- (د-٥) وسقف النظام حارس ثانٍ فوق الكوبون
  update public.discount_settings
     set max_percent = 5,
         min_margin_percent_after_discount = 0,
         min_margin_amount_after_discount = 0
   where id;

  select * into v_d
  from public.apply_discount('DTEST-P90', v_total, 'dtest-floor', 0, null);

  if v_d.amount > floor(v_total * 5 / 100) then
    raise exception '(د-٥) الخصم % تجاوز سقف النظام % — الحارس الثاني لا يعمل',
      v_d.amount, floor(v_total * 5 / 100);
  end if;
  if not v_d.clamped then
    raise exception '(د-٥) سقف النظام قلّص الخصم ولم يُعلَم بـ clamped';
  end if;

  raise notice '✔ (د) الخصم يُقلَّص عند اختراق أرضية الهامش (جنيهاً ونسبةً) ولا يُرفض، وسقف النظام حارس ثانٍ';
end;
$$;

-- ----------------------------------------------------------------------------
-- (هـ) 🔒 استحالة نزول الإجمالي تحت `min_price` للفئة
--
-- الخارطة تسمّي الأرضيات «صمام الأمان» ضد العروض الخاسرة. كوبون ٣٠٪ فوق سعرٍ
-- لامسَ الأرضية كان سيُنزله تحتها ⇒ الصمام مُبطَل. هنا نثبت أنه لا يُبطَل.
-- ----------------------------------------------------------------------------
do $$
declare
  v_disp  numeric := current_setting('tours.dt_dispatch_floor')::numeric;
  v_min   numeric;
  v_total constant numeric := 1000;
  v_d     record;
begin
  update public.discount_settings
     set enabled = true,
         max_percent = 100,
         min_margin_percent_after_discount = 0,
         min_margin_amount_after_discount = 0
   where id;

  select t.min_price into v_min
  from public.vehicle_classes vc
  join public.tariffs t on t.class_id = vc.id
  where vc.slug = 'dtest-minprice';

  if v_min is null or v_min <= 0 then
    raise exception '(هـ) تجهيز الفئة ذات الأرضية العالية مفقود';
  end if;

  -- (هـ-١) كوبون نسبة ضخم
  select * into v_d from public.apply_discount('DTEST-P90', v_total, 'dtest-minprice', 0, null);

  if v_d.applied and v_d.total_after < v_min then
    raise exception '(هـ-١) الإجمالي بعد الخصم % نزل تحت أرضية الفئة % — الصمام مُبطَل',
      v_d.total_after, v_min;
  end if;
  if not v_d.applied then
    raise exception '(هـ-١) الخصم رُفض بدل أن يُقلَّص إلى ما فوق الأرضية (سبب: %)',
      coalesce(v_d.rejection, 'بلا');
  end if;
  if not v_d.clamped then
    raise exception '(هـ-١) الأرضية قلّصت الخصم ولم يُعلَم بـ clamped';
  end if;
  -- التوقع من نفس قاعدة الدالة: أكبر خصم ممكن = floor(الإجمالي − الأرضية)
  if v_disp <= v_min and v_d.total_after is distinct from (v_total - floor(v_total - v_min)) then
    raise exception '(هـ-١) الإجمالي بعد الخصم % — المتوقع % (أرضية الفئة %)',
      v_d.total_after, v_total - floor(v_total - v_min), v_min;
  end if;

  -- (هـ-٢) وكوبون **مبلغ** ضخم لا يخترقها كذلك — الحاجز واحد للنوعين
  insert into public.coupons (code, kind, value, enabled, note)
  values ('DTEST-A99K', 'amount', 99000, true, 'DISCOUNT_TESTS');

  select * into v_d from public.apply_discount('DTEST-A99K', v_total, 'dtest-minprice', 0, null);

  if v_d.applied and v_d.total_after < v_min then
    raise exception '(هـ-٢) كوبون مبلغ ضخم أنزل الإجمالي إلى % تحت الأرضية %',
      v_d.total_after, v_min;
  end if;

  -- (هـ-٣) ولا ينزل الإجمالي تحت الصفر أبداً مهما كان الكوبون
  if v_d.total_after < 0 then
    raise exception '(هـ-٣) إجمالي سالب بعد الخصم: %', v_d.total_after;
  end if;

  -- (هـ-٤) ولا مساحة إطلاقاً ⇒ رفض صريح لا خصم صفري صامت
  select * into v_d from public.apply_discount('DTEST-P90', 100, 'dtest-floor', 100, null);
  if v_d.applied or v_d.rejection is distinct from 'floor-guard' then
    raise exception '(هـ-٤) بلا مساحة للخصم: applied=% rejection=% — المتوقع رفض floor-guard',
      v_d.applied, v_d.rejection;
  end if;

  raise notice '✔ (هـ) الإجمالي بعد الخصم لا ينزل تحت min_price للفئة — نسبةً ومبلغاً — والرفض صريح حين لا مساحة';
end;
$$;

-- ----------------------------------------------------------------------------
-- (و) create_booking من طرف إلى طرف: اللقطة والدفتر والعربون
--
-- ⚠ التأكيدات هنا **خصائص** لا أرقام محفورة: القاعدة الحيّة قد تكون معايرة
-- بتعريفة وهامش مختلفين، فنقيس أن الإجمالي المخزَّن = ما قبل الخصم ناقص الخصم،
-- وأن تكلفة المتعهد لم تُمس، وأن الهامش وحده هو الذي نقص.
-- ----------------------------------------------------------------------------
do $$
declare
  v_cls    text := current_setting('tours.dt_class');
  v_b      record;
  v_row    record;
  v_disc   jsonb;
  v_before numeric;
  v_amount numeric;
  v_used   integer;
  v_rows   integer;
  v_appl   boolean;
  v_rej    text;
  v_clamp  boolean;
begin
  update public.discount_settings
     set enabled = true,
         max_percent = 100,
         min_margin_percent_after_discount = 0,
         min_margin_amount_after_discount = 0
   where id;

  insert into public.coupons (code, kind, value, enabled, note, max_uses)
  values ('DTEST-E2E', 'percent', 10, true, 'DISCOUNT_TESTS', 5);

  -- (و-٠) تشخيص مسبق: لو رفض المسار الحيّ الكوبونَ لفشل create_booking برسالة
  -- «رمز الخصم غير صالح» وهي لا تدل على السبب. نقرأه هنا صراحةً أولاً.
  select q.discount_applied, q.discount_rejection
    into v_appl, v_rej
  from public.quote_public(100, 1, false, 0, 25.0, 27.5, 24.5, 28.2, 'DTEST-E2E') q
  where q.class_slug = v_cls;

  if v_appl is null then
    raise exception '(و-٠) quote_public لم تُرجع صفاً للفئة «%» على المسار الصحراوي', v_cls;
  end if;
  if not v_appl then
    raise exception
      '(و-٠) كوبون ١٠٪ لا يُطبَّق على المسار الاختباري (سبب: %) — الأرجح أن أرضية الهامش أو أرضية البث في إعدادات هذه القاعدة أكبر من مساحة الخصم كلها',
      coalesce(v_rej, 'بلا');
  end if;

  select * into v_b
  from public.create_booking(
    jsonb_build_object('label', 'موقع صحراوي أ', 'lat', 25.000000, 'lng', 27.500000),
    jsonb_build_object('label', 'موقع صحراوي ب', 'lat', 24.500000, 'lng', 28.200000),
    1, false, 0, 100, 90, 'test',
    v_cls, 'full',
    'عميل اختبار الخصومات', '01000012901', null, now() + interval '3 days',
    'DISCOUNT_TESTS_FIXTURE-1', ' dtest-e2e '
  );

  perform set_config('tours.dt_b1', v_b.id::text, false);

  select b.* into v_row from public.bookings b where b.id = v_b.id;
  v_disc := v_row.trip -> 'discount';

  -- (و-١) اللقطة موجودة وفيها حقولها الخمسة
  --
  -- 🔒 و**لا سادس اسمه `clamped`**: `get_booking_by_token` تُرجع `trip` كاملاً
  -- وهي ممنوحة لـ anon، فراية «لامسنا الأرضية» كانت تصل حاملَ التوكن ومنها
  -- يُشتق حدُّ التكلفة+الأرضية. مكانها `coupon_redemptions.clamped` وحده.
  if v_disc is null or v_disc = 'null'::jsonb then
    raise exception '(و-١) لقطة الخصم غائبة من trip — تعديل الكوبون لاحقاً سيغيّر حجزاً قائماً';
  end if;
  -- `jsonb_exists(...)` لا المعامل `?`: أوضح، ولا يلتبس بعلامة معامل في أي مُشغّل
  if jsonb_exists(v_disc, 'clamped') then
    raise exception '(و-١) اللقطة تحمل clamped — و trip يخرج كاملاً لحامل التوكن عبر get_booking_by_token';
  end if;
  if v_disc ->> 'code' is distinct from 'DTEST-E2E' then
    raise exception '(و-١) رمز اللقطة «%» — المتوقع DTEST-E2E مطبَّعاً', v_disc ->> 'code';
  end if;
  if v_disc ->> 'kind' is distinct from 'percent' then
    raise exception '(و-١) نوع اللقطة «%» — المتوقع percent', v_disc ->> 'kind';
  end if;

  v_before := (v_disc ->> 'totalBefore')::numeric;
  v_amount := (v_disc ->> 'amount')::numeric;

  -- (و-٢) الحساب كله في القاعدة: الإجمالي المخزَّن = قبل الخصم ناقص الخصم
  if v_row.total is distinct from round(v_before - v_amount, 2) then
    raise exception '(و-٢) total المخزَّن % ≠ % − % = %',
      v_row.total, v_before, v_amount, round(v_before - v_amount, 2);
  end if;
  if v_row.total is distinct from (v_disc ->> 'totalAfter')::numeric then
    raise exception '(و-٢) total (%) ≠ totalAfter في اللقطة (%)',
      v_row.total, v_disc ->> 'totalAfter';
  end if;
  if v_b.total is distinct from v_row.total then
    raise exception '(و-٢) الدالة أرجعت % والمخزَّن % — رقمان لشيء واحد', v_b.total, v_row.total;
  end if;

  -- (و-٣) الخصم لا يتجاوز القيمة الاسمية، وإن قلّ عنها فـ clamped يقول ذلك
  --
  -- ⚠ القيمة الاسمية بالجنيه الصحيح — `round(...)` بلا خانات، تماماً كما تحسبها
  -- `apply_discount` وكما يُرجع `quote_price` إجماليه. الخانتان العشريتان هنا
  -- كانتا ستجعلان كوبون ١٠٪ فوق ١٢٧٥ يفشل كاذباً (١٢٨ مقابل ١٢٧٫٥٠).
  --
  -- 🔒 و`clamped` تُقرأ من `coupon_redemptions` لا من اللقطة: اللقطة لم تعد
  -- تحملها (و-١)، وقراءة مفتاح غائب كانت ستعطي null فيصير التأكيد فحصاً لا
  -- يمكن أن يفشل — النمط ٩ في `handover/LESSONS.md`.
  if v_amount > round(v_before * 10 / 100) then
    raise exception '(و-٣) الخصم % تجاوز القيمة الاسمية % لكوبون ١٠٪',
      v_amount, round(v_before * 10 / 100);
  end if;

  select r.clamped into v_clamp
  from public.coupon_redemptions r where r.booking_id = v_b.id;

  if v_clamp is null then
    raise exception '(و-٣) لا صف استخدام للحجز — redeem_coupon لم تُستدعَ داخل المعاملة';
  end if;
  if v_amount < round(v_before * 10 / 100) and not v_clamp then
    raise exception '(و-٣) الخصم قُلِّص من % إلى % بلا علم clamped',
      round(v_before * 10 / 100), v_amount;
  end if;

  -- (و-٤) 🔒 الخصم من هامش الموقع وحده: تكلفة المتعهد لم تُمس
  if v_row.price_source is distinct from 'tariff' or v_row.subcontractor_cost is not null then
    raise exception '(و-٤) التجهيز الصحراوي التقط متعهداً (مصدر % تكلفة %) — الإحداثيات لم تعد نائية',
      v_row.price_source, v_row.subcontractor_cost;
  end if;

  -- (و-٥) العربون يُشتق من الإجمالي **بعد** الخصم (خطة full ⇒ المستحق = الإجمالي)
  if v_row.amount_due is distinct from v_row.total or v_row.amount_remaining <> 0 then
    raise exception '(و-٥) خطة full: المستحق % والباقي % — المتوقع % و ٠',
      v_row.amount_due, v_row.amount_remaining, v_row.total;
  end if;

  -- (و-٦) صفّ الاستخدام كُتب في نفس المعاملة، والعدّاد زاد **واحداً** عن خط أساسه
  select c.used_count into v_used from public.coupons c where c.code = 'DTEST-E2E';
  if v_used <> 1 then
    raise exception '(و-٦) عدّاد الكوبون % — المتوقع ١ (خط الأساس صفر لكوبون أُنشئ للتو)', v_used;
  end if;

  select count(*)::integer into v_rows
  from public.coupon_redemptions r where r.booking_id = v_b.id;
  if v_rows <> 1 then
    raise exception '(و-٦) صفوف الاستخدام لهذا الحجز % — المتوقع ١', v_rows;
  end if;

  select r.* into v_row from public.coupon_redemptions r where r.booking_id = v_b.id;
  if v_row.amount is distinct from v_amount then
    raise exception '(و-٦) قيمة صف الاستخدام % ≠ قيمة اللقطة %', v_row.amount, v_amount;
  end if;
  if v_row.phone is distinct from '01000012901' then
    raise exception '(و-٦) هاتف صف الاستخدام «%» — المتوقع هاتف الحجز', v_row.phone;
  end if;

  raise notice '✔ (و) الحجز بكوبون: اللقطة مجمَّدة، والإجمالي بعد الخصم، والعربون منه، وصف الاستخدام مكتوب';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ز) 🔒 لقطة السعر تُجمَّد والكوبون لا: تعديل الكوبون لا يغيّر حجزاً قائماً
--
-- مصيدة المرحلة حرفياً: «مالك يعدّل نسبة كوبون بعد ١٠٠ حجز يجب ألا يغيّر
-- جنيهاً واحداً في حجز قائم» (سابقة D-10).
-- ----------------------------------------------------------------------------
do $$
declare
  v_b1     uuid := current_setting('tours.dt_b1')::uuid;
  v_total  numeric;
  v_disc   jsonb;
  v_total2 numeric;
  v_disc2  jsonb;
begin
  select b.total, b.trip -> 'discount' into v_total, v_disc
  from public.bookings b where b.id = v_b1;

  update public.coupons
     set value = 90, kind = 'percent', enabled = false, ends_at = now() - interval '1 day'
   where code = 'DTEST-E2E';

  select b.total, b.trip -> 'discount' into v_total2, v_disc2
  from public.bookings b where b.id = v_b1;

  if v_total2 is distinct from v_total then
    raise exception '(ز) تعديل الكوبون غيّر إجمالي حجز قائم: % ← %', v_total, v_total2;
  end if;
  if v_disc2 is distinct from v_disc then
    raise exception '(ز) تعديل الكوبون غيّر لقطة الخصم في حجز قائم';
  end if;

  -- إعادة الكوبون إلى حالته كي تعمل بقية الأقسام
  update public.coupons
     set value = 10, enabled = true, ends_at = null
   where code = 'DTEST-E2E';

  raise notice '✔ (ز) لقطة الخصم مجمَّدة — تعديل الكوبون أو تعطيله لا يمسّ حجزاً قائماً';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ح) 🔒 حجزان متزامنان على آخر استخدام متاح ⇒ واحد يفوز
--
-- مشغّل الاختبارات ينفّذ الملف كله في **معاملة واحدة على اتصال واحد**، فلا سبيل
-- إلى اتصال ثانٍ من داخله. لذلك تُثبَت الاستحالة أربع مرات بأربع طرق مستقلة،
-- وأقواها الأولى لأنها بنيوية لا سلوكية:
--   (١) `coupons_used_within_max_chk` قيدُ تحقّق على **نفس الصف** ⇒ تجاوز
--       السقف مستحيل في القاعدة مهما كان مسار الكتابة. وهو أقوى من الفهرس
--       الفريد الجزئي الذي استعملته المرحلة ٦ لأنه لا يحتاج صفاً ثانياً ليمنع.
--   (٢) `redeem_coupon` تقفل صف الكوبون بـ `for update` قبل قراءة العدّاد ⇒
--       المحاولتان تتسلسلان ولا تتسابقان.
--   (٣) فهرس فريد على `coupon_redemptions(booking_id)` ⇒ كوبون واحد لكل حجز،
--       ولا تسجيل مكرّر عند إعادة محاولة.
--   (٤) حيّ: كوبون نفدت كميته ⇒ الاستخدام التالي يفشل، و`create_booking`
--       لا تُنشئ حجزاً أصلاً (الفرق عن خط الأساس صفر).
--
-- ولمن أراد التجربة بيدين اثنتين (الدليل النهائي على قاعدة حيّة):
--   جلسة ١: begin; select redeem_coupon('DTEST-CAP2', '<حجز أ>', 10, '0100');  -- بلا commit
--   جلسة ٢: select redeem_coupon('DTEST-CAP2', '<حجز ب>', 10, '0100');         -- تتجمّد على القفل
--   جلسة ١: commit;  ⇒ الجلسة ٢ تُكمل فوراً وترفع «انتهت الكمية» (coupon-exhausted)
-- ----------------------------------------------------------------------------
do $$
declare
  v_cls    text := current_setting('tours.dt_class');
  v_base   integer := current_setting('tours.dt_base_bookings')::integer;
  v_b2     uuid;
  v_b3     uuid;
  v_r      record;
  v_def    text;
  v_raised boolean;
  v_state  text;
  v_hint   text;
  v_n      integer;
begin
  -- ── (ح-١) الحاجز البنيوي: قيد تحقّق على نفس الصف ──────────────────────────
  if not exists (
    select 1 from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public' and t.relname = 'coupons'
      and c.conname = 'coupons_used_within_max_chk'
  ) then
    raise exception '(ح-١) قيد coupons_used_within_max_chk غائب — تجاوز السقف صار ممكناً بالكتابة المباشرة';
  end if;

  v_raised := false;
  begin
    update public.coupons set used_count = 99 where code = 'DTEST-CAP';
  exception
    when check_violation then
      v_raised := true;
  end;

  if not v_raised then
    raise exception '(ح-١) كتابة مباشرة تجاوزت سقف الاستخدام — القيد لا يعمل';
  end if;

  -- ── (ح-٢) قفل الصف قبل قراءة العدّاد ─────────────────────────────────────
  select pg_get_functiondef(to_regprocedure('public.redeem_coupon(text, uuid, numeric, text)')::oid)
    into v_def;

  if v_def is null then
    raise exception '(ح-٢) تعذّر قراءة تعريف redeem_coupon';
  end if;
  if v_def !~* 'from public\.coupons[^;]*for update' then
    raise exception '(ح-٢) redeem_coupon لا تقفل صف الكوبون بـ for update — المحاولتان تتسابقان';
  end if;

  -- ── (ح-٣) فهرس فريد لكل حجز ──────────────────────────────────────────────
  if not exists (
    select 1
    from pg_index i
    join pg_class t  on t.oid = i.indrelid
    join pg_class ix on ix.oid = i.indexrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public' and t.relname = 'coupon_redemptions'
      and i.indisunique
      and pg_get_indexdef(i.indexrelid) like '%(booking_id)%'
  ) then
    raise exception '(ح-٣) لا فهرس فريد على coupon_redemptions(booking_id) — التراكم صار ممكناً (نقض القرار ٩)';
  end if;

  -- حجزان بلا كوبون: أحدهما لاختبار التسجيل المكرَّر والآخر للكوبون المستنفَد
  select t.id into v_b2 from public.create_booking(
    jsonb_build_object('label', 'موقع صحراوي أ', 'lat', 25.000000, 'lng', 27.500000),
    jsonb_build_object('label', 'موقع صحراوي ب', 'lat', 24.500000, 'lng', 28.200000),
    1, false, 0, 100, 90, 'test', v_cls, 'full',
    'عميل اختبار الخصومات ٢', '01000012902', null, now() + interval '3 days',
    'DISCOUNT_TESTS_FIXTURE-2', null) t;

  select t.id into v_b3 from public.create_booking(
    jsonb_build_object('label', 'موقع صحراوي أ', 'lat', 25.000000, 'lng', 27.500000),
    jsonb_build_object('label', 'موقع صحراوي ب', 'lat', 24.500000, 'lng', 28.200000),
    1, false, 0, 100, 90, 'test', v_cls, 'full',
    'عميل اختبار الخصومات ٣', '01000012903', null, now() + interval '3 days',
    'DISCOUNT_TESTS_FIXTURE-3', null) t;

  perform set_config('tours.dt_b2', v_b2::text, false);
  perform set_config('tours.dt_b3', v_b3::text, false);

  -- تسجيل صحيح واحد، ثم محاولة تسجيل ثانٍ لنفس الحجز
  perform public.redeem_coupon('DTEST-E2E', v_b2, 25, '01000012902');

  v_raised := false;
  begin
    perform public.redeem_coupon('DTEST-E2E', v_b2, 25, '01000012902');
  exception
    when unique_violation then
      v_raised := true;
  end;

  if not v_raised then
    raise exception '(ح-٣) سُجِّل استخدامان لحجز واحد — الفهرس الفريد لا يعمل';
  end if;

  -- والعدّاد لم يزد بالمحاولة الفاشلة (المعاملة الفرعية تراجعت كاملة)
  select c.used_count into v_n from public.coupons c where c.code = 'DTEST-E2E';
  if v_n <> 2 then
    raise exception '(ح-٣) عدّاد الكوبون % — المتوقع ٢ (حجزان ناجحان، والفاشل لم يزده)', v_n;
  end if;

  -- ── (ح-٤) الكوبون المستنفَد: الخاسر لا يمر ────────────────────────────────
  v_raised := false;
  begin
    perform public.redeem_coupon('DTEST-CAP', v_b3, 10, '01000012903');
  exception
    when others then
      v_raised := true;
      get stacked diagnostics v_hint = pg_exception_hint;
  end;

  if not v_raised then
    raise exception '(ح-٤) كوبون بسقف ١ استُخدم مرة ثانية — «سقف ١٠٠ يُستخدم ١٠٣ مرات» عاد';
  end if;
  if v_hint is distinct from 'coupon-exhausted' then
    raise exception '(ح-٤) رمز الخطأ «%» — المتوقع coupon-exhausted', coalesce(v_hint, 'بلا');
  end if;

  -- ── (ح-٥) وcreate_booking لا تُنشئ حجزاً بكوبون نفد ───────────────────────
  select count(*)::integer into v_n from public.bookings;
  v_raised := false;
  begin
    perform public.create_booking(
      jsonb_build_object('label', 'موقع صحراوي أ', 'lat', 25.000000, 'lng', 27.500000),
      jsonb_build_object('label', 'موقع صحراوي ب', 'lat', 24.500000, 'lng', 28.200000),
      1, false, 0, 100, 90, 'test', v_cls, 'full',
      'عميل اختبار الخصومات ٤', '01000012904', null, now() + interval '3 days',
      'DISCOUNT_TESTS_FIXTURE-4', 'DTEST-CAP');
  exception
    when others then
      v_raised := true;
      get stacked diagnostics v_hint = pg_exception_hint;
  end;

  if not v_raised then
    raise exception '(ح-٥) أُنشئ حجز بكوبون نفدت كميته';
  end if;
  if v_hint is distinct from 'coupon-rejected' then
    raise exception '(ح-٥) رمز الخطأ «%» — المتوقع coupon-rejected', coalesce(v_hint, 'بلا');
  end if;

  select count(*)::integer into v_n from public.bookings;
  if v_n <> current_setting('tours.dt_base_bookings')::integer + 3 then
    raise exception '(ح-٥) عدد الحجوزات % — المتوقع خط الأساس % + ٣ (الحجز الرابع لم يُنشأ)',
      v_n, current_setting('tours.dt_base_bookings');
  end if;

  -- ── (ح-٦) ورمز صالح لكن الحجز فشل ⇒ لا صف استخدام يتيم ────────────────────
  select count(*)::integer into v_n
  from public.coupon_redemptions r
  where r.code = 'DTEST-CAP';
  if v_n <> 0 then
    raise exception '(ح-٦) بقي % صف استخدام لكوبون لم ينجح حجزه — التسجيل ليس داخل معاملة الحجز', v_n;
  end if;

  raise notice '✔ (ح) السقف محروس بقيد على نفس الصف وقفل صف وفهرس فريد — وحجز الخاسر لا يُنشأ أصلاً';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ط) 🔒 الزائر لا يقرأ الكوبونات ولا سجل الاستخدام ولا ينفّذ redeem_coupon
--
-- الفحص الكتالوجي يثبت المنح؛ والفحص الحيّ يثبت **السلوك** بنفس المسار الذي
-- يسلكه PostgREST. ونفرّغ مطالبة الـ jwt أولاً حتى لا يتسلل مشرف الاختبار إلى
-- جلسة الزائر، ونلفّ الكتلة بمعالج يعيد الدور وإلا بقيت الجلسة عالقة بدور anon
-- فتفشل كل الأقسام التالية بلا سبب واضح.
-- ----------------------------------------------------------------------------
do $$
declare
  v_rel  text;
  v_priv text;
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    raise notice '  ↳ (ط-١) لا دور anon في هذه القاعدة — الفحص الكتالوجي متخطّى';
  else
    foreach v_rel in array array['public.coupons', 'public.coupon_redemptions', 'public.discount_settings']
    loop
      foreach v_priv in array array['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger']
      loop
        if has_table_privilege('anon', v_rel, v_priv) then
          raise exception '(ط-١) الزائر يملك % على % — والفخ الحقيقي TRUNCATE فهي لا تخضع لـ RLS',
            upper(v_priv), v_rel;
        end if;
      end loop;
    end loop;

    if has_function_privilege('anon', 'public.redeem_coupon(text, uuid, numeric, text)', 'execute') then
      raise exception '(ط-١) الزائر ينفّذ redeem_coupon — يزيد عدّادات الكوبونات بلا حجز';
    end if;
    if has_function_privilege('anon', 'public.apply_discount(text, numeric, text, numeric, text)', 'execute') then
      raise exception '(ط-١) الزائر ينفّذ apply_discount مباشرةً — يتخطى تجميع أسباب الرفض وحدّ المعدل';
    end if;
    if has_function_privilege('anon', 'public.discount_config()', 'execute') then
      raise exception '(ط-١) الزائر يقرأ discount_config — أرضية الهامش سرّ تجاري';
    end if;
    -- ⚠ المنح باقٍ **للتسعير بلا رمز وحده**: الموقع يسعّر قبل الدخول. أما تمرير
    -- رمز كوبون من دور متصفح فيرفضه حارس في مطلع الدالة، والفحص الحيّ لذلك في
    -- (ط-٢) أدناه — وهو الفحص الملزِم، لأن المنح وحده لا يقول شيئاً عن الحارس.
    if not has_function_privilege('anon', 'public.quote_public(numeric, integer, boolean, numeric, numeric, numeric, numeric, numeric, text, integer, jsonb)', 'execute') then
      raise exception '(ط-١) الزائر فقد التسعير العام — الموقع لا يسعّر قبل الدخول';
    end if;
  end if;

  -- 🔒 والمسجَّل كذلك: كل متعهد مستخدم authenticated، وهو يتحكم في p_partner_cost
  -- فيستكشف أرضية الهامش بالتجربة — نفس الاستنتاج العكسي الذي أغلقته 0011.
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    if has_function_privilege('authenticated', 'public.apply_discount(text, numeric, text, numeric, text)', 'execute')
       or has_function_privilege('authenticated', 'public.redeem_coupon(text, uuid, numeric, text)', 'execute')
       or has_function_privilege('authenticated', 'public.discount_config()', 'execute') then
      raise exception '(ط-١) المسجَّل ينفّذ إحدى دوال الحساب الداخلية — المتعهد يستكشف أرضية الهامش منها';
    end if;
  end if;

  raise notice '✔ (ط-١) الكتالوج: صفر صلاحية للزائر على جداول الخصم، ولا تنفيذ لدوال الحساب';
end;
$$;

-- (ط-٢) الفحص الحيّ بدور anon
do $$
declare
  v_n      integer;
  v_ok     boolean;
  v_state  text;
  v_b3     uuid := current_setting('tours.dt_b3')::uuid;
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    raise notice '  ↳ (ط-٢) لا دور anon — الفحص الحي متخطّى';
    return;
  end if;

  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claims', '', false);

  begin
    execute 'set local role anon';

    v_ok := false; v_state := null;
    begin
      execute 'select count(*) from public.coupons' into v_n;
      v_ok := true;
    exception when others then
      v_ok := false;
      get stacked diagnostics v_state = returned_sqlstate;
    end;
    if v_ok then
      raise exception '(ط-٢) الزائر قرأ جدول الكوبونات — كل رمز صالح في المنصة مكشوف';
    end if;
    if v_state is distinct from '42501' then
      raise exception '(ط-٢) قراءة الكوبونات فشلت بالرمز «%» لا 42501 — الاختبار غير حاسم',
        coalesce(v_state, 'بلا');
    end if;

    v_ok := false; v_state := null;
    begin
      execute 'select count(*) from public.coupon_redemptions' into v_n;
      v_ok := true;
    exception when others then
      v_ok := false;
      get stacked diagnostics v_state = returned_sqlstate;
    end;
    if v_ok then
      raise exception '(ط-٢) الزائر قرأ سجل الاستخدام — وفيه أرقام هواتف العملاء';
    end if;
    if v_state is distinct from '42501' then
      raise exception '(ط-٢) قراءة سجل الاستخدام فشلت بالرمز «%» لا 42501 — الاختبار غير حاسم',
        coalesce(v_state, 'بلا');
    end if;

    -- ⚠ الحجز المستعمل هنا **بلا** صف استخدام سابق، والسبب مقصود: لو استعملنا
    -- حجزاً مسجَّلاً لفشل النداء بـ 23505 لا بـ 42501 فمرّ الاختبار كاذباً. ولذلك
    -- نتحقق من **رمز الخطأ** نفسه لا من مجرد وقوعه.
    v_ok := false; v_state := null;
    begin
      execute format('select public.redeem_coupon(''DTEST-E2E'', %L::uuid, 1, ''0100'')', v_b3);
      v_ok := true;
    exception when others then
      v_ok := false;
      get stacked diagnostics v_state = returned_sqlstate;
    end;
    if v_ok then
      raise exception '(ط-٢) الزائر نفّذ redeem_coupon — يزيد عدّادات الكوبونات بلا حجز';
    end if;
    if v_state is distinct from '42501' then
      raise exception '(ط-٢) redeem_coupon فشلت للزائر بالرمز «%» لا 42501 — الاختبار غير حاسم',
        coalesce(v_state, 'بلا');
    end if;

    v_ok := false; v_state := null;
    begin
      execute 'select count(*) from public.apply_discount(''DTEST-E2E'', 1000, ''dtest-floor'', 0, null)' into v_n;
      v_ok := true;
    exception when others then
      v_ok := false;
      get stacked diagnostics v_state = returned_sqlstate;
    end;
    if v_ok then
      raise exception '(ط-٢) الزائر نفّذ apply_discount مباشرةً — يتخطى تجميع أسباب الرفض وحدّ المعدل';
    end if;
    if v_state is distinct from '42501' then
      raise exception '(ط-٢) apply_discount فشلت للزائر بالرمز «%» لا 42501 — الاختبار غير حاسم',
        coalesce(v_state, 'بلا');
    end if;

    -- 🔒 (ط-٢-ب) الزائر لا يمرّر **رمز كوبون** إلى quote_public.
    --
    -- بلا هذا الحاجز يصير المنح التفافاً كاملاً على القرار ٧ وعلى عزل 0011:
    --   • عرّاف وجود: `not-found` مقابل `class-not-eligible`/`exhausted`/
    --     `floor-guard` يفرّق الرمز الحقيقي عن الوهمي، والخانق في Node لا يقع
    --     على هذا الطريق أصلاً.
    --   • عرّاف تكلفة: عند التقليص يصير
    --     `total_before_discount − discount_amount` = التكلفة + الأرضية بالجنيه.
    -- والرمز المستعمل هنا **صالح فعلاً** (‏DTEST-E2E) كي لا يمرّ الفحص كاذباً
    -- بسبب رمز وهمي، ونتحقق من وقوع الخطأ لا من مجرد غياب النتيجة.
    v_ok := false; v_state := null;
    begin
      execute 'select count(*) from public.quote_public(100, 1, false, 0, 25.0, 27.5, 24.5, 28.2, ''DTEST-E2E'')' into v_n;
      v_ok := true;
    exception when others then
      v_ok := false;
      get stacked diagnostics v_state = returned_sqlstate;
    end;
    if v_ok then
      raise exception '(ط-٢-ب) الزائر سعّر برمز كوبون — quote_public صارت عرّافَ تخمينٍ وعرّافَ تكلفة بلا خانق';
    end if;
    if v_state is distinct from 'P0001' then
      raise exception '(ط-٢-ب) رفضُ الرمز للزائر جاء بالرمز «%» لا P0001 — الاختبار غير حاسم',
        coalesce(v_state, 'بلا');
    end if;

    -- وما يجب أن يعمل للزائر يعمل: التسعير **بلا رمز** و«هل النظام مفعَّل»
    execute 'select count(*) from public.quote_public(100, 1, false, 0, 25.0, 27.5, 24.5, 28.2, null)' into v_n;
    execute 'select case when public.discount_enabled() then 1 else 0 end' into v_n;

    execute 'reset role';
  exception
    when others then
      execute 'reset role';
      raise;
  end;

  raise notice '✔ (ط-٢) الزائر حيّاً: لا كوبونات ولا سجل استخدام ولا دوال حساب — والتسعير العام يعمل';
end;
$$;

-- (ط-٣) مستخدم مسجَّل غير مشرف: المنح موجود والسياسة تُصفّر النتيجة
do $$
declare
  v_n     integer;
  v_all   integer;
  v_ok    boolean;
  v_state text;
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    raise notice '  ↳ (ط-٣) لا دور authenticated — الفحص الحي متخطّى';
    return;
  end if;

  select count(*)::integer into v_all from public.coupons;
  if v_all = 0 then
    raise exception '(ط-٣) لا كوبونات في القاعدة — الاختبار بلا معنى';
  end if;

  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claims', '', false);

  begin
    execute 'set local role authenticated';

    execute 'select count(*) from public.coupons' into v_n;
    if v_n <> 0 then
      raise exception '(ط-٣) مسجَّل غير مشرف يرى % كوبوناً — سياسة is_admin لا تعمل', v_n;
    end if;

    execute 'select count(*) from public.coupon_redemptions' into v_n;
    if v_n <> 0 then
      raise exception '(ط-٣) مسجَّل غير مشرف يرى % صف استخدام (وفيها هواتف)', v_n;
    end if;

    execute 'select count(*) from public.discount_settings' into v_n;
    if v_n <> 0 then
      raise exception '(ط-٣) مسجَّل غير مشرف يقرأ إعدادات الخصم — وفيها أرضية الهامش';
    end if;

    execute 'select count(*) from public.get_discount_settings()' into v_n;
    if v_n <> 0 then
      raise exception '(ط-٣) get_discount_settings أرجعت صفوفاً لغير مشرف';
    end if;

    -- 🔒 (ط-٣-ب) والمسجَّل لا يمرّر رمزاً إلى quote_public — وهذا أخطر من الزائر:
    -- كل متعهد مستخدم `authenticated`، وبكوبون على مسارٍ يخدمه هو يعرف تكلفته
    -- فيستخرج أرضية هامش الموقع بالضبط، ثم يستدعيها على مسار منافسه فيستخرج
    -- تكلفته. وهو حرفياً الاستنتاج العكسي الذي بُنيت 0011 كلها لإغلاقه.
    v_ok := false; v_state := null;
    begin
      execute 'select count(*) from public.quote_public(100, 1, false, 0, 25.0, 27.5, 24.5, 28.2, ''DTEST-E2E'')' into v_n;
      v_ok := true;
    exception when others then
      v_ok := false;
      get stacked diagnostics v_state = returned_sqlstate;
    end;
    if v_ok then
      raise exception '(ط-٣-ب) مسجَّل سعّر برمز كوبون — المتعهد يستخرج تكلفة منافسه من الفرق عند التقليص';
    end if;
    if v_state is distinct from 'P0001' then
      raise exception '(ط-٣-ب) رفضُ الرمز للمسجَّل جاء بالرمز «%» لا P0001 — الاختبار غير حاسم',
        coalesce(v_state, 'بلا');
    end if;

    execute 'reset role';
  exception
    when others then
      execute 'reset role';
      raise;
  end;

  raise notice '✔ (ط-٣) المسجَّل غير المشرف: صفر كوبون وصفر استخدام وصفر إعداد';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ي) quote_public: حقول الخصم في نوع الإرجاع، والأسباب المتقاربة مجمَّعة
--
-- سابقة D-18: ما ليس في نوع الإرجاع لا يصل الواجهة أبداً — فوجود حقول الخصم في
-- نوع الإرجاع شرط عملها، وغياب أعمدة التكلفة منه شرط أمنها. والاثنان يُفحصان هنا.
-- ----------------------------------------------------------------------------
do $$
declare
  v_missing text;
  v_row     record;
  v_seen    integer := 0;
begin
  select string_agg(x.col, '، ')
    into v_missing
  from (values
    ('discount_applied'), ('discount_code'), ('discount_amount'),
    ('discount_clamped'), ('discount_rejection'), ('total_before_discount')
  ) as x(col)
  -- الفحص من pg_proc مباشرة لا من information_schema.parameters: الأخيرة تسمّي
  -- أعمدة `returns table` بـ OUT في هذا الإصدار وTABLE في غيره، فشرط
  -- `parameter_mode = 'TABLE'` يجعل الفحص يرسّب كوداً سليماً (أو يمرّ بلا فحص
  -- في صيغته السالبة). نفس الفخّ موثَّق ومحلول في dispatch_tests.sql قسم (ب-١).
  where not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    cross join lateral unnest(p.proargnames, p.proargmodes) as a(argname, argmode)
    where n.nspname = 'public'
      and p.proname = 'quote_public'
      and a.argmode in ('o', 't')
      and a.argname = x.col
  );

  if v_missing is not null then
    raise exception '(ي-١) حقول الخصم ليست في نوع إرجاع quote_public: % — لن تصل الواجهة أبداً (D-18)',
      v_missing;
  end if;

  -- ولا عمود داخلي واحد عاد إلى نوع الإرجاع
  -- (شاهد إيجابي للفحص السالب: التأكيد أعلاه وجد الحقول الستة بنفس الآلية،
  --  فلو كانت الآلية معطلة لسقط قبل الوصول إلى هنا.)
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    cross join lateral unnest(p.proargnames, p.proargmodes) as a(argname, argmode)
    where n.nspname = 'public'
      and p.proname = 'quote_public'
      and a.argmode in ('o', 't')
      and a.argname in ('price_source', 'subcontractor_id',
                        'subcontractor_cost', 'margin_amount')
  ) then
    raise exception '(ي-١) ثغرة: quote_public عادت تُرجع عموداً داخلياً';
  end if;

  update public.discount_settings
     set enabled = true, max_percent = 100,
         min_margin_percent_after_discount = 0,
         min_margin_amount_after_discount = 0
   where id;

  -- (ي-٢) كوبون صالح: الإجمالي المعروض = ما قبل الخصم ناقص الخصم
  for v_row in
    select * from public.quote_public(100, 1, false, 0, 25.0, 27.5, 24.5, 28.2, ' dtest-e2e ')
  loop
    v_seen := v_seen + 1;
    if not v_row.discount_applied then
      raise exception '(ي-٢) الكوبون لم يُطبَّق في quote_public (سبب: %)',
        coalesce(v_row.discount_rejection, 'بلا');
    end if;
    if v_row.total is distinct from round(v_row.total_before_discount - v_row.discount_amount, 2) then
      raise exception '(ي-٢) الإجمالي % ≠ % − %',
        v_row.total, v_row.total_before_discount, v_row.discount_amount;
    end if;
    if v_row.discount_code is distinct from 'DTEST-E2E' then
      raise exception '(ي-٢) الرمز المُعاد «%» — المتوقع مطبَّعاً', v_row.discount_code;
    end if;
  end loop;

  if v_seen = 0 then
    raise exception '(ي-٢) quote_public لم تُرجع صفاً واحداً للمسار الصحراوي';
  end if;

  -- (ي-٣) 🔒 التجميع: منتهٍ ولم يبدأ ومعطَّل ومجهول ⇒ كلها not-found للزائر
  for v_row in
    select q.discount_rejection, x.code
    from (values ('DTEST-EXPIRED'), ('DTEST-SOON'), ('DTEST-OFF'), ('DTEST-MAJHOOL-999')) as x(code)
    cross join lateral public.quote_public(100, 1, false, 0, 25.0, 27.5, 24.5, 28.2, x.code) q
  loop
    if v_row.discount_rejection is distinct from 'not-found' then
      raise exception '(ي-٣) الرمز «%» أعاد سبباً مميّزاً «%» — من يخمّن الرموز يعرف أنه اقترب',
        v_row.code, v_row.discount_rejection;
    end if;
  end loop;

  -- (ي-٤) وبلا رمز: لا خصم ولا رفض، والسعر كما كان
  for v_row in
    select * from public.quote_public(100, 1, false, 0, 25.0, 27.5, 24.5, 28.2, null)
  loop
    if v_row.discount_applied or v_row.discount_rejection is not null
       or v_row.total is distinct from v_row.total_before_discount then
      raise exception '(ي-٤) بلا رمز: applied=% rejection=% total=% before=%',
        v_row.discount_applied, v_row.discount_rejection,
        v_row.total, v_row.total_before_discount;
    end if;
  end loop;

  raise notice '✔ (ي) quote_public تحمل حقول الخصم ولا تحمل رقماً داخلياً، وتجمّع أسباب الرفض المتقاربة';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ك) القسم الإحصائي السابع
--
-- يُقاس **بالفرق عن خط الأساس** المأخوذ في (٠-ج): زرعنا استخدامين اليوم
-- (حجز بكوبون + تسجيل مباشر)، فالفارق يجب أن يساوي اثنين بالضبط.
-- ----------------------------------------------------------------------------
do $$
declare
  v_day    date := current_setting('tours.dt_day')::date;
  v_base_u numeric := current_setting('tours.dt_base_uses')::numeric;
  v_base_a numeric := current_setting('tours.dt_base_amount')::numeric;
  v_uses   numeric;
  v_amount numeric;
  v_mine   numeric;
  v_s      record;
  v_n      integer;
  v_bad    text;
  v_raised boolean;
begin
  select s.value into v_uses
  from public.section_stats('discounts', v_day, v_day) s where s.key = 'redemptions_count';

  if coalesce(v_uses, -1) - v_base_u <> 2 then
    raise exception '(ك-١) فارق الاستخدامات % — المتوقع ٢ (خط الأساس % والآن %)',
      coalesce(v_uses, 0) - v_base_u, v_base_u, coalesce(v_uses, 0);
  end if;

  select coalesce(sum(r.amount), 0) into v_mine
  from public.coupon_redemptions r
  where (r.redeemed_at at time zone 'Africa/Cairo')::date = v_day
    and r.code like 'DTEST-%';

  select s.value into v_amount
  from public.section_stats('discounts', v_day, v_day) s where s.key = 'discount_amount';

  if round(coalesce(v_amount, 0) - v_base_a, 2) is distinct from round(v_mine, 2) then
    raise exception '(ك-٢) فارق قيمة الخصومات % — المتوقع % (مجموع ما زرعناه)',
      round(coalesce(v_amount, 0) - v_base_a, 2), round(v_mine, 2);
  end if;

  -- (ك-٣) عقد StatCard: value لا يكون null أبداً، وformat من الأربعة، والمفاتيح فريدة
  v_n := 0;
  for v_s in select * from public.section_stats('discounts', v_day - 29, v_day) loop
    v_n := v_n + 1;
    if v_s.value is null then
      raise exception '(ك-٣) البطاقة «%» قيمتها null — العقد ينص على value غير قابل للتفريغ', v_s.key;
    end if;
    if v_s.format not in ('number', 'money', 'percent', 'duration') then
      raise exception '(ك-٣) البطاقة «%» بصيغة «%» خارج الأربع المسموحة', v_s.key, v_s.format;
    end if;
    if coalesce(btrim(v_s.label), '') = '' or coalesce(btrim(v_s.help), '') = '' then
      raise exception '(ك-٣) البطاقة «%» بلا عنوان أو بلا نص إرشادي', v_s.key;
    end if;
  end loop;

  if v_n = 0 then
    raise exception '(ك-٣) القسم السابع لم يُرجع بطاقة واحدة';
  end if;

  select string_agg(t.key, '، ') into v_bad
  from (
    select s.key from public.section_stats('discounts', v_day - 29, v_day) s
    group by s.key having count(*) > 1
  ) t;
  if v_bad is not null then
    raise exception '(ك-٣) مفاتيح مكررة في بطاقات الخصومات: %', v_bad;
  end if;

  -- (ك-٤) «كوبونات فعّالة الآن» لقطة لحظية ⇒ delta = null بصدق لا صفراً
  select s.delta_percent into v_amount
  from public.section_stats('discounts', v_day, v_day) s where s.key = 'active_coupons';
  if v_amount is not null then
    raise exception '(ك-٤) delta لبطاقة لقطة لحظية = % — المتوقع null', v_amount;
  end if;

  -- (ك-٥) والقسم المجهول ما زال يرمي exception (لم تُفتح الدالة على مصراعيها)
  v_raised := false;
  begin
    perform 1 from public.section_stats('coupons', v_day, v_day);
  exception
    when others then
      v_raised := true;
  end;
  if not v_raised then
    raise exception '(ك-٥) قسم مجهول «coupons» قُبِل — خطأ إملائي في اسم قسم سيمرّ سنة بلا انتباه';
  end if;

  raise notice '✔ (ك) القسم السابع: الفارق عن خط الأساس مضبوط، والبطاقات مطابقة لعقد StatCard';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ل) البانرات: الزائر يرى المفعَّل داخل نافذته وحده
-- ----------------------------------------------------------------------------
do $$
declare
  v_n integer;
begin
  insert into public.promo_banners (title, body, coupon_code, placement, enabled, sort)
  values ('DISCOUNT_TESTS بانر ظاهر', 'نص', 'DTEST-E2E', 'home', true, 900);

  insert into public.promo_banners (title, body, placement, enabled, sort)
  values ('DISCOUNT_TESTS بانر مطفأ', 'نص', 'home', false, 901);

  insert into public.promo_banners (title, body, placement, enabled, sort, ends_at)
  values ('DISCOUNT_TESTS بانر منتهٍ', 'نص', 'home', true, 902, now() - interval '1 hour');

  if not exists (select 1 from pg_roles where rolname = 'anon') then
    raise notice '  ↳ (ل) لا دور anon — الفحص الحي متخطّى';
    return;
  end if;

  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claims', '', false);

  begin
    execute 'set local role anon';
    execute 'select count(*) from public.promo_banners where title like ''DISCOUNT_TESTS%''' into v_n;
    execute 'reset role';
  exception
    when others then
      execute 'reset role';
      raise;
  end;

  if v_n <> 1 then
    raise exception '(ل) الزائر يرى % بانراً من الثلاثة — المتوقع ١ (المفعَّل داخل نافذته وحده)', v_n;
  end if;

  raise notice '✔ (ل) البانرات: الزائر يرى المفعَّل داخل نافذته فقط، ولا يرى المطفأ ولا المنتهي';
end;
$$;

-- ----------------------------------------------------------------------------
-- (م) الاستعادة والتنظيف — إعدادات الخصم تعود كما كانت بالضبط
--
-- النظام مطفأ في البذرة (قرار ١٠)، وهذا الملف شغّله مؤقتاً. تركُه مفعَّلاً بعد
-- تشغيل اختبارات يعني حملة بدأت بلا قرار بشري — وهو بالضبط ما يمنعه القرار.
-- ----------------------------------------------------------------------------
do $$
declare
  v_saved jsonb := current_setting('tours.dt_saved')::jsonb;
begin
  delete from public.coupon_redemptions r where r.code like 'DTEST-%';
  delete from public.coupon_redemptions r
   where r.booking_id in (select b.id from public.bookings b
                           where b.trip ->> 'notes' like 'DISCOUNT_TESTS_FIXTURE%');
  delete from public.bookings b where b.trip ->> 'notes' like 'DISCOUNT_TESTS_FIXTURE%';
  delete from public.coupons c where c.code like 'DTEST-%' or c.note = 'DISCOUNT_TESTS';
  delete from public.promo_banners p where p.title like 'DISCOUNT_TESTS%';
  delete from public.tariffs t
   where t.class_id in (select vc.id from public.vehicle_classes vc where vc.slug like 'dtest-%');
  delete from public.vehicle_classes vc where vc.slug like 'dtest-%';

  update public.discount_settings
     set enabled                           = (v_saved ->> 'enabled')::boolean,
         max_percent                       = (v_saved ->> 'max_percent')::numeric,
         min_margin_percent_after_discount = (v_saved ->> 'min_margin_percent_after_discount')::numeric,
         min_margin_amount_after_discount  = (v_saved ->> 'min_margin_amount_after_discount')::numeric,
         verify_rate_limit_per_minute      = (v_saved ->> 'verify_rate_limit_per_minute')::integer
   where id;

  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claims', '', false);

  raise notice '✔ (م) التجهيزات مُزالة وإعدادات الخصم مُستعادة (enabled = %)',
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
  select count(*)::integer into v_n from public.coupons c where c.code like 'DTEST-%';
  if v_n <> 0 then
    raise exception 'تنظيف ناقص: % كوبون اختباري باقٍ', v_n;
  end if;

  select count(*)::integer into v_n
  from public.bookings b where b.trip ->> 'notes' like 'DISCOUNT_TESTS_FIXTURE%';
  if v_n <> 0 then
    raise exception 'تنظيف ناقص: % حجز اختباري باقٍ', v_n;
  end if;

  select count(*)::integer into v_n
  from public.vehicle_classes vc where vc.slug like 'dtest-%';
  if v_n <> 0 then
    raise exception 'تنظيف ناقص: % فئة سيارة اختبارية باقية', v_n;
  end if;

  raise notice 'ALL PASSED — الكوبونات تُطبَّق وتُرفض، والخصم يُقلَّص عند أرضية الهامش ولا يخترق min_price، والسقف ذرّي، والزائر محجوب، والقسم السابع صحيح';
end;
$$;
