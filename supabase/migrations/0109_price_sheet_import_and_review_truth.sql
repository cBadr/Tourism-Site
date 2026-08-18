-- ============================================================================
-- 0109_price_sheet_import_and_review_truth.sql
-- كشوف الأسعار: خليةٌ فارغة لا تقلب مساراً، وزرُّ الاعتماد لا يكتب أكثر مما عُرض.
--
-- كلا العيبين يُطلقان **عند حجم المالك بالضبط**: ~١٠٠ مسار من كشوف متعهد حقيقي.
--
-- ── العيب الأول: الاعتماد أوسع من الشاشة ───────────────────────────────────
--
-- مقيسٌ حيّاً 2026-08-18 (‏كل شيء داخل `begin … rollback`، متعهدٌ وهمي بأسطوله):
--
--   استيراد ١٢٠ مساراً ⇒ مقبول=120 مرفوض=0
--   pending في الكشف                     : 120
--   ما يعرضه استعلام الطابور (‏limit 100) : 100
--   review_price_sheet(id, true) أثّرت في: 120   ← بهوية مشرف حقيقية
--
-- الصفحة تقرأ `price_lists` بـ`order by created_at asc limit 100` **عبر كل
-- المتعهدين**، وتعنون الزرّ بـ`lists.length`، بينما الدالة تكتب على **كل** صفٍّ
-- `pending` في الكشف بلا علمٍ بما عُرض. فالفارق يدخل `coverage_matches` ويُسعّر
-- عروضاً حقيقية بتكاليف لم يرها أحد. **والسقف عالميّ** ⇒ ثلاثون مساراً تكفي
-- لو سبقتها ثمانون من متعهدٍ آخر.
--
-- 🔑 القرار — ثلاثيّ، لا واحد:
--   (١) **الشاشة تعرض كل ما ستعتمده**: الطابور يُبنى من `price_sheet_stats`
--       (‏عدّاد `pending_count` المرجعي) ويسحب مسارات كل كشفٍ يعرضه كاملةً؛
--       والسقف صار على **عدد البطاقات** لا على عدد الصفوف المعتمَدة.
--   (٢) **القاعدة ترفض أي انحراف**: `review_price_sheet` تأخذ `p_expected` —
--       العدد الذي طُبع على الزرّ — وتقارنه بما تُمسكه فعلاً `for update`.
--       اختلافٌ بواحد ⇒ **لا كتابة إطلاقاً** ورسالةٌ عربية بالرقمين.
--   (٣) **والكتابة تقع على الصفوف المقفولة بأعيانها** (`where id = any(v_ids)`)
--       لا على شرط `status='pending'` ⇒ صفٌّ يصير `pending` بعد العدّ (‏المتعهد
--       يملك `draft ⇒ pending` بيده) **لا يُعتمد بالخطأ**، لا يُعتمد أصلاً.
--
-- ⚠ ولماذا `p_expected` **إلزاميّ** لا اختياريّ: الاختياريُّ يجعل الضمانة رهن
--   انضباط كل مُنادٍ لاحق. الإلزاميُّ يجعل «نداءٌ بلا تصريحٍ بالعدد» خطأً — أي
--   يستحيل بنيوياً أن يعتمد أحدٌ دفعةً وهو لا يعرف كم فيها. وهذا هو الفرق بين
--   «صحيحٌ اليوم» و«لا يستطيع أن ينحرف».
--
-- ── العيب الثاني: خليةٌ فارغة تقلب المسار إلى اتجاهٍ واحد صامتاً ────────────
--
-- مقيسٌ حيّاً على نفس الجولة، سبعة أشكال في ملفٍ واحد:
--
--   | القيمة في العمود | `bidirectional` المكتوب | الحكم |
--   |---|---|---|
--   | `"true"`         | **true**  | صحيح |
--   | العمود **غائب**  | **true**  | صحيح (الافتراض المكتوب) |
--   | `"نعم"`          | **true**  | صحيح |
--   | `""` (‏خانة فارغة) | 🔴 **false** | خطأ |
--   | `"   "` (‏مسافات) | 🔴 **false** | خطأ |
--   | `"maybe"` (‏خطأ طباعة) | 🔴 **false** | خطأ |
--   | `"false"`        | false | صحيح |
--
-- السطر: `coalesce(el ->> 'bidirectional', 'true')` في 0102:581. و**`''` ليست
-- `null`** فلا يلتقطها `coalesce`، فتسقط خارج قائمة القبول ⇒ `false`. والتقرير
-- يقول `accepted = t` ولا يقول حرفاً. والقارئ من CSV يكتب `""` لكل خانة فارغة
-- (`app/portal/prices/_lib/csv.ts`) ⇒ **الطريق مفتوح من الملف مباشرةً**.
--
-- 💰 والأثر نقديّ لا تجميلي: `coverage_matches` لا تفحص الاتجاه المعكوس إلا حين
--    `pl.bidirectional` ⇒ رحلة العودة تخرج من التغطية وتُسعَّر بتعريفة الكيلومتر
--    بدل تكلفة أرخص متعهد. **والقالب المنزَّل يكتب `true` في صفّيه** ⇒ العيب
--    يصيب بالضبط الصفوف التي يضيفها المتعهد بيده — أي سيناريو المالك حرفاً.
--
-- 🔑 القرار: **ثلاثيّ الحالات لا ثنائيّ.** غيابٌ/فراغ ⇒ `true` (‏الافتراض كما
--    هو). قيمةٌ معروفة ⇒ قيمتها. **قيمةٌ مكتوبةٌ غير مفهومة ⇒ رفض الصفّ برسالة
--    تسمّيها.** فـ`coalesce` وحدها كانت تُصلح `''` وتترك `maybe` تقلب المسار.
--
-- ── ومراجعة كل `coalesce(el ->> …)` في المستورد، بنداً بنداً ────────────────
--
--   • `title`             — سليم (‏`nullif(btrim(…),'')`)
--   • `originLabel`/`destLabel` — 🟡 **عمياء جزئياً**: `coalesce(el->>'originLabel',
--     el->>'origin_label','')` ⇒ لو جاء الاسمان معاً والأولُ `""` **حُجب الثاني**.
--     غير بالغٍ من CSV (‏القارئ يوحّد الاسمين في camelCase) وبالغٌ من نداء RPC
--     مباشر — وكلاهما مُنح لـ`authenticated`.
--   • `originLat/Lng`, `destLat/Lng` — 🟡 نفس الحجب. وأخطرُ منه: نصٌّ مكتوبٌ
--     **غير قابل للتحويل** (`"30,04"`) ⇒ `numeric_or_null` تُرجع `null` ⇒ الصفّ
--     يأخذ إحداثيات **نقطةٍ أخرى بنفس الاسم من صفٍّ أسبق** بلا كلمة. صامتٌ وخطر.
--   • `originRadiusKm`/`destRadiusKm` — 🟠 نصٌّ غير رقمي ⇒ `null` ⇒ `coalesce(…, 25)`
--     ⇒ **٢٥ كم صامتة**. المتعهد كتب شيئاً وحصل على غيره بلا تقرير.
--   • `prices ->> k` — سليم: الفارغ يُهمَل، وغيرُ الرقمي يُرفض برسالة «تكلفة غير صالحة».
--   • `v_hint ->> 'lat'|'lng'|'radius'` — بناؤنا نحن لا مدخلُ مستخدم.
--
--   ⇒ العلاج **بنيويّ لا سطريّ**: `public.import_field()` تقرأ أول قيمةٍ
--     **غير فارغة بعد التشذيب** بين أسماء بديلة ⇒ `''` تساوي الغياب في كل موضع
--     دفعةً واحدة، ولا يبقى موضعٌ يُنسى.
--
-- ── وعيبان آخران في نفس الملف، مقيسان ──────────────────────────────────────
--
-- (أ) **خطأ Postgres بالإنجليزية يصل المتعهد**: عمودا فئة يؤولان إلى نفس الـslug
--     (`suv` و`SUV`) يمرّان من الفحص (`accepted = t`) ثم يفشلان عند الكتابة بـ
--     `تعذّرت الكتابة: ON CONFLICT DO UPDATE command cannot affect row a second time`.
--     البيانات سليمة والنصّ غير مقروء. ⇒ يُلتقط في **الفحص** برسالة عربية تسمّي
--     العمودين، فيراه المتعهد قبل أن يضغط «استيراد».
--
-- (ب) **إعادة استيرادٍ تُسقط فئةً كانت مسعَّرة، بلا كلمة**: مسارٌ بفئتين يُعاد
--     استيراده بعمود فئةٍ واحد ⇒ ينتهي بفئة (`delete` ثم `insert`)، والتقرير
--     `accepted=t · action=updated · classes_saved=1 · reason=null`.
--
--     **القرار: تُحفظ الدلالة ويُرفع الصوت — لا رفضٌ ولا دمج.** ولماذا:
--       • **الدمج خطر**: المتعهد قد يكون حذف العمود لأنه لم يعد ينفّذ تلك الفئة؛
--         فالدمج يُبقي تكلفةً بائتة **حيّةً في التسعير**. صمتٌ في المال.
--       • **الرفض مُفرِط**: يمنع ملفَّ تصحيحٍ مشروعاً ويُعيد المالك إلى تحرير كل
--         مسار بيده — وهو بالضبط ما وُلدت 0102 لإلغائه.
--       • **والضرر محصور ومقيس**: الاستيراد **لا يلمس معتمداً ولا `pending`**
--         (يرفضهما برسالة، مقيسٌ في (و‑٩) و(ط‑٤) من مجموعة الاختبار) ⇒ الإسقاط
--         لا يقع إلا على مسودةٍ لم تدخل التغطية بعد.
--       ⇒ الصفّ يبقى مقبولاً، ويحمل في عمود «السبب» تنبيهاً **يسمّي كل فئة
--         ساقطة وتكلفتها**، **وفي الفحص كما في التنفيذ** — فيراه قبل الكتابة.
--
-- ⛔ ما لم يُلمس، عمداً: `price_lists` و`price_list_items` و`coverage_matches`
--    و`quote_price` و`dispatch_pool` و`price_sheet_classes` و`submit_price_sheet`
--    و`price_sheet_stats` و`upsert_price_sheet` — كلها بحرفها. رياضيات المال
--    وأرضية الهامش وسرّية التكلفة (D‑19) خارج مسار هذا الملف تماماً.
--
-- الأقسام:
--   (١) `import_field` — قراءة حقلٍ نصيّ تعتبر الفراغ غياباً
--   (٢) `import_price_sheet_rows` — نفس البصمة، تحقّقٌ لا يصمت
--   (٣) `review_price_sheet` — `p_expected` إلزاميّ + قفلٌ على الصفوف بأعيانها
--   (٤) الصلاحيات
--   (٥) فحصٌ ذاتي — الهجرة تُثبت أثرها بنفسها
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (١) قراءة حقلٍ نصيّ من صفّ الملف — **الفراغ غياب**
--
-- تُرجع أول قيمةٍ غير فارغة بعد التشذيب بين الأسماء البديلة، أو `null`.
-- وبها يستحيل أن يعود عيبُ «`''` ليست `null`» في حقلٍ جديد يُضاف لاحقاً: لا
-- يوجد `coalesce(el ->> …, '…')` في المستورد بعد هذه الهجرة إطلاقاً.
-- ----------------------------------------------------------------------------
create or replace function public.import_field(p_row jsonb, variadic p_keys text[])
returns text
language sql
immutable
set search_path = ''
as $$
  select v
  from unnest(p_keys) with ordinality as k(key, ord)
  cross join lateral (select nullif(btrim(coalesce(p_row ->> k.key, '')), '')) t(v)
  where v is not null
  order by k.ord
  limit 1;
$$;

comment on function public.import_field(jsonb, text[]) is
  'أول قيمة نصية غير فارغة بين مفاتيح بديلة في صفّ استيراد — الخانة الفارغة تساوي الغياب.';

-- ----------------------------------------------------------------------------
-- (٢) الاستيراد الجماعي — **نفس البصمة والدلالة**، والفرق كلُّه في التحقق
--
-- p_rows: مصفوفة كائنات، كل كائن مسار:
--   { "title":"القاهرة ← الإسكندرية",
--     "originLabel":"القاهرة", "originLat":30.04, "originLng":31.24, "originRadiusKm":25,
--     "destLabel":"الإسكندرية", "destLat":31.20, "destLng":29.92, "destRadiusKm":25,
--     "bidirectional":true,
--     "prices": { "suv":1500, "minibus":2200 } }
--
-- p_commit = false ⇒ **فحصٌ بلا كتابة**، ونتيجته مطابقة تماماً لنتيجة التنفيذ
--            (‏بما في ذلك تنبيه الفئات الساقطة، وحلّ الإحداثيات من نقاطٍ عرّفها
--            صفٌّ أسبق في نفس الملف).
-- p_commit = true  ⇒ يكتب المقبول ويترك المرفوض، ويعيد التقرير نفسه.
--
-- 🔴 لماذا لا يُرمى استثناء عند صفٍّ فاسد: كل نداء PostgREST معاملةٌ واحدة (D‑48)،
--    فرميُ الخطأ يمحو المئة صفّ الصحيحة معه. ولذلك كل كتابة صفٍّ داخل كتلة
--    `exception` خاصة بها (‏معاملةٌ فرعية) — فشلُ صفٍّ يُسجَّل ولا يجرف الدفعة.
--
-- 🔴 والاستيراد **لا يلمس مساراً معتمداً ولا مساراً قيد المراجعة**: تعديلهما من
--    ملفٍّ يُرفع بالجملة يسحب تغطيةً حيّة أو يبدّل ما على مكتب المشرف بلا أن يرى
--    أحدٌ ذلك. يُكتب في الجديد وفي المسودة والمرفوضة فقط، والباقي يُرفض برسالة.
-- ----------------------------------------------------------------------------
create or replace function public.import_price_sheet_rows(
  p_sheet_id         uuid,
  p_rows             jsonb,
  p_commit           boolean default false,
  p_subcontractor_id uuid default null
)
returns table (
  row_no        integer,
  accepted      boolean,
  action        text,
  route_title   text,
  classes_saved integer,
  reason        text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_sub      uuid;
  v_sheet    record;
  v_points   jsonb := '{}'::jsonb;   -- خريطة اسم النقطة ← {lat,lng,radius}
  v_covered  text[];
  v_seen     text[] := '{}';         -- عناوين رأيناها في هذه الدفعة (كشف التكرار)
  el         jsonb;
  v_i        integer := 0;
  v_reasons  text[];
  v_warn     text;                   -- تنبيهٌ على صفٍّ **مقبول** (لا يمنع الكتابة)
  v_title    text;
  v_olabel   text;
  v_dlabel   text;
  v_olat_t   text;                   -- النصّ الخام: يفرّق «غائب» عن «مكتوبٌ فاسد»
  v_olng_t   text;
  v_dlat_t   text;
  v_dlng_t   text;
  v_orad_t   text;
  v_drad_t   text;
  v_bidi_t   text;
  v_olat     numeric;
  v_olng     numeric;
  v_dlat     numeric;
  v_dlng     numeric;
  v_orad     numeric;
  v_drad     numeric;
  v_bidi     boolean;
  v_prices   jsonb;
  v_items    jsonb;
  v_bad      text;
  v_ex_id    uuid;
  v_ex_st    text;
  v_ex_sh    uuid;
  v_id       uuid;
  v_action   text;
  v_saved    integer;
  v_hint     jsonb;
  v_key      text;
begin
  -- (أ) الهوية والكشف
  if p_subcontractor_id is not null then
    if not public.is_admin() then
      raise exception 'الاستيراد نيابة عن متعهد آخر متاح للمشرف وحده' using hint = 'forbidden';
    end if;
    v_sub := p_subcontractor_id;
  else
    v_sub := public.current_subcontractor_id();
  end if;

  if v_sub is null then
    raise exception 'لا يوجد حساب متعهد مرتبط بهذه الجلسة' using hint = 'forbidden';
  end if;

  select ps.* into v_sheet
  from public.price_sheets ps
  where ps.id = p_sheet_id
    and ps.subcontractor_id = v_sub;

  if not found then
    raise exception 'كشف الأسعار غير موجود أو ليس لهذا المتعهد' using hint = 'not-found';
  end if;

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'الملف لم يُقرأ كصفوف — تأكد أنه CSV بالترويسة المعطاة'
      using hint = 'invalid-input';
  end if;

  if jsonb_array_length(p_rows) = 0 then
    raise exception 'الملف بلا صفوف بيانات' using hint = 'invalid-input';
  end if;

  if jsonb_array_length(p_rows) > 500 then
    raise exception 'الحد الأقصى ٥٠٠ مسار في الملف الواحد (وصل %)',
      jsonb_array_length(p_rows) using hint = 'invalid-input';
  end if;

  -- (ب) الفئات المغطّاة — من التعريف الوحيد لا من تصفية ثانية
  select array_agg(c.slug) into v_covered
  from public.price_sheet_classes(v_sub, null) c
  where c.covered;
  v_covered := coalesce(v_covered, '{}'::text[]);

  -- (ج) نقاطٌ عرّفها المتعهد سلفاً — تسمح للملف بأن يكتب اسم المكان بلا إحداثيات
  -- بعد أن يكتبها مرّة. **مقيَّدة بمساراته هو** فلا تُسرَّب نقطة منافس (D-19).
  select coalesce(jsonb_object_agg(x.k, x.v), '{}'::jsonb)
    into v_points
  from (
    select lower(btrim(pl.origin_label)) as k,
           jsonb_build_object('lat', pl.origin_lat, 'lng', pl.origin_lng,
                              'radius', pl.origin_radius_km) as v,
           row_number() over (partition by lower(btrim(pl.origin_label))
                              order by pl.updated_at desc) as rn
    from public.price_lists pl
    where pl.subcontractor_id = v_sub and btrim(coalesce(pl.origin_label, '')) <> ''
    union all
    select lower(btrim(pl.dest_label)),
           jsonb_build_object('lat', pl.dest_lat, 'lng', pl.dest_lng,
                              'radius', pl.dest_radius_km),
           row_number() over (partition by lower(btrim(pl.dest_label))
                              order by pl.updated_at desc)
    from public.price_lists pl
    where pl.subcontractor_id = v_sub and btrim(coalesce(pl.dest_label, '')) <> ''
  ) x
  where x.rn = 1;

  -- (د) صفّاً صفّاً
  for el in select value from jsonb_array_elements(p_rows) loop
    v_i       := v_i + 1;
    v_reasons := '{}'::text[];
    v_warn    := null;
    v_saved   := 0;
    v_id      := null;
    v_ex_id   := null;
    v_ex_st   := null;
    v_ex_sh   := null;

    -- 🔑 كل قراءةٍ نصيّة تمرّ بـ`import_field` ⇒ الخانة الفارغة = الغياب، في كل
    --    الحقول دفعةً واحدة. ولا قراءةَ حقلٍ خاماً من `el` بافتراضٍ نصيّ بعد اليوم —
    --    والفحص الذاتي في آخر الملف يمنع عودتها بقراءة الجسم الحيّ نفسه.
    v_title  := public.import_field(el, 'title');
    v_olabel := public.import_field(el, 'originLabel', 'origin_label');
    v_dlabel := public.import_field(el, 'destLabel',   'dest_label');

    v_olat_t := public.import_field(el, 'originLat', 'origin_lat');
    v_olng_t := public.import_field(el, 'originLng', 'origin_lng');
    v_dlat_t := public.import_field(el, 'destLat',   'dest_lat');
    v_dlng_t := public.import_field(el, 'destLng',   'dest_lng');
    v_orad_t := public.import_field(el, 'originRadiusKm', 'origin_radius_km');
    v_drad_t := public.import_field(el, 'destRadiusKm',   'dest_radius_km');
    v_bidi_t := public.import_field(el, 'bidirectional');

    v_olat := public.numeric_or_null(v_olat_t);
    v_olng := public.numeric_or_null(v_olng_t);
    v_dlat := public.numeric_or_null(v_dlat_t);
    v_dlng := public.numeric_or_null(v_dlng_t);
    v_orad := public.numeric_or_null(v_orad_t);
    v_drad := public.numeric_or_null(v_drad_t);

    -- (د-٠) 🔴 نصٌّ مكتوبٌ لا يتحوّل إلى رقم لا يجوز أن يُعامَل معاملة الفراغ:
    -- إحداثيةٌ فاسدة كانت تُحلّ من نقطةٍ أخرى بنفس الاسم، ونطاقٌ فاسد كان يصير
    -- ٢٥ كم — كلاهما صامت. يُسمّى الآن ويُرفض الصفّ.
    if v_olat_t is not null and v_olat is null then
      v_reasons := v_reasons || ('خط عرض البداية «' || v_olat_t || '» ليس رقماً');
    end if;
    if v_olng_t is not null and v_olng is null then
      v_reasons := v_reasons || ('خط طول البداية «' || v_olng_t || '» ليس رقماً');
    end if;
    if v_dlat_t is not null and v_dlat is null then
      v_reasons := v_reasons || ('خط عرض النهاية «' || v_dlat_t || '» ليس رقماً');
    end if;
    if v_dlng_t is not null and v_dlng is null then
      v_reasons := v_reasons || ('خط طول النهاية «' || v_dlng_t || '» ليس رقماً');
    end if;
    if v_orad_t is not null and v_orad is null then
      v_reasons := v_reasons || ('نطاق البداية «' || v_orad_t || '» ليس رقماً');
    end if;
    if v_drad_t is not null and v_drad is null then
      v_reasons := v_reasons || ('نطاق النهاية «' || v_drad_t || '» ليس رقماً');
    end if;

    -- (د-١) العنوان: الفارغ يُشتق من الطرفين حتى لا يُرفض صفٌّ صحيح لسببٍ شكلي
    if v_title is null and v_olabel is not null and v_dlabel is not null then
      v_title := left(v_olabel || ' ← ' || v_dlabel, 160);
    end if;
    if v_title is null then
      v_reasons := v_reasons || 'العنوان مفقود ولا يمكن اشتقاقه (الطرفان ناقصان)'::text;
    elsif length(v_title) < 2 or length(v_title) > 160 then
      v_reasons := v_reasons || 'العنوان يجب أن يكون بين حرفين و١٦٠ حرفاً'::text;
    end if;

    -- (د-٢) الطرفان + حلّ الإحداثيات من نقطةٍ معرّفة سابقاً بالاسم نفسه
    if v_olabel is null then
      v_reasons := v_reasons || 'اسم نقطة البداية مفقود'::text;
    elsif v_olat is null or v_olng is null then
      v_hint := v_points -> lower(v_olabel);
      if v_hint is not null then
        v_olat := public.numeric_or_null(v_hint ->> 'lat');
        v_olng := public.numeric_or_null(v_hint ->> 'lng');
        v_orad := coalesce(v_orad, public.numeric_or_null(v_hint ->> 'radius'));
      else
        v_reasons := v_reasons
          || ('لا إحداثيات لنقطة البداية «' || v_olabel
              || '» ولم تُعرَّف من قبل — اكتب originLat/originLng مرة واحدة');
      end if;
    end if;

    if v_dlabel is null then
      v_reasons := v_reasons || 'اسم نقطة النهاية مفقود'::text;
    elsif v_dlat is null or v_dlng is null then
      v_hint := v_points -> lower(v_dlabel);
      if v_hint is not null then
        v_dlat := public.numeric_or_null(v_hint ->> 'lat');
        v_dlng := public.numeric_or_null(v_hint ->> 'lng');
        v_drad := coalesce(v_drad, public.numeric_or_null(v_hint ->> 'radius'));
      else
        v_reasons := v_reasons
          || ('لا إحداثيات لنقطة النهاية «' || v_dlabel
              || '» ولم تُعرَّف من قبل — اكتب destLat/destLng مرة واحدة');
      end if;
    end if;

    -- 🔴 مصر وحدها — مرآة `SERVICE_BOUNDS` في lib/place-search-types.ts
    -- (عرض ٢٠..٣٤، طول ٢٣..٣٨) كما في 0084 و0098. والفائدة الحقيقية هنا: قلبُ
    -- lat/lng في ملفٍ فيه مئة صفّ خطأٌ صامت يضع المسار في الصحراء الليبية.
    -- (‏و`NaN` يسقط هنا أيضاً: `NaN between 20 and 34` ⇒ false.)
    if v_olat is not null and v_olng is not null
       and not (v_olat between 20 and 34 and v_olng between 23 and 38) then
      v_reasons := v_reasons || 'إحداثيات البداية خارج مصر — تحقّق من ترتيب lat/lng'::text;
    end if;
    if v_dlat is not null and v_dlng is not null
       and not (v_dlat between 20 and 34 and v_dlng between 23 and 38) then
      v_reasons := v_reasons || 'إحداثيات النهاية خارج مصر — تحقّق من ترتيب lat/lng'::text;
    end if;

    -- (د-٣) النطاقات — الغياب وحده يأخذ الافتراضي (‏والفاسد رُفض في د-٠)
    v_orad := coalesce(v_orad, 25);
    v_drad := coalesce(v_drad, 25);
    if v_orad < 1 or v_orad > 500 then
      v_reasons := v_reasons || 'نطاق البداية يجب أن يكون بين ١ و٥٠٠ كم'::text;
    end if;
    if v_drad < 1 or v_drad > 500 then
      v_reasons := v_reasons || 'نطاق النهاية يجب أن يكون بين ١ و٥٠٠ كم'::text;
    end if;

    -- (د-٣ب) 🔴 الاتجاهان — ثلاثيّ الحالات:
    --   غياب/فراغ ⇒ الاتجاهان (الافتراض المكتوب في القالب وفي التوثيق)
    --   قيمةٌ معروفة ⇒ قيمتها
    --   قيمةٌ مكتوبةٌ غير مفهومة ⇒ **رفض الصفّ** — لا قلبَ صامتاً إلى اتجاهٍ واحد
    if v_bidi_t is null then
      v_bidi := true;
    elsif lower(v_bidi_t) in ('true', 't', '1', 'yes', 'y', 'نعم', 'صح', 'صحيح') then
      v_bidi := true;
    elsif lower(v_bidi_t) in ('false', 'f', '0', 'no', 'n', 'لا', 'خطأ', 'غلط') then
      v_bidi := false;
    else
      v_bidi := true;   -- لن تُكتب: الصفّ مرفوض. والقيمة الآمنة هي الافتراض.
      v_reasons := v_reasons
        || ('قيمة عمود الاتجاهين «' || v_bidi_t
            || '» غير مفهومة — اكتب true أو false (أو نعم/لا)، '
            || 'أو اترك الخانة فارغة فتعني الاتجاهين');
    end if;

    -- (د-٤) الأسعار — الفئات المغطّاة وحدها (ملاحظة المالك ٥)
    v_prices := el -> 'prices';
    v_items  := '[]'::jsonb;
    if v_prices is null or jsonb_typeof(v_prices) <> 'object' then
      v_reasons := v_reasons || 'لا أعمدة أسعار في هذا الصف'::text;
    else
      -- (د-٤أ) 🔴 عمودا فئةٍ يؤولان إلى slug واحد: كان يمرّ من الفحص ثم يفشل عند
      -- الكتابة بنصٍّ إنجليزيّ خام من Postgres. يُلتقط هنا فيراه المتعهد في الفحص.
      select string_agg(x.slug || ' (' || x.cols || ')', '، ' order by x.slug) into v_bad
      from (
        select lower(btrim(k)) as slug, string_agg(k, ' + ' order by k) as cols
        from jsonb_object_keys(v_prices) k
        where nullif(btrim(coalesce(v_prices ->> k, '')), '') is not null
        group by lower(btrim(k))
        having count(*) > 1
      ) x;
      if v_bad is not null then
        v_reasons := v_reasons
          || ('عمود فئة مكرّر: ' || v_bad
              || ' — عمودان يؤولان إلى الفئة نفسها، احذف أحدهما أو ادمج قيمتيهما');
      end if;

      select string_agg(distinct k, '، ') into v_bad
      from jsonb_object_keys(v_prices) k
      where nullif(btrim(coalesce(v_prices ->> k, '')), '') is not null
        and not (lower(btrim(k)) = any (v_covered));
      if v_bad is not null then
        v_reasons := v_reasons
          || ('فئات لا يغطّيها أسطولك أو غير معروفة: ' || v_bad
              || ' — سجّل مركبة من الفئة أو احذف عمودها');
      end if;

      select string_agg(distinct k, '، ') into v_bad
      from jsonb_object_keys(v_prices) k
      where nullif(btrim(coalesce(v_prices ->> k, '')), '') is not null
        and (public.numeric_or_null(v_prices ->> k) is null
             or public.numeric_or_null(v_prices ->> k) <= 0
             or public.numeric_or_null(v_prices ->> k) > 10000000);
      if v_bad is not null then
        v_reasons := v_reasons || ('تكلفة غير صالحة في: ' || v_bad || ' (رقم أكبر من صفر)');
      end if;

      -- `distinct on` يجعل هذا التجميع محصَّناً حتى لو مرّ تكرارٌ من طريقٍ آخر
      select coalesce(jsonb_agg(y.obj), '[]'::jsonb) into v_items
      from (
        select distinct on (lower(btrim(k)))
               jsonb_build_object('classSlug', lower(btrim(k)),
                                  'cost', public.numeric_or_null(v_prices ->> k)) as obj
        from jsonb_object_keys(v_prices) k
        where lower(btrim(k)) = any (v_covered)
          and public.numeric_or_null(v_prices ->> k) is not null
          and public.numeric_or_null(v_prices ->> k) > 0
          and public.numeric_or_null(v_prices ->> k) <= 10000000
        order by lower(btrim(k)), k
      ) y;

      if jsonb_array_length(v_items) = 0 and array_length(v_reasons, 1) is null then
        v_reasons := v_reasons || 'لم تُسعَّر أي فئة في هذا الصف'::text;
      end if;
    end if;

    -- (د-٥) التكرار داخل نفس الملف
    if v_title is not null then
      v_key := lower(btrim(v_title));
      if v_key = any (v_seen) then
        v_reasons := v_reasons || 'عنوان مكرّر داخل نفس الملف'::text;
      else
        v_seen := v_seen || v_key;
      end if;
    end if;

    -- (د-٦) تصادم العنوان مع مسارٍ قائم — الفهرس الفريد على (المتعهد، العنوان)
    if v_title is not null then
      select pl.id, pl.status, pl.sheet_id into v_ex_id, v_ex_st, v_ex_sh
      from public.price_lists pl
      where pl.subcontractor_id = v_sub
        and lower(btrim(pl.title)) = lower(btrim(v_title))
      limit 1;

      if v_ex_id is not null then
        if v_ex_sh is distinct from p_sheet_id then
          v_reasons := v_reasons || 'العنوان مستعمل في كشفٍ آخر أو في مسار مستقل'::text;
        elsif v_ex_st = 'approved' then
          v_reasons := v_reasons
            || 'المسار معتمد ويعمل الآن — الاستيراد لا يعدّله؛ عدّله من صفحته'::text;
        elsif v_ex_st = 'pending' then
          v_reasons := v_reasons
            || 'المسار على مكتب المشرف الآن — الاستيراد لا يعدّله'::text;
        end if;
      end if;
    end if;

    -- (د-٧) 🔴 إعادة استيرادٍ تُسقط فئةً كانت مسعَّرة — تُسمّى ولا تُبتلع.
    -- تُحسب **قبل** الحذف، وفي الفحص كما في التنفيذ بنفس النصّ حرفاً، فما يقرؤه
    -- المتعهد في المعاينة هو ما سيقع. والصفّ يبقى مقبولاً: الملف هو حقيقة المسار.
    if v_ex_id is not null and array_length(v_reasons, 1) is null then
      select string_agg(pli.class_slug || ' (' || trim(to_char(pli.cost, 'FM999999990.00')) || ')',
                        '، ' order by pli.class_slug)
        into v_bad
      from public.price_list_items pli
      where pli.price_list_id = v_ex_id
        and not exists (
          select 1 from jsonb_array_elements(v_items) it
          where it ->> 'classSlug' = pli.class_slug);
      if v_bad is not null then
        v_warn := '⚠ فئات كانت مسعَّرة في هذا المسار ولا يذكرها الملف: ' || v_bad
               || ' — الاستيراد يجعل الملف الحقيقة الكاملة للمسار، فهذه الفئات لا تبقى. '
               || 'أعد عمودها إلى الملف إن كنت ما زلت تنفّذها.';
      end if;
    end if;

    -- (هـ) النتيجة
    if array_length(v_reasons, 1) is not null then
      row_no        := v_i;
      accepted      := false;
      action        := 'rejected';
      route_title   := v_title;
      classes_saved := 0;
      reason        := array_to_string(v_reasons, ' · ');
      return next;
      continue;
    end if;

    -- نقاط هذا الصف تصير معرّفةً للصفوف التالية — في الفحص والتنفيذ سواءً بسواء
    v_points := v_points
      || jsonb_build_object(lower(v_olabel),
                            jsonb_build_object('lat', v_olat, 'lng', v_olng, 'radius', v_orad))
      || jsonb_build_object(lower(v_dlabel),
                            jsonb_build_object('lat', v_dlat, 'lng', v_dlng, 'radius', v_drad));

    v_action := case when v_ex_id is null then 'created' else 'updated' end;
    v_saved  := jsonb_array_length(v_items);

    if not p_commit then
      row_no        := v_i;
      accepted      := true;
      action        := v_action || '-preview';
      route_title   := v_title;
      classes_saved := v_saved;
      reason        := v_warn;
      return next;
      continue;
    end if;

    -- (و) الكتابة — كتلة استثناء لكل صفّ (معاملة فرعية): فشلُ صفٍّ لا يجرف الدفعة
    begin
      if v_ex_id is null then
        insert into public.price_lists (
          subcontractor_id, sheet_id, title,
          origin_label, origin_lat, origin_lng, origin_radius_km,
          dest_label, dest_lat, dest_lng, dest_radius_km,
          bidirectional, status
        ) values (
          v_sub, p_sheet_id, v_title,
          v_olabel, v_olat, v_olng, v_orad,
          v_dlabel, v_dlat, v_dlng, v_drad,
          v_bidi, 'draft'
        )
        returning id into v_id;
      else
        v_id := v_ex_id;
        update public.price_lists pl
           set title            = v_title,
               origin_label     = v_olabel,
               origin_lat       = v_olat,
               origin_lng       = v_olng,
               origin_radius_km = v_orad,
               dest_label       = v_dlabel,
               dest_lat         = v_dlat,
               dest_lng         = v_dlng,
               dest_radius_km   = v_drad,
               bidirectional    = v_bidi,
               status           = 'draft',
               review_note      = null,
               reviewed_at      = null
         where pl.id = v_id;
      end if;

      delete from public.price_list_items pli where pli.price_list_id = v_id;

      insert into public.price_list_items (price_list_id, class_slug, cost)
      select v_id, x.class_slug, x.cost
      from jsonb_array_elements(v_items) it
      cross join lateral (
        select it ->> 'classSlug' as class_slug,
               public.numeric_or_null(it ->> 'cost') as cost
      ) x
      on conflict (price_list_id, class_slug) do update set cost = excluded.cost;

      row_no        := v_i;
      accepted      := true;
      action        := v_action;
      route_title   := v_title;
      classes_saved := v_saved;
      reason        := v_warn;
      return next;
    exception
      when others then
        row_no        := v_i;
        accepted      := false;
        action        := 'rejected';
        route_title   := v_title;
        classes_saved := 0;
        reason        := 'تعذّرت الكتابة: ' || sqlerrm;
        return next;
    end;
  end loop;

  return;
end;
$$;

comment on function public.import_price_sheet_rows(uuid, jsonb, boolean, uuid) is
  'استيراد مسارات كشف بالجملة مع تقرير صفّاً صفّاً. p_commit=false فحصٌ بلا كتابة بنفس النتيجة (بما فيها تنبيه الفئات الساقطة). الخانة الفارغة تساوي الغياب، والقيمة المكتوبة غير المفهومة تُرفض ولا تُفسَّر. لا يعدّل مساراً معتمداً ولا قيد المراجعة.';

-- ----------------------------------------------------------------------------
-- (٣) مراجعة الكشف — **العدد المُعلن شرطٌ للكتابة**
--
-- التوقيع تغيّر (‏`p_expected`) فلا مفرّ من `drop`: بقاءُ النسخة الثلاثية معها
-- يجعل كل نداءٍ بثلاث وسائط **ملتبساً** (`function is not unique`).
--
-- 🔴 الحارسان القديمان باقيان بحرفهما: الدالة ترفض غير المشرف صراحةً، **وفوقها**
--    المُشغّل `price_lists_guard_review` (0010) يمنع المتعهد من كتابة `approved`
--    على مساره بأي طريق. طبقتان — والثالثة الجديدة تحرس **الاتساع** لا الهوية.
-- ----------------------------------------------------------------------------
drop function if exists public.review_price_sheet(uuid, boolean, text);

create or replace function public.review_price_sheet(
  p_id       uuid,
  p_approve  boolean,
  p_note     text    default null,
  p_expected integer default null
)
returns table (
  affected   integer,
  new_status text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_note text;
  v_new  text;
  v_n    integer;
  v_ids  uuid[];
begin
  if not public.is_admin() then
    raise exception 'مراجعة كشوف الأسعار متاحة للمشرف وحده' using hint = 'forbidden';
  end if;

  if not exists (select 1 from public.price_sheets ps where ps.id = p_id) then
    raise exception 'كشف الأسعار غير موجود' using hint = 'not-found';
  end if;

  v_note := nullif(btrim(coalesce(p_note, '')), '');
  v_new  := case when coalesce(p_approve, false) then 'approved' else 'rejected' end;

  if v_new = 'rejected' and v_note is null then
    raise exception 'سبب الرفض مطلوب' using hint = 'invalid-input';
  end if;

  -- 🔴 التقاطُ الصفوف **بأعيانها** وقفلُها: من هنا فصاعداً لا يستطيع أحد أن
  -- يغيّرها، والكتابة ستقع على هذه بالذات لا على شرطٍ يُعاد تقييمه.
  select coalesce(array_agg(x.id order by x.created_at, x.id), '{}'::uuid[])
    into v_ids
  from (
    select pl.id, pl.created_at
    from public.price_lists pl
    where pl.sheet_id = p_id
      and pl.status = 'pending'
    for update
  ) x;

  v_n := coalesce(array_length(v_ids, 1), 0);

  if v_n = 0 then
    raise exception 'لا مسار بانتظار المراجعة في هذا الكشف' using hint = 'invalid-status';
  end if;

  -- 🔴 العدد المُعلن إلزاميّ: نداءٌ لا يقول كم مساراً يعتمد **لا يُنفَّذ**. وهذا
  -- ما يجعل «الرقم على الزرّ» و«الرقم الذي تكتبه الدالة» شيئاً واحداً بنيوياً،
  -- لا شيئين يتصادف تطابقهما اليوم.
  if p_expected is null then
    raise exception
      'عدد المسارات المعروضة مطلوب مع قرار المراجعة (% مسار بانتظار المراجعة في هذا الكشف)',
      v_n using hint = 'invalid-input';
  end if;

  if p_expected <> v_n then
    raise exception
      'تغيّر الكشف بعد فتح الصفحة: عُرض عليك % مساراً والكشف يحمل الآن % — لم يُكتب شيء، أعد تحميل الصفحة',
      p_expected, v_n using hint = 'count-changed';
  end if;

  update public.price_lists pl
     set status      = v_new,
         review_note = v_note,
         reviewed_at = now()
   where pl.id = any (v_ids);

  get diagnostics v_n = row_count;

  affected   := v_n;
  new_status := v_new;
  return next;
end;
$$;

comment on function public.review_price_sheet(uuid, boolean, text, integer) is
  'اعتماد كشف أسعار أو رفضه دفعةً واحدة — للمشرف وحده. p_expected إلزاميّ: عدد المسارات المنتظرة كما عُرض على الشاشة؛ أي اختلاف يوقف الكتابة كلها (hint=count-changed).';

-- ----------------------------------------------------------------------------
-- (٤) الصلاحيات
--
-- ⚠ فخّ 0010/0102 المكرَّر: الدالة الجديدة تولد ومعها EXECUTE ضمني لـ PUBLIC
--   ومنحٌ صريح لـ anon من إعدادات Supabase الافتراضية. السحب أولاً ثم المنح.
--   ولا شيء منها لـ anon: كلها تلمس تكلفة المتعهد، وهي سرٌّ تجاري (D-19).
-- ----------------------------------------------------------------------------
do $$
declare
  v_sig text;
begin
  foreach v_sig in array array[
    'public.import_price_sheet_rows(uuid, jsonb, boolean, uuid)',
    'public.review_price_sheet(uuid, boolean, text, integer)'
  ] loop
    execute format('revoke all on function %s from public', v_sig);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on function %s from anon', v_sig);
    end if;
    execute format('revoke all on function %s from authenticated', v_sig);
    execute format('grant execute on function %s to authenticated', v_sig);
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format('grant execute on function %s to service_role', v_sig);
    end if;
  end loop;
end;
$$;

-- `import_field` أداةٌ داخلية للمستورد: لا تُستدعى من الويب ولا حاجة لأحدٍ بها.
do $$
begin
  execute 'revoke all on function public.import_field(jsonb, text[]) from public';
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function public.import_field(jsonb, text[]) from anon';
  end if;
  execute 'revoke all on function public.import_field(jsonb, text[]) from authenticated';
end;
$$;

-- ----------------------------------------------------------------------------
-- (٥) فحصٌ ذاتي — الهجرة تُثبت أثرها بنفسها بدل أن تُصدَّق
-- ----------------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.import_field(jsonb, text[])') is null then
    raise exception '0109: import_field لم تُنشأ';
  end if;

  -- الفراغ والمسافات = الغياب، وأول قيمةٍ فعلية هي المأخوذة بترتيب المفاتيح
  if public.import_field('{"a":""}'::jsonb, 'a') is not null then
    raise exception '0109: import_field أعادت قيمةً لخانة فارغة';
  end if;
  if public.import_field('{"a":"   "}'::jsonb, 'a') is not null then
    raise exception '0109: import_field أعادت قيمةً لخانة مسافات';
  end if;
  if public.import_field('{"a":"","b":"x"}'::jsonb, 'a', 'b') is distinct from 'x' then
    raise exception '0109: import_field حجبت المفتاح البديل خلف خانة فارغة';
  end if;
  if public.import_field('{"a":" y ","b":"x"}'::jsonb, 'a', 'b') is distinct from 'y' then
    raise exception '0109: import_field لم تحترم ترتيب المفاتيح';
  end if;

  -- التوقيع الثلاثي **ذهب**: بقاؤه يجعل كل نداءٍ بثلاث وسائط ملتبساً
  if to_regprocedure('public.review_price_sheet(uuid, boolean, text)') is not null then
    raise exception '0109: النسخة الثلاثية من review_price_sheet ما زالت قائمة';
  end if;
  if to_regprocedure('public.review_price_sheet(uuid, boolean, text, integer)') is null then
    raise exception '0109: review_price_sheet الرباعية لم تُنشأ';
  end if;

  -- ولا `coalesce(el ->> …)` بقيت في المستورد — فحصٌ على الجسم الحيّ لا على ملف
  if pg_get_functiondef(to_regprocedure(
       'public.import_price_sheet_rows(uuid, jsonb, boolean, uuid)')) like '%coalesce(el ->>%'
  then
    raise exception '0109: ما زال في المستورد coalesce(el ->> …) — عمى الخانة الفارغة يعود منه';
  end if;

  if exists (select 1 from pg_roles where rolname = 'anon')
     and has_function_privilege('anon',
           'public.review_price_sheet(uuid, boolean, text, integer)', 'execute') then
    raise exception '0109: anon يستطيع تنفيذ review_price_sheet';
  end if;
  if not has_function_privilege('authenticated',
        'public.review_price_sheet(uuid, boolean, text, integer)', 'execute') then
    raise exception '0109: authenticated لا يستطيع تنفيذ review_price_sheet — اللوحة لن تعمل';
  end if;

  raise notice '0109 ✔ الفراغ = الغياب · الاتجاهان ثلاثيّ الحالات · الفئة المكرّرة تُسمّى · الفئة الساقطة تُنبَّه · والاعتماد لا يتجاوز ما عُرض';
end;
$$;
