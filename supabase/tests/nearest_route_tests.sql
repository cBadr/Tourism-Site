-- ============================================================================
-- nearest_route_tests.sql — الأقربُ مركزاً يفوز داخل المتعهد، والأرخصُ بينهم
--                           (هجرة 0132_nearest_route_wins.sql)
--
-- كيف تشغّله:
--   node scripts/db-test.mjs nearest_route
-- أو من psql بدور صاحب القاعدة (‏`ON_ERROR_STOP` **إلزامي**، وإلا تابع psql بعد
-- الكتلة الفاشلة وطبع «ALL PASSED» رغم الفشل):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/nearest_route_tests.sql
--
-- النجاح = آخر سطر «ALL PASSED». وكلُّ فشلٍ استثناءٌ عربيٌّ فيه المتوقَّع والفعلي.
--
-- ── ما تثبته هذه المجموعة ─────────────────────────────────────────────────
--
-- كانت `quote_price` تأخذ `min(pli.cost)` على **كل** القوائم المطابقة، فتختار
-- أرخصَ قوائم المتعهد لا أقربَها ⇒ تمايزُه السعريّ يُمحى، ومنطلقاتُه الأغلى لا
-- تُبلَغ، و`dispatch_pool` تطلب منه تنفيذَ رحلةٍ بأقلَّ مما سعّرها.
-- والقرار: **داخل المتعهد الأقربُ مركزاً يفوز، وبين المتعهدين الأرخصُ يفوز.**
--
-- 🔴 **وكلُّ توكيدٍ هنا مقرونٌ بطفرته**: يُحسب إلى جانبه ما كانت **القاعدةُ
--    القديمة** ستُنتجه على الفيكسترة نفسِها، ويُشترط أن يفترقا. فلو أُعيد
--    `min(pli.cost)` غداً — بـ`create or replace` أو بهجرةٍ تُبنى فوق جسمٍ قديم
--    (‏D-58) — تحمرّ المجموعة فوراً بدل أن تبقى خضراء فوق عيبٍ عاد.
--
-- ── لماذا فيكسترةٌ من صنعها بالكامل ───────────────────────────────────────
--
-- درسُ 2026-08-18 المدفوع: خمسةُ توكيداتٍ سقطت في يومٍ واحد لأنها كانت تقيس
-- **محتوى القاعدة** لا **سلوك الكود** (سعةَ مركبةٍ يملكها المالك · صفَّ أسعارٍ
-- يملكه المتعهد · توقيعَ دالةٍ حرفياً · عدداً في جدول). فلا رقمَ واحداً هنا
-- يخصّ المالك أو شريكاً: **كلُّ قائمةٍ وكلُّ تكلفةٍ من صنع هذا الملف**،
-- وكلُّ توقّعٍ مشتقٌّ من نفس المدخلات التي أعطيناها للمحرّك.
--
-- ── الممرّات الأربعة، وكلُّها مقيسةٌ صفرَ تغطيةٍ قبل الإنشاء ───────────────
--
--   الممرّ (أ) — الصحراء الغربية:  (27.0, 27.0) ⇐ (26.0, 26.0)   ١٤٩٫٢٢٠ كم
--   الممرّ (ب) — للتعادل:          (27.0, 25.0) ⇐ (26.0, 24.0)   ١٤٩٫٢٢٠ كم
--   الممرّ (ج) — للمطابقة المعكوسة:(25.5, 26.5) ⇐ (24.5, 25.5)   ١٥٠٫٠٦٦ كم
--   الممرّ (د) — لتعادل المنطلق:   (27.5, 28.0) ⇐ (26.5, 28.5)   ١٢١٫٧٣٠ كم
--
-- والخلوّ **يُقاس في القسم (٠) نفسه** ولا يُفترض — فالنمط ٦ في `LESSONS.md`:
-- مجموعةٌ استعملت مسار القاهرة–الإسكندرية الحقيقي صارت **تفشل لأن المشروع نجح**.
--
-- الأقسام:
--   (٠)   الشروط المسبقة · خلوّ الممرّات مقيساً · الفئتان من المحرّك · حفظ الإعدادات
--   (٠-ب) الفيكسترة: خمسة متعهدين وقوائمهم — كلُّها مسودة إلا ما يعتمده كلُّ قسم
--   (أ)   عقدُ الدالة: صفٌّ واحد لكل (متعهد × فئة)، لا أكثر
--   (ب)   مطابقةٌ واحدة ⇒ **النتيجة كما كانت حرفياً** (قيد البريف ١)
--   (ج)   ثلاثُ مطابقاتٍ لمتعهدٍ واحد ⇒ الأقربُ يفوز، وليس الأرخص
--   (د)   الفوزُ لكل (متعهد × فئة) ⇒ لا تغطيةَ تُفقد
--   (هـ)  `dispatch_pool`: المستحقُّ من القائمة الأقرب لا من أرخص قوائمه
--   (و)   متعهدان ⇒ الأرخصُ يفوز — ولو كان مركزه أبعد
--   (ز)   التعادل ⇒ حسمٌ ثابت: الأرخصُ ثم المعرّف، وثباتٌ عبر نداءين
--   (ز-ب) تعادلُ المنطلق ⇒ **الأقربُ وجهةً يفوز** قبل أن يُسأل عن السعر
--   (ح)   المطابقةُ المعكوسة ⇒ المسافة تُقاس إلى الطرف المطابِق لا إلى `origin_*`
--   (ط)   أرضيةُ الهامش (D-16) تبقى حاجزاً صلباً بعد التغيير
--   (ي)   المنح: `coverage_best_costs` محجوبةٌ عن `anon` و`authenticated` (D-20)
--   (ك)   التنظيف واستعادة الإعدادات
--
-- المرجع: `supabase/migrations/0132_nearest_route_wins.sql` ·
--         `docs/phase-briefs/SESSION-STATE-2026-08-18.md` §١١ · D-05 · D-16 · D-20.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (٠) الشروط المسبقة + تنظيف بقايا + خلوُّ الممرّات + معطيات التشغيل
-- ----------------------------------------------------------------------------
do $$
declare
  v_missing text;
  v_classes text[];
  v_rows    integer;
  v_n       integer;
begin
  select string_agg(x.sig, '، ')
    into v_missing
  from (values
    ('public.coverage_matches(numeric, numeric, numeric, numeric)'),
    ('public.coverage_best_costs(numeric, numeric, numeric, numeric)'),
    ('public.haversine_km(numeric, numeric, numeric, numeric)'),
    ('public.quote_price(numeric, integer, boolean, numeric)'),
    ('public.quote_price(numeric, integer, boolean, numeric, numeric, numeric, numeric, numeric, integer)'),
    ('public.dispatch_pool(uuid, integer)'),
    ('public.dispatch_ceiling(uuid, integer)'),
    ('public.partner_agreement_ok(uuid)')
  ) as x(sig)
  where to_regprocedure(x.sig) is null;

  if v_missing is not null then
    raise exception 'شرط مسبق: دوال مفقودة (نفّذ 0132_nearest_route_wins.sql أولاً): %', v_missing;
  end if;

  select string_agg(x.rel, '، ')
    into v_missing
  from (values
    ('public.subcontractors'), ('public.subcontractor_vehicles'),
    ('public.price_lists'), ('public.price_list_items'),
    ('public.pricing_settings'), ('public.bookings')
  ) as x(rel)
  where to_regclass(x.rel) is null;

  if v_missing is not null then
    raise exception 'شرط مسبق: جداول مفقودة: %', v_missing;
  end if;

  select count(*) into v_rows from public.pricing_settings;
  if v_rows <> 1 then
    raise exception 'شرط مسبق: pricing_settings يجب أن يحوي صفاً واحداً بالضبط (وجدنا %)', v_rows;
  end if;

  -- تنظيف بقايا تشغيلٍ سابق (إشعارات ← حجوزات ← متعهدون بالتتالي)
  delete from public.notifications n
   where n.payload ->> 'bookingId' in (
         select b.id::text from public.bookings b
          where b.trip ->> 'notes' = 'NEAREST_ROUTE_TESTS_FIXTURE');
  delete from public.bookings b where b.trip ->> 'notes' = 'NEAREST_ROUTE_TESTS_FIXTURE';
  delete from public.subcontractors s where s.company_name like 'NEAREST_ROUTE_TESTS%';

  -- ── خلوُّ الممرّات الأربعة: يُقاس ولا يُفترض ─────────────────────────────
  -- الاتجاهان معاً، لأن قائمةً ثنائيةَ الاتجاه قد تطابق المعكوس وحده.
  select (select count(*) from public.coverage_matches(27.0, 27.0, 26.0, 26.0))
       + (select count(*) from public.coverage_matches(26.0, 26.0, 27.0, 27.0))
       + (select count(*) from public.coverage_matches(27.0, 25.0, 26.0, 24.0))
       + (select count(*) from public.coverage_matches(26.0, 24.0, 27.0, 25.0))
       + (select count(*) from public.coverage_matches(25.5, 26.5, 24.5, 25.5))
       + (select count(*) from public.coverage_matches(24.5, 25.5, 25.5, 26.5))
       + (select count(*) from public.coverage_matches(27.5, 28.0, 26.5, 28.5))
       + (select count(*) from public.coverage_matches(26.5, 28.5, 27.5, 28.0))
    into v_n;

  if v_n <> 0 then
    raise exception
      'شرط مسبق: الممرّات الصحراوية لم تعد خالية (% مطابقة) — اختر ممرّاً آخر ولا تُضعف التوكيدات', v_n;
  end if;

  -- الفئتان المؤهلتان لراكبٍ واحد — من المحرّك نفسِه لا تخميناً منّا
  select array_agg(q.class_slug order by q.capacity asc)
    into v_classes
  from public.quote_price(150, 1, false, 0) q;

  if v_classes is null or array_length(v_classes, 1) < 1 then
    raise exception 'شرط مسبق: لا فئة سيارة نشطة لها تعريفة — نفّذ بذرة 0005';
  end if;

  perform set_config('tours.nr_c1', v_classes[1], false);
  perform set_config('tours.nr_c2',
    case when array_length(v_classes, 1) >= 2 then v_classes[2] else '' end, false);

  -- إعدادات التسعير الأصلية تُحفظ مرة واحدة وتُعاد في (ك)
  perform set_config('tours.nr_settings', (
    select jsonb_build_object(
             'peak_enabled', ps.peak_enabled, 'peak_percent', ps.peak_percent,
             'margin_type', ps.margin_type, 'margin_value', ps.margin_value,
             'margin_min_amount', ps.margin_min_amount
           )::text
    from public.pricing_settings ps limit 1
  ), false);

  -- ثبات الأرقام: بلا ذروة، وهامشٌ نسبيٌّ معلوم. تُعاد الأصول في (ك).
  update public.pricing_settings
     set peak_enabled = false, margin_type = 'percent',
         margin_value = 20,    margin_min_amount = 100;

  raise notice '✔ (٠) الشروط سليمة · الممرّات الأربعة خالية (٠ مطابقة) · فئة التغطية «%» وفئة ثانية «%»',
    v_classes[1], coalesce(nullif(current_setting('tours.nr_c2', true), ''), 'لا شيء');
end;
$$;

-- ----------------------------------------------------------------------------
-- (٠-ب) الفيكسترة — أربعة متعهدين وعشرُ قوائم، كلُّها **مسودة** إلا ما يعتمده قسمُه
--
-- التدرّج مقصود: القسم (ب) يحتاج **مطابقةً واحدة** فلا يصحّ أن تكون البقية
-- معتمدةً قبله. ولذلك يعتمد كلُّ قسمٍ ما يخصّه بـ`update` صريح.
--
-- ⚠ والعناصر تُدرج **قبل** الاعتماد لا بعده: المُشغّل `price_list_items_demote_parent`
--   يُعيد القائمة المعتمَدة إلى `pending` عند تعديل عناصرها.
-- ----------------------------------------------------------------------------
do $$
declare
  v_sub_a  constant uuid := '0f000000-0000-4000-8000-00000000000a';
  v_sub_b  constant uuid := '0f000000-0000-4000-8000-00000000000b';
  v_sub_c  constant uuid := '0f000000-0000-4000-8000-00000000000c';
  v_sub_d  constant uuid := '0f000000-0000-4000-8000-00000000000d';
  v_a1     constant uuid := '0f100000-0000-4000-8000-0000000000a1';  -- الأقرب  (٠٫٠٠ كم)
  v_a2     constant uuid := '0f100000-0000-4000-8000-0000000000a2';  -- الأوسط  (١١٫١٢ كم)
  v_a3     constant uuid := '0f100000-0000-4000-8000-0000000000a3';  -- الأبعد  (٢٢٫٢٤ كم) والأرخص
  v_b1     constant uuid := '0f100000-0000-4000-8000-0000000000b1';
  v_c1l    constant uuid := '0f100000-0000-4000-8000-0000000000c1';
  v_c2l    constant uuid := '0f100000-0000-4000-8000-0000000000c2';
  v_c3l    constant uuid := '0f100000-0000-4000-8000-0000000000c3';
  -- 🔴 المعرّفُ الأصغر بين المتعادلين، ويُدرَج **آخراً** عمداً: لو سقط الحسمُ
  --    بالمعرّف من الترتيب لعادت الدالةُ صفّاً بحسب ترتيبِ المسح لا بحسب قاعدة.
  v_c0l    constant uuid := '0f100000-0000-4000-8000-0000000000c0';
  v_d1     constant uuid := '0f100000-0000-4000-8000-0000000000d1';  -- ثنائيةُ الاتجاه، تطابق معكوسةً
  v_d2     constant uuid := '0f100000-0000-4000-8000-0000000000d2';
  v_e1     constant uuid := '0f100000-0000-4000-8000-0000000000e1';  -- نفسُ المنطلق، وجهةٌ ملاصقة
  v_e2     constant uuid := '0f100000-0000-4000-8000-0000000000e2';  -- نفسُ المنطلق، وجهةٌ أبعد وأرخص
  v_sub_e  constant uuid := '0f000000-0000-4000-8000-00000000000e';
  v_c1     text := current_setting('tours.nr_c1', true);
  v_c2     text := nullif(current_setting('tours.nr_c2', true), '');
begin
  insert into public.subcontractors (id, company_name, phone, status)
  values
    (v_sub_a, 'NEAREST_ROUTE_TESTS متعهد أ', '01000000101', 'approved'),
    (v_sub_b, 'NEAREST_ROUTE_TESTS متعهد ب', '01000000102', 'approved'),
    (v_sub_c, 'NEAREST_ROUTE_TESTS متعهد ج', '01000000103', 'approved'),
    (v_sub_d, 'NEAREST_ROUTE_TESTS متعهد د', '01000000104', 'approved'),
    (v_sub_e, 'NEAREST_ROUTE_TESTS متعهد هـ', '01000000105', 'approved');

  -- مركبةٌ فعّالة للمتعهد أ — شرطُ دخوله حوضَ الإرسال في القسم (هـ)
  insert into public.subcontractor_vehicles (subcontractor_id, class_slug, label, active)
  values (v_sub_a, v_c1, 'مركبة اختبار أ', true);

  insert into public.price_lists
    (id, subcontractor_id, title, origin_label, origin_lat, origin_lng, origin_radius_km,
     dest_label, dest_lat, dest_lng, dest_radius_km, bidirectional, status)
  values
    -- ── الممرّ (أ): ثلاثُ قوائم للمتعهد أ من مراكزَ متباعدة، **الأبعدُ أرخصُها**
    (v_a1, v_sub_a, 'NR أ-١ الأقرب',  'مركز الممرّ',      27.000000, 27.000000, 30,
     'وجهة الممرّ', 26.000000, 26.000000, 30, false, 'draft'),
    (v_a2, v_sub_a, 'NR أ-٢ الأوسط',  'شمال المركز ٠٫١°', 27.100000, 27.000000, 30,
     'وجهة الممرّ', 26.000000, 26.000000, 30, false, 'draft'),
    (v_a3, v_sub_a, 'NR أ-٣ الأبعد',  'شمال المركز ٠٫٢°', 27.200000, 27.000000, 30,
     'وجهة الممرّ', 26.000000, 26.000000, 30, false, 'draft'),
    -- ── متعهدٌ ثانٍ على الممرّ نفسه: مركزه أبعدُ من أ-١ وسعرُه أرخصُ من أ-١
    (v_b1, v_sub_b, 'NR ب-١',         'شمال المركز ٠٫٠٥°', 27.050000, 27.000000, 30,
     'وجهة الممرّ', 26.000000, 26.000000, 30, false, 'draft'),
    -- ── الممرّ (ب): ثلاثُ قوائم **بمراكزَ متطابقةٍ تماماً** — لاختبار التعادل
    (v_c1l, v_sub_c, 'NR ج-١',        'مركز ممرّ التعادل', 27.000000, 25.000000, 30,
     'وجهة ممرّ التعادل', 26.000000, 24.000000, 30, false, 'draft'),
    (v_c2l, v_sub_c, 'NR ج-٢',        'مركز ممرّ التعادل', 27.000000, 25.000000, 30,
     'وجهة ممرّ التعادل', 26.000000, 24.000000, 30, false, 'draft'),
    (v_c3l, v_sub_c, 'NR ج-٣',        'مركز ممرّ التعادل', 27.000000, 25.000000, 30,
     'وجهة ممرّ التعادل', 26.000000, 24.000000, 30, false, 'draft'),
    -- ── الممرّ (ج): قائمةٌ **مقلوبةُ الطرفين وثنائيةُ الاتجاه** ⇒ تطابق معكوسةً،
    --    ومركزُ منطلقها بالنسبة لهذه الرحلة هو `dest_*` (‏٠ كم) لا `origin_*` (‏١٥٠ كم)
    (v_d1, v_sub_d, 'NR د-١ المعكوسة', 'وجهة ممرّ العكس', 24.500000, 25.500000, 30,
     'مركز ممرّ العكس', 25.500000, 26.500000, 30, true,  'draft'),
    (v_d2, v_sub_d, 'NR د-٢ المباشرة', 'شمال مركز العكس', 25.700000, 26.500000, 30,
     'وجهة ممرّ العكس', 24.500000, 25.500000, 30, false, 'draft'),
    -- ── الممرّ (د): قائمتان **من المركز نفسِه** إلى وجهتين متداخلتي النطاق.
    --    المنطلقُ يتعادل، فيحسمه بُعدُ الوجهة — وهي الحالُ المقيسة حقيقةً على
    --    «مطار القاهرة ⇒ زمالك/مدينة نصر» في قوائم الشريك.
    (v_e1, v_sub_e, 'NR هـ-١ وجهةٌ ملاصقة', 'مركز ممرّ الوجهة', 27.500000, 28.000000, 30,
     'وجهة ملاصقة', 26.500000, 28.500000, 30, false, 'draft'),
    (v_e2, v_sub_e, 'NR هـ-٢ وجهةٌ أبعد',   'مركز ممرّ الوجهة', 27.500000, 28.000000, 30,
     'وجهة أبعد',   26.700000, 28.500000, 30, false, 'draft'),
    -- ⇐ يُدرَج آخراً بقصد: انظر تعليقَ `v_c0l` أعلاه
    (v_c0l, v_sub_c, 'NR ج-٠',        'مركز ممرّ التعادل', 27.000000, 25.000000, 30,
     'وجهة ممرّ التعادل', 26.000000, 24.000000, 30, false, 'draft');

  -- ── التكاليف: الأقربُ **أغلى** دائماً، فلو فاز الأرخصُ ظهر الفرق فوراً
  insert into public.price_list_items (price_list_id, class_slug, cost)
  values
    (v_a1, v_c1, 1800),   -- الأقرب  ⇐ يجب أن يفوز داخل «أ»
    (v_a2, v_c1, 1500),
    (v_a3, v_c1, 1200),   -- الأرخص  ⇐ كانت القاعدةُ القديمة تختاره
    (v_b1, v_c1, 1300),   -- متعهدٌ آخر: أغلى من ١٢٠٠ وأرخص من ١٨٠٠
    (v_c1l, v_c1, 950),
    (v_c2l, v_c1, 900),   -- متعادلان في السعر والمسافتين ⇒ يحسمه المعرّف الأصغر
    (v_c3l, v_c1, 900),
    (v_d1, v_c1, 2000),   -- المعكوسة، مركزُها المطابِق على بُعد ٠ كم
    (v_d2, v_c1, 1500),   -- المباشرة، مركزُها على بُعد ٢٢٫٢٤ كم
    (v_e1, v_c1, 1700),   -- وجهتُها ٠ كم من النزول — وأغلى
    (v_e2, v_c1, 1400),   -- وجهتُها ٢٢٫٢٤ كم — وأرخص
    (v_c0l, v_c1, 900);   -- ثالثُ المتعادلين، وأصغرُهم معرّفاً

  -- فئةٌ ثانية في **الأبعدِ وحدها**: القسم (د) يثبت أنها لا تُفقد
  if v_c2 is not null then
    insert into public.price_list_items (price_list_id, class_slug, cost)
    values (v_a3, v_c2, 2400);
  end if;

  -- القسم (ب) يحتاج **مطابقةً واحدة**: تُعتمد أ-١ وحدها الآن
  update public.price_lists set status = 'approved' where id = v_a1;

  raise notice '✔ (٠-ب) الفيكسترة جاهزة — خمسة متعهدين واثنتا عشرة قائمة، والمعتمَدُ الآن «أ-١» وحدها';
end;
$$;

-- ----------------------------------------------------------------------------
-- (أ) عقدُ الدالة — صفٌّ واحد لكل (متعهد × فئة)، لا أكثر ولا أقل
--
-- هذا هو العقدُ الذي تبني عليه `quote_price` و`dispatch_pool` معاً. ولو أرجعت
-- الدالةُ صفّين لمتعهدٍ واحد لعاد التجميعُ ضرورياً عند كل مُستهلِك — وعادت معه
-- فرصةُ انحرافِ نسختين من قاعدة الفوز (النمط ٨).
-- ----------------------------------------------------------------------------
do $$
declare
  v_all  integer;
  v_dist integer;
begin
  -- تُعتمد الثلاثُ الآن ليكون للعقد ما يختبره فعلاً
  update public.price_lists set status = 'approved' where id in (
    '0f100000-0000-4000-8000-0000000000a2'::uuid,
    '0f100000-0000-4000-8000-0000000000a3'::uuid);

  select count(*), count(distinct (cb.subcontractor_id, cb.class_slug))
    into v_all, v_dist
  from public.coverage_best_costs(27.0, 27.0, 26.0, 26.0) cb;

  if v_all = 0 then
    raise exception '(أ-١) الدالة لم تُرجع شيئاً على ممرٍّ فيه ثلاثُ قوائم معتمدة';
  end if;
  if v_all <> v_dist then
    raise exception '(أ-٢) الدالة أرجعت % صفاً مقابل % مفتاحاً فريداً — العقدُ «صفٌّ واحد لكل (متعهد × فئة)» مكسور',
      v_all, v_dist;
  end if;

  raise notice '✔ (أ) العقد سليم — % صفاً لـ% مفتاحاً فريداً', v_all, v_dist;
end;
$$;

-- ----------------------------------------------------------------------------
-- (ب) 🔴 قيدُ البريف ١ — مطابقةٌ واحدة ⇒ **النتيجة كما كانت حرفياً**
--
-- الحالُ الأعمّ في القاعدة. يُعاد الممرّ إلى قائمةٍ واحدةٍ معتمدة، وتُقارن
-- نتيجةُ القاعدة الجديدة بنتيجة **القاعدة القديمة محسوبةً هنا سطراً بسطر**.
-- ----------------------------------------------------------------------------
do $$
declare
  v_c1      text := current_setting('tours.nr_c1', true);
  v_old     numeric;
  v_new     numeric;
  v_qp      numeric;
  v_n       integer;
begin
  -- إلى مطابقةٍ واحدة: «أ-١» وحدها
  update public.price_lists set status = 'draft' where id in (
    '0f100000-0000-4000-8000-0000000000a2'::uuid,
    '0f100000-0000-4000-8000-0000000000a3'::uuid);

  select count(*) into v_n
  from public.coverage_matches(27.0, 27.0, 26.0, 26.0) cm
  join public.price_list_items pli on pli.price_list_id = cm.price_list_id
  where pli.class_slug = v_c1;

  if v_n <> 1 then
    raise exception '(ب-٠) مقدّمةُ القسم مكسورة: المطابقات % لا ١', v_n;
  end if;

  -- القاعدة القديمة حرفياً: أرخصُ عنصرٍ على كل المطابقات
  select min(pli.cost) into v_old
  from public.coverage_matches(27.0, 27.0, 26.0, 26.0) cm
  join public.price_list_items pli on pli.price_list_id = cm.price_list_id
  where pli.class_slug = v_c1;

  -- القاعدة الجديدة
  select min(cb.cost) into v_new
  from public.coverage_best_costs(27.0, 27.0, 26.0, 26.0) cb
  where cb.class_slug = v_c1;

  if v_new is distinct from v_old then
    raise exception '(ب-١) بمطابقةٍ واحدة اختلفت القاعدتان: القديمة % والجديدة % — القيد ١ منقوض',
      coalesce(v_old::text, 'بلا'), coalesce(v_new::text, 'بلا');
  end if;

  -- ونفسُ الشيء من مخرج المحرّك لا من الدالة الوسيطة وحدها
  select q.subcontractor_cost into v_qp
  from public.quote_price(150, 1, false, 0, 27.0, 27.0, 26.0, 26.0, 0) q
  where q.class_slug = v_c1;

  if v_qp is distinct from v_old then
    raise exception '(ب-٢) quote_price أرجعت تكلفة % والقائمة الوحيدة % — النتيجة تغيّرت عند المطابقة الواحدة',
      coalesce(v_qp::text, 'بلا'), coalesce(v_old::text, 'بلا');
  end if;

  raise notice '✔ (ب) مطابقةٌ واحدة ⇒ القاعدتان تتفقان على % — ولا شيء تغيّر', v_old;
end;
$$;

-- ----------------------------------------------------------------------------
-- (ج) 🔴 ثلاثُ مطابقاتٍ لمتعهدٍ واحد ⇒ **الأقربُ يفوز، وليس الأرخص**
--
-- وهذا هو العيبُ المقيس بعينه، والطفرةُ صريحة: يُشترط أن تفترق النتيجةُ عن
-- `min(cost)` — فلو عاد التجميعُ القديم لتساوتا واحمرّ التوكيد.
-- ----------------------------------------------------------------------------
do $$
declare
  v_c1       text := current_setting('tours.nr_c1', true);
  v_near_id  constant uuid := '0f100000-0000-4000-8000-0000000000a1';
  v_far_id   constant uuid := '0f100000-0000-4000-8000-0000000000a3';
  v_near     numeric;
  v_far      numeric;
  v_old      numeric;
  v_row      record;
  v_qp       record;
  v_n        integer;
begin
  update public.price_lists set status = 'approved' where id in (
    '0f100000-0000-4000-8000-0000000000a2'::uuid, v_far_id);

  select count(*) into v_n
  from public.coverage_matches(27.0, 27.0, 26.0, 26.0) cm
  join public.price_list_items pli on pli.price_list_id = cm.price_list_id
  where pli.class_slug = v_c1;

  if v_n <> 3 then
    raise exception '(ج-٠) مقدّمةُ القسم مكسورة: المطابقات % لا ٣', v_n;
  end if;

  select pli.cost into v_near from public.price_list_items pli
   where pli.price_list_id = v_near_id and pli.class_slug = v_c1;
  select pli.cost into v_far  from public.price_list_items pli
   where pli.price_list_id = v_far_id  and pli.class_slug = v_c1;

  select min(pli.cost) into v_old
  from public.coverage_matches(27.0, 27.0, 26.0, 26.0) cm
  join public.price_list_items pli on pli.price_list_id = cm.price_list_id
  where pli.class_slug = v_c1;

  -- المقدّمة نفسُها تُقاس: الأقربُ أغلى من الأرخص، وإلا فالاختبار زينة (النمط ٩)
  if not (v_near > v_old and v_old = v_far) then
    raise exception '(ج-٠ب) الفيكسترة لا تميّز القاعدتين: الأقرب % والأرخص % والأبعد %',
      v_near, v_old, v_far;
  end if;

  select cb.* into v_row
  from public.coverage_best_costs(27.0, 27.0, 26.0, 26.0) cb
  where cb.class_slug = v_c1;

  if v_row.price_list_id is distinct from v_near_id then
    raise exception '(ج-١) الفائزة % والمتوقع الأقرب % — «الأقربُ مركزاً» غير مطبَّق',
      coalesce(v_row.price_list_id::text, 'بلا'), v_near_id;
  end if;
  if v_row.cost is distinct from v_near then
    raise exception '(ج-٢) تكلفةُ الفائز % والمتوقع % ', coalesce(v_row.cost::text, 'بلا'), v_near;
  end if;
  if v_row.origin_km is null or v_row.origin_km > 0.001 then
    raise exception '(ج-٣) مسافةُ الفائز عن نقطة الالتقاط % كم والمتوقع ٠ — المركزُ المقاس خاطئ',
      coalesce(v_row.origin_km::text, 'بلا');
  end if;

  -- 🔴 الطفرة: لو عاد `min(pli.cost)` لتساوى الرقمان
  if v_row.cost = v_old then
    raise exception '(ج-٤) 🔴 القاعدة القديمة عادت: الفائز % = أرخصُ المطابقات %', v_row.cost, v_old;
  end if;

  -- ومن مخرج المحرّك نفسِه
  select q.* into v_qp
  from public.quote_price(150, 1, false, 0, 27.0, 27.0, 26.0, 26.0, 0) q
  where q.class_slug = v_c1;

  if coalesce(v_qp.price_source, '') <> 'subcontractor' then
    raise exception '(ج-٥) مصدرُ السعر «%» والمتوقع subcontractor', coalesce(v_qp.price_source, 'بلا');
  end if;
  if v_qp.subcontractor_cost is distinct from v_near then
    raise exception '(ج-٦) quote_price أخذت تكلفة % والمتوقع الأقرب % (الأرخص كان %)',
      coalesce(v_qp.subcontractor_cost::text, 'بلا'), v_near, v_old;
  end if;

  raise notice '✔ (ج) ثلاثُ مطابقاتٍ لمتعهدٍ واحد ⇒ فاز الأقربُ (%) لا الأرخص (%)', v_near, v_old;
end;
$$;

-- ----------------------------------------------------------------------------
-- (د) الفوزُ لكل (متعهد × فئة) ⇒ **لا تغطيةَ تُفقد**
--
-- الفئةُ الثانية مُسعَّرةٌ في **الأبعدِ وحدها**. فلو حُسم الفوزُ لكل متعهدٍ
-- دفعةً واحدة لاختفت تلك الفئة من التغطية — وهو الخطأ الذي قتل التغطية حين
-- جُرِّب تصغيرُ النطاقات.
-- ----------------------------------------------------------------------------
do $$
declare
  v_c1      text := current_setting('tours.nr_c1', true);
  v_c2      text := nullif(current_setting('tours.nr_c2', true), '');
  v_far_id  constant uuid := '0f100000-0000-4000-8000-0000000000a3';
  v_near_id constant uuid := '0f100000-0000-4000-8000-0000000000a1';
  v_raw     integer;
  v_best    integer;
  v_row     record;
begin
  if v_c2 is null then
    raise notice '⚠ (د) فئةٌ ثانية غير متاحة — القسم يُتخطّى (لا فئتين مؤهّلتين لراكبٍ واحد)';
    return;
  end if;

  -- مجموعةُ (متعهد × فئة) بعد الحسم = نفسُها قبله ⇒ لا شيء سقط
  select count(distinct (cm.subcontractor_id, pli.class_slug)) into v_raw
  from public.coverage_matches(27.0, 27.0, 26.0, 26.0) cm
  join public.price_list_items pli on pli.price_list_id = cm.price_list_id;

  select count(*) into v_best
  from public.coverage_best_costs(27.0, 27.0, 26.0, 26.0);

  if v_raw <> v_best then
    raise exception '(د-١) المطابقةُ الخام % مفتاحاً والحسمُ % — تغطيةٌ فُقدت أو تكرّرت', v_raw, v_best;
  end if;

  -- والفئتان تفوزان بقائمتين **مختلفتين**: الأولى بالأقرب والثانية بالأبعد
  select cb.* into v_row
  from public.coverage_best_costs(27.0, 27.0, 26.0, 26.0) cb
  where cb.class_slug = v_c2;

  if v_row.price_list_id is null then
    raise exception '(د-٢) الفئة الثانية «%» اختفت من التغطية بعد الحسم', v_c2;
  end if;
  if v_row.price_list_id is distinct from v_far_id then
    raise exception '(د-٣) الفئة الثانية فازت بالقائمة % والمتوقع الأبعد % (هي الوحيدة التي تُسعّرها)',
      v_row.price_list_id, v_far_id;
  end if;

  select cb.price_list_id into v_row
  from public.coverage_best_costs(27.0, 27.0, 26.0, 26.0) cb
  where cb.class_slug = v_c1;

  if v_row.price_list_id is distinct from v_near_id then
    raise exception '(د-٤) الفئة الأولى فازت بالقائمة % والمتوقع الأقرب %', v_row.price_list_id, v_near_id;
  end if;

  raise notice '✔ (د) الفوزُ لكل فئة — «%» بالأقرب و«%» بالأبعد، ولا تغطيةَ فُقدت', v_c1, v_c2;
end;
$$;

-- ----------------------------------------------------------------------------
-- (هـ) 🔴 `dispatch_pool` — المستحقُّ من القائمة الأقرب لا من أرخص قوائمه
--
-- وهذا هو الضررُ الثالث: لولا هذا الشقّ لسُعِّر العميلُ بـ١٨٠٠ وعُرض على
-- المتعهد ١٢٠٠ — أي أسوأ من الحال قبل الهجرة.
-- ----------------------------------------------------------------------------
do $$
declare
  v_c1     text := current_setting('tours.nr_c1', true);
  v_sub_a  constant uuid := '0f000000-0000-4000-8000-00000000000a';
  v_near   numeric;
  v_old    numeric;
  v_res    record;
  v_b      record;
  v_pool   record;
  v_n      integer;
  v_ceil   numeric;
begin
  select pli.cost into v_near from public.price_list_items pli
   where pli.price_list_id = '0f100000-0000-4000-8000-0000000000a1'::uuid and pli.class_slug = v_c1;

  select min(pli.cost) into v_old
  from public.coverage_matches(27.0, 27.0, 26.0, 26.0) cm
  join public.price_list_items pli on pli.price_list_id = cm.price_list_id
  where pli.class_slug = v_c1;

  if not public.partner_agreement_ok(v_sub_a) then
    raise exception '(هـ-٠) المتعهد أ خارجَ حاجز الاتفاقية — راجع مهلة `partner_agreement_config()`';
  end if;

  -- ١٨٠ كم بين ١٣٤ و٤٤٧ ⇒ تمرّ من حاجز هافرساين في `create_booking` (‏١٤٩٫٢٢ مستقيمة)
  select * into v_res from public.create_booking(
    jsonb_build_object('label', 'مركز الممرّ الصحراوي', 'lat', 27.000000, 'lng', 27.000000),
    jsonb_build_object('label', 'وجهة الممرّ الصحراوي', 'lat', 26.000000, 'lng', 26.000000),
    1, false, 0,
    180, null, 'test',
    v_c1, 'full',
    'عميل اختبار الأقرب مركزاً', '01111111111', null, now() + interval '5 days',
    'NEAREST_ROUTE_TESTS_FIXTURE'
  );

  select b.* into v_b from public.bookings b where b.id = v_res.id;

  if coalesce(v_b.price_source, '') <> 'subcontractor' then
    raise exception '(هـ-١) مصدرُ سعر الحجز «%» والمتوقع subcontractor', coalesce(v_b.price_source, 'بلا');
  end if;
  if v_b.subcontractor_cost is distinct from v_near then
    raise exception '(هـ-٢) لقطةُ تكلفة الحجز % والمتوقع الأقرب %',
      coalesce(v_b.subcontractor_cost::text, 'بلا'), v_near;
  end if;

  -- إلى «مؤكَّد» عبر الحارس نفسه لا حوله
  update public.bookings set status = 'under_review' where id = v_res.id;
  update public.bookings set status = 'confirmed'    where id = v_res.id;

  v_ceil := public.dispatch_ceiling(v_res.id, 1);

  select count(*) into v_n from public.dispatch_pool(v_res.id, 1);
  if v_n <> 1 then
    raise exception '(هـ-٣) حوضُ الموجة ١ فيه % متعهداً والمتوقع ١ (السقف % والمستحق المتوقع %)',
      v_n, coalesce(v_ceil::text, 'بلا'), v_near;
  end if;

  select * into v_pool from public.dispatch_pool(v_res.id, 1);

  if v_pool.subcontractor_id is distinct from v_sub_a then
    raise exception '(هـ-٤) المتعهد في الحوض % والمتوقع أ', coalesce(v_pool.subcontractor_id::text, 'بلا');
  end if;
  if v_pool.payout is distinct from v_near then
    raise exception '(هـ-٥) المستحقُّ المعروض % والمتوقع تكلفةُ القائمة الأقرب %', v_pool.payout, v_near;
  end if;

  -- 🔴 الطفرة: القاعدة القديمة كانت تعرض أرخصَ قوائمه
  if v_pool.payout = v_old then
    raise exception '(هـ-٦) 🔴 dispatch_pool عادت إلى min(cost): المستحق % = أرخصُ القوائم %',
      v_pool.payout, v_old;
  end if;

  raise notice '✔ (هـ) dispatch_pool عرضت % (قائمتُه الأقرب) لا % (أرخصُ قوائمه)', v_pool.payout, v_old;
end;
$$;

-- ----------------------------------------------------------------------------
-- (و) متعهدان ⇒ **الأرخصُ يفوز** — ولو كان مركزه أبعد من الفائز داخل الآخر
--
-- والطفرةُ هنا مزدوجة: تُثبت أن الاختيارَ بين المتعهدين ما زال بالسعر، وتُثبت
-- في الوقت نفسه أنه **ليس** أرخصَ قائمةٍ على الإطلاق (١٢٠٠ عند «أ»).
-- ----------------------------------------------------------------------------
do $$
declare
  v_c1     text := current_setting('tours.nr_c1', true);
  v_sub_a  constant uuid := '0f000000-0000-4000-8000-00000000000a';
  v_sub_b  constant uuid := '0f000000-0000-4000-8000-00000000000b';
  v_a_best numeric;
  v_b_cost numeric;
  v_old    numeric;
  v_qp     record;
begin
  update public.price_lists set status = 'approved'
   where id = '0f100000-0000-4000-8000-0000000000b1'::uuid;

  select cb.cost into v_a_best from public.coverage_best_costs(27.0, 27.0, 26.0, 26.0) cb
   where cb.subcontractor_id = v_sub_a and cb.class_slug = v_c1;
  select cb.cost into v_b_cost from public.coverage_best_costs(27.0, 27.0, 26.0, 26.0) cb
   where cb.subcontractor_id = v_sub_b and cb.class_slug = v_c1;

  select min(pli.cost) into v_old
  from public.coverage_matches(27.0, 27.0, 26.0, 26.0) cm
  join public.price_list_items pli on pli.price_list_id = cm.price_list_id
  where pli.class_slug = v_c1;

  -- المقدّمة تُقاس: «ب» أرخصُ من أفضلِ «أ» وأغلى من أرخصِ قوائم «أ»
  if not (v_b_cost < v_a_best and v_b_cost > v_old) then
    raise exception '(و-٠) الفيكسترة لا تميّز الحالتين: أفضلُ أ % و ب % وأرخصُ الكل %',
      v_a_best, v_b_cost, v_old;
  end if;

  select q.* into v_qp
  from public.quote_price(150, 1, false, 0, 27.0, 27.0, 26.0, 26.0, 0) q
  where q.class_slug = v_c1;

  if v_qp.subcontractor_id is distinct from v_sub_b then
    raise exception '(و-١) الفائز بين المتعهدين % والمتوقع «ب» الأرخص',
      coalesce(v_qp.subcontractor_id::text, 'بلا');
  end if;
  if v_qp.subcontractor_cost is distinct from v_b_cost then
    raise exception '(و-٢) التكلفة المختارة % والمتوقع %',
      coalesce(v_qp.subcontractor_cost::text, 'بلا'), v_b_cost;
  end if;

  -- 🔴 الطفرة: القاعدةُ القديمة كانت ستختار «أ» بـ١٢٠٠
  if v_qp.subcontractor_cost = v_old then
    raise exception '(و-٣) 🔴 الاختيارُ عاد إلى أرخصِ قائمةٍ على الإطلاق (%) بدل أرخصِ المتعهدين', v_old;
  end if;

  -- و«أ» ما زال أفضلُه هو الأقرب — لم يفسد الشقُّ الأول بإصلاح الثاني
  if v_a_best is distinct from (
       select pli.cost from public.price_list_items pli
        where pli.price_list_id = '0f100000-0000-4000-8000-0000000000a1'::uuid
          and pli.class_slug = v_c1) then
    raise exception '(و-٤) أفضلُ «أ» صار % ولم يعد قائمتَه الأقرب', v_a_best;
  end if;

  raise notice '✔ (و) بين المتعهدين فاز الأرخصُ «ب» (%) — لا «أ» بأقربه (%) ولا بأرخصه (%)',
    v_b_cost, v_a_best, v_old;
end;
$$;

-- ----------------------------------------------------------------------------
-- (ز) التعادلُ محسوم — الأرخصُ ثم المعرّف، وثباتٌ عبر نداءين (قيد البريف ٣)
--
-- ثلاثُ قوائم لمتعهدٍ واحد بمراكزَ **متطابقةٍ تماماً**: مسافتا المنطلق والوجهة
-- متساويتان في الثلاث، فلا يبقى إلا السعرُ ثم المعرّف.
-- ----------------------------------------------------------------------------
do $$
declare
  v_c1     text := current_setting('tours.nr_c1', true);
  v_c0l    constant uuid := '0f100000-0000-4000-8000-0000000000c0';
  v_c1l    constant uuid := '0f100000-0000-4000-8000-0000000000c1';
  v_c2l    constant uuid := '0f100000-0000-4000-8000-0000000000c2';
  v_c3l    constant uuid := '0f100000-0000-4000-8000-0000000000c3';
  v_row    record;
  v_first  uuid;
  v_second uuid;
  v_kms    integer;
begin
  update public.price_lists set status = 'approved' where id in (v_c0l, v_c1l, v_c2l, v_c3l);

  -- المقدّمة: المسافتان متساويتان فعلاً في الأربع (وإلا فالتعادل ليس تعادلاً)
  select count(distinct (cb2.origin_km, cb2.dest_km)) into v_kms
  from (
    select public.haversine_km(27.0, 25.0, pl.origin_lat, pl.origin_lng) as origin_km,
           public.haversine_km(26.0, 24.0, pl.dest_lat,   pl.dest_lng)   as dest_km
    from public.price_lists pl
    where pl.id in (v_c0l, v_c1l, v_c2l, v_c3l)
  ) cb2;

  if v_kms <> 1 then
    raise exception '(ز-٠) مقدّمةُ التعادل مكسورة: % زوجاً مختلفاً من المسافات لا ١', v_kms;
  end if;
  if not (v_c0l < v_c2l and v_c2l < v_c3l) then
    raise exception '(ز-٠ب) مقدّمةُ الحسم بالمعرّف مكسورة: الترتيب المتوقع % < % < %', v_c0l, v_c2l, v_c3l;
  end if;

  select cb.* into v_row
  from public.coverage_best_costs(27.0, 25.0, 26.0, 24.0) cb
  where cb.class_slug = v_c1;

  -- (ز-١) السعرُ أولاً: ٩٠٠ لا ٩٥٠
  if v_row.cost <> 900 then
    raise exception '(ز-١) عند تساوي المسافتين فاز السعر % والمتوقع الأرخص ٩٠٠', v_row.cost;
  end if;
  -- (ز-٢) ثم المعرّف الأصغر بين المتساويين في السعر — والأصغرُ مُدرَجٌ آخراً عمداً
  if v_row.price_list_id is distinct from v_c0l then
    raise exception '(ز-٢) الفائزةُ % والمتوقع المعرّفُ الأصغر % — الحسمُ ليس ثابتاً',
      v_row.price_list_id, v_c0l;
  end if;

  -- (ز-٣) وثباتٌ عبر نداءين متتاليين — لا ترتيبَ عشوائيّ
  select cb.price_list_id into v_first
  from public.coverage_best_costs(27.0, 25.0, 26.0, 24.0) cb where cb.class_slug = v_c1;
  select cb.price_list_id into v_second
  from public.coverage_best_costs(27.0, 25.0, 26.0, 24.0) cb where cb.class_slug = v_c1;

  if v_first is distinct from v_second then
    raise exception '(ز-٣) نداءان متتاليان أعطيا % ثم % — الحسمُ غيرُ محدَّد', v_first, v_second;
  end if;

  raise notice '✔ (ز) التعادلُ محسوم — الأرخصُ (٩٠٠) ثم المعرّفُ الأصغر، وثابتٌ عبر النداءات';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ز-ب) 🔴 تعادلُ المنطلق ⇒ **الأقربُ وجهةً يفوز** — قبل أن يُسأل عن السعر
--
-- قائمتان للمتعهد نفسِه **من المركز نفسِه** إلى وجهتين متداخلتي النطاق. المنطلقُ
-- يتعادل تماماً، فلولا مفتاحُ الوجهة لعاد العيبُ نفسُه مقلوباً: تُختار الأرخصُ
-- وإن كانت وجهتُها على بُعد ٢٢ كم من نقطة النزول.
--
-- 📌 وهذه حالٌ **مقيسةٌ في قوائم الشريك الحقيقية** لا فرضيّةٌ: «مطار القاهرة ⇒
--    زمالك» و«مطار القاهرة ⇒ مدينة نصر» يتعادلان في المنطلق (‏٧٫١٣٤ كم) ويفترقان
--    في الوجهة (‏٠٫١٧٧ مقابل ١١٫٨٣٥ كم) بسعرين مختلفين (‏٦٠٠ و٥٠٠).
-- ----------------------------------------------------------------------------
do $$
declare
  v_c1    text := current_setting('tours.nr_c1', true);
  v_e1    constant uuid := '0f100000-0000-4000-8000-0000000000e1';
  v_e2    constant uuid := '0f100000-0000-4000-8000-0000000000e2';
  v_row   record;
  v_km_o  integer;
  v_near  numeric;
  v_cheap numeric;
begin
  update public.price_lists set status = 'approved' where id in (v_e1, v_e2);

  -- المقدّمة (١): المنطلقُ متعادلٌ فعلاً بين القائمتين
  select count(distinct x.km) into v_km_o
  from (
    select public.haversine_km(27.5, 28.0, pl.origin_lat, pl.origin_lng) as km
    from public.price_lists pl where pl.id in (v_e1, v_e2)
  ) x;

  if v_km_o <> 1 then
    raise exception '(ز-ب-٠) مقدّمةُ التعادل مكسورة: % مسافةَ منطلقٍ مختلفة لا ١', v_km_o;
  end if;

  select pli.cost into v_near  from public.price_list_items pli
   where pli.price_list_id = v_e1 and pli.class_slug = v_c1;
  select pli.cost into v_cheap from public.price_list_items pli
   where pli.price_list_id = v_e2 and pli.class_slug = v_c1;

  -- المقدّمة (٢): الأقربُ وجهةً **أغلى**، وإلا لم يميّز الاختبار شيئاً
  if not (v_near > v_cheap) then
    raise exception '(ز-ب-٠ب) الفيكسترة لا تميّز: الأقربُ وجهةً % والأرخصُ %', v_near, v_cheap;
  end if;

  select cb.* into v_row
  from public.coverage_best_costs(27.5, 28.0, 26.5, 28.5) cb
  where cb.class_slug = v_c1;

  if v_row.price_list_id is distinct from v_e1 then
    raise exception '(ز-ب-١) الفائزةُ % والمتوقع «هـ-١» الأقربُ وجهةً — مفتاحُ الوجهة لا يعمل',
      coalesce(v_row.price_list_id::text, 'بلا');
  end if;
  if v_row.cost is distinct from v_near then
    raise exception '(ز-ب-٢) تكلفةُ الفائزة % والمتوقع %', coalesce(v_row.cost::text, 'بلا'), v_near;
  end if;
  if v_row.dest_km is null or v_row.dest_km > 0.001 then
    raise exception '(ز-ب-٣) بُعدُ وجهة الفائزة % كم والمتوقع ٠', coalesce(v_row.dest_km::text, 'بلا');
  end if;

  -- 🔴 الطفرة: بلا مفتاحِ الوجهة يفوز الأرخص
  if v_row.cost = v_cheap then
    raise exception '(ز-ب-٤) 🔴 عند تعادل المنطلق فاز الأرخصُ (%) — مفتاحُ الوجهة سقط من الترتيب', v_cheap;
  end if;

  raise notice '✔ (ز-ب) تعادلَ المنطلق ⇒ فازت الأقربُ وجهةً (%) لا الأرخص (%)', v_near, v_cheap;
end;
$$;

-- ----------------------------------------------------------------------------
-- (ح) 🔴 المطابقةُ المعكوسة — المسافة تُقاس إلى **الطرف المطابِق** لا إلى `origin_*`
--
-- «د-١» مقلوبةُ الطرفين وثنائيةُ الاتجاه: بالنسبة لرحلةِ P3⇒Q3 مركزُ منطلقها
-- هو `dest_*` (‏٠ كم). ولو قِيست إلى `origin_*` لصارت على بُعد ١٥٠ كم ففازت
-- «د-٢» الأبعدُ فعلياً والأرخص — وهي الطفرةُ المقصودة هنا.
-- ----------------------------------------------------------------------------
do $$
declare
  v_c1      text := current_setting('tours.nr_c1', true);
  v_d1      constant uuid := '0f100000-0000-4000-8000-0000000000d1';
  v_d2      constant uuid := '0f100000-0000-4000-8000-0000000000d2';
  v_row     record;
  v_rev     boolean;
  v_naive1  numeric;
  v_naive2  numeric;
begin
  update public.price_lists set status = 'approved' where id in (v_d1, v_d2);

  -- المقدّمة: «د-١» تطابق **معكوسةً** فعلاً
  select cm.reversed into v_rev
  from public.coverage_matches(25.5, 26.5, 24.5, 25.5) cm
  where cm.price_list_id = v_d1;

  if v_rev is null then
    raise exception '(ح-٠) «د-١» لم تطابق أصلاً — راجع الإحداثيات والنطاقات';
  end if;
  if not v_rev then
    raise exception '(ح-٠ب) «د-١» طابقت مباشرةً لا معكوسةً — الفيكسترة لا تختبر القلب';
  end if;

  -- المسافةُ «الساذجة» (بلا قلب) — هي ما كان سيقيسه تطبيقٌ خاطئ
  select public.haversine_km(25.5, 26.5, pl.origin_lat, pl.origin_lng) into v_naive1
    from public.price_lists pl where pl.id = v_d1;
  select public.haversine_km(25.5, 26.5, pl.origin_lat, pl.origin_lng) into v_naive2
    from public.price_lists pl where pl.id = v_d2;

  if not (v_naive1 > v_naive2) then
    raise exception '(ح-٠ج) الفيكسترة لا تميّز القلب: الساذجة لـد-١ % ولـد-٢ %', v_naive1, v_naive2;
  end if;

  select cb.* into v_row
  from public.coverage_best_costs(25.5, 26.5, 24.5, 25.5) cb
  where cb.class_slug = v_c1;

  if v_row.price_list_id is distinct from v_d1 then
    raise exception '(ح-١) الفائزةُ % والمتوقع «د-١» المعكوسة — المسافةُ قِيست إلى الطرف الخطأ',
      coalesce(v_row.price_list_id::text, 'بلا');
  end if;
  if not coalesce(v_row.reversed, false) then
    raise exception '(ح-٢) عمودُ reversed للفائزة % والمتوقع true', coalesce(v_row.reversed::text, 'بلا');
  end if;
  if v_row.origin_km is null or v_row.origin_km > 0.001 then
    raise exception '(ح-٣) مسافةُ الفائزة المقلوبة % كم والمتوقع ٠', coalesce(v_row.origin_km::text, 'بلا');
  end if;

  raise notice '✔ (ح) المطابقةُ المعكوسة قُلبت — فازت «د-١» بـ٠ كم بدل ١٥٠ كم لو لم تُقلب';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ط) أرضيةُ الهامش (D-16) تبقى حاجزاً صلباً بعد التغيير (قيد البريف ٢)
--
-- التوقّعُ مشتقٌّ من نفس المدخلات: الأرضيةُ التي نضبطها هنا هي الأرضيةُ المتوقَّعة.
-- ----------------------------------------------------------------------------
do $$
declare
  v_c1     text := current_setting('tours.nr_c1', true);
  v_floor  constant numeric := 5000;      -- أعلى بكثير من ١٪ من أي تكلفة هنا
  v_cost   numeric;
  v_qp     record;
begin
  select min(cb.cost) into v_cost
  from public.coverage_best_costs(27.0, 27.0, 26.0, 26.0) cb
  where cb.class_slug = v_c1;

  update public.pricing_settings
     set margin_type = 'percent', margin_value = 1, margin_min_amount = v_floor,
         peak_enabled = false;

  select q.* into v_qp
  from public.quote_price(150, 1, false, 0, 27.0, 27.0, 26.0, 26.0, 0) q
  where q.class_slug = v_c1;

  -- المقدّمة: النسبةُ أقلُّ من الأرضية فعلاً، وإلا لم نختبر الأرضية أصلاً
  if v_cost * 1 / 100 >= v_floor then
    raise exception '(ط-٠) النسبة (%) لا تقلّ عن الأرضية (%) — الاختبار لا يقيس الأرضية',
      v_cost * 1 / 100, v_floor;
  end if;

  -- الحاجزُ نفسه: لا هامشَ دون الأرضية بحال
  if v_qp.margin_amount is null or v_qp.margin_amount < v_floor then
    raise exception '(ط-١) الهامش المطبَّق % دون الأرضية % — D-16 انكسر بعد 0132',
      coalesce(v_qp.margin_amount::text, 'بلا'), v_floor;
  end if;
  -- وحين لا تتدخّل أرضيةُ الفئة (`min_price`) فالهامشُ هو الأرضيةُ بالضبط
  if not coalesce(v_qp.min_applied, false) and v_qp.margin_amount <> v_floor then
    raise exception '(ط-١ب) الهامش % والمتوقع الأرضية % بالضبط (أرضيةُ الفئة لم تتدخّل)',
      v_qp.margin_amount, v_floor;
  end if;
  if v_qp.total < v_cost + v_floor then
    raise exception '(ط-٢) الإجمالي % أقلُّ من التكلفة % + الأرضية % — الحاجز لم يعد صلباً',
      v_qp.total, v_cost, v_floor;
  end if;

  raise notice '✔ (ط) أرضيةُ الهامش صلبة — هامش % على تكلفة % وإجمالي %',
    v_qp.margin_amount, v_cost, v_qp.total;
end;
$$;

-- ----------------------------------------------------------------------------
-- (ي) المنح — `coverage_best_costs` تكشف تكاليفَ المتعهدين، فهي محجوبةٌ عنهم
--
-- كلُّ متعهدٍ مستخدمٌ `authenticated` (D-20)، والدالةُ `security definer` تتجاوز
-- RLS. ومنحُها لدورٍ عام هو حرفياً ثغرةُ `0011` عائدةً (النمط ١ في `LESSONS.md`).
-- ----------------------------------------------------------------------------
do $$
declare
  v_sig constant text := 'public.coverage_best_costs(numeric, numeric, numeric, numeric)';
  v_pub integer;
begin
  if has_function_privilege('anon', v_sig, 'execute') then
    raise exception '(ي-١) 🔴 coverage_best_costs متاحةٌ لـanon — تكاليفُ المتعهدين مكشوفةٌ للزائر';
  end if;
  if has_function_privilege('authenticated', v_sig, 'execute') then
    raise exception '(ي-٢) 🔴 coverage_best_costs متاحةٌ لـauthenticated — متعهدٌ يقرأ تكاليفَ منافسيه (D-20)';
  end if;

  -- ولا منحةَ PUBLIC ضمنية (الافتراضُ في Postgres أن كل دالةٍ جديدة تُمنح لها)
  select count(*) into v_pub
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  cross join lateral unnest(coalesce(p.proacl, '{}'::aclitem[])) a(item)
  where n.nspname = 'public' and p.proname = 'coverage_best_costs'
    and a.item::text like '=%';

  if v_pub > 0 then
    raise exception '(ي-٣) 🔴 coverage_best_costs عليها منحةُ PUBLIC ضمنية (% صفاً)', v_pub;
  end if;

  if not has_function_privilege('service_role', v_sig, 'execute') then
    raise exception '(ي-٤) service_role لا يستطيع تنفيذ coverage_best_costs — المنحُ ضاق أكثر من اللازم';
  end if;

  raise notice '✔ (ي) المنحُ سليم — محجوبةٌ عن anon و authenticated و PUBLIC، ومتاحةٌ لـservice_role';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ك) التنظيف واستعادة الإعدادات
--
-- ⚠ `db-test.mjs` يلفّ الملف في `BEGIN … ROLLBACK` فلا شيء يُكمَّ أصلاً.
--    وهذا القسم للتشغيل اليدوي من psql — وهو زائدٌ لا ضارّ.
-- ----------------------------------------------------------------------------
do $$
declare
  v_saved jsonb := nullif(current_setting('tours.nr_settings', true), '')::jsonb;
begin
  delete from public.notifications n
   where n.payload ->> 'bookingId' in (
         select b.id::text from public.bookings b
          where b.trip ->> 'notes' = 'NEAREST_ROUTE_TESTS_FIXTURE');
  delete from public.bookings b where b.trip ->> 'notes' = 'NEAREST_ROUTE_TESTS_FIXTURE';
  delete from public.subcontractors s where s.company_name like 'NEAREST_ROUTE_TESTS%';

  if v_saved is not null then
    update public.pricing_settings
       set peak_enabled      = (v_saved ->> 'peak_enabled')::boolean,
           peak_percent      = (v_saved ->> 'peak_percent')::numeric,
           margin_type       = v_saved ->> 'margin_type',
           margin_value      = (v_saved ->> 'margin_value')::numeric,
           margin_min_amount = (v_saved ->> 'margin_min_amount')::numeric;
  end if;

  raise notice '✔ (ك) تنظيفٌ تامّ واستعادةُ إعدادات التسعير';
end;
$$;

do $$
begin
  raise notice 'ALL PASSED';
end;
$$;
