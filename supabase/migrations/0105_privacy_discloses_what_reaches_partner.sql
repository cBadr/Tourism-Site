-- ============================================================================
-- 0105_privacy_discloses_what_reaches_partner.sql
-- صفحة الخصوصية كانت تَعِد بأقلّ مما يصل المتعهد فعلاً — **يُصحَّح النصّ، ولا
-- تُضيَّق الحمولة**، بقرار المالك نصّاً.
--
-- ── ما كان مكتوباً، وما يقع فعلاً ──────────────────────────────────────────
--
-- الصفّ: `sections.id = b0000000-0000-4000-8000-000000003303`، عنصر `pvw002`،
-- الحقل `c2` — صفحة `privacy`، جدول «الجهات المطّلعة وما يصل كلاً منها».
--
--   **الوعد**: «… يصلهما الحد الأدنى اللازم للتنفيذ: اسمك ورقم هاتفك ونقطتا
--   الانطلاق والوجهة وموعد التحرك وعدد الركاب، دون إيصال التحويل ودون بيانات
--   رحلاتك الأخرى.»
--
-- والواقع من `pg_get_functiondef('public.portal_trips()')` — **الكتالوج الحيّ
-- لا ملفُّ هجرة** (D-58) — أربعةٌ وعشرون عموداً، منها **ثلاثةٌ شخصيةٌ لا يذكرها
-- النصّ إطلاقاً**:
--
--   | العمود | مصدره في الجسم الحيّ | في النصّ؟ |
--   |---|---|---|
--   | `customer_whatsapp` | `b.customer_whatsapp` | 🔴 **لا** |
--   | `flight_number`     | `b.trip ->> 'flightNumber'` (‏0067) | 🔴 **لا** |
--   | `notes`             | **`b.trip ->> 'notes'` خاماً** | 🔴 **لا** |
--   | `origin_label`/`dest_label` | `b.trip ->> …` **خاماً بالعنوان الكامل** | جزئياً («نقطتا الانطلاق والوجهة») |
--   | `class_title` · `distance_km` · `round_trip` · `waiting_hours` | لقطة الحجز | لا |
--
-- 🔴 **وأثقلها `notes`**: العرضُ **قبل** القبول يمرّ بـ`dispatch_safe_notes()`
--    (‏تُقنّع البريد وسلاسل الأرقام: «اتصل بي على ▪▪▪ أو ▪▪▪» — قِيس)،
--    **وبعد** القبول يمرّ خاماً بلا تقنيع. فما وصفه النصّ بـ«الحد الأدنى» يشمل
--    نصّاً حرّاً كتبه العميل قد يحمل رقماً أو عنواناً أو أيّ شيء.
--
-- **وفي البيانات الحيّة اليوم** (١٧ حجزاً): `customer_whatsapp` في **١٧/١٧**،
-- و`flightNumber` في ٢، و`notes` في ٦. ⇒ الانكشاف الأول **شاملٌ لا نادر**.
--
-- ── وما يقيسه هذا الملف من الوعود التي **تصمد** ────────────────────────────
--
-- قِيس بدور المتصفح `authenticated` بهوية المتعهد `7bffe14d…` داخل
-- `begin … rollback` (2026-08-18، 03:0xZ):
--
--   | الوعد | القياس | الحكم |
--   |---|---|---|
--   | «دون إيصال التحويل» | `select count(*) from public.payments` ⇒ **٠** (و`receipt_path` صفر) | ✅ يصمد |
--   | لا سعرٌ ولا هامش | `select count(*) from public.bookings` ⇒ **٠** — RLS لا يعطيه صفاً | ✅ يصمد |
--   | مرجع العميل لا يصله (D-46) | `portal_trips().reference` = `partner_trip_code` ⇒ `#A9D70EB1` لا `TR-…` | ✅ يصمد |
--   | ما قبل القبول لا يحمل شخصياً (D-19) | `portal_offers()` تستعمل `dispatch_public_label` و`dispatch_safe_notes` ولا عمودَ اسمٍ ولا هاتف | ✅ يصمد |
--   | **«دون بيانات رحلاتك الأخرى»** | `portal_trips()` أعادت **٣ صفوف لعميلٍ واحد** («محمد بدر»، نفس الهاتف على الثلاثة) | 🔴 **لا يصمد بحرفه** |
--
-- ⇒ الوعدُ الأخير مكسورٌ حين تُسنَد أكثرُ من رحلةٍ لعميلٍ واحد إلى المتعهد
--   نفسه. والصياغة الصادقة **ليست** «دون بيانات رحلاتك الأخرى» بل «لا يصلهما
--   من رحلاتك إلا ما أُسند إليهما تنفيذُه» — وهو ما تفرضه الدالة فعلاً
--   (`d.assigned_subcontractor_id = public.current_subcontractor_id()`).
--
-- ── القرار: النصّ لا الحمولة ───────────────────────────────────────────────
--
-- `OWNER-DECISIONS-2026-08-17 §٢`: «ابقِ الوضع كما هو عليه وسجّل ملاحظة».
-- ⇒ **لا يُنقص عمودٌ من `portal_trips()`**: المتعهد ينفّذ بها، وتضييقُها يغيّر
--   سلوك تشغيلٍ قائم. والعلاج أرخصُ وأصدق: **يُقال ما يقع**.
--
-- ⏰ **وموعدُه قبل رفع `noindex` لا بعده**: النافذة مغلقةٌ اليوم (‏`indexable=false`
--    على الثلاثة: `robots.txt` و`/` و`/en`)، ورفعُها يفهرس النصّ كما هو.
--
-- ── وما لا يُكتب هنا، ولماذا — **فجوةٌ مسمّاةٌ لا مطويّة** 🔴 ────────────────
--
-- تغيُّرُ الأصل العربي يجعل الصفَّ الإنجليزيّ المنشور على هذا المفتاح **قديماً**
-- (`stale`)، وهو مقصودٌ: ذلك وسمُ اللوحة المصمَّم لهذه الحال بالضبط.
-- **ولا تكتب هذه الهجرة الإنجليزية**، والسبب بنيويّ لا تردّد:
--
--   · المفتاح له صفٌّ إنجليزيٌّ **منشور** (`2f287624-…`)، و`translations` عليها
--     `unique (locale, namespace, key)` ⇒ **لا مسودةَ ثانية له**.
--   · وتحويلُ الصفّ القائم إلى `draft` يُنقص المنشور الإنجليزي ٨٧١ ⇐ ٨٧٠،
--     ويُسقط الخليّة إلى العربية داخل جدولٍ إنجليزيّ.
--   · وكتابةُ الإنجليزية `published` من هجرة = نشرٌ بلا مراجعة المالك — ممنوع.
--
-- ⇒ **والطريق أمام المالك، بضغطتين**: `/admin/languages/en` ← مرشّح **«قديم»**
--   ⇒ يظهر هذا الصفّ وحده ⇒ الصق النصّ التالي واضغط «اعتمد وانشر»
--   (‏`review_translation(id, value, true)` — تتبنّى الأصل الجديد وتنشر معاً):
--
--   Your data does not reach them before the partner accepts the trip. After
--   acceptance they receive what carrying it out requires: your name, your phone
--   number and your WhatsApp number if you gave one, the pickup point and the
--   destination with their full addresses, the departure time, the number of
--   passengers, the vehicle class, the route distance and the waiting hours,
--   your flight number if you entered one, and your booking notes exactly as you
--   wrote them. They do not receive the transfer receipt, nor the price you
--   paid, nor any trip of yours other than the one assigned to them.
--
-- ⚠ **وحتى يفعل، `/en/privacy` يعرض الوعد القديم** — والنافذة مغلقةٌ بـ`noindex`،
--    **فلا يُرفع `noindex` قبل هذه الضغطتين.**
--
-- ── D-60: مَن كتب في `sections.content` كتب في اللقطات الحيّة معها ──────────
--
-- قِيس: `page_revisions` تحمل **١٥ صفاً كلُّها لصفحة الرئيسية**
-- `94f4e9a0-…` (‏١ `published` + ١٤ `archived`)، و**صفر صفٍّ لصفحة `privacy`**.
-- فالتحديث أدناه لا يجد ما يُصالحه اليوم — **ويبقى مكتوباً** لأن غيابَ لقطةٍ
-- حالةُ اليوم لا قاعدةُ الغد، ولأن الحذف هو بعينه ما وُلد منه عطبُ `0087`.
-- **والمؤرشفة لا تُلمس**: إعادةُ كتابة الماضي تكذب على من يقرأ السجل.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (١) الثوابت واللقطة قبل
-- ----------------------------------------------------------------------------
create temporary table _priv_105 on commit drop as
select
  'b0000000-0000-4000-8000-000000003303'::uuid as sec_id,
  'pvw002'::text                                as item_k,
  'لا تصلهما بياناتك قبل قبول المتعهد للرحلة. وبعد القبول يصلهما الحد الأدنى اللازم للتنفيذ: اسمك ورقم هاتفك ونقطتا الانطلاق والوجهة وموعد التحرك وعدد الركاب، دون إيصال التحويل ودون بيانات رحلاتك الأخرى.'::text as c2_old,
  'لا تصلهما بياناتك قبل قبول المتعهد للرحلة. وبعد القبول يصلهما ما يلزم للتنفيذ: اسمك ورقم هاتفك ورقم واتسابك إن سجّلته، ونقطتا الانطلاق والوجهة بعنوانيهما الكاملين، وموعد التحرك وعدد الركاب وفئة المركبة ومسافة المسار وساعات الانتظار، ورقم رحلتك الجوية إن أدخلته، وملاحظاتك على الحجز كما كتبتها بلا حذف. ولا يصلهما إيصال التحويل ولا السعر الذي دفعته، ولا أيُّ رحلةٍ من رحلاتك غير التي أُسند إليهما تنفيذها.'::text as c2_new;

create temporary table _base_105 on commit drop as
select
  (select count(*) from public.i18n_corpus_rows())                         as corpus_before,
  (select count(*) from public.translations
     where locale = 'en' and status = 'published')                         as published_before,
  (select count(*) from public.translations where locale = 'en')           as rows_before,
  (select page_id from public.sections
     where id = (select sec_id from _priv_105))                            as page_id,
  (select count(*) from public.page_revisions r
     where r.page_id = (select s.page_id from public.sections s
                        where s.id = (select sec_id from _priv_105))
       and r.status in ('draft', 'published'))                             as live_snaps,
  (select count(*) from public.page_revisions r
     where r.page_id = (select s.page_id from public.sections s
                        where s.id = (select sec_id from _priv_105))
       and r.status = 'archived')                                          as archived_snaps;

-- ----------------------------------------------------------------------------
-- (٢) الحواجز — قبل أيّ كتابة في محتوى المالك
-- ----------------------------------------------------------------------------
do $g105$
declare
  p       record;
  b       record;
  v_now   text;
  v_items jsonb;
  v_def   text;
begin
  select * into p from _priv_105;
  select * into b from _base_105;

  if b.page_id is null then
    raise exception '0105: القسم % غير موجود', p.sec_id;
  end if;

  -- (٢-١) الصفحة منشورةٌ والقسم مرئيّ — وإلا فما نصحّحه لا يقرؤه أحد أصلاً
  if not exists (
    select 1 from public.sections s join public.pages pg on pg.id = s.page_id
    where s.id = p.sec_id and s.visible and pg.published and pg.slug = 'privacy'
  ) then
    raise exception '0105: القسم ليس مرئياً في صفحة privacy منشورة — أعد القياس';
  end if;

  -- (٢-٢) 🔴 النصّ الحالي هو النصّ الذي قِيس بالضبط — لا نكتب فوق تحريرٍ للمالك
  select el.item ->> 'c2' into v_now
  from public.sections s
  cross join lateral jsonb_array_elements(s.content -> 'items') el(item)
  where s.id = p.sec_id and el.item ->> '_k' = p.item_k;

  if v_now is null then
    raise exception '0105: لا عنصرَ _k=% في القسم', p.item_k;
  end if;
  if v_now is distinct from p.c2_old then
    raise exception
      '0105: 🔴 نصُّ الخصوصية تغيّر عمّا قِيس — لا يُكتب فوقه. الحالي: «%»', left(v_now, 120);
  end if;

  -- (٢-٣) كل عنصرٍ يحمل `_k` — فلا مفتاحَ ترجمةٍ يُيتَّم بإعادة الكتابة (0059/0082)
  select s.content -> 'items' into v_items from public.sections s where s.id = p.sec_id;
  if exists (
    select 1 from jsonb_array_elements(v_items) x
    where nullif(btrim(coalesce(x ->> '_k', '')), '') is null
  ) then
    raise exception '0105: 🔴 عنصرٌ بلا _k — إعادة الكتابة تُيتّم مفتاح ترجمة';
  end if;

  -- (٢-٤) والحمولة **لم تُضيَّق**: الأعمدة الثلاثة ما زالت تخرج من `portal_trips()`.
  --        (‏قرار المالك: النصّ يوصف الواقع؛ فلو تغيّر الواقع بطل الوصف.)
  v_def := pg_get_functiondef('public.portal_trips()'::regprocedure);
  if position('customer_whatsapp' in v_def) = 0
     or position('flightNumber' in v_def) = 0
     or position($$b.trip ->> 'notes'$$ in v_def) = 0 then
    raise exception
      '0105: 🔴 portal_trips() لم تعد تُخرج الثلاثة — النصّ الجديد يصف واقعاً غير قائم';
  end if;
  -- وما لا يصله ما زال لا يصله: مرجعُ العميل مقنَّعٌ برمز الشريك (D-46)
  if position('partner_trip_code' in v_def) = 0 then
    raise exception '0105: 🔴 مرجع حجز العميل صار يصل المتعهد — انحدارُ D-46';
  end if;

  raise notice '  ← قبل: الفهرس % · المنشور en % · لقطات حيّة % · مؤرشفة %',
    b.corpus_before, b.published_before, b.live_snaps, b.archived_snaps;
end;
$g105$;

-- ----------------------------------------------------------------------------
-- (٣) الكتابة — الحقل وحده، و`_k` وبقيةُ العناصر كما هي
-- ----------------------------------------------------------------------------
update public.sections s
set content = jsonb_set(
      s.content,
      '{items}',
      (select jsonb_agg(
                case when el.item ->> '_k' = (select item_k from _priv_105)
                     then jsonb_set(el.item, '{c2}',
                            to_jsonb((select c2_new from _priv_105)))
                     else el.item
                end
                order by el.ord)
       from jsonb_array_elements(s.content -> 'items') with ordinality as el(item, ord)))
where s.id = (select sec_id from _priv_105)
  and exists (
    select 1 from jsonb_array_elements(s.content -> 'items') x
    where x ->> '_k' = (select item_k from _priv_105)
      and x ->> 'c2' = (select c2_old from _priv_105));

-- ----------------------------------------------------------------------------
-- (٤) 🔒 D-60 — واللقطات الحيّة معها. والمؤرشفة **لا تُلمس**.
--
--     صفر لقطةٍ حيّة لهذه الصفحة اليوم (‏قِيس في ٢)، فهذا التحديث لا يجد ما
--     يُصالحه. **ويبقى** لأن الحذف يجعل الملفَّ صحيحاً بعمر أول جلسة منشئ.
-- ----------------------------------------------------------------------------
update public.page_revisions r
set snapshot = jsonb_set(
      r.snapshot,
      '{sections}',
      (select jsonb_agg(
                case when e.s ->> 'id' = (select sec_id from _priv_105)::text
                     then jsonb_set(
                            e.s, '{content,items}',
                            (select jsonb_agg(
                                      case when el.item ->> '_k' = (select item_k from _priv_105)
                                           then jsonb_set(el.item, '{c2}',
                                                  to_jsonb((select c2_new from _priv_105)))
                                           else el.item
                                      end
                                      order by el.ord)
                             from jsonb_array_elements(
                                    coalesce(e.s -> 'content' -> 'items', '[]'::jsonb)
                                  ) with ordinality as el(item, ord)))
                     else e.s
                end
                order by e.ord)
       from jsonb_array_elements(r.snapshot -> 'sections') with ordinality as e(s, ord)))
where r.page_id = (select page_id from _base_105)
  and r.status in ('draft', 'published')
  and jsonb_typeof(r.snapshot -> 'sections') = 'array'
  and exists (
    select 1
    from jsonb_array_elements(r.snapshot -> 'sections') x
    cross join lateral jsonb_array_elements(
      coalesce(x -> 'content' -> 'items', '[]'::jsonb)) y(item)
    where x ->> 'id' = (select sec_id from _priv_105)::text
      and y.item ->> '_k' = (select item_k from _priv_105)
      and y.item ->> 'c2' = (select c2_old from _priv_105));

-- ----------------------------------------------------------------------------
-- (٥) الفحص الذاتي
-- ----------------------------------------------------------------------------
do $c105$
declare
  p        record;
  b        record;
  v_now    text;
  v_n      integer;
  v_bad    text;
  v_stale  boolean;
begin
  select * into p from _priv_105;
  select * into b from _base_105;

  -- (٥-١) النصّ صار الجديد
  select el.item ->> 'c2' into v_now
  from public.sections s
  cross join lateral jsonb_array_elements(s.content -> 'items') el(item)
  where s.id = p.sec_id and el.item ->> '_k' = p.item_k;
  if v_now is distinct from p.c2_new then
    raise exception '0105: النصّ لم يُكتب — الحالي «%»', left(coalesce(v_now, 'NULL'), 80);
  end if;

  -- (٥-٢) وبقيةُ الجدول لم تُمسّ: أربعةُ عناصر بمفاتيحها الأربعة وبقيّة حقولها
  select count(*) into v_n
  from public.sections s
  cross join lateral jsonb_array_elements(s.content -> 'items') el(item)
  where s.id = p.sec_id;
  if v_n <> 4 then
    raise exception '0105: عدد عناصر الجدول % بدل ٤', v_n;
  end if;
  select string_agg(x.k, '، ') into v_bad
  from (values ('pvw001'), ('pvw002'), ('pvw003'), ('pvw004')) x(k)
  where not exists (
    select 1 from public.sections s
    cross join lateral jsonb_array_elements(s.content -> 'items') el(item)
    where s.id = p.sec_id and el.item ->> '_k' = x.k);
  if v_bad is not null then
    raise exception '0105: 🔴 مفاتيحُ عناصرَ فُقدت — %', v_bad;
  end if;
  if (select s.content ->> 'title' from public.sections s where s.id = p.sec_id)
     is distinct from 'الجهات المطّلعة وما يصل كلاً منها' then
    raise exception '0105: 🔴 عنوانُ القسم تغيّر — الكتابة تجاوزت حقلها';
  end if;

  -- (٥-٣) 🔴 الفهرس: نفسُ عدد المفاتيح، ولا مفتاحَ خرج — النصّ تغيّر لا العنوان
  select count(*) into v_n from public.i18n_corpus_rows();
  if v_n <> b.corpus_before then
    raise exception '0105: 🔴 عددُ مفاتيح الفهرس تغيّر % ⇐ %', b.corpus_before, v_n;
  end if;
  if not exists (
    select 1 from public.i18n_corpus_rows() c
    where c.ns = 'section'
      and c.k = p.sec_id::text || '.items.' || p.item_k || '.c2'
      and c.src = p.c2_new
  ) then
    raise exception '0105: 🔴 المفتاح لم يعد في الفهرس بنصّه الجديد — يتيمٌ صامت';
  end if;

  -- (٥-٤) 🔴 المنشور الإنجليزي لم يتحرّك، وعددُ صفوف `en` لم يتحرّك
  select count(*) into v_n
  from public.translations where locale = 'en' and status = 'published';
  if v_n <> b.published_before then
    raise exception '0105: 🔴 المنشور الإنجليزي تحرّك % ⇐ %', b.published_before, v_n;
  end if;
  select count(*) into v_n from public.translations where locale = 'en';
  if v_n <> b.rows_before then
    raise exception '0105: 🔴 عدد صفوف en تحرّك % ⇐ % — هذه الهجرة لا تكتب ترجمة',
      b.rows_before, v_n;
  end if;

  -- (٥-٥) والصفُّ الإنجليزيّ صار **قديماً** — وهذا مقصودٌ ومقيس، لا أثرٌ جانبي
  select (tr.source_hash is distinct from public.i18n_source_hash(p.c2_new))
    into v_stale
  from public.translations tr
  where tr.locale = 'en' and tr.namespace = 'section'
    and tr.key = p.sec_id::text || '.items.' || p.item_k || '.c2';
  if v_stale is null then
    raise exception '0105: لا صفَّ إنجليزيّاً على المفتاح — الوضع تغيّر';
  end if;
  if not v_stale then
    raise exception '0105: الصفُّ الإنجليزي ليس قديماً — أي أن الأصل لم يتغيّر فعلاً';
  end if;
  if not exists (
    select 1 from public.translation_queue('en', 'stale') q
    where q.key = p.sec_id::text || '.items.' || p.item_k || '.c2'
  ) then
    raise exception '0105: 🔴 الصفُّ لا يظهر في مرشّح «قديم» — المالك لن يجده';
  end if;

  -- (٥-٦) D-60: لا لقطةٍ حيّةٍ تخالف صفَّها، ولا مؤرشفةٍ لُمست
  select count(*) into v_n
  from public.page_revisions r
  where r.page_id = b.page_id and r.status = 'archived';
  if v_n <> b.archived_snaps then
    raise exception '0105: 🔴 عددُ اللقطات المؤرشفة تغيّر % ⇐ %', b.archived_snaps, v_n;
  end if;

  select string_agg(r.id::text, '، ') into v_bad
  from public.page_revisions r
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(r.snapshot -> 'sections') = 'array'
         then r.snapshot -> 'sections' else '[]'::jsonb end) x
  cross join lateral jsonb_array_elements(
    coalesce(x -> 'content' -> 'items', '[]'::jsonb)) y(item)
  where r.page_id = b.page_id
    and r.status in ('draft', 'published')
    and x ->> 'id' = p.sec_id::text
    and y.item ->> '_k' = p.item_k
    and y.item ->> 'c2' is distinct from p.c2_new;
  if v_bad is not null then
    raise exception '0105: 🔴 لقطةٌ حيّة تخالف صفَّها — أول نشرةٍ تمحو التصحيح: %', v_bad;
  end if;

  raise notice
    '0105 ✔ النصّ يصف ما يقع (واتساب · رقم الرحلة · الملاحظات الخام) · الوعود الصامدة مقيسة (لا إيصال · لا سعر · D-46) · الفهرس ثابتٌ عند % · المنشور en ثابتٌ عند % · لقطات حيّة % · مؤرشفة % بلا مساس',
    b.corpus_before, b.published_before, b.live_snaps, b.archived_snaps;
  raise notice
    '0105 ⚠ الصفُّ الإنجليزيّ على هذا المفتاح صار «قديماً» بقصد — /admin/languages/en ← مرشّح «قديم» ⇒ الصق النصّ من ترويسة هذا الملف واضغط «اعتمد وانشر». **قبل رفع noindex.**';
end;
$c105$;
