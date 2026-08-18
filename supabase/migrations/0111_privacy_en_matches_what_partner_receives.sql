-- ============================================================================
-- 0111_privacy_en_matches_what_partner_receives.sql
-- 🔴 `/en/privacy` يَعِد الزائرَ بما تنقضه القاعدة — **والإنجليزية حيّةٌ له**.
-- تُصحَّح **قيمةُ الصفّ الإنجليزيّ المنشور في مكانها**، فتقول ما تقوله العربية
-- المصحَّحة حرفاً بحرف، وما تُخرجه `portal_trips()` فعلاً.
--
-- ── ما يُلمس، وما لا يُلمس — صريحاً قبل أي شيء ─────────────────────────────
--
--   | الجدول | الفعل |
--   |---|---|
--   | `public.translations` — **صفٌّ واحد** | `update value, source_text` |
--   | `public.sections` | **لا يُلمس** |
--   | `public.page_revisions` | **لا يُلمس** |
--
-- ⇒ **D-60 لا تنطبق هنا**: قاعدتها على «مَن كتب في `sections.content`»، وهذا
--   الملف لا يكتب فيه حرفاً — `0105` هي التي كتبت العربية وحملت واجبَ اللقطات.
--   وهذه طبقةٌ أعلى: **الترجمة**، ولها فحصُها الخاصّ (٤-ج) الذي يُثبت أن بصمة
--   `sections` و`page_revisions` **لم تتحرّك** — فالادّعاء مقيسٌ لا موعود.
--
-- ── ما كان مكتوباً بالإنجليزية، ومقيسٌ حيّاً ────────────────────────────────
--
-- الصفّ: `translations` · `locale='en'` · `namespace='section'` ·
-- `key='b0000000-0000-4000-8000-000000003303.items.pvw002.c2'` · **`published`**.
--
-- مقيسٌ على **بناء إنتاج** (‏بناءٌ طابعه `04:05:00Z` + `next start :3861`،
-- و`curl /en/privacy` في **2026-08-18 04:31:59Z**) — السلسلة عند الإزاحة 35646:
--
--   «… they receive **the minimum needed** to carry it out: your name, your
--   phone number, the pickup point and the destination, the departure time and
--   the number of passengers — **without the transfer receipt and without the
--   data of your other trips.**»
--
-- و`portal_trips()` مقروءةً من `pg_get_functiondef` — **الكتالوج الحيّ لا ملفُّ
-- هجرة** (D-58) — تُخرج فوق ذلك ثلاثةَ حقولٍ شخصيةٍ لا يذكرها النصّ:
--
--   | العمود | مصدره في الجسم الحيّ | في الإنجليزية القديمة؟ |
--   |---|---|---|
--   | `customer_whatsapp` | `b.customer_whatsapp` | 🔴 لا |
--   | `flight_number` | `b.trip ->> 'flightNumber'` (‏0067) | 🔴 لا |
--   | `notes` | **`b.trip ->> 'notes'` خاماً** بلا `dispatch_safe_notes` | 🔴 لا |
--   | `origin_label`/`dest_label` | `b.trip ->> …` **بالعنوان الكامل** | جزئياً |
--   | `class_title` · `distance_km` · `waiting_hours` | لقطة الحجز | لا |
--
-- **وفي بيانات المالك الحيّة اليوم** (‏١٧ حجزاً): واتساب في **١٧/١٧**، ورقم
-- رحلةٍ جوية في ٢، وملاحظات في ٦ ⇒ الانكشاف **شاملٌ لا نادر**، ووعدٌ منشورٌ
-- يقول أقلَّ منه هو ما يقرؤه الزائر اليوم.
--
-- ── لماذا تحديثٌ في المكان، ولماذا هذا **ليس** «نشرَ إنجليزيةٍ جديدة» ────────
--
-- `0105` امتنعت عن كتابة الإنجليزية عمداً، وسبّبته بنيوياً: للمفتاح صفٌّ
-- إنجليزيٌّ **منشور**، و`translations` عليها `unique (locale, namespace, key)`
-- ⇒ **لا مسودةَ ثانية له**؛ وتحويلُه `draft` يُنقص المنشور ‏٨٧١ ⇐ ٨٧٠ ويُسقط
-- الخليّة إلى العربية داخل جدولٍ إنجليزيّ.
--
-- والقاعدة التي امتنعت `0105` بها — «لا تُنشر لغةٌ من هجرة بلا مراجعة المالك» —
-- **وُضعت لتمنع إعلانَ لغةٍ قبل مراجعة محتواها**. والمالك **أشعل الإنجليزية
-- ونشرها بقراره** (‏`locales.en` معلَنةٌ للزوار · ٨٧١ صفّاً منشوراً)، فالصفُّ
-- **حيٌّ ومقروءٌ الآن**. ⇒ المفاضلة ليست «ننشر أو لا ننشر» بل:
--
--   · **تركُ وعدٍ منشورٍ يكذب على الزائر** في صفحة خصوصية، أم
--   · **تصحيحُ قيمةِ صفٍّ منشورٍ خاطئ** بلا تغيير حالته ولا عدده.
--
-- والثاني أقلُّ ضرراً بلا مقارنة. **ولا يُنشأ صفّ، ولا تُغيَّر حالة، ولا يتحرّك
-- عدد**: `published` يبقى **٨٧١** — مبرهَناً في (٤-أ).
--
-- ⏰ **وموعدُه قبل رفع `noindex` لا بعده** — النافذة مغلقةٌ اليوم
--    (‏`indexable=false`)، ورفعُها يفهرس ما هو منشور كما هو.
--
-- ── النصّ الإنجليزي: من أين جاء، وأين خالف مسوّدة ترويسة `0105` ─────────────
--
-- الأصل هو النصُّ الجاهز في ترويسة `0105` (‏الذي أُعدّ ليلصقه المالك بيده).
-- **وخالفتُه في موضعٍ واحد فقط، ويُقال صراحةً**: العربية تقول «وملاحظاتك على
-- الحجز كما كتبتها **بلا حذف**»، ومسوّدة `0105` أسقطت «بلا حذف». وإسقاطُها
-- يُعيد **بذرةَ العيب نفسه**: تصريحٌ إنجليزيٌّ أضعفُ مما يقع (‏`notes` تمرّ
-- **خاماً** بعد القبول، بلا `dispatch_safe_notes`). فأُضيفت `with nothing
-- removed`. وما عدا ذلك **حرفٌ بحرف كما في `0105`**.
--
-- والمقابلةُ حقلاً بحقل ليست ادّعاءً: القسم (٢-٥) يحمل **خمسة عشر زوجاً**
-- (عربيّ ⇄ إنجليزيّ) ويرمي إن سقط طرفٌ من أيّ زوج.
--
-- ── ⚠ فجوةٌ مسمّاةٌ لا مطويّة — حقلان تُخرجهما الدالة ولا تسمّيهما **اللغتان** ──
--
-- `portal_trips()` تُخرج أيضاً `round_trip` و`status`، **والعربيةُ لا تسمّيهما
-- كذلك**. فهما صفتا رحلةٍ لا بياناتٌ شخصيةٌ زائدة، **ولا تُضافان هنا إلى
-- الإنجليزية وحدها**: لغةٌ تسمّي ما لا تسمّيه الأخرى هي بعينها الانحرافُ الذي
-- وُلد منه هذا الملف. ⇒ **يُرفع للمالك قراراً واحداً يُطبَّق على النصّين معاً.**
--
-- ── ما لا يفعله هذا الملف ──────────────────────────────────────────────────
--
-- **لا يُضيّق حمولة `portal_trips()`** — `OWNER-DECISIONS-2026-08-17 §٢`:
-- «ابقِ الوضع كما هو عليه وسجّل ملاحظة». المتعهد ينفّذ بهذه الأعمدة، وتضييقُها
-- تغييرُ سلوكِ تشغيلٍ قائم. **والعلاج أصدق وأرخص: يُقال ما يقع.**
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (١) الثوابت واللقطة قبل
-- ----------------------------------------------------------------------------
create temporary table _tr_111 on commit drop as
select
  'en'::text                                                              as loc,
  'section'::text                                                         as ns,
  'b0000000-0000-4000-8000-000000003303.items.pvw002.c2'::text            as k,
  'b0000000-0000-4000-8000-000000003303'::uuid                            as sec_id,
  -- الأصل العربي المصحَّح (‏`0105` §٣) — يجب أن يطابق الفهرسَ الحيّ حرفاً بحرف
  'لا تصلهما بياناتك قبل قبول المتعهد للرحلة. وبعد القبول يصلهما ما يلزم للتنفيذ: اسمك ورقم هاتفك ورقم واتسابك إن سجّلته، ونقطتا الانطلاق والوجهة بعنوانيهما الكاملين، وموعد التحرك وعدد الركاب وفئة المركبة ومسافة المسار وساعات الانتظار، ورقم رحلتك الجوية إن أدخلته، وملاحظاتك على الحجز كما كتبتها بلا حذف. ولا يصلهما إيصال التحويل ولا السعر الذي دفعته، ولا أيُّ رحلةٍ من رحلاتك غير التي أُسند إليهما تنفيذها.'::text as ar_expected,
  -- الإنجليزية القائمة، مقيسةً على بناء إنتاج في 04:31:59Z
  'Your data does not reach them before the partner accepts the trip. After acceptance they receive the minimum needed to carry it out: your name, your phone number, the pickup point and the destination, the departure time and the number of passengers — without the transfer receipt and without the data of your other trips.'::text as en_old,
  -- الإنجليزية المصحَّحة — ترجمةُ العربية أعلاه حقلاً بحقل
  'Your data does not reach them before the partner accepts the trip. After acceptance they receive what carrying it out requires: your name, your phone number and your WhatsApp number if you gave one, the pickup point and the destination with their full addresses, the departure time, the number of passengers, the vehicle class, the route distance and the waiting hours, your flight number if you entered one, and your booking notes exactly as you wrote them, with nothing removed. They do not receive the transfer receipt, nor the price you paid, nor any trip of yours other than the one assigned to them.'::text as en_new;

create temporary table _base_111 on commit drop as
select
  (select count(*) from public.translations
     where locale = 'en' and status = 'published')                        as en_published_before,
  (select count(*) from public.translations where locale = 'en')          as en_rows_before,
  (select count(*) from public.translations)                              as tr_rows_before,
  (select count(*) from public.i18n_corpus_rows())                        as corpus_before,
  (select md5(string_agg(s.id::text || ':' || s.content::text, '|' order by s.id))
     from public.sections s)                                              as sections_md5_before,
  (select md5(coalesce(string_agg(r.id::text || ':' || r.status || ':' || md5(r.snapshot::text),
                                  '|' order by r.id), ''))
     from public.page_revisions r)                                        as revisions_md5_before,
  (select count(*) from public.translations tr
     where tr.status = 'published'
       and tr.source_hash is distinct from (
             select public.i18n_source_hash(c.src) from public.i18n_corpus_rows() c
             where c.ns = tr.namespace and c.k = tr.key))                 as stale_before,
  (select tr.id from public.translations tr
     where tr.locale = 'en' and tr.namespace = 'section'
       and tr.key = 'b0000000-0000-4000-8000-000000003303.items.pvw002.c2') as row_id;

-- ----------------------------------------------------------------------------
-- (٢) الحواجز — قبل أيّ كتابة في محتوى منشور
-- ----------------------------------------------------------------------------
do $g111$
declare
  p        record;
  b        record;
  v_row    public.translations%rowtype;
  v_live   text;
  v_def    text;
  v_pair   record;
begin
  select * into p from _tr_111;
  select * into b from _base_111;

  -- (٢-١) الصفّ قائمٌ ومنشور — وهو الشرط الذي يجعل «تحديثاً في المكان» صحيحاً
  if b.row_id is null then
    raise exception '0111: لا صفَّ ترجمةٍ إنجليزيّ للمفتاح % — أعد القياس', p.k;
  end if;
  select * into v_row from public.translations tr where tr.id = b.row_id;
  if v_row.status is distinct from 'published' then
    raise exception
      '0111: 🔴 حالةُ الصفّ «%» لا «published» — الفرضيةُ التي بُني عليها الملف سقطت',
      v_row.status;
  end if;

  -- (٢-٢) 🔴 القيمةُ الحالية هي التي قِيست بالضبط — لا يُكتب فوق تحريرٍ للمالك
  if v_row.value is distinct from p.en_old then
    raise exception
      '0111: 🔴 النصُّ الإنجليزيّ تغيّر عمّا قِيس — لا يُكتب فوقه. الحالي: «%»',
      left(coalesce(v_row.value, 'NULL'), 140);
  end if;

  -- (٢-٣) 🔴 والأصلُ العربيُّ الحيّ هو ما نترجمه — لا نصٌّ اختفى من تحتنا
  select c.src into v_live
  from public.i18n_corpus_rows() c
  where c.ns = p.ns and c.k = p.k;

  if v_live is null then
    raise exception '0111: 🔴 المفتاح % غير موجودٍ في الفهرس الحيّ', p.k;
  end if;
  if v_live is distinct from p.ar_expected then
    raise exception
      '0111: 🔴 الأصل العربي تغيّر عمّا تُرجم — لا تُكتب ترجمةُ نصٍّ غير قائم. الحيّ: «%»',
      left(v_live, 140);
  end if;

  -- (٢-٤) الصفحة منشورةٌ والقسم مرئيّ — وإلا فما نصحّحه لا يقرؤه أحد
  if not exists (
    select 1 from public.sections s join public.pages pg on pg.id = s.page_id
    where s.id = p.sec_id and s.visible and pg.published and pg.slug = 'privacy'
  ) then
    raise exception '0111: القسم ليس مرئياً في صفحة privacy منشورة — أعد القياس';
  end if;

  -- (٢-٥) 🔒 **مقابلةٌ حقلاً بحقل** — النصّان يقولان الشيء نفسه، أو لا يُكتب شيء
  for v_pair in
    select * from (values
      ('اسمك',                    'your name'),
      ('رقم هاتفك',               'your phone number'),
      ('واتساب',                  'WhatsApp'),
      ('نقطتا الانطلاق والوجهة',  'the pickup point and the destination'),
      ('بعنوانيهما الكاملين',     'with their full addresses'),
      ('موعد التحرك',             'the departure time'),
      ('عدد الركاب',              'the number of passengers'),
      ('فئة المركبة',             'the vehicle class'),
      ('مسافة المسار',            'the route distance'),
      ('ساعات الانتظار',          'the waiting hours'),
      ('رحلتك الجوية',            'your flight number'),
      ('ملاحظاتك على الحجز',      'your booking notes'),
      ('بلا حذف',                 'with nothing removed'),
      ('إيصال التحويل',           'the transfer receipt'),
      ('السعر الذي دفعته',        'the price you paid')
    ) as t(ar, en)
  loop
    if position(v_pair.ar in p.ar_expected) = 0 then
      raise exception '0111: 🔴 العربية لا تحمل «%» — المقابلة مكسورة', v_pair.ar;
    end if;
    if position(v_pair.en in p.en_new) = 0 then
      raise exception '0111: 🔴 الإنجليزية لا تحمل «%» — المقابلة مكسورة', v_pair.en;
    end if;
  end loop;

  -- و«رحلاتك الأخرى» بحرفها الصحيح: لا حصرَ مطلقاً بل استثناءُ المُسنَد
  if position('غير التي أُسند إليهما' in p.ar_expected) = 0
     or position('other than the one assigned to them' in p.en_new) = 0 then
    raise exception '0111: 🔴 شرطُ «إلا ما أُسند إليهما» ساقطٌ من أحد النصّين';
  end if;
  -- والادّعاءُ المتقاعد لا يعود من الباب الخلفي
  if position('the minimum needed' in p.en_new) > 0 then
    raise exception '0111: 🔴 «the minimum needed» عاد إلى النصّ الجديد';
  end if;

  -- (٢-٦) والحمولة **لم تُضيَّق**: الأعمدة الثلاثة ما زالت تخرج من `portal_trips()`
  --        (‏نفس حارس `0105` — النصّ يصف الواقع، فلو تغيّر الواقع بطل الوصف)
  v_def := pg_get_functiondef('public.portal_trips()'::regprocedure);
  if position('customer_whatsapp' in v_def) = 0
     or position('flightNumber' in v_def) = 0
     or position($$b.trip ->> 'notes'$$ in v_def) = 0 then
    raise exception
      '0111: 🔴 portal_trips() لم تعد تُخرج الثلاثة — النصّ الإنجليزي يصف واقعاً غير قائم';
  end if;
  -- وما لا يصله ما زال لا يصله: مرجعُ العميل مقنَّعٌ برمز الشريك (D-46)
  if position('partner_trip_code' in v_def) = 0 then
    raise exception '0111: 🔴 مرجع حجز العميل صار يصل المتعهد — انحدارُ D-46';
  end if;
  -- و`dispatch_safe_notes` ما زالت **قبل** القبول وحدها — فوصفُ «بلا حذف» صادق
  if position('dispatch_safe_notes' in v_def) > 0 then
    raise exception
      '0111: 🟠 portal_trips() صارت تُقنّع الملاحظات — «with nothing removed» لم يعد صادقاً';
  end if;

  raise notice '  <- قبل: منشور en % · صفوف en % · الفهرس % · قديم(stale) %',
    b.en_published_before, b.en_rows_before, b.corpus_before, b.stale_before;
end;
$g111$;

-- ----------------------------------------------------------------------------
-- (٣) الكتابة — صفٌّ واحد، حقلان. **والحالة لا تُمسّ.**
--
--     `source_text` يُحدَّث معه عمداً: `source_hash` عمودٌ مولَّدٌ منه
--     (`i18n_source_hash(source_text)`)، وهو ما يُطفئ وسمَ «قديم» في اللوحة.
--     وتركُه يعني صفّاً صحيحَ النصّ يظهر للمالك **مشبوهاً إلى الأبد**.
-- ----------------------------------------------------------------------------
update public.translations tr
   set value       = (select en_new from _tr_111),
       source_text = (select ar_expected from _tr_111)
 where tr.id = (select row_id from _base_111)
   and tr.status = 'published'
   and tr.value  = (select en_old from _tr_111);

-- ----------------------------------------------------------------------------
-- (٤) الفحص الذاتي — كلُّ ادّعاءٍ في الترويسة يُقاس هنا أو يفشل الملف
-- ----------------------------------------------------------------------------
do $c111$
declare
  p           record;
  b           record;
  v_row       public.translations%rowtype;
  v_published integer;
  v_rows      integer;
  v_tr_rows   integer;
  v_corpus    integer;
  v_stale     integer;
  v_sections  text;
  v_revisions text;
  v_prog      record;
begin
  select * into p from _tr_111;
  select * into b from _base_111;
  select * into v_row from public.translations tr where tr.id = b.row_id;

  -- (٤-أ) 🔴 العدد لا يتحرّك — لا صفَّ يُنشأ ولا حالةٌ تُقلب
  select count(*) into v_published
    from public.translations where locale = 'en' and status = 'published';
  select count(*) into v_rows    from public.translations where locale = 'en';
  select count(*) into v_tr_rows from public.translations;

  if v_published <> b.en_published_before then
    raise exception '0111: 🔴 المنشور الإنجليزي تحرّك % <- % — نقضٌ للشرط',
      b.en_published_before, v_published;
  end if;
  if v_rows <> b.en_rows_before or v_tr_rows <> b.tr_rows_before then
    raise exception '0111: 🔴 عددُ صفوف الترجمة تحرّك (en % <- %، الكل % <- %)',
      b.en_rows_before, v_rows, b.tr_rows_before, v_tr_rows;
  end if;
  if v_row.status is distinct from 'published' then
    raise exception '0111: 🔴 حالةُ الصفّ صارت «%»', v_row.status;
  end if;

  -- (٤-ب) القيمةُ الجديدة نزلت فعلاً، والأصلُ المخزَّن صار الأصلَ الحيّ
  if v_row.value is distinct from p.en_new then
    raise exception '0111: 🔴 القيمةُ لم تنزل. الحالي: «%»',
      left(coalesce(v_row.value, 'NULL'), 140);
  end if;
  if v_row.source_text is distinct from p.ar_expected then
    raise exception '0111: 🔴 `source_text` لم يتبنَّ الأصلَ العربي الحيّ';
  end if;
  if v_row.source_hash is distinct from public.i18n_source_hash(p.ar_expected) then
    raise exception '0111: 🔴 `source_hash` المولَّد لا يطابق بصمةَ الأصل الحيّ';
  end if;

  -- (٤-ج) 🔒 **الطبقةُ الأخرى لم تُلمس** — فلا واجبَ D-60 على هذا الملف أصلاً
  select md5(string_agg(s.id::text || ':' || s.content::text, '|' order by s.id))
    into v_sections from public.sections s;
  select md5(coalesce(string_agg(r.id::text || ':' || r.status || ':' || md5(r.snapshot::text),
                                 '|' order by r.id), ''))
    into v_revisions from public.page_revisions r;

  if v_sections is distinct from b.sections_md5_before then
    raise exception '0111: 🔴 بصمةُ `sections` تحرّكت — هذا الملف لا يكتب فيها';
  end if;
  if v_revisions is distinct from b.revisions_md5_before then
    raise exception '0111: 🔴 بصمةُ `page_revisions` تحرّكت — هذا الملف لا يكتب فيها';
  end if;

  -- (٤-د) الفهرسُ لم يتغيّر، ووسمُ «قديم» انطفأ — بلا صفٍّ آخر يُشعله
  select count(*) into v_corpus from public.i18n_corpus_rows();
  if v_corpus <> b.corpus_before then
    raise exception '0111: 🔴 الفهرسُ الحيّ تحرّك % <- %', b.corpus_before, v_corpus;
  end if;

  select count(*) into v_stale
    from public.translations tr
   where tr.status = 'published'
     and tr.source_hash is distinct from (
           select public.i18n_source_hash(c.src) from public.i18n_corpus_rows() c
           where c.ns = tr.namespace and c.k = tr.key);
  if v_stale <> 0 then
    raise exception '0111: 🔴 ما زال % صفّاً منشوراً «قديماً» — المتوقَّع صفر', v_stale;
  end if;

  -- (٤-هـ) والدالةُ التي تراها اللوحة تقول الشيء نفسه (‏لا حسابي وحده)
  select * into v_prog from public.translation_progress() tp where tp.locale = 'en';
  if v_prog.published <> b.en_published_before or v_prog.stale <> 0 then
    raise exception '0111: 🔴 translation_progress(): منشور % · قديم %',
      v_prog.published, v_prog.stale;
  end if;

  -- (٤-و) وصفٌّ واحدٌ لا غير هو الذي يحمل أحدثَ طابعٍ في الجدول
  if (select count(*) from public.translations tr
        where tr.updated_at >= (select max(t2.updated_at) from public.translations t2)) <> 1 then
    raise exception '0111: 🔴 أكثرُ من صفِّ ترجمةٍ يحمل أحدثَ طابع — الكتابة أوسعُ من صفّها';
  end if;

  raise notice '  OK 0111: منشور en % (بلا حركة) · قديم % <- 0 · sections و page_revisions بلا مساس',
    v_published, b.stale_before;
  raise notice '  ⚠ يبقى للمالك: `round_trip` و`status` تُخرجهما portal_trips() ولا يسمّيهما النصّان — قرارٌ واحدٌ يُطبَّق عليهما معاً';
end;
$c111$;
