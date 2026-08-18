-- ============================================================================
-- 0123 — أسماءُ قيود «رقمٌ حقيقي» تطابق ما يبحث عنه الحارس
--
-- ⚠ **رقمٌ غير مُسنَد كذلك** (كـ`0122`) — والسبب نفسه: البوابة حمرّت، واتفاقية ٦
--    تمنع تعديل ملفٍ مطبَّق. من يدمج: تأكّد من عدم تصادم الرقم قبل الكمّ.
--
-- ══════════════════════════════════════════════════════════════════════════
--  الدرس المدفوع هنا، ويستحق أن يُكتب
-- ══════════════════════════════════════════════════════════════════════════
--
-- أضافت `0122` القيود الخمسة **بأسماءٍ مختصرة** (`trip_withdrawals_payout_finite_chk`)
-- فبقيت البوابة حمراء على أربعةٍ منها. والسبب أن الحارس في `quote_conversion_tests`
-- **لا يقرأ تعريف القيد بل اسمه**:
--
--     k.conname = c.relname || '_' || a.attname || '_finite_chk'
--
-- أي أن الاسم **جزءٌ من العقد لا زينة**. وهذا اختيارٌ سليم من كاتبه: قراءة تعريف
-- كل قيدٍ ومطابقتها بنمطٍ نصّي كانت ستقبل قيداً يحمل الشكل ولا يحرس العمود
-- المقصود؛ والاسم الصريح يجعل التغطية **قابلة للعدّ** لا للتخمين.
--
-- ⇒ فالتصحيح `rename` لا `drop/add`: نفس القيود، بلا إعادة فحصٍ للجداول، وبلا
--   لحظةٍ واحدة تكون فيها الأعمدة بلا حارس.
-- ============================================================================

do $$
declare
  v_pair record;
begin
  for v_pair in
    select * from (values
      ('trip_withdrawals',         'trip_withdrawals_deduct_amount_finite_chk',
                                   'trip_withdrawals_deduct_amount_finite_chk'),
      ('failure_reasons',          'failure_reasons_deduct_amount_finite_chk',
                                   'failure_reasons_default_deduct_amount_finite_chk'),
      ('trip_completion_requests', 'trip_completion_requests_payout_finite_chk',
                                   'trip_completion_requests_payout_snapshot_finite_chk'),
      ('trip_withdrawals',         'trip_withdrawals_payout_finite_chk',
                                   'trip_withdrawals_payout_snapshot_finite_chk'),
      ('trip_withdrawals',         'trip_withdrawals_hours_finite_chk',
                                   'trip_withdrawals_hours_to_pickup_finite_chk')
    ) as t(tbl, old_name, new_name)
  loop
    -- قابلةٌ لإعادة التنفيذ: الاسم الجديد موجودٌ سلفاً ⇒ لا شيء يُفعل
    if exists (select 1 from pg_constraint where conname = v_pair.old_name)
       and not exists (select 1 from pg_constraint where conname = v_pair.new_name) then
      execute format(
        'alter table public.%I rename constraint %I to %I',
        v_pair.tbl, v_pair.old_name, v_pair.new_name
      );
    end if;
  end loop;
end;
$$;

-- والشاهدُ في الهجرة نفسها: لا يمرّ هذا الملف وقد بقي عمودٌ من الخمسة بلا حارس
-- **بالاسم الذي يقرؤه الحارس**. فالفحص هنا نسخةٌ من استعلام المجموعة حرفياً —
-- وموضعه هنا يجعل الخطأ يظهر لحظة الهجرة لا بعد جولة اختباراتٍ كاملة.
do $$
declare
  v_miss text;
begin
  select string_agg(t.tbl || '.' || t.col, ' · ') into v_miss
  from (
    select c.relname as tbl, a.attname as col
      from pg_attribute a
      join pg_class c on c.oid = a.attrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r'
       and c.relname in ('failure_reasons', 'trip_completion_requests', 'trip_withdrawals')
       and a.attnum > 0 and not a.attisdropped
       and a.atttypid = 'numeric'::regtype
       and not exists (
         select 1 from pg_constraint k
          where k.conrelid = c.oid
            and k.conname = c.relname || '_' || a.attname || '_finite_chk')
  ) t;

  if v_miss is not null then
    raise exception '0123: أعمدةٌ ما زالت بلا حارس بالاسم المتوقَّع: %', v_miss;
  end if;
end;
$$;
