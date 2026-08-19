-- ============================================================================
-- 0143_price_floor_direct_km_clamp.sql — الأرضيةُ لا تصعد فوق طولِ الرحلة
--
-- ── العيبُ المقيس ──────────────────────────────────────────────────────────
--
-- 0142 بَنت أرضيةَ «لا أرخصَ من المباشر» على مسافةٍ مباشرةٍ **مقدَّرة نسبياً**:
--
--     direct_km := distance_km × (وترُ المنطلق⇒الوجهة ÷ مجموعِ أوتار الأرجل)
--
-- وكتبت في جسمِها هذا الادعاء حرفاً:
--
--     «`s_direct ÷ s_multi ≤ 1` مثلثياً ⇒ `direct_km ≤ distance_km` دائماً»
--
-- 🔴 **والادعاءُ باطلٌ حين لا تكون `s_multi` مجموعَ كل الأرجل.**
-- `trip_straight_km` تُسقط الرِّجلَ التي أحدُ طرفيها بلا إحداثيات — لا ترفضها:
-- المرشِّحُ `where l.a_lat is not null` يسقط الرِّجلَ الخارجةَ من محطةٍ عمياء،
-- و`sum()` تتخطّى الرِّجلَ الداخلةَ إليها لأن `haversine_km` تُرجع `null`.
-- فمحطتان إحداهما بإحداثيات والأخرى بلا ⇒ `s_multi` = **رِجلٌ واحدة فقط**،
-- وقد تكون أقصرَ من الوتر المباشر ⇒ النسبةُ > ١ ⇒ `direct_km > distance_km`.
--
-- وحينها تُسعِّر الأرضيةُ رحلةً **أطولَ ممّا سيُقاد فعلاً**، وتفوز على تعريفة
-- الأرجل، فيدفع العميلُ أضعافَ ما يجب. مقيسٌ على القاعدة الحيّة قبل هذا الملف
-- (‏ممرٌّ صحراويٌّ بلا تغطية · 100 كم · suv · نفسُ المسافة في الصفوف الثلاثة):
--
--     بلا محطات ..................................... ١٣٠٠ ج
--     محطةٌ سليمةٌ في المنتصف ......................... ١٣٠٠ ج   (الأرضيةُ لا تمسك — صواب)
--     🔴 محطةٌ سليمة + محطةٌ بلا إحداثيات ............. ١٩٩٩٩ ج  (‏×١٥٫٤)
--
-- والثلاثةَ عشرَ حالةً الأخرى في نفس البطارية (محطةٌ = المنطلق · = الوجهة ·
-- محطتان متطابقتان · انحرافٌ حقيقيّ · بلا إحداثيات وحدها · عنصرٌ عدديّ ·
-- مصفوفةٌ فارغة · ليست مصفوفة · إحداثياتٌ نصيّة · إحداثياتٌ هائلة …) كلُّها
-- ١٣٠٠ ج بلا فرق. فالعطبُ **حالةٌ واحدةٌ بعينها**: مجموعٌ جزئيّ لأوتار الأرجل.
--
-- ── مدى الوصول اليوم — يُقال كما هو، لا أوسعَ ولا أضيق ────────────────────
--
-- المساران العامّان يرفضان المحطةَ بلا إحداثيات قبل أن تبلغ القاعدة
-- (`isFiniteCoords` في `app/api/quote/route.ts` · `parsePlace` في
-- `app/api/booking/route.ts`)، و`create_booking` ترفضها ثالثةً في القاعدة
-- (`trip_stops_reject_reason` ⇒ `stop-coords-missing`) **قبل** أن تنادي
-- `quote_price`. فلا حجزَ يمكن أن يُخزَّن بهذا السعر اليوم.
--
-- 🔴 **لكنّ `quote_public` ممنوحةٌ لـ`anon` و`authenticated`** وتمرّر `p_stops`
--    كما وصلت (0140) ⇒ نداءُ RPC مباشرٌ بمفتاح anon المنشور في حزمة المتصفح
--    يُخرج رقماً مضروباً في خمسةَ عشر. **والحاجزُ يجب أن يكون حيث يُحسب المال**
--    لا في مُحلِّلَي المسارين وحدهما — وهذا نصُّ القاعدة ١٢ ونمطُ الفشل ٧
--    («التعليقُ ليس حارساً»): 0142 كتبت المتباينةَ تعليقاً ولم تفرضها.
--
-- ── العلاج ────────────────────────────────────────────────────────────────
--
-- سطرٌ واحد: `least(…, b0.distance_km)`. المتباينةُ التي ادّعتها 0142 تصير
-- **مفروضةً** بدل أن تكون مظنونة. ولأن `direct_km ≤ distance_km` تصير حقيقةً،
-- يعود فرعُ التعريفة في النداء الداخليّ عاجزاً عن الفوز على تعريفة الأرجل —
-- أي أن الأرضيةَ تمسك **حين يكون المباشرُ مغطّى وحده**، وهو غرضُ 0142 حرفاً.
--
-- ⚠ وتُغطّي الصيغةُ نفسُها حالةَ `NaN`: محطةٌ بـ`"lat":"NaN"` تجعل `s_multi`
--   قيمةَ `NaN`، و`NaN > 0` **صادقة** في numeric فيمرّ الفرعُ الحسابي وينتج
--   `NaN`؛ و`least(NaN, distance_km)` = `distance_km` لأن `NaN` أكبرُ من كل
--   قيمةٍ في ترتيب numeric. فالحارسُ واحدٌ يكفي الحالتين.
--
-- ── ما لم يُمسّ ────────────────────────────────────────────────────────────
--
-- · لا `drop`: التوقيعُ ونوعُ الإرجاع كما هما ⇒ `create or replace` وحدها ⇒
--   `proacl` لم يُمسّ (‏42725 والمنحُ الافتراضية). مقيسٌ قبل وبعد.
-- · الجسمُ منقولٌ من `pg_get_functiondef` الحيّ (**D-58**) لا من ملف 0142.
-- · قرارُ 0140 قائمٌ بحرفه: `and not b.has_stops` في `covered`، و`price_source`
--   تبقى `tariff`، والأعمدةُ الثلاثة `null` على كل رحلةٍ بمحطات.
-- · `create_booking` · `dispatch_pool` · `dispatch_ceiling` · `quote_public` ·
--   `coverage_best_costs` · `trip_straight_km` — **ولا حرفَ في واحدةٍ منها**.
--
-- ── ما لا يعالجه هذا الملف، ويُقال صراحةً ─────────────────────────────────
--
-- (١) `trip_straight_km` ترفع `22P02` على `"lat":"abc"` (‏`::numeric` على نصٍّ
--     لا يُحلَّل). غيرُ بالغةٍ من المسارين ولا من `create_booking`، وناتجُها
--     **خطأٌ لا سعرٌ خاطئ**. وإصلاحُها يمسّ دالةً تشاركها `create_booking`،
--     فلا تستحقّ المخاطرةَ بلا مالٍ يتحرك.
-- (٢) أن يقود المتعهدُ أطولَ بمستحقٍّ لم يتغيّر — **قرارُ تسعيرٍ لبدر**، مقيسٌ
--     في تقرير مراجعة 0142 ولا يُنفَّذ هنا.
-- ============================================================================

create or replace function public.quote_price(
  p_distance_km  numeric,
  p_passengers   integer,
  p_round_trip   boolean,
  p_waiting_hours numeric,
  p_origin_lat   numeric,
  p_origin_lng   numeric,
  p_dest_lat     numeric,
  p_dest_lng     numeric,
  p_luggage      integer default 0,
  p_stops        jsonb   default null
)
returns table (
  class_slug         text,
  class_title        text,
  capacity           integer,
  total              numeric,
  base_fee           numeric,
  distance_cost      numeric,
  waiting_cost       numeric,
  round_trip_applied boolean,
  peak_applied       boolean,
  min_applied        boolean,
  price_source       text,
  subcontractor_id   uuid,
  subcontractor_cost numeric,
  margin_amount      numeric
)
language sql
stable
security definer
set search_path = ''
as $function$
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
      public.quote_arg_finite(p_dest_lng,   'خط طول الوجهة',        180) as d_lng,
      -- 0140 — 🔴 هل في الرحلة محطاتٌ وسطى؟
      coalesce(
        case when jsonb_typeof(p_stops) = 'array' then jsonb_array_length(p_stops) else 0 end,
        0
      ) > 0 as has_stops
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
    -- ── 0132 · قاعدةُ الفوز صارت على مرحلتين ───────────────────────────────
    -- (١) **داخل المتعهد**: `coverage_best_costs` تحسم بالأقرب مركزاً وتُرجع
    --     صفاً واحداً لكل (متعهد × فئة). فلا تُمحى منطلقاتُه المتمايزة.
    -- (٢) **بين المتعهدين**: `min(cost)` كما كان — نحن وسيطٌ نشتري بأقلّ.
    -- وحسمُ تعادل السعر بين متعهدين صار بالمعرّف بعد أن كان غيرَ محدَّد.
    --
    -- ── 0140 · 🔴 والمحطاتُ الوسطى تُخرج الرحلةَ من هذا المسار كلّه ─────────
    -- المتعهد سعّر **مساراً مباشراً**؛ ورحلةٌ بمحطةٍ أطولُ زمناً ومسافةً
    -- ومستحقُّه لا يتغيّر. فلا يُطلب منه ما لم يسعّره، وتُسعَّر بالتعريفة على
    -- الطول الحقيقي. ولا حرفَ يتغيّر في coverage_best_costs ولا في dispatch_pool.
    --
    -- ── 0142 · وهذا الشرطُ باقٍ بحرفه ──────────────────────────────────────
    -- الأرضيةُ في آخر الاستعلام **حدٌّ أدنى للإجمالي** لا عودةٌ إلى هذا المسار:
    -- لا معرّفَ متعهدٍ ولا تكلفةَ ولا هامشَ يُكتب على رحلةٍ بمحطات.
    select cb.class_slug,
           min(cb.cost)                                                             as sub_cost,
           (array_agg(cb.subcontractor_id order by cb.cost, cb.subcontractor_id))[1] as sub_id
    from base b
    join lateral public.coverage_best_costs(b.o_lat, b.o_lng, b.d_lat, b.d_lng) cb on true
    where b.o_lat is not null and b.o_lng is not null
      and b.d_lat is not null and b.d_lng is not null
      and not b.has_stops
    group by cb.class_slug
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
  visibility as (select public.pricing_internals_visible() as ok),

  -- ══════════════════════════════════════════════════════════════════════════
  -- 0142 — الأرضية. وما قبل هذا السطر ناتجُ 0140 حرفاً بحرف.
  -- ══════════════════════════════════════════════════════════════════════════

  -- (أ) `legs` — ما تعطيه أرجلُ الرحلة اليوم. هذا **بعينه** كان الاختيارَ
  --     النهائي في 0140؛ لم يتغيّر فيه عمودٌ ولا شرط، إنما صار CTE ليُقارَن.
  legs as (
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
  ),

  -- (ب) 🔴 **الحاجزُ ضدّ العَود اللانهائي، وهو بنيويٌّ لا اصطلاحيّ.**
  --
  --   · المرشِّح `where b0.has_stops` **داخل** الاستعلام الفرعيّ، لا شرطاً
  --     أعلى يستطيع المخطِّطُ أن يرفع نداءَ الدالة فوقه.
  --   · و`as materialized` تجعلها عقدةً تُقيَّم بمفردها ⇒ صفرُ صفوفٍ بلا
  --     محطات ⇒ الطرفُ الخارجيّ للحلقة في (ج) فارغ ⇒ الدالةُ لا تُنادى أصلاً.
  --   · وفوق ذلك: النداءُ في (ج) يمرّر `null::jsonb` دائماً ⇒ المستوى الثاني
  --     `has_stops = false` ⇒ `direct_args` هناك فارغة ⇒ **لا مستوى ثالث،
  --     بحكم الوسيط لا بحكم المخطِّط**.
  --
  -- ── المسافةُ المباشرة المقدَّرة، وحدُّها **مفروضٌ لا مظنون** (0143) ────────
  --   كانت 0142 تكتب `s_direct ÷ s_multi ≤ 1` تعليقاً وتتّكئ على متباينةِ
  --   المثلث. والمتباينةُ تصدق حين تكون `s_multi` مجموعَ **كلّ** الأرجل —
  --   و`trip_straight_km` تُسقط الرِّجلَ التي طرفُها بلا إحداثيات بدل أن ترفضها،
  --   فتُرجع مجموعاً جزئياً قد يقلّ عن الوتر ⇒ النسبةُ > ١ ⇒ سعرٌ فوق طول
  --   الرحلة (مقيس: ×١٥٫٤ على ممرٍّ غير مغطّى). فصار الحدُّ `least(…)` صريحاً:
  --   **لا تُسعَّر أرضيةٌ على مسافةٍ أطولَ ممّا سيُقاد.**
  --   ويغطّي `least` كذلك `s_multi = NaN` (‏`NaN` أكبرُ من كل numeric).
  --   و`s_multi = 0` (كلُّ النقاط نقطةٌ واحدة) تسقط إلى المقيس كما كانت.
  direct_args as materialized (
    select
      least(
        case when g.s_multi > 0 and g.s_direct is not null
             then b0.distance_km * g.s_direct / g.s_multi
             else b0.distance_km
        end,
        b0.distance_km
      )                  as direct_km,
      b0.passengers      as passengers,
      b0.round_trip      as round_trip,
      b0.waiting_hours   as waiting_hours,
      b0.luggage         as luggage,
      b0.o_lat           as o_lat,
      b0.o_lng           as o_lng,
      b0.d_lat           as d_lat,
      b0.d_lng           as d_lng
    from (select * from base b1 where b1.has_stops) b0
    cross join lateral (
      select public.haversine_km(b0.o_lat, b0.o_lng, b0.d_lat, b0.d_lng) as s_direct,
             public.trip_straight_km(b0.o_lat, b0.o_lng, b0.d_lat, b0.d_lng, p_stops) as s_multi
    ) g
  ),

  -- (ج) سعرُ **نفسِ الرحلة لو كانت بنقطتين** — نداءٌ واحدٌ للمحرّك نفسِه.
  --     القاعدة ١٢: أرضيةُ الفئة والانتظار ومعاملُ الذهاب والعودة والذروة
  --     والهامش كلُّها تُطبَّق مرةً واحدةً في مكانٍ واحد، ولا نسخةَ ثانية منها.
  direct as (
    select d.class_slug, d.total, d.base_fee, d.distance_cost,
           d.waiting_cost, d.min_applied
    from direct_args a
    cross join lateral public.quote_price(
      a.direct_km, a.passengers, a.round_trip, a.waiting_hours,
      a.o_lat, a.o_lng, a.d_lat, a.d_lng, a.luggage,
      null::jsonb   -- 🔴 هنا ينقطع العَود
    ) d
  ),

  -- (د) الأكبرُ منهما — وحين تفوز الأرضيةُ تُؤخذ **بنودُها** معها، لا رقمُها
  --     وحده: `base_fee + distance_cost` لو بقيا من الأرجل لَعرضت الشاشةُ
  --     تفصيلاً لا يجمع إلى الإجمالي (`quote_public` تُعيد توزيعهما على بندَي
  --     العرض كما تفعل لكل صفٍّ مصدرُه متعهد).
  --
  -- 🔒 و`price_source` و`subcontractor_*` و`margin_amount` تُؤخذ من **فرع
  --    الأرجل دائماً** — فقرار 0140 قائمٌ بحرفه: رحلةٌ بمحطاتٍ لا تحمل معرّفَ
  --    متعهدٍ ولا تكلفتَه ولا هامشَه مهما بلغت الأرضية.
  merged as (
    select l.*,
           dr.total          as d_total,
           dr.base_fee       as d_base_fee,
           dr.distance_cost  as d_distance_cost,
           dr.waiting_cost   as d_waiting_cost,
           dr.min_applied    as d_min_applied,
           (dr.total is not null and dr.total > l.total) as floor_wins
    from legs l
    left join direct dr on dr.class_slug = l.class_slug
  )
  select
    m.class_slug,
    m.class_title,
    m.capacity,
    case when m.floor_wins then m.d_total         else m.total         end as total,
    case when m.floor_wins then m.d_base_fee      else m.base_fee      end as base_fee,
    case when m.floor_wins then m.d_distance_cost else m.distance_cost end as distance_cost,
    case when m.floor_wins then m.d_waiting_cost  else m.waiting_cost  end as waiting_cost,
    m.round_trip_applied,
    m.peak_applied,
    case when m.floor_wins then m.d_min_applied   else m.min_applied   end as min_applied,
    m.price_source,
    m.subcontractor_id,
    m.subcontractor_cost,
    m.margin_amount
  from merged m
  order by m.capacity asc;
$function$;

comment on function public.quote_price(numeric, integer, boolean, numeric, numeric, numeric, numeric, numeric, integer, jsonb) is
  'محرّك التسعير (D-05 · D-11). منذ 0140 يقبل p_stops: رحلةٌ بمحطاتٍ وسطى **لا تدخل مسار تغطية المتعهدين إطلاقاً** وتُسعَّر بالتعريفة على المسافة متعددة الأرجل — لأن المتعهد سعّر مساراً مباشراً ومستحقُّه لا يتغيّر بانحراف. ومنذ 0142 عليها **أرضية «لا أرخصَ من المباشر»**: الإجمالي = الأكبر من تعريفة الأرجل وسعرِ نفسِ الرحلة بنقطتين على المسافة المباشرة (تُشتق نسبياً من الأرجل بالوتر) — لأن رحلةً أطولَ لا تكلّف أقلَّ من الأقصر التي تحتويها، ولأن السقف يُشتق من الإجمالي فالمنخفضُ يُخرج المتعهد المغطّي من البثّ. ومنذ 0143 المسافةُ المقدَّرة **مقصوصةٌ صراحةً** على المسافة المقيسة (‏least): مجموعٌ جزئيّ لأوتار الأرجل — تُنتجه محطةٌ بلا إحداثيات بجوار محطةٍ سليمة — كان يرفع التقديرَ فوق طول الرحلة فيبيع بأضعافِ التعريفة. والأرضيةُ حدٌّ أدنى للإجمالي لا مصدرُ تسعير: price_source تبقى tariff و subcontractor_id/cost و margin_amount تبقى null. محجوبة عن anon و authenticated: تحمل التكلفة والهامش في نوع إرجاعها (D-20).';
