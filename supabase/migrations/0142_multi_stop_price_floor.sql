-- ============================================================================
-- 0142_multi_stop_price_floor.sql — أرضيةُ «لا أرخصَ من المباشر»
--
-- ── العيبُ المقيس الذي يعالجه هذا الملف ────────────────────────────────────
--
-- 0140 قرّرت أن **رحلةً ذاتَ محطاتٍ وسطى لا تُسعَّر من قائمة متعهد** (شرطُ
-- `and not b.has_stops` في CTE `covered`)، والغرضُ حمايةُ المتعهد من أن يقود
-- أطولَ بمستحقٍّ لم يتغيّر. **وأثرُها على قوائم بدر المعتمدة عكسُ غرضها**،
-- مقيساً على القاعدة الحيّة قبل هذا الملف (١٠٠ زوجٍ مغطّى، محطةٌ في منتصف
-- المسافة تماماً، مسافةٌ = الوتر × ١٫٣):
--
--     أزواجٌ مغطّاة (منطلق × وجهة × فئة) ..................... ١٠٠
--     يهبط سعرُها بإضافة محطة .............................. ٣١
--     متوسط الهبوط ......................................... −١٥٫٤٨٪
--     تبيع **دون تكلفة المتعهد** ........................... ١٢
--     أسوأ هبوط ............................................ −١٢٠٦ ج
--
-- والآليّة: خروجُ الرحلة من مسار التغطية يُسقطها إلى التعريفة، **والتعريفةُ
-- على ممرٍّ قصيرٍ مغطّى أرخصُ من سعرِ المتعهد + الهامش**. فمحطةٌ في منتصف
-- الطريق تُسقط الفاتورة، وقد تبيع دون التكلفة.
--
-- وعيبٌ ثانٍ يتفرّع منه: `dispatch_ceiling` تشتقّ سقفَها من الإجمالي المنخفض،
-- فيقلّ عن تكلفة المتعهد المُدرجة ⇒ `dispatch_pool` تُرجع **صفرَ متعهد** ⇒
-- كلُّ حجزٍ بمحطةٍ على ممرٍّ مغطّى إسنادٌ يدويّ.
--
-- ── القاعدةُ الجديدة ───────────────────────────────────────────────────────
--
-- 🔴 **إجمالي رحلةٍ ذاتِ محطات = الأكبر من:**
--    (أ) **تعريفةُ الأرجل الحقيقية** — وهو ما تفعله `quote_price` منذ 0140، و
--    (ب) **سعرُ نفسِ الرحلة لو كانت بنقطتين** — نفسُ المنطلق والوجهة والفئة
--        والركاب والحقائب والانتظار والذهاب-والعودة، **وبمسافةِ المسار
--        المباشر** لا مسافةِ الأرجل.
--
-- **ولماذا هي صوابٌ لا تبسيط:**
--   · **بديهةٌ حسابية لا سياسةُ تسعير**: رحلةٌ أطولُ لا تكلّف أقلَّ من الأقصر
--     التي تحتويها. ولا يُخترع بها رقمٌ من عدم: (ب) هو الرقمُ الذي **يبيع به
--     الموقعُ اليوم** نفسَ المنطلق ونفسَ الوجهة.
--   · **وتُنصف المتعهد** — وهو غرضُ 0140 الأصلي: `dispatch_ceiling` تشتقّ من
--     الإجمالي، فمستحقُّه يصير متدرّجاً بالطول الحقيقيّ **بأرضيةٍ عند مبلغ
--     المسار المباشر**. محطةٌ على الطريق ⇒ كالمباشر · انحرافٌ حقيقيّ ⇒ أكثر.
--   · **وتُحيي البثّ**: السقفُ يعود فوق تكلفته المُدرجة فلا يسقط الحجزُ إلى
--     الطابور اليدوي.
--
-- 🔒 **وما لا تفعله**: لا تُعيد الرحلةَ ذاتَ المحطات إلى مسار قوائم المتعهدين.
--    `price_source` تبقى `tariff`، و`subcontractor_id`/`subcontractor_cost`/
--    `margin_amount` تبقى `null` — أي أن قرار 0140 قائمٌ بحرفه، والأرضيةُ
--    **حدٌّ أدنى للإجمالي** لا مصدرُ تسعيرٍ ثالث.
--
-- ── المسائلُ الأربع التي حُسمت بقياس ───────────────────────────────────────
--
-- **(١) كيف تُحسب (ب) بلا استنساخِ منطق؟ — القاعدة ١٢**
--   `quote_price` جسمٌ طويل فيه أرضيةُ الفئة والانتظار ومعامل الذهاب والعودة
--   والذروة والهامش. نسخةٌ ثانية منه كارثة. ⇒ **تنادي `quote_price` نفسَها**
--   بنفس الوسائط مع `p_stops = null` وبالمسافة المباشرة.
--
--   🔴 **وانعدامُ العَود اللانهائي مفروضٌ بنيوياً لا بالثقة، بحاجزين:**
--     · **الحاجزُ الأول (حاسم بذاته)**: النداءُ الداخليّ يمرّر `p_stops = null`
--       دائماً ⇒ `has_stops = false` في المستوى الثاني ⇒ `direct_args` هناك
--       **صفرُ صفوف** ⇒ لا مستوى ثالث. فالعمقُ محدودٌ بـ٢ **بحكم الوسيط**،
--       مهما فعل المخطِّط.
--     · **والحاجزُ الثاني**: `direct_args` مبنيّةٌ من `(select * from base
--       where has_stops)` **و`as materialized`** — فهي عقدةٌ مستقلّة تُقيَّم
--       بمفردها، ونداءُ الدالة هو الطرفُ **الداخليّ** لحلقةٍ متداخلة طرفُها
--       الخارجيّ صفرُ صفوف. وحلقةٌ بلا صفٍّ خارجيّ لا تُنفّذ داخلَها أبداً.
--   ⚠ ولا يكفي `where has_stops` في نهاية الاستعلام: المخطِّط قد يرفع نداء
--     الدالة فوق المرشِّح. ولذلك المرشِّحُ **داخل** العقدة المادّية.
--
-- **(٢) ومن أين تأتي المسافةُ المباشرة؟ — قِيس ما هو متاحٌ فعلاً**
--   داخل `quote_price` لا يوجد إلا: `p_distance_km` (طريقٌ حقيقيّ متعدد
--   الأرجل)، والإحداثيات الأربع، و`p_stops`. **ولا وجودَ للمسافة الطرقية
--   المباشرة**: لقطةُ الرحلة تحمل `distanceKm` و`straightKm` وكلاهما صار
--   مجموعَ الأرجل منذ 0140، و`distance_cache` مفتاحُه زوجُ نقطتين وقراءتُه
--   داخل التسعير تجعل السعرَ دالةً في محتوى كاش — رفضٌ صريح.
--
--   ⇒ تُشتقّ **بنسبةٍ من المقيس**، بلا معاملٍ جديد وبلا تغييرِ توقيع:
--
--       المباشرةُ ≈ مسافةُ الأرجل × (وترُ منطلق⇒وجهة ÷ مجموعِ أوتار الأرجل)
--
--   أي أن نسبةَ الطريق إلى الخط المستقيم — وهي خاصيّةُ الشبكة في تلك المنطقة —
--   تُحفظ كما قيست على المسار نفسِه.
--
--   🔒 **وحدُّ هذا التقدير معلنٌ ومقيس، وهو أنه لا يؤثّر في أي قرار:**
--     · مثلثياً `وتر المباشر ≤ مجموع أوتار الأرجل` ⇒ **المسافةُ المقدَّرة
--       ≤ مسافةُ الأرجل دائماً**.
--     · وفرعُ التعريفة رتيبٌ في المسافة (`base_fee + km × per_km`) ⇒ سعرُ
--       المباشر **بالتعريفة** ≤ سعرُ الأرجل بالتعريفة ⇒ **الأرضيةُ لا تمسك
--       أبداً على ممرٍّ غير مغطّى** — لا شيء يُخترع من عدم.
--     · وفرعُ المتعهد (وهو الوحيد الذي تمسك عنده الأرضيةُ فعلاً)
--       **لا يقرأ المسافة إطلاقاً**: `raw_subtotal = sub_cost + margin`.
--       ⇒ دقّةُ التقدير **لا تغيّر رقماً واحداً** في الحالة التي تعمل فيها.
--     · ومحطةٌ على استقامة الطريق ⇒ النسبةُ = ١ بالضبط ⇒ المسافةُ المقدَّرة
--       = المقيسة ⇒ الإجمالي = إجماليُّ المباشر **بالضبط** لا تقريباً.
--   ⚠ ولو ورد يوماً مصدرٌ حقيقيّ للمسافة الطرقية المباشرة، فمكانُه معاملٌ
--     جديدٌ بافتراضيّ (‏`drop` ثم `create` مع إعادةِ المنح حرفاً) — وهو ما
--     لم يلزم اليوم، فلم يُدفع ثمنُه.
--
-- **(٣) و`create_booking`؟ — لا حرفَ فيها يتغيّر، وهذا هو المقصود**
--   هي تأخذ `q.total` من `quote_price` نفسِها (‏(ب) في جسمها) ⇒ الإجمالي
--   المخزَّن في اللقطة **هو المُؤرَّض تلقائياً**. ولأن الأرضية داخل المحرّك لا
--   فوقه، يستحيل أن نسعّر بمبلغٍ ونحجز بآخر: `quote_public` و`create_booking`
--   و`admin_quote_preview` كلُّها تمرّ من الباب نفسه (القاعدة ١٢).
--
-- **(٤) و`price_source` — تبقى `tariff`، والمبرَّرُ ثلاثة أوجه**
--   · **ما تعنيه هذه الراية عند كلِّ من يتصرّف بها** ليس «من أين جاء الرقم
--     حسابياً» بل «**هل على هذا الحجز مرجعُ تكلفةٍ مجمَّد**»:
--     `dispatch_ceiling` تتفرّع حرفياً على
--     `price_source = 'subcontractor' and subcontractor_cost is not null`،
--     واللوحة تُظهر المتعهد والتكلفة والهامش بالشرط نفسه، والمقاصةُ تقرأ
--     الأعمدة لا الراية. وحجزٌ بمحطاتٍ **لا مرجعَ تكلفةٍ عليه**: لا متعهدَ
--     سعّر هذا المسار، والأعمدة الثلاثة `null`. فوسمُ `subcontractor` هو
--     الكذبُ الحقيقيّ، ويُفسد اشتقاقَ السقف معه.
--   · **وقيمةٌ ثالثة تُنتج جملةً كاذبة على الشاشة**، مقيسةً بالقراءة لا
--     بالظنّ: `app/admin/orders/[id]/page.tsx:2345` يمرّ كلَّ قيمةٍ غيرِ
--     `subcontractor|tariff` عبر `isPriceSource` ⇒ `null` ⇒ يطبع «**لا لقطة
--     مصدر سعر لهذا الحجز — أُنشئ قبل تفعيل نظام المتعهدين، أو أن هجرة
--     المرحلة ٥ لم تُطبَّق**»، وهي جملةٌ باطلة عن حجزٍ لقطتُه كاملة؛
--     و`app/api/quote/route.ts:298` يُسقط `priceSource` من حمولة المتصفح.
--     وهذا هو نمطُ الفشل ٢ في `LESSONS.md` بعينه، وجبهةُ `lib/` و`app/`
--     ليست لهذه الهجرة فلا يمكن إصلاحُ القارئ معها.
--   · ⚠ **والثمنُ المقبولُ صراحةً**: صفُّ الحجز لا يحمل أثراً يميّز «أُرضيَ»
--     من «تعريفةٌ محضة» — العمودان `base_fee`/`distance_cost` (حيث يظهر
--     الفارق: الأرضيةُ تجعلهما شكلَ صفِّ متعهد) يعيشان في مخرَج `quote_price`
--     ولا يُخزَّنان في `bookings` أصلاً. وإضافةُ عمودٍ لذلك تستلزم توسيعَ نوع
--     إرجاع `quote_price` ⇒ `drop` + `create` ⇒ مخاطرةُ المنح و42725 بلا
--     قارئٍ يستفيد اليوم. **مسجَّلٌ في التقرير قراراً لبدر لا سهواً.**
--
-- ── 🔒 التوافقُ الرجعيّ — شرطٌ لا يُساوَم ─────────────────────────────────
--
--   · **لا تغييرَ في التوقيع ولا في نوع الإرجاع** ⇒ `create or replace` وحدها،
--     **بلا `drop`** ⇒ المنحُ لا يُمسّ أصلاً ولا يُعاد بناؤه (وسابقتا `0139`
--     و`0140` اللتان فقدتا المنحَ بالإسقاط لا تتكرران هنا). و(٢-ج) يقيس ذلك.
--   · **رحلةٌ بلا محطاتٍ ⇒ نفسُ الرقم بالضبط**: `direct_args` صفرُ صفوف ⇒
--     `floor_wins` تساوي `false` بالـ`left join` ⇒ كلُّ عمودٍ يُؤخذ من فرع
--     الأرجل، وهو ناتجُ 0140 **حرفاً بحرف**. والقسم (ف) في المجموعة يقيسها
--     على خمسة ممرّاتٍ حقيقية من قوائم المالك.
--   · **ولا عبء على المسار الشائع**: بلا محطاتٍ لا يُنادى `haversine_km` ولا
--     `trip_straight_km` ولا `quote_price` مرةً ثانية — العقدةُ المادّية
--     فارغة فلا يُقيَّم داخلُها.
--
-- ── D-58 حرفياً: من أين نُقل الجسم ─────────────────────────────────────────
--
-- جسمُ `quote_price` منقولٌ من **الكتالوج الحيّ** (`pg_get_functiondef`) لا من
-- ملفِّ 0140. والفارقُ عن المُنتَج الحيّ محصورٌ في **إضافةِ أربع CTEs في آخر
-- الاستعلام** (`legs` · `direct_args` · `direct` · `merged`) وإعادةِ توجيه
-- الاختيار النهائي إليها. **ولا حرفَ يتغيّر** في `base` ولا `settings` ولا
-- `eligible` ولا `covered` ولا `joined` ولا `margined` ولا `priced` ولا
-- `floored` ولا `finalized` ولا `visibility` — والقسم (٢-هـ) يحرس سبعةَ شواهدَ
-- على ما كان قائماً: `as materialized` (0112) · شرطُ الحقائب (0031) · حسمُ
-- التعادل (0132) · شرطُ `not b.has_stops` (0140) · حاجبُ الأرقام الداخلية
-- (0011) · معادلةُ الهامش · معاملُ الذهاب والعودة على التكلفة.
--
-- ── ما لم يُمسّ بحرف ───────────────────────────────────────────────────────
--
-- `coverage_matches` · `coverage_best_costs` · `dispatch_pool` ·
-- `dispatch_ceiling` · `create_booking` · `quote_public` · `trip_straight_km`
-- — يُبصَم أوّلُها الأربعةُ في (٠) ويُقارن في (٢-أ).
--
-- ── ما لم يُبنَ ولماذا (D-39) ──────────────────────────────────────────────
--
--   · **مستحقُّ المتعهد نفسُه لا يتدرّج بعد**: `dispatch_pool` تعرض عليه
--     `cost × معامل الذهاب والعودة` من **قائمته**، والسقفُ بوّابةُ أهليةٍ لا
--     مبلغُ عرض. فالأرضيةُ تُعيده إلى دائرة الأهلية (وهو المطلوب هنا)، أما
--     رفعُ مستحقّه على الانحراف فيمسّ `price_list_items` ودالةَ القبول وعرضَ
--     المقاصة معاً — **قرارُ مالكٍ**، وهو نفسُ ما أجّلته 0140 صراحةً.
--   · **أرضيةُ الهامش (D-16) ما زالت لا تحرس رحلةَ المحطات**: تُقاس على مرجع
--     تكلفة، ورحلةُ التعريفة بلا مرجع. والأرضيةُ هنا تسدّ الأثرَ العمليّ (لا
--     بيعَ دون تكلفة المتعهد على ممرٍّ مغطّى) ولا تسدّ الفجوةَ البنيوية.
--
-- المرجع: `0140` · `0141` · D-05 · D-09 · D-10 · D-11 · D-14 · D-16 · D-19 ·
--         D-20 · D-54 · D-58 · `CONVENTIONS §٦` · `LESSONS` النمطان ٢ و٩.
-- الاختبار: supabase/tests/multi_stop_tests.sql — الأقسام (م) و(ن) و(ص) و(ف).
-- آمنة لإعادة التنفيذ بالكامل.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (٠) بصمةُ ما يجب ألّا يُمسّ — **قبل** أي عمل
--
-- ⚠ `set_config(..., false)` (‏جلسة) لا `true` (‏معاملة): `db-migrate.mjs` يلفّ
--   الملف في `begin … commit` فيعمل الاثنان، أما التشغيل اليدوي من psql بلا
--   معاملة فتضيع فيه القيمة المحليّة بين البيانين. (نفسُ (٠) في 0140.)
-- ----------------------------------------------------------------------------
do $$
begin
  perform set_config('tours.m0142_cov_best',
    md5(pg_get_functiondef('public.coverage_best_costs(numeric,numeric,numeric,numeric)'::regprocedure)), false);
  perform set_config('tours.m0142_pool',
    md5(pg_get_functiondef('public.dispatch_pool(uuid,integer)'::regprocedure)), false);
  perform set_config('tours.m0142_ceiling',
    md5(pg_get_functiondef('public.dispatch_ceiling(uuid,integer)'::regprocedure)), false);
  -- ⚠ الأقواسُ حول السَّلسلة قبل `::regprocedure` **لازمة**: `::` أوثقُ ارتباطاً
  --   من `||`، فبدونها يُقاس الشطرُ الثاني وحدَه ويسقط الملفُّ بـ«expected a
  --   left parenthesis» — وهو خطأٌ يقع عند التطبيق لا عند الكتابة.
  perform set_config('tours.m0142_create_booking',
    md5(pg_get_functiondef(
      ('public.create_booking(jsonb,jsonb,integer,boolean,numeric,numeric,numeric,text,text,text,'
       || 'text,text,text,timestamptz,text,text,timestamptz,integer,jsonb,integer,text,jsonb)')::regprocedure)), false);
  perform set_config('tours.m0142_quote_public',
    md5(pg_get_functiondef(
      'public.quote_public(numeric,integer,boolean,numeric,numeric,numeric,numeric,numeric,text,integer,jsonb,jsonb)'::regprocedure)), false);
end;
$$;

-- ----------------------------------------------------------------------------
-- (١) 🔴 `quote_price` — الأرضيةُ داخل المحرّك لا فوقه
--
-- 🔒 **`create or replace` بلا `drop`**: التوقيعُ ونوعُ الإرجاع كما هما حرفاً،
--    فلا تحميلَ ثانٍ يُنشَأ (‏42725) ولا منحةَ تُمحى فتعود منحةُ Supabase
--    الافتراضية لـ`anon`/`authenticated`. وهذا وحدَه يُسقط أخطرَ ما في الملف.
--    و(٢-ج) و(٢-د) يقيسان الطرفين: العددَ والمنح.
--
-- ⚠ **ولا تُحذف كتلةُ `revoke`/`grant` من هنا سهواً** — هي غائبةٌ **بقصد**:
--   `create or replace` لا تمسّ `proacl` أصلاً، وإعادةُ كتابتها كانت ستوهم
--   القارئَ التالي أن الإسقاط وقع.
-- ----------------------------------------------------------------------------
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
returns table(
  class_slug text, class_title text, capacity integer, total numeric,
  base_fee numeric, distance_cost numeric, waiting_cost numeric,
  round_trip_applied boolean, peak_applied boolean, min_applied boolean,
  price_source text, subcontractor_id uuid, subcontractor_cost numeric,
  margin_amount numeric
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
  -- ── المسافةُ المباشرة المقدَّرة، وحدُّها معلن ──────────────────────────────
  --   `s_direct ÷ s_multi ≤ 1` مثلثياً ⇒ `direct_km ≤ distance_km` دائماً ⇒
  --   فرعُ التعريفة في النداء الداخليّ **لا يفوق** فرعَ الأرجل أبداً، فالأرضيةُ
  --   لا تمسك إلا حين يكون المباشرُ **مغطّى** — وفرعُ المتعهد لا يقرأ المسافة.
  --   و`s_multi = 0` (منطلقٌ ووجهةٌ ومحطاتٌ على نقطةٍ واحدة) تسقط إلى المقيس.
  direct_args as materialized (
    select
      case when g.s_multi > 0 and g.s_direct is not null
           then b0.distance_km * g.s_direct / g.s_multi
           else b0.distance_km
      end                as direct_km,
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

comment on function public.quote_price(
  numeric, integer, boolean, numeric, numeric, numeric, numeric, numeric, integer, jsonb) is
  'محرّك التسعير (D-05 · D-11). منذ 0140 يقبل p_stops: رحلةٌ بمحطاتٍ وسطى **لا تدخل مسار تغطية المتعهدين إطلاقاً** وتُسعَّر بالتعريفة على المسافة متعددة الأرجل — لأن المتعهد سعّر مساراً مباشراً ومستحقُّه لا يتغيّر بانحراف. ومنذ 0142 عليها **أرضية «لا أرخصَ من المباشر»**: الإجمالي = الأكبر من تعريفة الأرجل وسعرِ نفسِ الرحلة بنقطتين على المسافة المباشرة (تُشتق نسبياً من الأرجل بالوتر) — لأن رحلةً أطولَ لا تكلّف أقلَّ من الأقصر التي تحتويها، ولأن السقف يُشتق من الإجمالي فالمنخفضُ يُخرج المتعهد المغطّي من البثّ. والأرضيةُ حدٌّ أدنى للإجمالي لا مصدرُ تسعير: price_source تبقى tariff و subcontractor_id/cost و margin_amount تبقى null. محجوبة عن anon و authenticated: تحمل التكلفة والهامش في نوع إرجاعها (D-20).';

-- ----------------------------------------------------------------------------
-- (٢) الفحوصُ الذاتية — كلُّها **سلوكٌ** لا شكل، إلا حيث يكون الشكلُ هو الخطر
-- ----------------------------------------------------------------------------

-- (٢-أ) لم تُمسّ الدوالُّ الخمس المجاورة
do $$
declare v_bad text := '';
begin
  if md5(pg_get_functiondef('public.coverage_best_costs(numeric,numeric,numeric,numeric)'::regprocedure))
     is distinct from current_setting('tours.m0142_cov_best', true)
  then v_bad := v_bad || 'coverage_best_costs، '; end if;

  if md5(pg_get_functiondef('public.dispatch_pool(uuid,integer)'::regprocedure))
     is distinct from current_setting('tours.m0142_pool', true)
  then v_bad := v_bad || 'dispatch_pool، '; end if;

  if md5(pg_get_functiondef('public.dispatch_ceiling(uuid,integer)'::regprocedure))
     is distinct from current_setting('tours.m0142_ceiling', true)
  then v_bad := v_bad || 'dispatch_ceiling، '; end if;

  if md5(pg_get_functiondef(
       ('public.create_booking(jsonb,jsonb,integer,boolean,numeric,numeric,numeric,text,text,text,'
        || 'text,text,text,timestamptz,text,text,timestamptz,integer,jsonb,integer,text,jsonb)')::regprocedure))
     is distinct from current_setting('tours.m0142_create_booking', true)
  then v_bad := v_bad || 'create_booking، '; end if;

  if md5(pg_get_functiondef(
       'public.quote_public(numeric,integer,boolean,numeric,numeric,numeric,numeric,numeric,text,integer,jsonb,jsonb)'::regprocedure))
     is distinct from current_setting('tours.m0142_quote_public', true)
  then v_bad := v_bad || 'quote_public، '; end if;

  if v_bad <> '' then
    raise exception '0142 (٢-أ): 🔴 هذه الهجرة غيّرت دالةً لا تخصّها — %', rtrim(v_bad, '، ');
  end if;
end;
$$;

-- (٢-ب) 🔴 **تحميلٌ واحدٌ لا اثنان** — وهو الخطرُ الشكليّ الوحيد الذي يستحق فحصاً
--
-- إضافةُ معاملٍ بافتراضيٍّ تُنشئ تحميلاً ثانياً بدل أن تستبدل الأول، فيصير
-- نداءُ الكود المنشور ملتبساً (‏42725) وينهار الإنتاج لحظتَها. والعددُ الصحيح
-- **ثلاثة**: تحميلا التوافق (٤ و٥ وسائط، منذ 0012) والتحميلُ الكامل (١٠).
do $$
declare v_n integer;
begin
  select count(*) into v_n
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'quote_price';

  if v_n <> 3 then
    raise exception
      '0142 (٢-ب): 🔴 عددُ تحميلات quote_price % لا ٣ — نداءٌ ملتبس (42725) ينتظر الإنتاج', v_n;
  end if;

  if to_regprocedure(
       'public.quote_price(numeric,integer,boolean,numeric,numeric,numeric,numeric,numeric,integer,jsonb)'
     ) is null then
    raise exception '0142 (٢-ب): 🔴 التحميلُ العشاريّ اختفى — quote_public و create_booking بلا محرّك';
  end if;
end;
$$;

-- (٢-ج) والمنحُ كما كان **لأن الإسقاط لم يقع** — الطرفان يُقاسان لا أحدُهما
do $$
declare
  v_qp constant text :=
    'public.quote_price(numeric,integer,boolean,numeric,numeric,numeric,numeric,numeric,integer,jsonb)';
begin
  if has_function_privilege('anon', v_qp, 'execute')
     or has_function_privilege('authenticated', v_qp, 'execute') then
    raise exception
      '0142 (٢-ج): 🔴 quote_price انفتحت لدورِ متصفّح — متعهدٌ يقرأ تكاليفَ منافسيه (D-20)';
  end if;
  if not has_function_privilege('service_role', v_qp, 'execute') then
    raise exception
      '0142 (٢-ج): 🔴 quote_price لم تعد متاحةً لـservice_role — الموقعُ لا يسعّر ولا يحجز';
  end if;
end;
$$;

-- (٢-د) 🔴 لا عَود لانهائي — يُقاس **سلوكاً**: نداءٌ بمحطةٍ يعود بصفوف
--
-- لو انكسر الحاجزُ لَما رجع هذا النداءُ أصلاً — ينتهي بـ«stack depth limit
-- exceeded» (‏54001) بعد ثوانٍ. فنجاحُه هو البرهان، وفشلُه صاخبٌ لا صامت.
do $$
declare
  v_n integer;
begin
  select count(*) into v_n
  from public.quote_price(
    120, 1, false, 0, 30.10, 31.30, 29.95, 31.25, 0,
    '[{"label":"محطة فحص 0142","lat":30.02,"lng":31.28}]'::jsonb);

  if v_n < 1 then
    raise exception '0142 (٢-د): نداءٌ بمحطةٍ لم يُرجع صفاً — لا فئةَ نشطة أو انكسر المحرّك';
  end if;
end;
$$;

-- (٢-هـ) 🔴 سبعةُ شواهدَ على **ما كان قائماً** لا على ما أُضيف (D-58)
--
-- الجسمُ نُقل من الكتالوج الحيّ، والخطرُ في النقل هو **إسقاطُ إصلاحٍ سابق
-- بصمت** — وهو بعينه الانحدارُ الحرج الذي كتب D-58. فتُقرأ سبعُ بصماتٍ من
-- `pg_get_functiondef` لدوالَّ سابقة، ولا واحدةٌ منها من عمل هذه الهجرة.
do $$
declare
  v_def  text := pg_get_functiondef(
    'public.quote_price(numeric,integer,boolean,numeric,numeric,numeric,numeric,numeric,integer,jsonb)'::regprocedure);
  v_miss text := '';
begin
  if position('as materialized' in v_def) = 0
  then v_miss := v_miss || '0112 (as materialized)، '; end if;

  if position('luggage_capacity >= b.luggage' in v_def) = 0
  then v_miss := v_miss || '0031 (شرط الحقائب)، '; end if;

  if position('order by cb.cost, cb.subcontractor_id' in v_def) = 0
  then v_miss := v_miss || '0132 (حسمُ التعادل)، '; end if;

  if position('not b.has_stops' in v_def) = 0
  then v_miss := v_miss || '0140 (المحطاتُ خارج التغطية)، '; end if;

  if position('pricing_internals_visible' in v_def) = 0
  then v_miss := v_miss || '0011 (حاجبُ الأرقام الداخلية)، '; end if;

  if position('margin_min_amount' in v_def) = 0
  then v_miss := v_miss || 'أرضيةُ الهامش، '; end if;

  if position('f.sub_cost * (case when f.round_trip then f.round_trip_factor else 1 end)' in v_def) = 0
  then v_miss := v_miss || 'معاملُ الذهاب والعودة على التكلفة، '; end if;

  if v_miss <> '' then
    raise exception
      '0142 (٢-هـ): 🔴 النقلُ من الكتالوج أسقط إصلاحاً سابقاً — %', rtrim(v_miss, '، ');
  end if;
end;
$$;

-- (٢-و) 🔴 الأرضيةُ تمسك على **كلّ** قوائم المالك المعتمدة — الشاهدُ الأقوى
--
-- لا زوجٌ واحدٌ مختار (فقد يقع على زوجٍ لم يكن يهبط أصلاً فيمرّ التوكيدُ فارغاً)
-- بل **جردٌ كامل**: لكل (منطلق × وجهة × فئة) مغطّى تُقاس رحلتُه بمحطةٍ في منتصف
-- المسافة تماماً — انحرافُها صفرٌ عملياً — وتُقارن برحلتها بلا محطة.
--
-- 🔴 والشرطُ: **لا زوجٌ يهبط**. وقبل هذا الملف كان ٣١ من ١٠٠ يهبط بمتوسط
--    −١٥٫٤٨٪ ومنها ١٢ تبيع دون تكلفة المتعهد (مقيسٌ على القاعدة الحيّة).
--
-- ⚠ ويُتخطّى بإشعارٍ صريح لا بصمت حين لا تغطيةَ معتمدة على القاعدة (نسخةٌ
--   جديدة من الـwhitelabel مثلاً) — تخطٍّ مُعلَنٌ خيرٌ من توكيدٍ يمرّ فارغاً.
do $$
declare
  v_pairs integer;
  v_drops integer;
  v_lift  integer;
  v_worst numeric;
begin
  with pairs as (
    select distinct
      pl.origin_lat as olat, pl.origin_lng as olng,
      pl.dest_lat   as dlat, pl.dest_lng   as dlng,
      pli.class_slug as cls, pli.cost as cost
    from public.price_lists pl
    join public.price_list_items pli on pli.price_list_id = pl.id
    where pl.status = 'approved'
      and pl.origin_lat is not null and pl.origin_lng is not null
      and pl.dest_lat   is not null and pl.dest_lng   is not null
  ),
  m as (
    select p.*,
           public.haversine_km(p.olat, p.olng, p.dlat, p.dlng) * 1.3 as km,
           jsonb_build_array(jsonb_build_object(
             'label', 'منتصف',
             'lat',   (p.olat + p.dlat) / 2,
             'lng',   (p.olng + p.dlng) / 2)) as mid
    from pairs p
  ),
  q as (
    select
      m.cls,
      (select x.total from public.quote_price(m.km, 1, false, 0, m.olat, m.olng, m.dlat, m.dlng, 0, null) x
        where x.class_slug = m.cls)        as t_plain,
      (select x.price_source from public.quote_price(m.km, 1, false, 0, m.olat, m.olng, m.dlat, m.dlng, 0, null) x
        where x.class_slug = m.cls)        as s_plain,
      (select x.total from public.quote_price(m.km, 1, false, 0, m.olat, m.olng, m.dlat, m.dlng, 0, m.mid) x
        where x.class_slug = m.cls)        as t_stop,
      -- تعريفةُ الأرجل وحدها — وهو ما كانت تعطيه 0140 لهذه الرحلة بالضبط
      -- (بلا إحداثيات ⇒ بلا تغطية ⇒ المسارُ القائم منذ 0012)
      (select x.total from public.quote_price(m.km, 1, false, 0, null, null, null, null, 0, null) x
        where x.class_slug = m.cls)        as t_tariff
    from m
  )
  select count(*) filter (where q.s_plain = 'subcontractor'),
         count(*) filter (where q.s_plain = 'subcontractor' and q.t_stop < q.t_plain),
         count(*) filter (where q.s_plain = 'subcontractor' and q.t_stop > q.t_tariff),
         min(q.t_stop - q.t_plain) filter (where q.s_plain = 'subcontractor')
    into v_pairs, v_drops, v_lift, v_worst
  from q;

  if coalesce(v_pairs, 0) = 0 then
    raise notice '0142 (٢-و): لا زوجَ مغطّى بقائمةٍ معتمدة على هذه القاعدة — يُتخطّى الجردُ الحيّ';
    return;
  end if;

  if v_drops > 0 then
    raise exception
      '0142 (٢-و): 🔴 % زوجاً من % ما زال يهبط سعرُه بمحطةٍ في منتصف الطريق (أسوأها % ج) — الأرضيةُ لا تمسك',
      v_drops, v_pairs, v_worst;
  end if;

  raise notice
    '✔ 0142 (٢-و) جردٌ حيّ: % زوجاً مغطّى · صفرُ هبوط · % منها رفعتها الأرضيةُ فوق تعريفة الأرجل',
    v_pairs, v_lift;
end;
$$;

-- (٢-ز) ولا شيءَ يتغيّر حيث لا يجب: ممرٌّ **بلا تغطية** + محطة ⇒ تعريفةُ الأرجل
--
-- 🔴 توكيدٌ يمنع الأرضيةَ أن تخترع رقماً من عدم: بلا تغطيةٍ يكون النداءُ
--    الداخليّ تعريفةً على مسافةٍ **أقصر** (‏`s_direct ≤ s_multi` مثلثياً)،
--    وفرعُ التعريفة رتيبٌ في المسافة ⇒ لا يفوز أبداً. ولو أُسقطت نسبةُ الوتر
--    وصارت المسافةُ المباشرة = مسافةَ الأرجل، لبقي هذا السطرُ أخضرَ — ولذلك
--    يُقاس معه في (٢-ح) أن النسبةَ نفسَها ليست زينة.
do $$
declare
  v_no_stop numeric;
  v_stop    numeric;
  v_src     text;
  v_stops   constant jsonb := '[{"label":"محطة","lat":25.90,"lng":29.10}]'::jsonb;
begin
  select q.total, q.price_source into v_no_stop, v_src
  from public.quote_price(200, 1, false, 0, 26.00, 28.00, 25.80, 29.90, 0, null) q
  order by q.capacity limit 1;

  if v_no_stop is null then
    raise notice '0142 (٢-ز): لا فئةَ نشطة — يُتخطّى';
    return;
  end if;
  if v_src <> 'tariff' then
    raise notice '0142 (٢-ز): الممرُّ الصحراويّ صار مغطّى («%») — يُتخطّى ولا يُضعَّف التوكيد', v_src;
    return;
  end if;

  select q.total into v_stop
  from public.quote_price(200, 1, false, 0, 26.00, 28.00, 25.80, 29.90, 0, v_stops) q
  order by q.capacity limit 1;

  if v_stop is distinct from v_no_stop then
    raise exception
      '0142 (٢-ز): 🔴 على ممرٍّ بلا تغطية اختلف الإجمالي بمحطة (%) عنه بلا محطة (%) — الأرضيةُ تخترع رقماً',
      v_stop, v_no_stop;
  end if;
end;
$$;

-- (٢-ح) 🔴 والمسافةُ المباشرة **تُشتقّ فعلاً** ولا تساوي مسافةَ الأرجل
--
-- الشرطُ الذي يجعل (٢-ز) ذا أسنان: لو أُسقطت نسبةُ الوتر لصار النداءُ الداخليّ
-- على مسافة الأرجل نفسِها. ويُقاس ذلك **سلوكاً** بحالةٍ يفترق فيها الرقمان:
-- ممرٌّ بلا تغطية بانحرافٍ كبير ⇒ تعريفةُ المباشر يجب أن تكون **أقلَّ بوضوح**
-- من تعريفة الأرجل، فتظهر الأرضيةُ عاجزةً عن المسّ — وهو المطلوب.
-- والقياسُ على `trip_straight_km` مباشرةً: هي مصدرُ النسبة.
do $$
declare
  v_direct numeric := public.haversine_km(26.00, 28.00, 25.80, 29.90);
  v_multi  numeric := public.trip_straight_km(26.00, 28.00, 25.80, 29.90,
                        '[{"label":"محطة","lat":25.90,"lng":29.10}]'::jsonb);
begin
  if v_direct is null or v_multi is null or v_multi <= 0 then
    raise exception '0142 (٢-ح): تعذّر قياسُ الوترين (% · %)', v_direct, v_multi;
  end if;
  if v_direct > v_multi then
    raise exception
      '0142 (٢-ح): 🔴 الوترُ المباشر (%) أطولُ من مجموع أوتار الأرجل (%) — انكسرت متباينةُ المثلث التي تقوم عليها الأرضية',
      v_direct, v_multi;
  end if;
end;
$$;
