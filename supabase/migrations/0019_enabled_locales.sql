-- ============================================================
-- 0019 — دالة عامة تُرجع اللغات المفعّلة (ومعها عدد النصوص المنشورة)
--
-- سبب الوجود: طبقة التوجيه كانت تقرأ جدول `locales` مباشرة بمفتاح anon، و0018
-- تمنع anon من الجدول منعاً باتاً (بل وتفشل الهجرة إن وجدت له صلاحية). فالقراءة
-- كانت تفشل دائماً وتسقط على قائمة ثابتة في الكود ⇒ مفتاح «تفعيل/تعطيل اللغة»
-- في اللوحة بلا أثر، والأسوأ: الإنجليزية **المعطَّلة والفارغة** تُعلَن في
-- hreflang وفي خريطة الموقع، فيرى جوجل نسخة إنجليزية كاملة محتواها عربي.
--
-- `published_count` يسمح للتوجيه بإخفاء لغة لم يُنشر فيها شيء بعد: تُفعَّل من
-- اللوحة وتُترجَم وتُراجَع، ولا تظهر للعالم إلا حين يصير فيها محتوى فعلي.
-- ============================================================

create or replace function public.enabled_locales()
returns table (
  code            text,
  name            text,
  native_name     text,
  dir             text,
  is_default      boolean,
  sort            integer,
  published_count integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    l.code,
    l.name,
    l.native_name,
    l.dir,
    l.is_default,
    l.sort,
    (
      select count(*)::int
      from public.translations tr
      where tr.locale = l.code
        and tr.status = 'published'
        and btrim(coalesce(tr.value, '')) <> ''
    ) as published_count
  from public.locales l
  where l.enabled
  order by l.sort, l.code;
$$;

comment on function public.enabled_locales() is
  'اللغات المفعّلة للتوجيه وhreflang — ومعها عدد النصوص المنشورة فعلاً في كل لغة.';

revoke all on function public.enabled_locales() from public, anon, authenticated;
grant execute on function public.enabled_locales() to anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.enabled_locales() to service_role';
  end if;
end $$;

do $$
begin
  raise notice '✔ 0019_enabled_locales: قائمة اللغات المفعّلة متاحة للزائر بلا فتح الجدول';
end $$;
