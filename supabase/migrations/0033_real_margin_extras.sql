-- ============================================================================
-- 0033 — «الهامش الحقيقي» في إشعار الإسناد لا يعدّ الخدمات هامشاً
--
-- أصلحت 0032 سقفَ موجة البث ليطرح الخدمات الإضافية، وبقي **المقياس الذي يقرؤه
-- التشغيل** يعدّها: `accept_offer` و`manual_assign` تكتبان في حمولة الإشعار
--     realMargin = total − payout
-- و`total` صار يحمل الخدمات منذ 0031. فكرسيا أطفال بـ٤٠٠ يجعلان صفقةً هامشها
-- صفرٌ تبدو بهامش ٤٠٠ — والواجهة تلوّنها بمقارنتها بأرضية الهامش، فتُطلى صفقةٌ
-- تحت الأرضية باللون الأخضر.
--
-- وأخطر ما فيه أن `manual_assign` **بلا فحص سقف أصلاً**: حرّاسها الحالة والإيقاف
-- والمستحق غير السالب فقط — فهذا الرقم هو إشارة الهامش الوحيدة التي يراها
-- المشغّل هناك.
--
-- ⚠ الجسمان منقولان **من التعريف الحيّ في القاعدة** (`pg_get_functiondef`) لا
-- بنسخ يدوي: النسخ اليدوي من نسخة خطأ هو بعينه ما أعاد عيب 0013 الحرج في 0031.
-- الفرق عن المُنتَج الحيّ: تعليقان وطرحُ `booking_extras` في موضعين لا ثالث لهما.
-- ============================================================================

create or replace function public.accept_offer(p_offer_id uuid)
 RETURNS TABLE(booking_id uuid, reference text, payout numeric, assigned_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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


create or replace function public.manual_assign(p_booking_id uuid, p_subcontractor_id uuid, p_payout numeric, p_note text)
 RETURNS TABLE(booking uuid, partner uuid, payout_amount numeric, revoked_offers integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
      -- 0033: انظر التعليق نفسه في accept_offer — الخدمات ليست هامشاً.
      'realMargin',      round(coalesce(v_b.total, 0)
                               - coalesce((select sum(be.line_total)
                                             from public.booking_extras be
                                            where be.booking_id = v_b.id), 0)
                               - v_payout, 2),
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
$function$;


-- ----------------------------------------------------------------------------
-- فحص ذاتي — الطرح موجود في الدالتين، والمنح كما تركتها 0013/0014
-- ----------------------------------------------------------------------------
do $$
declare
  v_src text;
begin
  foreach v_src in array array[
    'public.accept_offer(uuid)',
    'public.manual_assign(uuid,uuid,numeric,text)'
  ] loop
    declare v_def text := pg_get_functiondef(to_regprocedure(v_src)::oid);
    begin
      if position('realMargin' in coalesce(v_def, '')) = 0 then
        raise exception '0033: مسبار مصدر % معطّل — لا تصدّق ما بعده', v_src;
      end if;
      if position('booking_extras' in v_def) = 0 then
        raise exception '0033: % ما زالت تعدّ الخدمات هامشاً', v_src;
      end if;
    end;
  end loop;

  raise notice '✔ 0033: الهامش الحقيقي في إشعار الإسناد يطرح الخدمات الإضافية';
end;
$$;
