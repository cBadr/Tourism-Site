-- ============================================================================
-- 0018_i18n.sql — اللغات والترجمة (المرحلة ٨)
--
-- العقد المرجعي: lib/i18n-types.ts — لا اسم جدول ولا توقيع دالة خارجه.
-- يُنفَّذ بعد 0001 (is_admin/touch_updated_at) و0003 (pages/sections)
-- و0005 (vehicle_classes) و0007 (current_actor). آمن لإعادة التنفيذ (idempotent).
--
-- ── القرارات الثلاثة التي تحكم هذا الملف (من العقد) ──────────────────────────
--  (١) العربية أصلٌ بلا صفوف ترجمة: `locales` تحمل الأساس، و`translations`
--      تحمل ما عداه. لذلك كل دالة قراءة عامة **ترجع العربية** حين لا تجد
--      ترجمة منشورة — لا مفتاحاً ولا نصاً فارغاً، أبداً.
--  (٢) لوحة التحكم والبورتال عربيان: لا شيء هنا يمسّهما، والترجمة للواجهة
--      العامة وحدها (pages/sections/site_settings/الخدمات/فئات السيارات).
--  (٣) لا نشر تلقائي: المسودة تُراجَع ثم تُنشر. الدوال العامة الثلاث لا ترى
--      إلا `published` — لا draft ولا reviewed تصل زائراً مهما كان المسار.
--      ومفتاح `auto_publish` لكل لغة (افتراضياً مطفأ) هو الاستثناء الوحيد،
--      ويُطبَّق **داخل القاعدة** في upsert_translations لا في TypeScript.
--
-- ── الفكرة المحورية: «قديم» (stale) ──────────────────────────────────────────
-- كل صف ترجمة يحفظ النص العربي وقت توليده (`source_text`) وبصمته المحسوبة
-- تلقائياً (`source_hash` عمود مولَّد — فـ TypeScript لا يحسب md5 أبداً ولا
-- يستطيع). و«الأصل الحي» يُستخرج من المحتوى نفسه عبر `translation_corpus()`.
-- فإذا اختلفت البصمة المخزَّنة عن بصمة الأصل الحي ⇒ الترجمة **قديمة**:
-- تظهر في التقدم وفي طابور المراجعة، وتبقى منشورة على الموقع (نصٌّ قديم
-- خيرٌ من عودة مفاجئة إلى العربية في منتصف صفحة إنجليزية) حتى تُراجَع.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (١) دالتا الأساس: بصمة الأصل + حارس الإدارة
-- ----------------------------------------------------------------------------

-- بصمة النص العربي بعد تطبيع المسافات: مسافة زائدة أو سطر جديد ليسا تغييراً
-- في المعنى فلا يجوز أن يقلبا ترجمةً سليمة إلى «قديمة». immutable لأنها تُستعمل
-- في عمود مولَّد (وهذا بالضبط ما يمنع TypeScript من حساب البصمة بنفسه).
create or replace function public.i18n_source_hash(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_text is null then null
    else md5(regexp_replace(btrim(p_text), '\s+', ' ', 'g'))
  end
$$;

comment on function public.i18n_source_hash(text) is
  'بصمة الأصل العربي بعد تطبيع المسافات — تُحسب في القاعدة وحدها (عمود translations.source_hash مولَّد منها).';

-- حارس الكتابة والإدارة — نفس منطق public.finance_admin_allowed() في 0015،
-- ويفشل **مغلقاً**: مشرف ⇒ نعم؛ طلب متصفح غير مشرف ⇒ لا قاطعاً؛ عميل الخدمة
-- أو اتصال مالك القاعدة (هجرة/اختبار) ⇒ نعم.
create or replace function public.i18n_admin_allowed()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid  uuid;
  v_role text;
begin
  if public.is_admin() then
    return true;
  end if;

  v_role := coalesce(nullif(current_setting('role', true), ''), '');

  -- الدور الذي يضبطه PostgREST بـ `set local role` لا يبدّله security definer
  if v_role in ('anon', 'authenticated') then
    return false;
  end if;

  begin
    v_uid := auth.uid();
  exception
    when others then
      v_uid := null;
  end;

  if v_uid is not null then
    return false;
  end if;

  if v_role = 'service_role' then
    return true;
  end if;

  begin
    if coalesce(
         nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
         ''
       ) = 'service_role' then
      return true;
    end if;
  exception
    when others then
      null;
  end;

  return session_user in ('postgres', 'supabase_admin');
end;
$$;

comment on function public.i18n_admin_allowed() is
  'حارس إدارة اللغات — مشرف أو عميل خدمة أو اتصال مالك القاعدة؛ ويفشل مغلقاً لكل ما عداهم.';

-- ----------------------------------------------------------------------------
-- (٢) جدول اللغات
--
-- `is_default` تخص العربية وحدها ويحرسها فهرس فريد جزئي + مُشغّل: لا تُعطَّل
-- ولا تُحذف ولا يُنزع عنها وسم الأساس — لأنها مصدر كل نص في الموقع.
-- ----------------------------------------------------------------------------
create table if not exists public.locales (
  code         text primary key check (code ~ '^[a-z]{2}(-[a-z]{2})?$'),
  name         text not null check (btrim(name) <> ''),        -- بالعربية للوحة
  native_name  text not null check (btrim(native_name) <> ''), -- كما يكتبها أهلها
  dir          text not null default 'ltr' check (dir in ('rtl', 'ltr')),
  is_default   boolean not null default false,
  enabled      boolean not null default false,
  -- نشر مسودات الترجمة الآلية بلا مراجعة — القرار (٣): افتراضياً مطفأ
  auto_publish boolean not null default false,
  sort         integer not null default 0,
  updated_at   timestamptz not null default now()
);

-- لغة أساس واحدة لا أكثر — قيد بنيوي لا فحصٌ في الكود
create unique index if not exists locales_single_default_uidx
  on public.locales (is_default)
  where is_default;

-- قائمة المبدّل: اللغات المفعّلة بترتيبها
create index if not exists locales_enabled_sort_idx
  on public.locales (enabled, sort);

drop trigger if exists locales_touch_updated_at on public.locales;
create trigger locales_touch_updated_at
  before update on public.locales
  for each row execute function public.touch_updated_at();

comment on table public.locales is
  'اللغات المسجَّلة. العربية أساس (is_default) بلا صفوف ترجمة — كل نص عربي مصدره المحتوى نفسه. المصدر: LocaleRow.';
comment on column public.locales.auto_publish is
  'نشر مسودات الترجمة الآلية بلا مراجعة — افتراضياً false (القرار ٣). يُطبَّق داخل upsert_translations لا في الواجهة.';

-- حماية لغة الأساس: لا حذف ولا تعطيل ولا نزع وسم الأساس
create or replace function public.guard_default_locale()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.is_default then
      raise exception 'لغة الأساس (%) لا تُحذف — كل نص في الموقع مكتوب بها', old.code
        using hint = 'default-locale';
    end if;
    return old;
  end if;

  if old.is_default and not new.is_default then
    raise exception 'لا يُنزع وسم الأساس عن %', old.code using hint = 'default-locale';
  end if;
  if new.is_default and not new.enabled then
    raise exception 'لغة الأساس لا تُعطَّل' using hint = 'default-locale';
  end if;
  if old.is_default and new.code is distinct from old.code then
    raise exception 'رمز لغة الأساس لا يُغيَّر' using hint = 'default-locale';
  end if;

  return new;
end;
$$;

drop trigger if exists locales_guard_default_upd on public.locales;
create trigger locales_guard_default_upd
  before update on public.locales
  for each row execute function public.guard_default_locale();

drop trigger if exists locales_guard_default_del on public.locales;
create trigger locales_guard_default_del
  before delete on public.locales
  for each row execute function public.guard_default_locale();

-- البذرة: العربية أساساً مفعّلة، والإنجليزية مسجَّلة **معطَّلة** حتى تكتمل
-- مراجعة ترجمتها (تفعيلها من `/admin/languages` هو ما يُظهر /en للزوار).
insert into public.locales (code, name, native_name, dir, is_default, enabled, auto_publish, sort)
values
  ('ar', 'العربية',   'العربية', 'rtl', true,  true,  false, 0),
  ('en', 'الإنجليزية', 'English', 'ltr', false, false, false, 1)
on conflict (code) do nothing;

-- ----------------------------------------------------------------------------
-- (٣) جدول الترجمات
--
-- `source_hash` عمود **مولَّد**: يستحيل أن يكتبه أحد من خارج القاعدة، ويستحيل
-- أن ينحرف عن `source_text`. و«قديم» يُقاس بمقارنته ببصمة الأصل الحي لا به.
-- قيد `status`/`value`: المراجَع والمنشور لا يكونان فارغين أبداً — وهذا هو
-- الضمان البنيوي للقاعدة «الترجمة الناقصة ⇒ العربية، لا عقدة فارغة».
-- ----------------------------------------------------------------------------
create table if not exists public.translations (
  id          uuid primary key default gen_random_uuid(),
  locale      text not null references public.locales(code) on update cascade on delete cascade,
  namespace   text not null
              check (namespace in ('ui', 'page', 'section', 'settings', 'service', 'vehicle')),
  key         text not null check (btrim(key) <> ''),
  source_text text not null check (btrim(source_text) <> ''),
  source_hash text generated always as (public.i18n_source_hash(source_text)) stored,
  value       text,
  status      text not null default 'draft'
              check (status in ('draft', 'reviewed', 'published')),
  provider    text,
  updated_by  uuid references public.profiles(id) on delete set null,
  updated_at  timestamptz not null default now(),
  constraint translations_value_required_when_live
    check (status = 'draft' or (value is not null and btrim(value) <> ''))
);

-- إن كان الجدول موجوداً من نسخة أقدم بلا العمود المولَّد نضيفه (إعادة تنفيذ آمنة)
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'translations'
      and column_name = 'source_hash'
  ) then
    alter table public.translations
      add column source_hash text generated always as (public.i18n_source_hash(source_text)) stored;
  end if;
end $$;

-- مفتاح المعنى: ترجمة واحدة لكل (لغة، مساحة، مفتاح)
create unique index if not exists translations_locale_ns_key_uidx
  on public.translations (locale, namespace, key);

-- مسار القراءة العامة: المنشور وحده (فهرس جزئي ⇒ أصغر وأسرع)
create index if not exists translations_published_idx
  on public.translations (locale, namespace, key)
  where status = 'published';

-- طابور المراجعة: تصفية بالحالة ثم المساحة
create index if not exists translations_queue_idx
  on public.translations (locale, status, namespace, key);

-- الوصل بالفهرس الحي (corpus) عند حساب «قديم»
create index if not exists translations_ns_key_idx
  on public.translations (namespace, key);

drop trigger if exists translations_touch_updated_at on public.translations;
create trigger translations_touch_updated_at
  before update on public.translations
  for each row execute function public.touch_updated_at();

comment on table public.translations is
  'صفوف الترجمة — سطر لكل (لغة، مساحة، مفتاح). العربية ليست هنا: هي المحتوى نفسه. المصدر: TranslationRow.';
comment on column public.translations.source_hash is
  'بصمة الأصل وقت التوليد — عمود مولَّد لا يُكتب من الخارج. اختلافها عن بصمة الأصل الحي = الترجمة قديمة.';
comment on column public.translations.status is
  'draft مسودة آلية · reviewed راجعها إنسان · published تصل الزائر. الدوال العامة لا ترى إلا published.';

-- ----------------------------------------------------------------------------
-- (٤) أدوات الاستبدال — دوال صرفة (بلا قراءة جداول) تُستدعى من الدوال العامة
-- ----------------------------------------------------------------------------

-- استبدال حقول النص داخل محتوى قسم JSONB اعتماداً على خريطة (مفتاح ⇒ قيمة):
--   الحقول النصية العليا   ⇒ <prefix>.<field>
--   عناصر مصفوفة items    ⇒ <prefix>.items.<i>.<field>
-- وأي مفتاح غائب أو قيمته فارغة يُترك على أصله العربي — لا مفتاح ولا فراغ.
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
                    when jsonb_typeof(ie.value) = 'string' then
                      to_jsonb(coalesce(
                        nullif(btrim(p_map ->> (p_prefix || '.items.' || (el.ord - 1) || '.' || ie.key)), ''),
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

-- استبدال حقل نصي واحد داخل كائن الإعدادات (يُترك كما هو إن كانت القيمة فارغة)
create or replace function public.i18n_override(p_obj jsonb, p_field text, p_value text)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case
    when p_value is null or btrim(p_value) = '' then coalesce(p_obj, '{}'::jsonb)
    else jsonb_set(coalesce(p_obj, '{}'::jsonb), array[p_field], to_jsonb(p_value), true)
  end
$$;

-- هل هذه اللغة لغةَ ترجمةٍ فعّالة؟ (مفعّلة وليست الأساس)
create or replace function public.i18n_locale_active(p_locale text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select l.enabled and not l.is_default
       from public.locales l
      where l.code = p_locale),
    false)
$$;

-- ----------------------------------------------------------------------------
-- (٥) مسار القراءة العام — ثلاث دوال، للزائر (anon) وحدها منها حق التنفيذ
--
-- كلها security definer لتتجاوز RLS الترجمات، وكلها تفلتر `status='published'`
-- **وقيمة غير فارغة** — فلا مسودة ولا مراجَعة ولا عقدة فارغة تصل زائراً.
-- ولأن الدالة تتجاوز RLS الصفحات أيضاً، الفلترة على published/visible مكتوبة
-- صراحةً هنا (الفخّ نفسه الذي عالجه 0003 في سياسة الأقسام).
-- ----------------------------------------------------------------------------

-- النص المنشور لمفتاح واحد، أو null (فتتكفّل الواجهة بالعربية)
create or replace function public.t(p_locale text, p_ns text, p_key text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select tr.value
  from public.translations tr
  where tr.locale = p_locale
    and tr.namespace = p_ns
    and tr.key = p_key
    and tr.status = 'published'
    and tr.value is not null
    and btrim(tr.value) <> ''
    and public.i18n_locale_active(p_locale)
  limit 1
$$;

comment on function public.t(text, text, text) is
  'النص المنشور لمفتاح واحد أو null — لا ترى draft ولا reviewed ولا لغة معطَّلة.';

-- صفحة منشورة بأقسامها المرئية، وقد استُبدلت نصوصها بالمنشور من الترجمات
-- والباقي عربي كما هو. الشكل مطابق لـ PageWithSections في lib/content-types.ts.
create or replace function public.localized_page(p_slug text, p_locale text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_page     record;
  v_locale   text := coalesce(nullif(btrim(p_locale), ''), 'ar');
  v_active   boolean;
  v_ids      text[];
  v_pmap     jsonb := '{}'::jsonb;
  v_smap     jsonb := '{}'::jsonb;
  v_title    text;
  v_meta_t   text;
  v_meta_d   text;
  v_sections jsonb;
begin
  select p.id, p.slug, p.kind, p.title, p.meta, p.published, p.sort
    into v_page
  from public.pages p
  where p.slug = p_slug
    and p.published = true;

  if not found then
    return null;
  end if;

  v_active := public.i18n_locale_active(v_locale);

  select array_agg(s.id::text)
    into v_ids
  from public.sections s
  where s.page_id = v_page.id
    and s.visible = true;

  if v_active then
    select coalesce(jsonb_object_agg(tr.key, tr.value), '{}'::jsonb)
      into v_pmap
    from public.translations tr
    where tr.locale = v_locale
      and tr.namespace = 'page'
      and tr.status = 'published'
      and tr.value is not null
      and btrim(tr.value) <> ''
      and tr.key like v_page.id::text || '.%';

    select coalesce(jsonb_object_agg(tr.key, tr.value), '{}'::jsonb)
      into v_smap
    from public.translations tr
    where tr.locale = v_locale
      and tr.namespace = 'section'
      and tr.status = 'published'
      and tr.value is not null
      and btrim(tr.value) <> ''
      and split_part(tr.key, '.', 1) = any (coalesce(v_ids, array[]::text[]));
  end if;

  -- كل حقل يرجع لعربيته وحده: صفحة نصفها مترجم تعرض نصفها الآخر عربياً
  v_title := coalesce(
    nullif(btrim(coalesce(v_pmap ->> (v_page.id::text || '.title'), '')), ''),
    v_page.title);

  v_meta_t := coalesce(
    nullif(btrim(coalesce(v_pmap ->> (v_page.id::text || '.meta.title'), '')), ''),
    nullif(btrim(coalesce(v_page.meta ->> 'title', '')), ''));

  v_meta_d := coalesce(
    nullif(btrim(coalesce(v_pmap ->> (v_page.id::text || '.meta.description'), '')), ''),
    nullif(btrim(coalesce(v_page.meta ->> 'description', '')), ''));

  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'id',      s.id,
               'pageId',  s.page_id,
               'type',    s.type,
               'content', public.i18n_apply(s.content, s.id::text, v_smap),
               'sort',    s.sort,
               'visible', s.visible)
             order by s.sort, s.id),
           '[]'::jsonb)
    into v_sections
  from public.sections s
  where s.page_id = v_page.id
    and s.visible = true;

  return jsonb_build_object(
    'id',        v_page.id,
    'slug',      v_page.slug,
    'kind',      v_page.kind,
    'title',     v_title,
    'meta',      jsonb_build_object('title', v_meta_t, 'description', v_meta_d),
    'published', v_page.published,
    'sort',      v_page.sort,
    'locale',    v_locale,
    'sections',  v_sections);
end;
$$;

comment on function public.localized_page(text, text) is
  'صفحة منشورة بأقسامها بعد استبدال المنشور من الترجمات — والباقي عربي حقلاً حقلاً.';

-- الهوية وبيانات الشركة والسيو باللغة المطلوبة + قائمة اللغات المفعّلة.
-- قائمة اللغات جزء من هذه الحمولة عمداً: مبدّل اللغة في ترويسة الموقع العام
-- يعمل بهوية anon، و anon لا يقرأ جدول locales مباشرة (انظر قسم الصلاحيات).
create or replace function public.localized_settings(p_locale text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_locale  text := coalesce(nullif(btrim(p_locale), ''), 'ar');
  v_active  boolean;
  v_brand   jsonb;
  v_company jsonb;
  v_seo     jsonb;
  v_map     jsonb := '{}'::jsonb;
begin
  select coalesce((select ss.value from public.site_settings ss where ss.key = 'brand'),   '{}'::jsonb),
         coalesce((select ss.value from public.site_settings ss where ss.key = 'company'), '{}'::jsonb),
         coalesce((select ss.value from public.site_settings ss where ss.key = 'seo'),     '{}'::jsonb)
    into v_brand, v_company, v_seo;

  v_active := public.i18n_locale_active(v_locale);

  if v_active then
    select coalesce(jsonb_object_agg(tr.key, tr.value), '{}'::jsonb)
      into v_map
    from public.translations tr
    where tr.locale = v_locale
      and tr.namespace = 'settings'
      and tr.status = 'published'
      and tr.value is not null
      and btrim(tr.value) <> '';
  end if;

  -- الألوان والروابط لا تُترجم؛ النصوص وحدها تُستبدل. ويبقى `brand.logoUrl`
  -- متاحاً كتجاوز اختياري (الرؤية: «اللوجو وبيانات الموقع بلغة العميل») —
  -- لا يولّده الفهرس لأنه ليس نصاً يُترجَم، بل يُضبط يدوياً من اللوحة.
  v_brand   := public.i18n_override(v_brand,   'name',               v_map ->> 'brand.name');
  v_brand   := public.i18n_override(v_brand,   'tagline',            v_map ->> 'brand.tagline');
  v_brand   := public.i18n_override(v_brand,   'logoUrl',            v_map ->> 'brand.logoUrl');
  v_company := public.i18n_override(v_company, 'legalName',          v_map ->> 'company.legalName');
  v_company := public.i18n_override(v_company, 'activity',           v_map ->> 'company.activity');
  v_seo     := public.i18n_override(v_seo,     'titleTemplate',      v_map ->> 'seo.titleTemplate');
  v_seo     := public.i18n_override(v_seo,     'defaultDescription', v_map ->> 'seo.defaultDescription');

  return jsonb_build_object(
    'locale',  v_locale,
    'brand',   v_brand,
    'company', v_company,
    'seo',     v_seo,
    'locales', (
      select coalesce(
               jsonb_agg(
                 jsonb_build_object(
                   'code',       l.code,
                   'name',       l.name,
                   'nativeName', l.native_name,
                   'dir',        l.dir,
                   'isDefault',  l.is_default,
                   'sort',       l.sort)
                 order by l.sort, l.code),
               '[]'::jsonb)
      from public.locales l
      where l.enabled = true));
end;
$$;

comment on function public.localized_settings(text) is
  'الهوية وبيانات الشركة والسيو باللغة المطلوبة + اللغات المفعّلة (يحتاجها مبدّل اللغة بهوية anon).';

-- ----------------------------------------------------------------------------
-- (٦) الفهرس الحي — كل نص قابل للترجمة في الموقع، مستخرجاً من البيانات نفسها
--
-- هذه الدالة هي ما يجعل TypeScript غير مضطر للمشي على شجرة المحتوى: اللوحة
-- تطلب قائمة العمل جاهزة (مساحة، مفتاح، نص عربي) وتمرّرها إلى مزوّد الترجمة
-- ثم إلى upsert_translations. وهي أيضاً مرجع «الأصل الحي» في كشف القديم.
--
-- ما لا تعرفه القاعدة يبقى على المستودع: نصوص الواجهة (ui) و`short` الخدمات
-- الست و`seats` فئات السيارات مكتوبة في lib/site-config.ts ورسائل next-intl،
-- فتضيفها الواجهة إلى الدفعة قبل استدعاء upsert_translations (نفس الشكل).
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
    and jsonb_typeof(e.value) = 'string'
    and btrim(e.value #>> '{}') <> ''
  union all
  select 'section',
         s.id::text || '.items.' || (el.ord - 1) || '.' || ie.key,
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

-- الواجهة الإدارية للفهرس (نفس الصفوف، بحارس)
create or replace function public.translation_corpus()
returns table (namespace text, key text, source_text text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.i18n_admin_allowed() then
    raise exception 'فهرس النصوص القابلة للترجمة متاح للمشرف وحده' using hint = 'forbidden';
  end if;

  return query
    select c.ns, c.k, c.src
    from public.i18n_corpus_rows() c
    order by c.ns, c.k;
end;
$$;

comment on function public.translation_corpus() is
  'كل نص قابل للترجمة في الموقع مستخرجاً من البيانات الحية (صفحات/أقسام/إعدادات/خدمات/فئات) — قائمة عمل اللوحة ومرجع «الأصل الحي».';

-- ----------------------------------------------------------------------------
-- (٧) المسار الإداري — حارسه public.i18n_admin_allowed() في كل دالة
-- ----------------------------------------------------------------------------

-- تقدم كل لغة (عدا الأساس). «الكون» = الفهرس الحي ∪ الصفوف الموجودة، حتى
-- تظهر مفاتيح الواجهة (ui) القادمة من المستودع ضمن الحساب أيضاً.
create or replace function public.translation_progress()
returns table (
  locale    text,
  total     integer,
  published integer,
  reviewed  integer,
  draft     integer,
  missing   integer,
  stale     integer,
  percent   integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.i18n_admin_allowed() then
    raise exception 'تقدم الترجمة متاح للمشرف وحده' using hint = 'forbidden';
  end if;

  return query
  with corpus as (
    select c.ns, c.k, public.i18n_source_hash(c.src) as h
    from public.i18n_corpus_rows() c
  ),
  langs as (
    select l.code from public.locales l where not l.is_default
  ),
  universe as (
    select g.code as lc, c.ns, c.k, c.h
    from langs g
    cross join corpus c
    union
    -- مفاتيح موجودة خارج الفهرس (ui ونصوص المستودع): أصلها الحي هو المخزَّن
    select tr.locale, tr.namespace, tr.key, tr.source_hash
    from public.translations tr
    join langs g on g.code = tr.locale
    where not exists (
      select 1 from corpus c2 where c2.ns = tr.namespace and c2.k = tr.key
    )
  ),
  agg as (
    select u.lc,
           count(*)::integer as total,
           count(*) filter (where tr.status = 'published')::integer as published,
           count(*) filter (where tr.status = 'reviewed')::integer  as reviewed,
           count(*) filter (
             where tr.status = 'draft' and tr.value is not null and btrim(tr.value) <> ''
           )::integer as draft,
           count(*) filter (
             where tr.status = 'published' and tr.source_hash is distinct from u.h
           )::integer as stale
    from universe u
    left join public.translations tr
      on tr.locale = u.lc and tr.namespace = u.ns and tr.key = u.k
    group by u.lc
  )
  select a.lc,
         a.total,
         a.published,
         a.reviewed,
         a.draft,
         (a.total - a.published - a.reviewed - a.draft)::integer,
         a.stale,
         case
           when a.total = 0 then 100
           else floor(100.0 * greatest(a.published - a.stale, 0) / a.total)::integer
         end
  from agg a
  order by a.lc;
end;
$$;

comment on function public.translation_progress() is
  'تقدم كل لغة: منشور/مراجَع/مسودة/ناقص/قديم. النسبة تحسب المنشور غير القديم وحده — لأن القديم عملٌ باقٍ.';

-- طابور المراجعة. `source_text` هو **الأصل الحي** (ما يجب أن تُترجمه الآن)
-- و`stored_source` هو الأصل وقت التوليد — واختلافهما هو معنى stale.
-- p_status: null/'all' الكل · 'draft'/'reviewed'/'published' · 'stale' القديم وحده.
create or replace function public.translation_queue(p_locale text, p_status text)
returns table (
  id            uuid,
  namespace     text,
  key           text,
  source_text   text,
  stored_source text,
  value         text,
  status        text,
  provider      text,
  stale         boolean,
  updated_at    timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_status text := nullif(btrim(lower(coalesce(p_status, ''))), '');
begin
  if not public.i18n_admin_allowed() then
    raise exception 'طابور المراجعة متاح للمشرف وحده' using hint = 'forbidden';
  end if;

  if v_status = 'all' then
    v_status := null;
  end if;

  if v_status is not null
     and v_status not in ('draft', 'reviewed', 'published', 'stale') then
    raise exception 'حالة غير معروفة: % (draft|reviewed|published|stale|all)', v_status
      using hint = 'invalid-input';
  end if;

  return query
  with corpus as (
    select c.ns, c.k, c.src
    from public.i18n_corpus_rows() c
  ),
  rows_out as (
    select tr.id,
           tr.namespace,
           tr.key,
           coalesce(c.src, tr.source_text) as live_source,
           tr.source_text,
           tr.value,
           tr.status,
           tr.provider,
           (tr.source_hash is distinct from public.i18n_source_hash(coalesce(c.src, tr.source_text)))
             as is_stale,
           tr.updated_at
    from public.translations tr
    left join corpus c on c.ns = tr.namespace and c.k = tr.key
    where tr.locale = p_locale
  )
  select r.id, r.namespace, r.key, r.live_source, r.source_text,
         r.value, r.status, r.provider, r.is_stale, r.updated_at
  from rows_out r
  where v_status is null
     or (v_status = 'stale' and r.is_stale)
     or (v_status <> 'stale' and r.status = v_status)
  order by r.is_stale desc, r.status, r.namespace, r.key;
end;
$$;

comment on function public.translation_queue(text, text) is
  'طابور مراجعة لغة — يعرض الأصل الحي والأصل المخزَّن معاً ووسم «قديم» لكل صف.';

-- كتابة دفعة: إدراج أو إنعاش مسودات، مع **حماية** المراجَع والمنشور ما دام
-- أصلهما لم يتغيّر. شكل كل عنصر:
--   {locale, namespace, key, sourceText, value?, provider?}
-- القاعدة:
--   • لا صف        ⇒ إدراج مسودة (أو منشور مباشرة إن كان auto_publish للغة مفعّلاً).
--   • الأصل نفسه   ⇒ المراجَع والمنشور لا يُمسّان إطلاقاً؛ المسودة تُحدَّث بترجمة أحدث.
--   • الأصل تغيّر  ⇒ مع ترجمة جديدة: تحلّ محلها وتعود مسودة (ترجمة آلية لا تُنشر بلا مراجعة).
--                    بلا ترجمة جديدة: المسودة تُنعش، والمراجَع/المنشور يبقى كما هو
--                    **ظاهراً وموسوماً «قديماً»** حتى تصله المراجعة.
create or replace function public.upsert_translations(p_rows jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row      jsonb;
  v_locale   text;
  v_ns       text;
  v_key      text;
  v_src      text;
  v_val      text;
  v_prov     text;
  v_hash     text;
  v_auto     boolean;
  v_existing public.translations%rowtype;
  v_actor    uuid := public.current_actor();
  v_ins      integer := 0;
  v_upd      integer := 0;
  v_keep     integer := 0;
  v_skip     integer := 0;
begin
  if not public.i18n_admin_allowed() then
    raise exception 'كتابة الترجمات متاحة للمشرف وحده' using hint = 'forbidden';
  end if;

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'upsert_translations تتوقع مصفوفة JSON' using hint = 'invalid-input';
  end if;

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    v_locale := nullif(btrim(coalesce(v_row ->> 'locale', '')), '');
    v_ns     := nullif(btrim(coalesce(v_row ->> 'namespace', '')), '');
    v_key    := nullif(btrim(coalesce(v_row ->> 'key', '')), '');
    v_src    := coalesce(v_row ->> 'sourceText', v_row ->> 'source_text');
    v_val    := nullif(btrim(coalesce(v_row ->> 'value', '')), '');
    v_prov   := nullif(btrim(coalesce(v_row ->> 'provider', '')), '');

    if v_locale is null or v_ns is null or v_key is null
       or btrim(coalesce(v_src, '')) = '' then
      v_skip := v_skip + 1;
      continue;
    end if;

    -- اللغة يجب أن تكون مسجَّلة وليست الأساس (العربية لا صفوف ترجمة لها)
    select l.auto_publish into v_auto
    from public.locales l
    where l.code = v_locale and not l.is_default;

    if not found then
      v_skip := v_skip + 1;
      continue;
    end if;

    v_hash := public.i18n_source_hash(v_src);

    select * into v_existing
    from public.translations tr
    where tr.locale = v_locale and tr.namespace = v_ns and tr.key = v_key;

    -- (أ) صف جديد
    if not found then
      insert into public.translations
        (locale, namespace, key, source_text, value, status, provider, updated_by)
      values (
        v_locale, v_ns, v_key, v_src, v_val,
        case when v_val is not null and coalesce(v_auto, false) then 'published' else 'draft' end,
        v_prov, v_actor);
      v_ins := v_ins + 1;
      continue;
    end if;

    -- (ب) الأصل لم يتغيّر
    if v_existing.source_hash = v_hash then
      if v_existing.status in ('reviewed', 'published') then
        v_keep := v_keep + 1;   -- عمل إنسان لا يُدهس بمسودة آلية
        continue;
      end if;
      if v_val is null then
        v_skip := v_skip + 1;
        continue;
      end if;
      update public.translations tr
         set value      = v_val,
             provider   = coalesce(v_prov, tr.provider),
             status     = case when coalesce(v_auto, false) then 'published' else 'draft' end,
             updated_by = v_actor
       where tr.id = v_existing.id;
      v_upd := v_upd + 1;
      continue;
    end if;

    -- (ج) الأصل تغيّر — والصف قديم
    if v_val is null then
      if v_existing.status = 'draft' then
        update public.translations tr
           set source_text = v_src,
               updated_by  = v_actor
         where tr.id = v_existing.id;
        v_upd := v_upd + 1;
      else
        v_keep := v_keep + 1;   -- يبقى منشوراً وموسوماً «قديماً» حتى المراجعة
      end if;
      continue;
    end if;

    update public.translations tr
       set source_text = v_src,
           value       = v_val,
           provider    = coalesce(v_prov, tr.provider),
           status      = case when coalesce(v_auto, false) then 'published' else 'draft' end,
           updated_by  = v_actor
     where tr.id = v_existing.id;
    v_upd := v_upd + 1;
  end loop;

  return jsonb_build_object(
    'inserted', v_ins, 'updated', v_upd, 'preserved', v_keep, 'skipped', v_skip);
end;
$$;

comment on function public.upsert_translations(jsonb) is
  'كتابة دفعة ترجمات — تُنعش المسودات ولا تدهس مراجَعاً أو منشوراً أصلُه لم يتغيّر.';

-- مراجعة صف واحد (تحرير داخل الطابور). تحديث `source_text` إلى الأصل الحي
-- جزء من المراجعة نفسها: بدونه تبقى الترجمة موسومة «قديمة» بعد تصحيحها.
create or replace function public.review_translation(
  p_id      uuid,
  p_value   text,
  p_publish boolean
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row  public.translations%rowtype;
  v_val  text := nullif(btrim(coalesce(p_value, '')), '');
  v_live text;
  v_new  public.translations%rowtype;
begin
  if not public.i18n_admin_allowed() then
    raise exception 'مراجعة الترجمة متاحة للمشرف وحده' using hint = 'forbidden';
  end if;

  if v_val is null then
    raise exception 'نص الترجمة إلزامي — لا يُنشر فراغ' using hint = 'invalid-input';
  end if;

  select * into v_row from public.translations tr where tr.id = p_id;
  if not found then
    raise exception 'صف الترجمة غير موجود' using hint = 'not-found';
  end if;

  select c.src into v_live
  from public.i18n_corpus_rows() c
  where c.ns = v_row.namespace and c.k = v_row.key;

  update public.translations tr
     set value       = v_val,
         source_text = coalesce(v_live, tr.source_text),
         status      = case when coalesce(p_publish, false) then 'published' else 'reviewed' end,
         updated_by  = public.current_actor()
   where tr.id = p_id
  returning * into v_new;

  return jsonb_build_object(
    'id',         v_new.id,
    'locale',     v_new.locale,
    'namespace',  v_new.namespace,
    'key',        v_new.key,
    'value',      v_new.value,
    'status',     v_new.status,
    'sourceText', v_new.source_text,
    'stale',      false,
    'updatedAt',  v_new.updated_at);
end;
$$;

comment on function public.review_translation(uuid, text, boolean) is
  'اعتماد ترجمة صف — reviewed أو published، وتُزامن الأصل المخزَّن مع الحي فيسقط وسم «قديم».';

-- نشر كل المراجَع في لغة دفعة واحدة. **لا يمسّ المسودات إطلاقاً** — وهذا هو
-- القرار (٣) مكتوباً في القاعدة: لا ترجمة آلية غير مراجَعة تصل زائراً.
create or replace function public.publish_locale(p_locale text)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  if not public.i18n_admin_allowed() then
    raise exception 'النشر متاح للمشرف وحده' using hint = 'forbidden';
  end if;

  if not exists (select 1 from public.locales l where l.code = p_locale and not l.is_default) then
    raise exception 'لغة غير مسجَّلة أو أنها لغة الأساس: %', coalesce(p_locale, 'بلا')
      using hint = 'not-found';
  end if;

  update public.translations tr
     set status     = 'published',
         updated_by = public.current_actor()
   where tr.locale = p_locale
     and tr.status = 'reviewed'
     and tr.value is not null
     and btrim(tr.value) <> '';

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

comment on function public.publish_locale(text) is
  'نشر المراجَع وحده في لغة — المسودات تبقى مسودات (القرار ٣: لا نشر آلي بلا مراجعة).';

-- ----------------------------------------------------------------------------
-- (٨) RLS والصلاحيات
--
-- الفخاخ الأربعة كلها معالَجة هنا:
--   ١) الوصول طبقتان: GRANT + سياسة — كلاهما مطلوب.
--   ٢) TRUNCATE لا تخضع لـ RLS إطلاقاً ⇒ `revoke all` أولاً ثم منح المطلوب وحده.
--   ٣) security definer يتجاوز RLS ⇒ كل دالة عامة تفلتر published/visible صراحةً،
--      وكل دالة إدارية تبدأ بالحارس.
--   ٤) لا سياسة تستهدف anon على الجدولين، ولا GRANT له عليهما: الزائر يقرأ
--      عبر الدوال الثلاث حصراً (ومنها يصله جدول اللغات المفعّلة داخل
--      localized_settings — فلا يحتاج قراءة locales مباشرة).
-- ----------------------------------------------------------------------------
alter table public.locales      enable row level security;
alter table public.translations enable row level security;

revoke all on public.locales      from public, anon, authenticated;
revoke all on public.translations from public, anon, authenticated;

-- مبدّل اللوحة يقرأ اللغات؛ والكتابة محكومة بسياسات المشرف أدناه
grant select, insert, update, delete on public.locales to authenticated;
-- جدول الترجمات بلا أي صلاحية للأدوار العامة: الوصول عبر الدوال الإدارية حصراً

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant select, insert, update, delete on public.locales      to service_role';
    execute 'grant select, insert, update, delete on public.translations to service_role';
  end if;
end $$;

-- سياسات locales
drop policy if exists "locales_select_authenticated" on public.locales;
create policy "locales_select_authenticated"
  on public.locales
  for select
  to authenticated
  using (true);

drop policy if exists "locales_insert_admin" on public.locales;
create policy "locales_insert_admin"
  on public.locales
  for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "locales_update_admin" on public.locales;
create policy "locales_update_admin"
  on public.locales
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "locales_delete_admin" on public.locales;
create policy "locales_delete_admin"
  on public.locales
  for delete
  to authenticated
  using (public.is_admin());

-- سياسات translations — دفاع في العمق: لو مُنح GRANT يوماً بالخطأ تبقى
-- القراءة والكتابة للمشرف وحده، ولا سياسة تستهدف anon أصلاً.
drop policy if exists "translations_select_admin" on public.translations;
create policy "translations_select_admin"
  on public.translations
  for select
  to authenticated
  using (public.is_admin());

drop policy if exists "translations_insert_admin" on public.translations;
create policy "translations_insert_admin"
  on public.translations
  for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "translations_update_admin" on public.translations;
create policy "translations_update_admin"
  on public.translations
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "translations_delete_admin" on public.translations;
create policy "translations_delete_admin"
  on public.translations
  for delete
  to authenticated
  using (public.is_admin());

-- ── صلاحيات الدوال ──
-- الداخلية: لا أحد من الأدوار العامة (تُستدعى من داخل الدوال المعرَّفة وحدها)
revoke all on function public.i18n_apply(jsonb, text, jsonb)      from public, anon, authenticated;
revoke all on function public.i18n_override(jsonb, text, text)    from public, anon, authenticated;
revoke all on function public.i18n_corpus_rows()                  from public, anon, authenticated;
revoke all on function public.i18n_locale_active(text)            from public, anon, authenticated;
revoke all on function public.guard_default_locale()              from public, anon, authenticated;

revoke all    on function public.i18n_source_hash(text) from public, anon, authenticated;
grant execute on function public.i18n_source_hash(text) to authenticated;

revoke all    on function public.i18n_admin_allowed() from public, anon, authenticated;
grant execute on function public.i18n_admin_allowed() to authenticated;

-- العامة الثلاث — وهي كل ما يملكه الزائر
revoke all    on function public.t(text, text, text) from public, anon, authenticated;
grant execute on function public.t(text, text, text) to anon, authenticated;

revoke all    on function public.localized_page(text, text) from public, anon, authenticated;
grant execute on function public.localized_page(text, text) to anon, authenticated;

revoke all    on function public.localized_settings(text) from public, anon, authenticated;
grant execute on function public.localized_settings(text) to anon, authenticated;

-- الإدارية — للمسجَّلين فقط، والحارس داخلها يحسم المشرف من غيره
revoke all    on function public.translation_corpus() from public, anon, authenticated;
grant execute on function public.translation_corpus() to authenticated;

revoke all    on function public.translation_progress() from public, anon, authenticated;
grant execute on function public.translation_progress() to authenticated;

revoke all    on function public.translation_queue(text, text) from public, anon, authenticated;
grant execute on function public.translation_queue(text, text) to authenticated;

revoke all    on function public.upsert_translations(jsonb) from public, anon, authenticated;
grant execute on function public.upsert_translations(jsonb) to authenticated;

revoke all    on function public.review_translation(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.review_translation(uuid, text, boolean) to authenticated;

revoke all    on function public.publish_locale(text) from public, anon, authenticated;
grant execute on function public.publish_locale(text) to authenticated;

-- ----------------------------------------------------------------------------
-- (٩) فحص ختامي — الهجرة ترفض أن تنجح وهي مفتوحة الباب
-- ----------------------------------------------------------------------------
do $$
declare
  v_priv text;
  v_bad  text;
begin
  if (select count(*) from public.locales where is_default) <> 1 then
    raise exception 'يجب أن تكون هناك لغة أساس واحدة بالضبط';
  end if;

  if not exists (select 1 from public.locales where code = 'ar' and is_default and enabled) then
    raise exception 'العربية يجب أن تكون لغة الأساس ومفعّلة';
  end if;

  foreach v_priv in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']
  loop
    if has_table_privilege('anon', 'public.locales', v_priv) then
      raise exception 'anon يملك % على locales — يجب ألا يقرأ الجدول مباشرة', v_priv;
    end if;
    if has_table_privilege('anon', 'public.translations', v_priv) then
      raise exception 'anon يملك % على translations', v_priv;
    end if;
    if has_table_privilege('authenticated', 'public.translations', v_priv) then
      raise exception 'authenticated يملك % على translations — الوصول عبر الدوال حصراً', v_priv;
    end if;
  end loop;

  select string_agg(p.policyname, '، ') into v_bad
  from pg_policies p
  where p.schemaname = 'public'
    and p.tablename in ('locales', 'translations')
    and 'anon' = any (p.roles);
  if v_bad is not null then
    raise exception 'سياسات تستهدف anon على جدولي اللغات: %', v_bad;
  end if;

  if not has_function_privilege('anon', 'public.t(text, text, text)', 'EXECUTE')
     or not has_function_privilege('anon', 'public.localized_page(text, text)', 'EXECUTE')
     or not has_function_privilege('anon', 'public.localized_settings(text)', 'EXECUTE') then
    raise exception 'الدوال العامة الثلاث يجب أن تكون قابلة للتنفيذ من anon';
  end if;

  if has_function_privilege('anon', 'public.upsert_translations(jsonb)', 'EXECUTE')
     or has_function_privilege('anon', 'public.translation_progress()', 'EXECUTE')
     or has_function_privilege('anon', 'public.translation_queue(text, text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.translation_corpus()', 'EXECUTE')
     or has_function_privilege('anon', 'public.review_translation(uuid, text, boolean)', 'EXECUTE')
     or has_function_privilege('anon', 'public.publish_locale(text)', 'EXECUTE') then
    raise exception 'anon يملك تنفيذ دالة إدارية';
  end if;

  raise notice '✔ 0018_i18n: locales/translations + مسار عام بثلاث دوال + مسار إداري محروس';
end $$;
