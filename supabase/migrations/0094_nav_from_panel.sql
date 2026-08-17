-- ============================================================================
-- 0094 — الشريط العلوي يُبنى من القاعدة كما يُبنى التذييل
--
-- ══════════════════════════════════════════════════════════════════════════
--  🔴 الفجوة — نقضٌ لقاعدة المالك «كل شيء يُدار من اللوحة»
-- ══════════════════════════════════════════════════════════════════════════
--
-- التذييل يقرأ `pages` (‏`getPagesByKind` في `components/site/footer.tsx`)، فأي
-- صفحةٍ يُنشرها المالك تظهر فيه **وحدها**. والترويسة قائمةٌ محفورة في الكود
-- (‏`NAV_LINKS` في `components/site/links.ts`). فصفحةٌ جديدة تظهر **أسفل** الموقع
-- ولا تظهر **أعلاه** — والمالك لا يملك تغيير ذلك من أي شاشة.
--
-- ══════════════════════════════════════════════════════════════════════════
--  ما تبنيه هذه الهجرة — وشرطُ كل بندٍ من بنود بدر الأربعة
-- ══════════════════════════════════════════════════════════════════════════
--
-- (١) 🔴 **التسمية تُشتقّ من عنوان الصفحة، والاختصار تجاوزٌ اختياري.**
--
--     عناوين الترويسة اليوم في `messages/ar.json` و`messages/en.json` — أي
--     **خارج** خطّ الترجمة في القاعدة. ونقلُها إليه يفتح صنفاً جديداً من النصوص
--     المترجَمة، وقد لدغ هذا المشروع مرتين. فالحلّ ألّا يُنقل شيء:
--
--       • **صفحةٌ في الشريط** ⇒ تسميتها `pages.title` — وهو **مترجَمٌ سلفاً**
--         بمفتاح `page`/`<id>.title` الذي يعرفه `i18n_corpus_rows` من `0018`.
--         فصفحةٌ تُضاف اليوم تُترجَم **مرةً واحدة، مع الصفحة**، بصفر مفتاحٍ جديد.
--       • **الاختصار** (`pages.nav_label`) ⇒ حاجةٌ لا ترف: «الشروط والأحكام»
--         ستة عشر حرفاً تخنق شريطاً علوياً، و«الشروط» تكفي. وهو **مفتاحٌ واحد
--         للصفحة** (`<id>.navLabel`) لا صنفٌ جديد من النصوص.
--       • **البنود الستة القائمة** (‏`/#services` … `/track`) تصير صفوفاً في
--         `nav_links` **بمفاتيح رسائلها كما هي** (`label_key`)، فلا تنتقل تسميةٌ
--         واحدة إلى القاعدة ولا يُطلب من أحدٍ ترجمةُ ما هو مترجَم.
--
--     ⚠ **والاختصار غير المترجَم يسقط إلى العنوان المترجَم لا إلى العربية.**
--       وهذا **استثناءٌ مبرَّرٌ** من قاعدة `0018` («كل حقل يرجع لعربيته وحده»):
--       تلك القاعدة تحرس ضد بديلٍ أسوأ (عقدةٌ فارغة أو مفتاحٌ خام)، وهنا يوجد
--       بديلٌ **بلغة الزائر نفسها** — لأن الاختصار ليس محتوىً مستقلاً بل
--       **تقصيرٌ لعنوانٍ مترجَم**. فـ«الشروط» بلا ترجمة تعطي `Terms and
--       Conditions` (أطول، وصحيحة) لا «الشروط» عربيةً وسط شريطٍ إنجليزي.
--
-- (٢) **سقفٌ يُنبّه ولا يمنع** — `nav_cap()`.
--
--     الطول قيدُ تصميم لا تفضيل، **والرقم مقيسٌ لا مُقدَّر**: التعليق في
--     `components/site/header.tsx` يحمل القياس — سبعةُ روابط عرضها ٧١٠ بكسل
--     بالإنجليزية، والصفُّ يلزمه ‏١٠٣٧ صافية، والمتاح فوق `xl` ثابتٌ عند ١١٠٤
--     (‏`max-w-6xl`) بعد الشعار (٩٢) وكتلة اليمين (٢٠٣). فالسبعة هي الحدّ الذي
--     قيس، وما بعده يلتفّ سطرين. **ويُنبّه ولا يمنع** لأن المنع يحبس المالك
--     خارج قراره، والقياس قد يتقادم بشعارٍ أعرض أو لغةٍ ثالثة.
--
-- (٣) ⚠ **زرّ دخول العملاء ليس بنداً في هذه القائمة — ولا يمكن أن يصير.**
--
--     أُضيف في م‑٤ لأنه كان مخفياً (الفجوة ١٢)، وهو اليوم جزيرةٌ مستقلة
--     (‏`components/site/account-menu.tsx`) مركّبةٌ **بنيوياً** في الترويسة وفي
--     الدرج. فلا صفَّ في القاعدة يمثّله ⇒ لا صفَّ يُحذف ⇒ **لا نقرةٌ تُزيل مدخل
--     حسابات المالك**. والحرس هنا يمنع الطريق العكسي: أن يُنشئ أحدٌ بنداً حرّاً
--     إلى `/account/...` فيصير للمدخل نسخةٌ ثانية **قابلة للحذف** يظنّها الأصل.
--
-- (٤) **الدرج والشريط من مصدرٍ واحد** — `site_nav(p_locale)` تُنادى مرةً واحدة
--     في `header.tsx` ويُصيَّر منها الشريط والدرج. وقائمتان تفترقان يوماً ما.
--
-- ══════════════════════════════════════════════════════════════════════════
--  🔒 ولماذا **لا** تُلمس `localized_page` ولا `mergePage` في TypeScript
-- ══════════════════════════════════════════════════════════════════════════
--
-- `localized_page` تبني `meta` كائناً جديداً بحقلين، فإدخال الاختصار فيها يعني
-- إعادة كتابة جسمها **وجسم `mergePage` في `lib/content.ts`** — وهما مسار قراءة
-- كل صفحةٍ في الموقع. و**D-58** درسٌ مدفوع الثمن في هذا بالضبط: جسمٌ يُنسخ
-- ليُضاف إليه سطرٌ فيعود معه عيبٌ أُصلح.
--
-- فـ`site_nav` تقرأ `translations` **بنفسها** لمفاتيحها الثلاثة، ولا تمرّ من
-- مسار الصفحة إطلاقاً. والمعدَّل الوحيد `i18n_corpus_rows` — وجسمها منقولٌ
-- **من التعريف الحيّ** (`pg_get_functiondef`) لا من `0018`، لأن `0059` و`0065`
-- عدّلتاها بعدها (‏`i18n_item_address` و`i18n_reserved_content_key`)، والفحص
-- الذاتي (٧-أ) يحرس بقاءَهما — لا وجودَ ما أضفناه (D-58، القاعدة الثانية).
--
-- يُنفَّذ بعد 0003 (pages) و0018 (translations/locales) و0058 (page_public_path)
-- و0059/0065 (تعديلا `i18n_corpus_rows`). آمن لإعادة التنفيذ (idempotent).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (٠) لقطةُ ما قبل التعديل — لفحص D-58 في (٧-أ)
--
-- جدولٌ مؤقّت لا دائم: عمره عمر معاملة الهجرة، ويُسقط في آخرها. والغرض قياس
-- **ما كان** قبل `create or replace` — فلا يُقاس بعده ويُقارن بتقدير.
-- ----------------------------------------------------------------------------
create temporary table if not exists _nav0094_corpus_before as
  select c.ns, count(*)::bigint as n from public.i18n_corpus_rows() c group by c.ns;

-- ----------------------------------------------------------------------------
-- (١) حقول الشريط على `pages` — كما يفعل التذييل حرفياً: القرار على الصفحة
--
-- ولماذا أعمدةٌ لا جدولُ ربط؟ لأن التذييل يقرأ `pages` مباشرةً، و«كما يفعل
-- الفوتر حرفياً» هو نصّ الطلب. وجدول ربطٍ لصفحةٍ واحدة يضيف صفاً يمكن أن يتيه
-- عن صفحته (‏`on delete cascade` يعالج الحذف ولا يعالج نسيان الإدراج).
-- ----------------------------------------------------------------------------
alter table public.pages add column if not exists nav_show boolean not null default false;
alter table public.pages add column if not exists nav_sort integer not null default 0;
alter table public.pages add column if not exists nav_label text;

comment on column public.pages.nav_show is
  'أظهر هذه الصفحة في الشريط العلوي. الافتراضي false — فالهجرة لا تغيّر بكسلاً واحداً في الموقع القائم.';
comment on column public.pages.nav_sort is
  'ترتيب الصفحة داخل الشريط العلوي — يتشارك سلّماً واحداً مع nav_links.nav_sort.';
comment on column public.pages.nav_label is
  'اختصار التسمية في الشريط («الشروط» بدل «الشروط والأحكام»). الفراغ = يُشتقّ من pages.title المترجَم سلفاً.';

-- الاختصار: إمّا `null` (لا تجاوز) أو نصٌّ قصيرٌ فعلاً. و«فارغٌ بمسافات» ليس
-- حالةً ثالثة — يُرفض، وإلا صار للـ«لا تجاوز» شكلان يفترق تفسيرهما.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'pages_nav_label_shape'
      and conrelid = 'public.pages'::regclass
  ) then
    alter table public.pages add constraint pages_nav_label_shape
      check (nav_label is null
             or (btrim(nav_label) <> '' and char_length(btrim(nav_label)) <= 24));
  end if;
end $$;

-- فهرسٌ جزئيّ: القارئ الوحيد يسأل «المنشورة الظاهرة في الشريط بترتيبها»
create index if not exists pages_nav_show_sort_idx
  on public.pages (nav_sort, slug) where nav_show = true and published = true;

-- ----------------------------------------------------------------------------
-- (٢) السقف — دالةٌ واحدة يقرؤها SQL والواجهة معاً (نظير D-59)
--
-- ولا رقمٌ مكتوبٌ في TypeScript: الواجهة تقرؤه من حمولة `site_nav`، فلا ينحرف
-- تحذيرُ اللوحة عن حكم القاعدة.
-- ----------------------------------------------------------------------------
create or replace function public.nav_cap()
returns integer
language sql
immutable
as $$ select 7 $$;

comment on function public.nav_cap() is
  'أقصى عدد بنودٍ يتّسع له الشريط العلوي — مقيسٌ في تعليق components/site/header.tsx (٧ روابط = ٧١٠ بكسل بالإنجليزية). يُنبّه ولا يمنع.';

-- ----------------------------------------------------------------------------
-- (٣) حارسا الرابط الحرّ — دالتان immutable ليصلحا في `check` لا في مُشغّل وحده
-- ----------------------------------------------------------------------------

-- شكلٌ صالحٌ لرابط بند: مسارٌ داخلي (`/`, `/book`, `/#services`) أو عنوان مطلق.
-- و`//host` مرفوضٌ صراحةً — رابطٌ بروتوكول-نسبيّ يخرج بالزائر من الموقع بلا أن
-- يبدو خارجياً، وهو نفس ما يرفضه `internalPath` في `components/site/links.ts`.
create or replace function public.nav_href_ok(p_href text)
returns boolean
language sql
immutable
as $$
  select p_href is not null
     and btrim(p_href) = p_href
     and (p_href = '/' or p_href ~ '^/[^/]' or p_href ~ '^https?://[^/]')
$$;

comment on function public.nav_href_ok(text) is
  'شكل رابط بند الشريط: مسار داخلي يبدأ بـ/ بلا شرطة ثانية، أو عنوان http(s) مطلق. مرآةُ internalPath في components/site/links.ts.';

-- 🔴 مسارات الحساب محجوزةٌ عن هذه القائمة — البند الثالث من بنود بدر.
--
-- تُطابق `/account` و`/account/…` وبادئةَ لغةٍ أمامهما (`/en/account/login`)،
-- ومعها الاستعلام والمرساة (`/account/login?next=/`).
create or replace function public.nav_href_reserved(p_href text)
returns boolean
language sql
immutable
as $$
  select coalesce(p_href ~ '^/([a-z]{2}(-[a-z]{2})?/)?account([/?#]|$)', false)
$$;

comment on function public.nav_href_reserved(text) is
  'رابطٌ ممنوعٌ على بنود الشريط: كل ما يقود إلى /account — مدخل حساب العميل جزيرةٌ بنيوية لا صفٌّ يُحذف (م‑٤، الفجوة ١٢).';

-- ----------------------------------------------------------------------------
-- (٤) البنود الحرّة — ما ليس صفحةً: مرساةٌ في الرئيسية، أو مسارُ تطبيق، أو فعل
-- ----------------------------------------------------------------------------
create table if not exists public.nav_links (
  id         uuid primary key default gen_random_uuid(),
  /**
   * التسمية العربية. **مطلوبةٌ دائماً** حتى مع `label_key`: هي احتياطي مفتاح
   * الرسائل — فمفتاحٌ يُحذف من `messages/ar.json` يوماً لا يُخرج شريطاً بلا نصّ.
   */
  label      text not null check (btrim(label) <> '' and char_length(btrim(label)) <= 24),
  /**
   * مفتاحٌ نسبيٌّ داخل مساحة `site.nav` في ملفّي الرسائل (‏`services` · `track`).
   * وجودُه يعني **«تسميتي في المستودع مترجمةً سلفاً»** ⇒ لا مفتاح ترجمةٍ في
   * القاعدة ولا صفَّ عملٍ في اللوحة. وهذا هو ما ينقل البنود الستة القائمة إلى
   * القاعدة **بلا أن ينقل تسميةً واحدة** (البند الأول من بنود بدر).
   *
   * ⚠ ونسبيٌّ لا مطلق بقصد: `getT("site.nav", locale)` مساحةٌ واحدة تُحلّ مرةً
   * في الترويسة. ومفتاحٌ مطلق كان سيعني مساحاتٍ متعددة تُحلّ لكل بند.
   */
  label_key  text check (label_key is null or label_key ~ '^[a-z][A-Za-z0-9]*$'),
  href       text not null constraint nav_links_href_shape check (public.nav_href_ok(href)),
  nav_sort   integer not null default 0,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  /**
   * 🔒 الضمانة البنيوية للبند الثالث. والمُشغّل أدناه يسبقها برسالةٍ مفهومة —
   * فالقيد **يضمن** والمُشغّل **يشرح**: رسالةُ قيدٍ لا تقول للمالك أيَّ مدخلٍ
   * حُرس ولا لماذا، وهو أحوج ما يكون إلى ذلك في اللحظة التي يُمنع فيها.
   */
  constraint nav_links_href_not_account check (not public.nav_href_reserved(href))
);

comment on table public.nav_links is
  'بنود الشريط العلوي التي ليست صفحات — مراسي الرئيسية ومسارات التطبيق والأفعال. الصفحات تُدار بأعمدة pages.nav_*.';
comment on column public.nav_links.label_key is
  'مفتاح site.nav في ملفّي الرسائل. موجودٌ ⇒ التسمية من المستودع (مترجمةٌ سلفاً) ولا مفتاح ترجمةٍ في القاعدة. غائبٌ ⇒ نصٌّ حرّ يُترجَم بمفتاح settings/nav.<id>.label.';

create index if not exists nav_links_active_sort_idx
  on public.nav_links (nav_sort, id) where active = true;

drop trigger if exists nav_links_touch_updated_at on public.nav_links;
create trigger nav_links_touch_updated_at
  before update on public.nav_links
  for each row execute function public.touch_updated_at();

-- المُشغّل الشارح — يرمي قبل أن يُقيَّم القيد، فالمالك يقرأ سبباً لا اسم قيد
create or replace function public.nav_links_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.nav_href_reserved(new.href) then
    raise exception
      'رابط حساب العميل (%) لا يُضاف إلى الشريط العلوي: مدخل «دخول العملاء» مركّبٌ في الترويسة وفي درج الجوال بنيوياً، فلا يُحذف بنقرة. وبندٌ حرٌّ إليه نسخةٌ ثانية قابلة للحذف يظنّها المالك الأصل.',
      new.href
      using hint = 'nav-href-account-reserved';
  end if;

  if not public.nav_href_ok(new.href) then
    raise exception
      'رابط «%» غير صالح لبند شريط: المطلوب مسارٌ داخلي يبدأ بشرطة مائلة واحدة (‏/book أو /#services) أو عنوانٌ كامل يبدأ بـhttp.',
      new.href
      using hint = 'nav-href-shape';
  end if;

  return new;
end;
$$;

drop trigger if exists nav_links_guard on public.nav_links;
create trigger nav_links_guard
  before insert or update on public.nav_links
  for each row execute function public.nav_links_guard();

-- ----------------------------------------------------------------------------
-- (٥) RLS — مرآةُ `pages` في `0003`: الزائر يرى المفعَّل، والكتابة للمشرف
-- ----------------------------------------------------------------------------
alter table public.nav_links enable row level security;

/**
 * 🔴 **الإلغاء قبل المنح — لا تجميلاً.** Supabase تضبط
 * `alter default privileges … grant all on tables to anon, authenticated`، فجدولٌ
 * جديد يولد و`anon` يملك عليه `INSERT/UPDATE/DELETE` **قبل أن يُمنح شيئاً**.
 * و RLS وحدها كانت ستصدّه (‏لا سياسة كتابة لـ`anon`) — لكن «الوصول طبقتان
 * كلتاهما مطلوبة» تعني أن الطبقة الأولى يجب أن تُغلق أيضاً، وإلا كفى سهوٌ في
 * سياسةٍ يوماً لينفتح الباب. وفحص (٩-هـ) أمسك هذا بعينه على أول تشغيل.
 */
revoke all on public.nav_links from anon, authenticated;

grant select on public.nav_links to anon, authenticated;
grant select, insert, update, delete on public.nav_links to authenticated;

drop policy if exists "nav_links_select_anon_active" on public.nav_links;
create policy "nav_links_select_anon_active"
  on public.nav_links for select to anon using (active = true);

drop policy if exists "nav_links_select_authenticated" on public.nav_links;
create policy "nav_links_select_authenticated"
  on public.nav_links for select to authenticated using (true);

drop policy if exists "nav_links_insert_admin" on public.nav_links;
create policy "nav_links_insert_admin"
  on public.nav_links for insert to authenticated with check (public.is_admin());

drop policy if exists "nav_links_update_admin" on public.nav_links;
create policy "nav_links_update_admin"
  on public.nav_links for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "nav_links_delete_admin" on public.nav_links;
create policy "nav_links_delete_admin"
  on public.nav_links for delete to authenticated using (public.is_admin());

-- ----------------------------------------------------------------------------
-- (٦) البذرة — البنود الستة القائمة، بمعرّفات ثابتة وبمفاتيح رسائلها
--
-- 🔒 **وصفر صفحةٍ مُعلَّمة `nav_show`**: الشريط بعد هذه الهجرة **مطابقٌ لما قبلها
--    حرفاً** — نفس الستة بنفس الترتيب بنفس التسميات من نفس ملفّي الرسائل. فلا
--    مراجعةٌ بصرية تُطالب بفرقٍ ولا زائرٌ يرى تغييراً. والقرارُ التالي للمالك.
--
-- والترتيب بمضاعفات العشرة ليتّسع الإدراج بين بندين بلا إعادة ترقيم الكل.
-- والمبرر التفصيلي لموضع «اطلب عرض سعر» و«تابع حجزك» محفوظٌ في تعليقَي
-- `NAV_LINKS` في `components/site/links.ts` — ولا يُنسخ هنا.
-- ----------------------------------------------------------------------------
insert into public.nav_links (id, label, label_key, href, nav_sort, active) values
  ('a0940000-0000-4000-8000-000000000010', 'الخدمات',      'services',     '/#services',     10, true),
  ('a0940000-0000-4000-8000-000000000020', 'الأسطول',      'fleet',        '/#fleet',        20, true),
  ('a0940000-0000-4000-8000-000000000030', 'لماذا نحن',    'why',          '/#why',          30, true),
  ('a0940000-0000-4000-8000-000000000040', 'تواصل',        'contact',      '/#contact',      40, true),
  ('a0940000-0000-4000-8000-000000000050', 'اطلب عرض سعر', 'quoteRequest', '/quote-request', 50, true),
  ('a0940000-0000-4000-8000-000000000060', 'تابع حجزك',    'track',        '/track',         60, true)
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- (٧) فهرس الترجمة — فرعان، **والجسم منقولٌ من التعريف الحيّ** (D-58)
--
-- ما أُضيف: (و) اختصار الشريط على الصفحة · (ز) تسمية بندٍ حرٍّ بلا مفتاح رسائل.
-- وما عداهما حرفٌ بحرف كما كان — بما فيه `i18n_reserved_content_key` (‏`0065`)
-- و`i18n_item_address` (‏`0059`)، وفحصُ (٧-أ) يقيس بقاءَهما لا بقاءَ إضافتنا.
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

  -- (و) 0094: اختصار الشريط العلوي — مفتاحٌ **واحد** للصفحة، بمعرّفها لا بترتيبها.
  --     ومقصورٌ على المُعلَّمة `nav_show`: لا يُطلب من أحدٍ ترجمةُ اختصارٍ لا يُعرض.
  union all
  select 'page', p.id::text || '.navLabel', p.nav_label
  from public.pages p
  where p.published = true and p.nav_show = true
    and btrim(coalesce(p.nav_label, '')) <> ''

  -- (ز) 0094: تسمية بندٍ حرٍّ في الشريط — **بمعرّف صفّه** فإعادة الترتيب لا تنقل
  --     ترجمته إلى جاره (نفس علّة `_k` في `0059`). وما له `label_key` لا يظهر
  --     هنا إطلاقاً: تسميته في المستودع مترجمةً سلفاً.
  union all
  select 'settings', 'nav.' || n.id::text || '.label', n.label
  from public.nav_links n
  where n.active = true and n.label_key is null and btrim(coalesce(n.label, '')) <> ''
$$;

comment on function public.i18n_corpus_rows() is
  'كل نصّ قابل للترجمة مستخرجاً من البيانات الحيّة — والفرعان (و) و(ز) من 0094: اختصار الشريط على الصفحة، وتسمية البند الحرّ بمعرّف صفّه.';

-- ----------------------------------------------------------------------------
-- (٨) 🔴 القارئ الواحد — `site_nav(p_locale)`
--
-- تُرجع الشريط كاملاً مترجَماً وحمولةَ السقف معه، فيقرؤها **الشريط والدرج
-- واللوحة** من نداءٍ واحد (البند الرابع). و`security definer` بنمط `0018`:
-- تتجاوز RLS فتُكتب الفلترة على `published`/`active` صراحةً هنا.
-- ----------------------------------------------------------------------------
create or replace function public.site_nav(p_locale text default 'ar')
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_locale text := coalesce(nullif(btrim(p_locale), ''), 'ar');
  v_active boolean;
  v_pmap   jsonb := '{}'::jsonb;
  v_nmap   jsonb := '{}'::jsonb;
  v_items  jsonb;
  v_count  integer;
  v_cap    integer := public.nav_cap();
begin
  v_active := public.i18n_locale_active(v_locale);

  if v_active then
    -- مفاتيح الصفحات: العنوان والاختصار وحدهما — لا الميتا ولا الأقسام
    select coalesce(jsonb_object_agg(tr.key, tr.value), '{}'::jsonb)
      into v_pmap
    from public.translations tr
    where tr.locale = v_locale
      and tr.namespace = 'page'
      and tr.status = 'published'
      and tr.value is not null
      and btrim(tr.value) <> ''
      and (tr.key like '%.navLabel' or tr.key like '%.title');

    select coalesce(jsonb_object_agg(tr.key, tr.value), '{}'::jsonb)
      into v_nmap
    from public.translations tr
    where tr.locale = v_locale
      and tr.namespace = 'settings'
      and tr.status = 'published'
      and tr.value is not null
      and btrim(tr.value) <> ''
      and tr.key like 'nav.%.label';
  end if;

  select coalesce(jsonb_agg(x.item order by x.nav_sort, x.label, x.id), '[]'::jsonb),
         count(*)::integer
    into v_items, v_count
  from (
    -- (أ) الصفحات المُعلَّمة
    select
      p.nav_sort,
      p.id::text as id,
      v_label.label,
      jsonb_build_object(
        'kind',     'page',
        'id',       p.id::text,
        'href',     public.page_public_path(p.kind, p.slug),
        'label',    v_label.label,
        'labelKey', null::text
      ) as item
    from public.pages p
    cross join lateral (
      select coalesce(
        /**
         * ١ الاختصار المترجَم — إن كانت لغةَ ترجمةٍ فعّالة.
         * ٢ الاختصار كما كتبه المالك — **للغة الأساس وحدها**.
         * ٣ العنوان المترجَم. ٤ العنوان العربي.
         *
         * ⚠ والسطر (٢) مقصورٌ على الأساس بقصد: اختصارٌ عربيٌّ بلا ترجمة يسقط
         *   إلى العنوان **بلغة الزائر** لا إلى العربية — لأنه تقصيرُ عنوانٍ
         *   مترجَم لا محتوىً مستقل. المبرر كاملاً في ترويسة هذه الهجرة.
         */
        case when v_active
             then nullif(btrim(coalesce(v_pmap ->> (p.id::text || '.navLabel'), '')), '') end,
        case when not v_active then nullif(btrim(coalesce(p.nav_label, '')), '') end,
        case when v_active
             then nullif(btrim(coalesce(v_pmap ->> (p.id::text || '.title'), '')), '') end,
        p.title
      ) as label
    ) as v_label
    where p.published = true
      and p.nav_show = true
      and public.page_public_path(p.kind, p.slug) is not null

    union all

    -- (ب) البنود الحرّة. و`labelKey` تخرج كما هي: الترويسة تحلّها من مساحة
    --     `site.nav` في ملفّي الرسائل، و`label` احتياطيُّها إن غاب المفتاح.
    select
      n.nav_sort,
      n.id::text,
      coalesce(
        case when v_active and n.label_key is null
             then nullif(btrim(coalesce(v_nmap ->> ('nav.' || n.id::text || '.label'), '')), '') end,
        n.label
      ),
      jsonb_build_object(
        'kind',     'link',
        'id',       n.id::text,
        'href',     n.href,
        'label',    coalesce(
          case when v_active and n.label_key is null
               then nullif(btrim(coalesce(v_nmap ->> ('nav.' || n.id::text || '.label'), '')), '') end,
          n.label),
        'labelKey', n.label_key
      )
    from public.nav_links n
    where n.active = true
  ) as x;

  return jsonb_build_object(
    'locale',  v_locale,
    'cap',     v_cap,
    'count',   v_count,
    'overCap', v_count > v_cap,
    'items',   v_items);
end;
$$;

comment on function public.site_nav(text) is
  'الشريط العلوي كاملاً بلغة الزائر + السقف وحالته — المصدر الواحد للشريط ولدرج الجوال ولتحذير اللوحة (البند ٤ من بنود بدر).';

revoke all    on function public.site_nav(text) from public, anon, authenticated;
grant execute on function public.site_nav(text) to anon, authenticated;

revoke all    on function public.nav_cap() from public;
grant execute on function public.nav_cap() to anon, authenticated;
grant execute on function public.nav_href_ok(text)       to authenticated;
grant execute on function public.nav_href_reserved(text) to authenticated;

-- ============================================================================
-- (٩) الفحوص الذاتية — كلٌّ منها يحرس بنداً من بنود بدر أو درساً مدفوع الثمن
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (٩-أ) 🔴 D-58: الجسم المنقول لم يفقد ما أصلحته `0059` و`0065`
--
-- «الفحص يحرس ما كان قائماً لا ما أضفتَه» — فلا يُسأل عن الفرعين الجديدين، بل
-- عن أثرَي الإصلاحين السابقين، وعن أن **مقام كل مساحةٍ قائمة لم ينقص**.
-- ----------------------------------------------------------------------------
do $$
declare
  v_def   text;
  v_ns    text;
  v_was   bigint;
  v_now   bigint;
begin
  v_def := pg_get_functiondef('public.i18n_corpus_rows()'::regprocedure);

  if position('i18n_reserved_content_key' in v_def) = 0 then
    raise exception '0094: 🔴 الجسم المنقول فقد `i18n_reserved_content_key` — إصلاح 0065 (المرساة والتنسيق ليسا نصاً) عاد عيباً';
  end if;
  if position('i18n_item_address' in v_def) = 0 then
    raise exception '0094: 🔴 الجسم المنقول فقد `i18n_item_address` — إصلاح 0059 (عنوان العنصر ثابت لا ترتيبي) عاد عيباً';
  end if;

  for v_ns, v_was in select b.ns, b.n from _nav0094_corpus_before b loop
    select count(*) into v_now from public.i18n_corpus_rows() c where c.ns = v_ns;
    if v_now < v_was then
      raise exception '0094: 🔴 مساحة «%» نقصت من % إلى % صفاً — الجسم المنقول أسقط فرعاً', v_ns, v_was, v_now;
    end if;
  end loop;

  raise notice '✔ 0094 (٩-أ): الجسم المنقول أبقى إصلاحَي 0059 و0065 ولم ينقص مقامَ مساحةٍ واحدة';
end;
$$;

-- ----------------------------------------------------------------------------
-- (٩-ب) الفرعان الجديدان يظهران بشرطهما ويغيبان بغيابه — بمسبارٍ يُرجَع
-- ----------------------------------------------------------------------------
do $$
declare
  v_page   uuid := '00940b00-0000-4000-8000-00000000000a';
  v_free   uuid := '00940b00-0000-4000-8000-00000000000b';
  v_keyed  uuid := '00940b00-0000-4000-8000-00000000000c';
  v_done   boolean := false;
  v_hidden boolean;
  v_shown  boolean;
  v_freeIn boolean;
  v_keyIn  boolean;
begin
  begin
    insert into public.pages (id, slug, kind, title, published, nav_show, nav_sort, nav_label)
    values (v_page, '0094-probe', 'landing', 'صفحة فحص هجرة ٩٤', true, false, 5, 'فحص');

    -- `nav_show = false` ⇒ الاختصار خارج الفهرس (لا يُعرض فلا يُترجَم)
    v_hidden := exists (
      select 1 from public.i18n_corpus_rows() c
      where c.ns = 'page' and c.k = v_page::text || '.navLabel');

    update public.pages set nav_show = true where id = v_page;
    v_shown := exists (
      select 1 from public.i18n_corpus_rows() c
      where c.ns = 'page' and c.k = v_page::text || '.navLabel' and c.src = 'فحص');

    insert into public.nav_links (id, label, label_key, href, nav_sort)
    values (v_free,  'بندٌ حرّ', null,   '/0094-probe', 900),
           (v_keyed, 'بمفتاح',  'fleet', '/#fleet-probe', 901);

    v_freeIn := exists (
      select 1 from public.i18n_corpus_rows() c
      where c.ns = 'settings' and c.k = 'nav.' || v_free::text || '.label');
    v_keyIn := exists (
      select 1 from public.i18n_corpus_rows() c
      where c.ns = 'settings' and c.k = 'nav.' || v_keyed::text || '.label');

    v_done := true;
    raise exception 'ROLLBACK_0094_PROBE';
  exception
    when others then
      if sqlerrm <> 'ROLLBACK_0094_PROBE' then raise; end if;
  end;

  if not v_done then
    raise exception '0094: مسبار الفهرس لم يكتمل — لا حكم على نصف قياس';
  end if;
  if v_hidden then
    raise exception '0094: اختصارُ صفحةٍ غير معروضةٍ في الشريط دخل فهرس الترجمة — عملُ ترجمةٍ لنصٍّ لا يراه أحد';
  end if;
  if not v_shown then
    raise exception '0094: 🔴 اختصارُ صفحةٍ معروضةٍ غاب عن الفهرس — فالمالك لا يستطيع ترجمته أبداً';
  end if;
  if not v_freeIn then
    raise exception '0094: 🔴 تسميةُ بندٍ حرٍّ غابت عن الفهرس — نصٌّ في القاعدة بلا طريقٍ إلى الترجمة';
  end if;
  if v_keyIn then
    raise exception '0094: بندٌ له `label_key` دخل فهرس الترجمة — طُلبت ترجمةُ ما هو مترجَمٌ في المستودع (البند ١)';
  end if;

  raise notice '✔ 0094 (٩-ب): الاختصار يدخل الفهرس عند العرض وحده · البند الحرّ بمعرّف صفّه · وما له مفتاح رسائل لا يُطلب مرتين';
end;
$$;

-- ----------------------------------------------------------------------------
-- (٩-ج) 🔴 البند الثالث: مدخل الحساب لا يصير صفاً — والمُشغّل يسمّي السبب
-- ----------------------------------------------------------------------------
do $$
declare
  v_blocked int := 0;
  v_href    text;
  v_allowed int := 0;
begin
  foreach v_href in array array[
    '/account', '/account/login', '/account/bookings',
    '/account/login?next=/book', '/en/account/login', '/account#x'
  ] loop
    begin
      insert into public.nav_links (label, href) values ('مسبار', v_href);
      raise exception '0094: 🔴 قُبل «%» بنداً في الشريط — مدخل حساب العميل صار قابلاً للحذف بنقرة', v_href;
    exception
      when others then
        if position('0094:' in sqlerrm) = 1 then raise; end if;
        v_blocked := v_blocked + 1;
    end;
  end loop;

  if v_blocked <> 6 then
    raise exception '0094: صُدّت % من ٦ صيغٍ لرابط الحساب', v_blocked;
  end if;

  -- 🔬 وطفرةٌ تُثبت أن الحارس هو الرافض لا الشكلُ: `/accounts-team` تمرّ.
  --    فلو كان الرفض على «كلمة account في الرابط» لسقطت هذه معها.
  begin
    insert into public.nav_links (id, label, href)
    values ('00940c00-0000-4000-8000-00000000000d', 'فريق الحسابات', '/accounts-team');
    v_allowed := 1;
    delete from public.nav_links where id = '00940c00-0000-4000-8000-00000000000d';
  exception
    when others then
      raise exception '0094: 🔴 رُفض «/accounts-team» — الحارس يفلتر بالنصّ لا بالمسار، فهو يمنع ما لم يُطلب منعه: %', sqlerrm;
  end;

  if v_allowed <> 1 then
    raise exception '0094: الطفرة لم تُقَس';
  end if;

  raise notice '✔ 0094 (٩-ج): ست صيغٍ لرابط الحساب مصدودة (ومنها بادئة لغة واستعلام ومرساة)، و/accounts-team تمرّ — فالحارس مسارٌ لا نصّ';
end;
$$;

-- ----------------------------------------------------------------------------
-- (٩-د) 🔒 الشريط بعد الهجرة = الشريط قبلها حرفاً
--
-- ستة بنود بنفس الترتيب وبنفس المسارات وكلها بمفتاح رسائل ⇒ صفر تسميةٍ انتقلت
-- إلى القاعدة، وصفر بكسل تغيّر. وصفر صفحةٍ مُعلَّمة.
-- ----------------------------------------------------------------------------
do $$
declare
  v_nav    jsonb := public.site_nav('ar');
  v_hrefs  text[];
  v_keys   int;
  v_pages  int;
begin
  select array_agg(i ->> 'href' order by ord)
    into v_hrefs
  from jsonb_array_elements(v_nav -> 'items') with ordinality as t(i, ord);

  if v_hrefs is distinct from array[
       '/#services', '/#fleet', '/#why', '/#contact', '/quote-request', '/track'] then
    raise exception '0094: 🔴 الشريط تغيّر عمّا كان — %', coalesce(array_to_string(v_hrefs, ' · '), '∅');
  end if;

  select count(*) into v_keys
  from jsonb_array_elements(v_nav -> 'items') i
  where i ->> 'labelKey' is null;
  if v_keys <> 0 then
    raise exception '0094: % بنداً بلا مفتاح رسائل — تسميةٌ انتقلت إلى القاعدة (البند ١)', v_keys;
  end if;

  select count(*) into v_pages from public.pages where nav_show = true;
  if v_pages <> 0 then
    raise exception '0094: % صفحةً مُعلَّمة بالبذرة — القرار للمالك لا للهجرة', v_pages;
  end if;

  if (v_nav ->> 'cap')::int <> 7 then
    raise exception '0094: السقف % لا ٧', v_nav ->> 'cap';
  end if;
  if (v_nav ->> 'count')::int <> 6 or (v_nav -> 'overCap')::boolean then
    raise exception '0094: العدّ % والتجاوز % — والمتوقع ٦ وfalse', v_nav ->> 'count', v_nav ->> 'overCap';
  end if;

  raise notice '✔ 0094 (٩-د): الشريط ستة بنود بترتيبها ومساراتها كما كانت، كلها بمفاتيح المستودع · صفر صفحةٍ مُعلَّمة · السقف ٧ والعدّ ٦';
end;
$$;

-- ----------------------------------------------------------------------------
-- (٩-هـ) صلاحيات القارئ: الزائر ينفّذ `site_nav` ولا يكتب في `nav_links`
-- ----------------------------------------------------------------------------
do $$
begin
  if not has_function_privilege('anon', 'public.site_nav(text)', 'EXECUTE') then
    raise exception '0094: anon لا ينفّذ site_nav — فالشريط لا يُصيَّر لزائر';
  end if;
  if has_table_privilege('anon', 'public.nav_links', 'INSERT')
     or has_table_privilege('anon', 'public.nav_links', 'UPDATE')
     or has_table_privilege('anon', 'public.nav_links', 'DELETE') then
    raise exception '0094: 🔴 anon يكتب في nav_links';
  end if;
  if not has_table_privilege('anon', 'public.nav_links', 'SELECT') then
    raise exception '0094: anon لا يقرأ nav_links — والسياسة تقصره على المفعَّل';
  end if;

  raise notice '✔ 0094 (٩-هـ): anon ينفّذ site_nav ويقرأ المفعَّل ولا يكتب حرفاً';
end;
$$;

drop table if exists _nav0094_corpus_before;

do $$
begin
  raise notice '✅ 0094 اكتملت — الشريط العلوي من القاعدة: علمٌ وترتيبٌ واختصارٌ على كل صفحة · بنودٌ حرّة بجدولها · سقفٌ ينبّه ولا يمنع · ومدخل الحساب محجوزٌ بنيوياً عن القائمة';
end;
$$;
