-- ============================================================================
-- 0130_manual_deduction_needs_written_reason.sql
--   الخصمُ يدويٌّ دائماً — والمبررُ المكتوب صار إلزامياً في كل واقعة
--
-- كيف يُشغَّل: `pnpm db:migrate`
-- ومجموعتُه:  `pnpm db:test completion_apology`
--
-- ══════════════════════════════════════════════════════════════════════════
--  السند: قرارُ المالك + البند ٨ من اتفاقيةٍ **منشورةٍ ومقبولة**
-- ══════════════════════════════════════════════════════════════════════════
--
-- قرّر بدر (2026-08-18): «اتركها بلا مبلغ ويكون الخصم يدوياً في كل مرة» — أي أن
-- `failure_reasons.default_deduct_amount` تبقى `NULL` في الأسباب العشرة كلها
-- **بقصدٍ لا بعيب**. وهذا يخلق التزاماً تعاقدياً لا خياراً في العرض:
--
-- البند ٨ من `partner_agreement_versions` (الإصدار ١، منشورٌ 2026-08-18 04:54Z،
-- ومقبولٌ من حمزة الغمري) يقول حرفاً بحرف — قُرئ من القاعدة الحيّة لا من ذاكرة:
--
--   «يُحدَّد مبلغ الخصم من القيمة الافتراضية المقرَّرة لسبب الواقعة، وللمنصة أن
--    تخالفها في واقعةٍ بعينها زيادةً أو نقصاناً، **ولا تُقبل المخالفة إلا بمبرر
--    مكتوب يُثبَّت في السجل ويُتاح للمتعهد**.»
--
-- ⇒ وبلا قيمةٍ افتراضية **كلُّ خصمٍ مخالفة** ⇒ المبررُ المكتوب واجبٌ في **كل**
--   واقعة، لا عند مخالفةِ الإجراء الافتراضي وحدها كما كان قبل هذا الملف.
--
-- وللبند شقٌّ ثانٍ يقرأه هذا الملف أيضاً: «ولا يقع خصمٌ بلا واقعةٍ مصنَّفة
-- ومسجَّلة تحمل: السبب، والإجراء، **والمبلغ**، ولحظة التسجيل، ومن سجّلها،
-- ومستحقَّ الرحلة وقتها» — فالمبلغُ **صريحٌ** لا مشتقٌّ من صفرٍ صامت.
--
-- ══════════════════════════════════════════════════════════════════════════
--  ما كان قائماً قبل هذا الملف — مقيسٌ بـ`pg_get_functiondef` على القاعدة
--  الحيّة (‏**D-58**)، لا مقروءاً من ملفّ هجرة
-- ══════════════════════════════════════════════════════════════════════════
--
--  | المسار | المبلغ | المبرر |
--  |---|---|---|
--  | `mark_booking_failed` | `coalesce(p_deduct_amount, default, 0)` ثم `<= 0` يُرفض | **مطلوبٌ عند مخالفة الإجراء وحدها** — وخصمٌ يوافق الإجراء الافتراضي كان يمرّ بلا مبررٍ إطلاقاً |
--  | `apply_withdrawal_deduction` | `coalesce(p_amount, w.deduct_amount, 0)` ثم `<= 0` يُرفض | مطلوبٌ غيرَ فارغ — **بلا حدٍّ أدنى**، فـ«.» كانت تمرّ |
--  | `withdraw_from_trip` | يحسب **اقتراحاً** ولا ينفّذ خصماً | لا شأن له بالتنفيذ |
--
--  فالبندان اللذان كانا مكسورين فعلاً: **المبرر لا يُطلب في كل خصم**، و**المبرر
--  الموجود قد يكون محرفاً واحداً**. أمّا «صفرٌ صامت يمرّ» فلم يكن قائماً: 0124
--  و0126 أغلقتاه — والسقوط على الصفر كان يُرفض، لكن **برسالةِ العيب الخطأ**
--  («غير موجب») بدل «اكتب الرقم». وهذا الملف يسمّي الغياب غياباً.
--
-- ══════════════════════════════════════════════════════════════════════════
--  الحدُّ الأدنى = **عشرة أحرف** — ولماذا هذا الرقم بعينه
-- ══════════════════════════════════════════════════════════════════════════
--
-- لم يُخترع رقمٌ جديد. `file_grievance` تفرض على **تظلّم المتعهد** على الخصم:
-- `if v_body is null or length(v_body) < 10 … 'اكتب شرحاً لا يقلّ عن عشرة أحرف —
-- التظلّم المبهم لا يُبحث'`. والبند ٨ نفسه يمنح المتعهد حقَّ التظلّم على الخصم
-- خلال أربعة عشر يوماً. **فطرفا نزاعٍ واحد لا يُقاسان بمسطرتين**: ما دام
-- الاعتراضُ المبهم لا يُبحث، فالخصمُ المبهم لا يُنفَّذ. رقمٌ واحد، وسابقةٌ قائمة
-- في القاعدة، ولا عتبةٌ ثانية تنحرف عن الأولى (النمط ٨ في `LESSONS.md`).
--
-- وعشرةٌ تكفي للغرض المقصود: تُسقط «.» و«ok» و«تم» و«مخالفة» — ولا تبلغ حدَّ
-- إرهاقِ من يكتب واقعةً حقيقية.
--
-- ⚠ **والقياسُ بعد طيّ المسافات الداخلية**: `deduction_reason_norm` تحوّل كل
--   تتابعِ فراغٍ إلى مسافةٍ واحدة ثم تشذّب — وإلا اشتُري الحدُّ بعشر ضغطاتٍ على
--   مسطرة المسافة، فيصير الحارسُ **فحصاً لا يمكن أن يفشل** (النمط ٩).
--
-- ══════════════════════════════════════════════════════════════════════════
--  لماذا **بلا مفتاح** ولا معاملٍ متسامح — وأثرُه على الإنتاج مقيسٌ لا مظنون
-- ══════════════════════════════════════════════════════════════════════════
--
-- البريفُ خيّر بين معاملٍ بافتراضيٍّ متسامح ومفتاحٍ يُشعَل بعد نشر الكود. وكلاهما
-- عُدل عنه، وهذه أسبابُه الثلاثة مقيسةً:
--
--  (١) **المعاملُ موجودٌ سلفاً ويصلُه الكودُ المنشور.** `mark_booking_failed`
--      تحمل `p_note text DEFAULT NULL` منذ 0051، و`app/admin/orders/[id]/actions.ts`
--      **على عمولة الإنتاج `7b3d3ee` نفسها** تمرّر
--      `p_note: trimNote(text(formData, "failure_note"))`، والنموذجُ المنشور فيه
--      حقلُ «المبرر». فلا نداءَ قديم يصير مستحيلاً — يصير فقط النداءُ الذي تُرك
--      حقلُه فارغاً مرفوضاً، وهو المقصود.
--
--  (٢) **ولا صفَّ إنتاجٍ واحد يتأثر.** مقيسٌ لحظةَ كتابة هذا الملف:
--      `booking_failures` = **صفر صفوف** · `trip_withdrawals` = **صفر صفوف**.
--      فالمسارُ لم يُنفَّذ على الإنتاج قط، ولا صفَّ قائمٌ يُخالف القيدَ الجديد —
--      ولذلك القيدان أدناه `valid` لا `not valid`.
--
--  (٣) **ورمزُ الرفض مُترجَمٌ في الكود المنشور سلفاً.** الحالتان الجديدتان
--      ترفعان `hint = 'override-note-required'` — وهو مفتاحٌ قائمٌ في
--      `FAILED_HINTS` يقع على الرسالة `failnote`: «المبرر المكتوب إلزامي …
--      اكتب المبرر ثم أعد المحاولة». فنافذةُ ما بين تطبيقِ الهجرة ونشرِ الكود
--      **لا تُنتج رسالةً عامة**. ورمزٌ جديد كان سيسقط على `save` المبهمة.
--
-- 🔴 **وحارسٌ يُطفأ بمفتاحٍ ليس حارساً** حين يكون سنده بنداً في اتفاقيةٍ منشورةٍ
--    قَبِلها الطرف الآخر: الالتزامُ لا يقبل حالةَ «مطفأ». والاتجاهُ الآمن هنا
--    هو الرفض، وكلُّ نداءٍ معاملةٌ واحدة (**D-48**) فالرفضُ لا يترك نصفَ خصم.
--
-- ══════════════════════════════════════════════════════════════════════════
--  ما لا يُلمس هنا — عمداً
-- ══════════════════════════════════════════════════════════════════════════
--   • `apology_deduction_enabled` يبقى **`false`** كما تركه المالك. هذا الملف
--     يشدّ حارساً على مسارٍ مطفأ، ولا يشعله.
--   • `withdraw_from_trip` تبقى بتوقيعها وسلوكها: تحسب **اقتراحاً** ولا تنفّذ
--     خصماً، فلا مبرِّرَ يُطلب من المتعهد وهو يعتذر — المبررُ التزامُ المنصة لا
--     التزامُه هو.
--   • لا قيمةَ افتراضية تُبذَر ولا تُخمَّن في `failure_reasons`: فراغُها قرارُ
--     المالك، وهذا الملف يجعله **قابلاً للتنفيذ** لا يسدّه.
--   • لا صفَّ ترجمةٍ يُنشر، ولا `noindex` يُرفع، ولا مزوّدَ دفعٍ يُشغَّل.
--
-- المرجع: 0051 · 0119 · 0121 · 0124 · 0126 · البند ٨ من اتفاقية الشراكة
--         · D-05 · D-16 · D-19 · D-20 · D-48 · D-58
-- ============================================================================


-- ----------------------------------------------------------------------------
-- (٠) مسطرةٌ واحدة للمسارين — دالتان صغيرتان بدل شرطٍ منسوخ (القاعدة ١٢)
--
--     ولا تُقرأ العتبةُ من عمودٍ في جدول: هي **قيدُ نزاهةٍ تعاقدي** لا مقبضُ
--     تشغيل، ومقبضٌ في اللوحة يعني أن الالتزام يُخفَّض بحفظِ نموذج.
-- ----------------------------------------------------------------------------

create or replace function public.deduction_reason_min_chars()
returns integer
language sql
immutable
set search_path = ''
as $fn$
  -- عشرة — ولا رقمَ سواه: هو نفسه حدُّ `file_grievance` على تظلّم المتعهد،
  -- فطرفا النزاع الواحد بمسطرةٍ واحدة (انظر ترويسة هذا الملف).
  select 10;
$fn$;

create or replace function public.deduction_reason_norm(p_note text)
returns text
language sql
immutable
set search_path = ''
as $fn$
  -- تُطوى الفراغاتُ الداخلية ثم يُشذَّب الطرفان، ويُقصّ الطويل عند ألفٍ —
  -- والفارغُ يعود `null` كي يُميَّز «لم يُكتب» عن «كُتب فراغ».
  select nullif(btrim(left(regexp_replace(coalesce(p_note, ''), '\s+', ' ', 'g'), 1000)), '');
$fn$;

create or replace function public.deduction_reason_ok(p_note text)
returns boolean
language sql
immutable
set search_path = ''
as $fn$
  select public.deduction_reason_norm(p_note) is not null
     and length(public.deduction_reason_norm(p_note)) >= public.deduction_reason_min_chars();
$fn$;

comment on function public.deduction_reason_min_chars() is
  'الحدُّ الأدنى لطول مبرِّر الخصم = ١٠ أحرف. ليس رقماً جديداً: هو حدُّ file_grievance على تظلّم المتعهد على الخصم نفسه (البند ٨) — فطرفا النزاع بمسطرةٍ واحدة. ويُقاس بعد طيّ المسافات، وإلا اشتُري بعشر ضغطاتٍ على مسطرة المسافة.';
comment on function public.deduction_reason_norm(text) is
  'تطبيعُ مبرِّر الخصم: طيُّ الفراغات الداخلية، ثم التشذيب، ثم القصّ عند ألف محرف. والفارغُ يعود null كي يُميَّز «لم يُكتب» عن «كُتب فراغ».';
comment on function public.deduction_reason_ok(text) is
  'هل يصلح هذا النصّ مبرراً لخصم؟ مصدرُ الحكم الوحيد — تقرؤه الدالتان المنفِّذتان والقيدان على الجدولين والاختبار، فلا تنحرف مسطرةٌ عن مسطرة.';


-- ----------------------------------------------------------------------------
-- (١) المبررُ **يُثبَّت في الصفّ** — لا في نصّ القيد وحده
--
--     البند ٨ يشترط أن «يُثبَّت في السجل **ويُتاح للمتعهد**». ونصُّ القيد في
--     `ledger_entries` لا يبلغه: `portal_balance()` تُرجع مجاميعَ لا بنوداً،
--     والدفترُ محروسٌ بـ`is_admin()`. فالمبرر يُخزَّن في صفّ الواقعة نفسه، ومنه
--     يقرؤه المتعهد عبر `portal_deductions()` أدناه، وإليه يصل سجلُّ التدقيق
--     بمُشغّليه القائمين `audit_booking_failures` و`audit_trip_withdrawals`.
--
--     🔒 `booking_failures.override_note` قائمٌ سلفاً منذ 0051 — الناقصُ نظيرُه
--        على مسار الاعتذار.
--
--     ⚠ **ولماذا مُشغّلان لا قيدا `check`**: قيدُ `check` يستدعي دالةً هو نمطٌ لا
--       سابقةَ له في هذه القاعدة (صفرُ قيدٍ كهذا اليوم — مقيسٌ على `pg_constraint`)،
--       و`pg_dump` لا يتتبّع اعتمادَ تعبيرِ القيد على الدالة تتبّعاً موثوقاً،
--       فتُستعاد نسخةٌ احتياطية بجدولٍ يسبق دالتَه ⇒ **أداةُ الطوارئ تنكسر**
--       (`docs/BACKUP.md`). والمُشغّلُ يُدرَج في القسم اللاحق للاستعادة فيسلم؛
--       ويعطي فوق ذلك رسالةً عربيةً برمزٍ مفهوم بدل `23514` باسم قيد.
-- ----------------------------------------------------------------------------

alter table public.trip_withdrawals
  add column if not exists deduct_note text;

comment on column public.trip_withdrawals.deduct_note is
  'مبرِّر المنصة المكتوب لتنفيذ الخصم — إلزاميٌّ متى صار deduct_applied صحيحاً (البند ٨). ولا يُخلط بـnote: تلك ملاحظةُ المتعهد وهو يعتذر، وهذه مبرِّرُنا ونحن نخصم.';

create or replace function public.guard_failure_deduct_reason()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  -- يُطبَّع أولاً كي يُخزَّن ما يُقاس، لا نصٌّ يمرّ بمسطرةٍ ثم يُكتب بغيرها
  new.override_note := public.deduction_reason_norm(new.override_note);

  if new.action_taken = 'deduct'
     and not public.deduction_reason_ok(new.override_note) then
    raise exception
      'خصمٌ بلا مبرَّرٍ مكتوبٍ يبلغ % حرفاً — البند ٨: «ولا تُقبل المخالفة إلا بمبرر مكتوب يُثبَّت في السجل ويُتاح للمتعهد»',
      public.deduction_reason_min_chars()
      using hint = 'override-note-required';
  end if;

  return new;
end;
$fn$;

create or replace function public.guard_withdrawal_deduct_reason()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  new.deduct_note := public.deduction_reason_norm(new.deduct_note);

  if new.deduct_applied
     and not public.deduction_reason_ok(new.deduct_note) then
    raise exception
      'خصمٌ منفَّذٌ بلا مبرَّرٍ مكتوبٍ يبلغ % حرفاً — البند ٨ يشترط تثبيته في السجل وإتاحته للمتعهد',
      public.deduction_reason_min_chars()
      using hint = 'note-required';
  end if;

  return new;
end;
$fn$;

-- `booking_failures` مُلحَقٌ فقط (‏`booking_failures_append_only` يرفض UPDATE)،
-- فالإدراجُ وحده هو المدخل. أمّا `trip_withdrawals` فيُحدَّث مرةً واحدة لتنفيذ
-- الخصم، فالمُشغّل على الاثنين — والاسمُ أسبقُ أبجدياً من `trip_withdrawals_freeze`
-- فيقع قبله، وكلاهما `before` فلا فرق في النتيجة.
drop trigger if exists booking_failures_deduct_reason on public.booking_failures;
create trigger booking_failures_deduct_reason
  before insert on public.booking_failures
  for each row execute function public.guard_failure_deduct_reason();

drop trigger if exists trip_withdrawals_deduct_reason on public.trip_withdrawals;
create trigger trip_withdrawals_deduct_reason
  before insert or update on public.trip_withdrawals
  for each row execute function public.guard_withdrawal_deduct_reason();

revoke all on function public.guard_failure_deduct_reason() from public, anon, authenticated;
revoke all on function public.guard_withdrawal_deduct_reason() from public, anon, authenticated;

comment on function public.guard_failure_deduct_reason() is
  'حارسُ الصفّ: لا صفَّ فشلٍ إجراؤه deduct بلا مبرَّرٍ مكتوبٍ يبلغ الحدَّ الأدنى. مستقلٌّ عن حارس الدالة عمداً — فمن أدرج الصفَّ من خارج mark_booking_failed لا يفلت.';
comment on function public.guard_withdrawal_deduct_reason() is
  'حارسُ الصفّ: لا اعتذارَ deduct_applied بلا مبرَّرٍ مكتوبٍ يبلغ الحدَّ الأدنى، ويُطبَّع النصُّ قبل تخزينه فيُقاس ما يُخزَّن.';


-- ----------------------------------------------------------------------------
-- (٢) `mark_booking_failed` — النصُّ أدناه مأخوذٌ من `pg_get_functiondef` على
--     القاعدة الحيّة (‏D-58)، والمتغيّرُ فيه ثلاثةُ مواضع: تطبيعُ المبرر وحدُّه
--     الأدنى · مبلغٌ صريحٌ بلا `coalesce(…, 0)` ومبرِّرٌ واجبٌ مع كل خصم · ونصُّ
--     القيد يحمل المبرر.
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
$function$;


-- ----------------------------------------------------------------------------
-- (٣) `apply_withdrawal_deduction` — كذلك من `pg_get_functiondef` الحيّة، والمتغيّرُ
--     فيه موضعان: المبررُ بحدِّه الأدنى ومبلغٌ صريحٌ لا يسقط على اقتراح الصفّ ·
--     والمبررُ يُثبَّت في `deduct_note` فيقرؤه المتعهد.
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
  --   إنسان؛ فالسقوطُ عليه يعني مبلغاً لم يؤكّده أحدٌ لحظةَ تنفيذه. ولا
  --   `coalesce(…, 0)` هنا كذلك: الغيابُ يُسمّى غياباً.
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

  -- 0130 (٢): والمبرر يُثبَّت **في الصفّ** لا في نصّ القيد وحده — فمنه يقرؤه
  --   المتعهد في بوابته (`portal_deductions`)، وإليه يصل سجلُّ التدقيق
  --   (`audit_trip_withdrawals`)، وعليه يقوم الحارسُ `trip_withdrawals_deduct_reason`.
  update public.trip_withdrawals w
     set deduct_amount  = v_amt,
         deduct_applied = true,
         deduct_note    = v_note,
         ledger_effect  = 'deduct'
   where w.id = p_withdrawal_id;

  return v_amt;
end;
$function$;

-- ----------------------------------------------------------------------------
-- (٤) 🔴 «ويُتاح للمتعهد» — البند ٨ يشترطها، ولم يكن للمتعهد سطحٌ يقرأ منه
--
--     المقيس قبل هذا الملف: `portal_balance()` تُرجع **مجاميع** (‏earned ·
--     collected · paid · net_due) ولا بنوداً؛ و`portal_trips()` لا تحمل السبب
--     ولا الإجراء ولا المبلغ (وهذا مقصودٌ ومُختبَر في `failed_trip_tests`
--     (ط-١))؛ و`booking_failures` و`trip_withdrawals` **محجوبان عن
--     `authenticated`** (‏(ط-٢)). أي أن المتعهد كان يرى رصيداً ينقص ولا يعرف
--     عن أي رحلةٍ ولا لماذا.
--
--     فهذه الدالة هي «الإتاحة» المكتوبة في البند — **بنداً واحداً لكل واقعة**،
--     لا كشفَ حسابٍ كاملاً (ذاك بندٌ آخر من البند ٤ ولا يفتحه هذا الملف).
--
--     🔒 والعزلُ بنيويٌّ لا انضباطيّ (اتفاقيات §٧): النطاق مثبَّتٌ **داخلها**
--        بـ`current_subcontractor_id()` — **ولا وسيطَ هوية إطلاقاً**، فأولُ
--        وسيطٍ كهذا يحوّلها من دالةٍ مقصورة على صاحبها إلى تسريبٍ لكل متعهد عن
--        كل متعهد (سابقة **D-20**، ونفس قاعدة `portal_balance`).
--     🔒 وما لا يوجد في نوع الإرجاع لا يُسرَّب بخطأ في الواجهة: لا مرجعَ عميل
--        (‏`partner_trip_code` وحده)، ولا اسمَ عميل، ولا سعرَ الرحلة، ولا هامش،
--        ولا مستحقَّ متعهدٍ آخر (**D-19**).
-- ----------------------------------------------------------------------------

create or replace function public.portal_deductions(p_limit integer default 20)
returns table (
  kind          text,
  booking_id    uuid,
  trip_code     text,
  reason_label  text,
  amount        numeric,
  currency      text,
  written_reason text,
  applied_at    timestamptz
)
language sql
stable
security definer
set search_path = ''
as $fn$
  select * from (
    -- (أ) خصمٌ على رحلةٍ عُلِّمت فاشلة
    select 'failure'::text,
           f.booking_id,
           public.partner_trip_code(f.booking_id),
           f.reason_label,
           f.deduct_amount,
           b.currency,
           f.override_note,
           f.failed_at
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
           w.withdrawn_at
    from public.trip_withdrawals w
    join public.bookings b on b.id = w.booking_id
    where w.subcontractor_id = public.current_subcontractor_id()
      and public.current_subcontractor_id() is not null
      and w.deduct_applied
  ) rows (kind, booking_id, trip_code, reason_label, amount, currency, written_reason, applied_at)
  order by applied_at desc
  limit least(greatest(coalesce(p_limit, 20), 1), 100);
$fn$;

comment on function public.portal_deductions(integer) is
  'الخصومات الواقعة على المتعهد الحالي، ولكلٍّ منها مبرِّرها المكتوب — تنفيذُ «ويُتاح للمتعهد» في البند ٨. بلا وسيطِ هوية إطلاقاً (D-20)، وبلا مرجع العميل ولا سعره ولا هامش (D-19).';


-- ----------------------------------------------------------------------------
-- (٥) المنح — الأقلُّ صلاحية، و`anon` لا يرى شيئاً من هذا كله
-- ----------------------------------------------------------------------------

revoke all on function public.deduction_reason_min_chars() from public, anon;
grant execute on function public.deduction_reason_min_chars() to authenticated, service_role;

revoke all on function public.deduction_reason_norm(text) from public, anon;
grant execute on function public.deduction_reason_norm(text) to authenticated, service_role;

revoke all on function public.deduction_reason_ok(text) from public, anon;
grant execute on function public.deduction_reason_ok(text) to authenticated, service_role;

revoke all on function public.portal_deductions(integer) from public, anon;
grant execute on function public.portal_deductions(integer) to authenticated, service_role;

-- والمنفِّذتان: `create or replace` لا تمسّ المنح، لكن الأسطر تُعاد صراحةً كي
-- يُقرأ سطحُ الصلاحية من هذا الملف وحده — ولا يُترك لقارئه أن يفتح 0119 ليعرف
-- من ينادي دالةً تحرّك دفتراً.
revoke all on function public.mark_booking_failed(uuid, text, text, numeric, text) from public, anon;
grant execute on function public.mark_booking_failed(uuid, text, text, numeric, text)
  to authenticated, service_role;

revoke all on function public.apply_withdrawal_deduction(uuid, numeric, text) from public, anon;
grant execute on function public.apply_withdrawal_deduction(uuid, numeric, text)
  to authenticated, service_role;

comment on function public.mark_booking_failed(uuid, text, text, numeric, text) is
  'تعليمُ الرحلة فاشلة بسببٍ من الكتالوج وإجراءٍ مالي. 0130: الخصمُ لا يقع بلا مبلغٍ صريحٍ موجب ولا بلا مبرَّرٍ مكتوبٍ يبلغ deduction_reason_min_chars() — البند ٨: «ولا تُقبل المخالفة إلا بمبرر مكتوب يُثبَّت في السجل ويُتاح للمتعهد»، وبلا قيمةٍ افتراضية فكلُّ خصمٍ مخالفة.';
comment on function public.apply_withdrawal_deduction(uuid, numeric, text) is
  'تنفيذُ الخصم المقترح على اعتذارٍ بعد الإسناد — خلف مفتاح apology_deduction_enabled. 0130: مبلغٌ صريحٌ من المنفِّذ (لا سقوطَ على اقتراح الصفّ) ومبرَّرٌ مكتوبٌ يبلغ الحدَّ الأدنى، ويُثبَّت في deduct_note فيقرؤه المتعهد من portal_deductions.';


-- ----------------------------------------------------------------------------
-- (٦) شهادةُ الملف على نفسه — حارسٌ يُنزَع بلا أن يُلاحَظ ليس حارساً
--
--     تُقرأ الدالتان من `pg_get_functiondef` **بعد** تطبيق هذا الملف، فإن نُقض
--     أيٌّ من الشرطين لاحقاً بهجرةٍ تعيد كتابة الدالة من نصٍّ قديم، حمرّت هنا
--     لا بعد شهرين في تقرير تدقيق.
-- ----------------------------------------------------------------------------
do $$
declare
  v_def text;
begin
  v_def := pg_get_functiondef(
             to_regprocedure('public.mark_booking_failed(uuid,text,text,numeric,text)')::oid);
  if v_def like '%coalesce(p_deduct_amount, v_r.default_deduct_amount, 0)%' then
    raise exception '🔴 (0130-أ) mark_booking_failed ما زالت تُصفّر المبلغ الغائب بـcoalesce';
  end if;
  if v_def not like '%deduction_reason_min_chars()%' then
    raise exception '🔴 (0130-ب) mark_booking_failed بلا حدٍّ أدنى للمبرر';
  end if;
  if v_def not like '%البند ٨ يشترط تثبيته في السجل%' then
    raise exception '🔴 (0130-ج) mark_booking_failed لا تشترط مبرراً مع كل خصم';
  end if;

  v_def := pg_get_functiondef(
             to_regprocedure('public.apply_withdrawal_deduction(uuid,numeric,text)')::oid);
  if v_def like '%coalesce(p_amount, v_w.deduct_amount, 0)%' then
    raise exception '🔴 (0130-د) apply_withdrawal_deduction ما زالت تسقط على اقتراح الصفّ';
  end if;
  if v_def not like '%deduct_note    = v_note%' then
    raise exception '🔴 (0130-هـ) apply_withdrawal_deduction لا تُثبّت المبرر في الصفّ';
  end if;

  -- والحارسان على الصفّين قائمان — فمن أدرج الصفَّ من خارج الدالتين لا يفلت
  if not exists (
    select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
    where c.relname = 'booking_failures' and t.tgname = 'booking_failures_deduct_reason'
  ) then
    raise exception '🔴 (0130-ح) حارسُ صفّ الفشل غائب';
  end if;
  if not exists (
    select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
    where c.relname = 'trip_withdrawals' and t.tgname = 'trip_withdrawals_deduct_reason'
  ) then
    raise exception '🔴 (0130-ط) حارسُ صفّ الاعتذار غائب';
  end if;

  if public.deduction_reason_ok('.') or public.deduction_reason_ok('ok')
     or public.deduction_reason_ok('          ') or public.deduction_reason_ok(null) then
    raise exception '🔴 (0130-و) مسطرةُ المبرر تقبل ما لا يشرح شيئاً';
  end if;
  if not public.deduction_reason_ok('السائق لم يحضر') then
    raise exception '🔴 (0130-ز) مسطرةُ المبرر ترفض مبرراً مشروعاً — حاجزٌ على المشروع';
  end if;

  raise notice '✔ 0130: المبلغُ صريحٌ والمبررُ مكتوبٌ بحدٍّ أدنى % حرفاً، ويُثبَّت في الصفّ ويصل بوابةَ المتعهد',
    public.deduction_reason_min_chars();
end;
$$;
