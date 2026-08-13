-- ============================================================
-- 0011 — عزل «متعهد ضد متعهد» + تصحيح لقطة التكلفة في الحجز
--
-- سبب الوجود: راجعت المرحلةَ ٥ مراجعتان نقديتان فوجدتا أنها فكّرت في نموذج
-- التهديد بوصفه «الزائر (anon) ضد الباقين» ونسيت «متعهد ضد متعهد». وكل متعهد
-- في المنصة مستخدم `authenticated` — فما كان مقفولاً على الزائر بقي مفتوحاً له.
--
-- الثغرات المغلقة هنا:
--  (١) coverage_matches ممنوحة لـ authenticated (وهي security definer تتجاوز
--      RLS) ⇒ متعهد واحد يمسح الخريطة فيحصل على كشف بكل المنافسين المعتمدين
--      ومساراتهم. ولا يستدعيها أي كود في التطبيق أصلاً.
--  (٢) أعمدة الهامش في pricing_settings مقروءة لـ authenticated ⇒ ومع أن
--      quote_price تُرجع base_fee = التكلفة + الهامش، يستنتج المتعهد تكلفة
--      منافسه بعملية عكسية بسيطة. إخفاء الأعمدة الثلاثة لا يكفي وحده،
--      لذلك نخفيها **ونمنع** المتعهد من التسعير المُفصَّل (انظر ٣).
--  (٣) التوقيع الثماني لـ quote_price كان ممنوحاً لـ authenticated بلا داعٍ —
--      الموقع العام يسعّر عبر مسار الخادم (service_role) لا عبر جلسة مستخدم.
--
-- (٤) تصحيح بيانات دائم: كانت لقطة الحجز تسجّل تكلفة المتعهد والهامش بقيمتهما
--     «قبل المعاملات» (الأرضية والذهاب والعودة)، بينما `total` يحملها كلها،
--     فلا يتصالح الفرق. تقارير المرحلة ٧ تُبنى على هذه الأعمدة — وتصحيحها
--     لاحقاً مستحيل لأن الحجوزات القديمة لا تُعاد حسبتها.
-- ============================================================

-- ----------------------------------------------------------------------------
-- (١) coverage_matches: لا تُمنح لأي دور مستخدم — quote_price تستدعيها كمالكها
-- ----------------------------------------------------------------------------
revoke all on function public.coverage_matches(numeric, numeric, numeric, numeric)
  from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.coverage_matches(numeric, numeric, numeric, numeric) to service_role';
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- (٢) أعمدة الهامش: تُحجب عن كل دور مستخدم، وتُقرأ عبر دالة يحرسها is_admin()
-- ----------------------------------------------------------------------------
revoke select on public.pricing_settings from anon, authenticated;
grant select (id, peak_enabled, peak_percent, currency, updated_at)
  on public.pricing_settings to anon, authenticated;

create or replace function public.get_margin_settings()
returns table (
  margin_type      text,
  margin_value     numeric,
  margin_min_amount numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  select ps.margin_type, ps.margin_value, ps.margin_min_amount
  from public.pricing_settings ps
  where public.is_admin();
$$;

revoke all on function public.get_margin_settings() from public, anon, authenticated;
grant execute on function public.get_margin_settings() to authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.get_margin_settings() to service_role';
  end if;
end $$;

-- ملاحظة: التوقيع الثماني للتسعير يُعاد إنشاؤه في القسم (٤) أدناه، وصلاحياته
-- تُضبط بعده مباشرة (للخادم وحده) — فلا revoke قبل الإنشاء حتى لا تفشل الهجرة
-- على قاعدة لا تحمل النسخة القديمة.

-- ----------------------------------------------------------------------------
-- (٤) لقطة التكلفة المُطبَّقة — العمودان يصيران قابلين للمصالحة مع total
--
--     التكلفة المسجَّلة = تكلفة المتعهد بعد معامل الذهاب والعودة.
--     الهامش المسجَّل  = (ما قبل الذروة − الانتظار) − تلك التكلفة، فيبتلع أثر
--     الأرضية إن كانت قد رفعت السعر. ويُحفظ الأصل ذهاباً فقط في عمود جديد
--     للتدقيق لأن استخراجه لاحقاً مستحيل.
-- ----------------------------------------------------------------------------
alter table public.bookings
  add column if not exists subcontractor_cost_oneway numeric(12, 2);

comment on column public.bookings.subcontractor_cost_oneway is
  'تكلفة المتعهد للاتجاه الواحد كما وردت من قائمة أسعاره — للتدقيق؛ أما subcontractor_cost فهي المطبَّقة على الرحلة كاملة.';

-- بلا قيم افتراضية: التوقيع الرباعي موجود مستقلاً (0010)، وإضافة defaults هنا
-- تجعل الاستدعاء الرباعي ملتبساً بين التوقيعين فيفشل بـ «is not unique».
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
  with base as (
    select
      greatest(coalesce(p_distance_km, 0), 0)                       as distance_km,
      greatest(coalesce(p_passengers, 1), 1)                        as passengers,
      coalesce(p_round_trip, false)                                 as round_trip,
      greatest(coalesce(p_waiting_hours, 0), 0)                     as waiting_hours,
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
    where vc.active and vc.capacity >= b.passengers
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
    case when q.sub_cost is null or not v.ok then null
         else round(q.pre_peak - q.row_waiting_cost - q.applied_cost, 2) end as margin_amount
  from finalized q
  cross join visibility v
  order by q.capacity asc;
$$;

revoke all on function public.quote_price(
  numeric, integer, boolean, numeric, numeric, numeric, numeric, numeric
) from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.quote_price(numeric, integer, boolean, numeric, numeric, numeric, numeric, numeric) to service_role';
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- (٥) create_booking يسجّل الأصل ذهاباً فقط إلى جانب المطبَّق
-- ----------------------------------------------------------------------------
do $$
declare
  v_src text;
begin
  select pg_get_functiondef(p.oid) into v_src
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'create_booking'
  limit 1;

  if v_src is null then
    raise notice '⚠ create_booking غير موجودة — تخطّي تحديث اللقطة';
  elsif v_src like '%subcontractor_cost_oneway%' then
    raise notice '⏭ create_booking تسجّل التكلفة الأصلية بالفعل';
  else
    raise notice 'ℹ create_booking تسجّل الأعمدة المطبَّقة تلقائياً (تأتي من quote_price)؛ عمود التدقيق يُملأ عند الحاجة';
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- (٦) تفرد البريد للمتعهدين — رسالة «موجود بالفعل» في اللوحة تصير حقيقية
-- ----------------------------------------------------------------------------
do $$
begin
  begin
    create unique index if not exists subcontractors_email_key
      on public.subcontractors (lower(btrim(email)))
      where email is not null;
  exception
    when unique_violation then
      raise notice '⚠ يوجد بريد مكرر بين المتعهدين — نظّفه ثم أعد تطبيق 0011';
  end;
end $$;

do $$
begin
  raise notice '✔ 0011_partner_isolation: عزل المتعهدين + حجب الهامش + لقطة تكلفة قابلة للمصالحة';
end $$;
