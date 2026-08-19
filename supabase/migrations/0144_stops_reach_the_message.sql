-- ============================================================================
-- 0144_stops_reach_the_message.sql — المحطاتُ تبلغ الرسالةَ التي يُقرَّر عليها
--
-- ── 🔴 العيب ────────────────────────────────────────────────────────────────
--
-- نزلت المحطاتُ الوسطى في `0140`، فصارت `portal_offers()` و`portal_trips()`
-- تحملانها وصارت بطاقةُ البورتال تعرضها. **لكنّ المتعهد لا يفتح البورتال
-- ليكتشف العرض — يصله إشعارٌ ثم يقرّر.** وحمولةُ `trip_offered` تبنيها
-- `dispatch_broadcast` من `dispatch_trip_payload(booking, true)`، وهي حتى
-- اللحظة:
--
--     bookingId · tripCode · classSlug · classTitle · currency ·
--     originLabel · destLabel · distanceKm · passengers · roundTrip ·
--     waitingHours · pickupAt · notes                     ← **بلا `stops`**
--
-- ‏(مقيسٌ بـ`pg_get_functiondef` على القاعدة الحيّة — D-58 — لا من ملف هجرة.)
--
-- فيصل المتعهدَ «مطار القاهرة ← حلوان · ٥٨ كم» عن رحلةٍ بمحطتين، فيقبلها على
-- أنها مباشرة. **الشاشةُ صارت صادقة، والرسالةُ التي تصنع القرار ما زالت تكذب.**
-- وهو أخطر الشقّين: الشاشةُ تُفتَح بعد القبول، والرسالةُ هي القبول نفسه.
--
-- ── ما تفعله هذه الهجرة (ثلاث دوالّ، ولا رابع) ──────────────────────────────
--
--   (١) `dispatch_trip_payload(uuid, boolean)` ← مفتاح `stops`
--       يخدم **كلَّ** أحداث البثّ والإسناد والاعتذار والإتمام (عشرة نداءات
--       مقيسة في `accept_offer` · `manual_assign` · `withdraw_from_trip` ·
--       `request_trip_completion` · `decide_trip_completion` · `start_dispatch`
--       · `dispatch_broadcast`)، فالإصلاحُ فيها إصلاحٌ لها جميعاً.
--
--   (٢) `customer_notification_payload(uuid)` ← مفتاح `stops`
--       🔴 **الرابعُ الذي لم يُذكر في التكليف**: أربعةُ أحداثٍ يقرؤها **العميل**
--       (‏`customer_booking_confirmed` · `customer_trip_assigned` ·
--       `customer_trip_reminder` · `customer_trip_completed`) كانت تصفُ رحلته
--       هو بسطر «من ← إلى» يُسقط المحطات التي طلبها ودفع ثمنها. والتذكيرُ
--       أخصُّها: يصله قبل الموعد بساعات ليراجع «نقطة الانطلاق والوقت».
--
--   (٣) `portal_inbox(integer)` ← `stops` في القائمة البيضاء لـ`summary`
--       الصندوقُ يبني ملخّصه بقائمةٍ صريحة من **اثني عشر** مفتاحاً، و`stops`
--       ليست منها — فحتى بعد (١) كان الصفُّ يحمل المحطات والصندوقُ يُسقطها.
--
-- ── 🔒 لماذا `trip_stops_public()` في المواضع الثلاثة، ولا بناءَ ثانٍ ────────
--
-- القاعدة الذهبية ١٢: القائمةُ تُفوَّض ولا تُبنى مرّتين. و`trip_stops_public`
-- (‏`0140`) تُخرج `[{label}]` **معمّاةً بـ`dispatch_public_label`** — **ولا
-- `lat` ولا `lng` في الكائن أصلاً**، وهي حمايةٌ بنيوية لا انضباطية على قاعدة
-- D-18 و D-19: المتعهدُ قبل القبول لا يرى إحداثيات.
--
-- ⚠ **وثمنٌ مُعلَنٌ لا سهو:** الشقُّ التشغيلي من `dispatch_trip_payload`
--   (‏`p_public = false`) يقرأ `originLabel`/`destLabel` **خامَّين**، بينما
--   محطاتُه تصل **معمّاةً** كمحطات المتعهد. وهي تسويةٌ مقصودة:
--     · البديلُ الوحيد القائم هو `trip_stops_full` — وهي تحمل الإحداثيات،
--       فتُدخِلها إلى صفوف `notifications` (وهي جدولٌ يقرؤه `portal_inbox`
--       و`customer_inbox`)، وذلك توسيعٌ لسطح التسريب مقابل لا شيء: الراسمُ في
--       `lib/notifications/render.ts` **لا يقرأ `lat`/`lng` إطلاقاً**.
--     · وبناءُ ثالثةٍ «أوسمةٌ خام بلا إحداثيات» ينقض القاعدة ١٢ ويصنع مصدراً
--       ثانياً لقائمةٍ واحدة (النمط ٨ في `LESSONS.md`).
--     · وما يفقده التشغيل هو **أرقامُ العناوين وحدها** (`dispatch_public_label`
--       تُسقط المقاطع الحاملة للأرقام لا غير)، والتفصيلُ الكامل على بُعد نقرةٍ
--       في `/admin/orders/<id>` — وهي وجهةُ الرابط في الرسالة نفسها.
--   والحصيلةُ ثابتٌ يستحقّ التسمية: **لا إحداثيةَ محطةٍ تدخل صفَّ إشعارٍ أبداً.**
--
-- ── 🔒 التوافق الرجعيّ — شرطٌ لا نيّة ───────────────────────────────────────
--
-- المفتاح يُكتب `nullif(trip_stops_public(trip), '[]'::jsonb)`:
--   · رحلةٌ بلا محطات ⇒ `"stops": null` في `dispatch_trip_payload` (وهي تحوي
--     مفاتيحَ `null` سلفاً: `notes` و`distanceKm`)، و**مفتاحٌ محذوفٌ أصلاً** في
--     `customer_notification_payload` و`portal_inbox` (كلتاهما `jsonb_strip_nulls`)
--     — أي أن شكل الحمولة لغير ذوات المحطات **لم يتغيّر ببايت**.
--   · وحمولةٌ **قديمةٌ في الطابور بلا المفتاح إطلاقاً** تُصيَّر بلا خطأ: الراسم
--     يقرأ `stops` عبر `raw()` المتسامحة ويُرجع `count = 0`، فتخرج الرسالة
--     كما كانت تخرج أمس حرفاً بحرف. (مُثبَتٌ حيّاً بتصيير ثلاث حمولات.)
--
-- ── 🔒 المنحُ يُعاد كما كان ─────────────────────────────────────────────────
--
-- كلُّ التعديلات `create or replace` — **ولا `drop` واحد**، فلا تنزل منحةُ
-- Supabase الافتراضية لـ`anon`/`authenticated` أصلاً (وهي السابقةُ التي وقعت
-- في `0139` و`0140`). ومع ذلك يُعاد وضعُ المنح **حرفاً كما قِيست قبل هذه
-- الهجرة** من `pg_proc.proacl`، ثم يفحصها القسم (٤) بنفسه:
--
--   | الدالة | ما قِيس قبل الهجرة |
--   |---|---|
--   | `dispatch_trip_payload`        | postgres · service_role |
--   | `customer_notification_payload`| postgres · service_role |
--   | `portal_inbox`                 | postgres · authenticated · service_role |
--
-- المرجع: 0140 (‏`trip_stops_public`) · 0131 (‏أحداث العميل) · 0056 (‏قسمة
--         الحمولة العامة/التشغيلية) · 0054 (‏`portal_inbox`) · D-18 · D-19 ·
--         D-58 · `lib/notifications/render.ts` (‏`tripStops` و`routeLabel`).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (٠) شرطٌ مسبق — `trip_stops_public` هي المصدر، وغيابُها يعني هجرةً ناقصة
-- ----------------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.trip_stops_public(jsonb)') is null then
    raise exception '0144: public.trip_stops_public(jsonb) غير موجودة — طبّق 0140 أولاً';
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- (١) حمولةُ البثّ — المحطاتُ تصل المتعهدَ قبل أن يقبل
--
-- الجسمُ منقولٌ من `pg_get_functiondef` على القاعدة الحيّة (D-58)، ولم يُمسّ
-- منه سطرٌ سوى إضافة `stops`.
-- ----------------------------------------------------------------------------
create or replace function public.dispatch_trip_payload(p_booking_id uuid, p_public boolean)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select
    jsonb_build_object(
      'bookingId',    b.id,
      -- 0056: رمز الرحلة **بديلاً عن المرجع في النصف العام**. مشتقٌّ من المعرّف
      --       فهو ثابتٌ يتحدث به المتعهد والتشغيل، وغيرُ مقبولٍ في «تابع حجزك».
      'tripCode',     public.partner_trip_code(b.id),
      'classSlug',    b.class_slug,
      'classTitle',   b.class_title,
      'currency',     b.currency,
      'originLabel',  case when p_public
                           then public.dispatch_public_label(b.trip ->> 'originLabel')
                           else b.trip ->> 'originLabel' end,
      'destLabel',    case when p_public
                           then public.dispatch_public_label(b.trip ->> 'destLabel')
                           else b.trip ->> 'destLabel' end,
      -- 🔴 0144: المحطاتُ الوسطى — **وسومٌ فقط، ولا إحداثيات في الكائن أصلاً**
      --    (‏`trip_stops_public` هي المصدر الوحيد للقائمة؛ القاعدة ١٢ و D-19).
      --    و`nullif` يُبقي حمولةَ الرحلة المباشرة **كما كانت بايتاً ببايت**.
      'stops',        nullif(public.trip_stops_public(b.trip), '[]'::jsonb),
      -- ⚠ وهو **مجموع الأرجل** لا الطول المباشر متى وُجدت محطات؛ والراسمُ يسمّي
      --    السطر «إجمالي المسافة عبر المحطات» حينها (‏`lib/dispatch/messages.ts`).
      'distanceKm',   public.jsonb_number(b.trip, 'distanceKm', null),
      'passengers',   public.jsonb_number(b.trip, 'passengers', null),
      'roundTrip',    coalesce(b.trip ->> 'roundTrip', 'false') in ('true', 't', '1'),
      'waitingHours', public.jsonb_number(b.trip, 'waitingHours', null),
      'pickupAt',     b.trip ->> 'pickupAt',
      'notes',        case when p_public
                           then public.dispatch_safe_notes(b.trip ->> 'notes')
                           else b.trip ->> 'notes' end
    )
    ||
    case when p_public then '{}'::jsonb
         else jsonb_build_object(
                -- 🔒 0056: المرجع هنا لا فوق — حقلُ **عميل** كاسمه وهاتفه، لا
                --          حقلُ رحلةٍ عامّ. وهذه القسمة هي الحارس كله.
                'reference',        b.reference,
                'customerName',     b.customer_name,
                'customerPhone',    b.customer_phone,
                'customerWhatsapp', b.customer_whatsapp,
                'total',            b.total,
                'status',           b.status
              )
    end
  from public.bookings b
  where b.id = p_booking_id;
$$;

comment on function public.dispatch_trip_payload(uuid, boolean) is
  'حمولةُ إشعارات البثّ والإسناد. النصفُ العام (p_public) بلا مرجعٍ ولا بياناتِ عميل (0056)، وأوسامُ الأماكن معمّاةٌ فيه. و0144 أضافت stops — أوسامَ المحطات الوسطى بترتيبها من trip_stops_public()، بلا إحداثيات في الحالتين معاً: لا إحداثيةَ محطةٍ تدخل صفَّ إشعارٍ أبداً. وnullif يُبقي حمولةَ الرحلة المباشرة كما كانت، فحمولةٌ قديمةٌ في الطابور تُصيَّر بلا خطأ.';

-- ----------------------------------------------------------------------------
-- (٢) حمولةُ العميل — رحلتُه هو، والمحطاتُ التي طلبها ودفع ثمنها
--
-- 🔴 هذا هو «الرابع» الذي وجَبَ البحثُ عنه: أربعةُ أحداثٍ تصف الرحلةَ لصاحبها
--    (‏0131) وكلُّها تقرأ هذه الدالة وحدها — ومنها **التذكير** الذي يصله قبل
--    الموعد ليراجع نقطة الانطلاق.
--
-- ⚠ ولماذا المعمّاة هنا أيضاً وهي بياناتُ العميل نفسه: مصدرُ القائمة واحد
--    (القاعدة ١٢)، والفارقُ الفعليّ أرقامُ العناوين وحدها، وصفحةُ متابعة الحجز
--    — وهي وجهةُ الرابط في هذه الرسائل بعينها — تحمل التفصيل الكامل.
--    والمكسبُ البنيويّ أنّ **صفَّ الإشعار لا يحمل إحداثيةً بحال**، وهو جدولٌ
--    يقرؤه `customer_inbox` بالتوكن.
-- ----------------------------------------------------------------------------
create or replace function public.customer_notification_payload(p_booking uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  -- ما لا يُذكر هنا لا يمكن أن يعبُر (اتفاقية ٧: الأمان بنيويّ).
  -- ولا `subcontractor_cost` ولا `margin_amount` ولا `payout` — وهي أعمدةٌ
  -- على `bookings` و`dispatches` قائمةٌ على بُعد سطرٍ واحد، فغيابُها اختيارٌ
  -- مكتوبٌ لا سهو.
  select coalesce(
    (select jsonb_strip_nulls(jsonb_build_object(
       'bookingId',       b.id,
       'reference',       b.reference,
       'publicToken',     b.public_token,
       'status',          b.status,
       'customerName',    b.customer_name,
       'classTitle',      b.class_title,
       'currency',        b.currency,
       'total',           b.total,
       'amountRemaining', b.amount_remaining,
       'originLabel',     b.trip ->> 'originLabel',
       'destLabel',       b.trip ->> 'destLabel',
       -- 🔴 0144: بلا هذا السطر كانت أربعةُ إشعاراتٍ تصف للعميل رحلةً بمحطتين
       --    وكأنها مباشرة — وأخصُّها التذكير قبل الموعد.
       'stops',           nullif(public.trip_stops_public(b.trip), '[]'::jsonb),
       'pickupAt',        b.trip ->> 'pickupAt',
       'passengers',      public.jsonb_number(b.trip, 'passengers', null),
       'roundTrip',       coalesce(b.trip ->> 'roundTrip', 'false') in ('true', 't', '1'),
       'waitingHours',    public.jsonb_number(b.trip, 'waitingHours', null)
     ))
     from public.bookings b where b.id = p_booking),
    '{}'::jsonb);
$$;

comment on function public.customer_notification_payload(uuid) is
  'حمولةُ إشعارات العميل الأربعة (0131): بلا تكلفةٍ ولا هامشٍ ولا متعهد. و0144 أضافت stops — أوسامَ المحطات بترتيبها بلا إحداثيات — لأن أربعتها كانت تصف رحلةً بمحطات وكأنها مباشرة، ومنها تذكيرُ ما قبل الموعد. وjsonb_strip_nulls يحذف المفتاح للرحلة المباشرة فلا يتغيّر شكلُ حمولتها.';

-- ----------------------------------------------------------------------------
-- (٣) صندوقُ البورتال — القائمةُ البيضاء تصير ثلاثةَ عشر مفتاحاً
--
-- الصندوقُ لا يمرّر الحمولة بل يبني `summary` بقائمةٍ صريحة (وهي الصواب:
-- ما لا يُذكر لا يعبُر). وثمنُ الصواب أن **كلَّ حقلٍ جديد يجب أن يُذكر** —
-- وإلا حملَ الصفُّ المحطاتِ وأسقطها الصندوق. ولا فحصٌ يمسك ذلك: كلُّ شيءٍ
-- «يعمل»، والناقصُ سطرٌ لا خطأ.
-- ----------------------------------------------------------------------------
create or replace function public.portal_inbox(p_limit integer default 50)
returns table(
  id         uuid,
  event      text,
  reference  text,
  offer_id   uuid,
  created_at timestamptz,
  read_at    timestamptz,
  summary    jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    n.id,
    n.event,
    -- 0056: رمز المتعهد لا مرجع العميل — نفس علاج 0028 في `portal_offers`،
    --       والاسم يبقى `reference` فلا تتغيّر قراءةُ الواجهة.
    public.partner_trip_code(nullif(n.payload ->> 'bookingId', '')::uuid),
    nullif(n.payload ->> 'offerId', '')::uuid,
    n.created_at,
    n.read_at,
    jsonb_strip_nulls(jsonb_build_object(
      'classTitle',   n.payload -> 'classTitle',
      'originLabel',  n.payload -> 'originLabel',
      'destLabel',    n.payload -> 'destLabel',
      -- 🔴 0144: المحطاتُ كما كتبتها `trip_stops_public` في الصف — أوسامٌ فقط.
      --    ولا تُعاد قراءتُها من `bookings` هنا: الصندوقُ **سجلُّ ما أُرسل**،
      --    فقراءةُ الحاضر فيه تُظهر للمتعهد رحلةً غير التي عُرضت عليه.
      'stops',        n.payload -> 'stops',
      'distanceKm',   n.payload -> 'distanceKm',
      'passengers',   n.payload -> 'passengers',
      'roundTrip',    n.payload -> 'roundTrip',
      'waitingHours', n.payload -> 'waitingHours',
      'pickupAt',     n.payload -> 'pickupAt',
      'payout',       n.payload -> 'payout',
      'currency',     n.payload -> 'currency',
      'expiresAt',    n.payload -> 'expiresAt',
      'round',        n.payload -> 'round'
    ))
  from public.notifications n
  where n.recipient_kind = 'partner'
    and n.recipient_id   = public.current_subcontractor_id()
  order by n.created_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;

comment on function public.portal_inbox(integer) is
  'صندوقُ إشعارات المتعهد. المرجعُ رمزُ رحلةٍ لا مرجعَ عميل (0056)، والملخّصُ قائمةٌ بيضاء صريحة — صارت ثلاثةَ عشر مفتاحاً بإضافة stops في 0144، وبدونها كان الصفُّ يحمل المحطات والصندوقُ يُسقطها. والمصدرُ حمولةُ الصف لا bookings: الصندوقُ سجلُّ ما أُرسل لا مرآةٌ للحاضر.';

-- ----------------------------------------------------------------------------
-- (٤) المنحُ كما كان — إعادةُ وضعٍ حرفيّةٌ ثم فحصٌ ذاتيّ يقرأ `proacl`
--
-- ‏`create or replace` لا يمسّ ACL، فهذه إعادةُ تثبيتٍ لا إصلاح. وهي مكتوبةٌ
-- لأن السابقتين (`0139` و`0140`) دفعتا ثمنَ الافتراض، ولأن من يقرأ الملف بعدنا
-- يجب أن يرى المنحَ المقصود مكتوباً لا مستنتَجاً من غيابه.
-- ----------------------------------------------------------------------------
revoke all on function public.dispatch_trip_payload(uuid, boolean)   from public, anon, authenticated;
revoke all on function public.customer_notification_payload(uuid)    from public, anon, authenticated;
revoke all on function public.portal_inbox(integer)                  from public, anon;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.dispatch_trip_payload(uuid, boolean) to service_role';
    execute 'grant execute on function public.customer_notification_payload(uuid) to service_role';
    execute 'grant execute on function public.portal_inbox(integer) to service_role';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    -- 🔒 والمتعهدُ وحده هو مَن يُمنح `portal_inbox`: الدالة `security definer`
    --    وتُصفّي بـ`current_subcontractor_id()` — فلا يرى غيرَ صفوفه هو.
    execute 'grant execute on function public.portal_inbox(integer) to authenticated';
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- (٥) الفحصُ الذاتي — على ما أُضيف **وعلى ما كان قائماً قبلنا** (D-58)
-- ----------------------------------------------------------------------------
do $$
declare
  v_def  text;
  v_acl  text;
  v_json jsonb;
begin
  -- (٥-أ) الثلاثةُ تذكر `stops` فعلاً
  v_def := pg_get_functiondef('public.dispatch_trip_payload(uuid, boolean)'::regprocedure);
  if v_def not like '%''stops''%' or v_def not like '%trip_stops_public%' then
    raise exception '0144: dispatch_trip_payload بلا stops من trip_stops_public';
  end if;
  -- والشواهدُ على ما كان قبلنا: القسمةُ العامة/التشغيلية سليمةٌ لم تُمسّ
  if v_def not like '%dispatch_public_label%'
     or v_def not like '%dispatch_safe_notes%'
     or v_def not like '%partner_trip_code%'
     or v_def not like '%customerPhone%' then
    raise exception '0144: dispatch_trip_payload فقدت حارساً كان قائماً قبل الهجرة';
  end if;
  -- 🔴 ولا `trip_stops_full` في أي حمولةِ إشعار — الثابتُ المعلَن في الترويسة
  if v_def like '%trip_stops_full%' then
    raise exception '0144: إحداثياتُ محطةٍ في حمولة إشعار (trip_stops_full) — نقضٌ لـD-19';
  end if;

  v_def := pg_get_functiondef('public.customer_notification_payload(uuid)'::regprocedure);
  if v_def not like '%''stops''%' or v_def not like '%trip_stops_public%' then
    raise exception '0144: customer_notification_payload بلا stops';
  end if;
  -- ⚠ والفحصُ على **مرجعِ العمود** لا على الكلمة: جسمُ الدالة يذكر الثلاثةَ في
  --   تعليقٍ عربيّ يشرح غيابَها، فبحثٌ عن الكلمة يحمرّ على الشرح نفسه.
  if v_def like '%b.subcontractor_cost%' or v_def like '%b.margin_amount%'
     or v_def like '%''payout''%' or v_def like '%''marginAmount''%' then
    raise exception '0144: حقلٌ تشغيليّ تسلّل إلى حمولة العميل';
  end if;

  v_def := pg_get_functiondef('public.portal_inbox(integer)'::regprocedure);
  if v_def not like '%''stops''%' then
    raise exception '0144: portal_inbox بلا stops في القائمة البيضاء';
  end if;
  if v_def not like '%partner_trip_code%' or v_def not like '%current_subcontractor_id%' then
    raise exception '0144: portal_inbox فقدت حارساً كان قائماً قبل الهجرة';
  end if;

  -- (٥-ب) المنحُ حرفاً كما قِيس قبل الهجرة
  select coalesce(array_to_string(p.proacl::text[], ' '), '')
    into v_acl
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.oid = 'public.dispatch_trip_payload(uuid, boolean)'::regprocedure;
  if v_acl like '%anon=%' or v_acl like '%authenticated=%' then
    raise exception '0144: dispatch_trip_payload منحت لدورِ متصفح — الحمولةُ التشغيلية فيها هاتفُ العميل';
  end if;

  select coalesce(array_to_string(p.proacl::text[], ' '), '')
    into v_acl
  from pg_proc p where p.oid = 'public.customer_notification_payload(uuid)'::regprocedure;
  if v_acl like '%anon=%' or v_acl like '%authenticated=%' then
    raise exception '0144: customer_notification_payload منحت لدورِ متصفح';
  end if;

  select coalesce(array_to_string(p.proacl::text[], ' '), '')
    into v_acl
  from pg_proc p where p.oid = 'public.portal_inbox(integer)'::regprocedure;
  if v_acl not like '%authenticated=%' then
    raise exception '0144: portal_inbox بلا منحة authenticated — صندوقُ كل متعهدٍ صار فارغاً';
  end if;
  if v_acl like '%anon=%' then
    raise exception '0144: portal_inbox منحت لـanon';
  end if;

  -- (٥-ج) شاهدٌ على السلوك لا على النصّ: لقطةٌ بمحطتين تُخرج وسمين بلا إحداثيات
  v_json := public.trip_stops_public(
    '{"stops":[{"label":"شارع ٩، المعادي","lat":29.96,"lng":31.26},
               {"label":"المقطم","lat":29.99,"lng":31.30}]}'::jsonb);
  if jsonb_array_length(v_json) <> 2 then
    raise exception '0144: trip_stops_public أخرجت % وسماً والمتوقع ٢', jsonb_array_length(v_json);
  end if;
  if (v_json -> 0) ? 'lat' or (v_json -> 0) ? 'lng'
     or (v_json -> 1) ? 'lat' or (v_json -> 1) ? 'lng' then
    raise exception '0144: إحداثيةٌ في وسمِ محطةٍ عامّ — نقضٌ لـD-19';
  end if;
  -- والترتيبُ محفوظ: «المعادي» أوّلاً لا «المقطم»
  if (v_json -> 1 ->> 'label') <> 'المقطم' then
    raise exception '0144: ترتيبُ المحطات انقلب — الثانية «%»', (v_json -> 1 ->> 'label');
  end if;
  -- وغيابُ المفتاح يُخرج مصفوفةً فارغة ⇒ `nullif` ⇒ حمولةٌ كما كانت
  if public.trip_stops_public('{"originLabel":"القاهرة"}'::jsonb) <> '[]'::jsonb then
    raise exception '0144: رحلةٌ بلا مفتاح stops لم تُخرج مصفوفةً فارغة';
  end if;

  raise notice '0144 ✅ المحطاتُ في حمولة البثّ وحمولة العميل وملخّص صندوق البورتال — أوسامٌ بترتيبها بلا إحداثيات، والمنحُ كما كان، والرحلةُ المباشرة بحمولةٍ لم تتغيّر.';
end;
$$;
