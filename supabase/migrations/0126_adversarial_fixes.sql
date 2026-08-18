-- ============================================================================
-- 0126_adversarial_fixes.sql — ثلاثةُ عيوبٍ أمسكتها المراجعةُ العدائية على
--                              دفعة 0124/0125 **بعد** أن قالت تقاريرها إنها سليمة
--
-- كيف يُشغَّل: `pnpm db:migrate`
-- ومجموعاته: `pnpm db:test completion_apology` · `failed_trip` · `loyalty_terms`
--
-- ══════════════════════════════════════════════════════════════════════════
--  ماذا كان مكسوراً — وكلُّ عيبٍ أُعيد إنتاجه حيّاً داخل `BEGIN … ROLLBACK`
-- ══════════════════════════════════════════════════════════════════════════
--
-- (١) 🔴 **سقفُ الخصم لكل رحلة كان مثقوباً من مسارٍ ثانٍ.**
--     0124 سقّفت `apply_withdrawal_deduction` بـ`trip_deduction_room`، ولم
--     تسأل `mark_booking_failed` عنها — وهي تسقّف بـ`dispatches.assigned_payout`
--     وحده. المقيس حيّاً: رحلةٌ مستحقُّها 1500 ⇒ اعتذارٌ خُصم عنه 1500 ⇒ إسنادٌ
--     جديد ⇒ `mark_booking_failed(deduct 1500)` **قُبلت** ⇒ **3000 = ٢٫٠٠×
--     مستحق الرحلة**. والبند ٨ يسقّف «عن أي **رحلة**» لا عن كل واقعة.
--     ⚠ والعقدُ كان نصفَ مكتوب: `trip_deduction_room.used` تجمع
--       `booking_failures.deduct_amount` سلفاً — أي أن الطرف الآخر كان يتوقّع
--       هذا المستهلك، وهو وحده لم يسأل (القاعدة الذهبية ١٢: فوِّض ولا تستنسخ).
--
-- (٢) 🔴 **السقفُ نفسه بلا قفلٍ يُسلسله.** `apply_withdrawal_deduction` تقفل
--     صفَّ الاعتذار وحده، و`trip_deduction_room` تجمع صفوفاً كثيرة. فتنفيذان
--     متزامنان على **اعتذارين من الرحلة نفسها** يقرأ كلاهما «متبقٍّ كامل».
--     المقيس بوصلتين متزامنتين على القاعدة الحيّة (قراءةٌ محضة، `ROLLBACK`):
--     قفلان على **نفس** الصفّ ⇒ الثاني يُحجب (‏`55P03`)؛ وعلى صفّين
--     **متمايزين** ⇒ الثاني يمرّ في **77ms**. فالسقف كان يُقاس ولا يُحرَس.
--
-- (٣) 🔴 **بند الولاء المنشور مجمَّد — يَعِد برقمٍ لا ينفّذه النظام.**
--     0125 ولّدت نصّ البند ١١ من `loyalty_terms_disclosure()` **مرةً واحدة**
--     وكتبته في `sections.content` نصّاً ساكناً. المقيس داخل معاملةٍ مُرجَعة:
--     `expire_months 3 ⇒ 9` و`max_redeem_percent 10 ⇒ 25` و`enabled ⇒ false`
--     ⇒ **المنشور ما زال يقول «٣ أشهر» و«١٠٪» و`visible = true`**.
--     وهذا هو النمط ٢ في `LESSONS.md` بعينه، على صفحة **شروطٍ تعاقدية**.
--
-- ══════════════════════════════════════════════════════════════════════════
--  وما لم يُلمس هنا — عمداً
-- ══════════════════════════════════════════════════════════════════════════
--   • دلالةُ «يُرفض ولا يُقصّ» في `mark_booking_failed` تبقى كما هي: الرفضُ
--     يُرى، والقصُّ الصامت يترك المدير يظن أنه خصم ما كتب (ترويسة 0119).
--     و`apply_withdrawal_deduction` تبقى تقصّ **غير صامتة** كما أمر بريف 0124.
--   • تجميعُ السقف على `booking_id` وحده (لا على المتعهد) قرارُ منتجٍ لبدر —
--     يبقى كما قرّرته 0124، وهذا الملف يوحّد المستهلكَين عليه لا يغيّره.
--   • لا صفَّ ترجمةٍ يُنشر: المزامنة تكتب في المسوّدة `draft` وحدها.
--
-- المرجع: 0119 · 0121 · 0124 · 0125 · القرار D-60 · البند ٨ من اتفاقية الشراكة
-- ============================================================================


-- ----------------------------------------------------------------------------
-- (١) `mark_booking_failed` تسأل `trip_deduction_room` — سقفٌ واحدٌ للرحلة
--
--     النصُّ أدناه مأخوذٌ من `pg_get_functiondef` على القاعدة الحيّة (‏D-58)،
--     والمتغيّر فيه كتلةُ السقف وحدها وإعلانُ `v_room`.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_booking_failed(p_booking_id uuid, p_reason_slug text, p_action text DEFAULT NULL::text, p_deduct_amount numeric DEFAULT NULL::numeric, p_note text DEFAULT NULL::text)
 RETURNS TABLE(booking_id uuid, reference text, reason_slug text, action_taken text, deduct_amount numeric, ledger_effect text, points_reversed integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_b      record;
  v_r      record;
  v_sub    uuid;
  v_payout numeric;
  v_action text;
  v_amount numeric;
  v_cap    numeric;
  v_room   record;   -- 0126: متبقّي الرحلة
  v_note   text;
  v_effect text := 'none';
  v_earned uuid;
  v_pts    integer := 0;
  v_completed timestamptz;
  v_now    timestamptz := now();
begin
  -- الحارس المالي نفسه الذي يحرس `record_partner_adjustment` — فلا يبلغ هذا
  -- المدخلَ من لا يستطيع تنفيذ أثره
  if not public.finance_admin_allowed() then
    raise exception 'تعليم الرحلة فاشلة متاح للإدارة وحدها' using hint = 'forbidden';
  end if;

  select b.* into v_b from public.bookings b where b.id = p_booking_id for update;
  if not found then
    raise exception 'الحجز غير موجود' using hint = 'booking-not-found';
  end if;

  if v_b.status not in ('assigned', 'completed') then
    raise exception
      'حالة الحجز «%» لا تُعلَّم فاشلة — الفشل من «مُسندة» أو «مكتملة» وحدهما',
      v_b.status
      using hint = 'invalid-status';
  end if;

  -- نافذة إعادة التصنيف تُفحص **مبكراً**: الحارس يفرضها على أي حال، لكن تركها
  -- إلى آخر سطر يعني أن نداءً محكومَ الرفض يمرّ على التحقق كله ثم يُرجَع. ونفس
  -- المصدرين حرفياً (`booking_completed_at` + `failed_reclass_window`) فلا رقمان.
  if v_b.status = 'completed' then
    v_completed := public.booking_completed_at(p_booking_id);
    if v_completed is null then
      raise exception
        'تعذّر إثبات لحظة اكتمال الحجز «%» من سجل الأحداث — إعادة التصنيف مرفوضة',
        coalesce(v_b.reference, p_booking_id::text)
        using hint = 'completion-time-unknown';
    end if;
    if now() > v_completed + public.failed_reclass_window() then
      raise exception
        'انقضت نافذة إعادة تصنيف الحجز «%» — اكتمل في % والنافذة %',
        coalesce(v_b.reference, p_booking_id::text), v_completed, public.failed_reclass_window()
        using hint = 'reclass-window-closed';
    end if;
  end if;

  -- (أ) السبب من الكتالوج. والمعطَّل مرجعٌ لصفوفٍ قديمة **ولا يُختار من جديد**.
  select r.* into v_r
  from public.failure_reasons r
  where r.slug = lower(btrim(coalesce(p_reason_slug, '')));
  if not found then
    raise exception 'سبب الفشل «%» غير موجود في الكتالوج', coalesce(p_reason_slug, '')
      using hint = 'reason-not-found';
  end if;
  if not v_r.active then
    raise exception 'سبب الفشل «%» معطَّل — اختر سبباً مفعَّلاً', v_r.label
      using hint = 'reason-inactive';
  end if;
  -- 0119 (١): نطاقُ السبب — كتالوجٌ واحد بنطاقٍ يعني أن النطاق يُفرض هنا
  if v_r.applies_to not in ('failure', 'both') then
    raise exception
      'السبب «%» مخصَّصٌ للاعتذار عن رحلةٍ مُسنَدة لا لتعليمها فاشلة', v_r.label
      using hint = 'reason-out-of-scope';
  end if;

  -- (ب) الإجراء: ما اختاره المدير، وإلا فاقتراح الكتالوج
  v_action := coalesce(
    lower(nullif(btrim(coalesce(p_action, '')), '')),
    v_r.default_action
  );
  if v_action not in ('none', 'pay', 'deduct') then
    raise exception 'الإجراء المالي «%» غير معروف — none أو pay أو deduct', v_action
      using hint = 'invalid-action';
  end if;

  v_note := nullif(btrim(coalesce(p_note, '')), '');
  if v_action is distinct from v_r.default_action and v_note is null then
    raise exception
      'تجاوز الإجراء الافتراضي «%» إلى «%» يستلزم مبرراً مكتوباً',
      v_r.default_action, v_action
      using hint = 'override-note-required';
  end if;

  -- (ج) المبلغ حكرٌ على الخصم
  --     0119 (٢): وحين لا يرسل المدير رقماً يسقط على اقتراح الكتالوج — وهو ما
  --     يجعل «مبلغٌ افتراضي لكل سبب» قراراً نافذاً لا حقلاً للعرض.
  if v_action = 'deduct' then
    v_amount := round(coalesce(p_deduct_amount, v_r.default_deduct_amount, 0), 2);
    if v_amount <= 0 then
      raise exception 'الخصم يستلزم مبلغاً موجباً' using hint = 'deduct-amount-required';
    end if;
  elsif coalesce(p_deduct_amount, 0) <> 0 then
    raise exception 'مبلغ الخصم لا معنى له مع الإجراء «%»', v_action
      using hint = 'invalid-input';
  end if;

  -- (د) المنفّذ من `dispatches` لا من `bookings.subcontractor_id` — ذاك لقطةُ
  --     من سُعِّر على أساسه، وهذا من نفّذ فعلاً (نفس تمييز `accept_offer`).
  select d.assigned_subcontractor_id, d.assigned_payout
    into v_sub, v_payout
  from public.dispatches d
  where d.booking_id = p_booking_id;

  if v_action in ('pay', 'deduct') and v_sub is null then
    raise exception
      'لا متعهد مُسنَد لهذا الحجز — «%» بلا طرفٍ يُدفع له أو يُخصم منه', v_action
      using hint = 'no-partner';
  end if;

  -- 0119 (٣)(٤): 🔴 **السقف** — قرار المالك: لا رصيدَ سالب ولا تحصيلَ ديون.
  --   والحدّ مستحقُّ تلك الرحلة نفسها لا رقمٌ عام، فيُقرأ بعد سطر (د) لا قبله.
  --   ويُرفض ولا يُقصّ: القصُّ الصامت يترك المدير يظن أنه خصم ما كتب.
  --
  -- 0126 (١): 🔴 وسقفٌ ثانٍ كان غائباً — **متبقّي الرحلة** لا مستحقُّها وحده.
  --   المقيس قبل هذا الإصلاح، حيّاً وداخل معاملةٍ مُرجَعة: اعتذارٌ خُصم عنه
  --   كاملُ المستحق (1500) ⇒ إسنادٌ جديد بنفس المستحق ⇒ `mark_booking_failed`
  --   بخصم 1500 **قُبلت** ⇒ مجموعُ ما خُصم عن رحلةٍ مستحقُّها 1500 صار 3000،
  --   أي **٢٫٠٠×**. والبند ٨ يسقّف «عن أي **رحلة**» لا عن كل واقعةٍ على حدة.
  --   و`trip_deduction_room` كانت تجمع `booking_failures` في المخصوم سلفاً —
  --   أي أن نصفَ العقد كان مكتوباً، وهذا المستهلكُ وحده لم يسأله (القاعدة ١٢).
  if v_action = 'deduct' then
    v_cap := round(coalesce(v_payout, 0), 2);
    if v_cap <= 0 then
      raise exception
        'لا مستحق مسجَّل لهذه الرحلة — فلا سقف يُخصم في حدوده'
        using hint = 'deduct-no-cap';
    end if;

    select * into v_room from public.trip_deduction_room(p_booking_id);
    if coalesce(v_room.room, 0) <= 0 then
      raise exception
        'استُنفد سقفُ الخصم عن هذه الرحلة: مستحقُّها % وخُصم عنها % — فلا متبقّى. والسقف قرار مالك: لا يصير المتعهد مديناً بمالٍ لم يقبضه',
        v_room.trip_due, v_room.deducted
        using hint = 'deduct-cap-exhausted';
    end if;
    v_cap := least(v_cap, round(v_room.room, 2));

    if v_amount > v_cap then
      raise exception
        'الخصم (%) يتجاوز المتبقّي من مستحق هذه الرحلة (%) — مستحقُّها % وخُصم عنها سلفاً %. والسقف قرار مالك: لا يصير المتعهد مديناً بمالٍ لم يقبضه',
        v_amount, v_cap, v_room.trip_due, v_room.deducted
        using hint = 'deduct-over-cap';
    end if;
  end if;

  -- (هـ) الأثر المالي — على مسار المال القائم وحده (انظر ترويسة `0051`).
  if v_b.status = 'completed' then
    if v_action = 'pay' then
      v_effect := 'payout-kept';
    else
      select e.id into v_earned
      from public.ledger_entries e
      where e.source_type     = 'partner_payout'
        and e.source_id       = p_booking_id
        and e.settlement_role = 'earned'
        and e.reverses_entry_id is null
        and not exists (
          select 1 from public.ledger_entries x where x.reverses_entry_id = e.id
        )
      limit 1;

      if v_earned is not null then
        perform public.reverse_ledger_entry(
          v_earned,
          'إلغاء مستحق المتعهد — فشلت الرحلة ' || coalesce(v_b.reference, '')
            || ' (' || v_r.label || ')'
        );
        v_effect := 'payout-reversed';
      else
        v_effect := 'payout-missing';
      end if;
    end if;
  else
    if v_action = 'pay' then
      if coalesce(v_payout, 0) <= 0 then
        raise exception 'مستحق الإسناد صفر أو مفقود — لا مبلغ يُدفع' using hint = 'no-payout';
      end if;
      perform public.record_partner_adjustment(
        v_sub, 'earned', round(v_payout, 2), v_now,
        'مستحق رحلةٍ فاشلة — ' || v_r.label || ' — ' || coalesce(v_b.reference, '')
      );
      v_effect := 'payout-created';
    end if;
  end if;

  if v_action = 'deduct' then
    perform public.record_partner_adjustment(
      v_sub, 'collected', v_amount, v_now,
      'خصمٌ على رحلةٍ فاشلة — ' || v_r.label || ' — ' || coalesce(v_b.reference, '')
    );
    v_effect := case
                  when v_effect = 'payout-reversed' then 'payout-reversed+deduct'
                  when v_effect = 'payout-missing'  then 'deduct'
                  else 'deduct'
                end;
  end if;

  -- (و) صفّ الفشل — **قبل** الحالة: الحارس `bookings_guard_failed` يشترط وجوده
  begin
    insert into public.booking_failures (
      booking_id, reason_id, reason_slug, reason_label, default_action,
      action_taken, deduct_amount, override_note, from_status,
      subcontractor_id, payout_snapshot, ledger_effect, failed_at, created_by
    )
    values (
      p_booking_id, v_r.id, v_r.slug, v_r.label, v_r.default_action,
      v_action, v_amount, v_note, v_b.status,
      v_sub, v_payout, v_effect, v_now, public.current_actor()
    );
  exception
    when unique_violation then
      raise exception 'هذا الحجز معلَّمٌ فاشلاً سلفاً' using hint = 'already-failed';
  end;

  -- (ز) الحالة أخيراً — والمُشغّلات تتكفّل بالولاء وبسجل الأحداث
  perform set_config(
    'tours.booking_note',
    'فشلت الرحلة — ' || v_r.label
      || case when v_note is not null then ' — ' || v_note else '' end,
    true
  );

  update public.bookings b set status = 'failed' where b.id = p_booking_id;

  select count(*)::integer into v_pts
  from public.loyalty_entries e
  where e.booking_id = p_booking_id
    and e.direction  = 'reverse'
    and e.created_at = v_now;

  booking_id      := p_booking_id;
  reference       := v_b.reference;
  reason_slug     := v_r.slug;
  action_taken    := v_action;
  deduct_amount   := v_amount;
  ledger_effect   := v_effect;
  points_reversed := v_pts;
  return next;
end;
$function$
;

-- ----------------------------------------------------------------------------
-- (٢) `apply_withdrawal_deduction` تقفل الحجز قبل أن تقيس المتبقّي
--
--     والنصُّ أدناه من `pg_get_functiondef` كذلك (D-58)، والمتغيّر فيه
--     ثلاثةُ أسطرِ قفلٍ وإعلانُ `v_bkid`.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_withdrawal_deduction(p_withdrawal_id uuid, p_amount numeric, p_note text)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_w      record;
  v_cfg    record;
  v_amt    numeric;
  v_asked  numeric;
  v_rowcap numeric;
  v_room   record;
  v_cap    numeric;
  v_note   text;
  v_ref    text;
  v_extra  text := '';
  v_bkid   uuid;     -- 0126: الحجز يُقفل قبل الصفّ
begin
  if not public.finance_admin_allowed() then
    raise exception 'تنفيذ الخصم متاح للإدارة وحدها' using hint = 'forbidden';
  end if;

  select * into v_cfg from public.trip_closure_config();
  if not v_cfg.apology_deduction_enabled then
    raise exception
      'الخصم على الاعتذار مطفأٌ من اللوحة — يُشعَل بقرار المالك بعد تثبيت أساسه التعاقدي'
      using hint = 'deduction-disabled';
  end if;

  -- 0126 (٢): 🔴 قفلُ **الحجز** قبل قفل الصفّ — وإلا فالسقف يُقاس ولا يُحرَس.
  --   `trip_deduction_room` تجمع صفوفاً كثيرة، والقفلُ الوحيد هنا كان على صفّ
  --   الاعتذار نفسه. ومقيسٌ بوصلتين متزامنتين على قاعدة بدر (قراءةٌ محضة داخل
  --   `BEGIN … ROLLBACK`): قفلان على **نفس** الصفّ ⇒ الثاني يُحجب (55P03)،
  --   وقفلان على صفّين **متمايزين** ⇒ الثاني يمرّ في 77ms. فتنفيذان متزامنان
  --   على اعتذارين من الرحلة نفسها كلاهما يقرأ «متبقٍّ كامل» فيخصمان ضعفَه.
  --   والترتيب `bookings ← trip_withdrawals` هو ترتيبُ `mark_booking_failed`
  --   نفسه (الحجز أولاً) — فلا تعانقَ أقفال بين المسارين.
  select w.booking_id into v_bkid from public.trip_withdrawals w where w.id = p_withdrawal_id;
  if not found then
    raise exception 'سجل الاعتذار غير موجود' using hint = 'not-found';
  end if;
  perform 1 from public.bookings b where b.id = v_bkid for update;

  select w.* into v_w from public.trip_withdrawals w where w.id = p_withdrawal_id for update;
  if not found then
    raise exception 'سجل الاعتذار غير موجود' using hint = 'not-found';
  end if;
  if v_w.deduct_applied then
    raise exception 'خصم هذا الاعتذار مطبَّقٌ سلفاً' using hint = 'already-applied';
  end if;

  v_note := nullif(btrim(coalesce(p_note, '')), '');
  if v_note is null then
    raise exception 'الخصم يستلزم سبباً مكتوباً' using hint = 'note-required';
  end if;

  v_amt   := round(coalesce(p_amount, v_w.deduct_amount, 0), 2);
  v_asked := v_amt;
  if v_amt <= 0 then
    raise exception 'مبلغ الخصم يجب أن يكون موجباً' using hint = 'invalid-input';
  end if;

  -- 🔴 سقفان يقعان معاً، وكلاهما من البند ٨ نفسه:
  --   (١) سقفُ **الواقعة**: مستحقُّ الرحلة وقتها، وهو المسجَّل في هذا الصفّ —
  --       «ولا يقع خصمٌ بلا واقعةٍ مصنَّفة … ومستحقَّ الرحلة وقتها».
  --   (٢) وسقفُ **الرحلة**: مستحقُّها ناقصَ ما خُصم عنها فعلاً — وهذا هو الذي
  --       كان غائباً، فمرّت خمسُ دوراتٍ بخمسة أضعاف المستحق.
  v_rowcap := round(coalesce(v_w.payout_snapshot, 0), 2);
  if v_rowcap <= 0 then
    raise exception 'لا مستحق مسجَّل لهذه الرحلة — فلا سقف يُخصم في حدوده'
      using hint = 'deduct-no-cap';
  end if;

  select * into v_room from public.trip_deduction_room(v_w.booking_id);
  if coalesce(v_room.trip_due, 0) <= 0 then
    raise exception 'لا مستحق مسجَّل لهذه الرحلة — فلا سقف يُخصم في حدوده'
      using hint = 'deduct-no-cap';
  end if;

  v_cap := least(v_rowcap, v_room.room);
  if v_cap <= 0 then
    raise exception
      'استُنفد سقفُ الخصم عن هذه الرحلة: مستحقُّها % وخُصم عنها % — فلا متبقّى. والسقف قرار مالك: لا يصير المتعهد مديناً بمالٍ لم يقبضه',
      v_room.trip_due, v_room.deducted
      using hint = 'deduct-cap-exhausted';
  end if;

  -- والتجاوزُ يُقصّ إلى المتبقّي — **ولا يُقصّ صامتاً**: المبلغ المنفَّذ هو
  -- المُرجَع، وهو المكتوب في الصفّ، ونصُّ القيد في الدفتر يقول من كم إلى كم.
  if v_amt > v_cap then
    v_extra := ' — 🔴 قُصَّ من ' || v_asked::text || ' إلى ' || v_cap::text
            || ' ج.م: سقفُ الرحلة ' || v_room.trip_due::text
            || ' وخُصم عنها سلفاً ' || v_room.deducted::text;
    v_amt   := v_cap;
  end if;

  select b.reference into v_ref from public.bookings b where b.id = v_w.booking_id;

  perform public.record_partner_adjustment(
    v_w.subcontractor_id, 'collected', v_amt, now(),
    'خصمٌ على اعتذارٍ بعد الإسناد — ' || v_w.reason_label
      || ' — ' || coalesce(v_ref, '') || ' — ' || v_note || v_extra
  );

  update public.trip_withdrawals w
     set deduct_amount  = v_amt,
         deduct_applied = true,
         ledger_effect  = 'deduct'
   where w.id = p_withdrawal_id;

  return v_amt;
end;
$function$
;

-- ----------------------------------------------------------------------------
-- (٣) ن‑١ — نصُّ بند الولاء يتبع الإعدادات، ولا يبقى مجمَّداً
--
--     لماذا مُشغّلٌ لا محرّكُ قوالب في العارضة؟ لأن `sections.content` نصٌّ
--     ساكن يقرؤه الموقعُ والترجمةُ ولقطاتُ النشر معاً؛ فمحرّكُ قوالبٍ في
--     العارضة وحدها يترك الترجمة واللقطة تحملان الرقمَ القديم. والمصدرُ يبقى
--     واحداً: `loyalty_terms_disclosure()` — ولا رقمَ مكتوبٌ بيد.
-- ----------------------------------------------------------------------------

-- معرّفُ البند مصدرٌ واحد: تكرارُه في ثلاثة مواضع يعني ثلاثةَ مواضعَ تنحرف
create or replace function public.loyalty_terms_section_id()
returns uuid
language sql
immutable
set search_path = ''
as $$ select 'b0000000-0000-4000-8000-000000003110'::uuid $$;

-- نصُّ البند مُجمَّعاً بفقراتٍ — نفس تجميع 0125 حرفياً، وقد صار **دالةً**
-- بدل أن يبقى استعلاماً مكرَّراً في كل من يحتاجه
create or replace function public.loyalty_terms_body(p_locale text default 'ar')
returns text
language sql
stable
set search_path = ''
as $$
  select string_agg(x.p, E'\n\n' order by x.para)
  from (
    select d.para,
           string_agg(
             case when lower(coalesce(p_locale, 'ar')) = 'en' then d.en else d.ar end,
             ' ' order by d.ord) as p
      from public.loyalty_terms_disclosure() d
     group by d.para
  ) x;
$$;

-- هل المنشورُ مطابقٌ للإعدادات الآن؟ — تقريرٌ يقرؤه الاختبار والشاشة معاً
create or replace function public.loyalty_terms_in_sync()
returns table(
  clause_exists boolean,
  body_ok       boolean,
  visible_ok    boolean,
  generated     boolean,
  snapshots_stale integer,
  en_draft_ok   boolean)
language sql
stable
set search_path = ''
as $$
  with sec as (
    select s.* from public.sections s where s.id = public.loyalty_terms_section_id()
  ), gen as (
    select public.loyalty_terms_body('ar') as ar, public.loyalty_terms_body('en') as en
  ), st as (
    select l.enabled from public.loyalty_settings l limit 1
  )
  select
    exists (select 1 from sec),
    (select s.content ->> 'body' from sec s) is not distinct from (select ar from gen),
    (select s.visible from sec s) is not distinct from coalesce((select enabled from st), false),
    (select s.content -> 'style' ->> 'genFp' from sec s)
      is not distinct from md5((select s.content ->> 'body' from sec s)),
    (select count(*)::integer
       from public.page_revisions r,
            lateral jsonb_array_elements(r.snapshot -> 'sections') x
      where r.status in ('draft', 'published')
        and jsonb_typeof(r.snapshot -> 'sections') = 'array'
        and x ->> 'id' = public.loyalty_terms_section_id()::text
        and x -> 'content' ->> 'body' is distinct from (select ar from gen)),
    not exists (
      select 1 from public.translations t
      where t.locale = 'en' and t.namespace = 'section'
        and t.key = public.loyalty_terms_section_id()::text || '.body'
        and t.status = 'draft'
        and t.source_text is distinct from (select ar from gen));
$$;

-- 🔁 المزامنة نفسها — تُنادى من المُشغّل ومن هذه الهجرة معاً، فلا نسختان
create or replace function public.loyalty_terms_resync(p_track_enabled boolean default true)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sec  uuid := public.loyalty_terms_section_id();
  v_ar   text;
  v_en   text;
  v_cur  text;
  v_fp   text;
  v_on   boolean;
begin
  select s.content ->> 'body', s.content -> 'style' ->> 'genFp'
    into v_cur, v_fp
  from public.sections s where s.id = v_sec;
  if not found then
    return false;                       -- نسخةٌ لا بندَ فيها: لا شيء يُصالَح
  end if;

  v_ar := public.loyalty_terms_body('ar');
  v_en := public.loyalty_terms_body('en');
  select coalesce(l.enabled, false) into v_on from public.loyalty_settings l limit 1;

  -- 🔒 تحريرُ المالك لا يُمحى. والبصمةُ هي ما يميّز المولَّد من المكتوب بيد —
  --    ولا يُبتلع الفارق صامتاً: يُسجَّل محاولةً في `audit_attempts`، ويحمرّ
  --    في `loyalty_terms_in_sync()` التي تقيسها المجموعة.
  if v_fp is distinct from md5(coalesce(v_cur, '')) then
    perform public.record_audit_attempt(
      'loyalty_terms_out_of_sync', 'loyalty-settings-changed',
      'sections', v_sec,
      'تغيّرت إعدادات الولاء ونصُّ بند الولاء محرَّرٌ بيد — لم يُكتب فوقه، ويحتاج تحديثاً يدوياً');
    return false;
  end if;

  update public.sections s
     set content = jsonb_set(
                     jsonb_set(s.content, '{body}', to_jsonb(v_ar)),
                     '{style,genFp}', to_jsonb(md5(v_ar))),
         visible = case when coalesce(p_track_enabled, true) then v_on else s.visible end
   where s.id = v_sec;

  -- 🔒 D-60: من كتب في `sections.content` كتب في اللقطات **الحيّة** معها.
  --    والمؤرشفةُ لا تُلمس — إعادةُ كتابة الماضي تكذب على من يقرأ السجل.
  update public.page_revisions r
     set snapshot = jsonb_set(
           r.snapshot, '{sections}',
           (select jsonb_agg(
                     case when x ->> 'id' = v_sec::text
                          then x || (select jsonb_build_object('content', s.content,
                                                               'visible', s.visible)
                                       from public.sections s where s.id = v_sec)
                          else x end
                     order by ord)
              from jsonb_array_elements(r.snapshot -> 'sections')
                   with ordinality t(x, ord)))
   where r.status in ('draft', 'published')
     and jsonb_typeof(r.snapshot -> 'sections') = 'array'
     and exists (select 1 from jsonb_array_elements(r.snapshot -> 'sections') y
                  where y ->> 'id' = v_sec::text);

  -- والإنجليزية **مسوّدةٌ تبقى مسوّدة**: نشرُ صفوف الترجمة بأمر بدر وحده
  -- (‏`STANDING-ORDERS` §٣). وتحديثُ `source_text` يعيد حساب `source_hash`
  -- (عمودٌ مولَّد) فيبقى الطابور صادقاً عن أيّ نصٍّ تُرجم.
  update public.translations t
     set source_text = v_ar,
         value       = v_en,
         provider    = 'auto-loyalty-terms',
         updated_at  = now()
   where t.locale = 'en' and t.namespace = 'section'
     and t.key = v_sec::text || '.body'
     and t.status = 'draft'
     and (t.source_text is distinct from v_ar or t.value is distinct from v_en);

  return true;
end;
$$;

create or replace function public.loyalty_terms_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.loyalty_terms_resync(new.enabled is distinct from old.enabled);
  return null;
end;
$$;

drop trigger if exists loyalty_settings_sync_terms on public.loyalty_settings;
create trigger loyalty_settings_sync_terms
after update on public.loyalty_settings
for each row execute function public.loyalty_terms_sync();

comment on function public.loyalty_terms_resync(boolean) is
  'يعيد توليد نصّ بند الولاء المنشور من loyalty_terms_disclosure()، ويصالح اللقطات الحيّة (D-60) ومسوّدة الإنجليزية. لا يكتب فوق تحرير المالك: بصمةُ genFp تميّز المولَّد من المكتوب بيد، والفارقُ يُسجَّل محاولةً بدل أن يُبتلع.';
comment on function public.loyalty_terms_in_sync() is
  'تقريرٌ واحد: أمطابقٌ نصُّ البند المنشور للإعدادات الحيّة؟ وظهورُه لحالة enabled؟ واللقطاتُ الحيّة؟ ومسوّدةُ الإنجليزية؟ — تقرؤه مجموعة loyalty_terms.';
comment on trigger loyalty_settings_sync_terms on public.loyalty_settings is
  'ن-1: مقبضٌ يتحرك في اللوحة ونصٌّ تعاقديٌّ منشور لا يتحرك معه = وعدٌ كاذب على صفحة شروط. المشغّل يجعلهما رقماً واحداً.';


-- ----------------------------------------------------------------------------
-- (٤) المزامنة الأولى + بصمةُ المولَّد
--
--     البندُ اليوم مكتوبٌ بيد 0125 بلا بصمة. فيُتحقَّق أولاً أنه ما زال مطابقاً
--     لما تولّده الدالة (أي لم يحرّره المالك)، ثم يُبصَم. وإن كان قد حُرِّر:
--     **لا يُكتب فوقه**، ويبقى الفارق ظاهراً في `loyalty_terms_in_sync()`.
-- ----------------------------------------------------------------------------
do $stamp126$
declare
  v_sec  uuid := public.loyalty_terms_section_id();
  v_cur  text;
  v_gen  text;
begin
  select s.content ->> 'body' into v_cur from public.sections s where s.id = v_sec;
  if not found then
    raise notice 'ℹ لا بندَ ولاءٍ في هذه النسخة — لا شيء يُبصَم';
    return;
  end if;

  v_gen := public.loyalty_terms_body('ar');
  if v_cur is distinct from v_gen then
    raise notice '⚠ نصُّ بند الولاء يخالف ما تولّده الإعدادات — لم يُكتب فوقه. راجعه في اللوحة.';
    return;
  end if;

  update public.sections s
     set content = jsonb_set(s.content, '{style,genFp}', to_jsonb(md5(v_gen)))
   where s.id = v_sec
     and s.content -> 'style' ->> 'genFp' is distinct from md5(v_gen);

  -- ثم مزامنةٌ كاملة تُصالح الظهورَ واللقطات ومسوّدة الإنجليزية دفعةً واحدة
  perform public.loyalty_terms_resync(true);
  raise notice '✅ بند الولاء مبصومٌ ومُصالَح';
end
$stamp126$;


-- ----------------------------------------------------------------------------
-- (٥) الصلاحيات — الافتراضي في Postgres منحةُ PUBLIC، فتُسحب صراحةً
-- ----------------------------------------------------------------------------
revoke all on function public.loyalty_terms_section_id()        from public, anon, authenticated;
revoke all on function public.loyalty_terms_body(text)          from public, anon, authenticated;
revoke all on function public.loyalty_terms_in_sync()           from public, anon, authenticated;
revoke all on function public.loyalty_terms_resync(boolean)     from public, anon, authenticated;
revoke all on function public.loyalty_terms_sync()              from public, anon, authenticated;

grant execute on function public.loyalty_terms_section_id()     to service_role;
grant execute on function public.loyalty_terms_body(text)       to service_role;
grant execute on function public.loyalty_terms_in_sync()        to service_role;
grant execute on function public.loyalty_terms_resync(boolean)  to service_role;


-- ----------------------------------------------------------------------------
-- (٦) الفحص الذاتي — يحمرّ إن لم يقع ما تدّعيه الترويسة
-- ----------------------------------------------------------------------------
do $chk126$
declare
  v_def  text;
  v_sync record;
  v_miss text;
begin
  -- (أ) السقفُ الثاني موجودٌ في `mark_booking_failed` فعلاً — من القاعدة لا من الملف
  v_def := pg_get_functiondef('public.mark_booking_failed(uuid,text,text,numeric,text)'::regprocedure);
  if v_def not like '%trip_deduction_room(p_booking_id)%' then
    raise exception '🔴 (0126-أ) mark_booking_failed لا تسأل trip_deduction_room — الثقبُ ما زال مفتوحاً';
  end if;
  if v_def not like '%deduct-cap-exhausted%' then
    raise exception '🔴 (0126-أ٢) لا رمزَ deduct-cap-exhausted في mark_booking_failed';
  end if;

  -- (ب) القفلُ على الحجز قبل الصفّ
  v_def := pg_get_functiondef('public.apply_withdrawal_deduction(uuid,numeric,text)'::regprocedure);
  if v_def not like '%from public.bookings b where b.id = v_bkid for update%' then
    raise exception '🔴 (0126-ب) apply_withdrawal_deduction بلا قفلٍ على الحجز — السقف يُقاس ولا يُحرَس';
  end if;
  -- والترتيب نفسه يُقاس: قفلُ الحجز يسبق قفلَ صفّ الاعتذار في نصّ الدالة
  if position('public.bookings b where b.id = v_bkid for update' in v_def)
     > position('from public.trip_withdrawals w where w.id = p_withdrawal_id for update' in v_def) then
    raise exception '🔴 (0126-ب٢) قفلُ الحجز بعد قفل الصفّ — ترتيبٌ يعانق أقفال mark_booking_failed';
  end if;

  -- (ج) المزامنة — والمشغّل موصول
  if not exists (
    select 1 from pg_trigger t
    where t.tgrelid = 'public.loyalty_settings'::regclass
      and t.tgname = 'loyalty_settings_sync_terms' and not t.tgisinternal
  ) then
    raise exception '🔴 (0126-ج) مشغّل مزامنة بند الولاء غير موصول — مفتاحٌ بلا منفِّذ';
  end if;

  select * into v_sync from public.loyalty_terms_in_sync();
  if v_sync.clause_exists then
    if not v_sync.body_ok then
      raise notice '⚠ (0126-ج٢) نصُّ البند يخالف الإعدادات — محرَّرٌ بيد، ولم يُكتب فوقه';
    end if;
    if v_sync.snapshots_stale > 0 then
      raise exception '🔴 (0126-ج٣) % لقطةٍ حيّة تحمل نصّاً قديماً للبند (D-60)', v_sync.snapshots_stale;
    end if;
  end if;

  -- (د) لا صفَّ ترجمةٍ نُشر من هذه الهجرة
  if exists (
    select 1 from public.translations t
    where t.locale = 'en' and t.namespace = 'section'
      and t.key like public.loyalty_terms_section_id()::text || '.%'
      and t.status = 'published') then
    raise exception '🔴 (0126-د) صفُّ ترجمةٍ منشور — نشرُ الترجمة بأمر بدر وحده';
  end if;

  -- (هـ) صلاحيات: لا anon ولا authenticated على دوال هذه الهجرة
  select string_agg(x.sig, '، ') into v_miss
  from (values
    ('public.loyalty_terms_section_id()'),
    ('public.loyalty_terms_body(text)'),
    ('public.loyalty_terms_in_sync()'),
    ('public.loyalty_terms_resync(boolean)'),
    ('public.loyalty_terms_sync()')
  ) x(sig)
  where has_function_privilege('anon', x.sig, 'execute')
     or has_function_privilege('authenticated', x.sig, 'execute');
  if v_miss is not null then
    raise exception '🔴 (0126-هـ) دوالٌّ منوحةٌ لدورٍ عام: %', v_miss;
  end if;

  raise notice '✅ 0126 — الفحص الذاتي أخضر';
end
$chk126$;
