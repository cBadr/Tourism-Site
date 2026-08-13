-- ============================================================================
-- 0028 — تصليب الدفعة ٢ بعد المراجعتين النقديتين
--
-- الهجرة 0027 مطبَّقة، ولا تُعدَّل (D-03): التصحيح ترحيل جديد. أمسكت المراجعة
-- الأمنية عيباً **حرجاً** أُنتج من الميزة الجديدة نفسها، ومعه ثلاثة أدنى منه.
--
-- ── (١) العيب الحرج: «تابع حجزك» يسلّم المتعهدَ هامشَنا ────────────────────────
--
-- عقد البحث في 0027: «مرجع الحجز + هاتف العميل معاً = ما يكافئ حيازة الرابط».
-- وهو عقد سليم أمام غريب — **وساقط أمام المتعهد، لأننا نحن من يعطيه العاملين
-- كليهما**: `portal_trips()` تُرجع له بعد الإسناد `reference` و`customer_phone`
-- (والهاتف ضرورة تنفيذية لا نقاش فيها). فيكتبهما في النموذج العام فيحصل على
-- `public_token`، ومنه على `get_booking_by_token` (وهي ممنوحة لـ anon فلا يحتاج
-- جلسته أصلاً) ⇒ يرى **سعر العميل كاملاً** وخطة الدفع والإحداثيات الدقيقة
-- والملاحظات الخام وقائمة التحصيلات.
--
-- وسعر العميل ناقص مستحقه = **الهامش**. أي أن الباب الخلفي يهدم في خطوتين ما
-- بُني بثلاث هجرات لحمايته: `dispatch_public_label` تقصّ العنوان،
-- و`dispatch_safe_notes` تنقّح الملاحظة، و`dispatch_trip_payload` تحجب سعر
-- العميل، و`dispatch_settings` محجوبة عن `authenticated` لأن سياسة الهامش
-- «ليست من شأنه». وهو ليس حجزاً واحداً: `portal_trips` تحتفظ بكل رحلاته
-- المنفَّذة، فيمشي على تاريخه كله ويحسب هامشنا في كل رحلة.
--
-- **العلاج:** يُمنع عنه **المفتاح** لا الهاتف. المرجع `TR-XXXXXX` قيمةٌ يخاطب
-- بها العميلُ **الشركةَ**، والمتعهد لا يحتاجها لتنفيذ رحلة — يحتاج معرّفاً
-- ثابتاً يتحدث به مع التشغيل. فصار ما يراه رمزاً مشتقاً من معرّف الحجز
-- (`partner_trip_code`)، وهو غير مقبول في نموذج «تابع حجزك» أصلاً.
-- والتشغيل يقرأ الرمز نفسه في شاشة الطلب فيبقى الطرفان على أرض واحدة.
--
-- ولم تُمسّ `dispatch_trip_payload`: حمولتها تذهب إلى **فريق التشغيل** (جرس
-- اللوحة وتليجرام وبريد الفريق من `site_settings`)، لا إلى المتعهد — وحجب
-- المرجع عن التشغيل يعمي من يحتاجه.
--
-- ── (٢) الكنس يلتهم طلبات يعمل عليها الموظفون ────────────────────────────────
--
-- التقادم يُقاس من `created_at`، و`verify_payment(p_approve => false)` تُرجع
-- الحجز إلى `pending_payment` **ولا تلمس `created_at`**. فعميلٌ حجز اليوم ورفع
-- إيصالاً غير واضح، فرفضه التشغيل وطلب صورة أوضح ⇒ حجزه بعمر يومين وحالته
-- `pending_payment`، فيلتقطه الكنس التالي **بينما العميل يرفع البديل**.
-- و`cancelled` نهائية بنيوياً (لا انتقال منها في `booking_transition_allowed`)،
-- والكوبون المحروق لا يعود. العلاج: نشاطٌ حديث على الإيصالات يحمي كما تحمي
-- جلسة البوابة الحيّة.
--
-- ── (٣) نافذة سماح البوابة مربوطة بالمقبض نفسه ───────────────────────────────
--
-- الحماية من «مالٌ في الدفتر بلا حجز» كانت بعرض المهلة نفسها، والقيد يسمح بـ١٥
-- دقيقة. فمن يقف على صفحة تحقق البنك عشرين دقيقة تُحكَم جلسته بالبيات هو وحجزه.
-- صارت للسماح أرضية مستقلة: ساعة على الأقل مهما صغرت المهلة.
--
-- ── (٤) حارس القبول ممنوح للزائر والمسجَّل ──────────────────────────────────
--
-- `trip_offers_guard_accept()` أُنشئت في 0027 ولم تُسحب صلاحيتها، وكل دالة
-- جديدة تولد مفتوحة. غير مستغَلّة (نوعها `trigger` فلا تعرضها PostgREST ونداؤها
-- المباشر يخطئ)، لكنها الحارس الذي يقوم عليه سقف الدين كله — والملف نفسه كتب
-- القاعدة ثم سها عنها في موضع واحد.
--
-- المرجع: مراجعتا 2026-08-13 · docs/VISION.md ملحق ٢ · lib/dispatch-types.ts
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (١-أ) الرمز الذي يراه المتعهد — مشتق من معرّف الحجز لا من مرجع العميل
--
-- ثمانية أحرف من معرّف الحجز: ثابت، ولا يتصادم عملياً (٤ مليارات احتمال)،
-- **وقابل للبحث عند التشغيل** لأنه بادئة المعرّف نفسه:
--     select … from public.bookings where replace(id::text,'-','') like 'A1B2C3D4%';
-- ولا يفتح شيئاً: معرّف الحجز ليس مفتاح وصول في أي مسار (الوصول بالتوكن وحده).
-- ----------------------------------------------------------------------------
create or replace function public.partner_trip_code(p_booking_id uuid)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
           when p_booking_id is null then null
           else '#' || upper(left(replace(p_booking_id::text, '-', ''), 8))
         end;
$$;

comment on function public.partner_trip_code(uuid) is
  'الرمز الذي يراه المتعهد بدل مرجع العميل TR-XXXXXX. سبب وجوده أمني: المتعهد يرى هاتف العميل بعد الإسناد بحكم التنفيذ، فلو رأى المرجع أيضاً لاجتمع لديه عاملا نموذج «تابع حجزك» فحصل على توكن الحجز ومنه على سعر العميل — أي على هامشنا. مشتق من معرّف الحجز فيبقى قابلاً للبحث عند التشغيل.';

revoke all    on function public.partner_trip_code(uuid) from public, anon, authenticated;
grant execute on function public.partner_trip_code(uuid) to authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.partner_trip_code(uuid) to service_role';
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- (١-ب) `portal_offers()` — نفس نوع الإرجاع حرفياً، والمرجع وحده هو ما تغيّر
-- (الجسم منقول من التعريف الحيّ بعد 0027 لا بنسخ يدوي، فلا يسقط سطر.)
-- ----------------------------------------------------------------------------
create or replace function public.portal_offers()
returns table (
  offer_id      uuid,
  reference     text,
  origin_label  text,
  dest_label    text,
  distance_km   numeric,
  passengers    integer,
  round_trip    boolean,
  waiting_hours numeric,
  class_title   text,
  pickup_at     timestamptz,
  payout        numeric,
  currency      text,
  expires_at    timestamptz,
  notes         text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    o.id,
    -- 0028: رمز المتعهد لا مرجع العميل — العامل الأول في «تابع حجزك»
    public.partner_trip_code(b.id),
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
    -- 0027: من بلغ سقف دينه لا يرى العرض القديم — فلا يبقى زرٌّ يفشل دائماً
    and not public.partner_over_debt_limit(o.subcontractor_id)
  order by o.expires_at asc;
$$;

-- ----------------------------------------------------------------------------
-- (١-ج) `portal_trips()` — نفس نوع الإرجاع حرفياً، والمرجع وحده هو ما تغيّر
--
-- ⚠ الهاتف والاسم يبقيان: بعد الإسناد هما أداة التنفيذ (D-19 يمنعهما **قبل**
-- القبول لا بعده). المحجوب هو المفتاح الثاني للنموذج العام لا بيانات التواصل.
-- ----------------------------------------------------------------------------
create or replace function public.portal_trips()
returns table (
  offer_id          uuid,
  booking_id        uuid,
  reference         text,
  origin_label      text,
  dest_label        text,
  distance_km       numeric,
  passengers        integer,
  round_trip        boolean,
  waiting_hours     numeric,
  class_title       text,
  pickup_at         timestamptz,
  payout            numeric,
  currency          text,
  expires_at        timestamptz,
  notes             text,
  customer_name     text,
  customer_phone    text,
  customer_whatsapp text,
  status            text,
  assigned_at       timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    o.id,
    b.id,
    -- 0028: رمز المتعهد لا مرجع العميل (انظر ترويسة الملف — العيب الحرج)
    public.partner_trip_code(b.id),
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

-- إعادة تثبيت منح 0013 (‏`create or replace` لا تفقدها، لكن التأكيد أرخص من ثغرة)
revoke all    on function public.portal_offers() from public, anon, authenticated;
grant execute on function public.portal_offers() to authenticated;
revoke all    on function public.portal_trips()  from public, anon, authenticated;
grant execute on function public.portal_trips()  to authenticated;

-- ----------------------------------------------------------------------------
-- (٢+٣) الكنس: لا يلمس حجزاً عليه نشاط إيصالٍ حديث، وسماح البوابة بأرضية ساعة
-- ----------------------------------------------------------------------------
create or replace function public.cancel_stale_bookings(p_limit integer default 200)
returns table (
  scanned   integer,
  cancelled integer,
  failed    integer
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_cfg       record;
  v_timeout   integer;
  v_grace     interval;
  v_id        uuid;
  v_rows      integer;
  v_scanned   integer := 0;
  v_cancelled integer := 0;
  v_failed    integer := 0;
begin
  if not public.dispatch_ops_allowed() then
    raise exception 'كنس الطلبات غير المدفوعة متاح للمشرف أو لخادم الموقع فقط'
      using hint = 'forbidden';
  end if;

  if not pg_try_advisory_xact_lock(913027) then
    return query select 0, 0, 0;
    return;
  end if;

  select * into v_cfg from public.trip_config();

  if not coalesce(v_cfg.unpaid_cancel_enabled, false) then
    return query select 0, 0, 0;
    return;
  end if;

  v_timeout := coalesce(v_cfg.unpaid_timeout_minutes, 1440);

  -- 0028: أرضية مستقلة لنافذة السماح. كانت بعرض المهلة نفسها، والقيد يسمح بـ١٥
  -- دقيقة ⇒ من يقف على صفحة تحقق البنك عشرين دقيقة تُحكَم جلسته بالبيات.
  v_grace := greatest(make_interval(mins => v_timeout), interval '60 minutes');

  for v_id in
    select b.id
    from public.bookings b
    where b.status = 'pending_payment'
      and b.created_at < now() - make_interval(mins => v_timeout)
      -- جلسة بوابة حيّة ⇒ المال في الطريق، والإلغاء يتركه في الدفتر بلا حجز
      and not exists (
        select 1
        from public.payment_intents i
        where i.booking_id = b.id
          and i.status in ('created', 'pending')
          and i.created_at > now() - v_grace
      )
      -- 0028: ونشاط إيصالٍ حديث كذلك. `verify_payment(false)` تُرجع الحجز إلى
      -- `pending_payment` **ولا تلمس `created_at`**، فحجزٌ رُفض إيصاله اليوم
      -- يبدو للكنس متقادماً بعمر إنشائه — ويُلغى والعميل يرفع البديل. والعمر
      -- يُقاس من أحدث الحدثين: الرفع أو البتّ.
      and not exists (
        select 1
        from public.payments p
        where p.booking_id = b.id
          and greatest(p.created_at, coalesce(p.verified_at, p.created_at))
              > now() - make_interval(mins => v_timeout)
      )
    order by b.created_at
    limit greatest(coalesce(p_limit, 200), 1)
    for update skip locked
  loop
    v_scanned := v_scanned + 1;

    begin
      perform set_config(
        'tours.booking_note',
        'إلغاء تلقائي — انتهت مهلة الدفع (' || v_timeout || ' دقيقة)',
        true
      );

      update public.bookings b
         set status = 'cancelled'
       where b.id = v_id;

      get diagnostics v_rows = row_count;
      v_cancelled := v_cancelled + coalesce(v_rows, 0);
    exception
      when others then
        v_failed := v_failed + 1;
        raise warning 'تعذّر الإلغاء التلقائي للحجز % — %', v_id, sqlerrm;
    end;
  end loop;

  return query select v_scanned, v_cancelled, v_failed;
end;
$$;

comment on function public.cancel_stale_bookings(integer) is
  'كنس الطلبات غير المدفوعة بعد انقضاء مهلة trip_settings. حارسه dispatch_ops_allowed() لا is_admin() لأنه يعمل بمفتاح الخدمة. لا يلمس: حجزاً عليه جلسة بوابة حيّة (بسماح أرضيته ساعة مهما صغرت المهلة)، ولا حجزاً عليه نشاط إيصال حديث — لأن رفض الإيصال يعيد الحجز إلى pending_payment بلا تحديث created_at فيبدو متقادماً والعميل يرفع البديل. الكنس بلا أثر مالي بنيوياً (حجز pending_payment بلا قيود دفتر)، وكل صف في كتلة استثناء مستقلة فلا يُسقط صفٌّ سام الدورة كلها. القيد الوحيد الذي لا يعالجه: استخدام كوبون محروق — سلوك قائم للإلغاء اليدوي أيضاً، مؤجَّل بقرار موثّق.';

-- ----------------------------------------------------------------------------
-- (٤) سحب صلاحية حارس القبول — كل دالة جديدة تولد مفتوحة
-- ----------------------------------------------------------------------------
revoke all on function public.trip_offers_guard_accept() from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- (٥) فحص ذاتي
-- ----------------------------------------------------------------------------
do $$
declare
  v_src text;
begin
  -- (أ) الشاهد الإيجابي للمسبار: مصدر دالة معروفة يُقرأ فعلاً
  v_src := pg_get_functiondef(to_regprocedure('public.portal_trips()')::oid);
  if position('customer_phone' in coalesce(v_src, '')) = 0 then
    raise exception '0028: مسبار مصدر portal_trips معطّل — لا تصدّق ما بعده';
  end if;

  -- (ب) 🔒 المرجع لم يعد يصل المتعهد من أيٍّ من الدالتين
  if position('b.reference' in v_src) > 0 then
    raise exception '0028: portal_trips ما زالت تُرجع مرجع العميل — العامل الثاني في «تابع حجزك» بيد المتعهد';
  end if;

  v_src := pg_get_functiondef(to_regprocedure('public.portal_offers()')::oid);
  if position('b.reference' in v_src) > 0 then
    raise exception '0028: portal_offers ما زالت تُرجع مرجع العميل';
  end if;

  if position('partner_trip_code' in v_src) = 0 then
    raise exception '0028: portal_offers لا تستعمل partner_trip_code';
  end if;

  -- (ج) الكنس يحمي نشاط الإيصالات ونافذة السماح لها أرضية
  v_src := pg_get_functiondef(to_regprocedure('public.cancel_stale_bookings(integer)')::oid);
  if position('public.payments' in coalesce(v_src, '')) = 0 then
    raise exception '0028: الكنس لا يستثني الحجوزات ذات نشاط إيصال حديث';
  end if;
  if position('60 minutes' in v_src) = 0 then
    raise exception '0028: نافذة سماح البوابة بلا أرضية مستقلة';
  end if;

  -- (د) حارس القبول لم يعد ممنوحاً لأحد
  if exists (select 1 from pg_roles where rolname = 'anon') then
    if has_function_privilege('anon', 'public.trip_offers_guard_accept()', 'execute')
       or has_function_privilege('authenticated', 'public.trip_offers_guard_accept()', 'execute') then
      raise exception '0028: trip_offers_guard_accept ما زالت ممنوحة — حارس سقف الدين مكشوف';
    end if;

    -- شاهد إيجابي: الرمز الجديد **ممنوح** فعلاً لمن يحتاجه
    if not has_function_privilege('authenticated', 'public.partner_trip_code(uuid)', 'execute') then
      raise exception '0028: partner_trip_code غير ممنوحة لـ authenticated — مسبار الصلاحيات مقلوب';
    end if;
  end if;

  raise notice '✔ 0028: رمز المتعهد بدل مرجع العميل في البورتال · الكنس يحترم نشاط الإيصالات وأرضية سماح البوابة · حارس القبول مسحوب';
end;
$$;
