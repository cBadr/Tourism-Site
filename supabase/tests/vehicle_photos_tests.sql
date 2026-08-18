-- ============================================================================
-- vehicle_photos_tests.sql — اختبارات قبول لصورة المركبة وتفصيل الأسطول (0136)
--
-- كيف تشغّله: `pnpm db:test vehicle_photos`  ·  النجاح = آخر سطر «ALL PASSED».
-- والعقد الملزم: `lib/vehicles/types.ts`.
--
-- ══════════════════════════════════════════════════════════════════════════
--  🔴 درسُ 2026-08-18 المدفوع، وكيف يُطبَّق هنا بندَاً بند
-- ══════════════════════════════════════════════════════════════════════════
--
-- سقطت في ذلك اليوم **تسعةُ توكيدات** لأنها تقيس *محتوى القاعدة* أو *شكلَ
-- الكود* بدل **سلوكه**: سعةَ مركبةٍ يملكها المالك · صفَّ أسعارٍ حذفه المتعهد ·
-- توقيعَ دالةٍ حرفياً · مسافةَ بادئةٍ في جسم دالة · و`order by id desc` و`id`
-- معرّفٌ عشوائيّ. فهذا الملف مبنيٌّ على النقيض:
--
--   ١) **يبني فيكسترته بنفسه** — شريكان وثلاثة حسابات ومركبتان، بمعرّفات ثابتة
--      تبدأ بـ`VPH_TESTS`. ولا يقرأ صفَّ مالكٍ واحداً ولا يعتمد على وجوده.
--   ٢) **لا يثبّت رقماً يملكه المالك**: سعةُ الفئة تُقرأ من `vehicle_classes`
--      **لحظتَها** ويُشتقّ منها المُدخَل (‏`capacity + 1`)، فرفعُ المالك السعةَ
--      من ٦ إلى ٧ لا يُسقط توكيداً واحداً.
--   ٣) **لا `order by` على معرّفٍ عشوائيّ** — الترتيب المقيس هو ترتيب الفئات
--      (‏`vehicle_classes.sort`) وهو الوحيد الذي تَعِد به الدالة.
--   ٤) 🔴 **وكلُّ حارسٍ يُثبَت بالطفرة**: يُلتقط تعريفُه الحيّ بـ
--      `pg_get_functiondef` (‏D-58) ⇒ يُستبدل جسمُه بما يُبطله ⇒ **يجب أن
--      يحمرّ التوكيد** ⇒ ثم يُعاد **حرفياً** بتنفيذ التعريف الملتقَط. وشاهدٌ
--      لا يحمرّ عند نزع حارسه **كاذبٌ وأخطرُ من غيابه** (النمط ٥ و٩).
--
-- ── ⚠ ولماذا الطفرةُ على **الدوال** لا على السياسات ولا المُشغّلات ─────────
--
-- `alter policy` و`drop trigger` يأخذان **AccessExclusiveLock** على الجدول،
-- ويبقى القفل حتى نهاية المعاملة. وهذا الملف يجري **على قاعدة الإنتاج نفسها**
-- داخل معاملةٍ واحدة تُرجَع، فقفلُ `storage.objects` كان سيُجمّد كل قراءةِ
-- تخزينٍ على الموقع الحيّ طوال الجولة. أمّا `create or replace function` فقفلُه
-- على `pg_proc` وحده.
--
-- ولذلك صُمّم كلُّ حارسٍ هنا ليكون **قابلاً للطفرة من دالته**: السياسةُ تنادي
-- `vehicle_photo_path_owner`، والمُشغّلُ جسمُه دالةٌ مستقلة، والقيدُ ينادي
-- `vehicle_photo_path_ok`. فطفرةُ الدالة تنزع الحارس فعلاً بلا لمس الجدول.
--
-- ── وما لا يقيسه هذا الملف، ويُقال صراحةً ────────────────────────────────
--
-- **توليدُ الرابط الموقَّع نفسه** لا يقع في SQL بل في Storage API عبر HTTP.
-- فالمقيس هنا هو **شرطُه الوحيد**: أن يرى دورُ القارئ صفَّ الكائن في
-- `storage.objects` (وهو ما تفعله سياسةُ `select`). والتوقيعُ الحيّ يُثبَت
-- بنداءٍ HTTP خارج هذه المجموعة، ونتيجتُه في تقرير الجبهة.
--
-- ── ولا يلمس هذا الملف بياناً حقيقياً ────────────────────────────────────
--   • كل الفيكسترة بمعرّفات ثابتة `VPH_TESTS…`، وتُمسح بدايةً ونهايةً.
--   • وكلُّ ما يُكتب في `storage.objects` **داخل كتلةٍ راجعةٍ ذاتياً** تنتهي
--     بـ`ROLLBACK_MARKER` — لأن الحذف المباشر من `storage.objects` ممنوع
--     بمُشغّل Supabase‏ `protect_objects_delete`.
--   • وحارسُ تسريبٍ بعد الكتلة يقارن العدّ بما كان — فالنمط لا يُقاس بنيّته.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (٠) الشروط المسبقة + تنظيف بقايا تشغيل سابق
-- ----------------------------------------------------------------------------
do $$
declare
  v_missing text;
begin
  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claims', '', false);

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
    raise exception 'شرط مسبق: دوال مفقودة (نفّذ 0136_vehicle_photos.sql): %', v_missing;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.subcontractor_vehicles'::regclass
      and conname = 'subcontractor_vehicles_photo_path_chk'
  ) then
    raise exception 'شرط مسبق: قيد subcontractor_vehicles_photo_path_chk مفقود — نفّذ 0136';
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.subcontractor_vehicles'::regclass
      and tgname = 'subcontractor_vehicles_photo_guard'
  ) then
    raise exception 'شرط مسبق: مُشغّل subcontractor_vehicles_photo_guard مفقود — نفّذ 0136';
  end if;

  delete from public.subcontractor_vehicles where label like 'VPH_TESTS%';
  delete from public.subcontractors        where company_name like 'VPH_TESTS%';

  raise notice '✔ (٠) الشروط المسبقة سليمة — ست دوال وقيدٌ ومُشغّل';
end;
$$;

-- ----------------------------------------------------------------------------
-- (أ) شكلُ المفتاح — ويُثبَت بالطفرة لا بقراءة نصّه
-- ----------------------------------------------------------------------------
do $$
declare
  v_bad      text;
  v_good     text := 'aaaaaaaa-0000-4000-8000-0000000000a1/eeeeeeee-0000-4000-8000-0000000000e1/photo-0123456789abcdef.jpg';
  v_orig_def text;
  v_now      boolean;
begin
  foreach v_bad in array array[
    'https://evil.com/x.jpg',
    '//cdn.evil.com/x.jpg',
    'data:image/png;base64,AAAA',
    '/../../etc/passwd',
    'receipts/anything/x.jpg',
    'aaaaaaaa-0000-4000-8000-0000000000a1/eeeeeeee-0000-4000-8000-0000000000e1/../escape.jpg',
    -- 🔒 التضييق (١): صنفُ الرخصة لا مكان له في دلو المركبات
    'aaaaaaaa-0000-4000-8000-0000000000a1/eeeeeeee-0000-4000-8000-0000000000e1/license-0123456789abcdef.jpg',
    -- 🔒 التضييق (٢): ولا PDF — لأن `<img src="….pdf">` مربّعٌ فارغٌ أبديّ
    'aaaaaaaa-0000-4000-8000-0000000000a1/eeeeeeee-0000-4000-8000-0000000000e1/photo-0123456789abcdef.pdf',
    'aaaaaaaa-0000-4000-8000-0000000000a1/eeeeeeee-0000-4000-8000-0000000000e1/photo-0123456789abcdef.exe',
    'aaaaaaaa-0000-4000-8000-0000000000a1/photo-0123456789abcdef.jpg',
    'not-a-uuid/eeeeeeee-0000-4000-8000-0000000000e1/photo-0123456789abcdef.jpg',
    ''
  ] loop
    if public.vehicle_photo_path_ok(v_bad) then
      raise exception '(أ) شكل المسار قَبِل «%» وكان يجب رفضه', v_bad;
    end if;
  end loop;

  if public.vehicle_photo_path_ok(null) then
    raise exception '(أ) شكل المسار قَبِل NULL';
  end if;

  -- الشاهد الموجب — بدونه يصير ما سبق «فحصاً لا يمكن أن يفشل» (النمط ٩)
  if not public.vehicle_photo_path_ok(v_good) then
    raise exception '(أ) شكل المسار رفض مساراً سليماً — الفحص كله بلا معنى';
  end if;

  if public.vehicle_photo_path_owner(v_good) <> 'aaaaaaaa-0000-4000-8000-0000000000a1'::uuid then
    raise exception '(أ) vehicle_photo_path_owner لا يُرجع المقطع الأول';
  end if;
  if public.vehicle_photo_path_vehicle(v_good) <> 'eeeeeeee-0000-4000-8000-0000000000e1'::uuid then
    raise exception '(أ) vehicle_photo_path_vehicle لا يُرجع المقطع الثاني';
  end if;
  if public.vehicle_photo_path_owner('https://evil.com/x.jpg') is not null then
    raise exception '(أ) 🔴 مسارٌ مخالف أعطى مالكاً — والسياسة تقارن به';
  end if;

  -- ── 🔴 الطفرة: يُنزع الحارس ⇒ يجب أن يقبل ما كان يرفض ⇒ ثم يُعاد حرفياً ──
  v_orig_def := pg_get_functiondef('public.vehicle_photo_path_ok(text)'::regprocedure);
  begin
    execute $m$
      create or replace function public.vehicle_photo_path_ok(p_name text)
      returns boolean language sql immutable as $mut$ select true $mut$;
    $m$;

    execute 'select public.vehicle_photo_path_ok($1)' into v_now using 'https://evil.com/x.jpg';
    if not v_now then
      raise exception
        '(أ-ط) 🔴 نُزع الحارس ومع ذلك بقي الرابط الخارجي مرفوضاً — أي أن الرفض ليس من هذه الدالة، وكلُّ توكيدات (أ) تخضرّ مجاناً';
    end if;

    execute v_orig_def;
  exception when others then
    -- الاستعادةُ تقع في كل الأحوال، ثم يُعاد رمي السبب كما هو
    begin execute v_orig_def; exception when others then null; end;
    raise;
  end;

  -- وبعد الاستعادة يعود السلوك كما كان — وإلا فالاستعادة لم تقع
  if public.vehicle_photo_path_ok('https://evil.com/x.jpg') then
    raise exception '(أ-ط) 🔴 لم تُستعَد الدالة بعد الطفرة — القاعدة تركت حارساً منزوعاً';
  end if;
  if not public.vehicle_photo_path_ok(v_good) then
    raise exception '(أ-ط) الاستعادة أعادت دالةً تخالف الأصل';
  end if;

  raise notice '✔ (أ) الشكل يرفض اثني عشر نمطاً ويقبل الصالح · والطفرة تُحمّره ثم تُعاد الدالة حرفياً';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ب) الحزامان على الصف: القيدُ يحرس الشكل، والمُشغّلُ يحرس الملكية
--     — والمدخلان لا يفترقان إلا في البتّ الذي يفحصه المُشغّل
-- ----------------------------------------------------------------------------
do $$
declare
  v_sub_a    uuid := 'aaaaaaaa-0000-4000-8000-0000000000a1';
  v_sub_b    uuid := 'bbbbbbbb-0000-4000-8000-0000000000b1';
  v_veh      uuid;
  v_veh2     uuid;
  v_slug     text;
  v_ok       boolean;
  v_orig_def text;
begin
  select c.slug into v_slug from public.vehicle_classes c where c.active order by c.sort limit 1;
  if v_slug is null then
    raise notice '  ↳ (ب) لا فئات مركبات مفعّلة — الفحص متخطّى';
    return;
  end if;

  -- كل كتلةٍ تبني فيكسترتها من الصفر: الملفُّ كلُّه معاملةٌ واحدة، فما تركته
  -- كتلةٌ سابقة يصطدم بمفتاحٍ مكرَّر هنا. والتنظيف في **البداية** كي لا يمنع
  -- انهيارٌ في المنتصف التشغيلَ التالي (اتفاقية §٨).
  delete from public.subcontractor_vehicles where label like 'VPH_TESTS%';
  delete from public.subcontractors        where company_name like 'VPH_TESTS%';

  insert into public.subcontractors (id, profile_id, company_name, phone, status)
  values (v_sub_a, null, 'VPH_TESTS شريك أ', '01000000011', 'approved'),
         (v_sub_b, null, 'VPH_TESTS شريك ب', '01000000012', 'approved');

  insert into public.subcontractor_vehicles (subcontractor_id, class_slug, label)
  values (v_sub_a, v_slug, 'VPH_TESTS مركبة أ') returning id into v_veh;
  insert into public.subcontractor_vehicles (subcontractor_id, class_slug, label)
  values (v_sub_a, v_slug, 'VPH_TESTS مركبة أ٢') returning id into v_veh2;

  -- (ب-١) القيد يرفض رابطاً خارجياً
  v_ok := false;
  begin
    update public.subcontractor_vehicles set photo_path = 'https://evil.com/x.jpg' where id = v_veh;
  exception when others then v_ok := true;
  end;
  if not v_ok then
    raise exception '(ب-١) 🔴 رابط خارجي مرّ في photo_path — صفر طلبات خارجية مكسورة';
  end if;

  -- (ب-٢) والقيد يرفض صنف الرخصة و PDF في دلو المركبات
  v_ok := false;
  begin
    update public.subcontractor_vehicles
       set photo_path = v_sub_a::text || '/' || v_veh::text || '/license-0123456789abcdef.jpg'
     where id = v_veh;
  exception when others then v_ok := true;
  end;
  if not v_ok then
    raise exception '(ب-٢) 🔴 مسارُ رخصةٍ قُبل في عمود صورة المركبة';
  end if;

  v_ok := false;
  begin
    update public.subcontractor_vehicles
       set photo_path = v_sub_a::text || '/' || v_veh::text || '/photo-0123456789abcdef.pdf'
     where id = v_veh;
  exception when others then v_ok := true;
  end;
  if not v_ok then
    raise exception '(ب-٣) 🔴 مسارُ PDF قُبل — و`<img>` لا يصيّره أبداً فيصير مربّعاً فارغاً دائماً';
  end if;

  -- (ب-٤) 🔴 **المدخلان اللذان لا يفترقان إلا في الملكية**: كلاهما يمرّ من
  --       القيد تماماً، فالرفضُ التالي لا يمكن أن يأتي إلا من المُشغّل.
  v_ok := false;
  begin
    update public.subcontractor_vehicles
       set photo_path = v_sub_b::text || '/' || v_veh::text || '/photo-0123456789abcdef.jpg'
     where id = v_veh;
  exception when others then v_ok := true;
  end;
  if not v_ok then
    raise exception '(ب-٤) 🔴 مسارٌ تحت مجلّد شريكٍ آخر قُبل — الملف لا يُربط بمالكه';
  end if;

  v_ok := false;
  begin
    update public.subcontractor_vehicles
       set photo_path = v_sub_a::text || '/' || v_veh2::text || '/photo-0123456789abcdef.jpg'
     where id = v_veh;
  exception when others then v_ok := true;
  end;
  if not v_ok then
    raise exception '(ب-٥) 🔴 مسارٌ يخصّ مركبةً أخرى قُبل';
  end if;

  -- (ب-٦) الشاهد الموجب: المسار الصحيح يمرّ
  update public.subcontractor_vehicles
     set photo_path = v_sub_a::text || '/' || v_veh::text || '/photo-0123456789abcdef.jpg'
   where id = v_veh;
  if (select photo_path from public.subcontractor_vehicles where id = v_veh) is null then
    raise exception '(ب-٦) المسار الصحيح لم يُكتب — الحزامان يرفضان كل شيء';
  end if;

  -- ── 🔴 الطفرة على المُشغّل، من دالته لا بحذفه (‏لا قفل على الجدول) ───────
  v_orig_def := pg_get_functiondef('public.subcontractor_vehicles_photo_guard()'::regprocedure);
  begin
    execute $m$
      create or replace function public.subcontractor_vehicles_photo_guard()
      returns trigger language plpgsql as $mut$ begin return new; end; $mut$;
    $m$;

    v_ok := false;
    begin
      update public.subcontractor_vehicles
         set photo_path = v_sub_b::text || '/' || v_veh::text || '/photo-0123456789abcdef.jpg'
       where id = v_veh;
      v_ok := true;
    exception when others then v_ok := false;
    end;

    if not v_ok then
      raise exception
        '(ب-ط) 🔴 نُزع المُشغّل ومع ذلك بقي مسارُ الشريك الآخر مرفوضاً — أي أن الرفض في (ب-٤) و(ب-٥) ليس منه، والتوكيدان يخضرّان مجاناً';
    end if;

    execute v_orig_def;
  exception when others then
    begin execute v_orig_def; exception when others then null; end;
    raise;
  end;

  -- وبعد الاستعادة يعود الرفض — وإلا فالحارس لم يُعَد
  v_ok := false;
  begin
    update public.subcontractor_vehicles
       set photo_path = v_sub_b::text || '/' || v_veh::text || '/photo-0123456789abcdef.jpg'
     where id = v_veh;
  exception when others then v_ok := true;
  end;
  if not v_ok then
    raise exception '(ب-ط) 🔴 لم يُستعَد المُشغّل بعد الطفرة — القاعدة تركت حارساً منزوعاً';
  end if;

  raise notice '✔ (ب) القيد يرفض الرابط والرخصة والـPDF · والمُشغّل يرفض مالكاً ومركبةً خطأ · والطفرة تُحمّره ثم يُعاد حرفياً';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ج) 🔴 مصفوفةُ الوصول بأربعة أدوار حقيقية · (د) شرطُ الرفع · (هـ) السقف
--
-- كلُّها في كتلةٍ واحدة **راجعةٍ ذاتياً**، لأنها تكتب في `storage.objects`
-- والحذف المباشر منه ممنوع بمُشغّل Supabase.
-- ----------------------------------------------------------------------------
do $$
declare
  v_uid_a    uuid := '77777777-7777-4777-8777-777777777771';
  v_uid_b    uuid := '77777777-7777-4777-8777-777777777772';
  v_uid_adm  uuid := '77777777-7777-4777-8777-777777777773';
  v_sub_a    uuid := 'aaaaaaaa-0000-4000-8000-0000000000a1';
  v_sub_b    uuid := 'bbbbbbbb-0000-4000-8000-0000000000b1';
  v_veh_a    uuid := 'eeeeeeee-0000-4000-8000-0000000000e1';
  v_veh_b    uuid := 'ffffffff-0000-4000-8000-0000000000f1';
  v_slug     text;
  v_path_a   text;
  v_path_b   text;
  v_n        integer;
  v_i        integer;
  v_ok       boolean;
  v_before   bigint;
  v_orig_def text;
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated')
     or not exists (select 1 from pg_roles where rolname = 'anon') then
    raise notice '  ↳ (ج) لا أدوار المتصفح — الفحص متخطّى';
    return;
  end if;

  select c.slug into v_slug from public.vehicle_classes c where c.active order by c.sort limit 1;
  if v_slug is null then
    raise notice '  ↳ (ج) لا فئات مركبات مفعّلة — الفحص متخطّى';
    return;
  end if;

  v_path_a := v_sub_a || '/' || v_veh_a || '/photo-00000000000000a1.jpg';
  v_path_b := v_sub_b || '/' || v_veh_b || '/photo-00000000000000b1.jpg';

  select count(*) into v_before from storage.objects where bucket_id = 'vehicle-photos';

  -- ── بداية الكتلة الراجعة ذاتياً ──────────────────────────────────────────
  begin

  -- كل كتلةٍ تبني فيكسترتها من الصفر: الملفُّ كلُّه معاملةٌ واحدة، فما تركته
  -- كتلةٌ سابقة يصطدم بمفتاحٍ مكرَّر هنا. والتنظيف في **البداية** كي لا يمنع
  -- انهيارٌ في المنتصف التشغيلَ التالي (اتفاقية §٨).
  delete from public.subcontractor_vehicles where label like 'VPH_TESTS%';
  delete from public.subcontractors        where company_name like 'VPH_TESTS%';

  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                          created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  values
    (v_uid_a,   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'vph-a@tests.invalid',   '', now(), now(), '{}'::jsonb, '{}'::jsonb),
    (v_uid_b,   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'vph-b@tests.invalid',   '', now(), now(), '{}'::jsonb, '{}'::jsonb),
    (v_uid_adm, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'vph-adm@tests.invalid', '', now(), now(), '{}'::jsonb, '{}'::jsonb);

  insert into public.profiles (id, role) values (v_uid_a, 'subcontractor')
    on conflict (id) do update set role = 'subcontractor';
  insert into public.profiles (id, role) values (v_uid_b, 'subcontractor')
    on conflict (id) do update set role = 'subcontractor';
  insert into public.profiles (id, role) values (v_uid_adm, 'admin')
    on conflict (id) do update set role = 'admin';

  insert into public.subcontractors (id, profile_id, company_name, phone, status)
  values (v_sub_a, v_uid_a, 'VPH_TESTS شريك أ', '01000000011', 'approved'),
         (v_sub_b, v_uid_b, 'VPH_TESTS شريك ب', '01000000012', 'approved');

  insert into public.subcontractor_vehicles (id, subcontractor_id, class_slug, label)
  values (v_veh_a, v_sub_a, v_slug, 'VPH_TESTS مركبة أ'),
         (v_veh_b, v_sub_b, v_slug, 'VPH_TESTS مركبة ب');

  update public.subcontractor_vehicles set photo_path = v_path_a where id = v_veh_a;
  update public.subcontractor_vehicles set photo_path = v_path_b where id = v_veh_b;

  insert into storage.objects (bucket_id, name) values ('vehicle-photos', v_path_a);
  insert into storage.objects (bucket_id, name) values ('vehicle-photos', v_path_b);

  -- ── (ج) مصفوفة الوصول ───────────────────────────────────────────────────

  -- (ج-١) الشريك أ يرى ملفّه هو — الضابط الموجب، وبدونه ما بعده بلا معنى
  perform set_config('request.jwt.claim.sub', v_uid_a::text, true);
  set local role authenticated;
  select count(*) into v_n from storage.objects
   where bucket_id = 'vehicle-photos' and name = v_path_a;
  if v_n <> 1 then
    reset role;
    raise exception '(ج-١) الشريك أ لا يرى صورة مركبته هو (%) — السياسة أضيق مما يجب', v_n;
  end if;

  -- (ج-٢) 🔴 ولا يرى صورة مركبة الشريك ب — وهذا هو الحاجز كلّه (D-19 · D-20)
  select count(*) into v_n from storage.objects
   where bucket_id = 'vehicle-photos' and name = v_path_b;
  if v_n <> 0 then
    reset role;
    raise exception '(ج-٢) 🔴 الشريك أ يرى صورة مركبة الشريك ب — سياسةٌ كُتبت لـauthenticated لا لمالك';
  end if;
  reset role;

  -- (ج-٣) والعكس بالعكس
  perform set_config('request.jwt.claim.sub', v_uid_b::text, true);
  set local role authenticated;
  select count(*) into v_n from storage.objects
   where bucket_id = 'vehicle-photos' and name in (v_path_a, v_path_b);
  if v_n <> 1 then
    reset role;
    raise exception '(ج-٣) 🔴 الشريك ب يرى % ملفاً بدل ملفّه وحده', v_n;
  end if;
  reset role;

  -- (ج-٤) الزائر المجهول لا يرى شيئاً — ولا سياسة `anon` على هذا الدلو أصلاً
  perform set_config('request.jwt.claim.sub', '', true);
  set local role anon;
  select count(*) into v_n from storage.objects
   where bucket_id = 'vehicle-photos' and name in (v_path_a, v_path_b);
  if v_n <> 0 then
    reset role;
    raise exception '(ج-٤) 🔴 الزائر يرى % من صور المركبات', v_n;
  end if;
  reset role;

  -- (ج-٥) واللوحة ترى الاثنين
  perform set_config('request.jwt.claim.sub', v_uid_adm::text, true);
  set local role authenticated;
  select count(*) into v_n from storage.objects
   where bucket_id = 'vehicle-photos' and name in (v_path_a, v_path_b);
  if v_n <> 2 then
    reset role;
    raise exception '(ج-٥) اللوحة ترى % بدل ملفَّين — والمشرف يرى أسطول كل شريك', v_n;
  end if;
  reset role;

  -- ── 🔴 (ج-ط) طفرةُ العزل — من دالة السياسة لا من السياسة (لا قفل جدول) ──
  --
  -- السياسة تنادي `vehicle_photo_path_owner(name)`. فجعلُها تُرجع «صاحب الجلسة»
  -- دائماً يُبطل العزل تماماً بلا لمس `storage.objects`. ولو بقي (ج-٢) أخضر
  -- بعدها لكان معناه أن الصفر هناك جاء من شيءٍ آخر — لا من العزل.
  v_orig_def := pg_get_functiondef('public.vehicle_photo_path_owner(text)'::regprocedure);
  begin
    execute $m$
      create or replace function public.vehicle_photo_path_owner(p_name text)
      returns uuid language sql stable as $mut$ select public.current_subcontractor_id() $mut$;
    $m$;

    perform set_config('request.jwt.claim.sub', v_uid_a::text, true);
    set local role authenticated;
    -- `execute` بقصد: يُجبر تخطيطاً جديداً بعد استبدال دالةٍ كانت تُدمَج في الخطة
    execute 'select count(*) from storage.objects where bucket_id = ''vehicle-photos'' and name = $1'
      into v_n using v_path_b;
    reset role;

    if v_n <> 1 then
      raise exception
        '(ج-ط) 🔴 نُزع العزل ومع ذلك لم يرَ الشريك أ ملفَّ ب (%) — أي أن الصفر في (ج-٢) ليس من هذه السياسة، والتوكيد يخضرّ مجاناً', v_n;
    end if;

    execute v_orig_def;
  exception when others then
    begin execute 'reset role'; exception when others then null; end;
    begin execute v_orig_def; exception when others then null; end;
    raise;
  end;

  -- وبعد الاستعادة يعود العزل
  perform set_config('request.jwt.claim.sub', v_uid_a::text, true);
  set local role authenticated;
  execute 'select count(*) from storage.objects where bucket_id = ''vehicle-photos'' and name = $1'
    into v_n using v_path_b;
  reset role;
  if v_n <> 0 then
    raise exception '(ج-ط) 🔴 لم تُستعَد دالة المالك بعد الطفرة — العزل ما زال منزوعاً';
  end if;

  -- ── (د) شرط الرفع: شريكٌ لا يكتب في مجلّد شريك ─────────────────────────

  perform set_config('request.jwt.claim.sub', v_uid_a::text, true);
  set local role authenticated;

  if not public.vehicle_photo_upload_allowed(
       v_sub_a || '/' || v_veh_a || '/photo-00000000000000a2.jpg') then
    reset role;
    raise exception '(د-١) الشريك أ مُنع من الرفع لمركبته — الفحص التالي بلا معنى';
  end if;

  if public.vehicle_photo_upload_allowed(
       v_sub_b || '/' || v_veh_b || '/photo-00000000000000b2.jpg') then
    reset role;
    raise exception '(د-٢) 🔴 الشريك أ يرفع في مجلّد الشريك ب';
  end if;

  -- ومسارٌ يدّعي مجلّد أ لمركبةٍ ليست له
  if public.vehicle_photo_upload_allowed(
       v_sub_a || '/' || v_veh_b || '/photo-00000000000000b3.jpg') then
    reset role;
    raise exception '(د-٣) 🔴 رفعٌ لمركبةٍ لا يملكها الرافع';
  end if;
  reset role;

  -- (د-٤) والزائر لا يرفع شيئاً — `current_subcontractor_id()` تُرجع NULL له
  perform set_config('request.jwt.claim.sub', '', true);
  set local role anon;
  v_ok := true;
  begin
    if public.vehicle_photo_upload_allowed(
         v_sub_a || '/' || v_veh_a || '/photo-00000000000000a3.jpg') then
      v_ok := false;
    end if;
  exception when others then
    -- سحبُ التنفيذ عن `anon` يرمي «permission denied» — وهو منعٌ أقوى لا أضعف
    v_ok := true;
  end;
  reset role;
  if not v_ok then
    raise exception '(د-٤) 🔴 الزائر المجهول مسموحٌ له بالرفع في دلو المركبات';
  end if;

  -- ── (هـ) سقفُ ستة ملفات لكل مركبة — بضابطٍ موجبٍ قبل السالب ────────────
  --
  -- والعدُّ يبدأ من الواقع لا من الصفر: مجلّد المركبة «ب» يحمل سلفاً صورتَها من
  -- التهيئة. فيُملأ إلى خمسةٍ بالطرح، كي يبقى الضابط الموجب قابلاً للقياس.
  perform set_config('request.jwt.claim.sub', v_uid_b::text, true);

  select count(*) into v_n
    from storage.objects o
   where o.bucket_id = 'vehicle-photos'
     and split_part(o.name, '/', 1) = v_sub_b::text
     and split_part(o.name, '/', 2) = v_veh_b::text;
  if v_n >= 5 then
    raise exception
      '(هـ) التهيئة تركت % ملفاً في مجلّد المركبة ب — والسقف ستة، فلا مساحة للضابط الموجب. عدِّل التهيئة لا التأكيد', v_n;
  end if;

  -- 🔒 والاسم يُبنى بـ`lpad(to_hex(...), 16, '0')` بنيوياً لا بعدّ الأصفار
  --    بالعين: النمط يشترط ١٦ خانة hex على الأقل، وخانةٌ ناقصة كانت ستجعل
  --    الرفض «لفساد المسار» لا «للسقف» — وهو عيبٌ مقيسٌ في مجموعة السائقين.
  for v_i in 1 .. (5 - v_n) loop
    insert into storage.objects (bucket_id, name)
    values ('vehicle-photos',
            v_sub_b || '/' || v_veh_b || '/photo-' || lpad(to_hex(v_i), 16, '0') || '.jpg');
  end loop;

  set local role authenticated;
  if not public.vehicle_photo_upload_allowed(
       v_sub_b || '/' || v_veh_b || '/photo-' || lpad(to_hex(6), 16, '0') || '.jpg') then
    reset role;
    raise exception
      '(هـ-١) 🔴 الرفع مرفوضٌ وفي المجلّد خمسة ملفات والسقف ستة — أي أن الرفض لسببٍ آخر (مسارٌ أو ملكيةٌ أو دور)، والتأكيد التالي سيخضرّ مجاناً';
  end if;
  reset role;

  insert into storage.objects (bucket_id, name)
  values ('vehicle-photos',
          v_sub_b || '/' || v_veh_b || '/photo-' || lpad(to_hex(6), 16, '0') || '.jpg');

  set local role authenticated;
  if public.vehicle_photo_upload_allowed(
       v_sub_b || '/' || v_veh_b || '/photo-' || lpad(to_hex(7), 16, '0') || '.jpg') then
    reset role;
    raise exception '(هـ-٢) سقف الملفات لكل مركبة غير مفروض — الدلو قابل للإغراق';
  end if;
  reset role;
  perform set_config('request.jwt.claim.sub', '', true);

  raise notice '✔ (ج) المصفوفة بأربعة أدوار وطفرةٌ تنزع العزل · (د) لا رفع في مجلّد الغير ولا للزائر · (هـ) السقف مفروضٌ بضابطٍ موجبٍ قبله';

  raise exception 'ROLLBACK_MARKER';
exception
  when others then
    begin execute 'reset role'; exception when others then null; end;
    if sqlerrm <> 'ROLLBACK_MARKER' then raise; end if;
  end;
  -- ── نهاية الكتلة الراجعة ذاتياً ──────────────────────────────────────────

  -- 🔴 حارس التسريب: العدّ عاد إلى ما كان بالضبط
  select count(*) into v_n from storage.objects where bucket_id = 'vehicle-photos';
  if v_n <> v_before then
    raise exception
      '(ج-تسريب) 🔴 تسريب في storage.objects: كان % كائناً في vehicle-photos وصار % — الكتلة الراجعة لم ترجع',
      v_before, v_n;
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- (و) تفصيلُ الأسطول لكل فئة — **والصفرُ يُقال**
--
-- 🔴 ولا رقمَ محفورٌ هنا يملكه المالك: سعةُ الفئة تُقرأ **لحظتَها** ويُشتقّ
-- منها المُدخَل. فلو رفع المالك سعة `suv` من ٦ إلى ٧ غداً لم يسقط توكيدٌ واحد
-- — وهو بعينه ما أسقط توكيدات 2026-08-18.
-- ----------------------------------------------------------------------------
do $$
declare
  v_uid_b    uuid := '77777777-7777-4777-8777-777777777772';
  v_sub_a    uuid := 'aaaaaaaa-0000-4000-8000-0000000000a1';
  v_sub_b    uuid := 'bbbbbbbb-0000-4000-8000-0000000000b1';
  v_slug     text;
  v_other    text;
  v_cap      integer;
  v_active_classes integer;
  v_rows     integer;
  v_r        record;
  v_n        integer;
begin
  select count(*) into v_active_classes from public.vehicle_classes where active;
  if v_active_classes < 2 then
    raise notice '  ↳ (و) أقل من فئتين مفعّلتين — الفحص متخطّى';
    return;
  end if;

  select c.slug, c.capacity into v_slug, v_cap
    from public.vehicle_classes c where c.active order by c.sort limit 1;
  select c.slug into v_other
    from public.vehicle_classes c where c.active and c.slug <> v_slug order by c.sort limit 1;

  -- كل كتلةٍ تبني فيكسترتها من الصفر: الملفُّ كلُّه معاملةٌ واحدة، فما تركته
  -- كتلةٌ سابقة يصطدم بمفتاحٍ مكرَّر هنا. والتنظيف في **البداية** كي لا يمنع
  -- انهيارٌ في المنتصف التشغيلَ التالي (اتفاقية §٨).
  delete from public.subcontractor_vehicles where label like 'VPH_TESTS%';
  delete from public.subcontractors        where company_name like 'VPH_TESTS%';

  insert into public.subcontractors (id, profile_id, company_name, phone, status)
  values (v_sub_a, null, 'VPH_TESTS شريك أ', '01000000011', 'approved'),
         (v_sub_b, null, 'VPH_TESTS شريك ب', '01000000012', 'approved');

  -- مركبتان في الفئة الأولى: واحدةٌ نشطة بصورةٍ ومقاعدَ مطابقة، وأخرى متوقفة
  -- بلا صورة ومقاعدُها **تخالف السعة عمداً** (‏السعة + ١، مشتقّةٌ لا محفورة)
  insert into public.subcontractor_vehicles (subcontractor_id, class_slug, label, seats, active)
  values (v_sub_a, v_slug, 'VPH_TESTS مطابقة', v_cap, true),
         (v_sub_a, v_slug, 'VPH_TESTS مخالفة', coalesce(v_cap, 0) + 1, false);

  update public.subcontractor_vehicles v
     set photo_path = v_sub_a::text || '/' || v.id::text || '/photo-0123456789abcdef.jpg'
   where v.subcontractor_id = v_sub_a and v.label = 'VPH_TESTS مطابقة';

  -- (و-١) صفٌّ لكل فئةٍ نشطة على الأقل — والفئةُ الفارغة **لها سطرٌ بصفر**
  select count(*) into v_rows from public.subcontractor_fleet_breakdown(v_sub_a);
  if v_rows < v_active_classes then
    raise exception
      '(و-١) 🔴 التفصيل أرجع % صفاً و«الفئات النشطة» % — أي أن الفئة التي لا مركبة فيها اختفت، والمشرف يقرأ غيابها «لم يُرسم» لا «لا يملك»',
      v_rows, v_active_classes;
  end if;

  select * into v_r from public.subcontractor_fleet_breakdown(v_sub_a) b
   where b.class_slug = v_other;
  if v_r.class_slug is null then
    raise exception '(و-٢) 🔴 الفئة الفارغة «%» غائبةٌ من التفصيل — الصفر لا يُقال', v_other;
  end if;
  if v_r.vehicles_total <> 0 or v_r.vehicles_active <> 0 or v_r.vehicles_with_photo <> 0 then
    raise exception '(و-٢) الفئة الفارغة «%» أعطت أعداداً غير صفرية', v_other;
  end if;

  -- (و-٣) والفئة المأهولة: عددٌ ونشطٌ وصورةٌ — الضابط الموجب
  select * into v_r from public.subcontractor_fleet_breakdown(v_sub_a) b
   where b.class_slug = v_slug;
  if v_r.vehicles_total <> 2 then
    raise exception '(و-٣) عدد مركبات الفئة % لا اثنتان', v_r.vehicles_total;
  end if;
  if v_r.vehicles_active <> 1 then
    raise exception '(و-٣) النشط من الفئة % لا واحدة — المتوقفة تُحتسب نشطة', v_r.vehicles_active;
  end if;
  if v_r.vehicles_with_photo <> 1 then
    raise exception '(و-٣) ما له صورة % لا واحدة', v_r.vehicles_with_photo;
  end if;

  -- (و-٤) ومخالفةُ المقاعد للسعة تُعدّ ولا تُبتلع — والمُدخَل مشتقٌّ من السعة
  --       الحيّة، فلا يسقط التوكيد إن غيّرها المالك.
  if v_cap is not null then
    if v_r.seats_mismatch <> 1 then
      raise exception
        '(و-٤) 🔴 مركبةٌ مقاعدُها % وسعةُ فئتها % ولم تُعدّ مخالفةً (العدّ %) — فالمشرف لا يرى تبايناً يقرّر فيه',
        coalesce(v_cap, 0) + 1, v_cap, v_r.seats_mismatch;
    end if;
    if v_r.seats_max <> coalesce(v_cap, 0) + 1 or v_r.seats_min <> v_cap then
      raise exception '(و-٤) مدى المقاعد (%..%) لا يطابق ما أُدخل', v_r.seats_min, v_r.seats_max;
    end if;
  end if;

  -- (و-٥) 🔴 والعزل: شريكٌ ينادي بمعرّف منافسه يُرجَع له صفرٌ في كل فئة.
  --       و`security invoker` هي ما يفعل ذلك — لا سطر `if` في الواجهة.
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    perform set_config('request.jwt.claim.sub', v_uid_b::text, true);
    set local role authenticated;
    select coalesce(sum(b.vehicles_total), 0) into v_n
      from public.subcontractor_fleet_breakdown(v_sub_a) b;
    reset role;
    perform set_config('request.jwt.claim.sub', '', true);
    if v_n <> 0 then
      raise exception
        '(و-٥) 🔴 الشريك ب قرأ % مركبةً من أسطول الشريك أ — الدالة تتجاوز RLS (definer؟) وهي كشفٌ بالمنافسين (D-19 · D-20)', v_n;
    end if;
  end if;

  raise notice '✔ (و) الصفر يُقال لكل فئةٍ فارغة · والأعداد والصور والمقاعد مقيسة · ومخالفةُ السعة تُعدّ · والعزل قائم';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ز) البنية: الدلو خاصّ · أربع سياسات · ولا `anon` · وكلٌّ مقيَّدةٌ بمالك
-- ----------------------------------------------------------------------------
do $$
declare
  v_n      integer;
  v_public boolean;
  v_bad    text;
begin
  select b.public into v_public from storage.buckets b where b.id = 'vehicle-photos';
  if v_public is null then
    raise exception '(ز-١) دلو vehicle-photos غير موجود — نفّذ 0136';
  end if;
  if v_public then
    raise exception '(ز-١) 🔴 دلو vehicle-photos عامّ — أي أحد يقرأ صورة أي شريك بالمسار';
  end if;

  select count(*) into v_n from pg_policies p
   where p.schemaname = 'storage' and p.tablename = 'objects'
     and p.policyname like 'vehicle_photos%';
  if v_n <> 4 then
    raise exception '(ز-٢) سياسات الدلو % لا أربع', v_n;
  end if;

  select count(*) into v_n from pg_policies p
   where p.schemaname = 'storage' and p.tablename = 'objects'
     and p.policyname like 'vehicle_photos%' and 'anon' = any (p.roles);
  if v_n > 0 then
    raise exception '(ز-٣) 🔴 % سياسة تشمل anon على دلو صور المركبات', v_n;
  end if;

  -- وكلُّ سياسةٍ تذكر المالك أو `is_admin` — سياسةٌ بلا قيدٍ تعني «كل شريك يرى الكل»
  select string_agg(p.policyname, '، ') into v_bad
    from pg_policies p
   where p.schemaname = 'storage' and p.tablename = 'objects'
     and p.policyname like 'vehicle_photos%'
     and coalesce(p.qual, '') || coalesce(p.with_check, '')
         !~ '(vehicle_photo_path_owner|vehicle_photo_upload_allowed)';
  if v_bad is not null then
    raise exception '(ز-٤) 🔴 سياسةٌ بلا قيدِ ملكية على دلو المركبات: %', v_bad;
  end if;

  -- والتفصيل محجوبٌ عن الزائر: زائرٌ لا يعرف أسطول شريكٍ ولو بالعدد
  if has_function_privilege('anon', 'public.subcontractor_fleet_breakdown(uuid)', 'EXECUTE') then
    raise exception '(ز-٥) 🔴 anon ينفّذ subcontractor_fleet_breakdown';
  end if;
  if has_function_privilege('anon', 'public.vehicle_photo_upload_allowed(text)', 'EXECUTE') then
    raise exception '(ز-٦) 🔴 anon ينفّذ vehicle_photo_upload_allowed';
  end if;

  raise notice '✔ (ز) الدلو خاصّ · أربع سياسات كلّها مقيَّدة بمالك · ولا anon على السياسات ولا على الدالتين';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ح) 🔴 الحدّ الذي لا يُتجاوز: صورةُ المركبة **لا تصل العميل ولا البثّ**
--     — مقروءاً من الكتالوج الحيّ لا من ملف هجرة (D-58)
-- ----------------------------------------------------------------------------
do $$
begin
  if pg_get_functiondef('public.get_booking_by_token(text)'::regprocedure) ~* 'photo_path' then
    raise exception
      '(ح-١) 🔴 get_booking_by_token صارت تقرأ photo_path — وصورةُ المركبة داخليّة: الاتفاقية (0113 بند ١١) تَعِد ببيانات المركبة للعميل لا بصورتها (D-19)';
  end if;

  if exists (
    select 1
    from unnest(string_to_array(
           pg_get_function_result('public.get_booking_by_token(text)'::regprocedure), ',')) as col
    where col ~* 'photo'
  ) then
    raise exception '(ح-٢) 🔴 نوع إرجاع get_booking_by_token صار يحمل صورة';
  end if;

  if pg_get_functiondef('public.dispatch_trip_payload(uuid,boolean)'::regprocedure)
       ~* '(photo_path|vehicle_photo)' then
    raise exception '(ح-٣) 🔴 حمولة البثّ صارت تذكر صورة — والنصف العام يبقى نظيفاً (D-56)';
  end if;

  raise notice '✔ (ح) حمولتا العميل والبثّ نظيفتان من صورة المركبة — مقروءتين من الكتالوج الحيّ';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ط) التنظيف النهائي — زائدٌ لا ضارّ (المُشغّل يلفّ الملف كلَّه بـROLLBACK)
-- ----------------------------------------------------------------------------
do $$
begin
  delete from public.subcontractor_vehicles where label like 'VPH_TESTS%';
  delete from public.subcontractors        where company_name like 'VPH_TESTS%';
  raise notice '✔ (ط) نُظِّفت الفيكسترة';
end;
$$;

do $$
begin
  raise notice 'ALL PASSED — vehicle_photos_tests';
end;
$$;
