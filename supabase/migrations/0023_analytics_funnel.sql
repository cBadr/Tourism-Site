-- ============================================================================
-- 0023_analytics_funnel.sql — تصحيح نموذج القمع: سلسلة واحدة من مصدر واحد
--
-- تصحيح لـ 0022 على نسق 0009 و0014 و0016 و0021. **0022 مُطبَّقة ومسجَّلة**
-- في `schema_migrations`، فتعديلها في مكانها لا يصل قاعدة المالك أبداً وينتج
-- قاعدةً لديه تخالف أي تنصيب جديد. ولذلك: ملف جديد، ولا يُلمس 0022 إطلاقاً.
--
-- ── ما الذي كشفه رسوب الاختبار (ج-ب-٨): «معدل تحول خارج المدى ٠–١٠٠» ────────
--
-- (١) **القمع كان يقرأ من مصدرين.** في 0022 كانت `search_performed` و
--     `quote_viewed` و`booking_started` تُعدّ من `funnel_events`، بينما
--     `quote_requested` من جدول `quote_requests` و`booking_created` من
--     `bookings` و`booking_paid` من أول دفعة معتمدة في `payments`.
--     فكل حجز أُنشئ **قبل وجود القياس أصلاً** (خمسة في قاعدة المالك اليوم)،
--     وكل حجز يُدخله فريق التشغيل هاتفياً، يُحسب في **قاع** القمع بلا رأس —
--     أي معدل تحول يتجاوز ١٠٠٪. وهذا سلوك دائم لا حالة عابرة.
--
-- (٢) **ما كان يُسمّى قمعاً لم يكن سلسلة.** الترتيب في 0022 أقحم داخل السلسلة:
--       • `quote_requested` — مسار دخول **موازٍ** (طلب عرض سعر يدوي)، لا خطوة
--         بين خطوتين، فنسبته إلى ما قبله رقم بلا معنى.
--       • `booking_started` — لا تقع إلا عند اختيار **بوابة إلكترونية**،
--         والمسار الافتراضي في هذه المنصة تحويل بنكي يدوي لا يمر بها ⇒ المرحلة
--         صفر بنيوياً، وكل نسبة بعدها بلا معنى.
--
-- ── النموذج المقرَّر (وهو نص الموجز والخارطة حرفياً: «بحث ← عرض سعر ← حجز ← دفع») ─
--
-- (أ) **سلسلة القمع = أربع مراحل ومصدر واحد**:
--       search_performed → quote_viewed → booking_created → booking_paid
--     كلها من `public.funnel_events` وحده. الخادم يكتبها بمفتاح الخدمة من
--     `lib/analytics/emit.ts` في: `/api/quote` و`/api/booking` و
--     `/api/payments/webhook/[provider]` و`app/admin/orders/[id]/actions.ts`
--     — فلا يمسّها مانع إعلانات، وهي بيانات المنصة لا بيانات جوجل (القرار ٥).
--
-- (ب) **الحدثان الجانبيان يبقيان معروضين، خارج السلسلة، بلا نسبة متسلسلة**:
--     `quote_requested` و`booking_started` يُرجعان بعدّادهما وحده
--     و`rate_percent = null` و`in_chain = false`.
--
-- (ج) **منع التضخيم بالتكرار**: إعادة إرسال webhook أو استدعاء مكرر قد يكتب
--     الحدث نفسه مرتين. العدّ صار:
--         count(*) filter (where reference is null) + count(distinct reference)
--     فالصفوف الحاملة لمرجع تُعدّ مرة واحدة مهما تكررت، والصفوف بلا مرجع تُعدّ
--     كما هي (لا شيء يميّز تكرارها عن بحثين حقيقيين — و`search_performed` و
--     `quote_viewed` تُكتبان بلا مرجع أصلاً في `/api/quote`).
--
-- (د) **صدق العرض**: أرقام القمع تقيس **الرحلة على الموقع** لا إجمالي أعمال
--     الشركة. حجزٌ يُدخله التشغيل هاتفياً لا يظهر في القمع — وهذا صحيح لا نقص.
--     الأرقام المرجعية للحجوزات والتحصيل مكانها قسم الطلبات وقسم الخزينة، وهذا
--     مكتوب في نص help الظاهر للمالك فلا يقرأ الفارق يوماً على أنه عطل.
--
-- ⚠ فخّ تنفيذي: `create or replace function` **لا تستطيع تغيير نوع إرجاع دالة
--   قائمة** — و`funnel_summary` تكتسب هنا عموداً جديداً (`in_chain`). لذلك
--   تُسقط الدالتان صراحةً بتوقيعهما الكامل قبل إعادة تعريفهما، وإلا فشلت الهجرة
--   بـ «cannot change return type of existing function».
--
-- ما يبقى كما هو حرفياً: حارس `analytics_admin_allowed()` · `security definer`
-- · `set search_path = ''` وتأهيل كل مرجع بـ `public.` · رفض الفترة المعكوسة ·
-- سقف ٤٠٠ يوم · توقيت `Africa/Cairo` · تعبئة الأيام الفارغة بصفر.
--
-- يُنفَّذ بعد 0022. آمن لإعادة التنفيذ بالكامل، والفحص الذاتي في القسم (٤)
-- يُسقط الهجرة إن اختلّ شرط من شروط الإغلاق.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (٠) الإسقاط الصريح — قبل أي إعادة تعريف
--
-- بالتوقيع الكامل لا بالاسم وحده: `drop function public.funnel_daily` بلا
-- توقيع تفشل حين توجد أكثر من نسخة، والتوقيع هنا هو ما تستدعيه الواجهة
-- (`lib/stats/read.ts` عبر RPC) فلا يجوز أن يتغيّر.
-- ----------------------------------------------------------------------------
drop function if exists public.funnel_daily(date, date);
drop function if exists public.funnel_summary(date, date);

-- والعدّاد الداخلي معهما: تبعيات دالة‑بدالة لا يتتبعها Postgres، فإسقاطه هنا
-- آمن ما دامت الدالتان فوقه أُسقطتا للتوّ — والغرض أن يبقى الملف قابلاً لإعادة
-- التنفيذ حتى لو تغيّر نوع إرجاعه في تصحيح لاحق.
drop function if exists public.funnel_counts(date, date);

-- ----------------------------------------------------------------------------
-- (١) عدّاد القمع الداخلي — **مصدر الحقيقة الوحيد للدالتين معاً**
--
-- لماذا دالة ثالثة بدل تكرار نفس الـ CTE في الدالتين: 0022 كانت تشترط أن تكون
-- مصادر `funnel_daily` و`funnel_summary` «مطابقة حرفياً»، وهو شرطٌ يحرسه
-- **الانضباط** لا البنية — وأي تعديل يمسّ إحداهما وينسى الأخرى يعني أن مجموع
-- الرسم لا يساوي رقم البطاقة فوقه على الشاشة نفسها (نقض القرار ٣). بجعل العدّ
-- في مكان واحد يصير التطابق بنيوياً: `funnel_summary` هي **مجموع** ما تعرضه
-- `funnel_daily` بالتعريف لا بالمصادفة.
--
-- 🔒 **بلا حارس وبلا `security definer` عمداً**: لا تُمنح لأي دور مستخدم
-- (القسم ٤)، وتُستدعى من داخل دالتين `security definer` مملوكتين لصاحب القاعدة
-- فتقرأ بصلاحياته. ولو مُنحت يوماً بسهو لدور `anon` فهي `security invoker`
-- ⇒ تعمل بصلاحيات المستدعي، و`anon` لا يملك `select` على `funnel_events`
-- أصلاً (0022 القسم ٧) فتُرفض. الفحص الذاتي (٥-٤) يُسقط الهجرة إن مُنحت.
--
-- تعريف العدّ (القرار «ج»): الصفوف الحاملة لمرجع تنهار إلى صف واحد لكل
-- (حدث، مرجع) عند **أقدم** وقت داخل المدى، والصفوف بلا مرجع تُعدّ كما هي.
-- والانهيار إلى الأقدم — لا العدّ المستقل لكل يوم — هو ما يجعل مجموع الأيام
-- مساوياً لمجموع الفترة حتى لو وصل webhook مكرَّر بعد منتصف الليل.
-- ----------------------------------------------------------------------------
create or replace function public.funnel_counts(p_from date, p_to date)
returns table (
  bucket_day date,
  event_key  text,
  n          integer
)
language sql
stable
set search_path = ''
as $$
  with ded as (
    select e.event as k, min(e.created_at) as at
    from public.funnel_events e
    where e.reference is not null
      and (e.created_at at time zone 'Africa/Cairo')::date between p_from and p_to
    group by e.event, e.reference

    union all

    select e.event as k, e.created_at as at
    from public.funnel_events e
    where e.reference is null
      and (e.created_at at time zone 'Africa/Cairo')::date between p_from and p_to
  )
  select
    (d.at at time zone 'Africa/Cairo')::date,
    d.k,
    (count(*))::integer
  from ded d
  group by 1, 2;
$$;

comment on function public.funnel_counts(date, date) is
  'عدّاد أحداث القمع باليوم وبتوقيت القاهرة — مصدر funnel_daily وfunnel_summary معاً. الصفوف الحاملة لمرجع تُعدّ مرة واحدة مهما تكرر إرسالها (webhook مكرَّر)، وما بلا مرجع يُعدّ كما هو. داخلية بحتة: لا مُنحت لدور ولا تحمل حارساً.';

-- ----------------------------------------------------------------------------
-- (٢) القمع يومياً — سلاسل StatSeries جاهزة بنقاطها
--
-- الإرجاع = صفوف `StatSeries` حرفياً: (key, label, points jsonb) و`points`
-- مصفوفة من `{"bucket": "YYYY-MM-DD", "value": n}` — لا تجميع في الواجهة.
-- وكل يوم في المدى له نقطة **حتى لو كانت صفراً**: رسمٌ يقفز فوق الأيام الفارغة
-- يكذب على العين.
--
-- الترتيب: مراحل السلسلة الأربع (١..٤) ثم الحدثان الجانبيان (٥..٦). الجانبيان
-- يبقيان مرصودين ومعروضين — لكن في لوحة مستقلة تسمّيهما «خارج السلسلة»، لا بين
-- مرحلتين، فلا يُقرأ فرقٌ بينهما وبين ما قبلهما على أنه تسرّب زوار.
--
-- 🔒 المصدر `public.funnel_events` **وحده** لكل السلاسل الست. لا `bookings` ولا
-- `payments` ولا `quote_requests` — انظر السبب (١) في ترويسة الملف.
-- ----------------------------------------------------------------------------
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
$$;

comment on function public.funnel_daily(date, date) is
  'القمع يومياً كسلاسل StatSeries من public.funnel_events وحده: بحث ← عرض سعر ← حجز ← دفع، ومعها الحدثان الجانبيان (طلب سعر يدوي، اختيار دفع إلكتروني). التكرار بنفس المرجع يُعدّ مرة واحدة.';

-- ----------------------------------------------------------------------------
-- (٣) مجاميع القمع ومعدلات التحول للفترة كلها
--
-- الشكل = `FunnelSummaryRow` في `lib/stats/cards.ts` حرفياً، **زائداً عمود
-- `in_chain`**:
--   (key text, label text, value numeric, rate_percent numeric, in_chain boolean)
--
--   • `in_chain = true`  للمراحل الأربع، و`false` للحدثين الجانبيين.
--   • `rate_percent` يُحسب على **سابقتها داخل السلسلة فقط**، بمقياس ٠–١٠٠،
--     و`null` للمرحلة الأولى (لا مرحلة قبلها) وللحدثين الجانبيين (لا سلسلة
--     أصلاً) ولكل مقام صفر («لا مقارنة ممكنة» ليست «صفر بالمئة»).
--
-- ⚠ السقف (`least`) على **مرحلة واحدة فقط**، وليس على الثلاث — والسبب أن السقف
--   المعمَّم يحوّل كل فحصٍ يقول «لا نسبة تتجاوز ١٠٠» إلى تأكيدٍ محسوم بالبناء
--   لا يمكن أن يفشل، أي حارساً ميتاً يحمل اسم العيب الذي كشف هذه الهجرة أصلاً:
--
--     • `quote_viewed / search_performed` — **مسقوف بنيوياً بلا `least`**:
--       `/api/quote` يكتب الحدثين في **إدراج واحد** (`trackFunnelBatch`) ولا
--       يكتب `quote_viewed` وحده أبداً، فلكل صف عرضٍ صفُّ بحثٍ بنفس الطابع
--       الزمني ⇒ في أي نافذة، عدد العروض ≤ عدد عمليات البحث. تجاوزُ ١٠٠ هنا
--       يعني أن مصدراً آخر تسلّل إلى المرحلة — وهذا بالضبط ما نريد أن ينفجر.
--
--     • `booking_paid / booking_created` — **كوهورت**: البسط ليس كل تحصيل وقع
--       في النافذة، بل عدد **المراجع** التي أُنشئ حجزها **داخل النافذة نفسها**
--       ووصل تحصيلها فيها. بلا هذا كانت نافذة سبعة أيام تحوي ٣ حجوزات و٥
--       تحصيلات لحجوزات أقدم (التحويل البنكي يُعتمد بعد أيام) ⇒ ١٦٦٪ يبتلعها
--       السقف ويعرضها «١٠٠٪» — رقمٌ مصنوع لا مقيس. بالكوهورت تصير النسبة ≤ ١٠٠
--       **حقيقةً لا قسراً**، ومعناها للمالك أوضح: «من حجزوا في الفترة، كم دفع
--       منهم داخلها». والعدّاد المعروض (`value`) يبقى كل التحصيل في النافذة —
--       وإلا انفصل مجموع الرسم اليومي عن رقم البطاقة فوقه (القرار ٣).
--
--     • `booking_created / quote_viewed` — **هنا وحدها يبقى `least`**: زائرٌ
--       رأى العروض أمس وحجز اليوم يظهر في نافذة اليوم بقاعٍ بلا رأسه، ولا مرجع
--       في `quote_viewed` (يُكتب بلا reference) فلا كوهورت ممكناً. السقف يمنع
--       رقماً يقرأه المالك على أنه عطب، و(٥-٥) يفحص **المطابقة** لا المدى:
--       `rate_percent = least(100, الخام)` — فلو انحرف الحساب انفجر الفحص.
--
-- 🔒 المصدر `public.funnel_counts` نفسه الذي تقرؤه `funnel_daily` — فمجموع نقاط
-- الرسم يساوي رقم البطاقة فوقه **بالبناء**، لا بمطابقة نصّين متكررين.
-- ----------------------------------------------------------------------------
create or replace function public.funnel_summary(p_from date, p_to date)
returns table (
  key          text,
  label        text,
  value        numeric,
  rate_percent numeric,
  in_chain     boolean
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
  v_qreq   numeric := 0;
  v_start  numeric := 0;
  -- كوهورت التحصيل: مراجعُ حُجزت **ودُفعت** داخل النافذة نفسها (انظر الترويسة)
  v_paid_c numeric := 0;
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
    and (p.created_at at time zone 'Africa/Cairo')::date between v_from and v_to
    and exists (
      select 1
      from public.funnel_events b
      where b.event = 'booking_created'
        and b.reference = p.reference
        and (b.created_at at time zone 'Africa/Cairo')::date between v_from and v_to
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
$$;

comment on function public.funnel_summary(date, date) is
  'مجاميع القمع للفترة: أربع مراحل داخل السلسلة (in_chain = true) بمعدل تحول ٠–١٠٠ على سابقتها (null للأولى وللمقام الصفر)، وحدثان جانبيان (in_chain = false) بعدّادهما وحده. معدل التحصيل كوهورت (من حُجز ودُفع داخل النافذة ÷ من حُجز فيها) لا نسبة عدّادين، والسقف على مرحلة إنشاء الحجز وحدها. المصدر funnel_counts نفسه الذي تقرؤه funnel_daily.';

-- ----------------------------------------------------------------------------
-- (٤) الصلاحيات — السحب أولاً ثم المنح الصريح
--
-- الفخّ المعروف منذ 0007 ويتكرر مع **كل** دالة يُعاد إنشاؤها: الدالة الجديدة
-- تولد ومعها EXECUTE ضمني لـ PUBLIC ومنح Supabase الافتراضي لـ anon، و
-- `create or replace` لا يعيد ضبط شيء. وهنا الدالتان أُسقطتا فعلاً في القسم (٠)
-- فوُلدتا من جديد — أي أن منح 0022 ذهب معهما ولا بديل عن إعادته صريحاً.
-- ----------------------------------------------------------------------------

-- داخلية بحتة: لا تُمنح لأي دور مستخدم إطلاقاً (لا حارس فيها)
revoke all on function public.funnel_counts(date, date) from public, anon, authenticated;

revoke all    on function public.funnel_daily(date, date) from public, anon, authenticated;
grant execute on function public.funnel_daily(date, date) to authenticated;

revoke all    on function public.funnel_summary(date, date) from public, anon, authenticated;
grant execute on function public.funnel_summary(date, date) to authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'revoke all on function public.funnel_counts(date, date) from service_role';
    execute 'grant execute on function public.funnel_daily(date, date) to service_role';
    execute 'grant execute on function public.funnel_summary(date, date) to service_role';
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- (٥) فحص ذاتي بعد التنفيذ — شروط إغلاق التصحيح (على نسق 0022 القسم ٩)
-- ----------------------------------------------------------------------------
do $$
declare
  v_missing text;
  v_leak    text;
  v_rows    integer;
  v_bad     integer;
  v_to      date := (now() at time zone 'Africa/Cairo')::date;
begin
  -- (٥-١) الدوال الثلاث موجودة بتواقيعها الحرفية
  select string_agg(x.sig, '، ')
    into v_missing
  from (values
    ('public.funnel_counts(date, date)'),
    ('public.funnel_daily(date, date)'),
    ('public.funnel_summary(date, date)')
  ) as x(sig)
  where to_regprocedure(x.sig) is null;

  if v_missing is not null then
    raise exception '0023: دوال ناقصة بعد التنفيذ: %', v_missing;
  end if;

  -- (٥-٢) `funnel_summary` تحمل عمود in_chain فعلاً — وإلا فالواجهة تقرأ عموداً
  -- لا تُرجعه الدالة (النمط ٤ في handover/LESSONS.md حرفياً)
  if not exists (
    select 1
    from pg_proc p
    join pg_namespace ns on ns.oid = p.pronamespace
    cross join lateral unnest(coalesce(p.proargnames, array[]::text[])) as a(nm)
    where ns.nspname = 'public'
      and p.proname = 'funnel_summary'
      and a.nm = 'in_chain'
  ) then
    raise exception '0023: funnel_summary بلا عمود in_chain — الواجهة تقرأ عموداً غير موجود';
  end if;

  -- (٥-٣) 🔒 كل دالة تُعاد كتابتها تثبّت search_path وتبقى security definer
  select string_agg(p.proname, '، ')
    into v_leak
  from pg_proc p
  join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public'
    and p.proname in ('funnel_daily', 'funnel_summary')
    and (
      p.prosecdef is not true
      or coalesce(array_to_string(p.proconfig, ','), '') not like '%search_path=%'
    );

  if v_leak is not null then
    raise exception
      '0023: دوال بلا search_path مثبَّت أو بلا security definer: %', v_leak;
  end if;

  if not exists (
    select 1
    from pg_proc p
    join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public'
      and p.proname = 'funnel_counts'
      and coalesce(array_to_string(p.proconfig, ','), '') like '%search_path=%'
  ) then
    raise exception '0023: funnel_counts بلا search_path مثبَّت';
  end if;

  -- (٥-٤) 🔒 لا EXECUTE لـ anon على أي من الثلاث، والعدّاد الداخلي بلا حارس
  --        فلا يُمنح لـ authenticated أيضاً
  if exists (select 1 from pg_roles where rolname = 'anon') then
    select string_agg(distinct f.sig, '، ')
      into v_leak
    from (values
      ('public.funnel_counts(date, date)'),
      ('public.funnel_daily(date, date)'),
      ('public.funnel_summary(date, date)')
    ) as f(sig)
    where has_function_privilege('anon', f.sig, 'EXECUTE');

    if v_leak is not null then
      raise exception '0023: anon يملك EXECUTE على دوال القمع: %', v_leak;
    end if;
  end if;

  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    if has_function_privilege('authenticated', 'public.funnel_counts(date, date)', 'EXECUTE') then
      raise exception
        '0023: authenticated يملك EXECUTE على funnel_counts — عدّاد بلا حارس مكشوف لكل متعهد';
    end if;

    if not has_function_privilege('authenticated', 'public.funnel_daily(date, date)', 'EXECUTE')
       or not has_function_privilege('authenticated', 'public.funnel_summary(date, date)', 'EXECUTE') then
      raise exception '0023: المشرف لن يقرأ القمع — منح EXECUTE سقط عن دوال القمع';
    end if;
  end if;

  -- (٥-٥) والنتيجة الفعلية: الشكل صحيح ولا معدل تحول خارج ٠–١٠٠
  --
  -- يُتخطّى إن كان الاتصال المُنفِّذ للهجرة غير مأذون له بالقراءة (نسخة whitelabel
  -- تُهاجَر بدور آخر): الحارس يرمي حينها، والفحص لا يجوز أن يُسقط هجرةً سليمة.
  if public.analytics_admin_allowed() then
    select count(*),
           count(*) filter (
             where s.rate_percent is not null
               and (s.rate_percent < 0 or s.rate_percent > 100))
      into v_rows, v_bad
    from public.funnel_summary(v_to - 400, v_to) s;

    if v_rows <> 6 then
      raise exception
        '0023: funnel_summary أرجعت % صفاً بدل ٦ (أربع مراحل + حدثان جانبيان)', v_rows;
    end if;

    if v_bad <> 0 then
      raise exception '0023: % معدل تحول خارج المدى ٠–١٠٠', v_bad;
    end if;

    -- ⚠ الفحص أعلاه **قابل للفشل فعلاً** لمرحلتَي `quote_viewed` و`booking_paid`
    --   بعد أن سقط عنهما السقف (الأولى مسقوفة بنيوياً والثانية كوهورت). أما
    --   `booking_created` فمسقوفة عرضاً، فحارسها هو المطابقة أدناه لا المدى.

    -- (٥-٦) 🔒 **الحارس الذي يحمل اسم العيب**: كل رقم في القمع من
    --       `public.funnel_events` وحده. لو أعادت هجرةٌ لاحقة مرحلةً إلى
    --       `bookings` أو `payments` أو `quote_requests` — وهو العيب الذي كشفه
    --       رسوب (ج-ب-٨) — انفجر هذا الفحص فوراً مهما فعل السقف بالنسبة.
    select count(*)
      into v_bad
    from public.funnel_summary(v_to - 400, v_to) s
    left join (
      select x.k as k, count(*)::numeric as n
      from (
        select e.event as k
        from public.funnel_events e
        where e.reference is not null
          and (e.created_at at time zone 'Africa/Cairo')::date between v_to - 400 and v_to
        group by e.event, e.reference
        union all
        select e.event
        from public.funnel_events e
        where e.reference is null
          and (e.created_at at time zone 'Africa/Cairo')::date between v_to - 400 and v_to
      ) x
      group by x.k
    ) d on d.k = s.key
    where s.value is distinct from coalesce(d.n, 0);

    if v_bad <> 0 then
      raise exception
        '0023: % مرحلةً لا يساوي عدّادها العدّ المباشر من funnel_events — مصدر ثانٍ تسلّل إلى القمع',
        v_bad;
    end if;

    -- (٥-٧) ومطابقة النسبة المسقوفة: `booking_created` = least(100, الخام)
    select count(*)
      into v_bad
    from (
      select
        max(s.value) filter (where s.key = 'quote_viewed')    as q,
        max(s.value) filter (where s.key = 'booking_created') as b,
        max(s.rate_percent) filter (where s.key = 'booking_created') as r
      from public.funnel_summary(v_to - 400, v_to) s
    ) t
    where t.r is distinct from (
      case when t.q > 0 then least(100::numeric, round(100.0 * t.b / t.q, 1)) else null end
    );

    if v_bad <> 0 then
      raise exception
        '0023: معدل التحول إلى «أُنشئ الحجز» لا يساوي least(100، الخام) — حساب منحرف يخفيه السقف';
    end if;

    -- أربع داخل السلسلة واثنان خارجها، لا خامسة ولا ثالث
    select count(*) filter (where s.in_chain), count(*) filter (where not s.in_chain)
      into v_rows, v_bad
    from public.funnel_summary(v_to - 400, v_to) s;

    if v_rows <> 4 or v_bad <> 2 then
      raise exception
        '0023: توزيع المراحل خاطئ — % داخل السلسلة و% خارجها (المطلوب ٤ و٢)', v_rows, v_bad;
    end if;

    -- المرحلة الأولى والحدثان الجانبيان: لا معدل تحول لهم أبداً
    select count(*) into v_bad
    from public.funnel_summary(v_to - 400, v_to) s
    where s.rate_percent is not null
      and (not s.in_chain or s.key = 'search_performed');

    if v_bad <> 0 then
      raise exception
        '0023: % صفاً خارج السلسلة (أو المرحلة الأولى) يحمل معدل تحول — نسبة بلا سابقة', v_bad;
    end if;
  else
    raise notice
      '  ↳ 0023: اتصال الهجرة غير مأذون له بقراءة القمع — فحص القيم متخطّى (الشكل والصلاحيات فُحصت)';
  end if;

  raise notice
    '✔ 0023_analytics_funnel: القمع سلسلة رباعية (بحث ← عرض سعر ← حجز ← دفع) من public.funnel_events وحده + حدثان جانبيان خارج السلسلة بلا نسبة + دمج التكرار بالمرجع';
end;
$$;
