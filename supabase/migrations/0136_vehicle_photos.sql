-- ============================================================================
-- 0136 — صورةُ المركبة، وتفصيلُ الأسطول لكل فئة
--
-- ملاحظةُ المالك بنصّها (2026-08-18):
--   «في الجزء الخاص بالأسطول: لا تظهر عدد السيارات المتاحة لدى المتعهد ولا
--    أنواعها ولا صورها في كل فئة.»
--
-- ── المقيس قبل الكتابة، لا المظنون ────────────────────────────────────────
--
--   • العددُ الإجماليّ **كان يُعرض** («الأسطول ٢ نشطة» في ملف المتعهد).
--     الناقصُ هو **التفصيل لكل فئة**، ومعه **الفئةُ التي لا مركبة فيها**.
--   • و`subcontractor_vehicles.photo_path` **عمودٌ قائمٌ منذ 0040 بلا رافعٍ
--     واحد** في المستودع كلّه — لا في البوابة ولا في اللوحة. فـ«الصور لا تظهر»
--     ليست عيبَ عرضٍ بل **غيابَ ما يُعرض** (القاعدة الذهبية ١٧: عمودٌ بلا رافع
--     ليس مبنيّاً). ولذلك تبدأ هذه الهجرة من **الرفع** لا من العرض.
--
-- ── 🔒 لماذا دلوٌ ثانٍ ولا يُعاد استعمال `driver-docs` ────────────────────
--
-- `driver_documents_due_for_purge` تمشي على **كلّ** مفتاحٍ في دلو `driver-docs`
-- وتعدّ **يتيماً** كلَّ ما لا يشير إليه صفُّ سائق، فتحذفه بعد يوم. فوضعُ صور
-- المركبات هناك يعني أن كنسَ السائقين **يحذفها كلها بعد أربعٍ وعشرين ساعة** —
-- صامتاً وبلا خطأ. فالدلوُ الثاني `vehicle-photos` عزلٌ بنيويّ لا ذوقُ تنظيم.
--
-- ── وما يُفوَّض إليه ولا يُستنسخ (القاعدة الذهبية ١٢) ─────────────────────
--
-- شكلُ المفتاح **هو هو**: `<owner_uuid>/<row_uuid>/<kind>-<hex>.<ext>`. فلا
-- تُكتب هنا صيغةٌ نمطيةٌ ثانية تنحرف عن أختها بعد ستة أشهر — بل تُنادى
-- `driver_doc_path_ok/_owner/_driver` القائمةُ من 0120، **ويُضاف فوقها تضييقان
-- يخصّان المركبة**: الصنفُ `photo` وحده (لا `license`)، ولا `pdf` (صورةُ مركبةٍ
-- بصيغة PDF مربّعٌ فارغٌ أبديّ في أي `<img>`).
--
-- ⚠ **والتبعيّة معلَنة**: من يضيّق `driver_doc_path_ok` غداً يضيّق هذه معه.
--   وهذا **مقصود**: النمطان يجب أن يبقيا واحداً، والانحرافُ هو الخطر لا التبعيّة.
--
-- ── 🔒 ولا صورةَ مركبةٍ تصل العميل (D-19) ────────────────────────────────
--
-- الاتفاقية المنشورة (‏0113 بند ١١) تُلزم الشريك بتقديم «ما تطلبه المنصة من
-- **صور المركبة**»، ولا تَعِد بعرضها على العميل. وما يراه العميل بعد الإسناد
-- منصوصٌ عليه: **بيانات** المركبة (الاسم واللون واللوحة والسنة) لا صورتها.
-- والفحصُ الذاتي أدناه يقرأ نوعَ إرجاع `get_booking_by_token` وجسمَ
-- `dispatch_trip_payload` **من الكتالوج الحيّ** (D-58) ويرفض أن يذكرا صورة.
--
-- ── ولا جدولَ جديد ⇒ ولا كتلةَ `revoke ... truncate` (القاعدة ١٦) ────────
--
-- هذه الهجرة **لا تُنشئ جدولاً واحداً**: العمود قائمٌ منذ 0040، والجدول
-- `subcontractor_vehicles` أخذ كتلة `revoke/grant` في هجرته. فالقاعدة ١٦ لا
-- محلّ لها هنا، **وقيلَ ذلك صراحةً** بدل أن يُقرأ غيابُها سهواً.
--
-- ── ومدّةُ حفظٍ لا وجود لها هنا — بقصدٍ معلَن ─────────────────────────────
--
-- 🔴 اتفاقية 0113 تَعِد بمهلة الخمس سنوات لصور **السائقين والرخص** وحدها، ولا
-- تَعِد بشيءٍ عن صورة المركبة. فلا تُكتب هنا دالةُ كنسٍ ولا عاملٌ مجدول —
-- **لأن دالةً بلا منادٍ ليست مبنيّة** (القاعدة ١٧)، ووعداً بلا منفِّذٍ كذبة.
-- وبديلُها **بنيويّ لا مجدول**: كلُّ رفعٍ يكنس مجلّد المركبة بنفسه فلا يبقى فيه
-- إلا الملفّ الحالي، والحذفُ اليدويّ وحذفُ المركبة يكنسانه كذلك
-- (`lib/vehicles/photos.ts` ← `sweepVehicleFolder`). فالمجلّد **يعود إلى ملفٍّ
-- واحد في كل دورة عمل**، ولا يحتاج جدولةً تُنسى.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (١) شكل المفتاح — تفويضٌ إلى 0120 مع تضييقَين يخصّان المركبة
-- ----------------------------------------------------------------------------

create or replace function public.vehicle_photo_path_ok(p_name text)
returns boolean
language sql
immutable
as $function$
  -- النمطُ الأساس من 0120: مقطعا uuid ثم «الصنف-hex.الامتداد» بلا مخطَّطٍ ولا
  -- صعودٍ في الشجرة ولا محرف تحكّم. ولا يُعاد كتابته هنا.
  select public.driver_doc_path_ok(p_name)
     -- تضييق (١): صنفُ المركبة `photo` وحده — لا `license` في هذا الدلو
     and split_part(coalesce(p_name, ''), '/', 3) like 'photo-%'
     -- تضييق (٢): لا PDF — صورةٌ بصيغة PDF مربّعٌ فارغٌ دائماً داخل `<img>`،
     -- وصورةُ المركبة تُعرض في شبكةٍ لا تُفتح في تبويب
     and coalesce(p_name, '') !~* '\.pdf$';
$function$;

comment on function public.vehicle_photo_path_ok(text) is
  '🔒 شكل مفتاح الكائن الوحيد المقبول في دلو vehicle-photos: معرّف المتعهد / معرّف المركبة / photo-<hex>.<jpg|jpeg|png|webp>. يفوّض النمط الأساس إلى driver_doc_path_ok (0120) فلا تنحرف صيغتان، ويضيف تضييقين: الصنف photo وحده، ولا PDF. immutable بقصد كي يصلح داخل CHECK.';

create or replace function public.vehicle_photo_path_owner(p_name text)
returns uuid
language sql
immutable
as $function$
  select case when public.vehicle_photo_path_ok(p_name)
              then public.driver_doc_path_owner(p_name)
         end;
$function$;

comment on function public.vehicle_photo_path_owner(text) is
  '🔒 المقطع الأول من المسار = المتعهد المالك. عليه تُبنى كل سياسة على دلو vehicle-photos. ويُرجع NULL لأي مسارٍ لا يطابق شكل المركبة — والمقارنة بـ NULL ليست true، فالمخالف مرفوض لا مقبول.';

create or replace function public.vehicle_photo_path_vehicle(p_name text)
returns uuid
language sql
immutable
as $function$
  select case when public.vehicle_photo_path_ok(p_name)
              then public.driver_doc_path_driver(p_name)
         end;
$function$;

comment on function public.vehicle_photo_path_vehicle(text) is
  'المقطع الثاني من المسار = المركبة. يُستعمل في ربط الملف بصفّه، ويُرجع NULL لكل مخالف.';

-- ----------------------------------------------------------------------------
-- (٢) القيد على العمود — الحزام الأول
-- ----------------------------------------------------------------------------

comment on column public.subcontractor_vehicles.photo_path is
  '🔒 مسار صورة المركبة في الدلو الخاص vehicle-photos — لا يخرج خاماً إلى متصفح، ولا يصل العميل بحال (D-19). يرفعه المتعهد من بوابته أو المشرف من اللوحة، ولا مدّة حفظٍ عليه في اتفاقية 0113 فلا كنس مجدول له.';

alter table public.subcontractor_vehicles
  drop constraint if exists subcontractor_vehicles_photo_path_chk;
alter table public.subcontractor_vehicles
  add constraint subcontractor_vehicles_photo_path_chk
  check (photo_path is null or public.vehicle_photo_path_ok(photo_path));

comment on constraint subcontractor_vehicles_photo_path_chk on public.subcontractor_vehicles is
  '🔒 المسار مفتاحُ كائنٍ داخليّ أو NULL — لا رابط ولا مخطَّط ولا صعودٌ في الشجرة ولا PDF. صفر طلبات خارجية مفروضةً في القاعدة، على سابقة 0093 و0120.';

-- ----------------------------------------------------------------------------
-- (٣) المُشغّل على الصف — الحزام الثاني
--
-- القيدُ يحرس **الشكل**، وهذا يحرس **الملكية**: مسارٌ سليم الشكل تماماً لكنه
-- تحت مجلّد شريكٍ آخر أو مركبةٍ أخرى يمرّ من القيد ويسقط هنا. وهذا هو بالضبط
-- ما يجعل الشاهدَين متمايزين في الاختبار: مدخلان لا يفترقان إلا في البتّ الذي
-- يفحصه هذا المُشغّل.
-- ----------------------------------------------------------------------------

create or replace function public.subcontractor_vehicles_photo_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.photo_path is not null then
    if public.vehicle_photo_path_owner(new.photo_path) is distinct from new.subcontractor_id
       or public.vehicle_photo_path_vehicle(new.photo_path) is distinct from new.id then
      raise exception 'مسار صورة المركبة لا يخصّ هذه المركبة ولا هذا المتعهد'
        using hint = 'vehicle-photo-path-mismatch';
    end if;
  end if;
  return new;
end;
$function$;

comment on function public.subcontractor_vehicles_photo_guard() is
  '🔒 حزامٌ ثانٍ فوق سياسة التخزين: يرفض مسار ملفٍّ لا يقع تحت مجلّد مالكه ومركبته. نظير subcontractor_drivers_docs_guard في 0120، ولا يفعل غير ذلك — فالمركبة لا توثيق لها يسقط.';

drop trigger if exists subcontractor_vehicles_photo_guard on public.subcontractor_vehicles;
create trigger subcontractor_vehicles_photo_guard
  before insert or update on public.subcontractor_vehicles
  for each row execute function public.subcontractor_vehicles_photo_guard();

-- ----------------------------------------------------------------------------
-- (٤) الدلو `vehicle-photos` — خاصّ، وصورٌ لا مستندات
-- ----------------------------------------------------------------------------

do $$
begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'vehicle-photos', 'vehicle-photos', false, 5242880,
    array['image/jpeg', 'image/png', 'image/webp']
  )
  on conflict (id) do update
    set public             = false,
        file_size_limit    = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

  raise notice '✔ دلو vehicle-photos: خاصّ · حدّ ٥ ميغابايت · jpeg/png/webp (ولا pdf)';
exception
  when others then
    raise notice '⚠ تعذّر ضبط دلو vehicle-photos برمجياً (%) — اضبطه يدوياً من Storage', sqlerrm;
end;
$$;

-- تصليبٌ كالذي في 0007 و0078 و0120: لو أُنشئ عاماً يدوياً يُعاد خاصاً في كل تنفيذ
do $$
begin
  update storage.buckets b set public = false where b.id = 'vehicle-photos' and b.public;
exception
  when others then
    raise notice '⚠ تعذّر إعادة دلو vehicle-photos خاصاً (%) — تأكد يدوياً', sqlerrm;
end;
$$;

-- ----------------------------------------------------------------------------
-- (٥) شرط الرفع — شكلٌ + ملكيةٌ + سقفُ عدد، في دالةٍ واحدة تُنادى من سياستين
--
-- `security definer` لأنها تقرأ `subcontractor_vehicles` و`storage.objects`،
-- ولا تُرجع إلا `boolean` فلا تسرّب حرفاً. نظير `driver_doc_upload_allowed`
-- (‏0120) و`receipt_upload_allowed` (‏0009).
--
-- والسقفُ **ستة** لا واحد: الملفُّ المقصود واحدٌ، والخمسةُ الباقية مساحةُ
-- استبدالٍ تحسّباً لرفعٍ انقطع قبل كتابة الصف. والكنسُ في `sweepVehicleFolder`
-- يعيد المجلّد إلى ملفٍّ واحد عند كل رفعٍ ناجح، فالسقف حدٌّ لا حالةُ تشغيل.
-- ----------------------------------------------------------------------------

create or replace function public.vehicle_photo_upload_allowed(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select public.vehicle_photo_path_ok(p_name)
     and exists (
       select 1
       from public.subcontractor_vehicles v
       where v.id = public.vehicle_photo_path_vehicle(p_name)
         and v.subcontractor_id = public.vehicle_photo_path_owner(p_name)
         and (public.is_admin() or v.subcontractor_id = public.current_subcontractor_id())
     )
     and (
       select count(*)
       from storage.objects o
       where o.bucket_id = 'vehicle-photos'
         and split_part(o.name, '/', 1) = split_part(p_name, '/', 1)
         and split_part(o.name, '/', 2) = split_part(p_name, '/', 2)
     ) < 6;
$function$;

comment on function public.vehicle_photo_upload_allowed(text) is
  '🔒 شرط الكتابة في دلو vehicle-photos: شكلُ المسار + أن تكون المركبة موجودةً ومملوكةً للرافع (أو أن يكون الرافع إدارة) + سقفُ ستة ملفات لكل مركبة. definer لأنه يقرأ جدولين محجوبين، ولا يُرجع إلا boolean.';

-- ----------------------------------------------------------------------------
-- (٦) السياسات الأربع
--
-- 🔴 ولا واحدة منها لـ`anon`، ولا واحدة لـ`authenticated` بلا قيدِ ملكية.
-- `authenticated` هو **كلُّ متعهد** (D-20): سياسةٌ بلا قيدٍ كانت ستُطلع كل
-- شريكٍ على أسطول كل منافس بالصورة. والقيد
-- `vehicle_photo_path_owner(name) = current_subcontractor_id()` هو الفرق كله،
-- و`current_subcontractor_id()` تُرجع NULL لعميلٍ مسجَّل فيقع خارجها بلا شرطٍ
-- إضافي.
-- ----------------------------------------------------------------------------

drop policy if exists "vehicle_photos_select_own_or_admin" on storage.objects;
create policy "vehicle_photos_select_own_or_admin"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'vehicle-photos'
    and (
      public.is_admin()
      or public.vehicle_photo_path_owner(name) = public.current_subcontractor_id()
    )
  );

drop policy if exists "vehicle_photos_insert_own_or_admin" on storage.objects;
create policy "vehicle_photos_insert_own_or_admin"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'vehicle-photos'
    and public.vehicle_photo_upload_allowed(name)
  );

drop policy if exists "vehicle_photos_update_own_or_admin" on storage.objects;
create policy "vehicle_photos_update_own_or_admin"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'vehicle-photos'
    and (
      public.is_admin()
      or public.vehicle_photo_path_owner(name) = public.current_subcontractor_id()
    )
  )
  with check (
    bucket_id = 'vehicle-photos'
    and public.vehicle_photo_upload_allowed(name)
  );

drop policy if exists "vehicle_photos_delete_own_or_admin" on storage.objects;
create policy "vehicle_photos_delete_own_or_admin"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'vehicle-photos'
    and (
      public.is_admin()
      or public.vehicle_photo_path_owner(name) = public.current_subcontractor_id()
    )
  );

-- ----------------------------------------------------------------------------
-- (٧) تفصيلُ الأسطول لكل فئة — **والصفرُ يُقال**
--
-- 🔴 هذه هي النقطة التي تفصل «شاشةً تعرض ما يملك» عن «شاشةٍ تقول ماذا يملك
-- وماذا لا يملك». فالمشرف الذي يقرأ سطرين فقط لا يعرف: أليس لهذا الشريك سيدان
-- أصلاً، أم أن السطر لم يُرسم؟ فالدالةُ تُرجع **صفّاً لكل فئةٍ نشطة على
-- المنصة** — بصفرٍ صريح لمن لا مركبة له فيها — **زائداً** أي فئةٍ يملك فيها
-- مركبةً ولو كانت الفئة نفسها معطَّلة (وإلا اختفت مركبةٌ قائمة من الحساب).
--
-- 🔒 و`security invoker` بقصد (لا `definer`): RLS على `subcontractor_vehicles`
-- هي الحارس، فالمشرف يرى الكل والشريك يرى نفسه، **وشريكٌ ينادي بمعرّف منافسه
-- يُرجَع له صفرٌ في كل فئة** — لا سطر `if` في TypeScript. وما يخرج منها أعدادٌ
-- ومقاعدُ فقط: لا تكلفةَ ولا هامشَ ولا متعهد (D-19).
-- ----------------------------------------------------------------------------

create or replace function public.subcontractor_fleet_breakdown(p_subcontractor_id uuid)
returns table (
  class_slug          text,
  title               text,
  capacity            integer,
  class_active        boolean,
  vehicles_total      integer,
  vehicles_active     integer,
  vehicles_with_photo integer,
  seats_min           integer,
  seats_max           integer,
  seats_mismatch      integer
)
language sql
stable
as $function$
  with mine as (
    select v.id, v.class_slug, v.seats, v.active, v.photo_path
    from public.subcontractor_vehicles v
    where v.subcontractor_id = p_subcontractor_id
  ),
  slugs as (
    select c.slug from public.vehicle_classes c where c.active
    union
    select m.class_slug from mine m
  )
  select
    s.slug                                                      as class_slug,
    coalesce(c.title, s.slug)                                   as title,
    c.capacity                                                  as capacity,
    coalesce(c.active, false)                                   as class_active,
    count(m.id)::integer                                        as vehicles_total,
    (count(*) filter (where m.active))::integer                 as vehicles_active,
    (count(*) filter (where m.photo_path is not null))::integer as vehicles_with_photo,
    min(m.seats)::integer                                       as seats_min,
    max(m.seats)::integer                                       as seats_max,
    -- عددُ المركبات التي تخالف مقاعدُها سعةَ فئتها المعلَنة للعميل — رقمٌ
    -- يُعرض ولا يُصحَّح تلقائياً: السعة قرارُ مالكٍ والمقاعد إقرارُ شريك.
    (count(*) filter (
       where m.seats is not null and c.capacity is not null and m.seats <> c.capacity
     ))::integer                                                as seats_mismatch
  from slugs s
  left join public.vehicle_classes c on c.slug = s.slug
  left join mine m on m.class_slug = s.slug
  group by s.slug, c.title, c.capacity, c.active, c.sort
  order by coalesce(c.sort, 9999), s.slug;
$function$;

comment on function public.subcontractor_fleet_breakdown(uuid) is
  'تفصيلُ أسطول شريكٍ لكل فئة: العدد والنشط منها وكم منها له صورة ومدى المقاعد وكم مركبةٍ تخالف مقاعدُها سعةَ الفئة. تُرجع صفّاً لكل فئةٍ نشطة ولو بصفر مركبة — فالمشرف يحتاج أن يعرف ما لا يملكه الشريك بقدر ما يملك. security invoker بقصد: RLS هي التي تعزل، وشريكٌ ينادي بمعرّف منافسه يُرجَع له صفر. ولا تحمل تكلفةً ولا هامشاً (D-19).';

-- ----------------------------------------------------------------------------
-- (٨) الصلاحيات — سحبٌ ثم منحٌ ضيّق
-- ----------------------------------------------------------------------------

-- دوالُّ الشكل يحتاجها المنادي داخل السياسات، ونداؤها المباشر لا يسرّب شيئاً:
-- تُرجع boolean أو uuid مشتقاً من وسيطها وحده.
grant execute on function public.vehicle_photo_path_ok(text)      to anon, authenticated;
grant execute on function public.vehicle_photo_path_owner(text)   to anon, authenticated;
grant execute on function public.vehicle_photo_path_vehicle(text) to anon, authenticated;

revoke all on function public.vehicle_photo_upload_allowed(text) from public, anon;
grant execute on function public.vehicle_photo_upload_allowed(text) to authenticated;

-- التفصيل لا يخرج إلى زائر: `anon` لا يعرف أسطول شريك ولو بالعدد
revoke all on function public.subcontractor_fleet_breakdown(uuid) from public, anon;
grant execute on function public.subcontractor_fleet_breakdown(uuid) to authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.subcontractor_fleet_breakdown(uuid) to service_role';
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- (٩) الفحص الذاتي — ويشهد على **ما كان قائماً** لا على ما أضفناه (D-58)
-- ----------------------------------------------------------------------------

do $$
declare
  v_missing       text;
  v_bucket_public boolean;
  v_anon_policies integer;
  v_policies      integer;
  v_good          text := 'aaaaaaaa-0000-4000-8000-00000000000a/eeeeeeee-0000-4000-8000-00000000000e/photo-0123456789abcdef.jpg';
begin
  -- (٩-١) الكائنات الجديدة موجودة
  select string_agg(x.f, '، ') into v_missing
  from (values
    ('public.vehicle_photo_path_ok(text)'),
    ('public.vehicle_photo_path_owner(text)'),
    ('public.vehicle_photo_path_vehicle(text)'),
    ('public.vehicle_photo_upload_allowed(text)'),
    ('public.subcontractor_vehicles_photo_guard()'),
    ('public.subcontractor_fleet_breakdown(uuid)')
  ) as x(f)
  where to_regprocedure(x.f) is null;
  if v_missing is not null then
    raise exception '0136: دوال مفقودة بعد التنفيذ: %', v_missing;
  end if;

  -- (٩-٢) الدلو خاصّ
  select b.public into v_bucket_public from storage.buckets b where b.id = 'vehicle-photos';
  if v_bucket_public is null then
    raise notice '⚠ 0136: دلو vehicle-photos غير موجود — أنشئه يدوياً وأعد التنفيذ';
  elsif v_bucket_public then
    raise exception '0136: دلو vehicle-photos عامّ — وهذا بعينه ما تمنعه هذه الهجرة';
  end if;

  -- (٩-٣) أربع سياسات، ولا واحدة تشمل anon
  select count(*) into v_policies
  from pg_policies p
  where p.schemaname = 'storage' and p.tablename = 'objects'
    and p.policyname like 'vehicle_photos%';
  if v_policies <> 4 then
    raise exception '0136: سياسات الدلو % لا أربع', v_policies;
  end if;

  select count(*) into v_anon_policies
  from pg_policies p
  where p.schemaname = 'storage' and p.tablename = 'objects'
    and p.policyname like 'vehicle_photos%' and 'anon' = any (p.roles);
  if v_anon_policies > 0 then
    raise exception '0136: % سياسة vehicle_photos تشمل anon — الدلو خاصّ', v_anon_policies;
  end if;

  -- (٩-٤) الشكل يرفض ما رفضته سابقتاه المقيستان (0093 · 0120) ويرفض تضييقَيه
  if public.vehicle_photo_path_ok('https://evil.com/x.jpg')
     or public.vehicle_photo_path_ok('//cdn/x.jpg')
     or public.vehicle_photo_path_ok('data:image/png;base64,AAA')
     or public.vehicle_photo_path_ok('/../../etc/passwd')
     or public.vehicle_photo_path_ok('receipts/abc/x.jpg')
     -- التضييق (١): صنف الرخصة لا مكان له في دلو المركبات
     or public.vehicle_photo_path_ok(
          'aaaaaaaa-0000-4000-8000-00000000000a/eeeeeeee-0000-4000-8000-00000000000e/license-0123456789abcdef.jpg')
     -- التضييق (٢): ولا PDF
     or public.vehicle_photo_path_ok(
          'aaaaaaaa-0000-4000-8000-00000000000a/eeeeeeee-0000-4000-8000-00000000000e/photo-0123456789abcdef.pdf')
  then
    raise exception '0136: vehicle_photo_path_ok يقبل مساراً كان يجب رفضه';
  end if;

  -- والشاهد الموجب — بدونه يصير ما سبق «فحصاً لا يمكن أن يفشل» (النمط ٩)
  if not public.vehicle_photo_path_ok(v_good) then
    raise exception '0136: vehicle_photo_path_ok يرفض مساراً سليماً — الفحص كله بلا معنى';
  end if;
  if public.vehicle_photo_path_owner(v_good) <> 'aaaaaaaa-0000-4000-8000-00000000000a'::uuid then
    raise exception '0136: vehicle_photo_path_owner لا يُرجع المقطع الأول';
  end if;
  if public.vehicle_photo_path_owner('https://evil.com/x.jpg') is not null then
    raise exception '0136: 🔴 مسارٌ مخالف أعطى مالكاً — والسياسة تقارن به';
  end if;

  -- (٩-٥) 🔴 حراسةُ ما كان قائماً: لا صورةَ مركبةٍ في حمولة البثّ للمتعهدين
  if pg_get_functiondef('public.dispatch_trip_payload(uuid,boolean)'::regprocedure)
       ~* '(photo_path|vehicle_photo)' then
    raise exception '0136: dispatch_trip_payload صارت تذكر صورة — النصف العام يبقى نظيفاً (D-56)';
  end if;

  -- (٩-٦) ولا في حمولة العميل: أعمدة `get_booking_by_token` وجسمُها
  if exists (
    select 1
    from unnest(string_to_array(
           pg_get_function_result('public.get_booking_by_token(text)'::regprocedure), ',')) as col
    where col ~* 'photo'
  ) then
    raise exception '0136: نوع إرجاع get_booking_by_token صار يحمل صورة — والعميل لا يراها (D-19)';
  end if;
  if pg_get_functiondef('public.get_booking_by_token(text)'::regprocedure) ~* 'photo_path' then
    raise exception '0136: 🔴 get_booking_by_token صارت تقرأ photo_path — صورةُ المركبة لا تصل العميل';
  end if;

  raise notice '✔ 0136: الدلو خاصّ · أربع سياسات بلا anon · الشكل يرفض السبعة المقيسة ويقبل الصالح · حمولتا البثّ والعميل نظيفتان من الصور';
end;
$$;
