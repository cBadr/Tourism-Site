-- ============================================================================
-- 0067_lead_time_and_flight.sql — رحلتان لا تُنفَّذان، تُمنعان من المنبع
--
-- بندان مستقلان في الموضوع، مجتمعان في هذا الملف لسببٍ واحد: كلاهما يمسّ
-- **جسم `create_booking` نفسه**، وتوقيعها لا يتغيّر مرتين في يومٍ واحد بلا
-- ثمن (كل تغيير توقيع = إسقاطٌ وإعادةُ إنشاءٍ ومنحٌ من جديد، ومستهلكوها
-- يكتبون التوقيع نصّاً في اختباراتهم). فالجراحة واحدة كما فعلت 0031 بالضبط.
--
-- ── (أ‑٢) أدنى مهلة قبل الانطلاق ─────────────────────────────────────────
--
-- حجزٌ موعده بعد عشر دقائق **لا يمكن تنفيذه**: البثّ يعمل بموجاتٍ مؤقّتة
-- (`dispatch_settings.window_minutes` × `max_rounds` = ساعةٌ كاملة على القيم
-- السارية اليوم) وقبل أن يتحرّك أحد، والمتعهد يحتاج زمن وصول فوق ذلك. فقبوله
-- ليس تساهلاً بل **إنشاء رحلةٍ وُلدت ميتة** — وللرحلة الفاشلة في هذا المنتج
-- أثرٌ مالي حقيقي (`docs/phase-briefs/FAILED-TRIPS-AND-PARTNER-ALERTS.md`).
--
-- 🔒 والقاعدة **قاعدة صحّة لا تلميح واجهة** (D-05): تُفرض داخل `create_booking`
-- فيرتدّ عنها كل منادٍ — مسار `/api/booking`، ونداءٌ مباشر بمفتاح الخدمة،
-- وسكربتٌ يدوي. والواجهة تمنع الاختيار قبل أن يقع، فلا يرى العميل رسالةَ رفضٍ
-- بعد أن ملأ النموذج كاملاً.
--
-- ⚠ **والافتراضي صفر — أي مطفأة — بقرارٍ لا بسهو.** المهلة **سياسة تشغيل
-- يملكها بدر** لا رقمٌ هندسي (`docs/STANDING-ORDERS.md` §٣: «قرارات منتج لا
-- هندسة»)، وشحنُها بقيمةٍ نختارها نحن يعني رفض حجوزات حقيقية على قاعدةٍ حيّة
-- لحظةَ تطبيق الهجرة. وهو حرفياً حكم `unpaid_cancel_enabled` في 0027 (نمط
-- الفشل ٧ في `handover/LESSONS.md`): ميزةٌ ترفض أو تلغي طلباً حقيقياً بلا
-- تدخّل بشري **لا تُشحن مفعّلة**. والصفر يعني «سلوك اليوم حرفياً»، والتفعيل
-- حقلٌ واحد في `/admin/settings#trips` ومعه توصيةٌ مشتقّة من إعدادات البثّ.
--
-- ── (ج‑٣) رقم الرحلة الجوية حقلاً مستقلاً ────────────────────────────────
--
-- نقل المطار جزءٌ كبير من هذا العمل، ورقم الرحلة يُكتب اليوم داخل `notes`
-- النصّية — فلا يقرؤه نظام، ولا يُستخرج، ولا يُبنى فوقه تتبّع تأخير. فصار
-- **مفتاحاً مسمّى في لقطة الرحلة** (`trip.flightNumber`) وعموداً مستقلاً في
-- إخراج بوابة المتعهد.
--
-- 🔒 **ولا يُرفض حجزٌ بسببه أبداً.** التحقّق من شكله (رمز شركة + أرقام) إرشادٌ
-- في الواجهة لا حارس؛ وهنا يُطبَّع ويُقصّ ويُخزَّن كما هو. رقمُ رحلةٍ خاطئ
-- معلومةٌ ناقصة للمتعهد؛ ورفضُ الحجز بسببه **خسارةُ العميل كله**. والقيدُ
-- الوحيد على العمود سقفُ طول — والدالة تقصّ قبله، فلا يبلغه منادٍ عبرها.
--
-- ⚠ ولماذا **لقطة الرحلة** لا عمودٌ في `bookings`: هو مُدخل عميلٍ يصف الرحلة،
-- من صنف `notes` و`returnAt` و`luggage` بالضبط — وكلها في اللقطة منذ 0031.
-- ومكسبٌ عملي معه: `get_booking_by_token` تُرجع `trip` **كاملاً**، فيصل الرقم
-- إلى صفحة متابعة العميل بلا مساسٍ بدالةٍ ممنوحةٍ لـ`anon`.
--
-- المرجع: 0027 (‏`trip_settings` · `trip_config`) · 0043 (سابقة توسيع
--         `trip_config` بعمودٍ رابع) · 0052 (‏`booking_hold_until`: تعريفٌ
--         واحد يقرؤه المحرّك وتعرضه الواجهة) · 0031 (سابقة تغيير توقيع
--         `create_booking` بإسقاط القديم صراحةً) · D-05 · D-09 · D-58.
-- الاختبار: supabase/tests/trip_settings_tests.sql (القسمان س و ع)
--           · supabase/tests/booking_tests.sql (التوقيع الجديد)
-- آمنة لإعادة التنفيذ بالكامل.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (١) العمود: أدنى مهلة بالدقائق بين لحظة الحجز وموعد الانطلاق
--
-- السقف ٧ أيام (‏١٠٠٨٠ دقيقة) **صمّام أمان لا خيار**: مهلةٌ أطول من أسبوع
-- ترفض كل حجزٍ عملي في هذا السوق، ورقمٌ كهذا في الحقل يعني خطأً مطبعياً لا
-- سياسة. والأرضية صفر = مطفأة.
-- ----------------------------------------------------------------------------
alter table public.trip_settings
  add column if not exists min_lead_minutes integer not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.trip_settings'::regclass
      and conname  = 'trip_settings_min_lead_minutes_check'
  ) then
    alter table public.trip_settings
      add constraint trip_settings_min_lead_minutes_check
      check (min_lead_minutes between 0 and 10080);
  end if;
end;
$$;

comment on column public.trip_settings.min_lead_minutes is
  'أدنى مهلة بالدقائق بين لحظة الحجز وموعد الانطلاق. صفر = مطفأة (سلوك ما قبل 0067 حرفياً) وهو الافتراضي بقرار: المهلة سياسة تشغيل يملكها المالك، وشحنُها مفعّلة يرفض حجوزات حقيقية بلا قراره. تُفرض داخل create_booking لا في الواجهة.';

-- ----------------------------------------------------------------------------
-- (٢) `trip_config()` — العمود الرابع
--
-- ⚠ `create or replace` **لا تقبل** تغيير نوع الإرجاع، فالإسقاط لازم. وهي
-- سابقةٌ قائمة: 0043 فعلت هذا بعينه حين أضافت `driver_phone_lead_minutes`.
-- والمنادون (`booking_hold_until` بجسمٍ نصّي و`cancel_stale_bookings` في
-- plpgsql) لا يسجّلان تبعيةً صلبة، فالإسقاط يمرّ وإعادةُ الإنشاء في المعاملة
-- نفسها تُغلق النافذة.
--
-- 🔒 والمنح **يُعاد كما كان بالضبط**: الإسقاط يمحو `revoke`/`grant` معاً، فلو
-- سُكت عنها لعادت الدالة إلى منح Postgres الافتراضي (`public` تنفّذ) — أي أن
-- كل متعهد يقرأ سياسة تشغيلنا. القسم (٨-١) يفحص ذلك ويُسقط الهجرة إن انفتحت.
-- ----------------------------------------------------------------------------
drop function if exists public.trip_config();

create function public.trip_config()
returns table (
  unpaid_cancel_enabled     boolean,
  unpaid_timeout_minutes    integer,
  driver_phone_lead_minutes integer,
  min_lead_minutes          integer
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    coalesce(t.unpaid_cancel_enabled, false),
    coalesce(t.unpaid_timeout_minutes, 1440),
    coalesce(t.driver_phone_lead_minutes, 120),
    coalesce(t.min_lead_minutes, 0)
  from (select true) one
  left join public.trip_settings t on t.id = true;
$function$;

revoke all on function public.trip_config() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.trip_config() to service_role';
  end if;
end;
$$;

comment on function public.trip_config() is
  'قارئ إعدادات الرحلات — يرجع صفاً واحداً دائماً (left join على صف وحيد) فلا ينكسر مستهلكه على قاعدة لم تُبذر. أربعة أعمدة منذ 0067. غير ممنوحة لأي دور مستخدم عمداً (سابقة dispatch_config): كل متعهد authenticated، وسياسة التشغيل الداخلية لا تُقرأ منه.';

-- ----------------------------------------------------------------------------
-- (٣) 🔒 **تعريفٌ واحد** لأقرب موعد انطلاق مقبول — يقرؤه الحارس وتعرضه الواجهة
--
-- نفس عقد `booking_hold_until` في 0052 حرفاً بحرف: المعادلة تُكتب **مرة
-- واحدة**، فالحارسُ في SQL ومنتقي التاريخ في المتصفح لا يمكن أن يفترقا. ومن
-- كتب المعادلة في الواجهة أيضاً صنع رقماً بمصدرين (النمط ٨ في `LESSONS.md`).
--
-- والإرجاع `null` حين تكون المهلة صفراً — أي **«لا قيد»** لا «الآن». والفرق
-- ليس تجميلاً: `null` يجعل شرط الحارس أدناه يسقط كاملاً، ويجعل الواجهة تمتنع
-- عن عرض جملةٍ تَعِد بقيدٍ لا وجود له.
-- ----------------------------------------------------------------------------
create or replace function public.booking_min_pickup_at()
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $function$
  select case
           when coalesce(t.min_lead_minutes, 0) <= 0 then null
           else now() + make_interval(mins => t.min_lead_minutes)
         end
  from public.trip_config() t;
$function$;

comment on function public.booking_min_pickup_at() is
  'أقرب موعد انطلاق مقبول = now() + أدنى مهلة، وnull حين تكون المهلة صفراً (لا قيد). مصدرٌ واحد يقرؤه حارس create_booking ويعرضه منتقي التاريخ في الحاسبة.';

-- ⚠ ولماذا **لا تُمنح لـ`anon` بخلاف `booking_hold_until`**: تلك تأخذ طابعَي
-- الحجز وترجع وعداً يخصّ حجزاً بعينه، وصفحة `/booking/[token]` عامةٌ بلا جلسة
-- فلا سبيل غيرها. وهذه تكشف **رقم سياستنا التشغيلية** بلا سياق، ومناديها
-- الوحيد إجراءٌ خادمي يعمل بمفتاح الخدمة (`components/booking/checkout/lead-time.ts`).
-- فالأضيق يكفي، والقاعدة الحاكمة D-53: لا يصل الدور ما لا يحتاجه.
revoke all on function public.booking_min_pickup_at() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.booking_min_pickup_at() to service_role';
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- (٤) تطبيع رقم الرحلة الجوية — **دالةٌ لا ترمي أبداً**
--
-- تُبقي الحروف والأرقام وحدها (فتسقط المسافات والشرطات والرموز)، وتكبّر
-- الحروف، وتقصّ إلى ١٢ محرفاً. أطول رمز رحلةٍ تجاري (رمز شركة من ثلاثة أحرف
-- ‏+ أربعة أرقام + لاحقة) يبقى دونها بمسافة، والقصّ صمّام أمان لا سياسة.
--
-- 🔒 **ولا تحكم على الشكل.** ما لا يشبه رقم رحلةٍ يُخزَّن كما كتبه صاحبه:
-- الحكم على شكله في الواجهة تلميحٌ يُقرأ، وهنا كان سيصير حاجزاً يُسقط الحجز.
-- ----------------------------------------------------------------------------
create or replace function public.normalize_flight_number(p_flight text)
returns text
language sql
immutable
set search_path = ''
as $function$
  select nullif(
           left(upper(regexp_replace(coalesce(p_flight, ''), '[^0-9A-Za-z]', '', 'g')), 12),
           ''
         );
$function$;

comment on function public.normalize_flight_number(text) is
  'الشكل المخزَّن لرقم الرحلة الجوية: حروف وأرقام فقط، كبيرة، بحد ١٢ محرفاً، وnull للفارغ. لا ترفض شكلاً — رقمٌ خاطئ معلومةٌ ناقصة للمتعهد، ورفضُ الحجز بسببه خسارةُ العميل.';

revoke all on function public.normalize_flight_number(text) from public, anon;
grant execute on function public.normalize_flight_number(text) to authenticated, service_role;

-- ============================================================================
-- (٥) `create_booking` — التوقيع الحادي والعشرون
--
-- 🔴 **الجسم منقولٌ من الكتالوج الحيّ** (`pg_get_functiondef`) لا من أي ملف
-- هجرة — D-58، والدرس الذي كلّف الدفعةَ ٣ انحداراً حرجاً. والمضاف **ثلاثة
-- مواضع لا غير**، وكلها مُعلَّمة `0067`:
--   • وسيط أخير `p_flight_number` (بافتراضي، فكل نداءٍ موضعيّ قائم يبقى صالحاً)
--   • حارس أدنى مهلة، بعد حارس تاريخ العودة مباشرةً
--   • مفتاح `flightNumber` في لقطة الرحلة
-- وما عدا ذلك محفوظٌ بنصّه، والقسم (٨-٤) يفحص بقاء علاماتِ كل إصلاحٍ سابق
-- **لا وجودَ ما أضفناه** — «الفحص الذاتي يحرس ما كان قائماً» (D-58).
--
-- ⚠ والإسقاط الصريح للتوقيع القديم لازم: زيادةُ وسيطٍ تُنشئ **حِملاً ثانياً**
-- لا تستبدل الأول، فيبقى توقيعان يختار بينهما PostgREST بأسماء الوسائط —
-- وأحدهما بلا الحارس. سابقة 0031 حرفياً.
-- ============================================================================

drop function if exists public.create_booking(
  jsonb, jsonb, integer, boolean, numeric, numeric, numeric, text, text, text,
  text, text, text, timestamptz, text, text, timestamptz, integer, jsonb, integer
);

create function public.create_booking(
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
  p_notes             text,
  p_coupon_code       text        default null,
  p_return_at         timestamptz default null,
  p_luggage           integer     default 0,
  p_extras            jsonb       default null,
  p_redeem_points     integer     default 0,
  p_flight_number     text        default null
)
returns table (
  id uuid, reference text, public_token text, total numeric,
  amount_due numeric, amount_remaining numeric, currency text
)
language plpgsql
security definer
set search_path = ''
as $function$
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
  '0067: أُضيف حارس أدنى مهلة قبل الانطلاق (hint=lead-time، من booking_min_pickup_at وحدها) ووسيط p_flight_number يُطبَّع في trip.flightNumber ولا يرفض حجزاً أبداً. الجسم منقول من الكتالوج الحيّ (D-58) وما عدا الثلاثة مواضع محفوظ بنصّه.';

-- 🔒 المنح كما كانت **حرفياً**: `service_role` وحده. الإسقاط محا ACL القديمة،
-- والسكوت هنا كان يعيد الدالة إلى الافتراضي (‏`public` تنفّذ) — أي فتح مسار
-- الحجز لكل زائر بمسافةٍ يعلنها بنفسه، وهو نقضٌ مباشر لـ D-09.
revoke all on function public.create_booking(
  jsonb, jsonb, integer, boolean, numeric, numeric, numeric, text, text, text,
  text, text, text, timestamptz, text, text, timestamptz, integer, jsonb, integer, text
) from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.create_booking(
      jsonb, jsonb, integer, boolean, numeric, numeric, numeric, text, text, text,
      text, text, text, timestamptz, text, text, timestamptz, integer, jsonb, integer, text
    ) to service_role';
  end if;
end;
$$;

-- ============================================================================
-- (٦) `portal_trips()` — عمودٌ خامس وعشرون: رقم الرحلة الجوية
--
-- ⚠ **بلا هذا القسم تصير الميزة انحداراً لا إضافة**: `portal_trips` تُخرج
-- `notes` إلى المتعهد اليوم، ورقمُ الرحلة يُكتب فيها. فنقلُه إلى مفتاحٍ مستقل
-- بلا إخراجه هنا يعني أن المتعهد **يفقد** ما كان يراه.
--
-- والعمود **يُلحق آخِراً**: مستهلكها في `app/portal/trips` يقرأ بالاسم، لكن
-- إزاحة عمودٍ قائم تكسر أي قارئٍ موضعي — والقسم (٨-٥) يفحص بقاء الأربعة
-- والعشرين الأُوَل بترتيبها وأسمائها.
--
-- 🔒 ولا يعبر أكثر من ذلك: `booking_failures` وأسبابها المالية ما زالت خارج
-- هذا الإخراج (0051)، ورمز المتعهد لا مرجع العميل (0028 · D-46).
-- ============================================================================

drop function if exists public.portal_trips();

create function public.portal_trips()
returns table (
  offer_id        uuid,
  booking_id      uuid,
  reference       text,
  origin_label    text,
  dest_label      text,
  distance_km     numeric,
  passengers      integer,
  round_trip      boolean,
  waiting_hours   numeric,
  class_title     text,
  pickup_at       timestamptz,
  payout          numeric,
  currency        text,
  expires_at      timestamptz,
  notes           text,
  customer_name   text,
  customer_phone  text,
  customer_whatsapp text,
  status          text,
  assigned_at     timestamptz,
  crew_vehicle_id uuid,
  crew_driver_id  uuid,
  crew_by_admin   boolean,
  crew_at         timestamptz,
  flight_number   text
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    o.id,
    b.id,
    -- 0028: رمز المتعهد لا مرجع العميل (انظر ترويسة الملف — العيب الحرج)
    public.partner_trip_code(b.id),
    b.trip ->> 'originLabel',
    b.trip ->> 'destLabel',
    public.jsonb_number(b.trip, 'distanceKm', 0),
    coalesce(public.jsonb_number(b.trip, 'passengers', 1), 1)::integer,
    coalesce(b.trip ->> 'roundTrip', 'false') in ('true', 't', '1'),
    coalesce(public.jsonb_number(b.trip, 'waitingHours', 0), 0),
    b.class_title,
    nullif(btrim(coalesce(b.trip ->> 'pickupAt', '')), '')::timestamptz,
    d.assigned_payout,
    b.currency,
    d.assigned_at,
    b.trip ->> 'notes',
    b.customer_name,
    b.customer_phone,
    b.customer_whatsapp,
    b.status,
    d.assigned_at,
    -- ← 0042: معرّفان من سجلَّي الشريك نفسه، ووسم الإدخال الإداري
    d.assigned_vehicle_id,
    d.assigned_driver_id,
    d.crew_by_admin,
    d.crew_at,
    -- ← 0067: رقم الرحلة الجوية من اللقطة — ما كان يصل داخل `notes` صار حقلاً
    nullif(btrim(coalesce(b.trip ->> 'flightNumber', '')), '')
  from public.dispatches d
  join public.bookings b on b.id = d.booking_id
  left join public.trip_offers o
    on o.booking_id       = d.booking_id
   and o.subcontractor_id = d.assigned_subcontractor_id
   and o.status           = 'accepted'
  where d.assigned_subcontractor_id = public.current_subcontractor_id()
    and public.current_subcontractor_id() is not null
    and d.status  = 'assigned'
    -- 0051: و`failed` — الرحلة الفاشلة تبقى في قائمة من نُفِّذت عليه، وإخفاؤها
    -- يجعل الرحلة تختفي من عنده بلا تفسير. و🔒 السبب والإجراء المالي **لا
    -- يعبران**: `booking_failures` بلا منحٍ للمتعهد، وهذا الإخراج بلا حقلٍ لهما.
    and b.status in ('assigned', 'completed', 'cancelled', 'failed')
  order by nullif(btrim(coalesce(b.trip ->> 'pickupAt', '')), '')::timestamptz asc nulls last,
           d.assigned_at desc;
$function$;

comment on function public.portal_trips() is
  '0067: عمودٌ خامس وعشرون flight_number من لقطة الرحلة — كان يصل المتعهد داخل notes النصّية. وكل حدود 0028 و0042 و0051 باقية بنصّها.';

revoke all on function public.portal_trips() from public, anon;
grant execute on function public.portal_trips() to authenticated, service_role;

-- ============================================================================
-- (٧) فهرس رقم الرحلة — يُمهّد لتتبّع التأخير ولا يبنيه
--
-- جزئيٌّ على الصفوف التي تحمل رقماً وحدها: أغلب الحجوزات ليست مطارية، وفهرسٌ
-- كامل على مفتاح jsonb غالبُه `null` كلفةٌ بلا مقابل.
-- ============================================================================
create index if not exists bookings_flight_number_idx
  on public.bookings ((trip ->> 'flightNumber'))
  where trip ->> 'flightNumber' is not null;

-- ============================================================================
-- (٨) الفحص الذاتي — يُسقط الهجرة بدل أن يترك عطباً صامتاً
--
-- 🔒 وقاعدته من D-58: **يحرس ما كان قائماً لا ما أضفناه**. فأربعة من فحوصه
-- الخمسة تسأل عن إصلاحاتٍ سابقة (منحٌ مسحوب، حارسٌ قديم، ترتيب أعمدة) لا عن
-- الجديد — لأن الجديد يفشل صريحاً، والقديم هو ما يموت صامتاً.
-- ============================================================================
do $$
declare
  v_cols  text;
  v_body  text;
  v_miss  text;
  v_n     integer;
begin
  -- (٨-١) `trip_config()`: أربعة أعمدة بترتيبها، **والمنح لم ينفتح بالإسقاط**
  select string_agg(x.name, ',' order by x.ord) into v_cols
  from (
    select p.proargnames[i] as name, i as ord
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace,
         generate_subscripts(p.proargnames, 1) i
    where n.nspname = 'public' and p.proname = 'trip_config'
  ) x;

  if v_cols is distinct from
     'unpaid_cancel_enabled,unpaid_timeout_minutes,driver_phone_lead_minutes,min_lead_minutes' then
    raise exception '0067: أعمدة trip_config() غير متوقعة — «%»', coalesce(v_cols, 'null');
  end if;

  if has_function_privilege('anon', 'public.trip_config()', 'execute')
     or has_function_privilege('authenticated', 'public.trip_config()', 'execute') then
    raise exception
      '0067: الإسقاط أعاد فتح trip_config() لدور مستخدم — نقضٌ لقرار 0027 (كل متعهد authenticated)';
  end if;

  -- (٨-٢) `booking_min_pickup_at()` كذلك: مغلقة على دورَي المستخدم
  if has_function_privilege('anon', 'public.booking_min_pickup_at()', 'execute')
     or has_function_privilege('authenticated', 'public.booking_min_pickup_at()', 'execute') then
    raise exception '0067: booking_min_pickup_at() مفتوحة لدور مستخدم — أغلقها';
  end if;

  -- (٨-٣) التوقيع القديم لـ create_booking **ذهب**، والجديد وحده قائم
  if to_regprocedure('public.create_booking(jsonb,jsonb,integer,boolean,numeric,numeric,numeric,text,text,text,text,text,text,timestamptz,text,text,timestamptz,integer,jsonb,integer)') is not null then
    raise exception '0067: التوقيع العشروني لـ create_booking ما زال قائماً — حِملان أحدهما بلا حارس المهلة';
  end if;
  if to_regprocedure('public.create_booking(jsonb,jsonb,integer,boolean,numeric,numeric,numeric,text,text,text,text,text,text,timestamptz,text,text,timestamptz,integer,jsonb,integer,text)') is null then
    raise exception '0067: التوقيع الجديد لـ create_booking غير موجود';
  end if;
  if has_function_privilege('anon', 'public.create_booking(jsonb,jsonb,integer,boolean,numeric,numeric,numeric,text,text,text,text,text,text,timestamptz,text,text,timestamptz,integer,jsonb,integer,text)', 'execute')
     or has_function_privilege('authenticated', 'public.create_booking(jsonb,jsonb,integer,boolean,numeric,numeric,numeric,text,text,text,text,text,text,timestamptz,text,text,timestamptz,integer,jsonb,integer,text)', 'execute') then
    raise exception '0067: create_booking انفتحت لدور مستخدم بعد إعادة الإنشاء — نقضٌ مباشر لـ D-09';
  end if;

  -- (٨-٤) 🔴 D-58: علاماتُ كل إصلاحٍ سابق ما زالت في الجسم الجديد.
  --       الفحص على **ما كان قائماً** — الانحدار الذي كلّف الدفعة ٣ كان نسخةً
  --       من جسمٍ قديم مرّت كل فحوص «هل أُضيف الجديد؟».
  select pg_get_functiondef(p.oid) into v_body
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'create_booking';

  select string_agg(x.mark, '، ') into v_miss
  from (values
    ('haversine_km'),              -- د١ (0009) حاجز المسافة المزوَّرة
    ('derive_waiting_hours'),      -- 0031 الانتظار أرضية لا استبدال
    ('greatest(v_waiting'),        -- ونفسها: الأكبر لا الاستبدال
    ('apply_discount'),            -- 0024 الخصم داخل المعاملة
    ('redeem_coupon'),             -- 0024 الحجز الذرّي للاستخدام
    ('apply_points'),              -- 0047 النقاط بعد الكوبون
    ('redeem_points'),             -- 0047 الخصم داخل معاملة الحجز
    ('price_extras'),              -- 0031 الخدمات طبقة أخيرة
    ('extrasTotal'),               -- 0047 أساس الكسب يقرأ total − extrasTotal
    ('pricing_internals')          -- 0011 نافذة الأعمدة الداخلية
  ) as x(mark)
  where position(x.mark in v_body) = 0;

  if v_miss is not null then
    raise exception '0067: انحدار — علامات إصلاحات سابقة غابت من create_booking: %', v_miss;
  end if;

  -- والحارس الجديد نفسه موجود
  if position('booking_min_pickup_at' in v_body) = 0
     or position('lead-time' in v_body) = 0
     or position('flightNumber' in v_body) = 0 then
    raise exception '0067: الجسم الجديد بلا حارس المهلة أو بلا مفتاح رقم الرحلة';
  end if;

  -- (٨-٥) `portal_trips()`: الأربعة والعشرون الأُوَل بترتيبها، والخامس والعشرون جديد
  select string_agg(x.name, ',' order by x.ord), count(*)
    into v_cols, v_n
  from (
    select p.proargnames[i] as name, i as ord
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace,
         generate_subscripts(p.proargnames, 1) i
    where n.nspname = 'public' and p.proname = 'portal_trips'
  ) x;

  if v_n <> 25 then
    raise exception '0067: portal_trips() ترجع % عموداً لا ٢٥', v_n;
  end if;
  if v_cols is distinct from
     'offer_id,booking_id,reference,origin_label,dest_label,distance_km,passengers,round_trip,waiting_hours,class_title,pickup_at,payout,currency,expires_at,notes,customer_name,customer_phone,customer_whatsapp,status,assigned_at,crew_vehicle_id,crew_driver_id,crew_by_admin,crew_at,flight_number' then
    raise exception '0067: ترتيب أعمدة portal_trips() تغيّر — «%»', v_cols;
  end if;
  if has_function_privilege('anon', 'public.portal_trips()', 'execute') then
    raise exception '0067: portal_trips() انفتحت لـ anon بعد إعادة الإنشاء';
  end if;

  -- (٨-٦) شاهدان سلوكيان على التطبيع — لا كتالوجيان
  if public.normalize_flight_number(' ms 736 ') is distinct from 'MS736' then
    raise exception '0067: normalize_flight_number لا تطبّع — الناتج «%»',
      coalesce(public.normalize_flight_number(' ms 736 '), 'null');
  end if;
  if public.normalize_flight_number('   ') is not null then
    raise exception '0067: normalize_flight_number ترجع نصاً فارغاً بدل null';
  end if;

  raise notice '✔ 0067: أدنى مهلة (مطفأة بالبذرة) + رقم الرحلة الجوية — trip_config رباعية، create_booking بواحدٍ وعشرين وسيطاً، portal_trips بخمسة وعشرين عموداً';
end;
$$;
