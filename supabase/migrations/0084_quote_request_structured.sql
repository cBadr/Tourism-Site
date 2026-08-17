-- ============================================================================
-- 0084_quote_request_structured.sql — طلب عرض السعر يصير صفّاً مُهيكلاً (ب‑١)
--
-- ما كان قائماً قبل هذه الهجرة (قِيس، لم يُفترض):
--   جدول `quote_requests` موجود منذ 0007، ودالته الحارسة `create_quote_request`
--   منذ 0009، وشاشة `/admin/quote-requests` تعرضه، ومُشغّل التدقيق مربوط به في
--   0036 بوسم `reference`. فالطلب **لم يكن يموت في بريد المالك** — كان يُخزَّن.
--
-- والعطل الحقيقي الذي تعالجه هذه الهجرة:
--   كل ما يعرفه الصف عن الرحلة نصٌّ حرّ واحد اسمه `details`. لا مكان، ولا
--   إحداثيات، ولا موعد، ولا عدد ركاب — أي **لا شيء يُسعَّر منه ولا يُقاس عليه**.
--   موظف المبيعات يقرأ فقرةً ويعيد سؤال العميل عمّا كتبه، والتحويل إلى حجز
--   (ب‑٣) مستحيل بلا نقطتين وموعد.
--
-- 🔴 والقاعدة الحاكمة (D-09): **لا يُسعَّر نصٌّ لم يُحلّ إلى نقطة.** لذلك المكان
--    هنا ثلاثيّ لا يتجزأ — تسمية وإحداثيتان — ومن أدخل نصاً بلا إحداثيات رُفض
--    في القاعدة لا في النموذج. سعرٌ مبنيٌّ على «فندق في الزمالك» سعرٌ نلتزم به
--    ولا نعرف مسافته.
--
-- ⚠ وتغيير مقصود في مفردات الحالة — يُقرأ قبل التطبيق:
--     contacted ← ← quoted      (تم التواصل ← مسعَّر)
--     closed    ← ← rejected    (مغلق      ← مرفوض)
--   «تم التواصل» تصف **فعل الموظف**، و«مسعَّر» تصف **حالة الطلب**، وفرقهما أن
--   الثانية وحدها تحمل رقماً يُقاس عليه معدل التحويل. والقاعدة الحية لحظة
--   الكتابة: صفٌّ واحد بحالة `new` — فالترحيل لا يمسّ بياناً قائماً.
--
-- آمن لإعادة التنفيذ: add column if not exists · drop constraint if exists ثم
-- add · create or replace · drop trigger if exists ثم create.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (١) الأعمدة المُهيكلة
--
-- المكان ثلاثيّ: تسمية يقرؤها الموظف + إحداثيتان يُقاس عليهما. و`numeric(9,6)`
-- هي دقة `subcontractor_routes` نفسها في 0010 — لا صيغة ثانية تُخترع هنا.
--
-- والوجهة **اختيارية بقصد**: الجولة والإيجار اليومي ليس لهما وجهة واحدة، وهما
-- بالضبط ما وُجدت هذه الصفحة لأجله. أما الانطلاق فمطلوب دائماً — بلا نقطة بدءٍ
-- لا يوجد طلبٌ يُسعَّر أصلاً.
-- ----------------------------------------------------------------------------
alter table public.quote_requests
  add column if not exists origin_label     text,
  add column if not exists origin_lat       numeric(9,6),
  add column if not exists origin_lng       numeric(9,6),
  add column if not exists dest_label       text,
  add column if not exists dest_lat         numeric(9,6),
  add column if not exists dest_lng         numeric(9,6),
  add column if not exists pickup_at        timestamptz,
  add column if not exists passengers       integer,
  add column if not exists luggage          integer,
  -- حقول دورة الحياة التي يملؤها المالك من اللوحة
  add column if not exists quoted_amount    numeric(12,2),
  add column if not exists quoted_at        timestamptz,
  add column if not exists admin_note       text,
  add column if not exists status_changed_at timestamptz;

comment on column public.quote_requests.origin_lat is
  'إحداثية الانطلاق — مصدر الحقيقة للمسافة. نصٌّ بلا إحداثيات مرفوض في create_quote_request (D-09)';
comment on column public.quote_requests.quoted_amount is
  'السعر المعروض على العميل بالجنيه. 🔒 حاجزٌ صلب: الحالة quoted/converted لا تقوم بدونه (قيد quote_requests_priced_states_chk)';
comment on column public.quote_requests.admin_note is
  'ملاحظة داخلية للمالك — لا تُعرض للعميل أبداً ولا يقرؤها أي مسار عام (D-19)';

-- ----------------------------------------------------------------------------
-- (٢) ترحيل مفردات الحالة — قبل تبديل القيد، وإلا رفض القيد الجديد صفّاً قائماً
-- ----------------------------------------------------------------------------
update public.quote_requests set status = 'quoted'   where status = 'contacted';
update public.quote_requests set status = 'rejected' where status = 'closed';

alter table public.quote_requests drop constraint if exists quote_requests_status_check;
alter table public.quote_requests
  add constraint quote_requests_status_check
  check (status in ('new', 'quoted', 'converted', 'rejected'));

-- ----------------------------------------------------------------------------
-- (٣) القيود — الحواجز الصلبة على الجدول نفسه لا في الدالة وحدها
--
-- لماذا على الجدول: الدالة مسارٌ واحد، والقيد يحرس **كل** مسار — بما فيه تحديث
-- مباشر من PostgREST بيد مشرف. والقاعدة المدفوعة الثمن: حقلٌ يُحفظ ليس حقلاً
-- يعمل (القاعدة الذهبية ١٨).
-- ----------------------------------------------------------------------------

-- (٣-١) تكامل ثلاثيّ المكان: التسمية والإحداثيتان تحضر كلها أو تغيب كلها.
--       نقطةٌ بإحداثيات بلا تسمية غير مقروءة، وتسميةٌ بلا إحداثيات غير مُسعَّرة.
alter table public.quote_requests drop constraint if exists quote_requests_origin_triplet_chk;
alter table public.quote_requests
  add constraint quote_requests_origin_triplet_chk
  check (
    (origin_label is null and origin_lat is null and origin_lng is null)
    or (origin_label is not null and origin_lat is not null and origin_lng is not null)
  ) not valid;

alter table public.quote_requests drop constraint if exists quote_requests_dest_triplet_chk;
alter table public.quote_requests
  add constraint quote_requests_dest_triplet_chk
  check (
    (dest_label is null and dest_lat is null and dest_lng is null)
    or (dest_label is not null and dest_lat is not null and dest_lng is not null)
  ) not valid;

-- (٣-٢) 🔴 مصر وحدها — نفس صندوق `SERVICE_BOUNDS` في `lib/place-search-types.ts`
--       (خط عرض ٢٠..٣٤، خط طول ٢٣..٣٨) وهو الصندوق الذي يرفض به
--       `/api/geocode/reverse` ويقصّ به `0080_map_default_center`. الأرقام مكرّرة
--       هنا لأن SQL لا يقرأ TS — **والتعريف واحد والمرآة مُعلَّمة**، فمن غيّر
--       الصندوق يجد هذا التعليق بالبحث عن SERVICE_BOUNDS.
alter table public.quote_requests drop constraint if exists quote_requests_origin_bounds_chk;
alter table public.quote_requests
  add constraint quote_requests_origin_bounds_chk
  check (
    origin_lat is null
    or (origin_lat between 20 and 34 and origin_lng between 23 and 38)
  ) not valid;

alter table public.quote_requests drop constraint if exists quote_requests_dest_bounds_chk;
alter table public.quote_requests
  add constraint quote_requests_dest_bounds_chk
  check (
    dest_lat is null
    or (dest_lat between 20 and 34 and dest_lng between 23 and 38)
  ) not valid;

-- (٣-٣) المدى المعقول للركاب والحقائب — سقف الركاب فوق أكبر باص في الأسطول
--       بهامش، فطلب وفدٍ من ٨٠ فرداً مشروع ويُسعَّر بأكثر من سيارة.
alter table public.quote_requests drop constraint if exists quote_requests_passengers_chk;
alter table public.quote_requests
  add constraint quote_requests_passengers_chk
  check (passengers is null or (passengers >= 1 and passengers <= 200)) not valid;

alter table public.quote_requests drop constraint if exists quote_requests_luggage_chk;
alter table public.quote_requests
  add constraint quote_requests_luggage_chk
  check (luggage is null or (luggage >= 0 and luggage <= 400)) not valid;

-- (٣-٤) 🔴 الحاجز المالي: مبلغٌ موجب دائماً، و**الحالة المسعَّرة لا تقوم بلا رقم**.
--       بلا هذا القيد تصير «مسعَّر» وسماً يُلصق بلا سعر، فيُحسب في معدل التحويل
--       طلبٌ لم يُعرض عليه شيء — وهو الرقم الذي تُبنى عليه قرارات المالك.
alter table public.quote_requests drop constraint if exists quote_requests_amount_positive_chk;
alter table public.quote_requests
  add constraint quote_requests_amount_positive_chk
  check (quoted_amount is null or quoted_amount > 0) not valid;

alter table public.quote_requests drop constraint if exists quote_requests_priced_states_chk;
alter table public.quote_requests
  add constraint quote_requests_priced_states_chk
  check (status not in ('quoted', 'converted') or quoted_amount is not null) not valid;

-- (٣-٥) تصديق القيود على الصفوف القائمة — نفس نمط 0009: يُحاول، ومن خالف
--       يبقى القيد سارياً على الجديد وحده بإشعارٍ لا بانهيار الهجرة.
do $$
declare
  v_name text;
begin
  foreach v_name in array array[
    'quote_requests_origin_triplet_chk', 'quote_requests_dest_triplet_chk',
    'quote_requests_origin_bounds_chk',  'quote_requests_dest_bounds_chk',
    'quote_requests_passengers_chk',     'quote_requests_luggage_chk',
    'quote_requests_amount_positive_chk','quote_requests_priced_states_chk'
  ] loop
    begin
      execute format('alter table public.quote_requests validate constraint %I', v_name);
    exception
      when others then
        raise notice 'صفوف قديمة تخالف القيد «%» — يسري على الجديد فقط (%)', v_name, sqlerrm;
    end;
  end loop;
end;
$$;

-- ----------------------------------------------------------------------------
-- (٤) 🔴 آلة الحالات — مُشغّلاً على الجدول، لا شرطاً في دالة
--
-- لماذا مُشغّل: الدالة مسارٌ واحد يسهل الالتفاف عليه بتحديث مباشر من اللوحة عبر
-- PostgREST (وسياسة `quote_requests_update_admin` تسمح به اليوم). المُشغّل يحرس
-- كل مسار، فتكون الآلة **واقعاً لا اتفاقاً**.
--
--        جديد ──────► مسعَّر ──────► محوَّل   (نهائية: ب‑٣ أنشأت الحجز)
--          │            │
--          └────────────┴────────► مرفوض ────► جديد   (إعادة فتح)
--
-- و«محوَّل» نهائية بلا رجعة: بعدها يوجد حجزٌ حقيقي بمرجعه الخاص، وإرجاع الطلب
-- إلى «جديد» يجعل صفّين يدّعيان الرحلة نفسها.
-- ----------------------------------------------------------------------------
create or replace function public.guard_quote_request_transition()
returns trigger
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_legal boolean;
begin
  -- الانتقال يُفحص حين تتبدّل الحالة وحدها. وإعادة التسعير (quoted ← quoted)
  -- ليست انتقالاً، لكنها تستحق طابعاً جديداً — ولذلك يستيقظ المُشغّل للمبلغ أيضاً.
  if old.status is distinct from new.status then
    v_legal := case old.status
      when 'new'       then new.status in ('quoted', 'rejected')
      when 'quoted'    then new.status in ('converted', 'rejected')
      when 'rejected'  then new.status in ('new')
      when 'converted' then false
      else false
    end;

    if not v_legal then
      raise exception 'انتقال غير مسموح: «%» ← «%»', old.status, new.status
        using hint = 'invalid-transition';
    end if;

    -- الطابع يُختم هنا لا في الواجهة: كل مسار كتابةٍ يمرّ بالمُشغّل
    new.status_changed_at := now();
  end if;

  -- لحظة التسعير: عند أول تسعير، وعند كل إعادة تسعير بمبلغ مختلف. وبلا هذا
  -- الفرع يبقى `quoted_at` كاذباً بعد إعادة تسعير — تاريخُ عرضٍ لم يعد قائماً.
  if new.status = 'quoted'
     and (old.status is distinct from 'quoted'
          or new.quoted_amount is distinct from old.quoted_amount) then
    new.quoted_at := now();
  end if;

  return new;
end;
$$;

drop trigger if exists quote_requests_guard_transition on public.quote_requests;
create trigger quote_requests_guard_transition
  before update on public.quote_requests
  for each row
  when (old.status is distinct from new.status
        or old.quoted_amount is distinct from new.quoted_amount)
  execute function public.guard_quote_request_transition();

-- ----------------------------------------------------------------------------
-- (٥) المنفذ الوحيد للزائر — بالحقول المُهيكلة
--
-- ⚠ والتوقيع الرباعي القديم **يُسقَط** ولا يُترك جنبه: بقاؤه يعني أن anon ما زال
--   يملك مساراً يُدرج به طلباً بلا إحداثيات ولا موعد ولا عدد ركاب — أي بابٌ
--   خلفيّ يبطل كل ما تفرضه هذه الهجرة. (وهو بالضبط الصنف الذي عالجته 0009 حين
--   حذفت السقوط إلى الإدراج المباشر.)
-- ----------------------------------------------------------------------------
drop function if exists public.create_quote_request(text, text, text, text);

create or replace function public.create_quote_request(
  p_service_slug   text,
  p_customer_name  text,
  p_customer_phone text,
  p_details        text,
  p_origin_label   text,
  p_origin_lat     numeric,
  p_origin_lng     numeric,
  p_dest_label     text,
  p_dest_lat       numeric,
  p_dest_lng       numeric,
  p_pickup_at      timestamptz,
  p_passengers     integer,
  p_luggage        integer
)
returns table (
  id        uuid,
  reference text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_slug         text;
  v_name         text;
  v_phone        text;
  v_details      text;
  v_origin_label text;
  v_dest_label   text;
  v_digits       integer;
  v_id           uuid;
  v_ref          text;
begin
  v_name    := nullif(btrim(coalesce(p_customer_name, '')), '');
  v_phone   := nullif(btrim(coalesce(p_customer_phone, '')), '');
  v_slug    := nullif(btrim(coalesce(p_service_slug, '')), '');
  -- التفاصيل تُقصّ ولا تُرفض: من كتب ٥٠٠٠ حرف يستحق أن يصل طلبه لا أن ينكسر
  v_details := left(btrim(coalesce(p_details, '')), 2000);

  v_origin_label := nullif(btrim(coalesce(p_origin_label, '')), '');
  v_dest_label   := nullif(btrim(coalesce(p_dest_label, '')), '');

  if v_name is null then
    raise exception 'اسم العميل مطلوب' using hint = 'invalid-name';
  end if;
  if length(v_name) < 3 or length(v_name) > 120 then
    raise exception 'اسم العميل يجب أن يكون بين ٣ و١٢٠ حرفاً (طوله %)', length(v_name)
      using hint = 'invalid-name';
  end if;

  if v_phone is null then
    raise exception 'رقم هاتف العميل مطلوب' using hint = 'invalid-phone';
  end if;
  if length(v_phone) < 8 or length(v_phone) > 20 then
    raise exception 'رقم الهاتف يجب أن يكون بين ٨ و٢٠ محرفاً (طوله %)', length(v_phone)
      using hint = 'invalid-phone';
  end if;
  v_digits := length(regexp_replace(v_phone, '[^0-9]', '', 'g'));
  if v_digits < 8 then
    raise exception 'رقم الهاتف يجب أن يحوي ٨ أرقام على الأقل (وجدنا %)', v_digits
      using hint = 'invalid-phone';
  end if;

  -- الخدمة إما إحدى الست المعروفة أو لا شيء — لا نص حر يشوّش اللوحة
  if v_slug is not null
     and v_slug not in ('airport-transfer', 'city-rides', 'intercity-travel',
                        'tours', 'events', 'conferences') then
    raise exception 'الخدمة «%» غير معروفة', v_slug using hint = 'invalid-service';
  end if;

  -- 🔴 (D-09) الانطلاق نقطةٌ محلولة أو لا طلب: التسمية وحدها لا تُسعَّر
  if v_origin_label is null or p_origin_lat is null or p_origin_lng is null then
    raise exception 'نقطة الانطلاق يجب أن تكون مكاناً محدَّداً بإحداثياته'
      using hint = 'invalid-origin';
  end if;

  -- والوجهة إن ذُكرت فبالشرط نفسه — نصٌّ بلا إحداثيات يُرفض ولا يُقبل ناقصاً
  if (v_dest_label is null) <> (p_dest_lat is null)
     or (p_dest_lat is null) <> (p_dest_lng is null) then
    raise exception 'الوجهة يجب أن تكون مكاناً محدَّداً بإحداثياته أو تُترك فارغة'
      using hint = 'invalid-destination';
  end if;

  -- 🔴 مصر وحدها — مرآة `SERVICE_BOUNDS`، والرفض هنا قبل القيد ليخرج رمزٌ مفهوم
  if p_origin_lat not between 20 and 34 or p_origin_lng not between 23 and 38 then
    raise exception 'نقطة الانطلاق خارج نطاق التشغيل' using hint = 'out-of-area';
  end if;
  if p_dest_lat is not null
     and (p_dest_lat not between 20 and 34 or p_dest_lng not between 23 and 38) then
    raise exception 'الوجهة خارج نطاق التشغيل' using hint = 'out-of-area';
  end if;

  -- الموعد مطلوب ومستقبلي: طلبٌ بموعدٍ ماضٍ خطأُ إدخالٍ لا رغبةُ عميل، وطلبٌ
  -- بلا موعد لا يُسعَّر (نفس مبدأ حارس المهلة في الحجز).
  if p_pickup_at is null then
    raise exception 'موعد الرحلة مطلوب' using hint = 'invalid-pickup';
  end if;
  if p_pickup_at <= now() then
    raise exception 'موعد الرحلة يجب أن يكون في المستقبل' using hint = 'pickup-past';
  end if;

  if p_passengers is null or p_passengers < 1 or p_passengers > 200 then
    raise exception 'عدد الركاب يجب أن يكون بين ١ و٢٠٠ (وصلنا %)', coalesce(p_passengers, 0)
      using hint = 'invalid-passengers';
  end if;

  -- الحقائب اختيارية: غيابها يعني «لم يُذكر» لا صفراً
  if p_luggage is not null and (p_luggage < 0 or p_luggage > 400) then
    raise exception 'عدد الحقائب خارج المدى المقبول' using hint = 'invalid-luggage';
  end if;

  insert into public.quote_requests as q (
    service_slug, customer_name, customer_phone, details,
    origin_label, origin_lat, origin_lng,
    dest_label, dest_lat, dest_lng,
    pickup_at, passengers, luggage
  )
  values (
    v_slug, v_name, v_phone, v_details,
    v_origin_label, p_origin_lat, p_origin_lng,
    v_dest_label, p_dest_lat, p_dest_lng,
    p_pickup_at, p_passengers, p_luggage
  )
  returning q.id, q.reference into v_id, v_ref;

  id        := v_id;
  reference := v_ref;
  return next;
end;
$$;

-- ----------------------------------------------------------------------------
-- (٦) نقلة الحالة في نداءٍ واحد — سعرٌ وملاحظةٌ وحالةٌ معاً (D-48)
--
-- لماذا دالة وقد كان التحديث مباشراً: «مسعَّر» تحتاج **مبلغاً** يُكتب في نفس
-- المعاملة. تحديثان متتاليان من الواجهة يعنيان لحظةً يكون فيها الطلب مسعَّراً
-- بلا سعر — والقيد (٣-٤) يرفضها بحق، فيفشل النصف الأول ويبقى الصف بحالة قديمة
-- ورسالة خطأ غامضة. نداءٌ واحد = معاملةٌ واحدة = حالةٌ متسقة أو لا شيء.
--
-- 🔒 و`is_admin()` صراحةً: الدالة security definer، و`authenticated` يشمل كل
--    متعهّد من الباطن فلا يعني مشرفاً أبداً (D-20).
-- ----------------------------------------------------------------------------
create or replace function public.set_quote_request_status(
  p_id     uuid,
  p_status text,
  p_amount numeric default null,
  p_note   text    default null
)
returns table (
  id        uuid,
  reference text,
  status    text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_old    text;
  v_amount numeric;
  v_note   text;
  v_row    record;
begin
  if not public.is_admin() then
    raise exception 'هذه العملية للمشرف وحده' using hint = 'forbidden';
  end if;

  if p_status is null or p_status not in ('new', 'quoted', 'converted', 'rejected') then
    raise exception 'حالة غير معروفة: %', coalesce(p_status, 'NULL') using hint = 'invalid-status';
  end if;

  -- قراءةٌ واحدة بقفل الصف: الحالة والمبلغ معاً، فلا سباق بين موظفين يسعّران
  -- الطلب نفسه في اللحظة نفسها.
  select q.status, q.quoted_amount into v_old, v_amount
    from public.quote_requests q where q.id = p_id for update;
  if not found then
    raise exception 'طلب عرض السعر غير موجود' using hint = 'not-found';
  end if;

  if v_old = p_status and p_status <> 'quoted' then
    raise exception 'الطلب في هذه الحالة بالفعل' using hint = 'no-change';
  end if;

  v_note := nullif(btrim(coalesce(p_note, '')), '');

  -- المبلغ يُطلب عند التسعير، ويُورَّث عند التحويل من التسعيرة القائمة، ويُمحى
  -- عند إعادة الفتح — فلا يبقى رقمٌ يتيم يدّعي عرضاً سُحب.
  -- و«مرفوض» يحتفظ بآخر سعر عُرض: دليلٌ على أن عرضاً قُدِّم ورُفض.
  if p_status = 'quoted' then
    v_amount := round(coalesce(p_amount, 0), 2);
    if v_amount <= 0 then
      raise exception 'التسعير يحتاج مبلغاً موجباً' using hint = 'amount-required';
    end if;
  elsif p_status = 'converted' then
    v_amount := coalesce(round(p_amount, 2), v_amount);
    if v_amount is null or v_amount <= 0 then
      raise exception 'التحويل يحتاج تسعيرة قائمة' using hint = 'amount-required';
    end if;
  elsif p_status = 'new' then
    v_amount := null;
  end if;

  update public.quote_requests q
     set status        = p_status,
         quoted_amount = v_amount,
         quoted_at     = case when p_status = 'new' then null else q.quoted_at end,
         admin_note    = coalesce(v_note, q.admin_note)
   where q.id = p_id
  returning q.id, q.reference, q.status into v_row;

  id        := v_row.id;
  reference := v_row.reference;
  status    := v_row.status;
  return next;
end;
$$;

-- ----------------------------------------------------------------------------
-- (٧) حمولة الإشعار — الحقول المُهيكلة تصل للمالك في الجرس والبريد
--
-- 🔒 والمكان تسميةً لا إحداثياتٍ: من يقرأ الإشعار يريد «مطار القاهرة» لا رقمين.
-- ----------------------------------------------------------------------------
create or replace function public.log_quote_request()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform public.queue_notification(
    'quote_requested',
    jsonb_build_object(
      'quoteRequestId', new.id,
      'reference',      new.reference,
      'serviceSlug',    new.service_slug,
      'customerName',   new.customer_name,
      'customerPhone',  new.customer_phone,
      'details',        new.details,
      'status',         new.status,
      'createdAt',      new.created_at,
      'originLabel',    new.origin_label,
      'destLabel',      new.dest_label,
      'pickupAt',       new.pickup_at,
      'passengers',     new.passengers,
      'luggage',        new.luggage
    )
  );
  return null;
end;
$$;

-- ----------------------------------------------------------------------------
-- (٨) فهرسٌ لمسار القراءة الفعلي — الشاشة ترتّب بالأحدث وتُرشّح بالحالة
--     (الفهرس القائم من 0007 يخدمه؛ يُعاد التأكيد لأن الحالات تبدّلت مفرداتها)
-- ----------------------------------------------------------------------------
create index if not exists quote_requests_pickup_idx
  on public.quote_requests (pickup_at desc nulls last);

-- ----------------------------------------------------------------------------
-- (٩) الصلاحيات — تُعاد كاملةً لكل دالة لمستها الهجرة
--
-- ⚠ الفخّ الموثَّق في 0007 و0009 ويتكرر هنا: `create or replace` **لا يعيد ضبط
--   الصلاحيات**، و`alter default privileges` في Supabase يمنح anon و
--   authenticated صلاحية EXECUTE على كل دالة **جديدة** تلقائياً — والتوقيع
--   الثلاثي‑عشري لـ`create_quote_request` دالةٌ جديدة بحكم تغيّر توقيعها.
--   لذلك: revoke من public و anon و authenticated أولاً، ثم grant صريح.
-- ----------------------------------------------------------------------------

-- المنفذ العام: الزائر يُنشئ طلباً ولا يقرأ الجدول
revoke all on function public.create_quote_request(
  text, text, text, text, text, numeric, numeric, text, numeric, numeric,
  timestamptz, integer, integer) from public, anon, authenticated;
grant execute on function public.create_quote_request(
  text, text, text, text, text, numeric, numeric, text, numeric, numeric,
  timestamptz, integer, integer) to anon, authenticated;

-- 🔒 نقلة الحالة: للوحة وحدها، وحارسها `is_admin()` داخل الجسم لا الدور
revoke all    on function public.set_quote_request_status(uuid, text, numeric, text)
  from public, anon, authenticated;
grant execute on function public.set_quote_request_status(uuid, text, numeric, text)
  to authenticated;

-- دوال المُشغّلات لا تُستدعى نداءً أبداً
revoke all on function public.guard_quote_request_transition() from public, anon, authenticated;
revoke all on function public.log_quote_request()              from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- (١٠) فحصٌ ذاتي — الهجرة تُثبت أنها فعلت ما تدّعيه
-- ----------------------------------------------------------------------------
do $$
declare
  v_n integer;
begin
  if to_regprocedure('public.create_quote_request(text,text,text,text)') is not null then
    raise exception '0084: التوقيع الرباعي القديم ما زال قائماً — بابٌ خلفيّ بلا إحداثيات';
  end if;

  if to_regprocedure('public.create_quote_request(text,text,text,text,text,numeric,numeric,text,numeric,numeric,timestamptz,integer,integer)') is null then
    raise exception '0084: التوقيع المُهيكل لم يُنشأ';
  end if;

  if to_regprocedure('public.set_quote_request_status(uuid,text,numeric,text)') is null then
    raise exception '0084: دالة نقلة الحالة لم تُنشأ';
  end if;

  select count(*) into v_n from pg_trigger
   where tgrelid = 'public.quote_requests'::regclass
     and tgname = 'quote_requests_guard_transition';
  if v_n <> 1 then
    raise exception '0084: مُشغّل آلة الحالات غير مربوط (وجدنا %)', v_n;
  end if;

  select count(*) into v_n from public.quote_requests where status not in
    ('new', 'quoted', 'converted', 'rejected');
  if v_n <> 0 then
    raise exception '0084: % صفاً بحالة خارج المفردات الجديدة', v_n;
  end if;

  raise notice '✔ 0084: طلب عرض السعر صار مُهيكلاً — نقطتان وموعد وعدد، وآلة حالات بمُشغّل';
end;
$$;
