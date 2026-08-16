-- ============================================================================
-- 0071 — أثر الكتابة على عنوان البطل يصير **بيانات**: حقلان في السجل، وبذرةٌ
--        لا تغيّر حرفاً واحداً مما يقرؤه الزائر اليوم
--
-- ── ما تفعله ───────────────────────────────────────────────────────────────
--
--   (١) `typingPrefix` و`typingLines` حقلان نصّيان في `block_registry` لكتلة
--       `hero` — فيظهران في المنشئ ويدخلان فهرس الترجمة كأي نثر.
--   (٢) بذرةٌ **مشروطة** على صفّ البطل في الرئيسية تكتب الحقلين من العنوان
--       القائم بلا أن تمسّه.
--
-- ── ولماذا الحقلان نصّيان لا «غير نصّيين» ──────────────────────────────────
--
-- كلاهما جملةٌ يقولها إنسان: «ايجار ليموزين» اسم الخدمة، و«بسعر مناسب و جودة
-- فريدة» وعدٌ يُقرأ. والسؤال الذي تشترطه `0065` §٢ على كل اسمٍ جديد — «هل هذا
-- الاسم جملةٌ يقولها إنسان؟» — جوابه هنا **نعم**، فلا يقترب أيٌّ منهما من
-- `NON_TEXT_FIELD_NAMES`، ولا يُمسّ `i18n_non_text_field` ولا
-- `block_registry_check`.
--
-- أما **إيقاع** الأثر (سرعة الكتابة · مهلة الثبات · سرعة المحو · أيتكرر) فليس
-- في هذا الجدول أصلاً: رموزٌ مغلقة تحت `content.style`، وهو مفتاحٌ محجوزٌ
-- بالاسم في `i18n_reserved_content_key` منذ `0058`. فلا صفَّ ترجمةٍ واحداً
-- لقيمةٍ مثل «normal»، ولا عمودَ جديد في السجل. والمبرر كاملاً في
-- `lib/page-builder-types.ts` §٥.
--
-- ── والبذرة مشروطة بشرطين، وكلاهما يمنع ضرراً مختلفاً ──────────────────────
--
--   • `not (content ? 'typingLines')` — من ضبط الأثر من اللوحة لا تُعاد بذرته
--     فوقه (سابقة `0064` حرفاً).
--   • **والعنوان ما زال هو العنوان الذي بُنيت عليه القسمة**. فإن بدّله المالك
--     منذ كتابة هذه الهجرة، **لا يُبذَر شيء** ويبقى البطل على `headline` كما
--     هو. والسبب أن القسمة إلى «ثابت + متناوب» قرارُ من كتب الجملة لا اشتقاقٌ
--     نصّي: تخمينُ موضع القطع في جملةٍ لم نرَها يعطي عنواناً مقطوعاً في منتصفه
--     على الصفحة الحيّة.
--
-- 🔒 **وما يقرؤه الزائر بعد الهجرة = ما يقرؤه قبلها بايتاً ببايت:**
--    'ايجار ليموزين' ‖ ' ' ‖ 'بسعر مناسب و جودة فريدة' = العنوان القائم.
--    والفحص §٣ يثبت هذه المعادلة نفسها قبل أن تُعلن الهجرة نجاحها — فلا يتغيّر
--    ما فهرسه جوجل، ولا يُصحَّح خطأٌ بعد الفهرسة.
--
-- ⚠ **ولا تُلمس `block_registry_check`**: الدالة تفحص أسماء الحقول وتقاطعها،
--    ولا تعترض اسمين نصّيين جديدين. وعدد صفوف الكتالوج يبقى ١٩.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (١) السجل — والترتيب جزءٌ من العقد لا زينة
--
-- `supabase/tests/page_builder_tests.sql` §(أ) يقارن المصفوفات **مرتّبة** بـ
-- `BLOCK_CATALOGUE` في `lib/page-builder-types.ts`. فالحقلان يقعان بعد
-- `headline` مباشرة — هناك موضعهما في العقد، وهناك يقرؤهما المالك في المنشئ:
-- العنوان، ثم ما يحلّ محلّه حين يُملأ.
-- ----------------------------------------------------------------------------

update public.block_registry
set text_fields = array['badge', 'headline', 'typingPrefix', 'typingLines', 'sub', 'scrollLabel', 'imageAlt']
where type = 'hero';

-- ----------------------------------------------------------------------------
-- (٢) البذرة المشروطة — إضافةٌ بـ`||` لا استبدال، فلا يُمسّ مفتاحٌ قائم
-- ----------------------------------------------------------------------------

update public.sections s
set content = s.content || jsonb_build_object(
  'typingPrefix', 'ايجار ليموزين',
  'typingLines',  'بسعر مناسب و جودة فريدة'
)
from public.pages p
where p.id = s.page_id
  and p.slug = 'home'
  and s.type = 'hero'
  and not (s.content ? 'typingLines')
  and s.content ->> 'headline' = 'ايجار ليموزين بسعر مناسب و جودة فريدة';

-- ----------------------------------------------------------------------------
-- (٣) الفحص الذاتي
-- ----------------------------------------------------------------------------

do $$
declare
  v_fields  text[];
  v_content jsonb;
  v_seeded  boolean;
begin
  select text_fields into v_fields from public.block_registry where type = 'hero';
  if v_fields is distinct from
     array['badge', 'headline', 'typingPrefix', 'typingLines', 'sub', 'scrollLabel', 'imageAlt'] then
    raise exception '0071: حقول hero النصّية لم تصل إلى شكل العقد — %', v_fields;
  end if;

  -- الحارس البنيوي ما زال يقبل الصفّ: اسمٌ نصّيٌّ جديد لا يجوز أن يتقاطع مع
  -- قائمةٍ غير نصّية ولا أن يعجز عن العنونة. ونداؤه هنا يجعل الرفض يقع في
  -- الهجرة لا على صفحةٍ حيّة.
  if (select public.block_registry_check(type, role, placement, accepts_children, max_children,
                                         text_fields, item_fields, required_fields,
                                         non_text_fields, non_text_item_fields)
      from public.block_registry where type = 'hero') is not null then
    raise exception '0071: الحارس البنيوي رفض صفّ hero بعد التوسيع — %',
      (select public.block_registry_check(type, role, placement, accepts_children, max_children,
                                          text_fields, item_fields, required_fields,
                                          non_text_fields, non_text_item_fields)
       from public.block_registry where type = 'hero');
  end if;

  select s.content into v_content
  from public.sections s
  join public.pages p on p.id = s.page_id
  where p.slug = 'home' and s.type = 'hero';

  if v_content is null then
    raise exception '0071: لا كتلة hero في الرئيسية';
  end if;

  v_seeded := v_content ? 'typingLines';

  if v_seeded then
    -- 🔴 المعادلة التي تجعل الصفحة الحيّة لا تتغيّر: الثابت + مسافة + المتناوب
    --    = العنوان القائم حرفاً. وهي تُقاس على الصفّ نفسه لا على نصٍّ مكتوب هنا.
    if (v_content ->> 'typingPrefix') || ' ' || (v_content ->> 'typingLines')
       is distinct from (v_content ->> 'headline') then
      raise exception '0071: القسمة لا تعيد بناء العنوان — «%» + «%» ≠ «%»',
        v_content ->> 'typingPrefix', v_content ->> 'typingLines', v_content ->> 'headline';
    end if;

    -- الدمج `||` سطحي، وخطؤه الوحيد المتصوَّر استبدال الكائن كله. وغياب الصورة
    -- أو الضمانات هو ما يكشف ذلك فوراً (سابقة `0064` §٣).
    if not (v_content ? 'src' and v_content ? 'items' and v_content ? 'sub') then
      raise exception '0071: محتوى البطل فقد مفاتيح — الدمج استبدل content بدل أن يضيف';
    end if;

    raise notice '0071 OK — الحقلان في السجل، والبذرة كتبت القسمة والعنوان المعروض لم يتغيّر';
  else
    -- ليس فشلاً: العنوان تغيّر أو الأثر مضبوطٌ سلفاً، فالبطل يبقى على `headline`.
    raise notice '0071 OK — الحقلان في السجل، ولا بذرة (العنوان ليس عنوان القسمة أو الأثر مضبوط سلفاً)';
  end if;
end $$;
