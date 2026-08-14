-- ============================================================================
-- customer_tests.sql — حسابات العملاء: الربط و«حجوزاتي»
--                      (المرحلة ١٢ب — المرحلة الأولى: هجرة 0044_customer_accounts.sql)
--
-- كيف تشغّله: `pnpm db:test customer` أو الصق الملف كاملاً في SQL Editor واضغط Run.
-- النجاح = آخر سطر «ALL PASSED».
--
-- ومن psql بدور صاحب القاعدة **لا بد** من ON_ERROR_STOP و‑1 معاً:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f supabase/tests/customer_tests.sql
--
-- ── الحاجز الأول: (هـ) 🔒 ما يراه عميلٌ **مسجَّل الدخول** من `bookings` ────
--
-- هذا هو الاختبار الذي وُلدت من أجله المجموعة كلها. المرحلة ١٢ب تفتح تسجيل
-- العملاء، فتصير `authenticated` تعني **أي زائر ملأ نموذجاً** بعد أن كانت تعني
-- متعهداً أو موظفاً (**D-20**). وسياسةٌ ساذجة واحدة على `bookings` قِيست فكشفت
-- التكلفة والهامش وهوية المتعهد، **ومعها ثلاثة اطلاعات** لأن الاثني عشر اطّلاعاً
-- كلها `security_invoker=true` فترث سياسات الجدول الأم.
--
-- فالفحص هنا **لا يقرأ سياسة ولا منحة**: يُنشئ حساب عميل حقيقياً، يسجّل دخوله،
-- **ويقرأ الأسطح الأربعة بنفسه** — ويشترط صفراً في كلٍّ منها حتى **بعد** أن يربط
-- حجزاً بحسابه. وشاهدٌ موجب معه: صاحب القاعدة يقرأ من `bookings` صفوفاً فعلاً،
-- وإلا كان «صفرٌ للعميل» صفرَ جدولٍ فارغ لا صفرَ حراسة.
--
-- ── الحاجز الثاني: (ز) التفويض مقيسٌ بأثره لا بنصّه ──────────────────────
--
-- `link_booking_by_reference` **تفوّض** إلى `find_booking_by_reference` ولا
-- تستنسخها (القاعدة ١٢ · **D-58**). ولا يُثبت ذلك بقراءة الجسم، بل بأن **خانق
-- 0027 نفسه يرتطم به المنادي**: ثماني محاولات فاشلة لا ترمي واحدةٌ منها، ثم
-- ترتفع `rate-limited`.
--
-- وشرطُ «لا ترمي» هو **D-48** حرفاً: كل نداء PostgREST معاملةٌ واحدة، فرفع
-- `not-found` يُرجعها **ومعها صفُّ العدّاد الذي كُتب لتوّه** ⇒ لا تُحسب المحاولة
-- الفاشلة، ويبقى تعدادُ المراجع — وهو كل ما يفعله المهاجم — بلا خانق. فأي غلافٍ
-- «ينظّف» المسار برفع الرمز يمحو الخانق **بلا أن يكسر شيئاً ظاهراً**، وهذا
-- الفحص هو ما يمسكه.
--
-- ── الحاجز الثالث: (و) و(ح) الهويّة من الجلسة، والربط لا ينزع ────────────
--
-- الدالتان لا تأخذان معرّف حساب وسيطاً بحال — وسيطٌ يعني أن حاملَ توكن يربطه
-- بحساب غيره فيرى الضحية في «حجوزاتي» رحلةً ليست له. ويُختبر بجلستَي عميلين
-- حقيقيتين: نفس التوكن من الحسابين يعطي **سطراً لكلٍّ منهما**، ولا ينزع أحدهما
-- من الآخر (المفتاح مركّب) — وحجزُ الثاني لا يظهر عند الأول إطلاقاً.
--
-- ── لماذا لا يلمس هذا الملف بيانات حقيقية ────────────────────────────────
--   • **الاختبار يملك بياناته كلها**: حسابان بمعرّفين ثابتين ينتهيان بـ`c0001`
--     و`c0002`، وحجزان بمرجعين `TR-CT0001` و`TR-CT0002`، ووسم `CUSTOMER_TESTS`
--     على كل نصّ. لا يقرأ حجزاً حقيقياً ولا يربط واحداً ولا يمسّ رحلةً جارية.
--   • ويُنظّف في **البداية والنهاية معاً**، فتشغيلٌ منهارٌ في المنتصف لا يمنع
--     التالي — ومعه صفوف التدقيق وعدّاد المحاولات، فلا يبقى أثرٌ ولا يُحسب
--     خانقُ عميلٍ حقيقي على محاولات فيكسترة.
--   • والتوقعات تُشتق من **صفّ الحجز نفسه** لا من أرقام محفورة: `total` يُقارَن
--     بـ`bookings.total`، لا بـ«١٠٠٠».
--
-- المرجع: lib/customer-types.ts (العقد) + supabase/migrations/0044_customer_accounts.sql
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (٠) الشروط المسبقة + تنظيف بقايا تشغيل سابق
-- ----------------------------------------------------------------------------
do $$
declare
  v_missing text;
  v_ids     uuid[];
begin
  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claims', '', false);

  if to_regclass('public.customer_bookings') is null then
    raise exception 'شرط مسبق: جدول الربط مفقود (نفّذ 0044_customer_accounts.sql)';
  end if;

  select string_agg(x.f, '، ') into v_missing
  from (values
    ('public.link_booking_by_reference(text, text, text)'),
    ('public.link_booking_by_token(text)'),
    ('public.my_bookings()'),
    -- والمفوَّض إليها: غيابها يعني أن الغلاف يستنسخ لا يفوّض
    ('public.find_booking_by_reference(text, text, text)')
  ) as x(f)
  where to_regprocedure(x.f) is null;
  if v_missing is not null then
    raise exception 'شرط مسبق: دوال مفقودة: %', v_missing;
  end if;

  -- التنظيف الأولي — بالترتيب: الحجوزات (تُسقط الروابط بالتتالي) ثم الحسابات
  select array_agg(b.id) into v_ids from public.bookings b where b.reference like 'TR-CT%';
  delete from public.bookings where reference like 'TR-CT%';
  delete from auth.users where email like 'customer_tests_%@example.invalid';
  delete from public.booking_lookup_attempts
   where client_key like 'acct:00000000-0000-4000-8000-0000000c%';
  delete from public.audit_log
   where (entity = 'customer_bookings' and booking_id = any (coalesce(v_ids, '{}'::uuid[])))
      or (entity = 'bookings' and entity_label like 'TR-CT%')
      or (entity = 'profiles'
          and entity_id in ('00000000-0000-4000-8000-0000000c0001'::uuid,
                            '00000000-0000-4000-8000-0000000c0002'::uuid));

  raise notice '✔ (٠) الشروط المسبقة سليمة — جدول الربط والدوال الثلاث والمفوَّض إليها';
end;
$$;

-- ----------------------------------------------------------------------------
-- (أ) بنية جدول الربط: RLS بلا سياسة، وبلا منح لأي دور عام، ورصدٌ تدقيقي
-- ----------------------------------------------------------------------------
do $$
declare
  v_n integer;
begin
  if not (select c.relrowsecurity from pg_class c
            join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relname = 'customer_bookings') then
    raise exception '(أ) RLS غير مفعّلة على جدول الربط';
  end if;

  -- صفر سياسات **مقصود**: العميل يقرأ my_bookings() وهي definer. وRLS المفعّلة
  -- بلا سياسات هي الطبقة التي تُبقي الباب مغلقاً لو أُعيدت منحةٌ سهواً غداً.
  select count(*) into v_n from pg_policy where polrelid = 'public.customer_bookings'::regclass;
  if v_n <> 0 then
    raise exception '(أ) جدول الربط عليه % سياسة — والمقصود صفر', v_n;
  end if;

  -- شاهدٌ موجب لكاشف المنح: `authenticated` يقرأ `bookings` فعلاً اليوم.
  -- بدونه يكون «صفر منح» أدناه صمتَ كاشفٍ معطوب لا صمتَ أمان.
  if not has_table_privilege('authenticated', 'public.bookings', 'select') then
    raise exception '(أ) كاشف منح الجداول لا يرى منحةً قائمة — الفحص نفسه معطوب';
  end if;

  select count(*) into v_n from information_schema.table_privileges
   where table_schema = 'public' and table_name = 'customer_bookings'
     and grantee in ('anon', 'authenticated', 'PUBLIC');
  if v_n > 0 then
    raise exception '(أ) جدول الربط ممنوح لدور عام (% منحة) — والمنح هو ما يرشّح الأعمدة', v_n;
  end if;

  -- ورصدُ التدقيق: جدولٌ جديد بلا مُشغّل ثغرةٌ في السجل الشامل (الملاحظة ١٥)
  if not exists (
    select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
     where not t.tgisinternal and c.relname = 'customer_bookings'
       and t.tgname like 'audit\_%'
  ) then
    raise exception '(أ) جدول الربط خارج رصد التدقيق';
  end if;

  raise notice '✔ (أ) جدول الربط: RLS مفعّلة بصفر سياسات، وصفر منح لدور عام، ورصدٌ تدقيقي';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ب) عقد `my_bookings`: اثنا عشر عموداً، والممنوعة غائبة من **الكتالوج**
-- ----------------------------------------------------------------------------
-- ⚠ لا مطابقة نصوص هنا: 0042 فحصت اسم عمود داخل **جسم** الدالة فوجدته جزءاً من
--    معرّفٍ آخر ومرّت خضراء على ميزةٍ معطوبة. فالأعمدة تُقرأ من عقد الإخراج نفسه.
-- ----------------------------------------------------------------------------
do $$
declare
  v_cols      text[];
  v_bad       text;
  v_forbidden constant text[] := array[
    -- عينُ `CUSTOMER_FORBIDDEN_COLUMNS` في lib/customer-types.ts
    'subcontractor_id', 'subcontractor_cost', 'subcontractor_cost_oneway',
    'margin_amount', 'price_source', 'public_token'];
  v_expected  constant text[] := array[
    -- عينُ حقول `MyBookingRow`
    'reference', 'status', 'class_title', 'total', 'currency', 'amount_due',
    'amount_remaining', 'origin_label', 'dest_label', 'pickup_at',
    'passengers', 'created_at'];
begin
  select array_agg(a.nm order by a.ord) into v_cols
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    cross join lateral unnest(p.proargnames, p.proargmodes)
      with ordinality as a(nm, md, ord)
   where n.nspname = 'public' and p.proname = 'my_bookings' and a.md::text = 't';

  -- 🔒 فحصُ الفحص أولاً: كاشفٌ لا يقرأ عموداً واحداً يمرّ أخضر فوق أي تسريب
  if v_cols is null or coalesce(array_length(v_cols, 1), 0) = 0 then
    raise exception '(ب) كاشف الأعمدة لم يقرأ عموداً واحداً — الفحص نفسه معطوب';
  end if;

  select string_agg(x.c, '، ') into v_bad
    from unnest(v_expected) as x(c) where not (x.c = any (v_cols));
  if v_bad is not null then
    raise exception '(ب) أعمدة العقد ناقصة من my_bookings: %', v_bad;
  end if;

  select string_agg(x.c, '، ') into v_bad
    from unnest(v_forbidden) as x(c) where x.c = any (v_cols);
  if v_bad is not null then
    raise exception '(ب) عمودٌ ممنوع في إخراج my_bookings: %', v_bad;
  end if;

  -- والزيادة تُوقف المجموعة كما يوقفها النقص: العقد يقول «قرارٌ بالإضافة»،
  -- فالعمود الثالث عشر يمرّ بمراجعة أو لا يمرّ — ولا يتسلّل.
  if array_length(v_cols, 1) <> 12 then
    raise exception '(ب) my_bookings تُخرج % عموداً لا اثني عشر: %',
      array_length(v_cols, 1), array_to_string(v_cols, '، ');
  end if;

  raise notice '✔ (ب) my_bookings اثنا عشر عموداً هي عين MyBookingRow، ولا عمود ممنوع فيها';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ج) 🔒 القاعدة الحاكمة: لا سياسة `SELECT` جديدة على `bookings`
-- ----------------------------------------------------------------------------
do $$
declare
  v_n integer;
begin
  -- شاهدٌ موجب: الكاشف يقرأ الجدول الصحيح ويجد سياسته الإدارية
  if not exists (
    select 1 from pg_policy where polrelid = 'public.bookings'::regclass
       and polname = 'bookings_select_admin'
  ) then
    raise exception '(ج) كاشف السياسات لا يجد bookings_select_admin — يقرأ الجدول الخطأ';
  end if;

  select count(*) into v_n from pg_policy
   where polrelid = 'public.bookings'::regclass and polcmd = 'r';
  if v_n <> 1 then
    raise exception '(ج) سياسات SELECT على bookings % لا واحدة — والواحدة هي الإدارية. سياسةٌ ثانية تفتح v_booking_profit وv_stats_orders وv_stats_customers معها', v_n;
  end if;

  select count(*) into v_n from pg_policy where polrelid = 'public.bookings'::regclass;
  if v_n <> 3 then
    raise exception '(ج) سياسات bookings % لا ثلاث (قراءة/تعديل/حذف إدارية)', v_n;
  end if;

  raise notice '✔ (ج) سياسات bookings ثلاثٌ إدارية كما كانت — ولا سياسة قراءة للعميل';
end;
$$;

-- ----------------------------------------------------------------------------
-- (د) الفيكسترة: حسابا عميل حقيقيان وحجزان — الاختبار يملك بياناته
-- ----------------------------------------------------------------------------
do $$
declare
  v_role_a text;
  v_role_b text;
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                          created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  values
    ('00000000-0000-4000-8000-0000000c0001', '00000000-0000-0000-0000-000000000000',
     'authenticated', 'authenticated', 'customer_tests_a@example.invalid', 'x',
     now(), now(), '{}'::jsonb, '{"full_name": "CUSTOMER_TESTS عميل أ"}'::jsonb),
    ('00000000-0000-4000-8000-0000000c0002', '00000000-0000-0000-0000-000000000000',
     'authenticated', 'authenticated', 'customer_tests_b@example.invalid', 'x',
     now(), now(), '{}'::jsonb, '{"full_name": "CUSTOMER_TESTS عميل ب"}'::jsonb);

  -- §٣ في العقد: الافتراضي `customer` مقصودٌ ومحروس — لا ترقية بالسهو
  select p.role into v_role_a from public.profiles p
   where p.id = '00000000-0000-4000-8000-0000000c0001';
  select p.role into v_role_b from public.profiles p
   where p.id = '00000000-0000-4000-8000-0000000c0002';
  if v_role_a is distinct from 'customer' or v_role_b is distinct from 'customer' then
    raise exception '(د) دور الحساب الجديد «%»/«%» لا customer — §٣ في العقد انكسر',
      coalesce(v_role_a, '(بلا ملفّ)'), coalesce(v_role_b, '(بلا ملفّ)');
  end if;

  insert into public.bookings (reference, public_token, status, class_slug, class_title,
                               total, currency, plan, amount_due, amount_remaining,
                               customer_name, customer_phone, trip)
  values
    ('TR-CT0001', repeat('a', 48), 'confirmed', 'ct-sedan', 'CUSTOMER_TESTS فئة',
     1000, 'EGP', 'deposit', 200, 800, 'CUSTOMER_TESTS عميل أ', '01000000001',
     jsonb_build_object('originLabel', 'CUSTOMER_TESTS مبدأ',
                        'destLabel',   'CUSTOMER_TESTS منتهى',
                        'passengers',  3,
                        'pickupAt',    (now() + interval '2 days')::text)),
    ('TR-CT0002', repeat('b', 48), 'completed', 'ct-sedan', 'CUSTOMER_TESTS فئة',
     2000, 'EGP', 'full', 2000, 0, 'CUSTOMER_TESTS عميل ب', '01000000002',
     jsonb_build_object('originLabel', 'CUSTOMER_TESTS مبدأ ٢',
                        'destLabel',   'CUSTOMER_TESTS منتهى ٢',
                        'passengers',  1,
                        'pickupAt',    (now() - interval '5 days')::text));

  -- وتكلفةٌ وهامشٌ على الحجز الأول: بلا رقمٍ ممنوعٍ **موجودٍ فعلاً** يصير فحص
  -- «لا تُسرَّب التكلفة» فحصاً على عمودٍ فارغ — أي فحصاً لا يمكن أن يفشل.
  update public.bookings
     set subcontractor_cost = 700, margin_amount = 300, price_source = 'tariff'
   where reference = 'TR-CT0001';

  raise notice '✔ (د) حسابا عميل بدور customer، وحجزان بتكلفة وهامش حقيقيين على الأول';
end;
$$;

-- ----------------------------------------------------------------------------
-- (هـ) 🔒 الحاجز الأول: ماذا يقرأ عميلٌ **مسجَّل الدخول** من الأسطح الأربعة؟
-- ----------------------------------------------------------------------------
do $$
declare
  v_a       uuid := '00000000-0000-4000-8000-0000000c0001';
  v_token   text;
  v_ref     text;
  v_n       integer;
  v_owner   integer;
  v_surface text;
  v_got     text;
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    raise notice '  ↳ (هـ) لا دور authenticated — الفحص متخطّى';
    return;
  end if;

  select b.public_token, b.reference into v_token, v_ref
    from public.bookings b where b.reference = 'TR-CT0001';

  -- شاهدٌ موجب: صاحب القاعدة يقرأ صفوفاً فعلاً. بدونه يكون «صفرٌ للعميل» صفرَ
  -- جدولٍ فارغ لا صفرَ حراسة — وهو بعينه «فحصٌ لا يمكن أن يفشل».
  select count(*) into v_owner from public.bookings;
  if v_owner < 2 then
    raise exception '(هـ) صاحب القاعدة يقرأ % صفاً — الشاهد الموجب ساقط', v_owner;
  end if;

  begin
    perform set_config('request.jwt.claim.sub', v_a::text, false);
    execute 'set local role authenticated';

    -- الهوية فعّالة؟ بدونها ما بعدها لا يقيس شيئاً
    execute 'select (select auth.uid())::text' into v_got;
    if v_got is distinct from v_a::text then
      raise exception '(هـ) الهوية المحقونة غير فعّالة (auth.uid() = %)', coalesce(v_got, '(بلا)');
    end if;

    -- والربط يقع بجلسة العميل نفسها لا بصلاحية المالك
    execute format('select count(*) from public.link_booking_by_token(%L)', v_token) into v_n;
    if v_n <> 1 then
      raise exception '(هـ) link_booking_by_token أعادت % صفاً لا واحداً', v_n;
    end if;

    -- 🔒 والقياس: أربعة أسطح، صفرٌ في كلٍّ منها **بعد** الربط لا قبله
    foreach v_surface in array array['public.bookings', 'public.v_booking_profit',
                                     'public.v_stats_orders', 'public.v_stats_customers'] loop
      if to_regclass(v_surface) is null then
        continue;
      end if;
      begin
        execute format('select count(*) from %s', v_surface) into v_n;
      exception when others then
        -- رفضُ الصلاحية أشدّ من صفر صفوف، فيُقبل
        v_n := 0;
      end;
      if v_n <> 0 then
        raise exception '(هـ) 🔴 عميلٌ مسجَّل قرأ % صفاً من % — سياسةٌ أو منحةٌ فتحت السطح', v_n, v_surface;
      end if;
    end loop;

    -- ولا يقرأ جدول الربط مباشرةً كذلك
    v_n := -1;
    begin
      execute 'select count(*) from public.customer_bookings' into v_n;
    exception when others then
      v_n := -1;
    end;
    if v_n <> -1 then
      raise exception '(هـ) عميلٌ مسجَّل قرأ جدول الربط مباشرةً (% صفاً)', v_n;
    end if;

    -- وفي المقابل: `my_bookings()` تُعطيه حجزه هو
    execute 'select count(*) from public.my_bookings()' into v_n;
    if v_n <> 1 then
      raise exception '(هـ) my_bookings أعادت % صفاً لا واحداً بعد ربطٍ ناجح', v_n;
    end if;

    execute 'reset role';
    perform set_config('request.jwt.claim.sub', '', false);
  exception
    when others then
      execute 'reset role';
      perform set_config('request.jwt.claim.sub', '', false);
      raise;
  end;

  raise notice '✔ (هـ) عميلٌ مسجَّل يقرأ صفراً من bookings وv_booking_profit وv_stats_orders وv_stats_customers ومن جدول الربط — ويقرأ حجزه من my_bookings وحدها (وصاحب القاعدة يقرأ % صفاً)', v_owner;
end;
$$;

-- ----------------------------------------------------------------------------
-- (و) الحمولة: القيم صحيحة، والممنوعُ **غائب من الحمولة المقيسة** لا محجوب
-- ----------------------------------------------------------------------------
do $$
declare
  v_a         uuid := '00000000-0000-4000-8000-0000000c0001';
  v_row       jsonb;
  v_keys      text;
  v_bad       text;
  v_b         record;
  v_forbidden constant text[] := array[
    'subcontractor_id', 'subcontractor_cost', 'subcontractor_cost_oneway',
    'margin_amount', 'price_source', 'public_token'];
begin
  select b.* into v_b from public.bookings b where b.reference = 'TR-CT0001';

  -- شاهدٌ موجب: الأرقام الممنوعة موجودة فعلاً على الصف، فغيابها من الحمولة حجبٌ
  -- حقيقي لا غيابُ بيانات
  if v_b.subcontractor_cost is null or v_b.margin_amount is null then
    raise exception '(و) الحجز بلا تكلفة أو هامش — الفحص كان سيمرّ على عمودٍ فارغ';
  end if;

  perform set_config('request.jwt.claim.sub', v_a::text, false);
  select to_jsonb(m) into v_row from public.my_bookings() m limit 1;
  perform set_config('request.jwt.claim.sub', '', false);

  if v_row is null then
    raise exception '(و) my_bookings صفر صفوف — الفحص كان سيمرّ فوق ميزة معطوبة';
  end if;

  select string_agg(t.k, '، ' order by t.k) into v_keys
    from (select jsonb_object_keys(v_row) k) t;

  select string_agg(x.c, '، ') into v_bad
    from unnest(v_forbidden) as x(c) where v_row ? x.c;
  if v_bad is not null then
    raise exception '(و) مفتاحٌ ممنوع في الحمولة المقيسة: %', v_bad;
  end if;

  -- ولا قيمةَ ممنوعة تحت اسمٍ بريء: التكلفة والهامش رقمان معلومان هنا
  if v_row::text like ('%' || v_b.subcontractor_cost::text || '%')
     or v_row::text like ('%' || v_b.margin_amount::text || '%') then
    raise exception '(و) رقم التكلفة أو الهامش ظهر في الحمولة تحت مفتاح آخر: %', v_row::text;
  end if;

  -- والتوقعات من **صفّ الحجز نفسه** لا من أرقام محفورة
  if (v_row ->> 'reference') is distinct from v_b.reference then
    raise exception '(و) reference «%» لا «%»', v_row ->> 'reference', v_b.reference;
  end if;
  if (v_row ->> 'total')::numeric is distinct from v_b.total then
    raise exception '(و) total «%» لا «%» — أهو رقمٌ آخر من الصف؟', v_row ->> 'total', v_b.total;
  end if;
  if (v_row ->> 'amount_due')::numeric is distinct from v_b.amount_due
     or (v_row ->> 'amount_remaining')::numeric is distinct from v_b.amount_remaining then
    raise exception '(و) المدفوع/المتبقي لا يطابقان الصف';
  end if;
  if (v_row ->> 'origin_label') is distinct from (v_b.trip ->> 'originLabel')
     or (v_row ->> 'dest_label') is distinct from (v_b.trip ->> 'destLabel') then
    raise exception '(و) مبدأ الرحلة أو منتهاها لا يطابقان trip';
  end if;
  if (v_row ->> 'passengers')::integer
       is distinct from (v_b.trip ->> 'passengers')::integer then
    raise exception '(و) عدد الركاب «%» لا «%»',
      v_row ->> 'passengers', v_b.trip ->> 'passengers';
  end if;
  if (v_row ->> 'pickup_at') is null then
    raise exception '(و) موعد الالتقاء لم يخرج رغم وجوده في trip';
  end if;
  if (v_row ->> 'status') is distinct from v_b.status then
    raise exception '(و) الحالة لا تطابق الصف';
  end if;

  raise notice '✔ (و) الحمولة المقيسة: % — والقيم من صفّ الحجز نفسه، ولا تكلفة ولا هامش لا اسماً ولا قيمة', v_keys;
end;
$$;

-- ----------------------------------------------------------------------------
-- (ز) 🔒 الحاجز الثاني: الربط بالمرجع **يفوّض**، و«لا نتيجة» لا ترمي (D-48)
-- ----------------------------------------------------------------------------
do $$
declare
  v_a      uuid := '00000000-0000-4000-8000-0000000c0001';
  v_b      uuid := '00000000-0000-4000-8000-0000000c0002';
  v_n      integer;
  v_i      integer;
  v_first  integer := null;
  v_hint   text;
  v_got    text;
begin
  -- ── (ز-١) بحسابٍ نظيف: مرجعٌ صحيح بهاتفه ⇒ ربطٌ ناجح ────────────────────
  perform set_config('request.jwt.claim.sub', v_b::text, false);

  select l.reference into v_got
    from public.link_booking_by_reference('tr ct0002', '01000000002', 'probe') l;
  if v_got is distinct from 'TR-CT0002' then
    raise exception '(ز-١) الربط بالمرجع أعاد «%» لا TR-CT0002 — أو أن تطبيع المرجع لا يُفوَّض',
      coalesce(v_got, '(صفر صفوف)');
  end if;

  -- ── (ز-٢) مرجعٌ صحيح بهاتفٍ خاطئ ⇒ **صفر صفوف بلا استثناء** ─────────────
  -- ولا تفريق بينه وبين «مرجعٌ لا وجود له»: التفريق يجعل النموذج مُثبِتاً لوجود
  -- الحجز لمن يملك المرجع وحده.
  begin
    select count(*) into v_n from public.link_booking_by_reference(
      'TR-CT0001', '01099999999', 'probe');
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    raise exception '(ز-٢) هاتفٌ خاطئ رمى (تلميح: %) — والمسار يجب أن يرجع صفر صفوف',
      coalesce(v_hint, '(بلا)');
  end;
  if v_n <> 0 then
    raise exception '(ز-٢) هاتفٌ خاطئ أعاد % صفاً — البوابة تُطابق بـis not distinct from؟', v_n;
  end if;

  -- ولم يُربط شيء بالفعل
  if exists (
    select 1 from public.customer_bookings cb
      join public.bookings bk on bk.id = cb.booking_id
     where cb.profile_id = v_b and bk.reference = 'TR-CT0001'
  ) then
    raise exception '(ز-٢) 🔴 هاتفٌ خاطئ ربط حجز غيره';
  end if;

  -- ── (ز-٣) مدخلٌ ناقص ⇒ `invalid-input` من المفوَّض إليها بتلميحها ────────
  v_hint := null;
  begin
    perform * from public.link_booking_by_reference('X', '01000000002', 'probe');
    raise exception '(ز-٣) مرجعٌ من حرف واحد مرّ بلا رفض';
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if v_hint is distinct from 'invalid-input' then
    raise exception '(ز-٣) تلميح المدخل الناقص «%» لا invalid-input', coalesce(v_hint, '(بلا)');
  end if;

  -- ── (ز-٤) 🔒 والخانق: بحسابٍ آخر حتى لا تختلط العدّادات ─────────────────
  -- عشرون محاولة بمرجعٍ لا وجود له. المطلوب أمران معاً:
  --   • أول رفضٍ لا يقع قبل التاسعة  ⇒ ثماني محاولات فاشلة **لم ترمِ** (D-48)
  --   • ووقوعُه أصلاً بـ`rate-limited` ⇒ الغلاف **يفوّض** إلى دالة 0027 لا يستنسخها
  -- والعشرون (لا التسع) لأن حدّ النافذة ربع ساعة قد ينقلب أثناء التشغيل، فيبدأ
  -- العدّ من جديد — والاختبار لا يجوز أن يفشل بسبب عقرب ساعة.
  perform set_config('request.jwt.claim.sub', v_a::text, false);

  for v_i in 1..20 loop
    exit when v_first is not null;
    begin
      select count(*) into v_n from public.link_booking_by_reference(
        'TR-ZZZZZZ', '01000000000', 'probe');
      if v_n <> 0 then
        raise exception '(ز-٤) مرجعٌ لا وجود له أعاد % صفاً', v_n;
      end if;
    exception when others then
      get stacked diagnostics v_hint = pg_exception_hint;
      v_first := v_i;
    end;
  end loop;

  if v_first is null then
    raise exception '(ز-٤) 🔴 عشرون محاولة بلا خانق — الربط لا يفوّض إلى find_booking_by_reference';
  end if;
  if v_hint is distinct from 'rate-limited' then
    raise exception '(ز-٤) أول رفض تلميحه «%» لا rate-limited', coalesce(v_hint, '(بلا)');
  end if;
  if v_first < 9 then
    raise exception '(ز-٤) 🔴 أول رفضٍ عند المحاولة % — ومسار «لا نتيجة» يجب ألا يرمي، وإلا رجعت معاملةُ النداء ومعها صفُّ العدّاد فلم تُحسب المحاولة الفاشلة (D-48)', v_first;
  end if;

  perform set_config('request.jwt.claim.sub', '', false);

  raise notice '✔ (ز) الربط بالمرجع يفوّض (خانق ٠٠٢٧ ارتطم عند المحاولة %)، و«لا نتيجة» ترجع صفر صفوف بلا استثناء، والهاتف الخاطئ لا يربط ولا يفرّق', v_first;
end;
$$;

-- ----------------------------------------------------------------------------
-- (ح) 🔒 الحاجز الثالث: الهويّة من الجلسة، والربط لا ينزع، والعزل بين حسابين
-- ----------------------------------------------------------------------------
do $$
declare
  v_a     uuid := '00000000-0000-4000-8000-0000000c0001';
  v_b     uuid := '00000000-0000-4000-8000-0000000c0002';
  v_tok1  text;
  v_refs  text;
  v_n     integer;
  v_hint  text;
begin
  select b.public_token into v_tok1 from public.bookings b where b.reference = 'TR-CT0001';

  -- (ح-١) نفس التوكن من حسابٍ ثانٍ ⇒ سطرٌ له هو، **ولا نزع من الأول**
  perform set_config('request.jwt.claim.sub', v_b::text, false);
  select count(*) into v_n from public.link_booking_by_token(v_tok1);
  if v_n <> 1 then
    raise exception '(ح-١) الحساب الثاني لم يُربط بالتوكن نفسه (% صفاً)', v_n;
  end if;

  select string_agg(m.reference, '، ' order by m.reference) into v_refs
    from public.my_bookings() m;
  if v_refs is distinct from 'TR-CT0001، TR-CT0002' then
    raise exception '(ح-١) قائمة الحساب الثاني «%» لا الحجزين معاً', coalesce(v_refs, '(فارغة)');
  end if;

  perform set_config('request.jwt.claim.sub', v_a::text, false);
  select string_agg(m.reference, '، ' order by m.reference) into v_refs
    from public.my_bookings() m;

  -- 🔒 والعزل: حجزُ الثاني لا يظهر عند الأول، والأول لم يفقد حجزه
  if v_refs is distinct from 'TR-CT0001' then
    raise exception '(ح-٢) 🔴 قائمة الحساب الأول «%» — إما أنه فقد حجزه بربط غيره، أو أنه يرى حجز غيره',
      coalesce(v_refs, '(فارغة)');
  end if;

  -- (ح-٣) وإعادة الربط رفضٌ بتلميحه — نجاحٌ في نظر العميل، لا تكرارٌ صامت
  v_hint := null;
  begin
    perform * from public.link_booking_by_token(v_tok1);
    raise exception '(ح-٣) إعادة الربط مرّت بلا رفض';
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if v_hint is distinct from 'already-linked' then
    raise exception '(ح-٣) تلميح إعادة الربط «%» لا already-linked', coalesce(v_hint, '(بلا)');
  end if;

  -- (ح-٤) وتوكنٌ لا وجود له ⇒ `not-found` — ويجوز الرمي هنا: لا عدّاد في المسار
  v_hint := null;
  begin
    perform * from public.link_booking_by_token(repeat('z', 48));
    raise exception '(ح-٤) توكنٌ لا وجود له مرّ بلا رفض';
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if v_hint is distinct from 'not-found' then
    raise exception '(ح-٤) تلميح التوكن المجهول «%» لا not-found', coalesce(v_hint, '(بلا)');
  end if;

  -- (ح-٥) وتوكنٌ قصير ⇒ `invalid-input` قبل أي بحث
  v_hint := null;
  begin
    perform * from public.link_booking_by_token('قصير');
    raise exception '(ح-٥) توكنٌ قصير مرّ بلا رفض';
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if v_hint is distinct from 'invalid-input' then
    raise exception '(ح-٥) تلميح التوكن القصير «%» لا invalid-input', coalesce(v_hint, '(بلا)');
  end if;

  -- (ح-٦) وبلا جلسة: لا ربط ولا قائمة — الهوية من `auth.uid()` لا من وسيط
  perform set_config('request.jwt.claim.sub', '', false);
  v_hint := null;
  begin
    perform * from public.link_booking_by_token(v_tok1);
    raise exception '(ح-٦) 🔴 الربط تمّ بلا جلسة — الهوية تأتي من غير auth.uid()';
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if v_hint is distinct from 'forbidden' then
    raise exception '(ح-٦) تلميح الربط بلا جلسة «%» لا forbidden', coalesce(v_hint, '(بلا)');
  end if;

  select count(*) into v_n from public.my_bookings();
  if v_n <> 0 then
    raise exception '(ح-٦) my_bookings أعادت % صفاً بلا جلسة', v_n;
  end if;

  raise notice '✔ (ح) الهوية من الجلسة وحدها، والتوكن نفسه يعطي سطراً لكل حساب بلا نزع، ولا يرى أحدهما حجز الآخر، والرفوض بتلميحاتها';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ط) الزائر لا ينفّذ واحدة من الثلاث
-- ----------------------------------------------------------------------------
do $$
declare
  v_bad text;
  v_ok  boolean;
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    raise notice '  ↳ (ط) لا دور anon — الفحص متخطّى';
    return;
  end if;

  -- شاهدٌ موجب: الكاشف يرى منحةً قائمة لـanon فعلاً (get_booking_by_token)
  if not has_function_privilege('anon', 'public.get_booking_by_token(text)', 'execute') then
    raise exception '(ط) كاشف الصلاحيات لا يرى منحةً قائمة — الفحص نفسه معطوب';
  end if;

  select string_agg(x.f, '، ') into v_bad
    from (values
      ('public.link_booking_by_reference(text, text, text)'),
      ('public.link_booking_by_token(text)'),
      ('public.my_bookings()')
    ) as x(f)
   where has_function_privilege('anon', x.f, 'execute');
  if v_bad is not null then
    raise exception '(ط) الزائر ينفّذ: %', v_bad;
  end if;

  -- ونداءٌ حيّ فوق قراءة الكتالوج
  perform set_config('request.jwt.claim.sub', '', false);
  begin
    execute 'set local role anon';

    v_ok := false;
    begin
      execute 'select * from public.my_bookings()';
    exception when others then v_ok := true;
    end;
    if not v_ok then
      raise exception '(ط) anon نفّذ my_bookings فعلاً';
    end if;

    v_ok := false;
    begin
      execute 'select * from public.link_booking_by_token(''00000000000000000000000000000000000000000000'')';
    exception when others then v_ok := true;
    end;
    if not v_ok then
      raise exception '(ط) anon نفّذ link_booking_by_token فعلاً';
    end if;

    execute 'reset role';
  exception
    when others then
      execute 'reset role';
      raise;
  end;

  raise notice '✔ (ط) الزائر لا ينفّذ دالة حسابات واحدة — كتالوجاً ونداءً';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ي) التنظيف
-- ----------------------------------------------------------------------------
do $$
declare
  v_ids uuid[];
  v_n   integer;
begin
  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claims', '', false);

  select array_agg(b.id) into v_ids from public.bookings b where b.reference like 'TR-CT%';

  delete from public.bookings where reference like 'TR-CT%';
  delete from auth.users where email like 'customer_tests_%@example.invalid';

  -- وعدّادُ المحاولات: محاولاتُ فيكسترة لا يجوز أن تُحسب على أحد
  delete from public.booking_lookup_attempts
   where client_key like 'acct:00000000-0000-4000-8000-0000000c%';

  delete from public.audit_log
   where (entity = 'customer_bookings' and booking_id = any (coalesce(v_ids, '{}'::uuid[])))
      or (entity = 'bookings' and entity_label like 'TR-CT%')
      or (entity = 'profiles'
          and entity_id in ('00000000-0000-4000-8000-0000000c0001'::uuid,
                            '00000000-0000-4000-8000-0000000c0002'::uuid));

  select count(*) into v_n from public.customer_bookings cb
   where cb.profile_id in ('00000000-0000-4000-8000-0000000c0001'::uuid,
                           '00000000-0000-4000-8000-0000000c0002'::uuid);
  if v_n <> 0 then
    raise exception '(ي) بقي % رابطاً بعد التنظيف', v_n;
  end if;

  raise notice '✔ (ي) التنظيف تم — لا حساب ولا حجز ولا رابط ولا عدّاد ولا أثر في السجل';
end;
$$;

-- ----------------------------------------------------------------------------
-- الخلاصة
-- ----------------------------------------------------------------------------
do $$
begin
  raise notice 'ALL PASSED — حسابات العملاء: جدول الربط بـRLS مفعّلة وصفر سياسات وصفر منح لدور عام ورصدٍ تدقيقي، وmy_bookings اثنا عشر عموداً هي عين MyBookingRow بلا تكلفة ولا هامش ولا price_source ولا public_token — اسماً وقيمةً معاً، **وعميلٌ مسجَّل الدخول يقرأ صفراً من bookings وv_booking_profit وv_stats_orders وv_stats_customers ومن جدول الربط نفسه** بينما صاحب القاعدة يقرأ صفوفه، ولا سياسة SELECT جديدة على bookings، والربط بالمرجع **يفوّض** إلى خانق find_booking_by_reference و«لا نتيجة» ترجع صفر صفوف بلا استثناء (D-48)، وهاتفٌ خاطئ لا يربط ولا يفرّق، والهوية من الجلسة وحدها فالتوكن نفسه يعطي سطراً لكل حساب بلا نزع ولا يرى أحدهما حجز الآخر، ولا زائر ينفّذ دالةً واحدة';
end;
$$;
