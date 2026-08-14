-- ============================================================================
-- 0042 — المتعهد يرى الطاقم الذي كتبه (الدفعة ٥ — تصليب بعد بناء الواجهة)
--
-- ── العيب: ميزةٌ تُكتب ولا تُقرأ ─────────────────────────────────────────
--
-- شحنت 0040 `set_trip_crew` فصار المتعهد يسجّل مركبة الرحلة وسائقها، وشحنت
-- الواجهةُ نموذجَ التسجيل. لكن `portal_trips()` — الدالة **الوحيدة** التي
-- يقرأ منها البورتال رحلاته — تُرجع عشرين عموداً **ولا واحد منها للمركبة أو
-- السائق**. فالمتعهد يحفظ الطاقم ثم يعيد تحميل الصفحة فلا يجد ما حفظه.
--
-- وأمسكه وكيل الواجهة أثناء البناء لا مراجعةٌ بعده: كتب قارئاً يميّز «الدالة
-- لا تُرجع الحقل» عن «الشريك لم يحفظ بعد» **بقراءة وجود المفتاح لا قيمته** —
-- وإلا لقالت الشاشةُ لمن حفظ أمسِ إنه لم يحفظ شيئاً. وهذا الملف يجعل التمييز
-- بلا معنى بإرجاع الحقول فعلاً.
--
-- ── ⚠ ولماذا هذه الدالة تحديداً تُوسَّع بحذر ────────────────────────────
--
-- `portal_trips` هي موضع **العيب الحرج الذي أمسكته مراجعة الدفعة ٢**: كانت
-- تعطي المتعهد **مرجع حجز العميل**، ومعه هاتف العميل (ضرورة تنفيذية) يجتمع
-- عاملا نموذج البحث العام `/track` ⇒ توكن ⇒ إجمالي العميل، أي هامشنا. فصلّبتها
-- 0028 لتُرجع `partner_trip_code(b.id)` بدل المرجع.
--
-- 🔒 **فالتوسيع أدناه لا يضيف إلا ما يملكه الشريك أصلاً**: معرّفا مركبته
-- وسائقه من سجلَّيه هو، ووسم أن الإدارة أدخلتهما نيابةً عنه. ولا عمود عميل
-- جديد ولا تكلفة ولا مرجع — والجسم منقول من `pg_get_functiondef` الحيّ
-- (**D-58**) بفرقٍ هو هذه الأعمدة الأربعة وحدها.
-- ============================================================================

-- ⚠ إسقاطٌ صريح: إضافة أعمدة تغيّر نوع الإرجاع، و`create or replace` لا تقبله.
drop function if exists public.portal_trips();

create or replace function public.portal_trips()
returns table (
  offer_id uuid, booking_id uuid, reference text, origin_label text,
  dest_label text, distance_km numeric, passengers integer, round_trip boolean,
  waiting_hours numeric, class_title text, pickup_at timestamptz, payout numeric,
  currency text, expires_at timestamptz, notes text, customer_name text,
  customer_phone text, customer_whatsapp text, status text,
  assigned_at timestamptz,
  -- ← 0042: طاقم الرحلة كما سجّله الشريك
  crew_vehicle_id uuid, crew_driver_id uuid, crew_by_admin boolean, crew_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
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
    d.crew_at
  from public.dispatches d
  join public.bookings b on b.id = d.booking_id
  left join public.trip_offers o
    on o.booking_id       = d.booking_id
   and o.subcontractor_id = d.assigned_subcontractor_id
   and o.status           = 'accepted'
  where d.assigned_subcontractor_id = public.current_subcontractor_id()
    and public.current_subcontractor_id() is not null
    and d.status  = 'assigned'
    and b.status in ('assigned', 'completed', 'cancelled')
  order by nullif(btrim(coalesce(b.trip ->> 'pickupAt', '')), '')::timestamptz asc nulls last,
           d.assigned_at desc;
$$;

revoke all on function public.portal_trips() from public, anon;
grant execute on function public.portal_trips() to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- فحص ذاتي — يحرس ما كان قائماً قبل ما أُضيف (D-58)
-- ----------------------------------------------------------------------------

do $$
declare
  v_def text;
  v_n   integer;
begin
  v_def := pg_get_functiondef(to_regprocedure('public.portal_trips()')::oid);
  if coalesce(v_def, '') = '' then
    raise exception '0042: مسبار portal_trips معطّل — لا تصدّق ما بعده';
  end if;

  -- (أ) 🔒 تصليب 0028 باقٍ: رمز المتعهد لا مرجع العميل
  if position('partner_trip_code' in v_def) = 0 then
    raise exception '0042: التوسيع محا تصليب 0028 — عاد مرجع العميل إلى البورتال (العيب الحرج)';
  end if;
  if position('b.reference' in v_def) > 0 then
    raise exception '0042: الدالة تُرجع مرجع العميل مباشرةً — انحدار خطير';
  end if;

  -- (ب) وحارس الهوية باقٍ: لا رحلة لغير صاحبها
  if position('current_subcontractor_id' in v_def) = 0 then
    raise exception '0042: حارس هوية المتعهد سقط من الدالة';
  end if;

  -- (ج) والأعمدة الأربعة أُضيفت فعلاً
  if position('assigned_vehicle_id' in v_def) = 0
     or position('assigned_driver_id' in v_def) = 0 then
    raise exception '0042: أعمدة الطاقم لم تُضَف — الشريك ما زال لا يرى ما حفظه';
  end if;

  -- (د) ولا تكلفة ولا هامش تسرّبا مع التوسيع
  if position('subcontractor_cost' in v_def) > 0 or position('margin_amount' in v_def) > 0 then
    raise exception '0042: عمود تكلفة أو هامش دخل نوع إرجاع البورتال';
  end if;

  -- (هـ) والمنح كما يجب: لا anon
  select count(*) into v_n from information_schema.routine_privileges
   where specific_schema = 'public' and routine_name = 'portal_trips' and grantee = 'anon';
  if v_n > 0 then
    raise exception '0042: anon يملك تنفيذاً على portal_trips';
  end if;

  raise notice '✔ 0042: الشريك يرى طاقمه، وتصليب 0028 وحارس الهوية باقيان، ولا تكلفة ولا anon';
end;
$$;
