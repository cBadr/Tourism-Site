-- ============================================================================
-- loyalty_terms_tests.sql — بند «نقاط الولاء» في الشروط يطابق `loyalty_settings`
--
-- كيف تشغّله: `pnpm db:test loyalty_terms` أو الصقه في SQL Editor واضغط Run.
-- النجاح = آخر سطر «ALL PASSED». والفشل exception عربية فيها المتوقع والفعلي.
--
-- ══════════════════════════════════════════════════════════════════════════
--  🔴 ما تحرسه هذه المجموعة — ولماذا لا يحرسه شيءٌ آخر
-- ══════════════════════════════════════════════════════════════════════════
--
-- `sections.content` نصٌّ **ساكن**، والعارضة تُصيّره كما هو بلا محرّك قوالب.
-- فبندُ الشروط الذي كتبته `0125` يحمل أرقام الولاء **لحظةَ كتابته**، بينما
-- المالك يغيّر تلك الأرقام من `/admin/loyalty` بضغطة. ⇒ بلا هذه المجموعة
-- **يظلّ النصّ يَعِد بما لم يعد يقع، ولا شاشة تقول ذلك** — وهو النمط ٢ في
-- `LESSONS.md` («الواجهة تَعِد بما لا تنفّذه القاعدة») بحرفه.
--
-- فالمصدرُ واحد: `public.loyalty_terms_disclosure()` تشتقّ الجُمل من
-- `loyalty_settings` الحيّة، والقسم (أ) يقارن المنشور بها **جملةً جملة**.
-- ⇒ تغييرُ أيّ مقبضٍ يُحمِّر البوابة برسالةٍ تقول أيَّ مقبضٍ ونصَّه الجديد.
--
-- ⚠ **وهذا احمرارٌ مقصود لا عطب**: لا يعني أن القاعدة كُسرت، بل أن **الشروط
--   المنشورة صارت تكذب** — والعلاج ضغطتان في `/admin/content` (أو هجرةٌ تعيد
--   كتابة البند من الدالة). والرسالة تحمل النصّ الصحيح جاهزاً للّصق.
--
-- ── وقسمٌ يثبت أن الحارس حيّ (‏`LESSONS` النمط ٩) ──────────────────────────
--
-- القسم (ج) **يغيّر `expire_months` داخل معاملةٍ فرعية ثم يرجعها**، ويتحقق أن
-- المقارنة تسقط فعلاً. فتأكيدٌ لا يمكن أن يفشل زينةٌ لا حارس — وهذا ثالثُ
-- ظهورٍ للعائلة نفسها في هذا المستودع بعد سقف `least(100)` وحارس `portal_balance`.
--
-- 🔒 **ولا تكتب هذه المجموعة شيئاً يبقى**: تغييرُ (ج) داخل كتلة
--    `begin … exception` — أي معاملةٍ فرعية تُرجَع باستثناءٍ مُصطنَع — ثم
--    المشغّل نفسه يلفّ الملف كلَّه بـ`BEGIN … ROLLBACK`. حارسان لا واحد.
--
-- المرجع: `0125_loyalty_terms_disclosed.sql` · D-60 · D-05 · `lib/loyalty-types.ts`.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (٠) الشروط المسبقة — هجرة 0125 مطبَّقة، والبند موجود
-- ----------------------------------------------------------------------------
do $$
declare
  v_n integer;
begin
  if to_regprocedure('public.loyalty_terms_disclosure()') is null then
    raise exception 'loyalty_terms_disclosure غير موجودة — نفّذ pnpm db:migrate أولاً';
  end if;

  select count(*) into v_n from public.loyalty_settings;
  if v_n <> 1 then
    raise exception '(٠) loyalty_settings فيها % صفاً بدل صفٍّ واحد', v_n;
  end if;

  if not exists (
    select 1
    from public.sections s
    join public.pages p on p.id = s.page_id
    where s.id = 'b0000000-0000-4000-8000-000000003110'::uuid
      and s.type = 'clause' and p.slug = 'terms'
  ) then
    raise exception '(٠) بندُ الولاء غير موجود في صفحة terms — نفّذ pnpm db:migrate أولاً';
  end if;

  select count(*) into v_n from public.loyalty_terms_disclosure();
  if v_n <> 8 then
    raise exception '(٠) الدالة تُخرج % جملة بدل ٨ — تغيّر عقدُها', v_n;
  end if;

  raise notice '✔ (٠) الدالة والبند موجودان، والإعدادات صفٌّ واحد';
end;
$$;

-- ----------------------------------------------------------------------------
-- (أ) 🔴 الحارس الأساسي — كلُّ مقبضٍ في `loyalty_settings` مُفصَحٌ في المنشور
-- ----------------------------------------------------------------------------
do $$
declare
  v_body    text;
  v_missing text;
  v_fix     text;
begin
  select s.content ->> 'body' into v_body
  from public.sections s
  where s.id = 'b0000000-0000-4000-8000-000000003110'::uuid;

  select string_agg(d.measure, '، ' order by d.ord),
         string_agg(d.ar, ' ' order by d.ord)
    into v_missing, v_fix
  from public.loyalty_terms_disclosure() d
  where position(d.ar in coalesce(v_body, '')) = 0;

  if v_missing is not null then
    raise exception
      '(أ) 🔴 بندُ الشروط لم يعد يطابق loyalty_settings — غيرُ المُفصَح: %.'
      ' والنصّ الصحيح اليوم: «%». صحّحه من /admin/content ← الشروط ← البند ١١',
      v_missing, v_fix;
  end if;

  raise notice '✔ (أ) الجُمل الثماني كلُّها في المنشور — كلُّ مقبضٍ مُفصَح';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ب) الظهور يتبع `enabled` — لا وعدَ بنظامٍ مطفأ، ولا صمتَ عن نظامٍ يعمل
-- ----------------------------------------------------------------------------
do $$
declare
  v_vis boolean;
  v_en  boolean;
begin
  select s.visible into v_vis
  from public.sections s where s.id = 'b0000000-0000-4000-8000-000000003110'::uuid;
  select l.enabled into v_en from public.loyalty_settings l limit 1;

  if v_vis is distinct from v_en then
    raise exception
      '(ب) 🔴 ظهور بند الولاء % ونظام الولاء %. مُشعَلٌ بلا بندٍ ظاهر = شرطٌ لا يُقرأ؛'
      ' ومطفأٌ ببندٍ ظاهر = وعدٌ لا يقع. اضبط ظهور البند من /admin/content',
      v_vis, v_en;
  end if;

  if not exists (
    select 1 from public.pages p
    join public.sections s on s.page_id = p.id
    where s.id = 'b0000000-0000-4000-8000-000000003110'::uuid and p.published
  ) then
    raise exception '(ب) 🔴 صفحة terms ليست منشورة — البند لا يبلغ أحداً';
  end if;

  raise notice '✔ (ب) الظهور % يطابق enabled %، والصفحة منشورة', v_vis, v_en;
end;
$$;

-- ----------------------------------------------------------------------------
-- (ج) 🔴 هل يمكن للقسم (أ) أن يفشل أصلاً؟ — حقنُ قيمةٍ مخالفة ثم إرجاعها
--
--     بلا هذا القسم يبقى (أ) تأكيداً «أخضر دائماً» لا يشهد على شيء. والحقن
--     داخل معاملةٍ فرعية تُرجَع باستثناءٍ مُصطنَع، فلا يبقى أثرٌ على إعدادات
--     المالك — ثم المشغّل يرجع الملف كلَّه فوق ذلك.
-- ----------------------------------------------------------------------------
do $$
declare
  v_body   text;
  v_old    integer;
  v_caught boolean := false;
  v_would  integer;
begin
  select s.content ->> 'body' into v_body
  from public.sections s where s.id = 'b0000000-0000-4000-8000-000000003110'::uuid;
  select l.expire_months into v_old from public.loyalty_settings l limit 1;

  begin
    -- قيمةٌ مختلفةٌ حتماً عن القائمة، ومشروعةٌ في مداها
    update public.loyalty_settings
       set expire_months = case when v_old = 7 then 9 else 7 end
     where id;

    select count(*) into v_would
    from public.loyalty_terms_disclosure() d
    where position(d.ar in coalesce(v_body, '')) = 0;

    -- استثناءٌ مُصطنَع يُرجع المعاملة الفرعية بما فيها التحديث أعلاه
    raise exception 'LOYALTY_TERMS_PROBE:%', v_would;
  exception
    when others then
      if sqlerrm not like 'LOYALTY_TERMS_PROBE:%' then
        raise;
      end if;
      v_would  := split_part(sqlerrm, ':', 2)::integer;
      v_caught := true;
  end;

  if not v_caught then
    raise exception '(ج) 🔴 لم تُلتقط المجسّة — الحقن لم يجرِ';
  end if;
  if v_would < 1 then
    raise exception
      '(ج) 🔴 تغييرُ expire_months لم يُسقط المقارنة — القسم (أ) تأكيدٌ لا يمكن أن يفشل';
  end if;

  -- والإعداد رجع كما كان
  if (select l.expire_months from public.loyalty_settings l limit 1) is distinct from v_old then
    raise exception '(ج) 🔴 expire_months لم يرجع إلى % — المجسّة تركت أثراً', v_old;
  end if;

  raise notice '✔ (ج) الحقن أسقط % جملة، والإعداد رجع إلى % — الحارس حيّ', v_would, v_old;
end;
$$;

-- ----------------------------------------------------------------------------
-- (د) 🔒 النصّ يصف سلوكاً **قائماً** في الكتالوج الحيّ (‏D-58) لا نيّةً قديمة
-- ----------------------------------------------------------------------------
do $$
declare
  v_def text;
begin
  v_def := pg_get_functiondef(
    'public.apply_points(text,integer,numeric,text,numeric,numeric)'::regprocedure);
  if position('max_redeem_percent' in v_def) = 0 then
    raise exception '(د) 🔴 apply_points لم تعد تقرأ max_redeem_percent — جملةُ السقف تكذب';
  end if;
  if position('min_redeem_points' in v_def) = 0 then
    raise exception '(د) 🔴 apply_points لم تعد تقرأ min_redeem_points — جملةُ الحدّ الأدنى تكذب';
  end if;
  if position('p_coupon_amount' in v_def) = 0 then
    raise exception '(د) 🔴 أولوية الكوبون لم تعد في apply_points — جملتُها تكذب';
  end if;

  if position('expire_months' in
       pg_get_functiondef('public.loyalty_lots(text)'::regprocedure)) = 0 then
    raise exception '(د) 🔴 loyalty_lots لم تعد تشتقّ انتهاء الصلاحية — أثقلُ جملةٍ في البند تكذب';
  end if;

  if position('extrasTotal' in
       pg_get_functiondef('public.loyalty_on_booking_completed()'::regprocedure)) = 0 then
    raise exception '(د) 🔴 أساسُ السكّ لم يعد يستثني الخدمات الإضافية — جملةُ الاحتساب تكذب';
  end if;
  if position('completed' in
       pg_get_functiondef('public.loyalty_on_booking_completed()'::regprocedure)) = 0 then
    raise exception '(د) 🔴 السكّ لم يعد معلَّقاً على الاكتمال — «بعد تنفيذ رحلتك» تكذب';
  end if;

  if to_regprocedure('public.loyalty_reverse_booking(uuid,text)') is null then
    raise exception '(د) 🔴 لا قيدَ عاكساً — جملةُ الإلغاء تكذب';
  end if;

  raise notice '✔ (د) خمسةُ مسالكَ يصفها البند ما زالت في الكتالوج الحيّ';
end;
$$;

-- ----------------------------------------------------------------------------
-- (هـ) 🔒 D-60 — لا لقطةٌ حيّةٌ تجهل البند، فأول نشرةٍ تحذفه
--
--       خطوةُ (ب) في `publish_page_revision` **تحذف** كل قسمٍ غائبٍ عن اللقطة،
--       و`reconcile_revision_items` تُصالح `items` وحدها ولا ترى قسماً كاملاً.
-- ----------------------------------------------------------------------------
do $$
declare
  v_page uuid;
  v_bad  text;
  v_live integer;
begin
  select s.page_id into v_page
  from public.sections s where s.id = 'b0000000-0000-4000-8000-000000003110'::uuid;

  select count(*) into v_live
  from public.page_revisions r
  where r.page_id = v_page and r.status in ('draft', 'published');

  select string_agg(r.id::text, '، ') into v_bad
  from public.page_revisions r
  where r.page_id = v_page
    and r.status in ('draft', 'published')
    and jsonb_typeof(r.snapshot -> 'sections') = 'array'
    and not exists (
      select 1 from jsonb_array_elements(r.snapshot -> 'sections') x
      where x ->> 'id' = 'b0000000-0000-4000-8000-000000003110');

  if v_bad is not null then
    raise exception
      '(هـ) 🔴 لقطةٌ حيّة لصفحة terms لا تعرف بند الولاء — أول ضغطة «نشر» تحذفه: %', v_bad;
  end if;

  raise notice '✔ (هـ) لقطاتٌ حيّة % — ولا واحدةٌ منها تجهل البند', v_live;
end;
$$;

-- ----------------------------------------------------------------------------
-- (و) 🔴 الإنجليزية مسوّدةٌ لا منشورة — نشرُ الترجمة قرارُ المالك وحده
-- ----------------------------------------------------------------------------
do $$
declare
  v_pub  integer;
  v_all  integer;
  v_keys text;
begin
  v_keys := 'b0000000-0000-4000-8000-000000003110';

  select count(*) into v_all
  from public.translations tr
  where tr.locale = 'en' and tr.namespace = 'section' and tr.key like v_keys || '.%';

  select count(*) into v_pub
  from public.translations tr
  where tr.locale = 'en' and tr.namespace = 'section' and tr.key like v_keys || '.%'
    and tr.status = 'published';

  if v_all < 3 then
    raise exception '(و) صفوفُ الترجمة الإنجليزية % بدل ٣ على الأقل (num · title · body)', v_all;
  end if;

  -- ⚠ التأكيد **لا يمنع** المالك من النشر — بل يقول إن ما نشره صار منشوراً بقراره.
  --   والذي يُحرَس هنا حالةُ اليوم: لم يراجعها بعد، فلا يجوز أن تكون منشورة.
  if v_pub > 0 then
    raise notice
      'ℹ (و) % من صفوف البند الإنجليزية منشورة — إن كان بقرارك فلا شيء، وإن لم يكن فراجِعها', v_pub;
  else
    raise notice '✔ (و) % صفوف إنجليزية، ولا صفَّ منشوراً — الطابور ينتظر قرار المالك', v_all;
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- (ز) الكتلة تمرّ من بوابة النشر نفسها، ومفتاحُها في فهرس الترجمة بنصّه
-- ----------------------------------------------------------------------------
do $$
declare
  v_content jsonb;
  v_body    text;
begin
  select s.content, s.content ->> 'body' into v_content, v_body
  from public.sections s where s.id = 'b0000000-0000-4000-8000-000000003110'::uuid;

  if not public.block_renders('clause', v_content) then
    raise exception '(ز) 🔴 البوابة ترفض تصيير البند — كتلةٌ في القاعدة لا تظهر على الصفحة';
  end if;

  if coalesce(v_content ->> 'anchor', '') = '' then
    raise exception '(ز) 🔴 البند بلا مرساة — لا يمكن الإحالة إليه برابط';
  end if;

  if not exists (
    select 1 from public.i18n_corpus_rows() c
    where c.ns = 'section'
      and c.k = 'b0000000-0000-4000-8000-000000003110.body'
      and c.src = v_body
  ) then
    raise exception '(ز) 🔴 جسمُ البند ليس في فهرس الترجمة بنصّه الحالي — مفتاحٌ يتيم';
  end if;

  raise notice '✔ (ز) البوابة تقبل الكتلة · لها مرساة «%» · ومفتاحُها في الفهرس بنصّه',
    v_content ->> 'anchor';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ح) 🔒 D-20 — الدالة ليست مفتوحةً لزائرٍ ولا لمتعهدٍ مسجَّل الدخول
-- ----------------------------------------------------------------------------
do $$
declare
  v_bad text;
begin
  select string_agg(r.rolname, '، ') into v_bad
  from (values ('anon'), ('authenticated'), ('public')) r(rolname)
  where has_function_privilege(r.rolname, 'public.loyalty_terms_disclosure()', 'execute');

  if v_bad is not null then
    raise exception '(ح) 🔴 loyalty_terms_disclosure ممنوحةٌ لـ% — نقضُ D-20', v_bad;
  end if;

  if not has_function_privilege('service_role', 'public.loyalty_terms_disclosure()', 'execute') then
    raise exception '(ح) service_role لا يستطيع نداءها — الخادم لن يولّد النصّ';
  end if;

  raise notice '✔ (ح) لا anon ولا authenticated ولا public — وservice_role وحده يناديها';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ط) 🔴 0126 — المنشور **يتحرّك** مع الإعدادات، ولا يبقى نصّاً مجمَّداً
--
--     ما كان مكسوراً: 0125 ولّدت النصّ مرةً واحدة وكتبته ساكناً. فتغييرُ
--     `expire_months` من اللوحة كان يترك صفحة الشروط تَعِد بالرقم القديم —
--     وهي **شروطٌ تعاقدية** يقرؤها العميل، لا نصُّ تسويق.
--     والقسمان (أ) و(ج) لا يمسكان هذا: كلاهما يقارن المنشورَ بالدالة **بعد**
--     أن رجع الإعداد، فيريان تطابقاً لا حركة.
--
--     ⚠ والقياس هنا داخل معاملةٍ فرعية تُرجَع باستثناءٍ مُصطنَع، ثم المشغّل
--        يرجع الملف كلَّه فوقها — حارسان لا واحد على إعدادات المالك.
-- ----------------------------------------------------------------------------
do $$
declare
  v_m0     integer;
  v_e0     boolean;
  v_body0  text;
  v_probe  text;
  v_caught boolean := false;
  v_muted  text;
begin
  if to_regprocedure('public.loyalty_terms_resync(boolean)') is null
     or to_regprocedure('public.loyalty_terms_in_sync()') is null then
    raise exception '(ط) شرط مسبق: 0126 غير مطبَّقة — لا دالةَ مزامنة';
  end if;
  if not exists (
    select 1 from pg_trigger t
    where t.tgrelid = 'public.loyalty_settings'::regclass
      and t.tgname = 'loyalty_settings_sync_terms' and not t.tgisinternal
  ) then
    raise exception '(ط) 🔴 مشغّل المزامنة غير موصول — مفتاحٌ بلا منفِّذ (النمط ٣)';
  end if;

  select l.expire_months, l.enabled into v_m0, v_e0 from public.loyalty_settings l limit 1;
  select s.content ->> 'body' into v_body0
  from public.sections s where s.id = public.loyalty_terms_section_id();

  begin
    -- ── المجسّة (١): بالمشغّل الموصول ⇒ يجب أن يتحرّك المنشور ────────────
    update public.loyalty_settings
       set expire_months = case when v_m0 = 7 then 9 else 7 end,
           enabled       = not v_e0
     where id;

    select (s.content ->> 'body' is distinct from v_body0)::text || '|'
        || s.visible::text || '|'
        || y.body_ok::text || '|'
        || y.snapshots_stale::text || '|'
        || y.en_draft_ok::text
      into v_probe
    from public.sections s, public.loyalty_terms_in_sync() y
    where s.id = public.loyalty_terms_section_id();

    -- ── المجسّة (٢) 🔬 الطفرة: يُفصل المشغّل ⇒ يجب أن **يتجمّد** المنشور ──
    alter table public.loyalty_settings disable trigger loyalty_settings_sync_terms;
    update public.loyalty_settings
       set expire_months = case when v_m0 = 5 then 4 else 5 end
     where id;
    select (s.content ->> 'body')::text into v_muted
    from public.sections s where s.id = public.loyalty_terms_section_id();
    v_probe := v_probe || '|' || (select (y.body_ok)::text from public.loyalty_terms_in_sync() y);

    raise exception 'LOYALTY_SYNC_PROBE:%', v_probe;
  exception
    when others then
      if sqlerrm not like 'LOYALTY_SYNC_PROBE:%' then raise; end if;
      v_probe  := split_part(sqlerrm, ':', 2);
      v_caught := true;
  end;

  if not v_caught then
    raise exception '(ط) 🔴 لم تُلتقط المجسّة — الحقن لم يجرِ';
  end if;

  if split_part(v_probe, '|', 1) <> 'true' then
    raise exception
      '(ط-١) 🔴 تغيّر expire_months ولم يتحرّك نصُّ البند المنشور — نصٌّ مجمَّد يَعِد بما لا ينفّذه النظام';
  end if;
  if split_part(v_probe, '|', 2) <> (not v_e0)::text then
    raise exception
      '(ط-٢) 🔴 الظهور «%» ولم يتبع enabled=% — بندٌ يُعرض عن نظامٍ مطفأ أو يُخفى عن نظامٍ يعمل',
      split_part(v_probe, '|', 2), not v_e0;
  end if;
  if split_part(v_probe, '|', 3) <> 'true' then
    raise exception '(ط-٣) 🔴 loyalty_terms_in_sync تقول إن المنشور يخالف الإعدادات بعد المزامنة';
  end if;
  if split_part(v_probe, '|', 4) <> '0' then
    raise exception
      '(ط-٤) 🔴 % لقطةٍ حيّة بقيت على النصّ القديم — نقضُ D-60: أوّلُ نشرةٍ تُعيد الرقم القديم',
      split_part(v_probe, '|', 4);
  end if;
  if split_part(v_probe, '|', 5) <> 'true' then
    raise exception '(ط-٥) 🔴 مسوّدةُ الإنجليزية بقيت على المصدر القديم — الطابور يكذب عمّا تُرجم';
  end if;
  if split_part(v_probe, '|', 6) <> 'false' then
    raise exception
      '(ط-٦) 🔬 فُصل المشغّل ولم يتجمّد المنشور — فتأكيدُ (ط-١) لا يقيس المشغّل بل شيئاً آخر';
  end if;

  -- والإعداد والنصّ رجعا كما كانا (المعاملةُ الفرعية أرجعت DDL المشغّل معها)
  if (select l.expire_months from public.loyalty_settings l limit 1) is distinct from v_m0
     or (select l.enabled from public.loyalty_settings l limit 1) is distinct from v_e0 then
    raise exception '(ط) 🔴 إعدادات الولاء لم ترجع — المجسّة تركت أثراً على بيانات المالك';
  end if;
  if (select s.content ->> 'body' from public.sections s
       where s.id = public.loyalty_terms_section_id()) is distinct from v_body0 then
    raise exception '(ط) 🔴 نصُّ البند لم يرجع — المجسّة تركت أثراً على المحتوى المنشور';
  end if;
  if not exists (
    select 1 from pg_trigger t
    where t.tgrelid = 'public.loyalty_settings'::regclass
      and t.tgname = 'loyalty_settings_sync_terms' and t.tgenabled <> 'D'
  ) then
    raise exception '(ط) 🔴 المشغّل بقي مفصولاً بعد الطفرة — الحارس نُزع ولم يُعد';
  end if;

  raise notice
    '✔ (ط) 🔴 0126 — المنشور يتبع الإعداد لحظةَ تغيّره: النصّ واللقطات الحيّة (D-60) ومسوّدة الإنجليزية والظهور، وفصلُ المشغّل يُجمّده فوراً';
end;
$$;

-- ----------------------------------------------------------------------------
-- ⚠ **`raise notice` لا `select`** — `scripts/db-test.mjs` يطبع أحداث `notice`
--    وحدها، فمجموعةٌ تنتهي بـ`select` تمرّ خضراء ولا تطبع «ALL PASSED» إطلاقاً.
-- ----------------------------------------------------------------------------
do $$
begin
  raise notice 'ALL PASSED — بندُ الولاء يطابق loyalty_settings، وظهورُه يتبع enabled، والحارس يفشل عند الانحراف';
end;
$$;
