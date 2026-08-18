-- ============================================================================
-- 0124_completion_guards_and_deduction_cap.sql
--   حاجزا المال: (ح‑١) الاعتمادُ التلقائي لا يتجاوز قراراً بشرياً ولا تظلّماً
--                  مفتوحاً · (ح‑٢) سقفُ الخصم لكل **رحلة** لا لكل صفّ اعتذار
--   وعيبان أدنى: (د‑٢) انتهاءُ صلاحية النقاط يُرشِّح قبل أن يحدّ ·
--                  (د‑١) مُرسى الاحتفاظ يكتبه قرارٌ ولا يمحوه رجوعُ حالة
--
-- ══════════════════════════════════════════════════════════════════════════
--  (ح‑١) طلبُ إتمامٍ يُعتمد تلقائياً بعد رفضٍ إداريّ — ولو كان التظلّم مفتوحاً
-- ══════════════════════════════════════════════════════════════════════════
--
-- المقيس على القاعدة الحيّة قبل هذه الهجرة (داخل BEGIN … ROLLBACK):
--
--     (١) الطلب الأول 511a9819…
--     (٢) القرار الإداري: rejected بفاعل admin
--     (٣) 🔴 الطلب الثاني قُبل بعد رفضٍ إداري
--     (٤) تظلّمٌ مفتوح على الحجز: 1 صف
--     (٥) الدورة: فُحص 1 · اعتُمد 1 · تُخطّي 0
--     (٦) حالة الحجز «completed» · قيود الدفتر +2 · قيود الولاء +1
--
-- أي أن المدير رفض بسببٍ مكتوب، والمتعهد أعاد التقديم، فمرّت أربعٌ وعشرون ساعة
-- **فاعتمدت الدورةُ ما رفضه إنسان** — وقيّدت المستحق وسكّت نقاط العميل. والتظلّم
-- المفتوح على الرحلة نفسها لم تره الدورة أصلاً: `settle_due_completions` لم تكن
-- تقرأ `partner_grievances` إطلاقاً.
--
-- ── القرار المنفَّذ هنا ────────────────────────────────────────────────────
--
-- 🔴 **الاعتمادُ التلقائي امتيازُ الصمت لا امتيازُ تجاوز قرار.** فمهلةُ الأربع
--    والعشرين ساعة في البند ٧ من الاتفاقية تُعتمد «إذا مضت … **بلا اعتراض من
--    المنصة**» — والرفضُ اعتراضٌ وقع فعلاً، لا صمت.
--
--   • طلبٌ يلي رفضاً **إدارياً** لنفس الحجز: يُقدَّم ولا يُمنع (المتعهد قد يصحّح
--     ويعيد)، لكنه **لا يُعتمد تلقائياً أبداً** — يبقى `pending` بانتظار قرارٍ
--     بشريّ. ولذلك **لم يُمسّ** الفهرس `…_one_pending_key`: منعُ التقديم عقوبةٌ،
--     والمطلوب منعُ **الاعتماد الصامت** وحده.
--   • وتظلّمٌ `open` على الحجز نفسه **يجمّد** الاعتماد التلقائي حتى يُحسم —
--     بأي قرار: قبولاً أو رفضاً. فالمالُ لا يتحرك تلقائياً وبابُ الاعتراض مفتوح.
--   • وفي الحالتين يُكتب السبب في الصفّ (`auto_hold_reason` · `auto_hold_at`)،
--     و`settle_due_completions` تُرجع عدّاداً **منفصلاً** اسمه `held`.
--
-- ── ولا نسخةَ ثانية من منطق `decide_trip_completion` (القاعدة الذهبية ١٢) ──
--
-- كانت الدورةُ تستنسخ جسمَ الاعتماد حرفاً بحرف: تحديثُ الطلب، ثم `set_config`
-- لملاحظة الحجز، ثم `bookings.status = 'completed'`، ثم التنبيه. فصارتا اليوم
-- تفوّضان إلى دالتين لا ثالثة لهما:
--
--   `public.trip_completion_gate(request, auto)`  — **الأهلية**: من يجيب عن
--       «هل يجوز الاعتماد الآن؟ ولماذا لا؟» في مكانٍ واحد. تقرؤها الدورةُ
--       بـ`auto = true` (فتضيف حاجزَي الرفض الإداري والتظلّم) ويقرؤها القرارُ
--       الإداري بـ`auto = false` (فالمشرف يقرّر فوق التظلّم بحكم كونه المقرِّر).
--   `public.approve_trip_completion(...)`        — **الأثر**: الموضع الوحيد
--       الذي يحوّل حجزاً إلى «مكتملة» على طلب إتمام. المال يتحرك من سطرٍ واحد.
--
-- ══════════════════════════════════════════════════════════════════════════
--  (ح‑٢) سقفُ الخصم كان لكل صفّ اعتذارٍ لا لكل رحلة
-- ══════════════════════════════════════════════════════════════════════════
--
-- المقيس على القاعدة الحيّة قبل هذه الهجرة — خمسُ دورات «إسنادٌ يدويّ ⇐
-- `withdraw_from_trip` ⇐ `apply_withdrawal_deduction(1500)`» على رحلةٍ
-- مستحقُّها 1500:
--
--     دورة 1..5 ⇐ خُصم 1500 ج.م في كلٍّ منها
--     🔴 المحصّلة: 5 صفوف · 7500.00 ج.م · 5.00× مستحق الرحلة (1500)
--
-- والسبب سطرٌ واحد: `v_cap := v_w.payout_snapshot` — سقفُ **الصفّ** لا سقفُ
-- **الرحلة**، بلا أي تجميعٍ على `booking_id`.
--
-- والنصّ الحاكم — البند ٨ من اتفاقية المتعهد (النسخة ١، وهي المنشورة):
--   «🔴 **سقف الخصم عن أي رحلة هو مستحقُّ تلك الرحلة نفسها ولا يتجاوزه بحال.**
--    فلا يترتب على الخصم رصيدٌ سالب في ذمة المتعهد ولا مطالبةٌ بما يزيد على ما
--    كان يستحقه عنها.»
--
-- ── ولماذا «مستحقُّ الحجز الحاليّ» مرجعاً واحداً ─────────────────────────────
--
-- ‏`payout_snapshot` يختلف بين صفوف الانسحاب لنفس الحجز: كلُّ إسنادٍ جديد قد
-- يحمل مستحقاً آخر (متعهدٌ آخر · قائمةُ أسعارٍ تغيّرت)، والاعتذارُ **يُفرغ**
-- ‏`dispatches.assigned_payout` فور وقوعه. فلو أُخذ سقفُ الرحلة من الصفّ الجاري
-- لعاد العيبُ نفسه بثوبٍ آخر: خمسةُ صفوفٍ خمسةُ سقوف.
--
-- والمرجع المُتَّخذ (‏`public.trip_deduction_room`) سلسلةُ `coalesce` واحدة:
--
--     dispatches.assigned_payout            ← مستحقُّ الإسناد القائم إن وُجد
--     ← أحدثُ trip_withdrawals.payout_snapshot   ← آخرُ قياسٍ لنفس الرقم
--     ← booking_failures.payout_snapshot         ← وإلا لقطةُ صفّ الفشل
--
-- وهي **رقمٌ واحد للحجز** لا يتغيّر بتغيّر الصفّ المخصوم منه، وهذا هو المقصود
-- بـ«مستحق تلك الرحلة نفسها». والسقفُ يُطرح منه **ما خُصم فعلاً عن الحجز نفسه**
-- من الطريقين معاً (اعتذارٌ مطبَّق + صفُّ فشلٍ بإجراء خصم)، فلا يُفتح بابٌ ثانٍ
-- لتجاوزه.
--
-- ⚠ **وحدٌّ معلَن**: `mark_booking_failed` **لم تُمسّ** في هذه الهجرة (خارج
--   ملفّات هذه الجبهة، ومجموعتُها `failed_trip_tests.sql` ليست منها). فهي ما
--   زالت تسقّف بـ`dispatches.assigned_payout` وحده ولا تطرح خصمَ اعتذارٍ سابق
--   على الحجز نفسه. والفجوة مبلَّغةٌ لا مُصلَحة، وعلاجها سطرٌ واحد: أن تقرأ
--   ‏`public.trip_deduction_room(p_booking_id).room` بدل `v_payout`.
--
-- ⚠ **وتحفّظٌ ثانٍ يُقال**: القصُّ عند السقف يخالف نبرةَ تعليقٍ في `0119`
--   («يُرفض ولا يُقصّ: القصُّ الصامت يترك المدير يظن أنه خصم ما كتب»). والقرارُ
--   هنا القصُّ **غيرَ صامت**: المبلغ المنفَّذ هو المُرجَع من الدالة، وهو المكتوب
--   في `trip_withdrawals.deduct_amount`، **ونصُّ القيد في الدفتر يقول صراحةً**
--   أنه قُصَّ من كذا إلى كذا وبأي سقف. ومتبقٍّ صفرٌ يُرفض بخطأٍ مفهوم ولا يُكتب
--   صفراً صامتاً.
--
-- ══════════════════════════════════════════════════════════════════════════
--  (د‑٢) `expire_loyalty_points`: الحدُّ كان قبل الترشيح
-- ══════════════════════════════════════════════════════════════════════════
--
-- كانت الدالة تأخذ أولَ `p_limit` حساباً برصيدٍ موجب **مرتَّبةً بـ`phone_norm`**
-- ثم تسأل أيُّها له نقاطٌ هرمت. فوق ٥٠٠ حساب: مَن ترتيبُه بعدهم **لا تنتهي
-- نقاطه أبداً** — والترتيبُ الأبجدي ثابتٌ فلا تتقدّم الدورة أبداً. خاملٌ اليوم
-- (حسابان) وقنبلةٌ موقوتة عند النمو.
-- والعلاج: **يُرشَّح أولاً ثم يُحدّ**، والترتيب **بالأقدم استحقاقاً** فيتقدّم
-- الطابور حتماً. ومرشِّحٌ رخيصٌ سابق (شرطٌ **لازم** لا كافٍ) يمنع حساب الدفعات
-- لكل حسابٍ في القاعدة.
--
-- ══════════════════════════════════════════════════════════════════════════
--  (د‑١) شريكٌ «معتمد» مهجور ⇒ صور سائقيه تبقى أبداً
-- ══════════════════════════════════════════════════════════════════════════
--
-- ‏`relationship_ended_at` هو مُرسى «خمس سنوات ثم تُحذف» (البند ١١). وكان
-- مُشغّلُ `0120` يكتبه عند `suspended` وحده **ويمحوه بلا شرط** كلما صارت الحالة
-- غير `suspended` — فلا يمكن أن يوجد مُرسىً لشريكٍ حالتُه `approved` مهما انتهت
-- علاقتُه فعلاً، وصورُ سائقيه تبقى إلى الأبد.
--
-- والعلاج: تمييزُ **مصدر** المُرسى (‏`relationship_ended_source`):
--   • `suspension` — ساعةُ الإيقاف، تبدأ بالدخول فيه **وتُمحى بالخروج منه**
--     (فإيقافٌ مؤقت لا يُفقد صورة، وهو السلوك المقيس في `driver_docs_tests`).
--   • `terminated` — **إنهاءٌ صريح بقرار**: يكتبه `end_partner_relationship`،
--     **ولا يمحوه رجوعُ الحالة** بحال.
--
-- ⚠ **وحدٌّ معلَن**: هذا يبني المُرسى ومن يكتبه، ولا يبني **من يكتشف الهجر**
--   تلقائياً — «متى يُعدّ الشريك المعتمد مهجوراً؟» قرارُ مالكٍ لا هندسة. ولا
--   يبني زرّاً في اللوحة (خارج ملفّات هذه الجبهة).
--
-- ── والهجرة قابلة لإعادة التنفيذ بكاملها ────────────────────────────────────
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (١) ح‑١ — عمودا التأجيل: «لماذا لم يُعتمد» مكتوبٌ في الصفّ لا مطويّ
-- ----------------------------------------------------------------------------

alter table public.trip_completion_requests
  add column if not exists auto_hold_reason text,
  add column if not exists auto_hold_at     timestamptz;

comment on column public.trip_completion_requests.auto_hold_reason is
  'سببُ امتناع الدورة عن الاعتماد التلقائي، بنصٍّ عربيّ يقرؤه المشرف والمتعهد. يصف **آخر تقييمٍ للدورة** لا القرار النهائي — فالقرار في status وdecision_note. NULL = لا مانع (أو لم تمرّ الدورة بعد).';
comment on column public.trip_completion_requests.auto_hold_at is
  'لحظةُ آخر تأجيلٍ كتبته الدورة. تتجدّد كل دورة ما دام المانع قائماً، فطولُ المدة بين هذا العمود وrequested_at يقيس كم بقي الطلب معلّقاً بلا قرارٍ بشريّ.';

-- ----------------------------------------------------------------------------
-- (٢) ح‑١ — دالةُ الأهلية الواحدة: «هل يجوز الاعتماد الآن؟ ولماذا لا؟»
-- ----------------------------------------------------------------------------
--
-- تُرجع **صفاً واحداً دائماً**. و`code is null` وحده يعني «يجوز».
--
--   الرموز المشتركة (للمسارين):
--     request-not-found · already-decided · booking-missing · invalid-status
--   والرمزان الخاصّان بالاعتماد التلقائي (`p_auto = true`) وحده:
--     admin-rejected   — رُفض طلبٌ على هذه الرحلة بقرارٍ إداري
--     grievance-open   — تظلّمٌ مفتوح على الرحلة نفسها
--
-- 🔒 ولماذا لا يقيّد الرمزان المشرفَ: هو **المقرِّر**، ورفضُه السابق قرارُه هو،
--    والتظلّم موجَّهٌ إليه أصلاً. فلو منعناه لصار البابُ الذي فتحناه للمتعهد
--    قفلاً على من يملك حلّه.

create or replace function public.trip_completion_gate(
  p_request_id uuid,
  p_auto       boolean default false
)
returns table (code text, reason text)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_r record;
  v_b record;
  v_g record;
begin
  select r.* into v_r
  from public.trip_completion_requests r
  where r.id = p_request_id;
  if not found then
    code := 'request-not-found'; reason := 'طلب الإتمام غير موجود';
    return next; return;
  end if;

  if v_r.status <> 'pending' then
    code   := 'already-decided';
    reason := format('هذا الطلب مقرَّرٌ سلفاً («%s»)', v_r.status);
    return next; return;
  end if;

  select b.* into v_b from public.bookings b where b.id = v_r.booking_id;
  if not found then
    code   := 'booking-missing';
    reason := 'الحجز المرتبط بهذا الطلب لم يعد موجوداً';
    return next; return;
  end if;
  if v_b.status <> 'assigned' then
    code   := 'invalid-status';
    reason := format('حالة الحجز «%s» تغيّرت — لم يعد الطلب قابلاً للاعتماد', v_b.status);
    return next; return;
  end if;

  if coalesce(p_auto, false) then
    -- (أ) 🔴 قرارٌ بشريّ سابق بالرفض على **هذا الحجز** — لا يتجاوزه صمتُ المهلة.
    --     والفاعل `admin` وحده: `auto` هو إغلاقُ الدورة لطلبٍ تحرّك حجزُه، وليس
    --     اعتراضاً من المنصة، فلا يُبنى عليه حجب.
    if exists (
      select 1 from public.trip_completion_requests r2
      where r2.booking_id    = v_r.booking_id
        and r2.id           <> v_r.id
        and r2.status        = 'rejected'
        and r2.decided_actor = 'admin'
    ) then
      code   := 'admin-rejected';
      reason := 'سبق أن رُفض طلبُ إتمامٍ على هذه الرحلة بقرارٍ إداري — '
             || 'فالاعتماد التلقائي لا يقع عليها بحال، وهذا الطلب ينتظر قراراً بشرياً';
      return next; return;
    end if;

    -- (ب) تظلّمٌ مفتوح على الرحلة نفسها ⇒ تجميدٌ حتى يُحسم بأي قرار
    select g.* into v_g
    from public.partner_grievances g
    where g.booking_id = v_r.booking_id
      and g.status     = 'open'
    order by g.filed_at
    limit 1;
    if found then
      code   := 'grievance-open';
      reason := format(
        'تظلّمٌ مفتوح على هذه الرحلة منذ %s — الاعتماد التلقائي مجمَّدٌ حتى يُبتَّ فيه',
        to_char(v_g.filed_at, 'YYYY-MM-DD'));
      return next; return;
    end if;
  end if;

  code := null; reason := null;
  return next;
end;
$function$;

-- 🔒 والمنحةُ الافتراضية في Postgres هي **PUBLIC**، فبلا هذا السطر تصير دالةُ
--    `security definer` (تتجاوز RLS بحكم التعريف) مقروءةً لكل زائر ومتعهد:
--    حالةُ أي حجزٍ وتاريخُ أي تظلّمٍ بمعرّف طلبٍ واحد. والنمط ١ في LESSONS ثمنُه
--    مدفوعٌ مرّةً سلفاً على `coverage_matches`.
revoke all on function public.trip_completion_gate(uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.trip_completion_gate(uuid, boolean) to service_role;

comment on function public.trip_completion_gate(uuid, boolean) is
  'أهليةُ اعتماد طلب إتمام — المصدر الوحيد للجواب «لماذا لا يُعتمد؟». تقرؤها decide_trip_completion بـauto=false وsettle_due_completions بـauto=true. code is null وحده يعني «يجوز».';

-- ----------------------------------------------------------------------------
-- (٣) ح‑١ — أثرُ الاعتماد الواحد: الموضع الوحيد الذي يُكمل حجزاً على طلب إتمام
-- ----------------------------------------------------------------------------
--
-- 🔴 لا تفحص شيئاً بنفسها: **الأهلية مسؤولية النادي** (`trip_completion_gate`).
--    ولذلك **لا تُمنح لأحد**: لا `anon` ولا `authenticated` ولا `service_role`.
--    ونادياها دالتان `security definer` مملوكتان لصاحب المخطط، فتبلغانها بحكم
--    الملكية لا بحكم منحة.

create or replace function public.approve_trip_completion(
  p_request_id   uuid,
  p_actor        text,
  p_decision_note text,
  p_booking_note text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_r   record;
  v_now timestamptz := now();
begin
  update public.trip_completion_requests r
     set status        = 'approved',
         decided_at    = v_now,
         decided_by    = case when p_actor = 'admin' then public.current_actor() else null end,
         decided_actor = p_actor,
         decision_note = p_decision_note
   where r.id = p_request_id
     and r.status = 'pending'
  returning r.* into v_r;
  if not found then
    raise exception 'طلب الإتمام % لم يعد معلّقاً — لا يُعتمد', p_request_id
      using hint = 'already-decided';
  end if;

  -- 🔴 هنا وحدها يتحرك المال: المُشغّلات الثلاثة تعمل على هذا السطر
  perform set_config('tours.booking_note', p_booking_note, true);
  update public.bookings b set status = 'completed' where b.id = v_r.booking_id;

  perform public.queue_notification(
    'trip_completion_approved',
    public.dispatch_trip_payload(v_r.booking_id, false) || jsonb_build_object(
      'requestId',       p_request_id,
      'subcontractorId', v_r.subcontractor_id,
      'decidedActor',    p_actor,
      'decidedAt',       v_now,
      'approveHours',    v_r.approve_hours,
      'note',            p_decision_note
    ),
    'partner',
    v_r.subcontractor_id
  );

  return v_r.booking_id;
end;
$function$;

revoke all on function public.approve_trip_completion(uuid, text, text, text)
  from public, anon, authenticated, service_role;

comment on function public.approve_trip_completion(uuid, text, text, text) is
  '🔒 أثرُ اعتماد الإتمام في مكانٍ واحد: الطلب ⇐ approved، والحجز ⇐ completed، والتنبيه. لا تفحص أهلية — النادي يفحص بـtrip_completion_gate. وغيرُ ممنوحةٍ لأي دور: تبلغها الدالتان الناديتان بحكم ملكية المخطط.';

-- ----------------------------------------------------------------------------
-- (٤) ح‑١ — القرار الإداري: يفوّض الأهلية والأثر، ولا ينسخهما
-- ----------------------------------------------------------------------------

create or replace function public.decide_trip_completion(
  p_request_id uuid,
  p_approve    boolean,
  p_note       text default null
)
returns table (request_id uuid, booking_id uuid, status text, decided_actor text)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_r    record;
  v_gate record;
  v_note text;
  v_now  timestamptz := now();
begin
  if not public.is_admin() then
    raise exception 'اعتماد إتمام الرحلة متاح للمشرف وحده' using hint = 'forbidden';
  end if;

  -- القفلان أولاً (ترتيبهما كما كان: الطلب ثم الحجز)، ثم تُسأل الأهلية عن
  -- حالةٍ لن تتحرك تحتنا
  select r.* into v_r
  from public.trip_completion_requests r
  where r.id = p_request_id
  for update;

  perform 1 from public.bookings b where b.id = v_r.booking_id for update;

  select * into v_gate from public.trip_completion_gate(p_request_id, false);
  if v_gate.code is not null then
    raise exception '%', v_gate.reason using hint = v_gate.code;
  end if;

  v_note := nullif(btrim(coalesce(p_note, '')), '');
  -- الرفض يُعلَّل دائماً: المتعهد ينتظر مستحقه، و«رُفض» بلا سبب شكوى غداً
  if not coalesce(p_approve, false) and v_note is null then
    raise exception 'رفض طلب الإتمام يستلزم سبباً مكتوباً يقرؤه المتعهد'
      using hint = 'note-required';
  end if;

  if coalesce(p_approve, false) then
    booking_id := public.approve_trip_completion(
      p_request_id,
      'admin',
      v_note,
      'اكتمال معتمَدٌ من الإدارة على طلب المتعهد'
        || case when v_note is not null then ' — ' || v_note else '' end
    );
  else
    update public.trip_completion_requests r
       set status        = 'rejected',
           decided_at    = v_now,
           decided_by    = public.current_actor(),
           decided_actor = 'admin',
           decision_note = v_note
     where r.id = p_request_id;
    booking_id := v_r.booking_id;

    perform public.queue_notification(
      'trip_completion_rejected',
      public.dispatch_trip_payload(v_r.booking_id, false) || jsonb_build_object(
        'requestId',       p_request_id,
        'subcontractorId', v_r.subcontractor_id,
        'decidedActor',    'admin',
        'decidedAt',       v_now,
        'note',            v_note
      ),
      'partner',
      v_r.subcontractor_id
    );
  end if;

  request_id    := p_request_id;
  status        := case when coalesce(p_approve, false) then 'approved' else 'rejected' end;
  decided_actor := 'admin';
  return next;
end;
$function$;

comment on function public.decide_trip_completion(uuid, boolean, text) is
  'قرارُ المشرف في طلب إتمام. يفوّض الأهلية إلى trip_completion_gate(…, false) والأثرَ إلى approve_trip_completion — فلا نسخةَ ثانية من منطق الاكتمال. والرفض يستلزم سبباً مكتوباً.';

-- ----------------------------------------------------------------------------
-- (٥) ح‑١ — الدورة: تعتمد الصامتَ وحده، وتؤجّل ما فوقه بعدّادٍ مستقل
-- ----------------------------------------------------------------------------

drop function if exists public.settle_due_completions(integer);

create or replace function public.settle_due_completions(p_limit integer default 100)
returns table (scanned integer, approved integer, held integer, skipped integer)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_row     record;
  v_gate    record;
  v_scanned integer := 0;
  v_ok      integer := 0;
  v_held    integer := 0;
  v_skip    integer := 0;
  v_now     timestamptz := now();
begin
  if not public.dispatch_ops_allowed() then
    raise exception 'الاعتماد التلقائي متاح للمشرف أو لخادم الموقع فقط' using hint = 'forbidden';
  end if;

  -- دورتان متزامنتان: الثانية ترجع أصفاراً بهدوء بدل أن تعتمد مرتين
  if not pg_try_advisory_xact_lock(913019) then
    scanned := 0; approved := 0; held := 0; skipped := 0;
    return next;
    return;
  end if;

  -- ══ (أ) المؤجَّلون: يُعلَّلون ويُعدّون — ولا يستهلكون حصّة الاعتماد ══════
  --
  -- 🔴 ولماذا في مرورٍ مستقلٍّ قبل الحلقة: المانعان (رفضٌ إداري · تظلّم) قد
  --    يدومان أسابيع، والحلقةُ مرتَّبةٌ بـauto_approve_at تصاعدياً. فلو بقي
  --    المؤجَّلون فيها لاحتلّ أقدمُهم صدرَ الطابور **إلى الأبد** فجاعت الطلبات
  --    السليمة خلفهم — وهو بعينه نمطُ «الحدُّ قبل الترشيح» في (د‑٢) أدناه.
  with due as (
    select r.id, g.code, g.reason
    from public.trip_completion_requests r
    cross join lateral public.trip_completion_gate(r.id, true) g
    where r.status = 'pending'
      and r.auto_approve_at <= v_now
      and g.code in ('admin-rejected', 'grievance-open')
  ), marked as (
    update public.trip_completion_requests r
       set auto_hold_reason = d.reason,
           auto_hold_at     = v_now
      from due d
     where r.id = d.id
    returning 1
  )
  select count(*)::integer into v_held from marked;

  -- ══ (ب) والاعتماد على المستحقّ الصامت وحده ═════════════════════════════
  for v_row in
    select r.*
    from public.trip_completion_requests r
    where r.status = 'pending'
      and r.auto_approve_at <= v_now
      and not exists (
        select 1 from public.trip_completion_gate(r.id, true) g
        where g.code in ('admin-rejected', 'grievance-open')
      )
    order by r.auto_approve_at
    limit greatest(coalesce(p_limit, 100), 1)
    for update of r
  loop
    v_scanned := v_scanned + 1;

    -- القفل على الحجز قبل إعادة سؤال الأهلية: ما قُرئ قبل القفل تخمين
    perform 1 from public.bookings b where b.id = v_row.booking_id for update;
    select * into v_gate from public.trip_completion_gate(v_row.id, true);

    if v_gate.code is null then
      perform public.approve_trip_completion(
        v_row.id,
        'auto',
        'اعتماد تلقائي — مضت ' || v_row.approve_hours::text
          || ' ساعة على طلب المتعهد بلا قرارٍ من الإدارة',
        'اكتمال معتمَدٌ تلقائياً (النظام) — مضت ' || v_row.approve_hours::text
          || ' ساعة على طلب المتعهد بلا اعتراض'
      );
      v_ok := v_ok + 1;

    elsif v_gate.code in ('booking-missing', 'invalid-status') then
      -- الحجز تحرّك تحت الطلب (أُلغي · فشل · اعتُمد من مسارٍ آخر) ⇒ يُغلق الطلب
      -- ولا يُعتمد. و«تُخطّى» رقمٌ يُعرض لا صمتٌ.
      update public.trip_completion_requests r
         set status        = 'rejected',
             decided_at    = v_now,
             decided_actor = 'auto',
             decision_note = 'أُغلق تلقائياً — ' || v_gate.reason
       where r.id = v_row.id;
      v_skip := v_skip + 1;

    elsif v_gate.code in ('admin-rejected', 'grievance-open') then
      -- مانعٌ ظهر بين المرورين (تظلّمٌ قُدّم قبل ثانية) ⇒ يُعلَّل ويُعدّ مؤجَّلاً
      update public.trip_completion_requests r
         set auto_hold_reason = v_gate.reason,
             auto_hold_at     = v_now
       where r.id = v_row.id;
      v_held := v_held + 1;

    else
      -- قُرِّر من مسارٍ آخر بين القراءة والقفل — لا شيء يُفعل
      v_skip := v_skip + 1;
    end if;
  end loop;

  scanned  := v_scanned;
  approved := v_ok;
  held     := v_held;
  skipped  := v_skip;
  return next;
end;
$function$;

revoke all on function public.settle_due_completions(integer) from public, anon, authenticated;
grant execute on function public.settle_due_completions(integer) to service_role;

comment on function public.settle_due_completions(integer) is
  'دورةُ الاعتماد التلقائي. تعتمد صمتَ الإدارة وحده: طلبٌ يلي رفضاً إدارياً على الحجز نفسه، أو حجزٌ عليه تظلّمٌ مفتوح، يبقى pending ويُكتب سببُه في auto_hold_reason ويُعدّ في held — ولا يستهلك حصّة الدورة فيُجيع من خلفه. والاعتماد نفسه يقع في approve_trip_completion لا هنا.';

-- ----------------------------------------------------------------------------
-- (٦) ح‑٢ — مساحةُ الخصم الباقية عن **رحلةٍ** واحدة: مرجعٌ واحد لا صفٌّ لكل صفّ
-- ----------------------------------------------------------------------------
--
-- 🔒 لا تُمنح لدورٍ عام: `trip_due` هو **تكلفة المتعهد** عن الرحلة، وهي بعينها
--    ما بُني كل عزل المرحلة ٥ لحجبه عن `authenticated` (النمط ١ في LESSONS).

create or replace function public.trip_deduction_room(p_booking_id uuid)
returns table (trip_due numeric, deducted numeric, room numeric)
language sql
stable
security definer
set search_path = ''
as $function$
  with due as (
    select greatest(round(coalesce(
      (select d.assigned_payout  from public.dispatches d where d.booking_id = p_booking_id),
      (select w.payout_snapshot  from public.trip_withdrawals w
        where w.booking_id = p_booking_id and w.payout_snapshot is not null
        order by w.withdrawn_at desc, w.created_at desc
        limit 1),
      (select f.payout_snapshot  from public.booking_failures f where f.booking_id = p_booking_id),
      0), 2), 0) as v
  ), used as (
    select round(
      coalesce((select sum(w.deduct_amount) from public.trip_withdrawals w
                 where w.booking_id = p_booking_id and w.deduct_applied), 0)
    + coalesce((select f.deduct_amount from public.booking_failures f
                 where f.booking_id = p_booking_id and f.action_taken = 'deduct'), 0)
    , 2) as v
  )
  select due.v, used.v, greatest(round(due.v - used.v, 2), 0)
  from due, used;
$function$;

revoke all on function public.trip_deduction_room(uuid) from public, anon, authenticated;
grant execute on function public.trip_deduction_room(uuid) to service_role;

comment on function public.trip_deduction_room(uuid) is
  'مساحةُ الخصم الباقية عن رحلةٍ واحدة، تنفيذاً للبند ٨: سقفُ الخصم عن أي رحلة هو مستحقُّ تلك الرحلة نفسها. trip_due مرجعٌ واحد للحجز (إسنادٌ قائم ← أحدثُ لقطة اعتذار ← لقطة صفّ الفشل) فلا يتغيّر بتغيّر الصفّ المخصوم منه؛ وdeducted مجموعُ ما خُصم فعلاً من الطريقين معاً.';

-- ----------------------------------------------------------------------------
-- (٧) ح‑٢ — تنفيذُ خصم الاعتذار داخل مساحة الرحلة لا مساحة الصفّ
-- ----------------------------------------------------------------------------

create or replace function public.apply_withdrawal_deduction(
  p_withdrawal_id uuid,
  p_amount        numeric,
  p_note          text
)
returns numeric
language plpgsql
security definer
set search_path = ''
as $function$
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
$function$;

comment on function public.apply_withdrawal_deduction(uuid, numeric, text) is
  'تنفيذُ خصم الاعتذار. السقف سقفان معاً: مستحقُّ الواقعة المسجَّل في صفّها، ومساحةُ الرحلة الباقية من trip_deduction_room — فخمسُ دوراتِ اعتذارٍ على رحلةٍ واحدة لا تخصم إلا مستحقَّها مرةً واحدة. والتجاوز يُقصّ ويُكتب القصُّ في نصّ القيد، والمتبقّي الصفر يُرفض بخطأٍ مفهوم.';

-- ----------------------------------------------------------------------------
-- (٨) د‑٢ — انتهاءُ صلاحية النقاط: يُرشَّح أولاً ثم يُحدّ، والأقدمُ استحقاقاً أولاً
-- ----------------------------------------------------------------------------

create or replace function public.expire_loyalty_points(p_limit integer default 500)
returns table (accounts integer, points_expired integer)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_cfg    record;
  v_row    record;
  v_n      integer := 0;
  v_sum    integer := 0;
  v_months integer;
begin
  if not public.finance_admin_allowed() then
    raise exception 'تشغيل انتهاء صلاحية النقاط متاح للإدارة أو لخادم الموقع' using hint = 'forbidden';
  end if;

  select * into v_cfg from public.loyalty_config();
  select l.expire_months into v_months from public.loyalty_settings l limit 1;

  -- مطفأٌ أو بلا مهلة ⇒ صفران بهدوء، لا استثناء: مهمةٌ مجدولة لا تُحمِّر لأن
  -- المالك أطفأ مقبضاً
  if not v_cfg.enabled or coalesce(v_months, 0) <= 0 then
    accounts := 0; points_expired := 0;
    return next;
    return;
  end if;

  if not pg_try_advisory_xact_lock(913020) then
    accounts := 0; points_expired := 0;
    return next;
    return;
  end if;

  -- 🔴 الترتيبُ هو الإصلاح: كان `limit` يقع على **كل** حسابٍ برصيدٍ موجب
  --    مرتَّباً بـphone_norm، ثم يُسأل أيُّها هرم. فمن ترتيبُه بعد الـ٥٠٠ الأولى
  --    لا تنتهي نقاطه أبداً — والترتيبُ الأبجدي ثابتٌ فلا تتقدّم الدورة أبداً.
  --
  --    واليوم: (أ) مرشِّحٌ رخيص — شرطٌ **لازم** لا كافٍ: لا دفعةَ تهرم إن لم
  --    يوجد كسبٌ أقدمُ من المهلة، فيمتنع حسابُ الدفعات لكل حسابٍ في القاعدة.
  --            (ب) ثم الترشيح الحقيقي على الدفعات، (ج) ثم `limit` على
  --    **المستحقّين وحدهم**، (د) مرتَّبين **بالأقدم استحقاقاً** — فكلُّ دورةٍ
  --    تُخرج أقدمَ ما بقي، والطابور يتقدّم حتماً.
  for v_row in
    with candidate as (
      select a.phone_norm
      from public.loyalty_accounts a
      where a.points_balance > 0
        and exists (
          select 1 from public.loyalty_entries e
          where e.phone_norm  = a.phone_norm
            and e.points      > 0
            and e.direction   in ('earn', 'adjust')
            and e.occurred_at <= now() - make_interval(months => v_months)
        )
    ), due as (
      select c.phone_norm,
             (select coalesce(sum(l.remaining), 0)::integer
                from public.loyalty_lots(c.phone_norm) l
               where l.expires_at is not null and l.expires_at <= now()) as due,
             (select min(l.expires_at)
                from public.loyalty_lots(c.phone_norm) l
               where l.expires_at is not null and l.expires_at <= now()
                 and l.remaining > 0) as oldest
      from candidate c
    )
    select d.phone_norm, d.due
    from due d
    where d.due > 0
    order by d.oldest, d.phone_norm
    limit greatest(coalesce(p_limit, 500), 1)
  loop
    insert into public.loyalty_entries (
      phone_norm, direction, points, booking_id, note, created_by
    )
    values (
      v_row.phone_norm, 'expire', -v_row.due, null,
      'انتهاء صلاحية ' || v_row.due::text || ' نقطة — مضى عليها '
        || v_months::text || ' شهراً من تاريخ كسبها',
      null
    );

    v_n   := v_n + 1;
    v_sum := v_sum + v_row.due;
  end loop;

  update public.loyalty_settings set expiry_ran_at = now() where id;

  accounts       := v_n;
  points_expired := v_sum;
  return next;
end;
$function$;

comment on function public.expire_loyalty_points(integer) is
  'إطفاءُ النقاط الهرمة. يُرشَّح أولاً ثم يُحدّ: p_limit يقع على المستحقّين وحدهم مرتَّبين بالأقدم استحقاقاً — لا على كل حسابٍ برصيدٍ موجب بترتيبٍ أبجديّ ثابت، وهو ما كان يجعل مَن بعد الـ500 الأولى لا تنتهي نقاطه أبداً.';

-- ----------------------------------------------------------------------------
-- (٩) د‑١ — مُرسى الاحتفاظ: يكتبه قرارٌ، ولا يمحوه رجوعُ حالة
-- ----------------------------------------------------------------------------

alter table public.subcontractors
  add column if not exists relationship_ended_source text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.subcontractors'::regclass
      and conname  = 'subcontractors_rel_end_source_chk'
  ) then
    alter table public.subcontractors
      add constraint subcontractors_rel_end_source_chk
      check (relationship_ended_source is null
             or relationship_ended_source in ('suspension', 'terminated'));
  end if;
end;
$$;

comment on column public.subcontractors.relationship_ended_source is
  'مصدرُ مُرسى relationship_ended_at: suspension = ساعةُ الإيقاف (تُمحى بالخروج منه، فإيقافٌ مؤقت لا يُفقد صورة) · terminated = إنهاءٌ صريح بقرار، ولا يمحوه رجوعُ الحالة بحال. NULL = لا مُرسى.';

create or replace function public.subcontractors_relationship_clock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  -- 🔴 إنهاءٌ صريح: مُرسىً كتبه **قرار** لا حالة. ولا يمحوه رجوعُ الحالة —
  --    وهذا هو العيب الذي كان يترك صور سائقي شريكٍ «معتمد» مهجورٍ إلى الأبد:
  --    المُرسى كان مشتقاً من `status` وحدها فلا وجود له خارج `suspended`.
  if coalesce(new.relationship_ended_source, '') = 'terminated' then
    new.relationship_ended_at := coalesce(new.relationship_ended_at, now());
    return new;
  end if;

  if new.status = 'suspended' then
    -- أول دخولٍ في الإيقاف يبدأ الساعة، وإيقافٌ مستمر لا يعيد ضبطها
    if tg_op = 'INSERT' or coalesce(old.status, '') <> 'suspended' then
      new.relationship_ended_at     := coalesce(new.relationship_ended_at, now());
      new.relationship_ended_source := coalesce(new.relationship_ended_source, 'suspension');
    end if;
  else
    -- العودة إلى العمل تمحو **ساعةَ الإيقاف وحدها** ولا تمسّ إنهاءً صريحاً
    if coalesce(new.relationship_ended_source, 'suspension') = 'suspension' then
      new.relationship_ended_at     := null;
      new.relationship_ended_source := null;
    end if;
  end if;
  return new;
end;
$function$;

comment on function public.subcontractors_relationship_clock() is
  'ساعةُ مدّة الحفظ. suspension: تبدأ بالدخول في الإيقاف وتُمحى بالخروج منه. terminated: يكتبها end_partner_relationship ولا يمحوها رجوعُ الحالة. وstatus لا تحوي حالة «منتهية» — فالإنهاء قرارٌ مسجَّل لا حالةٌ رابعة.';

drop trigger if exists subcontractors_relationship_clock on public.subcontractors;
create trigger subcontractors_relationship_clock
  before insert or update on public.subcontractors
  for each row execute function public.subcontractors_relationship_clock();

-- ── ومن يكتب المُرسى: قرارٌ إداريّ مسمّى، لا `update` يدويّ يمحوه المُشغّل ──

create or replace function public.end_partner_relationship(
  p_sub   uuid,
  p_ended boolean default true,
  p_note  text default null
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_s      record;
  v_note   text;
  v_anchor timestamptz;
  v_now    timestamptz := now();
begin
  if not public.is_admin() then
    raise exception 'إنهاء علاقة الشريك متاح للمشرف وحده' using hint = 'forbidden';
  end if;

  v_note := nullif(btrim(coalesce(p_note, '')), '');
  if v_note is null then
    raise exception 'إنهاء العلاقة أو إعادتها يستلزم سبباً مكتوباً يبقى في السجل'
      using hint = 'note-required';
  end if;

  select s.* into v_s from public.subcontractors s where s.id = p_sub for update;
  if not found then
    raise exception 'الشريك غير موجود' using hint = 'not-found';
  end if;

  if coalesce(p_ended, true) then
    -- والحالةُ تتبع القرار: علاقةٌ انتهت وعروضٌ ما زالت تصل تناقضٌ (البند ١٥)
    update public.subcontractors s
       set status                    = 'suspended',
           relationship_ended_source = 'terminated',
           relationship_ended_at     = coalesce(s.relationship_ended_at, v_now)
     where s.id = p_sub;
  else
    -- إعادةُ العلاقة تمحو المُرسى صراحةً — والحالةُ تُرفع باعتمادٍ مستقل
    update public.subcontractors s
       set relationship_ended_source = null,
           relationship_ended_at     = null
     where s.id = p_sub;
  end if;

  -- والسببُ يبقى: صفُّ `audit_log` يلتقط قبل/بعد بحكم المُشغّل، وهذا يلتقط
  -- **النية** — عمليةٌ مسمّاة بسببها. ولا تنبيهَ من هنا: حدثٌ بلا سطرٍ في
  -- `lib/notifications/render.ts` يصل المالك باسمه الإنجليزي (أو يكسر الشاشة).
  perform public.record_audit_attempt(
    case when coalesce(p_ended, true) then 'partner_relationship_end'
         else 'partner_relationship_restore' end,
    'admin-decision', 'subcontractors', p_sub, v_note
  );

  select s.relationship_ended_at into v_anchor from public.subcontractors s where s.id = p_sub;
  return v_anchor;
end;
$function$;

revoke all on function public.end_partner_relationship(uuid, boolean, text) from public, anon;
grant execute on function public.end_partner_relationship(uuid, boolean, text) to authenticated, service_role;

comment on function public.end_partner_relationship(uuid, boolean, text) is
  'إنهاءُ علاقة الشريك (أو إعادتها) بقرار مشرفٍ مسبَّب. يكتب مُرسى الاحتفاظ بمصدر terminated فلا يمحوه رجوعُ الحالة، ويوقف الإسناد بجعل الحالة suspended تنفيذاً للبند ١٥. وهو المدخلُ الوحيد الذي يُنشئ مُرسىً لشريكٍ لم يُوقَف.';
