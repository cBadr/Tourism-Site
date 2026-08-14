-- ============================================================================
-- 0036 — نظام السجلات الشامل (الدفعة ٤ — الملاحظة ١٥)
--
-- نصّ المالك في `docs/VISION.md` ملحق ٢ ملاحظة ١٥: «لا سجلات — المطلوب نظام
-- سجلات متكامل وشامل يسجّل كل حدث **ويربط كل شيء ببعضه**، فيمكن تتبّع حركات
-- المستخدمين وكل إجراء أو تعديل والرجوع إلى أي حدث في الماضي بالتفصيل.»
--
-- والعقد الملزم: `lib/audit-types.ts` — يُقرأ قبل هذا الملف.
--
-- ── هذا توسيعٌ لنمطٍ قائم لا اختراعٌ بجانبه ────────────────────────────────
--
-- `public.booking_events` (هجرة 0007) جدولُ تدقيقٍ عامل منذ المرحلة ٤، وثلاثة
-- قرارات فيه تُنسخ هنا حرفاً: **`actor` بلا مفتاح أجنبي** كي يبقى بعد حذف
-- المستخدم، و**الكتابة بمُشغّل لا بنداء** فلا مسار تعديلٍ يفلت ولا فاعل
-- يُنتحَل، و**الفاعل من `current_actor()`** المسحوبة من كل دور.
--
-- 🔒 ولا يُكرَّر هنا شكل `ledger_on_expense_insert` الذي يقرأ
-- `coalesce(new.created_by, current_actor())` — أي أن قيمةً يرسلها المستدعي
-- تفوز على الهوية الحقيقية. في جدول مصروفات محروسٍ بـRLS ذلك مقبول؛ في سجلّ
-- تدقيق يكون بابَ تزوير التاريخ نفسه.
--
-- ── القرار الأخطر: ماذا يُنسَخ من القيم ────────────────────────────────────
--
-- مُشغّلٌ ساذج بـ`to_jsonb(NEW)` كان سيجمع في **جدول واحد**: مفاتيح بوابات
-- الدفع (`payment_providers.config`)، وتوكنات القياس (`site_settings`)، وأسماء
-- العملاء وهواتفهم وتوكنات متابعة حجوزاتهم (`bookings`). فيصير السجلّ أغنى هدف
-- في القاعدة كلها، وخطأُ منحةٍ واحد يسلّمه لكل متعهد (وكل متعهد `authenticated`).
--
-- فالقاعدة المنفَّذة في `audit_redact()` أدناه: **الحدث يُسجَّل كاملاً، والقيمة
-- الحساسة تُسجَّل بأنها تغيّرت ولا تُنسخ.** السطر يقول «فلان غيّر مفتاح Paymob
-- الساعة كذا» ولا يحمل المفتاح — لا قديمه ولا جديده. والتدقيق لا يخسر شيئاً:
-- المدقّق يريد **من ومتى وماذا مسّ**، لا نسخةً ثانية من السرّ.
--
-- ── D-48 يقسم النظام قسمين، ولا مفرّ ───────────────────────────────────────
--
-- كل نداء PostgREST معاملة واحدة، فالاستثناء يُرجِع كل ما كُتب فيها **بما فيه
-- سطر السجل**:
--   • **التغيير المُنفَّذ** يُسجَّل بمُشغّل داخل معاملته فيثبت معها ويُلغى معها،
--     وهذا صحيح: تغييرٌ أُلغي لم يقع.
--   • **المحاولة المرفوضة** لا يسجّلها مُشغّل أبداً. ولها جدولها المستقل
--     `audit_attempts` يكتبه الخادم من **معاملة ثانية** بعد التقاط الخطأ.
-- وفصلُ الجدولين مقصود: الأول لا يمكن تخطّيه بنيوياً، والثاني يعتمد على أن
-- يتذكّر الخادم النداء — ثقتان مختلفتان لا تُخلطان في جدول واحد.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (١) الجدولان
-- ----------------------------------------------------------------------------

create table if not exists public.audit_log (
  id               bigint generated always as identity primary key,
  occurred_at      timestamptz not null default now(),
  -- 🔒 بلا مفتاح أجنبي بقصد (نفس `booking_events.actor`): السجل يجب أن يبقى
  --    صحيحاً بعد حذف حساب الفاعل، وإلا محا الحذفُ الدليلَ الذي وُجد لأجله.
  actor            uuid,
  actor_kind       text not null,
  entity           text not null,
  entity_id        uuid,
  entity_label     text,
  action           text not null,
  changes          jsonb,
  snapshot         jsonb,
  note             text,
  -- عمودا «يربط كل شيء ببعضه»: تكرارٌ متعمَّد كي تُقرأ قصة الكيان الواحد
  -- عبر كل الجداول باستعلام واحد مفهرس
  booking_id       uuid,
  subcontractor_id uuid,
  constraint audit_log_action_chk
    check (action in ('insert', 'update', 'delete')),
  constraint audit_log_actor_kind_chk
    check (actor_kind in ('admin', 'ops', 'partner', 'customer', 'guest', 'system', 'db'))
);

comment on table public.audit_log is
  'سجل التدقيق الشامل (الملاحظة ١٥). يُكتب بمُشغّل حصراً فلا مسار تعديل يفلت. append-only: لا تحديث ولا حذف إلا بالتقليم المحروس. العقد: lib/audit-types.ts';
comment on column public.audit_log.actor is
  'معرّف الفاعل بلا مفتاح أجنبي بقصد — السجل تدقيقي ويجب أن يبقى بعد حذف المستخدم (نفس قرار booking_events.actor في 0007)';
comment on column public.audit_log.changes is
  'للتحديث: {عمود: {from, to}}. والعمود الحساس يُكتب {عمود: {redacted: true}} — تغيّرٌ مسجَّل بلا نسخ سرّ';

create index if not exists audit_log_occurred_idx      on public.audit_log (occurred_at desc);
create index if not exists audit_log_entity_idx        on public.audit_log (entity, occurred_at desc);
create index if not exists audit_log_entity_id_idx     on public.audit_log (entity, entity_id);
create index if not exists audit_log_actor_idx         on public.audit_log (actor, occurred_at desc);
create index if not exists audit_log_booking_idx       on public.audit_log (booking_id, occurred_at desc)
  where booking_id is not null;
create index if not exists audit_log_subcontractor_idx on public.audit_log (subcontractor_id, occurred_at desc)
  where subcontractor_id is not null;

create table if not exists public.audit_attempts (
  id           bigint generated always as identity primary key,
  occurred_at  timestamptz not null default now(),
  actor        uuid,
  actor_kind   text not null,
  operation    text not null,
  reason       text not null,
  entity       text,
  entity_id    uuid,
  detail       text,
  constraint audit_attempts_actor_kind_chk
    check (actor_kind in ('admin', 'ops', 'partner', 'customer', 'guest', 'system', 'db'))
);

comment on table public.audit_attempts is
  'المحاولات المرفوضة (forbidden · debt-limit · margin-floor …). جدول مستقل عن audit_log عمداً: هذا يُكتب بنداء من معاملة ثانية بعد الفشل، فثقته أضعف بنيوياً من سجلٍّ يكتبه مُشغّل — وخلطهما يُلبِس الأضعفَ ضمانةَ الأقوى (D-48)';

create index if not exists audit_attempts_occurred_idx on public.audit_attempts (occurred_at desc);
create index if not exists audit_attempts_actor_idx    on public.audit_attempts (actor, occurred_at desc);
create index if not exists audit_attempts_reason_idx   on public.audit_attempts (reason, occurred_at desc);

-- ----------------------------------------------------------------------------
-- (٢) الحارس — نسخة مطابقة لسلّم `analytics_admin_allowed()`
-- ----------------------------------------------------------------------------
-- التطابق **شرط لا تجميل**: سلّم واحد يقرّر من يقرأ أرقام المنصة ومن يقرأ
-- تاريخها. والمفصل فيه أن الدور يُقرأ من `current_setting('role')` لا من
-- `current_user` — لأن `security definer` يبدّل الثاني ولا يبدّل الأول.
-- ----------------------------------------------------------------------------

create or replace function public.audit_admin_allowed()
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

  -- طلب من متصفح وليس لمشرف: رفض قاطع لا ينقضه أي سياق اتصال
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

  return session_user in ('postgres', 'supabase_admin');
end;
$$;

-- ----------------------------------------------------------------------------
-- (٣) صنف الفاعل — يُشتق ولا يُمرَّر
-- ----------------------------------------------------------------------------

create or replace function public.audit_actor_kind()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid  uuid;
  v_role text;
  v_prof text;
begin
  begin
    v_uid := auth.uid();
  exception
    when others then
      v_uid := null;
  end;

  v_role := coalesce(nullif(current_setting('role', true), ''), '');

  if v_uid is not null then
    select p.role into v_prof from public.profiles p where p.id = v_uid;
    if v_prof = 'admin' then return 'admin'; end if;
    if v_prof = 'ops' then return 'ops'; end if;
    if v_prof = 'subcontractor' then return 'partner'; end if;
    if v_prof = 'customer' then return 'customer'; end if;
    -- جلسة صالحة بلا صف ملف: لا نخترع صنفاً، والزائر أضيق الاحتمالات
    return 'guest';
  end if;

  if v_role = 'service_role' then return 'system'; end if;
  if v_role in ('anon', 'authenticated') then return 'guest'; end if;
  if session_user in ('postgres', 'supabase_admin') then return 'db'; end if;
  return 'system';
end;
$$;

-- ----------------------------------------------------------------------------
-- (٤) الحجب — القرار الأخطر في هذه الهجرة
-- ----------------------------------------------------------------------------
-- القائمة هنا **مصدر الإنفاذ**، ونظيرتها في `lib/audit-types.ts` توثيقٌ
-- للمطوّر. والاختبار (ج) في `audit_tests.sql` يفشل إن افترقا.
-- ----------------------------------------------------------------------------

create or replace function public.audit_is_secret(p_column text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select lower(coalesce(p_column, '')) in (
    'secret', 'secret_key', 'api_key', 'access_token', 'token', 'password',
    'encrypted_password', 'webhook_secret', 'config',
    'customer_phone', 'customer_whatsapp', 'phone_norm', 'public_token'
  );
$$;

/** يستبدل قيمة كل عمود حساس بعلامة، ويُبقي البنية كما هي */
create or replace function public.audit_redact(p_row jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    (select jsonb_object_agg(
              k,
              case when public.audit_is_secret(k) then to_jsonb('[محجوب]'::text) else v end)
       from jsonb_each(p_row) as e(k, v)),
    '{}'::jsonb);
$$;

-- ----------------------------------------------------------------------------
-- (٥) المُشغّل العام — واحدٌ لكل الجداول المرصودة
-- ----------------------------------------------------------------------------
-- نفس نمط `finance_rows_immutable` الذي يخدم ثلاثة جداول بوسمٍ في `tg_argv[0]`:
-- مُشغّل واحد بدل نسخةٍ لكل جدول، فلا تنحرف اثنتان وثلاثون نسخة عن بعضها.
-- و`tg_argv[0]` هنا هو **اسم عمود اللقطة النصية** (مرجع الحجز، اسم الشركة،
-- الرمز) — يُخزَّن كي يبقى الصف مفهوماً بعد حذف الكيان نفسه.
-- ----------------------------------------------------------------------------

create or replace function public.log_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old      jsonb;
  v_new      jsonb;
  v_changes  jsonb := '{}'::jsonb;
  v_snapshot jsonb;
  v_row      jsonb;
  v_label    text;
  v_id       uuid;
  v_booking  uuid;
  v_sub      uuid;
  v_note     text;
  r          record;
begin
  v_old := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_row := coalesce(v_new, v_old);

  -- معرّف الصف: أغلب الجداول `id uuid`، وبعضها لا (‏`trip_settings.id` منطقي،
  -- و`price_list_items` مفتاحه مركّب). فالقراءة محروسة بالشكل لا بالافتراض.
  if v_row ? 'id' and (v_row ->> 'id') ~ '^[0-9a-fA-F-]{36}$' then
    v_id := (v_row ->> 'id')::uuid;
  end if;

  if v_row ? 'booking_id' and (v_row ->> 'booking_id') ~ '^[0-9a-fA-F-]{36}$' then
    v_booking := (v_row ->> 'booking_id')::uuid;
  elsif tg_table_name = 'bookings' then
    v_booking := v_id;
  end if;

  if v_row ? 'subcontractor_id' and (v_row ->> 'subcontractor_id') ~ '^[0-9a-fA-F-]{36}$' then
    v_sub := (v_row ->> 'subcontractor_id')::uuid;
  elsif tg_table_name = 'subcontractors' then
    v_sub := v_id;
  end if;

  if tg_nargs > 0 and tg_argv[0] is not null and v_row ? tg_argv[0] then
    v_label := left(v_row ->> tg_argv[0], 160);
  end if;

  if tg_op = 'UPDATE' then
    -- الفرق عموداً عموداً؛ والحساس يُسجَّل «تغيّر» بلا نسخ قيمته
    for r in select key from jsonb_each(v_new)
    loop
      if v_new -> r.key is distinct from v_old -> r.key then
        -- `updated_at` يتغيّر في كل تحديث بحكم مُشغّل touch_updated_at،
        -- فإدراجه يجعل كل صف يحمل ضجيجاً بلا معلومة
        if r.key <> 'updated_at' then
          v_changes := v_changes || jsonb_build_object(
            r.key,
            case
              when public.audit_is_secret(r.key)
                then jsonb_build_object('redacted', true)
              else jsonb_build_object('from', v_old -> r.key, 'to', v_new -> r.key)
            end);
        end if;
      end if;
    end loop;

    -- تحديثٌ لم يغيّر عموداً ذا معنى (لمسة `updated_at` وحدها) لا يستحق صفاً
    if v_changes = '{}'::jsonb then
      return null;
    end if;
  end if;

  -- الحذف وحده يحفظ الصف كاملاً: بدونه يضيع ما حُذف بلا أثر، وهو بالضبط
  -- ما تشكو منه الملاحظة («الرجوع إلى أي حدث في الماضي بالتفصيل»)
  if tg_op = 'DELETE' then
    v_snapshot := public.audit_redact(v_old);
  end if;

  -- ملاحظة المشغّل تُقرأ مرة وتُمحى — نفس فكرة `tours.booking_note` في 0007:
  -- بلا المحو تُختم ملاحظةُ عمليةٍ على كل صفٍّ لاحق في المعاملة نفسها
  v_note := nullif(btrim(coalesce(current_setting('tours.audit_note', true), '')), '');
  if v_note is not null then
    perform set_config('tours.audit_note', '', true);
  end if;

  insert into public.audit_log (
    actor, actor_kind, entity, entity_id, entity_label,
    action, changes, snapshot, note, booking_id, subcontractor_id
  ) values (
    public.current_actor(),
    public.audit_actor_kind(),
    tg_table_name,
    v_id,
    v_label,
    lower(tg_op),
    case when tg_op = 'UPDATE' then v_changes end,
    v_snapshot,
    v_note,
    v_booking,
    v_sub
  );

  return null; -- AFTER trigger
end;
$$;

-- ----------------------------------------------------------------------------
-- (٦) ربط المُشغّل بالجداول المرصودة
-- ----------------------------------------------------------------------------
-- ⚠ **ولا يُربَط بسجلات الأحداث عالية الحجم**: `funnel_events` ·
-- `notifications` · `payment_events` · `booking_lookup_attempts` ·
-- `distance_cache` · `geocode_cache` · و`booking_events` نفسه. رصدُ سجلِّ
-- أحداثٍ بسجلِّ أحداثٍ آخر حلقةٌ تضاعف الحجم ولا تضيف معلومة —
-- و`notifications` وحده ١٬٧٤٣ صفاً على قاعدة بلا نشر.
-- ----------------------------------------------------------------------------

do $$
declare
  -- (جدول، عمود اللقطة النصية)
  v_map text[][] := array[
    ['bookings',                'reference'],
    ['payments',                'status'],
    ['payment_intents',         'provider_ref'],
    ['ledger_entries',          'source_type'],
    ['expenses',                'note'],
    ['partner_payouts',         'note'],
    ['partner_settlements',     'reference'],
    ['subcontractors',          'company_name'],
    ['subcontractor_vehicles',  'class_slug'],
    ['price_lists',             'status'],
    ['price_list_items',        'class_slug'],
    ['dispatches',              'status'],
    ['trip_offers',             'status'],
    ['quote_requests',          'reference'],
    ['coupons',                 'code'],
    ['profiles',                'role'],
    ['tariffs',                 'class_slug'],
    ['vehicle_classes',         'slug'],
    ['extra_services',          'slug'],
    ['payment_accounts',        'label'],
    ['site_settings',           'key'],
    ['pricing_settings',        'currency'],
    ['dispatch_settings',       null],
    ['discount_settings',       null],
    ['trip_settings',           null],
    ['partner_credit_settings', null],
    ['payment_providers',       'provider'],
    ['locales',                 'code'],
    ['redirects',               'from_path'],
    ['pages',                   'slug'],
    ['sections',                'kind'],
    ['promo_banners',           'title']
  ];
  v_tbl   text;
  v_label text;
  v_i     integer;
  v_made  integer := 0;
begin
  for v_i in 1 .. array_length(v_map, 1) loop
    v_tbl   := v_map[v_i][1];
    v_label := v_map[v_i][2];

    if to_regclass('public.' || quote_ident(v_tbl)) is null then
      raise notice '  ↳ 0036: الجدول % غير موجود — تخطٍّ', v_tbl;
      continue;
    end if;

    execute format('drop trigger if exists %I on public.%I', 'audit_' || v_tbl, v_tbl);

    if v_label is null then
      execute format(
        'create trigger %I after insert or update or delete on public.%I
           for each row execute function public.log_audit()',
        'audit_' || v_tbl, v_tbl);
    else
      execute format(
        'create trigger %I after insert or update or delete on public.%I
           for each row execute function public.log_audit(%L)',
        'audit_' || v_tbl, v_tbl, v_label);
    end if;

    v_made := v_made + 1;
  end loop;

  raise notice '✔ 0036: رُبط مُشغّل التدقيق بـ% جدولاً', v_made;
end;
$$;

-- ----------------------------------------------------------------------------
-- (٧) سطح القراءة — محروس، و«يربط كل شيء ببعضه»
-- ----------------------------------------------------------------------------

create or replace function public.audit_search(
  p_entity text default null,
  p_actor  uuid default null,
  p_from   date default null,
  p_to     date default null,
  p_limit  integer default 200
)
returns setof public.audit_log
language plpgsql
stable
security definer
set search_path = ''
as $$
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
     and (p_from   is null or (l.occurred_at at time zone 'Africa/Cairo')::date >= p_from)
     and (p_to     is null or (l.occurred_at at time zone 'Africa/Cairo')::date <= p_to)
   order by l.occurred_at desc, l.id desc
   limit v_limit;
end;
$$;

/** قصة حجزٍ واحد عبر كل الجداول — وجهُ «يربط كل شيء ببعضه» */
create or replace function public.audit_for_booking(p_booking_id uuid)
returns setof public.audit_log
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.audit_admin_allowed() then
    raise exception 'سجل التدقيق متاح للإدارة فقط' using hint = 'forbidden';
  end if;

  return query
  select l.* from public.audit_log l
   where l.booking_id = p_booking_id
   order by l.occurred_at asc, l.id asc;
end;
$$;

/** وقصة متعهدٍ واحد كذلك */
create or replace function public.audit_for_partner(p_subcontractor_id uuid)
returns setof public.audit_log
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.audit_admin_allowed() then
    raise exception 'سجل التدقيق متاح للإدارة فقط' using hint = 'forbidden';
  end if;

  return query
  select l.* from public.audit_log l
   where l.subcontractor_id = p_subcontractor_id
   order by l.occurred_at asc, l.id asc;
end;
$$;

-- ----------------------------------------------------------------------------
-- (٨) المحاولة المرفوضة — تُنادى من **معاملة ثانية** بعد الفشل
-- ----------------------------------------------------------------------------
-- ⚠ من يضع نداءها داخل نفس المعاملة التي رمت يكون قد أعاد إنتاج D-48 بيده:
-- الاستثناء يُرجِع سطرها معه فلا تُسجَّل محاولة واحدة أبداً.
-- ----------------------------------------------------------------------------

create or replace function public.record_audit_attempt(
  p_operation text,
  p_reason    text,
  p_entity    text default null,
  p_entity_id uuid default null,
  p_detail    text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not public.audit_admin_allowed() then
    raise exception 'تسجيل المحاولات متاح للإدارة فقط' using hint = 'forbidden';
  end if;

  insert into public.audit_attempts (
    actor, actor_kind, operation, reason, entity, entity_id, detail
  ) values (
    public.current_actor(),
    public.audit_actor_kind(),
    left(coalesce(nullif(btrim(p_operation), ''), 'unknown'), 80),
    left(coalesce(nullif(btrim(p_reason), ''), 'unknown'), 80),
    left(nullif(btrim(coalesce(p_entity, '')), ''), 80),
    p_entity_id,
    left(nullif(btrim(coalesce(p_detail, '')), ''), 500)
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- (٩) التقليم — بأرضية محروسة داخل الدالة
-- ----------------------------------------------------------------------------
-- سجلٌّ يُقلَّم بمدةٍ أقصر مما ينبغي يمحو الدليل الذي وُجد لأجله. والأرضية هنا
-- **سنة كاملة** لا ثلاثون يوماً كـ`prune_funnel_events`: ذاك قياسٌ تسويقي وهذا
-- تاريخٌ مالي وتشغيلي يُرجَع إليه عند نزاع.
-- ----------------------------------------------------------------------------

create or replace function public.prune_audit_log(p_keep_days integer default 730)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_keep integer;
  v_n    integer;
begin
  if not public.audit_admin_allowed() then
    raise exception 'تقليم سجل التدقيق متاح للإدارة فقط' using hint = 'forbidden';
  end if;

  v_keep := greatest(coalesce(p_keep_days, 730), 365);

  delete from public.audit_log
   where occurred_at < now() - make_interval(days => v_keep);
  get diagnostics v_n = row_count;

  delete from public.audit_attempts
   where occurred_at < now() - make_interval(days => v_keep);

  return v_n;
end;
$$;

-- ----------------------------------------------------------------------------
-- (١٠) الصلاحيات و RLS — نفس نمط `booking_events` في 0007
-- ----------------------------------------------------------------------------
-- ⚠ **و`truncate` تُسحب صراحةً**: Supabase تمنح صلاحيات واسعة افتراضاً، و
-- `truncate` **لا تغطيها RLS** — فجدول «append-only» بلا هذا السحب يُفرَّغ
-- بنداء واحد من أي دور يملكها.
-- ----------------------------------------------------------------------------

alter table public.audit_log      enable row level security;
alter table public.audit_attempts enable row level security;

revoke all on table public.audit_log      from public, anon, authenticated;
revoke all on table public.audit_attempts from public, anon, authenticated;

grant select on table public.audit_log      to authenticated;
grant select on table public.audit_attempts to authenticated;

drop policy if exists audit_log_select_admin on public.audit_log;
create policy audit_log_select_admin on public.audit_log
  for select to authenticated using (public.is_admin());

drop policy if exists audit_attempts_select_admin on public.audit_attempts;
create policy audit_attempts_select_admin on public.audit_attempts
  for select to authenticated using (public.is_admin());

revoke all on function public.audit_admin_allowed()          from public, anon, authenticated;
revoke all on function public.audit_actor_kind()             from public, anon, authenticated;
revoke all on function public.audit_is_secret(text)          from public, anon, authenticated;
revoke all on function public.audit_redact(jsonb)            from public, anon, authenticated;
revoke all on function public.log_audit()                    from public, anon, authenticated;
revoke all on function public.audit_search(text, uuid, date, date, integer) from public, anon;
revoke all on function public.audit_for_booking(uuid)        from public, anon;
revoke all on function public.audit_for_partner(uuid)        from public, anon;
revoke all on function public.record_audit_attempt(text, text, text, uuid, text) from public, anon;
revoke all on function public.prune_audit_log(integer)       from public, anon, authenticated;

-- جلسة المشرف تمر بدور `authenticated`، والحارس داخل الدالة هو الذي يفصل
grant execute on function public.audit_search(text, uuid, date, date, integer) to authenticated, service_role;
grant execute on function public.audit_for_booking(uuid)     to authenticated, service_role;
grant execute on function public.audit_for_partner(uuid)     to authenticated, service_role;
grant execute on function public.record_audit_attempt(text, text, text, uuid, text) to authenticated, service_role;
grant execute on function public.prune_audit_log(integer)    to service_role;

-- ----------------------------------------------------------------------------
-- فحص ذاتي — كل مسبار يُثبَت قبل أن يُصدَّق (النمط ٩ في LESSONS.md)
-- ----------------------------------------------------------------------------

do $$
declare
  v_n       integer;
  v_secret  uuid;
  v_row     public.audit_log;
  v_before  bigint;
begin
  -- (أ) المُشغّل مربوط بكل الجداول المرصودة الموجودة
  select count(*) into v_n
    from pg_trigger t join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and not t.tgisinternal and t.tgname like 'audit\_%';
  if v_n < 30 then
    raise exception '0036: مُشغّل التدقيق مربوط بـ% جدولاً فقط — المتوقع ٣٠ فأكثر', v_n;
  end if;

  -- (ب) ولا يُرصَد سجل أحداث (حلقة تضاعف الحجم بلا معلومة)
  if exists (
    select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
     where not t.tgisinternal and t.tgname like 'audit\_%'
       and c.relname in ('funnel_events', 'notifications', 'payment_events',
                         'booking_lookup_attempts', 'distance_cache',
                         'geocode_cache', 'booking_events', 'audit_log',
                         'audit_attempts')
  ) then
    raise exception '0036: مُشغّل التدقيق رُبط بسجل أحداث — حلقة تضاعف الحجم بلا معلومة';
  end if;

  -- (ج) 🔒 الحجب يعمل فعلاً — بشاهد إيجابي أولاً ثم سلبي
  if public.audit_redact('{"api_key":"سرّ","label":"ظاهر"}'::jsonb) ->> 'label' <> 'ظاهر' then
    raise exception '0036: مسبار الحجب معطّل — يحجب ما لا يجب حجبه، فلا تصدّق ما بعده';
  end if;
  if public.audit_redact('{"api_key":"سرّ"}'::jsonb) ->> 'api_key' = 'سرّ' then
    raise exception '0036: audit_redact لم تحجب api_key — الأسرار تُنسخ إلى السجل';
  end if;
  if public.audit_redact('{"customer_phone":"01000000000"}'::jsonb) ->> 'customer_phone'
       = '01000000000' then
    raise exception '0036: audit_redact لم تحجب هاتف العميل';
  end if;

  -- (د) الكتابة الحقيقية تُنتج صفاً: إدراج ثم تحديث ثم حذف على جدول مرصود
  select coalesce(max(id), 0) into v_before from public.audit_log;

  insert into public.extra_services (slug, title, price, max_qty, active)
  values ('zz-0036-selfcheck', 'فحص ذاتي 0036', 10, 1, true)
  returning id into v_secret;

  select count(*) into v_n from public.audit_log
   where id > v_before and entity = 'extra_services' and action = 'insert';
  if v_n <> 1 then
    raise exception '0036: الإدراج لم يُنتج صفاً في السجل (% صفاً)', v_n;
  end if;

  update public.extra_services set price = 20 where id = v_secret;
  select l.* into v_row from public.audit_log l
   where l.id > v_before and l.entity = 'extra_services' and l.action = 'update'
   order by l.id desc limit 1;
  if v_row.changes -> 'price' ->> 'to' is null then
    raise exception '0036: التحديث لم يسجّل فرق العمود price';
  end if;
  if v_row.entity_label <> 'zz-0036-selfcheck' then
    raise exception '0036: اللقطة النصية لم تُقرأ من tg_argv (وصلت «%»)', v_row.entity_label;
  end if;

  delete from public.extra_services where id = v_secret;
  select l.* into v_row from public.audit_log l
   where l.id > v_before and l.entity = 'extra_services' and l.action = 'delete'
   order by l.id desc limit 1;
  if v_row.snapshot ->> 'slug' <> 'zz-0036-selfcheck' then
    raise exception '0036: الحذف لم يحفظ لقطة الصف — يضيع ما حُذف بلا أثر';
  end if;

  -- تنظيف أثر الفحص من السجل نفسه (وهو الاستثناء الوحيد المصرَّح به هنا)
  delete from public.audit_log where id > v_before and entity = 'extra_services'
     and entity_label = 'zz-0036-selfcheck';

  -- (هـ) `anon` لا يقرأ الجدول ولا ينفّذ سطح القراءة
  select count(*) into v_n
    from information_schema.table_privileges
   where table_schema = 'public' and table_name in ('audit_log', 'audit_attempts')
     and grantee = 'anon';
  if v_n > 0 then
    raise exception '0036: anon يملك صلاحية على جداول التدقيق';
  end if;

  select count(*) into v_n
    from information_schema.table_privileges
   where table_schema = 'public' and table_name in ('audit_log', 'audit_attempts')
     and grantee = 'authenticated' and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE');
  if v_n > 0 then
    raise exception '0036: authenticated يملك كتابةً أو تفريغاً على جداول التدقيق (% منحة) — السجل ليس append-only', v_n;
  end if;

  raise notice '✔ 0036: السجل يعمل — مُشغّل واحد على % جدولاً، والأسرار محجوبة، والحذف يحفظ لقطته، ولا كتابة لأحد', v_n;
end;
$$;
