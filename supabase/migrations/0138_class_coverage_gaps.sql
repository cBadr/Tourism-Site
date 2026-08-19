-- ============================================================================
-- 0138 — فئةٌ تُباع ولا يغطيها متعهد: تُقال للمشرف، ولا تُخفى عن العميل
--
-- 🔴 المقيس 2026-08-19 على القاعدة الحيّة:
--
--   sedan     مركبات=0 · مساراتٌ مُسعَّرة=0
--   suv       مركبات=1 · مساراتٌ مُسعَّرة=100
--   minibus   مركبات=1 · مساراتٌ مُسعَّرة=49
--   bus       مركبات=0 · مساراتٌ مُسعَّرة=0
--
-- أي أن **كلَّ حجزِ سيدان أو باص يسقط إلى الطابور اليدوي حتماً** — لا لعيبٍ في
-- البثّ بل لأن `dispatch_pool` تشترط مركبةً نشطة من الفئة عند متعهدٍ معتمَد،
-- ولا واحدةَ منهما موجودة. والسيدانُ أرخصُ الفئات، أي أنها **أوّلُ ما يختاره
-- أكثرُ العملاء**.
--
-- ── ولماذا لا تُخفى الفئة من العرض العام ─────────────────────────────────────
--
-- كان الخياران: إخفاءُ ما لا يغطيه أحد، أو إعلانُه للمشرف. والإخفاءُ مرفوضٌ
-- لثلاثة أسباب مقيسة:
--
--   ١) التسعيرُ بالتعريفة **يعمل**: راكبٌ واحد ⇒ `sedan = 1860` سعرٌ صحيحٌ
--      كامل. فالإخفاءُ يمنع بيعاً ممكناً لا بيعاً مستحيلاً.
--   ٢) الطابورُ اليدوي **مسارٌ مصمَّمٌ لا عطل**: `dispatch_pool` تُرجع فراغاً
--      فيمضي الحجز إلى الإسناد اليدوي، وهو ما يفعله المالك اليوم فعلاً.
--   ٣) والإخفاءُ **يُخفي المشكلة عن صاحبها**: لو اختفت السيدان من الموقع لما
--      عرف المالكُ أبداً أن عليه ضمَّ متعهدٍ يملكها. الرقمُ الظاهر يدفع للتعاقد،
--      والصفحةُ الصامتة تُخدِّر.
--
-- ⇒ فالقرار: **الفئةُ تبقى معروضةً للعميل، وتُعلَن فجوتُها للمشرف بالرقم.**
--
-- ولا شيء في هذه الهجرة يغيّر تسعيراً ولا بثّاً ولا صلاحية — دالةُ قراءةٍ واحدة.
-- ============================================================================

-- ── دالةُ القراءة ────────────────────────────────────────────────────────────
--
-- 🔴 لماذا `security definer` مع أن الجداول مقروءة: العدُّ يمرّ على
-- `subcontractors` و`subcontractor_vehicles` و`price_lists` معاً، وسياساتُ
-- الصفوف على هذه الثلاثة تحصر المتعهدَ في صفوفه. فبهوية `authenticated` عاديةٍ
-- كان العدُّ سيُرجع **تغطيةَ المتعهد نفسِه** لا تغطيةَ المنصة — رقمٌ صحيحٌ
-- المظهر وكاذبُ المعنى. والحارسُ في الجسم: `is_admin()` وحده.
create or replace function public.class_coverage_gaps()
returns table (
  class_slug   text,
  class_title  text,
  capacity     integer,
  vehicles     integer,
  priced_routes integer,
  covered      boolean
)
language plpgsql
stable
security definer
set search_path to ''
as $$
begin
  if not public.is_admin() then
    raise exception 'قراءة تغطية الفئات متاحة للمشرف وحده'
      using hint = 'forbidden';
  end if;

  return query
  select
    vc.slug,
    vc.title,
    vc.capacity,
    (
      select count(*)::integer
      from public.subcontractor_vehicles v
      join public.subcontractors s on s.id = v.subcontractor_id
      where v.class_slug = vc.slug
        and v.active
        and s.status = 'approved'
    ) as veh,
    (
      select count(distinct pl.id)::integer
      from public.price_list_items i
      join public.price_lists pl on pl.id = i.price_list_id
      join public.subcontractors s on s.id = pl.subcontractor_id
      where i.class_slug = vc.slug
        and pl.status = 'approved'
        and s.status = 'approved'
    ) as rts,
    -- 🔴 التغطيةُ **شرطان معاً** لا أحدهما: `dispatch_pool` تشترط مركبةً نشطة
    -- من الفئة **و**تكلفةً من قائمةٍ معتمدة تُطابق الممرّ. فمتعهدٌ يملك المركبة
    -- ولم يُسعّر لا يصله عرض، ومَن سعّر ولا يملكها كذلك. وشرطٌ واحدٌ هنا كان
    -- سيقول «مغطّاة» عن فئةٍ لا يصلها بثٌّ أبداً.
    (
      exists (
        select 1
        from public.subcontractor_vehicles v
        join public.subcontractors s on s.id = v.subcontractor_id
        where v.class_slug = vc.slug and v.active and s.status = 'approved'
      )
      and exists (
        select 1
        from public.price_list_items i
        join public.price_lists pl on pl.id = i.price_list_id
        join public.subcontractors s on s.id = pl.subcontractor_id
        where i.class_slug = vc.slug and pl.status = 'approved' and s.status = 'approved'
      )
    ) as cov
  from public.vehicle_classes vc
  where vc.active
  order by vc.sort nulls last, vc.slug;
end;
$$;

comment on function public.class_coverage_gaps() is
  'تغطيةُ كل فئةٍ نشطة: مركباتٌ نشطة لدى متعهدين معتمَدين، ومساراتٌ مُسعَّرة معتمدة. '
  'وفئةٌ بلا أحدهما تُباع بالتعريفة وتسقط إلى الإسناد اليدوي حتماً. للمشرف وحده.';

-- ── الصلاحيات: القاعدة ١٦ ومنحةُ Supabase الافتراضية ────────────────────────
--
-- ⚠ `alter default privileges` في Supabase تمنح `anon` و`authenticated`
-- صلاحية EXECUTE على كل دالةٍ جديدة. فالسحبُ صريحٌ وإلا صارت الدالةُ
-- `security definer` مفتوحةً لكل زائر — وهي تكشف بنيةَ أسطول المنصة كلِّه.
-- 🔴 والمنحةُ لـ`authenticated` **بقصد**، لا سهواً: اللوحة تعمل بهذا الدور،
-- والحارسُ الحقيقيّ هو `is_admin()` في الجسم لا قائمةُ المنَح (D-20 — كلُّ متعهدٍ
-- `authenticated` كذلك). وهو نمطُ `review_price_list` و`admin_partner_presence`
-- نفسه. والمسحوبُ `anon` و`public`: الزائرُ لا يسأل عن بنية الأسطول.
revoke all on function public.class_coverage_gaps() from public, anon;
grant execute on function public.class_coverage_gaps() to authenticated, service_role;

-- ── فحصٌ ذاتيّ: الهجرة تُثبت أثرها بنفسها ───────────────────────────────────
do $$
declare
  v_rows integer;
  v_anon boolean;
  v_auth boolean;
begin
  select count(*) into v_rows from public.vehicle_classes where active;
  if v_rows = 0 then
    raise exception '0138: لا فئةَ نشطة — الدالة ستُرجع فراغاً بلا معنى';
  end if;

  select has_function_privilege('anon', 'public.class_coverage_gaps()', 'execute'),
         has_function_privilege('authenticated', 'public.class_coverage_gaps()', 'execute')
    into v_anon, v_auth;
  if v_anon then
    raise exception '0138: الزائر يستطيع قراءة تغطية الأسطول';
  end if;
  if not v_auth then
    raise exception '0138: اللوحة تعمل بدور authenticated — بلا منحةٍ له لا يقرؤها المشرف نفسه';
  end if;

  raise notice '✔ 0138: class_coverage_gaps على % فئة نشطة · anon مسحوب · authenticated ممنوح والحارس is_admin() في الجسم', v_rows;
end;
$$;
