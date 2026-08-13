-- ============================================================
-- 0012 — واجهة تسعير عامة لا تحمل الأرقام الداخلية أصلاً
--
-- سبب الوجود: بعد 0011 صار التوقيع الثماني للتسعير محجوباً عن anon، فاضطر
-- `/api/quote` لاستخدام عميل الخدمة — وهذا يُضعف الدفاع: عميل الخدمة يرى
-- الأعمدة الداخلية (هوية المتعهد وتكلفته والهامش) ويبقى إخفاؤها معتمداً على
-- سطر واحد في TypeScript. سطر واحد يُنسى.
--
-- الحل: `quote_public` — دالة تُرجع أعمدة العرض العشرة فقط. الأرقام الداخلية
-- ليست في نوع الإرجاع إطلاقاً، فتسريبها مستحيل بنيوياً لا بالانضباط.
--
-- وبالمناسبة تُعالَج بصمة المسار: كان مسار المتعهد يُرجع distance_cost = 0
-- دائماً بينما مسار التعريفة يُرجع رقماً — فيميّز العميل مصدر السعر. هنا
-- يُعرض التفصيل بالشكل نفسه في المسارين (رسم أساسي + باقي المبلغ) ومجموعهما
-- واحد لا يتغير.
-- ============================================================

create or replace function public.quote_public(
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
  min_applied        boolean
)
language sql
stable
security definer
set search_path = ''
as $$
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
    q.min_applied
  from public.quote_price(
    p_distance_km, p_passengers, p_round_trip, p_waiting_hours,
    p_origin_lat, p_origin_lng, p_dest_lat, p_dest_lng
  ) q;
$$;

comment on function public.quote_public(
  numeric, integer, boolean, numeric, numeric, numeric, numeric, numeric
) is 'واجهة التسعير العامة — أعمدة العرض وحدها. لا هوية متعهد ولا تكلفة ولا هامش في نوع الإرجاع.';

revoke all on function public.quote_public(
  numeric, integer, boolean, numeric, numeric, numeric, numeric, numeric
) from public;

grant execute on function public.quote_public(
  numeric, integer, boolean, numeric, numeric, numeric, numeric, numeric
) to anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.quote_public(numeric, integer, boolean, numeric, numeric, numeric, numeric, numeric) to service_role';
  end if;
end $$;

do $$
begin
  raise notice '✔ 0012_quote_public: واجهة تسعير عامة بلا أرقام داخلية';
end $$;
