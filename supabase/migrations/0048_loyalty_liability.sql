-- ============================================================================
-- 0048 — التزام النقاط القائم: الرقم الذي بلا مصدر
--
-- ── العيب ───────────────────────────────────────────────────────────────────
--
-- شحنت 0047 محرّك الولاء، وشحنت شاشةُ `/admin/loyalty` بطاقةَ **الالتزام** —
-- وهي أهم رقم في الشاشة: كم جنيهاً تدين به المنصة لعملائها في صورة نقاط. لكن
-- الاطّلاع الذي تقرأ منه (`v_loyalty_liability`) **لم يوجد قط**.
--
-- 🔎 وما يستحق التسجيل أن الشاشة **لم تكذب**: امتنع كاتبها عن ضرب النقاط في
-- قيمتها داخل TypeScript — وهو أسهل حلٍّ وأسوأه — لأنه يصنع **مصدراً ثانياً
-- للرقم نفسه** (النمط ٨، و**D-05**: الحساب المالي في القاعدة والواجهة تنسّق).
-- فعرضت حالةً صريحة «وصلت النقاط ولم تصل قيمتها». وهذا الملف يُنهي الحالة
-- بإيجاد المصدر، لا بالالتفاف عليه.
--
-- ── ولماذا اطّلاعٌ لا دالة ─────────────────────────────────────────────────
--
-- لأن الأسطح الاثني عشر القائمة كلها اطلاعات `v_*`، وقارئ الشاشة يناديها
-- بـ`supabase.from(...)` كبقيّتها. ودالةٌ هنا تعني نمطَ نداءٍ ثالثاً في الشاشة
-- نفسها بلا مكسب.
--
-- 🔒 و`security_invoker = true` كالاثني عشر: الاطّلاع **يرث** سياسة
-- `loyalty_accounts_select_admin`، فلا يفتح للمتعهد ولا للعميل ما لا يفتحه
-- الجدول تحته. والقاعدة الأم تجعل هذا لازماً لا زائداً: المتعهد والعميل كلاهما
-- `authenticated`، وللدور منحةُ `select` على الجدول — **فالحارس هو السياسة**،
-- ولو كان الاطّلاع `security definer` (وهو الافتراضي في Postgres!) لقرأ كلُّ
-- صاحب جلسة التزامَ المنصة كاملاً.
-- ============================================================================

create or replace view public.v_loyalty_liability
with (security_invoker = true) as
select
  coalesce(sum(a.points_balance), 0)::bigint                       as points_outstanding,
  count(*) filter (where a.points_balance > 0)::integer            as accounts_with_points,
  -- 🔒 الضرب هنا وحده: قيمة النقطة من الإعدادات لا من الواجهة (D-05)
  round(coalesce(sum(a.points_balance), 0) * s.currency_per_point, 2)::numeric(14, 2)
                                                                    as liability_amount,
  s.currency_per_point,
  s.enabled                                                         as system_enabled
from public.loyalty_settings s
left join public.loyalty_accounts a on true
group by s.currency_per_point, s.enabled;

comment on view public.v_loyalty_liability is
  'التزام النقاط القائم بالجنيه — مصدرٌ واحد للرقم، يرث سياسة الإدارة على loyalty_accounts';

revoke all on public.v_loyalty_liability from public, anon;
grant select on public.v_loyalty_liability to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- فحص ذاتي — يفشل بصوت، ويمسبر مسباره أولاً
-- ----------------------------------------------------------------------------

do $$
declare
  v_n        integer;
  v_liab     numeric;
  v_pts      bigint;
  v_invoker  text;
begin
  -- (٠) مسبار المسبار: لو لم يوجد الاطّلاع فلا معنى لما بعده
  select count(*) into v_n from information_schema.views
   where table_schema = 'public' and table_name = 'v_loyalty_liability';
  if v_n <> 1 then
    raise exception '0048: الاطّلاع لم يُنشأ — لا تصدّق أي تأكيد بعده';
  end if;

  -- (أ) 🔒 security_invoker مضبوط — وهذا **ليس** افتراض Postgres
  select array_to_string(c.reloptions, ',') into v_invoker
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'v_loyalty_liability';
  if coalesce(v_invoker, '') not like '%security_invoker=true%' then
    raise exception
      '0048: الاطّلاع بلا security_invoker — يقرأ بهوية مالكه فيتخطّى سياسة الإدارة';
  end if;

  -- (ب) الزائر لا يقرأ
  if has_table_privilege('anon', 'public.v_loyalty_liability', 'select') then
    raise exception '0048: anon يقرأ التزام النقاط';
  end if;

  -- (ج) الحساب صحيح — يُقاس بصفٍّ مزروع داخل معاملة فرعية تُرجَع
  begin
    insert into public.loyalty_accounts (phone_norm, points_balance)
    values ('01000000000', 12345)
    on conflict (phone_norm) do update set points_balance = 12345;

    select points_outstanding, liability_amount into v_pts, v_liab
      from public.v_loyalty_liability;

    if v_pts < 12345 then
      raise exception '0048: مجموع النقاط لا يرى الصفَّ المزروع (%)', v_pts;
    end if;
    -- 12345 نقطة × 0.02 = 246.90 — والمقارنة على القيمة لا على وجود المفتاح
    if v_liab <> round(v_pts * (select currency_per_point from public.loyalty_settings), 2) then
      raise exception '0048: قيمة الالتزام لا تساوي النقاط × قيمة النقطة (% مقابل %)',
        v_liab, v_pts;
    end if;

    raise exception 'zz-0048-rollback';
  exception
    when others then
      if sqlerrm <> 'zz-0048-rollback' then raise; end if;
  end;

  -- (د) وصفرُ الحسابات يُخرج صفراً لا صفراً من الصفوف — البطاقة تعرض «٠» لا فراغاً
  select count(*) into v_n from public.v_loyalty_liability;
  if v_n <> 1 then
    raise exception '0048: الاطّلاع أخرج % صفاً لا صفاً واحداً — البطاقة ستفرغ', v_n;
  end if;

  raise notice '✔ 0048: التزام النقاط بمصدرٍ واحد، يرث سياسة الإدارة، ولا يقرؤه زائر';
end;
$$;
