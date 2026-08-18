-- ============================================================================
-- partner_agreement_tests.sql — «الشريك وافق سلفاً» ادّعاءٌ يُقاس بصفّ
--                                (الجبهة أ — هجرة 0113)
--
-- كيف تشغّله: `pnpm db:test partner_agreement`
-- النجاح = آخر سطر «ALL PASSED». وأي فشل exception عربية فيها المتوقع والفعلي.
--
-- ══════════════════════════════════════════════════════════════════════════
--  🔴 ما يحرسه هذا الملف: **أن يكون الخصمُ قابلاً للدفاع عنه**
-- ══════════════════════════════════════════════════════════════════════════
--
-- نظامُ الخصومات يقوم كلُّه على أن المتعهد **وافق سلفاً** على نصٍّ بعينه. وقبل
-- 0113 كان المقيس: `subcontractors` بأربعة عشر عموداً **ولا عمود قبولٍ واحد**،
-- و`terms` عقدُ العميل لا عقدُ المتعهد. فالخصم كان يُدافَع عنه بجملة «الاتفاق
-- يقول» — وهي لا تُقدَّم لأحد.
--
-- وهذا الملف يقيس أربع دعاوى، كلٌّ منها ينهار الخصمُ بسقوطها:
--
--   ١) **القبول يُسجَّل بإصداره** — لا «قَبِل» مجرّدة: رقمُ الإصدار وبصمةُ نصّه
--      واسمُ الموقّع ولحظتُه، لقطةً مكتفية تُقرأ بعد سنتين.
--   ٢) **تعديلُ الاتفاقية يُبطل ما قبله** — فلا يُحتجّ بنصّ اليوم على من قَبِل
--      نصَّ العام الماضي.
--   ٣) **من لم يقبل لا يعمل** — وإلا كان القبول زينةً: يسقط من `dispatch_pool`
--      ومن `portal_offers`، ويُرفض في `accept_offer`.
--   ٤) **السجلُّ لا يكتبه المُدَّعي** — مُلحَقٌ فقط، وبلا منحٍ لدور متصفحٍ أصلاً.
--
-- ── والمهلة: الدعوى الخامسة، وهي التي تحمي شريكاً يعمل ──────────────────────
--
-- `deadline = greatest(published_at, subcontractors.created_at) + grace_days`.
-- ويُقاس هنا الاتجاهان معاً: أن شريكاً قديماً **لا تنقطع عروضه** لحظة النشر،
-- وأن المهلة حين تنقضي **تعضّ فعلاً**. وأحدهما بلا الآخر شهادةٌ لنفسها:
-- الأول وحده يمرّ على نظامٍ بلا حاجز، والثاني وحده يمرّ على نظامٍ يقطع رزق حمزة.
--
-- ── 🔬 وما يجب أن تُسقطه هذه المجموعة ──────────────────────────────────────
--
--   | الطفرة | التأكيد الذي يجب أن يسقط |
--   |---|---|
--   | حذف `partner_agreement_ok` من `dispatch_pool` | (د-٢) المتخلّف يبقى في الحوض |
--   | حذفه من `portal_offers` | (هـ-١) العرض القديم يبقى مرئياً |
--   | حذفه من `accept_offer` | (هـ-٢) الالتزام يقع بلا اتفاقية |
--   | جعل المهلة تُقاس من `created_at` وحده | (ج-١) شريكٌ عمره سنة يُحجب لحظةَ النشر |
--   | جعلها تُقاس من `published_at` وحده | (ج-٣) شريكٌ أُنشئ اليوم يُحجب ⇒ كل فيكسترة |
--   | قياس القبول على أي إصدار لا على الساري | (و-٢) نسخةٌ جديدة لا تُبطل شيئاً |
--   | إسقاط حارس «مُلحَقٌ فقط» | (ز-١) صفُّ قبولٍ يُعدَّل |
--   | منح `authenticated` قراءةً على سجلّ القبول | (ز-٣) شريكٌ يقرأ قبول غيره |
--   | إضافة وسيطِ متعهد إلى `accept_partner_agreement` | (ب-١) القبول نيابةً عن غيره |
--   | إسقاط تجميد المنشور | (ح-١) نصُّ إصدارٍ قَبِله الناس يُعاد كتابته |
--
-- ── صفرُ أثر ───────────────────────────────────────────────────────────────
-- المجموعة تكتب صفوفَ قبولٍ **لا يستطيع أحدٌ حذفها** بعد 0113، وتؤرشف الإصدارَ
-- الحقيقي مؤقتاً كي تنشر إصدارَ فحص. فلا تُشغَّل إلا عبر `pnpm db:test` الذي
-- يفتح معاملةً ويُرجعها — والعقدُ يُفحص **قبل أول كتابة** في (٠).
--
-- ⚠ وحارسُ التسرّب (ط) يقيس **الفرق عن خط أساسٍ يُقرأ في (٠)**، لا عدداً مطلقاً.
--   السببُ مقيس: الاتفاقية نُشرت 2026-08-18T04:54:15Z وقَبِلها شريكٌ حقيقي من
--   بورتاله 06:27:31Z (‏`actor_kind='partner'`)، فصار في الجدول صفٌّ حيٌّ اسمُه
--   اسمُ شركته. والصيغةُ القديمة «صفرُ صفٍّ لا يبدأ بـ`AGREEMENT_TESTS`» قرأت
--   ذلك القبولَ الحقيقي **تسرّباً** فأحمرّت المجموعةَ على نظامٍ سليم — وهذا نوعُ
--   الخطأ الذي يُغري بإرخاء الحارس. فشُدَّ بدل أن يُرخى: صفوفُ الأساس تُستثنى
--   **بمعرّفها**، وكلُّ صفٍّ مُحدَثٍ يجب أن يكون موسوماً **وعلى متعهدِ فيكسترة**،
--   وصفوفُ الأساس تُفحص عدداً **وبصمةً** فلا تُحذف ولا تُعدَّل تحت الملف.
--
-- المرجع: supabase/migrations/0113_partner_agreement.sql
--         · 0110 (آلة «مُلحَقٌ فقط») · 0027/0028 (سابقة الإسقاط من portal_offers)
--         · D-20 · D-48 · D-58 · القاعدة الذهبية ١٦
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (٠) الشروط المسبقة — وعقدُ المُشغّل قبل أول كتابة
-- ----------------------------------------------------------------------------
do $$
declare
  v_missing text;
  v_cov     integer;
  v_who     text;
  v_classes text[];
  v_acc_pre text;
begin
  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claims', '', false);

  select string_agg(t, '، ') into v_missing
  from (values ('public.partner_agreement_versions'),
               ('public.partner_agreement_acceptances'),
               ('public.partner_agreement_settings'),
               ('public.subcontractors'), ('public.trip_offers'),
               ('public.dispatches'), ('public.bookings'),
               ('public.price_lists'), ('public.price_list_items'),
               ('public.subcontractor_vehicles')) x(t)
  where to_regclass(x.t) is null;
  if v_missing is not null then
    raise exception 'شرط مسبق: جداول مفقودة: % — هجرة 0113 غير مطبَّقة', v_missing;
  end if;

  if to_regprocedure('public.partner_agreement_status(uuid)') is null
     or to_regprocedure('public.partner_agreement_ok(uuid)') is null
     or to_regprocedure('public.accept_partner_agreement(uuid, text)') is null then
    raise exception 'شرط مسبق: دوال 0113 مفقودة';
  end if;

  -- 🔴 عقدُ المُشغّل: هذا الملف يكتب صفوفَ قبولٍ لا تُحذف، ويؤرشف الإصدار الحيّ
  --    مؤقتاً. فخارج المعاملة المُرجَعة يترك أثراً لا يُمحى.
  if current_setting('tours.test_tx', true) is distinct from 'rollback' then
    raise exception
      '🔴 هذه المجموعة تكتب صفوفَ قبولٍ مُلحَقةً فقط وتؤرشف الإصدار الساري مؤقتاً، فلا تُشغَّل إلا عبر `pnpm db:test` (‏`scripts/db-test.mjs` يفتح معاملةً ويُرجعها). المتغيّر `tours.test_tx` غير مضبوط ⇒ أنت خارج المُشغّل.';
  end if;

  -- ⚠ حارس العزل: ممرٌّ صحراويٌّ **بلا تغطية حقيقية** — شرطُ صحة كل تأكيدٍ يعدّ
  --   صفوفَ الحوض. ومتعهدٌ حقيقي يغطيه يدخل بجدارة فيُفسد العدّ بلا عيبٍ في الكود.
  select count(*), string_agg(distinct s.company_name, '، ')
    into v_cov, v_who
  from public.coverage_matches(29.190000, 25.560000, 28.360000, 28.830000) cm
  join public.subcontractors s on s.id = cm.subcontractor_id;
  if v_cov > 0 then
    raise exception
      'شرط مسبق: ممرُّ الاختبار (سيوة–الباويطي) صار يغطيه % متعهداً حقيقياً (%) — انقل الإحداثيات ولا تُرخِ التأكيدات',
      v_cov, coalesce(v_who, 'بلا اسم');
  end if;

  select array_agg(q.class_slug order by q.capacity asc) into v_classes
  from public.quote_price(200, 1, false, 0) q;
  if v_classes is null or array_length(v_classes, 1) < 1 then
    raise exception 'شرط مسبق: لا فئة سيارة نشطة لها تعريفة — نفّذ بذرة 0005';
  end if;
  perform set_config('tours.ag_class', v_classes[1], false);

  -- إعدادات معلومة أثناء الاختبار (تُرجَع مع المعاملة، فلا استعادة يدوية)
  update public.pricing_settings
     set peak_enabled = false, margin_type = 'percent', margin_value = 20, margin_min_amount = 0
   where id = true;
  update public.dispatch_settings
     set window_minutes = 30, max_rounds = 2, auto_start = false, min_margin_amount = 0
   where id = true;
  update public.partner_agreement_settings set gate_enabled = true, grace_days = 14 where id = true;

  -- 🔴 خط الأساس لسجلّ القبول — يُقرأ **قبل أول صفِّ فيكسترة**، ويُقارَن به (ط).
  --    الاتفاقية شُحنت اليوم، وشريكٌ حقيقي **يَقبل من البورتال**، فصار في الجدول
  --    صفٌّ حيٌّ لا وسمَ فيكسترة عليه. و«لا صفَّ خارج الفيكسترة» — رقماً مطلقاً —
  --    تقرأ ذلك القبولَ الحقيقي تسرّباً وتحمرّ على نظامٍ سليم. فالمقياس الصحيح
  --    **الفرقُ عن خط الأساس** لا العددُ المطلق (سابقة loyalty/notification/
  --    partner_alert). ويُحفظ معه معرّفاتُ الصفوف وبصمتُها، فيُمسك ثلاثةَ أشياء:
  --    صفٌّ جديد بلا وسم · وصفٌّ حيٌّ اختفى · وصفٌّ حيٌّ تغيّر تحت الملف.
  select count(*)::text into strict v_acc_pre from public.partner_agreement_acceptances;
  perform set_config('tours.ag_acc_pre_n', v_acc_pre, false);
  perform set_config('tours.ag_acc_pre_ids', coalesce(
    (select string_agg(a.id::text, ',' order by a.id) from public.partner_agreement_acceptances a), ''), false);
  perform set_config('tours.ag_acc_pre_dig', coalesce(
    (select md5(string_agg(a.id::text || '§' || a.subcontractor_id::text || '§' ||
                           coalesce(a.subcontractor_name, '') || '§' || a.agreement_id::text || '§' ||
                           a.agreement_version::text || '§' || a.doc_hash || '§' ||
                           coalesce(a.signed_name, '') || '§' || a.actor_kind || '§' ||
                           coalesce(a.accepted_by::text, '') || '§' ||
                           to_char(a.accepted_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.US'),
                           '¶' order by a.id))
       from public.partner_agreement_acceptances a), ''), false);

  raise notice '✔ (٠) الشروط المسبقة سليمة · العقد قائم · فئة الاختبار «%» · خط أساس القبول % صفاً حيّاً',
    v_classes[1], v_acc_pre;
end;
$$;

-- ----------------------------------------------------------------------------
-- (٠-ب) إصدارُ فحصٍ منشور — يحلّ محلّ الساري داخل المعاملة وحدها
--
-- ولماذا لا يُستعمل الإصدار الحقيقي؟ لأن الملف يقيس **لحظة النشر** نفسها
-- (المهلة تُقاس منها)، ويحتاج أن ينشر إصداراً ثانياً في (و) ليُثبت أن التعديل
-- يُبطل القبول. والعبثُ بالإصدار الحيّ خارج معاملةٍ مُرجَعة ممنوع، وداخلها آمن.
-- ----------------------------------------------------------------------------
do $$
declare
  v_id   uuid;
  v_hash text;
begin
  perform set_config('tours.ag_real', coalesce(
    (select v.id::text from public.partner_agreement_versions v where v.status = 'published'), ''), false);

  update public.partner_agreement_versions v set status = 'archived' where v.status = 'published';

  insert into public.partner_agreement_versions (title, preamble, clauses)
  values ('AGREEMENT_TESTS اتفاقية فحص', 'ديباجة فحص.',
          '[{"k":"t1","title":"بند فحص أول","body":"نصّ البند الأول."},
            {"k":"t2","title":"بند فحص ثانٍ","body":"نصّ البند الثاني."}]'::jsonb)
  returning id into v_id;

  v_hash := (select public.partner_agreement_hash(v.title, v.preamble, v.clauses)
             from public.partner_agreement_versions v where v.id = v_id);

  update public.partner_agreement_versions v
     set status = 'published', published_at = now(), grace_days = 14, doc_hash = v_hash
   where v.id = v_id;

  perform set_config('tours.ag_v1', v_id::text, false);
  perform set_config('tours.ag_v1_hash', v_hash, false);

  raise notice '✔ (٠-ب) إصدار فحص منشور (بصمة %)', left(v_hash, 8);
end;
$$;

-- ----------------------------------------------------------------------------
-- (٠-ج) شريكان بهويتَي دخول: «أ» قديمٌ يعمل منذ سنة، و«ب» أُنشئ الآن
-- ----------------------------------------------------------------------------
do $$
declare
  v_a      constant uuid := 'a1130000-0000-4000-8000-00000000000a';
  v_b      constant uuid := 'a1130000-0000-4000-8000-00000000000b';
  v_prof_a constant uuid := 'a1131000-0000-4000-8000-00000000000a';
  v_prof_b constant uuid := 'a1131000-0000-4000-8000-00000000000b';
  v_la     constant uuid := 'a1132000-0000-4000-8000-00000000000a';
  v_lb     constant uuid := 'a1132000-0000-4000-8000-00000000000b';
  v_cls    text := current_setting('tours.ag_class', true);
begin
  perform set_config('tours.ag_identities', '0', false);

  insert into public.subcontractors (id, company_name, phone, email, status, created_at)
  values
    (v_a, 'AGREEMENT_TESTS الشريك أ', '01000000011', 'agreement-a@local.invalid', 'approved',
     now() - interval '400 days'),
    (v_b, 'AGREEMENT_TESTS الشريك ب', '01000000012', 'agreement-b@local.invalid', 'approved',
     now());

  insert into public.subcontractor_vehicles (subcontractor_id, class_slug, label, active)
  values (v_a, v_cls, 'مركبة أ', true),
         (v_b, v_cls, 'مركبة ب', true);

  -- ممرُّ سيوة–الباويطي، نطاقان ٤٠ كم (الحارس في (٠) يثبت خلوّه)
  insert into public.price_lists
    (id, subcontractor_id, title, origin_label, origin_lat, origin_lng, origin_radius_km,
     dest_label, dest_lat, dest_lng, dest_radius_km, bidirectional, status)
  values
    (v_la, v_a, 'AGREEMENT_TESTS قائمة أ', 'سيوة', 29.200000, 25.520000, 40,
     'الباويطي', 28.350000, 28.860000, 40, true, 'approved'),
    (v_lb, v_b, 'AGREEMENT_TESTS قائمة ب', 'سيوة', 29.200000, 25.520000, 40,
     'الباويطي', 28.350000, 28.860000, 40, true, 'approved');

  -- ⚠ التكلفتان **متساويتان بقصد**: سقفُ الموجة الأولى يُشتقّ من هامش الحجز،
  --   وشريكٌ أغلى بمئةٍ يسقط من الموجة الأولى **لسببٍ مالي** فيُقرأ سقوطُه على
  --   أنه أثرُ حاجز الاتفاقية. والتأكيد (د-٢) يقيس الاتفاقية وحدها، فيجب ألّا
  --   يبقى في الفيكسترة سببُ سقوطٍ ثانٍ.
  insert into public.price_list_items (price_list_id, class_slug, cost)
  values (v_la, v_cls, 1500), (v_lb, v_cls, 1500);

  begin
    insert into auth.users (id, email) values
      (v_prof_a, 'agreement-a@local.invalid'),
      (v_prof_b, 'agreement-b@local.invalid');
    insert into public.profiles (id, role, full_name) values
      (v_prof_a, 'subcontractor', 'شريك أ'),
      (v_prof_b, 'subcontractor', 'شريك ب')
    on conflict (id) do update set role = 'subcontractor';
    update public.subcontractors set profile_id = v_prof_a where id = v_a;
    update public.subcontractors set profile_id = v_prof_b where id = v_b;
    perform set_config('tours.ag_identities', '1', false);
  exception
    when others then
      raise notice '⚠ (٠-ج) تعذّر إنشاء هويتي دخول (%) — أقسام الدور ستُتخطّى', sqlerrm;
  end;

  raise notice '✔ (٠-ج) شريكان: «أ» عمره ٤٠٠ يوم و«ب» أُنشئ الآن';
end;
$$;

-- ----------------------------------------------------------------------------
-- (أ) القبول يُسجَّل **بإصداره** — لا «قَبِل» مجرّدة
-- ----------------------------------------------------------------------------
do $$
declare
  v_a      constant uuid := 'a1130000-0000-4000-8000-00000000000a';
  v_prof_a constant uuid := 'a1131000-0000-4000-8000-00000000000a';
  v_v1     uuid := current_setting('tours.ag_v1', true)::uuid;
  v_hash   text := current_setting('tours.ag_v1_hash', true);
  v_res    record;
  v_row    record;
  v_st     record;
begin
  if current_setting('tours.ag_identities', true) <> '1' then
    raise notice '⏭ (أ) بلا هويات دخول — تخطٍّ';
    return;
  end if;

  perform set_config('request.jwt.claim.sub', v_prof_a::text, false);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_prof_a)::text, false);

  begin
    execute 'set local role authenticated';
    select * into v_res from public.accept_partner_agreement(v_v1, '  حمزة الشريك أ  ');
    execute 'reset role';
  exception
    when others then
      begin execute 'reset role'; exception when others then null; end;
      raise;
  end;

  if v_res.agreement_id is distinct from v_v1 then
    raise exception '(أ-١) القبول سُجّل على إصدارٍ آخر';
  end if;
  if v_res.already then
    raise exception '(أ-١) أولُ قبولٍ يُقرأ «مكرراً»';
  end if;

  select * into v_row from public.partner_agreement_acceptances a
   where a.subcontractor_id = v_a;

  if v_row.doc_hash is distinct from v_hash then
    raise exception '(أ-٢) بصمةُ النصّ لم تُنسخ في الصفّ — «النسخة كما قَبِلها» ادّعاءٌ بلا سند';
  end if;
  if v_row.agreement_version is null or v_row.agreement_version < 1 then
    raise exception '(أ-٢) رقمُ الإصدار لم يُنسخ';
  end if;
  if v_row.subcontractor_name is distinct from 'AGREEMENT_TESTS الشريك أ' then
    raise exception '(أ-٢) اسمُ الشركة لم يُلتقط لحظةَ القبول — قِيس «%»', v_row.subcontractor_name;
  end if;
  -- المسافاتُ البيضاء تُشذَّب: توقيعٌ بفراغاتٍ حوله يُقرأ بعد سنتين توقيعاً ناقصاً
  if v_row.signed_name is distinct from 'حمزة الشريك أ' then
    raise exception '(أ-٢) اسمُ الموقّع «%» — لم يُشذَّب', v_row.signed_name;
  end if;
  if v_row.accepted_by is distinct from v_prof_a then
    raise exception '(أ-٢) الفاعلُ لم يُسجَّل — لا يُعرف مَن قَبِل من حسابات الشركة';
  end if;
  if v_row.actor_kind <> 'partner' then
    raise exception '(أ-٢) صفةُ القابل «%» — المتوقع partner', v_row.actor_kind;
  end if;

  select * into v_st from public.partner_agreement_status(v_a);
  if not v_st.accepted or not v_st.ok then
    raise exception '(أ-٣) قبولٌ مسجَّل ولا تراه الحالة';
  end if;

  -- والنداء المكرر (ضغطةٌ مزدوجة) لا يُنشئ صفاً ثانياً ولا يرفع خطأ
  begin
    execute 'set local role authenticated';
    select * into v_res from public.accept_partner_agreement(v_v1, 'حمزة الشريك أ');
    execute 'reset role';
  exception
    when others then
      begin execute 'reset role'; exception when others then null; end;
      raise;
  end;
  if not v_res.already then
    raise exception '(أ-٤) النداء المكرر لم يُقرأ «مكرراً»';
  end if;

  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claims', '', false);
  raise notice '✔ (أ) القبول لقطةٌ مكتفية: الإصدار والبصمة والموقّع والفاعل ولحظته · والنداء المكرر لا يُكرّر صفاً';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ب) 🔒 لا يُقبل أحدٌ نيابةً عن أحد — والمنعُ بنيويٌّ لا فحص
-- ----------------------------------------------------------------------------
do $$
declare
  v_a      constant uuid := 'a1130000-0000-4000-8000-00000000000a';
  v_b      constant uuid := 'a1130000-0000-4000-8000-00000000000b';
  v_prof_b constant uuid := 'a1131000-0000-4000-8000-00000000000b';
  v_v1     uuid := current_setting('tours.ag_v1', true)::uuid;
  v_hash   text := current_setting('tours.ag_v1_hash', true);
  v_n      integer;
  v_args   text;
  v_raised boolean;
begin
  -- (ب-١) 🔴 التوقيعُ نفسه لا يحمل وسيطَ متعهد — فالانتحال ممنوعٌ قبل أن يُفحص
  select pg_get_function_identity_arguments(p.oid) into v_args
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and p.proname = 'accept_partner_agreement';

  if v_args ilike '%subcontractor%' or v_args ilike '%p_sub%' or v_args ilike '%partner%' then
    raise exception
      '(ب-١) `accept_partner_agreement(%)` صار يقبل وسيطَ متعهد — وهذا يحوّلها من دالةٍ مقصورة على صاحبها إلى قبولٍ نيابةً عن الغير (سابقة D-20)',
      v_args;
  end if;

  if current_setting('tours.ag_identities', true) <> '1' then
    raise notice '⏭ (ب-٢..٤) بلا هويات دخول — تخطٍّ';
    return;
  end if;

  perform set_config('request.jwt.claim.sub', v_prof_b::text, false);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_prof_b)::text, false);

  -- (ب-٢) «ب» يقبل، فيُسجَّل القبول لـ«ب» لا لغيره
  begin
    execute 'set local role authenticated';
    perform public.accept_partner_agreement(v_v1, 'الشريك ب');
    execute 'reset role';
  exception
    when others then
      begin execute 'reset role'; exception when others then null; end;
      raise;
  end;

  select count(*) into v_n from public.partner_agreement_acceptances a
   where a.subcontractor_id = v_b;
  if v_n <> 1 then
    raise exception '(ب-٢) قبولُ «ب» سُجّل % مرة', v_n;
  end if;

  -- (ب-٣) ولا يستطيع أن يكتب صفَّ قبولٍ لغيره مباشرةً: **لا منحَ أصلاً**
  v_raised := false;
  begin
    execute 'set local role authenticated';
    begin
      insert into public.partner_agreement_acceptances (
        subcontractor_id, subcontractor_name, agreement_id, agreement_version,
        doc_hash, signed_name
      ) values (v_a, 'انتحال', v_v1, 1, v_hash, 'انتحال');
    exception
      when others then v_raised := true;
    end;
    execute 'reset role';
  exception
    when others then
      begin execute 'reset role'; exception when others then null; end;
      raise;
  end;
  if not v_raised then
    raise exception '(ب-٣) دورُ المتصفح كتب صفَّ قبولٍ باسم متعهدٍ آخر';
  end if;

  -- (ب-٤) ولا يقرأ سجلَّ القبول إطلاقاً — لا صفَّه ولا صفَّ غيره
  v_raised := false;
  begin
    execute 'set local role authenticated';
    begin
      select count(*) into v_n from public.partner_agreement_acceptances;
    exception
      when others then v_raised := true;
    end;
    execute 'reset role';
  exception
    when others then
      begin execute 'reset role'; exception when others then null; end;
      raise;
  end;
  if not v_raised then
    raise exception
      '(ب-٤) دورُ المتصفح قرأ سجلَّ القبول (% صفاً) — والسجلُّ لا يُقرأ إلا عبر دالةٍ بحارسها', v_n;
  end if;

  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claims', '', false);
  raise notice '✔ (ب) لا وسيطَ متعهد في التوقيع · ولا كتابةَ ولا قراءةَ لسجلّ القبول من دور المتصفح';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ج) 🔴 المهلة — الاتجاهان معاً، وأحدُهما وحده شهادةٌ لنفسه
-- ----------------------------------------------------------------------------
do $$
declare
  v_a    constant uuid := 'a1130000-0000-4000-8000-00000000000a';
  v_b    constant uuid := 'a1130000-0000-4000-8000-00000000000b';
  v_c    constant uuid := 'a1130000-0000-4000-8000-00000000000c';
  v_v1   uuid := current_setting('tours.ag_v1', true)::uuid;
  v_pub  timestamptz;
  v_st   record;
begin
  select v.published_at into v_pub
  from public.partner_agreement_versions v where v.id = v_v1;

  -- شريكٌ ثالث لم يقبل شيئاً، عمره ٤٠٠ يوم — وهو حالةُ حمزة لحظةَ الهجرة
  insert into public.subcontractors (id, company_name, phone, status, created_at)
  values (v_c, 'AGREEMENT_TESTS الشريك ج', '01000000013', 'approved', now() - interval '400 days');

  -- (ج-١) 🔴 لا تنقطع عروضه لحظة النشر
  select * into v_st from public.partner_agreement_status(v_c);
  if v_st.accepted then
    raise exception '(ج-١) شريكٌ لم يقبل شيئاً يُقرأ «قابلاً»';
  end if;
  if not v_st.in_grace or not v_st.ok then
    raise exception
      '(ج-١) شريكٌ يعمل منذ ٤٠٠ يوم صار محجوباً لحظةَ نشر الاتفاقية — وهذا يقطع رزق شريكٍ حيّ بلا إنذار';
  end if;

  -- (ج-٢) والمهلةُ من **النشر** لأنه الأحدث، لا من إنشاء صفّه
  if v_st.deadline is null
     or abs(extract(epoch from (v_st.deadline - (v_pub + interval '14 days')))) > 2 then
    raise exception '(ج-٢) المهلة % والمنتظر %', v_st.deadline, v_pub + interval '14 days';
  end if;

  -- (ج-٣) وشريكٌ أُنشئ الآن داخل مهلته — وهو ما يُبقي فيكسترات المجموعات
  --       الأخرى (dispatch · coverage · crew · failed_trip · finance) خضراء
  --       اليوم وبعد سنة، لا اليوم وحده
  select * into v_st from public.partner_agreement_status(v_b);
  if not v_st.ok then
    raise exception '(ج-٣) شريكٌ أُنشئ الآن محجوب — وكلُّ فيكسترة اختبارٍ في المستودع ستُحجب معه';
  end if;

  -- (ج-٤) والقابلُ ليس في مهلة أصلاً: قَبِل فانتهى الأمر
  select * into v_st from public.partner_agreement_status(v_a);
  if not v_st.accepted or not v_st.ok then
    raise exception '(ج-٤) القابلُ يُقرأ غيرَ قابل';
  end if;

  raise notice '✔ (ج) المهلة تُقاس من greatest(نشر، إنشاء): القديمُ لا ينقطع، والجديدُ داخلها';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ج-٥) وحين تنقضي المهلة **تعضّ فعلاً** — إصدارٌ نُشر قبل عشرة أيام بمهلة خمسة
--
-- ولماذا إصدارٌ ثانٍ لا تعديلُ مهلةِ الأول؟ لأن المنشور مجمَّد بحكم حارسه —
-- وهو نفسه ما يُقاس في (ح). فالطريق الوحيد إلى «مهلةٍ منقضية» هو النشر نفسه.
--
-- 🔬 والأرقامُ مختارةٌ كي **تفترق الحالتان على قاعدةٍ واحدة**: نشرٌ قبل عشرة
--    أيام بمهلة خمسة ⇒ من أُنشئ قبل ذلك (أ · ج) مهلتُه انقضت منذ خمسة أيام،
--    ومن أُنشئ الآن (ب) مهلتُه تمتدّ خمسةً أخرى. وبلا هذا الافتراق يقيس (د)
--    قاعدةً سقط منها الجميع أو نجا فيها الجميع — وكلاهما يمرّ بلا أن يقيس شيئاً.
-- ----------------------------------------------------------------------------
do $$
declare
  v_a   constant uuid := 'a1130000-0000-4000-8000-00000000000a';
  v_c   constant uuid := 'a1130000-0000-4000-8000-00000000000c';
  v_id  uuid;
  v_st  record;
begin
  update public.partner_agreement_versions v set status = 'archived' where v.status = 'published';

  insert into public.partner_agreement_versions (title, preamble, clauses)
  values ('AGREEMENT_TESTS إصدار منقضٍ', '',
          '[{"k":"x1","title":"بند","body":"نصّ"}]'::jsonb)
  returning id into v_id;

  update public.partner_agreement_versions v
     set status = 'published', published_at = now() - interval '10 days',
         grace_days = 5, doc_hash = 'agreement-tests-expired'
   where v.id = v_id;

  perform set_config('tours.ag_v2', v_id::text, false);

  select * into v_st from public.partner_agreement_status(v_c);
  if v_st.in_grace or v_st.ok then
    raise exception '(ج-٥) شريكٌ انقضت مهلته ولم يقبل يمرّ من الحاجز — الحاجزُ زينة';
  end if;
  if public.partner_agreement_ok(v_c) then
    raise exception '(ج-٥) الغلافُ البولياني يخالف الدالة الأمّ';
  end if;

  -- (ج-٦) والقابلُ للإصدار الأول لم يعد قابلاً: **التعديل أبطل قبوله**
  select * into v_st from public.partner_agreement_status(v_a);
  if v_st.accepted then
    raise exception
      '(ج-٦) قبولُ إصدارٍ سابق يُحسب قبولاً للجديد — فيُدافَع عن الخصم بنصٍّ لم يقرأه أحد';
  end if;
  if v_st.ok then
    raise exception '(ج-٦) صاحبُ القبول القديم يمرّ من الحاجز بعد نشر نسخةٍ لم يقبلها';
  end if;

  -- (ج-٧) ومقبضُ اللوحة يُطفئ الحاجز ولا يمحو الصفوف
  update public.partner_agreement_settings s set gate_enabled = false where s.id = true;
  select * into v_st from public.partner_agreement_status(v_c);
  if not v_st.ok or v_st.required then
    raise exception '(ج-٧) إطفاءُ الاشتراط من اللوحة لا يعمل';
  end if;
  update public.partner_agreement_settings s set gate_enabled = true where s.id = true;

  raise notice '✔ (ج-٥..٧) المهلةُ المنقضية تحجب · والنسخةُ الجديدة تُبطل القبول السابق · والمقبض يُطفئ ولا يمحو';
end;
$$;

-- ----------------------------------------------------------------------------
-- (د) الحوض — من لم يقبل بعد انقضاء مهلته **لا يُنشأ له عرض**
-- ----------------------------------------------------------------------------
do $$
declare
  v_a     constant uuid := 'a1130000-0000-4000-8000-00000000000a';
  v_b     constant uuid := 'a1130000-0000-4000-8000-00000000000b';
  v_cls   text := current_setting('tours.ag_class', true);
  v_res   record;
  v_seen  integer;
  v_has_a boolean;
  v_has_b boolean;
begin
  select * into v_res from public.create_booking(
    jsonb_build_object('label', 'سيوة، مطروح', 'lat', 29.190000, 'lng', 25.560000),
    jsonb_build_object('label', 'الباويطي، الواحات البحرية', 'lat', 28.360000, 'lng', 28.830000),
    1, false, 0,
    340, null, 'test',
    v_cls, 'full',
    'عميل اختبار الاتفاقية', '01111111112', null, now() + interval '3 days',
    'AGREEMENT_TESTS_FIXTURE'
  );
  perform set_config('tours.ag_booking', v_res.id::text, false);

  update public.bookings set status = 'under_review' where id = v_res.id;
  update public.bookings set status = 'confirmed'    where id = v_res.id;

  -- الحالة الآن (من ج-٥): «أ» قَبِل إصداراً مؤرشفاً ⇒ محجوب · و«ب» أُنشئ الآن
  -- ⇒ في مهلته. فالحوض يجب أن يحوي «ب» وحده.
  select count(*) filter (where p.subcontractor_id = v_a) > 0,
         count(*) filter (where p.subcontractor_id = v_b) > 0,
         count(*)
    into v_has_a, v_has_b, v_seen
  from public.dispatch_pool(v_res.id, 1) p;

  if v_has_a then
    raise exception
      '(د-١) متعهدٌ لم يقبل النسخة السارية ومهلته منقضية ما زال في حوض البث — فالقبولُ زينة';
  end if;
  if not v_has_b then
    raise exception
      '(د-٢) متعهدٌ داخل مهلته سقط من الحوض — الحاجزُ يقطع من لا يستحق القطع';
  end if;

  -- (د-٣) وقبولُ «أ» للنسخة السارية يعيده — الشاهدُ المعاكس، وبلا هذا يمرّ
  --       التأكيدُ الأول على قاعدةٍ سقط منها الجميع لسببٍ آخر
  insert into public.partner_agreement_acceptances (
    subcontractor_id, subcontractor_name, agreement_id, agreement_version,
    doc_hash, signed_name, actor_kind
  )
  select v_a, 'AGREEMENT_TESTS الشريك أ', v.id, v.version, v.doc_hash, 'الشريك أ', 'admin'
  from public.partner_agreement_versions v where v.status = 'published';

  select count(*) filter (where p.subcontractor_id = v_a) > 0
    into v_has_a
  from public.dispatch_pool(v_res.id, 1) p;

  if not v_has_a then
    raise exception '(د-٣) قَبِل النسخةَ السارية ولم يعد إلى الحوض';
  end if;

  raise notice '✔ (د) الحوض يُسقط من انقضت مهلته ولم يقبل · ويعيده قبولُه · ولا يمسّ من هو في مهلته';
end;
$$;

-- ----------------------------------------------------------------------------
-- (هـ) العرضُ القائم والالتزامُ به — الطبقتان الثانية والثالثة
-- ----------------------------------------------------------------------------
do $$
declare
  v_c      constant uuid := 'a1130000-0000-4000-8000-00000000000c';
  v_prof_c constant uuid := 'a1131000-0000-4000-8000-00000000000c';
  v_book   uuid := current_setting('tours.ag_booking', true)::uuid;
  v_cls    text := current_setting('tours.ag_class', true);
  v_lc     constant uuid := 'a1132000-0000-4000-8000-00000000000c';
  v_offer  uuid;
  v_seen   integer;
  v_raised boolean := false;
  v_hint   text;
begin
  -- «ج» محجوبٌ (٤٠٠ يوم · لم يقبل · مهلةُ الإصدار الساري صفر)، ونمنحه هويةَ
  -- دخول ومركبةً وقائمةً كي يكون **مؤهَّلاً في كل شيء إلا الاتفاقية**
  insert into public.subcontractor_vehicles (subcontractor_id, class_slug, label, active)
  values (v_c, v_cls, 'مركبة ج', true);
  insert into public.price_lists
    (id, subcontractor_id, title, origin_label, origin_lat, origin_lng, origin_radius_km,
     dest_label, dest_lat, dest_lng, dest_radius_km, bidirectional, status)
  values (v_lc, v_c, 'AGREEMENT_TESTS قائمة ج', 'سيوة', 29.200000, 25.520000, 40,
          'الباويطي', 28.350000, 28.860000, 40, true, 'approved');
  insert into public.price_list_items (price_list_id, class_slug, cost) values (v_lc, v_cls, 1550);

  begin
    insert into auth.users (id, email) values (v_prof_c, 'agreement-c@local.invalid');
    insert into public.profiles (id, role, full_name)
    values (v_prof_c, 'subcontractor', 'شريك ج')
    on conflict (id) do update set role = 'subcontractor';
    update public.subcontractors set profile_id = v_prof_c where id = v_c;
  exception
    when others then
      raise notice '⏭ (هـ) تعذّرت هوية «ج» (%) — تخطٍّ', sqlerrm;
      return;
  end;

  -- عرضٌ **بُثّ قبل انقضاء المهلة** ويبقى في الجدول: هذا بالضبط ما تُسقطه
  -- `portal_offers` كي لا يبقى زرٌّ يفشل دائماً (سابقة 0027 حرفياً)
  insert into public.dispatches (booking_id, status, round)
  values (v_book, 'broadcasting', 1)
  on conflict (booking_id) do update set status = 'broadcasting';

  insert into public.trip_offers (booking_id, subcontractor_id, round, payout, status, expires_at)
  values (v_book, v_c, 1, 1550, 'pending', now() + interval '30 minutes')
  returning id into v_offer;

  perform set_config('request.jwt.claim.sub', v_prof_c::text, false);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_prof_c)::text, false);

  -- (هـ-١) لا يراه في صندوقه
  begin
    execute 'set local role authenticated';
    select count(*) into v_seen from public.portal_offers() o where o.offer_id = v_offer;
    execute 'reset role';
  exception
    when others then
      begin execute 'reset role'; exception when others then null; end;
      raise;
  end;
  if v_seen <> 0 then
    raise exception
      '(هـ-١) عرضٌ قائم يبقى مرئياً لمن انقضت مهلته — فيضغط زرّاً يفشل دائماً بلا أن يعرف السبب';
  end if;

  -- (هـ-٢) ولا يلتزم به لو وصله رابطُه
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
      '(هـ-٢) 🔴 التزم متعهدٌ برحلة عميلٍ دفع بلا اتفاقيةٍ مقبولة — وهذا ما يُبطل أي خصمٍ لاحق';
  end if;
  if position('اتفاقية المتعهد' in v_hint) = 0 then
    raise exception
      '(هـ-٢) رُفض القبول برسالةٍ لا تسمّي السبب («%») — والشريك يطارد عائقاً غير العائق', left(v_hint, 120);
  end if;

  -- (هـ-٣) والعرضُ لم يُمسّ: رفضٌ لا يُتلف حالة
  select count(*) into v_seen from public.trip_offers o
   where o.id = v_offer and o.status = 'pending';
  if v_seen <> 1 then
    raise exception '(هـ-٣) الرفضُ غيّر حالة العرض — والمعاملة لم تُرجَع كاملةً (D-48)';
  end if;

  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claims', '', false);
  raise notice '✔ (هـ) العرضُ القائم يُسقَط من الصندوق · والالتزامُ يُرفض برسالةٍ تسمّي سببه · وحالةُ العرض سليمة';
end;
$$;

-- ----------------------------------------------------------------------------
-- (و) تعديلُ الاتفاقية — المسارُ الحقيقي من اللوحة، بحارسه
-- ----------------------------------------------------------------------------
do $$
declare
  v_admin  uuid;
  v_draft  uuid;
  v_before uuid;
  v_after  uuid;
  v_n      integer;
  v_raised boolean;
begin
  select p.id into v_admin from public.profiles p where p.role = 'admin' limit 1;
  if v_admin is null then
    raise notice '⏭ (و) بلا هوية مشرف — تخطٍّ';
    return;
  end if;

  select v.id into v_before from public.partner_agreement_versions v where v.status = 'published';

  -- (و-١) غيرُ المشرف لا ينشر ولا يحرّر
  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claims', '', false);
  v_raised := false;
  begin
    execute 'set local role authenticated';
    begin
      perform public.draft_partner_agreement_from_current();
    exception when others then v_raised := true;
    end;
    execute 'reset role';
  exception
    when others then
      begin execute 'reset role'; exception when others then null; end;
      raise;
  end;
  if not v_raised then
    raise exception '(و-١) دورُ متصفحٍ بلا هوية مشرف أنشأ مسودةَ اتفاقية';
  end if;

  -- (و-٢) والمشرف ينشئ ويحرّر وينشر
  perform set_config('request.jwt.claim.sub', v_admin::text, false);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_admin)::text, false);

  v_draft := public.draft_partner_agreement_from_current();
  if v_draft is null then
    raise exception '(و-٢) لم تُنشأ المسودة';
  end if;

  select count(*) into v_n from public.partner_agreement_versions v
   where v.id = v_draft and v.status = 'draft';
  if v_n <> 1 then
    raise exception '(و-٢) المسودةُ وُلدت بحالةٍ غير draft';
  end if;

  -- ومسودةٌ ثانيةٌ مرفوضة: مسودتان تتنافسان على معنى «التعديل الجاري»
  v_raised := false;
  begin
    perform public.draft_partner_agreement_from_current();
  exception when others then v_raised := true;
  end;
  if not v_raised then
    raise exception '(و-٢) أُنشئت مسودةٌ ثانية بينما الأولى مفتوحة';
  end if;

  update public.partner_agreement_versions v
     set clauses = '[{"k":"n1","title":"بند بعد التعديل","body":"نصٌّ جديد."}]'::jsonb
   where v.id = v_draft;

  perform public.publish_partner_agreement(v_draft, 7);

  select v.id into v_after from public.partner_agreement_versions v where v.status = 'published';
  if v_after is distinct from v_draft then
    raise exception '(و-٣) النشرُ لم يجعل المسودةَ ساريةً';
  end if;

  select count(*) into v_n from public.partner_agreement_versions v
   where v.id = v_before and v.status = 'archived';
  if v_n <> 1 then
    raise exception '(و-٣) الإصدارُ السابق لم يُؤرشف — وفهرسُ «منشورٌ واحد» كان سيسقط';
  end if;

  -- (و-٤) والبصمةُ حُسبت لحظةَ النشر لا تُركت فارغة
  select count(*) into v_n from public.partner_agreement_versions v
   where v.id = v_draft
     and v.doc_hash = public.partner_agreement_hash(v.title, v.preamble, v.clauses)
     and v.grace_days = 7
     and v.published_at is not null;
  if v_n <> 1 then
    raise exception '(و-٤) النشرُ ترك البصمةَ أو المهلةَ أو لحظةَ النشر ناقصة';
  end if;

  -- (و-٥) ولا يُنشر إصدارٌ بلا بندٍ مكتمل
  v_raised := false;
  begin
    perform public.publish_partner_agreement(v_draft, 7);
  exception when others then v_raised := true;
  end;
  if not v_raised then
    raise exception '(و-٥) نُشر إصدارٌ منشورٌ سلفاً';
  end if;

  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claims', '', false);
  raise notice '✔ (و) التعديل مسودةٌ بحارس مشرفٍ · تُنشر فتؤرشف السابقة · وببصمةٍ ومهلةٍ محسوبتين';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ز) السجلُّ مُلحَقٌ فقط — والمنحُ هو الحارس (القاعدة الذهبية ١٦)
-- ----------------------------------------------------------------------------
do $$
declare
  v_a    constant uuid := 'a1130000-0000-4000-8000-00000000000a';
  v_bad  text := '';
  v_n    integer;
  r      record;
begin
  -- (ز-١) لا تعديل
  begin
    update public.partner_agreement_acceptances a set signed_name = 'zz'
     where a.subcontractor_id = v_a;
    raise exception '(ز-١) صفُّ قبولٍ عُدِّل — والسجلُّ الذي يكتبه المُدَّعي ليس دليلاً';
  exception
    when others then
      if position('مُلحَقٌ فقط' in sqlerrm) = 0 then raise; end if;
  end;

  -- (ز-٢) ولا حذف
  begin
    delete from public.partner_agreement_acceptances a where a.subcontractor_id = v_a;
    raise exception '(ز-٢) صفُّ قبولٍ حُذف';
  exception
    when others then
      if position('مُلحَقٌ فقط' in sqlerrm) = 0 then raise; end if;
  end;

  -- (ز-٣) ولا منحَ لأيّ دورٍ يصله متصفحٌ أو مفتاحُ خدمةٍ مسرَّب
  for r in
    select x.role, v.verb
    from (values ('anon'), ('authenticated')) x(role)
    cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE')) v(verb)
    union all
    select 'service_role', v.verb
    from (values ('UPDATE'), ('DELETE'), ('TRUNCATE')) v(verb)
  loop
    if has_table_privilege(r.role, 'public.partner_agreement_acceptances', r.verb) then
      v_bad := v_bad || format('%s/%s · ', r.role, r.verb);
    end if;
  end loop;
  if v_bad <> '' then
    raise exception '(ز-٣) منحٌ باقٍ على سجلّ القبول: %', v_bad;
  end if;

  -- والشاهدُ المعاكس: ما يجب أن يبقى، وإلا مرّ الفحصُ على قاعدةٍ سُحب منها كلُّ شيء
  if not has_table_privilege('service_role', 'public.partner_agreement_acceptances', 'INSERT')
     or not has_table_privilege('service_role', 'public.partner_agreement_acceptances', 'SELECT') then
    raise exception '(ز-٣) سُحب من دور الخدمة ما يحتاجه التطبيق — الكتابةُ أو القراءة';
  end if;

  -- (ز-٤) وTRUNCATE يُقاس بالمنح لا بمحاولةٍ حيّة: يأخذ قفلاً حصرياً قبل فحص
  --       الصلاحية، وقاعدةُ إنتاجٍ حيّة لا تُقفل لأجل تأكيد. والمُشغّل مركَّب:
  select count(*)::integer into v_n
  from pg_trigger t join pg_class c on c.oid = t.tgrelid
  where c.relname = 'partner_agreement_acceptances'
    and t.tgname = 'partner_agreement_acceptances_no_truncate'
    and not t.tgisinternal;
  if v_n <> 1 then
    raise exception '(ز-٤) مُشغّلُ منعِ TRUNCATE غائب — وRLS لا تغطّي TRUNCATE لأيّ دور';
  end if;

  raise notice '✔ (ز) السجلُّ لا يُعدَّل ولا يُحذف ولا يُفرَّغ · ولا منحَ لدور متصفحٍ ولا لمفتاح خدمةٍ عليه';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ح) الإصدارُ المنشور مجمَّد — «النسخة كما قَبِلها» ليست وعداً بل حارس
-- ----------------------------------------------------------------------------
do $$
declare
  v_cur uuid;
  v_n   integer;
begin
  select v.id into v_cur from public.partner_agreement_versions v where v.status = 'published';

  -- (ح-١) لا يُعدَّل نصُّه
  begin
    update public.partner_agreement_versions v set title = 'zz' where v.id = v_cur;
    raise exception '(ح-١) نصُّ إصدارٍ منشور أُعيدت كتابته — فمن قَبِل نصّاً صار قابلاً لغيره';
  exception
    when others then
      if position('لا يُعدَّل نصُّه' in sqlerrm) = 0 then raise; end if;
  end;

  -- (ح-٢) ولا تُعاد كتابة بنوده
  begin
    update public.partner_agreement_versions v set clauses = '[]'::jsonb where v.id = v_cur;
    raise exception '(ح-٢) بنودُ إصدارٍ منشور أُفرغت';
  exception
    when others then
      if position('لا يُعدَّل نصُّه' in sqlerrm) = 0 then raise; end if;
  end;

  -- (ح-٣) ولا يُحذف
  begin
    delete from public.partner_agreement_versions v where v.id = v_cur;
    raise exception '(ح-٣) إصدارٌ منشور حُذف';
  exception
    when others then
      if position('لا يُحذفان' in sqlerrm) = 0 then raise; end if;
  end;

  -- (ح-٤) ولا المؤرشف: عليه قبولاتٌ يُحتجّ بها
  begin
    delete from public.partner_agreement_versions v where v.status = 'archived';
    raise exception '(ح-٤) إصدارٌ مؤرشف حُذف — وعليه قبولاتُ من عمل بموجبه';
  exception
    when others then
      if position('لا يُحذفان' in sqlerrm) = 0
         and position('violates foreign key' in sqlerrm) = 0
         and position('foreign key' in sqlerrm) = 0 then raise; end if;
  end;

  -- (ح-٥) ولا يولَد إصدارٌ منشوراً من الباب الخلفي
  begin
    insert into public.partner_agreement_versions (title, status, published_at, doc_hash, grace_days)
    values ('zz', 'published', now(), 'zz', 0);
    raise exception '(ح-٥) وُلد إصدارٌ منشور بلا مرور بـ`publish_partner_agreement`';
  exception
    when others then
      if position('لا يُولَد منشوراً' in sqlerrm) = 0 then raise; end if;
  end;

  -- (ح-٦) ومنشورٌ واحدٌ لا أكثر — الفهرسُ الفريد الجزئي هو الحَكَم
  select count(*)::integer into v_n
  from public.partner_agreement_versions v where v.status = 'published';
  if v_n <> 1 then
    raise exception '(ح-٦) عددُ الإصدارات المنشورة % — والمنشورُ واحدٌ حتماً', v_n;
  end if;

  raise notice '✔ (ح) المنشورُ والمؤرشف مجمَّدان · ولا يولَد إصدارٌ منشوراً · ومنشورٌ واحد لا أكثر';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ط) صفرُ أثرٍ على بيانات المالك — يُقاس لا يُوعَد به
--
-- والمعاملةُ كلُّها تُرجَع بيد المُشغّل، لكن هذا القسم يُثبت أن الملف **لم
-- يخترع صفاً** خارج فيكسترته: لا متعهدَ بلا وسم، ولا قبولَ لغير فيكسترته.
--
-- ⚠ والمقياسُ **فرقٌ عن خط الأساس المأخوذ في (٠)**، لا عددٌ مطلق. فالجدولُ لم
--   يعد فارغاً على الإنتاج: الاتفاقية نُشرت 2026-08-18 وقَبِلها شريكٌ حقيقي من
--   بورتاله، فصار فيه صفٌّ حيٌّ اسمُه اسمُ شركته لا وسمُ فيكسترة. و«صفرُ صفٍّ
--   خارج الوسم» كانت تقرأ ذلك القبولَ الحقيقي **تسرّباً** وتحمرّ على نظامٍ سليم.
--
-- 🔴 والحارسُ لم يُرخَ بذلك، بل شُدَّ: كان يفحص **الاسم** وحده، فصار يفحص ثلاثة
--   على **الصفوف المُحدَثة داخل المعاملة** حصراً — أي صفٍّ لم يكن في خط الأساس:
--     ١) اسمُه موسومٌ بالفيكسترة، **و**متعهدُه من متعهدي الفيكسترة (فاسمٌ موسوم
--        على متعهدٍ حقيقي كان يمرّ سابقاً، وصار يُمسَك)؛
--     ٢) وصفوفُ خط الأساس كلُّها باقية — لا صفَّ حيٍّ اختفى؛
--     ٣) وبصمتُها لم تتغيّر — لا صفَّ حيٍّ عُدّل تحت الملف.
-- ----------------------------------------------------------------------------
do $$
declare
  v_n       integer;
  v_dig     text;
  v_real    text  := current_setting('tours.ag_real', true);
  v_pre_n   integer := coalesce(nullif(current_setting('tours.ag_acc_pre_n', true), ''), '0')::integer;
  v_pre_raw text  := coalesce(current_setting('tours.ag_acc_pre_ids', true), '');
  v_pre_ids uuid[];
begin
  if v_pre_raw = '' then
    v_pre_ids := '{}'::uuid[];
  else
    v_pre_ids := string_to_array(v_pre_raw, ',')::uuid[];
  end if;
  if coalesce(array_length(v_pre_ids, 1), 0) <> v_pre_n then
    raise exception '(ط) 🔴 خط الأساس نفسه مكسور: % معرّفاً مقابل عدّادٍ % — لم يُقرأ في (٠) قبل أول كتابة',
      coalesce(array_length(v_pre_ids, 1), 0), v_pre_n;
  end if;

  -- (ط-١) كلُّ صفِّ قبولٍ **أحدثه هذا الملف** موسومٌ بالفيكسترة ومُعلَّقٌ على
  --       متعهدِ فيكسترة. وصفوفُ خط الأساس مستثناةٌ بمعرّفها لا باسمها.
  select count(*)::integer into v_n
  from public.partner_agreement_acceptances a
  where not (a.id = any (v_pre_ids))
    and (a.subcontractor_name not like 'AGREEMENT_TESTS%'
         or a.subcontractor_id not in (select s.id from public.subcontractors s
                                        where s.company_name like 'AGREEMENT_TESTS%'));
  if v_n <> 0 then
    raise exception
      '(ط-١) % صفَّ قبولٍ أحدثه هذا الملف خارج فيكسترته — أوّلُها [%] لمتعهدٍ [%]. وسجلُّ القبول مُلحَقٌ فقط: ما يُكتب فيه لا يُحذف، فلولا إرجاعُ المعاملة لبقي في حجّة المالك إلى الأبد',
      v_n,
      (select a.subcontractor_name from public.partner_agreement_acceptances a
        where not (a.id = any (v_pre_ids))
          and (a.subcontractor_name not like 'AGREEMENT_TESTS%'
               or a.subcontractor_id not in (select s.id from public.subcontractors s
                                              where s.company_name like 'AGREEMENT_TESTS%'))
        order by a.accepted_at limit 1),
      (select a.subcontractor_id::text from public.partner_agreement_acceptances a
        where not (a.id = any (v_pre_ids))
          and (a.subcontractor_name not like 'AGREEMENT_TESTS%'
               or a.subcontractor_id not in (select s.id from public.subcontractors s
                                              where s.company_name like 'AGREEMENT_TESTS%'))
        order by a.accepted_at limit 1);
  end if;

  -- (ط-٢) وصفوفُ خط الأساس الحيّة باقيةٌ بعددها — لا حذفَ تحت الملف
  select count(*)::integer into v_n
  from public.partner_agreement_acceptances a where a.id = any (v_pre_ids);
  if v_n <> v_pre_n then
    raise exception '(ط-٢) 🔴 قبولٌ حيٌّ اختفى: % من % صفَّ أساسٍ باقٍ — وحجّةُ المالك على شريكه تقوم بهذا الصف',
      v_n, v_pre_n;
  end if;

  -- (ط-٣) وبصمتُها كما كانت — لا تعديلَ تحت الملف
  select coalesce(
    md5(string_agg(a.id::text || '§' || a.subcontractor_id::text || '§' ||
                   coalesce(a.subcontractor_name, '') || '§' || a.agreement_id::text || '§' ||
                   a.agreement_version::text || '§' || a.doc_hash || '§' ||
                   coalesce(a.signed_name, '') || '§' || a.actor_kind || '§' ||
                   coalesce(a.accepted_by::text, '') || '§' ||
                   to_char(a.accepted_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.US'),
                   '¶' order by a.id)), '') into v_dig
  from public.partner_agreement_acceptances a where a.id = any (v_pre_ids);
  if v_dig is distinct from coalesce(current_setting('tours.ag_acc_pre_dig', true), '') then
    raise exception '(ط-٣) 🔴 قبولٌ حيٌّ تغيّر تحت الملف: البصمة [%] والأساس [%]',
      left(v_dig, 12), left(coalesce(current_setting('tours.ag_acc_pre_dig', true), ''), 12);
  end if;

  select count(*)::integer into v_n
  from public.subcontractors s
  where s.company_name like 'AGREEMENT_TESTS%';
  if v_n <> 3 then
    raise exception '(ط) فيكسترةُ المتعهدين % صفاً لا ٣', v_n;
  end if;

  -- والإصدار الحقيقي ما زال موجوداً (مؤرشفاً داخل هذه المعاملة، ويعود بالإرجاع)
  if v_real <> '' then
    select count(*)::integer into v_n
    from public.partner_agreement_versions v where v.id = v_real::uuid;
    if v_n <> 1 then
      raise exception '(ط) 🔴 اختفى الإصدارُ الحقيقي من الجدول';
    end if;
  end if;

  raise notice '✔ (ط) لا صفَّ قبولٍ مُحدَثٍ خارج الفيكسترة · و% صفَّ قبولٍ حيٌّ باقٍ ببصمته · والإصدارُ الحقيقي باقٍ (يعود منشوراً بإرجاع المعاملة)',
    v_pre_n;
end;
$$;

do $$
begin
  raise notice '';
  raise notice '════════════════════════════════════════════════════════════';
  raise notice 'ALL PASSED — partner_agreement_tests';
  raise notice '════════════════════════════════════════════════════════════';
end;
$$;
