-- ============================================================
-- 0016 — تصحيحات المقاصة والدفتر (من مراجعتَي المرحلة ٧)
--
--  (١) [حرج] «ما حصّله المتعهد نقداً» كان يُقرأ من لقطة `bookings.amount_remaining`
--      المجمَّدة لحظة إنشاء الحجز، لا من الواقع. فلو حصّلنا نحن مبلغاً إضافياً
--      قبل الرحلة (إيصال ثانٍ)، أو رُدّ إيصال، بقي القيد على الرقم القديم —
--      فيختل `net_due` في اتجاه أو آخر في **قلب** حسابات هذه المرحلة.
--      الصواب: ما لم يصل خزينتَنا فعلاً = الإجمالي − مجموع تحصيلاتنا المعتمدة.
--
--  (٢) [مهم] لا مسار لتصحيح قيد متعهد بعد اكتمال الرحلة: `completed` حالة
--      نهائية، والدفتر لا يقبل UPDATE ولا DELETE، و`record_adjustment` لا تحمل
--      متعهداً. فمستحق خاطئ يبقى في المقاصة إلى الأبد.
--
--  (٣) [مهم] حذف حساب خزينة كان يمحو تاريخه من الدفتر (`on delete set null`).
--
--  (٤) [مهم] `finance_kpis` تجمع المصروفات من جدولها لا من الدفتر، وجدولا
--      المصروفات ودفعات المتعهدين يقبلان UPDATE بلا مزامنة ⇒ رقمان مختلفان
--      لنفس الشيء في شاشة واحدة.
--
--  (٥) [مهم] إلغاء حجز مدفوع كان يعكس تحصيل العميل تلقائياً من الخزينة، فيظهر
--      الرصيد أقل من الواقع ما دام العربون محتجزاً ولم يُردّ فعلاً.
-- ============================================================

-- ----------------------------------------------------------------------------
-- (١) التحصيل النقدي للمتعهد يُشتق من الدفتر لا من اللقطة
-- ----------------------------------------------------------------------------
create or replace function public.ledger_on_booking_completed()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_d           record;
  v_act         uuid;
  v_collected   numeric;   -- ما وصل خزينتنا فعلاً (إيصالات معتمدة، صافي أي عكس)
  v_uncollected numeric;   -- ما بقي مع العميل ⇒ يقبضه المتعهد نقداً
begin
  if new.status <> 'completed' or coalesce(old.status, '') = 'completed' then
    return null;
  end if;

  select d.assigned_subcontractor_id, d.assigned_payout
    into v_d
  from public.dispatches d
  where d.booking_id = new.id;

  if not found or v_d.assigned_subcontractor_id is null then
    return null;
  end if;

  v_act := public.current_actor();

  -- (أ) المستحق — التزام بلا خزينة
  if coalesce(v_d.assigned_payout, 0) > 0
     and not exists (
       select 1 from public.ledger_entries e
       where e.source_type     = 'partner_payout'
         and e.source_id       = new.id
         and e.settlement_role = 'earned'
         and e.reverses_entry_id is null
     ) then
    insert into public.ledger_entries (
      account_id, direction, amount, occurred_at,
      source_type, source_id, subcontractor_id, booking_id,
      settlement_role, note, created_by
    )
    values (
      null, 'out', v_d.assigned_payout, now(),
      'partner_payout', new.id, v_d.assigned_subcontractor_id, new.id,
      'earned', 'مستحق تنفيذ الرحلة ' || coalesce(new.reference, ''), v_act
    );
  end if;

  -- (ب) ما قبضه نقداً = الإجمالي − ما تحصّلناه نحن فعلاً (لا اللقطة المجمَّدة)
  select coalesce(sum(r.sign * r.amount), 0)
    into v_collected
  from public.v_ledger_resolved r
  where r.booking_id = new.id
    and r.origin_source = 'payment';

  v_uncollected := greatest(coalesce(new.total, 0) - coalesce(v_collected, 0), 0);

  if v_uncollected > 0
     and not exists (
       select 1 from public.ledger_entries e
       where e.source_type = 'partner_collection'
         and e.source_id   = new.id
         and e.reverses_entry_id is null
     ) then
    insert into public.ledger_entries (
      account_id, direction, amount, occurred_at,
      source_type, source_id, subcontractor_id, booking_id,
      settlement_role, note, created_by
    )
    values (
      null, 'in', v_uncollected, now(),
      'partner_collection', new.id, v_d.assigned_subcontractor_id, new.id,
      'collected',
      'تحصيل نقدي قبضه المتعهد من العميل — رحلة ' || coalesce(new.reference, ''),
      v_act
    );
  end if;

  return null;
end;
$$;

-- ----------------------------------------------------------------------------
-- (٥) الإلغاء يعكس أرجل المتعهد وحدها؛ ردّ مال العميل قرار وحدث مستقلان
-- ----------------------------------------------------------------------------
create or replace function public.ledger_on_booking_cancelled()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_e   record;
  v_act uuid;
begin
  if new.status <> 'cancelled' or coalesce(old.status, '') = 'cancelled' then
    return null;
  end if;

  v_act := public.current_actor();

  -- أرجل المتعهد (مستحق + تحصيل نقدي) تُعكس دائماً: الرحلة لم تُنفَّذ.
  -- أما تحصيل العميل فيبقى في الخزينة لأن المال **فعلاً** فيها؛ ردّه حدث
  -- منفصل يسجَّل عند خروجه حقيقةً عبر `record_refund` — وإلا أظهر الرصيدُ
  -- نقصاً وهمياً ما دام العربون محتجزاً.
  for v_e in
    select e.*
    from public.ledger_entries e
    where e.booking_id = new.id
      and e.settlement_role is not null
      and e.reverses_entry_id is null
      and not exists (
        select 1 from public.ledger_entries x where x.reverses_entry_id = e.id
      )
  loop
    insert into public.ledger_entries (
      account_id, direction, amount, occurred_at,
      source_type, source_id, subcontractor_id, booking_id,
      settlement_role, reverses_entry_id, note, created_by
    )
    values (
      v_e.account_id,
      case when v_e.direction = 'in' then 'out' else 'in' end,
      v_e.amount, now(),
      v_e.source_type, v_e.source_id, v_e.subcontractor_id, v_e.booking_id,
      v_e.settlement_role, v_e.id,
      'قيد عكسي — أُلغيت الرحلة ' || coalesce(new.reference, ''), v_act
    );
  end loop;

  return null;
end;
$$;

-- ردّ مال للعميل — يُسجَّل عند خروج المال فعلياً من الخزينة
create or replace function public.record_refund(
  p_booking uuid,
  p_account uuid,
  p_amount  numeric,
  p_at      timestamptz,
  p_note    text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not public.finance_admin_allowed() then
    raise exception 'تسجيل الردّ متاح للمشرف وحده' using hint = 'forbidden';
  end if;
  if coalesce(p_amount, 0) <= 0 then
    raise exception 'قيمة الردّ يجب أن تكون موجبة' using hint = 'invalid-input';
  end if;
  if coalesce(btrim(p_note), '') = '' then
    raise exception 'سبب الردّ إلزامي' using hint = 'note-required';
  end if;
  if not exists (select 1 from public.payment_accounts a where a.id = p_account) then
    raise exception 'حساب الخزينة غير موجود' using hint = 'account-not-found';
  end if;

  insert into public.ledger_entries (
    account_id, direction, amount, occurred_at,
    source_type, source_id, booking_id, note, created_by
  )
  values (
    p_account, 'out', p_amount, coalesce(p_at, now()),
    'refund', p_booking, p_booking, btrim(p_note), public.current_actor()
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.record_refund(uuid, uuid, numeric, timestamptz, text)
  from public, anon, authenticated;
grant execute on function public.record_refund(uuid, uuid, numeric, timestamptz, text) to authenticated;

-- ----------------------------------------------------------------------------
-- (٢) مسار تصحيح قيود المتعهد بعد اكتمال الرحلة
-- ----------------------------------------------------------------------------
create or replace function public.reverse_ledger_entry(p_entry uuid, p_note text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_e  record;
  v_id uuid;
begin
  if not public.finance_admin_allowed() then
    raise exception 'عكس القيود متاح للمشرف وحده' using hint = 'forbidden';
  end if;
  if coalesce(btrim(p_note), '') = '' then
    raise exception 'سبب العكس إلزامي — يبقى في الدفتر مرجعاً' using hint = 'note-required';
  end if;

  select * into v_e from public.ledger_entries where id = p_entry;
  if not found then
    raise exception 'القيد غير موجود' using hint = 'not-found';
  end if;
  if v_e.reverses_entry_id is not null then
    raise exception 'لا يُعكس قيدٌ عكسي' using hint = 'invalid-input';
  end if;

  insert into public.ledger_entries (
    account_id, direction, amount, occurred_at,
    source_type, source_id, subcontractor_id, booking_id,
    settlement_role, reverses_entry_id, note, created_by
  )
  values (
    v_e.account_id,
    case when v_e.direction = 'in' then 'out' else 'in' end,
    v_e.amount, now(),
    v_e.source_type, v_e.source_id, v_e.subcontractor_id, v_e.booking_id,
    v_e.settlement_role, v_e.id, btrim(p_note), public.current_actor()
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.reverse_ledger_entry(uuid, text) from public, anon, authenticated;
grant execute on function public.reverse_ledger_entry(uuid, text) to authenticated;

-- تسوية على حساب متعهد (بلا خزينة) — لتصحيح مستحق أو تحصيل بعد الاكتمال
create or replace function public.record_partner_adjustment(
  p_sub    uuid,
  p_role   text,
  p_amount numeric,
  p_at     timestamptz,
  p_note   text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not public.finance_admin_allowed() then
    raise exception 'تسوية حساب المتعهد متاحة للمشرف وحده' using hint = 'forbidden';
  end if;
  if p_role not in ('earned', 'collected') then
    raise exception 'نوع التسوية يجب أن يكون earned أو collected' using hint = 'invalid-input';
  end if;
  if coalesce(p_amount, 0) = 0 then
    raise exception 'قيمة التسوية لا يمكن أن تكون صفراً' using hint = 'invalid-input';
  end if;
  if coalesce(btrim(p_note), '') = '' then
    raise exception 'سبب التسوية إلزامي' using hint = 'note-required';
  end if;
  if not exists (select 1 from public.subcontractors s where s.id = p_sub) then
    raise exception 'المتعهد غير موجود' using hint = 'not-found';
  end if;

  insert into public.ledger_entries (
    account_id, direction, amount, occurred_at,
    source_type, source_id, subcontractor_id,
    settlement_role, note, created_by
  )
  values (
    null,
    case
      when p_role = 'earned'  then case when p_amount > 0 then 'out' else 'in'  end
      else                          case when p_amount > 0 then 'in'  else 'out' end
    end,
    abs(p_amount), coalesce(p_at, now()),
    'adjustment', null, p_sub,
    p_role, btrim(p_note), public.current_actor()
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.record_partner_adjustment(uuid, text, numeric, timestamptz, text)
  from public, anon, authenticated;
grant execute on function public.record_partner_adjustment(uuid, text, numeric, timestamptz, text) to authenticated;

-- ----------------------------------------------------------------------------
-- (٣) حذف حساب خزينة لا يمحو تاريخه — القاعدة ترفض الحذف من أصله
-- ----------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'ledger_entries_account_id_fkey'
      and conrelid = 'public.ledger_entries'::regclass
  ) then
    alter table public.ledger_entries drop constraint ledger_entries_account_id_fkey;
  end if;

  alter table public.ledger_entries
    add constraint ledger_entries_account_id_fkey
    foreign key (account_id) references public.payment_accounts(id) on delete restrict;
exception
  when others then
    raise notice '⚠ تعذّر تشديد مفتاح حساب الدفتر: %', sqlerrm;
end $$;

-- ----------------------------------------------------------------------------
-- (٤) جدولا المصروفات ودفعات المتعهدين للقراءة والإضافة فقط — التصحيح بالعكس
-- ----------------------------------------------------------------------------
-- تُجمَّد **أعمدة المال** وحدها (المبلغ والحساب والمتعهد) لأن تعديلها يجعل
-- الجدول والدفتر يرويان روايتين. أما التاريخ والملاحظة فتصحيحهما مشروع —
-- والتاريخ يُزامَن إلى قيد الدفتر المرتبط فوراً حتى لا ينحرف تقريرٌ عن آخر.
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

  -- عمود المتعهد موجود في partner_payouts وحده، فلا يُقرأ إلا هناك
  -- (قراءة new.subcontractor_id على جدول المصروفات خطأ تنفيذ لا شرط كاذب)
  if v_source = 'partner_payout'
     and to_jsonb(new) ->> 'subcontractor_id'
         is distinct from to_jsonb(old) ->> 'subcontractor_id' then
    raise exception 'متعهد الدفعة لا يُعدَّل بعد القيد' using hint = 'immutable-row';
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

drop trigger if exists expenses_immutable on public.expenses;
create trigger expenses_immutable
  before update on public.expenses
  for each row execute function public.finance_rows_immutable('expense');

drop trigger if exists partner_payouts_immutable on public.partner_payouts;
create trigger partner_payouts_immutable
  before update on public.partner_payouts
  for each row execute function public.finance_rows_immutable('partner_payout');

do $$
begin
  raise notice '✔ 0016_finance_corrections: التحصيل من الدفتر، ومسارات التصحيح، وحماية التاريخ';
end $$;
