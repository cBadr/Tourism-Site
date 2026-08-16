-- ============================================================================
-- 0061_design_blocks.sql — كتل تركيب التصميم الثلاث + توسيع `hero` + ماركات
--                          الأسطول في الإعدادات.  (المرحلة م‑٢)
--
-- ── لماذا هذه الهجرة أصلاً ──────────────────────────────────────────────────
-- ما ليس مسجَّلاً في `block_registry` **لا يُصيَّر إطلاقاً**: عارضة الأقسام
-- تسأل `blockRenders` قبل أي شيء، وهي مرآةُ هذا الجدول. فبناء العارضة وحدها
-- كان سيُخرج ثلاث كتل صامتة على صفحةٍ منشورة — لا خطأً يُقرأ بل فراغاً.
--
-- ── ما تسجّله وما لا تسجّله ─────────────────────────────────────────────────
--   • `logo-strip`  — شريط ماركات الأسطول. **نظامية لا `items`** (قرار بدر ٤).
--   • `stat-band`   — شريط أرقام. **الكتلة تُشحن والأرقام لا** (قرار بدر ٣):
--                     `required_fields = {items}` ⇒ الشريط الفارغ لا يُصيَّر.
--   • `route-rail`  — سكة المسارات **بلا أسعار** (قرار بدر ١).
--   • `hero`        — **توسيعٌ لا كتلة ثانية**: شارة ونصّ سهم وضمانات في
--                     `items`. هي الوحيدة التي تركّب ويدجت الحجز، ونسختان
--                     منها = ويدجتان على صفحة واحدة.
--
-- 🔴 **ولا كتلة `reviews`** — قرار بدر ٢: لا جدول تقييمات في القاعدة إطلاقاً،
--    و`bookings = 0`، ووسم «رحلة موثّقة» فوق نصٍّ من اللوحة ادّعاءُ تحقّقٍ لا
--    يوجد. تُبنى يوم يوجد مصدرها.
--
-- ── ثلاثة قيود التزمتها الحقول ──────────────────────────────────────────────
--   (١) اسم كل حقل يطابق `^[a-zA-Z][a-zA-Z0-9]*$` — وإلا رفضه
--       `block_registry_guard` كتابةً (لا اكتشافاً لاحقاً).
--   (٢) لا `src` داخل عنصر قائمة: `NON_TEXT_CONTENT_FIELDS` يسمح به لكتلة
--       `image` وحدها. ولذلك **بطاقة المسار بلا صورة** وشريط الماركات نظاميّ —
--       وهو ثمنٌ مكتوب لا سهو، وفتحُ الباب قرارُ مالكٍ لا قرارُ جلسة.
--   (٣) `value` في شريط الأرقام **نصٌّ يدخل فهرس الترجمة**: ١٢٬٤٠٠ بالعربية
--       و12,400 بالإنجليزية، والفاصلة نفسها تختلف.
--
-- والملف قابل لإعادة التنفيذ بالكامل: `on conflict … do update` على الكتالوج،
-- و`do nothing` على صفّ الإعدادات كي لا تُمحى ماركةٌ بدّلها المالك.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (٠) 🔴 إصلاحٌ سابقٌ للتسجيل: `block_renders` كانت تُصيِّر كتلةً بلا `items`
--
-- ── العيب، وكيف ظهر ────────────────────────────────────────────────────────
-- أمسكه الفحص الذاتي لهذه الهجرة نفسها حين سأل: «هل يُصيَّر شريط أرقام
-- فارغ؟» فأجابت القاعدة **نعم** — والعارضة تقول لا.
--
-- والسبب منطقٌ ثلاثيّ القيم لا خطأ نيّة: مفتاح `items` **الغائب** يُعطي
-- `jsonb_typeof(null) = null`، فـ`null = 'array'` تساوي `null`، و`null and null`
-- تساوي `null`، و`not null` تساوي `null` — فلا يُرجع الصفُّ، و`not exists`
-- تصير **صحيحة**. أي أن الحقل الإلزامي الغائب يمرّ، والحاضرَ الفارغ يُرفض.
--
--   • مقيس حياً قبل الإصلاح: `block_renders('features','{}')` ⇒ **true**،
--     و`block_renders('features','{"items":[]}')` ⇒ false.
--   • ونظيرتها في TypeScript ترفض الحالتين معاً:
--     `if (!Array.isArray(value) || value.length === 0) return false`.
--
-- ── لماذا يُصلَح هنا لا يُؤجَّل ────────────────────────────────────────────
-- العقد يشترط أن يكون **حكم بوابة النشر هو حكم العارضة حرفياً**: ما ترفض
-- القاعدةُ نشرَه لا تُصيّره الصفحة، وما تُصيّره الصفحة لا ترفض القاعدةُ نشرَه.
-- ومع هذا العيب تُنشَر صفحةٌ كتلتُها الوحيدة غير مُصيَّرة بلا أن يمنعها
-- `all-blocks-empty` — أي **صفحة بيضاء منشورة**. وكتلتا م‑٢ الجديدتان تلزمان
-- `items`، فالعيب يقع في مسارهما مباشرة.
--
-- ── وأثره على المحتوى القائم: **صفر، مقيساً لا مقدَّراً** ──────────────────
-- استعلامٌ على القاعدة الحيّة (2026-08-16) عن كل قسمٍ يلزمه `items` ومفتاحه
-- ليس مصفوفة أرجع **صفر صف**، وفي `page_revisions` كذلك **صفر**. فالإصلاح
-- يغلق ثغرةً ولا يمسّ صفاً واحداً.
--
-- ── والجسم منقولٌ من الكتالوج الحيّ (`pg_get_functiondef`) لا من `0058` ────
-- (**D-58** والقاعدة الذهبية ١٠). والفرق عن الحيّ **فرع `items` وحده**:
--   • `case` متداخلة بدل `and` — و`case` مضمونة الترتيب في Postgres، بينما
--     طرفا `and` قد يُقلبان. ولذلك كان `{"items":"نص"}` قادراً على رفع
--     «cannot get array length of a scalar» من دالةٍ يناديها مسار النشر.
--   • و«لا نعرف» صارت تعني «ناقص» لا «موجود» — وهو التمييز نفسه في القاعدة
--     الذهبية ١٥.
-- ----------------------------------------------------------------------------

create or replace function public.block_renders(p_type text, p_content jsonb)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.block_registry b where b.type = p_type and b.enabled)
     and not exists (
       select 1
       from public.block_registry b, unnest(b.required_fields) f
       where b.type = p_type and b.enabled
         and case
           when f = 'items' then
             case
               when jsonb_typeof(coalesce(p_content, '{}'::jsonb) -> 'items') = 'array'
                 then jsonb_array_length(coalesce(p_content, '{}'::jsonb) -> 'items') = 0
               -- غائب أو ليس مصفوفة ⇒ الحقل الإلزامي ناقص، فلا تُصيَّر
               else true
             end
           else coalesce(
             btrim(case when jsonb_typeof(coalesce(p_content, '{}'::jsonb) -> f) = 'string'
                        then coalesce(p_content, '{}'::jsonb) ->> f end),
             ''
           ) = ''
         end
     );
$$;

comment on function public.block_renders(text, jsonb) is
  'هل تُصيَّر هذه الكتلة أصلاً؟ مرآةُ blockRenders في lib/page-builder-types.ts — '
  'نوعٌ غير مسجَّل أو معطَّل ⇒ false، وحقلٌ إلزامي ناقص ⇒ false. '
  'و0061 أصلحت فرع items: المفتاح الغائب كان يمرّ بمنطق ثلاثي القيم.';

-- المنح كما كانت — `create or replace` لا يعيدها، وحذفها هنا سهواً يفتح الدالة
revoke all on function public.block_renders(text, jsonb) from public, anon;
grant execute on function public.block_renders(text, jsonb) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- (١) الكتالوج — ثلاث كتل جديدة، وصفُّ `hero` يُحدَّث في مكانه
--
-- ⚠ والمرآة في `lib/page-builder-types.ts` §١٠ تُحدَّث معه في الكمّة نفسها،
--    ويقارنهما فحصٌ في `page_builder_tests.sql` (أ‑١) ويفشل عند الانحراف.
-- ----------------------------------------------------------------------------

insert into public.block_registry
  (type, role, placement, accepts_children, max_children, text_fields, item_fields, required_fields, enabled)
values
  -- الشعارات بيانات نظام (`site_settings.fleetBrands`)، والكتلة تحمل نصَّيها:
  -- و`note` شرط استعمالٍ لا زخرف — «وصفٌ للمركبات لا اعتماد ولا علاقة تجارية».
  ('logo-strip', 'system',  'once-per-page', false, null,
     array['title','note'],                 null,
     '{}'::text[],        true),

  -- 🔴 `required_fields = {items}` هو تنفيذ قرار بدر ٣ حرفياً: بلا رقمٍ واحد
  --    لا يُصيَّر الشريط. شريطٌ فارغ على صفحةٍ عامة أسوأ من غيابه.
  ('stat-band',  'content', 'any',           false, null,
     array['title'],                        array['value','suffix','label'],
     array['items'],      true),

  -- بلا سعر: لا حقل سعر في `pages` أصلاً، والسعر المعروض الذي تخالفه الحاسبة
  -- بعد ثانيتين يهدم الجملة التي بُني عليها المنتج كله.
  ('route-rail', 'content', 'any',           false, null,
     array['title','sub','note'],           array['name','href','duration','distance'],
     array['items'],      true)
on conflict (type) do update set
  role             = excluded.role,
  placement        = excluded.placement,
  accepts_children = excluded.accepts_children,
  max_children     = excluded.max_children,
  text_fields      = excluded.text_fields,
  item_fields      = excluded.item_fields,
  required_fields  = excluded.required_fields,
  enabled          = excluded.enabled;

-- توسيع `hero`: الشارة ونصّ السهم حقلان جديدان، والضمانات الثلاث `items`.
-- و`required_fields` تبقى فارغة بقصد: نصوص البطل الافتراضية من الإعدادات،
-- وإخفاؤه بحقلٍ ناقص كان سيُسقط ويدجت الحجز من الرئيسية.
update public.block_registry set
  text_fields = array['badge','headline','sub','scrollLabel'],
  item_fields = array['title']
where type = 'hero';

-- ----------------------------------------------------------------------------
-- (٢) ماركات الأسطول — صفٌّ في `site_settings` لا قائمةٌ في الكود
--
-- قرار بدر ٤ حرفياً: «قائمة في `site_settings` أو جدول صغير، والكتلة تحمل
-- `title` و`note` فقط». والعمود `value` من نوع `jsonb` فلا هجرة بنيوية.
--
-- ⚠ **و`do nothing` لا `do update`**: إعادة تنفيذ الملف يجب ألا تمحو ماركةً
--    بدّلها المالك أو حذفها — وهي القاعدة نفسها التي يمشي عليها `0004`.
--
-- 📌 وما زال ناقصاً بعد هذه الهجرة، ويُذكر صراحةً: **لا شاشة في اللوحة تحرّر
--    هذا الصفّ بعد.** البيانات في القاعدة لا في الكود (وهو المطلوب)، لكن
--    تحريرها اليوم يحتاج SQL — وشاشتها بندٌ في مرحلة اللوحة.
-- ----------------------------------------------------------------------------

insert into public.site_settings (key, value) values
  ('fleetBrands', '[
     {"slug":"mercedes","name":"مرسيدس","logoUrl":"/brands/mercedes.svg"},
     {"slug":"toyota","name":"تويوتا","logoUrl":"/brands/toyota.svg"},
     {"slug":"bmw","name":"بي إم دبليو","logoUrl":"/brands/bmw.svg"},
     {"slug":"hyundai","name":"هيونداي","logoUrl":"/brands/hyundai.svg"},
     {"slug":"nissan","name":"نيسان","logoUrl":"/brands/nissan.svg"},
     {"slug":"kia","name":"كيا","logoUrl":"/brands/kia.svg"},
     {"slug":"mg","name":"إم جي","logoUrl":"/brands/mg.svg"},
     {"slug":"jetour","name":"جيتور","logoUrl":"/brands/jetour.svg"},
     {"slug":"byd","name":"بي واي دي","logoUrl":"/brands/byd.svg"},
     {"slug":"honda","name":"هوندا","logoUrl":"/brands/honda.svg"}
   ]'::jsonb)
on conflict (key) do nothing;

-- ----------------------------------------------------------------------------
-- (٣) الفحص الذاتي — **يحرس ما كان قائماً لا ما أضفناه** (القاعدة الذهبية ١٠)
--
-- فحصٌ يبحث عن الصفوف الثلاثة الجديدة وحدها كان سيمرّ ولو انهار `hero` أو
-- سقطت كتلة قديمة. ولذلك يفحص هنا: العدد الكلي، وسلامة **كل** صفٍّ أمام
-- `block_registry_check`، وبقاء `hero` على موضعها ودورها، ونداءَ `block_renders`
-- حياً على الشكلين — الفارغ والمملوء.
-- ----------------------------------------------------------------------------

do $$
declare
  v_n   integer;
  v_bad text;
begin
  select count(*) into v_n from public.block_registry;
  if v_n <> 15 then
    raise exception '(٠٠٦١‑أ) الكتالوج فيه % كتلة لا ١٥', v_n;
  end if;

  -- كل صفٍّ يجب أن يجتاز الحارس نفسه الذي يمنع الكتابة — لا الجديد وحده
  select string_agg(b.type || ': ' ||
           public.block_registry_check(b.type, b.role, b.placement, b.accepts_children,
             b.max_children, b.text_fields, b.item_fields, b.required_fields), '، ')
    into v_bad
  from public.block_registry b
  where public.block_registry_check(b.type, b.role, b.placement, b.accepts_children,
          b.max_children, b.text_fields, b.item_fields, b.required_fields) is not null;
  if v_bad is not null then
    raise exception '(٠٠٦١‑ب) صفوف لا تعنونها قواعد الترجمة: %', v_bad;
  end if;

  -- `hero` بقيت `home-only` نظامية بعد التوسيع — والتوسيع وصل فعلاً
  if not exists (
    select 1 from public.block_registry
    where type = 'hero' and role = 'system' and placement = 'home-only'
      and text_fields = array['badge','headline','sub','scrollLabel']
      and item_fields = array['title']
      and cardinality(required_fields) = 0
  ) then
    raise exception '(٠٠٦١‑ج) صفّ hero لم يصل إلى شكله المتوقَّع بعد التوسيع';
  end if;

  -- 🔴 قرار بدر ٣ مفروضٌ في القاعدة لا في العارضة وحدها: الشريط الفارغ لا يُنشر
  if public.block_renders('stat-band', '{}'::jsonb) then
    raise exception '(٠٠٦١‑د) شريط أرقام بلا عنصر يُصيَّر — والقرار أنه لا يُصيَّر';
  end if;
  if not public.block_renders('stat-band',
       '{"items":[{"_k":"aaaaaa","value":"٢٤","label":"خدمة"}]}'::jsonb) then
    raise exception '(٠٠٦١‑هـ) شريط أرقام بعنصرٍ صالح لا يُصيَّر';
  end if;
  if public.block_renders('route-rail', '{"items":[]}'::jsonb) then
    raise exception '(٠٠٦١‑و) سكة مسارات فارغة تُصيَّر — والقرار أنها لا تُصيَّر';
  end if;
  -- والنظامية تُصيَّر دائماً: بياناتها من الإعدادات لا من `content`
  if not public.block_renders('logo-strip', '{}'::jsonb) then
    raise exception '(٠٠٦١‑ز) شريط الماركات لا يُصيَّر بلا نصّ — وهو نظاميّ';
  end if;

  -- 🔴 شاهدٌ على العيب المُصلَح في (٠)، مكتوبٌ على **الكتل القائمة** لا على
  --    الجديدة: لو عاد الفرع الثلاثيّ القيم يوماً لأمسكه هذا السطر أولاً.
  if public.block_renders('features', '{}'::jsonb)
     or public.block_renders('faq', '{}'::jsonb) then
    raise exception '(٠٠٦١‑ط) كتلةٌ يلزمها items تُصيَّر والمفتاح غائب — عاد عيب المنطق الثلاثي';
  end if;
  -- وليس مصفوفةً أصلاً: كان يرفع «cannot get array length of a scalar»
  if public.block_renders('features', '{"items":"نص"}'::jsonb) then
    raise exception '(٠٠٦١‑ي) items نصّاً لا مصفوفةً تُصيَّر — والقرار أنها لا تُصيَّر';
  end if;
  -- والحالة السليمة لا تنكسر بالإصلاح
  if not public.block_renders('features',
       '{"items":[{"_k":"aaaaaa","title":"عنوان"}]}'::jsonb) then
    raise exception '(٠٠٦١‑ك) كتلة مزايا صالحة لا تُصيَّر — الإصلاح كسر السليم';
  end if;
  if not public.block_renders('page-hero', '{"title":"عنوان"}'::jsonb)
     or public.block_renders('page-hero', '{}'::jsonb) then
    raise exception '(٠٠٦١‑ل) فرع الحقول النصية تغيّر — والإصلاح لم يكن يمسّه';
  end if;

  if not exists (select 1 from public.site_settings where key = 'fleetBrands') then
    raise exception '(٠٠٦١‑ح) صفّ ماركات الأسطول لم يُبذر';
  end if;

  raise notice '✔ 0061: ثلاث كتل مسجَّلة، hero موسَّعة، وماركات الأسطول في الإعدادات';
end;
$$;
