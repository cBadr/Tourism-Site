-- ============================================================================
-- audit_tests.sql — اختبارات قبول لنظام السجلات
--                   (الدفعة ٤ — الملاحظة ١٥: هجرة 0036_audit_log.sql)
--
-- كيف تشغّله: `pnpm db:test audit` أو الصق الملف كاملاً في SQL Editor واضغط Run.
-- النجاح = آخر سطر «ALL PASSED». أي فشل يرمي exception برسالة عربية تحدد
-- الاختبار والقيمة المتوقعة والفعلية.
--
-- ومن psql بدور صاحب القاعدة **لا بد** من ON_ERROR_STOP و‑1 معاً:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f supabase/tests/audit_tests.sql
--
-- ── الحاجز الأول: (ح) و(ط) — السجل أخطر سطح قراءة في المشروع كله ──────────
--
-- `audit_log` يجمع في جدول واحد ما كان موزّعاً على ثلاثين جدولاً: تغيّرات
-- الحجوزات والدفعات والدفتر وقوائم أسعار المتعهدين وإعدادات التسعير. فمنحةٌ
-- خاطئة واحدة عليه تسلّم **كل متعهد** تاريخَ المنصة كاملاً — وكل متعهد
-- `authenticated` (النمط ١ في LESSONS.md). ولذلك يُختبر المنع **بنداء حيّ
-- بهوية متعهد حقيقي** لا بقراءة منحة.
--
-- ── الحاجز الثاني: (ب) الأسرار لا تُنسخ ────────────────────────────────────
--
-- مُشغّلٌ ساذج كان سيجمع المفاتيح والهواتف والتوكنات في السجل، فيصير أغنى هدف
-- في القاعدة. و«الحدث يُسجَّل والقيمة الحساسة تُسجَّل أنها تغيّرت» ليست تفضيلاً
-- بل شرط بقاء. ويُختبر بشاهد **إيجابي أولاً** (الحجب لا يبتلع العمود العادي)
-- ثم سلبي — وإلا كان فحصاً لا يمكن أن يفشل (النمط ٩).
--
-- ── الحاجز الثالث: (د) السجل لا يمتلئ ضجيجاً ──────────────────────────────
--
-- `touch_updated_at` مربوط بستة عشر جدولاً، فكل `UPDATE` يغيّر `updated_at`
-- حتماً. ولولا استثناؤه لكان كل حفظٍ بلا تغيير ينتج صفاً يقول «تغيّر
-- updated_at» — سجلٌّ يمتلئ بما لا يعني شيئاً هو سجلٌّ لا يُقرأ.
--
-- ── الحاجز الرابع: (و) أرضية التقليم تُقاس بشاهدٍ لا بعدّاد ────────────────
--
-- التقليم هو المسار **الوحيد** الذي يُحذف به من سجلٍّ append-only، فأرضيته
-- (سنةٌ كاملة مهما طُلب أقل) آخر ما يفصل بين «تنظيفٍ» و«محوِ الدليل». وتُقاس
-- بصفَّين مزروعين بعمرين يفصلان بين النجاة والمحو — لا بعدّادٍ يمرّ على سجلٍّ
-- فارغ (النمط ٩، والقاعدة الذهبية ١٥).
--
-- ── لماذا لا يلمس هذا الملف بيانات حقيقية ──────────────────────────────────
--   • كل الفيكسترة بوسم `AUDIT_TESTS` أو `zz-audit-` وتُمسح في البداية والنهاية.
--   • **وصفوف السجل التي تولّدها الفيكسترة تُمسح معها** — وهو الاستثناء الوحيد
--     المصرَّح به لقاعدة «السجل لا يُحذف منه»: يمحو تاريخاً لم يقع.
--   • الأرقام تُختبر بالفرق لا بالقيمة المطلقة (السجل ينمو مع كل تشغيل).
--
-- المرجع: lib/audit-types.ts (العقد) + supabase/migrations/0036_audit_log.sql
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

  select string_agg(x.o, '، ') into v_missing
  from (values
    ('public.audit_log'), ('public.audit_attempts')
  ) as x(o)
  where to_regclass(x.o) is null;

  if v_missing is not null then
    raise exception 'شرط مسبق: كائنات مفقودة (نفّذ 0036_audit_log.sql أولاً): %', v_missing;
  end if;

  select string_agg(x.f, '، ') into v_missing
  from (values
    ('public.log_audit()'),
    ('public.audit_redact(jsonb)'),
    ('public.audit_is_secret(text)'),
    ('public.audit_actor_kind()'),
    ('public.audit_admin_allowed()'),
    ('public.audit_search(text,uuid,date,date,integer)'),
    ('public.audit_for_booking(uuid)'),
    ('public.record_audit_attempt(text,text,text,uuid,text)'),
    ('public.prune_audit_log(integer)')
  ) as x(f)
  where to_regprocedure(x.f) is null;

  if v_missing is not null then
    raise exception 'شرط مسبق: دوال مفقودة: %', v_missing;
  end if;

  delete from public.extra_services where slug like 'zz-audit-%';
  -- ⚠ ولا حذفَ من `audit_log` بعد 0110: صار مُلحَقاً فقط **فعلاً** — مُشغّلٌ
  --   يرفض التعديل والحذف حتى بدور مالك الجدول، ولا يمرّ إلا ما تجاوز أرضيةَ
  --   الاحتفاظ (سنة). وأثرُ الفيكسترة يمحوه `ROLLBACK` الذي يُنهي به
  --   `scripts/db-test.mjs` كلَّ ملف — فالتنظيفُ صار زائداً، لا مفقوداً.
  delete from public.audit_attempts where operation like 'AUDIT_TESTS%';
  delete from public.subcontractors where company_name like 'AUDIT_TESTS%';

  raise notice '✔ (٠) الشروط المسبقة سليمة — جدولا التدقيق ودواله التسع موجودة';
end;
$$;

-- ----------------------------------------------------------------------------
-- (أ) التغطية: المُشغّل على الجداول المرصودة، وليس على سجلات الأحداث
-- ----------------------------------------------------------------------------
do $$
declare
  v_n    integer;
  v_bad  text;
begin
  select count(*) into v_n
    from pg_trigger t join pg_class c on c.oid = t.tgrelid
    join pg_namespace ns on ns.oid = c.relnamespace
   where ns.nspname = 'public' and not t.tgisinternal and t.tgname like 'audit\_%';
  if v_n < 34 then
    raise exception '(أ) المُشغّل مربوط بـ% جدولاً فقط — المتوقع ٣٤ فأكثر', v_n;
  end if;

  -- والمُضافان بعد المراجعة: لقطة الخدمات مالٌ على الحجز، والاسترداد أثرُ كوبون
  select string_agg(x.t, '، ') into v_bad
  from (values ('booking_extras'), ('coupon_redemptions')) as x(t)
  where not exists (
    select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
     where not t.tgisinternal and t.tgname like 'audit\_%' and c.relname = x.t);
  if v_bad is not null then
    raise exception '(أ) الجدولان المُضافان في 0037 بلا مُشغّل: %', v_bad;
  end if;

  -- الجداول التي **يجب** أن تكون مرصودة، واحداً واحداً: عدٌّ إجمالي وحده يمرّ
  -- لو سقط `bookings` وأُضيف غيره
  select string_agg(x.t, '، ') into v_bad
  from (values
    ('bookings'), ('payments'), ('ledger_entries'), ('subcontractors'),
    ('price_lists'), ('dispatches'), ('trip_offers'), ('coupons'),
    ('site_settings'), ('pricing_settings'), ('payment_accounts'), ('pages')
  ) as x(t)
  where not exists (
    select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
     where not t.tgisinternal and t.tgname like 'audit\_%' and c.relname = x.t);
  if v_bad is not null then
    raise exception '(أ) جداول مرصودة بلا مُشغّل تدقيق: %', v_bad;
  end if;

  -- ولا سجل أحداث مرصود — حلقةٌ تضاعف الحجم بلا معلومة
  --
  -- ⚠ والمرشِّح **الدالةُ الموصولة** لا بادئةُ الاسم: `tgname like 'audit\_%'`
  --   كانت تلتقط أيَّ مُشغّلٍ اسمُه يبدأ بـ`audit_` مهما فعل — ومنها
  --   `audit_log_append_only` (0110) وهو مُشغّلٌ **يرفض الكتابة** لا يكتب صفاً.
  --   والمرشِّحُ بالدالة أدقُّ في الاتجاهين: يُسقط الحارسَ من الحساب، ويمسك
  --   مُشغّلَ تدقيقٍ حقيقياً لو سُمّي بغير البادئة.
  select string_agg(c.relname, '، ') into v_bad
    from pg_trigger t join pg_class c on c.oid = t.tgrelid
   where not t.tgisinternal and t.tgfoid = 'public.log_audit'::regproc
     and c.relname in ('funnel_events', 'notifications', 'payment_events',
                       'booking_lookup_attempts', 'distance_cache',
                       'geocode_cache', 'booking_events', 'audit_log',
                       'audit_attempts');
  if v_bad is not null then
    raise exception '(أ) سجل أحداث مرصود بالتدقيق: % — حلقة', v_bad;
  end if;

  raise notice '✔ (أ) % جدولاً مرصوداً، والجداول الحرجة كلها مغطّاة، ولا سجل أحداث فيها', v_n;
end;
$$;

-- ----------------------------------------------------------------------------
-- (ب) 🔒 الأسرار تُسجَّل «تغيّرت» ولا تُنسخ
-- ----------------------------------------------------------------------------
do $$
declare
  v_out jsonb;
  v_col text;
begin
  -- شاهد إيجابي أولاً: الحجب لا يبتلع عموداً عادياً — وإلا فما بعده بلا معنى
  v_out := public.audit_redact('{"label":"ظاهر","price":"100"}'::jsonb);
  if v_out ->> 'label' <> 'ظاهر' or v_out ->> 'price' <> '100' then
    raise exception '(ب) مسبار معطّل: audit_redact حجبت عموداً عادياً — لا تصدّق ما بعده';
  end if;

  -- ── مصدر واحد للحقيقة ──────────────────────────────────────────────────
  -- ⚠ كان هنا نسخةٌ **ثالثة** من القائمة تُقارَن بالقاعدة، فإضافة اسم في
  -- `lib/audit-types.ts` وحده تمرّ خضراء — أي «فحصٌ لا يمكن أن يفشل بالانحراف
  -- الحقيقي» (النمط ٩). فصار الاختبار يقرأ القائمة **من القاعدة** ويطابقها
  -- بمجموعة مكتوبة هنا: أي تعديل في الهجرة يُسقط هذا السطر ويُجبر على تحديث
  -- الهجرة والعقد والاختبار معاً.
  if (select array_agg(x order by x) from unnest(public.audit_secret_columns()) x)
     is distinct from
     array[
       'access_token', 'api_key', 'attachment_path', 'config', 'customer_name',
       'customer_phone', 'customer_whatsapp', 'email', 'encrypted_password',
       'full_name', 'handle', 'holder_name', 'password', 'phone', 'phone_norm',
       'public_token', 'receipt_path', 'secret', 'secret_key', 'token',
       'webhook_secret', 'whatsapp'
     ]::text[]
  then
    raise exception
      '(ب) قائمة الحجب في القاعدة تخالف المكتوبة في هذا الاختبار — حدِّث الثلاثة معاً (الهجرة، lib/audit-types.ts، هنا). الحيّة: %',
      (select string_agg(x, '، ' order by x) from unnest(public.audit_secret_columns()) x);
  end if;

  -- ثم السلبي: كل اسم في القائمة الحيّة يُحجب فعلاً
  foreach v_col in array public.audit_secret_columns() loop
    v_out := public.audit_redact(jsonb_build_object(v_col, 'سرّ-يجب-ألا-يُنسَخ'));
    if v_out ->> v_col = 'سرّ-يجب-ألا-يُنسَخ' then
      raise exception '(ب) audit_redact لم تحجب «%»', v_col;
    end if;
  end loop;

  -- وما رُفض حجبه يبقى ظاهراً: حجب الأوصاف يفرغ السطر من معناه
  foreach v_col in array array['note', 'notes', 'details', 'plate', 'reference', 'slug'] loop
    if public.audit_is_secret(v_col) then
      raise exception '(ب) العمود الوصفي «%» حُجب — السطر يفرغ من معناه (رُفض في المراجعة)', v_col;
    end if;
  end loop;

  -- وحالة الحرف الكبير لا تفتح ثغرة
  if not public.audit_is_secret('API_KEY') then
    raise exception '(ب) الحجب حسّاس لحالة الحرف — عمود API_KEY يمرّ';
  end if;

  raise notice '✔ (ب) قائمة الحجب مصدرها القاعدة وتطابق العقد، والمعرِّفات محجوبة والأوصاف ظاهرة';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ب-٣) 🔒 الحجب العميق: العمق يغيّر الحكم (هجرة 0038)
-- ----------------------------------------------------------------------------
-- العيب المقيس على القاعدة الحيّة: لقطة حذف حجز حملت
-- `trip.notes = "… كلّمني على 01001234567 أو bad@example.com …"` — **العميل**
-- كتب رقمه في ملاحظة الرحلة، وهي نصّ حرّ داخل jsonb لا يراه حجبٌ يقرأ الأعمدة.
-- والقاعدة المشحونة: النصّ الحرّ محجوب **في العمق** وظاهر **على السطح**، لأن
-- كاتبه يختلف — عميلٌ هناك، وموظفٌ هنا.
-- ----------------------------------------------------------------------------
do $$
declare
  v_out jsonb;
  v_n   integer;
  v_col text;
begin
  -- مسبار إيجابي أولاً: الرحلة نفسها تبقى مقروءة، وإلا فالتدقيق بلا موضوع
  v_out := public.audit_redact('{"trip":{"destLabel":"المعمورة","passengers":3,"distanceKm":220}}'::jsonb);
  if v_out -> 'trip' ->> 'destLabel' <> 'المعمورة'
     or (v_out -> 'trip' ->> 'passengers')::int <> 3 then
    raise exception '(ب-٣) مسبار معطّل — الحجب العميق ابتلع مسار الرحلة، فلا تصدّق ما بعده';
  end if;

  -- (ب-٣-١) ملاحظة العميل داخل trip محجوبة
  v_out := public.audit_redact('{"trip":{"notes":"كلّمني على 01001234567"}}'::jsonb);
  if v_out -> 'trip' ->> 'notes' <> '[محجوب]' then
    raise exception '(ب-٣-١) ملاحظة العميل داخل trip لم تُحجب';
  end if;

  -- (ب-٣-٢) وعلى السطح يبقى وصف المصروف ظاهراً (رُفض حجبه في مراجعة 0037)
  v_out := public.audit_redact('{"note":"مصروف وقود"}'::jsonb);
  if v_out ->> 'note' <> 'مصروف وقود' then
    raise exception '(ب-٣-٢) وصف المصروف على السطح حُجب — السطر يفرغ من معناه';
  end if;

  -- (ب-٣-٣) والسرّ في العمق محجوب — الحدّ الذي كان موثَّقاً ومؤجَّلاً
  v_out := public.audit_redact('{"value":{"integrations":{"api_key":"سرّ"}}}'::jsonb);
  if v_out -> 'value' -> 'integrations' ->> 'api_key' <> '[محجوب]' then
    raise exception '(ب-٣-٣) سرٌّ داخل jsonb لم يُحجب';
  end if;

  -- (ب-٣-٤) والمصفوفات كذلك
  v_out := public.audit_redact('{"items":[{"note":"حرّ"},{"qty":2}]}'::jsonb);
  if v_out -> 'items' -> 0 ->> 'note' <> '[محجوب]' then
    raise exception '(ب-٣-٤) النصّ الحرّ داخل مصفوفة لم يُحجب';
  end if;
  if (v_out -> 'items' -> 1 ->> 'qty')::int <> 2 then
    raise exception '(ب-٣-٤) الحجب ابتلع قيمة عادية داخل مصفوفة';
  end if;

  /*
   * (ب-٣-٥) 🔒 الحارس الشامل: لا صفَّ في السجل كله يحمل نمط هاتف أو بريد.
   *
   * وهو الفحص الوحيد هنا الذي يمسح **الناتج** لا الدالة — فيمسك مساراً لم
   * يخطر ببال أحد (وقد أمسك فعلاً ملاحظةَ عميلٍ داخل `trip` jsonb).
   *
   * ⚠ **وحدود الكلمة ليست تجميلاً:** بلا `[^0-9A-Za-z]` كان هذا الفحص يسقط
   * على `receipt_path` — هاشٌ سداسي طوله ٤٨ محرفاً يحوي صدفةً `0126794420`،
   * أي أحد عشر رقماً بادئتها `01` **داخل** نصٍّ ليس رقماً. وإنذارٌ يرنّ على
   * ضجيج يُعلّم قارئه تجاهُله، فيصمت يوم يرنّ على تسريب حقيقي (النمط ٥ في
   * `LESSONS.md`: اقرأ التأكيد واسأل ماذا يفشل — وهنا كان يفشل على الصحيح).
   *
   * فالهاتف يُطابَق محاطاً بغير حرف ورقم، والبريد يُطلب فيه اسمٌ قبل `@`
   * وامتدادٌ بعد النقطة.
   *
   * ── ⚠ واستثناءٌ واحد صريح: `site_settings` ────────────────────────────────
   *
   * رنّ الفحص على صفَّين حقيقيَّين: تعديلُ المالك لكتلة `contact` من اللوحة،
   * وقد سجّل رقمه وبريده في `changes`. ولم أحجبهما، وهذا مبرر الحكم:
   *
   * 1. **القيمة منشورةٌ أصلاً على كل صفحة** — رقم النشاط وبريده في التذييل
   *    وقسم التواصل وبطاقة `LocalBusiness`. فليست سرّاً يُحجب، والقرار المكتوب
   *    في `lib/audit-types.ts` كان «الأسرار تُسجَّل «تغيّرت» بلا قيمها» —
   *    والسرّ هناك توكنٌ أو مفتاح، لا رقمٌ يُعلَن للعالم.
   * 2. **وحجبُها يهدم غرض السجل لهذا الكيان بالذات**: السؤال الذي يُفتح لأجله
   *    السجلّ هنا هو «مَن غيّر رقم التواصل، وما كان قبله؟» — وسطرٌ يقول «تغيّر
   *    الهاتف» بلا قيمةٍ سابقة لا يُرجع رقماً كُتب خطأً.
   * 3. **والسجلّ نفسه للإدارة وحدها** (‏`is_admin()`)، فلا جمهور جديد يبلغه.
   *
   * 🔒 **والاستثناء ضيّقٌ بقصد**: كيانٌ واحد بالاسم، لا «تجاهل الإعدادات» ولا
   * تليينٌ للنمط. فما يبحث عنه هذا الحارس يوم الحريق — هاتفُ **عميل** أو بريد
   * **متعهد** يتسرّب من `bookings` أو `subcontractors` أو `payments` — يبقى
   * ممسوكاً كما كان. والتوكيد التالي يُثبت أن الاستثناء لم يُعمِ الحارس.
   */
  select count(*) into v_n from public.audit_log
   where entity is distinct from 'site_settings'
     and ((snapshot is not null and snapshot::text ~ '(^|[^0-9A-Za-z])01[0-9]{9}([^0-9A-Za-z]|$)')
       or (changes  is not null and changes::text  ~ '(^|[^0-9A-Za-z])01[0-9]{9}([^0-9A-Za-z]|$)')
       or (snapshot is not null and snapshot::text ~ '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}')
       or (changes  is not null and changes::text  ~ '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}'));
  if v_n > 0 then
    raise exception
      '(ب-٣-٥) % صفاً في السجل يحمل نمط هاتف أو بريد — الحجب لا يغطي مساراً ما', v_n;
  end if;

  /*
   * (ب-٣-٦) 🔒 **وإثبات أن الاستثناء أعلاه لم يُعمِ الحارس** — وإلا لكان تضييق
   * فحصٍ أمني بلا برهانٍ أنه ما زال يرى. نُدخل صفَّ تسريبٍ مصطنعاً على كيانٍ
   * **غير** مستثنى، ونتأكد أن استعلام (ب-٣-٥) نفسه يمسكه، ثم نُرجعه.
   *
   * والفحص الذي لا يمكن أن يفشل أسوأ من غيابه (النمط ٩) — فهذا يفشل عمداً أولاً.
   */
  begin
    insert into public.audit_log (entity, action, actor_kind, changes)
    values ('bookings', 'update', 'system', '{"probe":{"phone":"01234567890"}}'::jsonb);

    select count(*) into v_n from public.audit_log
     where entity is distinct from 'site_settings'
       and changes is not null
       and changes::text ~ '(^|[^0-9A-Za-z])01[0-9]{9}([^0-9A-Za-z]|$)';
    if v_n = 0 then
      raise exception '(ب-٣-٦) الحارس لم يرَ تسريباً مزروعاً — الاستثناء أعماه';
    end if;
    raise exception 'zz-audit-probe-rollback';
  exception
    when others then
      if sqlerrm <> 'zz-audit-probe-rollback' then raise; end if;
  end;

  -- (ب-٣-٦) ومسارات الدلو الخاص محجوبة (0039): بلا قيمة تدقيقية، وبنفس مبرر
  -- منعها في التصدير — والتناقض بين العقدين هو ما كشفه سقوط (ب-٣-٥).
  foreach v_col in array array['receipt_path', 'attachment_path'] loop
    if not public.audit_is_secret(v_col) then
      raise exception '(ب-٣-٦) مسار الدلو «%» غير محجوب — يخالف EXPORT_FORBIDDEN_COLUMNS', v_col;
    end if;
  end loop;

  raise notice '✔ (ب-٣) الحجب عميق: النصّ الحرّ محجوب في العمق وظاهر على السطح، ولا هاتف ولا بريد في السجل كله';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ب-٢) 🔒 كل مُشغّل مربوط، عمود لقطته موجود فعلاً في الكتالوج
-- ----------------------------------------------------------------------------
-- العيب الذي أمسكته المراجعة: `['tariffs','class_slug']` و`['sections','kind']`
-- عمودان لا وجود لهما، و`log_audit` يبتلع الغياب بـ`v_row ? tg_argv[0]` — فكان
-- تعديل تعريفة يُنتج سطراً **لا يقول أي فئة**. والفحص هنا يقرأ الوسيط من
-- الكتالوج ويطابقه بأعمدة الجدول، فيستحيل أن يتكرر صامتاً.
-- ----------------------------------------------------------------------------
do $$
declare
  r      record;
  v_arg  text;
  v_bad  text := '';
begin
  for r in
    select c.relname as tbl, t.tgargs, t.tgnargs
      from pg_trigger t join pg_class c on c.oid = t.tgrelid
      join pg_namespace ns on ns.oid = c.relnamespace
     where ns.nspname = 'public' and not t.tgisinternal and t.tgname like 'audit\_%'
  loop
    if r.tgnargs > 0 then
      -- وسائط المُشغّل مخزَّنة bytea مفصولة بـNUL؛ الأول هو عمود اللقطة
      v_arg := split_part(encode(r.tgargs, 'escape'), '\000', 1);
      v_arg := replace(v_arg, '\000', '');
      if v_arg <> '' and not exists (
        select 1 from information_schema.columns c
         where c.table_schema = 'public' and c.table_name = r.tbl
           and c.column_name = v_arg
      ) then
        v_bad := v_bad || format('%s.%s، ', r.tbl, v_arg);
      end if;
    end if;
  end loop;

  if v_bad <> '' then
    raise exception
      '(ب-٢) عمود لقطة غير موجود في الكتالوج: % — صفوف هذه الجداول تخرج بلا هوية بصمت', v_bad;
  end if;

  raise notice '✔ (ب-٢) كل عمود لقطة في المُشغّلات موجود فعلاً في الكتالوج';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ج) الدورة الكاملة: إدراج ← تحديث ← حذف تُنتج ثلاثة صفوف بالشكل الصحيح
-- ----------------------------------------------------------------------------
do $$
declare
  v_id     uuid;
  v_base   bigint;
  v_row    public.audit_log;
  v_n      integer;
begin
  select coalesce(max(id), 0) into v_base from public.audit_log;

  insert into public.extra_services (slug, title, price, max_qty, active)
  values ('zz-audit-cycle', 'AUDIT_TESTS خدمة', 100, 2, true)
  returning id into v_id;

  select l.* into v_row from public.audit_log l
   where l.id > v_base and l.entity = 'extra_services' and l.action = 'insert'
   order by l.id desc limit 1;
  if v_row.id is null then
    raise exception '(ج-١) الإدراج لم يُنتج صفاً في السجل';
  end if;
  if v_row.entity_id <> v_id then
    raise exception '(ج-١) معرّف الصف لم يُلتقط (وصل %)', v_row.entity_id;
  end if;
  if v_row.entity_label <> 'zz-audit-cycle' then
    raise exception '(ج-١) اللقطة النصية لم تُقرأ من tg_argv (وصلت «%»)', v_row.entity_label;
  end if;
  if v_row.actor_kind is null then
    raise exception '(ج-١) صنف الفاعل فارغ';
  end if;

  update public.extra_services set price = 250 where id = v_id;
  select l.* into v_row from public.audit_log l
   where l.id > v_base and l.entity = 'extra_services' and l.action = 'update'
   order by l.id desc limit 1;
  if v_row.changes -> 'price' ->> 'from' <> '100.00'
     and v_row.changes -> 'price' ->> 'from' <> '100' then
    raise exception '(ج-٢) القيمة القديمة لم تُسجَّل (وصلت %)', v_row.changes -> 'price' ->> 'from';
  end if;
  if v_row.changes -> 'price' ->> 'to' <> '250.00'
     and v_row.changes -> 'price' ->> 'to' <> '250' then
    raise exception '(ج-٢) القيمة الجديدة لم تُسجَّل (وصلت %)', v_row.changes -> 'price' ->> 'to';
  end if;
  -- والتحديث لا يحمل لقطة كاملة: اللقطة للحذف وحده
  if v_row.snapshot is not null then
    raise exception '(ج-٢) التحديث حمل لقطة كاملة — تضخيمٌ بلا سبب';
  end if;

  delete from public.extra_services where id = v_id;
  select l.* into v_row from public.audit_log l
   where l.id > v_base and l.entity = 'extra_services' and l.action = 'delete'
   order by l.id desc limit 1;
  if v_row.snapshot ->> 'slug' <> 'zz-audit-cycle' then
    raise exception '(ج-٣) الحذف لم يحفظ لقطة الصف — يضيع ما حُذف بلا أثر';
  end if;

  select count(*) into v_n from public.audit_log
   where id > v_base and entity_label = 'zz-audit-cycle';
  if v_n <> 3 then
    raise exception '(ج) الدورة أنتجت % صفاً لا ثلاثة', v_n;
  end if;

  -- (‏لا حذفَ للصفوف الثلاثة: `audit_log` مُلحَقٌ فقط بعد 0110، ويمحوها
  --   `ROLLBACK` المُشغّل. والكتلةُ التالية تقرأ `max(id)` من جديد فلا تتأثر.)
  raise notice '✔ (ج) الدورة الثلاثية تُسجَّل بالشكل الصحيح، والحذف وحده يحفظ لقطته';
end;
$$;

-- ----------------------------------------------------------------------------
-- (د) الضجيج: تحديثٌ لا يغيّر إلا `updated_at` لا يُنتج صفاً
-- ----------------------------------------------------------------------------
do $$
declare
  v_id   uuid;
  v_base bigint;
  v_n    integer;
begin
  insert into public.extra_services (slug, title, price, max_qty, active)
  values ('zz-audit-noise', 'AUDIT_TESTS ضجيج', 100, 1, true)
  returning id into v_id;

  select coalesce(max(id), 0) into v_base from public.audit_log;

  -- حفظٌ بلا تغيير: `touch_updated_at` يغيّر updated_at وحده
  update public.extra_services set price = 100, title = 'AUDIT_TESTS ضجيج' where id = v_id;

  select count(*) into v_n from public.audit_log where id > v_base;
  if v_n <> 0 then
    raise exception '(د) حفظٌ بلا تغيير أنتج % صفاً — السجل يمتلئ بما لا يعني شيئاً', v_n;
  end if;

  -- والشاهد الإيجابي: تغييرٌ حقيقي **ينتج** صفاً (وإلا كان الفحص أعلاه زينة)
  update public.extra_services set price = 111 where id = v_id;
  select count(*) into v_n from public.audit_log where id > v_base;
  if v_n <> 1 then
    raise exception '(د) تغييرٌ حقيقي أنتج % صفاً لا واحداً — المسبار معطّل', v_n;
  end if;

  delete from public.extra_services where id = v_id;
  -- (‏`audit_log` مُلحَقٌ فقط بعد 0110 — و`ROLLBACK` المُشغّل يمحو الأثر)
  raise notice '✔ (د) لمسة updated_at وحدها لا تُسجَّل، والتغيير الحقيقي يُسجَّل';
end;
$$;

-- ----------------------------------------------------------------------------
-- (هـ) الربط: عمود `booking_id` يملأ نفسه فتُقرأ قصة الحجز الواحد
-- ----------------------------------------------------------------------------
-- ⚠ **وهنا كان النمط نفسه الذي أُصلح في (و)، بصورةٍ أخفّ:** التوكيدان يعدّان
-- «كم صفاً **بلا** رابط؟» ويمرّان على الصفر — والصفرُ على سجلٍّ لا يحمل صفَّ
-- حجزٍ واحد يعني **«لا شيء يُقاس»** لا «كل شيء مربوط». وحارسُه القديم كان
-- يقرأ جدول `bookings` — أي **بديلاً** عن المقيس لا المقيسَ نفسه، ويخطئ في
-- الاتجاهين: قاعدةٌ مُسحت حجوزاتها ويبقى تاريخها في السجل (وهي حال القاعدة
-- اليوم: `bookings = 2` و**٣٬٠٦٦** صفَّ تدقيقٍ عليها) كان يتخطّاها بلا داعٍ،
-- وحجوزاتٌ قائمة بلا مُشغّلٍ يعمل كانت تمرّ خضراء.
-- فصار النطاق يُقاس ويُعلَن، ويُفرَّق فيه بين الثلاثة صراحةً.
do $$
declare
  v_scope integer;
  v_n     integer;
begin
  select count(*) into v_scope from public.audit_log
   where entity in ('bookings', 'payments', 'booking_extras', 'dispatches');

  if v_scope = 0 then
    select count(*) into v_n from public.bookings;
    if v_n > 0 then
      raise exception
        '(هـ) % حجزاً في القاعدة وصفرُ صفِّ تدقيقٍ عليها أو على تابعيها — المُشغّل لا يكتب، والمرور هنا كان سيقول «الربط سليم»', v_n;
    end if;
    raise notice '  ↳ (هـ) لا حجوزات ولا صفَّ تدقيقٍ عليها — لا موضوع للحكم، والفحص متخطّى صراحةً';
    return;
  end if;

  -- كل صف سجلٍّ على جدول الحجوزات يجب أن يحمل رابطه
  select count(*) into v_n from public.audit_log
   where entity = 'bookings' and booking_id is null;
  if v_n > 0 then
    raise exception '(هـ) % صفاً على bookings بلا booking_id — «يربط كل شيء ببعضه» مكسور', v_n;
  end if;

  -- وكل صف على جدول يحمل `booking_id` كذلك
  select count(*) into v_n from public.audit_log
   where entity in ('payments', 'booking_extras', 'dispatches') and booking_id is null;
  if v_n > 0 then
    raise exception '(هـ) % صفاً على جداول تابعة للحجز بلا رابط', v_n;
  end if;

  raise notice '✔ (هـ) % صفَّ سجلٍّ على الحجز وتابعيه — وكلها تحمل رابطه', v_scope;
end;
$$;

-- ----------------------------------------------------------------------------
-- (و) المُدخل المرفوض والتقليم المحروس — **بشاهدٍ إيجابي يُزرع قبل النداء**
-- ----------------------------------------------------------------------------
-- 🔴 العيب الذي أُصلح هنا، وهو من صنف «الفحص الذي لا يمكن أن يفشل» (النمط ٩):
--
-- كان التوكيد ينادي `prune_audit_log(1)` ثم يعدّ صفوف آخر ٣٠٠ يوم ويفشل على
-- الصفر. وعلى سجلٍّ فارغ يكون الصفرُ **«لم يكن هناك ما يُحمى»** لا «الأرضية لم
-- تحرس» — وهما شيئان، وخلطُهما هو القاعدة الذهبية ١٥ («لا نعرف» ليست «صفر»)
-- منقوضةً **داخل اختبار**. وقد سقط فعلاً في تشغيلٍ ونجح في التالي، لأن مجموعات
-- التشغيل الأول كتبت صفوفاً بينهما.
--
-- ⚠ **وأسوأ من التذبذب، مقيسٌ على القاعدة الحيّة (2026-08-16):** أقدم صفٍّ في
-- `audit_log` عمره **ساعات** (١٢٬٩٣٤ صفاً، أقدمها 2026-08-15) — أي أن
-- `prune_audit_log(1)` **بأرضيةٍ منزوعة تماماً** لا يحذف صفاً واحداً، فالتوكيد
-- القديم يمرّ أخضر على حارسٍ غير موجود. لم يكن يتذبذب فحسب: كان قد **كفّ عن
-- قياس الأرضية** أصلاً.
--
-- والعلاج شاهدان يُزرعان قبل النداء بعمرين **يفصلان** بين الحالتين:
--   • **شاهد الأرضية** — عمره ٢٠٠ يوماً: أكبر من المطلوب (يوم) وأصغر من
--     الأرضية (٣٦٥) ⇒ **يجب أن ينجو**، ويُمحى لحظة سقوط `greatest(…, 365)`.
--   • **شاهد الحافة** — عمره ٤٠٠ يوم: خارج الأرضية ⇒ **يجب أن يُمحى**؛ وبدونه
--     تمرّ «نجاةُ الأول» على تقليمٍ لا يحذف شيئاً أصلاً، فتصير النجاة بلا معنى.
-- وتثبيتُ الشاهدين **يُتحقَّق منه ويرمي** قبل النداء: إن تعذّر إثبات الشرط
-- المسبق فالفحص يصرخ ولا يمرّ.
--
-- وشاهدان مثلهما على `audit_attempts` لأن الدالة نفسها تقلّم الجدولين بالمهلة
-- نفسها، ولم يكن أحدٌ يقيس نصفها الثاني.
-- ----------------------------------------------------------------------------
do $$
declare
  v_n           integer;
  v_planted     integer;
  v_inside      integer;
  v_log_floor   bigint;
  v_log_edge    bigint;
  v_att_floor   bigint;
  v_att_edge    bigint;
begin
  -- ── زرع الشاهدين (والوسم `zz-audit-` يجعل التنظيف يبتلعهما مهما حدث) ──────
  insert into public.audit_log (entity, action, actor_kind, entity_label, occurred_at)
  values ('extra_services', 'update', 'system', 'zz-audit-prune-floor',
          now() - interval '200 days')
  returning id into v_log_floor;

  insert into public.audit_log (entity, action, actor_kind, entity_label, occurred_at)
  values ('extra_services', 'update', 'system', 'zz-audit-prune-edge',
          now() - interval '400 days')
  returning id into v_log_edge;

  insert into public.audit_attempts (actor_kind, operation, reason, occurred_at)
  values ('system', 'AUDIT_TESTS_floor', 'forbidden', now() - interval '200 days')
  returning id into v_att_floor;

  insert into public.audit_attempts (actor_kind, operation, reason, occurred_at)
  values ('system', 'AUDIT_TESTS_edge', 'forbidden', now() - interval '400 days')
  returning id into v_att_edge;

  -- ── الشرط المسبق يُثبَت صراحةً: لا حكم على أرضيةٍ بلا ما تحرسه ────────────
  select (select count(*) from public.audit_log
           where id in (v_log_floor, v_log_edge))
       + (select count(*) from public.audit_attempts
           where id in (v_att_floor, v_att_edge))
    into v_planted;
  if v_planted <> 4 then
    raise exception
      '(و) تعذّر تثبيت شواهد التقليم (% من ٤) — لا يمكن الحكم على الأرضية، والمرور هنا أسوأ من الفشل',
      v_planted;
  end if;

  -- وحجم ما **داخل** الأرضية قبل النداء: التقليم لا يجوز أن ينقص منه شيئاً
  select count(*) into v_inside from public.audit_log
   where occurred_at >= now() - interval '365 days';

  -- ── النداء: يوم واحد مطلوباً، وسنةٌ هي الأرضية ────────────────────────────
  perform public.prune_audit_log(1);

  -- (و-١) شاهد الأرضية نجا — وهو الادّعاء الذي كُتب القسم لأجله
  select count(*) into v_n from public.audit_log where id = v_log_floor;
  if v_n <> 1 then
    raise exception
      '(و-١) صفٌّ عمره ٢٠٠ يوماً مُحي بـprune_audit_log(1) — أرضية السنة لا تحرس';
  end if;
  select count(*) into v_n from public.audit_attempts where id = v_att_floor;
  if v_n <> 1 then
    raise exception
      '(و-١) محاولةٌ عمرها ٢٠٠ يوماً مُحيت — الأرضية لا تحرس audit_attempts، والدالة تقلّم الجدولين';
  end if;

  -- (و-٢) وشاهد الحافة مُحي — وإلا فالتقليم لا يقلّم، فنجاة الأول بلا دلالة
  select count(*) into v_n from public.audit_log where id = v_log_edge;
  if v_n <> 0 then
    raise exception
      '(و-٢) صفٌّ عمره ٤٠٠ يوم نجا التقليم — الدالة لا تحذف شيئاً، فنجاة شاهد الأرضية لا تُثبت أرضية';
  end if;
  select count(*) into v_n from public.audit_attempts where id = v_att_edge;
  if v_n <> 0 then
    raise exception
      '(و-٢) محاولةٌ عمرها ٤٠٠ يوم نجت التقليم — نصف الدالة الثاني لا يعمل';
  end if;

  -- (و-٣) ولا صفَّ واحد من داخل الأرضية نقص (‏`now()` ثابتة داخل المعاملة)
  select count(*) into v_n from public.audit_log
   where occurred_at >= now() - interval '365 days';
  if v_n <> v_inside then
    raise exception
      '(و-٣) التقليم أنقص % صفاً من داخل الأرضية (% ⇐ %) — الحذف يتجاوز حدّه',
      v_inside - v_n, v_inside, v_n;
  end if;

  -- ── وتسجيل محاولة مرفوضة يعمل ─────────────────────────────────────────────
  perform public.record_audit_attempt('AUDIT_TESTS_op', 'forbidden', 'bookings', null, 'تفصيل اختباري');
  select count(*) into v_n from public.audit_attempts where operation = 'AUDIT_TESTS_op';
  if v_n <> 1 then
    raise exception '(و) record_audit_attempt لم تكتب صفاً (% صفاً)', v_n;
  end if;

  -- (‏شاهدُ الأرضية عمره ٢٠٠ يوماً — و0110 يرفض حذفَ ما هو أحدث من سنة، وهو
  --   بعينه ما يجعل شهادته صحيحة. ويمحوه `ROLLBACK` المُشغّل.)
  delete from public.audit_attempts where operation like 'AUDIT_TESTS%';
  raise notice '✔ (و) شاهدٌ عمره ٢٠٠ يوماً نجا وآخرُ ٤٠٠ مُحي في الجدولين — الأرضية تحرس سنةً كاملة والتقليم يقلّم، وتسجيل المحاولة المرفوضة يعمل';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ز) 🔒 append-only: لا كتابة ولا تفريغ لأي دور مستخدم
-- ----------------------------------------------------------------------------
do $$
declare
  v_n integer;
  v_p text;
begin
  select string_agg(distinct privilege_type, '، ') into v_p
    from information_schema.table_privileges
   where table_schema = 'public' and table_name in ('audit_log', 'audit_attempts')
     and grantee in ('anon', 'authenticated')
     and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE');
  if v_p is not null then
    raise exception '(ز) دور مستخدم يملك % على جداول التدقيق — السجل ليس append-only', v_p;
  end if;

  -- و`truncate` تحديداً: RLS **لا تغطيها**، فجدول محمي بسياسة وحدها يُفرَّغ بنداء
  select count(*) into v_n
    from information_schema.table_privileges
   where table_schema = 'public' and table_name = 'audit_log'
     and grantee in ('anon', 'authenticated', 'public') and privilege_type = 'TRUNCATE';
  if v_n > 0 then
    raise exception '(ز) truncate ممنوحة على audit_log — السجل يُفرَّغ بنداء واحد';
  end if;

  -- وRLS مفعّلة على الجدولين
  select count(*) into v_n from pg_class
   where relname in ('audit_log', 'audit_attempts') and relrowsecurity;
  if v_n <> 2 then
    raise exception '(ز) RLS غير مفعّلة على جدولَي التدقيق (% منهما)', v_n;
  end if;

  raise notice '✔ (ز) لا كتابة ولا حذف ولا تفريغ لأي دور مستخدم، وRLS مفعّلة على الجدولين';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ح) 🔒 الحاجز الأكبر: متعهد مسجَّل الدخول لا يقرأ سطراً واحداً
-- ----------------------------------------------------------------------------
do $$
declare
  v_user  constant uuid := 'a0000000-0000-4000-8000-0000000000d1';
  v_built boolean := false;
  v_n     integer;
  v_ok    boolean;
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    raise notice '  ↳ (ح) لا دور authenticated — الفحص متخطّى';
    return;
  end if;

  begin
    insert into auth.users (id, instance_id, aud, role, email,
                            encrypted_password, email_confirmed_at, created_at, updated_at)
    values (v_user, '00000000-0000-0000-0000-000000000000', 'authenticated',
            'authenticated', 'audit-tests@example.invalid', '', now(), now(), now())
    on conflict (id) do nothing;

    insert into public.profiles (id, role) values (v_user, 'subcontractor')
    on conflict (id) do update set role = excluded.role;

    insert into public.subcontractors (profile_id, company_name, contact_name, phone, status)
    values (v_user, 'AUDIT_TESTS شركة', 'مسؤول', '01000009501', 'approved');

    v_built := true;
  exception
    when others then
      if to_regclass('auth.users') is not null then
        raise exception '(ح) تعذّر بناء الهوية رغم وجود auth.users: % — أصلح الفيكسترة، لا تتخطَّ الفحص', sqlerrm;
      end if;
      raise notice '  ↳ (ح) لا مخطط auth — الفحص متخطّى (%)', sqlerrm;
  end;

  if not v_built then return; end if;

  begin
    perform set_config('request.jwt.claim.sub', v_user::text, false);
    execute 'set local role authenticated';

    -- (ح-١) الهوية فعّالة: يقرأ صف شركته. بدونها ما بعده «فحص لا يمكن أن يفشل»
    execute $q$select count(*) from public.subcontractors
               where company_name like 'AUDIT_TESTS%'$q$ into v_n;
    if v_n <> 1 then
      raise exception '(ح-١) المتعهد لا يقرأ صف شركته (%) — الهوية غير فعّالة', v_n;
    end if;

    -- (ح-٢) ومع ذلك: صفر صف من جدول السجل مباشرةً (RLS)
    execute 'select count(*) from public.audit_log' into v_n;
    if v_n <> 0 then
      raise exception '(ح-٢) المتعهد قرأ % صفاً من audit_log — تاريخ المنصة كله مكشوف', v_n;
    end if;

    execute 'select count(*) from public.audit_attempts' into v_n;
    if v_n <> 0 then
      raise exception '(ح-٣) المتعهد قرأ % صفاً من audit_attempts', v_n;
    end if;

    -- (ح-٤) ودوال القراءة ترفضه صراحةً
    v_ok := false;
    begin
      execute 'select count(*) from public.audit_search(null,null,null,null,10)' into v_n;
    exception when others then v_ok := true;
    end;
    if not v_ok then
      raise exception '(ح-٤) المتعهد نفّذ audit_search — تاريخ المنصة مكشوف عبر الدالة';
    end if;

    v_ok := false;
    begin
      execute 'select count(*) from public.audit_for_booking(''00000000-0000-4000-8000-000000000000'')' into v_n;
    exception when others then v_ok := true;
    end;
    if not v_ok then
      raise exception '(ح-٥) المتعهد نفّذ audit_for_booking';
    end if;

    -- (ح-٦) ولا يكتب في السجل ولو حاول
    v_ok := false;
    begin
      execute $q$insert into public.audit_log (actor_kind, entity, action)
                 values ('admin','bookings','insert')$q$;
    exception when others then v_ok := true;
    end;
    if not v_ok then
      raise exception '(ح-٦) المتعهد كتب في audit_log — تزوير التاريخ ممكن';
    end if;

    execute 'reset role';
    perform set_config('request.jwt.claim.sub', '', false);
  exception
    when others then
      execute 'reset role';
      perform set_config('request.jwt.claim.sub', '', false);
      raise;
  end;

  raise notice '✔ (ح) المتعهد يقرأ صف شركته ولا يقرأ سطر تدقيق واحداً ولا يكتب فيه';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ط) 🔒 والزائر كذلك
-- ----------------------------------------------------------------------------
do $$
declare
  v_n  integer;
  v_ok boolean;
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    raise notice '  ↳ (ط) لا دور anon — الفحص متخطّى';
    return;
  end if;

  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claims', '', false);

  begin
    execute 'set local role anon';

    v_ok := false;
    begin
      execute 'select count(*) from public.audit_log' into v_n;
    exception when others then v_ok := true;
    end;
    if not v_ok and v_n <> 0 then
      raise exception '(ط-١) anon قرأ % صفاً من audit_log', v_n;
    end if;

    v_ok := false;
    begin
      execute 'select count(*) from public.audit_search(null,null,null,null,10)' into v_n;
    exception when others then v_ok := true;
    end;
    if not v_ok then
      raise exception '(ط-٢) anon نفّذ audit_search';
    end if;

    execute 'reset role';
  exception
    when others then
      execute 'reset role';
      raise;
  end;

  raise notice '✔ (ط) الزائر لا يقرأ السجل ولا ينفّذ سطح قراءته';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ي) التنظيف
-- ----------------------------------------------------------------------------
do $$
begin
  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claims', '', false);

  delete from public.extra_services where slug like 'zz-audit-%';
  delete from public.subcontractors  where company_name like 'AUDIT_TESTS%';
  delete from public.profiles        where id = 'a0000000-0000-4000-8000-0000000000d1';
  delete from auth.users             where id = 'a0000000-0000-4000-8000-0000000000d1';

  -- ⚠ وأثرُ الفيكسترة في السجلّ نفسه **لم يعد يُحذف من هنا**: كان هذا
  --   «الاستثناء الوحيد المصرَّح به» — وهو بالضبط الاستثناءُ الذي أبطل الادّعاء.
  --   بعد 0110 لا يُعدَّل `audit_log` ولا يُحذف منه إلا ما تجاوز سنةً، ولا
  --   حاجةَ أصلاً: `scripts/db-test.mjs` يُرجع كلَّ ملف فلا يُكمّ صفٌّ واحد.
  delete from public.audit_attempts where operation like 'AUDIT_TESTS%';

  raise notice '✔ (ي) التنظيف تم — لا فيكسترة ولا أثر لها في السجل';
end;
$$;

-- ----------------------------------------------------------------------------
-- الخلاصة
-- ----------------------------------------------------------------------------
do $$
begin
  raise notice 'ALL PASSED — نظام السجلات: ٣٤ جدولاً فأكثر مرصودة بمُشغّل واحد وكل عمود لقطة متحقَّق من الكتالوج ولا سجل أحداث فيها، وقائمة الحجب مصدرها القاعدة فتحجب المعرِّفات وتُبقي الأوصاف، والدورة الثلاثية بشكلها الصحيح مع لقطة عند الحذف وحده، ولمسة updated_at لا تُسجَّل، والربط بالحجز كامل، وأرضية التقليم مُثبَتة بشاهدٍ ينجو وآخرَ يُمحى في الجدولين، والسجل append-only بلا كتابة ولا تفريغ لأي دور، ولا المتعهد ولا الزائر يقرأ سطراً واحداً';
end;
$$;
