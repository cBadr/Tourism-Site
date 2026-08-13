-- ============================================================================
-- 0015_finance.sql — الخزينة والدفتر والمصروفات والمقاصة والتدفق النقدي
--
-- المرحلة ٧. العقد المرجعي: lib/finance-types.ts (الأنواع والتواقيع وأسماء
-- العروض والجداول) — لا انحراف عنه. والقرار الحاكم من VISION.md («المالية»):
-- الخزينة — التحصيل — المصروفات — كشف الحساب — التدفق النقدي.
--
-- ── القواعد المحاسبية الأربع التي يقوم عليها هذا الملف ──────────────────────
--
-- (١) **دفتر واحد**: كل حركة مال صف في `ledger_entries`. الأرصدة وكشوف الحساب
--     والتدفق النقدي والمؤشرات كلها مُشتقة منه، ولا تُجمَّع من `payments` أو
--     `expenses` مباشرة أبداً. ولا حساب واحد في TypeScript.
--
-- (٢) **الالتواء المميِّز لهذا النشاط**: العميل يدفع عرباناً ويسلّم الباقي نقداً
--     للسائق (المتعهد). فالمتعهد يخرج وقد قبض جزءاً من مالنا ونحن مدينون له
--     بمستحقه كاملاً:
--         صافي المقاصة = المستحق − ما حصّله نقداً − ما سبق أن دفعناه له
--     وقد يكون **سالباً** فيصير هو المدين لنا. كل عرض ودالة هنا تتعامل مع
--     الإشارتين، ولا مكان لافتراض «الاتجاه واحد».
--
-- (٣) **مستحق المتعهد التزام لا نقد**: يُقيَّد بحساب `account_id = NULL` فلا
--     يحرّك رصيد خزينة إطلاقاً، ومع ذلك يغذّي كشف الحساب والمقاصة. وكذلك
--     `partner_collection`: المال دخل جيب المتعهد لا خزينتنا.
--     ⇒ الأرصدة والتدفق النقدي يقرآن **القيود ذات الحساب وحدها**.
--
-- (٤) **لا حذف قيد أبداً**: الإلغاء والتصحيح يقعان بقيد **عاكس** يشير إلى القيد
--     الذي يعكسه عبر `reverses_entry_id`، وفهرس فريد جزئي يمنع عكس القيد مرتين.
--     الرصيد الافتتاحي يشارك في الرصيد وليس قيداً.
--
-- يُنفَّذ بعد 0007 (payments / payment_accounts / bookings / current_actor)
-- و0009 (available_payment_accounts المربوطة بالتوكن) و0010–0011 (المتعهدون
-- ولقطة التكلفة) و0013–0014 (dispatches.assigned_payout — التكلفة الحقيقية).
--
-- ⚠ الفخّان المُوثَّقان منذ 0007 ويتكرران هنا حرفياً:
--   ١) الوصول إلى جدول طبقتان: GRANT + سياسة RLS، وكلاهما مطلوب. وإعدادات
--      Supabase الافتراضية تمنح anon و authenticated **كل** شيء على أي جدول
--      جديد — وTRUNCATE لا تخضع لـ RLS. لذلك: revoke all ثم grant صريح.
--   ٢) الدوال الجديدة تولد ومعها EXECUTE ضمني لـ PUBLIC ومنح صريح لـ anon.
--      لذلك كل دالة: revoke from public, anon, authenticated ثم grant صريح.
--   ٣) وفخّ ثالث خاص بهذه المرحلة: **العروض**. عرض يملكه postgres يتجاوز RLS
--      الجداول تحته، فلو مُنح لـ authenticated لقرأ كل متعهد خزينة الشركة.
--      لذلك كل عرض هنا `security_invoker = true` — والفحص الذاتي في القسم (٩)
--      يُسقط الهجرة إن لم تُضبط الخاصية.
--
-- آمن لإعادة التنفيذ بالكامل (create table if not exists / add column if not
-- exists / drop constraint if exists / drop view if exists / create or replace).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (١) توسعة حسابات الخزينة — لا جدول حسابات موازٍ
--
-- قرار الرؤية: «كل محفظة/حساب انستا باي/نقدية/بنك = حساب خزينة». الحسابات
-- الموجودة (0007) هي عينها حسابات الخزينة، فتبقى منطقيةُ الحدود وشاشة اللوحة
-- تعمل بلا مساس. الزيادة شيئان فقط: نوعان جديدان داخليان، وعلم يفصل «ما يُعرض
-- للعميل عند الدفع» عن «ما هو خزينة داخلية».
-- ----------------------------------------------------------------------------

-- (١-١) الأنواع الخمسة — الثلاثة الأولى تستقبل من العملاء والأخيران داخليان
-- (القيد الأصلي في 0007 كان مضمّناً فاسمه التلقائي payment_accounts_kind_check)
alter table public.payment_accounts drop constraint if exists payment_accounts_kind_check;
alter table public.payment_accounts drop constraint if exists payment_accounts_kind_chk;
alter table public.payment_accounts
  add constraint payment_accounts_kind_chk
  check (kind in ('wallet', 'instapay', 'card', 'cash', 'bank'));

-- (١-٢) علم العرض للعميل — يُضاف بلا قيد أولاً ثم يُملأ ثم يُثبَّت not null،
-- فقاعدة فيها حسابات حيّة لا تفشل عليها الهجرة (نفس أسلوب أعمدة الهامش في 0010).
alter table public.payment_accounts add column if not exists customer_facing boolean;

update public.payment_accounts
   set customer_facing = true
 where customer_facing is null;

alter table public.payment_accounts alter column customer_facing set default true;
alter table public.payment_accounts alter column customer_facing set not null;

comment on column public.payment_accounts.customer_facing is
  'يظهر للعميل في صفحة التحويل؟ الافتراضي نعم (كل الحسابات القائمة قبل المرحلة ٧ كانت للعملاء). حسابات النقدية والبنك الداخلية تُنشأ بـ false.';

comment on column public.payment_accounts.opening_balance is
  'الرصيد الافتتاحي — يشارك في الرصيد ولا يُقيَّد في الدفتر (قاعدة ٥ في الرؤية).';

-- مسار قراءة الدفع: الحسابات المعروضة للعميل مرتبة
create index if not exists payment_accounts_customer_facing_idx
  on public.payment_accounts (customer_facing, active, sort);

-- (١-٣) الحسابات المتاحة للتحويل — **جراحة نقطة واحدة**
--
-- الجسم مطابق حرفياً لنسخة 0007 (نفس نوافذ اليوم/الشهر بتوقيت القاهرة، ونفس
-- شرط «المعتمدة وحدها»، ونفس ترتيب النتائج) والزيادة سطر واحد: `pa.customer_facing`.
-- ⚠ التحميل الزائد `(text, numeric)` من 0009 **لا يُمس**: هو الذي يشترط توكن حجز
-- حقيقي ما زال بانتظار الدفع، وهو يستدعي هذه الدالة فيرث الشرط الجديد تلقائياً.
-- حساب النقدية أو البنك الداخلي لا يظهر للعميل مهما كان مفعّلاً وبلا حد.
create or replace function public.available_payment_accounts(p_amount numeric)
returns table (
  id               uuid,
  kind             text,
  label            text,
  handle           text,
  holder_name      text,
  daily_headroom   numeric,
  monthly_headroom numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  with args as (
    select greatest(coalesce(p_amount, 0), 0) as amount
  ),
  used as (
    select
      pa.id as account_id,
      coalesce(sum(p.amount) filter (
        where (p.created_at at time zone 'Africa/Cairo')::date
            = (now() at time zone 'Africa/Cairo')::date
      ), 0) as used_today,
      coalesce(sum(p.amount) filter (
        where date_trunc('month', p.created_at at time zone 'Africa/Cairo')
            = date_trunc('month', now() at time zone 'Africa/Cairo')
      ), 0) as used_month
    from public.payment_accounts pa
    left join public.payments p
      on p.account_id = pa.id
     and p.status = 'approved'
    group by pa.id
  )
  select
    pa.id,
    pa.kind,
    pa.label,
    pa.handle,
    pa.holder_name,
    case when pa.daily_cap   is null then null else pa.daily_cap   - u.used_today end,
    case when pa.monthly_cap is null then null else pa.monthly_cap - u.used_month end
  from public.payment_accounts pa
  join used u on u.account_id = pa.id
  cross join args a
  where pa.active
    and pa.customer_facing            -- ← الزيادة الوحيدة في هذه الهجرة
    and (pa.daily_cap   is null or u.used_today + a.amount <= pa.daily_cap)
    and (pa.monthly_cap is null or u.used_month + a.amount <= pa.monthly_cap)
  order by pa.sort asc, pa.label asc;
$$;

-- ----------------------------------------------------------------------------
-- (٢) الجداول الأربعة
-- التسمية snake_case مطابقة لحقول camelCase في lib/finance-types.ts حرفياً.
-- ----------------------------------------------------------------------------

-- (٢-١) فئات المصروفات — يديرها المشرف، وبذرتها عربية في القسم (٨)
create table if not exists public.expense_categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  active     boolean not null default true,
  sort       integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.expense_categories drop constraint if exists expense_categories_name_chk;
alter table public.expense_categories
  add constraint expense_categories_name_chk
  check (length(btrim(name)) between 2 and 80) not valid;

-- الاسم فريد بلا حساسية لفراغ أو حالة أحرف — «وقود» مرتين خطأ إدخال لا حالة صحيحة
create unique index if not exists expense_categories_name_key
  on public.expense_categories (lower(btrim(name)));

create index if not exists expense_categories_active_sort_idx
  on public.expense_categories (active, sort);

comment on table public.expense_categories is
  'فئات المصروفات التشغيلية. المصدر: ExpenseCategoryRow في lib/finance-types.ts.';

-- (٢-٢) المصروفات — مرفقها في دلو receipts الخاص تحت بادئة expenses/
--
-- account_id بـ on delete restrict عمداً: حذف حساب خزينة تحته حركة مال يمحو
-- تاريخاً محاسبياً، وهذا بالضبط ما لا يُعوَّض. الحساب يُعطَّل (active=false)
-- ولا يُحذف. والفئة بـ set null لأن حذف تصنيف لا يُلغي أن المال صُرف.
create table if not exists public.expenses (
  id              uuid primary key default gen_random_uuid(),
  category_id     uuid references public.expense_categories(id) on delete set null,
  account_id      uuid not null references public.payment_accounts(id) on delete restrict,
  amount          numeric(12,2) not null check (amount > 0),
  occurred_at     timestamptz not null default now(),
  note            text,
  attachment_path text,
  created_by      uuid,
  created_at      timestamptz not null default now()
);

create index if not exists expenses_occurred_at_idx
  on public.expenses (occurred_at desc);

create index if not exists expenses_category_occurred_idx
  on public.expenses (category_id, occurred_at desc);

create index if not exists expenses_account_occurred_idx
  on public.expenses (account_id, occurred_at desc);

comment on table public.expenses is
  'المصروفات التشغيلية — كل صف يولّد قيد صرف في ledger_entries عبر مُشغّل. المصدر: ExpenseRow.';

comment on column public.expenses.attachment_path is
  'مسار المرفق داخل دلو receipts الخاص تحت بادئة «expenses/» — ليس رابطاً عاماً أبداً.';

-- (٢-٣) دفعات المتعهدين — الشقّ النقدي من المقاصة
create table if not exists public.partner_payouts (
  id               uuid primary key default gen_random_uuid(),
  subcontractor_id uuid not null references public.subcontractors(id) on delete restrict,
  account_id       uuid not null references public.payment_accounts(id) on delete restrict,
  amount           numeric(12,2) not null check (amount > 0),
  occurred_at      timestamptz not null default now(),
  note             text,
  created_by       uuid,
  created_at       timestamptz not null default now()
);

create index if not exists partner_payouts_sub_occurred_idx
  on public.partner_payouts (subcontractor_id, occurred_at desc);

create index if not exists partner_payouts_account_occurred_idx
  on public.partner_payouts (account_id, occurred_at desc);

comment on table public.partner_payouts is
  'ما دفعناه نقداً للمتعهدين ضمن المقاصة — كل صف يولّد قيد صرف. المصدر: PartnerPayoutRow.';

-- (٢-٤) دفتر القيود — مصدر كل رقم مالي في المشروع
--
-- account_id قابل للتفريغ **عن قصد**: القيد بلا حساب هو القيد الذي لا يمس
-- الخزينة — مستحق المتعهد (التزام) وما حصّله نقداً من العميل.
--
-- settlement_role: دور القيد في مقاصة المتعهد **مخزَّناً لا مستنتَجاً**. كان
-- يمكن استنتاجه من (المصدر + خلوّ الحساب)، لكن الاستنتاج ينهار لحظة حذف حساب
-- خزينة: القيد يفقد حسابه فينقلب «دفعة نقدية» إلى «مستحق» بصمت وتتغيّر مقاصة
-- شهور مضت. القيمة المخزَّنة لا يمسّها حذف ولا تعديل مرجع.
--
-- reverses_entry_id: القيد الذي يعكسه هذا القيد. وجوده يعني «هذا قيد عاكس»،
-- وهو الطريق الوحيد لإبطال أثر قيد سابق — لا DELETE ولا UPDATE على المبلغ.
create table if not exists public.ledger_entries (
  id                uuid primary key default gen_random_uuid(),
  account_id        uuid references public.payment_accounts(id) on delete set null,
  direction         text not null check (direction in ('in', 'out')),
  amount            numeric(12,2) not null check (amount > 0),
  occurred_at       timestamptz not null default now(),
  source_type       text not null
                    check (source_type in ('payment', 'expense', 'partner_payout',
                                           'partner_collection', 'refund', 'adjustment')),
  source_id         uuid,
  subcontractor_id  uuid references public.subcontractors(id) on delete set null,
  booking_id        uuid references public.bookings(id) on delete set null,
  settlement_role   text check (settlement_role in ('earned', 'collected', 'paid')),
  note              text,
  reverses_entry_id uuid references public.ledger_entries(id) on delete restrict,
  created_by        uuid,
  created_at        timestamptz not null default now()
);

-- قواعد لاحقة للجداول التي أُنشئت قبل هذه النسخة (إعادة تنفيذ آمنة)
alter table public.ledger_entries add column if not exists settlement_role text;

alter table public.ledger_entries drop constraint if exists ledger_entries_settlement_role_chk;
alter table public.ledger_entries
  add constraint ledger_entries_settlement_role_chk
  check (settlement_role is null or settlement_role in ('earned', 'collected', 'paid'));

-- 🔒 ضمان بنيوي لقاعدة «المستحق التزام لا نقد»: قيد الاستحقاق أو التحصيل الذي
-- قبضه المتعهد **لا يجوز** أن يحمل حساب خزينة، فلا يستطيع تحريك رصيد أبداً —
-- لا بخطأ في دالة ولا بتعديل مباشر من محرر SQL.
alter table public.ledger_entries drop constraint if exists ledger_entries_liability_no_account_chk;
alter table public.ledger_entries
  add constraint ledger_entries_liability_no_account_chk
  check (settlement_role is null
         or settlement_role = 'paid'
         or account_id is null);

-- مسارات القراءة الثلاثة التي نصّ عليها العقد
create index if not exists ledger_entries_account_occurred_idx
  on public.ledger_entries (account_id, occurred_at);

create index if not exists ledger_entries_sub_occurred_idx
  on public.ledger_entries (subcontractor_id, occurred_at);

create index if not exists ledger_entries_source_idx
  on public.ledger_entries (source_type, source_id);

create index if not exists ledger_entries_booking_idx
  on public.ledger_entries (booking_id, occurred_at);

create index if not exists ledger_entries_occurred_idx
  on public.ledger_entries (occurred_at);

-- مسار المقاصة: صفوف متعهد بعينه التي لها دور محاسبي
create index if not exists ledger_entries_settlement_idx
  on public.ledger_entries (subcontractor_id, settlement_role)
  where settlement_role is not null;

-- 🔒 حجر الزاوية: **القيد لا يُعكَس مرتين** — فهرس فريد جزئي على العاكسة وحدها.
-- محاولة عكس مزدوجة (إلغاء يُعاد تنفيذه، أو مُشغّل نُفِّذ مرتين) تصطدم بـ 23505
-- بدل أن تضاعف الرد وتفرّغ الخزينة بهدوء.
create unique index if not exists ledger_entries_reverses_key
  on public.ledger_entries (reverses_entry_id)
  where reverses_entry_id is not null;

comment on table public.ledger_entries is
  'الدفتر الواحد — كل حركة مال صف. الأرصدة والكشوف والتدفق تُشتق منه حصراً. المصدر: LedgerEntryRow.';

comment on column public.ledger_entries.account_id is
  'حساب الخزينة، أو NULL للقيد الذي لا يمس الخزينة: مستحق المتعهد (التزام) وما حصّله نقداً من العميل.';

comment on column public.ledger_entries.settlement_role is
  'دور القيد في المقاصة: earned مستحق رحلة، collected ما قبضه نقداً، paid ما دفعناه له. مخزَّن لا مستنتَج.';

comment on column public.ledger_entries.reverses_entry_id is
  'القيد الذي يعكسه هذا القيد. التصحيح والإلغاء بقيد عاكس لا بحذف — والفهرس الفريد يمنع تكراره.';

-- ----------------------------------------------------------------------------
-- (٣) حارس الإدارة المالي
--
-- لماذا دالة مستقلة لا `is_admin()` وحدها: تقارير الخادم (عميل الخدمة) والهجرات
-- والاختبارات تحتاج القراءة بلا جلسة مشرف. والترتيب هنا **يفشل مغلقاً**:
--   • مشرف ⇒ نعم.
--   • دور الطلب anon/authenticated ⇒ لا قاطعاً، مهما كان مستخدم الاتصال.
--     (`security definer` يبدّل current_user ولا يبدّل متغيّر role الذي يضبطه
--      PostgREST بـ set local role — نفس حيلة pricing_internals_visible في 0010.)
--   • هوية مستخدم حاضرة وليست مشرفاً ⇒ لا.
--   • عميل الخدمة ⇒ نعم. واتصال مالك القاعدة المباشر (هجرة/اختبار) ⇒ نعم.
-- ----------------------------------------------------------------------------
create or replace function public.finance_admin_allowed()
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

  v_role := coalesce(nullif(current_setting('role', true), ''), '');

  -- طلب قادم من متصفح وليس لمشرف: رفض قاطع لا يُنقَض بأي سياق اتصال
  if v_role in ('anon', 'authenticated') then
    return false;
  end if;

  begin
    v_uid := auth.uid();
  exception
    when others then
      v_uid := null;
  end;

  if v_uid is not null then
    return false;
  end if;

  if v_role = 'service_role' then
    return true;
  end if;

  begin
    if coalesce(
         nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
         ''
       ) = 'service_role' then
      return true;
    end if;
  exception
    when others then
      null;
  end;

  -- session_user لا يبدّله security definer: هو مستخدم الاتصال الأصلي. اتصال
  -- PostgREST كله باسم authenticator فلا يمر من هنا أبداً.
  return session_user in ('postgres', 'supabase_admin');
end;
$$;

comment on function public.finance_admin_allowed() is
  'حارس القراءة والكتابة المالية — مشرف أو عميل خدمة أو اتصال مالك القاعدة؛ ويفشل مغلقاً لكل ما عداهم.';

-- ----------------------------------------------------------------------------
-- (٤) الدفتر يكتب نفسه — المُشغّلات
--
-- القاعدة في **الجدول** لا في الدالة: أي مسار كتابة (دالة اللوحة، أو محرر SQL،
-- أو دالة مستقبلية سهت عن الشرط) يولّد القيد داخل نفس معاملة الحدث التجاري.
-- كلها `security definer` لتتجاوز RLS الدفتر، و`search_path = ''` كالمعتاد،
-- وكلها **حارسة من التكرار**: إعادة تنفيذ نفس التحديث لا تضاعف القيد.
-- ----------------------------------------------------------------------------

-- (٤-١) إيصال معتمد ⇒ تحصيل داخل الخزينة
-- يعمل على INSERT أيضاً لأن إدراج دفعة معتمدة مباشرة (استيراد/تسوية) مالٌ دخل فعلاً.
create or replace function public.ledger_on_payment_approved()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if new.status <> 'approved' then
    return null;
  end if;

  if tg_op = 'UPDATE' and old.status = 'approved' then
    return null;
  end if;

  if coalesce(new.amount, 0) <= 0 then
    return null;
  end if;

  -- حارس التكرار: قيد واحد لكل إيصال مهما تكرر مسار الكتابة
  if exists (
    select 1 from public.ledger_entries e
    where e.source_type = 'payment' and e.source_id = new.id
  ) then
    return null;
  end if;

  insert into public.ledger_entries (
    account_id, direction, amount, occurred_at,
    source_type, source_id, booking_id, note, created_by
  )
  values (
    new.account_id, 'in', new.amount, coalesce(new.verified_at, now()),
    'payment', new.id, new.booking_id, 'تحصيل إيصال معتمد', public.current_actor()
  );

  return null;
end;
$$;

drop trigger if exists payments_ledger_approved on public.payments;
create trigger payments_ledger_approved
  after insert or update of status on public.payments
  for each row execute function public.ledger_on_payment_approved();

-- (٤-٢) الرحلة اكتملت ⇒ قيدان لا يمسّان الخزينة
--
--   • مستحق المتعهد: **التزام** — account_id = NULL، اتجاه out، مصدر
--     partner_payout. لا يحرّك رصيد أي حساب، ويغذّي كشف الحساب والمقاصة.
--   • ما حصّله المتعهد نقداً من العميل: amount_remaining — account_id = NULL،
--     اتجاه in، مصدر partner_collection. المال في جيبه لا في خزينتنا.
--
-- المصدر الحقيقي للتكلفة هو dispatches.assigned_payout (المنفّذ ومستحقه)،
-- لا bookings.subcontractor_cost (من سُعِّر على أساسه) — الفرق بينهما هو ما
-- يقيس تآكل الهامش، ودمجهما يُفسد الرقمين معاً.
create or replace function public.ledger_on_booking_completed()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_d   record;
  v_act uuid;
begin
  if new.status <> 'completed' or coalesce(old.status, '') = 'completed' then
    return null;
  end if;

  select d.assigned_subcontractor_id, d.assigned_payout
    into v_d
  from public.dispatches d
  where d.booking_id = new.id;

  if not found or v_d.assigned_subcontractor_id is null then
    -- رحلة اكتملت بلا إسناد (تنفيذ داخلي أو حجز قديم): لا مستحق ولا تحصيل متعهد
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

  -- (ب) ما قبضه نقداً من العميل نيابة عنا
  if coalesce(new.amount_remaining, 0) > 0
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
      null, 'in', new.amount_remaining, now(),
      'partner_collection', new.id, v_d.assigned_subcontractor_id, new.id,
      'collected',
      'باقي قيمة الرحلة ' || coalesce(new.reference, '') || ' حصّله المتعهد نقداً', v_act
    );
  end if;

  return null;
end;
$$;

drop trigger if exists bookings_ledger_completed on public.bookings;
create trigger bookings_ledger_completed
  after update of status on public.bookings
  for each row
  when (old.status is distinct from new.status)
  execute function public.ledger_on_booking_completed();

-- (٤-٣) الحجز أُلغي ⇒ عكسٌ نظيف لكل قيوده
--
-- قيد عاكس لكل قيد غير معكوس: نفس الحساب ونفس المبلغ واتجاه مقلوب، ويشير إلى
-- أصله بـ reverses_entry_id. لا حذف ولا تعديل مبلغ — التاريخ يبقى كاملاً
-- والرصيد يعود كما كان. الفهرس الفريد الجزئي يمنع العكس المزدوج بنيوياً.
create or replace function public.ledger_on_booking_cancelled()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if new.status <> 'cancelled' or coalesce(old.status, '') = 'cancelled' then
    return null;
  end if;

  insert into public.ledger_entries (
    account_id, direction, amount, occurred_at,
    source_type, source_id, subcontractor_id, booking_id,
    settlement_role, note, reverses_entry_id, created_by
  )
  select
    e.account_id,
    case when e.direction = 'in' then 'out' else 'in' end,
    e.amount,
    now(),
    'refund',
    e.source_id,
    e.subcontractor_id,
    e.booking_id,
    e.settlement_role,   -- يرث دور أصله فتُطرح قيمته من المقاصة بإشارة سالبة
    'عكس قيد بسبب إلغاء الحجز ' || coalesce(new.reference, ''),
    e.id,
    public.current_actor()
  from public.ledger_entries e
  where e.booking_id = new.id
    and e.reverses_entry_id is null
    and not exists (
      select 1 from public.ledger_entries r where r.reverses_entry_id = e.id
    );

  return null;
end;
$$;

drop trigger if exists bookings_ledger_cancelled on public.bookings;
create trigger bookings_ledger_cancelled
  after update of status on public.bookings
  for each row
  when (old.status is distinct from new.status)
  execute function public.ledger_on_booking_cancelled();

-- (٤-٤) مصروف ⇒ قيد صرف، وحذف مصروف ⇒ قيد عاكس (لا اختفاء)
create or replace function public.ledger_on_expense_insert()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.ledger_entries e
    where e.source_type = 'expense' and e.source_id = new.id
  ) then
    return null;
  end if;

  insert into public.ledger_entries (
    account_id, direction, amount, occurred_at,
    source_type, source_id, note, created_by
  )
  values (
    new.account_id, 'out', new.amount, new.occurred_at,
    'expense', new.id,
    coalesce(nullif(btrim(coalesce(new.note, '')), ''), 'مصروف تشغيلي'),
    coalesce(new.created_by, public.current_actor())
  );

  return null;
end;
$$;

drop trigger if exists expenses_ledger_insert on public.expenses;
create trigger expenses_ledger_insert
  after insert on public.expenses
  for each row execute function public.ledger_on_expense_insert();

create or replace function public.ledger_on_expense_deleted()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  insert into public.ledger_entries (
    account_id, direction, amount, occurred_at,
    source_type, source_id, note, reverses_entry_id, created_by
  )
  select
    e.account_id, 'in', e.amount, now(),
    'adjustment', e.source_id, 'عكس مصروف حُذف من اللوحة', e.id, public.current_actor()
  from public.ledger_entries e
  where e.source_type = 'expense'
    and e.source_id   = old.id
    and e.reverses_entry_id is null
    and not exists (
      select 1 from public.ledger_entries r where r.reverses_entry_id = e.id
    );

  return null;
end;
$$;

drop trigger if exists expenses_ledger_deleted on public.expenses;
create trigger expenses_ledger_deleted
  after delete on public.expenses
  for each row execute function public.ledger_on_expense_deleted();

-- (٤-٥) دفعة متعهد ⇒ قيد صرف، وحذفها ⇒ قيد عاكس
create or replace function public.ledger_on_partner_payout_insert()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.ledger_entries e
    where e.source_type     = 'partner_payout'
      and e.source_id       = new.id
      and e.settlement_role = 'paid'
  ) then
    return null;
  end if;

  insert into public.ledger_entries (
    account_id, direction, amount, occurred_at,
    source_type, source_id, subcontractor_id, settlement_role, note, created_by
  )
  values (
    new.account_id, 'out', new.amount, new.occurred_at,
    'partner_payout', new.id, new.subcontractor_id, 'paid',
    coalesce(nullif(btrim(coalesce(new.note, '')), ''), 'دفعة مقاصة للمتعهد'),
    coalesce(new.created_by, public.current_actor())
  );

  return null;
end;
$$;

drop trigger if exists partner_payouts_ledger_insert on public.partner_payouts;
create trigger partner_payouts_ledger_insert
  after insert on public.partner_payouts
  for each row execute function public.ledger_on_partner_payout_insert();

create or replace function public.ledger_on_partner_payout_deleted()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  insert into public.ledger_entries (
    account_id, direction, amount, occurred_at,
    source_type, source_id, subcontractor_id, settlement_role,
    note, reverses_entry_id, created_by
  )
  select
    e.account_id, 'in', e.amount, now(),
    'adjustment', e.source_id, e.subcontractor_id, e.settlement_role,
    'عكس دفعة متعهد حُذفت من اللوحة', e.id, public.current_actor()
  from public.ledger_entries e
  where e.source_type = 'partner_payout'
    and e.settlement_role = 'paid'
    and e.source_id   = old.id
    and e.reverses_entry_id is null
    and not exists (
      select 1 from public.ledger_entries r where r.reverses_entry_id = e.id
    );

  return null;
end;
$$;

drop trigger if exists partner_payouts_ledger_deleted on public.partner_payouts;
create trigger partner_payouts_ledger_deleted
  after delete on public.partner_payouts
  for each row execute function public.ledger_on_partner_payout_deleted();

-- ----------------------------------------------------------------------------
-- (٥) العروض
--
-- تُحذف أولاً بـ cascade ثم تُنشأ بالترتيب: إعادة تنفيذ الهجرة بعد تعديل تعريف
-- أي عرض لا تفشل بـ «cannot change name of view column».
--
-- 🔒 `security_invoker = true` على كل عرض: بدونه يعمل العرض بصلاحيات مالكه
-- (postgres) فيتجاوز RLS الجداول تحته — أي أن أي متعهد يقرأ خزينة الشركة
-- كاملة. مع الخاصية تُقيَّم سياسات الجداول بهوية القارئ، فالمتعهد يرى صفراً.
-- ----------------------------------------------------------------------------
drop view if exists public.v_partner_settlements cascade;
drop view if exists public.v_booking_profit      cascade;
drop view if exists public.v_account_balances    cascade;
drop view if exists public.v_ledger_resolved     cascade;

-- (٥-١) عرض داخلي: كل قيد وقد رُدّ إلى أصله
--
-- القيد العاكس يرث تصنيف أصله بإشارة سالبة، فتصير كل تجميعة بعده مجموعاً
-- بسيطاً بلا استثناءات متناثرة. مكان واحد يعرف معنى «العكس» في المشروع كله.
create view public.v_ledger_resolved
with (security_invoker = true)
as
select
  e.id,
  e.occurred_at,
  e.amount,
  e.direction,
  e.account_id,
  e.subcontractor_id,
  e.booking_id,
  e.note,
  e.source_type,
  e.source_id,
  e.reverses_entry_id,
  e.settlement_role,
  coalesce(o.source_type, e.source_type) as origin_source,
  coalesce(o.account_id, e.account_id)   as origin_account_id,
  coalesce(o.direction, e.direction)     as origin_direction,
  -- +1 للقيد الأصلي، −1 للقيد العاكس
  case when o.id is null then 1 else -1 end as sign,
  -- التصنيف المحاسبي في مقاصة المتعهد: القيمة **المخزَّنة** في القيد، ويرثها
  -- القيد العاكس من أصله. لا استنتاج من خلوّ الحساب — انظر تعليق العمود.
  coalesce(o.settlement_role, e.settlement_role) as partner_kind
from public.ledger_entries e
left join public.ledger_entries o on o.id = e.reverses_entry_id;

comment on view public.v_ledger_resolved is
  'كل قيد مردوداً إلى أصله: القيد العاكس يرث تصنيف أصله بإشارة سالبة. أساسٌ داخلي للعروض والدوال.';

-- (٥-٢) أرصدة حسابات الخزينة
--
-- الرصيد = الافتتاحي + الداخل − الخارج، و**القيود ذات الحساب وحدها** تدخل
-- (الربط على e.account_id = pa.id يُسقط قيود الالتزام والتحصيل النقدي تلقائياً).
create view public.v_account_balances
with (security_invoker = true)
as
select
  pa.id                                                              as account_id,
  pa.label,
  pa.kind,
  pa.active,
  pa.customer_facing,
  pa.sort,
  pa.opening_balance,
  coalesce(sum(e.amount) filter (where e.direction = 'in'), 0)::numeric(14,2)  as total_in,
  coalesce(sum(e.amount) filter (where e.direction = 'out'), 0)::numeric(14,2) as total_out,
  (pa.opening_balance
     + coalesce(sum(e.amount) filter (where e.direction = 'in'), 0)
     - coalesce(sum(e.amount) filter (where e.direction = 'out'), 0)
  )::numeric(14,2)                                                    as balance
from public.payment_accounts pa
left join public.ledger_entries e on e.account_id = pa.id
group by pa.id, pa.label, pa.kind, pa.active, pa.customer_facing, pa.sort, pa.opening_balance;

comment on view public.v_account_balances is
  'أرصدة الخزينة = الافتتاحي + الداخل − الخارج، من القيود ذات الحساب وحدها. المصدر: AccountBalance.';

-- (٥-٣) ربحية كل حجز
--
-- تكلفة المتعهد = مستحق المنفّذ الفعلي (dispatches.assigned_payout)، وعند
-- غيابه لقطة التسعير (bookings.subcontractor_cost). ووقت الاكتمال يُقرأ من
-- سجل الأحداث لا من عمود جديد: السجل موجود ومكتوب بمُشغّل منذ 0007.
create view public.v_booking_profit
with (security_invoker = true)
as
select
  b.id        as booking_id,
  b.reference,
  b.status,
  b.currency,
  coalesce(d.assigned_subcontractor_id, b.subcontractor_id) as subcontractor_id,
  b.total     as revenue,
  coalesce(d.assigned_payout, b.subcontractor_cost, 0)::numeric(14,2) as partner_cost,
  (b.total - coalesce(d.assigned_payout, b.subcontractor_cost, 0))::numeric(14,2) as gross_profit,
  agg.collected_by_us::numeric(14,2)      as collected_by_us,
  agg.collected_by_partner::numeric(14,2) as collected_by_partner,
  b.created_at,
  (
    select max(ev.created_at)
    from public.booking_events ev
    where ev.booking_id = b.id
      and ev.to_status  = 'completed'
  ) as completed_at
from public.bookings b
left join public.dispatches d on d.booking_id = b.id
left join lateral (
  select
    coalesce(sum(r.sign * r.amount) filter (where r.origin_source = 'payment'), 0)
      as collected_by_us,
    coalesce(sum(r.sign * r.amount) filter (where r.origin_source = 'partner_collection'), 0)
      as collected_by_partner
  from public.v_ledger_resolved r
  where r.booking_id = b.id
) agg on true;

comment on view public.v_booking_profit is
  'ربحية كل حجز: الإيراد وتكلفة المنفّذ وما حُصّل منا وما حصّله المتعهد. المصدر: BookingProfit.';

-- (٥-٤) مقاصة المتعهدين — الرقم الذي يُدفع أو يُطالَب به
--
-- 🔒 المحرّك هو الدفتر لا جدول المتعهدين: لو بدأنا من subcontractors بربط خارجي
-- لرأى كل متعهد صفَّ نفسه بأصفار (سياسة 0010 تتيح له قراءة صفه)، وهو تسريب
-- بلا داعٍ. بالبدء من الدفتر — المحجوب عنه تماماً — لا يرى شيئاً إطلاقاً.
--
-- قاعدة الإشارة: صافي المستحق = المستحق − ما حصّله − ما دُفع له.
-- موجب ⇒ ندفع له («له علينا»). سالب ⇒ يدفع لنا («عليه لنا»).
create view public.v_partner_settlements
with (security_invoker = true)
as
select
  s.id           as subcontractor_id,
  s.company_name,
  g.earned::numeric(14,2),
  g.collected::numeric(14,2),
  g.paid::numeric(14,2),
  (g.earned - g.collected - g.paid)::numeric(14,2) as net_due,
  g.trips_count
from (
  select
    r.subcontractor_id,
    coalesce(sum(r.sign * r.amount) filter (where r.partner_kind = 'earned'), 0)    as earned,
    coalesce(sum(r.sign * r.amount) filter (where r.partner_kind = 'collected'), 0) as collected,
    coalesce(sum(r.sign * r.amount) filter (where r.partner_kind = 'paid'), 0)      as paid,
    count(distinct r.booking_id) filter (where r.partner_kind = 'earned' and r.sign = 1)
      as trips_count
  from public.v_ledger_resolved r
  where r.subcontractor_id is not null
    and r.partner_kind is not null
  group by r.subcontractor_id
) g
join public.subcontractors s on s.id = g.subcontractor_id;

comment on view public.v_partner_settlements is
  'مقاصة كل متعهد: صافي موجب = ندفع له، وسالب = يدفع لنا. المصدر: PartnerSettlement.';

-- ----------------------------------------------------------------------------
-- (٦) الدوال — كل ما تستدعيه شاشات المالية
--
-- كلها `security definer` بحراسة finance_admin_allowed() في أول سطر، و`search_path`
-- مثبَّت، وتعيد صفوفاً منمَّطة مطابقة لعقد lib/finance-types.ts.
-- والحسابات كلها هنا: لا جمع ولا طرح ولا رصيد متحرك في TypeScript.
-- ----------------------------------------------------------------------------

-- (٦-١) كشف حساب متعهد — زمنياً برصيد متحرك
--
-- قاعدة الطرفين (والعقد وصفي في تسميتها، والحساب هو الحاكم):
--   دائن (credit) = مستحق رحلة ⇒ يزيد ما له علينا.
--   مدين (debit)  = ما حصّله نقداً، و**ما دفعناه له** ⇒ كلاهما يُنقص ما له علينا.
-- فيكون آخر رصيد في الكشف مطابقاً تماماً لـ v_partner_settlements.net_due.
-- والقيد العاكس يظهر في العمود المقابل تلقائياً (إشارته −١).
--
-- p_from غير فارغ ⇒ الرصيد يبدأ من صافي ما قبل الفترة (كشف حقيقي لا مبتور).
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
             r.sign * r.amount * case when r.partner_kind = 'earned' then 1 else -1 end
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
      end                                                                     as l_kind,
      b.reference                                                             as l_ref,
      r.sign * r.amount * case when r.partner_kind = 'earned' then 1 else -1 end
                                                                              as l_signed,
      r.note                                                                  as l_note
    from public.v_ledger_resolved r
    left join public.bookings b on b.id = r.booking_id
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

comment on function public.partner_statement(uuid, date, date) is
  'كشف حساب متعهد زمنياً برصيد متحرك ينتهي عند net_due. المصدر: PartnerStatementLine.';

-- (٦-٢) التدفق النقدي — سلال يوم/أسبوع/شهر برصيد متحرك
--
-- **القيود ذات الحساب وحدها**: مستحق المتعهد ليس نقداً خرج، وما حصّله ليس نقداً
-- دخل خزينتنا. إدخالهما هنا يرسم منحنى سيولة كاذباً — وهو أسوأ خطأ ممكن في هذه
-- الشاشة تحديداً لأن عليها يُبنى قرار الصرف.
--
-- الرصيد المتحرك يبدأ من (مجموع الأرصدة الافتتاحية + صافي ما قبل الفترة)، فآخر
-- قيمة فيه = النقد في اليد فعلياً عند نهاية الفترة.
create or replace function public.cash_flow(
  p_from        date,
  p_to          date,
  p_granularity text
)
returns table (
  bucket          date,
  inflow          numeric,
  outflow         numeric,
  net             numeric,
  running_balance numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_gran text;
  v_base numeric := 0;
begin
  if not public.finance_admin_allowed() then
    raise exception 'التدفق النقدي متاح للإدارة فقط' using hint = 'forbidden';
  end if;

  v_gran := lower(nullif(btrim(coalesce(p_granularity, '')), ''));
  if v_gran is null or v_gran not in ('day', 'week', 'month') then
    v_gran := 'day';
  end if;

  select coalesce(sum(pa.opening_balance), 0) into v_base from public.payment_accounts pa;

  select v_base + coalesce(sum(
           case when e.direction = 'in' then e.amount else -e.amount end
         ), 0)
    into v_base
  from public.ledger_entries e
  where e.account_id is not null
    and p_from is not null
    and (e.occurred_at at time zone 'Africa/Cairo')::date < p_from;

  return query
  with moves as (
    select
      date_trunc(v_gran, e.occurred_at at time zone 'Africa/Cairo')::date as m_bucket,
      e.direction                                                        as m_dir,
      e.amount                                                           as m_amount
    from public.ledger_entries e
    where e.account_id is not null
      and (p_from is null or (e.occurred_at at time zone 'Africa/Cairo')::date >= p_from)
      and (p_to   is null or (e.occurred_at at time zone 'Africa/Cairo')::date <= p_to)
  ),
  agg as (
    select
      m.m_bucket,
      coalesce(sum(m.m_amount) filter (where m.m_dir = 'in'), 0)  as a_in,
      coalesce(sum(m.m_amount) filter (where m.m_dir = 'out'), 0) as a_out
    from moves m
    group by m.m_bucket
  )
  select
    a.m_bucket,
    a.a_in::numeric(14,2),
    a.a_out::numeric(14,2),
    (a.a_in - a.a_out)::numeric(14,2),
    (v_base + sum(a.a_in - a.a_out) over (
       order by a.m_bucket asc
       rows between unbounded preceding and current row
     ))::numeric(14,2)
  from agg a
  order by a.m_bucket asc;
end;
$$;

comment on function public.cash_flow(date, date, text) is
  'التدفق النقدي بسلال day|week|month برصيد متحرك — من القيود ذات الحساب وحدها. المصدر: CashFlowBucket.';

-- (٦-٣) مؤشرات الصفحة المالية
--
-- تدفّقات الفترة: الإيراد وتكلفة المتعهدين من الرحلات **المكتملة داخل الفترة**
-- (وقت الاكتمال من سجل الأحداث)، والمصروفات بتاريخ وقوعها.
-- أرصدة لحظية لا تخص فترة: النقد في اليد، والمستحق على العملاء، وصافي المقاصة.
create or replace function public.finance_kpis(p_from date, p_to date)
returns table (
  revenue         numeric,
  partner_costs   numeric,
  expenses        numeric,
  net_profit      numeric,
  cash_on_hand    numeric,
  receivables     numeric,
  partner_net_due numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_rev  numeric := 0;
  v_cost numeric := 0;
  v_exp  numeric := 0;
  v_cash numeric := 0;
  v_recv numeric := 0;
  v_due  numeric := 0;
begin
  if not public.finance_admin_allowed() then
    raise exception 'المؤشرات المالية متاحة للإدارة فقط' using hint = 'forbidden';
  end if;

  select coalesce(sum(p.revenue), 0), coalesce(sum(p.partner_cost), 0)
    into v_rev, v_cost
  from public.v_booking_profit p
  where p.status = 'completed'
    and p.completed_at is not null
    and (p_from is null or (p.completed_at at time zone 'Africa/Cairo')::date >= p_from)
    and (p_to   is null or (p.completed_at at time zone 'Africa/Cairo')::date <= p_to);

  select coalesce(sum(x.amount), 0)
    into v_exp
  from public.expenses x
  where (p_from is null or (x.occurred_at at time zone 'Africa/Cairo')::date >= p_from)
    and (p_to   is null or (x.occurred_at at time zone 'Africa/Cairo')::date <= p_to);

  select coalesce(sum(ab.balance), 0) into v_cash from public.v_account_balances ab;

  -- المستحق على العملاء: باقي قيمة الرحلات المؤكدة/المُسندة التي لم تُنفَّذ بعد.
  -- بعد الاكتمال يصير الباقي «ما حصّله المتعهد» فينتقل إلى المقاصة لا إلى هنا.
  select coalesce(sum(b.amount_remaining), 0)
    into v_recv
  from public.bookings b
  where b.status in ('confirmed', 'assigned')
    and b.amount_remaining > 0;

  select coalesce(sum(ps.net_due), 0) into v_due from public.v_partner_settlements ps;

  revenue         := v_rev::numeric(14,2);
  partner_costs   := v_cost::numeric(14,2);
  expenses        := v_exp::numeric(14,2);
  net_profit      := (v_rev - v_cost - v_exp)::numeric(14,2);
  cash_on_hand    := v_cash::numeric(14,2);
  receivables     := v_recv::numeric(14,2);
  partner_net_due := v_due::numeric(14,2);
  return next;
end;
$$;

comment on function public.finance_kpis(date, date) is
  'مؤشرات الصفحة المالية — تدفقات الفترة وأرصدة لحظية. المصدر: FinanceKpis.';

-- (٦-٤) تسجيل مصروف — الصف يُدرج والمُشغّل يكتب القيد داخل نفس المعاملة
create or replace function public.record_expense(
  p_account  uuid,
  p_category uuid,
  p_amount   numeric,
  p_at       timestamptz,
  p_note     text,
  p_path     text
)
returns table (
  id          uuid,
  entry_id    uuid,
  amount      numeric,
  occurred_at timestamptz,
  balance     numeric
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id      uuid;
  v_entry   uuid;
  v_amount  numeric;
  v_at      timestamptz;
  v_balance numeric;
begin
  if not public.finance_admin_allowed() then
    raise exception 'تسجيل المصروفات متاح للإدارة فقط' using hint = 'forbidden';
  end if;

  v_amount := round(coalesce(p_amount, 0), 2);
  if v_amount <= 0 then
    raise exception 'قيمة المصروف يجب أن تكون أكبر من صفر' using hint = 'invalid-input';
  end if;

  if p_account is null
     or not exists (select 1 from public.payment_accounts pa where pa.id = p_account) then
    raise exception 'حساب الخزينة غير موجود' using hint = 'account-not-found';
  end if;

  if p_category is not null
     and not exists (select 1 from public.expense_categories c where c.id = p_category) then
    raise exception 'فئة المصروف غير موجودة' using hint = 'category-not-found';
  end if;

  v_at := coalesce(p_at, now());

  insert into public.expenses as x (
    category_id, account_id, amount, occurred_at, note, attachment_path, created_by
  )
  values (
    p_category, p_account, v_amount, v_at,
    nullif(btrim(coalesce(p_note, '')), ''),
    nullif(btrim(coalesce(p_path, '')), ''),
    public.current_actor()
  )
  returning x.id into v_id;

  select e.id into v_entry
  from public.ledger_entries e
  where e.source_type = 'expense' and e.source_id = v_id
  limit 1;

  select ab.balance into v_balance
  from public.v_account_balances ab
  where ab.account_id = p_account;

  id          := v_id;
  entry_id    := v_entry;
  amount      := v_amount;
  occurred_at := v_at;
  balance     := v_balance;
  return next;
end;
$$;

-- (٦-٥) تسجيل دفعة لمتعهد — وتُعيد صافي المقاصة بعدها مباشرة
create or replace function public.record_partner_payout(
  p_sub     uuid,
  p_account uuid,
  p_amount  numeric,
  p_at      timestamptz,
  p_note    text
)
returns table (
  id          uuid,
  entry_id    uuid,
  amount      numeric,
  occurred_at timestamptz,
  net_due     numeric,
  balance     numeric
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id      uuid;
  v_entry   uuid;
  v_amount  numeric;
  v_at      timestamptz;
  v_net     numeric;
  v_balance numeric;
begin
  if not public.finance_admin_allowed() then
    raise exception 'تسجيل دفعات المتعهدين متاح للإدارة فقط' using hint = 'forbidden';
  end if;

  v_amount := round(coalesce(p_amount, 0), 2);
  if v_amount <= 0 then
    raise exception 'قيمة الدفعة يجب أن تكون أكبر من صفر' using hint = 'invalid-input';
  end if;

  if p_sub is null
     or not exists (select 1 from public.subcontractors s where s.id = p_sub) then
    raise exception 'المتعهد غير موجود' using hint = 'not-found';
  end if;

  if p_account is null
     or not exists (select 1 from public.payment_accounts pa where pa.id = p_account) then
    raise exception 'حساب الخزينة غير موجود' using hint = 'account-not-found';
  end if;

  v_at := coalesce(p_at, now());

  insert into public.partner_payouts as x (
    subcontractor_id, account_id, amount, occurred_at, note, created_by
  )
  values (
    p_sub, p_account, v_amount, v_at,
    nullif(btrim(coalesce(p_note, '')), ''),
    public.current_actor()
  )
  returning x.id into v_id;

  select e.id into v_entry
  from public.ledger_entries e
  where e.source_type     = 'partner_payout'
    and e.source_id       = v_id
    and e.settlement_role = 'paid'
  limit 1;

  select ps.net_due into v_net
  from public.v_partner_settlements ps
  where ps.subcontractor_id = p_sub;

  select ab.balance into v_balance
  from public.v_account_balances ab
  where ab.account_id = p_account;

  id          := v_id;
  entry_id    := v_entry;
  amount      := v_amount;
  occurred_at := v_at;
  net_due     := coalesce(v_net, 0);
  balance     := v_balance;
  return next;
end;
$$;

-- (٦-٦) تسوية يدوية — بسبب مكتوب إلزاماً
--
-- التسوية بلا سبب مكتوب هي بالضبط ما يُفسد الدفاتر بعد ستة أشهر: رقم لا أحد
-- يعرف من أين جاء. لذلك الملاحظة شرط لا خيار.
create or replace function public.record_adjustment(
  p_account   uuid,
  p_direction text,
  p_amount    numeric,
  p_at        timestamptz,
  p_note      text
)
returns table (
  entry_id    uuid,
  direction   text,
  amount      numeric,
  occurred_at timestamptz,
  balance     numeric
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_entry   uuid;
  v_dir     text;
  v_amount  numeric;
  v_at      timestamptz;
  v_note    text;
  v_balance numeric;
begin
  if not public.finance_admin_allowed() then
    raise exception 'التسويات اليدوية متاحة للإدارة فقط' using hint = 'forbidden';
  end if;

  v_dir := lower(nullif(btrim(coalesce(p_direction, '')), ''));
  if v_dir not in ('in', 'out') then
    raise exception 'اتجاه التسوية يجب أن يكون in أو out' using hint = 'invalid-input';
  end if;

  v_amount := round(coalesce(p_amount, 0), 2);
  if v_amount <= 0 then
    raise exception 'قيمة التسوية يجب أن تكون أكبر من صفر' using hint = 'invalid-input';
  end if;

  if p_account is null
     or not exists (select 1 from public.payment_accounts pa where pa.id = p_account) then
    raise exception 'حساب الخزينة غير موجود' using hint = 'account-not-found';
  end if;

  v_note := nullif(btrim(coalesce(p_note, '')), '');
  if v_note is null then
    raise exception 'سبب التسوية مطلوب' using hint = 'note-required';
  end if;

  v_at := coalesce(p_at, now());

  insert into public.ledger_entries as e (
    account_id, direction, amount, occurred_at, source_type, note, created_by
  )
  values (p_account, v_dir, v_amount, v_at, 'adjustment', v_note, public.current_actor())
  returning e.id into v_entry;

  select ab.balance into v_balance
  from public.v_account_balances ab
  where ab.account_id = p_account;

  entry_id    := v_entry;
  direction   := v_dir;
  amount      := v_amount;
  occurred_at := v_at;
  balance     := v_balance;
  return next;
end;
$$;

-- ----------------------------------------------------------------------------
-- (٧) RLS + الصلاحيات
--
-- خلاصة الوصول في هذه المرحلة:
--   anon          → **صفر مطلق** على الجداول الأربعة والعروض الأربعة وكل الدوال.
--                    لا سياسة تستهدفه ولا منح ولا حتى TRUNCATE.
--   المتعهد        → مسجَّل (authenticated) وليس مشرفاً ⇒ سياسات is_admin() تُرجع
--                    له صفر صف من كل شيء مالي، والعروض `security_invoker` فترث
--                    الحجب نفسه. المال ليس من شأنه إطلاقاً.
--   العميل         → ضيف أصلاً، ولا شيء له هنا.
--   المشرف         → كل شيء (وهو الوحيد الذي تُرجع له السياسات صفوفاً).
--   service_role  → كل شيء (تقارير الخادم والمهام المجدولة).
--
-- والدفتر **مضاف فقط (append-only)** أمام اللوحة: لا UPDATE ولا DELETE عليه لأي
-- دور مستخدم. التصحيح يقع بقيد عاكس عبر record_adjustment، والمُشغّلات تكتب
-- بهوية مالكها فتتجاوز غياب المنح.
-- ----------------------------------------------------------------------------
alter table public.expense_categories enable row level security;
alter table public.expenses           enable row level security;
alter table public.partner_payouts    enable row level security;
alter table public.ledger_entries     enable row level security;

-- السحب أولاً — إعدادات Supabase الافتراضية منحت anon كل شيء بما فيه TRUNCATE
revoke all on public.expense_categories from public, anon, authenticated;
revoke all on public.expenses           from public, anon, authenticated;
revoke all on public.partner_payouts    from public, anon, authenticated;
revoke all on public.ledger_entries     from public, anon, authenticated;

-- لا منح لـ anon على أي منها — ولا حتى select
grant select, insert, update, delete on public.expense_categories to authenticated;
grant select, insert, update, delete on public.expenses           to authenticated;
grant select, insert, update, delete on public.partner_payouts    to authenticated;
grant select                         on public.ledger_entries     to authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant select, insert, update, delete on public.expense_categories to service_role';
    execute 'grant select, insert, update, delete on public.expenses to service_role';
    execute 'grant select, insert, update, delete on public.partner_payouts to service_role';
    execute 'grant select, insert on public.ledger_entries to service_role';
  end if;
end;
$$;

-- (٧-١) سياسات expense_categories
drop policy if exists "expense_categories_select_admin" on public.expense_categories;
create policy "expense_categories_select_admin"
  on public.expense_categories for select to authenticated using (public.is_admin());

drop policy if exists "expense_categories_insert_admin" on public.expense_categories;
create policy "expense_categories_insert_admin"
  on public.expense_categories for insert to authenticated with check (public.is_admin());

drop policy if exists "expense_categories_update_admin" on public.expense_categories;
create policy "expense_categories_update_admin"
  on public.expense_categories for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "expense_categories_delete_admin" on public.expense_categories;
create policy "expense_categories_delete_admin"
  on public.expense_categories for delete to authenticated using (public.is_admin());

-- (٧-٢) سياسات expenses
drop policy if exists "expenses_select_admin" on public.expenses;
create policy "expenses_select_admin"
  on public.expenses for select to authenticated using (public.is_admin());

drop policy if exists "expenses_insert_admin" on public.expenses;
create policy "expenses_insert_admin"
  on public.expenses for insert to authenticated with check (public.is_admin());

drop policy if exists "expenses_update_admin" on public.expenses;
create policy "expenses_update_admin"
  on public.expenses for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "expenses_delete_admin" on public.expenses;
create policy "expenses_delete_admin"
  on public.expenses for delete to authenticated using (public.is_admin());

-- (٧-٣) سياسات partner_payouts
drop policy if exists "partner_payouts_select_admin" on public.partner_payouts;
create policy "partner_payouts_select_admin"
  on public.partner_payouts for select to authenticated using (public.is_admin());

drop policy if exists "partner_payouts_insert_admin" on public.partner_payouts;
create policy "partner_payouts_insert_admin"
  on public.partner_payouts for insert to authenticated with check (public.is_admin());

drop policy if exists "partner_payouts_update_admin" on public.partner_payouts;
create policy "partner_payouts_update_admin"
  on public.partner_payouts for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "partner_payouts_delete_admin" on public.partner_payouts;
create policy "partner_payouts_delete_admin"
  on public.partner_payouts for delete to authenticated using (public.is_admin());

-- (٧-٤) سياسة ledger_entries — قراءة للمشرف، ولا كتابة لأحد
-- (المُشغّلات والدوال definer تكتب بهوية مالكها فلا تحتاج سياسة، وغياب سياسة
--  الإدراج يجعل أي محاولة كتابة مباشرة من اللوحة تفشل ولو مُنحت صلاحية سهواً)
drop policy if exists "ledger_entries_select_admin" on public.ledger_entries;
create policy "ledger_entries_select_admin"
  on public.ledger_entries for select to authenticated using (public.is_admin());

-- (٧-٥) صلاحيات العروض — لا شيء لـ anon، والمسجَّل يمر على RLS الجداول تحتها
revoke all on public.v_ledger_resolved     from public, anon, authenticated;
revoke all on public.v_account_balances    from public, anon, authenticated;
revoke all on public.v_booking_profit      from public, anon, authenticated;
revoke all on public.v_partner_settlements from public, anon, authenticated;

grant select on public.v_account_balances    to authenticated;
grant select on public.v_booking_profit      to authenticated;
grant select on public.v_partner_settlements to authenticated;
-- v_ledger_resolved عرض داخلي لا تقرؤه الواجهة، لكن المنح **لازم**: مع
-- security_invoker تُفحص صلاحية القارئ على كل عرض متداخل، فبدونه يفشل
-- v_booking_profit و v_partner_settlements على المشرف نفسه بـ «permission denied».
-- والحجب الفعلي يبقى قائماً: RLS على ledger_entries يُرجع لغير المشرف صفر صف.
grant select on public.v_ledger_resolved     to authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant select on public.v_ledger_resolved to service_role';
    execute 'grant select on public.v_account_balances to service_role';
    execute 'grant select on public.v_booking_profit to service_role';
    execute 'grant select on public.v_partner_settlements to service_role';
  end if;
end;
$$;

-- (٧-٦) صلاحيات الدوال — السحب من الثلاثة ثم المنح الصريح
-- (`create or replace` لا يعيد ضبط الصلاحيات، والدالة الجديدة تولد مفتوحة)

-- دوال داخلية بحتة: لا تُمنح لأي دور مستخدم
revoke all on function public.finance_admin_allowed()              from public, anon, authenticated;
revoke all on function public.ledger_on_payment_approved()         from public, anon, authenticated;
revoke all on function public.ledger_on_booking_completed()        from public, anon, authenticated;
revoke all on function public.ledger_on_booking_cancelled()        from public, anon, authenticated;
revoke all on function public.ledger_on_expense_insert()           from public, anon, authenticated;
revoke all on function public.ledger_on_expense_deleted()          from public, anon, authenticated;
revoke all on function public.ledger_on_partner_payout_insert()    from public, anon, authenticated;
revoke all on function public.ledger_on_partner_payout_deleted()   from public, anon, authenticated;

-- دوال شاشات المالية — الحراسة داخلها، ولا معنى لمنحها للزائر
revoke all    on function public.partner_statement(uuid, date, date) from public, anon, authenticated;
grant execute on function public.partner_statement(uuid, date, date) to authenticated;

revoke all    on function public.cash_flow(date, date, text) from public, anon, authenticated;
grant execute on function public.cash_flow(date, date, text) to authenticated;

revoke all    on function public.finance_kpis(date, date) from public, anon, authenticated;
grant execute on function public.finance_kpis(date, date) to authenticated;

revoke all    on function public.record_expense(uuid, uuid, numeric, timestamptz, text, text)
  from public, anon, authenticated;
grant execute on function public.record_expense(uuid, uuid, numeric, timestamptz, text, text)
  to authenticated;

revoke all    on function public.record_partner_payout(uuid, uuid, numeric, timestamptz, text)
  from public, anon, authenticated;
grant execute on function public.record_partner_payout(uuid, uuid, numeric, timestamptz, text)
  to authenticated;

revoke all    on function public.record_adjustment(uuid, text, numeric, timestamptz, text)
  from public, anon, authenticated;
grant execute on function public.record_adjustment(uuid, text, numeric, timestamptz, text)
  to authenticated;

-- 🔒 إعادة إصدار صلاحيات available_payment_accounts: `create or replace` أعلاه
-- لم يمسّها، لكن إعادة التأكيد أرخص من ثغرة — والقاعدة من 0009 تبقى كما هي:
-- أحادي الوسيط للوحة وعميل الخدمة، والمربوط بالتوكن هو طريق الضيف الوحيد.
revoke all    on function public.available_payment_accounts(numeric)
  from public, anon, authenticated;
grant execute on function public.available_payment_accounts(numeric) to authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.partner_statement(uuid, date, date) to service_role';
    execute 'grant execute on function public.cash_flow(date, date, text) to service_role';
    execute 'grant execute on function public.finance_kpis(date, date) to service_role';
    execute 'grant execute on function public.record_expense(uuid, uuid, numeric, timestamptz, text, text) to service_role';
    execute 'grant execute on function public.record_partner_payout(uuid, uuid, numeric, timestamptz, text) to service_role';
    execute 'grant execute on function public.record_adjustment(uuid, text, numeric, timestamptz, text) to service_role';
    execute 'grant execute on function public.available_payment_accounts(numeric) to service_role';
    execute 'grant execute on function public.finance_admin_allowed() to service_role';
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- (٨) البذرة — فئات المصروفات الافتراضية بالعربية
-- on conflict غير مستعمل عمداً (الفهرس على تعبير) — الشرط `not exists` أوضح
-- وأكثر أماناً، وإعادة التنفيذ لا تمس أي تعديل لاحق من اللوحة.
-- ----------------------------------------------------------------------------
insert into public.expense_categories (name, sort)
select x.name, x.sort
from (values
  ('وقود',   10),
  ('صيانة',  20),
  ('عمولات', 30),
  ('رواتب',  40),
  ('تسويق',  50),
  ('إداري',  60)
) as x(name, sort)
where not exists (
  select 1 from public.expense_categories c
  where lower(btrim(c.name)) = lower(btrim(x.name))
);

-- ----------------------------------------------------------------------------
-- (٩) فحص ذاتي بعد التنفيذ — شروط إغلاق المرحلة
-- ----------------------------------------------------------------------------
do $$
declare
  v_missing text;
  v_leak    text;
begin
  -- (٩-١) الجداول والعروض والدوال موجودة
  select string_agg(x.rel, '، ')
    into v_missing
  from (values
    ('public.expense_categories'), ('public.expenses'),
    ('public.partner_payouts'), ('public.ledger_entries'),
    ('public.v_ledger_resolved'), ('public.v_account_balances'),
    ('public.v_booking_profit'), ('public.v_partner_settlements')
  ) as x(rel)
  where to_regclass(x.rel) is null;

  if v_missing is not null then
    raise exception '0015: كائنات ناقصة بعد التنفيذ: %', v_missing;
  end if;

  select string_agg(x.sig, '، ')
    into v_missing
  from (values
    ('public.partner_statement(uuid, date, date)'),
    ('public.cash_flow(date, date, text)'),
    ('public.finance_kpis(date, date)'),
    ('public.record_expense(uuid, uuid, numeric, timestamptz, text, text)'),
    ('public.record_partner_payout(uuid, uuid, numeric, timestamptz, text)'),
    ('public.record_adjustment(uuid, text, numeric, timestamptz, text)'),
    ('public.finance_admin_allowed()')
  ) as x(sig)
  where to_regprocedure(x.sig) is null;

  if v_missing is not null then
    raise exception '0015: دوال ناقصة بعد التنفيذ: %', v_missing;
  end if;

  -- (٩-٢) 🔒 كل عرض `security_invoker` — بدونها يتجاوز العرض RLS الجداول تحته
  select string_agg(c.relname, '، ')
    into v_leak
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'v'
    and c.relname in ('v_ledger_resolved', 'v_account_balances',
                      'v_booking_profit', 'v_partner_settlements')
    and coalesce(
          (select option_value from pg_options_to_table(c.reloptions)
            where option_name = 'security_invoker'), 'false'
        ) <> 'true';

  if v_leak is not null then
    raise exception
      '0015: عروض بلا security_invoker (تتجاوز RLS وتكشف الخزينة للمتعهدين): %', v_leak;
  end if;

  -- (٩-٣) لا صلاحية واحدة لـ anon على أي كائن مالي
  if exists (select 1 from pg_roles where rolname = 'anon') then
    select string_agg(distinct t.rel, '، ')
      into v_leak
    from (values
      ('public.expense_categories'), ('public.expenses'),
      ('public.partner_payouts'), ('public.ledger_entries'),
      ('public.v_ledger_resolved'), ('public.v_account_balances'),
      ('public.v_booking_profit'), ('public.v_partner_settlements')
    ) as t(rel)
    cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'))
      as p(priv)
    where has_table_privilege('anon', t.rel, p.priv);

    if v_leak is not null then
      raise exception '0015: anon يملك صلاحيات على كائنات مالية: %', v_leak;
    end if;

    select string_agg(distinct f.sig, '، ')
      into v_leak
    from (values
      ('public.partner_statement(uuid, date, date)'),
      ('public.cash_flow(date, date, text)'),
      ('public.finance_kpis(date, date)'),
      ('public.record_expense(uuid, uuid, numeric, timestamptz, text, text)'),
      ('public.record_partner_payout(uuid, uuid, numeric, timestamptz, text)'),
      ('public.record_adjustment(uuid, text, numeric, timestamptz, text)'),
      ('public.finance_admin_allowed()')
    ) as f(sig)
    where has_function_privilege('anon', f.sig, 'EXECUTE');

    if v_leak is not null then
      raise exception '0015: anon يملك EXECUTE على دوال مالية: %', v_leak;
    end if;
  end if;

  -- (٩-٤) الدفتر مضاف فقط أمام اللوحة
  if exists (select 1 from pg_roles where rolname = 'authenticated')
     and (has_table_privilege('authenticated', 'public.ledger_entries', 'UPDATE')
       or has_table_privilege('authenticated', 'public.ledger_entries', 'DELETE')
       or has_table_privilege('authenticated', 'public.ledger_entries', 'INSERT')) then
    raise exception '0015: الدفتر ليس مضافاً فقط — للمسجَّل صلاحية تعديل أو حذف أو إدراج';
  end if;

  -- (٩-٥) الفهرس الفريد الجزئي المانع للعكس المزدوج
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and tablename  = 'ledger_entries'
      and indexname  = 'ledger_entries_reverses_key'
  ) then
    raise exception '0015: فهرس منع العكس المزدوج غير موجود — لا تُغلق المرحلة بدونه';
  end if;

  -- (٩-٦) والقيد البنيوي: المستحق والتحصيل النقدي لا يحملان حساب خزينة أبداً
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.ledger_entries'::regclass
      and conname  = 'ledger_entries_liability_no_account_chk'
  ) then
    raise exception '0015: قيد «الالتزام بلا حساب» غير موجود — المستحق قد يحرّك الخزينة';
  end if;

  raise notice '✔ 0015_finance: الخزينة + الدفتر + المصروفات + المقاصة + التدفق النقدي';
end;
$$;
