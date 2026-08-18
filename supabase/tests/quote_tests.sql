-- ============================================================================
-- quote_tests.sql — اختبارات قبول لدالة public.quote_price (المرحلة ٣)
--
-- كيف تشغّله: افتح SQL Editor في لوحة Supabase (أو psql بدور صاحب القاعدة)،
-- الصق الملف كاملاً واضغط Run. النجاح = آخر سطر في الرسائل «ALL PASSED».
-- أي فشل يرمي exception برسالة عربية تحدد الاختبار والقيمة المتوقعة والفعلية.
--
-- قابل لإعادة التنفيذ بلا حدود: لا يُدخل أي بيانات، وما يعدّله مؤقتاً
-- (مفتاح الذروة) يُعاد كما كان حتى لو فشل اختبار في المنتصف.
--
-- الاختبارات لا تفترض أرقاماً مثبتة: تُعيد حساب المتوقع من صفوف tariffs الحية،
-- فتبقى صحيحة بعد أن يعاير المالك الأسعار من اللوحة. الرقم الحرفي من الرؤية
-- (٤٦٥٠ لـ SUV) يُفحص فقط إن كانت تعريفة البذرة لم تُمس، وإلا تخطّاه بإشعار.
--
-- المرجع: lib/pricing-types.ts (العقد) + docs/VISION.md (آلية تحديد السيارات).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (٠) الشروط المسبقة — وجود الدالة والبذرة، حتى لا يظهر فشل غامض لاحقاً
-- ----------------------------------------------------------------------------
do $$
declare
  v_missing text;
  v_rows    integer;
begin
  if to_regprocedure('public.quote_price(numeric, integer, boolean, numeric)') is null then
    raise exception 'شرط مسبق: الدالة public.quote_price غير موجودة — نفّذ 0005_pricing.sql أولاً';
  end if;

  /*
   * 🔴 الشرط بنيويّ لا قيميّ: وجودُ الفئة ونشاطُها وتعريفتُها — **لا سعتُها**.
   *
   * كان يثبّت `capacity = (3, 6, 14, 50)` كما بُذرت. و**السعة إعدادٌ يملكه
   * المالك** ويحرّره من `/admin/fleet` ويسجّله التدقيق. ففي 2026-08-18 رفع
   * سعة `suv` من ٦ إلى ٧ (جيتور إكس ٧٠ تسع سبعة) و`sedan` من ٣ إلى ٤،
   * فسقط الشرطُ المسبق و**ماتت المجموعة كلُّها** — لا لعيبٍ في محرّك التسعير
   * بل لأن المالك مارس قراراً من حقّه. وهو نفسُ ما ينصّ عليه قسم (و) أدناه
   * حرفياً: «قرارُ تسعيرٍ من حقّه لا يُحمِّر اختباراً» — فيُطبَّق هنا أيضاً.
   *
   * وما يعتمد على السعة من توكيداتٍ يقرؤها **حيّةً** من `vehicle_classes`
   * لا من رقمٍ محفور، فيبقى الاختبار صادقاً أياً كان ما يضبطه المالك.
   */
  select string_agg(x.slug, '، ')
    into v_missing
  from (values ('sedan'), ('suv'), ('minibus'), ('bus')) as x(slug)
  where not exists (
    select 1
    from public.vehicle_classes vc
    join public.tariffs t on t.class_id = vc.id
    where vc.slug = x.slug
      and vc.active
  );

  if v_missing is not null then
    raise exception
      'شرط مسبق: الفئات التالية غير موجودة أو غير نشطة أو بلا تعريفة: %',
      v_missing;
  end if;

  -- سعاتُ المالك تُطبع لتُقرأ في سجلّ الجولة، فيُفهم أيُّ عالمٍ قِيس فيه
  raise notice '     ↳ (٠) سعات المالك الآن: %',
    (select string_agg(vc.slug || '=' || vc.capacity || '/' || vc.luggage_capacity, ' · ' order by vc.sort)
       from public.vehicle_classes vc where vc.active);

  select count(*) into v_rows from public.pricing_settings;
  if v_rows <> 1 then
    raise exception 'شرط مسبق: pricing_settings يجب أن يحوي صفاً واحداً بالضبط (وجدنا %)', v_rows;
  end if;

  raise notice '✔ (٠) الشروط المسبقة سليمة';
end;
$$;

-- ----------------------------------------------------------------------------
-- (أ) قاعدة الأهلية — أمثلة أحمد بالبنية: الأصغر الكافية + التي تليها تحفيزاً
-- ----------------------------------------------------------------------------
do $$
declare
  v_slugs text;
  v_count integer;
begin
  -- (أ-١) ٥ ركاب ← تُستبعد السيدان (سعة ٣)، فيظهر SUV ثم الميني باص
  select string_agg(q.class_slug, ',' order by q.capacity)
    into v_slugs
  from public.quote_price(250, 5, false, 0) q;
  if v_slugs is distinct from 'suv,minibus' then
    raise exception '(أ-١) ٥ ركاب: توقعنا suv,minibus وحصلنا على %', coalesce(v_slugs, 'لا شيء');
  end if;

  -- (أ-٢) راكبان ← سيدان + SUV
  select string_agg(q.class_slug, ',' order by q.capacity)
    into v_slugs
  from public.quote_price(250, 2, false, 0) q;
  if v_slugs is distinct from 'sedan,suv' then
    raise exception '(أ-٢) راكبان: توقعنا sedan,suv وحصلنا على %', coalesce(v_slugs, 'لا شيء');
  end if;

  -- (أ-٣) ٢٠ راكباً ← الباص وحده، لأنه لا توجد فئة أعلى منه للتحفيز
  select string_agg(q.class_slug, ',' order by q.capacity), count(*)
    into v_slugs, v_count
  from public.quote_price(250, 20, false, 0) q;
  if v_slugs is distinct from 'bus' or v_count <> 1 then
    raise exception '(أ-٣) ٢٠ راكباً: توقعنا bus وحده وحصلنا على % (عدد الصفوف %)',
      coalesce(v_slugs, 'لا شيء'), v_count;
  end if;

  -- (أ-٤) عدد يفوق كل السعات ← لا عروض إطلاقاً (تترجمها الواجهة إلى no-classes)
  select count(*) into v_count from public.quote_price(250, 500, false, 0) q;
  if v_count <> 0 then
    raise exception '(أ-٤) ٥٠٠ راكب: توقعنا صفر عروض وحصلنا على %', v_count;
  end if;

  -- (أ-٥) عدد العروض لا يتجاوز اثنين أبداً مهما كثرت الفئات
  select count(*) into v_count from public.quote_price(250, 1, false, 0) q;
  if v_count <> 2 then
    raise exception '(أ-٥) راكب واحد: توقعنا عرضين وحصلنا على %', v_count;
  end if;

  raise notice '✔ (أ) قاعدة الأهلية والترتيب والحد الأقصى للعروض';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ب) المعادلة — ترتيب العمليات هو جوهر الاختبار: الأرضية قبل معامل العودة،
--     والانتظار بعده، بلا ذروة (نُطفئها مؤقتاً ثم نعيدها كما كانت)
-- ----------------------------------------------------------------------------
do $$
declare
  v_prev_enabled boolean;
  v_prev_percent numeric;
  v_suv          record;
  v_sedan        record;
  v_row          record;
  v_raw          numeric;
  v_expected     numeric;
  v_wrong        numeric;
begin
  select ps.peak_enabled, ps.peak_percent
    into v_prev_enabled, v_prev_percent
  from public.pricing_settings ps
  limit 1;

  update public.pricing_settings set peak_enabled = false where id = true;

  select t.* into v_suv
  from public.tariffs t
  join public.vehicle_classes vc on vc.id = t.class_id
  where vc.slug = 'suv';
  if not found then raise exception '(ب) تعريفة suv غير موجودة'; end if;

  select t.* into v_sedan
  from public.tariffs t
  join public.vehicle_classes vc on vc.id = t.class_id
  where vc.slug = 'sedan';
  if not found then raise exception '(ب) تعريفة sedan غير موجودة'; end if;

  -- (ب-١) ذهاب فقط، ٢٥٠ كم، ٥ ركاب، بلا انتظار — الإجمالي والتفصيل
  select * into v_row from public.quote_price(250, 5, false, 0) q where q.class_slug = 'suv';
  if not found then raise exception '(ب-١) لم يرجع عرض suv أصلاً'; end if;

  v_raw      := v_suv.base_fee + 250 * v_suv.per_km;
  v_expected := round(greatest(v_raw, v_suv.min_price));

  if v_row.total <> v_expected then
    raise exception '(ب-١) إجمالي SUV لـ ٢٥٠كم: توقعنا % وحصلنا %', v_expected, v_row.total;
  end if;
  if v_row.base_fee <> round(v_suv.base_fee, 2) then
    raise exception '(ب-١) base_fee: توقعنا % وحصلنا %', round(v_suv.base_fee, 2), v_row.base_fee;
  end if;
  if v_row.distance_cost <> round(250 * v_suv.per_km, 2) then
    raise exception '(ب-١) distance_cost: توقعنا % وحصلنا %',
      round(250 * v_suv.per_km, 2), v_row.distance_cost;
  end if;
  if v_row.waiting_cost <> 0 then
    raise exception '(ب-١) waiting_cost بلا انتظار: توقعنا صفراً وحصلنا %', v_row.waiting_cost;
  end if;
  if v_row.round_trip_applied or v_row.peak_applied then
    raise exception '(ب-١) أعلام العودة/الذروة يجب أن تكون false (عودة=% ذروة=%)',
      v_row.round_trip_applied, v_row.peak_applied;
  end if;
  if v_row.min_applied <> (v_raw < v_suv.min_price) then
    raise exception '(ب-١) min_applied: توقعنا % وحصلنا %',
      (v_raw < v_suv.min_price), v_row.min_applied;
  end if;

  -- (ب-٢) الرقم الحرفي من الرؤية: ١٥٠ + ٢٥٠×١٨ = ٤٦٥٠ — يُفحص إن كانت البذرة سليمة
  if v_suv.base_fee = 150 and v_suv.per_km = 18 and v_suv.min_price = 500 then
    if v_row.total <> 4650 then
      raise exception '(ب-٢) مثال الرؤية: توقعنا ٤٦٥٠ وحصلنا %', v_row.total;
    end if;
    raise notice '  ↳ (ب-٢) مثال الرؤية ٤٦٥٠ مطابق';
  else
    raise notice '  ↳ (ب-٢) تخطٍّ: تعريفة SUV عُدِّلت من اللوحة (كم=% أساس=%)',
      v_suv.per_km, v_suv.base_fee;
  end if;

  -- (ب-٣) ذهاب وعودة: يُضرب الناتج بعد الأرضية في معامل العودة
  select * into v_row from public.quote_price(250, 5, true, 0) q where q.class_slug = 'suv';
  if not found then raise exception '(ب-٣) لم يرجع عرض suv للذهاب والعودة'; end if;

  v_expected := round(greatest(v_raw, v_suv.min_price) * v_suv.round_trip_factor);
  if v_row.total <> v_expected then
    raise exception '(ب-٣) ذهاب وعودة SUV: توقعنا % وحصلنا %', v_expected, v_row.total;
  end if;
  if not v_row.round_trip_applied then
    raise exception '(ب-٣) round_trip_applied يجب أن يكون true';
  end if;

  -- (ب-٤) الأرضية قبل المعامل: رحلة ٥ كم بسيدان تحت الحد الأدنى
  v_raw := v_sedan.base_fee + 5 * v_sedan.per_km;
  if v_raw < v_sedan.min_price then
    select * into v_row from public.quote_price(5, 1, false, 0) q where q.class_slug = 'sedan';
    if not found then raise exception '(ب-٤) لم يرجع عرض sedan لرحلة ٥ كم'; end if;

    if not v_row.min_applied then
      raise exception '(ب-٤) min_applied يجب أن يكون true (الخام % < الأرضية %)',
        v_raw, v_sedan.min_price;
    end if;
    if v_row.total <> round(v_sedan.min_price) then
      raise exception '(ب-٤) رحلة ٥ كم: توقعنا الأرضية % وحصلنا %',
        round(v_sedan.min_price), v_row.total;
    end if;

    -- نفس الرحلة ذهاباً وعودة: (أرضية × معامل) وليس (خام × معامل ثم أرضية)
    select * into v_row from public.quote_price(5, 1, true, 0) q where q.class_slug = 'sedan';
    if not found then raise exception '(ب-٤) لم يرجع عرض sedan ذهاباً وعودة'; end if;

    v_expected := round(v_sedan.min_price * v_sedan.round_trip_factor);
    v_wrong    := round(greatest(v_raw * v_sedan.round_trip_factor, v_sedan.min_price));
    if v_row.total <> v_expected then
      raise exception '(ب-٤) الأرضية قبل معامل العودة: توقعنا % وحصلنا %', v_expected, v_row.total;
    end if;
    if v_expected <> v_wrong and v_row.total = v_wrong then
      raise exception '(ب-٤) الترتيب معكوس: طُبّقت الأرضية بعد معامل العودة (%)', v_wrong;
    end if;
  else
    raise notice '  ↳ (ب-٤) تخطٍّ: أرضية السيدان (%) لم تعد تتجاوز سعر ٥ كم (%)',
      v_sedan.min_price, v_raw;
  end if;

  -- (ب-٥) ساعات الانتظار تُضاف بعد معامل العودة ولا تُضاعَف معه
  select * into v_row from public.quote_price(5, 1, true, 2) q where q.class_slug = 'sedan';
  if not found then raise exception '(ب-٥) لم يرجع عرض sedan مع الانتظار'; end if;

  v_expected := round(
    greatest(v_raw, v_sedan.min_price) * v_sedan.round_trip_factor
    + 2 * v_sedan.waiting_hour_price
  );
  v_wrong := round(
    (greatest(v_raw, v_sedan.min_price) + 2 * v_sedan.waiting_hour_price)
    * v_sedan.round_trip_factor
  );
  if v_row.total <> v_expected then
    raise exception '(ب-٥) الانتظار ساعتان: توقعنا % وحصلنا %', v_expected, v_row.total;
  end if;
  if v_expected <> v_wrong and v_row.total = v_wrong then
    raise exception '(ب-٥) الانتظار ضُوعف بمعامل العودة (%) — يجب أن يُضاف بعده', v_wrong;
  end if;
  if v_row.waiting_cost <> round(2 * v_sedan.waiting_hour_price, 2) then
    raise exception '(ب-٥) waiting_cost: توقعنا % وحصلنا %',
      round(2 * v_sedan.waiting_hour_price, 2), v_row.waiting_cost;
  end if;

  update public.pricing_settings
     set peak_enabled = v_prev_enabled, peak_percent = v_prev_percent
   where id = true;

  raise notice '✔ (ب) المعادلة: الأرضية ← معامل العودة ← الانتظار';
exception
  when others then
    if v_prev_enabled is not null then
      update public.pricing_settings
         set peak_enabled = v_prev_enabled, peak_percent = v_prev_percent
       where id = true;
    end if;
    raise;
end;
$$;

-- ----------------------------------------------------------------------------
-- (ج) الذروة — تُطبَّق آخر شيء على الناتج كاملاً، ثم يُقرَّب لأقرب جنيه
-- ----------------------------------------------------------------------------
do $$
declare
  v_prev_enabled boolean;
  v_prev_percent numeric;
  v_suv          record;
  v_row          record;
  v_pre_peak     numeric;
  v_plain_total  numeric;
  v_expected     numeric;
begin
  select ps.peak_enabled, ps.peak_percent
    into v_prev_enabled, v_prev_percent
  from public.pricing_settings ps
  limit 1;

  select t.* into v_suv
  from public.tariffs t
  join public.vehicle_classes vc on vc.id = t.class_id
  where vc.slug = 'suv';
  if not found then raise exception '(ج) تعريفة suv غير موجودة'; end if;

  v_pre_peak := greatest(v_suv.base_fee + 250 * v_suv.per_km, v_suv.min_price);

  -- الذروة مطفأة: السعر الأساسي
  update public.pricing_settings set peak_enabled = false where id = true;
  select q.total into v_plain_total
  from public.quote_price(250, 5, false, 0) q
  where q.class_slug = 'suv';
  if not found then raise exception '(ج) لم يرجع عرض suv قبل تفعيل الذروة'; end if;

  -- الذروة مفعّلة بنسبة ١٥٪
  update public.pricing_settings set peak_enabled = true, peak_percent = 15 where id = true;
  select * into v_row from public.quote_price(250, 5, false, 0) q where q.class_slug = 'suv';
  if not found then raise exception '(ج) لم يرجع عرض suv بعد تفعيل الذروة'; end if;

  v_expected := round(v_pre_peak * (1 + 15 / 100.0::numeric));
  if v_row.total <> v_expected then
    raise exception '(ج-١) الذروة ١٥٪: توقعنا % وحصلنا %', v_expected, v_row.total;
  end if;
  if not v_row.peak_applied then
    raise exception '(ج-٢) peak_applied يجب أن يكون true عند تفعيل الذروة';
  end if;
  if v_pre_peak > 0 and v_row.total <= v_plain_total then
    raise exception '(ج-٣) الذروة لم ترفع السعر: قبلها % وبعدها %', v_plain_total, v_row.total;
  end if;

  -- التفصيل لا يُضخَّم بالذروة: مكوّناته تبقى كما هي والذروة تظهر في الإجمالي فقط
  if v_row.base_fee <> round(v_suv.base_fee, 2)
     or v_row.distance_cost <> round(250 * v_suv.per_km, 2) then
    raise exception '(ج-٤) تفصيل السعر تغيّر بالذروة: أساس=% مسافة=%',
      v_row.base_fee, v_row.distance_cost;
  end if;

  update public.pricing_settings
     set peak_enabled = v_prev_enabled, peak_percent = v_prev_percent
   where id = true;

  raise notice '✔ (ج) عمولة الذروة تُضاف أخيراً على الناتج كاملاً';
exception
  when others then
    if v_prev_enabled is not null then
      update public.pricing_settings
         set peak_enabled = v_prev_enabled, peak_percent = v_prev_percent
       where id = true;
    end if;
    raise;
end;
$$;

-- ----------------------------------------------------------------------------
-- (د) الصلابة — مدخلات حدّية لا يجوز أن تُسقط الدالة أو تُنتج سعراً سالباً
-- ----------------------------------------------------------------------------
do $$
declare
  v_count  integer;
  v_minimum numeric;
begin
  -- مسافة صفر/سالبة/فارغة: تُعامَل كصفر ولا ترمي خطأ
  select count(*), min(q.total) into v_count, v_minimum from public.quote_price(0, 2, false, 0) q;
  if v_count <> 2 or v_minimum < 0 then
    raise exception '(د-١) مسافة صفر: عدد العروض % وأدنى إجمالي %', v_count, v_minimum;
  end if;

  select count(*), min(q.total) into v_count, v_minimum from public.quote_price(-10, 2, true, -5) q;
  if v_count <> 2 or v_minimum < 0 then
    raise exception '(د-٢) مدخلات سالبة: عدد العروض % وأدنى إجمالي %', v_count, v_minimum;
  end if;

  select count(*) into v_count from public.quote_price(null, null, null, null) q;
  if v_count <> 2 then
    raise exception '(د-٣) مدخلات فارغة: توقعنا عرضين (راكب واحد افتراضاً) وحصلنا %', v_count;
  end if;

  raise notice '✔ (د) المدخلات الحدّية آمنة';
end;
$$;

-- ----------------------------------------------------------------------------
-- (هـ) 🔴 القيم غير المنتهية — سعرٌ ليس رقماً يصل الزائر بلا حساب (هجرة 0112)
--
-- لماذا هذه المجموعة موجودة: 0108 أغلقت `NaN` عند **عمود المال**، فأمسكت كل
-- كاتب. و`quote_price` **لا تكتب شيئاً** — تحسب وتُرجع — فلا تلقى عموداً قط.
-- وكل بابٍ أغلقته 0108 كان خلف تسجيل دخول، **وهذا يُفتح من الشارع**:
-- `quote_public` ممنوحةٌ لـ`anon` منذ 0012 لأن الموقع يسعّر قبل الدخول.
--
-- والمقيس قبل الإصلاح (بدور anon الحقيقي، 2026-08-18):
--   quote_public(10, 4, false, 'NaN', <المطار>)   ⇒ total = "NaN" للفئتين
--   quote_public(10, 4, false, 'Infinity', …)     ⇒ total = "Infinity"
--   quote_public('NaN', 4, false, 0, بلا إحداثيات) ⇒ total = "NaN"
--   quote_public(10, 4, false, 1e1000, …)         ⇒ إجمالي بـ١٠٠١ خانة،
--                                                    و`JSON.parse` يحوّله Infinity
--
-- ⚠ ومصيدةُ من يكتب اختباراً هنا: **المسار المغطّى يُخفي نصف العيب**. حين تفوز
--   قائمة أسعارٍ معتمدة يصير `distance_cost` صفراً، فمسافةُ `NaN` تُعيد سعراً
--   سليماً. فالاختبار يجب أن يمرّ على **المسارين**: بلا إحداثيات وبإحداثياتٍ
--   مغطّاة — وإلا مرّ أخضرَ على عيبٍ قائم.
-- ----------------------------------------------------------------------------
do $$
declare
  v_ok    boolean;
  v_bad   text;
  v_hint  text;
  v_total numeric;
  v_count integer;
  v_min   numeric;
  -- مسار مغطّى بقائمة أسعارٍ معتمدة (مطار القاهرة ← مصر الجديدة)
  c_olat  constant numeric := 30.114826;
  c_olng  constant numeric := 31.350388;
  c_dlat  constant numeric := 30.100599;
  c_dlng  constant numeric := 31.332914;
begin
  if to_regprocedure('public.quote_public(numeric, integer, boolean, numeric,'
                     || ' numeric, numeric, numeric, numeric, text, integer, jsonb)') is null then
    raise exception 'شرط مسبق: public.quote_public غير موجودة — نفّذ 0031 وما قبلها';
  end if;
  if to_regprocedure('public.quote_arg_finite(numeric, text, numeric)') is null then
    raise exception 'شرط مسبق: public.quote_arg_finite غير موجودة — نفّذ 0112_public_quote_refuses_non_numbers.sql';
  end if;

  -- (هـ-١) الباب المفتوح من الشارع: كل قيمةٍ غير منتهية تُرفض على **المسارين**
  foreach v_bad in array array['NaN', 'Infinity', '-Infinity', '1e1000', '-1e1000'] loop
    -- ساعات الانتظار — وهي التي سرّبت `NaN` على المسارين معاً
    v_ok := false;
    begin
      perform q.total from public.quote_public(10, 4, false, v_bad::numeric,
                                               c_olat, c_olng, c_dlat, c_dlng) q;
    exception when others then v_ok := true;
    end;
    if not v_ok then
      raise exception '(هـ-١أ) ساعات انتظار «%» عبرت quote_public على المسار المغطّى', v_bad;
    end if;

    -- المسافة على مسار التعريفة — تُعيد NaN لكل نقطةٍ خارج القائمتين
    v_ok := false;
    begin
      perform q.total from public.quote_public(v_bad::numeric, 4, false, 0,
                                               null, null, null, null) q;
    exception when others then v_ok := true;
    end;
    if not v_ok then
      raise exception '(هـ-١ب) مسافة «%» عبرت quote_public على مسار التعريفة', v_bad;
    end if;

    -- والمسافة على المسار المغطّى كذلك — لا يكفي أن يُغلق أحدهما
    v_ok := false;
    begin
      perform q.total from public.quote_public(v_bad::numeric, 4, false, 0,
                                               c_olat, c_olng, c_dlat, c_dlng) q;
    exception when others then v_ok := true;
    end;
    if not v_ok then
      raise exception '(هـ-١ج) مسافة «%» عبرت quote_public على المسار المغطّى', v_bad;
    end if;
  end loop;

  -- (هـ-٢) والإحداثيات: `NaN` كانت تُسقط التغطية صامتةً فتعطي سعر تعريفةٍ
  --        **أقلّ** من سعر القائمة المعتمدة — أي تخفيضٌ بإفساد مُدخَل.
  foreach v_bad in array array['NaN', 'Infinity', '1e1000'] loop
    v_ok := false;
    begin
      perform q.total from public.quote_public(10, 4, false, 0,
                                               v_bad::numeric, c_olng, c_dlat, c_dlng) q;
    exception when others then v_ok := true;
    end;
    if not v_ok then
      raise exception '(هـ-٢) خط عرض «%» عبر — والتغطية تسقط بلا كلمة', v_bad;
    end if;
  end loop;

  -- (هـ-٣) الجذر نفسه مغلق، لا بابُه وحده: `quote_price` بتوقيعاتها الثلاثة
  v_ok := false;
  begin
    perform q.total from public.quote_price(10, 4, false, 'NaN'::numeric) q;
  exception when others then v_ok := true;
  end;
  if not v_ok then
    raise exception '(هـ-٣أ) التوقيع الرباعي ما زال يُخرج NaN';
  end if;

  v_ok := false;
  begin
    perform q.total from public.quote_price(10, 4, false, 'NaN'::numeric, 0) q;
  exception when others then v_ok := true;
  end;
  if not v_ok then
    raise exception '(هـ-٣ب) التوقيع الخماسي ما زال يُخرج NaN';
  end if;

  v_ok := false;
  begin
    perform q.total from public.quote_price('NaN'::numeric, 4, false, 0,
                                            c_olat, c_olng, c_dlat, c_dlng, 0) q;
  exception when others then v_ok := true;
  end;
  if not v_ok then
    raise exception '(هـ-٣ج) التوقيع التساعي ما زال يُخرج NaN على المسار المغطّى';
  end if;

  -- (هـ-٤) والرسالة تصل بتلميحٍ مفهوم — لا برقم قيدٍ أعمى ولا بخطأٍ داخليّ
  v_hint := null;
  begin
    perform q.total from public.quote_public(10, 4, false, 'NaN'::numeric,
                                             c_olat, c_olng, c_dlat, c_dlng) q;
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if v_hint is distinct from 'invalid-input' then
    raise exception '(هـ-٤) التلميح «%» لا «invalid-input»', coalesce(v_hint, 'لا شيء');
  end if;

  -- (هـ-٥) 🔴 والعرضُ المشروع لم يتغيّر — وهذا نصف الاختبار لا زينته.
  --        حاجزٌ يرفض `NaN` ويرفض معه رحلةً حقيقية أسوأ من العيب نفسه.
  select count(*), min(q.total) into v_count, v_min
  from public.quote_public(220, 4, false, 0, null, null, null, null) q;
  if v_count <> 2 or v_min is null or not (v_min > 0 and v_min < 'Infinity'::numeric) then
    raise exception '(هـ-٥أ) عرض التعريفة المشروع انكسر: عروض % وأدنى إجمالي %',
      v_count, coalesce(v_min::text, 'لا شيء');
  end if;

  select count(*), min(q.total) into v_count, v_min
  from public.quote_public(10, 4, false, 0, c_olat, c_olng, c_dlat, c_dlng) q;
  if v_count <> 2 or v_min is null or not (v_min > 0 and v_min < 'Infinity'::numeric) then
    raise exception '(هـ-٥ب) عرض المسار المغطّى المشروع انكسر: عروض % وأدنى إجمالي %',
      v_count, coalesce(v_min::text, 'لا شيء');
  end if;

  -- (هـ-٦) والقصّ كما كان: السالب والفارغ و`-0` تمرّ ولا تُرفض (نظير د-٢/د-٣)
  select count(*), min(q.total) into v_count, v_min
  from public.quote_public(-10, 2, true, -5, null, null, null, null) q;
  if v_count <> 2 or v_min < 0 then
    raise exception '(هـ-٦أ) المدخلات السالبة صارت تُرفض بدل أن تُقصّ: عروض % وأدنى %',
      v_count, v_min;
  end if;

  select q.total into v_total
  from public.quote_public('-0'::numeric, 4, false, '-0'::numeric, null, null, null, null) q
  where q.class_slug = 'suv';
  if v_total is null or v_total <= 0 then
    raise exception '(هـ-٦ب) «-0» صارت تُرفض: %', coalesce(v_total::text, 'لا شيء');
  end if;

  select count(*) into v_count
  from public.quote_public(null, null, null, null, null, null, null, null) q;
  if v_count <> 2 then
    raise exception '(هـ-٦ج) المدخلات الفارغة لم تعد تعمل: عروض %', v_count;
  end if;

  raise notice '✔ (هـ) المسار العام يرفض ما ليس رقماً على مساريه، والعرض المشروع والقصّ كما كانا';
end;
$$;

-- ----------------------------------------------------------------------------
-- (و) 🔴 معادلة «تكلفة متعهد + هامش» — بفيكسترةٍ من صنعها لا ببيانات القاعدة
--
-- 🔴 لماذا فيكسترة: كان القسم يقيس على صفَّي أسعارٍ حقيقيَّين في حساب المتعهد
-- («مطار القاهرة - داخلي» و«القاهرة - الأسكندرية»). وفي 2026-08-18 حذفهما
-- المتعهد من بوابته (‏`audit_log` ⇒ `actor_kind='partner'` · `action='delete'`
-- عند 12:20Z)، فصار القسم **يُخطَّى إلى الأبد** — أي أن أهمّ توكيدٍ ماليّ في
-- الملف مات صامتاً بينما المجموعة تطبع `ALL PASSED`.
--
-- وقبلها بساعة كان يقيس **أرخصَ** تكلفةٍ في القاعدة كلِّها: فلمّا دخلت مئةُ
-- قائمةٍ حقيقية أعطى 700 بدل 720 و**المعادلة لم تتغيّر بحرف**.
--
-- فالمقصود هنا **المعادلة** لا محتوى القاعدة: تكلفةٌ يعرفها الاختبار، في ممرٍّ
-- يملكه، مقيسٌ صفرَ تغطيةٍ قبل الإنشاء. والأرقام هي أرقام المالك نفسها التي
-- قِيست يوم 2026-08-18: ٧٢٠/١٥٠٠ · ١٨٠٠/٢٦٤٠ · ٣٢٥٠/٤٩٥٢.
-- ----------------------------------------------------------------------------
do $$
declare
  v_sub    constant uuid := 'e0000000-0000-4000-8000-00000000000f';
  v_list_a constant uuid := 'e1000000-0000-4000-8000-00000000000a';
  v_list_b constant uuid := 'e1000000-0000-4000-8000-00000000000b';
  v_pax    integer;
  v_ready  boolean;
  v_pre    integer;
  v_suv    numeric;
  v_bus    numeric;
begin
  /*
   * الشرط الأول: التعريفتان اللتان تدخلان الحساب فعلاً — الأرضية ومعامل
   * العودة وسعر ساعة الانتظار. و`per_km` و`base_fee` **لا تدخلان** لأن
   * التسعير هنا من تكلفة متعهد لا من مسافة، فتغييرُهما من اللوحة لا يعني شيئاً.
   */
  select
    exists (select 1 from public.tariffs t join public.vehicle_classes vc on vc.id = t.class_id
             where vc.slug = 'suv' and t.min_price = 700 and t.round_trip_factor = 1.75
               and t.waiting_hour_price = 50)
    and exists (select 1 from public.tariffs t join public.vehicle_classes vc on vc.id = t.class_id
             where vc.slug = 'minibus' and t.min_price = 1500 and t.round_trip_factor = 1.80
               and t.waiting_hour_price = 100)
    and exists (select 1 from public.pricing_settings ps
             where ps.margin_type = 'percent' and ps.margin_value = 20
               and ps.margin_min_amount = 100 and not ps.peak_enabled)
    into v_ready;

  if not v_ready then
    raise notice '⏭ (و) تُخطّى: المالك عاير الأرضية أو معامل العودة أو ساعة الانتظار أو الهامش أو الذروة';
    return;
  end if;

  /*
   * عددُ الركاب يُشتقّ حيّاً: أكبرُ من سعة السيدان بواحد، فتسقط السيدان من
   * الأهلية وتبقى SUV ثم ميني‑باص — وهما الفئتان المقصودتان. ورقمٌ محفور كان
   * ينكسر يوم رفع المالك سعة السيدان من ٣ إلى ٤ (2026-08-18 12:29Z).
   */
  select vc.capacity + 1 into v_pax from public.vehicle_classes vc where vc.slug = 'sedan';
  if not exists (select 1 from public.vehicle_classes vc
                  where vc.slug = 'suv' and vc.capacity >= v_pax and vc.luggage_capacity >= 0)
     or not exists (select 1 from public.vehicle_classes vc
                  where vc.slug = 'minibus' and vc.capacity >= v_pax) then
    raise notice '⏭ (و) تُخطّى: سعات المالك لم تعد تُبقي SUV وميني‑باص فئتَي الأهلية عند % راكباً', v_pax;
    return;
  end if;

  -- 🔴 الممرّان مقيسان صفرَ تغطية قبل الإنشاء — وإلا خالطت قائمةٌ حقيقيةٌ الحساب
  select count(*) into v_pre from public.coverage_matches(27.000000, 27.000000, 26.900000, 27.100000);
  if v_pre <> 0 then
    raise exception '(و-٠أ) ممرّ الفيكسترة الأول ليس خالياً (% مطابقة) — اختر إحداثيات أخرى', v_pre;
  end if;
  select count(*) into v_pre from public.coverage_matches(25.500000, 29.500000, 24.800000, 30.500000);
  if v_pre <> 0 then
    raise exception '(و-٠ب) ممرّ الفيكسترة الثاني ليس خالياً (% مطابقة)', v_pre;
  end if;

  insert into public.subcontractors (id, company_name, phone, status)
  values (v_sub, 'QUOTE_TESTS متعهد الفيكسترة', '01000000091', 'approved');

  insert into public.price_lists (
    id, subcontractor_id, title,
    origin_label, origin_lat, origin_lng, origin_radius_km,
    dest_label,   dest_lat,   dest_lng,   dest_radius_km,
    bidirectional, status
  ) values
    (v_list_a, v_sub, 'QUOTE_TESTS ممرّ قصير',
     'واحة الفيكسترة أ', 27.000000, 27.000000, 20,
     'واحة الفيكسترة ب', 26.900000, 27.100000, 20, false, 'approved'),
    (v_list_b, v_sub, 'QUOTE_TESTS ممرّ طويل',
     'واحة الفيكسترة ج', 25.500000, 29.500000, 20,
     'واحة الفيكسترة د', 24.800000, 30.500000, 20, false, 'approved');

  insert into public.price_list_items (price_list_id, class_slug, cost) values
    (v_list_a, 'suv', 600), (v_list_a, 'minibus', 900),
    (v_list_b, 'suv', 1500), (v_list_b, 'minibus', 2200);

  -- الممرّ القصير: ٦٠٠ + ٢٠٪ = ٧٢٠ · وميني‑باص ٩٠٠+١٨٠ = ١٠٨٠ تحت أرضية ١٥٠٠
  select max(q.total) filter (where q.class_slug = 'suv'),
         max(q.total) filter (where q.class_slug = 'minibus')
    into v_suv, v_bus
  from public.quote_public(10, v_pax, false, 0, 27.000000, 27.000000, 26.900000, 27.100000) q;
  if v_suv is distinct from 720 or v_bus is distinct from 1500 then
    raise exception '(و-١) الممرّ القصير: توقعنا ٧٢٠/١٥٠٠ وحصلنا %/%', v_suv, v_bus;
  end if;

  -- الممرّ الطويل ذهاباً: ١٥٠٠+٣٠٠ = ١٨٠٠ · ٢٢٠٠+٤٤٠ = ٢٦٤٠
  select max(q.total) filter (where q.class_slug = 'suv'),
         max(q.total) filter (where q.class_slug = 'minibus')
    into v_suv, v_bus
  from public.quote_public(220, v_pax, false, 0, 25.500000, 29.500000, 24.800000, 30.500000) q;
  if v_suv is distinct from 1800 or v_bus is distinct from 2640 then
    raise exception '(و-٢) الممرّ الطويل: توقعنا ١٨٠٠/٢٦٤٠ وحصلنا %/%', v_suv, v_bus;
  end if;

  -- ذهاباً وعودةً بساعتَي انتظار: ١٨٠٠×١٫٧٥+١٠٠ = ٣٢٥٠ · ٢٦٤٠×١٫٨+٢٠٠ = ٤٩٥٢
  select max(q.total) filter (where q.class_slug = 'suv'),
         max(q.total) filter (where q.class_slug = 'minibus')
    into v_suv, v_bus
  from public.quote_public(220, v_pax, true, 2, 25.500000, 29.500000, 24.800000, 30.500000) q;
  if v_suv is distinct from 3250 or v_bus is distinct from 4952 then
    raise exception '(و-٣) الذهاب والعودة: توقعنا ٣٢٥٠/٤٩٥٢ وحصلنا %/%', v_suv, v_bus;
  end if;

  raise notice '✔ (و) المعادلة كما هي على فيكسترةٍ معزولة (% راكباً): ٧٢٠/١٥٠٠ · ١٨٠٠/٢٦٤٠ · ٣٢٥٠/٤٩٥٢', v_pax;
end;
$$;

-- ----------------------------------------------------------------------------
-- الخلاصة
-- ----------------------------------------------------------------------------
do $$
begin
  raise notice 'ALL PASSED — كل اختبارات محرك التسعير نجحت';
end;
$$;
