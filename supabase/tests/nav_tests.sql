-- ============================================================================
-- nav_tests.sql — اختبارات قبول للشريط العلوي من اللوحة (هجرة 0094_nav_from_panel.sql)
--
-- كيف تشغّله: `pnpm db:test nav` أو الصق الملف كاملاً في SQL Editor.
-- النجاح = آخر سطر «ALL PASSED». وأي فشل exception عربية فيها المتوقع والفعلي.
--
-- ومن psql بدور صاحب القاعدة **لا بد** من ON_ERROR_STOP و‑1 معاً:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f supabase/tests/nav_tests.sql
-- الأول لأن psql بدونه يتابع بعد الكتلة الفاشلة فيطبع «ALL PASSED» رغم الفشل.
--
-- ══════════════════════════════════════════════════════════════════════════
--  🔬 ثلاث طفراتٍ تُبنى وتُشغَّل — «فحصٌ لا يمكن أن يفشل زينة» (النمط ٩)
-- ══════════════════════════════════════════════════════════════════════════
--
--   • **الطفرة ١ (أ-٣):** بندٌ إلى `/accounts-team` — رابطٌ فيه كلمة `account`
--     ولا يقود إلى الحساب. يُثبَت أنه **يمرّ**، أي أن حارس البند الثالث يفلتر
--     **مساراً** لا نصّاً. ولولاها لكان «صُدّت الستة» صحيحاً لحارسٍ يمنع كل
--     رابطٍ فيه الكلمة — وهو حارسٌ يمنع ما لم يُطلب منعه.
--   • **الطفرة ٢ (ب-٤):** يُبدَّل جسم `nav_cap()` ليعيد ٢ داخل معاملةٍ فرعية
--     تُرجَع، ويُثبَت أن `site_nav` **تتبعه** فيقلب `overCap`. ولولاها لكان
--     «‏`overCap` صحيح عند ٨» صحيحاً لدالةٍ فيها الرقم ٧ محفوراً في جسمها —
--     فيصير تحذير اللوحة كذبةً بمجرد أن يُغيَّر السقف في موضعه المعلن.
--   • **الطفرة ٣ (ج-٥):** تُنزَع ترجمةُ الاختصار وتُبقى ترجمةُ العنوان، ويُثبَت
--     أن التسمية تسقط إلى **العنوان المترجَم** لا إلى الاختصار العربي. وهو
--     **استثناءٌ مقصود** من قاعدة `0018` («كل حقل يرجع لعربيته»)، فلو نُفِّذ
--     بلا قصد لظهرت كلمةٌ عربية وسط شريطٍ إنجليزي بلا أن يسقط اختبار.
--
-- ── لماذا كل شيء مصنوعٌ هنا ─────────────────────────────────────────────────
--
-- هذه **قاعدة الإنتاج نفسها**: صفحةٌ اختبارية باقية تدخل خريطة الموقع، وبندٌ
-- باقٍ يظهر في شريط الموقع الحيّ للزوار. فكل ما يُقاس مصنوعٌ هنا بمعرّفات ثابتة
-- تبدأ بـ`0b94`، ولغة اختبار `zn` مستقلة عن `zz` (‏`i18n_tests`) و`zx`
-- (‏`page_builder_tests`) — فلا تتصادم الملفات لو شُغّلت معاً. والتنظيف يجري في
-- **البداية والنهاية معاً**، فحتى انهيار تشغيلٍ سابق يبدأ التالي من أرضٍ نظيفة.
--
-- 🔒 **وصفر لمسٍ لبيانات المالك**: لا صفَّ `nav_links` مبذور يُعدَّل، ولا صفحةَ
--    محتوى حقيقية تُعلَّم `nav_show`. والقسم (ز) يقيس ذلك بعد كل شيء.
--
-- ما يغطيه الملف:
--   (٠)  الشروط المسبقة · تنظيف بقايا · لقطةُ حال المالك
--   (أ)  🔴 البند ٣: مدخل الحساب لا يصير بنداً + 🔬 الطفرة ١
--   (ب)  البند ٢: السقف يُعدّ صفحاتٍ وبنوداً معاً، ويُنبّه ولا يمنع + 🔬 الطفرة ٢
--   (ج)  البند ١: التسمية تُشتقّ ولا تُنقل إلى خطّ الترجمة + 🔬 الطفرة ٣
--   (د)  فهرس الترجمة: مفتاحٌ واحد للصفحة، وبمعرّف الصفّ للبند الحرّ
--   (هـ) شرط الظهور: منشورة · مُعلَّمة · مفعَّلة — وثلاثتها تُسقط البند بغيابها
--   (و)  الصلاحيات: الزائر ينفّذ ولا يكتب
--   (ز)  التنظيف — وصفر أثرٍ على بيانات المالك
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (٠) الشروط المسبقة + تنظيف بقايا
-- ----------------------------------------------------------------------------
do $$
declare
  v_missing text;
begin
  if to_regclass('public.nav_links') is null then
    raise exception 'شرط مسبق: public.nav_links مفقود — نفّذ 0094_nav_from_panel.sql أولاً';
  end if;

  select string_agg(x.sig, '، ')
    into v_missing
  from (values
    ('public.site_nav(text)'),
    ('public.nav_cap()'),
    ('public.nav_href_ok(text)'),
    ('public.nav_href_reserved(text)'),
    ('public.page_public_path(text, text)'),
    ('public.i18n_corpus_rows()')
  ) as x(sig)
  where to_regprocedure(x.sig) is null;
  if v_missing is not null then
    raise exception 'شرط مسبق: دوال مفقودة: %', v_missing;
  end if;

  -- الأعمدة الثلاثة على `pages`
  select string_agg(x.col, '، ')
    into v_missing
  from (values ('nav_show'), ('nav_sort'), ('nav_label')) as x(col)
  where not exists (
    select 1 from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = 'pages' and c.column_name = x.col);
  if v_missing is not null then
    raise exception 'شرط مسبق: أعمدة مفقودة على pages: %', v_missing;
  end if;

  -- ── تنظيف بقايا تشغيلٍ سابق ────────────────────────────────────────────
  delete from public.nav_links n where n.href like '/0b94%' or n.label like '٠ب٩٤%';
  delete from public.translations t where t.locale = 'zn';
  delete from public.locales      l where l.code   = 'zn';
  delete from public.sections     s where s.page_id in (
    '0b940000-0000-4000-8000-000000000001'::uuid,
    '0b940000-0000-4000-8000-000000000002'::uuid);
  delete from public.pages        p where p.slug in ('0b94-nav-one', '0b94-nav-two');

  raise notice '✔ (٠) الشروط المسبقة قائمة والأرض نظيفة';
end;
$$;

-- لقطةُ حال المالك قبل أي شيء — يُقارن بها القسم (ز)
create temporary table if not exists _nav_tests_baseline as
  select
    (select count(*) from public.nav_links)                        as links,
    (select count(*) from public.nav_links where active)           as links_active,
    (select count(*) from public.pages where nav_show)             as pages_shown,
    (select count(*) from public.pages where nav_label is not null) as pages_labeled,
    (select public.nav_cap())                                      as cap;

-- ----------------------------------------------------------------------------
-- (أ) 🔴 البند الثالث من بنود بدر — مدخل حساب العميل لا يصير صفاً يُحذف
--
-- «أُضيف في م‑٤ لأنه كان مخفياً، فيجب ألّا يصير قابلاً للحذف بالخطأ، وإلا أزال
-- المالك مدخل حساباته بنقرة.» والحارس هنا يمنع الطريق العكسي: أن يُنشأ بندٌ
-- حرٌّ إلى `/account/...` فيصير للمدخل نسخةٌ ثانية **قابلة للحذف** يظنّها الأصل.
-- ----------------------------------------------------------------------------
do $$
declare
  v_href    text;
  v_blocked int := 0;
  v_shapes  text[] := array[
    '/account', '/account/', '/account/login', '/account/bookings',
    '/account/login?next=/book', '/account#top',
    '/en/account/login', '/ar-eg/account'
  ];
begin
  -- (أ-١) كل صيغةٍ تقود إلى الحساب مصدودة — إدراجاً
  foreach v_href in array v_shapes loop
    begin
      insert into public.nav_links (label, href) values ('٠ب٩٤-مسبار', v_href);
      raise exception '(أ-١) 🔴 قُبل «%» بنداً في الشريط — مدخل الحساب صار قابلاً للحذف بنقرة', v_href;
    exception
      when others then
        if position('(أ-١)' in sqlerrm) = 1 then raise; end if;
        v_blocked := v_blocked + 1;
    end;
  end loop;

  if v_blocked <> array_length(v_shapes, 1) then
    raise exception '(أ-١) صُدّت % من % صيغة', v_blocked, array_length(v_shapes, 1);
  end if;

  -- (أ-٢) 🔴 **وتحديثاً كذلك** — والقيد هو ما يضمن هذا الشقّ: مُشغّلٌ وحده كان
  --       يمكن أن يُعطَّل بـ`alter table … disable trigger`، والقيدُ لا.
  --       والسيناريو واقعي: بندٌ مشروع يُنشأ ثم يُعاد توجيهه إلى `/account/login`.
  begin
    insert into public.nav_links (id, label, href)
    values ('0b940000-0000-4000-8000-0000000000a1', '٠ب٩٤-تحديث', '/0b94-ok');

    begin
      update public.nav_links set href = '/account/login'
       where id = '0b940000-0000-4000-8000-0000000000a1';
      raise exception '(أ-٢) 🔴 مرّ التحديث إلى /account/login — الحارس يفحص الإدراج وحده';
    exception
      when others then
        if position('(أ-٢)' in sqlerrm) = 1 then raise; end if;
    end;

    -- والصفّ بقي على رابطه الأصلي، لا نصفَ تحديثٍ نفذ
    if (select href from public.nav_links where id = '0b940000-0000-4000-8000-0000000000a1')
       <> '/0b94-ok' then
      raise exception '(أ-٢) الرابط تغيّر رغم صدّ التحديث';
    end if;

    delete from public.nav_links where id = '0b940000-0000-4000-8000-0000000000a1';
  end;

  raise notice '✔ (أ-١/٢) ثماني صيغٍ لرابط الحساب مصدودة إدراجاً (ومنها بادئة لغة واستعلام ومرساة)، والتحديث إليه مصدودٌ كذلك';
end;
$$;

-- (أ-٣) 🔬 **الطفرة ١** — الحارس مسارٌ لا نصّ
do $$
declare
  v_id uuid := '0b940000-0000-4000-8000-0000000000a3';
begin
  begin
    insert into public.nav_links (id, label, href) values (v_id, '٠ب٩٤-فريق', '/0b94-accounts-team');
  exception
    when others then
      raise exception '(أ-٣) 🔴 رُفض «/0b94-accounts-team» — الحارس يفلتر بالنصّ لا بالمسار، فيمنع ما لم يُطلب منعه: %', sqlerrm;
  end;

  -- وحارسا الشكل يعملان في الاتجاه الآخر: `//host` و`javascript:` مرفوضان
  if public.nav_href_ok('//evil.example') then
    raise exception '(أ-٣) 🔴 قُبل رابط بروتوكول-نسبيّ — يخرج بالزائر من الموقع بلا أن يبدو خارجياً';
  end if;
  if public.nav_href_ok('javascript:alert(1)') then
    raise exception '(أ-٣) 🔴 قُبل javascript: رابطاً لبند في الشريط';
  end if;
  if public.nav_href_ok('#services') then
    raise exception '(أ-٣) قُبلت مرساة نسبية — الشريط في كل صفحة، والنسبية لا تعني شيئاً في /book';
  end if;
  if not public.nav_href_ok('/#services') or not public.nav_href_ok('/')
     or not public.nav_href_ok('https://example.com/x') then
    raise exception '(أ-٣) رُفض شكلٌ صالح — المسار المطلق أو الجذر أو العنوان الكامل';
  end if;

  delete from public.nav_links where id = v_id;
  raise notice '✔ (أ-٣) 🔬 /0b94-accounts-team تمرّ فالحارس مسارٌ لا نصّ · و//host وjavascript: والمرساة النسبية مرفوضة';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ب) البند الثاني — السقف يعدّ **صفحاتٍ وبنوداً معاً**، ويُنبّه ولا يمنع
-- ----------------------------------------------------------------------------
do $$
declare
  v_base_count int;
  v_after      int;
  v_nav        jsonb;
begin
  v_base_count := ((select public.site_nav('ar')) ->> 'count')::int;

  -- صفحةٌ مُعلَّمة + بندٌ حرّ ⇒ العدّ يزيد **اثنين** لا واحداً
  insert into public.pages (id, slug, kind, title, published, nav_show, nav_sort)
  values ('0b940000-0000-4000-8000-000000000001', '0b94-nav-one', 'landing',
          '٠ب٩٤ صفحةٌ في الشريط', true, true, 500);
  insert into public.nav_links (id, label, href, nav_sort)
  values ('0b940000-0000-4000-8000-0000000000b1', '٠ب٩٤-بند', '/0b94-free', 501);

  v_nav := public.site_nav('ar');
  v_after := (v_nav ->> 'count')::int;
  if v_after <> v_base_count + 2 then
    raise exception '(ب-١) العدّ % والمتوقع % — السقف لا يرى السطحين معاً', v_after, v_base_count + 2;
  end if;

  -- والترتيب سلّمٌ واحد: البند (٥٠١) بعد الصفحة (٥٠٠)
  if (v_nav -> 'items' -> (v_after - 2) ->> 'kind') <> 'page'
     or (v_nav -> 'items' -> (v_after - 1) ->> 'kind') <> 'link' then
    raise exception '(ب-٢) 🔴 الترتيب لا يخلط السطحين — صفحةٌ وبندٌ حرٌّ في سلّمين لا سلّم';
  end if;

  -- 🔒 **ويُنبّه ولا يمنع**: لا شيء منع الإدراج، والحمولة تحمل الحكم لا الخادم
  if (v_nav ->> 'cap') is null or (v_nav -> 'overCap') is null then
    raise exception '(ب-٣) الحمولة بلا سقفٍ ولا حكم — فاللوحة تحذّر برقمٍ من عندها';
  end if;

  delete from public.nav_links where id = '0b940000-0000-4000-8000-0000000000b1';
  delete from public.pages where id = '0b940000-0000-4000-8000-000000000001';

  raise notice '✔ (ب-١/٢/٣) السقف يعدّ الصفحات والبنود معاً في سلّمٍ واحد، والحكم في الحمولة لا في منعٍ';
end;
$$;

-- (ب-٤) 🔬 **الطفرة ٢** — `site_nav` تقرأ `nav_cap()` ولا تحمل الرقم في جسمها
do $$
declare
  v_done      boolean := false;
  v_over_low  boolean;
  v_over_high boolean;
  v_cap_seen  int;
begin
  begin
    -- سقفٌ مستحيلُ الاستيفاء ⇒ لو كانت الدالة تقرؤه فعلاً لقلبت الحكم
    create or replace function public.nav_cap() returns integer
      language sql immutable as $m$ select 1 $m$;
    v_over_low := ((select public.site_nav('ar')) -> 'overCap')::boolean;
    v_cap_seen := ((select public.site_nav('ar')) ->> 'cap')::int;

    -- وسقفٌ واسعٌ جداً ⇒ الحكم يرتدّ
    create or replace function public.nav_cap() returns integer
      language sql immutable as $m$ select 9999 $m$;
    v_over_high := ((select public.site_nav('ar')) -> 'overCap')::boolean;

    v_done := true;
    raise exception 'ROLLBACK_NAV_CAP_MUTANT';
  exception
    when others then
      if sqlerrm <> 'ROLLBACK_NAV_CAP_MUTANT' then raise; end if;
  end;

  if not v_done then
    raise exception '(ب-٤) الطفرة لم تكتمل — لا حكم على نصف قياس';
  end if;
  if v_cap_seen <> 1 then
    raise exception '(ب-٤) 🔴 الحمولة أعلنت سقفاً % والدالة تعيد ١ — الرقم محفورٌ في جسم site_nav', v_cap_seen;
  end if;
  if not v_over_low then
    raise exception '(ب-٤) 🔴 السقف ١ ولم يُعلَن تجاوز — تحذير اللوحة لا يتبع nav_cap()';
  end if;
  if v_over_high then
    raise exception '(ب-٤) السقف ٩٩٩٩ وأُعلن تجاوز — الحكم لا يتبع السقف في الاتجاه الآخر';
  end if;

  -- والدالة عادت إلى ٧ بعد إرجاع المعاملة الفرعية
  if public.nav_cap() <> 7 then
    raise exception '(ب-٤) السقف بقي % بعد الطفرة — الإرجاع لم يستعد الجسم', public.nav_cap();
  end if;

  raise notice '✔ (ب-٤) 🔬 السقف يُقرأ من nav_cap() في الاتجاهين (١ ⇒ تجاوز · ٩٩٩٩ ⇒ لا) والجسم عاد إلى ٧';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ج) 🔴 البند الأول — التسمية تُشتقّ من عنوان الصفحة ولا تُنقل إلى خطّ الترجمة
-- ----------------------------------------------------------------------------
do $$
declare
  v_page  uuid := '0b940000-0000-4000-8000-000000000002';
  v_label text;
begin
  insert into public.locales (code, name, native_name, dir, enabled, is_default)
  values ('zn', 'لغة فحص الشريط', 'Nav Test', 'ltr', true, false)
  on conflict (code) do update set enabled = true;

  insert into public.pages (id, slug, kind, title, published, nav_show, nav_sort)
  values (v_page, '0b94-nav-two', 'landing', 'الشروط والأحكام ٠ب٩٤', true, true, 700);

  -- (ج-١) بلا اختصار ⇒ التسمية **هي العنوان**، وبصفر مفتاحٍ جديد
  select i ->> 'label' into v_label
  from jsonb_array_elements(public.site_nav('ar') -> 'items') i
  where i ->> 'id' = v_page::text;
  if v_label <> 'الشروط والأحكام ٠ب٩٤' then
    raise exception '(ج-١) التسمية «%» لا عنوان الصفحة — الاشتقاق لا يعمل', coalesce(v_label, '∅');
  end if;

  -- (ج-٢) الاختصار يعلو على العنوان في لغة الأساس
  update public.pages set nav_label = 'الشروط' where id = v_page;
  select i ->> 'label' into v_label
  from jsonb_array_elements(public.site_nav('ar') -> 'items') i
  where i ->> 'id' = v_page::text;
  if v_label <> 'الشروط' then
    raise exception '(ج-٢) الاختصار لم يُستعمل — التسمية «%»', coalesce(v_label, '∅');
  end if;

  -- (ج-٣) وترجمةُ العنوان تُستعمل للغة الترجمة (وهي المفتاح **القائم** من 0018)
  insert into public.translations (locale, namespace, key, source_text, value, status)
  values ('zn', 'page', v_page::text || '.title', 'الشروط والأحكام ٠ب٩٤',
          'Terms and Conditions', 'published');

  -- (ج-٤) وترجمةُ الاختصار تعلو عليها
  insert into public.translations (locale, namespace, key, source_text, value, status)
  values ('zn', 'page', v_page::text || '.navLabel', 'الشروط', 'Terms', 'published');
  select i ->> 'label' into v_label
  from jsonb_array_elements(public.site_nav('zn') -> 'items') i
  where i ->> 'id' = v_page::text;
  if v_label <> 'Terms' then
    raise exception '(ج-٤) ترجمة الاختصار لم تُستعمل — التسمية «%»', coalesce(v_label, '∅');
  end if;

  raise notice '✔ (ج-١…٤) التسمية = العنوان · فالاختصار · فترجمة العنوان · فترجمة الاختصار — ولا مفتاحَ نصٍّ جديدٍ في الطريق';
end;
$$;

-- (ج-٥) 🔬 **الطفرة ٣** — الاختصار غير المترجَم يسقط إلى العنوان **المترجَم**
--
-- 🔴 وهذا **استثناءٌ مقصود** من قاعدة `0018` («كل حقل يرجع لعربيته وحده»):
--    تلك القاعدة تحرس ضد بديلٍ أسوأ (عقدةٌ فارغة أو مفتاحٌ خام)، وهنا يوجد
--    بديلٌ **بلغة الزائر نفسها** — لأن الاختصار تقصيرُ عنوانٍ مترجَم لا محتوىً
--    مستقل. فلو نُفِّذ بلا قصد لظهرت «الشروط» عربيةً وسط شريطٍ إنجليزي.
do $$
declare
  v_page  uuid := '0b940000-0000-4000-8000-000000000002';
  v_label text;
  v_ar    text;
begin
  delete from public.translations
   where locale = 'zn' and namespace = 'page' and key = v_page::text || '.navLabel';

  select i ->> 'label' into v_label
  from jsonb_array_elements(public.site_nav('zn') -> 'items') i
  where i ->> 'id' = v_page::text;

  if v_label = 'الشروط' then
    raise exception '(ج-٥) 🔴 الاختصار العربي ظهر في لغةٍ أخرى — كلمةٌ عربية وسط شريطٍ إنجليزي';
  end if;
  if v_label <> 'Terms and Conditions' then
    raise exception '(ج-٥) 🔴 السقوط ذهب إلى «%» لا إلى العنوان المترجَم', coalesce(v_label, '∅');
  end if;

  -- ولغة الأساس لم تتغيّر بحرف: الاختصار العربي ما زال هو
  select i ->> 'label' into v_ar
  from jsonb_array_elements(public.site_nav('ar') -> 'items') i
  where i ->> 'id' = v_page::text;
  if v_ar <> 'الشروط' then
    raise exception '(ج-٥) لغة الأساس تغيّرت إلى «%» — الاستثناء تسرّب إلى العربية', coalesce(v_ar, '∅');
  end if;

  -- ولغةٌ معطَّلة تعود بالأساس كاملاً (‏`i18n_locale_active` = false)
  update public.locales set enabled = false where code = 'zn';
  select i ->> 'label' into v_label
  from jsonb_array_elements(public.site_nav('zn') -> 'items') i
  where i ->> 'id' = v_page::text;
  if v_label <> 'الشروط' then
    raise exception '(ج-٥) لغةٌ معطَّلة أعطت «%» لا الأساس — الترجمة تصل من لغةٍ مطفأة', coalesce(v_label, '∅');
  end if;
  update public.locales set enabled = true where code = 'zn';

  raise notice '✔ (ج-٥) 🔬 اختصارٌ بلا ترجمة يسقط إلى العنوان المترجَم لا إلى العربية · والأساس لم يتغيّر · واللغة المطفأة تعود بالأساس';
end;
$$;

-- ----------------------------------------------------------------------------
-- (د) فهرس الترجمة — مفتاحٌ **واحد** للصفحة، وبمعرّف الصفّ للبند الحرّ
-- ----------------------------------------------------------------------------
do $$
declare
  v_page  uuid := '0b940000-0000-4000-8000-000000000002';
  v_free  uuid := '0b940000-0000-4000-8000-0000000000d1';
  v_keyed uuid := '0b940000-0000-4000-8000-0000000000d2';
  v_n     int;
begin
  -- (د-١) مفتاحٌ واحدٌ للاختصار لا مفتاحٌ لكل موضعٍ يُعرض فيه
  select count(*) into v_n
  from public.i18n_corpus_rows() c
  where c.ns = 'page' and c.k like v_page::text || '.navLabel%';
  if v_n <> 1 then
    raise exception '(د-١) % مفتاحاً للاختصار لا واحد', v_n;
  end if;

  -- (د-٢) وإخراج الصفحة من الشريط يُخرج مفتاحه — لا عملَ ترجمةٍ لما لا يُعرض
  update public.pages set nav_show = false where id = v_page;
  if exists (select 1 from public.i18n_corpus_rows() c
             where c.ns = 'page' and c.k = v_page::text || '.navLabel') then
    raise exception '(د-٢) اختصارُ صفحةٍ خارج الشريط بقي في الفهرس';
  end if;
  -- والعنوان بقي: هو مفتاح الصفحة لا مفتاح الشريط
  if not exists (select 1 from public.i18n_corpus_rows() c
                 where c.ns = 'page' and c.k = v_page::text || '.title') then
    raise exception '(د-٢) 🔴 عنوان الصفحة غاب عن الفهرس — الفرع الجديد أسقط فرعاً قائماً';
  end if;
  update public.pages set nav_show = true where id = v_page;

  -- (د-٣) البند الحرّ بمعرّف صفّه — فإعادة الترتيب لا تنقل ترجمته إلى جاره
  insert into public.nav_links (id, label, label_key, href, nav_sort)
  values (v_free, '٠ب٩٤-حرّ', null, '/0b94-free-1', 800),
         (v_keyed, '٠ب٩٤-بمفتاح', 'fleet', '/0b94-keyed', 801);

  if not exists (select 1 from public.i18n_corpus_rows() c
                 where c.ns = 'settings' and c.k = 'nav.' || v_free::text || '.label'
                   and c.src = '٠ب٩٤-حرّ') then
    raise exception '(د-٣) 🔴 تسميةُ بندٍ حرٍّ غابت عن الفهرس — نصٌّ في القاعدة بلا طريقٍ إلى الترجمة';
  end if;

  -- (د-٤) وإعادة الترتيب لا تُحرّك المفتاح — وهو الفرق كلّه عن العنونة بالترتيب
  update public.nav_links set nav_sort = 100 where id = v_free;
  if not exists (select 1 from public.i18n_corpus_rows() c
                 where c.ns = 'settings' and c.k = 'nav.' || v_free::text || '.label') then
    raise exception '(د-٤) 🔴 المفتاح تغيّر بإعادة الترتيب — ترجمةُ البند تنتقل إلى جاره (علّة `_k` في 0059)';
  end if;

  -- (د-٥) وما له `label_key` لا يُطلَب مرتين
  if exists (select 1 from public.i18n_corpus_rows() c
             where c.ns = 'settings' and c.k = 'nav.' || v_keyed::text || '.label') then
    raise exception '(د-٥) بندٌ تسميتُه في المستودع دخل فهرس القاعدة — طُلبت ترجمةُ ما هو مترجَم (البند ١)';
  end if;

  -- (د-٦) والمُخفى لا عملَ ترجمةٍ له
  update public.nav_links set active = false where id = v_free;
  if exists (select 1 from public.i18n_corpus_rows() c
             where c.ns = 'settings' and c.k = 'nav.' || v_free::text || '.label') then
    raise exception '(د-٦) تسميةُ بندٍ مُخفى بقيت في الفهرس';
  end if;

  delete from public.nav_links where id in (v_free, v_keyed);

  raise notice '✔ (د-١…٦) مفتاحٌ واحدٌ للاختصار يظهر بالعرض ويغيب بالإخفاء · والبند الحرّ بمعرّف صفّه يثبت عبر إعادة الترتيب · وما له مفتاح مستودعٍ لا يُطلَب';
end;
$$;

-- ----------------------------------------------------------------------------
-- (هـ) شرط الظهور ثلاثةٌ — منشورة · مُعلَّمة · مفعَّلة. وكلٌّ منها يُسقط بغيابه.
-- ----------------------------------------------------------------------------
do $$
declare
  v_page uuid := '0b940000-0000-4000-8000-000000000002';
  v_free uuid := '0b940000-0000-4000-8000-0000000000e1';
  v_in   boolean;
begin
  -- (هـ-١) المسار مشتقٌّ من `page_public_path` لا مكتوبٌ بيد
  select i ->> 'href' = public.page_public_path('landing', '0b94-nav-two')
    into v_in
  from jsonb_array_elements(public.site_nav('ar') -> 'items') i
  where i ->> 'id' = v_page::text;
  if not coalesce(v_in, false) then
    raise exception '(هـ-١) 🔴 مسار الصفحة في الشريط لا يطابق page_public_path — مصدران للمسار العام';
  end if;

  -- (هـ-٢) إلغاء النشر يُخفيها من الشريط بلا لمس `nav_show`
  update public.pages set published = false where id = v_page;
  if exists (select 1 from jsonb_array_elements(public.site_nav('ar') -> 'items') i
             where i ->> 'id' = v_page::text) then
    raise exception '(هـ-٢) 🔴 صفحةٌ غير منشورة ظهرت في الشريط — رابطٌ إلى مسودة على كل صفحة';
  end if;
  update public.pages set published = true where id = v_page;

  -- (هـ-٣) وإخراجها من الشريط يُخفيها وهي منشورة
  update public.pages set nav_show = false where id = v_page;
  if exists (select 1 from jsonb_array_elements(public.site_nav('ar') -> 'items') i
             where i ->> 'id' = v_page::text) then
    raise exception '(هـ-٣) صفحةٌ غير مُعلَّمة ظهرت في الشريط';
  end if;
  update public.pages set nav_show = true where id = v_page;

  -- (هـ-٤) والبند المُخفى يغيب ويبقى صفُّه — والإخفاء هو البديل المعروض عن الحذف
  insert into public.nav_links (id, label, href, nav_sort, active)
  values (v_free, '٠ب٩٤-مخفي', '/0b94-hidden', 900, false);
  if exists (select 1 from jsonb_array_elements(public.site_nav('ar') -> 'items') i
             where i ->> 'id' = v_free::text) then
    raise exception '(هـ-٤) بندٌ مُخفى ظهر في الشريط';
  end if;
  if not exists (select 1 from public.nav_links where id = v_free) then
    raise exception '(هـ-٤) الإخفاء حذف الصفّ — ومعرّفُ الصفّ عنوانُ ترجمته';
  end if;
  delete from public.nav_links where id = v_free;

  raise notice '✔ (هـ-١…٤) المسار من page_public_path · وإلغاء النشر وإخراجُها والإخفاء ثلاثتها تُسقط البند، والصفّ يبقى';
end;
$$;

-- ----------------------------------------------------------------------------
-- (و) الصلاحيات — الزائر ينفّذ القارئ ولا يكتب في الجدول
-- ----------------------------------------------------------------------------
do $$
begin
  if not has_function_privilege('anon', 'public.site_nav(text)', 'EXECUTE') then
    raise exception '(و) anon لا ينفّذ site_nav — فالشريط لا يُصيَّر لزائر';
  end if;
  if not has_table_privilege('anon', 'public.nav_links', 'SELECT') then
    raise exception '(و) anon لا يقرأ nav_links';
  end if;
  if has_table_privilege('anon', 'public.nav_links', 'INSERT')
     or has_table_privilege('anon', 'public.nav_links', 'UPDATE')
     or has_table_privilege('anon', 'public.nav_links', 'DELETE') then
    raise exception '(و) 🔴 anon يكتب في nav_links — منحةُ Supabase الافتراضية لم تُلغَ';
  end if;
  if has_table_privilege('anon', 'public.nav_links', 'TRUNCATE') then
    raise exception '(و) 🔴 anon يملك TRUNCATE على nav_links';
  end if;

  -- و RLS مفعَّلة: الطبقة الثانية موجودة لا الأولى وحدها
  if not (select c.relrowsecurity from pg_class c where c.oid = 'public.nav_links'::regclass) then
    raise exception '(و) 🔴 RLS غير مفعَّلة على nav_links';
  end if;

  -- وسياسات الكتابة الثلاث كلها بحارس `is_admin()`
  if (select count(*) from pg_policies p
      where p.schemaname = 'public' and p.tablename = 'nav_links'
        and p.cmd in ('INSERT', 'UPDATE', 'DELETE')
        and coalesce(p.qual, '') || coalesce(p.with_check, '') like '%is_admin%') <> 3 then
    raise exception '(و) 🔴 سياسة كتابةٍ على nav_links بلا حارس is_admin()';
  end if;

  raise notice '✔ (و) anon ينفّذ site_nav ويقرأ ولا يكتب ولا يُفرّغ · وRLS مفعَّلة وسياسات الكتابة الثلاث بحارس المشرف';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ز) التنظيف — 🔒 وصفر أثرٍ على بيانات المالك
-- ----------------------------------------------------------------------------
do $$
declare
  v_n int;
  v_b record;
begin
  delete from public.translations t where t.locale = 'zn';
  delete from public.locales      l where l.code   = 'zn';
  delete from public.nav_links    n where n.href like '/0b94%' or n.label like '٠ب٩٤%';
  delete from public.sections     s where s.page_id in (
    '0b940000-0000-4000-8000-000000000001'::uuid,
    '0b940000-0000-4000-8000-000000000002'::uuid);
  delete from public.pages        p where p.slug in ('0b94-nav-one', '0b94-nav-two');

  select count(*) into v_n from public.nav_links n where n.label like '٠ب٩٤%';
  if v_n <> 0 then
    raise exception '(ز) بقي % بندَ فيكسترة', v_n;
  end if;
  if exists (select 1 from public.i18n_corpus_rows() c where c.k like '0b94%' or c.src like '٠ب٩٤%') then
    raise exception '(ز) بقي مفتاح فيكسترة في فهرس الترجمة';
  end if;

  -- 🔒 حال المالك كما كان بالضبط — لا صفَّ بندٍ زاد ولا نقص، ولا صفحةٌ عُلّمت
  select * into v_b from _nav_tests_baseline;
  if (select count(*) from public.nav_links) <> v_b.links then
    raise exception '(ز) 🔴 عدد بنود الشريط % والأصل % — الاختبار لمس بيانات المالك',
      (select count(*) from public.nav_links), v_b.links;
  end if;
  if (select count(*) from public.nav_links where active) <> v_b.links_active then
    raise exception '(ز) 🔴 ظهورُ بندٍ من بنود المالك تغيّر';
  end if;
  if (select count(*) from public.pages where nav_show) <> v_b.pages_shown then
    raise exception '(ز) 🔴 عددُ الصفحات في الشريط % والأصل % — صفحةٌ للمالك عُلّمت أو أُخرجت',
      (select count(*) from public.pages where nav_show), v_b.pages_shown;
  end if;
  if (select count(*) from public.pages where nav_label is not null) <> v_b.pages_labeled then
    raise exception '(ز) 🔴 اختصارُ صفحةٍ للمالك تغيّر';
  end if;
  if public.nav_cap() <> v_b.cap then
    raise exception '(ز) 🔴 السقف % والأصل % — طفرةُ (ب-٤) لم تُرجَع', public.nav_cap(), v_b.cap;
  end if;

  raise notice '✔ (ز) التنظيف تام — لا أثر للفيكسترة، والسقف والبنود والصفحات كما كانت بالضبط';
end;
$$;

drop table if exists _nav_tests_baseline;

-- ----------------------------------------------------------------------------
-- الخلاصة
-- ----------------------------------------------------------------------------
do $$
begin
  raise notice 'ALL PASSED — الشريط العلوي من اللوحة: ثماني صيغٍ لرابط حساب العميل مصدودة إدراجاً وتحديثاً (وطفرةٌ تُثبت أن الحارس مسارٌ لا نصّ) · السقف يعدّ الصفحات والبنود في سلّمٍ واحد ويُنبّه ولا يمنع (وطفرةٌ تُثبت أنه يُقرأ من nav_cap() في الاتجاهين) · التسمية تُشتقّ من العنوان ثم الاختصار ثم ترجمتاهما (وطفرةٌ تُثبت أن اختصاراً بلا ترجمة يسقط إلى العنوان المترجَم لا إلى العربية) · مفتاحُ الاختصار واحدٌ يظهر بالعرض ويغيب بالإخفاء والبندُ الحرّ بمعرّف صفّه يثبت عبر إعادة الترتيب وما له مفتاح مستودعٍ لا يُطلَب · وإلغاءُ النشر والإخراج والإخفاء ثلاثتها تُسقط البند والمسار من page_public_path · وanon ينفّذ ولا يكتب وRLS بحارس المشرف — وصفر صفٍّ لُمس من بيانات المالك';
end;
$$;
