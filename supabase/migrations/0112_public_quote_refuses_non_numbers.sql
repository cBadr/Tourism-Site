-- ============================================================================
-- 0112_public_quote_refuses_non_numbers.sql
-- 🔴 زائرٌ بلا حساب يقرأ سعراً ليس رقماً — والحاجز يُوضع في **جذر التسعير**
--    لا في بابه، لأن الجذر هو ما يمرّ به كل مسار.
--
-- ── العيب، مقيساً بدور anon الحقيقي داخل معاملةٍ مُرجَعة (2026-08-18، 04:3xZ) ──
--
--   quote_public(10, 4, false, 'NaN', <إحداثيات المطار>)
--     ⇒ total = "NaN" · waiting_cost = "NaN"   — للفئتين معاً
--   quote_public(10, 4, false, 'Infinity', …)  ⇒ total = "Infinity"
--   quote_public('NaN', 4, false, 0, null,null,null,null)   ⇒ total = "NaN"
--   quote_public(1e1000, 4, false, 0, null,null,null,null)  ⇒ إجمالي بـ٢٠٧ خانة
--   quote_public(10, 4, false, 1e1000, …)      ⇒ إجمالي بـ١٠٠١ خانة
--
-- 🔴 **والمسح وسّع العيب عمّا ورد في البلاغ**: البلاغ ذكر `p_waiting_hours`
--    وحدها. والقياس قال إن `p_distance_km` تسرّب `NaN` كذلك — **لكن على مسار
--    التعريفة فقط** (بلا تغطية متعهد)، لأن `distance_cost` يصير صفراً حين تفوز
--    قائمة أسعارٍ معتمدة. أي أن مسارَي المطار والإسكندرية أخفيا العيب، **وكلُّ
--    نقطةٍ في مصر خارج القائمتين تكشفه**. وهذا وحده يفسّر لماذا لا يكفي أن
--    نختبر على المسار المغطّى.
--
-- ── لماذا لم تمسكه 0108 ─────────────────────────────────────────────────────
--
-- 0108 اختارت القيد على **العمود** لا الحارس في الدالة، وكانت مصيبةً: ٦٣ عموداً
-- `numeric` و٦٣ `finite_chk` أغلقت كل كاتب. **لكن `quote_price` لا تكتب شيئاً**
-- — تحسب وتُرجع — فلا تلقى عموداً قط. وكل بابٍ أغلقته 0108 كان خلف تسجيل دخول
-- (مشرفٍ للتحويل، متعهدٍ لقوائم الأسعار)، **وهذا الباب وحده يُفتح من الشارع**.
--
-- ── أين وُضع الحاجز ولماذا هناك بالذات ─────────────────────────────────────
--
-- في `quote_price(٩ وسائط)` — **جذرُ التسعير الوحيد**. والتوقيعان الآخران
-- (الرباعي والخماسي) يفوّضان إليه، وكذلك `quote_public` و`create_booking`
-- و`convert_quote_request` و`admin_quote_preview`. ⇒ سطرٌ واحد يغلق ستّة أبواب،
-- **وهو نقيض إعادة كتابة ستة أجسام** (الطريق الذي وُلد منه انحدار D-58).
--
-- ولم يوضع في `quote_public` وحدها: ذلك يغلق الشارع ويترك الجذر يكذب على كل
-- مستدعٍ آخر — وشاشةُ المشرف تعرض `NaN` قبل أن يمسك القيدُ الكتابة.
--
-- ── و`as materialized`: تثبيتٌ لا إصلاح — والفرق قِيس ولم يُفترض ────────────
--
-- الخوف كان مشروعاً: `distance_cost` يصير `0` حين يفوز مسار المتعهد (الفرع
-- `else 0::numeric`)، فلو أُدمج الـCTE في مستهلكيه لَما قُيِّم تعبير
-- `distance_km` أصلاً على ذلك المسار — أي حارسٌ يعمل على مسارٍ ويصمت على آخر
-- بحسب خطة المخطِّط.
--
-- **وقِيس الأمران**: بُني جسمٌ بالحارس **بلا** `materialized` وشُغّل على المسار
-- المغطّى ⇒ **رَفَض كذلك**. فالكلمة **لا تصلح عيباً قائماً**، وسببُ عمله بدونها
-- معروف: `base` مُشار إليه **ثلاث مرات** (‏`eligible` و`covered` و`joined`)،
-- وPostgres لا يُدمج CTE ذا أكثر من مرجع. ⇒ الكلمة **تُثبّت** ما يصحّ اليوم
-- بالصدفة البنيوية، فلا ينهار الحارس صامتاً يوم يحذف محرِّرٌ أحد المراجع
-- الثلاثة. وكلفتها صفر: صفٌّ واحد يُحسب مرةً واحدة.
--
-- ── ولماذا الرفض لا التصفير ولا القصّ ──────────────────────────────────────
--
-- السعر شيءٌ يراه العميل ويبني عليه قراره. `NaN ⇒ 0` يعطيه رحلةً مجانية على
-- الشاشة ثم يرفضها الحجز، و`NaN ⇒ أدنى سعر` يعطيه رقماً لا يخصّ رحلته. **رسالةٌ
-- عربية يفهمها خيرٌ من صفرٍ صامت** — وهي المبدأ نفسه الذي جعل 0108 تُبقي
-- `hint = cost-not-finite` في الجسم رغم وجود القيد على العمود.
--
-- ── والحدّان ليسا قاعدة عمل، بل سياجُ سلامة ────────────────────────────────
--
--   * المسافة وساعات الانتظار: ‏±١٠٠٬٠٠٠. ووظيفتُه الوحيدة أن يبقى الناتج رقماً
--     يسع `double` فلا يحوّله `JSON.parse` في المتصفح إلى `Infinity`. وهو أعلى
--     من كل حدٍّ قائم في المشروع: `create_booking` ترفض مسافةً فوق ٥٠٠٠،
--     و`/api/quote` و`/api/booking` يرفضان انتظاراً فوق ٢٤ ساعة. ⇒ **لا نداءَ
--     مشروعٍ واحد يقترب من السياج**.
--   * الإحداثيات: ‏±١٨٠ — حدٌّ جغرافيٌّ حقيقي لا رقم مخترع، وأوسع من حدود مصر
--     (٢٠–٣٤ · ٢٣–٣٨) التي تفرضها `create_quote_request` سلفاً.
--
-- ⚠ **والسالب العاديّ يبقى كما كان**: `quote_price(-10, 2, true, -5)` تُقصّ إلى
--   صفر ولا تُرفض — و`quote_tests (د-٢)` تؤكّده منذ المرحلة ٣. الحاجز يرفض
--   `NaN` و`±Infinity` وما تجاوز السياج، **ولا يلمس القصّ**.
--
-- ── ما قِيس قبل التنفيذ ─────────────────────────────────────────────────────
--
--   * قائمتا الأسعار المعتمدتان تسعّران قبل الهجرة: ٧٢٠/١٥٠٠ (المطار) ·
--     ١٨٠٠/٢٦٤٠ (الإسكندرية ذهاب) · ٣٢٥٠/٤٩٥٢ (ذهاب وعودة + ساعتا انتظار).
--     **وهي بعينها المطلوب بقاؤها بعد الهجرة** — تُقارَن الأرقام لا عدد الصفوف.
--   * كل دوال `anon` مُسحت بـ`NaN`/`Infinity`/`-Infinity`/`1e1000`/`-0`/فراغ/
--     أرقامٍ هندية. والوحيدة التي تُخرج قيمةً غير منتهية هي هذه.
--
-- ── ما لا تفعله هذه الهجرة ─────────────────────────────────────────────────
--   لا تمسّ تعريفةً ولا هامشاً ولا أرضيةَ هامش ولا قائمةَ أسعار ولا صفَّ مالك.
--   ولا تغيّر توقيعاً ولا عمود إخراجٍ واحداً، فالعقد `lib/pricing-types.ts` كما هو.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (١) الحارس — معنى واحد في مكانٍ واحد، ورسالتان تفرّقان بين الحالتين
-- ----------------------------------------------------------------------------
--
-- `strict` مقصودة: `null` تمرّ بلا نداءٍ أصلاً — وغيابُ الإحداثيات حالةٌ مشروعة
-- تعني «سعّر بالتعريفة» لا خطأً. و`immutable` تسمح للمخطِّط بطيّها مبكراً.
--
-- والصياغة من 0108 حرفياً: `v > '-Infinity' and v < 'Infinity'` هي الوحيدة التي
-- ترفض `NaN` و`±Infinity` معاً — لأن `NaN > 0` صادقة و`NaN < Infinity` كاذبة.
create or replace function public.quote_arg_finite(
  p_value numeric,
  p_label text,
  p_max   numeric
) returns numeric
language plpgsql
immutable strict parallel safe
set search_path to ''
as $guard$
begin
  if not (p_value > '-Infinity'::numeric and p_value < 'Infinity'::numeric) then
    raise exception '«%» ليست رقماً صالحاً', p_label
      using hint = 'invalid-input';
  end if;

  if p_value > p_max or p_value < -p_max then
    raise exception '«%» خارج المدى المقبول (‏±%)', p_label, p_max
      using hint = 'invalid-input';
  end if;

  return p_value;
end;
$guard$;

comment on function public.quote_arg_finite(numeric, text, numeric) is
  '0112 — يرفض NaN و±Infinity وما تجاوز السياج على مدخلات التسعير، برسالة عربية وhint=invalid-input. يُنادى من جذر quote_price وحده.';

-- ----------------------------------------------------------------------------
-- (٢) جذر التسعير — الجسم كما هو حرفياً، ولا يتغيّر فيه غير كتلة `base`
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.quote_price(p_distance_km numeric, p_passengers integer, p_round_trip boolean, p_waiting_hours numeric, p_origin_lat numeric, p_origin_lng numeric, p_dest_lat numeric, p_dest_lng numeric, p_luggage integer DEFAULT 0)
 RETURNS TABLE(class_slug text, class_title text, capacity integer, total numeric, base_fee numeric, distance_cost numeric, waiting_cost numeric, round_trip_applied boolean, peak_applied boolean, min_applied boolean, price_source text, subcontractor_id uuid, subcontractor_cost numeric, margin_amount numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  -- ── 0112 · الحاجز الوحيد الذي يلقاه كل مسار تسعير ────────────────────────
  -- `as materialized` تثبيتٌ لا إصلاح: الحارس يعمل بدونها اليوم (مقيس) لأن
  -- `base` مُشار إليه ثلاث مرات فلا يُدمج. والكلمة تمنع انهياره صامتاً يوم
  -- يبقى له مرجعٌ واحد فيُدمج، فلا يُقيَّم `distance_km` على مسار المتعهد.
  with base as materialized (
    select
      greatest(coalesce(public.quote_arg_finite(p_distance_km,   'مسافة الرحلة',   100000), 0), 0) as distance_km,
      greatest(coalesce(p_passengers, 1), 1)                        as passengers,
      coalesce(p_round_trip, false)                                 as round_trip,
      greatest(coalesce(public.quote_arg_finite(p_waiting_hours, 'ساعات الانتظار', 100000), 0), 0) as waiting_hours,
      greatest(coalesce(p_luggage, 0), 0)                           as luggage,
      public.quote_arg_finite(p_origin_lat, 'خط عرض نقطة الانطلاق', 180) as o_lat,
      public.quote_arg_finite(p_origin_lng, 'خط طول نقطة الانطلاق', 180) as o_lng,
      public.quote_arg_finite(p_dest_lat,   'خط عرض الوجهة',        180) as d_lat,
      public.quote_arg_finite(p_dest_lng,   'خط طول الوجهة',        180) as d_lng
  ),
  settings as (
    select
      coalesce(ps.peak_enabled, false)          as peak_enabled,
      coalesce(ps.peak_percent, 0)              as peak_percent,
      -- الافتراضات هنا تطابق DEFAULT_MARGIN في lib/subcontractor-types.ts
      coalesce(ps.margin_type, 'percent')       as margin_type,
      coalesce(ps.margin_value, 20)             as margin_value,
      coalesce(ps.margin_min_amount, 100)       as margin_min_amount
    from (select 1) one
    left join public.pricing_settings ps on ps.id
  ),
  eligible as (
    select vc.slug, vc.title, vc.capacity, t.per_km, t.base_fee, t.min_price,
           t.waiting_hour_price, t.round_trip_factor
    from public.vehicle_classes vc
    join public.tariffs t on t.class_id = vc.id
    cross join base b
    -- 0031: الأهلية صارت شرطين — ركاب **و**حقائب. وموضعها هنا وحده (D-12):
    -- قاعدة أهلية في الواجهة تعني فئةً تُعرض ثم يرفضها الحجز.
    where vc.active
      and vc.capacity >= b.passengers
      and vc.luggage_capacity >= b.luggage
    order by vc.capacity asc
    limit 2
  ),
  covered as (
    -- أرخص تكلفة معتمدة لكل فئة على هذا المسار (فارغة بلا إحداثيات)
    select pli.class_slug,
           min(pli.cost)                                       as sub_cost,
           (array_agg(pl.subcontractor_id order by pli.cost))[1] as sub_id
    from base b
    join lateral public.coverage_matches(b.o_lat, b.o_lng, b.d_lat, b.d_lng) cm on true
    join public.price_lists pl        on pl.id = cm.price_list_id
    join public.price_list_items pli  on pli.price_list_id = pl.id
    where b.o_lat is not null and b.o_lng is not null
      and b.d_lat is not null and b.d_lng is not null
    group by pli.class_slug
  ),
  joined as (
    select e.*, b.*, s.*, c.sub_cost, c.sub_id
    from eligible e
    cross join base b
    cross join settings s
    left join covered c on c.class_slug = e.slug
  ),
  margined as (
    select j.*,
      case when j.sub_cost is null then null
           else greatest(
                  case when j.margin_type = 'percent'
                       then j.sub_cost * j.margin_value / 100
                       else j.margin_value
                  end,
                  coalesce(j.margin_min_amount, 0)
                )
      end as margin_amt
    from joined j
  ),
  priced as (
    select m.*,
      case when m.sub_cost is null then m.base_fee else m.sub_cost + m.margin_amt end as row_base_fee,
      case when m.sub_cost is null then m.distance_km * m.per_km else 0::numeric end  as row_distance_cost,
      m.waiting_hours * m.waiting_hour_price                                          as row_waiting_cost,
      case when m.sub_cost is null
           then m.base_fee + m.distance_km * m.per_km
           else m.sub_cost + m.margin_amt
      end as raw_subtotal
    from margined m
  ),
  floored as (
    select p.*,
      greatest(p.raw_subtotal, p.min_price) as floor_subtotal,
      (p.raw_subtotal < p.min_price)        as min_hit
    from priced p
  ),
  finalized as (
    select f.*,
      case when f.round_trip then f.floor_subtotal * f.round_trip_factor else f.floor_subtotal end
        + f.row_waiting_cost as pre_peak,
      -- التكلفة المطبَّقة: يضربها معامل الذهاب والعودة كما يضرب السعر
      case when f.sub_cost is null then null
           else f.sub_cost * (case when f.round_trip then f.round_trip_factor else 1 end)
      end as applied_cost
    from floored f
  ),
  visibility as (select public.pricing_internals_visible() as ok)
  select
    q.slug                        as class_slug,
    q.title                       as class_title,
    q.capacity                    as capacity,
    round(case when q.peak_enabled then q.pre_peak * (1 + q.peak_percent / 100) else q.pre_peak end) as total,
    round(q.row_base_fee, 2)      as base_fee,
    round(q.row_distance_cost, 2) as distance_cost,
    round(q.row_waiting_cost, 2)  as waiting_cost,
    q.round_trip                  as round_trip_applied,
    q.peak_enabled                as peak_applied,
    q.min_hit                     as min_applied,
    case when q.sub_cost is null then 'tariff' else 'subcontractor' end as price_source,
    case when q.sub_cost is null or not v.ok then null else q.sub_id end as subcontractor_id,
    case when q.sub_cost is null or not v.ok then null
         else round(q.applied_cost, 2) end as subcontractor_cost,
    -- الهامش المطبَّق = (ما قبل الذروة − الانتظار) − التكلفة المطبَّقة
    -- ⚠ الخدمات ليست هنا ولن تكون: خارج أساس الهامش (قرار بدر ب)
    case when q.sub_cost is null or not v.ok then null
         else round(q.pre_peak - q.row_waiting_cost - q.applied_cost, 2) end as margin_amount
  from finalized q
  cross join visibility v
  order by q.capacity asc;
$function$
;

-- ----------------------------------------------------------------------------
-- (٣) فحصٌ ذاتيّ — يفشل الترحيل نفسه إن كان الحاجز زينةً أو إن كسر عملاً سليماً
-- ----------------------------------------------------------------------------
do $$
declare
  v_ok        boolean;
  v_hint      text;
  v_total     numeric;
  v_count     integer;
  v_min       numeric;
  v_air       record;
  v_alx       record;
  v_ready     boolean;
  -- إحداثيات القائمتين المعتمدتين — تُقرأ للقياس ولا يُكتب بها شيء
  c_air_olat  constant numeric := 30.114826;
  c_air_olng  constant numeric := 31.350388;
  c_air_dlat  constant numeric := 30.100599;
  c_air_dlng  constant numeric := 31.332914;
  c_alx_olat  constant numeric := 30.044388;
  c_alx_olng  constant numeric := 31.235726;
  c_alx_dlat  constant numeric := 31.199181;
  c_alx_dlng  constant numeric := 29.895172;
begin
  -- (٣-أ) الحارس نفسه: يرفض الثلاثة، ويمرّر السليم و«لا شيء»
  foreach v_hint in array array['NaN', 'Infinity', '-Infinity'] loop
    v_ok := false;
    begin
      perform public.quote_arg_finite(v_hint::numeric, 'س', 100000);
    exception when others then v_ok := true;
    end;
    if not v_ok then
      raise exception '0112: 🔴 الحارس مرّر «%» — حاجزٌ زينة', v_hint;
    end if;
  end loop;

  v_ok := false;
  begin
    perform public.quote_arg_finite(1e1000::numeric, 'س', 100000);
  exception when others then v_ok := true;
  end;
  if not v_ok then
    raise exception '0112: 🔴 الحارس مرّر 1e1000 — والناتج يصير Infinity في المتصفح';
  end if;

  if public.quote_arg_finite(250, 'س', 100000) <> 250
     or public.quote_arg_finite(-10, 'س', 100000) <> -10
     or public.quote_arg_finite(0, 'س', 100000) <> 0
     or public.quote_arg_finite(null, 'س', 100000) is not null then
    raise exception '0112: 🔴 الحارس يرفض قيمةً مشروعة — حاجزٌ يمنع العمل السليم';
  end if;

  -- (٣-ب) الجذر يرفض على **مسار التعريفة** (بلا تغطية) — وهو المسار المكشوف
  foreach v_hint in array array['NaN', 'Infinity', '1e1000'] loop
    v_ok := false;
    begin
      perform q.total from public.quote_price(v_hint::numeric, 4, false, 0) q;
    exception when others then v_ok := true;
    end;
    if not v_ok then
      raise exception '0112: 🔴 مسافة «%» عبرت إلى سعر التعريفة', v_hint;
    end if;

    v_ok := false;
    begin
      perform q.total from public.quote_price(10, 4, false, v_hint::numeric) q;
    exception when others then v_ok := true;
    end;
    if not v_ok then
      raise exception '0112: 🔴 ساعات انتظار «%» عبرت إلى السعر', v_hint;
    end if;
  end loop;

  -- (٣-ج) ويرفض على **مسار المتعهد المغطّى** كذلك — وهو الذي أخفى العيب قبل
  --       الهجرة: `distance_cost` يصير صفراً هناك، فمسافةُ `NaN` كانت تُعيد
  --       ٧٢٠ سليمةً (مقيس) بينما تُعيد `NaN` على كل نقطةٍ خارج القائمتين.
  v_ok := false;
  begin
    perform q.total from public.quote_price(
      'NaN'::numeric, 4, false, 0,
      c_air_olat, c_air_olng, c_air_dlat, c_air_dlng, 0) q;
  exception when others then v_ok := true;
  end;
  if not v_ok then
    raise exception
      '0112: 🔴 مسافة NaN عبرت على المسار المغطّى — الحارس لم يُقيَّم على هذا الفرع';
  end if;

  -- (٣-د) والإحداثيات كذلك — وقبل الهجرة كانت `NaN` تُسقط التغطية صامتةً
  --       فتعطي سعر تعريفةٍ **أقلّ** من سعر القائمة المعتمدة.
  v_ok := false;
  begin
    perform q.total from public.quote_price(
      10, 4, false, 0,
      'NaN'::numeric, c_air_olng, c_air_dlat, c_air_dlng, 0) q;
  exception when others then v_ok := true;
  end;
  if not v_ok then
    raise exception '0112: 🔴 خط عرض NaN عبر — والتغطية تسقط صامتةً';
  end if;

  -- (٣-هـ) والرسالة تصل بـ`hint` مفهوم لا برقم قيدٍ أعمى
  v_hint := null;
  begin
    perform q.total from public.quote_price(10, 4, false, 'NaN'::numeric) q;
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if v_hint is distinct from 'invalid-input' then
    raise exception '0112: 🔴 التلميح «%» لا «invalid-input» — الشاشة لن تعرف ماذا تقول',
      coalesce(v_hint, 'لا شيء');
  end if;

  -- (٣-و) الباب المفتوح من الشارع نفسه: `quote_public` ترفض
  v_ok := false;
  begin
    perform q.total from public.quote_public(
      10, 4, false, 'NaN'::numeric,
      c_air_olat, c_air_olng, c_air_dlat, c_air_dlng) q;
  exception when others then v_ok := true;
  end;
  if not v_ok then
    raise exception
      '0112: 🔴 quote_public ما زالت تُخرج NaN — وهي الباب الوحيد المفتوح للزائر';
  end if;

  -- (٣-ز) 🔴 والعمل السليم لم يُمسّ: السالب والفارغ يُقصّان كما كانا (د-٢/د-٣)
  select count(*), min(q.total) into v_count, v_min
  from public.quote_price(-10, 2, true, -5) q;
  if v_count <> 2 or v_min < 0 then
    raise exception '0112: 🔴 المدخلات السالبة لم تعد تُقصّ: عروض % وأدنى إجمالي %',
      v_count, v_min;
  end if;

  select count(*) into v_count from public.quote_price(null, null, null, null) q;
  if v_count <> 2 then
    raise exception '0112: 🔴 المدخلات الفارغة لم تعد تعمل: عروض %', v_count;
  end if;

  select q.total into v_total
  from public.quote_price(250, 5, false, 0) q where q.class_slug = 'suv';
  if v_total is null or not (v_total > 0 and v_total < 'Infinity'::numeric) then
    raise exception '0112: 🔴 عرضٌ مشروع لم يعد يُسعَّر: %', coalesce(v_total::text, 'لا شيء');
  end if;

  -- (٣-ح) 🔴 وأرقام المالك المعتمدة — تُقارَن بالقيمة لا بعدد الصفوف.
  --       والشرط يُفحص أولاً: إن عاير المالك تكلفةً أو هامشاً تُخطَّى بإشعار
  --       بدل أن تُحمِّر ترحيلاً على قرارٍ من حقّه.
  select
    exists (select 1 from public.price_lists pl
             join public.price_list_items i on i.price_list_id = pl.id
            where pl.status = 'approved' and pl.title = 'مطار القاهرة - داخلي'
              and ((i.class_slug = 'suv' and i.cost = 600)
                or (i.class_slug = 'minibus' and i.cost = 900))
            group by pl.id having count(*) = 2)
    and exists (select 1 from public.price_lists pl
             join public.price_list_items i on i.price_list_id = pl.id
            where pl.status = 'approved' and pl.title = 'القاهرة - الأسكندرية'
              and ((i.class_slug = 'suv' and i.cost = 1500)
                or (i.class_slug = 'minibus' and i.cost = 2200))
            group by pl.id having count(*) = 2)
    and exists (select 1 from public.pricing_settings ps
            where ps.margin_type = 'percent' and ps.margin_value = 20
              and ps.margin_min_amount = 100 and not ps.peak_enabled)
    into v_ready;

  if not v_ready then
    raise notice
      '0112 ⏭ أرقام القائمتين المعتمدتين تُخطَّى: التكلفة أو الهامش أو الذروة تغيّرت عمّا قِيس';
  else
    select
      max(q.total) filter (where q.class_slug = 'suv')     as suv,
      max(q.total) filter (where q.class_slug = 'minibus') as bus
      into v_air
    from public.quote_price(10, 4, false, 0,
                            c_air_olat, c_air_olng, c_air_dlat, c_air_dlng, 0) q;
    if v_air.suv <> 720 or v_air.bus <> 1500 then
      raise exception '0112: 🔴 قائمة المطار تغيّرت: توقعنا ٧٢٠/١٥٠٠ وحصلنا %/%',
        v_air.suv, v_air.bus;
    end if;

    select
      max(q.total) filter (where q.class_slug = 'suv')     as suv,
      max(q.total) filter (where q.class_slug = 'minibus') as bus
      into v_alx
    from public.quote_price(220, 4, false, 0,
                            c_alx_olat, c_alx_olng, c_alx_dlat, c_alx_dlng, 0) q;
    if v_alx.suv <> 1800 or v_alx.bus <> 2640 then
      raise exception '0112: 🔴 قائمة الإسكندرية تغيّرت: توقعنا ١٨٠٠/٢٦٤٠ وحصلنا %/%',
        v_alx.suv, v_alx.bus;
    end if;

    select
      max(q.total) filter (where q.class_slug = 'suv')     as suv,
      max(q.total) filter (where q.class_slug = 'minibus') as bus
      into v_alx
    from public.quote_price(220, 4, true, 2,
                            c_alx_olat, c_alx_olng, c_alx_dlat, c_alx_dlng, 0) q;
    if v_alx.suv <> 3250 or v_alx.bus <> 4952 then
      raise exception '0112: 🔴 الذهاب والعودة تغيّر: توقعنا ٣٢٥٠/٤٩٥٢ وحصلنا %/%',
        v_alx.suv, v_alx.bus;
    end if;

    raise notice '0112 ✔ أرقام المالك كما هي: ٧٢٠/١٥٠٠ · ١٨٠٠/٢٦٤٠ · ٣٢٥٠/٤٩٥٢';
  end if;

  -- (٣-ط) الصلاحيات في الاتجاهين — لا تُفتح للزائر ولا تُطفأ عن الموقع
  if not has_function_privilege('anon',
       'public.quote_public(numeric, integer, boolean, numeric, numeric, numeric, numeric, numeric, text, integer, jsonb)',
       'EXECUTE') then
    raise exception
      '0112: 🔴 سُحبت منحة quote_public من anon — والموقع يسعّر قبل الدخول (0012)';
  end if;
  if has_function_privilege('anon',
       'public.quote_price(numeric, integer, boolean, numeric, numeric, numeric, numeric, numeric, integer)',
       'EXECUTE') then
    raise exception
      '0112: 🔴 الزائر يملك EXECUTE على جذر التسعير — وهو يحمل التكلفة والهامش';
  end if;

  raise notice '0112 ✔ الحاجز في الجذر · مسارا التعريفة والمتعهد مغلقان · quote_public ترفض · القصّ والفراغ كما كانا · الصلاحيات مضبوطة';
end;
$$;
