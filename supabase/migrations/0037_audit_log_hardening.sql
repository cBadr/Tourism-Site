-- ============================================================================
-- 0037 — تصليب نظام السجلات بعد المراجعتين (الدفعة ٤ — الملاحظة ١٥)
--
-- مراجعتان (أمنية + انحراف عقود) ثم تحقّق خصومي عليهما. **صمدت ستة بنود**،
-- ورُفض إصلاحان مقترحان لأنهما أسوأ من علّتهما (مذكوران أدناه كي لا يُعادا).
--
-- والدرس الحاكم لهذه الجولة: **لقطةُ عمودٍ لا وجود له تفشل صامتة.** ثلاثة من
-- الستة (١ و٤ و٦) صنفٌ واحد: كودٌ يقرأ اسم عمود من الذاكرة لا من الكتالوج،
-- ويبتلع غيابَه بـ`?` أو بشرط `elsif` لا يتحقق. والفحص الذاتي في 0036 اختبر
-- `extra_services` وحده — فلم يكن **قادراً** على أن يفشل في أيٍّ منها
-- (النمط ٩ في `LESSONS.md`). ولذلك يفحص هذا الملف **الكتالوج نفسه** ويرفع
-- استثناءً بدل التخطي.
--
-- ── ما رُفض من مقترحات المراجعة، بمبرره ───────────────────────────────────
--
-- (أ) **حجب `notes` و`details` و`plate`**: يفرغ السطر من معناه — و`expenses`
--     لقطتها النصية هي `note` نفسها. المحجوب **معرِّفات** لا أوصاف.
-- (ب) **حذف حارس `record_audit_attempt`**: الدالة ممنوحة لـ`authenticated`،
--     فحذف الحارس يمنح كل متعهد حقنَ نصوص حرة بلا حدّ في جدول يقرؤه المشرف.
--     البديل المشحون: **هوية فعلية + سقف معدّل**، لا فتح.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (١) الحجب: المعرِّفات التي فاتت — ومسحُ ما كُتب منها فعلاً
-- ----------------------------------------------------------------------------
-- 0036 حجبت `customer_phone` على `bookings` وتركت نظيرها في الجدول المجاور:
-- `subcontractors.phone/whatsapp/email` و`payment_accounts.handle/holder_name`
-- و`profiles.full_name` و`bookings.customer_name`. والقياس الحيّ أثبت التناقض
-- **داخل الصف الواحد**: لقطة حذف تحمل `customer_phone = [محجوب]` بجوار
-- `customer_name` صريحاً.
--
-- 🔒 **والقائمة أدناه هي المصدر الوحيد للحقيقة.** نظيرتها في
-- `lib/audit-types.ts` مرآةٌ توثيقية — وقد ادّعى العقد أن اختباراً يمسك
-- افتراقهما، وكان الادعاء غير صحيح (الاختبار ينسخ القائمة نسخةً ثالثة). فصار
-- الكشفُ عنها دالةً تُقرأ من القاعدة (`audit_secret_columns`) ويقارنها الاختبار
-- بمجموعةٍ مكتوبة فيه، فأي تعديل هنا يُسقط الاختبار ويُجبر على تحديث الثلاثة.
-- ----------------------------------------------------------------------------

create or replace function public.audit_secret_columns()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array[
    -- أسرار — وقائية: لا عمود منها في القاعدة اليوم (المفاتيح في البيئة)
    'secret', 'secret_key', 'api_key', 'access_token', 'token', 'password',
    'encrypted_password', 'webhook_secret', 'config',
    -- معرِّفات قائمة فعلاً
    'customer_phone', 'customer_whatsapp', 'phone_norm', 'public_token',
    'customer_name', 'phone', 'whatsapp', 'email', 'handle', 'holder_name',
    'full_name'
  ]::text[];
$$;

create or replace function public.audit_is_secret(p_column text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select lower(coalesce(p_column, '')) = any (public.audit_secret_columns());
$$;

-- ── مسحُ ما كُتب قبل هذا التصليب ────────────────────────────────────────────
-- ⚠ هذا **تعديلٌ على سجلٍّ append-only**، وهو الاستثناء الوحيد المصرَّح به هنا
-- وله مبرر واحد: إنه **يحذف ما لم يكن يجوز أن يُكتب**، لا يعيد كتابة تاريخ.
-- (نفس منطق الاستثناء المصرَّح به لـ`pnpm demo:clean` على الدفتر في D-06.)
-- والحدث نفسه يبقى: من فعل ومتى وأي عمود مسّ — يُحذف **القيمة** وحدها.
do $$
declare
  v_snap integer := 0;
  v_chg  integer := 0;
begin
  with fixed as (
    select id, public.audit_redact(snapshot) as s
      from public.audit_log
     where snapshot is not null
       and exists (
         select 1 from jsonb_each(snapshot) e(k, v)
          where public.audit_is_secret(e.k) and e.v <> to_jsonb('[محجوب]'::text))
  )
  update public.audit_log l set snapshot = f.s from fixed f where l.id = f.id;
  get diagnostics v_snap = row_count;

  with fixed as (
    select l.id,
           (select jsonb_object_agg(
                     e.k,
                     case when public.audit_is_secret(e.k)
                            then jsonb_build_object('redacted', true)
                          else e.v end)
              from jsonb_each(l.changes) e(k, v)) as c
      from public.audit_log l
     where l.changes is not null
       and exists (
         select 1 from jsonb_each(l.changes) e(k, v)
          where public.audit_is_secret(e.k) and not (e.v ? 'redacted'))
  )
  update public.audit_log l set changes = f.c from fixed f where l.id = f.id;
  get diagnostics v_chg = row_count;

  raise notice '✔ 0037: مُسح ما كُتب قبل التصليب — % لقطة و% فرقاً', v_snap, v_chg;
end;
$$;

-- ----------------------------------------------------------------------------
-- (٢) المُشغّل: سقف طول، وربط الإسناد بالمتعهد
-- ----------------------------------------------------------------------------
-- عيبان مقيسان حياً:
--   • متعهد كتب `notes` بطول ٢٠٬٠٠٠ حرف فأنتج صف فرقٍ بطول ٢٠٬٠٣٥ (والتحديث
--     التالي يضاعفه: `from` + `to`). السجل يُقرأ لا يُؤرشَف، والقيمة المقصوصة
--     تكفي للتدقيق — ومن أراد النص كاملاً فمكانه الصف نفسه.
--   • `audit_for_partner` أرجعت صفر صف عن ٢٣ صفَّ إسناد، لأن عمود `dispatches`
--     اسمه `assigned_subcontractor_id` لا `subcontractor_id`.
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

  if v_row ? 'id' and (v_row ->> 'id') ~ '^[0-9a-fA-F-]{36}$' then
    v_id := (v_row ->> 'id')::uuid;
  end if;

  if v_row ? 'booking_id' and (v_row ->> 'booking_id') ~ '^[0-9a-fA-F-]{36}$' then
    v_booking := (v_row ->> 'booking_id')::uuid;
  elsif tg_table_name = 'bookings' then
    v_booking := v_id;
  end if;

  -- الإسناد: `dispatches` و`trip_offers` لا يتفقان على اسم العمود، فيُقرأ
  -- الاثنان صراحةً. وقراءة اسمٍ واحد من الذاكرة هي ما جعل ٢٣ صفَّ إسناد بلا ربط.
  if v_row ? 'subcontractor_id' and (v_row ->> 'subcontractor_id') ~ '^[0-9a-fA-F-]{36}$' then
    v_sub := (v_row ->> 'subcontractor_id')::uuid;
  elsif v_row ? 'assigned_subcontractor_id'
        and (v_row ->> 'assigned_subcontractor_id') ~ '^[0-9a-fA-F-]{36}$' then
    v_sub := (v_row ->> 'assigned_subcontractor_id')::uuid;
  elsif tg_table_name = 'subcontractors' then
    v_sub := v_id;
  elsif tg_table_name = 'profiles' and v_id is not null then
    -- ملف المتعهد يجسر الاثنين، فتظهر تغييرات حسابه في قصته
    select s.id into v_sub from public.subcontractors s where s.profile_id = v_id;
  end if;

  if tg_nargs > 0 and tg_argv[0] is not null and v_row ? tg_argv[0] then
    v_label := left(v_row ->> tg_argv[0], 160);
  end if;

  if tg_op = 'UPDATE' then
    for r in select key from jsonb_each(v_new)
    loop
      if v_new -> r.key is distinct from v_old -> r.key then
        if r.key <> 'updated_at' then
          v_changes := v_changes || jsonb_build_object(
            r.key,
            case
              when public.audit_is_secret(r.key)
                then jsonb_build_object('redacted', true)
              -- سقف الطول: السجل يُقرأ لا يُؤرشَف، ونصٌّ بعشرين ألف حرف في
              -- طرفَي الفرق يجعل صفاً واحداً أثقل من ألف صف
              else jsonb_build_object(
                     'from', public.audit_clip(v_old -> r.key),
                     'to',   public.audit_clip(v_new -> r.key))
            end);
        end if;
      end if;
    end loop;

    if v_changes = '{}'::jsonb then
      return null;
    end if;
  end if;

  if tg_op = 'DELETE' then
    v_snapshot := public.audit_redact(v_old);
  end if;

  v_note := nullif(btrim(coalesce(current_setting('tours.audit_note', true), '')), '');
  if v_note is not null then
    perform set_config('tours.audit_note', '', true);
    v_note := left(v_note, 500);
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

  return null;
end;
$$;

/** يقصّ قيمة نصية طويلة ويُبقي غيرها كما هو — عرضٌ لا تغيير معنى */
create or replace function public.audit_clip(p_value jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case
    when p_value is null then null
    when jsonb_typeof(p_value) = 'string' and length(p_value #>> '{}') > 2000
      then to_jsonb(left(p_value #>> '{}', 2000) || '… [مقصوص]')
    when jsonb_typeof(p_value) in ('object', 'array') and length(p_value::text) > 4000
      then to_jsonb('[كائن كبير — مقصوص]'::text)
    else p_value
  end;
$$;

-- ----------------------------------------------------------------------------
-- (٣) إصلاح عمودَي لقطة لا وجود لهما — وفحصٌ يمنع تكرارها
-- ----------------------------------------------------------------------------
-- `tariffs` مفتاحه `class_id` ولا عمود `class_slug` فيه ولا `id`؛ و`sections`
-- عموده `type` لا `kind`. فكان تعديل تعريفة يُنتج سطراً **لا يقول أي فئة**.
-- والسبب البنيوي أن `log_audit` يبتلع العمود الغائب بـ`v_row ? tg_argv[0]`،
-- والربطُ في 0036 لم يتحقق من الكتالوج. فالتحقق أدناه **يرفع استثناءً**.
-- ----------------------------------------------------------------------------

do $$
declare
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
    ['tariffs',                 'class_id'],
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
    ['sections',                'type'],
    ['promo_banners',           'title'],
    -- مُضافان بعد المراجعة: لقطة الخدمات مالٌ على الحجز، والاسترداد أثرُ كوبون
    ['booking_extras',          'title_snapshot'],
    ['coupon_redemptions',      null]
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
      raise exception '0037: الجدول % غير موجود — الخريطة تخالف الكتالوج', v_tbl;
    end if;

    -- 🔒 الفحص الذي كان غائباً: عمود اللقطة يجب أن يوجد فعلاً، وإلا فالصفوف
    --    تخرج بلا هوية ولا يلاحظ أحد (وهو ما وقع لـtariffs وsections).
    if v_label is not null and not exists (
      select 1 from information_schema.columns c
       where c.table_schema = 'public' and c.table_name = v_tbl
         and c.column_name = v_label
    ) then
      raise exception
        '0037: عمود اللقطة «%» غير موجود في الجدول % — صفوفه ستخرج بلا هوية',
        v_label, v_tbl;
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

  raise notice '✔ 0037: أُعيد ربط مُشغّل التدقيق بـ% جدولاً، وكل عمود لقطة متحقَّق من وجوده', v_made;
end;
$$;

-- ----------------------------------------------------------------------------
-- (٤) `record_audit_attempt`: هوية فعلية + سقف معدّل — لا فتحٌ ولا إغلاق
-- ----------------------------------------------------------------------------
-- كان الحارس `audit_admin_allowed()` فيرفض كل فاعل غير مشرف — أي أن الجدول
-- يسجّل **رفض المشرف وحده**، عكس غرضه المكتوب («من طرق باباً ليس له؟»).
-- وحذفُ الحارس (كما اقترحت المراجعة) أسوأ: الدالة ممنوحة لـ`authenticated`،
-- فيصير لكل متعهد حقنُ نصوص حرة بلا حدّ في جدول يقرؤه المشرف.
--
-- فالمشحون وسطٌ بينهما: **هوية فعلية مطلوبة** (جلسة أو خدمة — لا زائر)، **وسقف
-- معدّل** لكل فاعل في الساعة يمنع الإغراق. والسقف يُفرض بعدٍّ **مُلتزَم سابقاً**
-- (صفوف معاملات ماضية) فلا يقع في D-48: تجاوزُه يُنهي الدالة **بصمت بلا
-- استثناء**، فلا يكشف للمُغرِق أنه بلغ الحدّ ولا يكسر مسار المستدعي.
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
declare
  v_actor uuid;
  v_kind  text;
  v_n     integer;
begin
  v_actor := public.current_actor();
  v_kind  := public.audit_actor_kind();

  -- زائرٌ بلا هوية لا يسجّل: لا فاعل يُنسب إليه، والباب يصير مفتوحاً للإغراق
  if v_actor is null and not public.audit_admin_allowed() then
    return;
  end if;

  -- سقف معدّل: ٦٠ محاولة لكل فاعل في الساعة. العدّ على صفوف **ملتزمة سابقاً**،
  -- والتجاوز يخرج بصمت — فلا استثناء يُرجِع معاملة المستدعي ولا رسالة تكشف الحد.
  if v_actor is not null then
    select count(*) into v_n
      from public.audit_attempts a
     where a.actor = v_actor and a.occurred_at > now() - interval '1 hour';
    if v_n >= 60 then
      return;
    end if;
  end if;

  insert into public.audit_attempts (
    actor, actor_kind, operation, reason, entity, entity_id, detail
  ) values (
    v_actor,
    v_kind,
    left(coalesce(nullif(btrim(p_operation), ''), 'unknown'), 80),
    left(coalesce(nullif(btrim(p_reason), ''), 'unknown'), 80),
    left(nullif(btrim(coalesce(p_entity, '')), ''), 80),
    p_entity_id,
    left(nullif(btrim(coalesce(p_detail, '')), ''), 500)
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- (٥) التقليم يصل من اللوحة
-- ----------------------------------------------------------------------------
-- كان ممنوحاً لـ`service_role` وحده، وواجهة `/admin` تعمل بدور `authenticated`
-- — فالسجل ينمو بلا أي مسار تقليم متاح للمالك، ولا `pg_cron` في القاعدة.
-- والحارس الداخلي `audit_admin_allowed()` كافٍ (نفس نمط بقية الدوال الإدارية).
-- ----------------------------------------------------------------------------

grant execute on function public.prune_audit_log(integer) to authenticated;
revoke all on function public.audit_secret_columns() from public, anon, authenticated;
revoke all on function public.audit_clip(jsonb)      from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- فحص ذاتي — يحرس ما أُصلح **وما كان قائماً** معاً (D-58)
-- ----------------------------------------------------------------------------

do $$
declare
  v_n    integer;
  v_id   uuid;
  v_base bigint;
  v_row  public.audit_log;
  v_lbl  text;
begin
  -- (أ) عمود اللقطة موجود فعلاً في كل مُشغّل مربوط — الفحص الذي كان غائباً
  for v_lbl, v_n in
    select c.relname, 1
      from pg_trigger t join pg_class c on c.oid = t.tgrelid
      join pg_namespace ns on ns.oid = c.relnamespace
     where ns.nspname = 'public' and not t.tgisinternal and t.tgname like 'audit\_%'
  loop
    null; -- التحقق الفعلي تمّ في كتلة الربط أعلاه بإثارة استثناء
  end loop;

  select count(*) into v_n
    from pg_trigger t join pg_class c on c.oid = t.tgrelid
    join pg_namespace ns on ns.oid = c.relnamespace
   where ns.nspname = 'public' and not t.tgisinternal and t.tgname like 'audit\_%';
  if v_n <> 34 then
    raise exception '0037: عدد المُشغّلات % لا ٣٤', v_n;
  end if;

  -- (ب) المعرِّفات الجديدة محجوبة — مسبار إيجابي أولاً
  if public.audit_redact('{"label":"ظاهر"}'::jsonb) ->> 'label' <> 'ظاهر' then
    raise exception '0037: مسبار الحجب معطّل — يحجب العادي، فلا تصدّق ما بعده';
  end if;
  foreach v_lbl in array array['phone', 'whatsapp', 'email', 'handle',
                               'holder_name', 'full_name', 'customer_name'] loop
    if not public.audit_is_secret(v_lbl) then
      raise exception '0037: العمود «%» لم يُضَف إلى قائمة الحجب', v_lbl;
    end if;
  end loop;
  -- وما رُفض حجبه يبقى ظاهراً: حجبه يفرغ السطر من معناه
  if public.audit_is_secret('note') or public.audit_is_secret('notes')
     or public.audit_is_secret('details') then
    raise exception '0037: عمود وصفي حُجب — السطر يفرغ من معناه (رُفض في المراجعة)';
  end if;

  -- (ج) ولا صفَّ واحد باقياً بقيمة معرِّف مكشوفة
  select count(*) into v_n from public.audit_log l
   where l.snapshot is not null
     and exists (select 1 from jsonb_each(l.snapshot) e(k, v)
                  where public.audit_is_secret(e.k) and e.v <> to_jsonb('[محجوب]'::text));
  if v_n > 0 then
    raise exception '0037: % لقطة ما زالت تحمل معرِّفاً مكشوفاً بعد المسح', v_n;
  end if;

  -- (د) السقف يقصّ فعلاً
  if length(public.audit_clip(to_jsonb(repeat('ح', 5000))) #>> '{}') > 2100 then
    raise exception '0037: audit_clip لا تقصّ النص الطويل';
  end if;
  if public.audit_clip(to_jsonb('قصير'::text)) #>> '{}' <> 'قصير' then
    raise exception '0037: audit_clip تقصّ النص القصير — مسبار معطّل';
  end if;

  -- (هـ) الربط بالمتعهد يقرأ العمودين معاً — اختبار حيّ على جدول الإسناد
  select count(*) into v_n
    from information_schema.columns
   where table_schema = 'public' and table_name = 'dispatches'
     and column_name = 'assigned_subcontractor_id';
  if v_n <> 1 then
    raise exception '0037: عمود assigned_subcontractor_id غير موجود — الإصلاح بُني على وهم';
  end if;
  if position('assigned_subcontractor_id' in
       pg_get_functiondef(to_regprocedure('public.log_audit()')::oid)) = 0 then
    raise exception '0037: log_audit لا تقرأ assigned_subcontractor_id';
  end if;

  -- (و) وما كان قائماً لم ينكسر: الدورة الثلاثية ما زالت تعمل
  select coalesce(max(id), 0) into v_base from public.audit_log;
  insert into public.extra_services (slug, title, price, max_qty, active)
  values ('zz-0037-selfcheck', 'فحص ذاتي 0037', 10, 1, true) returning id into v_id;
  update public.extra_services set price = 20 where id = v_id;
  delete from public.extra_services where id = v_id;

  select count(*) into v_n from public.audit_log
   where id > v_base and entity_label = 'zz-0037-selfcheck';
  if v_n <> 3 then
    raise exception '0037: الدورة الثلاثية أنتجت % صفاً لا ثلاثة — انحدار', v_n;
  end if;
  delete from public.audit_log where id > v_base and entity_label = 'zz-0037-selfcheck';

  raise notice '✔ 0037: اللقطات متحقَّقة من الكتالوج، والمعرِّفات محجوبة والمكتوب مُسح، والسقف يقصّ، والإسناد موصول، والدورة سليمة';
end;
$$;
