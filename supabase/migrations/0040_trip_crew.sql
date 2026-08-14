-- ============================================================================
-- 0040 — المركبة والسائق بعد الإسناد (الدفعة ٥ — الملاحظة ٥، الشقّ الأول)
--
-- نصّ المالك في `docs/VISION.md` ملحق ٢ ملاحظة ٥: «**العميل لا يعرف ما
-- سيأتيه** — لا نوع السيارة ولا شكلها ولا رقمها ولا لونها، ولا السائق
-- (اسم · هاتف · صورة).»
--
-- والعقد الملزم: `lib/crew-types.ts` — يُقرأ قبل هذا الملف.
--
-- ── القيد الحاكم: بلا أصول ────────────────────────────────────────────────
--
-- «قسم السائقين أُلغي بقرار بدر (2026-08-11) — لا إدارة سائقين مباشرين
-- إطلاقاً». فـ`subcontractor_drivers` أدناه **سجلّ الشريك لا سجلّ المنصة**:
-- نظيرٌ حرفيّ لـ`subcontractor_vehicles` بسياساته الأربع نفسها، يملؤه المتعهد
-- من بورتاله. ولا شاشة «سائقون» في `/admin` — الإدارة تقرأ وتصحّح عند الحاجة
-- ولا تدير من ينفّذ.
--
-- ── 🔒 الحجب في القاعدة لا في العرض ──────────────────────────────────────
--
-- `get_booking_by_token` ممنوحة لـ`anon` وتُنادى مباشرةً من PostgREST. فهاتفُ
-- السائق يُحجب **داخلها** بمقارنة `pickupAt - lead` بالوقت الحالي، ولا يخرج في
-- الحمولة قبل نافذته. حاجبٌ في JSX كان يُتخطّى بنداء واحد — وهو نفس الدرس
-- المكتوب في الدفعة ٢ لإيصالات الأدمن.
--
-- ⚠ **وجسم `get_booking_by_token` منقول من الكتالوج الحيّ** (`pg_get_functiondef`)
-- لا من ملف هجرة: استُبدلت مرتين (0007 ثم 0027)، ونسخُ الجسم الخطأ هو بعينه ما
-- أعاد عيباً حرجاً في الدفعة ٣ (**D-58**). الفرق عن المُنتَج الحيّ **إضافةٌ
-- واحدة**: عمود `crew` في نوع الإرجاع وتعبيرُه، وما عداه محفوظ حرفاً بحرف.
--
-- ── ما أُجِّل بقرار، لا سهواً ─────────────────────────────────────────────
--
-- **رفع الصور** (سائق ومركبة): العمودان `photo_path` موجودان هنا فالإضافة
-- لاحقاً **توسعة لا تغيير**، لكن الرفع نفسه يحتاج **دلواً خاصاً بسياساته** —
-- ودلو `media` القائم **عام** (‏`storage.buckets.public = true`)، فصورة سائق
-- فيه يقرؤها أي أحد بالمسار. وصورةُ السائق بيانات شخصية لطرفٍ ثالث ليس مستخدماً
-- عندنا، فمكانها دلو خاص برابط موقَّع كالإيصالات. وكتابةُ سياسات تخزين على عجل
-- هي بالضبط شكل الخطأ الذي يُسرِّب صامتاً — فتؤجَّل بهجرتها ومراجعتها.
-- **ومُحفِّزها:** أول طلب من المالك لعرض صورة، أو أول شكوى «لا أعرف شكل من
-- سيأتيني». وما يشحن اليوم — الاسم والهاتف والمركبة واللوحة واللون — هو لبّ
-- الملاحظة.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (١) سجلّ سائقي الشريك — نظير `subcontractor_vehicles` حرفاً بحرف
-- ----------------------------------------------------------------------------

create table if not exists public.subcontractor_drivers (
  id               uuid primary key default gen_random_uuid(),
  subcontractor_id uuid not null references public.subcontractors(id) on delete cascade,
  name             text not null,
  phone            text not null,
  /** مسار في دلو خاص — يُملأ حين تُشحن هجرة الصور (انظر الترويسة) */
  photo_path       text,
  /** رقم الرخصة — للشريك والإدارة، **ولا يصل العميل إطلاقاً** */
  license_no       text,
  active           boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint subcontractor_drivers_name_chk
    check (length(btrim(name)) between 2 and 120),
  constraint subcontractor_drivers_phone_chk
    check (length(regexp_replace(phone, '[^0-9]', '', 'g')) >= 8)
);

comment on table public.subcontractor_drivers is
  'سجلّ سائقي المتعهد — يملكه هو ويديره من بورتاله. المنصة لا تدير سائقين (عمود «بلا أصول»)، وهذا الجدول يعرض ما أعلنه الشريك. العقد: lib/crew-types.ts';

create index if not exists subcontractor_drivers_sub_idx
  on public.subcontractor_drivers (subcontractor_id, active);

drop trigger if exists subcontractor_drivers_touch on public.subcontractor_drivers;
create trigger subcontractor_drivers_touch
  before update on public.subcontractor_drivers
  for each row execute function public.touch_updated_at();

alter table public.subcontractor_drivers enable row level security;

revoke all on table public.subcontractor_drivers from public, anon;
grant select, insert, update, delete on table public.subcontractor_drivers to authenticated;
grant all on table public.subcontractor_drivers to service_role;

-- السياسات الأربع بنمط `subcontractor_vehicles_*_own_or_admin` نفسه
drop policy if exists subcontractor_drivers_select_own_or_admin on public.subcontractor_drivers;
create policy subcontractor_drivers_select_own_or_admin on public.subcontractor_drivers
  for select to authenticated
  using (public.is_admin() or subcontractor_id = public.current_subcontractor_id());

drop policy if exists subcontractor_drivers_insert_own_or_admin on public.subcontractor_drivers;
create policy subcontractor_drivers_insert_own_or_admin on public.subcontractor_drivers
  for insert to authenticated
  with check (public.is_admin() or subcontractor_id = public.current_subcontractor_id());

drop policy if exists subcontractor_drivers_update_own_or_admin on public.subcontractor_drivers;
create policy subcontractor_drivers_update_own_or_admin on public.subcontractor_drivers
  for update to authenticated
  using (public.is_admin() or subcontractor_id = public.current_subcontractor_id())
  with check (public.is_admin() or subcontractor_id = public.current_subcontractor_id());

drop policy if exists subcontractor_drivers_delete_own_or_admin on public.subcontractor_drivers;
create policy subcontractor_drivers_delete_own_or_admin on public.subcontractor_drivers
  for delete to authenticated
  using (public.is_admin() or subcontractor_id = public.current_subcontractor_id());

-- ----------------------------------------------------------------------------
-- (٢) «شكلها ولونها» — عمودان على المركبة، ونصّ الملاحظة يطلبهما صراحةً
-- ----------------------------------------------------------------------------

alter table public.subcontractor_vehicles add column if not exists color      text;
alter table public.subcontractor_vehicles add column if not exists photo_path text;

comment on column public.subcontractor_vehicles.color is
  'لون المركبة كما يصفه المتعهد — نصّ حرّ لا قائمة مغلقة: «فضي» و«رمادي فاتح» وصفان مشروعان';

-- ----------------------------------------------------------------------------
-- (٣) طاقم الرحلة على دورة الإسناد
-- ----------------------------------------------------------------------------
-- ⚠ **معرِّفان لا لقطة** — بخلاف `booking_extras` التي تجمّد السعر. والفرق
-- مقصود: السعر حقٌّ مالي لا يتغيّر بعد الاتفاق، أما اللوحة واسم السائق فواقعٌ
-- تشغيلي يُقرأ لحظة قراءته — فتصحيحُ لوحةٍ كُتبت خطأً يصل العميل فوراً بدل أن
-- يبقى الخطأ مجمَّداً على صفحته.
-- ----------------------------------------------------------------------------

alter table public.dispatches
  add column if not exists assigned_vehicle_id uuid references public.subcontractor_vehicles(id) on delete set null,
  add column if not exists assigned_driver_id  uuid references public.subcontractor_drivers(id)  on delete set null,
  add column if not exists crew_by_admin       boolean not null default false,
  add column if not exists crew_at             timestamptz;

comment on column public.dispatches.crew_by_admin is
  'أدخلته الإدارة نيابةً عن الشريك (اتصال هاتفي) — يُوسم ولا يُخفى، على سابقة admin_attach_receipt';

-- ----------------------------------------------------------------------------
-- (٤) مهلة ظهور هاتف السائق — في `trip_settings` حيث تعيش مقابض الرحلات
-- ----------------------------------------------------------------------------
-- الملاحظة ٣ في الدفعة ٢ طلبت «قسماً كاملاً لضبط الرحلات يجمع كل ما يخصّها في
-- مكان واحد» — فلا مفتاح رحلات في مكان ثانٍ.
-- ----------------------------------------------------------------------------

alter table public.trip_settings
  add column if not exists driver_phone_lead_minutes integer not null default 120;

alter table public.trip_settings drop constraint if exists trip_settings_lead_chk;
alter table public.trip_settings add constraint trip_settings_lead_chk
  check (driver_phone_lead_minutes between 0 and 10080);

comment on column public.trip_settings.driver_phone_lead_minutes is
  'كم دقيقة قبل موعد الالتقاء يظهر هاتف السائق للعميل. صفر = فور الإسناد (خيار مشروع يُختار صراحةً). الافتراضي ١٢٠: يكفي للطمأنة ولا يفتح نافذة أيام يتفق فيها العميل مع السائق مباشرةً';

-- توسيع `trip_config()` بالمقبض الجديد — نفس الشكل، عمود ثالث.
-- ⚠ **والإسقاط الصريح لازم**: `create or replace` لا تغيّر نوع الإرجاع، وإضافة
-- عمود ثالث تغييرٌ فيه. نفس ما فعلته 0031 بأعضاء التسعير الثلاثة.
drop function if exists public.trip_config();
create or replace function public.trip_config()
returns table (
  unpaid_cancel_enabled     boolean,
  unpaid_timeout_minutes    integer,
  driver_phone_lead_minutes integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce(t.unpaid_cancel_enabled, false),
    coalesce(t.unpaid_timeout_minutes, 1440),
    coalesce(t.driver_phone_lead_minutes, 120)
  from (select true) one
  left join public.trip_settings t on t.id = true;
$$;

revoke all on function public.trip_config() from public, anon, authenticated;
grant execute on function public.trip_config() to service_role;

-- ----------------------------------------------------------------------------
-- (٥) الكتابة — المتعهد المُسنَد إليه وحده
-- ----------------------------------------------------------------------------
-- الهوية تُشتق ولا تُمرَّر (نمط `accept_offer`): متعهدٌ آخر لا يكتب طاقم رحلةٍ
-- ليست له، ولا ينتحل أحدٌ هوية أحد.
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

  -- الرحلة ليست له: الرسالة لا تكشف لمن هي
  if v_d.assigned_subcontractor_id is distinct from v_sub then
    raise exception 'هذه الرحلة ليست ضمن رحلاتك' using hint = 'forbidden';
  end if;

  -- المركبة والسائق من سجلّه هو — وإلا أعلن مركبة غيره على صفحة العميل
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

/** تجاوز إداري — يُوسم `crew_by_admin` ولا يُخفى (سابقة `admin_attach_receipt`) */
create or replace function public.admin_set_trip_crew(
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
begin
  if not public.is_admin() then
    raise exception 'التجاوز الإداري لطاقم الرحلة متاح للمشرفين فقط' using hint = 'forbidden';
  end if;

  select d.assigned_subcontractor_id into v_sub
    from public.dispatches d where d.booking_id = p_booking_id;
  if v_sub is null then
    raise exception 'الحجز غير مُسنَد بعد — لا طاقم قبل الإسناد' using hint = 'not-assigned';
  end if;

  -- 🔒 وحتى الإدارة لا تُسنِد مركبة شريكٍ آخر: الحارس هنا على **ملكية** الصف
  --    لا على دور المنادي، فلا تظهر على صفحة العميل لوحةٌ لا يملكها المنفّذ.
  if p_vehicle_id is not null and not exists (
    select 1 from public.subcontractor_vehicles v
     where v.id = p_vehicle_id and v.subcontractor_id = v_sub
  ) then
    raise exception 'المركبة ليست من أسطول المتعهد المُسنَد إليه' using hint = 'invalid-input';
  end if;

  if p_driver_id is not null and not exists (
    select 1 from public.subcontractor_drivers dr
     where dr.id = p_driver_id and dr.subcontractor_id = v_sub
  ) then
    raise exception 'السائق ليس من سجلّ المتعهد المُسنَد إليه' using hint = 'invalid-input';
  end if;

  update public.dispatches
     set assigned_vehicle_id = p_vehicle_id,
         assigned_driver_id  = p_driver_id,
         crew_by_admin       = true,
         crew_at             = now()
   where booking_id = p_booking_id;
end;
$$;

revoke all on function public.set_trip_crew(uuid, uuid, uuid)       from public, anon;
revoke all on function public.admin_set_trip_crew(uuid, uuid, uuid) from public, anon;
grant execute on function public.set_trip_crew(uuid, uuid, uuid)       to authenticated, service_role;
grant execute on function public.admin_set_trip_crew(uuid, uuid, uuid) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- (٦) ما يراه العميل — توسيع `get_booking_by_token` بعمود `crew` وحده
-- ----------------------------------------------------------------------------
-- الجسم أدناه منقول من `pg_get_functiondef` الحيّ (D-58). الفرق عن المُنتَج:
-- عمود `crew jsonb` في نوع الإرجاع وتعبيره، وما عداه محفوظ حرفاً بحرف — بما
-- فيه حجب الإيصالات غير الظاهرة الذي أضافته 0027.
--
-- 🔒 **والهاتف محجوب داخل التعبير**: يخرج `null` حتى `pickupAt - lead`.
--    و`phoneVisibleAt` يخرج دائماً كي يقرأ العميل **متى** يظهر بدل أن يظنّ
--    غيابه عطلاً — وهو نفس مبدأ «اشرح الفارق ولا تُجبر الرقم» (النمط ٨).
-- ----------------------------------------------------------------------------

-- ⚠ إسقاطٌ صريح قبل الإنشاء: عمود `crew` يغيّر نوع الإرجاع، و`create or
-- replace` لا تقبل ذلك. والمنح تُعاد أدناه لأن الإسقاط يمحوها.
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
    b.id,
    b.reference,
    b.status,
    b.class_slug,
    b.class_title,
    b.total,
    b.currency,
    b.plan,
    b.amount_due,
    b.amount_remaining,
    b.customer_name,
    b.customer_phone,
    b.customer_whatsapp,
    b.trip,
    b.created_at,
    b.updated_at,
    coalesce(
      (
        select jsonb_agg(
                 jsonb_build_object(
                   'id',         p.id,
                   'amount',     p.amount,
                   'status',     p.status,
                   'note',       p.note,
                   'createdAt',  p.created_at,
                   'verifiedAt', p.verified_at
                 )
                 order by p.created_at
               )
        from public.payments p
        where p.booking_id = b.id
          and p.visible_to_customer          -- ← 0027: الحجب في القاعدة لا في العرض
      ),
      '[]'::jsonb
    ),
    -- ← 0040: طاقم الرحلة، والهاتف محجوب بالتوقيت داخل القاعدة
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
                             when now() >= ((b.trip ->> 'pickupAt')::timestamptz
                                            - make_interval(mins => cfg.lead)) then dr.phone
                             else null
                           end,
          'phoneVisibleAt', case
                              when dr.phone is null then null
                              when (b.trip ->> 'pickupAt') is null then null
                              else ((b.trip ->> 'pickupAt')::timestamptz
                                    - make_interval(mins => cfg.lead))
                            end,
          'byAdmin',       d.crew_by_admin,
          'assignedAt',    d.crew_at
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
    )
  from public.bookings b
  where p_token is not null
    and length(p_token) >= 32
    and b.public_token = p_token;
$$;

revoke all on function public.get_booking_by_token(text) from public;
grant execute on function public.get_booking_by_token(text) to anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- (٧) رصد التدقيق — الجدول الجديد ينضمّ إلى الأربعة والثلاثين (الملاحظة ١٥)
-- ----------------------------------------------------------------------------
-- 🔒 و`phone` في قائمة الحجب منذ 0037، فتغييرُ هاتف سائق يُسجَّل «تغيّر» بلا
--    نسخ قيمته — تماماً كهاتف المتعهد.
-- ----------------------------------------------------------------------------

drop trigger if exists audit_subcontractor_drivers on public.subcontractor_drivers;
create trigger audit_subcontractor_drivers
  after insert or update or delete on public.subcontractor_drivers
  for each row execute function public.log_audit('name');

-- ----------------------------------------------------------------------------
-- فحص ذاتي — كل مسبار يُثبَت قبل أن يُصدَّق
-- ----------------------------------------------------------------------------

do $$
declare
  v_n    integer;
  v_def  text;
begin
  -- (أ) الجدول والسياسات الأربع
  if to_regclass('public.subcontractor_drivers') is null then
    raise exception '0040: جدول السائقين لم يُنشأ';
  end if;
  select count(*) into v_n from pg_policy p join pg_class c on c.oid = p.polrelid
   where c.relname = 'subcontractor_drivers';
  if v_n <> 4 then
    raise exception '0040: سياسات سجلّ السائقين % لا أربع', v_n;
  end if;
  if not (select relrowsecurity from pg_class where relname = 'subcontractor_drivers') then
    raise exception '0040: RLS غير مفعّلة على سجلّ السائقين';
  end if;

  -- (ب) `anon` لا يمسّ الجدول
  select count(*) into v_n from information_schema.table_privileges
   where table_schema = 'public' and table_name = 'subcontractor_drivers' and grantee = 'anon';
  if v_n > 0 then
    raise exception '0040: anon يملك صلاحية على سجلّ السائقين';
  end if;

  -- (ج) الأعمدة المضافة موجودة فعلاً — تحقق من الكتالوج لا من الذاكرة (الدرس ١٤)
  foreach v_def in array array['color', 'photo_path'] loop
    if not exists (select 1 from information_schema.columns
                    where table_schema='public' and table_name='subcontractor_vehicles'
                      and column_name = v_def) then
      raise exception '0040: عمود المركبة «%» لم يُضَف', v_def;
    end if;
  end loop;
  foreach v_def in array array['assigned_vehicle_id','assigned_driver_id','crew_by_admin','crew_at'] loop
    if not exists (select 1 from information_schema.columns
                    where table_schema='public' and table_name='dispatches'
                      and column_name = v_def) then
      raise exception '0040: عمود الإسناد «%» لم يُضَف', v_def;
    end if;
  end loop;

  -- (د) 🔒 التوسيع حافظ على ما كان: حجب الإيصالات غير الظاهرة باقٍ (D-58)
  v_def := pg_get_functiondef(to_regprocedure('public.get_booking_by_token(text)')::oid);
  if coalesce(v_def, '') = '' then
    raise exception '0040: مسبار get_booking_by_token معطّل — لا تصدّق ما بعده';
  end if;
  if position('visible_to_customer' in v_def) = 0 then
    raise exception '0040: التوسيع محا حجب الإيصالات الذي أضافته 0027 — انحدار';
  end if;
  if position('crew' in v_def) = 0 then
    raise exception '0040: عمود crew لم يُضَف إلى نوع الإرجاع';
  end if;

  -- (هـ) الحجب الزمني للهاتف مكتوب فعلاً داخل الدالة لا في الواجهة
  if position('driver_phone_lead_minutes' in v_def) = 0
     and position('make_interval' in v_def) = 0 then
    raise exception '0040: هاتف السائق بلا حجب زمني داخل القاعدة';
  end if;

  -- (و) والمُشغّل التدقيقي على الجدول الجديد
  if not exists (
    select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
     where not t.tgisinternal and t.tgname = 'audit_subcontractor_drivers'
  ) then
    raise exception '0040: سجلّ السائقين بلا مُشغّل تدقيق';
  end if;

  raise notice '✔ 0040: سجلّ السائقين بسياساته، وعمودا الشكل واللون، وطاقم الإسناد، وهاتفٌ محجوب بالتوقيت في القاعدة';
end;
$$;
