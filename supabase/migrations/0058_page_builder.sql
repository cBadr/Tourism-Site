-- ============================================================================
-- 0058_page_builder.sql — طبقة القاعدة لمنشئ الصفحات (المرحلة ١٣)
--
-- العقد المُلزِم: `lib/page-builder-types.ts` (١٣ قسماً) + موجز
-- `docs/phase-briefs/PAGE-BUILDER.md`. لا قرار هنا خارجهما، وكل انحراف مذكور
-- باسمه في ترويسة قسمه.
--
-- ── ما قِيس على القاعدة الحيّة قبل كتابة سطرٍ واحد (2026-08-15) ─────────────
--
-- | ما قِيس | القيمة | المصدر |
-- |---|---|---|
-- | هجرات مطبَّقة | **٥٧** آخرها `0057_telegram_binding_guard.sql` | `schema_migrations` |
-- | `pages_kind_check` | `home\|service\|corridor\|static` — **بلا `landing`** | `pg_constraint` |
-- | `sections` أعمدة | ٦: `id·page_id·type·content·sort·visible` — **بلا `parent_id`** | `information_schema` |
-- | `sections.type` | **بلا قيد `check`** — نوع كتلةٍ جديد لا يحتاج تعديل قيد | `pg_constraint` |
-- | صفوف الفهرس `translation_corpus()` | **٣٦١**: `section` ٢٩٠ · `page` ٥١ · `vehicle` ٨ · `service` ٦ · `settings` ٦ | نداء حيّ |
-- | صفحات · أقسام | ١٧ · ٩٣ (كلها `parent_id` معدوم بحكم عدم وجود العمود) | نداء حيّ |
-- | `profiles.role` | `admin \| ops \| subcontractor \| customer` | `pg_constraint` |
-- | منح `pages`/`sections` | `anon`: `SELECT` فقط · `authenticated`: قراءة/كتابة بلا `TRUNCATE` (‏`0041`) | `information_schema.table_privileges` |
-- | مُشغّلات قائمة | `pages`: `audit_pages` · `pages_touch_updated_at` — `sections`: `audit_sections` | `pg_trigger` |
-- | `page-hero` بلا عنوان | **صفر** من ١٦ | نداء حيّ |
-- | صفحة بوصف سيو فارغ | **صفر** من ١٧ | نداء حيّ |
-- | صفوف `redirects` | **صفر** | نداء حيّ |
--
-- 🔒 **صفر صفٍّ من بيانات المالك يتغيّر في هذا الملف.** ولا ترحيل بيانات
-- إطلاقاً (القرار ١): `pages` و`sections` يبقيان النموذج (**D-23**)، فتبقى الـ
-- ٢٩٠ مفتاح ترجمة المبنية على `sections.id` كما هي حرفاً بحرف.
--
-- ── ما **لا** يفعله هذا الملف ──────────────────────────────────────────────
--
-- لا يلمس `i18n_corpus_rows` ولا `i18n_apply` — جراحة `_k` ملفٌ مستقل
-- (`0059_i18n_stable_item_keys.sql`) بجسمَين من `pg_get_functiondef` (**D-58**)،
-- وشرط إغلاقه ٣٦١ صفَّ فهرس متطابقة قبل/بعد.
--
-- المرجع: D-20 (‏`authenticated` ليس مشرفاً) · D-23 · D-24 · D-25 · D-48
--         (النشر معاملةٌ واحدة) · D-58 · القاعدة الذهبية ١٦ (‏`TRUNCATE` لا
--         تغطيها RLS — المنحة هي الحارس) · ١٧ · ١٨ · ١٩.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (١) `pages.kind` يقبل النوع الرابع `landing`
--
-- القيد قائمٌ ومقيس على أربع قيم، فالنوع الخامس يحتاج هجرة (بخلاف
-- `sections.type` الذي بلا قيد). و`landing` نوعٌ مستقل لا إعادةُ استعمال
-- `static`: `PRIORITY` في `app/sitemap.ts` و`pagePublicPath` وقائمة
-- `/admin/content` كلها تفرّق بين «سياسة الخصوصية» و«صفحة هبوط تسويقية».
--
-- ⚠ توسيعٌ لا تضييق: كل صفٍّ قائم يمرّ من القيد الجديد كما مرّ من القديم.
-- ----------------------------------------------------------------------------

alter table public.pages drop constraint if exists pages_kind_check;
alter table public.pages
  add constraint pages_kind_check
  check (kind in ('home', 'service', 'corridor', 'static', 'landing'));

comment on column public.pages.kind is
  'نوع الصفحة. `landing` (منذ 0058) = صفحة يبنيها المالك في المنشئ وتُصيَّر على '
  '/{slug} من app/[slug]/page.tsx نفسه بلا بادئة لغة (D-24) وبلا ملف مسار جديد.';

-- ----------------------------------------------------------------------------
-- (٢) `sections.parent_id` و`block_key` — «التداخل» تداخلَ **كتل** لا حقول
--
-- القرار ٢ في العقد §٣: العمق يعيش في **صفوف** الجدول لا في `jsonb`. والسبب
-- ليس ذوقاً معمارياً: طبقة الترجمة تفهرس **مستويين من جذر القسم** لا أكثر، وكل
-- عمقٍ زائد داخل `content` **لا ينفجر بل يختفي** — نصٌّ عربي يُخدَم على `/en`
-- بلا أن يظهر في الطابور ولا في `translation_progress`. أما الكتلة الابنة فقسمٌ
-- له `id` خاص، فنصوصها مفهرسة تلقائياً بلا سطرٍ جديد في الفهرس.
--
-- `block_key`: مفتاح الكتلة الثابت داخل قالبٍ مصدَّر — يسمح لاستيراد قالبٍ أن
-- يطابق كتلةً بكتلة بلا الاتكاء على الترتيب. اختياريٌّ دائماً: الأقسام الـ٩٣
-- القائمة لا تحمله ولا تحتاجه.
-- ----------------------------------------------------------------------------

alter table public.sections add column if not exists parent_id uuid;
alter table public.sections add column if not exists block_key text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.sections'::regclass and conname = 'sections_parent_id_fkey'
  ) then
    alter table public.sections
      add constraint sections_parent_id_fkey
      foreign key (parent_id) references public.sections(id) on delete cascade;
  end if;
end;
$$;

-- 🔒 لا يشير الصفّ إلى نفسه. الحفيد يمنعه المُشغّل (٩) لأنه يحتاج قراءة صفٍّ آخر.
alter table public.sections drop constraint if exists sections_parent_not_self_chk;
alter table public.sections
  add constraint sections_parent_not_self_chk check (parent_id is distinct from id);

alter table public.sections drop constraint if exists sections_block_key_chk;
alter table public.sections
  add constraint sections_block_key_chk
  check (block_key is null or block_key ~ '^[a-z0-9][a-z0-9_-]{0,63}$');

-- قراءة أبناء كتلةٍ بترتيبهم — المسار الوحيد الذي تسلكه العارضة والمنشئ معاً
create index if not exists sections_parent_id_sort_idx
  on public.sections (parent_id, sort) where parent_id is not null;

-- مفتاح الكتلة فريدٌ **داخل الصفحة**: قالبٌ مستورَد يلصق مفاتيحه على صفحةٍ
-- واحدة، وتكرارها فيها يجعل المطابقة عند إعادة الاستيراد عشوائية.
create unique index if not exists sections_page_block_key_key
  on public.sections (page_id, block_key) where block_key is not null;

comment on column public.sections.parent_id is
  'الكتلة الأمّ (`columns` وحدها اليوم). مستوى واحد لا غير — الحفيد يرفضه '
  'sections_guard_depth. العمق هنا في الصفوف لا في jsonb، فيبقى كل نصٍّ على '
  'مستويين من جذر قسمه وهو بالضبط ما يعنونه فهرس الترجمة.';
comment on column public.sections.block_key is
  'مفتاح الكتلة الثابت داخل قالبٍ مصدَّر — للمطابقة عند الاستيراد بلا اتكاء على الترتيب.';

-- ----------------------------------------------------------------------------
-- (٣) `block_registry` — كتالوج الكتل في القاعدة، مرآةً لـ`BLOCK_CATALOGUE`
--
-- الأعمدة **تسعة بالضبط** — لا عاشر — مطابقةً لـ`BlockRegistryRow` في العقد
-- §١٣. والسبب عملي لا تجميلي: قارئٌ يكتب `select("*")` يجب أن يحصل على شكلٍ
-- يطابق النوع الذي يقرأ به، وعمودٌ زائد هنا يعني نوعين ينحرفان يوم يُضاف.
-- ----------------------------------------------------------------------------

create table if not exists public.block_registry (
  type             text primary key,
  role             text not null check (role in ('layout', 'content', 'system')),
  placement        text not null check (placement in ('any', 'once-per-page', 'home-only')),
  accepts_children boolean not null default false,
  max_children     integer,
  text_fields      text[] not null default '{}'::text[],
  item_fields      text[],
  required_fields  text[] not null default '{}'::text[],
  enabled          boolean not null default true
);

comment on table public.block_registry is
  'كتالوج كتل المنشئ — مرآةُ BLOCK_CATALOGUE في lib/page-builder-types.ts. '
  'تسعة أعمدة بالضبط مطابقةً لـBlockRegistryRow؛ واختبار page_builder_tests '
  'يقارن الجدول بالعقد ويفشل عند الانحراف.';

-- ----------------------------------------------------------------------------
-- (٤) الحارس البنيوي على الكتالوج — الشكل غير القانوني **لا يُكتب**
--
-- العقد §٦ يطلبه صراحةً: «الشكل غير القانوني لا يُكتب بدل أن يُكتشف لاحقاً
-- بكاشفٍ نصّي (القاعدة الذهبية ١٩)». وهو ليس فحصاً على البذرة وحدها بل مُشغّل
-- على الجدول — فكاتب الكتلة القادم يصطدم به وقت الكتابة لا وقت التصيير.
--
-- ما يُرفض ولماذا:
--   • حقلٌ لا تستطيع قواعد العنونة في §٤ أن تعنونه (اسمٌ فيه نقطة أو رقم أو
--     `items` نفسها) ⇒ مفتاح ترجمة لا يُفكّ إلى مسارٍ ثانٍ.
--   • حقلٌ محجوز (`_k` · `style`) ⇒ يصطدم بمفتاح العنصر أو بمنطقة التنسيق.
--   • `accepts_children` بلا `role='layout'` والعكس ⇒ كتلةٌ تحمل نصاً وأبناءً
--     معاً، فيصير للنص مستويان مختلفان في الصفحة نفسها.
--   • حقلٌ في `required_fields` لا مكان له في العنونة ولا في
--     `NON_TEXT_CONTENT_FIELDS` ⇒ «إلزاميٌّ لا يمكن ملؤه» = كتلة لا تُصيَّر أبداً.
-- ----------------------------------------------------------------------------

create or replace function public.block_registry_check(
  p_type             text,
  p_role             text,
  p_placement        text,
  p_accepts_children boolean,
  p_max_children     integer,
  p_text_fields      text[],
  p_item_fields      text[],
  p_required_fields  text[]
)
returns text
language plpgsql
immutable
as $$
declare
  v_f text;
  -- المفاتيح المحجوزة = RESERVED_CONTENT_KEYS في العقد §٤
  v_reserved constant text[] := array['_k', 'style'];
  -- المفتاح غير النصّي الوحيد المسموح خارج `style` = NON_TEXT_CONTENT_FIELDS
  v_non_text constant text[] := array['src'];
begin
  if p_type is null or btrim(p_type) = '' then
    return 'type-empty';
  end if;

  -- (أ) الحقول النصية العليا: اسمٌ بسيط يصلح مقطعاً في `<sectionId>.<field>`
  foreach v_f in array coalesce(p_text_fields, '{}'::text[]) loop
    if v_f !~ '^[a-zA-Z][a-zA-Z0-9]*$' then
      return 'text-field-not-addressable:' || v_f;
    end if;
    if v_f = 'items' or v_f = any (v_reserved) then
      return 'text-field-reserved:' || v_f;
    end if;
  end loop;

  -- (ب) حقول العنصر: نفس القاعدة — مقطعٌ في `<sectionId>.items.<_k>.<field>`
  if p_item_fields is not null then
    if cardinality(p_item_fields) = 0 then
      return 'item-fields-empty';
    end if;
    foreach v_f in array p_item_fields loop
      if v_f !~ '^[a-zA-Z][a-zA-Z0-9]*$' then
        return 'item-field-not-addressable:' || v_f;
      end if;
      if v_f = 'items' or v_f = any (v_reserved) then
        return 'item-field-reserved:' || v_f;
      end if;
    end loop;
  end if;

  -- (ج) التخطيط والدور توأمان: `layout` وحدها تحمل أبناءً، وهي وحدها بلا نصّ
  if coalesce(p_accepts_children, false) <> (p_role = 'layout') then
    return 'layout-role-mismatch';
  end if;

  if coalesce(p_accepts_children, false) then
    if p_max_children is null or p_max_children < 1 or p_max_children > 12 then
      return 'max-children-invalid';
    end if;
    if cardinality(coalesce(p_text_fields, '{}'::text[])) > 0 or p_item_fields is not null then
      return 'layout-carries-text';
    end if;
  elsif p_max_children is not null then
    return 'max-children-on-leaf';
  end if;

  -- (د) الإلزامي يجب أن يكون قابلاً للملء: نصٌّ أعلى، أو `items`، أو `src`
  foreach v_f in array coalesce(p_required_fields, '{}'::text[]) loop
    if v_f = 'items' then
      if p_item_fields is null then
        return 'required-items-without-item-fields';
      end if;
    elsif not (v_f = any (coalesce(p_text_fields, '{}'::text[])) or v_f = any (v_non_text)) then
      return 'required-field-unfillable:' || v_f;
    end if;
  end loop;

  return null;
end;
$$;

comment on function public.block_registry_check(text, text, text, boolean, integer, text[], text[], text[]) is
  'هل يطابق صفُّ كتالوجٍ قواعدَ العنونة في lib/page-builder-types.ts §٤–§٦؟ '
  'يرجع رمز سبب الرفض أو null. مصدرٌ واحد يقرؤه المُشغّل والبذرة والاختبار.';

create or replace function public.block_registry_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text;
begin
  v_reason := public.block_registry_check(
    new.type, new.role, new.placement, new.accepts_children,
    new.max_children, new.text_fields, new.item_fields, new.required_fields);

  if v_reason is not null then
    raise exception 'كتلة «%» تعلن شكلاً لا تعنونه قواعد الترجمة: %', new.type, v_reason
      using hint = 'block-registry-shape';
  end if;

  return new;
end;
$$;

drop trigger if exists block_registry_guard on public.block_registry;
create trigger block_registry_guard
  before insert or update on public.block_registry
  for each row execute function public.block_registry_guard();

-- ----------------------------------------------------------------------------
-- (٥) بذرة الكتالوج — الاثنتا عشرة كتلة حرفياً كما في `BLOCK_CATALOGUE`
--
-- 🔴 `page-hero` إلزامُها `title`، وهذا **إصلاحٌ لا تسجيل**: العارضة اليوم
-- تُصيَّر `content.title` بلا شرط، والمحتوى الابتدائي لقسمٍ جديد `{title:""}`
-- ⇒ `<h1>` فارغ على صفحة عامة. البند مكتوبٌ في العقد §١٠ بندَ مرحلةٍ لا تحسيناً.
-- ----------------------------------------------------------------------------

insert into public.block_registry
  (type, role, placement, accepts_children, max_children, text_fields, item_fields, required_fields, enabled)
values
  -- ── كتلٌ حرّة ──────────────────────────────────────────────────────────
  ('rich-text',     'content', 'any',           false, null, array['title','body'],            null,                        array['body'],       true),
  ('page-hero',     'content', 'any',           false, null, array['title','sub','ctaLabel'],  null,                        array['title'],      true),
  ('features',      'content', 'any',           false, null, array['title','sub'],             array['title','text'],       array['items'],      true),
  ('faq',           'content', 'any',           false, null, array['title'],                   array['q','a'],              array['items'],      true),
  ('cta-band',      'content', 'any',           false, null, array['title','note'],            null,                        '{}'::text[],        true),
  -- ── كتل النظام: بياناتها من الإعدادات، فتكرارها يكرر المحتوى حرفياً ────
  ('services-grid', 'system',  'once-per-page', false, null, array['title','sub'],             null,                        '{}'::text[],        true),
  ('fleet',         'system',  'once-per-page', false, null, array['title','sub'],             null,                        '{}'::text[],        true),
  ('why-us',        'system',  'once-per-page', false, null, array['title','sub'],             null,                        '{}'::text[],        true),
  ('contact',       'system',  'once-per-page', false, null, array['title','sub'],             null,                        '{}'::text[],        true),
  -- `hero` وحدها تركّب ويدجت الحجز، ونسختان منها = ويدجتان على صفحة واحدة
  ('hero',          'system',  'home-only',     false, null, array['headline','sub'],          null,                        '{}'::text[],        true),
  -- ── الكتلتان الجديدتان ────────────────────────────────────────────────
  ('columns',       'layout',  'any',           true,  4,    '{}'::text[],                     null,                        '{}'::text[],        true),
  -- `alt` نصٌّ قابل للترجمة لا سمةٌ تقنية، و`src` المفتاح غير النصّي الوحيد
  ('image',         'content', 'any',           false, null, array['alt','caption'],           null,                        array['src','alt'],  true)
on conflict (type) do update set
  role             = excluded.role,
  placement        = excluded.placement,
  accepts_children = excluded.accepts_children,
  max_children     = excluded.max_children,
  text_fields      = excluded.text_fields,
  item_fields      = excluded.item_fields,
  required_fields  = excluded.required_fields,
  enabled          = excluded.enabled;

-- ----------------------------------------------------------------------------
-- (٦) `reserved_slugs` — محجوزاتُ المسار، مبذورةً من مصدرها في المستودع
--
-- 🔴 **العطب قائمٌ اليوم ولا يحرسه شيء:** `createPage` يقبل أي slug يطابق
-- النمط، بينما `app/[slug]/page.tsx` يرفض بـ`notFound()` كل slug في
-- `RESERVED_SLUGS`. أي أن المالك **يستطيع الآن** إنشاء صفحة `book` ونشرها
-- ورؤيتها «منشورة» في اللوحة — وهي ٤٠٤ للأبد. Next يقدّم المقطع الثابت دائماً،
-- فالملف يفوز ولا مجال لغير ذلك؛ والحلّ **رفضٌ عند الحفظ** لا تحذير.
--
-- المصادر المنسوخة نصّاً (وفحصٌ في `page_builder_tests.sql` يقارنها):
--   • `RESERVED_SLUGS`        في `app/[slug]/page.tsx`
--   • `APP_OWNED_PATHS` · `RESERVED_PATH_PREFIXES` · `RESERVED_EXACT_FILES`
--     في `lib/seo/site-paths.ts`
--
-- ⚠ **و`about` استثناءٌ مقيس لا سهو:** `app/about/page.tsx` **يقرأ صفَّ الصفحة
-- فعلاً** (‏`getPageBySlug("about")`) ويشترط `kind === "static"`. فالصفّ القائم
-- ليس عطباً بل هو كيف يعمل الموقع اليوم — ورفضُه كان سيمنع المالك من تحرير
-- صفحة «من نحن». ولذلك يُسجَّل بـ`kind_exception='static'`: مسموحٌ لهذا النوع
-- وحده، ومرفوضٌ لـ`landing` (الذي يعطي ٤٠٤ لأن الملف يشترط `static`).
-- و`book`/`track`/`quote-request` **لا تقرأ صفاً** — فهي رفضٌ بلا استثناء.
-- ----------------------------------------------------------------------------

create table if not exists public.reserved_slugs (
  slug           text primary key,
  reason         text not null check (reason in ('slug-reserved', 'slug-prefix')),
  kind_exception text,
  note           text
);

comment on table public.reserved_slugs is
  'مقاطع الجذر التي يملكها ملفٌ في app/ فلا يجوز أن تحملها صفحة static/landing. '
  'مبذورة نصّاً من lib/seo/site-paths.ts و app/[slug]/page.tsx — واختبار '
  'page_builder_tests يقارن الجدول بالقائمتين ويفشل عند الانحراف.';

insert into public.reserved_slugs (slug, reason, kind_exception, note) values
  -- APP_OWNED_PATHS + RESERVED_SLUGS — ملفٌ حقيقي على الجذر
  ('about',                'slug-reserved', 'static', 'app/about/page.tsx يقرأ صفَّ الصفحة ويشترط kind=static'),
  ('book',                 'slug-reserved', null,     'app/book — نموذج الحجز، لا يقرأ صفاً'),
  ('quote-request',        'slug-reserved', null,     'app/quote-request — لا يقرأ صفاً'),
  ('track',                'slug-reserved', null,     'app/track — تابع حجزك، لا يقرأ صفاً'),
  -- RESERVED_PATH_PREFIXES — بادئات يملكها مقطع ديناميكي أو نظام آخر
  ('services',             'slug-prefix',   null,     '/services/[slug]'),
  ('routes',               'slug-prefix',   null,     '/routes/[slug]'),
  ('booking',              'slug-prefix',   null,     '/booking/[token]'),
  ('payment',              'slug-prefix',   null,     '/payment/*'),
  ('account',              'slug-prefix',   null,     'منطقة حساب العميل — noindex بطبيعتها'),
  ('admin',                'slug-prefix',   null,     'اللوحة'),
  ('portal',               'slug-prefix',   null,     'بورتال المتعهدين'),
  ('api',                  'slug-prefix',   null,     'واجهات API'),
  ('brand',                'slug-prefix',   null,     'أصول العلامة'),
  ('images',               'slug-prefix',   null,     'أصول الصور'),
  -- RESERVED_EXACT_FILES — يولّدها التطبيق. لا تطابق نمط الـslug أصلاً،
  -- وتُسجَّل حتى تكون الرسالة «محجوز» لا «صيغة خاطئة» إن غُيّر النمط يوماً.
  ('favicon.ico',          'slug-reserved', null,     'ملف سيو يولّده التطبيق'),
  ('robots.txt',           'slug-reserved', null,     'ملف سيو يولّده التطبيق'),
  ('sitemap.xml',          'slug-reserved', null,     'ملف سيو يولّده التطبيق'),
  ('manifest.webmanifest', 'slug-reserved', null,     'ملف سيو يولّده التطبيق')
on conflict (slug) do update set
  reason         = excluded.reason,
  kind_exception = excluded.kind_exception,
  note           = excluded.note;

-- `_next` مقصودٌ خارج الجدول: لا يطابق `SLUG_PATTERN` (يبدأ بشرطة سفلية) فيُرفض
-- بـ`slug-format` قبل أن يصل فحص المحجوزات — وتسجيلُه كان سيعطي رمزاً مضلِّلاً.

-- ----------------------------------------------------------------------------
-- (٧) `page_revisions` — المسودة لقطةً، والمنشور تاريخاً
--
-- المنشئ يكتب هنا ولا يلمس `sections` إلا لحظة النشر. والفائدة ليست تنظيمية:
-- القراءة العامة و`i18n_corpus_rows` تقرآن `sections` وحدها ⇒ **المسودة لا تصل
-- الفهرس ولا الطابور ولا `enabled_locales`** ⇒ **D-25** يبقى مفروضاً بلا سطرٍ
-- إضافي، ولا تتضخم الترجمة بنصوصٍ لم تُنشر.
--
-- الأعمدة **سبعة بالضبط** مطابقةً لـ`PageRevisionRow` في العقد §٧ — قارئٌ
-- يكتب `select("*")` يحصل على الشكل الذي يقرأ به تماماً.
--
-- 🔒 **مسودةٌ واحدة مفتوحة لكل صفحة** (فهرس فريد جزئي): العقد §١٣ يصف
-- `draftRevisionId` مفرداً، ومسودتان مفتوحتان تجعلان «أيّهما المفتوحة؟» سؤالاً
-- بلا جواب — وهو بالضبط ما يولّد `stale-revision` بلا سبب مفهوم.
-- ----------------------------------------------------------------------------

create table if not exists public.page_revisions (
  id           uuid primary key default gen_random_uuid(),
  page_id      uuid not null references public.pages(id) on delete cascade,
  status       text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  snapshot     jsonb not null default '{}'::jsonb,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  published_at timestamptz
);

alter table public.page_revisions drop constraint if exists page_revisions_snapshot_chk;
alter table public.page_revisions
  add constraint page_revisions_snapshot_chk
  check (jsonb_typeof(snapshot) = 'object');

-- لقطةٌ منشورة بلا ختم نشر تكذب على السجل، والمؤرشفة تحتفظ بختمها
alter table public.page_revisions drop constraint if exists page_revisions_published_at_chk;
alter table public.page_revisions
  add constraint page_revisions_published_at_chk
  check (status <> 'published' or published_at is not null);

create unique index if not exists page_revisions_one_draft_per_page
  on public.page_revisions (page_id) where status = 'draft';

create index if not exists page_revisions_page_created_idx
  on public.page_revisions (page_id, created_at desc);

comment on table public.page_revisions is
  'لقطة الصفحة كاملةً بأقسامها (jsonb). المسودة تعيش هنا ولا تصل sections ولا '
  'فهرس الترجمة إلا عبر publish_page_revision — وبذلك يبقى D-25 مفروضاً بلا '
  'سطر إضافي. سبعة أعمدة بالضبط مطابقةً لـPageRevisionRow في العقد §٧.';

-- ----------------------------------------------------------------------------
-- (٨) المنح — 🔒 القاعدة الذهبية ١٦: `TRUNCATE` لا تغطيها RLS، فالمنحة هي الحارس
--
-- سحبٌ شامل أولاً ثم منحٌ صريح — لا اتكال على ما ورثه الجدول من `public` أو من
-- `alter default privileges`. و`anon` **لا يلمس أياً من الثلاثة**:
--   • `page_revisions` تحمل مسودةً غير منشورة = بيانات مالكٍ خالصة.
--   • `block_registry` و`reserved_slugs` لا يحتاجهما الموقع العام إطلاقاً
--     (العارضة تقرأ الكتالوج من حزمة TypeScript لا من القاعدة).
--
-- ⚠ **ولماذا `block_registry` و`reserved_slugs` مقروءان لكل `authenticated`
-- بينما `page_revisions` لا؟** لأن الأولين **ليسا بيانات مالك**: محتواهما
-- مطابقٌ حرفياً لثوابت تُشحن في حزمة المتصفح (‏`BLOCK_CATALOGUE` ·
-- `APP_OWNED_PATHS`)، أي أن أي زائر يقرؤهما من ملف JS اليوم. وحصرُهما على
-- `is_admin()` كان سيصنع العطب الذي كسر شاشةً في هذا المشروع من قبل: دور `ops`
-- يفتح المنشئ للقراءة (القرار ٤) فيحصل على **صفر صفٍّ بلا خطأ** ⇒ كل كتلة
-- «نوع غير معروف» وشاشةٌ ميتة بلا رسالة. أما `page_revisions` فمسودةٌ لم
-- يقررها المالك بعد، ومنحُها لـ`authenticated` يعني **كل متعهد** (‏**D-20**).
-- ----------------------------------------------------------------------------

alter table public.block_registry  enable row level security;
alter table public.reserved_slugs  enable row level security;
alter table public.page_revisions  enable row level security;

revoke all on table public.block_registry from public, anon, authenticated;
revoke all on table public.reserved_slugs from public, anon, authenticated;
revoke all on table public.page_revisions from public, anon, authenticated;

-- الكتالوجان: قراءةٌ فقط، وبلا `insert/update/delete` لأي دور مستخدم —
-- تعديلُهما هجرةٌ لا نقرة (هما كودٌ في صورة صفوف).
grant select on public.block_registry to authenticated;
grant select on public.reserved_slugs to authenticated;

-- اللقطات: الكتابة بحراسة RLS (‏`is_admin()`)، **وبلا `truncate` أبداً**
grant select, insert, update, delete on public.page_revisions to authenticated;

grant all on public.block_registry to service_role;
grant all on public.reserved_slugs to service_role;
grant all on public.page_revisions to service_role;

-- ── سياسات الكتالوجَين: قراءةٌ للمسجَّل، ولا كتابة لأحد ────────────────────
drop policy if exists "block_registry_select_authenticated" on public.block_registry;
create policy "block_registry_select_authenticated"
  on public.block_registry for select to authenticated using (true);

drop policy if exists "reserved_slugs_select_authenticated" on public.reserved_slugs;
create policy "reserved_slugs_select_authenticated"
  on public.reserved_slugs for select to authenticated using (true);

-- ── سياسات اللقطات: `is_admin()` في الاتجاهات الأربعة ─────────────────────
-- 🔒 لا سياسة `select` عريضة على جدولٍ يحمل مسودة المالك. ودور `ops` يقرأ
--    ما يحتاجه عبر دوال `security definer` ذات إسقاطٍ مُدرَج (القسم ١٣) وحدها.
drop policy if exists "page_revisions_select_admin" on public.page_revisions;
create policy "page_revisions_select_admin"
  on public.page_revisions for select to authenticated using (public.is_admin());

drop policy if exists "page_revisions_insert_admin" on public.page_revisions;
create policy "page_revisions_insert_admin"
  on public.page_revisions for insert to authenticated with check (public.is_admin());

drop policy if exists "page_revisions_update_admin" on public.page_revisions;
create policy "page_revisions_update_admin"
  on public.page_revisions for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "page_revisions_delete_admin" on public.page_revisions;
create policy "page_revisions_delete_admin"
  on public.page_revisions for delete to authenticated using (public.is_admin());

-- ----------------------------------------------------------------------------
-- (٩) الحارس البنيوي على العمق — مستوى واحد، ولا دورة، ولا أبٌ لا يقبل أبناءً
--
-- 🔒 **في القاعدة لا في الـ Server Action**: الإدراج المباشر عبر PostgREST أو
-- محرر SQL يتخطى الواجهة (نفس مبرر `bookings_guard_return_leg` في `0032`).
--
-- والحالة التي يسهل نسيانها هي **الاتجاه المعاكس**: صفٌّ له أبناءٌ يكتسب أباً.
-- الفحص من جهة الابن وحده يمرّرها، والنتيجة حفيدٌ بلا أن يُدرَج حفيد.
-- ----------------------------------------------------------------------------

create or replace function public.sections_guard_depth()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_parent_page   uuid;
  v_parent_parent uuid;
  v_parent_type   text;
  v_accepts       boolean;
  v_max           integer;
  v_n             integer;
begin
  -- تعديلٌ لا يمسّ النسب ولا الصفحة يمرّ كما هو — وهذا ما يجعل النشر
  -- (الذي يحدّث `content` لعشرات الصفوف) لا يدفع ثمن قراءةِ أبٍ لكل صفّ.
  if tg_op = 'UPDATE'
     and new.parent_id is not distinct from old.parent_id
     and new.page_id   is not distinct from old.page_id then
    return new;
  end if;

  if new.parent_id is null then
    return new;
  end if;

  select s.page_id, s.parent_id, s.type
    into v_parent_page, v_parent_parent, v_parent_type
  from public.sections s
  where s.id = new.parent_id;

  if not found then
    raise exception 'الكتلة الأمّ غير موجودة' using hint = 'orphan-child';
  end if;

  if v_parent_page <> new.page_id then
    raise exception 'الكتلة الأمّ تقع في صفحةٍ أخرى — الكتلة تتبع صفحتها لا صفحة أمّها'
      using hint = 'orphan-child';
  end if;

  if v_parent_parent is not null then
    raise exception 'حفيد: الكتلة الأمّ لها أمٌّ بدورها، والعمق المسموح مستوى واحد'
      using hint = 'depth-exceeded';
  end if;

  -- الاتجاه المعاكس: صفٌّ له أبناءٌ لا يجوز أن يكتسب أباً
  if exists (select 1 from public.sections s where s.parent_id = new.id) then
    raise exception 'هذه الكتلة أمٌّ لكتلٍ أخرى، فلا تصير ابنةً — ذلك حفيدٌ من الطرف الآخر'
      using hint = 'depth-exceeded';
  end if;

  select b.accepts_children, b.max_children
    into v_accepts, v_max
  from public.block_registry b
  where b.type = v_parent_type and b.enabled;

  if not coalesce(v_accepts, false) then
    raise exception 'الكتلة «%» لا تقبل أبناءً — التخطيط دورُ `columns` وحدها',
      coalesce(v_parent_type, '∅')
      using hint = 'block-placement';
  end if;

  if v_max is not null then
    select count(*) into v_n
    from public.sections s
    where s.parent_id = new.parent_id and s.id is distinct from new.id;
    if v_n >= v_max then
      raise exception 'الكتلة «%» تقبل % أبناءٍ على الأكثر', v_parent_type, v_max
        using hint = 'block-placement';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists sections_guard_depth on public.sections;
create trigger sections_guard_depth
  before insert or update on public.sections
  for each row execute function public.sections_guard_depth();

-- ----------------------------------------------------------------------------
-- (١٠) المسار العام والـ slug — مصدرٌ واحد يقرؤه المُشغّل والواجهة معاً
--
-- `page_public_path` مرآةُ `pagePublicPath` في `lib/seo/site-paths.ts` حرفياً.
-- ----------------------------------------------------------------------------

create or replace function public.page_public_path(p_kind text, p_slug text)
returns text
language sql
immutable
as $$
  select case p_kind
    when 'home'     then '/'
    when 'service'  then '/services/' || p_slug
    when 'corridor' then '/routes/'   || p_slug
    when 'static'   then '/' || p_slug
    when 'landing'  then '/' || p_slug
  end;
$$;

comment on function public.page_public_path(text, text) is
  'المسار العام لصفحة محتوى — مرآةُ pagePublicPath في lib/seo/site-paths.ts.';

-- الدالة الداخلية: **ممنوعةٌ على كل دور مستخدم** لأنها عرّافٌ عن وجود
-- الصفحات (بما فيها المسودات) — ومن يناديها إما مُشغّلٌ أو غلافٌ محروس.
create or replace function public.page_slug_conflict(
  p_kind text,
  p_slug text,
  p_page uuid
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_reason    text;
  v_exception text;
  v_path      text;
begin
  -- الرئيسية: `app/page.tsx` يملك `/` **ويقرأ صفَّ home**، فلا فحص محجوزات.
  -- والوحيد الممنوع صفحةُ رئيسيةٍ ثانية.
  if p_kind = 'home' then
    if exists (select 1 from public.pages p where p.kind = 'home' and p.id is distinct from p_page) then
      return 'slug-taken';
    end if;
    return null;
  end if;

  if p_slug is null or p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    return 'slug-format';
  end if;

  -- المحجوزات تخصّ المسار الجذري وحده — `/services/{slug}` و`/routes/{slug}`
  -- يملكهما ملفاهما ويقرآن الصفوف، فـslug اسمه `admin` تحتهما لا يصطدم بشيء.
  if p_kind in ('static', 'landing') then
    select r.reason, r.kind_exception into v_reason, v_exception
    from public.reserved_slugs r where r.slug = p_slug;

    if v_reason is not null and (v_exception is null or v_exception <> p_kind) then
      return v_reason;
    end if;
  end if;

  if exists (select 1 from public.pages p where p.slug = p_slug and p.id is distinct from p_page) then
    return 'slug-taken';
  end if;

  -- تحويلٌ مفعَّل يخطف المسار ⇒ الصفحة لن تُرى أبداً مهما نُشرت
  v_path := public.page_public_path(p_kind, p_slug);
  if v_path is not null
     and exists (select 1 from public.redirects r where r.enabled and r.from_path = v_path) then
    return 'slug-redirect';
  end if;

  return null;
end;
$$;

comment on function public.page_slug_conflict(text, text, uuid) is
  'هل يصطدم مسارُ صفحة بملفٍ في app/ أو بصفحةٍ أخرى أو بتحويل؟ يرجع SlugRejectCode '
  'أو null. ⚠ غير ممنوحة لأي دور مستخدم — تكشف وجود صفحاتٍ غير منشورة؛ '
  'الغلاف المحروس هو page_slug_reject.';

revoke all on function public.page_slug_conflict(text, text, uuid) from public, anon, authenticated;
grant execute on function public.page_slug_conflict(text, text, uuid) to service_role;

-- الغلاف الذي تناديه الواجهة: نفس المنطق، وحارس `is_admin()` **داخل الجسم**
-- لا في المنحة وحدها (سابقة `admin_partner_telegram` في `0057`).
create or replace function public.page_slug_reject(
  p_kind text,
  p_slug text,
  p_page uuid default null
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'هذا الفحص للإدارة وحدها' using hint = 'forbidden';
  end if;
  return public.page_slug_conflict(p_kind, p_slug, p_page);
end;
$$;

comment on function public.page_slug_reject(text, text, uuid) is
  'SlugRejectCode للـslug المقترح — تناديها شاشة إنشاء الصفحة لتعرض سبباً بعينه '
  'بدل error=save العام. رمزٌ لا جملة: الواجهة تترجمه، وإلا ظهرت العربية على /en.';

revoke all on function public.page_slug_reject(text, text, uuid) from public, anon;
grant execute on function public.page_slug_reject(text, text, uuid) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- (١١) مُشغّل رفض التصادم على `pages`
--
-- 🔒 **ولا يُطلق على صفٍّ لم يتغيّر مساره** (سابقة `0057` حرفياً): الصفّ القائم
-- `about` مسجَّلٌ محجوزاً باستثناءٍ لنوعه، لكن الشرط هنا يضمن أن أي صفحةٍ قائمة
-- تبقى قابلةً للتحرير في **كل** عمودٍ آخر (عنوان · ميتا · نشر · ترتيب) بلا أن
-- يعترضها حارسٌ عن مسارٍ لم يُلمس. ولولاه لصار عيبٌ في القائمة يجمّد صفحةً حيّة.
--
-- ⚠ ولا يكفي `update of slug` في تعريف المُشغّل: تلك الصيغة تنطلق حين **يُذكر**
-- العمود في `SET` ولو بالقيمة نفسها — وPostgREST يرسل الصفَّ كاملاً من كل شاشة.
-- ----------------------------------------------------------------------------

create or replace function public.pages_guard_slug()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
begin
  if tg_op = 'UPDATE'
     and new.slug is not distinct from old.slug
     and new.kind is not distinct from old.kind then
    return new;
  end if;

  v_code := public.page_slug_conflict(new.kind, new.slug, new.id);
  if v_code is null then
    return new;
  end if;

  -- 🔒 الرمز في `hint` — قناة الرمز المعتمدة في المشروع؛ والنصّ العربي للسجل
  --    ومحرر SQL وحدهما، فالواجهة تترجم الرمز بنفسها.
  raise exception
    'المسار «%» لا يصلح لصفحةٍ من نوع «%»: % — ملفٌ في app/ يفوز دائماً، فالصفحة كانت ستُنشر وتبقى ٤٠٤ للأبد',
    coalesce(public.page_public_path(new.kind, new.slug), new.slug), new.kind, v_code
    using hint = v_code;
end;
$$;

drop trigger if exists pages_guard_slug on public.pages;
create trigger pages_guard_slug
  before insert or update on public.pages
  for each row execute function public.pages_guard_slug();

-- ----------------------------------------------------------------------------
-- (١٢) الكتلة الابنة لا تُرى إن كانت أمُّها مخفيّة
--
-- بلا هذا القسم: يُخفي المالك كتلة `columns` فتبقى أعمدتها الأربعة مقروءةً من
-- القاعدة — والعارضة التي تبني الشجرة لا تجد لها أباً فتعرضها **جذوراً**. أي أن
-- «إخفاء» يزيد ما يُعرض بدل أن ينقصه.
--
-- ⚠ **والدالة `security definer` ضرورةٌ بنيوية لا زينة:** استعلامٌ على
-- `sections` من داخل سياسةٍ على `sections` نفسها يسبب **recursion لا نهائي** —
-- نفس السبب الذي كُتب من أجله `is_admin()` في `0001`.
--
-- 🔒 وهو تضييقٌ **صفريُّ الأثر على البيانات القائمة بالقياس**: كل صفوف
-- `sections` الـ٩٣ لها `parent_id` معدوم (العمود لم يكن موجوداً قبل هذا الملف).
-- ----------------------------------------------------------------------------

create or replace function public.section_parent_visible(p_parent uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_parent is null
      or exists (
        select 1 from public.sections s
        where s.id = p_parent and s.visible = true and s.parent_id is null
      );
$$;

comment on function public.section_parent_visible(uuid) is
  'هل الكتلة الأمّ ظاهرة (وجذراً)؟ definer لأن استعلام sections من داخل سياسة '
  'على sections نفسها يسبب recursion لا نهائي — سابقة is_admin() في 0001.';

grant execute on function public.section_parent_visible(uuid) to anon, authenticated, service_role;

drop policy if exists "sections_select_anon_visible" on public.sections;
create policy "sections_select_anon_visible"
  on public.sections for select to anon
  using (
    visible = true
    and exists (
      select 1 from public.pages p
      where p.id = sections.page_id and p.published = true
    )
    and public.section_parent_visible(sections.parent_id)
  );

drop policy if exists "sections_select_authenticated" on public.sections;
create policy "sections_select_authenticated"
  on public.sections for select to authenticated
  using (
    (
      visible = true
      and exists (
        select 1 from public.pages p
        where p.id = sections.page_id and p.published = true
      )
      and public.section_parent_visible(sections.parent_id)
    )
    or public.is_admin()
  );

-- ----------------------------------------------------------------------------
-- (١٣) هل تُصيَّر الكتلة أصلاً؟ — **نفس منطق `blockRenders` في العقد**
--
-- «الحقل الناقص ⇒ تصيير `null`» قاعدةٌ بلا استثناء (العقد §١٠). ووجودها في
-- القاعدة يجعل **حكم بوابة النشر هو حكم الصفحة نفسه** — لا فحصٌ في المتصفح
-- يفترق عن العارضة بعد أول تعديل.
--
-- ⚠ الشرط على **نوع القيمة** لا على `->>` وحده: `content->>'title'` يعطي نصاً
-- لأي نوع jsonb (رقمٌ · بوليان · مصفوفة)، بينما TypeScript يشترط `string`.
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
           when f = 'items' then not (
             jsonb_typeof(coalesce(p_content, '{}'::jsonb) -> 'items') = 'array'
             and jsonb_array_length(coalesce(p_content, '{}'::jsonb) -> 'items') > 0
           )
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
  'نوعٌ غير مسجَّل أو معطَّل ⇒ false، وحقلٌ إلزامي ناقص ⇒ false.';

revoke all on function public.block_renders(text, jsonb) from public, anon;
grant execute on function public.block_renders(text, jsonb) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- (١٤) صلاحية البناء — `is_admin()` وحدها، و`ops` يُصيَّر له للقراءة فقط
--
-- ⚠ **الفخّ المقيس ليس في الكتابة بل في الشاشة:** `proxy.ts` يُدخل `admin`
-- **و`ops`** إلى `/admin`، بينما كل سياسة كتابة تشترط `is_admin()`. فدور `ops`
-- يفتح المنشئ اليوم ويسحب ويفلت ويضغط «حفظ» — ويصطدم بفخ Supabase الشهير:
-- **صفر صفوف بلا خطأ** ⇒ `error=save` بلا سبب مفهوم، وعملُه ضائع.
-- فالشاشة تسأل هذه الدالة **قبل أن ترسم مقبض السحب**.
--
-- 📌 وتوسيع الحقّ إلى `ops` قرارُ مالكٍ لا قرارُ جلسة (‏`OPEN_TASKS` ج).
-- ----------------------------------------------------------------------------

create or replace function public.builder_access()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when public.is_admin() then 'edit'
    when public.current_user_role() = 'ops' then 'read-only'
    else 'denied'
  end;
$$;

comment on function public.builder_access() is
  'BuilderAccess للمستخدم الحالي: edit (admin) · read-only (ops) · denied. '
  'الشاشة تسألها قبل رسم مقبض السحب — بدلاً من السماح بعملٍ يُرفض عند الحفظ.';

revoke all on function public.builder_access() from public, anon;
grant execute on function public.builder_access() to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- (١٥) الفرق بين المسودة والمنشور — يُحسب في القاعدة لا بمقارنةٍ في المتصفح
--
-- مصدرٌ واحد يقرؤه `publish_page_revision` (ليعدّ) و`hasUnpublishedChanges`
-- (ليقرر) — ونسخُه في موضعين هو تماماً كيف يفترق مصدرا حقيقة بعد أول تعديل.
-- ----------------------------------------------------------------------------

create or replace function public.page_revision_diff(p_page uuid, p_revision uuid)
returns table (updated integer, inserted integer, deleted integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_blocks jsonb;
begin
  select coalesce(r.snapshot -> 'sections', '[]'::jsonb) into v_blocks
  from public.page_revisions r
  where r.id = p_revision and r.page_id = p_page;

  if v_blocks is null then
    raise exception 'اللقطة غير موجودة أو لا تخصّ هذه الصفحة' using hint = 'stale-revision';
  end if;

  return query
  with snap as (
    select nullif(x ->> 'id', '')::uuid            as id,
           x ->> 'type'                            as type,
           coalesce(x -> 'content', '{}'::jsonb)   as content,
           coalesce((x ->> 'sort')::integer, 0)    as sort,
           coalesce((x ->> 'visible')::boolean, true) as visible,
           nullif(x ->> 'parent_id', '')::uuid     as parent_id,
           nullif(x ->> 'block_key', '')           as block_key
    from jsonb_array_elements(v_blocks) x
  ),
  live as (
    select s.id, s.type, s.content, s.sort, s.visible, s.parent_id, s.block_key
    from public.sections s where s.page_id = p_page
  )
  select
    (select count(*)::integer from snap n join live o on o.id = n.id
      where o.type      is distinct from n.type
         or o.content   is distinct from n.content
         or o.sort      is distinct from n.sort
         or o.visible   is distinct from n.visible
         or o.parent_id is distinct from n.parent_id
         or o.block_key is distinct from n.block_key),
    (select count(*)::integer from snap n where n.id is null or not exists (select 1 from live o where o.id = n.id)),
    (select count(*)::integer from live o where not exists (select 1 from snap n where n.id = o.id));
end;
$$;

revoke all on function public.page_revision_diff(uuid, uuid) from public, anon, authenticated;
grant execute on function public.page_revision_diff(uuid, uuid) to service_role;

create or replace function public.page_has_unpublished_changes(p_page uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_rev uuid;
  v_d   record;
begin
  if public.builder_access() = 'denied' then
    raise exception 'هذه القراءة للوحة وحدها' using hint = 'forbidden';
  end if;

  select r.id into v_rev
  from public.page_revisions r
  where r.page_id = p_page and r.status = 'draft';

  if v_rev is null then
    return false;
  end if;

  select * into v_d from public.page_revision_diff(p_page, v_rev);
  return (v_d.updated + v_d.inserted + v_d.deleted) > 0;
end;
$$;

comment on function public.page_has_unpublished_changes(uuid) is
  'هل تختلف المسودة المفتوحة عن المنشور؟ يُحسب في القاعدة (العقد §١٣) — مقارنةٌ '
  'في المتصفح تحتاج تحميل اللقطة كاملةً وتكذب على أول اختلاف في ترتيب المفاتيح.';

revoke all on function public.page_has_unpublished_changes(uuid) from public, anon;
grant execute on function public.page_has_unpublished_changes(uuid) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- (١٦) بوابة النشر — **رموزٌ من القاعدة، لا فحصٌ في المتصفح**
--
-- «لا يُنشر نصف صفحة بالخطأ» شرطٌ في الطلب، وفحصٌ في JavaScript يتخطاه أي
-- `update` مباشر. ورمزٌ لا جملة لأن الخادم يرسل رمزاً والواجهة تترجمه.
--
-- `p_revision` معدومٌ ⇒ تُقاس الأقسام **الحيّة** (حالة الصفحة المنشورة الآن)؛
-- ومعطىً ⇒ تُقاس **اللقطة** (ما سيُنشر). والتوقيع `(uuid)` يبقى صالحاً بحكم
-- القيمة الافتراضية، كما يصفه العقد §١١.
-- ----------------------------------------------------------------------------

create or replace function public.page_publish_blockers(p_page uuid, p_revision uuid default null)
returns setof text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_page   record;
  v_blocks jsonb;
begin
  if public.builder_access() = 'denied' then
    raise exception 'هذه القراءة للوحة وحدها' using hint = 'forbidden';
  end if;

  select p.id, p.slug, p.kind, p.title, p.meta into v_page
  from public.pages p where p.id = p_page;
  if not found then
    raise exception 'الصفحة غير موجودة' using hint = 'not-found';
  end if;

  if p_revision is null then
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', s.id, 'parent_id', s.parent_id, 'type', s.type,
             'content', s.content, 'sort', s.sort, 'visible', s.visible)), '[]'::jsonb)
      into v_blocks
    from public.sections s where s.page_id = p_page;
  else
    select coalesce(r.snapshot -> 'sections', '[]'::jsonb) into v_blocks
    from public.page_revisions r where r.id = p_revision and r.page_id = p_page;
    if v_blocks is null then
      raise exception 'اللقطة غير موجودة أو لا تخصّ هذه الصفحة' using hint = 'stale-revision';
    end if;
  end if;

  -- ترتيب الإرجاع = ترتيب `PUBLISH_BLOCKER_CODES` في العقد §١١، فلا تتبدّل
  -- قائمة الرموز في الشاشة بين نداءين على البيانات نفسها.

  if jsonb_array_length(v_blocks) = 0 then
    return next 'no-blocks';
  else
    if not exists (
      select 1 from jsonb_array_elements(v_blocks) x
      where coalesce((x ->> 'visible')::boolean, true)
        and public.block_renders(x ->> 'type', coalesce(x -> 'content', '{}'::jsonb))
    ) then
      return next 'all-blocks-empty';
    end if;

    -- ⚠ الكتل المخفيّة خارج هذا الفحص بقصد: لا تُصيَّر أصلاً فلا تُنتج `<h1>`
    --    فارغاً على صفحة عامة، ومنعُ النشر بسببها يحبس المالك خلف مسوّدةِ كتلةٍ
    --    ركنها جانباً عمداً.
    if exists (
      select 1 from jsonb_array_elements(v_blocks) x
      where coalesce((x ->> 'visible')::boolean, true)
        and not public.block_renders(x ->> 'type', coalesce(x -> 'content', '{}'::jsonb))
    ) then
      return next 'missing-required';
    end if;
  end if;

  if coalesce(btrim(v_page.title), '') = '' then
    return next 'empty-title';
  end if;

  -- السيو هو المنتج، فغيابُ الوصف يمنع لا يحذّر
  if coalesce(btrim(v_page.meta ->> 'description'), '') = '' then
    return next 'no-meta-description';
  end if;

  if exists (
    select 1 from jsonb_array_elements(v_blocks) x
    where nullif(x ->> 'parent_id', '') is not null
      and not exists (
        select 1 from jsonb_array_elements(v_blocks) y
        where nullif(y ->> 'id', '') = nullif(x ->> 'parent_id', '')
      )
  ) then
    return next 'orphan-child';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_blocks) x
    join jsonb_array_elements(v_blocks) pr
      on nullif(pr ->> 'id', '') = nullif(x ->> 'parent_id', '')
    where nullif(x ->> 'parent_id', '') is not null
      and nullif(pr ->> 'parent_id', '') is not null
  ) then
    return next 'depth-exceeded';
  end if;

  if public.page_slug_conflict(v_page.kind, v_page.slug, v_page.id) is not null then
    return next 'slug-conflict';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_blocks) x
    join public.block_registry b on b.type = x ->> 'type'
    where b.placement in ('once-per-page', 'home-only')
    group by b.type
    having count(*) > 1
  ) then
    return next 'duplicate-singleton';
  end if;

  if v_page.kind <> 'home' and exists (
    select 1
    from jsonb_array_elements(v_blocks) x
    join public.block_registry b on b.type = x ->> 'type'
    where b.placement = 'home-only'
  ) then
    return next 'home-only-misplaced';
  end if;
end;
$$;

comment on function public.page_publish_blockers(uuid, uuid) is
  'PublishBlockerCode[] لصفحةٍ (اللقطة إن مُرِّرت، وإلا الأقسام الحيّة). '
  'رموزٌ لا جُمل — والزر معطَّل ما دامت غير فارغة. الفحص في القاعدة لأن أي '
  'update مباشر يتخطى فحص المتصفح.';

revoke all on function public.page_publish_blockers(uuid, uuid) from public, anon;
grant execute on function public.page_publish_blockers(uuid, uuid) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- (١٧) 🔴 النشر — **فرقٌ يُطابَق بـ`sections.id`**، معاملةً واحدة (D-48)
--
-- 🔴 **الأخطر في هذه المرحلة كلها:** نشرٌ بـ«احذف أقسام الصفحة ثم أدرجها من
-- اللقطة» يبدو أبسط ويعمل تماماً في أول تجربة — **ويُبيد كل ترجمات الصفحة في
-- كل نشرة**، لأن كل مفاتيح `namespace='section'` مبنية على `sections.id`.
-- صفحةٌ فيها ٢٠ مفتاحاً تفقدها كلها بضغطة «نشر»، ولا يظهر ذلك في أي شاشة عربية.
-- ولذلك: يُحدَّث الموجود بمعرّفه، ويُدرَج الجديد، ويُحذف المرفوع — لا استبدال.
--
-- ── ترتيب العمليات، ولماذا هو هكذا بالضبط ─────────────────────────────────
--
-- (أ) **فكّ كل الأنساب أولاً.** بلا هذه الخطوة يصير الترتيب مصيدة: صفٌّ له
--     أبناءٌ يصير ابناً في اللقطة، فيرفضه حارسُ العمق من الطرف المعاكس رغم أن
--     اللقطة نفسها سليمة. والفكّ يجعل كل صفٍّ جذراً لحظةَ التحديث، فتُطبَّق
--     الأنساب دفعةً واحدة في الخطوة (هـ) بلا حساسيةٍ للترتيب.
-- (ب) الحذف بعده مباشرةً — وبعد الفكّ فلا يبتلع `on delete cascade` ابناً
--     أُعيد إسناده إلى أبٍ آخر في اللقطة.
--
-- ⚠ ولا يُلمس `pages.updated_at` **إلا إن تغيّر شيء فعلاً**: هو ما يغذّي
-- `lastModified` في خريطة الموقع، ونشرةٌ لا تغيّر شيئاً يجب ألا تعلن تعديلاً.
-- ----------------------------------------------------------------------------

create or replace function public.publish_page_revision(p_page uuid, p_revision uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rev     record;
  v_blocks  jsonb;
  v_d       record;
  v_blocked text;
  v_kept    jsonb;
  v_bad     integer;
  v_lock    uuid;
begin
  if not public.is_admin() then
    raise exception 'النشر للإدارة وحدها' using hint = 'forbidden';
  end if;

  -- قفل الصفحة أولاً: نشرتان متزامنتان من تبويبين تنتجان فرقاً محسوباً على
  -- حالةٍ لم تعد قائمة — والقفل هو ما يجعل «معاملة واحدة» (D-48) معنىً لا شكلاً.
  select p.id into v_lock from public.pages p where p.id = p_page for update;
  if v_lock is null then
    raise exception 'الصفحة غير موجودة' using hint = 'not-found';
  end if;

  select r.id, r.status, r.snapshot into v_rev
  from public.page_revisions r
  where r.id = p_revision and r.page_id = p_page
  for update;

  if not found then
    raise exception 'اللقطة غير موجودة أو لا تخصّ هذه الصفحة' using hint = 'stale-revision';
  end if;
  if v_rev.status <> 'draft' then
    raise exception 'اللقطة حالتها «%» لا مسودة — نُشرت من جلسةٍ أخرى', v_rev.status
      using hint = 'stale-revision';
  end if;

  v_blocks := coalesce(v_rev.snapshot -> 'sections', '[]'::jsonb);
  if jsonb_typeof(v_blocks) <> 'array' then
    raise exception 'اللقطة بلا مصفوفة sections' using hint = 'template-shape';
  end if;

  -- 🔒 كل كتلة في اللقطة تحمل معرّفاً صالحاً — وإلا انهار **أساس** هذه الدالة:
  --    المطابقة بالمعرّف. وكتلةٌ جديدة يسكّ لها المنشئ uuid قبل الحفظ، فيصير
  --    ذلك المعرّف هو `sections.id` الدائم الذي تُبنى عليه مفاتيح ترجمتها.
  select count(*) into v_bad
  from jsonb_array_elements(v_blocks) x
  where nullif(x ->> 'id', '') is null
     or (x ->> 'id') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
  if v_bad > 0 then
    raise exception 'اللقطة فيها % كتلةً بلا معرّف صالح — المطابقة بالمعرّف هي ما يحفظ الترجمات', v_bad
      using hint = 'template-shape';
  end if;

  select string_agg(b, '، ') into v_blocked
  from public.page_publish_blockers(p_page, p_revision) b;
  if v_blocked is not null then
    raise exception 'النشر ممنوع: %', v_blocked using hint = 'publish-blocked';
  end if;

  -- الأعداد تُقاس **قبل** أي كتابة، وإلا صارت تصف ما فعلته لا ما وجدته
  select * into v_d from public.page_revision_diff(p_page, p_revision);

  -- (أ) فكّ الأنساب
  update public.sections set parent_id = null
   where page_id = p_page and parent_id is not null;

  -- (ب) الحذف — ما رُفع من اللقطة
  delete from public.sections s
   where s.page_id = p_page
     and not exists (
       select 1 from jsonb_array_elements(v_blocks) x
       where (x ->> 'id')::uuid = s.id
     );

  -- (ج) التحديث بالمعرّف — 🔴 هذا السطر هو ما يبقي مفاتيح الترجمة حيّة
  update public.sections s
     set type      = e.type,
         content   = e.content,
         sort      = e.sort,
         visible   = e.visible,
         block_key = e.block_key
    from (
      select (x ->> 'id')::uuid                       as id,
             x ->> 'type'                             as type,
             coalesce(x -> 'content', '{}'::jsonb)    as content,
             coalesce((x ->> 'sort')::integer, 0)     as sort,
             coalesce((x ->> 'visible')::boolean, true) as visible,
             nullif(x ->> 'block_key', '')            as block_key
      from jsonb_array_elements(v_blocks) x
    ) e
   where s.id = e.id and s.page_id = p_page;

  -- (د) الإدراج — الجديد وحده
  insert into public.sections (id, page_id, type, content, sort, visible, block_key)
  select (x ->> 'id')::uuid, p_page, x ->> 'type',
         coalesce(x -> 'content', '{}'::jsonb),
         coalesce((x ->> 'sort')::integer, 0),
         coalesce((x ->> 'visible')::boolean, true),
         nullif(x ->> 'block_key', '')
    from jsonb_array_elements(v_blocks) x
   where not exists (select 1 from public.sections s where s.id = (x ->> 'id')::uuid);

  -- (هـ) إعادة الأنساب — كل الآباء جذورٌ الآن، فالترتيب لا يعني شيئاً
  update public.sections s
     set parent_id = e.parent_id
    from (
      select (x ->> 'id')::uuid              as id,
             (x ->> 'parent_id')::uuid       as parent_id
      from jsonb_array_elements(v_blocks) x
      where nullif(x ->> 'parent_id', '') is not null
    ) e
   where s.id = e.id and s.page_id = p_page;

  -- (و) حالة اللقطات: المنشورة السابقة تصير تاريخاً، وهذه تصير المنشورة
  update public.page_revisions set status = 'archived'
   where page_id = p_page and status = 'published';
  update public.page_revisions
     set status = 'published', published_at = now()
   where id = p_revision;

  -- (ز) ختم التعديل — إن تغيّر شيء فعلاً وحده
  if (v_d.updated + v_d.inserted + v_d.deleted) > 0 then
    update public.pages set updated_at = now() where id = p_page;
  end if;

  select coalesce(jsonb_agg(s.id order by s.sort, s.id), '[]'::jsonb) into v_kept
  from public.sections s where s.page_id = p_page;

  return jsonb_build_object(
    'updated',        v_d.updated,
    'inserted',       v_d.inserted,
    'deleted',        v_d.deleted,
    'keptSectionIds', v_kept
  );
end;
$$;

comment on function public.publish_page_revision(uuid, uuid) is
  'نشر لقطة صفحة **فرقاً يُطابَق بـsections.id** في معاملةٍ واحدة (D-48). '
  '🔴 «احذف ثم أدرج» يعمل في أول تجربة ويُبيد كل ترجمات الصفحة في كل نشرة — '
  'مفاتيح namespace=section مبنية على sections.id. يرجع PublishResult.';

revoke all on function public.publish_page_revision(uuid, uuid) from public, anon;
grant execute on function public.publish_page_revision(uuid, uuid) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- (١٨) ما يقرؤه المتصفح من اللقطات — إسقاطٌ مُدرَجٌ لا سياسةُ `select` عريضة
--
-- قائمة اللقطات **بلا `snapshot`**: شاشة التاريخ تريد «مَن ومتى»، وحمل اللقطات
-- كاملةً في كل فتحةٍ للوحة يعني عشرات الكيلوبايتات من محتوىً لا يُعرض.
-- ودور `ops` يمرّ من هنا (قراءةٌ فقط) بينما الجدول نفسه مغلقٌ عليه بـRLS.
-- ----------------------------------------------------------------------------

create or replace function public.builder_revisions(p_page uuid)
returns table (
  id              uuid,
  status          text,
  created_by      uuid,
  created_by_name text,
  created_at      timestamptz,
  published_at    timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if public.builder_access() = 'denied' then
    raise exception 'هذه القراءة للوحة وحدها' using hint = 'forbidden';
  end if;

  return query
  select r.id, r.status, r.created_by, pr.full_name, r.created_at, r.published_at
  from public.page_revisions r
  left join public.profiles pr on pr.id = r.created_by
  where r.page_id = p_page
  order by r.created_at desc;
end;
$$;

comment on function public.builder_revisions(uuid) is
  'لقطات صفحةٍ بإسقاطٍ مُدرَج **بلا snapshot** — للوحة وحدها (admin و ops).';

revoke all on function public.builder_revisions(uuid) from public, anon;
grant execute on function public.builder_revisions(uuid) to authenticated, service_role;

create or replace function public.builder_revision_snapshot(p_revision uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_snapshot jsonb;
begin
  if public.builder_access() = 'denied' then
    raise exception 'هذه القراءة للوحة وحدها' using hint = 'forbidden';
  end if;

  select r.snapshot into v_snapshot from public.page_revisions r where r.id = p_revision;
  return v_snapshot;
end;
$$;

comment on function public.builder_revision_snapshot(uuid) is
  'لقطة واحدة بجسمها — للمنشئ والمعاينة تحت /admin. ودور ops يقرؤها ولا يكتب.';

revoke all on function public.builder_revision_snapshot(uuid) from public, anon;
grant execute on function public.builder_revision_snapshot(uuid) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- (١٩) فحصٌ ذاتي يفشل بصوت — **ينفّذ نداءً ولا يقرأ نصّاً**
--
-- النمط ٩ في `LESSONS.md`: حارسٌ كُتب بصيغةٍ لا يمكن أن تفشل ليس حارساً. فكل
-- فحصٍ هنا يحاول الكتابة فعلاً داخل معاملةٍ فرعية تُرجَع، ثم يرمي إن نجحت.
-- ----------------------------------------------------------------------------

do $$
declare
  v_page  constant uuid := '0e58a000-0000-4000-8000-000000000f01';
  v_root  constant uuid := '0e58a000-0000-4000-8000-000000000f02';
  v_child constant uuid := '0e58a000-0000-4000-8000-000000000f03';
  v_leaf  constant uuid := '0e58a000-0000-4000-8000-000000000f04';
  v_ok    boolean;
  v_hint  text;
  v_n     integer;
  v_bad   text;
begin
  -- (أ) الكائنات موجودة من **الكتالوج** لا من نيّة الملف (القاعدة ١٤)
  select string_agg(x.rel, '، ') into v_bad
  from (values ('public.block_registry'), ('public.reserved_slugs'), ('public.page_revisions')) as x(rel)
  where to_regclass(x.rel) is null;
  if v_bad is not null then
    raise exception '0058: جداول لم تُنشأ: %', v_bad;
  end if;

  select string_agg(x.sig, '، ') into v_bad
  from (values
    ('public.publish_page_revision(uuid, uuid)'),
    ('public.page_publish_blockers(uuid, uuid)'),
    ('public.page_slug_reject(text, text, uuid)'),
    ('public.builder_access()'),
    ('public.block_renders(text, jsonb)'),
    ('public.page_has_unpublished_changes(uuid)'),
    ('public.builder_revisions(uuid)'),
    ('public.builder_revision_snapshot(uuid)'),
    ('public.section_parent_visible(uuid)')
  ) as x(sig)
  where to_regprocedure(x.sig) is null;
  if v_bad is not null then
    raise exception '0058: دوال لم تُنشأ: %', v_bad;
  end if;

  foreach v_bad in array array['sections_guard_depth', 'pages_guard_slug', 'block_registry_guard'] loop
    if not exists (select 1 from pg_trigger where tgname = v_bad and not tgisinternal) then
      raise exception '0058: المُشغّل % لم يُنشأ', v_bad;
    end if;
  end loop;

  -- (ب) 🔒 المنح: لا شيء لـ`anon` على الجداول الثلاثة، ولا `truncate` لأحد
  select string_agg(distinct table_name || '/' || privilege_type, '، ') into v_bad
  from information_schema.table_privileges
  where table_schema = 'public'
    and table_name in ('block_registry', 'reserved_slugs', 'page_revisions')
    and grantee = 'anon';
  if v_bad is not null then
    raise exception '0058: anon يملك منحاً على الجداول الجديدة: %', v_bad;
  end if;

  select string_agg(distinct table_name, '، ') into v_bad
  from information_schema.table_privileges
  where table_schema = 'public'
    and table_name in ('block_registry', 'reserved_slugs', 'page_revisions')
    and grantee = 'authenticated' and privilege_type = 'TRUNCATE';
  if v_bad is not null then
    raise exception '0058: authenticated يفرّغ %  — القاعدة ١٦: RLS لا تغطي TRUNCATE', v_bad;
  end if;

  -- (ب-٢) 🔒 والشاهد الإيجابي: `select("*")` على الأعمدة الجديدة لا ينكسر —
  --       المنحة على مستوى الجدول تغطي العمود الجديد تلقائياً، وهذا يثبته.
  foreach v_bad in array array['parent_id', 'block_key'] loop
    if not exists (
      select 1 from information_schema.column_privileges
      where table_schema = 'public' and table_name = 'sections'
        and column_name = v_bad and grantee = 'anon' and privilege_type = 'SELECT'
    ) then
      raise exception
        '0058: العمود sections.% غير ممنوح لـanon — أي select("*") من الموقع العام يُرفض كاملاً', v_bad;
    end if;
  end loop;

  -- (ج) الكتالوج مبذورٌ كاملاً وكل صفٍّ فيه يطيع قواعد العنونة
  select count(*) into v_n from public.block_registry;
  if v_n <> 12 then
    raise exception '0058: الكتالوج فيه % كتلة لا ١٢', v_n;
  end if;

  select string_agg(b.type || '=' ||
           public.block_registry_check(b.type, b.role, b.placement, b.accepts_children,
             b.max_children, b.text_fields, b.item_fields, b.required_fields), '، ')
    into v_bad
  from public.block_registry b
  where public.block_registry_check(b.type, b.role, b.placement, b.accepts_children,
          b.max_children, b.text_fields, b.item_fields, b.required_fields) is not null;
  if v_bad is not null then
    raise exception '0058: صفوف كتالوج لا تعنونها قواعد §٤: %', v_bad;
  end if;

  -- ══ نداءات حيّة داخل معاملةٍ فرعية تُرجَع ══════════════════════════════
  begin
    -- (د) الحارس البنيوي على الكتالوج يرفض شكلاً غير قانوني
    v_ok := false; v_hint := null;
    begin
      insert into public.block_registry (type, role, placement, text_fields)
      values ('0058-probe', 'content', 'any', array['style']);
      v_ok := true;
    exception when others then get stacked diagnostics v_hint = pg_exception_hint;
    end;
    if v_ok then
      raise exception '0058: قُبل حقلٌ نصّي اسمه style — منطقة التنسيق صارت مترجَمة';
    end if;
    if v_hint is distinct from 'block-registry-shape' then
      raise exception '0058: رفض الكتالوج خرج بـ[%] لا بـblock-registry-shape', coalesce(v_hint, '∅');
    end if;

    -- (هـ) الفيكسترة: صفحة + كتلة تخطيط + ابن + ورقة
    insert into public.pages (id, slug, kind, title, meta, published, sort)
    values (v_page, '0058-guard-probe', 'landing', 'فحص هجرة ٥٨',
            '{"title":null,"description":"وصف فحص"}'::jsonb, false, 999);

    insert into public.sections (id, page_id, type, content, sort, visible) values
      (v_root, v_page, 'columns',   '{}'::jsonb, 0, true),
      (v_leaf, v_page, 'rich-text', '{"body":"نص فحص"}'::jsonb, 1, true);

    -- (و) الابن يمرّ — شاهدٌ إيجابي، بلاه لَما أثبت النفيُ إلا أن كل شيء مرفوض
    insert into public.sections (id, page_id, parent_id, type, content, sort, visible)
    values (v_child, v_page, v_root, 'rich-text', '{"body":"عمود"}'::jsonb, 0, true);

    -- (ز) والحفيد يُرفض
    v_ok := false; v_hint := null;
    begin
      insert into public.sections (page_id, parent_id, type, content, sort, visible)
      values (v_page, v_child, 'rich-text', '{"body":"حفيد"}'::jsonb, 0, true);
      v_ok := true;
    exception when others then get stacked diagnostics v_hint = pg_exception_hint;
    end;
    if v_ok then
      raise exception '0058: قُبل حفيدٌ — نصٌّ على ثلاثة مستويات لا يعنونه الفهرس';
    end if;
    if v_hint is distinct from 'depth-exceeded' then
      raise exception '0058: رفض الحفيد خرج بـ[%] لا بـdepth-exceeded', coalesce(v_hint, '∅');
    end if;

    -- (ح) والاتجاه المعاكس: أمٌّ تكتسب أباً
    v_ok := false; v_hint := null;
    begin
      update public.sections set parent_id = v_leaf where id = v_root;
      v_ok := true;
    exception when others then get stacked diagnostics v_hint = pg_exception_hint;
    end;
    if v_ok then
      raise exception '0058: صارت كتلةٌ أمّاً وابنةً معاً — حفيدٌ من الطرف الآخر';
    end if;

    -- (ط) وكتلةٌ لا تقبل أبناءً
    v_ok := false; v_hint := null;
    begin
      insert into public.sections (page_id, parent_id, type, content, sort, visible)
      values (v_page, v_leaf, 'rich-text', '{"body":"ابن ورقة"}'::jsonb, 0, true);
      v_ok := true;
    exception when others then get stacked diagnostics v_hint = pg_exception_hint;
    end;
    if v_ok then
      raise exception '0058: قُبل ابنٌ تحت كتلةٍ ليست تخطيطاً';
    end if;
    if v_hint is distinct from 'block-placement' then
      raise exception '0058: الرفض خرج بـ[%] لا بـblock-placement', coalesce(v_hint, '∅');
    end if;

    -- (ي) الـslug المحجوز يُرفض برمزه — وهو العطب القائم اليوم بلا حارس
    v_ok := false; v_hint := null;
    begin
      update public.pages set slug = 'book' where id = v_page;
      v_ok := true;
    exception when others then get stacked diagnostics v_hint = pg_exception_hint;
    end;
    if v_ok then
      raise exception '0058: قُبل slug=book لصفحة landing — «منشورة» في اللوحة و٤٠٤ للأبد';
    end if;
    if v_hint is distinct from 'slug-reserved' then
      raise exception '0058: رفض الـslug خرج بـ[%] لا بـslug-reserved', coalesce(v_hint, '∅');
    end if;

    -- (ك) 🔒 والاستثناء المقيس: `about` مسموحٌ لـ`static` (الملف يقرأ الصف)
    --     ومرفوضٌ لـ`landing` (الملف يشترط static فيعطي ٤٠٤)
    v_ok := false; v_hint := null;
    begin
      update public.pages set slug = 'about' where id = v_page;  -- ما زال landing
      v_ok := true;
    exception when others then get stacked diagnostics v_hint = pg_exception_hint;
    end;
    if v_ok then
      raise exception '0058: قُبل about لصفحة landing — app/about/page.tsx يشترط static';
    end if;

    -- (ل) وتعديلٌ لا يمسّ المسار يمرّ على صفٍّ مسارُه محجوزٌ سلفاً —
    --     هذا بالضبط ما يُبقي صفحة «من نحن» القائمة قابلةً للتحرير
    update public.pages set title = 'عنوان معدَّل' where id = v_page;

    raise exception '0058_ROLLBACK';
  exception
    when others then
      if sqlerrm <> '0058_ROLLBACK' then raise; end if;
  end;

  raise notice '0058 ✔ منشئ الصفحات: landing مقبول · parent_id بمستوىً واحد والحفيد مرفوض من الطرفين · كتالوج ١٢ كتلة كلها معنونة · محجوزات المسار تُرفض برمزها و about مستثناة لـstatic · اللقطات مغلقة على anon وعلى authenticated غير المشرف · ولا TRUNCATE لأحد — وصفر صفٍّ لُمس من بيانات المالك';
end;
$$;

-- ⚠ ولا سطرَ تسجيلٍ في `schema_migrations` هنا: المُشغّل (`scripts/db-migrate.mjs`)
--    يكتبه بنفسه بعد نجاح الملف.
