-- ============================================================================
-- request_source_tests.sql — **مصدر كل طلب**: من أين جاء، وهل الحارس حيّ
--                            (هجرة 0127)
--
-- كيف تشغّله:
--   pnpm db:test request_source
-- أو من psql بدور صاحب القاعدة — و**لا بد** من ON_ERROR_STOP، وإلا تابع psql
-- بعد الكتلة الفاشلة وطبع «ALL PASSED» رغم الفشل:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/request_source_tests.sql
--
-- النجاح = آخر سطر «ALL PASSED». وأي فشل يرمي exception عربية فيها المتوقع
-- والفعلي.
--
-- ── ما الذي يُختبَر هنا فعلاً، ولماذا لا يكفي «الحقل يُحفظ» ────────────────
--
-- عمودُ مصدرٍ يُحفظ ويُعرض اختبارٌ **يطمئن ولا يحرس**: كل شيء يبقى أخضر لو نُزع
-- التطبيع كاملاً — الصفوف تُحفظ، واللوحة تعرض، والتأكيد الساذج يمرّ. والعطب
-- حينها لا يظهر إلا يوم يفتح المالك شاشة الطلبات فيجد فيها خمسة آلاف حرفٍ
-- منسوخة من رابطٍ لصقه أحدهم.
--
-- لذلك كل ادّعاءٍ هنا **نداءٌ حيّ** (القاعدة ١٩: مكتشِفٌ يقرأ نصّاً يكذب في
-- الاتجاهين)، والحارس مقرونٌ بقسم **طفرة** (🧬) يقتلع كل طبقةٍ على حدة ويطلب
-- من التأكيد أن **يفشل** — ثم يستعيد الأصل **قبل الحكم**، فتشخيصٌ فاشل لا يجوز
-- أن يترك القاعدة مطفَّرة. (النمط ٩ في LESSONS.md، ونظير (ح) في
-- `quote_request_tests.sql`.)
--
-- والطبقات ثلاث، وكلٌّ منها تُقاس **وحدها**:
--   (١) المُطبِّعات   `quote_source_tag` · `quote_source_host` · `quote_source_page`
--   (٢) المُشغّل      `quote_requests_normalize_source` — يطبّقها على كل كاتب
--   (٣) قيودُ الشكل   `*_shape_chk` — الجدار البنيويّ خلفهما
--
-- ⚠ قابل لإعادة التنفيذ بلا حدود: كل صفوف الاختبار موسومة بـ`RS_TESTS_FIXTURE`
--   داخل اسم العميل، وتُمسح في **بداية الملف ونهايته معاً** — فتشغيلٌ انهار في
--   منتصفه لا يمنع التالي. والإشعارات تُمسح أولاً (بلا مفتاح أجنبي).
--   و`audit_log` **لا يُمسّ**: سجلٌّ يُكتب بمُشغّل، وهو نفس ما تفعله بقية المجموعات.
--
-- المرجع: supabase/migrations/0127_landing_pages_and_request_source.sql
--         handover/DECISIONS.md (D-19 · D-20 · D-24)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (٠) الشروط المسبقة + كنس أي بقايا
-- ----------------------------------------------------------------------------
do $$
declare
  v_left integer;
  v_n    integer;
begin
  if to_regclass('public.quote_requests') is null then
    raise exception 'شرط مسبق: public.quote_requests غير موجود';
  end if;

  select count(*) into v_n
  from information_schema.columns
  where table_schema = 'public' and table_name = 'quote_requests'
    and column_name in ('source_page','source_referrer','utm_source','utm_medium','utm_campaign');
  if v_n <> 5 then
    raise exception 'شرط مسبق: أعمدة المصدر % لا ٥ — نفّذ 0127 (pnpm db:migrate)', v_n;
  end if;

  if to_regprocedure('public.quote_source_tag(text)')  is null
     or to_regprocedure('public.quote_source_host(text)') is null
     or to_regprocedure('public.quote_source_page(text)') is null then
    raise exception 'شرط مسبق: مُطبِّعات المصدر غير موجودة — نفّذ 0127';
  end if;

  if to_regprocedure('public.quote_request_sources()') is null then
    raise exception 'شرط مسبق: public.quote_request_sources غير موجودة — نفّذ 0127';
  end if;

  -- 🔒 التوقيع الثلاثي‑عشري القديم يجب أن يكون قد سقط: بقاؤه يعني مساراً
  --    يُدرج طلباً بلا مصدرٍ إطلاقاً بينما اللوحة تعرض عموداً تظنه مملوءاً
  if to_regprocedure('public.create_quote_request(text,text,text,text,text,numeric,numeric,text,numeric,numeric,timestamptz,integer,integer)') is not null then
    raise exception 'شرط مسبق: التوقيع الثلاثي‑عشري ما زال قائماً — نداءٌ غامض بين توقيعين';
  end if;

  if not exists (select 1 from public.pages p where p.slug = 'private-trips' and p.published) then
    raise exception 'شرط مسبق: صفحة private-trips غير منشورة — نفّذ 0127';
  end if;

  delete from public.notifications n where n.payload ->> 'customerName' like '%RS_TESTS_FIXTURE%';
  delete from public.quote_requests q where q.customer_name like '%RS_TESTS_FIXTURE%';

  select count(*) into v_left from public.quote_requests q
   where q.customer_name like '%RS_TESTS_FIXTURE%';
  if v_left <> 0 then
    raise exception '(٠) بقيت % من صفوف تشغيلٍ سابق بعد الكنس', v_left;
  end if;

  raise notice '✔ (٠) الشروط المسبقة سليمة والأرض نظيفة';
end;
$$;

-- ----------------------------------------------------------------------------
-- (٠-ب) هوية المشرف — لازمة لـ`quote_request_sources()` المحروسة بـ`is_admin()`
--
-- نفس نمط `quote_request_tests.sql` (٠-ب): يُبحث عن مشرفٍ قائم، وإلا أُنشئ
-- مؤقتٌ يُحذف في التنظيف. و`request.jwt.claim.sub` تُضبط بالمعاملة فتقرؤها
-- `auth.uid()` داخل `is_admin()`.
-- ----------------------------------------------------------------------------
do $$
declare
  v_admin uuid;
begin
  perform set_config('tours.rs_admin', '', false);
  perform set_config('tours.rs_admin_fixture', '0', false);

  select p.id into v_admin from public.profiles p where p.role = 'admin' limit 1;

  if v_admin is null then
    begin
      v_admin := '0c0c0c0c-0c0c-4c0c-8c0c-0c0c0c0c0c0c'::uuid;
      delete from auth.users u where u.id = v_admin;
      insert into auth.users (id, email) values (v_admin, 'rs-tests-fixture@local.invalid');
      insert into public.profiles (id, role, full_name)
      values (v_admin, 'admin', 'مشرف اختبار مؤقت')
      on conflict (id) do update set role = 'admin';
      perform set_config('tours.rs_admin_fixture', '1', false);
      raise notice '  ↳ أُنشئ مشرف اختبار مؤقت (سيُحذف في النهاية)';
    exception
      when others then
        v_admin := null;
        raise notice '  ↳ تعذّر إنشاء مشرف مؤقت (%)', sqlerrm;
    end;
  end if;

  if v_admin is null then
    raise exception '(٠-ب) بلا هوية مشرف لا يُختبر تجميع المصادر — والتخطّي يعني ملفاً أخضر لا يفحص شيئاً';
  end if;

  perform set_config('tours.rs_admin', v_admin::text, false);
  raise notice '✔ (٠-ب) هوية المشرف جاهزة';
end;
$$;

-- ----------------------------------------------------------------------------
-- (أ) وسم الحملة — قائمةُ سماحٍ وسقفٌ وطيُّ فواصل، **بنداءٍ حيّ لا بقراءة نصّ**
-- ----------------------------------------------------------------------------
do $$
declare
  v      text;
  v_evil text;
begin
  -- (أ-١) 🔴 القيمة الخبيثة الطويلة: وسمُ نصّ + محرفُ توجيه + ٥٠٠٠ حرف
  --       والمطلوب **تنظيفٌ لا رفض**: الطلب يصل والوسم يُقصّ.
  v_evil := E'  <ScRiPt>alert(1)</ScRiPt>\u202E\u200F  ' || repeat('a', 5000);
  v := public.quote_source_tag(v_evil);

  if v is null then
    raise exception '(أ-١) المُطبّع محا الوسم كله — المطلوب تنظيفٌ لا إعدام';
  end if;
  if length(v) <> 64 then
    raise exception '(أ-١) طول الوسم المُطبَّع % لا ٦٤ — السقف ليس مفروضاً', length(v);
  end if;
  if v ~ '[<>()/\u200E\u200F\u202A-\u202E\u2066-\u2069]' then
    raise exception '(أ-١) 🔴 محرفُ وسمٍ أو توجيهٍ نجا من المُطبّع: [%]', v;
  end if;
  if v <> lower(v) then
    raise exception '(أ-١) الحالة لم تُخفَّض — الوسم الواحد يصير سطرين في تقرير المالك';
  end if;

  -- (أ-٢) الحالة تُخفَّض فيصير الوسمان وسماً واحداً
  if public.quote_source_tag('Ramadan') is distinct from public.quote_source_tag('ramadan') then
    raise exception '(أ-٢) «Ramadan» و«ramadan» خرجا وسمين مختلفين';
  end if;

  -- (أ-٣) العربية تنجو — حملةٌ باسمٍ عربي ليست قذارةً تُمحى
  v := public.quote_source_tag('حملة   رمضان__2026');
  if v <> 'حملة-رمضان-2026' then
    raise exception '(أ-٣) الوسم العربي خرج [%] لا «حملة-رمضان-2026»', v;
  end if;

  -- (أ-٤) الفراغ والفواصل وحدها ⇒ لا وسم (لا سلسلةٌ فارغة تُعرض في اللوحة)
  if public.quote_source_tag('   ---   ') is not null then
    raise exception '(أ-٤) فواصلُ محضة أنتجت وسماً بدل null';
  end if;
  if public.quote_source_tag(null) is not null then
    raise exception '(أ-٤) null أنتج وسماً';
  end if;

  -- (أ-٥) 🔒 والناتج **يجب أن يجتاز قيدَ الشكل دائماً**: مُطبِّعٌ يُخرج ما يرفضه
  --       القيد ليس حارساً بل سببٌ في ضياع الطلب. والقصّ عند ٦٤ قد يترك فاصلاً
  --       معلّقاً — وهذه الحالة بعينها.
  v := public.quote_source_tag(repeat('ab-', 30));
  if v !~ '^[a-z0-9\u0600-\u06FF][a-z0-9 ._\u002D\u0600-\u06FF]*$' then
    raise exception '(أ-٥) 🔴 ناتج المُطبّع لا يجتاز قيدَ الشكل: [%]', v;
  end if;

  raise notice '✔ (أ) وسم الحملة: يُنظَّف ويُقصّ عند ٦٤ ويُخفَّض، والعربية تنجو';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ب) مضيف المُحيل — أضيق من الوسم، **والخصوصية هي السبب**
-- ----------------------------------------------------------------------------
do $$
declare v text;
begin
  -- (ب-١) 🔴 عنوانٌ كامل يُرفض **كاملاً** — ولا يُقصّ إلى مضيف.
  --       ولماذا الرفض لا القصّ: لأن القصّ يعني أننا قبلنا مبدأ استقبال عنوانٍ
  --       كامل، وسلسلةُ استعلامه قد تحمل بريدَ الزائر أو توكن جلسته.
  if public.quote_source_host('https://ads.example.com/x?token=SECRET&email=a@b.c') is not null then
    raise exception '(ب-١) 🔴 عنوانٌ كامل قُبل مضيفاً — سلسلةُ استعلامٍ غريبة تدخل قاعدتنا';
  end if;
  if public.quote_source_host('ads.example.com/x') is not null then
    raise exception '(ب-١) مضيفٌ بمسارٍ قُبل';
  end if;

  -- (ب-٢) اسمٌ خالص يمرّ، و`www.` تُنزع، والحالة تُخفَّض
  v := public.quote_source_host('WWW.Facebook.com');
  if v <> 'facebook.com' then
    raise exception '(ب-٢) المضيف خرج [%] لا «facebook.com»', v;
  end if;

  -- (ب-٣) والناتج يجتاز قيدَ الشكل مهما طال المدخل
  v := public.quote_source_host(repeat('a', 60) || '.' || repeat('b', 60) || '.com');
  if v is not null and v !~ '^[a-z0-9]([a-z0-9.-]{0,98}[a-z0-9])?$' then
    raise exception '(ب-٣) 🔴 ناتج مُطبّع المضيف لا يجتاز قيدَ الشكل: [%]', v;
  end if;

  raise notice '✔ (ب) المُحيل: مضيفٌ خالص أو لا شيء — ولا عنوان كامل يدخل';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ج) 🔴 المسار الداخلي — **قائمةٌ مغلقة تُطابَق بصفوفنا**، وهذا ما يجعله موثوقاً
-- ----------------------------------------------------------------------------
do $$
declare v text;
begin
  -- (ج-١) صفحةٌ لنا تمرّ بنصّها
  if public.quote_source_page('/business') <> '/business' then
    raise exception '(ج-١) مسارٌ داخليّ صحيح رُفض';
  end if;
  if public.quote_source_page('/') <> '/' then
    raise exception '(ج-١) الجذر رُفض';
  end if;
  if public.quote_source_page('/services/tours') <> '/services/tours' then
    raise exception '(ج-١) صفحةُ خدمةٍ رُفضت';
  end if;
  if public.quote_source_page('/routes/cairo-alexandria') <> '/routes/cairo-alexandria' then
    raise exception '(ج-١) صفحةُ مسارٍ رُفضت';
  end if;
  -- مسارُ تطبيقٍ محجوز — مقروءٌ من `reserved_slugs` نفسها لا من قائمةٍ ثانية
  if public.quote_source_page('/book') <> '/book' then
    raise exception '(ج-١) «/book» رُفض وهو صفٌّ slug-reserved';
  end if;

  -- (ج-٢) D-24: بادئة اللغة إعادةُ كتابةٍ لا صفحةٌ أخرى، والشرطة الختامية تُنزع
  if public.quote_source_page('/en/business/') <> '/business' then
    raise exception '(ج-٢) 🔴 بادئة اللغة أو الشرطة الختامية لم تُنزع — المصدر الواحد صار مصدرين';
  end if;
  if public.quote_source_page('/ar/private-trips') <> '/private-trips' then
    raise exception '(ج-٢) بادئة العربية لم تُنزع';
  end if;

  -- (ج-٣) 🔴 الخصوصية: توكن المتابعة ومعرّف الدفع وسطح الحساب **تُرفض**
  if public.quote_source_page('/booking/9f3a2b1c4d5e6f70') is not null then
    raise exception '(ج-٣) 🔴 مسارُ توكن متابعةٍ قُبل مصدراً — نسخةٌ ثانية من مفتاح وصول';
  end if;
  if public.quote_source_page('/payment/return/pi-123') is not null then
    raise exception '(ج-٣) مسارُ نيّة دفعٍ قُبل مصدراً';
  end if;
  if public.quote_source_page('/account/bookings') is not null then
    raise exception '(ج-٣) سطحُ حسابٍ مُصادَق قُبل مصدراً';
  end if;

  -- (ج-٤) وما ليس لنا يُرفض: صفحةٌ لا وجود لها، ومسارٌ إداريّ، وعنوانٌ خارجيّ
  if public.quote_source_page('/no-such-page-anywhere') is not null then
    raise exception '(ج-٤) 🔴 مسارٌ لا يقابله صفٌّ قُبل — أي أن «القائمة المغلقة» مفتوحة';
  end if;
  if public.quote_source_page('/admin/orders') is not null then
    raise exception '(ج-٤) مسارٌ إداريّ قُبل';
  end if;
  if public.quote_source_page('/portal') is not null then
    raise exception '(ج-٤) مسارُ بورتالٍ قُبل';
  end if;
  if public.quote_source_page('https://evil.example/business') is not null then
    raise exception '(ج-٤) عنوانٌ خارجيّ قُبل مساراً داخلياً';
  end if;

  -- (ج-٥) 🔴 والحقن يُقصّ من جذره: ما لا يطابق شكل المسار لا يُقارَن بشيء
  if public.quote_source_page('/business" onload="alert(1)') is not null then
    raise exception '(ج-٥) 🔴 مسارٌ بمحارف حقنٍ قُبل';
  end if;
  if public.quote_source_page('/business/../../etc/passwd') is not null then
    raise exception '(ج-٥) مسارٌ بتصاعدٍ نسبيّ قُبل';
  end if;

  -- (ج-٦) سلسلةُ الاستعلام تُقطع ولا تُخزَّن — الحملة تعيش في أعمدتها
  if public.quote_source_page('/business?utm_campaign=x&token=SECRET') <> '/business' then
    raise exception '(ج-٦) 🔴 سلسلةُ الاستعلام لم تُقطع — سرٌّ يهبط في عمود مصدر';
  end if;

  -- (ج-٧) والناتج يجتاز قيدَ الشكل دائماً
  v := public.quote_source_page('/services/tours');
  if v !~ '^/[a-z0-9/_-]*$' or length(v) > 80 then
    raise exception '(ج-٧) ناتج مُطبّع المسار لا يجتاز قيدَ الشكل: [%]', v;
  end if;

  raise notice '✔ (ج) المسار الداخلي: قائمةٌ مغلقة — ولا توكن ولا مسارٌ غريب يدخلها';
end;
$$;

-- ----------------------------------------------------------------------------
-- (د) المسار الكامل — `create_quote_request` تحمل المصدر، **بنداءٍ حيّ**
--
-- وهذا هو التأكيد الذي لا يغني عنه شيء: أن ما تكتبه الواجهة يصل الصفَّ
-- **مُطبَّعاً**، لا أن الدوال تعمل وحدها في المختبر.
-- ----------------------------------------------------------------------------
do $$
declare
  v_name constant text := 'عميل RS_TESTS_FIXTURE د';
  v_when constant timestamptz := now() + interval '9 days';
  v_res  record;
  v_row  record;
begin
  select * into v_res from public.create_quote_request(
    null, v_name, '01000000011', 'تفاصيل',
    'ميدان التحرير', 30.0444, 31.2357, null, null, null,
    v_when, 2, null,
    '/en/private-trips/',                                  -- مسارٌ داخليّ ببادئة لغة
    'https://ads.example.com/x?token=SECRET',              -- عنوانٌ كامل ⇒ يُرفض
    E'  <ScRiPt>alert(1)</ScRiPt>\u202E' || repeat('X', 300),
    'CPC',
    'حملة   رمضان__2026');

  select * into v_row from public.quote_requests q where q.id = v_res.id;

  if v_row.source_page <> '/private-trips' then
    raise exception '(د-١) source_page = [%] لا «/private-trips»', v_row.source_page;
  end if;
  if v_row.source_referrer is not null then
    raise exception '(د-٢) 🔴 عنوانٌ كامل بتوكن هبط في source_referrer: [%]', v_row.source_referrer;
  end if;
  if length(v_row.utm_source) <> 64
     or v_row.utm_source ~ '[<>()/\u200E\u200F\u202A-\u202E\u2066-\u2069]' then
    raise exception '(د-٣) 🔴 utm_source وصل غير مُطبَّع: [%]', v_row.utm_source;
  end if;
  if v_row.utm_medium <> 'cpc' then
    raise exception '(د-٤) utm_medium = [%] لا «cpc»', v_row.utm_medium;
  end if;
  if v_row.utm_campaign <> 'حملة-رمضان-2026' then
    raise exception '(د-٥) utm_campaign = [%] لا «حملة-رمضان-2026»', v_row.utm_campaign;
  end if;

  raise notice '✔ (د) المسار الكامل: ما تكتبه الواجهة يصل الصفَّ مُطبَّعاً';
end;
$$;

-- ----------------------------------------------------------------------------
-- (هـ) «غير معروف» حالةٌ مشروعة — والطلبات القائمة لم تُكسر
--
-- ⚠ وهذا ليس تأكيداً شكلياً: عمودٌ `not null` أو بافتراضيٍّ مثل `'direct'` كان
--   ينسب إلى ثلاثة طلباتٍ حقيقية مصدراً **لم يقسه أحد**. الفراغ يقول «لا أعرف»
--   والافتراضيّ يقول «أعرف» كذباً.
-- ----------------------------------------------------------------------------
do $$
declare
  v_name constant text := 'عميل RS_TESTS_FIXTURE هـ';
  v_res  record;
  v_row  record;
  v_n    integer;
begin
  -- (هـ-١) نداءٌ بالتوقيع القديم تماماً (١٣ وسيطاً) — الافتراضيّات تجعله يعمل
  select * into v_res from public.create_quote_request(
    null, v_name, '01000000012', 'تفاصيل',
    'ميدان التحرير', 30.0444, 31.2357, null, null, null,
    now() + interval '9 days', 2, null);

  select * into v_row from public.quote_requests q where q.id = v_res.id;
  if v_row.source_page is not null or v_row.source_referrer is not null
     or v_row.utm_source is not null or v_row.utm_medium is not null
     or v_row.utm_campaign is not null then
    raise exception '(هـ-١) طلبٌ بلا مصدر خرج بمصدرٍ مخترَع';
  end if;

  -- (هـ-٢) الأعمدة الخمسة كلها اختيارية بلا افتراضيّ
  select count(*) into v_n
  from information_schema.columns
  where table_schema = 'public' and table_name = 'quote_requests'
    and column_name in ('source_page','source_referrer','utm_source','utm_medium','utm_campaign')
    and (is_nullable <> 'YES' or column_default is not null);
  if v_n <> 0 then
    raise exception '(هـ-٢) % عمودَ مصدرٍ إلزاميّ أو بافتراضيّ — الماضي يُنسب إليه ما لم يُقَس', v_n;
  end if;

  raise notice '✔ (هـ) «غير معروف» حالةٌ مشروعة — ولا صفَّ قديم كُسر';
end;
$$;

-- ----------------------------------------------------------------------------
-- (و) 🔒 الخصوصية — المصدر بياناتٌ عن الزائر، ولا يخرج إلى عميلٍ ولا متعهد
--     (D-19 · D-20 — والأمان **بنيويّ**: ما لا يوجد في نوع الإرجاع لا يُسرَّب)
-- ----------------------------------------------------------------------------
do $$
declare v_bad text;
begin
  -- (و-١) لا دالةً يستطيع الزائر أو المتعهد تنفيذها تُرجع عمود مصدر
  select string_agg(p.proname, ', ') into v_bad
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and (has_function_privilege('anon', p.oid, 'execute')
      or has_function_privilege('authenticated', p.oid, 'execute'))
    and p.proname <> 'quote_request_sources'   -- محروسةٌ بـ`is_admin()` في جسمها
    and pg_get_function_result(p.oid) ~ 'source_page|source_referrer|utm_source|utm_medium|utm_campaign';
  if v_bad is not null then
    raise exception '(و-١) 🔴 دالةٌ متاحةٌ للزائر أو المتعهد تُرجع عمود مصدر: %', v_bad;
  end if;

  -- (و-٢) ولا SELECT على الجدول نفسه لـ`anon`
  if has_table_privilege('anon', 'public.quote_requests', 'select') then
    raise exception '(و-٢) 🔴 anon يقرأ quote_requests مباشرةً';
  end if;

  -- (و-٣) 🔴 وحمولةُ الإشعار **لا تحمل المصدر**: هذه الحمولة تُصاغ رسالةً
  --       تُبرَق، ووصولُ وسمِ حملةٍ أو مسارِ تصفّحٍ فيها تسريبُ بياناتِ زائر
  --       إلى قناةٍ خارج اللوحة.
  select string_agg(distinct k, ', ') into v_bad
  from public.notifications n,
       lateral jsonb_object_keys(n.payload) k
  where n.event = 'quote_requested'
    and k in ('sourcePage','source_page','sourceReferrer','source_referrer',
              'utmSource','utm_source','utmMedium','utm_medium',
              'utmCampaign','utm_campaign');
  if v_bad is not null then
    raise exception '(و-٣) 🔴 مفتاحُ مصدرٍ في حمولة إشعار: %', v_bad;
  end if;

  raise notice '✔ (و) الخصوصية: المصدر لا يخرج إلى عميلٍ ولا متعهدٍ ولا إشعار';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ز) تجميع المصادر للوحة — والعدّ **داخل Postgres**، والحارس `is_admin()`
-- ----------------------------------------------------------------------------
do $$
declare
  v_admin uuid := nullif(current_setting('tours.rs_admin', true), '')::uuid;
  v_n     bigint;
  v_total bigint;
  v_ok    boolean;
begin
  perform set_config('request.jwt.claim.sub', v_admin::text, true);

  -- (ز-١) صفّا (د) و(هـ) يظهران في التجميع
  select s.n into v_n
  from public.quote_request_sources() s
  where s.kind = 'page' and s.bucket = '/private-trips';
  if coalesce(v_n, 0) < 1 then
    raise exception '(ز-١) طلبُ private-trips لا يظهر في تجميع الصفحات';
  end if;

  select s.n into v_n
  from public.quote_request_sources() s
  where s.kind = 'campaign' and s.bucket = 'حملة-رمضان-2026';
  if coalesce(v_n, 0) < 1 then
    raise exception '(ز-١) الحملة لا تظهر في تجميع الحملات';
  end if;

  -- (ز-٢) 🔴 و«غير معروف» **تُعرض ولا تُخفى**: صفٌّ بلا مصدر واقعةٌ يراها
  --       المالك، لا فراغٌ يُطوى فيظنّ أن كل طلباته مُنسَبة.
  select s.n into v_n
  from public.quote_request_sources() s
  where s.kind = 'page' and s.bucket = '—';
  if coalesce(v_n, 0) < 1 then
    raise exception '(ز-٢) 🔴 دلو «غير معروف» غائبٌ عن التجميع — المالك يقرأ نسبةً كاذبة';
  end if;

  -- (ز-٣) ومجموع دلاء الصفحات = عدد كل الطلبات (لا صفَّ يسقط من العدّ)
  select sum(s.n) into v_total from public.quote_request_sources() s where s.kind = 'page';
  select count(*) into v_n from public.quote_requests;
  if v_total <> v_n then
    raise exception '(ز-٣) مجموع دلاء الصفحات % ≠ عدد الطلبات %', v_total, v_n;
  end if;

  -- (ز-٤) 🔒 وبلا هويةِ مشرفٍ تُرفض — و`authenticated` تشمل كل متعهد (D-20)
  perform set_config('request.jwt.claim.sub', '', true);
  v_ok := false;
  begin
    perform 1 from public.quote_request_sources();
  exception when others then
    v_ok := true;
  end;
  if not v_ok then
    raise exception '(ز-٤) 🔴 تجميع المصادر مرّ بلا هوية مشرف';
  end if;

  perform set_config('request.jwt.claim.sub', v_admin::text, true);
  raise notice '✔ (ز) التجميع يعدّ داخل Postgres، ويعرض «غير معروف»، ويُرفض لغير المشرف';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ح) 🧬 **طفرة** — ثلاث طبقاتٍ تُقتلع كلٌّ على حدة
--
-- الاختبار الذي لا يفشل حين يُنزع حارسه ليس اختباراً. وثلاث طبقاتٍ تعني ثلاث
-- طفرات، لأن نزعَ واحدةٍ فقط قد تُمسكه الأخرى فيبدو الادّعاء «محروساً» بينما
-- الطبقة المقصودة ميتة — وهو بعينه الفخّ الذي وقعت فيه طفرةٌ سابقة في
-- `quote_request_tests.sql` (ح-٢) واضطُرّت إلى تغيير الانتقال المُختار.
--
-- والاستعادة **من التعريف الحيّ المُلتقط قبل الطفرة** (D-58) لا من نسخةٍ مكتوبة
-- هنا تنحرف عن الأصل بعد أول تعديل — و**قبل الحكم** دائماً.
-- ----------------------------------------------------------------------------
do $$
declare
  v_name   constant text := 'عميل RS_TESTS_FIXTURE ح';
  v_when   constant timestamptz := now() + interval '11 days';
  v_evil   text := E'<ScRiPt>alert(1)</ScRiPt>\u202E' || repeat('z', 5000);
  v_fn_def text;
  v_chk    text;
  v_res    record;
  v_stored text;
  v_caught boolean;
  v_step   text := '';
begin
  -- ══ (ح-٠) خطُّ الأساس: القيمة الخبيثة تُخزَّن **نظيفة** ═══════════════════
  select * into v_res from public.create_quote_request(
    null, v_name, '01000000013', 'تفاصيل',
    'ميدان التحرير', 30.0444, 31.2357, null, null, null,
    v_when, 2, null, null, null, v_evil, null, null);
  select q.utm_source into v_stored from public.quote_requests q where q.id = v_res.id;
  if length(v_stored) <> 64 then
    raise exception '(ح-٠) خطُّ الأساس مكسور سلفاً: الطول % لا ٦٤', length(v_stored);
  end if;

  -- التقاط الأصلين قبل أي طفرة
  select pg_get_functiondef('public.quote_source_tag(text)'::regprocedure) into v_fn_def;
  select pg_get_constraintdef(oid) into v_chk
    from pg_constraint
   where conrelid = 'public.quote_requests'::regclass
     and conname = 'quote_requests_utm_shape_chk';
  if v_fn_def is null or v_chk is null then
    raise exception '(ح) المُطبّع أو القيد غير موجود أصلاً — لا شيء يُقتلع';
  end if;

  begin
    -- ══ (ح-١) 🧬 يُسقَط القيد وحده ⇒ المُطبِّع يبقى، والقيمة تُخزَّن نظيفة ═══
    --     أي أن **التنظيف من المُطبِّع لا من الرفض** — ولولا هذه الخطوة لكان
    --     ممكناً أن يكون القيدُ وحده هو من يحمي، والمُطبِّع حبراً على ورق.
    v_step := 'ح-١';
    execute 'alter table public.quote_requests drop constraint quote_requests_utm_shape_chk';

    select * into v_res from public.create_quote_request(
      null, v_name, '01000000014', 'تفاصيل',
      'ميدان التحرير', 30.0444, 31.2357, null, null, null,
      v_when, 2, null, null, null, v_evil, null, null);
    select q.utm_source into v_stored from public.quote_requests q where q.id = v_res.id;
    if length(v_stored) <> 64 or v_stored ~ '[<>()/]' then
      raise exception
        '(ح-١) 🔴 أُسقط القيد فتلوّثت القيمة (% حرفاً) — أي أن المُطبِّع لا ينظّف شيئاً والقيدُ وحده كان يرفض',
        length(v_stored);
    end if;

    -- ══ (ح-٢) 🧬 ويُقتلع المُطبِّع أيضاً ⇒ **الخبيث يمرّ خاماً** ══════════════
    --     وهذا هو الشاهد الحاكم: بلا الطبقتين تهبط خمسة آلاف حرفٍ فيها وسمُ
    --     نصٍّ ومحرفُ توجيه في العمود الذي تعرضه لوحة المالك.
    v_step := 'ح-٢';
    execute $mut$
      create or replace function public.quote_source_tag(p_raw text)
      returns text language sql immutable set search_path = ''
      as $body$ select p_raw $body$;
    $mut$;

    select * into v_res from public.create_quote_request(
      null, v_name, '01000000015', 'تفاصيل',
      'ميدان التحرير', 30.0444, 31.2357, null, null, null,
      v_when, 2, null, null, null, v_evil, null, null);
    select q.utm_source into v_stored from public.quote_requests q where q.id = v_res.id;

    if length(v_stored) <= 64 or v_stored !~ '<ScRiPt>' then
      raise exception
        '(ح-٢) 🔴 نُزع المُطبِّع وأُسقط القيد وبقيت القيمة نظيفة (% حرفاً) — أي أن (أ) و(د) يؤكدان ما يفترضانه ولا يحرسان',
        length(v_stored);
    end if;

    -- ══ (ح-٣) ثم يُعاد المُطبِّع (والقيد ما زال ساقطاً) ⇒ يُمنع الخبيث ثانيةً ═
    v_step := 'ح-٣';
    execute v_fn_def;

    select * into v_res from public.create_quote_request(
      null, v_name, '01000000016', 'تفاصيل',
      'ميدان التحرير', 30.0444, 31.2357, null, null, null,
      v_when, 2, null, null, null, v_evil, null, null);
    select q.utm_source into v_stored from public.quote_requests q where q.id = v_res.id;
    if length(v_stored) <> 64 or v_stored ~ '[<>()/]' then
      raise exception '(ح-٣) لم يُستعَد المُطبِّع — القاعدة باقية على الطفرة';
    end if;
  exception when others then
    -- 🔒 الاستعادة قبل أي رفع: تشخيصٌ فاشل لا يجوز أن يترك القاعدة مطفَّرة.
    --    والترتيب مُلزِم: الدالة ← **محوُ صفوف الطفرة** ← القيد.
    execute v_fn_def;
    delete from public.quote_requests q where q.customer_name = v_name;
    begin
      execute format('alter table public.quote_requests add constraint %I %s',
                     'quote_requests_utm_shape_chk', v_chk);
    exception when others then null;
    end;
    raise;
  end;

  -- ══ الاستعادة الكاملة قبل الحكم النهائي ═══════════════════════════════════
  --
  -- 🔴 **ومحوُ صفوف الطفرة شرطٌ لا تنظيف:** `alter table … add constraint`
  --    يتحقّق من **كل الصفوف القائمة**، والصفُّ المُلوَّث الذي خلّفته (ح-٢) عمداً
  --    يجعل إعادةَ القيد تفشل — أي أن الطفرة كانت ستترك القاعدة **بلا جدارها
  --    الثالث** إلى الأبد. وقِيس هذا فعلاً في أول تشغيلٍ لهذا الملف.
  execute v_fn_def;
  delete from public.quote_requests q where q.customer_name = v_name;
  execute format('alter table public.quote_requests add constraint %I %s',
                 'quote_requests_utm_shape_chk', v_chk);

  -- ══ (ح-٤) 🧬 وأخيراً: يُعطَّل المُشغّل ⇒ **القيد وحده يردّ الخبيث** ════════
  --     الطبقة الثالثة. ولو لم تكن حيّة لكان كاتبٌ مباشر (محرر SQL أو
  --     `service_role`) يزرع في العمود ما يشاء بلا مارٍّ على الدالة العامة.
  execute 'alter table public.quote_requests disable trigger quote_requests_normalize_source';
  v_caught := false;
  begin
    begin
      insert into public.quote_requests
        (customer_name, customer_phone, details, origin_label, origin_lat, origin_lng,
         pickup_at, passengers, utm_source)
      values (v_name, '01000000017', 'طفرة', 'ميدان التحرير', 30.0444, 31.2357,
              v_when, 2, v_evil);
    exception when others then
      v_caught := true;   -- رُفض ⇒ القيد جدارٌ حيّ
    end;
    delete from public.quote_requests q
     where q.customer_name = v_name and q.customer_phone = '01000000017';
  exception when others then null;
  end;
  execute 'alter table public.quote_requests enable trigger quote_requests_normalize_source';

  if not v_caught then
    raise exception
      '(ح-٤) 🔴 عُطّل المُشغّل فمرّت قيمةٌ خبيثة خام — قيدُ الشكل ليس جداراً';
  end if;

  raise notice '✔ (ح) الطفرات الثلاث: كل طبقةٍ اقتُلعت وحدها فسقط الادّعاء، ثم أُعيدت فقام';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ط) التنظيف النهائي — بنفس ترتيب (٠)
-- ----------------------------------------------------------------------------
do $$
declare
  v_left  integer;
  v_admin uuid := nullif(current_setting('tours.rs_admin', true), '')::uuid;
begin
  perform set_config('request.jwt.claim.sub', '', true);

  delete from public.notifications n where n.payload ->> 'customerName' like '%RS_TESTS_FIXTURE%';
  delete from public.quote_requests q where q.customer_name like '%RS_TESTS_FIXTURE%';

  select count(*) into v_left from public.quote_requests q
   where q.customer_name like '%RS_TESTS_FIXTURE%';
  if v_left <> 0 then
    raise exception '(ط) بقيت % من صفوف الاختبار بعد التنظيف', v_left;
  end if;

  if current_setting('tours.rs_admin_fixture', true) = '1' and v_admin is not null then
    delete from public.profiles p where p.id = v_admin;
    delete from auth.users   u where u.id = v_admin;
    raise notice '  ↳ حُذف مشرف الاختبار المؤقت';
  end if;

  -- 🔒 والشاهد الأخير: القاعدة عادت إلى ما كانت عليه — لا طفرةَ بقيت
  if to_regprocedure('public.quote_source_tag(text)') is null then
    raise exception '(ط) 🔴 المُطبّع مفقود بعد الطفرات';
  end if;
  if public.quote_source_tag(repeat('a', 500)) is null
     or length(public.quote_source_tag(repeat('a', 500))) <> 64 then
    raise exception '(ط) 🔴 المُطبّع باقٍ على الطفرة — أعِد تشغيل 0127';
  end if;
  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.quote_requests'::regclass
                   and conname = 'quote_requests_utm_shape_chk') then
    raise exception '(ط) 🔴 قيدُ الشكل لم يُستعَد';
  end if;
  if not exists (select 1 from pg_trigger
                 where tgrelid = 'public.quote_requests'::regclass
                   and tgname = 'quote_requests_normalize_source'
                   and tgenabled <> 'D') then
    raise exception '(ط) 🔴 المُشغّل ما زال معطَّلاً';
  end if;

  raise notice '✔ (ط) الأرض نظيفة والقاعدة كما كانت';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ي) 🔴 محارفُ التنسيق غير المرئية — الانحدارُ الذي أنزلته `0127` وأصلحته `0129`
--
--     المدى `U+0600..U+06FF` يحوي **ثمانية محارف `Cf`** غير مرئية:
--     `U+0600..U+0605` و`U+061C` و`U+06DD`. و`U+061C` (ARABIC LETTER MARK)
--     محرفُ اتجاهٍ قويّ كـ`U+200F` — فكانت `0127` تُسقط `RLO`/`LRO`/`RLM`
--     (‏خارج المدى) **وتُبقي هذه**، فتبدو الحراسة قائمةً وهي مثقوبة.
--
--     🔴 وما يُختبَر هنا ليس «المحرف يسقط» بل **الأثر الذي يُحدثه بقاؤه**:
--        الوسمُ مفتاحُ `group by` في `quote_request_sources()`، فثلاثةُ صفوفٍ
--        تُقرأ كلها `ramadan` كانت تخرج **ثلاثَ حبّاتٍ متطابقةِ المنظر** بثلث
--        العدد لكلٍّ — أي أن الشاشة التي تجيب «أين أنفق؟» تكذب بلا أن تُخطئ.
-- ----------------------------------------------------------------------------
do $$
declare
  v_cp      integer;
  v_out     text;
  v_buckets integer;
begin
  -- (ي-١) الثمانية تسقط، واحداً واحداً وبالاسم
  foreach v_cp in array array[1536, 1537, 1538, 1539, 1540, 1541, 1564, 1757]
  loop
    v_out := public.quote_source_tag('a' || chr(v_cp) || 'b');
    if v_out is distinct from 'ab' then
      raise exception '(ي-١) 🔴 محرفُ التنسيق U+% نجا من المُطبّع: % (الطول %)',
        upper(to_hex(v_cp)), v_out, length(v_out);
    end if;
  end loop;

  -- (ي-٢) والعربيةُ المقروءة لم تُمسّ — الحارسُ يكذب في الاتجاهين
  if public.quote_source_tag('حملة رمضان 2026') <> 'حملة رمضان 2026' then
    raise exception '(ي-٢) 🔴 المُطبّع أتلف عربيةً مقروءة: %',
      public.quote_source_tag('حملة رمضان 2026');
  end if;
  if public.quote_source_tag('ARABIC ٠١٢٣') <> 'arabic ٠١٢٣' then
    raise exception '(ي-٢) 🔴 الأرقام الهندية لم تنجُ: %',
      public.quote_source_tag('ARABIC ٠١٢٣');
  end if;

  -- (ي-٣) 🔴 الأثر: ثلاثةُ وسومٍ تُقرأ سواءً ⇒ **حبّةٌ واحدة** لا ثلاث
  insert into public.quote_requests (customer_name, customer_phone, details, utm_campaign)
  values ('REQSRC_BIDI_FIXTURE-1', '01000000091', 'x', 'ramadan'),
         ('REQSRC_BIDI_FIXTURE-2', '01000000092', 'x', 'ramadan' || chr(1564)),
         ('REQSRC_BIDI_FIXTURE-3', '01000000093', 'x', chr(1564) || 'ramadan');

  select count(distinct utm_campaign) into v_buckets
  from public.quote_requests
  where customer_name like 'REQSRC_BIDI_FIXTURE-%';

  if v_buckets <> 1 then
    raise exception '(ي-٣) 🔴 وسمٌ واحد انشطر % حبّةً — التجميع يكذب على المالك', v_buckets;
  end if;

  -- (ي-٤) والقيد يردّه كذلك حين يُتجاوز المُطبّع (‏الطبقة الثالثة حيّة)
  begin
    alter table public.quote_requests disable trigger quote_requests_normalize_source;
    insert into public.quote_requests (customer_name, customer_phone, details, utm_campaign)
    values ('REQSRC_BIDI_FIXTURE-4', '01000000094', 'x', 'ram' || chr(1564) || 'adan');
    alter table public.quote_requests enable trigger quote_requests_normalize_source;
    raise exception '(ي-٤) 🔴 القيد قبِل وسماً فيه محرفُ اتجاه';
  exception
    when check_violation then
      alter table public.quote_requests enable trigger quote_requests_normalize_source;
  end;

  delete from public.quote_requests where customer_name like 'REQSRC_BIDI_FIXTURE-%';

  raise notice '✔ (ي) محارفُ التنسيق الثمانية تسقط، والعربيةُ تنجو، ووسمٌ واحد يبقى حبّةً واحدة';
end;
$$;

-- ----------------------------------------------------------------------------
-- ⚠ **`raise notice` لا `select`** — `scripts/db-test.mjs` يطبع أحداث `notice`
--    وحدها (‏`client.on("notice", ...)`)، فمجموعةٌ تنتهي بـ`select` تمرّ خضراء
--    **ولا تطبع «ALL PASSED» إطلاقاً**. وشرطُ البوابة في `docs/STANDING-ORDERS.md`
--    هو «كل مجموعة **تطبع** ALL PASSED» — فسطرُ `select` كان يُسقط الشرط صامتاً.
-- ----------------------------------------------------------------------------
do $$
begin
  raise notice 'ALL PASSED — مصدرُ الطلب: مُطبِّعٌ ومُشغِّلٌ وقيدٌ · ثلاثُ طفراتٍ · محارفُ التنسيق الثمانية · ولا مصدرَ يخرج إلى عميلٍ ولا متعهد';
end;
$$;
