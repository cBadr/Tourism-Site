-- ============================================================================
-- 0083 — `_k` **نصٌّ** لا قيمةٌ يقرؤها `->>` نصّاً: إغلاق انحرافٍ بين حارسين
--
-- ── العطب: حارسان يحكمان على الشكل نفسه ويختلفان ───────────────────────────
--
-- `0082` كتبت `items_key_check` بـ`e ->> '_k' ~ '^[a-z0-9]{6}$'`. و`->>` تُخرج
-- **نصّاً من أي نوع**: فالعنصر `{"_k": 123456}` — ورقمٌ لا نصّ — يمرّ من حارس
-- القاعدة سالماً.
--
-- بينما العقد في `lib/page-builder/item-keys.ts` صريح:
--
--     isValidItemKey(v) => typeof v === "string" && ITEM_KEY_PATTERN.test(v)
--
-- 🔴 **وعاقبة الانحراف هي العطب الذي كُتبت `0082` لقتله، عائداً من بابٍ ثانٍ:**
-- صفٌّ بـ`_k` رقمي يمرّ من القاعدة ويُكتب، ثم **يرفضه `validateBlocks` في
-- المنشئ** — فيجد المالك صفحةً لا يستطيع حفظها، ولا شيء في أي شاشة يقول لماذا.
-- أي حارسٌ يقبل ما يرفضه أخوه أسوأ من لا حارس: يترك بياناتٍ مسدودة الطريق.
--
-- 💡 وكيف انكشف: التأكيد (س-١) في `page_builder_tests.sql` جرّب الحالة كتابةً
--    حقيقية فقُبلت — وهو بالضبط ما تشتريه الحالاتُ المكتوبة كتابةً لا نداءً.
--
-- ⚠ **ولا تُعدَّل `0082`** — هجرةٌ طُبِّقت لا تُمسّ (قاعدة المستودع). التصحيح
--    هجرةٌ تالية، والدالة تُستبدل بـ`create or replace` فيلتقطها الحارس
--    والاختبار معاً بلا لمس المشغّل.
-- ============================================================================

create or replace function public.items_key_check(p_items jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_items is null or p_items = 'null'::jsonb then null
    when jsonb_typeof(p_items) <> 'array' then 'template-shape'
    when exists (
      select 1 from jsonb_array_elements(p_items) e where jsonb_typeof(e) <> 'object'
    ) then 'template-shape'
    -- 🔒 النوع **قبل** النمط — مرآة `typeof value === "string"` في العقد.
    --    و`->>` وحدها كانت تقبل الرقم `123456` لأنها تُنصّص ما ليس نصّاً.
    when exists (
      select 1 from jsonb_array_elements(p_items) e
      where jsonb_typeof(e -> '_k') is distinct from 'string'
         or (e ->> '_k') !~ '^[a-z0-9]{6}$'
    ) then 'item-key'
    when (select count(distinct e ->> '_k') from jsonb_array_elements(p_items) e)
       <> (select count(*) from jsonb_array_elements(p_items) e) then 'item-key'
    else null
  end;
$$;

comment on function public.items_key_check(jsonb) is
  'رمز رفض مصفوفة العناصر أو null — مرآة isValidItemKey/isItemArray في lib/page-builder/item-keys.ts (النوع نصّ ثم النمط)';

-- ----------------------------------------------------------------------------
-- الفحص الذاتي — الاتجاهان معاً، ولا صفَّ حيّاً يسقط بالتشديد
-- ----------------------------------------------------------------------------

do $$
declare
  v_n integer;
begin
  -- (أ) الرقم يُرفض الآن — وهو الحالة التي انكشفت
  if public.items_key_check('[{"_k":123456,"q":"س"}]'::jsonb) is distinct from 'item-key' then
    raise exception '0083: `_k` رقمياً ما زال يمرّ';
  end if;
  -- ومعه بقية الأنواع التي تُنصّصها `->>`
  if public.items_key_check('[{"_k":true,"q":"س"}]'::jsonb) is distinct from 'item-key' then
    raise exception '0083: `_k` منطقياً ما زال يمرّ';
  end if;
  if public.items_key_check('[{"_k":null,"q":"س"}]'::jsonb) is distinct from 'item-key' then
    raise exception '0083: `_k` = null ما زال يمرّ';
  end if;

  -- (ب) شاهدٌ إيجابي: النصّ الصالح يبقى صالحاً — التشديد لم يقفل الباب كله
  if public.items_key_check('[{"_k":"a1b2c3","q":"س"},{"_k":"z9y8x7","q":"ص"}]'::jsonb) is not null then
    raise exception '0083: التشديد رفض شكلاً قانونياً';
  end if;
  if public.items_key_check('[]'::jsonb) is not null then
    raise exception '0083: التشديد رفض قائمةً فارغة';
  end if;

  -- (ج) ولا صفَّ حيّاً يسقط به
  select count(*) into v_n
  from public.sections s
  where public.items_key_check(s.content -> 'items') is not null;
  if v_n <> 0 then
    raise exception '0083: % صفاً حيّاً سقط بالتشديد', v_n;
  end if;

  raise notice '0083 OK — `_k` غير النصّي مرفوض، والنصّي الصالح يمرّ، وصفر صفٍّ حيّ سقط';
end $$;
