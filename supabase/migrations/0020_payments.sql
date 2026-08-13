-- ============================================================================
-- 0020_payments.sql — بوابات الدفع الإلكترونية: الجداول الثلاثة ودوالها الأربع
--
-- المرحلة ٩. العقد المرجعي: lib/payments-types.ts (المزوّدون، شكل الصفوف،
-- تواقيع الدوال، والقواعد الأربع) — لا انحراف عنه. وقرار ROADMAP للمرحلة:
-- «كل عملية إلكترونية قيد تلقائي في خزينة المرحلة ٧ + شاشة مطابقة تسويات».
--
-- ── ما الذي يحرسه هذا الملف بالضبط ─────────────────────────────────────────
--
-- (١) **المبلغ لا يأتي من المتصفح.** `create_payment_intent` تقرأ الحجز بنفسها
--     وتحسب المستحق بالقروش، وترفض أي رقم واصل لا يطابقه حرفياً. هي نفس نقطة
--     مكافحة التلاعب التي فرضتها المرحلة ٤ في `create_booking` (وشدّدتها 0009)،
--     منقولةً إلى مسار البوابة.
--
-- (٢) **الإحكام بنيوي لا برمجي.** التفرد على `(provider, event_id)` في
--     `payment_events` هو الضمانة، لا شرط `if` في TypeScript ولا في PL/pgSQL:
--     `settle_payment_intent` تُدرج الحدث **أولاً** بـ `on conflict do nothing`،
--     فإن لم يُدرَج فالحدث معالَج سلفاً وتعود الدالة بنتيجة منمَّطة بلا أي أثر.
--     وإدراج Postgres المضاربي (speculative insertion) ينتظر نتيجة المعاملة
--     المتزامنة قبل أن يحسم التعارض — فحتى webhookان متوازيان بنفس المعرّف
--     يُسلسَلان على الفهرس نفسه، ولا يمر إلا أحدهما.
--
-- (٣) **المال يُقيَّد مرة واحدة عبر المسار القائم.** لا سطر واحد هنا يكتب في
--     `ledger_entries`. النجاح يُدرج صف `payments` بحالة `approved`، ومُشغّل
--     المرحلة ٧ (`payments_ledger_approved`) هو الذي يقيّد التحصيل — بحارس
--     التكرار الذي فيه أصلاً. مسار واحد للمال في المشروع كله.
--
-- (٤) **الانتقال يمر بالحارس لا حوله.** جدول الانتقالات (0007) لا يسمح بالقفزة
--     `pending_payment → confirmed`، واختبارات المرحلة ٤ تؤكّد منعها. فالتسوية
--     تقفز قفزتين مشروعتين داخل معاملة واحدة:
--         pending_payment → under_review → confirmed
--     كلتاهما عبر `update` عادي يمر على `bookings_guard_status`، فيُكتب السجل
--     ويُطلق إشعار «تأكيد الحجز» تلقائياً كما في مسار التحويل اليدوي.
--     ولا نلمس `booking_transition_allowed` إطلاقاً: توسيعها كان سيفتح للمشرف
--     تأكيد حجز بلا أي تحصيل، وهو ما تمنعه المرحلة ٤ عمداً.
--
-- (٥) **المدفوعات اليدوية تبقى كما هي.** لا هذا الملف ولا دوالُّه تمسّ
--     `attach_receipt` ولا `verify_payment` ولا حسابات الاستقبال المعروضة
--     للعميل. البوابة **خيار إضافي** على نفس الحجز لا بديل.
--
-- ⚠ الفخّان المُوثَّقان منذ 0007 ويتكرران هنا حرفياً:
--   ١) الوصول إلى جدول طبقتان: GRANT + سياسة RLS، وكلاهما مطلوب. وإعدادات
--      Supabase الافتراضية تمنح anon **كل** شيء على أي جدول جديد — وTRUNCATE
--      لا تخضع لـ RLS إطلاقاً. لذلك: revoke all ثم grant صريح.
--   ٢) كل دالة جديدة تولد ومعها EXECUTE ضمني لـ PUBLIC ومنح صريح لـ anon.
--      لذلك لكل دالة: revoke from public, anon, authenticated ثم grant صريح.
--
-- يُنفَّذ بعد 0007/0009 (الحجز وحارسه) و0013/0014 (البث) و0015–0017 (الدفتر).
-- آمن لإعادة التنفيذ بالكامل، والفحص الذاتي في القسم (٩) يُسقط الهجرة إن اختل
-- أي شرط من شروط إغلاق المرحلة.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (١) تحويل الوحدات — في مكان واحد لا في كل دالة
--
-- البوابات كلها تتعامل بالوحدة الصغرى (قرش/سنت) بأعداد صحيحة تفادياً لانحراف
-- الكسور العشرية، بينما `bookings.total/amount_due` تبقى numeric بالجنيه.
-- الأسّ ٢ صحيح لكل عملات المشروع (EGP/USD/EUR/SAR/AED)؛ ولو أُضيفت يوماً عملة
-- بلا كسور (JPY) أو بثلاثة (KWD) فهذا الزوج هو **مكان التعديل الوحيد**.
--
-- الإرجاع bigint لا integer عمداً: الفيضان يُكتشف في المستدعي برسالة مفهومة
-- بدل أن يرمي Postgres «integer out of range» من داخل التحويل.
-- ----------------------------------------------------------------------------
create or replace function public.to_minor_units(p_amount numeric)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select round(coalesce(p_amount, 0) * 100)::bigint;
$$;

create or replace function public.from_minor_units(p_minor bigint)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select round(coalesce(p_minor, 0)::numeric / 100, 2);
$$;

comment on function public.to_minor_units(numeric) is
  'جنيه → قرش (أسّ ٢). المكان الوحيد لتحويل الوحدات في مسار البوابات.';

comment on function public.from_minor_units(bigint) is
  'قرش → جنيه (أسّ ٢) — عكس to_minor_units، ويُستعمل عند كتابة صف payments.';

-- ----------------------------------------------------------------------------
-- (٢) الجداول الثلاثة
-- التسمية snake_case مطابقة لحقول camelCase في lib/payments-types.ts حرفياً.
-- ----------------------------------------------------------------------------

-- (٢-١) المزوّدون — صفوف `ProviderSettings` التي تديرها اللوحة
--
-- **لا أسرار هنا إطلاقاً**: المفاتيح السرّية في متغيّرات البيئة كما ينص العقد،
-- والجدول يحمل التفعيل والترتيب والاسم الظاهر والمعرّفات العامة فقط. لو وُجد
-- يوماً مفتاح سرّي في `public_config` فهو خطأ تشغيلي لا ميزة.
--
-- المفتاح الأساسي هو اسم المزوّد نفسه: قائمة مغلقة تطابق اتحاد `PaymentProvider`
-- حرفاً بحرف، فلا يستطيع أحد — ولا اللوحة — اختراع مزوّد لا محوّل (adapter) له.
--
-- account_id: حساب الخزينة الذي يصب فيه تحصيل هذه البوابة (المرحلة ٧). قابل
-- للتفريغ لأن حذف حساب لا يجوز أن يُسقط إعداد البوابة، والتسوية تتراجع عندها
-- إلى حساب البوابات الافتراضي المبذور في القسم (٨).
create table if not exists public.payment_providers (
  provider      text primary key
                check (provider in ('test', 'paymob', 'stripe', 'paypal',
                                    'twocheckout', 'binancepay', 'nowpayments')),
  enabled       boolean not null default false,
  sort          integer not null default 0,
  label         text not null,
  sandbox       boolean not null default true,
  public_config jsonb not null default '{}'::jsonb,
  account_id    uuid references public.payment_accounts(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

drop trigger if exists payment_providers_touch_updated_at on public.payment_providers;
create trigger payment_providers_touch_updated_at
  before update on public.payment_providers
  for each row execute function public.touch_updated_at();

create index if not exists payment_providers_enabled_sort_idx
  on public.payment_providers (enabled, sort);

comment on table public.payment_providers is
  'إعدادات كل بوابة كما تديرها اللوحة — بلا أي سرّ. المصدر: ProviderSettings في lib/payments-types.ts.';

comment on column public.payment_providers.public_config is
  'معرّفات عامة غير سرّية (رقم التاجر، معرّف الإطار...). المفاتيح السرّية في متغيّرات البيئة لا هنا.';

comment on column public.payment_providers.account_id is
  'حساب الخزينة الذي يصب فيه تحصيل هذه البوابة — وإلا فحساب البوابات الافتراضي.';

-- (٢-٢) جلسات الدفع — صف لكل محاولة دفع لدى مزوّد
--
-- amount_minor **يُملأ من الحجز حصراً** داخل `create_payment_intent`، ولا يوجد
-- أي مسار كتابة آخر إليه (لا INSERT ولا UPDATE ممنوح لأي دور مستخدم).
--
-- provider_ref: معرّف الجلسة لدى المزوّد، وهو مفتاح المطابقة عند وصول الـ
-- webhook. تفرّده لكل مزوّد شرط سلامة لا تحسيناً: مرجعان متطابقان يعنيان تسوية
-- ذاهبة إلى الحجز الخطأ.
create table if not exists public.payment_intents (
  id             uuid primary key default gen_random_uuid(),
  booking_id     uuid not null references public.bookings(id) on delete cascade,
  provider       text not null references public.payment_providers(provider) on delete restrict,
  provider_ref   text,
  amount_minor   integer not null check (amount_minor > 0),
  currency       text not null default 'EGP',
  status         text not null default 'created'
                 check (status in ('created', 'pending', 'succeeded',
                                   'failed', 'cancelled', 'expired')),
  redirect_url   text,
  failure_reason text,
  payment_id     uuid references public.payments(id) on delete set null,
  created_at     timestamptz not null default now(),
  completed_at   timestamptz
);

-- إضافة لاحقة آمنة لقاعدة أُنشئ فيها الجدول بنسخة أقدم
alter table public.payment_intents add column if not exists payment_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.payment_intents'::regclass
      and conname  = 'payment_intents_payment_id_fkey'
  ) then
    alter table public.payment_intents
      add constraint payment_intents_payment_id_fkey
      foreign key (payment_id) references public.payments(id) on delete set null;
  end if;
exception
  when others then
    raise notice '⚠ تعذّر ربط payment_intents.payment_id بجدول المدفوعات: %', sqlerrm;
end;
$$;

create index if not exists payment_intents_booking_created_idx
  on public.payment_intents (booking_id, created_at desc);

create index if not exists payment_intents_status_created_idx
  on public.payment_intents (status, created_at desc);

-- 🔒 مرجع المزوّد فريد لكل مزوّد — مسار المطابقة في التسوية لا يقبل الالتباس
create unique index if not exists payment_intents_provider_ref_key
  on public.payment_intents (provider, provider_ref)
  where provider_ref is not null;

-- 🔒 جلسة واحدة لكل صف تحصيل: لا يمكن أن يُنسب صف `payments` واحد إلى جلستين
-- (السدّ الثاني بعد قفل الصف داخل التسوية — وهو بنيوي لا يعتمد على منطق دالة)
create unique index if not exists payment_intents_payment_key
  on public.payment_intents (payment_id)
  where payment_id is not null;

comment on table public.payment_intents is
  'جلسة دفع لدى مزوّد. المصدر: PaymentIntentRow في lib/payments-types.ts (وpayment_id زيادة للمطابقة المحاسبية).';

comment on column public.payment_intents.amount_minor is
  'المستحق بالقرش — يُحسب من الحجز في الخادم ولا يُقبل من المتصفح أبداً (القاعدة ١).';

comment on column public.payment_intents.payment_id is
  'صف التحصيل الذي ولّدته هذه الجلسة — مرجع شاشة المطابقة، وسدّ بنيوي ضد التحصيل المزدوج.';

-- (٢-٣) أحداث الـ webhook — سجل التدقيق ومحلّ ضمانة الإحكام
--
-- 🔒 **التفرد على (provider, event_id) هو الإحكام نفسه** لا فحصٌ يسبقه. المزوّد
-- يعيد إرسال الحدث عند أي شك (مهلة، ٥٠٠، إعادة نشر يدوية)، وبلا هذا الفهرس
-- يتضاعف التحصيل في الدفتر بهدوء — وهو أسوأ عطب ممكن في هذه المرحلة.
--
-- signature_valid: يُبقى للتدقيق. رفض التوقيع يقع في مسار الـ API **قبل** بلوغ
-- هذه الدالة (القاعدة ٣: ٤٠٠ بلا أي أثر)، فلا يصل حدث بتوقيع فاسد إلى هنا.
create table if not exists public.payment_events (
  id              uuid primary key default gen_random_uuid(),
  provider        text not null references public.payment_providers(provider) on delete restrict,
  event_id        text not null,
  intent_id       uuid references public.payment_intents(id) on delete set null,
  event_type      text not null default '',
  signature_valid boolean not null default true,
  payload         jsonb not null default '{}'::jsonb,
  processed_at    timestamptz,
  created_at      timestamptz not null default now()
);

-- الفهرس مستقل عن `create table` عمداً: إعادة التنفيذ على قاعدة أُنشئ فيها
-- الجدول سلفاً لا تضيف قيداً مضمَّناً، بينما `create unique index if not exists`
-- تضمن وجوده دائماً — وهو ما تستنتج منه `on conflict (provider, event_id)`.
create unique index if not exists payment_events_provider_event_key
  on public.payment_events (provider, event_id);

create index if not exists payment_events_intent_created_idx
  on public.payment_events (intent_id, created_at desc);

create index if not exists payment_events_created_idx
  on public.payment_events (created_at desc);

comment on table public.payment_events is
  'أحداث الـ webhook. التفرد على (provider, event_id) هو ضمانة عدم تكرار التحصيل. المصدر: PaymentEventRow.';

comment on column public.payment_events.signature_valid is
  'للتدقيق فقط — الحدث فاسد التوقيع يُرفض في مسار الـ API بـ ٤٠٠ ولا يصل إلى هذه الطاولة.';

-- ----------------------------------------------------------------------------
-- (٣) إنشاء جلسة الدفع — نقطة مكافحة التلاعب
--
-- الترتيب: الحجز أولاً (بقفل) ← حالته ← المزوّد ومفعوليته ← المبلغ المحسوب من
-- الحجز ← رفض أي رقم واصل يخالفه ← الإدراج.
--
-- 🔒 `p_amount_minor` و`p_currency` **مدخلان للتحقق لا للتخزين**: ما يُخزَّن هو
-- ما حسبته القاعدة من `bookings.amount_due` وعملة الحجز. لو مرّر المستدعي رقماً
-- مخالفاً فهو إما خلل في الواجهة أو محاولة تلاعب — وكلاهما يُرفض بصوت عالٍ لا
-- يُصحَّح بصمت، حتى لا يمر خلل تسعير في الواجهة بلا أن يلاحظه أحد.
--
-- security definer لأن مسار الـ API يعمل بمفتاح الخدمة وليس لأي دور متصفح
-- وصول إلى `bookings`؛ و`search_path = ''` كالمعتاد.
-- ----------------------------------------------------------------------------
create or replace function public.create_payment_intent(
  p_booking      uuid,
  p_provider     text,
  p_amount_minor integer,
  p_currency     text
)
returns table (
  id             uuid,
  booking_id     uuid,
  provider       text,
  provider_ref   text,
  amount_minor   integer,
  currency       text,
  status         text,
  redirect_url   text,
  failure_reason text,
  created_at     timestamptz,
  completed_at   timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_provider text;
  v_currency text;
  v_prov     record;
  v_booking  record;
  v_minor    bigint;
  v_open     integer;
  v_id       uuid;
begin
  v_provider := lower(nullif(btrim(coalesce(p_provider, '')), ''));
  v_currency := upper(nullif(btrim(coalesce(p_currency, '')), ''));

  if p_booking is null then
    raise exception 'معرّف الحجز مطلوب' using hint = 'invalid-input';
  end if;
  if v_provider is null then
    raise exception 'اسم المزوّد مطلوب' using hint = 'invalid-input';
  end if;

  -- (أ) الحجز أولاً وبقفل: حالته لا يجوز أن تتغير بيننا وبين الإدراج
  select b.* into v_booking
  from public.bookings b
  where b.id = p_booking
  for update;

  if not found then
    raise exception 'الحجز غير موجود' using hint = 'booking-not-found';
  end if;

  if v_booking.status <> 'pending_payment' then
    raise exception 'لا يمكن بدء دفعة والحجز في حالة «%»', v_booking.status
      using hint = 'invalid-status';
  end if;

  -- (ب) المزوّد: معروف **ومفعّل**. التعطيل من اللوحة يعني اختفاء البوابة فوراً
  --     من مسار الدفع (قرار المرحلة في ROADMAP) لا مجرد إخفائها في الواجهة.
  select pp.* into v_prov
  from public.payment_providers pp
  where pp.provider = v_provider;

  if not found then
    raise exception 'المزوّد «%» غير معروف', v_provider using hint = 'provider-unknown';
  end if;

  if not v_prov.enabled then
    raise exception 'بوابة «%» معطّلة حالياً', v_prov.label using hint = 'provider-disabled';
  end if;

  -- (ج) 🔒 المبلغ من الحجز — القاعدة الأولى التي لا تُخرق
  v_minor := public.to_minor_units(v_booking.amount_due);

  if v_minor <= 0 then
    raise exception 'المستحق على الحجز صفر — لا شيء يُدفَع' using hint = 'nothing-due';
  end if;

  -- سقف int4: لا بوابة تقبل أصلاً ما يفوقه، والانفجار هنا أوضح من انفجاره
  -- داخل التحويل بعد سطور
  if v_minor > 2147483647 then
    raise exception 'قيمة الحجز تفوق ما تقبله البوابات (% قرش)', v_minor
      using hint = 'amount-too-large';
  end if;

  if p_amount_minor is null or p_amount_minor <> v_minor then
    raise exception
      'قيمة الدفع المطلوبة (%) لا تطابق المستحق على الحجز (% قرش)',
      coalesce(p_amount_minor::text, 'غير محددة'), v_minor
      using hint = 'amount-mismatch';
  end if;

  -- (د) العملة كذلك تُقرأ من الحجز؛ والمُمرَّرة تُقارن ولا تُخزَّن
  v_currency := coalesce(v_currency, upper(v_booking.currency));
  if v_currency <> upper(v_booking.currency) then
    raise exception 'عملة الدفع (%) لا تطابق عملة الحجز (%)', v_currency, v_booking.currency
      using hint = 'currency-mismatch';
  end if;

  -- (هـ) سقف الجلسات المفتوحة: كل ضغطة «ادفع» جلسة جديدة (ولا نعيد استعمال
  --      جلسة معلّقة أبداً حتى لا يبقى مرجع مزوّد يتيم لا تجد تسويتُه جلستها)،
  --      والسقف يمنع حلقة واجهة معطوبة من تفريخ آلاف الصفوف.
  select count(*) into v_open
  from public.payment_intents i
  where i.booking_id = p_booking
    and i.status in ('created', 'pending');

  if v_open >= 20 then
    raise exception 'عدد محاولات الدفع المفتوحة لهذا الحجز بلغ الحد (%)', v_open
      using hint = 'too-many-intents';
  end if;

  insert into public.payment_intents as i (
    booking_id, provider, amount_minor, currency, status
  )
  values (p_booking, v_provider, v_minor::integer, upper(v_booking.currency), 'created')
  returning i.id into v_id;

  return query
  select i.id, i.booking_id, i.provider, i.provider_ref, i.amount_minor, i.currency,
         i.status, i.redirect_url, i.failure_reason, i.created_at, i.completed_at
  from public.payment_intents i
  where i.id = v_id;
end;
$$;

comment on function public.create_payment_intent(uuid, text, integer, text) is
  'إنشاء جلسة دفع — المبلغ من الحجز حصراً، وأي رقم واصل يخالفه يُرفض (القاعدة ١).';

-- ----------------------------------------------------------------------------
-- (٤) إرفاق مرجع المزوّد ورابط الدفع — created → pending
--
-- يستدعيها مسار `/api/payments/start` بعد أن يُنشئ المحوّل الجلسة لدى المزوّد.
--
-- 🔒 الرابط يُفحص أنه http(s): المحوّل يتكلم مع طرف خارجي، ورابط عائد بصيغة
-- `javascript:` أو `data:` يُسلَّم إلى المتصفح كإعادة توجيه هو ثغرة تنفيذ نصوص.
-- الفحص هنا لا في الواجهة لأن هذه هي الطبقة التي لا يستطيع أحد تخطّيها.
--
-- إعادة الاستدعاء بنفس المرجع تمر بهدوء (تحديث الرابط فقط) — إعادة محاولة من
-- المسار لا خطأ. أما مرجع **مختلف** على جلسة معلّقة فمرفوض: قبوله يعني يُتْم
-- المرجع الأول، فتصل تسويته يوماً ولا تجد جلسة تطابقها.
-- ----------------------------------------------------------------------------
create or replace function public.attach_intent_ref(
  p_intent   uuid,
  p_ref      text,
  p_redirect text
)
returns table (
  id             uuid,
  booking_id     uuid,
  provider       text,
  provider_ref   text,
  amount_minor   integer,
  currency       text,
  status         text,
  redirect_url   text,
  failure_reason text,
  created_at     timestamptz,
  completed_at   timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_ref      text;
  v_redirect text;
  v_intent   record;
begin
  v_ref      := nullif(btrim(coalesce(p_ref, '')), '');
  v_redirect := nullif(btrim(coalesce(p_redirect, '')), '');

  if p_intent is null then
    raise exception 'معرّف الجلسة مطلوب' using hint = 'invalid-input';
  end if;
  if v_ref is null then
    raise exception 'مرجع المزوّد مطلوب' using hint = 'invalid-input';
  end if;
  if v_redirect is null or v_redirect !~* '^https?://' then
    raise exception 'رابط الدفع يجب أن يكون رابط http(s) صالحاً' using hint = 'invalid-redirect';
  end if;

  select i.* into v_intent
  from public.payment_intents i
  where i.id = p_intent
  for update;

  if not found then
    raise exception 'جلسة الدفع غير موجودة' using hint = 'intent-not-found';
  end if;

  if v_intent.status not in ('created', 'pending') then
    raise exception 'لا يمكن إرفاق مرجع بجلسة في حالة «%»', v_intent.status
      using hint = 'invalid-status';
  end if;

  if v_intent.status = 'pending'
     and v_intent.provider_ref is not null
     and v_intent.provider_ref <> v_ref then
    raise exception 'للجلسة مرجع مزوّد آخر بالفعل — ابدأ جلسة جديدة'
      using hint = 'ref-conflict';
  end if;

  update public.payment_intents i
     set provider_ref = v_ref,
         redirect_url = v_redirect,
         status       = 'pending'
   where i.id = p_intent;

  return query
  select i.id, i.booking_id, i.provider, i.provider_ref, i.amount_minor, i.currency,
         i.status, i.redirect_url, i.failure_reason, i.created_at, i.completed_at
  from public.payment_intents i
  where i.id = p_intent;
end;
$$;

comment on function public.attach_intent_ref(uuid, text, text) is
  'تخزين مرجع المزوّد ورابط الدفع ونقل الجلسة إلى pending — مع فحص أن الرابط http(s).';

-- ----------------------------------------------------------------------------
-- (٥) التسوية — قلب المرحلة
--
-- ترتيب الخطوات مقصود بالكامل، وأي تبديل فيه يفتح باب التحصيل المزدوج:
--
--   ١) **الحدث أولاً**: `insert ... on conflict (provider, event_id) do nothing`.
--      لم يُدرَج ⇒ الحدث معالَج سلفاً ⇒ نتيجة `already_processed` بلا أي أثر.
--      وإدراج Postgres المضاربي ينتظر حسم المعاملة المتزامنة، فالنسخة الثانية
--      من webhook متوازٍ تنتظر ثم ترى التعارض ولا تعمل شيئاً.
--   ٢) **قفل الجلسة** `for update`: حدثان مختلفا المعرّف لنفس الجلسة يُسلسَلان،
--      والثاني يجد الحالة `succeeded` فينصرف.
--   ٣) **مطابقة المبلغ** مع الجلسة — لا مع أي رقم من الطلب.
--   ٤) **صف `payments` معتمداً** ⇒ مُشغّل المرحلة ٧ يقيّد التحصيل مرة واحدة.
--   ٥) **الحجز إلى مؤكَّد** بقفزتين مشروعتين عبر الحارس القائم.
--
-- مخالفة المبلغ تُرمى استثناءً لا تُسجَّل: هي حالة تلاعب أو خلل جسيم، والمطلوب
-- ٤٠٠ بلا أي أثر — بما في ذلك عدم تثبيت الحدث، حتى لا يبتلع الفهرسُ الفريد
-- إعادةَ الإرسال بعد إصلاح الخلل.
--
-- المزوّد المعطَّل **يُسوّي مع ذلك**: من عطّل بوابة بعد أن بدأ عميل الدفع عليها
-- لا يجوز أن يبتلع ماله. التعطيل يمنع البدء (القسم ٣) لا التسوية.
-- ----------------------------------------------------------------------------
create or replace function public.settle_payment_intent(
  p_provider     text,
  p_event_id     text,
  p_ref          text,
  p_status       text,
  p_amount_minor integer,
  p_payload      jsonb
)
returns table (
  outcome        text,
  intent_id      uuid,
  booking_id     uuid,
  payment_id     uuid,
  intent_status  text,
  booking_status text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_provider  text;
  v_event     text;
  v_ref       text;
  v_status    text;
  v_payload   jsonb;
  v_prov      record;
  v_intent    record;
  v_booking   record;
  -- علم مستقل لا `v_intent.id is null`: قراءة حقل من سجل لم يُسنَد إليه شيء
  -- ترمي في PL/pgSQL، ومسار «مرجع مفقود» لا يمر على أي `select into` أصلاً.
  v_has       boolean := false;
  v_event_row uuid;
  v_account   uuid;
  v_amount    numeric;
  v_reason    text;
  v_note      text;
  v_out       text;
  v_o_intent  uuid;
  v_o_booking uuid;
  v_o_payment uuid;
  v_o_istat   text;
  v_o_bstat   text;
begin
  v_provider := lower(nullif(btrim(coalesce(p_provider, '')), ''));
  v_event    := nullif(btrim(coalesce(p_event_id, '')), '');
  v_ref      := nullif(btrim(coalesce(p_ref, '')), '');
  v_status   := lower(nullif(btrim(coalesce(p_status, '')), ''));
  v_payload  := coalesce(p_payload, '{}'::jsonb);

  if v_provider is null then
    raise exception 'اسم المزوّد مطلوب' using hint = 'invalid-input';
  end if;

  -- بلا معرّف حدث لا إحكام أصلاً: قبوله يعني السماح بتحصيل مكرر بلا حارس
  if v_event is null then
    raise exception 'معرّف الحدث مطلوب لضمان عدم تكرار التحصيل'
      using hint = 'event-id-required';
  end if;

  if v_status is null
     or v_status not in ('created', 'pending', 'succeeded', 'failed', 'cancelled', 'expired') then
    raise exception 'حالة الحدث «%» غير معروفة', coalesce(v_status, '')
      using hint = 'invalid-status';
  end if;

  select pp.* into v_prov
  from public.payment_providers pp
  where pp.provider = v_provider;

  if not found then
    raise exception 'المزوّد «%» غير معروف', v_provider using hint = 'provider-unknown';
  end if;

  -- ── (١) الحدث: الإدراج هو الحارس ───────────────────────────────────────
  insert into public.payment_events as ev (
    provider, event_id, event_type, signature_valid, payload
  )
  values (
    v_provider, v_event,
    coalesce(nullif(btrim(coalesce(v_payload ->> 'eventType', '')), ''), v_status),
    true, v_payload
  )
  on conflict (provider, event_id) do nothing
  returning ev.id into v_event_row;

  if v_event_row is null then
    -- إعادة إرسال — لا تحصيل ثانٍ ولا قيد ثانٍ ولا انتقال حالة
    select e.intent_id into v_o_intent
    from public.payment_events e
    where e.provider = v_provider and e.event_id = v_event;

    if v_o_intent is not null then
      select i.booking_id, i.payment_id, i.status
        into v_o_booking, v_o_payment, v_o_istat
      from public.payment_intents i
      where i.id = v_o_intent;

      select b.status into v_o_bstat
      from public.bookings b
      where b.id = v_o_booking;
    end if;

    outcome        := 'already_processed';
    intent_id      := v_o_intent;
    booking_id     := v_o_booking;
    payment_id     := v_o_payment;
    intent_status  := v_o_istat;
    booking_status := v_o_bstat;
    return next;
    return;
  end if;

  -- ── (٢) الجلسة المطابقة للمرجع، بقفل صف ────────────────────────────────
  if v_ref is not null then
    select i.* into v_intent
    from public.payment_intents i
    where i.provider = v_provider
      and i.provider_ref = v_ref
    for update;
    v_has := found;
  end if;

  if not v_has then
    -- حدث بلا جلسة مطابقة: يُحفَظ للتدقيق ولا يُحرّك شيئاً. المسار يسجّله
    -- ويعيد ٢٠٢ حتى لا يظل المزوّد يعيد الإرسال إلى الأبد.
    update public.payment_events e set processed_at = now() where e.id = v_event_row;

    outcome        := 'unmatched';
    intent_id      := null;
    booking_id     := null;
    payment_id     := null;
    intent_status  := null;
    booking_status := null;
    return next;
    return;
  end if;

  update public.payment_events e
     set intent_id = v_intent.id
   where e.id = v_event_row;

  v_o_intent  := v_intent.id;
  v_o_booking := v_intent.booking_id;
  v_o_payment := v_intent.payment_id;
  v_o_istat   := v_intent.status;

  -- ── (٣) النجاح ─────────────────────────────────────────────────────────
  if v_status = 'succeeded' then

    -- 🔒 المبلغ المسوّى يطابق الجلسة، والجلسة قيمتها من الحجز — فالسلسلة كلها
    --    مشدودة إلى `bookings.amount_due` ولا حلقة فيها من المتصفح.
    if p_amount_minor is null or p_amount_minor <> v_intent.amount_minor then
      raise exception
        'قيمة التسوية (%) لا تطابق قيمة الجلسة (% قرش)',
        coalesce(p_amount_minor::text, 'غير محددة'), v_intent.amount_minor
        using hint = 'amount-mismatch';
    end if;

    if v_intent.status = 'succeeded' then
      -- حدث نجاح ثانٍ بمعرّف مختلف لنفس الجلسة (مزوّد يرسل confirm ثم capture)
      select b.status into v_o_bstat from public.bookings b where b.id = v_o_booking;
      update public.payment_events e set processed_at = now() where e.id = v_event_row;

      outcome        := 'already_processed';
      intent_id      := v_o_intent;
      booking_id     := v_o_booking;
      payment_id     := v_o_payment;
      intent_status  := 'succeeded';
      booking_status := v_o_bstat;
      return next;
      return;
    end if;

    -- حساب الخزينة الذي يصب فيه هذا المزوّد، وإلا حساب البوابات الافتراضي
    v_account := v_prov.account_id;
    if v_account is null then
      select pa.id into v_account
      from public.payment_accounts pa
      where pa.kind = 'card' and pa.handle = 'GATEWAY-ONLINE'
      limit 1;
    end if;

    v_amount := public.from_minor_units(v_intent.amount_minor);

    select b.* into v_booking
    from public.bookings b
    where b.id = v_intent.booking_id
    for update;

    if not found then
      raise exception 'حجز الجلسة غير موجود' using hint = 'booking-not-found';
    end if;

    v_note := 'دفع إلكتروني — ' || v_prov.label
              || ' (' || v_provider || '/' || coalesce(v_ref, '—') || ')';

    -- (٤) صف التحصيل معتمداً ⇒ مُشغّل المرحلة ٧ يكتب قيد الدفتر **مرة واحدة**.
    --     لا سطر هنا يلمس `ledger_entries`: مسار المال واحد في المشروع كله.
    insert into public.payments as p (
      booking_id, account_id, amount, status, note, verified_at
    )
    values (
      v_booking.id, v_account, v_amount, 'approved', v_note, now()
    )
    returning p.id into v_o_payment;

    update public.payment_intents i
       set status         = 'succeeded',
           payment_id     = v_o_payment,
           failure_reason = null,
           completed_at   = now()
     where i.id = v_intent.id;

    v_o_istat := 'succeeded';
    v_o_bstat := v_booking.status;

    -- (٥) الحجز إلى «مؤكَّد» عبر الحارس القائم، بقفزتين مشروعتين.
    --     الكتلة الفرعية تحمي المال: لو تعذّر الانتقال لسبب لم نتوقعه فالتحصيل
    --     مُسجَّل والقيد مكتوب، ويبقى الحجز للمعالجة اليدوية — أهون بكثير من
    --     ضياع دفعة وصلت فعلاً.
    begin
      if v_o_bstat = 'pending_payment' then
        perform set_config('tours.booking_note',
          'دفع إلكتروني عبر ' || v_prov.label || ' — بانتظار تأكيد البوابة', true);
        update public.bookings b set status = 'under_review' where b.id = v_booking.id;

        -- الإشعار الوسيط «رفع إيصال التحويل» رسالة كاذبة في مسار البوابة (لا
        -- إيصال هنا أصلاً)، فيُطفأ فور توليده ويبقى إشعار التأكيد وحده.
        update public.notifications n
           set status = 'skipped',
               error  = 'مرحلة وسيطة في مسار الدفع الإلكتروني'
         where n.status = 'queued'
           and n.event  = 'receipt_uploaded'
           and n.payload ->> 'bookingId' = v_booking.id::text;

        v_o_bstat := 'under_review';
      end if;

      if v_o_bstat = 'under_review' then
        perform set_config('tours.booking_note',
          'تأكيد دفع إلكتروني عبر ' || v_prov.label, true);
        update public.bookings b set status = 'confirmed' where b.id = v_booking.id;
        v_o_bstat := 'confirmed';
      end if;
    exception
      when others then
        raise notice '⚠ تعذّر تأكيد الحجز % بعد تحصيل البوابة (%) — التحصيل مسجَّل',
          v_booking.reference, sqlerrm;
        v_o_bstat := v_booking.status;
    end;

    update public.payment_events e set processed_at = now() where e.id = v_event_row;

    -- `settled`  = التحصيل تم والحجز **مؤكَّد الآن** (سواء أكّدته هذه التسوية أم
    --              كان مؤكَّداً بتحويل يدوي سبقها) ⇒ للمسار أن يُطلق البث.
    -- `recorded` = التحصيل تم والحجز ليس مؤكَّداً (ملغى، أو منتهٍ، أو تعذّر
    --              الانتقال) ⇒ المال مقيَّد في الدفتر على كل حال — لا يضيع أبداً —
    --              ويعالجه المشرف بردٍّ عبر `record_refund` إن لزم.
    v_out := case when v_o_bstat = 'confirmed' then 'settled' else 'recorded' end;

    outcome        := v_out;
    intent_id      := v_o_intent;
    booking_id     := v_o_booking;
    payment_id     := v_o_payment;
    intent_status  := v_o_istat;
    booking_status := v_o_bstat;
    return next;
    return;
  end if;

  -- ── (٦) الفشل والإلغاء والانتهاء — الحجز لا يُمس ───────────────────────
  if v_status in ('failed', 'cancelled', 'expired') then
    select b.status into v_o_bstat from public.bookings b where b.id = v_o_booking;

    -- 🔒 جلسة ناجحة لا تُنقَض بحدث لاحق أبداً: حدث فشل متأخر (أو مصطنع) كان
    --    سيُرجع حجزاً مؤكَّداً ومدفوعاً إلى الوراء.
    if v_intent.status = 'succeeded' then
      update public.payment_events e set processed_at = now() where e.id = v_event_row;

      outcome        := 'ignored';
      intent_id      := v_o_intent;
      booking_id     := v_o_booking;
      payment_id     := v_o_payment;
      intent_status  := 'succeeded';
      booking_status := v_o_bstat;
      return next;
      return;
    end if;

    v_reason := coalesce(
      nullif(btrim(coalesce(v_payload ->> 'failureReason', '')), ''),
      nullif(btrim(coalesce(v_payload ->> 'failure_reason', '')), ''),
      nullif(btrim(coalesce(v_payload ->> 'message', '')), ''),
      v_status
    );

    update public.payment_intents i
       set status         = v_status,
           failure_reason = left(v_reason, 500),
           completed_at   = now()
     where i.id = v_intent.id;

    update public.payment_events e set processed_at = now() where e.id = v_event_row;

    -- الحجز يبقى `pending_payment` فيعيد العميل المحاولة بمزوّد آخر أو بتحويل
    -- يدوي — «الفاشل/المنتهي يحرر الحجز» كما نصّت خارطة الطريق.
    outcome        := 'failed';
    intent_id      := v_o_intent;
    booking_id     := v_o_booking;
    payment_id     := v_o_payment;
    intent_status  := v_status;
    booking_status := v_o_bstat;
    return next;
    return;
  end if;

  -- ── (٧) حدث وسيط (created/pending) — يُسجَّل ولا يغيّر شيئاً ────────────
  select b.status into v_o_bstat from public.bookings b where b.id = v_o_booking;
  update public.payment_events e set processed_at = now() where e.id = v_event_row;

  outcome        := 'ignored';
  intent_id      := v_o_intent;
  booking_id     := v_o_booking;
  payment_id     := v_o_payment;
  intent_status  := v_o_istat;
  booking_status := v_o_bstat;
  return next;
end;
$$;

comment on function public.settle_payment_intent(text, text, text, text, integer, jsonb) is
  'تسوية حدث webhook — محكمة التكرار بتفرد (provider, event_id)، تُنشئ صف تحصيل معتمداً وتؤكد الحجز عبر الحارس القائم.';

-- ----------------------------------------------------------------------------
-- (٦) قارئ صفحة العودة — أضيق نافذة ممكنة
--
-- القاعدة ٢: صفحة العودة **تعرض** ولا تؤكد. ولذلك لا تحتاج — ولا يجوز أن تملك —
-- أكثر من شيئين: حالة الجلسة (لتقول «تم» أو «ما زلنا ننتظر تأكيد البوابة»)
-- وتوكن الحجز (لتحوّل العميل إلى صفحة متابعته).
--
-- ولا تُعيد **أي** شيء من المزوّد: لا الحمولة ولا المرجع ولا المبلغ ولا رابط
-- الدفع. معرّف الجلسة UUID عشوائي لا يعرفه إلا العميل والمزوّد، وهو نفس نموذج
-- الثقة الذي يقوم عليه توكن المتابعة منذ المرحلة ٤.
-- ----------------------------------------------------------------------------
create or replace function public.get_payment_intent_status(p_intent uuid)
returns table (
  status        text,
  booking_token text
)
language sql
stable
security definer
set search_path = ''
as $$
  select i.status, b.public_token
  from public.payment_intents i
  join public.bookings b on b.id = i.booking_id
  where p_intent is not null
    and i.id = p_intent;
$$;

comment on function public.get_payment_intent_status(uuid) is
  'حالة الجلسة وتوكن الحجز فقط — لصفحة العودة. لا حمولة مزوّد ولا مرجع ولا مبلغ.';

-- ----------------------------------------------------------------------------
-- (٧) RLS + الصلاحيات
--
-- خلاصة الوصول في هذه المرحلة:
--   anon          → **صفر مطلق** على الجداول الثلاثة (ولا حتى TRUNCATE)، وصفر
--                    EXECUTE على الدوال الثلاث الكاتبة. نافذته الوحيدة هي
--                    `get_payment_intent_status` بعمودَيها.
--   authenticated → قراءة تحرسها `is_admin()` (شاشة المطابقة)، وتعديل إعدادات
--                    البوابات وحدها. لا إدراج ولا حذف: قائمة المزوّدين مغلقة
--                    بالهجرة، والجلسات والأحداث يكتبها الخادم فقط.
--   service_role  → قراءة + تعديل إعدادات البوابات + تنفيذ الدوال الثلاث
--                    (مسارات /api/payments تعمل بمفتاح الخدمة).
--
-- ولا سياسة إدراج أو تحديث على `payment_intents` و`payment_events` لأي دور:
-- الدوال definer تكتب بهوية مالكها، فغياب السياسة يجعل أي كتابة مباشرة من
-- المتصفح تفشل ولو مُنحت صلاحية سهواً.
-- ----------------------------------------------------------------------------
alter table public.payment_providers enable row level security;
alter table public.payment_intents   enable row level security;
alter table public.payment_events    enable row level security;

revoke all on public.payment_providers from public, anon, authenticated;
revoke all on public.payment_intents   from public, anon, authenticated;
revoke all on public.payment_events    from public, anon, authenticated;

grant select, update on public.payment_providers to authenticated;
grant select         on public.payment_intents   to authenticated;
grant select         on public.payment_events    to authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant select, update on public.payment_providers to service_role';
    execute 'grant select on public.payment_intents to service_role';
    execute 'grant select on public.payment_events to service_role';
  end if;
end;
$$;

drop policy if exists "payment_providers_select_admin" on public.payment_providers;
create policy "payment_providers_select_admin"
  on public.payment_providers for select to authenticated using (public.is_admin());

drop policy if exists "payment_providers_update_admin" on public.payment_providers;
create policy "payment_providers_update_admin"
  on public.payment_providers for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "payment_intents_select_admin" on public.payment_intents;
create policy "payment_intents_select_admin"
  on public.payment_intents for select to authenticated using (public.is_admin());

drop policy if exists "payment_events_select_admin" on public.payment_events;
create policy "payment_events_select_admin"
  on public.payment_events for select to authenticated using (public.is_admin());

-- (٧-ب) صلاحيات الدوال — السحب من الثلاثة ثم المنح الصريح
-- (`create or replace` لا يعيد ضبط الصلاحيات، والدالة الجديدة تولد مفتوحة)

-- دالتا التحويل داخليتان بحتتان: لا تُستدعيان إلا من دوال هذا الملف (وهي تعمل
-- بهوية مالكها فلا تحتاج منحاً)، ولا معنى لكشفهما ولو لمفتاح الخدمة — المبلغ
-- لا يُحسب خارج القاعدة أصلاً.
revoke all on function public.to_minor_units(numeric)  from public, anon, authenticated;
revoke all on function public.from_minor_units(bigint) from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'revoke all on function public.to_minor_units(numeric) from service_role';
    execute 'revoke all on function public.from_minor_units(bigint) from service_role';
  end if;
end;
$$;

-- الدوال الثلاث الكاتبة: مفتاح الخدمة وحده. لا المتصفح ولا حتى المشرف المسجَّل
-- (اللوحة لا تُنشئ جلسات دفع؛ ولو احتاجت يوماً فعبر مسار خادم لا عبر RPC).
revoke all on function public.create_payment_intent(uuid, text, integer, text)
  from public, anon, authenticated;
revoke all on function public.attach_intent_ref(uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.settle_payment_intent(text, text, text, text, integer, jsonb)
  from public, anon, authenticated;

-- النافذة الوحيدة للمتصفح — عمودان لا ثالث لهما
revoke all    on function public.get_payment_intent_status(uuid) from public, anon, authenticated;
grant execute on function public.get_payment_intent_status(uuid) to anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.create_payment_intent(uuid, text, integer, text) to service_role';
    execute 'grant execute on function public.attach_intent_ref(uuid, text, text) to service_role';
    execute 'grant execute on function public.settle_payment_intent(text, text, text, text, integer, jsonb) to service_role';
    execute 'grant execute on function public.get_payment_intent_status(uuid) to service_role';
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- (٨) البذرة — حساب خزينة البوابات + صفوف المزوّدين السبعة
--
-- (٨-١) حساب البوابات: خزينة داخلية `customer_facing = false` فلا يظهر أبداً في
-- قائمة التحويل اليدوي (فحص 0015 في `available_payment_accounts`)، ومع ذلك
-- يدخل الأرصدة والتدفق النقدي كأي حساب — فيتحقق شرط خارطة الطريق «كل عملية
-- إلكترونية قيد تلقائي في الخزينة».
-- ----------------------------------------------------------------------------
insert into public.payment_accounts
  (kind, label, handle, holder_name, opening_balance, active, sort, customer_facing)
select 'card', 'بوابات الدفع الإلكتروني', 'GATEWAY-ONLINE', null, 0, true, 500, false
where not exists (
  select 1 from public.payment_accounts pa
  where pa.kind = 'card' and pa.handle = 'GATEWAY-ONLINE'
);

-- (٨-٢) المزوّدون السبعة — القيم مطابقة حرفياً لـ DEFAULT_PROVIDERS في العقد.
--
-- ⚠ مزوّد `test` مفعّل ابتداءً كما ينص العقد: بلا حساب بوابة حقيقي هو الطريق
--   الوحيد لاختبار السلسلة كاملة اليوم. **يجب تعطيله من اللوحة قبل الإطلاق**،
--   ومحوّله ملزم برفض العمل ما لم يكن سرّ توقيعه حاضراً في البيئة.
--
-- `on conflict do nothing`: إعادة التنفيذ لا تُلغي أي تفعيل أو ترتيب من اللوحة.
insert into public.payment_providers (provider, enabled, sort, label, sandbox, public_config, account_id)
select x.provider, x.enabled, x.sort, x.label, x.sandbox, '{}'::jsonb,
       (select pa.id from public.payment_accounts pa
         where pa.kind = 'card' and pa.handle = 'GATEWAY-ONLINE' limit 1)
from (values
  ('test',        true,  0, 'بطاقة تجريبية (اختبار)', true),
  ('paymob',      false, 1, 'بطاقة بنكية',            true),
  ('stripe',      false, 2, 'Stripe',                 true),
  ('paypal',      false, 3, 'PayPal',                 true),
  ('twocheckout', false, 4, '2Checkout',              true),
  ('binancepay',  false, 5, 'Binance Pay',            true),
  ('nowpayments', false, 6, 'NOWPayments',            true)
) as x(provider, enabled, sort, label, sandbox)
on conflict (provider) do nothing;

-- صفوف مزوّدين قديمة بلا حساب خزينة (قاعدة نُفِّذت فيها نسخة أسبق) تُربط الآن
update public.payment_providers pp
   set account_id = (select pa.id from public.payment_accounts pa
                      where pa.kind = 'card' and pa.handle = 'GATEWAY-ONLINE' limit 1)
 where pp.account_id is null;

-- ----------------------------------------------------------------------------
-- (٩) فحص ذاتي بعد التنفيذ — شروط إغلاق المرحلة
-- ----------------------------------------------------------------------------
do $$
declare
  v_missing text;
  v_leak    text;
  v_count   integer;
begin
  -- (٩-١) الجداول والدوال موجودة
  select string_agg(x.rel, '، ')
    into v_missing
  from (values
    ('public.payment_providers'), ('public.payment_intents'), ('public.payment_events')
  ) as x(rel)
  where to_regclass(x.rel) is null;

  if v_missing is not null then
    raise exception '0020: جداول ناقصة بعد التنفيذ: %', v_missing;
  end if;

  select string_agg(x.sig, '، ')
    into v_missing
  from (values
    ('public.create_payment_intent(uuid, text, integer, text)'),
    ('public.attach_intent_ref(uuid, text, text)'),
    ('public.settle_payment_intent(text, text, text, text, integer, jsonb)'),
    ('public.get_payment_intent_status(uuid)'),
    ('public.to_minor_units(numeric)'),
    ('public.from_minor_units(bigint)')
  ) as x(sig)
  where to_regprocedure(x.sig) is null;

  if v_missing is not null then
    raise exception '0020: دوال ناقصة بعد التنفيذ: %', v_missing;
  end if;

  -- (٩-٢) 🔒 فهرس الإحكام — بدونه يتضاعف التحصيل عند إعادة إرسال الحدث
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and tablename  = 'payment_events'
      and indexname  = 'payment_events_provider_event_key'
  ) then
    raise exception '0020: فهرس (provider, event_id) الفريد غير موجود — لا تُغلق المرحلة بدونه';
  end if;

  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and tablename  = 'payment_intents'
      and indexname  = 'payment_intents_provider_ref_key'
  ) then
    raise exception '0020: فهرس مرجع المزوّد الفريد غير موجود';
  end if;

  -- (٩-٣) 🔒 القفزتان اللتان تعتمد عليهما التسوية ما زالتا مشروعتين، والقفزة
  --       المباشرة ما زالت ممنوعة (وإلا صار تأكيد حجز بلا تحصيل ممكناً)
  if not public.booking_transition_allowed('pending_payment', 'under_review')
     or not public.booking_transition_allowed('under_review', 'confirmed') then
    raise exception '0020: جدول الانتقالات تغيّر — مسار تأكيد الدفع الإلكتروني مكسور';
  end if;

  if public.booking_transition_allowed('pending_payment', 'confirmed') then
    raise exception '0020: صارت القفزة pending_payment → confirmed مسموحة — تأكيد بلا تحصيل';
  end if;

  -- (٩-٤) لا صلاحية واحدة لـ anon على أي جدول من الثلاثة
  if exists (select 1 from pg_roles where rolname = 'anon') then
    select string_agg(distinct t.rel, '، ')
      into v_leak
    from (values
      ('public.payment_providers'), ('public.payment_intents'), ('public.payment_events')
    ) as t(rel)
    cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE')) as p(priv)
    where has_table_privilege('anon', t.rel, p.priv);

    if v_leak is not null then
      raise exception '0020: anon يملك صلاحيات على جداول الدفع: %', v_leak;
    end if;

    select string_agg(distinct f.sig, '، ')
      into v_leak
    from (values
      ('public.create_payment_intent(uuid, text, integer, text)'),
      ('public.attach_intent_ref(uuid, text, text)'),
      ('public.settle_payment_intent(text, text, text, text, integer, jsonb)'),
      ('public.to_minor_units(numeric)'),
      ('public.from_minor_units(bigint)')
    ) as f(sig)
    where has_function_privilege('anon', f.sig, 'EXECUTE')
       or has_function_privilege('authenticated', f.sig, 'EXECUTE');

    if v_leak is not null then
      raise exception '0020: دوال الدفع الكاتبة مكشوفة للمتصفح: %', v_leak;
    end if;

    -- والنافذة الوحيدة يجب أن تبقى مفتوحة، وإلا عطبت صفحة العودة
    if not has_function_privilege('anon', 'public.get_payment_intent_status(uuid)', 'EXECUTE') then
      raise exception '0020: صفحة العودة بلا قارئ — get_payment_intent_status محجوبة عن anon';
    end if;
  end if;

  -- (٩-٥) لا إدراج ولا حذف على الجلسات والأحداث لأي دور مستخدم
  if exists (select 1 from pg_roles where rolname = 'authenticated')
     and (has_table_privilege('authenticated', 'public.payment_intents', 'INSERT')
       or has_table_privilege('authenticated', 'public.payment_intents', 'UPDATE')
       or has_table_privilege('authenticated', 'public.payment_intents', 'DELETE')
       or has_table_privilege('authenticated', 'public.payment_events', 'INSERT')
       or has_table_privilege('authenticated', 'public.payment_events', 'UPDATE')
       or has_table_privilege('authenticated', 'public.payment_events', 'DELETE')) then
    raise exception '0020: للمسجَّل صلاحية كتابة على جلسات أو أحداث الدفع';
  end if;

  -- (٩-٦) المزوّدون السبعة مبذورون
  select count(*) into v_count from public.payment_providers;
  if v_count < 7 then
    raise exception '0020: عدد المزوّدين % — المتوقع سبعة كما في DEFAULT_PROVIDERS', v_count;
  end if;

  if not exists (
    select 1 from public.payment_accounts pa
    where pa.kind = 'card' and pa.handle = 'GATEWAY-ONLINE' and not pa.customer_facing
  ) then
    raise exception '0020: حساب خزينة البوابات مفقود أو صار معروضاً للعملاء';
  end if;

  raise notice '✔ 0020_payments: الجداول الثلاثة + الإحكام على (provider, event_id) + التسوية عبر مسار الدفتر القائم';
end;
$$;
