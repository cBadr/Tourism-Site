-- ============================================================================
-- 0022_analytics.sql — أحداث القمع + إحصائيات كل قسم + جدول التحويلات
--
-- المرحلة ١٠. العقد المرجعي: lib/analytics-types.ts — لا انحراف عنه.
--
-- ── ما الذي يحرسه هذا الملف بالضبط ─────────────────────────────────────────
--
-- (١) **القمع يُحسب من بيانات المنصة لا من جوجل** (قرار ٥ في موجز المرحلة).
--     مانع الإعلانات يُسقط سكربتات جوجل وميتا صامتاً، فأرقام بدر يجب أن تظل
--     صحيحة بدونها. ولذلك: حدثان فقط لا أثر لهما في القاعدة (`search_performed`
--     و`quote_viewed` ومعهما `booking_started`) يُسجَّلان في `funnel_events`،
--     أما `quote_requested` و`booking_created` و`booking_paid` فتُعدّ من
--     **الجداول المرجعية نفسها** (`quote_requests` · `bookings` · `payments`)
--     لأن سجل الأحداث «رخيص ولا يُفشل الطلب إن فشل» — أي أنه قد يفقد صفاً،
--     وحجزٌ لم يظهر في القمع أسوأ من عدم وجود قمع.
--
-- (٢) **بلا أي PII في `funnel_events` — بنيوياً لا انضباطياً.** الجدول لا يحمل
--     عمود اسم ولا هاتف ولا بريد ولا IP ولا معرّف مستخدم أصلاً، ولا يحمل
--     `originLabel`/`destLabel` عمداً (عنوان الانطلاق قد يكون بيت العميل).
--     وقيود `check` على `reference` و`class_slug` و`currency` تمنع حشو نص حر
--     في الأعمدة الباقية — حاجز ثانٍ خلف الحاجز الأول: `anon` **لا يملك إدراجاً
--     أصلاً** والكتابة كلها بمفتاح الخدمة (القسم ٧).
--
-- (٣) **لا تكلفة متعهد ولا هامش موقع تصل مستخدم البورتال.** الأمان بنيوي:
--     كل عرض إحصائي محرّكه جدول محجوب عن المتعهد (`bookings` · `dispatches` ·
--     `ledger_entries` · `v_booking_profit`)، فالمتعهد يرى **صفر صف** لا أرقاماً
--     جزئية مضللة. ولم يُبنَ عرضٌ واحد فوق `trip_offers` مباشرة لهذا السبب.
--
-- (٤) **كل رقم في القاعدة لا في TypeScript** (قرار ٣). `section_stats` تُرجع
--     بطاقات `StatCard` جاهزة، و`funnel_daily` تُرجع سلاسل `StatSeries` جاهزة
--     بنقاطها مجمَّعة في jsonb — فلا تجميع ولا قسمة في الواجهة.
--
-- (٥) **توقيت القاهرة في كل تجميع يومي**: `(x at time zone 'Africa/Cairo')::date`
--     كما في 0015 حرفياً. إغفاله يجعل أرقام هذه الهجرة تخالف `cash_flow` بيوم.
--
-- ⚠ الفخّان المُوثَّقان منذ 0007 ويتكرران هنا حرفياً:
--   ١) الوصول إلى جدول طبقتان: GRANT + سياسة RLS، وكلاهما مطلوب. وإعدادات
--      Supabase الافتراضية تمنح anon **كل** شيء على أي جدول جديد — وTRUNCATE
--      لا تخضع لـ RLS إطلاقاً. لذلك: revoke all ثم grant صريح.
--   ٢) كل دالة جديدة تولد ومعها EXECUTE ضمني لـ PUBLIC ومنح صريح لـ anon.
--      لذلك لكل دالة: revoke from public, anon, authenticated ثم grant صريح.
--   ٣) وفخّ ثالث: عرض بلا `security_invoker` يعمل بصلاحيات مالكه فيتجاوز RLS
--      الجداول تحته. كل عروض هذا الملف السبعة `security_invoker = true`،
--      والفحص الذاتي في القسم (٩) يُسقط الهجرة إن اختلّت واحدة.
--
-- يُنفَّذ بعد 0003 (الصفحات والأقسام) و0007 (الحجوزات والمدفوعات) و0013 (البث)
-- و0015–0017 (الدفتر) و0018–0019 (اللغات) و0020–0021 (الدفع الإلكتروني).
-- آمن لإعادة التنفيذ بالكامل، والفحص الذاتي في القسم (٩) يُسقط الهجرة إن اختل
-- أي شرط من شروط إغلاق المرحلة.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (١) الحارس ودالة الفروق
--
-- لماذا حارس مستقل لا `is_admin()` وحدها: شاشات الإحصائيات تُقرأ أحياناً من
-- عميل الخدمة (تقارير خادمية ومهام مجدولة)، والهجرات والاختبارات تعمل بلا جلسة
-- مشرف. النص أدناه **مطابق حرفياً** لـ `finance_admin_allowed()` (0015) و
-- `i18n_admin_allowed()` (0018) — وهذا التطابق شرطٌ لا زخرفة: القسم (٤-٢) يستدعي
-- `translation_progress()` المحروسة بـ i18n، فلو اختلف المنطقان لصار عرض اللغات
-- يرمي استثناءً لمن أذنّا له.
-- ----------------------------------------------------------------------------
create or replace function public.analytics_admin_allowed()
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
  -- (`security definer` يبدّل current_user ولا يبدّل متغيّر role الذي يضبطه
  --  PostgREST بـ `set local role` — وهذا هو السدّ الذي لا يُخترق.)
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

comment on function public.analytics_admin_allowed() is
  'حارس قراءة الإحصائيات — مشرف أو عميل خدمة أو اتصال مالك القاعدة؛ ويفشل مغلقاً لكل ما عداهم. مطابق حرفياً لـ finance_admin_allowed و i18n_admin_allowed.';

-- التغيّر النسبي عن الفترة السابقة بالمئة. **null لا صفر** حين لا مقارنة ممكنة
-- (الفترة السابقة صفر): عقد StatCard ينص على `deltaPercent: number | null`،
-- وصفرٌ مكان null يعني «لم يتغيّر شيء» وهو كذبٌ على من ابتدأ من العدم.
-- abs في المقام لأن بعض المؤشرات قد تكون سالبة (صافي حركة الخزينة مثلاً).
create or replace function public.stats_delta(p_current numeric, p_previous numeric)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case
    when p_previous is null or p_previous = 0 then null
    else round(100.0 * (coalesce(p_current, 0) - p_previous) / abs(p_previous), 1)
  end;
$$;

comment on function public.stats_delta(numeric, numeric) is
  'التغيّر النسبي بالمئة بين قيمتَي فترتين — null حين تكون الفترة السابقة صفراً (لا مقارنة ممكنة).';

-- ----------------------------------------------------------------------------
-- (٢) الجداول الجديدة
-- ----------------------------------------------------------------------------

-- (٢-١) سجل أحداث القمع — خفيف، بلا PII، وينمو بلا سقف فله فهارس وتقليم
--
-- الأعمدة السبعة هي **كل** ما ينص عليه lib/analytics-types.ts. ما استُبعد عمداً:
--   • الاسم والهاتف والبريد والواتساب  ⇒ القاعدة الثالثة في العقد.
--   • عنوان الانطلاق والوجهة (originLabel/destLabel) ⇒ عنوان الانطلاق كثيراً ما
--     يكون بيت العميل، فتخزينه في جدول تُصدَّر أرقامه لجوجل تسريبٌ مؤجَّل.
--   • IP ومعرّف الجلسة ومعرّف المستخدم ⇒ لا عمود لها أصلاً فلا تُكتب سهواً.
--   • `subcontractor_id` و`subcontractor_cost` و`margin_amount` ⇒ ما مُنع في
--     المرحلتين ٥ و٩ من المتصفح لا يُسرَّب هنا.
create table if not exists public.funnel_events (
  id         uuid primary key default gen_random_uuid(),
  event      text not null,
  reference  text,
  class_slug text,
  value      numeric,
  currency   text,
  created_at timestamptz not null default now()
);

-- 🔒 أسماء الأحداث الستة حرفياً كما في نوع FunnelEvent — لا اسم سابع ولا مرادف.
alter table public.funnel_events drop constraint if exists funnel_events_event_chk;
alter table public.funnel_events
  add constraint funnel_events_event_chk
  check (event in ('search_performed', 'quote_viewed', 'booking_started',
                   'booking_created', 'booking_paid', 'quote_requested'));

-- 🔒 حارس «لا نص حرّ»: الكتابة تمر بمفتاح الخدمة (يتجاوز RLS)، فلولا هذه القيود
-- لكان خطأ برمجي واحد في بناء الحمولة كافياً ليحوّل الجدول إلى صندوق بريد يُحشى
-- فيه اسمٌ أو رقم هاتف أو حمولة ضخمة. الشكل المسموح ضيّق عمداً: TR-XXXXXX و
-- QR-XXXXXX وما شابههما فقط. (والقيود مكرّرة في `lib/analytics/emit.ts` حرفياً.)
alter table public.funnel_events drop constraint if exists funnel_events_reference_chk;
alter table public.funnel_events
  add constraint funnel_events_reference_chk
  check (reference is null or reference ~ '^[A-Za-z0-9._-]{1,40}$');

alter table public.funnel_events drop constraint if exists funnel_events_class_slug_chk;
alter table public.funnel_events
  add constraint funnel_events_class_slug_chk
  check (class_slug is null or class_slug ~ '^[A-Za-z0-9_-]{1,64}$');

alter table public.funnel_events drop constraint if exists funnel_events_currency_chk;
alter table public.funnel_events
  add constraint funnel_events_currency_chk
  check (currency is null or currency ~ '^[A-Za-z]{3}$');

alter table public.funnel_events drop constraint if exists funnel_events_value_chk;
alter table public.funnel_events
  add constraint funnel_events_value_chk
  check (value is null or (value >= 0 and value < 100000000));

-- مسار القراءة الوحيد: نافذة زمنية، وأحياناً حدث بعينه داخلها.
create index if not exists funnel_events_created_at_idx
  on public.funnel_events (created_at desc);

create index if not exists funnel_events_event_created_idx
  on public.funnel_events (event, created_at desc);

comment on table public.funnel_events is
  'سجل أحداث القمع من بيانات المنصة نفسها — بلا أي PII بالبناء (لا اسم ولا هاتف ولا IP ولا عنوان انطلاق). المصدر: FunnelEvent/FunnelPayload في lib/analytics-types.ts.';

comment on column public.funnel_events.event is
  'اسم الحدث الموحّد من نوع FunnelEvent — يُترجَم لاسم كل مزوّد داخل المحوّل لا هنا.';

comment on column public.funnel_events.reference is
  'مرجع غير شخصي للمطابقة (TR-… أو QR-…). القيد يمنع حشو اسم أو هاتف مكانه.';

comment on column public.funnel_events.value is
  'قيمة الحجز بعملته — إجمالي العميل وحده. لا تكلفة متعهد ولا هامش موقع أبداً.';

-- (٢-٢) جدول التحويلات — يكتبه المشرف من مركز السيو ويقرؤه الوسيط لكل طلب
--
-- يُقرأ من `proxy.ts` بمفتاح anon عبر REST مباشرة (نمط `lib/maintenance.ts`)،
-- فسياسة القراءة العامة تقتصر على **المفعّل** وحده: صفٌّ معطَّل قيد التجهيز لا
-- يجوز أن يُرى من الإنترنت المفتوح.
create table if not exists public.redirects (
  id          uuid primary key default gen_random_uuid(),
  from_path   text not null unique,
  to_path     text not null,
  status_code smallint not null default 301 check (status_code in (301, 302, 307, 308)),
  enabled     boolean not null default true,
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- 🔒 المصدر مسارٌ داخلي لا عنوان: يبدأ بـ «/» ولا يبدأ بـ «//» (عنوان بروتوكول
-- نسبي يقود إلى نطاق آخر) ولا يحوي «://» ولا مسافة أو سطراً جديداً (حقن ترويسة).
alter table public.redirects drop constraint if exists redirects_from_path_chk;
alter table public.redirects
  add constraint redirects_from_path_chk
  check (
    from_path like '/%'
    and from_path not like '//%'
    and position('://' in from_path) = 0
    and from_path !~ '[[:space:]]'
    and length(from_path) between 1 and 512
  );

-- 🔒 مسارات لا يجوز إطلاقاً أن تُخطف بتحويل: اللوحة والبورتال وواجهات الـ API
-- وأصول Next. الوسيط يستثنيها أصلاً، وهذا القيد يجعل الاستثناء بنيوياً فلا
-- يسقط بسهو في الكود لاحقاً.
alter table public.redirects drop constraint if exists redirects_reserved_prefix_chk;
alter table public.redirects
  add constraint redirects_reserved_prefix_chk
  check (from_path !~ '^/(admin|portal|api|_next)(/|$)');

-- 🔒 الهدف: إمّا مسار داخلي بنفس شروط المصدر، وإمّا عنوان https مطلق صريح.
-- ما مُنع: «//host» و«javascript:» و«data:» — أي تحويل مفتوح من نطاق بدر.
alter table public.redirects drop constraint if exists redirects_to_path_chk;
alter table public.redirects
  add constraint redirects_to_path_chk
  check (
    to_path !~ '[[:space:]]'
    and length(to_path) between 1 and 1024
    and (
      (to_path like '/%' and to_path not like '//%' and position('://' in to_path) = 0)
      or to_path ~ '^https://[A-Za-z0-9._-]+'
    )
  );

-- حلقة من خطوة واحدة تُوقف المتصفح فوراً — تُمنع في القاعدة لا في الواجهة.
alter table public.redirects drop constraint if exists redirects_no_self_loop_chk;
alter table public.redirects
  add constraint redirects_no_self_loop_chk
  check (from_path <> to_path);

-- قراءة الوسيط: القائمة المفعّلة كاملة (تُذاكَر في العملية) والبحث بالمسار.
create index if not exists redirects_enabled_from_idx
  on public.redirects (from_path)
  where enabled;

comment on table public.redirects is
  'تحويلات المسارات القديمة — يديرها المشرف من مركز السيو ويقرأ المفعّل منها proxy.ts بمفتاح anon. المسارات المحجوزة (/admin و/portal و/api و/_next) ممنوعة بقيد.';

comment on column public.redirects.from_path is
  'المسار المصدر — داخلي يبدأ بـ «/» بلا نطاق ولا مسافات، وفريد.';

comment on column public.redirects.to_path is
  'الهدف — مسار داخلي أو عنوان https مطلق. القيد يمنع التحويل المفتوح (//host و javascript:).';

comment on column public.redirects.status_code is
  '301 دائم (الافتراضي، وهو ما ينقل وزن السيو) · 302/307 مؤقت · 308 دائم يحفظ الطريقة.';

comment on column public.redirects.enabled is
  'المعطَّل لا يراه الزائر إطلاقاً (سياسة القراءة العامة مشروطة به) — يراه المشرف وحده.';

-- ----------------------------------------------------------------------------
-- (٣) المُشغّلات
-- ----------------------------------------------------------------------------
drop trigger if exists redirects_touch_updated_at on public.redirects;
create trigger redirects_touch_updated_at
  before update on public.redirects
  for each row execute function public.touch_updated_at();

-- ----------------------------------------------------------------------------
-- (٤) الطبقة الداخلية للقسمين اللذين لا يكفيهما RLS
--
-- لماذا دالتان `security definer` بدل عرضين مباشرين؟
--   • `translations`: **لا `authenticated` ولا `anon` يملك أي صلاحية عليه**
--     (0018 يرمي exception إن مُنحت، واختبار i18n «ك-٣» يؤكد المنع). فعرضٌ
--     بـ `security_invoker` فوقه يفشل حتى على المشرف نفسه بـ permission denied.
--   • `pages` و`sections`: مقروءان لكل `authenticated` بـ `using (true)` —
--     أي أن أي متعهد في البورتال يقرأ إحصائيات المحتوى لو تُرك العرض بلا حراسة.
-- الدالتان تحملان الحارس في أول سطر و**تفشلان مغلقتين بصفر صف لا باستثناء**:
-- العرضان فوقهما قد يفتحهما مستخدم بورتال، والاستثناء هناك رسالة مربكة بلا
-- فائدة أمنية إضافية. والعرضان يبقيان `security_invoker` كبقية عروض المشروع.
-- ----------------------------------------------------------------------------

-- (٤-٠) إسقاط العروض السبعة **قبل** إعادة تعريف الدالتين، لا بعده:
-- `v_stats_content` و`v_stats_locales` يعتمدان على دالتَي هذا القسم، و
-- `create or replace function` ترفض تغيير نوع الإرجاع ما دام عرضٌ متعلقاً بها.
-- ترتيبٌ معكوس هنا يجعل الملف يعمل أول مرة ويفشل في كل تعديل لاحق.
drop view if exists public.v_stats_orders    cascade;
drop view if exists public.v_stats_dispatch  cascade;
drop view if exists public.v_stats_partners  cascade;
drop view if exists public.v_stats_content   cascade;
drop view if exists public.v_stats_locales   cascade;
drop view if exists public.v_stats_treasury  cascade;
drop view if exists public.v_stats_customers cascade;

-- (٤-١) لقطة المحتوى والسيو
--
-- «صفحة ناقصة الميتاداتا» = عنوان أو وصف فارغ بعد btrim (نفس قاعدة
-- `buildPageMetadata` في lib/seo.ts). و«صفحة فيها بيانات مهيكلة» تعني اليوم
-- **قسم `faq` ظاهر فيه عنصر مكتمل** (سؤال وجواب غير فارغين معاً)، لأن JSON-LD
-- في المشروع يُصدَّر من قسم الأسئلة ومن الصفحة الرئيسية وحدهما.
--
-- ⚠ الشرط «عنصر مكتمل» ليس تدقيقاً زائداً بل مطابقة حرفية لما يفعله الكود:
--   components/sections/faq.tsx:19 → `items.filter((i) => i.q && i.a)`
--   ثم :20 → `if (items.length === 0) return null`
-- فقسم أسئلة أُضيف من اللوحة ولم يُملأ بعد (وحالته الابتدائية `{"items": []}`
-- في app/admin/content/[id]/actions.ts) **لا يُصدِّر شيئاً**. عدّه هنا كان
-- يجعل `/admin/stats/content` تقول «صفحة ببيانات مهيكلة» بينما
-- `/admin/seo/audit` تقول لنفس الصفحة «لا بيانات مهيكلة» — رقمان لشيء واحد في
-- شاشتين، وهو ما يمنعه القرار ٣. الشرط نفسه معبَّر عنه في SQL بلا بيانات
-- جديدة، فلا عذر للفجوة. (المقابل في lib/seo/audit.ts: countValidFaqItems.)
create or replace function public.stats_content_rows()
returns table (
  pages_total      integer,
  pages_published  integer,
  pages_draft      integer,
  meta_title_count integer,
  meta_desc_count  integer,
  meta_complete    integer,
  meta_missing     integer,
  faq_pages        integer,
  sections_total   integer,
  sections_visible integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.analytics_admin_allowed() then
    return;
  end if;

  return query
  select
    (count(*))::integer,
    (count(*) filter (where p.published))::integer,
    (count(*) filter (where not p.published))::integer,
    (count(*) filter (where btrim(coalesce(p.meta ->> 'title', '')) <> ''))::integer,
    (count(*) filter (where btrim(coalesce(p.meta ->> 'description', '')) <> ''))::integer,
    (count(*) filter (where btrim(coalesce(p.meta ->> 'title', '')) <> ''
                        and btrim(coalesce(p.meta ->> 'description', '')) <> ''))::integer,
    (count(*) filter (where btrim(coalesce(p.meta ->> 'title', '')) = ''
                         or btrim(coalesce(p.meta ->> 'description', '')) = ''))::integer,
    (count(*) filter (where exists (
       select 1 from public.sections s
       where s.page_id = p.id and s.type = 'faq' and s.visible
         and exists (
           select 1
           from jsonb_array_elements(
                  case when jsonb_typeof(s.content -> 'items') = 'array'
                       then s.content -> 'items'
                       else '[]'::jsonb
                  end
                ) as it
           where btrim(coalesce(it ->> 'q', '')) <> ''
             and btrim(coalesce(it ->> 'a', '')) <> ''
         )
     )))::integer,
    (select (count(*))::integer from public.sections s2),
    (select (count(*) filter (where s3.visible))::integer from public.sections s3)
  from public.pages p;
end;
$$;

comment on function public.stats_content_rows() is
  'لقطة المحتوى والسيو (صف واحد) — محروسة بـ analytics_admin_allowed وتفشل مغلقة بصفر صف. أساس العرض v_stats_content.';

-- (٤-٢) لقطة اللغات
--
-- «القديم» (stale) لا يُحسب هنا من جديد: `translation_progress()` هي المكان
-- الوحيد في المشروع الذي يعرف معنى «الأصل الحي»، وإعادة اشتقاقه هنا تنتج رقماً
-- ثانياً لنفس الشيء. وهي محروسة بـ `i18n_admin_allowed()` — ولأن حارسنا مطابق
-- له حرفياً، فبلوغ هذا السطر يعني أن حارسها سيمرّ حتماً ولن ترمي أبداً.
-- ولغة الأساس لا تظهر في `translation_progress` (لا شيء يُترجَم إليها) فنسبتها
-- ١٠٠ بالتعريف لا بالحساب.
create or replace function public.stats_locales_rows()
returns table (
  code        text,
  name        text,
  native_name text,
  dir         text,
  is_default  boolean,
  enabled     boolean,
  total       integer,
  published   integer,
  reviewed    integer,
  draft       integer,
  missing     integer,
  stale       integer,
  percent     integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.analytics_admin_allowed() then
    return;
  end if;

  return query
  select
    l.code,
    l.name,
    l.native_name,
    l.dir,
    l.is_default,
    l.enabled,
    coalesce(p.total, 0)::integer,
    coalesce(p.published, 0)::integer,
    coalesce(p.reviewed, 0)::integer,
    coalesce(p.draft, 0)::integer,
    coalesce(p.missing, 0)::integer,
    coalesce(p.stale, 0)::integer,
    (case when l.is_default then 100 else coalesce(p.percent, 0) end)::integer
  from public.locales l
  left join public.translation_progress() p on p.locale = l.code
  order by l.sort asc, l.code asc;
end;
$$;

comment on function public.stats_locales_rows() is
  'لقطة كل لغة (اكتمال/ناقص/قديم) — تعيد استعمال translation_progress ولا تشتق «القديم» من جديد. أساس العرض v_stats_locales.';

-- ----------------------------------------------------------------------------
-- (٥) العروض السبعة
--
-- أُسقطت جميعاً في (٤-٠) ثم تُنشأ هنا: إعادة تنفيذ الهجرة بعد تعديل تعريف أي
-- عرض لا تفشل بـ «cannot change name of view column».
--
-- 🔒 `security_invoker = true` على كل عرض بلا استثناء. ومحرّك كل عرض جدولٌ
-- سياسته `is_admin()` وحدها، فالمتعهد في البورتال يرى **صفر صف** لا أرقاماً
-- جزئية — وهذا أهم من الرفض الصريح لأن الرقم الجزئي يبدو صحيحاً.
--
-- ⚠ التسلسل مقصود: v_stats_partners يبني فوق v_booking_profit (0015)، وذاك يبني
-- فوق v_ledger_resolved. ومع security_invoker تُفحص صلاحية القارئ على كل عرض
-- متداخل — والمنح اللازم موجود منذ 0015 (تعليق 0015:1495-1499).
-- ----------------------------------------------------------------------------

-- (٥-١) الطلبات: عدد وقيمة **بالحالة وباليوم** (نص العقد حرفياً)
-- 🔒 لا `subcontractor_cost` ولا `margin_amount` ولا عمود عميل واحد في نوع
-- الإرجاع — الأمان بنيوي: ما لا يوجد في العرض لا يُسرَّب بخطأ في الواجهة.
create view public.v_stats_orders
with (security_invoker = true)
as
select
  (b.created_at at time zone 'Africa/Cairo')::date            as day,
  b.status,
  b.currency,
  (count(*))::integer                                         as orders_count,
  coalesce(sum(b.total), 0)::numeric(14,2)                    as orders_value,
  coalesce(sum(b.amount_due), 0)::numeric(14,2)               as due_value,
  coalesce(sum(b.amount_remaining), 0)::numeric(14,2)         as remaining_value
from public.bookings b
group by 1, 2, 3;

comment on view public.v_stats_orders is
  'الطلبات باليوم والحالة والعملة: العدد والقيمة والمستحق والباقي. بلا تكلفة متعهد ولا هامش ولا بيانات عميل.';

-- (٥-٢) البث: معدل القبول، زمن أول قبول، نسبة اليدوي
--
-- 🔒 المحرّك `dispatches` لا `trip_offers`: سياسة العروض تتيح للمتعهد قراءة
-- عروضه هو، فعرضٌ إحصائي فوقها كان سيعطيه أرقام قمع **جزئية تبدو صحيحة** —
-- وهو أسوأ من الرفض. و`dispatches` محجوب عنه تماماً فالجانبي لا يُنفَّذ أصلاً.
-- ⚠ `assigned_payout` (تكلفة الفائز) خارج نوع الإرجاع عمداً.
--
-- زمن أول قبول بالدقائق: من أول عرض في الطلب إلى لحظة أول قبول. ويُخزَّن
-- المجموع وعدد العينات معاً كي يكون متوسط الفترة `مجموع/عينات` لا «متوسط
-- المتوسطات» — الفرق ليس تجميلاً: يوم فيه طلب واحد بطيء لا يساوي يوماً فيه
-- عشرون طلباً سريعاً.
create view public.v_stats_dispatch
with (security_invoker = true)
as
select
  (d.created_at at time zone 'Africa/Cairo')::date                          as day,
  (count(*))::integer                                                       as dispatches_count,
  -- «مُسند» = انتهى الطلب بمنفّذ، سواء بقبول تلقائي (`assigned`) أو بإسناد
  -- يدوي من التشغيل (`manual` — تضبطها assign_manually في 0013). استثناء
  -- الثانية كان يجعل طلباً مُسنداً فعلاً يظهر «غير مُسند» في كل يوم أسند فيه
  -- التشغيل بيده، وهي بالضبط الحالة التي يقيسها manual_count بجواره.
  (count(*) filter (where d.status in ('assigned', 'manual')))::integer     as assigned_count,
  (count(*) filter (where d.manual_assign))::integer                        as manual_count,
  (count(*) filter (where d.status = 'cancelled'))::integer                 as cancelled_count,
  (count(*) filter (where d.status in ('queued', 'broadcasting')))::integer as open_count,
  coalesce(sum(o.offers_count), 0)::integer                                 as offers_count,
  coalesce(sum(o.accepted_count), 0)::integer                               as accepted_count,
  coalesce(sum(o.first_accept_minutes), 0)::numeric(14,2)                   as first_accept_minutes_total,
  (count(*) filter (where o.first_accept_minutes is not null))::integer     as first_accept_samples,
  (case
     when (count(*) filter (where o.first_accept_minutes is not null)) > 0
     then (sum(o.first_accept_minutes)
           / (count(*) filter (where o.first_accept_minutes is not null)))::numeric(14,2)
     else null
   end)                                                                     as avg_first_accept_minutes
from public.dispatches d
left join lateral (
  select
    (count(*))::integer                                        as offers_count,
    (count(*) filter (where t.status = 'accepted'))::integer    as accepted_count,
    (extract(epoch from (
       min(t.responded_at) filter (where t.status = 'accepted') - min(t.created_at)
     )) / 60.0)::numeric(14,2)                                  as first_accept_minutes
  from public.trip_offers t
  where t.booking_id = d.booking_id
) o on true
group by 1;

comment on view public.v_stats_dispatch is
  'البث باليوم: عدد الطلبات المبثوثة والمُسندة واليدوية، وعروض/قبول، ومجموع زمن أول قبول بالدقائق مع عدد عيناته. محرّكه dispatches عمداً لا trip_offers.';

-- (٥-٣) المتعهدون: رحلات وقيمة وهامش ونسبة قبول **لكل شريك** (نص العقد)
--
-- 🔒 المحرّك `v_booking_profit` (0015) لا جدول `subcontractors`: لو بدأنا من
-- المتعهدين بربط خارجي لرأى كلُّ متعهد صفَّ نفسه بأصفار (سياسة 0010 تتيح له
-- قراءة صفه) — وهو تسريب بلا داعٍ. بالبدء من الربحية — المحجوبة عنه تماماً —
-- لا يرى شيئاً إطلاقاً، ولا يُنفَّذ الجانبي فوق trip_offers أصلاً.
--
-- ⚠ الأرقام هنا **تراكمية لكل شريك** لا مقطّعة بفترة، تماماً كـ
-- v_partner_settlements. الأرقام المحصورة بفترة مكانها section_stats('partners').
create view public.v_stats_partners
with (security_invoker = true)
as
select
  g.subcontractor_id,
  s.company_name,
  s.status                                     as partner_status,
  g.trips_count,
  g.completed_count,
  g.revenue,
  g.partner_cost,
  g.gross_profit,
  g.first_trip_at,
  g.last_trip_at,
  coalesce(o.offers_count, 0)                  as offers_count,
  coalesce(o.accepted_count, 0)                as accepted_count,
  (case
     when coalesce(o.offers_count, 0) > 0
     then round(100.0 * o.accepted_count / o.offers_count, 1)
     else null
   end)::numeric(6,1)                          as accept_rate
from (
  select
    p.subcontractor_id,
    (count(*))::integer                                        as trips_count,
    (count(*) filter (where p.status = 'completed'))::integer   as completed_count,
    coalesce(sum(p.revenue), 0)::numeric(14,2)                  as revenue,
    coalesce(sum(p.partner_cost), 0)::numeric(14,2)             as partner_cost,
    coalesce(sum(p.gross_profit), 0)::numeric(14,2)             as gross_profit,
    min(p.created_at)                                           as first_trip_at,
    max(p.created_at)                                           as last_trip_at
  from public.v_booking_profit p
  where p.subcontractor_id is not null
  group by p.subcontractor_id
) g
join public.subcontractors s on s.id = g.subcontractor_id
left join lateral (
  select
    (count(*))::integer                                      as offers_count,
    (count(*) filter (where t.status = 'accepted'))::integer  as accepted_count
  from public.trip_offers t
  where t.subcontractor_id = g.subcontractor_id
) o on true;

comment on view public.v_stats_partners is
  'إحصائية كل متعهد تراكمياً: رحلات وإيراد وتكلفة وهامش ونسبة قبول. محرّكه v_booking_profit فالمتعهد يرى صفر صف بنيوياً.';

-- (٥-٤) المحتوى والسيو — عرض رفيع فوق الدالة المحروسة (انظر القسم ٤)
create view public.v_stats_content
with (security_invoker = true)
as
select * from public.stats_content_rows();

comment on view public.v_stats_content is
  'لقطة المحتوى والسيو: منشور/مسودة، اكتمال الميتاداتا، صفحات فيها قسم أسئلة ظاهر بعنصر مكتمل (وهو شرط تصدير JSON-LD في components/sections/faq.tsx حرفياً). الحراسة داخل stats_content_rows لأن pages/sections مقروءان لكل مسجَّل.';

-- (٥-٥) اللغات — عرض رفيع فوق الدالة المحروسة (انظر القسم ٤)
create view public.v_stats_locales
with (security_invoker = true)
as
select * from public.stats_locales_rows();

comment on view public.v_stats_locales is
  'لقطة كل لغة: نسبة الاكتمال والناقص والقديم. الحراسة داخل stats_locales_rows لأن جدول translations محجوب عن كل الأدوار.';

-- (٥-٦) الخزينة — عرض زائد على العقد، واسمه على نفس النسق
--
-- **القيود ذات الحساب وحدها** (`account_id is not null`) — نفس قاعدة
-- `cash_flow()` في 0015 حرفياً: مستحق المتعهد ليس نقداً خرج، وما حصّله نقداً
-- ليس نقداً دخل خزينتنا. إدخالهما هنا يرسم منحنى سيولة كاذباً.
create view public.v_stats_treasury
with (security_invoker = true)
as
select
  (e.occurred_at at time zone 'Africa/Cairo')::date                            as day,
  coalesce(sum(e.amount) filter (where e.direction = 'in'), 0)::numeric(14,2)  as inflow,
  coalesce(sum(e.amount) filter (where e.direction = 'out'), 0)::numeric(14,2) as outflow,
  (coalesce(sum(e.amount) filter (where e.direction = 'in'), 0)
   - coalesce(sum(e.amount) filter (where e.direction = 'out'), 0))::numeric(14,2) as net,
  (count(*))::integer                                                          as entries_count
from public.ledger_entries e
where e.account_id is not null
group by 1;

comment on view public.v_stats_treasury is
  'حركة الخزينة باليوم: وارد/منصرف/صافي — من القيود ذات الحساب وحدها، نفس قاعدة cash_flow() بالضبط فلا رقمان لشيء واحد.';

-- (٥-٧) العملاء — عرض زائد على العقد، واسمه على نفس النسق
--
-- لا جدول عملاء في المشروع، والعميل يُعرَّف بهاتفه. 🔒 **الهاتف لا يخرج من
-- العرض إطلاقاً**: يُستعمل داخل الـ CTE للتجميع فقط، ونوع الإرجاع أعدادٌ ونسب
-- لا هويات. و«عميل جديد» = هذا أول حجز له على الإطلاق (`seq = 1`) لا أول حجز
-- داخل الفترة — وإلا صار كل عميل قديم «جديداً» كلما ضاقت الفترة.
--
-- ⚠ `customers_count` هنا **عملاء ذلك اليوم**، وجمعه عبر الأيام يكرّر من حجز
-- في يومين. عدد عملاء الفترة الصحيح يحسبه section_stats('customers') بـ distinct.
create view public.v_stats_customers
with (security_invoker = true)
as
with tagged as (
  select
    (b.created_at at time zone 'Africa/Cairo')::date as day,
    btrim(b.customer_phone)                          as phone,
    b.total                                          as total,
    row_number() over (
      partition by btrim(b.customer_phone)
      order by b.created_at asc, b.id asc
    )                                                as seq
  from public.bookings b
  where btrim(coalesce(b.customer_phone, '')) <> ''
)
select
  t.day,
  (count(*))::integer                              as orders_count,
  (count(distinct t.phone))::integer               as customers_count,
  (count(*) filter (where t.seq = 1))::integer     as new_customers,
  (count(*) filter (where t.seq > 1))::integer     as returning_orders,
  coalesce(sum(t.total), 0)::numeric(14,2)         as orders_value
from tagged t
group by t.day;

comment on view public.v_stats_customers is
  'العملاء باليوم: طلبات، عملاء ذلك اليوم، جدد، وطلبات عائدين. الهاتف يُستعمل للتجميع ولا يخرج في نوع الإرجاع.';

-- ----------------------------------------------------------------------------
-- (٦) الدوال العامة للوحة
--
-- كلها `security definer` بحراسة analytics_admin_allowed() في أول سطر،
-- و`search_path` مثبَّت، وتُرجع صفوفاً منمَّطة مطابقة لعقد lib/analytics-types.ts.
-- ----------------------------------------------------------------------------

-- (٦-١) بطاقات المؤشرات لأي قسم — الشكل واحد للأقسام الستة
--
-- الإرجاع = **صفوف StatCard حرفياً**: (key, label, value, delta_percent, format,
-- help). لا jsonb ولا شكل ثانٍ. و`delta_percent` هو التغيّر **النسبي** بالمئة عن
-- الفترة السابقة المساوية في الطول والملاصقة لها، و`null` حين لا مقارنة ممكنة
-- (فترة سابقة صفر) أو حين يكون المؤشر **لقطة لحظية** لا تخص فترة (النقد في اليد،
-- عدد الصفحات، اكتمال الترجمة) — والقيمة null هناك صدقٌ لا نقص.
--
-- قيم `format` الأربع من العقد: number | money | percent | duration.
--   • percent: رقم من ٠ إلى ١٠٠ (نفس اصطلاح translation_progress.percent).
--   • duration: **بالدقائق** (نفس ما تتوقعه durationLabel في components/booking/format.ts).
--
-- 🔒 `value` **لا يكون null أبداً** — العقد يقول `value: number` غير قابل للتفريغ.
-- القابل للتفريغ هو `delta_percent` وحده. اختبار (هـ) في مجموعة الاختبار يثبته.
--
-- قسم مجهول يرمي exception ولا يُرجع فراغاً: شاشة تعرض «لا بيانات» بسبب خطأ
-- إملائي في اسم القسم عطبٌ يمرّ سنة كاملة بلا أن يلاحظه أحد.
create or replace function public.section_stats(p_section text, p_from date, p_to date)
returns table (
  key           text,
  label         text,
  value         numeric,
  delta_percent numeric,
  format        text,
  help          text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
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
     or v_section not in ('orders', 'partners', 'treasury', 'customers', 'content', 'locales') then
    raise exception
      'قسم إحصائي مجهول: «%» — المسموح: orders|partners|treasury|customers|content|locales',
      coalesce(nullif(btrim(coalesce(p_section, '')), ''), 'بلا')
      using hint = 'invalid-input';
  end if;

  v_to   := coalesce(p_to, (now() at time zone 'Africa/Cairo')::date);
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
        and (p.created_at at time zone 'Africa/Cairo')::date between v_from and v_to;

      select
        coalesce(count(distinct p.subcontractor_id), 0),
        coalesce(count(*), 0),
        coalesce(sum(p.partner_cost), 0),
        coalesce(sum(p.gross_profit), 0)
      into v_p_active, v_p_trips, v_p_cost, v_p_margin
      from public.v_booking_profit p
      where p.subcontractor_id is not null
        and (p.created_at at time zone 'Africa/Cairo')::date between v_pfrom and v_pto;

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
      where (x.occurred_at at time zone 'Africa/Cairo')::date between v_from and v_to;

      select coalesce(sum(x.amount), 0) into v_p_exp
      from public.expenses x
      where (x.occurred_at at time zone 'Africa/Cairo')::date between v_pfrom and v_pto;

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
        coalesce(count(distinct btrim(b.customer_phone)), 0),
        coalesce(count(*), 0),
        coalesce(sum(b.total), 0)
      into v_c_cust, v_c_orders, v_c_value
      from public.bookings b
      where btrim(coalesce(b.customer_phone, '')) <> ''
        and (b.created_at at time zone 'Africa/Cairo')::date between v_from and v_to;

      select
        coalesce(count(distinct btrim(b.customer_phone)), 0),
        coalesce(count(*), 0),
        coalesce(sum(b.total), 0)
      into v_p_cust, v_p_orders, v_p_value
      from public.bookings b
      where btrim(coalesce(b.customer_phone, '')) <> ''
        and (b.created_at at time zone 'Africa/Cairo')::date between v_pfrom and v_pto;

      -- «عميل جديد» = أول حجز له **على الإطلاق** وقع داخل الفترة
      select coalesce(count(*), 0) into v_c_new
      from (
        select btrim(b.customer_phone) as ph, min(b.created_at) as first_at
        from public.bookings b
        where btrim(coalesce(b.customer_phone, '')) <> ''
        group by 1
      ) f
      where (f.first_at at time zone 'Africa/Cairo')::date between v_from and v_to;

      select coalesce(count(*), 0) into v_p_new
      from (
        select btrim(b.customer_phone) as ph, min(b.created_at) as first_at
        from public.bookings b
        where btrim(coalesce(b.customer_phone, '')) <> ''
        group by 1
      ) f
      where (f.first_at at time zone 'Africa/Cairo')::date between v_pfrom and v_pto;

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
         'عدد العملاء المختلفين الذين حجزوا في الفترة — العميل يُعرَّف برقم هاتفه، والرقم نفسه لا يخرج من القاعدة.'::text),
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
      where (p.updated_at at time zone 'Africa/Cairo')::date between v_from and v_to;

      select coalesce(count(*), 0) into v_p_touched
      from public.pages p
      where (p.updated_at at time zone 'Africa/Cairo')::date between v_pfrom and v_pto;

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
$$;

comment on function public.section_stats(text, date, date) is
  'بطاقات مؤشرات StatCard لأي قسم من الستة (orders|partners|treasury|customers|content|locales) مقارنةً بالفترة السابقة المساوية. percent من ٠ إلى ١٠٠ و duration بالدقائق. قسم مجهول يرمي exception.';

-- (٦-٢) القمع يومياً — سلاسل StatSeries جاهزة بنقاطها
--
-- الإرجاع = **صفوف StatSeries حرفياً**: (key, label, points) و`points` مصفوفة
-- jsonb من `{"bucket": "YYYY-MM-DD", "value": n}` — لا تجميع في الواجهة.
--
-- كل يوم في المدى له نقطة **حتى لو كانت صفراً**: الرسم البياني الذي يقفز فوق
-- الأيام الفارغة يكذب على العين.
--
-- مصدر كل سلسلة (وهذا هو القرار الحاكم في هذه الدالة):
--   search_performed · quote_viewed · booking_started  ← funnel_events (لا أثر
--       لها في القاعدة إطلاقاً، ولذلك وُجد الجدول أصلاً).
--   quote_requested ← quote_requests · booking_created ← bookings ·
--   booking_paid    ← أول تحصيل معتمد لكل حجز في public.payments (المسار اليدوي
--       والإلكتروني كلاهما ينتهي بصف payments معتمد — 0020 يدرجه بنفسه).
-- ولماذا لا نعدّ الثلاثة الأخيرة من سجل الأحداث كذلك؟ لأن كتابة الحدث «رخيصة
-- ولا تُفشل الطلب إن فشلت» بنص العقد — أي أنها قد تفقد صفاً. وحجزٌ مدفوع لا
-- يظهر في القمع أسوأ من عدم وجود قمع أصلاً.
create or replace function public.funnel_daily(p_from date, p_to date)
returns table (
  key    text,
  label  text,
  points jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_from date;
  v_to   date;
begin
  if not public.analytics_admin_allowed() then
    raise exception 'أرقام القمع متاحة للإدارة فقط' using hint = 'forbidden';
  end if;

  v_to   := coalesce(p_to, (now() at time zone 'Africa/Cairo')::date);
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
      (1, 'search_performed'::text, 'بحث عن رحلة'::text),
      (2, 'quote_viewed',           'ظهرت العروض'),
      (3, 'quote_requested',        'طلب عرض سعر يدوي'),
      -- الاسم يصف ما يُقاس فعلاً لا ما نتمناه: الحدث يُكتب في
      -- `/api/payments/start` وحده، أي عند اختيار **بوابة إلكترونية**. والمسار
      -- الافتراضي في هذه المنصة تحويل بنكي يدوي لا يمر به — فتسميته «بدأ مسار
      -- الحجز» كانت تجعل المالك يقرأ «صفر» على أنه «لا أحد يصل إلى الدفع».
      (4, 'booking_started',        'اختار وسيلة دفع إلكترونية'),
      (5, 'booking_created',        'أُنشئ الحجز'),
      (6, 'booking_paid',           'وصل التحصيل')
  ),
  days as (
    select (v_from + g)::date as d
    from generate_series(0, (v_to - v_from)) g
  ),
  ev as (
    select
      (e.created_at at time zone 'Africa/Cairo')::date as d,
      e.event                                          as k,
      (count(*))::integer                              as n
    from public.funnel_events e
    where (e.created_at at time zone 'Africa/Cairo')::date between v_from and v_to
      and e.event in ('search_performed', 'quote_viewed', 'booking_started')
    group by 1, 2
  ),
  qr as (
    select
      (q.created_at at time zone 'Africa/Cairo')::date as d,
      (count(*))::integer                              as n
    from public.quote_requests q
    where (q.created_at at time zone 'Africa/Cairo')::date between v_from and v_to
    group by 1
  ),
  bk as (
    select
      (b.created_at at time zone 'Africa/Cairo')::date as d,
      (count(*))::integer                              as n
    from public.bookings b
    where (b.created_at at time zone 'Africa/Cairo')::date between v_from and v_to
    group by 1
  ),
  paid_first as (
    -- أول تحصيل معتمد لكل حجز: الحجز يُعدّ «مدفوعاً» مرة واحدة مهما تعدّدت دفعاته
    select p.booking_id as bid, min(coalesce(p.verified_at, p.created_at)) as at
    from public.payments p
    where p.status = 'approved'
    group by p.booking_id
  ),
  pd as (
    select
      (f.at at time zone 'Africa/Cairo')::date as d,
      (count(*))::integer                      as n
    from paid_first f
    where (f.at at time zone 'Africa/Cairo')::date between v_from and v_to
    group by 1
  ),
  counts as (
    select x.d, x.k, x.n from ev x
    union all
    select q.d, 'quote_requested'::text, q.n from qr q
    union all
    select b.d, 'booking_created'::text, b.n from bk b
    union all
    select p.d, 'booking_paid'::text,    p.n from pd p
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
$$;

comment on function public.funnel_daily(date, date) is
  'القمع يومياً كسلاسل StatSeries: بحث ← عرض ← طلب سعر ← اختيار دفع إلكتروني ← حجز ← دفع. الثلاثة الأولى من funnel_events والثلاثة الأخيرة من الجداول المرجعية لأن كتابة الحدث لا تُفشل الطلب فقد تفقد صفاً.';

-- (٦-٣) مجاميع القمع ومعدلات التحول للفترة كلها
--
-- ⚠ هذه الدالة كانت **ناقصة من الهجرة** بينما `lib/stats/read.ts:258` يستدعيها
-- ويسمّيها، فكانت لوحة «قمع التحويل» في `/admin/stats` و`/admin/stats/orders`
-- تعرض «مجاميع القمع غير متاحة» إلى الأبد: لا رقم مرحلة ولا معدل تحول واحد،
-- وهو البند الأول في هدف المرحلة. المسار الاحتياطي في الواجهة
-- (`stagesFromCards`) لا ينقذ لأن `section_stats('orders')` لا تُرجع مفاتيح
-- المراحل أصلاً. والجمع في TypeScript ممنوع بنص المرحلة (وقسمةٌ بمقام صفر
-- تعني NaN على شاشة المالك) — فالمكان الصحيح هنا.
--
-- الشكل = `FunnelSummaryRow` في `lib/stats/cards.ts` حرفياً:
--   (key text, label text, value numeric, rate_percent numeric)
-- و`rate_percent` بمقياس ٠–١٠٠، و`null` للمرحلة الأولى وحين يكون المقام صفراً
-- (لا صفر: «لا مقارنة ممكنة» ليست «صفر بالمئة»).
--
-- 🔒 المصادر **مطابقة لـ `funnel_daily` حرفياً** — نفس الجداول ونفس الشروط ونفس
-- توقيت القاهرة. أي انحراف هنا يعني أن مجموع الرسم اليومي لا يساوي رقم البطاقة
-- فوقه على الشاشة نفسها، وهو بالضبط ما يمنعه القرار ٣.
--
-- المراحل الأربع هي `FUNNEL_ORDER` في `lib/stats/cards.ts`: البحث ← العرض ←
-- الحجز ← التحصيل. و`quote_requested` و`booking_started` خارجها عمداً: الأولى
-- قناة موازية والثانية خطوة فرعية، و«التحول» بين مرحلتين غير متتاليتين رقم بلا
-- معنى. وهما مرصودتان في `funnel_daily` وتُعرضان هناك.
create or replace function public.funnel_summary(p_from date, p_to date)
returns table (
  key          text,
  label        text,
  value        numeric,
  rate_percent numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_from   date;
  v_to     date;
  v_search numeric := 0;
  v_quote  numeric := 0;
  v_book   numeric := 0;
  v_paid   numeric := 0;
begin
  if not public.analytics_admin_allowed() then
    raise exception 'أرقام القمع متاحة للإدارة فقط' using hint = 'forbidden';
  end if;

  v_to   := coalesce(p_to, (now() at time zone 'Africa/Cairo')::date);
  v_from := coalesce(p_from, v_to - 29);

  if v_from > v_to then
    raise exception 'الفترة معكوسة: من % إلى %', v_from, v_to using hint = 'invalid-input';
  end if;

  if (v_to - v_from) > 400 then
    raise exception 'المدى أطول من ٤٠٠ يوم (% يوماً) — اختر فترة أقصر', (v_to - v_from)
      using hint = 'invalid-input';
  end if;

  -- (١) البحث والعرض من سجل الأحداث (لا أثر لهما في أي جدول مرجعي)
  select
    coalesce(count(*) filter (where e.event = 'search_performed'), 0),
    coalesce(count(*) filter (where e.event = 'quote_viewed'), 0)
  into v_search, v_quote
  from public.funnel_events e
  where (e.created_at at time zone 'Africa/Cairo')::date between v_from and v_to;

  -- (٢) الحجز من جدول الحجوزات نفسه
  select coalesce(count(*), 0) into v_book
  from public.bookings b
  where (b.created_at at time zone 'Africa/Cairo')::date between v_from and v_to;

  -- (٣) التحصيل: أول دفعة معتمدة لكل حجز — الحجز يُعدّ مدفوعاً مرة واحدة
  select coalesce(count(*), 0) into v_paid
  from (
    select p.booking_id as bid, min(coalesce(p.verified_at, p.created_at)) as at
    from public.payments p
    where p.status = 'approved'
    group by p.booking_id
  ) f
  where (f.at at time zone 'Africa/Cairo')::date between v_from and v_to;

  return query
  select x.k, x.l, x.v, x.r
  from (values
    ('search_performed'::text, 'بحث عن رحلة'::text, v_search::numeric, null::numeric),
    ('quote_viewed', 'ظهرت العروض', v_quote,
     case when v_search > 0 then round(100.0 * v_quote / v_search, 1) else null end),
    ('booking_created', 'أُنشئ الحجز', v_book,
     case when v_quote  > 0 then round(100.0 * v_book  / v_quote,  1) else null end),
    ('booking_paid', 'وصل التحصيل', v_paid,
     case when v_book   > 0 then round(100.0 * v_paid  / v_book,   1) else null end)
  ) as x(k, l, v, r);
end;
$$;

comment on function public.funnel_summary(date, date) is
  'مجاميع مراحل القمع الأربع للفترة ومعدل التحول إلى كل مرحلة (٠–١٠٠، وnull للأولى أو حين المقام صفر). نفس مصادر funnel_daily حرفياً فلا ينحرف مجموع الرسم عن رقم البطاقة فوقه.';

-- (٦-٤) تقليم سجل الأحداث — الجدول ينمو بلا سقف وهذه خطة تقليمه
-- تُستدعى يدوياً من اللوحة أو من مهمة مجدولة لاحقاً. الحد الأدنى ٣٠ يوماً كي لا
-- يمحو استدعاءٌ خاطئ (أو صفر) سجلّ القمع كله.
create or replace function public.prune_funnel_events(p_days integer)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_days integer;
  v_n    integer;
begin
  if not public.analytics_admin_allowed() then
    raise exception 'تقليم سجل الأحداث متاح للإدارة فقط' using hint = 'forbidden';
  end if;

  v_days := greatest(coalesce(p_days, 400), 30);

  delete from public.funnel_events e
   where e.created_at < now() - make_interval(days => v_days);

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

comment on function public.prune_funnel_events(integer) is
  'يحذف أحداث القمع الأقدم من p_days (الحد الأدنى ٣٠ يوماً) ويعيد عدد المحذوف — خطة التقليم لجدول ينمو بلا سقف.';

-- ----------------------------------------------------------------------------
-- (٧) RLS + الصلاحيات
--
-- خلاصة الوصول في هذه المرحلة:
--   anon          → `funnel_events`: **صفر مطلق** — لا قراءة ولا كتابة.
--                    `redirects`: قراءة المفعّل وحده (يحتاجها الوسيط)، ولا كتابة.
--                    كل العروض والدوال الإحصائية: **صفر مطلق**.
--   المتعهد        → مسجَّل وليس مشرفاً ⇒ سياسات is_admin() تُرجع له صفر صف من
--                    كل محرّك إحصائي، والعروض `security_invoker` فترث الحجب.
--                    ودالتا القسم (٤) تفشلان مغلقتين بصفر صف.
--   المشرف         → كل شيء.
--   service_role  → كل شيء (المسارات العامة تكتب الأحداث بعميل الخدمة).
--
-- ⚠ **لا إدراج لـ anon على `funnel_events`** — وهذا قرار مقصود لا سهو:
-- الكاتب الوحيد في المستودع كله هو `lib/analytics/emit.ts` وهو يستعمل
-- `createServiceSupabase()` (مفتاح الخدمة، يتجاوز RLS). فمنحُ الزائر إدراجاً
-- كان منحاً **بلا مستفيد** وثمنه أن أي أحد يملك مفتاح anon (وهو منشور في حزمة
-- المتصفح بحكم تعريفه) يستطيع حشو مئة ألف صف `search_performed` صالح الشكل عبر
-- `POST /rest/v1/funnel_events` بلا سياسة ترفضه ولا حدّ معدّل. والنتيجة أن
-- `funnel_daily` و`funnel_summary` — ومعهما كل معدلات التحول — تُقرأ من جدول
-- مسموم، فيبني المالك قرار ميزانية إعلانية على رقم مزوَّر (نقض القرار ٥)، ثم
-- ينمو الجدول بلا سقف على قاعدة مدفوعة الحجم بينما `prune_funnel_events` لا
-- تحذف ما هو أحدث من ٣٠ يوماً فلا تنقذ من طوفان اليوم نفسه.
-- إن لزم مسار متصفحي يوماً فليمر بمسار API خادمي بحدّ معدّل بـ IP (نمط
-- `/api/quote-request`) لا بمنح مباشر على الجدول.
-- ----------------------------------------------------------------------------
alter table public.funnel_events enable row level security;
alter table public.redirects     enable row level security;

-- السحب أولاً — إعدادات Supabase الافتراضية منحت anon كل شيء بما فيه TRUNCATE
revoke all on public.funnel_events from public, anon, authenticated;
revoke all on public.redirects     from public, anon, authenticated;

-- (٧-١) funnel_events: قراءة للمسجَّل وحدها (تحكمها السياسة: المشرف فقط).
-- الكتابة كلها بمفتاح الخدمة من `lib/analytics/emit.ts` — لا anon ولا authenticated.
grant select on public.funnel_events to authenticated;

-- (٧-٢) redirects: قراءة للزائر (السياسة تحصرها بالمفعّل)، وإدارة كاملة للمسجَّل
grant select                         on public.redirects to anon;
grant select, insert, update, delete on public.redirects to authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant select, insert, delete on public.funnel_events to service_role';
    execute 'grant select, insert, update, delete on public.redirects to service_role';
  end if;
end;
$$;

-- (٧-٣) سياسات funnel_events
-- لا سياسة SELECT تستهدف anon، ولا منح select له — طبقتان معاً.
-- وسياسة الإدراج العامة أُسقطت مع منحها: لا تُترك سياسة `with check (true)`
-- معلّقة على جدول، فوجودها وحده دعوةٌ لمنح يعيدها إلى العمل بلا انتباه.
drop policy if exists "funnel_events_insert_public" on public.funnel_events;

drop policy if exists "funnel_events_select_admin" on public.funnel_events;
create policy "funnel_events_select_admin"
  on public.funnel_events for select to authenticated using (public.is_admin());

-- (٧-٤) سياسات redirects
-- الزائر يرى المفعّل وحده؛ والمسجَّل يرى المفعّل، والمشرف يرى المعطَّل أيضاً
-- (وإلا تعذّر عليه إدارة صفٍّ أطفأه بنفسه).
drop policy if exists "redirects_select_public" on public.redirects;
create policy "redirects_select_public"
  on public.redirects for select to anon using (enabled);

drop policy if exists "redirects_select_auth" on public.redirects;
create policy "redirects_select_auth"
  on public.redirects for select to authenticated using (enabled or public.is_admin());

drop policy if exists "redirects_insert_admin" on public.redirects;
create policy "redirects_insert_admin"
  on public.redirects for insert to authenticated with check (public.is_admin());

drop policy if exists "redirects_update_admin" on public.redirects;
create policy "redirects_update_admin"
  on public.redirects for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "redirects_delete_admin" on public.redirects;
create policy "redirects_delete_admin"
  on public.redirects for delete to authenticated using (public.is_admin());

-- (٧-٥) صلاحيات العروض — لا شيء لـ anon، والمسجَّل يمر على RLS الجداول تحتها
revoke all on public.v_stats_orders    from public, anon, authenticated;
revoke all on public.v_stats_dispatch  from public, anon, authenticated;
revoke all on public.v_stats_partners  from public, anon, authenticated;
revoke all on public.v_stats_content   from public, anon, authenticated;
revoke all on public.v_stats_locales   from public, anon, authenticated;
revoke all on public.v_stats_treasury  from public, anon, authenticated;
revoke all on public.v_stats_customers from public, anon, authenticated;

grant select on public.v_stats_orders    to authenticated;
grant select on public.v_stats_dispatch  to authenticated;
grant select on public.v_stats_partners  to authenticated;
grant select on public.v_stats_content   to authenticated;
grant select on public.v_stats_locales   to authenticated;
grant select on public.v_stats_treasury  to authenticated;
grant select on public.v_stats_customers to authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant select on public.v_stats_orders to service_role';
    execute 'grant select on public.v_stats_dispatch to service_role';
    execute 'grant select on public.v_stats_partners to service_role';
    execute 'grant select on public.v_stats_content to service_role';
    execute 'grant select on public.v_stats_locales to service_role';
    execute 'grant select on public.v_stats_treasury to service_role';
    execute 'grant select on public.v_stats_customers to service_role';
  end if;
end;
$$;

-- (٧-٦) صلاحيات الدوال — السحب من الثلاثة ثم المنح الصريح
-- (`create or replace` لا يعيد ضبط الصلاحيات، والدالة الجديدة تولد مفتوحة
--  ومعها EXECUTE ضمني لـ PUBLIC ومنح Supabase الافتراضي لـ anon)

-- دوال داخلية بحتة: لا تُمنح لأي دور مستخدم
revoke all on function public.analytics_admin_allowed()          from public, anon, authenticated;
revoke all on function public.stats_delta(numeric, numeric)      from public, anon, authenticated;

-- 🔒 دالتا القسم (٤) تُمنحان للمسجَّل **لأن العرضين فوقهما `security_invoker`**
-- فتُفحص صلاحية القارئ عليهما. والحجب الفعلي داخلهما: غير المشرف يأخذ صفر صف.
revoke all    on function public.stats_content_rows() from public, anon, authenticated;
grant execute on function public.stats_content_rows() to authenticated;

revoke all    on function public.stats_locales_rows() from public, anon, authenticated;
grant execute on function public.stats_locales_rows() to authenticated;

revoke all    on function public.section_stats(text, date, date) from public, anon, authenticated;
grant execute on function public.section_stats(text, date, date) to authenticated;

revoke all    on function public.funnel_daily(date, date) from public, anon, authenticated;
grant execute on function public.funnel_daily(date, date) to authenticated;

revoke all    on function public.funnel_summary(date, date) from public, anon, authenticated;
grant execute on function public.funnel_summary(date, date) to authenticated;

revoke all    on function public.prune_funnel_events(integer) from public, anon, authenticated;
grant execute on function public.prune_funnel_events(integer) to authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.analytics_admin_allowed() to service_role';
    execute 'grant execute on function public.stats_delta(numeric, numeric) to service_role';
    execute 'grant execute on function public.stats_content_rows() to service_role';
    execute 'grant execute on function public.stats_locales_rows() to service_role';
    execute 'grant execute on function public.section_stats(text, date, date) to service_role';
    execute 'grant execute on function public.funnel_daily(date, date) to service_role';
    execute 'grant execute on function public.funnel_summary(date, date) to service_role';
    execute 'grant execute on function public.prune_funnel_events(integer) to service_role';
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- (٨) البذرة — مفتاح integrations في site_settings
--
-- القيم مطابقة حرفياً لـ DEFAULT_INTEGRATIONS في lib/analytics-types.ts:
-- الخدمات السبع كلها معطَّلة ومعرّفاتها null. قرار ٧ في موجز المرحلة: لا وسم
-- قياس يُحقن ما دامت الخدمة `enabled: false` أو `id: null` — فالموقع نظيف
-- افتراضياً ولا يطلب أي جهة خارجية بلا قرار صريح من المالك.
--
-- ⚠ `site_settings` **مقروء علناً بالكامل** (سياسة site_settings_select_public
-- من 0001 تعطي anon `using (true)`). ⇒ لا يجوز وضع أي سرّ هنا إطلاقاً: توكن
-- Meta CAPI يبقى في `.env.local` وحده (قرار ٢). المعرّفات أعلاه كلها عامة
-- بطبيعتها — تظهر في مصدر صفحة أي زائر على أي حال.
--
-- شكل الترقية: الافتراضيات ثم القيم القائمة فوقها (`excluded.value || القائم`)
-- فتُضاف أي خدمة جديدة بلا مسح ما ضبطه المالك، والشرط يمنع لمس updated_at
-- حين لا يتغيّر شيء.
-- ----------------------------------------------------------------------------
insert into public.site_settings (key, value)
values (
  'integrations',
  '{
    "ga4":       {"enabled": false, "id": null},
    "gtm":       {"enabled": false, "id": null},
    "gsc":       {"enabled": false, "id": null},
    "metaPixel": {"enabled": false, "id": null},
    "metaCapi":  {"enabled": false, "id": null},
    "clarity":   {"enabled": false, "id": null},
    "bing":      {"enabled": false, "id": null}
  }'::jsonb
)
on conflict (key) do update
  set value = excluded.value || site_settings.value
  where site_settings.value is distinct from (excluded.value || site_settings.value);

-- ----------------------------------------------------------------------------
-- (٩) فحص ذاتي بعد التنفيذ — شروط إغلاق المرحلة
-- ----------------------------------------------------------------------------
do $$
declare
  v_missing text;
  v_leak    text;
  v_keys    constant text[] :=
    array['ga4', 'gtm', 'gsc', 'metaPixel', 'metaCapi', 'clarity', 'bing'];
  v_key     text;
  v_val     jsonb;
begin
  -- (٩-١) الجداول والعروض موجودة
  select string_agg(x.rel, '، ')
    into v_missing
  from (values
    ('public.funnel_events'), ('public.redirects'),
    ('public.v_stats_orders'), ('public.v_stats_dispatch'),
    ('public.v_stats_partners'), ('public.v_stats_content'),
    ('public.v_stats_locales'), ('public.v_stats_treasury'),
    ('public.v_stats_customers')
  ) as x(rel)
  where to_regclass(x.rel) is null;

  if v_missing is not null then
    raise exception '0022: كائنات ناقصة بعد التنفيذ: %', v_missing;
  end if;

  -- (٩-٢) الدوال موجودة بتواقيعها الحرفية كما في العقد
  select string_agg(x.sig, '، ')
    into v_missing
  from (values
    ('public.analytics_admin_allowed()'),
    ('public.stats_delta(numeric, numeric)'),
    ('public.stats_content_rows()'),
    ('public.stats_locales_rows()'),
    ('public.section_stats(text, date, date)'),
    ('public.funnel_daily(date, date)'),
    ('public.funnel_summary(date, date)'),
    ('public.prune_funnel_events(integer)')
  ) as x(sig)
  where to_regprocedure(x.sig) is null;

  if v_missing is not null then
    raise exception '0022: دوال ناقصة بعد التنفيذ: %', v_missing;
  end if;

  -- (٩-٣) 🔒 كل عرض `security_invoker` — بدونها يتجاوز العرض RLS الجداول تحته
  select string_agg(c.relname, '، ')
    into v_leak
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'v'
    and c.relname in ('v_stats_orders', 'v_stats_dispatch', 'v_stats_partners',
                      'v_stats_content', 'v_stats_locales', 'v_stats_treasury',
                      'v_stats_customers')
    and coalesce(
          (select option_value from pg_options_to_table(c.reloptions)
            where option_name = 'security_invoker'), 'false'
        ) <> 'true';

  if v_leak is not null then
    raise exception
      '0022: عروض بلا security_invoker (تتجاوز RLS وتكشف تكلفة المتعهدين): %', v_leak;
  end if;

  if exists (select 1 from pg_roles where rolname = 'anon') then
    -- (٩-٤) لا صلاحية واحدة لـ anon على أي عرض إحصائي
    select string_agg(distinct t.rel, '، ')
      into v_leak
    from (values
      ('public.v_stats_orders'), ('public.v_stats_dispatch'),
      ('public.v_stats_partners'), ('public.v_stats_content'),
      ('public.v_stats_locales'), ('public.v_stats_treasury'),
      ('public.v_stats_customers')
    ) as t(rel)
    cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'))
      as p(priv)
    where has_table_privilege('anon', t.rel, p.priv);

    if v_leak is not null then
      raise exception '0022: anon يملك صلاحيات على عروض إحصائية: %', v_leak;
    end if;

    -- (٩-٥) 🔒 قلب المرحلة: الزائر لا يمسّ سجل القمع بحال — لا قراءةً ولا كتابة.
    -- الإدراج بمفتاح الخدمة وحده (lib/analytics/emit.ts)، فمنح anon إدراجاً كان
    -- بلا مستفيد وثمنه تسميم أرقام القمع وتضخيم الجدول بلا سقف.
    select string_agg(p.priv, '، ')
      into v_leak
    from (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE')) as p(priv)
    where has_table_privilege('anon', 'public.funnel_events', p.priv);

    if v_leak is not null then
      raise exception '0022: anon يملك % على funnel_events — سجل القمع مكشوف للتسميم', v_leak;
    end if;

    -- (٩-٦) الزائر يقرأ التحويلات (يحتاجها الوسيط) ولا يكتبها
    select string_agg(p.priv, '، ')
      into v_leak
    from (values ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE')) as p(priv)
    where has_table_privilege('anon', 'public.redirects', p.priv);

    if v_leak is not null then
      raise exception '0022: anon يملك % على redirects — أي زائر يعيد توجيه الموقع', v_leak;
    end if;

    if not has_table_privilege('anon', 'public.redirects', 'SELECT') then
      raise exception '0022: anon لا يقرأ redirects — الوسيط لن يجد أي تحويل';
    end if;

    -- (٩-٧) لا EXECUTE لـ anon على أي دالة إحصائية
    select string_agg(distinct f.sig, '، ')
      into v_leak
    from (values
      ('public.analytics_admin_allowed()'),
      ('public.stats_delta(numeric, numeric)'),
      ('public.stats_content_rows()'),
      ('public.stats_locales_rows()'),
      ('public.section_stats(text, date, date)'),
      ('public.funnel_daily(date, date)'),
      ('public.funnel_summary(date, date)'),
      ('public.prune_funnel_events(integer)')
    ) as f(sig)
    where has_function_privilege('anon', f.sig, 'EXECUTE');

    if v_leak is not null then
      raise exception '0022: anon يملك EXECUTE على دوال إحصائية: %', v_leak;
    end if;
  end if;

  -- (٩-٨) فهرسا الجدول الذي ينمو بلا سقف
  select string_agg(x.idx, '، ')
    into v_missing
  from (values ('funnel_events_created_at_idx'), ('funnel_events_event_created_idx'))
    as x(idx)
  where not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and tablename = 'funnel_events' and indexname = x.idx
  );

  if v_missing is not null then
    raise exception '0022: فهارس ناقصة على funnel_events (جدول ينمو بلا سقف): %', v_missing;
  end if;

  -- (٩-٩) مفتاح integrations مبذور وفيه الخدمات السبع كلها
  select s.value into v_val from public.site_settings s where s.key = 'integrations';

  if v_val is null then
    raise exception '0022: مفتاح integrations غير مبذور في site_settings';
  end if;

  -- الشكل وحده يُفحص لا القيم: البذرة معطَّلة، لكن الملف آمن لإعادة التنفيذ بعد
  -- أن يكون المالك فعّل GA4 من اللوحة — ففحص «مطفأة» كان سيُسقط الهجرة على
  -- قاعدة سليمة. المطلوب بنيوياً أن يكون لكل خدمة حقلا enabled و id.
  foreach v_key in array v_keys loop
    if v_val -> v_key is null then
      raise exception '0022: خدمة % ناقصة من مفتاح integrations', v_key;
    end if;
    -- jsonb_exists لا العامل «?»: مشغّل الهجرات يمرّر الملف كنص واحد لسائق
    -- node-postgres، وعلامة الاستفهام في نص SQL فخّ لا داعي للاقتراب منه.
    if not jsonb_exists(v_val -> v_key, 'enabled')
       or not jsonb_exists(v_val -> v_key, 'id') then
      raise exception '0022: الخدمة % بلا حقلَي enabled و id — لا تطابق IntegrationConfig', v_key;
    end if;
  end loop;

  raise notice
    '✔ 0022_analytics: funnel_events (محجوب عن الزائر تماماً، الكتابة بمفتاح الخدمة) + redirects + ٧ عروض إحصائية + section_stats/funnel_daily/funnel_summary + بذرة integrations';
end;
$$;
