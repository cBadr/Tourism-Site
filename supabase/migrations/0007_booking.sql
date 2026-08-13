-- ============================================================================
-- 0007_booking.sql — الحجز والدفع المحلي والإشعارات
--                    الجداول الستة + آلة الحالات المحروسة + دوال الحجز
--                    + دلو الإيصالات الخاص + بذرة إعدادات الدفع والإشعارات
--
-- المرحلة ٤: كل رقم مالي وكل انتقال حالة يقع هنا داخل Postgres — الواجهة تعرض فقط.
-- العقد المرجعي للأنواع والتواقيع: lib/booking-types.ts — لا انحراف عنه.
--
-- المبدأ الأمني الحاكم: **السعر لا يُؤخذ من العميل أبداً.** دالة create_booking
-- تعيد حساب السعر عبر public.quote_price (هجرة 0005) وترفض أي فئة ليست ضمن
-- العروض المؤهلة لعدد الركاب — هذا هو فحص مكافحة التلاعب.
--
-- يُنفَّذ بعد 0001 (is_admin / touch_updated_at) و0005 (quote_price / pricing_settings).
-- آمن لإعادة التنفيذ (idempotent).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (١) مولّد بايتات عشوائية آمنة — أساس التوكن والمرجع
--
-- gen_random_bytes تأتي من امتداد pgcrypto، وموضعه يختلف بين القواعد
-- (Supabase يضعه في مخطط extensions، وقواعد أخرى في public). لأن كل دوالنا
-- مثبَّتة على search_path فارغ فلا يمكن ترك الاسم بلا مخطط؛ لذلك نحدد موضع
-- الامتداد مرة واحدة هنا ونغلّفه في دالة واحدة يستدعيها الباقي.
--
-- نُنشئ أولاً نسخة احتياطية لا تحتاج أي امتداد (بايتات من gen_random_uuid وهي
-- عشوائية تماماً في النسخة ٤)، ثم نستبدلها بنسخة pgcrypto إن كان متاحاً.
-- ----------------------------------------------------------------------------
create or replace function public.secure_random_bytes(p_len integer)
returns bytea
language sql
volatile
set search_path = ''
as $$
  select substring(
           decode(string_agg(replace(gen_random_uuid()::text, '-', ''), ''), 'hex')
           from 1 for greatest(coalesce(p_len, 16), 1)
         )
  from generate_series(1, (greatest(coalesce(p_len, 16), 1) + 15) / 16);
$$;

do $$
declare
  v_schema text;
begin
  select n.nspname
    into v_schema
  from pg_extension e
  join pg_namespace n on n.oid = e.extnamespace
  where e.extname = 'pgcrypto';

  if v_schema is null then
    begin
      if exists (select 1 from pg_namespace where nspname = 'extensions') then
        execute 'create extension if not exists pgcrypto with schema extensions';
      else
        execute 'create extension if not exists pgcrypto';
      end if;

      select n.nspname
        into v_schema
      from pg_extension e
      join pg_namespace n on n.oid = e.extnamespace
      where e.extname = 'pgcrypto';
    exception
      when others then
        -- لا صلاحية لتركيب الامتداد: النسخة الاحتياطية أعلاه تكفي وتبقى كما هي
        v_schema := null;
    end;
  end if;

  if v_schema is not null then
    execute format(
      'create or replace function public.secure_random_bytes(p_len integer) '
      'returns bytea language sql volatile set search_path = '''' as '
      '$b$ select %I.gen_random_bytes(greatest(coalesce(p_len, 16), 1)) $b$',
      v_schema
    );
    raise notice 'pgcrypto في المخطط «%» — تُستخدم gen_random_bytes', v_schema;
  else
    raise notice 'pgcrypto غير متاح — النسخة الاحتياطية المبنية على gen_random_uuid مفعّلة';
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- (٢) الجداول الستة
-- التسمية snake_case مطابقة لحقول camelCase في lib/booking-types.ts حرفياً.
-- ----------------------------------------------------------------------------

-- (٢-١) الحجوزات — لقطة السعر والرحلة محفوظة داخل الصف فلا يغيّرها تعديل لاحق
--       للتعريفة. status محروس بجدول انتقالات (القسم ٤) لا بالتطبيق.
--       public_token: ٤٨ محرفاً ست عشرياً (٢٤ بايت عشوائي) — رابط المتابعة للضيف.
create table if not exists public.bookings (
  id               uuid primary key default gen_random_uuid(),
  reference        text unique not null,
  public_token     text unique not null,
  status           text not null default 'pending_payment'
                   check (status in ('pending_payment', 'under_review', 'confirmed',
                                     'assigned', 'completed', 'cancelled')),
  class_slug       text not null,
  class_title      text not null,
  total            numeric(12,2) not null check (total >= 0),
  currency         text not null default 'EGP',
  plan             text not null default 'full' check (plan in ('full', 'deposit')),
  amount_due       numeric(12,2) not null check (amount_due >= 0),
  amount_remaining numeric(12,2) not null default 0 check (amount_remaining >= 0),
  customer_name    text not null,
  customer_phone   text not null,
  customer_whatsapp text,
  trip             jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

drop trigger if exists bookings_touch_updated_at on public.bookings;
create trigger bookings_touch_updated_at
  before update on public.bookings
  for each row execute function public.touch_updated_at();

-- مسار قراءة اللوحة الأساسي: طابور الحالة مرتباً بالأحدث
create index if not exists bookings_status_created_at_idx
  on public.bookings (status, created_at desc);

create index if not exists bookings_created_at_idx
  on public.bookings (created_at desc);

-- (٢-٢) سجل الأحداث — تاريخ الحالات، يُكتب حصراً عبر مُشغّل (trigger) القسم ٤
--       فلا يمكن أن يتم انتقال بلا سطر في السجل مهما كان مسار التعديل.
--       actor بلا مفتاح أجنبي عمداً: السجل تدقيقي ويجب أن يبقى بعد حذف المستخدم.
create table if not exists public.booking_events (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid not null references public.bookings(id) on delete cascade,
  from_status text,
  to_status   text not null,
  note        text,
  actor       uuid,
  created_at  timestamptz not null default now()
);

create index if not exists booking_events_booking_id_created_at_idx
  on public.booking_events (booking_id, created_at);

-- (٢-٣) حسابات استقبال المدفوعات — محافظ وانستا باي، تُدار من اللوحة
--       daily_cap / monthly_cap: null = بلا حد (الرؤية — بوابات الدفع المحلية)
--       opening_balance يخدم الخزينة في المرحلة ٧ ولا يدخل في حساب الحدود هنا.
create table if not exists public.payment_accounts (
  id              uuid primary key default gen_random_uuid(),
  kind            text not null check (kind in ('wallet', 'instapay')),
  label           text not null,
  handle          text not null,
  holder_name     text,
  opening_balance numeric(12,2) not null default 0,
  daily_cap       numeric(12,2) check (daily_cap >= 0),
  monthly_cap     numeric(12,2) check (monthly_cap >= 0),
  active          boolean not null default true,
  sort            integer not null default 0,
  created_at      timestamptz not null default now()
);

create index if not exists payment_accounts_active_sort_idx
  on public.payment_accounts (active, sort);

-- (٢-٤) المدفوعات — إيصال تحويل واحد لكل محاولة دفع
--       receipt_path: مسار الملف داخل دلو receipts الخاص (ليس رابطاً عاماً أبداً)
--       account_id قابل للتفريغ: حذف حساب استقبال لا يجوز أن يمحو تاريخ التحصيل.
create table if not exists public.payments (
  id           uuid primary key default gen_random_uuid(),
  booking_id   uuid not null references public.bookings(id) on delete cascade,
  account_id   uuid references public.payment_accounts(id) on delete set null,
  amount       numeric(12,2) not null check (amount >= 0),
  receipt_path text,
  status       text not null default 'pending'
               check (status in ('pending', 'approved', 'rejected')),
  note         text,
  verified_by  uuid,
  verified_at  timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists payments_booking_id_created_at_idx
  on public.payments (booking_id, created_at desc);

-- فهرس فحص الحدود اليومية/الشهرية (القسم ٥ — available_payment_accounts)
create index if not exists payments_account_status_created_at_idx
  on public.payments (account_id, status, created_at);

-- (٢-٥) طلبات عروض الأسعار — الجولات والمناسبات وما هو خارج التسعير الفوري
create table if not exists public.quote_requests (
  id             uuid primary key default gen_random_uuid(),
  reference      text unique not null,
  service_slug   text,
  customer_name  text not null,
  customer_phone text not null,
  details        text not null default '',
  status         text not null default 'new'
                 check (status in ('new', 'contacted', 'converted', 'closed')),
  created_at     timestamptz not null default now()
);

create index if not exists quote_requests_status_created_at_idx
  on public.quote_requests (status, created_at desc);

-- (٢-٦) طابور الإشعارات (نمط Outbox — قرار ٦ في ROADMAP)
--       الصف يُكتب داخل نفس معاملة تغيير الحالة فلا يضيع إشعار أبداً،
--       وعامل الإرسال (route handler) يقرأ queued ويحدّث الحالة.
--       channels تُحسم لحظة الإدراج من إعدادات مفتاح notifications.
create table if not exists public.notifications (
  id           uuid primary key default gen_random_uuid(),
  event        text not null,
  payload      jsonb not null default '{}'::jsonb,
  channels     text[] not null default array['dashboard']::text[],
  status       text not null default 'queued'
               check (status in ('queued', 'sent', 'skipped', 'failed')),
  attempts     integer not null default 0,
  error        text,
  created_at   timestamptz not null default now(),
  delivered_at timestamptz
);

-- مسار قراءة العامل: أقدم المعلّقة أولاً
create index if not exists notifications_status_created_at_idx
  on public.notifications (status, created_at);

-- ----------------------------------------------------------------------------
-- (٣) توليد المرجع والتوكن
--
-- reference: رقم قصير يقرؤه العميل على الهاتف (TR-XXXXXX) — **ليس سرّاً**،
--            أبجديته بلا 0/1/O/I/L تفادياً للّبس عند الإملاء الصوتي.
-- public_token: السر الحقيقي — ٢٤ بايتاً عشوائياً (١٩٢ بت) بصيغة hex.
--
-- المولّدان security definer لأنهما يفحصان التفرد على جدولين محجوبين بـ RLS
-- عن anon؛ بدون ذلك يرى المولّد صفر صفوف دائماً فيظن كل مرشح فريداً.
-- ----------------------------------------------------------------------------
create or replace function public.random_ref_code(p_len integer default 6)
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_alphabet constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  v_len      integer := greatest(coalesce(p_len, 6), 4);
  v_bytes    bytea;
  v_out      text := '';
  v_i        integer;
begin
  v_bytes := public.secure_random_bytes(v_len);
  for v_i in 0 .. v_len - 1 loop
    v_out := v_out || substr(v_alphabet, (get_byte(v_bytes, v_i) % length(v_alphabet)) + 1, 1);
  end loop;
  return v_out;
end;
$$;

create or replace function public.new_public_token()
returns text
language sql
volatile
set search_path = ''
as $$
  select encode(public.secure_random_bytes(24), 'hex');
$$;

create or replace function public.next_booking_reference()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_candidate text;
  v_i         integer;
begin
  for v_i in 1 .. 25 loop
    v_candidate := 'TR-' || public.random_ref_code(6);
    if not exists (select 1 from public.bookings b where b.reference = v_candidate) then
      return v_candidate;
    end if;
  end loop;
  -- تعذّر إيجاد مرشح قصير فريد بعد ٢٥ محاولة: نطيل الرمز بدل الفشل
  return 'TR-' || public.random_ref_code(10);
end;
$$;

create or replace function public.next_quote_reference()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_candidate text;
  v_i         integer;
begin
  for v_i in 1 .. 25 loop
    v_candidate := 'RQ-' || public.random_ref_code(6);
    if not exists (select 1 from public.quote_requests q where q.reference = v_candidate) then
      return v_candidate;
    end if;
  end loop;
  return 'RQ-' || public.random_ref_code(10);
end;
$$;

-- المعرّفات تُملأ بمُشغّل لا بقيمة افتراضية: تعمل أياً كان مسار الإدراج،
-- وإعادة المحاولة عند التصادم النادر تولّد قيماً جديدة تلقائياً.
create or replace function public.assign_booking_identifiers()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if new.reference is null or btrim(new.reference) = '' then
    new.reference := public.next_booking_reference();
  end if;
  if new.public_token is null or length(new.public_token) < 32 then
    new.public_token := public.new_public_token();
  end if;
  return new;
end;
$$;

drop trigger if exists bookings_assign_identifiers on public.bookings;
create trigger bookings_assign_identifiers
  before insert on public.bookings
  for each row execute function public.assign_booking_identifiers();

create or replace function public.assign_quote_reference()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if new.reference is null or btrim(new.reference) = '' then
    new.reference := public.next_quote_reference();
  end if;
  return new;
end;
$$;

drop trigger if exists quote_requests_assign_reference on public.quote_requests;
create trigger quote_requests_assign_reference
  before insert on public.quote_requests
  for each row execute function public.assign_quote_reference();

-- ----------------------------------------------------------------------------
-- (٤) آلة الحالات + السجل + طابور الإشعارات
--
-- جدول الانتقالات المسموحة (القاعدة الوحيدة، لا نسخة منها في TypeScript):
--   pending_payment → under_review | cancelled
--   under_review    → confirmed | pending_payment | cancelled
--   confirmed       → assigned | completed | cancelled
--   assigned        → completed | cancelled
--   completed       → (نهائية)
--   cancelled       → (نهائية)
--
-- الحراسة مُشغّل على الجدول لا شرطاً داخل الدوال: حتى UPDATE مباشر من اللوحة
-- أو من SQL Editor لا يستطيع كسر دورة الحياة.
-- ----------------------------------------------------------------------------
create or replace function public.booking_transition_allowed(p_from text, p_to text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select exists (
    select 1
    from (values
      ('pending_payment', 'under_review'),
      ('pending_payment', 'cancelled'),
      ('under_review',    'confirmed'),
      ('under_review',    'pending_payment'),
      ('under_review',    'cancelled'),
      ('confirmed',       'assigned'),
      ('confirmed',       'completed'),
      ('confirmed',       'cancelled'),
      ('assigned',        'completed'),
      ('assigned',        'cancelled')
    ) as t(from_status, to_status)
    where t.from_status = p_from
      and t.to_status   = p_to
  );
$$;

-- هوية المنفّذ — auth.uid() قد ترمي إن كانت مطالبة الجلسة مشوّهة، والحجز
-- أهم من تسجيل الفاعل، فنبتلع الخطأ ونسجّل null.
create or replace function public.current_actor()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return auth.uid();
exception
  when others then
    return null;
end;
$$;

-- قنوات الإرسال المفعّلة الآن — الجرس دائماً، والباقي مشروط بوجود بيانات اعتماد
-- (بلا chat id أو بريد لا معنى لإدراج القناة أصلاً).
create or replace function public.notification_channels()
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select array_remove(array[
    'dashboard',
    case when v.value -> 'telegramEnabled' = 'true'::jsonb
          and btrim(coalesce(v.value ->> 'telegramChatId', '')) <> ''
         then 'telegram' end,
    case when v.value -> 'emailEnabled' = 'true'::jsonb
          and btrim(coalesce(v.value ->> 'emailTo', '')) <> ''
         then 'email' end
  ], null)
  from (
    select coalesce(
             (select s.value from public.site_settings s where s.key = 'notifications'),
             '{}'::jsonb
           ) as value
  ) v;
$$;

create or replace function public.queue_notification(p_event text, p_payload jsonb)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.notifications as n (event, payload, channels, status)
  values (p_event, coalesce(p_payload, '{}'::jsonb), public.notification_channels(), 'queued')
  returning n.id into v_id;
  return v_id;
end;
$$;

create or replace function public.guard_booking_status()
returns trigger
language plpgsql
volatile
set search_path = ''
as $$
begin
  if new.status is distinct from old.status
     and not public.booking_transition_allowed(old.status, new.status) then
    raise exception 'انتقال حالة غير مسموح: «%» ← «%» (الحجز %)',
      old.status, new.status, old.reference
      using hint = 'illegal-transition';
  end if;
  return new;
end;
$$;

drop trigger if exists bookings_guard_status on public.bookings;
create trigger bookings_guard_status
  before update on public.bookings
  for each row execute function public.guard_booking_status();

-- السجل والإشعار في مُشغّل واحد: مصدر واحد للحقيقة مهما تعدّدت مسارات التعديل.
-- الملاحظة تصل عبر متغيّر جلسة محلي للمعاملة (tours.booking_note) تضبطه الدوال
-- قبل التحديث، وتُستهلك مرة واحدة حتى لا تتسرب إلى انتقال لاحق في نفس المعاملة.
--
-- أحداث الإشعار مقصورة على اتحاد NotificationEvent في lib/booking-types.ts:
-- الانتقال إلى assigned/completed/pending_payment يُسجَّل في booking_events
-- ولا يُنتج إشعاراً (لا حدث له في العقد — التشغيل هو من نفّذه أصلاً).
create or replace function public.log_booking_change()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_from  text;
  v_note  text;
  v_event text;
begin
  v_note := nullif(btrim(coalesce(current_setting('tours.booking_note', true), '')), '');
  perform set_config('tours.booking_note', '', true);

  if tg_op = 'INSERT' then
    v_from  := null;
    v_event := 'booking_created';
  else
    v_from  := old.status;
    v_event := case new.status
                 when 'under_review' then 'receipt_uploaded'
                 when 'confirmed'    then 'booking_confirmed'
                 when 'cancelled'    then 'booking_cancelled'
                 else null
               end;
  end if;

  insert into public.booking_events (booking_id, from_status, to_status, note, actor)
  values (new.id, v_from, new.status, v_note, public.current_actor());

  if v_event is not null then
    perform public.queue_notification(
      v_event,
      jsonb_build_object(
        'bookingId',       new.id,
        'reference',       new.reference,
        'publicToken',     new.public_token,
        'status',          new.status,
        'previousStatus',  v_from,
        'classSlug',       new.class_slug,
        'classTitle',      new.class_title,
        'total',           new.total,
        'currency',        new.currency,
        'plan',            new.plan,
        'amountDue',       new.amount_due,
        'amountRemaining', new.amount_remaining,
        'customerName',    new.customer_name,
        'customerPhone',   new.customer_phone,
        'customerWhatsapp', new.customer_whatsapp,
        'trip',            new.trip,
        'note',            v_note,
        'createdAt',       new.created_at
      )
    );
  end if;

  return null;
end;
$$;

drop trigger if exists bookings_log_insert on public.bookings;
create trigger bookings_log_insert
  after insert on public.bookings
  for each row execute function public.log_booking_change();

drop trigger if exists bookings_log_status_change on public.bookings;
create trigger bookings_log_status_change
  after update on public.bookings
  for each row
  when (old.status is distinct from new.status)
  execute function public.log_booking_change();

create or replace function public.log_quote_request()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform public.queue_notification(
    'quote_requested',
    jsonb_build_object(
      'quoteRequestId', new.id,
      'reference',      new.reference,
      'serviceSlug',    new.service_slug,
      'customerName',   new.customer_name,
      'customerPhone',  new.customer_phone,
      'details',        new.details,
      'status',         new.status,
      'createdAt',      new.created_at
    )
  );
  return null;
end;
$$;

drop trigger if exists quote_requests_log_insert on public.quote_requests;
create trigger quote_requests_log_insert
  after insert on public.quote_requests
  for each row execute function public.log_quote_request();

-- ----------------------------------------------------------------------------
-- (٥) الدوال العامة — كل ما تستدعيه الواجهة من مسارات الـ API
-- ----------------------------------------------------------------------------

-- قراءة رقم من JSONB بلا خطر انفجار: إعداد مكتوب خطأً من اللوحة يجب ألّا يُسقط
-- إنشاء الحجز، بل يرجع للقيمة الافتراضية بهدوء.
create or replace function public.jsonb_number(p_value jsonb, p_key text, p_default numeric)
returns numeric
language plpgsql
immutable
set search_path = ''
as $$
begin
  return coalesce((p_value -> p_key)::numeric, p_default);
exception
  when others then
    return p_default;
end;
$$;

-- (٥-١) إنشاء الحجز — نقطة مكافحة التلاعب الوحيدة
--
-- الترتيب: تطهير المدخلات ← إعادة حساب السعر بـ quote_price ← رفض الفئة غير
-- المؤهلة ← احتساب العربون من إعدادات الدفع ← إدراج الحجز (والسجل والإشعار
-- يكتبهما المُشغّل تلقائياً داخل نفس المعاملة).
--
-- security definer لأن الضيف (anon) لا يملك — ولا يجوز أن يملك — INSERT مباشراً
-- على bookings؛ هذه الدالة هي المنفذ الوحيد.
--
-- تحذير للمستدعي: p_distance_km مُدخَل من الخادم لا من المتصفح. مسار /api/booking
-- يجب أن يحسب المسافة بنفسه (lib/geo) ولا يمرّر رقماً وصل من العميل.
create or replace function public.create_booking(
  p_origin            jsonb,
  p_destination       jsonb,
  p_passengers        integer,
  p_round_trip        boolean,
  p_waiting_hours     numeric,
  p_distance_km       numeric,
  p_duration_min      numeric,
  p_distance_source   text,
  p_class_slug        text,
  p_plan              text,
  p_customer_name     text,
  p_customer_phone    text,
  p_customer_whatsapp text,
  p_pickup_at         timestamptz,
  p_notes             text
)
returns table (
  id               uuid,
  reference        text,
  public_token     text,
  total            numeric,
  amount_due       numeric,
  amount_remaining numeric,
  currency         text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_name        text;
  v_phone       text;
  v_whatsapp    text;
  v_plan        text;
  v_slug        text;
  v_passengers  integer;
  v_round_trip  boolean;
  v_waiting     numeric;
  v_distance    numeric;
  v_origin_lbl  text;
  v_origin_lat  numeric;
  v_origin_lng  numeric;
  v_dest_lbl    text;
  v_dest_lat    numeric;
  v_dest_lng    numeric;
  v_offer       record;
  v_currency    text;
  v_pay         jsonb;
  v_percent     numeric;
  v_min         numeric;
  v_due         numeric;
  v_remaining   numeric;
  v_trip        jsonb;
  v_id          uuid;
  v_reference   text;
  v_token       text;
  v_attempt     integer;
begin
  -- (أ) تطهير المدخلات النصية
  v_name     := nullif(btrim(coalesce(p_customer_name, '')), '');
  v_phone    := nullif(btrim(coalesce(p_customer_phone, '')), '');
  v_whatsapp := nullif(btrim(coalesce(p_customer_whatsapp, '')), '');
  v_slug     := nullif(btrim(coalesce(p_class_slug, '')), '');
  v_plan     := lower(nullif(btrim(coalesce(p_plan, '')), ''));

  if v_name is null then
    raise exception 'اسم العميل مطلوب' using hint = 'invalid-input';
  end if;
  if v_phone is null then
    raise exception 'رقم هاتف العميل مطلوب' using hint = 'invalid-input';
  end if;
  if v_slug is null then
    raise exception 'فئة السيارة مطلوبة' using hint = 'invalid-input';
  end if;

  v_plan := coalesce(v_plan, 'full');
  if v_plan not in ('full', 'deposit') then
    raise exception 'خطة الدفع يجب أن تكون full أو deposit' using hint = 'invalid-input';
  end if;

  v_passengers := greatest(coalesce(p_passengers, 1), 1);
  v_round_trip := coalesce(p_round_trip, false);
  v_waiting    := greatest(coalesce(p_waiting_hours, 0), 0);
  v_distance   := coalesce(p_distance_km, 0);

  if v_distance <= 0 or v_distance > 5000 then
    raise exception 'مسافة الرحلة غير منطقية (% كم)', v_distance using hint = 'invalid-input';
  end if;

  v_origin_lbl := nullif(btrim(coalesce(p_origin ->> 'label', '')), '');
  v_dest_lbl   := nullif(btrim(coalesce(p_destination ->> 'label', '')), '');
  v_origin_lat := public.jsonb_number(p_origin, 'lat', null);
  v_origin_lng := public.jsonb_number(p_origin, 'lng', null);
  v_dest_lat   := public.jsonb_number(p_destination, 'lat', null);
  v_dest_lng   := public.jsonb_number(p_destination, 'lng', null);

  if v_origin_lbl is null or v_dest_lbl is null
     or v_origin_lat is null or v_origin_lng is null
     or v_dest_lat is null or v_dest_lng is null then
    raise exception 'نقطتا الانطلاق والوصول غير مكتملتين' using hint = 'invalid-input';
  end if;

  -- (ب) إعادة حساب السعر — المصدر الأوحد هو quote_price، وأي سعر من العميل مُهمَل.
  --     غياب الفئة من العروض المؤهلة = محاولة تلاعب (أو فئة عُطّلت للتو) ← رفض.
  select q.class_slug, q.class_title, q.total
    into v_offer
  from public.quote_price(v_distance, v_passengers, v_round_trip, v_waiting) q
  where q.class_slug = v_slug;

  if not found then
    raise exception 'الفئة «%» غير متاحة لرحلة بـ % راكباً', v_slug, v_passengers
      using hint = 'class-unavailable';
  end if;

  if v_offer.total is null or v_offer.total <= 0 then
    raise exception 'تعذّر احتساب سعر الرحلة' using hint = 'pricing-failed';
  end if;

  -- (ج) العملة من إعدادات التسعير (لا نص ثابت في الكود)
  select ps.currency into v_currency from public.pricing_settings ps limit 1;
  v_currency := coalesce(v_currency, 'EGP');

  -- (د) العربون من مفتاح الإعدادات payment.
  --     القيمتان الاحتياطيتان مطابقتان لـ DEFAULT_PAYMENT_SETTINGS في العقد،
  --     وهما صمام أمان فقط لأن البذرة في القسم ٨ تُنشئ الصف أصلاً.
  select s.value into v_pay from public.site_settings s where s.key = 'payment';
  v_percent := public.jsonb_number(v_pay, 'depositPercent', 30);
  v_min     := public.jsonb_number(v_pay, 'depositMinAmount', 200);

  if v_plan = 'deposit' then
    -- النسبة أو الحد الأدنى أيهما أكبر، وبحد أقصى الإجمالي (لا عربون يفوق السعر)
    v_due := least(v_offer.total, greatest(round(v_offer.total * v_percent / 100), v_min));
    v_due := greatest(v_due, 0);
  else
    v_due := v_offer.total;
  end if;
  v_remaining := greatest(v_offer.total - v_due, 0);

  -- (هـ) لقطة الرحلة — تُحفظ كما هي ولا تتأثر بأي تعديل لاحق للتعريفات
  v_trip := jsonb_build_object(
    'originLabel',    v_origin_lbl,
    'originLat',      v_origin_lat,
    'originLng',      v_origin_lng,
    'destLabel',      v_dest_lbl,
    'destLat',        v_dest_lat,
    'destLng',        v_dest_lng,
    'distanceKm',     v_distance,
    'durationMin',    p_duration_min,
    'distanceSource', coalesce(nullif(btrim(coalesce(p_distance_source, '')), ''), 'estimate'),
    'passengers',     v_passengers,
    'roundTrip',      v_round_trip,
    'waitingHours',   v_waiting,
    'pickupAt',       p_pickup_at,
    'notes',          nullif(btrim(coalesce(p_notes, '')), '')
  );

  -- (و) الإدراج — المرجع والتوكن يولّدهما المُشغّل، وتصادمهما (احتمال ضئيل جداً)
  --     يُعالَج بإعادة المحاولة لا بالفشل.
  perform set_config('tours.booking_note', 'إنشاء الحجز', true);

  for v_attempt in 1 .. 5 loop
    begin
      insert into public.bookings as b (
        status, class_slug, class_title, total, currency, plan,
        amount_due, amount_remaining,
        customer_name, customer_phone, customer_whatsapp, trip
      )
      values (
        'pending_payment', v_offer.class_slug, v_offer.class_title, v_offer.total, v_currency, v_plan,
        v_due, v_remaining,
        v_name, v_phone, v_whatsapp, v_trip
      )
      returning b.id, b.reference, b.public_token
      into v_id, v_reference, v_token;
      exit;
    exception
      when unique_violation then
        if v_attempt >= 5 then
          raise exception 'تعذّر توليد رقم مرجعي فريد للحجز' using hint = 'db-unavailable';
        end if;
        perform set_config('tours.booking_note', 'إنشاء الحجز', true);
    end;
  end loop;

  id               := v_id;
  reference        := v_reference;
  public_token     := v_token;
  total            := v_offer.total;
  amount_due       := v_due;
  amount_remaining := v_remaining;
  currency         := v_currency;
  return next;
end;
$$;

-- (٥-٢) قراءة الحجز بالتوكن — المنفذ الوحيد للضيف
--
-- security definer لأن anon بلا أي SELECT على bookings/payments: لا سياسة
-- «قراءة عامة مشروطة» يمكن أن تتسرب، ولا طريق للوصول إلا بتوكن كامل.
-- الأعمدة الداخلية محجوبة: التوكن نفسه، ومسار الإيصال، وحساب الاستقبال،
-- ومعرّف من تحقّق — لا شيء منها يخص العميل.
create or replace function public.get_booking_by_token(p_token text)
returns table (
  id               uuid,
  reference        text,
  status           text,
  class_slug       text,
  class_title      text,
  total            numeric,
  currency         text,
  plan             text,
  amount_due       numeric,
  amount_remaining numeric,
  customer_name    text,
  customer_phone   text,
  customer_whatsapp text,
  trip             jsonb,
  created_at       timestamptz,
  updated_at       timestamptz,
  payments         jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    b.id,
    b.reference,
    b.status,
    b.class_slug,
    b.class_title,
    b.total,
    b.currency,
    b.plan,
    b.amount_due,
    b.amount_remaining,
    b.customer_name,
    b.customer_phone,
    b.customer_whatsapp,
    b.trip,
    b.created_at,
    b.updated_at,
    coalesce(
      (
        select jsonb_agg(
                 jsonb_build_object(
                   'id',         p.id,
                   'amount',     p.amount,
                   'status',     p.status,
                   'note',       p.note,
                   'createdAt',  p.created_at,
                   'verifiedAt', p.verified_at
                 )
                 order by p.created_at
               )
        from public.payments p
        where p.booking_id = b.id
      ),
      '[]'::jsonb
    )
  from public.bookings b
  where p_token is not null
    and length(p_token) >= 32
    and b.public_token = p_token;
$$;

-- (٥-٣) الحسابات المتاحة للتحويل — الحدود تُفرض هنا لا في الواجهة
--
-- الحساب مُتاح إذا كان مفعّلاً وكان (محصّل اليوم + المبلغ المطلوب) ≤ الحد اليومي
-- و(محصّل الشهر + المبلغ) ≤ الحد الشهري. الحد null = بلا حد.
-- «المحصّل» = مجموع الإيصالات المعتمدة (approved) فقط — الإيصال المعلّق لا يحجز
-- سعة، والمرفوض لا يُحسب إطلاقاً.
-- حدود اليوم/الشهر تُقاس بالتوقيت المحلي للتشغيل (القاهرة) لا بـ UTC، وإلا
-- انقلب اليوم الساعة الثانية فجراً وأربك المحاسبة اليومية.
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
    and (pa.daily_cap   is null or u.used_today + a.amount <= pa.daily_cap)
    and (pa.monthly_cap is null or u.used_month + a.amount <= pa.monthly_cap)
  order by pa.sort asc, pa.label asc;
$$;

-- (٥-٤) إرفاق إيصال التحويل — يستدعيها الضيف من /api/booking/receipt
--
-- security definer ليعمل الضيف بلا حساب. لا يُقبل الرفع إلا والحجز في
-- pending_payment: منع الرفع المكرر على حجز قيد المراجعة أو مؤكد.
-- التوقيع الأربعي هو الأصل، والثنائي (في عقد المرحلة) غلاف عليه.
create or replace function public.attach_receipt(
  p_token      text,
  p_path       text,
  p_account_id uuid,
  p_amount     numeric
)
returns table (
  payment_id uuid,
  reference  text,
  status     text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_booking record;
  v_path    text;
  v_amount  numeric;
  v_payment uuid;
begin
  v_path := nullif(btrim(coalesce(p_path, '')), '');
  if v_path is null then
    raise exception 'مسار الإيصال مطلوب' using hint = 'invalid-input';
  end if;
  if p_token is null or length(p_token) < 32 then
    raise exception 'رابط المتابعة غير صالح' using hint = 'booking-not-found';
  end if;

  select b.* into v_booking
  from public.bookings b
  where b.public_token = p_token
  for update;

  if not found then
    raise exception 'لا يوجد حجز بهذا الرابط' using hint = 'booking-not-found';
  end if;

  if v_booking.status <> 'pending_payment' then
    raise exception 'لا يمكن رفع إيصال والحجز في حالة «%»', v_booking.status
      using hint = 'invalid-status';
  end if;

  v_amount := coalesce(p_amount, v_booking.amount_due);
  if v_amount is null or v_amount <= 0 then
    raise exception 'قيمة التحويل يجب أن تكون أكبر من صفر' using hint = 'invalid-input';
  end if;

  if p_account_id is not null
     and not exists (
       select 1 from public.payment_accounts pa
       where pa.id = p_account_id and pa.active
     ) then
    raise exception 'حساب الاستقبال غير موجود أو غير مفعّل' using hint = 'account-unavailable';
  end if;

  insert into public.payments as p (booking_id, account_id, amount, receipt_path, status)
  values (v_booking.id, p_account_id, v_amount, v_path, 'pending')
  returning p.id into v_payment;

  perform set_config('tours.booking_note', 'رفع إيصال التحويل', true);
  update public.bookings b
     set status = 'under_review'
   where b.id = v_booking.id;

  payment_id := v_payment;
  reference  := v_booking.reference;
  status     := 'under_review';
  return next;
end;
$$;

create or replace function public.attach_receipt(p_token text, p_path text)
returns table (
  payment_id uuid,
  reference  text,
  status     text
)
language sql
volatile
security definer
set search_path = ''
as $$
  select r.payment_id, r.reference, r.status
  from public.attach_receipt(p_token, p_path, null::uuid, null::numeric) r;
$$;

-- (٥-٥) تحقق التشغيل من التحويل — للمشرف حصراً
-- الاعتماد: الإيصال approved والحجز confirmed.
-- الرفض: الإيصال rejected والحجز يعود pending_payment ليعيد العميل المحاولة.
create or replace function public.verify_payment(
  p_booking_id uuid,
  p_approve    boolean,
  p_note       text
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_booking record;
  v_payment record;
  v_note    text;
  v_new     text;
begin
  if not public.is_admin() then
    raise exception 'التحقق من التحويلات متاح للمشرف فقط' using hint = 'forbidden';
  end if;

  v_note := nullif(btrim(coalesce(p_note, '')), '');

  select b.* into v_booking
  from public.bookings b
  where b.id = p_booking_id
  for update;

  if not found then
    raise exception 'الحجز غير موجود' using hint = 'booking-not-found';
  end if;

  if v_booking.status <> 'under_review' then
    raise exception 'التحقق متاح والحجز «قيد المراجعة» فقط (الحالة الآن «%»)', v_booking.status
      using hint = 'invalid-status';
  end if;

  select p.* into v_payment
  from public.payments p
  where p.booking_id = p_booking_id
    and p.status = 'pending'
  order by p.created_at desc, p.id desc
  limit 1
  for update;

  if not found then
    raise exception 'لا يوجد إيصال بانتظار التحقق لهذا الحجز' using hint = 'payment-not-found';
  end if;

  v_new := case when coalesce(p_approve, false) then 'confirmed' else 'pending_payment' end;

  update public.payments p
     set status      = case when v_new = 'confirmed' then 'approved' else 'rejected' end,
         note        = coalesce(v_note, p.note),
         verified_by = public.current_actor(),
         verified_at = now()
   where p.id = v_payment.id;

  perform set_config(
    'tours.booking_note',
    coalesce(v_note, case when v_new = 'confirmed' then 'اعتماد التحويل' else 'رفض التحويل' end),
    true
  );

  update public.bookings b
     set status = v_new
   where b.id = p_booking_id;

  return v_new;
end;
$$;

-- (٥-٦) تغيير الحالة يدوياً من اللوحة — للمشرف حصراً وبحراسة جدول الانتقالات
-- (الحراسة مكررة عمداً: هنا لرسالة واضحة، وفي المُشغّل كسدّ أخير لا يُتجاوَز)
create or replace function public.set_booking_status(
  p_booking_id uuid,
  p_status     text,
  p_note       text
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_booking record;
  v_status  text;
begin
  if not public.is_admin() then
    raise exception 'تغيير حالة الحجز متاح للمشرف فقط' using hint = 'forbidden';
  end if;

  v_status := lower(nullif(btrim(coalesce(p_status, '')), ''));
  if v_status is null then
    raise exception 'الحالة المطلوبة مفقودة' using hint = 'invalid-input';
  end if;

  select b.* into v_booking
  from public.bookings b
  where b.id = p_booking_id
  for update;

  if not found then
    raise exception 'الحجز غير موجود' using hint = 'booking-not-found';
  end if;

  if v_status = v_booking.status then
    return v_status;
  end if;

  if not public.booking_transition_allowed(v_booking.status, v_status) then
    raise exception 'انتقال حالة غير مسموح: «%» ← «%»', v_booking.status, v_status
      using hint = 'illegal-transition';
  end if;

  perform set_config(
    'tours.booking_note',
    coalesce(nullif(btrim(coalesce(p_note, '')), ''), 'تغيير الحالة من اللوحة'),
    true
  );

  update public.bookings b
     set status = v_status
   where b.id = p_booking_id;

  return v_status;
end;
$$;

-- (٥-٧) تسجيل طلب عرض سعر — غلاف definer يتيح للضيف الإدراج **وقراءة المرجع**
-- بلا منحه أي SELECT على الجدول (سياسة الإدراج المباشر متاحة أيضاً، لكن
-- PostgREST يحتاج SELECT لإرجاع الصف، ولن يُمنح — فهذه هي الطريق الموصى بها).
create or replace function public.create_quote_request(
  p_service_slug   text,
  p_customer_name  text,
  p_customer_phone text,
  p_details        text
)
returns table (
  id        uuid,
  reference text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_name    text;
  v_phone   text;
  v_id      uuid;
  v_ref     text;
begin
  v_name  := nullif(btrim(coalesce(p_customer_name, '')), '');
  v_phone := nullif(btrim(coalesce(p_customer_phone, '')), '');

  if v_name is null then
    raise exception 'اسم العميل مطلوب' using hint = 'invalid-input';
  end if;
  if v_phone is null then
    raise exception 'رقم هاتف العميل مطلوب' using hint = 'invalid-input';
  end if;

  insert into public.quote_requests as q (service_slug, customer_name, customer_phone, details)
  values (
    nullif(btrim(coalesce(p_service_slug, '')), ''),
    v_name,
    v_phone,
    btrim(coalesce(p_details, ''))
  )
  returning q.id, q.reference into v_id, v_ref;

  id        := v_id;
  reference := v_ref;
  return next;
end;
$$;

-- (٥-٨) هل يسمح هذا الاسم برفع إيصال؟ — تستدعيها سياسة التخزين في القسم ٧
-- الشرط: أحد مقاطع المسار توكن حجز حقيقي ما زال بانتظار الدفع. هذا يمنع تحويل
-- الدلو إلى مساحة رفع مجانية للعالم، ويقبل أي اصطلاح مسار يحوي التوكن.
create or replace function public.receipt_upload_allowed(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.bookings b
    where b.status = 'pending_payment'
      and b.public_token = any (string_to_array(coalesce(p_name, ''), '/'))
  );
$$;

-- ----------------------------------------------------------------------------
-- (٦) تفعيل RLS + الصلاحيات
--
-- تذكير (من 0001): الوصول طبقتان — GRANT على الجدول + سياسة RLS، وكلاهما مطلوب.
-- ونسحب أولاً كل ما تمنحه إعدادات Supabase الافتراضية (alter default privileges
-- على مخطط public) ثم نمنح المطلوب وحده. هذا ليس تزيّداً: صلاحية TRUNCATE لا
-- تخضع لـ RLS إطلاقاً، فلو بقيت مع anon لأمكن تفريغ جدول الحجوزات كاملاً رغم
-- أن كل سياسات القراءة والكتابة تمنعه.
--
-- خلاصة سياسة الوصول في هذه المرحلة:
--   anon           → لا شيء إطلاقاً سوى إدراج طلب عرض سعر. كل ما عداه عبر
--                     دوال security definer (الحجز، المتابعة بالتوكن، الحسابات).
--   authenticated  → قراءة/كتابة مقصورة على is_admin() — بيانات الحجوزات تحوي
--                     بيانات شخصية، فلا «قراءة لكل مسجَّل» كما في جداول المحتوى.
--   service_role   → قراءة تشغيلية + تحكم كامل في طابور الإشعارات (عامل الإرسال).
-- ----------------------------------------------------------------------------
alter table public.bookings         enable row level security;
alter table public.booking_events   enable row level security;
alter table public.payment_accounts enable row level security;
alter table public.payments         enable row level security;
alter table public.quote_requests   enable row level security;
alter table public.notifications    enable row level security;

revoke all on public.bookings         from anon, authenticated;
revoke all on public.booking_events   from anon, authenticated;
revoke all on public.payment_accounts from anon, authenticated;
revoke all on public.payments         from anon, authenticated;
revoke all on public.quote_requests   from anon, authenticated;
revoke all on public.notifications    from anon, authenticated;

-- الضيف: إدراج طلب عرض سعر فقط — بلا قراءة (السياسة أدناه بلا select)
grant insert on public.quote_requests to anon;

-- المسجَّل (تحرسه سياسات is_admin أدناه)
grant select, update, delete         on public.bookings         to authenticated;
grant select                         on public.booking_events   to authenticated;
grant select, insert, update, delete on public.payment_accounts to authenticated;
grant select, insert, update, delete on public.payments         to authenticated;
grant select, insert, update, delete on public.quote_requests   to authenticated;
grant select, update                 on public.notifications    to authenticated;
-- لا insert على bookings: الإنشاء حصراً عبر create_booking (فحص مكافحة التلاعب)
-- لا insert/update/delete على booking_events: السجل تدقيقي يكتبه المُشغّل وحده

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant select, insert, update, delete on public.notifications to service_role';
    execute 'grant select on public.bookings to service_role';
    execute 'grant select on public.booking_events to service_role';
    execute 'grant select on public.payments to service_role';
    execute 'grant select on public.payment_accounts to service_role';
    execute 'grant select, insert on public.quote_requests to service_role';
  end if;
end;
$$;

-- سياسات bookings — قراءة وتعديل للمشرف فقط، والإنشاء ليس له سياسة أصلاً
drop policy if exists "bookings_select_admin" on public.bookings;
create policy "bookings_select_admin"
  on public.bookings
  for select
  to authenticated
  using (public.is_admin());

drop policy if exists "bookings_update_admin" on public.bookings;
create policy "bookings_update_admin"
  on public.bookings
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "bookings_delete_admin" on public.bookings;
create policy "bookings_delete_admin"
  on public.bookings
  for delete
  to authenticated
  using (public.is_admin());

-- سياسات booking_events — قراءة للمشرف، ولا كتابة لأحد (المُشغّل definer يتجاوز)
drop policy if exists "booking_events_select_admin" on public.booking_events;
create policy "booking_events_select_admin"
  on public.booking_events
  for select
  to authenticated
  using (public.is_admin());

-- سياسات payment_accounts — لا قراءة عامة إطلاقاً:
-- الزائر يرى الحسابات الصالحة عبر available_payment_accounts وحدها،
-- فأرقام المحافظ المعطّلة أو المتجاوزة حدَّها لا تظهر له أبداً.
drop policy if exists "payment_accounts_select_admin" on public.payment_accounts;
create policy "payment_accounts_select_admin"
  on public.payment_accounts
  for select
  to authenticated
  using (public.is_admin());

drop policy if exists "payment_accounts_insert_admin" on public.payment_accounts;
create policy "payment_accounts_insert_admin"
  on public.payment_accounts
  for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "payment_accounts_update_admin" on public.payment_accounts;
create policy "payment_accounts_update_admin"
  on public.payment_accounts
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "payment_accounts_delete_admin" on public.payment_accounts;
create policy "payment_accounts_delete_admin"
  on public.payment_accounts
  for delete
  to authenticated
  using (public.is_admin());

-- سياسات payments — كلها للمشرف؛ إدراج الضيف يمر عبر attach_receipt وحدها
drop policy if exists "payments_select_admin" on public.payments;
create policy "payments_select_admin"
  on public.payments
  for select
  to authenticated
  using (public.is_admin());

drop policy if exists "payments_insert_admin" on public.payments;
create policy "payments_insert_admin"
  on public.payments
  for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "payments_update_admin" on public.payments;
create policy "payments_update_admin"
  on public.payments
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "payments_delete_admin" on public.payments;
create policy "payments_delete_admin"
  on public.payments
  for delete
  to authenticated
  using (public.is_admin());

-- سياسات quote_requests — الضيف يُدرج ولا يقرأ، والمشرف يدير كل شيء
drop policy if exists "quote_requests_insert_public" on public.quote_requests;
create policy "quote_requests_insert_public"
  on public.quote_requests
  for insert
  to anon, authenticated
  with check (true);

drop policy if exists "quote_requests_select_admin" on public.quote_requests;
create policy "quote_requests_select_admin"
  on public.quote_requests
  for select
  to authenticated
  using (public.is_admin());

drop policy if exists "quote_requests_update_admin" on public.quote_requests;
create policy "quote_requests_update_admin"
  on public.quote_requests
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "quote_requests_delete_admin" on public.quote_requests;
create policy "quote_requests_delete_admin"
  on public.quote_requests
  for delete
  to authenticated
  using (public.is_admin());

-- سياسات notifications — المشرف يقرأ (جرس اللوحة) ويحدّث (تجاهل/إعادة محاولة)،
-- والكتابة الأولى حكر على الدوال والمُشغّلات وعميل الخدمة.
drop policy if exists "notifications_select_admin" on public.notifications;
create policy "notifications_select_admin"
  on public.notifications
  for select
  to authenticated
  using (public.is_admin());

drop policy if exists "notifications_update_admin" on public.notifications;
create policy "notifications_update_admin"
  on public.notifications
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- (٦-ب) صلاحيات التنفيذ على الدوال — نفس فخّ «مصدري المنح» لكن على الدوال
--
-- EXECUTE يأتي من مصدرين: منح ضمني لـ PUBLIC عند إنشاء أي دالة، **ومنح صريح
-- لـ anon/authenticated** من alter default privileges في إعداد Supabase.
-- سحب PUBLIC وحده لا يكفي إطلاقاً: المنح الصريح يبقى وتظل الدالة مكشوفة.
-- لذلك كل سطر هنا يسحب من الثلاثة معاً ثم يمنح المقصود وحده.
--
-- الأخطر أن معظم دوال هذا الملف security definer: دالة مثل queue_notification
-- متروكة للزائر تعني إغراق طابور الإشعارات، وverify_payment متروكة للزائر
-- تعني تأكيد حجوزات بلا تحويل (وإن كان is_admin بداخلها يمنع ذلك، فالطبقتان
-- مطلوبتان).
-- ----------------------------------------------------------------------------

-- دوال داخلية: لا تُستدعى إلا من دوال/مُشغّلات أخرى (وهي تعمل بهوية مالكها)
revoke all on function public.secure_random_bytes(integer)       from public, anon, authenticated;
revoke all on function public.random_ref_code(integer)           from public, anon, authenticated;
revoke all on function public.new_public_token()                 from public, anon, authenticated;
revoke all on function public.next_booking_reference()           from public, anon, authenticated;
revoke all on function public.next_quote_reference()             from public, anon, authenticated;
revoke all on function public.assign_booking_identifiers()       from public, anon, authenticated;
revoke all on function public.assign_quote_reference()           from public, anon, authenticated;
revoke all on function public.queue_notification(text, jsonb)    from public, anon, authenticated;
revoke all on function public.notification_channels()            from public, anon, authenticated;
revoke all on function public.current_actor()                    from public, anon, authenticated;
revoke all on function public.log_booking_change()               from public, anon, authenticated;
revoke all on function public.log_quote_request()                from public, anon, authenticated;
revoke all on function public.guard_booking_status()             from public, anon, authenticated;
revoke all on function public.jsonb_number(jsonb, text, numeric) from public, anon, authenticated;

-- دوال الواجهة العامة — الضيف يحتاجها قبل أي تسجيل دخول
revoke all on function public.create_booking(
  jsonb, jsonb, integer, boolean, numeric, numeric, numeric,
  text, text, text, text, text, text, timestamptz, text) from public, anon, authenticated;
grant execute on function public.create_booking(
  jsonb, jsonb, integer, boolean, numeric, numeric, numeric,
  text, text, text, text, text, text, timestamptz, text) to anon, authenticated;

revoke all    on function public.get_booking_by_token(text) from public, anon, authenticated;
grant execute on function public.get_booking_by_token(text) to anon, authenticated;

revoke all    on function public.available_payment_accounts(numeric) from public, anon, authenticated;
grant execute on function public.available_payment_accounts(numeric) to anon, authenticated;

revoke all    on function public.attach_receipt(text, text, uuid, numeric) from public, anon, authenticated;
grant execute on function public.attach_receipt(text, text, uuid, numeric) to anon, authenticated;

revoke all    on function public.attach_receipt(text, text) from public, anon, authenticated;
grant execute on function public.attach_receipt(text, text) to anon, authenticated;

revoke all    on function public.create_quote_request(text, text, text, text) from public, anon, authenticated;
grant execute on function public.create_quote_request(text, text, text, text) to anon, authenticated;

-- تستدعيها سياسة التخزين بهوية الرافع (anon أيضاً)
revoke all    on function public.receipt_upload_allowed(text) from public, anon, authenticated;
grant execute on function public.receipt_upload_allowed(text) to anon, authenticated;

-- دوال اللوحة — الحراسة داخلها بـ is_admin()، فلا معنى لمنحها للزائر
revoke all    on function public.verify_payment(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.verify_payment(uuid, boolean, text) to authenticated;

revoke all    on function public.set_booking_status(uuid, text, text) from public, anon, authenticated;
grant execute on function public.set_booking_status(uuid, text, text) to authenticated;

-- جدول الانتقالات تقرؤه الواجهة لترسم الأزرار المتاحة فقط
revoke all    on function public.booking_transition_allowed(text, text) from public, anon, authenticated;
grant execute on function public.booking_transition_allowed(text, text) to authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.create_booking(
               jsonb, jsonb, integer, boolean, numeric, numeric, numeric,
               text, text, text, text, text, text, timestamptz, text) to service_role';
    execute 'grant execute on function public.get_booking_by_token(text) to service_role';
    execute 'grant execute on function public.available_payment_accounts(numeric) to service_role';
    execute 'grant execute on function public.attach_receipt(text, text, uuid, numeric) to service_role';
    execute 'grant execute on function public.attach_receipt(text, text) to service_role';
    execute 'grant execute on function public.create_quote_request(text, text, text, text) to service_role';
    execute 'grant execute on function public.booking_transition_allowed(text, text) to service_role';
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- (٧) دلو الإيصالات — خاص تماماً (على عكس دلو media العام في 0003)
--
-- الرفع: مسموح للضيف لأن الحجز بلا حساب، لكنه مقيّد باسم يحوي توكن حجز حقيقي
--        ما زال بانتظار الدفع — فلا يتحول الدلو إلى مساحة رفع مفتوحة.
-- القراءة: للمشرف فقط. اللوحة تعرض الإيصال عبر رابط موقّع قصير العمر
--        (createSignedUrl) ولا يوجد أي رابط عام لأي إيصال إطلاقاً.
-- المسار الموصى به: «<public_token>/<اسم الملف>».
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

-- تصليب: لو أُنشئ الدلو يدوياً كعام في وقت ما، نعيده خاصاً عند كل تنفيذ.
-- محاط بمعالج خطأ لأن ملكية storage.buckets تختلف بين المشاريع، وفشل تصليب
-- احترازي لا يجوز أن يُسقط الهجرة كلها (السياسات أدناه هي خط الدفاع الفعلي).
do $$
begin
  update storage.buckets b set public = false where b.id = 'receipts' and b.public;
exception
  when others then
    raise notice 'تعذّر ضبط دلو receipts كخاص برمجياً (%) — تأكد يدوياً من Storage', sqlerrm;
end;
$$;

drop policy if exists "receipts_insert_guest" on storage.objects;
create policy "receipts_insert_guest"
  on storage.objects
  for insert
  to anon, authenticated
  with check (
    bucket_id = 'receipts'
    and (public.receipt_upload_allowed(name) or public.is_admin())
  );

drop policy if exists "receipts_select_admin" on storage.objects;
create policy "receipts_select_admin"
  on storage.objects
  for select
  to authenticated
  using (bucket_id = 'receipts' and public.is_admin());

drop policy if exists "receipts_update_admin" on storage.objects;
create policy "receipts_update_admin"
  on storage.objects
  for update
  to authenticated
  using (bucket_id = 'receipts' and public.is_admin())
  with check (bucket_id = 'receipts' and public.is_admin());

drop policy if exists "receipts_delete_admin" on storage.objects;
create policy "receipts_delete_admin"
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'receipts' and public.is_admin());

-- ----------------------------------------------------------------------------
-- (٨) البذرة — مفتاحا الإعدادات الجديدان
-- القيم مطابقة حرفياً لـ DEFAULT_PAYMENT_SETTINGS في lib/booking-types.ts.
-- مفتاح notifications يبدأ مُطفأً بالكامل: بلا بيانات اعتماد تليجرام أو بريد
-- تكتفي الإشعارات بجرس اللوحة وتُعلّم الباقي skipped (لا فشل ولا ضجيج).
-- on conflict do nothing: إعادة التنفيذ لا تمس أي تعديل لاحق من اللوحة.
-- ----------------------------------------------------------------------------
insert into public.site_settings (key, value)
values
  (
    'payment',
    '{
      "depositPercent": 30,
      "depositMinAmount": 200,
      "transferInstructions": "حوّل المبلغ على أحد الحسابات المعروضة، ثم ارفع صورة إيصال التحويل. يراجع فريقنا التحويل ويؤكد حجزك خلال دقائق."
    }'::jsonb
  ),
  (
    'notifications',
    '{
      "telegramChatId": null,
      "telegramEnabled": false,
      "emailTo": null,
      "emailEnabled": false
    }'::jsonb
  )
on conflict (key) do nothing;
