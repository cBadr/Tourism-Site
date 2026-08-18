-- ============================================================================
-- 0107_quote_conversion_lead_time.sql
-- ب‑٣ (تتمّة): أدنى مهلة الانطلاق تُفرض **عند التحويل** كما تُفرض عند الإنشاء،
--              ومعها المخرجُ الذي يمنع الحارس من أن يكون طريقاً مسدوداً.
--
-- ── العيب، مقيساً لا مفترضاً ────────────────────────────────────────────────
--
-- قِيس في 2026-08-18 من الكتالوج الحيّ (`pg_get_functiondef`، D-58) لا من ملف
-- هجرة، على الدوال الثلاث التي تصنع صفَّ حجزٍ أو صفَّ طلب:
--
--   | الدالة | حارس `booking_min_pickup_at()` |
--   |---|---|
--   | `create_booking` (‏0067) | ✅ موجود · رمز `lead-time` |
--   | `create_quote_request` (‏0098) | ✅ موجود · رمز `lead-time` |
--   | `convert_quote_request` (‏0088) | 🔴 **غائب** — `pickup_at <= now()` وحده |
--
-- والغياب كان **بقصدٍ مكتوب** في جسم 0088، وحجّته صحيحة بحرفها: موعد الطلب غير
-- قابل للتعديل من اللوحة، ففرضُ المهلة بلا مخرجٍ كان يصنع طلباً عالقاً في
-- «مسعَّر» إلى الأبد، مخرجُه الوحيد تغييرُ `min_lead_minutes` — أي إسقاطُ حارسٍ
-- عالميّ لأجل صفٍّ واحد. فالعيب لم يكن في الحجّة بل في أن **المخرج لم يُبنَ**.
--
-- ── وما الذي يكسره الغياب فعلاً ────────────────────────────────────────────
--
-- الطلب يُنشأ بموعدٍ يعبر المهلة **يوم إنشائه**، ثم يمرّ يومان من التفاوض
-- والتسعير. و`booking_min_pickup_at()` تُحسب من `now()` — أي **تزحف**. فطلبٌ
-- كان موعده بعد ٣ أيام يصير موعده بعد ٣٠ دقيقة، والتحويل يقبله صامتاً ويُنشئ
-- حجزاً `pending_payment` لا يستطيع البثّ تنفيذه: `min_lead_minutes = 120`
-- موجودةٌ لأن المتعهد يحتاج ساعتين ليُرسل سيارة.
--
-- 🔴 **والثمن ليس رفضاً مرئياً بل حجزٌ يفشل بعد أن يدفع العميل.** وهذا أسوأ من
--    الرفض بمرتبة: الرفض يقع قبل المال، والفشل يقع بعده. وفي القاعدة اليوم
--    **صفر حجزٍ `failed`** — وهو رقمٌ يستحق أن يبقى صفراً.
--
-- ⚠ ولا تُقاس خطورته بعدد الصفوف اليوم: الطلبات ثلاثة، والقمع لم يُفتح للجمهور
--   بعد (`noindex`). فهذا إصلاحٌ **قبل** أول حالةٍ حقيقية لا بعدها.
--
-- ── القرار: حارسٌ + مخرج، لا حارسٌ وحده ────────────────────────────────────
--
-- (١) `convert_quote_request` — **بنفس بصمتها الستّية حرفاً**، يُضاف إليها فحصُ
--     المهلة بعد فحص «الموعد مضى» مباشرةً. والحدّ من `booking_min_pickup_at()`
--     **نفسها** لا من معادلةٍ ثانية (النمط ٨: مصدران لرقمٍ واحد ينحرفان)،
--     والمقارنة `<` لا `<=` — نسخةٌ حرفية من `create_booking` و`create_quote_request`،
--     فالموعد المساوي للحدّ مقبول. و`null` يعني المهلة مطفأة فيسقط الشرط كلّه:
--     إطفاؤها قرارُ مالكٍ لا سهو.
--
--     🔒 **ولماذا البصمة لا تتغيّر**: زيادةُ وسيطٍ سابع بـ`default` تُنشئ دالةً
--        **ثانية** ولا تستبدل الأولى — فتبقى السِتّية حيّةً وممنوحةً وبلا حارس،
--        ويكفي نداءٌ بستّة وسائط لتخطّي كل ما تضيفه هذه الهجرة. وحذفُها كان
--        يكسر مجموعةً قائمة لا أملكها (`quote_conversion_tests.sql`). فالاستبدال
--        في المكان هو الطريق الوحيد الذي يترك **مساراً واحداً** إلى صفِّ حجز.
--
-- (٢) `reschedule_quote_request` — **الدالة التي تجعل الحارس مخرجاً لا جداراً.**
--     المالك يتفق مع العميل على موعدٍ جديد فيكتبه، والقاعدة تفرض عليه **نفس
--     الأرضية** التي فرضتها على العميل. فما من موعدٍ يدخل النظام من أي بابٍ
--     دون المهلة.
--
--     ⚠ ولماذا دالةٌ منفصلة لا وسيطٌ داخل التحويل — والفرق ليس أسلوبياً:
--        إعادةُ الجدولة **حدثُ عملٍ قائمٌ بذاته** (مكالمةٌ جرت واتُّفق فيها على
--        موعد)، ويستحق أن يُسجَّل في `audit_quote_requests` سواءٌ أتمّ التحويل
--        بعده أم لا. ودمجُه في نداء التحويل كان يعني أن اتفاقاً حقيقياً يُمحى
--        لأن المالك أخطأ في خانة التكلفة.
--
--     ⚠ و«محوَّل» و«مرفوض» لا تُعاد جدولتهما: الأولى لها حجزٌ قائم (وموعده
--       يُعدَّل من شاشة الحجز لا من هنا)، والثانية طلبٌ أُغلق.
--
-- ── ترتيب الفحوص مقصود، ولا يُبدَّل ────────────────────────────────────────
--   «بلا موعد» (`pickup-required`) ← «مضى» (`pickup-past`) ← «دون المهلة»
--   (`lead-time`). موعدٌ في الأمس يخالف الشرطين معاً ورمزُه الأدقّ هو الثاني،
--   و`quote_conversion_tests.sql` قسم (د-٨) يتوقّع `pickup-past` بعينه لموعدٍ
--   قبل ثلاث ساعات — فالترتيب يُبقيها خضراء بحقّ لا بالمصادفة.
--
-- ── ما لا تفعله هذه الهجرة ─────────────────────────────────────────────────
--   لا تمسّ التسعير ولا الأرضية ولا اللقطة ولا الإشعارات ولا الصلاحيات القائمة،
--   ولا تُنشئ صفّاً، ولا تلمس صفَّ مالكٍ واحداً. `RQ-ZF83NH` و`RQ-6EGTGN`
--   و`RQ-SHWDMD` تبقى كما هي بحالاتها.
--
-- المرجع: 0088 (التحويل) · 0098 (المهلة على الطلب) · 0067 (المهلة على الحجز)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (١) شرطٌ مسبق — الهجرة تفترض أرضاً قِيست، فإن تغيّرت تتوقف بصوتٍ عالٍ
-- ----------------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.convert_quote_request(uuid,text,numeric,text,uuid,text)') is null then
    raise exception '0107: convert_quote_request الستّية غير موجودة — نفّذ 0088 أولاً';
  end if;
  if to_regprocedure('public.booking_min_pickup_at()') is null then
    raise exception '0107: booking_min_pickup_at غير موجودة — نفّذ 0067';
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- (٢) التحويل — **نفس البصمة**، والإضافة الوحيدة حارسُ المهلة
-- ----------------------------------------------------------------------------
create or replace function public.convert_quote_request(
  p_id               uuid,
  p_class_slug       text,
  p_partner_cost     numeric,
  p_dest_label       text default null,
  p_subcontractor_id uuid default null,
  p_note             text default null
)
returns table (
  quote_reference   text,
  booking_id        uuid,
  booking_reference text,
  public_token      text,
  total             numeric,
  amount_due        numeric,
  margin_amount     numeric
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_q          record;
  v_class      record;
  v_cost       numeric;
  v_floor      record;
  v_margin     numeric;
  v_dest       text;
  v_straight   numeric;
  v_distance   numeric;
  v_currency   text;
  v_trip       jsonb;
  v_note       text;
  v_id         uuid;
  v_ref        text;
  v_token      text;
  v_attempt    integer;
  v_min_pickup timestamptz;   -- 0107
  v_lead       integer;       -- 0107
begin
  if not public.is_admin() then
    raise exception 'تحويل طلب عرض السعر إلى حجز للمشرف وحده' using hint = 'forbidden';
  end if;

  if p_id is null then
    raise exception 'معرّف الطلب مطلوب' using hint = 'invalid-input';
  end if;

  -- قراءةٌ واحدة بقفل الصف: فلا يحوّله موظفان في اللحظة نفسها فينشأ حجزان
  -- لرحلةٍ واحدة. والقفل قبل كل فحصٍ لأن الفحص على صفٍّ غير مقفول رأيٌ قديم.
  select q.* into v_q from public.quote_requests q where q.id = p_id for update;
  if not found then
    raise exception 'طلب عرض السعر غير موجود' using hint = 'not-found';
  end if;

  -- (٣-١) الحالة: من «مسعَّر» وحدها. والمحاولة الثانية تجد «محوَّل» فتُرفض هنا،
  --       ويحرسها فوق ذلك الفهرس الفريد على `booking_id` وقيدُ الاقتران.
  if v_q.status <> 'quoted' then
    raise exception 'التحويل يبدأ من حالة «مسعَّر» وحدها (حالة الطلب الآن «%»)', v_q.status
      using hint = case when v_q.status = 'converted' then 'already-converted'
                        else 'not-quoted' end;
  end if;

  if v_q.booking_id is not null then
    raise exception 'هذا الطلب مرتبطٌ بحجزٍ سلفاً' using hint = 'already-converted';
  end if;

  -- (٣-٢) 🔒 السعر: قيد `quote_requests_priced_states_chk` يضمنه لحالة «مسعَّر»،
  --       والفحص هنا يجعل الرسالة مفهومةً بدل انفجارٍ عند الطرح.
  if v_q.quoted_amount is null or v_q.quoted_amount <= 0 then
    raise exception 'التحويل يحتاج تسعيرةً قائمة' using hint = 'amount-required';
  end if;

  -- (٣-٣) الرحلة: نقطة انطلاق محلولة، وموعدٌ مستقبليّ
  --
  -- ⚠ والموعد يُعاد فحصه هنا وقد فُحص عند الإنشاء: بين الطلب والتحويل أيامٌ،
  --   وحجزٌ انطلاقه في الماضي لا يُبَثّ ولا يُنفَّذ ولا يُكنس بمعنى.
  if v_q.origin_label is null or v_q.origin_lat is null or v_q.origin_lng is null then
    raise exception 'الطلب بلا نقطة انطلاق محدَّدة بإحداثياتها — لا يُحوَّل'
      using hint = 'origin-required';
  end if;

  if v_q.pickup_at is null then
    raise exception 'الطلب بلا موعد — ولا يُنشأ حجزٌ بلا موعد' using hint = 'pickup-required';
  end if;

  if v_q.pickup_at <= now() then
    raise exception 'موعد الرحلة مضى — لا يُحوَّل طلبٌ انطلاقه في الماضي'
      using hint = 'pickup-past';
  end if;

  -- ── 0107 — 🔒 أدنى مهلة الانطلاق، على الموعد **لحظةَ التحويل** ─────────────
  --
  -- 0088 تركت هذا الفحص عمداً لأن الطلب لم يكن يُعاد جدولته؛ وقد صار يُعاد
  -- (`reschedule_quote_request` أدناه)، فسقطت الحجّة وبقي الخطر. والحدّ يزحف مع
  -- `now()`: طلبٌ عبَر المهلة يوم إنشائه قد لا يعبرها بعد يومين من التفاوض،
  -- والحجزُ الناتج يصل البثَّ بلا وقتٍ كافٍ لإرسال سيارة.
  --
  -- ⚠ و`detail` رقمٌ لا جملة (اتفاقية «الخادم ← الواجهة رمزٌ لا جملة»): الشاشة
  --   تحتاج **أقرب موعدٍ متاح** لتملأ به حقل إعادة الجدولة، فيسافر بياناً
  --   بصيغة ISO. ولا سرّ فيه — هو بعينه ما يعرضه نموذج `/quote-request` للزائر.
  v_min_pickup := public.booking_min_pickup_at();
  if v_min_pickup is not null and v_q.pickup_at < v_min_pickup then
    select t.min_lead_minutes into v_lead from public.trip_config() t;
    raise exception
      'موعد الطلب صار أقرب من أدنى مهلة مطلوبة (% دقيقة) — أقرب موعد متاح %. اتفق مع العميل على موعدٍ جديد ثم أعد جدولة الطلب',
      v_lead, v_min_pickup
      using hint = 'lead-time',
            detail = 'min_pickup=' || to_char(v_min_pickup at time zone 'UTC',
                                              'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  end if;

  -- (٣-٤) الفئة: موجودةٌ ومفعَّلة، وتتسع للركاب والحقائب
  --
  -- 🔒 شرطا الأهلية **هما نفسهما** اللذان يفرضهما CTE `eligible` في `quote_price`
  --    (D-12): سعةُ الركاب وسعةُ الحقائب. والحجز صفٌّ بفئةٍ واحدة، فطلبٌ يحتاج
  --    سيارتين لا يُحوَّل صفّاً واحداً — يُقسَّم أو يُختار له ما يتسع.
  select vc.slug, vc.title, vc.capacity, vc.luggage_capacity
    into v_class
  from public.vehicle_classes vc
  where vc.slug = nullif(btrim(coalesce(p_class_slug, '')), '')
    and vc.active;

  if not found then
    raise exception 'فئة السيارة «%» غير موجودة أو غير مفعَّلة',
      coalesce(nullif(btrim(coalesce(p_class_slug, '')), ''), 'بلا')
      using hint = 'class-unknown';
  end if;

  if v_class.capacity < greatest(coalesce(v_q.passengers, 1), 1)
     or v_class.luggage_capacity < greatest(coalesce(v_q.luggage, 0), 0) then
    raise exception
      'فئة «%» تحمل % راكباً و% حقيبة، والطلب % راكباً و% حقيبة',
      v_class.title, v_class.capacity, v_class.luggage_capacity,
      greatest(coalesce(v_q.passengers, 1), 1), greatest(coalesce(v_q.luggage, 0), 0)
      using hint = 'class-too-small';
  end if;

  -- (٣-٥) 🔴 أساس التكلفة **مطلوب** — اقرأ ترويسة 0088 قبل تليينه
  if p_partner_cost is null then
    raise exception
      'أساس التكلفة مطلوب: بلا رقمٍ يُطرح من السعر لا يوجد هامشٌ يُقاس بالأرضية'
      using hint = 'cost-required';
  end if;

  v_cost := round(p_partner_cost, 2);
  if v_cost < 0 then
    raise exception 'أساس التكلفة لا يكون سالباً' using hint = 'cost-negative';
  end if;

  -- (٣-٦) 🔴🔴 **أرضية الهامش (D-16)** — بتعريفها الوحيد في القاعدة
  --
  -- `discount_floor_room` تُرجع `min_total` (أدنى إجمالٍ يحفظ الأرضية، مرفوعاً
  -- إلى `tariffs.min_price` للفئة) و`room = floor(total − min_total)`.
  -- والشرط `room >= 0` لا `> 0`: السعرُ المساوي للأرضية بالضبط مقبول — الأرضية
  -- حدٌّ أدنى لا حدٌّ ممنوع. (والكوبون يطلب `> 0` لأنه يحتاج مساحةً **ليقتطع**
  -- منها، وهو فرقُ غرضٍ لا تناقضُ رقم.)
  --
  -- ⚠ وتُقرأ **لحظةَ التحويل** لا لحظةَ التسعير: إعداداتُ الأرضية قد تكون
  --   تغيّرت بين اليومين، والحاجز يقيس بالمسطرة الحاضرة لا بالغائبة.
  select f.min_total, f.room into v_floor
  from public.discount_floor_room(v_q.quoted_amount, v_class.slug, v_cost) f;

  if v_floor.room < 0 then
    -- ⚠ و`detail` **رقمٌ لا جملة**: الشاشة تترجم الرموز ولا تطبع نصّ Postgres،
    --   لكن الرفض بلا الرقم يترك المالك يخمّن — فيسافر أدنى الإجمالي بياناً.
    raise exception
      'السعر % دون أرضية الهامش: على تكلفة % أدنى إجمالٍ مقبول %',
      v_q.quoted_amount, v_cost, v_floor.min_total
      using hint = 'below-floor', detail = 'min=' || v_floor.min_total::text;
  end if;

  v_margin := round(v_q.quoted_amount - v_cost, 2);

  -- (٣-٧) المتعهد الذي بُني عليه أساس التكلفة — اختياريّ، ومعناه «مَن سُعِّر
  --        على أساسه» لا «مَن أُسند إليه». الإسناد يبقى للبثّ وحده.
  if p_subcontractor_id is not null
     and not exists (select 1 from public.subcontractors s where s.id = p_subcontractor_id) then
    raise exception 'المتعهد غير موجود' using hint = 'partner-not-found';
  end if;

  -- (٣-٨) الوجهة — تسميةٌ مطلوبة، وإحداثياتٌ إن وُجدت
  --
  -- ⚠ ولماذا تسميةٌ بلا إحداثيات مقبولةٌ هنا وحدها في المشروع: قاعدة «لا يُسعَّر
  --   نصٌّ لم يُحلّ إلى نقطة» (D-09) تحرس **سعراً يُشتقّ من مسافة**، ولا سعر
  --   يُشتقّ هنا — السعر يدويّ.
  v_dest := coalesce(nullif(btrim(coalesce(p_dest_label, '')), ''), v_q.dest_label);
  if v_dest is null then
    raise exception 'وجهة الرحلة مطلوبة — اكتبها كما اتُّفق عليه'
      using hint = 'destination-required';
  end if;

  if v_q.dest_lat is not null and v_q.dest_lng is not null then
    v_straight := public.haversine_km(v_q.origin_lat, v_q.origin_lng,
                                      v_q.dest_lat,   v_q.dest_lng);
    -- تقديرٌ مُعلَن: هافرساين × ١٫٣ — مرآةُ `ESTIMATE_FACTOR` في `lib/geo/route.ts`
    -- (‏D-13). ولا يدخل سعراً: السعر يدويّ، والرقم لعرض الرحلة وحده.
    v_distance := round(coalesce(v_straight, 0) * 1.3, 1);
    if v_distance <= 0 then
      v_distance := null;
    end if;
  end if;

  select ps.currency into v_currency from public.pricing_settings ps limit 1;
  v_currency := coalesce(v_currency, 'EGP');

  -- (٣-٩) لقطة الرحلة — **بنفس مفاتيح `create_booking` حرفاً** (0031/0047/0067)
  --
  -- ⚠ اللقطة تخرج **كاملةً** إلى anon عبر `get_booking_by_token`، فليس فيها
  --   تكلفةٌ ولا هامشٌ ولا `admin_note` (D-19). و`notes` هي ما كتبه العميل بنفسه.
  --   والمفتاحان المضافان لا رقمَ فيهما ولا سرّ: أصلُ السعر ومرجعُ طلبِه هو.
  v_trip := jsonb_build_object(
    'originLabel',     v_q.origin_label,
    'originLat',       v_q.origin_lat,
    'originLng',       v_q.origin_lng,
    'destLabel',       v_dest,
    'destLat',         v_q.dest_lat,
    'destLng',         v_q.dest_lng,
    'distanceKm',      v_distance,
    'straightKm',      v_straight,
    'durationMin',     null,
    'distanceSource',  'estimate',
    'passengers',      greatest(coalesce(v_q.passengers, 1), 1),
    'roundTrip',       false,
    'waitingHours',    0,
    'pickupAt',        v_q.pickup_at,
    'notes',           nullif(btrim(coalesce(v_q.details, '')), ''),
    'discount',        null,
    'returnAt',        null,
    'luggage',         greatest(coalesce(v_q.luggage, 0), 0),
    'waitingDerived',  false,
    'extrasTotal',     0,
    'loyalty',         null,
    'flightNumber',    null,
    'priceOrigin',     'quote-request',
    'quoteRequestRef', v_q.reference
  );

  v_note := nullif(btrim(coalesce(p_note, '')), '');

  -- (٣-١٠) الإدراج — المرجع والتوكن يولّدهما المُشغّل، والتصادم يُعاد فيه
  --         (نفس نمط `create_booking`). و`tours.booking_note` تُضبط **داخل كل
  --         محاولة** لأن `log_booking_change` تمحوها بعد قراءتها.
  for v_attempt in 1 .. 5 loop
    begin
      perform set_config('tours.booking_note',
                         'تحويل طلب عرض السعر ' || v_q.reference, true);

      insert into public.bookings as b (
        status, class_slug, class_title, total, currency, plan,
        amount_due, amount_remaining,
        customer_name, customer_phone, customer_whatsapp, trip,
        price_source, subcontractor_id, subcontractor_cost, margin_amount
      )
      values (
        'pending_payment', v_class.slug, v_class.title, v_q.quoted_amount, v_currency, 'full',
        v_q.quoted_amount, 0,
        v_q.customer_name, v_q.customer_phone, v_q.customer_phone, v_trip,
        -- 🔒 `'subcontractor'` لأن هناك أساس تكلفةٍ حقيقيّاً: هو المفتاح الذي
        --    يجعل `dispatch_ceiling` تقرأ التكلفة المُدخلة بدل أن تشتقّها من
        --    سياسة الهامش — والاشتقاق على سعرٍ يدويّ يرفع السقف فوق تكلفتنا.
        'subcontractor', p_subcontractor_id, v_cost, v_margin
      )
      returning b.id, b.reference, b.public_token
      into v_id, v_ref, v_token;
      exit;
    exception
      when unique_violation then
        if v_attempt >= 5 then
          raise exception 'تعذّر توليد رقم مرجعي فريد للحجز' using hint = 'db-unavailable';
        end if;
    end;
  end loop;

  -- (٣-١١) نقلة الطلب — يمرّ بمُشغّل 0084 فيفحص «مسعَّر ← محوَّل» ويختم الطابع
  update public.quote_requests q
     set status       = 'converted',
         booking_id   = v_id,
         converted_at = now(),
         admin_note   = coalesce(v_note, q.admin_note)
   where q.id = p_id;

  quote_reference   := v_q.reference;
  booking_id        := v_id;
  booking_reference := v_ref;
  public_token      := v_token;
  total             := v_q.quoted_amount;
  amount_due        := v_q.quoted_amount;
  margin_amount     := v_margin;
  return next;
end;
$$;

comment on function public.convert_quote_request(uuid, text, numeric, text, uuid, text) is
  'ب‑٣: طلبٌ مسعَّرٌ ← حجزٌ حقيقي في معاملةٍ واحدة. 🔒 تفرض أرضية الهامش (D-16) على السعر اليدوي عبر discount_floor_room، وأساس التكلفة مطلوب. و0107: تفرض أدنى مهلة الانطلاق (booking_min_pickup_at) على موعد الطلب لحظةَ التحويل — ومخرجُها reschedule_quote_request.';

-- ----------------------------------------------------------------------------
-- (٣) إعادة الجدولة — المخرج الذي يجعل حارس المهلة بابًا لا جداراً
-- ----------------------------------------------------------------------------
create or replace function public.reschedule_quote_request(
  p_id        uuid,
  p_pickup_at timestamptz
)
returns table (
  id        uuid,
  reference text,
  pickup_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row        record;
  v_min_pickup timestamptz;
  v_lead       integer;
begin
  -- 🔒 D-20 (القاعدة الأم): `authenticated` يشمل كل متعهّدٍ من الباطن، فلا يعني
  --    مشرفاً أبداً. والحارس داخل الجسم لأن المنحة للدور لا للشخص.
  if not public.is_admin() then
    raise exception 'إعادة جدولة طلب عرض السعر للمشرف وحده' using hint = 'forbidden';
  end if;

  if p_id is null then
    raise exception 'معرّف الطلب مطلوب' using hint = 'invalid-input';
  end if;

  if p_pickup_at is null then
    raise exception 'الموعد الجديد مطلوب' using hint = 'pickup-required';
  end if;

  -- قفلُ الصف قبل الفحص — لنفس سبب `convert_quote_request`: فحصٌ على صفٍّ غير
  -- مقفول رأيٌ قديم، وموظفان يعيدان الجدولة معاً يكتب أحدهما فوق الآخر صامتاً.
  select q.id, q.reference, q.status, q.pickup_at into v_row
    from public.quote_requests q where q.id = p_id for update;
  if not found then
    raise exception 'طلب عرض السعر غير موجود' using hint = 'not-found';
  end if;

  -- «محوَّل» لها حجزٌ قائم وموعدُه يُعدَّل من شاشة الحجز لا من هنا — وإلا صار
  -- الطلب يقول موعداً والحجز يقول آخر. و«مرفوض» طلبٌ أُغلق.
  if v_row.status not in ('new', 'quoted') then
    raise exception
      'إعادة الجدولة من «جديد» أو «مسعَّر» وحدهما (حالة الطلب الآن «%»)', v_row.status
      using hint = case when v_row.status = 'converted' then 'already-converted'
                        else 'not-reschedulable' end;
  end if;

  if p_pickup_at <= now() then
    raise exception 'موعد الرحلة يجب أن يكون في المستقبل' using hint = 'pickup-past';
  end if;

  -- 🔒 **نفس الأرضية التي تُفرض على العميل** — من `booking_min_pickup_at()`
  --    نفسها، بمقارنة `<` نفسها. فلا بابَ خلفيّ يُدخل موعداً دون المهلة، ولا
  --    معادلةَ مهلةٍ ثانية تنحرف عن الأولى.
  v_min_pickup := public.booking_min_pickup_at();
  if v_min_pickup is not null and p_pickup_at < v_min_pickup then
    select t.min_lead_minutes into v_lead from public.trip_config() t;
    raise exception
      'الموعد الجديد أقرب من أدنى مهلة مطلوبة (% دقيقة) — أقرب موعد متاح %',
      v_lead, v_min_pickup
      using hint = 'lead-time',
            detail = 'min_pickup=' || to_char(v_min_pickup at time zone 'UTC',
                                              'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  end if;

  -- ⚠ الحالة والمبلغ لا يُمسّان: مُشغّل 0084 لا يستيقظ إلا لهما، وإعادة الجدولة
  --   ليست نقلةَ حالة. و`audit_quote_requests` يلتقط التغيير من تلقائه.
  update public.quote_requests q
     set pickup_at = p_pickup_at
   where q.id = p_id
  returning q.id, q.reference, q.pickup_at into v_row;

  id        := v_row.id;
  reference := v_row.reference;
  pickup_at := v_row.pickup_at;
  return next;
end;
$$;

comment on function public.reschedule_quote_request(uuid, timestamptz) is
  '0107: موعدٌ جديد لطلبٍ «جديد» أو «مسعَّر» بعد اتفاقٍ مع العميل. 🔒 للمشرف وحده (D-20)، وتفرض نفس أدنى مهلة الانطلاق التي يفرضها create_quote_request و create_booking — فلا موعد يدخل النظام من أي بابٍ دون المهلة.';

-- ----------------------------------------------------------------------------
-- (٤) الصلاحيات — تُعاد كاملةً لأن `create or replace` لا تُعيد ضبطها، و
--     `alter default privileges` في Supabase يمنح anon و authenticated
--     صلاحية EXECUTE على كل دالة **جديدة** تلقائياً (الفخّ الموثَّق في 0007
--     و0009 و0084 و0088).
-- ----------------------------------------------------------------------------
revoke all on function public.convert_quote_request(uuid, text, numeric, text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.convert_quote_request(uuid, text, numeric, text, uuid, text)
  to authenticated;

revoke all on function public.reschedule_quote_request(uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.reschedule_quote_request(uuid, timestamptz)
  to authenticated;

-- ----------------------------------------------------------------------------
-- (٥) فحصٌ ذاتي — يحرس ما بعد الهجرة **وما كان قائماً قبلها** (D-58)
-- ----------------------------------------------------------------------------
do $$
declare
  v_def text;
  v_n   integer;
begin
  -- (٥-١) 🔴 بصمةٌ واحدة لا اثنتان: حِملٌ زائدٌ بسبعة وسائط يترك السِتّية
  --        حيّةً بلا حارس، ونداءٌ بستّة يتخطّى كل ما سبق.
  select count(*) into v_n
    from pg_proc p
   where p.proname = 'convert_quote_request'
     and p.pronamespace = 'public'::regnamespace;
  if v_n <> 1 then
    raise exception
      '0107: وُجدت % بصمة لـconvert_quote_request — الحِمل الزائد يفتح مساراً بلا حارس المهلة', v_n;
  end if;

  -- (٥-٢) الحارس الجديد في الجسم الحيّ لا في هذا الملف
  v_def := pg_get_functiondef(
    to_regprocedure('public.convert_quote_request(uuid,text,numeric,text,uuid,text)')::oid);
  if position('booking_min_pickup_at' in v_def) = 0 then
    raise exception '0107: حارس المهلة غائبٌ عن جسم التحويل';
  end if;
  -- (٥-٣) وما كان قائماً لم يسقط في النسخ
  if position('discount_floor_room' in v_def) = 0 then
    raise exception '0107: 🔴 نداء أرضية الهامش سقط من جسم التحويل — انحدارُ D-16';
  end if;
  if position('cost-required' in v_def) = 0 then
    raise exception '0107: 🔴 أساس التكلفة صار اختيارياً — انحدار';
  end if;
  if position('is_admin' in v_def) = 0 then
    raise exception '0107: 🔴 حارس المشرف سقط من جسم التحويل — D-20';
  end if;
  if position('for update' in v_def) = 0 then
    raise exception '0107: 🔴 قفل الصف سقط — تحويلان متزامنان ينشئان حجزين';
  end if;

  -- (٥-٤) الصلاحيات: الزائر لا يصل إلى أيٍّ من البابين
  if has_function_privilege('anon',
       'public.convert_quote_request(uuid, text, numeric, text, uuid, text)', 'EXECUTE')
     or has_function_privilege('anon',
       'public.reschedule_quote_request(uuid, timestamp with time zone)', 'EXECUTE') then
    raise exception '0107: 🔴 الزائر يملك EXECUTE على مسار التحويل أو إعادة الجدولة';
  end if;

  raise notice '0107 ✔ حارس المهلة على التحويل · إعادة الجدولة · بصمةٌ واحدة · الصلاحيات مضبوطة';
end;
$$;
