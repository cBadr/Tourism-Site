-- ============================================================================
-- 0054 — توجيه الإشعارات **لكل مستقبِل**، وتفضيلات المتعهد، وحالة الإتاحة
--
-- المرجع الحاكم: docs/phase-briefs/FAILED-TRIPS-AND-PARTNER-ALERTS.md §٣ (🅱 · 🅳 · 🅴)
-- وقرار بدر 2026-08-15 في docs/phase-briefs/BOOKING-JOURNEY-WAVES.md §(١):
-- **البثّ يتخطّى غير المتاح، ومعه احتياطي** — إن لم يوجد متاحٌ يغطي المسار
-- يُضمّ غير المتاحين بدل أن تنتهي الموجة بلا أحد. قرارُ مالكٍ لا اقتراحُ جلسة.
--
-- والعقد المكتوب قبل هذا الملف: `lib/partner-alerts-types.ts`.
--
-- ══════════════════════════════════════════════════════════════════════════
--  ما قِيس على القاعدة الحيّة قبل كتابة حرف (‏D-58: من `pg_get_functiondef`)
-- ══════════════════════════════════════════════════════════════════════════
--
--   • `notification_channels()` **عامّة**: `sql stable definer`، تقرأ صفَّ
--     `site_settings.notifications` وتُرجع قنوات **المالك** — للجميع.
--   • `queue_notification(text, jsonb)` منادِيها الوحيد، وتكتب ناتجها في
--     `notifications.channels`. ولها ثمانية مُنادين: `accept_offer` ·
--     `dispatch_broadcast` · `dispatch_tick` · `log_booking_change` ·
--     `log_quote_request` · `manual_assign` · `start_dispatch`.
--   • `notifications` فيه `channels text[] not null` — فالبنية نصف موجودة،
--     وهذا **امتدادٌ لا إعادة بناء**.
--   • `subcontractors` فيه `phone` و`whatsapp` و`email` — **ولا `telegram_chat_id`**.
--   • `dispatch_broadcast` تضع في الحمولة `partnerEmail` **فقط**، فلا وجهةَ
--     تليجرام لأحد. وهذا جذرُ العيب: **العرض لا يصل أحداً**.
--   • `dispatch_pool` تنتهي بـ`select … from covered c join subcontractors s
--     on … s.status='approved' where exists(vehicle) and cost <= ceiling`.
--     ⚠ والشرط الجديد **لا يدخل `covered`**: هناك يُحسب `min(cost)` لكل متعهد،
--     وأي مرشّحٍ يُطرح قبل التجميع يغيّر تكلفةً لا إتاحة. مكانه بعد التصفية.
--   • أحد عشر متعهداً، **صفرٌ منهم يملك معرّف تليجرام** (العمود غير موجود
--     أصلاً)، و`RESEND_API_KEY` غير مضبوط. أي أن **لا أحد بالغٌ اليوم** —
--     ولذلك الاحتياطي هو المسار الطبيعي لا الحافّة، وهذا مقصودٌ ومُقاس.
--
-- ══════════════════════════════════════════════════════════════════════════
--  🔒 ثلاثة قرارات بنيوية تُقرأ قبل تعديل أي سطر أدناه
-- ══════════════════════════════════════════════════════════════════════════
--
-- (١) **`inbox` و`dashboard` لا يجعلان أحداً «بالغاً»**. كلاهما يستلزم أن
--     **ينظر** صاحبه، فاعتبارهما بلوغاً يعني «أُرسل إليه» عن شيءٍ قد لا يفتحه،
--     ويُسكِت الاحتياطيَّ في الحالة التي وُجد لها. (ج٣ في الموجز، وهو نفس ما
--     قُنِّن عن `dashboard` في `lib/dispatch/messages.ts`.)
--
-- (٢) **صندوق البورتال ليس جدولاً جديداً** — هو `notifications` نفسه بدالة
--     `security definer` بإسقاطٍ آمن (`portal_inbox()`). ولا سياسة `SELECT`
--     واحدة تُضاف على `notifications`: الجدول يحمل صفوفاً تشغيلية فيها اسم
--     العميل وهاتفه وإجمالي حجزه، وPostgres **لا يملك RLS على مستوى العمود**،
--     فسياسةٌ واحدة تفتح الجدول كله. (القاعدة نفسها المكتوبة عن `bookings`.)
--
-- (٣) **البريد مصمَّمٌ ومطفأ، ولا يُدَّعى جاهزاً**. القاعدة لا تقرأ
--     `process.env`، فبلا `notification_providers` كانت ستَعُدّ البريد قناةً
--     بالغة وتُعلن متعهداً «متاحاً» وهو لا يسمع شيئاً. الجدول يحمل ما **قِيس**
--     من البيئة، وكاتبُه الوحيد `service_role` من طبقة التسليم. ومفتاحٌ يُضاف
--     غداً يقلب الصفَّ بلا هجرة.
--
-- ⚠ **وغيابُ صفِّ تفضيلاتٍ ليس صمتاً**: المتعهد بلا صفٍّ في
--    `partner_alert_prefs` تُطبَّق عليه الافتراضات (كل القنوات مفعَّلة · يستقبل
--    الطلبات). لو كان الغياب يعني «مطفأ» لأفرغ أولُ نشرٍ حوضَ البث كلَّه.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (١) وجهة تليجرام للمتعهد — العمود الذي كان غيابه يُسقط القناة كلها
-- ----------------------------------------------------------------------------

alter table public.subcontractors
  add column if not exists telegram_chat_id text;

comment on column public.subcontractors.telegram_chat_id is
  'معرّف محادثة تليجرام للمتعهد — يلتقطه البورتال من البوت. بلا هذا العمود كانت '
  'قناة تليجرام تُطلب ولا وجهة لها، فيُوسم العرض «متجاوَزاً» ولا يصل أحداً.';

-- ----------------------------------------------------------------------------
-- (٢) امتداد صفّ الإشعار: لمن هو، وهل قُرئ، ولماذا صعد
-- ----------------------------------------------------------------------------

alter table public.notifications
  add column if not exists recipient_kind text not null default 'ops',
  add column if not exists recipient_id   uuid,
  add column if not exists read_at        timestamptz,
  add column if not exists escalation     text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.notifications'::regclass
      and conname  = 'notifications_recipient_kind_check'
  ) then
    alter table public.notifications
      add constraint notifications_recipient_kind_check
      check (recipient_kind in ('ops', 'partner'));
  end if;

  -- «متعهد» بلا معرّف صفٌّ لا وجهة له: يمرّ في الطابور ثم لا يجد مستقبِلاً
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.notifications'::regclass
      and conname  = 'notifications_recipient_id_check'
  ) then
    alter table public.notifications
      add constraint notifications_recipient_id_check
      check ((recipient_kind = 'partner') = (recipient_id is not null));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.notifications'::regclass
      and conname  = 'notifications_escalation_check'
  ) then
    alter table public.notifications
      add constraint notifications_escalation_check
      check (escalation is null or escalation in ('partner-unreachable', 'partner-not-found'));
  end if;
end;
$$;

-- صندوق البورتال يقرأ بهذا الفهرس: مستقبِلٌ واحد مرتَّباً بالأحدث
create index if not exists notifications_recipient_idx
  on public.notifications (recipient_id, created_at desc)
  where recipient_id is not null;

comment on column public.notifications.recipient_kind is
  'لمن هذا الصف: ops (فريق التشغيل) أو partner. وعليه تُحسب القنوات — لا على إعدادات المالك.';
comment on column public.notifications.escalation is
  'رمزُ سبب التصعيد إلى التشغيل حين تعذّر بلوغ المتعهد. رمزٌ لا جملة (الواجهة تترجمه).';

-- ----------------------------------------------------------------------------
-- (٣) جاهزية المزوّدين — ما قِيس من البيئة، مكتوباً لتقرأه القاعدة
-- ----------------------------------------------------------------------------

create table if not exists public.notification_providers (
  channel     text primary key
              check (channel in ('telegram', 'email', 'webpush')),
  ready       boolean     not null default false,
  missing_env text[]      not null default '{}',
  updated_at  timestamptz not null default now()
);

comment on table public.notification_providers is
  'جاهزية كل مزوّد قناة كما قِيست من متغيّرات البيئة. القاعدة لا تقرأ process.env، '
  'وبلا هذا الجدول تحسب البريدَ قناةً بالغة بلا مزوّد فتُعلن متعهداً «متاحاً» وهو لا يسمع. '
  'الكاتب الوحيد service_role من طبقة التسليم — قيمةٌ مقيسة لا مُدخَلة من شاشة.';

-- البذرة: **الكل مطفأ** حتى تقيس طبقة التسليم البيئة وتكتب. والافتراض المتحفّظ
-- مقصود: قناةٌ تُعلن جاهزةً وهي ليست كذلك تُسكِت الاحتياطي، والعكس يوقظه فقط.
insert into public.notification_providers (channel, ready, missing_env)
values ('telegram', false, array['TELEGRAM_BOT_TOKEN']),
       ('email',    false, array['RESEND_API_KEY']),
       ('webpush',  false, array['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT'])
on conflict (channel) do nothing;

create or replace function public.provider_ready(p_channel text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select np.ready from public.notification_providers np where np.channel = p_channel),
    false);
$$;

comment on function public.provider_ready(text) is
  'هل مزوّد هذه القناة جاهز؟ الغياب = لا (متحفّظ عمداً).';

-- ----------------------------------------------------------------------------
-- (٤) تفضيلات المتعهد — جدولٌ صفٌّ واحد لكل متعهد
-- ----------------------------------------------------------------------------

create table if not exists public.partner_alert_prefs (
  subcontractor_id uuid primary key
                   references public.subcontractors(id) on delete cascade,
  telegram_enabled boolean     not null default true,
  webpush_enabled  boolean     not null default true,
  inbox_enabled    boolean     not null default true,
  email_enabled    boolean     not null default true,
  -- العامل الثاني في الإتاحة (١-و): مفتاحٌ بيد المتعهد يوقف استقبال الطلبات
  accepting_offers boolean     not null default true,
  updated_at       timestamptz not null default now()
);

comment on table public.partner_alert_prefs is
  'قنوات المتعهد ومفتاح «أستقبل الطلبات». **غيابُ الصف ليس صمتاً**: تُطبَّق الافتراضات '
  '(كل القنوات مفعَّلة · يستقبل) — ولو كان الغياب يعني «مطفأ» لأفرغ أولُ نشرٍ حوضَ البث.';
comment on column public.partner_alert_prefs.accepting_offers is
  'عامل «راغب» في حالة الإتاحة ذات العاملين. وإطفاءُ كل القنوات = غير متصل، لا «متصلٌ بلا إشعارات».';

drop trigger if exists partner_alert_prefs_touch on public.partner_alert_prefs;
create trigger partner_alert_prefs_touch
  before update on public.partner_alert_prefs
  for each row execute function public.touch_updated_at();

-- ----------------------------------------------------------------------------
-- (٥) اشتراكات دفع الويب — صفٌّ لكل جهاز
-- ----------------------------------------------------------------------------

create table if not exists public.partner_push_subscriptions (
  id               uuid primary key default gen_random_uuid(),
  subcontractor_id uuid not null
                   references public.subcontractors(id) on delete cascade,
  endpoint         text not null unique,
  p256dh           text not null,
  auth             text not null,
  user_agent       text,
  created_at       timestamptz not null default now(),
  last_seen_at     timestamptz
);

comment on table public.partner_push_subscriptions is
  'اشتراك دفع ويب لجهازٍ واحد. ⚠ endpoint معرّفٌ ومفتاحٌ معاً: من يملكه يرسل إلى الجهاز — '
  'فلا يُعاد إلى أي واجهة ولا يدخل أي حمولة (portal_push_devices تُسقطه بنيوياً).';

create index if not exists partner_push_subscriptions_partner_idx
  on public.partner_push_subscriptions (subcontractor_id);

-- ----------------------------------------------------------------------------
-- (٦) 🔧 التوجيه لكل مستقبِل — ب١، وكل ما بعده يركب عليه
-- ----------------------------------------------------------------------------

/**
 * قنوات متعهدٍ بعينه.
 *
 * كل قناة شرطها ثلاثي: **مفعَّلة عنده × له عنوان عليها × مزوّدها جاهز**.
 * و`inbox` وحده بلا عنوان ولا مزوّد — صفُّ الإشعار نفسه هو التسليم.
 *
 * ولا يُلمَس جسم `notification_channels()`: تلك تخصّ فريق التشغيل وما زالت
 * صحيحةً لجمهورها، وهذه تخصّ المتعهد. **إضافةٌ بجوارها لا إعادة كتابةٍ لها**
 * (القاعدة الذهبية ١٢).
 */
create or replace function public.partner_channels(p_partner uuid)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select array_remove(array[
    case when coalesce(pr.telegram_enabled, true)
          and btrim(coalesce(s.telegram_chat_id, '')) <> ''
          and public.provider_ready('telegram')
         then 'telegram' end,
    case when coalesce(pr.webpush_enabled, true)
          and public.provider_ready('webpush')
          and exists (select 1 from public.partner_push_subscriptions ps
                      where ps.subcontractor_id = s.id)
         then 'webpush' end,
    -- لا عنوان ولا مزوّد: الصفُّ نفسه هو الصندوق
    case when coalesce(pr.inbox_enabled, true) then 'inbox' end,
    case when coalesce(pr.email_enabled, true)
          and btrim(coalesce(s.email, '')) <> ''
          and public.provider_ready('email')
         then 'email' end
  ], null)
  from public.subcontractors s
  left join public.partner_alert_prefs pr on pr.subcontractor_id = s.id
  where s.id = p_partner;
$$;

comment on function public.partner_channels(uuid) is
  'قنوات متعهدٍ بعينه: مفعَّلة × له عنوان × مزوّدها جاهز. تُرجع NULL لمعرّفٍ لا يقابل متعهداً.';

/**
 * حالة الإتاحة بعاملين (١-و): **بالغٌ × راغب**.
 *
 * و«بالغ» يُحسب من القنوات **البالغة وحدها** — لا `inbox`. (القرار البنيوي ١
 * أعلى الملف: صندوقٌ يستلزم أن ينظر صاحبه ليس بلوغاً.)
 */
create or replace function public.partner_availability(p_partner uuid)
returns table (
  reachable         boolean,
  willing           boolean,
  available         boolean,
  reaching_channels text[]
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    v.reaching <> '{}'::text[]                                as reachable,
    coalesce(pr.accepting_offers, true)                       as willing,
    v.reaching <> '{}'::text[] and coalesce(pr.accepting_offers, true) as available,
    v.reaching                                                as reaching_channels
  from public.subcontractors s
  left join public.partner_alert_prefs pr on pr.subcontractor_id = s.id
  cross join lateral (
    select coalesce(
             array(select c from unnest(coalesce(public.partner_channels(s.id), '{}'::text[])) c
                   where c in ('telegram', 'webpush', 'email')),
             '{}'::text[]) as reaching
  ) v
  where s.id = p_partner;
$$;

comment on function public.partner_availability(uuid) is
  'الإتاحة بعاملين: بالغ (قناةٌ بالغة واحدة على الأقل — لا inbox) × راغب (مفتاحه هو).';

/** الوجه البولياني للإتاحة — هذا ما يقرؤه حوض البث. الغياب = غير متاح. */
create or replace function public.partner_available(p_partner uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select a.available from public.partner_availability(p_partner) a), false);
$$;

/**
 * قنوات صفِّ إشعارٍ بحسب مستقبِله — الدالة التي تجعل التوجيه «لكل مستقبِل».
 * تفويضٌ محض: `ops` إلى الدالة العامة كما هي، و`partner` إلى قنواته هو.
 */
create or replace function public.notification_channels_for(p_kind text, p_id uuid)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_kind = 'partner' and p_id is not null
      -- متعهدٌ محذوف أو معرّفٌ خاطئ: مصفوفةٌ فارغة، وطبقةُ التسليم تصعّد
      -- بالرمز `partner-not-found` بدل أن تسلّم على قنوات المالك بالسهو.
      then coalesce(public.partner_channels(p_id), '{}'::text[])
    else public.notification_channels()
  end;
$$;

comment on function public.notification_channels_for(text, uuid) is
  'قنوات الصف بحسب مستقبِله. تفويضٌ إلى notification_channels() للتشغيل وإلى partner_channels() للمتعهد.';

-- ----------------------------------------------------------------------------
-- (٧) `queue_notification` — توقيعٌ رباعي، والقديم يفوّض إليه
-- ----------------------------------------------------------------------------

create or replace function public.queue_notification(
  p_event   text,
  p_payload jsonb,
  p_kind    text,
  p_id      uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id   uuid;
  v_kind text := coalesce(nullif(btrim(p_kind), ''), 'ops');
  v_rid  uuid := case when v_kind = 'partner' then p_id else null end;
begin
  -- «متعهد» بلا معرّف صفٌّ لا وجهة له — يُردّ إلى التشغيل بدل أن يكسر القيد
  if v_kind = 'partner' and v_rid is null then
    v_kind := 'ops';
  end if;

  insert into public.notifications as n
    (event, payload, channels, status, recipient_kind, recipient_id)
  values (p_event, coalesce(p_payload, '{}'::jsonb),
          public.notification_channels_for(v_kind, v_rid), 'queued', v_kind, v_rid)
  returning n.id into v_id;
  return v_id;
end;
$$;

/**
 * التوقيع القديم بحرفه — **يفوّض ولا يستنسخ**. سبعةُ مُنادين قائمين يمرّون
 * منه بلا تعديل، وسلوكهم لم يتغيّر: `ops` وقنوات المالك كما كانت.
 */
create or replace function public.queue_notification(p_event text, p_payload jsonb)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select public.queue_notification(p_event, p_payload, 'ops', null);
$$;

comment on function public.queue_notification(text, jsonb) is
  'التوقيع القديم — يفوّض إلى الرباعي بجمهور ops. لا يُستنسخ جسمه (D-58 · القاعدة ١٢).';

-- ----------------------------------------------------------------------------
-- (٨) حوض البث — يتخطّى غير المتاح **مع الاحتياطي** (قرار بدر §١)
-- ----------------------------------------------------------------------------

/**
 * ⚠ **الجسم منقولٌ من التعريف الحيّ** (`pg_get_functiondef`) لا من ملف هجرة
 * (D-58 · القاعدة الذهبية ١٠). والتغيير الوحيد في الاستعلام الأخير.
 *
 * ── أين وُضع الشرط ولماذا هنا بالذات ──────────────────────────────────────
 *
 * **ليس في `covered`**: هناك يُحسب `min(pli.cost)` لكل متعهد. مرشّحٌ يُطرح قبل
 * التجميع يغيّر **تكلفة** لا **إتاحة** — والسقف يُقارن بها، فيخرج من الحوض من
 * يستحق البقاء ويبقى من لا يستحق. الشرط يقع **بعد** التصفية كاملةً، على مجموعة
 * المؤهَّلين النهائية، فلا يمسّ رقماً واحداً.
 *
 * والاحتياطي جملةٌ واحدة: `r.avail or not exists (select 1 from ranked where avail)`.
 * فإن وُجد متاحٌ واحد خرج المتاحون وحدهم، وإن لم يوجد خرج الجميع —
 * **جوابٌ بطيء خيرٌ من لا جواب**. وحين يكون الكل متاحاً فالناتج **مطابقٌ**
 * لما قبل هذه الهجرة صفاً بصف وترتيباً بترتيب.
 */
create or replace function public.dispatch_pool(p_booking_id uuid, p_round integer)
returns table(subcontractor_id uuid, payout numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_b       record;
  v_olat    numeric;
  v_olng    numeric;
  v_dlat    numeric;
  v_dlng    numeric;
  v_factor  numeric := 1;
  v_ceiling numeric;
begin
  select b.class_slug, b.trip into v_b
  from public.bookings b
  where b.id = p_booking_id;

  if not found then
    return;
  end if;

  v_olat := public.jsonb_number(v_b.trip, 'originLat', null);
  v_olng := public.jsonb_number(v_b.trip, 'originLng', null);
  v_dlat := public.jsonb_number(v_b.trip, 'destLat',   null);
  v_dlng := public.jsonb_number(v_b.trip, 'destLng',   null);

  -- حجز قديم بلا إحداثيات: لا تغطية تُحسب، فيمضي إلى الطابور اليدوي
  if v_olat is null or v_olng is null or v_dlat is null or v_dlng is null then
    return;
  end if;

  -- التكلفة المطبَّقة تضربها معامل الذهاب والعودة كما يضرب السعر تماماً (0011)،
  -- وإلا قارنّا تكلفة اتجاه واحد بسقف رحلة كاملة فدخل من لا يستحق.
  if coalesce(v_b.trip ->> 'roundTrip', 'false') in ('true', 't', '1') then
    select coalesce(t.round_trip_factor, 1) into v_factor
    from public.tariffs t
    join public.vehicle_classes vc on vc.id = t.class_id
    where vc.slug = v_b.class_slug;
    v_factor := coalesce(v_factor, 1);
  end if;

  v_ceiling := public.dispatch_ceiling(p_booking_id, p_round);
  if v_ceiling is null then
    return;
  end if;

  return query
  with covered as (
    select cm.subcontractor_id as sid, min(pli.cost) as cost
    from public.coverage_matches(v_olat, v_olng, v_dlat, v_dlng) cm
    join public.price_list_items pli
      on pli.price_list_id = cm.price_list_id
     and pli.class_slug    = v_b.class_slug
    group by cm.subcontractor_id
  ),
  -- الأهلية كما كانت حرفياً: معتمَد · له مركبة فعّالة من الفئة · تحت السقف
  eligible as (
    select c.sid, round(c.cost * v_factor, 2) as payout
    from covered c
    join public.subcontractors s on s.id = c.sid and s.status = 'approved'
    where exists (
            select 1
            from public.subcontractor_vehicles v
            where v.subcontractor_id = c.sid
              and v.class_slug       = v_b.class_slug
              and v.active
          )
      and round(c.cost * v_factor, 2) <= v_ceiling
  ),
  ranked as (
    select e.sid, e.payout, public.partner_available(e.sid) as avail
    from eligible e
  )
  select r.sid, r.payout
  from ranked r
  where r.avail
     or not exists (select 1 from ranked r2 where r2.avail)   -- ← الاحتياطي
  order by 2 asc, 1 asc;
end;
$$;

comment on function public.dispatch_pool(uuid, integer) is
  'حوض البث: المؤهَّلون المتاحون — وإن لم يتوفّر متاحٌ واحد خرج المؤهَّلون كلهم '
  '(قرار بدر 2026-08-15: جوابٌ بطيء خيرٌ من لا جواب).';

-- ----------------------------------------------------------------------------
-- (٩) `dispatch_broadcast` — العرض يصير موجَّهاً إلى صاحبه، ومعه وجهة تليجرام
-- ----------------------------------------------------------------------------

/**
 * ⚠ الجسم منقولٌ من التعريف الحيّ. وثلاثة تغييرات لا رابع:
 *   (أ) `s.telegram_chat_id` يُقرأ ويُمرَّر في الحمولة — بدونه تُطلب القناة بلا وجهة.
 *   (ب) `queue_notification` بالتوقيع الرباعي: **الصف موجَّه إلى المتعهد**،
 *       فقنواته تُحسب من تفضيلاته هو لا من إعدادات المالك.
 *   (ج) لا شيء آخر. الحمولة تبقى `dispatch_trip_payload(_, true)` — عامةً بلا
 *       اسم عميل ولا هاتف ولا إجمالي (D-19)، وهو ما يجعل صندوق البورتال آمناً
 *       بالبناء لا بالانتباه.
 */
create or replace function public.dispatch_broadcast(p_booking_id uuid, p_round integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cfg     record;
  v_expires timestamptz;
  v_base    jsonb;
  v_count   integer := 0;
  v_row     record;
begin
  select * into v_cfg from public.dispatch_config();
  v_expires := now() + make_interval(mins => v_cfg.window_minutes);
  v_base    := public.dispatch_trip_payload(p_booking_id, true);

  if v_base is null then
    return 0;
  end if;

  -- صف الدورة موجود دائماً قبل أي عرض: عرض بلا دورة لا يظهر في البورتال ولا
  -- تلتقطه الدورة المجدولة، فيبقى معلّقاً إلى الأبد. سطر احتياطي لا أكثر.
  insert into public.dispatches as d0 (booking_id, status)
  values (p_booking_id, 'queued')
  on conflict (booking_id) do nothing;

  -- صف الدورة أولاً (ترتيب الأقفال الثابت في هذا الملف: dispatches ← trip_offers ← bookings)
  update public.dispatches d
     set status            = 'broadcasting',
         round             = p_round,
         last_broadcast_at = now()
   where d.booking_id = p_booking_id;

  for v_row in
    with fresh as (
      insert into public.trip_offers as o (booking_id, subcontractor_id, round, payout, status, expires_at)
      select p_booking_id, p.subcontractor_id, p_round, p.payout, 'pending', v_expires
      from public.dispatch_pool(p_booking_id, p_round) p
      where not exists (
        select 1 from public.trip_offers prev
        where prev.booking_id       = p_booking_id
          and prev.subcontractor_id = p.subcontractor_id
          and prev.status           = 'rejected'
      )
        -- 0027: من بلغ سقف دينه لا يصله عرض أصلاً. التصفية هنا لا في الحوض عمداً
        -- (‏`manual_assign` تشتق المستحق الافتراضي من الحوض).
        and not public.partner_over_debt_limit(p.subcontractor_id)
      on conflict (booking_id, subcontractor_id, round) do nothing
      returning o.id, o.subcontractor_id, o.payout, o.expires_at
    )
    select f.id, f.subcontractor_id, f.payout, f.expires_at,
           s.company_name, s.email, s.telegram_chat_id
    from fresh f
    join public.subcontractors s on s.id = f.subcontractor_id
  loop
    v_count := v_count + 1;

    perform public.queue_notification(
      'trip_offered',
      v_base || jsonb_build_object(
        'offerId',                v_row.id,
        'subcontractorId',        v_row.subcontractor_id,
        'companyName',            v_row.company_name,
        'partnerEmail',           v_row.email,
        'partnerTelegramChatId',  v_row.telegram_chat_id,
        'payout',                 v_row.payout,
        'expiresAt',              v_row.expires_at,
        'windowMinutes',          v_cfg.window_minutes,
        'round',                  p_round,
        'maxRounds',              v_cfg.max_rounds
      ),
      'partner',
      v_row.subcontractor_id
    );
  end loop;

  return v_count;
end;
$$;

-- ----------------------------------------------------------------------------
-- (١٠) البورتال — تفضيلاته وصندوقه وأجهزته، كلها بإسقاطٍ آمن
-- ----------------------------------------------------------------------------

/** تفضيلات المتعهد الحالي + حالته المحسوبة. لا تُرجع صفَّ أحدٍ غيره بنيوياً. */
create or replace function public.portal_alert_prefs()
returns table (
  telegram_enabled  boolean,
  webpush_enabled   boolean,
  inbox_enabled     boolean,
  email_enabled     boolean,
  accepting_offers  boolean,
  has_telegram_id   boolean,
  push_devices      integer,
  reachable         boolean,
  willing           boolean,
  available         boolean,
  reaching_channels text[]
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce(pr.telegram_enabled, true),
    coalesce(pr.webpush_enabled,  true),
    coalesce(pr.inbox_enabled,    true),
    coalesce(pr.email_enabled,    true),
    coalesce(pr.accepting_offers, true),
    btrim(coalesce(s.telegram_chat_id, '')) <> '',
    (select count(*)::integer from public.partner_push_subscriptions ps
      where ps.subcontractor_id = s.id),
    a.reachable, a.willing, a.available, a.reaching_channels
  from public.subcontractors s
  left join public.partner_alert_prefs pr on pr.subcontractor_id = s.id
  cross join lateral public.partner_availability(s.id) a
  where s.id = public.current_subcontractor_id();
$$;

comment on function public.portal_alert_prefs() is
  'تفضيلات المتعهد الحالي وحالته. ⚠ لا تُرجع معرّف تليجرام نفسه ولا أي endpoint — '
  'بوليان «هل سُجّل» يكفي الواجهة، وما لا يوجد في نوع الإرجاع لا يُسرَّب (اتفاقية ٧).';

/** حفظ التفضيلات — `upsert` على صفّ المتعهد الحالي وحده. */
create or replace function public.portal_set_alert_prefs(
  p_telegram boolean,
  p_webpush  boolean,
  p_inbox    boolean,
  p_email    boolean,
  p_accept   boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sub uuid := public.current_subcontractor_id();
begin
  if v_sub is null then
    raise exception 'لا متعهد لهذه الجلسة';
  end if;

  insert into public.partner_alert_prefs as p
    (subcontractor_id, telegram_enabled, webpush_enabled, inbox_enabled, email_enabled, accepting_offers)
  values (v_sub, coalesce(p_telegram, true), coalesce(p_webpush, true),
          coalesce(p_inbox, true), coalesce(p_email, true), coalesce(p_accept, true))
  on conflict (subcontractor_id) do update
    set telegram_enabled = excluded.telegram_enabled,
        webpush_enabled  = excluded.webpush_enabled,
        inbox_enabled    = excluded.inbox_enabled,
        email_enabled    = excluded.email_enabled,
        accepting_offers = excluded.accepting_offers;
  return true;
end;
$$;

/** التقاط معرّف محادثة تليجرام من البورتال (ج١). النص الفارغ = فصلُ القناة. */
create or replace function public.portal_set_telegram_chat_id(p_chat_id text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sub uuid := public.current_subcontractor_id();
  v_val text := nullif(btrim(coalesce(p_chat_id, '')), '');
begin
  if v_sub is null then
    raise exception 'لا متعهد لهذه الجلسة';
  end if;
  -- معرّف تليجرام رقمٌ (وقد يسبقه سالبٌ للمجموعات) — ورفضُ ما عداه يمنع
  -- أن يُخزَّن «@username» فتُطلب القناة بوجهةٍ لا تقبلها واجهة البوت.
  if v_val is not null and v_val !~ '^-?[0-9]{1,20}$' then
    raise exception 'معرّف محادثة تليجرام غير صالح';
  end if;

  update public.subcontractors set telegram_chat_id = v_val where id = v_sub;
  return true;
end;
$$;

/** أجهزة الدفع كما يراها صاحبها — بلا `endpoint` ولا مفتاح واحد. */
create or replace function public.portal_push_devices()
returns table (id uuid, label text, created_at timestamptz, last_seen_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select ps.id, ps.user_agent, ps.created_at, ps.last_seen_at
  from public.partner_push_subscriptions ps
  where ps.subcontractor_id = public.current_subcontractor_id()
  order by ps.created_at desc;
$$;

/** تسجيل اشتراك جهاز. التصادم على `endpoint` = الجهاز نفسه ⇒ تحديثٌ لا صفٌّ ثانٍ. */
create or replace function public.portal_register_push(
  p_endpoint text,
  p_p256dh   text,
  p_auth     text,
  p_agent    text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sub uuid := public.current_subcontractor_id();
  v_id  uuid;
begin
  if v_sub is null then
    raise exception 'لا متعهد لهذه الجلسة';
  end if;
  if btrim(coalesce(p_endpoint, '')) = ''
     or btrim(coalesce(p_p256dh, '')) = ''
     or btrim(coalesce(p_auth, '')) = '' then
    raise exception 'اشتراك دفع ناقص';
  end if;

  insert into public.partner_push_subscriptions as ps
    (subcontractor_id, endpoint, p256dh, auth, user_agent, last_seen_at)
  values (v_sub, btrim(p_endpoint), btrim(p_p256dh), btrim(p_auth),
          nullif(btrim(coalesce(p_agent, '')), ''), now())
  on conflict (endpoint) do update
    -- جهازٌ انتقل إلى حساب آخر يتبع صاحبه الجديد، ولا يبقى معلَّقاً على القديم
    set subcontractor_id = excluded.subcontractor_id,
        p256dh           = excluded.p256dh,
        auth             = excluded.auth,
        user_agent       = excluded.user_agent,
        last_seen_at     = now()
  returning ps.id into v_id;
  return v_id;
end;
$$;

/** إزالة جهاز — صفّ صاحبه وحده، ويرجع false حين لا يُصاب شيء (فخ الصفر صفوف). */
create or replace function public.portal_remove_push(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sub uuid := public.current_subcontractor_id();
  v_n   integer;
begin
  if v_sub is null then
    raise exception 'لا متعهد لهذه الجلسة';
  end if;
  delete from public.partner_push_subscriptions ps
   where ps.id = p_id and ps.subcontractor_id = v_sub;
  get diagnostics v_n = row_count;
  return v_n > 0;
end;
$$;

/**
 * صندوق البورتال (ج٣) — `notifications` بإسقاطٍ آمن.
 *
 * 🔒 **الإسقاط هو الأمان**: ما يخرج من هنا حقولٌ خمسة ومفاتيحُ حمولةٍ **عامة**
 * مسمّاة واحداً واحداً. ولو أُعيد `payload` كما هو لكفى صفٌّ تشغيليٌّ واحد
 * أُسند إلى متعهدٍ بالخطأ ليخرج معه اسم عميلٍ وهاتفه. القائمة البيضاء تجعل
 * التسريب **مستحيلاً بنيوياً** لا مستبعَداً بالانتباه.
 */
create or replace function public.portal_inbox(p_limit integer default 50)
returns table (
  id         uuid,
  event      text,
  reference  text,
  offer_id   uuid,
  created_at timestamptz,
  read_at    timestamptz,
  summary    jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    n.id,
    n.event,
    n.payload ->> 'reference',
    nullif(n.payload ->> 'offerId', '')::uuid,
    n.created_at,
    n.read_at,
    jsonb_strip_nulls(jsonb_build_object(
      'classTitle',   n.payload -> 'classTitle',
      'originLabel',  n.payload -> 'originLabel',
      'destLabel',    n.payload -> 'destLabel',
      'distanceKm',   n.payload -> 'distanceKm',
      'passengers',   n.payload -> 'passengers',
      'roundTrip',    n.payload -> 'roundTrip',
      'waitingHours', n.payload -> 'waitingHours',
      'pickupAt',     n.payload -> 'pickupAt',
      'payout',       n.payload -> 'payout',
      'currency',     n.payload -> 'currency',
      'expiresAt',    n.payload -> 'expiresAt',
      'round',        n.payload -> 'round'
    ))
  from public.notifications n
  where n.recipient_kind = 'partner'
    and n.recipient_id   = public.current_subcontractor_id()
  order by n.created_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;

comment on function public.portal_inbox(integer) is
  'صندوق المتعهد: صفوفه هو من notifications بقائمةٍ بيضاء من مفاتيح الحمولة العامة. '
  'ولا سياسة SELECT على الجدول — Postgres بلا RLS على مستوى العمود، فالسياسة تفتحه كله.';

/** تعليم مقروء — صفوف صاحبها وحده، والمقروء لا يُعاد ختمه. */
create or replace function public.portal_inbox_mark_read(p_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sub uuid := public.current_subcontractor_id();
  v_n   integer;
begin
  if v_sub is null then
    raise exception 'لا متعهد لهذه الجلسة';
  end if;

  update public.notifications n
     set read_at = now()
   where n.recipient_kind = 'partner'
     and n.recipient_id   = v_sub
     and n.read_at is null
     and (p_id is null or n.id = p_id);   -- بلا معرّف: الكل
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- ----------------------------------------------------------------------------
-- (١١) الأدمن يرى مَن يسمع الآن — قبل أن يبثّ (د٣)
-- ----------------------------------------------------------------------------

create or replace function public.admin_partner_availability()
returns table (
  subcontractor_id  uuid,
  company_name      text,
  status            text,
  reachable         boolean,
  willing           boolean,
  available         boolean,
  reaching_channels text[],
  has_telegram_id   boolean,
  push_devices      integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.company_name, s.status,
         a.reachable, a.willing, a.available, a.reaching_channels,
         btrim(coalesce(s.telegram_chat_id, '')) <> '',
         (select count(*)::integer from public.partner_push_subscriptions ps
           where ps.subcontractor_id = s.id)
  from public.subcontractors s
  cross join lateral public.partner_availability(s.id) a
  where public.is_admin()          -- 🔒 الحارس داخل الدالة: definer تتجاوز RLS
  order by a.available desc, s.company_name asc;
$$;

comment on function public.admin_partner_availability() is
  'مَن يسمع البثّ الآن — للأدمن وحده. الحارس is_admin() داخل الجسم لأن definer تتجاوز RLS، '
  'ومنحُ التنفيذ لـauthenticated بلا حارس كان سيُري كل متعهدٍ قائمةَ منافسيه (D-19).';

-- ----------------------------------------------------------------------------
-- (١٢) RLS
-- ----------------------------------------------------------------------------

alter table public.partner_alert_prefs         enable row level security;
alter table public.partner_push_subscriptions  enable row level security;
alter table public.notification_providers      enable row level security;

drop policy if exists partner_alert_prefs_select_own_or_admin on public.partner_alert_prefs;
create policy partner_alert_prefs_select_own_or_admin on public.partner_alert_prefs
  for select to authenticated
  using (subcontractor_id = public.current_subcontractor_id() or public.is_admin());

drop policy if exists partner_alert_prefs_insert_own_or_admin on public.partner_alert_prefs;
create policy partner_alert_prefs_insert_own_or_admin on public.partner_alert_prefs
  for insert to authenticated
  with check (subcontractor_id = public.current_subcontractor_id() or public.is_admin());

drop policy if exists partner_alert_prefs_update_own_or_admin on public.partner_alert_prefs;
create policy partner_alert_prefs_update_own_or_admin on public.partner_alert_prefs
  for update to authenticated
  using (subcontractor_id = public.current_subcontractor_id() or public.is_admin())
  with check (subcontractor_id = public.current_subcontractor_id() or public.is_admin());

drop policy if exists partner_push_select_own_or_admin on public.partner_push_subscriptions;
create policy partner_push_select_own_or_admin on public.partner_push_subscriptions
  for select to authenticated
  using (subcontractor_id = public.current_subcontractor_id() or public.is_admin());

drop policy if exists partner_push_insert_own on public.partner_push_subscriptions;
create policy partner_push_insert_own on public.partner_push_subscriptions
  for insert to authenticated
  with check (subcontractor_id = public.current_subcontractor_id());

drop policy if exists partner_push_delete_own_or_admin on public.partner_push_subscriptions;
create policy partner_push_delete_own_or_admin on public.partner_push_subscriptions
  for delete to authenticated
  using (subcontractor_id = public.current_subcontractor_id() or public.is_admin());

-- `notification_providers` **بلا سياسةٍ واحدة لأي دور مستخدم**: تُقرأ بدوال
-- definer وتُكتب بـservice_role. وRLS مفعَّلة على كل حال — الطبقتان معاً.

-- ----------------------------------------------------------------------------
-- (١٣) المنح — `revoke` أولاً ثم `grant` الأضيق (اتفاقية ٦ · القاعدة الذهبية ١٦)
--
-- 🔴 وهذه الكتلة **حمّالة لا زخرفية**: Supabase تمنح الأدوار العامة صلاحيات
--    واسعة على الجداول الجديدة، ومنها `TRUNCATE` **وهي لا تخضع لـRLS إطلاقاً**.
--    فجدولٌ سياساته محكمة تماماً يبقى قابلاً للتفريغ من زائرٍ مجهول. حذفُ سطرٍ
--    من هنا يفتح الجدول، ولا سياسةَ تمنعه. (الثغرة الحيّة التي أُغلقت في 0041.)
-- ----------------------------------------------------------------------------

revoke all on table public.partner_alert_prefs        from public, anon;
revoke all on table public.partner_push_subscriptions from public, anon;
revoke all on table public.notification_providers     from public, anon, authenticated;

grant select, insert, update on table public.partner_alert_prefs to authenticated;
grant select, insert, update, delete on table public.partner_alert_prefs to service_role;

-- لا `update` للمتعهد على اشتراك جهاز: التحديث يمرّ بـ`portal_register_push`
-- وحدها (تصادم `endpoint`)، فلا يستطيع أحد تحويل اشتراكٍ قائم إلى نفسه بتحديثٍ مباشر.
grant select, insert, delete on table public.partner_push_subscriptions to authenticated;
grant select, insert, update, delete on table public.partner_push_subscriptions to service_role;

grant select, insert, update, delete on table public.notification_providers to service_role;

-- الدوال: الجديدة المحسوبة داخلياً **لا تُمنح لأي دور مستخدم**
revoke all on function public.provider_ready(text)                       from public, anon, authenticated;
revoke all on function public.partner_channels(uuid)                     from public, anon, authenticated;
revoke all on function public.partner_availability(uuid)                 from public, anon, authenticated;
revoke all on function public.partner_available(uuid)                    from public, anon, authenticated;
revoke all on function public.notification_channels_for(text, uuid)      from public, anon, authenticated;
revoke all on function public.queue_notification(text, jsonb, text, uuid) from public, anon, authenticated;

-- ⚠ ولماذا `partner_availability` مسحوبةٌ من `authenticated` رغم أنها تبدو
--    بريئة؟ لأنها تقبل **أي** معرّف متعهد: منحُها تُري كل متعهدٍ حالةَ كل
--    منافسيه ومتى يكون كلٌّ منهم صامتاً — أي متى يبثّ وحده. (D-19)
--    ومَن يحتاجها يصل إليها عبر `portal_alert_prefs()` (صفّه هو) أو
--    `admin_partner_availability()` (محروسة بـ`is_admin()`).

revoke all on function public.portal_alert_prefs()                       from public, anon;
grant execute on function public.portal_alert_prefs()                    to authenticated, service_role;
revoke all on function public.portal_set_alert_prefs(boolean, boolean, boolean, boolean, boolean) from public, anon;
grant execute on function public.portal_set_alert_prefs(boolean, boolean, boolean, boolean, boolean) to authenticated, service_role;
revoke all on function public.portal_set_telegram_chat_id(text)          from public, anon;
grant execute on function public.portal_set_telegram_chat_id(text)       to authenticated, service_role;
revoke all on function public.portal_push_devices()                      from public, anon;
grant execute on function public.portal_push_devices()                   to authenticated, service_role;
revoke all on function public.portal_register_push(text, text, text, text) from public, anon;
grant execute on function public.portal_register_push(text, text, text, text) to authenticated, service_role;
revoke all on function public.portal_remove_push(uuid)                   from public, anon;
grant execute on function public.portal_remove_push(uuid)                to authenticated, service_role;
revoke all on function public.portal_inbox(integer)                      from public, anon;
grant execute on function public.portal_inbox(integer)                   to authenticated, service_role;
revoke all on function public.portal_inbox_mark_read(uuid)               from public, anon;
grant execute on function public.portal_inbox_mark_read(uuid)            to authenticated, service_role;
revoke all on function public.admin_partner_availability()               from public, anon;
grant execute on function public.admin_partner_availability()            to authenticated, service_role;

-- والدوال المعاد تعريفها أعلاه: `create or replace` **لا يُعيد ضبط المنح**،
-- لكن إعادةَ كتابتها صراحةً تجعل الملف قابلاً للتنفيذ على قاعدةٍ بكر أيضاً.
revoke all on function public.notification_channels()      from public, anon, authenticated;
revoke all on function public.queue_notification(text, jsonb) from public, anon, authenticated;
revoke all on function public.dispatch_pool(uuid, integer) from public, anon, authenticated;
revoke all on function public.dispatch_broadcast(uuid, integer) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- (١٤) حارسٌ بنيوي يفشل بصوت — لا يقرأ نصّاً ولا يطابق أنماطاً
--
-- النمط ٩ في `LESSONS.md`: حارسٌ كُتب بصيغةٍ لا يمكن أن تفشل ليس حارساً.
-- فكل فحصٍ هنا **ينفّذ نداءً** أو يقرأ الكتالوج، ثم يرمي.
-- ----------------------------------------------------------------------------

do $$
declare
  v_missing text;
begin
  -- (أ) الأعمدة موجودة فعلاً — لا تُقرأ من الذاكرة (القاعدة الذهبية ١٤)
  select string_agg(x.col, '، ') into v_missing
  from (values
    ('subcontractors.telegram_chat_id'),
    ('notifications.recipient_kind'), ('notifications.recipient_id'),
    ('notifications.read_at'), ('notifications.escalation')
  ) as x(col)
  where not exists (
    select 1 from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name   = split_part(x.col, '.', 1)
      and c.column_name  = split_part(x.col, '.', 2)
  );
  if v_missing is not null then
    raise exception '0054: أعمدة لم تُنشأ: %', v_missing;
  end if;

  -- (ب) التوقيع القديم ما زال حياً — سبعةُ مُنادين يعتمدون عليه
  if to_regprocedure('public.queue_notification(text, jsonb)') is null then
    raise exception '0054: التوقيع الثنائي لـqueue_notification اختفى — سبعةُ مُنادين انكسروا صامتين';
  end if;

  -- (ج) `inbox` لا يجعل أحداً بالغاً — القرار البنيوي (١)، وهو ما يُنسى أولاً
  if 'inbox' = any (array['telegram', 'webpush', 'email']) then
    raise exception '0054: inbox صار قناةً بالغة — الاحتياطي يصمت في الحالة التي وُجد لها';
  end if;

  -- (د) البريد مطفأ في القاعدة ما لم يُقَس جاهزاً — لا يُدَّعى
  if public.provider_ready('email') and not exists (
    select 1 from public.notification_providers where channel = 'email' and ready
  ) then
    raise exception '0054: provider_ready تقول شيئاً لا يقوله الجدول';
  end if;
end;
$$;

-- ⚠ ولا سطرَ تسجيلٍ في `schema_migrations` هنا: المُشغّل (`scripts/db-migrate.mjs`)
--    يكتبه بنفسه بعد نجاح الملف، وتسجيلٌ داخل الملف يجعل إدراجه يصطدم فتُرجَع
--    الهجرة كلها. (لا يوجد في 0051 ولا 0053 ولا ما قبلهما.)
