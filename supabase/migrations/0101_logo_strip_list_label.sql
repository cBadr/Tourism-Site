-- ============================================================================
-- 0101 — تسمية قائمة الشعارات تصير حقلاً في اللوحة، لا قيمةً محفورةً في الكود
--
-- العقود المُلزِمة: `lib/page-builder-types.ts` §٤ (‏`BLOCK_CATALOGUE`) ·
-- `lib/content-types.ts` (‏`SectionContentMap["logo-strip"]`) ·
-- `lib/page-builder/registry.ts` (‏`FIELD_LABELS`) · `0087` (شكل الصفّ الحالي).
--
-- ══════════════════════════════════════════════════════════════════════════
--  🔴 العطب — حقلٌ **يُصيَّر على الإنتاج ولا تبلغه اللوحة إطلاقاً**
-- ══════════════════════════════════════════════════════════════════════════
--
-- كان في `components/sections/logo-strip.tsx`:
--
--     label={t("listLabel", "ماركات الأسطول")}
--
-- **بلا `content.listLabel ??` قبله** — بخلاف `title` و`note` اللذين يُقرآن من
-- الصفّ. فالقيمة تُكتب `aria-label` على `<ul>` الشريط على الموقع الحيّ (مقيسٌ في
-- HTML الإنتاج قبل هذه الهجرة: `aria-label="ماركات الأسطول"`)، **ولا سبيل إلى
-- تغييرها من `/admin/content/<id>/builder` ولا بكتابة صفٍّ في `sections`**:
-- المنشئ يحلق على `block_registry.text_fields` (عبر `BLOCK_CATALOGUE`)، وحقلٌ
-- غير معلَنٍ فيها **لا خانة له**، وقيمةٌ تُكتب فيه من محرر SQL لا تقرؤها العارضة.
--
-- وهو نقضٌ لشرط المالك غير القابل للتفاوض: «التحكم في كل شيء من لوحة التحكم».
--
-- 🔴 **وحمولتُه هي الصياغة التي كُتبت `0095` أصلاً لإزالتها.** النشاط **وسيطٌ**
--    لا يملك مركبةً ولا يوظّف سائقاً (‏`OVERVIEW` العمودان ١-٢)، فـ«الأسطول»
--    بضمير الملك ادّعاءُ ما لا يُملَك — وهي المخالفة (٢) في رأس `0095` بنصّها.
--    ونظّفت `0095` **صفوف القاعدة** فأصلحت `logo-strip.title` («الفئات المتاحة
--    في أسطولنا» ⇒ «ماركات تجدها في الفئات المتاحة») **ولم تجد لهذه التسمية
--    صفّاً تُصلحه، لأنها لم تكن في القاعدة أصلاً** — فبقيت وحدها بعد المراجعة.
--
-- ══════════════════════════════════════════════════════════════════════════
--  ما تفعله هذه الهجرة — وما لا تفعله
-- ══════════════════════════════════════════════════════════════════════════
--
-- (أ) `text_fields` تصير `{title, listLabel, note}`. **والموضع وسطاً لا في
--     الذيل**: ترتيب العمود هو ترتيب الخانات في اللوحة (‏`BlockFields` تحلق
--     عليه حرفاً)، وتسميةُ القائمة تخصّ العنوان لا الملاحظة أسفل الشريط. وهو
--     كذلك الترتيب في `BLOCK_CATALOGUE` — والمقارنة بين الاثنين **بالمساواة لا
--     بالاحتواء** (‏`page_builder_tests.sql` §(أ): `b.text_fields = e.text_fields`).
--
-- (ب) 🔒 **ولا قيمة تُكتب في أي صفّ محتوى.** الحقل يُفتح فارغاً، والعارضة تعيد
--     الافتراضي عند الفراغ — فما يراه الزائر بعد الهجرة هو ما كان يراه قبلها
--     **إلا نصَّ الافتراضي نفسه** (تغيّر في الكود لا هنا). ولا `sections` تُمسّ
--     ولا `page_revisions`: فلا يتعارض هذا الملف مع لقطةٍ حيّةٍ يكتبها أحد
--     (‏D-60 لا يسري لأننا لا نكتب محتوى).
--
-- (ج) 🔒 **ولا صفَّ يدخل فهرس الترجمة ببايت.** والسبب بنيويّ لا حسنُ حظّ:
--     `i18n_corpus_rows()` **لا تقرأ `block_registry` ولا `text_fields`** — تفهرس
--     كل مفتاحٍ قيمتُه نصّ في `content` (مكتوبٌ في `page_builder_tests.sql`
--     §(م‑٤) حرفاً). فما لا قيمة له لا مفتاح له، ويوم يكتب المالك تسميةً تدخل
--     الطابور من تلقائها كأي نصّ. **والفرق يُقاس في §(٤) لا يُفترض.**
--
-- ⚠ **وما لا تلمسه**: `item_fields` · `non_text_item_fields` · `required_fields`
--    (‏تبقى فارغة — والصفّ بلا `items` يعود إلى `settings.fleetBrands`، `0087`) ·
--    و`note` نثرُ المالك · وعدد الكتالوج ١٩.
-- ============================================================================

create temporary table _corpus_before_100 on commit drop as
select ns, k from public.i18n_corpus_rows();

-- ----------------------------------------------------------------------------
-- (١) لقطةُ الشكل **قبل** — فالفحص أدناه يقارن بما كان لا بما نتمناه
-- ----------------------------------------------------------------------------

do $$
declare
  v_before text[];
begin
  select text_fields into v_before from public.block_registry where type = 'logo-strip';
  if v_before is null then
    raise exception '0101: لا صفَّ logo-strip في الكتالوج — لا يُوسَّع ما لا يوجد';
  end if;
  raise notice '  ← text_fields قبل: %', v_before;

  -- إعادةُ التنفيذ مجانية: الصفّ الذي يحمل الحقل سلفاً لا يُكتب عليه
  if 'listLabel' = any(v_before) then
    raise notice '  ← listLabel معلَنٌ سلفاً — لا كتابة';
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- (٢) الكتابة — بالشكل الكامل صراحةً لا بـ`array_append`
--
-- والسبب: `array_append` على تشغيلٍ ثانٍ تُنتج `{title,note,listLabel}` — شكلاً
-- **يمرّ** كل فحصٍ يسأل «أفيه listLabel؟» و**يفشل** المقارنةَ بالمساواة مع العقد.
-- والصريح لا يعرف تشغيلاً ثانياً.
-- ----------------------------------------------------------------------------

update public.block_registry
set text_fields = array['title', 'listLabel', 'note']
where type = 'logo-strip';

comment on table public.block_registry is
  'كتالوج كتل منشئ الصفحات — مرآة BLOCK_CATALOGUE في lib/page-builder-types.ts. '
  'و«logo-strip» صارت كتلة items منذ 0087: الشعار صورةُ عنصر (src غير نصّي) '
  'والاسم نصٌّ يُترجَم، و«site_settings.fleetBrands» احتياطٌ حين تفرغ items. '
  'و«listLabel» تسمية القائمة لقارئ الشاشة — صارت حقلاً في اللوحة في 0101 بعد '
  'أن كانت محفورةً في العارضة بلا مسار content، فتُصيَّر ولا تُحرَّر.';

-- ----------------------------------------------------------------------------
-- (٣) الفحص الذاتي — **بالنداء الحيّ للحارس لا بالثقة** (القاعدة الذهبية ١٩)
-- ----------------------------------------------------------------------------

do $$
declare
  v_n      integer;
  v_reason text;
begin
  -- (٣-أ) الشكل حرفاً بحرف، **والترتيب جزءٌ من العقد**
  select count(*) into v_n
  from public.block_registry
  where type = 'logo-strip'
    and text_fields          = array['title', 'listLabel', 'note']
    and item_fields          = array['name', 'href', 'alt']
    and non_text_item_fields = array['src']
    and non_text_fields is null
    and required_fields = '{}'::text[]
    and role = 'system'
    and placement = 'once-per-page';
  if v_n <> 1 then
    raise exception '0101: صفّ logo-strip لم يصل إلى شكل العقد {title,listLabel,note}';
  end if;

  -- (٣-ب) الحارس البنيوي يقبل الشكل الجديد — نداءٌ حيّ بأعمدة الصفّ نفسها
  select public.block_registry_check(type, role, placement, accepts_children, max_children,
                                     text_fields, item_fields, required_fields,
                                     non_text_fields, non_text_item_fields)
    into v_reason
  from public.block_registry where type = 'logo-strip';
  if v_reason is not null then
    raise exception '0101: الحارس البنيوي رفض صفّ logo-strip — %', v_reason;
  end if;

  -- (٣-ج) 🔒 و`listLabel` **نصٌّ يُترجَم لا حقلٌ غير نصّي**: لو صنّفه
  --        `i18n_non_text_field` وسيطاً (‏كـ`src`) لخرج من الفهرس فبقي
  --        بالعربية على الصفحة الإنجليزية — تسميةٌ لا يفهمها من يسمعها.
  if public.i18n_non_text_field('listLabel') then
    raise exception '0101: listLabel صُنّف حقلاً غير نصّي — تسميةٌ لا تُترجَم';
  end if;

  -- (٣-د) وعدد الكتالوج لم يتغيّر — لا كتلةَ وُلدت ولا سقطت
  select count(*) into v_n from public.block_registry;
  if v_n <> 19 then
    raise exception '0101: الكتالوج صار % كتلة لا ١٩', v_n;
  end if;

  -- (٣-هـ) 🔒 ولا صفَّ محتوى تغيّر: الكتل الظاهرة ما زالت تُصيَّر
  if exists (
    select 1 from public.sections s
    where s.type = 'logo-strip' and s.visible
      and not public.block_renders(s.type, coalesce(s.content, '{}'::jsonb))
  ) then
    raise exception '0101: كتلة logo-strip ظاهرة ولا تُصيَّر بعد التوسيع';
  end if;

  -- (٣-و) و`note` عبر كما هو — نثرُ المالك لا يُمسّ
  if not exists (
    select 1 from public.sections
    where type = 'logo-strip' and coalesce(btrim(content ->> 'note'), '') <> ''
  ) then
    raise notice '  ⚠ لا صفَّ logo-strip يحمل note — مقبولٌ إن كان فارغاً قبل الهجرة';
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- (٤) 🔴 شرط الإغلاق — الفهرس **بالفرق لا بالعدد**، وفي الاتجاهين
--
-- والمتوقَّع **صفرٌ في الاتجاهين**، ومبرره في §(ج) أعلاه: الفهرس يقرأ القيم لا
-- السجل، ولا قيمة كُتبت. وعدٌّ متساوٍ كان يخفي تبادلاً (مفتاحٌ سقط وآخر وُلد)،
-- فالمقارنة بـ`except` لا بـ`count`.
-- ----------------------------------------------------------------------------

do $$
declare
  v_added   text;
  v_removed text;
begin
  select string_agg(a.k, ', ') into v_added
  from (select k from public.i18n_corpus_rows() except select k from _corpus_before_100) a;
  if v_added is not null then
    raise exception '0101: دخل الفهرس مفتاحٌ لم يُكتب له نصّ — %', v_added;
  end if;

  select string_agg(b.k, ', ') into v_removed
  from (select k from _corpus_before_100 except select k from public.i18n_corpus_rows()) b;
  if v_removed is not null then
    raise exception '0101: سقط من الفهرس مفتاح — %', v_removed;
  end if;

  -- (٤-ب) **شاهدٌ إيجابي**: القيمة المكتوبة **تدخل** الفهرس فعلاً — وإلا أثبتنا
  --        صفراً بلا معنى. تُكتب في معاملةٍ تُلغى، فلا صفَّ محتوى يُمسّ.
  declare
    v_sec   uuid;
    v_found integer;
  begin
    select id into v_sec from public.sections where type = 'logo-strip' limit 1;
    if v_sec is not null then
      update public.sections
      set content = coalesce(content, '{}'::jsonb) || jsonb_build_object('listLabel', 'شاهدُ فهرسٍ مؤقت')
      where id = v_sec;

      select count(*) into v_found
      from public.i18n_corpus_rows()
      where k = v_sec::text || '.listLabel';

      -- 🔒 الإرجاع **قبل** أي رمي: صفٌّ يبقى ملوَّثاً لو رُمي الاستثناء أولاً
      update public.sections set content = content - 'listLabel' where id = v_sec;

      if v_found <> 1 then
        raise exception '0101: قيمةٌ في listLabel لم تدخل الفهرس — الحقل لا يُترجَم';
      end if;
      if exists (select 1 from public.sections where id = v_sec and content ? 'listLabel') then
        raise exception '0101: شاهدُ الفهرس المؤقت لم يُرجَع — صفٌّ ملوَّث';
      end if;
      raise notice '  ← شاهدٌ إيجابي: قيمة listLabel تدخل الفهرس وتُسحب بلا أثر';
    end if;
  end;

  raise notice '✔ 0101: logo-strip.text_fields = {title,listLabel,note} · بلا كتابة محتوى · بلا فرقٍ في الفهرس';
end;
$$;
