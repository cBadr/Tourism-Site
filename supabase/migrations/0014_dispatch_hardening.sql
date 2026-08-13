-- ============================================================
-- 0014 — تصليب البث: سقف الموجة، وحارس الصلاحية، والخصوصية، وأرضية الهامش
--
-- من مراجعتَي المرحلة ٦ النقديتين:
--  (١) [حرج] سقف الموجة ١ كان يساوي **سعر العميل كاملاً** لأي حجز بلا مرجع
--      تكلفة (مسعَّر بالتعريفة، أو حجز قديم تلتقطه شبكة أمان الـ tick) — أي
--      أن متعهداً بتكلفة تساوي السعر يُعرض عليه الطلب في الموجة الأولى فيذهب
--      الهامش كله تلقائياً وبلا علم أحد. الأصل أن يُشتق مرجع التكلفة من سياسة
--      الهامش نفسها، وأن يبقى السقف دون الإجمالي دائماً.
--  (٢) [مهم] `manual_assign` بلا أي فحص لأرضية الهامش، بينما ثلاث شاشات في
--      اللوحة تُخبر المشغّل أن الرفض «مفروض في قاعدة البيانات».
--  (٣) [مهم] `dispatch_ops_allowed` تفشل **مفتوحة**: من لا هوية له يُمنح كامل
--      صلاحيات التشغيل. وهي الحارس الوحيد على البث والإسناد اليدوي.
--  (٤) [مهم] `dispatch_public_label` تُرجع الوسم الخام حين تكون كل مقاطعه
--      مرقَّمة ⇒ عنوان الالتقاط الدقيق يصل لكل متعهد **قبل** القبول.
--  (٥) [مهم] `accept_offer` لا تعيد التحقق من أن المتعهد ما زال معتمداً ⇒
--      متعهد موقوف يفوز برحلة ويكشف اسم العميل ورقمه.
--  (٦) [مهم] `dispatch_broadcast` تكتب الحالة بلا شرط ⇒ يمكن إعادة فتح دورة
--      مُسندة وسلب الفائز رحلته.
-- ============================================================

-- ----------------------------------------------------------------------------
-- (١) سقف الموجة — لا يبلغ سعر العميل أبداً
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
  v_m      record;
  v_base   numeric;
  v_widen  numeric;
begin
  select b.total, b.price_source, b.subcontractor_cost, b.margin_amount
    into v_b
  from public.bookings b
  where b.id = p_booking_id;

  if not found then
    return null;
  end if;

  select * into v_cfg from public.dispatch_config();

  if v_b.subcontractor_cost is not null and coalesce(v_b.price_source, '') = 'subcontractor' then
    -- مرجع تكلفة حقيقي من قائمة أسعار: السقف هو التكلفة، ويتسع بالهامش لاحقاً
    v_base  := v_b.subcontractor_cost;
    v_widen := greatest(coalesce(v_b.margin_amount, 0) - v_cfg.min_margin_amount, 0);
  else
    -- بلا مرجع تكلفة (تسعير بالتعريفة): نشتق التكلفة الضمنية من سياسة الهامش
    -- نفسها — الهامش موجود داخل السعر أصلاً، فطرحه يعطي حداً معقولاً للتكلفة.
    -- الخطأ الذي كان: اعتبار السعر كله سقفاً، فيصير الهامش صفراً في الموجة ١.
    select ps.margin_type, ps.margin_value, ps.margin_min_amount
      into v_m
    from public.pricing_settings ps
    where ps.id;

    if v_m.margin_type = 'fixed' then
      v_base := coalesce(v_b.total, 0) - greatest(coalesce(v_m.margin_value, 0),
                                                  coalesce(v_m.margin_min_amount, 0));
    else
      v_base := coalesce(v_b.total, 0) / (1 + coalesce(v_m.margin_value, 20) / 100);
      -- أرضية الهامش تعلو على النسبة حين تكون أكبر
      v_base := least(v_base, coalesce(v_b.total, 0) - coalesce(v_m.margin_min_amount, 0));
    end if;

    v_base  := greatest(v_base, 0);
    v_widen := greatest(coalesce(v_b.total, 0) - v_cfg.min_margin_amount - v_base, 0);
  end if;

  -- ثابت لا يُخرق: السقف يبقى دون الإجمالي بمقدار أرضية الهامش على الأقل
  v_base  := least(v_base, greatest(coalesce(v_b.total, 0) - v_cfg.min_margin_amount, 0));
  v_widen := least(v_widen, greatest(coalesce(v_b.total, 0) - v_cfg.min_margin_amount - v_base, 0));

  return round(v_base + case when coalesce(p_round, 1) <= 1 then 0 else v_widen end, 2);
end;
$$;

revoke all on function public.dispatch_ceiling(uuid, integer) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- (٣) حارس التشغيل يفشل **مغلقاً**: يثبت الثقة ولا يفترضها
-- ----------------------------------------------------------------------------
create or replace function public.dispatch_ops_allowed()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid  uuid;
  v_role text;
begin
  if public.is_admin() then
    return true;
  end if;

  begin
    v_uid := auth.uid();
  exception
    when others then
      v_uid := null;
  end;

  -- هوية مستخدم حاضرة وليست مشرفاً ⇒ رفض مهما كان مستخدم قاعدة البيانات.
  -- هذا هو الترتيب الصحيح: الهوية تسبق سياق الاتصال، وإلا صار متعهدٌ يمر
  -- لمجرد أن التطبيق متصل بمستخدم مالك.
  if v_uid is not null then
    return false;
  end if;

  -- بلا هوية: لا يُسمح إلا للسياقات الخادمية الموثوقة صراحةً
  begin
    v_role := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role';
  exception
    when others then
      v_role := null;
  end;

  if coalesce(v_role, '') = 'service_role' then
    return true;
  end if;

  -- الترحيلات والاختبارات وmحرر SQL: اتصال مباشر بمالك القاعدة وبلا هوية
  if current_user in ('postgres', 'supabase_admin') then
    return true;
  end if;

  return false;
end;
$$;

-- دالة داخلية بحتة: تُستدعى من داخل الدوال المالكة، ولا تُمنح لأي دور مستخدم
-- (منحها لـ authenticated يعطي المتعهد أداة استكشاف لصلاحيات التشغيل بلا داعٍ)
revoke all on function public.dispatch_ops_allowed() from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.dispatch_ops_allowed() to service_role';
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- (٤) الوسم العام لا يعود خاماً أبداً — العنوان الدقيق ليس «أفضل من لا شيء»
-- ----------------------------------------------------------------------------
create or replace function public.dispatch_public_label(p_label text)
returns text
language sql
immutable
set search_path = ''
as $$
  with src as (
    select btrim(coalesce(p_label, '')) as raw
  ),
  parts as (
    select btrim(t.part) as part, t.ord
    from src
    cross join lateral regexp_split_to_table(src.raw, '\s*[,،]\s*')
      with ordinality as t(part, ord)
  ),
  kept as (
    select p.part, p.ord
    from parts p
    where p.part <> '' and p.part !~ '[0-9٠-٩]'
  ),
  -- كل المقاطع مرقَّمة؟ نُسقط الكلمات الحاملة للأرقام من آخر مقطع بدل إرجاع الخام
  scrubbed as (
    select btrim(regexp_replace(
             regexp_replace(
               (select p.part from parts p order by p.ord desc limit 1),
               '[^[:space:]]*[0-9٠-٩][^[:space:]]*', '', 'g'
             ),
             '\s+', ' ', 'g'
           )) as part
  )
  select coalesce(
    nullif((select string_agg(k.part, '، ' order by k.ord) from kept k), ''),
    nullif((select s.part from scrubbed s), '')
    -- ولا fallback ثالث: عرضٌ بلا وسم مكان نتيجة صحيحة، والعنوان الدقيق ليس كذلك
  );
$$;

comment on function public.dispatch_public_label(text) is
  'وسم مكان عام — يُسقط المقاطع والكلمات المرقَّمة، ويُرجع NULL بدل الوسم الخام إن لم يبقَ وصف.';

-- ----------------------------------------------------------------------------
-- (٦) البث لا يعيد فتح دورة مُسندة أو ملغاة
--
-- مُشغّل حارس بدل تعديل جسم الدالة: أي مسار كتابة (الدالة، أو محرر SQL، أو
-- دالة مستقبلية سهت عن الشرط) يُمنع من إعادة دورة مُغلقة إلى البث. الدرس نفسه
-- المطبَّق على حالات الحجز في 0007: القاعدة في الجدول لا في الدالة وحدها.
-- ----------------------------------------------------------------------------
create or replace function public.dispatches_guard_reopen()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if old.status in ('assigned', 'cancelled')
     and new.status = 'broadcasting' then
    raise exception 'لا يمكن إعادة فتح دورة إسناد % — الرحلة أُسندت أو أُلغيت', old.status
      using hint = 'dispatch-closed';
  end if;
  return new;
end;
$$;

drop trigger if exists dispatches_guard_reopen on public.dispatches;
create trigger dispatches_guard_reopen
  before update on public.dispatches
  for each row execute function public.dispatches_guard_reopen();

-- ----------------------------------------------------------------------------
-- (٥) لا يفوز متعهد غير معتمد — القاعدة في الجدول لتغطي كل مسارات الكتابة
-- ----------------------------------------------------------------------------
create or replace function public.trip_offers_guard_accept()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  if new.status = 'accepted' and coalesce(old.status, '') is distinct from 'accepted' then
    select s.status into v_status
    from public.subcontractors s
    where s.id = new.subcontractor_id;

    if coalesce(v_status, '') <> 'approved' then
      raise exception 'حساب المتعهد غير معتمد — لا يمكن إسناد رحلة إليه'
        using hint = 'forbidden';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trip_offers_guard_accept on public.trip_offers;
create trigger trip_offers_guard_accept
  before insert or update on public.trip_offers
  for each row execute function public.trip_offers_guard_accept();

-- ----------------------------------------------------------------------------
-- (٢) أرضية الهامش مفروضة فعلاً في قاعدة البيانات
--
-- ثلاث شاشات في اللوحة تَعِد المشغّل بأن الرفض «مفروض في قاعدة البيانات»؛ ولم
-- يكن كذلك. تُفرض هنا على كل إسناد (تلقائي أو يدوي): مستحق المتعهد لا يترك
-- هامشاً أقل من الأرضية. ولتجاوزها عمداً يخفض المشرف الأرضية من إعدادات
-- الإسناد — قرار صريح ومسجَّل، لا استثناء صامت داخل نموذج.
-- ----------------------------------------------------------------------------
create or replace function public.dispatches_guard_margin()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_total  numeric;
  v_floor  numeric;
  v_margin numeric;
begin
  if new.assigned_payout is null
     or new.assigned_payout is not distinct from coalesce(old.assigned_payout, -1) then
    return new;
  end if;

  select b.total into v_total from public.bookings b where b.id = new.booking_id;
  select c.min_margin_amount into v_floor from public.dispatch_config() c;

  v_margin := coalesce(v_total, 0) - new.assigned_payout;

  -- تجاوز صريح: رؤية المشروع تنص على أن التعويض قرار بشري لمدير التشغيل،
  -- فيبقى ممكناً — لكن بقرار مقصود يمر من `manual_assign_with_loss` ويُسجَّل
  -- في ملاحظة الإسناد، لا بصمت داخل نموذج.
  if coalesce(nullif(current_setting('tours.allow_margin_loss', true), ''), 'off') = 'on' then
    return new;
  end if;

  if v_margin < coalesce(v_floor, 0) then
    raise exception 'المستحق % يترك هامشاً % وهو دون الأرضية % — عدّل المستحق أو اخفض الأرضية من إعدادات الإسناد',
      round(new.assigned_payout, 2), round(v_margin, 2), coalesce(v_floor, 0)
      using hint = 'margin-floor';
  end if;

  return new;
end;
$$;

drop trigger if exists dispatches_guard_margin on public.dispatches;
create trigger dispatches_guard_margin
  before insert or update on public.dispatches
  for each row execute function public.dispatches_guard_margin();

-- إسناد يدوي بخسارة معلومة — دالة منفصلة عمداً: الاسم نفسه يجعل القرار ظاهراً
-- في سجل الاستدعاءات وفي كود الواجهة، ولا يمكن أن يقع «بالخطأ» من النموذج العادي.
create or replace function public.manual_assign_with_loss(
  p_booking_id       uuid,
  p_subcontractor_id uuid,
  p_payout           numeric,
  p_note             text
)
returns table (
  booking        uuid,
  partner        uuid,
  payout_amount  numeric,
  revoked_offers integer
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not public.dispatch_ops_allowed() then
    raise exception 'الإسناد اليدوي متاح للمشرف فقط' using hint = 'forbidden';
  end if;

  if coalesce(btrim(p_note), '') = '' then
    raise exception 'الإسناد بخسارة يتطلب تدوين السبب' using hint = 'note-required';
  end if;

  perform set_config('tours.allow_margin_loss', 'on', true);
  return query
    select * from public.manual_assign(p_booking_id, p_subcontractor_id, p_payout, p_note);
end;
$$;

revoke all on function public.manual_assign_with_loss(uuid, uuid, numeric, text)
  from public, anon, authenticated;
grant execute on function public.manual_assign_with_loss(uuid, uuid, numeric, text) to authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.manual_assign_with_loss(uuid, uuid, numeric, text) to service_role';
  end if;
end $$;

do $$
begin
  raise notice '✔ 0014_dispatch_hardening: سقف الموجة والحارس والخصوصية وأرضية الهامش';
end $$;
