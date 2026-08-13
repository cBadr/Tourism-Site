-- ============================================================
-- 0024 — الخصومات والتحفيز (المرحلة ١٢أ) — طبقة القاعدة
--
-- المرجع الملزم: `lib/discount-types.ts` (العقد) و`docs/phase-briefs/PHASE-12A.md`.
--
-- ما تبنيه هذه الهجرة:
--   • `coupons` · `coupon_redemptions` · `promo_banners` · `discount_settings`
--   • `apply_discount()` — الدالة الوحيدة التي تحسب خصماً في المشروع كله
--   • `redeem_coupon()`  — تسجيل الاستخدام ذرّياً داخل معاملة `create_booking`
--   • `v_stats_discounts` + القسم الإحصائي **السابع** في `section_stats`
--   • توسعة `quote_public()` و`create_booking()` بحقول الخصم ومعامل الرمز
--
-- ── القرار المحوري (§٤ في الموجز): أرضية الهامش تُفرض في الدالة ─────────────
-- `apply_discount` تفرض بنفسها أن ما يبقى من الهامش بعد الخصم ≥ الأرضية،
-- و**تقلّص الخصم بدل رفضه** حين يمكن (`clamped = true`). فلا يستطيع أي مستدعٍ
-- — لا شاشة ولا مسار API ولا محرر SQL — أن يتخطى الحد. وهذه القاعدة الواحدة
-- تحلّ ثلاثة تصادمات دفعة واحدة:
--   (أ) `min_price` للفئة تبقى صمام أمان: الإجمالي بعد الخصم لا ينزل تحتها.
--   (ب) سقف البث في `dispatch_ceiling` (0014) يُشتق من `bookings.total` وهو
--       الإجمالي بعد الخصم — أي من الاقتصاد الحقيقي — ويبقى صحيحاً لأن الهامش
--       المتبقي مضمون فوق أرضية البث نفسها (تدخل في حساب الأرضية هنا صراحةً).
--   (ج) أرضية الهامش D-16: يستحيل الإسناد الآلي بخسارة.
--
-- ── قواعد العقد المنفَّذة هنا حرفياً ────────────────────────────────────────
--   (١) الخصم **طبقة تالية** لبناء السعر لا خطوة داخله: `quote_price` تبني
--       السعر كما في D-11 (أرضية ← عودة ← انتظار ← ذروة)، ثم يقع الخصم على
--       الناتج. خصم ١٠٪ = ١٠٪ مما يراه العميل.
--   (٢) الخصم من هامش الموقع وحده: `bookings.subcontractor_cost` **لا يُمس**،
--       والذي ينقص هو `bookings.margin_amount` و`bookings.total`.
--   (٤) الخصم المطبَّق يُجمَّد في لقطة الحجز (`bookings.trip -> 'discount'`)،
--       فتعديل الكوبون أو حذفه لاحقاً لا يغيّر جنيهاً في حجز قائم.
--   (٥) لا قيد دفتر للخصم: `bookings.total` هو ما بعد الخصم فيصح
--       `v_booking_profit` تلقائياً بلا مفهوم «إيراد لم يُقبض».
--   (٩) كوبون واحد لكل حجز: فهرس فريد على `coupon_redemptions(booking_id)`.
--   (١٠) النظام **مطفأ في البذرة** — لا حملة تبدأ بلا قرار بشري.
--
-- ── الفخّان المعروفان (لا تحذف سطراً منهما) ────────────────────────────────
--   • Supabase تمنح `anon` صلاحيات واسعة على الجداول الجديدة — منها `TRUNCATE`
--     **وهي لا تخضع لـ RLS إطلاقاً**. لذلك `revoke all` قبل كل `grant`.
--   • الدوال الجديدة تولد ومعها `EXECUTE` ضمني لـ PUBLIC ومنح افتراضي لـ
--     `anon`/`authenticated`. لذلك `revoke ... from public, anon, authenticated`
--     ثم منح صريح لكل دالة. و`create or replace` لا يعيد ضبط الصلاحيات.
--   • `set search_path = ''` في كل `security definer`، وكل مرجع مؤهَّل.
-- ============================================================

-- ----------------------------------------------------------------------------
-- (١) إعدادات نظام الخصومات — جدول صف واحد، **محجوب عن الزائر والمتعهد معاً**
--
-- ⚠ لماذا جدول مستقل لا مفتاح في `site_settings`: `site_settings` مقروء علناً
-- بالكامل (سياسة `site_settings_select_public` من 0001 تعطي anon `using (true)`).
-- و`min_margin_percent_after_discount` يكشف **سياسة هامش الموقع** — وهو بالضبط
-- ما أغلقته 0011 حين سحبت أعمدة الهامش من `pricing_settings` عن كل دور مستخدم
-- لأن متعهداً يستنتج تكلفة منافسه منها. فالإعدادات هنا للمشرف وللدوال الداخلية
-- وحدهم، والزائر لا يعرف إلا «هل النظام مفعَّل» عبر `discount_enabled()`.
--
-- القيم الافتراضية مطابقة حرفياً لـ DEFAULT_DISCOUNT_SETTINGS في العقد.
-- ----------------------------------------------------------------------------
create table if not exists public.discount_settings (
  id                                boolean primary key default true check (id),
  enabled                           boolean not null default false,
  max_percent                       numeric(5,2)  not null default 25
                                    check (max_percent >= 0 and max_percent <= 100),
  min_margin_percent_after_discount numeric(5,2)  not null default 10
                                    check (min_margin_percent_after_discount >= 0),
  min_margin_amount_after_discount  numeric(12,2) not null default 50
                                    check (min_margin_amount_after_discount >= 0),
  verify_rate_limit_per_minute      integer       not null default 10
                                    check (verify_rate_limit_per_minute > 0),
  updated_at                        timestamptz   not null default now()
);

drop trigger if exists discount_settings_touch_updated_at on public.discount_settings;
create trigger discount_settings_touch_updated_at
  before update on public.discount_settings
  for each row execute function public.touch_updated_at();

-- البذرة: صف واحد بالافتراضيات. `do nothing` كي لا تمسح إعادةُ التنفيذ ما ضبطه
-- المالك من اللوحة (نفس قاعدة 0002 حرفياً).
insert into public.discount_settings (id) values (true)
on conflict (id) do nothing;

comment on table public.discount_settings is
  'إعدادات نظام الخصومات — مطفأ في البذرة (قرار ١٠). أعمدة الهامش محجوبة عن anon و authenticated لأنها تكشف سياسة هامش الموقع (سابقة 0011).';

-- (١-١) قراءة داخلية للإعدادات — تستدعيها apply_discount وحدها عملياً
create or replace function public.discount_config()
returns table (
  enabled                           boolean,
  max_percent                       numeric,
  min_margin_percent_after_discount numeric,
  min_margin_amount_after_discount  numeric,
  verify_rate_limit_per_minute      integer
)
language sql
stable
security definer
set search_path = ''
as $$
  -- التدهور الرشيق: بلا صف إعدادات تعمل قيم العقد الافتراضية (ومنها enabled=false)
  select
    coalesce(d.enabled, false),
    coalesce(d.max_percent, 25),
    coalesce(d.min_margin_percent_after_discount, 10),
    coalesce(d.min_margin_amount_after_discount, 50),
    coalesce(d.verify_rate_limit_per_minute, 10)
  from (select 1) one
  left join public.discount_settings d on d.id;
$$;

comment on function public.discount_config() is
  'إعدادات الخصم للدوال الداخلية — لا تُمنح لأي دور مستخدم لأن أرضية الهامش فيها.';

-- (١-٢) «هل النظام مفعَّل؟» — الوحيد المتاح للزائر، وليس فيه رقم واحد
create or replace function public.discount_enabled()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select d.enabled from public.discount_settings d limit 1), false);
$$;

comment on function public.discount_enabled() is
  'هل نظام الخصومات مفعَّل — بوليان وحده، فلا تسرّب لسياسة الهامش. تستعمله الواجهة لإظهار حقل الكوبون أو إخفائه.';

-- (١-٣) الإعدادات كاملة للوحة — بحارس is_admin مثل get_margin_settings (0011)
create or replace function public.get_discount_settings()
returns table (
  enabled                           boolean,
  max_percent                       numeric,
  min_margin_percent_after_discount numeric,
  min_margin_amount_after_discount  numeric,
  verify_rate_limit_per_minute      integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    d.enabled,
    d.max_percent,
    d.min_margin_percent_after_discount,
    d.min_margin_amount_after_discount,
    d.verify_rate_limit_per_minute
  from public.discount_settings d
  where public.is_admin();
$$;

comment on function public.get_discount_settings() is
  'إعدادات الخصم للمشرف وحده — صفر صف لغيره (نفس نمط get_margin_settings في 0011).';

-- ----------------------------------------------------------------------------
-- (٢) تطبيع الرمز — دالة واحدة يستعملها المُشغّل والبحث معاً
--
-- العقد: «يُقارَن بلا حساسية لحالة الأحرف ولا مسافات». دالة واحدة في مكان واحد
-- كي لا ينحرف التطبيع بين الكتابة والقراءة فيصير رمزٌ مخزَّن لا يطابق نفسه.
-- ----------------------------------------------------------------------------
create or replace function public.discount_normalize_code(p_code text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(upper(regexp_replace(coalesce(p_code, ''), '\s', '', 'g')), '');
$$;

comment on function public.discount_normalize_code(text) is
  'تطبيع رمز الكوبون: حروف كبيرة وبلا أي مسافة. مصدر واحد للتطبيع كي لا ينحرف المخزَّن عن المبحوث عنه.';

-- ----------------------------------------------------------------------------
-- (٣) الكوبونات
--
-- 🔒 `coupons_used_within_max_chk` قيدُ تحقّق على **نفس الصف** — وهو أقوى من
-- الفهرس الفريد الجزئي الذي استعملته المرحلة ٦: تجاوز سقف الاستخدام يصير
-- مستحيلاً في القاعدة مهما كان مسار الكتابة (دالة، أو محرر SQL، أو دالة
-- مستقبلية سهت عن الشرط). و`redeem_coupon` تقفل الصف بـ `for update` فوقه
-- فتتسلسل المحاولات المتزامنة ولا تتسابق.
-- ----------------------------------------------------------------------------
create table if not exists public.coupons (
  id                 uuid primary key default gen_random_uuid(),
  code               text not null,
  kind               text not null default 'percent' check (kind in ('percent', 'amount')),
  value              numeric(12,2) not null check (value > 0),
  max_amount         numeric(12,2) check (max_amount is null or max_amount > 0),
  min_trip_total     numeric(12,2) check (min_trip_total is null or min_trip_total >= 0),
  class_slugs        text[] not null default '{}'::text[],
  starts_at          timestamptz,
  ends_at            timestamptz,
  max_uses           integer check (max_uses is null or max_uses > 0),
  max_uses_per_phone integer check (max_uses_per_phone is null or max_uses_per_phone > 0),
  enabled            boolean not null default false,
  used_count         integer not null default 0 check (used_count >= 0),
  note               text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

alter table public.coupons drop constraint if exists coupons_percent_range_chk;
alter table public.coupons
  add constraint coupons_percent_range_chk
  check (kind <> 'percent' or value <= 100);

alter table public.coupons drop constraint if exists coupons_window_chk;
alter table public.coupons
  add constraint coupons_window_chk
  check (starts_at is null or ends_at is null or ends_at > starts_at);

-- 🔒 الحاجز البنيوي على سقف الاستخدام — انظر تعليق القسم أعلاه
alter table public.coupons drop constraint if exists coupons_used_within_max_chk;
alter table public.coupons
  add constraint coupons_used_within_max_chk
  check (max_uses is null or used_count <= max_uses);

-- المُشغّل يطبّع الرمز قبل الكتابة، فالفهرس الفريد يعمل على قيمة مطبَّعة دائماً
-- ولا يعتمد على انضباط المستدعي.
create or replace function public.coupons_normalize_code()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  new.code := public.discount_normalize_code(new.code);
  if new.code is null then
    raise exception 'رمز الكوبون مطلوب' using hint = 'invalid-input';
  end if;
  return new;
end;
$$;

drop trigger if exists coupons_normalize_code on public.coupons;
create trigger coupons_normalize_code
  before insert or update on public.coupons
  for each row execute function public.coupons_normalize_code();

drop trigger if exists coupons_touch_updated_at on public.coupons;
create trigger coupons_touch_updated_at
  before update on public.coupons
  for each row execute function public.touch_updated_at();

create unique index if not exists coupons_code_key on public.coupons (code);
create index if not exists coupons_enabled_window_idx
  on public.coupons (enabled, starts_at, ends_at);

comment on table public.coupons is
  'الكوبونات كما تديرها اللوحة. الرمز مطبَّع بمُشغّل (حروف كبيرة بلا مسافات)، وسقف الاستخدام محروس بقيد تحقّق على نفس الصف فلا يُتجاوز بأي مسار كتابة.';
comment on column public.coupons.class_slugs is
  'فئات بعينها — مصفوفة فارغة تعني كل الفئات. تخصيص الكوبون **لمسار** مؤجَّل بسبب مكتوب حتى يُعرَّف «المسار» تسعيرياً (D-39).';
comment on column public.coupons.note is
  'ملاحظة إدارية داخلية — خارج عقد lib/discount-types.ts عمداً: لا تُعرض للزائر ولا تدخل أي حساب، وهي حقل تنظيمي للمالك (اسم الحملة مثلاً).';
comment on column public.coupons.max_uses_per_phone is
  'سقف الاستخدام لكل عميل. ⚠ هوية العميل اليوم = رقم الهاتف حرفياً — لا جدول عملاء في المشروع؛ فرقمان لشخص واحد يعنيان استخدامين، ورقم واحد لأسرة يعني استخداماً واحداً.';

-- ----------------------------------------------------------------------------
-- (٤) سجل الاستخدام — append-only، وصفٌّ واحد لكل حجز
--
-- 🔒 `coupon_redemptions_booking_key` فهرس فريد على الحجز = تنفيذ القرار ٩
-- («كوبون واحد لكل حجز، بلا تراكم») في القاعدة لا في الشاشة. وحين تصل المرحلة
-- ١٢ب بالنقاط يُحسم التراكم صراحةً بسقف إجمالي — وحتى ذلك الحين هذا الفهرس هو
-- ما يمنع تراكماً غير مقصود.
--
-- 🔒 `on delete restrict` على الكوبون: كوبون استُخدم لا يُحذف. تاريخ مالي محذوف
-- لا يُدقَّق (نفس قاعدة الدفتر في المرحلة ٧).
-- ----------------------------------------------------------------------------
create table if not exists public.coupon_redemptions (
  id          uuid primary key default gen_random_uuid(),
  coupon_id   uuid not null references public.coupons(id) on delete restrict,
  booking_id  uuid not null references public.bookings(id) on delete cascade,
  -- الرمز كما كان لحظة الاستخدام — يُجمَّد مع اللقطة، فتغيير الرمز لاحقاً لا
  -- يعيد كتابة التاريخ (سابقة D-10).
  code        text not null,
  phone       text,
  amount      numeric(12,2) not null check (amount >= 0),
  -- هل قلّصت أرضيةُ الهامش هذا الخصم عن قيمته الاسمية؟ الشفافية مقصودة: المالك
  -- يرى أن حملته لم تُطبَّق كما أعلنها بدل أن يكتشفه من فرق في التقارير.
  clamped     boolean not null default false,
  redeemed_at timestamptz not null default now()
);

create unique index if not exists coupon_redemptions_booking_key
  on public.coupon_redemptions (booking_id);
create index if not exists coupon_redemptions_coupon_idx
  on public.coupon_redemptions (coupon_id, redeemed_at desc);
create index if not exists coupon_redemptions_phone_idx
  on public.coupon_redemptions (coupon_id, phone);
create index if not exists coupon_redemptions_redeemed_at_idx
  on public.coupon_redemptions (redeemed_at desc);

comment on table public.coupon_redemptions is
  'كل استخدام كوبون: الكوبون والحجز والرمز والهاتف والقيمة وهل قُلّص. append-only ولا يُكتب إلا من redeem_coupon داخل معاملة create_booking. فيه هاتف العميل ⇒ محجوب عن anon تماماً وعن كل مسجَّل غير مشرف.';

-- ----------------------------------------------------------------------------
-- (٥) بانرات العروض — نص تحفيزي يديره المالك، **بلا أثر على أي سعر**
--
-- `coupon_code` هنا للعرض فقط: التحقق يبقى في `apply_discount` وحدها، فبانر
-- يحمل رمزاً منتهياً لا يمنح خصماً. (لا مفتاح أجنبي عمداً: البانر نصٌّ تسويقي
-- قد يعلن رمزاً قبل إنشائه أو بعد أرشفته.)
-- ----------------------------------------------------------------------------
create table if not exists public.promo_banners (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (btrim(title) <> ''),
  body        text,
  coupon_code text,
  placement   text not null default 'home'
              check (placement in ('home', 'offers', 'checkout')),
  starts_at   timestamptz,
  ends_at     timestamptz,
  enabled     boolean not null default false,
  sort        integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.promo_banners drop constraint if exists promo_banners_window_chk;
alter table public.promo_banners
  add constraint promo_banners_window_chk
  check (starts_at is null or ends_at is null or ends_at > starts_at);

drop trigger if exists promo_banners_touch_updated_at on public.promo_banners;
create trigger promo_banners_touch_updated_at
  before update on public.promo_banners
  for each row execute function public.touch_updated_at();

create index if not exists promo_banners_placement_idx
  on public.promo_banners (placement, enabled, sort);

comment on table public.promo_banners is
  'بانرات العرض الترويجي — نص يديره المالك بلا أي أثر على السعر. الرمز المعروض فيها للعرض فقط والتحقق يبقى في apply_discount.';

-- ----------------------------------------------------------------------------
-- (٦) التكلفة الضمنية — نفس اشتقاق dispatch_ceiling حرفياً
--
-- حين يكون السعر من قائمة متعهد نعرف تكلفته الحقيقية. وحين يكون بالتعريفة لا
-- مرجع تكلفة، فنشتقّها من **سياسة الهامش نفسها** — الهامش موجود داخل السعر
-- أصلاً فطرحه يعطي حداً معقولاً للتكلفة. وهذا هو بالضبط ما تفعله
-- `dispatch_ceiling` في 0014 (السطور ٥٥-٧٠)، ونسخُ الاشتقاق هنا مقصود كي لا
-- يكون لأرضية الخصم مفهومُ تكلفةٍ يخالف مفهوم سقف البث.
-- ----------------------------------------------------------------------------
create or replace function public.discount_implied_cost(
  p_total        numeric,
  p_partner_cost numeric
)
returns numeric
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_type  text;
  v_value numeric;
  v_min   numeric;
  v_base  numeric;
begin
  if p_partner_cost is not null then
    return greatest(p_partner_cost, 0);
  end if;

  -- الافتراضات تطابق settings في quote_price (0011) حرفياً
  select coalesce(ps.margin_type, 'percent'),
         coalesce(ps.margin_value, 20),
         coalesce(ps.margin_min_amount, 100)
    into v_type, v_value, v_min
  from (select 1) one
  left join public.pricing_settings ps on ps.id;

  if coalesce(v_type, 'percent') = 'fixed' then
    v_base := coalesce(p_total, 0) - greatest(coalesce(v_value, 0), coalesce(v_min, 0));
  else
    v_base := coalesce(p_total, 0) / (1 + coalesce(v_value, 20) / 100);
    -- أرضية الهامش تعلو على النسبة حين تكون أكبر
    v_base := least(v_base, coalesce(p_total, 0) - coalesce(v_min, 0));
  end if;

  return greatest(coalesce(v_base, 0), 0);
end;
$$;

comment on function public.discount_implied_cost(numeric, numeric) is
  'تكلفة المتعهد الفعلية إن عُرفت، وإلا اشتقاقها من سياسة الهامش — نفس اشتقاق dispatch_ceiling في 0014 كي لا يكون لأرضية الخصم مفهوم تكلفة يخالف سقف البث.';

-- ----------------------------------------------------------------------------
-- (٧) 🔒 apply_discount — الدالة الوحيدة التي تحسب خصماً في المشروع
--
-- تُستدعى **بعد** `quote_price` لا داخلها (القاعدة ١ في العقد): السعر يُبنى
-- كاملاً بترتيب D-11 ثم يقع الخصم على ناتجه، فخصم ١٠٪ يعني ١٠٪ مما يراه العميل.
--
-- ترتيب الحدود — من الأرخص فحصاً إلى الأغلى، وكلها قبل أي حساب:
--   النظام مطفأ ⇒ not-found (لا نكشف حالة النظام لمن يخمّن)
--   لا وجود / معطَّل            ⇒ not-found
--   قبل البداية / بعد النهاية   ⇒ not-started / expired
--   فئة غير مشمولة             ⇒ class-not-eligible
--   إجمالي دون الحد            ⇒ below-min-total
--   بلغ سقف الاستخدام          ⇒ exhausted
--   بلغ سقف العميل (بهاتفه)    ⇒ per-customer-limit
-- ثم الحساب: القيمة الاسمية ← سقف الكوبون (`max_amount`) ← سقف النظام
-- (`max_percent`) ← **أرضية الهامش**.
--
-- 🔒 أرضية الهامش = أكبر ثلاثة:
--   • `min_margin_amount_after_discount` (بالجنيه، من إعدادات الخصم)
--   • `min_margin_percent_after_discount` × التكلفة (نسبةً، من نفس الإعدادات)
--   • `dispatch_config().min_margin_amount` — **أرضية البث نفسها**، فيستحيل أن
--     يترك خصمٌ حجزاً لا يستطيع البث الآلي إسناده إلا بخسارة (عاقبة نقض D-16).
-- ويُضاف إليها حاجز `min_price` للفئة، فالأرضية تبقى «صمام أمان» كما تسمّيها
-- الخارطة ولا يُبطلها كوبون.
--
-- ⚠ الرفض لا يقع إلا إن استحال أي خصم؛ وإلا **يُقلَّص** ويُعلَم بـ `clamped`.
-- و`clamped` يشمل تقليص سقف النظام أيضاً: المعنى المقصود هو «حملتك لم تُطبَّق
-- كما أعلنتها»، لا مصدر التقليص.
--
-- 🔒 الصلاحية: `service_role` وحده. **لا تُمنح لـ authenticated**: المتعهد
-- مستخدم `authenticated`، وهو يتحكم في `p_partner_cost` فيستطيع أن يستكشف
-- أرضية الهامش بالتجربة — وهو بالضبط الاستنتاج العكسي الذي أغلقته 0011.
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
  v_phone := nullif(btrim(coalesce(p_phone, '')), '');
  if v_c.max_uses_per_phone is not null and v_phone is not null then
    select count(*)::integer into v_used
    from public.coupon_redemptions r
    where r.coupon_id = v_c.id and btrim(coalesce(r.phone, '')) = v_phone;

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
  'الدالة الوحيدة التي تحسب خصماً. تُستدعى بعد quote_price لا داخلها، وتفرض بنفسها أن الهامش المتبقي ≥ الأرضية (ومنها أرضية البث و min_price للفئة) فتقلّص الخصم بدل رفضه حين يمكن. لا تُمنح لـ authenticated: المتعهد يستطيع استكشاف الأرضية من p_partner_cost.';

-- ----------------------------------------------------------------------------
-- (٨) 🔒 redeem_coupon — تسجيل الاستخدام ذرّياً
--
-- تُستدعى داخل معاملة `create_booking` وحدها. ثلاث طبقات تمنع تجاوز السقف:
--   (١) `select ... for update` على صف الكوبون ⇒ المحاولات المتزامنة تتسلسل.
--   (٢) `coupons_used_within_max_chk` قيدُ تحقّق على نفس الصف ⇒ التجاوز مستحيل
--       في القاعدة مهما كان مسار الكتابة، ولو سها مستدعٍ عن الفحص.
--   (٣) `coupon_redemptions_booking_key` فهرس فريد ⇒ لا كوبونان لحجز واحد ولا
--       تسجيل مكرّر لنفس الحجز عند إعادة محاولة.
-- فحجزان متزامنان على آخر استخدام متاح: واحد يفوز والآخر تفشل معاملته كاملة
-- (فلا حجز بسعر مخصوم بلا استخدام مسجَّل).
--
-- `clamped` لا يمر في التوقيع (وهو مقفول في العقد) بل في علم محلي للمعاملة
-- تضبطه `create_booking` قبل النداء — نفس نمط `tours.pricing_internals` و
-- `tours.allow_margin_loss` في هذا المستودع.
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

  v_phone := nullif(btrim(coalesce(p_phone, '')), '');
  if v_c.max_uses_per_phone is not null then
    select count(*)::integer into v_used
    from public.coupon_redemptions r
    where r.coupon_id = v_c.id
      and btrim(coalesce(r.phone, '')) = coalesce(v_phone, '');

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
  'تسجيل استخدام كوبون ذرّياً: قفل صف + قيد تحقّق على نفس الصف + فهرس فريد لكل حجز. تُستدعى داخل معاملة create_booking وحدها ولا تُمنح لأي دور مستخدم.';

-- ----------------------------------------------------------------------------
-- (٩) quote_public — حقول الخصم في **نوع الإرجاع** صراحةً
--
-- سابقة D-18: ما ليس في نوع الإرجاع لا يصل الواجهة أبداً. فحقول الخصم تُضاف
-- هنا صراحةً، وأرقام التكلفة والهامش تبقى خارجه كما كانت.
--
-- 🔒 التوقيع صار تسعة معاملات آخرها `p_coupon_code text default null`، و**يُسقَط
-- التوقيع الثماني صراحةً** بعده: بقاؤهما معاً يجعل النداء بثمانية معاملات
-- ملتبساً بينهما فيفشل بـ «function is not unique» — وهو الفخ الذي ضرب المشروع
-- من قبل (تعليق 0011:88-89). والنداء القائم في `app/api/quote/route.ts` بثمانية
-- معاملات مسمّاة يبقى صحيحاً لأن المعامل التاسع له قيمة افتراضية.
--
-- ⚠ `tours.pricing_internals`: تكلفة المتعهد لازمة **لحساب أرضية الهامش** ولا
-- تخرج في نوع الإرجاع. العلم يُرفع ويُخفض داخل نداء واحد لهذه الدالة (وبمعالج
-- استثناء يخفضه مهما وقع)، فلا تبقى نافذة يقرأ فيها الزائر `quote_price`
-- بأرقامها الداخلية. ولا يُرفع أصلاً إلا حين يُمرَّر رمز كوبون.
--
-- ⚠ **تجميع أسباب الرفض عند الحدّ العام** (قرار ٨): `not-found` و`expired` و
-- `not-started` كلها تصل الزائر بوصفها `not-found`. التفريق يخبر من يخمّن
-- الرموز أنه اقترب. أما اللوحة فتقرأ التفصيل من `apply_discount` مباشرةً.
--
-- 🔒 وأهم من التجميع: **معامل الرمز نفسه ممنوع على `anon` و`authenticated`**.
-- التسعير بلا رمز يبقى لهما كما كان، ومن يمرّر رمزاً من متصفح يُرفَض في مطلع
-- الدالة. التفصيل في التعليق داخل الجسم — وبلا هذا الحاجز يصير المنح للزائر
-- التفافاً كاملاً على حدّ المعدّل (القرار ٧) وعلى عزل التكلفة (0011).
-- ----------------------------------------------------------------------------
drop function if exists public.quote_public(
  numeric, integer, boolean, numeric, numeric, numeric, numeric, numeric
);

create or replace function public.quote_public(
  p_distance_km   numeric,
  p_passengers    integer,
  p_round_trip    boolean,
  p_waiting_hours numeric,
  p_origin_lat    numeric,
  p_origin_lng    numeric,
  p_dest_lat      numeric,
  p_dest_lng      numeric,
  p_coupon_code   text default null
)
returns table (
  class_slug            text,
  class_title           text,
  capacity              integer,
  total                 numeric,
  base_fee              numeric,
  distance_cost         numeric,
  waiting_cost          numeric,
  round_trip_applied    boolean,
  peak_applied          boolean,
  min_applied           boolean,
  discount_applied      boolean,
  discount_code         text,
  discount_amount       numeric,
  discount_clamped      boolean,
  discount_rejection    text,
  total_before_discount numeric
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_code text;
  v_q    record;
  v_d    record;
begin
  v_code := public.discount_normalize_code(p_coupon_code);

  -- ── 🔒 معامل الكوبون ممنوع على أدوار المتصفح — الحاجز في الدالة لا في المسار ──
  --
  -- التسعير بلا رمز يبقى مفتوحاً للزائر كما كان منذ 0012 (الموقع يسعّر قبل
  -- الدخول). أما **الرمز** فيحوّل هذه الدالة إلى عرّافَين لمن يملك مفتاح anon
  -- المنشور في حزمة المتصفح:
  --   (أ) عرّاف وجود: `not-found` مقابل `class-not-eligible`/`below-min-total`/
  --       `exhausted`/`floor-guard` يفرّق الرمزَ الحقيقي عن الوهمي — فيُنقض
  --       القرار ٧ («بلاه تُجرَّب آلاف الرموز») لأن الخانق في
  --       `lib/discounts/rate-limit.ts` يقع على مسار الخادم وحده ولا يقع هنا.
  --   (ب) عرّاف تكلفة: حين تقلّص الأرضيةُ الخصمَ يصير
  --       `total_before_discount − discount_amount = greatest(التكلفة + الأرضية, min_price)`
  --       بالجنيه بالضبط. ولأن `authenticated` = متعهد، يستخرج تكلفة منافسه —
  --       وهو حرفياً الاستنتاج العكسي الذي بُنيت 0011 كلها لإغلاقه.
  --
  -- المنع هنا لا في طبقة التطبيق (سابقة D-16 حرفياً)، والسدّ هو `current_setting('role')`
  -- الذي يضبطه PostgREST بـ `set local role` ولا يبدّله `security definer` —
  -- نفس سدّ `pricing_internals_visible` في 0010. فيبقى `/api/quote` (بلا رمز) و
  -- `/api/discount/verify` (بمفتاح الخدمة) عاملَين بلا تعديل سطر، ويصير الخانق
  -- الطريقَ **الوحيد** فعلاً إلى تجربة الرموز.
  if v_code is not null
     and coalesce(nullif(current_setting('role', true), ''), '') in ('anon', 'authenticated')
     and not public.is_admin() then
    raise exception 'التحقق من رمز الخصم يمر بمسار الخادم وحده'
      using hint = 'forbidden';
  end if;

  -- بلا رمز: لا حاجة إلى أي رقم داخلي، فلا يُرفع العلم أصلاً
  if v_code is not null then
    perform set_config('tours.pricing_internals', 'on', true);
  end if;

  begin
    for v_q in
      select
        q.class_slug,
        q.class_title,
        q.capacity,
        q.total,
        -- في مسار المتعهد يكون distance_cost صفراً وbase_fee هو المبلغ كله؛
        -- نوزّعه على بندَي العرض نفسيهما حتى لا يميّز العميل مصدر السعر.
        case when q.distance_cost = 0 and q.base_fee > 0
             then round(least(q.base_fee * 0.2, q.base_fee), 2)
             else q.base_fee
        end as base_fee,
        case when q.distance_cost = 0 and q.base_fee > 0
             then round(q.base_fee - least(q.base_fee * 0.2, q.base_fee), 2)
             else q.distance_cost
        end as distance_cost,
        q.waiting_cost,
        q.round_trip_applied,
        q.peak_applied,
        q.min_applied,
        q.subcontractor_cost
      from public.quote_price(
        p_distance_km, p_passengers, p_round_trip, p_waiting_hours,
        p_origin_lat, p_origin_lng, p_dest_lat, p_dest_lng
      ) q
      order by q.capacity asc
    loop
      class_slug         := v_q.class_slug;
      class_title        := v_q.class_title;
      capacity           := v_q.capacity;
      base_fee           := v_q.base_fee;
      distance_cost      := v_q.distance_cost;
      waiting_cost       := v_q.waiting_cost;
      round_trip_applied := v_q.round_trip_applied;
      peak_applied       := v_q.peak_applied;
      min_applied        := v_q.min_applied;

      total_before_discount := v_q.total;

      if v_code is null then
        total              := v_q.total;
        discount_applied   := false;
        discount_code      := null;
        discount_amount    := 0;
        discount_clamped   := false;
        discount_rejection := null;
      else
        -- 🔒 الهاتف لا يُمرَّر من المسار العام: شاشة العروض بلا هاتف، وسقف
        -- العميل يُفرض في redeem_coupon داخل معاملة الحجز حيث الهاتف معروف.
        select * into v_d
        from public.apply_discount(v_code, v_q.total, v_q.class_slug, v_q.subcontractor_cost, null);

        total              := v_d.total_after;
        discount_applied   := v_d.applied;
        discount_code      := case when v_d.applied then v_code else null end;
        discount_amount    := v_d.amount;
        discount_clamped   := v_d.clamped;
        discount_rejection := case
          when v_d.rejection in ('not-found', 'expired', 'not-started') then 'not-found'
          else v_d.rejection
        end;
      end if;

      return next;
    end loop;
  exception
    when others then
      perform set_config('tours.pricing_internals', '', true);
      raise;
  end;

  perform set_config('tours.pricing_internals', '', true);
  return;
end;
$$;

comment on function public.quote_public(
  numeric, integer, boolean, numeric, numeric, numeric, numeric, numeric, text
) is 'واجهة التسعير العامة — أعمدة العرض وحقول الخصم. لا هوية متعهد ولا تكلفة ولا هامش في نوع الإرجاع، وأسباب الرفض المتقاربة تُجمَّع في not-found كي لا يعرف من يخمّن الرموز أنه اقترب. ⚠ معامل الكوبون مرفوض حين يكون دور الاتصال anon أو authenticated (غير مشرف): بالرمز تصير الدالة عرّافَ وجودٍ يلتف على حدّ المعدّل، وعرّافَ تكلفةٍ يستخرج التكلفة+الأرضية من الفرق حين تقلّص الأرضية الخصم.';

-- ----------------------------------------------------------------------------
-- (١٠) create_booking — معامل رمز الكوبون + لقطة تفصيل السعر بحقول الخصم
--
-- ⚠ **نوع الإرجاع لم يتغير** (سبعة أعمدة كما هي)، والمعامل السادس عشر له قيمة
-- افتراضية، ويُسقَط التوقيع الخماسي عشر صراحةً بعد إنشاء الجديد — فالنداء
-- القائم في `app/api/booking/route.ts` بخمسة عشر معاملاً مسمّى يبقى صحيحاً بلا
-- تعديل سطر واحد، ولا يقع فخّ «function is not unique».
--
-- ⚠ حدود مكافحة التلاعب من 0009 و0010 باقية كما هي بلا أي إضعاف:
--   • أرضية المسافة (٠٫٩ × الخط المستقيم) وسقفها (٣ أضعاف).
--   • السعر يُعاد حسابه من quote_price ولا يُقرأ من المستدعي إطلاقاً.
--   • الصلاحية لعميل الخدمة وحده.
--
-- الزيادة: بعد بناء السعر يُطبَّق الخصم في `apply_discount` (طبقة تالية لا خطوة
-- داخلية)، فيُخزَّن:
--   • `total`         = الإجمالي **بعد** الخصم ⇒ v_booking_profit وسقف البث
--                        وتقارير الهامش تصح تلقائياً بلا قيد دفتر (القاعدة ٥).
--   • `margin_amount` = الهامش ناقص الخصم ⇒ الخصم من هامش الموقع وحده.
--   • `subcontractor_cost` **بلا مساس** ⇒ التزام تعاقدي لا علاقة له بحملة
--     تسويقية (القاعدة ٢).
--   • `trip -> 'discount'` لقطة مجمَّدة ⇒ تعديل الكوبون بعد ١٠٠ حجز لا يغيّر
--     جنيهاً في حجز قائم (القاعدة ٤).
--
-- ⚠ رمزٌ مُرسَل ولم يُطبَّق ⇒ **الحجز يفشل** ولا يُنشأ بالسعر الكامل بصمت:
-- العميل اختار الحجز بسعرٍ مخصوم، وإنشاؤه بسعر أعلى بلا علمه أسوأ من رسالة خطأ.
-- ----------------------------------------------------------------------------
create or replace function public.create_booking(
  p_origin            jsonb,
  p_destination       jsonb,
  p_passengers        integer,
  p_round_trip        boolean,
  p_waiting_hours     numeric,
  p_distance_km       numeric,
  p_duration_min      numeric,
  p_distance_source   text,
  p_class_slug        text,
  p_plan              text,
  p_customer_name     text,
  p_customer_phone    text,
  p_customer_whatsapp text,
  p_pickup_at         timestamptz,
  p_notes             text,
  p_coupon_code       text default null
)
returns table (
  id               uuid,
  reference        text,
  public_token     text,
  total            numeric,
  amount_due       numeric,
  amount_remaining numeric,
  currency         text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_name        text;
  v_phone       text;
  v_whatsapp    text;
  v_plan        text;
  v_slug        text;
  v_passengers  integer;
  v_round_trip  boolean;
  v_waiting     numeric;
  v_distance    numeric;
  v_origin_lbl  text;
  v_origin_lat  numeric;
  v_origin_lng  numeric;
  v_dest_lbl    text;
  v_dest_lat    numeric;
  v_dest_lng    numeric;
  v_hav         numeric;
  v_offer       record;
  v_currency    text;
  v_pay         jsonb;
  v_percent     numeric;
  v_min         numeric;
  v_due         numeric;
  v_remaining   numeric;
  v_trip        jsonb;
  v_id          uuid;
  v_reference   text;
  v_token       text;
  v_attempt     integer;
  v_code        text;
  v_disc        record;
  v_kind        text;
  v_total       numeric;
  v_margin      numeric;
  v_disc_json   jsonb := 'null'::jsonb;
begin
  -- (أ) تطهير المدخلات النصية
  v_name     := nullif(btrim(coalesce(p_customer_name, '')), '');
  v_phone    := nullif(btrim(coalesce(p_customer_phone, '')), '');
  v_whatsapp := nullif(btrim(coalesce(p_customer_whatsapp, '')), '');
  v_slug     := nullif(btrim(coalesce(p_class_slug, '')), '');
  v_plan     := lower(nullif(btrim(coalesce(p_plan, '')), ''));
  v_code     := public.discount_normalize_code(p_coupon_code);

  if v_name is null then
    raise exception 'اسم العميل مطلوب' using hint = 'invalid-input';
  end if;
  if v_phone is null then
    raise exception 'رقم هاتف العميل مطلوب' using hint = 'invalid-input';
  end if;
  if v_slug is null then
    raise exception 'فئة السيارة مطلوبة' using hint = 'invalid-input';
  end if;

  v_plan := coalesce(v_plan, 'full');
  if v_plan not in ('full', 'deposit') then
    raise exception 'خطة الدفع يجب أن تكون full أو deposit' using hint = 'invalid-input';
  end if;

  v_passengers := greatest(coalesce(p_passengers, 1), 1);
  v_round_trip := coalesce(p_round_trip, false);
  v_waiting    := greatest(coalesce(p_waiting_hours, 0), 0);
  v_distance   := coalesce(p_distance_km, 0);

  if v_distance <= 0 or v_distance > 5000 then
    raise exception 'مسافة الرحلة غير منطقية (% كم)', v_distance using hint = 'invalid-input';
  end if;

  v_origin_lbl := nullif(btrim(coalesce(p_origin ->> 'label', '')), '');
  v_dest_lbl   := nullif(btrim(coalesce(p_destination ->> 'label', '')), '');
  v_origin_lat := public.jsonb_number(p_origin, 'lat', null);
  v_origin_lng := public.jsonb_number(p_origin, 'lng', null);
  v_dest_lat   := public.jsonb_number(p_destination, 'lat', null);
  v_dest_lng   := public.jsonb_number(p_destination, 'lng', null);

  if v_origin_lbl is null or v_dest_lbl is null
     or v_origin_lat is null or v_origin_lng is null
     or v_dest_lat is null or v_dest_lng is null then
    raise exception 'نقطتا الانطلاق والوصول غير مكتملتين' using hint = 'invalid-input';
  end if;

  -- (أ-٢) 🔒 د١ (0009) — المسافة تُقاس على الخريطة لا تُعلَن من المستدعي
  v_hav := public.haversine_km(v_origin_lat, v_origin_lng, v_dest_lat, v_dest_lng);

  if v_hav is not null and v_hav >= 1 then
    if v_distance < v_hav * 0.9 then
      raise exception
        'المسافة المُدخلة (% كم) أقصر من المسافة المستقيمة بين النقطتين (% كم)',
        v_distance, v_hav
        using hint = 'invalid-input';
    end if;
    if v_distance > v_hav * 3 then
      raise exception
        'المسافة المُدخلة (% كم) تفوق ثلاثة أضعاف المسافة المستقيمة (% كم)',
        v_distance, v_hav
        using hint = 'invalid-input';
    end if;
  end if;

  -- (ب) إعادة حساب السعر — المصدر الأوحد هو quote_price، وأي سعر من العميل مُهمَل.
  perform set_config('tours.pricing_internals', 'on', true);

  select q.class_slug, q.class_title, q.total,
         q.price_source, q.subcontractor_id, q.subcontractor_cost, q.margin_amount
    into v_offer
  from public.quote_price(v_distance, v_passengers, v_round_trip, v_waiting,
                          v_origin_lat, v_origin_lng, v_dest_lat, v_dest_lng) q
  where q.class_slug = v_slug;

  perform set_config('tours.pricing_internals', '', true);

  if v_offer.class_slug is null then
    raise exception 'الفئة «%» غير متاحة لرحلة بـ % راكباً', v_slug, v_passengers
      using hint = 'class-unavailable';
  end if;

  if v_offer.total is null or v_offer.total <= 0 then
    raise exception 'تعذّر احتساب سعر الرحلة' using hint = 'pricing-failed';
  end if;

  -- (ب-٢) 🔒 الخصم — طبقة تالية لبناء السعر، والحاجز داخل apply_discount
  v_total  := v_offer.total;
  v_margin := v_offer.margin_amount;

  if v_code is not null then
    select * into v_disc
    from public.apply_discount(v_code, v_offer.total, v_offer.class_slug,
                               v_offer.subcontractor_cost, v_phone);

    if not v_disc.applied then
      -- رسالة واحدة لكل الأسباب: التفريق يخبر من يخمّن الرموز أنه اقترب.
      -- والتفصيل يبقى للوحة عبر apply_discount مباشرةً.
      raise exception 'رمز الخصم غير صالح لهذه الرحلة' using hint = 'coupon-rejected';
    end if;

    select c.kind into v_kind from public.coupons c where c.code = v_code;

    v_total := v_disc.total_after;
    if v_margin is not null then
      v_margin := greatest(round(v_margin - v_disc.amount, 2), 0);
    end if;

    -- 🔒 **لا `clamped` في اللقطة.** `bookings.trip` يخرج كاملاً من
    -- `get_booking_by_token(text)` (0007) وهي ممنوحة لـ anon، فحاملُ توكن —
    -- والتوكن يمر في رابط قد يُشارَك — كان سيقرأ الراية: «سعر رحلتك لامس أرضية
    -- الهامش»، ومنها `totalBefore − amount = التكلفة + الأرضية` لتلك الرحلة.
    -- والراية محفوظة أصلاً في `coupon_redemptions.clamped` المحجوب عن غير
    -- المشرف، واللوحة تقرؤها من هناك لا من اللقطة — فحذفها هنا لا يفقد المالك
    -- شيئاً ويغلق عرّافاً على أرضية الهامش (سابقة 0011).
    v_disc_json := jsonb_build_object(
      'code',        v_code,
      'kind',        v_kind,
      'amount',      v_disc.amount,
      'totalBefore', v_offer.total,
      'totalAfter',  v_disc.total_after
    );
  end if;

  -- (ج) العملة من إعدادات التسعير (لا نص ثابت في الكود)
  select ps.currency into v_currency from public.pricing_settings ps limit 1;
  v_currency := coalesce(v_currency, 'EGP');

  -- (د) العربون من مفتاح الإعدادات payment — **من الإجمالي بعد الخصم**
  --     (العربون نسبة من total، فالخصم يغيّره تلقائياً كما ينص الموجز).
  select s.value into v_pay from public.site_settings s where s.key = 'payment';
  v_percent := public.jsonb_number(v_pay, 'depositPercent', 30);
  v_min     := public.jsonb_number(v_pay, 'depositMinAmount', 200);

  if v_plan = 'deposit' then
    -- النسبة أو الحد الأدنى أيهما أكبر، وبحد أقصى الإجمالي (لا عربون يفوق السعر)
    v_due := least(v_total, greatest(round(v_total * v_percent / 100), v_min));
    v_due := greatest(v_due, 0);
  else
    v_due := v_total;
  end if;
  v_remaining := greatest(v_total - v_due, 0);

  -- (هـ) لقطة الرحلة — تُحفظ كما هي ولا تتأثر بأي تعديل لاحق للتعريفات أو الكوبون.
  v_trip := jsonb_build_object(
    'originLabel',    v_origin_lbl,
    'originLat',      v_origin_lat,
    'originLng',      v_origin_lng,
    'destLabel',      v_dest_lbl,
    'destLat',        v_dest_lat,
    'destLng',        v_dest_lng,
    'distanceKm',     v_distance,
    'straightKm',     v_hav,
    'durationMin',    p_duration_min,
    'distanceSource', coalesce(nullif(btrim(coalesce(p_distance_source, '')), ''), 'estimate'),
    'passengers',     v_passengers,
    'roundTrip',      v_round_trip,
    'waitingHours',   v_waiting,
    'pickupAt',       p_pickup_at,
    'notes',          nullif(btrim(coalesce(p_notes, '')), ''),
    'discount',       v_disc_json
  );

  -- (و) الإدراج — المرجع والتوكن يولّدهما المُشغّل، وتصادمهما يُعالَج بإعادة المحاولة.
  perform set_config('tours.booking_note', 'إنشاء الحجز', true);

  for v_attempt in 1 .. 5 loop
    begin
      insert into public.bookings as b (
        status, class_slug, class_title, total, currency, plan,
        amount_due, amount_remaining,
        customer_name, customer_phone, customer_whatsapp, trip,
        price_source, subcontractor_id, subcontractor_cost, margin_amount
      )
      values (
        'pending_payment', v_offer.class_slug, v_offer.class_title, v_total, v_currency, v_plan,
        v_due, v_remaining,
        v_name, v_phone, v_whatsapp, v_trip,
        coalesce(v_offer.price_source, 'tariff'), v_offer.subcontractor_id,
        v_offer.subcontractor_cost, v_margin
      )
      returning b.id, b.reference, b.public_token
      into v_id, v_reference, v_token;
      exit;
    exception
      when unique_violation then
        if v_attempt >= 5 then
          raise exception 'تعذّر توليد رقم مرجعي فريد للحجز' using hint = 'db-unavailable';
        end if;
        perform set_config('tours.booking_note', 'إنشاء الحجز', true);
    end;
  end loop;

  -- (ز) 🔒 تسجيل الاستخدام **داخل نفس المعاملة**: فشلُه يُسقط الحجز كله، فلا
  --     يوجد حجز بسعر مخصوم بلا استخدام مسجَّل، ولا يتجاوز كوبونٌ سقفه لأن
  --     الخاسر في السباق تنهار معاملته بأكملها.
  if v_code is not null then
    perform set_config('tours.discount_clamped',
                       case when v_disc.clamped then 'on' else 'off' end, true);
    perform public.redeem_coupon(v_code, v_id, v_disc.amount, v_phone);
    perform set_config('tours.discount_clamped', '', true);
  end if;

  id               := v_id;
  reference        := v_reference;
  public_token     := v_token;
  total            := v_total;
  amount_due       := v_due;
  amount_remaining := v_remaining;
  currency         := v_currency;
  return next;
end;
$$;

-- 🔒 إسقاط التوقيع الخماسي عشر صراحةً — بقاؤه مع الجديد يوقع في
-- «function is not unique» على كل نداء بخمسة عشر معاملاً.
drop function if exists public.create_booking(
  jsonb, jsonb, integer, boolean, numeric, numeric, numeric,
  text, text, text, text, text, text, timestamptz, text
);

comment on column public.bookings.margin_amount is
  'الهامش المطبَّق **بعد الخصم**: أساسه كما في 0011 (ما قبل الذروة − الانتظار − التكلفة) ناقصاً قيمة الخصم، وبحدٍّ أدنى صفر. الحدّ عند الصفر قد يقع حين ترفع عمولة الذروة الإجمالي فوق أساس الهامش فيتجاوز الخصمُ الأساسَ — وحينها الرقم الحاكم للربح هو v_booking_profit.gross_profit (‏total − تكلفة المنفّذ) وهو دقيق دائماً لأن total صار بعد الخصم.';

comment on column public.bookings.subcontractor_cost is
  'تكلفة المتعهد المطبَّقة على الرحلة كاملة — **لا يمسّها خصم أبداً** (القاعدة ٢ في lib/discount-types.ts): التزام تعاقدي لا علاقة له بحملة تسويقية للموقع.';

comment on function public.create_booking(
  jsonb, jsonb, integer, boolean, numeric, numeric, numeric,
  text, text, text, text, text, text, timestamptz, text, text
) is 'إنشاء الحجز: يعيد حساب السعر من quote_price، ثم يطبّق الخصم كطبقة تالية بحاجز أرضية الهامش، ويجمّد اللقطة، ويسجّل استخدام الكوبون في نفس المعاملة. total المخزَّن هو ما بعد الخصم فتصح تقارير الهامش بلا قيد دفتر.';

-- ----------------------------------------------------------------------------
-- (١١) v_stats_discounts — القسم الإحصائي السابع
--
-- المصدر `coupon_redemptions` وحده: صفّ الاستخدام هو الأثر المالي الوحيد للخصم
-- (لا قيد دفتر له — القاعدة ٥). و`security_invoker` كبقية عروض 0022: غير المشرف
-- يأخذ صفر صف من سياسة الجدول تحته بنيوياً لا بشرط في العرض.
-- ----------------------------------------------------------------------------
drop view if exists public.v_stats_discounts cascade;

create view public.v_stats_discounts
with (security_invoker = true)
as
select
  (r.redeemed_at at time zone 'Africa/Cairo')::date            as day,
  (count(*))::integer                                          as redemptions_count,
  (count(distinct r.coupon_id))::integer                       as coupons_used,
  coalesce(sum(r.amount), 0)::numeric(14,2)                    as discount_amount,
  coalesce(sum(b.total), 0)::numeric(14,2)                     as discounted_orders_value,
  (count(*) filter (where r.clamped))::integer                 as clamped_count
from public.coupon_redemptions r
join public.bookings b on b.id = r.booking_id
group by 1;

comment on view public.v_stats_discounts is
  'الخصومات باليوم: عدد الاستخدامات، كوبونات مختلفة، قيمة الخصم، قيمة الطلبات بعد الخصم، وكم استخداماً قلّصته أرضية الهامش. لا رمز ولا هاتف في نوع الإرجاع.';

-- ----------------------------------------------------------------------------
-- (١٢) section_stats — القسم السابع `discounts`
--
-- ⚠ الدالة تُعاد كتابتها **كاملة** لأن `create or replace` يستبدل الجسم كله؛
-- والفروع الستة منسوخة حرفياً من 0022 بلا تغيير حرف، والزيادة هي الفرع السابع
-- وإضافة `discounts` إلى قائمة الأقسام المسموحة ورسالة الخطأ. وهي دالة مركزية
-- ترفض اليوم أي قسم خارج الستة برمي exception (0022_analytics.sql:729-731)،
-- فالتوسعة هجرة إلزامية لا شاشة جديدة.
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
        coalesce(count(distinct btrim(b.customer_phone)), 0),
        coalesce(count(*), 0),
        coalesce(sum(b.total), 0)
      into v_c_cust, v_c_orders, v_c_value
      from public.bookings b
      where btrim(coalesce(b.customer_phone, '')) <> ''
        and (b.created_at at time zone 'Africa/Cairo')::date between v_from and v_to;

      select
        coalesce(count(distinct btrim(b.customer_phone)), 0),
        coalesce(count(*), 0),
        coalesce(sum(b.total), 0)
      into v_p_cust, v_p_orders, v_p_value
      from public.bookings b
      where btrim(coalesce(b.customer_phone, '')) <> ''
        and (b.created_at at time zone 'Africa/Cairo')::date between v_pfrom and v_pto;

      -- «عميل جديد» = أول حجز له **على الإطلاق** وقع داخل الفترة
      select coalesce(count(*), 0) into v_c_new
      from (
        select btrim(b.customer_phone) as ph, min(b.created_at) as first_at
        from public.bookings b
        where btrim(coalesce(b.customer_phone, '')) <> ''
        group by 1
      ) f
      where (f.first_at at time zone 'Africa/Cairo')::date between v_from and v_to;

      select coalesce(count(*), 0) into v_p_new
      from (
        select btrim(b.customer_phone) as ph, min(b.created_at) as first_at
        from public.bookings b
        where btrim(coalesce(b.customer_phone, '')) <> ''
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
         'عدد العملاء المختلفين الذين حجزوا في الفترة — العميل يُعرَّف برقم هاتفه، والرقم نفسه لا يخرج من القاعدة.'::text),
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
  'بطاقات مؤشرات StatCard لأي قسم من السبعة (orders|partners|treasury|customers|content|locales|discounts) مقارنةً بالفترة السابقة المساوية. percent من ٠ إلى ١٠٠ و duration بالدقائق. قسم مجهول يرمي exception.';

-- ----------------------------------------------------------------------------
-- (١٣) مساحة i18n جديدة `discount` (قرار ١١)
--
-- `translations.namespace` مقيَّد بست مساحات في 0018 (السطر ٢٠٨)، فنص كوبون أو
-- بانر لا يمكن أن يُترجَم قبل توسعة القيد. والتوسعة إضافية محضة: لا صفّ قائم
-- يتأثر بها.
-- ----------------------------------------------------------------------------
do $$
declare
  v_con text;
begin
  -- القيد وُلد بلا اسم صريح في 0018 (فحص على مستوى العمود)، فنبحث عنه بتعريفه
  -- لا باسمٍ مفترَض — الاسم المولَّد قد يختلف بين نسخ Whitelabel.
  for v_con in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public' and t.relname = 'translations'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) like '%namespace%'
  loop
    execute format('alter table public.translations drop constraint %I', v_con);
  end loop;

  alter table public.translations
    add constraint translations_namespace_check
    check (namespace in ('ui', 'page', 'section', 'settings', 'service', 'vehicle', 'discount'));
end;
$$;

-- ----------------------------------------------------------------------------
-- (١٤) RLS + الصلاحيات
--
-- 🔒 كتلة `revoke` أولاً على كل جدول جديد: Supabase تمنح `anon` صلاحيات واسعة
-- افتراضياً على الجداول الجديدة — منها `TRUNCATE` **وهي لا تخضع لـ RLS إطلاقاً**.
-- حذف سطر واحد من هنا يفتح الجداول.
-- ----------------------------------------------------------------------------
alter table public.discount_settings   enable row level security;
alter table public.coupons             enable row level security;
alter table public.coupon_redemptions  enable row level security;
alter table public.promo_banners       enable row level security;

revoke all on public.discount_settings  from public, anon, authenticated;
revoke all on public.coupons            from public, anon, authenticated;
revoke all on public.coupon_redemptions from public, anon, authenticated;
revoke all on public.promo_banners      from public, anon, authenticated;
revoke all on public.v_stats_discounts  from public, anon, authenticated;

-- (١٤-١) الإعدادات: للمشرف وحده — لا شيء لـ anon، والقراءة نفسها محروسة
grant select, insert, update on public.discount_settings to authenticated;

-- (١٤-٢) الكوبونات: إدارة كاملة للمشرف. الزائر لا يلمس الجدول إطلاقاً —
--        تحققه يمر بـ apply_discount (definer) وحدها.
grant select, insert, update, delete on public.coupons to authenticated;

-- (١٤-٣) سجل الاستخدام: قراءة للمشرف فقط، ولا كتابة لأحد (redeem_coupon definer)
grant select on public.coupon_redemptions to authenticated;

-- (١٤-٤) البانرات: قراءة للزائر (السياسة تحصرها بالفعّال داخل نافذته)، وإدارة للمشرف
grant select                         on public.promo_banners to anon;
grant select, insert, update, delete on public.promo_banners to authenticated;

grant select on public.v_stats_discounts to authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant select, insert, update on public.discount_settings to service_role';
    execute 'grant select, insert, update, delete on public.coupons to service_role';
    execute 'grant select, insert, update, delete on public.coupon_redemptions to service_role';
    execute 'grant select, insert, update, delete on public.promo_banners to service_role';
    execute 'grant select on public.v_stats_discounts to service_role';
  end if;
end;
$$;

-- (١٤-٥) سياسات discount_settings — أعمدة الهامش لا يراها إلا مشرف
drop policy if exists "discount_settings_select_admin" on public.discount_settings;
create policy "discount_settings_select_admin"
  on public.discount_settings for select to authenticated using (public.is_admin());

drop policy if exists "discount_settings_insert_admin" on public.discount_settings;
create policy "discount_settings_insert_admin"
  on public.discount_settings for insert to authenticated with check (public.is_admin());

drop policy if exists "discount_settings_update_admin" on public.discount_settings;
create policy "discount_settings_update_admin"
  on public.discount_settings for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- (١٤-٦) سياسات coupons — لا سياسة تستهدف anon ولا منح له: طبقتان معاً
drop policy if exists "coupons_select_admin" on public.coupons;
create policy "coupons_select_admin"
  on public.coupons for select to authenticated using (public.is_admin());

drop policy if exists "coupons_insert_admin" on public.coupons;
create policy "coupons_insert_admin"
  on public.coupons for insert to authenticated with check (public.is_admin());

drop policy if exists "coupons_update_admin" on public.coupons;
create policy "coupons_update_admin"
  on public.coupons for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "coupons_delete_admin" on public.coupons;
create policy "coupons_delete_admin"
  on public.coupons for delete to authenticated using (public.is_admin());

-- (١٤-٧) سياسات coupon_redemptions — قراءة للمشرف، ولا كتابة لأي دور مستخدم
drop policy if exists "coupon_redemptions_select_admin" on public.coupon_redemptions;
create policy "coupon_redemptions_select_admin"
  on public.coupon_redemptions for select to authenticated using (public.is_admin());

-- (١٤-٨) سياسات promo_banners
drop policy if exists "promo_banners_select_public" on public.promo_banners;
create policy "promo_banners_select_public"
  on public.promo_banners for select to anon
  using (
    enabled
    and (starts_at is null or starts_at <= now())
    and (ends_at   is null or ends_at   >  now())
  );

drop policy if exists "promo_banners_select_auth" on public.promo_banners;
create policy "promo_banners_select_auth"
  on public.promo_banners for select to authenticated
  using (
    public.is_admin()
    or (
      enabled
      and (starts_at is null or starts_at <= now())
      and (ends_at   is null or ends_at   >  now())
    )
  );

drop policy if exists "promo_banners_insert_admin" on public.promo_banners;
create policy "promo_banners_insert_admin"
  on public.promo_banners for insert to authenticated with check (public.is_admin());

drop policy if exists "promo_banners_update_admin" on public.promo_banners;
create policy "promo_banners_update_admin"
  on public.promo_banners for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "promo_banners_delete_admin" on public.promo_banners;
create policy "promo_banners_delete_admin"
  on public.promo_banners for delete to authenticated using (public.is_admin());

-- ----------------------------------------------------------------------------
-- (١٥) صلاحيات الدوال — السحب من الثلاثة ثم المنح الصريح
--
-- 🔒 التذكير الذي كلّف المشروع ثغرة من قبل: الدوال الجديدة تولد ومعها `EXECUTE`
-- ضمني لـ PUBLIC ومنح افتراضي لـ `anon`/`authenticated`، و`create or replace`
-- لا يعيد ضبط الصلاحيات. سحب PUBLIC وحده لا يكفي.
-- ----------------------------------------------------------------------------

-- دوال داخلية بحتة: لا تُمنح لأي دور مستخدم
revoke all on function public.discount_config()                        from public, anon, authenticated;
revoke all on function public.discount_implied_cost(numeric, numeric)  from public, anon, authenticated;
revoke all on function public.coupons_normalize_code()                 from public, anon, authenticated;

-- 🔒 apply_discount و redeem_coupon: عميل الخدمة وحده.
-- **لا تُمنح لـ authenticated**: كل متعهد مستخدم `authenticated`، وهو يتحكم في
-- `p_partner_cost` فيستطيع استكشاف أرضية الهامش بالتجربة — نفس الاستنتاج العكسي
-- الذي أغلقته 0011 حين سحبت أعمدة الهامش. واللوحة لا تحتاجهما: إدارة الكوبونات
-- كتابةٌ في الجدول، والتحقق العام يمر بمسار خادمي بمفتاح الخدمة وبحدّ معدّل.
revoke all on function public.apply_discount(text, numeric, text, numeric, text)
  from public, anon, authenticated;
revoke all on function public.redeem_coupon(text, uuid, numeric, text)
  from public, anon, authenticated;

-- التطبيع: نصٌّ خالص بلا قراءة من أي جدول — يحتاجه الزائر لعرض الرمز مطبَّعاً
revoke all    on function public.discount_normalize_code(text) from public, anon, authenticated;
grant execute on function public.discount_normalize_code(text) to anon, authenticated;

-- «هل النظام مفعَّل» — بوليان وحده
revoke all    on function public.discount_enabled() from public, anon, authenticated;
grant execute on function public.discount_enabled() to anon, authenticated;

-- إعدادات اللوحة — الحارس is_admin داخلها
revoke all    on function public.get_discount_settings() from public, anon, authenticated;
grant execute on function public.get_discount_settings() to authenticated;

-- 🔒 quote_public: التوقيع التساعي للزائر والمسجَّل — **للتسعير بلا رمز وحده**.
-- الحماية طبقتان لا واحدة: نوع الإرجاع بلا تكلفة ولا هامش، **وحارس في مطلع
-- الدالة يرفض معامل الكوبون حين يكون دور الاتصال anon/authenticated**. بلا
-- الحارس يصير هذا المنح التفافاً على حدّ المعدّل (القرار ٧) وعلى عزل 0011.
revoke all on function public.quote_public(
  numeric, integer, boolean, numeric, numeric, numeric, numeric, numeric, text
) from public, anon, authenticated;
grant execute on function public.quote_public(
  numeric, integer, boolean, numeric, numeric, numeric, numeric, numeric, text
) to anon, authenticated;

-- 🔒 د١ (0009) بلا إضعاف: إنشاء الحجز لعميل الخدمة وحده
revoke all on function public.create_booking(
  jsonb, jsonb, integer, boolean, numeric, numeric, numeric,
  text, text, text, text, text, text, timestamptz, text, text
) from public, anon, authenticated;

-- section_stats: كما كانت في 0022 — `create or replace` لا يعيد ضبط الصلاحيات،
-- وإعادة التأكيد أرخص من ثغرة.
revoke all    on function public.section_stats(text, date, date) from public, anon, authenticated;
grant execute on function public.section_stats(text, date, date) to authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.discount_config() to service_role';
    execute 'grant execute on function public.discount_enabled() to service_role';
    execute 'grant execute on function public.discount_normalize_code(text) to service_role';
    execute 'grant execute on function public.discount_implied_cost(numeric, numeric) to service_role';
    execute 'grant execute on function public.get_discount_settings() to service_role';
    execute 'grant execute on function public.apply_discount(text, numeric, text, numeric, text) to service_role';
    execute 'grant execute on function public.redeem_coupon(text, uuid, numeric, text) to service_role';
    execute 'grant execute on function public.quote_public(numeric, integer, boolean, numeric, numeric, numeric, numeric, numeric, text) to service_role';
    execute 'grant execute on function public.create_booking(
               jsonb, jsonb, integer, boolean, numeric, numeric, numeric,
               text, text, text, text, text, text, timestamptz, text, text) to service_role';
    execute 'grant execute on function public.section_stats(text, date, date) to service_role';
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- (١٦) فحص ذاتي بعد التنفيذ — شروط إغلاق طبقة القاعدة
-- ----------------------------------------------------------------------------
do $$
declare
  v_missing text;
  v_n       integer;
begin
  -- (١٦-١) الكائنات موجودة
  select string_agg(x.rel, '، ')
    into v_missing
  from (values
    ('public.coupons'), ('public.coupon_redemptions'),
    ('public.promo_banners'), ('public.discount_settings'),
    ('public.v_stats_discounts')
  ) as x(rel)
  where to_regclass(x.rel) is null;

  if v_missing is not null then
    raise exception '0024: كائنات ناقصة بعد التنفيذ: %', v_missing;
  end if;

  -- (١٦-٢) الدوال بتواقيعها الحرفية كما في lib/discount-types.ts
  select string_agg(x.sig, '، ')
    into v_missing
  from (values
    ('public.apply_discount(text, numeric, text, numeric, text)'),
    ('public.redeem_coupon(text, uuid, numeric, text)'),
    ('public.discount_config()'),
    ('public.discount_enabled()'),
    ('public.get_discount_settings()'),
    ('public.discount_normalize_code(text)'),
    ('public.discount_implied_cost(numeric, numeric)'),
    ('public.quote_public(numeric, integer, boolean, numeric, numeric, numeric, numeric, numeric, text)'),
    ('public.create_booking(jsonb, jsonb, integer, boolean, numeric, numeric, numeric, text, text, text, text, text, text, timestamptz, text, text)'),
    ('public.section_stats(text, date, date)')
  ) as x(sig)
  where to_regprocedure(x.sig) is null;

  if v_missing is not null then
    raise exception '0024: دوال ناقصة بعد التنفيذ: %', v_missing;
  end if;

  -- (١٦-٣) 🔒 التوقيعان القديمان أُسقطا فعلاً — وإلا «function is not unique»
  if to_regprocedure('public.quote_public(numeric, integer, boolean, numeric, numeric, numeric, numeric, numeric)') is not null then
    raise exception '0024: التوقيع الثماني لـ quote_public ما زال موجوداً — النداء بثمانية معاملات سيفشل بـ «function is not unique»';
  end if;

  if to_regprocedure('public.create_booking(jsonb, jsonb, integer, boolean, numeric, numeric, numeric, text, text, text, text, text, text, timestamptz, text)') is not null then
    raise exception '0024: التوقيع الخماسي عشر لـ create_booking ما زال موجوداً — النداء القائم سيفشل بـ «function is not unique»';
  end if;

  -- (١٦-٤) 🔒 لا صلاحية للزائر على الجداول الحساسة — والفخ الحقيقي هو TRUNCATE
  --        (لا تخضع لـ RLS إطلاقاً، فسياسة صحيحة لا تنفع معها)
  if exists (select 1 from pg_roles where rolname = 'anon') then
    select count(*)::integer into v_n
    from (values
      ('public.coupons'), ('public.coupon_redemptions'), ('public.discount_settings')
    ) as t(rel)
    cross join (values
      ('select'), ('insert'), ('update'), ('delete'), ('truncate'), ('references'), ('trigger')
    ) as p(priv)
    where has_table_privilege('anon', t.rel, p.priv);

    if v_n > 0 then
      raise exception '0024: الزائر يملك % صلاحية على جداول الخصم — راجع كتلة revoke', v_n;
    end if;
  end if;

  -- (١٦-٥) 🔒 لا EXECUTE للزائر ولا للمسجَّل على دالتَي الحساب والتسجيل
  if exists (select 1 from pg_roles where rolname = 'anon')
     and (has_function_privilege('anon', 'public.apply_discount(text, numeric, text, numeric, text)', 'execute')
          or has_function_privilege('anon', 'public.redeem_coupon(text, uuid, numeric, text)', 'execute')) then
    raise exception '0024: apply_discount أو redeem_coupon ممنوحة للزائر';
  end if;

  if exists (select 1 from pg_roles where rolname = 'authenticated')
     and (has_function_privilege('authenticated', 'public.apply_discount(text, numeric, text, numeric, text)', 'execute')
          or has_function_privilege('authenticated', 'public.redeem_coupon(text, uuid, numeric, text)', 'execute')) then
    raise exception '0024: apply_discount أو redeem_coupon ممنوحة للمسجَّل — والمتعهد مسجَّل، ويستكشف أرضية الهامش من p_partner_cost';
  end if;

  -- (١٦-٦) القسم السابع مقبول فعلاً (وحين لا يمر حارس الإحصائيات نكتفي بإشعار
  --        بدل تعطيل الهجرة على قاعدة تُهاجَر بدور غير مالكها)
  if public.analytics_admin_allowed() then
    select count(*)::integer into v_n from public.section_stats('discounts', null, null);
    if v_n = 0 then
      raise exception '0024: section_stats(''discounts'') لم تُرجع بطاقة واحدة';
    end if;
  else
    raise notice '⚠ 0024: حارس الإحصائيات يرفض هذا الاتصال — تخطّي فحص القسم السابع';
  end if;

  -- (١٦-٧) النظام مطفأ في البذرة (قرار ١٠ · D-25 · D-31)
  if (select d.enabled from public.discount_config() d) then
    raise notice '⚠ 0024: نظام الخصومات **مفعَّل** في هذه القاعدة — تأكد أن ذلك قرار مقصود';
  end if;
end;
$$;

do $$
begin
  raise notice '✔ 0024_discounts: الكوبونات والبانرات + أرضية الهامش في القاعدة + القسم الإحصائي السابع';
end;
$$;
