-- ============================================================================
-- partner_profile_tests.sql — **ملفُّ المستخدم للمتعهد**: ما يقرؤه، وما يعدّله،
--                              وما يبقى محجوباً عنه بعد دمج ثلاث شاشات في واحدة
--                              (الجبهة: ملفُّ مستخدمٍ للمتعهد — هجرة 0137)
--
-- كيف تشغّله: `pnpm db:test partner_profile`
-- النجاح = آخر سطر «ALL PASSED». وأي فشل exception عربية فيها المتوقع والفعلي.
--
-- ══════════════════════════════════════════════════════════════════════════
--  🔴 ما يحرسه هذا الملف: **أن يكون الدمجُ نقلَ عرضٍ لا فتحَ باب**
-- ══════════════════════════════════════════════════════════════════════════
--
-- في 2026-08-19 انتقلت ثلاثُ شاشاتٍ إلى صفحةٍ واحدة (`/portal/profile`):
-- بياناتُ الحساب · قنواتُ التنبيه · الاتفاقية. ونقلُ العرض **لا يجوز أن يغيّر
-- شيئاً في القاعدة** — فما كان محجوباً يبقى محجوباً، وما كان حاجزاً يبقى حاجزاً.
-- وهذا الملف يقيس ذلك بأربع دعاوى، كلٌّ منها ينهار الدمجُ بسقوطها:
--
--   ١) **الشريك يقرأ صفَّه هو ويعدّله، ولا يقرأ صفَّ غيره ولا يعدّله.**
--      الصفحةُ الواحدة تعرض ثلاثة مصادر — وثلاثةُ منافذَ في شاشةٍ واحدة أوسع
--      من منفذٍ في ثلاث.
--   ٢) **قنواتُه له وحده**: يكتبها بنداءٍ بلا وسيطِ شريك، ولا يمسّ قنوات غيره.
--   ٣) 🔴 **بوابةُ التوقيع الأول تبقى حاجزاً لا يُتخطّى.** متعهدٌ لم يوقّع
--      وانقضت مهلته **لا يعمل**: يسقط من `dispatch_pool`، ولا يرى عرضاً قائماً،
--      ولا يلتزم برحلةِ عميلٍ دفع. والنقلُ لا يمرّ من هنا بحرف — وهذا ما يُثبَت.
--   ٤) **`portal_agreement_history()` (0137) تُرجع نُسخَ صاحبِ الجلسة وحده**،
--      بنصّها المؤرشف لا بنصّ الساري — وهي الدالة التي جعلت وعدَ الشاشة
--      («تعود إليها في أي وقت») قابلاً للتنفيذ بعد أول تعديلٍ للاتفاقية.
--
-- ── 🔬 وما يجب أن تُسقطه هذه المجموعة — أربعُ طفراتٍ تُبنى وتُشغَّل فعلاً ───────
--
--   | الطفرة | أين تُشغَّل | التأكيد الذي يجب أن يسقط |
--   |---|---|---|
--   | حذف `partner_agreement_ok` من `dispatch_pool` | (ج-٥) | (ج-٢) المتخلّف يدخل الحوض |
--   | حذف شرط `subcontractor_id` من `portal_agreement_history` | (و-١) | (د-٢) شريكٌ يقرأ توقيع غيره |
--   | ربط `portal_agreement_history` بالإصدار **المنشور** بدل الموقَّع | (و-٢) | (د-٣) نصُّ المؤرشفة يصير نصَّ الساري |
--   | إرخاء سياسة `subcontractors_select_own_or_admin` إلى `true` | (و-٣) | (أ-٢) شريكٌ يقرأ صفَّ شريك |
--
-- ⚠ وكلُّ طفرةٍ تُبنى من **التعريف الحيّ** (`pg_get_functiondef` — D-58) باستبدال
--   سلسلةٍ واحدة، لا بإعادة كتابة جسمٍ بيد: جسمٌ مكتوبٌ هنا ينحرف عن الحيّ يوم
--   يُعدَّل الأصل، فتصير الطفرةُ تقيس نسختي أنا لا نسخةَ الإنتاج.
--
-- ── صفرُ أثر ───────────────────────────────────────────────────────────────
-- المجموعة تكتب صفوفَ قبولٍ **لا يستطيع أحدٌ حذفها** بعد 0113، وتؤرشف الإصدارَ
-- الحقيقي مؤقتاً، وتُبدّل جسمَ دالتين وسياسةَ جدول. فلا تُشغَّل إلا عبر
-- `pnpm db:test` الذي يفتح معاملةً ويُرجعها — والعقدُ يُفحص **قبل أول كتابة**.
--
-- ── ولا بيانات حقيقية ─────────────────────────────────────────────────────
-- ممرٌّ صحراويٌّ (قارة أم الصغير ← الفرافرة) يُثبَت في (٠) أن **صفر متعهدٍ
-- حقيقي** يغطيه — فلا يفشل الملف لأن المشروع نجح. والفئةُ والتعريفة من
-- `quote_price` لا من رقمٍ محفور.
--
-- المرجع: supabase/migrations/0137_partner_profile.sql
--         · 0113 (الاتفاقية والقبول وحاجز البثّ) · 0054 (قنوات المتعهد)
--         · 0011 (عزل المتعهدين) · D-19 · D-20 · D-48 · D-58 · القاعدة ١٦
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (٠) الشروط المسبقة — قراءةٌ محضة، وعقدُ المُشغّل قبل أول كتابة
-- ----------------------------------------------------------------------------
do $$
declare
  v_missing text;
  v_cov     integer;
  v_who     text;
  v_classes text[];
  v_admin   uuid;
begin
  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claims', '', false);

  select string_agg(t, '، ') into v_missing
  from (values ('public.subcontractors'), ('public.partner_alert_prefs'),
               ('public.partner_agreement_versions'),
               ('public.partner_agreement_acceptances'),
               ('public.partner_agreement_settings'),
               ('public.price_lists'), ('public.price_list_items'),
               ('public.subcontractor_vehicles'), ('public.trip_offers'),
               ('public.dispatches'), ('public.bookings')) x(t)
  where to_regclass(x.t) is null;
  if v_missing is not null then
    raise exception 'شرط مسبق: جداول مفقودة: % — هجرات سابقة غير مطبَّقة', v_missing;
  end if;

  select string_agg(s, '، ') into v_missing
  from (values ('public.portal_agreement_history()'),
               ('public.portal_agreement()'),
               ('public.portal_alert_prefs()'),
               ('public.portal_set_alert_prefs(boolean, boolean, boolean, boolean, boolean)'),
               ('public.partner_agreement_ok(uuid)'),
               ('public.partner_agreement_status(uuid)'),
               ('public.current_subcontractor_id()'),
               ('public.dispatch_pool(uuid, integer)'),
               ('public.portal_offers()'),
               ('public.accept_offer(uuid)')) x(s)
  where to_regprocedure(x.s) is null;
  if v_missing is not null then
    raise exception 'شرط مسبق: دوال مفقودة: % — هجرة 0137 (أو ما قبلها) غير مطبَّقة', v_missing;
  end if;

  -- 🔴 عقدُ المُشغّل: صفوفُ القبول لا تُحذف، والإصدارُ الحيّ يُؤرشف مؤقتاً،
  --    وجسمُ `dispatch_pool` يُبدَّل. فخارج المعاملة المُرجَعة أثرٌ لا يُمحى.
  if current_setting('tours.test_tx', true) is distinct from 'rollback' then
    raise exception
      '🔴 هذه المجموعة تكتب صفوفَ قبولٍ مُلحَقةً فقط، وتؤرشف الإصدار الساري، وتُبدّل جسمَ دالتين وسياسةَ جدول — فلا تُشغَّل إلا عبر `pnpm db:test` (‏`scripts/db-test.mjs` يفتح معاملةً ويُرجعها). المتغيّر `tours.test_tx` غير مضبوط ⇒ أنت خارج المُشغّل.';
  end if;

  -- ⚠ حارس العزل: ممرٌّ صحراويٌّ بلا تغطيةٍ حقيقية — شرطُ صحة كل تأكيدٍ يعدّ
  --   صفوفَ الحوض. ومتعهدٌ حقيقي يغطيه يدخل بجدارة فيُفسد العدّ بلا عيبٍ في الكود.
  select count(*), string_agg(distinct s.company_name, '، ')
    into v_cov, v_who
  from public.coverage_matches(27.100000, 26.400000, 25.700000, 28.900000) cm
  join public.subcontractors s on s.id = cm.subcontractor_id;
  if v_cov > 0 then
    raise exception
      'شرط مسبق: ممرُّ الاختبار (قارة أم الصغير–الفرافرة) صار يغطيه % متعهداً حقيقياً (%) — انقل الإحداثيات ولا تُرخِ التأكيدات',
      v_cov, coalesce(v_who, 'بلا اسم');
  end if;

  select array_agg(q.class_slug order by q.capacity asc) into v_classes
  from public.quote_price(340, 1, false, 0) q;
  if v_classes is null or array_length(v_classes, 1) < 1 then
    raise exception 'شرط مسبق: لا فئة سيارة نشطة لها تعريفة — نفّذ بذرة 0005';
  end if;
  perform set_config('tours.pp_class', v_classes[1], false);

  -- مشرفٌ حقيقي: بدونه يقيس فحصُ العزل «غياب جلسة» لا حارساً
  select p.id into v_admin from public.profiles p where p.role = 'admin' limit 1;
  if v_admin is null then
    raise exception 'شرط مسبق: لا مشرف في القاعدة — قياسُ العزل كان سيقيس غياب جلسة';
  end if;
  perform set_config('tours.pp_admin', v_admin::text, false);

  -- إعدادات معلومة أثناء الاختبار (تُرجَع مع المعاملة، فلا استعادة يدوية)
  update public.pricing_settings
     set peak_enabled = false, margin_type = 'percent', margin_value = 20, margin_min_amount = 0
   where id = true;
  update public.dispatch_settings
     set window_minutes = 30, max_rounds = 2, auto_start = false, min_margin_amount = 0
   where id = true;
  update public.partner_agreement_settings set gate_enabled = true, grace_days = 14 where id = true;

  -- 🔴 خط أساس سجلّ القبول — يُقرأ **قبل أول صفِّ فيكسترة** ويُقارَن به في (ز).
  --    والمقياس **الفرقُ عن الأساس** لا عددٌ مطلق: الاتفاقية قَبِلها شريكٌ حقيقي
  --    من بورتاله، فصيغةُ «صفرُ صفٍّ خارج الفيكسترة» تقرأ ذلك تسرّباً وتحمرّ على
  --    نظامٍ سليم (نفس ما قِيس في `partner_agreement_tests`).
  perform set_config('tours.pp_acc_n',
    (select count(*)::text from public.partner_agreement_acceptances), false);
  perform set_config('tours.pp_acc_dig', coalesce(
    (select md5(string_agg(a.id::text || '§' || a.agreement_id::text || '§' ||
                           a.doc_hash || '§' || a.signed_name, '¶' order by a.id))
       from public.partner_agreement_acceptances a), ''), false);

  raise notice '✔ (٠) الشروط المسبقة سليمة · العقد قائم · فئة الاختبار «%» · خط أساس القبول % صفاً',
    v_classes[1], current_setting('tours.pp_acc_n', true);
end;
$$;

-- ----------------------------------------------------------------------------
-- (٠-ب) إصدارُ فحصٍ منشور — يحلّ محلّ الساري داخل المعاملة وحدها
--
-- 🔬 والأرقامُ مختارةٌ كي **تفترق الحالتان**: نشرٌ قبل ٤٠ يوماً بمهلة ٥ ⇒ كلُّ
--    من لم يوقّع انقضت مهلته فعلاً، ومن وقّع مرّ. وبلا هذا الافتراق يقيس القسم
--    (ج) قاعدةً سقط منها الجميع أو نجا فيها الجميع — وكلاهما يمرّ بلا قياس.
-- ----------------------------------------------------------------------------
do $$
declare
  v_id   uuid;
  v_hash text;
begin
  update public.partner_agreement_versions v set status = 'archived' where v.status = 'published';

  insert into public.partner_agreement_versions (title, preamble, clauses)
  values ('PARTNER_PROFILE_TESTS اتفاقية الإصدار الأول',
          'ديباجة الإصدار الأول — نصٌّ يُميَّز بحرفه.',
          '[{"k":"p1","title":"بند الإصدار الأول","body":"نصُّ بندِ الإصدارِ الأول وحده."}]'::jsonb)
  returning id into v_id;

  v_hash := (select public.partner_agreement_hash(v.title, v.preamble, v.clauses)
             from public.partner_agreement_versions v where v.id = v_id);

  update public.partner_agreement_versions v
     set status = 'published', published_at = now() - interval '40 days',
         grace_days = 5, doc_hash = v_hash
   where v.id = v_id;

  perform set_config('tours.pp_v1', v_id::text, false);
  perform set_config('tours.pp_v1_hash', v_hash, false);

  raise notice '✔ (٠-ب) إصدارٌ أول منشورٌ منذ ٤٠ يوماً بمهلة ٥ (بصمة %)', left(v_hash, 8);
end;
$$;

-- ----------------------------------------------------------------------------
-- (٠-ج) ثلاثةُ شركاء بهويات دخول — **الفيكسترة من صنع هذا الملف وحده**
--
--   أ : معتمَد · عمره ٤٠٠ يوم · **يوقّع** · له مركبة وقائمة وتفضيلات
--   ب : معتمَد · عمره ٤٠٠ يوم · **يوقّع** · وهو «الآخر» في كل فحص عزل
--   ج : معتمَد · عمره ٤٠٠ يوم · **لا يوقّع أبداً** — مؤهَّلٌ في كل شيء إلا هذا
--
-- ⚠ والتكاليف **متساوية بقصد**: شريكٌ أغلى يسقط من الحوض لسببٍ مالي، فيُقرأ
--   سقوطُه على أنه أثرُ حاجز الاتفاقية. والقياسُ حينها يشهد لنفسه.
-- ----------------------------------------------------------------------------
do $$
declare
  v_a   constant uuid := 'a1370000-0000-4000-8000-00000000000a';
  v_b   constant uuid := 'a1370000-0000-4000-8000-00000000000b';
  v_c   constant uuid := 'a1370000-0000-4000-8000-00000000000c';
  v_pa  constant uuid := 'a1371000-0000-4000-8000-00000000000a';
  v_pb  constant uuid := 'a1371000-0000-4000-8000-00000000000b';
  v_pc  constant uuid := 'a1371000-0000-4000-8000-00000000000c';
  v_la  constant uuid := 'a1372000-0000-4000-8000-00000000000a';
  v_lb  constant uuid := 'a1372000-0000-4000-8000-00000000000b';
  v_lc  constant uuid := 'a1372000-0000-4000-8000-00000000000c';
  v_cls text := current_setting('tours.pp_class', true);
begin
  perform set_config('tours.pp_ids', '0', false);

  insert into public.subcontractors
    (id, company_name, phone, whatsapp, email, status, created_at)
  values
    (v_a, 'PARTNER_PROFILE_TESTS الشريك أ', '01000000101', '01000000201',
     'pp-a@local.invalid', 'approved', now() - interval '400 days'),
    (v_b, 'PARTNER_PROFILE_TESTS الشريك ب', '01000000102', '01000000202',
     'pp-b@local.invalid', 'approved', now() - interval '400 days'),
    (v_c, 'PARTNER_PROFILE_TESTS الشريك ج', '01000000103', null,
     'pp-c@local.invalid', 'approved', now() - interval '400 days');

  insert into public.subcontractor_vehicles (subcontractor_id, class_slug, label, active)
  values (v_a, v_cls, 'مركبة أ', true),
         (v_b, v_cls, 'مركبة ب', true),
         (v_c, v_cls, 'مركبة ج', true);

  -- ممرُّ قارة أم الصغير ← الفرافرة، نطاقان ٤٠ كم (الحارس في (٠) يثبت خلوّه)
  insert into public.price_lists
    (id, subcontractor_id, title, origin_label, origin_lat, origin_lng, origin_radius_km,
     dest_label, dest_lat, dest_lng, dest_radius_km, bidirectional, status)
  values
    (v_la, v_a, 'PARTNER_PROFILE_TESTS قائمة أ', 'قارة أم الصغير', 27.110000, 26.410000, 40,
     'الفرافرة', 25.710000, 28.910000, 40, true, 'approved'),
    (v_lb, v_b, 'PARTNER_PROFILE_TESTS قائمة ب', 'قارة أم الصغير', 27.110000, 26.410000, 40,
     'الفرافرة', 25.710000, 28.910000, 40, true, 'approved'),
    (v_lc, v_c, 'PARTNER_PROFILE_TESTS قائمة ج', 'قارة أم الصغير', 27.110000, 26.410000, 40,
     'الفرافرة', 25.710000, 28.910000, 40, true, 'approved');

  insert into public.price_list_items (price_list_id, class_slug, cost)
  values (v_la, v_cls, 1500), (v_lb, v_cls, 1500), (v_lc, v_cls, 1500);

  -- تفضيلاتٌ صريحة للثلاثة: قياسُ «لا يعدّل قنوات غيره» يحتاج صفّاً قائماً
  insert into public.partner_alert_prefs
    (subcontractor_id, telegram_enabled, webpush_enabled, inbox_enabled, email_enabled,
     accepting_offers)
  values (v_a, true, true, true, true, true),
         (v_b, true, true, true, true, true),
         (v_c, true, true, true, true, true);

  begin
    insert into auth.users (id, email) values
      (v_pa, 'pp-a@local.invalid'), (v_pb, 'pp-b@local.invalid'), (v_pc, 'pp-c@local.invalid');
    insert into public.profiles (id, role, full_name) values
      (v_pa, 'subcontractor', 'شريك أ'),
      (v_pb, 'subcontractor', 'شريك ب'),
      (v_pc, 'subcontractor', 'شريك ج')
    on conflict (id) do update set role = 'subcontractor';
    update public.subcontractors set profile_id = v_pa where id = v_a;
    update public.subcontractors set profile_id = v_pb where id = v_b;
    update public.subcontractors set profile_id = v_pc where id = v_c;
    perform set_config('tours.pp_ids', '1', false);
  exception
    when others then
      raise notice '⚠ (٠-ج) تعذّر إنشاء هويات الدخول (%) — أقسام الدور ستُتخطّى', sqlerrm;
  end;

  raise notice '✔ (٠-ج) ثلاثة شركاء بمركباتٍ وقوائمَ وتفضيلاتٍ متساوية';
end;
$$;

-- ----------------------------------------------------------------------------
-- (٠-د) توقيعُ أ وب على الإصدار الأول — بنداءٍ حقيقي بهويتهما لا بإدراجٍ يدوي
--
-- ولماذا بالنداء؟ لأن الإدراج اليدوي يشهد لنفسه: يكتب الصفَّ الذي سنقرؤه بعد
-- قليل، فلا يقيس أن **الشريك يستطيع أن يوقّع من جلسته** أصلاً.
-- ----------------------------------------------------------------------------
do $$
declare
  v_pa  constant uuid := 'a1371000-0000-4000-8000-00000000000a';
  v_pb  constant uuid := 'a1371000-0000-4000-8000-00000000000b';
  v_v1  uuid := current_setting('tours.pp_v1', true)::uuid;
  v_res record;
begin
  if current_setting('tours.pp_ids', true) <> '1' then
    raise notice '⏭ (٠-د) بلا هويات دخول — تخطٍّ';
    return;
  end if;

  perform set_config('request.jwt.claim.sub', v_pa::text, false);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_pa)::text, false);
  begin
    execute 'set local role authenticated';
    select * into v_res from public.accept_partner_agreement(v_v1, 'الموقّع عن الشريك أ');
    execute 'reset role';
  exception
    when others then
      begin execute 'reset role'; exception when others then null; end;
      raise;
  end;
  if v_res.agreement_id is distinct from v_v1 or v_res.already then
    raise exception '(٠-د) توقيعُ «أ» لم يُسجَّل على الإصدار الأول';
  end if;

  perform set_config('request.jwt.claim.sub', v_pb::text, false);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_pb)::text, false);
  begin
    execute 'set local role authenticated';
    perform public.accept_partner_agreement(v_v1, 'الموقّع عن الشريك ب');
    execute 'reset role';
  exception
    when others then
      begin execute 'reset role'; exception when others then null; end;
      raise;
  end;

  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claims', '', false);
  raise notice '✔ (٠-د) وقّع «أ» و«ب» الإصدارَ الأول من جلستيهما';
end;
$$;

-- ----------------------------------------------------------------------------
-- (أ) ملفُّ المستخدم — يقرأ صفَّه ويعدّله، ولا يقرأ صفَّ غيره ولا يعدّله
--
-- 🔒 وهذه أوسعُ من «صفحة»: الصفحةُ الجديدة تعرض ثلاثةَ مصادر في شاشةٍ واحدة،
--    والحاجزُ الحقيقي في RLS لا في التصيير — فلو أُرخي لصار الدمجُ نافذةً.
-- ----------------------------------------------------------------------------
do $$
declare
  v_a  constant uuid := 'a1370000-0000-4000-8000-00000000000a';
  v_b  constant uuid := 'a1370000-0000-4000-8000-00000000000b';
  v_pa constant uuid := 'a1371000-0000-4000-8000-00000000000a';
  v_n  integer;
  v_txt text;
begin
  if current_setting('tours.pp_ids', true) <> '1' then
    raise notice '⏭ (أ) بلا هويات دخول — تخطٍّ';
    return;
  end if;

  perform set_config('request.jwt.claim.sub', v_pa::text, false);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_pa)::text, false);

  begin
    execute 'set local role authenticated';

    -- (أ-١) يقرأ صفَّه هو — وبدون هذا يكون ما بعده قياسَ «لا شيء»
    select count(*) into v_n from public.subcontractors s where s.id = v_a;
    if v_n <> 1 then
      raise exception '(أ-١) الشريك لا يقرأ صفَّه هو (% صفاً) — السياسة أضيق مما يجب', v_n;
    end if;

    -- (أ-٢) 🔴 ولا يقرأ صفَّ الشريك ب — وهذا هو الحاجز كلّه (D-19 · D-20)
    select count(*) into v_n from public.subcontractors s where s.id = v_b;
    if v_n <> 0 then
      raise exception
        '(أ-٢) 🔴 شريكٌ يقرأ صفَّ شريكٍ آخر — هاتفَه وبريدَه وملاحظاتِ الإدارة عنه';
    end if;

    -- (أ-٣) يعدّل صفَّه هو (وهو ما يفعله نموذج «بيانات الحساب»)
    update public.subcontractors s set contact_name = 'مسؤول تواصل أ' where s.id = v_a;
    get diagnostics v_n = row_count;
    if v_n <> 1 then
      raise exception '(أ-٣) الشريك لا يعدّل صفَّه هو (% صفاً) — نموذجُ الحساب لا يحفظ', v_n;
    end if;

    -- (أ-٤) 🔴 ولا يعدّل صفَّ غيره — والرفضُ **بصفر صفوف لا بخطأ**، وهو الفخّ
    --       الذي تكرّر: «نجاحٌ» ظاهريّ ترفضه السياسة صامتةً
    update public.subcontractors s set company_name = 'اختطاف' where s.id = v_b;
    get diagnostics v_n = row_count;
    if v_n <> 0 then
      raise exception '(أ-٤) 🔴 شريكٌ عدّل صفَّ شريكٍ آخر (% صفاً)', v_n;
    end if;

    execute 'reset role';
  exception
    when others then
      begin execute 'reset role'; exception when others then null; end;
      raise;
  end;

  -- (أ-٥) والتعديلُ وقع فعلاً: قياسُ الرفض بلا قياس القبول يمرّ على قاعدةٍ ميّتة
  select s.contact_name into v_txt from public.subcontractors s where s.id = v_a;
  if v_txt is distinct from 'مسؤول تواصل أ' then
    raise exception '(أ-٥) تعديلُ الشريك لصفّه لم يقع فعلاً («%»)', coalesce(v_txt, 'فارغ');
  end if;
  select s.company_name into v_txt from public.subcontractors s where s.id = v_b;
  if v_txt = 'اختطاف' then
    raise exception '(أ-٥) 🔴 صفُّ الشريك ب تغيّر رغم أن السياسة أعادت صفر صفوف';
  end if;

  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claims', '', false);
  raise notice '✔ (أ) الشريك يقرأ صفَّه ويعدّله · ولا يقرأ صفَّ غيره ولا يعدّله';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ب) القنوات — يكتب قنواته بنداءٍ بلا وسيطِ شريك، ولا يمسّ قنوات غيره
-- ----------------------------------------------------------------------------
do $$
declare
  v_a  constant uuid := 'a1370000-0000-4000-8000-00000000000a';
  v_b  constant uuid := 'a1370000-0000-4000-8000-00000000000b';
  v_pa constant uuid := 'a1371000-0000-4000-8000-00000000000a';
  v_n  integer;
  v_on boolean;
begin
  if current_setting('tours.pp_ids', true) <> '1' then
    raise notice '⏭ (ب) بلا هويات دخول — تخطٍّ';
    return;
  end if;

  perform set_config('request.jwt.claim.sub', v_pa::text, false);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_pa)::text, false);

  begin
    execute 'set local role authenticated';

    -- (ب-١) يكتب تفضيلاته — والنداءُ **بلا وسيطِ شريك**، فالنطاق من الجلسة
    perform public.portal_set_alert_prefs(false, true, true, true, false);

    -- (ب-٢) ولا يقرأ تفضيلات غيره
    select count(*) into v_n from public.partner_alert_prefs p where p.subcontractor_id = v_b;
    if v_n <> 0 then
      raise exception '(ب-٢) 🔴 شريكٌ يقرأ تفضيلات شريكٍ آخر — أي متى يصمت منافسُه';
    end if;

    -- (ب-٣) ولا يعدّلها — بصفر صفوف لا بخطأ
    update public.partner_alert_prefs p set accepting_offers = false where p.subcontractor_id = v_b;
    get diagnostics v_n = row_count;
    if v_n <> 0 then
      raise exception '(ب-٣) 🔴 شريكٌ أطفأ استقبالَ شريكٍ آخر (% صفاً)', v_n;
    end if;

    execute 'reset role';
  exception
    when others then
      begin execute 'reset role'; exception when others then null; end;
      raise;
  end;

  -- (ب-٤) والكتابةُ وقعت على صفّه هو — الحقلان اللذان غيّرهما النداء
  select p.telegram_enabled into v_on
  from public.partner_alert_prefs p where p.subcontractor_id = v_a;
  if v_on is distinct from false then
    raise exception '(ب-٤) `portal_set_alert_prefs` لم تُطفئ تليجرام على صفّ صاحب الجلسة';
  end if;
  select p.accepting_offers into v_on
  from public.partner_alert_prefs p where p.subcontractor_id = v_a;
  if v_on is distinct from false then
    raise exception '(ب-٤) `portal_set_alert_prefs` لم تُطفئ مفتاحَ الاستقبال على صفّ صاحب الجلسة';
  end if;

  -- (ب-٥) وصفُّ «ب» لم يتغيّر بحرف
  select p.telegram_enabled into v_on
  from public.partner_alert_prefs p where p.subcontractor_id = v_b;
  if v_on is distinct from true then
    raise exception '(ب-٥) 🔴 قنواتُ الشريك ب تغيّرت بكتابةِ الشريك أ';
  end if;
  select p.accepting_offers into v_on
  from public.partner_alert_prefs p where p.subcontractor_id = v_b;
  if v_on is distinct from true then
    raise exception '(ب-٥) 🔴 مفتاحُ استقبال الشريك ب تغيّر بكتابةِ الشريك أ';
  end if;

  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claims', '', false);
  raise notice '✔ (ب) الشريك يكتب قنواته وحدها · ولا يقرأ قنوات غيره ولا يعدّلها';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ج) 🔴 بوابةُ التوقيع الأول — **حاجزٌ لا يُتخطّى، بعد نقل العرض كما قبله**
--
-- «ج» مؤهَّلٌ في كل شيء: معتمَد · مركبةٌ نشطة من الفئة · قائمةٌ معتمَدة تغطّي
-- المسار · تكلفتُه كتكلفة الآخرين · قناةٌ مفعَّلة. ولا ينقصه إلا التوقيع.
-- فسقوطُه هنا لا يُفسَّر بشيءٍ آخر — وهذا هو شرطُ صحة القياس.
-- ----------------------------------------------------------------------------
do $$
declare
  v_a     constant uuid := 'a1370000-0000-4000-8000-00000000000a';
  v_c     constant uuid := 'a1370000-0000-4000-8000-00000000000c';
  v_pc    constant uuid := 'a1371000-0000-4000-8000-00000000000c';
  v_cls   text := current_setting('tours.pp_class', true);
  v_res   record;
  v_st    record;
  v_bid   uuid;
  v_offer uuid;
  v_has_a boolean;
  v_has_c boolean;
  v_n     integer;
  v_raised boolean := false;
  v_hint  text;
begin
  -- (ج-١) الحالةُ نفسها أولاً: «ج» لم يقبل وانقضت مهلته
  select * into v_st from public.partner_agreement_status(v_c);
  if v_st.accepted then
    raise exception '(ج-١) شريكٌ لم يوقّع شيئاً يُقرأ «موقِّعاً»';
  end if;
  if v_st.in_grace or v_st.ok then
    raise exception
      '(ج-١) شريكٌ لم يوقّع وانقضت مهلته يمرّ من الحاجز — والحاجزُ حينئذٍ زينة';
  end if;
  if public.partner_agreement_ok(v_c) then
    raise exception '(ج-١) الغلافُ البولياني يخالف الدالة الأمّ';
  end if;

  -- والشاهدُ المعاكس في النداء نفسه: «أ» وقّع فيمرّ. وبلا هذا يمرّ التأكيد
  -- أعلاه على قاعدةٍ سقط منها الجميع لسببٍ لا علاقة له بالاتفاقية.
  if not public.partner_agreement_ok(v_a) then
    raise exception '(ج-١) الموقِّعُ نفسه محجوب — القياسُ يقيس عطلاً آخر لا الحاجز';
  end if;

  -- حجزٌ حقيقي على الممرّ الصحراوي
  select * into v_res from public.create_booking(
    jsonb_build_object('label', 'قارة أم الصغير', 'lat', 27.100000, 'lng', 26.400000),
    jsonb_build_object('label', 'الفرافرة',       'lat', 25.700000, 'lng', 28.900000),
    1, false, 0,
    340, null, 'test',
    v_cls, 'full',
    'عميل اختبار ملف المستخدم', '01111111113', null, now() + interval '3 days',
    'PARTNER_PROFILE_TESTS_FIXTURE'
  );
  v_bid := v_res.id;
  perform set_config('tours.pp_booking', v_bid::text, false);

  update public.bookings set status = 'under_review' where id = v_bid;
  update public.bookings set status = 'confirmed'    where id = v_bid;

  -- (ج-٢) 🔴 الحوض: «أ» فيه و«ج» ليس فيه
  select count(*) filter (where p.subcontractor_id = v_a) > 0,
         count(*) filter (where p.subcontractor_id = v_c) > 0
    into v_has_a, v_has_c
  from public.dispatch_pool(v_bid, 1) p;

  if not v_has_a then
    raise exception
      '(ج-٢) الموقِّعُ نفسه خارج الحوض — فيكسترةٌ لا تُنتج عرضاً أصلاً، والتأكيد التالي بلا معنى';
  end if;
  if v_has_c then
    raise exception
      '(ج-٢) 🔴 متعهدٌ لم يوقّع الاتفاقية ما زال في حوض البثّ — نقلُ العرض فتح ثغرةً في القبول';
  end if;

  if current_setting('tours.pp_ids', true) <> '1' then
    raise notice '⏭ (ج-٣..٤) بلا هويات دخول — تخطٍّ';
    raise notice '✔ (ج-١..٢) من لم يوقّع وانقضت مهلته يسقط من الحوض · والموقِّعُ فيه';
    return;
  end if;

  -- عرضٌ **بُثّ قبل انقضاء المهلة** ويبقى في الجدول — وهو ما تُسقطه
  -- `portal_offers` كي لا يبقى زرٌّ يفشل دائماً (سابقة 0027)
  insert into public.dispatches (booking_id, status, round)
  values (v_bid, 'broadcasting', 1)
  on conflict (booking_id) do update set status = 'broadcasting';

  insert into public.trip_offers (booking_id, subcontractor_id, round, payout, status, expires_at)
  values (v_bid, v_c, 1, 1500, 'pending', now() + interval '30 minutes')
  returning id into v_offer;

  perform set_config('request.jwt.claim.sub', v_pc::text, false);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_pc)::text, false);

  -- (ج-٣) لا يراه في صندوقه
  begin
    execute 'set local role authenticated';
    select count(*) into v_n from public.portal_offers() o where o.offer_id = v_offer;
    execute 'reset role';
  exception
    when others then
      begin execute 'reset role'; exception when others then null; end;
      raise;
  end;
  if v_n <> 0 then
    raise exception
      '(ج-٣) 🔴 عرضٌ قائم يبقى مرئياً لمن لم يوقّع وانقضت مهلته — زرٌّ يفشل دائماً بلا سبب مفهوم';
  end if;

  -- (ج-٤) ولا يلتزم به لو وصله رابطُه
  begin
    execute 'set local role authenticated';
    begin
      perform public.accept_offer(v_offer);
    exception
      when others then
        v_raised := true;
        v_hint := coalesce(sqlerrm, '');
    end;
    execute 'reset role';
  exception
    when others then
      begin execute 'reset role'; exception when others then null; end;
      raise;
  end;

  if not v_raised then
    raise exception
      '(ج-٤) 🔴 التزم متعهدٌ برحلة عميلٍ دفع بلا اتفاقيةٍ موقَّعة — وهذا ما يُبطل أي خصمٍ لاحق';
  end if;
  if position('اتفاقية المتعهد' in v_hint) = 0 then
    raise exception
      '(ج-٤) رُفض القبول برسالةٍ لا تسمّي السبب («%») — فالشريك يطارد عائقاً غير العائق',
      left(v_hint, 120);
  end if;

  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claims', '', false);
  raise notice '✔ (ج) من لم يوقّع: خارج الحوض · لا يرى عرضاً قائماً · ولا يلتزم برحلة';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ج-٥) 🔬 الطفرة التي تُثبت أن (ج-٢) يقيس الحاجزَ لا شيئاً آخر
--
-- ⚠ **وموضعُها هنا لا في (و) بقصد**: القسم (د) ينشر إصداراً ثانياً، ونشرُ إصدارٍ
--   يفتح مهلةً جديدة للجميع (‏`deadline = greatest(published_at, created_at) +
--   grace_days`) — فيعود «ج» إلى الحوض **بجدارة**، وتصير الطفرةُ عمياء لأن
--   الحالتين تتساويان. قِيس ذلك فعلاً في أول تشغيل: الطفرةُ مرّت، ثم مرّ الأصلُ
--   بعدها. فالطفرةُ تُشغَّل **بينما الحاجز عاضٌّ**، لا بعد أن يزول سببُ عضّه.
-- ----------------------------------------------------------------------------
do $$
declare
  v_c    constant uuid := 'a1370000-0000-4000-8000-00000000000c';
  v_bid  uuid := nullif(current_setting('tours.pp_booking', true), '')::uuid;
  v_orig text;
  v_mut  text;
  v_n    integer;
begin
  if v_bid is null then
    raise exception '(ج-٥) لا حجزَ فيكسترة — القسم (ج) لم يُكمل';
  end if;

  v_orig := pg_get_functiondef('public.dispatch_pool(uuid, integer)'::regprocedure);
  if position('public.partner_agreement_ok(c.sid)' in v_orig) = 0 then
    raise exception
      '(ج-٥) لم يُعثر على نداء `partner_agreement_ok` في التعريف الحيّ لـ`dispatch_pool` — إمّا أن الحاجز نُزع فعلاً، أو أن جسم الدالة تغيّر وهذه الطفرة صارت عمياء';
  end if;

  v_mut := replace(v_orig, 'and public.partner_agreement_ok(c.sid)', '');
  execute v_mut;
  select count(*) into v_n from public.dispatch_pool(v_bid, 1) p
   where p.subcontractor_id = v_c;
  execute v_orig;                                  -- الأصلُ يعود قبل أي تأكيد

  if v_n = 0 then
    raise exception
      '(ج-٥) 🔬 نُزع الحاجزُ من `dispatch_pool` و«ج» ما زال خارج الحوض — إذن تأكيدُ (ج-٢) لا يقيس الحاجز بل شيئاً آخر';
  end if;

  -- والاستعادةُ تُقاس ولا تُفترض: بقيةُ الملف تجري على الدالة الأصلية
  select count(*) into v_n from public.dispatch_pool(v_bid, 1) p
   where p.subcontractor_id = v_c;
  if v_n <> 0 then
    raise exception '(ج-٥) لم يُستعَد جسمُ `dispatch_pool` الأصلي — بقيةُ الملف تقيس دالةً مشوَّهة';
  end if;

  raise notice '✔ (ج-٥) 🔬 نزعُ الحاجز يُدخل «ج» الحوضَ، وإعادتُه تُخرجه — فالتأكيد حيّ';
end;
$$;

-- ----------------------------------------------------------------------------
-- (د) 0137 — نُسَخُ صاحب الجلسة الموقَّعة، بنصّها المؤرشف لا بنصّ الساري
--
-- يُنشر هنا إصدارٌ ثانٍ (فتُؤرشف الأولى)، وهو بالضبط اليومُ الذي كان يظهر فيه
-- العيب قبل 0137: نصُّ ما وقّعه الشريك يصير محجوباً عنه، والشاشةُ تَعِده بعكسه.
-- ----------------------------------------------------------------------------
do $$
declare
  v_a   constant uuid := 'a1370000-0000-4000-8000-00000000000a';
  v_pa  constant uuid := 'a1371000-0000-4000-8000-00000000000a';
  v_pb  constant uuid := 'a1371000-0000-4000-8000-00000000000b';
  v_adm uuid := current_setting('tours.pp_admin', true)::uuid;
  v_v1  uuid := current_setting('tours.pp_v1', true)::uuid;
  v_v1n integer;
  v_v2  uuid;
  v_h2  text;
  v_n   integer;
  v_row record;
begin
  if current_setting('tours.pp_ids', true) <> '1' then
    raise notice '⏭ (د) بلا هويات دخول — تخطٍّ';
    return;
  end if;

  -- ⚠ رقمُ الإصدار الأول يُقرأ **الآن** بدور المُشغّل: جدولُ الإصدارات عليه RLS
  --   بسياسة `is_admin()`، فقراءتُه من داخل جلسةِ الشريك تعود فارغةً — وكان ذلك
  --   يجعل التأكيد يقارن بـ`null` فيسقط على نظامٍ سليم.
  select v.version into v_v1n from public.partner_agreement_versions v where v.id = v_v1;
  if v_v1n is null then
    raise exception '(د-٠) لم يُقرأ رقمُ الإصدار الأول — الفيكسترة ناقصة';
  end if;

  -- إصدارٌ ثانٍ بنصٍّ **مختلفٍ بحرفه** — وبه وحده يُكشف خلطُ النصّين
  update public.partner_agreement_versions v set status = 'archived' where v.status = 'published';
  insert into public.partner_agreement_versions (title, preamble, clauses)
  values ('PARTNER_PROFILE_TESTS اتفاقية الإصدار الثاني',
          'ديباجة الإصدار الثاني.',
          '[{"k":"p2","title":"بند الإصدار الثاني","body":"نصُّ بندِ الإصدارِ الثاني وحده."}]'::jsonb)
  returning id into v_v2;

  v_h2 := (select public.partner_agreement_hash(v.title, v.preamble, v.clauses)
           from public.partner_agreement_versions v where v.id = v_v2);
  update public.partner_agreement_versions v
     set status = 'published', published_at = now(), grace_days = 14, doc_hash = v_h2
   where v.id = v_v2;
  perform set_config('tours.pp_v2', v_v2::text, false);

  -- «أ» يوقّع الثانية أيضاً ⇒ عنده نسختان: مؤرشفةٌ وسارية
  perform set_config('request.jwt.claim.sub', v_pa::text, false);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_pa)::text, false);
  begin
    execute 'set local role authenticated';
    perform public.accept_partner_agreement(v_v2, 'الموقّع عن الشريك أ');
    execute 'reset role';
  exception
    when others then
      begin execute 'reset role'; exception when others then null; end;
      raise;
  end;

  begin
    execute 'set local role authenticated';

    -- (د-١) نسختان لا أكثر ولا أقل
    select count(*) into v_n from public.portal_agreement_history();
    if v_n <> 2 then
      raise exception '(د-١) «أ» يقرأ % نسخةً موقَّعة بدل نسختين', v_n;
    end if;

    -- (د-٢) 🔴 ولا يقرأ توقيعَ «ب» — والشرطُ بنيويّ: لا وسيطَ للدالة أصلاً
    select count(*) into v_n
    from public.portal_agreement_history() h
    where h.signed_name like '%الشريك ب%';
    if v_n <> 0 then
      raise exception
        '(د-٢) 🔴 شريكٌ يقرأ توقيعَ شريكٍ آخر واسمَ الموقّع عنه — نقضُ D-20';
    end if;

    -- (د-٣) 🔴 والمؤرشفةُ تصل **بنصّها هي** لا بنصّ الساري
    select * into v_row from public.portal_agreement_history() h where h.version = v_v1n;
    if v_row.title is distinct from 'PARTNER_PROFILE_TESTS اتفاقية الإصدار الأول' then
      raise exception
        '(د-٣) 🔴 نسخةُ الشريك المؤرشفة تصل بعنوانِ إصدارٍ آخر («%») — فهو يقرأ نصّاً لم يوقّعه',
        coalesce(v_row.title, 'فارغ');
    end if;
    if v_row.clauses::text not like '%نصُّ بندِ الإصدارِ الأول وحده%' then
      raise exception '(د-٣) 🔴 بنودُ النسخة المؤرشفة ليست بنودَها — «%»', left(v_row.clauses::text, 120);
    end if;
    if v_row.is_current then
      raise exception '(د-٣) نسخةٌ مؤرشفة تُقرأ «سارية»';
    end if;
    if not v_row.hash_matches then
      raise exception '(د-٣) بصمةُ نسخةٍ لم تُمسّ تُقرأ مختلفة — الكاشفُ يرنّ في كل حال';
    end if;

    -- (د-٤) والساريةُ تُقرأ سارية — الشاهدُ المعاكس لـ(د-٣)
    select * into v_row from public.portal_agreement_history() h where h.is_current;
    if v_row.title is distinct from 'PARTNER_PROFILE_TESTS اتفاقية الإصدار الثاني' then
      raise exception '(د-٤) النسخةُ السارية تصل بعنوانٍ آخر («%»)', coalesce(v_row.title, 'فارغ');
    end if;

    execute 'reset role';
  exception
    when others then
      begin execute 'reset role'; exception when others then null; end;
      raise;
  end;

  -- (د-٥) و«ب» يقرأ نسخته وحدها
  perform set_config('request.jwt.claim.sub', v_pb::text, false);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_pb)::text, false);
  begin
    execute 'set local role authenticated';
    select count(*) into v_n from public.portal_agreement_history();
    execute 'reset role';
  exception
    when others then
      begin execute 'reset role'; exception when others then null; end;
      raise;
  end;
  if v_n <> 1 then
    raise exception '(د-٥) «ب» يقرأ % نسخةً بدل نسخته الواحدة', v_n;
  end if;

  -- (د-٦) 🔴 والمشرفُ ليس متعهداً: `current_subcontractor_id()` تعود null ⇒ صفر
  --       صفوف. والدالةُ ليست بابَ إدارةٍ ولا يجوز أن تصير كذلك.
  perform set_config('request.jwt.claim.sub', v_adm::text, false);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_adm)::text, false);
  begin
    execute 'set local role authenticated';
    select count(*) into v_n from public.portal_agreement_history();
    execute 'reset role';
  exception
    when others then
      begin execute 'reset role'; exception when others then null; end;
      raise;
  end;
  if v_n <> 0 then
    raise exception '(د-٦) 🔴 حسابٌ ليس متعهداً قرأ % صفَّ توقيعٍ من دالةِ بورتال', v_n;
  end if;

  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claims', '', false);
  raise notice '✔ (د) نُسَخُ صاحب الجلسة وحده · المؤرشفةُ بنصّها · والسارية بنصّها';
end;
$$;

-- ----------------------------------------------------------------------------
-- (هـ) المنح — `anon` لا ينفّذ، و`authenticated` ينفّذ
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon')
     or not exists (select 1 from pg_roles where rolname = 'authenticated') then
    raise notice '⏭ (هـ) لا أدوار المتصفح — الفحص متخطّى';
    return;
  end if;

  if has_function_privilege('anon', 'public.portal_agreement_history()', 'execute') then
    raise exception '(هـ-١) 🔴 `portal_agreement_history` ممنوحةٌ لـ`anon` — دالةُ definer لزائر';
  end if;
  if not has_function_privilege('authenticated', 'public.portal_agreement_history()', 'execute') then
    raise exception '(هـ-٢) `portal_agreement_history` غير ممنوحة لـ`authenticated` — الشريك لا يقرأ نسخته';
  end if;

  raise notice '✔ (هـ) المنح: anon لا · authenticated نعم';
end;
$$;

-- ----------------------------------------------------------------------------
-- (و) 🔬 الطفرات — تُبنى من التعريف الحيّ وتُشغَّل، ويُثبَت أن الفحص يمسكها
--
-- تأكيدٌ لا توجد تعديلةٌ معقولة في الكود تُسقطه هو تأكيدٌ يزيّن التقرير ولا
-- يحرس شيئاً. وهذا القسم **يشوّه الحارس فعلاً** ويقيس أن السلوك انقلب، ثم يعيد
-- الأصل بحرفه (والمعاملةُ تُرجَع على كل حال).
--
-- 📌 وطفرةُ حاجز البثّ في (ج-٥) لا هنا — لسببٍ مقيسٍ مكتوبٍ هناك.
-- ----------------------------------------------------------------------------
do $$
declare
  v_pa  constant uuid := 'a1371000-0000-4000-8000-00000000000a';
  v_pb  constant uuid := 'a1371000-0000-4000-8000-00000000000b';
  v_orig text;
  v_mut  text;
  v_n    integer;
begin
  if current_setting('tours.pp_ids', true) <> '1' then
    raise notice '⏭ (و) بلا هويات دخول — تخطٍّ';
    return;
  end if;

  /* ── (و-١) انزع شرطَ النطاق من `portal_agreement_history` ⇒ «ب» يقرأ «أ» ── */
  v_orig := pg_get_functiondef('public.portal_agreement_history()'::regprocedure);
  if position('a.subcontractor_id = public.current_subcontractor_id()' in v_orig) = 0 then
    raise exception
      '(و-١) لم يُعثر على شرط النطاق في التعريف الحيّ لـ`portal_agreement_history` — الطفرة عمياء';
  end if;
  v_mut := replace(v_orig,
                   'where a.subcontractor_id = public.current_subcontractor_id()',
                   'where true');
  execute v_mut;

  perform set_config('request.jwt.claim.sub', v_pb::text, false);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_pb)::text, false);
  begin
    execute 'set local role authenticated';
    select count(*) into v_n from public.portal_agreement_history() h
     where h.signed_name like '%الشريك أ%';
    execute 'reset role';
  exception
    when others then
      begin execute 'reset role'; exception when others then null; end;
      execute v_orig;
      raise;
  end;
  execute v_orig;

  if v_n = 0 then
    raise exception
      '(و-١) 🔬 نُزع شرطُ النطاق و«ب» ما زال لا يقرأ توقيعَ «أ» — إذن (د-٢) لا يقيس العزل';
  end if;

  /* ── (و-٢) اربطها بالإصدار المنشور ⇒ المؤرشفةُ تصل بنصّ الساري ─────────── */
  v_mut := replace(v_orig,
                   'join public.partner_agreement_versions v on v.id = a.agreement_id',
                   'join public.partner_agreement_versions v on v.status = ''published''');
  if v_mut = v_orig then
    raise exception '(و-٢) لم يُعثر على وصلة الإصدار في التعريف الحيّ — الطفرة عمياء';
  end if;
  execute v_mut;

  perform set_config('request.jwt.claim.sub', v_pa::text, false);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_pa)::text, false);
  begin
    execute 'set local role authenticated';
    select count(*) into v_n from public.portal_agreement_history() h
     where h.title = 'PARTNER_PROFILE_TESTS اتفاقية الإصدار الأول';
    execute 'reset role';
  exception
    when others then
      begin execute 'reset role'; exception when others then null; end;
      execute v_orig;
      raise;
  end;
  execute v_orig;

  if v_n <> 0 then
    raise exception
      '(و-٢) 🔬 رُبطت الدالةُ بالإصدار المنشور ونصُّ المؤرشفة ما زال يصل صحيحاً — إذن (د-٣) لا يقيس شيئاً';
  end if;

  -- والأصلُ يعيد النصّ الصحيح — قياسٌ لا افتراض
  begin
    execute 'set local role authenticated';
    select count(*) into v_n from public.portal_agreement_history() h
     where h.title = 'PARTNER_PROFILE_TESTS اتفاقية الإصدار الأول';
    execute 'reset role';
  exception
    when others then
      begin execute 'reset role'; exception when others then null; end;
      raise;
  end;
  if v_n <> 1 then
    raise exception '(و-٢) لم يُستعَد جسمُ `portal_agreement_history` الأصلي';
  end if;

  /* ── (و-٣) أرخِ سياسةَ `subcontractors` ⇒ «أ» يقرأ صفَّ «ب» ─────────────── */
  select pg_get_expr(polqual, polrelid) into v_orig
  from pg_policy where polrelid = 'public.subcontractors'::regclass
    and polname = 'subcontractors_select_own_or_admin';
  if v_orig is null then
    raise exception '(و-٣) سياسةُ القراءة على `subcontractors` غير موجودة أصلاً';
  end if;

  execute 'alter policy subcontractors_select_own_or_admin on public.subcontractors using (true)';
  begin
    execute 'set local role authenticated';
    select count(*) into v_n from public.subcontractors s
     where s.id = 'a1370000-0000-4000-8000-00000000000b'::uuid;
    execute 'reset role';
  exception
    when others then
      begin execute 'reset role'; exception when others then null; end;
      execute format('alter policy subcontractors_select_own_or_admin on public.subcontractors using (%s)', v_orig);
      raise;
  end;
  execute format('alter policy subcontractors_select_own_or_admin on public.subcontractors using (%s)', v_orig);

  if v_n = 0 then
    raise exception
      '(و-٣) 🔬 أُرخيت السياسةُ إلى `true` و«أ» ما زال لا يقرأ صفَّ «ب» — إذن (أ-٢) لا يقيس السياسة';
  end if;

  -- والسياسةُ عادت: يُقاس ذلك ولا يُفترض
  begin
    execute 'set local role authenticated';
    select count(*) into v_n from public.subcontractors s
     where s.id = 'a1370000-0000-4000-8000-00000000000b'::uuid;
    execute 'reset role';
  exception
    when others then
      begin execute 'reset role'; exception when others then null; end;
      raise;
  end;
  if v_n <> 0 then
    raise exception '(و-٣) لم تُستعَد سياسةُ القراءة على `subcontractors`';
  end if;

  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claims', '', false);
  raise notice '✔ (و) ثلاثُ طفراتٍ بُنيت وشُغِّلت: كلٌّ منها تُسقط تأكيدَها، والأصلُ يعيده';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ز) صفرُ أثر — الأساسُ الحيّ لم يُمسّ تحت الملف
--
-- ⚠ والمقياسُ **الفرقُ عن خط الأساس** لا عددٌ مطلق: في الجدول صفوفُ قبولٍ
--   حقيقية لشريكٍ حيّ، و«صفر صفٍّ خارج الفيكسترة» تقرؤها تسرّباً.
-- ----------------------------------------------------------------------------
do $$
declare
  v_pre_n  integer := coalesce(nullif(current_setting('tours.pp_acc_n', true), ''), '0')::integer;
  v_pre_d  text    := coalesce(current_setting('tours.pp_acc_dig', true), '');
  v_now_d  text;
  v_extra  integer;
  v_untag  integer;
begin
  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claims', '', false);

  -- صفوفُ الأساس نفسها: لا حُذفت ولا تغيّرت (السجلُّ مُلحَقٌ فقط — 0113 §٣)
  select coalesce(
    md5(string_agg(a.id::text || '§' || a.agreement_id::text || '§' ||
                   a.doc_hash || '§' || a.signed_name, '¶' order by a.id)), '')
    into v_now_d
  from public.partner_agreement_acceptances a
  where a.subcontractor_id is null
     or a.subcontractor_id not in (
          'a1370000-0000-4000-8000-00000000000a'::uuid,
          'a1370000-0000-4000-8000-00000000000b'::uuid,
          'a1370000-0000-4000-8000-00000000000c'::uuid);

  if v_now_d is distinct from v_pre_d then
    raise exception
      '(ز-١) 🔴 صفوفُ القبول الحيّة تغيّرت تحت هذا الملف — بصمةُ الأساس «%» صارت «%»',
      left(v_pre_d, 12), left(v_now_d, 12);
  end if;

  -- وكلُّ صفٍّ مُحدَثٍ على متعهدِ فيكسترة، ولا صفَّ بلا وسم
  select count(*) into v_extra from public.partner_agreement_acceptances;
  select count(*) into v_untag
  from public.partner_agreement_acceptances a
  where a.subcontractor_name not like 'PARTNER_PROFILE_TESTS%'
    and a.subcontractor_id in (
          'a1370000-0000-4000-8000-00000000000a'::uuid,
          'a1370000-0000-4000-8000-00000000000b'::uuid,
          'a1370000-0000-4000-8000-00000000000c'::uuid);
  if v_untag <> 0 then
    raise exception '(ز-٢) % صفَّ قبولٍ على متعهد فيكسترة بلا وسم', v_untag;
  end if;

  raise notice '✔ (ز) صفرُ أثر: الأساس % صفاً، والمجموع الآن % (الفرقُ كلُّه موسوم ويُرجَع مع المعاملة)',
    v_pre_n, v_extra;
end;
$$;

-- ============================================================================
do $$
begin
  raise notice '';
  raise notice '════════════════════════════════════════════════════════════';
  raise notice '  ALL PASSED — partner_profile_tests.sql';
  raise notice '  ملفُّ المستخدم: يقرأ صفَّه ولا يقرأ غيره · يكتب قنواته ولا يمسّ قنوات غيره';
  raise notice '  · من لم يوقّع محجوبٌ في الحوض والصندوق والقبول · ونُسَخُه الموقَّعة بنصّها';
  raise notice '  · وأربعُ طفراتٍ شُغِّلت فأسقطت تأكيداتها ثم أُعيد الأصل';
  raise notice '════════════════════════════════════════════════════════════';
end;
$$;
