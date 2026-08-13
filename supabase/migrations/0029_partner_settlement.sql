-- ============================================================================
-- 0029 — التحصيل من المتعهد: الاتجاه الثاني للحساب المفتوح
--
-- ── المسألة ─────────────────────────────────────────────────────────────────
-- النظام يعرف «ندفع له» ولا يعرف «يدفع لنا». والسبب أن معادلة المقاصة ثلاثية
-- (`earned − collected − paid`) وليس فيها موضعٌ يستقبل ما سدّده المتعهد. وقياسٌ
-- حيّ على قاعدة بدر: `record_partner_adjustment(sub,'collected',-100)` نقلت الدين
-- من ‎61,034−‎ إلى ‎61,134−‎ — **عمّقته بدل أن تخفضه**، لأن `v_partner_settlements`
-- تجمع `sign * amount` وتتجاهل `direction` تماماً، و`sign` لا يصير ‎−1‎ إلا للقيد
-- العاكس. فالمبلغ السالب يزيد المجموع المطروح لا ينقصه.
--
-- ── القرار: دور رابع، لا تعديل معادلة قائمة ─────────────────────────────────
--
--   | الدور       | معناه                   | حساب خزينة | الاتجاه |
--   |-------------|-------------------------|------------|---------|
--   | `earned`    | مستحقه عن الرحلات       | لا (التزام)| out     |
--   | `collected` | ما قبضه نقداً من عملائنا| لا (التزام)| in      |
--   | `paid`      | ما دفعناه له            | **نعم**    | out     |
--   | `received`  | **ما سدّده لنا**        | **نعم**    | **in**  |
--
--       net_due = earned − collected − paid + received
--
-- **لماذا هذا لا غيره:** إضافةٌ محضة — لا معادلة قائمة تتغيّر، فلا يتحرك رقم واحد
-- من قيود التسوية القائمة (كلها بالاتجاه القانوني). والزوجان متناظران فتقبلهما
-- القيود المحاسبية القائمة بلا تحايل: قيد الالتزام بلا حساب، وقيد النقد بحساب
-- حقيقي — فيتحرك رصيد الخزينة مع الثاني وحده. وأثره أن التحصيل **قيدٌ واحد**
-- يفعل الأمرين معاً (يرفع الخزينة ويخفض الدين)، تماماً كدفعة المتعهد في الاتجاه
-- المعاكس.
--
-- ── التحقق الحسابي (مثال `docs/FINANCE.md` نفسه) ────────────────────────────
-- رحلة ٢٬١٦٠ بتكلفة متعهد ١٬٢٠٠، العميل دفع ٦٠٠ عرباناً و١٬٥٦٠ نقداً للسائق:
--     earned 1200 − collected 1560 = −360   ⇒ عليه لنا ٣٦٠
-- يسدّد ٣٦٠ فتُسجَّل `record_partner_settlement` ⇒ received 360 ⇒
--     1200 − 1560 − 0 + 360 = 0             ⇒ الصافي **صفر**
-- والخزينة: 600 (عربون) + 360 (تحصيل) = **960** = الربح (2160 − 1200). يقفل.
--
-- ── ما يفعله هذا الملف ──────────────────────────────────────────────────────
--   ق١) توسيع قيود `ledger_entries` الأربعة (بأسمائها **من الكتالوج**)
--   ق٢) جدول `partner_settlements` على نمط `partner_payouts` حرفياً
--   ق٣) مُشغّلا الدفتر: قيدٌ واحد عند الإدراج، وقيدٌ مقابل عند الحذف
--   ق٤) `v_partner_settlements`: المعادلة الجديدة و`received` عموداً ١١
--   ق٥) `partner_statement`: الدور الرابع في موضعَي الإشارة وفي تسمية النوع
--   ق٦) `record_partner_settlement(...)` — والمرجع إلزامي لغير النقدية
--   ق٧) إغلاق فخ المبلغ السالب في `record_partner_adjustment`
--   ق٨) `portal_balance()` — رصيد المتعهد كما يراه في بورتاله، بلا وسيط
--   ق٩) فحوص ذاتية تُسقط الهجرة
--
-- المرجع: SPEC-0029 المعتمدة نصاً من بدر · `lib/finance-types.ts` (العقد) ·
--         `docs/FINANCE.md` §٣ و§٤ · `handover/CONVENTIONS.md` §٢ و§٦ و§٧
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (ق١) توسيع قيود `ledger_entries`
--
-- ⚠ **الأسماء من الكتالوج لا من الحدس.** الجدول يحمل قيدَين على `settlement_role`
-- لا واحداً: `ledger_entries_settlement_role_check` وُلد ضمنياً من `check` داخل
-- `create table` في 0015، و`ledger_entries_settlement_role_chk` أُضيف بعده باسم
-- صريح لتغطية القواعد التي سبقت تلك النسخة. **كلاهما حيٌّ في قاعدة بدر** (قُرئا
-- من `pg_constraint`)، وتوسيع أحدهما وحده يترك الآخر يرفض `received` — والفشل
-- يقع بعيداً عن هنا: عند أول تحصيل، داخل مُشغّل، برسالة لا تدل على سببها.
-- وكذلك `ledger_entries_source_type_check` ضمنيُّ الاسم لأنه من `create table`.
--
-- والقيود كلها **تُوسَّع لا تُضيَّق**، فكل صف قائم يحققها بالضرورة. ومع ذلك
-- نتحقق صراحةً قبل الإضافة: `not valid` غير مقبولة في هذا الجدول تحديداً —
-- قيدٌ غير مُتحقَّق منه على الدفتر يعني أن ما يحرسه ليس محروساً.
-- ----------------------------------------------------------------------------
do $$
declare
  v_bad bigint;
begin
  -- شاهد إيجابي للمسبار: الجدول موجود ومقروء (وإلا فكل عدٍّ بعده صفرٌ كاذب)
  if to_regclass('public.ledger_entries') is null then
    raise exception '0029: جدول ledger_entries غير موجود — الهجرة في غير موضعها';
  end if;

  select count(*) into v_bad
  from public.ledger_entries e
  where e.settlement_role is not null
    and e.settlement_role not in ('earned', 'collected', 'paid', 'received');
  if v_bad > 0 then
    raise exception '0029: % صفاً في الدفتر بدور تسوية خارج الأربعة — القيد الجديد سيرفضها', v_bad;
  end if;

  select count(*) into v_bad
  from public.ledger_entries e
  where e.source_type not in ('payment', 'expense', 'partner_payout',
                              'partner_collection', 'partner_settlement',
                              'refund', 'adjustment');
  if v_bad > 0 then
    raise exception '0029: % صفاً في الدفتر بمصدر خارج السبعة — القيد الجديد سيرفضها', v_bad;
  end if;

  select count(*) into v_bad
  from public.ledger_entries e
  where e.settlement_role is not null
    and e.settlement_role not in ('paid', 'received')
    and e.account_id is not null;
  if v_bad > 0 then
    raise exception
      '0029: % قيد التزام يحمل حساب خزينة — الثابت مكسور قبل التوسيع، أصلحه أولاً', v_bad;
  end if;
end;
$$;

-- (ق١-١) الدور الرابع — في القيدين معاً
alter table public.ledger_entries drop constraint if exists ledger_entries_settlement_role_check;
alter table public.ledger_entries
  add constraint ledger_entries_settlement_role_check
  check (settlement_role is null
         or settlement_role in ('earned', 'collected', 'paid', 'received'));

alter table public.ledger_entries drop constraint if exists ledger_entries_settlement_role_chk;
alter table public.ledger_entries
  add constraint ledger_entries_settlement_role_chk
  check (settlement_role is null
         or settlement_role in ('earned', 'collected', 'paid', 'received'));

-- (ق١-٢) 🔒 الثابت البنيوي، موسَّعاً بلا أن يفقد معناه:
--   **قيد النقد له حساب خزينة، وقيد الالتزام بلا حساب.**
--   `paid` و`received` هما قيدا النقد (يخرج ويدخل)، فيجوز لهما الحساب وحدهما.
--   `earned` و`collected` التزامان لا يمسّان الخزينة، فلا يجوز لهما حسابٌ أبداً —
--   لا بخطأ في دالة ولا بتعديل مباشر من محرر SQL.
alter table public.ledger_entries drop constraint if exists ledger_entries_liability_no_account_chk;
alter table public.ledger_entries
  add constraint ledger_entries_liability_no_account_chk
  check (settlement_role is null
         or settlement_role in ('paid', 'received')
         or account_id is null);

-- (ق١-٣) المصدر السابع
alter table public.ledger_entries drop constraint if exists ledger_entries_source_type_check;
alter table public.ledger_entries
  add constraint ledger_entries_source_type_check
  check (source_type in ('payment', 'expense', 'partner_payout',
                         'partner_collection', 'partner_settlement',
                         'refund', 'adjustment'));

comment on column public.ledger_entries.settlement_role is
  'دور القيد في المقاصة: earned مستحق رحلة، collected ما قبضه نقداً، paid ما دفعناه له، received ما سدّده لنا (0029). مخزَّن لا مستنتَج. والأول والثاني التزامان بلا حساب خزينة، والثالث والرابع نقدٌ بحساب حقيقي.';

-- ----------------------------------------------------------------------------
-- (ق٢) جدول `partner_settlements` — ما سدّده المتعهد لنا
--
-- على نمط `partner_payouts` حرفياً (‏`0015:209-227`) بزيادة عمود واحد:
-- `reference` — مرجع العملية. **إلزامي لغير النقدية** ويُفرض في الدالة لا في
-- القيد: النقدية لا تُنتج رقم عملية، وانستا باي والمحفظة والبنك كلها تُنتجه،
-- وبه وحده يُطابَق القيد مع كشف الحساب البنكي بعد شهرين.
-- ----------------------------------------------------------------------------
create table if not exists public.partner_settlements (
  id               uuid primary key default gen_random_uuid(),
  subcontractor_id uuid not null references public.subcontractors(id) on delete restrict,
  account_id       uuid not null references public.payment_accounts(id) on delete restrict,
  amount           numeric(12,2) not null check (amount > 0),
  occurred_at      timestamptz not null default now(),
  reference        text,
  note             text,
  created_by       uuid,
  created_at       timestamptz not null default now()
);

-- إعادة تنفيذ آمنة على قاعدة أُنشئ فيها الجدول قبل إضافة العمود
alter table public.partner_settlements add column if not exists reference text;

create index if not exists partner_settlements_sub_occurred_idx
  on public.partner_settlements (subcontractor_id, occurred_at desc);

comment on table public.partner_settlements is
  'ما سدّده المتعهدون لنا نقداً أو تحويلاً ضمن المقاصة — كل صف يولّد قيداً واحداً بدور received على حساب خزينة حقيقي: يرفع الرصيد ويخفض الدين معاً. المصدر: PartnerSettlementReceiptRow.';

comment on column public.partner_settlements.reference is
  'مرجع العملية — إلزامي لغير النقدية (يُفرض في record_partner_settlement لا في قيد الجدول، لأن النقدية لا تُنتج رقماً). به وحده يُطابَق القيد مع كشف الحساب البنكي لاحقاً.';

-- (ق٢-١) تجميد أعمدة المال
--
-- ⚠ الدالة المشتركة `finance_rows_immutable()` (‏0016) تجمّد المبلغ والحساب في كل
-- جدول، لكن تجميد **عمود المتعهد** كان مشروطاً بـ `v_source = 'partner_payout'`
-- بنصّه — لأن العمود لم يكن موجوداً إلا هناك يومها. وهو الآن في هذا الجدول أيضاً،
-- فبلا التوسيع يستطيع مشرفٌ أن ينقل تحصيلاً من متعهد إلى آخر بـ `update` واحد
-- فيروي الجدولُ والدفترُ روايتين — وهو بعينه ما كُتبت الدالة لمنعه.
-- التوسيع **إضافةٌ محضة**: مسار `expense` ومسار `partner_payout` لا يتغيّر فيهما
-- حرف. (0016 مطبَّق ولا يُعدَّل — D-03: التصحيح ترحيل جديد.)
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

  if new.occurred_at is distinct from old.occurred_at then
    update public.ledger_entries e
       set occurred_at = new.occurred_at
     where e.source_type = v_source
       and e.source_id   = new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists partner_settlements_immutable on public.partner_settlements;
create trigger partner_settlements_immutable
  before update on public.partner_settlements
  for each row execute function public.finance_rows_immutable('partner_settlement');

-- ----------------------------------------------------------------------------
-- (ق٢-٢) RLS وصلاحيات `partner_settlements` — نسخة `partner_payouts` حرفياً
--
-- السحب أولاً: إعدادات Supabase الافتراضية تمنح `anon` كل شيء على الجداول
-- الجديدة بما فيه `TRUNCATE` — **وهي لا تخضع لـ RLS إطلاقاً**.
-- ----------------------------------------------------------------------------
alter table public.partner_settlements enable row level security;

revoke all on public.partner_settlements from public, anon, authenticated;
grant select, insert, update, delete on public.partner_settlements to authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant select, insert, update, delete on public.partner_settlements to service_role';
  end if;
end;
$$;

drop policy if exists "partner_settlements_select_admin" on public.partner_settlements;
create policy "partner_settlements_select_admin"
  on public.partner_settlements for select to authenticated using (public.is_admin());

drop policy if exists "partner_settlements_insert_admin" on public.partner_settlements;
create policy "partner_settlements_insert_admin"
  on public.partner_settlements for insert to authenticated with check (public.is_admin());

drop policy if exists "partner_settlements_update_admin" on public.partner_settlements;
create policy "partner_settlements_update_admin"
  on public.partner_settlements for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "partner_settlements_delete_admin" on public.partner_settlements;
create policy "partner_settlements_delete_admin"
  on public.partner_settlements for delete to authenticated using (public.is_admin());

-- ----------------------------------------------------------------------------
-- (ق٣) مُشغّلا الدفتر — نسخة مطابقة لمُشغّلَي الدفعة بأربعة فروق
--
-- 🔒 **القيد الواحد يفعل الأمرين:** حسابٌ حقيقي + `direction = 'in'` ⇒ يرفع رصيد
-- الخزينة (‏`v_account_balances` تجمع `amount filter (direction = 'in')` على
-- القيود ذات الحساب وحدها)، و`settlement_role = 'received'` ⇒ يدخل معادلة
-- المقاصة بإشارة موجبة فيرفع `net_due` نحو الصفر أي **يخفض الدين**. لا قيدان
-- ولا تجميع في الواجهة.
-- ----------------------------------------------------------------------------
create or replace function public.ledger_on_partner_settlement_insert()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  -- فحص التكرار هو ما يجعل المُشغّل idempotent: إعادة تنفيذ أو نداء مزدوج لا
  -- يضاعف التحصيل فيمحو ديناً لم يُسدَّد
  if exists (
    select 1 from public.ledger_entries e
    where e.source_type     = 'partner_settlement'
      and e.source_id       = new.id
      and e.settlement_role = 'received'
  ) then
    return null;
  end if;

  insert into public.ledger_entries (
    account_id, direction, amount, occurred_at,
    source_type, source_id, subcontractor_id, settlement_role, note, created_by
  )
  values (
    new.account_id, 'in', new.amount, new.occurred_at,
    'partner_settlement', new.id, new.subcontractor_id, 'received',
    coalesce(nullif(btrim(coalesce(new.note, '')), ''), 'تحصيل من المتعهد'),
    coalesce(new.created_by, public.current_actor())
  );

  return null;
end;
$$;

drop trigger if exists partner_settlements_ledger_insert on public.partner_settlements;
create trigger partner_settlements_ledger_insert
  after insert on public.partner_settlements
  for each row execute function public.ledger_on_partner_settlement_insert();

-- الحذف لا يمحو قيداً — يكتب قيداً مقابلاً (الدفتر append-only، وهذا عقده)
create or replace function public.ledger_on_partner_settlement_deleted()
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
    e.account_id, 'out', e.amount, now(),
    'adjustment', e.source_id, e.subcontractor_id, e.settlement_role,
    'عكس تحصيل من متعهد حُذف من اللوحة', e.id, public.current_actor()
  from public.ledger_entries e
  where e.source_type = 'partner_settlement'
    and e.settlement_role = 'received'
    and e.source_id   = old.id
    and e.reverses_entry_id is null
    and not exists (
      select 1 from public.ledger_entries r where r.reverses_entry_id = e.id
    );

  return null;
end;
$$;

drop trigger if exists partner_settlements_ledger_deleted on public.partner_settlements;
create trigger partner_settlements_ledger_deleted
  after delete on public.partner_settlements
  for each row execute function public.ledger_on_partner_settlement_deleted();

-- مُشغّلات داخلية بحتة: لا تُمنح لأي دور مستخدم
revoke all on function public.ledger_on_partner_settlement_insert()  from public, anon, authenticated;
revoke all on function public.ledger_on_partner_settlement_deleted() from public, anon, authenticated;
revoke all on function public.finance_rows_immutable()               from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- (ق٤) `v_partner_settlements` — المعادلة الجديدة و`received` عموداً ١١
--
-- ⚠ `create or replace view` لا تسمح بإعادة ترتيب الأعمدة القائمة ولا بتنويعها
-- ولا بحذفها. فالعشرة الأولى تبقى بأسمائها وأنواعها وترتيبها حرفياً، و`received`
-- **يُلحق في آخر القائمة** (نفس قاعدة 0017 و0027 ق١٢).
--
-- و`net_due` تتغيّر **صيغته** لا نوعه، ومعه `abs_net_due` و`owed_to_us`
-- و`over_limit` — كلها مشتقة من التعبير نفسه فتتبعه تلقائياً.
--
-- والتعبير مكتوب **مرة واحدة** في `x` جانبيّة بدل أربع نسخ متطابقة: مصدرٌ واحد
-- لرقم واحد (النمط ٨ في LESSONS). و`cross join lateral` لا تضيف عموداً إلى
-- الإخراج فلا تمسّ شرط `create or replace`.
-- ----------------------------------------------------------------------------
create or replace view public.v_partner_settlements
with (security_invoker = true)
as
select
  s.id            as subcontractor_id,
  s.company_name,
  g.earned::numeric(14, 2)    as earned,
  g.collected::numeric(14, 2) as collected,
  g.paid::numeric(14, 2)      as paid,
  x.net::numeric(14, 2)       as net_due,
  g.trips_count,
  abs(x.net)::numeric(14, 2)  as abs_net_due,
  greatest(-x.net, 0)::numeric(14,2) as owed_to_us,
  -- ⚠ العمود يقيس **بلوغ السقف وحده** ولا يقرأ `block_dispatch`: لو خلطهما
  -- لاختفى الوسم عن كل المتجاوزين بمجرد إطفاء الحجب — فيفقد المالك رؤيتهم لا
  -- مجرد حجبهم. الحجب حكمٌ آخر مكانه `partner_over_debt_limit()` وحدها.
  (coalesce(cs.debt_limit, 0) > 0
   and greatest(-x.net, 0) >= cs.debt_limit) as over_limit,
  -- 0029: العمود ١١ — ما سدّده المتعهد لنا نقداً أو تحويلاً
  g.received::numeric(14, 2)  as received
from (
  select
    r.subcontractor_id,
    coalesce(sum(r.sign::numeric * r.amount) filter (where r.partner_kind = 'earned'), 0)    as earned,
    coalesce(sum(r.sign::numeric * r.amount) filter (where r.partner_kind = 'collected'), 0) as collected,
    coalesce(sum(r.sign::numeric * r.amount) filter (where r.partner_kind = 'paid'), 0)      as paid,
    coalesce(sum(r.sign::numeric * r.amount) filter (where r.partner_kind = 'received'), 0)  as received,
    count(distinct r.booking_id) filter (where r.partner_kind = 'earned' and r.sign = 1)     as trips_count
  from public.v_ledger_resolved r
  where r.subcontractor_id is not null and r.partner_kind is not null
  group by r.subcontractor_id
) g
join public.subcontractors s on s.id = g.subcontractor_id
left join public.partner_credit_settings cs on cs.id
cross join lateral (
  -- المعادلة كاملةً في موضع واحد: موجب ⇒ ندفع له، وسالب ⇒ يدفع لنا
  select (g.earned - g.collected - g.paid + g.received) as net
) x;

comment on view public.v_partner_settlements is
  'مقاصة كل متعهد: net_due = earned − collected − paid + received. موجب = ندفع له، وسالب = يدفع لنا. المصدر: PartnerSettlement.';

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
  raise notice '✔ 0029 ق٤: received في عرض المقاصة والمعادلة رباعية';
end $$;

-- ----------------------------------------------------------------------------
-- (ق٥) `partner_statement` — الدور الرابع في الكشف
--
-- منقولة عن `0015:901-979` حرفياً بتغييرين لا ثالث لهما:
--
--  (١) صيغة الإشارة في **موضعيها** — رصيد ما قبل الفترة، وسطور الفترة:
--      `received` يزيد ما له علينا تماماً كـ `earned` (كلاهما `+` في المعادلة).
--      وبدونه لا ينتهي الرصيد المتحرك عند `net_due`، وذلك هو **عقد هذه الدالة
--      المكتوب في ترويستها**. وموضعٌ واحدٌ منسيٌّ يكفي لكسره: الرصيد الافتتاحي
--      يبتلع كل تحصيل وقع قبل الفترة فينحرف الكشف كله بمقدار ثابت.
--  (٢) تسمية النوع: `received` ⇒ `'settlement'`. وترتيب الـ `case` مقصود —
--      أول شرط `origin_source = 'adjustment'`، وقيد التحصيل مصدره
--      `partner_settlement` فلا يلتقطه، وهو المطلوب. وقيدُ عكسٍ لتحصيل يرث
--      مصدر أصله فيُقرأ `settlement` أيضاً.
--
-- قاعدة الطرفين (والعقد وصفي في تسميتها، والحساب هو الحاكم):
--   دائن (credit) = مستحق رحلة، **وما سدّده لنا** ⇒ يزيد ما له علينا.
--   مدين (debit)  = ما حصّله نقداً، وما دفعناه له ⇒ كلاهما يُنقص ما له علينا.
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

  -- رصيد ما قبل الفترة (بنفس قاعدة الإشارة أدناه — الموضع الأول)
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
      b.reference                                                             as l_ref,
      -- الموضع الثاني لقاعدة الإشارة
      r.sign * r.amount
      * case when r.partner_kind in ('earned', 'received') then 1 else -1 end
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
  'كشف حساب متعهد زمنياً برصيد متحرك ينتهي عند net_due. الأدوار الأربعة: earned و received دائنان (+)، و collected و paid مدينان (−) — والقاعدة نفسها في رصيد ما قبل الفترة وفي سطورها. المصدر: PartnerStatementLine.';

revoke all    on function public.partner_statement(uuid, date, date) from public, anon, authenticated;
grant execute on function public.partner_statement(uuid, date, date) to authenticated;

-- ----------------------------------------------------------------------------
-- (ق٦) `record_partner_settlement(...)` — تسجيل ما سدّده المتعهد
--
-- على هيكل `record_partner_payout` (‏`0015:1220-1302`) حرفياً، بحارسٍ سادس:
-- **المرجع إلزامي لغير النقدية**. والقاعدة تفرضه ثانيةً بعد الواجهة — الواجهة
-- تفسّر ولا تحرس.
--
-- ⚠ **تجاوز الدين مسموح عمداً**: المبلغ قد يفوق ما على المتعهد فيصير الصافي
-- موجباً (صار له علينا) — وهذا مشروع تماماً: متعهدٌ يسدّد مقدَّماً عن رحلات
-- قادمة، أو يسدّد رقماً مستديراً. **لا تضف هنا فحص «المبلغ يفوق الدين»** بحسن
-- نية: ستمنع سلوكاً محاسبياً سليماً وتدفع المشرف إلى تسويات يدوية غامضة.
-- ----------------------------------------------------------------------------
create or replace function public.record_partner_settlement(
  p_sub       uuid,
  p_account   uuid,
  p_amount    numeric,
  p_at        timestamptz,
  p_reference text,
  p_note      text
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
  v_ref     text;
  v_kind    text;
  v_net     numeric;
  v_balance numeric;
begin
  if not public.finance_admin_allowed() then
    raise exception 'تسجيل تحصيل من المتعهدين متاح للإدارة فقط' using hint = 'forbidden';
  end if;

  v_amount := round(coalesce(p_amount, 0), 2);
  if v_amount <= 0 then
    raise exception 'قيمة التحصيل يجب أن تكون أكبر من صفر' using hint = 'invalid-input';
  end if;

  if p_sub is null
     or not exists (select 1 from public.subcontractors s where s.id = p_sub) then
    raise exception 'المتعهد غير موجود' using hint = 'not-found';
  end if;

  select pa.kind into v_kind
  from public.payment_accounts pa
  where pa.id = p_account;

  if p_account is null or v_kind is null then
    raise exception 'حساب الخزينة غير موجود' using hint = 'account-not-found';
  end if;

  -- المرجع إلزامي لغير النقدية: المحفظة وانستا باي والبنك والبوابة كلها تُنتج
  -- رقم عملية، وبه وحده يُطابَق القيد مع كشف الحساب بعد شهرين. والنقدية لا تُنتجه.
  v_ref := nullif(btrim(coalesce(p_reference, '')), '');
  if v_kind <> 'cash' and v_ref is null then
    raise exception 'مرجع العملية مطلوب لغير النقدية — رقم التحويل أو العملية'
      using hint = 'reference-required';
  end if;

  v_at := coalesce(p_at, now());

  -- المُشغّل هو من يكتب القيد (‏`partner_settlements_ledger_insert`)
  insert into public.partner_settlements as x (
    subcontractor_id, account_id, amount, occurred_at, reference, note, created_by
  )
  values (
    p_sub, p_account, v_amount, v_at, v_ref,
    nullif(btrim(coalesce(p_note, '')), ''),
    public.current_actor()
  )
  returning x.id into v_id;

  select e.id into v_entry
  from public.ledger_entries e
  where e.source_type     = 'partner_settlement'
    and e.source_id       = v_id
    and e.settlement_role = 'received'
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

comment on function public.record_partner_settlement(uuid, uuid, numeric, timestamptz, text, text) is
  'تسجيل ما سدّده المتعهد لنا — الاتجاه الثاني للحساب المفتوح. صفٌّ في partner_settlements ومُشغّله يكتب قيداً واحداً بدور received على حساب خزينة حقيقي: يرفع الرصيد ويخفض الدين معاً. المرجع إلزامي لغير النقدية. وتجاوز الدين مسموح عمداً (سداد مقدَّم) فلا تضف له فحصاً.';

revoke all    on function public.record_partner_settlement(uuid, uuid, numeric, timestamptz, text, text)
  from public, anon, authenticated;
grant execute on function public.record_partner_settlement(uuid, uuid, numeric, timestamptz, text, text)
  to authenticated;

-- ----------------------------------------------------------------------------
-- (ق٧) إغلاق فخ المبلغ السالب في `record_partner_adjustment`
--
-- **المبرر:** الدالة تحسب `direction` من إشارة المبلغ، بينما `v_partner_settlements`
-- تتجاهل `direction` تماماً وتجمع `sign * amount` — و`sign` لا يصير ‎−1‎ إلا للقيد
-- العاكس. فالمبلغ السالب يُخزَّن بـ `abs()` مع اتجاه معكوس ⇒ **يعمّق الدين بدل أن
-- يخفضه**. عيبٌ كامن منذ 0016 بلا مستدعٍ في الواجهة، **قيس أثره حياً** على قاعدة
-- بدر (‏61,034− ⇒ 61,134− بعد `collected,-100`) — فأُغلق هنا لا وُثِّق فقط.
--
-- والمخرج الصحيح مساران لا ثالث لهما: `record_partner_settlement` للتحصيل
-- الحقيقي (وله أثر خزينة)، و`reverse_ledger_entry` لعكس قيد بعينه أُخطئ فيه.
-- ----------------------------------------------------------------------------
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
  -- 0029: الفخ المُغلَق — انظر ترويسة القسم
  if p_amount < 0 then
    raise exception 'التسوية بمبلغ سالب لا تخفض دين المتعهد — استعمل record_partner_settlement للتحصيل، أو reverse_ledger_entry لعكس قيد بعينه'
      using hint = 'negative-amount';
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

comment on function public.record_partner_adjustment(uuid, text, numeric, timestamptz, text) is
  'تسوية على حساب المتعهد (بلا خزينة) لتصحيح مستحق أو تحصيل بعد الاكتمال. 0029: ترفض المبلغ السالب — كان يعمّق الدين بدل أن يخفضه لأن العرض يتجاهل direction ويجمع sign*amount. للتحصيل الحقيقي record_partner_settlement، ولعكس قيد بعينه reverse_ledger_entry.';

revoke all    on function public.record_partner_adjustment(uuid, text, numeric, timestamptz, text)
  from public, anon, authenticated;
grant execute on function public.record_partner_adjustment(uuid, text, numeric, timestamptz, text)
  to authenticated;

-- ----------------------------------------------------------------------------
-- (ق٨) `portal_balance()` — رصيد المتعهد كما يراه في بورتاله
--
-- 🔒 **بلا وسيط إطلاقاً.** النطاق داخلها عبر `current_subcontractor_id()`، فلا
-- يمكن تمرير معرّف متعهد آخر ولو بالتجربة — وهذا بعينه الفرق بينها وبين تسريب
-- D-20 وسابقة `coverage_matches` في 0011. وبلا هوية متعهد ⇒ **صفر صفوف**.
--
-- ولماذا `security definer` وهي ممنوحة لـ `authenticated`: `v_partner_settlements`
-- عرض `security_invoker` فوق `ledger_entries` المحروس بـ `is_admin()`، فقراءته
-- بهوية المتعهد تعود بصفر صفوف بهدوء ⇒ رصيده صفر دائماً وشريط الحجب لا يظهر
-- لمن وُضع لأجله. والحارس هنا **داخلي وبنيوي** لا في الصلاحية.
--
-- ⚠ ولا تُرجع `block_payout` ولا أي إعداد آخر: ما لا يحتاجه لا يراه (الأمان
-- بنيوي — ما لا يوجد في نوع الإرجاع لا يُسرَّب بخطأ في الواجهة).
-- ----------------------------------------------------------------------------
create or replace function public.portal_balance()
returns table (
  earned          numeric,
  collected       numeric,
  paid            numeric,
  received        numeric,
  net_due         numeric,
  owed_to_us      numeric,
  debt_limit      numeric,
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
  v_cfg       record;
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

  select * into v_cfg from public.partner_credit_config();
  v_limit := coalesce(v_cfg.debt_limit, 0);
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
  debt_limit      := v_limit;
  blocked         := v_block;
  -- ما يكفي للنزول **تحت** السقف: الحجب عند `>=` فالقرش الواحد يفكّه
  amount_to_clear := case when v_block then round(v_owed - v_limit + 0.01, 2) else 0 end;
  return next;
end;
$$;

comment on function public.portal_balance() is
  'رصيد المتعهد الحالي وحده كما يراه في بورتاله. 🔒 بلا وسيط إطلاقاً — النطاق داخلها عبر current_subcontractor_id()، فلا يمكن تمرير معرّف متعهد آخر ولو بالتجربة. بلا هوية متعهد ⇒ صفر صفوف، وبلا قيود في الدفتر ⇒ أصفار لا null. ولا تُرجع block_payout ولا أي إعداد آخر.';

revoke all    on function public.portal_balance() from public, anon, authenticated;
grant execute on function public.portal_balance() to authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.record_partner_settlement(uuid, uuid, numeric, timestamptz, text, text) to service_role';
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- (ق٩) الفحص الذاتي — تسقط الهجرة إن بقي شيء مما فوق ناقصاً
--
-- قاعدة هذا القسم (‏0025 §٦ والنمط ٩ في LESSONS): **كل فحص سالب يسبقه شاهد
-- إيجابي.** فحصٌ يبحث عن مخالفة في مجموعة فارغة ينجح دائماً ولا يثبت شيئاً.
-- ----------------------------------------------------------------------------
do $$
declare
  v_acc     uuid;
  v_ok      boolean;
  v_cols    text;
  v_src     text;
  v_leak    text;
  v_missing text;
  v_nargs   smallint;
begin
  -- (ق٩-٠) شاهد إيجابي شامل: الكائنات الجديدة موجودة بتواقيعها الحرفية
  select string_agg(x.sig, '، ')
    into v_missing
  from (values
    ('public.record_partner_settlement(uuid,uuid,numeric,timestamptz,text,text)'),
    ('public.portal_balance()'),
    ('public.ledger_on_partner_settlement_insert()'),
    ('public.ledger_on_partner_settlement_deleted()'),
    ('public.record_partner_adjustment(uuid,text,numeric,timestamptz,text)'),
    ('public.partner_statement(uuid,date,date)')
  ) as x(sig)
  where to_regprocedure(x.sig) is null;
  if v_missing is not null then
    raise exception '0029: دوال ناقصة بعد التنفيذ: %', v_missing;
  end if;
  if to_regclass('public.partner_settlements') is null then
    raise exception '0029: جدول partner_settlements غير موجود بعد التنفيذ';
  end if;

  -- (ق٩-١) القيود الثلاثة تقبل `received` و`partner_settlement` **فعلاً**
  --
  -- إدراجٌ في معاملة فرعية يُرجَع دائماً: نجاحه يُنهى بخطأ مفتعل فيندثر أثره،
  -- وفشله يُلتقط. والدفتر لا يُترك فيه صفٌّ من مسبار.
  select pa.id into v_acc from public.payment_accounts pa order by pa.sort limit 1;

  -- (أ) الشاهد الإيجابي: دورٌ خارج الأربعة **مرفوض** — فالمسبار يرى القيد حقاً
  v_ok := false;
  begin
    insert into public.ledger_entries (
      account_id, direction, amount, occurred_at, source_type, settlement_role, note
    ) values (null, 'in', 1, now(), 'adjustment', 'received_bogus', 'مسبار 0029');
    v_ok := true;
    raise exception 'probe-rollback-0029';
  exception
    when others then
      if sqlerrm = 'probe-rollback-0029' then
        null;  -- الإدراج نجح — سنبلّغ أدناه
      end if;
  end;
  if v_ok then
    raise exception '0029: قيد الدفتر قبِل دوراً خارج الأربعة — المسبار أعمى وما بعده لا يُصدَّق';
  end if;

  -- (ب) والدور الرابع بمصدره السابع **مقبول**
  v_ok := false;
  begin
    insert into public.ledger_entries (
      account_id, direction, amount, occurred_at, source_type, settlement_role, note
    ) values (null, 'in', 1, now(), 'partner_settlement', 'received', 'مسبار 0029');
    v_ok := true;
    raise exception 'probe-rollback-0029';
  exception
    when others then
      if sqlerrm <> 'probe-rollback-0029' then
        raise exception '0029: الدفتر يرفض (received / partner_settlement) — %', sqlerrm;
      end if;
  end;
  if not v_ok then
    raise exception '0029: الدفتر يرفض (received / partner_settlement) بلا رسالة';
  end if;

  if v_acc is not null then
    -- (ج) قيد النقد **بحساب حقيقي** مقبول — وهو نصف الثابت
    v_ok := false;
    begin
      insert into public.ledger_entries (
        account_id, direction, amount, occurred_at, source_type, settlement_role, note
      ) values (v_acc, 'in', 1, now(), 'partner_settlement', 'received', 'مسبار 0029');
      v_ok := true;
      raise exception 'probe-rollback-0029';
    exception
      when others then
        if sqlerrm <> 'probe-rollback-0029' then
          raise exception '0029: قيد received بحساب خزينة مرفوض — التحصيل لن يحرّك الخزينة أبداً: %', sqlerrm;
        end if;
    end;
    if not v_ok then
      raise exception '0029: قيد received بحساب خزينة مرفوض بلا رسالة';
    end if;

    -- (د) وقيد الالتزام بحساب **ما زال مرفوضاً** — وهو النصف الآخر، ولولا هذا
    --     الفحص لمرّ توسيعٌ متساهل يجعل «مستحق المتعهد» يحرّك الخزينة
    v_ok := false;
    begin
      insert into public.ledger_entries (
        account_id, direction, amount, occurred_at, source_type, settlement_role, note
      ) values (v_acc, 'out', 1, now(), 'adjustment', 'earned', 'مسبار 0029');
      v_ok := true;
      raise exception 'probe-rollback-0029';
    exception
      when others then
        null;
    end;
    if v_ok then
      raise exception
        '0029: قيد التزام (earned) قبِل حساب خزينة — الثابت انكسر: المستحق صار يحرّك الرصيد';
    end if;
  else
    raise notice '⚠ 0029: لا حساب خزينة في القاعدة — فحصا الثابت (ج) و(د) لم يُشغَّلا';
  end if;

  -- (ق٩-٢) العرض: `security_invoker` قائم، والعشرة الأولى بترتيبها، و`received` ١١
  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'v_partner_settlements'
      and c.reloptions::text like '%security_invoker=true%'
  ) then
    raise exception '0029: v_partner_settlements فقدت security_invoker — عزل الشركاء ينهار';
  end if;

  select string_agg(c.column_name, ',' order by c.ordinal_position)
    into v_cols
  from information_schema.columns c
  where c.table_schema = 'public' and c.table_name = 'v_partner_settlements'
    and c.ordinal_position <= 10;
  if v_cols is null then
    raise exception '0029: مسبار أعمدة العرض أعمى — لا يقرأ عموداً واحداً';
  end if;
  if v_cols <> 'subcontractor_id,company_name,earned,collected,paid,net_due,trips_count,abs_net_due,owed_to_us,over_limit' then
    raise exception '0029: ترتيب أعمدة v_partner_settlements العشرة الأولى تغيّر (%) — كل مستهلك يقرأ عموداً بمكان عمود آخر', v_cols;
  end if;

  if not exists (
    select 1 from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = 'v_partner_settlements'
      and c.column_name = 'received' and c.ordinal_position = 11
  ) then
    raise exception '0029: received ليس العمود ١١ في v_partner_settlements';
  end if;

  if not exists (
    select 1 from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = 'v_partner_settlements'
      and c.column_name = 'net_due'
      and c.data_type = 'numeric' and c.numeric_precision = 14 and c.numeric_scale = 2
  ) then
    raise exception '0029: نوع net_due تغيّر — الصيغة وحدها كان يجوز أن تتغيّر';
  end if;

  -- (ق٩-٣) كشف الحساب يعرف الدور الرابع — مع شاهد إيجابي أن المسبار يقرأ المصدر
  v_src := pg_get_functiondef(to_regprocedure('public.partner_statement(uuid,date,date)')::oid);
  if v_src is null or position('partner_kind' in v_src) = 0 then
    raise exception '0029: مسبار مصدر partner_statement أعمى — لا تصدّق ما بعده';
  end if;
  if position('received' in v_src) = 0 then
    raise exception
      '0029: partner_statement لا تعرف received — الرصيد المتحرك لن ينتهي عند net_due، وذلك عقدها المكتوب';
  end if;

  -- والموضعان معاً: صيغة الإشارة مكتوبة مرتين (رصيد ما قبل الفترة، وسطور الفترة)
  if (length(v_src) - length(replace(v_src, '''earned'', ''received''', ''))) / length('''earned'', ''received''') < 2 then
    raise exception
      '0029: صيغة الإشارة في partner_statement في موضع واحد لا موضعين — الرصيد الافتتاحي يبتلع كل تحصيل سبق الفترة';
  end if;

  -- (ق٩-٤) الجديدتان ممنوعتان عن `anon` — ومعطاتان لمن يحتاجهما (شاهد إيجابي)
  if exists (select 1 from pg_roles where rolname = 'anon') then
    select string_agg(f.sig, '، ')
      into v_leak
    from (values
      ('public.record_partner_settlement(uuid,uuid,numeric,timestamptz,text,text)'),
      ('public.portal_balance()')
    ) as f(sig)
    where has_function_privilege('anon', f.sig, 'EXECUTE');
    if v_leak is not null then
      raise exception '0029: دوال مفتوحة للزائر: %', v_leak;
    end if;
  end if;

  if not has_function_privilege('authenticated',
       'public.record_partner_settlement(uuid,uuid,numeric,timestamptz,text,text)', 'EXECUTE') then
    raise exception '0029: authenticated بلا EXECUTE على record_partner_settlement — شاشة التسوية تنكسر';
  end if;
  if not has_function_privilege('authenticated', 'public.portal_balance()', 'EXECUTE') then
    raise exception '0029: authenticated بلا EXECUTE على portal_balance — بطاقة رصيد البورتال تنكسر';
  end if;

  -- ولا منح ضمني لـ PUBLIC (‏grantee = 0) — وهو ما تمنحه Supabase لكل دالة جديدة
  if exists (
    select 1
    from pg_proc pr
    cross join lateral aclexplode(coalesce(pr.proacl, acldefault('f', pr.proowner))) a
    where pr.oid = 'public.portal_balance()'::regprocedure
      and a.grantee = 0
  ) then
    raise exception '0029: portal_balance ممنوحة لـ PUBLIC — كل دور في القاعدة ينفّذها';
  end if;

  -- (ق٩-٥) 🔒 فحص بنيوي: `portal_balance` **بلا وسائط**
  --
  -- لا يمنع اليومَ شيئاً — يمنع الغد: من يضيف لاحقاً `p_sub uuid` بحسن نية
  -- يحوّلها إلى تسريب رصيد كل متعهد لكل متعهد (سابقة D-20)، وسيصطدم هنا.
  select pr.pronargs into v_nargs
  from pg_proc pr where pr.oid = 'public.portal_balance()'::regprocedure;
  if coalesce(v_nargs, -1) <> 0 then
    raise exception
      '0029: portal_balance صار لها % وسيط — النطاق يجب أن يبقى داخلياً عبر current_subcontractor_id()', v_nargs;
  end if;

  -- (ق٩-٦) الجدول محروس: RLS مفعّل وأربع سياسات إدارية
  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'partner_settlements' and c.relrowsecurity
  ) then
    raise exception '0029: partner_settlements بلا RLS — كل مسجَّل يقرأ تحصيلات كل متعهد';
  end if;
  if (select count(*) from pg_policies p
       where p.schemaname = 'public' and p.tablename = 'partner_settlements') <> 4 then
    raise exception '0029: سياسات partner_settlements ليست أربعاً';
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon')
     and has_table_privilege('anon', 'public.partner_settlements', 'SELECT') then
    raise exception '0029: anon يقرأ partner_settlements';
  end if;

  raise notice '✔ 0029: الدور الرابع received (قيود الدفتر · جدول partner_settlements ومُشغّلاه · المعادلة الرباعية في العرض والكشف · record_partner_settlement بمرجع إلزامي لغير النقدية · فخ المبلغ السالب مُغلَق · portal_balance بلا وسيط)';
end;
$$;
