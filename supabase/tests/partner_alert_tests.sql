-- ============================================================================
-- partner_alert_tests.sql — اختبارات قبول لتوجيه الإشعارات **لكل مستقبِل**
--                            وحالة إتاحة المتعهد (هجرة 0054_partner_alerts.sql)
--
-- كيف تشغّله: `pnpm db:test partner_alert` أو الصق الملف كاملاً في SQL Editor.
-- النجاح = آخر سطر «ALL PASSED». وأي فشل exception عربية فيها المتوقع والفعلي.
--
-- ومن psql بدور صاحب القاعدة **لا بد** من ON_ERROR_STOP و‑1 معاً:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f supabase/tests/partner_alert_tests.sql
--
-- ══════════════════════════════════════════════════════════════════════════
--  🔬 كل تأكيد هنا يُسمّي **الطفرة التي يمسكها** — والجدول في القسم (ح)
-- ══════════════════════════════════════════════════════════════════════════
--
-- «ماذا يثبت هذا التأكيد فعلاً؟» (اتفاقية ٨) لا يُجاب عنه بالنية بل بالطفرة:
-- تأكيدٌ لا توجد تعديلةٌ معقولة في الكود تُسقطه هو تأكيدٌ يزيّن التقرير ولا
-- يحرس شيئاً. ولذلك القسم (ح) **يبني الطفرات فعلاً ويشغّلها**: ثلاث نسخٍ
-- مشوّهة من `dispatch_pool` و`partner_availability` تُنشأ داخل المعاملة
-- الفرعية، ويُثبَت أن الفحص يفرّق بينها وبين الأصل. طفرةٌ تمرّ = فحصٌ ميّت.
--
-- ── لماذا كلُّ القياس داخل معاملةٍ فرعية تُرجَع ─────────────────────────────
--
-- هذه **قاعدة الإنتاج نفسها** (اتفاقية ٨): متعهدٌ اختباري باقٍ يدخل حوض بثٍّ
-- حقيقي، وصفُّ تفضيلاتٍ باقٍ يُسكِت متعهداً حقيقياً، وصفُّ إشعارٍ باقٍ يُرسَل
-- فعلاً في الدورة التالية. فـ«صفر أثر» خاصيةٌ بنيوية لا خطوةُ تنظيفٍ في النهاية.
--
-- ── ولا بيانات حقيقية ──────────────────────────────────────────────────────
--   • إحداثيات **صحراوية نائية** (٢٥٫٩، ٢٧٫١) ← (٢٤٫٣، ٢٨٫٩)، ويُثبَت في
--     (٠-ج) أن **صفر متعهدٍ حقيقي** يغطيها — فلا يفشل الملف لأن المشروع نجح.
--   • الفئة والتعريفة والقوائم يخلقها الملف، فلا رقم من كتالوج المالك.
--   • وجاهزيةُ المزوّدين تُقلَب داخل المعاملة الفرعية وتُرجَع معها.
--
-- ما يغطيه الملف:
--   (٠)  الشروط المسبقة · مسبار المسبار · (٠-ب) خط الأساس
--   (أ)  التوجيه لكل مستقبِل: الثنائي ⇒ ops، والرباعي ⇒ قنوات المتعهد
--   (ب)  البلوغ: `inbox` لا يُبلِغ · مزوّدٌ مطفأ لا يُبلِغ · تليجرام يُبلِغ
--   (ج)  الإتاحة بعاملين: بالغ × راغب
--   (د)  الحوض: مطابقٌ حين الكل متاح · يتخطّى الموقوف · والاحتياطي حين لا أحد
--   (هـ) الحارس: تعذّر البلوغ ⇒ لا قناة بالغة في الصف (مادّة تصعيد الطبقة)
--   (و)  العزل: متعهدٌ لا يقرأ غيره ولا ينفّذ حساب الإتاحة · والزائر لا شيء
--   (ز)  إسقاط `portal_inbox`: صفر مفتاحٍ يخصّ العميل
--   (ح)  🔬 **الطفرات**: ثلاثٌ تُبنى وتُشغَّل ويُثبَت أن الفحص يمسكها
--   (ك)  🔴 مرجع العميل لا يبلغ سطحاً يراه المتعهد (0056) — المنبع وصفوف
--        البث والصندوق وردّ القبول، وطفرةٌ رابعة تُثبت أن المسح حيّ
--   (ط)  المنح: `truncate`/`trigger`/`references` على كل جدول جديد
--   (ي)  صفر أثر
--
-- المرجع: supabase/migrations/0054_partner_alerts.sql · lib/partner-alerts-types.ts
--         · docs/phase-briefs/FAILED-TRIPS-AND-PARTNER-ALERTS.md §٣
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (٠) الشروط المسبقة — قراءةٌ محضة، ولا كتابة قبل المعاملة الفرعية
-- ----------------------------------------------------------------------------
do $$
declare
  v_missing text;
begin
  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claims', '', false);

  select string_agg(x.rel, '، ') into v_missing
  from (values
    ('public.partner_alert_prefs'), ('public.partner_push_subscriptions'),
    ('public.notification_providers'), ('public.notifications'),
    ('public.subcontractors'), ('public.bookings')
  ) as x(rel)
  where to_regclass(x.rel) is null;
  if v_missing is not null then
    raise exception 'شرط مسبق: كائنات مفقودة (نفّذ 0054_partner_alerts.sql أولاً): %', v_missing;
  end if;

  select string_agg(x.sig, '، ') into v_missing
  from (values
    ('public.partner_channels(uuid)'),
    ('public.partner_availability(uuid)'),
    ('public.partner_available(uuid)'),
    ('public.notification_channels_for(text, uuid)'),
    ('public.notification_channels()'),
    ('public.provider_ready(text)'),
    ('public.queue_notification(text, jsonb)'),
    ('public.queue_notification(text, jsonb, text, uuid)'),
    ('public.dispatch_pool(uuid, integer)'),
    ('public.dispatch_broadcast(uuid, integer)'),
    ('public.portal_inbox(integer)'),
    ('public.portal_alert_prefs()'),
    ('public.admin_partner_availability()')
  ) as x(sig)
  where to_regprocedure(x.sig) is null;
  if v_missing is not null then
    raise exception 'شرط مسبق: دوال مفقودة: %', v_missing;
  end if;

  -- 🔒 العمود الذي كان غيابه يُسقط القناة كلها
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'subcontractors'
      and column_name = 'telegram_chat_id'
  ) then
    raise exception 'شرط مسبق: subcontractors.telegram_chat_id غير موجود';
  end if;

  raise notice '✔ (٠) الشروط المسبقة سليمة';
end;
$$;

-- ----------------------------------------------------------------------------
-- (٠-ب) خط الأساس — تُقارَن به نهايةُ الملف
-- ----------------------------------------------------------------------------
do $$
declare
  v_s integer; v_p integer; v_u integer; v_n integer; v_b integer; v_v integer;
begin
  select count(*)::integer into v_s from public.subcontractors;
  select count(*)::integer into v_p from public.partner_alert_prefs;
  select count(*)::integer into v_u from public.partner_push_subscriptions;
  select count(*)::integer into v_n from public.notifications;
  select count(*)::integer into v_b from public.bookings;
  select count(*)::integer into v_v from public.vehicle_classes;

  perform set_config('tours.pa_s', v_s::text, false);
  perform set_config('tours.pa_p', v_p::text, false);
  perform set_config('tours.pa_u', v_u::text, false);
  perform set_config('tours.pa_n', v_n::text, false);
  perform set_config('tours.pa_b', v_b::text, false);
  perform set_config('tours.pa_v', v_v::text, false);

  -- وحالةُ المزوّدين كما هي الآن — تُستعاد بالإرجاع، وتُقارَن للتأكيد
  perform set_config('tours.pa_prov',
    (select coalesce(string_agg(np.channel || '=' || np.ready::text, ',' order by np.channel), '')
       from public.notification_providers np), false);

  raise notice '✔ (٠-ب) خط الأساس: % متعهداً · % تفضيلاً · % اشتراكاً · % إشعاراً · % حجزاً · % فئة',
    v_s, v_p, v_u, v_n, v_b, v_v;
end;
$$;

-- ----------------------------------------------------------------------------
-- (٠-ج) 🔬 مسبار المسبار — قبل أي قياسٍ يُبنى عليه
--
-- ثلاثة أشياء لو اختلّت لصار كل ما بعدها يقيس رفضاً لا سلوكاً:
--   (١) مشرفٌ حقيقي موجود (وإلا فقياسُ العزل يقيس غياب جلسة).
--   (٢) المسار الصحراوي **بلا تغطيةٍ حقيقية** (وإلا اختلط متعهدٌ حقيقي بالحوض).
--   (٣) `dispatch_pool` تُرجع صفوفاً **أصلاً** على فيكسترةٍ سليمة — فلو كانت
--       تُرجع فارغاً دائماً لمرّ كل تأكيدات القسم (د) وهي لا تقيس شيئاً.
--       (٣) يُقاس داخل المعاملة الفرعية بعد بناء الفيكسترة.
-- ----------------------------------------------------------------------------
do $$
declare
  v_admin uuid;
  v_cov   integer;
begin
  select p.id into v_admin from public.profiles p where p.role = 'admin' limit 1;
  if v_admin is null then
    raise exception '(٠-ج) لا مشرف في القاعدة — قياسُ العزل كان سيقيس غياب جلسة لا حارساً';
  end if;
  perform set_config('tours.pa_admin', v_admin::text, false);

  select count(*)::integer into v_cov
  from public.coverage_matches(25.9, 27.1, 24.3, 28.9);
  if v_cov <> 0 then
    raise exception '(٠-ج) المسار الصحراوي يغطيه % متعهداً حقيقياً — اختر إحداثيات أنأى', v_cov;
  end if;

  raise notice '✔ (٠-ج) مسبار المسبار: مشرفٌ موجود · والمسار الصحراوي بصفر تغطيةٍ حقيقية';
end;
$$;

-- ============================================================================
-- القياس الحيّ كله — داخل معاملةٍ فرعية تُرجَع بكاملها
-- ============================================================================
do $$
declare
  v_admin  uuid := current_setting('tours.pa_admin', true)::uuid;
  v_cls    constant uuid := 'a0000000-0000-4000-8000-0000000000cc';
  v_slug   constant text := 'patest-class';
  -- ثلاثة متعهدين: «ت» بمعرّف تليجرام · «ص» بصندوقٍ فقط · «د» بجهاز دفع
  v_t      constant uuid := 'a0000000-0000-4000-8000-00000000001a';
  v_i      constant uuid := 'a0000000-0000-4000-8000-00000000002b';
  v_d      constant uuid := 'a0000000-0000-4000-8000-00000000003c';
  -- «خ» متاحٌ لكنه **خارج التغطية** — يفرّق بين نطاقَي الاحتياطي في (ح-١)
  v_o      constant uuid := 'a0000000-0000-4000-8000-00000000004d';
  v_lt     constant uuid := 'a1000000-0000-4000-8000-00000000001a';
  v_li     constant uuid := 'a1000000-0000-4000-8000-00000000002b';
  v_ld     constant uuid := 'a1000000-0000-4000-8000-00000000003c';
  v_usr    constant uuid := 'a2000000-0000-4000-8000-00000000001a';
  v_bk     record;
  v_bid    uuid;
  v_n      integer;
  v_ch     text[];
  v_av     record;
  v_nid    uuid;
  v_rec    record;
  v_pool   text;
  v_legacy text;
  v_mut    text;
  v_ok     boolean;
  v_keys   text;
  -- (ك) حارس تسريب مرجع العميل — 0056
  v_ref    text;
  v_code   text;
  v_off    uuid;
  v_acc    record;
begin
  begin
    -- ══ الفيكسترة ═════════════════════════════════════════════════════════
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                            created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
    values (v_usr, '00000000-0000-0000-0000-000000000000', 'authenticated',
            'authenticated', 'partneralert@example.invalid', 'x', now(), now(),
            '{}'::jsonb, '{"full_name": "PARTNER_ALERT_TESTS متعهد"}'::jsonb);

    insert into public.subcontractors (id, profile_id, company_name, phone, email, status)
    values (v_t, v_usr, 'PA_TESTS تليجرام', '01000000101', 'pa-t@example.invalid', 'approved'),
           (v_i, null,  'PA_TESTS صندوق',   '01000000102', 'pa-i@example.invalid', 'approved'),
           (v_d, null,  'PA_TESTS دفع',     '01000000103', 'pa-d@example.invalid', 'approved');

    insert into public.vehicle_classes (id, slug, title, capacity, luggage_capacity, active, sort)
    values (v_cls, v_slug, 'PA_TESTS فئة', 4, 4, true, 9761);
    insert into public.tariffs (class_id, per_km, base_fee, min_price,
                                waiting_hour_price, round_trip_factor)
    values (v_cls, 20, 1000, 0, 0, 1.8);

    insert into public.subcontractor_vehicles (subcontractor_id, class_slug, label, active)
    values (v_t, v_slug, 'PA مركبة ت', true),
           (v_i, v_slug, 'PA مركبة ص', true),
           (v_d, v_slug, 'PA مركبة د', true);

    insert into public.price_lists
      (id, subcontractor_id, title, origin_label, origin_lat, origin_lng, origin_radius_km,
       dest_label, dest_lat, dest_lng, dest_radius_km, bidirectional, status)
    values
      (v_lt, v_t, 'PA قائمة ت', 'PA مبدأ', 25.9, 27.1, 40, 'PA منتهى', 24.3, 28.9, 40, true, 'approved'),
      (v_li, v_i, 'PA قائمة ص', 'PA مبدأ', 25.9, 27.1, 40, 'PA منتهى', 24.3, 28.9, 40, true, 'approved'),
      (v_ld, v_d, 'PA قائمة د', 'PA مبدأ', 25.9, 27.1, 40, 'PA منتهى', 24.3, 28.9, 40, true, 'approved');

    -- تكاليف متمايزة كي يكون الترتيب قابلاً للمقارنة حرفاً بحرف
    insert into public.price_list_items (price_list_id, class_slug, cost)
    values (v_lt, v_slug, 1000), (v_li, v_slug, 1100), (v_ld, v_slug, 1200);

    -- 🔴 والهامشُ وأرضيةُ البث يُثبَّتان هنا (إصلاح حمرةٍ صنفية، 2026-08-17):
    --    الفارق 1000/1100/1200 يفترض ضمناً هامشاً حيّاً واسعاً، لأن
    --    `dispatch_ceiling(round 3)` = `cost + min(margin, min_margin_amount…)`.
    --    وعند `margin_value = 1` (وقد ضبطه المالك كذلك فعلاً) يسقط صاحبُ 1200
    --    من الحوض، فيرمي مسبارُ المسبار أدناه و**المجموعة كلها ترفض أن تبدأ** —
    --    وهي بعينها الحمرة التي أصابت `extras` و`loyalty` وهذا الملف من قبل.
    --    والتوقّعات هنا تقيس **من يصله العرض**، فتثبيت أساسها لا يُضعفها.
    --
    --    والكتلة تنتهي بـ`PARTNER_ALERT_TESTS_ROLLBACK`، فلا صفَّ يُحفظ ولا
    --    استعادةٌ تُكتب ثم تُنسى.
    update public.pricing_settings
       set margin_type = 'percent', margin_value = 20, margin_min_amount = 0
     where id = true;
    update public.dispatch_settings set min_margin_amount = 0 where id = true;

    perform set_config('request.jwt.claims',
      json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

    select * into v_bk from public.create_booking(
      jsonb_build_object('label', 'PA مبدأ', 'lat', 25.9, 'lng', 27.1),
      jsonb_build_object('label', 'PA منتهى', 'lat', 24.3, 'lng', 28.9),
      -- المسافة أطول من المستقيمة بين النقطتين (≈٢٥٤ كم) — وإلا رفضها الحارس
      2, false, 0, 300, 260, 'estimate', v_slug, 'full',
      'PARTNER_ALERT_TESTS عميل', '01000000109', null,
      now() + interval '4 days',
      'PARTNER_ALERT_TESTS_FIXTURE', null, null, 0, null, 0);
    v_bid := v_bk.id;

    update public.bookings set status = 'under_review' where id = v_bid;
    update public.bookings set status = 'confirmed'    where id = v_bid;

    -- 🔬 مسبار المسبار (٣): الحوض يُرجع صفوفاً أصلاً
    select count(*)::integer into v_n from public.dispatch_pool(v_bid, 3);
    if v_n < 3 then
      raise exception '(٠-ج/٣) الحوض أرجع % صفاً والفيكسترة ثلاثة — كل تأكيدات (د) كانت ستمرّ على فراغ', v_n;
    end if;
    raise notice '✔ (٠-ج/٣) مسبار المسبار: الحوض يُرجع % صفاً على الفيكسترة — فالقياس بعده ذو معنى', v_n;

    -- ══ (ب) البلوغ: أي قناةٍ تُبلِغ فعلاً؟ ══════════════════════════════════
    -- الحالة الابتدائية: المزوّدون **كلهم مطفأون** (بذرة الهجرة)، ولا معرّف
    -- تليجرام لأحد ⇒ لا أحد بالغ. وهذه هي حالةُ الإنتاج اليوم بالضبط.
    update public.notification_providers set ready = false;

    select public.partner_channels(v_t) into v_ch;
    if v_ch is null or not (v_ch @> array['inbox']) then
      raise exception '(ب-١) `inbox` ليس ضمن قنوات متعهدٍ بلا تفضيلات — والافتراض أن كل القنوات مفعَّلة';
    end if;
    if v_ch && array['telegram', 'webpush', 'email'] then
      raise exception '(ب-١) قناةٌ بالغة ظهرت والمزوّدون كلهم مطفأون: %', v_ch::text;
    end if;

    -- 🔬 الطفرة الممسوكة: عدُّ `inbox` قناةً بالغة
    select * into v_av from public.partner_availability(v_t);
    if v_av.reachable then
      raise exception '(ب-٢) متعهدٌ قناتُه الوحيدة `inbox` حُسب **بالغاً** — الاحتياطي يصمت في الحالة التي وُجد لها';
    end if;
    if not v_av.willing then
      raise exception '(ب-٢) متعهدٌ بلا صفِّ تفضيلات حُسب **غير راغب** — الغياب ليس صمتاً، والافتراض «يستقبل»';
    end if;
    if v_av.available then
      raise exception '(ب-٢) غيرُ بالغٍ حُسب متاحاً — العاملان ليسا شرطين';
    end if;

    -- معرّف تليجرام بلا مزوّدٍ جاهز: **لا يزال غير بالغ**
    update public.subcontractors set telegram_chat_id = '123456789' where id = v_t;
    if public.partner_channels(v_t) && array['telegram'] then
      raise exception '(ب-٣) تليجرام حُسب قناةً والمزوّد مطفأ — البريد ودفع الويب سيمرّان بالخطأ نفسه';
    end if;

    -- ومع المزوّد: يبلغ
    update public.notification_providers set ready = true where channel = 'telegram';
    if not (public.partner_channels(v_t) && array['telegram']) then
      raise exception '(ب-٤) تليجرام لم يُحسب قناةً رغم المعرّف والمزوّد معاً';
    end if;
    select * into v_av from public.partner_availability(v_t);
    if not (v_av.reachable and v_av.willing and v_av.available) then
      raise exception '(ب-٤) بالغٌ وراغبٌ ولم يُحسب متاحاً: بالغ=% راغب=% متاح=%',
        v_av.reachable, v_av.willing, v_av.available;
    end if;
    if not (v_av.reaching_channels = array['telegram']) then
      raise exception '(ب-٤) القنوات البالغة % والمتوقع {telegram} — و`inbox` يجب ألّا يظهر فيها',
        v_av.reaching_channels::text;
    end if;
    raise notice '✔ (ب) البلوغ: `inbox` لا يُبلِغ · ومعرّفٌ بلا مزوّد لا يُبلِغ · وباجتماعهما يُبلِغ';

    -- ══ (ج) الإتاحة بعاملين ════════════════════════════════════════════════
    insert into public.partner_alert_prefs (subcontractor_id, accepting_offers)
    values (v_t, false);
    select * into v_av from public.partner_availability(v_t);
    if not v_av.reachable then
      raise exception '(ج-١) إيقافُ الاستقبال غيّر **البلوغ** — والعاملان مستقلان';
    end if;
    if v_av.willing or v_av.available then
      raise exception '(ج-١) متعهدٌ أوقف الاستقبال ما زال متاحاً';
    end if;

    -- والعكس: راغبٌ غير بالغ
    update public.partner_alert_prefs set accepting_offers = true, telegram_enabled = false
      where subcontractor_id = v_t;
    select * into v_av from public.partner_availability(v_t);
    if v_av.reachable or v_av.available then
      raise exception '(ج-٢) أطفأ قناته الوحيدة وبقي بالغاً — «الإطفاء الكامل = غير متصل» مكسور';
    end if;
    if not v_av.willing then
      raise exception '(ج-٢) إطفاءُ قناةٍ غيّر **الرغبة** — والعاملان مستقلان';
    end if;
    update public.partner_alert_prefs set telegram_enabled = true where subcontractor_id = v_t;
    raise notice '✔ (ج) الإتاحة بعاملين مستقلَّين: بالغٌ × راغب — وإطفاءُ الكل = غير متصل لا «صامت»';

    -- ══ (د) الحوض ══════════════════════════════════════════════════════════
    -- نسخةٌ «قديمة» بحرفها للمقارنة: نفس الأهلية بلا إتاحةٍ ولا احتياطي
    create or replace function public.pa_pool_legacy(p_booking_id uuid, p_round integer)
    returns table(subcontractor_id uuid, payout numeric)
    language plpgsql stable security definer set search_path = '' as $body$
    declare
      v_b record; v_olat numeric; v_olng numeric; v_dlat numeric; v_dlng numeric;
      v_factor numeric := 1; v_ceiling numeric;
    begin
      select b.class_slug, b.trip into v_b from public.bookings b where b.id = p_booking_id;
      if not found then return; end if;
      v_olat := public.jsonb_number(v_b.trip, 'originLat', null);
      v_olng := public.jsonb_number(v_b.trip, 'originLng', null);
      v_dlat := public.jsonb_number(v_b.trip, 'destLat', null);
      v_dlng := public.jsonb_number(v_b.trip, 'destLng', null);
      if v_olat is null or v_olng is null or v_dlat is null or v_dlng is null then return; end if;
      if coalesce(v_b.trip ->> 'roundTrip', 'false') in ('true','t','1') then
        select coalesce(t.round_trip_factor, 1) into v_factor from public.tariffs t
          join public.vehicle_classes vc on vc.id = t.class_id where vc.slug = v_b.class_slug;
        v_factor := coalesce(v_factor, 1);
      end if;
      v_ceiling := public.dispatch_ceiling(p_booking_id, p_round);
      if v_ceiling is null then return; end if;
      return query
      with covered as (
        select cm.subcontractor_id as sid, min(pli.cost) as cost
        from public.coverage_matches(v_olat, v_olng, v_dlat, v_dlng) cm
        join public.price_list_items pli on pli.price_list_id = cm.price_list_id
         and pli.class_slug = v_b.class_slug
        group by cm.subcontractor_id
      )
      select c.sid, round(c.cost * v_factor, 2)
      from covered c
      join public.subcontractors s on s.id = c.sid and s.status = 'approved'
      where exists (select 1 from public.subcontractor_vehicles v
                    where v.subcontractor_id = c.sid and v.class_slug = v_b.class_slug and v.active)
        and round(c.cost * v_factor, 2) <= v_ceiling
      order by 2 asc, 1 asc;
    end; $body$;

    -- (د-١) الكل متاح ⇒ **مطابقٌ للقديم حرفاً بحرف**
    update public.subcontractors set telegram_chat_id = '10' || right(id::text, 6)
      where id in (v_t, v_i, v_d);
    select string_agg(x.subcontractor_id::text || '@' || x.payout, ',')
      into v_pool   from public.dispatch_pool(v_bid, 3) x;
    select string_agg(x.subcontractor_id::text || '@' || x.payout, ',')
      into v_legacy from public.pa_pool_legacy(v_bid, 3) x;
    if v_pool is distinct from v_legacy then
      raise exception '(د-١) الحوض تغيّر والكلُّ متاح — قديم [%] جديد [%]', v_legacy, v_pool;
    end if;
    if coalesce(array_length(string_to_array(v_pool, ','), 1), 0) < 3 then
      raise exception '(د-١) تطابقٌ على فراغ: الحوض [%] — التأكيد لا يقيس شيئاً', coalesce(v_pool, '∅');
    end if;

    -- (د-٢) واحدٌ أوقف الاستقبال ⇒ يخرج **وحده**
    insert into public.partner_alert_prefs (subcontractor_id, accepting_offers)
    values (v_i, false)
    on conflict (subcontractor_id) do update set accepting_offers = false;
    select count(*)::integer into v_n from public.dispatch_pool(v_bid, 3) x
      where x.subcontractor_id = v_i;
    if v_n <> 0 then
      raise exception '(د-٢) المتعهد الموقِف ما زال في الحوض';
    end if;
    select count(*)::integer into v_n from public.dispatch_pool(v_bid, 3);
    if v_n <> 2 then
      raise exception '(د-٢) الحوض % والمتوقع ٢ — تخطّي واحدٍ أخرج غيره معه', v_n;
    end if;

    -- (د-٣) لا أحد متاح ⇒ **الاحتياطي يضمّ المؤهَّلين كلهم**
    insert into public.partner_alert_prefs (subcontractor_id, accepting_offers)
    values (v_t, false), (v_d, false)
    on conflict (subcontractor_id) do update set accepting_offers = false;
    select string_agg(x.subcontractor_id::text || '@' || x.payout, ',')
      into v_pool from public.dispatch_pool(v_bid, 3) x;
    if v_pool is distinct from v_legacy then
      raise exception '(د-٣) الاحتياطي لم يُعِد المؤهَّلين كلهم — قديم [%] جديد [%]', v_legacy, v_pool;
    end if;
    raise notice '✔ (د) الحوض: مطابقٌ حين الكل متاح · ويتخطّى الموقِفَ وحده · والاحتياطي يضمّ الجميع حين لا متاح';

    -- ══ (أ) التوجيه لكل مستقبِل ═════════════════════════════════════════════
    update public.partner_alert_prefs set accepting_offers = true;

    -- الثنائي: جمهورُه التشغيل، وقنواته قنوات المالك — بلا تغيّر
    v_nid := public.queue_notification('booking_created', '{"pa": true}'::jsonb);
    select n.recipient_kind, n.recipient_id, n.channels into v_rec
      from public.notifications n where n.id = v_nid;
    if v_rec.recipient_kind <> 'ops' or v_rec.recipient_id is not null then
      raise exception '(أ-١) التوقيع الثنائي غيّر وجهته — سبعةُ مُنادين قائمين انكسروا صامتين';
    end if;
    if v_rec.channels is distinct from public.notification_channels() then
      raise exception '(أ-١) الثنائي لم يعد يكتب قنوات المالك: [%] مقابل [%]',
        v_rec.channels::text, public.notification_channels()::text;
    end if;

    -- الرباعي: جمهورُه المتعهد، وقنواته قنواتُه هو
    v_nid := public.queue_notification('trip_offered', '{"pa": true}'::jsonb, 'partner', v_t);
    select n.recipient_kind, n.recipient_id, n.channels into v_rec
      from public.notifications n where n.id = v_nid;
    if v_rec.recipient_kind <> 'partner' or v_rec.recipient_id <> v_t then
      raise exception '(أ-٢) الرباعي لم يوجّه الصف إلى المتعهد';
    end if;
    if v_rec.channels is distinct from public.partner_channels(v_t) then
      raise exception '(أ-٢) قنوات الصف [%] وقنوات المتعهد [%] — التوجيه ما زال عاماً',
        v_rec.channels::text, public.partner_channels(v_t)::text;
    end if;
    -- 🔬 الطفرة الممسوكة: بقاء `notification_channels()` هي الحاسمة للجميع
    if v_rec.channels is not distinct from public.notification_channels() then
      raise exception '(أ-٢) قنوات المتعهد تطابق قنوات المالك — التأكيد لا يفرّق بين الحالتين، غيّر الفيكسترة';
    end if;

    -- «متعهد» بلا معرّف يُردّ إلى التشغيل لا يكسر القيد
    v_nid := public.queue_notification('trip_offered', '{"pa": true}'::jsonb, 'partner', null);
    select n.recipient_kind into v_rec from public.notifications n where n.id = v_nid;
    if v_rec.recipient_kind <> 'ops' then
      raise exception '(أ-٣) «متعهد» بلا معرّف لم يُردّ إلى التشغيل';
    end if;
    raise notice '✔ (أ) التوجيه لكل مستقبِل: الثنائي ⇒ ops بقنوات المالك · والرباعي ⇒ قنوات المتعهد نفسه';

    -- ══ (هـ) مادّة الحارس: تعذّر البلوغ يُقرأ من الصف ═══════════════════════
    -- الحارس نفسه في طبقة التسليم (`dispatchRecipients`)، وما يقرؤه هو **قنوات
    -- الصف**. فإن لم تحمل قناةً بالغةً واحدة، صعّد إلى التشغيل.
    update public.partner_alert_prefs
       set telegram_enabled = false, webpush_enabled = false, email_enabled = false
     where subcontractor_id = v_d;
    v_nid := public.queue_notification('trip_offered', '{"pa": true}'::jsonb, 'partner', v_d);
    select n.channels into v_ch from public.notifications n where n.id = v_nid;
    if v_ch && array['telegram', 'webpush', 'email'] then
      raise exception '(هـ) صفُّ متعهدٍ أطفأ كل قنواته البالغة يحمل قناةً بالغة: %', v_ch::text;
    end if;
    if not (v_ch @> array['inbox']) then
      raise exception '(هـ) الصندوق سقط أيضاً — والسجلُّ يجب أن يبقى ولو تعذّر البلوغ';
    end if;
    raise notice '✔ (هـ) تعذّر البلوغ مقروءٌ من الصف نفسه (صفر قناةٍ بالغة، والصندوق باقٍ) — وهي مادّة التصعيد';

    -- ══ (ز) إسقاط `portal_inbox`: صفر مفتاحٍ يخصّ العميل ════════════════════
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_usr, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';

    select string_agg(k, '، ') into v_keys
    from (
      select distinct jsonb_object_keys(i.summary) as k from public.portal_inbox(200) i
    ) t
    where k in ('customerName', 'customerPhone', 'customerWhatsapp', 'total', 'notes', 'partnerEmail',
                'status', 'subcontractorId');
    if v_keys is not null then
      raise exception '(ز) صندوق البورتال يسرّب مفاتيح: % — القائمة البيضاء مكسورة', v_keys;
    end if;

    -- ولا يرى صندوق غيره
    select count(*)::integer into v_n from public.portal_inbox(200) i;
    if exists (
      select 1 from public.notifications n
      where n.recipient_id = v_d and n.id in (select i.id from public.portal_inbox(200) i)
    ) then
      raise exception '(ز) المتعهد يقرأ صندوق متعهدٍ آخر';
    end if;
    raise notice '✔ (ز) صندوق البورتال: صفر مفتاحٍ يخصّ العميل (% صفاً لصاحبه)، ولا صفَّ لغيره', v_n;

    -- ══ (و) العزل ══════════════════════════════════════════════════════════
    -- (و-١) لا يقرأ تفضيلات غيره
    select count(*)::integer into v_n from public.partner_alert_prefs p
      where p.subcontractor_id <> v_t;
    if v_n <> 0 then
      raise exception '(و-١) المتعهد يقرأ % صفَّ تفضيلاتٍ لغيره', v_n;
    end if;

    -- (و-٢) لا ينفّذ حساب الإتاحة على أحد — وإلا عرف متى يصمت كلُّ منافس
    v_ok := false;
    begin
      perform public.partner_availability(v_d);
      v_ok := true;
    exception when others then null; end;
    if v_ok then
      raise exception '(و-٢) المتعهد نفّذ partner_availability — فيعرف متى يبثّ وحده (D-19)';
    end if;

    v_ok := false;
    begin
      perform public.partner_channels(v_d);
      v_ok := true;
    exception when others then null; end;
    if v_ok then
      raise exception '(و-٢) المتعهد نفّذ partner_channels على غيره';
    end if;

    -- (و-٣) قائمة «مَن يسمع» فارغةٌ لغير المشرف — الحارس داخل الجسم لا في المنحة
    select count(*)::integer into v_n from public.admin_partner_availability();
    if v_n <> 0 then
      raise exception '(و-٣) متعهدٌ رأى % صفاً من قائمة «مَن يسمع الآن» — أي قائمة منافسيه', v_n;
    end if;

    -- (و-٤) ولا يقرأ جدول المزوّدين
    v_ok := false;
    begin
      perform 1 from public.notification_providers;
      v_ok := true;
    exception when others then null; end;
    if v_ok then
      raise exception '(و-٤) المتعهد يقرأ notification_providers — والجدول بلا منحةٍ لأي دور مستخدم';
    end if;

    -- (و-٥) ولا يقرأ `notifications` مباشرةً (السياسة تشترط is_admin)
    select count(*)::integer into v_n from public.notifications;
    if v_n <> 0 then
      raise exception '(و-٥) المتعهد قرأ % صفاً من notifications مباشرةً — وفيها أسماء عملاء وهواتفهم', v_n;
    end if;

    execute 'reset role';
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
    raise notice '✔ (و) العزل: لا تفضيلاتِ غيره · ولا حسابَ إتاحةٍ لأحد · ولا قائمةَ منافسين · ولا مزوّدين · ولا notifications';

    -- ══ (ح) 🔬 الطفرات — تُبنى وتُشغَّل ويُثبَت أن الفحص يمسكها ═══════════════
    --
    -- ⚠ **وطفرةٌ كُتبت هنا أولاً ثم سقطت، والسقوط نفسه هو النتيجة:** جُرّب وضعُ
    -- شرط الإتاحة **داخل `covered`** — وهو التحذير المكتوب في الهجرة — فأعطى
    -- الناتج نفسه حرفاً بحرف. والسبب بنيوي: `covered` يُجمِّع `min(cost)`
    -- **بحسب المتعهد**، و`partner_available` دالةُ متعهدٍ لا دالةُ قائمةِ سعر،
    -- فطرحُه قبل التجميع أو بعده سواء. أي أن موضع هذا الشرط بالذات **آمنٌ
    -- بالبناء**، والخطر المكتوب في الهجرة يخصّ شرطاً يعتمد على قائمة السعر.
    -- فأُبدلت الطفرة بأخرى **تفرّق فعلاً**، لأن طفرةً لا تفرّق تُثبِّت وهماً.
    --
    -- الطفرة (١): **نطاق الاحتياطي عام لا محصورٌ بالمؤهَّلين** — وهذه تحرق
    -- المسار بحق: مسارٌ كلُّ مغطّيه صامتون بينما متعهدٌ متاحٌ في طرفٍ آخر من
    -- البلد ⇒ الموجة تنتهي **بلا أحد**، وهو بالضبط ما وُجد الاحتياطي ليمنعه.
    create or replace function public.pa_pool_mut1(p_booking_id uuid, p_round integer)
    returns table(subcontractor_id uuid, payout numeric)
    language sql stable security definer set search_path = '' as $body$
      with ranked as (
        select x.subcontractor_id as sid, x.payout,
               public.partner_available(x.subcontractor_id) as avail
        from public.pa_pool_legacy(p_booking_id, p_round) x
      )
      select r.sid, r.payout
      from ranked r
      where r.avail
         -- ← الطفرة: «هل من متاحٍ في القاعدة كلها؟» بدل «من المؤهَّلين؟»
         or not exists (select 1 from public.subcontractors s
                        where public.partner_available(s.id))
      order by 2 asc, 1 asc;
    $body$;

    -- الطفرة (٢): الاحتياطي محذوف
    create or replace function public.pa_pool_mut2(p_booking_id uuid, p_round integer)
    returns table(subcontractor_id uuid, payout numeric)
    language sql stable security definer set search_path = '' as $body$
      select x.subcontractor_id, x.payout
      from public.pa_pool_legacy(p_booking_id, p_round) x
      where public.partner_available(x.subcontractor_id);
    $body$;

    -- 🔬 والحالة التي تفرّق: **لا أحد متاح**
    insert into public.partner_alert_prefs (subcontractor_id, accepting_offers)
    select id, false from public.subcontractors where id in (v_t, v_i, v_d)
    on conflict (subcontractor_id) do update set accepting_offers = false;

    select string_agg(x.subcontractor_id::text, ',' order by x.subcontractor_id)
      into v_pool from public.dispatch_pool(v_bid, 3) x;
    select string_agg(x.subcontractor_id::text, ',' order by x.subcontractor_id)
      into v_mut  from public.pa_pool_mut2(v_bid, 3) x;
    if v_pool is null then
      raise exception '(ح-٢) الأصل أفرغ الحوض — الاحتياطي لا يعمل أصلاً';
    end if;
    if v_mut is not null then
      raise exception '(ح-٢) الطفرة «بلا احتياطي» أرجعت صفوفاً — فالحالة لا تفرّق، والفحص ميّت';
    end if;
    raise notice '✔ (ح-٢) طفرةُ حذف الاحتياطي **مُمسَكة**: الأصل % صفاً والطفرة صفر',
      array_length(string_to_array(v_pool, ','), 1);

    -- 🔬 والحالة التي تفرّق الطفرة (١): مغطّو المسار **كلهم** صامتون، ومتعهدٌ
    -- متاحٌ **خارج التغطية** (لا يظهر في الحوض أصلاً). فالأصل يبثّ للمؤهَّلين،
    -- والطفرة تراه «متاحاً في القاعدة» فتُنهي الموجة بلا أحد.
    insert into public.subcontractors (id, company_name, phone, email, status, telegram_chat_id)
    values (v_o, 'PA_TESTS خارج التغطية', '01000000104', 'pa-o@example.invalid', 'approved', '987654321');
    -- (بلا قائمة سعر ولا مركبة: فهو خارج الحوض بنيوياً)
    if not public.partner_available(v_o) then
      raise exception '(ح-١) المتعهد خارج التغطية غير متاح — الفيكسترة لا تفرّق';
    end if;
    if exists (select 1 from public.dispatch_pool(v_bid, 3) x where x.subcontractor_id = v_o) then
      raise exception '(ح-١) المتعهد خارج التغطية دخل الحوض — الفيكسترة خاطئة';
    end if;

    select string_agg(x.subcontractor_id::text, ',' order by x.subcontractor_id)
      into v_pool from public.dispatch_pool(v_bid, 3) x;
    select string_agg(x.subcontractor_id::text, ',' order by x.subcontractor_id)
      into v_mut  from public.pa_pool_mut1(v_bid, 3) x;
    if v_pool is null then
      raise exception '(ح-١) الأصل أفرغ الحوض — الاحتياطي محصورٌ بالمؤهَّلين كما يجب؟';
    end if;
    if v_mut is not null then
      raise exception '(ح-١) الطفرة «نطاق الاحتياطي عام» أرجعت صفوفاً — الحالة لا تفرّق، والفحص ميّت';
    end if;
    raise notice '✔ (ح-١) طفرةُ توسيع نطاق الاحتياطي **مُمسَكة**: الأصل % صفاً والطفرة صفر — ومتعهدٌ متاحٌ في طرفٍ آخر لا يُسكِت موجةً هنا',
      array_length(string_to_array(v_pool, ','), 1);

    -- الطفرة (٣): عدُّ `inbox` قناةً بالغة
    update public.partner_alert_prefs set accepting_offers = true;
    update public.subcontractors set telegram_chat_id = null where id = v_i;
    select (coalesce(public.partner_channels(v_i), '{}'::text[]) && array['telegram','webpush','email'])
      into v_ok;
    if v_ok then
      raise exception '(ح-٣) الفيكسترة لا تفرّق: المتعهد «ص» بالغٌ فعلاً';
    end if;
    if not (coalesce(public.partner_channels(v_i), '{}'::text[]) && array['telegram','webpush','email','inbox']) then
      raise exception '(ح-٣) المتعهد «ص» بلا `inbox` أيضاً — الفيكسترة خاطئة';
    end if;
    if public.partner_available(v_i) then
      raise exception '(ح-٣) طفرةُ «`inbox` قناةٌ بالغة» **غير ممسوكة**: متعهدٌ صندوقُه وحده حُسب متاحاً';
    end if;
    raise notice '✔ (ح-٣) طفرةُ عدّ `inbox` بلوغاً **مُمسَكة**: قنواتُه [%] وإتاحته false',
      public.partner_channels(v_i)::text;

    -- ══ (ك) 🔴 مرجع العميل لا يبلغ سطحاً يراه المتعهد — على أي قناة ═════════
    --
    -- ولماذا حارسٌ لا تعليق؟ لأن هذا **ثاني** ظهورٍ للتسريب نفسه: أزالته 0028
    -- من `portal_offers`/`portal_trips`، فأعادته 0054 من بابٍ جديد — حمولةُ
    -- صفِّ الإشعار — إلى ثلاثة أسطح دفعةً واحدة (الصندوق · تليجرام/البريد ·
    -- بطاقة الدفع). والمرجع + هاتفُ العميل (وهو بيد المتعهد بضرورةٍ تنفيذية)
    -- = مفتاحا `/track` ⇒ صفحة العميل ⇒ إجماليه ⇒ **هامشنا**.
    --
    -- والفحص **عند المنبع لا عند كل مصبّ**: ما دام مرجع العميل غائباً عن
    -- الحمولة العامة، لا تستطيع قناةٌ قائمةٌ ولا قناةٌ تُضاف غداً أن تطبعه.

    select b.reference into v_ref from public.bookings b where b.id = v_bid;
    v_code := public.partner_trip_code(v_bid);
    if v_ref is null or v_code is null then
      raise exception '(ك-٠) الفيكسترة بلا مرجعٍ أو بلا رمز — كل ما بعده كان سيمرّ على null';
    end if;
    if position(v_ref in v_code) > 0 or position(v_code in v_ref) > 0 then
      raise exception '(ك-٠) الرمز «%» والمرجع «%» يحوي أحدهما الآخر — الفحص لا يفرّق', v_code, v_ref;
    end if;

    -- (ك-١) المنبع: الحمولة العامة بلا مرجعٍ ومعها الرمز
    if position(v_ref in public.dispatch_trip_payload(v_bid, true)::text) > 0 then
      raise exception '(ك-١) الحمولة العامة تحمل مرجع العميل «%» — والقنوات الثلاث تطبعه جميعاً', v_ref;
    end if;
    if position(v_code in public.dispatch_trip_payload(v_bid, true)::text) = 0 then
      raise exception '(ك-١) الحمولة العامة بلا رمز الرحلة — الرسالة تخرج بلا معرّفٍ أصلاً';
    end if;
    -- 🔬 والاتجاه الآخر لازم: لولاه لمرّ الفحص على حمولةٍ أُفرغت من كل شيء،
    --    وأُعمي المالكُ عن المرجع الذي يطابق به ما يقوله العميل.
    if position(v_ref in public.dispatch_trip_payload(v_bid, false)::text) = 0 then
      raise exception '(ك-١) الحمولة التشغيلية فقدت المرجع — حمايةُ العميل صارت إعماءً للمالك';
    end if;

    -- (ك-٢) صفوف بثٍّ **حقيقية** لا حمولةٌ مصنوعة باليد
    update public.partner_alert_prefs set accepting_offers = true, telegram_enabled = true;
    update public.subcontractors set telegram_chat_id = '10' || right(id::text, 6)
      where id in (v_t, v_i, v_d);

    select public.dispatch_broadcast(v_bid, 1) into v_n;
    if coalesce(v_n, 0) < 1 then
      raise exception '(ك-٢) البثّ لم يُنتج عرضاً واحداً — كل ما بعده كان سيمرّ على فراغ';
    end if;

    select count(*)::integer into v_n from public.notifications n
     where n.recipient_kind = 'partner'
       and position(v_ref in n.payload::text) > 0;
    if v_n > 0 then
      raise exception '(ك-٢) % صفَّ إشعارٍ موجَّهٍ إلى متعهد يحمل مرجع العميل في حمولته', v_n;
    end if;
    select count(*)::integer into v_n from public.notifications n
     where n.recipient_kind = 'partner'
       and position(v_code in n.payload::text) > 0;
    if v_n = 0 then
      raise exception '(ك-٢) لا صفَّ متعهدٍ يحمل رمز الرحلة — الفحص أعلاه مرّ على صفوفٍ فارغة';
    end if;
    raise notice '✔ (ك-٢) % صفَّ بثٍّ حقيقي: صفرٌ يحمل المرجع، وكلها تحمل الرمز', v_n;

    -- (ك-٣) الصندوق بعين صاحبه — الصفُّ كلّه لا العمود وحده
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_usr, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';

    select count(*)::integer into v_n from public.portal_inbox(200) i
     where position(v_ref in i::text) > 0;
    if v_n > 0 then
      raise exception '(ك-٣) صندوق البورتال يعرض مرجع العميل في % صفاً', v_n;
    end if;
    if not exists (select 1 from public.portal_inbox(200) i where i.reference = v_code) then
      raise exception '(ك-٣) لا صفَّ في الصندوق يحمل رمز الرحلة — الفحص مرّ على صندوقٍ فارغ';
    end if;

    execute 'reset role';
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

    -- (ك-٤) 🔬 الطفرة: صفُّ متعهدٍ بحمولةٍ **تشغيلية** — وهي حالةُ ما قبل 0056
    --       بحرفها. تُثبت شيئين: أن مسح الحمولات حيٌّ يمسك، وأن الصندوق آمنٌ
    --       ولو سُمِّمت الحمولة (لأنه **يشتقّ** الرمز ولا يقرأ مفتاحاً).
    v_nid := public.queue_notification(
      'trip_offered', public.dispatch_trip_payload(v_bid, false), 'partner', v_t);

    select count(*)::integer into v_n from public.notifications n
     where n.recipient_kind = 'partner'
       and position(v_ref in n.payload::text) > 0;
    if v_n = 0 then
      raise exception '(ك-٤) الطفرة **غير ممسوكة**: صفٌّ يحمل المرجع صراحةً ومسحُ الحمولات لم يره — فحصٌ ميّت';
    end if;

    perform set_config('request.jwt.claims',
      json_build_object('sub', v_usr, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select count(*)::integer into v_n from public.portal_inbox(200) i
     where position(v_ref in i::text) > 0;
    if v_n > 0 then
      raise exception '(ك-٤) حمولةٌ مسمَّمة عبرت إلى الصندوق — الاشتقاق الحيّ صار قراءةَ مفتاح';
    end if;
    execute 'reset role';
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

    delete from public.notifications where id = v_nid;
    raise notice '✔ (ك-٤) طفرةُ «حمولةٌ تشغيلية لصفِّ متعهد» **مُمسَكة** — والصندوق صمد أمامها';

    -- (ك-٥) ردّ `accept_offer` — قيمةٌ تصل متصفح المتعهد قيمةٌ سُرِّبت
    select o.id into v_off from public.trip_offers o
     where o.booking_id = v_bid and o.subcontractor_id = v_t and o.status = 'pending';
    if v_off is null then
      raise exception '(ك-٥) لا عرض معلّق للمتعهد «ت» — التأكيد كان سيُتخطّى بصمت';
    end if;

    perform set_config('request.jwt.claims',
      json_build_object('sub', v_usr, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select * into v_acc from public.accept_offer(v_off);
    execute 'reset role';
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

    if v_acc.reference = v_ref then
      raise exception '(ك-٥) accept_offer تُرجع مرجع العميل «%» إلى المتعهد الذي قَبِل', v_ref;
    end if;
    if v_acc.reference is distinct from v_code then
      raise exception '(ك-٥) ردّ القبول «%» ليس رمز الرحلة «%»',
        coalesce(v_acc.reference, 'بلا'), v_code;
    end if;
    raise notice '✔ (ك) صفر تسريبٍ لمرجع العميل: المنبع · صفوف البث · الصندوق · وردّ القبول — والتشغيل يحتفظ بمرجعه';

    -- ========================================================================
    -- (م) 🔴 وجهةُ الإشعار بحسب جمهوره — بلاغ المالك 2026-08-17
    --
    -- العيب: كان الرابط يُبنى من توكن العميل **لكل الجماهير**، فينقر المالك
    -- إشعاراً في جرس لوحته فيهبط على `/booking/<token>` بدل `/admin/orders/<id>`.
    -- وأخطرُ شقّيه أن المسار نفسه يخدم المتعهد: أيُّ حدثٍ غير بثّي يُوجَّه إليه
    -- كان سيسلّمه صفحةَ العميل — وفيها **إجماليه** (فهامشُنا بطرح مستحقه)
    -- و**مرجعه** (الذي أزالته 0056 من يده) واسمه وإحداثيات التقاطه بلا تقنيع.
    -- (‏`0049` قنّعت الهاتف والواتساب وحدهما — ولم تجعل الصفحة غير ضارّة.)
    --
    -- ── وماذا تحرس القاعدة من إصلاحٍ يعيش في TypeScript؟ ────────────────────
    --
    -- **مادّة الرابط لا نصّه.** `audienceLink` تبني وجهة العميل من مفاتيح
    -- التوكن الثلاثة التي تقرؤها `bookingToken()`، ووجهةَ اللوحة من `bookingId`.
    -- فما لا يوجد في الحمولة **لا تستطيع أيُّ طبقةٍ أن تبني به وجهة** — قائمةً
    -- كانت أو تُضاف غداً. وهي طبقةُ الحراسة نفسها التي اختارتها 0056: عند
    -- المنبع لا عند كل مصبّ. والطبقتان معاً لأن إحداهما وحدها تُنسى.
    -- ========================================================================

    -- (م-١) 🔴 لا صفَّ متعهدٍ يحمل مادّةَ رابط العميل — لا واحداً
    select count(*)::integer into v_n from public.notifications n
     where n.recipient_kind = 'partner'
       and (n.payload ? 'publicToken' or n.payload ? 'token' or n.payload ? 'bookingToken');
    if v_n > 0 then
      raise exception '(م-١) % صفَّ إشعارٍ موجَّهٍ إلى متعهد يحمل توكن متابعة العميل — وبه تُبنى صفحةُ العميل: إجماليه ومرجعه واسمه وإحداثياته (D-19 · D-46)', v_n;
    end if;

    -- (م-٢) وصفوفُ البثّ الحقيقية تحمل `bookingId` — وهو **مسار التصعيد** لا
    --       زينة: متعهدٌ تعذّر بلوغه يُعاد رسمُ صفّه بجمهور `ops`، فبلا هذا
    --       المفتاح يصل المالكَ تنبيهٌ **بلا وجهةٍ إلى الطلب** في اللوحة.
    select count(*)::integer into v_n from public.notifications n
     where n.recipient_kind = 'partner'
       and n.payload ? 'tripCode'
       and not (n.payload ? 'bookingId');
    if v_n > 0 then
      raise exception '(م-٢) % صفَّ بثٍّ بلا bookingId — وصفٌّ يُصعَّد إلى التشغيل يخرج بلا وجهةٍ في اللوحة', v_n;
    end if;

    -- (م-٣) 🔴 والاتجاه الآخر — وهو العيب المُبلَّغ حرفياً: صفٌّ تشغيليٌّ يحمل
    --       توكن العميل **يجب أن يحمل معه معرّف الحجز**، وإلا لم يبقَ أمام
    --       اللوحة إلا وجهةُ العميل. وقبل الإصلاح كان الاثنان موجودَين وكان
    --       الكود يفضّل **التوكن** — فالحارس هنا يضمن المادّة، والكود يختار.
    select count(*)::integer into v_n from public.notifications n
     where coalesce(n.recipient_kind, 'ops') = 'ops'
       and (n.payload ? 'publicToken' or n.payload ? 'token' or n.payload ? 'bookingToken')
       and not (n.payload ? 'bookingId');
    if v_n > 0 then
      raise exception '(م-٣) % صفاً تشغيلياً يحمل توكن العميل بلا bookingId — فلا وجهةَ له في اللوحة أصلاً', v_n;
    end if;

    -- (م-٤) والوجهةُ المبنيّة **تدخل `/admin` وتصل طلباً حيّاً** — لا مفتاحاً
    --       موجوداً وحسب. مقصورةٌ على صفوف هذه الفيكسترة عمداً: صحّةُ صفوف
    --       الإنتاج القديمة ليست ما يقيسه هذا التأكيد.
    select count(*)::integer into v_n from public.notifications n
     where coalesce(n.recipient_kind, 'ops') = 'ops'
       and n.payload ->> 'bookingId' = v_bid::text
       and (
         left('/admin/orders/' || (n.payload ->> 'bookingId'), 14) <> '/admin/orders/'
         or not exists (select 1 from public.bookings b where b.id = v_bid)
       );
    if v_n > 0 then
      raise exception '(م-٤) % صفاً تشغيلياً وجهتُه لا تدخل /admin أو لا تصل طلباً قائماً', v_n;
    end if;
    -- 🔬 ولا يمرّ التأكيد على فراغ: لا بدّ من صفٍّ تشغيليّ واحد على هذا الحجز
    select count(*)::integer into v_n from public.notifications n
     where coalesce(n.recipient_kind, 'ops') = 'ops'
       and n.payload ->> 'bookingId' = v_bid::text;
    if v_n = 0 then
      raise exception '(م-٤) لا صفَّ تشغيليٍّ على حجز الفيكسترة — التأكيد أعلاه مرّ على صفر صفوف';
    end if;

    -- (م-٥) 🔬 الطفرة: صفُّ متعهدٍ بحمولةٍ تحمل توكن العميل — وهي بعينها الحالة
    --       التي كان الكود القديم يبني منها الرابط. تُثبت أن (م-١) **حيّ يمسك**
    --       لا تأكيداً يمرّ لأن الحقل غائبٌ من نفسه.
    v_nid := public.queue_notification(
      'trip_offered',
      public.dispatch_trip_payload(v_bid, true)
        || jsonb_build_object('publicToken', 'PA_TESTS_MUTATION_TOKEN'),
      'partner', v_t);

    select count(*)::integer into v_n from public.notifications n
     where n.recipient_kind = 'partner'
       and (n.payload ? 'publicToken' or n.payload ? 'token' or n.payload ? 'bookingToken');
    if v_n = 0 then
      raise exception '(م-٥) الطفرة **غير ممسوكة**: صفٌّ يحمل التوكن صراحةً و(م-١) لم يره — تأكيدٌ ميّت';
    end if;

    delete from public.notifications where id = v_nid;
    raise notice '✔ (م) وجهةُ الجمهور: صفر صفِّ متعهدٍ يحمل مادّةَ رابط العميل · وكل صفٍّ تشغيليٍّ ذي توكنٍ يحمل bookingId فوجهتُه /admin/orders/<id> تصل طلباً حيّاً · وطفرةُ التوكن مُمسَكة';

    drop function if exists public.pa_pool_mut1(uuid, integer);
    drop function if exists public.pa_pool_mut2(uuid, integer);
    drop function if exists public.pa_pool_legacy(uuid, integer);

    raise exception 'PARTNER_ALERT_TESTS_ROLLBACK';
  exception
    when others then
      execute 'reset role';
      perform set_config('request.jwt.claims', '', true);
      if sqlerrm <> 'PARTNER_ALERT_TESTS_ROLLBACK' then raise; end if;
  end;

  raise notice '✔ القياس الحيّ تمّ داخل معاملةٍ فرعية أُرجعت بكاملها';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ط) 🔴 المنح — `truncate`/`trigger`/`references` على كل جدول جديد
--
-- ولماذا هذه الثلاثة بالذات؟ لأنها **لا تخضع لـRLS إطلاقاً**، فجدولٌ سياساته
-- محكمة تماماً يبقى قابلاً للتفريغ من زائرٍ مجهول — وهي الثغرة الحيّة التي
-- أُغلقت في `0041` (‏١٠ و١٧ و٩٣ و٤٠ صفاً ⇐ صفر). والإغفال نفسه شُحن في هذا
-- المشروع **مرّتين**، فالفحص هنا لا يقرأ سياسةً ولا يطابق نصّاً: ينادي
-- `has_table_privilege` بالدور نفسه.
-- ----------------------------------------------------------------------------
do $$
declare
  v_bad text;
begin
  select string_agg(format('%s/%s/%s', t.rel, r.role, p.priv), '، ') into v_bad
  from (values ('public.partner_alert_prefs'), ('public.partner_push_subscriptions'),
               ('public.notification_providers')) as t(rel)
  cross join (values ('anon'), ('authenticated')) as r(role)
  cross join (values ('TRUNCATE'), ('TRIGGER'), ('REFERENCES')) as p(priv)
  where exists (select 1 from pg_roles where rolname = r.role)
    and has_table_privilege(r.role, t.rel, p.priv);
  if v_bad is not null then
    raise exception '(ط) صلاحياتٌ لا تحرسها RLS ما زالت ممنوحة: %', v_bad;
  end if;

  -- ولا كتابةَ عريضة أيضاً: `anon` بلا شيء، و`notification_providers` بلا
  -- شيءٍ لأي دور مستخدم (تُقرأ بدوال definer وتُكتب بـservice_role)
  select string_agg(format('%s/%s/%s', t.rel, r.role, p.priv), '، ') into v_bad
  from (values ('public.partner_alert_prefs'), ('public.partner_push_subscriptions'),
               ('public.notification_providers')) as t(rel)
  cross join (values ('anon')) as r(role)
  cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) as p(priv)
  where exists (select 1 from pg_roles where rolname = r.role)
    and has_table_privilege(r.role, t.rel, p.priv);
  if v_bad is not null then
    raise exception '(ط) الزائر المجهول يملك: %', v_bad;
  end if;

  select string_agg(format('notification_providers/authenticated/%s', p.priv), '، ') into v_bad
  from (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) as p(priv)
  where exists (select 1 from pg_roles where rolname = 'authenticated')
    and has_table_privilege('authenticated', 'public.notification_providers', p.priv);
  if v_bad is not null then
    raise exception '(ط) notification_providers ممنوح لـauthenticated: %', v_bad;
  end if;

  -- والدوال المحسوبة داخلياً: لا تنفيذ لأي دور مستخدم
  select string_agg(format('%s/%s', f.sig, r.role), '، ') into v_bad
  from (values ('public.partner_channels(uuid)'), ('public.partner_availability(uuid)'),
               ('public.partner_available(uuid)'), ('public.provider_ready(text)'),
               ('public.notification_channels_for(text, uuid)'),
               ('public.notification_channels()'),
               ('public.queue_notification(text, jsonb)'),
               ('public.queue_notification(text, jsonb, text, uuid)'),
               ('public.dispatch_pool(uuid, integer)')) as f(sig)
  cross join (values ('anon'), ('authenticated')) as r(role)
  where exists (select 1 from pg_roles where rolname = r.role)
    and has_function_privilege(r.role, f.sig, 'EXECUTE');
  if v_bad is not null then
    raise exception '(ط) دوالٌ داخلية ممنوحة التنفيذ: %', v_bad;
  end if;

  -- ودوال البورتال **ممنوحة فعلاً** — الفحص في الاتجاهين، وإلا كان يمرّ على
  -- منتجٍ لا يعمل (اطمئنانٌ كاذب عن ميزةٍ غير موصولة)
  select string_agg(f.sig, '، ') into v_bad
  from (values ('public.portal_inbox(integer)'), ('public.portal_alert_prefs()'),
               ('public.portal_inbox_mark_read(uuid)'),
               ('public.portal_set_telegram_chat_id(text)'),
               ('public.admin_partner_availability()')) as f(sig)
  where exists (select 1 from pg_roles where rolname = 'authenticated')
    and not has_function_privilege('authenticated', f.sig, 'EXECUTE');
  if v_bad is not null then
    raise exception '(ط) دوالُ البورتال غير ممنوحة فلا تعمل من الواجهة: %', v_bad;
  end if;

  raise notice '✔ (ط) المنح: صفر truncate/trigger/references لدورَي المتصفح على الجداول الثلاثة · والداخلية مسحوبة · وسطحُ البورتال موصول';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ل) 🔴 محادثةُ تليجرام واحدة = **مستقبِلٌ واحد** (0057)
--
-- ما الذي أوجد هذا القسم؟ حالةٌ **مقيسة** على قاعدة بدر (2026-08-15): متعهدٌ
-- واحد له `telegram_chat_id`، وقيمتُه **هي نفسها** وجهة إشعارات فريق التشغيل
-- في `site_settings.notifications.telegramChatId` — والعمود كان بلا فهرسٍ فريد
-- ولا مُشغِّل، مقروءاً من `pg_indexes` و`pg_constraint` لا من ملف هجرة (D-58).
--
-- ولماذا هو أخطر من تقاسم متعهدَين لمحادثة؟ لأن رسالة المتعهد **مُنقّاةٌ
-- بالبناء** (لا عميل ولا سعرَ عميل ولا مرجع)، ورسالة **التشغيل** تحمل ذلك كله:
-- `trip_assigned` فيها «سعر العميل» و«الهامش المحقق». فاجتماعُهما في محادثةٍ
-- واحدة يسلّم المتعهدَ هامشَنا — نقضُ **D-19** و**D-20** معاً.
--
-- وكل تأكيدٍ هنا **ينفّذ كتابةً فعلاً** ويقرأ `hint` — لا يقرأ نصّ رسالة ولا
-- يطابق نمطاً (النمط ١٩). والطفرة في آخره تثبت أن الفحص حيٌّ لا يزيّن التقرير.
-- ----------------------------------------------------------------------------
do $$
declare
  v_a    constant uuid := 'a5700000-0000-4000-8000-00000000001a';
  v_b    constant uuid := 'a5700000-0000-4000-8000-00000000002b';
  -- معرّفات لا يمكن أن تكون حقيقية (سالبة وطويلة)، ولا تبدأ بـ'10' فلا تلتبس
  -- بفحص التنظيف في (ي)
  v_chat constant text := '-9007199254740991';
  v_ops  constant text := '-9007199254740992';
  v_ok   boolean;
  v_hint text;
begin
  begin
    insert into public.subcontractors (id, company_name, phone, status)
    values (v_a, 'TG_BIND أ', '01000005711', 'approved'),
           (v_b, 'TG_BIND ب', '01000005712', 'approved');

    -- (ل-١) الارتباط الأول يمرّ — وإلا كان ما بعده يقيس عطلاً لا حارساً
    update public.subcontractors set telegram_chat_id = v_chat where id = v_a;
    if not exists (select 1 from public.subcontractors
                   where id = v_a and telegram_chat_id = v_chat) then
      raise exception '(ل-١) الارتباط الأول لم يُكتب — كل ما بعده يقيس عطلاً';
    end if;

    -- (ل-٢) والثاني **يُرفض** — لا يُنقل. ونقلُه كان سيُسكت عروضَ الأول بلا أثر
    v_ok := false; v_hint := null;
    begin
      update public.subcontractors set telegram_chat_id = v_chat where id = v_b;
      v_ok := true;
    exception when others then
      get stacked diagnostics v_hint = pg_exception_hint;
    end;
    if v_ok then
      raise exception '(ل-٢) محادثةٌ واحدة قُبلت لمتعهدَين — كلٌّ يقرأ مستحق الآخر (D-20)';
    end if;
    if v_hint is distinct from 'telegram-taken' then
      raise exception '(ل-٢) الرفض خرج بـ[%] لا بـtelegram-taken — الواجهة كانت ستعرض نصّ Postgres خاماً على شريك',
        coalesce(v_hint, '∅');
    end if;
    -- ولم يُنقل شيء: الأول ما زال صاحب المحادثة
    if not exists (select 1 from public.subcontractors
                   where id = v_a and telegram_chat_id = v_chat) then
      raise exception '(ل-٢) الارتباط سُرق من الأول — وهو ما رُفض صراحةً في 0057';
    end if;

    /*
     * (ل-٣) 🔴 الشقّ الأخطر: محادثةٌ = وجهةُ فريق التشغيل.
     *
     * ⚠ ولا يُقاس على الوجهة الحقيقية: هي في قاعدة بدر اليوم **مرتبطةٌ أصلاً
     * بمتعهد**، فيسبق فرعُ `telegram-taken` الفرعَ المقصود ويمرّ الفحص على
     * السبب الخطأ. فحصٌ ناتجُه يتغيّر بتغيّر بيانات المالك ليس فحصاً — فتُضبط
     * الوجهة هنا على قيمةٍ صناعية لا يملكها أحد، داخل المعاملة الفرعية نفسها.
     */
    update public.site_settings
       set value = jsonb_set(value, '{telegramChatId}', to_jsonb(v_ops))
     where key = 'notifications';

    v_ok := false; v_hint := null;
    begin
      update public.subcontractors set telegram_chat_id = v_ops where id = v_b;
      v_ok := true;
    exception when others then
      get stacked diagnostics v_hint = pg_exception_hint;
    end;
    if v_ok then
      raise exception '(ل-٣) وجهةُ التشغيل قُبلت لمتعهد — تصله رسائل فيها اسم العميل وسعره وهامشنا (D-19)';
    end if;
    if v_hint is distinct from 'telegram-is-ops' then
      raise exception '(ل-٣) خرج بـ[%] لا بـtelegram-is-ops', coalesce(v_hint, '∅');
    end if;

    -- (ل-٤) والاتجاه المعاكس — نصفُ الباب الذي يُنسى: المالك يضبط وجهة التشغيل
    -- على محادثةِ متعهدٍ مربوط، فيصله **كلُّ** إشعارٍ تشغيلي في المنصة
    v_ok := false; v_hint := null;
    begin
      update public.site_settings
         set value = jsonb_set(value, '{telegramChatId}', to_jsonb(v_chat))
       where key = 'notifications';
      v_ok := true;
    exception when others then
      get stacked diagnostics v_hint = pg_exception_hint;
    end;
    if v_ok then
      raise exception '(ل-٤) وجهةُ التشغيل قُبلت على محادثةِ متعهد — كلُّ عميلٍ في القاعدة كان سيُكشف لا حجزٌ واحد';
    end if;
    if v_hint is distinct from 'ops-telegram-taken' then
      raise exception '(ل-٤) خرج بـ[%] لا بـops-telegram-taken', coalesce(v_hint, '∅');
    end if;

    -- (ل-٥) والفصل يبقى ممكناً دائماً — وإلا حُبس الشريك في ارتباطٍ خاطئ،
    -- وسقط مخرجُ المالك من الشاشتين معاً
    update public.subcontractors set telegram_chat_id = null where id = v_a;
    update public.subcontractors set telegram_chat_id = ''   where id = v_b;
    update public.subcontractors set telegram_chat_id = v_chat where id = v_a;

    /*
     * (ل-٦) 🔒 **أمانُ الصفِّ القائم** — وهو ما يجعل الهجرة قابلة للتطبيق على
     * قاعدة بدر بلا لمس صفّ: تعديلٌ لا يمسّ الوجهة يمرّ على صفٍّ **مرتبطٍ
     * ومتصادم**. ولولاه لصار كلُّ تعديلٍ إداري على ذلك المتعهد (اسم · هاتف ·
     * حالة) يفشل بسبب عمودٍ لم يُلمس — أي لعجز المالك حتى عن إيقافه.
     */
    -- الصفُّ الموروث يُصنع بتعطيل المُشغِّل لحظةً — وهي الطريقة الوحيدة الصادقة
    -- لمحاكاة حالةٍ كُتبت **قبل** وجود الحارس. والـDDL معاملاتيٌّ فيرجع معنا.
    alter table public.subcontractors disable trigger subcontractors_telegram_guard;
    update public.subcontractors set telegram_chat_id = v_ops where id = v_a;
    alter table public.subcontractors enable trigger subcontractors_telegram_guard;

    -- والآن: صفٌّ قيمتُه **مرفوضةٌ اليوم**، ومع ذلك يقبل كل تعديلٍ لا يمسّها
    update public.subcontractors set status = 'suspended', company_name = 'TG_BIND أ٢'
     where id = v_a;
    -- وحتى ذكرُ العمود نفسه بقيمته الحالية يمرّ — وPostgREST يرسل الصفَّ كاملاً
    -- من كل شاشةٍ إدارية، فلولا هذا لعجز المالك عن إيقاف ذلك المتعهد أصلاً
    update public.subcontractors set telegram_chat_id = telegram_chat_id where id = v_a;
    if not exists (select 1 from public.subcontractors
                   where id = v_a and status = 'suspended') then
      raise exception '(ل-٦) تعديلٌ لا يمسّ الوجهة رُفض على صفٍّ موروث — المالك لا يستطيع إيقاف متعهده';
    end if;

    -- ويبقى تغييرُها فعلاً مرفوضاً: الإرث لا يفتح الباب، يترك ما مضى وحده
    update public.subcontractors set telegram_chat_id = null where id = v_a;

    /*
     * (ل-٧) 🔬 الطفرة — «ماذا يثبت (ل-٣) فعلاً؟»
     *
     * تُبنى نسخةٌ مشوّهة من `telegram_chat_conflict` لا ترى شيئاً أبداً، ويُثبَت
     * أن الكتابة التي رفضها (ل-٣) **تنجح** حينئذ. لو مرّت الطفرة بلا فرق لكان
     * (ل-٣) تأكيداً ميّتاً يزيّن التقرير. والـDDL معاملاتيٌّ في Postgres،
     * فالإرجاع يعيد الدالة الأصلية بلا خطوة تنظيف.
     */
    create or replace function public.telegram_chat_conflict(p_chat_id text, p_subcontractor uuid)
    returns text language sql immutable as $mut$ select null::text $mut$;

    update public.site_settings
       set value = jsonb_set(value, '{telegramChatId}', to_jsonb(v_ops))
     where key = 'notifications';

    v_ok := false;
    begin
      update public.subcontractors set telegram_chat_id = v_ops where id = v_b;
      v_ok := true;
    exception when others then
      null;
    end;
    if not v_ok then
      raise exception '(ل-٧) الطفرة لم تُسقط الفحص — أي أن (ل-٣) لا يقيس `telegram_chat_conflict` بل شيئاً آخر';
    end if;

    raise exception 'TG_BIND_TESTS_ROLLBACK';
  exception
    when others then
      if sqlerrm <> 'TG_BIND_TESTS_ROLLBACK' then raise; end if;
  end;

  raise notice '✔ (ل) محادثةٌ واحدة = مستقبِلٌ واحد: الثاني يُرفض بـtelegram-taken ولا يُسرق الارتباط · ووجهةُ التشغيل تُرفض بـtelegram-is-ops · والاتجاه المعاكس بـops-telegram-taken · والفصل والتعديل غير الماسّ يمرّان · وطفرةٌ بُنيت فأسقطت الفحص — فهو حيّ';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ن) 🔴 والحارس يُقاس على **الشكل الذي يُصدره العميل** — لا على شكلٍ نكتبه (0097)
--
-- ── العيب الذي أوجد هذا القسم، مقيساً لا مستنتجاً (2026-08-17) ───────────────
--
-- شكوى المالك: «انهيار النظام بعد ربط التليجرام الخاص بالمتعهد». ولم يكن حارسُ
-- `0057` ميّتاً — كان **يعمل في اللحظة الخطأ**.
--
-- مخرجُ الأمان في مُشغِّلَي `0057` مكتوبٌ `tg_op = 'UPDATE' and new… is not
-- distinct from old…`. وهو صحيحٌ حرفياً ومعطَّلٌ عملياً، لأن الواجهة لا ترسل
-- `UPDATE`: ‏`supabase-js` ‏`.upsert(rows, { onConflict })` يصير في PostgREST
-- `insert … on conflict (key) do update`، وPostgres يُطلق **`BEFORE INSERT`**
-- قبل أن يكتشف التصادم — فيدخل الحارس بـ`tg_op = 'INSERT'` وبلا `old`، ويفحص
-- عموداً **لم تتغيّر قيمته** فيرفع رفضاً على حفظٍ لم يمسّ شيئاً.
--
-- والأثر: متعهدٌ مربوطٌ على محادثة التشغيل نفسها (حالةُ بدر المقيسة في `0057`)
-- يجعل `/admin/settings` **غير قابلةٍ للحفظ إطلاقاً** — `saveSettings` يرفع
-- `brand` (وفيه أربعةٌ وثلاثون لوناً) و`contact` و`socials` و`company` و
-- `notifications` في **دفعةٍ واحدة**، فرفضُ صفٍّ يُسقط الخمسة.
--
-- ⚠ **ولماذا نجا من القسم (ل) أعلاه؟** لأن كل تأكيدٍ فيه يكتب `update` بيده —
-- (ل-٤) و(ل-٦) كلاهما `update`. فالفحص كان يقيس شكلَ SQL الذي **نكتبه نحن**، لا
-- الشكلَ الذي **يُصدره العميل** في كل ضغطة حفظ. ولذلك كلُّ نداءٍ هنا يستعمل
-- `insert … on conflict do update` بحرفه.
-- ----------------------------------------------------------------------------
do $$
declare
  v_a        constant uuid := 'a5700000-0000-4000-8000-00000000006a';
  v_b        constant uuid := 'a5700000-0000-4000-8000-00000000006b';
  v_chat     constant text := '-9007199254740961';
  v_other    constant text := '-9007199254740962';
  v_settings jsonb;
  v_ok       boolean;
  v_hint     text;
begin
  begin
    insert into public.subcontractors (id, company_name, phone, status)
    values (v_a, 'TG_UPSERT أ', '01000005761', 'approved'),
           (v_b, 'TG_UPSERT ب', '01000005762', 'approved');

    -- ══ يُبنى التصادمُ الموروث: متعهدٌ على محادثة التشغيل نفسها ═══════════════
    -- وتعطيلُ المُشغِّل لحظةً هو الطريقة الوحيدة الصادقة لمحاكاة صفٍّ كُتب **قبل**
    -- وجود الحارس (نفس أسلوب (ل-٦))؛ والـDDL معاملاتيٌّ فيرجع معنا.
    update public.site_settings
       set value = jsonb_set(value, '{telegramChatId}', to_jsonb(v_chat))
     where key = 'notifications';

    alter table public.subcontractors disable trigger subcontractors_telegram_guard;
    update public.subcontractors set telegram_chat_id = v_chat where id = v_a;
    alter table public.subcontractors enable trigger subcontractors_telegram_guard;

    select ss.value into v_settings from public.site_settings ss where ss.key = 'notifications';

    -- (ن-١) 🔴 العَرَض بحرفه: المالك يضغط «حفظ الإعدادات» بلا أن يلمس حقل تليجرام
    v_ok := false; v_hint := null;
    begin
      insert into public.site_settings (key, value) values ('notifications', v_settings)
      on conflict (key) do update set key = excluded.key, value = excluded.value;
      v_ok := true;
    exception when others then
      get stacked diagnostics v_hint = pg_exception_hint;
    end;
    if not v_ok then
      raise exception '(ن-١) upsert لوجهةٍ **لم تتغيّر** رُفض بـ[%] — شاشة الإعدادات كلها تموت: العلامة والألوان والتواصل والشركة في الدفعة نفسها',
        coalesce(v_hint, '∅');
    end if;

    -- (ن-٢) ونفس المخرج على `subcontractors`: صفٌّ متصادمٌ موروث يُرفع كاملاً
    --       بـupsert فيمرّ — ولولاه لعجز المالك عن إيقاف ذلك المتعهد
    v_ok := false; v_hint := null;
    begin
      insert into public.subcontractors (id, company_name, phone, status, telegram_chat_id)
      values (v_a, 'TG_UPSERT أ٢', '01000005761', 'suspended', v_chat)
      on conflict (id) do update
        set company_name     = excluded.company_name,
            status           = excluded.status,
            telegram_chat_id = excluded.telegram_chat_id;
      v_ok := true;
    exception when others then
      get stacked diagnostics v_hint = pg_exception_hint;
    end;
    if not v_ok then
      raise exception '(ن-٢) upsert لصفِّ متعهدٍ بمحادثته نفسها رُفض بـ[%]', coalesce(v_hint, '∅');
    end if;
    if not exists (select 1 from public.subcontractors where id = v_a and status = 'suspended') then
      raise exception '(ن-٢) مرّ ولم يكتب — التأكيد يقيس نجاحاً وهمياً';
    end if;

    -- ══ وما يبقى مرفوضاً بحرفه — وإلا كان (ن-١) و(ن-٢) قد أُرضيا بإضعاف الحارس ══

    -- (ن-٣) محادثةُ الأول لا تُنقل إلى الثاني، ولو جاءت بـupsert
    v_ok := false; v_hint := null;
    begin
      insert into public.subcontractors (id, company_name, phone, status, telegram_chat_id)
      values (v_b, 'TG_UPSERT ب', '01000005762', 'approved', v_chat)
      on conflict (id) do update set telegram_chat_id = excluded.telegram_chat_id;
      v_ok := true;
    exception when others then
      get stacked diagnostics v_hint = pg_exception_hint;
    end;
    if v_ok then
      raise exception '(ن-٣) محادثةٌ واحدة قُبلت لمتعهدَين عبر upsert — كلٌّ يقرأ مستحق الآخر (D-20)';
    end if;
    if v_hint is distinct from 'telegram-taken' then
      raise exception '(ن-٣) خرج بـ[%] لا بـtelegram-taken', coalesce(v_hint, '∅');
    end if;

    -- (ن-٤) وإدراجٌ **جديد** فعلاً بمحادثةٍ مأخوذة يُرفض — فقراءةُ المخزَّن لم
    --       تصنع باباً لمن لا صفَّ له
    v_ok := false; v_hint := null;
    begin
      insert into public.subcontractors (id, company_name, phone, status, telegram_chat_id)
      values ('a5700000-0000-4000-8000-00000000006c', 'TG_UPSERT ج', '01000005763', 'approved', v_chat);
      v_ok := true;
    exception when others then
      get stacked diagnostics v_hint = pg_exception_hint;
    end;
    if v_ok then
      raise exception '(ن-٤) صفٌّ جديد قُبل بمحادثةٍ مأخوذة — الفرع INSERT صار بلا حارس';
    end if;
    if v_hint is distinct from 'telegram-taken' then
      raise exception '(ن-٤) خرج بـ[%] لا بـtelegram-taken', coalesce(v_hint, '∅');
    end if;

    -- (ن-٥) والاتجاه المعاكس عبر upsert: وجهةُ التشغيل على محادثةِ متعهدٍ مربوط
    update public.subcontractors set telegram_chat_id = v_other where id = v_b;

    v_ok := false; v_hint := null;
    begin
      insert into public.site_settings (key, value)
      values ('notifications', jsonb_set(v_settings, '{telegramChatId}', to_jsonb(v_other)))
      on conflict (key) do update set value = excluded.value;
      v_ok := true;
    exception when others then
      get stacked diagnostics v_hint = pg_exception_hint;
    end;
    if v_ok then
      raise exception '(ن-٥) وجهةُ التشغيل قُبلت على محادثةِ متعهدٍ مربوط عبر upsert — كلُّ عميلٍ في القاعدة كان سيُكشف';
    end if;
    if v_hint is distinct from 'ops-telegram-taken' then
      raise exception '(ن-٥) خرج بـ[%] لا بـops-telegram-taken', coalesce(v_hint, '∅');
    end if;

    /*
     * (ن-٦) 🔬 الطفرة — «ماذا يثبت (ن-١) فعلاً؟»
     *
     * يُعاد جسمُ مُشغِّل `0057` **بحرفه قبل 0097** (مخرجُ الأمان على `tg_op =
     * 'UPDATE'` وحده)، ويُثبَت أن الكتابة التي مرّت في (ن-١) **تُرفض** حينئذ.
     * فلو مرّت الطفرة بلا فرق لكان (ن-١) تأكيداً ميّتاً يزيّن التقرير.
     * والـDDL معاملاتيٌّ، فالإرجاع يعيد الدالة المُصلَحة بلا خطوة تنظيف.
     */
    create or replace function public.site_settings_ops_telegram_guard()
    returns trigger language plpgsql security definer set search_path = ''
    as $mut$
    declare v_new text; v_old text; v_who text;
    begin
      if new.key <> 'notifications' then return new; end if;
      v_new := nullif(btrim(coalesce(new.value ->> 'telegramChatId', '')), '');
      v_old := case when tg_op = 'UPDATE'
                    then nullif(btrim(coalesce(old.value ->> 'telegramChatId', '')), '') end;
      if v_new is null or v_new is not distinct from v_old then return new; end if;
      select s.company_name into v_who from public.subcontractors s
       where btrim(coalesce(s.telegram_chat_id, '')) = v_new limit 1;
      if v_who is not null then
        raise exception 'طفرة (ن-٦): جسم 0057 قبل الإصلاح' using hint = 'ops-telegram-taken';
      end if;
      return new;
    end;
    $mut$;

    -- التصادم يُعاد كما كان في (ن-١): الأول على وجهة التشغيل، والوجهة لم تتغيّر
    update public.site_settings
       set value = jsonb_set(value, '{telegramChatId}', to_jsonb(v_chat))
     where key = 'notifications';
    select ss.value into v_settings from public.site_settings ss where ss.key = 'notifications';
    alter table public.subcontractors disable trigger subcontractors_telegram_guard;
    update public.subcontractors set telegram_chat_id = v_chat where id = v_a;
    alter table public.subcontractors enable trigger subcontractors_telegram_guard;

    v_ok := false; v_hint := null;
    begin
      insert into public.site_settings (key, value) values ('notifications', v_settings)
      on conflict (key) do update set key = excluded.key, value = excluded.value;
      v_ok := true;
    exception when others then
      get stacked diagnostics v_hint = pg_exception_hint;
    end;
    if v_ok then
      raise exception '(ن-٦) الطفرة لم تُسقط (ن-١) — أي أن (ن-١) لا يقيس فرعَ INSERT في المُشغِّل بل شيئاً آخر';
    end if;
    if v_hint is distinct from 'ops-telegram-taken' then
      raise exception '(ن-٦) الطفرة سقطت بـ[%] لا بالرمز المتوقع — القياس ليس على ما نظنّ', coalesce(v_hint, '∅');
    end if;

    raise exception 'TG_UPSERT_TESTS_ROLLBACK';
  exception
    when others then
      if sqlerrm <> 'TG_UPSERT_TESTS_ROLLBACK' then raise; end if;
  end;

  raise notice '✔ (ن) الحارس مقيسٌ على `insert … on conflict` نفسه: وجهةٌ لم تتغيّر تمرّ (فتُحفظ الإعدادات) · وصفُّ متعهدٍ متصادم يُرفع كاملاً فيمرّ · والنقل والمأخوذة والإدراج الجديد والاتجاه المعاكس كلها تُرفض برموزها · وطفرةٌ أعادت جسم 0057 فسقط (ن-١) — فهو حيّ';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ي) 🔒 لم يبقَ أثر — وهذه **قاعدة الإنتاج نفسها**
-- ----------------------------------------------------------------------------
do $$
declare
  v_s integer; v_p integer; v_u integer; v_n integer; v_b integer; v_v integer;
  v_bs integer := current_setting('tours.pa_s')::integer;
  v_bp integer := current_setting('tours.pa_p')::integer;
  v_bu integer := current_setting('tours.pa_u')::integer;
  v_bn integer := current_setting('tours.pa_n')::integer;
  v_bb integer := current_setting('tours.pa_b')::integer;
  v_bv integer := current_setting('tours.pa_v')::integer;
  v_prov text;
begin
  select count(*)::integer into v_s from public.subcontractors;
  select count(*)::integer into v_p from public.partner_alert_prefs;
  select count(*)::integer into v_u from public.partner_push_subscriptions;
  select count(*)::integer into v_n from public.notifications;
  select count(*)::integer into v_b from public.bookings;
  select count(*)::integer into v_v from public.vehicle_classes;

  if v_s <> v_bs then raise exception 'تنظيف ناقص: المتعهدون % والأساس % — متعهدٌ اختباري يدخل حوض بثٍّ حقيقي', v_s, v_bs; end if;
  if v_p <> v_bp then raise exception 'تنظيف ناقص: التفضيلات % والأساس % — صفٌّ باقٍ يُسكِت متعهداً حقيقياً', v_p, v_bp; end if;
  if v_u <> v_bu then raise exception 'تنظيف ناقص: اشتراكات الدفع % والأساس %', v_u, v_bu; end if;
  if v_n <> v_bn then raise exception 'تنظيف ناقص: الإشعارات % والأساس % — صفٌّ باقٍ يُرسَل فعلاً في الدورة التالية', v_n, v_bn; end if;
  if v_b <> v_bb then raise exception 'تنظيف ناقص: الحجوزات % والأساس %', v_b, v_bb; end if;
  if v_v <> v_bv then raise exception 'تنظيف ناقص: فئات المركبات % والأساس %', v_v, v_bv; end if;

  -- 🔴 وحالةُ المزوّدين كما كانت: قلبُها في القياس يغيّر **من يصله العرض**
  select coalesce(string_agg(np.channel || '=' || np.ready::text, ',' order by np.channel), '')
    into v_prov from public.notification_providers np;
  if v_prov <> current_setting('tours.pa_prov') then
    raise exception 'تنظيف ناقص: جاهزية المزوّدين [%] والأساس [%] — قلبٌ باقٍ يغيّر حساب الإتاحة على الشبكة كلها',
      v_prov, current_setting('tours.pa_prov');
  end if;

  -- وبقايا الفيكسترة بأسمائها، لو تسرّبت من بابٍ آخر
  select count(*)::integer into v_s from public.vehicle_classes vc where vc.slug like 'patest-%';
  if v_s <> 0 then raise exception 'تنظيف ناقص: % فئة اختبارية باقية', v_s; end if;
  select count(*)::integer into v_s from public.subcontractors s where s.company_name like 'PA\_TESTS%';
  if v_s <> 0 then raise exception 'تنظيف ناقص: % متعهد اختباري باقٍ', v_s; end if;
  select count(*)::integer into v_s from public.bookings b
    where b.trip ->> 'notes' like 'PARTNER_ALERT_TESTS%';
  if v_s <> 0 then raise exception 'تنظيف ناقص: % حجز اختباري باقٍ', v_s; end if;

  -- ولا دوالَ طفراتٍ باقية في المخطط
  select count(*)::integer into v_s from pg_proc p
    join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname like 'pa\_pool\_%';
  if v_s <> 0 then raise exception 'تنظيف ناقص: % دالة طفرةٍ باقية في المخطط', v_s; end if;

  -- ولا معرّف تليجرام تسرّب إلى متعهدٍ حقيقي
  select count(*)::integer into v_s from public.subcontractors s
   where s.telegram_chat_id is not null and s.telegram_chat_id like '10%';
  if v_s <> 0 then raise exception 'تنظيف ناقص: % متعهداً حقيقياً عليه معرّف تليجرام اختباري', v_s; end if;

  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claims', '', false);

  raise notice 'ALL PASSED — التوجيه صار لكل مستقبِل لا لإعدادات المالك: الثنائي يبقى ops بقنوات المالك والرباعي يكتب قنوات المتعهد نفسه · و«بالغ» لا يشمل الصندوق ولا مزوّداً مطفأً · والإتاحة عاملان مستقلان · والحوض مطابقٌ حين الكل متاح ويتخطّى الموقِفَ وحده ويعود بالجميع حين لا متاح · وتعذّرُ البلوغ مقروءٌ من الصف فيبقى الاحتياطي حيّاً · والصندوق بلا مفتاحٍ يخصّ العميل · وأربعُ طفراتٍ بُنيت وشُغّلت فمُسكت كلها · و🔴 مرجعُ العميل لا يبلغ سطحاً يراه المتعهد (لا في الحمولة العامة ولا في صفوف البث ولا في الصندوق ولا في ردّ القبول) والتشغيل يحتفظ بمرجعه · وصفر truncate/trigger/references لدورَي المتصفح · و🔴 محادثةُ تليجرام واحدة = مستقبِلٌ واحد (الثاني يُرفض ولا يُسرق الارتباط · ووجهةُ التشغيل مرفوضة في الاتجاهين · والصفُّ الموروث يبقى قابلاً للتعديل) · و🔴 وجهةُ الإشعار بحسب جمهوره (صفر صفِّ متعهدٍ يحمل مادّةَ رابط العميل · وكل صفٍّ تشغيليٍّ ذي توكنٍ يحمل bookingId فوجهتُه /admin/orders/<id> تصل طلباً حيّاً · وطفرةُ التوكن مُمسَكة) — وصفر أثر';
end;
$$;
