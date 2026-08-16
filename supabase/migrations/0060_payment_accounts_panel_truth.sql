-- ============================================================================
-- 0060 — اللوحة وحدها تقرّر أي حساب يراه العميل
--
-- 🔴 **العطل الذي أنشأ هذه الهجرة كان في التطبيق لا في القاعدة.**
--    `payment_accounts_within_caps` (0025) ترشّح بـ `active and customer_facing`
--    وحدهما ولا تعرف النوع أصلاً — أُثبت حياً: تشغيل `customer_facing` على حسابٍ
--    `kind='bank'` يُظهره في مسار العميل فوراً. لكن إجراء اللوحة
--    (`app/admin/payment-accounts/actions.ts`) كان يقسر القيمة إلى `false` لكل
--    `cash`/`bank` قبل الكتابة، فخانةُ الاختيار تُحفظ «بنجاح» وتُخزَّن مقلوبة.
--    الإصلاح هناك — وهذه الهجرة تحمل ما لا يصحّ أن يعيش في TypeScript:
--
-- (١) **تضييق ما يصل المتصفح إلى قائمة بيضاء.** غلاف التوكن — الطريق الوحيد
--     الممنوح لـ `anon` — كان يحمل `daily_headroom` و`monthly_headroom` معه.
--     وهما رقما خزينة: فرقُ المتاح بين لحظتين هو ما استُقبل على الحساب بينهما،
--     أي إيرادُ المنصة اليومي مقروءاً من متصفحٍ يملك توكن حجزٍ واحد. الصفحة لا
--     تقرؤهما أصلاً، فالمنحة كانت بلا مستفيد وبمخاطرة كاملة. الغلاف الإداري
--     يحتفظ بهما (أشرطة الحدود في `/admin/payment-accounts` تقرؤهما).
--
-- (٢) **حساب تسوية البوابات يصير محجوباً بنيوياً لا بالانضباط.** الصف الذي
--     تشير إليه `payment_providers.account_id` وعاءُ خزينةٍ لا وجهةُ تحويل:
--     مقبضه المعرّف `GATEWAY-ONLINE` لا رقمٌ يُحوَّل إليه، وعرضُه على عميلٍ
--     تحويلٌ ضائع مؤكد. وبعد أن صار المفتاح حراً بحق (وهو المطلوب) لم يبقَ بين
--     العميل وبين ذلك الرقم إلا نقرةٌ ساهية في اللوحة. والحارس **مشتقٌّ من
--     البيانات لا من قائمة محفورة**: «مرتبطٌ بمزوّد دفع» شرطٌ يُقرأ من الجدول،
--     فيبقى صحيحاً لو تغيّر المقبض أو أُضيف وعاءُ بوابةٍ ثانٍ.
--     ويرفض ولا يقسر: القسر الصامت هو العيب الذي جاءت هذه الهجرة تصلحه.
--
-- ⚠ ما **لم** يُمسّ عمداً: شرط الحدود اليومية/الشهرية (يبقى في SQL كما في
--   المرحلة ٤)، وحارس `finance_admin_allowed()` على الغلاف الإداري (0025 البند
--   ١)، وشرط التوكن على غلاف الزائر (0009)، ولا صفَّ بيانات واحد.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (١) قائمة بيضاء لما يصل المتصفح
--
-- تغيير أعمدة الإرجاع يستلزم `drop` — `create or replace` يرفضه. والتوقيع
-- (‏`text, numeric`) لم يتغيّر، فكل منادٍ قائم يبقى على حاله ما لم يقرأ عموداً
-- من العمودين المسحوبين (ولا أحد يقرؤهما: الصفحة تسقط عليهما، والاختبارات
-- تقرأ المتاح من الغلاف الإداري وحده).
-- ----------------------------------------------------------------------------
drop function if exists public.available_payment_accounts(text, numeric);

create function public.available_payment_accounts(
  p_token  text,
  p_amount numeric
)
returns table (
  id          uuid,
  kind        text,
  label       text,
  handle      text,
  holder_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, a.kind, a.label, a.handle, a.holder_name
  from public.payment_accounts_within_caps(p_amount) a
  where exists (
    select 1
    from public.bookings b
    where p_token is not null
      and length(p_token) >= 32
      and b.public_token = p_token
      and b.status = 'pending_payment'
  );
$$;

comment on function public.available_payment_accounts(text, numeric) is
  'حسابات التحويل للعميل الضيف — مربوطة بتوكن حجز ما زال بانتظار الدفع (0009). '
  'الترتيب والترشيح من payment_accounts_within_caps: active و customer_facing و'
  'الحدود، بلا أي علاقة بالنوع — أي وعاء تختاره اللوحة يظهر. '
  '🔒 والإرجاع قائمة بيضاء منذ 0060: خمسة أعمدة يحتاجها العرض، وبلا أي رقم خزينة '
  '(المتاح اليومي/الشهري بقيا في الغلاف الإداري وحده لأن فرقهما = إيرادنا).';

-- الصلاحيات تُعاد كاملة: `drop` أسقط منح النسخة السابقة معها
revoke all    on function public.available_payment_accounts(text, numeric)
  from public, anon, authenticated;
grant execute on function public.available_payment_accounts(text, numeric) to anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.available_payment_accounts(text, numeric) to service_role';
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- (٢) الحارس البنيوي: وعاء تسوية بوابة لا يصير وجهة تحويل
--
-- الشرط مقروء من `payment_providers` لا من مقبض محفور — فلو أعاد المالك تسمية
-- الحساب أو أضاف وعاءً ثانياً لمزوّد آخر بقي الحارس على المعنى نفسه.
-- ورسالة الرفض تقول ما يفعله المالك الآن، ورمز SQLSTATE مخصص كي تترجمه اللوحة
-- إلى جملة عربية بعينها بدل «تعذّر الحفظ».
-- ----------------------------------------------------------------------------
create or replace function public.payment_accounts_block_gateway_exposure()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.customer_facing
     and exists (
       select 1 from public.payment_providers pp where pp.account_id = new.id
     )
  then
    raise exception
      'حساب تسوية بوابات الدفع لا يُعرض على العملاء: مقبضه معرّف داخلي لا رقم يُحوَّل إليه. لعرض وجهة تحويل جديدة أضف حساباً مستقلاً (محفظة أو انستا باي أو حساب بنكي) وفعّل «يظهر للعملاء» عليه.'
      using errcode = 'TR001';
  end if;
  return new;
end;
$$;

comment on function public.payment_accounts_block_gateway_exposure() is
  'يمنع أن يصير حسابُ تسوية مزوّد دفع وجهةَ تحويل أمام العميل (0060). '
  'الشرط مشتقٌّ من payment_providers.account_id لا من مقبض محفور.';

drop trigger if exists trg_payment_accounts_block_gateway_exposure on public.payment_accounts;
create trigger trg_payment_accounts_block_gateway_exposure
  before insert or update of customer_facing, id on public.payment_accounts
  for each row execute function public.payment_accounts_block_gateway_exposure();

-- ----------------------------------------------------------------------------
-- (٣) فحص ذاتي — سلوكيٌّ بنداء حيّ، لا مطابقةَ نصوص (القاعدة ١٩)
--
-- وكلّ ما يكتب صفاً يعيش داخل كتلةٍ فرعية تُلغى بنفسها: الفحص لا يترك أثراً
-- سواء نجح أو فشل.
-- ----------------------------------------------------------------------------
do $$
declare
  v_probe constant uuid := '00000000-0000-4000-8000-006000600060';
  v_gw    uuid;
  v_seen  boolean;
  v_fired boolean;
  v_names text[];
begin
  -- (٣-١) الشاهد الذي يحرس ما أُصلح: حساب **بنكي** معروض يظهر في مسار العميل،
  --       وإطفاء المفتاح يخفيه. لو عاد أي ترشيح بالنوع سقط هذا الفحص.
  begin
    insert into public.payment_accounts
      (id, kind, label, handle, holder_name, opening_balance, active, sort, customer_facing)
    values
      (v_probe, 'bank', 'MIG0060 فحص ذاتي', 'MIG0060-SELFCHECK', null, 0, true, 997, true);

    select exists (
      select 1 from public.payment_accounts_within_caps(0) c where c.id = v_probe
    ) into v_seen;
    if not v_seen then
      raise exception
        '0060: حساب بنكي مفعَّل و«يظهر للعملاء» غاب عن مسار العميل — عاد ترشيحٌ بالنوع إلى الطريق';
    end if;

    update public.payment_accounts set customer_facing = false where id = v_probe;
    select exists (
      select 1 from public.payment_accounts_within_caps(0) c where c.id = v_probe
    ) into v_seen;
    if v_seen then
      raise exception '0060: إطفاء «يظهر للعملاء» لم يُخفِ الحساب — المفتاح لا يُقرأ';
    end if;

    raise exception 'MIG0060_ROLLBACK';
  exception
    when others then
      if sqlerrm <> 'MIG0060_ROLLBACK' then raise; end if;
  end;

  -- (٣-٢) الحارس البنيوي يرفض فعلاً — بنداءٍ يُلغى، لا بقراءة تعريفه
  select pa.id into v_gw
  from public.payment_accounts pa
  where exists (select 1 from public.payment_providers pp where pp.account_id = pa.id)
  limit 1;

  if v_gw is null then
    raise notice '0060: لا حساب مرتبط بمزوّد دفع على هذه القاعدة — شاهد الحارس متخطٍّ';
  else
    begin
      update public.payment_accounts set customer_facing = true where id = v_gw;
      -- وصلنا هنا ⇒ الحارس لم يرفع شيئاً. نرفع نحن كي تُلغى الكتابة مع الكتلة.
      raise exception 'MIG0060_GUARD_MISSING';
    exception
      when others then
        v_fired := sqlerrm <> 'MIG0060_GUARD_MISSING';
    end;
    if not v_fired then
      raise exception
        '0060: حساب تسوية البوابات قَبِل «يظهر للعملاء» — الحارس البنيوي غائب أو لا يعمل';
    end if;
  end if;

  -- (٣-٣) القائمة البيضاء: لا عمود خزينة في طريق الزائر
  select coalesce(p.proargnames, '{}') into v_names
  from pg_proc p
  where p.oid = 'public.available_payment_accounts(text, numeric)'::regprocedure;

  if v_names && array['daily_headroom', 'monthly_headroom', 'opening_balance',
                      'daily_cap', 'monthly_cap', 'sort', 'active'] then
    raise exception '0060: طريق الزائر ما زال يحمل عمود خزينة — القائمة البيضاء مثقوبة';
  end if;
  if not (v_names @> array['id', 'kind', 'label', 'handle', 'holder_name']) then
    raise exception '0060: طريق الزائر فقد عموداً تحتاجه صفحة التحويل';
  end if;

  -- (٣-٤) وما كان قائماً يبقى: أشرطة الحدود في اللوحة تقرأ المتاح من الغلاف الإداري
  select coalesce(p.proargnames, '{}') into v_names
  from pg_proc p
  where p.oid = 'public.available_payment_accounts(numeric)'::regprocedure;
  if not (v_names @> array['daily_headroom', 'monthly_headroom']) then
    raise exception '0060: الغلاف الإداري فقد المتاح اليومي/الشهري — أشرطة /admin/payment-accounts تنكسر';
  end if;

  -- (٣-٥) المنح كما كانت: الزائر على غلاف التوكن وحده، ولا شيء له على الإداري
  if not has_function_privilege('anon', 'public.available_payment_accounts(text, numeric)', 'EXECUTE') then
    raise exception '0060: anon فقد EXECUTE على غلاف التوكن — صفحة التحويل تفرغ من كل حساب';
  end if;
  if has_function_privilege('anon', 'public.available_payment_accounts(numeric)', 'EXECUTE') then
    raise exception '0060: anon كسب EXECUTE على الغلاف الإداري — أرقام المحافظ والإيراد اليومي مكشوفة';
  end if;

  raise notice '✔ 0060: اللوحة تقرّر بالمفتاح لا بالنوع · طريق الزائر قائمة بيضاء · وعاء البوابات محجوب بنيوياً';
end $$;
