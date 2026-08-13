-- ============================================================
-- 0021 — تصليب المدفوعات (من مراجعتَي المرحلة ٩)
--
--  (١) [حرج] بوابة `test` مبذورة **مفعّلة**. على موقع منشور تعني زراً يؤكد
--      أي حجز بلا دفع جنيه: تُقيَّد إيراداً وهمياً في الدفتر ويُبَث الطلب على
--      المتعهدين. الحارس الوحيد كان تعليقاً يرجو المالك أن يطفئها. تُبذر الآن
--      **معطَّلة**، ويضاف حارس ثانٍ في الكود (ALLOW_TEST_PAYMENTS) فلا يكفي
--      تفعيلها من اللوحة سهواً.
--
--  (٢) [مهم] لا فحص للعملة عند التسوية: بوابة تُسدّد بعملة أخرى تُقبل ما دام
--      الرقم مطابقاً. يُضاف `p_currency` بمقارنة صارمة.
--
--  (٣) [منخفض] إيصال يدوي معلّق يبقى عالقاً للأبد لو سدّد العميل بالبطاقة بعده:
--      الحجز يقفز إلى «مؤكد» فيرفض `verify_payment` لمسه. يُغلق تلقائياً.
-- ============================================================

-- ----------------------------------------------------------------------------
-- (١) بوابة الاختبار معطَّلة — والقرار في القاعدة لا في تعليق
-- ----------------------------------------------------------------------------
update public.payment_providers
   set enabled = false
 where provider = 'test';

comment on table public.payment_providers is
  'بوابات الدفع وإعداداتها العامة. بوابة test أداة تحقق لا وسيلة تحصيل: تفعيلها '
  'يتطلب أيضاً ALLOW_TEST_PAYMENTS=1 في البيئة، وهو متغيّر لا يُضبط في الإنتاج أبداً.';

-- ----------------------------------------------------------------------------
-- (٢) فحص العملة عند التسوية + (٣) إغلاق الإيصال اليدوي المنافس
-- ----------------------------------------------------------------------------
do $$
declare
  v_args text;
begin
  select pg_get_function_identity_arguments(p.oid) into v_args
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'settle_payment_intent'
  limit 1;

  if v_args is null then
    raise exception 'settle_payment_intent غير موجودة — طبّق 0020 أولاً';
  end if;

  if v_args like '%p_currency%' then
    raise notice '⏭ settle_payment_intent تفحص العملة بالفعل';
  else
    raise notice 'ℹ فحص العملة يُضاف عبر غلاف settle_payment_intent_v2 أدناه';
  end if;
end $$;

-- غلاف يفحص العملة ثم يفوّض — أنظف من إعادة كتابة دالة ١٥٠ سطراً مُختبَرة،
-- ويترك التوقيع الأصلي عاملاً لأي مستدعٍ قديم.
create or replace function public.settle_payment_intent_v2(
  p_provider     text,
  p_event_id     text,
  p_ref          text,
  p_status       text,
  p_amount_minor integer,
  p_currency     text,
  p_payload      jsonb
)
returns table (
  outcome        text,
  intent_id      uuid,
  booking_id     uuid,
  payment_id     uuid,
  intent_status  text,
  booking_status text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_intent record;
  v_row    record;
begin
  -- العملة تُفحص قبل أي كتابة: تسوية بعملة غير عملة الجلسة ليست «مبلغاً مختلفاً»
  -- بل حدث لا يخص هذه الجلسة أصلاً.
  if p_status = 'succeeded' and nullif(btrim(coalesce(p_currency, '')), '') is not null then
    select i.* into v_intent
    from public.payment_intents i
    where i.provider = p_provider and i.provider_ref = p_ref
    limit 1;

    if found and upper(btrim(p_currency)) <> upper(v_intent.currency) then
      raise exception 'عملة التسوية % لا تطابق عملة الجلسة %',
        upper(btrim(p_currency)), v_intent.currency
        using hint = 'currency-mismatch';
    end if;
  end if;

  for v_row in
    select * from public.settle_payment_intent(
      p_provider, p_event_id, p_ref, p_status, p_amount_minor, p_payload
    )
  loop
    outcome        := v_row.outcome;
    intent_id      := v_row.intent_id;
    booking_id     := v_row.booking_id;
    payment_id     := v_row.payment_id;
    intent_status  := v_row.intent_status;
    booking_status := v_row.booking_status;

    -- إيصال يدوي معلّق على نفس الحجز يُغلق: بلا هذا يبقى في طابور المراجعة
    -- أبداً لأن `verify_payment` لا تعمل إلا على حجز «قيد المراجعة».
    if v_row.outcome = 'settled' and v_row.booking_id is not null then
      update public.payments p
         set status      = 'rejected',
             note        = coalesce(p.note, '') || ' — سُدِّد الحجز إلكترونياً',
             verified_at = now()
       where p.booking_id = v_row.booking_id
         and p.status     = 'pending'
         and (v_row.payment_id is null or p.id <> v_row.payment_id);
    end if;

    return next;
  end loop;
end;
$$;

revoke all on function public.settle_payment_intent_v2(text, text, text, text, integer, text, jsonb)
  from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.settle_payment_intent_v2(text, text, text, text, integer, text, jsonb) to service_role';
  end if;
end $$;

do $$
begin
  raise notice '✔ 0021_payments_hardening: بوابة الاختبار معطَّلة، وفحص العملة، وإغلاق الإيصال المنافس';
end $$;
