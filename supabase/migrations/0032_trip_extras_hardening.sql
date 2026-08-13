-- ============================================================================
-- 0032 — تصليب جراحة التسعير بعد المراجعتين النقديتين
--
-- الهجرة 0031 مطبَّقة ولا تُعدَّل (D-03). أمسكت المراجعتان خمسة، وأولها **انحدار
-- حرج**: عيبٌ أُصلح في 0014 عاد حياً لأن جسم الدالة نُسخ من النسخة الخطأ.
--
-- ── (١) حرج: `dispatch_ceiling` عادت إلى جسم 0013 فأُلغي إصلاح 0014 ─────────
--
-- كانت 0031 محقّة في أن السقف يجب أن يطرح الخدمات (‏`total` صار يحملها، فكرسيا
-- أطفال بـ٤٠٠ يشتريان للمتعهد ٤٠٠ من مساحة السقف مقابل خدمة لا ينفّذها). لكنها
-- بنت التصحيح فوق **جسم 0013**، وهو الجسم الذي استبدلته 0014 لأنه كان العيب
-- الحرج رقم (١) في تلك الهجرة: مسار التعريفة كان يعتبر **سعر العميل كله** سقفاً
-- للموجة الأولى، أي **تنازلاً تلقائياً عن كل الهامش** بلا علم أحد.
--
-- الأثر المقيس: حجزٌ بالتعريفة بـ٢٬٧٢٠ سقفُ موجته الأولى كان **٢٬٢٦٦٫٦٧** فصار
-- **٢٬٧٢٠**. ومعه سقط القصّان الختاميان، فلم يعد الثابت «السقف دون الإجمالي
-- بأرضية الهامش على الأقل» مفروضاً في أي مسار.
--
-- ولم يمسكه شيء: الفحص الذاتي في 0031 يبحث عن وجود `v_extras` فقط، واختبارات
-- الإسناد لا تغطي إلا مسار المتعهد. ولذلك يضيف هذا الملف شاهداً على بقاء اشتقاق
-- 0014 نفسه (‏`margin_type`) لا على وجود الخدمات وحدها.
--
-- ── (٢) عالٍ: أسطول بلا حقائب — كل فئة بسعة حقيبتين ⇒ صفر عروض لثلاث حقائب ───
--
-- `luggage_capacity` وُلد بقيمة افتراضية ٢ لكل الفئات، وشرط الأهلية
-- `luggage_capacity >= p_luggage`. فأيّ عميل يكتب ٣ حقائب يرى «لا فئات متاحة» —
-- والباص بخمسين مقعداً يُعلن عاجزاً عن حقيبة ثالثة. الافتراضي «٢ لا صفر» كان
-- قصده ألا يفرغ الموقع، وأفرغه لكل من يحمل أكثر من حقيبتين.
--
-- والعلاج ملء رجعي بالسعة نفسها (‏`greatest(luggage_capacity, capacity)`) للصفوف
-- التي ما زالت على الافتراضي: قيمةٌ معقولة تشغيلياً حتى يعايرها المالك، ولا تمسّ
-- صفاً عدّله بيده.
--
-- ── (٣) متوسط: تاريخ عودة على رحلة ذهاب فقط = ساقُ عودة مجانية ───────────────
--
-- `derive_waiting_hours` تُرجع صفراً حين تكون العودة في يوم آخر، ومبررها المكتوب
-- أن «معامل الذهاب والعودة وحده هو ما يسعّرها». فإن كان `round_trip = false`
-- فلا معامل ولا انتظار — والعودة مخزَّنة في اللقطة تُعرض للعميل وللتشغيل
-- فيُنفَّذ ما لم يُحصَّل ثمنه. الواجهة لا تنتجه، لكن `/api/booking` يقبله.
--
-- ── (٤) متوسط: غلافا `quote_price` ميتان — والباب الخلفي لم يكن مفتوحاً أصلاً ─
--
-- تصحيح لما كُتب في 0031 §٩ (وقاله المعمار للمالك): الغلاف الرباعي **ليس** باباً
-- خلفياً. أثبتت المراجعة حياً أن `set local role anon; select quote_price(…)`
-- يفشل بـ«permission denied» — لأن الغلاف `security invoker` وينادي الدالة
-- التاسعة `security definer` المسحوبة من `anon` منذ 0011. فبتّ الصلاحية على
-- الغلاف صحيح والنداء يموت في الإطار التالي.
--
-- ومع ذلك: غلافٌ ممنوحٌ لدور لا يستطيع استعماله **مضلِّل** — و`coverage_tests`
-- كان يؤكد وجود المنحة (لا نجاح النداء) فحرس وهماً. تُسحب المنحتان هنا، ويُعاد
-- كتابة ذلك الفحص ليُنفِّذ لا ليقرأ بتّاً.
--
-- المرجع: مراجعتا 2026-08-14 · 0014 §(١) · lib/extras-types.ts · LESSONS النمط ٩
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (١) `dispatch_ceiling` — اشتقاق 0014 كاملاً، والخدمات مطروحة في موضع واحد
--
-- الفرق الوحيد عن 0014: `v_total` بدل `v_b.total` في كل موضع، وهو الإجمالي
-- **بعد طرح الخدمات المجمَّدة**. وبلا خدمات يساوي الإجمالي حرفياً، فلا يتحرك
-- سقف أي حجز قائم.
-- ----------------------------------------------------------------------------
create or replace function public.dispatch_ceiling(p_booking_id uuid, p_round integer)
returns numeric
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_b      record;
  v_cfg    record;
  v_m      record;
  v_extras numeric;
  v_total  numeric;
  v_base   numeric;
  v_widen  numeric;
begin
  select b.total, b.price_source, b.subcontractor_cost, b.margin_amount
    into v_b
  from public.bookings b
  where b.id = p_booking_id;

  if not found then
    return null;
  end if;

  select * into v_cfg from public.dispatch_config();

  -- 0031/0032: الخدمات الإضافية إيرادُنا عن شيء ننفّذه نحن ولا يراه المتعهد،
  -- فلا تدخل أي مقارنة تخصّه. تُطرح مرة واحدة هنا ويُشتق كل ما بعدها منها.
  select coalesce(sum(be.line_total), 0)
    into v_extras
  from public.booking_extras be
  where be.booking_id = p_booking_id;

  v_total := greatest(coalesce(v_b.total, 0) - coalesce(v_extras, 0), 0);

  if v_b.subcontractor_cost is not null and coalesce(v_b.price_source, '') = 'subcontractor' then
    -- مرجع تكلفة حقيقي من قائمة أسعار: السقف هو التكلفة، ويتسع بالهامش لاحقاً
    v_base  := v_b.subcontractor_cost;
    v_widen := greatest(coalesce(v_b.margin_amount, 0) - v_cfg.min_margin_amount, 0);
  else
    -- بلا مرجع تكلفة (تسعير بالتعريفة): نشتق التكلفة الضمنية من سياسة الهامش
    -- نفسها — الهامش موجود داخل السعر أصلاً، فطرحه يعطي حداً معقولاً للتكلفة.
    -- ⚠ الخطأ الذي كان في 0013 وعاد سهواً في 0031: اعتبار السعر كله سقفاً،
    -- فيصير الهامش صفراً في الموجة ١ — تنازلٌ تلقائي عن كل الهامش.
    select ps.margin_type, ps.margin_value, ps.margin_min_amount
      into v_m
    from public.pricing_settings ps
    where ps.id;

    if v_m.margin_type = 'fixed' then
      v_base := v_total - greatest(coalesce(v_m.margin_value, 0),
                                   coalesce(v_m.margin_min_amount, 0));
    else
      v_base := v_total / (1 + coalesce(v_m.margin_value, 20) / 100);
      -- أرضية الهامش تعلو على النسبة حين تكون أكبر
      v_base := least(v_base, v_total - coalesce(v_m.margin_min_amount, 0));
    end if;

    v_base  := greatest(v_base, 0);
    v_widen := greatest(v_total - v_cfg.min_margin_amount - v_base, 0);
  end if;

  -- ثابت لا يُخرق: السقف يبقى دون الإجمالي بمقدار أرضية الهامش على الأقل
  v_base  := least(v_base, greatest(v_total - v_cfg.min_margin_amount, 0));
  v_widen := least(v_widen, greatest(v_total - v_cfg.min_margin_amount - v_base, 0));

  return round(v_base + case when coalesce(p_round, 1) <= 1 then 0 else v_widen end, 2);
end;
$$;

revoke all on function public.dispatch_ceiling(uuid, integer) from public, anon, authenticated;

comment on function public.dispatch_ceiling(uuid, integer) is
  'سقف تكلفة موجة البث. اشتقاق 0014 (التكلفة الضمنية من سياسة الهامش) مع طرح الخدمات الإضافية أولاً — فهي إيرادنا عن شيء ننفّذه نحن ولا يراه المتعهد. بلا خدمات النتيجة مطابقة لـ 0014 حرفياً.';

-- ----------------------------------------------------------------------------
-- (٢) ملء رجعي لسعة الحقائب — بالسعة نفسها، وللصفوف التي ما زالت على الافتراضي
-- ----------------------------------------------------------------------------
update public.vehicle_classes
   set luggage_capacity = greatest(luggage_capacity, capacity)
 where luggage_capacity = 2;

comment on column public.vehicle_classes.luggage_capacity is
  'أقصى عدد حقائب تستوعبه الفئة — شرط أهلية ثانٍ بجوار السعة داخل quote_price. 0032: مُلئ رجعياً بالسعة نفسها لأن الافتراضي (٢) كان يُخرج صفر عروض لأي عميل بثلاث حقائب. يعايره المالك من /admin/fleet.';

-- ----------------------------------------------------------------------------
-- (٣) تاريخ العودة يستلزم رحلة ذهاب وعودة
--
-- ⚠ لا تُعاد كتابة `create_booking` كلها هنا (١٩ وسيطاً وجسمٌ طويل، وإعادة نسخه
-- هي بعينها الطريقة التي وُلد بها العيب الحرج أعلاه). الشرط يُفرض **بمُشغّل على
-- الجدول** — وهو أقوى أصلاً: يغطي محرر SQL وأي كاتب مستقبلي، وهو نفس النمط الذي
-- عالجت به 0014 قاعدة «لا يفوز متعهد غير معتمد» و0027 سقف الدين.
-- ----------------------------------------------------------------------------
create or replace function public.bookings_guard_return_leg()
returns trigger
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_return text;
begin
  v_return := nullif(btrim(coalesce(new.trip ->> 'returnAt', '')), '');

  if v_return is not null
     and not coalesce((new.trip ->> 'roundTrip') in ('true', 't', '1'), false) then
    raise exception 'تاريخ العودة يستلزم رحلة ذهاب وعودة — الرحلة المسجَّلة ذهاب فقط'
      using hint = 'invalid-input';
  end if;

  return new;
end;
$$;

drop trigger if exists bookings_guard_return_leg on public.bookings;
create trigger bookings_guard_return_leg
  before insert or update of trip on public.bookings
  for each row execute function public.bookings_guard_return_leg();

revoke all on function public.bookings_guard_return_leg() from public, anon, authenticated;

comment on function public.bookings_guard_return_leg() is
  'عودةٌ بلا معامل ذهاب وعودة لا يسعّرها شيء: derive_waiting_hours تُصفّر الانتظار حين تكون العودة في يوم آخر لأن المعامل هو ما يسعّرها. فحجزٌ ذهاب فقط بتاريخ عودة مخزَّن يُنفَّذ ولا يُحصَّل ثمنه. الحارس في الجدول لا في الدالة كي يغطي كل كاتب.';

-- ----------------------------------------------------------------------------
-- (٤) سحب المنحتين عن غلافَي التسعير الميتين
--
-- تصحيح معلن: لم يكونا باباً خلفياً قط — `security invoker` ينادي دالةً
-- `security definer` مسحوبة من `anon` منذ 0011، فالنداء يفشل بـ«permission
-- denied» رغم بتّ المنحة. والمنحة المضلِّلة تُسحب كي لا يُبنى عليها حكم ثانٍ.
-- ولا مستدعي لهما في المستودع: `/api/quote` يسقط على التاسعة بمفتاح الخدمة.
-- ----------------------------------------------------------------------------
revoke all on function public.quote_price(numeric, integer, boolean, numeric)
  from public, anon, authenticated;
revoke all on function public.quote_price(numeric, integer, boolean, numeric, integer)
  from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- (٥) فحص ذاتي
-- ----------------------------------------------------------------------------
do $$
declare
  v_src text;
  v_n   integer;
begin
  -- (أ) 🔒 اشتقاق 0014 حيّ — لا وجود الخدمات وحده (وهو ما فات فحص 0031)
  v_src := pg_get_functiondef(to_regprocedure('public.dispatch_ceiling(uuid,integer)')::oid);
  if position('booking_extras' in coalesce(v_src, '')) = 0 then
    raise exception '0032: مسبار مصدر dispatch_ceiling معطّل — لا تصدّق ما بعده';
  end if;
  if position('margin_type' in v_src) = 0 then
    raise exception
      '0032: dispatch_ceiling بلا اشتقاق التكلفة الضمنية من سياسة الهامش — عاد عيب 0013 الحرج: سعر العميل كله سقفاً للموجة الأولى';
  end if;

  -- (ب) الأسطول يستطيع حمل حقائب فعلاً
  select count(*) into v_n
  from public.vehicle_classes vc
  where vc.active and vc.luggage_capacity >= 3;

  if v_n = 0 then
    raise exception '0032: لا فئة نشطة تقبل ثلاث حقائب — كل عرض سعر بثلاث حقائب سيعود فارغاً';
  end if;

  -- (ج) حارس ساق العودة مركَّب فعلاً (دالةٌ بلا مُشغّل ليست حارساً)
  if not exists (
    select 1 from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'bookings'
      and t.tgname = 'bookings_guard_return_leg' and not t.tgisinternal
  ) then
    raise exception '0032: حارس ساق العودة غير مركَّب على bookings';
  end if;

  -- (د) الغلافان لم يعودا ممنوحَين (والشاهد الإيجابي: الزائر ما زال ينفّذ العام)
  if exists (select 1 from pg_roles where rolname = 'anon') then
    if not has_function_privilege(
         'anon',
         'public.quote_public(numeric, integer, boolean, numeric, numeric, numeric, numeric, numeric, text, integer, jsonb)',
         'execute') then
      raise exception '0032: مسبار الصلاحيات مقلوب — الزائر يُفترض أن ينفّذ quote_public';
    end if;

    if has_function_privilege('anon', 'public.quote_price(numeric, integer, boolean, numeric)', 'execute')
       or has_function_privilege('anon', 'public.quote_price(numeric, integer, boolean, numeric, integer)', 'execute') then
      raise exception '0032: غلافا التسعير ما زالا ممنوحَين للزائر — منحةٌ مضلِّلة تُبنى عليها أحكام خاطئة';
    end if;
  end if;

  raise notice '✔ 0032: اشتقاق 0014 مُعاد إلى سقف الموجة · الأسطول يحمل حقائب · ساق العودة محروسة في الجدول · غلافا التسعير مسحوبان';
end;
$$;
