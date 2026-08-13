-- ============================================================================
-- 0013_dispatch.sql — البث والإسناد الذرّي (المرحلة ٦)
--
-- العقد المرجعي: lib/dispatch-types.ts — أسماء الحالات والجداول والدوال وحقول
-- OfferPreview/AssignedTripDetails وDEFAULT_DISPATCH كلها منه حرفياً، لا انحراف.
-- والقرار الحاكم من VISION.md (قسم «المتعهدون» + ملحق ٢):
--
--     يُشعَر المتعهدون المناسبون فور تأكيد الطلب، فيقبل أو يرفض أو يتجاهل داخل
--     مهلة، ومن يقبل أولاً **يفوز** ويُمنع الباقون من التفاعل. وبعد استنفاد
--     الموجات يتحول الطلب إلى فريق التشغيل يدوياً.
--
-- ── الأعمدة الثلاثة التي يقوم عليها هذا الملف ───────────────────────────────
--
-- (١) **الذرّية**: أول قابل يفوز، والخسارة جواب نظيف لا انهيار. الضمان طبقتان:
--     • قفل صف دورة البث (`select … for update`) فيتسلسل القبولان حتماً؛
--     • **فهرس فريد جزئي** `trip_offers (booking_id) where status='accepted'`
--       يجعل وجود فائزَين مستحيلاً بنيوياً حتى لو أخطأت دالة مستقبلية في القفل.
--     القفل يمنع السباق، والفهرس يمنع الكارثة إن سقط القفل. الخاسر يرى
--     استثناءً برمز `already-assigned` — خبر لا عطل.
--
-- (٢) **حماية الهامش بالموجات**: سعر العميل حُسب من **أرخص** متعهد مغطٍّ، فلو
--     قبل الطلبَ متعهد أغلى تآكل الهامش. لذلك البث بسقف تكلفة يتسع موجةً بعد
--     موجة (القسم ٣)، وبعد آخر موجة يتحول الطلب إلى الطابور اليدوي بإشعار.
--
-- (٣) **خصوصية العميل بنيوية لا انضباطية**: `portal_offers()` — وهي كل ما يراه
--     المتعهد قبل القبول — لا تحمل اسم العميل ولا هاتفه ولا واتسابه في **نوع
--     إرجاعها أصلاً**، وتُنقّح العنوان الدقيق ووسائل التواصل داخل الملاحظات.
--     بيانات التواصل تظهر في `portal_trips()` وحدها، أي بعد الإسناد. نفس أسلوب
--     `quote_public` في 0012: ما ليس في نوع الإرجاع لا يمكن تسريبه.
--
-- يُنفَّذ بعد 0007 (bookings/notifications/guard_booking_status/queue_notification)
-- و0009 (haversine + أسلوب التصليب) و0010 (المتعهدون/التغطية/الهامش) و0011
-- (عزل متعهد ضد متعهد + لقطة التكلفة المطبَّقة) و0012 (واجهة التسعير العامة).
--
-- ⚠ الفخاخ الأربعة المُوثَّقة في 0007/0009/0010 ويتكرر تجنّبها هنا حرفياً:
--   ١) الوصول إلى جدول طبقتان: GRANT + سياسة RLS، وكلاهما مطلوب.
--   ٢) إعدادات Supabase الافتراضية تمنح anon/authenticated **كل** الصلاحيات على
--      أي جدول جديد — وTRUNCATE لا تخضع لـ RLS إطلاقاً. لذلك: revoke all ثم منح صريح.
--   ٣) الدوال الجديدة تولد ومعها EXECUTE لـ PUBLIC ومنح افتراضي لـ anon، و
--      `create or replace` لا يعيد ضبط الصلاحيات. لذلك: revoke from public, anon,
--      authenticated ثم grant صريح لكل دالة.
--   ٤) كل definer يثبّت `search_path = ''` ويؤهّل كل اسم بالمخطط.
--
-- آمن لإعادة التنفيذ بالكامل.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (١) الجداول الثلاثة
-- التسمية snake_case مطابقة لحقول camelCase في lib/dispatch-types.ts حرفياً
-- (windowMinutes → window_minutes ...) لأن الواجهة تقرأ أعمدة الجدول مباشرة.
-- ----------------------------------------------------------------------------

-- (١-١) إعدادات البث — نمط الصف الواحد (id boolean + مفتاح أساسي = صف واحد حتماً)
--       القيم الابتدائية مطابقة لـ DEFAULT_DISPATCH في العقد.
create table if not exists public.dispatch_settings (
  id                boolean primary key default true check (id),
  -- مهلة الموجة الواحدة بالدقائق (سقف أسبوع صمام أمان ضد خطأ إدخال)
  window_minutes    integer not null default 30
                    check (window_minutes between 1 and 10080),
  -- أقصى عدد موجات قبل التحويل اليدوي (٢ = موجة الهامش الكامل ثم موجة التعادل)
  max_rounds        integer not null default 2
                    check (max_rounds between 1 and 10),
  auto_start        boolean not null default true,
  -- أقل هامش مقبول بالجنيه في الموجة الأخيرة قبل التحويل اليدوي
  min_margin_amount numeric(12,2) not null default 0 check (min_margin_amount >= 0),
  updated_at        timestamptz not null default now()
);

insert into public.dispatch_settings (id) values (true) on conflict (id) do nothing;

drop trigger if exists dispatch_settings_touch_updated_at on public.dispatch_settings;
create trigger dispatch_settings_touch_updated_at
  before update on public.dispatch_settings
  for each row execute function public.touch_updated_at();

comment on table public.dispatch_settings is
  'إعدادات البث — صف وحيد. المصدر: DispatchSettings في lib/dispatch-types.ts.';

-- (١-٢) دورة البث لكل حجز — صف واحد لكل حجز (booking_id هو المفتاح الأساسي)
--
-- assigned_subcontractor_id بـ on delete set null: حذف متعهد لا يمحو تاريخ إسناد
-- رحلة (نفس قرار bookings.subcontractor_id في 0010).
--
-- ⚠ ملاحظة محاسبية مهمة: هذا العمود هو **المنفّذ**، وbookings.subcontractor_id
-- هو **من سُعِّر على أساسه**. لا يُكتب أحدهما فوق الآخر أبداً: الفرق بينهما هو
-- بالضبط ما يقيس تآكل الهامش في تقارير المرحلة ٧.
create table if not exists public.dispatches (
  booking_id                uuid primary key
                            references public.bookings(id) on delete cascade,
  status                    text not null default 'queued'
                            check (status in ('queued', 'broadcasting', 'assigned',
                                              'manual', 'cancelled')),
  -- رقم الموجة الجارية (٠ = أُنشئ الصف ولم تبدأ موجة بعد)
  round                     integer not null default 0 check (round >= 0),
  assigned_subcontractor_id uuid references public.subcontractors(id) on delete set null,
  assigned_at               timestamptz,
  -- مستحق الفائز فعلياً (قد يفوق التكلفة المُسعَّر بها في الموجة ٢)
  assigned_payout           numeric(12,2) check (assigned_payout is null or assigned_payout >= 0),
  -- أُسند يدوياً من فريق التشغيل لا بقبول تلقائي
  manual_assign             boolean not null default false,
  last_broadcast_at         timestamptz,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

drop trigger if exists dispatches_touch_updated_at on public.dispatches;
create trigger dispatches_touch_updated_at
  before update on public.dispatches
  for each row execute function public.touch_updated_at();

-- مسار قراءة الدورة المجدولة: من ينتظر موجة تالية، الأقدم بثاً أولاً
create index if not exists dispatches_status_broadcast_idx
  on public.dispatches (status, last_broadcast_at);

-- مسار المرحلة ٧: مستحقات متعهد بعينه
create index if not exists dispatches_assigned_sub_idx
  on public.dispatches (assigned_subcontractor_id, assigned_at desc);

comment on table public.dispatches is
  'دورة البث لكل حجز — الحالة والموجة والفائز. المصدر: DispatchRow في lib/dispatch-types.ts.';

-- (١-٣) عروض الرحلات — صف لكل (حجز × متعهد × موجة)
--
-- payout = **تكلفة هذا المتعهد هو** من قائمة أسعاره بعد معامل الذهاب والعودة،
-- لا سعر العميل ولا تكلفة منافسه. وهو ما يُخزَّن في الإسناد فيُقاس عليه الهامش.
create table if not exists public.trip_offers (
  id               uuid primary key default gen_random_uuid(),
  booking_id       uuid not null references public.bookings(id) on delete cascade,
  subcontractor_id uuid not null references public.subcontractors(id) on delete cascade,
  round            integer not null default 1 check (round >= 1),
  payout           numeric(12,2) not null check (payout >= 0),
  status           text not null default 'pending'
                   check (status in ('pending', 'accepted', 'rejected', 'expired', 'revoked')),
  expires_at       timestamptz not null,
  responded_at     timestamptz,
  reason           text,
  created_at       timestamptz not null default now()
);

alter table public.trip_offers drop constraint if exists trip_offers_reason_len_chk;
alter table public.trip_offers
  add constraint trip_offers_reason_len_chk
  check (reason is null or length(reason) <= 1000) not valid;

-- عرض واحد لكل متعهد في الموجة الواحدة — تكرار البث لا يضاعف العروض
create unique index if not exists trip_offers_booking_sub_round_key
  on public.trip_offers (booking_id, subcontractor_id, round);

-- 🔒 حجر الزاوية: **فائز واحد لكل حجز، بنيوياً**
-- فهرس فريد جزئي على المقبولة وحدها. قبولان متزامنان ⇒ الثاني يصطدم بـ
-- unique_violation فيتحول إلى جواب «أُسند بالفعل» بدل رحلة يظنها اثنان لهما.
create unique index if not exists trip_offers_one_accepted_key
  on public.trip_offers (booking_id)
  where status = 'accepted';

-- مسار صندوق البورتال: عروض متعهد بعينه
create index if not exists trip_offers_sub_status_idx
  on public.trip_offers (subcontractor_id, status, expires_at);

-- مسار الدورة المجدولة: المعلّقة المنتهية مهلتها
create index if not exists trip_offers_pending_expiry_idx
  on public.trip_offers (expires_at)
  where status = 'pending';

-- مسار سجل البث في اللوحة
create index if not exists trip_offers_booking_created_idx
  on public.trip_offers (booking_id, created_at);

comment on table public.trip_offers is
  'عروض الرحلات على المتعهدين — صف لكل (حجز × متعهد × موجة). المصدر: TripOfferRow في lib/dispatch-types.ts.';

comment on column public.trip_offers.payout is
  'مستحق هذا المتعهد من قائمة أسعاره بعد معامل الذهاب والعودة — ليس سعر العميل.';

-- ----------------------------------------------------------------------------
-- (٢) أدوات الخصوصية — حدّ ما قبل القبول في مكان واحد
--
-- القاعدة: قبل القبول لا اسم عميل ولا رقم ولا **عنوان دقيق**. وسم المكان الآتي
-- من الترميز الجغرافي قد يحمل رقم عقار أو اسم شارع برقم، فنُسقط كل مقطع يحوي
-- رقماً ونُبقي المقاطع الوصفية (الحي/المدينة/المحافظة). وملاحظة العميل قد تحوي
-- هاتفاً أو بريداً كتبه بيده، فتُقنَّع أرقام التواصل والبريد قبل أي عرض.
--
-- immutable لأن الناتج دالة المدخل وحده — فتصلح داخل الفهارس والاستعلامات معاً.
-- ----------------------------------------------------------------------------
create or replace function public.dispatch_public_label(p_label text)
returns text
language sql
immutable
set search_path = ''
as $$
  with src as (
    select btrim(coalesce(p_label, '')) as raw
  ),
  parts as (
    select btrim(t.part) as part, t.ord
    from src
    cross join lateral regexp_split_to_table(src.raw, '\s*[,،]\s*')
      with ordinality as t(part, ord)
  ),
  kept as (
    select p.part, p.ord
    from parts p
    where p.part <> '' and p.part !~ '[0-9٠-٩]'
  )
  select coalesce(
    -- المقاطع الوصفية مجتمعة
    nullif((select string_agg(k.part, '، ' order by k.ord) from kept k), ''),
    -- وإن كانت كلها مرقّمة: آخر مقطع وحده (الأعمّ جغرافياً) لا الوسم كاملاً
    nullif((select p.part from parts p order by p.ord desc limit 1), ''),
    nullif((select src.raw from src), '')
  );
$$;

comment on function public.dispatch_public_label(text) is
  'وسم مكان عام — يُسقط المقاطع المرقَّمة (رقم عقار/شارع) فلا يعرف المتعهد العنوان الدقيق قبل الإسناد.';

create or replace function public.dispatch_safe_notes(p_notes text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(
    left(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            btrim(coalesce(p_notes, '')),
            -- بريد إلكتروني
            '[[:alnum:]._%+-]+@[[:alnum:].-]+\.[[:alpha:]]{2,}', '▪▪▪', 'g'
          ),
          -- سلسلة أرقام تصلح هاتفاً (٨ خانات فأكثر، عربية أو هندية، بفواصل شائعة)
          '\+?[0-9٠-٩][0-9٠-٩ ()\-]{6,}[0-9٠-٩]', '▪▪▪', 'g'
        ),
        '\s+', ' ', 'g'
      ),
      400
    ),
  '');
$$;

comment on function public.dispatch_safe_notes(text) is
  'ملاحظة العميل بعد تقنيع وسائل التواصل — تُعرض للمتعهد قبل القبول بلا هاتف ولا بريد.';

-- ----------------------------------------------------------------------------
-- (٣) الإعدادات والسقف والحوض المؤهل
--
-- ── قاعدة الموجات ──────────────────────────────────────────────────────────
--   الأساس (base):
--     • حجز سُعِّر من متعهد  ⇒ التكلفة المُسعَّر بها (bookings.subcontractor_cost)
--     • حجز سُعِّر بالتعريفة ⇒ الإجمالي − أرضية الهامش (لا مرجع تكلفة أصلاً)
--   السقف:
--     • الموجة ١ ⇒ base                       (الهامش كامل)
--     • الموجة ≥٢ ⇒ base + (الهامش − أرضيته)  (تعادل مع إبقاء الأرضية)
--   وأرضية الهامش (minMarginAmount) وصفها في العقد «أقل هامش مقبول في الموجة
--   الأخيرة»، ولذلك تُخصم من اتساع الموجة لا تُضاف إليه. وبالقيمة الافتراضية
--   (صفر) يصير سقف الموجة ٢ = التكلفة + الهامش تماماً كما في العقد.
--   ولا يتسع السقف بعد الموجة ٢ مهما زاد max_rounds: التعادل حدّ لا يُتجاوَز،
--   وما بعده قرار بشري في الطابور اليدوي.
-- ----------------------------------------------------------------------------
create or replace function public.dispatch_config()
returns table (
  window_minutes    integer,
  max_rounds        integer,
  auto_start        boolean,
  min_margin_amount numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  -- التدهور الرشيق: بلا صف إعدادات تعمل القيم الافتراضية من العقد
  select
    coalesce(d.window_minutes, 30),
    coalesce(d.max_rounds, 2),
    coalesce(d.auto_start, true),
    coalesce(d.min_margin_amount, 0)
  from (select 1) one
  left join public.dispatch_settings d on d.id;
$$;

create or replace function public.dispatch_ceiling(p_booking_id uuid, p_round integer)
returns numeric
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_b      record;
  v_cfg    record;
  v_base   numeric;
  v_widen  numeric;
begin
  select b.total, b.price_source, b.subcontractor_cost, b.margin_amount
    into v_b
  from public.bookings b
  where b.id = p_booking_id;

  if not found then
    return null;
  end if;

  select * into v_cfg from public.dispatch_config();

  if v_b.subcontractor_cost is not null and coalesce(v_b.price_source, '') = 'subcontractor' then
    v_base  := v_b.subcontractor_cost;
    v_widen := greatest(coalesce(v_b.margin_amount, 0) - v_cfg.min_margin_amount, 0);
  else
    -- حجز بلا مرجع تكلفة: السقف هو ما يبقي أرضية الهامش سليمة
    v_base  := greatest(coalesce(v_b.total, 0) - v_cfg.min_margin_amount, 0);
    v_widen := 0;
  end if;

  return round(v_base + case when coalesce(p_round, 1) <= 1 then 0 else v_widen end, 2);
end;
$$;

-- الحوض المؤهل للموجة: من يغطي المسار **ويملك مركبة في الفئة المحجوزة**
-- **وتكلفته داخل سقف الموجة**. وترتيبه بالأرخص لأن سجل البث يُقرأ بالأرخص أولاً.
--
-- تستدعي coverage_matches من داخل definer: الدالة ممنوعة على كل دور مستخدم منذ
-- 0011 (متعهد يمسح الخريطة = كشف بالمنافسين)، لكن مالك الدالة يملكها فتُنفَّذ من
-- الداخل بلا أي إضعاف لذلك الحاجز.
create or replace function public.dispatch_pool(p_booking_id uuid, p_round integer)
returns table (
  subcontractor_id uuid,
  payout           numeric
)
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
  )
  select c.sid, round(c.cost * v_factor, 2)
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
  order by 2 asc, 1 asc;
end;
$$;

-- حمولة الإشعار — مكان واحد يحسم ما يظهر قبل القبول وما يظهر بعده.
-- p_public = true ⇒ حمولة المتعهد قبل القبول: وسوم عامة وملاحظة منقّحة، وبلا أي
-- حقل عميل وبلا سعر العميل. false ⇒ حمولة التشغيل/الإسناد: كل شيء.
create or replace function public.dispatch_trip_payload(p_booking_id uuid, p_public boolean)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select
    jsonb_build_object(
      'bookingId',    b.id,
      'reference',    b.reference,
      'classSlug',    b.class_slug,
      'classTitle',   b.class_title,
      'currency',     b.currency,
      'originLabel',  case when p_public
                           then public.dispatch_public_label(b.trip ->> 'originLabel')
                           else b.trip ->> 'originLabel' end,
      'destLabel',    case when p_public
                           then public.dispatch_public_label(b.trip ->> 'destLabel')
                           else b.trip ->> 'destLabel' end,
      'distanceKm',   public.jsonb_number(b.trip, 'distanceKm', null),
      'passengers',   public.jsonb_number(b.trip, 'passengers', null),
      'roundTrip',    coalesce(b.trip ->> 'roundTrip', 'false') in ('true', 't', '1'),
      'waitingHours', public.jsonb_number(b.trip, 'waitingHours', null),
      'pickupAt',     b.trip ->> 'pickupAt',
      'notes',        case when p_public
                           then public.dispatch_safe_notes(b.trip ->> 'notes')
                           else b.trip ->> 'notes' end
    )
    ||
    case when p_public then '{}'::jsonb
         else jsonb_build_object(
                'customerName',     b.customer_name,
                'customerPhone',    b.customer_phone,
                'customerWhatsapp', b.customer_whatsapp,
                'total',            b.total,
                'status',           b.status
              )
    end
  from public.bookings b
  where b.id = p_booking_id;
$$;

-- من يحق له تشغيل عمليات البث الإدارية: المشرف بجلسته، أو الخادم الموثوق
-- (عميل الخدمة — بلا auth.uid()). وanon لا يملك EXECUTE على أي منها أصلاً،
-- فالطبقتان معاً تغلقان الباب على المتعهد وعلى الزائر.
create or replace function public.dispatch_ops_allowed()
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

  -- مطالبة مشوّهة في الجلسة لا يجوز أن تُسقط البث — تُقرأ كـ «بلا هوية»
  begin
    v_uid := auth.uid();
  exception
    when others then
      v_uid := null;
  end;

  -- الشكل المعتاد لمفتاح الخدمة: رمز بلا هوية مستخدم
  if v_uid is null then
    return true;
  end if;

  -- وإن حمل رمز الخدمة هوية أيضاً، نقرأ دوره من المطالبات بحذر (قد لا تكون JSON)
  begin
    v_role := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role';
  exception
    when others then
      v_role := null;
  end;

  return coalesce(v_role, '') = 'service_role';
end;
$$;

-- ----------------------------------------------------------------------------
-- (٤) البث — إنشاء عروض الموجة وإشعار أصحابها
--
-- idempotent لكل موجة: الفهرس الفريد (حجز، متعهد، موجة) يجعل إعادة النداء بلا
-- أثر، والإشعار لا يُرسل إلا لعرض أُنشئ فعلاً في هذا النداء.
--
-- من رفض الطلب صراحةً لا يُعاد عليه في موجة تالية — رفضه قرار في هذه الرحلة لا
-- في هذا السعر. أما من انتهت مهلته بلا رد فيُعاد عليه (قد يكون فاته الإشعار).
-- ----------------------------------------------------------------------------
create or replace function public.dispatch_broadcast(p_booking_id uuid, p_round integer)
returns integer
language plpgsql
volatile
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
      on conflict (booking_id, subcontractor_id, round) do nothing
      returning o.id, o.subcontractor_id, o.payout, o.expires_at
    )
    select f.id, f.subcontractor_id, f.payout, f.expires_at,
           s.company_name, s.email
    from fresh f
    join public.subcontractors s on s.id = f.subcontractor_id
  loop
    v_count := v_count + 1;

    perform public.queue_notification(
      'trip_offered',
      v_base || jsonb_build_object(
        'offerId',          v_row.id,
        'subcontractorId',  v_row.subcontractor_id,
        'companyName',      v_row.company_name,
        'partnerEmail',     v_row.email,
        'payout',           v_row.payout,
        'expiresAt',        v_row.expires_at,
        'windowMinutes',    v_cfg.window_minutes,
        'round',            p_round,
        'maxRounds',        v_cfg.max_rounds
      )
    );
  end loop;

  return v_count;
end;
$$;

-- start_dispatch — يبدأ الموجة ١ أو يفتح الموجة التالية مبكراً.
--
-- الحالات:
--   لا صف دورة / queued        ⇒ الموجة ١
--   broadcasting وفيها معلّق    ⇒ لا شيء (نداء مكرر — يعيد الحالة كما هي)
--   broadcasting وانتهت ردودها ⇒ الموجة التالية، أو التحويل اليدوي عند الاستنفاد
--   manual                      ⇒ موجة إضافية إن بقيت موجات، وإلا لا شيء
--   assigned / cancelled        ⇒ استثناء واضح
create or replace function public.start_dispatch(p_booking_id uuid)
returns table (
  status  text,
  round   integer,
  offers  integer,
  ceiling numeric
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_b       record;
  v_d       record;
  v_cfg     record;
  v_pending integer := 0;
  v_next    integer;
  v_made    integer := 0;
begin
  if not public.dispatch_ops_allowed() then
    raise exception 'بدء البث متاح للمشرف أو لخادم الموقع فقط' using hint = 'forbidden';
  end if;

  if p_booking_id is null then
    raise exception 'معرّف الحجز مطلوب' using hint = 'invalid-input';
  end if;

  select b.id, b.status, b.reference into v_b
  from public.bookings b
  where b.id = p_booking_id;

  if not found then
    raise exception 'الحجز غير موجود' using hint = 'booking-not-found';
  end if;

  if v_b.status <> 'confirmed' then
    raise exception 'البث يبدأ على الحجز المؤكَّد فقط (حالته الآن «%»)', v_b.status
      using hint = 'booking-not-confirmed';
  end if;

  select * into v_cfg from public.dispatch_config();

  insert into public.dispatches as d (booking_id, status)
  values (p_booking_id, 'queued')
  on conflict (booking_id) do nothing;

  select * into v_d from public.dispatches d
   where d.booking_id = p_booking_id
   for update;

  if v_d.status = 'assigned' then
    raise exception 'أُسند هذا الطلب بالفعل' using hint = 'already-assigned';
  end if;

  if v_d.status = 'cancelled' then
    raise exception 'دورة بث هذا الطلب مغلقة' using hint = 'invalid-dispatch-status';
  end if;

  select count(*) into v_pending
  from public.trip_offers o
  where o.booking_id = p_booking_id
    and o.status     = 'pending'
    and o.expires_at > now();

  -- موجة سارية: النداء المكرر لا يضاعف العروض ولا يقصّر المهلة
  if v_pending > 0 and v_d.status = 'broadcasting' then
    status  := v_d.status;
    round   := v_d.round;
    offers  := 0;
    ceiling := public.dispatch_ceiling(p_booking_id, v_d.round);
    return next;
    return;
  end if;

  v_next := v_d.round + 1;

  if v_next > v_cfg.max_rounds then
    if v_d.status <> 'manual' then
      update public.dispatches d set status = 'manual' where d.booking_id = p_booking_id;
      perform public.queue_notification(
        'dispatch_exhausted',
        public.dispatch_trip_payload(p_booking_id, false) || jsonb_build_object(
          'rounds',       v_d.round,
          'maxRounds',    v_cfg.max_rounds,
          'offersCount',  (select count(*) from public.trip_offers o where o.booking_id = p_booking_id),
          'pricedCost',   (select b2.subcontractor_cost from public.bookings b2 where b2.id = p_booking_id),
          'ceiling',      public.dispatch_ceiling(p_booking_id, v_d.round)
        )
      );
    end if;

    status  := 'manual';
    round   := v_d.round;
    offers  := 0;
    ceiling := public.dispatch_ceiling(p_booking_id, v_d.round);
    return next;
    return;
  end if;

  -- العروض المعلّقة من موجة سابقة تُسحب قبل فتح موجة أوسع: مهلتان مفتوحتان على
  -- الطلب نفسه تعنيان سعرين مفتوحين في وقت واحد.
  update public.trip_offers o
     set status = 'expired', responded_at = now()
   where o.booking_id = p_booking_id
     and o.status     = 'pending';

  v_made := public.dispatch_broadcast(p_booking_id, v_next);

  status  := 'broadcasting';
  round   := v_next;
  offers  := v_made;
  ceiling := public.dispatch_ceiling(p_booking_id, v_next);
  return next;
end;
$$;

-- ----------------------------------------------------------------------------
-- (٥) رد المتعهد — القبول الذرّي والرفض الصريح
--
-- ترتيب الأقفال ثابت في كل الدوال: **dispatches ← trip_offers ← bookings**.
-- ترتيب موحّد = لا جمود (deadlock) بين قبولين متزامنين.
-- ----------------------------------------------------------------------------
create or replace function public.accept_offer(p_offer_id uuid)
returns table (
  booking_id  uuid,
  reference   text,
  payout      numeric,
  assigned_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_sub     uuid;
  v_offer   record;
  v_d       record;
  v_b       record;
  v_company text;
  v_phone   text;
  v_cfg     record;
  v_now     timestamptz := now();
begin
  v_sub := public.current_subcontractor_id();
  if v_sub is null then
    raise exception 'قبول العروض متاح لحساب متعهد فقط' using hint = 'forbidden';
  end if;

  select o.* into v_offer from public.trip_offers o where o.id = p_offer_id;
  if not found then
    raise exception 'العرض غير موجود' using hint = 'offer-not-found';
  end if;

  -- عرض متعهد آخر: لا يُقرأ ولا يُقبل — والرسالة لا تكشف وجوده لصاحبها الحقيقي
  if v_offer.subcontractor_id is distinct from v_sub then
    raise exception 'هذا العرض ليس ضمن عروضك' using hint = 'forbidden';
  end if;

  -- (١) قفل دورة البث: كل قبول لهذا الحجز يمر من هنا، فيتسلسل القبولان حتماً
  select d.* into v_d from public.dispatches d
   where d.booking_id = v_offer.booking_id
   for update;

  if not found then
    raise exception 'دورة بث هذا الطلب غير موجودة' using hint = 'dispatch-not-found';
  end if;

  -- (٢) إعادة الفحص **بعد** القفل — لا قبل: هنا بالضبط يقف الخاسر
  if v_d.status = 'assigned' then
    raise exception 'سبقك متعهد آخر إلى هذا الطلب' using hint = 'already-assigned';
  end if;

  if v_d.status = 'cancelled' then
    raise exception 'أُغلقت دورة بث هذا الطلب' using hint = 'invalid-dispatch-status';
  end if;

  select o.* into v_offer from public.trip_offers o where o.id = p_offer_id for update;

  if v_offer.status <> 'pending' then
    if v_offer.status in ('revoked', 'accepted') then
      raise exception 'سبقك متعهد آخر إلى هذا الطلب' using hint = 'already-assigned';
    elsif v_offer.status = 'expired' then
      raise exception 'انتهت مهلة هذا العرض' using hint = 'offer-expired';
    else
      raise exception 'سبق أن رفضت هذا العرض' using hint = 'offer-closed';
    end if;
  end if;

  if v_offer.expires_at <= v_now then
    update public.trip_offers o
       set status = 'expired', responded_at = v_now
     where o.id = p_offer_id;
    raise exception 'انتهت مهلة هذا العرض' using hint = 'offer-expired';
  end if;

  select b.* into v_b from public.bookings b where b.id = v_offer.booking_id for update;

  if v_b.status = 'assigned' then
    raise exception 'سبقك متعهد آخر إلى هذا الطلب' using hint = 'already-assigned';
  elsif v_b.status <> 'confirmed' then
    raise exception 'حالة الحجز لا تسمح بالإسناد الآن («%»)', v_b.status
      using hint = 'invalid-status';
  end if;

  select s.company_name, s.phone into v_company, v_phone
  from public.subcontractors s where s.id = v_sub;

  -- (٣) الفوز — والفهرس الفريد الجزئي هو الحكم الأخير لو تخطّى أحدهم القفل
  begin
    update public.trip_offers o
       set status = 'accepted', responded_at = v_now
     where o.id = p_offer_id;
  exception
    when unique_violation then
      raise exception 'سبقك متعهد آخر إلى هذا الطلب' using hint = 'already-assigned';
  end;

  -- (٤) إغلاق الطلب أمام الباقين — «ومنع الآخرين من التفاعل معه»
  update public.trip_offers o
     set status = 'revoked', responded_at = v_now
   where o.booking_id = v_offer.booking_id
     and o.id        <> p_offer_id
     and o.status     = 'pending';

  update public.dispatches d
     set status                    = 'assigned',
         assigned_subcontractor_id = v_sub,
         assigned_at               = v_now,
         assigned_payout           = v_offer.payout,
         manual_assign             = false
   where d.booking_id = v_offer.booking_id;

  -- (٥) الحالة تنتقل عبر الحارس نفسه (bookings_guard_status) لا حوله:
  -- confirmed → assigned مسموح، وأي حالة أخرى يرفضها الحارس قبل أن نصل هنا.
  -- ⚠ bookings.subcontractor_id لا يُمس: هو لقطة **من سُعِّر على أساسه**،
  -- والمنفّذ يُسجَّل في dispatches.assigned_subcontractor_id.
  perform set_config(
    'tours.booking_note',
    'إسناد تلقائي بقبول المتعهد «' || coalesce(v_company, '؟') || '»',
    true
  );

  update public.bookings b set status = 'assigned' where b.id = v_offer.booking_id;

  select * into v_cfg from public.dispatch_config();

  perform public.queue_notification(
    'trip_assigned',
    public.dispatch_trip_payload(v_offer.booking_id, false) || jsonb_build_object(
      'offerId',          p_offer_id,
      'subcontractorId',  v_sub,
      'companyName',      v_company,
      'partnerPhone',     v_phone,
      'payout',           v_offer.payout,
      'realMargin',       round(coalesce(v_b.total, 0) - v_offer.payout, 2),
      'round',            v_offer.round,
      'maxRounds',        v_cfg.max_rounds,
      'manualAssign',     false,
      'assignedAt',       v_now
    )
  );

  booking_id  := v_offer.booking_id;
  reference   := v_b.reference;
  payout      := v_offer.payout;
  assigned_at := v_now;
  return next;
end;
$$;

-- رفض صريح — يوثّق «لا» صاحبها فلا يُعاد عليه العرض في الموجات التالية،
-- والسبب اختياري يفيد تقييم المتعهدين في المرحلة ٧.
create or replace function public.reject_offer(p_offer_id uuid, p_reason text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_sub    uuid;
  v_offer  record;
  v_reason text;
  v_now    timestamptz := now();
begin
  v_sub := public.current_subcontractor_id();
  if v_sub is null then
    raise exception 'رفض العروض متاح لحساب متعهد فقط' using hint = 'forbidden';
  end if;

  select o.* into v_offer from public.trip_offers o where o.id = p_offer_id;
  if not found then
    raise exception 'العرض غير موجود' using hint = 'offer-not-found';
  end if;

  if v_offer.subcontractor_id is distinct from v_sub then
    raise exception 'هذا العرض ليس ضمن عروضك' using hint = 'forbidden';
  end if;

  select o.* into v_offer from public.trip_offers o where o.id = p_offer_id for update;

  if v_offer.status = 'rejected' then
    return 'rejected';  -- نداء مكرر: النتيجة نفسها لا خطأ
  end if;

  if v_offer.status <> 'pending' then
    if v_offer.status in ('revoked', 'accepted') then
      raise exception 'أُغلق هذا العرض — أُسند الطلب' using hint = 'already-assigned';
    else
      raise exception 'انتهت مهلة هذا العرض' using hint = 'offer-expired';
    end if;
  end if;

  v_reason := left(nullif(btrim(coalesce(p_reason, '')), ''), 1000);

  update public.trip_offers o
     set status = 'rejected', responded_at = v_now, reason = v_reason
   where o.id = p_offer_id;

  return 'rejected';
end;
$$;

-- ----------------------------------------------------------------------------
-- (٦) الدورة المجدولة — انتهاء المهل، الموجة التالية، التصعيد
--
-- تُنادى من `/api/dispatch/tick` بمفتاح مشترك (ومن pg_cron إن وُجد — القسم ١٠).
-- القفل الاستشاري على مستوى المعاملة: نداءان متزامنان لا يبثّان الموجة مرتين،
-- والقفل يتحرر تلقائياً بانتهاء المعاملة نجحت أو فشلت.
--
-- أسماء أعمدة الملخّص مطابقة لما يقرؤه lib/dispatch/tick.ts.
-- ----------------------------------------------------------------------------
create or replace function public.dispatch_tick()
returns table (
  expired_offers integer,
  new_rounds     integer,
  new_offers     integer,
  escalated      integer,
  cancelled      integer,
  processed      integer
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_cfg       record;
  v_row       record;
  v_expired   integer := 0;
  v_rounds    integer := 0;
  v_offers    integer := 0;
  v_escalated integer := 0;
  v_cancelled integer := 0;
  v_seen      integer := 0;
begin
  if not public.dispatch_ops_allowed() then
    raise exception 'دورة البث متاحة للمشرف أو لخادم الموقع فقط' using hint = 'forbidden';
  end if;

  -- دورتان متزامنتان: الثانية ترجع أصفاراً بهدوء بدل أن تبثّ مرة ثانية
  if not pg_try_advisory_xact_lock(913006) then
    expired_offers := 0; new_rounds := 0; new_offers := 0;
    escalated := 0; cancelled := 0; processed := 0;
    return next;
    return;
  end if;

  select * into v_cfg from public.dispatch_config();

  -- (١) انتهاء المهل — قبل أي قرار، فالقرار يُبنى على «هل بقي معلّق؟»
  with ex as (
    update public.trip_offers o
       set status = 'expired', responded_at = now()
     where o.status     = 'pending'
       and o.expires_at <= now()
    returning 1
  )
  select count(*) into v_expired from ex;

  -- (٢) حجز خرج من دائرة البث (أُلغي أو اكتمل) ⇒ إغلاق الدورة وسحب عروضها
  for v_row in
    select d.booking_id
    from public.dispatches d
    join public.bookings b on b.id = d.booking_id
    where d.status in ('queued', 'broadcasting')
      and b.status in ('cancelled', 'completed')
    for update of d
  loop
    update public.trip_offers o
       set status = 'revoked', responded_at = now()
     where o.booking_id = v_row.booking_id
       and o.status     = 'pending';

    update public.dispatches d
       set status = 'cancelled'
     where d.booking_id = v_row.booking_id;

    v_cancelled := v_cancelled + 1;
    v_seen      := v_seen + 1;
  end loop;

  -- (٣) موجة انتهت بلا قبول ⇒ الموجة التالية، أو التصعيد إلى الطابور اليدوي
  --     «انتهت» = لم يبقَ فيها عرض معلّق (انتهت مهلته أو رفضه صاحبه سيّان).
  for v_row in
    select d.booking_id, d.round, d.status
    from public.dispatches d
    join public.bookings b on b.id = d.booking_id
    where d.status in ('queued', 'broadcasting')
      and b.status = 'confirmed'
      and not exists (
        select 1 from public.trip_offers o
        where o.booking_id = d.booking_id and o.status = 'pending'
      )
      and not exists (
        select 1 from public.trip_offers o
        where o.booking_id = d.booking_id and o.status = 'accepted'
      )
    order by d.last_broadcast_at nulls first
    for update of d
  loop
    v_seen := v_seen + 1;

    if v_row.round < v_cfg.max_rounds then
      if v_row.round >= 1 then
        perform public.queue_notification(
          'dispatch_round_expired',
          public.dispatch_trip_payload(v_row.booking_id, false) || jsonb_build_object(
            'round',        v_row.round,
            'maxRounds',    v_cfg.max_rounds,
            'nextRound',    v_row.round + 1,
            'offersCount',  (select count(*) from public.trip_offers o
                              where o.booking_id = v_row.booking_id and o.round = v_row.round),
            'pendingCount', (select count(*) from public.trip_offers o
                              where o.booking_id = v_row.booking_id
                                and o.round = v_row.round and o.status = 'expired')
          )
        );
      end if;

      v_offers := v_offers + public.dispatch_broadcast(v_row.booking_id, v_row.round + 1);
      v_rounds := v_rounds + 1;
    else
      update public.dispatches d set status = 'manual' where d.booking_id = v_row.booking_id;

      perform public.queue_notification(
        'dispatch_exhausted',
        public.dispatch_trip_payload(v_row.booking_id, false) || jsonb_build_object(
          'rounds',      v_row.round,
          'maxRounds',   v_cfg.max_rounds,
          'offersCount', (select count(*) from public.trip_offers o where o.booking_id = v_row.booking_id),
          'pricedCost',  (select b2.subcontractor_cost from public.bookings b2 where b2.id = v_row.booking_id),
          'ceiling',     public.dispatch_ceiling(v_row.booking_id, v_row.round)
        )
      );

      v_escalated := v_escalated + 1;
    end if;
  end loop;

  -- (٤) شبكة أمان البدء التلقائي: حجز مؤكَّد بلا صف دورة أصلاً.
  --     المسار الأساسي أن يستدعي الخادم start_dispatch لحظة التأكيد؛ وهذه
  --     تلتقط ما فات (تعطّل الشبكة، تأكيد من SQL Editor، حجوزات ما قبل المرحلة).
  --     تعمل بعد (٣) عمداً فلا يُعالَج ما بدأ للتوّ مرتين في الدورة نفسها.
  if v_cfg.auto_start then
    for v_row in
      select b.id as booking_id
      from public.bookings b
      left join public.dispatches d on d.booking_id = b.id
      where b.status = 'confirmed'
        and d.booking_id is null
      order by b.created_at
      limit 200
    loop
      insert into public.dispatches as d (booking_id, status)
      values (v_row.booking_id, 'queued')
      on conflict (booking_id) do nothing;

      v_offers := v_offers + public.dispatch_broadcast(v_row.booking_id, 1);
      v_rounds := v_rounds + 1;
      v_seen   := v_seen + 1;
    end loop;
  end if;

  expired_offers := v_expired;
  new_rounds     := v_rounds;
  new_offers     := v_offers;
  escalated      := v_escalated;
  cancelled      := v_cancelled;
  processed      := v_seen;
  return next;
end;
$$;

-- ----------------------------------------------------------------------------
-- (٧) الإسناد اليدوي — تجاوز بشري صريح من أي حالة بث
--
-- يُنشئ للفائز عرضاً بحالة accepted حتى لو لم يُبث عليه أصلاً: فسجل الإسناد واحد
-- مهما اختلف الطريق، و`portal_trips` تجد للرحلة عرضاً في الحالتين، والفهرس
-- الفريد الجزئي يبقى هو حارس «فائز واحد».
-- ----------------------------------------------------------------------------
-- ⚠ أسماء أعمدة الإرجاع هنا (booking/partner/payout_amount/revoked_offers) مقصودة
-- ولا تطابق اسم أي عمود في الجداول الثلاثة: أسماء مخرجات plpgsql تُستبدل داخل
-- تعابير الاستعلام، فعمود إرجاع اسمه booking_id كان سيصطدم بمواضع مثل
-- `on conflict (booking_id)` ويكسر الدالة عند أول نداء لا عند التحويل البرمجي.
create or replace function public.manual_assign(
  p_booking_id       uuid,
  p_subcontractor_id uuid,
  p_payout           numeric,
  p_note             text
)
returns table (
  booking         uuid,
  partner         uuid,
  payout_amount   numeric,
  revoked_offers  integer
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_b       record;
  v_d       record;
  v_s       record;
  v_cfg     record;
  v_payout  numeric;
  v_note    text;
  v_round   integer;
  v_revoked integer := 0;
  v_offer   uuid;
  v_now     timestamptz := now();
begin
  if not public.dispatch_ops_allowed() then
    raise exception 'الإسناد اليدوي متاح للمشرف فقط' using hint = 'forbidden';
  end if;

  if p_booking_id is null or p_subcontractor_id is null then
    raise exception 'الحجز والمتعهد مطلوبان' using hint = 'invalid-input';
  end if;

  select b.* into v_b from public.bookings b where b.id = p_booking_id;
  if not found then
    raise exception 'الحجز غير موجود' using hint = 'booking-not-found';
  end if;

  if v_b.status not in ('confirmed', 'assigned') then
    raise exception 'الإسناد متاح للحجز المؤكَّد أو المُسند (حالته «%»)', v_b.status
      using hint = 'booking-not-confirmed';
  end if;

  select s.* into v_s from public.subcontractors s where s.id = p_subcontractor_id;
  if not found then
    raise exception 'المتعهد غير موجود' using hint = 'subcontractor-not-found';
  end if;

  if v_s.status = 'suspended' then
    raise exception 'المتعهد «%» موقوف — لا يُسند إليه', v_s.company_name
      using hint = 'invalid-input';
  end if;

  v_payout := p_payout;
  if v_payout is null then
    -- بلا مبلغ صريح: تكلفة المتعهد من قائمته إن كان مغطياً (سقف الموجة الأخيرة)
    select p.payout into v_payout
    from public.dispatch_pool(p_booking_id, 999) p
    where p.subcontractor_id = p_subcontractor_id;
  end if;

  if v_payout is null or v_payout < 0 then
    raise exception 'مستحق المتعهد مطلوب ولا يكون سالباً' using hint = 'invalid-input';
  end if;

  v_note := left(nullif(btrim(coalesce(p_note, '')), ''), 500);

  insert into public.dispatches as d (booking_id, status)
  values (p_booking_id, 'queued')
  on conflict (booking_id) do nothing;

  select * into v_d from public.dispatches d
   where d.booking_id = p_booking_id
   for update;

  v_round := greatest(coalesce(v_d.round, 0), 1);

  -- كل عرض قائم يُغلق أولاً — بما فيه قبول سابق عند إعادة الإسناد، وبما فيه عرض
  -- **للفائز نفسه في موجة أخرى** (وإلا بقي معلّقاً في سجله بلا معنى) — ويُستثنى
  -- صفه في الموجة الجارية وحده لأنه هو الذي سيصير مقبولاً بعد سطرين. والترتيب
  -- مقصود: الإغلاق قبل القبول حتى يخلو الفهرس الفريد الجزئي للفائز الجديد.
  with rev as (
    update public.trip_offers o
       set status       = 'revoked',
           responded_at = v_now,
           reason       = coalesce(o.reason, 'إسناد يدوي من التشغيل')
     where o.booking_id = p_booking_id
       and o.status in ('pending', 'accepted')
       and not (o.subcontractor_id = p_subcontractor_id and o.round = v_round)
    returning 1
  )
  select count(*) into v_revoked from rev;

  -- تحديث ثم إدراج (لا `on conflict`): العرض قد يكون مبثوثاً على الفائز في هذه
  -- الموجة فيُرقّى إلى مقبول، وإلا أُنشئ له صف قبول يوثّق الإسناد اليدوي.
  update public.trip_offers o
     set status       = 'accepted',
         payout       = v_payout,
         responded_at = v_now,
         expires_at   = greatest(o.expires_at, v_now),
         reason       = coalesce(v_note, o.reason)
   where o.booking_id       = p_booking_id
     and o.subcontractor_id = p_subcontractor_id
     and o.round            = v_round
  returning o.id into v_offer;

  if v_offer is null then
    insert into public.trip_offers as o
      (booking_id, subcontractor_id, round, payout, status, expires_at, responded_at, reason)
    values
      (p_booking_id, p_subcontractor_id, v_round, v_payout, 'accepted', v_now, v_now,
       coalesce(v_note, 'إسناد يدوي من التشغيل'))
    returning o.id into v_offer;
  end if;

  update public.dispatches d
     set status                    = 'assigned',
         assigned_subcontractor_id = p_subcontractor_id,
         assigned_at               = v_now,
         assigned_payout           = v_payout,
         manual_assign             = true
   where d.booking_id = p_booking_id;

  -- الانتقال عبر الحارس نفسه؛ والحجز المُسند سلفاً يبقى كما هو (إعادة إسناد)
  if v_b.status = 'confirmed' then
    perform set_config(
      'tours.booking_note',
      coalesce(v_note, 'إسناد يدوي إلى «' || v_s.company_name || '»'),
      true
    );
    update public.bookings b set status = 'assigned' where b.id = p_booking_id;
  end if;

  select * into v_cfg from public.dispatch_config();

  perform public.queue_notification(
    'trip_assigned',
    public.dispatch_trip_payload(p_booking_id, false) || jsonb_build_object(
      'offerId',         v_offer,
      'subcontractorId', p_subcontractor_id,
      'companyName',     v_s.company_name,
      'partnerPhone',    v_s.phone,
      'payout',          v_payout,
      'realMargin',      round(coalesce(v_b.total, 0) - v_payout, 2),
      'round',           v_round,
      'maxRounds',       v_cfg.max_rounds,
      'manualAssign',    true,
      'note',            v_note,
      'assignedAt',      v_now
    )
  );

  booking        := p_booking_id;
  partner        := p_subcontractor_id;
  payout_amount  := v_payout;
  revoked_offers := v_revoked;
  return next;
end;
$$;

-- ----------------------------------------------------------------------------
-- (٨) واجهتا البورتال
--
-- portal_offers: ما يراه المتعهد **قبل** القبول — OfferPreview حرفياً.
--   لا اسم عميل ولا هاتف ولا واتساب في نوع الإرجاع أصلاً؛ الوسوم عامة والملاحظة
--   منقّحة؛ ولا سعر عميل ولا هوية منافس ولا تكلفته. مستحقه هو فقط.
-- portal_trips: ما بعد الإسناد — AssignedTripDetails ببيانات التنفيذ.
--
-- الاثنتان definer لأن الجداول محجوبة، ونطاقهما current_subcontractor_id() —
-- فالمتعهد لا يرى إلا صفوفه مهما مرّر من وسائط (لا وسائط لهما أصلاً).
-- ----------------------------------------------------------------------------
create or replace function public.portal_offers()
returns table (
  offer_id     uuid,
  reference    text,
  origin_label text,
  dest_label   text,
  distance_km  numeric,
  passengers   integer,
  round_trip   boolean,
  waiting_hours numeric,
  class_title  text,
  pickup_at    timestamptz,
  payout       numeric,
  currency     text,
  expires_at   timestamptz,
  notes        text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    o.id,
    b.reference,
    public.dispatch_public_label(b.trip ->> 'originLabel'),
    public.dispatch_public_label(b.trip ->> 'destLabel'),
    public.jsonb_number(b.trip, 'distanceKm', 0),
    coalesce(public.jsonb_number(b.trip, 'passengers', 1), 1)::integer,
    coalesce(b.trip ->> 'roundTrip', 'false') in ('true', 't', '1'),
    coalesce(public.jsonb_number(b.trip, 'waitingHours', 0), 0),
    b.class_title,
    nullif(btrim(coalesce(b.trip ->> 'pickupAt', '')), '')::timestamptz,
    o.payout,
    b.currency,
    o.expires_at,
    public.dispatch_safe_notes(b.trip ->> 'notes')
  from public.trip_offers o
  join public.bookings b   on b.id = o.booking_id
  join public.dispatches d on d.booking_id = o.booking_id
  where o.subcontractor_id = public.current_subcontractor_id()
    and public.current_subcontractor_id() is not null
    and o.status     = 'pending'
    and o.expires_at > now()
    and d.status     = 'broadcasting'
    and b.status     = 'confirmed'
  order by o.expires_at asc;
$$;

create or replace function public.portal_trips()
returns table (
  offer_id     uuid,
  booking_id   uuid,
  reference    text,
  origin_label text,
  dest_label   text,
  distance_km  numeric,
  passengers   integer,
  round_trip   boolean,
  waiting_hours numeric,
  class_title  text,
  pickup_at    timestamptz,
  payout       numeric,
  currency     text,
  expires_at   timestamptz,
  notes        text,
  customer_name     text,
  customer_phone    text,
  customer_whatsapp text,
  status       text,
  assigned_at  timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    o.id,
    b.id,
    b.reference,
    b.trip ->> 'originLabel',
    b.trip ->> 'destLabel',
    public.jsonb_number(b.trip, 'distanceKm', 0),
    coalesce(public.jsonb_number(b.trip, 'passengers', 1), 1)::integer,
    coalesce(b.trip ->> 'roundTrip', 'false') in ('true', 't', '1'),
    coalesce(public.jsonb_number(b.trip, 'waitingHours', 0), 0),
    b.class_title,
    nullif(btrim(coalesce(b.trip ->> 'pickupAt', '')), '')::timestamptz,
    d.assigned_payout,
    b.currency,
    d.assigned_at,
    b.trip ->> 'notes',
    b.customer_name,
    b.customer_phone,
    b.customer_whatsapp,
    b.status,
    d.assigned_at
  from public.dispatches d
  join public.bookings b on b.id = d.booking_id
  left join public.trip_offers o
    on o.booking_id       = d.booking_id
   and o.subcontractor_id = d.assigned_subcontractor_id
   and o.status           = 'accepted'
  where d.assigned_subcontractor_id = public.current_subcontractor_id()
    and public.current_subcontractor_id() is not null
    and d.status  = 'assigned'
    and b.status in ('assigned', 'completed', 'cancelled')
  order by nullif(btrim(coalesce(b.trip ->> 'pickupAt', '')), '')::timestamptz asc nulls last,
           d.assigned_at desc;
$$;

-- ----------------------------------------------------------------------------
-- (٩) RLS + الصلاحيات
--
-- خلاصة الوصول:
--   anon          → **صفر** على الجداول الثلاثة وعلى كل دوال هذه المرحلة.
--   المتعهد        → عروضه هو فقط (قراءة)، ولا يكتب إلا عبر accept/reject.
--                    ولا يرى dispatches (فيها هوية الفائز ومستحقه) ولا الإعدادات
--                    (استراتيجية البث والهامش ليست من شأنه).
--   المشرف         → كل شيء.
--   service_role  → كل شيء (المهمة المجدولة ومسارات الخادم).
-- ----------------------------------------------------------------------------
alter table public.dispatch_settings enable row level security;
alter table public.dispatches        enable row level security;
alter table public.trip_offers       enable row level security;

-- السحب أولاً — إعدادات Supabase الافتراضية منحت anon كل شيء بما فيه TRUNCATE
revoke all on public.dispatch_settings from public, anon, authenticated;
revoke all on public.dispatches        from public, anon, authenticated;
revoke all on public.trip_offers       from public, anon, authenticated;

-- لا منح لـ anon على أي منها — ولا حتى select
grant select, insert, update, delete on public.dispatch_settings to authenticated;
grant select, insert, update, delete on public.dispatches        to authenticated;
grant select, insert, update, delete on public.trip_offers       to authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant select, insert, update, delete on public.dispatch_settings to service_role';
    execute 'grant select, insert, update, delete on public.dispatches to service_role';
    execute 'grant select, insert, update, delete on public.trip_offers to service_role';
  end if;
end;
$$;

-- (٩-١) dispatch_settings — للمشرف وحده قراءةً وكتابة
drop policy if exists "dispatch_settings_select_admin" on public.dispatch_settings;
create policy "dispatch_settings_select_admin"
  on public.dispatch_settings
  for select
  to authenticated
  using (public.is_admin());

drop policy if exists "dispatch_settings_insert_admin" on public.dispatch_settings;
create policy "dispatch_settings_insert_admin"
  on public.dispatch_settings
  for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "dispatch_settings_update_admin" on public.dispatch_settings;
create policy "dispatch_settings_update_admin"
  on public.dispatch_settings
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "dispatch_settings_delete_admin" on public.dispatch_settings;
create policy "dispatch_settings_delete_admin"
  on public.dispatch_settings
  for delete
  to authenticated
  using (public.is_admin());

-- (٩-٢) dispatches — للمشرف وحده. المتعهد يعرف إسناده من portal_trips لا من هنا:
-- الصف يحمل هوية الفائز ومستحقه، وكشفه للخاسر كشف لتكلفة منافسه.
drop policy if exists "dispatches_select_admin" on public.dispatches;
create policy "dispatches_select_admin"
  on public.dispatches
  for select
  to authenticated
  using (public.is_admin());

drop policy if exists "dispatches_insert_admin" on public.dispatches;
create policy "dispatches_insert_admin"
  on public.dispatches
  for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "dispatches_update_admin" on public.dispatches;
create policy "dispatches_update_admin"
  on public.dispatches
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "dispatches_delete_admin" on public.dispatches;
create policy "dispatches_delete_admin"
  on public.dispatches
  for delete
  to authenticated
  using (public.is_admin());

-- (٩-٣) trip_offers — المتعهد يقرأ عروضه هو فقط، والكتابة للمشرف حصراً
-- (رد المتعهد يمر بـ accept_offer/reject_offer وهما definer، فلا يحتاج كتابة).
drop policy if exists "trip_offers_select_own_or_admin" on public.trip_offers;
create policy "trip_offers_select_own_or_admin"
  on public.trip_offers
  for select
  to authenticated
  using (subcontractor_id = public.current_subcontractor_id() or public.is_admin());

drop policy if exists "trip_offers_insert_admin" on public.trip_offers;
create policy "trip_offers_insert_admin"
  on public.trip_offers
  for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "trip_offers_update_admin" on public.trip_offers;
create policy "trip_offers_update_admin"
  on public.trip_offers
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "trip_offers_delete_admin" on public.trip_offers;
create policy "trip_offers_delete_admin"
  on public.trip_offers
  for delete
  to authenticated
  using (public.is_admin());

-- (٩-٤) صلاحيات الدوال — السحب من public و anon و authenticated ثم المنح الصريح
-- (`create or replace` لا يعيد ضبط الصلاحيات، والدالة الجديدة تولد مفتوحة).

-- دوال داخلية بحتة: لا تُمنح لأي دور. تُنفَّذ من داخل الدوال العامة بهوية مالكها.
revoke all on function public.dispatch_config()                         from public, anon, authenticated;
revoke all on function public.dispatch_ceiling(uuid, integer)           from public, anon, authenticated;
revoke all on function public.dispatch_pool(uuid, integer)              from public, anon, authenticated;
revoke all on function public.dispatch_broadcast(uuid, integer)         from public, anon, authenticated;
revoke all on function public.dispatch_trip_payload(uuid, boolean)      from public, anon, authenticated;
revoke all on function public.dispatch_ops_allowed()                    from public, anon, authenticated;
revoke all on function public.dispatch_public_label(text)               from public, anon, authenticated;
revoke all on function public.dispatch_safe_notes(text)                 from public, anon, authenticated;

-- البث والإسناد: المشرف بجلسته (اللوحة) أو الخادم الموثوق (الخطاف التلقائي)
revoke all    on function public.start_dispatch(uuid) from public, anon, authenticated;
grant execute on function public.start_dispatch(uuid) to authenticated;

revoke all    on function public.dispatch_tick() from public, anon, authenticated;
grant execute on function public.dispatch_tick() to authenticated;

revoke all    on function public.manual_assign(uuid, uuid, numeric, text)
  from public, anon, authenticated;
grant execute on function public.manual_assign(uuid, uuid, numeric, text) to authenticated;

-- رد المتعهد وواجهتا البورتال: للمسجَّل فقط، والنطاق داخلها بهوية المتعهد
revoke all    on function public.accept_offer(uuid) from public, anon, authenticated;
grant execute on function public.accept_offer(uuid) to authenticated;

revoke all    on function public.reject_offer(uuid, text) from public, anon, authenticated;
grant execute on function public.reject_offer(uuid, text) to authenticated;

revoke all    on function public.portal_offers() from public, anon, authenticated;
grant execute on function public.portal_offers() to authenticated;

revoke all    on function public.portal_trips() from public, anon, authenticated;
grant execute on function public.portal_trips() to authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.start_dispatch(uuid) to service_role';
    execute 'grant execute on function public.dispatch_tick() to service_role';
    execute 'grant execute on function public.manual_assign(uuid, uuid, numeric, text) to service_role';
    execute 'grant execute on function public.accept_offer(uuid) to service_role';
    execute 'grant execute on function public.reject_offer(uuid, text) to service_role';
    execute 'grant execute on function public.portal_offers() to service_role';
    execute 'grant execute on function public.portal_trips() to service_role';
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- (١٠) جدولة اختيارية عبر pg_cron
--
-- المسار الرسمي للدورة هو `/api/dispatch/tick` بمفتاح مشترك (Vercel Cron أو زر
-- في اللوحة) — لأن pg_cron غير مضمون على كل مشروع. فإن وُجد جدولناها زيادةً في
-- المتانة، وإن فشلت الجدولة لأي سبب مضت الهجرة بلا انكسار.
-- ----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin
      perform cron.schedule('tours-dispatch-tick', '*/5 * * * *', 'select public.dispatch_tick();');
      raise notice '✔ pg_cron: دورة البث مجدولة كل ٥ دقائق (المسار الرسمي /api/dispatch/tick يبقى عاملاً)';
    exception
      when others then
        raise notice '⚠ تعذّرت جدولة pg_cron (%) — استعمل /api/dispatch/tick', sqlerrm;
    end;
  else
    raise notice 'ℹ لا pg_cron على هذه القاعدة — الدورة تُنادى عبر /api/dispatch/tick';
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- (١١) فحص ذاتي بعد التنفيذ — الفهرس الفريد الجزئي هو شرط الإغلاق
-- ----------------------------------------------------------------------------
do $$
declare
  v_missing text;
begin
  select string_agg(x.rel, '، ')
    into v_missing
  from (values ('public.dispatch_settings'), ('public.dispatches'), ('public.trip_offers')) as x(rel)
  where to_regclass(x.rel) is null;

  if v_missing is not null then
    raise exception '0013: جداول ناقصة بعد التنفيذ: %', v_missing;
  end if;

  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and tablename  = 'trip_offers'
      and indexname  = 'trip_offers_one_accepted_key'
  ) then
    raise exception '0013: الفهرس الفريد الجزئي للفائز الواحد غير موجود — لا تُغلق المرحلة بدونه';
  end if;

  select string_agg(x.sig, '، ')
    into v_missing
  from (values
    ('public.start_dispatch(uuid)'),
    ('public.accept_offer(uuid)'),
    ('public.reject_offer(uuid, text)'),
    ('public.dispatch_tick()'),
    ('public.manual_assign(uuid, uuid, numeric, text)'),
    ('public.portal_offers()'),
    ('public.portal_trips()')
  ) as x(sig)
  where to_regprocedure(x.sig) is null;

  if v_missing is not null then
    raise exception '0013: دوال ناقصة بعد التنفيذ: %', v_missing;
  end if;

  raise notice '✔ 0013_dispatch: بث بموجات + قبول ذرّي (قفل + فهرس فريد جزئي) + خصوصية قبل القبول';
end;
$$;
