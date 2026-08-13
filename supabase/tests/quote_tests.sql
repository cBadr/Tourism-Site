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

  select string_agg(x.slug, '، ')
    into v_missing
  from (values ('sedan', 3), ('suv', 6), ('minibus', 14), ('bus', 50)) as x(slug, cap)
  where not exists (
    select 1
    from public.vehicle_classes vc
    join public.tariffs t on t.class_id = vc.id
    where vc.slug = x.slug
      and vc.active
      and vc.capacity = x.cap
  );

  if v_missing is not null then
    raise exception
      'شرط مسبق: الفئات التالية غير موجودة/غير نشطة/سعتها أو تعريفتها غير مطابقة للبذرة: %',
      v_missing;
  end if;

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
-- الخلاصة
-- ----------------------------------------------------------------------------
do $$
begin
  raise notice 'ALL PASSED — كل اختبارات محرك التسعير نجحت';
end;
$$;
