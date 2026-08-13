-- ============================================================================
-- 0003_content.sql — نظام المحتوى: الصفحات + الأقسام + مكتبة الوسائط (media)
-- المرحلة ٢: كل صفحة عامة = صف في `pages` + أقسام مرتبة في `sections` بمحتوى JSONB.
-- العقد المرجعي للأنواع والأشكال: lib/content-types.ts — لا أنواع خارجه.
-- يُنفَّذ بعد 0001 (يعتمد على public.is_admin و public.touch_updated_at).
-- آمن لإعادة التنفيذ (idempotent).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (١) جدول الصفحات — صف لكل صفحة عامة (الرئيسية/خدمة/مسار سيو/ثابتة)
-- meta: عنوان ووصف السيو لكل صفحة (يُحرَّران من اللوحة)
-- ----------------------------------------------------------------------------
create table if not exists public.pages (
  id         uuid primary key default gen_random_uuid(),
  slug       text unique not null,
  kind       text not null default 'static'
             check (kind in ('home', 'service', 'corridor', 'static')),
  title      text not null,
  meta       jsonb not null default '{"title": null, "description": null}'::jsonb,
  published  boolean not null default true,
  sort       integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- تحديث updated_at تلقائياً عند أي تعديل (الدالة معرَّفة في 0001)
drop trigger if exists pages_touch_updated_at on public.pages;
create trigger pages_touch_updated_at
  before update on public.pages
  for each row execute function public.touch_updated_at();

-- ----------------------------------------------------------------------------
-- (٢) جدول الأقسام — مكوّنات الصفحة المرتبة، المحتوى JSONB حسب نوع القسم
-- حذف الصفحة يحذف أقسامها تلقائياً (on delete cascade)
-- ----------------------------------------------------------------------------
create table if not exists public.sections (
  id      uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.pages(id) on delete cascade,
  type    text not null,
  content jsonb not null default '{}'::jsonb,
  sort    integer not null default 0,
  visible boolean not null default true
);

-- فهرس القراءة الأساسي: أقسام صفحة معينة بترتيبها
create index if not exists sections_page_id_sort_idx
  on public.sections (page_id, sort);

-- ----------------------------------------------------------------------------
-- (٣) تفعيل RLS + الصلاحيات — تذكير: الوصول طبقتان (GRANT + سياسة) كلاهما مطلوب
-- ----------------------------------------------------------------------------
alter table public.pages    enable row level security;
alter table public.sections enable row level security;

grant select on public.pages    to anon, authenticated;
grant select on public.sections to anon, authenticated;
grant select, insert, update, delete on public.pages    to authenticated;
grant select, insert, update, delete on public.sections to authenticated;

-- ----------------------------------------------------------------------------
-- (٤) سياسات pages
-- الزائر (anon): يرى الصفحات المنشورة فقط
-- المسجَّل (authenticated): يرى الكل (اللوحة تعرض المسودات)
-- الكتابة: admin فقط
-- ----------------------------------------------------------------------------
drop policy if exists "pages_select_anon_published" on public.pages;
create policy "pages_select_anon_published"
  on public.pages
  for select
  to anon
  using (published = true);

drop policy if exists "pages_select_authenticated" on public.pages;
create policy "pages_select_authenticated"
  on public.pages
  for select
  to authenticated
  using (true);

drop policy if exists "pages_insert_admin" on public.pages;
create policy "pages_insert_admin"
  on public.pages
  for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "pages_update_admin" on public.pages;
create policy "pages_update_admin"
  on public.pages
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "pages_delete_admin" on public.pages;
create policy "pages_delete_admin"
  on public.pages
  for delete
  to authenticated
  using (public.is_admin());

-- ----------------------------------------------------------------------------
-- (٥) سياسات sections
-- الزائر (anon): يرى الأقسام الظاهرة (visible) التابعة لصفحة منشورة فقط —
-- الربط بالصفحة الأم شرط، وإلا تسرّبت أقسام المسودات
-- المسجَّل: يرى الكل | الكتابة: admin فقط
-- ----------------------------------------------------------------------------
drop policy if exists "sections_select_anon_visible" on public.sections;
create policy "sections_select_anon_visible"
  on public.sections
  for select
  to anon
  using (
    visible = true
    and exists (
      select 1
      from public.pages p
      where p.id = sections.page_id
        and p.published = true
    )
  );

drop policy if exists "sections_select_authenticated" on public.sections;
create policy "sections_select_authenticated"
  on public.sections
  for select
  to authenticated
  using (true);

drop policy if exists "sections_insert_admin" on public.sections;
create policy "sections_insert_admin"
  on public.sections
  for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "sections_update_admin" on public.sections;
create policy "sections_update_admin"
  on public.sections
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "sections_delete_admin" on public.sections;
create policy "sections_delete_admin"
  on public.sections
  for delete
  to authenticated
  using (public.is_admin());

-- ----------------------------------------------------------------------------
-- (٦) مكتبة الوسائط — bucket باسم media على Supabase Storage
-- القراءة: عامة (صور الموقع تُخدم مباشرة) | الرفع/التعديل/الحذف: admin فقط
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do nothing;

drop policy if exists "media_select_public" on storage.objects;
create policy "media_select_public"
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'media');

drop policy if exists "media_insert_admin" on storage.objects;
create policy "media_insert_admin"
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'media' and public.is_admin());

drop policy if exists "media_update_admin" on storage.objects;
create policy "media_update_admin"
  on storage.objects
  for update
  to authenticated
  using (bucket_id = 'media' and public.is_admin())
  with check (bucket_id = 'media' and public.is_admin());

drop policy if exists "media_delete_admin" on storage.objects;
create policy "media_delete_admin"
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'media' and public.is_admin());
