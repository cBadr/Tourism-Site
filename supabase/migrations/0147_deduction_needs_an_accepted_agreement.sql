-- ============================================================================
-- 0147_deduction_needs_an_accepted_agreement.sql
--
-- 🔴 العيب: **الخصمُ كان يقع بلا فحصِ اتفاقيةٍ ولا ختمِ إصدار.**
--
-- البند ٨ من اتفاقية المتعهدين المنشورة يقول حرفياً: «ولا يُنفَّذ خصمٌ إلا بعد
-- أن يكون المتعهد قد قَبِل نسخةً سارية… والخصمُ يُقاس بالنسخة التي كانت مقبولةً
-- منه وقت وقوع الواقعة». والمقيسُ على القاعدة الحيّة قبل هذه الهجرة:
--
--   • `prosrc ilike '%agreement%'` على `mark_booking_failed` و
--     `apply_withdrawal_deduction` و`record_partner_adjustment` و
--     `withdraw_from_trip` ⇒ **الأربعةُ `false`**.
--   • أعمدة `booking_failures` (١٥) و`trip_withdrawals` (١٨) ⇒ **بلا رقمِ
--     إصدارٍ وبلا بصمة**.
--
-- ⇒ خصمٌ يقع على متعهدٍ خارج الاتفاقية؛ **وبعد نشرِ الإصدار ٢ لا سبيلَ لإثبات
--   أيُّ نسخةٍ كانت سارية وقت الواقعة**. والبياناتُ الناقصةُ لا تُستدرَك بأثرٍ
--   رجعيّ — فالعلاجُ عاجلٌ بسببٍ يزول: ما دام المنشورُ إصداراً واحداً فلا واقعةَ
--   تضيع، ويومَ يصير اثنين يفوت الأوان.
--
-- ══════════════════════════════════════════════════════════════════════════
--  (١) أين يقع الحارس — وأين **لا** يقع، ولماذا
-- ══════════════════════════════════════════════════════════════════════════
--
-- | الدالة | حارس؟ | السبب |
-- |---|---|---|
-- | `mark_booking_failed` | ✅ عند `deduct` وحده | هي المدخلُ الأول الذي **ينفّذ** خصماً على واقعة. و«لا شيء» و«يُدفع» لا يمسّان المتعهد بسوء فلا يُمنعان |
-- | `apply_withdrawal_deduction` | ✅ دائماً | لا تفعل شيئاً غير تنفيذ خصم |
-- | `withdraw_from_trip` | ❌ | لا تنفّذ خصماً: تكتب `deduct_applied = false` و`ledger_effect = 'none'` — والاقتراحُ ليس تنفيذاً. وحارسٌ هنا كان **يحبس المتعهد في رحلة** لا يستطيع الاعتذار عنها، وهو ضررٌ عليه لا حمايةٌ له |
-- | `record_partner_adjustment` | ❌ | 🔴 هذه **حركةٌ محاسبيةٌ عامة** لا «خصمُ واقعة»: يستدعيها المساران أعلاه (فالحارسُ فيها ازدواج)، ويستدعيها المشرفُ لتصحيح خطأ وللقيدِ `earned` الذي **يزيد** مستحق المتعهد. وحارسٌ هنا يمنع المحاسبةَ السليمة — ويمنع أن نُنصف متعهداً لم يوقّع بعد |
--
-- والمُحكَّمُ هو `partner_agreement_ok(uuid)` نفسُه الذي يحرس `dispatch_pool`
-- و`accept_offer` — تفويضاً لا استنساخاً (القاعدة ١٢)، فلا يوجد في النظام
-- تعريفان لـ«متعهدٌ داخل الاتفاقية» ينحرف أحدهما عن الآخر.
--
-- ⚠ **وحدُّه معلَنٌ لا مخفيّ**: `partner_agreement_ok` تُرجع `true` كذلك في
--   **مهلة القبول** (‏`grace_days`، ١٤ يوماً افتراضاً) وقبل انقضائها، وحين
--   يُطفئ المالك الحاجزَ من اللوحة. فالخصمُ في تلك النافذة يمرّ على متعهدٍ لم
--   يقبل بعدُ نصّاً — **ويُكتب صفُّه بختمٍ فارغ**، وهو صدقٌ في السجل لا سترٌ
--   عليه. وتضييقُ الحارس إلى «قبولٌ فعليّ» قرارُ سياسةٍ للمالك لا قرارُ مهندس،
--   وهو مرفوعٌ إليه في تقرير هذه الدفعة.
--
-- ══════════════════════════════════════════════════════════════════════════
--  (٢) الختم — «النسخةُ المقبولة منه» لا «النسخةُ المنشورة»
-- ══════════════════════════════════════════════════════════════════════════
--
-- 🔴 والفرقُ جوهريّ: لو نُشر إصدارٌ ٢ ولم يقبله المتعهد بعدُ، فالساريةُ عليه
--    **هي ١** — وهي التي يُحتجّ بها. ولا واحدةٌ من الدالتين القائمتين تعطي هذا:
--
--   • `partner_agreement_current()` تعطي **المنشور** — لا علاقة له بقبوله.
--   • `partner_agreement_status(sub)` تُخرج `accepted_version`، لكنها تقيسه
--     **على الإصدار المنشور وحده**: من قَبِل ١ ونُشر ٢ ⇒ ‏`accepted = false`
--     و`accepted_version = null`. فهي تجيب «أهو ملتزمٌ بالمنشور؟» لا «أيُّ نسخةٍ
--     يُحتجّ بها عليه؟».
--
-- ⇒ فالنقصُ يُسدّ بدالةٍ واحدة `partner_accepted_agreement(sub)` تقرأ **آخر
--   قبولٍ سجّله هو**، ومنها يُملأ الختمُ ويُقرأ في البورتال — مصدرٌ واحد لرقمٍ
--   واحد (النمط ٨ في `LESSONS.md`).
--
-- والختمُ يُكتب **لحظةَ كتابة صفّ الواقعة**: في `mark_booking_failed` هي لحظةُ
-- الخصم نفسها، وفي `withdraw_from_trip` هي لحظةُ **الاعتذار** لا لحظةُ تنفيذ
-- الخصم بعده بأيام — لأن البند يقول «وقت وقوع الواقعة»، والواقعةُ هي الاعتذار.
--
-- ── والتوافقُ الرجعيّ ──────────────────────────────────────────────────────
--   العمودان **بلا `not null` وبلا افتراضيّ**: `null` تعني «قبل هذا النظام»
--   أو «لا نسخةَ كانت مقبولةً منه حينها»، لا «بلا اتفاقية». وكلُّ قارئٍ يحتمل
--   الفراغ. و`add column` بلا افتراضيّ لا يُعيد كتابة الجدول ولا يمسّ صفاً.
--
-- ── والمنحُ لا يُوسَّع ────────────────────────────────────────────────────────
--   الجدولان قائمان (‏`0051` و`0119`) ومنحُهما كما هو: `select` لـ`authenticated`
--   خلف RLS، ولا `truncate` لأحدٍ غير المالك. و`add column` لا يمسّ منحة.
--   والدالةُ الجديدة تُمنع عن `public` و`anon` و`authenticated` صراحةً (القاعدة ١٦):
--   هي `security definer` تقرأ قبولات **أي** متعهد، فمنحُها لـ`authenticated`
--   كشفٌ لمتعهدٍ عن متعهد (**D-20**).
--
--   و`portal_deductions` وحدها تُسقَط وتُعاد (تغيّر نوعُ إرجاعها)، فتُعاد منحُها
--   **حرفاً كما كانت**: `authenticated` و`service_role` ولا شيء غيرهما —
--   لأن `drop` يُعيد منحةَ Supabase الافتراضية لو تُرك الأمر (سابقتا `0139` و`0140`).
--
-- المرجع: supabase/migrations/0051_failed_trips.sql · 0113_partner_agreement.sql
--         · 0119_trip_closure.sql · 0130_manual_deduction_needs_written_reason.sql
--         · اختباره: supabase/tests/failed_trip_tests.sql القسم (ك)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (١) النسخةُ السارية **عليه هو** — آخرُ قبولٍ سجّله، منشوراً كان أو مؤرشفاً
-- ----------------------------------------------------------------------------
create or replace function public.partner_accepted_agreement(p_sub uuid)
returns table (
  agreement_id      uuid,
  agreement_version integer,
  doc_hash          text,
  accepted_at       timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select a.agreement_id, a.agreement_version, a.doc_hash, a.accepted_at
  from public.partner_agreement_acceptances a
  where a.subcontractor_id = p_sub
    and p_sub is not null
  -- الأحدثُ إصداراً هو الساري عليه؛ وعند تساوي الإصدار (لا يقع بحكم الفهرس
  -- الفريد) يُرجَّح الأحدثُ قبولاً
  order by a.agreement_version desc, a.accepted_at desc
  limit 1;
$$;

comment on function public.partner_accepted_agreement(uuid) is
  'النسخةُ التي يُحتجّ بها على هذا المتعهد: آخرُ إصدارٍ قَبِله هو — لا الإصدارُ المنشور. البند ٨ يقيس الخصم بها.';

revoke all on function public.partner_accepted_agreement(uuid) from public;
revoke all on function public.partner_accepted_agreement(uuid) from anon;
revoke all on function public.partner_accepted_agreement(uuid) from authenticated;
grant execute on function public.partner_accepted_agreement(uuid) to service_role;

-- ----------------------------------------------------------------------------
-- (٢) ختمُ الإصدار على صفِّ الواقعة — عمودان على الجدولين
-- ----------------------------------------------------------------------------
alter table public.booking_failures
  add column if not exists agreement_version  integer,
  add column if not exists agreement_doc_hash text;

alter table public.trip_withdrawals
  add column if not exists agreement_version  integer,
  add column if not exists agreement_doc_hash text;

comment on column public.booking_failures.agreement_version is
  'رقمُ نسخة الاتفاقية التي كانت مقبولةً من المتعهد لحظةَ الواقعة — `null` = قبل هذا النظام أو لا نسخةَ مقبولة حينها.';
comment on column public.booking_failures.agreement_doc_hash is
  'بصمةُ تلك النسخة كما وقّعها — بها يُثبَت النصُّ الذي يُحتجّ به ولو حُرِّر الإصدار لاحقاً.';
comment on column public.trip_withdrawals.agreement_version is
  'رقمُ نسخة الاتفاقية المقبولة من المتعهد لحظةَ **الاعتذار** (‏هو الواقعة) لا لحظةَ تنفيذ الخصم بعده.';
comment on column public.trip_withdrawals.agreement_doc_hash is
  'بصمةُ تلك النسخة كما وقّعها المتعهد.';

-- ----------------------------------------------------------------------------
-- (٣) والختمُ لا يُعدَّل بعد كتابته — يُضاف إلى قائمةِ التجميد في `trip_withdrawals`
--     (‏`booking_failures` مُلحَقٌ كلياً بمُشغّله فلا يحتاج شيئاً)
--
-- 🔴 ولولا هذا السطران لكان الختمُ **دليلاً قابلاً للتحرير**: حارسُ التجميد
--    قائمةُ منعٍ صريحة، وكلُّ عمودٍ جديد يولد **خارجها** أي قابلاً للتغيير
--    في مسار `update` الذي ينفّذ الخصم.
-- ----------------------------------------------------------------------------
create or replace function public.trip_withdrawals_freeze()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'سجل الاعتذارات مُلحَقٌ لا يُحذف منه' using hint = 'append-only';
  end if;

  if old.deduct_applied then
    raise exception 'خصم هذا الاعتذار مطبَّقٌ سلفاً — التصحيح حركةٌ في الدفتر لا تعديلٌ هنا'
      using hint = 'already-applied';
  end if;

  if new.booking_id       is distinct from old.booking_id
     or new.subcontractor_id is distinct from old.subcontractor_id
     or new.reason_id        is distinct from old.reason_id
     or new.reason_slug      is distinct from old.reason_slug
     or new.reason_label     is distinct from old.reason_label
     or new.default_action   is distinct from old.default_action
     or new.note             is distinct from old.note
     or new.payout_snapshot  is distinct from old.payout_snapshot
     or new.hours_to_pickup  is distinct from old.hours_to_pickup
     or new.routed           is distinct from old.routed
     or new.withdrawn_at     is distinct from old.withdrawn_at
     or new.created_by       is distinct from old.created_by
     or new.created_at       is distinct from old.created_at
     or new.id               is distinct from old.id
     -- 0147: ختمُ الاتفاقية دليلٌ لا حقلَ عمل
     or new.agreement_version  is distinct from old.agreement_version
     or new.agreement_doc_hash is distinct from old.agreement_doc_hash then
    raise exception 'لا يُعدَّل من سجل الاعتذار إلا تنفيذ الخصم المقترح'
      using hint = 'append-only';
  end if;

  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- (٤) `mark_booking_failed` — حارسٌ عند الخصم، وختمٌ على الصفّ
--     (‏التوقيع لم يتغيّر ⇒ `create or replace` بلا `drop` بلا فقدِ منحة)
-- ----------------------------------------------------------------------------
create or replace function public.mark_booking_failed(
  p_booking_id    uuid,
  p_reason_slug   text,
  p_action        text    default null,
  p_deduct_amount numeric default null,
  p_note          text    default null
)
returns table (
  booking_id      uuid,
  reference       text,
  reason_slug     text,
  action_taken    text,
  deduct_amount   numeric,
  ledger_effect   text,
  points_reversed integer
)
language plpgsql
security definer
set search_path = ''
as $$
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
  v_agr_ver  integer;  -- 0147: ختمُ الاتفاقية — نسخةُ المتعهد المقبولة
  v_agr_hash text;
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

  -- 0130: التطبيعُ في دالةٍ واحدة يقرؤها المساران والاختبار (القاعدة ١٢) —
  --   المسافاتُ الداخلية تُطوى والفراغُ يصير `null`، فلا يُشترى الحدُّ الأدنى
  --   بضغطِ مسطرةِ المسافة.
  v_note := public.deduction_reason_norm(p_note);
  -- ومبرِّرٌ من محرفٍ واحد ليس مبرراً. والحدُّ **ليس رقماً جديداً**: هو نفسه
  --   الذي يفرضه `file_grievance` على تظلّم المتعهد (عشرةُ أحرف) — وطرفا
  --   نزاعٍ واحد لا يُقاسان بمسطرتين.
  if v_note is not null and length(v_note) < public.deduction_reason_min_chars() then
    raise exception
      'المبرر المكتوب أقصر من الحدّ الأدنى (% حرفاً): «%» — السجل يُقرأ بعد شهور، ومن يقرؤه لا يملك سؤالك',
      public.deduction_reason_min_chars(), v_note
      using hint = 'override-note-required';
  end if;
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
    -- 0130 (١): 🔴 لا `coalesce(…, 0)` صامت في مسارِ مال. الغيابُ يُسمّى غياباً
    --   ويُرفض برسالته، ولا يُحوَّل إلى صفرٍ ثم يُرفض برسالةِ «غير موجب» —
    --   والفارقُ هو ما يقرؤه المدير: «اكتب الرقم» لا «رقمُك خطأ».
    v_amount := round(coalesce(p_deduct_amount, v_r.default_deduct_amount), 2);
    if v_amount is null then
      raise exception
        'الخصم يستلزم مبلغاً صريحاً موجباً — ولا قيمةَ افتراضية لسبب «%»، والخصمُ يدويٌّ في كل واقعة بقرار المالك',
        v_r.label
        using hint = 'deduct-amount-required';
    end if;
    if v_amount <= 0 then
      raise exception 'الخصم يستلزم مبلغاً موجباً' using hint = 'deduct-amount-required';
    end if;
    -- 0130 (٢): 🔴 البند ٨ من اتفاقية المتعهد المنشورة: «ولا تُقبل المخالفة إلا
    --   بمبرر مكتوب يُثبَّت في السجل ويُتاح للمتعهد». وما دامت `default_deduct_amount`
    --   فارغةً في الكتالوج كله بقرار المالك، **فكلُّ خصمٍ مخالفة** — فالمبرر
    --   واجبٌ في كل واقعة، لا عند مخالفةِ الإجراء وحدها.
    if v_note is null then
      raise exception
        'الخصم لا يقع بلا مبرر مكتوب — البند ٨ يشترط تثبيته في السجل وإتاحته للمتعهد، ولا قيمةَ افتراضية تُغني عنه'
        using hint = 'override-note-required';
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

  -- 0147 (١): 🔴 **البند ٨ — لا خصمَ على من هو خارج الاتفاقية.** والمُحكَّم هو
  --   `partner_agreement_ok` نفسُه الذي يحرس `dispatch_pool` و`accept_offer`
  --   (القاعدة ١٢): تعريفٌ واحد لا تعريفان ينحرفان. ولا يقع على «لا شيء» ولا
  --   على «يُدفع» — ذانك لا يمسّان المتعهد بسوء.
  if v_action = 'deduct' and not public.partner_agreement_ok(v_sub) then
    raise exception
      'لا يقع خصمٌ على متعهدٍ ليست له نسخةٌ سارية مقبولة من اتفاقية المتعهدين (البند ٨). اطلب منه فتح «الاتفاقية» في بوابته وقبولَ النسخة المنشورة ثم أعد المحاولة — أو راجع مهلة القبول في إعدادات الاتفاقية'
      using hint = 'agreement-not-accepted';
  end if;

  -- 0147 (٢): والختمُ يُقرأ من **قبوله هو** لا من الإصدار المنشور. ويُقرأ لكل
  --   واقعةٍ لها طرفٌ متعهد — لا للخصم وحده: الصفُّ سجلُّ واقعة، وقراءةُ نسختِه
  --   بعد سنة لا تنتظر أن يكون قد خُصم منه.
  if v_sub is not null then
    select ag.agreement_version, ag.doc_hash
      into v_agr_ver, v_agr_hash
    from public.partner_accepted_agreement(v_sub) ag;
  end if;

  -- 0119 (٣)(٤): 🔴 **السقف** — قرار المالك: لا رصيدَ سالب ولا تحصيلَ ديون.
  --   والحدّ مستحقُّ تلك الرحلة نفسها لا رقمٌ عام، فيُقرأ بعد سطر (د) لا قبله.
  --   ويُرفض ولا يُقصّ: القصُّ الصامت يترك المدير يظن أنه خصم ما كتب.
  --
  -- 0126 (١): 🔴 وسقفٌ ثانٍ كان غائباً — **متبقّي الرحلة** لا مستحقُّها وحده.
  --   والبند ٨ يسقّف «عن أي **رحلة**» لا عن كل واقعةٍ على حدة، و`trip_deduction_room`
  --   هي مصدرُ ذلك السقف للمسارين معاً (القاعدة ١٢).
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
      -- والمبرر يسافر مع القيد نفسه: من يراجع الدفتر لا يملك صفَّ الفشل أمامه
      'خصمٌ على رحلةٍ فاشلة — ' || v_r.label || ' — ' || coalesce(v_b.reference, '')
        || ' — ' || v_note
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
      subcontractor_id, payout_snapshot, ledger_effect, failed_at, created_by,
      agreement_version, agreement_doc_hash
    )
    values (
      p_booking_id, v_r.id, v_r.slug, v_r.label, v_r.default_action,
      v_action, v_amount, v_note, v_b.status,
      v_sub, v_payout, v_effect, v_now, public.current_actor(),
      v_agr_ver, v_agr_hash
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
$$;

-- ----------------------------------------------------------------------------
-- (٥) `withdraw_from_trip` — **ختمٌ بلا حارس**
--     لا تنفّذ خصماً (‏`deduct_applied = false` · `ledger_effect = 'none'`)،
--     وحارسٌ هنا يحبس المتعهد في رحلةٍ لا يستطيع الاعتذار عنها. والختمُ يُكتب
--     لحظةَ الاعتذار لأنها **الواقعة** التي يقيس البندُ ٨ الخصمَ بنسختها.
-- ----------------------------------------------------------------------------
create or replace function public.withdraw_from_trip(
  p_booking_id  uuid,
  p_reason_slug text,
  p_note        text default null
)
returns table (
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
as $$
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
  v_agr_ver  integer;  -- 0147: ختمُ الاتفاقية لحظةَ الاعتذار
  v_agr_hash text;
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

  -- 0147: النسخةُ المقبولة منه **الآن** — أي لحظةَ وقوع الاعتذار
  select ag.agreement_version, ag.doc_hash
    into v_agr_ver, v_agr_hash
  from public.partner_accepted_agreement(v_sub) ag;

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
    deduct_amount, deduct_applied, ledger_effect, withdrawn_at, created_by,
    agreement_version, agreement_doc_hash
  )
  values (
    p_booking_id, v_sub, v_r.id, v_r.slug, v_r.label,
    v_r.default_action, v_note, v_d.assigned_payout, v_hours, v_routed,
    v_amount, false, 'none', v_now, public.current_actor(),
    v_agr_ver, v_agr_hash
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
$$;

-- ----------------------------------------------------------------------------
-- (٦) `apply_withdrawal_deduction` — حارسُ الاتفاقية قبل أي حسابِ سقف
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
as $$
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
  --   تنفيذان متزامنان على اعتذارين من الرحلة نفسها كلاهما يقرأ «متبقٍّ كامل»
  --   فيخصمان ضعفَه. والترتيب `bookings ← trip_withdrawals` هو ترتيبُ
  --   `mark_booking_failed` نفسه — فلا تعانقَ أقفال بين المسارين.
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

  -- 0147: 🔴 البند ٨ — لا خصمَ على من هو خارج الاتفاقية. تفويضٌ إلى الحارس
  --   نفسه الذي يحرس `dispatch_pool` و`accept_offer` و`mark_booking_failed`.
  if not public.partner_agreement_ok(v_w.subcontractor_id) then
    raise exception
      'لا يقع خصمٌ على متعهدٍ ليست له نسخةٌ سارية مقبولة من اتفاقية المتعهدين (البند ٨). اطلب منه فتح «الاتفاقية» في بوابته وقبولَ النسخة المنشورة ثم أعد المحاولة — أو راجع مهلة القبول في إعدادات الاتفاقية'
      using hint = 'agreement-not-accepted';
  end if;

  -- 0130: نفسُ مسطرةِ `mark_booking_failed` حرفاً بحرف — دالةٌ واحدة تطبّع
  --   وأخرى تقول الحدَّ (القاعدة ١٢)، فلا ينحرف مسارٌ عن مسار.
  v_note := public.deduction_reason_norm(p_note);
  if v_note is null then
    raise exception
      'الخصم لا يقع بلا مبرر مكتوب — البند ٨ يشترط تثبيته في السجل وإتاحته للمتعهد'
      using hint = 'note-required';
  end if;
  if length(v_note) < public.deduction_reason_min_chars() then
    raise exception
      'المبرر المكتوب أقصر من الحدّ الأدنى (% حرفاً): «%» — السجل يُقرأ بعد شهور، ومن يقرؤه لا يملك سؤالك',
      public.deduction_reason_min_chars(), v_note
      using hint = 'note-required';
  end if;

  -- 0130 (١): 🔴 **مبلغٌ صريح** — ولا سقوطَ على اقتراحِ الصفّ. الاقتراحُ كُتب
  --   لحظةَ الاعتذار من الكتالوج، وتنفيذُ الخصم قرارٌ ماليٌّ لاحقٌ يقع بيدِ
  --   إنسان؛ فالسقوطُ عليه يعني مبلغاً لم يؤكّده أحدٌ لحظةَ تنفيذه.
  v_amt   := round(p_amount, 2);
  v_asked := v_amt;
  if v_amt is null then
    raise exception
      'تنفيذ الخصم يستلزم مبلغاً صريحاً — الاقتراحُ المسجَّل في صفّ الاعتذار لا يُنفَّذ بنفسه'
      using hint = 'invalid-input';
  end if;
  if v_amt <= 0 then
    raise exception 'مبلغ الخصم يجب أن يكون موجباً' using hint = 'invalid-input';
  end if;

  -- 🔴 سقفان يقعان معاً، وكلاهما من البند ٨ نفسه:
  --   (١) سقفُ **الواقعة**: مستحقُّ الرحلة وقتها، وهو المسجَّل في هذا الصفّ.
  --   (٢) وسقفُ **الرحلة**: مستحقُّها ناقصَ ما خُصم عنها فعلاً.
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

  -- 0130 (٢): والمبرر يُثبَّت **في الصفّ** لا في نصّ القيد وحده — فمنه يقرؤه
  --   المتعهد في بوابته (`portal_deductions`)، وإليه يصل سجلُّ التدقيق.
  -- ⚠ 0147: ولا يُمسّ ختمُ الاتفاقية هنا — هو نسخةُ **لحظة الاعتذار** لا لحظةِ
  --   التنفيذ، وحارسُ التجميد يمنع تغييره.
  update public.trip_withdrawals w
     set deduct_amount  = v_amt,
         deduct_applied = true,
         deduct_note    = v_note,
         ledger_effect  = 'deduct'
   where w.id = p_withdrawal_id;

  return v_amt;
end;
$$;

-- ----------------------------------------------------------------------------
-- (٧) والمتعهد يرى الختم — `portal_deductions` تُخرج رقمَ النسخة
--
-- 🔴 لماذا يُضاف: البندُ يَعِد بأن الاحتجاج يكون **بالنسخة التي كانت مقبولةً
--    منه**؛ ومن لا يعرف رقمَها لا يحتجّ بها. وسطحُ الخصومات هو **الوحيد** الذي
--    يرى فيه المتعهد بنداً بعينه (‏`portal_balance()` مجاميعُ، و`portal_trips()`
--    بلا قرار)، و`portal_agreement_history()` تقول ما وقّعه لا ما طُبِّق عليه.
--
-- ولا تُضاف **البصمة**: ٦٤ محرفاً لا يقرؤها إنسان، وهي في تاريخِ قبوله سلفاً
-- بكاشفِ المساس (`hash_matches`). فالرقمُ ما يُحتجّ به، والبصمةُ ما يُدقَّق بها.
--
-- ⚠ **وهذا نصفُ أنبوب** (النمط ٦ج): الطبقاتُ الثلاث للمستهلك البشري
--    (‏النوع ⇐ المحوِّل في `app/portal/trips/deductions.ts` ⇐ العارض في
--    `app/portal/trips/page.tsx`) **خارج ملفّات هذه الدفعة فلم تُحرَّر**، وهي
--    مرفوعةٌ في التقرير باسمها. فحتى تُوصَل: الحقلُ يخرج من القاعدة ولا يُعرض.
--
-- و`drop` ثم `create` لأن **نوع الإرجاع تغيّر** — ولا سبيل غيره. والمنحُ
-- يُعاد **حرفاً كما كان قبل الإسقاط**: `authenticated` و`service_role`، ولا
-- `anon` ولا `public` (‏`drop` يُعيد منحةَ Supabase الافتراضية — سابقتا `0139` و`0140`).
-- ----------------------------------------------------------------------------
drop function if exists public.portal_deductions(integer);

create function public.portal_deductions(p_limit integer default 20)
returns table (
  kind              text,
  booking_id        uuid,
  trip_code         text,
  reason_label      text,
  amount            numeric,
  currency          text,
  written_reason    text,
  applied_at        timestamptz,
  agreement_version integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select * from (
    -- (أ) خصمٌ على رحلةٍ عُلِّمت فاشلة
    select 'failure'::text,
           f.booking_id,
           public.partner_trip_code(f.booking_id),
           f.reason_label,
           f.deduct_amount,
           b.currency,
           f.override_note,
           f.failed_at,
           f.agreement_version
    from public.booking_failures f
    join public.bookings b on b.id = f.booking_id
    where f.subcontractor_id = public.current_subcontractor_id()
      and public.current_subcontractor_id() is not null
      and f.action_taken = 'deduct'

    union all

    -- (ب) خصمٌ نُفِّذ على اعتذارٍ بعد الإسناد
    select 'apology'::text,
           w.booking_id,
           public.partner_trip_code(w.booking_id),
           w.reason_label,
           w.deduct_amount,
           b.currency,
           w.deduct_note,
           w.withdrawn_at,
           w.agreement_version
    from public.trip_withdrawals w
    join public.bookings b on b.id = w.booking_id
    where w.subcontractor_id = public.current_subcontractor_id()
      and public.current_subcontractor_id() is not null
      and w.deduct_applied
  ) rows (kind, booking_id, trip_code, reason_label, amount, currency,
          written_reason, applied_at, agreement_version)
  order by applied_at desc
  limit least(greatest(coalesce(p_limit, 20), 1), 100);
$$;

comment on function public.portal_deductions(integer) is
  'خصومات صاحب الجلسة وحده — بالمبرر المكتوب ورقمِ نسخة الاتفاقية التي يُحتجّ بها (البند ٨). لا مرجعَ عميل ولا سعرَ رحلة ولا هامش (D-19).';

revoke all on function public.portal_deductions(integer) from public;
revoke all on function public.portal_deductions(integer) from anon;
grant execute on function public.portal_deductions(integer) to authenticated;
grant execute on function public.portal_deductions(integer) to service_role;
