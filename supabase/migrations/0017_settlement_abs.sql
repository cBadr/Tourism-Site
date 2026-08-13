-- ============================================================
-- 0017 — إضافة `abs_net_due` إلى عرض المقاصة
--
-- شاشتا المقاصة والكشف تقرآن العمود بالفعل («توفّره الـ view إن وُجد») ثم
-- تشتقّانه في TypeScript عند غيابه — وهو غائب. اسمٌ يشير إلى عمود غير موجود
-- يتعفّن، والاشتقاق في الواجهة يخالف قاعدة المشروع (كل حساب في Postgres).
-- إضافته هنا تجعل الترتيب بالقيمة المطلقة يتم في قاعدة البيانات أيضاً.
--
-- ملاحظة: الأعمدة الجديدة تُضاف في **آخر** القائمة لأن `create or replace view`
-- لا تسمح بتغيير ترتيب الأعمدة القائمة ولا أنواعها.
-- ============================================================

create or replace view public.v_partner_settlements
with (security_invoker = true)
as
select
  s.id            as subcontractor_id,
  s.company_name,
  g.earned::numeric(14, 2)    as earned,
  g.collected::numeric(14, 2) as collected,
  g.paid::numeric(14, 2)      as paid,
  (g.earned - g.collected - g.paid)::numeric(14, 2) as net_due,
  g.trips_count,
  abs(g.earned - g.collected - g.paid)::numeric(14, 2) as abs_net_due
from (
  select
    r.subcontractor_id,
    coalesce(sum(r.sign::numeric * r.amount) filter (where r.partner_kind = 'earned'), 0)    as earned,
    coalesce(sum(r.sign::numeric * r.amount) filter (where r.partner_kind = 'collected'), 0) as collected,
    coalesce(sum(r.sign::numeric * r.amount) filter (where r.partner_kind = 'paid'), 0)      as paid,
    count(distinct r.booking_id) filter (where r.partner_kind = 'earned' and r.sign = 1)     as trips_count
  from public.v_ledger_resolved r
  where r.subcontractor_id is not null and r.partner_kind is not null
  group by r.subcontractor_id
) g
join public.subcontractors s on s.id = g.subcontractor_id;

-- الصلاحيات تُعاد بعد إعادة الإنشاء (create or replace لا يفقدها، لكن نؤكدها)
revoke all on public.v_partner_settlements from public, anon;
grant select on public.v_partner_settlements to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'v_partner_settlements'
      and c.reloptions::text like '%security_invoker=true%'
  ) then
    raise exception 'v_partner_settlements فقدت security_invoker — عزل الشركاء ينهار';
  end if;
  raise notice '✔ 0017_settlement_abs: abs_net_due في العرض';
end $$;
