-- ============================================================================
-- place_search_tests.sql — اختبارات قبول لهجرة 0076_place_search_settings
--
-- كيف تشغّله:
--   node scripts/db-test.mjs place_search
-- النجاح = آخر سطر في الرسائل «ALL PASSED». أي فشل exception عربية تحمل اسم
-- التأكيد والقيمة المتوقعة والفعلية.
--
-- ⚠⚠ لماذا كل كتلة تلمس الصف تتراجع عن نفسها ⚠⚠
-- الملف يُرسَل كاملاً كاستعلام واحد ⇒ معاملة واحدة على القاعدة **الحيّة**،
-- و`place_search_settings` جدولٌ **وحيد الصف عالمي**: لا يوجد صفُّ fixture
-- يمكن العبث به — الصف الوحيد هو صفّ المالك. فكل كتلة تكتب فيه تنتهي بـ
-- `raise exception 'ROLLBACK_MARKER'`؛ وكتلة الاستثناء في plpgsql نقطة حفظ
-- ضمنية، فيُلغى كل ما بداخلها. والقسم (ك) يقارن الصف بما كان عليه قبل الملف
-- كلّه — فلو تسرّبت كتابةٌ من كتلةٍ نسيت التراجع، **يسقط الاختبار**.
--
-- ما يغطيه الملف:
--   (أ) البنية: صف وحيد مبذور، RLS مفعّلة، والأعمدة الستة بأنواعها.
--   (ب) الافتراضيات **تُعيد سلوك اليوم** — وهو الثابت الذي يحمي كل نسخة
--       Whitelabel جديدة من أن تُفوتر عند جوجل من أول يوم بلا قرار.
--   (ج) قيد `min_query_chars` يرفض ١ و٧ فعلاً (وشاهدان إيجابيان: ٢ و٦ تمران).
--   (د) قيد `debounce_ms` يرفض ١٤٩ و٢٠٠١ (وشاهدان: ١٥٠ و٢٠٠٠ تمران).
--   (هـ) قيد `primary_provider` يرفض ما ليس في القائمة، ويقبل الاثنين.
--   (و) حيلة الصف الوحيد: الإدراج الثاني مرفوض.
--   (ز) `place_search_config()` تُرجع صفاً واحداً **حتى والجدول فارغ**، وقيمه
--       عندها هي الافتراضيات نفسها — أي أن «القاعدة لم تُبذر» لا يفتح جوجل.
--   (ح) الصلاحيات: `anon` لا يملك أياً من الصلاحيات السبع — **بسؤال
--       `has_table_privilege` لا بعدّ صفوف `information_schema`**، وأهمّها
--       `truncate` (لا تخضع لـRLS إطلاقاً)؛ و`place_search_config` ليست
--       لـ`authenticated`.
--   (ط) 🧬 **طفرة** — تُسقَط قيود الحدود الثلاثة، فتمرّ القيم التي رفضها القسمان
--       (ج) و(د) و(هـ). وهذا وحده ما يُثبت أن تلك الأقسام تقيس **القيد** لا
--       مصادفةً في الشكل: تأكيدٌ لا يمكن أن يفشل ليس حارساً (النمط ٩ في
--       `LESSONS.md`، وD-58).
--   (ي) 🔴 **RLS هي الحاجز الوحيد** (D-20): `authenticated` يملك صلاحيات الجدول
--       الأربع، فما بينه وبين الصفّ سياسات `is_admin()` وحدها. والمقيس:
--       السياسات الأربع بأسمائها وأوامرها، كلٌّ مشروطةٌ بـ`is_admin()` ولا
--       واحدة `to public`؛ ثم جلسةُ `authenticated` غير مشرفة تقرأ **صفر
--       صفوف** ويصيب تحديثها **صفر صفوف**.
--   (ك) التنظيف: صفّ المالك كما كان حرفاً بحرف.
--
-- المرجع: supabase/migrations/0076_place_search_settings.sql
--         · lib/place-search-types.ts (‏PlaceSearchSettings و PLACE_SEARCH_DEFAULTS)
--         · supabase/tests/trip_settings_tests.sql (نمط الكتلة المتراجعة)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (٠) الشروط المسبقة + لقطة صفّ المالك قبل أي شيء
-- ----------------------------------------------------------------------------
do $$
declare
  v_missing text;
  v_before  text;
begin
  if to_regclass('public.place_search_settings') is null then
    raise exception '(٠) جدول place_search_settings غير موجود — طبّق هجرة 0076 أولاً';
  end if;

  select string_agg(x.sig, '، ')
    into v_missing
  from (values ('public.place_search_config()')) as x(sig)
  where to_regprocedure(x.sig) is null;

  if v_missing is not null then
    raise exception '(٠) دوال ناقصة: % — طبّق هجرة 0076 أولاً', v_missing;
  end if;

  -- اللقطة تُحفظ في إعداد جلسة، ويقارنها القسم (ك) في آخر الملف
  select format(
           '%s|%s|%s|%s|%s|%s',
           google_enabled, primary_provider, map_picker_enabled,
           quote_fallback_enabled, min_query_chars, debounce_ms
         )
    into v_before
    from public.place_search_settings
   where id;

  if v_before is null then
    raise exception '(٠) الصف الوحيد غير مبذور — الهجرة تُدرجه بـ on conflict do nothing';
  end if;

  perform set_config('tours.place_search_before', v_before, false);
  raise notice '✔ (٠) الشروط المسبقة سليمة — لقطة صفّ المالك: %', v_before;
end;
$$;

-- ----------------------------------------------------------------------------
-- (أ) البنية — صف وحيد، RLS مفعّلة، والأعمدة الستة موجودة
-- ----------------------------------------------------------------------------
do $$
declare
  v_rows    integer;
  v_rls     boolean;
  v_columns integer;
begin
  select count(*) into v_rows from public.place_search_settings;
  if v_rows <> 1 then
    raise exception '(أ-١) عدد الصفوف % والمتوقع ١ — الجدول وحيد الصف', v_rows;
  end if;

  select relrowsecurity into v_rls
    from pg_class where oid = 'public.place_search_settings'::regclass;
  if not v_rls then
    raise exception '(أ-٢) RLS غير مفعّلة على place_search_settings';
  end if;

  select count(*) into v_columns
    from information_schema.columns
   where table_schema = 'public'
     and table_name   = 'place_search_settings'
     and column_name in (
       'google_enabled', 'primary_provider', 'map_picker_enabled',
       'quote_fallback_enabled', 'min_query_chars', 'debounce_ms'
     );
  if v_columns <> 6 then
    raise exception '(أ-٣) الأعمدة الموجودة % من ٦', v_columns;
  end if;

  raise notice '✔ (أ) البنية سليمة — صف وحيد، RLS مفعّلة، ستة أعمدة';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ب) 🔒 الافتراضيات تُعيد سلوك اليوم — الثابت الذي يحمي كل نسخة جديدة
--
-- ⚠ ولا تُقرأ من صفّ المالك (قد يكون غيّره بحق)، بل من **تعريف العمود نفسه**:
-- المفحوص هو ما تُولَد به نسخةٌ جديدة، لا ما ضبطه هذا المالك اليوم.
-- ----------------------------------------------------------------------------
do $$
declare
  v_google   text;
  v_provider text;
  v_chars    text;
  v_debounce text;
  v_map      text;
  v_quote    text;
begin
  select
    max(case when column_name = 'google_enabled'         then column_default end),
    max(case when column_name = 'primary_provider'       then column_default end),
    max(case when column_name = 'min_query_chars'        then column_default end),
    max(case when column_name = 'debounce_ms'            then column_default end),
    max(case when column_name = 'map_picker_enabled'     then column_default end),
    max(case when column_name = 'quote_fallback_enabled' then column_default end)
    into v_google, v_provider, v_chars, v_debounce, v_map, v_quote
    from information_schema.columns
   where table_schema = 'public' and table_name = 'place_search_settings';

  -- 🔴 جوجل مطفأ بالبذرة: نسخةٌ تُولَد وهو مشتغل تُفوتر من أول يوم بلا قرار
  if v_google is distinct from 'false' then
    raise exception '(ب-١) افتراضي google_enabled «%» والمتوقع false', v_google;
  end if;
  if v_provider not like '''nominatim''%' then
    raise exception '(ب-٢) افتراضي primary_provider «%» والمتوقع nominatim', v_provider;
  end if;
  -- ٢ و٣٥٠ هما MIN_QUERY_LENGTH و DEBOUNCE_MS اللذان كانا محفورين في الويدجت
  if v_chars is distinct from '2' then
    raise exception '(ب-٣) افتراضي min_query_chars «%» والمتوقع 2', v_chars;
  end if;
  if v_debounce is distinct from '350' then
    raise exception '(ب-٤) افتراضي debounce_ms «%» والمتوقع 350', v_debounce;
  end if;
  -- والمخرجان مفعّلان: مجانيان ولا يمسّان سعراً، وإطفاؤهما يعيد العطل نفسه
  if v_map is distinct from 'true' or v_quote is distinct from 'true' then
    raise exception '(ب-٥) مخرجا الطبقتين ٣ و٤ غير مفعّلين بالافتراض — map «%» quote «%»',
      v_map, v_quote;
  end if;

  raise notice '✔ (ب) الافتراضيات تُعيد سلوك اليوم — جوجل مطفأ، nominatim، ٢ حرف، ٣٥٠ مللي';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ج) + (د) + (هـ) القيود حيّة — ترفض ما خارج المدى وتقبل الطرفين
--
-- شاهدٌ إيجابي مع كل رفض: قيدٌ يرفض **كل شيء** يمرّ من اختبارٍ يفحص الرفض
-- وحده، وهو عطلٌ لا حراسة.
-- ----------------------------------------------------------------------------
do $$
declare
  v_rejected boolean;
begin
  begin
    -- ── (ج) min_query_chars ──────────────────────────────────────────────
    begin
      update public.place_search_settings set min_query_chars = 1 where id;
      v_rejected := false;
    exception when check_violation then v_rejected := true;
    end;
    if not v_rejected then
      raise exception '(ج-١) القيد قَبِل min_query_chars = 1 — والأرضية ٢';
    end if;

    begin
      update public.place_search_settings set min_query_chars = 7 where id;
      v_rejected := false;
    exception when check_violation then v_rejected := true;
    end;
    if not v_rejected then
      raise exception '(ج-٢) القيد قَبِل min_query_chars = 7 — والسقف ٦';
    end if;

    -- شاهدان إيجابيان: الطرفان يمرّان
    update public.place_search_settings set min_query_chars = 2 where id;
    update public.place_search_settings set min_query_chars = 6 where id;

    -- ── (د) debounce_ms ──────────────────────────────────────────────────
    begin
      update public.place_search_settings set debounce_ms = 149 where id;
      v_rejected := false;
    exception when check_violation then v_rejected := true;
    end;
    if not v_rejected then
      raise exception '(د-١) القيد قَبِل debounce_ms = 149 — والأرضية ١٥٠';
    end if;

    begin
      update public.place_search_settings set debounce_ms = 2001 where id;
      v_rejected := false;
    exception when check_violation then v_rejected := true;
    end;
    if not v_rejected then
      raise exception '(د-٢) القيد قَبِل debounce_ms = 2001 — والسقف ٢٠٠٠';
    end if;

    update public.place_search_settings set debounce_ms = 150 where id;
    update public.place_search_settings set debounce_ms = 2000 where id;

    -- ── (هـ) primary_provider ────────────────────────────────────────────
    begin
      update public.place_search_settings set primary_provider = 'osm' where id;
      v_rejected := false;
    exception when check_violation then v_rejected := true;
    end;
    if not v_rejected then
      raise exception '(هـ-١) القيد قَبِل primary_provider = osm — والقائمة google/nominatim';
    end if;

    begin
      update public.place_search_settings set primary_provider = '' where id;
      v_rejected := false;
    exception when check_violation then v_rejected := true;
    end;
    if not v_rejected then
      raise exception '(هـ-٢) القيد قَبِل primary_provider فارغاً';
    end if;

    update public.place_search_settings set primary_provider = 'google'    where id;
    update public.place_search_settings set primary_provider = 'nominatim' where id;

    raise notice '✔ (ج/د/هـ) القيود الثلاثة ترفض خارج المدى وتقبل الطرفين';
    raise exception 'ROLLBACK_MARKER';
  exception when others then
    if sqlerrm <> 'ROLLBACK_MARKER' then raise; end if;
  end;
end;
$$;

-- ----------------------------------------------------------------------------
-- (و) حيلة الصف الوحيد — `id boolean primary key check (id)`
-- ----------------------------------------------------------------------------
do $$
declare
  v_rejected boolean;
begin
  begin
    begin
      insert into public.place_search_settings (id) values (true);
      v_rejected := false;
    exception when unique_violation then v_rejected := true;
    end;
    if not v_rejected then
      raise exception '(و-١) قُبل صفٌّ ثانٍ بـ id = true';
    end if;

    begin
      insert into public.place_search_settings (id) values (false);
      v_rejected := false;
    exception when check_violation then v_rejected := true;
    end;
    if not v_rejected then
      raise exception '(و-٢) قُبل صفٌّ ثانٍ بـ id = false — والقيد check (id)';
    end if;

    raise notice '✔ (و) الجدول وحيد الصف بشقَّي الحيلة';
    raise exception 'ROLLBACK_MARKER';
  exception when others then
    if sqlerrm <> 'ROLLBACK_MARKER' then raise; end if;
  end;
end;
$$;

-- ----------------------------------------------------------------------------
-- (ز) 🔴 القارئ المتسامح — **صفٌّ واحد حتى والجدول فارغ**، وقيمه الافتراضيات
--
-- وهذا التأكيد أهم مما يبدو: مسار «القاعدة لم تُبذر» هو المسار الذي تمرّ به
-- كل نسخة Whitelabel جديدة لحظةَ إنشائها. ولو أرجع القارئ صفراً من الصفوف
-- لانفجر البحث العام؛ ولو أرجع `google_enabled = true` لفوتَرت النسخة الجديدة
-- من أول زائر.
-- ----------------------------------------------------------------------------
do $$
declare
  v_rows     integer;
  v_google   boolean;
  v_provider text;
  v_map      boolean;
  v_quote    boolean;
  v_chars    integer;
  v_debounce integer;
begin
  begin
    delete from public.place_search_settings where id;

    select count(*) into v_rows from public.place_search_config();
    if v_rows <> 1 then
      raise exception '(ز-١) القارئ أرجع % صفاً والجدول فارغ — والمتوقع ١ دائماً', v_rows;
    end if;

    select google_enabled, primary_provider, map_picker_enabled,
           quote_fallback_enabled, min_query_chars, debounce_ms
      into v_google, v_provider, v_map, v_quote, v_chars, v_debounce
      from public.place_search_config();

    if v_google is not false then
      raise exception '(ز-٢) القارئ فتح جوجل على جدول فارغ — google_enabled = %', v_google;
    end if;
    if v_provider <> 'nominatim' or v_chars <> 2 or v_debounce <> 350 then
      raise exception '(ز-٣) قيم القارئ على جدول فارغ: provider=% chars=% debounce=%',
        v_provider, v_chars, v_debounce;
    end if;
    if v_map is not true or v_quote is not true then
      raise exception '(ز-٤) مخرجا الطبقتين ٣ و٤ مطفآن على جدول فارغ — map=% quote=%',
        v_map, v_quote;
    end if;

    raise notice '✔ (ز) القارئ يُرجع صفاً واحداً بالافتراضيات حتى والجدول فارغ';
    raise exception 'ROLLBACK_MARKER';
  exception when others then
    if sqlerrm <> 'ROLLBACK_MARKER' then raise; end if;
  end;
end;
$$;

-- ----------------------------------------------------------------------------
-- (ح) الصلاحيات — `anon` بلا شيء، والقارئ ليس لـ`authenticated`
--
-- 🔒 وكل متعهد مستخدم `authenticated`: منحُ القارئ له يعني أن يقرأ سياسة
-- مزوّدينا وضوابط تكلفتنا بلا حاجة (نفس حكم `trip_config` و`dispatch_config`).
--
-- ⚠ **ولا يُسأل `information_schema.role_table_grants` عن هذا**: ذلك العرض لا
-- يُظهر المنحة إلا حين يكون المانح أو الممنوح **دوراً فعّالاً في الجلسة
-- الحالية**، فيُرجع صفراً بينما `anon` يملك الصلاحية فعلاً — حارسٌ قد لا يحرس.
-- والسؤال الصحيح يُوجَّه إلى المُقرِّر نفسه: `has_table_privilege` لكل صلاحية
-- على حدة. و**`truncate` أهمّها**: لا تخضع لـRLS إطلاقاً، وهي سبب كتلة
-- `revoke` التي تفرضها الاتفاقية §٦ — يمسح صفَّ الإعدادات كلَّه من يملكها.
-- ----------------------------------------------------------------------------
do $$
declare
  v_priv  text;
  v_held  text[] := '{}';
  v_auth  boolean;
  v_pub   boolean;
begin
  foreach v_priv in array array[
    'select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger'
  ] loop
    if has_table_privilege('anon', 'public.place_search_settings', v_priv) then
      v_held := v_held || v_priv;
    end if;
  end loop;

  if array_length(v_held, 1) is not null then
    raise exception
      '(ح-١) anon يملك على place_search_settings: % — كتلة revoke في 0076 سقطت (وTRUNCATE لا تخضع لـRLS)',
      array_to_string(v_held, '، ');
  end if;

  select has_function_privilege('authenticated', 'public.place_search_config()', 'execute')
    into v_auth;
  if v_auth then
    raise exception '(ح-٢) place_search_config ممنوحة لـ authenticated — وكل متعهد authenticated';
  end if;

  select has_function_privilege('anon', 'public.place_search_config()', 'execute') into v_pub;
  if v_pub then
    raise exception '(ح-٣) place_search_config ممنوحة لـ anon';
  end if;

  raise notice '✔ (ح) الصلاحيات مغلقة — anon لا يملك أياً من الصلاحيات السبع (ومنها TRUNCATE)، والقارئ ليس لـ authenticated';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ط) 🧬 **الطفرة** — تُنزع القيود الثلاثة، فتمرّ القيم التي رفضتها (ج/د/هـ)
--
-- وهذا هو التأكيد الوحيد الذي يُثبت أن الأقسام السابقة **تقيس القيد**. بدونه
-- يبقى احتمالٌ قائم أن الرفض جاء من نوع العمود أو من مشغّل أو من مصادفة، وأن
-- حذف كل `check` من الهجرة **لا يُسقط اختباراً واحداً** — وهو بالضبط نمط
-- «حارسٌ يطمئنك ولا يحرس» (النمط ٩ في `LESSONS.md` · D-58).
--
-- ⚠ والكتلة كلها داخل تراجعٍ ذاتي: القيود تعود لأن DDL في Postgres معاملاتي.
-- ----------------------------------------------------------------------------
do $$
declare
  v_passed boolean;
begin
  begin
    alter table public.place_search_settings
      drop constraint place_search_settings_min_query_chars_check,
      drop constraint place_search_settings_debounce_ms_check,
      drop constraint place_search_settings_primary_provider_check;

    -- القيم الثلاث التي رُفضت أعلاه يجب أن تمرّ الآن
    begin
      update public.place_search_settings
         set min_query_chars = 1, debounce_ms = 2001, primary_provider = 'osm'
       where id;
      v_passed := true;
    exception when others then v_passed := false;
    end;

    if not v_passed then
      raise exception
        '(ط) الطفرة لم تُغيّر السلوك: القيم رُفضت حتى بعد نزع القيود ⇒ الأقسام (ج/د/هـ) لا تقيس القيود';
    end if;

    raise notice '✔ (ط) 🧬 الطفرة أثبتت أن القيود هي الحارس فعلاً — بنزعها مرّت القيم الثلاث';
    raise exception 'ROLLBACK_MARKER';
  exception when others then
    if sqlerrm <> 'ROLLBACK_MARKER' then raise; end if;
  end;
end;
$$;

-- ----------------------------------------------------------------------------
-- (ي) 🔴 **RLS هي الحاجز الوحيد** — والمقيس هنا هو الحاجز لا وجود السياسات
--
-- الهجرة تمنح `authenticated` صلاحيات الجدول الأربع (D-20: المشرف يقرأ الجدول
-- مباشرةً بجلسته لا بمفتاح الخدمة). وكل متعهد وكل عميل مسجَّل مستخدم
-- `authenticated` — فما يفصل بينه وبين صفّ الإعدادات **سياسات `is_admin()`
-- وحدها**، ولا شيء غيرها. وسياسةٌ تنزلق إلى `to public` أو شرطٌ يُنزع في تعديل
-- لاحق يفتح الصفّ بلا أن يسقط أي اختبار آخر في هذا الملف.
--
-- ⚠ والكتلة تنتهي بـ`ROLLBACK_MARKER` كبقية الكتل الكاتبة: محاولة التحديث
-- أدناه **يجب** أن تصيب صفر صفوف، فإن أصابت صفاً (أي انفتحت السياسة) وجب أن
-- يُلغى أثرها قبل أن يقارن القسم (ك) صفّ المالك باللقطة.
-- ----------------------------------------------------------------------------
do $$
declare
  v_expected constant text[] := array[
    'place_search_settings_select_admin',
    'place_search_settings_insert_admin',
    'place_search_settings_update_admin',
    'place_search_settings_delete_admin'
  ];
  -- هوية لا وجود لها في `profiles` ⇒ `is_admin()` = false بلا زرع أي بيانات
  v_ghost constant uuid := '00000000-0000-4000-8000-000000760001';
  v_priv     text;
  v_missing  text[] := '{}';
  v_total    integer;
  v_matched  integer;
  v_names    text;
  v_owner    integer;
  v_uid      text;
  v_admin    boolean;
  v_rows     integer;
  v_updated  integer;
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    raise notice '  ↳ (ي) لا دور authenticated — الفحص متخطّى';
    return;
  end if;

  -- (ي-١) الشرط الذي يجعل ما بعده ذا معنى: المنح الجدولي قائم فعلاً
  foreach v_priv in array array['select', 'insert', 'update', 'delete'] loop
    if not has_table_privilege('authenticated', 'public.place_search_settings', v_priv) then
      v_missing := v_missing || v_priv;
    end if;
  end loop;
  if array_length(v_missing, 1) is not null then
    raise exception
      '(ي-١) authenticated بلا صلاحيات جدولية: % — تغيّر عقد 0076، وما بعده لا يقيس RLS',
      array_to_string(v_missing, '، ');
  end if;

  -- (ي-٢) أربع سياسات بالضبط، ولا خامسة
  select count(*) into v_total
    from pg_policies
   where schemaname = 'public' and tablename = 'place_search_settings';
  if v_total <> 4 then
    select string_agg(policyname, '، ' order by policyname) into v_names
      from pg_policies
     where schemaname = 'public' and tablename = 'place_search_settings';
    raise exception '(ي-٢) عدد السياسات % لا ٤ — الموجود: %', v_total, coalesce(v_names, '(بلا)');
  end if;

  -- (ي-٣) وهي الأربع المتوقَّعة بأسمائها وأوامرها لا أربعٌ أياً كانت
  select count(*) into v_matched
    from pg_policies p
   where p.schemaname = 'public' and p.tablename = 'place_search_settings'
     and (p.policyname, p.cmd) in (
       ('place_search_settings_select_admin', 'SELECT'),
       ('place_search_settings_insert_admin', 'INSERT'),
       ('place_search_settings_update_admin', 'UPDATE'),
       ('place_search_settings_delete_admin', 'DELETE')
     );
  if v_matched <> 4 then
    raise exception '(ي-٣) المطابق من السياسات المتوقَّعة % من ٤ — المتوقَّع: %',
      v_matched, array_to_string(v_expected, '، ');
  end if;

  -- (ي-٤) كل واحدة مشروطة بـ is_admin() — في `using` أو في `with check`
  select string_agg(policyname, '، ' order by policyname) into v_names
    from pg_policies
   where schemaname = 'public' and tablename = 'place_search_settings'
     and coalesce(qual, '') || ' ' || coalesce(with_check, '') not like '%is_admin%';
  if v_names is not null then
    raise exception '(ي-٤) سياسات بلا شرط is_admin(): % — المسار مفتوح لكل authenticated', v_names;
  end if;

  -- (ي-٥) ولا واحدة ممنوحة لـ public: `to public` تشمل anon مهما قال revoke
  select string_agg(policyname, '، ' order by policyname) into v_names
    from pg_policies
   where schemaname = 'public' and tablename = 'place_search_settings'
     and 'public' = any(roles);
  if v_names is not null then
    raise exception '(ي-٥) سياسات ممنوحة to public: %', v_names;
  end if;

  -- شاهدٌ موجب قبل الانتحال: صاحب القاعدة يقرأ الصفّ فعلاً. بدونه يكون «صفرٌ
  -- للمتعهد» صفرَ جدولٍ فارغ لا صفرَ حراسة (النمط ٩ في LESSONS.md).
  select count(*) into v_owner from public.place_search_settings;
  if v_owner <> 1 then
    raise exception '(ي-٦) صاحب القاعدة يقرأ % صفاً — الشاهد الموجب ساقط', v_owner;
  end if;

  begin
    perform set_config('request.jwt.claim.sub', v_ghost::text, false);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', v_ghost)::text, false);
    execute 'set local role authenticated';

    -- الهوية فعّالة؟ بدونها ما بعدها لا يقيس شيئاً
    execute 'select (select auth.uid())::text' into v_uid;
    if v_uid is distinct from v_ghost::text then
      raise exception '(ي-٧) الهوية المحقونة غير فعّالة (auth.uid() = %)', coalesce(v_uid, '(بلا)');
    end if;

    -- وهي غير مشرفة — وهذا هو المفروض في «متعهد مسجَّل الدخول»
    execute 'select public.is_admin()' into v_admin;
    if v_admin is not false then
      raise exception '(ي-٨) الهوية المنتحَلة مشرفة (is_admin = %) — القياس بعدها بلا معنى', v_admin;
    end if;

    -- 🔒 القياس ١: القراءة صفر رغم منحة select الجدولية
    execute 'select count(*) from public.place_search_settings' into v_rows;
    if v_rows <> 0 then
      raise exception
        '(ي-٩) 🔴 متعهدٌ مسجَّل قرأ % صفاً من place_search_settings — سياسة select انفتحت', v_rows;
    end if;

    -- 🔒 القياس ٢: والتحديث يصيب صفر صفوف (منحة update قائمة، وRLS ترفض بصمت)
    execute 'update public.place_search_settings set debounce_ms = 500 where id';
    get diagnostics v_updated = row_count;
    if v_updated <> 0 then
      raise exception
        '(ي-١٠) 🔴 متعهدٌ مسجَّل عدّل % صفاً من place_search_settings — سياسة update انفتحت', v_updated;
    end if;

    execute 'reset role';
    perform set_config('request.jwt.claim.sub', '', false);
    perform set_config('request.jwt.claims', '', false);

    raise notice '✔ (ي) RLS هي الحاجز فعلاً — أربع سياسات is_admin() بلا public، ومتعهدٌ مسجَّل يقرأ صفراً ويعدّل صفراً (وصاحب القاعدة يقرأ % صفاً)', v_owner;
    raise exception 'ROLLBACK_MARKER';
  exception when others then
    execute 'reset role';
    perform set_config('request.jwt.claim.sub', '', false);
    perform set_config('request.jwt.claims', '', false);
    if sqlerrm <> 'ROLLBACK_MARKER' then raise; end if;
  end;
end;
$$;

-- ----------------------------------------------------------------------------
-- (ل) 🔴 مرساة الخريطة (0080) — إعدادُ مالكٍ داخل نطاق التشغيل وحده
--
-- قرار المالك (2026-08-17) شقّان: «النقطة الرئيسية عند طلب تسعير بلا وجهة هي
-- مطار القاهرة»، و«لا تُثبَّت الإحداثيات في مكوّن». وما يُقاس هنا ثلاثة:
--
--   (ل-١) القارئ يُرجع المرساة، وهي **مطار القاهرة** لا ميدان التحرير الذي كان
--         محفوراً في `components/booking/map-picker.tsx`.
--   (ل-٢) 🔴 القيد يرفض نقطةً **خارج مصر** — وهو نفس صندوق `SERVICE_BOUNDS`
--         الذي يرفض به `/api/geocode/reverse` بالرمز `out-of-area` ويقصّ إليه
--         المنتقي. **حدٌّ واحد لا اثنان**: تعريفان لمنطقة الخدمة يختلفان يوماً،
--         والخلاف يكون خريطةً تفتح حيث لا نخدم — أو حجزاً سُعِّر لمسارٍ لا نصله.
--         ومعه شاهدٌ موجب: نقطةٌ داخل مصر تمرّ، وإلا كان الرفض رفضاً لكل شيء.
--   (ل-٣) والقيمتان **معاً**: نصفُ إحداثيّ يعطي مركزاً في مكانٍ ثالث لا يقصده
--         أحد، فلا يجوز أن يقبل القيدُ خطَّ عرضٍ مصريّاً مع خطِّ طولٍ إيطالي.
--
-- والقياس كله داخل معاملةٍ فرعية تُرجَع: قرار المالك في هذا الصفّ لا يُمسّ.
-- ----------------------------------------------------------------------------
do $$
declare
  v_lat   numeric;
  v_lng   numeric;
  v_state text;
begin
  -- (ل-١) القارئ يُرجعها، وهي المطار
  select c.default_center_lat, c.default_center_lng
    into v_lat, v_lng
  from public.place_search_config() c;

  if v_lat is null or v_lng is null then
    raise exception '(ل-١) place_search_config لا تُرجع المرساة — هجرة 0080 غير مطبَّقة أو أُزيحت';
  end if;
  if abs(v_lat - 30.1219) > 0.05 or abs(v_lng - 31.4056) > 0.05 then
    raise notice '  ↳ (ل-١) المرساة (%، %) — زحزحها المالك عن المطار، وهذا قراره', v_lat, v_lng;
  end if;
  if not (v_lat between 20 and 34 and v_lng between 23 and 38) then
    raise exception '(ل-١) المرساة المحفوظة (%، %) خارج نطاق التشغيل', v_lat, v_lng;
  end if;

  begin
    -- (ل-٢) روما مرفوضة
    v_state := null;
    begin
      update public.place_search_settings
         set default_center_lat = 41.9028, default_center_lng = 12.4964
       where id;
      v_state := '(قُبلت)';
    exception when others then
      get stacked diagnostics v_state = returned_sqlstate;
    end;
    if v_state <> '23514' then
      raise exception
        '(ل-٢) 🔴 مركزٌ في روما انتهى بـ«%» لا 23514 — والتشغيل داخل مصر فقط', v_state;
    end if;

    -- (ل-٣) ولا نصفُ إحداثيّ: عرضٌ مصريّ مع طولٍ إيطالي مرفوض كذلك
    v_state := null;
    begin
      update public.place_search_settings
         set default_center_lng = 12.4964
       where id;
      v_state := '(قُبلت)';
    exception when others then
      get stacked diagnostics v_state = returned_sqlstate;
    end;
    if v_state <> '23514' then
      raise exception
        '(ل-٣) خط طولٍ خارج مصر مرّ مع خط عرضٍ داخلها («%») — القيد يفحص محوراً واحداً',
        v_state;
    end if;

    -- الشاهد الموجب: الإسكندرية تمرّ
    update public.place_search_settings
       set default_center_lat = 31.2001, default_center_lng = 29.9187
     where id;

    raise exception 'PLACE_ANCHOR_ROLLBACK';
  exception
    when others then
      if sqlerrm <> 'PLACE_ANCHOR_ROLLBACK' then raise; end if;
  end;

  raise notice '✔ (ل) المرساة إعدادٌ داخل نطاق التشغيل: روما مرفوضة بمحوريها ونصفِ محورها، والإسكندرية تمرّ';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ك) التنظيف — صفّ المالك والقيود كما كانا حرفاً بحرف
-- ----------------------------------------------------------------------------
do $$
declare
  v_before text := current_setting('tours.place_search_before', true);
  v_after  text;
  v_checks integer;
begin
  select format(
           '%s|%s|%s|%s|%s|%s',
           google_enabled, primary_provider, map_picker_enabled,
           quote_fallback_enabled, min_query_chars, debounce_ms
         )
    into v_after
    from public.place_search_settings
   where id;

  if v_after is distinct from v_before then
    raise exception
      '(ك-١) صفّ المالك تغيّر! قبل «%» وبعد «%» — كتلةٌ ما لم تتراجع', v_before, v_after;
  end if;

  -- والقيود عادت بعد الطفرة (DDL معاملاتي — والتأكيد يُثبته لا يفترضه)
  select count(*) into v_checks
    from pg_constraint
   where conrelid = 'public.place_search_settings'::regclass
     and contype  = 'c'
     and conname in (
       'place_search_settings_primary_provider_check',
       'place_search_settings_min_query_chars_check',
       'place_search_settings_debounce_ms_check'
     );
  if v_checks <> 3 then
    raise exception '(ك-٢) القيود بعد الطفرة % من ٣ — التراجع لم يُعدها', v_checks;
  end if;

  perform set_config('tours.place_search_before', '', false);
  raise notice '✔ (ك) التنظيف تم — صفّ المالك كما كان (%)، والقيود الثلاثة عادت', v_after;
end;
$$;

-- ----------------------------------------------------------------------------
-- الخلاصة
-- ----------------------------------------------------------------------------
do $$
begin
  raise notice 'ALL PASSED — إعدادات بحث الأماكن (0076): الافتراضيات تُعيد سلوك اليوم، والقيود الثلاثة حيّة أثبتتها طفرة، والقارئ يُرجع صفاً واحداً على جدول فارغ، وanon بلا أي صلاحية (ولا TRUNCATE)، وRLS تحجب متعهداً مسجَّلاً عن القراءة والتحديث معاً — ومرساة الخريطة (0080) إعدادُ مالكٍ مقيَّدٌ داخل نطاق التشغيل وحده';
end;
$$;
