-- ============================================================
-- 0006 — توحيد أسماء مفاتيح جدولي الكاش مع طبقة التطبيق
--
-- سبب الوجود: هجرة 0005 أنشأت العمودين باسمي (query_norm / key)
-- بينما تكتب طبقة lib/geo باسمي (query_key / route_key)، فكانت كتابة
-- الكاش تفشل بصمت (بالتصميم: فشل الكاش لا يوقف التسعير) فتُستدعى
-- خدمات الخرائط الخارجية في كل طلب بلا داعٍ.
--
-- الملف آمن للتكرار وللقواعد الجديدة معاً: كل إعادة تسمية مشروطة
-- بوجود العمود القديم فعلاً، فلا يفشل إن كان الاسم صحيحاً أصلاً.
-- ============================================================

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'geocode_cache' and column_name = 'query_norm'
  ) then
    alter table public.geocode_cache rename column query_norm to query_key;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'distance_cache' and column_name = 'key'
  ) then
    alter table public.distance_cache rename column key to route_key;
  end if;
end $$;
