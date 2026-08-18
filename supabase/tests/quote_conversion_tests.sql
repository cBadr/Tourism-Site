-- ============================================================================
-- quote_conversion_tests.sql — طلبٌ مسعَّرٌ ← حجزٌ حقيقي (ب‑٣ · هجرة 0088)
--
-- كيف تشغّله:
--   pnpm db:test quote_conversion
-- أو من psql بدور صاحب القاعدة — و**لا بد** من ON_ERROR_STOP، وإلا تابع psql
-- بعد الكتلة الفاشلة وطبع «ALL PASSED» رغم الفشل:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/quote_conversion_tests.sql
--
-- النجاح = آخر سطر «ALL PASSED».
--
-- قابل لإعادة التنفيذ بلا حدود: صفوف الطلبات موسومة بـ`QC_TESTS_FIXTURE` في
-- اسم العميل، والحجوزات التي تنشأ عنها تحمل **الاسم نفسه** (‏`convert_quote_request`
-- تنسخ اسم العميل)، فيُمسح الطرفان بنفس الوسم. والترتيب مقصود: الطلبات أولاً ثم
-- الحجوزات، لأن `quote_requests.booking_id` مفتاحٌ أجنبي بـ`on delete restrict`.
--
-- ══════════════════════════════════════════════════════════════════════════
--  ما الذي يجعل هذا الملف مختلفاً عن «اختبارٍ يطمئن»
-- ══════════════════════════════════════════════════════════════════════════
--
-- الادّعاء المركزي هنا **مالي بحت**: السعر في ب‑٣ يدويّ، أي أنه لا يمرّ
-- بـ`quote_price` ولا بحواجزها، فأرضية الهامش (D-16) هي الحاجز الوحيد الذي يمنع
-- بيعاً بخسارة. ولو نُزع لبقي كل شيء يعمل: الحجز يُنشأ، والرابط يُرسل، والعميل
-- يدفع، والشاشة خضراء — والصفقة خاسرة ولا سطر في أي سجل يقول ذلك.
--
-- لذلك القسم (ح) **يقتلع الحاجز نفسه** ويطلب من التأكيد أن يفشل، ثم يستعيد
-- الأصل **قبل الحكم**. (النمط ٩ في LESSONS.md · القاعدة ١٩ · نظير (ح) في
-- `quote_request_tests.sql`.)
--
-- ولذلك أيضاً القسمان (ك) و(ل): `NaN` تعبر أرضية الهامش نفسها لأن كل فحوصها
-- من طرفٍ واحد (`>= 0` · `> 0`)، و`NaN` تُرتَّب فوق كل قيمة في `numeric`. و(ل)
-- يُعيد الجسم إلى ما قبل 0108 **ويُسقط القيدين معاً** ليُثبت أن (ك) يحرس فعلاً.
-- ⚠ و(ي) التنظيف يبقى **آخر الملف** مهما جاء ترتيب حرفه.
--
-- المرجع: supabase/migrations/0088_quote_request_conversion.sql
--         supabase/migrations/0084_quote_request_structured.sql
--         supabase/migrations/0046_discount_floor_room.sql (‏`discount_floor_room`)
--         supabase/migrations/0108_no_nan_money.sql (‏حارسا «رقمٌ حقيقي» + قيود الأعمدة)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (٠) الشروط المسبقة + كنس أي بقايا
-- ----------------------------------------------------------------------------
do $$
declare
  v_left integer;
begin
  if to_regprocedure('public.convert_quote_request(uuid,text,numeric,text,uuid,text)') is null then
    raise exception 'شرط مسبق: public.convert_quote_request غير موجودة — نفّذ 0088 (pnpm db:migrate)';
  end if;
  if to_regprocedure('public.discount_floor_room(numeric,text,numeric)') is null then
    raise exception 'شرط مسبق: public.discount_floor_room غير موجودة — نفّذ 0046';
  end if;
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.quote_requests'::regclass
       and conname  = 'quote_requests_converted_needs_booking_chk'
  ) then
    raise exception 'شرط مسبق: قيد اقتران «محوَّل ↔ حجز» غير موجود — نفّذ 0088';
  end if;

  -- الترتيب: إشعارات ← طلبات ← حجوزات (المفتاح الأجنبي restrict)
  delete from public.notifications n where n.payload ->> 'customerName' like '%QC_TESTS_FIXTURE%';
  delete from public.quote_requests q where q.customer_name like '%QC_TESTS_FIXTURE%';
  delete from public.bookings      b where b.customer_name like '%QC_TESTS_FIXTURE%';

  select count(*) into v_left from public.quote_requests q
   where q.customer_name like '%QC_TESTS_FIXTURE%';
  if v_left <> 0 then
    raise exception '(٠) بقيت % من طلبات تشغيلٍ سابق بعد الكنس', v_left;
  end if;
  select count(*) into v_left from public.bookings b
   where b.customer_name like '%QC_TESTS_FIXTURE%';
  if v_left <> 0 then
    raise exception '(٠) بقيت % من حجوزات تشغيلٍ سابق بعد الكنس', v_left;
  end if;

  raise notice '✔ (٠) الشروط المسبقة سليمة والأرض نظيفة';
end;
$$;

-- ----------------------------------------------------------------------------
-- (٠-ب) هوية المشرف + فئةٌ تتسع — كلتاهما شرطٌ لا يُتخطّى
--
-- نفس نمط (٠-ب) في `quote_request_tests.sql`. و**التخطّي ممنوع**: ملفٌّ أخضر
-- بلا هوية مشرف لا يفحص شيئاً من هذا الملف إطلاقاً.
-- ----------------------------------------------------------------------------
do $$
declare
  v_admin uuid;
  v_class record;
begin
  perform set_config('tours.qc_admin', '', false);
  perform set_config('tours.qc_admin_fixture', '0', false);

  select p.id into v_admin from public.profiles p where p.role = 'admin' limit 1;

  if v_admin is null then
    begin
      v_admin := '0d0d0d0d-0d0d-4d0d-8d0d-0d0d0d0d0d0d'::uuid;
      delete from auth.users u where u.id = v_admin;
      insert into auth.users (id, email) values (v_admin, 'qc-tests-fixture@local.invalid');
      insert into public.profiles (id, role, full_name)
      values (v_admin, 'admin', 'مشرف اختبار مؤقت')
      on conflict (id) do update set role = 'admin';
      perform set_config('tours.qc_admin_fixture', '1', false);
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

  perform set_config('tours.qc_admin', v_admin::text, false);
  perform set_config('request.jwt.claim.sub', v_admin::text, true);

  if not public.is_admin() then
    raise exception '(٠-ب) تعذّر انتحال هوية المشرف — is_admin() ما زالت false';
  end if;

  -- أصغر فئةٍ مفعَّلة تتسع لأربعة ركاب وحقيبتين، وأصغر فئةٍ **لا** تتسع.
  -- تُقرأ من القاعدة لا تُسمّى نصّاً: أسماء الفئات إعدادُ مالكٍ يتغيّر.
  select vc.slug, t.min_price into v_class
  from public.vehicle_classes vc
  join public.tariffs t on t.class_id = vc.id
  where vc.active and vc.capacity >= 4 and vc.luggage_capacity >= 2
  order by vc.capacity asc limit 1;

  if v_class.slug is null then
    raise exception '(٠-ب) لا فئة مفعَّلة تتسع لأربعة ركاب — لا يُقاس التحويل';
  end if;

  perform set_config('tours.qc_class', v_class.slug, false);
  perform set_config('tours.qc_min_price', v_class.min_price::text, false);

  raise notice '✔ (٠-ب) المشرف جاهز، والفئة «%» (أرضية سعرها %)', v_class.slug, v_class.min_price;
end;
$$;

-- ----------------------------------------------------------------------------
-- (أ) 🔴 أرضية الهامش تحرس السعر اليدوي — والحدّ يُقرأ من القاعدة لا يُفترض
--
-- الادّعاء: `convert_quote_request` تُرفض بـ`below-floor` لأي سعرٍ دون
-- `discount_floor_room(price, class, cost).min_total`، وتُقبل عند المساواة به
-- بالضبط. والأرقام كلها مشتقّةٌ من الدالة نفسها — فلو غيّر المالك أرضيته غداً
-- بقي الاختبار صحيحاً، ولو نُزعت الأرضية سقط فوراً.
-- ----------------------------------------------------------------------------
do $$
declare
  v_name  constant text := 'عميل QC_TESTS_FIXTURE أ';
  v_when  constant timestamptz := now() + interval '12 days';
  v_class constant text := current_setting('tours.qc_class');
  v_cost  constant numeric := 5000;
  v_id    uuid;
  v_res   record;
  v_floor record;
  v_hint  text;
  v_ok    boolean;
  v_price numeric;
begin
  -- الحدّ أولاً: كم أدنى إجمالٍ مقبول على تكلفة ٥٠٠٠ لهذه الفئة؟
  select * into v_floor from public.discount_floor_room(999999, v_class, v_cost);
  if v_floor.min_total is null or v_floor.min_total <= v_cost then
    raise exception
      '(أ-٠) الأرضية صفرٌ أو أقل من التكلفة (أدنى إجمالي % على تكلفة %) — لا حاجز يُقاس',
      v_floor.min_total, v_cost;
  end if;

  -- (أ-١) سعرٌ **جنيهٌ واحد** دون الحدّ ⇒ يُرفض
  v_price := v_floor.min_total - 1;

  select * into v_res from public.create_quote_request(
    null, v_name, '01000000101', 'رحلة قياس أ',
    'ميدان التحرير', 30.0444, 31.2357, null, null, null, v_when, 4, 2);
  v_id := v_res.id;
  perform 1 from public.set_quote_request_status(v_id, 'quoted', v_price, null);

  v_ok := false;
  begin
    perform 1 from public.convert_quote_request(v_id, v_class, v_cost, 'الإسكندرية');
  exception when others then
    v_ok := true; get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if not v_ok or v_hint is distinct from 'below-floor' then
    raise exception
      '(أ-١) 🔴 سعرٌ % دون أرضية % مرّ (رُفض=% رمز=%) — بيعٌ بخسارة من بابٍ بنيناه',
      v_price, v_floor.min_total, v_ok, coalesce(v_hint, 'بلا');
  end if;

  -- (أ-٢) والسعر المساوي للحدّ **بالضبط** يُقبل: الأرضية حدٌّ أدنى لا حدٌّ ممنوع
  perform 1 from public.set_quote_request_status(v_id, 'quoted', v_floor.min_total, null);
  select * into v_res
  from public.convert_quote_request(v_id, v_class, v_cost, 'الإسكندرية');

  if v_res.booking_id is null then
    raise exception '(أ-٢) السعر المساوي للأرضية لم يُنتج حجزاً';
  end if;
  if v_res.total <> v_floor.min_total then
    raise exception '(أ-٢) إجمالي الحجز % ≠ السعر المعروض %', v_res.total, v_floor.min_total;
  end if;
  -- والهامش = السعر − التكلفة بلا اجتهاد
  if v_res.margin_amount <> round(v_floor.min_total - v_cost, 2) then
    raise exception '(أ-٢) الهامش % ≠ السعر − التكلفة (%)',
      v_res.margin_amount, round(v_floor.min_total - v_cost, 2);
  end if;

  raise notice '✔ (أ) الأرضية حاجز: % مرفوض و% مقبول، والهامش = السعر − التكلفة',
    v_price, v_floor.min_total;
end;
$$;

-- ----------------------------------------------------------------------------
-- (ب) 🔴 أساس التكلفة **مطلوب** — وهذا هو ما يجعل الأرضية قادرةً على الرفض
--
-- ولماذا الادّعاء أعمق من «حقلٌ مطلوب»: `discount_implied_cost` تشتقّ التكلفة
-- **من السعر نفسه** حين تُترك فارغة، فتصير الأرضية تقيس الرقم بنفسه ولا تكشف
-- خسارةً أبداً. والقسم يُثبت ذلك عدديّاً بعد إثبات الرفض.
-- ----------------------------------------------------------------------------
do $$
declare
  v_name  constant text := 'عميل QC_TESTS_FIXTURE ب';
  v_when  constant timestamptz := now() + interval '12 days';
  v_class constant text := current_setting('tours.qc_class');
  v_id    uuid;
  v_res   record;
  v_hint  text;
  v_ok    boolean;
  v_derived record;
  v_real    record;
begin
  select * into v_res from public.create_quote_request(
    null, v_name, '01000000102', 'رحلة قياس ب',
    'ميدان التحرير', 30.0444, 31.2357, null, null, null, v_when, 4, 2);
  v_id := v_res.id;
  perform 1 from public.set_quote_request_status(v_id, 'quoted', 6000, null);

  -- (ب-١) بلا تكلفة ⇒ رفضٌ برمزٍ يسمّي السبب
  v_ok := false;
  begin
    perform 1 from public.convert_quote_request(v_id, v_class, null, 'الإسكندرية');
  exception when others then
    v_ok := true; get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if not v_ok or v_hint is distinct from 'cost-required' then
    raise exception '(ب-١) 🔴 تحويلٌ بلا أساس تكلفة قُبل (رُفض=% رمز=%)',
      v_ok, coalesce(v_hint, 'بلا');
  end if;

  -- (ب-٢) وسالبٌ كذلك
  v_ok := false;
  begin
    perform 1 from public.convert_quote_request(v_id, v_class, -100, 'الإسكندرية');
  exception when others then
    v_ok := true; get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if not v_ok or v_hint is distinct from 'cost-negative' then
    raise exception '(ب-٢) تكلفةٌ سالبة قُبلت (رُفض=% رمز=%)', v_ok, coalesce(v_hint, 'بلا');
  end if;

  -- (ب-٣) 🔴 **البرهان العددي**: التكلفة المشتقّة من السعر تُنتج أرضيةً يعبرها
  --       السعر دائماً، بينما التكلفة الحقيقية القريبة من السعر تُنتج أرضيةً
  --       يسقط دونها. فلو صار الحقل اختيارياً لصار الحاجز تجميلاً.
  select * into v_derived from public.discount_floor_room(6000, v_class, null);
  select * into v_real    from public.discount_floor_room(6000, v_class, 5900);

  if v_derived.room < 0 then
    raise exception
      '(ب-٣) التكلفة المشتقّة أعطت مساحةً سالبة (%) — تغيّرت سياسة الاشتقاق، أعد قراءة البرهان',
      v_derived.room;
  end if;
  if v_real.room >= 0 then
    raise exception
      '(ب-٣) 🔴 تكلفةٌ حقيقية % على سعر ٦٠٠٠ لم تُسقط الأرضية (مساحة %) — الأرضية لا تحرس',
      5900, v_real.room;
  end if;

  raise notice
    '✔ (ب) التكلفة مطلوبة: المشتقّة تعبر دائماً (مساحة %) والحقيقية ٥٩٠٠ تسقط (%)',
    v_derived.room, v_real.room;
end;
$$;

-- ----------------------------------------------------------------------------
-- (ج) اللقطة المجمَّدة والحجزُ الذي يُشبه كل حجز (D-10)
-- ----------------------------------------------------------------------------
do $$
declare
  v_name  constant text := 'عميل QC_TESTS_FIXTURE ج';
  v_when  constant timestamptz := now() + interval '15 days';
  v_class constant text := current_setting('tours.qc_class');
  v_cost  constant numeric := 4000;
  v_price constant numeric := 9000;
  v_id    uuid;
  v_res   record;
  v_b     record;
  v_q     record;
  v_n     integer;
begin
  select * into v_res from public.create_quote_request(
    null, v_name, '01000000103', 'ملاحظة العميل نفسها',
    'مطار القاهرة', 30.1148, 31.3504, 'شرم الشيخ', 27.9158, 34.3300, v_when, 4, 2);
  v_id := v_res.id;
  perform 1 from public.set_quote_request_status(v_id, 'quoted', v_price, 'ملاحظة داخلية سرّية');
  select * into v_res from public.convert_quote_request(v_id, v_class, v_cost, null);

  select * into v_b from public.bookings b where b.id = v_res.booking_id;

  -- (ج-١) اللقطة المالية كأي حجز
  if v_b.status <> 'pending_payment' then
    raise exception '(ج-١) الحجز نشأ بحالة «%» لا pending_payment', v_b.status;
  end if;
  if v_b.total <> v_price or v_b.amount_due <> v_price or v_b.amount_remaining <> 0 then
    raise exception '(ج-١) اللقطة المالية: إجمالي=% مستحق=% باقٍ=%',
      v_b.total, v_b.amount_due, v_b.amount_remaining;
  end if;
  if v_b.plan <> 'full' then
    raise exception '(ج-١) الخطة «%» — التحويل يُنشئ دفعاً كاملاً بقرارٍ مكتوب', v_b.plan;
  end if;
  if v_b.subcontractor_cost <> v_cost or v_b.margin_amount <> round(v_price - v_cost, 2) then
    raise exception '(ج-١) التكلفة % والهامش % — المتوقع % و%',
      v_b.subcontractor_cost, v_b.margin_amount, v_cost, round(v_price - v_cost, 2);
  end if;

  -- (ج-٢) 🔴 `price_source = 'subcontractor'` — وهو المفتاح الذي يجعل
  --       `dispatch_ceiling` تقرأ التكلفة المُدخلة بدل أن تشتقّها من سياسة
  --       الهامش. ولو صار `'tariff'` لرفع السقفَ فوق تكلفتنا وفاز متعهدٌ أغلى.
  if coalesce(v_b.price_source, '') <> 'subcontractor' then
    raise exception
      '(ج-٢) 🔴 مصدر السعر «%» — الاشتقاق الضمنيّ سيرفع سقف البثّ فوق التكلفة الحقيقية',
      coalesce(v_b.price_source, 'بلا');
  end if;
  if public.dispatch_ceiling(v_b.id, 1) <> v_cost then
    raise exception '(ج-٢) سقف الموجة ١ % ≠ التكلفة % — السقف لا يقرأ لقطتنا',
      public.dispatch_ceiling(v_b.id, 1), v_cost;
  end if;

  -- (ج-٣) لقطة الرحلة: مفاتيح `create_booking` نفسها، **وبلا سرّ**
  if v_b.trip ->> 'destLabel' is distinct from 'شرم الشيخ' then
    raise exception '(ج-٣) الوجهة لم تُورَّث من الطلب (%)', v_b.trip ->> 'destLabel';
  end if;
  if (v_b.trip ->> 'passengers')::integer <> 4 or (v_b.trip ->> 'luggage')::integer <> 2 then
    raise exception '(ج-٣) الركاب/الحقائب لم تُورَّث';
  end if;
  if v_b.trip ->> 'notes' is distinct from 'ملاحظة العميل نفسها' then
    raise exception '(ج-٣) ملاحظة العميل لم تُورَّث (%)', v_b.trip ->> 'notes';
  end if;
  if v_b.trip ->> 'quoteRequestRef' is distinct from (select q.reference from public.quote_requests q where q.id = v_id) then
    raise exception '(ج-٣) مرجع الطلب غائب من اللقطة';
  end if;
  if v_b.trip ->> 'priceOrigin' is distinct from 'quote-request' then
    raise exception '(ج-٣) أصل السعر غائب من اللقطة — التشغيل لا يعرف أنها تسعيرةٌ يدوية';
  end if;
  -- 🔒 ولا تكلفة ولا هامش ولا ملاحظة داخلية: اللقطة تخرج كاملةً إلى anon (D-19)
  if v_b.trip ? 'cost' or v_b.trip ? 'margin' or v_b.trip ? 'adminNote'
     or v_b.trip::text like '%ملاحظة داخلية سرّية%' then
    raise exception '(ج-٣) 🔴 اللقطة تحمل رقماً داخلياً أو ملاحظة إدارية — وهي تخرج إلى anon';
  end if;
  -- ومُشغّل رسوم الدفع عمل كما يعمل على كل حجز
  if not (v_b.trip ? 'paymentFees') then
    raise exception '(ج-٣) جدول رسوم الدفع لم يُجمَّد — المُشغّل لم يمرّ';
  end if;

  -- (ج-٤) الطلب مرتبطٌ ومختوم، والحالة «محوَّل»
  select * into v_q from public.quote_requests q where q.id = v_id;
  if v_q.status <> 'converted' or v_q.booking_id is distinct from v_b.id
     or v_q.converted_at is null or v_q.status_changed_at is null then
    raise exception '(ج-٤) الربط ناقص: حالة=% حجز=% ختم=%',
      v_q.status, coalesce(v_q.booking_id::text, 'بلا'), coalesce(v_q.converted_at::text, 'بلا');
  end if;
  -- والملاحظة الداخلية لم تُمحَ بتمرير null
  if v_q.admin_note is distinct from 'ملاحظة داخلية سرّية' then
    raise exception '(ج-٤) الملاحظة الداخلية مُحيت (%)', coalesce(v_q.admin_note, 'بلا');
  end if;

  -- (ج-٥) الحجز يسلك مسار كل حجز: سجلٌّ بأصله، وإشعارُ إنشاء، ومهلةُ كنس
  select count(*) into v_n from public.booking_events e
   where e.booking_id = v_b.id and e.note like '%' || v_q.reference || '%';
  if v_n <> 1 then
    raise exception '(ج-٥) سجل الحجز لا يذكر مرجع الطلب (وجدنا % صفاً)', v_n;
  end if;

  select count(*) into v_n from public.notifications n
   where n.event = 'booking_created' and n.payload ->> 'bookingId' = v_b.id::text;
  if v_n < 1 then
    raise exception '(ج-٥) لم يُطابر إشعار booking_created — التشغيل لا يعلم بالحجز';
  end if;

  if public.booking_hold_until(v_b.created_at, public.trip_pickup_at(v_b.trip)) is null then
    raise exception '(ج-٥) مهلة الكنس غير محسوبة — الحجز خارج مدار cancel_stale_bookings';
  end if;

  -- (ج-٦) 🔒 رابط الدفع ليس سطحاً جديداً: هو التوكن نفسه، والهاتف مقنَّع (0049)
  declare v_tok record;
  begin
    select * into v_tok from public.get_booking_by_token(v_b.public_token);
    if v_tok.reference is distinct from v_b.reference then
      raise exception '(ج-٦) توكن الحجز لا يفتح الحجز';
    end if;
    if v_tok.customer_phone = v_b.customer_phone then
      raise exception '(ج-٦) 🔴 الهاتف يخرج كاملاً في حمولة التوكن — والروابط تُعاد إرسالها';
    end if;
    if position('•' in coalesce(v_tok.customer_phone, '')) = 0 then
      raise exception '(ج-٦) الهاتف غير مقنَّع (%)', v_tok.customer_phone;
    end if;
  end;

  raise notice '✔ (ج) اللقطة مجمَّدة وبلا سرّ، والسقف يقرأ التكلفة، والرابط هو التوكن المقنَّع';
end;
$$;

-- ----------------------------------------------------------------------------
-- (د) العدائي — مرتين · حالةٌ خاطئة · فئةٌ لا تتسع · موعدٌ ماضٍ · بلا وجهة
-- ----------------------------------------------------------------------------
do $$
declare
  v_name  constant text := 'عميل QC_TESTS_FIXTURE د';
  v_when  constant timestamptz := now() + interval '20 days';
  v_class constant text := current_setting('tours.qc_class');
  v_id    uuid;
  v_id2   uuid;
  v_res   record;
  v_small text;
  v_hint  text;
  v_ok    boolean;
begin
  select * into v_res from public.create_quote_request(
    null, v_name, '01000000104', 'رحلة قياس د',
    'ميدان التحرير', 30.0444, 31.2357, null, null, null, v_when, 4, 2);
  v_id := v_res.id;

  -- (د-١) من «جديد» — التحويل يبدأ من «مسعَّر» وحدها
  v_ok := false;
  begin
    perform 1 from public.convert_quote_request(v_id, v_class, 3000, 'الإسكندرية');
  exception when others then
    v_ok := true; get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if not v_ok or v_hint is distinct from 'not-quoted' then
    raise exception '(د-١) طلبٌ «جديد» تحوّل (رُفض=% رمز=%)', v_ok, coalesce(v_hint, 'بلا');
  end if;

  perform 1 from public.set_quote_request_status(v_id, 'quoted', 9000, null);

  -- (د-٢) بلا وجهة — لا في الطلب ولا في النداء
  v_ok := false;
  begin
    perform 1 from public.convert_quote_request(v_id, v_class, 3000, null);
  exception when others then
    v_ok := true; get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if not v_ok or v_hint is distinct from 'destination-required' then
    raise exception '(د-٢) حجزٌ بلا وجهة نشأ (رُفض=% رمز=%)', v_ok, coalesce(v_hint, 'بلا');
  end if;

  -- (د-٣) فئةٌ لا تتسع — نفس شرطي الأهلية في quote_price (D-12)
  select vc.slug into v_small from public.vehicle_classes vc
   where vc.active and (vc.capacity < 4 or vc.luggage_capacity < 2)
   order by vc.capacity asc limit 1;

  if v_small is null then
    raise notice '  ↳ (د-٣) تخطٍّ: كل الفئات المفعَّلة تتسع لأربعة ركاب';
  else
    v_ok := false;
    begin
      perform 1 from public.convert_quote_request(v_id, v_small, 3000, 'الإسكندرية');
    exception when others then
      v_ok := true; get stacked diagnostics v_hint = pg_exception_hint;
    end;
    if not v_ok or v_hint is distinct from 'class-too-small' then
      raise exception '(د-٣) فئةٌ لا تتسع قُبلت (رُفض=% رمز=%)', v_ok, coalesce(v_hint, 'بلا');
    end if;
  end if;

  -- (د-٤) فئةٌ مجهولة
  v_ok := false;
  begin
    perform 1 from public.convert_quote_request(v_id, 'لا-وجود-لها', 3000, 'الإسكندرية');
  exception when others then
    v_ok := true; get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if not v_ok or v_hint is distinct from 'class-unknown' then
    raise exception '(د-٤) فئةٌ مجهولة قُبلت (رُفض=% رمز=%)', v_ok, coalesce(v_hint, 'بلا');
  end if;

  -- (د-٥) متعهدٌ لا وجود له
  v_ok := false;
  begin
    perform 1 from public.convert_quote_request(
      v_id, v_class, 3000, 'الإسكندرية', '00000000-0000-4000-8000-0000000000ff'::uuid);
  exception when others then
    v_ok := true; get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if not v_ok or v_hint is distinct from 'partner-not-found' then
    raise exception '(د-٥) متعهدٌ وهميّ قُبل (رُفض=% رمز=%)', v_ok, coalesce(v_hint, 'بلا');
  end if;

  -- (د-٦) 🔴 **مرتين**: التحويل المشروع ثم إعادته
  select * into v_res from public.convert_quote_request(v_id, v_class, 3000, 'الإسكندرية');
  if v_res.booking_id is null then
    raise exception '(د-٦) التحويل المشروع لم يُنتج حجزاً';
  end if;

  v_ok := false;
  begin
    perform 1 from public.convert_quote_request(v_id, v_class, 3000, 'الإسكندرية');
  exception when others then
    v_ok := true; get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if not v_ok or v_hint is distinct from 'already-converted' then
    raise exception
      '(د-٦) 🔴 التحويل مرتين مرّ (رُفض=% رمز=%) — حجزان يدّعيان الرحلة نفسها',
      v_ok, coalesce(v_hint, 'بلا');
  end if;

  -- (د-٧) وحجزٌ واحد لا يخدم طلبين — الفهرس الفريد يحرسه بنيوياً
  select * into v_res from public.create_quote_request(
    null, v_name, '01000000105', 'رحلة قياس د٧',
    'ميدان التحرير', 30.0444, 31.2357, null, null, null, v_when, 4, 2);
  v_id2 := v_res.id;
  perform 1 from public.set_quote_request_status(v_id2, 'quoted', 9000, null);

  v_ok := false;
  begin
    update public.quote_requests q
       set status = 'converted',
           booking_id = (select q2.booking_id from public.quote_requests q2 where q2.id = v_id)
     where q.id = v_id2;
  exception when others then v_ok := true;
  end;
  if not v_ok then
    raise exception '(د-٧) 🔴 حجزٌ واحد صار مرتبطاً بطلبين — الفهرس الفريد لا يحرس';
  end if;

  -- (د-٨) موعدٌ ماضٍ: الطلب يُنشأ بموعدٍ مستقبلي (تفرضه 0084) ثم يُزرع ماضياً،
  --       فالتحويل بعد أيامٍ من التسعير هو الحالة الواقعية لا المصطنعة.
  update public.quote_requests q set pickup_at = now() - interval '3 hours' where q.id = v_id2;
  v_ok := false;
  begin
    perform 1 from public.convert_quote_request(v_id2, v_class, 3000, 'الإسكندرية');
  exception when others then
    v_ok := true; get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if not v_ok or v_hint is distinct from 'pickup-past' then
    raise exception '(د-٨) موعدٌ ماضٍ تحوّل حجزاً (رُفض=% رمز=%)', v_ok, coalesce(v_hint, 'بلا');
  end if;

  raise notice '✔ (د) العدائي: مرتين · حالةٌ خاطئة · فئة · وجهة · متعهد · موعدٌ ماضٍ — كلها مرفوضة';
end;
$$;

-- ----------------------------------------------------------------------------
-- (هـ) 🔴 لا وسمَ تحويلٍ بلا حجز — الطرق الثلاثة كلها مسدودة
-- ----------------------------------------------------------------------------
do $$
declare
  v_name constant text := 'عميل QC_TESTS_FIXTURE هـ';
  v_when constant timestamptz := now() + interval '11 days';
  v_id   uuid;
  v_res  record;
  v_hint text;
  v_ok   boolean;
begin
  select * into v_res from public.create_quote_request(
    null, v_name, '01000000106', 'رحلة قياس هـ',
    'ميدان التحرير', 30.0444, 31.2357, null, null, null, v_when, 4, 2);
  v_id := v_res.id;
  perform 1 from public.set_quote_request_status(v_id, 'quoted', 7000, null);

  -- (هـ-١) الدالة القديمة تردّ «محوَّل» برمزٍ يسمّي الطريق
  v_ok := false;
  begin
    perform 1 from public.set_quote_request_status(v_id, 'converted', null, null);
  exception when others then
    v_ok := true; get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if not v_ok or v_hint is distinct from 'use-convert' then
    raise exception
      '(هـ-١) 🔴 set_quote_request_status وسمت الطلب «محوَّلاً» بلا حجز (رُفض=% رمز=%)',
      v_ok, coalesce(v_hint, 'بلا');
  end if;

  -- (هـ-٢) وتحديثٌ مباشر من PostgREST كذلك — القيد على الجدول لا في الدالة
  v_ok := false;
  begin
    update public.quote_requests q set status = 'converted' where q.id = v_id;
  exception when check_violation then v_ok := true; when others then v_ok := false;
  end;
  if not v_ok then
    raise exception
      '(هـ-٢) 🔴 تحديثٌ مباشر جعل الطلب «محوَّلاً» بلا حجز — الحاجز في الدالة وحدها';
  end if;

  -- (هـ-٣) والعكس: حجزٌ مرتبطٌ بطلبٍ حالته ليست «محوَّل» مرفوضٌ كذلك، وإلا صار
  --        الحجز غير مرئي في أي شاشة تُرشّح بالحالة
  v_ok := false;
  begin
    update public.quote_requests q
       set booking_id = (select b.id from public.bookings b
                          where b.customer_name like '%QC_TESTS_FIXTURE%' limit 1)
     where q.id = v_id;
  exception when others then v_ok := true;
  end;
  if not v_ok then
    raise exception '(هـ-٣) حجزٌ ارتبط بطلبٍ حالته «مسعَّر» — الاقتران أحاديّ لا ثنائي';
  end if;

  -- (هـ-٤) 🔒 والكتابة المباشرة إلى `bookings` مسحوبة — وهي الطبقة التي تجعل
  --        الأرضية غير قابلة للالتفاف: لا يوجد مسارٌ ثالث إلى صفِّ حجز.
  if has_table_privilege('anon', 'public.bookings', 'INSERT')
     or has_table_privilege('authenticated', 'public.bookings', 'INSERT') then
    raise exception
      '(هـ-٤) 🔴 يمكن إدراج حجزٍ مباشرةً — فتُتخطّى أرضية الهامش كلياً بنداء PostgREST';
  end if;
  if has_function_privilege('anon',
       'public.convert_quote_request(uuid, text, numeric, text, uuid, text)', 'EXECUTE') then
    raise exception '(هـ-٤) الزائر يستطيع تحويل طلبٍ إلى حجز';
  end if;

  raise notice '✔ (هـ) الطرق الثلاثة مسدودة: الدالة القديمة · التحديث المباشر · الإدراج المباشر';
end;
$$;

-- ----------------------------------------------------------------------------
-- (و) 🔴 D-20 — `authenticated` يشمل كل متعهّد، فلا يعني مشرفاً
-- ----------------------------------------------------------------------------
do $$
declare
  v_name  constant text := 'عميل QC_TESTS_FIXTURE و';
  v_when  constant timestamptz := now() + interval '13 days';
  v_class constant text := current_setting('tours.qc_class');
  v_admin constant text := current_setting('tours.qc_admin', true);
  v_other uuid := '0e0e0e0e-0e0e-4e0e-8e0e-0e0e0e0e0e0e'::uuid;
  v_id    uuid;
  v_res   record;
  v_hint  text;
  v_ok    boolean := false;
  v_made  boolean := false;
begin
  select * into v_res from public.create_quote_request(
    null, v_name, '01000000107', 'رحلة قياس و',
    'ميدان التحرير', 30.0444, 31.2357, null, null, null, v_when, 4, 2);
  v_id := v_res.id;
  perform 1 from public.set_quote_request_status(v_id, 'quoted', 9000, null);

  begin
    delete from auth.users u where u.id = v_other;
    insert into auth.users (id, email) values (v_other, 'qc-tests-partner@local.invalid');
    insert into public.profiles (id, role, full_name)
    values (v_other, 'subcontractor', 'متعهّد اختبار مؤقت')
    on conflict (id) do update set role = 'subcontractor';
    v_made := true;
  exception when others then
    raise notice '  ↳ (و) تعذّر إنشاء هوية المتعهّد: %', sqlerrm;
  end;

  -- ⚠ ولا سقوطَ إلى «هوية فارغة»: تلك حالة الضيف وتُرفض لسببٍ آخر، فتعطي ملفاً
  --   أخضر لا يفحص D-20 إطلاقاً.
  if not v_made then
    raise exception '(و) تعذّر إنشاء هوية متعهّد — ولا يُفحص D-20 بهوية فارغة';
  end if;

  perform set_config('request.jwt.claim.sub', v_other::text, true);
  if public.is_admin() then
    raise exception '(و-٠) الهوية البديلة تُعدّ مشرفاً — الفحص بلا معنى';
  end if;

  begin
    perform 1 from public.convert_quote_request(v_id, v_class, 100, 'الإسكندرية');
  exception when others then
    v_ok := true; get stacked diagnostics v_hint = pg_exception_hint;
  end;

  -- تُستعاد هوية المشرف **قبل الحكم**
  perform set_config('request.jwt.claim.sub', coalesce(v_admin, ''), true);
  delete from public.profiles p where p.id = v_other;
  delete from auth.users    u where u.id = v_other;

  if not v_ok or v_hint is distinct from 'forbidden' then
    raise exception
      '(و) 🔴 متعهّدٌ من الباطن أنشأ حجزاً بسعرٍ يدويّ (رُفض=% رمز=%) — D-20 مكسورة',
      v_ok, coalesce(v_hint, 'بلا');
  end if;

  raise notice '✔ (و) D-20: هويةٌ مصدَّقة غير مشرفة لا تُحوّل ولا تُنشئ حجزاً';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ز) الدفع مرتين — والكنس والتحويل متفقان
--
-- «الدفع مرتين» على حجزٍ محوَّل هو نفسه على أي حجز: آلة الحالات في
-- `booking_transition_allowed` لا تسمح بـ`confirmed ← confirmed` ولا بالرجوع
-- إلى `pending_payment`، وإحكام الويبهوك بمعرّف الحدث (D-29) مُختبرٌ في
-- `payment_tests.sql` ولا يُستنسخ هنا (القاعدة ١٢).
-- ----------------------------------------------------------------------------
do $$
declare
  v_name  constant text := 'عميل QC_TESTS_FIXTURE ز';
  v_when  constant timestamptz := now() + interval '9 days';
  v_class constant text := current_setting('tours.qc_class');
  v_id    uuid;
  v_res   record;
  v_b     uuid;
  v_q     record;
  v_ok    boolean;
  v_hint  text;
begin
  select * into v_res from public.create_quote_request(
    null, v_name, '01000000108', 'رحلة قياس ز',
    'ميدان التحرير', 30.0444, 31.2357, null, null, null, v_when, 4, 2);
  v_id := v_res.id;
  perform 1 from public.set_quote_request_status(v_id, 'quoted', 9000, null);
  select * into v_res from public.convert_quote_request(v_id, v_class, 3000, 'الإسكندرية');
  v_b := v_res.booking_id;

  -- (ز-١) المسار المشروع إلى التأكيد
  update public.bookings b set status = 'under_review' where b.id = v_b;
  update public.bookings b set status = 'confirmed'    where b.id = v_b;

  -- (ز-٢) والرجوع إلى «بانتظار الدفع» ممنوع — فلا يُدفع الحجز مرتين
  v_ok := false;
  begin
    update public.bookings b set status = 'pending_payment' where b.id = v_b;
  exception when others then
    v_ok := true; get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if not v_ok or v_hint is distinct from 'illegal-transition' then
    raise exception '(ز-٢) حجزٌ مؤكَّد رجع إلى «بانتظار الدفع» (رُفض=% رمز=%)',
      v_ok, coalesce(v_hint, 'بلا');
  end if;

  -- (ز-٣) والطلب لا يتغيّر بما يجري للحجز — «محوَّل» نهائية
  update public.bookings b set status = 'cancelled' where b.id = v_b;
  select * into v_q from public.quote_requests q where q.id = v_id;
  if v_q.status <> 'converted' or v_q.booking_id is distinct from v_b then
    raise exception
      '(ز-٣) إلغاء الحجز غيّر الطلب (حالة=% حجز=%) — والطلب لا يعود «مسعَّراً» أبداً',
      v_q.status, coalesce(v_q.booking_id::text, 'بلا');
  end if;

  raise notice '✔ (ز) الحجز المحوَّل يخضع لآلة الحالات، و«محوَّل» لا تعود بإلغاء حجزها';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ح) 🧬 **طفرتان** — والاختبار الذي لا يفشل حين يُنزع حارسه ليس اختباراً
--
-- ادّعاءان هما عصب هذه المرحلة، وكلٌّ منهما يُقتلع هنا ويُطلَب من تأكيده أن
-- **يفشل**. والاستعادة من التعريف الحيّ المُلتقط قبل الطفرة (D-58) لا من نسخةٍ
-- مكتوبة هنا، و**قبل الحكم** دائماً — فتشخيصٌ فاشل لا يجوز أن يترك القاعدة
-- مطفَّرة.
-- ----------------------------------------------------------------------------
-- ⚠ وأربعة طلباتٍ لا طلبٌ واحد، والسبب بنيويّ لا احتياطيّ: «محوَّل» **نهائية**
--   في آلة 0084، فلا يمكن إرجاع صفٍّ عبَرَ الطفرةَ إلى «مسعَّر» ليُعاد استعماله.
--   وإعادةُ استعماله بالقوة كانت ستحتاج نزع آلة الحالات أيضاً — أي طفرةً ثالثة
--   لا تخصّ ما نقيس، ونتيجةً تُقاس على أرضٍ مطفَّرة مرتين.
do $$
declare
  v_name   constant text := 'عميل QC_TESTS_FIXTURE ح';
  v_when   constant timestamptz := now() + interval '17 days';
  v_class  constant text := current_setting('tours.qc_class');
  v_cost   constant numeric := 5000;
  v_res    record;
  v_floor  record;
  v_origin text;
  v_def    text;
  v_caught boolean;
  v_ok     boolean;
  v_price  numeric;
  v_a      uuid;   -- تُطفَّر عليها الأرضية
  v_b      uuid;   -- يُتحقَّق بها من الاستعادة
  v_c      uuid;   -- يُطفَّر عليها قيد الاقتران
  v_d      uuid;   -- يُتحقَّق بها من استعادة القيد
begin
  select * into v_floor from public.discount_floor_room(999999, v_class, v_cost);
  v_price := v_floor.min_total - 1;

  select * into v_res from public.create_quote_request(
    null, v_name, '01000000109', 'ح-أ',
    'ميدان التحرير', 30.0444, 31.2357, null, null, null, v_when, 4, 2);
  v_a := v_res.id;
  perform 1 from public.set_quote_request_status(v_a, 'quoted', v_price, null);

  select * into v_res from public.create_quote_request(
    null, v_name, '01000000110', 'ح-ب',
    'ميدان التحرير', 30.0444, 31.2357, null, null, null, v_when, 4, 2);
  v_b := v_res.id;
  perform 1 from public.set_quote_request_status(v_b, 'quoted', v_price, null);

  -- ══ (ح-١) 🔴 طفرة أرضية الهامش: تُنزَع الأرضية من `discount_floor_room`
  --          (تُرجع صفراً) فيصير (أ-١) كاذباً. وهذه هي الطفرة الأهم في الملف:
  --          الأرضية هي الحاجز **الوحيد** بين سعرٍ يدويّ وبيعٍ بخسارة.
  select pg_get_functiondef('public.discount_floor_room(numeric,text,numeric)'::regprocedure)
    into v_origin;

  execute $mut$
    create or replace function public.discount_floor_room(
      p_total numeric, p_class_slug text, p_partner_cost numeric)
    returns table (min_total numeric, room numeric)
    language plpgsql stable security definer set search_path = ''
    as $body$
    begin
      min_total := 0;
      room      := floor(coalesce(p_total, 0));
      return next;
    end;
    $body$;
  $mut$;

  v_caught := false;
  begin
    perform 1 from public.convert_quote_request(v_a, v_class, v_cost, 'الإسكندرية');
    v_caught := true;   -- مرّ ⇒ الطفرة أُمسكت (والتأكيد كان يحرس فعلاً)
  exception when others then
    v_caught := false;
  end;

  -- الاستعادة **قبل الحكم**: تشخيصٌ فاشل لا يجوز أن يترك القاعدة مطفَّرة
  execute v_origin;

  if not v_caught then
    raise exception
      '(ح-١) 🔴 نُزعت أرضية الهامش وبقي التأكيد أخضر — أي أن (أ-١) لا يحرس مالاً';
  end if;

  -- وبعد الاستعادة يعود الرفض — على صفٍّ **لم تمسّه** الطفرة
  v_ok := false;
  begin
    perform 1 from public.convert_quote_request(v_b, v_class, v_cost, 'الإسكندرية');
  exception when others then v_ok := true;
  end;
  if not v_ok then
    raise exception '(ح-١) لم تُستعَد الأرضية — القاعدة باقية على الطفرة';
  end if;

  -- ══ (ح-٢) طفرة قيد الاقتران: يُسقَط، فيصير (هـ-٢) كاذباً ═══════════════
  select * into v_res from public.create_quote_request(
    null, v_name, '01000000111', 'ح-ج',
    'ميدان التحرير', 30.0444, 31.2357, null, null, null, v_when, 4, 2);
  v_c := v_res.id;
  perform 1 from public.set_quote_request_status(v_c, 'quoted', 9000, null);

  select * into v_res from public.create_quote_request(
    null, v_name, '01000000112', 'ح-د',
    'ميدان التحرير', 30.0444, 31.2357, null, null, null, v_when, 4, 2);
  v_d := v_res.id;
  perform 1 from public.set_quote_request_status(v_d, 'quoted', 9000, null);

  select pg_get_constraintdef(oid) into v_def
    from pg_constraint where conrelid = 'public.quote_requests'::regclass
     and conname = 'quote_requests_converted_needs_booking_chk';
  if v_def is null then
    raise exception '(ح-٢) قيد الاقتران غير موجود أصلاً';
  end if;

  execute 'alter table public.quote_requests drop constraint quote_requests_converted_needs_booking_chk';

  v_caught := false;
  begin
    update public.quote_requests q set status = 'converted' where q.id = v_c;
    v_caught := true;
  exception when others then
    v_caught := false;
  end;

  -- ⚠ يُحذف الصفّ المطفَّر لا تُعاد حالته: «محوَّل ← مسعَّر» يرفضه مُشغّل 0084،
  --   والحذف ليس انتقالاً فلا يوقظه — وبقاؤه «محوَّلاً» بلا حجز كان سيرفضه
  --   القيدُ لحظةَ ردّه.
  delete from public.quote_requests q where q.id = v_c;

  execute format('alter table public.quote_requests add constraint %I %s',
                 'quote_requests_converted_needs_booking_chk', v_def);

  if not v_caught then
    raise exception
      '(ح-٢) 🔴 أُسقط قيد الاقتران وبقي التأكيد أخضر — أي أن (هـ-٢) لا يحرس شيئاً';
  end if;

  v_ok := false;
  begin
    update public.quote_requests q set status = 'converted' where q.id = v_d;
  exception when check_violation then v_ok := true; when others then v_ok := false;
  end;
  if not v_ok then
    raise exception '(ح-٢) لم يُستعَد قيد الاقتران — القاعدة باقية على الطفرة';
  end if;

  raise notice '✔ (ح) الطفرتان أُمسكتا: أرضية الهامش وقيد الاقتران — ثم استُعيدتا';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ط) الأرضية **تُنادى فعلاً** — حارسٌ بنيويّ على جسم الدالة (D-58)
--
-- ولماذا هذا فوق (ح): الطفرة تُثبت أن الحاجز حيٌّ **اليوم**، وهذا يُثبت أن
-- نداءه لم يُحذف من الجسم في «تبسيطٍ» قادم — وهما ادّعاءان مختلفان.
-- ----------------------------------------------------------------------------
do $$
declare
  v_def text;
begin
  v_def := pg_get_functiondef(
    to_regprocedure('public.convert_quote_request(uuid,text,numeric,text,uuid,text)')::oid);

  if position('discount_floor_room' in v_def) = 0 then
    raise exception '(ط-١) 🔴 جسم التحويل لا ينادي discount_floor_room';
  end if;
  if position('cost-required' in v_def) = 0 then
    raise exception '(ط-٢) 🔴 أساس التكلفة صار اختيارياً — الأرضية تقيس السعر بنفسه';
  end if;
  if position('is_admin' in v_def) = 0 then
    raise exception '(ط-٣) 🔴 حارس المشرف غائب من الجسم — D-20';
  end if;
  if position('for update' in v_def) = 0 then
    raise exception '(ط-٤) قفل الصف غائب — موظفان يحوّلان الطلب نفسه فينشأ حجزان';
  end if;

  -- و`dispatch_ceiling` ما زالت تشتقّ اشتقاق 0014 لمسار التعريفة (انحدار D-58)
  v_def := pg_get_functiondef(to_regprocedure('public.dispatch_ceiling(uuid,integer)')::oid);
  if position('margin_type' in v_def) = 0 then
    raise exception '(ط-٥) 🔴 dispatch_ceiling فقدت اشتقاق 0014 — انحدارُ D-58 عاد';
  end if;

  raise notice '✔ (ط) الجسم يحمل حارسيه ونداء الأرضية، وسقف البثّ لم ينحدر';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ك) 🔴🔴 `NaN` — القيمة التي تعبر **كل** فحصٍ من طرفٍ واحد (0108)
--
-- ══════════════════════════════════════════════════════════════════════════
--  ماذا يثبت هذا القسم فعلاً — والسؤال مطروحٌ على كل تأكيدٍ فيه
-- ══════════════════════════════════════════════════════════════════════════
--
-- قِيس في 2026-08-18: نداءٌ واحد لـ`convert_quote_request` بـ`p_partner_cost`
-- = `'NaN'` **كتب حجزاً** (‏`total = 8500` · `subcontractor_cost = NaN` ·
-- `margin_amount = NaN`). ولم يُنقَض حاجزٌ ولا سقط فحص — بل صدَقت كلُّها:
--
--   `NaN > 0` ⇒ true · `NaN < 0` ⇒ false · `greatest(NaN,0)` ⇒ NaN ·
--   `round(NaN,2)` ⇒ NaN · وقيدا الجدول `>= 0` ⇒ true
--
-- ⇒ أرضية الهامش (D-16) — الحاجز الوحيد أمام السعر اليدوي — قاست NaN بنفسها
--   ووجدتها كافية. **فالفحص من طرفٍ واحد ليس حاجزاً أمام NaN إطلاقاً.**
--
-- والقسم يفحص أربعة ادّعاءات مستقلة:
--   (ك-١) الدالة ترفض التكلفة غير المنتهية برمزٍ تترجمه الشاشة، **ولا تكتب صفّاً**
--   (ك-٢) والتحويل المشروع ما زال يمرّ بأرقامٍ صحيحة — الحاجز ليس جداراً على العمل
--   (ك-٣) والقاعدة ترفضها **من كل بابٍ آخر** حتى بلا مرور بالدالة (0108 §٢)
--   (ك-٤) و**كل** عمود `numeric` في `public` يحمل قيده — فعمودٌ يُضاف غداً بلا
--         حارس يُسقط هذه المجموعة، لا يُكتشف بعد أن يقع
-- ----------------------------------------------------------------------------
do $$
declare
  v_name  constant text := 'عميل QC_TESTS_FIXTURE ك';
  v_when  constant timestamptz := now() + interval '15 days';
  v_class constant text := current_setting('tours.qc_class');
  v_price constant numeric := 9000;
  v_cost  constant numeric := 5000;
  v_id    uuid;
  v_res   record;
  v_hint  text;
  v_ok    boolean;
  v_n0    integer;
  v_n1    integer;
  v_val   text;
  v_miss  text;
  v_cnt   integer;
begin
  select count(*) into v_n0 from public.bookings b where b.customer_name = v_name;

  select * into v_res from public.create_quote_request(
    null, v_name, '01000000111', 'رحلة قياس ك',
    'ميدان التحرير', 30.0444, 31.2357, null, null, null, v_when, 4, 2);
  v_id := v_res.id;
  perform 1 from public.set_quote_request_status(v_id, 'quoted', v_price, null);

  -- ── (ك-١) التكلفة غير المنتهية تُرفض — والثلاث قيمٍ برمزٍ واحدٍ مفهوم ──────
  --
  -- ⚠ ولماذا تُفحص `Infinity` و`-Infinity` مع `NaN` وقد كانتا مرفوضتين سلفاً:
  --   لأنهما كانتا تُرفضان **بالمصادفة** لا بالقصد — `Infinity` عبر `below-floor`
  --   و`-Infinity` عبر `cost-negative`. والاعتماد على مصادفةٍ في مسارٍ مالي هو
  --   بعينه ما ترك `NaN` مفتوحاً بينهما.
  foreach v_val in array array['NaN', 'Infinity', '-Infinity']
  loop
    v_ok := false; v_hint := null;
    begin
      perform 1 from public.convert_quote_request(v_id, v_class, v_val::numeric, 'الإسكندرية');
    exception when others then
      v_ok := true; get stacked diagnostics v_hint = pg_exception_hint;
    end;
    if not v_ok then
      raise exception
        '(ك-١) 🔴 تكلفة «%» مرّت وكتبت حجزاً — أرضية الهامش (D-16) تُقاس بقيمةٍ ليست رقماً', v_val;
    end if;
    if v_hint is distinct from 'cost-not-finite' then
      raise exception
        '(ك-١) تكلفة «%» رُفضت برمز «%» لا «cost-not-finite» — الشاشة لن تعرف ماذا تقول',
        v_val, coalesce(v_hint, 'بلا');
    end if;
  end loop;

  -- ولا صفَّ خُلق من المحاولات الثلاث: الرفض قبل الإدراج لا بعده
  select count(*) into v_n1 from public.bookings b where b.customer_name = v_name;
  if v_n1 <> v_n0 then
    raise exception '(ك-١) 🔴 خُلق % حجزاً من محاولاتٍ مرفوضة', v_n1 - v_n0;
  end if;

  -- ── (ك-٢) والتحويل المشروع يمرّ — والأرقام مُشتقّة لا محفورة ──────────────
  select * into v_res
  from public.convert_quote_request(v_id, v_class, v_cost, 'الإسكندرية');

  if v_res.booking_id is null then
    raise exception '(ك-٢) 🔴 حارس «رقمٌ حقيقي» منع تحويلاً مشروعاً — حاجزٌ صار جداراً';
  end if;
  if v_res.total <> v_price or v_res.margin_amount <> (v_price - v_cost) then
    raise exception '(ك-٢) إجمالي/هامش الحجز % و% ≠ % و%',
      v_res.total, v_res.margin_amount, v_price, v_price - v_cost;
  end if;

  -- والقيم على القرص أرقامٌ حقيقية — لا NaN تسلّلت من طريقٍ آخر
  select count(*) into v_cnt
    from public.bookings b
   where b.id = v_res.booking_id
     and b.total              > '-Infinity'::numeric and b.total              < 'Infinity'::numeric
     and b.subcontractor_cost > '-Infinity'::numeric and b.subcontractor_cost < 'Infinity'::numeric
     and b.margin_amount      > '-Infinity'::numeric and b.margin_amount      < 'Infinity'::numeric;
  if v_cnt <> 1 then
    raise exception '(ك-٢) 🔴 صفُّ الحجز يحمل قيمةً غير منتهية بعد تحويلٍ مشروع';
  end if;

  -- ── (ك-٣) والباب مغلقٌ حتى بلا الدالة — القيد على العمود (0108 §٢) ────────
  --
  -- 🔒 وهذا هو الفرق بين «أُصلحت الدالة» و«أُغلق الصنف»: محرِّرُ SQL وحاملُ
  --    مفتاح الخدمة وأيُّ دالةٍ تُكتب غداً كلُّهم يمرّون من هنا.
  v_ok := false;
  begin
    update public.bookings b set subcontractor_cost = 'NaN'::numeric where b.id = v_res.booking_id;
  exception when check_violation then v_ok := true; when others then v_ok := false;
  end;
  if not v_ok then
    raise exception '(ك-٣) 🔴 كتابةٌ مباشرة بـNaN في bookings.subcontractor_cost نجحت';
  end if;

  v_ok := false;
  begin
    update public.quote_requests q set quoted_amount = 'NaN'::numeric where q.id = v_id;
  exception when check_violation then v_ok := true; when others then v_ok := false;
  end;
  if not v_ok then
    raise exception '(ك-٣) 🔴 كتابةٌ مباشرة بـNaN في quote_requests.quoted_amount نجحت';
  end if;

  -- والدفتر — قيدٌ واحدٌ بـNaN يجعل رصيد الخزينة NaN إلى الأبد وهو append-only
  v_ok := false;
  begin
    insert into public.ledger_entries (account_id, direction, amount, source_type, occurred_at)
    values (null, 'in', 'NaN'::numeric, 'adjustment', now());
  exception when check_violation then v_ok := true; when others then v_ok := false;
  end;
  if not v_ok then
    raise exception '(ك-٣) 🔴 قيدٌ بـNaN دخل ledger_entries — الرصيد كلُّه NaN ولا يُحذف';
  end if;

  -- ── (ك-٤) التغطية: عمودٌ رقميّ جديد بلا حارس **يُسقط هذه المجموعة** ───────
  select string_agg(t.tbl || '.' || t.col, ' · '), count(*) into v_miss, v_cnt
  from (
    select c.relname as tbl, a.attname as col
      from pg_attribute a
      join pg_class c on c.oid = a.attrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r'
       and a.attnum > 0 and not a.attisdropped
       and a.atttypid = 'numeric'::regtype
       and not exists (
         select 1 from pg_constraint k
          where k.conrelid = c.oid
            and k.conname = c.relname || '_' || a.attname || '_finite_chk')
  ) t;
  if coalesce(v_cnt, 0) > 0 then
    raise exception
      '(ك-٤) 🔴 % عموداً رقمياً بلا قيد «رقمٌ حقيقي» — أضِف القيد في هجرةٍ جديدة: %',
      v_cnt, v_miss;
  end if;

  -- وحارسا الجسم قائمان (D-58): لا يكفي أن يعمل اليوم، بل ألّا يُحذف غداً
  if position('cost-not-finite' in pg_get_functiondef(
       to_regprocedure('public.convert_quote_request(uuid,text,numeric,text,uuid,text)')::oid)) = 0 then
    raise exception '(ك-٤) 🔴 حارس «التكلفة رقمٌ حقيقي» اختفى من جسم التحويل';
  end if;
  if position('amount-not-finite' in pg_get_functiondef(
       to_regprocedure('public.convert_quote_request(uuid,text,numeric,text,uuid,text)')::oid)) = 0 then
    raise exception '(ك-٤) 🔴 حارس «التسعيرة رقمٌ حقيقي» اختفى من جسم التحويل';
  end if;

  raise notice '✔ (ك) NaN و±Infinity مرفوضةٌ برمزٍ مفهوم، والمشروع يمرّ، والقيد يغلق كل باب';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ل) 🧬 **طفرةٌ ثالثة** — يُعاد الجسم إلى ما كان عليه قبل 0108، ويجب أن يفشل
--
-- والسبب مكتوبٌ في LESSONS.md النمط ٩: تأكيدٌ لا يحمرّ حين يُنزع حارسه ليس
-- تأكيداً. و(ك) كلُّه يقف على ادّعاءٍ واحد — «NaN لا تعبر» — فإن كان يمرّ
-- أخضرَ على الجسم **القديم** أيضاً، فهو زينة.
--
-- ⚠ والطفرة تُنزع الطبقتين معاً: الحارس في الجسم **والقيد على العمود**. نزعُ
--   إحداهما وحدها يترك الأخرى تمسك، فلا نتعلّم أيَّهما يحرس فعلاً.
--
-- 🔒 والاستعادة **قبل الحكم** لا بعده — على سابقة (ح): `raise` بعد الاستعادة
--   يُرجع كل شيء بحكم المعاملة، أمّا `raise` قبلها فيترك القاعدة على الطفرة لو
--   شُغّل الملف خارج معاملة يوماً.
-- ----------------------------------------------------------------------------
do $$
declare
  v_name  constant text := 'عميل QC_TESTS_FIXTURE ل';
  v_when  constant timestamptz := now() + interval '16 days';
  v_class constant text := current_setting('tours.qc_class');
  v_id    uuid;
  v_res   record;
  v_def   text;
  v_mut   text;
  v_cost  numeric;
  v_marg  numeric;
  v_leak  boolean := false;
begin
  v_def := pg_get_functiondef(
    to_regprocedure('public.convert_quote_request(uuid,text,numeric,text,uuid,text)')::oid);

  -- الطفرة: يُخرَّس شرط الحارس بلا لمس أي سطرٍ آخر — مرساةٌ قصيرة لا تعتمد
  -- على المسافات، فتبقى صالحةً لو أُعيد تنسيق الجسم.
  v_mut := replace(v_def, 'if not (p_partner_cost >', 'if false and not (p_partner_cost >');
  if v_mut = v_def then
    raise exception '(ل-٠) لم أجد الحارس في الجسم لأطفّره — راجع نص 0108 §٣';
  end if;
  execute v_mut;

  alter table public.bookings drop constraint bookings_subcontractor_cost_finite_chk;
  alter table public.bookings drop constraint bookings_margin_amount_finite_chk;

  select * into v_res from public.create_quote_request(
    null, v_name, '01000000112', 'رحلة قياس ل',
    'ميدان التحرير', 30.0444, 31.2357, null, null, null, v_when, 4, 2);
  v_id := v_res.id;
  perform 1 from public.set_quote_request_status(v_id, 'quoted', 9000, null);

  begin
    select * into v_res from public.convert_quote_request(v_id, v_class, 'NaN'::numeric, 'الإسكندرية');
    -- 🔴 هذا هو العيب الأصلي وقد عاد: حجزٌ بتكلفةٍ وهامشٍ ليسا رقمين
    select b.subcontractor_cost, b.margin_amount into v_cost, v_marg
      from public.bookings b where b.id = v_res.booking_id;
    v_leak := (v_cost is not null and not (v_cost > '-Infinity'::numeric and v_cost < 'Infinity'::numeric))
           or (v_marg is not null and not (v_marg > '-Infinity'::numeric and v_marg < 'Infinity'::numeric));
    -- ⚠ يُحذف الصفّان: «محوَّل ← مسعَّر» يرفضه مُشغّل 0084، والحذف ليس انتقالاً
    delete from public.quote_requests q where q.id = v_id;
    delete from public.bookings      b where b.id = v_res.booking_id;
  exception when others then
    v_leak := false;
    delete from public.quote_requests q where q.id = v_id;
  end;

  -- ── الاستعادة **قبل الحكم** ─────────────────────────────────────────────
  execute v_def;
  alter table public.bookings
    add constraint bookings_subcontractor_cost_finite_chk
    check (subcontractor_cost is null
           or (subcontractor_cost > '-Infinity'::numeric and subcontractor_cost < 'Infinity'::numeric));
  alter table public.bookings
    add constraint bookings_margin_amount_finite_chk
    check (margin_amount is null
           or (margin_amount > '-Infinity'::numeric and margin_amount < 'Infinity'::numeric));

  if not v_leak then
    raise exception
      '(ل) 🔴 نُزع حارس 0108 والقيدان معاً وبقي (ك) أخضر — أي أن (ك) لا يحرس شيئاً';
  end if;

  -- وبعد الاستعادة يعود الباب مغلقاً — وإلّا فالاستعادة نفسها كاذبة
  select * into v_res from public.create_quote_request(
    null, v_name, '01000000113', 'رحلة قياس ل-٢',
    'ميدان التحرير', 30.0444, 31.2357, null, null, null, v_when, 4, 2);
  v_id := v_res.id;
  perform 1 from public.set_quote_request_status(v_id, 'quoted', 9000, null);
  v_leak := false;
  begin
    perform 1 from public.convert_quote_request(v_id, v_class, 'NaN'::numeric, 'الإسكندرية');
    v_leak := true;
  exception when others then v_leak := false;
  end;
  if v_leak then
    raise exception '(ل) 🔴 لم يُستعَد الحارس — القاعدة باقية على الطفرة';
  end if;

  raise notice '✔ (ل) الطفرة أُمسكت: بلا حارس 0108 يعود NaN إلى الحجز — ثم استُعيدت الطبقتان';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ي) التنظيف — والترتيب مقصود: طلبات ← حجوزات (‏`on delete restrict`)
-- ----------------------------------------------------------------------------
do $$
declare
  v_left integer;
begin
  delete from public.notifications n where n.payload ->> 'customerName' like '%QC_TESTS_FIXTURE%';
  delete from public.quote_requests q where q.customer_name like '%QC_TESTS_FIXTURE%';
  delete from public.bookings      b where b.customer_name like '%QC_TESTS_FIXTURE%';

  select count(*) into v_left from public.quote_requests q
   where q.customer_name like '%QC_TESTS_FIXTURE%';
  if v_left <> 0 then
    raise exception '(ي) بقيت % من طلبات الاختبار بعد التنظيف', v_left;
  end if;

  select count(*) into v_left from public.bookings b
   where b.customer_name like '%QC_TESTS_FIXTURE%';
  if v_left <> 0 then
    raise exception '(ي) بقيت % من حجوزات الاختبار بعد التنظيف', v_left;
  end if;

  select count(*) into v_left from public.notifications n
   where n.payload ->> 'customerName' like '%QC_TESTS_FIXTURE%';
  if v_left <> 0 then
    raise exception '(ي) بقيت % من إشعارات الاختبار بعد التنظيف', v_left;
  end if;

  if coalesce(current_setting('tours.qc_admin_fixture', true), '0') = '1' then
    delete from public.profiles p where p.id = current_setting('tours.qc_admin')::uuid;
    delete from auth.users    u where u.id = current_setting('tours.qc_admin')::uuid;
    raise notice '  ↳ حُذف المشرف المؤقت';
  end if;

  perform set_config('tours.qc_admin', '', false);
  perform set_config('tours.qc_admin_fixture', '', false);
  perform set_config('tours.qc_class', '', false);
  perform set_config('tours.qc_min_price', '', false);
  perform set_config('request.jwt.claim.sub', '', true);

  raise notice '✔ (ي) التنظيف تم — لا طلبات ولا حجوزات ولا إشعارات ولا هوية متبقية';
end;
$$;

-- ----------------------------------------------------------------------------
-- الخلاصة
-- ----------------------------------------------------------------------------
do $$
begin
  raise notice 'ALL PASSED — السعر اليدوي يصير حجزاً، وأرضية الهامش تحرسه، والطفرتان أُمسكتا';
end;
$$;
