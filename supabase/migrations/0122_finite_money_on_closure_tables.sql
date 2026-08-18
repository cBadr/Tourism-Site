-- ============================================================================
-- 0122 — «رقمٌ حقيقي» على أعمدة المال الخمسة التي وُلدت في 0119
--
-- ⚠ **رقمُ هذه الهجرة لم يُسنَد في بريف الجبهة ٢** (أُسند `0119` و`0121` وحدهما).
--    أُخذ `0122` لأن البوابة حمرّت على عيبٍ في `0119` نفسها، و**اتفاقية ٦ تمنع
--    تعديل ملفٍ مطبَّق** — فالتصحيح ترحيلٌ جديد لا حرفٌ في القديم. ومن يدمج
--    هذا العمل: تأكّد أن لا وكيلاً آخر أخذ `0122` قبل الكمّ.
--
-- ══════════════════════════════════════════════════════════════════════════
--  ومن أمسكه — وهذا هو الشاهد على أن الحارس يعمل
-- ══════════════════════════════════════════════════════════════════════════
--
-- ليس مراجعاً ولا قراءةً ثانية، بل **مجموعةُ اختبارٍ قائمة** (`0108` ⇐
-- `no_nan_money`) تمسح كل عمودٍ رقمي في `public` وتشترط له قيد «رقمٌ حقيقي».
-- فحمرّت على خمسةٍ وُلدت في `0119` بلا قيدها:
--
--   `failure_reasons.default_deduct_amount` · `trip_completion_requests.payout_snapshot`
--   `trip_withdrawals.payout_snapshot` · `trip_withdrawals.hours_to_pickup`
--   `trip_withdrawals.deduct_amount`
--
-- 🔴 **ولماذا يهمّ أصلاً:** `numeric` في Postgres يقبل `'NaN'`، و`NaN` يفسد كل
--    مقارنةٍ بعده صامتاً — `NaN > payout` تُنتج `false`، أي أن **سقف الخصم نفسه
--    يمرّ** على مبلغٍ ليس رقماً. فالقيد هنا حارسُ السقف لا زينة.
--
-- ملاحظة: `deduct_amount` عليها سلفاً `trip_withdrawals_deduct_chk` بمدىً
-- (`>= 0 and < 1e9`) وهو يستبعد `NaN` عملياً — لكن القيد الصريح يبقى **لأن
-- الحارس يقرأ الشكل لا النية**، ولأن تغيير المدى غداً لا يجوز أن يفتح الباب.
-- ============================================================================

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'failure_reasons_deduct_amount_finite_chk'
  ) then
    alter table public.failure_reasons
      add constraint failure_reasons_deduct_amount_finite_chk
      check (
        default_deduct_amount is null
        or (default_deduct_amount > '-Infinity'::numeric
            and default_deduct_amount < 'Infinity'::numeric)
      );
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'trip_completion_requests_payout_finite_chk'
  ) then
    alter table public.trip_completion_requests
      add constraint trip_completion_requests_payout_finite_chk
      check (
        payout_snapshot is null
        or (payout_snapshot > '-Infinity'::numeric and payout_snapshot < 'Infinity'::numeric)
      );
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'trip_withdrawals_payout_finite_chk'
  ) then
    alter table public.trip_withdrawals
      add constraint trip_withdrawals_payout_finite_chk
      check (
        payout_snapshot is null
        or (payout_snapshot > '-Infinity'::numeric and payout_snapshot < 'Infinity'::numeric)
      );
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'trip_withdrawals_hours_finite_chk'
  ) then
    alter table public.trip_withdrawals
      add constraint trip_withdrawals_hours_finite_chk
      check (
        hours_to_pickup is null
        or (hours_to_pickup > '-Infinity'::numeric and hours_to_pickup < 'Infinity'::numeric)
      );
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'trip_withdrawals_deduct_amount_finite_chk'
  ) then
    alter table public.trip_withdrawals
      add constraint trip_withdrawals_deduct_amount_finite_chk
      check (
        deduct_amount is null
        or (deduct_amount > '-Infinity'::numeric and deduct_amount < 'Infinity'::numeric)
      );
  end if;
end;
$$;
