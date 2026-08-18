-- ============================================================================
-- presence_tests.sql — ظهور المتعهد وبحث المسارات (هجرة 0118)
--
-- كيف تشغّله:
--   node scripts/db-test.mjs presence
--   أو من psql:  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/presence_tests.sql
-- النجاح = آخر سطر «ALL PASSED». وأي فشل exception عربية فيها المتوقع والفعلي.
--
-- 🔴 **كل حاجزٍ هنا يُقاس بنداءٍ حيٍّ بدور المستخدم لا بقراءة نصّ** — القاعدة ١٩:
--    تدقيقٌ سابق أعلن «٤١ دالة بلا حارس» وكلها محروسة، لأنه طابق نصوصاً. فما
--    يخصّ المتعهد هنا يجري داخل `set local role authenticated` بهوية حقيقية،
--    وما يخصّ المشرف بهوية مشرف. واختبارٌ يجري بصلاحيات مالك القاعدة يثبت أن
--    الشيفرة تعمل ولا يثبت أن الحاجز قائم (**D-20**).
--
-- 🔒 **ولا يلمس هذا الملف صفاً حقيقياً واحداً**: لا متعهد المالك (حمزة الغمري)
--    ولا قوائم أسعاره ولا حجوزاته ولا سجل إشعاراته. كل صفوفه بمعرّفات ثابتة
--    تبدأ بـ`55ee7118`، وأسماء شركاته موسومة `PRESENCE_TESTS`، والتنظيف في
--    البداية والنهاية معاً (فتشغيلٌ منهارٌ في المنتصف لا يمنع التالي).
--    وكل ما يكتبه يُرجَع أصلاً: `scripts/db-test.mjs` يلفّ كل ملف بـ
--    `BEGIN … ROLLBACK` بلا استثناء.
--
-- الأقسام:
--   (أ) الشروط المسبقة — 0117 و0118 مطبَّقتان
--   (ب) التنظيف والتركيب: متعهدان بهويتين حقيقيتين + مشرف + مساراتٌ عربية
--   (ج) النبضة: تُنشئ، ثم **لا تكتب** داخل الدقيقة، ثم تكتب بعدها
--   (د) بلا وسيط ⇒ لا يكتب أحدٌ ظهور غيره، وغيرُ المتعهد لا يكتب شيئاً
--   (هـ) الجدول بلا منحةٍ لأي دور مستخدم — والقراءة المباشرة تُرفض حياً
--   (و) admin_partner_presence: للمشرف صفوف، وللمتعهد صفر — والتفويض قائم
--   (ز) الحالات الثلاث: متصل · آخر ظهور منذ · لم يدخل قط (‏null ≠ صفر)
--   (ح) البحث العربي: الهمزة والتاء المربوطة والبادئة والالتصاق ومحارف LIKE
--   (ط) 🔴 البحث لا يسرّب تكلفة متعهدٍ إلى متعهد (D-19)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (أ) الشروط المسبقة
-- ----------------------------------------------------------------------------
do $$
declare
  v_missing text;
begin
  select string_agg(x.sig, '، ') into v_missing
  from (values
    ('public.arabic_search_key(text)'),
    ('public.normalize_arabic(text)'),
    ('public.touch_partner_presence()'),
    ('public.admin_partner_presence()'),
    ('public.admin_partner_availability()'),
    ('public.admin_search_routes(text, uuid, text, integer, integer)')
  ) as x(sig)
  where to_regprocedure(x.sig) is null;

  if v_missing is not null then
    raise exception 'شرط مسبق: دوال مفقودة (نفّذ 0117 ثم 0118): %', v_missing;
  end if;

  if to_regclass('public.partner_presence') is null then
    raise exception 'شرط مسبق: جدول partner_presence مفقود — نفّذ 0118';
  end if;

  raise notice '✔ (أ) الشروط المسبقة: الجدول والدوال الستّ موجودة';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ب-١) التنظيف الأولي
-- ----------------------------------------------------------------------------
delete from public.price_list_items pli
 where pli.price_list_id in (
   select pl.id from public.price_lists pl
   join public.subcontractors s on s.id = pl.subcontractor_id
   where s.company_name like 'PRESENCE_TESTS%');
delete from public.price_lists pl
 where pl.subcontractor_id in (
   select s.id from public.subcontractors s where s.company_name like 'PRESENCE_TESTS%');
delete from public.partner_presence pp
 where pp.subcontractor_id in (
   select s.id from public.subcontractors s where s.company_name like 'PRESENCE_TESTS%');
delete from public.subcontractors s where s.company_name like 'PRESENCE_TESTS%';
delete from public.profiles p
 where p.id in ('55ee7118-0002-4000-8000-00000000000a'::uuid,
                '55ee7118-0002-4000-8000-00000000000b'::uuid,
                '55ee7118-0002-4000-8000-0000000000ad'::uuid);
do $$
begin
  delete from auth.users u
   where u.id in ('55ee7118-0002-4000-8000-00000000000a'::uuid,
                  '55ee7118-0002-4000-8000-00000000000b'::uuid,
                  '55ee7118-0002-4000-8000-0000000000ad'::uuid);
exception when others then null;
end;
$$;

-- ----------------------------------------------------------------------------
-- (ب-٢) التركيب — متعهدان بهويتي دخول حقيقيتين، ومشرف، ومساراتٌ عربية
-- ----------------------------------------------------------------------------
--
-- ⚠ عناوين المسارات مكتوبةٌ **كما يكتبها متعهدٌ حقيقي**: «الأسكندرية» بهمزةٍ على
--   الألف في العنوان و«الإسكندرية» بهمزةٍ تحتها في اسم النقطة — وهو بعينه شكل
--   صفّ المالك على القاعدة الحيّة. فالمجموعة تقيس شكواه لا حالةً مصطنعة.
do $$
declare
  v_a    constant uuid := '55ee7118-0000-4000-8000-00000000000a';
  v_b    constant uuid := '55ee7118-0000-4000-8000-00000000000b';
  v_pa   constant uuid := '55ee7118-0002-4000-8000-00000000000a';
  v_pb   constant uuid := '55ee7118-0002-4000-8000-00000000000b';
  v_padm constant uuid := '55ee7118-0002-4000-8000-0000000000ad';
  v_r1   constant uuid := '55ee7118-0003-4000-8000-000000000001';
  v_r2   constant uuid := '55ee7118-0003-4000-8000-000000000002';
  v_r3   constant uuid := '55ee7118-0003-4000-8000-000000000003';
  v_r4   constant uuid := '55ee7118-0003-4000-8000-000000000004';
  v_c1   text;
begin
  select vc.slug into v_c1
  from public.vehicle_classes vc where vc.active order by vc.sort, vc.slug limit 1;
  if v_c1 is null then
    raise exception 'شرط مسبق: لا فئة سيارات فعّالة واحدة';
  end if;
  perform set_config('tours.pr_c1', v_c1, false);

  insert into public.subcontractors (id, company_name, phone, status)
  values (v_a, 'PRESENCE_TESTS شركة أ', '01000011101', 'approved'),
         (v_b, 'PRESENCE_TESTS شركة ب', '01000011102', 'approved');

  -- الهويات: بدونها لا يثبت هذا الملف شيئاً عن الحواجز، فغيابها فشلٌ لا تخطٍّ
  begin
    insert into auth.users (id, email) values
      (v_pa,   'presence-a@local.invalid'),
      (v_pb,   'presence-b@local.invalid'),
      (v_padm, 'presence-admin@local.invalid');
  exception
    when others then
      raise exception 'تعذّر إنشاء هويات الاختبار في auth.users (%) — هذا الملف يقيس حواجز صلاحيات ولا يجوز تشغيله بهوية المالك', sqlerrm;
  end;

  insert into public.profiles (id, role, full_name) values
    (v_pa,   'subcontractor', 'PR متعهد أ'),
    (v_pb,   'subcontractor', 'PR متعهد ب'),
    (v_padm, 'admin',         'PR مشرف اختبار')
  on conflict (id) do update set role = excluded.role;

  update public.subcontractors set profile_id = v_pa where id = v_a;
  update public.subcontractors set profile_id = v_pb where id = v_b;

  -- مساراتٌ صحراوية داخل مصر، بعيدةٌ عن مسارات المالك الحقيقية
  insert into public.price_lists
    (id, subcontractor_id, title, origin_label, origin_lat, origin_lng, origin_radius_km,
     dest_label, dest_lat, dest_lng, dest_radius_km, bidirectional, status)
  values
    (v_r1, v_a, 'القاهرة - الأسكندرية', 'القاهرة', 26.10, 28.10, 25,
           'الإسكندرية', 27.10, 29.10, 25, true, 'approved'),
    (v_r2, v_a, 'مطار القاهرة - داخلي', 'مطار القاهرة، القاهرة', 26.20, 28.20, 20,
           'مصر الجديدة، القاهرة', 26.30, 28.30, 20, false, 'approved'),
    (v_r3, v_a, 'انستا باي - نقطة تسليم', 'انستا باي', 26.40, 28.40, 10,
           'مرسى علم', 25.10, 33.10, 10, false, 'pending'),
    -- 🔴 «لبنان» شاهدٌ على الحدّ الذي يمنع فساد الأسماء في 0117: مجرِّدٌ ساذج
    --    يحذف الباء واللام فيصيّرها «نان» — ويبقى شاهداً هنا لا هناك وحده.
    (v_r4, v_b, 'لبنان - رحلة اسم لا يُقصّ', 'لبنان', 25.50, 30.50, 15,
           'الغردقة', 26.50, 33.50, 15, false, 'approved');

  insert into public.price_list_items (price_list_id, class_slug, cost) values
    (v_r1, v_c1, 1500),
    (v_r2, v_c1,  600),
    (v_r3, v_c1,  400),
    (v_r4, v_c1,  900);

  -- تحقّق أن الهويات تُحلّ فعلاً قبل أن نبني عليها اختبارات
  perform set_config('request.jwt.claim.sub', v_pa::text, false);
  if public.current_subcontractor_id() is distinct from v_a then
    raise exception '(ب-٢) الهوية لا تُحلّ: current_subcontractor_id = % والمتوقع %',
      coalesce(public.current_subcontractor_id()::text, 'بلا'), v_a;
  end if;

  perform set_config('request.jwt.claim.sub', v_padm::text, false);
  if not public.is_admin() then
    raise exception '(ب-٢) هوية المشرف لا تُحلّ — is_admin() = false';
  end if;

  raise notice '✔ (ب) التركيب: متعهدان بهويتين + مشرف + ٤ مسارات عربية';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ج) النبضة — تُنشئ، ثم لا تكتب داخل الدقيقة، ثم تكتب بعدها
-- ----------------------------------------------------------------------------
--
-- 🔴 هذا هو الاختبار الذي يمنع «كتابةً على كل تحميل صفحة». الخانق في القاعدة،
--    فلو حُذف شرط `where` من `on conflict` لتحرّك الطابع في (ج-٢) وفشل الملف.
do $$
declare
  v_a    constant uuid := '55ee7118-0000-4000-8000-00000000000a';
  v_pa   constant uuid := '55ee7118-0002-4000-8000-00000000000a';
  v_t1   timestamptz;
  v_t2   timestamptz;
  v_t3   timestamptz;
  v_n    integer;
begin
  perform set_config('request.jwt.claim.sub', v_pa::text, false);

  -- (ج-١) أول نبضة تُنشئ الصف
  begin
    execute 'set local role authenticated';
    perform public.touch_partner_presence();
    execute 'reset role';
  exception when others then execute 'reset role'; raise;
  end;

  select count(*) into v_n from public.partner_presence where subcontractor_id = v_a;
  if v_n <> 1 then
    raise exception '(ج-١) النبضة الأولى لم تُنشئ صفاً — الصفوف = %', v_n;
  end if;
  select pp.last_seen_at into v_t1 from public.partner_presence pp where pp.subcontractor_id = v_a;

  -- (ج-٢) نبضةٌ ثانية فوراً: **لا كتابة**، ولا خطأ كذلك
  begin
    execute 'set local role authenticated';
    perform public.touch_partner_presence();
    perform public.touch_partner_presence();
    execute 'reset role';
  exception when others then execute 'reset role'; raise;
  end;

  select pp.last_seen_at into v_t2 from public.partner_presence pp where pp.subcontractor_id = v_a;
  if v_t2 is distinct from v_t1 then
    raise exception
      '(ج-٢) 🔴 الخانق مكسور: الطابع تحرّك داخل الدقيقة (% ⇐ %) — أي كتابةٌ على كل تحميل صفحة',
      v_t1, v_t2;
  end if;

  -- (ج-٣) وبعد دقيقتين تُكتب
  update public.partner_presence
     set last_seen_at = now() - interval '2 minutes'
   where subcontractor_id = v_a;

  begin
    execute 'set local role authenticated';
    perform public.touch_partner_presence();
    execute 'reset role';
  exception when others then execute 'reset role'; raise;
  end;

  select pp.last_seen_at into v_t3 from public.partner_presence pp where pp.subcontractor_id = v_a;
  if v_t3 <= now() - interval '1 minute' then
    raise exception '(ج-٣) النبضة بعد دقيقتين لم تُحدِّث الطابع — بقي %', v_t3;
  end if;

  raise notice '✔ (ج) النبضة: تُنشئ · لا تكتب داخل الدقيقة · تكتب بعدها';
end;
$$;

-- ----------------------------------------------------------------------------
-- (د) بلا وسيط ⇒ لا أحد يكتب ظهور غيره، وغيرُ المتعهد لا يكتب شيئاً
-- ----------------------------------------------------------------------------
--
-- ⚠ هذه ليست حراسةً في الجسم بل **غياب حقلٍ يُلفَّق**: `touch_partner_presence`
--   بلا وسيط أصلاً. والاختبار يثبت الأثر: «ب» ينبض فيتحرك صفُّه هو ولا يُخلَق
--   صفٌّ لـ«أ» ولا يتحرك طابعه.
do $$
declare
  v_a    constant uuid := '55ee7118-0000-4000-8000-00000000000a';
  v_b    constant uuid := '55ee7118-0000-4000-8000-00000000000b';
  v_pb   constant uuid := '55ee7118-0002-4000-8000-00000000000b';
  v_padm constant uuid := '55ee7118-0002-4000-8000-0000000000ad';
  v_before timestamptz;
  v_after  timestamptz;
  v_n      integer;
  v_args   integer;
begin
  select pp.last_seen_at into v_before from public.partner_presence pp where pp.subcontractor_id = v_a;

  -- (د-١) «ب» ينبض
  perform set_config('request.jwt.claim.sub', v_pb::text, false);
  begin
    execute 'set local role authenticated';
    perform public.touch_partner_presence();
    execute 'reset role';
  exception when others then execute 'reset role'; raise;
  end;

  select count(*) into v_n from public.partner_presence where subcontractor_id = v_b;
  if v_n <> 1 then
    raise exception '(د-١) نبضة «ب» لم تُنشئ صفه — الصفوف = %', v_n;
  end if;

  select pp.last_seen_at into v_after from public.partner_presence pp where pp.subcontractor_id = v_a;
  if v_after is distinct from v_before then
    raise exception '(د-١ب) 🔴 نبضة «ب» حرّكت طابع «أ» (% ⇐ %)', v_before, v_after;
  end if;

  -- (د-٢) المشرف ليس متعهداً: نبضته لا تُنشئ صفاً ولا ترمي خطأً
  perform set_config('request.jwt.claim.sub', v_padm::text, false);
  select count(*) into v_n from public.partner_presence;
  begin
    execute 'set local role authenticated';
    perform public.touch_partner_presence();
    execute 'reset role';
  exception when others then execute 'reset role'; raise;
  end;
  if (select count(*) from public.partner_presence) <> v_n then
    raise exception '(د-٢) نبضةُ من ليس متعهداً كتبت صفاً — العدد تغيّر من %', v_n;
  end if;

  -- (د-٣) والحارس البنيوي نفسه: لا وسيط. **العدُّ على الاسم لا على توقيع**
  --       يُحلّ إلى الدالة المقصودة وحدها (النمط ٩ في LESSONS: حارسٌ لا يمكن
  --       أن يفشل ليس حارساً).
  select count(*) into v_n
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and p.proname = 'touch_partner_presence';
  select p.pronargs into v_args
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and p.proname = 'touch_partner_presence';
  if v_n <> 1 or v_args <> 0 then
    raise exception
      '(د-٣) 🔴 touch_partner_presence: عددها % ووسائطها % — المتوقع دالةٌ واحدة بلا وسيط',
      v_n, v_args;
  end if;

  raise notice '✔ (د) لا أحد يكتب ظهور غيره · غيرُ المتعهد لا يكتب · الدالة بلا وسيط';
end;
$$;

-- ----------------------------------------------------------------------------
-- (هـ) الجدول بلا منحة — والقراءة المباشرة تُرفض حياً
-- ----------------------------------------------------------------------------
--
-- 🔴 القاعدة ١٦: **المنحةُ هي الحارس لا السياسة**، و`TRUNCATE` لا تمرّ على RLS
--    أصلاً. فالفحص هنا على المنحة **وعلى نداءٍ حيّ** معاً.
do $$
declare
  v_acl text;
  v_msg text;
begin
  select coalesce(array_to_string(c.relacl::text[], ' | '), '(بلا منح)') into v_acl
  from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
  where ns.nspname = 'public' and c.relname = 'partner_presence';

  if v_acl ~ '(anon|authenticated)=' then
    raise exception '(هـ-١) 🔴 partner_presence مُنح لدور مستخدم: %', v_acl;
  end if;

  -- (هـ-٢) نداءٌ حيّ: المتعهد لا يقرأ الجدول مباشرةً
  perform set_config('request.jwt.claim.sub',
                     '55ee7118-0002-4000-8000-00000000000a', false);
  v_msg := null;
  begin
    execute 'set local role authenticated';
    begin
      perform 1 from public.partner_presence;
    exception when others then v_msg := sqlerrm;
    end;
    execute 'reset role';
  exception when others then execute 'reset role'; raise;
  end;

  if v_msg is null then
    raise exception '(هـ-٢) 🔴 متعهدٌ قرأ partner_presence مباشرةً — المنحة مفتوحة';
  end if;

  -- (هـ-٣) ولا يفرّغه: `truncate` هي العملية الوحيدة التي لا تحرسها RLS
  v_msg := null;
  begin
    execute 'set local role authenticated';
    begin
      execute 'truncate table public.partner_presence';
    exception when others then v_msg := sqlerrm;
    end;
    execute 'reset role';
  exception when others then execute 'reset role'; raise;
  end;

  if v_msg is null then
    raise exception '(هـ-٣) 🔴 متعهدٌ فرّغ partner_presence — المنحة هي الحارس وقد سقطت';
  end if;

  raise notice '✔ (هـ) بلا منحة (%) · لا قراءة مباشرة · لا تفريغ', v_acl;
end;
$$;

-- ----------------------------------------------------------------------------
-- (و) admin_partner_presence — للمشرف صفوف، وللمتعهد صفر، والتفويض قائم
-- ----------------------------------------------------------------------------
do $$
declare
  v_pa    constant uuid := '55ee7118-0002-4000-8000-00000000000a';
  v_padm  constant uuid := '55ee7118-0002-4000-8000-0000000000ad';
  v_admin integer;
  v_part  integer;
  v_cols  integer;
begin
  -- (و-١) بهوية مشرف: صفوف
  perform set_config('request.jwt.claim.sub', v_padm::text, false);
  begin
    execute 'set local role authenticated';
    select count(*) into v_admin from public.admin_partner_presence();
    execute 'reset role';
  exception when others then execute 'reset role'; raise;
  end;
  if v_admin < 2 then
    raise exception '(و-١) المشرف رأى % صفاً — المتوقع متعهدَي الاختبار على الأقل', v_admin;
  end if;

  -- (و-٢) 🔴 وبهوية متعهد: صفر. وهذا هو الحاجز، لا المنحة.
  perform set_config('request.jwt.claim.sub', v_pa::text, false);
  begin
    execute 'set local role authenticated';
    select count(*) into v_part from public.admin_partner_presence();
    execute 'reset role';
  exception when others then execute 'reset role'; raise;
  end;
  if v_part <> 0 then
    raise exception '(و-٢) 🔴 متعهدٌ قرأ % صفاً من admin_partner_presence', v_part;
  end if;

  -- (و-٣) التفويض قائم: الدالة المُنادَاة ما زالت تُرجع تسعة أعمدة، فلم
  --       تُستنسخ ولم تُستبدل بتعريفٍ ثانٍ (القاعدة ١٢ · D-58)
  select coalesce(array_length(p.proallargtypes, 1), 0) into v_cols
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and p.proname = 'admin_partner_availability';
  if v_cols <> 9 then
    raise exception '(و-٣) admin_partner_availability تُرجع % عموداً بدل ٩ — راجع التفويض', v_cols;
  end if;

  if not exists (
    select 1 from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public' and p.proname = 'admin_partner_presence'
      and pg_get_functiondef(p.oid) like '%admin_partner_availability()%'
  ) then
    raise exception
      '(و-٣ب) 🔴 admin_partner_presence لم تعد تنادي admin_partner_availability — أي أن قابلية الوصول صار لها تعريفان';
  end if;

  raise notice '✔ (و) المشرف يرى % صفاً · المتعهد صفر · والتفويض قائم', v_admin;
end;
$$;

-- ----------------------------------------------------------------------------
-- (ز) الحالات الثلاث — «متصل» و«آخر ظهور منذ» و«لم يدخل قط» ثلاثةٌ لا اثنان
-- ----------------------------------------------------------------------------
--
-- 🔴 القاعدة ١٥: «لا نعرف» و«صفر» و«لا ينطبق» ثلاثة أشياء. ومن لا صفَّ ظهورٍ له
--    ليس «غير متصل» — لم يدخل بوابته قط. والفرق هو ما يقرّر: أأتصل به أم أسأل
--    لماذا لم يدخل أصلاً؟
do $$
declare
  v_a     constant uuid := '55ee7118-0000-4000-8000-00000000000a';
  v_b     constant uuid := '55ee7118-0000-4000-8000-00000000000b';
  v_padm  constant uuid := '55ee7118-0002-4000-8000-0000000000ad';
  v_rec   record;
begin
  -- «أ» متصل الآن، و«ب» رآه النظام قبل يومين، ولا صفَّ لمن سواهما
  update public.partner_presence set last_seen_at = now()                  where subcontractor_id = v_a;
  update public.partner_presence set last_seen_at = now() - interval '2 days' where subcontractor_id = v_b;

  perform set_config('request.jwt.claim.sub', v_padm::text, false);

  select * into v_rec from public.admin_partner_presence() x where x.subcontractor_id = v_a;
  if v_rec.online is not true or v_rec.last_seen_at is null then
    raise exception '(ز-١) «أ» نبض الآن ولم يظهر متصلاً: online=% last_seen=%',
      v_rec.online, v_rec.last_seen_at;
  end if;

  select * into v_rec from public.admin_partner_presence() x where x.subcontractor_id = v_b;
  if v_rec.online is not false or v_rec.last_seen_at is null then
    raise exception '(ز-٢) «ب» ظهر قبل يومين والمتوقع غير متصل بطابعٍ محفوظ: online=% last_seen=%',
      v_rec.online, v_rec.last_seen_at;
  end if;

  -- (ز-٣) ومَن لا صفَّ له: `last_seen_at` **null** لا صفر ولا تاريخٌ مخترع
  delete from public.partner_presence where subcontractor_id = v_b;
  select * into v_rec from public.admin_partner_presence() x where x.subcontractor_id = v_b;
  if v_rec.last_seen_at is not null then
    raise exception '(ز-٣) 🔴 من لم يدخل قط أُعطي طابعاً (%) — و«لا نعرف» ليست «غير متصل»',
      v_rec.last_seen_at;
  end if;
  if v_rec.online is not false then
    raise exception '(ز-٣ب) online يجب أن تكون false لا null لمن لا صفَّ له — الشاشة تميّزه بغياب الطابع';
  end if;

  -- (ز-٤) ونافذة «متصل» خمس دقائق لا واحدة: نبضةٌ عمرها ٤ دقائق تبقى متصلة
  insert into public.partner_presence (subcontractor_id, last_seen_at)
  values (v_b, now() - interval '4 minutes');
  select * into v_rec from public.admin_partner_presence() x where x.subcontractor_id = v_b;
  if v_rec.online is not true then
    raise exception '(ز-٤) نبضةٌ عمرها ٤ دقائق ظهرت غير متصلة — النافذة ضاقت عن ٥ دقائق';
  end if;

  insert into public.partner_presence (subcontractor_id, last_seen_at)
  values (v_a, now() - interval '6 minutes')
  on conflict (subcontractor_id) do update set last_seen_at = excluded.last_seen_at;
  select * into v_rec from public.admin_partner_presence() x where x.subcontractor_id = v_a;
  if v_rec.online is not false then
    raise exception '(ز-٤ب) نبضةٌ عمرها ٦ دقائق ظهرت متصلة — النافذة اتسعت عن ٥ دقائق';
  end if;

  raise notice '✔ (ز) ثلاث حالات: متصل · آخر ظهور منذ · لم يدخل قط — والنافذة ٥ دقائق';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ح) البحث العربي — الحالات التي شكا منها المالك بنصّها
-- ----------------------------------------------------------------------------
do $$
declare
  v_a    constant uuid := '55ee7118-0000-4000-8000-00000000000a';
  v_b    constant uuid := '55ee7118-0000-4000-8000-00000000000b';
  v_padm constant uuid := '55ee7118-0002-4000-8000-0000000000ad';
  v_n    integer;
  v_t    text;
  v_tot  bigint;
begin
  perform set_config('request.jwt.claim.sub', v_padm::text, false);

  -- (ح-١) «الاسكندريه» بهاءٍ وبلا همزة تجد «القاهرة - الأسكندرية»
  select count(*), min(x.title) into v_n, v_t
  from public.admin_search_routes('الاسكندريه', v_a) x;
  if v_n <> 1 or v_t not like '%سكندرية' then
    raise exception '(ح-١) 🔴 «الاسكندريه» أعادت % صفاً (%) — وهذه شكوى المالك حرفاً', v_n, coalesce(v_t,'—');
  end if;

  -- (ح-٢) وبادئة الواو كذلك: «والاسكندريه»
  select count(*) into v_n from public.admin_search_routes('والاسكندريه', v_a) x;
  if v_n <> 1 then
    raise exception '(ح-٢) «والاسكندريه» أعادت % صفاً — التجريد لا يعمل', v_n;
  end if;

  -- (ح-٣) كلمتان متباعدتان في النص: «القاهره الاسكندريه»
  select count(*) into v_n from public.admin_search_routes('القاهره الاسكندريه', v_a) x;
  if v_n <> 1 then
    raise exception '(ح-٣) البحث بكلمتين أعاد % صفاً — المتوقع مسارٌ واحد', v_n;
  end if;

  -- (ح-٤) الالتصاق: «انستاباي» تجد «انستا باي» — مثالُ المالك نصّاً
  select count(*), min(x.title) into v_n, v_t
  from public.admin_search_routes('انستاباي', v_a) x;
  if v_n <> 1 or v_t not like 'انستا باي%' then
    raise exception '(ح-٤) 🔴 «انستاباي» لم تجد «انستا باي» — أعادت % صفاً (%)', v_n, coalesce(v_t,'—');
  end if;

  -- (ح-٥) والتصاقٌ فيه «ال» في الوسط: «مطارالقاهره»
  select count(*) into v_n from public.admin_search_routes('مطارالقاهره', v_a) x;
  if v_n <> 1 then
    raise exception '(ح-٥) «مطارالقاهره» أعادت % صفاً — شرط الالتصاق يعمل على المجرَّد لا على المطبَّع', v_n;
  end if;

  -- (ح-٦) 🔴 «لبنان» تبقى «لبنان»: مجرِّدٌ ساذج يصيّرها «نان» فتضيع
  select count(*) into v_n from public.admin_search_routes('لبنان', v_b) x;
  if v_n <> 1 then
    raise exception '(ح-٦) 🔴 «لبنان» أعادت % صفاً — التجريد أفسد اسماً', v_n;
  end if;

  -- (ح-٧) محارف LIKE لا تُوسّع البحث ولا تكسره: تُسقَط في التطبيع أصلاً
  select count(*) into v_n from public.admin_search_routes('%_\', v_a) x;
  if v_n <> 3 then
    raise exception '(ح-٧) بحثٌ بمحارف LIKE وحدها أعاد % — المتوقع ٣ (يساوي بحثاً فارغاً)', v_n;
  end if;

  -- (ح-٨) ما لا وجود له لا يُخترع
  select count(*) into v_n from public.admin_search_routes('اسوان', v_a) x;
  if v_n <> 0 then
    raise exception '(ح-٨) بحثٌ لا مطابق له أعاد % صفاً', v_n;
  end if;

  -- (ح-٩) الحصر بمتعهد: مسار «ب» لا يظهر داخل «أ»
  select count(*) into v_n from public.admin_search_routes('لبنان', v_a) x;
  if v_n <> 0 then
    raise exception '(ح-٩) الحصر بالمتعهد مكسور: مسار «ب» ظهر داخل «أ»';
  end if;

  -- (ح-١٠) الترشيح بالحالة + `total_count` نافذةٌ على المطابق كلِّه
  select count(*), min(x.total_count) into v_n, v_tot
  from public.admin_search_routes(null, v_a, 'pending') x;
  if v_n <> 1 or v_tot <> 1 then
    raise exception '(ح-١٠) ترشيح الحالة: صفوف=% total_count=% — المتوقع ١ و١', v_n, v_tot;
  end if;

  -- (ح-١١) والاقتطاع لا يكذب: صفٌّ واحد معروض و`total_count` يقول ٣
  select count(*), min(x.total_count) into v_n, v_tot
  from public.admin_search_routes(null, v_a, null, 1) x;
  if v_n <> 1 or v_tot <> 3 then
    raise exception '(ح-١١) 🔴 مع limit=1: صفوف=% total_count=% — المتوقع ١ و٣', v_n, v_tot;
  end if;

  -- (ح-١٢) وخلاصةُ الأسعار تُحسب في Postgres لا تصل الواجهةَ صفوفاً
  select x.classes_priced into v_n from public.admin_search_routes('الاسكندريه', v_a) x;
  if v_n <> 1 then
    raise exception '(ح-١٢) classes_priced = % — المتوقع ١', v_n;
  end if;

  raise notice '✔ (ح) البحث: الهمزة والتاء والبادئة والالتصاق ومحارف LIKE و«لبنان» و`total_count`';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ط) 🔴 البحث لا يسرّب تكلفة متعهدٍ إلى متعهد — D-19
-- ----------------------------------------------------------------------------
--
-- `admin_search_routes` ممنوحةٌ لـ`authenticated` لأن المشرف نفسه دورُه
-- `authenticated` — **فالمنحة ليست الحارس**. والحارس `is_admin()` داخل الجسم،
-- ويُقاس هنا بنداءٍ حيّ بهوية متعهدٍ حقيقي لا بقراءة نصّ (القاعدة ١٩).
do $$
declare
  v_a  constant uuid := '55ee7118-0000-4000-8000-00000000000a';
  v_pb constant uuid := '55ee7118-0002-4000-8000-00000000000b';
  v_n  integer;
  v_min numeric;
begin
  perform set_config('request.jwt.claim.sub', v_pb::text, false);

  begin
    execute 'set local role authenticated';
    select count(*), min(x.min_cost) into v_n, v_min
    from public.admin_search_routes(null, v_a) x;   -- «ب» يطلب مسارات «أ» صراحةً
    execute 'reset role';
  exception when others then execute 'reset role'; raise;
  end;

  if v_n <> 0 then
    raise exception
      '(ط-١) 🔴 نقض D-19: متعهدٌ قرأ % من مسارات منافسه، وأدنى تكلفة ظهرت له %',
      v_n, coalesce(v_min::text, 'بلا');
  end if;

  -- ولا حتى مساراته هو: هذه دالةُ لوحةٍ لا دالةُ بورتال
  begin
    execute 'set local role authenticated';
    select count(*) into v_n from public.admin_search_routes() x;
    execute 'reset role';
  exception when others then execute 'reset role'; raise;
  end;
  if v_n <> 0 then
    raise exception '(ط-٢) متعهدٌ قرأ % صفاً من admin_search_routes بلا وسائط', v_n;
  end if;

  raise notice '✔ (ط) لا تكلفةَ تعبر إلى متعهد — لا مسارات منافسه ولا مساراته';
end;
$$;

-- ----------------------------------------------------------------------------
-- التنظيف الختامي — زائدٌ لا ضارّ (المُشغّل يُرجع الملف كله)
-- ----------------------------------------------------------------------------
delete from public.price_list_items pli
 where pli.price_list_id in (
   select pl.id from public.price_lists pl
   join public.subcontractors s on s.id = pl.subcontractor_id
   where s.company_name like 'PRESENCE_TESTS%');
delete from public.price_lists pl
 where pl.subcontractor_id in (
   select s.id from public.subcontractors s where s.company_name like 'PRESENCE_TESTS%');
delete from public.partner_presence pp
 where pp.subcontractor_id in (
   select s.id from public.subcontractors s where s.company_name like 'PRESENCE_TESTS%');
delete from public.subcontractors s where s.company_name like 'PRESENCE_TESTS%';
delete from public.profiles p
 where p.id in ('55ee7118-0002-4000-8000-00000000000a'::uuid,
                '55ee7118-0002-4000-8000-00000000000b'::uuid,
                '55ee7118-0002-4000-8000-0000000000ad'::uuid);
do $$
begin
  delete from auth.users u
   where u.id in ('55ee7118-0002-4000-8000-00000000000a'::uuid,
                  '55ee7118-0002-4000-8000-00000000000b'::uuid,
                  '55ee7118-0002-4000-8000-0000000000ad'::uuid);
exception when others then null;
end;
$$;

-- ----------------------------------------------------------------------------
-- ⚠ `raise notice` لا `select` — المُشغّل يطبع أحداث `notice` وحدها
-- ----------------------------------------------------------------------------
do $$
begin
  raise notice 'ALL PASSED — الظهور: نبضةٌ مخنوقة بلا وسيط، وثلاث حالات لا اثنتان، وبحثٌ عربي لا يسرّب تكلفة';
end;
$$;
