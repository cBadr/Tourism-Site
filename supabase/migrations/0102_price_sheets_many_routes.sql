-- ============================================================================
-- 0102_price_sheets_many_routes.sql — قائمة أسعار واحدة تحمل مساراتٍ كثيرة
--
-- شكوى المالك (ملاحظتا البورتال ٣ و٥، 2026-08-17):
--   «قائمة الأسعار اليوم مسار واحد» — وهو على وشك إدخال ~١٠٠ مسار من كشوف متعهد
--   حقيقي، فتصير ~١٠٠ قائمة و~١٠٠ طلب اعتماد. وطلب إصلاح النموذج **قبل** الإدخال.
--   وأيضاً: فئاتٌ لا يغطّيها المتعهد تُعرض عليه للتسعير.
--
-- ⛔ ما لم يُفعل، وسببه:
--   لم يُلمس `price_lists` (سوى عمودٍ جديد nullable) ولا `price_list_items` ولا
--   `coverage_matches` ولا `quote_price` ولا `dispatch_pool`. المطابقة الجغرافية
--   وأرضية الهامش وسرّية التكلفة كلها **باقية بحرفها ولم يُعَد كتابتها**، فلا
--   طريق لانحرافٍ فيها من هذا الملف. وهذا وحده سبب اختيار هذا التصميم على نقل
--   هندسة المسار إلى جدولٍ جديد: نقلُها كان يفرض إعادة كتابة الدوال الثلاث التي
--   تقع فيها كل رياضيات المال.
--
-- 🔑 التسمية — تُقرأ قبل أي تعديل لاحق:
--   • `price_sheets`  = ما يسمّيه المالك «قائمة الأسعار»: الكشف الذي يضم مساراتٍ
--                       كثيرة ويُعتمد **مرّة واحدة**.
--   • `price_lists`   = **صفّ المسار الواحد** داخل الكشف. الاسم تاريخي (0010) ولم
--                       يُغيَّر لأن تغييره يمسّ دوال التسعير والإرسال والتدقيق.
--   • `price_sheets` **لا تحمل حالة**: الحالة تبقى في `price_lists.status` وحدها،
--     وهي نفس العمود الذي تقرؤه `coverage_matches`. مصدر حقيقة واحد ⇒ يستحيل أن
--     يقول الكشف «معتمد» بينما مسارٌ فيه لا يُسعِّر. و«اعتمادٌ واحدٌ للدفعة» يعني
--     **فعلاً إدارياً واحداً** يكتب في كل مسارات الكشف داخل معاملة واحدة.
--
-- ما يضيفه الملف:
--   (١) جدول `price_sheets` + عمود `price_lists.sheet_id` + حارسا ملكية وحذف
--   (٢) `price_sheet_classes()` — **التعريف الوحيد** لفئات المتعهد المغطّاة
--   (٣) `upsert_price_sheet()` — إنشاء/تسمية كشف
--   (٤) `import_price_sheet_rows()` — استيراد CSV مُحوَّلاً إلى jsonb، بتقرير
--       صفّاً صفّاً ووضعَي «فحص» و«تنفيذ». لا استيراد جزئي صامت.
--   (٥) `submit_price_sheet()` — إرسال كل مسودات الكشف للمراجعة بنداء واحد
--   (٦) `review_price_sheet()` — اعتماد/رفض الدفعة كلها، **للمشرف وحده**
--   (٧) `price_sheet_stats()` — عدّادات الكشف لكل شاشة تعرضه
--
-- يُنفَّذ بعد 0010 (الجداول والدوال والحُرّاس). آمن لإعادة التنفيذ بالكامل.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (١) الكشف + ربطه بالمسارات
-- ----------------------------------------------------------------------------
create table if not exists public.price_sheets (
  id               uuid primary key default gen_random_uuid(),
  subcontractor_id uuid not null references public.subcontractors(id) on delete cascade,
  title            text not null,
  note             text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table public.price_sheets drop constraint if exists price_sheets_title_chk;
alter table public.price_sheets
  add constraint price_sheets_title_chk
  check (length(btrim(title)) between 2 and 160) not valid;

alter table public.price_sheets drop constraint if exists price_sheets_note_chk;
alter table public.price_sheets
  add constraint price_sheets_note_chk
  check (note is null or length(note) <= 2000) not valid;

drop trigger if exists price_sheets_touch_updated_at on public.price_sheets;
create trigger price_sheets_touch_updated_at
  before update on public.price_sheets
  for each row execute function public.touch_updated_at();

-- اسم الكشف فريد داخل المتعهد الواحد — كشفان بنفس الاسم خطأ إدخال لا حالة صحيحة
create unique index if not exists price_sheets_sub_title_key
  on public.price_sheets (subcontractor_id, lower(btrim(title)));

create index if not exists price_sheets_sub_created_idx
  on public.price_sheets (subcontractor_id, created_at desc);

comment on table public.price_sheets is
  'كشف أسعار يضم مسارات كثيرة (صفوف price_lists) ويُعتمد مرة واحدة. لا يحمل حالة: الحالة في price_lists.status وحدها لأنها العمود الذي تقرؤه coverage_matches.';

-- العمود الرابط: nullable عمداً — المسارات المستقلة القديمة تبقى كما هي بلا مساس
alter table public.price_lists
  add column if not exists sheet_id uuid references public.price_sheets(id) on delete cascade;

create index if not exists price_lists_sheet_status_idx
  on public.price_lists (sheet_id, status);

comment on column public.price_lists.sheet_id is
  'الكشف الذي ينتمي إليه هذا المسار. NULL = مسار مستقل (النموذج القديم قبل 0102) ويبقى يعمل كما هو.';

-- (١-٢) حارس الملكية: مسارٌ لا ينتمي إلا لكشفٍ لصاحبه نفسه.
-- مفتاح أجنبي واحد لا يعبّر عن هذا الشرط، وتركه للتطبيق يعني أن أي مسار كتابة
-- جديد قد يخترقه. القاعدة في الجدول (اتفاقية 0010 القسم ٣).
create or replace function public.price_lists_guard_sheet()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
begin
  if new.sheet_id is null then
    return new;
  end if;

  select ps.subcontractor_id into v_owner
  from public.price_sheets ps
  where ps.id = new.sheet_id;

  if not found then
    raise exception 'كشف الأسعار غير موجود' using hint = 'not-found';
  end if;

  if v_owner is distinct from new.subcontractor_id then
    raise exception 'لا يجوز ضمّ مسار إلى كشف أسعار متعهدٍ آخر' using hint = 'forbidden';
  end if;

  return new;
end;
$$;

drop trigger if exists price_lists_guard_sheet on public.price_lists;
create trigger price_lists_guard_sheet
  before insert or update of sheet_id, subcontractor_id on public.price_lists
  for each row execute function public.price_lists_guard_sheet();

-- (١-٣) حارس الحذف: `on delete cascade` من الكشف إلى مساراته سلاحٌ ذو حدّين —
-- حذفُ كشفٍ فيه مسارٌ **معتمد** يسحب تغطيةً حيّة من تحت عروض سعرٍ قائمة بصمت.
-- الحذف يُمنع على الجميع (المشرف أيضاً) حتى يُسحب الاعتماد صراحةً.
--
-- ⚠ الاستثناء الواحد ولماذا: حذفُ **المتعهد نفسه** كان يتتالى قبل 0102 على قوائمه
--    بلا مانع، ولا يجوز أن يمنعه حارسٌ جديد. و`on delete cascade` في Postgres
--    مُشغّلُ AFTER على الجدول المرجَعي، فحين يصلنا التتالي يكون صفّ المتعهد قد
--    زال — وغيابُه هو تمييزنا الموثوق بين «حذف كشف» و«حذف المتعهد كله».
create or replace function public.price_sheets_guard_delete()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_live integer;
begin
  if not exists (select 1 from public.subcontractors s where s.id = old.subcontractor_id) then
    return old;   -- تتالٍ من حذف المتعهد نفسه — لا شيء «حيّ» يُحمى بعد زواله
  end if;

  select count(*) into v_live
  from public.price_lists pl
  where pl.sheet_id = old.id
    and pl.status = 'approved';

  if v_live > 0 then
    raise exception 'الكشف يحوي % مساراً معتمداً يعمل الآن — اسحب اعتمادها أولاً', v_live
      using hint = 'invalid-status';
  end if;

  return old;
end;
$$;

drop trigger if exists price_sheets_guard_delete on public.price_sheets;
create trigger price_sheets_guard_delete
  before delete on public.price_sheets
  for each row execute function public.price_sheets_guard_delete();

-- ----------------------------------------------------------------------------
-- (١-٤) الصلاحيات والسياسات — نفس انضباط 0010 حرفياً
-- Supabase تمنح anon كل شيء افتراضياً على أي جدول جديد، وTRUNCATE لا تخضع لـ RLS.
-- ----------------------------------------------------------------------------
alter table public.price_sheets enable row level security;

revoke all on public.price_sheets from anon, authenticated;
grant select, insert, update, delete on public.price_sheets to authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant select, insert, update, delete on public.price_sheets to service_role';
  end if;
end;
$$;

drop policy if exists "price_sheets_select_own_or_admin" on public.price_sheets;
create policy "price_sheets_select_own_or_admin"
  on public.price_sheets
  for select
  to authenticated
  using (subcontractor_id = public.current_subcontractor_id() or public.is_admin());

drop policy if exists "price_sheets_insert_own_or_admin" on public.price_sheets;
create policy "price_sheets_insert_own_or_admin"
  on public.price_sheets
  for insert
  to authenticated
  with check (subcontractor_id = public.current_subcontractor_id() or public.is_admin());

drop policy if exists "price_sheets_update_own_or_admin" on public.price_sheets;
create policy "price_sheets_update_own_or_admin"
  on public.price_sheets
  for update
  to authenticated
  using (subcontractor_id = public.current_subcontractor_id() or public.is_admin())
  with check (subcontractor_id = public.current_subcontractor_id() or public.is_admin());

drop policy if exists "price_sheets_delete_own_or_admin" on public.price_sheets;
create policy "price_sheets_delete_own_or_admin"
  on public.price_sheets
  for delete
  to authenticated
  using (subcontractor_id = public.current_subcontractor_id() or public.is_admin());

-- ----------------------------------------------------------------------------
-- (٢) فئات المتعهد المغطّاة — **التعريف الوحيد** في المشروع
--
-- ملاحظة المالك ٥: «فئات لا يغطّيها المتعهد تظهر له للتسعير». والمصدر الذي يستعمله
-- بقية البورتال أصلاً (`ownedClassSlugs` في app/portal/prices/actions.ts) هو:
--   vehicle_classes.active  ∩  subcontractor_vehicles.active
-- فنُثبِّته هنا دالةً واحدة تستدعيها الشاشات والاستيراد معاً — لا تعريف ثانٍ.
--
-- p_price_list_id: فئةٌ **مُسعَّرة سلفاً** في مسارٍ قائم تُعاد ولو لم يعد المتعهد
-- يملك فيها مركبة (`covered = false`). بدون ذلك يُخفي المحرِّر سعراً موجوداً
-- فيحذفه أول حفظ بصمت — وهو فقدُ بيانات لا تصفية عرض.
-- ----------------------------------------------------------------------------
create or replace function public.price_sheet_classes(
  p_subcontractor_id uuid default null,
  p_price_list_id    uuid default null
)
returns table (
  slug     text,
  title    text,
  capacity integer,
  sort     integer,
  covered  boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_sub uuid;
begin
  if p_subcontractor_id is not null then
    if not public.is_admin()
       and p_subcontractor_id is distinct from public.current_subcontractor_id() then
      raise exception 'قراءة فئات متعهد آخر متاحة للمشرف وحده' using hint = 'forbidden';
    end if;
    v_sub := p_subcontractor_id;
  else
    v_sub := public.current_subcontractor_id();
  end if;

  if v_sub is null then
    raise exception 'لا يوجد حساب متعهد مرتبط بهذه الجلسة' using hint = 'forbidden';
  end if;

  return query
  with owned as (
    select distinct v.class_slug
    from public.subcontractor_vehicles v
    where v.subcontractor_id = v_sub
      and v.active
  ),
  already as (
    select distinct pli.class_slug
    from public.price_list_items pli
    join public.price_lists pl on pl.id = pli.price_list_id
    where p_price_list_id is not null
      and pli.price_list_id = p_price_list_id
      and pl.subcontractor_id = v_sub
  )
  select
    vc.slug,
    vc.title,
    vc.capacity,
    vc.sort,
    exists (select 1 from owned o where o.class_slug = vc.slug) as covered
  from public.vehicle_classes vc
  where vc.active
    and (exists (select 1 from owned o where o.class_slug = vc.slug)
         or exists (select 1 from already a where a.class_slug = vc.slug))
  order by vc.sort asc, vc.capacity asc, vc.slug asc;
end;
$$;

comment on function public.price_sheet_classes(uuid, uuid) is
  'فئات السيارات التي يغطّيها المتعهد فعلاً = vehicle_classes.active ∩ subcontractor_vehicles.active. التعريف الوحيد — لا تكتب تصفيةً ثانية في أي شاشة.';

-- ----------------------------------------------------------------------------
-- (٣) إنشاء/تسمية كشف
-- ----------------------------------------------------------------------------
create or replace function public.upsert_price_sheet(
  p_id               uuid,
  p_title            text,
  p_note             text default null,
  p_subcontractor_id uuid default null
)
returns table (
  id    uuid,
  title text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_sub   uuid;
  v_id    uuid;
  v_title text;
  v_note  text;
begin
  if p_subcontractor_id is not null then
    if not public.is_admin() then
      raise exception 'التحرير نيابة عن متعهد آخر متاح للمشرف وحده' using hint = 'forbidden';
    end if;
    v_sub := p_subcontractor_id;
  else
    v_sub := public.current_subcontractor_id();
  end if;

  if v_sub is null then
    raise exception 'لا يوجد حساب متعهد مرتبط بهذه الجلسة' using hint = 'forbidden';
  end if;

  v_title := nullif(btrim(coalesce(p_title, '')), '');
  if v_title is null or length(v_title) < 2 or length(v_title) > 160 then
    raise exception 'اسم الكشف يجب أن يكون بين حرفين و١٦٠ حرفاً' using hint = 'invalid-input';
  end if;

  v_note := nullif(btrim(coalesce(p_note, '')), '');
  if v_note is not null and length(v_note) > 2000 then
    v_note := left(v_note, 2000);
  end if;

  if p_id is null then
    insert into public.price_sheets as ps (subcontractor_id, title, note)
    values (v_sub, v_title, v_note)
    returning ps.id into v_id;
  else
    update public.price_sheets ps
       set title = v_title,
           note  = v_note
     where ps.id = p_id
       and ps.subcontractor_id = v_sub
    returning ps.id into v_id;

    if v_id is null then
      raise exception 'كشف الأسعار غير موجود أو ليس لهذا المتعهد' using hint = 'not-found';
    end if;
  end if;

  id    := v_id;
  title := v_title;
  return next;
end;
$$;

-- ----------------------------------------------------------------------------
-- (٤) الاستيراد الجماعي — تقريرٌ صفّاً صفّاً، ولا استيراد جزئي صامت
--
-- p_rows: مصفوفة كائنات، كل كائن مسار:
--   { "title":"القاهرة ← الإسكندرية",
--     "originLabel":"القاهرة", "originLat":30.04, "originLng":31.24, "originRadiusKm":25,
--     "destLabel":"الإسكندرية", "destLat":31.20, "destLng":29.92, "destRadiusKm":25,
--     "bidirectional":true,
--     "prices": { "suv":1500, "minibus":2200 } }
--
-- p_commit = false ⇒ **فحصٌ بلا كتابة**، ونتيجته مطابقة تماماً لنتيجة التنفيذ
--            (بما في ذلك حلّ الإحداثيات من نقاطٍ عرّفها صفٌّ أسبق في نفس الملف).
-- p_commit = true  ⇒ يكتب المقبول ويترك المرفوض، ويعيد التقرير نفسه.
--
-- 🔴 لماذا لا يُرمى استثناء عند صفٍّ فاسد: كل نداء PostgREST معاملةٌ واحدة (D-48)،
--    فرميُ الخطأ يمحو المئة صفّ الصحيحة معه. ولذلك كل كتابة صفٍّ داخل كتلة
--    `exception` خاصة بها (معاملةٌ فرعية) — فشلُ صفٍّ يُسجَّل ولا يجرف الدفعة.
--
-- 🔴 والاستيراد **لا يلمس مساراً معتمداً ولا مساراً قيد المراجعة**: تعديلهما من
--    ملفٍّ يُرفع بالجملة يسحب تغطيةً حيّة أو يبدّل ما على مكتب المشرف بلا أن يرى
--    أحدٌ ذلك. يُكتب في الجديد وفي المسودة والمرفوضة فقط، والباقي يُرفض برسالة.
-- ----------------------------------------------------------------------------
create or replace function public.import_price_sheet_rows(
  p_sheet_id         uuid,
  p_rows             jsonb,
  p_commit           boolean default false,
  p_subcontractor_id uuid default null
)
returns table (
  row_no        integer,
  accepted      boolean,
  action        text,
  route_title   text,
  classes_saved integer,
  reason        text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_sub      uuid;
  v_sheet    record;
  v_points   jsonb := '{}'::jsonb;   -- خريطة اسم النقطة ← {lat,lng,radius}
  v_covered  text[];
  v_seen     text[] := '{}';         -- عناوين رأيناها في هذه الدفعة (كشف التكرار)
  el         jsonb;
  v_i        integer := 0;
  v_reasons  text[];
  v_title    text;
  v_olabel   text;
  v_dlabel   text;
  v_olat     numeric;
  v_olng     numeric;
  v_dlat     numeric;
  v_dlng     numeric;
  v_orad     numeric;
  v_drad     numeric;
  v_bidi     boolean;
  v_prices   jsonb;
  v_items    jsonb;
  v_bad      text;
  v_ex_id    uuid;
  v_ex_st    text;
  v_ex_sh    uuid;
  v_id       uuid;
  v_action   text;
  v_saved    integer;
  v_hint     jsonb;
  v_key      text;
begin
  -- (أ) الهوية والكشف
  if p_subcontractor_id is not null then
    if not public.is_admin() then
      raise exception 'الاستيراد نيابة عن متعهد آخر متاح للمشرف وحده' using hint = 'forbidden';
    end if;
    v_sub := p_subcontractor_id;
  else
    v_sub := public.current_subcontractor_id();
  end if;

  if v_sub is null then
    raise exception 'لا يوجد حساب متعهد مرتبط بهذه الجلسة' using hint = 'forbidden';
  end if;

  select ps.* into v_sheet
  from public.price_sheets ps
  where ps.id = p_sheet_id
    and ps.subcontractor_id = v_sub;

  if not found then
    raise exception 'كشف الأسعار غير موجود أو ليس لهذا المتعهد' using hint = 'not-found';
  end if;

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'الملف لم يُقرأ كصفوف — تأكد أنه CSV بالترويسة المعطاة'
      using hint = 'invalid-input';
  end if;

  if jsonb_array_length(p_rows) = 0 then
    raise exception 'الملف بلا صفوف بيانات' using hint = 'invalid-input';
  end if;

  if jsonb_array_length(p_rows) > 500 then
    raise exception 'الحد الأقصى ٥٠٠ مسار في الملف الواحد (وصل %)',
      jsonb_array_length(p_rows) using hint = 'invalid-input';
  end if;

  -- (ب) الفئات المغطّاة — من التعريف الوحيد لا من تصفية ثانية
  select array_agg(c.slug) into v_covered
  from public.price_sheet_classes(v_sub, null) c
  where c.covered;
  v_covered := coalesce(v_covered, '{}'::text[]);

  -- (ج) نقاطٌ عرّفها المتعهد سلفاً — تسمح للملف بأن يكتب اسم المكان بلا إحداثيات
  -- بعد أن يكتبها مرّة. **مقيَّدة بمساراته هو** فلا تُسرَّب نقطة منافس (D-19).
  select coalesce(jsonb_object_agg(x.k, x.v), '{}'::jsonb)
    into v_points
  from (
    select lower(btrim(pl.origin_label)) as k,
           jsonb_build_object('lat', pl.origin_lat, 'lng', pl.origin_lng,
                              'radius', pl.origin_radius_km) as v,
           row_number() over (partition by lower(btrim(pl.origin_label))
                              order by pl.updated_at desc) as rn
    from public.price_lists pl
    where pl.subcontractor_id = v_sub and btrim(coalesce(pl.origin_label, '')) <> ''
    union all
    select lower(btrim(pl.dest_label)),
           jsonb_build_object('lat', pl.dest_lat, 'lng', pl.dest_lng,
                              'radius', pl.dest_radius_km),
           row_number() over (partition by lower(btrim(pl.dest_label))
                              order by pl.updated_at desc)
    from public.price_lists pl
    where pl.subcontractor_id = v_sub and btrim(coalesce(pl.dest_label, '')) <> ''
  ) x
  where x.rn = 1;

  -- (د) صفّاً صفّاً
  for el in select value from jsonb_array_elements(p_rows) loop
    v_i       := v_i + 1;
    v_reasons := '{}'::text[];
    v_saved   := 0;
    v_id      := null;
    v_ex_id   := null;
    v_ex_st   := null;
    v_ex_sh   := null;

    v_title  := nullif(btrim(coalesce(el ->> 'title', '')), '');
    v_olabel := nullif(btrim(coalesce(el ->> 'originLabel', el ->> 'origin_label', '')), '');
    v_dlabel := nullif(btrim(coalesce(el ->> 'destLabel',   el ->> 'dest_label',   '')), '');

    v_olat := public.numeric_or_null(coalesce(el ->> 'originLat', el ->> 'origin_lat'));
    v_olng := public.numeric_or_null(coalesce(el ->> 'originLng', el ->> 'origin_lng'));
    v_dlat := public.numeric_or_null(coalesce(el ->> 'destLat',   el ->> 'dest_lat'));
    v_dlng := public.numeric_or_null(coalesce(el ->> 'destLng',   el ->> 'dest_lng'));
    v_orad := public.numeric_or_null(coalesce(el ->> 'originRadiusKm', el ->> 'origin_radius_km'));
    v_drad := public.numeric_or_null(coalesce(el ->> 'destRadiusKm',   el ->> 'dest_radius_km'));

    -- (د-١) العنوان: الفارغ يُشتق من الطرفين حتى لا يُرفض صفٌّ صحيح لسببٍ شكلي
    if v_title is null and v_olabel is not null and v_dlabel is not null then
      v_title := left(v_olabel || ' ← ' || v_dlabel, 160);
    end if;
    if v_title is null then
      v_reasons := v_reasons || 'العنوان مفقود ولا يمكن اشتقاقه (الطرفان ناقصان)'::text;
    elsif length(v_title) < 2 or length(v_title) > 160 then
      v_reasons := v_reasons || 'العنوان يجب أن يكون بين حرفين و١٦٠ حرفاً'::text;
    end if;

    -- (د-٢) الطرفان + حلّ الإحداثيات من نقطةٍ معرّفة سابقاً بالاسم نفسه
    if v_olabel is null then
      v_reasons := v_reasons || 'اسم نقطة البداية مفقود'::text;
    elsif v_olat is null or v_olng is null then
      v_hint := v_points -> lower(v_olabel);
      if v_hint is not null then
        v_olat := public.numeric_or_null(v_hint ->> 'lat');
        v_olng := public.numeric_or_null(v_hint ->> 'lng');
        v_orad := coalesce(v_orad, public.numeric_or_null(v_hint ->> 'radius'));
      else
        v_reasons := v_reasons
          || ('لا إحداثيات لنقطة البداية «' || v_olabel
              || '» ولم تُعرَّف من قبل — اكتب originLat/originLng مرة واحدة');
      end if;
    end if;

    if v_dlabel is null then
      v_reasons := v_reasons || 'اسم نقطة النهاية مفقود'::text;
    elsif v_dlat is null or v_dlng is null then
      v_hint := v_points -> lower(v_dlabel);
      if v_hint is not null then
        v_dlat := public.numeric_or_null(v_hint ->> 'lat');
        v_dlng := public.numeric_or_null(v_hint ->> 'lng');
        v_drad := coalesce(v_drad, public.numeric_or_null(v_hint ->> 'radius'));
      else
        v_reasons := v_reasons
          || ('لا إحداثيات لنقطة النهاية «' || v_dlabel
              || '» ولم تُعرَّف من قبل — اكتب destLat/destLng مرة واحدة');
      end if;
    end if;

    -- 🔴 مصر وحدها — مرآة `SERVICE_BOUNDS` في lib/place-search-types.ts
    -- (عرض ٢٠..٣٤، طول ٢٣..٣٨) كما في 0084 و0098. والفائدة الحقيقية هنا: قلبُ
    -- lat/lng في ملفٍ فيه مئة صفّ خطأٌ صامت يضع المسار في الصحراء الليبية.
    if v_olat is not null and v_olng is not null
       and not (v_olat between 20 and 34 and v_olng between 23 and 38) then
      v_reasons := v_reasons || 'إحداثيات البداية خارج مصر — تحقّق من ترتيب lat/lng'::text;
    end if;
    if v_dlat is not null and v_dlng is not null
       and not (v_dlat between 20 and 34 and v_dlng between 23 and 38) then
      v_reasons := v_reasons || 'إحداثيات النهاية خارج مصر — تحقّق من ترتيب lat/lng'::text;
    end if;

    -- (د-٣) النطاقات
    v_orad := coalesce(v_orad, 25);
    v_drad := coalesce(v_drad, 25);
    if v_orad < 1 or v_orad > 500 then
      v_reasons := v_reasons || 'نطاق البداية يجب أن يكون بين ١ و٥٠٠ كم'::text;
    end if;
    if v_drad < 1 or v_drad > 500 then
      v_reasons := v_reasons || 'نطاق النهاية يجب أن يكون بين ١ و٥٠٠ كم'::text;
    end if;

    v_bidi := lower(btrim(coalesce(el ->> 'bidirectional', 'true')))
                in ('true', 't', '1', 'نعم', 'yes', 'y');

    -- (د-٤) الأسعار — الفئات المغطّاة وحدها (ملاحظة المالك ٥)
    v_prices := el -> 'prices';
    v_items  := '[]'::jsonb;
    if v_prices is null or jsonb_typeof(v_prices) <> 'object' then
      v_reasons := v_reasons || 'لا أعمدة أسعار في هذا الصف'::text;
    else
      select string_agg(distinct k, '، ') into v_bad
      from jsonb_object_keys(v_prices) k
      where nullif(btrim(coalesce(v_prices ->> k, '')), '') is not null
        and not (lower(btrim(k)) = any (v_covered));
      if v_bad is not null then
        v_reasons := v_reasons
          || ('فئات لا يغطّيها أسطولك أو غير معروفة: ' || v_bad
              || ' — سجّل مركبة من الفئة أو احذف عمودها');
      end if;

      select string_agg(distinct k, '، ') into v_bad
      from jsonb_object_keys(v_prices) k
      where nullif(btrim(coalesce(v_prices ->> k, '')), '') is not null
        and (public.numeric_or_null(v_prices ->> k) is null
             or public.numeric_or_null(v_prices ->> k) <= 0
             or public.numeric_or_null(v_prices ->> k) > 10000000);
      if v_bad is not null then
        v_reasons := v_reasons || ('تكلفة غير صالحة في: ' || v_bad || ' (رقم أكبر من صفر)');
      end if;

      select coalesce(
               jsonb_agg(jsonb_build_object('classSlug', lower(btrim(k)),
                                            'cost', public.numeric_or_null(v_prices ->> k))),
               '[]'::jsonb)
        into v_items
      from jsonb_object_keys(v_prices) k
      where lower(btrim(k)) = any (v_covered)
        and public.numeric_or_null(v_prices ->> k) is not null
        and public.numeric_or_null(v_prices ->> k) > 0
        and public.numeric_or_null(v_prices ->> k) <= 10000000;

      if jsonb_array_length(v_items) = 0 and array_length(v_reasons, 1) is null then
        v_reasons := v_reasons || 'لم تُسعَّر أي فئة في هذا الصف'::text;
      end if;
    end if;

    -- (د-٥) التكرار داخل نفس الملف
    if v_title is not null then
      v_key := lower(btrim(v_title));
      if v_key = any (v_seen) then
        v_reasons := v_reasons || 'عنوان مكرّر داخل نفس الملف'::text;
      else
        v_seen := v_seen || v_key;
      end if;
    end if;

    -- (د-٦) تصادم العنوان مع مسارٍ قائم — الفهرس الفريد على (المتعهد، العنوان)
    if v_title is not null then
      select pl.id, pl.status, pl.sheet_id into v_ex_id, v_ex_st, v_ex_sh
      from public.price_lists pl
      where pl.subcontractor_id = v_sub
        and lower(btrim(pl.title)) = lower(btrim(v_title))
      limit 1;

      if v_ex_id is not null then
        if v_ex_sh is distinct from p_sheet_id then
          v_reasons := v_reasons || 'العنوان مستعمل في كشفٍ آخر أو في مسار مستقل'::text;
        elsif v_ex_st = 'approved' then
          v_reasons := v_reasons
            || 'المسار معتمد ويعمل الآن — الاستيراد لا يعدّله؛ عدّله من صفحته'::text;
        elsif v_ex_st = 'pending' then
          v_reasons := v_reasons
            || 'المسار على مكتب المشرف الآن — الاستيراد لا يعدّله'::text;
        end if;
      end if;
    end if;

    -- (هـ) النتيجة
    if array_length(v_reasons, 1) is not null then
      row_no        := v_i;
      accepted      := false;
      action        := 'rejected';
      route_title   := v_title;
      classes_saved := 0;
      reason        := array_to_string(v_reasons, ' · ');
      return next;
      continue;
    end if;

    -- نقاط هذا الصف تصير معرّفةً للصفوف التالية — في الفحص والتنفيذ سواءً بسواء
    v_points := v_points
      || jsonb_build_object(lower(v_olabel),
                            jsonb_build_object('lat', v_olat, 'lng', v_olng, 'radius', v_orad))
      || jsonb_build_object(lower(v_dlabel),
                            jsonb_build_object('lat', v_dlat, 'lng', v_dlng, 'radius', v_drad));

    v_action := case when v_ex_id is null then 'created' else 'updated' end;
    v_saved  := jsonb_array_length(v_items);

    if not p_commit then
      row_no        := v_i;
      accepted      := true;
      action        := v_action || '-preview';
      route_title   := v_title;
      classes_saved := v_saved;
      reason        := null;
      return next;
      continue;
    end if;

    -- (و) الكتابة — كتلة استثناء لكل صفّ (معاملة فرعية): فشلُ صفٍّ لا يجرف الدفعة
    begin
      if v_ex_id is null then
        insert into public.price_lists (
          subcontractor_id, sheet_id, title,
          origin_label, origin_lat, origin_lng, origin_radius_km,
          dest_label, dest_lat, dest_lng, dest_radius_km,
          bidirectional, status
        ) values (
          v_sub, p_sheet_id, v_title,
          v_olabel, v_olat, v_olng, v_orad,
          v_dlabel, v_dlat, v_dlng, v_drad,
          v_bidi, 'draft'
        )
        returning id into v_id;
      else
        v_id := v_ex_id;
        update public.price_lists pl
           set title            = v_title,
               origin_label     = v_olabel,
               origin_lat       = v_olat,
               origin_lng       = v_olng,
               origin_radius_km = v_orad,
               dest_label       = v_dlabel,
               dest_lat         = v_dlat,
               dest_lng         = v_dlng,
               dest_radius_km   = v_drad,
               bidirectional    = v_bidi,
               status           = 'draft',
               review_note      = null,
               reviewed_at      = null
         where pl.id = v_id;
      end if;

      delete from public.price_list_items pli where pli.price_list_id = v_id;

      insert into public.price_list_items (price_list_id, class_slug, cost)
      select v_id, x.class_slug, x.cost
      from jsonb_array_elements(v_items) it
      cross join lateral (
        select it ->> 'classSlug' as class_slug,
               public.numeric_or_null(it ->> 'cost') as cost
      ) x
      on conflict (price_list_id, class_slug) do update set cost = excluded.cost;

      row_no        := v_i;
      accepted      := true;
      action        := v_action;
      route_title   := v_title;
      classes_saved := v_saved;
      reason        := null;
      return next;
    exception
      when others then
        row_no        := v_i;
        accepted      := false;
        action        := 'rejected';
        route_title   := v_title;
        classes_saved := 0;
        reason        := 'تعذّرت الكتابة: ' || sqlerrm;
        return next;
    end;
  end loop;

  return;
end;
$$;

comment on function public.import_price_sheet_rows(uuid, jsonb, boolean, uuid) is
  'استيراد مسارات كشف بالجملة مع تقرير صفّاً صفّاً. p_commit=false فحصٌ بلا كتابة بنفس النتيجة. لا يعدّل مساراً معتمداً ولا قيد المراجعة.';

-- ----------------------------------------------------------------------------
-- (٥) إرسال الكشف كله للمراجعة — طلب اعتمادٍ واحد لا واحدٌ لكل مسار
-- ----------------------------------------------------------------------------
create or replace function public.submit_price_sheet(p_id uuid)
returns table (
  submitted     integer,
  kept_approved integer,
  skipped_empty integer
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_sub    uuid;
  v_sheet  record;
  v_sub_n  integer := 0;
  v_appr   integer := 0;
  v_empty  integer := 0;
begin
  v_sub := public.current_subcontractor_id();

  select ps.* into v_sheet
  from public.price_sheets ps
  where ps.id = p_id
    and (ps.subcontractor_id = v_sub or public.is_admin())
  for update;

  if not found then
    raise exception 'كشف الأسعار غير موجود أو ليس لهذا المتعهد' using hint = 'not-found';
  end if;

  select count(*) into v_appr
  from public.price_lists pl
  where pl.sheet_id = p_id and pl.status = 'approved';

  -- مسارٌ بلا سعرٍ واحد لا معنى لمراجعته — يبقى مسودة ويُعدّ في التقرير
  select count(*) into v_empty
  from public.price_lists pl
  where pl.sheet_id = p_id
    and pl.status in ('draft', 'rejected')
    and not exists (select 1 from public.price_list_items pli
                     where pli.price_list_id = pl.id);

  with moved as (
    update public.price_lists pl
       set status = 'pending', review_note = null, reviewed_at = null
     where pl.sheet_id = p_id
       and pl.status in ('draft', 'rejected')
       and exists (select 1 from public.price_list_items pli
                    where pli.price_list_id = pl.id)
    returning 1 as one
  )
  select count(*) into v_sub_n from moved;

  if v_sub_n = 0 then
    raise exception 'لا مسار جاهز للإرسال في هذا الكشف (% بلا أسعار · % معتمد سلفاً)',
      v_empty, v_appr using hint = 'invalid-input';
  end if;

  submitted     := v_sub_n;
  kept_approved := v_appr;
  skipped_empty := v_empty;
  return next;
end;
$$;

-- ----------------------------------------------------------------------------
-- (٦) مراجعة الكشف كله — **للمشرف وحده**، وقرارٌ واحد لكل مسارات الدفعة
--
-- 🔴 الحارسان: هذه الدالة ترفض غير المشرف صراحةً، **وفوقها** يبقى المُشغّل
--    `price_lists_guard_review` (0010) الذي يمنع المتعهد من كتابة `approved`
--    على مساره بأي طريق. طبقتان لا واحدة.
-- ----------------------------------------------------------------------------
create or replace function public.review_price_sheet(
  p_id      uuid,
  p_approve boolean,
  p_note    text default null
)
returns table (
  affected   integer,
  new_status text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_note text;
  v_new  text;
  v_n    integer;
begin
  if not public.is_admin() then
    raise exception 'مراجعة كشوف الأسعار متاحة للمشرف وحده' using hint = 'forbidden';
  end if;

  if not exists (select 1 from public.price_sheets ps where ps.id = p_id) then
    raise exception 'كشف الأسعار غير موجود' using hint = 'not-found';
  end if;

  v_note := nullif(btrim(coalesce(p_note, '')), '');
  v_new  := case when coalesce(p_approve, false) then 'approved' else 'rejected' end;

  if v_new = 'rejected' and v_note is null then
    raise exception 'سبب الرفض مطلوب' using hint = 'invalid-input';
  end if;

  with reviewed as (
    update public.price_lists pl
       set status      = v_new,
           review_note = v_note,
           reviewed_at = now()
     where pl.sheet_id = p_id
       and pl.status = 'pending'
    returning 1 as one
  )
  select count(*) into v_n from reviewed;

  if v_n = 0 then
    raise exception 'لا مسار بانتظار المراجعة في هذا الكشف' using hint = 'invalid-status';
  end if;

  affected   := v_n;
  new_status := v_new;
  return next;
end;
$$;

-- ----------------------------------------------------------------------------
-- (٧) عدّادات الكشف — مصدر واحد لكل شاشة تعرضه (البورتال واللوحة)
-- المشرف بلا p_subcontractor_id يرى الكل؛ المتعهد يرى كشوفه هو مهما مرّر.
-- ----------------------------------------------------------------------------
create or replace function public.price_sheet_stats(
  p_subcontractor_id uuid default null
)
returns table (
  id               uuid,
  subcontractor_id uuid,
  company_name     text,
  title            text,
  note             text,
  routes           integer,
  draft_count      integer,
  pending_count    integer,
  approved_count   integer,
  rejected_count   integer,
  created_at       timestamptz,
  updated_at       timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_admin  boolean := public.is_admin();
  v_sub    uuid    := public.current_subcontractor_id();
  v_filter uuid;
begin
  if v_admin then
    v_filter := p_subcontractor_id;   -- null = كل المتعهدين
  else
    if v_sub is null then
      raise exception 'لا يوجد حساب متعهد مرتبط بهذه الجلسة' using hint = 'forbidden';
    end if;
    v_filter := v_sub;                -- 🔒 المتعهد لا يرى غير كشوفه مهما مرّر
  end if;

  return query
  select
    ps.id,
    ps.subcontractor_id,
    s.company_name,
    ps.title,
    ps.note,
    count(pl.id)::integer,
    count(pl.id) filter (where pl.status = 'draft')::integer,
    count(pl.id) filter (where pl.status = 'pending')::integer,
    count(pl.id) filter (where pl.status = 'approved')::integer,
    count(pl.id) filter (where pl.status = 'rejected')::integer,
    ps.created_at,
    ps.updated_at
  from public.price_sheets ps
  join public.subcontractors s on s.id = ps.subcontractor_id
  left join public.price_lists pl on pl.sheet_id = ps.id
  where v_filter is null or ps.subcontractor_id = v_filter
  group by ps.id, ps.subcontractor_id, s.company_name, ps.title, ps.note,
           ps.created_at, ps.updated_at
  order by ps.created_at desc;
end;
$$;

-- ----------------------------------------------------------------------------
-- (٨) الصلاحيات على الدوال
--
-- ⚠ فخّ 0010 المكرَّر: الدالة الجديدة تولد ومعها EXECUTE ضمني لـ PUBLIC ومنحٌ
--   صريح لـ anon من إعدادات Supabase الافتراضية. السحب أولاً ثم المنح الصريح.
--   ولا شيء منها لـ anon: كلها تلمس تكلفة المتعهد، وهي سرٌّ تجاري (D-19).
-- ----------------------------------------------------------------------------
do $$
declare
  v_sig text;
begin
  foreach v_sig in array array[
    'public.price_sheet_classes(uuid, uuid)',
    'public.upsert_price_sheet(uuid, text, text, uuid)',
    'public.import_price_sheet_rows(uuid, jsonb, boolean, uuid)',
    'public.submit_price_sheet(uuid)',
    'public.review_price_sheet(uuid, boolean, text)',
    'public.price_sheet_stats(uuid)'
  ] loop
    execute format('revoke all on function %s from public', v_sig);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on function %s from anon', v_sig);
    end if;
    execute format('revoke all on function %s from authenticated', v_sig);
    execute format('grant execute on function %s to authenticated', v_sig);
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format('grant execute on function %s to service_role', v_sig);
    end if;
  end loop;
end;
$$;

-- الحُرّاس دوال مُشغِّلات: لا تُستدعى مباشرة من أحد
do $$
begin
  execute 'revoke all on function public.price_lists_guard_sheet() from public';
  execute 'revoke all on function public.price_sheets_guard_delete() from public';
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function public.price_lists_guard_sheet() from anon';
    execute 'revoke all on function public.price_sheets_guard_delete() from anon';
  end if;
  execute 'revoke all on function public.price_lists_guard_sheet() from authenticated';
  execute 'revoke all on function public.price_sheets_guard_delete() from authenticated';
end;
$$;

-- ----------------------------------------------------------------------------
-- (٩) فحصٌ ذاتي — الهجرة تُثبت أثرها بنفسها بدل أن تُصدَّق
-- ----------------------------------------------------------------------------
do $$
declare
  v_missing text;
begin
  select string_agg(x.sig, '، ') into v_missing
  from (values
    ('public.price_sheet_classes(uuid, uuid)'),
    ('public.upsert_price_sheet(uuid, text, text, uuid)'),
    ('public.import_price_sheet_rows(uuid, jsonb, boolean, uuid)'),
    ('public.submit_price_sheet(uuid)'),
    ('public.review_price_sheet(uuid, boolean, text)'),
    ('public.price_sheet_stats(uuid)')
  ) as x(sig)
  where to_regprocedure(x.sig) is null;

  if v_missing is not null then
    raise exception '0102: دوال لم تُنشأ: %', v_missing;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'price_lists' and column_name = 'sheet_id'
  ) then
    raise exception '0102: عمود price_lists.sheet_id لم يُضف';
  end if;

  if exists (
    select 1 from pg_policies p
    where p.schemaname = 'public' and p.tablename = 'price_sheets'
      and 'anon' = any (p.roles)
  ) then
    raise exception '0102: سياسة على price_sheets تستهدف anon';
  end if;

  if exists (select 1 from pg_roles where rolname = 'anon')
     and has_table_privilege('anon', 'public.price_sheets', 'select') then
    raise exception '0102: anon يملك select على price_sheets';
  end if;

  raise notice '0102 ✔ كشوف الأسعار: جدول + عمود ربط + ٦ دوال + ٤ سياسات، وصفر لـ anon';
end;
$$;
