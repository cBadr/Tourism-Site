-- ============================================================================
-- 0009_booking_hardening.sql — تصليب منظومة الحجز بعد مراجعة المرحلة ٤
--
-- هذه الهجرة **تصحيحية**: تُنفَّذ فوق قاعدة طُبِّقت عليها 0007 بالفعل، ولا تنشئ
-- جدولاً جديداً ولا تغيّر توقيع أي دالة قائمة. كل ما فيها إغلاق ثغرات وجدتها
-- مراجعتان خصمِيّتان على شجرة المرحلة ٤:
--
--   (د١) السعر لا يُوجَّه من المتصفح: create_booking تحسب مسافة الدائرة العظمى
--        بنفسها وترفض أي مسافة أقصر من ٠٫٩ منها أو أطول من ٣ أضعافها، **و**
--        تُسحب صلاحية تنفيذها من anon و authenticated فلا تُبلَغ إلا عبر مسار
--        الخادم الذي يحسب المسافة بنفسه (service_role).
--   (د٢) قيمة الإيصال لا تأتي من العميل أبداً: التوقيع الأربعي يثبّت المبلغ عند
--        amount_due إلا للمشرف، والتوقيع الأربعي نفسه يُسحب من anon (يبقى الغلاف
--        الثنائي وحده متاحاً للضيف).
--   (د٣) التخزين يفرض حدود الرفع لا TypeScript: حجم أقصى ٥ ميغابايت وأنواع
--        محددة على مستوى الدلو، وسياسة رفع أضيق (توكن في المقطع الأول، مقطعان
--        بالضبط، امتداد من قائمة، وأقل من ١٠ ملفات لكل توكن) + سياسة حذف للضيف
--        بنفس الشرط لتنظيف الملف اليتيم بعد فشل الإرفاق.
--   (د٤) كتابات الضيف تمر عبر دوال definer مُتحقِّقة: سحب INSERT على
--        quote_requests من anon، واستبدال سياسة الإدراج المتساهلة، وتحقق كامل
--        داخل create_quote_request مع قيود CHECK مطابقة على الجدول.
--   (د٥) حسابات الاستقبال ليست قابلة للتعداد علناً: تحميل زائد
--        available_payment_accounts(p_token, p_amount) يشترط توكن حجز حقيقي
--        بانتظار الدفع، وسحب النسخة أحادية الوسيط من anon.
--   (د٨) قنوات الإشعار الافتراضية true/true (بذرة 0007 استخدمت do nothing فبقي
--        الصف الحي مُطفأً بينما يشحن lib/site-config.ts القيمة true).
--   (د٩) فهرس فريد على (kind, handle) في payment_accounts — اللوحة تَعِد بذلك.
--
-- ⚠ فخّ مُوثَّق من 0007 ويتكرر هنا: `create or replace function` **لا يعيد ضبط
--   الصلاحيات**، وإعدادات Supabase الافتراضية (alter default privileges) تمنح
--   anon و authenticated صلاحية EXECUTE على كل دالة جديدة تلقائياً. لذلك سحب
--   PUBLIC وحده لا يكفي إطلاقاً: كل دالة تلمسها هذه الهجرة يُعاد لها في القسم
--   (٧) بلوك revoke ... from public, anon, authenticated ثم grant صريح.
--
-- آمن لإعادة التنفيذ بالكامل: create or replace / drop policy if exists /
-- create index if not exists / on conflict / add constraint داخل حراسة.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (١) مسافة الدائرة العظمى — أساس فحص «المسافة المُقلَّصة» في create_booking
--
-- لماذا في دالة مستقلة: الرقم نفسه قد يلزم لاحقاً في اللوحة وفي فحوص التدقيق،
-- ولأن اختبارها منفردة أسهل من اختبارها مدفونة في جسم إنشاء الحجز.
-- immutable: نتيجتها دالة صرفة في إحداثياتها، فيستطيع المخطِّط طيّها.
-- ----------------------------------------------------------------------------
create or replace function public.haversine_km(
  p_lat1 numeric,
  p_lng1 numeric,
  p_lat2 numeric,
  p_lng2 numeric
)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case
    when p_lat1 is null or p_lng1 is null or p_lat2 is null or p_lng2 is null then null
    else round(
      (2 * 6371.0 * asin(least(
        1.0::double precision,
        sqrt(
          power(sin(radians((p_lat2 - p_lat1)::double precision) / 2), 2)
          + cos(radians(p_lat1::double precision)) * cos(radians(p_lat2::double precision))
          * power(sin(radians((p_lng2 - p_lng1)::double precision) / 2), 2)
        )
      )))::numeric,
      3
    )
  end;
$$;

-- ----------------------------------------------------------------------------
-- (٢) د١ — create_booking: أرضية وسقف للمسافة
--
-- الثغرة: التسعير يعتمد على p_distance_km، وكانت الحراسة الوحيدة «> 0 و≤ 5000».
-- من يستدعي الدالة مباشرة (وكان anon يملك ذلك) يقلّص المسافة إلى ١ كم فيشتري
-- رحلة القاهرة–أسوان بسعر مشوار داخلي.
--
-- الحراسة: المسار البرّي لا يكون أقصر من الخط المستقيم ماديّاً؛ نسمح بهامش ١٠٪
-- لاختلاف الدقة بين مزوّدي المسافات، ونرفض أي تضخيم يتجاوز ٣ أضعاف الخط
-- المستقيم (تضخيم عبثي — لا طريق واقعي في مصر يبلغ ذلك بين نقطتين متباعدتين).
--
-- استثناء واحد مقصود: إذا كان الخط المستقيم أقل من كيلومتر واحد (نقطتان داخل
-- الحي نفسه) نتخطى الفحص كلياً — نسبة الطريق إلى الخط المستقيم في المسافات
-- الدقيقة تتجاوز ٣ أضعاف بشكل طبيعي (شوارع باتجاه واحد، دوران إجباري)، وسقف
-- الـ ٥٠٠٠ كم يبقى قائماً على كل حال.
--
-- الطبقة الثانية (والأهم): سحب EXECUTE من anon و authenticated في القسم (٧).
-- الدالة لم تعد تُنادى إلا من /api/booking بمفتاح الخدمة، وهو الذي يحسب المسافة
-- بنفسه عبر lib/geo فلا يصل رقم من المتصفح إلى هنا أصلاً.
-- ----------------------------------------------------------------------------
create or replace function public.create_booking(
  p_origin            jsonb,
  p_destination       jsonb,
  p_passengers        integer,
  p_round_trip        boolean,
  p_waiting_hours     numeric,
  p_distance_km       numeric,
  p_duration_min      numeric,
  p_distance_source   text,
  p_class_slug        text,
  p_plan              text,
  p_customer_name     text,
  p_customer_phone    text,
  p_customer_whatsapp text,
  p_pickup_at         timestamptz,
  p_notes             text
)
returns table (
  id               uuid,
  reference        text,
  public_token     text,
  total            numeric,
  amount_due       numeric,
  amount_remaining numeric,
  currency         text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_name        text;
  v_phone       text;
  v_whatsapp    text;
  v_plan        text;
  v_slug        text;
  v_passengers  integer;
  v_round_trip  boolean;
  v_waiting     numeric;
  v_distance    numeric;
  v_origin_lbl  text;
  v_origin_lat  numeric;
  v_origin_lng  numeric;
  v_dest_lbl    text;
  v_dest_lat    numeric;
  v_dest_lng    numeric;
  v_hav         numeric;
  v_offer       record;
  v_currency    text;
  v_pay         jsonb;
  v_percent     numeric;
  v_min         numeric;
  v_due         numeric;
  v_remaining   numeric;
  v_trip        jsonb;
  v_id          uuid;
  v_reference   text;
  v_token       text;
  v_attempt     integer;
begin
  -- (أ) تطهير المدخلات النصية
  v_name     := nullif(btrim(coalesce(p_customer_name, '')), '');
  v_phone    := nullif(btrim(coalesce(p_customer_phone, '')), '');
  v_whatsapp := nullif(btrim(coalesce(p_customer_whatsapp, '')), '');
  v_slug     := nullif(btrim(coalesce(p_class_slug, '')), '');
  v_plan     := lower(nullif(btrim(coalesce(p_plan, '')), ''));

  if v_name is null then
    raise exception 'اسم العميل مطلوب' using hint = 'invalid-input';
  end if;
  if v_phone is null then
    raise exception 'رقم هاتف العميل مطلوب' using hint = 'invalid-input';
  end if;
  if v_slug is null then
    raise exception 'فئة السيارة مطلوبة' using hint = 'invalid-input';
  end if;

  v_plan := coalesce(v_plan, 'full');
  if v_plan not in ('full', 'deposit') then
    raise exception 'خطة الدفع يجب أن تكون full أو deposit' using hint = 'invalid-input';
  end if;

  v_passengers := greatest(coalesce(p_passengers, 1), 1);
  v_round_trip := coalesce(p_round_trip, false);
  v_waiting    := greatest(coalesce(p_waiting_hours, 0), 0);
  v_distance   := coalesce(p_distance_km, 0);

  if v_distance <= 0 or v_distance > 5000 then
    raise exception 'مسافة الرحلة غير منطقية (% كم)', v_distance using hint = 'invalid-input';
  end if;

  v_origin_lbl := nullif(btrim(coalesce(p_origin ->> 'label', '')), '');
  v_dest_lbl   := nullif(btrim(coalesce(p_destination ->> 'label', '')), '');
  v_origin_lat := public.jsonb_number(p_origin, 'lat', null);
  v_origin_lng := public.jsonb_number(p_origin, 'lng', null);
  v_dest_lat   := public.jsonb_number(p_destination, 'lat', null);
  v_dest_lng   := public.jsonb_number(p_destination, 'lng', null);

  if v_origin_lbl is null or v_dest_lbl is null
     or v_origin_lat is null or v_origin_lng is null
     or v_dest_lat is null or v_dest_lng is null then
    raise exception 'نقطتا الانطلاق والوصول غير مكتملتين' using hint = 'invalid-input';
  end if;

  -- (أ-٢) 🔒 د١ — المسافة تُقاس على الخريطة لا تُعلَن من المستدعي
  v_hav := public.haversine_km(v_origin_lat, v_origin_lng, v_dest_lat, v_dest_lng);

  if v_hav is not null and v_hav >= 1 then
    if v_distance < v_hav * 0.9 then
      raise exception
        'المسافة المُدخلة (% كم) أقصر من المسافة المستقيمة بين النقطتين (% كم)',
        v_distance, v_hav
        using hint = 'invalid-input';
    end if;
    if v_distance > v_hav * 3 then
      raise exception
        'المسافة المُدخلة (% كم) تفوق ثلاثة أضعاف المسافة المستقيمة (% كم)',
        v_distance, v_hav
        using hint = 'invalid-input';
    end if;
  end if;

  -- (ب) إعادة حساب السعر — المصدر الأوحد هو quote_price، وأي سعر من العميل مُهمَل.
  --     غياب الفئة من العروض المؤهلة = محاولة تلاعب (أو فئة عُطّلت للتو) ← رفض.
  select q.class_slug, q.class_title, q.total
    into v_offer
  from public.quote_price(v_distance, v_passengers, v_round_trip, v_waiting) q
  where q.class_slug = v_slug;

  if not found then
    raise exception 'الفئة «%» غير متاحة لرحلة بـ % راكباً', v_slug, v_passengers
      using hint = 'class-unavailable';
  end if;

  if v_offer.total is null or v_offer.total <= 0 then
    raise exception 'تعذّر احتساب سعر الرحلة' using hint = 'pricing-failed';
  end if;

  -- (ج) العملة من إعدادات التسعير (لا نص ثابت في الكود)
  select ps.currency into v_currency from public.pricing_settings ps limit 1;
  v_currency := coalesce(v_currency, 'EGP');

  -- (د) العربون من مفتاح الإعدادات payment.
  select s.value into v_pay from public.site_settings s where s.key = 'payment';
  v_percent := public.jsonb_number(v_pay, 'depositPercent', 30);
  v_min     := public.jsonb_number(v_pay, 'depositMinAmount', 200);

  if v_plan = 'deposit' then
    -- النسبة أو الحد الأدنى أيهما أكبر، وبحد أقصى الإجمالي (لا عربون يفوق السعر)
    v_due := least(v_offer.total, greatest(round(v_offer.total * v_percent / 100), v_min));
    v_due := greatest(v_due, 0);
  else
    v_due := v_offer.total;
  end if;
  v_remaining := greatest(v_offer.total - v_due, 0);

  -- (هـ) لقطة الرحلة — تُحفظ كما هي ولا تتأثر بأي تعديل لاحق للتعريفات.
  --      straightKm تُحفظ للتدقيق: تتيح لاحقاً كشف أي حجز قديم بمسافة مشبوهة.
  v_trip := jsonb_build_object(
    'originLabel',    v_origin_lbl,
    'originLat',      v_origin_lat,
    'originLng',      v_origin_lng,
    'destLabel',      v_dest_lbl,
    'destLat',        v_dest_lat,
    'destLng',        v_dest_lng,
    'distanceKm',     v_distance,
    'straightKm',     v_hav,
    'durationMin',    p_duration_min,
    'distanceSource', coalesce(nullif(btrim(coalesce(p_distance_source, '')), ''), 'estimate'),
    'passengers',     v_passengers,
    'roundTrip',      v_round_trip,
    'waitingHours',   v_waiting,
    'pickupAt',       p_pickup_at,
    'notes',          nullif(btrim(coalesce(p_notes, '')), '')
  );

  -- (و) الإدراج — المرجع والتوكن يولّدهما المُشغّل، وتصادمهما (احتمال ضئيل جداً)
  --     يُعالَج بإعادة المحاولة لا بالفشل.
  perform set_config('tours.booking_note', 'إنشاء الحجز', true);

  for v_attempt in 1 .. 5 loop
    begin
      insert into public.bookings as b (
        status, class_slug, class_title, total, currency, plan,
        amount_due, amount_remaining,
        customer_name, customer_phone, customer_whatsapp, trip
      )
      values (
        'pending_payment', v_offer.class_slug, v_offer.class_title, v_offer.total, v_currency, v_plan,
        v_due, v_remaining,
        v_name, v_phone, v_whatsapp, v_trip
      )
      returning b.id, b.reference, b.public_token
      into v_id, v_reference, v_token;
      exit;
    exception
      when unique_violation then
        if v_attempt >= 5 then
          raise exception 'تعذّر توليد رقم مرجعي فريد للحجز' using hint = 'db-unavailable';
        end if;
        perform set_config('tours.booking_note', 'إنشاء الحجز', true);
    end;
  end loop;

  id               := v_id;
  reference        := v_reference;
  public_token     := v_token;
  total            := v_offer.total;
  amount_due       := v_due;
  amount_remaining := v_remaining;
  currency         := v_currency;
  return next;
end;
$$;

-- ----------------------------------------------------------------------------
-- (٣) د٢ — attach_receipt: المبلغ من الحجز لا من المستدعي
--
-- الثغرة: coalesce(p_amount, amount_due) جعل «كم حوّلت» إقراراً من المتصفح.
-- إقرار بمبلغ ضخم يستهلك سعة حساب الاستقبال ويُخفيه عن بقية العملاء (حرمان
-- خدمة على بوابات الدفع المحلية)، وإقرار بمبلغ ضئيل يشوّش المطابقة المحاسبية.
--
-- القرار: المبلغ = bookings.amount_due دائماً، إلا إذا كان المنفّذ مشرفاً
-- (تسوية يدوية من اللوحة لتحويل جزئي مثلاً) فيُحترم p_amount حين يُمرَّر.
-- والتوقيع الأربعي يُسحب من anon في القسم (٧): الضيف يرى الغلاف الثنائي وحده.
-- ----------------------------------------------------------------------------
create or replace function public.attach_receipt(
  p_token      text,
  p_path       text,
  p_account_id uuid,
  p_amount     numeric
)
returns table (
  payment_id uuid,
  reference  text,
  status     text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_booking record;
  v_path    text;
  v_amount  numeric;
  v_payment uuid;
begin
  v_path := nullif(btrim(coalesce(p_path, '')), '');
  if v_path is null then
    raise exception 'مسار الإيصال مطلوب' using hint = 'invalid-input';
  end if;
  if p_token is null or length(p_token) < 32 then
    raise exception 'رابط المتابعة غير صالح' using hint = 'booking-not-found';
  end if;

  select b.* into v_booking
  from public.bookings b
  where b.public_token = p_token
  for update;

  if not found then
    raise exception 'لا يوجد حجز بهذا الرابط' using hint = 'booking-not-found';
  end if;

  if v_booking.status <> 'pending_payment' then
    raise exception 'لا يمكن رفع إيصال والحجز في حالة «%»', v_booking.status
      using hint = 'invalid-status';
  end if;

  -- 🔒 د٢ — قيمة الإيصال تُثبَّت من الحجز. المشرف وحده يستطيع تجاوزها.
  if public.is_admin() then
    v_amount := coalesce(p_amount, v_booking.amount_due);
  else
    v_amount := v_booking.amount_due;
  end if;

  if v_amount is null or v_amount <= 0 then
    raise exception 'قيمة التحويل يجب أن تكون أكبر من صفر' using hint = 'invalid-input';
  end if;

  if p_account_id is not null
     and not exists (
       select 1 from public.payment_accounts pa
       where pa.id = p_account_id and pa.active
     ) then
    raise exception 'حساب الاستقبال غير موجود أو غير مفعّل' using hint = 'account-unavailable';
  end if;

  insert into public.payments as p (booking_id, account_id, amount, receipt_path, status)
  values (v_booking.id, p_account_id, v_amount, v_path, 'pending')
  returning p.id into v_payment;

  perform set_config('tours.booking_note', 'رفع إيصال التحويل', true);
  update public.bookings b
     set status = 'under_review'
   where b.id = v_booking.id;

  payment_id := v_payment;
  reference  := v_booking.reference;
  status     := 'under_review';
  return next;
end;
$$;

-- الغلاف الثنائي كما هو (المنفذ الوحيد للضيف) — يُعاد تعريفه هنا فقط لتوثيق
-- أنه لم يتغيّر، وليضمن أن إعادة تنفيذ 0009 وحدها تكفي لبناء الحالة الصحيحة.
create or replace function public.attach_receipt(p_token text, p_path text)
returns table (
  payment_id uuid,
  reference  text,
  status     text
)
language sql
volatile
security definer
set search_path = ''
as $$
  select r.payment_id, r.reference, r.status
  from public.attach_receipt(p_token, p_path, null::uuid, null::numeric) r;
$$;

-- ----------------------------------------------------------------------------
-- (٤) د٣ — دلو الإيصالات: الحدود في التخزين لا في TypeScript
--
-- فحص الحجم والنوع في مسار الـ API يحمي المتصفح الودود وحده؛ من يرفع بمفتاح
-- anon مباشرة إلى Storage API يتجاوزه كلياً. لذا تُثبَّت الحدود على الدلو نفسه.
-- ٥٢٤٢٨٨٠ بايت = ٥ ميغابايت (مطابق لـ MAX_BYTES في app/api/booking/receipt).
--
-- محاط بمعالج خطأ: ملكية storage.buckets وأعمدته تختلف بين إصدارات Supabase،
-- وفشل التشديد لا يجوز أن يُسقط الهجرة (سياسات القسم أدناه هي خط الدفاع الفعلي).
-- ----------------------------------------------------------------------------
do $$
begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'receipts', 'receipts', false, 5242880,
    array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
  )
  on conflict (id) do update
    set public             = false,
        file_size_limit    = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

  raise notice 'دلو receipts: حد ٥ ميغابايت وأنواع jpeg/png/webp/pdf مثبَّتة';
exception
  when others then
    raise notice 'تعذّر ضبط حدود دلو receipts برمجياً (%) — اضبطها يدوياً من Storage', sqlerrm;
end;
$$;

-- (٤-٢) شرط الرفع الأضيق — تستدعيه سياستا الإدراج والحذف
--
-- الشرط القديم «التوكن ضمن أي مقطع من المسار» كان يقبل «anything/<token>/x.exe»
-- و«<token>/a/b/c» ويسمح بعدد ملفات لا نهائي لكل حجز. الشرط الجديد:
--   ١) التوكن هو المقطع **الأول** حصراً وطوله ≥ ٣٢،
--   ٢) المسار مقطعان بالضبط: «<token>/<filename>»،
--   ٣) الامتداد من قائمة مغلقة (نفس أنواع الدلو أعلاه)،
--   ٤) أقل من ١٠ ملفات تحت بادئة التوكن (سقف إغراق لكل حجز)،
--   ٥) والحجز ما زال pending_payment.
-- security definer لأن الشرط يقرأ bookings و storage.objects وكلاهما محجوب عن
-- الرافع (anon) — والدالة لا تُرجع إلا boolean فلا تسرّب شيئاً.
create or replace function public.receipt_upload_allowed(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with parts as (
    select string_to_array(coalesce(p_name, ''), '/') as seg
  )
  select exists (
    select 1
    from parts p
    join public.bookings b on b.public_token = p.seg[1]
    where array_length(p.seg, 1) = 2
      and length(coalesce(p.seg[1], '')) >= 32
      and b.status = 'pending_payment'
      and coalesce(p.seg[2], '') ~* '^[^/]+\.(jpg|jpeg|png|webp|pdf)$'
      and (
        select count(*)
        from storage.objects o
        where o.bucket_id = 'receipts'
          and left(o.name, length(p.seg[1]) + 1) = p.seg[1] || '/'
      ) < 10
  );
$$;

-- (٤-٣) السياسات — الإدراج يُعاد إنشاؤه (نفس النص، الشرط الجديد داخل الدالة)،
-- والحذف جديد: بعد فشل attach_receipt يحذف المسار الملف اليتيم فوراً بهوية
-- الضيف نفسها. الشرط مطابق حرفياً لشرط الإدراج كما تقرّر — وأثره الجانبي
-- الوحيد أن الملف رقم ١٠ لا يمكن للضيف حذفه (العدّاد يبلغ الحد)، وهو حد أقصى
-- نظري لا يبلغه مسار الرفع الطبيعي.
drop policy if exists "receipts_insert_guest" on storage.objects;
create policy "receipts_insert_guest"
  on storage.objects
  for insert
  to anon, authenticated
  with check (
    bucket_id = 'receipts'
    and (public.receipt_upload_allowed(name) or public.is_admin())
  );

drop policy if exists "receipts_delete_guest" on storage.objects;
create policy "receipts_delete_guest"
  on storage.objects
  for delete
  to anon, authenticated
  using (
    bucket_id = 'receipts'
    and (public.receipt_upload_allowed(name) or public.is_admin())
  );

-- ----------------------------------------------------------------------------
-- (٥) د٤ — طلبات عروض الأسعار: لا إدراج مباشر للضيف، وتحقق داخل الدالة
--
-- الثغرة: anon كان يملك INSERT + سياسة `with check (true)` — أي أن أي متصفح
-- يستطيع حشو الجدول بصفوف بلا حد ولا تحقق (اسم بحرف واحد، تفاصيل بميغابايت،
-- service_slug عشوائي يُربك اللوحة). المنفذ الآن دالة definer واحدة تتحقق.
--
-- القيود CHECK مرآة للتحقق البرمجي: حتى لو أُدرج صف من SQL Editor أو من مسار
-- إداري مستقبلي، تبقى القاعدة واحدة في مكان واحد. تُضاف not valid عمداً حتى لا
-- تفشل الهجرة على قاعدة فيها صفوف قديمة مخالفة (القيد يسري على الجديد فوراً).
-- ----------------------------------------------------------------------------
revoke insert on public.quote_requests from anon;

drop policy if exists "quote_requests_insert_public" on public.quote_requests;

drop policy if exists "quote_requests_insert_admin" on public.quote_requests;
create policy "quote_requests_insert_admin"
  on public.quote_requests
  for insert
  to authenticated
  with check (public.is_admin());

alter table public.quote_requests drop constraint if exists quote_requests_name_len_chk;
alter table public.quote_requests
  add constraint quote_requests_name_len_chk
  check (length(btrim(customer_name)) between 3 and 120) not valid;

alter table public.quote_requests drop constraint if exists quote_requests_phone_len_chk;
alter table public.quote_requests
  add constraint quote_requests_phone_len_chk
  check (length(btrim(customer_phone)) between 8 and 20) not valid;

alter table public.quote_requests drop constraint if exists quote_requests_phone_digits_chk;
alter table public.quote_requests
  add constraint quote_requests_phone_digits_chk
  check (length(regexp_replace(customer_phone, '[^0-9]', '', 'g')) >= 8) not valid;

alter table public.quote_requests drop constraint if exists quote_requests_details_len_chk;
alter table public.quote_requests
  add constraint quote_requests_details_len_chk
  check (length(details) <= 2000) not valid;

alter table public.quote_requests drop constraint if exists quote_requests_service_slug_chk;
alter table public.quote_requests
  add constraint quote_requests_service_slug_chk
  check (
    service_slug is null
    or service_slug in ('airport-transfer', 'city-rides', 'intercity-travel',
                        'tours', 'events', 'conferences')
  ) not valid;

-- محاولة تصديق القيود على الصفوف القائمة — فشلها إشعار لا كارثة
do $$
declare
  v_name text;
begin
  foreach v_name in array array[
    'quote_requests_name_len_chk', 'quote_requests_phone_len_chk',
    'quote_requests_phone_digits_chk', 'quote_requests_details_len_chk',
    'quote_requests_service_slug_chk'
  ] loop
    begin
      execute format('alter table public.quote_requests validate constraint %I', v_name);
    exception
      when others then
        raise notice 'صفوف قديمة تخالف القيد «%» — يسري على الجديد فقط (%)', v_name, sqlerrm;
    end;
  end loop;
end;
$$;

-- (٥-٢) الدالة المُتحقِّقة — المنفذ الوحيد للضيف إلى هذا الجدول
create or replace function public.create_quote_request(
  p_service_slug   text,
  p_customer_name  text,
  p_customer_phone text,
  p_details        text
)
returns table (
  id        uuid,
  reference text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_slug    text;
  v_name    text;
  v_phone   text;
  v_details text;
  v_digits  integer;
  v_id      uuid;
  v_ref     text;
begin
  v_name    := nullif(btrim(coalesce(p_customer_name, '')), '');
  v_phone   := nullif(btrim(coalesce(p_customer_phone, '')), '');
  v_slug    := nullif(btrim(coalesce(p_service_slug, '')), '');
  -- التفاصيل تُقصّ ولا تُرفض: من كتب ٥٠٠٠ حرف يستحق أن يصل طلبه لا أن ينكسر
  v_details := left(btrim(coalesce(p_details, '')), 2000);

  if v_name is null then
    raise exception 'اسم العميل مطلوب' using hint = 'invalid-input';
  end if;
  if length(v_name) < 3 or length(v_name) > 120 then
    raise exception 'اسم العميل يجب أن يكون بين ٣ و١٢٠ حرفاً (طوله %)', length(v_name)
      using hint = 'invalid-input';
  end if;

  if v_phone is null then
    raise exception 'رقم هاتف العميل مطلوب' using hint = 'invalid-input';
  end if;
  if length(v_phone) < 8 or length(v_phone) > 20 then
    raise exception 'رقم الهاتف يجب أن يكون بين ٨ و٢٠ محرفاً (طوله %)', length(v_phone)
      using hint = 'invalid-input';
  end if;
  v_digits := length(regexp_replace(v_phone, '[^0-9]', '', 'g'));
  if v_digits < 8 then
    raise exception 'رقم الهاتف يجب أن يحوي ٨ أرقام على الأقل (وجدنا %)', v_digits
      using hint = 'invalid-input';
  end if;

  -- الخدمة إما إحدى الست المعروفة أو لا شيء — لا نص حر يشوّش اللوحة
  if v_slug is not null
     and v_slug not in ('airport-transfer', 'city-rides', 'intercity-travel',
                        'tours', 'events', 'conferences') then
    raise exception 'الخدمة «%» غير معروفة', v_slug using hint = 'invalid-input';
  end if;

  insert into public.quote_requests as q (service_slug, customer_name, customer_phone, details)
  values (v_slug, v_name, v_phone, v_details)
  returning q.id, q.reference into v_id, v_ref;

  id        := v_id;
  reference := v_ref;
  return next;
end;
$$;

-- ----------------------------------------------------------------------------
-- (٦) د٥ — الحسابات المتاحة مربوطة بتوكن حجز
--
-- الثغرة: available_payment_accounts(p_amount) كانت متاحة لـ anon بلا أي سياق،
-- فأي زائر يستطيع تعداد أرقام محافظ التشغيل كاملة (وحتى استنتاج حدودها من
-- daily_headroom). الآن للضيف تحميل زائد يشترط توكن حجز حقيقي ما زال بانتظار
-- الدفع — وهو بالضبط السياق الذي تُعرض فيه الحسابات في صفحة المتابعة.
--
-- النسخة أحادية الوسيط تبقى للوحة (authenticated) ولعميل الخدمة فقط.
-- ----------------------------------------------------------------------------
create or replace function public.available_payment_accounts(
  p_token  text,
  p_amount numeric
)
returns table (
  id               uuid,
  kind             text,
  label            text,
  handle           text,
  holder_name      text,
  daily_headroom   numeric,
  monthly_headroom numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, a.kind, a.label, a.handle, a.holder_name,
         a.daily_headroom, a.monthly_headroom
  from public.available_payment_accounts(p_amount) a
  where exists (
    select 1
    from public.bookings b
    where p_token is not null
      and length(p_token) >= 32
      and b.public_token = p_token
      and b.status = 'pending_payment'
  );
$$;

-- ----------------------------------------------------------------------------
-- (٧) الصلاحيات — يُعاد إصدارها كاملة لكل دالة لمستها الهجرة
--
-- التذكير مرة أخرى: `create or replace` يحافظ على منح الدالة القديمة، والدوال
-- **الجديدة** (haversine_km والتحميل الزائد) تُولَد ومعها منح ضمني لـ anon من
-- alter default privileges في Supabase. لذلك: revoke من public **و** anon **و**
-- authenticated أولاً، ثم grant صريح لمن يستحق فقط.
-- ----------------------------------------------------------------------------

-- دالة داخلية بحتة: تستدعيها create_booking وحدها
revoke all on function public.haversine_km(numeric, numeric, numeric, numeric)
  from public, anon, authenticated;

-- 🔒 د١ — إنشاء الحجز لم يعد متاحاً للمتصفح إطلاقاً (مفتاح الخدمة فقط)
revoke all on function public.create_booking(
  jsonb, jsonb, integer, boolean, numeric, numeric, numeric,
  text, text, text, text, text, text, timestamptz, text) from public, anon, authenticated;

-- 🔒 د٢ — التوقيع الأربعي للمشرف وعميل الخدمة، والضيف على الغلاف الثنائي
revoke all    on function public.attach_receipt(text, text, uuid, numeric)
  from public, anon, authenticated;
grant execute on function public.attach_receipt(text, text, uuid, numeric) to authenticated;

revoke all    on function public.attach_receipt(text, text) from public, anon, authenticated;
grant execute on function public.attach_receipt(text, text) to anon, authenticated;

-- 🔒 د٥ — التحميل الزائد المربوط بالتوكن للضيف، وأحادي الوسيط للوحة فقط
revoke all    on function public.available_payment_accounts(text, numeric)
  from public, anon, authenticated;
grant execute on function public.available_payment_accounts(text, numeric) to anon, authenticated;

revoke all    on function public.available_payment_accounts(numeric)
  from public, anon, authenticated;
grant execute on function public.available_payment_accounts(numeric) to authenticated;

-- 🔒 د٤ — الدالة المتحقِّقة هي طريق الضيف الوحيد إلى quote_requests
revoke all    on function public.create_quote_request(text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.create_quote_request(text, text, text, text) to anon, authenticated;

-- تستدعيها سياستا التخزين بهوية الرافع (anon أيضاً)
revoke all    on function public.receipt_upload_allowed(text) from public, anon, authenticated;
grant execute on function public.receipt_upload_allowed(text) to anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.create_booking(
               jsonb, jsonb, integer, boolean, numeric, numeric, numeric,
               text, text, text, text, text, text, timestamptz, text) to service_role';
    execute 'grant execute on function public.attach_receipt(text, text, uuid, numeric) to service_role';
    execute 'grant execute on function public.attach_receipt(text, text) to service_role';
    execute 'grant execute on function public.available_payment_accounts(numeric) to service_role';
    execute 'grant execute on function public.available_payment_accounts(text, numeric) to service_role';
    execute 'grant execute on function public.create_quote_request(text, text, text, text) to service_role';
    execute 'grant execute on function public.receipt_upload_allowed(text) to service_role';
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- (٨) د٩ — فهرس فريد على (kind, handle)
--
-- اللوحة تعرض بالفعل رسالة «هذا الحساب مسجَّل من قبل» على الخطأ 23505، وكانت
-- وعداً بلا قيد يسنده. المحفظة الواحدة لا تُسجَّل مرتين تحت نوعها.
-- محاط بحراسة: قاعدة فيها تكرار قديم يجب أن تُنبَّه لا أن تُوقف الهجرة.
-- ----------------------------------------------------------------------------
do $$
begin
  create unique index if not exists payment_accounts_kind_handle_key
    on public.payment_accounts (kind, handle);
exception
  when unique_violation then
    raise notice 'يوجد تكرار في (kind, handle) داخل payment_accounts — احذف المكرر ثم أعد تنفيذ 0009';
  when others then
    raise notice 'تعذّر إنشاء فهرس payment_accounts_kind_handle_key (%)', sqlerrm;
end;
$$;

-- ----------------------------------------------------------------------------
-- (٩) د٨ — قنوات الإشعار الافتراضية true/true
--
-- بذرة 0007 استخدمت `on conflict do nothing` فبقي الصف الحي بقيمتي false بينما
-- يشحن lib/site-config.ts القيمة true — فاختلفت الواجهة عن القاعدة. الإرسال
-- الفعلي يظل مشروطاً بوجود وجهة (chat id / بريد) وبيانات اعتماد في البيئة،
-- لذا رفع العَلَمين آمن ولا يُنتج أي إرسال بلا إعداد.
-- ----------------------------------------------------------------------------
update public.site_settings s
   set value = coalesce(s.value, '{}'::jsonb)
               || jsonb_build_object('telegramEnabled', true, 'emailEnabled', true)
 where s.key = 'notifications'
   and (s.value -> 'telegramEnabled' is distinct from 'true'::jsonb
        or s.value -> 'emailEnabled' is distinct from 'true'::jsonb);

-- الصف غائب كلياً (قاعدة لم تُبذر) ⇒ ننشئه بالقيم الصحيحة
insert into public.site_settings (key, value)
values (
  'notifications',
  '{
    "telegramChatId": null,
    "telegramEnabled": true,
    "emailTo": null,
    "emailEnabled": true
  }'::jsonb
)
on conflict (key) do nothing;

do $$
begin
  raise notice '✔ 0009_booking_hardening: د١ د٢ د٣ د٤ د٥ د٨ د٩ مطبَّقة';
end;
$$;
