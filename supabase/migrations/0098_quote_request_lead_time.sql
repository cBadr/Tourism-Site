-- ============================================================================
-- 0098_quote_request_lead_time.sql
-- أدنى مهلة قبل الانطلاق تُفرض على **طلب عرض السعر** كما تُفرض على الحجز
--
-- ── العيب الذي تُصلحه ──────────────────────────────────────────────────────
-- نموذج `/quote-request` كان بحقلَي تاريخ وساعة، وصار حقلاً واحداً
-- (`datetime-local`) كما في مسار الحجز. والحقل الجديد يعرض أرضيةً (`min`) من
-- `booking_min_pickup_at()` وسطراً يقول «نحتاج مهلة N دقيقة على الأقل».
--
-- 🔴 **وخاصية `min` في المتصفح تلميحٌ لا حارس**: تُتجاوَز بالكتابة اليدوية، وبمن
--    يترك النموذج مفتوحاً حتى يزحف «الآن» على اختياره، وبنداءٍ مباشر بلا متصفح
--    أصلاً. وقياس التعريف الحيّ (`pg_get_functiondef`) في 2026-08-17 أثبت أن
--    `create_quote_request` تفحص `p_pickup_at > now()` **وحدها** — أي أن الشاشة
--    كانت ستعلن قيداً لا تفرضه القاعدة، وهو نمطُ «الواجهة تَعِد بما لا تنفّذه
--    القاعدة» (النمط ٢ في `handover/LESSONS.md`) بحرفه.
--
-- ── ولماذا في القاعدة لا في مسار `/api` وحده ───────────────────────────────
-- `create_quote_request` **ممنوحة لـ`anon` و`authenticated`** (مقيس من
-- `information_schema.routine_privileges` في 2026-08-17)، ومفتاح `anon` منشورٌ
-- في حزمة المتصفح بطبعه. فحارسٌ في `app/api/quote-request/route.ts` وحده
-- يُتجاوَز بنداء PostgREST مباشر. والحارس هنا هو الحاجز، وما في المسار رفضٌ
-- مبكر برسالةٍ عربيةٍ تسمّي أقرب موعد متاح.
--
-- ── والمصدر واحد: نفس دالة الحجز ───────────────────────────────────────────
-- الحدّ من `public.booking_min_pickup_at()` — **الدالة نفسها** التي يفرضها
-- `create_booking` (‏0067) ويعرضها منتقي الحاسبة والنموذج. فلا معادلةَ مهلةٍ
-- ثانية تنحرف عن الأولى (النمط ٨: مصدران لرقم واحد).
--
-- ⚠ والمقارنة `<` لا `<=` — **نسخةٌ حرفية من `create_booking`**: الموعد المساوي
--   للحدّ مقبول، لأن الحدّ هو أقرب لحظة مسموحة لا أول لحظة ممنوعة، وهو ما
--   يعرضه المنتقي حرفياً. ولولا ذلك لصار ما تعرضه الشاشة بوصفه «أقرب موعد
--   متاح» مرفوضاً عند الضغط.
--
-- ⚠ و`null` من الدالة يعني «المهلة مطفأة» (‏`min_lead_minutes <= 0`) فيسقط
--   الشرط كله — إطفاؤها قرارُ مالكٍ لا سهو، والحارس يتبعه لا يعانده.
--
-- ⚠ وترتيب الفحوص مقصود: «مطلوب» ثم «مستقبلي» (`pickup-past`) ثم المهلة
--   (`lead-time`). موعدٌ ماضٍ يخالف الشرطين، ورمزُه الأدقّ هو الأول — وثلاث
--   مجموعات اختبار قائمة تتوقع `pickup-past` بعينه لموعدٍ في الأمس.
--
-- 🔴 **وأثرٌ يجب أن يعرفه المالك**: طلبُ عرضِ سعرٍ موعده داخل نافذة المهلة صار
--    **يُرفض** بعد هذه الهجرة، وكان يُقبل. والرسالة تدلّ العميل على أقرب موعد
--    متاح فلا يبقى في طريقٍ مسدود. وإن أراد المالك أن يصل الطلبُ القريب
--    لتتولّاه المبيعات يدوياً، فالإرجاع سطرٌ واحد: تُحذف كتلة `lead-time`
--    أدناه بهجرةٍ جديدة (‏ولا يُعدَّل ملفٌ مطبَّق — CONVENTIONS §٦).
--
-- ما لا تغيّره هذه الهجرة: التوقيع، ونوع الإرجاع، والصلاحيات، وكل فحصٍ آخر —
-- نُسخت من التعريف الحيّ الملتقط قبل التعديل (D-58) وأُضيفت إليه كتلةٌ واحدة.
-- ============================================================================

create or replace function public.create_quote_request(
  p_service_slug   text,
  p_customer_name  text,
  p_customer_phone text,
  p_details        text,
  p_origin_label   text,
  p_origin_lat     numeric,
  p_origin_lng     numeric,
  p_dest_label     text,
  p_dest_lat       numeric,
  p_dest_lng       numeric,
  p_pickup_at      timestamptz,
  p_passengers     integer,
  p_luggage        integer
)
returns table (id uuid, reference text)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_slug         text;
  v_name         text;
  v_phone        text;
  v_details      text;
  v_origin_label text;
  v_dest_label   text;
  v_digits       integer;
  v_id           uuid;
  v_ref          text;
  v_min_pickup   timestamptz;
  v_lead         integer;
begin
  v_name    := nullif(btrim(coalesce(p_customer_name, '')), '');
  v_phone   := nullif(btrim(coalesce(p_customer_phone, '')), '');
  v_slug    := nullif(btrim(coalesce(p_service_slug, '')), '');
  -- التفاصيل تُقصّ ولا تُرفض: من كتب ٥٠٠٠ حرف يستحق أن يصل طلبه لا أن ينكسر
  v_details := left(btrim(coalesce(p_details, '')), 2000);

  v_origin_label := nullif(btrim(coalesce(p_origin_label, '')), '');
  v_dest_label   := nullif(btrim(coalesce(p_dest_label, '')), '');

  if v_name is null then
    raise exception 'اسم العميل مطلوب' using hint = 'invalid-name';
  end if;
  if length(v_name) < 3 or length(v_name) > 120 then
    raise exception 'اسم العميل يجب أن يكون بين ٣ و١٢٠ حرفاً (طوله %)', length(v_name)
      using hint = 'invalid-name';
  end if;

  if v_phone is null then
    raise exception 'رقم هاتف العميل مطلوب' using hint = 'invalid-phone';
  end if;
  if length(v_phone) < 8 or length(v_phone) > 20 then
    raise exception 'رقم الهاتف يجب أن يكون بين ٨ و٢٠ محرفاً (طوله %)', length(v_phone)
      using hint = 'invalid-phone';
  end if;
  v_digits := length(regexp_replace(v_phone, '[^0-9]', '', 'g'));
  if v_digits < 8 then
    raise exception 'رقم الهاتف يجب أن يحوي ٨ أرقام على الأقل (وجدنا %)', v_digits
      using hint = 'invalid-phone';
  end if;

  -- الخدمة إما إحدى الست المعروفة أو لا شيء — لا نص حر يشوّش اللوحة
  if v_slug is not null
     and v_slug not in ('airport-transfer', 'city-rides', 'intercity-travel',
                        'tours', 'events', 'conferences') then
    raise exception 'الخدمة «%» غير معروفة', v_slug using hint = 'invalid-service';
  end if;

  -- 🔴 (D-09) الانطلاق نقطةٌ محلولة أو لا طلب: التسمية وحدها لا تُسعَّر
  if v_origin_label is null or p_origin_lat is null or p_origin_lng is null then
    raise exception 'نقطة الانطلاق يجب أن تكون مكاناً محدَّداً بإحداثياته'
      using hint = 'invalid-origin';
  end if;

  -- والوجهة إن ذُكرت فبالشرط نفسه — نصٌّ بلا إحداثيات يُرفض ولا يُقبل ناقصاً
  if (v_dest_label is null) <> (p_dest_lat is null)
     or (p_dest_lat is null) <> (p_dest_lng is null) then
    raise exception 'الوجهة يجب أن تكون مكاناً محدَّداً بإحداثياته أو تُترك فارغة'
      using hint = 'invalid-destination';
  end if;

  -- 🔴 مصر وحدها — مرآة `SERVICE_BOUNDS`، والرفض هنا قبل القيد ليخرج رمزٌ مفهوم
  if p_origin_lat not between 20 and 34 or p_origin_lng not between 23 and 38 then
    raise exception 'نقطة الانطلاق خارج نطاق التشغيل' using hint = 'out-of-area';
  end if;
  if p_dest_lat is not null
     and (p_dest_lat not between 20 and 34 or p_dest_lng not between 23 and 38) then
    raise exception 'الوجهة خارج نطاق التشغيل' using hint = 'out-of-area';
  end if;

  -- الموعد مطلوب ومستقبلي: طلبٌ بموعدٍ ماضٍ خطأُ إدخالٍ لا رغبةُ عميل، وطلبٌ
  -- بلا موعد لا يُسعَّر (نفس مبدأ حارس المهلة في الحجز).
  if p_pickup_at is null then
    raise exception 'موعد الرحلة مطلوب' using hint = 'invalid-pickup';
  end if;
  if p_pickup_at <= now() then
    raise exception 'موعد الرحلة يجب أن يكون في المستقبل' using hint = 'pickup-past';
  end if;

  -- ── 0098 — 🔒 أدنى مهلة قبل الانطلاق (نظير (أ-٢ب) في `create_booking`) ────
  --
  -- الحدّ من `booking_min_pickup_at()` نفسها لا من معادلةٍ تُحسب هنا، والمقارنة
  -- `<` فالمساوي مقبول. و`null` يعني المهلة مطفأة فيسقط الشرط.
  -- والرسالة تحمل الرقم والموعد معاً: العميل يعرف **ماذا يفعل الآن** لا أن
  -- طلبه رُفض. والرقم ليس سرّاً — هو بعينه ما تقوله رسالة رفض الحجز.
  v_min_pickup := public.booking_min_pickup_at();
  if v_min_pickup is not null and p_pickup_at < v_min_pickup then
    select t.min_lead_minutes into v_lead from public.trip_config() t;
    raise exception
      'موعد الرحلة أقرب من أدنى مهلة مطلوبة (% دقيقة) — أقرب موعد متاح %',
      v_lead, v_min_pickup
      using hint = 'lead-time';
  end if;

  if p_passengers is null or p_passengers < 1 or p_passengers > 200 then
    raise exception 'عدد الركاب يجب أن يكون بين ١ و٢٠٠ (وصلنا %)', coalesce(p_passengers, 0)
      using hint = 'invalid-passengers';
  end if;

  -- الحقائب اختيارية: غيابها يعني «لم يُذكر» لا صفراً
  if p_luggage is not null and (p_luggage < 0 or p_luggage > 400) then
    raise exception 'عدد الحقائب خارج المدى المقبول' using hint = 'invalid-luggage';
  end if;

  insert into public.quote_requests as q (
    service_slug, customer_name, customer_phone, details,
    origin_label, origin_lat, origin_lng,
    dest_label, dest_lat, dest_lng,
    pickup_at, passengers, luggage
  )
  values (
    v_slug, v_name, v_phone, v_details,
    v_origin_label, p_origin_lat, p_origin_lng,
    v_dest_label, p_dest_lat, p_dest_lng,
    p_pickup_at, p_passengers, p_luggage
  )
  returning q.id, q.reference into v_id, v_ref;

  id        := v_id;
  reference := v_ref;
  return next;
end;
$function$;

comment on function public.create_quote_request(
  text, text, text, text, text, numeric, numeric, text, numeric, numeric,
  timestamptz, integer, integer
) is
  'ينشئ طلب عرض سعر مُهيكلاً ويرجع رقمه المرجعي. 0098: يفرض أدنى مهلة قبل '
  'الانطلاق من booking_min_pickup_at() نفسها التي يفرضها create_booking — '
  'فخاصية min في المتصفح تلميحٌ يُتجاوَز، والدالة ممنوحة لـanon فالحارس هنا.';

-- ── فحصٌ يجري وقت الترحيل: الحارس موجودٌ فعلاً في التعريف الذي نزل ───────────
-- ملفٌّ يُطبَّق بلا أثر هو أخطر ما في الهجرات (تُسجَّل «مطبَّقة» ولا شيء تغيّر).
do $$
declare
  v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'create_quote_request';

  if v_def is null then
    raise exception '0098: create_quote_request غائبة بعد الترحيل';
  end if;
  if position('booking_min_pickup_at' in v_def) = 0
     or position('lead-time' in v_def) = 0 then
    raise exception '0098: حارس المهلة غير موجود في التعريف الذي نزل';
  end if;

  raise notice '✔ 0098: حارس أدنى المهلة مفروضٌ في create_quote_request';
end;
$$;
