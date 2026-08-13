-- ============================================================================
-- 0030 — تصليب التحصيل من المتعهد بعد المراجعتين النقديتين
--
-- الهجرة 0029 مطبَّقة ولا تُعدَّل (D-03). أمسكت المراجعة الأمنية أربعة، أولها
-- **خطأٌ في المواصفة نفسها لا في تنفيذها** — أي أن الوكيل نفّذ ما طُلب منه بالضبط.
--
-- ── (١) عالٍ: `portal_balance()` تسلّم كل متعهد سقفَ الائتمان العالمي ──────────
--
-- أدرجت المواصفة `debt_limit` في نوع الإرجاع «كي تصير رسالة الحجب قابلة للتنفيذ».
-- والنتيجة أن **كل** متعهد يقرأ الرقم، لا المحجوب وحده: أثبتته المراجعة حياً
-- بجلسة متعهد غير محجوب فعاد له `debt_limit = 10000` بينما `amount_to_clear = 0`.
--
-- وهو نقضٌ من باب خلفي لما فعلته 0027 صراحة: `partner_credit_config()` سُحبت من
-- **كل** دور مستخدم لهذا السبب بعينه. ومن يعرف السقف يعرف كم يجوز له أن يحتجز
-- من مالنا إلى الأبد بلا أن يُحجب — فتتحول سياسة ائتمان إلى عتبة منشورة يجلس
-- تحتها. والسقف إعداد **عالمي**، فمتعهدٌ واحد فضولي يخبر الباقين.
--
-- ولا يُخفي هذا الإصلاحُ شيئاً عمّن يحتاجه: `amount_to_clear` يبقى، وهو وحده ما
-- يفعله المحجوب. (نعم، المحجوب يستنتج السقف من `owed − amount_to_clear`؛ وهذا
-- ثمنٌ لازم لجعل الحجب قابلاً للتنفيذ، أما غير المحجوب فلا يستنتج شيئاً.)
--
-- ── (٢) متوسط: فحصٌ ذاتي لا يمكن أن يفشل ─────────────────────────────────────
--
-- كتبت 0029 حارساً بنيوياً يمنع أن يضيف أحدٌ لاحقاً وسيطاً إلى `portal_balance`
-- فيحوّلها إلى تسريب:
--     select pr.pronargs … where pr.oid = 'public.portal_balance()'::regprocedure
-- والسلسلة `public.portal_balance()` **لا تُحلّ إلا إلى الدالة ذات الصفر وسيط**،
-- فـ`pronargs = 0` بالبناء لا بالفحص. حارسٌ يطمئنك ولا يحرس (النمط ٩ في
-- `LESSONS.md` بنصّه). الصواب: العدّ **بالاسم** لا بالتوقيع.
--
-- ── (٣+٤) متوسط: مرجع العملية إلزاميٌّ لا يُقرأ ولا يُجمَّد ─────────────────────
--
-- تفرض 0029 مرجع التحويل لغير النقدية، ومبررها المكتوب أنه «به وحده يُطابَق
-- القيد مع كشف البنك بعد شهرين». وقد ثبت أنه:
--   • لا يُقرأ في أي شاشة — `partner_statement` تعرض `b.reference` (مرجع الحجز)
--     وقيدُ التحصيل بلا حجز، فتخرج الخانة فارغة دائماً؛
--   • ويُعدَّل بعد القيد — `finance_rows_immutable` تجمّد المبلغ والحساب والمتعهد
--     ولا تمسّه.
-- فالحارس كان يشتري لا شيء. هنا يصير المرجع مقروءاً في الكشف، ومجمَّداً كبقية
-- أعمدة المال.
--
-- المرجع: مراجعتا 2026-08-14 · lib/finance-types.ts · handover/LESSONS.md النمط ٩
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (١) `portal_balance()` بلا `debt_limit`
--
-- ⚠ `drop` لا `create or replace`: تغيير مجموعة أعمدة الإرجاع لا تسمح به الثانية.
-- والإسقاط يُفقد المنح، فتُعاد بعده حرفياً.
-- ----------------------------------------------------------------------------
drop function if exists public.portal_balance();

create or replace function public.portal_balance()
returns table (
  earned          numeric,
  collected       numeric,
  paid            numeric,
  received        numeric,
  net_due         numeric,
  owed_to_us      numeric,
  blocked         boolean,
  amount_to_clear numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_sub       uuid;
  v_earned    numeric;
  v_collected numeric;
  v_paid      numeric;
  v_received  numeric;
  v_net       numeric;
  v_owed      numeric;
  v_limit     numeric;
  v_block     boolean;
begin
  v_sub := public.current_subcontractor_id();
  if v_sub is null then
    return;
  end if;

  -- ⚠ متغيّرات مفردة لا `record`: المتعهد الذي **لا قيد له في الدفتر** غائب عن
  -- العرض أصلاً (‏`join` لا `left join` منذ 0017)، و`select … into` بلا صف يترك
  -- كلاً منها `null` — فالـ `coalesce` أدناه هو ما يحوّل «بلا صف» إلى أصفار بدل
  -- بطاقة رصيد فارغة (نفس فخ الـ `join` الذي عالجه `partner_debt` في 0027)
  select ps.earned, ps.collected, ps.paid, ps.received, ps.net_due, ps.owed_to_us
    into v_earned, v_collected, v_paid, v_received, v_net, v_owed
  from public.v_partner_settlements ps
  where ps.subcontractor_id = v_sub;

  -- السقف يُقرأ للحساب **ولا يخرج**: هو سياسة ائتماننا لا رقمه.
  select c.debt_limit into v_limit from public.partner_credit_config() c;
  v_limit := coalesce(v_limit, 0);
  v_owed  := coalesce(v_owed, 0);

  -- ⚠ الحكم من `partner_over_debt_limit()` نفسها لا من معادلة مكرَّرة هنا:
  -- مصدرٌ واحد للحجب، فلا ينحرف ما يراه المتعهد عمّا يقع عليه فعلاً في البث
  v_block := public.partner_over_debt_limit(v_sub);

  earned          := coalesce(v_earned, 0);
  collected       := coalesce(v_collected, 0);
  paid            := coalesce(v_paid, 0);
  received        := coalesce(v_received, 0);
  net_due         := coalesce(v_net, 0);
  owed_to_us      := v_owed;
  blocked         := v_block;
  -- ما يكفي للنزول **تحت** السقف: الحجب عند `>=` فالقرش الواحد يفكّه
  amount_to_clear := case when v_block then round(v_owed - v_limit + 0.01, 2) else 0 end;
  return next;
end;
$$;

comment on function public.portal_balance() is
  'رصيد المتعهد الحالي كما يراه في بورتاله. النطاق داخلها عبر current_subcontractor_id() وبلا وسيط إطلاقاً. 0030: أُسقط debt_limit من الإرجاع — سياسة ائتماننا العالمية ليست من شأن المتعهد، ومن يعرفها يجلس تحتها؛ ويبقى amount_to_clear وحده وهو ما يفعله المحجوب.';

revoke all    on function public.portal_balance() from public, anon, authenticated;
grant execute on function public.portal_balance() to authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.portal_balance() to service_role';
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- (٣) تجميد مرجع العملية — امتداد للحارس المشترك
--
-- نسخة حرفية من 0029 مع فرع واحد إضافي. مساراً `expense` و`partner_payout` لا
-- يتغير فيهما حرف (كلاهما خارج شرط المرجع).
-- ----------------------------------------------------------------------------
create or replace function public.finance_rows_immutable()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_source text := tg_argv[0];
begin
  if new.amount is distinct from old.amount then
    raise exception 'مبلغ السجل المالي لا يُعدَّل — احذفه وأعد تسجيله، أو اعكس قيده'
      using hint = 'immutable-row';
  end if;

  if new.account_id is distinct from old.account_id then
    raise exception 'حساب السجل المالي لا يُعدَّل بعد القيد' using hint = 'immutable-row';
  end if;

  -- عمود المتعهد في `partner_payouts` و`partner_settlements` وحدهما، فلا يُقرأ
  -- إلا هناك (قراءة new.subcontractor_id على جدول المصروفات خطأ تنفيذ لا شرط كاذب)
  if v_source in ('partner_payout', 'partner_settlement')
     and to_jsonb(new) ->> 'subcontractor_id'
         is distinct from to_jsonb(old) ->> 'subcontractor_id' then
    raise exception 'متعهد السجل المالي لا يُعدَّل بعد القيد' using hint = 'immutable-row';
  end if;

  -- 0030: ومرجع العملية مثله. مرجعٌ يُطلب إلزاماً ثم يُعاد كتابته بعد القيد
  -- ليس مرجعاً — والمطابقة مع كشف البنك بعد شهرين هي كل سبب وجوده.
  if v_source = 'partner_settlement'
     and to_jsonb(new) ->> 'reference'
         is distinct from to_jsonb(old) ->> 'reference' then
    raise exception 'مرجع العملية لا يُعدَّل بعد القيد — احذف التحصيل وأعد تسجيله'
      using hint = 'immutable-row';
  end if;

  if new.occurred_at is distinct from old.occurred_at then
    update public.ledger_entries e
       set occurred_at = new.occurred_at
     where e.source_type = v_source
       and e.source_id   = new.id;
  end if;

  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- (٤) المرجع يظهر في كشف الحساب
--
-- نسخة 0029 حرفياً، والتغيير موضعان: انضمام إلى `partner_settlements` وقراءة
-- `coalesce(مرجع الحجز, مرجع التحويل)` في عمود المرجع. ولا يتغير نوع الإرجاع.
-- ----------------------------------------------------------------------------
create or replace function public.partner_statement(
  p_subcontractor_id uuid,
  p_from             date,
  p_to               date
)
returns table (
  occurred_at timestamptz,
  kind        text,
  reference   text,
  debit       numeric,
  credit      numeric,
  balance     numeric,
  note        text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_carry numeric := 0;
begin
  if not public.finance_admin_allowed() then
    raise exception 'كشف حساب المتعهدين متاح للإدارة فقط' using hint = 'forbidden';
  end if;

  if p_subcontractor_id is null then
    raise exception 'معرّف المتعهد مطلوب' using hint = 'invalid-input';
  end if;

  -- رصيد ما قبل الفترة (بنفس قاعدة الإشارة أدناه)
  if p_from is not null then
    select coalesce(sum(
             r.sign * r.amount
             * case when r.partner_kind in ('earned', 'received') then 1 else -1 end
           ), 0)
      into v_carry
    from public.v_ledger_resolved r
    where r.subcontractor_id = p_subcontractor_id
      and r.partner_kind is not null
      and (r.occurred_at at time zone 'Africa/Cairo')::date < p_from;
  end if;

  return query
  with lines as (
    select
      r.id                                                                    as l_id,
      r.occurred_at                                                           as l_at,
      case
        when r.origin_source = 'adjustment' then 'adjustment'
        when r.partner_kind  = 'earned'     then 'trip'
        when r.partner_kind  = 'collected'  then 'collection'
        when r.partner_kind  = 'paid'       then 'payout'
        when r.partner_kind  = 'received'   then 'settlement'
      end                                                                     as l_kind,
      -- 0030: قيد التحصيل بلا حجز، فمرجعه مرجع التحويل الذي أُلزم المشرف بكتابته
      coalesce(b.reference, ps.reference)                                     as l_ref,
      r.sign * r.amount
      * case when r.partner_kind in ('earned', 'received') then 1 else -1 end as l_signed,
      r.note                                                                  as l_note
    from public.v_ledger_resolved r
    left join public.bookings b on b.id = r.booking_id
    left join public.partner_settlements ps
      on ps.id = r.source_id
     and r.origin_source = 'partner_settlement'
    where r.subcontractor_id = p_subcontractor_id
      and r.partner_kind is not null
      and (p_from is null or (r.occurred_at at time zone 'Africa/Cairo')::date >= p_from)
      and (p_to   is null or (r.occurred_at at time zone 'Africa/Cairo')::date <= p_to)
  )
  select
    x.l_at,
    x.l_kind,
    x.l_ref,
    (case when x.l_signed < 0 then -x.l_signed else 0 end)::numeric(14,2),
    (case when x.l_signed > 0 then  x.l_signed else 0 end)::numeric(14,2),
    (v_carry + sum(x.l_signed) over (
       order by x.l_at asc, x.l_id asc
       rows between unbounded preceding and current row
     ))::numeric(14,2),
    x.l_note
  from lines x
  order by x.l_at asc, x.l_id asc;
end;
$$;

-- ----------------------------------------------------------------------------
-- (٥) فحص ذاتي — ومنه إصلاح الحارس الذي كان لا يمكن أن يفشل
-- ----------------------------------------------------------------------------
do $$
declare
  v_count integer;
  v_nargs integer;
  v_src   text;
begin
  -- (أ) 🔒 الحارس البنيوي بصيغته العاملة: العدّ **بالاسم** لا بالتوقيع.
  --     الصيغة القديمة (‏`'public.portal_balance()'::regprocedure`) لا تُحلّ إلا
  --     إلى دالة الصفر وسيط، فكانت تؤكد ما تفترضه. هذه تلتقط أي حِمل زائد يُضاف.
  select count(*), coalesce(min(p.pronargs), -1)
    into v_count, v_nargs
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'portal_balance';

  if v_count <> 1 or v_nargs <> 0 then
    raise exception
      '0030: portal_balance يجب أن تكون دالةً واحدة بلا وسائط — الموجود % دالة بأقل وسائط %',
      v_count, v_nargs;
  end if;

  -- (ب) 🔒 ولا تُرجع سقف الائتمان
  v_src := pg_get_functiondef(to_regprocedure('public.portal_balance()')::oid);
  if position('amount_to_clear' in coalesce(v_src, '')) = 0 then
    raise exception '0030: مسبار مصدر portal_balance معطّل — لا تصدّق ما بعده';
  end if;
  if position('debt_limit numeric' in v_src) > 0 then
    raise exception '0030: portal_balance ما زالت تُرجع debt_limit — سقف الائتمان بيد المتعهدين';
  end if;

  -- (ج) المرجع مقروء في الكشف ومجمَّد في الحارس
  v_src := pg_get_functiondef(to_regprocedure('public.partner_statement(uuid,date,date)')::oid);
  if position('ps.reference' in coalesce(v_src, '')) = 0 then
    raise exception '0030: كشف الحساب لا يعرض مرجع التحويل — إلزامٌ بلا قارئ';
  end if;

  v_src := pg_get_functiondef(to_regprocedure('public.finance_rows_immutable()')::oid);
  if position('''reference''' in coalesce(v_src, '')) = 0 then
    raise exception '0030: مرجع التحصيل غير مجمَّد — يُطلب إلزاماً ثم يُعاد كتابته';
  end if;

  -- (د) والمنح أُعيدت بعد الإسقاط
  if exists (select 1 from pg_roles where rolname = 'anon') then
    if has_function_privilege('anon', 'public.portal_balance()', 'execute') then
      raise exception '0030: الزائر ينفّذ portal_balance';
    end if;
    if not has_function_privilege('authenticated', 'public.portal_balance()', 'execute') then
      raise exception '0030: المتعهد لا ينفّذ portal_balance — المنح لم تُعد بعد الإسقاط';
    end if;
  end if;

  raise notice '✔ 0030: سقف الائتمان خرج من بطاقة المتعهد · الحارس البنيوي صار قابلاً للفشل · مرجع التحويل مقروء ومجمَّد';
end;
$$;
