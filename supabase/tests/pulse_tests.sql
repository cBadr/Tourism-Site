-- ============================================================================
-- pulse_tests.sql — اختبارات قبول لنبض الصفحة
--                   (الدفعة ٤ — الملاحظة ١٢: هجرة 0034_page_pulse.sql)
--
-- كيف تشغّله: `pnpm db:test pulse` أو الصق الملف كاملاً في SQL Editor واضغط Run.
-- النجاح = آخر سطر «ALL PASSED». أي فشل يرمي exception برسالة عربية تحدد
-- الاختبار والقيمة المتوقعة والفعلية.
--
-- ومن psql بدور صاحب القاعدة **لا بد** من ON_ERROR_STOP و‑1 معاً:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f supabase/tests/pulse_tests.sql
-- الأول لأن psql بدونه يتابع بعد الكتلة الفاشلة فيطبع «ALL PASSED» رغم الفشل،
-- والثاني لأن الملف يبدّل هوية الدور مؤقتاً.
--
-- ── الحاجز الأول لهذا الملف: (ب) التفويض مطابق حرفياً ───────────────────────
--
-- هو **سبب وجود المجموعة أصلاً**. `pulse_stats` تفوّض الأقسام السبعة القائمة
-- إلى `section_stats` بدل أن تستنسخ جسمها، لأن الاستنساخ هو ما أنتج أخطر عيب
-- في الدفعة ٣: جسمٌ نُسخ من هجرة قديمة أعاد عيباً أغلقته هجرة أحدث، فتنازلت
-- موجة البث الأولى عن كل الهامش (D-58). والفحص هنا يقارن **صفاً بصف** ما
-- تُرجعه الدالتان لكل قسم من السبعة — فلو حوّل أحدٌ يوماً التفويض إلى نسخة،
-- سقط هذا الاختبار في اللحظة التي تفترق فيها النسختان.
--
-- ── الحاجز الثاني: (د) النسبة التي مقامها صفر **غائبة** لا صفرية ────────────
--
-- عقد `StatCard` يقول `value: number` غير قابل للتفريغ، فلا مجال لـ null.
-- والحل ليس إرجاع صفر — «معدل قبول ٠٪» في فترة لم يُعرض فيها عرض واحد كذبة
-- تُقرأ خبراً سيئاً عن شبكة المتعهدين. الحل حذف البطاقة، والفحص (د) يثبّته على
-- فترة قديمة فارغة بيقين.
--
-- ── الحاجز الثالث: (ز) و(ح) لا الزائر ولا المتعهد يرى رقماً ────────────────
--
-- الدالتان ممنوحتان لـ`authenticated` **بالضرورة** (جلسة المشرف تمر بهذا الدور
-- في PostgREST)، فالحاجز الحقيقي هو `analytics_admin_allowed()` داخلهما لا
-- المنحة. ولذلك يجب أن يُختبر بنداء حيّ لا بقراءة منحة: منحةٌ موجودة وحارسٌ
-- سليم هو الوضع الصحيح، ومن يقرأ المنحة وحدها يظنّه ثغرة (وقد وقع فعلاً في
-- الدفعة ٣ فبُني عليه حكم خاطئ ثم قرارُ إبقاء خاطئ).
--
-- ── لماذا لا يلمس هذا الملف بيانات حقيقية ──────────────────────────────────
--   • **لا يزرع صفاً واحداً في أي جدول عمل.** كل ما يقرؤه موجود سلفاً؛ وما
--     يحتاج هوية (القسم ح) يبنيها بوسم PULSE_TESTS ويمحوها في البداية والنهاية.
--   • **الأرقام تُختبر بشكلها وعلاقتها لا بقيمتها**: عدد النقاط يساوي عدد أيام
--     المدى، والتفويض يطابق، والصيغ ضمن الأربع المسموحة. أي اختبار يثبّت رقماً
--     مطلقاً كان سيسقط بمجرد أن يعمل المشروع يوماً إضافياً.
--
-- المرجع: lib/pulse-types.ts (العقد) + supabase/migrations/0034_page_pulse.sql
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (٠) الشروط المسبقة + تنظيف بقايا تشغيل سابق
-- ----------------------------------------------------------------------------
do $$
declare
  v_missing text;
begin
  -- الهوية تُفرَّغ أولاً: أي بقية من مطالبة jwt تجعل analytics_admin_allowed
  -- تحسبنا مستخدماً عادياً فترفض كل شيء بلا سبب مفهوم.
  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claims', '', false);

  select string_agg(x.fn, '، ')
    into v_missing
  from (values
    ('public.pulse_stats(text,date,date)'),
    ('public.pulse_series(text,date,date)'),
    ('public.section_stats(text,date,date)'),
    ('public.analytics_admin_allowed()'),
    ('public.stats_delta(numeric,numeric)')
  ) as x(fn)
  where to_regprocedure(x.fn) is null;

  if v_missing is not null then
    raise exception 'شرط مسبق: دوال مفقودة (نفّذ 0034_page_pulse.sql أولاً): %', v_missing;
  end if;

  delete from public.subcontractors where company_name like 'PULSE_TESTS%';

  raise notice '✔ (٠) الشروط المسبقة سليمة — دالتا النبض موجودتان';
end;
$$;

-- ----------------------------------------------------------------------------
-- (أ) عقد StatCard مُحترَم في **كل** قسم — الخمسة عشر بلا استثناء
-- ----------------------------------------------------------------------------
-- `value` غير قابل للتفريغ، و`format` من الأربع، و`key`/`label` غير فارغين.
-- والقائمة مكتوبة صراحةً لا مشتقّة: قسمٌ يسقط من الهجرة يجب أن يُسقط الاختبار
-- لا أن يختفي معه بصمت.
-- ----------------------------------------------------------------------------
do $$
declare
  v_sections constant text[] := array[
    'orders', 'partners', 'treasury', 'customers', 'content', 'locales', 'discounts',
    'dispatch', 'quotes', 'payments', 'accounts', 'fleet', 'extras',
    'notifications', 'redirects'
  ];
  v_s   text;
  v_bad integer;
  v_n   integer;
  v_total integer := 0;
begin
  foreach v_s in array v_sections
  loop
    select count(*) into v_n
      from public.pulse_stats(v_s, current_date - 29, current_date);
    v_total := v_total + v_n;

    -- كل قسم يُرجع بطاقة واحدة على الأقل، وإلا فالشريط يختفي من شاشته بلا سبب
    if v_n = 0 then
      raise exception '(أ) القسم «%» لم يُرجع بطاقة واحدة — شاشته تفقد شريطها كاملاً', v_s;
    end if;

    select count(*) into v_bad
      from public.pulse_stats(v_s, current_date - 29, current_date) c
     where c.value is null
        or c.key is null or btrim(c.key) = ''
        or c.label is null or btrim(c.label) = ''
        or c.format not in ('number', 'money', 'percent', 'duration');
    if v_bad > 0 then
      raise exception '(أ) القسم «%»: % بطاقة تخالف عقد StatCard (value فارغة أو صيغة مجهولة أو مفتاح/عنوان فارغ)', v_s, v_bad;
    end if;
  end loop;

  raise notice '✔ (أ) الخمسة عشر قسماً تُرجع بطاقات صالحة بعقد StatCard (% بطاقة)', v_total;
end;
$$;

-- ----------------------------------------------------------------------------
-- (ب) 🔒 التفويض مطابق حرفياً — حارس D-58
-- ----------------------------------------------------------------------------
-- لو صار التفويض استنساخاً يوماً، فالنسختان تفترقان عند أول تعديل على إحداهما،
-- وهذا الفحص يسقط في اللحظة نفسها لا بعد سنة.
-- ----------------------------------------------------------------------------
do $$
declare
  v_seven constant text[] := array[
    'orders', 'partners', 'treasury', 'customers', 'content', 'locales', 'discounts'
  ];
  v_s    text;
  v_diff integer;
  v_a    integer;
begin
  foreach v_s in array v_seven
  loop
    -- مسبار أولاً: مصدرٌ فارغ يجعل «لا فرق» صحيحاً بلا معنى (النمط ٩)
    select count(*) into v_a
      from public.section_stats(v_s, current_date - 29, current_date);
    if v_a = 0 then
      raise exception '(ب) مسبار معطّل: section_stats(«%») بلا صفوف — لا تصدّق مقارنةً بعدها', v_s;
    end if;

    select count(*) into v_diff from (
      (select * from public.pulse_stats(v_s, current_date - 29, current_date)
       except all
       select * from public.section_stats(v_s, current_date - 29, current_date))
      union all
      (select * from public.section_stats(v_s, current_date - 29, current_date)
       except all
       select * from public.pulse_stats(v_s, current_date - 29, current_date))
    ) d;

    if v_diff <> 0 then
      raise exception
        '(ب) pulse_stats(«%») لا تطابق section_stats — % صفاً مختلفاً. التفويض انقلب استنساخاً (D-58)',
        v_s, v_diff;
    end if;
  end loop;

  raise notice '✔ (ب) الأقسام السبعة تُفوَّض إلى section_stats بتطابق صفٍّ بصف — لا استنساخ';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ج) و`section_stats` نفسها لم تُمسّ: ما زالت ترفض أقسام النبض
-- ----------------------------------------------------------------------------
do $$
declare
  v_ok boolean;
  v_n  integer;
begin
  v_ok := false;
  begin
    select count(*) into v_n
      from public.section_stats('notifications', current_date - 29, current_date);
  exception when others then v_ok := true;
  end;
  if not v_ok then
    raise exception '(ج) section_stats قبلت قسم نبض — كُتب فوقها بدل التفويض';
  end if;

  -- وما زالت تعرف قسمها الثامن الذي أضافته 0024 (حارس انحدار عكسي)
  select count(*) into v_n
    from public.section_stats('discounts', current_date - 29, current_date);
  if v_n = 0 then
    raise exception '(ج) section_stats فقدت قسم discounts — انحدار في 0024';
  end if;

  raise notice '✔ (ج) section_stats سليمة: ترفض أقسام النبض وتحتفظ بأقسامها السبعة';
end;
$$;

-- ----------------------------------------------------------------------------
-- (د) 🔒 النسبة التي مقامها صفر **غائبة** لا صفرية
-- ----------------------------------------------------------------------------
-- فترة ٢٠٢٠ فارغة بيقين (المشروع نفسه لم يكن موجوداً)، فأي بطاقة نسبة تظهر
-- فيها إنما وُلدت من مقام صفر.
-- ----------------------------------------------------------------------------
do $$
declare
  v_n     integer;
  v_keys  text;
begin
  -- (د-١) البث: لا معدل قبول ولا نسبة يدوي ولا زمن أول قبول في فترة بلا نشاط
  select count(*), string_agg(c.key, '، ')
    into v_n, v_keys
    from public.pulse_stats('dispatch', date '2020-01-01', date '2020-01-30') c
   where c.key in ('dispatch_accept_rate', 'dispatch_manual_rate', 'dispatch_first_accept');
  if v_n <> 0 then
    raise exception
      '(د-١) بطاقات نسبة ظهرت في فترة بلا نشاط: % — مقام صفر أُرجع رقماً بدل أن تُحذف البطاقة', v_keys;
  end if;

  -- ومع ذلك تبقى البطاقات التي لها معنى في الفراغ: العدّ صفراً حقيقةً، واللقطة الآن
  select count(*) into v_n
    from public.pulse_stats('dispatch', date '2020-01-01', date '2020-01-30') c
   where c.key in ('dispatch_count', 'dispatch_manual_open');
  if v_n <> 2 then
    raise exception '(د-١) البطاقتان العدديتان يجب أن تبقيا في الفراغ (وُجد % منهما)', v_n;
  end if;

  -- (د-٢) طلبات الأسعار: لا نسبة تحوّل بلا طلب واحد
  select count(*) into v_n
    from public.pulse_stats('quotes', date '2020-01-01', date '2020-01-30') c
   where c.key = 'quotes_converted_rate';
  if v_n <> 0 then
    raise exception '(د-٢) نسبة تحوّل ظهرت بلا طلب واحد — مقام صفر';
  end if;

  -- (د-٣) الإشعارات: لا معدل تسليم بلا إشعار واحد
  select count(*) into v_n
    from public.pulse_stats('notifications', date '2020-01-01', date '2020-01-30') c
   where c.key = 'notif_delivery_rate';
  if v_n <> 0 then
    raise exception '(د-٣) معدل تسليم ظهر بلا إشعار واحد — مقام صفر';
  end if;

  -- (د-٤) الخدمات: لا نسبة إرفاق بلا حجز واحد في الفترة
  select count(*) into v_n
    from public.pulse_stats('extras', date '2020-01-01', date '2020-01-30') c
   where c.key = 'extras_attach_rate';
  if v_n <> 0 then
    raise exception '(د-٤) نسبة إرفاق ظهرت بلا حجز واحد — مقام صفر';
  end if;

  -- ── (د-٥) 🔒 والوجه الآخر للقاعدة، وهو ما أضافه تصليب 0035 ──────────────
  -- المحذوف هو **النسبة** وحدها. أما العدّاد فيخرج ولو صفراً، لأن «٠ حجزاً على
  -- الأسطول» معلومة صحيحة بينما «معدل قبول ٠٪» بلا عرضٍ واحد كذبة. كان
  -- العدّادان محبوسين داخل حارس النسبة نفسه فيختفيان في الفترة الفارغة —
  -- سلوكٌ يخالف ترويسة 0034، أمسكته مراجعة انحراف العقود.
  select count(*) into v_n
    from public.pulse_stats('fleet', date '2020-01-01', date '2020-01-30') c
   where c.key = 'fleet_orders';
  if v_n <> 1 then
    raise exception '(د-٥) «حجوزات على الأسطول» اختفت في فترة فارغة بدل أن تقول ٠ — عدّاد محبوس خلف حارس نسبة';
  end if;

  select count(*) into v_n
    from public.pulse_stats('payments', date '2020-01-01', date '2020-01-30') c
   where c.key = 'payment_failed_count';
  if v_n <> 1 then
    raise exception '(د-٥) «جلسات فاشلة» اختفت في فترة فارغة بدل أن تقول ٠ — عدّاد محبوس خلف حارس نسبة';
  end if;

  -- ونسبتاهما غائبتان في الفترة نفسها — فالحارس يميّز النوعين لا يلغي أحدهما
  select count(*) into v_n
    from public.pulse_stats('fleet', date '2020-01-01', date '2020-01-30') c
   where c.key = 'fleet_top_share';
  if v_n <> 0 then
    raise exception '(د-٥) «نصيب الفئة الأولى» ظهرت بلا حجز واحد — مقام صفر';
  end if;

  raise notice '✔ (د) النسبة ذات المقام الصفري محذوفة، والعدّاد يخرج ولو صفراً (تصليب 0035)';
end;
$$;

-- ----------------------------------------------------------------------------
-- (هـ) السلسلة: نقطة لكل يوم في المدى — دائماً، بنشاط أو بدونه
-- ----------------------------------------------------------------------------
do $$
declare
  -- `treasury` مسحوبة في 0035: كانت قيمة معامل مقبولة بلا مستهلك واحد
  v_sections constant text[] := array[
    'orders', 'dispatch', 'quotes', 'payments', 'accounts',
    'extras', 'notifications'
  ];
  v_s    text;
  v_pts  jsonb;
  v_rows integer;
begin
  foreach v_s in array v_sections
  loop
    select count(*) into v_rows from public.pulse_series(v_s, current_date - 13, current_date);
    if v_rows <> 1 then
      raise exception '(هـ) pulse_series(«%») أرجعت % صفاً — العقد صف واحد لكل نداء', v_s, v_rows;
    end if;

    select s.points into v_pts from public.pulse_series(v_s, current_date - 13, current_date) s;

    if jsonb_array_length(v_pts) <> 14 then
      raise exception
        '(هـ) pulse_series(«%») أرجعت % نقطة لمدى ١٤ يوماً — الفجوات لم تُملأ، والرسم يقفز فوق الأيام الفارغة',
        v_s, jsonb_array_length(v_pts);
    end if;

    -- ولا نقطة بلا سلة أو بقيمة غير رقمية
    if exists (
      select 1 from jsonb_array_elements(v_pts) p
       where p ->> 'bucket' is null
          or p ->> 'value'  is null
          or (p ->> 'bucket') !~ '^\d{4}-\d{2}-\d{2}$'
    ) then
      raise exception '(هـ) pulse_series(«%») فيها نقطة بلا سلة صالحة أو بلا قيمة', v_s;
    end if;
  end loop;

  -- وفترة يوم واحد تُرجع نقطة واحدة لا صفراً (حدّ المدى الأدنى)
  select s.points into v_pts from public.pulse_series('orders', current_date, current_date) s;
  if jsonb_array_length(v_pts) <> 1 then
    raise exception '(هـ) مدى اليوم الواحد أرجع % نقطة لا واحدة', jsonb_array_length(v_pts);
  end if;

  raise notice '✔ (هـ) الأقسام السبعة تُرجع نقطة لكل يوم في المدى، والسلة بصيغة تاريخ صالحة';
end;
$$;

-- ----------------------------------------------------------------------------
-- (و) المُدخلات المرفوضة ترمي بتلميح يصنّفه الواجهة
-- ----------------------------------------------------------------------------
-- `classifyStatsError` في `lib/stats/read.ts` يقرأ `hint` — فتلميحٌ خاطئ يجعل
-- الشاشة تقول «نفّذ الهجرة» لخطأ مُدخل، وهو أسوأ من رسالة عامة.
-- ----------------------------------------------------------------------------
do $$
declare
  v_hint text;
  v_n    integer;
begin
  -- (و-١) قسم مجهول
  v_hint := null;
  begin
    select count(*) into v_n from public.pulse_stats('nope', current_date - 29, current_date);
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if v_hint is distinct from 'invalid-input' then
    raise exception '(و-١) قسم مجهول أعطى تلميح «%» بدل invalid-input', coalesce(v_hint, 'بلا استثناء');
  end if;

  -- (و-٢) فترة معكوسة
  v_hint := null;
  begin
    select count(*) into v_n from public.pulse_stats('dispatch', current_date, current_date - 29);
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if v_hint is distinct from 'invalid-input' then
    raise exception '(و-٢) فترة معكوسة أعطت تلميح «%» بدل invalid-input', coalesce(v_hint, 'بلا استثناء');
  end if;

  -- (و-٣) قسم لا سلسلة صادقة له يُرفض ولا يُرجع خطاً مسطّحاً من أصفار
  v_hint := null;
  begin
    select count(*) into v_n from public.pulse_series('partners', current_date - 13, current_date);
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if v_hint is distinct from 'invalid-input' then
    raise exception '(و-٣) pulse_series قبلت قسماً بلا سلسلة صادقة (تلميح «%»)', coalesce(v_hint, 'بلا استثناء');
  end if;

  -- (و-٣-ب) و`treasury` مسحوبة في 0035 — سطح محروس بلا مستهلك يُغلق لا يُصان
  v_hint := null;
  begin
    select count(*) into v_n from public.pulse_series('treasury', current_date - 13, current_date);
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if v_hint is distinct from 'invalid-input' then
    raise exception '(و-٣-ب) pulse_series ما زالت تقبل treasury رغم سحبها في 0035 (تلميح «%»)', coalesce(v_hint, 'بلا استثناء');
  end if;

  -- (و-٤) مدى أطول من ٤٠٠ يوم
  v_hint := null;
  begin
    select count(*) into v_n from public.pulse_series('orders', current_date - 500, current_date);
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if v_hint is distinct from 'invalid-input' then
    raise exception '(و-٤) مدى ٥٠٠ يوم مرّ بلا رفض (تلميح «%»)', coalesce(v_hint, 'بلا استثناء');
  end if;

  raise notice '✔ (و) القسم المجهول والفترة المعكوسة والمدى المفرط كلها ترمي بتلميح invalid-input';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ز) الحاجز الأول: الزائر لا ينفّذ أياً من الدالتين
-- ----------------------------------------------------------------------------
-- الكتلة ملفوفة بمعالج يعيد الدور، وإلا بقيت الجلسة عالقة بدور anon فتفشل كل
-- الأقسام التالية بلا سبب واضح.
-- ----------------------------------------------------------------------------
do $$
declare
  v_n  integer;
  v_ok boolean;
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    raise notice '  ↳ (ز) لا دور anon في هذه القاعدة — الفحص الحي متخطّى';
    return;
  end if;

  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claims', '', false);

  begin
    execute 'set local role anon';

    v_ok := false;
    begin
      execute 'select count(*) from public.pulse_stats(''orders'', null, null)' into v_n;
    exception when others then v_ok := true;
    end;
    if not v_ok then
      raise exception '(ز-١) anon نفّذ pulse_stats — أرقام اللوحة مكشوفة للزائر';
    end if;

    v_ok := false;
    begin
      execute 'select count(*) from public.pulse_series(''orders'', null, null)' into v_n;
    exception when others then v_ok := true;
    end;
    if not v_ok then
      raise exception '(ز-٢) anon نفّذ pulse_series — منحنى مبيعات المنصة مكشوف للزائر';
    end if;

    execute 'reset role';
  exception
    when others then
      execute 'reset role';
      raise;
  end;

  raise notice '✔ (ز) الزائر لا ينفّذ pulse_stats ولا pulse_series';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ح) 🔒 الحاجز الثاني: متعهد مسجَّل الدخول لا يرى رقماً واحداً
-- ----------------------------------------------------------------------------
-- وهذا هو الفحص الذي **لا يجوز أن يُستبدل بقراءة منحة**: المنحة لـ`authenticated`
-- موجودة عمداً (جلسة المشرف تمر بها)، والحاجز حارسٌ داخل الدالة. النداء الحيّ
-- وحده يفرّق بين الاثنين.
-- ----------------------------------------------------------------------------
do $$
declare
  v_user  constant uuid := 'a0000000-0000-4000-8000-0000000000c1';
  v_built boolean := false;
  v_n     integer;
  v_ok    boolean;
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    raise notice '  ↳ (ح) لا دور authenticated في هذه القاعدة — الفحص متخطّى';
    return;
  end if;

  begin
    insert into auth.users (id, instance_id, aud, role, email,
                            encrypted_password, email_confirmed_at,
                            created_at, updated_at)
    values (v_user, '00000000-0000-0000-0000-000000000000', 'authenticated',
            'authenticated', 'pulse-tests@example.invalid', '', now(), now(), now())
    on conflict (id) do nothing;

    insert into public.profiles (id, role)
    values (v_user, 'subcontractor')
    on conflict (id) do update set role = excluded.role;

    insert into public.subcontractors (profile_id, company_name, contact_name, phone, status)
    values (v_user, 'PULSE_TESTS شركة اختبار', 'مسؤول اختبار', '01000009401', 'approved');

    v_built := true;
  exception
    when others then
      -- التخطّي مقصود لقاعدة بلا مخطط auth، لا لفيكسترة معطوبة (النمط ٩)
      if to_regclass('auth.users') is not null then
        raise exception '(ح) تعذّر بناء الهوية رغم وجود auth.users: % — أصلح الفيكسترة، لا تتخطَّ الفحص', sqlerrm;
      end if;
      raise notice '  ↳ (ح) لا مخطط auth — تعذّر بناء هوية متعهد (%) — الفحص متخطّى', sqlerrm;
  end;

  if not v_built then
    return;
  end if;

  begin
    perform set_config('request.jwt.claim.sub', v_user::text, false);
    execute 'set local role authenticated';

    -- (ح-١) الهوية فعّالة فعلاً: يقرأ صف شركته (سياسة 0010). بدون هذا الإثبات
    --       يصير ما بعده «فحصاً لا يمكن أن يفشل».
    execute $q$select count(*) from public.subcontractors
               where company_name like 'PULSE_TESTS%'$q$ into v_n;
    if v_n <> 1 then
      raise exception '(ح-١) المتعهد لا يقرأ صف شركته (% صفاً) — الهوية غير فعّالة فلا معنى لما بعدها', v_n;
    end if;

    -- (ح-٢) ومع ذلك: كل قسم نبض يرفضه — لا صفاً بأصفار ولا أرقاماً جزئية
    v_ok := false;
    begin
      execute 'select count(*) from public.pulse_stats(''partners'', null, null)' into v_n;
    exception when others then v_ok := true;
    end;
    if not v_ok then
      raise exception '(ح-٢) المتعهد نفّذ pulse_stats(partners) — تكلفته وهامش المنصة مكشوفان';
    end if;

    v_ok := false;
    begin
      execute 'select count(*) from public.pulse_stats(''dispatch'', null, null)' into v_n;
    exception when others then v_ok := true;
    end;
    if not v_ok then
      raise exception '(ح-٣) المتعهد نفّذ pulse_stats(dispatch) — معدل قبول الشبكة كلها مكشوف له';
    end if;

    v_ok := false;
    begin
      execute 'select count(*) from public.pulse_stats(''accounts'', null, null)' into v_n;
    exception when others then v_ok := true;
    end;
    if not v_ok then
      raise exception '(ح-٤) المتعهد نفّذ pulse_stats(accounts) — تحصيل المنصة مكشوف له';
    end if;

    v_ok := false;
    begin
      execute 'select count(*) from public.pulse_series(''accounts'', null, null)' into v_n;
    exception when others then v_ok := true;
    end;
    if not v_ok then
      raise exception '(ح-٥) المتعهد نفّذ pulse_series(accounts) — منحنى تحصيل المنصة مكشوف له';
    end if;

    execute 'reset role';
    perform set_config('request.jwt.claim.sub', '', false);
  exception
    when others then
      execute 'reset role';
      perform set_config('request.jwt.claim.sub', '', false);
      raise;
  end;

  raise notice '✔ (ح) المتعهد يقرأ صف شركته ولا ينفّذ دالة نبض واحدة';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ط) التنظيف
-- ----------------------------------------------------------------------------
do $$
begin
  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claims', '', false);

  delete from public.subcontractors where company_name like 'PULSE_TESTS%';
  delete from public.profiles  where id = 'a0000000-0000-4000-8000-0000000000c1';
  delete from auth.users       where id = 'a0000000-0000-4000-8000-0000000000c1';

  raise notice '✔ (ط) التنظيف تم — لا صفوف اختبار متبقية';
end;
$$;

-- ----------------------------------------------------------------------------
-- الخلاصة
-- ----------------------------------------------------------------------------
do $$
begin
  raise notice 'ALL PASSED — نبض الصفحة: الخمسة عشر قسماً تحترم عقد StatCard، والسبعة مفوَّضة إلى section_stats بتطابق صفٍّ بصف (D-58)، والنسبة ذات المقام الصفري محذوفة بينما العدّاد يخرج ولو صفراً (تصليب 0035)، والسلسلة نقطة لكل يوم في سبعة أقسام، والمُدخل المرفوض يرمي invalid-input، ولا الزائر ولا المتعهد ينفّذ دالة نبض واحدة';
end;
$$;
