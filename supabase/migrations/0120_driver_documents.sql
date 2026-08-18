-- ============================================================================
-- 0120 — صورة السائق ورخصته: بياناتٌ حسّاسة بساعةٍ من خمس سنوات
--
-- العقد الملزم: `lib/driver-docs-types.ts` — يُقرأ قبل هذا الملف.
-- والسابقة المباشرة: `0040_trip_crew.sql` التي **أجّلت هذا بقرارٍ مكتوب**:
-- «الرفع نفسه يحتاج دلواً خاصاً بسياساته — ودلو `media` القائم **عام**، فصورة
-- سائق فيه يقرأها أي أحد بالمسار … وكتابةُ سياسات تخزين على عجل هي بالضبط شكل
-- الخطأ الذي يُسرِّب صامتاً — فتؤجَّل بهجرتها ومراجعتها.» فهذه هي تلك الهجرة.
--
-- ── قرارات المالك الأربعة (2026-08-18) ────────────────────────────────────
--
--   ١) «تُخزَّن في مكان لا يصله العميل»
--   ٢) «يراها من في لوحة التحكم فقط»
--   ٣) «نعم يمكن للمتعهد أن يرى رخصة سائقه»  ← سائقَه هو وحده (D-19)
--   ٤) «يمكننا الاحتفاظ بها ٥ سنوات وفقاً للسياسات»
--
-- ── ومَربِط الخمس سنوات: **انتهاء العلاقة**، لا تاريخ الرفع ───────────────
--
-- وهو نصُّ اتفاقية الشراكة المنشورة سلفاً في `0113` حرفاً بحرف: «وتحتفظ المنصة
-- بصور السائقين والرخص **لمدة خمس سنوات من انتهاء العلاقة بين الطرفين** …
-- ثم تُحذف». فلو قِيست من الرفع لَحُذفت رخصةُ سائقٍ يعمل اليوم في منتصف خدمته،
-- **ولَخالف النظامُ عقداً وقّع عليه الشريك**.
--
-- ⚠ و`subcontractors.status` ثلاثُ حالات لا رابعة فيها «منتهية» — فالمُرسى عمودٌ
--   جديد `relationship_ended_at` يضبطه مُشغّل عند الدخول في `suspended` **ويمحوه
--   فور الخروج منها**. أي أن إيقافاً مؤقتاً لا يُفقد صورةً واحدة، وخمسَ سنواتٍ
--   موقوفاً بلا رجعة هي انتهاءُ علاقةٍ بأي قراءة أمينة. **وهذا اجتهادٌ مكتوبٌ
--   ليصحّحه المالك** إن أراد حالةً رابعة صريحة.
--
-- ── 🔒 والنصّ يبقى، والصورة هي التي تنتهي ────────────────────────────────
--
-- الاسم · رقم الرخصة · تاريخ انتهائها · مَن وثّقها ومتى ⇒ **بلا أجل**، كي لا
-- تفقد رحلةٌ قديمة سائقَها. والكنسُ لا يمسّ صفّاً واحداً: يحذف **الملفّين
-- ومسارَيهما** ولا شيء غير ذلك.
--
-- ── 🔴 وثلاثة أشكال فشلٍ أُغلقت بنيوياً ─────────────────────────────────
--
-- (١) **`authenticated` هو كلُّ متعهد** (D-20). فسياسةٌ مكتوبة لـ`authenticated`
--     وحده تعني «كل شريك يقرأ رخصة كل سائق». وكلُّ سياسةٍ هنا مقيَّدةٌ بـ
--     `driver_doc_path_owner(name) = current_subcontractor_id()`، والفحص الذاتي
--     أدناه **ينتحل شريكاً ثانياً حقيقياً** ولا يقرأ منحة.
-- (٢) **لا رابط عام**: الدلو `public = false`، ولا سياسة `anon` واحدة عليه،
--     والعرض برابطٍ موقَّع يُولَّد **بجلسة القارئ نفسها** فالسياسة هي الحارس.
-- (٣) **مهلةُ حفظٍ بلا وظيفة حذف كذبة**: الكنس مبنيٌّ هنا، ومصدرُ «المستحق»
--     `storage.objects` **نفسه** لا دفترنا. والترتيب مقصود: يُحذف الملف أولاً
--     ثم يُمحى المسار — فالانقطاع في المنتصف يترك صفّاً يشير إلى ملفٍّ ذهب
--     (تُصلحه الدورة التالية)، لا ملفّاً باقياً لا يشير إليه شيء.
--
-- ⚠ **ولا يُمنح شيءٌ جديد لأي دور متصفح.** `0114` سحبت
--   `TRIGGER`/`TRUNCATE`/`REFERENCES` من الأدوار الثلاثة، وهذه الهجرة **تسحب ولا
--   تمنح** — ومنها سحبٌ ثانٍ يفتح عليه القسم (٨).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (١) السجلّ الدائم — نصٌّ يبقى، ومساران يذهبان
-- ----------------------------------------------------------------------------

alter table public.subcontractor_drivers
  add column if not exists license_photo_path  text,
  add column if not exists license_expiry      date,
  add column if not exists license_verified_by uuid references public.profiles(id) on delete set null,
  add column if not exists license_verified_at timestamptz,
  add column if not exists docs_purged_at      timestamptz;

comment on column public.subcontractor_drivers.photo_path is
  '🔒 مسار صورة السائق في الدلو الخاص driver-docs — لا يخرج خاماً إلى متصفح، ولا يصل العميل بحال. يُحذف بعد خمس سنوات من انتهاء العلاقة مع المتعهد؛ والاسم ورقم الرخصة يبقيان.';

comment on column public.subcontractor_drivers.license_photo_path is
  '🔒 مسار صورة الرخصة في الدلو الخاص driver-docs. يراه المتعهد المالك واللوحة فقط (قرار المالك 2026-08-18)، ويُحذف مع صورة السائق في الكنس نفسه.';

comment on column public.subcontractor_drivers.license_expiry is
  'تاريخ انتهاء الرخصة — جزءٌ من السجلّ النصّي الدائم الذي لا يُحذف. والاتفاقية (0113) تُلزم المتعهد بإيقاف سائقٍ سقطت رخصته، فهذا التاريخ هو ما يجعل الالتزام قابلاً للقياس.';

comment on column public.subcontractor_drivers.license_verified_by is
  'المشرف الذي وثّق الرخصة من اللوحة — لا يكتبه الشريك ولا يستطيع. وأي تعديل لاحق على رقم الرخصة أو تاريخها أو صورتها يمحو التوثيق تلقائياً.';

comment on column public.subcontractor_drivers.docs_purged_at is
  'متى حُذفت صور هذا السائق بانقضاء مدة الحفظ — يُعرض كي لا يُقرأ غياب الصورة عطلاً في النظام.';

-- تاريخٌ معقول: رخصةٌ انتهت قبل ١٩٧٠ أو تنتهي بعد ٢١٠٠ خطأٌ مطبعي لا بيان
alter table public.subcontractor_drivers
  drop constraint if exists subcontractor_drivers_license_expiry_chk;
alter table public.subcontractor_drivers
  add constraint subcontractor_drivers_license_expiry_chk
  check (license_expiry is null or license_expiry between date '1970-01-01' and date '2100-01-01');

alter table public.subcontractor_drivers
  drop constraint if exists subcontractor_drivers_license_no_chk;
alter table public.subcontractor_drivers
  add constraint subcontractor_drivers_license_no_chk
  check (license_no is null or length(btrim(license_no)) between 3 and 40);

-- ----------------------------------------------------------------------------
-- (٢) شكل المسار — دوالٌّ `immutable` تصلح داخل `CHECK`
--
-- على سابقة `payment_accounts_image_internal_chk` (‏0093) الذي قِيس حياً وهو
-- **يرفض** `https://` و`//cdn` و`data:` و`/../../etc/passwd`. والفرق أن ذاك
-- يحرس مساراً داخلياً في الموقع، وهذا يحرس **مفتاح كائنٍ في دلوٍ خاص** —
-- فالشكل هنا أضيق: مقطعان معرِّفان ثم اسمُ ملفٍّ من قائمة مغلقة.
-- ----------------------------------------------------------------------------

create or replace function public.driver_doc_path_ok(p_name text)
returns boolean
language sql
immutable
as $function$
  select coalesce(p_name, '') ~ (
           '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
        || '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
        || '(photo|license)-[0-9a-f]{16,64}\.(jpg|jpeg|png|webp|pdf)$'
         )
     -- ولا مخطَّط إطلاقاً: `javascript:` و`data:` و`https:` كلها تحمل نقطتين
     and position(':' in coalesce(p_name, '')) = 0
     -- ولا صعودٌ في الشجرة
     and position('..' in coalesce(p_name, '')) = 0
     -- ولا محرف تحكّم — قيمةٌ مصنوعة لا مفتاحُ كائنٍ حقيقي
     and coalesce(p_name, '') !~ '[[:cntrl:]]'
     and length(coalesce(p_name, '')) <= 200;
$function$;

comment on function public.driver_doc_path_ok(text) is
  '🔒 شكل مفتاح الكائن الوحيد المقبول في دلو driver-docs: <subcontractor_id>/<driver_id>/<photo|license>-<hex>.<ext>. immutable بقصد كي يصلح داخل CHECK، ولا يقرأ جدولاً فلا يسرّب شيئاً. على سابقة payment_accounts_image_internal_chk (0093).';

create or replace function public.driver_doc_path_owner(p_name text)
returns uuid
language sql
immutable
as $function$
  select case when public.driver_doc_path_ok(p_name)
              then (split_part(p_name, '/', 1))::uuid
         end;
$function$;

comment on function public.driver_doc_path_owner(text) is
  '🔒 المقطع الأول من المسار = المتعهد المالك. عليه تُبنى كل سياسة تخزين في هذا الدلو، فلا يمكن لملفٍّ أن يوجد خارج مجلّد صاحبه. ويُرجع NULL لأي مسارٍ مخالف للشكل — و`NULL = uuid` ليست true، فالمخالف مرفوض لا مقبول.';

create or replace function public.driver_doc_path_driver(p_name text)
returns uuid
language sql
immutable
as $function$
  select case when public.driver_doc_path_ok(p_name)
              then (split_part(p_name, '/', 2))::uuid
         end;
$function$;

comment on function public.driver_doc_path_driver(text) is
  'المقطع الثاني من المسار = السائق. يُستعمل في ربط الملف بصفّه وفي كنس الأيتام.';

-- القيدان على العمودين — نفس الدالة، فلا تنحرف قاعدةٌ عن أختها
alter table public.subcontractor_drivers
  drop constraint if exists subcontractor_drivers_photo_path_chk;
alter table public.subcontractor_drivers
  add constraint subcontractor_drivers_photo_path_chk
  check (photo_path is null or public.driver_doc_path_ok(photo_path));

alter table public.subcontractor_drivers
  drop constraint if exists subcontractor_drivers_license_photo_chk;
alter table public.subcontractor_drivers
  add constraint subcontractor_drivers_license_photo_chk
  check (license_photo_path is null or public.driver_doc_path_ok(license_photo_path));

comment on constraint subcontractor_drivers_photo_path_chk on public.subcontractor_drivers is
  '🔒 المسار مفتاحُ كائنٍ داخليّ أو NULL — لا رابط ولا مخطَّط ولا صعودٌ في الشجرة. صفر طلبات خارجية مفروضةً في القاعدة، على سابقة 0093.';

-- ----------------------------------------------------------------------------
-- (٣) الحزام الثاني: مُشغّلُ الصف يربط الملف بمالكه وبسائقه
--
-- السياسة تحرس **الكتابة في الدلو**، وهذا يحرس **الكتابة في الصف**: مسارٌ سليم
-- الشكل لكنه يخصّ سائقاً آخر أو شريكاً آخر يُرفض هنا. حزامان لا حزام واحد، وهو
-- نفس ما فعله `0040` حين قيّد كل استعلامٍ بـ`subcontractor_id` فوق RLS.
--
-- ⚠ وله عملٌ ثانٍ: **محو التوثيق عند تغيّر أي مكوّنٍ من الرخصة**. ولولاه لبقي
--   وسمُ «موثَّقة من الإدارة» فوق رخصةٍ استُبدلت بعد التوثيق — أي أن التوثيق
--   يشهد على ما لم يره أحد.
-- ----------------------------------------------------------------------------

create or replace function public.subcontractor_drivers_docs_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  -- (أ) كل مسارٍ غير فارغ يجب أن يقع تحت «مجلّد المالك / مجلّد السائق»
  if new.photo_path is not null then
    if public.driver_doc_path_owner(new.photo_path) is distinct from new.subcontractor_id
       or public.driver_doc_path_driver(new.photo_path) is distinct from new.id then
      raise exception 'مسار صورة السائق لا يخصّ هذا السائق ولا هذا المتعهد'
        using hint = 'driver-doc-path-mismatch';
    end if;
  end if;

  if new.license_photo_path is not null then
    if public.driver_doc_path_owner(new.license_photo_path) is distinct from new.subcontractor_id
       or public.driver_doc_path_driver(new.license_photo_path) is distinct from new.id then
      raise exception 'مسار صورة الرخصة لا يخصّ هذا السائق ولا هذا المتعهد'
        using hint = 'driver-doc-path-mismatch';
    end if;
  end if;

  -- (ب) الشريك لا يوثّق نفسه — التوثيق يُكتب من `admin_verify_driver_license`
  --     وحدها، وأي تعديلٍ للرخصة يمحوه.
  if tg_op = 'UPDATE' then
    if new.license_no          is distinct from old.license_no
       or new.license_expiry      is distinct from old.license_expiry
       or new.license_photo_path  is distinct from old.license_photo_path then
      new.license_verified_by := null;
      new.license_verified_at := null;
    end if;
  end if;

  return new;
end;
$function$;

comment on function public.subcontractor_drivers_docs_guard() is
  '🔒 حزامٌ ثانٍ فوق سياسة التخزين: يرفض مسار ملفٍّ لا يقع تحت مجلّد مالكه وسائقه، ويمحو توثيق الرخصة تلقائياً عند تغيّر رقمها أو تاريخها أو صورتها — فلا يشهد وسمُ «موثَّقة» على ما لم يره مشرف.';

drop trigger if exists subcontractor_drivers_docs_guard on public.subcontractor_drivers;
create trigger subcontractor_drivers_docs_guard
  before insert or update on public.subcontractor_drivers
  for each row execute function public.subcontractor_drivers_docs_guard();

-- ----------------------------------------------------------------------------
-- (٤) مُرسى مدّة الحفظ — انتهاء العلاقة لا تاريخ الرفع
-- ----------------------------------------------------------------------------

alter table public.subcontractors
  add column if not exists relationship_ended_at timestamptz;

comment on column public.subcontractors.relationship_ended_at is
  'لحظة انتهاء العلاقة — مُرسى مدّة حفظ صور السائقين (خمس سنوات، اتفاقية 0113). يضبطه مُشغّل عند الدخول في suspended ويمحوه فور الخروج منها، فإيقافٌ مؤقت لا يُفقد صورة واحدة. NULL = العلاقة قائمة ⇒ لا شيء مستحق للحذف.';

create or replace function public.subcontractors_relationship_clock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.status = 'suspended' then
    -- أول دخولٍ في الإيقاف يبدأ الساعة، وإيقافٌ مستمر لا يعيد ضبطها
    if tg_op = 'INSERT' or coalesce(old.status, '') <> 'suspended' then
      new.relationship_ended_at := coalesce(new.relationship_ended_at, now());
    end if;
  else
    -- العودة إلى العمل تمحو الساعة كلياً — ولا تُبقيها «موقوفة مؤقتاً»
    new.relationship_ended_at := null;
  end if;
  return new;
end;
$function$;

comment on function public.subcontractors_relationship_clock() is
  'ساعة مدّة الحفظ: تبدأ عند الدخول في suspended وتُمحى عند الخروج منها. اجتهادٌ معلن لأن status لا تحوي حالة «منتهية» — ومكتوبٌ في lib/driver-docs-types.ts ليصحّحه المالك إن أراد حالة رابعة.';

drop trigger if exists subcontractors_relationship_clock on public.subcontractors;
create trigger subcontractors_relationship_clock
  before insert or update on public.subcontractors
  for each row execute function public.subcontractors_relationship_clock();

-- ----------------------------------------------------------------------------
-- (٥) الدلو `driver-docs` — خاصٌّ بحدوده، وسياساته أربع لا خامسة
-- ----------------------------------------------------------------------------

do $$
begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'driver-docs', 'driver-docs', false, 5242880,
    array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
  )
  on conflict (id) do update
    set public             = false,
        file_size_limit    = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

  raise notice '✔ دلو driver-docs: خاصّ · حدّ ٥ ميغابايت · jpeg/png/webp/pdf';
exception
  when others then
    raise notice '⚠ تعذّر ضبط دلو driver-docs برمجياً (%) — اضبطه يدوياً من Storage', sqlerrm;
end;
$$;

-- تصليبٌ كالذي في 0007 و0078: لو أُنشئ عاماً يدوياً يُعاد خاصاً في كل تنفيذ
do $$
begin
  update storage.buckets b set public = false where b.id = 'driver-docs' and b.public;
exception
  when others then
    raise notice '⚠ تعذّر إعادة دلو driver-docs خاصاً (%) — تأكد يدوياً', sqlerrm;
end;
$$;

-- (٥-٢) شرط الرفع — شكلٌ + ملكيةٌ + سقفُ عدد، في دالةٍ واحدة تُنادى من سياستين
--
-- `security definer` لأن الشرط يقرأ `subcontractor_drivers` و`storage.objects`،
-- ولا يُرجع إلا `boolean` فلا يسرّب حرفاً. وهو نظير `receipt_upload_allowed`
-- (‏0009) شكلاً ووظيفةً — والسقف هنا ستةُ ملفات لكل سائق: ملفّان مقصودان
-- ومساحةٌ لاستبدالٍ أو اثنين قبل أن يكنس الكنس ما بقي.
create or replace function public.driver_doc_upload_allowed(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select public.driver_doc_path_ok(p_name)
     and exists (
       select 1
       from public.subcontractor_drivers d
       where d.id = public.driver_doc_path_driver(p_name)
         and d.subcontractor_id = public.driver_doc_path_owner(p_name)
         and (public.is_admin() or d.subcontractor_id = public.current_subcontractor_id())
     )
     and (
       select count(*)
       from storage.objects o
       where o.bucket_id = 'driver-docs'
         and split_part(o.name, '/', 1) = split_part(p_name, '/', 1)
         and split_part(o.name, '/', 2) = split_part(p_name, '/', 2)
     ) < 6;
$function$;

comment on function public.driver_doc_upload_allowed(text) is
  '🔒 شرط الكتابة في دلو driver-docs: شكلُ المسار + أن يكون السائق موجوداً ومملوكاً للرافع (أو أن يكون الرافع إدارة) + سقفُ ستة ملفات لكل سائق. definer لأنه يقرأ جدولين محجوبين، ولا يُرجع إلا boolean. نظير receipt_upload_allowed في 0009.';

-- (٥-٣) السياسات الأربع
--
-- 🔴 **ولا واحدة منها لـ`anon`، ولا واحدة منها لـ`authenticated` بلا قيدِ ملكية.**
-- `authenticated` هو كلُّ متعهد (D-20): سياسةُ `using (bucket_id = 'driver-docs')`
-- كانت ستُطلع كل شريكٍ على رخصة كل سائق عند كل منافس. والقيد
-- `driver_doc_path_owner(name) = current_subcontractor_id()` هو الفرق كله —
-- و`current_subcontractor_id()` تُرجع NULL لعميلٍ مسجَّل، و`NULL = uuid` ليست
-- true، فالعميلُ المسجَّل يقع خارجها بلا شرطٍ إضافي.

drop policy if exists "driver_docs_select_own_or_admin" on storage.objects;
create policy "driver_docs_select_own_or_admin"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'driver-docs'
    and (
      public.is_admin()
      or public.driver_doc_path_owner(name) = public.current_subcontractor_id()
    )
  );

drop policy if exists "driver_docs_insert_own_or_admin" on storage.objects;
create policy "driver_docs_insert_own_or_admin"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'driver-docs'
    and public.driver_doc_upload_allowed(name)
  );

drop policy if exists "driver_docs_update_own_or_admin" on storage.objects;
create policy "driver_docs_update_own_or_admin"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'driver-docs'
    and (
      public.is_admin()
      or public.driver_doc_path_owner(name) = public.current_subcontractor_id()
    )
  )
  with check (
    bucket_id = 'driver-docs'
    and public.driver_doc_upload_allowed(name)
  );

drop policy if exists "driver_docs_delete_own_or_admin" on storage.objects;
create policy "driver_docs_delete_own_or_admin"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'driver-docs'
    and (
      public.is_admin()
      or public.driver_doc_path_owner(name) = public.current_subcontractor_id()
    )
  );

-- ----------------------------------------------------------------------------
-- (٦) التوثيق الإداري — اللوحة وحدها، وأثرُه يسقط عند أول تعديل
-- ----------------------------------------------------------------------------

create or replace function public.admin_verify_driver_license(
  p_driver_id uuid,
  p_verified  boolean default true
)
returns table (
  driver_id   uuid,
  verified_by uuid,
  verified_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
begin
  if not public.is_admin() then
    raise exception 'توثيق الرخصة من اللوحة وحدها' using hint = 'forbidden';
  end if;

  return query
  update public.subcontractor_drivers d
     set license_verified_by = case when p_verified then (select auth.uid()) end,
         license_verified_at = case when p_verified then now() end
   where d.id = p_driver_id
  returning d.id, d.license_verified_by, d.license_verified_at;

  if not found then
    raise exception 'لا سائق بهذا المعرّف' using hint = 'driver-not-found';
  end if;
end;
$function$;

comment on function public.admin_verify_driver_license(uuid, boolean) is
  '🔒 توثيق رخصة سائق — is_admin() وحده. والشريك لا يستطيع توثيق نفسه لأن العمودين لا يكتبهما إلا هذه الدالة، وأي تعديل لاحق على الرخصة يمحو التوثيق بمُشغّل subcontractor_drivers_docs_guard.';

revoke all on function public.admin_verify_driver_license(uuid, boolean) from public, anon;
grant execute on function public.admin_verify_driver_license(uuid, boolean) to authenticated;

-- ----------------------------------------------------------------------------
-- (٧) الكنس — ومصدرُ «المستحق» هو الدلو نفسه لا دفترنا
--
-- 🔴 **هذه هي النقطة التي تفصل مهلةَ حفظٍ حقيقية عن ادّعاء.** لو كان المصدر
-- أعمدةَ `subcontractor_drivers` لَكان «صفٌّ مُفرَّغ» كافياً لإعلان النجاح —
-- وهو بعينه شكل الفشل: صفٌّ يقول «لا صورة» وملفٌّ باقٍ في الدلو إلى الأبد.
-- فالاستعلام يمشي على `storage.objects` ويُرجع مفاتيح الكائنات الحقيقية:
--
--   (أ) **انقضت المدة**: صاحبُ الملف سائقٌ متعهدُه انتهت علاقته منذ ≥ ٥ سنوات.
--   (ب) **يتيم**: مفتاحٌ في الدلو لا يشير إليه صفُّ سائقٍ واحد، وعمره فوق يوم.
--       ومنه ملفُّ سائقٍ حُذف صفّه، وملفٌّ استُبدل فبقي، وملفٌّ رُفع ثم فشلت
--       كتابة العمود. **والمهلة يومٌ** لأن الرفع يسبق كتابة العمود بأجزاء من
--       الثانية، وكنسٌ بلا مهلة كان سيحذف ما يُرفع الآن.
-- ----------------------------------------------------------------------------

create or replace function public.driver_documents_due_for_purge(p_limit integer default 200)
returns table (
  path             text,
  driver_id        uuid,
  subcontractor_id uuid,
  reason           text
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    o.name                                   as path,
    public.driver_doc_path_driver(o.name)    as driver_id,
    public.driver_doc_path_owner(o.name)     as subcontractor_id,
    case
      when not exists (
        select 1 from public.subcontractor_drivers d
        where o.name in (d.photo_path, d.license_photo_path)
      ) then 'orphan'
      else 'retention'
    end                                      as reason
  from storage.objects o
  where o.bucket_id = 'driver-docs'
    and (
      -- (أ) انقضت الخمس سنوات من انتهاء العلاقة
      exists (
        select 1
        from public.subcontractor_drivers d
        join public.subcontractors s on s.id = d.subcontractor_id
        where o.name in (d.photo_path, d.license_photo_path)
          and s.relationship_ended_at is not null
          and s.relationship_ended_at <= now() - interval '5 years'
      )
      -- (ب) يتيمٌ عمرُه فوق يوم
      or (
        coalesce(o.created_at, now()) < now() - interval '24 hours'
        and not exists (
          select 1 from public.subcontractor_drivers d
          where o.name in (d.photo_path, d.license_photo_path)
        )
      )
    )
  order by o.created_at nulls first
  limit greatest(1, least(coalesce(p_limit, 200), 1000));
$function$;

comment on function public.driver_documents_due_for_purge(integer) is
  '🔴 المستحق للحذف مقروءاً من storage.objects نفسه لا من أعمدتنا: (أ) ملفُّ سائقٍ انتهت علاقة متعهده منذ خمس سنوات، (ب) ملفٌّ يتيم عمره فوق يوم. ولهذا الاتجاه سبب: لو قرأ الدالةُ دفترَنا لكان «صفٌّ مُفرَّغ» شهادةَ نجاحٍ بينما الملف باقٍ في الدلو — وهو بعينه ما تمنعه هذه الهجرة.';

create or replace function public.mark_driver_documents_purged(p_paths text[])
returns integer
language sql
volatile
security definer
set search_path = ''
as $function$
  with cleared as (
    update public.subcontractor_drivers d
       set photo_path = case when d.photo_path = any(coalesce(p_paths, '{}')) then null else d.photo_path end,
           license_photo_path = case when d.license_photo_path = any(coalesce(p_paths, '{}')) then null else d.license_photo_path end,
           docs_purged_at = now()
     where d.photo_path = any(coalesce(p_paths, '{}'))
        or d.license_photo_path = any(coalesce(p_paths, '{}'))
    returning 1
  )
  select coalesce(count(*), 0)::integer from cleared;
$function$;

comment on function public.mark_driver_documents_purged(text[]) is
  '🔒 تُنادى **بعد** حذف الملفات من الدلو لا قبلها. الترتيب هو الضمانة: انقطاعٌ بينهما يترك صفّاً يشير إلى ملفٍّ ذهب — تُصلحه الدورة التالية — لا ملفّاً باقياً لا يشير إليه شيء.';

-- ----------------------------------------------------------------------------
-- (٨) الصلاحيات — سحبٌ لا منح
--
-- 🔴 **عيبٌ قائم خارج نطاق هذه الميزة وأخطر منها، مقيسٌ حياً 2026-08-18 ولا
--    يمكن إغلاقه من مُشغّل الهجرات — فيُعلَن ولا يُدَّعى إغلاقه:**
--
--     set local role anon;  truncate storage.objects;   ⇒ **نجح: ٩ صفوف ⇐ صفر**
--     set local role authenticated; …                    ⇒ **نجح كذلك**
--
--    أي أن `anon` و`authenticated` يملكان `TRUNCATE` على كتالوج التخزين كلّه —
--    الإيصالات والخرائط والوسائط معاً — و**RLS لا تحرس `TRUNCATE`** (الدرس ١٦؛
--    و`0041` أغلقت عينَ هذا على جداول `public` **ولم تبلغ مخطط `storage`**).
--
--    ولماذا لا يُغلق هنا: `storage.objects` مملوكٌ لـ`supabase_storage_admin`
--    و**المنحة صادرة عنه** (`anon=arwdDxtm/supabase_storage_admin`)، ودورُنا
--    `postgres` لا يستطيع سحب منحةِ غيره:
--      `revoke … granted by supabase_storage_admin` ⇒ «grantor must be current user»
--      `set role supabase_storage_admin`            ⇒ «permission denied to set role»
--
--    🔴 **و`revoke` صامتٌ لا يفشل**: نفّذناه أولاً فطبع نجاحاً و**لم يسحب حرفاً**
--    (تحقّقنا من `relacl` بعده). فحذفناه — لأن سطراً يقول «سُحبت» وهو لم يسحب
--    شيئاً هو بعينه «الإنذار الذي يرنّ على ضجيج» مقلوباً: طمأنينةٌ كاذبة عن ثغرة
--    حقيقية (القاعدة الذهبية ١٩).
--
--    والمنفذُ عبر PostgREST غير مباشر (لا فعل `TRUNCATE` في بروتوكولها)، فهي
--    **منحةٌ كامنة لا ثغرةٌ مستغَلّة اليوم** — وهذا بالضبط ما كان يُقال قبل
--    `0041`. والإغلاق بيد المالك: يُنفَّذ من لوحة Supabase بدورٍ يملك المنحة،
--    أو يُطلب من دعمها:
--
--      revoke truncate, trigger, references on storage.objects, storage.buckets
--        from anon, authenticated;
--
--    والفحص أدناه **يقيس الحالة ويطبعها في كل تنفيذ** ولا يدّعي شيئاً.
-- ----------------------------------------------------------------------------

do $$
declare
  v_holders text;
begin
  select string_agg(r.rolname, '، ' order by r.rolname) into v_holders
  from pg_roles r
  where r.rolname in ('anon', 'authenticated')
    and has_table_privilege(r.rolname, 'storage.objects', 'TRUNCATE');

  if v_holders is null then
    raise notice '🟢 storage.objects: لا TRUNCATE لدى anon ولا authenticated';
  else
    raise notice '🔴 storage.objects: TRUNCATE ما زال لدى (%) — منحةٌ يملكها supabase_storage_admin ولا يسحبها دورنا. أُعلنت في تقرير الجبهة ولم يُدَّعَ إغلاقها.', v_holders;
  end if;
end;
$$;

-- دوالُّ الكنس ليست لأي دور متصفح: العاملُ المجدول يعمل بمفتاح الخدمة
revoke all on function public.driver_documents_due_for_purge(integer) from public, anon, authenticated;
revoke all on function public.mark_driver_documents_purged(text[])    from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.driver_documents_due_for_purge(integer) to service_role';
    execute 'grant execute on function public.mark_driver_documents_purged(text[]) to service_role';
  end if;
end;
$$;

-- دوالُّ الشكل يحتاجها المنادي داخل السياسات (تُنفَّذ بحق المالك داخلها)،
-- ونداؤها المباشر لا يسرّب شيئاً: تُرجع boolean أو uuid مشتقاً من وسيطها.
grant execute on function public.driver_doc_path_ok(text)      to anon, authenticated;
grant execute on function public.driver_doc_path_owner(text)   to anon, authenticated;
grant execute on function public.driver_doc_path_driver(text)  to anon, authenticated;
grant execute on function public.driver_doc_upload_allowed(text) to authenticated;

-- ----------------------------------------------------------------------------
-- (٩) الفحص الذاتي — يشهد على **ما كان قائماً** لا على ما أضفناه (D-58)
-- ----------------------------------------------------------------------------

do $$
declare
  v_missing text;
  v_bucket_public boolean;
  v_anon_policies integer;
  v_payload jsonb;
begin
  -- (٩-١) الكائنات الجديدة موجودة
  select string_agg(x.f, '، ') into v_missing
  from (values
    ('public.driver_doc_path_ok(text)'),
    ('public.driver_doc_path_owner(text)'),
    ('public.driver_doc_path_driver(text)'),
    ('public.driver_doc_upload_allowed(text)'),
    ('public.admin_verify_driver_license(uuid,boolean)'),
    ('public.driver_documents_due_for_purge(integer)'),
    ('public.mark_driver_documents_purged(text[])')
  ) as x(f)
  where to_regprocedure(x.f) is null;
  if v_missing is not null then
    raise exception '0120: دوال مفقودة بعد التنفيذ: %', v_missing;
  end if;

  -- (٩-٢) الدلو خاصّ
  select b.public into v_bucket_public from storage.buckets b where b.id = 'driver-docs';
  if v_bucket_public is null then
    raise notice '⚠ 0120: دلو driver-docs غير موجود — أنشئه يدوياً وأعد التنفيذ';
  elsif v_bucket_public then
    raise exception '0120: دلو driver-docs عامّ — وهذا بعينه ما تمنعه هذه الهجرة';
  end if;

  -- (٩-٣) ولا سياسة `anon` واحدة على الدلو
  select count(*) into v_anon_policies
  from pg_policy p
  where p.polrelid = 'storage.objects'::regclass
    and p.polname like 'driver_docs%'
    and exists (select 1 from pg_roles r where r.oid = any(p.polroles) and r.rolname = 'anon');
  if v_anon_policies > 0 then
    raise exception '0120: % سياسة driver_docs تشمل anon — الدلو خاصّ بقرار المالك', v_anon_policies;
  end if;

  -- (٩-٤) شكل المسار يرفض ما رفضته سابقته المقيسة (0093)
  if public.driver_doc_path_ok('https://evil.com/x.jpg')
     or public.driver_doc_path_ok('//cdn/x.jpg')
     or public.driver_doc_path_ok('data:image/png;base64,AAA')
     or public.driver_doc_path_ok('/../../etc/passwd')
     or public.driver_doc_path_ok('receipts/abc/x.jpg') then
    raise exception '0120: driver_doc_path_ok يقبل مساراً كان يجب رفضه';
  end if;
  if not public.driver_doc_path_ok(
       '353b54d2-0f31-4eb9-bd57-7192ccb42fcf/48797867-0c45-44b3-90bd-51a0daf71b08/license-0123456789abcdef.jpg') then
    raise exception '0120: driver_doc_path_ok يرفض مساراً سليماً';
  end if;

  -- (٩-٥) 🔴 **حراسةُ ما كان قائماً**: لا شيء من الرخصة يدخل حمولة البثّ.
  --       الفحص يقرأ التعريف الحيّ لا ملف هجرة (D-58).
  if pg_get_functiondef('public.dispatch_trip_payload(uuid,boolean)'::regprocedure)
       ~* '(license|photo_path|driver_doc)' then
    raise exception '0120: dispatch_trip_payload صارت تذكر الرخصة أو الصورة — النصف العام يبقى نظيفاً (D-56)';
  end if;

  -- (٩-٦) وحمولةُ العميل لا تحمل رخصةً ولا صورة: أعمدة `get_booking_by_token`
  if exists (
    select 1
    from unnest(string_to_array(
           pg_get_function_result('public.get_booking_by_token(text)'::regprocedure), ',')) as col
    where col ~* '(license|photo)'
  ) then
    raise exception '0120: نوع إرجاع get_booking_by_token صار يحمل رخصة أو صورة';
  end if;

  raise notice '✔ 0120: الدلو خاصّ · صفر سياسة anon · شكل المسار يرفض الخمسة المقيسة · حمولتا البثّ والعميل نظيفتان';
end;
$$;
