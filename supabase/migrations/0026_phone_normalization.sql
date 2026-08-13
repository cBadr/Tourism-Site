-- ============================================================================
-- 0026_phone_normalization.sql — تطبيع رقم الهاتف وتوحيد هوية العميل
--
-- ── المشكلة التي يعالجها هذا الملف ──────────────────────────────────────────
-- لا جدول عملاء في هذا المشروع: **العميل يُعرَّف بهاتفه** (تعليق 0022:641).
-- وكل مطابقة قائمة اليوم تتم على النص الخام `btrim(customer_phone)`:
--   • `v_stats_customers`            (0022:649-667)
--   • `apply_discount`  سقف كل عميل  (0024:527-528)
--   • `redeem_coupon`   سقف كل عميل  (0024:684)
--   • `section_stats('customers')`   (0024:1578-1609 — الأحدث، وهو المطبَّق)
-- فـ «01012345678» و«+201012345678» و«00201012345678» و«010 1234 5678»
-- **أربعة عملاء مختلفين** عند القاعدة. والنتيجة ثلاثة أعطال حقيقية لا نظرية:
--   (١) «عميل عائد» يُحسب جديداً كلما بدّل صيغة كتابة رقمه ⇒ نسبة العودة كذبة.
--   (٢) سقف «مرة واحدة لكل عميل» على الكوبون يُخترق بإضافة `+2` ⇒ حملة بسقف
--       مئة استخدام تُستهلك بلا حد من هاتف واحد.
--   (٣) أي ولاء أو رصيد عميل يُبنى لاحقاً (المرحلة ١٢ب) يرث الخلل من أساسه.
--
-- ── الشكل المعياري (قرار محسوم — منفَّذ حرفياً في normalize_phone) ──────────
-- الوطني المصري `01XXXXXXXXX` (١١ خانة). الخوارزمية بهذا الترتيب:
--   (١) احذف كل ما ليس رقماً.  (٢) إن بدأ بـ `00` فاحذفهما.
--   (٣) `20` وطوله ١٢  ⇒ `'0' || substring(from 3)`.
--   (٤) يبدأ بـ `1` وطوله ١٠ ⇒ `'0' || النص`.
--   (٥) وإلا **أعِد الأرقام كما هي بلا تخمين** — الرقم الأجنبي لا يُفسد.
--
-- ── ⚠ أثر متوقع ومقصود على الأرقام (اقرأه قبل أن تظنه عطلاً) ────────────────
-- **أعداد «عملاء الفترة» و«العملاء الجدد» و«العائدون» و«نسبة العودة» ستتغيّر
-- بعد تطبيق هذه الهجرة** — في اتجاه الانخفاض غالباً، لأن ما كان يُحسب ثلاثة
-- عملاء صار عميلاً واحداً. هذا **تصحيح لا انحدار**: الرقم القديم كان يعدّ
-- الصيغ لا الأشخاص. ولا يتغيّر جنيه واحد في أي حساب مالي — الدفتر والإجماليات
-- والهوامش لا تمسّها هذه الهجرة بحرف.
--
-- ── لماذا هجرة جديدة لا تعديل 0022 و0024 (D-03) ────────────────────────────
-- الهجرة المطبَّقة لا تُعدَّل أبداً؛ التصحيح ملف جديد. ولذلك تُعاد هنا كتابة
-- الكائنات الأربعة كاملة (`create or replace` يستبدل الجسم كله ولا يرقّعه)،
-- **ونسخُها حرفيٌّ من 0024 عدا مواضع المطابقة وحدها** — نفس ما فعلته 0024 حين
-- نسخت `section_stats` من 0022 لتضيف قسمها السابع (تعليق 0024:1242-1246).
-- ولا تغيير في أي **نوع إرجاع** ولا في أي توقيع ⇒ لا يقع فخّ
-- «cannot change return type» ولا فخّ «function is not unique»، ولا حاجة إلى
-- `drop function` أصلاً. والقسم (٩) يفحص الأمرين صراحةً بعد التنفيذ.
--
-- ── ما لا يُغيَّر هنا عمداً ──────────────────────────────────────────────────
--   • `bookings.customer_phone` يبقى **كما كتبه العميل حرفاً بحرف**. التطبيع
--     عمود مشتق بجواره لا كتابة فوق مُدخَل المستخدم: الرقم كما كُتب قد يكون
--     دليلاً في نزاع، ونحن لا نملك حق إعادة كتابة ما أدخله.
--   • `quote_requests.customer_phone` (طلبات عرض السعر) بلا تطبيع: لا مطابقة
--     عميل تقع عليه اليوم، وإضافته توسعة نطاق بلا مستهلك (النمط ٣ في LESSONS).
--   • `coupon_redemptions.phone` يبقى خاماً كذلك — والمطابقة عليه تمرّ بالدالة،
--     ويسندها فهرس تعبيري (القسم ٣).
--
-- ── الفخاخ المُتحسَّب لها في هذا الملف ──────────────────────────────────────
--   • العمود المولَّد يشترط دالة `immutable` صرفة ⇒ القسم (١-ب) يتحقق من
--     `provolatile` **قبل** محاولة الإضافة، والقسم (٢) يسقط إلى «عمود عادي
--     بمُشغِّل» ويطبع سبب التعذّر بدل أن تنهار الهجرة.
--   • `create or replace function` **لا يعيد ضبط الصلاحيات** ⇒ القسم (٨) يعيد
--     السحب والمنح صراحةً لكل دالة أُعيدت كتابتها.
--   • كل `security definer` بـ `set search_path = ''` وكل مرجع مؤهَّل.
--   • لا جدول جديد في هذه الهجرة ⇒ لا فخّ `TRUNCATE` لـ anon هنا، ومع ذلك
--     يفحص القسم (٩) أن الزائر لم يكتسب شيئاً جديداً.
--
-- آمنة لإعادة التنفيذ (idempotent) بالكامل.
-- المرجع: 0022_analytics.sql · 0024_discounts.sql · handover/DECISIONS.md (D-03)
-- الاختبار: supabase/tests/phone_tests.sql (المجموعة العاشرة)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (١) normalize_phone — الشكل المعياري، ودالة واحدة لا تكرار
--
-- `immutable` **صرفة**: لا قراءة من جدول ولا من إعداد ولا `now()` — نصٌّ داخل
-- ونصٌّ خارج. وهذا شرط استعمالها في عمود مولَّد وفي فهرس تعبيري معاً.
--
-- ⚠ والثمن المقابل للـ `immutable`: القيم المخزَّنة في العمود المولَّد **لا
-- تُعاد حسابها** حين يتغيّر جسم الدالة لاحقاً. فأي تعديل مستقبلي على المنطق
-- يلزمه ترحيل يعيد بناء العمود (إسقاطه وإضافته من جديد)، وإلا صارت القيم
-- المخزَّنة تصف نسخة ماتت. القسم (٩-٤) يمسك هذا الانحراف: يقارن كل صف بناتج
-- الدالة الحالية ويُسقط الهجرة إن اختلفا.
--
-- الأرقام العربية الهندية (٠-٩) والفارسية (۰-۹) تُترجَم أولاً: لوحة المفاتيح
-- العربية تنتجها فعلاً — وهي **أرقام** لا محارف زائدة، فحذفها بوصفها «ما ليس
-- رقماً» كان يمحو الهاتف كله ويصير كل من كتب برقم عربي عميلاً واحداً مجهولاً.
-- (نفس علاج `toLatinDigits` في app/admin/pricing/actions.ts:33، لكن في القاعدة.)
-- ----------------------------------------------------------------------------
create or replace function public.normalize_phone(p_phone text)
returns text
language sql
immutable
set search_path = ''
as $$
  with raw as (
    select regexp_replace(
             translate(
               coalesce(p_phone, ''),
               '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹',
               '01234567890123456789'
             ),
             '[^0-9]', '', 'g'
           ) as d
  ),
  stripped as (
    -- (٢) بادئة الاتصال الدولي `00` تُحذف قبل أي قياس طول
    select case when left(r.d, 2) = '00' then substring(r.d from 3) else r.d end as d
    from raw r
  )
  select case
           -- بلا خانة رقمية واحدة: null لا نصٌّ فارغ — كي لا يتجمّع كل من لا
           -- رقم له في «عميل» واحد وهمي في أي group by.
           when s.d = '' then null
           -- (٣) الشكل الدولي المصري: 20 + عشر خانات
           when left(s.d, 2) = '20' and length(s.d) = 12 then '0' || substring(s.d from 3)
           -- (٤) المحلي بلا صفر البداية
           when left(s.d, 1) = '1'  and length(s.d) = 10 then '0' || s.d
           -- (٥) 🔒 ما ليس مصرياً يخرج كما دخل (بعد تجريده من الرموز وحدها)
           else s.d
         end
  from stripped s;
$$;

comment on function public.normalize_phone(text) is
  'الشكل المعياري لرقم الهاتف: الوطني المصري 01XXXXXXXXX. يحذف ما ليس رقماً (بعد ترجمة الأرقام العربية الهندية)، ثم 00، ثم يحوّل 20+10 و 1+9 إلى الشكل الوطني؛ وما ليس مصرياً يخرج كأرقامه بلا تخمين. immutable صرفة — شرط العمود المولَّد والفهرس التعبيري.';

-- (١-ب) 🔒 التحقق قبل الاستعمال: العمود المولَّد يشترط `immutable` فعلياً في
--       الكتالوج لا في نيّة الكاتب. الفحص هنا يسبق الإضافة ويعطي رسالة مفهومة
--       بدل خطأ Postgres الغامض «functions in index expression must be marked
--       IMMUTABLE» بعد أسطر.
do $$
declare
  v_vol   "char";
  v_check text;
begin
  select p.provolatile into v_vol
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'normalize_phone'
    and p.pronargs = 1;

  if v_vol is null then
    raise exception '0026: normalize_phone(text) غير موجودة بعد إنشائها — توقّف';
  end if;
  if v_vol <> 'i' then
    raise exception
      '0026: normalize_phone معلَّمة «%» لا immutable — العمود المولَّد والفهرس التعبيري كلاهما مستحيل',
      v_vol;
  end if;

  -- شاهد سلوكي لا كتالوجي فقط: الأشكال الأربعة تنتهي إلى نص واحد، والأجنبي لا
  -- يُمسّ. فحصٌ يسقط الهجرة هنا خيرٌ من عمود مولَّد يخزّن خطأً في كل صف.
  -- ⚠ `coalesce(...)` داخل التجميع لا خارجه: `string_agg` تتخطى القيم الفارغة،
  -- فناتجٌ null لمُدخل مخالف كان سيعطي v_check = null ⇒ فحصٌ لا يمكن أن يفشل
  -- (النمط ٩ في handover/LESSONS.md).
  select string_agg(t.inp || ' ⇒ ' || coalesce(x.got, 'null'), ' | ')
    into v_check
  from (values
    ('01012345678'),   ('+201012345678'), ('00201012345678'),
    ('010 1234 5678'), ('1012345678')
  ) as t(inp)
  cross join lateral (select public.normalize_phone(t.inp) as got) x
  where x.got is distinct from '01012345678';

  if v_check is not null then
    raise exception '0026: normalize_phone لا توحّد الأشكال المصرية — الناتج المخالف: %', v_check;
  end if;

  if public.normalize_phone('+44 20 7946 0958') is distinct from '442079460958' then
    raise exception '0026: normalize_phone أفسدت رقماً أجنبياً — الناتج «%»',
      coalesce(public.normalize_phone('+44 20 7946 0958'), 'null');
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- (٢) bookings.phone_norm — عمود مولَّد مخزَّن + فهرس
--
-- ⚠ لماذا عمود لا دالة في كل استعلام: المطابقة تقع في أربعة مواضع، وفي `group
-- by` و`partition by` على كل الحجوزات. عمودٌ مخزَّن يجعل الهوية **حقيقة في
-- الصف** لا اتفاقاً بين أربعة كتّاب — وهو بالضبط ما انكسر في هذا المشروع من
-- قبل حين اختلف وكيلان في اسم عمود (النمط ٤ في LESSONS).
--
-- والمسار البديل مكتوب هنا لا مؤجَّلاً: إن رفضت القاعدة العمود المولَّد لأي
-- سبب، يُنشأ **عمود عادي بمُشغِّل** يملأه قبل كل إدراج وتعديل، ويُطبع سبب
-- التعذّر في مخرجات الهجرة (`raise notice`) كي لا يمرّ الفارق صامتاً بين نسخة
-- وأخرى. القسم (٩) يفحص العمودين بنفس التأكيد فلا يفرّق بينهما إلا في السبب.
-- ----------------------------------------------------------------------------
do $$
declare
  v_gen text;
  v_err text;
begin
  select c.is_generated into v_gen
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name   = 'bookings'
    and c.column_name  = 'phone_norm';

  if v_gen is not null then
    raise notice '↺ 0026: bookings.phone_norm موجود سلفاً (is_generated = %) — لا إعادة إنشاء', v_gen;
  else
    begin
      execute $ddl$
        alter table public.bookings
          add column phone_norm text
          generated always as (public.normalize_phone(customer_phone)) stored
      $ddl$;
      raise notice '✔ 0026: bookings.phone_norm عمود مولَّد مخزَّن';
    exception
      when others then
        get stacked diagnostics v_err = message_text;
        raise notice
          '⚠ 0026: تعذّر العمود المولَّد — السبب: «%». التحويل إلى عمود عادي بمُشغِّل.', v_err;
        execute 'alter table public.bookings add column if not exists phone_norm text';
    end;
  end if;
end;
$$;

-- (٢-ب) المُشغِّل — يُركَّب **فقط** حين لا يكون العمود مولَّداً. تركيبه فوق
--       عمود مولَّد خطأ في ذاته (الإسناد إليه مرفوض من القاعدة).
create or replace function public.bookings_set_phone_norm()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  new.phone_norm := public.normalize_phone(new.customer_phone);
  return new;
end;
$$;

comment on function public.bookings_set_phone_norm() is
  'مسار احتياطي وحده: يملأ bookings.phone_norm حين تتعذّر الأعمدة المولَّدة. لا يُركَّب إطلاقاً فوق عمود مولَّد.';

do $$
declare
  v_gen text;
  v_n   bigint;
begin
  select c.is_generated into v_gen
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name   = 'bookings'
    and c.column_name  = 'phone_norm';

  if v_gen is null then
    raise exception '0026: bookings.phone_norm لم يُنشأ بأي مسار — توقّف';
  end if;

  if v_gen = 'ALWAYS' then
    -- المسار الأصلي: القاعدة تحسب العمود بنفسها، فلا مُشغِّل ولا ردم
    drop trigger if exists bookings_set_phone_norm on public.bookings;
  else
    drop trigger if exists bookings_set_phone_norm on public.bookings;
    create trigger bookings_set_phone_norm
      before insert or update on public.bookings
      for each row execute function public.bookings_set_phone_norm();

    -- الردم: الصفوف القائمة لا يمسّها المُشغِّل
    update public.bookings b
       set phone_norm = public.normalize_phone(b.customer_phone)
     where b.phone_norm is distinct from public.normalize_phone(b.customer_phone);
    get diagnostics v_n = row_count;
    raise notice '⚠ 0026: المسار الاحتياطي — مُشغِّل مركَّب و % صفاً رُدمت', v_n;
  end if;
end;
$$;

comment on column public.bookings.phone_norm is
  'هوية العميل: customer_phone بعد التطبيع إلى الشكل المصري 01XXXXXXXXX (normalize_phone). عليه وحده تقع كل مطابقة عميل. الخام يبقى في customer_phone بلا مساس.';

-- الفهرس المركَّب يخدم الاستعمالين معاً: البحث بالهوية، و«أول حجز له على
-- الإطلاق» (‏min(created_at) لكل هوية) في section_stats و v_stats_customers.
create index if not exists bookings_phone_norm_idx
  on public.bookings (phone_norm, created_at);

-- ----------------------------------------------------------------------------
-- (٣) فهرس تعبيري على سجل استخدام الكوبونات
--
-- المطابقة في `apply_discount` و`redeem_coupon` صارت على
-- `normalize_phone(r.phone)`، ففهرس `coupon_redemptions_phone_idx` (0024:287)
-- على العمود الخام لم يعد يخدمها. ولم نضف عموداً مولَّداً هنا: الجدول
-- append-only ولا يُقرأ إلا بمعرّف الكوبون، والفهرس التعبيري يكفي بلا توسيع
-- سطح المخطط. والفهرس القديم يبقى — تقارير اللوحة تبحث بالخام أيضاً.
-- ----------------------------------------------------------------------------
create index if not exists coupon_redemptions_phone_norm_idx
  on public.coupon_redemptions (coupon_id, (public.normalize_phone(phone)));

-- ----------------------------------------------------------------------------
-- (٤) v_stats_customers — الهوية صارت phone_norm
--
-- `create or replace view` لا `drop`+`create`: الأعمدة وأنواعها كما هي حرفاً
-- بحرف، والاستبدال في مكانه **يحفظ المنح القائمة** فلا تنكسر شاشة الإحصائيات
-- بين سطرين. ومع ذلك يُعاد تثبيت المنح في القسم (٨) صراحةً — إعادة التأكيد
-- أرخص من ثغرة.
--
-- `security_invoker = true` **شرط بقاء** لا زينة: 0025 (٦-٥) يُسقط أي ترحيل
-- يفقده أحد العروض الثمانية، لأن المنح للمسجَّل يصير حينها تسريباً فورياً.
--
-- 🔒 والهاتف — خاماً كان أو مطبَّعاً — **لا يخرج من نوع الإرجاع** كما كان.
-- ----------------------------------------------------------------------------
create or replace view public.v_stats_customers
with (security_invoker = true)
as
with tagged as (
  select
    (b.created_at at time zone 'Africa/Cairo')::date as day,
    b.phone_norm                                     as phone,
    b.total                                          as total,
    row_number() over (
      partition by b.phone_norm
      order by b.created_at asc, b.id asc
    )                                                as seq
  from public.bookings b
  where b.phone_norm is not null
)
select
  t.day,
  (count(*))::integer                              as orders_count,
  (count(distinct t.phone))::integer               as customers_count,
  (count(*) filter (where t.seq = 1))::integer     as new_customers,
  (count(*) filter (where t.seq > 1))::integer     as returning_orders,
  coalesce(sum(t.total), 0)::numeric(14,2)         as orders_value
from tagged t
group by t.day;

comment on view public.v_stats_customers is
  'العملاء باليوم: طلبات، عملاء ذلك اليوم، جدد، وطلبات عائدين. الهوية bookings.phone_norm (الهاتف مطبَّعاً) وهي تُستعمل للتجميع ولا تخرج في نوع الإرجاع. ⚠ أعداد الجدد/العائدين تغيّرت عن 0022 بعد التطبيع — تصحيح لا انحدار.';

-- ----------------------------------------------------------------------------
-- (٥) apply_discount — سقف «مرة لكل عميل» يطابق بالهوية المطبَّعة
--
-- منسوخة حرفياً من 0024 (السطور 418-603) عدا موضع المطابقة وحده. التوقيع ونوع
-- الإرجاع وكل حساب الأرضية بلا حرف تغيير.
-- ----------------------------------------------------------------------------
create or replace function public.apply_discount(
  p_code         text,
  p_total        numeric,
  p_class_slug   text,
  p_partner_cost numeric,
  p_phone        text
)
returns table (
  applied     boolean,
  amount      numeric,
  total_after numeric,
  clamped     boolean,
  rejection   text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_code      text;
  v_total     numeric;
  v_cfg       record;
  v_c         record;
  v_phone     text;
  v_norm      text;   -- 0026: الهاتف بعد التطبيع — عليه تقع المطابقة
  v_used      integer;
  v_nominal   numeric;
  v_allowed   numeric;
  v_cost      numeric;
  v_floor     numeric;
  v_disp      numeric;
  v_minprice  numeric;
  v_mintotal  numeric;
  v_max       numeric;
begin
  v_total := round(coalesce(p_total, 0), 2);
  v_code  := public.discount_normalize_code(p_code);

  -- بلا رمز: ليس رفضاً — الرحلة ببساطة بلا خصم
  if v_code is null then
    applied := false; amount := 0; total_after := v_total;
    clamped := false; rejection := null;
    return next; return;
  end if;

  -- الرفض الافتراضي لكل المسارات التالية
  applied := false; amount := 0; total_after := v_total; clamped := false;

  if v_total <= 0 then
    rejection := 'below-min-total';
    return next; return;
  end if;

  select * into v_cfg from public.discount_config();

  -- النظام مطفأ ⇒ نفس رسالة «غير موجود»: حالة النظام ليست معلومة عامة
  if not v_cfg.enabled then
    rejection := 'not-found';
    return next; return;
  end if;

  select c.* into v_c
  from public.coupons c
  where c.code = v_code;

  -- فحصان منفصلان لا شرطٌ واحد: قراءة حقلٍ من سجلٍّ لم يُسنَد سلوكٌ لا يُعوَّل عليه
  if not found then
    rejection := 'not-found';
    return next; return;
  end if;

  -- «معطَّل» يخرج بنفس رمز «غير موجود» (قرار ٨): التفريق يخبر من يخمّن أنه اقترب
  if not v_c.enabled then
    rejection := 'not-found';
    return next; return;
  end if;

  if v_c.starts_at is not null and now() < v_c.starts_at then
    rejection := 'not-started';
    return next; return;
  end if;

  if v_c.ends_at is not null and now() >= v_c.ends_at then
    rejection := 'expired';
    return next; return;
  end if;

  if coalesce(array_length(v_c.class_slugs, 1), 0) > 0
     and not (coalesce(btrim(p_class_slug), '') = any (v_c.class_slugs)) then
    rejection := 'class-not-eligible';
    return next; return;
  end if;

  if v_c.min_trip_total is not null and v_total < v_c.min_trip_total then
    rejection := 'below-min-total';
    return next; return;
  end if;

  if v_c.max_uses is not null and v_c.used_count >= v_c.max_uses then
    rejection := 'exhausted';
    return next; return;
  end if;

  -- سقف العميل: يُفحص **حين يُعرف الهاتف فقط**. شاشة العروض لا هاتف فيها،
  -- ولا يجوز أن تطلبه لأجل التحقق؛ والفحص الملزم يقع في redeem_coupon داخل
  -- معاملة الحجز حيث الهاتف معروف حتماً.
  --
  -- 0026: المطابقة على الشكل المعياري لا على النص الخام. «01012345678» و
  -- «+201012345678» و«010 1234 5678» رقمٌ واحد، وقبل التطبيع كانت ثلاثة عملاء
  -- فيمرّ من سقف «مرة لكل عميل» ثلاث مرات. شرط الدخول يبقى على `v_phone` الخام
  -- كما كان (الشاشة بلا هاتف لا تُفحص)، والمقارنة وحدها انتقلت إلى فضاء
  -- التطبيع. و`is not distinct from` لا `=`: حين لا رقم فيه أي خانة تصير
  -- القيمتان null، والمساواة مع null تُرجع unknown فيسقط الفحص صامتاً.
  v_phone := nullif(btrim(coalesce(p_phone, '')), '');
  v_norm  := public.normalize_phone(p_phone);
  if v_c.max_uses_per_phone is not null and v_phone is not null then
    select count(*)::integer into v_used
    from public.coupon_redemptions r
    where r.coupon_id = v_c.id
      and public.normalize_phone(r.phone) is not distinct from v_norm;

    if v_used >= v_c.max_uses_per_phone then
      rejection := 'per-customer-limit';
      return next; return;
    end if;
  end if;

  -- ── الحساب ────────────────────────────────────────────────────────────────
  --
  -- ⚠ **الجنيه الصحيح ثابتٌ في هذا المشروع.** `quote_price` تُرجع الإجمالي
  -- بـ `round(...)` بلا خانات عشرية (0005:327 و0011:216)، فكل مستهلك بُني على
  -- ذلك — ومنه `splitAmounts` في `components/booking/checkout/payment.ts` الذي
  -- يقرّب الإجمالي إلى جنيه قبل حساب العربون. فلو أخرجت طبقةُ الخصم كسوراً
  -- (١٢٧٫٥٠ من كوبون ١٠٪ فوق ١٢٧٥) لاختلف ما تعرضه شاشة التأكيد عمّا تخزّنه
  -- `create_booking` — رقمان لشيء واحد يراهما العميل في دقيقتين متتاليتين.
  -- ولذلك يبقى الخصم بالجنيه الصحيح، **والتقريب في اتجاه الأمان دائماً**:
  -- `round` للقيمة الاسمية، و`floor` لكل سقف (سقف الكوبون وسقف النظام وأرضية
  -- الهامش) كي لا يرفع التقريبُ خصماً فوق حدٍّ ضبطه المالك أو فوق الأرضية.
  if v_c.kind = 'percent' then
    v_nominal := round(v_total * v_c.value / 100);
  else
    v_nominal := round(v_c.value);
  end if;

  if v_c.max_amount is not null then
    v_nominal := least(v_nominal, floor(v_c.max_amount));
  end if;
  v_nominal := least(v_nominal, v_total);

  -- حارس ثانٍ فوق الكوبون: أقصى نسبة يقبلها النظام مهما كان الكوبون
  v_allowed := least(v_nominal, floor(v_total * v_cfg.max_percent / 100));

  -- ── 🔒 أرضية الهامش — الحاجز الذي لا يتخطاه أي مستدعٍ ────────────────────
  v_cost := public.discount_implied_cost(v_total, p_partner_cost);

  select dc.min_margin_amount into v_disp from public.dispatch_config() dc;

  v_floor := greatest(
    coalesce(v_cfg.min_margin_amount_after_discount, 0),
    round(v_cost * coalesce(v_cfg.min_margin_percent_after_discount, 0) / 100, 2),
    coalesce(v_disp, 0)
  );

  select t.min_price into v_minprice
  from public.vehicle_classes vc
  join public.tariffs t on t.class_id = vc.id
  where vc.slug = btrim(coalesce(p_class_slug, ''));

  v_mintotal := greatest(v_cost + v_floor, coalesce(v_minprice, 0));
  -- `floor` لا `round`: تقريبٌ لأعلى هنا يخترق الأرضية بنصف جنيه — والأرضية حدٌّ
  -- لا يُقارَب. وحين لا تتسع المساحة لجنيه واحد يصير v_max صفراً فيقع الرفض،
  -- وهو صدقٌ لا عطل.
  v_max      := floor(v_total - v_mintotal);

  if v_max <= 0 or v_allowed <= 0 then
    -- لا مساحة لأي خصم: الرفض هنا صدقٌ لا عطل
    rejection := 'floor-guard';
    return next; return;
  end if;

  if v_allowed > v_max then
    v_allowed := v_max;
  end if;

  applied     := true;
  amount      := v_allowed;
  total_after := round(v_total - v_allowed, 2);
  clamped     := v_allowed < v_nominal;
  rejection   := null;
  return next;
end;
$$;

comment on function public.apply_discount(text, numeric, text, numeric, text) is
  'الدالة الوحيدة التي تحسب خصماً. (0026: سقف الاستخدام لكل عميل يطابق بـ normalize_phone لا بالنص الخام.) تُستدعى بعد quote_price لا داخلها، وتفرض بنفسها أن الهامش المتبقي ≥ الأرضية (ومنها أرضية البث و min_price للفئة) فتقلّص الخصم بدل رفضه حين يمكن. لا تُمنح لـ authenticated: المتعهد يستطيع استكشاف الأرضية من p_partner_cost.';

-- ----------------------------------------------------------------------------
-- (٦) redeem_coupon — الفحص **الملزم** لسقف كل عميل
--
-- منسوخة حرفياً من 0024 (السطور 621-704) عدا موضع المطابقة وحده. وهذا هو
-- الموضع الحاسم: `apply_discount` تفحص حين يُعرف الهاتف (وشاشة العروض بلا
-- هاتف)، أما هذه فتقع **داخل معاملة create_booking** حيث الهاتف معروف حتماً —
-- فلو بقيت على النص الخام لظلّ السقف مخترقاً بإضافة `+2` مهما طُبِّع ما قبله.
-- ----------------------------------------------------------------------------
create or replace function public.redeem_coupon(
  p_code    text,
  p_booking uuid,
  p_amount  numeric,
  p_phone   text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_code    text;
  v_c       record;
  v_phone   text;
  v_norm    text;   -- 0026: الهاتف بعد التطبيع
  v_used    integer;
  v_clamped boolean;
  v_id      uuid;
begin
  v_code := public.discount_normalize_code(p_code);

  if v_code is null then
    raise exception 'رمز الكوبون مطلوب لتسجيل الاستخدام' using hint = 'invalid-input';
  end if;
  if p_booking is null then
    raise exception 'الحجز مطلوب لتسجيل استخدام الكوبون' using hint = 'invalid-input';
  end if;

  -- 🔒 قفل الصف قبل أي قراءة للعدّاد — نظير accept_offer في المرحلة ٦
  select c.* into v_c
  from public.coupons c
  where c.code = v_code
  for update;

  if not found then
    raise exception 'رمز الخصم غير صالح' using hint = 'coupon-rejected';
  end if;

  if not v_c.enabled then
    raise exception 'رمز الخصم غير صالح' using hint = 'coupon-rejected';
  end if;

  if v_c.starts_at is not null and now() < v_c.starts_at then
    raise exception 'رمز الخصم غير صالح' using hint = 'coupon-rejected';
  end if;

  if v_c.ends_at is not null and now() >= v_c.ends_at then
    raise exception 'رمز الخصم غير صالح' using hint = 'coupon-rejected';
  end if;

  if v_c.max_uses is not null and v_c.used_count >= v_c.max_uses then
    raise exception 'انتهت الكمية المتاحة من رمز الخصم' using hint = 'coupon-exhausted';
  end if;

  -- 0026: نفس تحويل apply_discount حرفياً — والفحص الملزم هو هذا لا ذاك، فهو
  -- الذي يقع داخل معاملة الحجز حيث الهاتف معروف حتماً. بقاؤه على النص الخام
  -- بعد تطبيع الفحص المتقدّم كان سيعطي «تحقق ناجح ثم حجز يفشل» أو العكس.
  -- الرقم بلا خانة واحدة يقع في دلوٍ واحد (null) كما كان يقع في دلو '' قبلها.
  v_phone := nullif(btrim(coalesce(p_phone, '')), '');
  v_norm  := public.normalize_phone(p_phone);
  if v_c.max_uses_per_phone is not null then
    select count(*)::integer into v_used
    from public.coupon_redemptions r
    where r.coupon_id = v_c.id
      and public.normalize_phone(r.phone) is not distinct from v_norm;

    if v_used >= v_c.max_uses_per_phone then
      raise exception 'بلغت حدّ استخدام رمز الخصم لهذا الرقم'
        using hint = 'coupon-per-customer';
    end if;
  end if;

  v_clamped := coalesce(nullif(current_setting('tours.discount_clamped', true), ''), 'off') = 'on';

  update public.coupons c
     set used_count = c.used_count + 1
   where c.id = v_c.id;

  insert into public.coupon_redemptions (coupon_id, booking_id, code, phone, amount, clamped)
  values (v_c.id, p_booking, v_code, v_phone, round(greatest(coalesce(p_amount, 0), 0), 2), v_clamped)
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.redeem_coupon(text, uuid, numeric, text) is
  'تسجيل استخدام كوبون ذرّياً. (0026: سقف كل عميل يطابق بـ normalize_phone.) قفل صف + قيد تحقّق على نفس الصف + فهرس فريد لكل حجز. تُستدعى داخل معاملة create_booking وحدها ولا تُمنح لأي دور مستخدم.';

-- ----------------------------------------------------------------------------
-- (٧) section_stats — قسم `customers` يطابق بالهوية المطبَّعة
--
-- ⚠ الدالة تُعاد كتابتها **كاملة** لأن `create or replace` يستبدل الجسم كله؛
-- والأقسام السبعة منسوخة حرفياً من 0024 (السطور 1248-1859) بلا تغيير حرف، عدا
-- أربعة مواضع مطابقة في فرع `customers` وحده ونصَّ «؟» واحد صار يقول الحقيقة.
-- والنسخة المطبَّقة اليوم هي نسخة 0024 لا 0022 — فمنها نُسخ لا من الأقدم.
--
-- ⚠ **تحذير تنسيق للمرحلة التالية:** أي هجرة لاحقة تضيف قسماً ثامناً ستنسخ هذه
-- الدالة من جديد. فلتنسخها من **0026** لا من 0024، وإلا عاد قسم العملاء إلى
-- `btrim(customer_phone)` صامتاً. والقسم (٩-٣) هنا يمسك ذلك إن وقع قبلها.
-- ----------------------------------------------------------------------------
create or replace function public.section_stats(p_section text, p_from date, p_to date)
returns table (
  key           text,
  label         text,
  value         numeric,
  delta_percent numeric,
  format        text,
  help          text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_section text;
  v_from    date;
  v_to      date;
  v_len     integer;
  v_pfrom   date;
  v_pto     date;
begin
  if not public.analytics_admin_allowed() then
    raise exception 'إحصائيات الأقسام متاحة للإدارة فقط' using hint = 'forbidden';
  end if;

  v_section := lower(nullif(btrim(coalesce(p_section, '')), ''));

  if v_section is null
     or v_section not in ('orders', 'partners', 'treasury', 'customers', 'content',
                          'locales', 'discounts') then
    raise exception
      'قسم إحصائي مجهول: «%» — المسموح: orders|partners|treasury|customers|content|locales|discounts',
      coalesce(nullif(btrim(coalesce(p_section, '')), ''), 'بلا')
      using hint = 'invalid-input';
  end if;

  v_to   := coalesce(p_to, (now() at time zone 'Africa/Cairo')::date);
  v_from := coalesce(p_from, v_to - 29);

  if v_from > v_to then
    raise exception 'الفترة معكوسة: من % إلى %', v_from, v_to using hint = 'invalid-input';
  end if;

  -- الفترة السابقة: نفس الطول، ملاصقة، ومنتهية قبل بداية الفترة الحالية بيوم.
  v_len   := (v_to - v_from) + 1;
  v_pto   := v_from - 1;
  v_pfrom := v_from - v_len;

  -- ── (٦-١-أ) الطلبات ──────────────────────────────────────────────────────
  if v_section = 'orders' then
    declare
      v_c_count     numeric := 0;
      v_c_value     numeric := 0;
      v_c_confirmed numeric := 0;
      v_c_completed numeric := 0;
      v_c_cancelled numeric := 0;
      v_c_avg       numeric := 0;
      v_c_rate      numeric := 0;
      v_p_count     numeric := 0;
      v_p_value     numeric := 0;
      v_p_confirmed numeric := 0;
      v_p_completed numeric := 0;
      v_p_cancelled numeric := 0;
      v_p_avg       numeric := 0;
      v_p_rate      numeric := 0;
    begin
      select
        coalesce(sum(o.orders_count), 0),
        coalesce(sum(o.orders_value), 0),
        coalesce(sum(o.orders_count) filter (
          where o.status in ('confirmed', 'assigned', 'completed')), 0),
        coalesce(sum(o.orders_count) filter (where o.status = 'completed'), 0),
        coalesce(sum(o.orders_count) filter (where o.status = 'cancelled'), 0)
      into v_c_count, v_c_value, v_c_confirmed, v_c_completed, v_c_cancelled
      from public.v_stats_orders o
      where o.day between v_from and v_to;

      select
        coalesce(sum(o.orders_count), 0),
        coalesce(sum(o.orders_value), 0),
        coalesce(sum(o.orders_count) filter (
          where o.status in ('confirmed', 'assigned', 'completed')), 0),
        coalesce(sum(o.orders_count) filter (where o.status = 'completed'), 0),
        coalesce(sum(o.orders_count) filter (where o.status = 'cancelled'), 0)
      into v_p_count, v_p_value, v_p_confirmed, v_p_completed, v_p_cancelled
      from public.v_stats_orders o
      where o.day between v_pfrom and v_pto;

      v_c_avg  := case when v_c_count > 0 then round(v_c_value / v_c_count, 2) else 0 end;
      v_p_avg  := case when v_p_count > 0 then round(v_p_value / v_p_count, 2) else 0 end;
      v_c_rate := case when v_c_count > 0 then round(100.0 * v_c_cancelled / v_c_count, 1) else 0 end;
      v_p_rate := case when v_p_count > 0 then round(100.0 * v_p_cancelled / v_p_count, 1) else 0 end;

      return query
      select x.k, x.l, x.v, x.d, x.f, x.h
      from (values
        ('orders_count'::text, 'عدد الطلبات'::text,
         v_c_count::numeric, public.stats_delta(v_c_count, v_p_count)::numeric,
         'number'::text,
         'كل حجز أُنشئ داخل الفترة مهما صارت حالته بعد ذلك.'::text),
        ('orders_value', 'قيمة الطلبات',
         v_c_value, public.stats_delta(v_c_value, v_p_value), 'money',
         'مجموع إجمالي الحجوزات المُنشأة في الفترة — قيمة العميل لا صافي المنصة.'),
        ('confirmed_count', 'طلبات مؤكدة فأكثر',
         v_c_confirmed, public.stats_delta(v_c_confirmed, v_p_confirmed), 'number',
         'الحجوزات التي بلغت «مؤكد» أو «مُسند» أو «مكتمل» — أي وصل تحصيلها.'),
        ('completed_count', 'رحلات مكتملة',
         v_c_completed, public.stats_delta(v_c_completed, v_p_completed), 'number',
         'الحجوزات التي انتهت حالتها إلى «مكتمل».'),
        ('cancelled_rate', 'نسبة الإلغاء',
         v_c_rate, public.stats_delta(v_c_rate, v_p_rate), 'percent',
         'الملغاة ÷ كل طلبات الفترة × ١٠٠.'),
        ('avg_order_value', 'متوسط قيمة الطلب',
         v_c_avg, public.stats_delta(v_c_avg, v_p_avg), 'money',
         'قيمة الطلبات ÷ عددها.')
      ) as x(k, l, v, d, f, h);
    end;

  -- ── (٦-١-ب) المتعهدون والبث ──────────────────────────────────────────────
  elsif v_section = 'partners' then
    declare
      v_c_active   numeric := 0;
      v_c_trips    numeric := 0;
      v_c_cost     numeric := 0;
      v_c_margin   numeric := 0;
      v_c_offers   numeric := 0;
      v_c_accept   numeric := 0;
      v_c_disp     numeric := 0;
      v_c_manual   numeric := 0;
      v_c_mintot   numeric := 0;
      v_c_samples  numeric := 0;
      v_c_arate    numeric := 0;
      v_c_mrate    numeric := 0;
      v_c_first    numeric := null;
      v_p_active   numeric := 0;
      v_p_trips    numeric := 0;
      v_p_cost     numeric := 0;
      v_p_margin   numeric := 0;
      v_p_offers   numeric := 0;
      v_p_accept   numeric := 0;
      v_p_disp     numeric := 0;
      v_p_manual   numeric := 0;
      v_p_mintot   numeric := 0;
      v_p_samples  numeric := 0;
      v_p_arate    numeric := 0;
      v_p_mrate    numeric := 0;
      v_p_first    numeric := null;
      v_approved   numeric := 0;
    begin
      select
        coalesce(count(distinct p.subcontractor_id), 0),
        coalesce(count(*), 0),
        coalesce(sum(p.partner_cost), 0),
        coalesce(sum(p.gross_profit), 0)
      into v_c_active, v_c_trips, v_c_cost, v_c_margin
      from public.v_booking_profit p
      where p.subcontractor_id is not null
        and (p.created_at at time zone 'Africa/Cairo')::date between v_from and v_to;

      select
        coalesce(count(distinct p.subcontractor_id), 0),
        coalesce(count(*), 0),
        coalesce(sum(p.partner_cost), 0),
        coalesce(sum(p.gross_profit), 0)
      into v_p_active, v_p_trips, v_p_cost, v_p_margin
      from public.v_booking_profit p
      where p.subcontractor_id is not null
        and (p.created_at at time zone 'Africa/Cairo')::date between v_pfrom and v_pto;

      select
        coalesce(sum(d.offers_count), 0),
        coalesce(sum(d.accepted_count), 0),
        coalesce(sum(d.dispatches_count), 0),
        coalesce(sum(d.manual_count), 0),
        coalesce(sum(d.first_accept_minutes_total), 0),
        coalesce(sum(d.first_accept_samples), 0)
      into v_c_offers, v_c_accept, v_c_disp, v_c_manual, v_c_mintot, v_c_samples
      from public.v_stats_dispatch d
      where d.day between v_from and v_to;

      select
        coalesce(sum(d.offers_count), 0),
        coalesce(sum(d.accepted_count), 0),
        coalesce(sum(d.dispatches_count), 0),
        coalesce(sum(d.manual_count), 0),
        coalesce(sum(d.first_accept_minutes_total), 0),
        coalesce(sum(d.first_accept_samples), 0)
      into v_p_offers, v_p_accept, v_p_disp, v_p_manual, v_p_mintot, v_p_samples
      from public.v_stats_dispatch d
      where d.day between v_pfrom and v_pto;

      select coalesce(count(*), 0) into v_approved
      from public.subcontractors s
      where s.status = 'approved';

      v_c_arate := case when v_c_offers > 0 then round(100.0 * v_c_accept / v_c_offers, 1) else 0 end;
      v_p_arate := case when v_p_offers > 0 then round(100.0 * v_p_accept / v_p_offers, 1) else 0 end;
      v_c_mrate := case when v_c_disp   > 0 then round(100.0 * v_c_manual / v_c_disp, 1)  else 0 end;
      v_p_mrate := case when v_p_disp   > 0 then round(100.0 * v_p_manual / v_p_disp, 1)  else 0 end;
      -- متوسط الفترة = مجموع الأزمنة ÷ عدد العينات، لا متوسط المتوسطات اليومية.
      -- ⚠ صفر لا null حين لا عيّنة: عقد StatCard ينص على `value: number` غير
      -- قابل للتفريغ — وnull هنا كان سيكسر النوع في الواجهة. الغياب يظهر في
      -- delta_percent (وهو null) وفي نص help، لا في القيمة نفسها.
      v_c_first := case when v_c_samples > 0 then round(v_c_mintot / v_c_samples, 1) else 0 end;
      v_p_first := case when v_p_samples > 0 then round(v_p_mintot / v_p_samples, 1) else 0 end;

      return query
      select x.k, x.l, x.v, x.d, x.f, x.h
      from (values
        ('active_partners'::text, 'متعهدون نفّذوا رحلات'::text,
         v_c_active::numeric, public.stats_delta(v_c_active, v_p_active)::numeric,
         'number'::text,
         'عدد المتعهدين المختلفين الذين أُسندت إليهم حجوزات أُنشئت في الفترة.'::text),
        ('approved_partners', 'متعهدون معتمدون',
         v_approved, null, 'number',
         'لقطة لحظية لكل المتعهدين حالتهم «معتمد» — لا تخص فترة فلا مقارنة لها.'),
        ('partner_trips', 'رحلات مُسندة',
         v_c_trips, public.stats_delta(v_c_trips, v_p_trips), 'number',
         'الحجوزات المُنشأة في الفترة ولها متعهد منفّذ.'),
        ('partner_cost', 'تكلفة المتعهدين',
         v_c_cost, public.stats_delta(v_c_cost, v_p_cost), 'money',
         'مستحق المنفّذ الفعلي لهذه الرحلات — رقم إداري لا يظهر في البورتال أبداً.'),
        ('gross_profit', 'هامش المنصة',
         v_c_margin, public.stats_delta(v_c_margin, v_p_margin), 'money',
         'الإيراد ناقص تكلفة المتعهد قبل المصروفات — رقم إداري لا يظهر في البورتال أبداً.'),
        ('accept_rate', 'معدل قبول العروض',
         v_c_arate, public.stats_delta(v_c_arate, v_p_arate), 'percent',
         'العروض المقبولة ÷ كل العروض المرسلة في الفترة × ١٠٠.'),
        ('manual_rate', 'نسبة الإسناد اليدوي',
         v_c_mrate, public.stats_delta(v_c_mrate, v_p_mrate), 'percent',
         'الطلبات التي أسندها فريق التشغيل بيده ÷ كل الطلبات المبثوثة × ١٠٠. ارتفاعها يعني أن البث لا يكفي.'),
        ('first_accept_minutes', 'متوسط زمن أول قبول',
         v_c_first, public.stats_delta(v_c_first, v_p_first), 'duration',
         'بالدقائق: من أول عرض في الطلب إلى أول قبول. صفر يعني «لا قبول واحد في الفترة» لا «فوري».')
      ) as x(k, l, v, d, f, h);
    end;

  -- ── (٦-١-ج) الخزينة ──────────────────────────────────────────────────────
  elsif v_section = 'treasury' then
    declare
      v_c_in   numeric := 0;
      v_c_out  numeric := 0;
      v_c_net  numeric := 0;
      v_c_exp  numeric := 0;
      v_p_in   numeric := 0;
      v_p_out  numeric := 0;
      v_p_net  numeric := 0;
      v_p_exp  numeric := 0;
      v_cash   numeric := 0;
      v_recv   numeric := 0;
    begin
      select
        coalesce(sum(tr.inflow), 0),
        coalesce(sum(tr.outflow), 0),
        coalesce(sum(tr.net), 0)
      into v_c_in, v_c_out, v_c_net
      from public.v_stats_treasury tr
      where tr.day between v_from and v_to;

      select
        coalesce(sum(tr.inflow), 0),
        coalesce(sum(tr.outflow), 0),
        coalesce(sum(tr.net), 0)
      into v_p_in, v_p_out, v_p_net
      from public.v_stats_treasury tr
      where tr.day between v_pfrom and v_pto;

      select coalesce(sum(x.amount), 0) into v_c_exp
      from public.expenses x
      where (x.occurred_at at time zone 'Africa/Cairo')::date between v_from and v_to;

      select coalesce(sum(x.amount), 0) into v_p_exp
      from public.expenses x
      where (x.occurred_at at time zone 'Africa/Cairo')::date between v_pfrom and v_pto;

      -- لقطتان لحظيتان بنفس قاعدة finance_kpis حرفياً — مصدر واحد لا اشتقاق ثانٍ
      select coalesce(sum(ab.balance), 0) into v_cash from public.v_account_balances ab;

      select coalesce(sum(b.amount_remaining), 0) into v_recv
      from public.bookings b
      where b.status in ('confirmed', 'assigned')
        and b.amount_remaining > 0;

      return query
      select x.k, x.l, x.v, x.d, x.f, x.h
      from (values
        ('inflow'::text, 'الوارد'::text,
         v_c_in::numeric, public.stats_delta(v_c_in, v_p_in)::numeric,
         'money'::text,
         'كل قيد داخل على حساب خزينة داخل الفترة. مستحق المتعهد ليس نقداً فلا يدخل هنا.'::text),
        ('outflow', 'المنصرف',
         v_c_out, public.stats_delta(v_c_out, v_p_out), 'money',
         'كل قيد خارج من حساب خزينة داخل الفترة.'),
        ('net', 'صافي الحركة',
         v_c_net, public.stats_delta(v_c_net, v_p_net), 'money',
         'الوارد ناقص المنصرف — قد يكون سالباً.'),
        ('expenses', 'المصروفات',
         v_c_exp, public.stats_delta(v_c_exp, v_p_exp), 'money',
         'المصروفات التشغيلية بتاريخ وقوعها داخل الفترة.'),
        ('cash_on_hand', 'النقد في اليد',
         v_cash, null, 'money',
         'مجموع أرصدة حسابات الخزينة الآن — لقطة لحظية لا تخص فترة.'),
        ('receivables', 'المستحق على العملاء',
         v_recv, null, 'money',
         'باقي قيمة الرحلات المؤكدة والمُسندة التي لم تُنفَّذ بعد — لقطة لحظية.')
      ) as x(k, l, v, d, f, h);
    end;

  -- ── (٦-١-د) العملاء ──────────────────────────────────────────────────────
  --
  -- 0026: هوية العميل صارت `bookings.phone_norm` (عمود مولَّد) لا
  -- `btrim(customer_phone)`. الفرع منسوخ حرفياً من 0024 عدا أربعة مواضع مطابقة.
  -- ⚠ أثر مقصود: أعداد «عملاء الفترة» و«الجدد» و«العائدون» تنخفض/تتغيّر بعد
  -- التطبيع لأن ما كان ثلاثة عملاء صار واحداً — تصحيحٌ لا انحدار.
  -- و`phone_norm is not null` تعني «فيه خانة رقمية واحدة على الأقل»، وهي أدقّ
  -- من `btrim(...) <> ''` التي كانت تعدّ نصاً بلا أرقام عميلاً.
  elsif v_section = 'customers' then
    declare
      v_c_cust   numeric := 0;
      v_c_orders numeric := 0;
      v_c_value  numeric := 0;
      v_c_new    numeric := 0;
      v_c_ret    numeric := 0;
      v_c_rate   numeric := 0;
      v_c_avg    numeric := 0;
      v_p_cust   numeric := 0;
      v_p_orders numeric := 0;
      v_p_value  numeric := 0;
      v_p_new    numeric := 0;
      v_p_ret    numeric := 0;
      v_p_rate   numeric := 0;
      v_p_avg    numeric := 0;
    begin
      -- عدد عملاء الفترة **بـ distinct على مستوى الفترة** لا بجمع أعداد الأيام:
      -- من حجز في يومين عميل واحد لا اثنان.
      select
        coalesce(count(distinct b.phone_norm), 0),
        coalesce(count(*), 0),
        coalesce(sum(b.total), 0)
      into v_c_cust, v_c_orders, v_c_value
      from public.bookings b
      where b.phone_norm is not null
        and (b.created_at at time zone 'Africa/Cairo')::date between v_from and v_to;

      select
        coalesce(count(distinct b.phone_norm), 0),
        coalesce(count(*), 0),
        coalesce(sum(b.total), 0)
      into v_p_cust, v_p_orders, v_p_value
      from public.bookings b
      where b.phone_norm is not null
        and (b.created_at at time zone 'Africa/Cairo')::date between v_pfrom and v_pto;

      -- «عميل جديد» = أول حجز له **على الإطلاق** وقع داخل الفترة
      select coalesce(count(*), 0) into v_c_new
      from (
        select b.phone_norm as ph, min(b.created_at) as first_at
        from public.bookings b
        where b.phone_norm is not null
        group by 1
      ) f
      where (f.first_at at time zone 'Africa/Cairo')::date between v_from and v_to;

      select coalesce(count(*), 0) into v_p_new
      from (
        select b.phone_norm as ph, min(b.created_at) as first_at
        from public.bookings b
        where b.phone_norm is not null
        group by 1
      ) f
      where (f.first_at at time zone 'Africa/Cairo')::date between v_pfrom and v_pto;

      v_c_ret  := greatest(v_c_cust - v_c_new, 0);
      v_p_ret  := greatest(v_p_cust - v_p_new, 0);
      v_c_rate := case when v_c_cust > 0 then round(100.0 * v_c_ret / v_c_cust, 1) else 0 end;
      v_p_rate := case when v_p_cust > 0 then round(100.0 * v_p_ret / v_p_cust, 1) else 0 end;
      v_c_avg  := case when v_c_orders > 0 then round(v_c_value / v_c_orders, 2) else 0 end;
      v_p_avg  := case when v_p_orders > 0 then round(v_p_value / v_p_orders, 2) else 0 end;

      return query
      select x.k, x.l, x.v, x.d, x.f, x.h
      from (values
        ('customers_count'::text, 'عملاء الفترة'::text,
         v_c_cust::numeric, public.stats_delta(v_c_cust, v_p_cust)::numeric,
         'number'::text,
         'عدد العملاء المختلفين الذين حجزوا في الفترة — العميل يُعرَّف برقم هاتفه بعد تطبيعه إلى شكل واحد (01XXXXXXXXX)، والرقم نفسه لا يخرج من القاعدة.'::text),
        ('new_customers', 'عملاء جدد',
         v_c_new, public.stats_delta(v_c_new, v_p_new), 'number',
         'من كان أول حجز له على الإطلاق داخل هذه الفترة.'),
        ('returning_customers', 'عملاء عائدون',
         v_c_ret, public.stats_delta(v_c_ret, v_p_ret), 'number',
         'عملاء الفترة الذين لهم حجز أقدم من الفترة.'),
        ('repeat_rate', 'نسبة العودة',
         v_c_rate, public.stats_delta(v_c_rate, v_p_rate), 'percent',
         'العائدون ÷ عملاء الفترة × ١٠٠.'),
        ('orders_count', 'طلبات الفترة',
         v_c_orders, public.stats_delta(v_c_orders, v_p_orders), 'number',
         'كل الحجوزات المُنشأة في الفترة ولها رقم هاتف.'),
        ('avg_order_value', 'متوسط قيمة الطلب',
         v_c_avg, public.stats_delta(v_c_avg, v_p_avg), 'money',
         'قيمة الطلبات ÷ عددها.')
      ) as x(k, l, v, d, f, h);
    end;

  -- ── (٦-١-هـ) المحتوى والسيو ──────────────────────────────────────────────
  -- لقطة لا فترة: عدد الصفحات واكتمال ميتاداتاها حالةٌ راهنة لا تدفّق، فكل
  -- delta هنا null عدا «صفحات عُدِّلت» وهي وحدها ما يقع داخل نافذة زمنية.
  elsif v_section = 'content' then
    declare
      v_total     numeric := 0;
      v_pub       numeric := 0;
      v_draft     numeric := 0;
      v_complete  numeric := 0;
      v_no_meta   numeric := 0;
      v_faq       numeric := 0;
      v_rate      numeric := 0;
      v_c_touched numeric := 0;
      v_p_touched numeric := 0;
    begin
      -- max() فوق عرضٍ صفُّه واحد: يعطي القيمة إن وُجد الصف وnull إن لم يوجد،
      -- فلا حاجة لمتغيّر record ولا لفرع «العرض فارغ» منفصل.
      select
        coalesce(max(c.pages_total), 0),
        coalesce(max(c.pages_published), 0),
        coalesce(max(c.pages_draft), 0),
        coalesce(max(c.meta_complete), 0),
        coalesce(max(c.meta_missing), 0),
        coalesce(max(c.faq_pages), 0)
      into v_total, v_pub, v_draft, v_complete, v_no_meta, v_faq
      from public.v_stats_content c;

      v_rate := case
                  when v_total > 0 then round(100.0 * v_complete / v_total, 1)
                  else 0
                end;

      select coalesce(count(*), 0) into v_c_touched
      from public.pages p
      where (p.updated_at at time zone 'Africa/Cairo')::date between v_from and v_to;

      select coalesce(count(*), 0) into v_p_touched
      from public.pages p
      where (p.updated_at at time zone 'Africa/Cairo')::date between v_pfrom and v_pto;

      return query
      select x.k, x.l, x.v, x.d, x.f, x.h
      from (values
        ('pages_total'::text, 'إجمالي الصفحات'::text,
         v_total::numeric, null::numeric, 'number'::text,
         'كل صفوف جدول الصفحات — لقطة لحظية لا تخص فترة.'::text),
        ('pages_published', 'صفحات منشورة',
         v_pub, null, 'number',
         'الصفحات التي يراها الزائر الآن.'),
        ('pages_draft', 'صفحات غير منشورة',
         v_draft, null, 'number',
         'صفحات موجودة ومحجوبة عن الزائر.'),
        ('meta_complete_rate', 'اكتمال الميتاداتا',
         v_rate, null, 'percent',
         'الصفحات التي لها عنوان ووصف سيو معاً ÷ كل الصفحات × ١٠٠.'),
        ('meta_missing', 'صفحات ناقصة الميتاداتا',
         v_no_meta, null, 'number',
         'ينقصها عنوان السيو أو وصفه أو كلاهما — هذه قائمة عمل مركز السيو.'),
        ('jsonld_pages', 'صفحات ببيانات مهيكلة',
         v_faq, null, 'number',
         'الصفحات التي فيها قسم أسئلة شائعة ظاهر وفيه عنصر مكتمل (سؤال وجواب معاً) — وهو بالضبط ما يُصدَّر منه JSON-LD اليوم. قسم أسئلة فارغ لا يُعدّ لأنه لا يُصدِّر شيئاً. والرئيسية لها JSON-LD من الكود ولا تُعدّ هنا.'),
        ('pages_updated', 'صفحات عُدِّلت',
         v_c_touched, public.stats_delta(v_c_touched, v_p_touched), 'number',
         'الصفحات التي تغيّرت داخل الفترة — المؤشر الوحيد هنا الذي تخصه فترة.')
      ) as x(k, l, v, d, f, h);
    end;

  -- ── (٦-١-ز) الخصومات — القسم السابع (هجرة 0024) ──────────────────────────
  --
  -- المصدر `v_stats_discounts` وحده: صفّ الاستخدام هو الأثر المالي الوحيد للخصم
  -- (لا قيد دفتر له — القاعدة ٥ في lib/discount-types.ts). و«قيمة الطلبات قبل
  -- الخصم» تُشتق جمعاً (بعد + الخصم) لا من عمود ثانٍ، فلا رقمان لشيء واحد.
  --
  -- ⚠ `discount_amount` هو ما خُصم **فعلاً** بعد كل الحدود لا القيمة الاسمية
  -- للكوبون. والفرق بينهما يظهره `clamped_rate` صراحةً: المالك يرى أن حملته لم
  -- تُطبَّق كما أعلنها بدل أن يكتشفه من فرق في التقارير.
  elsif v_section = 'discounts' then
    declare
      v_c_uses    numeric := 0;
      v_c_amount  numeric := 0;
      v_c_after   numeric := 0;
      v_c_clamp   numeric := 0;
      v_c_avg     numeric := 0;
      v_c_share   numeric := 0;
      v_c_crate   numeric := 0;
      v_p_uses    numeric := 0;
      v_p_amount  numeric := 0;
      v_p_after   numeric := 0;
      v_p_clamp   numeric := 0;
      v_p_avg     numeric := 0;
      v_p_share   numeric := 0;
      v_p_crate   numeric := 0;
      v_active    numeric := 0;
    begin
      select
        coalesce(sum(g.redemptions_count), 0),
        coalesce(sum(g.discount_amount), 0),
        coalesce(sum(g.discounted_orders_value), 0),
        coalesce(sum(g.clamped_count), 0)
      into v_c_uses, v_c_amount, v_c_after, v_c_clamp
      from public.v_stats_discounts g
      where g.day between v_from and v_to;

      select
        coalesce(sum(g.redemptions_count), 0),
        coalesce(sum(g.discount_amount), 0),
        coalesce(sum(g.discounted_orders_value), 0),
        coalesce(sum(g.clamped_count), 0)
      into v_p_uses, v_p_amount, v_p_after, v_p_clamp
      from public.v_stats_discounts g
      where g.day between v_pfrom and v_pto;

      v_c_avg := case when v_c_uses > 0 then round(v_c_amount / v_c_uses, 2) else 0 end;
      v_p_avg := case when v_p_uses > 0 then round(v_p_amount / v_p_uses, 2) else 0 end;

      -- النسبة من قيمة الطلبات **قبل** الخصم = (بعد الخصم + الخصم)
      v_c_share := case when (v_c_after + v_c_amount) > 0
                        then round(100.0 * v_c_amount / (v_c_after + v_c_amount), 1)
                        else 0 end;
      v_p_share := case when (v_p_after + v_p_amount) > 0
                        then round(100.0 * v_p_amount / (v_p_after + v_p_amount), 1)
                        else 0 end;

      v_c_crate := case when v_c_uses > 0 then round(100.0 * v_c_clamp / v_c_uses, 1) else 0 end;
      v_p_crate := case when v_p_uses > 0 then round(100.0 * v_p_clamp / v_p_uses, 1) else 0 end;

      -- لقطة لحظية: «فعّال الآن» ليست خاصية فترة، فلا delta لها
      select coalesce(count(*), 0) into v_active
      from public.coupons c
      where c.enabled
        and (c.starts_at is null or c.starts_at <= now())
        and (c.ends_at   is null or c.ends_at   >  now())
        and (c.max_uses  is null or c.used_count < c.max_uses);

      return query
      select x.k, x.l, x.v, x.d, x.f, x.h
      from (values
        ('redemptions_count'::text, 'مرات استخدام الكوبونات'::text,
         v_c_uses::numeric, public.stats_delta(v_c_uses, v_p_uses)::numeric,
         'number'::text,
         'كل استخدام كوبون سُجِّل داخل الفترة — وكوبون واحد لكل حجز فلا تراكم.'::text),
        ('discount_amount', 'قيمة الخصومات',
         v_c_amount, public.stats_delta(v_c_amount, v_p_amount), 'money',
         'ما خُصم فعلاً بعد كل الحدود — لا القيمة الاسمية للكوبونات. ويقتطع من هامش الموقع وحده ولا يمسّ تكلفة المتعهد.'),
        ('discounted_orders_value', 'قيمة الطلبات المخصومة',
         v_c_after, public.stats_delta(v_c_after, v_p_after), 'money',
         'إجمالي الحجوزات التي استُخدم فيها كوبون بعد الخصم — وهو ما يدخل تقارير الهامش والخزينة.'),
        ('avg_discount', 'متوسط الخصم',
         v_c_avg, public.stats_delta(v_c_avg, v_p_avg), 'money',
         'قيمة الخصومات ÷ عدد مرات الاستخدام.'),
        ('discount_share', 'نسبة الخصم من السعر',
         v_c_share, public.stats_delta(v_c_share, v_p_share), 'percent',
         'الخصم ÷ (قيمة الطلبات المخصومة + الخصم) × ١٠٠ — أي نسبته من السعر قبل الخصم.'),
        ('clamped_rate', 'نسبة الخصومات المقلَّصة',
         v_c_crate, public.stats_delta(v_c_crate, v_p_crate), 'percent',
         'الاستخدامات التي قلّصت أرضيةُ الهامش خصمَها عن قيمته الاسمية ÷ كل الاستخدامات × ١٠٠. ارتفاعها يعني حملة أكبر مما يحتمله الهامش، لا عطلاً.'),
        ('active_coupons', 'كوبونات فعّالة الآن',
         v_active, null, 'number',
         'كوبونات مفعّلة داخل نافذة صلاحيتها ولم تبلغ سقف استخدامها — لقطة لحظية لا تخص فترة.')
      ) as x(k, l, v, d, f, h);
    end;

  -- ── (٦-١-و) اللغات ───────────────────────────────────────────────────────
  -- لقطة كذلك: تقدّم الترجمة حالةٌ راهنة، فكل delta هنا null بصدق.
  else
    declare
      v_total     numeric := 0;
      v_enabled   numeric := 0;
      v_published numeric := 0;
      v_missing   numeric := 0;
      v_stale     numeric := 0;
      v_percent   numeric := 0;
    begin
      select
        coalesce(count(*), 0),
        coalesce(count(*) filter (where lo.enabled), 0),
        coalesce(sum(lo.published), 0),
        coalesce(sum(lo.missing), 0),
        coalesce(sum(lo.stale), 0),
        coalesce(round(avg(lo.percent) filter (where lo.enabled and not lo.is_default), 1), 100)
      into v_total, v_enabled, v_published, v_missing, v_stale, v_percent
      from public.v_stats_locales lo;

      return query
      select x.k, x.l, x.v, x.d, x.f, x.h
      from (values
        ('locales_enabled'::text, 'لغات مفعّلة'::text,
         v_enabled::numeric, null::numeric, 'number'::text,
         'اللغات التي يراها الزائر في مبدّل اللغة — لقطة لحظية لا تخص فترة.'::text),
        ('locales_total', 'لغات معرّفة',
         v_total, null, 'number',
         'كل اللغات في القاعدة، مفعّلة كانت أو لا.'),
        ('translations_published', 'نصوص منشورة',
         v_published, null, 'number',
         'مجموع النصوص المنشورة عبر كل اللغات.'),
        ('translations_missing', 'نصوص ناقصة',
         v_missing, null, 'number',
         'مفاتيح لا ترجمة لها بعد في اللغات غير الأساس.'),
        ('translations_stale', 'نصوص قديمة',
         v_stale, null, 'number',
         'ترجمة منشورة تغيّر أصلها العربي بعدها — تُعرض للزائر وهي لم تعد تطابق الأصل.'),
        ('avg_percent', 'متوسط اكتمال الترجمة',
         v_percent, null, 'percent',
         'متوسط نسبة الاكتمال عبر اللغات المفعّلة غير الأساس (والنسبة تحتسب المنشور غير القديم وحده).')
      ) as x(k, l, v, d, f, h);
    end;
  end if;

  return;
end;
$$;

comment on function public.section_stats(text, date, date) is
  'بطاقات مؤشرات StatCard لأي قسم من السبعة (orders|partners|treasury|customers|content|locales|discounts) مقارنةً بالفترة السابقة المساوية. percent من ٠ إلى ١٠٠ و duration بالدقائق. قسم مجهول يرمي exception. (0026: قسم customers يطابق العميل بـ bookings.phone_norm.)';

-- ----------------------------------------------------------------------------
-- (٨) الصلاحيات — `create or replace` لا يعيد ضبطها، فتُعاد صراحةً
--
-- 🔒 الفخّ المكتوب في 0024:2013-2015 وفي CONVENTIONS §٦: الدالة الجديدة تولد
-- ومعها `EXECUTE` ضمني لـ PUBLIC ومنح Supabase الافتراضي لـ anon/authenticated،
-- و`create or replace` لا يمسّ الصلاحيات القائمة. فالسحب من الثلاثة أولاً، ثم
-- المنح الصريح — وإعادة تأكيد ما كان قائماً أرخص من ثغرة.
-- ----------------------------------------------------------------------------

-- 🔒 normalize_phone: للمسجَّل نعم، وللزائر **لا**.
--
-- لماذا يحتاجها المسجَّل أصلاً وهي ليست في أي واجهة: `phone_norm` عمود مولَّد،
-- وPostgres يعيد حساب تعبيره في **كل** `update` على صف الحجز — بصلاحيات الدور
-- المنفِّذ. وشاشات اللوحة تعدّل الحجوزات بجلسة المستخدم (دور `authenticated`)
-- لا بمفتاح الخدمة. فبلا هذا المنح يصير كل تعديل إداري على حجز خطأ
-- «permission denied for function normalize_phone» — أي كسر شاشة الطلبات كلها.
-- وهي دالة نصّية محضة: لا تقرأ جدولاً ولا إعداداً، فمنحُها لا يكشف حرفاً.
--
-- والزائر خارجها لأنه لا يكتب في `bookings` أصلاً (0007:1259 سحب كل شيء منه)،
-- وكل مسار حجزه يمر بدالة `security definer` تعمل بصلاحيات مالكها.
revoke all    on function public.normalize_phone(text) from public, anon, authenticated;
grant execute on function public.normalize_phone(text) to authenticated;

-- دالة المُشغِّل الاحتياطية: لا تُمنح لأحد. صلاحية التنفيذ في المُشغِّلات تُفحص
-- لحظة `create trigger` لا لحظة الإطلاق، فالسحب هنا بلا أثر جانبي.
revoke all on function public.bookings_set_phone_norm() from public, anon, authenticated;

-- 🔒 دالتا الخصم: بلا أي إضعاف لقرار 0024 — لا للزائر ولا للمسجَّل. المتعهد
-- مستخدم `authenticated`، ويتحكم في `p_partner_cost` فيستكشف أرضية الهامش
-- بالتجربة (سابقة 0011).
revoke all on function public.apply_discount(text, numeric, text, numeric, text)
  from public, anon, authenticated;
revoke all on function public.redeem_coupon(text, uuid, numeric, text)
  from public, anon, authenticated;

-- section_stats: كما كانت في 0022 و0024 حرفياً
revoke all    on function public.section_stats(text, date, date) from public, anon, authenticated;
grant execute on function public.section_stats(text, date, date) to authenticated;

-- العرض: `create or replace view` حفظ المنح، وهذا تثبيت لا تغيير
revoke all   on public.v_stats_customers from public, anon, authenticated;
grant select on public.v_stats_customers to authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.normalize_phone(text) to service_role';
    execute 'grant execute on function public.apply_discount(text, numeric, text, numeric, text) to service_role';
    execute 'grant execute on function public.redeem_coupon(text, uuid, numeric, text) to service_role';
    execute 'grant execute on function public.section_stats(text, date, date) to service_role';
    execute 'grant select on public.v_stats_customers to service_role';
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- (٩) فحص ذاتي بعد التنفيذ — كل فحص سالب يسبقه شاهد إيجابي (0025 §٦)
-- ----------------------------------------------------------------------------
do $$
declare
  v_missing text;
  v_def     text;
  v_n       bigint;
  v_raw     bigint;
  v_norm    bigint;
  v_gen     text;
begin
  -- (٩-١) الكائنات موجودة — الشاهد الإيجابي لكل ما بعده
  select string_agg(x.sig, '، ')
    into v_missing
  from (values
    ('public.normalize_phone(text)'),
    ('public.bookings_set_phone_norm()'),
    ('public.apply_discount(text, numeric, text, numeric, text)'),
    ('public.redeem_coupon(text, uuid, numeric, text)'),
    ('public.section_stats(text, date, date)')
  ) as x(sig)
  where to_regprocedure(x.sig) is null;

  if v_missing is not null then
    raise exception '0026: دوال ناقصة بعد التنفيذ: %', v_missing;
  end if;

  if not exists (
    select 1 from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = 'bookings'
      and c.column_name = 'phone_norm'
  ) then
    raise exception '0026: bookings.phone_norm غير موجود';
  end if;

  select string_agg(x.idx, '، ')
    into v_missing
  from (values
    ('public.bookings_phone_norm_idx'),
    ('public.coupon_redemptions_phone_norm_idx')
  ) as x(idx)
  where to_regclass(x.idx) is null;

  if v_missing is not null then
    raise exception '0026: فهارس ناقصة: %', v_missing;
  end if;

  -- (٩-٢) 🔒 لا توقيع مكرّر: نسخة ثانية بنفس الاسم تجعل كل نداء ملتبساً
  --        («function is not unique» — الفخ الذي ضرب المشروع مرتين)
  select count(*) into v_n
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in
    ('apply_discount', 'redeem_coupon', 'section_stats', 'normalize_phone');

  if v_n <> 4 then
    raise exception
      '0026: عدد الدوال بهذه الأسماء % لا ٤ — يوجد توقيع مكرّر أو ناقص', v_n;
  end if;

  -- (٩-٣) الأجسام تطابق العقد فعلاً: لا موضع مطابقة بقي على النص الخام
  select pg_get_functiondef(to_regprocedure('public.section_stats(text, date, date)')::oid)
    into v_def;
  if v_def !~ 'phone_norm' then
    raise exception '0026: section_stats لا تذكر phone_norm — أعادت هجرةٌ أخرى كتابتها فوقنا';
  end if;
  if v_def ~ 'btrim\(b\.customer_phone\)' then
    raise exception '0026: section_stats ما زالت تطابق العميل بـ btrim(customer_phone)';
  end if;

  select pg_get_functiondef(to_regprocedure('public.apply_discount(text, numeric, text, numeric, text)')::oid)
    into v_def;
  if v_def !~ 'normalize_phone' or v_def ~ 'btrim\(coalesce\(r\.phone' then
    raise exception '0026: apply_discount لم تنتقل إلى المطابقة المطبَّعة';
  end if;

  select pg_get_functiondef(to_regprocedure('public.redeem_coupon(text, uuid, numeric, text)')::oid)
    into v_def;
  if v_def !~ 'normalize_phone' or v_def ~ 'btrim\(coalesce\(r\.phone' then
    raise exception '0026: redeem_coupon لم تنتقل إلى المطابقة المطبَّعة';
  end if;

  select pg_get_viewdef('public.v_stats_customers'::regclass) into v_def;
  if v_def !~ 'phone_norm' then
    raise exception '0026: v_stats_customers لا تستعمل phone_norm';
  end if;

  -- (٩-٤) 🔒 لا انحراف بين المخزَّن وناتج الدالة الحالية.
  --        هذا هو الفحص الذي يمسك «غُيّر جسم normalize_phone ولم يُعد بناء
  --        العمود» — وهو الثمن الوحيد لاختيار العمود المولَّد.
  select count(*) into v_n
  from public.bookings b
  where b.phone_norm is distinct from public.normalize_phone(b.customer_phone);

  if v_n > 0 then
    raise exception
      '0026: % صفاً في bookings قيمته المخزَّنة في phone_norm تخالف ناتج normalize_phone — أعد بناء العمود', v_n;
  end if;

  -- (٩-٥) 🔒 العرض ما زال security_invoker (شرط 0025 §٦-٥)
  select coalesce(
           (select o.option_value from pg_options_to_table(c.reloptions) o
             where o.option_name = 'security_invoker'), 'false')
    into v_def
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'v' and c.relname = 'v_stats_customers';

  if v_def is distinct from 'true' then
    raise exception
      '0026: v_stats_customers فقد security_invoker (القيمة «%») — منحُه للمسجَّل يصير تسريباً فورياً',
      coalesce(v_def, 'بلا');
  end if;

  -- (٩-٦) 🔒 الزائر لم يكتسب شيئاً جديداً
  if exists (select 1 from pg_roles where rolname = 'anon') then
    if has_function_privilege('anon', 'public.normalize_phone(text)', 'execute') then
      raise exception '0026: الزائر ينفّذ normalize_phone — منحٌ بلا مستهلك';
    end if;
    if has_table_privilege('anon', 'public.v_stats_customers', 'select') then
      raise exception '0026: الزائر يقرأ v_stats_customers';
    end if;
    if has_table_privilege('anon', 'public.bookings', 'select')
       or has_table_privilege('anon', 'public.bookings', 'update') then
      raise exception '0026: الزائر اكتسب صلاحية على bookings — نقض 0007';
    end if;
  end if;

  -- والمسجَّل ما زال ممنوعاً من دالتَي الخصم (0024 لم يُضعَّف)
  if exists (select 1 from pg_roles where rolname = 'authenticated')
     and (has_function_privilege('authenticated', 'public.apply_discount(text, numeric, text, numeric, text)', 'execute')
          or has_function_privilege('authenticated', 'public.redeem_coupon(text, uuid, numeric, text)', 'execute')) then
    raise exception '0026: أُضعف قرار 0024 — المسجَّل ينفّذ دالة خصم';
  end if;

  -- (٩-٧) القسم الإحصائي ما زال يعمل (وحين لا يمر الحارس نكتفي بإشعار: قاعدة
  --        تُهاجَر بدور غير مالكها لا يجوز أن تسقط هجرتها لهذا السبب)
  if public.analytics_admin_allowed() then
    select count(*) into v_n from public.section_stats('customers', null, null);
    if v_n = 0 then
      raise exception '0026: section_stats(''customers'') لم تُرجع بطاقة واحدة';
    end if;
  else
    raise notice '⚠ 0026: حارس الإحصائيات يرفض هذا الاتصال — تخطّي فحص القسم';
  end if;

  -- (٩-٨) حجم الأثر مطبوعاً لا مفاجئاً: كم عميلاً كان وكم صار
  select count(distinct btrim(b.customer_phone)), count(distinct b.phone_norm)
    into v_raw, v_norm
  from public.bookings b
  where btrim(coalesce(b.customer_phone, '')) <> '';

  select c.is_generated into v_gen
  from information_schema.columns c
  where c.table_schema = 'public' and c.table_name = 'bookings'
    and c.column_name = 'phone_norm';

  raise notice
    '✔ 0026: هوية العميل صارت phone_norm (%). عملاء قبل التطبيع % وبعده % ⇒ % هوية مكرّرة اندمجت — تصحيح مقصود لا انحدار.',
    v_gen, v_raw, v_norm, (v_raw - v_norm);
end;
$$;

do $$
begin
  raise notice '✔ 0026_phone_normalization: normalize_phone + bookings.phone_norm + تطبيع كل مطابقة عميل (العرض، دالتا الكوبون، القسم الإحصائي)';
end;
$$;
