-- ============================================================================
-- 0025_authenticated_hardening.sql — تصليب دور `authenticated` (المرحلة ١١)
--
-- سبب الوجود في سطر واحد: كل سياسات المشروع كُتبت على القاعدة الأم D-20 —
-- «كل `authenticated` متعهدٌ أو موظف» — وجردٌ كامل لصلاحيات هذا الدور كشف أبواباً
-- مفتوحة **اليوم** لمتعهدي البورتال، لا في المستقبل.
--
-- وحقيقة تؤطّر الملف كله: `profiles.role` قيمتها الافتراضية `'customer'` منذ
-- 0001. أي أن D-20 ليست مفروضة في القاعدة بحرف واحد — يفرضها **غياب باب تسجيل
-- عام** فقط. فهذا الملف يسبق فتح التسجيل في المرحلة ١٢ب ولا ينتظره.
--
-- ── العيوب التي يعالجها ─────────────────────────────────────────────────────
--  (١) [حرج] `available_payment_accounts(numeric)` ممنوحة لـ `authenticated`
--      بلا حارس (0009:722 ثم 0015:1555)، فتعيد لكل متعهد `handle` (رقم المحفظة
--      أو الآيبان) و`holder_name` و`daily_headroom`/`monthly_headroom` — وفرقُ
--      الأخيرين بين يومين هو **الإيراد اليومي للمنصة**. والمفارقة أن 0009 أغلق
--      الثغرة نفسها على `anon` بتحميل زائد يشترط توكن حجز (0009:651-654).
--
--  (٢) [مهم] أربع سياسات `using (true)` تُري المسجَّل ما يُحجب عن الزائر:
--      الصفحات غير المنشورة بميتاداتاها (0003:74) · الأقسام المخفية (0003:124)
--      · فئات السيارات المعطَّلة (0005:147) · اللغات غير المفعّلة (0018:1087).
--
--  (٣) [مهم] `dispatch_ops_allowed` (0014:131) تفحص `current_user` داخل
--      `security definer` — وهو **مالك الدالة** لا المستدعي، والهجرات تعمل باسم
--      `postgres` ⇒ السطر `true` لكل من بلغه. والمشروع يستعمل `session_user`
--      في ثلاثة حرّاس أخرى بتعليق يشرح السبب حرفياً (0015:379-381 · 0018:102
--      · 0022:113-115) — هذا وحده شذّ.
--
--  (٤) [دفاع في العمق] منح `select` على العروض الإحصائية لـ `authenticated`
--      (0022:1579-1585 و0024:1924). **لم تُسحب** — والسبب مكتوب في القسم (٤)
--      أدناه: شاشات `/admin/stats` تقرأها **بجلسة المستخدم** لا بمفتاح الخدمة.
--
--  (٥) [صغير] منح `insert` على `quote_requests` لـ `authenticated` (0007:1274).
--      **لم يُسحب** — والسبب في القسم (٥): السياسة التي تسنده قائمة فعلاً.
--
-- ⚠ ما لا يُمسّ في هذا الملف: منح 0015 الأربعة على `v_ledger_resolved` و
--   `v_account_balances` و`v_booking_profit` و`v_partner_settlements` — لازمة
--   لسلسلة `security_invoker` والمبرر مكتوب في 0015:1496-1499.
--
-- آمن لإعادة التنفيذ (idempotent). القسم (٦) فحص ذاتي يُسقط الهجرة إن بقي أي
-- مما أُغلق مفتوحاً.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (١) أرقام حسابات التحصيل لم تعد مكشوفة لكل مسجَّل
--
-- ── لماذا لم يُسحب المنح ببساطة ───────────────────────────────────────────────
-- `app/admin/payment-accounts/page.tsx:150` يستدعي الدالة أحادية الوسيط بـ
-- `createServerSupabase()` — **عميل جلسة المستخدم** لا مفتاح الخدمة (نفس الملف
-- سطر 236). فسحب المنح صامتاً كان يكسر شاشة «حسابات التحصيل» في اللوحة: عمود
-- «المستلَم اليوم/الشهر» كله يأتي من هذه الدالة (تعليق الملف سطور 133-137).
-- ⇒ الحارس **داخل جسم الدالة** على نمط `get_margin_settings` (0011:56-58).
--
-- ── ولماذا `finance_admin_allowed()` لا `is_admin()` ────────────────────────
-- `is_admin()` وحدها كانت تكسر شيئين: اتصال الهجرات والاختبارات المباشر (بلا
-- `auth.uid()` ⇒ صفر صف ⇒ رسوب `booking_tests` (ز-١..ز-٧) و`finance_tests`
-- (ك-١))، ومسار `service_role`. و`finance_admin_allowed()` (0015) هي بالضبط
-- النسخة المكتملة من `is_admin()` لهذا السياق: مشرف ⇒ نعم · عميل خدمة ⇒ نعم ·
-- اتصال مالك القاعدة ⇒ نعم · طلب متصفح غير مشرف ⇒ **لا قاطعاً**. وهي دالة
-- مالية، والحسابات هنا مالية.
--
-- ── ولماذا دالة داخلية جديدة ────────────────────────────────────────────────
-- التحميل الزائد `(text, numeric)` — طريق **العميل الضيف** إلى صفحة التحويل —
-- كان يستدعي أحادية الوسيط في جسمه (0009:678). فوضع الحارس فيها مباشرة كان
-- يُرجع صفر صف لكل زائر ⇒ **كسر صفحة الدفع نفسها**، وهي أهم مسار في المنتج.
-- فالجسم انتقل إلى دالة داخلية بلا أي منح، والغلافان يستدعيانها: أحادي الوسيط
-- بحارس، وذو التوكن بشرط التوكن كما كان. مصدر واحد للحقيقة، وبابان بحارسَين.
-- ----------------------------------------------------------------------------

-- (١-١) الجسم — منسوخ حرفياً من 0015:108-146 بلا تغيير حرف في المنطق
create or replace function public.payment_accounts_within_caps(p_amount numeric)
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
    and pa.customer_facing
    and (pa.daily_cap   is null or u.used_today + a.amount <= pa.daily_cap)
    and (pa.monthly_cap is null or u.used_month + a.amount <= pa.monthly_cap)
  order by pa.sort asc, pa.label asc;
$$;

comment on function public.payment_accounts_within_caps(numeric) is
  'الحسابات المعروضة للعميل ضمن حدودها اليومية/الشهرية — دالة داخلية بحتة بلا أي منح: يستدعيها غلافا available_payment_accounts وحدهما، كلٌّ بحارسه.';

-- دالة داخلية: بلا منح لأي دور مستخدم ولا لـ service_role — الغلافان definer
-- فيستدعيانها بهوية المالك. منحها لأي دور يعيد الثغرة من الباب الخلفي.
revoke all on function public.payment_accounts_within_caps(numeric)
  from public, anon, authenticated;

-- (١-٢) الغلاف أحادي الوسيط — للوحة وعميل الخدمة، بحارس داخل الجسم
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
  select a.id, a.kind, a.label, a.handle, a.holder_name,
         a.daily_headroom, a.monthly_headroom
  from public.payment_accounts_within_caps(p_amount) a
  where public.finance_admin_allowed();
$$;

comment on function public.available_payment_accounts(numeric) is
  'الحسابات المتاحة للمبلغ — 🔒 محروسة بـ finance_admin_allowed() منذ 0025: كانت تعيد رقم المحفظة والمتاح اليومي لكل مستخدم مسجَّل، والمتعهد مستخدم مسجَّل. طريق العميل هو التحميل الزائد ذو التوكن.';

-- (١-٣) الغلاف ذو التوكن — طريق العميل الضيف، بلا أي تغيير في شرطه
--       (منسوخ من 0009:658-687؛ التغيير الوحيد: يستدعي الدالة الداخلية بدل
--        أحادية الوسيط، وإلا لأسقطه حارسُها فانكسرت صفحة الدفع للزائر)
create or replace function public.available_payment_accounts(
  p_token  text,
  p_amount numeric
)
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
  select a.id, a.kind, a.label, a.handle, a.holder_name,
         a.daily_headroom, a.monthly_headroom
  from public.payment_accounts_within_caps(p_amount) a
  where exists (
    select 1
    from public.bookings b
    where p_token is not null
      and length(p_token) >= 32
      and b.public_token = p_token
      and b.status = 'pending_payment'
  );
$$;

comment on function public.available_payment_accounts(text, numeric) is
  'حسابات التحويل للعميل الضيف — مربوطة بتوكن حجز ما زال بانتظار الدفع (0009). تستدعي payment_accounts_within_caps مباشرة فلا يمسّها حارس النسخة الإدارية.';

-- (١-٤) الصلاحيات — يُعاد إصدارها كاملة لأن `create or replace` يحفظ القديم
revoke all    on function public.available_payment_accounts(numeric)
  from public, anon, authenticated;
grant execute on function public.available_payment_accounts(numeric) to authenticated;

revoke all    on function public.available_payment_accounts(text, numeric)
  from public, anon, authenticated;
grant execute on function public.available_payment_accounts(text, numeric) to anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.available_payment_accounts(numeric) to service_role';
    execute 'grant execute on function public.available_payment_accounts(text, numeric) to service_role';
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- (٢) أربع سياسات `using (true)` — شرط الزائر يُنسخ حرفياً إلى المسجَّل
--
-- الشروط أدناه **مقروءة من الملفات لا مكتوبة من الذاكرة**:
--   pages            ← 0003:71   `published = true`
--   sections         ← 0003:112-119 مركّب: `visible` **و** الصفحة الأمّ منشورة
--   vehicle_classes  ← 0005:141  `active = true`
--   locales          ← لا سياسة anon أصلاً: 0018:1071 يسحب كل شيء من anon ولا
--                      يمنحه، والزائر يصل عبر `enabled_locales()` وحدها
--                      (0019). فشرط «العام» هنا هو `enabled` — وهو بالضبط ما
--                      ترشّح به تلك الدالة (0019:44).
--
-- و`or public.is_admin()` كي لا تتعطل اللوحة (شاشات المحتوى والأسطول واللغات
-- تعرض المسودة والمعطَّل عمداً).
--
-- ⚠ أثرٌ مقصود يجب أن يعرفه المالك: دور `ops` (0001:41) يدخل `/admin`
--   (`proxy.ts:223`) ولا يجتاز `is_admin()`. فبعد هذه الهجرة يرى في تلك الشاشات
--   المنشورَ والنشطَ والمفعّل وحده. سياسات **الكتابة** على الجداول الأربعة
--   محصورة بـ `is_admin()` منذ 0003/0005/0018 أصلاً، فالتغيير في القراءة فقط.
--   وتوسيع الحارس إلى `ops` قرارٌ للمالك لا تجميلٌ يُتخذ هنا (OPEN_TASKS ج).
-- ----------------------------------------------------------------------------

drop policy if exists "pages_select_authenticated" on public.pages;
create policy "pages_select_authenticated"
  on public.pages
  for select
  to authenticated
  using (published = true or public.is_admin());

drop policy if exists "sections_select_authenticated" on public.sections;
create policy "sections_select_authenticated"
  on public.sections
  for select
  to authenticated
  using (
    (
      visible = true
      and exists (
        select 1
        from public.pages p
        where p.id = sections.page_id
          and p.published = true
      )
    )
    or public.is_admin()
  );

drop policy if exists "vehicle_classes_select_authenticated" on public.vehicle_classes;
create policy "vehicle_classes_select_authenticated"
  on public.vehicle_classes
  for select
  to authenticated
  using (active = true or public.is_admin());

drop policy if exists "locales_select_authenticated" on public.locales;
create policy "locales_select_authenticated"
  on public.locales
  for select
  to authenticated
  using (enabled = true or public.is_admin());

-- ----------------------------------------------------------------------------
-- (٣) حارس البث: `current_user` ← `session_user` + حاجز مبكر
--
-- تغييران اثنان لا ثالث لهما، والجسم فيما عداهما منسوخ حرفياً من 0014:89-138.
--
-- (أ) الحاجز المبكر **بعد** فحص `is_admin()` لا قبله — وهذا هو موضعه في
--     الحرّاس الثلاثة الأخرى (0015:341-347 · 0018:65-73 · 0022). ولهذا الترتيب
--     سبب تشغيلي لا جمالي: المشرف يصل `manual_assign` من
--     `app/admin/orders/[id]/dispatch-actions.ts:174` بعميل جلسة المستخدم — أي
--     بدور `authenticated` — فيمرّ من الفرع الأول. أما `start_dispatch`
--     و`dispatch_tick` فيصلان بمفتاح الخدمة (`lib/dispatch/start.ts:51`
--     و`lib/dispatch/tick.ts`). فلا مسار مشروع واحد يعتمد على السطر الذي نُسقطه.
--
-- (ب) `session_user` هو مستخدم الاتصال الأصلي ولا يبدّله `security definer`.
--     واتصال PostgREST كله باسم `authenticator` فلا يمر من هذا السطر أبداً —
--     وهذا بالضبط ما كان `current_user` (= مالك الدالة = `postgres`) يهدمه.
--
-- ما لم يُضف عمداً: قبول `service_role` من متغيّر `role` كما تفعل الحرّاس
-- الثلاثة. زيادة **مسار سماح** ليست من غرض هذا الملف، والمسار القائم عبر
-- `request.jwt.claims` يكفي عميل الخدمة. البقاء أضيق أسلم.
-- ----------------------------------------------------------------------------
create or replace function public.dispatch_ops_allowed()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid    uuid;
  v_role   text;
  v_pgrole text;
begin
  if public.is_admin() then
    return true;
  end if;

  -- الدور الذي يضبطه PostgREST بـ `set local role` لا يبدّله security definer:
  -- طلب قادم من متصفح وليس لمشرف ⇒ رفض قاطع لا يُنقَض بأي سياق اتصال.
  v_pgrole := coalesce(nullif(current_setting('role', true), ''), '');
  if v_pgrole in ('anon', 'authenticated') then
    return false;
  end if;

  begin
    v_uid := auth.uid();
  exception
    when others then
      v_uid := null;
  end;

  -- هوية مستخدم حاضرة وليست مشرفاً ⇒ رفض مهما كان مستخدم قاعدة البيانات.
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

  -- الترحيلات والاختبارات ومحرر SQL: اتصال مباشر بمالك القاعدة وبلا هوية.
  -- ⚠ `session_user` عمداً — وهو مستخدم الاتصال الأصلي لا يبدّله security
  -- definer. أما «المستخدم الحالي» فهو داخل definer **مالك الدالة** (postgres)
  -- دائماً، فكان الفحص عليه يرجع true لكل من بلغ هذا السطر. لا تُعده إلى ما كان.
  -- (تعمّدنا ألا يرد الاسم القديم حرفياً هنا: فحص 0025 §٦-٤ يبحث عنه في المصدر.)
  return session_user in ('postgres', 'supabase_admin');
end;
$$;

comment on function public.dispatch_ops_allowed() is
  'حارس التشغيل — مشرف أو عميل خدمة أو اتصال مالك القاعدة؛ ويفشل مغلقاً. صُحّح في 0025: current_user (= مالك الدالة دائماً) ← session_user، وحاجز مبكر يردّ anon/authenticated بعد فحص is_admin().';

-- ----------------------------------------------------------------------------
-- (٤) العروض الإحصائية — **لم تُسحب المنح**، وهذا هو السبب
--
-- التحقق المطلوب قبل السحب أُجري وجاء بالنفي: شاشات `/admin/stats` كلها تقرأ
-- **بجلسة المستخدم** لا بمفتاح الخدمة، و`lib/stats/read.ts:19-22` يكتب ذلك
-- قراراً معماريّاً صريحاً («استعمال مفتاح الخدمة هنا كان سيجعل أي خلل في حارس
-- الصفحة تسريباً كاملاً»). والقراءات المباشرة على العروض:
--   lib/stats/read.ts:312  v_stats_treasury   · :374 v_stats_partners
--   lib/stats/read.ts:436  v_stats_content    · :475 v_stats_locales
--   app/admin/stats/discounts/loader.ts:50    v_stats_discounts
-- وكلها عبر `createServerSupabase()` (app/admin/stats/*/page.tsx). فسحب المنح
-- كان يُفرغ مركز الإحصائيات كله من الأرقام على المشرف نفسه.
--
-- والحاجز القائم بنيوي لا عرضي: العروض الثمانية كلها `security_invoker = true`
-- ومحرّكها `bookings` (وسياستها `is_admin()`)، فالمسجَّل غير المشرف يأخذ صفر
-- صف. لذلك الإجراء هنا **تثبيت الحاجز** لا سحب المنح:
--   • القسم (٦) يُسقط الهجرة إن فقد أي عرض `security_invoker` — و0022 §٩-٣
--     يفحص السبعة ولا يفحص `v_stats_discounts` (0024) إطلاقاً. هذه ثغرة فحص
--     تُسدّ هنا.
--   • `analytics_tests` (ل-٢) يعدّ صفوف السبعة للمتعهد ولا يعدّ الثامن — أُضيف.
--
-- ⚠ ما يبقى **مفتوحاً على المالك**: لحظة تضيف المرحلة ١٢ب سياسة `select` على
--   `bookings` تُري العميل حجوزه، تنقلب هذه العروض من «صفر صف» إلى «صفوف
--   العميل مجمَّعة» بلا أن يمسّ أحد 0022. الحل الصحيح حينها ليس سحب المنح
--   (تكسر اللوحة) بل شرط `is_admin()` داخل كل عرض أو حصر السياسة الجديدة
--   بـ `to anon` — قرارٌ يُتخذ مع تصميم ١٢ب لا قبله.
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- (٥) `quote_requests` — **لم يُسحب المنح**، وهذا هو السبب
--
-- الفرضية التي بُني عليها الطلب («0009:521 أسقط السياسة التي تسنده، فالمنح
-- معطَّل عملياً») لا تصمد أمام الملف: 0009:521 يُسقط
-- `quote_requests_insert_public` (سياسة الزائر المتساهلة `with check (true)`)،
-- ثم **0009:523-529 يُنشئ فوراً** `quote_requests_insert_admin` على
-- `authenticated` بشرط `with check (public.is_admin())`. أي أن المنح حيّ
-- ومسنود، وبابه مقصور على المشرف. سحبه لم يكن ليُغلق تسريباً — بل ليُلغي مسار
-- الإدراج الإداري الذي أنشأته 0009 عمداً في السطر نفسه.
--
-- والمتعهد اليوم يملك `insert` على الجدول ولا يُدرج صفاً واحداً: RLS تردّه بصفر
-- صف. فالإجراء هنا **تثبيت السند** لا سحب المنح — القسم (٦) يُسقط الهجرة إن
-- اختفت سياسة الإدراج الإدارية أو فقدت شرط `is_admin()`.
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- (٦) الفحص الذاتي — تسقط الهجرة إن بقي أي مما أُغلق مفتوحاً
--
-- قاعدة هذا القسم (النمط ٩ في LESSONS): **كل فحص سالب يسبقه شاهد إيجابي.**
-- فحصٌ يبحث عن مخالفات في مجموعة فارغة ينجح دائماً ولا يثبت شيئاً — وهو
-- بالضبط ما وقع في `parameter_mode = 'TABLE'`. لذلك كل مسبار هنا يثبت أولاً
-- أنه يرى الكائن الذي يفحصه.
-- ----------------------------------------------------------------------------
do $$
declare
  v_missing text;
  v_leak    text;
  v_n       integer;
  v_src     text;
begin
  -- (٦-١) الدوال الأربع موجودة بتواقيعها الحرفية — شاهد إيجابي لكل ما بعده
  select string_agg(x.sig, '، ')
    into v_missing
  from (values
    ('public.payment_accounts_within_caps(numeric)'),
    ('public.available_payment_accounts(numeric)'),
    ('public.available_payment_accounts(text, numeric)'),
    ('public.dispatch_ops_allowed()'),
    ('public.finance_admin_allowed()'),
    ('public.is_admin()')
  ) as x(sig)
  where to_regprocedure(x.sig) is null;

  if v_missing is not null then
    raise exception '0025: دوال ناقصة بعد التنفيذ: %', v_missing;
  end if;

  -- (٦-٢) 🔒 بند (١): الدالة الإدارية تحمل الحارس فعلاً في جسمها
  v_src := pg_get_functiondef('public.available_payment_accounts(numeric)'::regprocedure);
  -- شاهد إيجابي للمسبار نفسه: المصدر مقروء ويحوي اسم الدالة
  if v_src is null or position('available_payment_accounts' in v_src) = 0 then
    raise exception '0025: تعذّر قراءة مصدر available_payment_accounts — المسبار أعمى';
  end if;
  if position('finance_admin_allowed' in v_src) = 0 then
    raise exception
      '0025: available_payment_accounts(numeric) بلا حارس — أرقام المحافظ والإيراد اليومي مكشوفة لكل مسجَّل';
  end if;

  -- والتحميل الزائد ذو التوكن ما زال طريق الضيف: يستدعي الدالة الداخلية لا
  -- المحروسة (وإلا انكسرت صفحة الدفع على كل زائر بصمت)
  v_src := pg_get_functiondef('public.available_payment_accounts(text, numeric)'::regprocedure);
  if position('payment_accounts_within_caps' in v_src) = 0 then
    raise exception
      '0025: غلاف التوكن لا يستدعي الدالة الداخلية — صفحة تحويل العميل ستُرجع صفر حساب';
  end if;
  if position('finance_admin_allowed' in v_src) > 0 then
    raise exception
      '0025: غلاف التوكن ورث الحارس الإداري — الزائر لن يرى حساباً واحداً';
  end if;

  -- والدالة الداخلية بلا أي منفذ مباشر لدور عام
  select string_agg(r.who, '، ')
    into v_leak
  from (values ('anon'), ('authenticated')) as r(who)
  where exists (select 1 from pg_roles g where g.rolname = r.who)
    and has_function_privilege(r.who, 'public.payment_accounts_within_caps(numeric)', 'EXECUTE');

  if v_leak is not null then
    raise exception
      '0025: payment_accounts_within_caps مفتوحة لـ % — الثغرة عادت من الباب الخلفي', v_leak;
  end if;

  -- ولا منح ضمني لـ PUBLIC (‏grantee = 0 في الـ ACL) — وهو ما تمنحه Supabase
  -- افتراضياً لكل دالة جديدة، فغيابه من الـ ACL ليس تحصيل حاصل
  if exists (
    select 1
    from pg_proc pr
    cross join lateral aclexplode(coalesce(pr.proacl, acldefault('f', pr.proowner))) a
    where pr.oid = 'public.payment_accounts_within_caps(numeric)'::regprocedure
      and a.grantee = 0
  ) then
    raise exception
      '0025: payment_accounts_within_caps ممنوحة لـ PUBLIC — كل دور في القاعدة ينفّذها';
  end if;

  -- وشاهد إيجابي مقابل: اللوحة ما زالت تملك منفذها (وإلا كسرنا شاشة الحسابات)
  if not has_function_privilege('authenticated', 'public.available_payment_accounts(numeric)', 'EXECUTE') then
    raise exception
      '0025: authenticated فقد EXECUTE على available_payment_accounts(numeric) — شاشة /admin/payment-accounts تنكسر';
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon')
     and not has_function_privilege('anon', 'public.available_payment_accounts(text, numeric)', 'EXECUTE') then
    raise exception
      '0025: anon فقد EXECUTE على غلاف التوكن — صفحة الدفع تنكسر على كل زائر';
  end if;

  -- (٦-٣) 🔒 بند (٢): السياسات الأربع موجودة **أولاً** (شاهد إيجابي) ثم لا
  --        واحدة منها بشرط مفتوح
  select count(*)
    into v_n
  from pg_policies p
  where p.schemaname = 'public'
    and (p.tablename, p.policyname) in (
      ('pages',           'pages_select_authenticated'),
      ('sections',        'sections_select_authenticated'),
      ('vehicle_classes', 'vehicle_classes_select_authenticated'),
      ('locales',         'locales_select_authenticated')
    );

  if v_n <> 4 then
    raise exception
      '0025: وُجدت % سياسة من ٤ — المسبار لا يرى ما يفحصه فلا معنى لنتيجته', v_n;
  end if;

  select string_agg(p.tablename || '.' || p.policyname, '، ')
    into v_leak
  from pg_policies p
  where p.schemaname = 'public'
    and (p.tablename, p.policyname) in (
      ('pages',           'pages_select_authenticated'),
      ('sections',        'sections_select_authenticated'),
      ('vehicle_classes', 'vehicle_classes_select_authenticated'),
      ('locales',         'locales_select_authenticated')
    )
    and (
      coalesce(btrim(p.qual), 'true') = 'true'
      or position('is_admin' in coalesce(p.qual, '')) = 0
    );

  if v_leak is not null then
    raise exception
      '0025: سياسات ما زالت مفتوحة للمسجَّل (مسودات/مخفي/معطَّل): %', v_leak;
  end if;

  -- وشرط `sections` مركّب: نشرُ الصفحة الأمّ جزء منه، وفقدُه يسرّب أقسام المسودات
  select p.qual into v_src
  from pg_policies p
  where p.schemaname = 'public'
    and p.tablename  = 'sections'
    and p.policyname = 'sections_select_authenticated';

  if position('published' in coalesce(v_src, '')) = 0
     or position('visible' in coalesce(v_src, '')) = 0 then
    raise exception
      '0025: شرط sections فقد تركيبه (visible + نشر الصفحة الأمّ): «%»', coalesce(v_src, 'بلا');
  end if;

  -- (٦-٤) 🔒 بند (٣): الحارس لم يعد يفحص current_user، ويفحص session_user
  v_src := pg_get_functiondef('public.dispatch_ops_allowed()'::regprocedure);
  -- شاهد إيجابي للمسبار: نفس أسلوب المطابقة يلتقط رمزاً نعلم وجوده يقيناً
  if position('is_admin' in coalesce(v_src, '')) = 0 then
    raise exception
      '0025: مسبار مصدر dispatch_ops_allowed لا يلتقط is_admin — المطابقة معطّلة فلا تصدّق ما بعدها';
  end if;
  if position('current_user' in v_src) > 0 then
    raise exception
      '0025: dispatch_ops_allowed ما زالت تفحص current_user (= مالك الدالة) — الحارس يمرّر الجميع';
  end if;
  if position('session_user' in v_src) = 0 then
    raise exception
      '0025: dispatch_ops_allowed بلا session_user — اتصال الهجرات والاختبارات سيُرفض';
  end if;
  -- والحاجز المبكر حاضر
  if position('authenticated' in v_src) = 0 then
    raise exception
      '0025: dispatch_ops_allowed بلا الحاجز المبكر على anon/authenticated';
  end if;
  -- والمشرف ما زال يمرّ: `is_admin()` قبل الحاجز لا بعده
  if position('is_admin' in v_src) > position('current_setting(''role''' in v_src)
     and position('current_setting(''role''' in v_src) > 0 then
    raise exception
      '0025: الحاجز المبكر سبق فحص is_admin — المشرف يصل manual_assign بدور authenticated فسيُرفض';
  end if;

  -- (٦-٥) بند (٤): كل عرض إحصائي `security_invoker` — والثامن (0024) مشمول
  --        هنا لأول مرة (0022 §٩-٣ يفحص السبعة وحدها)
  select count(*)
    into v_n
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'v'
    and c.relname in ('v_stats_orders', 'v_stats_dispatch', 'v_stats_partners',
                      'v_stats_content', 'v_stats_locales', 'v_stats_treasury',
                      'v_stats_customers', 'v_stats_discounts');

  if v_n <> 8 then
    raise exception '0025: وُجد % عرض إحصائي من ٨ — نفّذ 0022 و0024 أولاً', v_n;
  end if;

  select string_agg(c.relname, '، ')
    into v_leak
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'v'
    and c.relname in ('v_stats_orders', 'v_stats_dispatch', 'v_stats_partners',
                      'v_stats_content', 'v_stats_locales', 'v_stats_treasury',
                      'v_stats_customers', 'v_stats_discounts')
    and coalesce(
          (select option_value from pg_options_to_table(c.reloptions)
            where option_name = 'security_invoker'), 'false'
        ) <> 'true';

  if v_leak is not null then
    raise exception
      '0025: عروض إحصائية بلا security_invoker — المنح للمسجَّل يصير تسريباً فورياً: %', v_leak;
  end if;

  -- (٦-٦) بند (٥): سند المنح قائم — سياسة إدراج إدارية بشرط is_admin
  select p.with_check into v_src
  from pg_policies p
  where p.schemaname = 'public'
    and p.tablename  = 'quote_requests'
    and p.policyname = 'quote_requests_insert_admin';

  if v_src is null then
    raise exception
      '0025: سياسة quote_requests_insert_admin مفقودة — منح insert للمسجَّل صار بلا سند';
  end if;
  if position('is_admin' in v_src) = 0 then
    raise exception
      '0025: quote_requests_insert_admin فقدت شرط is_admin: «%»', v_src;
  end if;

  -- والزائر ما زال ممنوعاً من الإدراج المباشر (تصليب 0009 لم يُنقض)
  if exists (select 1 from pg_roles where rolname = 'anon')
     and has_table_privilege('anon', 'public.quote_requests', 'INSERT') then
    raise exception '0025: نقض تصليب 0009 — anon عاد يُدرج في quote_requests مباشرة';
  end if;

  raise notice '✔ 0025: حسابات التحصيل محروسة، والمسودات والمخفي والمعطَّل والمعطَّلة محجوبة عن المسجَّل، وحارس البث يفشل مغلقاً';
end;
$$;
