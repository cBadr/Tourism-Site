-- ============================================================================
-- 0052 — حارسان يتبعان قرارَي بدر، وكلاهما مقيسٌ لا مُستنتَج
--
-- يُقرأ مع `0051_failed_trips.sql`: ثلاثتها تمسّ حالات الإسناد، وفُصلا في ملفين
-- لأن آليتيهما لا تتقاطعان — لا لأن أحدهما أقل إلحاحاً.
--
-- ══════════════════════════════════════════════════════════════════════════
--  (١) `accept_offer` لا تشترط شيئاً عن حالة المتعهد — **قِيس، لم يُستنتَج**
-- ══════════════════════════════════════════════════════════════════════════
--
-- حسم بدر 2026-08-15 أن **الموقوف يرى رحلاته المُسنَدة** — و`portal_trips()` و
-- `portal_balance()` تفعلان ذلك اليوم، **وهذا صحيحٌ ويبقى**: عميلٌ غداً بسائقٍ
-- لا يعرف بيانات رحلته عطبٌ أكبر، والإيقاف لا يُسقط ديناً.
--
-- 🔴 **لكن رؤية رحلةٍ مُسنَدة ليست قبولَ عملٍ جديد.** وشرطُ `accept_offer`
-- الوحيد — مقروءاً من `pg_get_functiondef` — أن يكون العرض لصاحبه. فمتعهدٌ
-- أُوقف اليوم، وبيده عرضٌ صدر **قبل** الإيقاف ولم تنتهِ مهلته، **يقبله فيكسب
-- رحلةً وهو موقوف**.
--
-- ⚠ وحجمُه بحقّه: **حدٌّ لا حريق**. `dispatch_pool` تشترط `s.status = 'approved'`
--    فلا عرضٌ جديد يصل الموقوف، والقائم ينتهي بمهلته، و**صفرُ عرضٍ معلّق في
--    القاعدة وقت الفحص**. لكن سطراً واحداً يجعل الإيقاف يعني ما يقوله.
--
-- والشرط `= 'approved'` لا `<> 'suspended'`: `pending` — من لم يُعتمد بعد —
-- لا يقبل عملاً كذلك، وهو نفس الشرط الذي تفرضه `dispatch_pool` على الطرف الآخر.
-- فمصدرُ الأهلية واحد على طرفَي البث والقبول.
--
-- ══════════════════════════════════════════════════════════════════════════
--  (٢) `cancel_stale_bookings` لا تنظر إلى `pickupAt` — **قِيس، لم يُستنتَج**
-- ══════════════════════════════════════════════════════════════════════════
--
-- شرطها اليوم `b.created_at < now() - timeout` **وحده**. فحجزٌ لرحلةٍ بعد شهر
-- يُلغى بالساعة نفسها التي يُلغى بها حجزُ الغد — والعميل الذي حجز مبكراً هو
-- بالضبط من نريد الاحتفاظ به.
--
-- ── والمقبضان: كيف يتفاعلان ───────────────────────────────────────────────
--
-- 🔒 بدر رفع `unpaid_timeout_minutes` من ٦٠ إلى **٣٦٠** بنفسه من اللوحة
--    2026-08-15. فإعادةُ تأويل رقمه في صمت — أن يصير «مهلة إفراجٍ قبل الموعد»
--    مثلاً — تُغيّر معنى إعدادٍ ضبطه بيده والشاشة تسمّيه «مهلة الدفع».
--    **فيبقى مهلةَ الدفع كما ضبطها، ويكتسب دوراً ثانياً صريحاً**:
--
--      الحجز يُكنَس حين **يمضي الأمران معاً**:
--        (١) أخذ العميل مهلته كاملة:  now() ≥ created_at + timeout
--        (٢) واقترب الموعد أو فات:    now() ≥ pickupAt   − timeout
--
--      أي أن  hold_until = greatest(created_at + timeout, pickupAt − timeout)
--      وهي **دالةٌ واحدة** — `booking_hold_until` — يقرؤها الكنس وتعرضها
--      الواجهة («حجزك محفوظ حتى ‹تاريخ›» — م‑٥)، فلا رقمان ينحرفان.
--
--      وبلا `pickupAt` (حجزٌ قديم أو ناقص) تعود القاعدة إلى العمر وحده — نفس
--      السلوك القائم حرفياً، فلا صفٌّ يتغيّر مصيره بسبب حقلٍ غائب.
--
-- ── وحالةٌ واحدة تبقى، بوعيٍ لا بسهو ──────────────────────────────────────
--
-- من حجز قبل نصف ساعة لرحلةٍ بعد ساعة يحتفظ بمهلته الست ساعات — أي **إلى ما
-- بعد موعد رحلته**. وهو المقصود: الشرط (١) وعدٌ قطعناه للعميل على الشاشة، ومرورُ
-- الموعد لا يُقصّر وعداً سبق. والبديل — كنسُ حجزٍ صاحبُه ما زال داخل مهلته
-- المعلنة — يكسر الوعد نفسه الذي بُنيت م‑٥ لعرضه.
--
-- ⚠ ولم يُبنَ على أرقامنا: «وسيط وصول الإيصال ١٤٫٨ ساعة» تبيّن أنه **من بيانات
--    الزرع بالكامل** — تخمينُ كاتب السكربت لا سلوكُ عميل؛ والإيصالات غير
--    المبذورة السبعة كلها وصلت خلال ست دقائق. فلا دليل في الاتجاهين، وهذا بعينه
--    سببُ ترجيح قاعدةٍ نسبيةٍ للموعد على أي رقمٍ ثابت.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- (١) `accept_offer` — الجسم منقولٌ من الكتالوج الحيّ (‏D-58) وزِيد فيه حارسٌ
--     واحد بعد التعرّف على الهوية مباشرة. لا سطر آخر تغيّر.
-- ----------------------------------------------------------------------------

create or replace function public.accept_offer(p_offer_id uuid)
returns table (
  booking_id uuid, reference text, payout numeric, assigned_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_sub     uuid;
  v_status  text;
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

  -- 0052: 🔒 رؤيةُ رحلةٍ مُسنَدة ليست قبولَ عملٍ جديد. الموقوف يبقى يرى رحلاته
  -- ورصيده (قرار بدر) — ولا يكسب رحلةً بعرضٍ صدر قبل إيقافه. والشرط `approved`
  -- هو بعينه شرطُ `dispatch_pool` على الطرف الآخر، فمصدر الأهلية واحد.
  select s.status into v_status from public.subcontractors s where s.id = v_sub;
  if coalesce(v_status, '') <> 'approved' then
    raise exception 'حسابك ليس معتمداً الآن — لا يمكن قبول عروض جديدة (الحالة: «%»)',
      coalesce(v_status, '؟')
      using hint = 'partner-not-approved';
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
      -- 0033: الهامش الحقيقي **بعد طرح الخدمات الإضافية** — إيرادُنا عن شيء
      --       ننفّذه نحن ولا يراه المتعهد، فعدّه هامشاً يطلي صفقةً تحت
      --       الأرضية باللون الأخضر (نفس علّة سقف الموجة في 0032).
      'realMargin',       round(coalesce(v_b.total, 0)
                                - coalesce((select sum(be.line_total)
                                              from public.booking_extras be
                                             where be.booking_id = v_b.id), 0)
                                - v_offer.payout, 2),
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
$function$;

comment on function public.accept_offer(uuid) is
  '0052: يشترط أن يكون المتعهد approved — نفس شرط dispatch_pool. الموقوف يبقى يرى رحلاته المُسنَدة ورصيده (قرار بدر 2026-08-15) ولا يكسب عملاً جديداً.';


-- ----------------------------------------------------------------------------
-- (٢-أ) قراءةٌ آمنة لموعد الرحلة — الكنس يعمل بلا مراقب، ونصٌّ فاسدٌ في
--       `trip.pickupAt` كان سيُسقط الدورة كلها بخطأ تحويل
-- ----------------------------------------------------------------------------

create or replace function public.trip_pickup_at(p_trip jsonb)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $function$
begin
  return nullif(btrim(coalesce(p_trip ->> 'pickupAt', '')), '')::timestamptz;
exception
  when others then
    return null;
end;
$function$;

comment on function public.trip_pickup_at(jsonb) is
  'موعد الانطلاق من لقطة الرحلة، وnull إن غاب أو تعذّر تحويله. الكنس دورةٌ بلا مراقب فلا يجوز أن يُسقطها نصٌّ فاسد في صفٍّ واحد.';

-- ----------------------------------------------------------------------------
-- (٢-ب) 🔒 **تعريفٌ واحد** لموعد انتهاء حجز الطلب — يقرؤه الكنس وتعرضه الواجهة
-- ----------------------------------------------------------------------------

create or replace function public.booking_hold_until(
  p_created_at timestamptz,
  p_pickup_at  timestamptz
)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $function$
  select case
    when p_created_at is null then null
    -- بلا موعدٍ معروف: العمر وحده — نفس السلوك القائم قبل 0052 حرفياً
    when p_pickup_at is null then
      p_created_at + make_interval(mins => t.unpaid_timeout_minutes)
    -- ومع الموعد: الأبعد من (مهلة الدفع كاملة) و(اقترابُ الموعد بمقدارها)
    else greatest(
      p_created_at + make_interval(mins => t.unpaid_timeout_minutes),
      p_pickup_at  - make_interval(mins => t.unpaid_timeout_minutes)
    )
  end
  from public.trip_config() t;
$function$;

comment on function public.booking_hold_until(timestamptz, timestamptz) is
  'اللحظة التي يصير عندها الحجز غير المدفوع قابلاً للكنس = الأبعد من (created_at + مهلة الدفع) و(pickupAt − مهلة الدفع). مصدرٌ واحد يقرؤه cancel_stale_bookings وتعرضه «حجزك محفوظ حتى…».';

-- ----------------------------------------------------------------------------
-- (٢-ج) الكنس — الجسم منقولٌ من الكتالوج الحيّ (‏D-58). والتغيير **سطرُ شرطٍ
--       واحد**؛ وكل ما أُصلح في `0028` باقٍ بنصّه ويُفحص أدناه:
--         • أرضية نافذة السماح المستقلة (ساعة على الأقل)
--         • واستثناء الحجز ذي نشاط الإيصال الحديث
-- ----------------------------------------------------------------------------

create or replace function public.cancel_stale_bookings(p_limit integer default 200)
returns table (scanned integer, cancelled integer, failed integer)
language plpgsql
security definer
set search_path = ''
as $function$
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
      -- 0052: القرب من الموعد لا عمرُ الحجز وحده. `booking_hold_until` تجمع
      -- الشرطين في تعريفٍ واحد تعرضه الواجهة نفسها (م‑٥) — وحجزُ الشهر القادم
      -- لم يعد يُلغى بساعة حجزِ الغد.
      and public.booking_hold_until(b.created_at, public.trip_pickup_at(b.trip)) <= now()
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
    order by public.booking_hold_until(b.created_at, public.trip_pickup_at(b.trip)) asc,
             b.created_at asc
    limit greatest(coalesce(p_limit, 200), 1)
    for update skip locked
  loop
    v_scanned := v_scanned + 1;

    begin
      perform set_config(
        'tours.booking_note',
        'إلغاء تلقائي — مضت مهلة الدفع (' || v_timeout
          || ' دقيقة) واقترب موعد الرحلة',
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
$function$;

comment on function public.cancel_stale_bookings(integer) is
  '0052: الكنس يشترط مضيَّ مهلة الدفع **واقترابَ الموعد** معاً عبر booking_hold_until — لا عمرَ الحجز وحده. وإصلاحا 0028 (أرضية السماح واستثناء نشاط الإيصال) باقيان.';


-- ----------------------------------------------------------------------------
-- (٣) المنح
-- ----------------------------------------------------------------------------

revoke all on function public.trip_pickup_at(jsonb) from public, anon;
grant execute on function public.trip_pickup_at(jsonb) to authenticated, service_role;

-- `booking_hold_until` تأخذ طابعين زمنيين وترجع طابعاً: لا تلمس صفاً ولا تكشف
-- إلا مهلةَ الدفع — وهي **نفسها ما تَعِد به الشاشةُ العميلَ**. وصفحة
-- `/booking/[token]` عامةٌ بلا تسجيل دخول، فبلا `anon` لا وعدَ يُعرض.
revoke all on function public.booking_hold_until(timestamptz, timestamptz) from public;
grant execute on function public.booking_hold_until(timestamptz, timestamptz)
  to anon, authenticated, service_role;

revoke all on function public.accept_offer(uuid) from public, anon;
grant execute on function public.accept_offer(uuid) to authenticated, service_role;

revoke all on function public.cancel_stale_bookings(integer) from public, anon;
grant execute on function public.cancel_stale_bookings(integer) to authenticated, service_role;


-- ============================================================================
-- الفحص الذاتي — مسبارٌ للمسبار، وفيكسترةٌ داخل معاملةٍ فرعية تُرجَع، ولكل
-- تأكيدٍ طفرةٌ تُبنى ويُثبَت أنها ترفع (أو تمرّ حين يجب أن تمرّ).
-- ============================================================================

do $$
declare
  v_sub    uuid := '5ea11ed0-0000-4000-8000-000000005201';
  v_usr    uuid := '00000000-0000-4000-8000-000000005201';
  v_cls    uuid := 'c0000000-0000-4000-8000-000000005201';
  v_slug   constant text := 'gtest-0052';
  v_off    uuid;
  v_bk     record;
  v_id     uuid;
  v_far    uuid;
  v_near   uuid;
  v_fresh  uuid;
  v_timeout integer;
  v_state  text;
  v_n      integer;
  v_hold   timestamptz;
begin
  -- ══ (٠) مسبار المسبار ═══════════════════════════════════════════════════
  if to_regprocedure('public.booking_hold_until(timestamptz,timestamptz)') is null
     or to_regprocedure('public.trip_pickup_at(jsonb)') is null then
    raise exception '0052: الدوال لم تُنشأ — الفحص لا يفحص شيئاً';
  end if;

  begin
    -- ══ الفيكسترة ══════════════════════════════════════════════════════════
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                            created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
    values (v_usr, '00000000-0000-0000-0000-000000000000', 'authenticated',
            'authenticated', 'guards0052@example.invalid', 'x', now(), now(),
            '{}'::jsonb, '{"full_name": "GUARDS_0052 متعهد"}'::jsonb);
    if not exists (select 1 from public.profiles p where p.id = v_usr) then
      raise exception '0052: handle_new_user لم تُنشئ الملف — انتحال المتعهد مستحيل';
    end if;

    insert into public.subcontractors (id, profile_id, company_name, contact_name, phone, status)
    values (v_sub, v_usr, 'GUARDS_0052 متعهد', 'G', '01000000000', 'approved');

    insert into public.vehicle_classes (id, slug, title, capacity, luggage_capacity, active, sort)
    values (v_cls, v_slug, 'GUARDS_0052 فئة', 1, 4, true, 9052);
    insert into public.tariffs (class_id, per_km, base_fee, min_price,
                                waiting_hour_price, round_trip_factor)
    values (v_cls, 20, 1000, 0, 0, 1.8);

    select * into v_bk from public.create_booking(
      jsonb_build_object('label', 'G مبدأ', 'lat', 25.0, 'lng', 27.5),
      jsonb_build_object('label', 'G منتهى', 'lat', 24.5, 'lng', 28.2),
      1, false, 0, 100, 90, 'estimate', v_slug, 'full',
      'GUARDS_0052 عميل', '01000005201', null, now() + interval '3 days',
      'GUARDS_0052_FIXTURE', null, null, 0, null, 0);
    v_id := v_bk.id;
    update public.bookings set status = 'under_review' where id = v_id;
    update public.bookings set status = 'confirmed'    where id = v_id;

    insert into public.dispatches (booking_id, status, round, last_broadcast_at)
    values (v_id, 'broadcasting', 1, now());

    insert into public.trip_offers (booking_id, subcontractor_id, round, payout,
                                    status, expires_at)
    values (v_id, v_sub, 1, 700, 'pending', now() + interval '30 minutes')
    returning id into v_off;

    perform set_config('request.jwt.claims',
      json_build_object('sub', v_usr, 'role', 'authenticated')::text, true);
    if public.current_subcontractor_id() is distinct from v_sub then
      raise exception '0052: الانتحال لم ينجح — current_subcontractor_id() ترجع %',
        coalesce(public.current_subcontractor_id()::text, '(null)');
    end if;

    -- ══ (أ) الموقوف لا يقبل — والطفرة: نفس العرض بعد الاعتماد **يُقبل** ══════
    -- (تبديل الحالة يقع بلا هوية — `subcontractors_guard_self` تمنع المتعهد من
    --  تغيير حالة نفسه، وهو حارسٌ قائم لا نلمسه)
    perform set_config('request.jwt.claims', '', true);
    update public.subcontractors set status = 'suspended' where id = v_sub;
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_usr, 'role', 'authenticated')::text, true);

    v_state := null;
    begin
      perform * from public.accept_offer(v_off);
      v_state := '(قُبل)';
    exception when others then
      get stacked diagnostics v_state = message_text;
    end;
    if v_state = '(قُبل)' then
      raise exception '0052 (أ-١): 🔴 متعهدٌ موقوف قبل عرضاً فكسب رحلةً وهو موقوف';
    end if;
    if v_state not like '%معتمداً%' then
      raise exception '0052 (أ-١): الرفض جاء برسالة «%» — ليست رسالة الحارس، فالتأكيد يمسك عطباً آخر', v_state;
    end if;
    -- ولا أثر: العرض ما زال معلّقاً والحجز ما زال مؤكَّداً
    if (select o.status from public.trip_offers o where o.id = v_off) <> 'pending'
       or (select b.status from public.bookings b where b.id = v_id) <> 'confirmed' then
      raise exception '0052 (أ-١): الرفض ترك أثراً — العرض أو الحجز تغيّر';
    end if;

    -- (أ-٢) و`pending` كذلك: من لم يُعتمد قط لا يقبل عملاً
    perform set_config('request.jwt.claims', '', true);
    update public.subcontractors set status = 'pending' where id = v_sub;
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_usr, 'role', 'authenticated')::text, true);
    v_state := null;
    begin
      perform * from public.accept_offer(v_off);
      v_state := '(قُبل)';
    exception when others then
      get stacked diagnostics v_state = message_text;
    end;
    if v_state = '(قُبل)' then
      raise exception '0052 (أ-٢): 🔴 متعهدٌ لم يُعتمد بعد قبل عرضاً';
    end if;

    -- (أ-٣) 🔒 الطفرة المعاكسة: بالاعتماد يمرّ النداء نفسه — وإلا كان (أ-١)
    --       يمسك «القبول لا يعمل أصلاً» لا «الحارس يعمل»
    perform set_config('request.jwt.claims', '', true);
    update public.subcontractors set status = 'approved' where id = v_sub;
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_usr, 'role', 'authenticated')::text, true);
    perform * from public.accept_offer(v_off);
    if (select b.status from public.bookings b where b.id = v_id) <> 'assigned' then
      raise exception '0052 (أ-٣): المعتمَد لم يُسنَد إليه — الحارس يمنع الجميع';
    end if;

    perform set_config('request.jwt.claims', '', true);

    -- ══ (ب) الكنس: القرب من الموعد لا عمرُ الحجز ═══════════════════════════
    update public.trip_settings set unpaid_cancel_enabled = true where id;
    select t.unpaid_timeout_minutes into v_timeout from public.trip_config() t;
    if coalesce(v_timeout, 0) <= 0 then
      raise exception '0052 (ب): مهلة الدفع «%» غير موجبة — القياس بلا معنى', v_timeout;
    end if;

    -- ثلاثة حجوزات، والفارق بينها **الموعد وحده أو العمر وحده**
    select * into v_bk from public.create_booking(
      jsonb_build_object('label', 'G بعيد', 'lat', 25.0, 'lng', 27.5),
      jsonb_build_object('label', 'G منتهى', 'lat', 24.5, 'lng', 28.2),
      1, false, 0, 100, 90, 'estimate', v_slug, 'full',
      'GUARDS_0052 بعيد', '01000005202', null, now() + interval '30 days',
      'GUARDS_0052_FIXTURE', null, null, 0, null, 0);
    v_far := v_bk.id;

    select * into v_bk from public.create_booking(
      jsonb_build_object('label', 'G قريب', 'lat', 25.0, 'lng', 27.5),
      jsonb_build_object('label', 'G منتهى', 'lat', 24.5, 'lng', 28.2),
      1, false, 0, 100, 90, 'estimate', v_slug, 'full',
      'GUARDS_0052 قريب', '01000005203', null, now() + interval '30 minutes',
      'GUARDS_0052_FIXTURE', null, null, 0, null, 0);
    v_near := v_bk.id;

    select * into v_bk from public.create_booking(
      jsonb_build_object('label', 'G طازج', 'lat', 25.0, 'lng', 27.5),
      jsonb_build_object('label', 'G منتهى', 'lat', 24.5, 'lng', 28.2),
      1, false, 0, 100, 90, 'estimate', v_slug, 'full',
      'GUARDS_0052 طازج', '01000005204', null, now() + interval '30 minutes',
      'GUARDS_0052_FIXTURE', null, null, 0, null, 0);
    v_fresh := v_bk.id;

    -- البعيد والقريب **قديمان بنفس المقدار**: فارقهما الموعد لا العمر
    update public.bookings
       set created_at = now() - make_interval(mins => v_timeout) - interval '1 hour'
     where id in (v_far, v_near);

    -- 🔒 مسبار المسبار: الشرط **القديم** ينطبق على البعيد — أي أنه كان يُكنَس
    if not (select b.created_at < now() - make_interval(mins => v_timeout)
              from public.bookings b where b.id = v_far) then
      raise exception '0052 (ب-٠): الحجز البعيد ليس متقادماً بالقاعدة القديمة — الفحص لا يقيس التغيير';
    end if;

    select public.booking_hold_until(b.created_at, public.trip_pickup_at(b.trip))
      into v_hold from public.bookings b where b.id = v_far;
    if v_hold <= now() then
      raise exception '0052 (ب-٠): موعد كنس الحجز البعيد % ماضٍ — الصيغة لا تحمي المبكّر', v_hold;
    end if;

    perform * from public.cancel_stale_bookings(500);

    if (select b.status from public.bookings b where b.id = v_near) <> 'cancelled' then
      raise exception '0052 (ب-١): الحجز القريب لم يُكنَس — الكنس لا يعمل، وكل ما بعده عمى';
    end if;
    if (select b.status from public.bookings b where b.id = v_far) <> 'pending_payment' then
      raise exception '0052 (ب-٢): 🔴 حجزٌ لرحلةٍ بعد شهر أُلغي بساعة حجزِ الغد — العطب قائم';
    end if;
    if (select b.status from public.bookings b where b.id = v_fresh) <> 'pending_payment' then
      raise exception '0052 (ب-٣): 🔴 حجزٌ صاحبُه ما زال داخل مهلته المعلنة أُلغي — الوعد مكسور';
    end if;

    -- (ب-٤) وبلا موعدٍ في اللقطة يعود السلوك إلى العمر وحده — بلا تغيير
    update public.bookings set trip = trip - 'pickupAt' where id = v_far;
    if public.trip_pickup_at((select b.trip from public.bookings b where b.id = v_far))
       is not null then
      raise exception '0052 (ب-٤): إزالة الموعد لم تُزله — الطفرة لم تُبنَ';
    end if;
    perform * from public.cancel_stale_bookings(500);
    if (select b.status from public.bookings b where b.id = v_far) <> 'cancelled' then
      raise exception '0052 (ب-٤): حجزٌ بلا موعدٍ ومتقادم لم يُكنَس — السلوك القديم انكسر';
    end if;

    -- ══ (ج) وإصلاحا 0028 باقيان — نُبنى لهما شاهدان لا يُقرأ نصُّهما ═════════
    --    (ج-١) نشاط إيصالٍ حديث يعصم من الكنس
    select * into v_bk from public.create_booking(
      jsonb_build_object('label', 'G إيصال', 'lat', 25.0, 'lng', 27.5),
      jsonb_build_object('label', 'G منتهى', 'lat', 24.5, 'lng', 28.2),
      1, false, 0, 100, 90, 'estimate', v_slug, 'full',
      'GUARDS_0052 إيصال', '01000005205', null, now() + interval '30 minutes',
      'GUARDS_0052_FIXTURE', null, null, 0, null, 0);
    v_id := v_bk.id;
    update public.bookings
       set created_at = now() - make_interval(mins => v_timeout) - interval '1 hour'
     where id = v_id;
    insert into public.payments (booking_id, amount, status, created_at)
    values (v_id, 10, 'rejected', now() - interval '5 minutes');

    perform * from public.cancel_stale_bookings(500);
    if (select b.status from public.bookings b where b.id = v_id) <> 'pending_payment' then
      raise exception '0052 (ج-١): 🔴 حجزٌ عليه نشاط إيصالٍ حديث أُلغي — إصلاح 0028 انحدر';
    end if;

    --    (ج-٢) وأرضية نافذة السماح: مهلةٌ صغيرة لا تحكم على جلسةٍ حيّة بالبيات
    update public.trip_settings set unpaid_timeout_minutes = 15 where id;
    select * into v_bk from public.create_booking(
      jsonb_build_object('label', 'G جلسة', 'lat', 25.0, 'lng', 27.5),
      jsonb_build_object('label', 'G منتهى', 'lat', 24.5, 'lng', 28.2),
      1, false, 0, 100, 90, 'estimate', v_slug, 'full',
      'GUARDS_0052 جلسة', '01000005206', null, now() + interval '10 minutes',
      'GUARDS_0052_FIXTURE', null, null, 0, null, 0);
    v_id := v_bk.id;
    update public.bookings set created_at = now() - interval '40 minutes' where id = v_id;
    insert into public.payment_intents (booking_id, provider, status, amount_minor, created_at)
    values (v_id, 'test', 'pending', 1000, now() - interval '35 minutes');

    perform * from public.cancel_stale_bookings(500);
    if (select b.status from public.bookings b where b.id = v_id) <> 'pending_payment' then
      raise exception '0052 (ج-٢): 🔴 جلسةُ بوابةٍ عمرها ٣٥ دقيقة أُلغيت بمهلة ١٥ — أرضية 0028 انحدرت';
    end if;
    -- والطفرة: جلسةٌ أقدم من الأرضية (ساعة) لا تعصم
    update public.payment_intents set created_at = now() - interval '70 minutes'
     where booking_id = v_id;
    perform * from public.cancel_stale_bookings(500);
    if (select b.status from public.bookings b where b.id = v_id) <> 'cancelled' then
      raise exception '0052 (ج-٢): جلسةٌ عمرها ٧٠ دقيقة ما زالت تعصم — الأرضية صارت سقفاً بلا حد';
    end if;

    raise exception 'GUARDS_0052_ROLLBACK';
  exception
    when others then
      execute 'reset role';
      perform set_config('request.jwt.claims', '', true);
      if sqlerrm <> 'GUARDS_0052_ROLLBACK' then raise; end if;
  end;

  raise notice '✔ 0052: الموقوف وغيرُ المعتمَد لا يقبلان عرضاً والمعتمَد يقبل · وحجزُ الشهر القادم لا يُكنَس بساعة حجزِ الغد · والمهلة المعلنة تُحترم · وإصلاحا 0028 باقيان — وصفر أثر';
end;
$$;
