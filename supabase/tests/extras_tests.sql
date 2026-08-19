-- ============================================================================
-- extras_tests.sql — اختبارات قبول للدفعة ٣: جراحة التسعير الواحدة
--                    (هجرة 0031_trip_extras.sql — الملاحظتان ٧ و٨)
--
-- كيف تشغّله:  `node scripts/db-test.mjs extras`  أو الصق الملف كاملاً في SQL
-- Editor بدور صاحب القاعدة واضغط Run. النجاح = آخر سطر «ALL PASSED»، وأي فشل
-- يرمي exception برسالة عربية تسمّي التأكيد والمتوقع والفعلي.
--
-- ومن psql **لا بد** من ON_ERROR_STOP و‑1 معاً (psql بدونهما يتابع بعد الكتلة
-- الفاشلة فيطبع «ALL PASSED» رغم الفشل):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f supabase/tests/extras_tests.sql
--
-- ── لماذا لا يبقى من هذا الملف أثر واحد في القاعدة ──────────────────────────
--
-- المُشغّل يرسل الملف كله **استعلاماً بسيطاً واحداً** ⇒ معاملة ضمنية واحدة على
-- قاعدة **حيّة**. ولذلك كل ما يكتب صفاً يراه المالك — كتالوج خدمات، فئة سيارة،
-- متعهد، حجز — أو يقلب إعداداً عاماً — الذروة، إعدادات الخصم — يعيش داخل كتلة
-- **تُلغي نفسها** برمي `ROLLBACK_MARKER` والتقاطه:
--
--   do $$ begin  … ;  raise exception 'ROLLBACK_MARKER';
--     exception when others then
--       if sqlerrm <> 'ROLLBACK_MARKER' then raise; end if; end $$;
--
-- فحتى النجاح لا يترك شيئاً — والقسم الأخير يتحقق من ذلك بدل أن يَعِد به.
-- والإشعارات تخرج إلى العميل لحظة رفعها فلا يبتلعها التراجع.
--
-- ── منهج الملف (نفس منهج quote_tests و discount_tests) ──────────────────────
--
--   • **لا رقم محفور واحد في تأكيدات المال.** كل متوقَّع يُشتق من مدخلات المحرك
--     نفسه: `tariffs` و`pricing_settings` و`apply_discount` و`extra_services`.
--     فتعديل المالك لأي معيار من اللوحة لا يُسقط الملف.
--   • **إحداثيات صحراوية نائية** (٢٥٫٠، ٢٧٫٥) ← (٢٤٫٥، ٢٨٫٢): لا قائمة أسعار
--     حقيقية تغطيها، فالتسعير بالتعريفة حتماً ولا يتأثر بأي متعهد حقيقي.
--   • **فئات سيارات بسعة ٦٠+**: لا فئة حقيقية تبلغها (الباص ٥٠)، فتجهيزنا معزول
--     تماماً عن أي تسعير حيّ ولا يزاحم فئةً حقيقية في «أول فئتين».
--   • **كل فحص سالب يسبقه شاهد إيجابي** — وإلا كان مسباراً أعمى يمرّ دائماً
--     (النمط ٩ في `handover/LESSONS.md`).
--
-- ── ما تثبّته هذه المجموعة (وما يجب أن تحمرّ لأجله) ─────────────────────────
--
--   (٠)  الشروط المسبقة
--   (أ)  `derive_waiting_hours` — الصفر واليوم الآخر والتقريب لأعلى والسقف ١٢
--   (ب)  الصلاحيات كتالوجياً — والزائر لا ينفّذ create_booking ولا التاسعة
--   (ج)  الكتلة الملغية لنفسها، وفيها:
--        ج-١ `price_extras`: المجهول والمُطفأ والكمية ≤ 0 والقصّ والتكرار
--        ج-٢ أهلية الحقائب في العرض **وفي الحجز**
--        ج-٣ 🔒 **الطبقات** — الخصم على الرحلة، والذروة لا تمسّ الخدمة
--        ج-٤ الزائر حيّاً: يقرأ الكتالوج ويسعّره، ولا يحجز ولا يرى التاسعة
--        ج-٥ `create_booking`: تاريخ العودة يُتحقَّق ويُرفض
--        ج-٦ الانتظار المشتق **أرضية لا استبدال**
--        ج-٧ 🔒 **الهامش بلا مساس** · اللقطة مجمَّدة · العربون من الإجمالي
--   (د)  لم يبقَ أثر
--
-- المرجع: `lib/extras-types.ts` (العقد) · `supabase/migrations/0031_trip_extras.sql`
--         · `handover/DECISIONS.md` (D-09 · D-11 · D-12 · D-18 · D-38).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (٠) الشروط المسبقة — تفشل هنا بوضوح بدل أن تفشل لاحقاً بغموض
-- ----------------------------------------------------------------------------
do $$
declare
  v_missing text;
  v_n       integer;
begin
  -- الهوية تُفرَّغ أولاً: بقيةُ مطالبة jwt من ملف سابق تجعل `is_admin()` تكذب
  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claims', '', false);

  select string_agg(x.rel, '، ') into v_missing
  from (values
    ('public.extra_services'), ('public.booking_extras'),
    ('public.vehicle_classes'), ('public.tariffs'), ('public.bookings'),
    ('public.subcontractors'), ('public.price_lists'), ('public.price_list_items'),
    ('public.coupons'), ('public.discount_settings'), ('public.pricing_settings')
  ) as x(rel)
  where to_regclass(x.rel) is null;

  if v_missing is not null then
    raise exception 'شرط مسبق: كائنات مفقودة (نفّذ 0031_trip_extras.sql أولاً): %', v_missing;
  end if;

  select string_agg(x.sig, '، ') into v_missing
  from (values
    ('public.public_extras()'),
    ('public.price_extras(jsonb)'),
    ('public.derive_waiting_hours(timestamptz, timestamptz)'),
    ('public.quote_price(numeric, integer, boolean, numeric, numeric, numeric, numeric, numeric, integer, jsonb)'),
    ('public.quote_public(numeric, integer, boolean, numeric, numeric, numeric, numeric, numeric, text, integer, jsonb, jsonb)'),
    ('public.create_booking(jsonb, jsonb, integer, boolean, numeric, numeric, numeric, text, text, text, text, text, text, timestamptz, text, text, timestamptz, integer, jsonb, integer, text, jsonb)'),
    ('public.apply_discount(text, numeric, text, numeric, text)'),
    ('public.get_booking_by_token(text)'),
    ('public.haversine_km(numeric, numeric, numeric, numeric)')
  ) as x(sig)
  where to_regprocedure(x.sig) is null;

  if v_missing is not null then
    raise exception 'شرط مسبق: دوال مفقودة بتواقيع 0031: %', v_missing;
  end if;

  -- 🔒 التواقيع القديمة يجب أن تكون قد أُسقطت، وإلا صار كل نداء بالعدد القديم
  -- من المعاملات ملتبساً فيفشل بـ «function is not unique» **وقت النداء**.
  if to_regprocedure('public.quote_price(numeric, integer, boolean, numeric, numeric, numeric, numeric, numeric)') is not null then
    raise exception 'شرط مسبق: التوقيع الثماني لـ quote_price ما زال موجوداً';
  end if;
  if to_regprocedure('public.quote_public(numeric, integer, boolean, numeric, numeric, numeric, numeric, numeric, text)') is not null then
    raise exception 'شرط مسبق: التوقيع التساعي لـ quote_public ما زال موجوداً';
  end if;

  -- عمود الحقائب موجود فعلاً (كل القسم ج-٢ يقوم عليه)
  select count(*)::integer into v_n
  from information_schema.columns c
  where c.table_schema = 'public' and c.table_name = 'vehicle_classes'
    and c.column_name = 'luggage_capacity';
  if v_n <> 1 then
    raise exception 'شرط مسبق: vehicle_classes.luggage_capacity غير موجود';
  end if;

  select count(*) into v_n from public.pricing_settings;
  if v_n <> 1 then
    raise exception 'شرط مسبق: pricing_settings يجب أن يحوي صفاً واحداً (وجدنا %)', v_n;
  end if;

  select count(*) into v_n from public.discount_settings;
  if v_n <> 1 then
    raise exception 'شرط مسبق: discount_settings يجب أن يحوي صفاً واحداً (وجدنا %)', v_n;
  end if;

  -- 🔒 عزل التجهيز: لا فئة **حقيقية** تبلغ سعة ٦٠، فتجهيزنا (٦٠/٦١/٦٢) لا
  -- يزاحم فئةً حيّة في «أول فئتين» ولا يتأثر بها. لو ولدت فئة كهذه يوماً فهذا
  -- الملف يقول ذلك صراحةً بدل أن يفشل برسالة غامضة في ج-٢.
  select count(*)::integer into v_n
  from public.vehicle_classes vc
  where vc.capacity >= 60 and vc.slug not like 'tx-%';
  if v_n > 0 then
    raise exception
      'شرط مسبق: توجد % فئة سيارة حقيقية بسعة ٦٠ أو أكثر — عايِر سعات تجهيز هذا الملف (tx-lug-small/big وtx-margin) فوقها', v_n;
  end if;

  -- الإعدادات العامة تُصوَّر **قبل** أي قلب، ليقارنها القسم (د) بما بعد التراجع.
  -- التصوير في كتلة ناجحة لا تتراجع، فالقيمة تعيش إلى آخر الملف.
  perform set_config('tours.tx_settings', (
    select jsonb_build_object(
             'peak_enabled', ps.peak_enabled,
             'peak_percent', ps.peak_percent,
             'disc_enabled', ds.enabled,
             'disc_max',     ds.max_percent,
             'disc_amt',     ds.min_margin_amount_after_discount,
             'disc_pct',     ds.min_margin_percent_after_discount
           )::text
    from public.pricing_settings ps
    cross join public.discount_settings ds
    limit 1
  ), false);

  raise notice '✔ (٠) الشروط المسبقة سليمة — كائنات 0031 موجودة، والتجهيز معزول، والإعدادات مصوَّرة للمقارنة';
end;
$$;

-- ----------------------------------------------------------------------------
-- (أ) `derive_waiting_hours` — دالة صافية لا تكتب شيئاً، فلا حاجة إلى تراجع
--
-- القاعدة من العقد: صفر بلا عودة أو حين تكون العودة في **يوم قاهريّ آخر**
-- (معامل الذهاب والعودة وحده يسعّرها)، وإلا `ceil` الفارق بسقف ١٢
-- (`MAX_DERIVED_WAITING_HOURS` في `lib/extras-types.ts`).
--
-- ⚠ التواريخ تُبنى **بتوقيت القاهرة صراحةً** لا بإزاحة رقمية: مصر أعادت التوقيت
-- الصيفي في 2023، فـ «+02» ليست القاهرة في كل شهور السنة، وتثبيتُها كان سيجعل
-- اختبار «اليوم نفسه» يقيس شيئاً آخر نصف العام.
-- ----------------------------------------------------------------------------
do $$
declare
  v_day  date;
  v_pick timestamptz;
  v_h    numeric;
begin
  v_day  := (now() at time zone 'Africa/Cairo')::date + 3;
  v_pick := (v_day::timestamp + time '09:00') at time zone 'Africa/Cairo';

  -- (أ-١) شاهد إيجابي أولاً: الدالة تُرجع رقماً موجباً لحالة صحيحة، وإلا فكل
  --       «صفر» بعده لا يعني شيئاً.
  v_h := public.derive_waiting_hours(v_pick, v_pick + interval '3 hours');
  if v_h is distinct from 3 then
    raise exception '(أ-١) ثلاث ساعات في اليوم نفسه أرجعت % والمتوقع ٣ — المسبار أعمى فلا تصدّق ما بعده', v_h;
  end if;

  -- (أ-٢) بلا عودة ⇒ صفر
  v_h := public.derive_waiting_hours(v_pick, null);
  if v_h is distinct from 0 then
    raise exception '(أ-٢) بلا تاريخ عودة: أرجعت % والمتوقع صفراً', v_h;
  end if;

  -- (أ-٣) بلا انطلاق ⇒ صفر
  v_h := public.derive_waiting_hours(null, v_pick + interval '2 hours');
  if v_h is distinct from 0 then
    raise exception '(أ-٣) بلا تاريخ انطلاق: أرجعت % والمتوقع صفراً', v_h;
  end if;

  -- (أ-٤) عودة ليست بعد الانطلاق ⇒ صفر (لا رقم سالب ولا انفجار)
  v_h := public.derive_waiting_hours(v_pick, v_pick);
  if v_h is distinct from 0 then
    raise exception '(أ-٤) عودة تساوي الانطلاق: أرجعت % والمتوقع صفراً', v_h;
  end if;
  v_h := public.derive_waiting_hours(v_pick, v_pick - interval '1 hour');
  if v_h is distinct from 0 then
    raise exception '(أ-٤) عودة قبل الانطلاق: أرجعت % والمتوقع صفراً', v_h;
  end if;

  -- (أ-٥) 🔒 التقريب إلى الساعة الأعلى — قرار معلن لا سهو (D-38: سعر الساعة
  --       ثابت بلا تدرّج، والساعة المبدوءة ساعةٌ مدفوعة).
  v_h := public.derive_waiting_hours(v_pick, v_pick + interval '2 hours 1 minute');
  if v_h is distinct from 3 then
    raise exception
      '(أ-٥) ساعتان ودقيقة واحدة يجب أن تُحتسب **٣ ساعات** (التقريب إلى الساعة الأعلى — D-38) وأرجعت %',
      v_h;
  end if;

  -- والساعتان بالضبط ساعتان: التقريب لأعلى ليس «زائد واحد دائماً»
  v_h := public.derive_waiting_hours(v_pick, v_pick + interval '2 hours');
  if v_h is distinct from 2 then
    raise exception '(أ-٥) ساعتان بالضبط أرجعت % والمتوقع ٢ — ceil صار زيادةً ثابتة', v_h;
  end if;

  -- (أ-٦) عودة في **يوم قاهريّ آخر** ⇒ صفر: السائق ينصرف ويعود، ومعامل الذهاب
  --       والعودة وحده هو ما يسعّرها. الفارق هنا أربع ساعات فقط — فلو كان الفحص
  --       على الفارق لا على اليوم لأرجعت ٤.
  v_h := public.derive_waiting_hours(
           (v_day::timestamp + time '22:00') at time zone 'Africa/Cairo',
           ((v_day + 1)::timestamp + time '02:00') at time zone 'Africa/Cairo');
  if v_h is distinct from 0 then
    raise exception
      '(أ-٦) عودة في يوم قاهريّ آخر (٢٢:٠٠ ← ٠٢:٠٠) أرجعت % والمتوقع صفراً — معامل العودة وحده يسعّرها',
      v_h;
  end if;

  -- (أ-٧) السقف ١٢ — خطأُ تاريخٍ لا يتحول إلى فاتورة فلكية
  v_h := public.derive_waiting_hours(
           (v_day::timestamp + time '06:00') at time zone 'Africa/Cairo',
           (v_day::timestamp + time '23:00') at time zone 'Africa/Cairo');
  if v_h is distinct from 12 then
    raise exception
      '(أ-٧) سبع عشرة ساعة في اليوم نفسه أرجعت % والمتوقع ١٢ (MAX_DERIVED_WAITING_HOURS)', v_h;
  end if;

  raise notice '✔ (أ) الانتظار المشتق: صفر بلا عودة وفي يوم آخر، وceil للساعة الأعلى، وسقف ١٢';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ب) الصلاحيات كتالوجياً — والفحص الحيّ بدور anon في (ج-٤)
--
-- المنح وحده لا يثبت السلوك، والسلوك وحده لا يثبت أن المنح لم يتسع بصمت — فكلاهما.
-- وكل فحص سالب هنا يسبقه شاهد إيجابي بنفس الآلية.
-- ----------------------------------------------------------------------------
do $$
declare
  v_ins text;
  v_sel text;
  v_cb  constant text :=
    'public.create_booking(jsonb, jsonb, integer, boolean, numeric, numeric, numeric, text, text, text, text, text, text, timestamptz, text, text, timestamptz, integer, jsonb, integer, text, jsonb)';
  v_qp9 constant text :=
    'public.quote_price(numeric, integer, boolean, numeric, numeric, numeric, numeric, numeric, integer, jsonb)';
  v_qpub constant text :=
    'public.quote_public(numeric, integer, boolean, numeric, numeric, numeric, numeric, numeric, text, integer, jsonb, jsonb)';
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    raise notice '  ↳ (ب) لا دور anon في هذه القاعدة — الفحص الكتالوجي متخطّى';
  else
    -- الشواهد الإيجابية: ما يجب أن ينفّذه الزائر ينفّذه فعلاً
    if not has_function_privilege('anon', 'public.public_extras()', 'execute') then
      raise exception '(ب-١) الزائر لا ينفّذ public_extras — كتالوج الخدمات لن يظهر في شاشة الحجز';
    end if;
    if not has_function_privilege('anon', 'public.price_extras(jsonb)', 'execute') then
      raise exception '(ب-١) الزائر لا ينفّذ price_extras — تسعير الاختيار سينتقل إلى المتصفح (نقض D-09)';
    end if;
    if not has_function_privilege('anon', v_qpub, 'execute') then
      raise exception '(ب-١) الزائر لا ينفّذ quote_public — التسعير العام تعطّل';
    end if;
    if not has_function_privilege('anon', 'public.derive_waiting_hours(timestamptz, timestamptz)', 'execute') then
      raise exception '(ب-١) الزائر لا ينفّذ derive_waiting_hours — الشاشة ستحسب الساعات في المتصفح فتنحرف عن الحجز';
    end if;

    -- والممنوع ممنوع: الحجز لعميل الخدمة وحده (د١ · D-09)
    if has_function_privilege('anon', v_cb, 'execute') then
      raise exception '(ب-٢) الزائر ينفّذ create_booking — نقضٌ لـ D-09: رحلات بطلب مصنوع يدوياً';
    end if;
    if has_function_privilege('authenticated', v_cb, 'execute') then
      raise exception '(ب-٢) المسجَّل ينفّذ create_booking — نقضٌ لـ D-09';
    end if;

    -- والتوقيع التاسع يكشف مصدر السعر والتكلفة والهامش (D-18)
    if has_function_privilege('anon', v_qp9, 'execute') then
      raise exception '(ب-٣) الزائر ينفّذ التوقيع التاسع لـ quote_price — يرى price_source والتكلفة والهامش';
    end if;
    if has_function_privilege('authenticated', v_qp9, 'execute') then
      raise exception '(ب-٣) المسجَّل ينفّذ التوقيع التاسع لـ quote_price — كل متعهد مستخدم authenticated';
    end if;
  end if;

  -- 🔒 (ب-٤) لا `insert` على `booking_extras` لأي **دور مستخدم** — المنفذ الوحيد
  -- `create_booking` (‏security definer) داخل معاملة الحجز نفسها.
  --
  -- الفحص من `relacl` لا بـ `has_table_privilege` وحدها: الأخيرة تحتاج اسم دور
  -- بعينه، بينما منحةٌ لـ PUBLIC تفتح الجدول لكل الأدوار الحالية والقادمة ولا
  -- تظهر في قائمة أسماء نعدّها بأيدينا. وشاهدٌ إيجابي أولاً: نفس الاستعلام على
  -- SELECT يجب أن يجد `authenticated` — وإلا فـ `relacl` فارغ والمسبار أعمى.
  --
  -- ⚠ **و`service_role` مستثنى بسبب مكتوب لا بتساهل:** Supabase تمنحه
  -- INSERT/UPDATE/DELETE/TRUNCATE افتراضياً على **كل** جدول في هذا المخطط —
  -- `bookings` و`payments` و`coupons` و`coupon_redemptions` سواءً بسواء — وهو
  -- مفتاح الخادم الذي لا يبلغه متصفح أصلاً (والحجز نفسه يُنشأ به). فتضمينُه هنا
  -- كان سيجعل هذا التأكيد يرسّب حالةً عامة للمنصة لا شيئاً أحدثته 0031، ثم
  -- يُسكَت بتعطيله فيُفقد المعنى كله. المقصود بـ«دور مستخدم» في هذا المستودع
  -- هو ما تبلغه حزمة المتصفح: PUBLIC و`anon` و`authenticated` — **وكل متعهد
  -- واحد من الأخيرين**. والفحص الملزِم للسلوك في (ج-٤-٦) بدور anon حيّاً.
  select string_agg(coalesce(r.rolname, 'PUBLIC'), '، ') into v_sel
  from pg_class c
  cross join lateral aclexplode(c.relacl) a
  left join pg_roles r on r.oid = a.grantee
  where c.oid = 'public.booking_extras'::regclass
    and a.privilege_type = 'SELECT'
    and a.grantee <> c.relowner;

  if v_sel is null or position('authenticated' in v_sel) = 0 then
    raise exception
      '(ب-٤) مسبار relacl لا يرى منحة SELECT الممنوحة لـ authenticated على booking_extras (وجد «%») — لا تصدّق الفحص السالب بعده',
      coalesce(v_sel, 'لا شيء');
  end if;

  select string_agg(distinct coalesce(r.rolname, 'PUBLIC') || ':' || a.privilege_type, '، ') into v_ins
  from pg_class c
  cross join lateral aclexplode(c.relacl) a
  left join pg_roles r on r.oid = a.grantee
  where c.oid = 'public.booking_extras'::regclass
    and a.privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
    and a.grantee <> c.relowner
    and coalesce(r.rolname, 'PUBLIC') <> 'service_role';

  if v_ins is not null then
    raise exception
      '(ب-٤) booking_extras قابلة للكتابة من دور مستخدم (%) — اللقطة المجمَّدة صارت قابلة لإعادة الكتابة من خارج create_booking',
      v_ins;
  end if;

  raise notice '✔ (ب) المنح: الزائر يقرأ الكتالوج ويسعّره ولا يحجز، ولا كتابة على لقطة booking_extras لأي دور';
end;
$$;

-- ============================================================================
-- (ج) الكتلة الملغية لنفسها — كل ما بعده يكتب صفوفاً أو يقلب إعداداً عاماً
--
-- تنتهي بـ `raise exception 'ROLLBACK_MARKER'` فيتراجع كل شيء: الكتالوج والفئات
-- والمتعهد والحجوزات والذروة وإعدادات الخصم. والقسم (د) يتحقق من التراجع.
-- ============================================================================
do $$
declare
  -- تجهيز ثابت المعرّفات (بادئة e5) كي يبقى التنظيف الدفاعي ممكناً
  v_cls_s   constant uuid := 'e5000000-0000-4000-8000-000000000001';  -- سعة ٦٠ · حقيبة ١
  v_cls_b   constant uuid := 'e5000000-0000-4000-8000-000000000002';  -- سعة ٦١ · حقائب ٩
  v_cls_m   constant uuid := 'e5000000-0000-4000-8000-000000000003';  -- سعة ٦٢ · مسار المتعهد
  v_sub     constant uuid := 'e5000000-0000-4000-8000-000000000004';
  v_list    constant uuid := 'e5000000-0000-4000-8000-000000000005';
  v_tag     constant text := 'TRIP_EXTRAS_FIXTURE';

  -- المسار الصحراوي: لا قائمة أسعار حقيقية تغطيه (المسافة المستقيمة ≈ ٩٠ كم)
  v_o_lat   constant numeric := 25.000000;
  v_o_lng   constant numeric := 27.500000;
  v_d_lat   constant numeric := 24.500000;
  v_d_lng   constant numeric := 28.200000;
  v_km      constant numeric := 100;
  v_cost    constant numeric := 1200;   -- تكلفة المتعهد في قائمة الأسعار

  v_seat_id    uuid;
  v_wifi_id    uuid;
  v_off_id     uuid;
  v_seat_price numeric;
  v_seat_max   integer;
  v_seat_title text;
  v_wifi_price numeric;

  v_peak    numeric;
  v_per_km  numeric;
  v_wait_pr numeric;

  v_day     date;
  v_pick    timestamptz;
  v_ret     timestamptz;

  v_sel     jsonb;
  v_qp      record;
  v_q       record;
  v_q0      record;
  v_d_right record;
  v_d_wrong record;
  v_elem    jsonb;

  v_x_total    numeric;
  v_x_expected numeric;
  v_ride       numeric;

  v_b_pos   record;
  v_b_wait1 record;
  v_b_wait2 record;
  v_m0      record;
  v_m1      record;
  v_m0_total  numeric;
  v_m0_margin numeric;
  v_m0_cost   numeric;
  v_row     record;
  v_trip    jsonb;
  v_trip_tk jsonb;

  v_pay     jsonb;
  v_pct     numeric;
  v_min     numeric;
  v_due_ok  numeric;
  v_due_bad numeric;

  v_slugs   text;
  v_n       integer;
  v_qty     integer;
  v_line    numeric;
  v_unit    numeric;
  v_title   text;
  v_total   numeric;
  v_bad     text;
  v_raised  boolean;
  v_hint    text;
  v_state   text;
  v_ok      boolean;
begin
  -- ── تنظيف دفاعي ────────────────────────────────────────────────────────────
  -- الكتلة تتراجع دائماً فلا يُفترض وجود بقايا؛ لكن تشغيلاً قديماً بنسخة أخرى من
  -- هذا الملف (أو لصقاً يدوياً في SQL Editor بلا تراجع) قد يترك صفوفاً.
  delete from public.booking_extras be
   where be.booking_id in (select b.id from public.bookings b where b.trip ->> 'notes' like v_tag || '%');
  delete from public.bookings b where b.trip ->> 'notes' like v_tag || '%';
  delete from public.price_list_items pli where pli.price_list_id = v_list;
  delete from public.price_lists pl where pl.id = v_list;
  delete from public.subcontractors s where s.id = v_sub;
  delete from public.coupons c where c.code like 'TX-%' or c.note = v_tag;
  delete from public.extra_services e where e.slug like 'tx-%';
  delete from public.tariffs t
   where t.class_id in (select vc.id from public.vehicle_classes vc where vc.slug like 'tx-%');
  delete from public.vehicle_classes vc where vc.slug like 'tx-%';

  -- ── الإعدادات العامة: الذروة مفعّلة، والخصم مفتوح بلا أرضيات ────────────────
  -- (الأرضيات مقاسة في `discount_tests.sql`؛ ما يقاس هنا هو **أساس** الخصم لا حده.)
  --
  -- 🔴 **والهامشُ يُثبَّت هنا كذلك، وهذا إصلاحُ حمرةٍ مقيسة (2026-08-17).** كان
  --    مثبَّتاً اثنان من ثلاثة، و`pricing_settings.margin_*` متروكاً لقيمة المالك
  --    الحيّة — وهي التي تصنع `discount_implied_cost`، أي الحدَّ المهيمن في
  --    `min_total`. وعند `margin_value = 1` (وقد ضبطه المالك كذلك فعلاً) تتساوى
  --    مساحةُ الخصم على الرحلة ومساحتُه على الإجمالي، فيرمي (ج-٣-٠) و(ج-٧-٠)
  --    والمجموعةُ كلها ترفض أن تبدأ — بلا أن ينكسر شيء. وهو النمط ٦ في
  --    `handover/LESSONS.md`: مجموعةٌ تحمرّ كلما غيّر المالك رقماً في لوحته.
  --
  --    والتثبيت داخل الكتلة المتراجعة، فلا صفَّ يُحفظ ولا قيمة تُستعاد يدوياً.
  update public.pricing_settings
     set peak_enabled = true, peak_percent = 15,
         margin_type = 'percent', margin_value = 20, margin_min_amount = 0
   where id;
  update public.discount_settings
     set enabled = true,
         max_percent = 100,
         min_margin_percent_after_discount = 0,
         min_margin_amount_after_discount = 0
   where id;
  -- وأرضيةُ البث ثالثةُ الحدود في `discount_floor_room` — وتركُها حيّةً يعيد
  -- العطب نفسه من بابٍ آخر (وهو ما وقع في `discount_tests` و`partner_credit_tests`).
  update public.dispatch_settings set min_margin_amount = 0 where id;

  select ps.peak_percent into v_peak from public.pricing_settings ps limit 1;
  if coalesce(v_peak, 0) <= 0 then
    raise exception '(ج-٠) نسبة الذروة % — كل تأكيدات «الذروة لا تمسّ الخدمة» بلا معنى بلا ذروة موجبة', v_peak;
  end if;

  -- ── فئات التجهيز الثلاث ────────────────────────────────────────────────────
  insert into public.vehicle_classes (id, slug, title, capacity, luggage_capacity, active, sort)
  values
    (v_cls_s, 'tx-lug-small', 'TRIP_EXTRAS فئة بحقيبة واحدة', 60, 1, true, 960),
    (v_cls_b, 'tx-lug-big',   'TRIP_EXTRAS فئة بتسع حقائب',   61, 9, true, 961),
    (v_cls_m, 'tx-margin',    'TRIP_EXTRAS فئة مسار المتعهد', 62, 9, true, 962);

  insert into public.tariffs (class_id, per_km, base_fee, min_price, waiting_hour_price, round_trip_factor)
  values
    (v_cls_s, 10, 0, 0, 50, 1.8),
    (v_cls_b, 10, 0, 0, 50, 1.8),
    (v_cls_m, 10, 0, 0, 50, 1.8);

  select t.per_km, t.waiting_hour_price into v_per_km, v_wait_pr
  from public.tariffs t where t.class_id = v_cls_b;

  -- ── تغطية متعهد **لفئة tx-margin وحدها** ───────────────────────────────────
  -- فتبقى tx-lug-big على مسار التعريفة (فيه يُختبر الخصم بلا تكلفة مرجعية)،
  -- وtx-margin على مسار المتعهد (وفيه وحده يوجد `margin_amount` أصلاً).
  insert into public.subcontractors (id, company_name, phone, status)
  values (v_sub, 'TRIP_EXTRAS متعهد الاختبار', '01000019000', 'approved');

  insert into public.price_lists (
    id, subcontractor_id, title,
    origin_label, origin_lat, origin_lng, origin_radius_km,
    dest_label,   dest_lat,   dest_lng,   dest_radius_km,
    bidirectional, status
  )
  values (
    v_list, v_sub, 'TRIP_EXTRAS قائمة صحراوية',
    'نقطة صحراوية أ', v_o_lat, v_o_lng, 5,
    'نقطة صحراوية ب', v_d_lat, v_d_lng, 5,
    true, 'approved'
  );

  insert into public.price_list_items (price_list_id, class_slug, cost)
  values (v_list, 'tx-margin', v_cost);

  -- ── كتالوج الخدمات ─────────────────────────────────────────────────────────
  -- الكتالوج الحقيقي يخرج من الهجرة **فارغاً** عمداً (لا أحد يعرف سعر كرسي
  -- الأطفال إلا المالك)، فالاختبار يملك بياناته كاملةً — النمط ٦ في LESSONS.
  insert into public.extra_services (slug, title, description, price, max_qty, active, sort)
  values ('tx-child-seat', 'TRIP_EXTRAS كرسي أطفال', 'وصف', 200, 3, true, 1)
  returning id, price, max_qty, title into v_seat_id, v_seat_price, v_seat_max, v_seat_title;

  insert into public.extra_services (slug, title, price, max_qty, active, sort)
  values ('tx-wifi', 'TRIP_EXTRAS واي فاي', 150, 1, true, 2)
  returning id, price into v_wifi_id, v_wifi_price;

  insert into public.extra_services (slug, title, price, max_qty, active, sort)
  values ('tx-off', 'TRIP_EXTRAS خدمة مُطفأة', 999, 5, false, 3)
  returning id into v_off_id;

  insert into public.coupons (code, kind, value, enabled, note)
  values ('TX-P10', 'percent', 10, true, v_tag);

  v_day  := (now() at time zone 'Africa/Cairo')::date + 3;
  v_pick := (v_day::timestamp + time '09:00') at time zone 'Africa/Cairo';
  v_ret  := v_pick + interval '2 hours 1 minute';   -- ⇒ انتظار مشتق = ٣ ساعات

  raise notice '  ↳ (ج-٠) التجهيز جاهز: ذروة %٪ · كم=% · ساعة انتظار=% · كرسي=% (حد %) · واي فاي=%',
    v_peak, v_per_km, v_wait_pr, v_seat_price, v_seat_max, v_wifi_price;

  -- ==========================================================================
  -- (ج-١) `price_extras` — الحساب في القاعدة، والحد مفروض فيها لا في المتصفح
  --
  -- ⚠ كل `line_total` يُقارن بـ **سعر الكتالوج × الكمية المتوقعة المحسوبة من
  -- `max_qty` في الجدول** — لا بـ `qty × unit_price` من نفس الصف: الأخير مرّ
  -- بالقصّ أصلاً فيؤكّد نفسه ولا يمكن أن يفشل (النمط ٩).
  -- ==========================================================================

  -- (ج-١-١) شاهد إيجابي: اختيار سليم يُسعَّر
  select x.qty, x.unit_price, x.line_total, x.title
    into v_qty, v_unit, v_line, v_title
  from public.price_extras('[{"slug":"tx-child-seat","qty":2}]'::jsonb) x;

  if v_qty is null then
    raise exception '(ج-١-١) price_extras لم تُرجع صفاً لخدمة مفعّلة — المسبار أعمى فلا تصدّق ما بعده';
  end if;
  if v_qty <> 2 or v_unit <> v_seat_price or v_line <> round(v_seat_price * 2, 2) then
    raise exception '(ج-١-١) كرسيّان: كمية=% سعر=% إجمالي=% — المتوقع ٢ و% و%',
      v_qty, v_unit, v_line, v_seat_price, round(v_seat_price * 2, 2);
  end if;
  if v_title is distinct from v_seat_title then
    raise exception '(ج-١-١) العنوان المُعاد «%» — المتوقع عنوان الكتالوج «%»', v_title, v_seat_title;
  end if;

  -- (ج-١-٢) رمز غير موجود يُتجاهَل بصمت — ولا يُسقط بقية الاختيار
  select count(*)::integer, coalesce(sum(x.line_total), 0)
    into v_n, v_line
  from public.price_extras('[{"slug":"tx-la-wojood-lah","qty":2},{"slug":"tx-child-seat","qty":1}]'::jsonb) x;
  if v_n <> 1 or v_line <> round(v_seat_price * 1, 2) then
    raise exception '(ج-١-٢) رمز مجهول مع رمز صحيح: صفوف=% إجمالي=% — المتوقع ١ و%',
      v_n, v_line, round(v_seat_price, 2);
  end if;

  -- (ج-١-٣) خدمة مُطفأة لا تُسعَّر — والشاهد الإيجابي أن الرمز نفسه يُسعَّر لو فُعّل
  select count(*)::integer into v_n
  from public.price_extras('[{"slug":"tx-off","qty":1}]'::jsonb) x;
  if v_n <> 0 then
    raise exception '(ج-١-٣) خدمة مُطفأة سُعِّرت (% صفاً) — المالك يطفئ ولا يُطفأ شيء', v_n;
  end if;

  update public.extra_services set active = true where id = v_off_id;
  select count(*)::integer into v_n
  from public.price_extras('[{"slug":"tx-off","qty":1}]'::jsonb) x;
  if v_n <> 1 then
    raise exception '(ج-١-٣) الرمز نفسه لم يُسعَّر بعد تفعيله (% صفاً) — الفحص السالب أعلاه كان بلا معنى', v_n;
  end if;
  update public.extra_services set active = false where id = v_off_id;

  -- (ج-١-٤) كمية ≤ 0 تُتجاهَل (لا خطأ ولا صف بقيمة صفر)
  select count(*)::integer into v_n
  from public.price_extras('[{"slug":"tx-child-seat","qty":0},{"slug":"tx-wifi","qty":-3}]'::jsonb) x;
  if v_n <> 0 then
    raise exception '(ج-١-٤) كمية صفر أو سالبة أنتجت % صفاً — المتوقع صفر', v_n;
  end if;

  -- (ج-١-٥) 🔒 القصّ على `max_qty` **في القاعدة**: تعديل الرقم في المتصفح لا يفيد
  select x.qty, x.line_total into v_qty, v_line
  from public.price_extras('[{"slug":"tx-child-seat","qty":9}]'::jsonb) x;
  if v_qty <> v_seat_max then
    raise exception '(ج-١-٥) كمية ٩ لم تُقصّ على max_qty: أرجعت % والمتوقع %', v_qty, v_seat_max;
  end if;
  if v_line <> round(v_seat_price * v_seat_max, 2) then
    raise exception '(ج-١-٥) إجمالي السطر % — المتوقع % (سعر الكتالوج % × الحد %)',
      v_line, round(v_seat_price * v_seat_max, 2), v_seat_price, v_seat_max;
  end if;
  if v_line = round(v_seat_price * 9, 2) then
    raise exception '(ج-١-٥) الإجمالي حُسب على الكمية المطلوبة ٩ لا على الحد % — القصّ في العرض لا في القاعدة', v_seat_max;
  end if;

  -- (ج-١-٦) 🔒 تكرار الرمز **لا يضاعف**: يُؤخذ الأكبر ثم يُقصّ، وإلا صار تكرار
  --         الرمز في المصفوفة التفافاً كاملاً على `max_qty`.
  select count(*)::integer, max(x.qty), coalesce(sum(x.line_total), 0)
    into v_n, v_qty, v_line
  from public.price_extras(
    '[{"slug":"tx-child-seat","qty":3},{"slug":"tx-child-seat","qty":3}]'::jsonb) x;
  if v_n <> 1 then
    raise exception '(ج-١-٦) الرمز المكرر أنتج % صفاً — المتوقع صفاً واحداً', v_n;
  end if;
  if v_qty <> v_seat_max or v_line <> round(v_seat_price * v_seat_max, 2) then
    raise exception '(ج-١-٦) تكرار «٣ ثم ٣»: كمية=% إجمالي=% — المتوقع % و% (لا جمعاً)',
      v_qty, v_line, v_seat_max, round(v_seat_price * v_seat_max, 2);
  end if;
  if v_line = round(v_seat_price * 6, 2) then
    raise exception '(ج-١-٦) الكميتان جُمعتا (٦ كراسٍ بحدٍّ %) — التفافٌ كامل على max_qty', v_seat_max;
  end if;

  -- والأكبر هو المأخوذ لا الأول ولا الأخير
  select x.qty into v_qty
  from public.price_extras(
    '[{"slug":"tx-child-seat","qty":1},{"slug":"tx-child-seat","qty":2}]'::jsonb) x;
  if v_qty <> 2 then
    raise exception '(ج-١-٦) «١ ثم ٢» أعطت % — المتوقع ٢ (الأكبر)', v_qty;
  end if;

  -- (ج-١-٧) كمية فلكية **تُقصّ ولا ترمي**: التحويل إلى integer قبل السقف كان
  --         يرمي «integer out of range» فيُسقط تسعير الاختيار كله بخطأ قاعدة.
  begin
    select x.qty, x.line_total into v_qty, v_line
    from public.price_extras('[{"slug":"tx-child-seat","qty":99999999999}]'::jsonb) x;
  exception
    when others then
      raise exception '(ج-١-٧) كمية فلكية رمت «%» بدل أن تُقصّ بصمت', sqlerrm;
  end;
  if v_qty <> v_seat_max or v_line <> round(v_seat_price * v_seat_max, 2) then
    raise exception '(ج-١-٧) كمية فلكية: كمية=% إجمالي=% — المتوقع % و%',
      v_qty, v_line, v_seat_max, round(v_seat_price * v_seat_max, 2);
  end if;

  raise notice '✔ (ج-١) price_extras: المجهول والمُطفأ والكمية ≤ 0 تُتجاهَل، والقصّ والتكرار والكمية الفلكية محروسة في القاعدة';

  -- ==========================================================================
  -- (ج-٢) أهلية الحقائب — شرطٌ ثانٍ مع الركاب، وموضعه `quote_price` وحدها (D-12)
  -- ==========================================================================

  -- (ج-٢-١) شاهد إيجابي: بلا حقائب تظهر الفئتان الأصغر سعةً
  select string_agg(q.class_slug, ',' order by q.capacity) into v_slugs
  from public.quote_price(v_km, 60, false, 0, v_o_lat, v_o_lng, v_d_lat, v_d_lng, 0) q;
  if v_slugs is distinct from 'tx-lug-small,tx-lug-big' then
    raise exception '(ج-٢-١) بلا حقائب: توقعنا tx-lug-small,tx-lug-big وحصلنا «%»',
      coalesce(v_slugs, 'لا شيء');
  end if;

  -- (ج-٢-٢) خمس حقائب: الفئة ذات الحقيبة الواحدة **لا تظهر إطلاقاً**
  select string_agg(q.class_slug, ',' order by q.capacity) into v_slugs
  from public.quote_price(v_km, 60, false, 0, v_o_lat, v_o_lng, v_d_lat, v_d_lng, 5) q;
  if position('tx-lug-small' in coalesce(v_slugs, '')) > 0 then
    raise exception
      '(ج-٢-٢) فئة سعتها حقيبة واحدة ظهرت لخمس حقائب («%») — الواجهة ستعرض فئةً يرفضها الحجز', v_slugs;
  end if;
  if position('tx-lug-big' in coalesce(v_slugs, '')) = 0 then
    raise exception '(ج-٢-٢) الفئة ذات التسع حقائب اختفت أيضاً («%») — الشرط يقصي الجميع', coalesce(v_slugs, 'لا شيء');
  end if;

  -- (ج-٢-٣) ورفع سعة الفئة يعيدها — الأهلية عن العمود لا عن اسم الفئة
  update public.vehicle_classes set luggage_capacity = 5 where id = v_cls_s;
  select string_agg(q.class_slug, ',' order by q.capacity) into v_slugs
  from public.quote_price(v_km, 60, false, 0, v_o_lat, v_o_lng, v_d_lat, v_d_lng, 5) q;
  if position('tx-lug-small' in coalesce(v_slugs, '')) = 0 then
    raise exception '(ج-٢-٣) رفع luggage_capacity إلى ٥ لم يُعِد الفئة («%»)', coalesce(v_slugs, 'لا شيء');
  end if;
  update public.vehicle_classes set luggage_capacity = 1 where id = v_cls_s;

  -- (ج-٢-٤) 🔒 وجانب الحجز: الواجهة تثق في العرض، والمال يعتمد على `create_booking`
  --         — فلو كانت الأهلية في العرض وحده لصار الحجز رخيصاً من نداءٍ مباشر.
  --         شاهد إيجابي أولاً: نفس النداء بحقيبة واحدة **ينجح**.
  select * into v_b_pos
  from public.create_booking(
    jsonb_build_object('label', 'نقطة صحراوية أ', 'lat', v_o_lat, 'lng', v_o_lng),
    jsonb_build_object('label', 'نقطة صحراوية ب', 'lat', v_d_lat, 'lng', v_d_lng),
    60, false, 0, v_km, 90, 'test', 'tx-lug-small', 'full',
    'عميل اختبار الحقائب', '01000019001', null, v_pick,
    v_tag || '-LUG-OK', null, null, 1, null);

  if v_b_pos.id is null then
    raise exception '(ج-٢-٤) الحجز بحقيبة واحدة لم ينجح — الشاهد الإيجابي ساقط فلا تصدّق الرفض بعده';
  end if;

  v_raised := false; v_hint := null;
  begin
    perform public.create_booking(
      jsonb_build_object('label', 'نقطة صحراوية أ', 'lat', v_o_lat, 'lng', v_o_lng),
      jsonb_build_object('label', 'نقطة صحراوية ب', 'lat', v_d_lat, 'lng', v_d_lng),
      60, false, 0, v_km, 90, 'test', 'tx-lug-small', 'full',
      'عميل اختبار الحقائب', '01000019002', null, v_pick,
      v_tag || '-LUG-BAD', null, null, 5, null);
  exception
    when others then
      v_raised := true;
      get stacked diagnostics v_hint = pg_exception_hint;
  end;

  if not v_raised then
    raise exception '(ج-٢-٤) create_booking قبِل فئةً لا تتسع للحقائب — الأهلية المزدوجة ليست في مسار الحجز';
  end if;
  if v_hint is distinct from 'class-unavailable' then
    raise exception '(ج-٢-٤) رمز الرفض «%» — المتوقع class-unavailable', coalesce(v_hint, 'بلا');
  end if;

  raise notice '✔ (ج-٢) الحقائب: الفئة غير الكافية لا تُعرض أصلاً، ويرفضها الحجز بـ class-unavailable';

  -- ==========================================================================
  -- (ج-٣) 🔒🔒 **الطبقات** — جوهر الدفعة كلها
  --
  --   ride_total = round(pre_peak × (1 + peak/100))      ← الذروة آخر خطوة
  --   ride_total = ride_total − discount_amount          ← الخصم على الرحلة وحدها
  --   total      = ride_total + extras_total             ← الخدمة طبقةٌ أخيرة
  --
  -- ثلاثة أشياء تُثبَت بأرقام حيّة لا بقراءة مصدر:
  --   (١) قيمة الخصم محسوبة على **إجمالي الرحلة** لا على الإجمالي مع الخدمات،
  --   (٢) الخدمات **لا تُضرب في الذروة**،
  --   (٣) الإجمالي = الرحلة بعد الخصم + الخدمات.
  -- ومن نقل الخدمات يوماً إلى داخل `pre_peak` يجب أن يُحمّر هذا القسم.
  -- ==========================================================================

  -- إجمالي الرحلة كما يبنيه المحرك — مصدر كل متوقَّع بعده
  select * into v_qp
  from public.quote_price(v_km, 60, false, 0, v_o_lat, v_o_lng, v_d_lat, v_d_lng, 0) q
  where q.class_slug = 'tx-lug-big';
  if not found then
    raise exception '(ج-٣-٠) المحرك لم يُرجع عرضاً للفئة tx-lug-big — التجهيز ساقط';
  end if;
  v_ride := v_qp.total;

  if v_qp.price_source is distinct from 'tariff' then
    raise exception
      '(ج-٣-٠) tx-lug-big سُعِّرت من مسار «%» لا من التعريفة — قائمة أسعار التجهيز تسرّبت إليها', v_qp.price_source;
  end if;
  if not v_qp.peak_applied then
    raise exception '(ج-٣-٠) الذروة غير مطبَّقة رغم تفعيلها — قياس «الذروة لا تمسّ الخدمة» بلا معنى';
  end if;

  -- والرقم نفسه مشتق من مدخلات المحرك: (كم × سعر الكيلو) ثم الذروة
  if v_ride is distinct from round((v_km * v_per_km) * (1 + v_peak / 100)) then
    raise exception '(ج-٣-٠) إجمالي الرحلة % ≠ round(% × % × (1 + %/100)) = %',
      v_ride, v_km, v_per_km, v_peak, round((v_km * v_per_km) * (1 + v_peak / 100));
  end if;

  -- الخدمات: كرسيّان
  v_sel := '[{"slug":"tx-child-seat","qty":2}]'::jsonb;
  select coalesce(sum(x.line_total), 0) into v_x_total from public.price_extras(v_sel) x;
  v_x_expected := round(v_seat_price * 2, 2);
  if v_x_total is distinct from v_x_expected then
    raise exception '(ج-٣-٠) مجموع الخدمات % — المتوقع %', v_x_total, v_x_expected;
  end if;

  -- التوقعان المتنافسان — كلاهما من `apply_discount` نفسها لا من صيغة مكتوبة بيد:
  --   الصحيح: الخصم على إجمالي **الرحلة**
  --   الخاطئ: الخصم على الإجمالي **بعد إضافة الخدمات**
  select * into v_d_right from public.apply_discount('TX-P10', v_ride, 'tx-lug-big', null, null);
  select * into v_d_wrong from public.apply_discount('TX-P10', v_ride + v_x_total, 'tx-lug-big', null, null);

  if not v_d_right.applied then
    raise exception
      '(ج-٣-٠) كوبون ١٠٪ لا يُطبَّق على إجمالي الرحلة % (سبب: %) — راجع أرضية البث في dispatch_config',
      v_ride, coalesce(v_d_right.rejection, 'بلا');
  end if;
  if v_d_right.amount = v_d_wrong.amount then
    raise exception
      '(ج-٣-٠) الخصم على الرحلة (%) يساوي الخصم على الإجمالي مع الخدمات (%) — التجهيز لا يفرّق بين الأساسين فالقسم كله غير حاسم',
      v_d_right.amount, v_d_wrong.amount;
  end if;

  select * into v_q
  from public.quote_public(v_km, 60, false, 0, v_o_lat, v_o_lng, v_d_lat, v_d_lng,
                           ' tx-p10 ', 0, v_sel) q
  where q.class_slug = 'tx-lug-big';
  if not found then
    raise exception '(ج-٣-١) quote_public لم تُرجع صفاً للفئة tx-lug-big';
  end if;

  -- (ج-٣-١) 🔒 الخدمات ليست داخل المعادلة: ما قبل الخصم هو إجمالي الرحلة بعينه
  if v_q.total_before_discount is distinct from v_ride then
    raise exception
      '(ج-٣-١) ما قبل الخصم % ≠ إجمالي الرحلة % — الخدمات دخلت المعادلة قبل الخصم',
      v_q.total_before_discount, v_ride;
  end if;
  -- وليس ما كانت ستكونه لو صارت الخدمات حدّاً داخل pre_peak (فتضربها الذروة)
  if v_q.total_before_discount = round((v_km * v_per_km + v_x_total) * (1 + v_peak / 100)) then
    raise exception
      '(ج-٣-١) ما قبل الخصم يساوي round((ما قبل الذروة + الخدمات) × الذروة) = % — الخدمة صارت حدّاً في المعادلة لا طبقةً بعدها',
      round((v_km * v_per_km + v_x_total) * (1 + v_peak / 100));
  end if;

  -- (ج-٣-٢) 🔒 الخصم محسوب على **الرحلة** لا على الإجمالي مع الخدمات
  if v_q.discount_amount is distinct from v_d_right.amount then
    raise exception
      '(ج-٣-٢) قيمة الخصم % — المتوقع % (خصم إجمالي الرحلة %)',
      v_q.discount_amount, v_d_right.amount, v_ride;
  end if;
  if v_q.discount_amount = v_d_wrong.amount then
    raise exception
      '(ج-٣-٢) قيمة الخصم % تساوي خصم الإجمالي مع الخدمات — الكوبون صار يخصم كرسي الأطفال (نقض قرار بدر ب)',
      v_q.discount_amount;
  end if;
  if not v_q.discount_applied or v_q.discount_code is distinct from 'TX-P10' then
    raise exception '(ج-٣-٢) الكوبون: applied=% code=% — المتوقع true و TX-P10 مطبَّعاً',
      v_q.discount_applied, coalesce(v_q.discount_code, 'بلا');
  end if;

  -- (ج-٣-٣) 🔒 الذروة **لا تمسّ** الخدمة: سعر الوحدة كما في الكتالوج حرفياً
  if v_q.extras_total is distinct from v_x_expected then
    raise exception '(ج-٣-٣) مجموع الخدمات % — المتوقع % (سعر الكتالوج × الكمية)',
      v_q.extras_total, v_x_expected;
  end if;
  if v_q.extras_total = round(v_x_expected * (1 + v_peak / 100), 2) then
    raise exception
      '(ج-٣-٣) مجموع الخدمات يساوي القيمة مضروبةً في الذروة (%) — كرسي الأطفال بـ% صار % في يوم الذروة',
      round(v_x_expected * (1 + v_peak / 100), 2), v_seat_price, round(v_seat_price * (1 + v_peak / 100), 2);
  end if;

  -- (ج-٣-٤) الترتيب النهائي: الرحلة بعد الخصم، ثم الخدمات فوقها
  if v_q.ride_total is distinct from round(v_ride - v_d_right.amount, 2) then
    raise exception '(ج-٣-٤) إجمالي الرحلة بعد الخصم % — المتوقع % − % = %',
      v_q.ride_total, v_ride, v_d_right.amount, round(v_ride - v_d_right.amount, 2);
  end if;
  if v_q.total is distinct from round(v_q.ride_total + v_q.extras_total, 2) then
    raise exception '(ج-٣-٤) الإجمالي % ≠ الرحلة بعد الخصم % + الخدمات %',
      v_q.total, v_q.ride_total, v_q.extras_total;
  end if;

  -- (ج-٣-٥) تفصيل الخدمات للواجهة: بلا `extra_id` (نفس مبدأ «بلا عمود داخلي»)
  if v_q.extras is null or jsonb_typeof(v_q.extras) <> 'array' or jsonb_array_length(v_q.extras) <> 1 then
    raise exception '(ج-٣-٥) تفصيل الخدمات ليس مصفوفةً من عنصر واحد: %', coalesce(v_q.extras::text, 'null');
  end if;
  v_elem := v_q.extras -> 0;
  if v_elem ->> 'slug' is distinct from 'tx-child-seat'
     or (v_elem ->> 'qty')::integer <> 2
     or (v_elem ->> 'unitPrice')::numeric <> v_seat_price
     or (v_elem ->> 'lineTotal')::numeric <> v_x_expected then
    raise exception '(ج-٣-٥) عنصر التفصيل غير مطابق للكتالوج: %', v_elem::text;
  end if;
  if jsonb_exists(v_elem, 'extraId') or jsonb_exists(v_elem, 'extra_id') then
    raise exception '(ج-٣-٥) تفصيل الخدمات يحمل معرّف الخدمة — نقضٌ لمبدأ «ما ليس في نوع الإرجاع لا يُسرَّب» (D-18)';
  end if;

  -- (ج-٣-٦) وبلا خدمات إطلاقاً: نفس سعر الرحلة حرفياً — فالإضافة إضافةٌ لا إعادة ترتيب
  select * into v_q0
  from public.quote_public(v_km, 60, false, 0, v_o_lat, v_o_lng, v_d_lat, v_d_lng,
                           ' tx-p10 ', 0, null) q
  where q.class_slug = 'tx-lug-big';

  if v_q0.total_before_discount is distinct from v_q.total_before_discount
     or v_q0.discount_amount is distinct from v_q.discount_amount
     or v_q0.ride_total is distinct from v_q.ride_total then
    raise exception
      '(ج-٣-٦) اختيار الخدمات غيّر سعر الرحلة نفسه: قبل=%/%/% وبعد=%/%/% — الطبقة ليست مستقلة',
      v_q0.total_before_discount, v_q0.discount_amount, v_q0.ride_total,
      v_q.total_before_discount, v_q.discount_amount, v_q.ride_total;
  end if;
  if v_q0.extras_total <> 0 or v_q0.total is distinct from v_q0.ride_total then
    raise exception '(ج-٣-٦) بلا خدمات: المجموع % والإجمالي % — المتوقع صفراً و%',
      v_q0.extras_total, v_q0.total, v_q0.ride_total;
  end if;

  raise notice
    '✔ (ج-٣) الطبقات: رحلة % ← خصم % ← خدمات % ⇒ إجمالي % (والخصم لم يمسّ الخدمة، والذروة لم تمسّها)',
    v_ride, v_q.discount_amount, v_q.extras_total, v_q.total;

  -- ==========================================================================
  -- (ج-٤) الزائر حيّاً — نفس المسار الذي يسلكه PostgREST
  --
  -- الشواهد الإيجابية أولاً وبنفس الجلسة: لو كان الدور مكسوراً لسقط الشاهد
  -- الإيجابي، فلا يمرّ منعٌ كاذب لأن كل شيء يفشل أصلاً.
  -- ==========================================================================
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    raise notice '  ↳ (ج-٤) لا دور anon — الفحص الحيّ متخطّى';
  else
    perform set_config('request.jwt.claim.sub', '', false);
    perform set_config('request.jwt.claims', '', false);

    begin
      execute 'set local role anon';

      -- ⚠ نصوص التنفيذ **مقتبسة بعلامة دولار** (`$q$…$q$`) لا بمضاعفة علامات
      -- الاقتباس: النداءات هنا تحمل jsonb ونصوصاً عربية وفواصل زمنية، ومضاعفة
      -- الاقتباس فيها تُنتج نصاً يفشل بخطأ **نحوي** — فيلتقطه معالج «others»
      -- ويصير الفحص السالب ناجحاً كاذباً. ولهذا نتحقق من رمز الحالة 42501 نفسه
      -- في كل منع، لا من مجرد وقوع خطأ.

      -- (ج-٤-١) الكتالوج العام: يرى المفعَّل ولا يرى المُطفأ
      execute $q$select count(*) from public.public_extras() e where e.slug = 'tx-child-seat'$q$ into v_n;
      if v_n <> 1 then
        raise exception '(ج-٤-١) الزائر لا يرى الخدمة المفعّلة في public_extras (% صفاً)', v_n;
      end if;
      execute $q$select count(*) from public.public_extras() e where e.slug = 'tx-off'$q$ into v_n;
      if v_n <> 0 then
        raise exception '(ج-٤-١) الزائر يرى خدمةً مُطفأة في public_extras (% صفاً)', v_n;
      end if;

      -- (ج-٤-٢) والتسعير يقع في القاعدة له أيضاً — بنفس الأرقام التي تراها اللوحة
      execute $q$select coalesce(sum(x.line_total), 0)
                 from public.price_extras('[{"slug":"tx-child-seat","qty":2}]'::jsonb) x$q$
        into v_line;
      if v_line is distinct from v_x_expected then
        raise exception '(ج-٤-٢) price_extras للزائر أرجعت % والمتوقع %', v_line, v_x_expected;
      end if;

      -- (ج-٤-٣) وquote_public بلا رمز تعمل له (شاهد إيجابي ثالث)
      execute format(
        $q$select count(*) from public.quote_public(%s, 60, false, 0, %s, %s, %s, %s, null, 0,
             '[{"slug":"tx-child-seat","qty":2}]'::jsonb)$q$,
        v_km, v_o_lat, v_o_lng, v_d_lat, v_d_lng) into v_n;
      if v_n < 1 then
        raise exception '(ج-٤-٣) الزائر لم يحصل على أي عرض من quote_public — التسعير العام تعطّل';
      end if;

      -- (ج-٤-٤) 🔒 ولا ينفّذ التوقيع التاسع لـ quote_price (يكشف التكلفة والهامش)
      v_ok := false; v_state := null;
      begin
        execute format(
          $q$select count(*) from public.quote_price(%s, 60, false, 0, %s, %s, %s, %s, 0)$q$,
          v_km, v_o_lat, v_o_lng, v_d_lat, v_d_lng) into v_n;
        v_ok := true;
      exception when others then
        get stacked diagnostics v_state = returned_sqlstate;
      end;
      if v_ok then
        raise exception '(ج-٤-٤) الزائر نفّذ التوقيع التاسع لـ quote_price — يقرأ price_source والتكلفة والهامش';
      end if;
      if v_state is distinct from '42501' then
        raise exception '(ج-٤-٤) فشل النداء بالرمز «%» لا 42501 — الاختبار غير حاسم', coalesce(v_state, 'بلا');
      end if;

      -- (ج-٤-٥) 🔒 ولا ينشئ حجزاً (د١ · D-09)
      v_ok := false; v_state := null;
      begin
        execute format(
          $q$select public.create_booking(
               jsonb_build_object('label', 'أ', 'lat', %s, 'lng', %s),
               jsonb_build_object('label', 'ب', 'lat', %s, 'lng', %s),
               1, false, 0, %s, 90, 'test', 'tx-lug-big', 'full',
               'زائر', '01000019009', null, now() + interval '3 days',
               %L, null)$q$,
          v_o_lat, v_o_lng, v_d_lat, v_d_lng, v_km, v_tag || '-ANON');
        v_ok := true;
      exception when others then
        get stacked diagnostics v_state = returned_sqlstate;
      end;
      if v_ok then
        raise exception '(ج-٤-٥) الزائر أنشأ حجزاً — نقضٌ لـ D-09 ولأخطر عيب أُصلح في المرحلة ٤';
      end if;
      if v_state is distinct from '42501' then
        raise exception '(ج-٤-٥) فشل create_booking للزائر بالرمز «%» لا 42501 — الاختبار غير حاسم', coalesce(v_state, 'بلا');
      end if;

      -- (ج-٤-٦) 🔒 ولا يكتب في لقطة الخدمات مباشرةً
      v_ok := false; v_state := null;
      begin
        execute $q$insert into public.booking_extras
                     (booking_id, extra_id, title_snapshot, qty, unit_price, line_total)
                   values (gen_random_uuid(), gen_random_uuid(), 'تسلل', 1, 1, 1)$q$;
        v_ok := true;
      exception when others then
        get stacked diagnostics v_state = returned_sqlstate;
      end;
      if v_ok then
        raise exception '(ج-٤-٦) الزائر أدرج صفاً في booking_extras — اللقطة المجمَّدة صارت مفتوحة';
      end if;
      if v_state is distinct from '42501' then
        raise exception '(ج-٤-٦) فشل الإدراج بالرمز «%» لا 42501 (فشلٌ لسبب آخر لا لسبب الصلاحية)', coalesce(v_state, 'بلا');
      end if;

      execute 'reset role';
    exception
      when others then
        execute 'reset role';
        raise;
    end;

    raise notice '✔ (ج-٤) الزائر حيّاً: يقرأ الكتالوج ويسعّره ويسعّر رحلته — ولا يرى التاسعة ولا يحجز ولا يكتب لقطة';
  end if;

  -- ==========================================================================
  -- (ج-٥) `create_booking` — تاريخ العودة يُتحقَّق **في SQL** (لا في TypeScript)
  -- ==========================================================================

  -- (ج-٥-١) عودة بلا انطلاق ⇒ رفض
  --
  -- ⚠ **والتلميح صار `pickup-required` لا `invalid-input` منذ 0081.** الحالة
  --   نفسها والرفض نفسه، لكن السبب المعلَن صار **أدقّ**: بعد قرار المالك «لا
  --   حجز بلا موعد» يقع حارس الموعد الغائب أولاً، فيسمّي الحقل الناقص بعينه
  --   بدل «راجع الحقول». والتأكيد يقيس ما يهمّ فعلاً — أن الطلب **لا يمرّ**.
  v_raised := false; v_hint := null;
  begin
    perform public.create_booking(
      jsonb_build_object('label', 'نقطة صحراوية أ', 'lat', v_o_lat, 'lng', v_o_lng),
      jsonb_build_object('label', 'نقطة صحراوية ب', 'lat', v_d_lat, 'lng', v_d_lng),
      60, false, 0, v_km, 90, 'test', 'tx-lug-big', 'full',
      'عميل اختبار التواريخ', '01000019003', null, null,
      v_tag || '-RET-NOPICK', null, v_ret, 0, null);
  exception
    when others then
      v_raised := true;
      get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if not v_raised then
    raise exception '(ج-٥-١) قُبِل تاريخ عودة بلا تاريخ انطلاق';
  end if;
  if v_hint is distinct from 'pickup-required' then
    raise exception '(ج-٥-١) رمز الرفض «%» — المتوقع pickup-required (0081)', coalesce(v_hint, 'بلا');
  end if;

  -- (ج-٥-٢) عودة ليست بعد الانطلاق ⇒ رفض (لا تجاهلاً صامتاً)
  v_raised := false; v_hint := null;
  begin
    perform public.create_booking(
      jsonb_build_object('label', 'نقطة صحراوية أ', 'lat', v_o_lat, 'lng', v_o_lng),
      jsonb_build_object('label', 'نقطة صحراوية ب', 'lat', v_d_lat, 'lng', v_d_lng),
      60, false, 0, v_km, 90, 'test', 'tx-lug-big', 'full',
      'عميل اختبار التواريخ', '01000019004', null, v_pick,
      v_tag || '-RET-BEFORE', null, v_pick - interval '1 hour', 0, null);
  exception
    when others then
      v_raised := true;
      get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if not v_raised then
    raise exception '(ج-٥-٢) قُبِل تاريخ عودة قبل الانطلاق — الحجز سيحمل انتظاراً صفراً والعميل يظن أنه دفع مقابله';
  end if;
  if v_hint is distinct from 'invalid-input' then
    raise exception '(ج-٥-٢) رمز الرفض «%» — المتوقع invalid-input', coalesce(v_hint, 'بلا');
  end if;

  -- (ج-٥-٣) 🔒 عودة على رحلة **ذهاب فقط** ⇒ رفض (حارس الجدول في 0032).
  --         المبرر: `derive_waiting_hours` تُصفّر الانتظار للعودة في يوم آخر لأن
  --         «معامل الذهاب والعودة هو ما يسعّرها» — فبلا المعامل لا يسعّرها شيء،
  --         والتاريخ مخزَّن في اللقطة يراه العميل والتشغيل فتُنفَّذ ساقُ عودة
  --         بلا ثمن. والواجهة لا تنتجه، لكن `/api/booking` كان يقبله.
  v_raised := false; v_hint := null;
  begin
    perform public.create_booking(
      jsonb_build_object('label', 'نقطة صحراوية أ', 'lat', v_o_lat, 'lng', v_o_lng),
      jsonb_build_object('label', 'نقطة صحراوية ب', 'lat', v_d_lat, 'lng', v_d_lng),
      60, false, 0, v_km, 90, 'test', 'tx-lug-big', 'full',
      'عميل اختبار ساق العودة', '01000019009', null, v_pick,
      v_tag || '-RET-ONEWAY', null, v_ret, 0, null);
  exception
    when others then
      v_raised := true;
      get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if not v_raised then
    raise exception '(ج-٥-٣) 🔒 قُبِل تاريخ عودة على رحلة ذهاب فقط — ساقُ عودة تُنفَّذ بلا ثمن';
  end if;
  if v_hint is distinct from 'invalid-input' then
    raise exception '(ج-٥-٣) رمز الرفض «%» — المتوقع invalid-input', coalesce(v_hint, 'بلا');
  end if;

  -- والشاهد الإيجابي: **نفس** المدخلات مع ذهاب وعودة تمرّ — فالرفض عن الشرط لا عن غيره
  perform public.create_booking(
    jsonb_build_object('label', 'نقطة صحراوية أ', 'lat', v_o_lat, 'lng', v_o_lng),
    jsonb_build_object('label', 'نقطة صحراوية ب', 'lat', v_d_lat, 'lng', v_d_lng),
    60, true, 0, v_km, 90, 'test', 'tx-lug-big', 'full',
    'عميل اختبار ساق العودة', '01000019010', null, v_pick,
    v_tag || '-RET-ROUND', null, v_ret, 0, null);

  raise notice '✔ (ج-٥) تاريخ العودة: يُرفض بلا انطلاق ويُرفض إن لم يكن بعده — والتحقق في القاعدة';

  -- ==========================================================================
  -- (ج-٦) الانتظار المشتق **أرضية لا استبدال**
  --
  --   المطلوب ١ والمشتق ٣  ⇒ يُسعَّر بـ٣ و`waitingDerived = true`
  --   المطلوب ٦ والمشتق ٣  ⇒ يُسعَّر بـ٦ و`waitingDerived = false`
  -- والتأكيد على **السعر** لا على اللقطة وحدها: رقمٌ مسجَّل لا يُسعَّر به لا يعني شيئاً.
  -- ==========================================================================
  select * into v_b_wait1
  from public.create_booking(
    jsonb_build_object('label', 'نقطة صحراوية أ', 'lat', v_o_lat, 'lng', v_o_lng),
    jsonb_build_object('label', 'نقطة صحراوية ب', 'lat', v_d_lat, 'lng', v_d_lng),
    60, true, 1, v_km, 90, 'test', 'tx-lug-big', 'full',
    'عميل اختبار الانتظار المشتق', '01000019005', null, v_pick,
    v_tag || '-WAIT-DERIVED', null, v_ret, 0, null);

  select b.trip, b.total into v_trip, v_total from public.bookings b where b.id = v_b_wait1.id;

  if (v_trip ->> 'waitingHours')::numeric is distinct from 3 then
    raise exception '(ج-٦-١) ساعات الانتظار المخزَّنة % — المتوقع ٣ (المشتق يعلو على المطلوب ١)',
      v_trip ->> 'waitingHours';
  end if;
  if (v_trip ->> 'waitingDerived')::boolean is distinct from true then
    raise exception '(ج-٦-١) waitingDerived = % — المتوقع true حين يفوز المشتق', v_trip ->> 'waitingDerived';
  end if;

  select q.total into v_total
  from public.quote_price(v_km, 60, true, 3, v_o_lat, v_o_lng, v_d_lat, v_d_lng, 0) q
  where q.class_slug = 'tx-lug-big';
  if v_b_wait1.total is distinct from v_total then
    raise exception '(ج-٦-١) إجمالي الحجز % ≠ تسعير ٣ ساعات انتظار % — الرقم سُجّل ولم يُسعَّر به',
      v_b_wait1.total, v_total;
  end if;

  select q.total into v_total
  from public.quote_price(v_km, 60, true, 1, v_o_lat, v_o_lng, v_d_lat, v_d_lng, 0) q
  where q.class_slug = 'tx-lug-big';
  if v_b_wait1.total = v_total then
    raise exception '(ج-٦-١) إجمالي الحجز يساوي تسعير الساعة الواحدة المطلوبة — الاشتقاق لم يُطبَّق أصلاً';
  end if;

  -- والعكس: المطلوب أكبر من المشتق ⇒ المطلوب يفوز، والمشتق أرضية لا سقف
  select * into v_b_wait2
  from public.create_booking(
    jsonb_build_object('label', 'نقطة صحراوية أ', 'lat', v_o_lat, 'lng', v_o_lng),
    jsonb_build_object('label', 'نقطة صحراوية ب', 'lat', v_d_lat, 'lng', v_d_lng),
    60, true, 6, v_km, 90, 'test', 'tx-lug-big', 'full',
    'عميل اختبار الانتظار المطلوب', '01000019006', null, v_pick,
    v_tag || '-WAIT-ASKED', null, v_ret, 0, null);

  select b.trip into v_trip from public.bookings b where b.id = v_b_wait2.id;

  if (v_trip ->> 'waitingHours')::numeric is distinct from 6 then
    raise exception
      '(ج-٦-٢) ساعات الانتظار % — المتوقع ٦: العميل طلب ست ساعات والمشتق ثلاث، والمشتق **أرضية لا استبدال**',
      v_trip ->> 'waitingHours';
  end if;
  if (v_trip ->> 'waitingDerived')::boolean is distinct from false then
    raise exception '(ج-٦-٢) waitingDerived = % — المتوقع false حين يفوز المطلوب', v_trip ->> 'waitingDerived';
  end if;

  select q.total into v_total
  from public.quote_price(v_km, 60, true, 6, v_o_lat, v_o_lng, v_d_lat, v_d_lng, 0) q
  where q.class_slug = 'tx-lug-big';
  if v_b_wait2.total is distinct from v_total then
    raise exception '(ج-٦-٢) إجمالي الحجز % ≠ تسعير ٦ ساعات %', v_b_wait2.total, v_total;
  end if;

  raise notice '✔ (ج-٦) الانتظار: المشتق يعلو على المطلوب الأصغر، والمطلوب الأكبر يفوز — والسعر يتبع الرقم الفائز';

  -- ==========================================================================
  -- (ج-٧) 🔒 الهامش بلا مساس · اللقطة مجمَّدة · العربون من الإجمالي كاملاً
  --
  -- حجزان **متطابقان في كل شيء** إلا الخدمات، على مسار متعهد (وهو المسار الوحيد
  -- الذي فيه `margin_amount` أصلاً). فالفرق بينهما يعزل أثر الخدمات وحده.
  -- ==========================================================================

  -- الهامش كما يحسبه المحرك — مصدر التوقع لا صيغةٌ مكتوبة بيد
  select * into v_qp
  from public.quote_price(v_km, 62, true, 3, v_o_lat, v_o_lng, v_d_lat, v_d_lng, 4) q
  where q.class_slug = 'tx-margin';
  if not found then
    raise exception '(ج-٧-٠) المحرك لم يُرجع عرضاً لـ tx-margin';
  end if;
  if v_qp.price_source is distinct from 'subcontractor' or v_qp.subcontractor_cost is null then
    raise exception
      '(ج-٧-٠) tx-margin لم تُسعَّر من مسار المتعهد (مصدر=% تكلفة=%) — قائمة أسعار التجهيز لا تطابق المسار، وقياس الهامش بلا معنى',
      v_qp.price_source, coalesce(v_qp.subcontractor_cost::text, 'بلا');
  end if;
  if v_qp.margin_amount is null or v_qp.margin_amount <= 0 then
    raise exception '(ج-٧-٠) الهامش المحسوب % — لا شيء لنحرسه', coalesce(v_qp.margin_amount::text, 'بلا');
  end if;

  -- حجز بلا خدمات
  select * into v_m0
  from public.create_booking(
    jsonb_build_object('label', 'نقطة صحراوية أ', 'lat', v_o_lat, 'lng', v_o_lng),
    jsonb_build_object('label', 'نقطة صحراوية ب', 'lat', v_d_lat, 'lng', v_d_lng),
    62, true, 0, v_km, 90, 'test', 'tx-margin', 'full',
    'عميل بلا خدمات', '01000019007', null, v_pick,
    v_tag || '-NOEXTRAS', null, v_ret, 4, null);

  -- وحجز مطابق له تماماً **إلا الخدمات** (كرسيّان + واي فاي)، وبخطة عربون
  v_sel := '[{"slug":"tx-child-seat","qty":2},{"slug":"tx-wifi","qty":1}]'::jsonb;
  select coalesce(sum(x.line_total), 0) into v_x_total from public.price_extras(v_sel) x;
  v_x_expected := round(v_seat_price * 2 + v_wifi_price * 1, 2);
  if v_x_total is distinct from v_x_expected then
    raise exception '(ج-٧-٠) مجموع خدمات الحجز % — المتوقع %', v_x_total, v_x_expected;
  end if;

  select * into v_m1
  from public.create_booking(
    jsonb_build_object('label', 'نقطة صحراوية أ', 'lat', v_o_lat, 'lng', v_o_lng),
    jsonb_build_object('label', 'نقطة صحراوية ب', 'lat', v_d_lat, 'lng', v_d_lng),
    62, true, 0, v_km, 90, 'test', 'tx-margin', 'deposit',
    'عميل بخدمات', '01000019008', null, v_pick,
    v_tag || '-EXTRAS', null, v_ret, 4, v_sel);

  -- (ج-٧-١) 🔒🔒 الهامش المخزَّن **لا يتغير بوجود الخدمات** (قرار بدر ب)
  select b.* into v_row from public.bookings b where b.id = v_m1.id;
  select b.margin_amount, b.subcontractor_cost, b.total
    into v_m0_margin, v_m0_cost, v_m0_total
  from public.bookings b where b.id = v_m0.id;

  if v_m0_margin is null then
    raise exception '(ج-٧-١) الحجز بلا خدمات خُزّن بلا هامش — لا شيء لنقارن به';
  end if;
  if v_row.margin_amount is distinct from v_m0_margin then
    raise exception
      '(ج-٧-١) هامش الحجز بخدمات % ≠ هامش الحجز المطابق بلا خدمات % — إيراد الخدمات دخل أساس الهامش (نقض قرار بدر ب)',
      v_row.margin_amount, v_m0_margin;
  end if;
  if v_row.margin_amount is distinct from v_qp.margin_amount then
    raise exception '(ج-٧-١) الهامش المخزَّن % ≠ ما يحسبه المحرك %', v_row.margin_amount, v_qp.margin_amount;
  end if;
  if v_row.subcontractor_cost is distinct from v_m0_cost then
    raise exception '(ج-٧-١) تكلفة المتعهد تغيّرت بوجود الخدمات: % ← %', v_m0_cost, v_row.subcontractor_cost;
  end if;

  -- والفرق بين الحجزين هو الخدمات بعينها — وإلا كان التأكيد أعلاه بلا معنى
  if v_m1.total is distinct from round(v_m0_total + v_x_expected, 2) then
    raise exception '(ج-٧-١) إجمالي الحجز بخدمات % ≠ إجمالي المطابق % + الخدمات %',
      v_m1.total, v_m0_total, v_x_expected;
  end if;

  -- (ج-٧-٢) العربون نسبةٌ من الإجمالي **بعد إضافة الخدمات** — نصيبٌ مما يدفعه العميل
  select s.value into v_pay from public.site_settings s where s.key = 'payment';
  v_pct := public.jsonb_number(v_pay, 'depositPercent', 30);
  v_min := public.jsonb_number(v_pay, 'depositMinAmount', 200);

  v_due_ok  := least(v_m1.total, greatest(round(v_m1.total * v_pct / 100), v_min));
  v_due_bad := least(v_m0_total, greatest(round(v_m0_total * v_pct / 100), v_min));

  if v_due_ok = v_due_bad then
    raise exception
      '(ج-٧-٢) العربون المحسوب على الإجمالي (%) يساوي المحسوب على الرحلة وحدها (%) بإعدادات هذه القاعدة (نسبة % وحد أدنى %) — التأكيد غير حاسم',
      v_due_ok, v_due_bad, v_pct, v_min;
  end if;
  if v_m1.amount_due is distinct from v_due_ok then
    raise exception '(ج-٧-٢) العربون % — المتوقع % (%٪ من الإجمالي % بحد أدنى %)',
      v_m1.amount_due, v_due_ok, v_pct, v_m1.total, v_min;
  end if;
  if v_m1.amount_remaining is distinct from round(v_m1.total - v_due_ok, 2) then
    raise exception '(ج-٧-٢) المتبقي % — المتوقع %', v_m1.amount_remaining, round(v_m1.total - v_due_ok, 2);
  end if;
  if v_m0.amount_due is distinct from v_m0.total or v_m0.amount_remaining <> 0 then
    raise exception '(ج-٧-٢) خطة full: المستحق % والباقي % — المتوقع % وصفراً',
      v_m0.amount_due, v_m0.amount_remaining, v_m0.total;
  end if;

  -- (ج-٧-٣) لقطة `booking_extras`: العنوان وسعر الوحدة مجمَّدان لحظة الحجز
  select count(*)::integer into v_n from public.booking_extras be where be.booking_id = v_m1.id;
  if v_n <> 2 then
    raise exception '(ج-٧-٣) سطور الخدمات للحجز % — المتوقع ٢', v_n;
  end if;
  select count(*)::integer into v_n from public.booking_extras be where be.booking_id = v_m0.id;
  if v_n <> 0 then
    raise exception '(ج-٧-٣) الحجز بلا خدمات كُتبت له % سطراً', v_n;
  end if;

  select be.title_snapshot, be.qty, be.unit_price, be.line_total
    into v_title, v_qty, v_unit, v_line
  from public.booking_extras be where be.booking_id = v_m1.id and be.extra_id = v_seat_id;

  if v_title is null then
    raise exception '(ج-٧-٣) لا سطر لكرسي الأطفال في لقطة الحجز';
  end if;
  if v_title is distinct from v_seat_title or v_qty <> 2
     or v_unit is distinct from v_seat_price or v_line is distinct from round(v_seat_price * 2, 2) then
    raise exception '(ج-٧-٣) سطر الكرسي: عنوان=«%» كمية=% وحدة=% إجمالي=% — المتوقع «%» و٢ و% و%',
      v_title, v_qty, v_unit, v_line, v_seat_title, v_seat_price, round(v_seat_price * 2, 2);
  end if;

  -- (ج-٧-٤) 🔒 تعديل الكتالوج غداً **لا يعيد كتابة حجز الأمس** (سابقة D-10)
  update public.extra_services
     set price = price + 777, title = title || ' — سعر جديد'
   where id in (v_seat_id, v_wifi_id);

  select be.title_snapshot, be.unit_price, be.line_total into v_title, v_unit, v_line
  from public.booking_extras be where be.booking_id = v_m1.id and be.extra_id = v_seat_id;

  if v_unit is distinct from v_seat_price or v_line is distinct from round(v_seat_price * 2, 2) then
    raise exception
      '(ج-٧-٤) تعديل سعر الكتالوج غيّر لقطة حجز قائم: الوحدة % والإجمالي % — كل كشف ربحية بأثر رجعي ينهار',
      v_unit, v_line;
  end if;
  if v_title is distinct from v_seat_title then
    raise exception '(ج-٧-٤) تعديل عنوان الخدمة غيّر عنوان اللقطة: «%» ← «%»', v_seat_title, v_title;
  end if;

  select b.total into v_total from public.bookings b where b.id = v_m1.id;
  if v_total is distinct from v_m1.total then
    raise exception '(ج-٧-٤) تعديل الكتالوج غيّر إجمالي حجز قائم: % ← %', v_m1.total, v_total;
  end if;

  -- (ج-٧-٥) 🔒 حذف خدمة مرجعية **مرفوض** — المالك يُطفئ ولا يحذف.
  --         وشاهد إيجابي أولاً: خدمة بلا مرجع تُحذف فعلاً، فالرفض عن المرجع لا
  --         عن منع حذفٍ شامل.
  delete from public.extra_services where id = v_off_id;
  if exists (select 1 from public.extra_services e where e.id = v_off_id) then
    raise exception '(ج-٧-٥) تعذّر حذف خدمة بلا مرجع — الشاهد الإيجابي ساقط فلا تصدّق الرفض بعده';
  end if;

  v_raised := false; v_state := null;
  begin
    delete from public.extra_services where id = v_seat_id;
  exception
    when others then
      v_raised := true;
      get stacked diagnostics v_state = returned_sqlstate;
  end;
  if not v_raised then
    raise exception '(ج-٧-٥) حُذفت خدمة مذكورة في حجز — ضاع تفسير سعرٍ قديم إلى الأبد';
  end if;
  if v_state is distinct from '23503' then
    raise exception '(ج-٧-٥) فشل الحذف بالرمز «%» لا 23503 — الرفض ليس من المفتاح الأجنبي', coalesce(v_state, 'بلا');
  end if;

  -- (ج-٧-٦) 🔒 لقطة `trip` — تخرج **كاملة** إلى anon عبر `get_booking_by_token`
  select b.trip into v_trip from public.bookings b where b.id = v_m1.id;

  -- شاهد إيجابي للمسبار: مفتاحٌ جديد ومفتاحٌ قديم يُريان معاً
  if not jsonb_exists(v_trip, 'extrasTotal') or not jsonb_exists(v_trip, 'originLat') then
    raise exception '(ج-٧-٦) مسبار مفاتيح trip لا يرى مفاتيحها — لا تصدّق الفحص السالب بعده';
  end if;

  select string_agg(x.k, '، ') into v_bad
  from (values ('returnAt'), ('luggage'), ('waitingDerived'), ('extrasTotal')) as x(k)
  where not jsonb_exists(v_trip, x.k);
  if v_bad is not null then
    raise exception '(ج-٧-٦) لقطة trip بلا المفاتيح: % — الواجهة لن تعرض العودة ولا الحقائب ولا الخدمات', v_bad;
  end if;

  if (v_trip ->> 'luggage')::integer is distinct from 4 then
    raise exception '(ج-٧-٦) trip.luggage = % — المتوقع ٤', v_trip ->> 'luggage';
  end if;
  if v_trip ->> 'returnAt' is null then
    raise exception '(ج-٧-٦) trip.returnAt فارغ رغم تمرير تاريخ عودة';
  end if;
  if (v_trip ->> 'returnAt')::timestamptz is distinct from v_ret then
    raise exception '(ج-٧-٦) trip.returnAt = % — المتوقع %', v_trip ->> 'returnAt', v_ret;
  end if;
  if (v_trip ->> 'extrasTotal')::numeric is distinct from v_x_expected then
    raise exception '(ج-٧-٦) trip.extrasTotal = % — المتوقع %', v_trip ->> 'extrasTotal', v_x_expected;
  end if;
  if (v_trip ->> 'waitingDerived')::boolean is distinct from true then
    raise exception '(ج-٧-٦) trip.waitingDerived = % — المتوقع true (المشتق ٣ ساعات والمطلوب صفر)',
      v_trip ->> 'waitingDerived';
  end if;

  -- ولا حقل داخلي واحد: لا تكلفة ولا هامش ولا معرّف خدمة
  select string_agg(t.k, '، ') into v_bad
  from jsonb_object_keys(v_trip) as t(k)
  where t.k ~* '(cost|margin|subcontractor|extraid|extra_id|payout|clamped|internal)';
  if v_bad is not null then
    raise exception
      '(ج-٧-٦) لقطة trip اكتسبت حقلاً داخلياً (%) — وهي تخرج كاملةً لحامل التوكن عبر get_booking_by_token',
      v_bad;
  end if;

  if position(v_seat_id::text in v_trip::text) > 0 then
    raise exception '(ج-٧-٦) معرّف خدمة الكتالوج ظاهر داخل لقطة trip — معرّف داخلي وصل إلى anon';
  end if;

  -- وما يصل حاملَ التوكن فعلاً هو نفسه لا نسخةٌ منقّحة في العرض
  select g.trip into v_trip_tk from public.get_booking_by_token(v_m1.public_token) g;
  if v_trip_tk is null then
    raise exception '(ج-٧-٦) get_booking_by_token لم تُرجع الحجز بتوكنه — المسبار أعمى';
  end if;
  if v_trip_tk is distinct from v_trip then
    raise exception '(ج-٧-٦) اللقطة الخارجة بالتوكن تخالف المخزَّنة — رقمان لشيء واحد';
  end if;

  raise notice
    '✔ (ج-٧) الهامش % بلا مساس · الإجمالي % = رحلة % + خدمات % · العربون % · اللقطة مجمَّدة والحذف مرفوض',
    v_row.margin_amount, v_m1.total, v_m0_total, v_x_expected, v_m1.amount_due;

  -- ── التراجع ────────────────────────────────────────────────────────────────
  raise exception 'ROLLBACK_MARKER';
exception
  when others then
    if sqlerrm <> 'ROLLBACK_MARKER' then
      raise;
    end if;
    raise notice '✔ (ج) الكتلة تراجعت بالكامل — لا كتالوج ولا فئات ولا حجوزات ولا إعدادات مقلوبة';
end;
$$;

-- ----------------------------------------------------------------------------
-- (د) لم يبقَ أثر — الوعد يُتحقق منه لا يُصدَّق
-- ----------------------------------------------------------------------------
do $$
declare
  v_n     integer;
  v_saved jsonb := current_setting('tours.tx_settings')::jsonb;
  v_now   jsonb;
begin
  select count(*)::integer into v_n from public.extra_services e where e.slug like 'tx-%';
  if v_n <> 0 then
    raise exception 'تنظيف ناقص: % خدمة اختبارية باقية في الكتالوج', v_n;
  end if;

  select count(*)::integer into v_n from public.vehicle_classes vc where vc.slug like 'tx-%';
  if v_n <> 0 then
    raise exception 'تنظيف ناقص: % فئة سيارة اختبارية باقية', v_n;
  end if;

  select count(*)::integer into v_n
  from public.bookings b where b.trip ->> 'notes' like 'TRIP_EXTRAS_FIXTURE%';
  if v_n <> 0 then
    raise exception 'تنظيف ناقص: % حجز اختباري باقٍ', v_n;
  end if;

  select count(*)::integer into v_n from public.coupons c where c.note = 'TRIP_EXTRAS_FIXTURE';
  if v_n <> 0 then
    raise exception 'تنظيف ناقص: % كوبون اختباري باقٍ', v_n;
  end if;

  select count(*)::integer into v_n
  from public.subcontractors s where s.company_name like 'TRIP_EXTRAS%';
  if v_n <> 0 then
    raise exception 'تنظيف ناقص: % متعهد اختباري باقٍ', v_n;
  end if;

  -- 🔒 والإعدادات العامة عادت كما كانت **بالضبط**: الذروة قُلبت وإعدادات الخصم
  -- فُتحت داخل الكتلة، وتركُ أيٍّ منهما مقلوباً بعد تشغيل اختبارات يعني حملةً
  -- بدأت — أو ذروةً سرت على كل سعر في الموقع — بلا قرار بشري (النمط ٧).
  select jsonb_build_object(
           'peak_enabled', ps.peak_enabled,
           'peak_percent', ps.peak_percent,
           'disc_enabled', ds.enabled,
           'disc_max',     ds.max_percent,
           'disc_amt',     ds.min_margin_amount_after_discount,
           'disc_pct',     ds.min_margin_percent_after_discount
         )
    into v_now
  from public.pricing_settings ps
  cross join public.discount_settings ds
  limit 1;

  if v_now is distinct from v_saved then
    raise exception 'الإعدادات العامة لم تعد كما كانت: قبل % وبعد %', v_saved::text, v_now::text;
  end if;

  raise notice 'ALL PASSED — الخدمة طبقةٌ بعد الذروة والخصم، والهامش وأساس الخصم بلا مساس، والحقائب شرطُ أهلية في العرض والحجز، والانتظار يُشتق أرضيةً لا استبدالاً، واللقطة مجمَّدة والزائر محجوب';
end;
$$;
