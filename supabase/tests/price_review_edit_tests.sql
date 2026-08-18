-- ============================================================================
-- price_review_edit_tests.sql — الاعتمادُ الجزئيّ والتعديلُ بالنقر (هجرة 0135)
--
-- كيف تشغّله:
--   node scripts/db-test.mjs price_review_edit
--   أو من psql:  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/price_review_edit_tests.sql
-- النجاح = آخر سطر «ALL PASSED». أي فشل exception عربية فيها المتوقع والفعلي.
--
-- ── 🔴 ما يقيسه هذا الملف، وما يرفض قياسه ──────────────────────────────────
--
-- درسُ 2026-08-18 المدفوع: **خمسةُ توكيداتٍ سقطت لأنها قاست محتوى القاعدة بدل
-- سلوك الكود** (سعةَ مركبةٍ يملكها المالك · صفَّ أسعارٍ حذفه المتعهد · توقيعَ
-- دالةٍ حرفياً · عدداً في جدول). فلا توكيدَ هنا يقرأ رقماً يملكه المالك ولا صفّاً
-- يملكه شريك:
--
--   • **كل صفٍّ يلمسه هذا الملف من صنعه هو** — متعهدان بمعرّفات ثابتة تبدأ بـ
--     `35ee70`، وأسماء شركاتٍ موسومة `PRICE_EDIT_TESTS`، وكشفان ومساراتٌ وأسعارٌ
--     كلها مولودةٌ هنا. ولا يُقرأ صفُّ المالك ولا يُعدَّل ولا يُعدّ.
--   • **الفئات تُشتق من `vehicle_classes` لا تُكتب بيد** — فإعادةُ تسميةِ فئةٍ من
--     اللوحة لا تُسقط الملف.
--   • **العملة والهامش لا يُثبَّت لهما رقم** — الحمولةُ تُقارَن بما في
--     `pricing_settings` لا بـ«EGP».
--   • **وكلُّ عدٍّ للإشعارات والتدقيق محصورٌ في فيكسترتنا** (‏`recipient_id` =
--     متعهدنا · `note like '%<معرّف قائمتنا>%'`) — فجولةٌ متزامنة لوكيلٍ آخر لا
--     تُحمّر هذا الملف ولا تُخضّره كذباً.
--
-- والملفُّ كلُّه يجري داخل `BEGIN … ROLLBACK` يفرضه `scripts/db-test.mjs` — فلا
-- إشعارٌ يُكمّ فيصل تليجرام المالك، وهو العطلُ المقيس في ترويسة ذلك السكربت.
--
-- ── ما هو **سلوكُ الكود** الذي تقيسه هذه المجموعة ──────────────────────────
--
--   (أ) الشروط المسبقة + التنظيف + التركيب والهويات الحقيقية
--   (ب) اعتمادٌ جزئيّ: مساراتٌ مختارة تُعتمد، وأخواتُها تبقى بانتظار المراجعة
--   (ج) رفضٌ جزئيّ بسببٍ مكتوب — **ولا يُبطل ما اعتُمد**
--   (د) الرفضُ بلا سبب مرفوض (‏قيدٌ مُفوَّضٌ إلى `review_price_list`)
--   (هـ) 🔴 `p_expected` تمنع التوسّع — **وأربعُ طفراتٍ تُثبت أنها تفشل فعلاً**
--   (و) المتعهد لا يعتمد ولا يرفض بهذا الباب
--   (ز) تعديلٌ على مسودة: يُحفظ فوراً · بلا إشعار · والحالة تبقى مسودة
--   (ح) تعديلٌ على معتمدة: يُحفظ فوراً · **يكتب تدقيقاً** · **ويُشعر المتعهد**
--   (ط) رقمٌ غير منتهٍ يُرفض — وطفرةٌ لكل شكل، والقيمةُ القديمة سليمة بعده
--   (ي) التزامن: مشرفان على الخانة نفسها ⇒ الثاني يُردّ بالرقمين ولا يضيع تعديل
--   (ك) متعهدٌ لا يستطيع تحرير قائمته المعتمدة من هذا الباب
--   (ل) الصلاحيات: صفرٌ لـanon على الدالتين
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (أ-١) الشروط المسبقة
-- ----------------------------------------------------------------------------
do $$
declare
  v_missing text;
begin
  select string_agg(x.sig, '، ') into v_missing
  from (values
    ('public.review_selected_price_lists(uuid, uuid[], boolean, text, integer)'),
    ('public.set_price_list_item_cost(uuid, text, text, text)'),
    ('public.review_price_list(uuid, boolean, text)'),
    ('public.quote_arg_finite(numeric, text, numeric)'),
    ('public.normalize_arabic(text)'),
    ('public.queue_notification(text, jsonb, text, uuid)')
  ) as x(sig)
  where to_regprocedure(x.sig) is null;

  if v_missing is not null then
    raise exception 'شرط مسبق: دوال مفقودة (نفّذ 0135 أولاً): %', v_missing;
  end if;

  if not exists (
    select 1 from pg_trigger t
    where t.tgrelid = 'public.price_list_items'::regclass
      and not t.tgisinternal and t.tgname = 'audit_price_list_items'
  ) then
    raise exception 'شرط مسبق: مُشغّل التدقيق audit_price_list_items مفقود';
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- (أ-٢) التنظيف الأولي — قبل البناء وبعده معاً، فانهيارٌ في المنتصف لا يمنع التالي
-- ----------------------------------------------------------------------------
delete from public.notifications n
 where n.recipient_id in (
   select s.id from public.subcontractors s where s.company_name like 'PRICE_EDIT_TESTS%');
delete from public.price_list_items pli
 where pli.price_list_id in (
   select pl.id from public.price_lists pl
   join public.subcontractors s on s.id = pl.subcontractor_id
   where s.company_name like 'PRICE_EDIT_TESTS%');
delete from public.price_lists pl
 where pl.subcontractor_id in (
   select s.id from public.subcontractors s where s.company_name like 'PRICE_EDIT_TESTS%');
delete from public.price_sheets ps
 where ps.subcontractor_id in (
   select s.id from public.subcontractors s where s.company_name like 'PRICE_EDIT_TESTS%');
delete from public.subcontractors s where s.company_name like 'PRICE_EDIT_TESTS%';
delete from public.profiles p
 where p.id in ('35ee7002-0000-4000-8000-00000000000a'::uuid,
                '35ee7002-0000-4000-8000-00000000000b'::uuid,
                '35ee7002-0000-4000-8000-0000000000ad'::uuid);
do $$
begin
  delete from auth.users u
   where u.id in ('35ee7002-0000-4000-8000-00000000000a'::uuid,
                  '35ee7002-0000-4000-8000-00000000000b'::uuid,
                  '35ee7002-0000-4000-8000-0000000000ad'::uuid);
exception when others then null;
end;
$$;

-- ----------------------------------------------------------------------------
-- (أ-٣) التركيب — كلُّ صفٍّ من صنع هذا الملف
--
-- كشفان: «س١» لمتعهدنا أ وفيه أربعةُ مساراتٍ منتظرة ومسارٌ معتمد، و«س٢» لمتعهدٍ
-- ثانٍ ب وفيه مسارٌ واحد منتظر — وجودُه ليس زينة: به تُقاس طفرةُ «معرّفٌ من كشفٍ
-- آخر» في (هـ)، وهي الطفرة التي بلا كشفٍ ثانٍ لا يمكن قياسها أصلاً.
-- ----------------------------------------------------------------------------
do $$
declare
  v_a    constant uuid := '35ee7000-0000-4000-8000-00000000000a';
  v_b    constant uuid := '35ee7000-0000-4000-8000-00000000000b';
  v_s1   constant uuid := '35ee7001-0000-4000-8000-000000000001';
  v_s2   constant uuid := '35ee7001-0000-4000-8000-000000000002';
  v_l1   constant uuid := '35ee7003-0000-4000-8000-000000000001';
  v_l2   constant uuid := '35ee7003-0000-4000-8000-000000000002';
  v_l3   constant uuid := '35ee7003-0000-4000-8000-000000000003';
  v_l4   constant uuid := '35ee7003-0000-4000-8000-000000000004';
  v_l5   constant uuid := '35ee7003-0000-4000-8000-000000000005';
  v_la   constant uuid := '35ee7003-0000-4000-8000-00000000000a';
  v_ld   constant uuid := '35ee7003-0000-4000-8000-00000000000d';
  v_pa   constant uuid := '35ee7002-0000-4000-8000-00000000000a';
  v_pb   constant uuid := '35ee7002-0000-4000-8000-00000000000b';
  v_padm constant uuid := '35ee7002-0000-4000-8000-0000000000ad';
  v_classes text[];
begin
  -- الفئات من الجدول لا من الذاكرة: إعادةُ تسميةٍ من اللوحة لا تُسقط الملف
  select array_agg(vc.slug order by vc.sort, vc.capacity, vc.slug) into v_classes
  from public.vehicle_classes vc where vc.active;

  if coalesce(array_length(v_classes, 1), 0) < 2 then
    raise exception 'شرط مسبق: نحتاج فئتي سيارات فعّالتين على الأقل (وجدنا %)',
      coalesce(array_length(v_classes, 1), 0);
  end if;
  perform set_config('tours.pe_c1', v_classes[1], false);
  perform set_config('tours.pe_c2', v_classes[2], false);

  insert into public.subcontractors (id, company_name, phone, status)
  values (v_a, 'PRICE_EDIT_TESTS شركة أ', '01099000001', 'approved'),
         (v_b, 'PRICE_EDIT_TESTS شركة ب', '01099000002', 'approved');

  insert into public.subcontractor_vehicles (subcontractor_id, class_slug, label, active)
  values (v_a, v_classes[1], 'PE مركبة أ١', true),
         (v_a, v_classes[2], 'PE مركبة أ٢', true),
         (v_b, v_classes[1], 'PE مركبة ب١', true);

  insert into public.price_sheets (id, subcontractor_id, title, note)
  values (v_s1, v_a, 'PE كشف أ', 'كشف اختبار الاعتماد الجزئي'),
         (v_s2, v_b, 'PE كشف ب', null);

  -- إحداثياتٌ صحراوية داخل مصر وبعيدةٌ عن مسارات المالك الحقيقية: هذا الملف لا
  -- يفشل لأن المشروع نجح ولا ينجح لأن مسار المالك موجود.
  insert into public.price_lists
    (id, subcontractor_id, sheet_id, title,
     origin_label, origin_lat, origin_lng, dest_label, dest_lat, dest_lng, status)
  values
    (v_l1, v_a, v_s1,  'PE مسار ١', 'PE_ALFA', 24.80, 28.20, 'PE_BETA', 25.90, 29.40, 'pending'),
    (v_l2, v_a, v_s1,  'PE مسار ٢', 'PE_ALFA', 24.80, 28.20, 'PE_GAMA', 23.60, 30.10, 'pending'),
    (v_l3, v_a, v_s1,  'PE مسار ٣', 'PE_BETA', 25.90, 29.40, 'PE_DELT', 27.10, 26.70, 'pending'),
    (v_l4, v_a, v_s1,  'PE مسار ٤', 'PE_GAMA', 23.60, 30.10, 'PE_DELT', 27.10, 26.70, 'pending'),
    (v_la, v_a, v_s1,  'PE مسار معتمد', 'PE_ALFA', 24.80, 28.20, 'PE_DELT', 27.10, 26.70, 'approved'),
    (v_ld, v_a, null,  'PE مسودة مستقلة', 'PE_BETA', 25.90, 29.40, 'PE_GAMA', 23.60, 30.10, 'draft'),
    (v_l5, v_b, v_s2,  'PE مسار متعهدٍ آخر', 'PE_ALFA', 24.80, 28.20, 'PE_BETA', 25.90, 29.40, 'pending');

  insert into public.price_list_items (price_list_id, class_slug, cost)
  values (v_l1, v_classes[1], 1000),
         (v_l2, v_classes[1], 1100),
         (v_l3, v_classes[1], 1200),
         (v_l4, v_classes[1], 1300),
         (v_la, v_classes[1],  900),
         (v_ld, v_classes[1],  500),
         (v_l5, v_classes[1],  700);

  -- الهويات: بدونها لا يثبت هذا الملف شيئاً عن الحواجز، فغيابها فشلٌ لا تخطٍّ
  begin
    insert into auth.users (id, email) values
      (v_pa,   'price-edit-a@local.invalid'),
      (v_pb,   'price-edit-b@local.invalid'),
      (v_padm, 'price-edit-admin@local.invalid');
  exception
    when others then
      raise exception 'تعذّر إنشاء هويات الاختبار في auth.users (%) — هذا الملف يقيس حواجز صلاحيات ولا يجوز تشغيله بهوية المالك', sqlerrm;
  end;

  insert into public.profiles (id, role, full_name) values
    (v_pa,   'subcontractor', 'PE متعهد أ'),
    (v_pb,   'subcontractor', 'PE متعهد ب'),
    (v_padm, 'admin',         'PE مشرف اختبار')
  on conflict (id) do update set role = excluded.role;

  update public.subcontractors set profile_id = v_pa where id = v_a;
  update public.subcontractors set profile_id = v_pb where id = v_b;

  perform set_config('request.jwt.claim.sub', v_pa::text, false);
  if public.current_subcontractor_id() is distinct from v_a then
    raise exception '(أ-٣) هوية المتعهد لا تُحلّ: % والمتوقع %',
      coalesce(public.current_subcontractor_id()::text, 'بلا'), v_a;
  end if;

  perform set_config('request.jwt.claim.sub', v_padm::text, false);
  if not public.is_admin() then
    raise exception '(أ-٣) هوية المشرف لا تُحلّ — is_admin() = false';
  end if;

  raise notice '✔ (أ) التركيب: كشفان · ٥ مسارات منتظرة · معتمدةٌ ومسودة · وثلاثُ هويات حقيقية';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ب) اعتمادٌ جزئيّ — مساران من أربعة، والباقي كما هو
-- ----------------------------------------------------------------------------
do $$
declare
  v_s1  constant uuid := '35ee7001-0000-4000-8000-000000000001';
  v_l1  constant uuid := '35ee7003-0000-4000-8000-000000000001';
  v_l2  constant uuid := '35ee7003-0000-4000-8000-000000000002';
  v_l3  constant uuid := '35ee7003-0000-4000-8000-000000000003';
  v_l4  constant uuid := '35ee7003-0000-4000-8000-000000000004';
  v_la  constant uuid := '35ee7003-0000-4000-8000-00000000000a';
  v_res record;
  v_st  text;
begin
  perform set_config('request.jwt.claim.sub', '35ee7002-0000-4000-8000-0000000000ad', false);

  select * into v_res
  from public.review_selected_price_lists(v_s1, array[v_l1, v_l2], true, 'أسعار مقبولة', 2) x;

  if v_res.affected <> 2 or v_res.new_status <> 'approved' then
    raise exception '(ب-١) الاعتماد الجزئي أرجع affected=% status=% — المتوقع ٢/approved',
      v_res.affected, v_res.new_status;
  end if;

  select pl.status into v_st from public.price_lists pl where pl.id = v_l1;
  if v_st <> 'approved' then raise exception '(ب-٢) المسار ١ حالته % لا approved', v_st; end if;
  select pl.status into v_st from public.price_lists pl where pl.id = v_l2;
  if v_st <> 'approved' then raise exception '(ب-٣) المسار ٢ حالته % لا approved', v_st; end if;

  -- 🔴 جوهرُ الوعد: ما لم يُختَر لم يُمَسّ
  select pl.status into v_st from public.price_lists pl where pl.id = v_l3;
  if v_st <> 'pending' then raise exception '(ب-٤) المسار ٣ لم يُختَر وحالته % — الاعتماد اتّسع', v_st; end if;
  select pl.status into v_st from public.price_lists pl where pl.id = v_l4;
  if v_st <> 'pending' then raise exception '(ب-٥) المسار ٤ لم يُختَر وحالته % — الاعتماد اتّسع', v_st; end if;
  select pl.status into v_st from public.price_lists pl where pl.id = v_la;
  if v_st <> 'approved' then raise exception '(ب-٦) المسار المعتمد سلفاً تغيّر إلى %', v_st; end if;

  -- الملاحظة وصلت المُعتمَدين وحدهما
  if (select pl.review_note from public.price_lists pl where pl.id = v_l1) is distinct from 'أسعار مقبولة' then
    raise exception '(ب-٧) ملاحظة الاعتماد لم تُكتب على المسار ١';
  end if;
  if (select pl.review_note from public.price_lists pl where pl.id = v_l3) is not null then
    raise exception '(ب-٨) ملاحظة الاعتماد تسرّبت إلى مسارٍ لم يُختَر';
  end if;

  raise notice '✔ (ب) اعتمادٌ جزئيّ: مساران اعتُمدا · مساران بقيا منتظرين · والمعتمَدة سلفاً لم تُمَسّ';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ج) رفضٌ جزئيّ بسببٍ مكتوب — ولا يُبطل ما اعتُمد
-- ----------------------------------------------------------------------------
do $$
declare
  v_s1  constant uuid := '35ee7001-0000-4000-8000-000000000001';
  v_l1  constant uuid := '35ee7003-0000-4000-8000-000000000001';
  v_l3  constant uuid := '35ee7003-0000-4000-8000-000000000003';
  v_l4  constant uuid := '35ee7003-0000-4000-8000-000000000004';
  v_res record;
  v_st  text;
begin
  perform set_config('request.jwt.claim.sub', '35ee7002-0000-4000-8000-0000000000ad', false);

  select * into v_res
  from public.review_selected_price_lists(v_s1, array[v_l3], false, 'التكلفة أعلى من السوق', 1) x;

  if v_res.affected <> 1 or v_res.new_status <> 'rejected' then
    raise exception '(ج-١) الرفض الجزئي أرجع affected=% status=% — المتوقع ١/rejected',
      v_res.affected, v_res.new_status;
  end if;

  select pl.status into v_st from public.price_lists pl where pl.id = v_l3;
  if v_st <> 'rejected' then raise exception '(ج-٢) المسار ٣ حالته % لا rejected', v_st; end if;
  if (select pl.review_note from public.price_lists pl where pl.id = v_l3)
       is distinct from 'التكلفة أعلى من السوق' then
    raise exception '(ج-٣) سبب الرفض لم يصل المسار ٣ — والمتعهد لا يملك غيره ليعرف المطلوب';
  end if;

  -- 🔴 الرفضُ الجزئيّ لا يُبطل ما اعتُمد ولا يمسّ ما بقي منتظراً
  select pl.status into v_st from public.price_lists pl where pl.id = v_l1;
  if v_st <> 'approved' then raise exception '(ج-٤) الرفض الجزئي أبطل اعتماداً سابقاً (المسار ١ = %)', v_st; end if;
  select pl.status into v_st from public.price_lists pl where pl.id = v_l4;
  if v_st <> 'pending' then raise exception '(ج-٥) الرفض الجزئي مسّ مساراً لم يُختَر (المسار ٤ = %)', v_st; end if;

  raise notice '✔ (ج) رفضٌ جزئيّ بسببٍ مكتوب · الكشف قائمٌ بما بقي · وما اعتُمد لم يُبطَل';
end;
$$;

-- ----------------------------------------------------------------------------
-- (د) الرفضُ بلا سبب مرفوض — قيدٌ مُفوَّضٌ إلى `review_price_list` لا مكتوبٌ هنا
-- ----------------------------------------------------------------------------
do $$
declare
  v_s1   constant uuid := '35ee7001-0000-4000-8000-000000000001';
  v_l4   constant uuid := '35ee7003-0000-4000-8000-000000000004';
  v_hint text;
  v_st   text;
begin
  perform set_config('request.jwt.claim.sub', '35ee7002-0000-4000-8000-0000000000ad', false);

  begin
    perform public.review_selected_price_lists(v_s1, array[v_l4], false, null, 1);
    raise exception '(د-١) الرفض بلا سبب نجح — القيد المُفوَّض لا يعمل';
  exception
    when others then
      if sqlerrm like '(د-١)%' then raise; end if;
      get stacked diagnostics v_hint = pg_exception_hint;
      if coalesce(v_hint, '') <> 'invalid-input' then
        raise exception '(د-٢) رمز الخطأ «%» والمتوقع invalid-input (%)', coalesce(v_hint, 'بلا'), sqlerrm;
      end if;
  end;

  select pl.status into v_st from public.price_lists pl where pl.id = v_l4;
  if v_st <> 'pending' then
    raise exception '(د-٣) رفضٌ فاشل ترك أثراً: المسار ٤ صار %', v_st;
  end if;

  raise notice '✔ (د) الرفض بلا سبب مرفوض — ولا حالةَ كُتبت';
end;
$$;

-- ----------------------------------------------------------------------------
-- (هـ) 🔴 `p_expected` تمنع التوسّع — وأربعُ طفراتٍ تُثبت أنها تفشل فعلاً
--
-- التوكيدُ الذي لا يمكن أن يسقط زينةٌ (‏`LESSONS.md` النمط ٩). فهنا يُحقن في
-- المصدر ما يجعل العددَ الخام يفارق العددَ المُنقّى، ويُقاس أن الكتابة **لم**
-- تقع: معرّفٌ مكرَّر · عددٌ غائب · عددٌ أكبر · معرّفٌ من كشفٍ آخر · مسارٌ بلا كشف.
-- ----------------------------------------------------------------------------
do $$
declare
  v_s1    constant uuid := '35ee7001-0000-4000-8000-000000000001';
  v_l4    constant uuid := '35ee7003-0000-4000-8000-000000000004';
  v_l5    constant uuid := '35ee7003-0000-4000-8000-000000000005';
  v_ld    constant uuid := '35ee7003-0000-4000-8000-00000000000d';
  v_hint  text;
  v_st    text;
  v_st5   text;
  v_std   text;
begin
  perform set_config('request.jwt.claim.sub', '35ee7002-0000-4000-8000-0000000000ad', false);

  -- (هـ-١) طفرة: **معرّفٌ مكرَّر**. لو اشتُقّ p_expected من المصفوفة نفسها لمرّ
  --        هذا النداء بصمت واعتُمد مسارٌ واحد بينما المشرف يظن أنه اعتمد اثنين.
  begin
    perform public.review_selected_price_lists(v_s1, array[v_l4, v_l4], true, null, 2);
    raise exception '(هـ-١) معرّفٌ مكرَّر مرّ — p_expected مشتقّةٌ من المصفوفة نفسها فهي زينة';
  exception
    when others then
      if sqlerrm like '(هـ-١)%' then raise; end if;
      get stacked diagnostics v_hint = pg_exception_hint;
      if coalesce(v_hint, '') <> 'count-changed' then
        raise exception '(هـ-١ب) رمز «%» والمتوقع count-changed (%)', coalesce(v_hint, 'بلا'), sqlerrm;
      end if;
  end;

  -- (هـ-٢) العدد غائب ⇒ لا نداء
  begin
    perform public.review_selected_price_lists(v_s1, array[v_l4], true, null, null);
    raise exception '(هـ-٢) نداءٌ بلا تصريحٍ بالعدد نجح';
  exception
    when others then
      if sqlerrm like '(هـ-٢)%' then raise; end if;
      get stacked diagnostics v_hint = pg_exception_hint;
      if coalesce(v_hint, '') <> 'invalid-input' then
        raise exception '(هـ-٢ب) رمز «%» والمتوقع invalid-input', coalesce(v_hint, 'بلا');
      end if;
  end;

  -- (هـ-٣) عددٌ أكبر مما اختير
  begin
    perform public.review_selected_price_lists(v_s1, array[v_l4], true, null, 3);
    raise exception '(هـ-٣) عددٌ أكبر من الاختيار مرّ';
  exception
    when others then
      if sqlerrm like '(هـ-٣)%' then raise; end if;
      get stacked diagnostics v_hint = pg_exception_hint;
      if coalesce(v_hint, '') <> 'count-changed' then
        raise exception '(هـ-٣ب) رمز «%» والمتوقع count-changed', coalesce(v_hint, 'بلا');
      end if;
  end;

  -- (هـ-٤) 🔴 معرّفٌ من كشف متعهدٍ آخر — أخطر توسّعٍ ممكن
  begin
    perform public.review_selected_price_lists(v_s1, array[v_l4, v_l5], true, null, 2);
    raise exception '(هـ-٤) مسارُ متعهدٍ آخر اعتُمد عبر كشفنا';
  exception
    when others then
      if sqlerrm like '(هـ-٤)%' then raise; end if;
      get stacked diagnostics v_hint = pg_exception_hint;
      if coalesce(v_hint, '') <> 'not-found' then
        raise exception '(هـ-٤ب) رمز «%» والمتوقع not-found (%)', coalesce(v_hint, 'بلا'), sqlerrm;
      end if;
  end;

  -- (هـ-٥) مسارٌ مستقلٌّ بلا كشف لا يدخل قرارَ كشف
  begin
    perform public.review_selected_price_lists(v_s1, array[v_ld], true, null, 1);
    raise exception '(هـ-٥) مسارٌ بلا كشف اعتُمد ضمن كشف';
  exception
    when others then
      if sqlerrm like '(هـ-٥)%' then raise; end if;
      get stacked diagnostics v_hint = pg_exception_hint;
      if coalesce(v_hint, '') <> 'not-found' then
        raise exception '(هـ-٥ب) رمز «%» والمتوقع not-found', coalesce(v_hint, 'بلا');
      end if;
  end;

  -- (هـ-٦) اختيارٌ فارغ
  begin
    perform public.review_selected_price_lists(v_s1, '{}'::uuid[], true, null, 0);
    raise exception '(هـ-٦) اختيارٌ فارغ مرّ';
  exception
    when others then
      if sqlerrm like '(هـ-٦)%' then raise; end if;
      get stacked diagnostics v_hint = pg_exception_hint;
      if coalesce(v_hint, '') <> 'invalid-input' then
        raise exception '(هـ-٦ب) رمز «%» والمتوقع invalid-input', coalesce(v_hint, 'بلا');
      end if;
  end;

  -- 🔴 والأهم: **ولا حالةٌ واحدة كُتبت** في الطفرات الستّ
  select pl.status into v_st  from public.price_lists pl where pl.id = v_l4;
  select pl.status into v_st5 from public.price_lists pl where pl.id = v_l5;
  select pl.status into v_std from public.price_lists pl where pl.id = v_ld;
  if v_st <> 'pending' or v_st5 <> 'pending' or v_std <> 'draft' then
    raise exception '(هـ-٧) نداءٌ مرفوض ترك أثراً: ل٤=% ل٥=% لمسودة=%', v_st, v_st5, v_std;
  end if;

  raise notice '✔ (هـ) p_expected تفشل فعلاً: مكرَّرٌ · غائبٌ · أكبرُ · كشفٌ آخر · بلا كشف · فارغ — وصفرُ كتابة';
end;
$$;

-- ----------------------------------------------------------------------------
-- (و) المتعهد لا يعتمد ولا يرفض بهذا الباب — بهوية `authenticated` حقيقية
-- ----------------------------------------------------------------------------
do $$
declare
  v_s1   constant uuid := '35ee7001-0000-4000-8000-000000000001';
  v_l4   constant uuid := '35ee7003-0000-4000-8000-000000000004';
  v_pa   constant uuid := '35ee7002-0000-4000-8000-00000000000a';
  v_hint text;
  v_st   text;
begin
  perform set_config('request.jwt.claim.sub', v_pa::text, false);

  begin
    execute 'set local role authenticated';
    begin
      perform public.review_selected_price_lists(v_s1, array[v_l4], true, null, 1);
      execute 'reset role';
      raise exception '(و-١) المتعهد اعتمد مسارَ نفسه';
    exception
      when others then
        get stacked diagnostics v_hint = pg_exception_hint;
        execute 'reset role';
        if sqlerrm like '(و-١)%' then raise; end if;
        if coalesce(v_hint, '') <> 'forbidden' then
          raise exception '(و-٢) رمز «%» والمتوقع forbidden (%)', coalesce(v_hint, 'بلا'), sqlerrm;
        end if;
    end;
  exception
    when others then
      begin execute 'reset role'; exception when others then null; end;
      raise;
  end;

  select pl.status into v_st from public.price_lists pl where pl.id = v_l4;
  if v_st <> 'pending' then
    raise exception '(و-٣) محاولةُ المتعهد تركت أثراً: المسار ٤ صار %', v_st;
  end if;

  perform set_config('request.jwt.claim.sub', '35ee7002-0000-4000-8000-0000000000ad', false);
  raise notice '✔ (و) المتعهد مردودٌ بـforbidden — ولا حالةَ كُتبت';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ز) تعديلٌ على مسودة: فوريّ · بلا إشعار · والحالة تبقى مسودة
-- ----------------------------------------------------------------------------
do $$
declare
  v_a     constant uuid := '35ee7000-0000-4000-8000-00000000000a';
  v_ld    constant uuid := '35ee7003-0000-4000-8000-00000000000d';
  v_padm  constant uuid := '35ee7002-0000-4000-8000-0000000000ad';
  v_c1    text := current_setting('tours.pe_c1');
  v_res   record;
  v_cost  numeric;
  v_st    text;
  v_before integer;
  v_after  integer;
  v_aud   record;
begin
  perform set_config('request.jwt.claim.sub', v_padm::text, false);

  -- العدُّ محصورٌ في فيكسترتنا: `recipient_id` متعهدنا وحده
  select count(*) into v_before from public.notifications n where n.recipient_id = v_a;

  select * into v_res
  from public.set_price_list_item_cost(v_ld, v_c1, '650', '500') x;

  if not v_res.changed or v_res.notified or v_res.list_status <> 'draft' or v_res.new_cost <> 650 then
    raise exception '(ز-١) المسودة: changed=% notified=% status=% cost=% — المتوقع t/f/draft/650',
      v_res.changed, v_res.notified, v_res.list_status, v_res.new_cost;
  end if;

  select pli.cost into v_cost from public.price_list_items pli
   where pli.price_list_id = v_ld and pli.class_slug = v_c1;
  if v_cost <> 650 then raise exception '(ز-٢) التكلفة لم تُحفظ فوراً: %', v_cost; end if;

  select pl.status into v_st from public.price_lists pl where pl.id = v_ld;
  if v_st <> 'draft' then raise exception '(ز-٣) المسودة تغيّرت حالتها إلى %', v_st; end if;

  select count(*) into v_after from public.notifications n where n.recipient_id = v_a;
  if v_after <> v_before then
    raise exception '(ز-٤) تعديلُ مسودةٍ أطلق % إشعاراً — والمسودة لا يُسعَّر بها أحد', v_after - v_before;
  end if;

  -- التدقيق يقع في كل الأحوال (مُشغّلٌ قائم) — والملاحظة تحمل القائمة والقيمتين
  select a.actor, a.actor_kind, a.note,
         (a.changes -> 'cost' ->> 'from')::numeric as f,
         (a.changes -> 'cost' ->> 'to')::numeric   as t
    into v_aud
  from public.audit_log a
  where a.entity = 'price_list_items' and a.note like '%' || v_ld::text || '%'
  order by a.occurred_at desc, a.id desc limit 1;

  if v_aud.actor is distinct from v_padm or v_aud.actor_kind <> 'admin' then
    raise exception '(ز-٥) سطر التدقيق ليس باسم المشرف: actor=% kind=%',
      coalesce(v_aud.actor::text, 'بلا'), coalesce(v_aud.actor_kind, 'بلا');
  end if;
  if v_aud.f <> 500 or v_aud.t <> 650 then
    raise exception '(ز-٦) قيمتا قبل/بعد في التدقيق % ⇐ % والمتوقع ٥٠٠ ⇐ ٦٥٠', v_aud.f, v_aud.t;
  end if;

  raise notice '✔ (ز) المسودة: حفظٌ فوريّ · صفرُ إشعارات · الحالة كما هي · وتدقيقٌ بقيمتَي قبل/بعد';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ح) تعديلٌ على معتمدة: فوريّ · يكتب تدقيقاً · **ويُشعر المتعهد**
--     وفيه أيضاً: الأرقام العربية الهندية تُقبل كما تُقبل في بقية النماذج.
-- ----------------------------------------------------------------------------
do $$
declare
  v_a      constant uuid := '35ee7000-0000-4000-8000-00000000000a';
  v_la     constant uuid := '35ee7003-0000-4000-8000-00000000000a';
  v_padm   constant uuid := '35ee7002-0000-4000-8000-0000000000ad';
  v_c1     text := current_setting('tours.pe_c1');
  v_res    record;
  v_st     text;
  v_before integer;
  v_after  integer;
  v_n      record;
  v_aud    record;
  v_cur    text;
begin
  perform set_config('request.jwt.claim.sub', v_padm::text, false);
  select count(*) into v_before from public.notifications n where n.recipient_id = v_a;

  -- «١٢٣٤٫٥» بأرقامٍ عربيةٍ هندية وفاصلةٍ عشرية عربية
  select * into v_res
  from public.set_price_list_item_cost(v_la, v_c1, '١٢٣٤٫٥', '900') x;

  if not v_res.changed or not v_res.notified
     or v_res.list_status <> 'approved' or v_res.new_cost <> 1234.5 then
    raise exception '(ح-١) المعتمدة: changed=% notified=% status=% cost=% — المتوقع t/t/approved/1234.5',
      v_res.changed, v_res.notified, v_res.list_status, v_res.new_cost;
  end if;

  if (select pli.cost from public.price_list_items pli
       where pli.price_list_id = v_la and pli.class_slug = v_c1) <> 1234.5 then
    raise exception '(ح-٢) الأرقام العربية الهندية لم تُحفظ رقماً صحيحاً';
  end if;

  -- 🔴 المعتمدة تبقى معتمدة: تعديلُ المشرف ليس إعادةَ إرسالٍ من المتعهد
  select pl.status into v_st from public.price_lists pl where pl.id = v_la;
  if v_st <> 'approved' then
    raise exception '(ح-٣) تعديل المشرف أنزل القائمة المعتمدة إلى % — الأثرُ الفوريّ ضاع', v_st;
  end if;

  -- الإشعار: واحدٌ فقط، إلى المتعهد، بالحدث الصحيح، وبالقيمتين
  select count(*) into v_after from public.notifications n where n.recipient_id = v_a;
  if v_after <> v_before + 1 then
    raise exception '(ح-٤) عدد إشعارات المتعهد % ⇐ % والمتوقع زيادةً بواحد', v_before, v_after;
  end if;

  select n.event, n.recipient_kind, n.recipient_id, n.status,
         (n.payload ->> 'oldCost')::numeric as old_cost,
         (n.payload ->> 'newCost')::numeric as new_cost,
         n.payload ->> 'classSlug'  as class_slug,
         n.payload ->> 'currency'   as currency,
         n.payload ->> 'priceListId' as list_id
    into v_n
  from public.notifications n
  where n.recipient_id = v_a
  order by n.created_at desc, n.id desc limit 1;

  if v_n.event <> 'partner_price_edited' then
    raise exception '(ح-٥) حدث الإشعار «%» والمتوقع partner_price_edited', v_n.event;
  end if;
  if v_n.recipient_kind <> 'partner' then
    raise exception '(ح-٦) وجهة الإشعار «%» لا partner — إشعارُ تعديلٍ يذهب إلى صاحب السعر', v_n.recipient_kind;
  end if;
  if v_n.old_cost <> 900 or v_n.new_cost <> 1234.5 then
    raise exception '(ح-٧) قيمتا الإشعار % ⇐ % والمتوقع ٩٠٠ ⇐ ١٢٣٤٫٥', v_n.old_cost, v_n.new_cost;
  end if;
  if v_n.class_slug <> v_c1 or v_n.list_id <> v_la::text then
    raise exception '(ح-٨) الإشعار لا يسمّي الفئة أو المسار (% · %)', v_n.class_slug, v_n.list_id;
  end if;

  -- العملة من الإعدادات لا من نصٍّ محفور
  select ps.currency into v_cur from public.pricing_settings ps limit 1;
  if v_n.currency is distinct from coalesce(v_cur, 'EGP') then
    raise exception '(ح-٩) عملة الإشعار «%» والإعدادات تقول «%»', v_n.currency, coalesce(v_cur, 'EGP');
  end if;

  -- 🔒 ولا هامشَ ولا سعرَ عميلٍ في حمولةٍ تصل المتعهد (D-19 مقلوبةً)
  if (select n2.payload from public.notifications n2 where n2.id =
        (select n3.id from public.notifications n3 where n3.recipient_id = v_a
          order by n3.created_at desc, n3.id desc limit 1))
     ?| array['margin', 'marginAmount', 'customerPrice', 'price', 'total'] then
    raise exception '(ح-١٠) حمولة الإشعار تحمل هامشاً أو سعرَ عميل — وهي تصل المتعهد';
  end if;

  -- سطر التدقيق: باسم المشرف وبقيمتَي قبل/بعد
  select a.actor, a.actor_kind, a.note,
         (a.changes -> 'cost' ->> 'from')::numeric as f,
         (a.changes -> 'cost' ->> 'to')::numeric   as t
    into v_aud
  from public.audit_log a
  where a.entity = 'price_list_items' and a.note like '%' || v_la::text || '%'
  order by a.occurred_at desc, a.id desc limit 1;

  if v_aud.actor is distinct from v_padm or v_aud.actor_kind <> 'admin' then
    raise exception '(ح-١١) سطر التدقيق ليس باسم المشرف: % / %',
      coalesce(v_aud.actor::text, 'بلا'), coalesce(v_aud.actor_kind, 'بلا');
  end if;
  if v_aud.f <> 900 or v_aud.t <> 1234.5 then
    raise exception '(ح-١٢) قيمتا التدقيق % ⇐ % والمتوقع ٩٠٠ ⇐ ١٢٣٤٫٥', v_aud.f, v_aud.t;
  end if;
  if v_aud.note not like '%مُسعَّرٌ به الآن%' then
    raise exception '(ح-١٣) ملاحظة التدقيق لا تقول إن الرقم مُسعَّرٌ به الآن: %', v_aud.note;
  end if;

  raise notice '✔ (ح) المعتمدة: حفظٌ فوريّ · تبقى معتمدة · تدقيقٌ باسم المشرف · وإشعارٌ واحدٌ للمتعهد بالقيمتين';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ح-ب) لا تغيير ⇒ لا كتابة ولا إشعار — «إنذارٌ يرنّ دائماً لا يُسمع»
-- ----------------------------------------------------------------------------
do $$
declare
  v_a      constant uuid := '35ee7000-0000-4000-8000-00000000000a';
  v_la     constant uuid := '35ee7003-0000-4000-8000-00000000000a';
  v_c1     text := current_setting('tours.pe_c1');
  v_res    record;
  v_before integer;
  v_after  integer;
begin
  perform set_config('request.jwt.claim.sub', '35ee7002-0000-4000-8000-0000000000ad', false);
  select count(*) into v_before from public.notifications n where n.recipient_id = v_a;

  select * into v_res
  from public.set_price_list_item_cost(v_la, v_c1, '1234.5', '1234.5') x;

  if v_res.changed or v_res.notified then
    raise exception '(ح-ب-١) قيمةٌ لم تتغيّر أُعلنت تغييراً: changed=% notified=%',
      v_res.changed, v_res.notified;
  end if;

  select count(*) into v_after from public.notifications n where n.recipient_id = v_a;
  if v_after <> v_before then
    raise exception '(ح-ب-٢) إشعارٌ أُطلق بلا تغيير (% ⇐ %)', v_before, v_after;
  end if;

  raise notice '✔ (ح-ب) إعادةُ كتابةِ نفس الرقم: لا تغيير ولا إشعار';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ط) رقمٌ غير منتهٍ يُرفض — طفرةٌ لكل شكل، والقيمة القديمة سليمة بعد كلٍّ منها
--
-- 🔴 التوكيدُ يقرأ القيمة **الخام في القاعدة** بعد كل محاولة، لا رمزَ الخطأ
--    وحده: حارسٌ يرمي ثم يكتب أسوأُ من حارسٍ لا يرمي.
-- ----------------------------------------------------------------------------
do $$
declare
  v_la    constant uuid := '35ee7003-0000-4000-8000-00000000000a';
  v_c1    text := current_setting('tours.pe_c1');
  v_bad   text;
  v_hint  text;
  v_cost  numeric;
  v_raised boolean;
begin
  perform set_config('request.jwt.claim.sub', '35ee7002-0000-4000-8000-0000000000ad', false);

  -- «12,,5» و«1,234» و«١٬٢٣٤» ليست زينةً في هذه القائمة: بلا قرارِ «المبهم يُرفض
  -- ولا يُصلَّح» تصير الأولى ١٢٥ صامتةً — خطأٌ مطبعيّ يتحوّل مالاً.
  foreach v_bad in array array['NaN', 'nan', 'Infinity', '-Infinity', '1e1000',
                               'أرقام', '', '   ', '12,,5', '1,234', '١٬٢٣٤', '-5']
  loop
    v_raised := false;
    begin
      perform public.set_price_list_item_cost(v_la, v_c1, v_bad, '1234.5');
    exception
      when others then
        v_raised := true;
        get stacked diagnostics v_hint = pg_exception_hint;
        if coalesce(v_hint, '') <> 'invalid-input' then
          raise exception '(ط-١) «%» رُفض برمز «%» والمتوقع invalid-input (%)',
            v_bad, coalesce(v_hint, 'بلا'), sqlerrm;
        end if;
    end;

    if not v_raised then
      raise exception '(ط-٢) «%» عبرت إلى عمود مال — وهذا بابُ NaN نفسه الذي أُغلق في 0108', v_bad;
    end if;

    select pli.cost into v_cost from public.price_list_items pli
     where pli.price_list_id = v_la and pli.class_slug = v_c1;
    if v_cost is distinct from 1234.5 then
      raise exception '(ط-٣) بعد رفض «%» صارت التكلفة % — الحارس رمى ثم كتب', v_bad, v_cost;
    end if;
  end loop;

  -- وفئةٌ مجهولة تُسمّى ولا تُبتلع
  begin
    perform public.set_price_list_item_cost(v_la, 'no-such-class-pe', '100', '');
    raise exception '(ط-٤) فئةٌ مجهولة قُبلت';
  exception
    when others then
      if sqlerrm like '(ط-٤)%' then raise; end if;
      get stacked diagnostics v_hint = pg_exception_hint;
      if coalesce(v_hint, '') <> 'invalid-input' then
        raise exception '(ط-٥) رمز الفئة المجهولة «%» والمتوقع invalid-input', coalesce(v_hint, 'بلا');
      end if;
  end;

  raise notice '✔ (ط) اثنا عشر شكلاً غير منتهٍ أو مبهمٍ أو غير رقميّ — كلها مرفوضة والقيمة القديمة سليمة بعد كلٍّ منها';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ي) التزامن — مشرفان على الخانة نفسها
--
-- الآلية: مقارنةُ القيمة المرئية تحت `for update`. والمقياسُ هنا **سلوكُ الكود**
-- لا محتوى القاعدة: نداءٌ يحمل قيمةً مرئيةً بائتة يُردّ بالرقمين ولا يكتب.
-- ----------------------------------------------------------------------------
do $$
declare
  v_a      constant uuid := '35ee7000-0000-4000-8000-00000000000a';
  v_la     constant uuid := '35ee7003-0000-4000-8000-00000000000a';
  v_c1     text := current_setting('tours.pe_c1');
  v_c2     text := current_setting('tours.pe_c2');
  v_hint   text;
  v_cost   numeric;
  v_res    record;
  v_before integer;
  v_after  integer;
begin
  perform set_config('request.jwt.claim.sub', '35ee7002-0000-4000-8000-0000000000ad', false);

  -- (ي-١) شاشةٌ تعرض ٩٠٠ والقيمة صارت ١٢٣٤٫٥ ⇒ لا كتابة
  begin
    perform public.set_price_list_item_cost(v_la, v_c1, '1500', '900');
    raise exception '(ي-١) تعديلٌ فوق تعديلِ زميلٍ مرّ صامتاً — وهذا هو الضياع بعينه';
  exception
    when others then
      if sqlerrm like '(ي-١)%' then raise; end if;
      get stacked diagnostics v_hint = pg_exception_hint;
      if coalesce(v_hint, '') <> 'stale' then
        raise exception '(ي-١ب) رمز «%» والمتوقع stale (%)', coalesce(v_hint, 'بلا'), sqlerrm;
      end if;
  end;

  select pli.cost into v_cost from public.price_list_items pli
   where pli.price_list_id = v_la and pli.class_slug = v_c1;
  if v_cost <> 1234.5 then
    raise exception '(ي-٢) نداءٌ بائتٌ مرفوضٌ غيّر القيمة إلى %', v_cost;
  end if;

  -- (ي-٣) «لا سعر» بينما السعر موجود ⇒ لا كتابة
  begin
    perform public.set_price_list_item_cost(v_la, v_c1, '1500', '');
    raise exception '(ي-٣) «لا سعر» فوق سعرٍ قائم مرّ';
  exception
    when others then
      if sqlerrm like '(ي-٣)%' then raise; end if;
      get stacked diagnostics v_hint = pg_exception_hint;
      if coalesce(v_hint, '') <> 'stale' then
        raise exception '(ي-٣ب) رمز «%» والمتوقع stale', coalesce(v_hint, 'بلا');
      end if;
  end;

  -- (ي-٤) سعرٌ مرئيّ لفئةٍ بلا صف ⇒ لا كتابة
  begin
    perform public.set_price_list_item_cost(v_la, v_c2, '800', '700');
    raise exception '(ي-٤) قيمةٌ مرئيةٌ لفئةٍ بلا صف مرّت';
  exception
    when others then
      if sqlerrm like '(ي-٤)%' then raise; end if;
      get stacked diagnostics v_hint = pg_exception_hint;
      if coalesce(v_hint, '') <> 'stale' then
        raise exception '(ي-٤ب) رمز «%» والمتوقع stale', coalesce(v_hint, 'بلا');
      end if;
  end;
  if exists (select 1 from public.price_list_items pli
              where pli.price_list_id = v_la and pli.class_slug = v_c2) then
    raise exception '(ي-٥) نداءٌ بائتٌ مرفوضٌ أنشأ صفَّ سعرٍ جديداً';
  end if;

  -- (ي-٦) الفراغُ الصحيح يعني «لا سعر» ⇒ إضافةُ فئةٍ جديدة بالنقر نفسه، وعلى
  --       المعتمدة تُشعِر أيضاً وقيمتُها القديمة `null` صراحةً
  select count(*) into v_before from public.notifications n where n.recipient_id = v_a;
  select * into v_res from public.set_price_list_item_cost(v_la, v_c2, '٨٠٠', '') x;
  if not v_res.changed or not v_res.notified or v_res.new_cost <> 800 then
    raise exception '(ي-٦) إضافةُ فئةٍ جديدة: changed=% notified=% cost=%',
      v_res.changed, v_res.notified, v_res.new_cost;
  end if;
  select count(*) into v_after from public.notifications n where n.recipient_id = v_a;
  if v_after <> v_before + 1 then
    raise exception '(ي-٧) إضافةُ سعرٍ على معتمدةٍ لم تُشعر المتعهد';
  end if;
  /*
   * 🔴 يُنتقى الصفُّ **بالفئة** لا بـ«الأحدث».
   *
   * كان الترتيب `created_at desc, id desc` — وكلُّ صفوف المعاملة الواحدة تحمل
   * `created_at` واحداً (‏`now()` تُجمَّد على مستوى المعاملة)، فيسقط الحسمُ على
   * `id` وهو **uuid عشوائيّ لا تسلسليّ** ⇒ التقاطُ صفٍّ اعتباطيّ من إشعارات
   * الخطوات السابقة. والآليةُ نفسُها سليمة: قِيس حيّاً أن الحمولة تحمل
   * `"oldCost": null` عند إضافة فئةٍ لم يكن لها سعر.
   */
  if (select n.payload -> 'oldCost' from public.notifications n
       where n.recipient_id = v_a
         and n.payload ->> 'classSlug' = v_c2
         and n.payload ->> 'priceListId' = v_la::text
       limit 1)
     is distinct from 'null'::jsonb then
    raise exception '(ي-٨) إضافةُ سعرٍ جديد لم تقل إن ما قبله «بلا سعر»';
  end if;

  raise notice '✔ (ي) التزامن: قيمةٌ مرئيةٌ بائتة تُردّ بالرقمين · وصفرُ كتابة · والفراغُ يعني «لا سعر» فيُضيف';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ك) متعهدٌ لا يستطيع تحرير قائمته المعتمدة من هذا الباب
--
-- ⚠ والباب الآخر ليس ثغرةً: `upsert_price_list` يملكه المتعهد، و`price_list_items
--   _demote_parent` يُنزل المعتمدةَ إلى «قيد المراجعة» فور مسّه إياها — أي أنه
--   **لا يستطيع تغيير رقمٍ يُسعَّر به عميلٌ الآن بلا مراجعتنا**. وهذا الفحص يقيس
--   البابَ الجديد وحده.
-- ----------------------------------------------------------------------------
do $$
declare
  v_la   constant uuid := '35ee7003-0000-4000-8000-00000000000a';
  v_pa   constant uuid := '35ee7002-0000-4000-8000-00000000000a';
  v_pb   constant uuid := '35ee7002-0000-4000-8000-00000000000b';
  v_c1   text := current_setting('tours.pe_c1');
  v_hint text;
  v_cost numeric;
  v_who  uuid;
begin
  foreach v_who in array array[v_pa, v_pb] loop
    perform set_config('request.jwt.claim.sub', v_who::text, false);
    begin
      execute 'set local role authenticated';
      begin
        perform public.set_price_list_item_cost(v_la, v_c1, '10', '1234.5');
        execute 'reset role';
        raise exception '(ك-١) المتعهد % حرّر قائمةً معتمدة', v_who;
      exception
        when others then
          get stacked diagnostics v_hint = pg_exception_hint;
          execute 'reset role';
          if sqlerrm like '(ك-١)%' then raise; end if;
          if coalesce(v_hint, '') <> 'forbidden' then
            raise exception '(ك-٢) رمز «%» للمتعهد % والمتوقع forbidden (%)',
              coalesce(v_hint, 'بلا'), v_who, sqlerrm;
          end if;
      end;
    exception
      when others then
        begin execute 'reset role'; exception when others then null; end;
        raise;
    end;
  end loop;

  perform set_config('request.jwt.claim.sub', '35ee7002-0000-4000-8000-0000000000ad', false);
  select pli.cost into v_cost from public.price_list_items pli
   where pli.price_list_id = v_la and pli.class_slug = v_c1;
  if v_cost <> 1234.5 then
    raise exception '(ك-٣) محاولةُ المتعهد غيّرت التكلفة إلى %', v_cost;
  end if;

  raise notice '✔ (ك) متعهدُ القائمة ومتعهدٌ آخر: كلاهما forbidden — والتكلفة سليمة';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ل) الصلاحيات — صفرٌ لـanon على الدالتين
-- ----------------------------------------------------------------------------
do $$
declare
  v_review constant text := 'public.review_selected_price_lists(uuid, uuid[], boolean, text, integer)';
  v_cost   constant text := 'public.set_price_list_item_cost(uuid, text, text, text)';
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    if has_function_privilege('anon', v_review, 'execute') then
      raise exception '(ل-١) anon يستطيع تنفيذ review_selected_price_lists';
    end if;
    if has_function_privilege('anon', v_cost, 'execute') then
      raise exception '(ل-٢) anon يستطيع تنفيذ set_price_list_item_cost';
    end if;
  end if;
  if not has_function_privilege('authenticated', v_review, 'execute') then
    raise exception '(ل-٣) authenticated لا يستطيع تنفيذ review_selected_price_lists — اللوحة لن تعمل';
  end if;
  if not has_function_privilege('authenticated', v_cost, 'execute') then
    raise exception '(ل-٤) authenticated لا يستطيع تنفيذ set_price_list_item_cost — اللوحة لن تعمل';
  end if;

  raise notice '✔ (ل) الصلاحيات: صفرٌ لـanon · وexecute لـauthenticated';
end;
$$;

-- ----------------------------------------------------------------------------
-- التنظيف النهائي — زائدٌ لا ضارّ: المُشغّل يُرجع الملف كله بـROLLBACK
-- ----------------------------------------------------------------------------
delete from public.notifications n
 where n.recipient_id in (
   select s.id from public.subcontractors s where s.company_name like 'PRICE_EDIT_TESTS%');
delete from public.price_list_items pli
 where pli.price_list_id in (
   select pl.id from public.price_lists pl
   join public.subcontractors s on s.id = pl.subcontractor_id
   where s.company_name like 'PRICE_EDIT_TESTS%');
delete from public.price_lists pl
 where pl.subcontractor_id in (
   select s.id from public.subcontractors s where s.company_name like 'PRICE_EDIT_TESTS%');
delete from public.price_sheets ps
 where ps.subcontractor_id in (
   select s.id from public.subcontractors s where s.company_name like 'PRICE_EDIT_TESTS%');
delete from public.subcontractors s where s.company_name like 'PRICE_EDIT_TESTS%';
delete from public.profiles p
 where p.id in ('35ee7002-0000-4000-8000-00000000000a'::uuid,
                '35ee7002-0000-4000-8000-00000000000b'::uuid,
                '35ee7002-0000-4000-8000-0000000000ad'::uuid);
do $$
begin
  delete from auth.users u
   where u.id in ('35ee7002-0000-4000-8000-00000000000a'::uuid,
                  '35ee7002-0000-4000-8000-00000000000b'::uuid,
                  '35ee7002-0000-4000-8000-0000000000ad'::uuid);
exception when others then null;
end;
$$;

do $$
begin
  perform set_config('request.jwt.claim.sub', '', false);
  raise notice 'ALL PASSED';
end;
$$;
