-- ============================================================================
-- 0062_home_design_content.sql — تركيب الصفحة الرئيسية على ترتيب التصميم
--                                 بمحتوىً **له مصدر**.  (المرحلة م‑٢)
--
-- ── القاعدة التي حكمت كل سطر نصٍّ هنا ───────────────────────────────────────
-- لكل رقمٍ في هذه الصفحة أحد ثلاثة أقدار: **مصدرٌ حيّ** يقرؤه النظام، أو
-- **حقلٌ في اللوحة** يكتبه المالك ويتحمّله، أو **الحذف**. والرابع — رقمٌ محفور
-- بلا مصدر — هو الوحيد غير المقبول. وكل رقمٍ أدناه مقيسٌ من هذه القاعدة نفسها:
--
--   • «٩ مسارات»       ⇐ `select count(*) from pages where kind='corridor'` = ٩
--   • «٦ خدمات»        ⇐ `kind='service'` = ٦
--   • «٤ فئات»         ⇐ `vehicle_classes` النشطة = ٤
--   • «٢٤/٧»           ⇐ قرار تشغيلي يملكه المالك — وهو الحقل الوحيد من نوعه
--   • مدد المسارات ومسافاتها ⇐ **من وصف كل صفحة مسار المنشور نفسه** لا من
--     تقديرٍ خارجي، فلا يتناقض سطران في الموقع نفسه.
--
-- 🔴 **وما لم يُنقل من التصميم، بأسمائه:** «١٢٬٤٠٠ رحلة نُفِّذت» (‏`bookings=0`)
--    و«٤٫٨/٥ متوسط تقييم» (لا جدول تقييمات في القاعدة إطلاقاً) و«٩ محافظات»
--    (‏`areaServed` فارغ، ويناقض ثماني مدن في JSON-LD على الصفحة نفسها) وكل
--    سعر «من ٩٥٠ ج.م» (لا حقل سعر في `pages`، والحاسبة تخالفه بعد ثانيتين).
--    وكذلك «سائقون معتمدون» (‏`subcontractors=0`) و«فاتورة ضريبية على البريد»
--    (لا مزوّد بريد) و«سائق يتحدث الإنجليزية» (‏`extra_services=0` فالخيار لا
--    يظهر للعميل أصلاً) و«نتابع رقم رحلتك **آلياً**» (لا تكامل طيران).
--
-- ⚠ **وتصحيحٌ لتناقضٍ كان في التصميم:** «إلغاء مجاني حتى ٢٤ ساعة» يخالف أسئلة
--    الرئيسية الحيّة (٢٤ للمدينة والمطارات · ٤٨ للمحافظات والجولات · ٧٢
--    للمناسبات). النافذة المتدرّجة هي المكتوبة هنا.
--
-- ── لماذا الملف يعمل مرة واحدة ──────────────────────────────────────────────
-- تركيب الصفحة يعيد ترتيب صفوفٍ **يملكها المالك** ويُخفي صفاً. فلو جرى في كل
-- تنفيذ لأعاد ترتيباً غيّره المالك بيده، ولأخفى قسماً أظهره. فالكتلة كلها
-- مشروطة بغياب كتلة الماركات — أي بعدم تطبيقها من قبل.
-- ============================================================================

do $$
declare
  v_home uuid;
  -- معرّفات ثابتة بادئتها 0b61 ⇒ يُعرف مصدرها بالنظر، وإعادة التنفيذ مستقرة
  v_logos  constant uuid := '0b610000-0000-4000-8000-000000000001';
  v_stats  constant uuid := '0b610000-0000-4000-8000-000000000002';
  v_routes constant uuid := '0b610000-0000-4000-8000-000000000003';
  v_promise constant uuid := '0b610000-0000-4000-8000-000000000004';
  v_hero   uuid;
begin
  select id into v_home from public.pages where kind = 'home' limit 1;
  if v_home is null then
    raise notice '⏭ 0062: لا صفحة رئيسية في هذه القاعدة — لا شيء يُركَّب';
    return;
  end if;

  if exists (select 1 from public.sections where id = v_logos) then
    raise notice '⏭ 0062: التركيب مطبَّق سلفاً — لا يُعاد ترتيب صفحةٍ يملكها المالك';
    return;
  end if;

  -- ── (١) الكتل الجديدة ────────────────────────────────────────────────────

  -- شريط الماركات: العنوان والتنويه من التصميم حرفاً، والشعارات من الإعدادات.
  -- والتنويه شرط استعمالٍ مكتوب في الاتفاق §٤ لا سطرٌ تجميلي.
  insert into public.sections (id, page_id, type, content, sort, visible) values
    (v_logos, v_home, 'logo-strip', jsonb_build_object(
      'title', 'الفئات المتاحة في أسطولنا',
      'note',  'الشعارات معروضة لبيان طرازات المركبات العاملة في الأسطول فقط، ولا تعني اعتماداً أو علاقة تجارية مع الشركات المصنّعة.',
      'style', jsonb_build_object('_v', 1)
    ), 1, true);

  -- 🔴 شريط الأرقام: أربعة أرقام **يمكن الدفاع عن كل واحد منها** — ثلاثة
  --    منها يعدّها استعلامٌ على هذه القاعدة، والرابع قرار تشغيلي للمالك.
  insert into public.sections (id, page_id, type, content, sort, visible) values
    (v_stats, v_home, 'stat-band', jsonb_build_object(
      'items', jsonb_build_array(
        jsonb_build_object('_k','stb24h','value','٢٤','suffix','/٧','label','خدمة ودعم'),
        jsonb_build_object('_k','stbcls','value','٤','label','فئات سيارات تختار منها'),
        jsonb_build_object('_k','stbrts','value','٩','label','مسارات بين المحافظات لها صفحاتها'),
        jsonb_build_object('_k','stbsrv','value','٦','label','خدمات نقل تغطي رحلتك')
      ),
      'style', jsonb_build_object('_v', 1)
    ), 2, true);

  -- سكة المسارات: ستة من التسعة المنشورة فعلاً، بروابطها الحقيقية.
  -- ⚠ ثلاثة من مسارات التصميم لا وجود لها (`cairo-airport-zamalek` ·
  --   `cairo-airport-new-cairo` · `sharm-dahab`) — والتصميم يتبع الـslug لا
  --   العكس، فتغيير الـslug ممنوع بقرارٍ مكتوب (D-24) والروابط العربية أصل سيو.
  -- والمدد والمسافات منقولة من وصف كل صفحة مسار المنشور، فلا يتناقض سطران.
  insert into public.sections (id, page_id, type, content, sort, visible) values
    (v_routes, v_home, 'route-rail', jsonb_build_object(
      'title', 'مسارات نغطيها بين المحافظات',
      'sub',   'لكل مسار صفحته وتفاصيله — اضغط أيّها لتسعيره برحلتك أنت.',
      'note',  'المدد والمسافات تقديرية بحسب حالة الطريق ونقطتَي الرحلة. السعر النهائي يظهر في نموذج الحجز قبل التأكيد.',
      'items', jsonb_build_array(
        jsonb_build_object('_k','rtalex','name','القاهرة ← الإسكندرية','href','/routes/cairo-alexandria','duration','نحو ٣ ساعات'),
        jsonb_build_object('_k','rtskhn','name','القاهرة ← العين السخنة','href','/routes/cairo-ain-sokhna','duration','ساعة ونصف','distance','١٣٠ كم'),
        jsonb_build_object('_k','rtshrm','name','القاهرة ← شرم الشيخ','href','/routes/cairo-sharm-el-sheikh','duration','٦ ساعات','distance','٥٠٠ كم'),
        jsonb_build_object('_k','rthrgd','name','القاهرة ← الغردقة','href','/routes/cairo-hurghada','duration','نحو ٥ ساعات ونصف'),
        jsonb_build_object('_k','rtluxr','name','القاهرة ← الأقصر','href','/routes/cairo-luxor','duration','٨ ساعات','distance','٦٤٠ كم'),
        jsonb_build_object('_k','rthgll','name','الغردقة ← الأقصر','href','/routes/hurghada-luxor','duration','٤ ساعات','distance','٣٠٠ كم')
      ),
      'style', jsonb_build_object('_v', 1)
    ), 6, true);

  -- الضمانات الست — كتلة `features` القائمة بلا حرفٍ جديد في السجل.
  -- وستّها منقّاة: كل وعدٍ هنا له سطحٌ يحمله اليوم في هذا المستودع.
  insert into public.sections (id, page_id, type, content, sort, visible) values
    (v_promise, v_home, 'features', jsonb_build_object(
      'title', 'ست ضمانات مكتوبة',
      'sub',   'لا وعد هنا بلا سطحٍ يحمله في نظامنا اليوم.',
      'items', jsonb_build_array(
        jsonb_build_object('_k','gr1prc','title','سعر نهائي قبل التأكيد',
          'text','الرقم الذي توافق عليه هو ما تدفعه: بلا عدّاد وبلا رسوم تظهر آخر الرحلة.'),
        jsonb_build_object('_k','gr2fit','title','فئة تتسع لكم فعلاً',
          'text','تظهر لك الفئات التي تتسع لعدد ركابكم وحقائبكم وحدها — الأهلية تُحسم عندنا لا في تقديرك.'),
        jsonb_build_object('_k','gr3arr','title','استقبال داخل صالة الوصول',
          'text','سائق ينتظرك عند بوابة الخروج بلوحة تحمل اسمك، والانتظار يُحسب من الهبوط الفعلي لا من الموعد المجدول.'),
        jsonb_build_object('_k','gr4cnl','title','إلغاء بنافذة معلنة',
          'text','مجاني قبل ٢٤ ساعة لمشاوير المدينة واستقبال المطارات، وقبل ٤٨ للمحافظات والجولات، وقبل ٧٢ للمناسبات والأفواج.'),
        jsonb_build_object('_k','gr5trk','title','رابط خاص بحجزك',
          'text','صفحة حجزك تحمل تفاصيله وحالته وإيصالاته، ومن فقد الرابط يستعيده بمرجع الحجز ورقم هاتفه.'),
        jsonb_build_object('_k','gr6acc','title','جهة مساءلة واحدة',
          'text','الرحلة يُنفّذها متعهد نقل من شبكتنا بمركبته وسائقه، وتبقى مسؤولية حجزك علينا وحدنا.')
      ),
      'style', jsonb_build_object('_v', 1)
    ), 7, true);

  -- ── (٢) توسيع البطل — نصوصٌ كانت محفورة في `components/site/hero.tsx` ─────
  -- الشارة كانت `company.activity` والضمانات الثلاث مصفوفةً في الكود. صارتا
  -- حقلين في الصفّ، والغياب يبقى يرجع إلى القديم حرفاً بحرف.
  select id into v_hero from public.sections
   where page_id = v_home and type = 'hero' order by sort limit 1;

  if v_hero is not null then
    update public.sections set content = content || jsonb_build_object(
      'badge', 'نقل خاص داخل مصر · سعر نهائي قبل التأكيد',
      'scrollLabel', 'اكتشف',
      'items', jsonb_build_array(
        jsonb_build_object('_k','hrtcnl','title','إلغاء مجاني بنافذة معلنة'),
        jsonb_build_object('_k','hrtwat','title','انتظار المطار من الهبوط الفعلي'),
        jsonb_build_object('_k','hrtpay','title','ادفع عربوناً أو المبلغ كاملاً')
      )
    ) where id = v_hero;
  end if;

  -- ── (٣) الترتيب — ترتيب التصميم على الكتل القائمة ────────────────────────
  -- ٠ البطل · ١ الماركات · ٢ الأرقام · ٣ الخدمات · ٤ الأسطول · ٥ كيف نعمل ·
  -- ٦ المسارات · ٧ الضمانات · ٨ لماذا نحن (مخفيّ) · ٩ الحجز · ١٠ الأسئلة ·
  -- ١١ التواصل.
  update public.sections set sort = 0  where page_id = v_home and type = 'hero';
  update public.sections set sort = 3  where page_id = v_home and type = 'services-grid';
  update public.sections set sort = 4  where page_id = v_home and type = 'fleet';
  update public.sections set sort = 5  where page_id = v_home and type = 'features' and id <> v_promise;
  update public.sections set sort = 8  where page_id = v_home and type = 'why-us';
  update public.sections set sort = 9  where page_id = v_home and type = 'cta-band';
  update public.sections set sort = 10 where page_id = v_home and type = 'faq';
  update public.sections set sort = 11 where page_id = v_home and type = 'contact';

  -- ── (٤) «لماذا نحن» تُخفى ولا تُحذف ──────────────────────────────────────
  -- نقاطها الأربع **محفورة في `components/site/why-us.tsx`** ولا يملك المالك
  -- منها إلا العنوان والنص فوقها — أي أنها تخالف القيد غير القابل للتفاوض.
  -- وقد صارت الضمانات الست تقول ما تقوله وأكثر، **وكلها محرَّرة**.
  -- والإخفاء لا الحذف: صفُّها يبقى ومعه مفاتيح ترجمته، ويعود بضغطة واحدة من
  -- اللوحة إن أرادها المالك.
  update public.sections set visible = false
   where page_id = v_home and type = 'why-us';

  raise notice '✔ 0062: الرئيسية مركَّبة على ترتيب التصميم — ٤ كتل جديدة وبطل موسَّع';
end;
$$;

-- ----------------------------------------------------------------------------
-- الفحص الذاتي — يسأل عمّا يراه الزائر لا عمّا كُتب
--
-- «صفٌّ في القاعدة ليس صفحةً مُصيَّرة»: فالفحص هنا يمرّ على `block_renders`
-- نفسها التي تسأل عنها العارضة، لا على وجود الصف.
-- ----------------------------------------------------------------------------

do $$
declare
  v_home uuid;
  v_bad  text;
begin
  select id into v_home from public.pages where kind = 'home' limit 1;
  if v_home is null then return; end if;

  select string_agg(s.type || ' (' || s.id || ')', '، ') into v_bad
  from public.sections s
  where s.page_id = v_home and s.visible
    and not public.block_renders(s.type, coalesce(s.content, '{}'::jsonb));
  if v_bad is not null then
    raise exception '(٠٠٦٢‑أ) أقسام ظاهرة على الرئيسية لا تُصيَّر: %', v_bad;
  end if;

  -- الكتل الثلاث وصلت الصفحة فعلاً وتُصيَّر — لا «أُدرجت» وحدها
  foreach v_bad in array array['logo-strip', 'stat-band', 'route-rail'] loop
    if not exists (
      select 1 from public.sections s
      where s.page_id = v_home and s.type = v_bad and s.visible
        and public.block_renders(s.type, coalesce(s.content, '{}'::jsonb))
    ) then
      raise exception '(٠٠٦٢‑ب) كتلة «%» ليست على الرئيسية أو لا تُصيَّر', v_bad;
    end if;
  end loop;

  -- ولا ترتيبان متساويان: قسمان بنفس `sort` يجعلان ترتيب الصفحة غير محدَّد
  if exists (
    select 1 from public.sections
    where page_id = v_home and visible and parent_id is null
    group by sort having count(*) > 1
  ) then
    raise exception '(٠٠٦٢‑ج) قسمان ظاهران على الرئيسية بنفس الترتيب';
  end if;

  raise notice '✔ 0062: كل قسمٍ ظاهر على الرئيسية يُصيَّر، والترتيب بلا تعادل';
end;
$$;
