-- ============================================================================
-- 0081 — 🔴 لا حجزَ بلا موعد، والقاعدة هي التي ترفضه
--
-- **قرار المالك 2026-08-17 حرفياً: «غير موافق على الحجز بدون موعد».** فهذه
-- حالةٌ غير مشروعة تُسدّ، لا حالةٌ قائمة يُستثنى منها حارس.
--
-- ── العطل كما قيس، لا كما وُصف ─────────────────────────────────────────────
--
--     POST /api/booking   (بلا حقل pickupAt)   min_lead_minutes = 120
--     → HTTP 200 {"ok":true,...}    ·   trip.pickupAt = null
--
-- `parsePickupAt` تُرجع `null` للحقل الغائب، وشرط المهلة في `create_booking`
-- مشروطٌ بـ`p_pickup_at is not null` — **فالحارس كله يسقط بحذف مفتاحٍ من
-- الجسم**. والأثر أوسع من المهلة: حجزٌ بلا موعد لا يُبَثّ ولا يُكنس ولا يُنفَّذ،
-- ونافذة هاتف السائق لا تُفتح له أصلاً (`get_booking_by_token` تُخرج
-- `phoneVisibleAt` فارغاً للقطةٍ بلا `pickupAt` — مكتوبٌ في الصفحة نفسها).
--
-- ── وما تقوله البيانات الحيّة قبل أي كتابة ─────────────────────────────────
--
-- قِيست القاعدة قبل هذه الهجرة (معاملةٌ أُرجعت): **٩ حجوزات، وصفرٌ منها بلا
-- موعد**. فلا صفَّ للمالك يُمسّ ولا يحتاج ترحيلاً — ولذلك جاز أن يكون الرفض
-- قاطعاً بلا استثناءٍ للقديم. والقياس يُعاد في الفحص الذاتي أدناه ويُعلَن.
--
-- ── ما تفعله هذه الهجرة، وما لا تفعله ──────────────────────────────────────
--
-- (١) `create_booking` ترفض `p_pickup_at is null` بتلميح `pickup-required`.
--     الجسم منقول من **الكتالوج الحيّ** (‏D-58) وما عدا الحارس محفوظٌ بنصّه.
--
-- ⛔ ولا قيد `check` على `bookings`: التعليل كاملاً عند الحارس نفسه في الجسم.
-- ⛔ ولا مساسَ بالمنح: التوقيع لم يتغيّر، و`create or replace` تُبقي ACL كما
--    هي — والفحص الذاتي أدناه يثبت أنها بقيت `service_role` وحده.
-- ⛔ ولا صفَّ بياناتٍ واحد يُكتب أو يُحذف: الشاهد السلوكي أدناه **رفضٌ** يقع
--    قبل أي إدراج، والشاهد الإيجابي مكانه مجموعة الاختبار حيث تُرجَع المعاملة.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_booking(p_origin jsonb, p_destination jsonb, p_passengers integer, p_round_trip boolean, p_waiting_hours numeric, p_distance_km numeric, p_duration_min numeric, p_distance_source text, p_class_slug text, p_plan text, p_customer_name text, p_customer_phone text, p_customer_whatsapp text, p_pickup_at timestamp with time zone, p_notes text, p_coupon_code text DEFAULT NULL::text, p_return_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_luggage integer DEFAULT 0, p_extras jsonb DEFAULT NULL::jsonb, p_redeem_points integer DEFAULT 0, p_flight_number text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, reference text, public_token text, total numeric, amount_due numeric, amount_remaining numeric, currency text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  v_code        text;
  v_disc        record;
  v_kind        text;
  v_total       numeric;
  v_margin      numeric;
  v_disc_json   jsonb := 'null'::jsonb;
  -- 0047 — ⚠ ما أخذه الكوبون من الميزانية، في متغيّرٍ **قائمٍ بذاته**: قراءة
  --   `v_disc.amount` داخل `case` تنفجر بـ«record is not assigned yet» حين لا
  --   كوبون، لأن plpgsql يبني وسائط الاستعلام قبل تنفيذه فلا قصرَ دائرة فيه.
  v_disc_amount numeric := 0;
  -- 0031
  v_luggage     integer;
  v_derived     numeric;
  v_derived_won boolean := false;
  v_x_total     numeric := 0;
  v_x_rows      jsonb   := '[]'::jsonb;
  -- 0047
  v_want        integer := 0;
  v_pts         record;
  -- ⚠ رايةٌ مستقلة لا `v_pts.applied`: plpgsql يقيّم شرط `if` **تعبيراً واحداً
  --   في SQL**، فلا قصرَ دائرةٍ فيه — و`v_want > 0 and v_pts.applied` ينفجر
  --   بـ«record is not assigned yet» في **كل حجزٍ بلا نقاط**. أمسكه الفحص
  --   الذاتي في أول تشغيل، ولم تكن قراءةٌ لتمسكه.
  v_loy_ok      boolean := false;
  v_loy_json    jsonb   := 'null'::jsonb;
  -- 0067
  v_min_pickup  timestamptz;
  v_lead        integer;
  v_flight      text;
begin
  -- (أ) تطهير المدخلات النصية
  v_name     := nullif(btrim(coalesce(p_customer_name, '')), '');
  v_phone    := nullif(btrim(coalesce(p_customer_phone, '')), '');
  v_whatsapp := nullif(btrim(coalesce(p_customer_whatsapp, '')), '');
  v_slug     := nullif(btrim(coalesce(p_class_slug, '')), '');
  v_plan     := lower(nullif(btrim(coalesce(p_plan, '')), ''));
  v_code     := public.discount_normalize_code(p_coupon_code);
  -- 0067 — رقم الرحلة يُطبَّع ولا يُحكم عليه (انظر (٤) أعلاه)
  v_flight   := public.normalize_flight_number(p_flight_number);

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

  -- (أ-٢أ) 0081 — 🔴 **موعد الانطلاق مطلوب**
  --
  -- قرار المالك 2026-08-17: «غير موافق على الحجز بدون موعد». وقبله كان
  -- `p_pickup_at` يقبل `null` منذ 0007، فينشأ حجزٌ بموعدٍ فارغ **يتجاوز حارس
  -- المهلة كلياً** (شرط (أ-٢ب) أدناه مشروطٌ بـ`is not null`) — أي أن أشدّ ما
  -- بُني في أ‑٢ يسقط بحذف مفتاحٍ من جسم الطلب.
  --
  -- 🔒 **وموضع الحارس هنا لا في معالج المسار.** `app/api/booking/route.ts`
  -- يحرس اليوم كذلك، لكنه ليس الطريق الوحيد إلى هذه الدالة: كل من يملك مفتاح
  -- الخدمة (سكربتات البذرة، أدوات التشغيل، أي مسارٍ يُكتب غداً) ينادي الدالة
  -- مباشرةً بلا المرور به. وهو الدرس نفسه الذي كتبت 0060 حرفاً بحرف: قسرٌ في
  -- TypeScript فوق قاعدةٍ لا تعرف القاعدة = «حمايةٌ بالعُرف لا بالحاجز».
  --
  -- ⚠ **وتلميحٌ مستقلّ لا `invalid-input`** — لأن العلاج مختلف: «راجع الحقول»
  -- تدفع العميل يفتّش في نموذجٍ كل ما فيه صحيح، والصواب أن يعود إلى الخطوة
  -- الأولى ويختار موعداً. و`Checkout` تفعل ذلك بنفسها عند رؤية الرمز، تماماً
  -- كما تفعل مع `lead-time`.
  --
  -- ⚠ **وموضعه قبل فحص العودة بقصد**: (أ-٢) أدناه يرفض «عودةٌ بلا انطلاق»
  -- بـ`invalid-input`، فلو تُرك أولاً لخرج نصف الحالات بالتلميح العام —
  -- ورسالةُ الشاشة تفترق عن سببها الحقيقي.
  --
  -- ⚠ **ولا قيدٌ على `bookings` بجواره.** الموعد يعيش في لقطة `trip` (لا عمود
  -- له)، وقيدُ `check ((trip ->> 'pickupAt') is not null)` كان سيرفض كذلك كل
  -- صفٍّ تزرعه مجموعات الاختبار بلقطةٍ مصغّرة — وهي تجهيزاتٌ تصف حجوزاً **قبل**
  -- هذه القاعدة لا حجوزاً تخالفها. والكتابةُ المباشرة إلى الجدول مسحوبةٌ أصلاً
  -- من `anon` و`authenticated` (مقيسٌ حياً: `has_table_privilege` = false
  -- للاثنين، ولا سياسة `insert` على الجدول)، فالطريق الوحيد الباقي إلى صفِّ
  -- حجزٍ جديد هو هذه الدالة بعينها.
  if p_pickup_at is null then
    raise exception 'موعد الانطلاق مطلوب — لا يُنشأ حجزٌ بلا موعد'
      using hint = 'pickup-required';
  end if;

  -- (أ-٢) 0031 — 🔒 تاريخ العودة يُتحقَّق **في SQL** (ف٧)
  --
  -- كل تحقق التواريخ اليوم في TypeScript (`app/api/booking/route.ts:138-151`)،
  -- وتاريخ العودة كان سيرث الفراغ نفسه. وهو **يُرفض لا يُتجاهل**: عودةٌ قبل
  -- الانطلاق تعني نموذجاً مقروءاً بالخطأ أو مستدعياً يعبث، وتجاهلها بصمت يُنتج
  -- حجزاً بساعات انتظار صفر بينما العميل يظن أنه دفع مقابل انتظار.
  if p_return_at is not null then
    if p_pickup_at is null then
      raise exception 'تاريخ العودة بلا تاريخ انطلاق' using hint = 'invalid-input';
    end if;
    if p_return_at <= p_pickup_at then
      raise exception 'تاريخ العودة يجب أن يكون بعد تاريخ الانطلاق'
        using hint = 'invalid-input';
    end if;
  end if;

  -- (أ-٢ب) 0067 — 🔒 أدنى مهلة قبل الانطلاق
  --
  -- الحدّ يُقرأ من `booking_min_pickup_at()` — **الدالة نفسها** التي يعرضها
  -- منتقي التاريخ في الحاسبة، فلا معادلة ثانية. و`null` منها يعني «مطفأة»
  -- فيسقط الشرط كله.
  --
  -- ⚠ **والموعد الغائب لا يُرفض هنا.** `p_pickup_at` يقبل `null` منذ 0007،
  -- وحجزٌ بلا موعد لا يخالف مهلةً أصلاً؛ ورفضُه هنا يكسر مستدعياً قائماً
  -- لسببٍ لا علاقة له بهذه القاعدة. أما مسار الحجز العام فيرسل الموعد دائماً.
  --
  -- ⚠ والمقارنة `<` لا `<=`: الموعد المساوي للحدّ **مقبول** — الحدّ هو أقرب
  -- لحظة مسموحة لا أول لحظة ممنوعة، وهو ما يعرضه المنتقي حرفياً. ولولا ذلك
  -- لصار ما تعرضه الشاشة بوصفه «أقرب موعد متاح» مرفوضاً عند الضغط.
  if p_pickup_at is not null then
    v_min_pickup := public.booking_min_pickup_at();
    if v_min_pickup is not null and p_pickup_at < v_min_pickup then
      select t.min_lead_minutes into v_lead from public.trip_config() t;
      raise exception
        'موعد الانطلاق أقرب من أدنى مهلة مطلوبة (% دقيقة) — أقرب موعد متاح %',
        v_lead, v_min_pickup
        using hint = 'lead-time';
    end if;
  end if;

  v_passengers := greatest(coalesce(p_passengers, 1), 1);
  v_round_trip := coalesce(p_round_trip, false);
  v_distance   := coalesce(p_distance_km, 0);
  v_luggage    := greatest(coalesce(p_luggage, 0), 0);

  -- (أ-٣) 0031 — الانتظار: **الأكبر** من المطلوب والمشتق، لا الاستبدال.
  --
  -- المشتق **أرضية لا سقف**: العميل قد يطلب انتظاراً أطول من فارق التوقيت (يريد
  -- السائق منتظراً ساعتين بعد عودته)، والاستبدالُ كان سيبتلع طلبه بصمت. والعكس
  -- ممنوع أيضاً: من يعود بعد ست ساعات لا يدفع ساعةً واحدة لأنه كتب ١ في الحقل.
  v_derived     := public.derive_waiting_hours(p_pickup_at, p_return_at);
  v_waiting     := greatest(coalesce(p_waiting_hours, 0), 0);
  v_derived_won := coalesce(v_derived, 0) > v_waiting;
  v_waiting     := greatest(v_waiting, coalesce(v_derived, 0));

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

  -- (أ-٤) 🔒 د١ (0009) — المسافة تُقاس على الخريطة لا تُعلَن من المستدعي
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
  perform set_config('tours.pricing_internals', 'on', true);

  select q.class_slug, q.class_title, q.total,
         q.price_source, q.subcontractor_id, q.subcontractor_cost, q.margin_amount
    into v_offer
  from public.quote_price(v_distance, v_passengers, v_round_trip, v_waiting,
                          v_origin_lat, v_origin_lng, v_dest_lat, v_dest_lng,
                          v_luggage) q
  where q.class_slug = v_slug;

  perform set_config('tours.pricing_internals', '', true);

  -- الفئة غير المؤهلة **لركابٍ أو لحقائب** ⇒ نفس الرمز كما اليوم
  if v_offer.class_slug is null then
    raise exception 'الفئة «%» غير متاحة لرحلة بـ % راكباً و% حقيبة',
      v_slug, v_passengers, v_luggage
      using hint = 'class-unavailable';
  end if;

  if v_offer.total is null or v_offer.total <= 0 then
    raise exception 'تعذّر احتساب سعر الرحلة' using hint = 'pricing-failed';
  end if;

  -- (ب-٢) 🔒 الخصم — طبقة تالية لبناء السعر، والحاجز داخل apply_discount
  v_total  := v_offer.total;
  v_margin := v_offer.margin_amount;

  if v_code is not null then
    -- ⚠⚠ (ف٩) `v_offer.total` = **إجمالي الرحلة وحده**. الخدمات لم تُضف بعد
    -- ولن تُضاف قبل هذا السطر: الكوبون يخصم الرحلة لا كرسي الأطفال، وأرضية
    -- الهامش لا تعدّ إيراد الخدمات هامشاً (قرار بدر ب).
    select * into v_disc
    from public.apply_discount(v_code, v_offer.total, v_offer.class_slug,
                               v_offer.subcontractor_cost, v_phone);

    if not v_disc.applied then
      -- رسالة واحدة لكل الأسباب: التفريق يخبر من يخمّن الرموز أنه اقترب.
      raise exception 'رمز الخصم غير صالح لهذه الرحلة' using hint = 'coupon-rejected';
    end if;

    select c.kind into v_kind from public.coupons c where c.code = v_code;

    v_disc_amount := v_disc.amount;
    v_total       := v_disc.total_after;
    if v_margin is not null then
      v_margin := greatest(round(v_margin - v_disc.amount, 2), 0);
    end if;

    -- 🔒 **لا `clamped` في اللقطة.** `bookings.trip` يخرج كاملاً من
    -- `get_booking_by_token(text)` (0007) وهي ممنوحة لـ anon، فحاملُ توكن كان
    -- سيقرأ «سعر رحلتك لامس أرضية الهامش» ومنها التكلفة + الأرضية. والراية
    -- محفوظة في `coupon_redemptions.clamped` المحجوب عن غير المشرف.
    v_disc_json := jsonb_build_object(
      'code',        v_code,
      'kind',        v_kind,
      'amount',      v_disc.amount,
      'totalBefore', v_offer.total,
      'totalAfter',  v_disc.total_after
    );
  end if;

  -- (ب-٢ب) 0047 — ★ استبدال النقاط: طبقةٌ **ثالثة، بعد الكوبون وقبل الخدمات**
  --
  -- **بعد الكوبون** لأن النقاط مالٌ يملكه العميل سلفاً والكوبون تنزيلٌ من
  -- المنصة، فتُستهلك على ما **بقي** بعد تنزيلاتنا. و**قبل الخدمات** لأن الخدمة
  -- بندٌ تكلفته علينا، فشراؤها بنقاطٍ خسارةٌ صافية لا تنزيلُ ربح (§٢ · D-54).
  --
  -- 🔒 و`v_offer.total` هو المُمرَّر — **الإجمالي قبل الكوبون** — ومعه ما أخذه
  --    الكوبون: ميزانيةٌ واحدة تُقتسم، لا ميزانيةٌ ثانية تُفتح من `v_total`.
  v_want := greatest(coalesce(p_redeem_points, 0), 0);

  if v_want > 0 then
    select * into v_pts
    from public.apply_points(v_phone, v_want, v_offer.total, v_offer.class_slug,
                             v_offer.subcontractor_cost, v_disc_amount);

    if not v_pts.applied then
      -- رسالة واحدة لكل الأسباب كنظيرتها في الكوبون: تفصيلُ سبب الرفض يخبر
      -- من يجرّب أرقام غيره أين وقف بالضبط.
      raise exception 'تعذّر استبدال النقاط في هذه الرحلة' using hint = 'points-rejected';
    end if;

    v_loy_ok := true;
    v_total  := v_pts.total_after;
    if v_margin is not null then
      v_margin := greatest(round(v_margin - v_pts.amount, 2), 0);
    end if;

    -- ولا `clamped` هنا كذلك، وللسبب نفسه حرفياً (اللقطة تخرج إلى anon)
    v_loy_json := jsonb_build_object(
      'points',      v_pts.points,
      'amount',      v_pts.amount,
      'totalBefore', v_total + v_pts.amount,
      'totalAfter',  v_pts.total_after
    );
  end if;

  -- (ب-٣) 0031 — ★ الخدمات: طبقةٌ **بعد** الذروة و**بعد** الخصم معاً.
  --
  -- تُسعَّر مرة واحدة وتُحفظ سطورها في jsonb: نداءان لـ`price_extras` (واحد
  -- للمجموع وآخر للإدراج) كانا سيفتحان فرقاً لو عدّل المالك الكتالوج بين
  -- اللحظتين — فيُخزَّن سعرٌ غير الذي دخل الإجمالي.
  select
    coalesce(sum(x.line_total), 0),
    coalesce(
      jsonb_agg(jsonb_build_object(
        'extraId',   x.extra_id,
        'title',     x.title,
        'qty',       x.qty,
        'unitPrice', x.unit_price,
        'lineTotal', x.line_total
      )),
      '[]'::jsonb
    )
    into v_x_total, v_x_rows
  from public.price_extras(p_extras) x;

  v_total := v_total + v_x_total;

  -- (ج) العملة من إعدادات التسعير (لا نص ثابت في الكود)
  select ps.currency into v_currency from public.pricing_settings ps limit 1;
  v_currency := coalesce(v_currency, 'EGP');

  -- (د) العربون من مفتاح الإعدادات payment — **من الإجمالي النهائي**
  --     (بعد الخصم وبعد الخدمات: العربون نسبة مما يدفعه العميل فعلاً).
  select s.value into v_pay from public.site_settings s where s.key = 'payment';
  v_percent := public.jsonb_number(v_pay, 'depositPercent', 30);
  v_min     := public.jsonb_number(v_pay, 'depositMinAmount', 200);

  if v_plan = 'deposit' then
    -- النسبة أو الحد الأدنى أيهما أكبر، وبحد أقصى الإجمالي (لا عربون يفوق السعر)
    v_due := least(v_total, greatest(round(v_total * v_percent / 100), v_min));
    v_due := greatest(v_due, 0);
  else
    v_due := v_total;
  end if;
  v_remaining := greatest(v_total - v_due, 0);

  -- (هـ) لقطة الرحلة — تُحفظ كما هي ولا تتأثر بأي تعديل لاحق للتعريفات أو الكوبون.
  --
  -- ⚠ (ف٦) هذه اللقطة تخرج **كاملة** إلى anon عبر `get_booking_by_token`، ولهذا
  -- ليس فيها تكلفة ولا هامش ولا `extra_id`: `extrasTotal` رقمٌ دفعه العميل،
  -- و`returnAt`/`luggage` مدخلاته هو، و`waitingDerived` تفسيرٌ له لا سرّ لنا.
  -- ⚠ (ف٨) وكل مفاتيح الإحداثيات باقية بأسمائها: `dispatch_pool` تُسقط الحجز
  -- إلى الطابور اليدوي إن غاب أيٌّ منها.
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
    'notes',          nullif(btrim(coalesce(p_notes, '')), ''),
    'discount',       v_disc_json,
    -- 0031
    'returnAt',       p_return_at,
    'luggage',        v_luggage,
    'waitingDerived', v_derived_won,
    'extrasTotal',    v_x_total,
    -- 0047 — ⚠ **بعد `extrasTotal` ولا يغيّره**: مُشغّل الكسب يقرأ
    --        `total − extrasTotal`، فأي مساسٍ بهذا المفتاح يزيح أساس الكسب.
    'loyalty',        v_loy_json,
    -- 0067 — مُدخل عميلٍ يصف الرحلة، من صنف `notes`. **آخر المفاتيح** فلا
    --        يزيح شيئاً قبله، ولا رقم فيه ولا سرّ فيخرج إلى anon بلا ضرر.
    'flightNumber',   v_flight
  );

  -- (و) الإدراج — المرجع والتوكن يولّدهما المُشغّل، وتصادمهما يُعالَج بإعادة المحاولة.
  perform set_config('tours.booking_note', 'إنشاء الحجز', true);

  for v_attempt in 1 .. 5 loop
    begin
      insert into public.bookings as b (
        status, class_slug, class_title, total, currency, plan,
        amount_due, amount_remaining,
        customer_name, customer_phone, customer_whatsapp, trip,
        price_source, subcontractor_id, subcontractor_cost, margin_amount
      )
      values (
        'pending_payment', v_offer.class_slug, v_offer.class_title, v_total, v_currency, v_plan,
        v_due, v_remaining,
        v_name, v_phone, v_whatsapp, v_trip,
        coalesce(v_offer.price_source, 'tariff'), v_offer.subcontractor_id,
        v_offer.subcontractor_cost, v_margin
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

  -- (ز-٠) 0031 — سطور الخدمات **بعد** إدراج الحجز (المفتاح الأجنبي) ومن نفس
  --        اللقطة التي دخلت الإجمالي، داخل المعاملة نفسها.
  if jsonb_array_length(v_x_rows) > 0 then
    insert into public.booking_extras (
      booking_id, extra_id, title_snapshot, qty, unit_price, line_total
    )
    select
      v_id,
      (e.item ->> 'extraId')::uuid,
      e.item ->> 'title',
      (e.item ->> 'qty')::integer,
      (e.item ->> 'unitPrice')::numeric,
      (e.item ->> 'lineTotal')::numeric
    from jsonb_array_elements(v_x_rows) as e(item);
  end if;

  -- (ز) 🔒 تسجيل الاستخدام **داخل نفس المعاملة**: فشلُه يُسقط الحجز كله، فلا
  --     يوجد حجز بسعر مخصوم بلا استخدام مسجَّل، ولا يتجاوز كوبونٌ سقفه لأن
  --     الخاسر في السباق تنهار معاملته بأكملها.
  if v_code is not null then
    perform set_config('tours.discount_clamped',
                       case when v_disc.clamped then 'on' else 'off' end, true);
    perform public.redeem_coupon(v_code, v_id, v_disc.amount, v_phone);
    perform set_config('tours.discount_clamped', '', true);
  end if;

  -- (ز-٢) 0047 — 🔒 وخصمُ النقاط بالمنطق نفسه وللسبب نفسه: القفل والكتابة
  --       داخل معاملة الحجز. فشلُه (رصيدٌ استُهلك في حجزٍ متزامن) يُسقط الحجز
  --       كله، فلا يوجد حجزٌ بسعرٍ مخصومٍ بنقاطٍ لم تُخصم من أحد (D-48).
  if v_loy_ok then
    perform public.redeem_points(v_id, v_phone, v_pts.points, v_pts.amount);
  end if;

  id               := v_id;
  reference        := v_reference;
  public_token     := v_token;
  total            := v_total;
  amount_due       := v_due;
  amount_remaining := v_remaining;
  currency         := v_currency;
  return next;
end;
$function$;

comment on function public.create_booking(
  jsonb, jsonb, integer, boolean, numeric, numeric, numeric, text, text, text,
  text, text, text, timestamptz, text, text, timestamptz, integer, jsonb, integer, text
) is
  '0081: موعد الانطلاق صار **مطلوباً** — p_pickup_at null يُرفض بتلميح pickup-required (قرار المالك 2026-08-17). وما عداه محفوظ بنصّه من الكتالوج الحيّ (D-58): حارس المهلة 0067، ورقم الرحلة، والخصم والنقاط داخل المعاملة.';

-- ----------------------------------------------------------------------------
-- الفحص الذاتي — كتالوجيٌّ **وسلوكيّ**.
--
-- والسلوكي هو الذي يهمّ: نصٌّ في الجسم يثبت أن السطر كُتب، ولا يثبت أن الدالة
-- ترفض. والنداء أدناه **لا يكتب صفاً**: الحارس يقع قبل بحث الفئة وقبل أي
-- إدراج، فلا يحتاج فئةً نشطة ولا يترك أثراً.
-- ----------------------------------------------------------------------------
do $$
declare
  v_body   text;
  v_oid    oid;
  v_ok     boolean := false;
  v_hint   text;
  v_nulls  integer;
begin
  select p.oid, pg_get_functiondef(p.oid) into v_oid, v_body
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'create_booking';

  if v_body is null then
    raise exception '0081: create_booking غير موجودة بعد إعادة الإنشاء';
  end if;

  -- (١) الحارس الجديد في الجسم الحيّ
  if position('pickup-required' in v_body) = 0 then
    raise exception '0081: الجسم الجديد بلا تلميح pickup-required';
  end if;

  -- (٢) 🔒 ولا انحدار: علامات كل إصلاحٍ سابق ما زالت في الجسم. النقلُ من
  --     الكتالوج الحيّ يحمي من هذا، وهذا الفحص يثبت أن النقل وقع فعلاً.
  if position('booking_min_pickup_at' in v_body) = 0
     or position('lead-time' in v_body) = 0
     or position('flightNumber' in v_body) = 0
     or position('apply_discount' in v_body) = 0
     or position('redeem_coupon' in v_body) = 0
     or position('apply_points' in v_body) = 0
     or position('redeem_points' in v_body) = 0
     or position('price_extras' in v_body) = 0
     or position('haversine_km' in v_body) = 0
     or position('derive_waiting_hours' in v_body) = 0
     or position('pricing_internals' in v_body) = 0 then
    raise exception '0081: انحدار — علامة إصلاحٍ سابق غابت من create_booking';
  end if;

  -- (٣) المنح كما كانت: service_role وحده
  if has_function_privilege('anon', v_oid, 'execute')
     or has_function_privilege('authenticated', v_oid, 'execute') then
    raise exception '0081: create_booking انفتحت لدور مستخدم بعد إعادة الإنشاء';
  end if;

  -- (٤) 📏 قياسٌ يُعلَن لا يُفترض: كم صفاً قائماً بلا موعد؟
  select count(*) into v_nulls
  from public.bookings b where (b.trip ->> 'pickupAt') is null;

  if v_nulls > 0 then
    raise notice '  ↳ 0081: ⚠ % صفَّ حجزٍ قائمٍ بلا موعد — **لم يُمسّ ولن يُمسّ**، والحارس على الإنشاء وحده', v_nulls;
  else
    raise notice '  ↳ 0081: لا صفَّ حجزٍ قائمٍ بلا موعد — الرفض قاطعٌ بلا ترحيل';
  end if;

  -- (٥) 🔬 الشاهد السلوكي: نداءٌ حقيقي بلا موعد **يجب أن يُرفض بالتلميح**.
  --     الفئة نصٌّ أيّاً كان: الحارس يسبق بحثها، فلا يعتمد الفحص على بيانات.
  begin
    perform * from public.create_booking(
      '{"label": "القاهرة", "lat": 30.0444, "lng": 31.2357}'::jsonb,
      '{"label": "الإسكندرية", "lat": 31.2001, "lng": 29.9187}'::jsonb,
      1, false, 0, 220, 180, 'osrm', 'MIGRATION_0081_PROBE', 'full',
      'فحص 0081', '01000000000', null, null, 'MIGRATION_0081_SELFCHECK'
    );
  exception when others then
    v_ok := true;
    get stacked diagnostics v_hint = pg_exception_hint;
  end;

  if not v_ok then
    raise exception '0081: 🔴 حجزٌ بلا موعد مرّ بعد الهجرة — الحارس لم يُطبَّق';
  end if;
  if coalesce(v_hint, '') <> 'pickup-required' then
    raise exception '0081: رُفض بتلميح «%» لا «pickup-required» — الواجهة تفرّع على التلميح',
      coalesce(v_hint, 'بلا تلميح');
  end if;

  raise notice '✔ 0081: create_booking ترفض الموعد الغائب بتلميح pickup-required، وما عداه محفوظ بنصّه';
end;
$$;
