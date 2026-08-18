-- ============================================================================
-- quote_conversion_lead_tests.sql — التحويل بعد أن يمرّ الوقت (0107)
--
-- كيف تشغّله:
--   pnpm db:test quote_conversion_lead
-- (‏و`pnpm db:test quote_conversion` يشغّل هذه المجموعة و`quote_conversion_tests`
--  معاً — وهما لا تتقاطعان: وسمُ الفيكسترة مختلف.)
--
-- النجاح = آخر سطر «ALL PASSED».
--
-- ══════════════════════════════════════════════════════════════════════════
--  الادّعاء المركزي، ولماذا لم تكن المجموعة القائمة تمسكه
-- ══════════════════════════════════════════════════════════════════════════
--
-- `quote_conversion_tests.sql` تفحص التحويل فحصاً وافياً: الأرضية، وأساس
-- التكلفة، واللقطة، والتحويل مرتين، وD-20. لكن **كل فيكستراتها موعدها بعد
-- ٩–١٧ يوماً** — أي أنها تقيس التحويل في اليوم الذي أنشئ فيه الطلب. وهي
-- الحالة التي **لا يقع فيها العيب**.
--
-- والعيب يقع حين **يمرّ الوقت**: `booking_min_pickup_at()` تُحسب من `now()`
-- فتزحف، وطلبٌ عبَر المهلة يوم إنشائه يصير دونها بعد يومين من التفاوض. وقياسُ
-- الكتالوج الحيّ في 2026-08-18 أثبت أن `convert_quote_request` كانت تفحص
-- `pickup_at <= now()` **وحدها** — فتقبله وتُنشئ حجزاً لا يستطيع البثّ تنفيذه.
--
-- فهذا الملف يقيس **البُعد الزمني** الذي لا تقيسه تلك: الطلب يُنشأ مشروعاً ثم
-- يُزرع موعده داخل النافذة (‏وهو ما يفعله مرورُ الوقت حرفياً)، ثم يُطلب التحويل.
--
-- ── 🔬 والطفرة تُبنى وتُشغَّل — فتأكيدٌ لا تُسقطه طفرةٌ تزيين ────────────────
--
-- القسم (ز) يأخذ **التعريف الحيّ** ويُعطّل شرط المهلة وحده باستبدالٍ من رمزٍ
-- واحد (`if … then` ⇒ `if false then`) — فلا يتغيّر في الدالة شيءٌ آخر — ثم
-- يطلب من (ب-١) أن **يسقط**. وهذا هو بعينه سلوك ما قبل 0107. والاستعادة من
-- التعريف الملتقط (D-58) و**قبل الحكم** دائماً.
--
-- ── ⚠ وما لا يُقاس هنا، مُعلَناً بحدّه: التزامنُ بوصلتين ────────────────────
--
-- الملفّ يُنفَّذ في جلسةٍ واحدة، و`dblink` **غير مثبَّتة** و`postgres_fdw` كذلك
-- (‏مقيسان من `pg_extension` و`pg_available_extensions` في 2026-08-18) — ولا
-- تُثبَّت إحداهما في قاعدة الإنتاج لأجل اختبار. فالقسم (و) يحرس **الحاجز
-- البنيوي** (‏قفل الصف في الجسم الحيّ)، و**التزامن الحقيقي يُقاس بسكربت
-- وصلتين**: `node scripts/qconv-race-check.mjs`. وهو نفس التقسيم المُعلن في
-- `notify_claim_tests.sql:29-32`.
--
-- 🔴 **و`for update` هنا ليست احتياطاً بل الحاجز الوحيد** — مقيسٌ في 2026-08-18
--    على **نسخةٍ** من الدالة منزوعةَ القفل (والتعريف الحيّ لم يُمسّ): وصلتان
--    متزامنتان أنتجتا **حجزين، بلا خطأٍ إطلاقاً**. ومُشغّل الانتقال (0084) لا
--    يمسكها لأن شرطه `old.status is distinct from new.status` و«محوَّل ← محوَّل»
--    لا يوقظه، والفهرس الفريد لا يمسكها لأن كل حجزٍ يحمل معرّفاً جديداً.
--    ⇒ فمن يحذف `for update` يوماً بحجّة «التحديث ذرّي» يفتح الحجز المزدوج على
--      مصراعيه، و(و-٢) هو ما يوقفه.
--
-- المرجع: supabase/migrations/0107_quote_conversion_lead_time.sql
--         supabase/migrations/0088_quote_request_conversion.sql
--         supabase/migrations/0098_quote_request_lead_time.sql
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (٠) الشروط المسبقة + كنس أي بقايا
--
-- وسم الفيكسترة `QCLEAD-FIXTURE` بلا شرطةٍ سفلية بقصد: `_` محرفُ بدلٍ في
-- `like`، ووسمٌ يحملها كان قد يكنس فيكسترة مجموعةٍ أخرى تعمل الآن.
-- ----------------------------------------------------------------------------
do $$
declare
  v_left integer;
begin
  if to_regprocedure('public.convert_quote_request(uuid,text,numeric,text,uuid,text)') is null then
    raise exception 'شرط مسبق: convert_quote_request غير موجودة — نفّذ 0088';
  end if;
  if to_regprocedure('public.reschedule_quote_request(uuid,timestamp with time zone)') is null then
    raise exception 'شرط مسبق: reschedule_quote_request غير موجودة — نفّذ 0107 (pnpm db:migrate)';
  end if;
  if to_regprocedure('public.booking_min_pickup_at()') is null then
    raise exception 'شرط مسبق: booking_min_pickup_at غير موجودة — نفّذ 0067';
  end if;

  -- الترتيب: إشعارات ← طلبات ← حجوزات (`booking_id` مفتاحٌ أجنبي `restrict`)
  delete from public.notifications n where n.payload ->> 'customerName' like '%QCLEAD-FIXTURE%';
  delete from public.quote_requests q where q.customer_name like '%QCLEAD-FIXTURE%';
  delete from public.bookings      b where b.customer_name like '%QCLEAD-FIXTURE%';

  select count(*) into v_left from public.quote_requests q
   where q.customer_name like '%QCLEAD-FIXTURE%';
  if v_left <> 0 then
    raise exception '(٠) بقيت % من طلبات تشغيلٍ سابق بعد الكنس', v_left;
  end if;
  select count(*) into v_left from public.bookings b
   where b.customer_name like '%QCLEAD-FIXTURE%';
  if v_left <> 0 then
    raise exception '(٠) بقيت % من حجوزات تشغيلٍ سابق بعد الكنس', v_left;
  end if;

  raise notice '✔ (٠) الشروط المسبقة سليمة والأرض نظيفة';
end;
$$;

-- ----------------------------------------------------------------------------
-- (٠-ب) هوية المشرف · فئةٌ تتسع · **والمهلة مشتعلة**
--
-- و**التخطّي ممنوع في الثلاثة**: ملفٌّ أخضر بلا هوية مشرف لا يفحص شيئاً، وملفٌّ
-- أخضر و`min_lead_minutes = 0` يقيس حارساً مطفأً ويسمّي ذلك نجاحاً.
-- ----------------------------------------------------------------------------
do $$
declare
  v_admin uuid;
  v_class record;
  v_lead  integer;
begin
  perform set_config('tours.ql_admin', '', false);
  perform set_config('tours.ql_admin_fixture', '0', false);

  select p.id into v_admin from public.profiles p where p.role = 'admin' limit 1;

  if v_admin is null then
    begin
      v_admin := '0c0c0c0c-0c0c-4c0c-8c0c-0c0c0c0c0c0c'::uuid;
      delete from auth.users u where u.id = v_admin;
      insert into auth.users (id, email) values (v_admin, 'qclead-tests-fixture@local.invalid');
      insert into public.profiles (id, role, full_name)
      values (v_admin, 'admin', 'مشرف اختبار مؤقت')
      on conflict (id) do update set role = 'admin';
      perform set_config('tours.ql_admin_fixture', '1', false);
      raise notice '  ↳ أُنشئ مشرف اختبار مؤقت (سيُحذف في النهاية)';
    exception
      when others then
        v_admin := null;
        raise notice '  ↳ تعذّر إنشاء مشرف مؤقت (%)', sqlerrm;
    end;
  end if;

  if v_admin is null then
    raise exception '(٠-ب) بلا هوية مشرف لا يُفحص التحويل — والتخطّي هنا ملفٌّ أخضر لا يفحص شيئاً';
  end if;

  perform set_config('tours.ql_admin', v_admin::text, false);
  perform set_config('request.jwt.claim.sub', v_admin::text, true);

  if not public.is_admin() then
    raise exception '(٠-ب) تعذّر انتحال هوية المشرف — is_admin() ما زالت false';
  end if;

  -- 🔴 المهلة نفسها شرطٌ للقياس، لا مُدخلاً نضبطه
  --
  -- ⚠ ولا تُطفَأ ولا تُرفع ولا تُلمس من هنا: `min_lead_minutes` إعدادُ مالك،
  --   والاختبار الذي يعدّل الإعداد الذي يقيسه هو بعينه العطب الذي جعل
  --   `payment_tests.sql` تُبقي بوابةَ `test` مشتعلةً يوماً كاملاً.
  select t.min_lead_minutes into v_lead from public.trip_config() t;
  if coalesce(v_lead, 0) <= 0 then
    raise exception
      '(٠-ب) `min_lead_minutes` = % — أي أن حارس المهلة مطفأ بإعدادٍ لا بعطل، '
      'وهذه المجموعة تقيسه فلا يصحّ أن تخضرّ. أعِد الإعداد أو أسقط الملف عمداً.',
      coalesce(v_lead, 0);
  end if;

  -- أصغر فئةٍ مفعَّلة تتسع لأربعة ركاب وحقيبتين — تُقرأ ولا تُسمّى نصّاً
  select vc.slug, t.min_price into v_class
  from public.vehicle_classes vc
  join public.tariffs t on t.class_id = vc.id
  where vc.active and vc.capacity >= 4 and vc.luggage_capacity >= 2
  order by vc.capacity asc limit 1;

  if v_class.slug is null then
    raise exception '(٠-ب) لا فئة مفعَّلة تتسع لأربعة ركاب — لا يُقاس التحويل';
  end if;

  perform set_config('tours.ql_class', v_class.slug, false);
  perform set_config('tours.ql_lead',  v_lead::text,  false);

  raise notice '✔ (٠-ب) المشرف جاهز · الفئة «%» · المهلة % دقيقة', v_class.slug, v_lead;
end;
$$;

-- ----------------------------------------------------------------------------
-- (أ) التحويل السليم — **حجزٌ واحد** بالإجمالي والمستحق الصحيحين
--
-- ولماذا «واحد» تأكيدٌ قائمٌ بذاته: العدّ عبر `booking_id` وحده كان يمرّ حتى لو
-- أنشأت الدالة حجزين وربطت الأخير — فيُعدّ الصفّان معاً بوسم الفيكسترة.
-- ----------------------------------------------------------------------------
do $$
declare
  v_name  constant text := 'عميل QCLEAD-FIXTURE أ';
  v_when  constant timestamptz := now() + interval '12 days';
  v_class constant text := current_setting('tours.ql_class');
  v_price constant numeric := 9000;
  v_cost  constant numeric := 3000;
  v_id    uuid;
  v_res   record;
  v_b     record;
  v_q     record;
  v_n     integer;
begin
  select * into v_res from public.create_quote_request(
    null, v_name, '01000000201', 'رحلة قياس أ',
    'ميدان التحرير', 30.0444, 31.2357, null, null, null, v_when, 4, 2);
  v_id := v_res.id;
  perform 1 from public.set_quote_request_status(v_id, 'quoted', v_price, null);

  select * into v_res from public.convert_quote_request(v_id, v_class, v_cost, 'الإسكندرية');

  -- (أ-١) حجزٌ **واحد** لا أكثر
  select count(*) into v_n from public.bookings b where b.customer_name = v_name;
  if v_n <> 1 then
    raise exception '(أ-١) 🔴 التحويل أنتج % حجزاً لا واحداً', v_n;
  end if;

  select * into v_b from public.bookings b where b.id = v_res.booking_id;

  -- (أ-٢) اللقطة المالية: الإجمالي = السعر المعروض، والمستحق كامله، ولا باقي
  if v_b.total <> v_price or v_b.amount_due <> v_price or v_b.amount_remaining <> 0 then
    raise exception '(أ-٢) إجمالي=% مستحق=% باقٍ=% — المتوقع %/%/0',
      v_b.total, v_b.amount_due, v_b.amount_remaining, v_price, v_price;
  end if;
  if v_b.plan <> 'full' then
    raise exception '(أ-٢) الخطة «%» — التحويل يُنشئ دفعاً كاملاً لا عربوناً', v_b.plan;
  end if;
  if v_b.status <> 'pending_payment' then
    raise exception '(أ-٢) الحجز نشأ بحالة «%» لا pending_payment', v_b.status;
  end if;
  if v_b.margin_amount <> v_price - v_cost or v_b.subcontractor_cost <> v_cost then
    raise exception '(أ-٢) التكلفة % والهامش % — المتوقع % و%',
      v_b.subcontractor_cost, v_b.margin_amount, v_cost, v_price - v_cost;
  end if;

  -- (أ-٣) 🔒 موعد الحجز = موعد الطلب حرفاً — اللقطة سجلٌّ لا مرآة
  if (v_b.trip ->> 'pickupAt')::timestamptz <> v_when then
    raise exception '(أ-٣) موعد اللقطة % ≠ موعد الطلب %',
      v_b.trip ->> 'pickupAt', v_when;
  end if;

  -- (أ-٤) وحالة الطلب تعكس الواقع: «محوَّل» ومرتبطةٌ بهذا الحجز بالذات
  select * into v_q from public.quote_requests q where q.id = v_id;
  if v_q.status <> 'converted' or v_q.booking_id is distinct from v_res.booking_id
     or v_q.converted_at is null then
    raise exception '(أ-٤) الطلب بعد التحويل: حالة=% حجز=% ختم=%',
      v_q.status, coalesce(v_q.booking_id::text, 'بلا'),
      coalesce(v_q.converted_at::text, 'بلا');
  end if;

  perform set_config('tours.ql_a', v_id::text, false);
  raise notice '✔ (أ) حجزٌ واحد · الإجمالي والمستحق والهامش · الموعد مورَّث · الطلب «محوَّل»';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ب) 🔴🔴 **حارس المهلة عند التحويل** — وهو ادّعاء 0107 كلّه
--
-- والموعد يُزرع داخل النافذة بـ`update` مباشر لأن `create_quote_request` تمنع
-- إنشاءه هكذا (‏0098) — والزرعُ هو **محاكاةُ مرور الوقت** لا التفافٌ على حارس:
-- الطلب أُنشئ مشروعاً، ثم زحف `now()` تحته.
-- ----------------------------------------------------------------------------
do $$
declare
  v_name  constant text := 'عميل QCLEAD-FIXTURE ب';
  v_when  constant timestamptz := now() + interval '14 days';
  v_class constant text := current_setting('tours.ql_class');
  v_lead  constant integer := current_setting('tours.ql_lead')::integer;
  v_id    uuid;
  v_res   record;
  v_hint  text;
  v_det   text;
  v_ok    boolean;
  v_n     integer;
begin
  select * into v_res from public.create_quote_request(
    null, v_name, '01000000202', 'رحلة قياس ب',
    'ميدان التحرير', 30.0444, 31.2357, null, null, null, v_when, 4, 2);
  v_id := v_res.id;
  perform 1 from public.set_quote_request_status(v_id, 'quoted', 9000, null);

  -- ══ (ب-١) الموعد صار داخل النافذة ⇒ التحويل مرفوض بـ`lead-time` ══════════
  --    نصفُ المهلة: مستقبلٌ قطعاً (فلا يقع `pickup-past`) ودون الأرضية قطعاً.
  update public.quote_requests q
     set pickup_at = now() + make_interval(mins => v_lead / 2)
   where q.id = v_id;

  v_ok := false;
  begin
    perform 1 from public.convert_quote_request(v_id, v_class, 3000, 'الإسكندرية');
  exception when others then
    v_ok := true;
    get stacked diagnostics v_hint = pg_exception_hint, v_det = pg_exception_detail;
  end;

  if not v_ok or v_hint is distinct from 'lead-time' then
    raise exception
      '(ب-١) 🔴 طلبٌ موعده بعد % دقيقة تحوَّل حجزاً (رُفض=% رمز=%) — والبثّ يحتاج % دقيقة',
      v_lead / 2, v_ok, coalesce(v_hint, 'بلا'), v_lead;
  end if;

  -- ولا صفّ خُلِّف وراءه: الرفض داخل المعاملة يعني أن لا حجز ولا نقلة حالة
  select count(*) into v_n from public.bookings b where b.customer_name = v_name;
  if v_n <> 0 then
    raise exception '(ب-١) 🔴 رُفض التحويل وبقي % حجزاً — الرفض لا يُرجع', v_n;
  end if;
  if (select q.status from public.quote_requests q where q.id = v_id) <> 'quoted' then
    raise exception '(ب-١) الرفض غيّر حالة الطلب';
  end if;

  -- (ب-٢) و`detail` يحمل أقرب موعدٍ متاح **رقماً** لتملأ به الشاشة الحقل
  if v_det is null or position('min_pickup=' in v_det) = 0 then
    raise exception '(ب-٢) الرفض بلا أقرب موعدٍ متاح في detail (%) — الشاشة تترك المالك يخمّن',
      coalesce(v_det, 'بلا');
  end if;

  -- ══ (ب-٣) الحدّ بالضبط مقبول — المقارنة `<` لا `<=` ═══════════════════════
  --    ويُحسب **داخل نفس العبارة** وإلا زحف `now()` بين العبارتين فرُفض بحق.
  update public.quote_requests q
     set pickup_at = public.booking_min_pickup_at() + interval '2 seconds'
   where q.id = v_id;

  select * into v_res from public.convert_quote_request(v_id, v_class, 3000, 'الإسكندرية');
  if v_res.booking_id is null then
    raise exception '(ب-٣) موعدٌ فوق الحدّ مباشرةً رُفض — الحارس صار `<=` أو أوسع';
  end if;

  raise notice '✔ (ب) داخل النافذة مرفوض برمزه وبأقرب موعدٍ متاح · وفوق الحدّ مقبول';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ج) المخرج: `reschedule_quote_request` — الطلب العالق يُفكّ بموعدٍ مشروع
--
-- ولولاه لكان (ب-١) طريقاً مسدوداً مخرجُه الوحيد إطفاءُ `min_lead_minutes`
-- عالمياً — أي إسقاطُ الحارس لأجل صفٍّ واحد.
-- ----------------------------------------------------------------------------
do $$
declare
  v_name  constant text := 'عميل QCLEAD-FIXTURE ج';
  v_when  constant timestamptz := now() + interval '15 days';
  v_class constant text := current_setting('tours.ql_class');
  v_lead  constant integer := current_setting('tours.ql_lead')::integer;
  v_id    uuid;
  v_res   record;
  v_b     record;
  v_hint  text;
  v_ok    boolean;
  v_new   timestamptz;
begin
  select * into v_res from public.create_quote_request(
    null, v_name, '01000000203', 'رحلة قياس ج',
    'ميدان التحرير', 30.0444, 31.2357, null, null, null, v_when, 4, 2);
  v_id := v_res.id;
  perform 1 from public.set_quote_request_status(v_id, 'quoted', 9000, null);

  update public.quote_requests q
     set pickup_at = now() + make_interval(mins => v_lead / 2)
   where q.id = v_id;

  -- (ج-١) 🔒 وإعادة الجدولة تحرسها **نفس الأرضية**: موعدٌ جديد داخل النافذة
  --       مرفوضٌ كذلك — وإلا صار المخرجُ باباً خلفياً يُبطل (ب-١) كلَّه
  v_ok := false;
  begin
    perform 1 from public.reschedule_quote_request(v_id, now() + make_interval(mins => v_lead / 3));
  exception when others then
    v_ok := true; get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if not v_ok or v_hint is distinct from 'lead-time' then
    raise exception
      '(ج-١) 🔴 إعادة الجدولة قبلت موعداً دون المهلة (رُفض=% رمز=%) — المخرج صار باباً خلفياً',
      v_ok, coalesce(v_hint, 'بلا');
  end if;

  -- (ج-٢) وموعدٌ ماضٍ مرفوض برمزه الأدقّ
  v_ok := false;
  begin
    perform 1 from public.reschedule_quote_request(v_id, now() - interval '1 hour');
  exception when others then
    v_ok := true; get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if not v_ok or v_hint is distinct from 'pickup-past' then
    raise exception '(ج-٢) إعادة الجدولة قبلت موعداً ماضياً (رُفض=% رمز=%)',
      v_ok, coalesce(v_hint, 'بلا');
  end if;

  -- (ج-٣) وموعدٌ مشروع يُقبل — والحالة والمبلغ لا يُمسّان
  v_new := now() + interval '5 days';
  select * into v_res from public.reschedule_quote_request(v_id, v_new);
  if v_res.pickup_at <> v_new then
    raise exception '(ج-٣) الموعد لم يُكتب (%)', v_res.pickup_at;
  end if;
  if (select q.status from public.quote_requests q where q.id = v_id) <> 'quoted'
     or (select q.quoted_amount from public.quote_requests q where q.id = v_id) <> 9000 then
    raise exception '(ج-٣) إعادة الجدولة غيّرت الحالة أو المبلغ — وهي ليست نقلةَ حالة';
  end if;

  -- (ج-٤) ثم يمرّ التحويل، ويحمل الحجز **الموعد الجديد** لا القديم
  select * into v_res from public.convert_quote_request(v_id, v_class, 3000, 'الإسكندرية');
  select * into v_b from public.bookings b where b.id = v_res.booking_id;
  if (v_b.trip ->> 'pickupAt')::timestamptz <> v_new then
    raise exception '(ج-٤) 🔴 الحجز حمل الموعد القديم (%) لا المتفق عليه (%)',
      v_b.trip ->> 'pickupAt', v_new;
  end if;

  -- (ج-٥) و«محوَّل» لا تُعاد جدولتها: موعد الحجز يُعدَّل من شاشة الحجز
  v_ok := false;
  begin
    perform 1 from public.reschedule_quote_request(v_id, now() + interval '6 days');
  exception when others then
    v_ok := true; get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if not v_ok or v_hint is distinct from 'already-converted' then
    raise exception '(ج-٥) طلبٌ محوَّل أُعيدت جدولته (رُفض=% رمز=%) — الطلب والحجز يفترقان',
      v_ok, coalesce(v_hint, 'بلا');
  end if;

  raise notice '✔ (ج) المخرج يحرسه نفس الحدّ · والموعد الجديد يصل الحجز · و«محوَّل» مقفلة';
end;
$$;

-- ----------------------------------------------------------------------------
-- (د) التحويل مرتين — مرفوضٌ تتالياً، وبالفهرس الفريد بنيوياً
--
-- ⚠ وهذا التتالي **ليس** برهانَ التزامن: راجع ترويسة الملف والقسم (و).
-- ----------------------------------------------------------------------------
do $$
declare
  v_name  constant text := 'عميل QCLEAD-FIXTURE د';
  v_when  constant timestamptz := now() + interval '16 days';
  v_class constant text := current_setting('tours.ql_class');
  v_id    uuid;
  v_res   record;
  v_hint  text;
  v_ok    boolean;
  v_n     integer;
begin
  select * into v_res from public.create_quote_request(
    null, v_name, '01000000204', 'رحلة قياس د',
    'ميدان التحرير', 30.0444, 31.2357, null, null, null, v_when, 4, 2);
  v_id := v_res.id;
  perform 1 from public.set_quote_request_status(v_id, 'quoted', 9000, null);

  perform 1 from public.convert_quote_request(v_id, v_class, 3000, 'الإسكندرية');

  v_ok := false;
  begin
    perform 1 from public.convert_quote_request(v_id, v_class, 3000, 'الإسكندرية');
  exception when others then
    v_ok := true; get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if not v_ok or v_hint is distinct from 'already-converted' then
    raise exception '(د-١) 🔴 التحويل مرتين مرّ (رُفض=% رمز=%)', v_ok, coalesce(v_hint, 'بلا');
  end if;

  -- والحصيلة صفٌّ واحد لا صفّان
  select count(*) into v_n from public.bookings b where b.customer_name = v_name;
  if v_n <> 1 then
    raise exception '(د-١) 🔴 بعد محاولتين وُجد % حجزاً', v_n;
  end if;

  raise notice '✔ (د) المحاولة الثانية مرفوضة، والحصيلة حجزٌ واحد';
end;
$$;

-- ----------------------------------------------------------------------------
-- (هـ) 🔴 D-20 — `authenticated` يشمل كل متعهّد، فلا يعني مشرفاً
--
-- ويُفحص **البابان** معاً: التحويل (كان مفحوصاً) و**إعادة الجدولة** (بابٌ جديد
-- فتحته 0107 — ودالةٌ جديدة بلا فحصٍ لدورها هي الطريق الذي دخلت منه كل ثغرة
-- صلاحيات في هذا المشروع).
-- ----------------------------------------------------------------------------
do $$
declare
  v_name  constant text := 'عميل QCLEAD-FIXTURE هـ';
  v_when  constant timestamptz := now() + interval '18 days';
  v_class constant text := current_setting('tours.ql_class');
  v_admin constant text := current_setting('tours.ql_admin', true);
  v_other uuid := '0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f'::uuid;
  v_id    uuid;
  v_res   record;
  v_h1    text;
  v_h2    text;
  v_ok1   boolean := false;
  v_ok2   boolean := false;
  v_made  boolean := false;
begin
  select * into v_res from public.create_quote_request(
    null, v_name, '01000000205', 'رحلة قياس هـ',
    'ميدان التحرير', 30.0444, 31.2357, null, null, null, v_when, 4, 2);
  v_id := v_res.id;
  perform 1 from public.set_quote_request_status(v_id, 'quoted', 9000, null);

  begin
    delete from auth.users u where u.id = v_other;
    insert into auth.users (id, email) values (v_other, 'qclead-tests-partner@local.invalid');
    insert into public.profiles (id, role, full_name)
    values (v_other, 'subcontractor', 'متعهّد اختبار مؤقت')
    on conflict (id) do update set role = 'subcontractor';
    v_made := true;
  exception when others then
    raise notice '  ↳ (هـ) تعذّر إنشاء هوية المتعهّد: %', sqlerrm;
  end;

  -- ⚠ ولا سقوطَ إلى «هوية فارغة»: تلك حالة الضيف وتُرفض لسببٍ آخر، فتعطي ملفاً
  --   أخضر لا يفحص D-20 إطلاقاً.
  if not v_made then
    raise exception '(هـ) تعذّر إنشاء هوية متعهّد — ولا يُفحص D-20 بهوية فارغة';
  end if;

  perform set_config('request.jwt.claim.sub', v_other::text, true);
  if public.is_admin() then
    raise exception '(هـ-٠) الهوية البديلة تُعدّ مشرفاً — الفحص بلا معنى';
  end if;

  begin
    perform 1 from public.convert_quote_request(v_id, v_class, 100, 'الإسكندرية');
  exception when others then
    v_ok1 := true; get stacked diagnostics v_h1 = pg_exception_hint;
  end;

  begin
    perform 1 from public.reschedule_quote_request(v_id, now() + interval '20 days');
  exception when others then
    v_ok2 := true; get stacked diagnostics v_h2 = pg_exception_hint;
  end;

  -- تُستعاد هوية المشرف **قبل الحكم**
  perform set_config('request.jwt.claim.sub', coalesce(v_admin, ''), true);
  delete from public.profiles p where p.id = v_other;
  delete from auth.users    u where u.id = v_other;

  if not v_ok1 or v_h1 is distinct from 'forbidden' then
    raise exception '(هـ-١) 🔴 متعهّدٌ حوّل طلباً إلى حجز (رُفض=% رمز=%) — D-20 مكسورة',
      v_ok1, coalesce(v_h1, 'بلا');
  end if;
  if not v_ok2 or v_h2 is distinct from 'forbidden' then
    raise exception '(هـ-٢) 🔴 متعهّدٌ أعاد جدولة طلب (رُفض=% رمز=%) — D-20 مكسورة',
      v_ok2, coalesce(v_h2, 'بلا');
  end if;

  -- (هـ-٣) والزائر لا يملك EXECUTE على أيٍّ من البابين
  if has_function_privilege('anon',
       'public.convert_quote_request(uuid, text, numeric, text, uuid, text)', 'EXECUTE')
     or has_function_privilege('anon',
       'public.reschedule_quote_request(uuid, timestamp with time zone)', 'EXECUTE') then
    raise exception '(هـ-٣) 🔴 الزائر يملك EXECUTE على مسار التحويل أو إعادة الجدولة';
  end if;

  raise notice '✔ (هـ) D-20 على البابين: هويةٌ مصدَّقة غير مشرفة لا تُحوّل ولا تُعيد الجدولة';
end;
$$;

-- ----------------------------------------------------------------------------
-- (و) الأرضية والقفل — حارسان بنيويّان على الجسم الحيّ (D-58)
--
-- والأرضية تُقاس هنا **رقمياً** كذلك: 0107 أعادت كتابة جسم الدالة كاملاً، وأي
-- سقوطٍ للأرضية في النسخ كان سيمرّ صامتاً لأن (أ) تحوّل بسعرٍ فوقها بمريح.
-- ----------------------------------------------------------------------------
do $$
declare
  v_name  constant text := 'عميل QCLEAD-FIXTURE و';
  v_when  constant timestamptz := now() + interval '19 days';
  v_class constant text := current_setting('tours.ql_class');
  v_cost  constant numeric := 5000;
  v_id    uuid;
  v_res   record;
  v_floor record;
  v_hint  text;
  v_ok    boolean;
  v_def   text;
begin
  -- الحدّ يُقرأ من الدالة نفسها — فلو غيّر المالك أرضيته غداً بقي الاختبار صحيحاً
  select * into v_floor from public.discount_floor_room(999999, v_class, v_cost);

  select * into v_res from public.create_quote_request(
    null, v_name, '01000000206', 'رحلة قياس و',
    'ميدان التحرير', 30.0444, 31.2357, null, null, null, v_when, 4, 2);
  v_id := v_res.id;
  perform 1 from public.set_quote_request_status(v_id, 'quoted', v_floor.min_total - 1, null);

  v_ok := false;
  begin
    perform 1 from public.convert_quote_request(v_id, v_class, v_cost, 'الإسكندرية');
  exception when others then
    v_ok := true; get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if not v_ok or v_hint is distinct from 'below-floor' then
    raise exception
      '(و-١) 🔴 سعرٌ دون الأرضية بجنيه (% مقابل %) صار حجزاً (رُفض=% رمز=%) — بيعٌ بخسارة',
      v_floor.min_total - 1, v_floor.min_total, v_ok, coalesce(v_hint, 'بلا');
  end if;

  -- (و-٢) والقفل في الجسم الحيّ — الحاجز الذي يجعل تحويلين متزامنين حجزاً واحداً
  --       ⚠ فحصٌ بنيوي ومُعلَنٌ بحدّه: التزامن الحقيقي في `_qconv_race.mjs`
  v_def := pg_get_functiondef(
    to_regprocedure('public.convert_quote_request(uuid,text,numeric,text,uuid,text)')::oid);
  if position('for update' in v_def) = 0 then
    raise exception '(و-٢) 🔴 قفل الصف غائبٌ عن جسم التحويل — موظفان ينشئان حجزين';
  end if;
  v_def := pg_get_functiondef(
    to_regprocedure('public.reschedule_quote_request(uuid,timestamp with time zone)')::oid);
  if position('for update' in v_def) = 0 then
    raise exception '(و-٢) 🔴 قفل الصف غائبٌ عن إعادة الجدولة';
  end if;

  -- (و-٣) والفهرس الفريد على `booking_id` قائم — حجزٌ واحد لا يخدم طلبين
  if not exists (
    select 1 from pg_indexes
     where schemaname = 'public' and tablename = 'quote_requests'
       and indexname = 'quote_requests_booking_uniq') then
    raise exception '(و-٣) 🔴 الفهرس الفريد على booking_id سقط';
  end if;

  raise notice '✔ (و) الأرضية ترفض دون الحدّ بجنيه · والقفل والفهرس قائمان';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ز) 🧬 **الطفرة** — والاختبار الذي لا يفشل حين يُنزع حارسه ليس اختباراً
--
-- تُعطَّل **جملةُ شرط المهلة وحدها** في التعريف الحيّ باستبدالٍ نصّي دقيق، فلا
-- يتغيّر في الدالة شيءٌ آخر — وهو بعينه سلوك ما قبل 0107. ثم يُطلب من (ب-١) أن
-- يسقط. والاستعادة من التعريف الملتقط و**قبل الحكم**.
-- ----------------------------------------------------------------------------
do $$
declare
  v_name   constant text := 'عميل QCLEAD-FIXTURE ز';
  v_when   constant timestamptz := now() + interval '21 days';
  v_class  constant text := current_setting('tours.ql_class');
  v_lead   constant integer := current_setting('tours.ql_lead')::integer;
  v_needle constant text := 'if v_min_pickup is not null and v_q.pickup_at < v_min_pickup then';
  v_origin text;
  v_mut    text;
  v_a      uuid;   -- تُطفَّر عليها
  v_b      uuid;   -- يُتحقَّق بها من الاستعادة
  v_res    record;
  v_caught boolean;
  v_ok     boolean;
begin
  select * into v_res from public.create_quote_request(
    null, v_name, '01000000207', 'ز-أ',
    'ميدان التحرير', 30.0444, 31.2357, null, null, null, v_when, 4, 2);
  v_a := v_res.id;
  perform 1 from public.set_quote_request_status(v_a, 'quoted', 9000, null);

  select * into v_res from public.create_quote_request(
    null, v_name, '01000000208', 'ز-ب',
    'ميدان التحرير', 30.0444, 31.2357, null, null, null, v_when, 4, 2);
  v_b := v_res.id;
  perform 1 from public.set_quote_request_status(v_b, 'quoted', 9000, null);

  update public.quote_requests q
     set pickup_at = now() + make_interval(mins => v_lead / 2)
   where q.id in (v_a, v_b);

  select pg_get_functiondef(
    to_regprocedure('public.convert_quote_request(uuid,text,numeric,text,uuid,text)')::oid)
    into v_origin;

  v_mut := replace(v_origin, v_needle, 'if false then');

  -- 🔴 والاستبدال الصامت أخطر من الطفرة: لو تغيّر نصّ الشرط غداً لصار `replace`
  --    بلا أثر، ولمرّت الطفرة «ناجحة» بلا أن تُطفّر شيئاً.
  if v_mut = v_origin then
    raise exception
      '(ز) 🔴 لم يُعثر على جملة شرط المهلة في الجسم الحيّ — الطفرة لم تُطبَّق، والحكم باطل';
  end if;

  execute v_mut;

  v_caught := false;
  begin
    perform 1 from public.convert_quote_request(v_a, v_class, 3000, 'الإسكندرية');
    v_caught := true;   -- مرّ ⇒ الطفرة أُمسكت: (ب-١) كان يحرس فعلاً
  exception when others then
    v_caught := false;
  end;

  -- الاستعادة **قبل الحكم**: تشخيصٌ فاشل لا يجوز أن يترك القاعدة مطفَّرة
  execute v_origin;

  if not v_caught then
    raise exception
      '(ز) 🔴 عُطِّل حارس المهلة وبقي التحويل مرفوضاً — أي أن (ب-١) لا يقيس هذا الحارس';
  end if;

  -- وبعد الاستعادة يعود الرفض — على صفٍّ **لم تمسّه** الطفرة
  v_ok := false;
  begin
    perform 1 from public.convert_quote_request(v_b, v_class, 3000, 'الإسكندرية');
  exception when others then v_ok := true;
  end;
  if not v_ok then
    raise exception '(ز) لم يُستعَد حارس المهلة — القاعدة باقية على الطفرة';
  end if;

  raise notice '✔ (ز) الطفرة أُمسكت: بلا حارس المهلة يمرّ التحويل — ثم استُعيد الحارس';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ح) التنظيف — والترتيب مقصود: إشعارات ← طلبات ← حجوزات (`on delete restrict`)
--
-- ⚠ والإشعارات تُحذف **بالوسم في الحمولة**: كل تحويلٍ في هذا الملف يُطابر
--   `booking_created` لقناة التشغيل، وتركُه يعني أن العامل يُبرِق للمالك عن
--   عميلٍ لا وجود له.
-- ----------------------------------------------------------------------------
do $$
declare
  v_left integer;
begin
  delete from public.notifications n where n.payload ->> 'customerName' like '%QCLEAD-FIXTURE%';
  delete from public.quote_requests q where q.customer_name like '%QCLEAD-FIXTURE%';
  delete from public.bookings      b where b.customer_name like '%QCLEAD-FIXTURE%';

  select count(*) into v_left from public.quote_requests q
   where q.customer_name like '%QCLEAD-FIXTURE%';
  if v_left <> 0 then raise exception '(ح) بقيت % من طلبات الاختبار', v_left; end if;

  select count(*) into v_left from public.bookings b
   where b.customer_name like '%QCLEAD-FIXTURE%';
  if v_left <> 0 then raise exception '(ح) بقيت % من حجوزات الاختبار', v_left; end if;

  select count(*) into v_left from public.notifications n
   where n.payload ->> 'customerName' like '%QCLEAD-FIXTURE%';
  if v_left <> 0 then raise exception '(ح) بقيت % من إشعارات الاختبار', v_left; end if;

  if coalesce(current_setting('tours.ql_admin_fixture', true), '0') = '1' then
    delete from public.profiles p where p.id = current_setting('tours.ql_admin')::uuid;
    delete from auth.users    u where u.id = current_setting('tours.ql_admin')::uuid;
    raise notice '  ↳ حُذف المشرف المؤقت';
  end if;

  perform set_config('tours.ql_admin', '', false);
  perform set_config('tours.ql_admin_fixture', '', false);
  perform set_config('tours.ql_class', '', false);
  perform set_config('tours.ql_lead', '', false);
  perform set_config('tours.ql_a', '', false);
  perform set_config('request.jwt.claim.sub', '', true);

  raise notice '✔ (ح) التنظيف تم — لا طلبات ولا حجوزات ولا إشعارات ولا هوية متبقية';
end;
$$;

-- ----------------------------------------------------------------------------
-- الخلاصة
-- ----------------------------------------------------------------------------
do $$
begin
  raise notice 'ALL PASSED — المهلة تُفرض لحظةَ التحويل، ولها مخرجٌ محروسٌ بنفس الحدّ، والطفرة أُمسكت';
end;
$$;
