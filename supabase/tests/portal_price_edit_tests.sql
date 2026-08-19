-- ============================================================================
-- portal_price_edit_tests.sql — التحرير الفوريّ لأسعار مسارٍ من بوابة المتعهد
--
-- كيف تشغّله:
--   node scripts/db-test.mjs portal_price_edit
--   أو من psql:  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/portal_price_edit_tests.sql
-- النجاح = آخر سطر «ALL PASSED». أي فشل exception عربية فيها المتوقع والفعلي.
--
-- ══════════════════════════════════════════════════════════════════════════
--  ما الذي يقيسه هذا الملف — وما الذي لا يقيسه
-- ══════════════════════════════════════════════════════════════════════════
--
-- شاشة «كشف الأسعار» في البورتال صار فيها تحريرٌ في مكانه: يفتح المتعهد صفَّ
-- المسار، يكتب سعراً، يُحفظ فوراً، ثم يظهر زرّ الإرسال للاعتماد. **ولا دالةَ
-- جديدة تحت هذا الزرّ**: الإجراء يفوّض إلى `import_price_sheet_rows` — البابُ
-- القائم للمتعهد على مسارات كشفه (القاعدة الذهبية ١٢: لا يُستنسخ منطقٌ قائم،
-- ولا يُكتب حارسٌ ثانٍ للمعنى نفسه).
--
-- فما يُقاس هنا هو **سلوكُ ذلك الباب تحت الشروط التي تعتمد عليها الشاشة**، لا
-- شكلُ الكود ولا نصُّ الدالة:
--
--   | ما يُقاس | لماذا تعتمد عليه الشاشة |
--   |---|---|
--   | المتعهد يحرّر مسودته فتُكتب | وعدُ «حفظٌ فوريّ» |
--   | 🔴 ولا يحرّر معتمَدةً — تُرفض بسببٍ منصوص | رقمُ المعتمَدة هو ما يُسعَّر به عميلٌ **الآن** |
--   | ولا يحرّر ما هو على مكتب المشرف | قرارٌ نصفُه على الشاشة ونصفُه في القاعدة يكذب على أحدهما |
--   | رقمٌ غير منتهٍ (`NaN`/`Infinity`/`1e1000`) يُرفض | D-05: التحقق من الرقم في القاعدة لا في المتصفح |
--   | الأرقام العربية الهندية تُقبل **بعد التطبيع** | الواجهة تُطبّع (‏`toLatinDigits`) والقاعدة تقبل الناتج — والعقد بينهما مثبَّتٌ هنا |
--   | شريكٌ لا يحرّر كشفَ شريك | D-19/D-20: كلُّ متعهدٍ `authenticated` |
--   | بعد التحرير يصير المسار مسودة و`draft_count` يزيد | هو بعينه ما يُظهر زرَّ «إرسال للاعتماد» |
--
-- 🔴 **وكلُّ توكيدٍ هنا مقرونٌ بضدّه في النداء نفسه** (شاهدٌ لا يحمرّ كاذب):
--   المرفوض يُقابله مقبولٌ بنفس الشكل يختلف عنه في المتغيّر المقيس وحده — حالةُ
--   المسار، أو نصُّ الرقم، أو هويةُ المنادي. فلو صار الباب يرفض كلَّ شيء (أو
--   يقبل كلَّ شيء) سقط نصفُ التوكيدات فوراً.
--
-- ⚠ **ولماذا لا `create or replace` لنزع حارسٍ ثم إعادته**: القاعدة التي يجري
--   عليها هذا الملف **هي قاعدة الإنتاج**، وتبديلُ جسم دالةٍ حيّة — ولو داخل
--   معاملةٍ تُرجَع — يقفل الدالة على كل نداءٍ حيٍّ يجري في تلك اللحظة. فالطفرة
--   هنا تقع على **مُدخل** الحارس لا على جسمه، وهي تُسقط التوكيد فعلاً: بدّل
--   `approved` إلى `draft` في الفيكسترة نفسها ⇒ يمرّ ما كان يُرفض.
--
-- 🔴 **ولا يمسّ هذا الملف صفّاً حقيقياً واحداً**: كل صفوفه بمعرّفات تبدأ بـ
--   `7ce0`، وأسماء الشركات موسومة `PORTAL_PRICE_EDIT_TESTS`، والتنظيف في
--   البداية والنهاية معاً. ولا متعهدَ المالك ولا قوائمه ولا حجوزاته.
--   والإحداثيات صحراويةٌ في أقصى الجنوب الشرقي (‏٢٢٫٨/٣٣٫٤ و٢٣٫٦/٣٤٫٨): داخل
--   `SERVICE_BOUNDS` كي يقبلها الاستيراد، وبعيدةٌ مئات الكيلومترات عن مسارات
--   المالك وعن فيكسترات المجموعات الأخرى.
--
-- 🔴 **وكلُّ ما يخصّ المتعهد يجري بـ`set local role authenticated`** مع هويةِ
--   جلسةٍ حقيقية (D-20)، لا بصلاحيات مالك القاعدة — فاختبارٌ يجري بهوية المالك
--   يثبت أن الشيفرة تعمل ولا يثبت أن الحاجز قائم.
--
-- الأقسام:
--   (أ) الشروط المسبقة + التنظيف + التركيب والهويات
--   (ب) المتعهد يحرّر مسودته — تُكتب فوراً، والمسار يبقى مسودة
--   (ج) رقمٌ غير منتهٍ يُرفض، والرقم الصحيح بنفس الشكل يُقبل
--   (د) الأرقام العربية الهندية: الخام يُرفض والمطبَّع يُقبل
--   (هـ) 🔴 المعتمَدة لا تُحرَّر — والمسودةُ بنفس الحمولة تُحرَّر
--   (و) ولا ما هو على مكتب المشرف (`pending`)
--   (ز) شريكٌ لا يحرّر كشفَ شريك — وكشفُه هو يُقبل
--   (ح) بعد التحرير يظهر زرّ الإرسال: `rejected` ⇒ `draft` و`draft_count` يزيد
--   (ط) الصلاحيات: `anon` لا ينفّذ الباب أصلاً
--   (ي) التنظيف
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (أ-١) الشروط المسبقة — بابٌ مفقود يعني أن الشاشة بلا قاعدة تسندها
-- ----------------------------------------------------------------------------
do $$
declare
  v_missing text;
begin
  select string_agg(x.sig, '، ') into v_missing
  from (values
    ('public.import_price_sheet_rows(uuid, jsonb, boolean, uuid)'),
    ('public.upsert_price_sheet(uuid, text, text, uuid)'),
    ('public.submit_price_sheet(uuid)'),
    ('public.review_price_list(uuid, boolean, text)'),
    ('public.price_sheet_stats(uuid)'),
    ('public.price_sheet_classes(uuid, uuid)'),
    ('public.normalize_arabic(text)'),
    ('public.current_subcontractor_id()')
  ) as x(sig)
  where to_regprocedure(x.sig) is null;

  if v_missing is not null then
    raise exception 'شرط مسبق: دوال مفقودة (نفّذ 0102 و0117): %', v_missing;
  end if;

  if to_regclass('auth.users') is null then
    raise exception 'شرط مسبق: مخطط auth مفقود — هذا الملف يقيس حواجز صلاحيات ولا يجوز تشغيله بهوية المالك';
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- (أ-٢) التنظيف الأولي — المسارات قبل الكشوف (حارس الحذف يمنع كشفاً فيه معتمد)
-- ----------------------------------------------------------------------------
delete from public.price_list_items pli
 where pli.price_list_id in (
   select pl.id from public.price_lists pl
   join public.subcontractors s on s.id = pl.subcontractor_id
   where s.company_name like 'PORTAL_PRICE_EDIT_TESTS%');
delete from public.price_lists pl
 where pl.subcontractor_id in (
   select s.id from public.subcontractors s
   where s.company_name like 'PORTAL_PRICE_EDIT_TESTS%');
delete from public.price_sheets ps
 where ps.subcontractor_id in (
   select s.id from public.subcontractors s
   where s.company_name like 'PORTAL_PRICE_EDIT_TESTS%');
delete from public.subcontractor_vehicles sv
 where sv.subcontractor_id in (
   select s.id from public.subcontractors s
   where s.company_name like 'PORTAL_PRICE_EDIT_TESTS%');
delete from public.subcontractors s where s.company_name like 'PORTAL_PRICE_EDIT_TESTS%';
delete from public.profiles p
 where p.id in ('7ce00002-0000-4000-8000-00000000000a'::uuid,
                '7ce00002-0000-4000-8000-00000000000b'::uuid,
                '7ce00002-0000-4000-8000-0000000000ad'::uuid);
do $$
begin
  delete from auth.users u
   where u.id in ('7ce00002-0000-4000-8000-00000000000a'::uuid,
                  '7ce00002-0000-4000-8000-00000000000b'::uuid,
                  '7ce00002-0000-4000-8000-0000000000ad'::uuid);
exception when others then null;
end;
$$;

-- ----------------------------------------------------------------------------
-- (أ-٣) التركيب — متعهدان بأسطولين + مشرف، بهويات دخول حقيقية
-- ----------------------------------------------------------------------------
do $$
declare
  v_a       constant uuid := '7ce00000-0000-4000-8000-00000000000a';
  v_b       constant uuid := '7ce00000-0000-4000-8000-00000000000b';
  v_pa      constant uuid := '7ce00002-0000-4000-8000-00000000000a';
  v_pb      constant uuid := '7ce00002-0000-4000-8000-00000000000b';
  v_padm    constant uuid := '7ce00002-0000-4000-8000-0000000000ad';
  v_classes text[];
begin
  -- الفئات تُشتق من الجدول نفسه، فلا يفشل الملف إن أعاد المالك تسمية فئة
  select array_agg(vc.slug order by vc.sort, vc.capacity, vc.slug) into v_classes
  from public.vehicle_classes vc where vc.active;

  if coalesce(array_length(v_classes, 1), 0) < 2 then
    raise exception 'شرط مسبق: نحتاج فئتي سيارات فعّالتين على الأقل (وجدنا %)',
      coalesce(array_length(v_classes, 1), 0);
  end if;

  perform set_config('tours.ppe_c1', v_classes[1], false);
  perform set_config('tours.ppe_c2', v_classes[2], false);

  insert into public.subcontractors (id, company_name, phone, status)
  values (v_a, 'PORTAL_PRICE_EDIT_TESTS شركة أ', '01000000071', 'approved'),
         (v_b, 'PORTAL_PRICE_EDIT_TESTS شركة ب', '01000000072', 'approved');

  insert into public.subcontractor_vehicles (subcontractor_id, class_slug, label, active)
  values (v_a, v_classes[1], 'PPE مركبة أ١', true),
         (v_a, v_classes[2], 'PPE مركبة أ٢', true),
         (v_b, v_classes[1], 'PPE مركبة ب١', true);

  begin
    insert into auth.users (id, email) values
      (v_pa,   'portal-price-edit-a@local.invalid'),
      (v_pb,   'portal-price-edit-b@local.invalid'),
      (v_padm, 'portal-price-edit-admin@local.invalid');
  exception
    when others then
      raise exception 'تعذّر إنشاء هويات الاختبار في auth.users (%) — هذا الملف يقيس حواجز صلاحيات ولا يجوز تشغيله بهوية المالك', sqlerrm;
  end;

  insert into public.profiles (id, role, full_name) values
    (v_pa,   'subcontractor', 'PPE متعهد أ'),
    (v_pb,   'subcontractor', 'PPE متعهد ب'),
    (v_padm, 'admin',         'PPE مشرف اختبار')
  on conflict (id) do update set role = excluded.role;

  update public.subcontractors set profile_id = v_pa where id = v_a;
  update public.subcontractors set profile_id = v_pb where id = v_b;

  -- الهوية تُحلّ فعلاً قبل أن يُبنى عليها شيء
  perform set_config('request.jwt.claim.sub', v_pa::text, false);
  if public.current_subcontractor_id() is distinct from v_a then
    raise exception '(أ-٣) هوية «أ» لا تُحلّ: % والمتوقع %',
      coalesce(public.current_subcontractor_id()::text, 'بلا'), v_a;
  end if;
  perform set_config('request.jwt.claim.sub', v_padm::text, false);
  if not public.is_admin() then
    raise exception '(أ-٣) هوية المشرف لا تُحلّ — is_admin() = false';
  end if;
  perform set_config('request.jwt.claim.sub', '', false);

  raise notice '✔ (أ) التركيب: متعهدان بأسطولين ومشرف — بهويات جلسة حقيقية';
end;
$$;

-- ----------------------------------------------------------------------------
-- (أ-٤) كشفُ «أ» ومساراته — يُبنى **بهوية المتعهد نفسه** لا بهوية المالك
-- ----------------------------------------------------------------------------
do $$
declare
  v_pa    constant uuid := '7ce00002-0000-4000-8000-00000000000a';
  v_pb    constant uuid := '7ce00002-0000-4000-8000-00000000000b';
  v_c1    text := current_setting('tours.ppe_c1');
  v_c2    text := current_setting('tours.ppe_c2');
  v_sheet uuid;
  v_sh_b  uuid;
  v_ok    integer;
  v_bad   integer;
begin
  perform set_config('request.jwt.claim.sub', v_pa::text, false);
  execute 'set local role authenticated';

  select s.id into v_sheet
  from public.upsert_price_sheet(null, 'PPE كشف أ', 'فيكسترة تحرير فوريّ') s;
  if v_sheet is null then
    raise exception '(أ-٤) upsert_price_sheet لم تُرجع معرّف كشف';
  end if;

  select count(*) filter (where r.accepted), count(*) filter (where not r.accepted)
    into v_ok, v_bad
  from public.import_price_sheet_rows(v_sheet, jsonb_build_array(
    jsonb_build_object(
      'title', 'PPE مسار المسودة', 'originLabel', 'PPE_SOUTH',
      'originLat', 22.8, 'originLng', 33.4, 'originRadiusKm', 15,
      'destLabel', 'PPE_EAST', 'destLat', 23.6, 'destLng', 34.8, 'destRadiusKm', 15,
      'prices', jsonb_build_object(v_c1, 1000, v_c2, 1500)),
    jsonb_build_object(
      'title', 'PPE مسار سيُعتمد', 'originLabel', 'PPE_SOUTH',
      'destLabel', 'PPE_EAST',
      'prices', jsonb_build_object(v_c1, 2000)),
    jsonb_build_object(
      'title', 'PPE مسار سيُرفض', 'originLabel', 'PPE_SOUTH',
      'destLabel', 'PPE_EAST',
      'prices', jsonb_build_object(v_c1, 3000))
  ), true) r;

  if v_ok <> 3 or v_bad <> 0 then
    raise exception '(أ-٤) تركيب المسارات: مقبول % مرفوض % — المتوقع ٣ و٠', v_ok, v_bad;
  end if;

  execute 'reset role';

  -- وكشفٌ لـ«ب» كي يكون لعزل الشركاء طرفٌ ثانٍ حقيقي
  perform set_config('request.jwt.claim.sub', v_pb::text, false);
  execute 'set local role authenticated';
  select s.id into v_sh_b from public.upsert_price_sheet(null, 'PPE كشف ب', null) s;
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '', false);

  perform set_config('tours.ppe_sheet_a', v_sheet::text, false);
  perform set_config('tours.ppe_sheet_b', v_sh_b::text, false);

  raise notice '✔ (أ-٤) كشف «أ» بثلاثة مسارات مسودة، وكشفٌ لـ«ب» — كلاهما بهوية صاحبه';
exception
  when others then
    begin execute 'reset role'; exception when others then null; end;
    perform set_config('request.jwt.claim.sub', '', false);
    raise;
end;
$$;

-- ----------------------------------------------------------------------------
-- (ب) المتعهد يحرّر مسودته — تُكتب فوراً، والمسار يبقى مسودة
--     (وهذا هو المسار الذي تنفّذه `saveRoutePrices` في البورتال حرفاً بحرف:
--      صفٌّ واحد، حمولةٌ كاملة، `p_commit = true`.)
-- ----------------------------------------------------------------------------
do $$
declare
  v_pa    constant uuid := '7ce00002-0000-4000-8000-00000000000a';
  v_c1    text := current_setting('tours.ppe_c1');
  v_c2    text := current_setting('tours.ppe_c2');
  v_sheet uuid := current_setting('tours.ppe_sheet_a')::uuid;
  v_r     record;
  v_cost  numeric;
  v_st    text;
begin
  perform set_config('request.jwt.claim.sub', v_pa::text, false);
  execute 'set local role authenticated';

  -- 🔴 الحمولة هنا **بشكلها الذي يرسله الإجراء حرفاً**: العنوان والنقاط والنطاقات
  --    والاتجاهان مقروءةً من القاعدة (أرقامٌ ومنطقيّاتٌ لا نصوص)، والأسعار وحدها
  --    نصوصٌ آتيةٌ من النموذج. فما يُقاس هنا هو عقدُ `saveRoutePrices` لا شكلٌ
  --    مريحٌ للاختبار.
  select * into v_r
  from public.import_price_sheet_rows(v_sheet, jsonb_build_array(
    jsonb_build_object(
      'title', 'PPE مسار المسودة',
      'originLabel', 'PPE_SOUTH', 'originLat', 22.8, 'originLng', 33.4, 'originRadiusKm', 15,
      'destLabel', 'PPE_EAST', 'destLat', 23.6, 'destLng', 34.8, 'destRadiusKm', 15,
      'bidirectional', true,
      'prices', jsonb_build_object(v_c1, '1250', v_c2, '1500'))
  ), true) r;

  if not v_r.accepted then
    raise exception '(ب-١) رُفض تحرير مسودة يملكها صاحبها: %', coalesce(v_r.reason, 'بلا سبب');
  end if;
  if v_r.action <> 'updated' then
    raise exception '(ب-٢) التحرير أنشأ مساراً جديداً بدل تحديث القائم (action = %)', v_r.action;
  end if;

  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '', false);

  select pli.cost, pl.status into v_cost, v_st
  from public.price_lists pl
  join public.price_list_items pli on pli.price_list_id = pl.id and pli.class_slug = v_c1
  where pl.sheet_id = v_sheet and pl.title = 'PPE مسار المسودة';

  if v_cost is distinct from 1250 then
    raise exception '(ب-٣) السعر لم يُكتب: القاعدة تقول % والمتوقع ١٢٥٠', coalesce(v_cost::text, 'بلا صف');
  end if;
  if v_st <> 'draft' then
    raise exception '(ب-٤) حالة المسار بعد التحرير % — المتوقع draft', v_st;
  end if;

  raise notice '✔ (ب) المتعهد حرّر مسودته: ١٠٠٠ ⇐ ١٢٥٠ · تحديثٌ لا إنشاء · والحالة مسودة';
exception
  when others then
    begin execute 'reset role'; exception when others then null; end;
    perform set_config('request.jwt.claim.sub', '', false);
    raise;
end;
$$;

-- ----------------------------------------------------------------------------
-- (ج) رقمٌ غير منتهٍ يُرفض — والرقم الصحيح **بنفس الشكل** يُقبل
--
-- 🔴 التوكيد مقرونٌ بضدّه: لو صار الباب يرفض كلَّ شيء لسقط شطرُ «المقبول»،
--    ولو صار يقبل كلَّ شيء لسقطت الشطور الثلاثة الأولى. فلا يمكن أن يخضرّ
--    هذا القسمُ بحارسٍ منزوع.
-- ----------------------------------------------------------------------------
do $$
declare
  v_pa    constant uuid := '7ce00002-0000-4000-8000-00000000000a';
  v_c1    text := current_setting('tours.ppe_c1');
  v_c2    text := current_setting('tours.ppe_c2');
  v_sheet uuid := current_setting('tours.ppe_sheet_a')::uuid;
  v_bad   text;
  v_r     record;
  v_cost  numeric;
begin
  perform set_config('request.jwt.claim.sub', v_pa::text, false);
  execute 'set local role authenticated';

  foreach v_bad in array array['NaN', 'Infinity', '-Infinity', '1e1000', 'abc', '12,,5'] loop
    select * into v_r
    from public.import_price_sheet_rows(v_sheet, jsonb_build_array(
      jsonb_build_object(
        'title', 'PPE مسار المسودة', 'originLabel', 'PPE_SOUTH', 'destLabel', 'PPE_EAST',
        'prices', jsonb_build_object(v_c1, v_bad, v_c2, '1500'))
    ), true) r;

    if v_r.accepted then
      raise exception '(ج-١) قُبل رقمٌ غير صالح «%» — والقاعدة هي التي تحرس الرقم لا المتصفح', v_bad;
    end if;
    if v_r.reason is null or v_r.reason not like '%تكلفة غير صالحة%' then
      raise exception '(ج-٢) رُفض «%» بلا سببٍ يسمّي التكلفة: %', v_bad, coalesce(v_r.reason, 'بلا سبب');
    end if;
  end loop;

  -- الضدّ: نفس الحمولة برقمٍ صحيح ⇒ تُقبل
  select * into v_r
  from public.import_price_sheet_rows(v_sheet, jsonb_build_array(
    jsonb_build_object(
      'title', 'PPE مسار المسودة', 'originLabel', 'PPE_SOUTH', 'destLabel', 'PPE_EAST',
      'prices', jsonb_build_object(v_c1, '1300', v_c2, '1500'))
  ), true) r;
  if not v_r.accepted then
    raise exception '(ج-٣) رُفض رقمٌ صحيح بنفس الشكل (%) — فالرفض أعلاه لا يثبت شيئاً',
      coalesce(v_r.reason, 'بلا سبب');
  end if;

  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '', false);

  select pli.cost into v_cost
  from public.price_lists pl
  join public.price_list_items pli on pli.price_list_id = pl.id and pli.class_slug = v_c1
  where pl.sheet_id = v_sheet and pl.title = 'PPE مسار المسودة';

  if v_cost is distinct from 1300 then
    raise exception '(ج-٤) السعر بعد الجولة % — المتوقع ١٣٠٠ (أي أن المرفوض لم يُكتب والمقبول كُتب)',
      coalesce(v_cost::text, 'بلا صف');
  end if;

  raise notice '✔ (ج) NaN و±Infinity و1e1000 والنصّ والفاصلة المبهمة كلها مرفوضة — و١٣٠٠ بنفس الشكل مقبولة';
exception
  when others then
    begin execute 'reset role'; exception when others then null; end;
    perform set_config('request.jwt.claim.sub', '', false);
    raise;
end;
$$;

-- ----------------------------------------------------------------------------
-- (د) الأرقام العربية الهندية — العقد بين الواجهة والقاعدة، مثبَّتاً
--
-- الواجهة تُطبّع قبل الإرسال (`toLatinDigits` في app/portal/_lib/form.ts، وهي
-- نفس اتفاقية اللوحة). وهذا القسم يثبت الشطرين معاً: الخام لا يمرّ صامتاً،
-- والمطبَّع يمرّ — فلو حُذف التطبيع من الإجراء لَما ضاع السعر بلا كلمة.
-- ----------------------------------------------------------------------------
do $$
declare
  v_pa    constant uuid := '7ce00002-0000-4000-8000-00000000000a';
  v_c1    text := current_setting('tours.ppe_c1');
  v_c2    text := current_setting('tours.ppe_c2');
  v_sheet uuid := current_setting('tours.ppe_sheet_a')::uuid;
  v_r     record;
  v_cost  numeric;
begin
  perform set_config('request.jwt.claim.sub', v_pa::text, false);
  execute 'set local role authenticated';

  -- الخام «١٤٥٠» — يُرفض بسببٍ مسمّى، ولا يُبتلع ولا يصير صفراً
  select * into v_r
  from public.import_price_sheet_rows(v_sheet, jsonb_build_array(
    jsonb_build_object(
      'title', 'PPE مسار المسودة', 'originLabel', 'PPE_SOUTH', 'destLabel', 'PPE_EAST',
      'prices', jsonb_build_object(v_c1, '١٤٥٠', v_c2, '1500'))
  ), true) r;
  if v_r.accepted then
    raise exception '(د-١) قُبلت أرقامٌ عربية خام — وهذا يعني أن التطبيع صار في مكانين';
  end if;

  -- والمطبَّع — وهو ما ترسله الواجهة فعلاً — يُقبل ويُكتب رقماً صحيحاً
  select * into v_r
  from public.import_price_sheet_rows(v_sheet, jsonb_build_array(
    jsonb_build_object(
      'title', 'PPE مسار المسودة', 'originLabel', 'PPE_SOUTH', 'destLabel', 'PPE_EAST',
      'prices', jsonb_build_object(v_c1, public.normalize_arabic('١٤٥٠'), v_c2, '1500'))
  ), true) r;
  if not v_r.accepted then
    raise exception '(د-٢) رُفض رقمٌ عربيٌّ مطبَّع: %', coalesce(v_r.reason, 'بلا سبب');
  end if;

  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '', false);

  select pli.cost into v_cost
  from public.price_lists pl
  join public.price_list_items pli on pli.price_list_id = pl.id and pli.class_slug = v_c1
  where pl.sheet_id = v_sheet and pl.title = 'PPE مسار المسودة';

  if v_cost is distinct from 1450 then
    raise exception '(د-٣) «١٤٥٠» المطبَّعة كُتبت % — المتوقع ١٤٥٠', coalesce(v_cost::text, 'بلا صف');
  end if;

  raise notice '✔ (د) العربية الخام تُرفض بسبب، والمطبَّعة تُكتب ١٤٥٠ — والعقد مع الواجهة مثبَّت';
exception
  when others then
    begin execute 'reset role'; exception when others then null; end;
    perform set_config('request.jwt.claim.sub', '', false);
    raise;
end;
$$;

-- ----------------------------------------------------------------------------
-- (هـ) 🔴 المسارُ المعتمَد لا يحرّره المتعهد — ورقمُه لا يتغيّر
--
-- **الطفرة هنا على مُدخل الحارس**: نفس الحمولة حرفاً بحرف تُرسَل مرّتين، مرّةً
-- إلى مسارٍ `approved` ومرّةً إلى مسارٍ `draft`. فالمتغيّر الوحيد بين النداءين
-- هو ما يقرؤه الحارس — والنتيجتان تنعكسان. ولو نُزع الحارس لَمرّت الأولى.
-- ----------------------------------------------------------------------------
do $$
declare
  v_pa     constant uuid := '7ce00002-0000-4000-8000-00000000000a';
  v_padm   constant uuid := '7ce00002-0000-4000-8000-0000000000ad';
  v_c1     text := current_setting('tours.ppe_c1');
  v_sheet  uuid := current_setting('tours.ppe_sheet_a')::uuid;
  v_appr   uuid;
  v_rej    uuid;
  v_r      record;
  v_cost   numeric;
  v_st     text;
  v_new    text;
begin
  select pl.id into v_appr from public.price_lists pl
   where pl.sheet_id = v_sheet and pl.title = 'PPE مسار سيُعتمد';
  select pl.id into v_rej from public.price_lists pl
   where pl.sheet_id = v_sheet and pl.title = 'PPE مسار سيُرفض';

  -- المتعهد يُرسل كشفه، والمشرف وحده يبتّ
  perform set_config('request.jwt.claim.sub', v_pa::text, false);
  execute 'set local role authenticated';
  perform s.submitted from public.submit_price_sheet(v_sheet) s;
  execute 'reset role';

  perform set_config('request.jwt.claim.sub', v_padm::text, false);
  execute 'set local role authenticated';
  select public.review_price_list(v_appr, true, null) into v_new;
  if v_new <> 'approved' then
    raise exception '(هـ-٠) الاعتماد لم يقع: %', v_new;
  end if;
  select public.review_price_list(v_rej, false, 'سببٌ مكتوب للفيكسترة') into v_new;
  execute 'reset role';

  -- ── الشطر الأول: المعتمَد يُرفض ─────────────────────────────────────────
  perform set_config('request.jwt.claim.sub', v_pa::text, false);
  execute 'set local role authenticated';

  -- مسارٌ ضابط يُنشأ **بعد** الإرسال فيبقى مسودة — هو طرفُ الطفرة أدناه.
  -- (‏نقطتاه معروفتان من صفوفٍ أسبق، فيكفي اسمهما.)
  perform 1 from public.import_price_sheet_rows(v_sheet, jsonb_build_array(
    jsonb_build_object(
      'title', 'PPE مسار الضابط', 'originLabel', 'PPE_SOUTH', 'destLabel', 'PPE_EAST',
      'prices', jsonb_build_object(v_c1, '500'))
  ), true) r;

  select * into v_r
  from public.import_price_sheet_rows(v_sheet, jsonb_build_array(
    jsonb_build_object(
      'title', 'PPE مسار سيُعتمد', 'originLabel', 'PPE_SOUTH', 'destLabel', 'PPE_EAST',
      'prices', jsonb_build_object(v_c1, '9999'))
  ), true) r;

  if v_r.accepted then
    raise exception '(هـ-١) 🔴 المتعهد حرّر مساراً معتمداً — ورقمُه هو ما يُسعَّر به عميلٌ الآن';
  end if;
  if v_r.reason is null or v_r.reason not like '%معتمد%' then
    raise exception '(هـ-٢) الرفض بلا سببٍ يقول «معتمد»: %', coalesce(v_r.reason, 'بلا سبب');
  end if;

  -- ── الشطر الثاني (الطفرة): نفس الحمولة على مسارٍ مسودة ⇒ تمرّ ──────────
  select * into v_r
  from public.import_price_sheet_rows(v_sheet, jsonb_build_array(
    jsonb_build_object(
      'title', 'PPE مسار الضابط', 'originLabel', 'PPE_SOUTH', 'destLabel', 'PPE_EAST',
      'prices', jsonb_build_object(v_c1, '9999'))
  ), true) r;
  if not v_r.accepted then
    raise exception '(هـ-٣) رُفضت نفس الحمولة على مسودة (%) — فالرفض أعلاه لا يثبت أن الحارس يقرأ الحالة',
      coalesce(v_r.reason, 'بلا سبب');
  end if;

  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '', false);

  -- ورقمُ المعتمَد لم يتحرك، وحالته لم تُنزَل
  select pli.cost, pl.status into v_cost, v_st
  from public.price_lists pl
  join public.price_list_items pli on pli.price_list_id = pl.id and pli.class_slug = v_c1
  where pl.id = v_appr;

  if v_cost is distinct from 2000 then
    raise exception '(هـ-٤) تكلفة المسار المعتمد صارت % — المتوقع ٢٠٠٠ بلا مساس',
      coalesce(v_cost::text, 'بلا صف');
  end if;
  if v_st <> 'approved' then
    raise exception '(هـ-٥) حالة المسار المعتمد صارت % — التحرير المرفوض أنزلها', v_st;
  end if;

  raise notice '✔ (هـ) 🔴 المعتمَد يُرفض بسببٍ منصوص ورقمُه ٢٠٠٠ كما هو — ونفس الحمولة تمرّ على المسودة';
exception
  when others then
    begin execute 'reset role'; exception when others then null; end;
    perform set_config('request.jwt.claim.sub', '', false);
    raise;
end;
$$;

-- ----------------------------------------------------------------------------
-- (و) ولا ما هو على مكتب المشرف — والضدّ: المرفوضة تُحرَّر
-- ----------------------------------------------------------------------------
do $$
declare
  v_pa     constant uuid := '7ce00002-0000-4000-8000-00000000000a';
  v_c1     text := current_setting('tours.ppe_c1');
  v_sheet  uuid := current_setting('tours.ppe_sheet_a')::uuid;
  v_pend   uuid;
  v_r      record;
begin
  -- «PPE مسار المسودة» أُرسل في (هـ) ولم يُبتّ فيه — فهو الآن على مكتب المشرف
  perform set_config('request.jwt.claim.sub', v_pa::text, false);
  execute 'set local role authenticated';

  select pl.id into v_pend from public.price_lists pl
   where pl.sheet_id = v_sheet and pl.title = 'PPE مسار المسودة' and pl.status = 'pending';
  if v_pend is null then
    raise exception '(و-٠) لم يصل المسار إلى pending — الفيكسترة لا تقيس ما تدّعي';
  end if;

  select * into v_r
  from public.import_price_sheet_rows(v_sheet, jsonb_build_array(
    jsonb_build_object(
      'title', 'PPE مسار المسودة', 'originLabel', 'PPE_SOUTH', 'destLabel', 'PPE_EAST',
      'prices', jsonb_build_object(v_c1, '4444'))
  ), true) r;

  if v_r.accepted then
    raise exception '(و-١) حُرِّر مسارٌ على مكتب المشرف — فالمشرف يبتّ في رقمٍ غير الذي يراه';
  end if;
  if v_r.reason is null or v_r.reason not like '%مكتب المشرف%' then
    raise exception '(و-٢) الرفض بلا سببٍ يقول «مكتب المشرف»: %', coalesce(v_r.reason, 'بلا سبب');
  end if;

  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '', false);

  raise notice '✔ (و) المسار قيد المراجعة لا يُحرَّر — والسبب منصوص';
exception
  when others then
    begin execute 'reset role'; exception when others then null; end;
    perform set_config('request.jwt.claim.sub', '', false);
    raise;
end;
$$;

-- ----------------------------------------------------------------------------
-- (ز) شريكٌ لا يحرّر كشفَ شريك — وكشفُه هو يُقبل (الطفرة على الهوية)
-- ----------------------------------------------------------------------------
do $$
declare
  v_pb     constant uuid := '7ce00002-0000-4000-8000-00000000000b';
  v_c1     text := current_setting('tours.ppe_c1');
  v_sh_a   uuid := current_setting('tours.ppe_sheet_a')::uuid;
  v_sh_b   uuid := current_setting('tours.ppe_sheet_b')::uuid;
  v_row    jsonb;
  v_ok     boolean := false;
  v_r      record;
  v_before integer;
  v_after  integer;
begin
  v_row := jsonb_build_array(jsonb_build_object(
    'title', 'PPE مسار المسودة', 'originLabel', 'PPE_SOUTH',
    'originLat', 22.8, 'originLng', 33.4, 'originRadiusKm', 15,
    'destLabel', 'PPE_EAST', 'destLat', 23.6, 'destLng', 34.8, 'destRadiusKm', 15,
    'prices', jsonb_build_object(v_c1, '7777')));

  select count(*) into v_before from public.price_lists pl where pl.sheet_id = v_sh_a;

  perform set_config('request.jwt.claim.sub', v_pb::text, false);
  execute 'set local role authenticated';

  begin
    perform 1 from public.import_price_sheet_rows(v_sh_a, v_row, true) r;
  exception when others then
    v_ok := true;
  end;

  if not v_ok then
    raise exception '(ز-١) 🔴 شريكٌ كتب في كشف شريكٍ آخر';
  end if;

  -- الطفرة على الهوية: نفس الحمولة على كشفه هو ⇒ تُقبل
  select * into v_r from public.import_price_sheet_rows(v_sh_b, v_row, true) r;
  if not v_r.accepted then
    raise exception '(ز-٢) رُفضت نفس الحمولة على كشف «ب» نفسه (%) — فالرفض أعلاه لا يثبت العزل',
      coalesce(v_r.reason, 'بلا سبب');
  end if;

  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '', false);

  select count(*) into v_after from public.price_lists pl where pl.sheet_id = v_sh_a;
  if v_after <> v_before then
    raise exception '(ز-٣) عدد مسارات كشف «أ» تغيّر من % إلى % — كتب فيه غيرُ صاحبه',
      v_before, v_after;
  end if;

  raise notice '✔ (ز) «ب» يُرفض على كشف «أ» ويُقبل على كشفه — والعزل يقرأ الهوية لا الحمولة';
exception
  when others then
    begin execute 'reset role'; exception when others then null; end;
    perform set_config('request.jwt.claim.sub', '', false);
    raise;
end;
$$;

-- ----------------------------------------------------------------------------
-- (ح) بعد التحرير يظهر زرّ الإرسال — `rejected` ⇒ `draft`، و`draft_count` يزيد
--
-- زرّ «إرسال للاعتماد» في الشاشة مشروطٌ بـ`draftCount + rejectedCount > 0`
-- المقروءَين من `price_sheet_stats` — فالوعد البصري يُقاس عند مصدره لا في JSX.
-- ----------------------------------------------------------------------------
do $$
declare
  v_pa     constant uuid := '7ce00002-0000-4000-8000-00000000000a';
  v_a      constant uuid := '7ce00000-0000-4000-8000-00000000000a';
  v_c1     text := current_setting('tours.ppe_c1');
  v_sheet  uuid := current_setting('tours.ppe_sheet_a')::uuid;
  v_r      record;
  v_st     record;
  v_before integer;
  v_status text;
begin
  perform set_config('request.jwt.claim.sub', v_pa::text, false);
  execute 'set local role authenticated';

  select x.draft_count into v_before from public.price_sheet_stats(v_a) x where x.id = v_sheet;

  select pl.status into v_status from public.price_lists pl
   where pl.sheet_id = v_sheet and pl.title = 'PPE مسار سيُرفض';
  if v_status <> 'rejected' then
    raise exception '(ح-٠) المسار المرفوض حالته % — الفيكسترة لا تقيس ما تدّعي', v_status;
  end if;

  select * into v_r
  from public.import_price_sheet_rows(v_sheet, jsonb_build_array(
    jsonb_build_object(
      'title', 'PPE مسار سيُرفض', 'originLabel', 'PPE_SOUTH', 'destLabel', 'PPE_EAST',
      'prices', jsonb_build_object(v_c1, '3300'))
  ), true) r;

  if not v_r.accepted then
    raise exception '(ح-١) رُفض تحرير مسارٍ مرفوض — وهو بالضبط ما يُطلب من المتعهد أن يصلحه: %',
      coalesce(v_r.reason, 'بلا سبب');
  end if;

  select * into v_st from public.price_sheet_stats(v_a) x where x.id = v_sheet;

  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '', false);

  if v_st.draft_count <> v_before + 1 then
    raise exception '(ح-٢) draft_count = % والمتوقع % — فزرّ الإرسال لن يظهر بعد الحفظ',
      v_st.draft_count, v_before + 1;
  end if;

  select pl.status into v_status
  from public.price_lists pl where pl.sheet_id = v_sheet and pl.title = 'PPE مسار سيُرفض';
  if v_status <> 'draft' then
    raise exception '(ح-٣) المسار بعد إصلاحه حالته % — المتوقع draft', v_status;
  end if;

  raise notice '✔ (ح) تحرير المرفوض يعيده مسودة و draft_count يزيد — وهو ما يُظهر زرّ الإرسال';
exception
  when others then
    begin execute 'reset role'; exception when others then null; end;
    perform set_config('request.jwt.claim.sub', '', false);
    raise;
end;
$$;

-- ----------------------------------------------------------------------------
-- (ط) الصلاحيات — الباب لا يُفتح لـ`anon` أصلاً (تكلفة المتعهد سرٌّ تجاري · D-19)
-- ----------------------------------------------------------------------------
do $$
declare
  v_sig constant text := 'public.import_price_sheet_rows(uuid, jsonb, boolean, uuid)';
begin
  if exists (select 1 from pg_roles where rolname = 'anon')
     and has_function_privilege('anon', v_sig, 'execute') then
    raise exception '(ط-١) anon ينفّذ import_price_sheet_rows — بابُ أسعار المتعهدين مفتوح للزائر';
  end if;
  if not has_function_privilege('authenticated', v_sig, 'execute') then
    raise exception '(ط-٢) authenticated لا ينفّذ import_price_sheet_rows — التحرير الفوريّ لن يعمل';
  end if;

  raise notice '✔ (ط) الباب لـauthenticated وحده — وanon لا يبلغه';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ي) التنظيف — لا صف اختبار يبقى (والمعاملة تُرجَع فوقه على كل حال)
-- ----------------------------------------------------------------------------
delete from public.price_list_items pli
 where pli.price_list_id in (
   select pl.id from public.price_lists pl
   join public.subcontractors s on s.id = pl.subcontractor_id
   where s.company_name like 'PORTAL_PRICE_EDIT_TESTS%');
delete from public.price_lists pl
 where pl.subcontractor_id in (
   select s.id from public.subcontractors s
   where s.company_name like 'PORTAL_PRICE_EDIT_TESTS%');
delete from public.price_sheets ps
 where ps.subcontractor_id in (
   select s.id from public.subcontractors s
   where s.company_name like 'PORTAL_PRICE_EDIT_TESTS%');
delete from public.subcontractor_vehicles sv
 where sv.subcontractor_id in (
   select s.id from public.subcontractors s
   where s.company_name like 'PORTAL_PRICE_EDIT_TESTS%');
delete from public.subcontractors s where s.company_name like 'PORTAL_PRICE_EDIT_TESTS%';
delete from public.profiles p
 where p.id in ('7ce00002-0000-4000-8000-00000000000a'::uuid,
                '7ce00002-0000-4000-8000-00000000000b'::uuid,
                '7ce00002-0000-4000-8000-0000000000ad'::uuid);
do $$
begin
  delete from auth.users u
   where u.id in ('7ce00002-0000-4000-8000-00000000000a'::uuid,
                  '7ce00002-0000-4000-8000-00000000000b'::uuid,
                  '7ce00002-0000-4000-8000-0000000000ad'::uuid);
exception when others then null;
end;
$$;

do $$
begin
  raise notice 'ALL PASSED — portal_price_edit_tests';
end;
$$;
