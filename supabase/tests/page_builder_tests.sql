-- ============================================================================
-- page_builder_tests.sql — اختبارات قبول لمنشئ الصفحات (هجرة 0058_page_builder.sql)
--
-- كيف تشغّله: `pnpm db:test page_builder` أو الصق الملف كاملاً في SQL Editor.
-- النجاح = آخر سطر «ALL PASSED». وأي فشل exception عربية فيها المتوقع والفعلي.
--
-- ومن psql بدور صاحب القاعدة **لا بد** من ON_ERROR_STOP و‑1 معاً:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f supabase/tests/page_builder_tests.sql
-- الأول لأن psql بدونه يتابع بعد الكتلة الفاشلة فيطبع «ALL PASSED» رغم الفشل،
-- والثاني لأن الملف يبدّل هوية الدور مؤقتاً في قسمَي الصلاحيات.
--
-- ══════════════════════════════════════════════════════════════════════════
--  🔬 تأكيدان هنا يُسمّيان **الطفرة التي يمسكانها** — والطفرتان تُبنيان وتُشغَّلان
-- ══════════════════════════════════════════════════════════════════════════
--
-- «فحصٌ لا يمكن أن يفشل هو زينة» (النمط ٩ في LESSONS). ولذلك:
--
--   • **الطفرة ١ (ح-٥):** نشرٌ ساذج بـ«احذف أقسام الصفحة ثم أدرجها من اللقطة».
--     يُكتب فعلاً ويُشغَّل داخل معاملةٍ فرعية تُرجَع، ويُثبَت أنه **يُبيد مفتاح
--     الترجمة** الذي نجا من `publish_page_revision`. أي أن تأكيد «المعرّف يبقى»
--     ليس وصفاً لما حدث بل قياسٌ يفرّق بين تنفيذين للطلب نفسه.
--   • **الطفرة ٢ (ز-٨):** يُنزَع `title` من `required_fields` لكتلة `page-hero`
--     في الكتالوج، ويُثبَت أن `page_publish_blockers` **تكفّ** عن رمز
--     `missing-required` — أي أن البوابة تقرأ الكتالوج فعلاً ولا تحمل قائمةً
--     محفورة في جسمها.
--
-- ── لماذا كل شيء مصنوعٌ هنا ولا يُقاس على محتوى الموقع ─────────────────────
--
-- هذه **قاعدة الإنتاج نفسها**: صفحةٌ اختبارية باقية تدخل خريطة الموقع، وقسمٌ
-- باقٍ يدخل فهرس الترجمة فيرفع مقام `translation_progress`. فكل ما يُقاس هنا
-- مصنوعٌ هنا بمعرّفات ثابتة تبدأ بـ`0b58`، ولغة اختبار `zx` مستقلة عن `zz` التي
-- يستعملها `i18n_tests.sql` — فلا يتصادم الملفان لو شُغّلا معاً.
-- والتنظيف يجري في **البداية والنهاية معاً**، فحتى انهيار تشغيلٍ سابق يبدأ
-- التالي من أرضٍ نظيفة.
--
-- ما يغطيه الملف:
--   (٠)   الشروط المسبقة · تنظيف بقايا · (٠-ب) هوية مشرف
--   (أ)   `block_registry` = `BLOCK_CATALOGUE` صفاً صفاً (١٥ كتلة × ١٠ حقول)
--   (ب)   `reserved_slugs` = قائمتا `lib/seo/site-paths.ts` و`app/[slug]/page.tsx`
--   (ج)   حارس الـslug: محجوز · بادئة · مأخوذ · صيغة · تحويل · واستثناء `about`
--   (د)   حارس العمق: الابن يمرّ · الحفيد يُرفض من الطرفين · سقف الأبناء · صفحةٌ أخرى
--   (هـ)  `block_renders` = `blockRenders` حرفاً (‏`page-hero` بلا عنوان ⇒ false)
--   (و)   `block_registry_check` يرفض الشكل غير المعنوَن **كتابةً** لا نصّاً
--   (ز)   `page_publish_blockers`: كل رمز في حالته + 🔬 **الطفرة ٢**
--   (ح)   🔴 النشر فرقٌ بالمعرّف: الترجمة تنجو + 🔬 **الطفرة ١**
--   (ط)   المنح: `anon` صفر · لا `TRUNCATE` لأحد · والأعمدة الجديدة ممنوحة
--   (ي)   أدوار حيّة: المتعهد صفر مسودة · `ops` قراءةٌ فقط · المشرف يبني
--   (ك)   الابن لا يُرى إن كانت أمُّه مخفيّة (فحص حيّ بدور `anon`)
--   (م)   🔴 م‑٧: صورةُ العنصر وأيقونتُه **خارج** الفهرس وخارج `i18n_apply`،
--         و`alt` و`href` **داخلهما** · والحارس يرفض ثمانية أشكال · والأيقونات مغلقة
--   (ن)   🔴 م‑١٠: المرساة خارج الفهرس، ورقمُ البند وخلايا الجدول داخله
--   (س)   🔴 `0082`: عنصرٌ بلا مفتاح ثابت صالح وفريد لا يُكتب + 🔬 **الطفرة ٣**
--   (ع)   🔴 `0092`: لقطةٌ قديمة تُنشَر فلا تمحو `items` ولا تُيتّم عنوان ترجمة،
--         و`items: []` تنفُذ + 🔬 **الطفرة ٤**
--   (ل)   صفر أثر
--
-- المرجع: supabase/migrations/0058_page_builder.sql · 0065_item_non_text_fields.sql
--         · lib/page-builder-types.ts · lib/item-fields-types.ts
--         · docs/phase-briefs/PAGE-BUILDER.md
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (٠) الشروط المسبقة + تنظيف بقايا تشغيلٍ سابق
-- ----------------------------------------------------------------------------
do $$
declare
  v_missing text;
begin
  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claims', '', false);

  select string_agg(x.rel, '، ') into v_missing
  from (values ('public.block_registry'), ('public.reserved_slugs'),
               ('public.page_revisions'), ('public.pages'), ('public.sections'),
               ('public.translations'), ('public.locales'), ('public.redirects')) as x(rel)
  where to_regclass(x.rel) is null;
  if v_missing is not null then
    raise exception 'شرط مسبق: كائنات مفقودة (نفّذ 0058_page_builder.sql أولاً): %', v_missing;
  end if;

  select string_agg(x.sig, '، ') into v_missing
  from (values
    ('public.publish_page_revision(uuid, uuid)'),
    ('public.page_publish_blockers(uuid, uuid)'),
    ('public.page_slug_reject(text, text, uuid)'),
    ('public.page_slug_conflict(text, text, uuid)'),
    ('public.page_public_path(text, text)'),
    ('public.block_renders(text, jsonb)'),
    -- 🔴 **بعشرة وسائط لا ثمانية** (م‑٧ · `0065`): العمودان الجديدان يمرّان
    --    إلى الحارس، والتوقيع القديم أُسقط صراحةً — الشاهد على إسقاطه أدناه.
    ('public.block_registry_check(text, text, text, boolean, integer, text[], text[], text[], text[], text[])'),
    ('public.i18n_non_text_field(text)'),
    ('public.i18n_reserved_content_key(text)'),
    ('public.i18n_item_address(jsonb, bigint)'),
    ('public.item_icon_allowed(text)'),
    ('public.builder_access()'),
    ('public.builder_revisions(uuid)'),
    ('public.builder_revision_snapshot(uuid)'),
    ('public.page_has_unpublished_changes(uuid)'),
    ('public.page_revision_diff(uuid, uuid)'),
    ('public.section_parent_visible(uuid)'),
    ('public.i18n_corpus_rows()')
  ) as x(sig)
  where to_regprocedure(x.sig) is null;
  if v_missing is not null then
    raise exception 'شرط مسبق: دوال مفقودة: %', v_missing;
  end if;

  -- 🔒 والتوقيع القديم **يجب ألا يبقى حيّاً**: توقيعان لدالةٍ واحدة يعني أن
  --    أحدهما يُنادى ولا أحد يعرف أيّهما — وهي العلّة التي أسقطت لأجلها `0031`
  --    تواقيع `quote_price` القديمة. والمُشغّل يُنادي العشرة، فبقاء الثمانية
  --    يترك حارساً ميتاً يُظنّ حيّاً.
  if to_regprocedure(
       'public.block_registry_check(text, text, text, boolean, integer, text[], text[], text[])'
     ) is not null then
    raise exception 'شرط مسبق: توقيع block_registry_check القديم (٨ وسائط) ما زال حيّاً بجانب الجديد';
  end if;

  -- والعمودان الجديدان على `block_registry` — بلاهما كل ما في القسم (أ) بلا معنى
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'block_registry'
      and column_name in ('non_text_fields', 'non_text_item_fields')
    having count(*) = 2) then
    raise exception 'شرط مسبق: عمودا م‑٧ غير موجودين على block_registry — نفّذ الهجرة 0065';
  end if;

  -- الأعمدة الجديدة على `sections` — بلاها كل ما بعده بلا معنى
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'sections'
                   and column_name = 'parent_id') then
    raise exception 'شرط مسبق: sections.parent_id غير موجود';
  end if;

  -- ── تنظيف بقايا (الترجمات تسقط مع اللغة بـon delete cascade، والأقسام
  --    واللقطات مع الصفحة) ──
  delete from public.translations   t where t.locale = 'zx';
  delete from public.locales        l where l.code   = 'zx';
  delete from public.redirects      r where r.from_path like '/0b58-%';
  delete from public.pages          p where p.slug like '0b58-%';
  delete from public.profiles       p where p.id in (
    '0b580000-0000-4000-8000-0000000000a1'::uuid,
    '0b580000-0000-4000-8000-0000000000a2'::uuid,
    '0b580000-0000-4000-8000-0000000000a3'::uuid);
  begin
    delete from auth.users u where u.id in (
      '0b580000-0000-4000-8000-0000000000a1'::uuid,
      '0b580000-0000-4000-8000-0000000000a2'::uuid,
      '0b580000-0000-4000-8000-0000000000a3'::uuid);
  exception when others then null;
  end;
  delete from public.block_registry b where b.type like '0b58-%';

  raise notice '✔ (٠) الشروط المسبقة سليمة والأرض نظيفة';
end;
$$;

-- ----------------------------------------------------------------------------
-- (٠-ب) هوية المشرف — **إلزامية لا احتياطية**
--
-- `publish_page_revision` و`page_publish_blockers` و`page_slug_reject` كلها
-- تشترط `is_admin()`، و`is_admin()` تقرأ `auth.uid()` من مطالبة الـjwt. واتصال
-- صاحب القاعدة **بلا مطالبة** ⇒ `is_admin()` تساوي `false`. فبلا هذا القسم
-- يفشل نصف الملف بـ`forbidden` — وهو فشلٌ في الفيكسترة لا في المنتج.
-- ----------------------------------------------------------------------------
do $$
declare
  v_admin constant uuid := '0b580000-0000-4000-8000-0000000000a1';
begin
  begin
    insert into auth.users (id, email) values (v_admin, 'pb-tests-admin@local.invalid');
    insert into public.profiles (id, role, full_name)
    values (v_admin, 'admin', 'مشرف اختبار المنشئ')
    on conflict (id) do update set role = 'admin';
  exception
    when others then
      raise exception 'تعذّر تجهيز هوية المشرف (%) — شغّل الملف بدور صاحب القاعدة', sqlerrm;
  end;

  perform set_config('request.jwt.claim.sub', v_admin::text, false);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_admin)::text, false);

  if not public.is_admin() then
    raise exception '(٠-ب) هوية المشرف لم تمرّ من is_admin()';
  end if;
  if public.builder_access() <> 'edit' then
    raise exception '(٠-ب) builder_access للمشرف: توقعنا edit وحصلنا «%»', public.builder_access();
  end if;

  raise notice '✔ (٠-ب) هوية مشرف جاهزة، وbuilder_access = edit';
end;
$$;

-- ----------------------------------------------------------------------------
-- (أ) الكتالوج في القاعدة = `BLOCK_CATALOGUE` في العقد — صفاً صفاً
--
-- نسختان تنحرفان يوم تُضاف كتلة (النمط ٤ في LESSONS): الجدول أدناه منسوخٌ
-- **نصّاً** من `lib/page-builder-types.ts` §١٠، والمقارنة على المصفوفات
-- **مرتّبة** لا كمجموعات — فترتيب الحقول جزءٌ من العقد أيضاً.
-- ----------------------------------------------------------------------------
do $$
declare
  v_bad text;
  v_n   integer;
begin
  select count(*) into v_n from public.block_registry;
  if v_n <> 19 then
    raise exception '(أ-١) الكتالوج فيه % كتلة لا ١٩', v_n;
  end if;

  -- ⚠ **العمودان الجديدان (م‑٧ · `0065`) جزءٌ من العقد كبقيته**: إغفالهما هنا
  --    أو — وهو الأخطر — إغفالهما في شرطَي الـ`join` أدناه يجعل هذا الفحص يمرّ
  --    على انحرافٍ حقيقي. و`null` تعني «لا حقل غير نصّي» لا `{}`.
  with expected(type, role, placement, accepts_children, max_children,
                text_fields, item_fields, required_fields,
                non_text_fields, non_text_item_fields) as (
    values
      ('rich-text',     'content', 'any',           false, null::integer, array['title','body'],           null::text[],           array['body'],   null::text[],                    null::text[]),
      ('page-hero',     'content', 'any',           false, null,          array['title','sub','ctaLabel'], null,                   array['title'],  null,                            null),
      -- `icon` داخل العنصر (م‑٧): الرمز كان محفوراً `CircleCheck` لكل بطاقة
      ('features',      'content', 'any',           false, null,          array['title','sub'],            array['title','text'],  array['items'],  null,                            array['icon']),
      ('faq',           'content', 'any',           false, null,          array['title'],                  array['q','a'],         array['items'],  null,                            null),
      ('cta-band',      'content', 'any',           false, null,          array['title','note'],           null,                   '{}'::text[],    null,                            null),
      -- 🆕 م‑٧: `items` **اختيارية** تتجاوز `SERVICES` — و`required_fields` تبقى
      --    فارغة، فبلا عنصرٍ واحد يعود القسم إلى بيانات النظام حرفاً.
      ('services-grid', 'system',  'once-per-page', false, null,          array['title','sub'],            array['title','text','href','alt'], '{}'::text[], null,               array['src','icon']),
      -- بلا `items` بقصد: صور الفئات وسعتها في `vehicle_classes` لا في المحتوى
      ('fleet',         'system',  'once-per-page', false, null,          array['title','sub'],            null,                   '{}'::text[],    null,                            null),
      ('why-us',        'system',  'once-per-page', false, null,          array['title','sub'],            null,                   '{}'::text[],    null,                            null),
      ('contact',       'system',  'once-per-page', false, null,          array['title','sub'],            null,                   '{}'::text[],    null,                            null),
      -- `hero` وسّعتها `0061`: شارة ونصّ سهم وضمانات في `items` — ولا كتلة ثانية.
      -- و`0064` أضافت `imageAlt` وحدها: وصفُ صورة البطل نصٌّ يقرؤه قارئ الشاشة
      -- فيُترجَم. أما `src` و`poster` و`video` فحقولٌ **غير نصّية** لا تدخل هذه
      -- القائمة — وإلا دخل «‎/img/hero-chauffeur.avif» طابور المترجم، ومترجمٌ
      -- مجتهد قد «يعرّبه» فتختفي الصورة.
      -- 🆕 ن‑٤ (‏`0071`): `typingPrefix` و`typingLines` نصّان يُقرآن ويُترجَمان —
      -- الجزء الثابت من العنوان والجُمل المتناوبة بعده. وإيقاع الأثر (سرعة ·
      -- مهلة · محو · تكرار) **ليس هنا**: رموزٌ تحت `content.style` المحجوز
      -- بالاسم في `i18n_reserved_content_key`، فلا صفَّ ترجمةٍ لقيمة «normal»
      -- ولا عمودَ جديد في هذا الجدول.
      ('hero',          'system',  'home-only',     false, null,          array['badge','headline','typingPrefix','typingLines','sub','scrollLabel','imageAlt'], array['title'], '{}'::text[], array['src','poster','video'], null),
      ('columns',       'layout',  'any',           true,  4,             '{}'::text[],                    null,                   '{}'::text[],    null,                            null),
      -- `src` في `non_text_fields` شرطٌ لا زينة بعد `0065`: القاعدة (د) في
      -- `block_registry_check` تقرأ `required_fields` على اتحاد القوائم.
      ('image',         'content', 'any',           false, null,          array['alt','caption'],          null,                   array['src','alt'], array['src'],                 null),
      -- ── كتل م‑٢ الثلاث (‏`0061`) ──────────────────────────────────────
      -- 🔴 **ن‑٩ (`0087`): الشعارات صارت `items` عادية، وقرار بدر ٤ انتهى لأن
      --    مبرره انتهى** — كان «`src` داخل عنصر قائمة شكلٌ لم يُقنَّن»، وم‑٧
      --    قنّنته بعينه في `0065`. و`site_settings.fleetBrands` صار **احتياطاً**
      --    حين تفرغ `items` (مذهب `SERVICES` مع `services-grid`)، ولذلك
      --    `required_fields` تبقى فارغة.
      --    و`name` نصٌّ يُترجَم (وكان مجمَّداً على العربية في اللغتين في الإعدادات)،
      --    و`alt` **إلزامٌ بنيوي** تفرضه القاعدة (٤) على كل كتلةٍ تعلن `src`.
      -- 🔴 و`disclaimer` **حُذف كاملاً بقرار المالك 2026-08-17** — لا معطَّلاً ولا
      --    مخفياً. أضافته `0072` خانةً ثانية يعيد فراغُها افتراضيَّها، فعُرض الأمر
      --    على المالك بمخاطره فقرّر خانةً واحدة. ونصُّه محفوظٌ في
      --    `docs/phase-briefs/OWNER-NOTES-2026-08-16.md` لا في الكود.
      -- 🆕 `listLabel` **وسطاً لا في الذيل** (‏`0101`): كانت تسمية `<ul>` الشريط
      --    لقارئ الشاشة محفورةً في العارضة بلا مسار `content` — تُصيَّر على
      --    الإنتاج ولا تبلغها اللوحة، ومعها الصياغة التي أزالتها `0095` من
      --    القاعدة ولم تجد لهذه صفّاً. والترتيب هو ترتيب الخانات في اللوحة،
      --    والمقارنة أدناه **بالمساواة** فتمسك `{title,note,listLabel}` كذلك.
      ('logo-strip',    'system',  'once-per-page', false, null,          array['title','listLabel','note'], array['name','href','alt'], '{}'::text[], null,              array['src']),
      -- 🔴 `{items}` إلزاميةً = «الكتلة تُشحن والأرقام لا» (قرار بدر ٣)
      ('stat-band',     'content', 'any',           false, null,          array['title'],                  array['value','suffix','label'], array['items'], null,             null),
      -- بلا سعر (قرار بدر ١) — **قائم**. أمّا «بلا صورة» فنُقض بأمر بدر
      -- 2026-08-16: «التحكم في كل شيء من لوحة التحكم بما فيها الصور
      -- والأيكونات». فالبطاقة تحمل `src`+`alt`+`icon`، و`alt` نصٌّ يُترجَم.
      ('route-rail',    'content', 'any',           false, null,          array['title','sub','note'],     array['name','href','duration','distance','alt'], array['items'], null, array['src','icon']),
      -- ── كتل المستندات (م‑١٠ · `0068`) ─────────────────────────────────
      -- فهرس الصفحة **بلا `items` بقصد**: قائمته تُبنى من كتل `clause` على
      -- الصفحة نفسها، فمصدر عنوان البند واحد. و`required_fields` فارغة لأن
      -- شرط ظهوره يقع **خارج محتواه** — والحكم عليه في العارضة لا في البوابة.
      ('page-toc',      'content', 'once-per-page', false, null,          array['title'],                  null,                   '{}'::text[],    null,                            null),
      -- 🔴 `anchor` غير نصّي: معرّفٌ في الرابط لا نثر. ولو دخل الفهرس لترجمه
      --    مترجمٌ مجتهد فهبط كل رابطٍ أُرسل في أول الصفحة، بلا خطأ ولا سجل.
      --    و`num` يبقى نصّاً يُترجَم: «٤» و«4» صيغتان تختلفان باللغة.
      ('clause',        'content', 'any',           false, null,          array['num','title','body'],     null,                   array['title'],  array['anchor'],                 null),
      -- الترويسة أعلى والخلايا داخل العنصر — فكل خليةٍ نصٌّ مستقلٌّ في الفهرس
      ('table',         'content', 'any',           false, null,          array['title','note','h1','h2','h3','h4'], array['c1','c2','c3','c4'], array['items'], null,     null),
      -- النبرة رمزٌ في `style` لا حقلٌ نصّي، فلا أثر لها في هذا الصفّ
      ('callout',       'content', 'any',           false, null,          array['title','body'],           null,                   array['body'],   null,                            null)
  )
  select string_agg(msg, ' | ') into v_bad
  from (
    select coalesce(e.type, b.type) || ': ' ||
           case
             when b.type is null then 'في العقد وليس في القاعدة'
             when e.type is null then 'في القاعدة وليس في العقد'
             else 'انحراف'
           end as msg
    from expected e
    full outer join public.block_registry b
      on b.type = e.type
     and b.role = e.role
     and b.placement = e.placement
     and b.accepts_children = e.accepts_children
     and b.max_children is not distinct from e.max_children
     and b.text_fields = e.text_fields
     and b.item_fields is not distinct from e.item_fields
     and b.required_fields = e.required_fields
     -- 🔴 م‑٧: بلا هذين الشرطين يمرّ الفحص على انحرافٍ حقيقي في العمودين
     and b.non_text_fields is not distinct from e.non_text_fields
     and b.non_text_item_fields is not distinct from e.non_text_item_fields
     and b.enabled
    where e.type is null or b.type is null
  ) d;

  if v_bad is not null then
    raise exception '(أ-٢) الكتالوج انحرف عن BLOCK_CATALOGUE: %', v_bad;
  end if;

  raise notice '✔ (أ) block_registry = BLOCK_CATALOGUE: ١٩ كتلة بحقولها وترتيبها';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ب) `reserved_slugs` = محجوزات المستودع
--
-- منسوخة نصّاً من `RESERVED_SLUGS` في `app/[slug]/page.tsx` ومن
-- `APP_OWNED_PATHS`/`RESERVED_PATH_PREFIXES`/`RESERVED_EXACT_FILES` في
-- `lib/seo/site-paths.ts`. المقارنة هنا تمسك انحراف **الجدول** عن هذا الملف؛
-- ومَن يضيف مساراً في `app/` عليه أن يلمس الثلاثة معاً — ولذلك القائمة مكتوبة
-- بأسماء ملفاتها في التعليق أعلاه لا مطويّة في هجرة.
-- ----------------------------------------------------------------------------
do $$
declare
  v_bad text;
begin
  with expected(slug, reason, kind_exception) as (
    values
      ('about',                'slug-reserved', 'static'),
      ('book',                 'slug-reserved', null),
      ('quote-request',        'slug-reserved', null),
      ('track',                'slug-reserved', null),
      ('services',             'slug-prefix',   null),
      ('routes',               'slug-prefix',   null),
      ('booking',              'slug-prefix',   null),
      ('payment',              'slug-prefix',   null),
      ('account',              'slug-prefix',   null),
      ('admin',                'slug-prefix',   null),
      ('portal',               'slug-prefix',   null),
      ('api',                  'slug-prefix',   null),
      ('brand',                'slug-prefix',   null),
      ('images',               'slug-prefix',   null),
      ('favicon.ico',          'slug-reserved', null),
      ('robots.txt',           'slug-reserved', null),
      ('sitemap.xml',          'slug-reserved', null),
      ('manifest.webmanifest', 'slug-reserved', null)
  )
  select string_agg(coalesce(e.slug, r.slug) ||
           case when r.slug is null then ' (في المستودع وليس في القاعدة)'
                when e.slug is null then ' (في القاعدة وليس في المستودع)'
                else ' (انحراف)' end, '، ')
    into v_bad
  from expected e
  full outer join public.reserved_slugs r
    on r.slug = e.slug and r.reason = e.reason
   and r.kind_exception is not distinct from e.kind_exception
  where e.slug is null or r.slug is null;

  if v_bad is not null then
    raise exception '(ب-١) reserved_slugs انحرف عن lib/seo/site-paths.ts و app/[slug]/page.tsx: %', v_bad;
  end if;

  -- والاستثناء الوحيد مقيس: `about` وحدها لها استثناء نوع، ولنوع `static` وحده
  if (select count(*) from public.reserved_slugs where kind_exception is not null) <> 1 then
    raise exception '(ب-٢) استثناءات النوع يجب أن تكون واحدة (about/static) لا أكثر';
  end if;

  raise notice '✔ (ب) reserved_slugs يطابق قائمتي المستودع، واستثناء about وحيد';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ج) 🔴 حارس الـslug — العطب الذي كان يمرّ بلا حارس
--
-- قبل `0058`: `createPage` يقبل `slug='book'` ⇒ صفحة «منشورة» في اللوحة و٤٠٤
-- للأبد. وكل تأكيد سالب هنا يسبقه **شاهد إيجابي** من نفس الجدول ونفس المسار —
-- بلا ذلك يمرّ «رُفض» حتى لو كان سببه أن كل شيء مرفوض.
-- ----------------------------------------------------------------------------
do $$
declare
  v_page constant uuid := '0b580000-0000-4000-8000-000000000101';
  v_ok   boolean;
  v_hint text;
  v_code text;
begin
  -- شاهد إيجابي: slug سليم لنوع landing يمرّ
  insert into public.pages (id, slug, kind, title, meta, published, sort)
  values (v_page, '0b58-slug-probe', 'landing', 'صفحة فحص المسار',
          '{"title":null,"description":"وصف فحص المسار"}'::jsonb, false, 990);

  -- (ج-١) محجوزٌ يملكه ملفٌ على الجذر
  v_ok := false; v_hint := null;
  begin
    update public.pages set slug = 'book' where id = v_page;
    v_ok := true;
  exception when others then get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if v_ok then
    raise exception '(ج-١) قُبل slug=book — صفحة «منشورة» و٤٠٤ للأبد';
  end if;
  if v_hint is distinct from 'slug-reserved' then
    raise exception '(ج-١) الرفض خرج بـ[%] لا بـslug-reserved', coalesce(v_hint, '∅');
  end if;

  -- (ج-٢) بادئة يملكها مقطع ديناميكي
  v_ok := false; v_hint := null;
  begin
    update public.pages set slug = 'services' where id = v_page;
    v_ok := true;
  exception when others then get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if v_ok then
    raise exception '(ج-٢) قُبل slug=services تحت بادئة محجوزة';
  end if;
  if v_hint is distinct from 'slug-prefix' then
    raise exception '(ج-٢) الرفض خرج بـ[%] لا بـslug-prefix', coalesce(v_hint, '∅');
  end if;

  -- (ج-٣) صيغة مخالفة للنمط
  v_ok := false; v_hint := null;
  begin
    update public.pages set slug = 'Bad Slug!' where id = v_page;
    v_ok := true;
  exception when others then get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if v_ok then
    raise exception '(ج-٣) قُبل slug مخالف للنمط';
  end if;
  if v_hint is distinct from 'slug-format' then
    raise exception '(ج-٣) الرفض خرج بـ[%] لا بـslug-format', coalesce(v_hint, '∅');
  end if;

  -- (ج-٤) مأخوذ من صفحةٍ أخرى (‏`terms` قائمة في القاعدة)
  v_ok := false; v_hint := null;
  begin
    update public.pages set slug = 'terms' where id = v_page;
    v_ok := true;
  exception when others then get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if v_ok then
    raise exception '(ج-٤) قُبل slug مأخوذ';
  end if;
  if v_hint is distinct from 'slug-taken' then
    raise exception '(ج-٤) الرفض خرج بـ[%] لا بـslug-taken', coalesce(v_hint, '∅');
  end if;

  -- (ج-٥) 🔒 استثناء `about`: مسموحٌ لـ`static` (الملف يقرأ الصف) ومرفوضٌ
  --       لـ`landing` (‏`app/about/page.tsx` يشترط kind='static' فيعطي ٤٠٤).
  --       ⚠ هذا التمييز هو ما يُبقي صفحة «من نحن» القائمة قابلةً للتحرير.
  v_code := public.page_slug_reject('static', 'about', null);
  if v_code is distinct from 'slug-taken' then
    -- صفٌّ قائم اسمه about يجعل الرمز `slug-taken` لا `slug-reserved` —
    -- والمهم أنه **ليس محجوزاً** لهذا النوع.
    raise exception '(ج-٥) about/static: توقعنا slug-taken (الصفّ القائم) وحصلنا «%»', coalesce(v_code, 'مقبول');
  end if;
  v_code := public.page_slug_reject('landing', 'about', null);
  if v_code is distinct from 'slug-reserved' then
    raise exception '(ج-٥) about/landing: توقعنا slug-reserved وحصلنا «%»', coalesce(v_code, 'مقبول');
  end if;

  -- (ج-٦) تحويلٌ مفعَّل يخطف المسار ⇒ الصفحة لن تُرى أبداً
  insert into public.redirects (from_path, to_path, status_code, enabled)
  values ('/0b58-hijacked', '/', 301, true);

  v_ok := false; v_hint := null;
  begin
    update public.pages set slug = '0b58-hijacked' where id = v_page;
    v_ok := true;
  exception when others then get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if v_ok then
    raise exception '(ج-٦) قُبل slug يخطفه تحويل مفعَّل';
  end if;
  if v_hint is distinct from 'slug-redirect' then
    raise exception '(ج-٦) الرفض خرج بـ[%] لا بـslug-redirect', coalesce(v_hint, '∅');
  end if;

  -- والتحويل المعطَّل لا يمنع — شاهدٌ إيجابي يثبت أن الشرط على `enabled` حيّ
  update public.redirects set enabled = false where from_path = '/0b58-hijacked';
  update public.pages set slug = '0b58-hijacked' where id = v_page;
  update public.pages set slug = '0b58-slug-probe' where id = v_page;
  delete from public.redirects where from_path = '/0b58-hijacked';

  -- (ج-٧) 🔒 وتعديلٌ لا يمسّ المسار يمرّ دائماً — هذا ما يمنع الحارس من تجميد
  --       صفحةٍ قائمة مسارُها محجوزٌ سلفاً (سابقة 0057)
  update public.pages set title = 'عنوان معدَّل', published = true where id = v_page;
  if (select title from public.pages where id = v_page) <> 'عنوان معدَّل' then
    raise exception '(ج-٧) تعديلٌ لا يمسّ المسار لم يمرّ';
  end if;

  -- ولا يفوت النوع: تغيير `kind` وحده يعيد الفحص
  v_ok := false;
  begin
    update public.pages set kind = 'static', slug = 'privacy' where id = v_page;
    v_ok := true;
  exception when others then null;
  end;
  if v_ok then
    raise exception '(ج-٨) تغيير النوع مع slug مأخوذ لم يُفحص';
  end if;

  delete from public.pages where id = v_page;

  raise notice '✔ (ج) حارس الـslug: reserved · prefix · format · taken · redirect، واستثناء about، والتعديل غير الماسّ يمرّ';
end;
$$;

-- ----------------------------------------------------------------------------
-- (د) حارس العمق — مستوى واحد، من الطرفين، وبسقف أبناء
-- ----------------------------------------------------------------------------
do $$
declare
  v_page  constant uuid := '0b580000-0000-4000-8000-000000000201';
  v_page2 constant uuid := '0b580000-0000-4000-8000-000000000202';
  v_cols  constant uuid := '0b580000-0000-4000-8000-000000000211';
  v_child constant uuid := '0b580000-0000-4000-8000-000000000212';
  v_leaf  constant uuid := '0b580000-0000-4000-8000-000000000213';
  v_ok    boolean;
  v_hint  text;
  v_n     integer;
begin
  insert into public.pages (id, slug, kind, title, meta, published, sort) values
    (v_page,  '0b58-depth-probe',  'landing', 'صفحة فحص العمق',
     '{"title":null,"description":"وصف"}'::jsonb, false, 991),
    (v_page2, '0b58-depth-probe2', 'landing', 'صفحة فحص العمق ٢',
     '{"title":null,"description":"وصف"}'::jsonb, false, 992);

  insert into public.sections (id, page_id, type, content, sort, visible) values
    (v_cols, v_page, 'columns',   '{}'::jsonb, 0, true),
    (v_leaf, v_page, 'rich-text', '{"body":"ورقة"}'::jsonb, 9, true);

  -- (د-١) شاهد إيجابي: الابن تحت `columns` يمرّ
  insert into public.sections (id, page_id, parent_id, type, content, sort, visible)
  values (v_child, v_page, v_cols, 'rich-text', '{"body":"عمود ١"}'::jsonb, 0, true);
  select count(*) into v_n from public.sections where parent_id = v_cols;
  if v_n <> 1 then
    raise exception '(د-١) الابن المشروع لم يُدرَج (% صفاً)', v_n;
  end if;

  -- (د-٢) الحفيد مرفوض
  v_ok := false; v_hint := null;
  begin
    insert into public.sections (page_id, parent_id, type, content, sort, visible)
    values (v_page, v_child, 'rich-text', '{"body":"حفيد"}'::jsonb, 0, true);
    v_ok := true;
  exception when others then get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if v_ok then
    raise exception '(د-٢) قُبل حفيد — نصٌّ على ثلاثة مستويات لا يعنونه الفهرس';
  end if;
  if v_hint is distinct from 'depth-exceeded' then
    raise exception '(د-٢) الرفض خرج بـ[%] لا بـdepth-exceeded', coalesce(v_hint, '∅');
  end if;

  -- (د-٣) 🔒 والطرف المعاكس: أمٌّ لها أبناء تكتسب أباً.
  --       الفحص من جهة الابن وحده يمرّرها، والنتيجة حفيدٌ بلا إدراج حفيد.
  v_ok := false; v_hint := null;
  begin
    update public.sections set parent_id = v_leaf where id = v_cols;
    v_ok := true;
  exception when others then get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if v_ok then
    raise exception '(د-٣) صارت كتلةٌ أمّاً وابنةً معاً';
  end if;
  if v_hint is distinct from 'depth-exceeded' then
    raise exception '(د-٣) الرفض خرج بـ[%] لا بـdepth-exceeded', coalesce(v_hint, '∅');
  end if;

  -- (د-٤) أبٌ لا يقبل أبناءً
  v_ok := false; v_hint := null;
  begin
    insert into public.sections (page_id, parent_id, type, content, sort, visible)
    values (v_page, v_leaf, 'rich-text', '{"body":"ابن ورقة"}'::jsonb, 0, true);
    v_ok := true;
  exception when others then get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if v_ok then
    raise exception '(د-٤) قُبل ابنٌ تحت كتلةٍ ليست تخطيطاً';
  end if;
  if v_hint is distinct from 'block-placement' then
    raise exception '(د-٤) الرفض خرج بـ[%] لا بـblock-placement', coalesce(v_hint, '∅');
  end if;

  -- (د-٥) أبٌ في صفحةٍ أخرى
  v_ok := false; v_hint := null;
  begin
    insert into public.sections (page_id, parent_id, type, content, sort, visible)
    values (v_page2, v_cols, 'rich-text', '{"body":"ابن غريب"}'::jsonb, 0, true);
    v_ok := true;
  exception when others then get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if v_ok then
    raise exception '(د-٥) قُبل ابنٌ أبوه في صفحةٍ أخرى';
  end if;
  if v_hint is distinct from 'orphan-child' then
    raise exception '(د-٥) الرفض خرج بـ[%] لا بـorphan-child', coalesce(v_hint, '∅');
  end if;

  -- (د-٦) سقف الأبناء = ٤ (‏`maxChildren` في العقد). ثلاثة إضافيون يمرّون،
  --       والخامس يُرفض — الشاهد الإيجابي والسالب في تأكيدٍ واحد.
  insert into public.sections (page_id, parent_id, type, content, sort, visible) values
    (v_page, v_cols, 'rich-text', '{"body":"عمود ٢"}'::jsonb, 1, true),
    (v_page, v_cols, 'rich-text', '{"body":"عمود ٣"}'::jsonb, 2, true),
    (v_page, v_cols, 'rich-text', '{"body":"عمود ٤"}'::jsonb, 3, true);

  select count(*) into v_n from public.sections where parent_id = v_cols;
  if v_n <> 4 then
    raise exception '(د-٦) توقعنا ٤ أبناء وحصلنا %', v_n;
  end if;

  v_ok := false; v_hint := null;
  begin
    insert into public.sections (page_id, parent_id, type, content, sort, visible)
    values (v_page, v_cols, 'rich-text', '{"body":"عمود ٥"}'::jsonb, 4, true);
    v_ok := true;
  exception when others then get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if v_ok then
    raise exception '(د-٦) قُبل ابنٌ خامس رغم أن السقف ٤';
  end if;
  if v_hint is distinct from 'block-placement' then
    raise exception '(د-٦) رفض السقف خرج بـ[%] لا بـblock-placement', coalesce(v_hint, '∅');
  end if;

  -- (د-٧) حذف الأمّ يحذف أبناءها (‏`on delete cascade`) — وإلا بقيت أيتام
  delete from public.sections where id = v_cols;
  select count(*) into v_n from public.sections where page_id = v_page and parent_id is not null;
  if v_n <> 0 then
    raise exception '(د-٧) بقي % ابناً يتيماً بعد حذف الأمّ', v_n;
  end if;

  delete from public.pages where id in (v_page, v_page2);

  raise notice '✔ (د) العمق: الابن يمرّ · الحفيد مرفوض من الطرفين · الأب الورقة والصفحة الأخرى مرفوضان · السقف ٤ · والحذف يجرف الأبناء';
end;
$$;

-- ----------------------------------------------------------------------------
-- (هـ) `block_renders` = `blockRenders` في العقد — حرفاً بحرف
--
-- 🔴 وأهم صفٍّ هنا `page-hero` بلا عنوان: العارضة اليوم تُصيَّر `content.title`
-- بلا شرط، والمحتوى الابتدائي `{title:""}` ⇒ `<h1>` فارغ على صفحة عامة. تسجيل
-- `title` إلزامياً هو الإصلاح، وهذا التأكيد هو ما يمسك عودته.
-- ----------------------------------------------------------------------------
do $$
declare
  v_bad text;
begin
  with cases(label, type, content, expected) as (
    values
      ('rich-text بجسم',            'rich-text', '{"body":"نص"}'::jsonb,                 true),
      ('rich-text بلا جسم',         'rich-text', '{"title":"عنوان"}'::jsonb,             false),
      ('rich-text بجسم فراغات',     'rich-text', '{"body":"   "}'::jsonb,                false),
      ('page-hero بعنوان',          'page-hero', '{"title":"عنوان"}'::jsonb,             true),
      ('page-hero بعنوان فارغ',     'page-hero', '{"title":""}'::jsonb,                  false),
      ('page-hero بلا عنوان',       'page-hero', '{"sub":"وصف"}'::jsonb,                 false),
      ('page-hero بعنوان رقمي',     'page-hero', '{"title":42}'::jsonb,                  false),
      ('faq بعناصر',                'faq',       '{"items":[{"q":"س","a":"ج"}]}'::jsonb, true),
      ('faq بقائمة فارغة',          'faq',       '{"items":[]}'::jsonb,                  false),
      ('faq بعناصر ليست مصفوفة',    'faq',       '{"items":{"q":"س"}}'::jsonb,           false),
      ('cta-band بلا إلزامي',       'cta-band',  '{}'::jsonb,                            true),
      ('image كاملة',               'image',     '{"src":"a/b.jpg","alt":"وصف"}'::jsonb, true),
      ('image بلا alt',             'image',     '{"src":"a/b.jpg"}'::jsonb,             false),
      ('image بلا src',             'image',     '{"alt":"وصف"}'::jsonb,                 false),
      ('نوع غير مسجَّل',             '0b58-nope', '{"body":"نص"}'::jsonb,                 false)
  )
  select string_agg(label || ': توقعنا ' || expected || ' وحصلنا ' ||
                    public.block_renders(type, content), ' | ')
    into v_bad
  from cases
  where public.block_renders(type, content) is distinct from expected;

  if v_bad is not null then
    raise exception '(هـ-١) block_renders يخالف blockRenders: %', v_bad;
  end if;

  raise notice '✔ (هـ) block_renders = blockRenders: الحقل الناقص ⇒ null، وpage-hero بلا عنوان لا تُصيَّر';
end;
$$;

-- ----------------------------------------------------------------------------
-- (و) الشكل غير المعنوَن **لا يُكتب** — حارسٌ على الكتالوج لا كاشفٌ نصّي
--
-- القاعدة الذهبية ١٩: كاشفٌ يقرأ نصّاً يكذب في الاتجاهين. فالحارس هنا مُشغّل،
-- وكل حالةٍ أدناه تُجرَّب **كتابةً حقيقية** داخل معاملةٍ فرعية تُرجَع.
-- ----------------------------------------------------------------------------
do $$
declare
  v_case  record;
  v_ok    boolean;
  v_hint  text;
begin
  for v_case in
    select * from (values
      ('حقلٌ نصّي محجوز (style)',     'content', 'any',  false, null::integer, array['style'],  null::text[], '{}'::text[]),
      ('حقلٌ نصّي محجوز (_k)',        'content', 'any',  false, null,          array['_k'],     null,         '{}'::text[]),
      ('حقلٌ نصّي بمسار متداخل',      'content', 'any',  false, null,          array['a.b'],    null,         '{}'::text[]),
      ('حقلٌ نصّي اسمه items',        'content', 'any',  false, null,          array['items'],  null,         '{}'::text[]),
      ('تخطيطٌ يحمل نصّاً',           'layout',  'any',  true,  3,             array['title'],  null,         '{}'::text[]),
      ('أبناءٌ بلا دور layout',      'content', 'any',  true,  3,             '{}'::text[],    null,         '{}'::text[]),
      ('layout بلا أبناء',           'layout',  'any',  false, null,          '{}'::text[],    null,         '{}'::text[]),
      ('سقفُ أبناءٍ على ورقة',        'content', 'any',  false, 3,             '{}'::text[],    null,         '{}'::text[]),
      ('إلزاميٌّ لا يُملأ',            'content', 'any',  false, null,          array['title'],  null,         array['ghost']),
      ('items إلزامية بلا itemFields','content', 'any',  false, null,          array['title'],  null,         array['items'])
    ) as t(label, role, placement, accepts, maxc, tf, itf, rf)
  loop
    v_ok := false; v_hint := null;
    begin
      insert into public.block_registry
        (type, role, placement, accepts_children, max_children, text_fields, item_fields, required_fields)
      values ('0b58-probe', v_case.role, v_case.placement, v_case.accepts,
              v_case.maxc, v_case.tf, v_case.itf, v_case.rf);
      v_ok := true;
    exception when others then get stacked diagnostics v_hint = pg_exception_hint;
    end;

    if v_ok then
      delete from public.block_registry where type = '0b58-probe';
      raise exception '(و) قُبل شكلٌ غير قانوني في الكتالوج: %', v_case.label;
    end if;
    if v_hint is distinct from 'block-registry-shape' then
      raise exception '(و) «%» رُفض بـ[%] لا بـblock-registry-shape', v_case.label, coalesce(v_hint, '∅');
    end if;
  end loop;

  -- شاهد إيجابي: شكلٌ قانوني يُكتب فعلاً — بلاه أثبتنا أن الجدول مغلق لا محروس
  insert into public.block_registry
    (type, role, placement, accepts_children, max_children, text_fields, item_fields, required_fields)
  values ('0b58-probe', 'content', 'any', false, null, array['title','body'], array['q','a'], array['items']);
  if not exists (select 1 from public.block_registry where type = '0b58-probe') then
    raise exception '(و) الشكل القانوني لم يُكتب — الحارس يرفض كل شيء';
  end if;
  delete from public.block_registry where type = '0b58-probe';

  raise notice '✔ (و) حارس الكتالوج: عشرة أشكالٍ غير معنونة مرفوضة كتابةً، والقانوني يمرّ';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ز) بوابة النشر — كل رمز في حالته، ثم 🔬 **الطفرة ٢**
-- ----------------------------------------------------------------------------
do $$
declare
  v_page constant uuid := '0b580000-0000-4000-8000-000000000301';
  v_rev  constant uuid := '0b580000-0000-4000-8000-000000000311';
  v_a    constant uuid := '0b580000-0000-4000-8000-000000000321';
  v_b    constant uuid := '0b580000-0000-4000-8000-000000000322';
  v_c    constant uuid := '0b580000-0000-4000-8000-000000000323';
  v_codes text[];
  v_snap  jsonb;
  v_mutated boolean := false;
begin
  -- صفحةٌ فارغة بعنوانٍ فارغ وبلا وصف سيو
  insert into public.pages (id, slug, kind, title, meta, published, sort)
  values (v_page, '0b58-blockers-probe', 'landing', '  ',
          '{"title":null,"description":null}'::jsonb, false, 993);

  select array_agg(b order by b) into v_codes from public.page_publish_blockers(v_page) b;
  if v_codes is null or not (v_codes @> array['no-blocks', 'empty-title', 'no-meta-description']) then
    raise exception '(ز-١) صفحةٌ فارغة بلا عنوان ولا وصف: توقعنا الرموز الثلاثة وحصلنا %',
      coalesce(v_codes::text, '∅');
  end if;

  -- نُصلح العنوان والوصف، ونضيف كتلةً ينقصها حقلها الإلزامي
  update public.pages set title = 'صفحة فحص البوابة',
         meta = '{"title":null,"description":"وصف فحص البوابة"}'::jsonb
   where id = v_page;

  insert into public.sections (id, page_id, type, content, sort, visible)
  values (v_a, v_page, 'page-hero', '{"title":""}'::jsonb, 0, true);

  select array_agg(b order by b) into v_codes from public.page_publish_blockers(v_page) b;
  if v_codes is null or not (v_codes @> array['missing-required', 'all-blocks-empty']) then
    raise exception '(ز-٢) كتلةٌ ينقصها الإلزامي: توقعنا missing-required و all-blocks-empty وحصلنا %',
      coalesce(v_codes::text, '∅');
  end if;
  if coalesce(v_codes @> array['empty-title'], false) or coalesce(v_codes @> array['no-meta-description'], false) then
    raise exception '(ز-٢) رمزا العنوان والوصف لم يسقطا بعد إصلاحهما: %', v_codes::text;
  end if;

  -- (ز-٣) بعنوانٍ حقيقي: لا رمز إطلاقاً — الشاهد الإيجابي الذي بلاه كل ما سبق
  --       يثبت أن البوابة تمنع دائماً لا أنها تقيس
  update public.sections set content = '{"title":"ترويسة حقيقية"}'::jsonb where id = v_a;
  select array_agg(b order by b) into v_codes from public.page_publish_blockers(v_page) b;
  if v_codes is not null then
    raise exception '(ز-٣) صفحةٌ سليمة رُفضت بـ%', v_codes::text;
  end if;

  -- (ز-٤) `once-per-page` مكررة
  insert into public.sections (id, page_id, type, content, sort, visible) values
    (v_b, v_page, 'fleet', '{"title":"الأسطول"}'::jsonb, 1, true),
    (v_c, v_page, 'fleet', '{"title":"الأسطول مرة أخرى"}'::jsonb, 2, true);
  select array_agg(b order by b) into v_codes from public.page_publish_blockers(v_page) b;
  if v_codes is null or not (v_codes @> array['duplicate-singleton']) then
    raise exception '(ز-٤) كتلة once-per-page مكررة لم تُمنع: %', coalesce(v_codes::text, '∅');
  end if;
  delete from public.sections where id = v_c;

  -- (ز-٥) `home-only` خارج الرئيسية — نسختان من hero = ويدجتا حجز
  update public.sections set type = 'hero', content = '{"headline":"واجهة"}'::jsonb where id = v_b;
  select array_agg(b order by b) into v_codes from public.page_publish_blockers(v_page) b;
  if v_codes is null or not (v_codes @> array['home-only-misplaced']) then
    raise exception '(ز-٥) hero خارج الرئيسية لم تُمنع: %', coalesce(v_codes::text, '∅');
  end if;
  delete from public.sections where id = v_b;

  -- (ز-٦) تصادم المسار **بعد** إنشاء الصفحة: تحويلٌ يُضاف لاحقاً يخطف المسار،
  --       وهو ما لا يستطيع مُشغّل الـslug إمساكه لأن الصفحة لم تتغيّر
  insert into public.redirects (from_path, to_path, status_code, enabled)
  values ('/0b58-blockers-probe', '/', 301, true);
  select array_agg(b order by b) into v_codes from public.page_publish_blockers(v_page) b;
  if v_codes is null or not (v_codes @> array['slug-conflict']) then
    raise exception '(ز-٦) تحويلٌ يخطف المسار لم يمنع النشر: %', coalesce(v_codes::text, '∅');
  end if;
  delete from public.redirects where from_path = '/0b58-blockers-probe';

  -- (ز-٧) `orphan-child` و`depth-exceeded` **من اللقطة**: لا يمكن أن يوجدا في
  --        الأقسام الحيّة (المُشغّل يمنعهما)، وهذا بالضبط سبب وجود مسار اللقطة
  v_snap := jsonb_build_object('sections', jsonb_build_array(
    jsonb_build_object('id', v_a::text, 'type', 'page-hero',
                       'content', jsonb_build_object('title', 'ترويسة'), 'sort', 0, 'visible', true),
    jsonb_build_object('id', '0b580000-0000-4000-8000-0000000003a1', 'parent_id',
                       '0b580000-0000-4000-8000-0000000003ff', 'type', 'rich-text',
                       'content', jsonb_build_object('body', 'يتيم'), 'sort', 1, 'visible', true)
  ));
  insert into public.page_revisions (id, page_id, status, snapshot)
  values (v_rev, v_page, 'draft', v_snap);

  select array_agg(b order by b) into v_codes from public.page_publish_blockers(v_page, v_rev) b;
  if v_codes is null or not (v_codes @> array['orphan-child']) then
    raise exception '(ز-٧) كتلةٌ ابنة بلا أب في اللقطة لم تُمنع: %', coalesce(v_codes::text, '∅');
  end if;

  update public.page_revisions set snapshot = jsonb_build_object('sections', jsonb_build_array(
    jsonb_build_object('id', '0b580000-0000-4000-8000-0000000003b1', 'type', 'columns',
                       'content', '{}'::jsonb, 'sort', 0, 'visible', true),
    jsonb_build_object('id', '0b580000-0000-4000-8000-0000000003b2', 'parent_id',
                       '0b580000-0000-4000-8000-0000000003b1', 'type', 'rich-text',
                       'content', jsonb_build_object('body', 'ابن'), 'sort', 1, 'visible', true),
    jsonb_build_object('id', '0b580000-0000-4000-8000-0000000003b3', 'parent_id',
                       '0b580000-0000-4000-8000-0000000003b2', 'type', 'rich-text',
                       'content', jsonb_build_object('body', 'حفيد'), 'sort', 2, 'visible', true)
  )) where id = v_rev;

  select array_agg(b order by b) into v_codes from public.page_publish_blockers(v_page, v_rev) b;
  if v_codes is null or not (v_codes @> array['depth-exceeded']) then
    raise exception '(ز-٧) حفيدٌ في اللقطة لم يُمنع: %', coalesce(v_codes::text, '∅');
  end if;

  -- ══════════════════════════════════════════════════════════════════════
  -- 🔬 (ز-٨) الطفرة ٢ — هل تقرأ البوابة الكتالوج فعلاً؟
  --
  -- التأكيد (ز-٢) يقول «‏page-hero بعنوان فارغ تُمنع». لكن هل السبب أن البوابة
  -- تقرأ `required_fields` من `block_registry`، أم أن في جسمها قائمةً محفورة
  -- ستتخلّف يوم تُضاف كتلة؟ الفرق لا يظهر بقراءة الكود بل بالطفرة:
  -- نُنزع `title` من إلزاميات `page-hero` ونطلب الرمز مرة أخرى. لو بقي الرمز
  -- فالبوابة لا تقرأ الكتالوج — و(ز-٢) يزيّن التقرير ولا يحرس شيئاً.
  -- ══════════════════════════════════════════════════════════════════════
  begin
    update public.sections set content = '{"title":""}'::jsonb where id = v_a;

    select array_agg(b order by b) into v_codes from public.page_publish_blockers(v_page) b;
    if v_codes is null or not (v_codes @> array['missing-required']) then
      raise exception '(ز-٨) خط الأساس مكسور: العنوان الفارغ لم يعطِ missing-required';
    end if;

    -- الطفرة نفسها
    update public.block_registry set required_fields = '{}'::text[] where type = 'page-hero';

    select array_agg(b order by b) into v_codes from public.page_publish_blockers(v_page) b;
    if coalesce(v_codes @> array['missing-required'], false) then
      raise exception
        '(ز-٨) 🔬 الطفرة لم تُحدث فرقاً: البوابة ما زالت تمنع بعد نزع الإلزام من الكتالوج — أي أن (ز-٢) لا يقيس الكتالوج بل قائمةً محفورة';
    end if;
    v_mutated := true;

    raise exception 'PB_MUTATION2_ROLLBACK';
  exception
    when others then
      if sqlerrm <> 'PB_MUTATION2_ROLLBACK' then raise; end if;
  end;

  if not v_mutated then
    raise exception '(ز-٨) لم تُشغَّل الطفرة أصلاً';
  end if;

  -- والكتالوج عاد كما كان (المعاملة الفرعية أُرجعت)
  if not ((select required_fields from public.block_registry where type = 'page-hero') = array['title']) then
    raise exception '(ز-٨) الطفرة لم تُرجَع — الكتالوج ملوَّث';
  end if;

  delete from public.pages where id = v_page;

  raise notice '✔ (ز) البوابة: ١٠ رموز في حالاتها · واللقطة تمسك ما لا تمسكه الأقسام الحيّة · 🔬 والطفرة ٢ تثبت أنها تقرأ الكتالوج';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ح) 🔴 النشر فرقٌ بالمعرّف — والترجمة تنجو. ثم 🔬 **الطفرة ١**
--
-- هذا **أهم قسم في الملف**. نشرٌ بـ«احذف ثم أدرج» يبدو أبسط ويعمل تماماً في أول
-- تجربة، ويُبيد كل ترجمات الصفحة في كل نشرة لأن كل مفاتيح `namespace='section'`
-- مبنية على `sections.id`. والفرق لا يظهر في أي شاشة عربية — يظهر هنا وحده.
-- ----------------------------------------------------------------------------
do $$
declare
  v_page  constant uuid := '0b580000-0000-4000-8000-000000000401';
  v_rev   constant uuid := '0b580000-0000-4000-8000-000000000411';
  v_noop  constant uuid := '0b580000-0000-4000-8000-000000000412';  -- لقطةٌ لا تغيّر شيئاً
  v_keep  constant uuid := '0b580000-0000-4000-8000-000000000421';  -- يبقى ويُعدَّل
  v_drop  constant uuid := '0b580000-0000-4000-8000-000000000422';  -- يُحذف
  v_cols  constant uuid := '0b580000-0000-4000-8000-000000000423';  -- كتلة تخطيط جديدة
  v_kid   constant uuid := '0b580000-0000-4000-8000-000000000424';  -- ابنها الجديد
  v_key   text;
  v_res   jsonb;
  v_snap  jsonb;
  v_n     integer;
  v_upd   timestamptz;
  v_upd2  timestamptz;
  v_ok    boolean;
  v_hint  text;
  v_killed boolean := false;
begin
  -- ── الفيكسترة: صفحة منشورة بقسمين، ولغةٌ وترجمةٌ **منشورة** لأحدهما ──
  insert into public.locales (code, name, native_name, dir, is_default, enabled, auto_publish, sort)
  values ('zx', 'لغة فحص المنشئ', 'Builderish', 'ltr', false, true, false, 97);

  insert into public.pages (id, slug, kind, title, meta, published, sort)
  values (v_page, '0b58-publish-probe', 'landing', 'صفحة فحص النشر',
          '{"title":null,"description":"وصف فحص النشر"}'::jsonb, true, 994);

  insert into public.sections (id, page_id, type, content, sort, visible) values
    (v_keep, v_page, 'rich-text', '{"body":"فقرة أصلية تُترجَم"}'::jsonb, 0, true),
    (v_drop, v_page, 'cta-band',  '{"title":"شريط يُحذف"}'::jsonb,       1, true);

  v_key := v_keep::text || '.body';

  -- الفهرس يلتقط القسم — شاهدٌ إيجابي قبل أي نشر
  if not exists (select 1 from public.i18n_corpus_rows() c
                 where c.ns = 'section' and c.k = v_key) then
    raise exception '(ح-٠) الفهرس لم يلتقط القسم أصلاً — الفيكسترة معطوبة لا المنتج';
  end if;

  insert into public.translations (locale, namespace, key, source_text, value, status)
  values ('zx', 'section', v_key, 'فقرة أصلية تُترجَم', 'Original paragraph', 'published');

  -- ── اللقطة: تعديل الباقي · حذف الثاني · إضافة كتلة تخطيط وابنها ──
  v_snap := jsonb_build_object(
    'page', jsonb_build_object('id', v_page::text, 'slug', '0b58-publish-probe'),
    'sections', jsonb_build_array(
      jsonb_build_object('id', v_keep::text, 'type', 'rich-text',
        'content', jsonb_build_object('body', 'فقرة أصلية تُترجَم'), 'sort', 0, 'visible', true),
      jsonb_build_object('id', v_cols::text, 'type', 'columns',
        'content', '{}'::jsonb, 'sort', 1, 'visible', true),
      jsonb_build_object('id', v_kid::text, 'parent_id', v_cols::text, 'type', 'rich-text',
        'content', jsonb_build_object('body', 'عمود جديد'), 'sort', 0, 'visible', true)
    ));

  insert into public.page_revisions (id, page_id, status, snapshot)
  values (v_rev, v_page, 'draft', v_snap);

  -- (ح-١) القاعدة تعرف أن ثمة تغييراً غير منشور — بلا مقارنةٍ في المتصفح
  if not public.page_has_unpublished_changes(v_page) then
    raise exception '(ح-١) page_has_unpublished_changes لم ترَ فرقاً بين المسودة والمنشور';
  end if;

  select p.updated_at into v_upd from public.pages p where p.id = v_page;

  -- ── النشر ──
  v_res := public.publish_page_revision(v_page, v_rev);

  if (v_res ->> 'updated')::integer <> 0 then
    raise exception '(ح-٢) updated: توقعنا ٠ (لم يتغيّر محتوى الباقي) وحصلنا %', v_res ->> 'updated';
  end if;
  if (v_res ->> 'inserted')::integer <> 2 then
    raise exception '(ح-٢) inserted: توقعنا ٢ وحصلنا % (%)', v_res ->> 'inserted', v_res::text;
  end if;
  if (v_res ->> 'deleted')::integer <> 1 then
    raise exception '(ح-٢) deleted: توقعنا ١ وحصلنا %', v_res ->> 'deleted';
  end if;

  -- (ح-٣) 🔴 التأكيد الأهم: المعرّف بقي، فالمفتاح ما زال في الفهرس
  if not exists (select 1 from public.sections s where s.id = v_keep and s.page_id = v_page) then
    raise exception '(ح-٣) اختفى المعرّف الباقي — النشر استبدل بدل أن يُطابق';
  end if;
  if not exists (select 1 from public.i18n_corpus_rows() c
                 where c.ns = 'section' and c.k = v_key) then
    raise exception '(ح-٣) 🔴 مفتاح الترجمة سقط من الفهرس بعد النشر — النشر يُبيد الترجمات';
  end if;
  if not exists (select 1 from public.translations t
                 where t.locale = 'zx' and t.namespace = 'section'
                   and t.key = v_key and t.status = 'published') then
    raise exception '(ح-٣) الترجمة المنشورة ضاعت';
  end if;

  -- والمحذوف حُذف، والجديدان أُدرجا بمعرّفيهما ونسبهما
  if exists (select 1 from public.sections s where s.id = v_drop) then
    raise exception '(ح-٤) القسم المرفوع من اللقطة لم يُحذف';
  end if;
  if not exists (select 1 from public.sections s where s.id = v_kid and s.parent_id = v_cols) then
    raise exception '(ح-٤) الابن الجديد لم يُدرَج تحت أمّه';
  end if;
  select count(*) into v_n from public.sections where page_id = v_page;
  if v_n <> 3 then
    raise exception '(ح-٤) توقعنا ٣ أقسام بعد النشر وحصلنا %', v_n;
  end if;
  if jsonb_array_length(v_res -> 'keptSectionIds') <> 3 then
    raise exception '(ح-٤) keptSectionIds فيها % لا ٣', jsonb_array_length(v_res -> 'keptSectionIds');
  end if;

  -- (ح-٥) نشرةٌ لا تغيّر شيئاً تُعلن **صفراً** — وهذا نصف حارس `updated_at`:
  --
  -- ⚠ النصف الآخر (أن الختم نفسه لا يتحرك) **غير قابل للقياس داخل معاملةٍ
  --    واحدة**: `now()` ثابتةٌ طوال المعاملة، و`pages_touch_updated_at` يكتبها،
  --    فالصفّ المُدرَج هنا والصفّ الملموس بعده يحملان القيمة نفسها مهما فعلنا.
  --    فبدل تأكيدٍ يمرّ دائماً (النمط ٩) نقيس **القرار** الذي يقوم عليه الختم:
  --    الفرق المحسوب. صفرٌ في الأعداد الثلاثة ⇒ لا `update` على `pages` أصلاً.
  select p.updated_at into v_upd2 from public.pages p where p.id = v_page;
  if v_upd2 is null then
    raise exception '(ح-٥) الصفحة بلا ختم تعديل — خريطة الموقع تعلن تاريخ التصيير';
  end if;

  insert into public.page_revisions (id, page_id, status, snapshot)
  values (v_noop, v_page, 'draft', v_snap);

  v_res := public.publish_page_revision(v_page, v_noop);
  if (v_res ->> 'updated')::integer <> 0
     or (v_res ->> 'inserted')::integer <> 0
     or (v_res ->> 'deleted')::integer <> 0 then
    raise exception
      '(ح-٥) نشرةٌ لا تغيّر شيئاً أعلنت تعديلاً (%) — وكل نشرةٍ كهذه تحرّك lastModified وتكذب على الزاحف',
      v_res::text;
  end if;

  -- واللقطة صارت منشورة، والمسودة لم تعد مفتوحة
  if (select status from public.page_revisions where id = v_rev) <> 'archived' then
    raise exception '(ح-٦) اللقطة الأولى لم تُؤرشَف بعد نشر التالية: %',
      (select status from public.page_revisions where id = v_rev);
  end if;
  if (select status from public.page_revisions where id = v_noop) <> 'published' then
    raise exception '(ح-٦) اللقطة الثانية لم تُوسم منشورة';
  end if;
  if public.page_has_unpublished_changes(v_page) then
    raise exception '(ح-٦) ما زال ثمة تغييرٌ غير منشور بعد النشر';
  end if;

  -- (ح-٧) وإعادة نشر لقطةٍ نُشرت مرفوضة **برمزها** — تبويبان مفتوحان على
  --       الصفحة نفسها يجب أن يُعلَم ثانيهما لماذا رُفض
  v_ok := false; v_hint := null;
  begin
    perform public.publish_page_revision(v_page, v_noop);
    v_ok := true;
  exception when others then get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if v_ok then
    raise exception '(ح-٧) نُشرت لقطةٌ منشورة مرة أخرى — «نشر» مرتين يعيد الحالة القديمة صامتاً';
  end if;
  if v_hint is distinct from 'stale-revision' then
    raise exception '(ح-٧) الرفض خرج بـ[%] لا بـstale-revision', coalesce(v_hint, '∅');
  end if;

  -- ══════════════════════════════════════════════════════════════════════
  -- 🔬 (ح-٨) الطفرة ١ — «احذف ثم أدرج»، وهي الطريق الذي يبدو أبسط
  --
  -- نكتب هنا **التنفيذ البديل نفسه** الذي حذّر منه العقد، ونُشغّله على الفيكسترة
  -- عينها داخل معاملةٍ فرعية تُرجَع. لو نجا مفتاح الترجمة منه أيضاً، فتأكيد
  -- (ح-٣) لا يقيس شيئاً وكان ينبغي حذفه. والمقصود إثبات العكس: أن الفرق بين
  -- التنفيذين **يُقاس**، وأن ما يحرسه (ح-٣) موجود.
  -- ══════════════════════════════════════════════════════════════════════
  begin
    delete from public.sections where page_id = v_page;

    insert into public.sections (id, page_id, type, content, sort, visible)
    select gen_random_uuid(), v_page, x ->> 'type',
           coalesce(x -> 'content', '{}'::jsonb),
           coalesce((x ->> 'sort')::integer, 0), true
    from jsonb_array_elements(v_snap -> 'sections') x
    where nullif(x ->> 'parent_id', '') is null;

    -- المحتوى نفسه على الشاشة… والمفتاح مات
    if exists (select 1 from public.i18n_corpus_rows() c
               where c.ns = 'section' and c.k = v_key) then
      raise exception
        '(ح-٨) 🔬 الطفرة لم تُحدث فرقاً: المفتاح نجا من «احذف ثم أدرج» أيضاً — أي أن (ح-٣) لا يحرس شيئاً';
    end if;

    if exists (select 1 from public.sections s where s.id = v_keep) then
      raise exception '(ح-٨) 🔬 الطفرة لم تُنفَّذ أصلاً: المعرّف الأصلي ما زال موجوداً';
    end if;

    v_killed := true;
    raise exception 'PB_MUTATION1_ROLLBACK';
  exception
    when others then
      if sqlerrm <> 'PB_MUTATION1_ROLLBACK' then raise; end if;
  end;

  if not v_killed then
    raise exception '(ح-٨) لم تُشغَّل الطفرة أصلاً';
  end if;

  -- وبعد إرجاع الطفرة: الحالة السليمة كما تركها النشر الحقيقي
  if not exists (select 1 from public.i18n_corpus_rows() c
                 where c.ns = 'section' and c.k = v_key) then
    raise exception '(ح-٨) الطفرة لم تُرجَع — الفيكسترة ملوَّثة';
  end if;

  raise notice '✔ (ح) النشر فرقٌ بالمعرّف: ٠ محدَّث · ٢ مدرَج · ١ محذوف · الترجمة نجت · نشرةٌ لا تغيّر شيئاً تُعلن صفراً · وإعادة النشر تُرفض بـstale-revision — 🔬 والطفرة ١ تُبيد المفتاح، فالفرق مقيس';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ط) المنح — 🔒 القاعدة الذهبية ١٦: `TRUNCATE` لا تغطيها RLS
--
-- وفحص «‏`select("*")` لا ينكسر»: شاشةٌ في هذا المشروع ماتت كاملةً لأن عموداً
-- واحداً لم يُمنح، فرفض Postgres الاستعلام كله. الأعمدة الجديدة تُفحص بالاسم.
-- ----------------------------------------------------------------------------
do $$
declare
  v_bad  text;
  v_priv text;
  v_col  text;
begin
  -- (ط-١) `anon` بلا أي منحة على الجداول الثلاثة
  foreach v_priv in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] loop
    foreach v_bad in array array['block_registry', 'reserved_slugs', 'page_revisions'] loop
      if has_table_privilege('anon', 'public.' || v_bad, v_priv) then
        raise exception '(ط-١) anon يملك % على % — والمسودة بيانات مالكٍ خالصة', v_priv, v_bad;
      end if;
    end loop;
  end loop;

  -- (ط-٢) ولا `TRUNCATE` لـ`authenticated` على أيٍّ منها
  foreach v_bad in array array['block_registry', 'reserved_slugs', 'page_revisions', 'pages', 'sections'] loop
    if has_table_privilege('authenticated', 'public.' || v_bad, 'TRUNCATE') then
      raise exception '(ط-٢) authenticated يفرّغ % — RLS لا تغطي TRUNCATE، فالمنحة هي الحارس', v_bad;
    end if;
  end loop;

  -- (ط-٣) ولا كتابة على الكتالوجَين لأي دور مستخدم — هما كودٌ في صورة صفوف
  foreach v_priv in array array['INSERT', 'UPDATE', 'DELETE'] loop
    foreach v_bad in array array['block_registry', 'reserved_slugs'] loop
      if has_table_privilege('authenticated', 'public.' || v_bad, v_priv) then
        raise exception '(ط-٣) authenticated يملك % على % — تعديل الكتالوج هجرةٌ لا نقرة', v_priv, v_bad;
      end if;
    end loop;
  end loop;

  -- (ط-٤) شاهدٌ إيجابي: اللوحة تكتب اللقطات فعلاً (المنحة موجودة، وRLS تحرس)
  foreach v_priv in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE'] loop
    if not has_table_privilege('authenticated', 'public.page_revisions', v_priv) then
      raise exception '(ط-٤) authenticated لا يملك % على page_revisions — المنشئ لا يحفظ شيئاً', v_priv;
    end if;
  end loop;

  -- (ط-٥) 🔒 `select("*")` على `sections` لا ينكسر: الأعمدة الجديدة ممنوحة
  --       لكل دورٍ يقرأ الجدول اليوم
  foreach v_col in array array['parent_id', 'block_key'] loop
    foreach v_bad in array array['anon', 'authenticated'] loop
      if not has_column_privilege(v_bad, 'public.sections', v_col, 'SELECT') then
        raise exception
          '(ط-٥) العمود sections.% غير ممنوح لـ% — أي select("*") يُرفض كاملاً فتموت الشاشة', v_col, v_bad;
      end if;
    end loop;
  end loop;

  -- (ط-٥ب) ونفس القاعدة على عمودَي م‑٧: المنشئ يقرأ `block_registry` بـ`*`،
  --        فعمودٌ غير ممنوح كان سيُسقط قراءة الكتالوج كلها ⇒ صفر كتلة في الشاشة
  foreach v_col in array array['non_text_fields', 'non_text_item_fields'] loop
    if not has_column_privilege('authenticated', 'public.block_registry', v_col, 'SELECT') then
      raise exception
        '(ط-٥ب) العمود block_registry.% غير ممنوح لـauthenticated — الكتالوج لا يُقرأ', v_col;
    end if;
  end loop;

  -- (ط-٦) الدوال الإدارية ممنوعة على الزائر، والدالة العامة الوحيدة متاحة
  if has_function_privilege('anon', 'public.publish_page_revision(uuid, uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.page_publish_blockers(uuid, uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.builder_revisions(uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.builder_revision_snapshot(uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.builder_access()', 'EXECUTE')
     or has_function_privilege('anon', 'public.page_slug_reject(text, text, uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.page_slug_conflict(text, text, uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.page_revision_diff(uuid, uuid)', 'EXECUTE') then
    raise exception '(ط-٦) anon يملك تنفيذ دالةٍ إدارية من دوال المنشئ';
  end if;
  -- 🔒 و`page_slug_conflict` ممنوعة على `authenticated` أيضاً: عرّافٌ يكشف
  --    وجود صفحاتٍ غير منشورة لكل متعهد (D-20)
  if has_function_privilege('authenticated', 'public.page_slug_conflict(text, text, uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.page_revision_diff(uuid, uuid)', 'EXECUTE') then
    raise exception '(ط-٦) authenticated يملك تنفيذ دالةٍ داخلية — الغلاف المحروس هو المسار';
  end if;
  if not has_function_privilege('anon', 'public.section_parent_visible(uuid)', 'EXECUTE') then
    raise exception '(ط-٦) anon لا ينفّذ section_parent_visible — سياسة القراءة العامة تنهار على كل صفحة';
  end if;

  raise notice '✔ (ط) المنح: anon صفر · لا TRUNCATE لأحد · الكتالوج غير قابل للكتابة · والأعمدة الجديدة ممنوحة';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ي) أدوار حيّة — **D-20 مقيساً لا معلَناً**
--
-- `authenticated` يشمل **كل متعهد** وكل عميل مسجَّل. والفحص هنا حيّ لا كتالوجي:
-- ثلاث هويات حقيقية و`set local role authenticated`. وكل نفي يسبقه شاهدٌ
-- إيجابي من **نفس الجدول ونفس الدور** — بلا ذلك يمرّ «صفر صف» حتى لو كان سببه
-- فيكسترة لم تُدرج (النمط ٩).
--
-- ⚠ والفخّ المقيس في الشاشة: `proxy.ts` يُدخل `ops` إلى `/admin` بينما كل
-- سياسة كتابة ترفضه ⇒ يسحب ويفلت ويحفظ فيصطدم بـ**صفر صفوف بلا خطأ**.
-- ولذلك `builder_access()` تقول `read-only` قبل أن تُرسم مقابض السحب.
-- ----------------------------------------------------------------------------
do $$
declare
  v_admin  constant uuid := '0b580000-0000-4000-8000-0000000000a1';
  v_ops    constant uuid := '0b580000-0000-4000-8000-0000000000a2';
  v_part   constant uuid := '0b580000-0000-4000-8000-0000000000a3';
  v_page   constant uuid := '0b580000-0000-4000-8000-000000000401';
  v_rev    constant uuid := '0b580000-0000-4000-8000-000000000511';
  v_built  boolean := false;
  v_n      integer;
  v_ok     boolean;
  v_txt    text;
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    raise notice '  ↳ (ي) لا دور authenticated على هذه القاعدة — الفحص متخطّى';
    return;
  end if;

  begin
    insert into auth.users (id, email) values
      (v_ops,  'pb-tests-ops@local.invalid'),
      (v_part, 'pb-tests-partner@local.invalid');
    insert into public.profiles (id, role, full_name) values
      (v_ops,  'ops',           'تشغيل اختبار المنشئ'),
      (v_part, 'subcontractor', 'متعهد اختبار المنشئ')
    on conflict (id) do update set role = excluded.role;
    v_built := true;
  exception
    when others then
      -- التخطّي مقصود لقاعدة بلا مخطط auth، لا لفيكسترة معطوبة (النمط ٩)
      if to_regclass('auth.users') is not null then
        raise exception '(ي) تعذّر بناء الهويات رغم وجود auth.users: % — أصلح الفيكسترة، لا تتخطَّ الفحص', sqlerrm;
      end if;
      raise notice '  ↳ (ي) لا مخطط auth (%) — الفحص متخطّى', sqlerrm;
  end;

  if not v_built then
    return;
  end if;

  -- مسودةٌ مفتوحة على صفحة فحص النشر (‏(ح) تركتها قائمة)
  insert into public.page_revisions (id, page_id, status, snapshot)
  values (v_rev, v_page, 'draft', jsonb_build_object('sections', '[]'::jsonb));

  begin
    -- ══ متعهد مسجَّل ══
    perform set_config('request.jwt.claim.sub', v_part::text, false);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', v_part)::text, false);
    execute 'set local role authenticated';

    -- (ي-١) شاهد إيجابي: يرى الصفحة المنشورة — فالسياسات لم تُغلق بالكامل
    execute format('select count(*) from public.pages where id = %L', v_page) into v_n;
    if v_n <> 1 then
      raise exception '(ي-١) المتعهد لا يرى الصفحة المنشورة (% صفاً)', v_n;
    end if;

    -- (ي-٢) 🔒 ولا يرى مسودةً واحدة
    execute 'select count(*) from public.page_revisions' into v_n;
    if v_n <> 0 then
      raise exception '(ي-٢) 🔴 متعهد قرأ % لقطة مسودة — D-20 منقوض', v_n;
    end if;

    -- (ي-٣) ولا يكتب: الفخّ **صفر صفوف بلا خطأ** لا استثناء
    execute format('update public.page_revisions set snapshot = ''{}''::jsonb where id = %L', v_rev);
    get diagnostics v_n = row_count;
    if v_n <> 0 then
      raise exception '(ي-٣) متعهد كتب % صفاً في اللقطات', v_n;
    end if;

    -- (ي-٤) و`builder_access` تقول denied
    execute 'select public.builder_access()' into v_txt;
    if v_txt is distinct from 'denied' then
      raise exception '(ي-٤) builder_access للمتعهد: توقعنا denied وحصلنا «%»', v_txt;
    end if;

    -- (ي-٥) والدوال المحروسة ترفضه
    v_ok := false;
    begin
      execute format('select count(*) from public.builder_revisions(%L)', v_page) into v_n;
      v_ok := true;
    exception when others then null;
    end;
    if v_ok then
      raise exception '(ي-٥) متعهد نفّذ builder_revisions';
    end if;

    v_ok := false;
    begin
      execute format('select public.publish_page_revision(%L, %L)', v_page, v_rev);
      v_ok := true;
    exception when others then null;
    end;
    if v_ok then
      raise exception '(ي-٥) 🔴 متعهد نشر صفحةً على الموقع العام';
    end if;

    v_ok := false;
    begin
      execute format('select count(*) from public.page_publish_blockers(%L)', v_page) into v_n;
      v_ok := true;
    exception when others then null;
    end;
    if v_ok then
      raise exception '(ي-٥) متعهد نفّذ page_publish_blockers';
    end if;

    -- (ي-٦) شاهد إيجابي: الكتالوج مقروءٌ له — وهذا مقصود، محتواه يُشحن في
    --       حزمة المتصفح أصلاً، وحجبُه يقتل شاشة `ops` بصفر صفٍّ بلا خطأ
    execute 'select count(*) from public.block_registry' into v_n;
    if v_n <> 19 then
      raise exception '(ي-٦) الكتالوج غير مقروء للمسجَّل (% صفاً) — شاشة ops تموت صامتة', v_n;
    end if;

    execute 'reset role';

    -- ══ دور `ops` — يدخل /admin ولا يكتب ══
    perform set_config('request.jwt.claim.sub', v_ops::text, false);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', v_ops)::text, false);
    execute 'set local role authenticated';

    execute 'select public.builder_access()' into v_txt;
    if v_txt is distinct from 'read-only' then
      raise exception '(ي-٧) builder_access لـops: توقعنا read-only وحصلنا «%» — الشاشة سترسم مقبض سحبٍ يفشل عند الحفظ', v_txt;
    end if;

    -- يقرأ عبر الدالة المحروسة…
    execute format('select count(*) from public.builder_revisions(%L)', v_page) into v_n;
    if v_n < 1 then
      raise exception '(ي-٨) ops لا يقرأ اللقطات عبر builder_revisions — شاشة القراءة فارغة';
    end if;

    -- …ولا يقرأ الجدول مباشرة (‏RLS تشترط is_admin)
    execute 'select count(*) from public.page_revisions' into v_n;
    if v_n <> 0 then
      raise exception '(ي-٨) ops قرأ جدول اللقطات مباشرة (% صفاً) — الإسقاط المُدرَج هو المسار الوحيد', v_n;
    end if;

    -- ولا ينشر
    v_ok := false;
    begin
      execute format('select public.publish_page_revision(%L, %L)', v_page, v_rev);
      v_ok := true;
    exception when others then null;
    end;
    if v_ok then
      raise exception '(ي-٩) ops نشر صفحة — القرار المشحون قراءةٌ فقط';
    end if;

    execute 'reset role';

    -- ══ المشرف: اللوحة لم تتعطل — وهذا نصف الاختبار لا زينته ══
    perform set_config('request.jwt.claim.sub', v_admin::text, false);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', v_admin)::text, false);
    execute 'set local role authenticated';

    execute 'select count(*) from public.page_revisions' into v_n;
    if v_n < 2 then
      raise exception '(ي-١٠) المشرف يرى % لقطة فقط — شاشة تاريخ الصفحة فارغة', v_n;
    end if;

    execute 'select public.builder_access()' into v_txt;
    if v_txt is distinct from 'edit' then
      raise exception '(ي-١٠) builder_access للمشرف: توقعنا edit وحصلنا «%»', v_txt;
    end if;

    execute format('update public.page_revisions set snapshot = snapshot where id = %L', v_rev);
    get diagnostics v_n = row_count;
    if v_n <> 1 then
      raise exception '(ي-١٠) المشرف لا يكتب في اللقطات (% صفاً) — المنشئ لا يحفظ', v_n;
    end if;

    execute format('select count(*) from public.page_publish_blockers(%L)', v_page) into v_n;

    execute 'reset role';
  exception
    when others then
      execute 'reset role';
      perform set_config('request.jwt.claim.sub', v_admin::text, false);
      perform set_config('request.jwt.claims', jsonb_build_object('sub', v_admin)::text, false);
      raise;
  end;

  -- إعادة هوية المشرف لبقية الملف
  perform set_config('request.jwt.claim.sub', v_admin::text, false);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_admin)::text, false);

  raise notice '✔ (ي) الأدوار: المتعهد صفر مسودة وصفر كتابة · ops read-only يقرأ بالإسقاط ولا ينشر · والمشرف يقرأ ويكتب وينشر';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ك) الابن لا يُرى إن كانت أمُّه مخفيّة — فحصٌ حيّ بدور `anon`
--
-- بلا هذا الشرط: يُخفي المالك كتلة `columns` فتبقى أعمدتها مقروءة، والعارضة
-- لا تجد لها أباً فتعرضها **جذوراً** — أي أن «إخفاء» يزيد ما يُعرض.
-- ----------------------------------------------------------------------------
do $$
declare
  v_admin constant uuid := '0b580000-0000-4000-8000-0000000000a1';
  v_page  constant uuid := '0b580000-0000-4000-8000-000000000401';
  v_cols  constant uuid := '0b580000-0000-4000-8000-000000000423';
  v_kid   constant uuid := '0b580000-0000-4000-8000-000000000424';
  v_n     integer;
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    raise notice '  ↳ (ك) لا دور anon على هذه القاعدة — الفحص متخطّى';
    return;
  end if;

  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claims', '', false);

  begin
    execute 'set local role anon';

    -- (ك-١) شاهد إيجابي: الأمّ ظاهرة ⇒ الابن يصل الزائر
    execute format('select count(*) from public.sections where id = %L', v_kid) into v_n;
    if v_n <> 1 then
      raise exception '(ك-١) الزائر لا يرى ابناً تحت أمٍّ ظاهرة (% صفاً) — الشرط أُغلق أكثر من اللازم', v_n;
    end if;

    execute 'reset role';

    -- نُخفي الأمّ بهوية المشرف
    perform set_config('request.jwt.claim.sub', v_admin::text, false);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', v_admin)::text, false);
    update public.sections set visible = false where id = v_cols;
    perform set_config('request.jwt.claim.sub', '', false);
    perform set_config('request.jwt.claims', '', false);

    execute 'set local role anon';

    -- (ك-٢) 🔒 الأمّ مخفيّة ⇒ الابن محجوب أيضاً
    execute format('select count(*) from public.sections where id = %L', v_kid) into v_n;
    if v_n <> 0 then
      raise exception '(ك-٢) الزائر قرأ ابناً تحت أمٍّ مخفيّة (% صفاً) — «إخفاء» يزيد ما يُعرض', v_n;
    end if;

    -- (ك-٣) وبقية أقسام الصفحة ما زالت تصله — الشرط ضيّق لا شامل
    execute format('select count(*) from public.sections where page_id = %L', v_page) into v_n;
    if v_n <> 1 then
      raise exception '(ك-٣) الزائر يرى % قسماً من الصفحة — توقعنا الجذر الظاهر وحده', v_n;
    end if;

    execute 'reset role';
  exception
    when others then
      execute 'reset role';
      perform set_config('request.jwt.claim.sub', v_admin::text, false);
      perform set_config('request.jwt.claims', jsonb_build_object('sub', v_admin)::text, false);
      raise;
  end;

  perform set_config('request.jwt.claim.sub', v_admin::text, false);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_admin)::text, false);

  raise notice '✔ (ك) الابن يتبع ظهور أمّه: يصل الزائر إن ظهرت، ويُحجب إن أُخفيت، وبقية الصفحة سليمة';
end;
$$;

-- ----------------------------------------------------------------------------
-- (م) 🔴 م‑٧ — وسائط العنصر **خارج** فهرس الترجمة، و`alt` و`href` **داخله**
--
-- هذا هو الفحص الذي تقوم عليه المرحلة كلها. وسببه مقيس: بعد `0064` كان
-- «‎/img/hero-chauffeur.avif» صفّاً حيّاً في طابور المترجم، لأن الفهرس لا يقرأ
-- `block_registry` ولا `text_fields` — يقرأ **كل مفتاحٍ قيمتُه نصّ**. وترجمة
-- المسار تُطبَّق فعلاً (‏`i18n_apply` تستبدل بالاسم)، فتختفي الصورة بلا خطأ
-- ولا سجل، و`safeMediaSrc` لا تنقذ: «‎/img/سائق.avif» مسارٌ داخلي سليم.
--
-- ⚠ **ونصفُه الثاني هو الذي يُنسى:** إغلاقُ الباب على المسارات يجب ألا يبتلع
--   `alt` — نصٌّ يُقرأ بصوتٍ عالٍ لمن لا يرى ويفهرسه جوجل. فالفحص في اتجاهين.
-- ----------------------------------------------------------------------------
do $$
declare
  v_page constant uuid := '0b580000-0000-4000-8000-000000000601';
  v_sec  constant uuid := '0b580000-0000-4000-8000-000000000602';
  /** 🆕 ن‑٩ — صفُّ شعاراتٍ على الصفحة نفسها، فتُقاس الكتلتان بحارسٍ واحد */
  v_logo constant uuid := '0b580000-0000-4000-8000-000000000603';
  v_f       text;
  v_bad     text;
  v_n       integer;
  v_applied jsonb;
begin
  -- (م-١) `i18n_non_text_field` = `NON_TEXT_FIELD_NAMES` — **بالنداء الحيّ**
  --       لا بمطابقة نصّ الدالة (القاعدة الذهبية ١٩)
  -- ⚠ و`anchor` خامسها منذ م‑١٠ (`0068`): مرساة البند معرّفٌ يُكتب في الرابط،
  --   و«ترجمتها» تُطبَّق فعلاً — فيصير `#cancellation` عربياً على `/en` وحدها،
  --   **وكل رابطٍ أُرسل يهبط في أول الصفحة** بلا ٤٠٤ ولا خطأ ولا سطرٍ في سجل.
  foreach v_f in array array['src', 'poster', 'video', 'icon', 'anchor'] loop
    if not public.i18n_non_text_field(v_f) then
      raise exception '(م-١) «%» في NON_TEXT_FIELD_NAMES ولا تحجبه القاعدة', v_f;
    end if;
    if not public.i18n_reserved_content_key(v_f) then
      raise exception '(م-١) «%» محجوب في الورقة ولا يصل الاتحاد — الفهرس ما زال يفهرسه', v_f;
    end if;
  end loop;

  -- والاتجاه الآخر — وهو ما يمنع أن يتوسّع الحجز على نثرٍ يقوله إنسان.
  -- و`num` و`c1` و`h1` من م‑١٠ فيه: رقم البند وخلايا الجدول وعناوين أعمدته
  -- **نصوصٌ تُقرأ وتختلف صيغتها باللغة** («٤» ⇐ «4»)، فحجزُها يجمّد الجدول
  -- كله على لغةٍ واحدة في اللغتين.
  foreach v_f in array array['alt', 'imageAlt', 'href', 'name', 'label', 'value', 'title', 'text',
                             'num', 'c1', 'h1', 'body', 'note'] loop
    if public.i18n_non_text_field(v_f) then
      raise exception '(م-١) «%» حُجز وهو جملةٌ تُقال أو وجهةٌ تختلف باللغة', v_f;
    end if;
  end loop;

  -- والمحجوزان القديمان لم يسقطا مع التوسعة (`_k` عنوانُ العنصر · `style` تنسيق)
  if not (public.i18n_reserved_content_key('_k') and public.i18n_reserved_content_key('style')) then
    raise exception '(م-١) `_k`/`style` سقطا من المفاتيح المحجوزة بعد التوسعة';
  end if;

  -- (م-٢) 🔴 الشاهد **الحيّ**: عنصرٌ على صفحةٍ منشورة يحمل صورةً وأيقونة ونصّاً بديلاً
  insert into public.pages (id, slug, kind, title, meta, published, sort)
  values (v_page, '0b58-item-media', 'landing', 'فحص وسائط العنصر',
          '{"title":null,"description":"فحص وسائط العنصر"}'::jsonb, true, 994);

  insert into public.sections (id, page_id, type, content, sort, visible)
  values (v_sec, v_page, 'route-rail', jsonb_build_object(
    'title', 'مسارات الفحص',
    'items', jsonb_build_array(jsonb_build_object(
      '_k',   'm7prb1',
      'name', 'القاهرة ← الفحص',
      'href', '/routes/0b58-probe',
      'src',  '/img/0b58-probe.avif',
      'alt',  'وصفٌ عربي لصورة بطاقة الفحص',
      'icon', 'route'))
  ), 0, true);

  -- (أ) ولا واحدٌ من الوسائط في الفهرس
  select string_agg(c.k, ', ') into v_bad
  from public.i18n_corpus_rows() c
  where c.k like v_sec::text || '.%'
    and public.i18n_non_text_field(
          split_part(c.k, '.', array_length(string_to_array(c.k, '.'), 1)));
  if v_bad is not null then
    raise exception '(م-٢أ) صورةُ عنصرٍ أو أيقونتُه دخلت فهرس الترجمة: %', v_bad;
  end if;

  -- (ب) و`alt` **داخله بقيمته** — لا وجودُ المفتاح وحده
  select count(*) into v_n
  from public.i18n_corpus_rows() c
  where c.k = v_sec::text || '.items.m7prb1.alt'
    and c.src = 'وصفٌ عربي لصورة بطاقة الفحص';
  if v_n <> 1 then
    raise exception '(م-٢ب) نصّ العنصر البديل ليس في الفهرس — الحجب ابتلع نصّاً يُقرأ بصوتٍ عالٍ';
  end if;

  -- (ج) و`href` باقٍ بقرارٍ مكتوب: الوجهة تختلف بالفعل باختلاف اللغة (D-24)
  if not exists (
    select 1 from public.i18n_corpus_rows() c
    where c.k = v_sec::text || '.items.m7prb1.href') then
    raise exception '(م-٢ج) `href` سقط من الفهرس — وهو قرارٌ مكتوب لا عرَض';
  end if;

  -- (م-٣) والحجب في **التطبيق** كما في الفهرس — بابان، وإغلاق أحدهما لا يغلق الآخر
  select public.i18n_apply(s.content, v_sec::text, jsonb_build_object(
           v_sec::text || '.items.m7prb1.src',  '/img/HIJACKED.avif',
           v_sec::text || '.items.m7prb1.icon', 'plane',
           v_sec::text || '.items.m7prb1.alt',  'english alt'))
    into v_applied
  from public.sections s where s.id = v_sec;

  if v_applied -> 'items' -> 0 ->> 'src' <> '/img/0b58-probe.avif' then
    raise exception '(م-٣) i18n_apply استبدلت صورة العنصر — %',
      v_applied -> 'items' -> 0 ->> 'src';
  end if;
  if v_applied -> 'items' -> 0 ->> 'icon' <> 'route' then
    raise exception '(م-٣) i18n_apply استبدلت أيقونة العنصر';
  end if;
  if v_applied -> 'items' -> 0 ->> 'alt' <> 'english alt' then
    raise exception '(م-٣) نصّ العنصر البديل لم يُترجَم — والإتاحة سقطت مع المسارات';
  end if;

  /* ------------------------------------------------------------------------
     (م-٤) 🆕 **ن‑٩ — شعارُ الماركة يمرّ من نفس البابين، على `logo-strip` نفسها.**

     وهذا **توسيعٌ لهذا الشاهد لا فحصٌ ثانٍ بجانبه** (القاعدة الذهبية ١٢):
     الحجب بالاسم عالميٌّ في `i18n_non_text_field`، فلو كُتب فحصٌ مستقل لكتلة
     الشعارات لصارت نسختان من القاعدة تنحرفان يوم تُضاف كتلةٌ ثالثة تحمل صوراً.

     🔴 **ولماذا لا يُغني عنه صفُّ `route-rail` أعلاه؟** لأن ما يُقاس هنا شيءٌ
     آخر: أن **الكتلة التي كانت بيانات نظام** صارت تمرّ من الحارس نفسه بعد
     `0087`. وصفٌّ في `block_registry` قد يُعلَن صحيحاً والمحتوى الحيّ يحمل
     الشكل القديم — فالشاهد على المحتوى لا على الإعلان.
     ------------------------------------------------------------------------ */
  insert into public.sections (id, page_id, type, content, sort, visible)
  values (v_logo, v_page, 'logo-strip', jsonb_build_object(
    'title',     'ماركات الفحص',
    -- 🆕 `0101` — تسميةُ القائمة تُكتب في المحتوى، وهو ما لم يكن ممكناً قبلها
    'listLabel', 'تسميةُ فحصٍ للقائمة',
    'items', jsonb_build_array(jsonb_build_object(
      '_k',   'n9lgo1',
      'name', 'مرسيدس',
      'src',  '/brands/0b58-probe.svg',
      'href', '/routes/0b58-probe'))
  ), 1, true);

  -- (أ) ولا مسارَ شعارٍ في الفهرس
  select string_agg(c.k, ', ') into v_bad
  from public.i18n_corpus_rows() c
  where c.k like v_logo::text || '.%'
    and public.i18n_non_text_field(
          split_part(c.k, '.', array_length(string_to_array(c.k, '.'), 1)));
  if v_bad is not null then
    raise exception '(م-٤أ) مسارُ شعار ماركةٍ دخل فهرس الترجمة: %', v_bad;
  end if;

  -- (ب) و**اسم الماركة داخله بقيمته** — وهو مكسبٌ لا حراسة: كان مجمَّداً على
  --     العربية في اللغتين حين كان في `site_settings` (‏٦ صفوف `settings` وحدها،
  --     ولا واحد منها اسمُ ماركة). فصفر صفوفٍ هنا يعني أن النقل لم يفتح ترجمتها.
  select count(*) into v_n
  from public.i18n_corpus_rows() c
  where c.k = v_logo::text || '.items.n9lgo1.name'
    and c.src = 'مرسيدس';
  if v_n <> 1 then
    raise exception '(م-٤ب) اسم الماركة ليس في الفهرس — النقل لم يفتح ترجمته';
  end if;

  -- (ج) 🔴 و`disclaimer` **لا مكان له**: حُذف من الكتالوج بقرار المالك (`0087`)،
  --     فمفتاحٌ بهذا الاسم في الفهرس يعني صفّاً حيّاً يحمل حقلاً محذوفاً.
  if exists (
    select 1 from public.i18n_corpus_rows() c
    where c.k like '%.disclaimer'
  ) then
    raise exception '(م-٤ج) مفتاح disclaimer ما زال في الفهرس — الحقل محذوف بقرارٍ لا معطَّل';
  end if;

  /* ------------------------------------------------------------------------
     (م-٥) 🆕 **`0101` — تسمية القائمة يجب أن تكون قابلةً للتحكّم من اللوحة،
     لا مجرد عمودٍ في السجل لا يبلغه أحد.**

     🔴 **والفحص يقيس البوابتين اللتين يقع بينهما العطب، لأن واحدةً منهما لا
     تكفي — وقد كان العطبُ في الثانية بالضبط:**

       (أ) `text_fields` تعلن الحقل  ⇒ اللوحة ترسم له خانة (‏`BlockFields`
           تحلق على `def.textFields` حرفاً، ولا تعرض ما لا يُعلَن).
       (ب) والفهرس يقبل قيمتَه       ⇒ التسمية تُترجَم فلا تبقى عربيةً على `/en`.

     ⚠ **وما لا تستطيع مجموعةُ SQL قياسه يُقال صراحةً بدل تركه يُفهم خطأً:** أن
       **العارضة** تقرأ `content.listLabel` سطرٌ في TSX لا في القاعدة — وهو
       الطرفُ الذي كان مكسوراً وحده قبل `0101`. فحرسُه `npx tsc` (‏الحقل معلَنٌ
       في `SectionContentMap`) والنظرُ في المتصفح، **ومجموعةٌ خضراء هنا ليست
       شهادةً عليه** (‏الدرس المكتوب: مجموعةٌ كاملة مرّت على حارسٍ مكسور لأن
       تأكيداتها كتبت شكلاً لا يكتبه التطبيق).
     ------------------------------------------------------------------------ */
  -- (م-٥أ) الحقل معلَنٌ **بترتيبه**، فاللوحة ترسم له خانة في موضعها
  select count(*) into v_n
  from public.block_registry
  where type = 'logo-strip' and text_fields = array['title', 'listLabel', 'note'];
  if v_n <> 1 then
    raise exception '(م-٥أ) logo-strip.text_fields ليست {title,listLabel,note} — لا خانة في اللوحة لتسمية القائمة';
  end if;

  -- (م-٥ب) والقيمة المكتوبة **في الفهرس بقيمتها** — وهذا هو التأكيد الذي يفشل
  --        على السلوك القديم: قبل `0101` لا مفتاح `listLabel` في أي صفّ محتوى
  --        إطلاقاً، لأن التسمية كانت في الكود لا في القاعدة.
  select count(*) into v_n
  from public.i18n_corpus_rows() c
  where c.k = v_logo::text || '.listLabel'
    and c.src = 'تسميةُ فحصٍ للقائمة';
  if v_n <> 1 then
    raise exception '(م-٥ب) تسمية القائمة ليست في الفهرس بقيمتها — تبقى عربيةً على الصفحة الإنجليزية';
  end if;

  -- (م-٥ج) و`i18n_apply` **تستبدلها فعلاً** — الفهرس بابٌ والتطبيق بابٌ آخر،
  --        وإغلاق أحدهما لا يشهد على الثاني (نفس مذهب (م-١..٤) أعلاه).
  select public.i18n_apply(s.content, v_logo::text, jsonb_build_object(
           v_logo::text || '.listLabel', 'Car makes'))
    into v_applied
  from public.sections s where s.id = v_logo;
  if v_applied ->> 'listLabel' <> 'Car makes' then
    raise exception '(م-٥ج) تسمية القائمة لم تُترجَم في التطبيق — %', v_applied ->> 'listLabel';
  end if;

  delete from public.pages where id = v_page;

  raise notice '✔ (م-١..٥) وسائط العنصر والشعار خارج الفهرس وخارج التطبيق، و`alt`/`href`/`name`/`listLabel` داخلها';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ن) 🔴 م‑١٠ — المرساة **خارج** الفهرس، ورقمُ البند وخلايا الجدول **داخله**
--
-- هذا هو الفحص الذي يقوم عليه قرار المرساة. وعلّته من جنس علّة (م) نفسها:
-- الفهرس لا يقرأ `block_registry` ولا `text_fields` — يفهرس **كل مفتاحٍ قيمتُه
-- نصّ** — و`i18n_apply` تستبدل بالاسم. فلو بقي `anchor` نصّاً عادياً لرآه
-- المترجم `cancellation` فكتب «الإلغاء»، ولصار `id` البند على `/en` عربياً:
-- **كل رابطٍ أرسله المالك أو فريقه لعميل يهبط في أول الصفحة**، بلا ٤٠٤ ولا
-- خطأ ولا سطرٍ في أي سجل — وهو النمط ٣ في `LESSONS.md`.
--
-- ⚠ **والنصف الثاني هو الذي يُنسى** (كما في `alt` هناك): إغلاق الباب على
--   المرساة يجب ألا يبتلع `num` ولا خلايا `c1..c4` — «٤ ⇐ 4» و«قبل ٤٨ ساعة ⇐
--   48h or more» نصوصٌ تُقرأ وتختلف صيغتها باللغة. فالفحص في اتجاهين.
-- ----------------------------------------------------------------------------
do $$
declare
  v_page    constant uuid := '0b580000-0000-4000-8000-000000000701';
  v_clause  constant uuid := '0b580000-0000-4000-8000-000000000702';
  v_table   constant uuid := '0b580000-0000-4000-8000-000000000703';
  v_bad     text;
  v_f       text;
  v_n       integer;
  v_applied jsonb;
begin
  insert into public.pages (id, slug, kind, title, meta, published, sort)
  values (v_page, '0b58-doc-blocks', 'landing', 'فحص كتل المستندات',
          '{"title":null,"description":"فحص كتل المستندات"}'::jsonb, true, 993);

  insert into public.sections (id, page_id, type, content, sort, visible)
  values
    (v_clause, v_page, 'clause', jsonb_build_object(
      'num',    '٤',
      'title',  'الإلغاء والاسترداد',
      'body',   'يُستردّ كامل المبلغ قبل ٤٨ ساعة من موعد التحرك.',
      'anchor', 'cancellation'
    ), 0, true),
    (v_table, v_page, 'table', jsonb_build_object(
      'title', 'نوافذ الإلغاء',
      'h1',    'موعد الإلغاء',
      'h2',    'ما يُستردّ',
      'items', jsonb_build_array(jsonb_build_object(
        '_k', 'm10tb1', 'c1', 'قبل ٤٨ ساعة', 'c2', 'المبلغ كاملاً'))
    ), 1, true);

  -- (ن-١) المرساة ليست في الفهرس — بأي صيغةٍ من صيغتيه
  select string_agg(c.k, ', ') into v_bad
  from public.i18n_corpus_rows() c
  where c.k like v_clause::text || '.%'
    and split_part(c.k, '.', array_length(string_to_array(c.k, '.'), 1)) = 'anchor';
  if v_bad is not null then
    raise exception '(ن-١) مرساة البند دخلت فهرس الترجمة: % — الروابط المرسلة تنكسر على /en', v_bad;
  end if;

  -- (ن-٢) 🔴 شاهدٌ **إيجابي**: الصفّ يحمل المفتاح فعلاً وقيمتُه نصّ. وبلا هذا
  --       يكون «صفر صفوف» إثباتَ فراغٍ لا إثباتَ حراسة (الذهبية ١٩).
  select count(*) into v_n
  from public.sections s
  where s.id = v_clause
    and jsonb_typeof(s.content -> 'anchor') = 'string'
    and s.content ->> 'anchor' = 'cancellation';
  if v_n <> 1 then
    raise exception '(ن-٢) لا شاهد حيّ على الحجب — الصفّ لا يحمل مرساةً نصّية أصلاً';
  end if;

  -- (ن-٣) ورقمُ البند وعنوانه ونصّه **داخل الفهرس بقيمها**
  foreach v_f in array array['num', 'title', 'body'] loop
    if not exists (
      select 1 from public.i18n_corpus_rows() c
      where c.k = v_clause::text || '.' || v_f) then
      raise exception '(ن-٣) «%» سقط من فهرس البند — الحجب ابتلع نصّاً يُقرأ', v_f;
    end if;
  end loop;

  -- (ن-٤) وخلايا الجدول مفهرسةٌ **خليةً خليةً** بمفتاح العنصر الثابت — وهو ما
  --       يجعل جدولاً مترجَماً ممكناً أصلاً: صفٌّ في حقلٍ واحد بفواصل يُترجَم
  --       كتلةً واحدة ويعود بأعمدةٍ مبعثرة.
  select count(*) into v_n
  from public.i18n_corpus_rows() c
  where c.k in (v_table::text || '.items.m10tb1.c1',
                v_table::text || '.items.m10tb1.c2',
                v_table::text || '.h1',
                v_table::text || '.h2');
  if v_n <> 4 then
    raise exception '(ن-٤) خلايا الجدول وعناوين أعمدته في الفهرس % لا ٤', v_n;
  end if;

  -- (ن-٥) والحجب في **التطبيق** كما في الفهرس — بابان، وإغلاق أحدهما لا يغلق الآخر
  select public.i18n_apply(s.content, v_clause::text, jsonb_build_object(
           v_clause::text || '.anchor', 'الإلغاء',
           v_clause::text || '.num',    '4',
           v_clause::text || '.title',  'Cancellation & refunds'))
    into v_applied
  from public.sections s where s.id = v_clause;

  if v_applied ->> 'anchor' <> 'cancellation' then
    raise exception '(ن-٥) i18n_apply استبدلت المرساة — %', v_applied ->> 'anchor';
  end if;
  if v_applied ->> 'num' <> '4' or v_applied ->> 'title' <> 'Cancellation & refunds' then
    raise exception '(ن-٥) رقم البند أو عنوانه لم يُترجَم';
  end if;

  -- (ن-٦) والبوابة تفرز الأربع كما تفرزها العارضة (‏`blockRenders` مرآتها)
  if public.block_renders('clause', jsonb_build_object('num', '٤'))
     or public.block_renders('table', jsonb_build_object('items', '[]'::jsonb))
     or public.block_renders('callout', jsonb_build_object('title', 'تنبيه')) then
    raise exception '(ن-٦) كتلةٌ ناقصة تمرّ البوابة — ستُنشر صفحةٌ فيها إطارٌ فارغ';
  end if;
  if not (public.block_renders('clause', jsonb_build_object('title', 'الإلغاء'))
          and public.block_renders('page-toc', '{}'::jsonb)) then
    raise exception '(ن-٦) البوابة ترفض شكلاً قانونياً — الحارس يرفض كل شيء';
  end if;

  delete from public.pages where id = v_page;

  raise notice '✔ (ن-١..٦) المرساة خارج الفهرس والتطبيق، ورقم البند وخلايا الجدول داخلهما';
end;
$$;

-- ----------------------------------------------------------------------------
-- (م-٤) الحارس البنيوي بعد التوسعة — خمس قواعد جديدة، **كتابةً حقيقية**
--
-- ⚠ وشاهدٌ إيجابي في آخره شرطٌ لا زينة: بلاه أثبتنا أن الجدول مغلق لا محروس.
-- ----------------------------------------------------------------------------
do $$
declare
  v_case record;
  v_ok   boolean;
  v_hint text;
  v_f    text;
begin
  for v_case in
    select * from (values
      ('اسمٌ غير نصّي خارج القائمة العالمية',
        'content', false, null::integer, array['title']::text[], null::text[], '{}'::text[], array['photo']::text[], null::text[]),
      ('اسمٌ نصّيٌّ وغيرُ نصّي معاً (عليا)',
        'content', false, null, array['src'], null, '{}'::text[], null, null),
      ('اسمٌ نصّيٌّ وغيرُ نصّي معاً (عنصر)',
        'content', false, null, array['title'], array['icon'], '{}'::text[], null, null),
      ('حقلُ عنصرٍ غير نصّي بلا عناصر',
        'content', false, null, array['title'], null, '{}'::text[], null, array['icon']),
      ('صورةُ عنصرٍ بلا موضعٍ لنصّها البديل',
        'content', false, null, array['title'], array['name'], '{}'::text[], null, array['src']),
      ('قائمةٌ غير نصّية فارغة لا null',
        'content', false, null, array['title'], null, '{}'::text[], '{}'::text[], null),
      ('إلزاميٌّ غير نصّي لا تعلنه الكتلة',
        'content', false, null, array['title'], null, array['src'], null, null),
      ('تخطيطٌ يحمل وسائط',
        'layout',  true,  3,    '{}'::text[],   null, '{}'::text[], array['src'], null)
    ) as t(label, role, accepts, maxc, tf, itf, rf, ntf, ntif)
  loop
    v_ok := false; v_hint := null;
    begin
      insert into public.block_registry
        (type, role, placement, accepts_children, max_children,
         text_fields, item_fields, required_fields, non_text_fields, non_text_item_fields)
      values ('0b58-m7probe', v_case.role, 'any', v_case.accepts, v_case.maxc,
              v_case.tf, v_case.itf, v_case.rf, v_case.ntf, v_case.ntif);
      v_ok := true;
    exception when others then get stacked diagnostics v_hint = pg_exception_hint;
    end;

    if v_ok then
      delete from public.block_registry where type = '0b58-m7probe';
      raise exception '(م-٤) قُبل شكلٌ غير قانوني في الكتالوج: %', v_case.label;
    end if;
    if v_hint is distinct from 'block-registry-shape' then
      raise exception '(م-٤) «%» رُفض بـ[%] لا بـblock-registry-shape',
        v_case.label, coalesce(v_hint, '∅');
    end if;
  end loop;

  -- شاهدٌ إيجابي: صورةُ عنصرٍ **بنصّها البديل** تُكتب فعلاً
  insert into public.block_registry
    (type, role, placement, accepts_children, max_children,
     text_fields, item_fields, required_fields, non_text_fields, non_text_item_fields)
  values ('0b58-m7probe', 'content', 'any', false, null,
          array['title'], array['name', 'alt'], array['items'], null, array['src', 'icon']);
  if not exists (select 1 from public.block_registry where type = '0b58-m7probe') then
    raise exception '(م-٤) الشكل القانوني لم يُكتب — الحارس يرفض كل شيء';
  end if;
  delete from public.block_registry where type = '0b58-m7probe';

  -- (م-٥) قائمة الأيقونات في القاعدة = `ITEM_ICON_NAMES` في العقد §٤
  foreach v_f in array array['plane', 'building', 'route', 'landmark', 'party', 'mic',
                             'shield', 'check', 'clock', 'wallet', 'star', 'headset',
                             'car', 'bus', 'users', 'luggage', 'mapPin', 'phone'] loop
    if not public.item_icon_allowed(v_f) then
      raise exception '(م-٥) الأيقونة «%» في العقد ولا تقبلها القاعدة', v_f;
    end if;
  end loop;

  -- والاتجاه الآخر: ما يكتبه مالكٌ بيده يُرفض — وهو سبب القائمة المغلقة أصلاً
  foreach v_f in array array['Plane', 'plane-takeoff', 'طائرة', '', 'ghost'] loop
    if public.item_icon_allowed(v_f) then
      raise exception '(م-٥) القاعدة قبلت اسم أيقونة خارج القائمة: «%»', v_f;
    end if;
  end loop;
  if public.item_icon_allowed(null) then
    raise exception '(م-٥) القاعدة قبلت null أيقونةً';
  end if;

  raise notice '✔ (م-٤..٥) الحارس يرفض ثمانية أشكالٍ غير مقنَّنة ويقبل القانوني، وقائمة الأيقونات مغلقة';
end;
$$;

-- ----------------------------------------------------------------------------
-- (س) 🔴 `0082` — **عنصرٌ يُكتب بلا مفتاح ثابت صالح وفريد: شكلٌ لا يُكتب**
--
-- ── العطب الذي وُلد منه هذا الفحص، مقيساً لا متوقَّعاً (2026-08-17) ─────────
--
-- المالك حرّر الجُمل المتناوبة في بطل الرئيسية فرُفض حفظه بـ`item-key`، وكتلة
-- البطل مفاتيحها سليمة: الرفض جاء من ثلاث كتلٍ أخرى على الصفحة نفسها عناصرها
-- **بلا `_k` إطلاقاً**. وخمسة صفوف حيّة كانت كذلك، منها صفٌّ كتبته `0062`
-- بمفاتيحه ثم سُلبت منه — فالمحرر القديم كان يُسقط `_k` وهو يرسم نموذجه.
--
-- 🔒 **ولماذا الحارس في القاعدة لا في `validateBlocks`:** الرفض في TypeScript
-- كان قائماً **طوال** الوقت الذي وقع فيه العطب — ولم يمنعه، لأن الكاتب الذي
-- سلب المفاتيح محرّرٌ آخر لا يمرّ عليه. ومنعُ الشكل حيث لا يُتخطى هو نفس مذهب
-- `sections_guard_depth` في `0058` §(٩)، ونفس مذهب العقد §٦: «الشكل غير
-- القانوني لا يُكتب».
--
-- ⚠ وكل حالةٍ أدناه **كتابةٌ حقيقية** لا نداء دالة، ويليها شاهدٌ إيجابي —
--   وإلا أثبتنا أن الجدول مغلق لا محروس.
-- ----------------------------------------------------------------------------
do $$
declare
  v_page constant uuid := '0b580000-0000-4000-8000-000000000801';
  v_sec  constant uuid := '0b580000-0000-4000-8000-000000000802';
  -- صفحةٌ ثانية **خارج** نطاق المسح الذاتي، لتحمل شاهد (س-٦) المزروع
  v_page2 constant uuid := '0b580000-0000-4000-8000-000000000803';
  v_wit   constant uuid := '0b580000-0000-4000-8000-000000000804';
  v_case  record;
  v_ok    boolean;
  v_hint  text;
  v_n     integer;
  v_key   text;
  v_taken text[];
begin
  insert into public.pages (id, slug, kind, title, published, sort) values
    (v_page,  '0b58-itemkeys',     'static', 'فيكسترة مفاتيح العناصر', false, 981),
    (v_page2, '0b58-itemkeys-wit', 'static', 'شاهد مفاتيح العناصر',    false, 980);

  -- (س-١) الأشكال المرفوضة — والحالات الثلاث التي يجمعها الرمز الواحد:
  --       **غائب** · **مخالف للنمط** · **مكرر**
  for v_case in
    select * from (values
      ('بلا مفتاح إطلاقاً (الحالة الواقعة)',
        '{"items":[{"q":"س","a":"ج"}]}'::jsonb,                                'item-key'),
      ('مفتاحٌ فارغ',
        '{"items":[{"_k":"","q":"س"}]}'::jsonb,                                'item-key'),
      ('حروفٌ كبيرة — النمط لاتينيٌّ صغير',
        '{"items":[{"_k":"A1B2C3","q":"س"}]}'::jsonb,                          'item-key'),
      ('خمس خانات لا ست',
        '{"items":[{"_k":"a1b2c","q":"س"}]}'::jsonb,                           'item-key'),
      ('سبع خانات لا ست',
        '{"items":[{"_k":"a1b2c3d","q":"س"}]}'::jsonb,                         'item-key'),
      ('شرطة داخل المفتاح',
        '{"items":[{"_k":"a1b-c3","q":"س"}]}'::jsonb,                          'item-key'),
      ('مفتاحٌ ليس نصّاً',
        '{"items":[{"_k":123456,"q":"س"}]}'::jsonb,                            'item-key'),
      ('🔴 مفتاحان متطابقان — عنوانا ترجمةٍ واحدٌ لعنصرين',
        '{"items":[{"_k":"a1b2c3","q":"س١"},{"_k":"a1b2c3","q":"س٢"}]}'::jsonb, 'item-key'),
      ('واحدٌ مفتاحٌ وواحدٌ بلا — الجزئي مرفوضٌ كالكامل',
        '{"items":[{"_k":"a1b2c3","q":"س١"},{"q":"س٢"}]}'::jsonb,              'item-key'),
      ('items كائنٌ لا مصفوفة',
        '{"items":{"q":"س"}}'::jsonb,                                          'template-shape'),
      ('عنصرٌ نصٌّ لا كائن',
        '{"items":["س"]}'::jsonb,                                              'template-shape'),
      ('عنصرٌ مصفوفةٌ متداخلة',
        '{"items":[["س"]]}'::jsonb,                                            'template-shape')
    ) as t(label, content, expected_hint)
  loop
    v_ok := false; v_hint := null;
    begin
      insert into public.sections (page_id, type, content, sort, visible)
      values (v_page, 'faq', v_case.content, 0, true);
      v_ok := true;
    exception when others then get stacked diagnostics v_hint = pg_exception_hint;
    end;

    if v_ok then
      delete from public.sections where page_id = v_page;
      raise exception '(س-١) قُبل شكلٌ غير قانوني في العناصر: %', v_case.label;
    end if;
    if v_hint is distinct from v_case.expected_hint then
      raise exception '(س-١) «%» رُفض بـ[%] لا بـ[%]',
        v_case.label, coalesce(v_hint, '∅'), v_case.expected_hint;
    end if;
  end loop;

  -- (س-٢) شاهدٌ إيجابي — الشكل القانوني يُكتب فعلاً، وقائمةٌ فارغة تمرّ
  --       (كتلةٌ قيد البناء لا شيء يُعاد ترتيبه فيها فلا شيء يُكسر)
  insert into public.sections (id, page_id, type, content, sort, visible)
  values (v_sec, v_page, 'faq',
          '{"items":[{"_k":"a1b2c3","q":"س١","a":"ج١"},{"_k":"z9y8x7","q":"س٢","a":"ج٢"}]}'::jsonb,
          0, true);
  if not exists (select 1 from public.sections where id = v_sec) then
    raise exception '(س-٢) الشكل القانوني لم يُكتب — الحارس يرفض كل شيء';
  end if;

  insert into public.sections (page_id, type, content, sort, visible)
  values (v_page, 'faq', '{"items":[]}'::jsonb, 1, true);

  -- (س-٣) 🔴 **اتجاه التحديث — وهو الاتجاه الذي وقع فعلاً.**
  --       العطب لم يكن إدراج صفٍّ جديد بلا مفاتيح، بل **سلبَ** مفاتيح صفٍّ
  --       قائم عند الحفظ. فحارسٌ على الإدراج وحده كان سيمرّره حرفاً.
  v_ok := false; v_hint := null;
  begin
    update public.sections
       set content = '{"items":[{"q":"س١","a":"ج١"},{"q":"س٢","a":"ج٢"}]}'::jsonb
     where id = v_sec;
    v_ok := true;
  exception when others then get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if v_ok then
    raise exception '(س-٣) قُبل تحديثٌ يسلب المفاتيح — وهو بعينه ما أصاب خمسة صفوف حيّة';
  end if;
  if v_hint is distinct from 'item-key' then
    raise exception '(س-٣) سلبُ المفاتيح رُفض بـ[%] لا بـitem-key', coalesce(v_hint, '∅');
  end if;

  -- والتحديث الذي لا يمسّ المحتوى يمرّ بلا ثمن (إعادة الترتيب تحدّث `sort` وحده)
  update public.sections set sort = 5 where id = v_sec;

  -- (س-٤) 🔬 **الطفرة ٣ — إثباتٌ أن التأكيد حيّ لا أنه يمرّ لسببٍ آخر.**
  --       يُعطَّل الحارس، ويُكتب **نفس** الشكل المرفوض أعلاه فينجح، ثم يُعاد
  --       تشغيله فيُرفض ثانيةً. «فحصٌ لا يمكن أن يفشل هو زينة» (النمط ٩).
  alter table public.sections disable trigger sections_guard_item_keys;

  v_ok := false;
  begin
    update public.sections
       set content = '{"items":[{"q":"س١","a":"ج١"},{"q":"س٢","a":"ج٢"}]}'::jsonb
     where id = v_sec;
    v_ok := true;
  exception when others then null;
  end;

  alter table public.sections enable trigger sections_guard_item_keys;

  if not v_ok then
    raise exception '(س-٤) الطفرة: الكتابة فشلت والحارس معطَّل — الرفض في (س-٣) لم يكن من هذا الحارس';
  end if;
  if public.items_key_check((select content -> 'items' from public.sections where id = v_sec))
     is distinct from 'item-key' then
    raise exception '(س-٤) الطفرة لم تكتب الشكل المخالف — فلا شيء أثبتته';
  end if;

  -- ويعود الصفّ إلى شكله القانوني، والحارس شغّالٌ الآن فالكتابة نفسها إثبات
  update public.sections
     set content = '{"items":[{"_k":"a1b2c3","q":"س١","a":"ج١"},{"_k":"z9y8x7","q":"س٢","a":"ج٢"}]}'::jsonb
   where id = v_sec;

  select count(*) into v_n
  from pg_trigger
  where tgrelid = 'public.sections'::regclass
    and tgname = 'sections_guard_item_keys'
    and tgenabled = 'O';
  if v_n <> 1 then
    raise exception '(س-٤) الحارس لم يعُد إلى حالته بعد الطفرة — الفحص ترك القاعدة أضعف مما وجدها';
  end if;

  -- (س-٥) السكّاك: ست خانات من `[a-z0-9]`، ولا يصادم ما هو محجوز
  for v_n in 1..40 loop
    v_key := public.mint_item_key(array['a1b2c3']);
    if v_key !~ '^[a-z0-9]{6}$' then
      raise exception '(س-٥) mint_item_key أخرج «%» وهو خارج النمط', v_key;
    end if;
    if v_key = 'a1b2c3' then
      raise exception '(س-٥) mint_item_key أعاد مفتاحاً محجوزاً — التصادم عنوانا ترجمةٍ واحد';
    end if;
    v_taken := coalesce(v_taken, '{}') || v_key;
  end loop;
  if (select count(distinct x) from unnest(v_taken) x) < 35 then
    raise exception '(س-٥) السكّ يكرر نفسه — % مفتاحاً متمايزاً من ٤٠',
      (select count(distinct x) from unnest(v_taken) x);
  end if;

  -- (س-٦) 🔴 **حالة القاعدة الحيّة**: لا صفَّ واحداً يرفضه الحكم.
  --       وهذا هو التأكيد الذي كان غيابُه يعني أن المالك يكتشف العطب بنفسه.
  select count(*) into v_n
  from public.sections s
  where s.page_id <> v_page
    and public.items_key_check(s.content -> 'items') is not null;
  if v_n <> 0 then
    raise exception '(س-٦) % صفاً حيّاً عناصره بلا مفاتيح صالحة — المنشئ يرفض حفظ صفحاتها', v_n;
  end if;

  -- وشاهدٌ إيجابي على (س-٦): الصفر أعلاه ليس لأن لا شيء يحمل عناصر
  --
  -- 🔴 وكان هذا الشاهد `v_n < 50` — أي **تعداداً لمحتوى المالك**: `sections` أكثر
  --    الجداول تحريراً، وحذفُ صفحاتٍ حتى ينزل العدد دون الخمسين كان يُحمّر مجموعةً
  --    ولا شيء انكسر. والشاهد الآن **مزروع**: صفٌّ نعرفه بعينه، فالحكم على المسح
  --    لا على حجم القاعدة (وهو النمط ٦ في `LESSONS.md`).
  insert into public.sections (id, page_id, type, content, sort, visible)
  values (v_wit, v_page2, 'faq',
          '{"items":[{"_k":"s6wit1","q":"شاهد","a":"مزروع"}]}'::jsonb, 0, true);

  select count(*) into v_n
  from public.sections s
  where s.page_id <> v_page
    and jsonb_typeof(s.content -> 'items') = 'array'
    and jsonb_array_length(s.content -> 'items') > 0;
  if v_n < 1 then
    raise exception '(س-٦) شاهدٌ إيجابي غائب — المسح لا يرى الصفَّ المزروع نفسه (% صفاً)', v_n;
  end if;

  -- والصفر أعلاه ما زال صفراً **والشاهد قائم**: أي أن المسح يقرأ ولا يعمى
  if public.items_key_check(
       (select s.content -> 'items' from public.sections s where s.id = v_wit)) is not null then
    raise exception '(س-٦) الصفّ المزروع نفسه يرفضه الحكم — الفيكسترة معطوبة لا المنتج';
  end if;

  delete from public.sections where page_id = v_page;

  raise notice '✔ (س-١..٦) العنصر بلا مفتاح صالح فريد لا يُكتب — إدراجاً وتحديثاً · والقانوني يمرّ · 🔬 والطفرة ٣ تثبت أن الحارس هو الرافض · و% صفاً يحمل عناصر (منها شاهدٌ مزروع) كلها مفتاحة', v_n;
end;
$$;

-- ----------------------------------------------------------------------------
-- (ع) 🔴 `0092` — **لقطةٌ قديمة لا تمحو عناصر كتبتها هجرة، والنشرة لا تُحبَس**
--
-- ── العطب كما قِيس حيّاً (2026-08-17)، لا كما يُتوقَّع ──────────────────────
--
-- `0087` رحّلت عشر ماركات إلى `sections.content->'items'` في 08:32:31Z، ثم نُشرت
-- الرئيسية من المنشئ أربع مرّات (‏08:34:56 · 08:43:07 · 08:44:21 · 08:46:36)
-- فعادت `items` إلى الغياب في كل مرة. والسببُ **قاعدةٌ لم تكن مكتوبة**: النشر
-- يُعيد تشغيل لقطةً، ولقطةُ المسودة تُؤخذ لحظة فتح المنشئ — فما كتبته هجرةٌ بعدها
-- تمحوه خطوةُ (ج) وهي تكتب `content` جملةً واحدة.
--
-- 🔒 **والخسارة في العنوان لا في النصّ**: كل عنصر يحمل `_k` وهو عنوان ترجمته
--    (‏`0059`). فمحوُ `items` **يُيتّم مفاتيح الترجمة**، ولا يُستعاد ما ضاع منها
--    بإعادة الكتابة — العناصر الجديدة تُسكّ لها مفاتيح أخرى.
--
-- ⚠ **ولم يمسكه حارسٌ قائم.** `sections_guard_item_keys` مربوطٌ على الجدول ويفحص
--    كل كتابة بما فيها هذه — لكنه يرفض `items` **مخالفةً**، و`items` **غائبة**
--    شكلٌ قانوني (`items_key_check(null) ⇒ null`). ولم تمسكه عينٌ أيضاً: العارضة
--    تسقط إلى `settings.fleetBrands` فظلّ الشريط يعرض عشرة شعارات صحيحة **بينما
--    التحرير من اللوحة مطفأ**. الاحتياطي أنقذ الصفحة وأخفى العطل.
--
-- ── ما يقيسه هذا القسم ──────────────────────────────────────────────────────
--
--   (ع-١) 🔒 **النشر ينجح** — وهذا نصف الاختبار لا زينته: حارسٌ يمنع المالك من
--         نشر محتواه أسوأ من الانحراف الذي يمنعه.
--   (ع-٢) والعناصر نجت **بمفاتيحها وبترتيبها** لا بعددها.
--   (ع-٣) وعنوانُ ترجمة العنصر ما زال في الفهرس وترجمتُه المنشورة حيّة.
--   (ع-٤) واللقطة المخزَّنة نفسها صُولحت — وإلا عادت الشاشة تُقدّم شكلاً يمحوها.
--   (ع-٥) 🔴 **والحدّ الفاصل: `"items": []` إرادةُ مالكٍ فتنفُذ.** بلا هذا التأكيد
--         يكون الحارس قد أطفأ الحذف بدل أن يمنع المحو.
--   (ع-٦) 🔬 **الطفرة ٤** — يُعطَّل المُصالِح ويُعاد المشهد نفسه، فيُثبَت أن ما
--         نجا في (ع-٢) نجا **به** لا بشيءٍ آخر.
--
-- المرجع: supabase/migrations/0092_publish_reconciles_item_keys.sql · D-60
-- ----------------------------------------------------------------------------
do $$
declare
  v_page  constant uuid := '0b580000-0000-4000-8000-000000000901';
  v_sec   constant uuid := '0b580000-0000-4000-8000-000000000902';
  v_rev   constant uuid := '0b580000-0000-4000-8000-000000000903';
  v_rev2  constant uuid := '0b580000-0000-4000-8000-000000000904';
  v_rev3  constant uuid := '0b580000-0000-4000-8000-000000000905';
  v_items constant jsonb := jsonb_build_array(
    jsonb_build_object('_k', 'g92aa1', 'name', 'مرسيدس',
                       'src', '/brands/0b58-a.svg', 'alt', 'شعار مرسيدس'),
    jsonb_build_object('_k', 'g92bb2', 'name', 'بي إم دبليو',
                       'src', '/brands/0b58-b.svg', 'alt', 'شعار بي إم دبليو'));
  v_full  constant jsonb := jsonb_build_object('title', 'ماركات فحص المصالحة',
                                               'items', v_items);
  v_key   text;
  v_stale jsonb;
  v_res   jsonb;
  v_got   jsonb;
  v_killed boolean := false;
begin
  insert into public.locales (code, name, native_name, dir, is_default, enabled, auto_publish, sort)
  values ('zx', 'لغة فحص المنشئ', 'Builderish', 'ltr', false, true, false, 97)
  on conflict (code) do nothing;

  insert into public.pages (id, slug, kind, title, meta, published, sort)
  values (v_page, '0b58-publish-items', 'landing', 'صفحة فحص مصالحة العناصر',
          '{"title":null,"description":"وصف فحص مصالحة العناصر"}'::jsonb, true, 978);

  insert into public.sections (id, page_id, type, content, sort, visible)
  values (v_sec, v_page, 'logo-strip', v_full, 0, true);

  v_key := v_sec::text || '.items.g92aa1.name';

  -- (ع-٠) شاهدٌ إيجابي **قبل** أي نشر: العنوان في الفهرس فعلاً، وله ترجمةٌ منشورة.
  --       وبلاه يكون كل ما بعده إثباتَ فراغٍ لا إثباتَ حراسة (الذهبية ١٩).
  if not exists (select 1 from public.i18n_corpus_rows() c
                 where c.ns = 'section' and c.k = v_key) then
    raise exception '(ع-٠) عنوان ترجمة العنصر ليس في الفهرس أصلاً — الفيكسترة معطوبة لا المنتج';
  end if;
  insert into public.translations (locale, namespace, key, source_text, value, status)
  values ('zx', 'section', v_key, 'مرسيدس', 'Mercedes', 'published');

  -- ── اللقطة «من قبل الهجرة»: نفس الكتلة بنفس معرّفها، **بلا مفتاح `items`** ──
  v_stale := jsonb_build_object('page',
    jsonb_build_object('id', v_page::text, 'slug', '0b58-publish-items'),
    'sections', jsonb_build_array(
      jsonb_build_object('id', v_sec::text, 'type', 'logo-strip',
        'content', jsonb_build_object('title', 'ماركات فحص المصالحة'),
        'sort', 0, 'visible', true)));

  insert into public.page_revisions (id, page_id, status, snapshot)
  values (v_rev, v_page, 'draft', v_stale);

  -- (ع-١) 🔒 النشر **ينجح**. ولو رُفض هنا لكان الحارس قد حبس المالك خارج محتواه
  v_res := public.publish_page_revision(v_page, v_rev);
  if v_res -> 'keptSectionIds' is null then
    raise exception '(ع-١) النشر لم يُرجع عقده — %', coalesce(v_res::text, '∅');
  end if;

  -- (ع-٢) 🔴 والعناصر نجت **بمفاتيحها وبترتيبها**: عدٌّ متساوٍ يمرّ فوق مفاتيح أخرى
  select s.content -> 'items' into v_got from public.sections s where s.id = v_sec;
  if v_got is distinct from v_items then
    raise exception
      '(ع-٢) 🔴 لقطةٌ لا تعرف `items` محت القائمة الحيّة عند النشر — %',
      coalesce(v_got::text, '∅');
  end if;

  -- (ع-٣) والعنوان ما زال قائماً، والترجمة المنشورة لم تُيتَّم
  if not exists (select 1 from public.i18n_corpus_rows() c
                 where c.ns = 'section' and c.k = v_key) then
    raise exception '(ع-٣) 🔴 عنوان ترجمة العنصر سقط من الفهرس بعد النشر';
  end if;
  if not exists (select 1 from public.translations t
                 where t.locale = 'zx' and t.namespace = 'section'
                   and t.key = v_key and t.status = 'published') then
    raise exception '(ع-٣) الترجمة المنشورة صارت يتيمةً — مفتاحٌ لا يقابله عنصر';
  end if;

  -- (ع-٤) واللقطة المخزَّنة صُولحت هي نفسها، فلا يعود المنشئ يُقدّم شكلاً يمحوها
  select x -> 'content' -> 'items' into v_got
  from public.page_revisions r, jsonb_array_elements(r.snapshot -> 'sections') x
  where r.id = v_rev;
  if v_got is distinct from v_items then
    raise exception
      '(ع-٤) اللقطة المخزَّنة ما زالت بلا عناصر — النشرة التالية تعيد المحو (%)',
      coalesce(v_got::text, '∅');
  end if;

  -- ══ (ع-٥) 🔴 الحدّ الفاصل: الغياب ليس الفراغ ═══════════════════════════════
  --
  -- المنشئ يكتب `[]` حين يفرغ المالك قائمةً، ويُخرج المفتاح كلَّه حين لا يعرفه.
  -- فلو صالحنا الفراغ أيضاً لصار الحارس قد **أطفأ الحذف**: مالكٌ يمحو ماركاته
  -- فتعود بأول نشرة، ولا رسالة ولا سبب.
  insert into public.page_revisions (id, page_id, status, snapshot)
  values (v_rev2, v_page, 'draft', jsonb_build_object('sections', jsonb_build_array(
    jsonb_build_object('id', v_sec::text, 'type', 'logo-strip',
      'content', jsonb_build_object('title', 'ماركات فحص المصالحة',
                                    'items', '[]'::jsonb),
      'sort', 0, 'visible', true))));

  perform public.publish_page_revision(v_page, v_rev2);

  select s.content -> 'items' into v_got from public.sections s where s.id = v_sec;
  if v_got is distinct from '[]'::jsonb then
    raise exception
      '(ع-٥) 🔴 إفراغُ المالك المتعمَّد لم ينفُذ (%) — الحارس أطفأ الحذف بدل أن يمنع المحو',
      coalesce(v_got::text, '∅');
  end if;

  -- ══════════════════════════════════════════════════════════════════════════
  -- 🔬 (ع-٦) الطفرة ٤ — «فحصٌ لا يمكن أن يفشل هو زينة» (النمط ٩)
  --
  -- يُستبدل جسم `reconcile_revision_items` بجسمٍ لا يفعل شيئاً، ويُعاد المشهد
  -- نفسه حرفاً، فيجب أن **تُمحى** العناصر. ولو نجت والمُصالِح معطَّل، فنجاتُها في
  -- (ع-٢) لم تكن به — وكان يجب حذف التأكيد لا الاطمئنان إليه.
  --
  -- والطفرة داخل معاملةٍ فرعية تُرجَع، وDDL في Postgres معاملاتيّ — فالجسم الحقيقي
  -- يعود بلا سطرِ استعادةٍ يمكن أن يُنسى. والشاهد على عودته بعدها.
  -- ══════════════════════════════════════════════════════════════════════════
  begin
    update public.sections set content = v_full where id = v_sec;

    execute $q$
      create or replace function public.reconcile_revision_items(p_page uuid, p_revision uuid)
      returns integer language sql immutable set search_path = '' as $b$ select 0 $b$;
    $q$;

    insert into public.page_revisions (id, page_id, status, snapshot)
    values (v_rev3, v_page, 'draft', v_stale);

    perform public.publish_page_revision(v_page, v_rev3);

    select s.content -> 'items' into v_got from public.sections s where s.id = v_sec;
    v_killed := (v_got is null);

    raise exception 'PB_RECONCILE_MUTATION_ROLLBACK';
  exception
    when others then
      if sqlerrm <> 'PB_RECONCILE_MUTATION_ROLLBACK' then
        raise;
      end if;
  end;

  if not v_killed then
    raise exception
      '(ع-٦) 🔬 الطفرة لم تُحدث فرقاً: العناصر نجت والمُصالِح معطَّل — أي أن (ع-٢) لا يقيس هذا الحارس';
  end if;

  -- والجسم الحقيقي عاد: الفحص لا يترك القاعدة أضعف مما وجدها
  if position('touched' in pg_get_functiondef(
       'public.reconcile_revision_items(uuid, uuid)'::regprocedure)) = 0 then
    raise exception '(ع-٦) المُصالِح لم يعُد إلى جسمه بعد الطفرة — القاعدة أضعف مما وجدها';
  end if;

  delete from public.pages where id = v_page;

  raise notice '✔ (ع-١..٥) لقطةٌ لا تعرف `items` تُنشَر فلا تمحو العناصر ولا تُيتّم عنوان ترجمةٍ، و`items: []` تنفُذ · 🔬 والطفرة ٤ تثبت أن المُصالِح هو ما أنجاها';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ل) التنظيف — صفر أثر، والقاعدة كما وُجدت
-- ----------------------------------------------------------------------------
do $$
declare
  v_n integer;
begin
  delete from public.translations   t where t.locale = 'zx';
  delete from public.locales        l where l.code   = 'zx';
  delete from public.redirects      r where r.from_path like '/0b58-%';
  delete from public.pages          p where p.slug like '0b58-%';
  delete from public.block_registry b where b.type like '0b58-%';
  delete from public.profiles       p where p.id in (
    '0b580000-0000-4000-8000-0000000000a1'::uuid,
    '0b580000-0000-4000-8000-0000000000a2'::uuid,
    '0b580000-0000-4000-8000-0000000000a3'::uuid);
  begin
    delete from auth.users u where u.id in (
      '0b580000-0000-4000-8000-0000000000a1'::uuid,
      '0b580000-0000-4000-8000-0000000000a2'::uuid,
      '0b580000-0000-4000-8000-0000000000a3'::uuid);
  exception when others then null;
  end;

  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claims', '', false);

  select count(*) into v_n from public.pages where slug like '0b58-%';
  if v_n <> 0 then
    raise exception '(ل) بقيت % صفحة فيكسترة', v_n;
  end if;
  -- اللقطات تسقط مع صفحتها (‏`on delete cascade`) — والفحص على **معرّفاتنا**
  -- لا على إجمالي الجدول، فلا يفشل يوم تصير للمالك لقطاتٌ حقيقية
  select count(*) into v_n from public.page_revisions r
   where r.id in ('0b580000-0000-4000-8000-000000000311'::uuid,
                  '0b580000-0000-4000-8000-000000000411'::uuid,
                  '0b580000-0000-4000-8000-000000000412'::uuid,
                  '0b580000-0000-4000-8000-000000000511'::uuid,
                  -- لقطات (ع) الثلاث: القديمة · المُفرِغة · والمطفورة
                  '0b580000-0000-4000-8000-000000000903'::uuid,
                  '0b580000-0000-4000-8000-000000000904'::uuid,
                  '0b580000-0000-4000-8000-000000000905'::uuid);
  if v_n <> 0 then
    raise exception '(ل) بقيت % لقطة فيكسترة — الحذف بـcascade لم يعمل', v_n;
  end if;
  select count(*) into v_n from public.block_registry;
  if v_n <> 19 then
    raise exception '(ل) الكتالوج فيه % كتلة لا ١٩ — الفحص لوّثه', v_n;
  end if;
  select count(*) into v_n from public.translations where locale = 'zx';
  if v_n <> 0 then
    raise exception '(ل) بقيت % ترجمة فيكسترة', v_n;
  end if;

  -- والفهرس عاد إلى مقامه: لا مفتاح من فيكستراتنا فيه
  if exists (select 1 from public.i18n_corpus_rows() c where c.k like '0b58%') then
    raise exception '(ل) بقي مفتاح فيكسترة في فهرس الترجمة';
  end if;

  raise notice '✔ (ل) التنظيف تام — لا أثر للفيكسترة، والكتالوج ١٩ كتلة كما بدأ';
end;
$$;

-- ----------------------------------------------------------------------------
-- الخلاصة
-- ----------------------------------------------------------------------------
do $$
begin
  raise notice 'ALL PASSED — منشئ الصفحات: لقطةٌ قديمة تُنشَر فلا تمحو عناصر كتبتها هجرة ولا تُيتّم عنوان ترجمة، و«items: []» إفراغٌ ينفُذ (وطفرةٌ تعطّل المُصالِح فتُمحى) · عنصرٌ بلا مفتاح ثابت صالح وفريد لا يُكتب إدراجاً ولا تحديثاً (وطفرةٌ تثبت أن الحارس هو الرافض) · مرساةُ البند خارج فهرس الترجمة وخارج التطبيق ورقمُه وخلايا الجدول داخلهما · صورةُ العنصر وأيقونتُه خارج فهرس الترجمة وخارج التطبيق و`alt` داخلهما · النشر فرقٌ بالمعرّف فتنجو الترجمات (وطفرة «احذف ثم أدرج» تُبيدها) · العمق مستوى واحد من الطرفين · محجوزات المسار تُرفض برمزها · الكتالوج = BLOCK_CATALOGUE ولا يقبل شكلاً غير معنوَن · بوابة النشر ترجع كل رمز في حالته وتقرأ الكتالوج فعلاً · anon صفر منحة ولا TRUNCATE لأحد · والمتعهد صفر مسودة وops قراءةٌ فقط';
end;
$$;
