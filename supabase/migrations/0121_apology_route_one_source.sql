-- ============================================================================
-- 0121 — قاعدةُ تفرّع الاعتذار: **مصدرٌ واحد** تقرؤه الدالةُ والشاشةُ معاً
--
-- ولماذا ملفٌّ ثانٍ ولا تعديلٌ في `0119`؟ **اتفاقية ٦**: لا يُعدَّل ملفٌ مطبَّق
-- أبداً — التصحيح ترحيلٌ جديد. وهو النمط نفسه في `0029⇒0030` و`0031⇒0032`.
--
-- ══════════════════════════════════════════════════════════════════════════
--  ما الذي كشفه الاختبار
-- ══════════════════════════════════════════════════════════════════════════
--
-- `withdraw_from_trip` كانت تحمل قاعدة التفرّع **داخل جسمها**، فترتّب عليها أمران:
--
--   (١) **لا تُقاس وحدها.** ناتجُها المُعاد يخرج **بعد** محاولة البث، والبثُّ
--       يرجع صفراً حين لا تغطية — فينقلب `rebroadcast` إلى `manual` بحقّ،
--       ويصير القرارُ الأصلي غير مرئي. أي أن فرعاً كاملاً من قرار المالك
--       **لا يستطيع اختبارٌ أن يشهد عليه**.
--   (٢) 🔴 **وأخطر**: شاشةُ الاعتذار في البورتال يجب أن تقول للشريك **قبل**
--       أن يضغط: «الوقت متّسع فتُبثّ فوراً» أو «الموعد قريب فتذهب إلى إسنادٍ
--       يدوي». وبلا دالةٍ يقرؤها الطرفان صارت الشاشةُ تُعيد كتابة الشرط —
--       **رقمان لقاعدةٍ واحدة**، وهو النمط ٨ في `LESSONS` حرفياً.
--
-- ⇒ القاعدة تُستخرج إلى `apology_route(hours)`، وتُفوَّض إليها `withdraw_from_trip`
--   (تفويضٌ لا استنساخ — القاعدة الذهبية ١٢). وحدُّ تغيير السياسة بعدها سطرٌ واحد.
-- ============================================================================

create or replace function public.apology_route(p_hours numeric)
returns text
language sql
stable
security definer
set search_path = ''
as $function$
  select case
           -- بلا موعدٍ مقروء: **يدويٌّ بتنبيه**. الاتجاه الآمن أن يراها إنسان،
           -- لا أن تُبثّ رحلةٌ قد يكون موعدها بعد ساعة.
           when p_hours is null then 'manual'
           when p_hours >= (select c.apology_manual_hours from public.trip_closure_config() c)
             then 'rebroadcast'
           else 'manual'
         end;
$function$;

comment on function public.apology_route(numeric) is
  'وجهةُ الرحلة بعد اعتذار المتعهد بحسب الساعات المتبقية والعتبة من اللوحة. مصدرٌ واحد تقرؤه withdraw_from_trip وشاشةُ البورتال — فلا رقمان لقاعدةٍ واحدة.';

-- والجسم منقولٌ من `0119` بتغييرٍ واحد: السطران يصيران نداءً.
create or replace function public.withdraw_from_trip(
  p_booking_id  uuid,
  p_reason_slug text,
  p_note        text default null
)
returns table(
  booking_id      uuid,
  routed          text,
  hours_to_pickup numeric,
  next_round      integer,
  offers          integer,
  deduct_amount   numeric,
  deduct_applied  boolean
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_sub    uuid;
  v_d      record;
  v_b      record;
  v_r      record;
  v_cfg    record;
  v_dcfg   record;
  v_pickup timestamptz;
  v_hours  numeric;
  v_routed text;
  v_amount numeric;
  v_made   integer := 0;
  v_next   integer;
  v_note   text;
  v_now    timestamptz := now();
begin
  v_sub := public.current_subcontractor_id();
  if v_sub is null then
    raise exception 'الاعتذار عن رحلة متاح لحساب متعهد فقط' using hint = 'forbidden';
  end if;

  -- ترتيب الأقفال نفسه المكتوب في `accept_offer`: dispatches ← trip_offers ← bookings
  select d.* into v_d from public.dispatches d where d.booking_id = p_booking_id for update;
  if not found or v_d.assigned_subcontractor_id is distinct from v_sub then
    raise exception 'هذه الرحلة ليست مُسنَدة إليك' using hint = 'forbidden';
  end if;

  select b.* into v_b from public.bookings b where b.id = p_booking_id for update;
  if not found then
    raise exception 'الحجز غير موجود' using hint = 'booking-not-found';
  end if;
  if v_b.status <> 'assigned' then
    raise exception 'حالة هذه الرحلة «%» لا تقبل الاعتذار', v_b.status
      using hint = 'invalid-status';
  end if;
  if exists (
    select 1 from public.trip_completion_requests r
    where r.booking_id = p_booking_id and r.status = 'pending'
  ) then
    raise exception 'لك طلب إتمامٍ قائم على هذه الرحلة — لا يُعتذر عنها وهو معلّق'
      using hint = 'completion-pending';
  end if;

  -- السبب: من الكتالوج، مفعَّلاً، **بنطاق الاعتذار**، ومُبادِرُه يسمح للمتعهد
  select r.* into v_r
  from public.failure_reasons r
  where r.slug = lower(btrim(coalesce(p_reason_slug, '')));
  if not found then
    raise exception 'سبب الاعتذار «%» غير موجود', coalesce(p_reason_slug, '')
      using hint = 'reason-not-found';
  end if;
  if not v_r.active then
    raise exception 'سبب الاعتذار «%» معطَّل — اختر سبباً مفعَّلاً', v_r.label
      using hint = 'reason-inactive';
  end if;
  if v_r.applies_to not in ('apology', 'both') then
    raise exception 'السبب «%» ليس من أسباب الاعتذار', v_r.label
      using hint = 'reason-out-of-scope';
  end if;
  if v_r.initiator = 'platform' then
    raise exception 'السبب «%» تختاره الإدارة حين تسحب الإسناد، لا المتعهد', v_r.label
      using hint = 'reason-out-of-scope';
  end if;

  v_note := nullif(btrim(coalesce(p_note, '')), '');
  select * into v_cfg  from public.trip_closure_config();
  select * into v_dcfg from public.dispatch_config();

  -- ── الوجهة تتفرّع بالوقت المتبقي — 0121: بدالةٍ واحدة تقرؤها الشاشة أيضاً ──
  v_pickup := nullif(btrim(coalesce(v_b.trip ->> 'pickupAt', '')), '')::timestamptz;
  v_hours  := case
                when v_pickup is null then null
                else round(extract(epoch from (v_pickup - v_now)) / 3600.0, 2)
              end;
  v_routed := public.apology_route(v_hours);

  -- ── الخصم: **اقتراحٌ يُحسب ويُسقَّف ولا يُنفَّذ من هنا** (انظر ترويسة 0119) ──
  v_amount := case
                when v_r.default_action = 'deduct'
                  then least(
                         round(coalesce(v_r.default_deduct_amount, 0), 2),
                         round(coalesce(v_d.assigned_payout, 0), 2)
                       )
                else null
              end;
  if coalesce(v_amount, 0) <= 0 then
    v_amount := null;
  end if;

  -- ── (١) عرضُه المقبول يصير `rejected` ⇒ 🔴 يُستثنى من الموجة التالية ──────
  update public.trip_offers o
     set status       = 'rejected',
         responded_at = v_now,
         reason       = left('اعتذار بعد القبول — ' || v_r.label
                             || coalesce(' — ' || v_note, ''), 1000)
   where o.booking_id = p_booking_id
     and o.subcontractor_id = v_sub
     and o.status = 'accepted';

  -- ── (٢) إخلاء صفّ الدورة — والمُشغّل `clear_crew_on_reassign` يمسح الطاقم ──
  update public.dispatches d
     set status                    = 'queued',
         assigned_subcontractor_id = null,
         assigned_at               = null,
         assigned_payout           = null,
         manual_assign             = false
   where d.booking_id = p_booking_id;

  -- ── (٣) الحجز يعود مؤكَّداً — بعد الإخلاء كي يمرّ `guard_booking_unassign` ──
  perform set_config(
    'tours.booking_note',
    'اعتذار المتعهد بعد القبول — ' || v_r.label || coalesce(' — ' || v_note, ''),
    true
  );
  update public.bookings b set status = 'confirmed' where b.id = p_booking_id;

  -- ── (٤) الوجهة ────────────────────────────────────────────────────────────
  v_next := coalesce(v_d.round, 0) + 1;
  if v_routed = 'rebroadcast' and v_next <= v_dcfg.max_rounds then
    update public.trip_offers o
       set status = 'expired', responded_at = v_now
     where o.booking_id = p_booking_id and o.status = 'pending';
    v_made := public.dispatch_broadcast(p_booking_id, v_next);
    -- بثٌّ لم يجد أحداً: لا يُترك الحجز في «بثّ» بلا عرضٍ واحد
    if v_made = 0 then
      v_routed := 'manual';
      update public.dispatches d set status = 'manual' where d.booking_id = p_booking_id;
    end if;
  else
    v_routed := 'manual';
    v_next   := coalesce(v_d.round, 0);
    update public.dispatches d set status = 'manual' where d.booking_id = p_booking_id;
  end if;

  -- ── (٥) السجل ثم التنبيه ─────────────────────────────────────────────────
  insert into public.trip_withdrawals (
    booking_id, subcontractor_id, reason_id, reason_slug, reason_label,
    default_action, note, payout_snapshot, hours_to_pickup, routed,
    deduct_amount, deduct_applied, ledger_effect, withdrawn_at, created_by
  )
  values (
    p_booking_id, v_sub, v_r.id, v_r.slug, v_r.label,
    v_r.default_action, v_note, v_d.assigned_payout, v_hours, v_routed,
    v_amount, false, 'none', v_now, public.current_actor()
  );

  perform public.queue_notification(
    case when v_routed = 'manual' then 'trip_withdrawn_manual' else 'trip_withdrawn_rebroadcast' end,
    public.dispatch_trip_payload(p_booking_id, false) || jsonb_build_object(
      'subcontractorId', v_sub,
      'reasonSlug',      v_r.slug,
      'reasonLabel',     v_r.label,
      'note',            v_note,
      'hoursToPickup',   v_hours,
      'thresholdHours',  v_cfg.apology_manual_hours,
      'routed',          v_routed,
      'round',           v_next,
      'offers',          v_made,
      'payout',          v_d.assigned_payout,
      'deductProposed',  v_amount,
      'deductEnabled',   v_cfg.apology_deduction_enabled,
      'withdrawnAt',     v_now
    )
  );

  booking_id      := p_booking_id;
  routed          := v_routed;
  hours_to_pickup := v_hours;
  next_round      := v_next;
  offers          := v_made;
  deduct_amount   := v_amount;
  deduct_applied  := false;
  return next;
end;
$function$;

comment on function public.withdraw_from_trip(uuid, text, text) is
  '0121: قاعدة التفرّع صارت نداءً لـapology_route — مصدرٌ واحد تقرؤه الشاشة أيضاً. وما عداه كما في 0119.';

revoke all on function public.apology_route(numeric) from public, anon;
grant execute on function public.apology_route(numeric) to authenticated, service_role;

revoke all on function public.withdraw_from_trip(uuid, text, text) from public, anon;
grant execute on function public.withdraw_from_trip(uuid, text, text) to authenticated, service_role;
