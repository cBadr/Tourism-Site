-- ============================================================================
-- 0132_nearest_route_wins.sql
-- الأقربُ مركزاً يفوز داخل المتعهد الواحد — والأرخصُ يفوز بين المتعهدين
-- ============================================================================
--
-- ── العيبُ مقيساً، لا مفترضاً ──────────────────────────────────────────────
--
-- بعد دخول مئةِ قائمةِ أسعارٍ حقيقية (2026-08-18) صار المسارُ الواحد يطابق
-- أكثرَ من قائمةٍ **للمتعهد نفسِه**، لأن نطاقاتِ المنطلقات تتداخل بالضرورة في
-- نسيجٍ حضريٍّ كثيف. و`quote_price` كانت تأخذ `min(pli.cost)` على **كل**
-- المطابقات، فتختار أرخصَ قوائمه لا أقربَها.
--
--   -- عميلٌ من مطار القاهرة (30.1219, 31.4056) إلى الإسكندرية (31.1991, 29.8952)
--   select cm.title,
--          round(public.haversine_km(30.1219, 31.4056, pl.origin_lat, pl.origin_lng), 3) as km,
--          pli.cost
--   from public.coverage_matches(30.1219, 31.4056, 31.1991, 29.8952) cm
--   join public.price_lists       pl  on pl.id = cm.price_list_id
--   join public.price_list_items  pli on pli.price_list_id = pl.id
--   where pli.class_slug = 'suv' order by 2;
--
--     «مطار القاهرة - الإسكندرية»                     ٥٫٣٦٨ كم   ١٦٢٥
--     «القاهرة(وسط البلد حتى التجمع …) - الإسكندرية»  ١٨٫٤٧٨ كم   ١٥٧٥
--
--   select subcontractor_cost from public.quote_price(220, 4, false, 0,
--            30.1219, 31.4056, 31.1991, 29.8952, 2) where class_slug = 'suv';
--     ⇒ ١٥٧٥.٠٠
--
-- ⇒ ثلاثةُ أضرارٍ في نداءٍ واحد:
--    (١) **تمايزُ المتعهد السعريّ يُمحى** — لماذا يسعّر منطلقاتٍ متعددة إن كان
--        أرخصُها هو الذي يُقرأ دائماً؟
--    (٢) **منطلقاتُه الأغلى لا تُبلَغ أبداً** — سطرٌ في قائمته لا يُقرأ قطّ.
--    (٣) و`dispatch_pool` تبني المستحق على `min(pli.cost)` نفسِها ⇒ **يُطلب منه
--        تنفيذُ الرحلة بأقلَّ مما سعّرها هو**.
--
-- ── لماذا لا يُعالَج بتصغير النطاقات ───────────────────────────────────────
--
-- جُرِّب اليوم وأُرجع: «نصفُ القطر = ٠٫٤٥ × المسافة إلى أقرب نقطة، محصوراً بين
-- ٥ و٢٠» خفّض الأزواجَ المتصادمة ٧٢ ⇐ ٧ **وقتل التغطية معها**: مطار القاهرة ⇒
-- الإسكندرية صار **صفر** مطابقة، والتجمع **صفر**، ومدينة نصر ⇒ الغردقة **صفر**.
-- (التفصيل في `docs/phase-briefs/SESSION-STATE-2026-08-18.md` §١١.)
--
-- 📌 **القاعدة المستخلَصة:** في نسيجٍ حضريٍّ كثيف النقاطُ متقاربةٌ بطبعها،
--    فالتغطيةُ تستلزم تداخلاً. **التداخلُ ليس العيب — قاعدةُ الفوز هي العيب.**
--
-- ── القرار ────────────────────────────────────────────────────────────────
--
-- **داخل المتعهد الواحد: الأقربُ مركزاً يفوز.** القائمةُ التي مركزُ منطلقها
-- أقربُ إلى نقطة الالتقاط هي المقصودة، مهما كان سعرها.
--
-- **وبين المتعهدين: الأرخصُ يفوز كما هو** — نحن وسيطٌ نشتري بأقلّ (D-05)،
-- ولا يتغيّر شيءٌ في هذا الشقّ.
--
-- ── التعريفُ واحدٌ ولا يُستنسخ (القاعدة ١٢) ────────────────────────────────
--
-- الحسمُ كلُّه في دالةٍ واحدة `coverage_best_costs`، وتُفوِّض إليها `quote_price`
-- و`dispatch_pool`. فلا تُكتب قاعدةُ الفوز مرتين ولا تنحرف نسختاها — وهو بعينه
-- النمط ٨ في `LESSONS.md` (مصدران لرقمٍ واحد).
-- والمسافةُ من `public.haversine_km` القائمة، لا من حسابٍ جديد (قيد البريف ٥).
--
-- ── ترتيبُ الفوز، بالحرف ──────────────────────────────────────────────────
--
--   ١) `origin_km` تصاعدياً  — بُعدُ نقطة الالتقاط عن **مركز المنطلق المطابِق**
--   ٢) `dest_km`   تصاعدياً  — وبُعدُ نقطة النزول عن **مركز الوجهة المطابِقة**
--   ٣) `cost`      تصاعدياً  — الأرخص
--   ٤) `price_list_id` تصاعدياً — حسمٌ نهائيٌّ ثابت
--
-- ⚠ **والبندُ (٢) امتدادٌ مُعلَن للقرار لا انحرافٌ عنه.** «المسافة» هنا زوجٌ
--   مرتَّب (منطلق ثم وجهة)، والمنطلقُ هو المفتاح الأول دائماً. فالبندُ (٢) لا
--   يعمل إلا حين **يتساوى بُعدُ المنطلقين تماماً** — وهي الحالُ حين يملك المتعهد
--   قائمتين من المركز نفسِه إلى وجهتين متداخلتي النطاق. وبدونه يعود العيبُ
--   نفسُه مقلوباً على محور الوجهة. والتعادلُ التامّ (‏١ و٢ معاً) يحسمه (٣) ثم (٤)
--   كما نصّ القيد ٣ في البريف: **لا ترتيبَ عشوائيّ في أي حال**.
--
-- ⚠ **والمطابقةُ المعكوسة تُقلَب معها**: قائمةٌ ثنائيةُ الاتجاه طابقت معكوسةً
--   يكون «مركزُ منطلقها» بالنسبة لهذه الرحلة هو `dest_*` لا `origin_*`
--   (‏`coverage_matches` تُرجع `reversed`، وهي مقروءةٌ حيّةً من الكتالوج — D-58).
--   وبدون القلب تُقاس نقطةُ الالتقاط إلى الطرف الخطأ فيفوز الأبعد.
--
-- ── الفوزُ لكل (متعهد × فئة) لا لكل متعهد ─────────────────────────────────
--
-- القائمةُ الأقربُ قد لا تُسعّر الفئة المطلوبة أصلاً. فاختيارُ قائمةٍ واحدةٍ
-- للمتعهد كلِّه كان سيُسقط فئاتٍ مُسعَّرة في قوائمَ أبعد ⇒ **تغطيةٌ تموت**،
-- وهو الخطأ نفسه الذي وقع فيه علاجُ النطاقات. فالفوزُ يُحسم **داخل كل فئة**.
--
-- ── القياسُ قبل/بعد، على بيانات القاعدة الحيّة ─────────────────────────────
--
-- أُجري القياس بـ SELECT محضٍ (بلا DDL) بمحاكاة القاعدتين جنباً إلى جنب:
--
--   العيّنة (أ) — مركزُ منطلق كل قائمة معتمدة × مركزُ وجهتها (‏١٠٠ قائمة):
--     ١٥٥ زوجاً (نقطة × فئة) · بلا تغيير ١٣٤ · ارتفع ٢١ · **انخفض ٠**
--     ١٠٢ زوجاً بمطابقةٍ واحدة ⇒ **تغيّر منها صفر**
--
--   العيّنة (ب) — شبكةٌ ٠٫٠٥° فوق القاهرة والدلتا × ٦ وجهات:
--     ١٢٩٥ زوجاً · بلا تغيير ١١٥٩ · ارتفع ١٣٦ · **انخفض ٠**
--     ٧٥٧ زوجاً بمطابقةٍ واحدة ⇒ **تغيّر منها صفر**
--     ومجموعةُ المفاتيح قبل = بعد (‏١٢٩٥ = ١٢٩٥) ⇒ **لا تغطيةَ فُقدت**
--
-- ⇒ القيدُ ١ في البريف («لا تتغيّر النتيجة عند المطابقة الواحدة») مُثبَتٌ على
--    ٨٥٩ زوجاً أحاديَّ المطابقة، ولا حالةَ واحدة انخفض فيها سعر.
--    وفي كل حالةٍ ارتفعت، كانت القائمةُ الفائزة هي التي مركزُ منطلقها **٠٫٠٠ كم**
--    من نقطة الالتقاط — أي قائمةُ المتعهد المقصودة بعينها.
--
-- ── الأثرُ على الإرسال (القيد ٤ في البريف) ────────────────────────────────
--
--   • `dispatch_ceiling` **لم يُمَسّ**: تقرأ `bookings.subcontractor_cost` و
--     `margin_amount` المجمَّدتين لحظة الحجز من `quote_price` نفسِها، فترتفعان
--     معاً ويرتفع السقف بمقدارهما. **وحاجزُ D-16 يبقى صلباً بحرفه**:
--     `v_base := least(v_base, greatest(v_total - v_cfg.min_margin_amount, 0))`
--     ما زال آخرَ ما يُنفَّذ قبل الإرجاع.
--   • `dispatch_pool` **تُفوِّض الآن للدالة نفسِها**، فالمستحقُّ المعروض على
--     المتعهد صار من **القائمة التي سعّرها هو لهذا المنطلق**. وهذا هو الضررُ
--     الثالث أعلاه، ولا يُغلق بتعديل `quote_price` وحدها.
--   • والاتجاه واحد: التكلفةُ المختارة **لا تنخفض أبداً** عن السابقة (مُثبتٌ
--     على ١٤٥٠ زوجاً)، فلا حجزٌ قائمٌ يصير سقفُه أضيقَ من مستحقٍّ سبق عرضُه.
--
-- ── سلامةُ الإنتاج الحيّ ───────────────────────────────────────────────────
--
-- الإنتاج يعمل على `7b3d3ee`، وهذه الهجرة تسري عليه فور تطبيقها. ولذلك:
--   • **لا توقيعَ تغيّر ولا نوعَ إرجاعٍ تغيّر** — `create or replace` وحدها،
--     بنفس الأعمدة وبنفس ترتيبها، فكلُّ نداءٍ من الكود المنشور يمرّ كما هو.
--   • **الدالةُ الجديدة لا يناديها كودٌ منشور** — تُستهلك من القاعدة وحدها.
--   • **ولا حارسَ جديد يرفض نداءً قديماً** — التغييرُ في الاختيار لا في القبول.
--
-- 🔴 **ما لا تفعله هذه الهجرة**: لا تلمس نطاقاً واحداً ولا صفَّ أسعارٍ واحداً.
--    بياناتُ المالك والشريك كما هي — القاعدةُ وحدها تغيّرت.
--
-- المرجع: D-05 · D-16 · D-19 · D-20 · D-58 · القاعدة ١٢ ·
--         `supabase/tests/nearest_route_tests.sql` · المهمة `#٤٤`.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- (١) `coverage_best_costs` — المصدرُ الوحيد لقاعدة الفوز
--
-- تُرجع **صفاً واحداً لكل (متعهد × فئة)**: القائمةُ الأقربُ مركزاً التي تُسعّر
-- تلك الفئة على هذا المسار. ولا تختار بين المتعهدين — ذلك شأنُ من يناديها.
-- ----------------------------------------------------------------------------
create or replace function public.coverage_best_costs(
  p_origin_lat numeric,
  p_origin_lng numeric,
  p_dest_lat   numeric,
  p_dest_lng   numeric
)
returns table (
  subcontractor_id uuid,
  class_slug       text,
  price_list_id    uuid,
  cost             numeric,
  origin_km        numeric,
  dest_km          numeric,
  reversed         boolean
)
language sql
stable
security definer
set search_path = ''
as $fn$
  -- الأسماءُ الداخلية مغايرةٌ عمداً لأسماء أعمدة الإرجاع (‏sid/cls/plid/…):
  -- معاملاتُ الإخراج في دالةٍ `language sql` تدخل نطاقَ الأسماء، والتطابقُ
  -- يُنتج «column reference is ambiguous» عند أول مرجعٍ غير مؤهَّل.
  select distinct on (m.sid, m.cls)
         m.sid, m.cls, m.plid, m.price_cost, m.km_o, m.km_d, m.rev
  from (
    select cm.subcontractor_id as sid,
           pli.class_slug      as cls,
           pl.id               as plid,
           pli.cost            as price_cost,
           cm.reversed         as rev,
           -- المطابقةُ المعكوسة تقلب الطرفين: مركزُ المنطلق بالنسبة لهذه
           -- الرحلة هو `dest_*` حين تكون المطابقة معكوسة.
           public.haversine_km(
             p_origin_lat, p_origin_lng,
             case when cm.reversed then pl.dest_lat else pl.origin_lat end,
             case when cm.reversed then pl.dest_lng else pl.origin_lng end
           ) as km_o,
           public.haversine_km(
             p_dest_lat, p_dest_lng,
             case when cm.reversed then pl.origin_lat else pl.dest_lat end,
             case when cm.reversed then pl.origin_lng else pl.dest_lng end
           ) as km_d
    from public.coverage_matches(p_origin_lat, p_origin_lng, p_dest_lat, p_dest_lng) cm
    join public.price_lists       pl  on pl.id = cm.price_list_id
    join public.price_list_items  pli on pli.price_list_id = pl.id
  ) m
  order by m.sid, m.cls,
           m.km_o       asc nulls last,   -- (١) الأقربُ منطلقاً
           m.km_d       asc nulls last,   -- (٢) ثم الأقربُ وجهةً
           m.price_cost asc,              -- (٣) ثم الأرخص
           m.plid       asc;              -- (٤) ثم حسمٌ ثابتٌ بالمعرّف
$fn$;

comment on function public.coverage_best_costs(numeric, numeric, numeric, numeric) is
  'الأقربُ مركزاً يفوز داخل المتعهد الواحد: صفٌّ واحد لكل (متعهد × فئة) هو القائمة '
  'الأقربُ مركزَ منطلقٍ إلى نقطة الالتقاط (ثم الأقربُ وجهةً، ثم الأرخص، ثم المعرّف). '
  'المصدرُ الوحيد لهذه القاعدة — تُفوِّض إليها quote_price و dispatch_pool ولا تُستنسخ. '
  'تكشف تكاليفَ المتعهدين، فلا تُمنح لـ anon ولا لـ authenticated أبداً (D-19/D-20).';


-- ----------------------------------------------------------------------------
-- (٢) `quote_price` — الجسمُ منقولٌ حرفياً من `pg_get_functiondef` الحيّة (D-58)
--     والتغييرُ محصورٌ في CTE واحد: `covered`.
-- ----------------------------------------------------------------------------
create or replace function public.quote_price(
  p_distance_km   numeric,
  p_passengers    integer,
  p_round_trip    boolean,
  p_waiting_hours numeric,
  p_origin_lat    numeric,
  p_origin_lng    numeric,
  p_dest_lat      numeric,
  p_dest_lng      numeric,
  p_luggage       integer default 0
)
returns table (
  class_slug          text,
  class_title         text,
  capacity            integer,
  total               numeric,
  base_fee            numeric,
  distance_cost       numeric,
  waiting_cost        numeric,
  round_trip_applied  boolean,
  peak_applied        boolean,
  min_applied         boolean,
  price_source        text,
  subcontractor_id    uuid,
  subcontractor_cost  numeric,
  margin_amount       numeric
)
language sql
stable
security definer
set search_path = ''
as $fn$
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
    -- ── 0132 · قاعدةُ الفوز صارت على مرحلتين ───────────────────────────────
    -- (١) **داخل المتعهد**: `coverage_best_costs` تحسم بالأقرب مركزاً وتُرجع
    --     صفاً واحداً لكل (متعهد × فئة). فلا تُمحى منطلقاتُه المتمايزة.
    -- (٢) **بين المتعهدين**: `min(cost)` كما كان — نحن وسيطٌ نشتري بأقلّ.
    -- وحسمُ تعادل السعر بين متعهدين صار بالمعرّف بعد أن كان غيرَ محدَّد.
    select cb.class_slug,
           min(cb.cost)                                                             as sub_cost,
           (array_agg(cb.subcontractor_id order by cb.cost, cb.subcontractor_id))[1] as sub_id
    from base b
    join lateral public.coverage_best_costs(b.o_lat, b.o_lng, b.d_lat, b.d_lng) cb on true
    where b.o_lat is not null and b.o_lng is not null
      and b.d_lat is not null and b.d_lng is not null
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
$fn$;


-- ----------------------------------------------------------------------------
-- (٣) `dispatch_pool` — الجسمُ منقولٌ حرفياً من الكتالوج الحيّ (D-58)
--     والتغييرُ محصورٌ في CTE واحد: `covered`.
--
-- 🔴 ولولا هذا الشقّ لبقي الضررُ الثالث قائماً: يُسعَّر العميلُ بالقائمة
--    الأقرب ويُعرَض على المتعهد مستحقُّ الأرخص — وهو **أسوأُ** من الحال قبل
--    الهجرة، لأن الفارق يصير هامشاً لنا من جيبه.
-- ----------------------------------------------------------------------------
create or replace function public.dispatch_pool(p_booking_id uuid, p_round integer)
returns table (subcontractor_id uuid, payout numeric)
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_b       record;
  v_olat    numeric;
  v_olng    numeric;
  v_dlat    numeric;
  v_dlng    numeric;
  v_factor  numeric := 1;
  v_ceiling numeric;
begin
  select b.class_slug, b.trip into v_b
  from public.bookings b
  where b.id = p_booking_id;

  if not found then
    return;
  end if;

  v_olat := public.jsonb_number(v_b.trip, 'originLat', null);
  v_olng := public.jsonb_number(v_b.trip, 'originLng', null);
  v_dlat := public.jsonb_number(v_b.trip, 'destLat',   null);
  v_dlng := public.jsonb_number(v_b.trip, 'destLng',   null);

  -- حجز قديم بلا إحداثيات: لا تغطية تُحسب، فيمضي إلى الطابور اليدوي
  if v_olat is null or v_olng is null or v_dlat is null or v_dlng is null then
    return;
  end if;

  -- التكلفة المطبَّقة تضربها معامل الذهاب والعودة كما يضرب السعر تماماً (0011)،
  -- وإلا قارنّا تكلفة اتجاه واحد بسقف رحلة كاملة فدخل من لا يستحق.
  if coalesce(v_b.trip ->> 'roundTrip', 'false') in ('true', 't', '1') then
    select coalesce(t.round_trip_factor, 1) into v_factor
    from public.tariffs t
    join public.vehicle_classes vc on vc.id = t.class_id
    where vc.slug = v_b.class_slug;
    v_factor := coalesce(v_factor, 1);
  end if;

  v_ceiling := public.dispatch_ceiling(p_booking_id, p_round);
  if v_ceiling is null then
    return;
  end if;

  return query
  with covered as (
    -- 0132: صفٌّ واحد لكل متعهد **بحكم الدالة** — القائمةُ الأقربُ مركزاً التي
    -- تُسعّر فئة هذا الحجز. لا `min` هنا: التجميعُ كان هو العيب بعينه، لأنه
    -- يعرض على المتعهد أرخصَ قوائمه لا القائمةَ التي تخصّ منطلقَ الرحلة.
    select cb.subcontractor_id as sid, cb.cost as cost
    from public.coverage_best_costs(v_olat, v_olng, v_dlat, v_dlng) cb
    where cb.class_slug = v_b.class_slug
  ),
  -- الأهلية كما كانت حرفياً: معتمَد · له مركبة فعّالة من الفئة · تحت السقف
  -- ⇐ 0113: **وقَبِل اتفاقية المتعهد السارية** (أو ما زال في مهلتها، أو الحاجز
  --    مطفأ من اللوحة). والشرط نداءٌ واحد لا شرطٌ مكتوبٌ هنا، فلا ينحرف عن
  --    الذي يقرؤه البورتال و`accept_offer`.
  eligible as (
    select c.sid, round(c.cost * v_factor, 2) as payout
    from covered c
    join public.subcontractors s on s.id = c.sid and s.status = 'approved'
    where exists (
            select 1
            from public.subcontractor_vehicles v
            where v.subcontractor_id = c.sid
              and v.class_slug       = v_b.class_slug
              and v.active
          )
      and round(c.cost * v_factor, 2) <= v_ceiling
      and public.partner_agreement_ok(c.sid)
  ),
  ranked as (
    select e.sid, e.payout, public.partner_available(e.sid) as avail
    from eligible e
  )
  select r.sid, r.payout
  from ranked r
  where r.avail
     or not exists (select 1 from ranked r2 where r2.avail)   -- ← الاحتياطي
  order by 2 asc, 1 asc;
end;
$fn$;


-- ----------------------------------------------------------------------------
-- (٤) المنح — `revoke` أولاً ثم الأضيق (اتفاقية ٦ · القاعدة الذهبية ١٦)
--
-- 🔴 `coverage_best_costs` دالةُ `security definer` تتجاوز RLS وتحمل
--    `subcontractor_id` **مع** `cost`. ومنحُها لـ`authenticated` هو حرفياً
--    الثغرةُ التي أُصلحت في `0011` (النمط ١ في `LESSONS.md`): كلُّ متعهدٍ
--    مستخدمٌ `authenticated`، فتصير تكاليفُ منافسيه مقروءةً بنداءٍ واحد.
--    وحدُّ المنح هنا نفسُ حدّ `coverage_matches` تماماً — فلا سطحَ جديد.
-- ----------------------------------------------------------------------------
revoke all on function public.coverage_best_costs(numeric, numeric, numeric, numeric)
  from public, anon, authenticated;
grant execute on function public.coverage_best_costs(numeric, numeric, numeric, numeric)
  to service_role;


-- ----------------------------------------------------------------------------
-- (٥) الفحصُ الذاتي — قراءةٌ محضة، بلا كتابةِ صفٍّ واحد
--
-- ⚠ ولا يثبّت رقماً يملكه المالك ولا صفَّ أسعارٍ يملكه شريك: كلُّ توكيدٍ هنا
--   **ثابتٌ بنيويّ** يصحّ مهما تغيّرت القوائم — أو حتى لو أُفرغت كلُّها.
-- ----------------------------------------------------------------------------
do $chk$
declare
  v_ok   boolean;
  v_bad  integer;
begin
  -- (٥-أ) الدالة موجودةٌ بتوقيعها، definer، وبمسار بحثٍ مثبَّت
  if to_regprocedure('public.coverage_best_costs(numeric, numeric, numeric, numeric)') is null then
    raise exception '0132 (٥-أ): coverage_best_costs غير موجودة بعد التطبيق';
  end if;

  select p.prosecdef and coalesce(array_to_string(p.proconfig, ','), '') like '%search_path=%'
    into v_ok
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'coverage_best_costs';

  if not coalesce(v_ok, false) then
    raise exception '0132 (٥-أ): coverage_best_costs ليست security definer بمسار بحثٍ مثبَّت';
  end if;

  -- (٥-ب) المنحُ مغلقٌ على anon و authenticated وعلى PUBLIC (D-20)
  select count(*) into v_bad
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  cross join lateral unnest(coalesce(p.proacl, '{}'::aclitem[])) a(item)
  where n.nspname = 'public' and p.proname = 'coverage_best_costs'
    and (a.item::text like 'anon=%' or a.item::text like 'authenticated=%' or a.item::text like '=%');

  if v_bad > 0 then
    raise exception '0132 (٥-ب): coverage_best_costs ممنوحةٌ لدورٍ عام (% منح)', v_bad;
  end if;

  -- (٥-ج) ثابتٌ بنيويّ: مجموعةُ (متعهد × فئة) بعد الحسم هي نفسُها التي تُنتجها
  --       المطابقةُ الخام ⇒ **لا تغطيةَ تُفقد ولا صفَّ يتكرر**. يُقاس على مراكز
  --       قوائمَ معتمدةٍ كما هي، ولا يثبّت أي رقمٍ من بيانات المالك.
  select count(*) into v_bad
  from (
    select pl.origin_lat as olat, pl.origin_lng as olng,
           pl.dest_lat   as dlat, pl.dest_lng   as dlng
    from public.price_lists pl
    where pl.status = 'approved'
    limit 40
  ) s
  cross join lateral (
    select
      (select count(*)
         from public.coverage_best_costs(s.olat, s.olng, s.dlat, s.dlng)) as n_best,
      (select count(distinct (cm.subcontractor_id, pli.class_slug))
         from public.coverage_matches(s.olat, s.olng, s.dlat, s.dlng) cm
         join public.price_list_items pli on pli.price_list_id = cm.price_list_id) as n_raw
  ) x
  where x.n_best <> x.n_raw;

  if v_bad > 0 then
    raise exception
      '0132 (٥-ج): % مساراً اختلف فيه عددُ (متعهد × فئة) بين الحسم والمطابقة الخام — تغطيةٌ فُقدت أو تكرّرت',
      v_bad;
  end if;

  raise notice '✔ 0132 — الأقربُ مركزاً يفوز داخل المتعهد، والأرخصُ بين المتعهدين. الفحصُ الذاتي أخضر.';
end;
$chk$;
