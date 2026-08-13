-- ============================================================================
-- 0010_subcontractors.sql — المتعهدون وقوائم الأسعار والتغطية الجغرافية
--                            + ترقية محرك التسعير للدمج الكامل
--
-- المرحلة ٥. العقد المرجعي: lib/subcontractor-types.ts (الأسماء والحالات وقاعدة
-- التغطية وإعدادات الهامش) — لا انحراف عنه. والقرار الحاكم من VISION.md (ملحق ٣):
--
--     إن وُجد متعهد **معتمد** يغطي المسار ← أرخص تكلفة متعهد + الهامش
--     وإلا ← تعريفة الكيلومتر (سلوك المرحلة ٣ حرفياً)
--     وعمولة الذروة تُضاف فوق الناتج أياً كان مصدره — آخر خطوة دائماً.
--
-- يُنفَّذ بعد 0001 (is_admin / profiles / touch_updated_at) و0005 (quote_price /
-- pricing_settings / vehicle_classes) و0007 (bookings / jsonb_number) و0009
-- (haversine_km + أسلوب التصليب الذي يقلّده هذا الملف حرفياً).
--
-- ⚠ الفخّان المُوثَّقان من 0007/0009 ويتكرران هنا:
--   ١) الوصول إلى جدول طبقتان: GRANT + سياسة RLS، وكلاهما مطلوب. وإعدادات
--      Supabase الافتراضية (alter default privileges) تمنح anon و authenticated
--      **كل** الصلاحيات على أي جدول جديد — وTRUNCATE لا تخضع لـ RLS إطلاقاً.
--      لذلك كل جدول جديد هنا: revoke all ثم grant صريح.
--   ٢) `create or replace function` لا يعيد ضبط الصلاحيات، والدوال الجديدة تولد
--      ومعها EXECUTE ضمني لـ PUBLIC **ومنح صريح** لـ anon من الإعدادات الافتراضية.
--      لذلك كل دالة هنا: revoke ... from public, anon, authenticated ثم grant صريح.
--
-- آمن لإعادة التنفيذ بالكامل (create table if not exists / create or replace /
-- drop policy if exists / add column if not exists / drop constraint if exists).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (١) الجداول الأربعة
-- التسمية snake_case مطابقة لحقول camelCase في lib/subcontractor-types.ts حرفياً،
-- والحقل المتداخل الوحيد (socials) عمود jsonb — نفس نمط bookings.trip في 0007.
-- ----------------------------------------------------------------------------

-- (١-١) المتعهدون — المنفّذون الفعليون للرحلات
-- profile_id: حساب الدخول في profiles، ويبقى null حتى يقبل المتعهد الدعوة.
--             فريد لأن حساب دخول واحد لا يمثّل متعهدَين.
-- status: لا تشارك أسعاره في التسعير إلا وهو approved (تفرضه coverage_matches).
create table if not exists public.subcontractors (
  id           uuid primary key default gen_random_uuid(),
  profile_id   uuid unique references public.profiles(id) on delete set null,
  company_name text not null,
  contact_name text,
  phone        text not null,
  whatsapp     text,
  email        text,
  avatar_url   text,
  socials      jsonb not null
               default '{"facebook": null, "instagram": null, "website": null}'::jsonb,
  status       text not null default 'pending'
               check (status in ('pending', 'approved', 'suspended')),
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.subcontractors drop constraint if exists subcontractors_socials_object_chk;
alter table public.subcontractors
  add constraint subcontractors_socials_object_chk
  check (jsonb_typeof(socials) = 'object') not valid;

alter table public.subcontractors drop constraint if exists subcontractors_company_name_chk;
alter table public.subcontractors
  add constraint subcontractors_company_name_chk
  check (length(btrim(company_name)) between 2 and 160) not valid;

alter table public.subcontractors drop constraint if exists subcontractors_phone_chk;
alter table public.subcontractors
  add constraint subcontractors_phone_chk
  check (length(btrim(phone)) between 6 and 40) not valid;

drop trigger if exists subcontractors_touch_updated_at on public.subcontractors;
create trigger subcontractors_touch_updated_at
  before update on public.subcontractors
  for each row execute function public.touch_updated_at();

-- مسار قراءة اللوحة الأساسي: طابور الحالة مرتباً بالأحدث
create index if not exists subcontractors_status_created_at_idx
  on public.subcontractors (status, created_at desc);

-- (١-٢) أسطول المتعهد — الفئة هي ما يربط المركبة بمحرك التسعير
-- class_slug مفتاح أجنبي على vehicle_classes(slug) بـ on update cascade: إعادة
-- تسمية فئة من اللوحة تبقي الأسطول موصولاً بدل أن تيتّمه بصمت.
create table if not exists public.subcontractor_vehicles (
  id               uuid primary key default gen_random_uuid(),
  subcontractor_id uuid not null references public.subcontractors(id) on delete cascade,
  class_slug       text not null references public.vehicle_classes(slug)
                   on update cascade on delete cascade,
  label            text not null,
  model_year       integer check (model_year is null or model_year between 1950 and 2100),
  plate            text,
  seats            integer check (seats is null or seats > 0),
  active           boolean not null default true,
  created_at       timestamptz not null default now()
);

create index if not exists subcontractor_vehicles_sub_class_idx
  on public.subcontractor_vehicles (subcontractor_id, class_slug);

-- (١-٣) قوائم الأسعار — مسار يرسو على نقطتين ولكل نقطة نطاق «في كافة الاتجاهات»
--
-- الأسعار داخل القائمة **تكلفة المتعهد** لا سعر العميل؛ سعر العميل = هذه + الهامش.
-- bidirectional: تغطي الاتجاه المعاكس أيضاً (الإسكندرية ← القاهرة).
-- النطاق ١..٥٠٠ كم: أقل من كيلومتر لا يغطي شيئاً عملياً، وأكثر من ٥٠٠ يبتلع مصر
-- كلها فيصير «مسار» بلا معنى.
create table if not exists public.price_lists (
  id               uuid primary key default gen_random_uuid(),
  subcontractor_id uuid not null references public.subcontractors(id) on delete cascade,
  title            text not null,
  origin_label     text not null,
  origin_lat       numeric(9,6) not null check (origin_lat between -90 and 90),
  origin_lng       numeric(9,6) not null check (origin_lng between -180 and 180),
  origin_radius_km numeric(6,2) not null default 25
                   check (origin_radius_km >= 1 and origin_radius_km <= 500),
  dest_label       text not null,
  dest_lat         numeric(9,6) not null check (dest_lat between -90 and 90),
  dest_lng         numeric(9,6) not null check (dest_lng between -180 and 180),
  dest_radius_km   numeric(6,2) not null default 25
                   check (dest_radius_km >= 1 and dest_radius_km <= 500),
  bidirectional    boolean not null default true,
  status           text not null default 'draft'
                   check (status in ('draft', 'pending', 'approved', 'rejected')),
  review_note      text,
  reviewed_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table public.price_lists drop constraint if exists price_lists_title_chk;
alter table public.price_lists
  add constraint price_lists_title_chk
  check (length(btrim(title)) between 2 and 160) not valid;

drop trigger if exists price_lists_touch_updated_at on public.price_lists;
create trigger price_lists_touch_updated_at
  before update on public.price_lists
  for each row execute function public.touch_updated_at();

-- عنوان القائمة فريد داخل المتعهد الواحد بلا حساسية لحالة الأحرف —
-- «القاهرة ← الإسكندرية» مرتين لدى المتعهد نفسه خطأ إدخال لا حالة صحيحة.
create unique index if not exists price_lists_sub_title_key
  on public.price_lists (subcontractor_id, lower(btrim(title)));

-- طابور المراجعة في اللوحة: الأقدم أولاً
create index if not exists price_lists_status_created_at_idx
  on public.price_lists (status, created_at);

create index if not exists price_lists_sub_status_idx
  on public.price_lists (subcontractor_id, status);

-- (١-٤) أسعار الفئات داخل القائمة — صف لكل (قائمة × فئة)
-- المفتاح الأساسي المركّب هو نفسه قيد التفرد المطلوب (price_list_id, class_slug).
create table if not exists public.price_list_items (
  price_list_id uuid not null references public.price_lists(id) on delete cascade,
  class_slug    text not null references public.vehicle_classes(slug)
                on update cascade on delete cascade,
  cost          numeric(12,2) not null check (cost >= 0),
  primary key (price_list_id, class_slug)
);

-- مسار مطابقة التغطية يبدأ من الفئة: فهرس مستقل على class_slug
create index if not exists price_list_items_class_slug_idx
  on public.price_list_items (class_slug);

-- ----------------------------------------------------------------------------
-- (٢) هوية المتعهد — أساس كل سياسات العزل
--
-- security definer لأن السياسات تُقيَّم بهوية المستدعي، ولو مرّت الدالة على RLS
-- الخاص بـ subcontractors لاحتاجت قراءة الجدول لتقرر من يقرأ الجدول (حلقة).
-- stable + search_path مثبَّت — نفس أسلوب public.is_admin() في 0001.
-- ----------------------------------------------------------------------------
create or replace function public.current_subcontractor_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s.id
  from public.subcontractors s
  join public.profiles p on p.id = s.profile_id
  where p.id = (select auth.uid())
  limit 1;
$$;

-- حالة المتعهد الحالي كما هي **مخزَّنة** — تستعملها سياسة التعديل الذاتي لتفرض
-- بقاء status كما هو (نفس حيلة profiles_update_own مع role في 0001).
create or replace function public.current_subcontractor_status()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select s.status
  from public.subcontractors s
  where s.profile_id = (select auth.uid())
  limit 1;
$$;

-- ----------------------------------------------------------------------------
-- (٣) المُشغّلات الحارسة — القاعدة في الجدول لا في الدالة وحدها
--
-- سياسات RLS تحرس مسار PostgREST، والمُشغّلات تحرس **كل** مسار (SQL Editor،
-- عميل الخدمة، دالة مستقبلية سهت عن الشرط). القاعدتان الأخطر:
--   • المتعهد لا يغيّر حالة حسابه ولا يعيد ربط حساب الدخول.
--   • تعديل المتعهد لقائمة **معتمدة** يعيدها pending تلقائياً — إبقاؤها معتمدة
--     يعني تغيّر التكلفة تحت عروض حيّة بلا مراجعة، وهو بالضبط ما يجب منعه.
-- ----------------------------------------------------------------------------
create or replace function public.subcontractors_guard_self()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if public.is_admin() then
    return new;
  end if;

  if old.id is not distinct from public.current_subcontractor_id() then
    if new.status is distinct from old.status then
      raise exception 'تغيير حالة حساب المتعهد متاح للإدارة وحدها'
        using hint = 'forbidden';
    end if;
    if new.profile_id is distinct from old.profile_id then
      raise exception 'ربط حساب الدخول يديره المشرف وحده'
        using hint = 'forbidden';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists subcontractors_guard_self on public.subcontractors;
create trigger subcontractors_guard_self
  before update on public.subcontractors
  for each row execute function public.subcontractors_guard_self();

create or replace function public.price_lists_guard_review()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  -- المشرف وعميل الخدمة والهجرات: لا تدخّل
  if public.is_admin()
     or new.subcontractor_id is distinct from public.current_subcontractor_id() then
    return new;
  end if;

  -- المتعهد لا يعتمد ولا يرفض قائمته بنفسه — أبداً وبأي مسار
  if new.status in ('approved', 'rejected') and new.status is distinct from old.status then
    raise exception 'اعتماد قائمة الأسعار أو رفضها متاح للمشرف وحده'
      using hint = 'forbidden';
  end if;

  -- تعديل محتوى قائمة معتمدة ⇒ تعود pending وتُمسح ملاحظة المراجعة
  if old.status = 'approved'
     and (new.title, new.origin_label, new.origin_lat, new.origin_lng, new.origin_radius_km,
          new.dest_label, new.dest_lat, new.dest_lng, new.dest_radius_km, new.bidirectional)
         is distinct from
         (old.title, old.origin_label, old.origin_lat, old.origin_lng, old.origin_radius_km,
          old.dest_label, old.dest_lat, old.dest_lng, old.dest_radius_km, old.bidirectional)
  then
    new.status      := 'pending';
    new.review_note := null;
    new.reviewed_at := null;
  end if;

  return new;
end;
$$;

drop trigger if exists price_lists_guard_review on public.price_lists;
create trigger price_lists_guard_review
  before update on public.price_lists
  for each row execute function public.price_lists_guard_review();

-- تغيير **سعر** داخل قائمة معتمدة أخطر من تغيير عنوانها: يعيدها pending فوراً.
-- after trigger لأنه يعدّل جدولاً آخر، و definer لأن الشرط يقرأ price_lists.
create or replace function public.price_list_items_demote_parent()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_list uuid;
  v_sub  uuid;
begin
  v_sub := public.current_subcontractor_id();
  if v_sub is null or public.is_admin() then
    return null;
  end if;

  if tg_op = 'DELETE' then
    v_list := old.price_list_id;
  else
    v_list := new.price_list_id;
  end if;

  update public.price_lists pl
     set status = 'pending', review_note = null, reviewed_at = null
   where pl.id = v_list
     and pl.subcontractor_id = v_sub
     and pl.status = 'approved';

  return null;
end;
$$;

drop trigger if exists price_list_items_demote_parent on public.price_list_items;
create trigger price_list_items_demote_parent
  after insert or update or delete on public.price_list_items
  for each row execute function public.price_list_items_demote_parent();

-- ----------------------------------------------------------------------------
-- (٤) تفعيل RLS + الصلاحيات + السياسات
--
-- خلاصة الوصول في هذه المرحلة:
--   anon          → **صفر** على الجداول الأربعة. التسعير العام لا يلمسها إطلاقاً
--                    إلا من داخل دوال security definer (quote_price).
--   المتعهد        → صفوفه وحدها في الجداول الأربعة، ولا يغيّر حالته ولا يعتمد
--                    قائمته.
--   المشرف         → كل شيء.
--   service_role  → كل شيء (مسار الخادم وتقارير المرحلة ٧).
-- ----------------------------------------------------------------------------
alter table public.subcontractors         enable row level security;
alter table public.subcontractor_vehicles enable row level security;
alter table public.price_lists            enable row level security;
alter table public.price_list_items       enable row level security;

-- السحب أولاً (الإعدادات الافتراضية في Supabase منحت anon كل شيء بما فيه TRUNCATE)
revoke all on public.subcontractors         from anon, authenticated;
revoke all on public.subcontractor_vehicles from anon, authenticated;
revoke all on public.price_lists            from anon, authenticated;
revoke all on public.price_list_items       from anon, authenticated;

-- لا منح لـ anon على أي منها — ولا حتى select
grant select, insert, update, delete on public.subcontractors         to authenticated;
grant select, insert, update, delete on public.subcontractor_vehicles to authenticated;
grant select, insert, update, delete on public.price_lists            to authenticated;
grant select, insert, update, delete on public.price_list_items       to authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant select, insert, update, delete on public.subcontractors to service_role';
    execute 'grant select, insert, update, delete on public.subcontractor_vehicles to service_role';
    execute 'grant select, insert, update, delete on public.price_lists to service_role';
    execute 'grant select, insert, update, delete on public.price_list_items to service_role';
  end if;
end;
$$;

-- (٤-١) سياسات subcontractors
drop policy if exists "subcontractors_select_own_or_admin" on public.subcontractors;
create policy "subcontractors_select_own_or_admin"
  on public.subcontractors
  for select
  to authenticated
  using (id = public.current_subcontractor_id() or public.is_admin());

-- الإنشاء للإدارة وحدها: المتعهد لا يسجّل نفسه، الدعوة تأتي من اللوحة
drop policy if exists "subcontractors_insert_admin" on public.subcontractors;
create policy "subcontractors_insert_admin"
  on public.subcontractors
  for insert
  to authenticated
  with check (public.is_admin());

-- التعديل الذاتي: صفه فقط، وبشرط بقاء status و profile_id كما هما
drop policy if exists "subcontractors_update_own" on public.subcontractors;
create policy "subcontractors_update_own"
  on public.subcontractors
  for update
  to authenticated
  using (id = public.current_subcontractor_id())
  with check (
    id = public.current_subcontractor_id()
    and status is not distinct from public.current_subcontractor_status()
    and profile_id is not distinct from (select auth.uid())
  );

drop policy if exists "subcontractors_update_admin" on public.subcontractors;
create policy "subcontractors_update_admin"
  on public.subcontractors
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "subcontractors_delete_admin" on public.subcontractors;
create policy "subcontractors_delete_admin"
  on public.subcontractors
  for delete
  to authenticated
  using (public.is_admin());

-- (٤-٢) سياسات subcontractor_vehicles — أسطوله وحده
drop policy if exists "subcontractor_vehicles_select_own_or_admin" on public.subcontractor_vehicles;
create policy "subcontractor_vehicles_select_own_or_admin"
  on public.subcontractor_vehicles
  for select
  to authenticated
  using (subcontractor_id = public.current_subcontractor_id() or public.is_admin());

drop policy if exists "subcontractor_vehicles_insert_own_or_admin" on public.subcontractor_vehicles;
create policy "subcontractor_vehicles_insert_own_or_admin"
  on public.subcontractor_vehicles
  for insert
  to authenticated
  with check (subcontractor_id = public.current_subcontractor_id() or public.is_admin());

drop policy if exists "subcontractor_vehicles_update_own_or_admin" on public.subcontractor_vehicles;
create policy "subcontractor_vehicles_update_own_or_admin"
  on public.subcontractor_vehicles
  for update
  to authenticated
  using (subcontractor_id = public.current_subcontractor_id() or public.is_admin())
  with check (subcontractor_id = public.current_subcontractor_id() or public.is_admin());

drop policy if exists "subcontractor_vehicles_delete_own_or_admin" on public.subcontractor_vehicles;
create policy "subcontractor_vehicles_delete_own_or_admin"
  on public.subcontractor_vehicles
  for delete
  to authenticated
  using (subcontractor_id = public.current_subcontractor_id() or public.is_admin());

-- (٤-٣) سياسات price_lists — قوائمه وحده، ولا يعتمدها بنفسه
drop policy if exists "price_lists_select_own_or_admin" on public.price_lists;
create policy "price_lists_select_own_or_admin"
  on public.price_lists
  for select
  to authenticated
  using (subcontractor_id = public.current_subcontractor_id() or public.is_admin());

-- الإنشاء: قائمته، وحالتها الابتدائية draft أو pending لا غير
drop policy if exists "price_lists_insert_own_or_admin" on public.price_lists;
create policy "price_lists_insert_own_or_admin"
  on public.price_lists
  for insert
  to authenticated
  with check (
    public.is_admin()
    or (subcontractor_id = public.current_subcontractor_id()
        and status in ('draft', 'pending'))
  );

-- التعديل: قائمته، ولا يجوز أن تخرج من يده معتمدة أو مرفوضة
drop policy if exists "price_lists_update_own_or_admin" on public.price_lists;
create policy "price_lists_update_own_or_admin"
  on public.price_lists
  for update
  to authenticated
  using (subcontractor_id = public.current_subcontractor_id() or public.is_admin())
  with check (
    public.is_admin()
    or (subcontractor_id = public.current_subcontractor_id()
        and status in ('draft', 'pending'))
  );

drop policy if exists "price_lists_delete_own_or_admin" on public.price_lists;
create policy "price_lists_delete_own_or_admin"
  on public.price_lists
  for delete
  to authenticated
  using (subcontractor_id = public.current_subcontractor_id() or public.is_admin());

-- (٤-٤) سياسات price_list_items — الملكية مشتقة من القائمة الأم
drop policy if exists "price_list_items_select_own_or_admin" on public.price_list_items;
create policy "price_list_items_select_own_or_admin"
  on public.price_list_items
  for select
  to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.price_lists pl
      where pl.id = price_list_id
        and pl.subcontractor_id = public.current_subcontractor_id()
    )
  );

drop policy if exists "price_list_items_insert_own_or_admin" on public.price_list_items;
create policy "price_list_items_insert_own_or_admin"
  on public.price_list_items
  for insert
  to authenticated
  with check (
    public.is_admin()
    or exists (
      select 1 from public.price_lists pl
      where pl.id = price_list_id
        and pl.subcontractor_id = public.current_subcontractor_id()
    )
  );

drop policy if exists "price_list_items_update_own_or_admin" on public.price_list_items;
create policy "price_list_items_update_own_or_admin"
  on public.price_list_items
  for update
  to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.price_lists pl
      where pl.id = price_list_id
        and pl.subcontractor_id = public.current_subcontractor_id()
    )
  )
  with check (
    public.is_admin()
    or exists (
      select 1 from public.price_lists pl
      where pl.id = price_list_id
        and pl.subcontractor_id = public.current_subcontractor_id()
    )
  );

drop policy if exists "price_list_items_delete_own_or_admin" on public.price_list_items;
create policy "price_list_items_delete_own_or_admin"
  on public.price_list_items
  for delete
  to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.price_lists pl
      where pl.id = price_list_id
        and pl.subcontractor_id = public.current_subcontractor_id()
    )
  );

-- ----------------------------------------------------------------------------
-- (٥) مطابقة التغطية — القاعدة المحسومة في VISION.md ومثال «المعمورة»
--
-- القائمة تطابق الرحلة حين:
--   haversine(انطلاق الرحلة، بداية القائمة) ≤ نطاق البداية
--   **و** haversine(وصول الرحلة، نهاية القائمة) ≤ نطاق النهاية
-- وإن كانت القائمة ثنائية الاتجاه نفحص الزوج المعكوس أيضاً ونُعلِم reversed.
--
-- مثال الرؤية: قائمة القاهرة ← الإسكندرية بنطاقَي ٤٠ كم تغطي رحلة
-- «مصر الجديدة ← المعمورة» لأن كل طرف يقع داخل نطاق طرفه، ولا تغطي
-- «القاهرة ← أسوان» لأن أسوان خارج نطاق الإسكندرية بمئات الكيلومترات.
--
-- تشترك في المطابقة قوائم approved لمتعهدين approved حصراً — قائمة معلّقة أو
-- متعهد موقوف لا يظهر سعره في أي عرض إطلاقاً.
--
-- security definer لأن الجداول الثلاثة محجوبة عن كل من ليس صاحبها أو مشرفاً؛
-- الدالة لا تُرجع تكلفة (التكلفة لكل فئة تعيش في price_list_items) فلا تسرّب
-- رقماً مالياً لأحد. تُمنح للمسجَّل وعميل الخدمة، ولا تُمنح لـ anon إطلاقاً:
-- الزائر يصل إلى الأسعار عبر quote_price وحدها وبعد إضافة الهامش.
-- تعيد استخدام public.haversine_km من 0009 — لا تطبيق ثانٍ للمسافة في المشروع.
-- ----------------------------------------------------------------------------
create or replace function public.coverage_matches(
  p_origin_lat numeric,
  p_origin_lng numeric,
  p_dest_lat   numeric,
  p_dest_lng   numeric
)
returns table (
  price_list_id    uuid,
  subcontractor_id uuid,
  company_name     text,
  title            text,
  reversed         boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with args as (
    select
      p_origin_lat as olat, p_origin_lng as olng,
      p_dest_lat   as dlat, p_dest_lng   as dlng
  ),
  candidates as (
    select
      pl.id               as price_list_id,
      pl.subcontractor_id as subcontractor_id,
      s.company_name      as company_name,
      pl.title            as title,
      -- الاتجاه المباشر: انطلاق داخل نطاق البداية ووصول داخل نطاق النهاية
      coalesce(
        public.haversine_km(a.olat, a.olng, pl.origin_lat, pl.origin_lng) <= pl.origin_radius_km
        and public.haversine_km(a.dlat, a.dlng, pl.dest_lat, pl.dest_lng) <= pl.dest_radius_km,
        false
      ) as direct,
      -- الاتجاه المعكوس: يُفحص فقط حين تكون القائمة ثنائية الاتجاه
      coalesce(
        pl.bidirectional
        and public.haversine_km(a.olat, a.olng, pl.dest_lat, pl.dest_lng) <= pl.dest_radius_km
        and public.haversine_km(a.dlat, a.dlng, pl.origin_lat, pl.origin_lng) <= pl.origin_radius_km,
        false
      ) as rev
    from public.price_lists pl
    join public.subcontractors s on s.id = pl.subcontractor_id
    cross join args a
    where pl.status = 'approved'
      and s.status  = 'approved'
      and a.olat is not null and a.olng is not null
      and a.dlat is not null and a.dlng is not null
  )
  select
    c.price_list_id,
    c.subcontractor_id,
    c.company_name,
    c.title,
    (not c.direct) as reversed   -- المطابقة المباشرة تفوز على المعكوسة عند تحقّقهما
  from candidates c
  where c.direct or c.rev
  order by c.company_name asc, c.title asc;
$$;

-- ----------------------------------------------------------------------------
-- (٦) إعدادات الهامش — أعمدة جديدة في pricing_settings مبذورة من DEFAULT_MARGIN
--
-- تُضاف بلا قيود أولاً ثم تُملأ ثم تُثبَّت not null: قاعدة فيها صف حيّ لا يجوز
-- أن تفشل الهجرة عليها.
-- ----------------------------------------------------------------------------
alter table public.pricing_settings add column if not exists margin_type       text;
alter table public.pricing_settings add column if not exists margin_value      numeric(10,2);
alter table public.pricing_settings add column if not exists margin_min_amount numeric(10,2);

-- القيم مطابقة حرفياً لـ DEFAULT_MARGIN في lib/subcontractor-types.ts
update public.pricing_settings
   set margin_type       = coalesce(margin_type, 'percent'),
       margin_value      = coalesce(margin_value, 20),
       margin_min_amount = coalesce(margin_min_amount, 100)
 where margin_type is null
    or margin_value is null
    or margin_min_amount is null;

alter table public.pricing_settings alter column margin_type       set default 'percent';
alter table public.pricing_settings alter column margin_value      set default 20;
alter table public.pricing_settings alter column margin_min_amount set default 100;

alter table public.pricing_settings alter column margin_type       set not null;
alter table public.pricing_settings alter column margin_value      set not null;
alter table public.pricing_settings alter column margin_min_amount set not null;

alter table public.pricing_settings drop constraint if exists pricing_settings_margin_type_chk;
alter table public.pricing_settings
  add constraint pricing_settings_margin_type_chk
  check (margin_type in ('percent', 'fixed'));

alter table public.pricing_settings drop constraint if exists pricing_settings_margin_value_chk;
alter table public.pricing_settings
  add constraint pricing_settings_margin_value_chk
  check (margin_value >= 0);

alter table public.pricing_settings drop constraint if exists pricing_settings_margin_min_chk;
alter table public.pricing_settings
  add constraint pricing_settings_margin_min_chk
  check (margin_min_amount >= 0);

-- الصف الوحيد قد يكون غائباً على قاعدة لم تُبذر — نضمن وجوده بقيم العقد
insert into public.pricing_settings (id, peak_enabled, peak_percent, currency,
                                     margin_type, margin_value, margin_min_amount)
values (true, false, 15, 'EGP', 'percent', 20, 100)
on conflict (id) do nothing;

-- 🔒 نسبة الهامش سرّ تجاري: جدول الإعدادات كان يُقرأ علناً (سياسة 0005)، وترك
-- الأعمدة الثلاثة داخله يكشف للعميل كم يربح الموقع من رحلته. الحل صلاحيات على
-- مستوى العمود لـ anon: نسحب select الجدولية ونمنح الأعمدة العامة وحدها.
-- (authenticated يبقى كما هو: شاشات اللوحة تقرأ `select *` وتحتاج الأعمدة كلها.)
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke select on public.pricing_settings from anon;
    execute 'grant select (id, peak_enabled, peak_percent, currency, updated_at) '
            'on public.pricing_settings to anon';
    raise notice 'pricing_settings: أعمدة الهامش محجوبة عن anon';
  end if;
exception
  when others then
    -- الفشل لا يجوز أن يسقط الهجرة، لكن ترك الحجب معطّلاً أهون من قطع القراءة
    begin
      execute 'grant select on public.pricing_settings to anon';
    exception when others then null;
    end;
    raise notice 'تعذّر حجب أعمدة الهامش عن anon (%) — راجعها يدوياً', sqlerrm;
end;
$$;

-- ----------------------------------------------------------------------------
-- (٧) محرك التسعير المُرقَّى
--
-- ⚠ لماذا تحميل زائد (overload) لا استبدال: Postgres لا يسمح بتغيير نوع إرجاع
--   دالة قائمة، ولا يسمح بحل استدعاء رباعي حين تتعايش دالة رباعية وأخرى ثمانية
--   **بوسائط افتراضية** (يرمي «is not unique»). ولأن اختبارات المرحلتين ٣ و٤
--   تفحص وجود التوقيع الرباعي بـ to_regprocedure، فالحل: توقيع ثماني بلا قيم
--   افتراضية + إبقاء التوقيع الرباعي غلافاً رقيقاً عليه. النتيجة عملياً مطابقة
--   للعقد: «الاستدعاء بلا إحداثيات = سلوك المرحلة ٣ حرفياً».
--
-- المعادلة الكاملة لكل فئة مؤهلة (الترتيب هو جوهر الصحة):
--   إن وُجدت تغطية معتمدة:  raw = أرخص تكلفة + الهامش
--                            الهامش = نسبة×التكلفة أو مبلغ ثابت، بأرضية margin_min_amount
--   وإلا:                     raw = base_fee + المسافة × per_km      ← مسار المرحلة ٣
--   raw      = max(raw, min_price)            ← أرضية الفئة صمام أمان للمسارين
--   subtotal = raw × round_trip_factor        ← إن ذهاب وعودة
--   subtotal = subtotal + الانتظار × سعر الساعة
--   total    = subtotal × (1 + peak/100)      ← الذروة آخر شيء ثم تقريب لأقرب جنيه
--
-- التفصيل في المسار المتعهَّد: base_fee = التكلفة + الهامش و distance_cost = 0،
-- فتبقى المتطابقة raw = base_fee + distance_cost صحيحة في المسارين معاً، ولا
-- يظهر للعميل رقم تكلفة إطلاقاً (base_fee هنا سعر بيع لا تكلفة).
-- ----------------------------------------------------------------------------

-- (٧-١) هل يُسمح للمستدعي برؤية أرقام التكلفة والهامش؟
--
-- 🔒 حدّ الـ whitelabel داخل القاعدة نفسها: subcontractor_id و subcontractor_cost
-- و margin_amount أرقام داخلية. مفتاح anon منشور في المتصفح، ومن يملكه يستطيع
-- استدعاء quote_price مباشرة متجاوزاً تنقيح /api/quote — فالتنقيح يجب أن يقع هنا.
--
-- الحيلة: `security definer` يبدّل current_user لكنه **لا يبدّل متغيّر role**،
-- وPostgREST يضبطه بـ `set local role` لكل طلب. فالقيمة anon/authenticated تعني
-- «طلب من متصفح»، وأي شيء آخر (service_role أو مالك القاعدة في الهجرات
-- والاختبارات) سياق خادم موثوق. والمشرف يرى الأرقام دائماً (شاشة التسعير).
create or replace function public.pricing_internals_visible()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(nullif(current_setting('role', true), ''), 'none')
           not in ('anon', 'authenticated')
      -- علم محلي للمعاملة تضبطه create_booking قبل التسعير: لقطة الحجز تحتاج
      -- الأرقام مهما كان دور المستدعي (لا سبيل لضبطه من PostgREST)
      or coalesce(current_setting('tours.pricing_internals', true), '') = 'on'
      or public.is_admin();
$$;

-- (٧-٢) قراءة رقم من نص بلا انفجار — تستعملها upsert_price_list في تحليل الأصناف
create or replace function public.numeric_or_null(p_value text)
returns numeric
language plpgsql
immutable
set search_path = ''
as $$
begin
  return nullif(btrim(coalesce(p_value, '')), '')::numeric;
exception
  when others then
    return null;
end;
$$;

-- (٧-٣) التوقيع الثماني — المحرك الفعلي
create or replace function public.quote_price(
  p_distance_km   numeric,
  p_passengers    integer,
  p_round_trip    boolean,
  p_waiting_hours numeric,
  p_origin_lat    numeric,
  p_origin_lng    numeric,
  p_dest_lat      numeric,
  p_dest_lng      numeric
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
  min_applied        boolean,
  price_source       text,
  subcontractor_id   uuid,
  subcontractor_cost numeric,
  margin_amount      numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  with args as (
    -- تطهير المدخلات: الدالة لا ترمي خطأ أبداً لأنها تُستدعى من واجهة عامة
    select
      greatest(coalesce(p_distance_km, 0), 0)   as distance_km,
      greatest(coalesce(p_passengers, 1), 1)    as passengers,
      coalesce(p_round_trip, false)             as round_trip,
      greatest(coalesce(p_waiting_hours, 0), 0) as waiting_hours,
      p_origin_lat as origin_lat, p_origin_lng as origin_lng,
      p_dest_lat   as dest_lat,   p_dest_lng   as dest_lng
  ),
  settings as (
    -- تجميع بلا group by ← صف واحد مضمون حتى لو كان الجدول فارغاً
    select
      coalesce(bool_or(ps.peak_enabled), false)  as peak_enabled,
      coalesce(max(ps.peak_percent), 0)          as peak_percent,
      coalesce(max(ps.margin_type), 'percent')   as margin_type,
      coalesce(max(ps.margin_value), 0)          as margin_value,
      coalesce(max(ps.margin_min_amount), 0)     as margin_min_amount
    from public.pricing_settings ps
  ),
  eligible as (
    -- قاعدة الأهلية كما هي منذ المرحلة ٣: الأصغر الكافية + التي تليها تحفيزاً
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
  coverage as (
    -- أرخص تكلفة معتمدة لكل فئة على هذا المسار — تعدد المتعهدين يحسمه الأرخص
    -- (قرار الرؤية)، وترتيب الحسم مثبَّت بـ subcontractor_id تفادياً لأي عشوائية.
    select distinct on (pli.class_slug)
      pli.class_slug,
      pli.cost,
      cm.subcontractor_id
    from args a
    cross join lateral public.coverage_matches(a.origin_lat, a.origin_lng,
                                               a.dest_lat, a.dest_lng) cm
    join public.price_list_items pli on pli.price_list_id = cm.price_list_id
    order by pli.class_slug, pli.cost asc, cm.subcontractor_id asc
  ),
  joined as (
    select
      e.slug, e.title, e.capacity, e.per_km, e.base_fee, e.min_price,
      e.waiting_hour_price, e.round_trip_factor,
      a.distance_km, a.round_trip, a.waiting_hours,
      s.peak_enabled, s.peak_percent,
      s.margin_type, s.margin_value, s.margin_min_amount,
      cov.subcontractor_id as sub_id,
      cov.cost             as sub_cost
    from eligible e
    cross join args a
    cross join settings s
    left join coverage cov on cov.class_slug = e.slug
  ),
  margined as (
    -- الهامش: نسبة من التكلفة أو مبلغ ثابت، وبأرضية margin_min_amount التي
    -- تحمي المسارات الرخيصة من هامش ضئيل لا يغطي تكلفة التشغيل.
    select
      j.*,
      case
        when j.sub_cost is null then null
        else greatest(
               case when j.margin_type = 'percent'
                    then j.sub_cost * j.margin_value / 100
                    else j.margin_value
               end,
               coalesce(j.margin_min_amount, 0)
             )
      end as margin_amt
    from joined j
  ),
  priced as (
    select
      m.*,
      case when m.sub_cost is null
           then m.base_fee
           else m.sub_cost + m.margin_amt
      end as row_base_fee,
      case when m.sub_cost is null
           then m.distance_km * m.per_km
           else 0::numeric
      end as row_distance_cost,
      m.waiting_hours * m.waiting_hour_price as row_waiting_cost,
      case when m.sub_cost is null
           then m.base_fee + m.distance_km * m.per_km
           else m.sub_cost + m.margin_amt
      end as raw_subtotal
    from margined m
  ),
  floored as (
    -- الأرضية أولاً: تُطبَّق قبل معامل العودة في المسارين معاً
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
      end + f.row_waiting_cost as pre_peak
    from floored f
  ),
  visibility as (
    select public.pricing_internals_visible() as ok
  )
  select
    q.slug                      as class_slug,
    q.title                     as class_title,
    q.capacity                  as capacity,
    round(
      case when q.peak_enabled
           then q.pre_peak * (1 + q.peak_percent / 100)
           else q.pre_peak
      end
    )                           as total,
    round(q.row_base_fee, 2)     as base_fee,
    round(q.row_distance_cost, 2) as distance_cost,
    round(q.row_waiting_cost, 2)  as waiting_cost,
    q.round_trip                as round_trip_applied,
    q.peak_enabled              as peak_applied,
    q.min_hit                   as min_applied,
    case when q.sub_cost is null then 'tariff' else 'subcontractor' end as price_source,
    case when q.sub_cost is null or not v.ok then null else q.sub_id            end as subcontractor_id,
    case when q.sub_cost is null or not v.ok then null else round(q.sub_cost, 2) end as subcontractor_cost,
    case when q.sub_cost is null or not v.ok then null else round(q.margin_amt, 2) end as margin_amount
  from finalized q
  cross join visibility v
  order by q.capacity asc;
$$;

-- (٧-٤) التوقيع الرباعي — غلاف بلا إحداثيات يحفظ توافق المرحلتين ٣ و٤ حرفياً.
-- أعمدته العشرة كما كانت في 0005 بالضبط: لا مصدر سعر ولا تكلفة ولا هامش.
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
  select
    q.class_slug, q.class_title, q.capacity, q.total, q.base_fee,
    q.distance_cost, q.waiting_cost, q.round_trip_applied,
    q.peak_applied, q.min_applied
  from public.quote_price(
    p_distance_km, p_passengers, p_round_trip, p_waiting_hours,
    null::numeric, null::numeric, null::numeric, null::numeric
  ) q;
$$;

-- ----------------------------------------------------------------------------
-- (٨) دوال قوائم الأسعار — المنفذ المنضبط للبورتال واللوحة
--
-- كلها security definer بحراسة صريحة في أول السطر: العزل مفروض بـ RLS أصلاً،
-- لكن الدوال تكتب في جدولين معاً (القائمة وأصنافها) وتفرض قاعدة الاعتماد،
-- فمرورها بهوية المالك يجعل القاعدة واحدة لا تتكرر في كل مسار كتابة.
-- ----------------------------------------------------------------------------

-- (٨-١) إنشاء/تعديل قائمة بأصنافها في نداء واحد
--
-- p_id: null ⇒ إنشاء جديد (بحالة draft)، وإلا تعديل قائمة قائمة.
-- p_items: مصفوفة [{"classSlug":"suv","cost":1500}, ...] — دلالتها **استبدال
--          كامل**: ما ليس فيها يُحذف. p_items = null يترك الأصناف كما هي.
-- p_subcontractor_id: للمشرف وحده حين يحرّر نيابة عن متعهد (null = صاحب الجلسة).
--
-- قاعدة الاعتماد: تعديل المتعهد لا يُنتج approved أبداً. القائمة المعتمدة تعود
-- pending، والمرفوضة تعود pending (إعادة تقديم)، والمسودة تبقى مسودة حتى
-- يضغط «إرسال للمراجعة» صراحةً.
create or replace function public.upsert_price_list(
  p_id               uuid,
  p_title            text,
  p_origin_label     text,
  p_origin_lat       numeric,
  p_origin_lng       numeric,
  p_origin_radius_km numeric,
  p_dest_label       text,
  p_dest_lat         numeric,
  p_dest_lng         numeric,
  p_dest_radius_km   numeric,
  p_bidirectional    boolean default true,
  p_items            jsonb   default null,
  p_subcontractor_id uuid    default null
)
returns table (
  id     uuid,
  status text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_sub     uuid;
  v_id      uuid;
  v_status  text;
  v_title   text;
  v_olabel  text;
  v_dlabel  text;
  v_orad    numeric;
  v_drad    numeric;
  v_bad     text;
  v_count   integer;
begin
  -- (أ) الهوية: المتعهد صاحب الجلسة، أو متعهد يحدده المشرف صراحةً
  if p_subcontractor_id is not null then
    if not public.is_admin() then
      raise exception 'التحرير نيابة عن متعهد آخر متاح للمشرف وحده' using hint = 'forbidden';
    end if;
    v_sub := p_subcontractor_id;
  else
    v_sub := public.current_subcontractor_id();
  end if;

  if v_sub is null then
    raise exception 'لا يوجد حساب متعهد مرتبط بهذه الجلسة' using hint = 'forbidden';
  end if;

  if not exists (select 1 from public.subcontractors s where s.id = v_sub) then
    raise exception 'المتعهد غير موجود' using hint = 'not-found';
  end if;

  -- (ب) تطهير المدخلات النصية والرقمية
  v_title  := nullif(btrim(coalesce(p_title, '')), '');
  v_olabel := nullif(btrim(coalesce(p_origin_label, '')), '');
  v_dlabel := nullif(btrim(coalesce(p_dest_label, '')), '');

  if v_title is null or length(v_title) < 2 or length(v_title) > 160 then
    raise exception 'عنوان القائمة يجب أن يكون بين حرفين و١٦٠ حرفاً' using hint = 'invalid-input';
  end if;
  if v_olabel is null or v_dlabel is null then
    raise exception 'اسما نقطتي البداية والنهاية مطلوبان' using hint = 'invalid-input';
  end if;

  if p_origin_lat is null or p_origin_lng is null or p_dest_lat is null or p_dest_lng is null then
    raise exception 'إحداثيات النقطتين مطلوبة' using hint = 'invalid-input';
  end if;
  if p_origin_lat not between -90 and 90 or p_dest_lat not between -90 and 90
     or p_origin_lng not between -180 and 180 or p_dest_lng not between -180 and 180 then
    raise exception 'إحداثيات خارج النطاق الجغرافي' using hint = 'invalid-input';
  end if;

  v_orad := coalesce(p_origin_radius_km, 25);
  v_drad := coalesce(p_dest_radius_km, 25);
  if v_orad < 1 or v_orad > 500 or v_drad < 1 or v_drad > 500 then
    raise exception 'نطاق التغطية يجب أن يكون بين ١ و٥٠٠ كم (البداية % والنهاية %)',
      v_orad, v_drad using hint = 'invalid-input';
  end if;

  -- (ج) تحقق الأصناف قبل أي كتابة: فئة مجهولة أو تكلفة سالبة تُرفض ولا تُبتلع
  if p_items is not null then
    if jsonb_typeof(p_items) <> 'array' then
      raise exception 'أسعار الفئات يجب أن تكون مصفوفة' using hint = 'invalid-input';
    end if;

    select string_agg(distinct x.class_slug, '، ')
      into v_bad
    from jsonb_array_elements(p_items) el
    cross join lateral (
      select lower(btrim(coalesce(el ->> 'classSlug', el ->> 'class_slug', ''))) as class_slug
    ) x
    where x.class_slug = ''
       or not exists (select 1 from public.vehicle_classes vc where vc.slug = x.class_slug);

    if v_bad is not null then
      raise exception 'فئات غير معروفة في قائمة الأسعار: %', v_bad using hint = 'invalid-input';
    end if;

    select count(*)
      into v_count
    from jsonb_array_elements(p_items) el
    where coalesce(public.numeric_or_null(el ->> 'cost'), 0) < 0;

    if v_count > 0 then
      raise exception 'تكلفة الفئة لا تكون سالبة' using hint = 'invalid-input';
    end if;
  end if;

  -- (د) القائمة نفسها
  if p_id is null then
    insert into public.price_lists as pl (
      subcontractor_id, title, origin_label, origin_lat, origin_lng, origin_radius_km,
      dest_label, dest_lat, dest_lng, dest_radius_km, bidirectional, status
    )
    values (
      v_sub, v_title, v_olabel, p_origin_lat, p_origin_lng, v_orad,
      v_dlabel, p_dest_lat, p_dest_lng, v_drad, coalesce(p_bidirectional, true), 'draft'
    )
    returning pl.id, pl.status into v_id, v_status;
  else
    select pl.id, pl.status into v_id, v_status
    from public.price_lists pl
    where pl.id = p_id
      and pl.subcontractor_id = v_sub
    for update;

    if not found then
      raise exception 'قائمة الأسعار غير موجودة أو ليست لهذا المتعهد' using hint = 'not-found';
    end if;

    -- المسودة تبقى مسودة، وكل ما عداها يعود pending: لا اعتماد صامت لسعر مُعدَّل
    v_status := case when v_status = 'draft' then 'draft' else 'pending' end;

    update public.price_lists pl
       set title            = v_title,
           origin_label     = v_olabel,
           origin_lat       = p_origin_lat,
           origin_lng       = p_origin_lng,
           origin_radius_km = v_orad,
           dest_label       = v_dlabel,
           dest_lat         = p_dest_lat,
           dest_lng         = p_dest_lng,
           dest_radius_km   = v_drad,
           bidirectional    = coalesce(p_bidirectional, true),
           status           = v_status,
           review_note      = case when v_status = 'draft' then pl.review_note else null end,
           reviewed_at      = case when v_status = 'draft' then pl.reviewed_at else null end
     where pl.id = v_id;
  end if;

  -- (هـ) الأصناف — استبدال كامل داخل نفس المعاملة
  if p_items is not null then
    delete from public.price_list_items pli where pli.price_list_id = v_id;

    insert into public.price_list_items (price_list_id, class_slug, cost)
    select v_id, x.class_slug, x.cost
    from jsonb_array_elements(p_items) el
    cross join lateral (
      select
        lower(btrim(coalesce(el ->> 'classSlug', el ->> 'class_slug', ''))) as class_slug,
        public.numeric_or_null(el ->> 'cost')                               as cost
    ) x
    where x.cost is not null
    on conflict (price_list_id, class_slug) do update set cost = excluded.cost;
  end if;

  select pl.status into v_status from public.price_lists pl where pl.id = v_id;

  id     := v_id;
  status := v_status;
  return next;
end;
$$;

-- (٨-٢) إرسال القائمة للمراجعة — المسودة/المرفوضة ← pending
create or replace function public.submit_price_list(p_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_sub    uuid;
  v_list   record;
  v_items  integer;
begin
  v_sub := public.current_subcontractor_id();

  select pl.* into v_list
  from public.price_lists pl
  where pl.id = p_id
    and (pl.subcontractor_id = v_sub or public.is_admin())
  for update;

  if not found then
    raise exception 'قائمة الأسعار غير موجودة أو ليست لهذا المتعهد' using hint = 'not-found';
  end if;

  if v_list.status = 'approved' then
    raise exception 'القائمة معتمدة بالفعل — عدّلها أولاً ثم أعد إرسالها'
      using hint = 'invalid-status';
  end if;

  -- قائمة بلا سعر واحد لا معنى لمراجعتها
  select count(*) into v_items
  from public.price_list_items pli
  where pli.price_list_id = p_id;

  if v_items = 0 then
    raise exception 'أضف سعر فئة واحدة على الأقل قبل الإرسال للمراجعة'
      using hint = 'invalid-input';
  end if;

  update public.price_lists pl
     set status = 'pending', review_note = null, reviewed_at = null
   where pl.id = p_id;

  return 'pending';
end;
$$;

-- (٨-٣) مراجعة القائمة — اعتماد أو رفض، للمشرف وحده
-- الرفض يستوجب ملاحظة: «مرفوضة» بلا سبب تُعيد المتعهد إلى نقطة الصفر.
-- المسودة لا تُراجَع أصلاً (لم تُرسَل بعد)، والمعتمدة يمكن سحب اعتمادها بالرفض.
create or replace function public.review_price_list(
  p_id      uuid,
  p_approve boolean,
  p_note    text default null
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_list record;
  v_note text;
  v_new  text;
begin
  if not public.is_admin() then
    raise exception 'مراجعة قوائم الأسعار متاحة للمشرف وحده' using hint = 'forbidden';
  end if;

  v_note := nullif(btrim(coalesce(p_note, '')), '');
  v_new  := case when coalesce(p_approve, false) then 'approved' else 'rejected' end;

  select pl.* into v_list
  from public.price_lists pl
  where pl.id = p_id
  for update;

  if not found then
    raise exception 'قائمة الأسعار غير موجودة' using hint = 'not-found';
  end if;

  if v_list.status = 'draft' then
    raise exception 'القائمة ما زالت مسودة لم تُرسَل للمراجعة' using hint = 'invalid-status';
  end if;

  if v_new = 'rejected' and v_note is null then
    raise exception 'سبب الرفض مطلوب' using hint = 'invalid-input';
  end if;

  update public.price_lists pl
     set status      = v_new,
         review_note = v_note,
         reviewed_at = now()
   where pl.id = p_id;

  return v_new;
end;
$$;

-- ----------------------------------------------------------------------------
-- (٩) لقطة مصدر السعر داخل الحجز — أساس تقرير هامش كل رحلة في المرحلة ٧
--
-- الأرقام تُلتقط لحظة الحجز ولا تُشتق لاحقاً: تعديل قائمة المتعهد أو نسبة
-- الهامش بعد أسبوع لا يجوز أن يغيّر ربح رحلة تمّت. هذا ما لا يمكن تعويضه لاحقاً.
-- ----------------------------------------------------------------------------
alter table public.bookings add column if not exists price_source       text;
alter table public.bookings add column if not exists subcontractor_id   uuid;
alter table public.bookings add column if not exists subcontractor_cost numeric(12,2);
alter table public.bookings add column if not exists margin_amount      numeric(12,2);

alter table public.bookings drop constraint if exists bookings_price_source_chk;
alter table public.bookings
  add constraint bookings_price_source_chk
  check (price_source is null or price_source in ('subcontractor', 'tariff')) not valid;

alter table public.bookings drop constraint if exists bookings_subcontractor_cost_chk;
alter table public.bookings
  add constraint bookings_subcontractor_cost_chk
  check (subcontractor_cost is null or subcontractor_cost >= 0) not valid;

-- on delete set null: حذف متعهد لا يجوز أن يمحو تاريخ رحلة، والأرقام تبقى.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'bookings_subcontractor_id_fkey'
      and conrelid = 'public.bookings'::regclass
  ) then
    alter table public.bookings
      add constraint bookings_subcontractor_id_fkey
      foreign key (subcontractor_id) references public.subcontractors(id) on delete set null;
  end if;
exception
  when others then
    raise notice 'تعذّر ربط bookings.subcontractor_id بجدول المتعهدين (%)', sqlerrm;
end;
$$;

-- مسار قراءة المرحلة ٧: مستحقات متعهد بعينه
create index if not exists bookings_subcontractor_id_idx
  on public.bookings (subcontractor_id, created_at desc);

-- ----------------------------------------------------------------------------
-- (٩-٢) create_booking — نسخة 0009 حرفياً + الإحداثيات + لقطة المصدر
--
-- ⚠ حدود مكافحة التلاعب من 0009 باقية كما هي بلا أي إضعاف:
--   • أرضية المسافة (٠٫٩ × الخط المستقيم) وسقفها (٣ أضعاف) واستثناء ما دون الكم.
--   • السعر يُعاد حسابه من quote_price ولا يُقرأ من المستدعي إطلاقاً.
--   • الصلاحية تبقى لعميل الخدمة وحده (يُعاد إصدارها في القسم ١٠).
-- الزيادة الوحيدة: تمرير الإحداثيات (فتشتغل التغطية) وتخزين الأعمدة الأربعة.
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

  -- (أ-٢) 🔒 د١ (0009) — المسافة تُقاس على الخريطة لا تُعلَن من المستدعي
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
  --     الإحداثيات تُمرَّر الآن فتشتغل مطابقة التغطية داخل الدالة، والعلم المحلي
  --     يضمن وصول أرقام التكلفة والهامش إلى اللقطة أياً كان دور المستدعي.
  perform set_config('tours.pricing_internals', 'on', true);

  select q.class_slug, q.class_title, q.total,
         q.price_source, q.subcontractor_id, q.subcontractor_cost, q.margin_amount
    into v_offer
  from public.quote_price(v_distance, v_passengers, v_round_trip, v_waiting,
                          v_origin_lat, v_origin_lng, v_dest_lat, v_dest_lng) q
  where q.class_slug = v_slug;

  perform set_config('tours.pricing_internals', '', true);

  if v_offer.class_slug is null then
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
        'pending_payment', v_offer.class_slug, v_offer.class_title, v_offer.total, v_currency, v_plan,
        v_due, v_remaining,
        v_name, v_phone, v_whatsapp, v_trip,
        coalesce(v_offer.price_source, 'tariff'), v_offer.subcontractor_id,
        v_offer.subcontractor_cost, v_offer.margin_amount
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
-- (١٠) الصلاحيات — تُصدَر كاملة لكل دالة لمستها الهجرة
--
-- التذكير الأخير: الدوال الجديدة تولد ومعها EXECUTE ضمني لـ PUBLIC ومنح صريح
-- لـ anon و authenticated من alter default privileges. سحب PUBLIC وحده لا يكفي.
-- ----------------------------------------------------------------------------

-- دوال داخلية بحتة: لا تُستدعى إلا من دوال/مُشغّلات/سياسات أخرى
revoke all on function public.pricing_internals_visible()        from public, anon, authenticated;
revoke all on function public.numeric_or_null(text)              from public, anon, authenticated;
revoke all on function public.subcontractors_guard_self()        from public, anon, authenticated;
revoke all on function public.price_lists_guard_review()         from public, anon, authenticated;
revoke all on function public.price_list_items_demote_parent()   from public, anon, authenticated;

-- هوية المتعهد: تُقيَّم داخل سياسات RLS بهوية المستدعي ⇒ المسجَّل يحتاجها
revoke all    on function public.current_subcontractor_id()     from public, anon, authenticated;
grant execute on function public.current_subcontractor_id()     to authenticated;

revoke all    on function public.current_subcontractor_status() from public, anon, authenticated;
grant execute on function public.current_subcontractor_status() to authenticated;

-- 🔒 مطابقة التغطية: للمسجَّل وعميل الخدمة — ولا تُمنح لـ anon أبداً.
-- الزائر يصل إلى الأسعار عبر quote_price وحدها (وبعد الهامش والتنقيح).
revoke all    on function public.coverage_matches(numeric, numeric, numeric, numeric)
  from public, anon, authenticated;
grant execute on function public.coverage_matches(numeric, numeric, numeric, numeric)
  to authenticated;

-- دوال البورتال واللوحة — الحراسة داخلها، ولا معنى لمنحها للزائر
revoke all    on function public.upsert_price_list(
  uuid, text, text, numeric, numeric, numeric, text, numeric, numeric, numeric,
  boolean, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.upsert_price_list(
  uuid, text, text, numeric, numeric, numeric, text, numeric, numeric, numeric,
  boolean, jsonb, uuid) to authenticated;

revoke all    on function public.submit_price_list(uuid) from public, anon, authenticated;
grant execute on function public.submit_price_list(uuid) to authenticated;

revoke all    on function public.review_price_list(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.review_price_list(uuid, boolean, text) to authenticated;

-- 🔒 محرك التسعير: التوقيعان متاحان للزائر لأن التسعير الفوري يعمل قبل أي دخول،
-- والحماية ليست في المنع بل في التنقيح داخل الدالة (القسم ٧-١): مفتاح anon
-- يُرجع price_source فقط، وأرقام التكلفة والهامش تبقى null إلا لسياق موثوق.
revoke all    on function public.quote_price(numeric, integer, boolean, numeric)
  from public, anon, authenticated;
grant execute on function public.quote_price(numeric, integer, boolean, numeric)
  to anon, authenticated;

revoke all    on function public.quote_price(
  numeric, integer, boolean, numeric, numeric, numeric, numeric, numeric)
  from public, anon, authenticated;
grant execute on function public.quote_price(
  numeric, integer, boolean, numeric, numeric, numeric, numeric, numeric)
  to anon, authenticated;

-- 🔒 د١ (0009) بلا إضعاف: إنشاء الحجز لعميل الخدمة وحده — يُعاد إصداره صراحةً
-- لأن `create or replace` أعلاه لا يمس الصلاحيات، وإعادة التأكيد أرخص من ثغرة.
revoke all on function public.create_booking(
  jsonb, jsonb, integer, boolean, numeric, numeric, numeric,
  text, text, text, text, text, text, timestamptz, text) from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.current_subcontractor_id() to service_role';
    execute 'grant execute on function public.current_subcontractor_status() to service_role';
    execute 'grant execute on function public.coverage_matches(numeric, numeric, numeric, numeric) to service_role';
    execute 'grant execute on function public.upsert_price_list(
               uuid, text, text, numeric, numeric, numeric, text, numeric, numeric, numeric,
               boolean, jsonb, uuid) to service_role';
    execute 'grant execute on function public.submit_price_list(uuid) to service_role';
    execute 'grant execute on function public.review_price_list(uuid, boolean, text) to service_role';
    execute 'grant execute on function public.quote_price(numeric, integer, boolean, numeric) to service_role';
    execute 'grant execute on function public.quote_price(
               numeric, integer, boolean, numeric, numeric, numeric, numeric, numeric) to service_role';
    execute 'grant execute on function public.create_booking(
               jsonb, jsonb, integer, boolean, numeric, numeric, numeric,
               text, text, text, text, text, text, timestamptz, text) to service_role';
  end if;
end;
$$;

do $$
begin
  raise notice '✔ 0010_subcontractors: المتعهدون + قوائم الأسعار + التغطية + الهامش + لقطة الحجز';
end;
$$;
