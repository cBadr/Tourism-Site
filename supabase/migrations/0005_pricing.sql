-- ============================================================================
-- 0005_pricing.sql — محرك التسعير: فئات السيارات + التعريفات + إعدادات الذروة
--                    + كاش الجيوكودنج والمسافات + دالة quote_price
-- المرحلة ٣: كل حساب مالي يقع هنا داخل Postgres — الواجهة تعرض فقط ولا تحسب أبداً.
-- العقد المرجعي للتواقيع والمعادلة وقاعدة الأهلية: lib/pricing-types.ts — لا انحراف عنه.
-- يُنفَّذ بعد 0001 (يعتمد على public.is_admin و public.touch_updated_at).
-- آمن لإعادة التنفيذ (idempotent).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (١) فئات السيارات — الفئات الأربع (سيدان/SUV/ميني باص/باص) وتُدار من اللوحة
-- capacity: السعة القصوى بالركاب وهي أساس قاعدة الأهلية (الأطفال يُحسبون ضمن العدد)
-- active: الإخفاء من الموقع العام بلا حذف (الحذف يجرّ التعريفة معه cascade)
-- ----------------------------------------------------------------------------
create table if not exists public.vehicle_classes (
  id        uuid primary key default gen_random_uuid(),
  slug      text unique not null,
  title     text not null,
  capacity  integer not null check (capacity > 0),
  short     text,
  image_url text,
  active    boolean not null default true,
  sort      integer not null default 0
);

-- فهرس مسار القراءة الأساسي: الفئات النشطة مرتبة بالسعة (قاعدة الأهلية)
create index if not exists vehicle_classes_active_capacity_idx
  on public.vehicle_classes (active, capacity);

-- ----------------------------------------------------------------------------
-- (٢) التعريفات — صف واحد لكل فئة (العلاقة ١:١ مفروضة بجعل class_id مفتاحاً أساسياً)
-- round_trip_factor: معامل الذهاب والعودة، ١٫٨ يعني خصم ١٠٪ عن ضعف السعر
-- قيود عدم السلبية صمام أمان: لا تُنتج القاعدة سعراً سالباً مهما أخطأت اللوحة
-- ----------------------------------------------------------------------------
create table if not exists public.tariffs (
  class_id           uuid primary key references public.vehicle_classes(id) on delete cascade,
  per_km             numeric(10,2) not null check (per_km >= 0),
  base_fee           numeric(10,2) not null default 0 check (base_fee >= 0),
  min_price          numeric(10,2) not null default 0 check (min_price >= 0),
  waiting_hour_price numeric(10,2) not null default 0 check (waiting_hour_price >= 0),
  round_trip_factor  numeric(4,2)  not null default 1.8 check (round_trip_factor > 0),
  updated_at         timestamptz   not null default now()
);

drop trigger if exists tariffs_touch_updated_at on public.tariffs;
create trigger tariffs_touch_updated_at
  before update on public.tariffs
  for each row execute function public.touch_updated_at();

-- ----------------------------------------------------------------------------
-- (٣) إعدادات التسعير العامة — نمط الصف الواحد
-- (id boolean بقيمة true فقط + مفتاح أساسي = يستحيل وجود أكثر من صف)
-- peak: عمولة الذروة/الأعياد، تُضاف فوق الناتج النهائي أياً كان مصدره
-- ----------------------------------------------------------------------------
create table if not exists public.pricing_settings (
  id           boolean primary key default true check (id),
  peak_enabled boolean not null default false,
  peak_percent numeric(5,2) not null default 15 check (peak_percent >= 0),
  currency     text not null default 'EGP',
  updated_at   timestamptz not null default now()
);

drop trigger if exists pricing_settings_touch_updated_at on public.pricing_settings;
create trigger pricing_settings_touch_updated_at
  before update on public.pricing_settings
  for each row execute function public.touch_updated_at();

-- ----------------------------------------------------------------------------
-- (٤) الكاش الدائم — يُكتب حصراً عبر عميل الخدمة (service_role) من الخادم
-- geocode_cache: نتيجة البحث النصي عن مكان، المفتاح هو النص بعد التطبيع
-- distance_cache: مسافة/مدة بين نقطتين، المفتاح شبكي مُقرّب يولّده الخادم
-- source: cache | google | osrm | estimate (مطابق DistanceSource في العقد)
-- ----------------------------------------------------------------------------
create table if not exists public.geocode_cache (
  query_norm text primary key,
  places     jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.distance_cache (
  key          text primary key,
  origin_lat   numeric,
  origin_lng   numeric,
  dest_lat     numeric,
  dest_lng     numeric,
  distance_km  numeric not null,
  duration_min numeric,
  source       text not null,
  created_at   timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- (٥) تفعيل RLS + الصلاحيات
-- تذكير (من 0001): الوصول طبقتان — GRANT على الجدول + سياسة RLS، وكلاهما مطلوب.
-- جداول التسعير الثلاثة تُقرأ علناً لأن التسعير الفوري يعمل للزائر غير المسجَّل
-- (دالة quote_price ليست security definer فتمر على RLS بهوية المستدعي).
-- جدولا الكاش بلا أي سياسة: لا anon ولا authenticated — عميل الخدمة وحده يتجاوز RLS.
-- ----------------------------------------------------------------------------
alter table public.vehicle_classes  enable row level security;
alter table public.tariffs          enable row level security;
alter table public.pricing_settings enable row level security;
alter table public.geocode_cache    enable row level security;
alter table public.distance_cache   enable row level security;

-- نسحب أولاً كل ما قد تمنحه إعدادات Supabase الافتراضية (alter default privileges
-- على مخطط public تمنح الأدوار العامة كل الصلاحيات على أي جدول جديد) ثم نمنح
-- المطلوب وحده. هذا ليس تزيّداً: صلاحية TRUNCATE لا تخضع لـ RLS إطلاقاً، فلو بقيت
-- مع anon لأمكن تفريغ جدول التعريفات رغم أن كل سياسات الكتابة تمنعه.
revoke all on public.vehicle_classes  from anon, authenticated;
revoke all on public.tariffs          from anon, authenticated;
revoke all on public.pricing_settings from anon, authenticated;
revoke all on public.geocode_cache    from anon, authenticated;
revoke all on public.distance_cache   from anon, authenticated;

grant select on public.vehicle_classes  to anon, authenticated;
grant select on public.tariffs          to anon, authenticated;
grant select on public.pricing_settings to anon, authenticated;

grant select, insert, update, delete on public.vehicle_classes to authenticated;
grant select, insert, update, delete on public.tariffs         to authenticated;
-- لا delete لـ pricing_settings: الصف الوحيد يجب أن يبقى موجوداً دائماً
grant select, insert, update on public.pricing_settings to authenticated;

-- جدولا الكاش يبقيان بلا أي صلاحية للأدوار العامة (لا grant بعد الـ revoke أعلاه)

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant select, insert, update, delete on public.geocode_cache to service_role';
    execute 'grant select, insert, update, delete on public.distance_cache to service_role';
    execute 'grant select, insert, update, delete on public.vehicle_classes to service_role';
    execute 'grant select, insert, update, delete on public.tariffs to service_role';
    execute 'grant select, insert, update on public.pricing_settings to service_role';
  end if;
end;
$$;

-- سياسات vehicle_classes — الزائر يرى النشط فقط، المسجَّل يرى الكل (اللوحة تعرض المعطّل)
drop policy if exists "vehicle_classes_select_anon_active" on public.vehicle_classes;
create policy "vehicle_classes_select_anon_active"
  on public.vehicle_classes
  for select
  to anon
  using (active = true);

drop policy if exists "vehicle_classes_select_authenticated" on public.vehicle_classes;
create policy "vehicle_classes_select_authenticated"
  on public.vehicle_classes
  for select
  to authenticated
  using (true);

drop policy if exists "vehicle_classes_insert_admin" on public.vehicle_classes;
create policy "vehicle_classes_insert_admin"
  on public.vehicle_classes
  for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "vehicle_classes_update_admin" on public.vehicle_classes;
create policy "vehicle_classes_update_admin"
  on public.vehicle_classes
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "vehicle_classes_delete_admin" on public.vehicle_classes;
create policy "vehicle_classes_delete_admin"
  on public.vehicle_classes
  for delete
  to authenticated
  using (public.is_admin());

-- سياسات tariffs — القراءة عامة (التسعير الفوري يحتاجها)، الكتابة admin فقط
drop policy if exists "tariffs_select_public" on public.tariffs;
create policy "tariffs_select_public"
  on public.tariffs
  for select
  to anon, authenticated
  using (true);

drop policy if exists "tariffs_insert_admin" on public.tariffs;
create policy "tariffs_insert_admin"
  on public.tariffs
  for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "tariffs_update_admin" on public.tariffs;
create policy "tariffs_update_admin"
  on public.tariffs
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "tariffs_delete_admin" on public.tariffs;
create policy "tariffs_delete_admin"
  on public.tariffs
  for delete
  to authenticated
  using (public.is_admin());

-- سياسات pricing_settings — القراءة عامة، الكتابة admin فقط (بلا حذف)
drop policy if exists "pricing_settings_select_public" on public.pricing_settings;
create policy "pricing_settings_select_public"
  on public.pricing_settings
  for select
  to anon, authenticated
  using (true);

drop policy if exists "pricing_settings_insert_admin" on public.pricing_settings;
create policy "pricing_settings_insert_admin"
  on public.pricing_settings
  for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "pricing_settings_update_admin" on public.pricing_settings;
create policy "pricing_settings_update_admin"
  on public.pricing_settings
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- (٦) دالة التسعير — المصدر الأوحد لأي رقم مالي يراه العميل
--
-- قاعدة الأهلية (VISION — آلية تحديد السيارات): الفئات النشطة التي سعتها ≥ عدد
-- الركاب، مرتبة تصاعدياً بالسعة، ونأخذ أول اثنتين: الأصغر الكافية + التي تليها
-- تحفيزاً (upsell). ٢٠ راكباً ← الباص وحده لأنه لا يوجد ما هو أكبر.
--
-- المعادلة (بهذا الترتيب حصراً):
--   subtotal = base_fee + distance_km × per_km
--   subtotal = max(subtotal, min_price)              ← أرضية الفئة قبل الذهاب والعودة
--   subtotal = subtotal × round_trip_factor          ← إن ذهاب وعودة
--   subtotal = subtotal + waiting_hours × waiting_hour_price   ← الانتظار لا يُضاعَف
--   total    = subtotal × (1 + peak_percent/100)     ← الذروة آخر شيء، ثم تقريب لأقرب جنيه
--
-- ليست security definer عمداً: لا تكشف إلا بيانات تعريفة عامة، وتمر على RLS
-- بهوية المستدعي. كل الحساب numeric (لا float) فلا خطأ عشري إطلاقاً.
-- ----------------------------------------------------------------------------
create or replace function public.quote_price(
  p_distance_km   numeric,
  p_passengers    integer,
  p_round_trip    boolean,
  p_waiting_hours numeric
)
returns table (
  class_slug         text,
  class_title        text,
  capacity           integer,
  total              numeric,
  base_fee           numeric,
  distance_cost      numeric,
  waiting_cost       numeric,
  round_trip_applied boolean,
  peak_applied       boolean,
  min_applied        boolean
)
language sql
stable
set search_path = ''
as $$
  with args as (
    -- تطهير المدخلات: الدالة لا ترمي خطأ أبداً لأنها تُستدعى من واجهة عامة
    select
      greatest(coalesce(p_distance_km, 0), 0)   as distance_km,
      greatest(coalesce(p_passengers, 1), 1)    as passengers,
      coalesce(p_round_trip, false)             as round_trip,
      greatest(coalesce(p_waiting_hours, 0), 0) as waiting_hours
  ),
  settings as (
    -- تجميع بلا group by ← صف واحد مضمون حتى لو كان الجدول فارغاً أو محجوباً بـ RLS
    select
      coalesce(bool_or(ps.peak_enabled), false) as peak_enabled,
      coalesce(max(ps.peak_percent), 0)         as peak_percent
    from public.pricing_settings ps
  ),
  eligible as (
    -- الفئة بلا تعريفة لا تُسعَّر (join داخلي) — والترتيب مثبَّت لتفادي أي عشوائية
    select
      vc.slug, vc.title, vc.capacity,
      t.per_km, t.base_fee, t.min_price, t.waiting_hour_price, t.round_trip_factor
    from public.vehicle_classes vc
    join public.tariffs t on t.class_id = vc.id
    cross join args a
    where vc.active
      and vc.capacity >= a.passengers
    order by vc.capacity asc, vc.sort asc, vc.slug asc
    limit 2
  ),
  priced as (
    select
      e.slug, e.title, e.capacity, e.base_fee, e.min_price,
      e.round_trip_factor, a.round_trip, s.peak_enabled, s.peak_percent,
      a.distance_km   * e.per_km             as distance_cost,
      a.waiting_hours * e.waiting_hour_price as waiting_cost,
      e.base_fee + a.distance_km * e.per_km  as raw_subtotal
    from eligible e
    cross join args a
    cross join settings s
  ),
  floored as (
    -- الأرضية أولاً: رحلة ٥ كم بسيدان تصبح ٣٠٠ ثم تُضرب في معامل العودة (لا العكس)
    select
      p.*,
      greatest(p.raw_subtotal, p.min_price) as floor_subtotal,
      (p.raw_subtotal < p.min_price)        as min_hit
    from priced p
  ),
  finalized as (
    select
      f.*,
      case when f.round_trip
           then f.floor_subtotal * f.round_trip_factor
           else f.floor_subtotal
      end + f.waiting_cost as pre_peak
    from floored f
  )
  select
    q.slug                    as class_slug,
    q.title                   as class_title,
    q.capacity                as capacity,
    round(
      case when q.peak_enabled
           then q.pre_peak * (1 + q.peak_percent / 100)
           else q.pre_peak
      end
    )                         as total,
    round(q.base_fee, 2)      as base_fee,
    round(q.distance_cost, 2) as distance_cost,
    round(q.waiting_cost, 2)  as waiting_cost,
    q.round_trip              as round_trip_applied,
    q.peak_enabled            as peak_applied,
    q.min_hit                 as min_applied
  from finalized q
  order by q.capacity asc;
$$;

-- التنفيذ متاح للزائر: التسعير الفوري يعمل قبل أي تسجيل دخول
grant execute on function public.quote_price(numeric, integer, boolean, numeric)
  to anon, authenticated;

-- ----------------------------------------------------------------------------
-- (٧) البذرة — الفئات الأربع بمعرّفات ثابتة + تعريفاتها + صف الإعدادات الوحيد
-- الأرقام قيم مبدئية بالجنيه المصري يعايرها المالك من اللوحة (لا شيء منها في الكود).
-- العناوين والوصف مطابقة لـ VEHICLE_CLASSES في lib/site-config.ts.
-- on conflict do nothing بلا هدف: إعادة التنفيذ لا تمس أي تعديل لاحق من اللوحة.
-- ----------------------------------------------------------------------------
insert into public.vehicle_classes (id, slug, title, capacity, short, image_url, active, sort)
values
  ('11111111-1111-4111-8111-111111111111', 'sedan',   'سيدان',    3,
   'خيار اقتصادي أنيق للأفراد والرحلات الخفيفة.', null, true, 1),
  ('22222222-2222-4222-8222-222222222222', 'suv',     'SUV',      6,
   'مساحة وراحة أعلى للعائلات والحقائب.', null, true, 2),
  ('33333333-3333-4333-8333-333333333333', 'minibus', 'ميني باص', 14,
   'مثالي للمجموعات المتوسطة والرحلات المشتركة.', null, true, 3),
  ('44444444-4444-4444-8444-444444444444', 'bus',     'باص',      50,
   'للمجموعات الكبيرة والمؤتمرات والأفواج.', null, true, 4)
on conflict do nothing;

-- الربط بالـ slug لا بالمعرّف: يعمل حتى لو كانت الفئة موجودة مسبقاً بمعرّف آخر
insert into public.tariffs (class_id, per_km, base_fee, min_price, waiting_hour_price, round_trip_factor)
select vc.id, s.per_km, s.base_fee, s.min_price, s.waiting_hour_price, s.round_trip_factor
from (values
  ('sedan',   12.00,  100.00,  300.00, 100.00, 1.80),
  ('suv',     18.00,  150.00,  500.00, 150.00, 1.80),
  ('minibus', 22.00,  200.00,  800.00, 200.00, 1.80),
  ('bus',     35.00,  300.00, 1500.00, 300.00, 1.80)
) as s(slug, per_km, base_fee, min_price, waiting_hour_price, round_trip_factor)
join public.vehicle_classes vc on vc.slug = s.slug
on conflict do nothing;

insert into public.pricing_settings (id, peak_enabled, peak_percent, currency)
values (true, false, 15, 'EGP')
on conflict do nothing;
