-- ============================================================================
-- 0043 — تصليب طاقم الرحلة بعد المراجعتين (الدفعة ٥)
--
-- أربعة عيوب مُثبَتة حيّاً، أخطرها **كسرٌ مباشر لعمود العلامة البيضاء**.
--
-- ── (١) حرج: إعادة الإسناد لا تمسح الطاقم ────────────────────────────────
--
-- سجّل الشريك «أ» مركبته وسائقه، ثم أعاد التشغيل الإسناد إلى «ب» (مسارٌ مدعوم
-- صراحةً). ما زالت `dispatches` تحمل مركبة أ وسائقه، فحمولةُ العميل تُخرج:
-- لوحةَ أ، واسمَ سائقه، **وهاتفَه**. فيتصل العميل عند الالتقاء فيسمع «أنا من
-- شركة أخرى، لا رحلة لك عندي» — وهو **كشفُ هوية المنفّذ بالهاتف نفسه** لا
-- بتخمين. وفي الاتجاه المقابل سلّمت `portal_trips` الشريكَ ب معرّفَي مركبة أ
-- وسائقها، أي عبورُ حدّ الشريك.
--
-- 🔒 **والعلاج مُشغّل لا ترقيع ثلاث دوال.** `accept_offer` و`manual_assign` و
-- `admin_assign_trip` تبدّل المُسنَد إليه، وإصلاحُ كلٍّ منها يترك الرابعةَ التي
-- تُكتب غداً. فالمُشغّل على العمود نفسه يجعل المسح **مستحيل النسيان**: من يبدّل
-- الشريك يفقد الطاقم حتماً، بأي مسار كتب.
--
-- ── (٢) عالٍ: لا حارس حالة، قراءةً ولا كتابةً ────────────────────────────
--
-- حجزٌ **ملغى** ما زال يُخرج الطاقم، وصفحةُ العميل تقول فوقه «هذه هي السيارة
-- التي ستصلك». وفي الكتابة: شريكٌ **خسر الرحلة** (‏`status = 'queued'` بعد
-- إعادة البثّ) ما زال يبدّل ما يراه العميل ما دام العمود لم يُمسَح.
--
-- ── (٣) متوسط: ثلاثة مفاتيح خارج العقد في حمولة العميل ───────────────────
--
-- `byAdmin` و`assignedAt` تخرجان إلى `anon` وليستا في `CustomerCrewView`.
-- و`byAdmin` تحديداً **علمٌ تشغيلي يخبر العميل أن جهةً غير كاتب الصفحة أملت
-- البيانات** — إشارةٌ إلى وجود منفّذ ثالث، وهي بعينها ما لا يبلغ العميل.
-- وتعليق الصفحة كان يعترف بأنه «لا يعرضهما رغم وصولهما» — أي حجبٌ في العرض،
-- وهو ما ترفضه ترويسة 0040 نفسها. فتُحذفان من المصدر، ويُثبَّت `vehicleYear`
-- في العقد لأنه مفيدٌ للعميل ومقصود.
--
-- ── (٤) منخفض: الهاتف يُكشف ولا يُعاد حجبه ──────────────────────────────
--
-- المقارنة كانت ذات طرف واحد، فبعد ثلاثين يوماً من الرحلة ما زال الرقم يخرج.
-- والمبرر التجاري («كل رقم يُسلَّم مبكراً نافذة تخطٍّ») يسري بعد الرحلة كما قبلها.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (١) المُشغّل: تبديل الشريك يمسح طاقمه حتماً
-- ----------------------------------------------------------------------------

create or replace function public.clear_crew_on_reassign()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  /*
   * الشرط `is distinct from` لا `<>`: أحد الطرفين قد يكون `null` (إسنادٌ أول،
   * أو إلغاءُ إسناد)، و`<>` مع `null` تُنتج `null` فلا يقع المسح — وهي بالضبط
   * الحالة التي يعود فيها الحجز إلى الطابور بطاقمٍ قديم معلَّق على صفحة العميل.
   */
  if new.assigned_subcontractor_id is distinct from old.assigned_subcontractor_id then
    new.assigned_vehicle_id := null;
    new.assigned_driver_id  := null;
    new.crew_by_admin       := false;
    new.crew_at             := null;
  end if;
  return new;
end;
$$;

drop trigger if exists dispatches_clear_crew_on_reassign on public.dispatches;
create trigger dispatches_clear_crew_on_reassign
  before update of assigned_subcontractor_id on public.dispatches
  for each row execute function public.clear_crew_on_reassign();

comment on function public.clear_crew_on_reassign() is
  'يمسح طاقم الرحلة كلما تبدّل المُسنَد إليه. مُشغّل لا ترقيع دوال: ثلاث دوال تبدّل الشريك اليوم ورابعةٌ تُكتب غداً — والمسح هنا مستحيل النسيان مهما كان مسار التبديل (0043 عيب ١)';

-- ولا مسحَ للماضي: صفوفٌ قائمة قد تحمل طاقم شريكٍ سابق. تُنظَّف صراحةً.
update public.dispatches d
   set assigned_vehicle_id = null,
       assigned_driver_id  = null,
       crew_by_admin       = false,
       crew_at             = null
 where (d.assigned_vehicle_id is not null
        and not exists (select 1 from public.subcontractor_vehicles v
                         where v.id = d.assigned_vehicle_id
                           and v.subcontractor_id = d.assigned_subcontractor_id))
    or (d.assigned_driver_id is not null
        and not exists (select 1 from public.subcontractor_drivers dr
                         where dr.id = d.assigned_driver_id
                           and dr.subcontractor_id = d.assigned_subcontractor_id));

-- ----------------------------------------------------------------------------
-- (٢) حارس الحالة على الكتابة
-- ----------------------------------------------------------------------------

create or replace function public.set_trip_crew(
  p_booking_id uuid,
  p_vehicle_id uuid,
  p_driver_id  uuid
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_sub uuid;
  v_d   record;
begin
  v_sub := public.current_subcontractor_id();
  if v_sub is null then
    raise exception 'تسجيل طاقم الرحلة متاح لحساب متعهد فقط' using hint = 'forbidden';
  end if;

  select d.* into v_d from public.dispatches d where d.booking_id = p_booking_id;
  if not found then
    raise exception 'لا دورة إسناد لهذا الحجز' using hint = 'not-found';
  end if;

  if v_d.assigned_subcontractor_id is distinct from v_sub then
    raise exception 'هذه الرحلة ليست ضمن رحلاتك' using hint = 'forbidden';
  end if;

  -- 🔒 حارس الحالة (0043 عيب ٢): دورةٌ عادت إلى الطابور أو أُلغيت ليست رحلةً
  --    جارية، ومن خسرها لا يبدّل ما يراه العميل.
  if v_d.status <> 'assigned' then
    raise exception 'لا يمكن تسجيل الطاقم إلا على رحلة مُسنَدة جارية' using hint = 'forbidden';
  end if;

  if p_vehicle_id is not null and not exists (
    select 1 from public.subcontractor_vehicles v
     where v.id = p_vehicle_id and v.subcontractor_id = v_sub
  ) then
    raise exception 'المركبة ليست من أسطولك' using hint = 'forbidden';
  end if;

  if p_driver_id is not null and not exists (
    select 1 from public.subcontractor_drivers dr
     where dr.id = p_driver_id and dr.subcontractor_id = v_sub
  ) then
    raise exception 'السائق ليس من سجلّك' using hint = 'forbidden';
  end if;

  update public.dispatches
     set assigned_vehicle_id = p_vehicle_id,
         assigned_driver_id  = p_driver_id,
         crew_by_admin       = false,
         crew_at             = now()
   where booking_id = p_booking_id;
end;
$$;

revoke all on function public.set_trip_crew(uuid, uuid, uuid) from public, anon;
grant execute on function public.set_trip_crew(uuid, uuid, uuid) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- (٣) و(٤) حمولة العميل: حارس حالة، وحقلان يُحذفان، ونافذة الهاتف بطرفين
-- ----------------------------------------------------------------------------
-- الجسم منقول من `pg_get_functiondef` الحيّ (D-58). الفرق: شرط الحالة داخل
-- تعبير `crew`، وحذف `byAdmin` و`assignedAt`، وطرفٌ ثانٍ لنافذة الهاتف.
-- ----------------------------------------------------------------------------

drop function if exists public.get_booking_by_token(text);
create or replace function public.get_booking_by_token(p_token text)
returns table (
  id uuid, reference text, status text, class_slug text, class_title text,
  total numeric, currency text, plan text, amount_due numeric,
  amount_remaining numeric, customer_name text, customer_phone text,
  customer_whatsapp text, trip jsonb, created_at timestamptz,
  updated_at timestamptz, payments jsonb, crew jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    b.id, b.reference, b.status, b.class_slug, b.class_title, b.total,
    b.currency, b.plan, b.amount_due, b.amount_remaining,
    b.customer_name, b.customer_phone, b.customer_whatsapp,
    b.trip, b.created_at, b.updated_at,
    coalesce(
      (
        select jsonb_agg(
                 jsonb_build_object(
                   'id', p.id, 'amount', p.amount, 'status', p.status,
                   'note', p.note, 'createdAt', p.created_at, 'verifiedAt', p.verified_at
                 ) order by p.created_at
               )
        from public.payments p
        where p.booking_id = b.id
          and p.visible_to_customer          -- ← 0027: الحجب في القاعدة لا في العرض
      ),
      '[]'::jsonb
    ),
    -- ← 0040، مصلَّحاً في 0043: طاقم الرحلة بحارس حالة وبلا حقول تشغيلية
    (
      select case
        when d.assigned_vehicle_id is null and d.assigned_driver_id is null then null
        else jsonb_build_object(
          'vehicleLabel',  v.label,
          'vehicleColor',  v.color,
          'vehiclePlate',  v.plate,
          'vehicleYear',   v.model_year,
          'driverName',    dr.name,
          'driverPhone',   case
                             when dr.phone is null then null
                             when (b.trip ->> 'pickupAt') is null then null
                             -- نافذة بطرفين: تُفتح قبل الالتقاء بالمهلة،
                             -- وتُغلق بعده باثنتي عشرة ساعة (0043 عيب ٤)
                             when now() >= ((b.trip ->> 'pickupAt')::timestamptz
                                            - make_interval(mins => cfg.lead))
                              and now() <= ((b.trip ->> 'pickupAt')::timestamptz
                                            + interval '12 hours') then dr.phone
                             else null
                           end,
          'phoneVisibleAt', case
                              when dr.phone is null then null
                              when (b.trip ->> 'pickupAt') is null then null
                              else ((b.trip ->> 'pickupAt')::timestamptz
                                    - make_interval(mins => cfg.lead))
                            end
        )
      end
      from public.dispatches d
      left join public.subcontractor_vehicles v on v.id = d.assigned_vehicle_id
      left join public.subcontractor_drivers  dr on dr.id = d.assigned_driver_id
      cross join lateral (
        select coalesce(t.driver_phone_lead_minutes, 120) as lead
          from (select true) one
          left join public.trip_settings t on t.id = true
      ) cfg
      where d.booking_id = b.id
        -- 🔒 حارس الحالة (0043 عيب ٢): لا طاقم على حجزٍ ملغى أو دورةٍ عادت
        --    إلى الطابور — الصفحة تقول فوقه «هذه هي السيارة التي ستصلك».
        and d.status = 'assigned'
        and b.status in ('assigned', 'completed')
    )
  from public.bookings b
  where p_token is not null
    and length(p_token) >= 32
    and b.public_token = p_token;
$$;

revoke all on function public.get_booking_by_token(text) from public;
grant execute on function public.get_booking_by_token(text) to anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- فحص ذاتي — ويحرس هذه المرة **اسم عمود الإخراج** لا نصّ الجسم
-- ----------------------------------------------------------------------------
-- ⚠ درسٌ من 0042: فحصُها بحث عن `assigned_vehicle_id` في نصّ الدالة فوجده في
-- جسمها (`d.assigned_vehicle_id`) ومرّ أخضر — بينما اسم عمود الإخراج
-- `crew_vehicle_id` لا يطابق ما يقرؤه العميل. «فحصٌ لا يمكن أن يفشل» بعينه.
-- فالفحص هنا **ينادي الدوال ويقيس ناتجها**.
-- ----------------------------------------------------------------------------

do $$
declare
  v_def  text;
  v_n    integer;
  v_keys text;
begin
  -- (أ) المُشغّل مركَّب على العمود الصحيح
  if not exists (
    select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
     where not t.tgisinternal and c.relname = 'dispatches'
       and t.tgname = 'dispatches_clear_crew_on_reassign'
  ) then
    raise exception '0043: مُشغّل مسح الطاقم غير مركَّب';
  end if;

  -- (ب) 🔒 وأنه يعمل فعلاً — نداءٌ حيّ لا قراءة تعريف
  declare
    v_booking uuid; v_sub uuid; v_veh uuid; v_other uuid;
  begin
    select d.booking_id, d.assigned_subcontractor_id into v_booking, v_sub
      from public.dispatches d where d.assigned_subcontractor_id is not null limit 1;
    select v.id into v_veh from public.subcontractor_vehicles v
     where v.subcontractor_id = v_sub limit 1;
    select s.id into v_other from public.subcontractors s where s.id <> v_sub limit 1;

    if v_booking is not null and v_veh is not null and v_other is not null then
      update public.dispatches set assigned_vehicle_id = v_veh where booking_id = v_booking;
      update public.dispatches set assigned_subcontractor_id = v_other where booking_id = v_booking;
      select count(*) into v_n from public.dispatches
       where booking_id = v_booking and assigned_vehicle_id is null;
      if v_n <> 1 then
        raise exception '0043: تبديل الشريك لم يمسح الطاقم — المُشغّل لا يعمل';
      end if;
      -- إرجاع الحالة كما كانت
      update public.dispatches set assigned_subcontractor_id = v_sub where booking_id = v_booking;
    end if;
  end;

  -- (ج) حارس الحالة مكتوب في الدالتين
  v_def := pg_get_functiondef(to_regprocedure('public.set_trip_crew(uuid,uuid,uuid)')::oid);
  if position('رحلة مُسنَدة جارية' in v_def) = 0 then
    raise exception '0043: set_trip_crew بلا حارس حالة';
  end if;

  v_def := pg_get_functiondef(to_regprocedure('public.get_booking_by_token(text)')::oid);
  if position('visible_to_customer' in v_def) = 0 then
    raise exception '0043: حجب الإيصالات (0027) سقط — انحدار';
  end if;
  if position('partner_trip_code' in
       pg_get_functiondef(to_regprocedure('public.portal_trips()')::oid)) = 0 then
    raise exception '0043: تصليب 0028 سقط من portal_trips';
  end if;

  -- (د) 🔒 والحقلان التشغيليان خرجا من حمولة العميل — **بقياس المفاتيح فعلاً**
  select string_agg(k, '، ') into v_keys
    from (
      select jsonb_object_keys(c.crew) k
        from public.get_booking_by_token(
               (select public_token from public.bookings b
                 join public.dispatches d on d.booking_id = b.id
                where d.assigned_vehicle_id is not null and b.public_token is not null
                limit 1)) c
       where c.crew is not null
    ) t;

  if v_keys is not null then
    if position('byAdmin' in v_keys) > 0 or position('assignedAt' in v_keys) > 0 then
      raise exception '0043: حقلٌ تشغيلي ما زال في حمولة العميل: %', v_keys;
    end if;
    raise notice '  ↳ مفاتيح حمولة العميل المقيسة: %', v_keys;
  end if;

  raise notice '✔ 0043: المُشغّل يمسح عند التبديل (مقيس بنداء حيّ)، وحارس الحالة قائم، ولا حقل تشغيلي في حمولة العميل';
end;
$$;
