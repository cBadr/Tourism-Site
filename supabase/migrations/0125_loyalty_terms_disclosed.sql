-- ============================================================================
-- 0125_loyalty_terms_disclosed.sql
-- نظام الولاء يعمل على الموقع، **ولا صفحة منشورة واحدة تقول شروطه** — وأثقلها
-- أن النقاط تنتهي بعد مدةٍ لا يعلمها العميل. يُنشَر البند، ونصُّه **يُشتق من
-- `loyalty_settings` لا يُكتب بيد**.
--
-- ══════════════════════════════════════════════════════════════════════════
--  ٠) المقيس قبل أيّ سطر — من القاعدة الحيّة لا من ملفات الهجرة (‏D-58)
-- ══════════════════════════════════════════════════════════════════════════
--
-- `select * from public.loyalty_settings` (2026-08-18):
--
--   | المقبض | القيمة | ما تعنيه للعميل |
--   |---|---|---|
--   | `enabled`             | **true**  | النظام مُشعَل، والنقاط تُسكّ فعلاً |
--   | `points_per_currency` | ١         | نقطة عن كل جنيه |
--   | `currency_per_point`  | ٠٫٠٢      | النقطة قرشان ⇒ الاسترداد **٢٪** |
--   | `min_redeem_points`   | ١٠٠٠      | أقل رصيدٍ يُستبدل (= ٢٠ جنيه) |
--   | `max_redeem_percent`  | ١٠        | سقف ما يُدفع بالنقاط من الرحلة |
--   | `expire_months`       | ٣         | 🔴 **النقاط تنتهي بعد ٩٠ يوماً** |
--
-- وقياس المُتحقِّق على `sections` (١٦٠ قسماً · ٢٤ صفحة):
--
--   select count(*) from public.sections where content::text ~ 'ولاء'            ⇒ 0
--   select count(*) from public.sections where content::text ~ 'انتهاء صلاحية'   ⇒ 0
--   select count(*) from public.sections where content::text ~ 'صلاحية'          ⇒ 0
--
-- ⇒ **صفرُ ذكرٍ للولاء إطلاقاً** على الموقع المنشور — لا شروطه ولا انتهاؤه.
--   والسطح الوحيد الذي يذكر النقاط للعميل بطاقةُ «نقاطك» في `/account`
--   (`app/(site)/account/_components/loyalty-balance.tsx`) وهي تعرض الرصيد
--   وما يساويه **ولا تقول شرطاً واحداً**: لا حدّاً أدنى ولا سقفاً ولا انتهاءً.
--
-- والسلوك المقيس من الكتالوج الحيّ، لا من نيّة أحد:
--
--   • `loyalty_on_booking_completed()` — تسكّ عند الانتقال **إلى** `completed`
--     وحده: `v_base = total − extrasTotal` ثم `floor(v_base × points_per_currency)`.
--     ⇒ «بعد التنفيذ لا عند الحجز» · «بعد الخصم» · «قبل الخدمات الإضافية».
--   • `apply_points(...)` — السقف
--     `least(floor(after_coupon × max_redeem_percent/100), room − coupon)`
--     ⇒ الكوبون يأكل المساحة أولاً؛ والحدّ الأدنى يُقاس على **المخصوم فعلاً**؛
--     والتقويم من `loyalty_config()` **لحظة النداء** لا لحظة الكسب.
--   • `loyalty_lots(text)` — `expires_at = occurred_at + expire_months` وترتيبٌ
--     بالأقدم ⇒ «من تاريخ الاحتساب» و«الأقدم أولاً».
--   • `loyalty_on_booking_cancelled()` / `_failed()` ⇒ `loyalty_reverse_booking`
--     ⇒ «سُحبت نقاطها بقيدٍ عاكس».
--
-- ══════════════════════════════════════════════════════════════════════════
--  ١) 🔒 لماذا دالةٌ تولّد النصّ، ولا يُكتب النصّ بيدٍ في هذا الملف
-- ══════════════════════════════════════════════════════════════════════════
--
-- `sections.content` نصٌّ ساكن، ولا مُحرِّك قوالبَ في العارضة (‏`components/sections/`
-- تُصيّر النصّ كما هو). فرقمٌ يُكتب بيدٍ هنا **ينفصل عن الإعداد في اللحظة التي
-- يلمس فيها المالك مقبضاً في `/admin/loyalty`** — وهذا بعينه العطب الذي يعالجه
-- هذا الملف، فلا يجوز أن يُعاد بشكلٍ آخر.
--
-- **فالمصدر واحد**: `public.loyalty_terms_disclosure()` تقرأ `loyalty_settings`
-- وتُخرج جملَ البند مصوغةً بأرقامها الجارية. وهذا الملف **يستدعيها** ويكتب
-- ناتجها. ومجموعةُ `supabase/tests/loyalty_terms_tests.sql` تقارن المنشورَ
-- بناتجها في كل جولة ⇒ **أيّ تغييرِ مقبضٍ يُحمِّر البوابة بدل أن يكذب صامتاً**.
-- (القاعدة الذهبية ١٢: لا يُستنسخ منطق، ويُفوَّض إليه.)
--
-- ⚠ **وحدُّها المُعلَن**: الدالة تولّد ولا تفرض. النصّ المكتوب في `sections`
--   يبقى ساكناً حتى تُعاد كتابته — والمجموعة هي ما يجعل السكون **مسموعاً**.
--
-- ══════════════════════════════════════════════════════════════════════════
--  ٢) الموضع: بندٌ في `terms` — ولماذا **يُلحَق** ولا يُدرَج
-- ══════════════════════════════════════════════════════════════════════════
--
-- صفحة `terms` تحمل عشرة بنودٍ مرقّمة، وفهرسُها (`page-toc`) يُبنى من البنود
-- الظاهرة نفسها فيلتقط الجديد بلا تعديل. والإدراجُ في وسط الوثيقة يعني إعادة
-- ترقيم ما بعده — أي تعديلَ حقل `num` في صفوفٍ قائمة، وكلُّ واحدٍ منها **مفتاحُ
-- ترجمةٍ إنجليزيّ منشور يصير «قديماً»** فيطلب من المالك اعتماداً جديداً بلا
-- فائدةٍ للقارئ. فالبند يُلحق برقم ١١ و**لا يُمسّ صفٌّ قائم**.
--
-- 🙋 وترتيبُه بعد «تعديل هذه الشروط» ملاحظةٌ تحريرية **قرارُها لبدر** — مسجّلةٌ
--    في `docs/phase-briefs/OPEN-DEFECTS-2026-08-17.md`، ولا تُنفَّذ بلا رده.
--
-- ══════════════════════════════════════════════════════════════════════════
--  ٣) 🔴 والظهور يتبع `enabled` — لا يُنشر وعدٌ بنظامٍ مطفأ
-- ══════════════════════════════════════════════════════════════════════════
--
-- الولاء **مبذورٌ مطفأً** في أي نسخة Whitelabel جديدة (‏`lib/loyalty-types.ts` §١)،
-- وهذا الملف يعمل عليها كما يعمل على قاعدة بدر. فبندٌ يُنشر دائماً كان سيَعِد
-- بنظامٍ لا يسكّ نقطةً واحدة. ⇒ `visible = loyalty_settings.enabled` لحظةَ
-- الكتابة (‏= `true` على قاعدة بدر اليوم)، والمجموعة تحرس تطابقهما بعدها.
--
-- ══════════════════════════════════════════════════════════════════════════
--  ٤) الإنجليزية: **ثلاثة صفوف مسوّدة، ولا نشر**
-- ══════════════════════════════════════════════════════════════════════════
--
-- 🔴 **مقيسٌ ويجب أن يُقرأ قبل أي هجرةٍ تكتب ترجمة**: `locales` تقول
--    `en.auto_publish = true`. ⇒ `upsert_translations()` — المسار المعتمد —
--    تُدرج الصفَّ ذا القيمة بحالة **`published` مباشرة** (الفرع «أ» في جسمها
--    الحيّ). فاستعمالها هنا كان **نشراً** لا مسوّدة، ونشرُ الترجمة قرارُ بدر
--    وحده (‏`STANDING-ORDERS` §١ب). ولذلك تُكتب الصفوف الثلاثة **إدراجاً
--    مباشراً بحالة `draft`**، ويبقى `published` عند رقمه بلا حركة — والفحص
--    الذاتي (٧-٥) يشهد على ذلك.
--
-- ══════════════════════════════════════════════════════════════════════════
--  ٥) D-60 — مَن كتب في `sections.content` كتب في اللقطات الحيّة معها
-- ══════════════════════════════════════════════════════════════════════════
--
-- قِيس: `page_revisions` تحمل ١٥ صفاً **كلَّها لصفحة الرئيسية** (١ `published`
-- + ١٤ `archived`)، و**صفر صفٍّ لصفحة `terms`**. فلا لقطةَ حيّةً تُصالَح اليوم.
--
-- 🔴 **وخطرُ الغد مقيسٌ في جسم `publish_page_revision` الحيّ**: خطوتُه (ب)
--    **تحذف** كل قسمٍ لا يوجد في اللقطة — لا تُفرغه بل تحذفه. و`reconcile_revision_items`
--    تُصالح `items` وحدها ولا تعرف قسماً غائباً بأكمله. ⇒ لقطةٌ لصفحة `terms`
--    أُخذت قبل هذا الملف ثم نُشرت **تمحو هذا البند كلّه** ومعه مفاتيح ترجمته.
--    فالإلحاق باللقطات الحيّة أدناه مكتوبٌ وإن كان اليوم بلا صفّ — والمؤرشفة
--    **لا تُلمس**: إعادةُ كتابة الماضي تكذب على من يقرأ السجل.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- (١) المصدر الواحد لنصّ البند — يُشتق من الإعدادات، ولا رقمَ مكتوبٌ بيد
-- ----------------------------------------------------------------------------
create or replace function public.loyalty_terms_disclosure()
returns table (ord integer, para integer, measure text, ar text, en text)
language sql
stable
set search_path = ''
as $fn125$
  with s as (
    select l.* from public.loyalty_settings l limit 1
  ),
  -- كل رقمٍ يُنسَّق **مرةً واحدة وفي موضعٍ واحد**: قصُّ الأصفار العشرية، ثم
  -- أرقامٌ عربية هندية للعربية وأرقامٌ لاتينية للإنجليزية.
  raw(k, v) as (
              select 'earn',        s.points_per_currency                                        from s
    union all select 'unit_points', 100::numeric                                                 from s
    union all select 'unit_money',  round(100 * s.currency_per_point, 2)                         from s
    union all select 'pct_back',    round(s.points_per_currency * s.currency_per_point * 100, 2) from s
    union all select 'min_points',  s.min_redeem_points::numeric                                 from s
    union all select 'min_money',   round(s.min_redeem_points * s.currency_per_point, 2)         from s
    union all select 'cap_pct',     s.max_redeem_percent                                         from s
    union all select 'months',      s.expire_months::numeric                                     from s
  ),
  f as (
    select
      k,
      v,
      -- '2.00' ⇐ '2' · '0.020' ⇐ '0.02' · والصحيحُ لا يُمسّ
      case when strpos(v::text, '.') > 0 then rtrim(rtrim(v::text, '0'), '.') else v::text end as lat
    from raw
  ),
  -- 🔒 تمييزُ العدد في العربية ليس زخرفة بل صحّةُ نصٍّ يقرؤه العميل: «٢ جنيه»
  --    و«١ أشهر» و«٣ نقطة» أخطاءٌ تظهر لحظةَ يغيّر المالك مقبضاً. فالصياغة
  --    تُشتقّ من **قيمة** العدد لا من قالبٍ واحد يصلح لقيمةٍ واحدة.
  w as (
    select
      f.*,
      translate(f.lat, '0123456789.', '٠١٢٣٤٥٦٧٨٩٫') as ar,
      case
        when f.v = 1                                          then 'جنيه واحد'
        when f.v = 2                                          then 'جنيهين'
        when f.v = trunc(f.v) and f.v between 3 and 10        then translate(f.lat, '0123456789.', '٠١٢٣٤٥٦٧٨٩٫') || ' جنيهات'
        when f.v = trunc(f.v) and f.v >= 11                   then translate(f.lat, '0123456789.', '٠١٢٣٤٥٦٧٨٩٫') || ' جنيهاً'
        else                                                       translate(f.lat, '0123456789.', '٠١٢٣٤٥٦٧٨٩٫') || ' جنيه'
      end as money_ar,
      case
        when f.v = 1                                          then 'نقطة واحدة'
        when f.v = 2                                          then 'نقطتين'
        when f.v = trunc(f.v) and f.v between 3 and 10        then translate(f.lat, '0123456789.', '٠١٢٣٤٥٦٧٨٩٫') || ' نقاط'
        else                                                       translate(f.lat, '0123456789.', '٠١٢٣٤٥٦٧٨٩٫') || ' نقطة'
      end as points_ar,
      case
        when f.v = 1                                          then 'شهر واحد'
        when f.v = 2                                          then 'شهرين'
        when f.v = trunc(f.v) and f.v between 3 and 10        then translate(f.lat, '0123456789.', '٠١٢٣٤٥٦٧٨٩٫') || ' أشهر'
        else                                                       translate(f.lat, '0123456789.', '٠١٢٣٤٥٦٧٨٩٫') || ' شهراً'
      end as months_ar,
      case when f.v = 1 then '1 point'  else f.lat || ' points' end as points_en,
      case when f.v = 1 then '1 month'  else f.lat || ' months' end as months_en
    from f
  ),
  g as (
    select
      max(ar)        filter (where k = 'pct_back')    as pct_ar,
      max(lat)       filter (where k = 'pct_back')    as pct_lat,
      max(ar)        filter (where k = 'cap_pct')     as cap_ar,
      max(lat)       filter (where k = 'cap_pct')     as cap_lat,
      max(points_ar) filter (where k = 'earn')        as earn_points_ar,
      max(points_en) filter (where k = 'earn')        as earn_points_en,
      max(ar)        filter (where k = 'unit_points') as unit_points_ar,
      max(lat)       filter (where k = 'unit_points') as unit_points_lat,
      max(money_ar)  filter (where k = 'unit_money')  as unit_money_ar,
      max(lat)       filter (where k = 'unit_money')  as unit_money_lat,
      max(points_ar) filter (where k = 'min_points')  as min_points_ar,
      max(lat)       filter (where k = 'min_points')  as min_points_lat,
      max(money_ar)  filter (where k = 'min_money')   as min_money_ar,
      max(lat)       filter (where k = 'min_money')   as min_money_lat,
      max(months_ar) filter (where k = 'months')      as months_phrase_ar,
      max(months_en) filter (where k = 'months')      as months_phrase_en
    from w
  )
  select v.ord, v.para, v.measure, v.ar, v.en
  from g, lateral (values
    (1, 1, 'points_per_currency',
     'تُحتسب نقاط الولاء بعد تنفيذ رحلتك لا عند حجزها، بمعدّل ' || g.earn_points_ar
       || ' عن كل جنيه من قيمة الرحلة بعد الخصم وقبل الخدمات الإضافية.',
     'Loyalty points are credited after your trip is carried out, not when you book it, at '
       || g.earn_points_en || ' per EGP of the trip price after discount and before extras.'),

    (2, 1, 'currency_per_point',
     'وتساوي كل ' || g.unit_points_ar || ' نقطة ' || g.unit_money_ar
       || ' عند الاستبدال، أي أن ما يعود إليك يعادل ' || g.pct_ar || '٪ من قيمة رحلاتك.',
     'Every ' || g.unit_points_lat || ' points are worth EGP ' || g.unit_money_lat
       || ' when redeemed, so what comes back to you equals ' || g.pct_lat
       || '% of what you spend on trips.'),

    (3, 2, 'min_redeem_points',
     'ولا يُقبل استبدال النقاط قبل أن يبلغ رصيدك ' || g.min_points_ar || '، وهي تعادل '
       || g.min_money_ar || '.',
     'Points cannot be redeemed until your balance reaches ' || g.min_points_lat
       || ' points, which is worth EGP ' || g.min_money_lat || '.'),

    (4, 2, 'max_redeem_percent',
     'ولا يُدفع بالنقاط أكثر من ' || g.cap_ar
       || '٪ من قيمة الرحلة الواحدة، ويُسدَّد باقي القيمة بوسيلة الدفع المعتادة.',
     'No more than ' || g.cap_lat
       || '% of a single trip may be paid with points; the rest is paid by the usual method.'),

    (5, 2, 'coupon_priority',
     'وإذا استعملت كوبون خصم على الحجز نفسه فقد لا تتّسع مساحة الخصم للنقاط، والأولوية عندها للكوبون.',
     'If you use a discount coupon on the same booking, there may be no discount room left for points, and the coupon takes priority.'),

    (6, 3, 'expire_months',
     'وتنتهي صلاحية كل نقطةٍ بعد ' || g.months_phrase_ar
       || ' من تاريخ احتسابها، وتُستهلك الأقدم أولاً عند الاستبدال.',
     'Every point expires ' || g.months_phrase_en
       || ' after it was credited, and the oldest points are spent first.'),

    (7, 3, 'valuation_at_redeem',
     'ويُقوَّم رصيدك بقيمة النقطة السارية وقت الاستبدال لا وقت احتسابها.',
     'Your balance is valued at the point value in force at the time of redemption, not at the time it was credited.'),

    (8, 3, 'reversal',
     'وإن أُلغيت الرحلة أو لم تُنفَّذ سُحبت نقاطها من رصيدك بقيد عاكس.',
     'If the trip is cancelled or is not carried out, its points are reversed out of your balance.')
  ) v(ord, para, measure, ar, en)
  order by 1;
$fn125$;

comment on function public.loyalty_terms_disclosure() is
  'جملُ بند «نقاط الولاء» في الشروط، مصوغةً بأرقام loyalty_settings الجارية. '
  'المصدر الواحد لما يُنشر: الهجرة 0125 تكتب ناتجها في sections.content، '
  'و supabase/tests/loyalty_terms_tests.sql تقارن المنشور بها في كل جولة — '
  'فتغييرُ مقبضٍ في /admin/loyalty يُحمِّر البوابة بدل أن يترك نصّاً يكذب.';

-- الأقلّ صلاحية: لا زائرَ ولا متعهدَ يحتاجها (‏D-20). والمستهلكون: الهجرة
-- والمجموعة (‏postgres) والخادم (‏service_role).
revoke all on function public.loyalty_terms_disclosure() from public;
revoke all on function public.loyalty_terms_disclosure() from anon, authenticated;
grant execute on function public.loyalty_terms_disclosure() to service_role;


-- ----------------------------------------------------------------------------
-- (٢) الثوابت واللقطة «قبل»
-- ----------------------------------------------------------------------------
create temporary table _l125 on commit drop as
select
  'b0000000-0000-4000-8000-000000003110'::uuid as sec_id,
  'terms'::text                                as page_slug,
  '١١'::text                                   as clause_num,
  'نقاط الولاء واستبدالها'::text                as clause_title,
  'loyalty'::text                              as clause_anchor;

create temporary table _b125 on commit drop as
select
  (select p.id from public.pages p where p.slug = 'terms')                     as page_id,
  (select count(*) from public.i18n_corpus_rows())                             as corpus_before,
  (select count(*) from public.translations where locale = 'en')               as en_rows_before,
  (select count(*) from public.translations
     where locale = 'en' and status = 'published')                             as en_pub_before,
  (select count(*) from public.sections s join public.pages p on p.id = s.page_id
     where p.slug = 'terms')                                                   as terms_sections_before,
  (select count(*) from public.sections s join public.pages p on p.id = s.page_id
     where p.slug = 'terms' and s.type = 'clause')                             as terms_clauses_before,
  (select coalesce(max(s.sort), -1) from public.sections s
     join public.pages p on p.id = s.page_id where p.slug = 'terms')           as max_sort_before,
  (select count(*) from public.page_revisions r
     where r.page_id = (select p.id from public.pages p where p.slug = 'terms')
       and r.status in ('draft', 'published'))                                 as live_snaps,
  (select count(*) from public.page_revisions r
     where r.page_id = (select p.id from public.pages p where p.slug = 'terms')
       and r.status = 'archived')                                              as archived_snaps,
  (select l.enabled from public.loyalty_settings l limit 1)                    as loyalty_enabled,
  exists (select 1 from public.sections s
            where s.id = 'b0000000-0000-4000-8000-000000003110'::uuid)         as pre_existing;

-- نصُّ البند مُجمَّعاً من الدالة: فقراتٌ بفاصل سطرين (نفس عُرف `rich-text`)
create temporary table _t125 on commit drop as
select
  (select string_agg(x.p, E'\n\n' order by x.para)
     from (select d.para, string_agg(d.ar, ' ' order by d.ord) as p
             from public.loyalty_terms_disclosure() d group by d.para) x)  as body_ar,
  (select string_agg(x.p, E'\n\n' order by x.para)
     from (select d.para, string_agg(d.en, ' ' order by d.ord) as p
             from public.loyalty_terms_disclosure() d group by d.para) x)  as body_en;


-- ----------------------------------------------------------------------------
-- (٣) الحواجز — قبل أيّ كتابة في محتوى المالك
-- ----------------------------------------------------------------------------
do $g125$
declare
  p       record;
  b       record;
  t       record;
  v_n     integer;
  v_body  jsonb;
  v_def   text;
begin
  select * into p from _l125;
  select * into b from _b125;
  select * into t from _t125;

  -- (٣-١) الصفحة قائمةٌ ومنشورة — وإلا فما نكتبه لا يقرؤه أحد (النمط ٣)
  if b.page_id is null then
    raise exception '0125: صفحة terms غير موجودة';
  end if;
  if not exists (select 1 from public.pages pg where pg.id = b.page_id and pg.published) then
    raise exception '0125: صفحة terms ليست منشورة — البند لن يُقرأ';
  end if;

  -- (٣-٢) جدول الإعدادات قائمٌ بصفٍّ واحد، وكل مقبضٍ يُقرأ منه غيرُ فارغ
  select count(*) into v_n from public.loyalty_settings;
  if v_n <> 1 then
    raise exception '0125: loyalty_settings فيها % صفاً بدل صفٍّ واحد', v_n;
  end if;
  if exists (
    select 1 from public.loyalty_settings l
    where l.points_per_currency is null or l.currency_per_point is null
       or l.min_redeem_points is null   or l.max_redeem_percent is null
       or l.expire_months is null
  ) then
    raise exception '0125: 🔴 مقبضٌ فارغ في loyalty_settings — النصّ سيصف عدماً';
  end if;

  -- (٣-٣) الدالة أخرجت الجمل الثماني، والنصّ غير فارغ
  select count(*) into v_n from public.loyalty_terms_disclosure();
  if v_n <> 8 then
    raise exception '0125: loyalty_terms_disclosure أخرجت % جملة بدل ٨', v_n;
  end if;
  if coalesce(btrim(t.body_ar), '') = '' or coalesce(btrim(t.body_en), '') = '' then
    raise exception '0125: نصُّ البند خرج فارغاً';
  end if;

  -- (٣-٤) 🔒 السلوك الذي يصفه النصّ **قائمٌ في الكتالوج الحيّ** (‏D-58).
  --        نصٌّ يصف مسلكاً أُزيل هو العطب نفسه بوجهٍ آخر.
  if to_regprocedure('public.apply_points(text,integer,numeric,text,numeric,numeric)') is null then
    raise exception '0125: 🔴 apply_points غير موجودة — لا استبدال يوصف';
  end if;
  v_def := pg_get_functiondef(
    'public.apply_points(text,integer,numeric,text,numeric,numeric)'::regprocedure);
  if position('max_redeem_percent' in v_def) = 0 or position('min_redeem_points' in v_def) = 0 then
    raise exception '0125: 🔴 apply_points لم تعد تقرأ سقفَ النسبة أو الحدَّ الأدنى';
  end if;
  if position('p_coupon_amount' in v_def) = 0 then
    raise exception '0125: 🔴 أولوية الكوبون لم تعد في apply_points — لا تُنشر جملتها';
  end if;
  if position('expire_months' in
       pg_get_functiondef('public.loyalty_lots(text)'::regprocedure)) = 0 then
    raise exception '0125: 🔴 loyalty_lots لم تعد تشتقّ انتهاء الصلاحية — لا وعدَ بانتهاءٍ لا يقع';
  end if;
  if position('extrasTotal' in
       pg_get_functiondef('public.loyalty_on_booking_completed()'::regprocedure)) = 0 then
    raise exception '0125: 🔴 أساسُ السكّ لم يعد يستثني الخدمات الإضافية — النصّ سيكذب';
  end if;

  -- (٣-٥) البوابة نفسها التي تحكم على النشر تحكم على ما نكتبه (‏`block_renders`)
  v_body := jsonb_build_object(
    'num',    p.clause_num,
    'title',  p.clause_title,
    'body',   t.body_ar,
    'anchor', p.clause_anchor,
    'style',  jsonb_build_object('_v', 1));
  if not public.block_renders('clause', v_body) then
    raise exception '0125: 🔴 البوابة ترفض تصيير هذه الكتلة — لا تُكتب كتلةٌ لا تُعرض';
  end if;

  -- (٣-٦) لا نصادر معرّفاً مستعملاً، ولا نكرّر رقم بندٍ قائماً
  if b.pre_existing then
    raise notice 'ℹ 0125: القسم % موجودٌ سلفاً — إعادةُ تشغيل، ولا يُكتب فوق تحرير المالك', p.sec_id;
  else
    if exists (
      select 1 from public.sections s
      join public.pages pg on pg.id = s.page_id
      where pg.slug = 'terms' and s.type = 'clause' and s.content ->> 'num' = p.clause_num
    ) then
      raise exception '0125: 🔴 بندٌ بالرقم «%» موجودٌ سلفاً في terms — أعد القياس', p.clause_num;
    end if;
    if exists (
      select 1 from public.sections s
      join public.pages pg on pg.id = s.page_id
      where pg.slug = 'terms' and s.content ->> 'anchor' = p.clause_anchor
    ) then
      raise exception '0125: 🔴 المرساة «%» مستعملةٌ سلفاً', p.clause_anchor;
    end if;
  end if;

  raise notice '  ← قبل: أقسام terms % (بنود %) · أقصى ترتيب % · الفهرس % · en % (منشور %) · لقطات حيّة % · مؤرشفة % · الولاء مُشعَل %',
    b.terms_sections_before, b.terms_clauses_before, b.max_sort_before,
    b.corpus_before, b.en_rows_before, b.en_pub_before,
    b.live_snaps, b.archived_snaps, b.loyalty_enabled;
end;
$g125$;


-- ----------------------------------------------------------------------------
-- (٤) الكتابة — بندٌ واحد يُلحق، ولا صفَّ قائمٍ يُمسّ
--
--     `visible = enabled`: على قاعدة بدر اليوم `true`، وعلى نسخةٍ جديدة
--     مبذورةٍ مطفأةً `false` — فلا وعدَ بنظامٍ لا يسكّ نقطة (‏الترويسة §٣).
-- ----------------------------------------------------------------------------
insert into public.sections (id, page_id, type, content, sort, visible, block_key)
select
  p.sec_id,
  b.page_id,
  'clause',
  jsonb_build_object(
    'num',    p.clause_num,
    'title',  p.clause_title,
    'body',   t.body_ar,
    'anchor', p.clause_anchor,
    'style',  jsonb_build_object('_v', 1)),
  b.max_sort_before + 1,
  coalesce(b.loyalty_enabled, false),
  null
from _l125 p, _b125 b, _t125 t
where not b.pre_existing;


-- ----------------------------------------------------------------------------
-- (٥) 🔒 D-60 — واللقطات الحيّة معها. والمؤرشفة **لا تُلمس**.
--
--     صفر لقطةٍ حيّة لصفحة `terms` اليوم (‏قِيس في ٣)، فهذا الإلحاق لا يجد ما
--     يُصالحه. **ويبقى مكتوباً** لأن خطوة (ب) في `publish_page_revision` تحذف
--     كلَّ قسمٍ غائبٍ عن اللقطة — فأول نشرةٍ من لقطةٍ قديمة كانت تمحو البند.
-- ----------------------------------------------------------------------------
update public.page_revisions r
set snapshot = jsonb_set(
      r.snapshot,
      '{sections}',
      (r.snapshot -> 'sections') || jsonb_build_array(
        (select jsonb_build_object(
                  'id',        s.id,
                  'type',      s.type,
                  'content',   s.content,
                  'sort',      s.sort,
                  'visible',   s.visible,
                  'block_key', s.block_key,
                  'parent_id', s.parent_id)
           from public.sections s where s.id = (select sec_id from _l125))))
where r.page_id = (select page_id from _b125)
  and r.status in ('draft', 'published')
  and jsonb_typeof(r.snapshot -> 'sections') = 'array'
  and exists (select 1 from public.sections s where s.id = (select sec_id from _l125))
  and not exists (
    select 1 from jsonb_array_elements(r.snapshot -> 'sections') x
    where x ->> 'id' = (select sec_id from _l125)::text);


-- ----------------------------------------------------------------------------
-- (٦) الإنجليزية — **مسوّدة تدخل الطابور، ولا تُنشر**
--
--     إدراجٌ مباشر بحالة `draft` لا `upsert_translations`: الأخيرة تُدرج
--     `published` لأن `en.auto_publish = true` (‏الترويسة §٤).
-- ----------------------------------------------------------------------------
insert into public.translations (locale, namespace, key, source_text, value, status, provider)
select 'en', 'section', k.key, k.src, k.val, 'draft', 'migration-0125'
from _l125 p, _t125 t,
lateral (values
  (p.sec_id::text || '.num',   p.clause_num,   '11'),
  (p.sec_id::text || '.title', p.clause_title, 'Loyalty points and how they are redeemed'),
  (p.sec_id::text || '.body',  t.body_ar,      t.body_en)
) k(key, src, val)
where exists (select 1 from public.sections s where s.id = p.sec_id)
  and not exists (
    select 1 from public.translations tr
    where tr.locale = 'en' and tr.namespace = 'section' and tr.key = k.key);


-- ----------------------------------------------------------------------------
-- (٧) الفحص الذاتي — يحرس ما كان قائماً، لا ما أضفتُه وحده (‏D-58)
-- ----------------------------------------------------------------------------
do $c125$
declare
  p         record;
  b         record;
  v_n       integer;
  v_after   integer;
  v_body    text;
  v_vis     boolean;
  v_missing text;
begin
  select * into p from _l125;
  select * into b from _b125;

  -- (٧-١) البند موجودٌ بنوعه ورقمه ومرساته
  select s.content ->> 'body', s.visible into v_body, v_vis
  from public.sections s where s.id = p.sec_id;
  if v_body is null then
    raise exception '0125: البند لم يُكتب';
  end if;
  if not exists (
    select 1 from public.sections s join public.pages pg on pg.id = s.page_id
    where s.id = p.sec_id and s.type = 'clause' and pg.slug = 'terms'
      and s.content ->> 'num'    = p.clause_num
      and s.content ->> 'title'  = p.clause_title
      and s.content ->> 'anchor' = p.clause_anchor
  ) then
    raise exception '0125: البند مكتوبٌ بشكلٍ مخالف لما قِيس';
  end if;

  -- (٧-٢) 🔴 كلُّ جملةٍ من الدالة موجودةٌ في المنشور — أي أن كل مقبضٍ مُفصَح
  --        (على إعادة التشغيل بعد تحرير المالك: إشعارٌ لا استثناء)
  select string_agg(x.measure, '، ' order by x.ord) into v_missing
  from public.loyalty_terms_disclosure() x
  where position(x.ar in v_body) = 0;
  if v_missing is not null then
    if b.pre_existing then
      raise notice 'ℹ 0125: البند حُرّر بعد كتابته — غير المُفصَح الآن: %', v_missing;
    else
      raise exception '0125: 🔴 مقبضٌ لم يُفصَح في النصّ المكتوب: %', v_missing;
    end if;
  end if;

  -- (٧-٣) والظهور يتبع `enabled`
  if v_vis is distinct from coalesce(b.loyalty_enabled, false) then
    if b.pre_existing then
      raise notice 'ℹ 0125: ظهور البند % والولاء % — تُصلحه اللوحة', v_vis, b.loyalty_enabled;
    else
      raise exception '0125: 🔴 ظهور البند % لا يطابق enabled %', v_vis, b.loyalty_enabled;
    end if;
  end if;

  -- (٧-٤) 🔒 ولا صفَّ قائمٍ مُسّ: عددُ الأقسام +١ وحده، وعشرةُ البنود بأرقامها
  select count(*) into v_n
  from public.sections s join public.pages pg on pg.id = s.page_id where pg.slug = 'terms';
  if v_n <> b.terms_sections_before + (case when b.pre_existing then 0 else 1 end) then
    raise exception '0125: 🔴 عدد أقسام terms % ⇐ % — الكتابة تجاوزت حقلها',
      b.terms_sections_before, v_n;
  end if;
  select string_agg(x.num, '، ') into v_missing
  from (values ('١'),('٢'),('٣'),('٤'),('٥'),('٦'),('٧'),('٨'),('٩'),('١٠')) x(num)
  where not exists (
    select 1 from public.sections s join public.pages pg on pg.id = s.page_id
    where pg.slug = 'terms' and s.type = 'clause' and s.content ->> 'num' = x.num);
  if v_missing is not null then
    raise exception '0125: 🔴 بنودٌ قائمة فُقدت أو أُعيد ترقيمها — %', v_missing;
  end if;

  -- (٧-٥) 🔴 الإنجليزية لم تُنشر: المنشور عند رقمه، والزيادة كلُّها مسوّدة
  select count(*) into v_n from public.translations where locale = 'en' and status = 'published';
  if v_n <> b.en_pub_before then
    raise exception '0125: 🔴 المنشور الإنجليزي تحرّك % ⇐ % — هذه الهجرة لا تنشر ترجمة',
      b.en_pub_before, v_n;
  end if;
  select count(*) into v_n
  from public.translations
  where locale = 'en' and namespace = 'section'
    and key in (p.sec_id::text || '.num', p.sec_id::text || '.title', p.sec_id::text || '.body')
    and status = 'draft';
  if v_n <> 3 then
    raise exception '0125: صفوف المسوّدة الإنجليزية % بدل ٣', v_n;
  end if;

  -- (٧-٦) الفهرس كسب ثلاثة مفاتيح لا أكثر، وجسمُ البند فيه بنصّه
  select count(*) into v_after from public.i18n_corpus_rows();
  if v_after <> b.corpus_before + (case when b.pre_existing then 0 else 3 end) then
    raise exception '0125: 🔴 الفهرس % ⇐ % — متوقَّعٌ +٣ (num · title · body)',
      b.corpus_before, v_after;
  end if;
  if not exists (
    select 1 from public.i18n_corpus_rows() c
    where c.ns = 'section' and c.k = p.sec_id::text || '.body' and c.src = v_body
  ) then
    raise exception '0125: 🔴 جسمُ البند ليس في الفهرس بنصّه — مفتاحٌ يتيم';
  end if;

  -- (٧-٧) D-60: لا مؤرشفةٌ لُمست، ولا لقطةٌ حيّةٌ تجهل البند
  select count(*) into v_n
  from public.page_revisions r where r.page_id = b.page_id and r.status = 'archived';
  if v_n <> b.archived_snaps then
    raise exception '0125: 🔴 عددُ اللقطات المؤرشفة تغيّر % ⇐ %', b.archived_snaps, v_n;
  end if;
  select string_agg(r.id::text, '، ') into v_missing
  from public.page_revisions r
  where r.page_id = b.page_id
    and r.status in ('draft', 'published')
    and jsonb_typeof(r.snapshot -> 'sections') = 'array'
    and not exists (
      select 1 from jsonb_array_elements(r.snapshot -> 'sections') x
      where x ->> 'id' = p.sec_id::text);
  if v_missing is not null then
    raise exception '0125: 🔴 لقطةٌ حيّة تجهل البند — أول نشرةٍ تحذفه: %', v_missing;
  end if;

  select count(*) into v_n from public.loyalty_terms_disclosure();
  raise notice
    '0125 ✔ بندُ الولاء منشورٌ في terms (‏%) بـ% جملةً مشتقّةً من loyalty_settings · ظهوره % كـenabled · بنودُ terms العشرة سليمة · الفهرس % ⇐ % · المنشور en ثابتٌ عند % · مسوّدةٌ إنجليزية ٣ صفوف · مؤرشفة % بلا مساس',
    p.sec_id, v_n, v_vis, b.corpus_before, v_after, b.en_pub_before, b.archived_snaps;
  raise notice
    '0125 ⚠ الإنجليزية **مسوّدة لا منشورة** — /admin/languages/en ⇐ راجِعها وانشرها بقرارك. و en.auto_publish = true فمن يكتبها بـ upsert_translations ينشرها بلا مراجعة.';
end;
$c125$;
