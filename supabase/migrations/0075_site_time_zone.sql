-- ============================================================================
-- 0075_site_time_zone.sql — المنطقة الزمنية إعدادُ مالكٍ لا ثابتٌ في الكود
--
-- ── لماذا الآن، ولماذا هي مسألة معمارية لا راحة ──────────────────────────────
--
-- «القاهرة» كانت مثبّتة عمداً في م‑٢ (الخادم UTC والعميل في مصر، فبلا تثبيتها
-- يظهر موعد الانطلاق بساعةٍ أخرى). والتثبيت كان صحيحاً لنسخةٍ واحدة — وهو
-- بالضبط ما تمنعه **المرحلة ١٤** (مصنع الـwhitelabel، D-01): نسخةٌ في الرياض
-- أو دبي بتوقيتٍ مثبّتٍ في الكود تعني **تفريع كودٍ لكل علامة**. فهذا الملف
-- يزيح العائق قبل أن يُصطدم به، لا بعده.
--
-- ── 🔴 الخاصّية التي يجب أن تبقى: الإعداد **لا يفسّر الماضي من جديد** ────────
--
-- التخزين **UTC صحيحٌ سلفاً** — قيس حياً قبل هذا العمل: ‏`2026-09-14T10:00`
-- بتوقيت القاهرة يُخزَّن `2026-09-14T07:00:00.000Z`. فالإعداد يحكم شيئين لا
-- ثالث لهما: **تفسيرَ المُدخل** (ساعةُ الحائط التي يكتبها العميل) و**تنسيقَ
-- المُخرَج** (ساعةُ الحائط التي يقرؤها). أما اللحظة المخزَّنة فلا يمسّها.
--
-- ولذلك تحويلُ المالك للإعداد من القاهرة إلى الرياض **يجب ألا يزحزح حجزاً
-- قائماً**: اللحظة نفسها، معروضةً بساعةٍ أخرى. وكلُّ مسارٍ يفشل في هذا كان
-- يقرأ المنطقة حيث كان يجب أن يقرأ اللحظة المخزَّنة — وذلك عيبٌ يُكتشف لا
-- يُستحدث. (البرهان في `supabase/tests/timezone_tests.sql` القسم (ج).)
--
-- ── 🔴 مصدرٌ واحد يُقرأ في كل موضع — وإلا كان الإعدادُ كذبة ──────────────────
--
-- «إعدادٌ يتجاهله عشرة مستدعين أسوأ من ثابت.» فالجرد كان كاملاً قبل التعديل:
-- **١٢ دالة و٥ عروض** في الكتالوج الحيّ تحمل النصّ `'Africa/Cairo'`، وكلها
-- تُحوَّل هنا إلى نداء `public.site_time_zone()`. وفحصٌ ذاتي (٥-أ) يُسقط الهجرة
-- إن بقي نصٌّ حرفيٌّ واحد في أي دالة أو عرض — وهو **الحارس الذي يبقى حيّاً
-- لما بعد هذه الهجرة**، فأيّ دالةٍ جديدة تُكتب بالنصّ الحرفي تُمسَك.
--
-- ⚠ **والأجسام منقولةٌ من `pg_get_functiondef` / `pg_get_viewdef` لا من ملفّات
-- الهجرات (D-58).** الفرق الوحيد عن المُنتَج الحيّ هو استبدال النصّ الحرفي
-- بالنداء — لا سطر غيره. ونسخُ جسمٍ من هجرةٍ سابقة هو حرفياً ما أعاد عيب
-- `dispatch_ceiling` حيّاً في `0031` بعد إصلاحه في `0014`.
--
-- ── ولماذا اسم IANA لا إزاحة ────────────────────────────────────────────────
--
-- `+02:00` تنكسر عند التوقيت الصيفي، **ومصر تعمل به** منذ 2023 (‏`+03:00` من
-- آخر جمعة في أبريل إلى آخر خميس في أكتوبر). فالمخزَّن اسمٌ من قاعدة IANA،
-- ومنه تُشتقّ الإزاحةُ لحظةً بلحظة من قاعدة المناطق الحيّة.
--
-- ── والتحقّق في القاعدة أيضاً، لا في النموذج وحده ────────────────────────────
--
-- `trip_settings` قابل للتحرير من محرّر SQL ومن PostgREST بجلسة مشرف — فحارسٌ
-- في الواجهة وحدها ليس حارساً (سابقة `0014` و`0027` و`0045`). والتحقّق
-- **مُشغّلٌ يسأل `pg_timezone_names`** — أي قاعدةَ المناطق التي يشغّلها
-- Postgres نفسه، لا مصفوفةً مكتوبةً بيدٍ تتقادم. ولا يصلح `check` هنا: لا
-- استعلامات فرعية داخل قيود `check`، و`at time zone <نصّ>` مصنّفة `stable`.
--
-- الافتراضي `Africa/Cairo` — **فالتركيب القائم لا يتغيّر سلوكه بحرف**، وفحصٌ
-- ذاتي (٥-ج) يفرض ذلك.
--
-- المرجع: 0027 (‏`trip_settings`) · 0067 (سابقة توسيعه بعمود سياسة) · 0022/0023
--         (الإحصاءات والقمع) · 0034/0035 (نبض الصفحات) · 0036 (سجل التدقيق)
--         · 0031 (‏`derive_waiting_hours` · D-57) · 0070 (سقوف الحسابات)
--         · D-01 · D-04 · D-05 · D-58 · `docs/VISION.md` المرحلة ١٤.
-- الاختبار: supabase/tests/timezone_tests.sql
-- آمنة لإعادة التنفيذ بالكامل.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (١) العمود — اسم منطقة IANA، افتراضُه القاهرة
--
-- القيد هنا **شكليٌّ محض** (طولٌ ومحارف مسموحة): يمنع النصّ الحرّ وحقن مسافةٍ
-- أو فاصلة، ولا يدّعي معرفة قائمة المناطق. والوجود الفعليّ في قاعدة المناطق
-- يفرضه المُشغّل في (٢) — والقسمة مقصودة: ما يستطيع `check` فرضه يفرضه، وما
-- يحتاج استعلاماً يذهب إلى مُشغّل.
-- ----------------------------------------------------------------------------
alter table public.trip_settings
  add column if not exists time_zone text not null default 'Africa/Cairo';

alter table public.trip_settings drop constraint if exists trip_settings_time_zone_shape_chk;
alter table public.trip_settings add constraint trip_settings_time_zone_shape_chk
  check (
    time_zone ~ '^[A-Za-z][A-Za-z0-9+_-]*(/[A-Za-z0-9+_.-]+){0,2}$'
    and length(time_zone) between 1 and 64
  );

comment on column public.trip_settings.time_zone is
  'اسم منطقة IANA التي يعمل بها الموقع (مثال: Africa/Cairo). تحكم **تفسير ما يكتبه العميل** و**تنسيق ما يُعرض له** — ولا تمسّ اللحظة المخزَّنة أبداً: تغييرها يعرض الحجز القائم بساعةٍ أخرى ولا يزحزحه.';

-- ----------------------------------------------------------------------------
-- (٢) الحارس في القاعدة — من قاعدة المناطق التي يشغّلها Postgres نفسه
--
-- ⚠ لا يُستبدل بمصفوفةٍ مكتوبة: قائمة IANA تتغيّر (مصر نفسها أعادت التوقيت
-- الصيفي في 2023)، والمصفوفة المكتوبة تتقادم بصمتٍ فترفض منطقةً صحيحة.
-- ----------------------------------------------------------------------------
create or replace function public.trip_settings_time_zone_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.time_zone is null
     or not exists (
       select 1 from pg_catalog.pg_timezone_names t where t.name = new.time_zone
     )
  then
    raise exception 'منطقة زمنية غير معروفة: %', coalesce(new.time_zone, '(فارغة)')
      using hint = 'invalid-timezone';
  end if;
  return new;
end;
$$;

drop trigger if exists trip_settings_time_zone_guard on public.trip_settings;
create trigger trip_settings_time_zone_guard
  before insert or update of time_zone on public.trip_settings
  for each row execute function public.trip_settings_time_zone_guard();

-- ----------------------------------------------------------------------------
-- (٣) المصدر الواحد — الدالة التي تقرؤها كل دالة وكل عرض
--
-- **`security definer` لازمةٌ لا تشديدٌ زائد:** `trip_settings` محروسٌ بـ
-- `is_admin()` وغير ممنوح لـ`anon` إطلاقاً، بينما المنطقة يحتاجها مسارُ الحجز
-- العام (‏`derive_waiting_hours` داخل `create_booking`) وكلُّ تنسيق تاريخٍ على
-- صفحةٍ عامة. وقراءةٌ بهوية الزائر **لا تفشل بل تعود بصفر صفوف** ⇒ سقوطٌ صامت
-- إلى الافتراضي وفارقُ ساعةٍ لا يشتكي منه أحد (نفس علّة `portal_balance` في
-- 0029).
--
-- **وما تكشفه لا يزيد على ما تكشفه الصفحة نفسها:** اسمُ المنطقة ظاهرٌ في كل
-- تاريخٍ مُنسَّق على الموقع. ونوعُ الإرجاع `text` وحده — لا صفّ إعداداتٍ ولا
-- عمودٌ ثانٍ يُسرَّب بخطأ واجهة (D-18).
--
-- 🔒 **وبلا وسيط، أبداً.** وسيطٌ يُضاف يوماً «ليقرأ نسخةً أخرى» ينقض D-01 من
-- بابٍ خلفي. وفحصٌ (٥-ب) يعدّها **بالاسم** في `pg_proc` — لا بـ`regprocedure`
-- التي لا تُحلّ إلا إلى دالة الصفر وسيط فتؤكّد ما تفترضه (النمط ٩، `0030`).
-- ----------------------------------------------------------------------------
create or replace function public.site_time_zone()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  -- الافتراضي fallback دائم لا مصدر (D-04): صفٌّ محذوف لا يوقف تنسيق تاريخ
  select coalesce(
    (select t.time_zone from public.trip_settings t where t.id limit 1),
    'Africa/Cairo'
  );
$$;

revoke all on function public.site_time_zone() from public;
grant execute on function public.site_time_zone() to anon, authenticated, service_role;

comment on function public.site_time_zone() is
  'المنطقة الزمنية السارية للموقع (اسم IANA). المصدر الوحيد لكل دالة وكل عرض — لا يُكتب `at time zone ''...''` بنصّ حرفي في أي مكان بعد 0075، وفحص الهجرة الذاتي يُسقط أي عودة إليه.';

-- ----------------------------------------------------------------------------
-- (٤) التحويل — ١٢ دالة و٥ عروض تقرأ المصدر الواحد بدل النصّ الحرفي
--
-- ⚠ **الأجسام أدناه منقولةٌ من الكتالوج الحيّ** (`pg_get_functiondef` و
-- `pg_get_viewdef`) لا من ملفّات الهجرات (D-58)، والفرق الوحيد عن المُنتَج
-- الحيّ لحظةَ كتابة هذا الملف هو استبدال النصّ `'Africa/Cairo'` بالنداء
-- `public.site_time_zone()` — لا سطرَ غيره ولا إعادةَ ترتيب.
--
-- والعروض تُعاد بـ`with (security_invoker=true)` صراحةً كما هي عليه: حذفُ
-- الخيار من `create or replace view` يعيدها إلى صلاحيات مالكها فتتجاوز RLS.
-- ----------------------------------------------------------------------------

-- ── audit_search(p_entity text, p_actor uuid, p_from date, p_to date, p_limit integer)
CREATE OR REPLACE FUNCTION public.audit_search(p_entity text DEFAULT NULL::text, p_actor uuid DEFAULT NULL::uuid, p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date, p_limit integer DEFAULT 200)
 RETURNS SETOF public.audit_log
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_limit integer;
begin
  if not public.audit_admin_allowed() then
    raise exception 'سجل التدقيق متاح للإدارة فقط' using hint = 'forbidden';
  end if;

  v_limit := least(greatest(coalesce(p_limit, 200), 1), 500);

  return query
  select l.* from public.audit_log l
   where (p_entity is null or l.entity = p_entity)
     and (p_actor  is null or l.actor  = p_actor)
     and (p_from   is null or (l.occurred_at at time zone public.site_time_zone())::date >= p_from)
     and (p_to     is null or (l.occurred_at at time zone public.site_time_zone())::date <= p_to)
   order by l.occurred_at desc, l.id desc
   limit v_limit;
end;
$function$;

-- ── cash_flow(p_from date, p_to date, p_granularity text)
CREATE OR REPLACE FUNCTION public.cash_flow(p_from date, p_to date, p_granularity text)
 RETURNS TABLE(bucket date, inflow numeric, outflow numeric, net numeric, running_balance numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    and (e.occurred_at at time zone public.site_time_zone())::date < p_from;

  return query
  with moves as (
    select
      date_trunc(v_gran, e.occurred_at at time zone public.site_time_zone())::date as m_bucket,
      e.direction                                                        as m_dir,
      e.amount                                                           as m_amount
    from public.ledger_entries e
    where e.account_id is not null
      and (p_from is null or (e.occurred_at at time zone public.site_time_zone())::date >= p_from)
      and (p_to   is null or (e.occurred_at at time zone public.site_time_zone())::date <= p_to)
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
$function$;

-- ── derive_waiting_hours(p_pickup_at timestamp with time zone, p_return_at timestamp with time zone)
CREATE OR REPLACE FUNCTION public.derive_waiting_hours(p_pickup_at timestamp with time zone, p_return_at timestamp with time zone)
 RETURNS numeric
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select case
    when p_pickup_at is null or p_return_at is null then 0::numeric
    when p_return_at <= p_pickup_at                 then 0::numeric
    when (p_return_at at time zone public.site_time_zone())::date
      <> (p_pickup_at at time zone public.site_time_zone())::date then 0::numeric
    else least(
      ceil(extract(epoch from (p_return_at - p_pickup_at)) / 3600.0),
      12::numeric   -- MAX_DERIVED_WAITING_HOURS
    )
  end;
$function$;

-- ── finance_kpis(p_from date, p_to date)
CREATE OR REPLACE FUNCTION public.finance_kpis(p_from date, p_to date)
 RETURNS TABLE(revenue numeric, partner_costs numeric, expenses numeric, net_profit numeric, cash_on_hand numeric, receivables numeric, partner_net_due numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    and (p_from is null or (p.completed_at at time zone public.site_time_zone())::date >= p_from)
    and (p_to   is null or (p.completed_at at time zone public.site_time_zone())::date <= p_to);

  select coalesce(sum(x.amount), 0)
    into v_exp
  from public.expenses x
  where (p_from is null or (x.occurred_at at time zone public.site_time_zone())::date >= p_from)
    and (p_to   is null or (x.occurred_at at time zone public.site_time_zone())::date <= p_to);

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
$function$;

-- ── funnel_counts(p_from date, p_to date)
CREATE OR REPLACE FUNCTION public.funnel_counts(p_from date, p_to date)
 RETURNS TABLE(bucket_day date, event_key text, n integer)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  with ded as (
    select e.event as k, min(e.created_at) as at
    from public.funnel_events e
    where e.reference is not null
      and (e.created_at at time zone public.site_time_zone())::date between p_from and p_to
    group by e.event, e.reference

    union all

    select e.event as k, e.created_at as at
    from public.funnel_events e
    where e.reference is null
      and (e.created_at at time zone public.site_time_zone())::date between p_from and p_to
  )
  select
    (d.at at time zone public.site_time_zone())::date,
    d.k,
    (count(*))::integer
  from ded d
  group by 1, 2;
$function$;

-- ── funnel_daily(p_from date, p_to date)
CREATE OR REPLACE FUNCTION public.funnel_daily(p_from date, p_to date)
 RETURNS TABLE(key text, label text, points jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_from date;
  v_to   date;
begin
  if not public.analytics_admin_allowed() then
    raise exception 'أرقام القمع متاحة للإدارة فقط' using hint = 'forbidden';
  end if;

  v_to   := coalesce(p_to, (now() at time zone public.site_time_zone())::date);
  v_from := coalesce(p_from, v_to - 29);

  if v_from > v_to then
    raise exception 'الفترة معكوسة: من % إلى %', v_from, v_to using hint = 'invalid-input';
  end if;

  -- سقف عملي: مصفوفة نقاط لأكثر من سنة وربع لا تُرسم ولا تُقرأ، وتُثقل الرد بلا فائدة
  if (v_to - v_from) > 400 then
    raise exception 'المدى أطول من ٤٠٠ يوم (% يوماً) — اختر فترة أقصر', (v_to - v_from)
      using hint = 'invalid-input';
  end if;

  return query
  with defs(ord, k, l) as (
    values
      -- ── السلسلة: أربع مراحل متتالية على مسار الزائر نفسه ──
      (1, 'search_performed'::text, 'بحث عن رحلة'::text),
      (2, 'quote_viewed',           'ظهرت العروض'),
      (3, 'booking_created',        'أُنشئ الحجز'),
      (4, 'booking_paid',           'وصل التحصيل'),
      -- ── خارج السلسلة: مسار دخول موازٍ، وفرع البوابة الإلكترونية ──
      -- الاسم يصف ما يُقاس فعلاً لا ما نتمناه: `booking_started` تُكتب في
      -- `/api/payments/start` وحده، أي عند اختيار بوابة إلكترونية. والمسار
      -- الافتراضي هنا تحويل بنكي يدوي لا يمر بها — فصفرٌ فيها لا يعني «لا أحد
      -- يصل إلى الدفع».
      (5, 'quote_requested',        'طلب عرض سعر يدوي'),
      (6, 'booking_started',        'اختار وسيلة دفع إلكترونية')
  ),
  days as (
    select (v_from + g)::date as d
    from generate_series(0, (v_to - v_from)) g
  ),
  counts as (
    select c.bucket_day as d, c.event_key as k, c.n as n
    from public.funnel_counts(v_from, v_to) c
  ),
  grid as (
    select f.ord as o, f.k as gk, f.l as gl, dd.d as gd, coalesce(c.n, 0) as gn
    from defs f
    cross join days dd
    left join counts c on c.k = f.k and c.d = dd.d
  )
  select
    g.gk,
    g.gl,
    jsonb_agg(
      jsonb_build_object('bucket', to_char(g.gd, 'YYYY-MM-DD'), 'value', g.gn)
      order by g.gd asc
    )
  from grid g
  group by g.o, g.gk, g.gl
  order by g.o asc;
end;
$function$;

-- ── funnel_summary(p_from date, p_to date)
CREATE OR REPLACE FUNCTION public.funnel_summary(p_from date, p_to date)
 RETURNS TABLE(key text, label text, value numeric, rate_percent numeric, in_chain boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_from   date;
  v_to     date;
  v_search numeric := 0;
  v_quote  numeric := 0;
  v_book   numeric := 0;
  v_paid   numeric := 0;
  v_qreq   numeric := 0;
  v_start  numeric := 0;
  -- كوهورت التحصيل: مراجعُ حُجزت **ودُفعت** داخل النافذة نفسها (انظر الترويسة)
  v_paid_c numeric := 0;
begin
  if not public.analytics_admin_allowed() then
    raise exception 'أرقام القمع متاحة للإدارة فقط' using hint = 'forbidden';
  end if;

  v_to   := coalesce(p_to, (now() at time zone public.site_time_zone())::date);
  v_from := coalesce(p_from, v_to - 29);

  if v_from > v_to then
    raise exception 'الفترة معكوسة: من % إلى %', v_from, v_to using hint = 'invalid-input';
  end if;

  if (v_to - v_from) > 400 then
    raise exception 'المدى أطول من ٤٠٠ يوم (% يوماً) — اختر فترة أقصر', (v_to - v_from)
      using hint = 'invalid-input';
  end if;

  select
    coalesce(sum(c.n) filter (where c.event_key = 'search_performed'), 0),
    coalesce(sum(c.n) filter (where c.event_key = 'quote_viewed'), 0),
    coalesce(sum(c.n) filter (where c.event_key = 'booking_created'), 0),
    coalesce(sum(c.n) filter (where c.event_key = 'booking_paid'), 0),
    coalesce(sum(c.n) filter (where c.event_key = 'quote_requested'), 0),
    coalesce(sum(c.n) filter (where c.event_key = 'booking_started'), 0)
  into v_search, v_quote, v_book, v_paid, v_qreq, v_start
  from public.funnel_counts(v_from, v_to) c;

  -- بسط الكوهورت: عدد **المراجع** التي لها `booking_created` و`booking_paid`
  -- كلاهما داخل النافذة. كل مرجع هنا مرجعُ حجزٍ أُنشئ في النافذة، وعدد المراجع
  -- المتمايزة للحجوزات ≤ `v_book` (الذي يضيف إليها صفوف بلا مرجع) ⇒ النسبة
  -- ≤ ١٠٠ **بالبناء**، فلا حاجة إلى سقف يخفي الانحراف.
  select count(distinct p.reference)
    into v_paid_c
  from public.funnel_events p
  where p.event = 'booking_paid'
    and p.reference is not null
    and (p.created_at at time zone public.site_time_zone())::date between v_from and v_to
    and exists (
      select 1
      from public.funnel_events b
      where b.event = 'booking_created'
        and b.reference = p.reference
        and (b.created_at at time zone public.site_time_zone())::date between v_from and v_to
    );

  return query
  select x.k, x.l, x.v, x.r, x.c
  from (values
    ('search_performed'::text, 'بحث عن رحلة'::text, v_search::numeric,
     null::numeric, true),
    -- بلا سقف: الحدثان يُكتبان معاً في إدراج واحد ⇒ العروض ≤ عمليات البحث بنيوياً
    ('quote_viewed', 'ظهرت العروض', v_quote,
     case when v_search > 0
          then round(100.0 * v_quote / v_search, 1)
          else null end,
     true),
    -- السقف هنا وحده: لا مرجع في `quote_viewed` فلا كوهورت، والنافذة تقطع الزمن
    ('booking_created', 'أُنشئ الحجز', v_book,
     case when v_quote > 0
          then least(100::numeric, round(100.0 * v_book / v_quote, 1))
          else null end,
     true),
    -- كوهورت: من أُنشئ حجزه داخل النافذة ووصل تحصيله فيها. العدّاد المعروض يبقى
    -- كل التحصيل (`v_paid`) كي يساوي مجموع الرسم اليومي.
    ('booking_paid', 'وصل التحصيل', v_paid,
     case when v_book > 0
          then round(100.0 * v_paid_c / v_book, 1)
          else null end,
     true),
    -- خارج السلسلة: عدّاد وحده و rate_percent = null دائماً
    ('quote_requested', 'طلب عرض سعر يدوي', v_qreq, null, false),
    ('booking_started', 'اختار وسيلة دفع إلكترونية', v_start, null, false)
  ) as x(k, l, v, r, c);
end;
$function$;

-- ── partner_statement(p_subcontractor_id uuid, p_from date, p_to date)
CREATE OR REPLACE FUNCTION public.partner_statement(p_subcontractor_id uuid, p_from date, p_to date)
 RETURNS TABLE(occurred_at timestamp with time zone, kind text, reference text, debit numeric, credit numeric, balance numeric, note text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
      and (r.occurred_at at time zone public.site_time_zone())::date < p_from;
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
      and (p_from is null or (r.occurred_at at time zone public.site_time_zone())::date >= p_from)
      and (p_to   is null or (r.occurred_at at time zone public.site_time_zone())::date <= p_to)
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
$function$;

-- ── payment_accounts_within_caps(p_amount numeric)
CREATE OR REPLACE FUNCTION public.payment_accounts_within_caps(p_amount numeric)
 RETURNS TABLE(id uuid, kind text, label text, handle text, holder_name text, daily_headroom numeric, monthly_headroom numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with args as (
    select greatest(coalesce(p_amount, 0), 0) as amount
  ),
  used as (
    select
      pa.id as account_id,
      coalesce(sum(p.amount) filter (
        where (p.created_at at time zone public.site_time_zone())::date
            = (now() at time zone public.site_time_zone())::date
      ), 0) as used_today,
      coalesce(sum(p.amount) filter (
        where date_trunc('month', p.created_at at time zone public.site_time_zone())
            = date_trunc('month', now() at time zone public.site_time_zone())
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
  -- 🔒 ن‑٩: المعنى في دالةٍ واحدة تفوّض إليها الكتابة كذلك — لا شرطٌ مكرَّر هنا
  where public.payment_account_customer_visible(pa.id)
    and (pa.daily_cap   is null or u.used_today + a.amount <= pa.daily_cap)
    and (pa.monthly_cap is null or u.used_month + a.amount <= pa.monthly_cap)
  order by pa.sort asc, pa.label asc;
$function$;

-- ── pulse_series(p_section text, p_from date, p_to date)
CREATE OR REPLACE FUNCTION public.pulse_series(p_section text, p_from date, p_to date)
 RETURNS TABLE(key text, label text, points jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_section text;
  v_from    date;
  v_to      date;
begin
  if not public.analytics_admin_allowed() then
    raise exception 'رسوم الشاشات متاحة للإدارة فقط' using hint = 'forbidden';
  end if;

  v_section := lower(nullif(btrim(coalesce(p_section, '')), ''));
  v_to   := coalesce(p_to, (now() at time zone public.site_time_zone())::date);
  v_from := coalesce(p_from, v_to - 13);

  if v_from > v_to then
    raise exception 'الفترة معكوسة: من % إلى %', v_from, v_to using hint = 'invalid-input';
  end if;

  if (v_to - v_from) > 400 then
    raise exception 'مدى الرسم أطول من ٤٠٠ يوم' using hint = 'invalid-input';
  end if;

  -- `treasury` مسحوبة في 0035: `/admin/finance` تملك مخطط تدفق نقدي كاملاً،
  -- فشرارةٌ فوقه تكرار — ولا مدخل في `PAGE_PULSE` كان يطلبها. تُعاد يوم توجد
  -- شاشة تستهلكها فعلاً.
  if v_section is null
     or v_section not in ('orders', 'dispatch', 'quotes', 'payments',
                          'accounts', 'extras', 'notifications') then
    raise exception
      'قسم رسم مجهول: «%» — المسموح: orders|dispatch|quotes|payments|accounts|extras|notifications',
      coalesce(nullif(btrim(coalesce(p_section, '')), ''), 'بلا')
      using hint = 'invalid-input';
  end if;

  return query
  with days as (
    select d::date as day from generate_series(v_from, v_to, interval '1 day') d
  ),
  raw as (
    select b.day, b.n from (
      select (x.created_at at time zone public.site_time_zone())::date as day, count(*)::numeric as n
        from public.bookings x
       where v_section = 'orders'
         and (x.created_at at time zone public.site_time_zone())::date between v_from and v_to
       group by 1
      union all
      select x.day, x.dispatches_count::numeric
        from public.v_stats_dispatch x
       where v_section = 'dispatch' and x.day between v_from and v_to
      union all
      select (x.created_at at time zone public.site_time_zone())::date, count(*)::numeric
        from public.quote_requests x
       where v_section = 'quotes'
         and (x.created_at at time zone public.site_time_zone())::date between v_from and v_to
       group by 1
      union all
      select (x.created_at at time zone public.site_time_zone())::date, count(*)::numeric
        from public.payment_intents x
       where v_section = 'payments'
         and (x.created_at at time zone public.site_time_zone())::date between v_from and v_to
       group by 1
      union all
      select (x.created_at at time zone public.site_time_zone())::date, coalesce(sum(x.amount), 0)
        from public.payments x
       where v_section = 'accounts' and x.status = 'approved'
         and (x.created_at at time zone public.site_time_zone())::date between v_from and v_to
       group by 1
      union all
      select (x.created_at at time zone public.site_time_zone())::date, coalesce(sum(x.line_total), 0)
        from public.booking_extras x
       where v_section = 'extras'
         and (x.created_at at time zone public.site_time_zone())::date between v_from and v_to
       group by 1
      union all
      select (x.created_at at time zone public.site_time_zone())::date, count(*)::numeric
        from public.notifications x
       where v_section = 'notifications'
         and (x.created_at at time zone public.site_time_zone())::date between v_from and v_to
       group by 1
    ) b
  ),
  filled as (
    select d.day, coalesce(r.n, 0) as n
      from days d left join raw r on r.day = d.day
     order by d.day
  )
  select
    v_section,
    case v_section
      when 'orders'        then 'حجوزات'
      when 'dispatch'      then 'دورات بث'
      when 'quotes'        then 'طلبات عروض'
      when 'payments'      then 'جلسات دفع'
      when 'accounts'      then 'وارد معتمد'
      when 'extras'        then 'إيراد الخدمات'
      when 'notifications' then 'إشعارات'
    end,
    coalesce(
      jsonb_agg(jsonb_build_object('bucket', to_char(f.day, 'YYYY-MM-DD'), 'value', f.n)
                order by f.day),
      '[]'::jsonb)
  from filled f;
end;
$function$;

-- ── pulse_stats(p_section text, p_from date, p_to date)
CREATE OR REPLACE FUNCTION public.pulse_stats(p_section text, p_from date, p_to date)
 RETURNS TABLE(key text, label text, value numeric, delta_percent numeric, format text, help text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_section text;
  v_from    date;
  v_to      date;
  v_len     integer;
  v_pfrom   date;
  v_pto     date;
begin
  if not public.analytics_admin_allowed() then
    raise exception 'مؤشرات الشاشات متاحة للإدارة فقط' using hint = 'forbidden';
  end if;

  v_section := lower(nullif(btrim(coalesce(p_section, '')), ''));

  -- ── التفويض: الأقسام السبعة تبقى مصدرها الوحيد `section_stats` ──────────
  if v_section in ('orders', 'partners', 'treasury', 'customers',
                   'content', 'locales', 'discounts') then
    return query select * from public.section_stats(v_section, p_from, p_to);
    return;
  end if;

  if v_section is null
     or v_section not in ('dispatch', 'quotes', 'payments', 'accounts',
                          'fleet', 'extras', 'notifications', 'redirects') then
    raise exception
      'قسم نبض مجهول: «%» — المسموح: الأقسام السبعة في section_stats، أو dispatch|quotes|payments|accounts|fleet|extras|notifications|redirects',
      coalesce(nullif(btrim(coalesce(p_section, '')), ''), 'بلا')
      using hint = 'invalid-input';
  end if;

  v_to   := coalesce(p_to, (now() at time zone public.site_time_zone())::date);
  v_from := coalesce(p_from, v_to - 29);

  if v_from > v_to then
    raise exception 'الفترة معكوسة: من % إلى %', v_from, v_to using hint = 'invalid-input';
  end if;

  v_len   := (v_to - v_from) + 1;
  v_pto   := v_from - 1;
  v_pfrom := v_from - v_len;

  -- ── (١-أ) البث والإسناد ────────────────────────────────────────────────
  if v_section = 'dispatch' then
    declare
      v_c_disp numeric := 0; v_c_off numeric := 0; v_c_acc numeric := 0;
      v_c_man  numeric := 0; v_c_fmin numeric := 0; v_c_fsmp numeric := 0;
      v_p_disp numeric := 0; v_p_off numeric := 0; v_p_acc numeric := 0;
      v_p_man  numeric := 0; v_p_fmin numeric := 0; v_p_fsmp numeric := 0;
      v_open   numeric := 0;
    begin
      select coalesce(sum(d.dispatches_count), 0), coalesce(sum(d.offers_count), 0),
             coalesce(sum(d.accepted_count), 0),   coalesce(sum(d.manual_count), 0),
             coalesce(sum(d.first_accept_minutes_total), 0),
             coalesce(sum(d.first_accept_samples), 0)
        into v_c_disp, v_c_off, v_c_acc, v_c_man, v_c_fmin, v_c_fsmp
        from public.v_stats_dispatch d where d.day between v_from and v_to;

      select coalesce(sum(d.dispatches_count), 0), coalesce(sum(d.offers_count), 0),
             coalesce(sum(d.accepted_count), 0),   coalesce(sum(d.manual_count), 0),
             coalesce(sum(d.first_accept_minutes_total), 0),
             coalesce(sum(d.first_accept_samples), 0)
        into v_p_disp, v_p_off, v_p_acc, v_p_man, v_p_fmin, v_p_fsmp
        from public.v_stats_dispatch d where d.day between v_pfrom and v_pto;

      key := 'dispatch_count'; label := 'طلبات بُثّت'; value := v_c_disp;
      delta_percent := public.stats_delta(v_c_disp, v_p_disp); format := 'number';
      help := 'عدد دورات البث التي بدأت في الفترة — كل حجز مؤكد يفتح دورة واحدة تُعرض على المتعهدين المغطّين لمساره على موجات.';
      return next;

      if v_c_off > 0 then
        key := 'dispatch_accept_rate'; label := 'معدل قبول العروض';
        value := round(100.0 * v_c_acc / v_c_off, 1);
        delta_percent := case when v_p_off > 0
          then public.stats_delta(100.0 * v_c_acc / v_c_off, 100.0 * v_p_acc / v_p_off)
          else null end;
        format := 'percent';
        help := 'من كل العروض المرسلة للمتعهدين في الفترة، كم عرضاً قُبل. انخفاضه يعني عروضاً لا تغري: راجع سقف الموجة الأولى وأسعار المتعهدين على المسارات الأكثر طلباً.';
        return next;
      end if;

      if v_c_disp > 0 then
        key := 'dispatch_manual_rate'; label := 'نسبة الإسناد اليدوي';
        value := round(100.0 * v_c_man / v_c_disp, 1);
        delta_percent := case when v_p_disp > 0
          then public.stats_delta(100.0 * v_c_man / v_c_disp, 100.0 * v_p_man / v_p_disp)
          else null end;
        format := 'percent';
        help := 'الرحلات التي استنفدت كل موجاتها بلا قبول فنزلت إلى الطابور اليدوي. ارتفاعها يعني أن البث الآلي توقف عن العمل عملياً — وهي مؤشر يُقرأ ارتفاعه خبراً سيئاً.';
        return next;
      end if;

      if v_c_fsmp > 0 then
        key := 'dispatch_first_accept'; label := 'متوسط زمن أول قبول';
        value := round(v_c_fmin / v_c_fsmp, 1);
        delta_percent := case when v_p_fsmp > 0
          then public.stats_delta(v_c_fmin / v_c_fsmp, v_p_fmin / v_p_fsmp)
          else null end;
        format := 'duration';
        help := 'من لحظة بدء البث إلى أول قبول — بالدقائق. يقيس سرعة استجابة شبكة المتعهدين، وطوله يعني عميلاً ينتظر تأكيد منفّذ رحلته.';
        return next;
      end if;

      select count(*)::numeric into v_open
        from public.dispatches d where d.status = 'manual';
      key := 'dispatch_manual_open'; label := 'في الطابور اليدوي الآن';
      value := v_open;
      delta_percent := null; format := 'number';
      help := 'صورة الآن لا فترة: رحلات مدفوعة بلا منفّذ تنتظر تدخّلك أنت. كل صف هنا عميل دفع ولم يُبلَّغ بمن سينفّذ رحلته.';
      return next;
      return;
    end;
  end if;

  -- ── (١-ب) طلبات عروض الأسعار ───────────────────────────────────────────
  if v_section = 'quotes' then
    declare
      v_c_all numeric := 0; v_c_conv numeric := 0; v_c_svc numeric := 0;
      v_p_all numeric := 0; v_p_conv numeric := 0;
      v_open  numeric := 0;
    begin
      select count(*)::numeric,
             count(*) filter (where q.status = 'converted')::numeric,
             count(distinct q.service_slug)::numeric
        into v_c_all, v_c_conv, v_c_svc
        from public.quote_requests q
       where (q.created_at at time zone public.site_time_zone())::date between v_from and v_to;

      select count(*)::numeric,
             count(*) filter (where q.status = 'converted')::numeric
        into v_p_all, v_p_conv
        from public.quote_requests q
       where (q.created_at at time zone public.site_time_zone())::date between v_pfrom and v_pto;

      key := 'quotes_count'; label := 'طلبات عروض الأسعار'; value := v_c_all;
      delta_percent := public.stats_delta(v_c_all, v_p_all); format := 'number';
      help := 'مسار الدخول الموازي للحاسبة الفورية: الجولات والمناسبات وما لا تغطيه التعريفة. ارتفاعه مع ثبات الحجوزات يعني أن الحاسبة لا تغطي ما يطلبه الزوار.';
      return next;

      if v_c_all > 0 then
        key := 'quotes_converted_rate'; label := 'نسبة التحوّل إلى حجز';
        value := round(100.0 * v_c_conv / v_c_all, 1);
        delta_percent := case when v_p_all > 0
          then public.stats_delta(100.0 * v_c_conv / v_c_all, 100.0 * v_p_conv / v_p_all)
          else null end;
        format := 'percent';
        help := 'من طلبات الفترة، كم طلباً وُسم «تحوّل» بعد تواصل فريقك. الوسم يدوي من شاشة الطلبات — فالرقم يقيس متابعتكم كما يقيس جودة الطلبات.';
        return next;
      end if;

      key := 'quotes_services'; label := 'خدمات مطلوبة'; value := v_c_svc;
      delta_percent := null; format := 'number';
      help := 'عدد الخدمات المختلفة التي وردت فيها طلبات خلال الفترة (من الخدمات الست). تركّزها في خدمة واحدة يدل على أين يقع طلب السوق فعلاً.';
      return next;

      select count(*)::numeric into v_open
        from public.quote_requests q where q.status = 'new';
      key := 'quotes_new_open'; label := 'جديد بلا تواصل';
      value := v_open; delta_percent := null; format := 'number';
      help := 'صورة الآن لا فترة: طلبات لم يفتحها أحد بعد. هذه أسرع قائمة تفقد قيمتها بالوقت — طالب السعر يسأل غيرك في نفس اليوم.';
      return next;
      return;
    end;
  end if;

  -- ── (١-ج) جلسات بوابات الدفع — أعداد ونسب بلا مال (انظر ترويسة 0034) ────
  if v_section = 'payments' then
    declare
      v_c_all numeric := 0; v_c_ok numeric := 0; v_c_bad numeric := 0;
      v_p_all numeric := 0; v_p_ok numeric := 0;
    begin
      select count(*)::numeric,
             count(*) filter (where i.status = 'succeeded')::numeric,
             count(*) filter (where i.status in ('failed', 'expired', 'cancelled'))::numeric
        into v_c_all, v_c_ok, v_c_bad
        from public.payment_intents i
       where (i.created_at at time zone public.site_time_zone())::date between v_from and v_to;

      select count(*)::numeric,
             count(*) filter (where i.status = 'succeeded')::numeric
        into v_p_all, v_p_ok
        from public.payment_intents i
       where (i.created_at at time zone public.site_time_zone())::date between v_pfrom and v_pto;

      key := 'payment_intents_count'; label := 'جلسات دفع إلكتروني'; value := v_c_all;
      delta_percent := public.stats_delta(v_c_all, v_p_all); format := 'number';
      help := 'كل محاولة دفع عبر بوابة إلكترونية في الفترة. صفرٌ هنا صحيح ما دامت البوابات الست خاملة بلا مفاتيح — المسار العامل اليوم تحويل بنكي يدوي، وأرقامه في الخزينة.';
      return next;

      -- النسبة وحدها محروسة بالمقام؛ والعدّاد يخرج دائماً (تصليب 0035 ق١)
      if v_c_all > 0 then
        key := 'payment_success_rate'; label := 'معدل نجاح الجلسات';
        value := round(100.0 * v_c_ok / v_c_all, 1);
        delta_percent := case when v_p_all > 0
          then public.stats_delta(100.0 * v_c_ok / v_c_all, 100.0 * v_p_ok / v_p_all)
          else null end;
        format := 'percent';
        help := 'الجلسات التي انتهت بحالة «نجحت» من كل جلسات الفترة. انخفاضها المفاجئ أول إشارة على عطل في بوابة بعينها قبل أن يشتكي عميل.';
        return next;
      end if;

      key := 'payment_failed_count'; label := 'جلسات فاشلة أو منتهية';
      value := v_c_bad; delta_percent := null; format := 'number';
      help := 'مجموع الفاشلة والملغاة والمنتهية صلاحيتها. حجزها لا يتأكد ولا يُبثّ — راجعها في جدول الجلسات أسفل الشاشة. و«٠» هنا معلومة صحيحة لا غياب.';
      return next;
      return;
    end;
  end if;

  -- ── (١-د) حسابات الدفع — الوارد الفعلي المعتمد ─────────────────────────
  if v_section = 'accounts' then
    declare
      v_c_amt numeric := 0; v_c_cnt numeric := 0;
      v_p_amt numeric := 0;
      v_active numeric := 0; v_facing numeric := 0;
    begin
      select coalesce(sum(p.amount), 0), count(*)::numeric
        into v_c_amt, v_c_cnt
        from public.payments p
       where p.status = 'approved'
         and (p.created_at at time zone public.site_time_zone())::date between v_from and v_to;

      select coalesce(sum(p.amount), 0) into v_p_amt
        from public.payments p
       where p.status = 'approved'
         and (p.created_at at time zone public.site_time_zone())::date between v_pfrom and v_pto;

      key := 'accounts_received'; label := 'وارد معتمد في الفترة'; value := v_c_amt;
      delta_percent := public.stats_delta(v_c_amt, v_p_amt); format := 'money';
      help := 'مجموع الدفعات التي اعتمدها فريقك في الفترة عبر كل حسابات التحصيل. المعلّق لم يدخل: إيصالٌ مرفوع ليس مالاً وصل حتى تتحقق منه.';
      return next;

      key := 'accounts_payments_count'; label := 'دفعات معتمدة'; value := v_c_cnt;
      delta_percent := null; format := 'number';
      help := 'عدد الدفعات المعتمدة في الفترة — يُقرأ مع المبلغ: مبلغ كبير بعدد صغير يعني حجوزات كبيرة، والعكس يعني عربوناً متكرراً.';
      return next;

      select count(*) filter (where a.active)::numeric,
             count(*) filter (where a.active and a.customer_facing)::numeric
        into v_active, v_facing
        from public.payment_accounts a;

      key := 'accounts_active'; label := 'حسابات مفعّلة'; value := v_active;
      delta_percent := null; format := 'number';
      help := 'صورة الآن: حسابات التحصيل المفعّلة (محافظ وانستا باي ونقدية وبنك). الحساب الذي بلغ حدّه اليومي يختفي من صفحة الدفع آلياً ويبقى مفعّلاً هنا.';
      return next;

      key := 'accounts_customer_facing'; label := 'ظاهرة للعميل'; value := v_facing;
      delta_percent := null; format := 'number';
      help := 'من الحسابات المفعّلة، كم حساباً يراه العميل في صفحة الدفع. صفرٌ هنا يعني أن العميل لا يجد وجهةً يحوّل إليها — والحجز يتوقف عند الدفع.';
      return next;
      return;
    end;
  end if;

  -- ── (١-هـ) الأسطول — حصة الفئات من الطلب ───────────────────────────────
  if v_section = 'fleet' then
    declare
      v_active numeric := 0;
      v_c_all  numeric := 0; v_c_booked numeric := 0; v_c_top numeric := 0;
      v_p_all  numeric := 0;
    begin
      select count(*) filter (where c.active)::numeric into v_active
        from public.vehicle_classes c;

      key := 'fleet_classes_active'; label := 'فئات مفعّلة'; value := v_active;
      delta_percent := null; format := 'number';
      help := 'صورة الآن: فئات السيارات المفعّلة والمعروضة للعميل. الفئة المطفأة لا تظهر في العروض مهما كانت مغطّاة بأسعار متعهدين.';
      return next;

      select count(*)::numeric, count(distinct b.class_slug)::numeric
        into v_c_all, v_c_booked
        from public.bookings b
       where b.class_slug is not null
         and (b.created_at at time zone public.site_time_zone())::date between v_from and v_to;

      select count(*)::numeric into v_p_all
        from public.bookings b
       where b.class_slug is not null
         and (b.created_at at time zone public.site_time_zone())::date between v_pfrom and v_pto;

      key := 'fleet_classes_booked'; label := 'فئات حُجزت في الفترة'; value := v_c_booked;
      delta_percent := null; format := 'number';
      help := 'كم فئة مختلفة وردت عليها حجوزات فعلاً. فجوةٌ بينها وبين «فئات مفعّلة» تعني فئةً تُعرض ولا تُطلب — راجع تعريفتها أو أهليتها بعدد الركاب.';
      return next;

      -- العدّاد يخرج دائماً؛ النسبة وحدها محروسة بالمقام (تصليب 0035 ق١)
      key := 'fleet_orders'; label := 'حجوزات على الأسطول'; value := v_c_all;
      delta_percent := public.stats_delta(v_c_all, v_p_all); format := 'number';
      help := 'حجوزات الفترة التي اختارت فئة سيارة. المرجع الكامل للطلبات في قسم الطلبات — هذا الرقم يخص الأسطول وحده، و«٠» فيه معلومة صحيحة لا غياب.';
      return next;

      if v_c_all > 0 then
        select max(t.n) into v_c_top from (
          select count(*)::numeric n from public.bookings b
           where b.class_slug is not null
             and (b.created_at at time zone public.site_time_zone())::date between v_from and v_to
           group by b.class_slug
        ) t;

        key := 'fleet_top_share'; label := 'نصيب الفئة الأولى';
        value := round(100.0 * v_c_top / v_c_all, 1);
        delta_percent := null; format := 'percent';
        help := 'حصة أكثر الفئات طلباً من حجوزات الفترة. تركّزٌ عالٍ يعني اعتماد إيرادك على فئة واحدة — ونقص متعهديها يوقف نصف عملك.';
        return next;
      end if;
      return;
    end;
  end if;

  -- ── (١-و) الخدمات الإضافية (الدفعة ٣) ──────────────────────────────────
  if v_section = 'extras' then
    declare
      v_active  numeric := 0;
      v_c_amt   numeric := 0; v_c_qty numeric := 0; v_c_bk numeric := 0;
      v_p_amt   numeric := 0;
      v_c_all_b numeric := 0;
    begin
      select count(*) filter (where e.active)::numeric into v_active
        from public.extra_services e;

      key := 'extras_active'; label := 'خدمات في الكتالوج'; value := v_active;
      delta_percent := null; format := 'number';
      help := 'صورة الآن: الخدمات المفعّلة المعروضة في ويدجت الحجز. الكتالوج الفارغ يجعل الميزة كاملةً في القاعدة ولا تفعل شيئاً — لا عنوان ولا صندوق يظهر للعميل.';
      return next;

      select coalesce(sum(x.line_total), 0), coalesce(sum(x.qty), 0),
             count(distinct x.booking_id)::numeric
        into v_c_amt, v_c_qty, v_c_bk
        from public.booking_extras x
       where (x.created_at at time zone public.site_time_zone())::date between v_from and v_to;

      select coalesce(sum(x.line_total), 0) into v_p_amt
        from public.booking_extras x
       where (x.created_at at time zone public.site_time_zone())::date between v_pfrom and v_pto;

      key := 'extras_revenue'; label := 'إيراد الخدمات'; value := v_c_amt;
      delta_percent := public.stats_delta(v_c_amt, v_p_amt); format := 'money';
      help := 'مجموع أسطر الخدمات في حجوزات الفترة، بلقطة السعر المجمَّدة وقت الحجز. الخدمة طبقةٌ فوق سعر الرحلة بعد الذروة والخصم — ولا تدخل أساس هامش المتعهد.';
      return next;

      key := 'extras_units'; label := 'وحدات مباعة'; value := v_c_qty;
      delta_percent := null; format := 'number';
      help := 'مجموع الكميات المطلوبة من كل الخدمات (كرسيا أطفال في حجز = وحدتان). يُقرأ مع الإيراد ليظهر أي الخدمات تُطلب كثيراً بسعر صغير.';
      return next;

      select count(*)::numeric into v_c_all_b
        from public.bookings b
       where (b.created_at at time zone public.site_time_zone())::date between v_from and v_to;

      if v_c_all_b > 0 then
        key := 'extras_attach_rate'; label := 'نسبة الحجوزات بخدمة';
        value := round(100.0 * v_c_bk / v_c_all_b, 1);
        delta_percent := null; format := 'percent';
        help := 'من حجوزات الفترة، كم حجزاً أضاف خدمة واحدة على الأقل. انخفاضها مع كتالوج ممتلئ يعني أن الخدمات لا تُرى في مسار الحجز أو أن سعرها طارد.';
        return next;
      end if;
      return;
    end;
  end if;

  -- ── (١-ز) طابور الإشعارات ──────────────────────────────────────────────
  if v_section = 'notifications' then
    declare
      v_c_all numeric := 0; v_c_sent numeric := 0; v_c_fail numeric := 0;
      v_p_all numeric := 0; v_p_sent numeric := 0;
      v_queued numeric := 0;
    begin
      select count(*)::numeric,
             count(*) filter (where n.status = 'sent')::numeric,
             count(*) filter (where n.status = 'failed')::numeric
        into v_c_all, v_c_sent, v_c_fail
        from public.notifications n
       where (n.created_at at time zone public.site_time_zone())::date between v_from and v_to;

      select count(*)::numeric,
             count(*) filter (where n.status = 'sent')::numeric
        into v_p_all, v_p_sent
        from public.notifications n
       where (n.created_at at time zone public.site_time_zone())::date between v_pfrom and v_pto;

      key := 'notif_count'; label := 'إشعارات الفترة'; value := v_c_all;
      delta_percent := public.stats_delta(v_c_all, v_p_all); format := 'number';
      help := 'كل ما دخل طابور الإشعارات في الفترة: جرس اللوحة وتليجرام والبريد. الجدول هو مصدر الحقيقة، والقنوات توزيع فوقه.';
      return next;

      if v_c_all > 0 then
        key := 'notif_delivery_rate'; label := 'معدل التسليم';
        value := round(100.0 * v_c_sent / v_c_all, 1);
        delta_percent := case when v_p_all > 0
          then public.stats_delta(100.0 * v_c_sent / v_c_all, 100.0 * v_p_sent / v_p_all)
          else null end;
        format := 'percent';
        help := '«أُرسل» من كل ما دخل الطابور. و«متجاوَز» ليس فشلاً: قناة بلا مفتاح (البريد بلا Resend، تليجرام بلا معرّف محادثة) تُوسم متجاوَزة بسبب واضح ولا تُحسب إرسالاً.';
        return next;
      end if;

      key := 'notif_failed'; label := 'فشل الإرسال'; value := v_c_fail;
      delta_percent := null; format := 'number';
      help := 'إشعارات استنفدت محاولاتها وفشلت فعلاً — لا المتجاوَزة. هذه أول سطح أخطاء في المنصة، ومنه تُقرأ أعطال القنوات قبل أن يشتكي أحد.';
      return next;

      select count(*)::numeric into v_queued
        from public.notifications n where n.status = 'queued';
      key := 'notif_queued'; label := 'في الطابور الآن'; value := v_queued;
      delta_percent := null; format := 'number';
      help := 'صورة الآن: ما ينتظر دورة الإرسال. تراكمه يعني أن عامل الإرسال متوقف — محلياً يُشغَّل يدوياً من هذه الشاشة، وعلى الإنتاج بجدولة vercel.json كل دقيقة.';
      return next;
      return;
    end;
  end if;

  -- ── (١-ح) تحويلات السيو ────────────────────────────────────────────────
  if v_section = 'redirects' then
    declare
      v_all numeric := 0; v_on numeric := 0; v_perm numeric := 0;
    begin
      select count(*)::numeric,
             count(*) filter (where r.enabled)::numeric,
             count(*) filter (where r.status_code in (301, 308))::numeric
        into v_all, v_on, v_perm
        from public.redirects r;

      key := 'redirects_total'; label := 'قواعد التحويل'; value := v_all;
      delta_percent := null; format := 'number';
      help := 'صورة الآن لا فترة: كل قواعد التحويل المسجَّلة. التحويل يحفظ عمر الرابط في نتائج البحث حين يتغيّر مسار صفحة — وعمر الرابط أصل لا يُشترى.';
      return next;

      key := 'redirects_enabled'; label := 'قواعد تعمل الآن'; value := v_on;
      delta_percent := null; format := 'number';
      help := 'المفعّلة منها فقط. القاعدة المطفأة تبقى محفوظة ولا يقرؤها الوسيط — تُستعمل لتعطيل تحويل مؤقتاً بلا فقدان صيغته.';
      return next;

      if v_all > 0 then
        key := 'redirects_permanent_rate'; label := 'نسبة الدائم (٣٠١/٣٠٨)';
        value := round(100.0 * v_perm / v_all, 1);
        delta_percent := null; format := 'percent';
        help := 'التحويل الدائم ينقل قيمة الرابط القديم إلى الجديد في تقييم محركات البحث؛ المؤقت (٣٠٢/٣٠٧) لا ينقلها. فالمؤقت المتروك سنةً يهدر ما بُني.';
        return next;
      end if;
      return;
    end;
  end if;
end;
$function$;

-- ── section_stats(p_section text, p_from date, p_to date)
CREATE OR REPLACE FUNCTION public.section_stats(p_section text, p_from date, p_to date)
 RETURNS TABLE(key text, label text, value numeric, delta_percent numeric, format text, help text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_section text;
  v_from    date;
  v_to      date;
  v_len     integer;
  v_pfrom   date;
  v_pto     date;
begin
  if not public.analytics_admin_allowed() then
    raise exception 'إحصائيات الأقسام متاحة للإدارة فقط' using hint = 'forbidden';
  end if;

  v_section := lower(nullif(btrim(coalesce(p_section, '')), ''));

  if v_section is null
     or v_section not in ('orders', 'partners', 'treasury', 'customers', 'content',
                          'locales', 'discounts') then
    raise exception
      'قسم إحصائي مجهول: «%» — المسموح: orders|partners|treasury|customers|content|locales|discounts',
      coalesce(nullif(btrim(coalesce(p_section, '')), ''), 'بلا')
      using hint = 'invalid-input';
  end if;

  v_to   := coalesce(p_to, (now() at time zone public.site_time_zone())::date);
  v_from := coalesce(p_from, v_to - 29);

  if v_from > v_to then
    raise exception 'الفترة معكوسة: من % إلى %', v_from, v_to using hint = 'invalid-input';
  end if;

  -- الفترة السابقة: نفس الطول، ملاصقة، ومنتهية قبل بداية الفترة الحالية بيوم.
  v_len   := (v_to - v_from) + 1;
  v_pto   := v_from - 1;
  v_pfrom := v_from - v_len;

  -- ── (٦-١-أ) الطلبات ──────────────────────────────────────────────────────
  if v_section = 'orders' then
    declare
      v_c_count     numeric := 0;
      v_c_value     numeric := 0;
      v_c_confirmed numeric := 0;
      v_c_completed numeric := 0;
      v_c_cancelled numeric := 0;
      v_c_avg       numeric := 0;
      v_c_rate      numeric := 0;
      v_p_count     numeric := 0;
      v_p_value     numeric := 0;
      v_p_confirmed numeric := 0;
      v_p_completed numeric := 0;
      v_p_cancelled numeric := 0;
      v_p_avg       numeric := 0;
      v_p_rate      numeric := 0;
    begin
      select
        coalesce(sum(o.orders_count), 0),
        coalesce(sum(o.orders_value), 0),
        coalesce(sum(o.orders_count) filter (
          where o.status in ('confirmed', 'assigned', 'completed')), 0),
        coalesce(sum(o.orders_count) filter (where o.status = 'completed'), 0),
        coalesce(sum(o.orders_count) filter (where o.status = 'cancelled'), 0)
      into v_c_count, v_c_value, v_c_confirmed, v_c_completed, v_c_cancelled
      from public.v_stats_orders o
      where o.day between v_from and v_to;

      select
        coalesce(sum(o.orders_count), 0),
        coalesce(sum(o.orders_value), 0),
        coalesce(sum(o.orders_count) filter (
          where o.status in ('confirmed', 'assigned', 'completed')), 0),
        coalesce(sum(o.orders_count) filter (where o.status = 'completed'), 0),
        coalesce(sum(o.orders_count) filter (where o.status = 'cancelled'), 0)
      into v_p_count, v_p_value, v_p_confirmed, v_p_completed, v_p_cancelled
      from public.v_stats_orders o
      where o.day between v_pfrom and v_pto;

      v_c_avg  := case when v_c_count > 0 then round(v_c_value / v_c_count, 2) else 0 end;
      v_p_avg  := case when v_p_count > 0 then round(v_p_value / v_p_count, 2) else 0 end;
      v_c_rate := case when v_c_count > 0 then round(100.0 * v_c_cancelled / v_c_count, 1) else 0 end;
      v_p_rate := case when v_p_count > 0 then round(100.0 * v_p_cancelled / v_p_count, 1) else 0 end;

      return query
      select x.k, x.l, x.v, x.d, x.f, x.h
      from (values
        ('orders_count'::text, 'عدد الطلبات'::text,
         v_c_count::numeric, public.stats_delta(v_c_count, v_p_count)::numeric,
         'number'::text,
         'كل حجز أُنشئ داخل الفترة مهما صارت حالته بعد ذلك.'::text),
        ('orders_value', 'قيمة الطلبات',
         v_c_value, public.stats_delta(v_c_value, v_p_value), 'money',
         'مجموع إجمالي الحجوزات المُنشأة في الفترة — قيمة العميل لا صافي المنصة.'),
        ('confirmed_count', 'طلبات مؤكدة فأكثر',
         v_c_confirmed, public.stats_delta(v_c_confirmed, v_p_confirmed), 'number',
         'الحجوزات التي بلغت «مؤكد» أو «مُسند» أو «مكتمل» — أي وصل تحصيلها.'),
        ('completed_count', 'رحلات مكتملة',
         v_c_completed, public.stats_delta(v_c_completed, v_p_completed), 'number',
         'الحجوزات التي انتهت حالتها إلى «مكتمل».'),
        ('cancelled_rate', 'نسبة الإلغاء',
         v_c_rate, public.stats_delta(v_c_rate, v_p_rate), 'percent',
         'الملغاة ÷ كل طلبات الفترة × ١٠٠.'),
        ('avg_order_value', 'متوسط قيمة الطلب',
         v_c_avg, public.stats_delta(v_c_avg, v_p_avg), 'money',
         'قيمة الطلبات ÷ عددها.')
      ) as x(k, l, v, d, f, h);
    end;

  -- ── (٦-١-ب) المتعهدون والبث ──────────────────────────────────────────────
  elsif v_section = 'partners' then
    declare
      v_c_active   numeric := 0;
      v_c_trips    numeric := 0;
      v_c_cost     numeric := 0;
      v_c_margin   numeric := 0;
      v_c_offers   numeric := 0;
      v_c_accept   numeric := 0;
      v_c_disp     numeric := 0;
      v_c_manual   numeric := 0;
      v_c_mintot   numeric := 0;
      v_c_samples  numeric := 0;
      v_c_arate    numeric := 0;
      v_c_mrate    numeric := 0;
      v_c_first    numeric := null;
      v_p_active   numeric := 0;
      v_p_trips    numeric := 0;
      v_p_cost     numeric := 0;
      v_p_margin   numeric := 0;
      v_p_offers   numeric := 0;
      v_p_accept   numeric := 0;
      v_p_disp     numeric := 0;
      v_p_manual   numeric := 0;
      v_p_mintot   numeric := 0;
      v_p_samples  numeric := 0;
      v_p_arate    numeric := 0;
      v_p_mrate    numeric := 0;
      v_p_first    numeric := null;
      v_approved   numeric := 0;
    begin
      select
        coalesce(count(distinct p.subcontractor_id), 0),
        coalesce(count(*), 0),
        coalesce(sum(p.partner_cost), 0),
        coalesce(sum(p.gross_profit), 0)
      into v_c_active, v_c_trips, v_c_cost, v_c_margin
      from public.v_booking_profit p
      where p.subcontractor_id is not null
        and (p.created_at at time zone public.site_time_zone())::date between v_from and v_to;

      select
        coalesce(count(distinct p.subcontractor_id), 0),
        coalesce(count(*), 0),
        coalesce(sum(p.partner_cost), 0),
        coalesce(sum(p.gross_profit), 0)
      into v_p_active, v_p_trips, v_p_cost, v_p_margin
      from public.v_booking_profit p
      where p.subcontractor_id is not null
        and (p.created_at at time zone public.site_time_zone())::date between v_pfrom and v_pto;

      select
        coalesce(sum(d.offers_count), 0),
        coalesce(sum(d.accepted_count), 0),
        coalesce(sum(d.dispatches_count), 0),
        coalesce(sum(d.manual_count), 0),
        coalesce(sum(d.first_accept_minutes_total), 0),
        coalesce(sum(d.first_accept_samples), 0)
      into v_c_offers, v_c_accept, v_c_disp, v_c_manual, v_c_mintot, v_c_samples
      from public.v_stats_dispatch d
      where d.day between v_from and v_to;

      select
        coalesce(sum(d.offers_count), 0),
        coalesce(sum(d.accepted_count), 0),
        coalesce(sum(d.dispatches_count), 0),
        coalesce(sum(d.manual_count), 0),
        coalesce(sum(d.first_accept_minutes_total), 0),
        coalesce(sum(d.first_accept_samples), 0)
      into v_p_offers, v_p_accept, v_p_disp, v_p_manual, v_p_mintot, v_p_samples
      from public.v_stats_dispatch d
      where d.day between v_pfrom and v_pto;

      select coalesce(count(*), 0) into v_approved
      from public.subcontractors s
      where s.status = 'approved';

      v_c_arate := case when v_c_offers > 0 then round(100.0 * v_c_accept / v_c_offers, 1) else 0 end;
      v_p_arate := case when v_p_offers > 0 then round(100.0 * v_p_accept / v_p_offers, 1) else 0 end;
      v_c_mrate := case when v_c_disp   > 0 then round(100.0 * v_c_manual / v_c_disp, 1)  else 0 end;
      v_p_mrate := case when v_p_disp   > 0 then round(100.0 * v_p_manual / v_p_disp, 1)  else 0 end;
      -- متوسط الفترة = مجموع الأزمنة ÷ عدد العينات، لا متوسط المتوسطات اليومية.
      -- ⚠ صفر لا null حين لا عيّنة: عقد StatCard ينص على `value: number` غير
      -- قابل للتفريغ — وnull هنا كان سيكسر النوع في الواجهة. الغياب يظهر في
      -- delta_percent (وهو null) وفي نص help، لا في القيمة نفسها.
      v_c_first := case when v_c_samples > 0 then round(v_c_mintot / v_c_samples, 1) else 0 end;
      v_p_first := case when v_p_samples > 0 then round(v_p_mintot / v_p_samples, 1) else 0 end;

      return query
      select x.k, x.l, x.v, x.d, x.f, x.h
      from (values
        ('active_partners'::text, 'متعهدون نفّذوا رحلات'::text,
         v_c_active::numeric, public.stats_delta(v_c_active, v_p_active)::numeric,
         'number'::text,
         'عدد المتعهدين المختلفين الذين أُسندت إليهم حجوزات أُنشئت في الفترة.'::text),
        ('approved_partners', 'متعهدون معتمدون',
         v_approved, null, 'number',
         'لقطة لحظية لكل المتعهدين حالتهم «معتمد» — لا تخص فترة فلا مقارنة لها.'),
        ('partner_trips', 'رحلات مُسندة',
         v_c_trips, public.stats_delta(v_c_trips, v_p_trips), 'number',
         'الحجوزات المُنشأة في الفترة ولها متعهد منفّذ.'),
        ('partner_cost', 'تكلفة المتعهدين',
         v_c_cost, public.stats_delta(v_c_cost, v_p_cost), 'money',
         'مستحق المنفّذ الفعلي لهذه الرحلات — رقم إداري لا يظهر في البورتال أبداً.'),
        ('gross_profit', 'هامش المنصة',
         v_c_margin, public.stats_delta(v_c_margin, v_p_margin), 'money',
         'الإيراد ناقص تكلفة المتعهد قبل المصروفات — رقم إداري لا يظهر في البورتال أبداً.'),
        ('accept_rate', 'معدل قبول العروض',
         v_c_arate, public.stats_delta(v_c_arate, v_p_arate), 'percent',
         'العروض المقبولة ÷ كل العروض المرسلة في الفترة × ١٠٠.'),
        ('manual_rate', 'نسبة الإسناد اليدوي',
         v_c_mrate, public.stats_delta(v_c_mrate, v_p_mrate), 'percent',
         'الطلبات التي أسندها فريق التشغيل بيده ÷ كل الطلبات المبثوثة × ١٠٠. ارتفاعها يعني أن البث لا يكفي.'),
        ('first_accept_minutes', 'متوسط زمن أول قبول',
         v_c_first, public.stats_delta(v_c_first, v_p_first), 'duration',
         'بالدقائق: من أول عرض في الطلب إلى أول قبول. صفر يعني «لا قبول واحد في الفترة» لا «فوري».')
      ) as x(k, l, v, d, f, h);
    end;

  -- ── (٦-١-ج) الخزينة ──────────────────────────────────────────────────────
  elsif v_section = 'treasury' then
    declare
      v_c_in   numeric := 0;
      v_c_out  numeric := 0;
      v_c_net  numeric := 0;
      v_c_exp  numeric := 0;
      v_p_in   numeric := 0;
      v_p_out  numeric := 0;
      v_p_net  numeric := 0;
      v_p_exp  numeric := 0;
      v_cash   numeric := 0;
      v_recv   numeric := 0;
    begin
      select
        coalesce(sum(tr.inflow), 0),
        coalesce(sum(tr.outflow), 0),
        coalesce(sum(tr.net), 0)
      into v_c_in, v_c_out, v_c_net
      from public.v_stats_treasury tr
      where tr.day between v_from and v_to;

      select
        coalesce(sum(tr.inflow), 0),
        coalesce(sum(tr.outflow), 0),
        coalesce(sum(tr.net), 0)
      into v_p_in, v_p_out, v_p_net
      from public.v_stats_treasury tr
      where tr.day between v_pfrom and v_pto;

      select coalesce(sum(x.amount), 0) into v_c_exp
      from public.expenses x
      where (x.occurred_at at time zone public.site_time_zone())::date between v_from and v_to;

      select coalesce(sum(x.amount), 0) into v_p_exp
      from public.expenses x
      where (x.occurred_at at time zone public.site_time_zone())::date between v_pfrom and v_pto;

      -- لقطتان لحظيتان بنفس قاعدة finance_kpis حرفياً — مصدر واحد لا اشتقاق ثانٍ
      select coalesce(sum(ab.balance), 0) into v_cash from public.v_account_balances ab;

      select coalesce(sum(b.amount_remaining), 0) into v_recv
      from public.bookings b
      where b.status in ('confirmed', 'assigned')
        and b.amount_remaining > 0;

      return query
      select x.k, x.l, x.v, x.d, x.f, x.h
      from (values
        ('inflow'::text, 'الوارد'::text,
         v_c_in::numeric, public.stats_delta(v_c_in, v_p_in)::numeric,
         'money'::text,
         'كل قيد داخل على حساب خزينة داخل الفترة. مستحق المتعهد ليس نقداً فلا يدخل هنا.'::text),
        ('outflow', 'المنصرف',
         v_c_out, public.stats_delta(v_c_out, v_p_out), 'money',
         'كل قيد خارج من حساب خزينة داخل الفترة.'),
        ('net', 'صافي الحركة',
         v_c_net, public.stats_delta(v_c_net, v_p_net), 'money',
         'الوارد ناقص المنصرف — قد يكون سالباً.'),
        ('expenses', 'المصروفات',
         v_c_exp, public.stats_delta(v_c_exp, v_p_exp), 'money',
         'المصروفات التشغيلية بتاريخ وقوعها داخل الفترة.'),
        ('cash_on_hand', 'النقد في اليد',
         v_cash, null, 'money',
         'مجموع أرصدة حسابات الخزينة الآن — لقطة لحظية لا تخص فترة.'),
        ('receivables', 'المستحق على العملاء',
         v_recv, null, 'money',
         'باقي قيمة الرحلات المؤكدة والمُسندة التي لم تُنفَّذ بعد — لقطة لحظية.')
      ) as x(k, l, v, d, f, h);
    end;

  -- ── (٦-١-د) العملاء ──────────────────────────────────────────────────────
  --
  -- 0026: هوية العميل صارت `bookings.phone_norm` (عمود مولَّد) لا
  -- `btrim(customer_phone)`. الفرع منسوخ حرفياً من 0024 عدا أربعة مواضع مطابقة.
  -- ⚠ أثر مقصود: أعداد «عملاء الفترة» و«الجدد» و«العائدون» تنخفض/تتغيّر بعد
  -- التطبيع لأن ما كان ثلاثة عملاء صار واحداً — تصحيحٌ لا انحدار.
  -- و`phone_norm is not null` تعني «فيه خانة رقمية واحدة على الأقل»، وهي أدقّ
  -- من `btrim(...) <> ''` التي كانت تعدّ نصاً بلا أرقام عميلاً.
  elsif v_section = 'customers' then
    declare
      v_c_cust   numeric := 0;
      v_c_orders numeric := 0;
      v_c_value  numeric := 0;
      v_c_new    numeric := 0;
      v_c_ret    numeric := 0;
      v_c_rate   numeric := 0;
      v_c_avg    numeric := 0;
      v_p_cust   numeric := 0;
      v_p_orders numeric := 0;
      v_p_value  numeric := 0;
      v_p_new    numeric := 0;
      v_p_ret    numeric := 0;
      v_p_rate   numeric := 0;
      v_p_avg    numeric := 0;
    begin
      -- عدد عملاء الفترة **بـ distinct على مستوى الفترة** لا بجمع أعداد الأيام:
      -- من حجز في يومين عميل واحد لا اثنان.
      select
        coalesce(count(distinct b.phone_norm), 0),
        coalesce(count(*), 0),
        coalesce(sum(b.total), 0)
      into v_c_cust, v_c_orders, v_c_value
      from public.bookings b
      where b.phone_norm is not null
        and (b.created_at at time zone public.site_time_zone())::date between v_from and v_to;

      select
        coalesce(count(distinct b.phone_norm), 0),
        coalesce(count(*), 0),
        coalesce(sum(b.total), 0)
      into v_p_cust, v_p_orders, v_p_value
      from public.bookings b
      where b.phone_norm is not null
        and (b.created_at at time zone public.site_time_zone())::date between v_pfrom and v_pto;

      -- «عميل جديد» = أول حجز له **على الإطلاق** وقع داخل الفترة
      select coalesce(count(*), 0) into v_c_new
      from (
        select b.phone_norm as ph, min(b.created_at) as first_at
        from public.bookings b
        where b.phone_norm is not null
        group by 1
      ) f
      where (f.first_at at time zone public.site_time_zone())::date between v_from and v_to;

      select coalesce(count(*), 0) into v_p_new
      from (
        select b.phone_norm as ph, min(b.created_at) as first_at
        from public.bookings b
        where b.phone_norm is not null
        group by 1
      ) f
      where (f.first_at at time zone public.site_time_zone())::date between v_pfrom and v_pto;

      v_c_ret  := greatest(v_c_cust - v_c_new, 0);
      v_p_ret  := greatest(v_p_cust - v_p_new, 0);
      v_c_rate := case when v_c_cust > 0 then round(100.0 * v_c_ret / v_c_cust, 1) else 0 end;
      v_p_rate := case when v_p_cust > 0 then round(100.0 * v_p_ret / v_p_cust, 1) else 0 end;
      v_c_avg  := case when v_c_orders > 0 then round(v_c_value / v_c_orders, 2) else 0 end;
      v_p_avg  := case when v_p_orders > 0 then round(v_p_value / v_p_orders, 2) else 0 end;

      return query
      select x.k, x.l, x.v, x.d, x.f, x.h
      from (values
        ('customers_count'::text, 'عملاء الفترة'::text,
         v_c_cust::numeric, public.stats_delta(v_c_cust, v_p_cust)::numeric,
         'number'::text,
         'عدد العملاء المختلفين الذين حجزوا في الفترة — العميل يُعرَّف برقم هاتفه بعد تطبيعه إلى شكل واحد (01XXXXXXXXX)، والرقم نفسه لا يخرج من القاعدة.'::text),
        ('new_customers', 'عملاء جدد',
         v_c_new, public.stats_delta(v_c_new, v_p_new), 'number',
         'من كان أول حجز له على الإطلاق داخل هذه الفترة.'),
        ('returning_customers', 'عملاء عائدون',
         v_c_ret, public.stats_delta(v_c_ret, v_p_ret), 'number',
         'عملاء الفترة الذين لهم حجز أقدم من الفترة.'),
        ('repeat_rate', 'نسبة العودة',
         v_c_rate, public.stats_delta(v_c_rate, v_p_rate), 'percent',
         'العائدون ÷ عملاء الفترة × ١٠٠.'),
        ('orders_count', 'طلبات الفترة',
         v_c_orders, public.stats_delta(v_c_orders, v_p_orders), 'number',
         'كل الحجوزات المُنشأة في الفترة ولها رقم هاتف.'),
        ('avg_order_value', 'متوسط قيمة الطلب',
         v_c_avg, public.stats_delta(v_c_avg, v_p_avg), 'money',
         'قيمة الطلبات ÷ عددها.')
      ) as x(k, l, v, d, f, h);
    end;

  -- ── (٦-١-هـ) المحتوى والسيو ──────────────────────────────────────────────
  -- لقطة لا فترة: عدد الصفحات واكتمال ميتاداتاها حالةٌ راهنة لا تدفّق، فكل
  -- delta هنا null عدا «صفحات عُدِّلت» وهي وحدها ما يقع داخل نافذة زمنية.
  elsif v_section = 'content' then
    declare
      v_total     numeric := 0;
      v_pub       numeric := 0;
      v_draft     numeric := 0;
      v_complete  numeric := 0;
      v_no_meta   numeric := 0;
      v_faq       numeric := 0;
      v_rate      numeric := 0;
      v_c_touched numeric := 0;
      v_p_touched numeric := 0;
    begin
      -- max() فوق عرضٍ صفُّه واحد: يعطي القيمة إن وُجد الصف وnull إن لم يوجد،
      -- فلا حاجة لمتغيّر record ولا لفرع «العرض فارغ» منفصل.
      select
        coalesce(max(c.pages_total), 0),
        coalesce(max(c.pages_published), 0),
        coalesce(max(c.pages_draft), 0),
        coalesce(max(c.meta_complete), 0),
        coalesce(max(c.meta_missing), 0),
        coalesce(max(c.faq_pages), 0)
      into v_total, v_pub, v_draft, v_complete, v_no_meta, v_faq
      from public.v_stats_content c;

      v_rate := case
                  when v_total > 0 then round(100.0 * v_complete / v_total, 1)
                  else 0
                end;

      select coalesce(count(*), 0) into v_c_touched
      from public.pages p
      where (p.updated_at at time zone public.site_time_zone())::date between v_from and v_to;

      select coalesce(count(*), 0) into v_p_touched
      from public.pages p
      where (p.updated_at at time zone public.site_time_zone())::date between v_pfrom and v_pto;

      return query
      select x.k, x.l, x.v, x.d, x.f, x.h
      from (values
        ('pages_total'::text, 'إجمالي الصفحات'::text,
         v_total::numeric, null::numeric, 'number'::text,
         'كل صفوف جدول الصفحات — لقطة لحظية لا تخص فترة.'::text),
        ('pages_published', 'صفحات منشورة',
         v_pub, null, 'number',
         'الصفحات التي يراها الزائر الآن.'),
        ('pages_draft', 'صفحات غير منشورة',
         v_draft, null, 'number',
         'صفحات موجودة ومحجوبة عن الزائر.'),
        ('meta_complete_rate', 'اكتمال الميتاداتا',
         v_rate, null, 'percent',
         'الصفحات التي لها عنوان ووصف سيو معاً ÷ كل الصفحات × ١٠٠.'),
        ('meta_missing', 'صفحات ناقصة الميتاداتا',
         v_no_meta, null, 'number',
         'ينقصها عنوان السيو أو وصفه أو كلاهما — هذه قائمة عمل مركز السيو.'),
        ('jsonld_pages', 'صفحات ببيانات مهيكلة',
         v_faq, null, 'number',
         'الصفحات التي فيها قسم أسئلة شائعة ظاهر وفيه عنصر مكتمل (سؤال وجواب معاً) — وهو بالضبط ما يُصدَّر منه JSON-LD اليوم. قسم أسئلة فارغ لا يُعدّ لأنه لا يُصدِّر شيئاً. والرئيسية لها JSON-LD من الكود ولا تُعدّ هنا.'),
        ('pages_updated', 'صفحات عُدِّلت',
         v_c_touched, public.stats_delta(v_c_touched, v_p_touched), 'number',
         'الصفحات التي تغيّرت داخل الفترة — المؤشر الوحيد هنا الذي تخصه فترة.')
      ) as x(k, l, v, d, f, h);
    end;

  -- ── (٦-١-ز) الخصومات — القسم السابع (هجرة 0024) ──────────────────────────
  --
  -- المصدر `v_stats_discounts` وحده: صفّ الاستخدام هو الأثر المالي الوحيد للخصم
  -- (لا قيد دفتر له — القاعدة ٥ في lib/discount-types.ts). و«قيمة الطلبات قبل
  -- الخصم» تُشتق جمعاً (بعد + الخصم) لا من عمود ثانٍ، فلا رقمان لشيء واحد.
  --
  -- ⚠ `discount_amount` هو ما خُصم **فعلاً** بعد كل الحدود لا القيمة الاسمية
  -- للكوبون. والفرق بينهما يظهره `clamped_rate` صراحةً: المالك يرى أن حملته لم
  -- تُطبَّق كما أعلنها بدل أن يكتشفه من فرق في التقارير.
  elsif v_section = 'discounts' then
    declare
      v_c_uses    numeric := 0;
      v_c_amount  numeric := 0;
      v_c_after   numeric := 0;
      v_c_clamp   numeric := 0;
      v_c_avg     numeric := 0;
      v_c_share   numeric := 0;
      v_c_crate   numeric := 0;
      v_p_uses    numeric := 0;
      v_p_amount  numeric := 0;
      v_p_after   numeric := 0;
      v_p_clamp   numeric := 0;
      v_p_avg     numeric := 0;
      v_p_share   numeric := 0;
      v_p_crate   numeric := 0;
      v_active    numeric := 0;
    begin
      select
        coalesce(sum(g.redemptions_count), 0),
        coalesce(sum(g.discount_amount), 0),
        coalesce(sum(g.discounted_orders_value), 0),
        coalesce(sum(g.clamped_count), 0)
      into v_c_uses, v_c_amount, v_c_after, v_c_clamp
      from public.v_stats_discounts g
      where g.day between v_from and v_to;

      select
        coalesce(sum(g.redemptions_count), 0),
        coalesce(sum(g.discount_amount), 0),
        coalesce(sum(g.discounted_orders_value), 0),
        coalesce(sum(g.clamped_count), 0)
      into v_p_uses, v_p_amount, v_p_after, v_p_clamp
      from public.v_stats_discounts g
      where g.day between v_pfrom and v_pto;

      v_c_avg := case when v_c_uses > 0 then round(v_c_amount / v_c_uses, 2) else 0 end;
      v_p_avg := case when v_p_uses > 0 then round(v_p_amount / v_p_uses, 2) else 0 end;

      -- النسبة من قيمة الطلبات **قبل** الخصم = (بعد الخصم + الخصم)
      v_c_share := case when (v_c_after + v_c_amount) > 0
                        then round(100.0 * v_c_amount / (v_c_after + v_c_amount), 1)
                        else 0 end;
      v_p_share := case when (v_p_after + v_p_amount) > 0
                        then round(100.0 * v_p_amount / (v_p_after + v_p_amount), 1)
                        else 0 end;

      v_c_crate := case when v_c_uses > 0 then round(100.0 * v_c_clamp / v_c_uses, 1) else 0 end;
      v_p_crate := case when v_p_uses > 0 then round(100.0 * v_p_clamp / v_p_uses, 1) else 0 end;

      -- لقطة لحظية: «فعّال الآن» ليست خاصية فترة، فلا delta لها
      select coalesce(count(*), 0) into v_active
      from public.coupons c
      where c.enabled
        and (c.starts_at is null or c.starts_at <= now())
        and (c.ends_at   is null or c.ends_at   >  now())
        and (c.max_uses  is null or c.used_count < c.max_uses);

      return query
      select x.k, x.l, x.v, x.d, x.f, x.h
      from (values
        ('redemptions_count'::text, 'مرات استخدام الكوبونات'::text,
         v_c_uses::numeric, public.stats_delta(v_c_uses, v_p_uses)::numeric,
         'number'::text,
         'كل استخدام كوبون سُجِّل داخل الفترة — وكوبون واحد لكل حجز فلا تراكم.'::text),
        ('discount_amount', 'قيمة الخصومات',
         v_c_amount, public.stats_delta(v_c_amount, v_p_amount), 'money',
         'ما خُصم فعلاً بعد كل الحدود — لا القيمة الاسمية للكوبونات. ويقتطع من هامش الموقع وحده ولا يمسّ تكلفة المتعهد.'),
        ('discounted_orders_value', 'قيمة الطلبات المخصومة',
         v_c_after, public.stats_delta(v_c_after, v_p_after), 'money',
         'إجمالي الحجوزات التي استُخدم فيها كوبون بعد الخصم — وهو ما يدخل تقارير الهامش والخزينة.'),
        ('avg_discount', 'متوسط الخصم',
         v_c_avg, public.stats_delta(v_c_avg, v_p_avg), 'money',
         'قيمة الخصومات ÷ عدد مرات الاستخدام.'),
        ('discount_share', 'نسبة الخصم من السعر',
         v_c_share, public.stats_delta(v_c_share, v_p_share), 'percent',
         'الخصم ÷ (قيمة الطلبات المخصومة + الخصم) × ١٠٠ — أي نسبته من السعر قبل الخصم.'),
        ('clamped_rate', 'نسبة الخصومات المقلَّصة',
         v_c_crate, public.stats_delta(v_c_crate, v_p_crate), 'percent',
         'الاستخدامات التي قلّصت أرضيةُ الهامش خصمَها عن قيمته الاسمية ÷ كل الاستخدامات × ١٠٠. ارتفاعها يعني حملة أكبر مما يحتمله الهامش، لا عطلاً.'),
        ('active_coupons', 'كوبونات فعّالة الآن',
         v_active, null, 'number',
         'كوبونات مفعّلة داخل نافذة صلاحيتها ولم تبلغ سقف استخدامها — لقطة لحظية لا تخص فترة.')
      ) as x(k, l, v, d, f, h);
    end;

  -- ── (٦-١-و) اللغات ───────────────────────────────────────────────────────
  -- لقطة كذلك: تقدّم الترجمة حالةٌ راهنة، فكل delta هنا null بصدق.
  else
    declare
      v_total     numeric := 0;
      v_enabled   numeric := 0;
      v_published numeric := 0;
      v_missing   numeric := 0;
      v_stale     numeric := 0;
      v_percent   numeric := 0;
    begin
      select
        coalesce(count(*), 0),
        coalesce(count(*) filter (where lo.enabled), 0),
        coalesce(sum(lo.published), 0),
        coalesce(sum(lo.missing), 0),
        coalesce(sum(lo.stale), 0),
        coalesce(round(avg(lo.percent) filter (where lo.enabled and not lo.is_default), 1), 100)
      into v_total, v_enabled, v_published, v_missing, v_stale, v_percent
      from public.v_stats_locales lo;

      return query
      select x.k, x.l, x.v, x.d, x.f, x.h
      from (values
        ('locales_enabled'::text, 'لغات مفعّلة'::text,
         v_enabled::numeric, null::numeric, 'number'::text,
         'اللغات التي يراها الزائر في مبدّل اللغة — لقطة لحظية لا تخص فترة.'::text),
        ('locales_total', 'لغات معرّفة',
         v_total, null, 'number',
         'كل اللغات في القاعدة، مفعّلة كانت أو لا.'),
        ('translations_published', 'نصوص منشورة',
         v_published, null, 'number',
         'مجموع النصوص المنشورة عبر كل اللغات.'),
        ('translations_missing', 'نصوص ناقصة',
         v_missing, null, 'number',
         'مفاتيح لا ترجمة لها بعد في اللغات غير الأساس.'),
        ('translations_stale', 'نصوص قديمة',
         v_stale, null, 'number',
         'ترجمة منشورة تغيّر أصلها العربي بعدها — تُعرض للزائر وهي لم تعد تطابق الأصل.'),
        ('avg_percent', 'متوسط اكتمال الترجمة',
         v_percent, null, 'percent',
         'متوسط نسبة الاكتمال عبر اللغات المفعّلة غير الأساس (والنسبة تحتسب المنشور غير القديم وحده).')
      ) as x(k, l, v, d, f, h);
    end;
  end if;

  return;
end;
$function$;

-- ── view v_stats_customers
create or replace view public.v_stats_customers with (security_invoker=true) as
 WITH tagged AS (
         SELECT (b.created_at AT TIME ZONE public.site_time_zone())::date AS day,
            b.phone_norm AS phone,
            b.total,
            row_number() OVER (PARTITION BY b.phone_norm ORDER BY b.created_at, b.id) AS seq
           FROM public.bookings b
          WHERE b.phone_norm IS NOT NULL
        )
 SELECT day,
    count(*)::integer AS orders_count,
    count(DISTINCT phone)::integer AS customers_count,
    count(*) FILTER (WHERE seq = 1)::integer AS new_customers,
    count(*) FILTER (WHERE seq > 1)::integer AS returning_orders,
    COALESCE(sum(total), 0::numeric)::numeric(14,2) AS orders_value
   FROM tagged t
  GROUP BY day;

-- ── view v_stats_discounts
create or replace view public.v_stats_discounts with (security_invoker=true) as
 SELECT (r.redeemed_at AT TIME ZONE public.site_time_zone())::date AS day,
    count(*)::integer AS redemptions_count,
    count(DISTINCT r.coupon_id)::integer AS coupons_used,
    COALESCE(sum(r.amount), 0::numeric)::numeric(14,2) AS discount_amount,
    COALESCE(sum(b.total), 0::numeric)::numeric(14,2) AS discounted_orders_value,
    count(*) FILTER (WHERE r.clamped)::integer AS clamped_count
   FROM public.coupon_redemptions r
     JOIN public.bookings b ON b.id = r.booking_id
  GROUP BY ((r.redeemed_at AT TIME ZONE public.site_time_zone())::date);

-- ── view v_stats_dispatch
create or replace view public.v_stats_dispatch with (security_invoker=true) as
 SELECT (d.created_at AT TIME ZONE public.site_time_zone())::date AS day,
    count(*)::integer AS dispatches_count,
    count(*) FILTER (WHERE d.status = ANY (ARRAY['assigned'::text, 'manual'::text]))::integer AS assigned_count,
    count(*) FILTER (WHERE d.manual_assign)::integer AS manual_count,
    count(*) FILTER (WHERE d.status = 'cancelled'::text)::integer AS cancelled_count,
    count(*) FILTER (WHERE d.status = ANY (ARRAY['queued'::text, 'broadcasting'::text]))::integer AS open_count,
    COALESCE(sum(o.offers_count), 0::bigint)::integer AS offers_count,
    COALESCE(sum(o.accepted_count), 0::bigint)::integer AS accepted_count,
    COALESCE(sum(o.first_accept_minutes), 0::numeric)::numeric(14,2) AS first_accept_minutes_total,
    count(*) FILTER (WHERE o.first_accept_minutes IS NOT NULL)::integer AS first_accept_samples,
        CASE
            WHEN count(*) FILTER (WHERE o.first_accept_minutes IS NOT NULL) > 0 THEN (sum(o.first_accept_minutes) / count(*) FILTER (WHERE o.first_accept_minutes IS NOT NULL)::numeric)::numeric(14,2)
            ELSE NULL::numeric
        END AS avg_first_accept_minutes
   FROM public.dispatches d
     LEFT JOIN LATERAL ( SELECT count(*)::integer AS offers_count,
            count(*) FILTER (WHERE t.status = 'accepted'::text)::integer AS accepted_count,
            (EXTRACT(epoch FROM min(t.responded_at) FILTER (WHERE t.status = 'accepted'::text) - min(t.created_at)) / 60.0)::numeric(14,2) AS first_accept_minutes
           FROM public.trip_offers t
          WHERE t.booking_id = d.booking_id) o ON true
  GROUP BY ((d.created_at AT TIME ZONE public.site_time_zone())::date);

-- ── view v_stats_orders
create or replace view public.v_stats_orders with (security_invoker=true) as
 SELECT (created_at AT TIME ZONE public.site_time_zone())::date AS day,
    status,
    currency,
    count(*)::integer AS orders_count,
    COALESCE(sum(total), 0::numeric)::numeric(14,2) AS orders_value,
    COALESCE(sum(amount_due), 0::numeric)::numeric(14,2) AS due_value,
    COALESCE(sum(amount_remaining), 0::numeric)::numeric(14,2) AS remaining_value
   FROM public.bookings b
  GROUP BY ((created_at AT TIME ZONE public.site_time_zone())::date), status, currency;

-- ── view v_stats_treasury
create or replace view public.v_stats_treasury with (security_invoker=true) as
 SELECT (occurred_at AT TIME ZONE public.site_time_zone())::date AS day,
    COALESCE(sum(amount) FILTER (WHERE direction = 'in'::text), 0::numeric)::numeric(14,2) AS inflow,
    COALESCE(sum(amount) FILTER (WHERE direction = 'out'::text), 0::numeric)::numeric(14,2) AS outflow,
    (COALESCE(sum(amount) FILTER (WHERE direction = 'in'::text), 0::numeric) - COALESCE(sum(amount) FILTER (WHERE direction = 'out'::text), 0::numeric))::numeric(14,2) AS net,
    count(*)::integer AS entries_count
   FROM public.ledger_entries e
  WHERE account_id IS NOT NULL
  GROUP BY ((occurred_at AT TIME ZONE public.site_time_zone())::date);

-- ----------------------------------------------------------------------------
-- (٥) الفحوص الذاتية — تحرس ما كان قائماً لا ما أُضيف (D-58 القاعدة ٢)
-- ----------------------------------------------------------------------------
do $$
declare
  v_names  text;
  v_count  integer;
  v_caught boolean;
  v_row    boolean;
  v_before text;
begin
  -- (٥-أ) 🔴 حارس «مصدرٌ واحد»: صفر نصٍّ حرفيٍّ باقٍ في أي دالة أو عرض.
  --       ويبقى حيّاً بعد اليوم: دالةٌ جديدة تُكتب بالنصّ الحرفي تُمسك هنا.
  --       و`site_time_zone` وحدها مستثناة — النصّ فيها هو الـfallback نفسه.
  select string_agg(p.proname, ', ' order by p.proname) into v_names
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.prokind in ('f', 'p')
     and p.prosrc like '%Africa/Cairo%'
     and p.proname <> 'site_time_zone';
  if v_names is not null then
    raise exception '0075: بقيت منطقة مثبّتة نصّاً في دوال: %', v_names;
  end if;

  select string_agg(c.relname, ', ' order by c.relname) into v_names
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind in ('v', 'm')
     and pg_get_viewdef(c.oid) like '%Africa/Cairo%';
  if v_names is not null then
    raise exception '0075: بقيت منطقة مثبّتة نصّاً في عروض: %', v_names;
  end if;

  -- (٥-ب) الدالة **وحيدةٌ بالاسم وبلا وسيط** — عدٌّ بالاسم لا `regprocedure`
  select count(*) into v_count
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'site_time_zone';
  if v_count <> 1 then
    raise exception '0075: عدد دوال site_time_zone بالاسم = % (المتوقع ١)', v_count;
  end if;

  select count(*) into v_count
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'site_time_zone' and p.pronargs <> 0;
  if v_count <> 0 then
    raise exception '0075: site_time_zone اكتسبت وسيطاً — النطاق يجب أن يبقى داخل التوقيع';
  end if;

  -- (٥-ج) الافتراضي هو القاهرة ⇒ **التركيب القائم لا يتغيّر سلوكه بحرف**
  select column_default into v_names
    from information_schema.columns
   where table_schema = 'public' and table_name = 'trip_settings' and column_name = 'time_zone';
  if v_names is null or v_names not like '%Africa/Cairo%' then
    raise exception '0075: افتراضي trip_settings.time_zone ليس Africa/Cairo (الفعلي: %)',
      coalesce(v_names, '(غائب)');
  end if;

  -- والدالة تعكس الصفّ لا قيمةً ثانية تنحرف عنه
  if public.site_time_zone() is distinct from coalesce(
       (select t.time_zone from public.trip_settings t where t.id limit 1), 'Africa/Cairo')
  then
    raise exception '0075: site_time_zone() لا تطابق صفّ trip_settings';
  end if;

  -- (٥-د) مكافئةٌ سلوكية عند القيمة الافتراضية: النداء = النصّ الحرفي حرفاً
  if (select t.time_zone from public.trip_settings t where t.id limit 1) = 'Africa/Cairo'
     and (now() at time zone public.site_time_zone())
         is distinct from (now() at time zone 'Africa/Cairo')
  then
    raise exception '0075: النداء لا يطابق النصّ الحرفي عند القيمة الافتراضية';
  end if;

  -- (٥-هـ) 🔴 حارسٌ **يمكن أن يفشل**: منطقةٌ غير موجودة تُرفض فعلاً.
  --        الاختبار داخل معاملة فرعية تتراجع، ولا يبقى منها أثر.
  select exists (select 1 from public.trip_settings) into v_row;
  if v_row then
    select t.time_zone into v_before from public.trip_settings t where t.id limit 1;
    v_caught := false;
    begin
      update public.trip_settings set time_zone = 'Mars/Olympus_Mons' where id;
    exception when others then
      v_caught := true;
    end;
    if not v_caught then
      raise exception '0075: مُشغّل التحقق قَبِل منطقة غير موجودة في قاعدة المناطق';
    end if;
    if (select t.time_zone from public.trip_settings t where t.id limit 1)
       is distinct from v_before then
      raise exception '0075: المعاملة الفرعية لم تتراجع عن قيمة الاختبار';
    end if;
  end if;

  raise notice '0075: الفحوص الذاتية الخمسة نجحت — ١٢ دالة و٥ عروض تقرأ site_time_zone()';
end $$;
