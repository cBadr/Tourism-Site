-- ============================================================================
-- 0140_multi_stop_trips.sql — محطاتٌ وسطى في الرحلة: لقطةً وتسعيراً وبثّاً
--
-- ── القرار المُلزِم الذي يقوم عليه الملف كلّه ───────────────────────────────
--
-- 🔴 **رحلةٌ ذاتُ محطاتٍ وسطى لا تُسعَّر من قائمة أسعار متعهد إطلاقاً.**
--
-- والسبب ماليٌّ لا واجهيّ: المتعهد سعّر في `price_list_items` **مساراً مباشراً**
-- من منطلقٍ إلى وجهة. ورحلةٌ بمحطةٍ وسطى أطولُ زمناً ومسافةً، ومستحقُّه لا
-- يتغيّر — فندفع له ثمن رحلةٍ قصيرة ويقود أطول. وهو **نقضٌ عمليّ للاتفاقية**
-- ولو لم يذكره بندٌ صراحةً. ولا يجوز أن نقرّر عنه ثمنَ انحرافٍ لم يره.
--
-- ⇒ الرحلةُ بمحطاتٍ تُسعَّر **بالتعريفة** على المسافة الحقيقية متعددة الأرجل،
--   فيدفع العميل ما يوازي الطول، و`price_source` تبقى `tariff` فتشتقّ
--   `dispatch_ceiling` سقفَها من سياسة الهامش كما تفعل اليوم لكل رحلةٍ بلا
--   تغطية (‏D-14 · اشتقاق `0014`). وأرضيةُ الهامش (D-16) تبقى حاجزاً صلباً.
--
-- ⚠ **وتسعيرُ المحطات من المتعهدين امتدادٌ يُبنى بقرار المالك لا افتراضٌ يُدسّ
--   اليوم** — انظر «ما لم يُبنَ ولماذا» في آخر الترويسة.
--
-- ── 🔒 التوافقُ الرجعيّ — شرطٌ لا يُساوَم ─────────────────────────────────
--
-- ثمانية عشر حجزاً قائماً بلا محطات، والكودُ المنشور لا يعرف المفتاح الجديد.
-- ولذلك:
--   · **غيابُ المفتاح = رحلةٌ بنقطتين** في كل قارئٍ بلا استثناء. ولا `not null`
--     ولا افتراضيَّ مصفوفةٍ فارغة على صفٍّ قائم.
--   · و`create_booking` **لا تكتب المفتاح أصلاً** حين لا محطات — فلقطةُ كل حجزٍ
--     بنقطتين تبقى **مطابقةً حرفاً لما كانت** قبل هذا الملف.
--   · وكلُّ معاملٍ جديد في دالةٍ قائمة **بافتراضيّ**، فالمستدعي القائم (بـ٩ أو
--     ١١ أو ٢١ وسيطاً) يبقى صحيحاً في اللحظة التي تُطبَّق فيها الهجرة.
--   · 🔴 **ولماذا `drop` ثم `create` لا `create or replace`**: إضافةُ معاملٍ
--     بافتراضيٍّ إلى دالةٍ قائمة **تُنشئ تحميلاً ثانياً** لا تستبدل الأول، فيصير
--     النداءُ القديم **ملتبساً** (‏42725) وينهار الإنتاج لحظتَها. فالإسقاط ثم
--     الإنشاء هو ما يُبقي **تحميلاً واحداً** يبتلع النداءين. (سابقة `0080` مع
--     `place_search_config()`، ومعها درسُها: الإسقاط يمحو `revoke`/`grant` معاً،
--     فالمنحُ يُعاد صراحةً ويُفحص في (١٤-ج).)
--
-- ── 🔒 ما لم يُمسّ بحرف، وبرهانُه في هذا الملف ─────────────────────────────
--
-- `coverage_matches` · `coverage_best_costs` · `dispatch_pool` — تُقاس بصمةُ
-- `md5(pg_get_functiondef)` في القسم (٠) قبل أي عمل، وتُقارن في (١٤-أ) بعده.
-- والبصمات المقيسة على القاعدة الحيّة لحظةَ الكتابة (2026-08-19):
--
--     coverage_matches     8b047f5ffdd1c86fd945d909967b485f
--     coverage_best_costs  b4317993a6154d5cb40d372cc9ed64f4
--     dispatch_pool        aaea57ccb601de7a6cbccb1e5258e047
--     dispatch_ceiling     a93b4b0512bda79e8be2bac475a1319f
--
-- ⚠ وهي **مكتوبةٌ للسجلّ لا للفحص**: الفحصُ يقارن ما قبل هذا الملف بما بعده في
--   الجلسة نفسها، فيبقى صحيحاً على قاعدةٍ غيّرت هذه الدوال بهجرةٍ لاحقة —
--   والمقارنةُ برقمٍ محفور كانت ستُسقط إعادةَ التنفيذ بعد أي هجرةٍ مشروعة.
--
-- ── D-58 حرفياً: من أين نُقلت الأجسام ──────────────────────────────────────
--
-- أجسامُ `quote_price` و`quote_public` و`create_booking` و`portal_trips` و
-- `portal_offers` منقولةٌ من **الكتالوج الحيّ** (`pg_get_functiondef`) لا من
-- ملفِّ هجرةٍ سابق. والفارقُ عن المُنتَج الحيّ محصورٌ فيما تسمّيه الأقسام أدناه،
-- ولا سطرَ سواه. و(١٤-ب) **يحرس ما كان قائماً لا ما أُضيف**: سبعةُ شواهد على
-- إصلاحاتٍ سابقة داخل `quote_price` (‏`as materialized` من 0112 · شرط الحقائب
-- من 0031 · حسمُ التعادل من 0132 · حاجبُ الأرقام الداخلية من 0011 · معادلة
-- الهامش · أرضية الفئة · معامل الذهاب والعودة على التكلفة).
--
-- ── ما يبنيه هذا الملف ─────────────────────────────────────────────────────
--
--   (١)  `trip_settings.max_trip_stops` — سقفُ المحطات **إعدادُ مالك** لا رقمٌ
--        محفور، وقارئُه `max_trip_stops()`. الافتراض **٣** ومبرَّرٌ في موضعه.
--   (٢)  `point_in_service_area(lat, lng)` — صندوقُ منطقة الخدمة في SQL.
--   (٣)  `trip_stops_reject_reason(trip)` — سببُ الرفض أو `null`. مصدرٌ واحد
--        يقرؤه القيدُ و`create_booking` معاً (القاعدة ١٢: فوِّض ولا تستنسخ).
--   (٤)  `trip_straight_km(...)` — المسافةُ المستقيمة **متعددة الأرجل**،
--        وبلا محطاتٍ تساوي `haversine_km` حرفاً (تعبيرٌ واحد لا فرعان).
--   (٥)  `trip_stops_full` / `trip_stops_public` — إسقاطا المحطات للمتعهد.
--   (٦)  قيدُ شكلٍ على `bookings.trip` + مُشغّلُ سقفٍ يقرأ الإعداد.
--   (٧)  `quote_price` ← معاملٌ عاشر `p_stops`: **محطاتٌ ⇒ لا تغطية ⇒ تعريفة**.
--   (٨)  `quote_public` ← معاملٌ ثانيَ عشرَ يمرّره، فلا يفترق سعرُ الشاشة عن
--        سعر الحجز.
--   (٩)  `create_booking` ← معاملٌ ثانٍ وعشرون: يتحقق، ويقيس الأرجل، ويكتب
--        المفتاح في اللقطة **حين توجد محطاتٌ وحدها**.
--   (١٠) `portal_trips` / `portal_offers` ← عمود `stops`: المتعهد يرى ما
--        سينفّذه — **وقبل القبول بوسومٍ معمَّاة بلا إحداثيات** (D-19).
--
-- ── اسمُ المفتاح ومبرّره ───────────────────────────────────────────────────
--
-- `trip -> 'stops'`: مصفوفةٌ **مرتَّبة** من كائنات `{label, lat, lng}`.
--   · `stops` لا `waypoints`: كلمةُ المنتج عربيّها «محطات»، والمفتاح يُقرأ في
--     اللوحة وفي البورتال وفي حمولة `get_booking_by_token`.
--   · و`{label, lat, lng}` هي **بعينها** مفاتيح `p_origin`/`p_destination`
--     في `create_booking` — لا مفرداتٌ ثانية لنفس المعنى.
--   · والترتيبُ هو ترتيبُ المصفوفة: أول عنصرٍ أولُ محطةٍ بعد الانطلاق.
--   · ولا سرَّ فيها فتخرج مع اللقطة إلى `anon` عبر `get_booking_by_token`
--     كما تخرج `originLabel` اليوم — كلُّها مُدخل العميل نفسه.
--
-- ── ما لم يُبنَ ولماذا (D-39: التأجيل مسموح والحذف ممنوع) ──────────────────
--
--   · **تسعيرُ المحطات من قوائم المتعهدين** — يمسّ `price_list_items` وسقفَ
--     الموجة ودالةَ القبول وعرضَ المقاصة معاً. قرارُ مالكٍ لا اجتهادُ وكيل.
--   · **`convert_quote_request`** تُنشئ حجزاً بنقطتين كما اليوم — طلبُ العرض
--     المُهيكل لا يحمل محطات بعد.
--   · **`admin_quote_preview`** تنادي `quote_price` بتسعة وسائط ⇒ تبقى
--     ثنائيةَ النقطة (الافتراضيّ يبتلعها) حتى تُطلب معاينةٌ بمحطات.
--   · **`distance_cache`** مفتاحُه زوجُ نقطتين ولم يُمسّ: المسافةُ متعددةُ
--     الأرجل تصل من الطبقة الأعلى، والكاشُ يخدم كل رِجلٍ على حدة كما هو.
--
-- المرجع: D-05 · D-09 · D-10 · D-11 · D-12 · D-14 · D-16 · D-18 · D-19 · D-20
--         · D-54 · D-55 · D-57 · D-58 · `lib/place-search-types.ts`
--         (`SERVICE_BOUNDS`) · `0080` (سابقة الإسقاط والمنح) · `0132`.
-- الاختبار: supabase/tests/multi_stop_tests.sql
-- آمنة لإعادة التنفيذ بالكامل.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (٠) بصمةُ ما يجب ألّا يُمسّ — **قبل** أي عمل
--
-- ⚠ `set_config(..., false)` (‏جلسة) لا `true` (‏معاملة): `db-migrate.mjs` يلفّ
--   الملف في `begin … commit` فيعمل الاثنان، أما التشغيل اليدوي من psql بلا
--   معاملة فتضيع فيه القيمة المحليّة بين البيانين.
-- ----------------------------------------------------------------------------
do $$
begin
  perform set_config('tours.m0140_cov_matches',
    md5(pg_get_functiondef('public.coverage_matches(numeric,numeric,numeric,numeric)'::regprocedure)), false);
  perform set_config('tours.m0140_cov_best',
    md5(pg_get_functiondef('public.coverage_best_costs(numeric,numeric,numeric,numeric)'::regprocedure)), false);
  perform set_config('tours.m0140_pool',
    md5(pg_get_functiondef('public.dispatch_pool(uuid,integer)'::regprocedure)), false);
  perform set_config('tours.m0140_ceiling',
    md5(pg_get_functiondef('public.dispatch_ceiling(uuid,integer)'::regprocedure)), false);
end;
$$;

-- ----------------------------------------------------------------------------
-- (١) سقفُ المحطات — إعدادُ مالكٍ في `trip_settings`
--
-- ── لماذا `trip_settings` ولماذا افتراضُه ٣ ─────────────────────────────────
--
-- `trip_settings` هي **سياسة الرحلة** (المهلة الدنيا · المنطقة الزمنية · مهلة
-- هاتف السائق · خريطة المسار)، والسقفُ منها. و`place_search_settings` سياسةُ
-- بحثٍ عن مكان لا سياسةُ رحلة (نفس تفريق `0076` و`0080`).
--
-- والافتراض **٣** لا صفرٌ ولا عشرة، ومبرّره ثلاثة أوجه:
--   · ما فوق ثلاثِ محطاتٍ ليس «رحلةً بانحراف» بل **جولةً أو تأجيراً بالساعة**،
--     وهو نموذجُ تسعيرٍ آخر ينتظر قرار المالك (‏`STANDING-ORDERS` §٢ ترتيب
--     المراحل: «التأجير بالساعة يحتاج نقاشاً مع بدر أولاً»).
--   · وكلُّ محطةٍ تُطيل المسار، والرحلةُ المسعَّرة بالتعريفة يدفع العميل طولَها
--     كاملاً — فسقفٌ منخفض يمنع فاتورةً فلكية من خطأ إدخال (نفس منطق سقف
--     الانتظار ١٢ ساعة في D-57).
--   · وهو **رقمٌ للمالك يرفعه من الإعدادات بلا نشر** — لا حكمٌ نهائي.
--
-- ⚠ والمدى `0 … 10` مفروضٌ بـ`check`: صفرٌ يعني «أطفئ الميزة» (كلُّ حجزٍ بمحطة
--   يُرفض)، وهو مخرجٌ للمالك لا حالةُ عطل.
--
-- ⚠ ولا يُمسّ `trip_config()`: هي تختار أعمدةً بأسمائها، فعمودٌ جديد لا يزحزح
--   شيئاً في عقدها ولا في قارئها `lib/trip-settings.ts` (سابقة `time_zone`
--   و`route_map_enabled` — كلاهما عمودٌ في الجدول وليس في `trip_config()`).
-- ----------------------------------------------------------------------------
alter table public.trip_settings
  add column if not exists max_trip_stops integer not null default 3;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.trip_settings'::regclass
      and conname  = 'trip_settings_max_trip_stops_chk'
  ) then
    alter table public.trip_settings
      add constraint trip_settings_max_trip_stops_chk
      check (max_trip_stops between 0 and 10);
  end if;
end;
$$;

comment on column public.trip_settings.max_trip_stops is
  'أقصى عددٍ من المحطات الوسطى في الرحلة الواحدة (‏0140). الافتراض ٣: ما فوقه جولةٌ أو تأجيرٌ بالساعة — نموذج تسعيرٍ آخر ينتظر قرار المالك، لا امتداد للقائم. وصفرٌ يعني إطفاء الميزة: كلُّ حجزٍ بمحطةٍ يُرفض. يقرؤه max_trip_stops() ويفرضه المُشغّل bookings_guard_trip_stops.';

create or replace function public.max_trip_stops()
returns integer
language sql
stable
security definer
set search_path = ''
as $function$
  -- الافتراضيُّ هنا **fallback دائم لا مصدر** (D-04، وسابقة `site_time_zone()`):
  -- صفٌّ محذوف لا يوقف حجزاً، ويعود إلى السقف المكتوب في العمود.
  select coalesce(
    (select t.max_trip_stops from public.trip_settings t where t.id limit 1),
    3
  );
$function$;

revoke all on function public.max_trip_stops() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.max_trip_stops() to service_role';
  end if;
end;
$$;

comment on function public.max_trip_stops() is
  'قارئُ سقف المحطات — المصدرُ الوحيد للرقم في Postgres (القاعدة ١٢). محجوبٌ عن anon و authenticated: سياسةُ تشغيلٍ لا يحتاجها متصفّحٌ ولا متعهد، والمُشغّل يناديها بصلاحيات مالكها.';

-- ----------------------------------------------------------------------------
-- (٢) منطقةُ الخدمة في SQL — نفسُ الصندوق، حيث يُفرض
--
-- 🔴 **الحدُّ قائمٌ ولا يُعاد تعريفه**: `SERVICE_BOUNDS` في
--    `lib/place-search-types.ts` (‏٢٠–٣٤ عرضاً · ٢٣–٣٨ طولاً) تقرؤه
--    `isWithinServiceArea` في `/api/geocode/reverse` و`/api/geocode/resolve`
--    وفي الخريطة. وهذه الدالة **نسخةُ الأرقام نفسِها في الطبقة التي تملك
--    الفرض** لا تعريفٌ منافس — وهو حرفياً ما قرّرته `0080` حين كتبت الصندوق
--    في `check` على `place_search_settings`، وللسبب نفسه: حارسٌ في TypeScript
--    وحده ليس حارساً أمام محرِّر SQL أو مفتاح الخدمة.
--
-- ⚠ **ولا شرطَ «منتهٍ» زائد**: `numeric` تعتبر `NaN` أكبرَ من كل قيمة، و
--   `Infinity` كذلك، و`-Infinity` أصغرَ من كلٍّ — فالصندوقُ **يرفض الثلاثة
--   بنيوياً**. وإضافةُ `> '-Infinity' and < 'Infinity'` فوقه كانت ستكون
--   حارساً لا يمكن أن يفشل (النمط ٩ في `LESSONS.md`)، والقسم (أ) في مجموعة
--   الاختبار يُثبت الرفضَ **سلوكاً** لا شكلاً.
--
-- ⚠ و`coalesce(..., false)` لأن `null` مُدخلاً يجب أن تعود `false` لا `null`:
--   القيدُ في (٦) يقرأ النتيجة مباشرةً، و`check` تقبل `null` بوصفها نجاحاً.
-- ----------------------------------------------------------------------------
create or replace function public.point_in_service_area(p_lat numeric, p_lng numeric)
returns boolean
language sql
immutable
set search_path = ''
as $function$
  select coalesce(
    p_lat >= 20 and p_lat <= 34 and p_lng >= 23 and p_lng <= 38,
    false
  );
$function$;

comment on function public.point_in_service_area(numeric, numeric) is
  'هل النقطة داخل منطقة الخدمة (مصر) — نفسُ صندوق SERVICE_BOUNDS في lib/place-search-types.ts (٢٠–٣٤ · ٢٣–٣٨). من غيّر أحدهما يغيّر الآخر. يرفض NaN و±Infinity بنيوياً لأن numeric ترتّبهما خارج المدى.';

-- ----------------------------------------------------------------------------
-- (٣) شكلُ المحطات — سببُ الرفض في مصدرٍ واحد
--
-- تُرجع `null` حين تكون اللقطة سليمة (**وغيابُ المفتاح سليم**)، وإلا رمزَ
-- السبب. والرمزُ هو نفسه `hint` الذي ترفعه `create_booking` — فرسالةُ الشاشة
-- تعرف أيَّ حقلٍ يُصلَح، لا «راجع الحقول».
--
-- 🔴 **مصدرٌ واحد يقرؤه اثنان**: القيدُ في (٦) و`create_booking` في (٩).
--    نسختان من قاعدة الشكل تنحرفان يوماً، والانحرافُ يكون حجزاً كُتب في
--    الجدول بشكلٍ ترفضه الدالة أو العكس.
--
-- ⚠ `is distinct from` لا `<>`: `jsonb_typeof(item -> 'lat')` تُرجع **SQL NULL**
--   حين يغيب المفتاح، و`null <> 'number'` تساوي `null` — فتسقط الحالةُ إلى
--   `when` التالية وتمرّ محطةٌ بلا إحداثيات. مزلقٌ صامت لا يكشفه إلا اختبار.
--
-- ⚠ وترتيبُ الشروط **من الأعمّ إلى الأخصّ**: كائنٌ أولاً، ثم الوسم، ثم نوعُ
--   الإحداثيتين، ثم موضعُهما — فلا يُنادى `::numeric` على ما ليس رقماً.
-- ----------------------------------------------------------------------------
create or replace function public.trip_stops_reject_reason(p_trip jsonb)
returns text
language sql
immutable
set search_path = ''
as $function$
  select case
    -- المفتاح غائب ⇒ رحلةٌ بنقطتين، وهي **الحالةُ السليمة** لكل صفٍّ قائم
    when p_trip -> 'stops' is null then null
    when jsonb_typeof(p_trip -> 'stops') <> 'array' then 'stops-not-array'
    else (
      select x.code
      from jsonb_array_elements(p_trip -> 'stops') with ordinality as e(item, ord)
      cross join lateral (
        select case
          when jsonb_typeof(e.item) <> 'object'
            then 'stop-not-object'
          when nullif(btrim(coalesce(e.item ->> 'label', '')), '') is null
            then 'stop-label-missing'
          when jsonb_typeof(e.item -> 'lat') is distinct from 'number'
            or  jsonb_typeof(e.item -> 'lng') is distinct from 'number'
            then 'stop-coords-missing'
          when not public.point_in_service_area(
                 (e.item ->> 'lat')::numeric, (e.item ->> 'lng')::numeric)
            then 'stop-out-of-area'
          else null
        end as code
      ) x
      where x.code is not null
      order by e.ord
      limit 1
    )
  end;
$function$;

comment on function public.trip_stops_reject_reason(jsonb) is
  'سببُ رفض محطات اللقطة أو null إن سلمت — وغيابُ المفتاح stops سليمٌ دائماً (رحلةٌ بنقطتين، وهي حالُ كل حجزٍ سابق لهجرة 0140). المصدرُ الوحيد لقاعدة الشكل: يقرؤه القيد bookings_trip_stops_shape_chk و create_booking معاً. الرموز: stops-not-array · stop-not-object · stop-label-missing · stop-coords-missing · stop-out-of-area — وهي نفسها الـhint الذي ترفعه create_booking.';

-- ----------------------------------------------------------------------------
-- (٤) المسافةُ المستقيمة متعددةُ الأرجل
--
-- 🔴 **تعبيرٌ واحد لا فرعان**: بلا محطاتٍ تصير السلسلةُ (منطلق ⇐ وجهة) رِجلاً
--    واحدة، والناتجُ **مطابقٌ لـ`haversine_km` حرفاً**. ولذلك لا `if` في
--    `create_booking` ولا مسارٌ ثانٍ يُختبر: الحالةُ القديمة حالةٌ خاصةٌ من
--    الجديدة، والقسم (ب) في المجموعة يُثبت المطابقة رقماً برقم.
--
-- ⚠ ولماذا هذا مهمّ أصلاً: حاجزُ D-09 في `create_booking` يرفض مسافةً أقصرَ من
--   ٩٠٪ من المستقيمة أو أطولَ من ثلاثة أضعافها. ورحلةٌ بمحطةٍ منحرفة تُطيل
--   المسار الحقيقي كثيراً — فلو بقي الحاجزُ يقيس على الوتر المباشر لَرفض كلَّ
--   رحلةٍ بمحطةٍ بعيدة، **ولَقبِل مسافةً مزوَّرة** في رحلةٍ بمحطاتٍ متقاربة.
--   فالحاجزُ يُقاس على السلسلة نفسها التي سيقودها السائق.
--
-- ⚠ والمحطاتُ تُقرأ **بترتيب المصفوفة** (`with ordinality`): إعادةُ ترتيبها
--   تغيّر الطول، والترتيبُ هو مُدخل العميل لا تفصيلَ تخزين.
-- ----------------------------------------------------------------------------
create or replace function public.trip_straight_km(
  p_origin_lat numeric,
  p_origin_lng numeric,
  p_dest_lat   numeric,
  p_dest_lng   numeric,
  p_stops      jsonb default null
)
returns numeric
language sql
stable
set search_path = ''
as $function$
  with pts as (
    select 0::bigint as ord, p_origin_lat as lat, p_origin_lng as lng
    union all
    select e.ord, (e.item ->> 'lat')::numeric, (e.item ->> 'lng')::numeric
    from jsonb_array_elements(
           case when jsonb_typeof(p_stops) = 'array' then p_stops else '[]'::jsonb end
         ) with ordinality as e(item, ord)
    union all
    select 9223372036854775807::bigint, p_dest_lat, p_dest_lng
  ),
  legs as (
    select
      lag(p.lat) over (order by p.ord) as a_lat,
      lag(p.lng) over (order by p.ord) as a_lng,
      p.lat as b_lat,
      p.lng as b_lng
    from pts p
  )
  select sum(public.haversine_km(l.a_lat, l.a_lng, l.b_lat, l.b_lng))
  from legs l
  where l.a_lat is not null;
$function$;

revoke all on function public.trip_straight_km(numeric, numeric, numeric, numeric, jsonb)
  from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.trip_straight_km(numeric, numeric, numeric, numeric, jsonb) to service_role';
  end if;
end;
$$;

-- ── 🔴 ولماذا **لا** يُسحب مثلُه من (٢) و(٣) — وهو قرارٌ لا سهو ──────────────
--
-- `point_in_service_area` و`trip_stops_reject_reason` تُنادَيان من **تعبير
-- `check` على `bookings`**، وتعبيرُ القيد يُقيَّم بصلاحيات **الكاتب** لا
-- بصلاحيات مالك الجدول. و`authenticated` يملك `UPDATE` على `bookings` (مقيسٌ
-- حياً: `has_table_privilege('authenticated','public.bookings','update')` =
-- true — وهو مسارُ اللوحة لكل تعديلِ حالة). فسحبُ `EXECUTE` منه كان **يقفل
-- اللوحةَ خارج جدول الحجوزات** بـ«permission denied for function» عند أول
-- تعديل، لا يشدّ حارساً.
--
-- ولا يُسرَّب بذلك شيء: الدالتان **بلا قراءةٍ من أي جدول**، تحسبان على ما
-- يعطيهما المنادي وحده. والفحصُ (١١-ج) يُثبت بقاءهما مفتوحتين — فمن «يشدّدهما»
-- غداً بحسن نية يسقط هنا لا في الإنتاج.
-- ولذلك `trip_straight_km` أعلاه **تُسحب**: لا قيدَ يناديها، ومنادِيها الوحيد
-- `create_booking` وهي `security definer`.

comment on function public.trip_straight_km(numeric, numeric, numeric, numeric, jsonb) is
  'مجموعُ المسافات المستقيمة على أرجل الرحلة: منطلق ⇐ محطات بترتيبها ⇐ وجهة. بلا محطاتٍ يساوي haversine_km حرفاً — تعبيرٌ واحد لا فرعان، فالرحلةُ بنقطتين حالةٌ خاصةٌ من متعددة الأرجل لا مسارٌ ثانٍ. يفوّض الحساب إلى haversine_km ولا يستنسخه (القاعدة ١٢).';

-- ----------------------------------------------------------------------------
-- (٥) إسقاطا المحطات إلى المتعهد — قبل القبول وبعده
--
-- 🔴 **قبل القبول: وسومٌ معمَّاة وبلا إحداثيات** (D-19).
--    `portal_offers` اليوم لا تُرجع إحداثيةً واحدة، وتمرّ وسومُ المنطلق والوجهة
--    بـ`dispatch_public_label` فتُسقط كلَّ مقطعٍ يحمل رقماً (رقمَ عقارٍ أو شقة).
--    ومحطةٌ خام كانت ستفتح **باباً خلفياً** إلى العنوان الدقيق الذي أُغلق في
--    `0014`: يقرأ المتعهد إحداثية المحطة الوسطى فيعرف حيَّ العميل قبل أن يقبل.
--
-- 🔴 **وبعد الإسناد: كاملةً بإحداثياتها.** المتعهدُ يقود إليها فعلاً، وحجبُها
--    يجعل الرحلةَ غيرَ قابلةٍ للتنفيذ. وهو نفسُ الحدّ الذي تقف عنده
--    `portal_trips` اليوم حين تُعطي اسمَ العميل وهاتفه.
--
-- ⚠ وكلتاهما تُرجعان `'[]'` حين يغيب المفتاح — لا `null`: المستهلكُ يمشي على
--   مصفوفةٍ دائماً، فلا يحتاج فرعاً لحالةٍ هي **حالُ كل حجزٍ قائم**.
-- ----------------------------------------------------------------------------
create or replace function public.trip_stops_full(p_trip jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $function$
  select coalesce(
    (select jsonb_agg(
              jsonb_build_object(
                'label', e.item ->> 'label',
                'lat',   (e.item ->> 'lat')::numeric,
                'lng',   (e.item ->> 'lng')::numeric
              )
              order by e.ord
            )
       from jsonb_array_elements(
              case when jsonb_typeof(p_trip -> 'stops') = 'array'
                   then p_trip -> 'stops' else '[]'::jsonb end
            ) with ordinality as e(item, ord)),
    '[]'::jsonb
  );
$function$;

create or replace function public.trip_stops_public(p_trip jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $function$
  select coalesce(
    (select jsonb_agg(
              -- الوسمُ وحده، ومعمّى — ولا `lat` ولا `lng` في الكائن **أصلاً**:
              -- حمايةٌ بنيوية لا انضباطية، على قاعدة D-18 و D-19.
              jsonb_build_object(
                'label', public.dispatch_public_label(e.item ->> 'label')
              )
              order by e.ord
            )
       from jsonb_array_elements(
              case when jsonb_typeof(p_trip -> 'stops') = 'array'
                   then p_trip -> 'stops' else '[]'::jsonb end
            ) with ordinality as e(item, ord)),
    '[]'::jsonb
  );
$function$;

revoke all on function public.trip_stops_full(jsonb)   from public, anon, authenticated;
revoke all on function public.trip_stops_public(jsonb) from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.trip_stops_full(jsonb) to service_role';
    execute 'grant execute on function public.trip_stops_public(jsonb) to service_role';
  end if;
end;
$$;

comment on function public.trip_stops_full(jsonb) is
  'محطاتُ اللقطة كاملةً {label, lat, lng} — للمتعهد **بعد الإسناد** وللوحة. تُرجع [] حين يغيب المفتاح. محجوبةٌ عن authenticated: النافذةُ الوحيدة إليها هي portal_trips() وهي security definer تحكم نطاقها بنفسها.';

comment on function public.trip_stops_public(jsonb) is
  'محطاتُ اللقطة **معمّاةً**: وسمٌ مارٌّ بـdispatch_public_label ولا إحداثيات في الكائن أصلاً — لما **قبل** القبول (D-19). إحداثيةُ محطةٍ وسطى تكشف حيَّ العميل، وهو بعينه ما أغلقته 0014 في وسمَي المنطلق والوجهة.';

-- ----------------------------------------------------------------------------
-- (٦) الحاجزان على الجدول — شكلٌ في `check` وسقفٌ في مُشغّل
--
-- 🔴 **ولماذا حاجزان لا واحد، ولماذا هذا التقسيم بالذات:**
--   · **الشكل** ثابتٌ لا يقرأ جدولاً ⇒ يصلح `check`، وهو أقوى: يسري على
--     `COPY` وعلى كل كاتبٍ مستقبليّ ولا يُعطَّل بـ`disable trigger`.
--   · **السقف** يقرأ `trip_settings` ⇒ **لا يصلح `check` إطلاقاً**: لا
--     استعلاماتِ فرعية داخله (نفسُ الحدّ الذي واجهته `0075` مع المنطقة
--     الزمنية) ⇒ مُشغّل.
--   · وهما **لا يتظالّان**: كلُّ واحدٍ يمسك ما لا يمسكه الآخر، فلكلٍّ طفرتُه
--     في المجموعة (نزعُ القيد ⇒ تمرّ محطةٌ خارج مصر · تعطيلُ المُشغّل ⇒ يمرّ
--     تجاوزُ السقف). وحارسٌ يظلّله آخرُ لا يمكن إثباتُ أنه حيّ.
--
-- ⚠ والقيدُ يُضاف **مُتحقَّقاً منه** لا `not valid`: الثمانيةَ عشرَ حجزاً
--   القائمةَ بلا مفتاح `stops` تمرّ جميعاً، ونجاحُ `alter table` نفسُه **هو
--   البرهان** على أن الغياب سليمٌ لكل صفٍّ على القرص — لا عدٌّ يدويٌّ نكتبه.
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.bookings'::regclass
      and conname  = 'bookings_trip_stops_shape_chk'
  ) then
    alter table public.bookings
      add constraint bookings_trip_stops_shape_chk
      check (public.trip_stops_reject_reason(trip) is null);
  end if;
end;
$$;

comment on constraint bookings_trip_stops_shape_chk on public.bookings is
  'شكلُ محطات اللقطة (‏0140): مصفوفةُ كائناتٍ لكلٍّ وسمٌ نصّيّ وإحداثيتان رقميتان داخل منطقة الخدمة. غيابُ المفتاح سليمٌ = رحلةٌ بنقطتين. القاعدةُ نفسها في trip_stops_reject_reason ولا نسخةَ ثانية منها.';

create or replace function public.bookings_guard_trip_stops()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_max   integer;
  v_count integer;
begin
  -- غيابُ المفتاح ⇒ رحلةٌ بنقطتين ⇒ لا شأن لهذا المُشغّل بها. وهو المسارُ الذي
  -- تسلكه **كلُّ** كتابةٍ قائمة اليوم، فلا يُقرأ إعدادٌ ولا يُنادى شيء.
  if jsonb_typeof(new.trip -> 'stops') is distinct from 'array' then
    return new;
  end if;

  v_count := jsonb_array_length(new.trip -> 'stops');
  if v_count = 0 then
    return new;
  end if;

  v_max := public.max_trip_stops();

  if v_count > v_max then
    raise exception 'عدد المحطات (%) يتجاوز الحدّ المسموح (%)', v_count, v_max
      using hint = 'stops-too-many';
  end if;

  return new;
end;
$function$;

comment on function public.bookings_guard_trip_stops() is
  'يفرض سقفَ المحطات المقروء من trip_settings.max_trip_stops على كل كتابةٍ في bookings.trip. في مُشغّل لا في check لأن الأخير لا يقرأ جدولاً (نفس حدّ 0075). والشكلُ ليس هنا بل في القيد bookings_trip_stops_shape_chk — حارسان لا يتظالّان، فلكلٍّ طفرتُه.';

drop trigger if exists bookings_guard_trip_stops on public.bookings;
create trigger bookings_guard_trip_stops
  before insert or update of trip on public.bookings
  for each row execute function public.bookings_guard_trip_stops();

-- ----------------------------------------------------------------------------
-- (٧) 🔴 `quote_price` — محطاتٌ ⇒ لا تغطية ⇒ تعريفة
--
-- الجسمُ منقولٌ من `pg_get_functiondef` الحيّ (D-58). و**الفارقُ عن المنشور
-- ثلاثة مواضع لا رابع لها**:
--   (أ) معاملٌ عاشر `p_stops jsonb default null` — بافتراضيٍّ فيبتلع النداءات
--       التساعية القائمة (‏`create_booking` · `quote_public` ·
--       `admin_quote_preview` · تحميلا ٤ و٥ وسائط).
--   (ب) عمودٌ في `base`: `has_stops`.
--   (ج) شرطٌ واحد في `covered`: `and not b.has_stops`.
--
-- وما يترتب عليه **يقع من نفسه** ولا يُكتب: `covered` فارغة ⇒ `sub_cost` تعود
-- `null` من الـ`left join` ⇒ فرعُ التعريفة في `priced` ⇒ `price_source`
-- تُحسب `'tariff'` ⇒ `subcontractor_id` و`subcontractor_cost` و`margin_amount`
-- كلُّها `null`. **لا سطرَ واحداً في منطق التغطية يُمسّ**، ولا في
-- `coverage_best_costs` ولا في `dispatch_pool`.
--
-- ⚠ `case … then jsonb_array_length … else 0 end` لا `and`: عوامل SQL المنطقية
--   **لا تقصر الدائرة** بضمانة، و`jsonb_array_length` على غير مصفوفةٍ **ترمي**
--   — فتنهار كلُّ عمليةِ تسعيرٍ على قاعدةٍ وصلها مُدخلٌ فاسد. و`case` تقصرها.
-- ----------------------------------------------------------------------------
drop function if exists public.quote_price(
  numeric, integer, boolean, numeric, numeric, numeric, numeric, numeric, integer);

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
$function$;

revoke all on function public.quote_price(
  numeric, integer, boolean, numeric, numeric, numeric, numeric, numeric, integer, jsonb)
  from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.quote_price('
         || 'numeric, integer, boolean, numeric, numeric, numeric, numeric, numeric, integer, jsonb'
         || ') to service_role';
  end if;
end;
$$;

comment on function public.quote_price(
  numeric, integer, boolean, numeric, numeric, numeric, numeric, numeric, integer, jsonb) is
  'محرّك التسعير (D-05 · D-11). منذ 0140 يقبل p_stops: رحلةٌ بمحطاتٍ وسطى **لا تدخل مسار تغطية المتعهدين إطلاقاً** وتُسعَّر بالتعريفة على المسافة متعددة الأرجل — لأن المتعهد سعّر مساراً مباشراً ومستحقُّه لا يتغيّر بانحراف. محجوبة عن anon و authenticated: تحمل التكلفة والهامش في نوع إرجاعها (D-20).';

-- ----------------------------------------------------------------------------
-- (٨) `quote_public` — تمرّر المحطات ولا تفعل بها شيئاً آخر
--
-- 🔴 **ولماذا لزمت أصلاً:** لو بقيت الشاشةُ تسعّر رحلةً بمحطاتٍ من تغطية
--    المتعهدين بينما `create_booking` تسعّرها بالتعريفة، لَافترق **الرقم
--    المعروض عن الرقم المحجوز** — والعميل يرى سعراً ثم يُحاسَب بآخر. وهو نفسُ
--    صنف العيب الذي كتبته `components/booking/extras.ts` عن الحقائب: مسارٌ
--    يسعّر بمدخلاتٍ غير التي رآها العميل.
--
-- الجسمُ منقولٌ من الكتالوج الحيّ، والفارقُ **موضعان**: المعاملُ الثاني عشر،
-- وتمريرُه إلى `quote_price`. ولا شيءَ سواهما — الخصمُ والخدمات والحاجبُ
-- والتوزيعُ على بندَي العرض كما هي حرفاً.
-- ----------------------------------------------------------------------------
drop function if exists public.quote_public(
  numeric, integer, boolean, numeric, numeric, numeric, numeric, numeric, text, integer, jsonb);

create or replace function public.quote_public(
  p_distance_km   numeric,
  p_passengers    integer,
  p_round_trip    boolean,
  p_waiting_hours numeric,
  p_origin_lat    numeric,
  p_origin_lng    numeric,
  p_dest_lat      numeric,
  p_dest_lng      numeric,
  p_coupon_code   text    default null,
  p_luggage       integer default 0,
  p_extras        jsonb   default null,
  p_stops         jsonb   default null
)
returns table(
  class_slug text, class_title text, capacity integer, total numeric,
  base_fee numeric, distance_cost numeric, waiting_cost numeric,
  round_trip_applied boolean, peak_applied boolean, min_applied boolean,
  discount_applied boolean, discount_code text, discount_amount numeric,
  discount_clamped boolean, discount_rejection text, total_before_discount numeric,
  extras_total numeric, extras jsonb, ride_total numeric
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_code    text;
  v_q       record;
  v_d       record;
  v_x_total numeric := 0;
  v_x_json  jsonb   := '[]'::jsonb;
begin
  v_code := public.discount_normalize_code(p_coupon_code);

  -- ── 🔒 معامل الكوبون ممنوع على أدوار المتصفح — الحاجز في الدالة لا في المسار ──
  --
  -- التسعير بلا رمز يبقى مفتوحاً للزائر كما كان منذ 0012 (الموقع يسعّر قبل
  -- الدخول). أما **الرمز** فيحوّل هذه الدالة إلى عرّافَين لمن يملك مفتاح anon
  -- المنشور في حزمة المتصفح:
  --   (أ) عرّاف وجود: `not-found` مقابل `class-not-eligible`/`below-min-total`/
  --       `exhausted`/`floor-guard` يفرّق الرمزَ الحقيقي عن الوهمي.
  --   (ب) عرّاف تكلفة: حين تقلّص الأرضيةُ الخصمَ يصير
  --       `total_before_discount − discount_amount = greatest(التكلفة + الأرضية, min_price)`
  --       بالجنيه بالضبط — وهو الاستنتاج العكسي الذي بُنيت 0011 كلها لإغلاقه.
  if v_code is not null
     and coalesce(nullif(current_setting('role', true), ''), '') in ('anon', 'authenticated')
     and not public.is_admin() then
    raise exception 'التحقق من رمز الخصم يمر بمسار الخادم وحده'
      using hint = 'forbidden';
  end if;

  -- (0031) الخدمات تُسعَّر **قبل** رفع علم الأرقام الداخلية: لا تقرأ شيئاً
  -- داخلياً، وإبقاؤها خارج الكتلة المحروسة يبقي نافذة العلم أضيق ما يمكن.
  select
    coalesce(sum(x.line_total), 0),
    coalesce(
      jsonb_agg(jsonb_build_object(
        'slug',      x.slug,
        'title',     x.title,
        'qty',       x.qty,
        'unitPrice', x.unit_price,
        'lineTotal', x.line_total
      )),
      '[]'::jsonb
    )
    into v_x_total, v_x_json
  from public.price_extras(p_extras) x;

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
        p_origin_lat, p_origin_lng, p_dest_lat, p_dest_lng,
        p_luggage,
        -- 0140 — المحطاتُ تمرّ كما وصلت: القرارُ كلُّه في quote_price ولا
        -- نسخةَ ثانية منه هنا (القاعدة ١٢).
        p_stops
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
        --
        -- ⚠⚠ الوسيط الثاني `v_q.total` = **إجمالي الرحلة وحده** بلا خدمات (ف٩).
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

      -- (0031) ★ الخدمات آخر شيء: بعد الذروة وبعد الخصم معاً
      ride_total   := total;
      extras_total := v_x_total;
      extras       := v_x_json;
      total        := total + v_x_total;

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
$function$;

revoke all on function public.quote_public(
  numeric, integer, boolean, numeric, numeric, numeric, numeric, numeric, text, integer, jsonb, jsonb)
  from public;

do $$
declare
  v_sig constant text :=
    'public.quote_public(numeric, integer, boolean, numeric, numeric, numeric, numeric, numeric, text, integer, jsonb, jsonb)';
  v_role text;
begin
  -- المنحُ يُعاد **كما كان مقيساً** قبل الإسقاط: anon و authenticated و
  -- service_role. ونوعُ الإرجاع نفسه هو الحاجز (D-18): لا تكلفةَ فيه ولا هامش.
  foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
    if exists (select 1 from pg_roles where rolname = v_role) then
      execute format('grant execute on function %s to %I', v_sig, v_role);
    end if;
  end loop;
end;
$$;

comment on function public.quote_public(
  numeric, integer, boolean, numeric, numeric, numeric, numeric, numeric, text, integer, jsonb, jsonb) is
  'التسعير العام (D-18): بلا تكلفةٍ ولا هامشٍ ولا هوية متعهدٍ في نوع الإرجاع أصلاً. منذ 0140 تمرّر p_stops إلى quote_price فلا يفترق سعرُ الشاشة عن سعر الحجز في رحلةٍ بمحطات.';

-- ----------------------------------------------------------------------------
-- (٩) `create_booking` — التحقق ثم الأرجل ثم اللقطة
--
-- الجسمُ منقولٌ من الكتالوج الحيّ (D-58)، والفارقُ **أربعة مواضع لا خامس**:
--   (أ) معاملٌ ثانٍ وعشرون `p_stops jsonb default null`.
--   (ب) كتلةُ تحقّقٍ جديدة (أ-٥) تُطبّع المحطات وتفوّض قاعدة الشكل إلى
--       `trip_stops_reject_reason` وقاعدةَ السقف إلى `max_trip_stops()`.
--   (ج) `v_hav` صارت `trip_straight_km(...)` بدل `haversine_km(...)` —
--       **وبلا محطاتٍ الناتج مطابق**، فحاجز D-09 لم يتغير لأي حجزٍ قائم.
--   (د) `quote_price` تُنادى بوسيطٍ عاشر، واللقطة تحمل `stops` **حين توجد**.
--
-- 🔴 **ولماذا التحقق هنا أيضاً وقد وُضع حاجزان على الجدول:** الجدولُ يرفض
--    بـ`23514` واسمِ قيدٍ إنجليزيّ — رسالةٌ لا تقول للعميل ماذا يُصلح.
--    و`create_booking` هي المسار الوحيد إلى صفِّ حجزٍ جديد (‏`insert` مسحوبة
--    من anon و authenticated ولا سياسةَ لها)، فهي التي تملك أن ترفع **رمزاً
--    لكل سبب**. والحاجزان على الجدول لمن يكتب بمفتاح الخدمة أو من محرّر SQL —
--    وهو حرفياً ما فعلته 0014 و0027 و0057 قبلها.
-- ----------------------------------------------------------------------------
drop function if exists public.create_booking(
  jsonb, jsonb, integer, boolean, numeric, numeric, numeric, text, text, text,
  text, text, text, timestamptz, text, text, timestamptz, integer, jsonb, integer, text);

create or replace function public.create_booking(
  p_origin           jsonb,
  p_destination      jsonb,
  p_passengers       integer,
  p_round_trip       boolean,
  p_waiting_hours    numeric,
  p_distance_km      numeric,
  p_duration_min     numeric,
  p_distance_source  text,
  p_class_slug       text,
  p_plan             text,
  p_customer_name    text,
  p_customer_phone   text,
  p_customer_whatsapp text,
  p_pickup_at        timestamptz,
  p_notes            text,
  p_coupon_code      text        default null,
  p_return_at        timestamptz default null,
  p_luggage          integer     default 0,
  p_extras           jsonb       default null,
  p_redeem_points    integer     default 0,
  p_flight_number    text        default null,
  p_stops            jsonb       default null
)
returns table(
  id uuid, reference text, public_token text, total numeric,
  amount_due numeric, amount_remaining numeric, currency text
)
language plpgsql
security definer
set search_path = ''
as $function$
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
  -- 0047 — ⚠ ما أخذه الكوبون من الميزانية، في متغيّرٍ **قائمٍ بذاته**: قراءة
  --   `v_disc.amount` داخل `case` تنفجر بـ«record is not assigned yet» حين لا
  --   كوبون، لأن plpgsql يبني وسائط الاستعلام قبل تنفيذه فلا قصرَ دائرة فيه.
  v_disc_amount numeric := 0;
  -- 0031
  v_luggage     integer;
  v_derived     numeric;
  v_derived_won boolean := false;
  v_x_total     numeric := 0;
  v_x_rows      jsonb   := '[]'::jsonb;
  -- 0047
  v_want        integer := 0;
  v_pts         record;
  -- ⚠ رايةٌ مستقلة لا `v_pts.applied`: plpgsql يقيّم شرط `if` **تعبيراً واحداً
  --   في SQL**، فلا قصرَ دائرةٍ فيه — و`v_want > 0 and v_pts.applied` ينفجر
  --   بـ«record is not assigned yet» في **كل حجزٍ بلا نقاط**. أمسكه الفحص
  --   الذاتي في أول تشغيل، ولم تكن قراءةٌ لتمسكه.
  v_loy_ok      boolean := false;
  v_loy_json    jsonb   := 'null'::jsonb;
  -- 0067
  v_min_pickup  timestamptz;
  v_lead        integer;
  v_flight      text;
  -- 0140
  v_stops       jsonb   := null;
  v_stop_reason text;
  v_stop_count  integer := 0;
  v_stop_max    integer;
begin
  -- (أ) تطهير المدخلات النصية
  v_name     := nullif(btrim(coalesce(p_customer_name, '')), '');
  v_phone    := nullif(btrim(coalesce(p_customer_phone, '')), '');
  v_whatsapp := nullif(btrim(coalesce(p_customer_whatsapp, '')), '');
  v_slug     := nullif(btrim(coalesce(p_class_slug, '')), '');
  v_plan     := lower(nullif(btrim(coalesce(p_plan, '')), ''));
  v_code     := public.discount_normalize_code(p_coupon_code);
  -- 0067 — رقم الرحلة يُطبَّع ولا يُحكم عليه (انظر (٤) أعلاه)
  v_flight   := public.normalize_flight_number(p_flight_number);

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

  -- (أ-٢أ) 0081 — 🔴 **موعد الانطلاق مطلوب**
  --
  -- قرار المالك 2026-08-17: «غير موافق على الحجز بدون موعد». وقبله كان
  -- `p_pickup_at` يقبل `null` منذ 0007، فينشأ حجزٌ بموعدٍ فارغ **يتجاوز حارس
  -- المهلة كلياً** (شرط (أ-٢ب) أدناه مشروطٌ بـ`is not null`) — أي أن أشدّ ما
  -- بُني في أ‑٢ يسقط بحذف مفتاحٍ من جسم الطلب.
  --
  -- 🔒 **وموضع الحارس هنا لا في معالج المسار.** `app/api/booking/route.ts`
  -- يحرس اليوم كذلك، لكنه ليس الطريق الوحيد إلى هذه الدالة: كل من يملك مفتاح
  -- الخدمة (سكربتات البذرة، أدوات التشغيل، أي مسارٍ يُكتب غداً) ينادي الدالة
  -- مباشرةً بلا المرور به. وهو الدرس نفسه الذي كتبت 0060 حرفاً بحرف: قسرٌ في
  -- TypeScript فوق قاعدةٍ لا تعرف القاعدة = «حمايةٌ بالعُرف لا بالحاجز».
  --
  -- ⚠ **وتلميحٌ مستقلّ لا `invalid-input`** — لأن العلاج مختلف: «راجع الحقول»
  -- تدفع العميل يفتّش في نموذجٍ كل ما فيه صحيح، والصواب أن يعود إلى الخطوة
  -- الأولى ويختار موعداً. و`Checkout` تفعل ذلك بنفسها عند رؤية الرمز، تماماً
  -- كما تفعل مع `lead-time`.
  --
  -- ⚠ **وموضعه قبل فحص العودة بقصد**: (أ-٢) أدناه يرفض «عودةٌ بلا انطلاق»
  -- بـ`invalid-input`، فلو تُرك أولاً لخرج نصف الحالات بالتلميح العام —
  -- ورسالةُ الشاشة تفترق عن سببها الحقيقي.
  --
  -- ⚠ **ولا قيدٌ على `bookings` بجواره.** الموعد يعيش في لقطة `trip` (لا عمود
  -- له)، وقيدُ `check ((trip ->> 'pickupAt') is not null)` كان سيرفض كذلك كل
  -- صفٍّ تزرعه مجموعات الاختبار بلقطةٍ مصغّرة — وهي تجهيزاتٌ تصف حجوزاً **قبل**
  -- هذه القاعدة لا حجوزاً تخالفها. والكتابةُ المباشرة إلى الجدول مسحوبةٌ أصلاً
  -- من `anon` و`authenticated` (مقيسٌ حياً: `has_table_privilege` = false
  -- للاثنين، ولا سياسة `insert` على الجدول)، فالطريق الوحيد الباقي إلى صفِّ
  -- حجزٍ جديد هو هذه الدالة بعينها.
  if p_pickup_at is null then
    raise exception 'موعد الانطلاق مطلوب — لا يُنشأ حجزٌ بلا موعد'
      using hint = 'pickup-required';
  end if;

  -- (أ-٢) 0031 — 🔒 تاريخ العودة يُتحقَّق **في SQL** (ف٧)
  --
  -- كل تحقق التواريخ اليوم في TypeScript (`app/api/booking/route.ts:138-151`)،
  -- وتاريخ العودة كان سيرث الفراغ نفسه. وهو **يُرفض لا يُتجاهل**: عودةٌ قبل
  -- الانطلاق تعني نموذجاً مقروءاً بالخطأ أو مستدعياً يعبث، وتجاهلها بصمت يُنتج
  -- حجزاً بساعات انتظار صفر بينما العميل يظن أنه دفع مقابل انتظار.
  if p_return_at is not null then
    if p_pickup_at is null then
      raise exception 'تاريخ العودة بلا تاريخ انطلاق' using hint = 'invalid-input';
    end if;
    if p_return_at <= p_pickup_at then
      raise exception 'تاريخ العودة يجب أن يكون بعد تاريخ الانطلاق'
        using hint = 'invalid-input';
    end if;
  end if;

  -- (أ-٢ب) 0067 — 🔒 أدنى مهلة قبل الانطلاق
  --
  -- الحدّ يُقرأ من `booking_min_pickup_at()` — **الدالة نفسها** التي يعرضها
  -- منتقي التاريخ في الحاسبة، فلا معادلة ثانية. و`null` منها يعني «مطفأة»
  -- فيسقط الشرط كله.
  --
  -- ⚠ **والموعد الغائب لا يُرفض هنا.** `p_pickup_at` يقبل `null` منذ 0007،
  -- وحجزٌ بلا موعد لا يخالف مهلةً أصلاً؛ ورفضُه هنا يكسر مستدعياً قائماً
  -- لسببٍ لا علاقة له بهذه القاعدة. أما مسار الحجز العام فيرسل الموعد دائماً.
  --
  -- ⚠ والمقارنة `<` لا `<=`: الموعد المساوي للحدّ **مقبول** — الحدّ هو أقرب
  -- لحظة مسموحة لا أول لحظة ممنوعة، وهو ما يعرضه المنتقي حرفياً. ولولا ذلك
  -- لصار ما تعرضه الشاشة بوصفه «أقرب موعد متاح» مرفوضاً عند الضغط.
  if p_pickup_at is not null then
    v_min_pickup := public.booking_min_pickup_at();
    if v_min_pickup is not null and p_pickup_at < v_min_pickup then
      select t.min_lead_minutes into v_lead from public.trip_config() t;
      raise exception
        'موعد الانطلاق أقرب من أدنى مهلة مطلوبة (% دقيقة) — أقرب موعد متاح %',
        v_lead, v_min_pickup
        using hint = 'lead-time';
    end if;
  end if;

  v_passengers := greatest(coalesce(p_passengers, 1), 1);
  v_round_trip := coalesce(p_round_trip, false);
  v_distance   := coalesce(p_distance_km, 0);
  v_luggage    := greatest(coalesce(p_luggage, 0), 0);

  -- (أ-٣) 0031 — الانتظار: **الأكبر** من المطلوب والمشتق، لا الاستبدال.
  --
  -- المشتق **أرضية لا سقف**: العميل قد يطلب انتظاراً أطول من فارق التوقيت (يريد
  -- السائق منتظراً ساعتين بعد عودته)، والاستبدالُ كان سيبتلع طلبه بصمت. والعكس
  -- ممنوع أيضاً: من يعود بعد ست ساعات لا يدفع ساعةً واحدة لأنه كتب ١ في الحقل.
  v_derived     := public.derive_waiting_hours(p_pickup_at, p_return_at);
  v_waiting     := greatest(coalesce(p_waiting_hours, 0), 0);
  v_derived_won := coalesce(v_derived, 0) > v_waiting;
  v_waiting     := greatest(v_waiting, coalesce(v_derived, 0));

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

  -- (أ-٥) 0140 — 🔴 المحطاتُ الوسطى: تحقّقٌ ثم تطبيع
  --
  -- ⚠ **التحقق على الخام قبل التطبيع بقصد**: التطبيع يقلّب `::numeric`، فمحطةٌ
  --   إحداثيتُها نصٌّ كانت ستنفجر بخطأ تحويلٍ إنجليزيّ (‏22P02) بدل رسالةٍ
  --   عربية برمزٍ يعرفه النموذج.
  --
  -- ⚠ **والفارغُ كالغائب**: `null` أو `[]` ⇒ لا مفتاح في اللقطة إطلاقاً، فلقطةُ
  --   كل حجزٍ بنقطتين تبقى مطابقةً حرفاً لما كانت قبل 0140 (D-60: الغيابُ ليس
  --   الفراغ — ومن يكتب الفراغَ حيث لا شيء يغيّر كلَّ لقطةٍ جديدة بلا سبب).
  --
  -- ⚠ **والتطبيع يُسقط كلَّ مفتاحٍ زائد**: ما يصل من الطلب قد يحمل `placeId`
  --   أو `sessionToken` أو أي حقلٍ من طبقة البحث، واللقطة تخرج كاملةً إلى
  --   `anon` عبر `get_booking_by_token`. فثلاثةُ مفاتيحَ وحدها تُخزَّن.
  if p_stops is not null and jsonb_typeof(p_stops) is distinct from 'null' then
    if jsonb_typeof(p_stops) <> 'array' then
      raise exception 'قائمة المحطات يجب أن تكون مصفوفة' using hint = 'stops-not-array';
    end if;

    if jsonb_array_length(p_stops) > 0 then
      -- قاعدةُ الشكل مصدرُها واحد: نفسُ الدالة التي يقرؤها قيدُ الجدول
      v_stop_reason := public.trip_stops_reject_reason(jsonb_build_object('stops', p_stops));

      if v_stop_reason is not null then
        raise exception 'محطةٌ وسطى غير صالحة (%)', v_stop_reason using hint = v_stop_reason;
      end if;

      v_stop_count := jsonb_array_length(p_stops);
      v_stop_max   := public.max_trip_stops();

      if v_stop_count > v_stop_max then
        raise exception 'عدد المحطات (%) يتجاوز الحدّ المسموح (%)', v_stop_count, v_stop_max
          using hint = 'stops-too-many';
      end if;

      select jsonb_agg(
               jsonb_build_object(
                 'label', btrim(e.item ->> 'label'),
                 'lat',   (e.item ->> 'lat')::numeric,
                 'lng',   (e.item ->> 'lng')::numeric
               )
               order by e.ord
             )
        into v_stops
      from jsonb_array_elements(p_stops) with ordinality as e(item, ord);
    end if;
  end if;

  -- (أ-٤) 🔒 د١ (0009) — المسافة تُقاس على الخريطة لا تُعلَن من المستدعي
  --
  -- ⚠ 0140: صارت السلسلةَ كاملة (منطلق ⇐ محطات ⇐ وجهة). **وبلا محطاتٍ الناتج
  --   مطابقٌ لـ`haversine_km` حرفاً**، فحاجزُ ٠٫٩× و٣× أدناه لم يتغيّر لأي حجزٍ
  --   قائم. ولولا ذلك لَرفض الحاجزُ كلَّ رحلةٍ بمحطةٍ منحرفة (المسار الحقيقي
  --   يتجاوز ثلاثة أضعاف الوتر بسهولة)، **ولَقبِل مسافةً مزوَّرة** في رحلةٍ
  --   محطاتُها متقاربة.
  v_hav := public.trip_straight_km(v_origin_lat, v_origin_lng, v_dest_lat, v_dest_lng, v_stops);

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
                          v_origin_lat, v_origin_lng, v_dest_lat, v_dest_lng,
                          v_luggage,
                          -- 0140 — 🔴 محطاتٌ ⇒ تعريفة. القرارُ في quote_price
                          -- وحدها، وهنا تمريرٌ لا نسخةٌ ثانية منه.
                          v_stops) q
  where q.class_slug = v_slug;

  perform set_config('tours.pricing_internals', '', true);

  -- الفئة غير المؤهلة **لركابٍ أو لحقائب** ⇒ نفس الرمز كما اليوم
  if v_offer.class_slug is null then
    raise exception 'الفئة «%» غير متاحة لرحلة بـ % راكباً و% حقيبة',
      v_slug, v_passengers, v_luggage
      using hint = 'class-unavailable';
  end if;

  if v_offer.total is null or v_offer.total <= 0 then
    raise exception 'تعذّر احتساب سعر الرحلة' using hint = 'pricing-failed';
  end if;

  -- (ب-٢) 🔒 الخصم — طبقة تالية لبناء السعر، والحاجز داخل apply_discount
  v_total  := v_offer.total;
  v_margin := v_offer.margin_amount;

  if v_code is not null then
    -- ⚠⚠ (ف٩) `v_offer.total` = **إجمالي الرحلة وحده**. الخدمات لم تُضف بعد
    -- ولن تُضاف قبل هذا السطر: الكوبون يخصم الرحلة لا كرسي الأطفال، وأرضية
    -- الهامش لا تعدّ إيراد الخدمات هامشاً (قرار بدر ب).
    select * into v_disc
    from public.apply_discount(v_code, v_offer.total, v_offer.class_slug,
                               v_offer.subcontractor_cost, v_phone);

    if not v_disc.applied then
      -- رسالة واحدة لكل الأسباب: التفريق يخبر من يخمّن الرموز أنه اقترب.
      raise exception 'رمز الخصم غير صالح لهذه الرحلة' using hint = 'coupon-rejected';
    end if;

    select c.kind into v_kind from public.coupons c where c.code = v_code;

    v_disc_amount := v_disc.amount;
    v_total       := v_disc.total_after;
    if v_margin is not null then
      v_margin := greatest(round(v_margin - v_disc.amount, 2), 0);
    end if;

    -- 🔒 **لا `clamped` في اللقطة.** `bookings.trip` يخرج كاملاً من
    -- `get_booking_by_token(text)` (0007) وهي ممنوحة لـ anon، فحاملُ توكن كان
    -- سيقرأ «سعر رحلتك لامس أرضية الهامش» ومنها التكلفة + الأرضية. والراية
    -- محفوظة في `coupon_redemptions.clamped` المحجوب عن غير المشرف.
    v_disc_json := jsonb_build_object(
      'code',        v_code,
      'kind',        v_kind,
      'amount',      v_disc.amount,
      'totalBefore', v_offer.total,
      'totalAfter',  v_disc.total_after
    );
  end if;

  -- (ب-٢ب) 0047 — ★ استبدال النقاط: طبقةٌ **ثالثة، بعد الكوبون وقبل الخدمات**
  --
  -- **بعد الكوبون** لأن النقاط مالٌ يملكه العميل سلفاً والكوبون تنزيلٌ من
  -- المنصة، فتُستهلك على ما **بقي** بعد تنزيلاتنا. و**قبل الخدمات** لأن الخدمة
  -- بندٌ تكلفته علينا، فشراؤها بنقاطٍ خسارةٌ صافية لا تنزيلُ ربح (§٢ · D-54).
  --
  -- 🔒 و`v_offer.total` هو المُمرَّر — **الإجمالي قبل الكوبون** — ومعه ما أخذه
  --    الكوبون: ميزانيةٌ واحدة تُقتسم، لا ميزانيةٌ ثانية تُفتح من `v_total`.
  v_want := greatest(coalesce(p_redeem_points, 0), 0);

  if v_want > 0 then
    select * into v_pts
    from public.apply_points(v_phone, v_want, v_offer.total, v_offer.class_slug,
                             v_offer.subcontractor_cost, v_disc_amount);

    if not v_pts.applied then
      -- رسالة واحدة لكل الأسباب كنظيرتها في الكوبون: تفصيلُ سبب الرفض يخبر
      -- من يجرّب أرقام غيره أين وقف بالضبط.
      raise exception 'تعذّر استبدال النقاط في هذه الرحلة' using hint = 'points-rejected';
    end if;

    v_loy_ok := true;
    v_total  := v_pts.total_after;
    if v_margin is not null then
      v_margin := greatest(round(v_margin - v_pts.amount, 2), 0);
    end if;

    -- ولا `clamped` هنا كذلك، وللسبب نفسه حرفياً (اللقطة تخرج إلى anon)
    v_loy_json := jsonb_build_object(
      'points',      v_pts.points,
      'amount',      v_pts.amount,
      'totalBefore', v_total + v_pts.amount,
      'totalAfter',  v_pts.total_after
    );
  end if;

  -- (ب-٣) 0031 — ★ الخدمات: طبقةٌ **بعد** الذروة و**بعد** الخصم معاً.
  --
  -- تُسعَّر مرة واحدة وتُحفظ سطورها في jsonb: نداءان لـ`price_extras` (واحد
  -- للمجموع وآخر للإدراج) كانا سيفتحان فرقاً لو عدّل المالك الكتالوج بين
  -- اللحظتين — فيُخزَّن سعرٌ غير الذي دخل الإجمالي.
  select
    coalesce(sum(x.line_total), 0),
    coalesce(
      jsonb_agg(jsonb_build_object(
        'extraId',   x.extra_id,
        'title',     x.title,
        'qty',       x.qty,
        'unitPrice', x.unit_price,
        'lineTotal', x.line_total
      )),
      '[]'::jsonb
    )
    into v_x_total, v_x_rows
  from public.price_extras(p_extras) x;

  v_total := v_total + v_x_total;

  -- (ج) العملة من إعدادات التسعير (لا نص ثابت في الكود)
  select ps.currency into v_currency from public.pricing_settings ps limit 1;
  v_currency := coalesce(v_currency, 'EGP');

  -- (د) العربون من مفتاح الإعدادات payment — **من الإجمالي النهائي**
  --     (بعد الخصم وبعد الخدمات: العربون نسبة مما يدفعه العميل فعلاً).
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
  --
  -- ⚠ (ف٦) هذه اللقطة تخرج **كاملة** إلى anon عبر `get_booking_by_token`، ولهذا
  -- ليس فيها تكلفة ولا هامش ولا `extra_id`: `extrasTotal` رقمٌ دفعه العميل،
  -- و`returnAt`/`luggage` مدخلاته هو، و`waitingDerived` تفسيرٌ له لا سرّ لنا.
  -- ⚠ (ف٨) وكل مفاتيح الإحداثيات باقية بأسمائها: `dispatch_pool` تُسقط الحجز
  -- إلى الطابور اليدوي إن غاب أيٌّ منها.
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
    'discount',       v_disc_json,
    -- 0031
    'returnAt',       p_return_at,
    'luggage',        v_luggage,
    'waitingDerived', v_derived_won,
    'extrasTotal',    v_x_total,
    -- 0047 — ⚠ **بعد `extrasTotal` ولا يغيّره**: مُشغّل الكسب يقرأ
    --        `total − extrasTotal`، فأي مساسٍ بهذا المفتاح يزيح أساس الكسب.
    'loyalty',        v_loy_json,
    -- 0067 — مُدخل عميلٍ يصف الرحلة، من صنف `notes`. **آخر المفاتيح** فلا
    --        يزيح شيئاً قبله، ولا رقم فيه ولا سرّ فيخرج إلى anon بلا ضرر.
    'flightNumber',   v_flight
  );

  -- 0140 — 🔴 **المفتاح يُضاف حين توجد محطاتٌ وحدها.**
  --
  -- لا `'stops', coalesce(v_stops, '[]')` داخل البناء أعلاه: ذلك كان سيكتب
  -- مفتاحاً جديداً في **كل** لقطةٍ من اليوم فصاعداً، فتفترق لقطاتُ الحجوزات
  -- الجديدة بنقطتين عن الثمانية عشر القائمة بلا أن يطلب أحدٌ ذلك — وكلُّ قارئٍ
  -- يجب أن يعامل الغياب والفراغ سواءً، وهو ما تفعله `trip_stops_*` أصلاً.
  if v_stops is not null then
    v_trip := v_trip || jsonb_build_object('stops', v_stops);
  end if;

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

  -- (ز-٠) 0031 — سطور الخدمات **بعد** إدراج الحجز (المفتاح الأجنبي) ومن نفس
  --        اللقطة التي دخلت الإجمالي، داخل المعاملة نفسها.
  if jsonb_array_length(v_x_rows) > 0 then
    insert into public.booking_extras (
      booking_id, extra_id, title_snapshot, qty, unit_price, line_total
    )
    select
      v_id,
      (e.item ->> 'extraId')::uuid,
      e.item ->> 'title',
      (e.item ->> 'qty')::integer,
      (e.item ->> 'unitPrice')::numeric,
      (e.item ->> 'lineTotal')::numeric
    from jsonb_array_elements(v_x_rows) as e(item);
  end if;

  -- (ز) 🔒 تسجيل الاستخدام **داخل نفس المعاملة**: فشلُه يُسقط الحجز كله، فلا
  --     يوجد حجز بسعر مخصوم بلا استخدام مسجَّل، ولا يتجاوز كوبونٌ سقفه لأن
  --     الخاسر في السباق تنهار معاملته بأكملها.
  if v_code is not null then
    perform set_config('tours.discount_clamped',
                       case when v_disc.clamped then 'on' else 'off' end, true);
    perform public.redeem_coupon(v_code, v_id, v_disc.amount, v_phone);
    perform set_config('tours.discount_clamped', '', true);
  end if;

  -- (ز-٢) 0047 — 🔒 وخصمُ النقاط بالمنطق نفسه وللسبب نفسه: القفل والكتابة
  --       داخل معاملة الحجز. فشلُه (رصيدٌ استُهلك في حجزٍ متزامن) يُسقط الحجز
  --       كله، فلا يوجد حجزٌ بسعرٍ مخصومٍ بنقاطٍ لم تُخصم من أحد (D-48).
  if v_loy_ok then
    perform public.redeem_points(v_id, v_phone, v_pts.points, v_pts.amount);
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
$function$;

revoke all on function public.create_booking(
  jsonb, jsonb, integer, boolean, numeric, numeric, numeric, text, text, text,
  text, text, text, timestamptz, text, text, timestamptz, integer, jsonb, integer, text, jsonb)
  from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.create_booking('
         || 'jsonb, jsonb, integer, boolean, numeric, numeric, numeric, text, text, text, '
         || 'text, text, text, timestamptz, text, text, timestamptz, integer, jsonb, integer, text, jsonb'
         || ') to service_role';
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- (١٠) `portal_trips` / `portal_offers` — المتعهد يرى ما سينفّذه
--
-- عمودُ `stops` يُلحَق **في آخر نوع الإرجاع** لا وسطه: القارئ في
-- `app/portal/requests/data.ts` يقرأ بالاسم، لكن إلحاقاً في الآخر يجعل الفارق
-- في أي مراجعةٍ قادمة سطراً مضافاً لا جدولاً مُعاد ترتيبه (سابقة `0027` و`0080`).
--
-- 🔴 وما لم يُضَف: **لا شيء آخر**. لا مرجعُ حجزٍ (D-46)، ولا إحداثيةٌ قبل
--    القبول (D-19)، ولا اسمُ عميلٍ في `portal_offers`.
-- ----------------------------------------------------------------------------
drop function if exists public.portal_trips();

create or replace function public.portal_trips()
returns table(
  offer_id uuid, booking_id uuid, reference text, origin_label text, dest_label text,
  distance_km numeric, passengers integer, round_trip boolean, waiting_hours numeric,
  class_title text, pickup_at timestamptz, payout numeric, currency text,
  expires_at timestamptz, notes text, customer_name text, customer_phone text,
  customer_whatsapp text, status text, assigned_at timestamptz,
  crew_vehicle_id uuid, crew_driver_id uuid, crew_by_admin boolean, crew_at timestamptz,
  flight_number text, completion_status text, completion_requested_at timestamptz,
  completion_auto_at timestamptz, completion_note text,
  stops jsonb
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    o.id,
    b.id,
    public.partner_trip_code(b.id),
    b.trip ->> 'originLabel',
    b.trip ->> 'destLabel',
    public.jsonb_number(b.trip, 'distanceKm', 0),
    coalesce(public.jsonb_number(b.trip, 'passengers', 1), 1)::integer,
    coalesce(b.trip ->> 'roundTrip', 'false') in ('true', 't', '1'),
    coalesce(public.jsonb_number(b.trip, 'waitingHours', 0), 0),
    b.class_title,
    nullif(btrim(coalesce(b.trip ->> 'pickupAt', '')), '')::timestamptz,
    d.assigned_payout,
    b.currency,
    d.assigned_at,
    b.trip ->> 'notes',
    b.customer_name,
    b.customer_phone,
    b.customer_whatsapp,
    b.status,
    d.assigned_at,
    d.assigned_vehicle_id,
    d.assigned_driver_id,
    d.crew_by_admin,
    d.crew_at,
    nullif(btrim(coalesce(b.trip ->> 'flightNumber', '')), ''),
    -- طلبُ الإتمام الأحدث لهذه الرحلة — وهو طلبُ هذا المتعهد بحكم شرط الإسناد
    r.status, r.requested_at, r.auto_approve_at, r.decision_note,
    -- 0140 — المحطاتُ كاملةً بإحداثياتها: **بعد الإسناد** والمتعهد يقود إليها.
    -- وحجبُها هنا يجعل الرحلةَ غيرَ قابلةٍ للتنفيذ، وهو نفسُ الحدّ الذي تقف
    -- عنده هذه الدالة حين تُعطي اسمَ العميل وهاتفه.
    public.trip_stops_full(b.trip)
  from public.dispatches d
  join public.bookings b on b.id = d.booking_id
  left join public.trip_offers o
    on o.booking_id       = d.booking_id
   and o.subcontractor_id = d.assigned_subcontractor_id
   and o.status           = 'accepted'
  left join lateral (
    select cr.status, cr.requested_at, cr.auto_approve_at, cr.decision_note
    from public.trip_completion_requests cr
    where cr.booking_id = d.booking_id
      and cr.subcontractor_id = d.assigned_subcontractor_id
    order by cr.requested_at desc
    limit 1
  ) r on true
  where d.assigned_subcontractor_id = public.current_subcontractor_id()
    and public.current_subcontractor_id() is not null
    and d.status  = 'assigned'
    and b.status in ('assigned', 'completed', 'cancelled', 'failed')
  order by nullif(btrim(coalesce(b.trip ->> 'pickupAt', '')), '')::timestamptz asc nulls last,
           d.assigned_at desc;
$function$;

drop function if exists public.portal_offers();

create or replace function public.portal_offers()
returns table(
  offer_id uuid, reference text, origin_label text, dest_label text,
  distance_km numeric, passengers integer, round_trip boolean, waiting_hours numeric,
  class_title text, pickup_at timestamptz, payout numeric, currency text,
  expires_at timestamptz, notes text,
  stops jsonb
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    o.id,
    -- 0028: رمز المتعهد لا مرجع العميل — العامل الأول في «تابع حجزك»
    public.partner_trip_code(b.id),
    public.dispatch_public_label(b.trip ->> 'originLabel'),
    public.dispatch_public_label(b.trip ->> 'destLabel'),
    public.jsonb_number(b.trip, 'distanceKm', 0),
    coalesce(public.jsonb_number(b.trip, 'passengers', 1), 1)::integer,
    coalesce(b.trip ->> 'roundTrip', 'false') in ('true', 't', '1'),
    coalesce(public.jsonb_number(b.trip, 'waitingHours', 0), 0),
    b.class_title,
    nullif(btrim(coalesce(b.trip ->> 'pickupAt', '')), '')::timestamptz,
    o.payout,
    b.currency,
    o.expires_at,
    public.dispatch_safe_notes(b.trip ->> 'notes'),
    -- 0140 — 🔴 **وسومٌ معمّاة بلا إحداثيات**: نفسُ حاجب `originLabel` و
    -- `destLabel` أعلاه. المتعهد يعرف أن في الرحلة محطاتٍ وأين هي **تقريباً**
    -- فيقرّر قبولَه على بيّنة، ولا يبلغ العنوان الدقيق قبل أن يقبل (D-19).
    public.trip_stops_public(b.trip)
  from public.trip_offers o
  join public.bookings b   on b.id = o.booking_id
  join public.dispatches d on d.booking_id = o.booking_id
  where o.subcontractor_id = public.current_subcontractor_id()
    and public.current_subcontractor_id() is not null
    and o.status     = 'pending'
    and o.expires_at > now()
    and d.status     = 'broadcasting'
    and b.status     = 'confirmed'
    -- 0027: من بلغ سقف دينه لا يرى العرض القديم — فلا يبقى زرٌّ يفشل دائماً
    and not public.partner_over_debt_limit(o.subcontractor_id)
    -- 0113: ونفس المنطق حرفياً لمن انقضت مهلته ولم يقبل الاتفاقية — العرضُ
    --       الذي بُثّ قبل انقضاء المهلة لا يبقى زرّاً يرفضه `accept_offer`
    and public.partner_agreement_ok(o.subcontractor_id)
  order by o.expires_at asc;
$function$;

-- المنحُ يُعاد كما كان مقيساً قبل الإسقاط: authenticated (وهو المتعهد نفسه،
-- والنطاق داخل التوقيع عبر `current_subcontractor_id()` — D-51) و service_role.
revoke all on function public.portal_trips()  from public, anon;
revoke all on function public.portal_offers() from public, anon;

do $$
declare
  v_role text;
begin
  foreach v_role in array array['authenticated', 'service_role'] loop
    if exists (select 1 from pg_roles where rolname = v_role) then
      execute format('grant execute on function public.portal_trips() to %I', v_role);
      execute format('grant execute on function public.portal_offers() to %I', v_role);
    end if;
  end loop;
end;
$$;

comment on function public.portal_trips() is
  'رحلاتُ المتعهد بعد الإسناد — نطاقُها داخل التوقيع عبر current_subcontractor_id(). منذ 0140 تحمل stops كاملةً بإحداثياتها: المتعهد يقود إليها. ولا مرجعَ حجزٍ فيها أبداً (D-46) بل partner_trip_code.';

comment on function public.portal_offers() is
  'عروضُ المتعهد قبل القبول — بلا عمود عميلٍ ولا سعرٍ في نوع الإرجاع أصلاً (D-19). منذ 0140 تحمل stops **معمّاةً بلا إحداثيات**: يعرف أن في الرحلة محطاتٍ وأين تقريباً فيقرّر، ولا يبلغ العنوان الدقيق قبل القبول.';

-- ----------------------------------------------------------------------------
-- (١١) الفحوص الذاتية
-- ----------------------------------------------------------------------------

-- (١١-أ) 🔴 ما وعدنا ألّا نمسّه — لم يُمسّ
--
-- المقارنةُ بما قِيس في القسم (٠) **من هذه الجلسة نفسها**، لا برقمٍ محفور:
-- الرقم المحفور كان سيُسقط إعادةَ التنفيذ بعد أي هجرةٍ لاحقةٍ مشروعة تمسّ
-- هذه الدوال، فيتحوّل الحارسُ إلى عائق. وهذا يقيس **ما فعله هذا الملف** وحده.
do $$
declare
  v_now  text;
  v_then text;
  v_bad  text := '';
begin
  v_then := current_setting('tours.m0140_cov_matches', true);
  v_now  := md5(pg_get_functiondef('public.coverage_matches(numeric,numeric,numeric,numeric)'::regprocedure));
  if v_then is not null and v_then <> v_now then v_bad := v_bad || 'coverage_matches، '; end if;

  v_then := current_setting('tours.m0140_cov_best', true);
  v_now  := md5(pg_get_functiondef('public.coverage_best_costs(numeric,numeric,numeric,numeric)'::regprocedure));
  if v_then is not null and v_then <> v_now then v_bad := v_bad || 'coverage_best_costs، '; end if;

  v_then := current_setting('tours.m0140_pool', true);
  v_now  := md5(pg_get_functiondef('public.dispatch_pool(uuid,integer)'::regprocedure));
  if v_then is not null and v_then <> v_now then v_bad := v_bad || 'dispatch_pool، '; end if;

  v_then := current_setting('tours.m0140_ceiling', true);
  v_now  := md5(pg_get_functiondef('public.dispatch_ceiling(uuid,integer)'::regprocedure));
  if v_then is not null and v_then <> v_now then v_bad := v_bad || 'dispatch_ceiling، '; end if;

  if v_bad <> '' then
    raise exception
      '0140 (١١-أ): 🔴 بصمةُ دالةٍ تعهّدنا بعدم مسّها تغيّرت — %', rtrim(v_bad, '، ');
  end if;

  -- شاهدٌ إيجابي: لو ضاعت البصمةُ المحفوظة لكان الفحص أعلاه ينجح بلا أن يفحص
  if current_setting('tours.m0140_pool', true) is null then
    raise exception
      '0140 (١١-أ): آليةُ البصمة معطَّلة — لم تُحفظ بصمةُ dispatch_pool في القسم (٠)';
  end if;
end;
$$;

-- (١١-ب) 🔒 D-58 — الشواهدُ السبعةُ على ما كان قائماً في `quote_price`
--
-- الفحصُ يحرس **ما كان** لا ما أضفناه: كلُّ إصلاحٍ سابق في هذه الدالة له أثرٌ
-- نصّيّ يميّزه، فليكن هو ما يُفحص. ولولا هذا الشكل لَعاد عيبُ `0031` نفسه —
-- جسمٌ منسوخٌ من هجرةٍ قديمة يُعيد انحداراً أُصلح قبله بثمانية عشر ملفاً.
do $$
declare
  v_def  text := pg_get_functiondef(
    'public.quote_price(numeric,integer,boolean,numeric,numeric,numeric,numeric,numeric,integer,jsonb)'::regprocedure);
  v_miss text := '';
  v_w    record;
begin
  for v_w in
    select * from (values
      ('as materialized',                              '0112 · حاجزُ التسعير المادّي'),
      ('vc.luggage_capacity >= b.luggage',              '0031 · شرطُ الحقائب في الأهلية (D-12)'),
      ('order by cb.cost, cb.subcontractor_id',         '0132 · حسمُ التعادل بالمعرّف'),
      ('public.pricing_internals_visible()',            '0011 · حاجبُ التكلفة والهامش (D-20)'),
      ('q.pre_peak - q.row_waiting_cost - q.applied_cost', 'معادلةُ الهامش — الانتظار مطروح'),
      ('greatest(p.raw_subtotal, p.min_price)',         'أرضيةُ الفئة قبل معامل العودة'),
      ('f.sub_cost * (case when f.round_trip',          'معاملُ العودة يضرب التكلفة كما يضرب السعر')
    ) as w(needle, why)
  loop
    if position(v_w.needle in v_def) = 0 then
      v_miss := v_miss || v_w.why || ' | ';
    end if;
  end loop;

  if v_miss <> '' then
    raise exception '0140 (١١-ب): 🔴 شاهدٌ سابق سقط من جسم quote_price — %', rtrim(v_miss, ' | ');
  end if;

  -- وشاهدُ الإضافة نفسِها — وهو **الأضعف** بقصد: وجودُ الجديد لا يقول شيئاً
  -- عن بقاء القديم، وهذا بالضبط ما جعل فحصَ 0031 أعمى.
  if position('not b.has_stops' in v_def) = 0 then
    raise exception '0140 (١١-ب): شرطُ المحطات لم يدخل covered — الرحلةُ بمحطاتٍ ستأخذ تكلفةَ متعهد';
  end if;
end;
$$;

-- (١١-ج) المنحُ بعد الإسقاط — لم ينفتح شيء ولم ينغلق ما كان مفتوحاً
do $$
declare
  v_qp constant text :=
    'public.quote_price(numeric,integer,boolean,numeric,numeric,numeric,numeric,numeric,integer,jsonb)';
  v_qpub constant text :=
    'public.quote_public(numeric,integer,boolean,numeric,numeric,numeric,numeric,numeric,text,integer,jsonb,jsonb)';
  v_cb constant text :=
    'public.create_booking(jsonb,jsonb,integer,boolean,numeric,numeric,numeric,text,text,text,text,text,text,timestamptz,text,text,timestamptz,integer,jsonb,integer,text,jsonb)';
  v_pub integer;
begin
  -- (أ) ما يجب أن يبقى مغلقاً
  if has_function_privilege('anon', v_qp, 'execute')
     or has_function_privilege('authenticated', v_qp, 'execute') then
    raise exception '0140 (١١-ج): quote_price انفتحت لدورٍ عام — وهي تحمل التكلفة والهامش (D-20)';
  end if;
  if has_function_privilege('anon', v_cb, 'execute')
     or has_function_privilege('authenticated', v_cb, 'execute') then
    raise exception '0140 (١١-ج): create_booking انفتحت لدورٍ عام (D-09)';
  end if;
  if has_function_privilege('anon', 'public.portal_trips()', 'execute')
     or has_function_privilege('anon', 'public.portal_offers()', 'execute') then
    raise exception '0140 (١١-ج): دالةُ بورتالٍ انفتحت لـanon';
  end if;
  if has_function_privilege('anon', 'public.max_trip_stops()', 'execute')
     or has_function_privilege('authenticated', 'public.max_trip_stops()', 'execute')
     or has_function_privilege('authenticated', 'public.trip_stops_public(jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public.trip_stops_full(jsonb)', 'execute') then
    raise exception '0140 (١١-ج): دالةٌ مساعدةٌ انفتحت لدورٍ عام';
  end if;

  -- (ب) وما يجب أن يبقى **مفتوحاً** — الإسقاط يمحو المنح، والسكوت يكسر الموقع
  if not has_function_privilege('anon', v_qpub, 'execute') then
    raise exception '0140 (١١-ج): quote_public لم تعد متاحةً لـanon — الموقع لا يسعّر';
  end if;
  if not has_function_privilege('authenticated', 'public.portal_trips()', 'execute')
     or not has_function_privilege('authenticated', 'public.portal_offers()', 'execute') then
    raise exception '0140 (١١-ج): دوالُّ البورتال لم تعد متاحةً للمتعهد';
  end if;
  if not has_function_privilege('service_role', v_cb, 'execute') then
    raise exception '0140 (١١-ج): create_booking لم تعد متاحةً لـservice_role — لا حجزَ ينشأ';
  end if;

  -- 🔴 ودالّتا القيد **يجب** أن تبقيا مفتوحتين لـauthenticated: تعبيرُ `check`
  -- يُقيَّم بصلاحيات الكاتب، واللوحة تُحدّث `bookings` بدور `authenticated`.
  -- «تشديدٌ» هنا يقفل اللوحةَ خارج جدول الحجوزات ولا يحمي شيئاً (الدالتان بلا
  -- قراءةٍ من أي جدول).
  if not has_function_privilege('authenticated', 'public.trip_stops_reject_reason(jsonb)', 'execute')
     or not has_function_privilege('authenticated', 'public.point_in_service_area(numeric,numeric)', 'execute') then
    raise exception
      '0140 (١١-ج): 🔴 دالّةُ قيدٍ سُحبت من authenticated — أولُ تعديلِ حجزٍ من اللوحة سيُرفض بـpermission denied';
  end if;

  -- (ج) ولا منحةَ PUBLIC ضمنية على أيٍّ من الجديدات
  select count(*) into v_pub
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  cross join lateral unnest(coalesce(p.proacl, '{}'::aclitem[])) a(item)
  where n.nspname = 'public'
    and p.proname in ('quote_price', 'quote_public', 'create_booking',
                      'portal_trips', 'portal_offers',
                      'max_trip_stops', 'trip_stops_full', 'trip_stops_public')
    and a.item::text like '=%';

  if v_pub > 0 then
    raise exception '0140 (١١-ج): % منحةَ PUBLIC ضمنية على دوالِّ هذه الهجرة', v_pub;
  end if;
end;
$$;

-- (١١-د) 🔴 التوافقُ الرجعيّ سلوكاً: بلا محطاتٍ لا شيء يتغيّر
--
-- ثلاثةُ توكيداتٍ لا تكتب حرفاً في أي جدول:
--   ١) `trip_straight_km` بلا محطات = `haversine_km` **بالضبط** — وهو ما يجعل
--      حاجزَ D-09 في `create_booking` غيرَ متغيّرٍ لأي حجزٍ قائم.
--   ٢) ومع محطةٍ منحرفة **تفترق عنه** — وإلا كانت الدالةُ زينةً تُجمع رِجلاً
--      واحدة مهما أُعطيت.
--   ٣) وغيابُ المفتاح شكلٌ **سليم** — وهو عقدُ الثمانيةَ عشرَ حجزاً القائمة.
do $$
declare
  v_direct numeric := public.haversine_km(30.0444, 31.2357, 31.2001, 29.9187);
  v_none   numeric := public.trip_straight_km(30.0444, 31.2357, 31.2001, 29.9187, null);
  v_via    numeric := public.trip_straight_km(30.0444, 31.2357, 31.2001, 29.9187,
                        '[{"label":"واحة سيوة","lat":29.2032,"lng":25.5195}]'::jsonb);
begin
  if v_none is distinct from v_direct then
    raise exception
      '0140 (١١-د-١): 🔴 trip_straight_km بلا محطات = % بينما haversine_km = % — الرحلةُ بنقطتين لم تعد حالةً خاصةً من متعددة الأرجل',
      v_none, v_direct;
  end if;

  if v_via <= v_direct then
    raise exception
      '0140 (١١-د-٢): المسارُ عبر واحةٍ منحرفة (%) ليس أطولَ من المباشر (%) — الدالةُ لا تجمع الأرجل',
      v_via, v_direct;
  end if;

  if public.trip_stops_reject_reason('{"originLabel":"أ"}'::jsonb) is not null then
    raise exception '0140 (١١-د-٣): 🔴 لقطةٌ بلا مفتاح stops رُفضت — كلُّ حجزٍ قائمٍ سيصير غيرَ قابلٍ للتحديث';
  end if;

  if public.trip_stops_full('{"originLabel":"أ"}'::jsonb) <> '[]'::jsonb
     or public.trip_stops_public('{"originLabel":"أ"}'::jsonb) <> '[]'::jsonb then
    raise exception '0140 (١١-د-٤): غيابُ المفتاح لم يُترجَم إلى مصفوفةٍ فارغة في إسقاطات البورتال';
  end if;
end;
$$;

-- (١١-هـ) قاعدةُ الشكل تفرّق بين الأسباب — رمزٌ لكل سبب لا رمزٌ واحد
do $$
declare
  v_case record;
  v_got  text;
begin
  for v_case in
    select * from (values
      ('{"stops": "x"}',                                              'stops-not-array'),
      ('{"stops": [1]}',                                              'stop-not-object'),
      ('{"stops": [{"lat":30,"lng":31}]}',                            'stop-label-missing'),
      ('{"stops": [{"label":"م","lat":30}]}',                         'stop-coords-missing'),
      ('{"stops": [{"label":"م","lat":"30","lng":"31"}]}',            'stop-coords-missing'),
      ('{"stops": [{"label":"دبي","lat":25.197,"lng":55.274}]}',      'stop-out-of-area'),
      ('{"stops": [{"label":"م","lat":1e400,"lng":31}]}',             'stop-out-of-area'),
      ('{"stops": []}',                                               null::text),
      ('{"stops": [{"label":"الجيزة","lat":30.0131,"lng":31.2089}]}', null::text)
    ) as c(trip, expect)
  loop
    v_got := public.trip_stops_reject_reason(v_case.trip::jsonb);
    if v_got is distinct from v_case.expect then
      raise exception
        '0140 (١١-هـ): «%» أعطت «%» والمتوقع «%»',
        v_case.trip, coalesce(v_got, 'سليمة'), coalesce(v_case.expect, 'سليمة');
    end if;
  end loop;
end;
$$;
