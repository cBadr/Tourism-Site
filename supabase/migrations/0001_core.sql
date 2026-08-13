-- ============================================================================
-- 0001_core.sql — الأساس: جدول الإعدادات + الملفات الشخصية + دوال الأمان + RLS
-- يُنفَّذ أولاً في SQL Editor داخل Supabase. آمن لإعادة التنفيذ (idempotent).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (١) جدول إعدادات الموقع — key/value بصيغة JSONB
-- مصدر هوية العلامة التجارية (الاسم، الألوان، التواصل، السيو...)
-- المفاتيح الخمسة: brand, contact, socials, company, seo
-- ----------------------------------------------------------------------------
create table if not exists public.site_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

-- تحديث updated_at تلقائياً عند أي تعديل
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists site_settings_touch_updated_at on public.site_settings;
create trigger site_settings_touch_updated_at
  before update on public.site_settings
  for each row execute function public.touch_updated_at();

-- ----------------------------------------------------------------------------
-- (٢) جدول الملفات الشخصية — امتداد لـ auth.users مع الدور (role)
-- الأدوار: admin (مالك/مدير) | ops (تشغيل) | subcontractor (مقاول باطن) | customer (عميل)
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  role       text not null default 'customer'
             check (role in ('admin', 'ops', 'subcontractor', 'customer')),
  full_name  text,
  phone      text,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- (٣) Trigger: إنشاء ملف شخصي تلقائياً عند تسجيل أي مستخدم جديد
-- security definer: تعمل بصلاحيات مالكها فتتجاوز RLS أثناء الإدراج التلقائي
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, phone)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'phone'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- (٤) دوال مساعدة للأمان — security definer حتى لا تمر على RLS الخاص بـ profiles
-- (استدعاء profiles من داخل سياسة على profiles نفسها يسبب recursion لا نهائي؛
--  الـ definer يتجاوز RLS فيقطع الحلقة). stable + search_path مثبَّت للأمان.
-- ----------------------------------------------------------------------------

-- هل المستخدم الحالي admin؟
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role = 'admin'
  );
$$;

-- دور المستخدم الحالي (تُستخدم لمنع المستخدم من تغيير دوره بنفسه)
create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select role
  from public.profiles
  where id = (select auth.uid());
$$;

grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.current_user_role() to anon, authenticated;

-- ----------------------------------------------------------------------------
-- (٥) تفعيل RLS على كل الجداول — لا وصول إلا عبر سياسة صريحة
-- ----------------------------------------------------------------------------
alter table public.site_settings enable row level security;
alter table public.profiles      enable row level security;

-- تذكير: الوصول طبقتان — GRANT على مستوى الجدول + سياسة RLS. كلاهما مطلوب.
grant select on public.site_settings to anon, authenticated;
grant select, insert, update, delete on public.site_settings to authenticated;
grant select, update on public.profiles to authenticated;

-- ----------------------------------------------------------------------------
-- (٦) سياسات site_settings
-- القراءة: عامة (الموقع العام يقرأ الهوية بدون تسجيل دخول)
-- الكتابة: admin فقط
-- ----------------------------------------------------------------------------
drop policy if exists "site_settings_select_public" on public.site_settings;
create policy "site_settings_select_public"
  on public.site_settings
  for select
  to anon, authenticated
  using (true);

drop policy if exists "site_settings_insert_admin" on public.site_settings;
create policy "site_settings_insert_admin"
  on public.site_settings
  for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "site_settings_update_admin" on public.site_settings;
create policy "site_settings_update_admin"
  on public.site_settings
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "site_settings_delete_admin" on public.site_settings;
create policy "site_settings_delete_admin"
  on public.site_settings
  for delete
  to authenticated
  using (public.is_admin());

-- ----------------------------------------------------------------------------
-- (٧) سياسات profiles
-- المستخدم: يقرأ ويعدّل صفه فقط — ولا يستطيع أبداً تغيير دوره (role)
-- الـ admin: يقرأ ويعدّل الجميع
-- (لا سياسة insert للمستخدمين: الإدراج يتم حصراً عبر الـ trigger أعلاه)
-- ----------------------------------------------------------------------------
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles
  for select
  to authenticated
  using ((select auth.uid()) = id);

drop policy if exists "profiles_select_admin" on public.profiles;
create policy "profiles_select_admin"
  on public.profiles
  for select
  to authenticated
  using (public.is_admin());

-- تعديل الصف الذاتي: with check يفرض بقاء role كما هو (مقارنة بالقيمة الحالية
-- عبر الدالة الآمنة) — أي محاولة رفع صلاحيات ذاتية تُرفض
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles
  for update
  to authenticated
  using ((select auth.uid()) = id)
  with check (
    (select auth.uid()) = id
    and role = public.current_user_role()
  );

drop policy if exists "profiles_update_admin" on public.profiles;
create policy "profiles_update_admin"
  on public.profiles
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
