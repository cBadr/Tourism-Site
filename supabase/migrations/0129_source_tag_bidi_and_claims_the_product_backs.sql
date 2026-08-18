-- ============================================================================
-- 0129_source_tag_bidi_and_claims_the_product_backs.sql
-- مراجعةٌ عدائية على ما أنزلته `0127` و`0128` — ثلاثة عيوبٍ أُعيد إنتاجها بنداءٍ
-- حيّ ثم أُصلحت هنا. **ولا يُحذف بندٌ ولا صفٌّ قائم، ولا تُنشر ترجمةٌ واحدة.**
--
-- ══════════════════════════════════════════════════════════════════════════
--  (١) 🔴 وسمُ الحملة يقبل محارفَ تنسيقٍ غير مرئية — والضررُ ليس نظرياً
-- ══════════════════════════════════════════════════════════════════════════
--
-- `quote_source_tag` (‏`0127`) تسمح بالمدى العربي كاملاً `؀-ۿ`. وفي
-- هذا المدى **ثمانيةُ محارفٍ من فئة `Cf` (تنسيقٌ غير مرئي)**، منها `U+061C`
-- ARABIC LETTER MARK — وهو **محرفُ اتجاهٍ قويّ** تماماً كـ`RLM`. والمُطبِّع يُسقط
-- `RLO`/`LRO`/`RLM` (‏خارج المدى) **ويُبقي هذه الثمانية**، فبدت الحراسة قائمة.
--
--   قِيس بنداءٍ حيّ قبل هذا الملف — والناتج الحرفي:
--     quote_source_tag(e'a‮b') = 'ab'    ← RLO يسقط  ✔
--     quote_source_tag(e'a؜b') = 'a?b'   ← ALM ينجو  🔴  (‏الطول ٣)
--   والثمانية الناجية: U+0600 U+0601 U+0602 U+0603 U+0604 U+0605 U+061C U+06DD
--
-- 🔴 **والضررُ المقيس ليس تشويهَ اتجاهٍ فحسب، بل كذبُ التجميع نفسه.** الوسمُ
--    مفتاحُ `group by` في `quote_request_sources()`، وهي التي تجيب سؤال بدر
--    «أين أنفق؟». وثلاثةُ صفوفٍ أُدرجت في معاملةٍ مُرجعة بوسومٍ **تُقرأ كلها
--    `ramadan`** خرجت ثلاثَ حبّاتٍ منفصلة:
--
--      'ramadan'          طوله ٧   bytes 72616d6164616e
--      'ramadan' + U+061C طوله ٨   bytes 72616d6164616ed89c
--      U+061C + 'ramadan' طوله ٨   bytes d89c72616d6164616e
--
--    ⇒ حملةٌ واحدة تُعرض ثلاثَ حملاتٍ متطابقةِ المنظر، وكلٌّ بعددٍ ثلثِ الحقيقة.
--      و`dir="ltr"` في اللوحة **لا يعالج هذا**: هو يعزل القيمة عمّا حولها ولا
--      ينزع محرفاً داخلها، ولا يجمع حبّتين افترقتا في `group by`.
--
-- والعلاج **يُقصي الثمانية بالاسم** ويُبقي العربية كاملةً: المدى يُقسَّم إلى
-- `؆-؛` و`؝-ۜ` و`۞-ۿ`. والطبقتان معاً (المُطبِّع
-- والقيد) — فإسقاطُ إحداهما يوماً لا يفتح الباب.
--
-- ══════════════════════════════════════════════════════════════════════════
--  (٢) 🔴 صفحةُ الرحلات الخاصة تَعِد بحقلٍ لا وجود له
-- ══════════════════════════════════════════════════════════════════════════
--
-- كتبت `0127` في موضعين: «**ولك أن تطلب عدداً أكبر صراحةً** فيؤخذ الأكبر لا
-- الأصغر». والمنطق في `create_booking` صحيح (`greatest(explicit, derived)`)،
-- **لكن الزائر لا يملك سطحاً يرسل منه العدد**: `components/booking/search-widget.tsx:762`
-- يرسل `waitingHours: 0` دائماً، والحقل حُذف من الشاشة في «الدفعة ٣».
--
-- 🔴 **وهذا بعينه عيبٌ سبق إصلاحه في هذا المستودع**: التعليق في
--    `app/(site)/book/page.tsx:66` يقول حرفياً «النص كان يعد بحقل محذوف، وهو
--    بالضبط «شاشة تَعِد بما لا تفعله»» — فأُعيد إنزالُه على صفحةٍ جديدة.
--
-- وعيبٌ ثانٍ معه: `derive_waiting_hours` **تسقُف الاشتقاق عند ١٢ ساعة**
-- (`MAX_DERIVED_WAITING_HOURS`، قِرئ بـ`pg_get_functiondef` — D-58). والصفحة
-- تبيع «يوماً كاملاً» وتقول إن الساعات تُشتقّ من الفارق بلا ذكر السقف — فذهابٌ
-- ٨ص وعودةٌ ١٠م (‏١٤ ساعة) يُسعَّر ١٢. **يُذكر السقف كما هو.**
--
-- وثالثٌ: «بسعر الساعة **المعلن** لفئة المركبة». و`waiting_hour_price` لا يظهر
-- في أي سطحٍ يراه العميل — `grep` يحصره في `app/admin/fleet` و`app/admin/settings`،
-- و`quote_public` تُرجع `waiting_cost` مجمَّعاً ولا تُرجع سعر الساعة، والشاشة
-- تعرض عدد الساعات وحده. ⇒ «المعلن» تصف نشراً لا يقع، فتصير «ثابت».
-- ⚠ وهذه الصفة موجودةٌ سلفاً في `/terms` (‏القسم ١٣) — **لا تُلمس هنا**: تعديلُ
--   بندٍ منشورٍ يُبطل ترجمةً منشورة، وهو قرارُ بدر لا قرارُ هذا الملف. تُرفع توصيةً.
--
-- ══════════════════════════════════════════════════════════════════════════
--  (٣) 🟠 جردُ الخصوصية أغفل `distance_cache` — وهو أخو `geocode_cache`
-- ══════════════════════════════════════════════════════════════════════════
--
-- كتبت `0128` بنداً لـ`geocode_cache` (‏`pvl002`) لأنه يحفظ ما كتبه الزائر بلا
-- مدة حذف. و`distance_cache` **له الخاصّتان نفسهما**: ٣٤ صفاً مقيساً، يحفظ
-- `origin_lat/lng` و`dest_lat/lng` لكل مسارٍ سُعِّر — أي **إحداثيات نقطتين طلبهما
-- زائرٌ قد لا يكون حجز قط** — في ذاكرةٍ مشتركة بلا `prune_distance_cache`
-- (‏لا وجود لها في `pg_proc`، خلافاً لـ`prune_funnel_events`/`prune_audit_log`).
--
-- وجدولُ `0128` عنوانه «السجلات التي تنشأ من الاستعمال» — فغيابُه يجعل العنوان
-- يدّعي حصراً لا يقع. يُضاف `pvl007` بنفس صدق `pvl002`: يقول إنه بلا مدة حذف.
--
-- ══════════════════════════════════════════════════════════════════════════
--  ما لا يفعله هذا الملف — وحدودُه معلَنة
-- ══════════════════════════════════════════════════════════════════════════
--   · لا يسحب `execute` عن `quote_source_page` من `authenticated` رغم أنها
--     `security definer` وتكشف **وجود صفحةٍ غير منشورة** (`/know-us` ⇒ تعود
--     `/know-us` بهوية متعهّد). السببُ أن `authenticated` يملك `INSERT` على
--     `quote_requests`، والمُشغّل `quote_requests_normalize_source` هو
--     `security invoker` فينادي الدالة بهوية المُدرِج — فالسحبُ يكسر إدراجاً
--     إدارياً مقابل تسريبِ اسمِ صفحةٍ لا بيانات. **تُرفع توصيةً لا تُنفَّذ.**
--   · لا يمسّ `0124`/`0125`/`0126` ولا أيَّ ملفٍّ لدفعةٍ أخرى.
--   · لا ينشر صفَّ ترجمةٍ واحداً: كلُّ ما يُكتب هنا `status='draft'`.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- (١أ) المُطبِّع — يُقصي محارف `Cf` الثمانية من المدى العربي
-- ----------------------------------------------------------------------------
create or replace function public.quote_source_tag(p_raw text)
returns text
language sql
immutable
set search_path = ''
as $function$
  -- 🔒 المدى العربي **مقسوماً**: `؀-؅` و`؜` و`۝` محارفُ
  --    تنسيقٍ غير مرئية (‏فئة `Cf`)، و`U+061C` منها محرفُ اتجاهٍ قويّ. وإبقاؤها
  --    يشطر حبّةَ التجميع الواحدة حبّتين متطابقتَي المنظر. والعربيةُ المقروءة
  --    كلها باقية: `؆-؛` و`؝-ۜ` و`۞-ۿ`.
  select nullif(
    btrim(
      left(
        btrim(
          regexp_replace(
            regexp_replace(
              lower(left(coalesce(p_raw, ''), 512)),
              '[^a-z0-9 ._\u002D\u0606-\u061B\u061D-\u06DC\u06DE-\u06FF]', '', 'g'
            ),
            '[ ._\u002D]{2,}', '-', 'g'
          ),
          ' ._-'
        ),
        64
      ),
      ' ._-'
    ),
    ''
  );
$function$;

comment on function public.quote_source_tag(text) is
  'يُطبّع وسم حملةٍ من الرابط: قائمةُ سماحٍ محرفية · طيُّ فواصل · سقف ٦٤. ويُقصي محارف Cf الثمانية في المدى العربي (0600-0605 · 061C · 06DD) — فمحرفٌ غير مرئيّ يشطر حبّة group by حبّتين متطابقتَي المنظر (0129).';

-- ----------------------------------------------------------------------------
-- (١ب) الجدارُ البنيويّ — القيد يُطابق المُطبِّع حرفاً
-- ----------------------------------------------------------------------------
alter table public.quote_requests drop constraint if exists quote_requests_utm_shape_chk;

-- ⚠ تنظيفُ ما قد يكون دخل قبل الإصلاح — **قبل** إعادة القيد، وإلا رفضته صفوفٌ
--   قائمة. (‏قِيس اليوم: صفر صفٍّ بوسم، فالتحديث لا يمسّ شيئاً — لكنه يلزم
--   لأيّ نسخةٍ أخرى تُطبَّق عليها الهجرة بعد أن جمعت وسوماً.)
update public.quote_requests
   set utm_source   = public.quote_source_tag(utm_source),
       utm_medium   = public.quote_source_tag(utm_medium),
       utm_campaign = public.quote_source_tag(utm_campaign)
 where utm_source   is distinct from public.quote_source_tag(utm_source)
    or utm_medium   is distinct from public.quote_source_tag(utm_medium)
    or utm_campaign is distinct from public.quote_source_tag(utm_campaign);

alter table public.quote_requests add constraint quote_requests_utm_shape_chk check (
  (utm_source is null or (
     utm_source ~ '^[a-z0-9\u0606-\u061B\u061D-\u06DC\u06DE-\u06FF][a-z0-9 ._\u002D\u0606-\u061B\u061D-\u06DC\u06DE-\u06FF]*$'
     and length(utm_source) <= 64))
  and (utm_medium is null or (
     utm_medium ~ '^[a-z0-9\u0606-\u061B\u061D-\u06DC\u06DE-\u06FF][a-z0-9 ._\u002D\u0606-\u061B\u061D-\u06DC\u06DE-\u06FF]*$'
     and length(utm_medium) <= 64))
  and (utm_campaign is null or (
     utm_campaign ~ '^[a-z0-9\u0606-\u061B\u061D-\u06DC\u06DE-\u06FF][a-z0-9 ._\u002D\u0606-\u061B\u061D-\u06DC\u06DE-\u06FF]*$'
     and length(utm_campaign) <= 64))
);

-- ----------------------------------------------------------------------------
-- (٢) صفحةُ الرحلات الخاصة — يُحذف الوعدُ بلا سطح، ويُذكر السقف، وتسقط «المعلن»
--     والتحرير بالاستبدال النصّي لا بإعادة كتابة الحقل: ما لم يُذكر لا يتغيّر.
-- ----------------------------------------------------------------------------
update public.sections
   set content = jsonb_set(content, '{body}', to_jsonb(
         replace(
           replace(content->>'body',
             'وقُرِّبت إلى الساعة الأعلى — ولك أن تطلب عدداً أكبر صراحةً فيؤخذ الأكبر لا الأصغر.',
             'وقُرِّبت إلى الساعة الأعلى، بحدٍّ أقصاه اثنتا عشرة ساعة.'),
           'بسعر الساعة المعلن لفئة المركبة',
           'بسعر ساعةٍ ثابتٍ لفئة المركبة')))
 where id = '9830bf26-862c-4ff3-b601-01cf9cdf5d97';

update public.sections
   set content = jsonb_set(content, '{items}', (
         select jsonb_agg(
                  case when it->>'_k' = 'ptf002'
                       then jsonb_set(it, '{text}', to_jsonb(replace(it->>'text',
                              'بسعر الساعة المعلن لفئة المركبة',
                              'بسعر ساعةٍ ثابتٍ لفئة المركبة')))
                       else it end
                  order by ord)
         from jsonb_array_elements(content->'items') with ordinality as e(it, ord)))
 where id = '2c34d84f-f0a8-49de-bf7c-3e79e20bb5bb';

update public.sections
   set content = jsonb_set(content, '{items}', (
         select jsonb_agg(
                  case when it->>'_k' = 'ptq002'
                       then jsonb_set(it, '{a}', to_jsonb(
                              replace(
                                replace(it->>'a',
                                  'وقُرِّبت إلى الساعة الأعلى. ولك أن تطلب عدداً أكبر صراحةً فيؤخذ الأكبر منهما، فلا يبتلع الحساب طلبك.',
                                  'وقُرِّبت إلى الساعة الأعلى، بحدٍّ أقصاه اثنتا عشرة ساعة.'),
                                'وسعر الساعة معلن لكل فئة مركبة ويدخل في الإجمالي الظاهر قبل التأكيد.',
                                'وسعر الساعة ثابتٌ لكل فئة مركبة ويدخل في الإجمالي الظاهر قبل التأكيد لا بعده.')))
                       else it end
                  order by ord)
         from jsonb_array_elements(content->'items') with ordinality as e(it, ord)))
 where id = '6b3df41a-2839-4981-bb74-33023e1efa95';

-- ----------------------------------------------------------------------------
-- (٣) الخصوصية — بندُ `distance_cache` يُذيَّل على جدول `0128` بمفتاحه
-- ----------------------------------------------------------------------------
update public.sections
   set content = jsonb_set(content, '{items}',
         (content->'items') || jsonb_build_array(jsonb_build_object(
           '_k', 'pvl007',
           'c1', 'إحداثيات المسار الذي سعّرته',
           'c2', 'حين يُحسب سعر مسارٍ بين نقطتين تُحفظ إحداثياتهما مع المسافة والمدة في ذاكرة مشتركة تُسرّع تسعير المسار نفسه لأي زائر بعدك، فلا نسأل خدمة الخرائط عن المسار نفسه مرتين. ولا يُحفظ معها من طلبها، ولا تُربط بحجزك ولا بجهازك، وتبقى ولو لم تُكمل الحجز. وليست لها اليوم مدة حذف محددة.'
         )))
 where id = 'b0000000-0000-4000-8000-000000003312'
   and not exists (
     select 1 from jsonb_array_elements(content->'items') el
     where el->>'_k' = 'pvl007');

-- ----------------------------------------------------------------------------
-- (٤) الإنجليزية — **مسوّداتٌ وحدها**. المُعدَّلُ يُحدَّث والجديدُ يُدرَج، ولا صفَّ
--     `published` يُلمس. و`source_hash` عمودٌ مولَّد فلا يُكتب بيد.
-- ----------------------------------------------------------------------------
with fresh(k, v) as (values
  ('9830bf26-862c-4ff3-b601-01cf9cdf5d97.body',
   null::text),
  ('2c34d84f-f0a8-49de-bf7c-3e79e20bb5bb.items.ptf002.text',
   'Waiting hours are a priced item at a fixed hourly rate for the vehicle class, and they are included in the price you see before you confirm, not after.'),
  ('6b3df41a-2839-4981-bb74-33023e1efa95.items.ptq002.a',
   'If the return is on the same day they are derived automatically from the gap between the outbound and return times and rounded up to the next full hour, capped at twelve hours. The hourly rate is fixed for each vehicle class and is included in the total shown before you confirm, not after.')
)
update public.translations t
   set source_text = c.src,
       value       = coalesce(f.v, t.value),
       updated_at  = now()
  from fresh f
  join public.i18n_corpus_rows() c on c.k = f.k and c.ns = 'section'
 where t.locale = 'en' and t.namespace = 'section'
   and t.key = f.k and t.status = 'draft';

insert into public.translations
  (id, locale, namespace, key, source_text, value, status, provider, updated_by)
select gen_random_uuid(), 'en', 'section', c.k, c.src, e.v, 'draft', 'migration-0129', null
from public.i18n_corpus_rows() c
join (values
  ('c1', 'Coordinates of the route you priced'),
  ('c2', 'When the price of a route between two points is calculated, their coordinates are stored together with the distance and the duration in a shared cache that speeds up pricing the same route for any visitor after you, so we do not ask the map service about the same route twice. Who requested it is not stored with them, they are not linked to your booking nor to your device, and they remain even if you do not complete the booking. They have no defined deletion period today.')
) as e(fld, v)
  on c.k = 'b0000000-0000-4000-8000-000000003312.items.pvl007.' || e.fld
where c.ns = 'section'
on conflict (locale, namespace, key) do nothing;

-- ----------------------------------------------------------------------------
-- (٥) D-60 — اللقطاتُ الحيّة للصفحتين المُعدَّلتين
--     قِيس قبل الكتابة: `page_revisions` لا تحمل صفاً واحداً لـ`privacy` ولا
--     لـ`private-trips` (‏الصفحة الوحيدة ذات اللقطات هي `home`). فالكتلة تعمل
--     على العدم اليوم، وتبقى لأنها الضمانة على أيّ نسخةٍ لها لقطات.
-- ----------------------------------------------------------------------------
update public.page_revisions r
   set snapshot = jsonb_set(r.snapshot, '{sections}', (
         select coalesce(jsonb_agg(to_jsonb(s) order by s.sort), '[]'::jsonb)
         from public.sections s where s.page_id = r.page_id))
  from public.pages p
 where p.id = r.page_id
   and p.slug in ('privacy', 'private-trips')
   and r.status in ('draft', 'published')
   and r.snapshot ? 'sections';

-- ----------------------------------------------------------------------------
-- (٦) الفحص الذاتي — كلُّ ادّعاءٍ أعلاه يُعاد قياسه بعد الكتابة
-- ----------------------------------------------------------------------------
do $c129$
declare
  v_n      integer;
  v_pub    integer;
begin
  -- (أ) محارف `Cf` الثمانية لم تعد تنجو
  select count(*) into v_n
  from (values (1536),(1537),(1538),(1539),(1540),(1541),(1564),(1757)) t(cp)
  where public.quote_source_tag('a' || chr(t.cp) || 'b') <> 'ab';
  if v_n <> 0 then
    raise exception '0129 🔴 محرفُ تنسيقٍ ما زال ينجو من المُطبِّع: % محرفاً', v_n;
  end if;

  -- (ب) والعربيةُ المقروءة نجت كاملةً
  if public.quote_source_tag('حملة رمضان') <> 'حملة رمضان' then
    raise exception '0129 🔴 المُطبِّع أتلف عربيةً مقروءة: %', public.quote_source_tag('حملة رمضان');
  end if;

  -- (ج) والقيد يردّ ما يمرّ من فوق المُشغّل
  begin
    alter table public.quote_requests disable trigger quote_requests_normalize_source;
    insert into public.quote_requests (customer_name, customer_phone, details, utm_campaign)
    values ('فحص 0129', '01000000009', 'x', 'ram' || chr(1564) || 'adan');
    alter table public.quote_requests enable trigger quote_requests_normalize_source;
    raise exception '0129 🔴 القيد قبل وسماً فيه محرفُ اتجاه';
  exception
    when check_violation then
      alter table public.quote_requests enable trigger quote_requests_normalize_source;
  end;

  -- (د) الوعدُ بلا سطحٍ اختفى من الصفحة كلها
  select count(*) into v_n
  from public.sections s join public.pages p on p.id = s.page_id
  where p.slug = 'private-trips'
    and (s.content::text like '%تطلب عدداً أكبر صراحةً%'
      or s.content::text like '%الساعة المعلن%'
      or s.content::text like '%وسعر الساعة معلن%');
  if v_n <> 0 then
    raise exception '0129 🔴 ما زال في الصفحة ادّعاءٌ لا يسنده المنتج: % قسماً', v_n;
  end if;

  -- (هـ) والسقفُ ذُكر في الموضعين
  select count(*) into v_n
  from public.sections s join public.pages p on p.id = s.page_id
  where p.slug = 'private-trips' and s.content::text like '%اثنتا عشرة ساعة%';
  if v_n <> 2 then
    raise exception '0129 🔴 سقفُ الاشتقاق مذكورٌ في % موضعاً لا ٢', v_n;
  end if;

  -- (و) بندُ `distance_cache` نزل مرةً واحدة
  select count(*) into v_n
  from public.sections s, jsonb_array_elements(s.content->'items') el
  where s.id = 'b0000000-0000-4000-8000-000000003312' and el->>'_k' = 'pvl007';
  if v_n <> 1 then
    raise exception '0129 🔴 بندُ ذاكرة المسافات نزل % مرة لا مرةً واحدة', v_n;
  end if;

  -- (ز) 🔴 صفرُ ترجمةٍ منشورة تحرّكت
  select count(*) into v_pub from public.translations
  where locale = 'en' and status = 'published';
  if v_pub <> 883 then
    raise exception '0129 🔴 عددُ الإنجليزية المنشورة تحرّك: % (المتوقَّع ٨٨٣)', v_pub;
  end if;

  select count(*) into v_n from public.translations
  where locale = 'en' and provider = 'migration-0129' and status <> 'draft';
  if v_n <> 0 then
    raise exception '0129 🔴 صفٌّ من هذا الملف ليس مسودة: %', v_n;
  end if;

  select count(*) into v_n from public.translations
  where locale = 'en' and namespace = 'section' and status = 'draft'
    and key like 'b0000000-0000-4000-8000-000000003312.items.pvl007.%';
  if v_n <> 2 then
    raise exception '0129 🔴 مسوّدتا بند ذاكرة المسافات نزلتا % لا ٢', v_n;
  end if;

  -- (ح) ولا مسودةَ صارت قديمةً بفعل تحريرنا
  select count(*) into v_n
  from public.translations t
  join public.i18n_corpus_rows() c on c.k = t.key and c.ns = t.namespace
  where t.locale = 'en' and t.status = 'draft'
    and t.key in ('9830bf26-862c-4ff3-b601-01cf9cdf5d97.body',
                  '2c34d84f-f0a8-49de-bf7c-3e79e20bb5bb.items.ptf002.text',
                  '6b3df41a-2839-4981-bb74-33023e1efa95.items.ptq002.a')
    and t.source_hash is distinct from public.i18n_source_hash(c.src);
  if v_n <> 0 then
    raise exception '0129 🔴 % مسودةً بقيت ببصمةٍ قديمة بعد التحرير', v_n;
  end if;

  select count(*) into v_n from public.quote_requests;
  raise notice '0129 ✔ محارفُ التنسيق أُقصيت · الوعدُ بلا سطحٍ حُذف · السقفُ ذُكر · distance_cache أُفصح عنه · طلباتٌ قائمة: % · إنجليزيةٌ منشورة: % (ثابتة)', v_n, v_pub;
end
$c129$;

commit;
