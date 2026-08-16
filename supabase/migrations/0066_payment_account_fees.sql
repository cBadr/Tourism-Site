-- ============================================================================
-- 0066 — عمولة بوابات الدفع: مبلغٌ ثابت أو نسبة، على فاتورة العميل وحدها
--
-- نصّ بدر: «مبلغٌ ثابت **أو** نسبة من تكلفة الرحلة، تُضاف إلى فاتورة العميل
-- النهائية، وتُضبط من صفحة حسابات الدفع والخزينة خياراً إضافياً لكل حساب».
-- (فودافون كاش +١ · انستاباي +٢٠).
--
-- 🔴 **القرار الذي تقوم عليه كل سطور هذا الملف: العمولة خارج `bookings.total`.**
--
--    البديهي أن تُضاف طبقةً خامسة في آخر معادلة التسعير كما فعلت الخدمات في
--    D-54. وهذا **يُغيّر ما يستحقه المتعهد**: `dispatch_ceiling` أساسه
--    `total − extras`، فعمولةٌ داخل `total` تتسع بها موجةُ البث فيفوز متعهدٌ
--    أغلى بمالٍ دفعه العميلُ لفودافون كاش. ويتبعه أربعة: `amount_remaining`
--    (نقدُ السائق يرتفع برسمِ تحويلٍ إلكتروني)، ومُشغّل كسب النقاط (أساسه
--    `total − extrasTotal` فيكسب العميل نقاطاً على رسم)، وأرضية الخصم في
--    `apply_discount`، و`margin_amount` في كل تقرير ربحية.
--
--    فالعمولة **طبقةٌ على الفاتورة لا على السعر**:
--
--        bookings.total                    ← مجمَّد، لا يمسّه شيء هنا
--          + payment_fee(الحساب المختار)   ← ★ ما يُضاف عند التحويل
--
--    وهي حمايةٌ **بنيوية لا انضباطية** على سابقة D-18: ما ليس في `total` لا
--    يمكن أن يبلغ سقفَ البث ولا الهامش — لا لأن أحداً تذكّر أن يطرحه في أربعة
--    مواضع (وهو ما احتاجته الخدمات في D-55)، بل لأنه ليس هناك. **ولذلك لا
--    يحتاج هذا الملف بند D-55 خاصاً به.**
--
-- والتجميد: العميل يختار الحساب **بعد** الحجز، فالمجمَّد **جدولٌ لا رقم** —
-- `trip -> 'paymentFees'` تكتبه **مُشغّلٌ على `bookings`** لا سطرٌ في
-- `create_booking` (D-45: الحارس في الجدول لا في الدالة، وD-58: لا استنساخ
-- لجسمٍ بعشرين وسيطاً). وحسابٌ لا مفتاح له في اللقطة **بلا عمولة**.
--
-- العقد الكامل بقراراته السبعة: `lib/payment-fee-types.ts`.
--
-- ⚠ ولا صفَّ بيانات يتغيّر: العمودان يبدآن `none`/`0` فالميزة **خاملة** حتى
--   يضبطها بدر — على قاعدة D-31 وD-47 (لا تُشحن ميزةٌ تمسّ مال عميلٍ مفعّلة).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (١) الكتالوج — عمودان على `payment_accounts`، وحدٌّ واحد يحكمهما معاً
--
-- قيدٌ واحد لا قيدان: النوع والقيمة يتحققان في التعبير نفسه، فالنوع المجهول
-- يسقط من الفروع الثلاثة ويُرفض معها. قيدان منفصلان يفتحان `('percent', 0)`
-- المقبول و`('none', 5)` المتناقض في آن.
-- ----------------------------------------------------------------------------
alter table public.payment_accounts
  add column if not exists fee_kind  text          not null default 'none',
  add column if not exists fee_value numeric(12,2) not null default 0;

alter table public.payment_accounts drop constraint if exists payment_accounts_fee_chk;
alter table public.payment_accounts add constraint payment_accounts_fee_chk check (
     (fee_kind = 'none'    and fee_value = 0)
  or (fee_kind = 'fixed'   and fee_value >= 0 and fee_value <= 100000)
  or (fee_kind = 'percent' and fee_value >= 0 and fee_value <= 100)
);

comment on column public.payment_accounts.fee_kind is
  'عمولة هذا الحساب: none بلا عمولة · fixed مبلغ ثابت بالجنيه · percent نسبة من '
  'bookings.total. تُضاف إلى فاتورة العميل ولا تدخل bookings.total أبداً (0066).';
comment on column public.payment_accounts.fee_value is
  'قيمة العمولة — جنيهاً مع fixed ونسبةً مئوية مع percent. المدى مفروض بقيد '
  'payment_accounts_fee_chk لا بتحقق واجهة: فوق ١٠٠٪ أو تحت الصفر مستحيلان.';

-- ----------------------------------------------------------------------------
-- (٢) الحساب في Postgres لا في TypeScript (D-05) — دالةٌ نقيّة واحدة
--
-- كل موضع يحسب عمولة ينادي هذه: بناء اللقطة، وطريق العميل، وتثبيت قيمة
-- الإيصال. فلو تغيّر التقريب يوماً تغيّر في موضع واحد (القاعدة ١٢).
-- ----------------------------------------------------------------------------
create or replace function public.payment_fee_amount(
  p_kind  text,
  p_value numeric,
  p_base  numeric
)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case
    when p_kind = 'fixed'
      then round(greatest(coalesce(p_value, 0), 0), 2)
    when p_kind = 'percent'
      then round(greatest(coalesce(p_base, 0), 0)
                 * greatest(coalesce(p_value, 0), 0) / 100, 2)
    else 0::numeric
  end;
$$;

comment on function public.payment_fee_amount(text, numeric, numeric) is
  'عمولة حساب دفع بالجنيه: ثابتة كما هي، أو نسبة من الأساس. الأساس هو '
  'bookings.total المجمَّد — أي «تكلفة الرحلة» بنصّ المالك (0066).';

-- ----------------------------------------------------------------------------
-- (٣) قارئ اللقطة — المصدر الأوحد لعمولة حجزٍ قائم
--
-- ⚠ **ولا يثق بما في jsonb ولو كتبناه نحن**: صفُّ `trip` يُحرَّر من محرر SQL
--   ويُستورد من نسخةٍ أخرى، وقيمةٌ غير رقمية كانت ستُسقط صفحة العميل كلها
--   بخطأ تحويل. فالنمط يُفحص أولاً، وما لا يطابقه **صفر** لا استثناء.
-- ----------------------------------------------------------------------------
create or replace function public.booking_payment_fee(
  p_trip       jsonb,
  p_account_id uuid
)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    (
      select case
        when v ~ '^[0-9]+(\.[0-9]+)?$' then round(v::numeric, 2)
        else 0::numeric
      end
      from (
        select (p_trip -> 'paymentFees' -> p_account_id::text) ->> 'amount' as v
      ) s
    ),
    0::numeric
  );
$$;

comment on function public.booking_payment_fee(jsonb, uuid) is
  'عمولة حسابٍ بعينه على حجزٍ بعينه، من اللقطة المجمَّدة في trip->paymentFees. '
  'غياب المفتاح = بلا عمولة: حسابٌ أُنشئت عمولته بعد الحجز لا يمسّ ذلك الحجز (0066).';

-- ----------------------------------------------------------------------------
-- (٤) بناء اللقطة — الجدولة كلها لحظة الحجز
--
-- **الحسابات ذات العمولة الفعلية وحدها تدخل اللقطة.** فالغياب معناه واحدٌ لا
-- اثنان («بلا عمولة»)، ولا يحمل الحجزُ مفاتيحَ أصفار لا تقول شيئاً. ولا حرفَ
-- معرِّفاً في الناتج: مفتاحٌ uuid وثلاثة أرقام — لا مقبض ولا اسم ولا رصيد،
-- فالقاعدة (١) في 0060 تبقى صحيحة بحرفها حين يخرج `trip` إلى anon.
-- ----------------------------------------------------------------------------
create or replace function public.payment_fee_schedule(p_base numeric)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    jsonb_object_agg(
      s.id::text,
      jsonb_build_object('kind', s.fee_kind, 'value', s.fee_value, 'amount', s.amount)
    ),
    '{}'::jsonb
  )
  from (
    select pa.id, pa.fee_kind, pa.fee_value,
           public.payment_fee_amount(pa.fee_kind, pa.fee_value, p_base) as amount
    from public.payment_accounts pa
    where pa.fee_kind <> 'none'
  ) s
  where s.amount > 0;
$$;

comment on function public.payment_fee_schedule(numeric) is
  'جدولة العمولات لحظة الحجز: {accountId: {kind, value, amount}} للحسابات ذات '
  'العمولة الفعلية وحدها. يناديها مُشغّل bookings ولا يناديها أحد غيره (0066).';

revoke all on function public.payment_fee_amount(text, numeric, numeric)
  from public, anon, authenticated;
revoke all on function public.booking_payment_fee(jsonb, uuid)
  from public, anon, authenticated;
revoke all on function public.payment_fee_schedule(numeric)
  from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- (٥) 🔒 التجميد — مُشغّلٌ على الجدول، لا سطرٌ في `create_booking`
--
-- سببان لا واحد:
--  (أ) `create_booking` ليست الطريق الوحيد إلى `bookings`. الدرس محفورٌ في
--      D-45: حارسٌ داخل الدالة يتخطّاه إدراجٌ مباشر عبر PostgREST، فنُقل إلى
--      الجدول. ولقطةٌ ناقصة هنا تعني حجزاً بلا عمولات — أي تحويلاً مجانياً.
--  (ب) استنساخ جسمٍ بعشرين وسيطاً هو بعينه ما وُلد منه انحدار D-58. لا يُلمس
--      حرفٌ من `create_booking`، فالانحدار مستحيلٌ بنيوياً لا مستبعَدٌ انتباهاً.
--
-- و`before insert` وحدها: التجميد تجميد. تعديلُ `total` لاحقاً لا يعيد حساب
-- عمولةٍ رآها العميل، وهو نصّ الشرط لا ثغرةٌ فيه.
-- ----------------------------------------------------------------------------
create or replace function public.bookings_freeze_payment_fees()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.trip := jsonb_set(
    coalesce(new.trip, '{}'::jsonb),
    '{paymentFees}',
    public.payment_fee_schedule(coalesce(new.total, 0)),
    true
  );
  return new;
end;
$$;

comment on function public.bookings_freeze_payment_fees() is
  'يجمّد جدولة عمولات الدفع في trip->paymentFees لحظة إنشاء الحجز. على الجدول '
  'لا في create_booking كي لا يفلت منه إدراجٌ مباشر (D-45) ولا يُستنسخ جسم (D-58).';

drop trigger if exists bookings_freeze_payment_fees on public.bookings;
create trigger bookings_freeze_payment_fees
  before insert on public.bookings
  for each row execute function public.bookings_freeze_payment_fees();

-- ----------------------------------------------------------------------------
-- (٦) الحارس: لا عمولة على وعاءٍ لا يُحوَّل إليه — **رفضاً لا قسراً**
--
-- النقدية تُسلَّم يداً بيد، ووعاء تسوية البوابات مقبضه معرّفٌ داخلي (0060)،
-- فلا يظهر أيٌّ منهما في مُنتقي العميل ⇒ عمولةٌ عليهما إعدادٌ يُحفظ ولا يفعل
-- شيئاً. والرفض لا القسر: القسر الصامت هو العيب الذي جاءت 0060 تصلحه.
--
-- والشرط مشتقٌّ من `payment_providers` لا من مقبض محفور — كحارس 0060 تماماً،
-- فيبقى صحيحاً لو أُعيدت تسمية الحساب أو أُضيف وعاءُ بوابةٍ ثانٍ.
-- ----------------------------------------------------------------------------
create or replace function public.payment_accounts_block_dead_fee()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.fee_kind <> 'none'
     and (
       new.kind = 'cash'
       or exists (select 1 from public.payment_providers pp where pp.account_id = new.id)
     )
  then
    raise exception
      'لا تُضبط عمولة على هذا الحساب: النقدية تُسلَّم يداً بيد، وحساب تسوية بوابات الدفع مقبضه معرّف داخلي — وكلاهما لا يظهر للعميل في صفحة التحويل، فالعمولة عليه لن تصل أحداً. اضبطها على حساب يظهر للعملاء (محفظة أو انستا باي أو حساب بنكي).'
      using errcode = 'TR002';
  end if;
  return new;
end;
$$;

comment on function public.payment_accounts_block_dead_fee() is
  'يمنع عمولةً على وعاءٍ لا يصلح وجهةَ تحويل (نقدية أو وعاء تسوية بوابة) — '
  'إعدادٌ يُحفظ ولا يفعل شيئاً هو أسوأ من رفضٍ مشروح (0066).';

drop trigger if exists trg_payment_accounts_block_dead_fee on public.payment_accounts;
create trigger trg_payment_accounts_block_dead_fee
  before insert or update of fee_kind, fee_value, kind, id on public.payment_accounts
  for each row execute function public.payment_accounts_block_dead_fee();

-- ----------------------------------------------------------------------------
-- (٧) طريق العميل — العمولة والإجماليان محسوبةً في SQL
--
-- تغيير أعمدة الإرجاع يستلزم `drop` (‏`create or replace` يرفضه) — كما فعلت
-- 0060 حرفياً، والمنح تُعاد بعدها لأن `drop` أسقطها.
--
-- ⚠ والقائمة البيضاء التي أرستها 0060 **تبقى**: الثلاثة المضافة أرقامُ فاتورةٍ
--   يراها العميل قبل أن يحوّل، لا أرقام خزينة. ولا `daily_headroom` ولا
--   `monthly_headroom` ولا حدّ — والفحص الذاتي أدناه يعيد إثبات ذلك بالنداء.
--
-- ⚠ وحدُّ الحساب يُختبر بـ`amount_due` كما اليوم، لا بـ`amount_due + fee`:
--   إعادةُ اشتقاق نافذتَي اليوم والشهر خارج `payment_accounts_within_caps`
--   لتُختبر بمبلغٍ يختلف لكل صف هي بعينها الاستنساخ الذي حذّر منه D-58، وثمنُ
--   الفارق جنيهٌ أو عشرون على حدٍّ بعشرات الألوف.
-- ----------------------------------------------------------------------------
drop function if exists public.available_payment_accounts(text, numeric);

create function public.available_payment_accounts(
  p_token  text,
  p_amount numeric
)
returns table (
  id                  uuid,
  kind                text,
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
    a.id, a.kind, a.label, a.handle, a.holder_name,
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
  -- ترتيب `payment_accounts_within_caps` (‏sort ثم label) يُحفَظ صراحةً: الضمّ
  -- لا يضمن بقاءه، و«الأول هو ما رتّبه بدر أولاً» عقدٌ تعتمد عليه الصفحة
  -- (الخيار الأول هو المختار افتراضياً، وهو ما يُطبع على الورقة).
  order by a.ordinality;
$$;

comment on function public.available_payment_accounts(text, numeric) is
  'حسابات التحويل للعميل الضيف — مربوطة بتوكن حجز ما زال بانتظار الدفع (0009). '
  'الترشيح من payment_accounts_within_caps: active و customer_facing والحدود، '
  'بلا أي علاقة بالنوع (0060). '
  '🔒 والإرجاع قائمة بيضاء: خمسة أعمدة للعرض + ثلاثة أرقام فاتورةٍ يراها العميل '
  'قبل التحويل (العمولة والمطلوب الآن والإجمالي بها، محسوبةً هنا لا في المتصفح — '
  'D-05)، وبلا أي رقم خزينة.';

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
-- (٨) قيمة الإيصال = **ما حوّله العميل فعلاً**
--
-- كانت `payments.amount` تُثبَّت على `bookings.amount_due`. ومع عمولة يصير ذلك
-- رقماً **لا يطابق صورة الإيصال في يد المشرف** — والمطابقة وظيفةُ الصفّ كلها
-- (D-52). ومشرفٌ يقارن ٢٬٧٤٠ في الصورة بـ٢٬٧٢٠ في السطر يرفض تحويلاً سليماً؛
-- ثم يتعلّم تجاهُل الفرق، فيمرّ يوماً تحويلٌ ناقصٌ حقيقي.
--
-- 🔒 **وD-09 قائمة بحرفها**: المبلغ ما زال يُحسب في SQL من الحجز ومن اللقطة
--    المجمَّدة. المتصفح يرسل **أي حساب حوّلتَ إليه** — مُدخَلٌ كفئة السيارة لا
--    سعرٌ — وأقصى ما يشتريه كذبٌ فيه فرقُ العمولتين، والصورة أمام المشرف
--    تحسمه. أما `p_amount` فبقي حبيس `is_admin()` كما هو.
--
-- الجسم منقولٌ من `pg_get_functiondef` الحيّ (D-58) — والفرق عنه محصورٌ في هذا
-- التعليق، وفي سطر المبلغ، وفي **تقديم فحص الحساب على حساب المبلغ** (فحسابٌ
-- خاطئ يجب أن يُرفض قبل أن نبني عليه رقماً).
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
as $function$
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

  if p_account_id is not null
     and not exists (
       select 1 from public.payment_accounts pa
       where pa.id = p_account_id and pa.active
     ) then
    raise exception 'حساب الاستقبال غير موجود أو غير مفعّل' using hint = 'account-unavailable';
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
$function$;

-- غلافٌ ثلاثي للزائر: الحساب مُدخَل، ولا `p_amount` في متناوله إطلاقاً.
-- (الغلاف الثنائي `attach_receipt(text, text)` يبقى كما هو لكل منادٍ قائم —
--  ويُنتج المستحقَّ بلا عمولة، وهو الصحيح حين لا يُصرَّح بحساب.)
create or replace function public.attach_receipt(
  p_token      text,
  p_path       text,
  p_account_id uuid
)
returns table (payment_id uuid, reference text, status text)
language sql
security definer
set search_path = ''
as $$
  select r.payment_id, r.reference, r.status
  from public.attach_receipt(p_token, p_path, p_account_id, null::numeric) r;
$$;

comment on function public.attach_receipt(text, text, uuid) is
  'إرفاق إيصال الضيف مع تصريحه بحساب التحويل — القيمة تُحسب في القاعدة '
  '(amount_due + عمولة الحساب المجمَّدة) ولا تصل من المتصفح إطلاقاً (0066 · D-09).';

revoke all    on function public.attach_receipt(text, text, uuid) from public;
grant execute on function public.attach_receipt(text, text, uuid) to anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.attach_receipt(text, text, uuid) to service_role';
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- (٩) فحص ذاتي — سلوكيٌّ بنداءٍ حيّ لا مطابقةَ نصوص (القاعدة ١٩)
--
-- وكلّ ما يكتب صفاً يعيش داخل كتلةٍ فرعية تُلغى بنفسها: الفحص لا يترك أثراً
-- سواء نجح أو فشل — على نمط 0060 حرفياً.
-- ----------------------------------------------------------------------------
do $$
declare
  v_acc    constant uuid := '00000000-0000-4000-8000-006600660066';
  v_names  text[];
  v_fired  boolean;
  v_gw     uuid;
  v_frozen numeric;
  v_after  numeric;
  v_total  constant numeric := 2720;
begin
  -- (٩-١) الحدّ في الجدول: نسبةٌ فوق المئة ومبلغٌ سالب ونوعٌ مجهول — ثلاثتها تُرفض
  begin
    insert into public.payment_accounts (id, kind, label, handle, opening_balance, active, sort,
                                         customer_facing, fee_kind, fee_value)
    values (v_acc, 'wallet', 'MIG0066', 'MIG0066-A', 0, true, 996, true, 'percent', 101);
    raise exception 'MIG0066_NO_BOUND';
  exception
    when others then
      if sqlerrm = 'MIG0066_NO_BOUND' then
        raise exception '0066: القيد قَبِل نسبة ١٠١٪ — الحدّ ليس في الجدول';
      end if;
  end;

  begin
    insert into public.payment_accounts (id, kind, label, handle, opening_balance, active, sort,
                                         customer_facing, fee_kind, fee_value)
    values (v_acc, 'wallet', 'MIG0066', 'MIG0066-A', 0, true, 996, true, 'fixed', -1);
    raise exception 'MIG0066_NO_BOUND';
  exception
    when others then
      if sqlerrm = 'MIG0066_NO_BOUND' then
        raise exception '0066: القيد قَبِل مبلغاً سالباً';
      end if;
  end;

  begin
    insert into public.payment_accounts (id, kind, label, handle, opening_balance, active, sort,
                                         customer_facing, fee_kind, fee_value)
    values (v_acc, 'wallet', 'MIG0066', 'MIG0066-A', 0, true, 996, true, 'bogus', 1);
    raise exception 'MIG0066_NO_BOUND';
  exception
    when others then
      if sqlerrm = 'MIG0066_NO_BOUND' then
        raise exception '0066: القيد قَبِل نوع عمولة مجهولاً';
      end if;
  end;

  -- (٩-٢) الحساب نفسه: الثابت والنسبة
  if public.payment_fee_amount('fixed', 20, v_total) <> 20 then
    raise exception '0066: العمولة الثابتة لا تساوي قيمتها';
  end if;
  if public.payment_fee_amount('percent', 2.5, v_total) <> 68 then
    raise exception '0066: نسبة ٢٫٥٪ من ٢٧٢٠ يجب أن تكون ٦٨، وعادت %',
      public.payment_fee_amount('percent', 2.5, v_total);
  end if;
  if public.payment_fee_amount('none', 0, v_total) <> 0 then
    raise exception '0066: «بلا عمولة» أنتجت رقماً';
  end if;

  -- (٩-٣) الحارس البنيوي: عمولةٌ على النقدية وعلى وعاء البوابات — بنداءٍ يُلغى
  begin
    insert into public.payment_accounts (id, kind, label, handle, opening_balance, active, sort,
                                         customer_facing, fee_kind, fee_value)
    values (v_acc, 'cash', 'MIG0066 نقدية', 'MIG0066-CASH', 0, true, 996, false, 'fixed', 5);
    raise exception 'MIG0066_GUARD_MISSING';
  exception
    when others then
      v_fired := sqlerrm <> 'MIG0066_GUARD_MISSING';
  end;
  if not v_fired then
    raise exception '0066: النقدية قَبِلت عمولة — إعدادٌ يُحفظ ولا يصل أحداً';
  end if;

  select pa.id into v_gw
  from public.payment_accounts pa
  where exists (select 1 from public.payment_providers pp where pp.account_id = pa.id)
  limit 1;

  if v_gw is null then
    raise notice '0066: لا حساب مرتبط بمزوّد دفع على هذه القاعدة — شاهد الحارس متخطٍّ';
  else
    begin
      update public.payment_accounts set fee_kind = 'fixed', fee_value = 5 where id = v_gw;
      raise exception 'MIG0066_GUARD_MISSING';
    exception
      when others then
        v_fired := sqlerrm <> 'MIG0066_GUARD_MISSING';
    end;
    if not v_fired then
      raise exception '0066: وعاء تسوية البوابات قَبِل عمولة — الحارس غائب أو لا يعمل';
    end if;
  end if;

  -- (٩-٤) 🔒 التجميد — الشاهد الأهم في الملف:
  --       حجزٌ يُنشأ بعمولة ٢٠، ثم تُرفع إلى ٩٩، فيبقى المجمَّد ٢٠.
  --       وكلُّه على **الجدول مباشرةً** لا عبر `create_booking`: هذا بعينه ما
  --       يثبت أن التجميد لا يفلت منه إدراجٌ مباشر (D-45).
  begin
    insert into public.payment_accounts (id, kind, label, handle, opening_balance, active, sort,
                                         customer_facing, fee_kind, fee_value)
    values (v_acc, 'wallet', 'MIG0066 محفظة', 'MIG0066-W', 0, true, 996, true, 'fixed', 20);

    insert into public.bookings
      (status, class_slug, class_title, total, currency, plan,
       amount_due, amount_remaining, customer_name, customer_phone, trip)
    values
      ('pending_payment', 'mig0066', 'MIG0066', v_total, 'EGP', 'full',
       v_total, 0, 'فحص ذاتي 0066', '01000000066', '{}'::jsonb);

    select public.booking_payment_fee(b.trip, v_acc) into v_frozen
    from public.bookings b where b.customer_name = 'فحص ذاتي 0066';

    if v_frozen <> 20 then
      raise exception '0066: اللقطة لم تُكتب لحظة الإدراج — المُشغّل لا يعمل (وجدنا %)', v_frozen;
    end if;

    update public.payment_accounts set fee_value = 99 where id = v_acc;

    select public.booking_payment_fee(b.trip, v_acc) into v_after
    from public.bookings b where b.customer_name = 'فحص ذاتي 0066';

    if v_after <> 20 then
      raise exception
        '0066: تغيير العمولة حرّك حجزاً قائماً (% ⇐ %) — اللقطة ليست مجمَّدة', v_frozen, v_after;
    end if;

    -- 🔒 والثابت الذي يقوم عليه الملف كله: العمولة **ليست** في `total`
    if exists (
      select 1 from public.bookings b
      where b.customer_name = 'فحص ذاتي 0066' and b.total <> v_total
    ) then
      raise exception '0066: العمولة دخلت bookings.total — سقف البث والهامش والنقاط كلها تحرّكت';
    end if;

    raise exception 'MIG0066_ROLLBACK';
  exception
    when others then
      if sqlerrm <> 'MIG0066_ROLLBACK' then raise; end if;
  end;

  -- (٩-٥) القائمة البيضاء التي أرستها 0060 ما زالت مثبتة بعد توسيع الإرجاع
  select coalesce(p.proargnames, '{}') into v_names
  from pg_proc p
  where p.oid = 'public.available_payment_accounts(text, numeric)'::regprocedure;

  if v_names && array['daily_headroom', 'monthly_headroom', 'opening_balance',
                      'daily_cap', 'monthly_cap', 'sort', 'active'] then
    raise exception '0066: طريق الزائر عاد يحمل عمود خزينة — القائمة البيضاء مثقوبة';
  end if;
  if not (v_names @> array['id', 'kind', 'label', 'handle', 'holder_name',
                           'fee', 'amount_due_with_fee', 'total_with_fee']) then
    raise exception '0066: طريق الزائر ينقصه عمود تحتاجه صفحة التحويل';
  end if;

  -- (٩-٦) والمنح كما كانت: الزائر على غلاف التوكن وحده، ولا شيء له على الإداري
  if not has_function_privilege('anon', 'public.available_payment_accounts(text, numeric)', 'EXECUTE') then
    raise exception '0066: anon فقد EXECUTE على غلاف التوكن — صفحة التحويل تفرغ من كل حساب';
  end if;
  if has_function_privilege('anon', 'public.available_payment_accounts(numeric)', 'EXECUTE') then
    raise exception '0066: anon كسب EXECUTE على الغلاف الإداري — أرقام المحافظ والإيراد اليومي مكشوفة';
  end if;
  if not has_function_privilege('anon', 'public.attach_receipt(text, text, uuid)', 'EXECUTE') then
    raise exception '0066: anon بلا EXECUTE على غلاف الإيصال الثلاثي — رفع الإيصال ينكسر';
  end if;
  if has_function_privilege('anon', 'public.attach_receipt(text, text, uuid, numeric)', 'EXECUTE') then
    raise exception '0066: anon كسب EXECUTE على التوقيع الرباعي — المبلغ يصير من المتصفح (D-09)';
  end if;

  raise notice '✔ 0066: العمولة خارج bookings.total · مجمَّدة على الجدول · محدودة بقيد · ولا رقم خزينة للزائر';
end $$;
