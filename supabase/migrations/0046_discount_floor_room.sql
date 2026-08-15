-- ============================================================================
-- 0046 — استخراج ميزانية أرضية السعر إلى دالةٍ واحدة (المرحلة ١٢ب)
--
-- المرجع الملزم: `lib/loyalty-types.ts` §١. وهذه الهجرة **تنفّذ ولا تعيد اشتقاق**.
-- و`0024` مطبَّقة ولا تُعدَّل (انضباط الهجرات: الملف المُطبَّق تاريخٌ لا مسودة).
--
-- ── العطب الذي تُغلقه، وهو أخطر ما في المرحلة ────────────────────────────────
--
-- `apply_discount` تحسب الأرضية من الإجمالي **الداخل**، و`v_max` هو **المساحة
-- كلها**. فطبقةُ خصمٍ ثانية تطرح من `total_after` تخترق أرضيةً ضبطتها
-- `apply_discount` نفسها — أي تحت تكلفة المتعهد زائد أدنى هامش، وهو **نقضُ
-- D-16** بعينه.
--
-- ⚠ **ولا يُمسَك بفحص**: `apply_discount` تُرجع `applied = true` وقيمةً سليمةً
-- تماماً، وكل اختبارات ١٢أ تبقى خضراء، بينما `bookings.total` النهائي تحت
-- الأرضية. عطبٌ صامتٌ في المال — وهو أسوأ الأنواع، لأن لا شيء يرنّ.
--
-- 🔒 **والعلاج بنيويّ لا انتباهيّ**: معادلة الأرضية تصير **مكاناً واحداً**
-- تناديه كل طبقة تريد أن تخصم — الكوبون اليوم، والنقاط في الدفعة التالية.
-- فالسقف واحدٌ للطبقتين مجتمعتين، لا سقفان يُجمعان (§١ البند ٤).
--
-- ── وهي **نقلٌ لا إعادة كتابة** (D-58) ──────────────────────────────────────
--
-- جسم `discount_floor_room` مأخوذ من `pg_get_functiondef(apply_discount)` الحيّ
-- — لا من نصّ `0024` — سطراً بسطر، بما فيه تعليقاته. والسبب أن **الأرقام لا
-- يجوز أن تنحرف**: أرضيةٌ ثانية بمعادلةٍ «مكافئة» هي مصدرٌ ثانٍ لرقمٍ واحد،
-- وهو النمط ٨ في `LESSONS.md` الذي تكرّر مرتين في هذا المستودع.
--
-- وحدّ التغيير في `apply_discount`: **سطرا الحساب** يصيران نداءً واحداً، وخمسة
-- متغيّرات محلية صارت بلا مستعمل فحُذفت. ولا حرف غير ذلك — فهي أخطر دالة في
-- محرك التسعير وعليها تقوم المرحلة ١٢أ كلها.
--
-- ── الإثبات المطلوب: **لا سلوك تغيّر** ──────────────────────────────────────
-- قِيس ناتج `apply_discount` على ٣٤٨ حالة (إجماليات وفئات وتكاليف من حجوزاتٍ
-- حقيقية + حالات الحدّ: لا مساحة · مساحة جنيهٍ واحد · كوبون أكبر من المساحة ·
-- إجمالي صفر · فئة null) قبل الهجرة وبعدها، والفرق **صفر**. والفحص الذاتي أسفل
-- الملف يحرس ما لا يحرسه القياس: أن التفويض **حيّ** لا نسخة ثانية.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (١) 🔒 discount_floor_room — ميزانية الأرضية، مصدراً واحداً لكل طبقة خصم
--
-- تُرجع رقمين:
--   • `min_total` — أدنى إجمالي يُسمح بالنزول إليه بعد **كل** طبقات الخصم.
--   • `room`      — ما يحتمله الإجمالي الداخل من خصمٍ إجمالاً، بالجنيه الصحيح.
--
-- ⚠ **`room` ميزانيةٌ تُقتسم لا حصّةٌ لكل طبقة**: من ينادي هذه الدالة بعد طبقةٍ
-- سابقة عليه أن يطرح ما أخذته تلك الطبقة، لا أن ينادي بالإجمالي الجديد ويأخذ
-- `room` كاملةً من جديد — وذلك بالضبط هو العطب الذي وُلدت هذه الدالة لإغلاقه.
--
-- 🔒 الصلاحية: `service_role` وحده، **ولا تُمنح لـ authenticated أبداً**. كل
-- متعهد مستخدم `authenticated`، وهو يتحكم في `p_partner_cost`: فبنداءين على هذه
-- الدالة يقرأ سياسة الهامش مباشرةً — وهو الاستنتاج العكسي الذي أغلقته `0011`
-- حين سحبت أعمدة الهامش. وهي هنا **أسوأ** من `apply_discount`: تلك تحتاج كوبوناً
-- صالحاً وتُرجع خصماً، وهذه تُرجع الأرضية عارية بلا شرط.
-- ----------------------------------------------------------------------------
create or replace function public.discount_floor_room(
  p_total        numeric,
  p_class_slug   text,
  p_partner_cost numeric
)
returns table (
  min_total numeric,
  room      numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_cfg       record;
  v_total     numeric;
  v_cost      numeric;
  v_floor     numeric;
  v_disp      numeric;
  v_minprice  numeric;
begin
  -- نفس تطبيع المدخل في `apply_discount` حرفياً: `round(coalesce(...), 2)`.
  -- ومناداتها بإجماليٍّ مقرَّبٍ سلفاً لا تغيّر شيئاً (التقريب خامل على نفسه)،
  -- فيبقى النداءان — من الكوبون ومن طبقةٍ لاحقة — على أرضيةٍ واحدة.
  v_total := round(coalesce(p_total, 0), 2);

  select * into v_cfg from public.discount_config();

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

  min_total := greatest(v_cost + v_floor, coalesce(v_minprice, 0));
  -- `floor` لا `round`: تقريبٌ لأعلى هنا يخترق الأرضية بنصف جنيه — والأرضية حدٌّ
  -- لا يُقارَب. وحين لا تتسع المساحة لجنيه واحد يصير room صفراً فيقع الرفض،
  -- وهو صدقٌ لا عطل.
  room      := floor(v_total - min_total);
  return next;
end;
$$;

comment on function public.discount_floor_room(numeric, text, numeric) is
  'ميزانية أرضية السعر: أدنى إجمالي مسموح (min_total) وما يحتمله الإجمالي الداخل من خصمٍ إجمالاً (room). مصدرٌ واحد لكل طبقة خصم — الكوبون والنقاط معاً — فالسقف واحد للطبقتين مجتمعتين ولا يخترق أحدهما أرضية ضبطها الآخر (loyalty-types §١ · D-16). room ميزانيةٌ تُقتسم: من ينادي بعد طبقةٍ سابقة يطرح ما أخذته. service_role وحده: تُرجع سياسة الهامش عاريةً لمن يتحكم في p_partner_cost.';

-- ----------------------------------------------------------------------------
-- (٢) apply_discount — الجسم الحيّ كما هو، وحسابُ الأرضية صار تفويضاً
--
-- الفرق عن الجسم المطبَّق، ولا شيء غيره:
--   • حُذفت `v_cost` و`v_floor` و`v_disp` و`v_minprice` و`v_mintotal` — صارت
--     محليّاتِ `discount_floor_room` وحدها فلا مستعمل لها هنا.
--   • ستة أسطر الحساب صارت نداءً واحداً يملأ `v_max`.
-- وكل شرطٍ وكل رسالةٍ وكل تعليقٍ فيما عدا ذلك منقولٌ حرفياً من
-- `pg_get_functiondef` الحيّ.
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

  -- ── 🔒 أرضية الهامش — تفويضٌ لا استنساخ (loyalty-types §١) ────────────────
  -- المعادلة كانت هنا ست أسطر، وصارت في `discount_floor_room` مكاناً واحداً
  -- تناديه هذه الطبقة وكل طبقةٍ بعدها. و`room` هي **المساحة كلها**: من يخصم
  -- بعد الكوبون يطرح ما أخذه الكوبون من الميزانية نفسها، ولا يفتح ميزانيةً
  -- ثانية من `total_after`.
  select r.room into v_max
  from public.discount_floor_room(v_total, p_class_slug, p_partner_cost) r;

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
  'الدالة الوحيدة التي تحسب خصم كوبون. تُستدعى بعد quote_price لا داخلها. أرضية الهامش مفوَّضة إلى discount_floor_room منذ 0046 — مصدرٌ واحد للأرضية يشترك فيه الكوبون وكل طبقة خصمٍ بعده، فلا تخترق طبقةٌ ثانية أرضيةً ضبطتها هذه (D-16). service_role وحده.';

-- ----------------------------------------------------------------------------
-- (٣) الصلاحيات — السحب من الثلاثة ثم المنح الصريح
--
-- 🔒 التذكير الذي كلّف المشروع ثغرة من قبل: الدالة الجديدة تولد ومعها `EXECUTE`
-- ضمني لـ PUBLIC ومنح افتراضي لـ `anon`/`authenticated`، و`create or replace`
-- لا يعيد ضبط الصلاحيات. سحب PUBLIC وحده لا يكفي.
--
-- وإعادة التأكيد على `apply_discount` مقصودة: `create or replace` أعلاه لم
-- تُغيّر صلاحياتها، لكن تكرار السطر أرخص من ثغرة.
-- ----------------------------------------------------------------------------
revoke all on function public.discount_floor_room(numeric, text, numeric)
  from public, anon, authenticated;
revoke all on function public.apply_discount(text, numeric, text, numeric, text)
  from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.discount_floor_room(numeric, text, numeric) to service_role';
    execute 'grant execute on function public.apply_discount(text, numeric, text, numeric, text) to service_role';
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- (٤) فحص ذاتي بعد التنفيذ
--
-- ما لا يفحصه هذا البلوك: **تطابق الأرقام قبل الهجرة وبعدها** — ذلك قِيس خارج
-- القاعدة على ٣٤٨ حالة، ولا يمكن لهجرةٍ أن تقيسه على نفسها بعد أن طبّقت.
--
-- وما يفحصه هو ما لا يمسكه ذلك القياس أصلاً:
--   (أ) الكتالوج: التوقيع · definer بـ search_path فارغ · **لا منح لأي دور مستخدم**
--   (ب) البنية: التفويض **حيّ** — الجسم القديم اختفى من `apply_discount` ولم
--       يبقَ نسخةً ثانية بجوار النداء
--   (ج) القيمة: `total_after` لا ينزل تحت `min_total` أبداً، و**حين يُقلَّص
--       الخصم لا تبقى مساحةُ جنيهٍ واحد** — وهو §١ منطوقاً بالأرقام
--   (د) حقن العطب: تُخرَّب `discount_floor_room` عمداً، ويجب أن **يتغيّر** ناتج
--       `apply_discount` — وإلا فالتفويض زينة والفحوص فوقه بلا معنى
-- ----------------------------------------------------------------------------
do $$
declare
  v_oid        oid;
  v_def        text;
  v_secdef     boolean;
  v_cfgset     text[];
  v_vol        "char";
  v_anon       boolean;
  v_auth       boolean;
  v_min        numeric;
  v_room       numeric;
  v_after      numeric;
  v_amount     numeric;
  v_applied    boolean;
  v_clamped    boolean;
  v_amount_2   numeric;
  v_reject     text;
  v_class      text := '__floor_probe_class_0046__';  -- لا وجود لها ⇒ min_price = null
  v_slack      numeric;
  v_n          integer;
  v_case       record;
begin
  -- ── (أ) الكتالوج ─────────────────────────────────────────────────────────
  -- التوقيع يُحلّ بالأنواع لا بنصّ الوسائط: `pg_get_function_identity_arguments`
  -- تُرجع الأسماء معها، فمطابقتها نصّاً تكسر بإعادة تسميةٍ لا أثر لها على أي
  -- مستدعٍ. و`to_regprocedure` تُرجع null بلا رفع حين لا وجود للدالة.
  v_oid := to_regprocedure('public.discount_floor_room(numeric, text, numeric)');
  if v_oid is null then
    raise exception '0046: discount_floor_room(numeric, text, numeric) غير موجودة — أي مستدعٍ كُتب على توقيعٍ آخر';
  end if;

  select p.prosecdef, p.proconfig, p.provolatile
    into v_secdef, v_cfgset, v_vol
  from pg_proc p where p.oid = v_oid;

  if not v_secdef then
    raise exception '0046: discount_floor_room ليست security definer — فلن تقرأ إعدادات الخصم من دورٍ لا يملكها';
  end if;
  -- ⚠ القيمة المخزَّنة `search_path=""` لا `search_path=`: مقارنةُ الشكل الخطأ
  --   تجعل هذا التوكيد يفشل دائماً أو يمرّ دائماً بحسب اتجاهه — قيس لا تخمّن.
  if not ('search_path=""' = any (coalesce(v_cfgset, array[]::text[]))) then
    raise exception '0046: discount_floor_room بلا search_path فارغ (القيمة: %) — دالة definer بمسار بحثٍ موروث تُخطَف بجدولٍ مزروع',
      coalesce(array_to_string(v_cfgset, '، '), '(بلا)');
  end if;
  if v_vol <> 's' then
    raise exception '0046: تقلّبية discount_floor_room «%» لا stable — و`apply_discount` نفسها stable فلا يجوز أن تنادي أضعف منها', v_vol;
  end if;

  -- 🔒 والمنح: المتعهد يتحكم في p_partner_cost، فنداءان يكشفان سياسة الهامش.
  -- والدور قد لا يوجد أصلاً على قاعدةٍ خارج Supabase — فغيابه ليس منحاً.
  v_anon := coalesce((select has_function_privilege(r.oid, v_oid, 'execute')
                        from pg_roles r where r.rolname = 'anon'), false);
  v_auth := coalesce((select has_function_privilege(r.oid, v_oid, 'execute')
                        from pg_roles r where r.rolname = 'authenticated'), false);
  if v_anon or v_auth then
    raise exception '0046: 🔴 discount_floor_room ممنوحة لدور مستخدم (anon=% · authenticated=%) — الأرضية تُقرأ عاريةً بنداءين، وهو الاستنتاج العكسي الذي أغلقته 0011',
      v_anon, v_auth;
  end if;

  -- ── (ب) البنية: التفويض حيّ، والجسم القديم لم يبقَ نسخةً ثانية ────────────
  v_oid := to_regprocedure('public.apply_discount(text, numeric, text, numeric, text)');
  if v_oid is null then
    raise exception '0046: apply_discount(text, numeric, text, numeric, text) غير موجودة بعد إعادة كتابتها';
  end if;
  v_def := pg_get_functiondef(v_oid);

  -- ⚠ **مِجسُّ المِجسّ، وقد أمسك عيباً حقيقياً في هذا الملف**: أول صياغةٍ لهذا
  --   البند بحثت عن الدالة بـ`pg_get_function_identity_arguments(...) = 'text,
  --   numeric, …'` — وهي تُرجع **أسماء الوسائط معها** («p_code text, …»)، فلم
  --   يطابق الشرط شيئاً و`v_def` صار null. و`position(x in null)` تساوي null،
  --   و`null = 0` قيمتها unknown ⇒ **البندان أدناه لا يرفعان أبداً**. أمسكه حقنُ
  --   العطب لا القراءة، وهو النمط ٩ حرفياً: فحصٌ لا يمكن أن يفشل.
  if v_def is null or length(v_def) < 200 then
    raise exception '0046: جسم apply_discount لم يُقرأ (الطول: %) — البندان التاليان كانا سيمرّان فوق فراغ',
      coalesce(length(v_def)::text, '(null)');
  end if;

  if position('public.discount_floor_room(' in v_def) = 0 then
    raise exception '0046: apply_discount لا تنادي discount_floor_room — الاستخراج وقع والتفويض لم يقع';
  end if;
  -- 🔒 وهذا هو الحارس الحقيقي: لو بقيت المعادلة **أيضاً** في apply_discount
  --    لعملت الدالتان معاً بأرقامٍ متطابقة اليوم ومنحرفةٍ بعد أول تعديل — وهو
  --    النمط ٨ في LESSONS («مصدران لرقم واحد») حرفياً. ولا يمسكه أي قياسٍ
  --    للناتج، لأن الناتج اليوم صحيح.
  if position('public.discount_implied_cost(' in v_def) > 0
     or position('public.dispatch_config(' in v_def) > 0
     or position('t.min_price' in v_def) > 0 then
    raise exception '0046: 🔴 معادلة الأرضية ما زالت داخل apply_discount بجوار النداء — مصدران لرقمٍ واحد، وهما يتطابقان اليوم وينحرفان غداً';
  end if;

  -- ── (ج) و(د) داخل معاملةٍ فرعية تُرجَع: إعداداتٌ وكوبونٌ ودالةٌ مخرَّبة ────
  begin
    -- إعدادات معلومة بدل إعدادات القاعدة الحيّة: الفحص يملك بياناته
    update public.discount_settings
       set enabled = true,
           max_percent = 25,
           min_margin_percent_after_discount = 10,
           min_margin_amount_after_discount = 50;

    insert into public.coupons (code, kind, value, max_amount, min_trip_total,
                                class_slugs, starts_at, ends_at,
                                max_uses, max_uses_per_phone, enabled)
    values ('ZZFLOOR0046', 'percent', 90, null, null, '{}', null, null, null, null, true);

    -- ── (ج-١) الميزانية تُقرأ، ومِجسُّ المِجسّ: رقمان لا فراغ ────────────────
    select f.min_total, f.room into v_min, v_room
      from public.discount_floor_room(1200, v_class, 1000) f;
    if v_min is null or v_room is null then
      raise exception '0046: discount_floor_room أعادت فراغاً — إما صفر صفوف أو عمودٌ باسمٍ آخر';
    end if;
    if v_min < 1000 then
      raise exception '0046: min_total «%» دون تكلفة المتعهد ١٠٠٠ — أرضيةٌ تسمح بالبيع بخسارة (D-16)', v_min;
    end if;

    -- ── (ج-٢) الأرضية تُفرض على كل حالة: total_after ≥ min_total دائماً ─────
    v_n := 0;
    for v_case in
      select * from (values
        (330,     'sedan',   230),
        (2160,    'sedan',   1800),
        (4860,    'sedan',   4050),
        (2676,    'minibus', 2230),
        (1151,    v_class,   1000),   -- مساحة جنيهٍ واحد بالضبط
        (1200,    v_class,   1000),   -- الكوبون أكبر من المساحة ⇒ تقليص
        (100000,  v_class,   1000),   -- مساحة واسعة ⇒ سقف النظام هو المُلزِم
        (2000,    null,      null),   -- فئة null وتكلفةٌ ضمنية
        (2000,    'NOPE',    1000)    -- فئة لا وجود لها
      ) as t(total, cls, cost)
    loop
      select a.applied, a.amount, a.total_after, a.clamped, a.rejection
        into v_applied, v_amount, v_after, v_clamped, v_reject
        from public.apply_discount('ZZFLOOR0046', v_case.total, v_case.cls, v_case.cost, null) a;

      select f.min_total, f.room into v_min, v_room
        from public.discount_floor_room(v_case.total, v_case.cls, v_case.cost) f;

      if v_applied then
        v_n := v_n + 1;
        -- 🔒 القياس الأول: الأرضية لم تُخترق
        if v_after < v_min then
          raise exception '0046: 🔴 total_after «%» تحت min_total «%» عند (إجمالي=% فئة=% تكلفة=%) — نقضُ D-16',
            v_after, v_min, v_case.total, coalesce(v_case.cls, '(null)'), coalesce(v_case.cost::text, '(null)');
        end if;
        -- الخصم لا يتجاوز الميزانية
        if v_amount > v_room then
          raise exception '0046: الخصم «%» أكبر من المساحة «%» عند إجمالي % — الميزانية ليست ملزِمة',
            v_amount, v_room, v_case.total;
        end if;
        -- 🔒 القياس الثاني — وهو §١ منطوقاً: حين يُقلَّص الخصم إلى الميزانية لا
        --    تبقى مساحةُ جنيهٍ واحد. فأي طبقةٍ ثانية تطرح من `total_after` تخترق
        --    الأرضية حتماً — لا احتمالاً — وهي تُرجع applied=true بقيمةٍ سليمة.
        if v_clamped and v_amount = v_room then
          v_slack := v_after - v_min;
          if v_slack >= 1 then
            raise exception '0046: بعد التقليص بقيت مساحة «%» جنيه عند إجمالي % — إما الميزانية ليست المساحة كلها أو التقريب انحرف',
              v_slack, v_case.total;
          end if;
        end if;
      else
        -- الرفض بأرضية يجب أن يوافق ميزانيةً غير موجبة — لا رفضاً بلا سبب
        if v_reject = 'floor-guard' and v_room > 0 then
          raise exception '0046: رُفض بـfloor-guard والمساحة «%» موجبة عند إجمالي % — رفضٌ يخالف الميزانية التي يدّعي حراستها',
            v_room, v_case.total;
        end if;
      end if;
    end loop;

    if v_n < 5 then
      raise exception '0046: لم يُطبَّق الخصم إلا في % حالة من تسع — الحالات تُرفض قبل بلوغ الأرضية فالفحص فوق مسارٍ ميت', v_n;
    end if;

    -- ── (د) 🔒 حقن العطب: بلا هذا البند كل ما سبق قد يكون زينة ───────────────
    -- الفحوص أعلاه تقرأ الأرضية من `discount_floor_room` وتقارنها بناتج
    -- `apply_discount`. ولو كانت `apply_discount` تحمل نسخةً خاصة بها لمرّت
    -- **كلها** ما دامت النسختان متطابقتين اليوم. فالسؤال الوحيد الذي يفصل:
    -- **لو كذبت هذه الدالة، هل يتغيّر ناتج تلك؟**
    select a.amount into v_amount
      from public.apply_discount('ZZFLOOR0046', 1200, v_class, 1000, null) a;

    create or replace function public.discount_floor_room(
      p_total numeric, p_class_slug text, p_partner_cost numeric
    ) returns table (min_total numeric, room numeric)
    language plpgsql stable security definer set search_path = '' as $sab$
    begin
      -- نسخة مخرَّبة عمداً، عمرها أسطرٌ داخل معاملةٍ فرعية تُرجَع
      min_total := 0; room := 1;
      return next;
    end;
    $sab$;

    select a.amount into v_amount_2
      from public.apply_discount('ZZFLOOR0046', 1200, v_class, 1000, null) a;

    if v_amount_2 is not distinct from v_amount then
      raise exception '0046: 🔴 تخريب discount_floor_room لم يغيّر ناتج apply_discount (% في الحالتين) — التفويض غير حيّ، وفحوص (ج) كلها كانت تقرأ دالةً لا يستعملها أحد',
        v_amount;
    end if;
    if v_amount_2 <> 1 then
      raise exception '0046: النسخة المخرَّبة أعطت مساحة ١ والخصم «%» — التفويض جزئي: apply_discount ما زالت تحدّ بحسابٍ خاص بها', v_amount_2;
    end if;

    -- كل ما سبق — الإعدادات والكوبون والدالة المخرَّبة — يختفي هنا معاً
    raise exception '0046_PROBE_ROLLBACK';
  exception
    when others then
      if sqlerrm <> '0046_PROBE_ROLLBACK' then raise; end if;
  end;

  raise notice '✔ 0046: discount_floor_room مستخرجة ومفوَّض إليها حيّاً (تخريبها يغيّر ناتج apply_discount)، والأرضية مقيسةٌ على تسع حالات فلا total_after تحتها، وبعد التقليص لا تبقى مساحةُ جنيه — فطبقةٌ ثانية على total_after تخترق حتماً (loyalty-types §١)، ولا منح لأي دور مستخدم';
end;
$$;
