-- ============================================================================
-- 0059_i18n_stable_item_keys.sql — عنوانُ عنصر `items` يصير **مفتاحاً ثابتاً**
--
-- العقد المُلزِم: `lib/page-builder-types.ts` §٤ و§٥، وموجز
-- `docs/phase-briefs/PAGE-BUILDER.md` (٢-ب · ٢-ج البند ٣ · ٤). و`0058` أجّلت
-- هذه الجراحة إلى هذا الملف بنصّ ترويستها.
--
-- ── العطب الذي يغلقه هذا الملف — مقيسٌ حيّاً لا متوقَّعاً ────────────────────
--
-- عنوان الترجمة اليوم `<sectionId>.items.<ordinal>.<field>` — أي أنه يصف
-- **موضع** العنصر لا العنصر. فتبديلُ عنصرين (وهو ما يفعله السحب والإفلات
-- حرفياً، وهو **التفاعل نفسه** في المنشئ) ينقل ترجمة الأول إلى الثاني
-- ويعرضها على الزائر ممزوجة: سؤال «ألف» المترجَم ملصوقاً بجواب «باء».
-- والطابور يسمها `stale`، لكن `localized_page` ترشّح على `status='published'`
-- وحده فتخدم الخطأ إلى أن يفتح المالك الطابور.
--
-- وقد صار العطب **أسوأ** بعد `0058` لا مجرّد باقٍ: إعادة الترتيب انتقلت من
-- زرَّين بلا وعد إلى مقبض سحبٍ + تلميحٍ يَعِد بأن الترجمة تتبع العنصر + زرِّ
-- «ثبّت مفاتيح العناصر» يفتح الخطر بدل أن يغلقه. أي **وعدُ أمانٍ كاذب أمام
-- مسار إفسادِ بيانات حيّ** — وهو أسوأ الحالات الثلاث.
--
-- ── ما قِيس على القاعدة الحيّة قبل كتابة سطرٍ واحد (2026-08-15) ─────────────
--
-- | ما قِيس | القيمة |
-- |---|---|
-- | صفوف `i18n_corpus_rows()` | **٣٧٧** — `section` ٣٠٤ · `page` ٥٣ · `vehicle` ٨ · `service` ٦ · `settings` ٦ |
-- | ⚠ والموجز يقول ٣٦١ | **قديم** — نمت القاعدة إلى ١٨ صفحة و١٠٠ قسماً. أُعيد القياس ولم يُنقل |
-- | صيغ مفاتيح الأقسام | مسطّحة **١٧٤** · ترتيبية **١٣٠** (المجموع ٣٠٤) |
-- | صفوف مفتاحها ينتهي بـ`._k` | **٢** — أي أن المعرّف نفسه كان يُفهرَس نصاً للترجمة |
-- | أقسامٌ عناصرها تحمل `_k` | **١** (`faq` على `summer-offer`، عنصران: `qrr9e0` · `xuaj52`) |
-- | صفوف `translations` بمساحة `section` | **صفر** (الإجمالي ٧: `service` ٢ · `settings` ٣ · `vehicle` ٢) |
-- | صفوف مفتاحها ينتهي بـ`.style` | **صفر** (‏`style` كائنٌ لا نصّ، فلم يدخل — والحجب هنا **بالاسم** لا بالنوع) |
--
-- 🔒 **صفر صفٍّ من محتوى المالك يتغيّر في هذا الملف.** لا `sections` ولا
-- `pages` ولا `content`. والوحيد الذي يُمسّ في `translations` صفوفٌ مفتاحها
-- **معرّفٌ لا نصّ** (`%._k`) — وعددها اليوم **صفر**، والحذف مُعلَنٌ في السجل.
--
-- ── D-58: الجسمان من الكتالوج الحيّ لا من ملف هجرة ──────────────────────────
--
-- سُحب الجسمان بـ`pg_get_functiondef` قبل أي تعديل، وقُورنا بـ`0018_i18n.sql`:
-- **متطابقان حرفاً بحرف** — أي أن أحداً لم يعدّلهما بعد `0018`. والقاعدة نُفِّذت
-- ولم تُمسك انحرافاً هذه المرة، وهذا هو الناتج المطلوب منها لا الاستثناء.
--
-- ── القرار الدقيق في «ثم تسقط إلى الترتيب» ─────────────────────────────────
--
-- العقد §٤ يقول: «`i18n_corpus_rows` تُخرج الصيغة الأولى حين يوجد `_k`
-- والثانية حين لا يوجد، و`i18n_apply` تبحث بـ`_k` أولاً ثم تسقط إلى الترتيب».
-- وللجملة الثانية قراءتان، والفرق بينهما هو الفرق بين إغلاق العطب وإعادة فتحه:
--
--   (أ) **السقوط لكل عنصر**: عنصرٌ يحمل `_k` صالحاً ⇒ عنوانه `_k` **وحده**.
--       عنصرٌ بلا `_k` ⇒ عنوانه ترتيبه. عنوانٌ واحد لكل عنصر.
--   (ب) **السقوط لكل بحث**: جرّب `_k` فإن لم تجد ترجمة فجرّب الترتيب.
--
-- **المشحون (أ)، والسبب حاسم:** تحت (ب) يكفي أن يضغط المالك «ثبّت المفاتيح»
-- ثم يسحب عنصراً، فيجد البحثُ الثانوي ترجمةَ **الموضع** ويلصقها بالعنصر
-- الجديد — أي **العطب المقيس نفسه، حرفياً، بعد الهجرة التي كُتبت لقتله**.
-- ونصُّ العقد نفسه يحسمها: «العنصر الذي يلمسه المنشئ يكتسب `_k` **ويهاجر
-- مفتاحه مرةً واحدة بوصفه نصاً جديداً في الطابور**» — أي أن مفتاحه القديم
-- يُهجَر لا يُستشار. فالسقوط في (أ) سقوطُ **عنونة** لا سقوطُ **بحث**.
--
-- والثمن مكتوبٌ بلا تجميل: عنصرٌ له ترجمة منشورة على الصيغة الترتيبية ثم
-- تُسَكّ مفاتيحه **يعود إلى الطابور نصاً جديداً**، وتُخدَم عربيتُه على `/en`
-- حتى تُراجَع. وهذا مقصود: **الترجمة الغائبة تُقرأ نقصاً، والترجمة الخاطئة
-- تُقرأ خبراً** — والثانية وحدها إفسادُ بيانات. وثمنه اليوم **صفر** لأن مساحة
-- `section` بلا صفٍّ واحد؛ وهذه أرخص لحظة ممكنة لهذا القرار ولن تتكرر.
--
-- **والتناظر هو الضمانة:** `i18n_apply` تقرأ **بالضبط** المفتاح الذي تُخرجه
-- `i18n_corpus_rows` ولا شيء غيره — لأن الدالتين تشتركان في بانيَي العنوان
-- أدناه بنصّهما، فلا تنحرف واحدةٌ عن الأخرى يوم تُعدَّل (القاعدة الذهبية ١٢:
-- فوِّض ولا تستنسخ).
--
-- المرجع: D-23 · D-24 · D-25 · D-48 · **D-58** · القاعدة الذهبية ١٠ و١٢ و١٩.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (٠) لقطة «ما كان» — تُلتقط بالتعريف **القديم** قبل استبداله
--
-- الهجرة معاملةٌ واحدة (‏`scripts/db-migrate.mjs`)، فالنداء هنا يمرّ على الجسم
-- القديم، والنداء في القسم (٥) يمرّ على الجديد. وشرط الإغلاق المكتوب في الموجز
-- — «عدد صفوف الفهرس متطابق قبل وبعد» — يصير بذلك حارساً **داخل الهجرة نفسها**
-- لا فحصاً يدوياً يُنسى. والفارق الوحيد المسموح: صفوف `_k` المحذوفة عمداً.
-- ----------------------------------------------------------------------------

do $$
declare
  v_total integer;
  v_krows integer;
begin
  select count(*) into v_total from public.i18n_corpus_rows();
  select count(*) into v_krows from public.i18n_corpus_rows() c
   where c.k like '%._k' or c.k like '%.style';

  perform set_config('tours.i18n_corpus_before',   v_total::text, true);
  perform set_config('tours.i18n_corpus_before_k', v_krows::text, true);

  raise notice '0059 — قبل: % صفَّ فهرس، منها % صفَّ مفتاحٍ محجوز', v_total, v_krows;
end;
$$;

-- ----------------------------------------------------------------------------
-- (١) بانيا العنوان — **مصدرٌ واحد** تشترك فيه الدالتان
--
-- العقد §٤ يعرّف `sectionItemKey` و`legacySectionItemKey` في TypeScript؛ وهذان
-- نظيراهما في SQL. ووجودهما دالّتين لا نصّاً منسوخاً هو ما يمنع أن تنحرف
-- `i18n_apply` عن `i18n_corpus_rows` يوم يُعدَّل أحدهما — وهو الانحدار الذي
-- علّمته الدفعة ٣ (**D-58**).
-- ----------------------------------------------------------------------------

/**
 * المفاتيح المحجوزة — مرآة `RESERVED_CONTENT_KEYS` في العقد §٤.
 *
 * `_k` **معرّف لا نصّ**: فهرستُه تضعه في طابور مراجعةٍ بشرية أو آلية، و«ترجمةُ»
 * مفتاحٍ تكسر هوية العنصر من أصلها — فيصير العنوان الذي وُضع ليكون ثابتاً
 * متغيّراً بيد مترجِم. و`style` تنسيقٌ لا نصّ (§٥): «غير قابل للترجمة» يُعلَن
 * بـ**موضعه** لا يُستنتَج من نوع قيمته — فحقلٌ نصّي للتنسيق (`align: "start"`)
 * لا يجوز أن يدخل الطابور ويُطلب من إنسانٍ ترجمته.
 */
create or replace function public.i18n_reserved_content_key(p_key text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_key is not null and p_key in ('_k', 'style')
$$;

comment on function public.i18n_reserved_content_key(text) is
  'المفاتيح المحجوزة داخل sections.content — مرآة RESERVED_CONTENT_KEYS في '
  'lib/page-builder-types.ts §٤. لا يفهرسها i18n_corpus_rows ولا تلمسها i18n_apply.';

/**
 * عنوان العنصر داخل `items`: مفتاحه الثابت إن حمل واحداً صالحاً، وترتيبه إن لم
 * يحمل. `p_ordinal` **صفري الأساس** كما في الصيغة القائمة.
 *
 * والنمط مفروضٌ هنا لا مفترَض: مفتاحٌ مشوَّه (فراغ، أو طول مختلف، أو حرف خارج
 * `[a-z0-9]`) يسقط إلى الترتيب بدل أن يولّد عنواناً لا يعرفه أحد. وهو النمط
 * نفسه في `ITEM_KEY_PATTERN` بالعقد §٤ — نسختان تنحرفان، ولذلك يقارنهما فحصٌ
 * في `i18n_tests.sql`.
 */
create or replace function public.i18n_item_address(p_item jsonb, p_ordinal bigint)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when jsonb_typeof(p_item) = 'object'
     and coalesce(p_item ->> '_k', '') ~ '^[a-z0-9]{6}$'
    then p_item ->> '_k'
    else p_ordinal::text
  end
$$;

comment on function public.i18n_item_address(jsonb, bigint) is
  'عنوان عنصر items: `_k` الصالح إن وُجد وإلا الترتيب (صفري الأساس). '
  'مصدرٌ واحد تشترك فيه i18n_corpus_rows وi18n_apply فلا تنحرف إحداهما (D-58).';

-- ----------------------------------------------------------------------------
-- (٢) `i18n_corpus_rows` — الجسم من `pg_get_functiondef` وثلاثة تعديلات لا رابع
--
--   (أ) الحقول العليا: يُستبعد المفتاح المحجوز **بالاسم**.
--   (ب) حقول العناصر: العنوان من `i18n_item_address` بدل `(el.ord - 1)` الصلب.
--   (ج) حقول العناصر: يُستبعد المفتاح المحجوز **بالاسم** — وهذا وحده يُسقط
--       صفَّي `._k` المقيسين، وهما كل الفارق في العدّ.
--
-- وما عدا ذلك — كتلُ الصفحات والإعدادات والخدمات وفئات السيارات — منقولٌ
-- حرفياً بلا لمسة، لأن الفحص الذاتي يحرس **ما كان قائماً** لا ما أُضيف
-- (القاعدة الذهبية ١٠).
-- ----------------------------------------------------------------------------

create or replace function public.i18n_corpus_rows()
returns table (ns text, k text, src text)
language sql
stable
security definer
set search_path = ''
as $$
  -- (أ) الصفحات: العنوان وميتاداتا السيو
  select 'page'::text, p.id::text || '.title', p.title
  from public.pages p
  where p.published = true and btrim(coalesce(p.title, '')) <> ''
  union all
  select 'page', p.id::text || '.meta.title', p.meta ->> 'title'
  from public.pages p
  where p.published = true and btrim(coalesce(p.meta ->> 'title', '')) <> ''
  union all
  select 'page', p.id::text || '.meta.description', p.meta ->> 'description'
  from public.pages p
  where p.published = true and btrim(coalesce(p.meta ->> 'description', '')) <> ''

  -- (ب) الأقسام: كل حقل نصي أعلى، وكل حقل نصي داخل عناصر items
  union all
  select 'section', s.id::text || '.' || e.key, e.value #>> '{}'
  from public.sections s
  join public.pages p on p.id = s.page_id and p.published = true
  cross join lateral jsonb_each(s.content) as e(key, value)
  where s.visible = true
    and not public.i18n_reserved_content_key(e.key)   -- §٤/§٥: معرّفٌ وتنسيقٌ لا نصّ
    and jsonb_typeof(e.value) = 'string'
    and btrim(e.value #>> '{}') <> ''
  union all
  select 'section',
         s.id::text || '.items.'
           || public.i18n_item_address(el.item, el.ord - 1)   -- `_k` إن وُجد، وإلا الترتيب
           || '.' || ie.key,
         ie.value #>> '{}'
  from public.sections s
  join public.pages p on p.id = s.page_id and p.published = true
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(s.content -> 'items') = 'array'
         then s.content -> 'items' else '[]'::jsonb end
  ) with ordinality as el(item, ord)
  cross join lateral jsonb_each(
    case when jsonb_typeof(el.item) = 'object' then el.item else '{}'::jsonb end
  ) as ie(key, value)
  where s.visible = true
    and not public.i18n_reserved_content_key(ie.key)  -- §٤/§٥: معرّفٌ وتنسيقٌ لا نصّ
    and jsonb_typeof(ie.value) = 'string'
    and btrim(ie.value #>> '{}') <> ''

  -- (ج) الإعدادات: النصوص وحدها (لا ألوان ولا روابط ولا أرقام تواصل)
  union all
  select 'settings', z.k, z.v
  from (
    select 'brand.name'               as k, (select ss.value ->> 'name'               from public.site_settings ss where ss.key = 'brand')   as v
    union all
    select 'brand.tagline',                 (select ss.value ->> 'tagline'            from public.site_settings ss where ss.key = 'brand')
    union all
    select 'company.legalName',             (select ss.value ->> 'legalName'          from public.site_settings ss where ss.key = 'company')
    union all
    select 'company.activity',              (select ss.value ->> 'activity'           from public.site_settings ss where ss.key = 'company')
    union all
    select 'seo.titleTemplate',             (select ss.value ->> 'titleTemplate'      from public.site_settings ss where ss.key = 'seo')
    union all
    select 'seo.defaultDescription',        (select ss.value ->> 'defaultDescription' from public.site_settings ss where ss.key = 'seo')
  ) z
  where btrim(coalesce(z.v, '')) <> ''

  -- (د) الخدمات: عنوان كل خدمة من صفحتها المنشورة (المفتاح بالـ slug لا بالمعرّف
  --     لأن الواجهة تعرف الخدمة بـ slug من site-config)
  union all
  select 'service', p.slug || '.title', p.title
  from public.pages p
  where p.published = true and p.kind = 'service' and btrim(coalesce(p.title, '')) <> ''

  -- (هـ) فئات السيارات النشطة
  union all
  select 'vehicle', vc.slug || '.title', vc.title
  from public.vehicle_classes vc
  where vc.active = true and btrim(coalesce(vc.title, '')) <> ''
  union all
  select 'vehicle', vc.slug || '.short', vc.short
  from public.vehicle_classes vc
  where vc.active = true and btrim(coalesce(vc.short, '')) <> ''
$$;

comment on function public.i18n_corpus_rows() is
  'فهرس النصوص القابلة للترجمة. عناوين عناصر items بمفتاحها الثابت `_k` حين '
  'تحمله (منذ 0059) وبترتيبها حين لا تحمله — والصيغتان تعملان معاً. '
  'والمفاتيح المحجوزة (`_k` و`style`) خارج الفهرس بالاسم لا بالنوع.';

-- ----------------------------------------------------------------------------
-- (٣) `i18n_apply` — الجسم من `pg_get_functiondef` وثلاثة تعديلات لا رابع
--
--   (أ) المفتاح المحجوز يمرّ **كما هو** قبل أي فرعٍ آخر — فلا تستبدل ترجمةٌ
--       `_k` ولو وُجد لها صفٌّ قديم في `translations`. (حزامٌ فوق الحمّالة:
--       الفهرس لم يعد يخرجه أصلاً، لكن الصفوف القديمة لا تُسحب بمجرد أن
--       يتوقف الفهرس عن إخراجها.)
--   (ب) عنوان العنصر من `i18n_item_address` — **نفس** الباني الذي يستعمله
--       الفهرس، فالمقروء هو المكتوب حرفياً.
--   (ج) ولا سقوطَ إلى الصيغة الترتيبية لعنصرٍ يحمل `_k` — الشرح في الترويسة.
-- ----------------------------------------------------------------------------

create or replace function public.i18n_apply(p_content jsonb, p_prefix text, p_map jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case
    when p_content is null or jsonb_typeof(p_content) <> 'object' then p_content
    when p_map is null or p_map = '{}'::jsonb then p_content
    else coalesce((
      select jsonb_object_agg(e.key, case
        -- معرّفٌ أو تنسيق: يمرّ كما هو، ولا يُبحث له عن ترجمة إطلاقاً
        when public.i18n_reserved_content_key(e.key) then e.value
        when jsonb_typeof(e.value) = 'string' then
          to_jsonb(coalesce(
            nullif(btrim(p_map ->> (p_prefix || '.' || e.key)), ''),
            e.value #>> '{}'))
        when e.key = 'items' and jsonb_typeof(e.value) = 'array' then
          coalesce((
            select jsonb_agg(
              case when jsonb_typeof(el.item) = 'object' then
                coalesce((
                  select jsonb_object_agg(ie.key, case
                    when public.i18n_reserved_content_key(ie.key) then ie.value
                    when jsonb_typeof(ie.value) = 'string' then
                      to_jsonb(coalesce(
                        nullif(btrim(p_map ->> (
                          p_prefix || '.items.'
                            || public.i18n_item_address(el.item, el.ord - 1)
                            || '.' || ie.key)), ''),
                        ie.value #>> '{}'))
                    else ie.value
                  end)
                  from jsonb_each(el.item) as ie(key, value)
                ), el.item)
              else el.item
              end
              order by el.ord)
            from jsonb_array_elements(e.value) with ordinality as el(item, ord)
          ), e.value)
        else e.value
      end)
      from jsonb_each(p_content) as e(key, value)
    ), p_content)
  end
$$;

comment on function public.i18n_apply(jsonb, text, jsonb) is
  'تركيب الترجمة على محتوى قسم. عنوان العنصر = `_k` الثابت إن حمله وإلا ترتيبه '
  '(منذ 0059) — **ولا سقوط من الأول إلى الثاني**: السقوط عنونةٌ لكل عنصر لا '
  'بحثٌ لكل مفتاح، وإلا عادت سحبةٌ واحدة تنقل ترجمة عنصرٍ إلى آخر.';

-- ----------------------------------------------------------------------------
-- (٤) المنح — نفس ملامح `0018`: لا `public` ولا `anon` ولا `authenticated`
--
-- البانيان يُنادَيان من داخل دالتين تعملان بهوية المالك (‏`i18n_corpus_rows`
-- ‏`definer`، و`i18n_apply` تُنادى من داخل `localized_page` وهي `definer`)،
-- فلا يحتاجهما دورُ مستخدمٍ مباشرةً. والقاعدة الذهبية ١٦ بروحها: **المنحة هي
-- الحارس** — فما لا يحتاجه أحد لا يُمنح لأحد.
-- ----------------------------------------------------------------------------

revoke all on function public.i18n_reserved_content_key(text)     from public, anon, authenticated;
revoke all on function public.i18n_item_address(jsonb, bigint)    from public, anon, authenticated;
revoke all on function public.i18n_corpus_rows()                  from public, anon, authenticated;
revoke all on function public.i18n_apply(jsonb, text, jsonb)      from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- (٤-ب) صفوف ترجمةٍ يتيمة لمفتاحٍ محجوز — تُحذف، وعددها يُعلَن
--
-- الفهرس كان يخرج `<id>.items.<i>._k` بمصدرٍ نصّه المفتاح نفسه (`qrr9e0`)، فأي
-- حملة ترجمةٍ سابقة كانت ستُنشئ له صفاً. وبعد هذا الملف لا يخرجه الفهرس ولا
-- تقرؤه `i18n_apply`، فالصفّ يصير **يتيماً في الطابور**: يُعرض على المراجِع
-- ويُطلب منه ترجمة معرّف. والحذف مقصورٌ على مساحة `section` وعلى المفاتيح
-- المحجوزة وحدها — ولا يمسّ صفاً واحداً غيرها.
--
-- **المقيس اليوم: صفر** (‏`translations` بمساحة `section` فارغة تماماً)، فهذه
-- الجملة تحصينٌ لأي نسخة أخرى من القاعدة لا عملٌ على قاعدة بدر.
-- ----------------------------------------------------------------------------

do $$
declare
  v_n integer;
begin
  delete from public.translations t
   where t.namespace = 'section'
     and (t.key like '%._k' or t.key like '%.style');
  get diagnostics v_n = row_count;
  raise notice '0059 — صفوف ترجمةٍ لمفتاحٍ محجوز حُذفت: %', v_n;
end;
$$;

-- ----------------------------------------------------------------------------
-- (٥) الفحص الذاتي — يحرس **ما كان قائماً**، ويرمي فيُلغي الهجرة كلها
--
-- والفحوص الأربعة بُنيت لتفشل لو نُزع الحارس، لا لتصف ما أُضيف:
--   (٥-١) العدّ: بعد = قبل − صفوف المفتاح المحجوز. لا رقم صلب، بل حسابٌ من
--         لقطةٍ التُقطت بالتعريف القديم في القسم (٠).
--   (٥-٢) صفر صفٍّ بمفتاحٍ محجوز.
--   (٥-٣) **كل** حقلٍ نصّي حيّ داخل `items` له صفٌّ في الفهرس على عنوانه
--         المتوقَّع — فالصيغة الترتيبية ما زالت تعمل لكل عنصرٍ بلا `_k`
--         (وهي ١٢٤ من ١٣٠ صفاً قائماً)، والثابتة تعمل لمن يحمله.
--   (٥-٤) والعكس: صفر صفِّ عنصرٍ في الفهرس على عنوانٍ **غير** متوقَّع — فلا
--         صيغة ثالثة تسللت، ولا بقيت الترتيبية لعنصرٍ صار مفتاحاً.
-- ----------------------------------------------------------------------------

do $$
declare
  v_before integer := nullif(current_setting('tours.i18n_corpus_before',   true), '')::integer;
  v_bkeys  integer := nullif(current_setting('tours.i18n_corpus_before_k', true), '')::integer;
  v_after  integer;
  v_n      integer;
begin
  if v_before is null or v_bkeys is null then
    raise exception '0059 (٥-٠) لقطة «ما كان» ضاعت — القسم (٠) لم ينفّذ في نفس المعاملة';
  end if;

  select count(*) into v_after from public.i18n_corpus_rows();

  -- (٥-١) الحساب مُعلَن: ٣٧٧ − ٢ = ٣٧٥ على قاعدة بدر اليوم
  if v_after <> v_before - v_bkeys then
    raise exception
      '0059 (٥-١) عدد صفوف الفهرس انحرف: قبل % ناقص % محجوزاً = %، وحصلنا %',
      v_before, v_bkeys, v_before - v_bkeys, v_after;
  end if;

  -- (٥-٢) لا معرّف ولا تنسيق في الطابور
  select count(*) into v_n from public.i18n_corpus_rows() c
   where c.k like '%._k' or c.k like '%.style';
  if v_n <> 0 then
    raise exception '0059 (٥-٢) الفهرس ما زال يُخرج % صفَّ مفتاحٍ محجوز', v_n;
  end if;

  -- (٥-٣) كل حقل عنصرٍ حيّ موجودٌ على عنوانه المتوقَّع — الترتيبية والثابتة معاً
  select count(*) into v_n
  from public.sections s
  join public.pages p on p.id = s.page_id and p.published = true
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(s.content -> 'items') = 'array'
         then s.content -> 'items' else '[]'::jsonb end
  ) with ordinality as el(item, ord)
  cross join lateral jsonb_each(
    case when jsonb_typeof(el.item) = 'object' then el.item else '{}'::jsonb end
  ) as ie(key, value)
  where s.visible = true
    and not public.i18n_reserved_content_key(ie.key)
    and jsonb_typeof(ie.value) = 'string'
    and btrim(ie.value #>> '{}') <> ''
    and not exists (
      select 1 from public.i18n_corpus_rows() c
      where c.ns = 'section'
        and c.k = s.id::text || '.items.'
                  || public.i18n_item_address(el.item, el.ord - 1) || '.' || ie.key
    );
  if v_n <> 0 then
    raise exception '0059 (٥-٣) % حقلَ عنصرٍ حيّ سقط من الفهرس أو تغيّر عنوانه', v_n;
  end if;

  -- (٥-٤) ولا عنوان عنصرٍ في الفهرس بلا مصدرٍ حيٍّ يطابقه
  select count(*) into v_n
  from public.i18n_corpus_rows() c
  where c.ns = 'section'
    and c.k like '%.items.%'
    and not exists (
      select 1
      from public.sections s
      join public.pages p on p.id = s.page_id and p.published = true
      cross join lateral jsonb_array_elements(
        case when jsonb_typeof(s.content -> 'items') = 'array'
             then s.content -> 'items' else '[]'::jsonb end
      ) with ordinality as el(item, ord)
      cross join lateral jsonb_each(
        case when jsonb_typeof(el.item) = 'object' then el.item else '{}'::jsonb end
      ) as ie(key, value)
      where s.visible = true
        and c.k = s.id::text || '.items.'
                  || public.i18n_item_address(el.item, el.ord - 1) || '.' || ie.key
    );
  if v_n <> 0 then
    raise exception '0059 (٥-٤) % صفَّ عنصرٍ في الفهرس على عنوانٍ لا مصدر له', v_n;
  end if;

  raise notice '0059 ✔ الفهرس: % ⇐ % (المحذوف % صفَّ مفتاحٍ محجوز)، والصيغتان تعملان',
    v_before, v_after, v_bkeys;
end;
$$;
