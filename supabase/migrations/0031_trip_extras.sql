-- ============================================================================
-- 0031_trip_extras.sql — الدفعة ٣: جراحة التسعير الواحدة
--
-- الملاحظتان ٧ و٨ من ملحق ٢ في `docs/VISION.md` ثلاثةُ مطالب تسقط كلها على
-- **الأعضاء الثلاثة نفسها** (`quote_price` · `quote_public` · `create_booking`)
-- وعلى لقطة `bookings.trip` المشتركة بينها — فتُنفَّذ مرة واحدة لا ثلاثاً:
--
--   (٧) تاريخ العودة يُعرض، وساعات الانتظار تُشتق منه حين تكون العودة في اليوم
--       نفسه؛ ويحلّ محلَّ حقل الانتظار كتالوجُ خدمات إضافية حقيقي يُدار من اللوحة.
--   (٨) الحقائب: سعة لكل فئة سيارة، وأهليةٌ مزدوجة (ركاب **و**حقائب).
--
-- العقد المرجعي وأسماؤه الملزمة: `lib/extras-types.ts` — لا انحراف عنه.
--
-- ── قرارات بدر الثلاثة التي يقوم عليها كل ما في هذا الملف (2026-08-14) ───────
--
-- (أ) **الخدمة طبقةٌ بعد الذروة لا حدٌّ داخل المعادلة.** كرسي الأطفال بـ٢٠٠ يبقى
--     ٢٠٠ في يوم الذروة. والمكسب المعماري أكبر من الظاهر: ما دامت الخدمات خارج
--     `pre_peak` كلياً فمعادلة الهامش في `quote_price` **لا يتغير فيها حرف**،
--     وترتيب الأرضية ← معامل العودة ← الانتظار ← الذروة يبقى كما حسمه D-11.
--     فهذه الهجرة **إضافة** لا إعادة ترتيب.
--
-- (ب) **الخدمات خارج أساس الهامش وخارج أساس الخصم.** الكوبون يخصم سعر الرحلة
--     وحده ولا يمسّ كرسي الأطفال، وسقف موجة البث لا يتسع بقيمة الخدمات.
--
-- (ج) **خدماتٌ ننفّذها نحن وحدنا في هذه الدفعة.** ما ينفّذه المتعهد مؤجَّل بسبب
--     مكتوب (D-39): بناؤه صحيحاً يمسّ قوائم الأسعار وسقف الموجة ودالة القبول
--     وعرض المقاصة — أي جراحة رابعة فوق ثلاث.
--
-- ── المعادلة بعد الجراحة، والفرق عن اليوم سطرٌ واحد في آخرها ─────────────────
--
--   subtotal   = base_fee + km × per_km            أو   partner_cost + margin
--   subtotal   = max(subtotal, min_price)                  ← أرضية الفئة
--   subtotal   = subtotal × round_trip_factor              ← إن ذهاب وعودة
--   subtotal   = subtotal + waiting_hours × waiting_hour_price
--   ride_total = round(subtotal × (1 + peak_percent/100))  ← الذروة آخر خطوة
--   ─────────────────────────────────────────────────────────────────────────
--   ride_total = ride_total − discount_amount              ← الخصم على الرحلة وحدها
--   total      = ride_total + extras_total                 ← ★ الجديد الوحيد
--
-- يُنفَّذ بعد 0024 (‏`apply_discount` · `redeem_coupon` · التوقيع التساعي لـ
-- `quote_public` والسادس عشر لـ `create_booking`). آمن لإعادة التنفيذ.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (١) كتالوج الخدمات — `extra_services`
--
-- **بلا بذرة إطلاقاً**: أسعار كرسي الأطفال والواي فاي لا يعرفها إلا المالك (نفس
-- سبب عدم بذر `tariffs` في 0005). الجدول يخرج فارغاً والشاشة تقول ذلك — وبذرةٌ
-- بأسعار مخترعة تصير سعراً حقيقياً يدفعه عميل أول يوم.
--
-- `max_qty`: أقصى كمية في الحجز الواحد (كرسي أطفال ٣ · واي فاي ١). **والحدّ
-- مفروض في القاعدة لا في الواجهة** — وإلا كان تعديل الرقم في المتصفح كافياً.
-- ----------------------------------------------------------------------------
create table if not exists public.extra_services (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  title       text not null,
  description text,
  price       numeric(12,2) not null check (price >= 0),
  max_qty     integer not null default 1 check (max_qty between 1 and 20),
  active      boolean not null default true,
  sort        integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists extra_services_active_sort_idx
  on public.extra_services (active, sort);

drop trigger if exists extra_services_touch_updated_at on public.extra_services;
create trigger extra_services_touch_updated_at
  before update on public.extra_services
  for each row execute function public.touch_updated_at();

comment on table public.extra_services is
  'كتالوج الخدمات الإضافية التي **ننفّذها نحن** (قرار بدر ج). سعر الوحدة لا تمسّه ذروة ولا خصم ولا أرضية فئة: الخدمة طبقةٌ بعد الذروة لا حدٌّ داخل معادلة السعر (قرار بدر أ). لا يُحذف صفٌّ منه ما دام في حجز — يُطفأ بـ active=false.';

comment on column public.extra_services.max_qty is
  'أقصى كمية للخدمة الواحدة في الحجز الواحد. تُقصّ في price_extras داخل القاعدة لا في الواجهة.';

-- ----------------------------------------------------------------------------
-- (٢) لقطة ما اختاره الحجز — `booking_extras`
--
-- 🔒 **مجمَّدة كلقطة الكوبون (0024).** `title_snapshot` و`unit_price` يُخزَّنان
-- لحظة الحجز، فتعديل سعر الخدمة غداً **لا يعيد كتابة حجز الأمس** (نفس مبرر
-- D-10). وبدونها ينهار كل كشف ربحية بأثر رجعي عند أول تعديل سعر.
--
-- `on delete restrict` على الخدمة: حذف صفٍّ من الكتالوج يجب أن **يُرفض** ما دام
-- في حجز، وإلا ضاع تفسير سعرٍ قديم. والمفتاح المركّب `(booking_id, extra_id)`
-- يمنع سطرين لنفس الخدمة في نفس الحجز — التفافاً على `max_qty`.
--
-- ولا فهرس إضافي على `booking_id`: هو العمود القائد في المفتاح المركّب أصلاً
-- فيخدمه فهرس المفتاح، وفهرسٌ ثانٍ كتابةٌ بلا قارئ.
-- ----------------------------------------------------------------------------
create table if not exists public.booking_extras (
  booking_id     uuid not null references public.bookings(id) on delete cascade,
  extra_id       uuid not null references public.extra_services(id) on delete restrict,
  title_snapshot text not null,
  qty            integer not null check (qty > 0),
  unit_price     numeric(12,2) not null check (unit_price >= 0),
  line_total     numeric(12,2) not null check (line_total >= 0),
  created_at     timestamptz not null default now(),
  primary key (booking_id, extra_id)
);

comment on table public.booking_extras is
  'لقطة الخدمات المختارة في حجز بعينه — مجمَّدة لحظة الحجز كلقطة الكوبون. **لا insert لأي دور مستخدم**: المنفذ الوحيد هو create_booking (‏security definer) داخل معاملة الحجز نفسها.';

-- ----------------------------------------------------------------------------
-- (٣) RLS والصلاحيات — revoke أولاً ثم grant (اتفاقية ٦)
--
-- ⚠ Supabase تمنح الأدوار العامة صلاحيات واسعة افتراضياً على أي جدول جديد،
-- ومنها TRUNCATE **وهي لا تخضع لـ RLS إطلاقاً** — فسطور الـ revoke حمّالة.
--
-- والزائر **لا يقرأ `extra_services` مباشرة**: يقرأ `public_extras()` وحدها،
-- فالكتالوج المعطّل وأسعارُه لا تظهر له (نفس مبدأ `payment_accounts` في 0007).
-- ----------------------------------------------------------------------------
alter table public.extra_services enable row level security;
alter table public.booking_extras enable row level security;

revoke all on public.extra_services from public, anon, authenticated;
revoke all on public.booking_extras from public, anon, authenticated;

-- اللوحة تدير الكتالوج بجلسة المشرف؛ والحارس الفعلي هو السياسات أدناه
grant select, insert, update, delete on public.extra_services to authenticated;

-- 🔒 قراءة فقط للقطة، **ولا insert/update/delete لأي دور مستخدم**
grant select on public.booking_extras to authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant select, insert, update, delete on public.extra_services to service_role';
    -- عميل الخدمة يقرأ اللقطة لشاشات اللوحة؛ والكتابة تبقى داخل create_booking
    execute 'grant select on public.booking_extras to service_role';
  end if;
end;
$$;

-- سياسات extra_services — المشرف وحده، والزائر يمر بـ public_extras()
drop policy if exists "extra_services_select_admin" on public.extra_services;
create policy "extra_services_select_admin"
  on public.extra_services
  for select
  to authenticated
  using (public.is_admin());

drop policy if exists "extra_services_insert_admin" on public.extra_services;
create policy "extra_services_insert_admin"
  on public.extra_services
  for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "extra_services_update_admin" on public.extra_services;
create policy "extra_services_update_admin"
  on public.extra_services
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "extra_services_delete_admin" on public.extra_services;
create policy "extra_services_delete_admin"
  on public.extra_services
  for delete
  to authenticated
  using (public.is_admin());

-- سياسة booking_extras — قراءة للمشرف وحده، ولا سياسة كتابة إطلاقاً
drop policy if exists "booking_extras_select_admin" on public.booking_extras;
create policy "booking_extras_select_admin"
  on public.booking_extras
  for select
  to authenticated
  using (public.is_admin());

-- ----------------------------------------------------------------------------
-- (٤) `public_extras()` — السطح العام الوحيد للكتالوج
--
-- **بلا أي عمود داخلي** (لا `id` ولا `created_at` ولا `active`) — نفس مبدأ
-- `quote_public()` في اتفاقية ٧: ما لا يوجد في نوع الإرجاع لا يُسرَّب بخطأ في
-- الواجهة. الأمان بنيوي لا انضباطي.
-- ----------------------------------------------------------------------------
create or replace function public.public_extras()
returns table (
  slug        text,
  title       text,
  description text,
  price       numeric,
  max_qty     integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select e.slug, e.title, e.description, e.price, e.max_qty
  from public.extra_services e
  where e.active
  order by e.sort, e.title;
$$;

comment on function public.public_extras() is
  'كتالوج الخدمات المفعّلة للواجهة العامة. بلا أي عمود داخلي (لا id ولا active) — ما ليس في نوع الإرجاع لا يُسرَّب. هذا هو المنفذ الوحيد للزائر إلى الكتالوج؛ الجدول نفسه محجوب عنه.';

revoke all    on function public.public_extras() from public, anon, authenticated;
grant execute on function public.public_extras() to anon, authenticated;

-- ----------------------------------------------------------------------------
-- (٥) `price_extras(jsonb)` — تسعير الاختيار **في القاعدة لا في المتصفح**
--
-- 🔒 D-09 حرفياً: المتصفح يرسل **رموزاً وكميات فقط ولا سعر**. الأسعار تُقرأ من
-- الكتالوج هنا، والكمية تُقصّ على `max_qty` هنا، والضرب يقع هنا.
--
-- ثلاث حالات تُتجاهَل بصمت (لا خطأ): رمزٌ غير موجود · خدمة مُطفأة · كمية ≤ 0.
-- والصمت مقصود: اختيارٌ قديم لخدمة أطفأها المالك يجب ألا يُفشل حجزاً كاملاً،
-- والإجمالي الذي يراه العميل يأتي من `quote_public` نفسها فلا ينشأ خلاف.
--
-- ⚠ **التكرار يُؤخذ بالأكبر ثم يُقصّ** (`max(qty)` ثم `least(…, max_qty)`) لا
-- بالجمع: لو جُمع لصار تكرار الرمز في المصفوفة التفافاً كاملاً على `max_qty`
-- (‏`[{child-seat,3},{child-seat,3}]` = ستة كراسي بحدٍّ ثلاثة).
--
-- `security definer` لأن `extra_services` محجوب عن الأدوار العامة، ولأنها
-- تستدعي `public.jsonb_number` المسحوبة من كل دور مستخدم منذ 0007.
-- ----------------------------------------------------------------------------
create or replace function public.price_extras(p_selection jsonb)
returns table (
  extra_id   uuid,
  slug       text,
  title      text,
  qty        integer,
  unit_price numeric,
  line_total numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  with items as (
    select
      lower(btrim(coalesce(el.value ->> 'slug', '')))                     as sel_slug,
      -- ⚠ السقف ١٠٠٠ **قبل** التحويل إلى integer لا بعده: `qty: 99999999999`
      -- كانت سترمي «integer out of range» فتُسقط التسعير كله بخطأ قاعدة بدل أن
      -- تُقصّ بصمت. وهو أعلى بكثير من أقصى `max_qty` (٢٠) فلا يغيّر معنى شيء.
      floor(least(greatest(public.jsonb_number(el.value, 'qty', 0), 0), 1000))::integer as sel_qty
    from jsonb_array_elements(
           case when jsonb_typeof(p_selection) = 'array'
                then p_selection
                else '[]'::jsonb
           end
         ) as el(value)
    where jsonb_typeof(el.value) = 'object'
  ),
  wanted as (
    select i.sel_slug, max(i.sel_qty) as sel_qty
    from items i
    where i.sel_slug <> '' and i.sel_qty > 0
    group by i.sel_slug
  )
  select
    e.id                                            as extra_id,
    e.slug                                          as slug,
    e.title                                         as title,
    least(w.sel_qty, e.max_qty)                     as qty,
    e.price                                         as unit_price,
    round(e.price * least(w.sel_qty, e.max_qty), 2) as line_total
  from wanted w
  join public.extra_services e on e.slug = w.sel_slug and e.active
  order by e.sort, e.title;
$$;

comment on function public.price_extras(jsonb) is
  'تسعير اختيار الخدمات في القاعدة: المدخل [{"slug":"child-seat","qty":2}] — رموز وكميات فقط ولا سعر (D-09). تتجاهل غير الموجود والمُطفأ والكمية ≤ 0، وتأخذ من التكرار **الأكبر** ثم تقصّه على max_qty كي لا يصير تكرار الرمز التفافاً على الحد. الحساب كله هنا؛ TypeScript يعرض وينسّق فقط.';

revoke all    on function public.price_extras(jsonb) from public, anon, authenticated;
grant execute on function public.price_extras(jsonb) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- (٦) `derive_waiting_hours` — اشتقاق الانتظار من تاريخ العودة
--
--   لا عودة، أو عودة ≤ الانطلاق                    ⇒ 0
--   العودة في يوم آخر (بتوقيت Africa/Cairo)        ⇒ 0   ← السائق ينصرف ويعود،
--                                                        ومعامل الذهاب والعودة
--                                                        وحده هو ما يسعّرها
--   وإلا ⇒ least(ceil(الفارق بالساعات), 12)
--
-- **التقريب إلى الساعة الأعلى قرار معلن لا سهو:** سعر الساعة ثابت لكل فئة (D-38)
-- بلا تدرّج، والساعة المبدوءة ساعةٌ مدفوعة — وهو عرف هذا النشاط. نقضه سطرٌ واحد
-- هنا، ويجب أن يُكتب في `lib/extras-types.ts` معه.
--
-- **والسقف ١٢ ساعة** (‏`MAX_DERIVED_WAITING_HOURS` في العقد) يمنع أن يتحول خطأُ
-- تاريخٍ إلى فاتورة فلكية: ما تجاوز ذلك ليس انتظاراً بل حجز يوم آخر.
--
-- ⚠ **`stable` لا `immutable` — انحرافٌ مقصود عن المواصفة ومبرره:** الدالة تحوّل
-- إلى `Africa/Cairo`، و`timestamptz at time zone <نص>` مصنّفة `stable` في
-- Postgres لأن قواعد المنطقة الزمنية تتغير بقرار حكومي (ومصر أعادت التوقيت
-- الصيفي فعلاً في 2023). وسمُها `immutable` كذبةٌ يصدّقها المخطِّط فيطوي النتيجة
-- وقت التخطيط — وهو بالضبط «حارسٌ يطمئنك ولا يحرس» (النمط ٩ في LESSONS).
-- ولا تخسر شيئاً بذلك: لا تُستعمل في فهرس ولا في قيد تحقّق.
-- ----------------------------------------------------------------------------
create or replace function public.derive_waiting_hours(
  p_pickup_at timestamptz,
  p_return_at timestamptz
)
returns numeric
language sql
stable
set search_path = ''
as $$
  select case
    when p_pickup_at is null or p_return_at is null then 0::numeric
    when p_return_at <= p_pickup_at                 then 0::numeric
    when (p_return_at at time zone 'Africa/Cairo')::date
      <> (p_pickup_at at time zone 'Africa/Cairo')::date then 0::numeric
    else least(
      ceil(extract(epoch from (p_return_at - p_pickup_at)) / 3600.0),
      12::numeric   -- MAX_DERIVED_WAITING_HOURS
    )
  end;
$$;

comment on function public.derive_waiting_hours(timestamptz, timestamptz) is
  'ساعات الانتظار المشتقة من تاريخ العودة: صفر بلا عودة أو حين تكون العودة في يوم آخر بتوقيت القاهرة، وإلا ceil(الفارق بالساعات) بسقف ١٢ (MAX_DERIVED_WAITING_HOURS). التقريب لأعلى قرار معلن: سعر الساعة ثابت (D-38) والساعة المبدوءة مدفوعة.';

-- 🔒 ليست `security definer` ولا تلمس جدولاً — لكن الانضباط واحد: revoke ثم grant.
-- ومنحُها للزائر مقصود: شاشة الحجز تعرض الرقم فور اختيار تاريخ العودة، ويجب أن
-- يأتي من **نفس الدالة** التي سيحسب بها `create_booking` — لا من حساب في
-- المتصفح ينحرف عنها (D-05 / اتفاقية ٢).
revoke all    on function public.derive_waiting_hours(timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.derive_waiting_hours(timestamptz, timestamptz)
  to anon, authenticated;

-- ----------------------------------------------------------------------------
-- (٧) الحقائب — عمود على `vehicle_classes`
--
-- الافتراضي **٢ قيمة تشغيلية لا صفر**: صفرٌ يعني «لا فئة تقبل أي حقيبة» فيُفرغ
-- الموقعُ من العروض لحظة تطبيق الهجرة — أي هجرةٌ تُسقط المبيعات بلا خطأ واحد
-- في السجل. والمالك يعايرها من `/admin/fleet`.
--
-- المنح: `grant select on public.vehicle_classes` في 0005 على مستوى **الجدول**
-- لا الأعمدة، فالعمود الجديد يرثه تلقائياً (بخلاف `pricing_settings` ذي المنح
-- العمودية) — ولا حاجة إلى إعادة منح.
-- ----------------------------------------------------------------------------
alter table public.vehicle_classes
  add column if not exists luggage_capacity integer not null default 2
  check (luggage_capacity between 0 and 99);

comment on column public.vehicle_classes.luggage_capacity is
  'أقصى عدد حقائب تستوعبه الفئة. الافتراضي ٢ قيمة تشغيلية لا صفر: صفرٌ يُخرج كل الفئات من الأهلية لحظة الهجرة. الأهلية مزدوجة داخل quote_price: capacity ≥ passengers **و** luggage_capacity ≥ luggage (D-12: لا أهلية في الواجهة).';

-- ----------------------------------------------------------------------------
-- (٨) `quote_price` — الوسيط التاسع `p_luggage`
--
-- ⚠ **الجسم هو جسم 0011 حرفياً عدا شرط الأهلية.** لا `pre_peak` تغيّر، ولا
-- `margin_amount`، ولا ترتيب الخطوات — لأن الخدمة طبقةٌ **بعد** هذه الدالة كلها
-- (قرار بدر أ). من يعدّل هنا سطراً ماليّاً ينقض D-11 و`quote_tests.sql` معاً.
--
-- الزيادة سطران: `luggage` في CTE `base`، وشرطٌ ثانٍ في CTE `eligible`.
-- ----------------------------------------------------------------------------
create or replace function public.quote_price(
  p_distance_km   numeric,
  p_passengers    integer,
  p_round_trip    boolean,
  p_waiting_hours numeric,
  p_origin_lat    numeric,
  p_origin_lng    numeric,
  p_dest_lat      numeric,
  p_dest_lng      numeric,
  p_luggage       integer default 0
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
  with base as (
    select
      greatest(coalesce(p_distance_km, 0), 0)                       as distance_km,
      greatest(coalesce(p_passengers, 1), 1)                        as passengers,
      coalesce(p_round_trip, false)                                 as round_trip,
      greatest(coalesce(p_waiting_hours, 0), 0)                     as waiting_hours,
      greatest(coalesce(p_luggage, 0), 0)                           as luggage,
      p_origin_lat as o_lat, p_origin_lng as o_lng,
      p_dest_lat   as d_lat, p_dest_lng   as d_lng
  ),
  settings as (
    select
      coalesce(ps.peak_enabled, false)          as peak_enabled,
      coalesce(ps.peak_percent, 0)              as peak_percent,
      -- الافتراضات هنا تطابق DEFAULT_MARGIN في lib/subcontractor-types.ts
      coalesce(ps.margin_type, 'percent')       as margin_type,
      coalesce(ps.margin_value, 20)             as margin_value,
      coalesce(ps.margin_min_amount, 100)       as margin_min_amount
    from (select 1) one
    left join public.pricing_settings ps on ps.id
  ),
  eligible as (
    select vc.slug, vc.title, vc.capacity, t.per_km, t.base_fee, t.min_price,
           t.waiting_hour_price, t.round_trip_factor
    from public.vehicle_classes vc
    join public.tariffs t on t.class_id = vc.id
    cross join base b
    -- 0031: الأهلية صارت شرطين — ركاب **و**حقائب. وموضعها هنا وحده (D-12):
    -- قاعدة أهلية في الواجهة تعني فئةً تُعرض ثم يرفضها الحجز.
    where vc.active
      and vc.capacity >= b.passengers
      and vc.luggage_capacity >= b.luggage
    order by vc.capacity asc
    limit 2
  ),
  covered as (
    -- أرخص تكلفة معتمدة لكل فئة على هذا المسار (فارغة بلا إحداثيات)
    select pli.class_slug,
           min(pli.cost)                                       as sub_cost,
           (array_agg(pl.subcontractor_id order by pli.cost))[1] as sub_id
    from base b
    join lateral public.coverage_matches(b.o_lat, b.o_lng, b.d_lat, b.d_lng) cm on true
    join public.price_lists pl        on pl.id = cm.price_list_id
    join public.price_list_items pli  on pli.price_list_id = pl.id
    where b.o_lat is not null and b.o_lng is not null
      and b.d_lat is not null and b.d_lng is not null
    group by pli.class_slug
  ),
  joined as (
    select e.*, b.*, s.*, c.sub_cost, c.sub_id
    from eligible e
    cross join base b
    cross join settings s
    left join covered c on c.class_slug = e.slug
  ),
  margined as (
    select j.*,
      case when j.sub_cost is null then null
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
    select m.*,
      case when m.sub_cost is null then m.base_fee else m.sub_cost + m.margin_amt end as row_base_fee,
      case when m.sub_cost is null then m.distance_km * m.per_km else 0::numeric end  as row_distance_cost,
      m.waiting_hours * m.waiting_hour_price                                          as row_waiting_cost,
      case when m.sub_cost is null
           then m.base_fee + m.distance_km * m.per_km
           else m.sub_cost + m.margin_amt
      end as raw_subtotal
    from margined m
  ),
  floored as (
    select p.*,
      greatest(p.raw_subtotal, p.min_price) as floor_subtotal,
      (p.raw_subtotal < p.min_price)        as min_hit
    from priced p
  ),
  finalized as (
    select f.*,
      case when f.round_trip then f.floor_subtotal * f.round_trip_factor else f.floor_subtotal end
        + f.row_waiting_cost as pre_peak,
      -- التكلفة المطبَّقة: يضربها معامل الذهاب والعودة كما يضرب السعر
      case when f.sub_cost is null then null
           else f.sub_cost * (case when f.round_trip then f.round_trip_factor else 1 end)
      end as applied_cost
    from floored f
  ),
  visibility as (select public.pricing_internals_visible() as ok)
  select
    q.slug                        as class_slug,
    q.title                       as class_title,
    q.capacity                    as capacity,
    round(case when q.peak_enabled then q.pre_peak * (1 + q.peak_percent / 100) else q.pre_peak end) as total,
    round(q.row_base_fee, 2)      as base_fee,
    round(q.row_distance_cost, 2) as distance_cost,
    round(q.row_waiting_cost, 2)  as waiting_cost,
    q.round_trip                  as round_trip_applied,
    q.peak_enabled                as peak_applied,
    q.min_hit                     as min_applied,
    case when q.sub_cost is null then 'tariff' else 'subcontractor' end as price_source,
    case when q.sub_cost is null or not v.ok then null else q.sub_id end as subcontractor_id,
    case when q.sub_cost is null or not v.ok then null
         else round(q.applied_cost, 2) end as subcontractor_cost,
    -- الهامش المطبَّق = (ما قبل الذروة − الانتظار) − التكلفة المطبَّقة
    -- ⚠ الخدمات ليست هنا ولن تكون: خارج أساس الهامش (قرار بدر ب)
    case when q.sub_cost is null or not v.ok then null
         else round(q.pre_peak - q.row_waiting_cost - q.applied_cost, 2) end as margin_amount
  from finalized q
  cross join visibility v
  order by q.capacity asc;
$$;

comment on function public.quote_price(
  numeric, integer, boolean, numeric, numeric, numeric, numeric, numeric, integer
) is 'محرك التسعير — الجسم كما في 0011 حرفياً عدا الأهلية: صارت capacity ≥ passengers **و** luggage_capacity ≥ luggage (0031). الخدمات الإضافية ليست هنا إطلاقاً: طبقةٌ بعد الذروة لا حدٌّ داخل المعادلة، فمعادلة الهامش وأرضية الخصم بلا مساس.';

-- 🔒 (ف١) إسقاط التوقيع الثماني صراحةً **بعد** إنشاء التاسع — بقاؤهما معاً يجعل
-- كل نداء بثمانية معاملات ملتبساً فيفشل بـ «function is not unique» **وقت
-- النداء لا وقت الهجرة**، و`PGRST203` على النداء المُسمّى. سابقة 0024:1197.
drop function if exists public.quote_price(
  numeric, integer, boolean, numeric, numeric, numeric, numeric, numeric
);

revoke all on function public.quote_price(
  numeric, integer, boolean, numeric, numeric, numeric, numeric, numeric, integer
) from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.quote_price(numeric, integer, boolean, numeric, numeric, numeric, numeric, numeric, integer) to service_role';
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- (٩) الغلافان بلا إحداثيات — ومعالجة الباب الخلفي (ف٥)
--
-- الغلاف الرباعي `quote_price(numeric,integer,boolean,numeric)` **ممنوح لـ anon
-- و authenticated منذ 0010 ولم يُسحب**، وهو مسار السقوط في `/api/quote` حين لا
-- تكون 0012 مطبَّقة. وبلا حقائب فيه يعرض فئةً قد لا تتسع لحقائب العميل.
--
-- ── القرار: **الخيار الثاني في ق٦ — غلافٌ خماسي جديد، والرباعي يبقى ويمرر صفراً**
--
-- ولماذا لا يُسحب الرباعي من الزائر رغم أنه الأنظف أمنياً: `coverage_tests.sql`
-- (ي-٦) يؤكّد نصّاً أن الزائر **يجب** أن ينفّذه، وسحبُه من هذا الملف يُسقط مجموعة
-- اختبارات لا أملكها في هذه الدفعة. وحجمُ ما يشتريه السحب صغير: الرباعي بحقائب
-- صفر يُنتج **بالضبط** ما ينتجه اليوم لعميلٍ لا حقائب له — فهو ليس تصعيد صلاحية
-- بل غيابُ وعيٍ بالحقائب. أثره الحقيقي: من يناديه مباشرة يرى فئةً أصغر مما
-- يتّسع لأمتعته، **ثم يرفضها `create_booking` بـ `class-unavailable`** لأن
-- الأهلية المزدوجة مفروضة هناك أيضاً — عرضٌ مضلِّل لا حجزٌ رخيص.
--
-- 📌 **بند مفتوح مكتوب:** بعد تحديث (ي-٦) في `coverage_tests.sql` يُسحب الرباعي
--    من `anon` و`authenticated` ويبقى الخماسي وحده منفذَ الواجهات.
--
-- ⚠ **وبلا قيم افتراضية في الغلافين** — تعليق 0011:88-89 بنصّه: إضافة `default`
-- على `p_luggage` في الخماسي تجعل النداء الرباعي ملتبساً بين الغلافين فيفشل بـ
-- «is not unique». الافتراضي يعيش في التاسعة وحدها.
-- ----------------------------------------------------------------------------
create or replace function public.quote_price(
  p_distance_km   numeric,
  p_passengers    integer,
  p_round_trip    boolean,
  p_waiting_hours numeric,
  p_luggage       integer
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
    null::numeric, null::numeric, null::numeric, null::numeric,
    p_luggage
  ) q;
$$;

comment on function public.quote_price(numeric, integer, boolean, numeric, integer) is
  'غلاف بلا إحداثيات **وبحقائب** — أعمدته العشرة كما في 0005: لا مصدر سعر ولا تكلفة ولا هامش. هذا هو المنفذ الصحيح لأي واجهة لا تملك إحداثيات، والرباعي دونه يبقى للتوافق ويمرر حقائب صفراً.';

-- الرباعي: يبقى للتوافق ويمرر صفراً **صراحةً** لا ضمناً
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
    p_distance_km, p_passengers, p_round_trip, p_waiting_hours, 0
  ) q;
$$;

comment on function public.quote_price(numeric, integer, boolean, numeric) is
  '⚠ مسار سقوطٍ **بلا وعي بالحقائب**: يمرر p_luggage = 0 فيعرض فئاتٍ قد لا تتسع لأمتعة العميل. الأهلية المزدوجة مفروضة في create_booking فلا ينشأ منه حجز رخيص، لكن العرض مضلِّل. المنفذ الصحيح هو التوقيع الخماسي. بند مفتوح: يُسحب من anon بعد تحديث (ي-٦) في coverage_tests.sql.';

-- المنح كما كانت في 0010:1580-1583 — إعادة تأكيد لأن `create or replace` لا
-- تمس الصلاحيات، والخماسي يأخذ نفس منح الرباعي (لا يكشف مصدر سعر ولا تكلفة).
revoke all    on function public.quote_price(numeric, integer, boolean, numeric)
  from public, anon, authenticated;
grant execute on function public.quote_price(numeric, integer, boolean, numeric)
  to anon, authenticated;

revoke all    on function public.quote_price(numeric, integer, boolean, numeric, integer)
  from public, anon, authenticated;
grant execute on function public.quote_price(numeric, integer, boolean, numeric, integer)
  to anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.quote_price(numeric, integer, boolean, numeric) to service_role';
    execute 'grant execute on function public.quote_price(numeric, integer, boolean, numeric, integer) to service_role';
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- (١٠) `quote_public` — وسيطان جديدان وثلاثة أعمدة إرجاع
--
-- الجسم كما في 0024 حرفياً حتى الخصم، ثم سطران: الخدمات تُجمع وتُضاف.
--
-- ⚠⚠ **`apply_discount` تستلم إجمالي الرحلة وحده كما اليوم** (ف٩). تمريرُ
-- الإجمالي بعد الخدمات كان سيفعل شيئين معاً: يجعل الكوبون يخصم كرسي الأطفال،
-- **ويجعل أرضية الهامش تعدّ إيراد الخدمات هامشاً** فتسمح بخصمٍ أكبر مما يحتمله
-- هامش الرحلة الحقيقي. القرار (ب) في العقد يمنع الاثنين.
--
-- الأعمدة الثلاثة تُلحق **في الآخر** كي لا ينزاح شيء على قارئ موضعي:
--   `extras_total` · `extras` (‏[{slug,title,qty,unitPrice,lineTotal}]) ·
--   `ride_total` (‏الإجمالي بعد الخصم وقبل الخدمات — كي تعرض الواجهة التفصيل)
-- ولا `extra_id` في `extras`: نفس مبدأ «بلا عمود داخلي».
-- ----------------------------------------------------------------------------
create or replace function public.quote_public(
  p_distance_km   numeric,
  p_passengers    integer,
  p_round_trip    boolean,
  p_waiting_hours numeric,
  p_origin_lat    numeric,
  p_origin_lng    numeric,
  p_dest_lat      numeric,
  p_dest_lng      numeric,
  p_coupon_code   text default null,
  p_luggage       integer default 0,
  p_extras        jsonb default null
)
returns table (
  class_slug            text,
  class_title           text,
  capacity              integer,
  total                 numeric,
  base_fee              numeric,
  distance_cost         numeric,
  waiting_cost          numeric,
  round_trip_applied    boolean,
  peak_applied          boolean,
  min_applied           boolean,
  discount_applied      boolean,
  discount_code         text,
  discount_amount       numeric,
  discount_clamped      boolean,
  discount_rejection    text,
  total_before_discount numeric,
  extras_total          numeric,
  extras                jsonb,
  ride_total            numeric
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_code    text;
  v_q       record;
  v_d       record;
  v_x_total numeric := 0;
  v_x_json  jsonb   := '[]'::jsonb;
begin
  v_code := public.discount_normalize_code(p_coupon_code);

  -- ── 🔒 معامل الكوبون ممنوع على أدوار المتصفح — الحاجز في الدالة لا في المسار ──
  --
  -- التسعير بلا رمز يبقى مفتوحاً للزائر كما كان منذ 0012 (الموقع يسعّر قبل
  -- الدخول). أما **الرمز** فيحوّل هذه الدالة إلى عرّافَين لمن يملك مفتاح anon
  -- المنشور في حزمة المتصفح:
  --   (أ) عرّاف وجود: `not-found` مقابل `class-not-eligible`/`below-min-total`/
  --       `exhausted`/`floor-guard` يفرّق الرمزَ الحقيقي عن الوهمي.
  --   (ب) عرّاف تكلفة: حين تقلّص الأرضيةُ الخصمَ يصير
  --       `total_before_discount − discount_amount = greatest(التكلفة + الأرضية, min_price)`
  --       بالجنيه بالضبط — وهو الاستنتاج العكسي الذي بُنيت 0011 كلها لإغلاقه.
  if v_code is not null
     and coalesce(nullif(current_setting('role', true), ''), '') in ('anon', 'authenticated')
     and not public.is_admin() then
    raise exception 'التحقق من رمز الخصم يمر بمسار الخادم وحده'
      using hint = 'forbidden';
  end if;

  -- (0031) الخدمات تُسعَّر **قبل** رفع علم الأرقام الداخلية: لا تقرأ شيئاً
  -- داخلياً، وإبقاؤها خارج الكتلة المحروسة يبقي نافذة العلم أضيق ما يمكن.
  select
    coalesce(sum(x.line_total), 0),
    coalesce(
      jsonb_agg(jsonb_build_object(
        'slug',      x.slug,
        'title',     x.title,
        'qty',       x.qty,
        'unitPrice', x.unit_price,
        'lineTotal', x.line_total
      )),
      '[]'::jsonb
    )
    into v_x_total, v_x_json
  from public.price_extras(p_extras) x;

  -- بلا رمز: لا حاجة إلى أي رقم داخلي، فلا يُرفع العلم أصلاً
  if v_code is not null then
    perform set_config('tours.pricing_internals', 'on', true);
  end if;

  begin
    for v_q in
      select
        q.class_slug,
        q.class_title,
        q.capacity,
        q.total,
        -- في مسار المتعهد يكون distance_cost صفراً وbase_fee هو المبلغ كله؛
        -- نوزّعه على بندَي العرض نفسيهما حتى لا يميّز العميل مصدر السعر.
        case when q.distance_cost = 0 and q.base_fee > 0
             then round(least(q.base_fee * 0.2, q.base_fee), 2)
             else q.base_fee
        end as base_fee,
        case when q.distance_cost = 0 and q.base_fee > 0
             then round(q.base_fee - least(q.base_fee * 0.2, q.base_fee), 2)
             else q.distance_cost
        end as distance_cost,
        q.waiting_cost,
        q.round_trip_applied,
        q.peak_applied,
        q.min_applied,
        q.subcontractor_cost
      from public.quote_price(
        p_distance_km, p_passengers, p_round_trip, p_waiting_hours,
        p_origin_lat, p_origin_lng, p_dest_lat, p_dest_lng,
        p_luggage
      ) q
      order by q.capacity asc
    loop
      class_slug         := v_q.class_slug;
      class_title        := v_q.class_title;
      capacity           := v_q.capacity;
      base_fee           := v_q.base_fee;
      distance_cost      := v_q.distance_cost;
      waiting_cost       := v_q.waiting_cost;
      round_trip_applied := v_q.round_trip_applied;
      peak_applied       := v_q.peak_applied;
      min_applied        := v_q.min_applied;

      total_before_discount := v_q.total;

      if v_code is null then
        total              := v_q.total;
        discount_applied   := false;
        discount_code      := null;
        discount_amount    := 0;
        discount_clamped   := false;
        discount_rejection := null;
      else
        -- 🔒 الهاتف لا يُمرَّر من المسار العام: شاشة العروض بلا هاتف، وسقف
        -- العميل يُفرض في redeem_coupon داخل معاملة الحجز حيث الهاتف معروف.
        --
        -- ⚠⚠ الوسيط الثاني `v_q.total` = **إجمالي الرحلة وحده** بلا خدمات (ف٩).
        select * into v_d
        from public.apply_discount(v_code, v_q.total, v_q.class_slug, v_q.subcontractor_cost, null);

        total              := v_d.total_after;
        discount_applied   := v_d.applied;
        discount_code      := case when v_d.applied then v_code else null end;
        discount_amount    := v_d.amount;
        discount_clamped   := v_d.clamped;
        discount_rejection := case
          when v_d.rejection in ('not-found', 'expired', 'not-started') then 'not-found'
          else v_d.rejection
        end;
      end if;

      -- (0031) ★ الخدمات آخر شيء: بعد الذروة وبعد الخصم معاً
      ride_total   := total;
      extras_total := v_x_total;
      extras       := v_x_json;
      total        := total + v_x_total;

      return next;
    end loop;
  exception
    when others then
      perform set_config('tours.pricing_internals', '', true);
      raise;
  end;

  perform set_config('tours.pricing_internals', '', true);
  return;
end;
$$;

comment on function public.quote_public(
  numeric, integer, boolean, numeric, numeric, numeric, numeric, numeric, text, integer, jsonb
) is 'واجهة التسعير العامة — أعمدة العرض وحقول الخصم وتفصيل الخدمات. لا هوية متعهد ولا تكلفة ولا هامش ولا معرّف خدمة في نوع الإرجاع. total = ride_total + extras_total، و`apply_discount` تستلم إجمالي الرحلة وحده فلا يخصم الكوبون خدمةً ولا تعدّ الأرضيةُ إيرادَ الخدمات هامشاً (قرار بدر ب). ⚠ معامل الكوبون مرفوض حين يكون دور الاتصال anon أو authenticated (غير مشرف).';

-- 🔒 (ف١) إسقاط التوقيع التساعي صراحةً
drop function if exists public.quote_public(
  numeric, integer, boolean, numeric, numeric, numeric, numeric, numeric, text
);

revoke all on function public.quote_public(
  numeric, integer, boolean, numeric, numeric, numeric, numeric, numeric, text, integer, jsonb
) from public, anon, authenticated;
grant execute on function public.quote_public(
  numeric, integer, boolean, numeric, numeric, numeric, numeric, numeric, text, integer, jsonb
) to anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.quote_public(numeric, integer, boolean, numeric, numeric, numeric, numeric, numeric, text, integer, jsonb) to service_role';
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- (١١) `create_booking` — ثلاثة أوسطة جديدة **في الآخر**
--
-- ⚠ (ف٢/ف٣) المواضع ١٧-١٩ بقيم افتراضية، ولا شيء ينزاح: الدالة تُنادى **بالموضع**
-- في ٤٤ موضع اختبار، والوسيط ١٥ هو الوسم `'…_FIXTURE'` الذي تُنظّف به كل الملفات
-- صفوفها. وسيطٌ جديد في موضع أبكر ⇒ الوسم يذهب إلى وسيطٍ آخر ⇒ صفوف الاختبار
-- تبقى في القاعدة والفحص الختامي يرمي بلا تفسير. نفس ما فعلته 0024 بالوسيط ١٦.
--
-- الترتيب داخلها:
--   ١) تحقق تاريخ العودة **في SQL** (ف٧: `p_pickup_at` بلا أي تحقق هنا اليوم).
--   ٢) الانتظار = **الأكبر** من المطلوب والمشتق، لا الاستبدال.
--   ٣) الحقائب ⇒ `quote_price` ⇒ فئة غير مؤهلة = `class-unavailable` كما اليوم.
--   ٤) التسعير والخصم **كما هو حرفياً**.
--   ٥) الخدمات: مجموعها يُضاف إلى `total` **بعد** الخصم، وسطورها تُدرَج بعد الحجز.
--   ٦) العربون والمتبقي من `total` النهائي.
--   ٧) اللقطة تكتسب أربعة مفاتيح — ولا تكلفة ولا هامش ولا معرّف خدمة (ف٦).
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
  p_notes             text,
  p_coupon_code       text default null,
  p_return_at         timestamptz default null,
  p_luggage           integer default 0,
  p_extras            jsonb default null
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
  v_code        text;
  v_disc        record;
  v_kind        text;
  v_total       numeric;
  v_margin      numeric;
  v_disc_json   jsonb := 'null'::jsonb;
  -- 0031
  v_luggage     integer;
  v_derived     numeric;
  v_derived_won boolean := false;
  v_x_total     numeric := 0;
  v_x_rows      jsonb   := '[]'::jsonb;
begin
  -- (أ) تطهير المدخلات النصية
  v_name     := nullif(btrim(coalesce(p_customer_name, '')), '');
  v_phone    := nullif(btrim(coalesce(p_customer_phone, '')), '');
  v_whatsapp := nullif(btrim(coalesce(p_customer_whatsapp, '')), '');
  v_slug     := nullif(btrim(coalesce(p_class_slug, '')), '');
  v_plan     := lower(nullif(btrim(coalesce(p_plan, '')), ''));
  v_code     := public.discount_normalize_code(p_coupon_code);

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

    v_total := v_disc.total_after;
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
    'extrasTotal',    v_x_total
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

  id               := v_id;
  reference        := v_reference;
  public_token     := v_token;
  total            := v_total;
  amount_due       := v_due;
  amount_remaining := v_remaining;
  currency         := v_currency;
  return next;
end;
$$;

-- 🔒 (ف١) إسقاط التوقيع السداسي عشر صراحةً — بقاؤه مع الجديد يوقع في
-- «function is not unique» على كل نداء بستة عشر معاملاً.
drop function if exists public.create_booking(
  jsonb, jsonb, integer, boolean, numeric, numeric, numeric,
  text, text, text, text, text, text, timestamptz, text, text
);

comment on function public.create_booking(
  jsonb, jsonb, integer, boolean, numeric, numeric, numeric,
  text, text, text, text, text, text, timestamptz, text, text,
  timestamptz, integer, jsonb
) is 'إنشاء الحجز: يتحقق من تاريخ العودة، ويشتق منه ساعات الانتظار (الأكبر من المطلوب والمشتق)، ويعيد حساب السعر من quote_price بأهلية مزدوجة (ركاب وحقائب)، ثم يطبّق الخصم على **إجمالي الرحلة وحده**، ثم يضيف الخدمات كطبقة أخيرة ويجمّد سطورها في booking_extras. total المخزَّن = بعد الخصم + الخدمات، والعربون نسبةٌ منه.';

-- 🔒 د١ (0009) بلا إضعاف: إنشاء الحجز لعميل الخدمة وحده
revoke all on function public.create_booking(
  jsonb, jsonb, integer, boolean, numeric, numeric, numeric,
  text, text, text, text, text, text, timestamptz, text, text,
  timestamptz, integer, jsonb
) from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.create_booking(
               jsonb, jsonb, integer, boolean, numeric, numeric, numeric,
               text, text, text, text, text, text, timestamptz, text, text,
               timestamptz, integer, jsonb) to service_role';
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- (١٢) `dispatch_ceiling` — قرارٌ لم تُملِه المواصفة، ويفرض القرار (ب) نصّاً
--
-- العقد يقول حرفياً: «سقف موجة البث (`dispatch_ceiling`) **لا يتسع** بقيمة
-- الخدمات فلا يقبل متعهداً أغلى بمالٍ ليس هامشاً أصلاً» (`lib/extras-types.ts`).
-- وفي مسار التعريفة (بلا مرجع تكلفة) السقف اليوم = `total − أرضية الهامش`
-- (‏0013:312) — و`total` صار يحوي الخدمات، فكان السقف سيتسع بـ٤٠٠ جنيه كرسيَّي
-- أطفال ويقبل متعهداً أغلى بـ٤٠٠ مقابل خدمةٍ **ننفّذها نحن** ولا يراها أصلاً.
--
-- الإصلاح سطرٌ واحد: يُطرح مجموع `booking_extras` من الأساس. وهو **هوية تامة**
-- لكل حجز قائم (لا سطور ⇒ صفر)، فلا يتغير رقمٌ واحد في أي اختبار بث.
-- بقية الجسم كما في 0013 حرفياً.
-- ----------------------------------------------------------------------------
create or replace function public.dispatch_ceiling(p_booking_id uuid, p_round integer)
returns numeric
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_b      record;
  v_cfg    record;
  v_base   numeric;
  v_widen  numeric;
  v_extras numeric;
begin
  select b.total, b.price_source, b.subcontractor_cost, b.margin_amount
    into v_b
  from public.bookings b
  where b.id = p_booking_id;

  if not found then
    return null;
  end if;

  select * into v_cfg from public.dispatch_config();

  -- 0031: إيراد الخدمات ليس هامشاً — يخرج من أساس السقف قبل أي حساب
  select coalesce(sum(be.line_total), 0) into v_extras
  from public.booking_extras be
  where be.booking_id = p_booking_id;

  if v_b.subcontractor_cost is not null and coalesce(v_b.price_source, '') = 'subcontractor' then
    -- مسار المتعهد: الأساس تكلفته والتوسعة من الهامش المخزَّن — وكلاهما لا يمسّه
    -- إيراد الخدمات أصلاً، فلا طرح هنا.
    v_base  := v_b.subcontractor_cost;
    v_widen := greatest(coalesce(v_b.margin_amount, 0) - v_cfg.min_margin_amount, 0);
  else
    -- حجز بلا مرجع تكلفة: السقف هو ما يبقي أرضية الهامش سليمة — من **سعر الرحلة**
    v_base  := greatest(coalesce(v_b.total, 0) - v_extras - v_cfg.min_margin_amount, 0);
    v_widen := 0;
  end if;

  return round(v_base + case when coalesce(p_round, 1) <= 1 then 0 else v_widen end, 2);
end;
$$;

comment on function public.dispatch_ceiling(uuid, integer) is
  'سقف الموجة. (0031: إيراد الخدمات الإضافية يُطرح من أساس مسار التعريفة — الخدمات ليست هامشاً ولا يراها المتعهد أصلاً، فلا يجوز أن تشتري له سقفاً أعلى.) بقية القاعدة كما في 0013.';

-- المنح كما تركتها 0014 بالضبط: **لا منح لأحد** — لا دور مستخدم ولا عميل خدمة.
-- الدالة تُستدعى من داخل `dispatch_pool` و`dispatch_broadcast` (‏security definer)
-- فتعمل بهوية المالك، ومنحُها لعميل الخدمة توسيعٌ بلا قارئ.
revoke all on function public.dispatch_ceiling(uuid, integer) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- (١٣) فحص ذاتي بعد التنفيذ — **كل فحص سالب يسبقه شاهد إيجابي** (‏0025 §٦)
-- ----------------------------------------------------------------------------
do $$
declare
  v_missing text;
  v_n       integer;
  v_src     text;
  v_probe   text;
  v_qty     integer;
  v_line    numeric;
  v_hours   numeric;
  v_id      uuid;
begin
  -- (١٣-١) الكائنات موجودة
  select string_agg(x.rel, '، ') into v_missing
  from (values ('public.extra_services'), ('public.booking_extras')) as x(rel)
  where to_regclass(x.rel) is null;

  if v_missing is not null then
    raise exception '0031: كائنات ناقصة بعد التنفيذ: %', v_missing;
  end if;

  -- (١٣-٢) الدوال بتواقيعها الحرفية كما في lib/extras-types.ts (شاهد إيجابي لكل ما بعده)
  select string_agg(x.sig, '، ') into v_missing
  from (values
    ('public.public_extras()'),
    ('public.price_extras(jsonb)'),
    ('public.derive_waiting_hours(timestamptz, timestamptz)'),
    ('public.quote_price(numeric, integer, boolean, numeric)'),
    ('public.quote_price(numeric, integer, boolean, numeric, integer)'),
    ('public.quote_price(numeric, integer, boolean, numeric, numeric, numeric, numeric, numeric, integer)'),
    ('public.quote_public(numeric, integer, boolean, numeric, numeric, numeric, numeric, numeric, text, integer, jsonb)'),
    ('public.create_booking(jsonb, jsonb, integer, boolean, numeric, numeric, numeric, text, text, text, text, text, text, timestamptz, text, text, timestamptz, integer, jsonb)')
  ) as x(sig)
  where to_regprocedure(x.sig) is null;

  if v_missing is not null then
    raise exception '0031: دوال ناقصة بعد التنفيذ: %', v_missing;
  end if;

  -- (١٣-٣) 🔒 لا تعدد تواقيع — العدّ **بالاسم** لا بالتوقيع (درس 0030 §٥-أ:
  --        `'f(args)'::regprocedure` لا يُحلّ إلا إلى ما تفترضه، فيؤكّد نفسه).
  --
  -- ⚠ `quote_price` **ثلاث** لا اثنتان: التاسعة + الخماسي (المنفذ الصحيح بلا
  --   إحداثيات) + الرباعي (توافقٌ يمرر صفراً — القسم ٩ ومبرره هناك).
  select count(*)::integer into v_n
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'quote_price';
  if v_n <> 3 then
    raise exception '0031: quote_price موجودة % مرة والمتوقع ٣ (التاسعة + الخماسي + الرباعي) — نداءٌ ما سيفشل بـ «function is not unique»', v_n;
  end if;

  select count(*)::integer into v_n
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'quote_public';
  if v_n <> 1 then
    raise exception '0031: quote_public موجودة % مرة والمتوقع ١ — التوقيع القديم لم يُسقَط', v_n;
  end if;

  select count(*)::integer into v_n
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'create_booking';
  if v_n <> 1 then
    raise exception '0031: create_booking موجودة % مرة والمتوقع ١ — التوقيع القديم لم يُسقَط', v_n;
  end if;

  -- وبالاسم الصريح للتواقيع المُسقَطة، كي تقول الرسالة أيّها بقي
  if to_regprocedure('public.quote_price(numeric, integer, boolean, numeric, numeric, numeric, numeric, numeric)') is not null then
    raise exception '0031: التوقيع الثماني لـ quote_price ما زال موجوداً';
  end if;
  if to_regprocedure('public.quote_public(numeric, integer, boolean, numeric, numeric, numeric, numeric, numeric, text)') is not null then
    raise exception '0031: التوقيع التساعي لـ quote_public ما زال موجوداً';
  end if;
  if to_regprocedure('public.create_booking(jsonb, jsonb, integer, boolean, numeric, numeric, numeric, text, text, text, text, text, text, timestamptz, text, text)') is not null then
    raise exception '0031: التوقيع السداسي عشر لـ create_booking ما زال موجوداً';
  end if;

  -- (١٣-٤) عمود الحقائب موجود و not null وله default
  select count(*)::integer into v_n
  from pg_attribute a
  where a.attrelid = 'public.vehicle_classes'::regclass
    and a.attname = 'luggage_capacity'
    and a.attnum > 0 and not a.attisdropped
    and a.attnotnull
    and a.atthasdef;
  if v_n <> 1 then
    raise exception '0031: luggage_capacity غير موجود أو بلا not null/default — الفئات ستخرج من الأهلية أو تفشل الهجرة على صفوف قائمة';
  end if;

  -- والأهلية المزدوجة فعلاً داخل quote_price — شاهد إيجابي للمسبار أولاً
  v_src := pg_get_functiondef(to_regprocedure(
    'public.quote_price(numeric, integer, boolean, numeric, numeric, numeric, numeric, numeric, integer)')::oid);
  if position('vc.capacity >= b.passengers' in coalesce(v_src, '')) = 0 then
    raise exception '0031: مسبار مصدر quote_price معطّل — لا تصدّق ما بعده';
  end if;
  if position('vc.luggage_capacity >= b.luggage' in v_src) = 0 then
    raise exception '0031: أهلية الحقائب ليست داخل quote_price — الواجهة ستعرض فئةً يرفضها الحجز';
  end if;
  -- ولم تُمسّ معادلة الهامش (قرار بدر أ)
  if position('q.pre_peak - q.row_waiting_cost - q.applied_cost' in v_src) = 0 then
    raise exception '0031: معادلة الهامش في quote_price تغيّرت — نقضٌ لـ D-11 ولقرار «الخدمة طبقة بعد الذروة»';
  end if;

  -- (١٣-٥) 🔒 (ف٩) `apply_discount` تستلم إجمالي **الرحلة** لا ما بعد الخدمات
  v_src := pg_get_functiondef(to_regprocedure(
    'public.quote_public(numeric, integer, boolean, numeric, numeric, numeric, numeric, numeric, text, integer, jsonb)')::oid);
  if position('apply_discount(' in coalesce(v_src, '')) = 0 then
    raise exception '0031: مسبار مصدر quote_public معطّل — لا تصدّق ما بعده';
  end if;
  if position('apply_discount(v_code, v_q.total,' in v_src) = 0 then
    raise exception '0031: quote_public لم تعد تمرّر إجمالي الرحلة إلى apply_discount — الكوبون يخصم الخدمات والأرضية تعدّها هامشاً';
  end if;

  v_src := pg_get_functiondef(to_regprocedure(
    'public.create_booking(jsonb, jsonb, integer, boolean, numeric, numeric, numeric, text, text, text, text, text, text, timestamptz, text, text, timestamptz, integer, jsonb)')::oid);
  if position('apply_discount(' in coalesce(v_src, '')) = 0 then
    raise exception '0031: مسبار مصدر create_booking معطّل — لا تصدّق ما بعده';
  end if;
  if position('apply_discount(v_code, v_offer.total,' in v_src) = 0 then
    raise exception '0031: create_booking لم تعد تمرّر إجمالي الرحلة إلى apply_discount (ف٩)';
  end if;
  -- (ف٦) 🔒 اللقطة `trip` تخرج **كاملة** إلى anon عبر `get_booking_by_token`،
  --      فيُقتطع نصّ بنائها وحده ويُفتَّش عمّا لا يجوز أن يكون فيه. والاقتطاع
  --      لازم: المصدر كله يحوي `extraId` مشروعاً في تجميع سطور booking_extras،
  --      ففحصُه كاملاً كان سينذر بالباطل — أو الأسوأ، يُضبط ليصمت دائماً.
  --      ⚠ الموضع يُفحص صراحةً: `substring(s from 0)` تُرجع النصّ **كاملاً** لا
  --      فراغاً، فحارسٌ يفحص الفراغ وحده كان سيمرّ على اقتطاعٍ فاشل بنتيجة مقلوبة.
  v_n := position('v_trip := jsonb_build_object(' in coalesce(v_src, ''));
  if v_n = 0 then
    raise exception '0031: تعذّر العثور على نص لقطة trip في مصدر create_booking — المسبار أعمى فلا تصدّق ما بعده';
  end if;
  v_probe := substring(v_src from v_n);
  v_n := position(');' in v_probe);
  if v_n = 0 then
    raise exception '0031: تعذّر تحديد نهاية لقطة trip — المسبار أعمى';
  end if;
  v_probe := substring(v_probe for v_n);

  -- شاهد إيجابي: الاقتطاع صحيح فعلاً (يرى المفتاح الجديد ومفتاحاً قديماً معاً)
  if position('''extrasTotal''' in v_probe) = 0
     or position('''originLat''' in v_probe) = 0 then
    raise exception '0031: اقتطاع لقطة trip لا يرى مفاتيحها — المسبار معطّل';
  end if;

  if position('''extraId''' in v_probe) > 0
     or position('marginAmount' in v_probe) > 0
     or position('v_margin' in v_probe) > 0
     or position('subcontractor' in v_probe) > 0
     or position('v_offer' in v_probe) > 0 then
    raise exception '0031: لقطة trip اكتسبت حقلاً داخلياً (تكلفة أو هامش أو معرّف خدمة) — وهي تخرج كاملة إلى anon عبر get_booking_by_token';
  end if;

  -- (١٣-٦) `price_extras` تقصّ على max_qty وتأخذ من التكرار الأكبر
  --         — اختبار حقيقي داخل معاملة فرعية تُلغى بعده
  begin
    insert into public.extra_services (slug, title, price, max_qty, active)
    values ('zz-0031-selfcheck', 'فحص ذاتي 0031', 100, 2, true)
    returning id into v_id;

    select x.qty, x.line_total into v_qty, v_line
    from public.price_extras(
      '[{"slug":"zz-0031-selfcheck","qty":5},{"slug":"zz-0031-selfcheck","qty":1}]'::jsonb
    ) x;

    -- شاهد إيجابي: الدالة ترى الخدمة المفعّلة أصلاً
    if v_qty is null then
      raise exception '0031: price_extras لم تُرجع صفاً لخدمة مفعّلة — المسبار أعمى';
    end if;
    if v_qty <> 2 then
      raise exception '0031: price_extras لم تقصّ الكمية على max_qty (الناتج % والمتوقع ٢)', v_qty;
    end if;
    if v_line <> 200 then
      raise exception '0031: line_total ≠ سعر الوحدة × الكمية المقصوصة (الناتج % والمتوقع ٢٠٠)', v_line;
    end if;

    -- والمُطفأة لا تُسعَّر
    update public.extra_services set active = false where id = v_id;
    select count(*)::integer into v_n
    from public.price_extras('[{"slug":"zz-0031-selfcheck","qty":1}]'::jsonb) x;
    if v_n <> 0 then
      raise exception '0031: price_extras سعّرت خدمة مُطفأة';
    end if;

    raise exception 'rollback-selfcheck-0031';
  exception
    when others then
      if sqlerrm <> 'rollback-selfcheck-0031' then
        raise;
      end if;
  end;

  -- (١٣-٧) `derive_waiting_hours`: صفر ليوم آخر، وقيمة موجبة لنفس اليوم، وسقف ١٢
  v_hours := public.derive_waiting_hours(
    timestamptz '2026-09-01 09:00:00+02', timestamptz '2026-09-01 12:30:00+02');
  if v_hours <> 4 then
    raise exception '0031: derive_waiting_hours لنفس اليوم أرجعت % والمتوقع ٤ (٣٫٥ ساعة تُقرَّب لأعلى)', v_hours;
  end if;

  v_hours := public.derive_waiting_hours(
    timestamptz '2026-09-01 22:00:00+02', timestamptz '2026-09-02 02:00:00+02');
  if v_hours <> 0 then
    raise exception '0031: derive_waiting_hours ليوم آخر أرجعت % والمتوقع صفراً', v_hours;
  end if;

  v_hours := public.derive_waiting_hours(
    timestamptz '2026-09-01 06:00:00+03', timestamptz '2026-09-01 23:00:00+03');
  if v_hours <> 12 then
    raise exception '0031: سقف MAX_DERIVED_WAITING_HOURS لم يُفرض — أرجعت % والمتوقع ١٢', v_hours;
  end if;

  v_hours := public.derive_waiting_hours(null, timestamptz '2026-09-01 12:00:00+02');
  if v_hours <> 0 then
    raise exception '0031: derive_waiting_hours بلا انطلاق أرجعت % والمتوقع صفراً', v_hours;
  end if;

  -- (١٣-٨) 🔒 الصلاحيات — شاهد إيجابي (ما يجب أن يعمل) قبل كل منع
  if exists (select 1 from pg_roles where rolname = 'anon') then
    if not has_function_privilege('anon', 'public.public_extras()', 'execute') then
      raise exception '0031: الزائر لا ينفّذ public_extras — الكتالوج لن يظهر في شاشة الحجز';
    end if;
    if not has_function_privilege('anon', 'public.price_extras(jsonb)', 'execute') then
      raise exception '0031: الزائر لا ينفّذ price_extras';
    end if;
    if not has_function_privilege('anon', 'public.quote_public(numeric, integer, boolean, numeric, numeric, numeric, numeric, numeric, text, integer, jsonb)', 'execute') then
      raise exception '0031: الزائر لا ينفّذ quote_public — التسعير العام تعطّل';
    end if;
    if not has_function_privilege('anon', 'public.derive_waiting_hours(timestamptz, timestamptz)', 'execute') then
      raise exception '0031: الزائر لا ينفّذ derive_waiting_hours — شاشة الحجز لن تعرض الساعات المشتقة';
    end if;

    -- والممنوع فعلاً ممنوع
    if has_function_privilege('anon', 'public.create_booking(jsonb, jsonb, integer, boolean, numeric, numeric, numeric, text, text, text, text, text, text, timestamptz, text, text, timestamptz, integer, jsonb)', 'execute')
       or has_function_privilege('authenticated', 'public.create_booking(jsonb, jsonb, integer, boolean, numeric, numeric, numeric, text, text, text, text, text, text, timestamptz, text, text, timestamptz, integer, jsonb)', 'execute') then
      raise exception '0031: create_booking عادت متاحة لدور عام — نقضٌ لـ د١ (0009)';
    end if;
    if has_function_privilege('anon', 'public.quote_price(numeric, integer, boolean, numeric, numeric, numeric, numeric, numeric, integer)', 'execute')
       or has_function_privilege('authenticated', 'public.quote_price(numeric, integer, boolean, numeric, numeric, numeric, numeric, numeric, integer)', 'execute') then
      raise exception '0031: التوقيع التاسع لـ quote_price متاح لدور عام — يكشف مسار المتعهد وتكلفته';
    end if;

    -- (١٣-٩) الجداول: الزائر بلا أي صلاحية، والفخ الحقيقي TRUNCATE (لا تخضع لـ RLS)
    select count(*)::integer into v_n
    from (values ('public.extra_services'), ('public.booking_extras')) as t(rel)
    cross join (values ('select'), ('insert'), ('update'), ('delete'),
                       ('truncate'), ('references'), ('trigger')) as p(priv)
    where has_table_privilege('anon', t.rel, p.priv);
    if v_n > 0 then
      raise exception '0031: الزائر يملك % صلاحية على جداول الخدمات — راجع كتلة revoke', v_n;
    end if;
  end if;

  -- (١٣-١٠) 🔒 لا insert على اللقطة لأي دور مستخدم — المنفذ create_booking وحدها.
  --          وشاهد إيجابي أولاً: المشرف يقرأها (وإلا كسرنا شاشة الطلب).
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    if not has_table_privilege('authenticated', 'public.booking_extras', 'select') then
      raise exception '0031: اللوحة لا تقرأ booking_extras — تفصيل الخدمات لن يظهر في شاشة الطلب';
    end if;
    select count(*)::integer into v_n
    from (values ('insert'), ('update'), ('delete'), ('truncate')) as p(priv)
    where has_table_privilege('authenticated', 'public.booking_extras', p.priv);
    if v_n > 0 then
      raise exception '0031: booking_extras قابلة للكتابة من دور مستخدم (% صلاحية) — اللقطة المجمَّدة تصير قابلة لإعادة الكتابة', v_n;
    end if;
  end if;

  -- (١٣-١١) سقف الموجة لا يتسع بإيراد الخدمات (قرار بدر ب)
  v_src := pg_get_functiondef(to_regprocedure('public.dispatch_ceiling(uuid, integer)')::oid);
  if position('min_margin_amount' in coalesce(v_src, '')) = 0 then
    raise exception '0031: مسبار مصدر dispatch_ceiling معطّل — لا تصدّق ما بعده';
  end if;
  if position('v_extras' in v_src) = 0 then
    raise exception '0031: dispatch_ceiling ما زال يبني سقفه على إجمالٍ يحوي الخدمات — يشتري للمتعهد سقفاً بمالٍ ليس هامشاً';
  end if;

  raise notice '✔ 0031: كتالوج الخدمات ولقطته · الخدمات طبقةٌ بعد الذروة والخصم · الأهلية صارت ركاباً وحقائب · الانتظار يُشتق من تاريخ العودة بسقف ١٢ · لا تعدد تواقيع · سقف الموجة لا يتسع بإيراد الخدمات';
end;
$$;
