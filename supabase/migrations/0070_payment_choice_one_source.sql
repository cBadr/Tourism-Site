-- ============================================================================
-- 0070 — حسابٌ يراه العميل هو وحده حسابٌ يستطيع تسميته
--
-- ن‑٩ (أ) توحيد المصدر · ن‑٩ (ب-٢) عائلة الوعاء · ن‑٩ (ب-٤) الأرخص أولاً
--
-- ── ما بلّغ عنه بدر، وما وجدَه القياس ───────────────────────────────────────
--
-- بلاغه: «الحسابات البنكية مفعَّلة من اللوحة، وتظهر في شاشة رفع الإيصال ولا
-- تظهر في اختر الحساب الذي ستحوّل إليه» — أي **قائمتان مختلفتان لشيء واحد**.
--
-- والفرضية المكتوبة في الموجز كانت أن **الحدّ اليومي** هو المرشِّح. وقِيست
-- الدالتان بالمبلغ نفسه على حجزٍ حيّ (‏TR-E6V99E، مستحقّه ١٬٧٢٤) فسقطت:
--
--     payment_accounts_within_caps(1724)        ⇒ انستا باي · فودافون كاش · البنك العربي الإفريقي
--     available_payment_accounts(token, 1724)   ⇒ الثلاثة نفسها بالترتيب نفسه
--
-- وحدُّ البنك ١٬٠٠٠٬٠٠٠ — أوسع من المبلغ بستمئة ضعف. **فلا الحدود أسقطته، ولا
-- القائمتان اثنتان**: أصلح ن‑١ (‏`0066`) القراءةَ حين جعل شاشة الإيصال تشتقّ
-- خياراتها من القائمة نفسها، وأصلح سطرُ اللوحة (2026-08-16) القسرَ الصامت الذي
-- كان يردّ `customer_facing` إلى `false` على كل حسابٍ بنكي. والبنكان الباقيان
-- خارج الشاشة اليوم **بمفتاحهما في بيانات بدر** (‏`customer_facing = false`) —
-- لا بعيبٍ في كود.
--
-- ── 🔴 لكنّ القائمة الثالثة كانت قائمة، وفي أخطر موضع: الكتابة ────────────────
--
-- «شاشتان تعرضان قائمتين مختلفتين هي العيب، لا أيّهما أصحّ» — والعيب بهذا
-- التعريف **حيٌّ في `attach_receipt`**. مقيسٌ بنداءٍ حيّ داخل معاملة أُلغيت:
--
--     select public.attach_receipt(<توكن>, '<مسار>', '<حسابٌ customer_facing = false>')
--     ⇒ ✅ نجح — صفُّ تحصيلٍ بقيمة ١٬٥٠٠ على حسابٍ لا تعرضه الصفحة أصلاً
--
-- لأن حارسها كان يقرأ `pa.active` **وحده**. فالمعنى الذي تحكم به القراءة
-- (‏`active AND customer_facing`) غيرُ المعنى الذي تحكم به الكتابة (‏`active`) —
-- وهذا **تعريفان لشيء واحد**، وهو بعينه ما طُلب إنهاؤه.
--
-- وأثره ليس نظرياً: `p_account_id` يصل **من المتصفح**، وهو المُدخَل الوحيد
-- المسموح فيه (‏D-09 / عقد `lib/payment-fee-types.ts` §٦). فحاملُ توكنٍ يستطيع
-- تسمية **وعاء تسوية بوابات الدفع** أو خزنة المكتب، فيقع الإيصال — ثم القيدُ
-- عند الاعتماد — على وعاءٍ لا علاقة له بتحويله. أي **تلويثُ خزينة من متصفح**،
-- ولا اختبارٌ قائم يمسكه.
--
-- ── العلاج: تعريفٌ واحد تفوّض إليه القراءة والكتابة معاً ─────────────────────
--
--     payment_account_customer_visible(uuid)   ← 🔒 المعنى، في مكانٍ واحد
--              ├── payment_accounts_within_caps  (القراءة)
--              └── attach_receipt                (الكتابة)
--
-- وهذا هو شكل D-58 التنفيذي (القاعدة ١٢ في `handover/INDEX.md`): **تفويضٌ لا
-- استنساخ**. فيوم يتغيّر معنى «حسابٌ يراه العميل» يتغيّر في سطرٍ واحد، ولا
-- يمكن أن تنحرف عنه شاشة — لا لأن أحداً تذكّر، بل لأنه ليس هناك موضعٌ ثانٍ.
--
-- ⚠ **ولا قائمة أنواع في أي طبقة** — الحكم `active AND customer_facing` وحدهما،
--   كما أرست `0060` وأعاد تثبيته سطرُ اللوحة. وحسابُ البوابة يبقى محجوباً
--   بمُشغّله البنيوي لا بشرطٍ هنا.
--
-- ⚠ **والحدود لا تدخل حارس الكتابة عمداً.** الحدّ اليومي **تفضيلُ توجيه** لا
--   إذن: من حوّل فعلاً ثم امتلأ الحدُّ بين فتحه الصفحةَ ورفعه الإيصال يكون قد
--   دفع المال — ورفضُ إيصاله عقوبةٌ على تأخّرٍ دقائق، وأثرها أن يبدو التحويل
--   ضائعاً. فالحارس يمنع ما **لا يجوز أن يُسمّى**، لا ما امتلأ سقفه.
--
-- ── ومعه شقّان من إعادة التنظيم، لأنهما يمسّان الدالة نفسها ─────────────────
--
-- (ب-٢) **العائلة تُشتقّ في القاعدة**: عمودٌ `family` يعود مع كل صف، ونوعٌ
--       مجهولٌ يصير **عائلة نفسه** — فلا يمكن لتجميعٍ في الواجهة أن يُسقط
--       حساباً أضافه بدر بنوعٍ جديد. (الغياب هنا يعني **مالاً لا يصل**.)
-- (ب-٤) **الأرخص أولاً**: بعد ن‑١ صار لكل خيارٍ سعرٌ مختلف، فترتيبُ الشاشة
--       يصير مقارنةً. والتعادل يفكّه `sort` الذي رتّبه بدر — فبلا عمولاتٍ
--       مضبوطة (وهو حال القاعدة اليوم: الستة `none`) **لا يتغيّر ترتيبٌ واحد**.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (١) 🔒 التعريف الواحد — «حسابٌ يجوز للعميل أن يراه ويسمّيه»
--
-- `stable` لا `immutable`: يقرأ صفّاً قد يتغيّر. و`definer` لأن `payment_accounts`
-- لا قراءة عامة عليها إطلاقاً (سياسات `0007`)، وهذا هو سبب وجود الدالة أصلاً.
--
-- 🔒 **ولا تُمنح لأي دور مستخدم.** لا لأنها تسرّب — ترجع `boolean` لا حرفاً —
--    بل لأن مَن يستطيع سؤالها عن معرّفٍ يخمّنه يستطيع **تعداد** أي الحسابات
--    مفعَّلة. ومنادوها ثلاثةٌ `definer` تعمل بصلاحيات المالك، فلا تحتاج منحة.
-- ----------------------------------------------------------------------------
create or replace function public.payment_account_customer_visible(p_account_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.payment_accounts pa
    where pa.id = p_account_id
      and pa.active
      and pa.customer_facing
  );
$$;

comment on function public.payment_account_customer_visible(uuid) is
  '🔒 التعريف الوحيد لـ«حسابٌ يراه العميل ويجوز أن يسمّيه»: active AND customer_facing، '
  'بلا أي قائمة أنواع (0060). تفوّض إليه القراءة (payment_accounts_within_caps) '
  'والكتابة (attach_receipt) معاً — فلا تنحرف شاشةٌ عن أخرى (ن‑٩ أ). '
  'الحدود اليومية/الشهرية **ليست** منه: تفضيلُ توجيه لا إذن.';

revoke all on function public.payment_account_customer_visible(uuid)
  from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- (٢) عائلة الوعاء — تجميعُ الشاشة مشتقٌّ من البيانات لا من قائمةٍ في مكوّن
--
-- «محافظ · بنوك · بطاقة» بلسان بدر. والمهمّ ليس الأسماء بل **فرع `else`**:
-- نوعٌ لا نعرفه يصير عائلة نفسه، فيظهر في مجموعةٍ باسمه ولا يسقط من الشاشة.
-- (‏قائمةٌ بيضاء في الواجهة كانت ستُخفي حساباً أضافه بدر — أي مالاً لا يصل.)
--
-- `immutable`: تحويلُ نصٍّ إلى نصّ بلا قراءة جدول.
-- ----------------------------------------------------------------------------
create or replace function public.payment_account_family(p_kind text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case lower(btrim(coalesce(p_kind, '')))
    -- المحفظة وانستا باي عائلةٌ واحدة في عين من يدفع: تحويلٌ من تطبيقٍ على هاتفه
    when 'wallet'   then 'wallet'
    when 'instapay' then 'wallet'
    when 'bank'     then 'bank'
    when 'card'     then 'card'
    when 'cash'     then 'cash'
    -- 🔒 المجهول عائلةُ نفسه — والفراغ يصير 'other' كي لا يكون المفتاح فارغاً
    else coalesce(nullif(lower(btrim(coalesce(p_kind, ''))), ''), 'other')
  end;
$$;

comment on function public.payment_account_family(text) is
  'عائلة وعاء الدفع لتجميع شاشة التحويل (ن‑٩ ب-٢): المحفظة وانستا باي عائلة واحدة. '
  '🔒 والنوع المجهول يصير عائلة نفسه — فلا يُسقط التجميعُ حساباً من الشاشة أبداً.';

revoke all    on function public.payment_account_family(text) from public;
grant execute on function public.payment_account_family(text) to anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.payment_account_family(text) to service_role';
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- (٣) القراءة تفوّض إلى التعريف الواحد
--
-- الجسم منقولٌ من `pg_get_functiondef` الحيّ (D-58) — والفرق عنه **سطرٌ واحد**:
-- `pa.active and pa.customer_facing` ⇐ `public.payment_account_customer_visible(pa.id)`.
-- ولا شيء غيره: نافذتا اليوم والشهر وترتيبُ `sort` والحدود كما هي حرفاً بحرف.
-- ----------------------------------------------------------------------------
create or replace function public.payment_accounts_within_caps(p_amount numeric)
returns table (
  id               uuid,
  kind             text,
  label            text,
  handle           text,
  holder_name      text,
  daily_headroom   numeric,
  monthly_headroom numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  with args as (
    select greatest(coalesce(p_amount, 0), 0) as amount
  ),
  used as (
    select
      pa.id as account_id,
      coalesce(sum(p.amount) filter (
        where (p.created_at at time zone 'Africa/Cairo')::date
            = (now() at time zone 'Africa/Cairo')::date
      ), 0) as used_today,
      coalesce(sum(p.amount) filter (
        where date_trunc('month', p.created_at at time zone 'Africa/Cairo')
            = date_trunc('month', now() at time zone 'Africa/Cairo')
      ), 0) as used_month
    from public.payment_accounts pa
    left join public.payments p
      on p.account_id = pa.id
     and p.status = 'approved'
    group by pa.id
  )
  select
    pa.id,
    pa.kind,
    pa.label,
    pa.handle,
    pa.holder_name,
    case when pa.daily_cap   is null then null else pa.daily_cap   - u.used_today end,
    case when pa.monthly_cap is null then null else pa.monthly_cap - u.used_month end
  from public.payment_accounts pa
  join used u on u.account_id = pa.id
  cross join args a
  -- 🔒 ن‑٩: المعنى في دالةٍ واحدة تفوّض إليها الكتابة كذلك — لا شرطٌ مكرَّر هنا
  where public.payment_account_customer_visible(pa.id)
    and (pa.daily_cap   is null or u.used_today + a.amount <= pa.daily_cap)
    and (pa.monthly_cap is null or u.used_month + a.amount <= pa.monthly_cap)
  order by pa.sort asc, pa.label asc;
$$;

comment on function public.payment_accounts_within_caps(numeric) is
  'الحسابات التي يراها العميل ويتسع حدّها للمبلغ. الظهور مفوَّضٌ إلى '
  'payment_account_customer_visible (ن‑٩ أ) — والحدّان وحدهما يُحسبان هنا.';

-- ----------------------------------------------------------------------------
-- (٤) 🔴 والكتابة تفوّض إليه أيضاً — القائمة الثالثة تُغلق
--
-- الجسم منقولٌ من `pg_get_functiondef` الحيّ (D-58)، والفرق عنه **حارسُ الحساب
-- وحده**: `pa.active` ⇐ التعريف الواحد. وبقي موضعه كما هو — **قبل** حساب
-- المبلغ — لأن حساباً خاطئاً يجب أن يُرفض قبل أن يُبنى عليه رقم (‏`0066` §٨).
--
-- والرمز `account-unavailable` **هو نفسه** الذي كان يرفعه الحارس الأضيق،
-- فمسارُ `/api/booking/receipt` يترجمه إلى جملته العربية بلا حرفٍ يتغيّر فيه.
-- ----------------------------------------------------------------------------
create or replace function public.attach_receipt(
  p_token      text,
  p_path       text,
  p_account_id uuid,
  p_amount     numeric
)
returns table (payment_id uuid, reference text, status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking record;
  v_path    text;
  v_amount  numeric;
  v_payment uuid;
begin
  v_path := nullif(btrim(coalesce(p_path, '')), '');
  if v_path is null then
    raise exception 'مسار الإيصال مطلوب' using hint = 'invalid-input';
  end if;
  if p_token is null or length(p_token) < 32 then
    raise exception 'رابط المتابعة غير صالح' using hint = 'booking-not-found';
  end if;

  select b.* into v_booking
  from public.bookings b
  where b.public_token = p_token
  for update;

  if not found then
    raise exception 'لا يوجد حجز بهذا الرابط' using hint = 'booking-not-found';
  end if;

  if v_booking.status <> 'pending_payment' then
    raise exception 'لا يمكن رفع إيصال والحجز في حالة «%»', v_booking.status
      using hint = 'invalid-status';
  end if;

  -- 🔒 ن‑٩: **ما لا يُعرض لا يُسمّى.** الحارس كان `pa.active` وحده، فكان حاملُ
  --    التوكن يسمّي وعاء تسوية البوابات أو خزنة المكتب — فيقع الإيصال ثم القيدُ
  --    عند الاعتماد على وعاءٍ لا علاقة له بتحويله (مقيسٌ حياً قبل هذه الهجرة).
  if p_account_id is not null
     and not public.payment_account_customer_visible(p_account_id) then
    raise exception 'حساب الاستقبال غير معروض للعميل أو غير مفعّل'
      using hint = 'account-unavailable';
  end if;

  -- 🔒 د٢ — قيمة الإيصال تُثبَّت من الحجز: المستحق **زائد عمولة الحساب المجمَّدة**
  --    (0066). المشرف وحده يستطيع تجاوزها بمبلغ صريح.
  if public.is_admin() and p_amount is not null then
    v_amount := round(p_amount, 2);
  else
    v_amount := round(
      coalesce(v_booking.amount_due, 0)
      + public.booking_payment_fee(v_booking.trip, p_account_id),
      2
    );
  end if;

  if v_amount is null or v_amount <= 0 then
    raise exception 'قيمة التحويل يجب أن تكون أكبر من صفر' using hint = 'invalid-input';
  end if;

  insert into public.payments as p (booking_id, account_id, amount, receipt_path, status)
  values (v_booking.id, p_account_id, v_amount, v_path, 'pending')
  returning p.id into v_payment;

  perform set_config('tours.booking_note', 'رفع إيصال التحويل', true);
  update public.bookings b
     set status = 'under_review'
   where b.id = v_booking.id;

  payment_id := v_payment;
  reference  := v_booking.reference;
  status     := 'under_review';
  return next;
end;
$$;

comment on function public.attach_receipt(text, text, uuid, numeric) is
  'رفع إيصال التحويل للضيف. المبلغ من الحجز + العمولة المجمَّدة لا من المتصفح (D-09/0066). '
  '🔒 وحسابُ الاستقبال مفوَّضٌ إلى payment_account_customer_visible (ن‑٩ أ): ما لا تعرضه '
  'الصفحة لا يقبله الإيصال — وإلا سُجّل تحصيلٌ على وعاء خزينة يسمّيه المتصفح.';

-- ----------------------------------------------------------------------------
-- (٥) طريق العميل — عائلةٌ في الإرجاع، وترتيبٌ بالأرخص
--
-- تغيير أعمدة الإرجاع يستلزم `drop` (‏`create or replace` يرفضه)، والمنح تُعاد
-- بعده لأن `drop` أسقطها — كما فعلت `0060` ثم `0066` حرفياً.
--
-- ⚠ **والقائمة البيضاء التي أرستها `0060` تبقى**: `family` ليس رقم خزينة ولا
--   حدّاً — إنه اشتقاقٌ من `kind` الذي يعود سلفاً في نفس الصف. والفحص الذاتي
--   أدناه يعيد إثبات أن العمود التاسع لم يفتح باباً.
--
-- ⚠ **والترتيب:** الأرخص أولاً ثم `sort` الذي رتّبه بدر. والتعادلُ هو الحال
--   الافتراضي (كل العمولات `none` اليوم)، فالشاشة لا تتغيّر بحرف حتى يضبط بدر
--   عمولةً — وحينها وحدها تصير قائمةً مرتَّبةً بالثمن، وهو نصّ قراره.
-- ----------------------------------------------------------------------------
drop function if exists public.available_payment_accounts(text, numeric);

create function public.available_payment_accounts(
  p_token  text,
  p_amount numeric
)
returns table (
  id                  uuid,
  kind                text,
  family              text,
  label               text,
  handle              text,
  holder_name         text,
  fee                 numeric,
  amount_due_with_fee numeric,
  total_with_fee      numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    a.id,
    a.kind,
    public.payment_account_family(a.kind),
    a.label,
    a.handle,
    a.holder_name,
    f.fee,
    round(coalesce(b.amount_due, 0) + f.fee, 2),
    round(coalesce(b.total, 0)      + f.fee, 2)
  from public.bookings b
  cross join public.payment_accounts_within_caps(p_amount) with ordinality as a
  cross join lateral (
    select public.booking_payment_fee(b.trip, a.id) as fee
  ) f
  where p_token is not null
    and length(p_token) >= 32
    and b.public_token = p_token
    and b.status = 'pending_payment'
  -- ن‑٩ (ب-٤): **المطلوب تحويله الآن** أولاً — أي المقارنة التي تصنعها ن‑١.
  -- والتعادل يفكّه ترتيب بدر (‏`ordinality` = `sort` ثم `label`)، فالشاشة بلا
  -- عمولاتٍ مضبوطة تبقى كما رتّبها هو حرفاً بحرف.
  order by round(coalesce(b.amount_due, 0) + f.fee, 2) asc, a.ordinality asc;
$$;

comment on function public.available_payment_accounts(text, numeric) is
  'حسابات التحويل للعميل الضيف — مربوطة بتوكن حجز ما زال بانتظار الدفع (0009). '
  'الترشيح من payment_accounts_within_caps، ومعناه في payment_account_customer_visible (ن‑٩ أ). '
  '🔒 والإرجاع قائمة بيضاء: ستة أعمدة عرضٍ (منها family المشتقّة من kind لتجميع الشاشة) '
  '+ ثلاثة أرقام فاتورةٍ يراها العميل قبل التحويل، وبلا أي رقم خزينة. '
  'والترتيب بالأرخص أولاً ثم بترتيب اللوحة (ن‑٩ ب-٤).';

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
-- (٦) الفحص الذاتي — **بنداءٍ حيّ لا بمطابقة نصّ** (القاعدة ١٩)
--
-- وكلّه داخل كتلةٍ تُلغى: لا صفَّ بيانات لبدر يُمسّ.
-- ----------------------------------------------------------------------------
do $$
declare
  v_names   text[];
  v_hidden  constant uuid := '7a000000-0000-4000-8000-00000000070a';
  v_visible constant uuid := '7a000000-0000-4000-8000-00000000070b';
  v_token   text;
  v_caught  boolean := false;
  v_hint    text;
begin
  -- (٦-١) الأعمدة: العائلة دخلت، ولا رقم خزينة دخل معها
  select coalesce(p.proargnames, '{}') into v_names
  from pg_proc p
  where p.oid = 'public.available_payment_accounts(text, numeric)'::regprocedure;

  if v_names && array['daily_headroom', 'monthly_headroom', 'opening_balance',
                      'daily_cap', 'monthly_cap', 'sort', 'active'] then
    raise exception '0070: طريق الزائر عاد يحمل عمود خزينة — القائمة البيضاء مثقوبة';
  end if;
  if not (v_names @> array['id', 'kind', 'family', 'label', 'handle', 'holder_name',
                           'fee', 'amount_due_with_fee', 'total_with_fee']) then
    raise exception '0070: طريق الزائر ينقصه عمود تحتاجه صفحة التحويل';
  end if;

  -- (٦-٢) العائلة: النوعان المعروفان يجتمعان، والمجهول **لا يسقط**
  if public.payment_account_family('wallet') <> public.payment_account_family('instapay') then
    raise exception '0070: المحفظة وانستا باي في عائلتين — التجميع يفرّق ما يجمعه العميل';
  end if;
  if public.payment_account_family('bank') = public.payment_account_family('wallet') then
    raise exception '0070: البنك والمحفظة عائلة واحدة — التجميع بلا معنى';
  end if;
  if coalesce(public.payment_account_family('نوعٌ لم يولد بعد'), '') = '' then
    raise exception
      '0070: نوعٌ مجهول بلا عائلة — التجميع سيُسقطه من الشاشة، وهو مالٌ لا يصل';
  end if;

  -- (٦-٣) 🔒 التعريف الواحد يحكم القراءة **والكتابة** — بنداءٍ حيّ على تجهيزٍ
  --       يخصّ الهجرة وحدها: حسابان وحجزٌ تُلغى جميعاً، فلا يُمسّ صفٌّ لبدر.
  begin
    insert into public.payment_accounts
      (id, kind, label, handle, holder_name, opening_balance, active, sort, customer_facing)
    values
      (v_hidden,  'bank', 'فحص ذاتي 0070 — محجوب', 'MIG0070-HIDDEN', 'فحص', 0, true, 970, false),
      (v_visible, 'bank', 'فحص ذاتي 0070 — معروض', 'MIG0070-SHOWN',  'فحص', 0, true, 971, true);

    -- التعريف نفسه، طرفاه
    if public.payment_account_customer_visible(v_hidden) then
      raise exception '0070: حسابٌ customer_facing = false عُدّ مرئياً — التعريف مثقوب';
    end if;
    if not public.payment_account_customer_visible(v_visible) then
      raise exception '0070: حسابٌ معروضٌ ومفعَّل عُدّ محجوباً — الشاشة ستفرغ';
    end if;

    update public.payment_accounts set active = false where id = v_visible;
    if public.payment_account_customer_visible(v_visible) then
      raise exception '0070: `active = false` لم يحجب — الظهور لا يطيع اللوحة';
    end if;
    update public.payment_accounts set active = true where id = v_visible;

    -- والقراءة تطيعه: المحجوب غائبٌ والمعروض حاضر
    if exists (select 1 from public.payment_accounts_within_caps(0) w where w.id = v_hidden) then
      raise exception '0070: القراءة تعرض ما يحجبه التعريف الواحد';
    end if;
    if not exists (select 1 from public.payment_accounts_within_caps(0) w where w.id = v_visible) then
      raise exception '0070: القراءة تحجب ما يعرضه التعريف الواحد — الشاشة تفرغ';
    end if;

    -- (٦-٤) 🔴 والكتابة ترفض ما لا تعرضه القراءة — حجزُ فحصٍ بلا لقطة عمولات
    insert into public.bookings
      (status, class_slug, class_title, total, currency, plan,
       amount_due, amount_remaining, customer_name, customer_phone, trip)
    values
      ('pending_payment', 'mig0070', 'MIG0070', 1000, 'EGP', 'full',
       1000, 0, 'فحص ذاتي 0070', '01000000070', '{}'::jsonb)
    returning public_token into v_token;

    begin
      perform 1 from public.attach_receipt(v_token, v_token || '/mig0070.jpg', v_hidden);
    exception
      when others then
        v_caught := true;
        get stacked diagnostics v_hint = pg_exception_hint;
    end;

    if not v_caught or v_hint is distinct from 'account-unavailable' then
      raise exception
        '0070: 🔴 قُبل إيصالٌ على حسابٍ لا يراه العميل (رُفض=% رمز=%) — القائمة الثالثة مفتوحة',
        v_caught, coalesce(v_hint, 'بلا');
    end if;

    -- والمعروض ما زال مقبولاً — حارسٌ يرفض كل شيء ليس حارساً بل عطلاً
    perform 1 from public.attach_receipt(v_token, v_token || '/mig0070-ok.jpg', v_visible);

    raise exception 'MIG0070_ROLLBACK';
  exception
    when others then
      if sqlerrm <> 'MIG0070_ROLLBACK' then raise; end if;
  end;

  -- (٦-٥) والمنح كما كانت
  if not has_function_privilege('anon', 'public.available_payment_accounts(text, numeric)', 'EXECUTE') then
    raise exception '0070: anon فقد EXECUTE على غلاف التوكن — صفحة التحويل تفرغ';
  end if;
  if has_function_privilege('anon', 'public.available_payment_accounts(numeric)', 'EXECUTE') then
    raise exception '0070: anon كسب EXECUTE على الغلاف الإداري — أرقام الخزينة مكشوفة';
  end if;
  if has_function_privilege('anon', 'public.payment_account_customer_visible(uuid)', 'EXECUTE') then
    raise exception '0070: anon كسب EXECUTE على التعريف الواحد — تعدادُ الحسابات بالتخمين';
  end if;
  if has_function_privilege('anon', 'public.payment_accounts_within_caps(numeric)', 'EXECUTE') then
    raise exception '0070: anon كسب EXECUTE على قائمة الحدود — متسعُ الحدّ اليومي مكشوف';
  end if;
  if not has_function_privilege('anon', 'public.attach_receipt(text, text, uuid)', 'EXECUTE') then
    raise exception '0070: anon بلا EXECUTE على غلاف الإيصال الثلاثي — الرفع ينكسر';
  end if;
  if has_function_privilege('anon', 'public.attach_receipt(text, text, uuid, numeric)', 'EXECUTE') then
    raise exception '0070: anon كسب EXECUTE على التوقيع الرباعي — المبلغ يصير من المتصفح (D-09)';
  end if;

  raise notice
    '✔ 0070: تعريفٌ واحد للظهور تفوّض إليه القراءة والكتابة · عائلةٌ لا تُسقط نوعاً · وترتيبٌ بالأرخص';
end $$;
