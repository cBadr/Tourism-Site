-- ============================================================================
-- 0095 — مراجعة تسويقية وسيوية للمحتوى العربي: الفائدة قبل الصفة، والأرقام
--        المختلَقة تخرج، والعلامة تُذكر مرةً في كل صفحة لا في كل فقرة
--
-- ══════════════════════════════════════════════════════════════════════════
--  🔴 لماذا وُجدت هذه الهجرة — ثلاث مخالفات **حيّة** على الرئيسية
-- ══════════════════════════════════════════════════════════════════════════
--
-- المحتوى العربي مكتوبٌ جيداً في عمومه (‏١٦٠ قسماً على ٢٣ صفحة)، والخلل مركَّزٌ
-- في كتلٍ أُضيفت بعد موجز `SITE-CONTENT.md` فلم تمرّ على قواعده. والمقيس:
--
-- (١) 🔴 **`stat-band` يحمل أرقاماً لا مصدر لها في القاعدة إطلاقاً:**
--     «١٩٢٣ رحلات مكتملة» و`bookings = 12` (وهي بيانات تجريب) · «١٦ سيارة
--     جاهزة» و`subcontractor_vehicles = 1` · «+٥٠ سائق محترف» و
--     `subcontractor_drivers = 1`. **والأسوأ من عدم دقّتها أنها ادّعاءُ ملكٍ**:
--     المنصّة وسيطٌ لا يملك مركبةً ولا يوظّف سائقاً (‏`OVERVIEW` العمودان ١-٢،
--     و`SITE-CONTENT` ٥-أ). ورأسُ `components/sections/stat-band.tsx` يقول
--     حرفاً: «الكتلة تُشحن والأرقام لا» ويسمّي هذا العطب بعينه قبل وقوعه.
--     وهو **البند الرابع في شرط النشر** (‏`STANDING-ORDERS` ٢-ج) — وجوجل يفهرس
--     الرقم، والتصحيح بعد الفهرسة أصعب.
--
-- (٢) 🔴 **ادّعاء ملكٍ في ثلاثة مواضع أخرى:** `logo-strip.title` «الفئات
--     المتاحة في **أسطولنا**» · `services-grid` «**أساطيل** منسقة للحفلات» ·
--     و`logo-strip.note` «**أفضل** السيارات في فئآتها **موديلات السنة
--     الحالية**» — وفيها ممنوعُ التفضيل (‏القاعدة ٤) ووعدُ طرازٍ لا يملكه أحد
--     منّا، وخطأٌ إملائي («فئآتها»).
--
-- (٣) **نصٌّ نائب منشور**: `cairo-alexandria` تحمل في `rich-text.title` عبارة
--     «نص عنوان القسم» — تُصيَّر `<h2>` على صفحةٍ عامة. والمواصفة تقول إن
--     `rich-text` في صفحات المسار **بلا عنوان** (‏`SITE-CONTENT` ٣-ج)، فيُحذف
--     الحقل ولا يُستبدل.
--
-- ومعها: «اضغط علي المسار» (‏نصُّ رابطٍ ممنوع، ومعه «علي» في موضع «على»)، و«لا
-- وعد هنا بلا سطحٍ يحمله في نظامنا» (‏لغةُ مهندسٍ في صفحةٍ للزائر)، و«الإنطلاق»
-- و«الي» و«مرسي» و«او» و«الأسكندرية» — أخطاءُ همزةٍ وياءٍ في نصٍّ مفهرس.
--
-- ══════════════════════════════════════════════════════════════════════════
--  ما تفعله هذه الهجرة — وما لا تفعله
-- ══════════════════════════════════════════════════════════════════════════
--
-- (أ) **العلامة تُذكر مرةً واحدة في نثر كل صفحة، في الجملة التي تحملها أصلاً.**
--     تكرارُ العلامة في النثر حشوٌ للكلمات المفتاحية — بندٌ مسمّى في سياسات
--     جوجل للسبام وإشارةٌ سالبة لا موجبة. فالموضع المشروع: `<title>` (‏يضيفه
--     القالب) و`meta.description` و`<h1>` مرةً و`Organization`/`sameAs`. وفي
--     النثر: **ضميرٌ يصير اسماً**، بصفر كلمةٍ مضافة —
--     «تحجز الرحلة **معنا**» ⇒ «تحجز الرحلة **مع ايجار ليموزين**».
--
-- (ب) **`stat-band` يصير أرقام سياسةٍ مكتوبةً في الشروط** لا أرقام إنجاز:
--     ٦٠ دقيقة انتظار المطار من الهبوط الفعلي · أربع فئات (`vehicle_classes`
--     = ٤ صفوف) · ٢٤ ساعة نافذة الإلغاء المجاني للمدينة والمطار · ٩ مسارات لها
--     صفحاتها (‏٩ صفوف `kind='corridor'`). **كل رقم منها له سطرٌ يُتحقَّق منه
--     في القاعدة أو في `terms`/`refund-policy`** — وهي الصيغة التي يفرضها
--     `SITE-CONTENT` ٥-ب: «القسم الذي يحتاج رقماً لا نملكه يُغيَّر، ولا يُختلق».
--
-- (ج) **العناوين تقول الفائدة**، وبطاقات الخدمات تصف ما يحصل عليه العميل بدل
--     صفاتٍ ندّعيها («بمنتهى الدقة والفاعلية» ⇒ «من باب بيتك إلى باب وجهتك»).
--
-- (د) 🔒 **ولا يُلمس رقمُ سياسةٍ ولا التزام:** نوافذ الإلغاء (٢٤/٤٨/٧٢) ومُدد
--     الانتظار (١٥/٣٠/٦٠) ومُدد الردّ (٧ أيام عمل · ٣٠ يوماً) ومُدد الحفظ —
--     كلها تُنقل حرفاً حيث وردت. والصفحات القانونية الثلاث **لم يُمسّ فيها إلا
--     طولُ `meta.description`** في `refund-policy` (‏١٧٠ ⇒ ١٥١ حرفاً)، وهو حقلٌ
--     في `pages.meta` لا بندٌ في الاتفاق.
--
-- (هـ) 🔒 **ولا يُلمس `_k` واحد.** كل ما تحت `items` يبقى في مكانه بمفتاحه —
--     والمفتاح عنوانُ الترجمة (‏`0059`). فالنصّ يتغيّر والعنوان لا، وهو ما
--     يجعل الطابور يرى «نصّاً جديداً على مفتاحٍ قائم» لا مفتاحاً يتيماً.
--
-- ⚠ **وما بقي بيد بدر ولم تلمسه الهجرة** (‏`SITE-CONTENT` ١-د و٨/٥):
--     `seo.titleTemplate` = «%s | منصة النقل السياحي» — **ليس اسم العلامة**،
--     فكل نتيجة بحث تحمل اسماً غير اسمه · `socials.linkedin` ملفٌّ شخصي باسمٍ
--     آخر يخرج في `sameAs` · `brand.logoUrl` على نطاق ووردبريس خارجي ·
--     `seo.robots.indexable = false`. أربعتها إعداداتُ لوحة، والأول والثاني
--     **هما بالضبط ما يبني هوية العلامة في البحث** — فالهجرة تُهيّئ العناوين
--     لقالبٍ صحيح (‏كلها ≤٤٥ حرفاً) ولا تقرّر عنه.
--
-- ⚠ **D-60 — مَن كتب في `sections.content` كتب في اللقطات الحيّة معها.** ولقطةٌ
--    حيّةٌ واحدة قائمة اليوم (‏`home`/`published`)، ومقيسٌ أن محتواها **مطابقٌ
--    حرفاً** لصفوف الجدول قبل هذه الهجرة — فالمرآة أدناه لا تُتلف عملَ أحد،
--    وبدونها تُمحى كل هذه النصوص بأول ضغطة «نشر».
-- ============================================================================

create temporary table _corpus_before_95 on commit drop as
select ns, k from public.i18n_corpus_rows();

-- ----------------------------------------------------------------------------
-- (١) العلامة في النثر — مرةً لكل صفحة، بإبدال ضميرٍ باسم
--
-- `replace()` على نصٍّ مرساه فريدٌ في الصفحة: التشغيل الثاني لا يجد المرسى
-- فلا يفعل شيئاً — إعادةُ التنفيذ مجانية بلا شرطٍ إضافي.
-- ----------------------------------------------------------------------------

do $$
declare
  v_pair   record;
  v_hits   integer;
  v_total  integer := 0;
  -- (‏slug, المرسى, البديل) — والمرسى مقيسٌ حاضراً مرةً واحدة في كل صفحة
  v_pairs  text[][] := array[
    ['airport-transfer',  'الحجز يجعل المطار',
                          'الحجز مع ايجار ليموزين يجعل المطار'],
    ['city-rides',        'الحجز هنا من عنوان إلى عنوان',
                          'الحجز مع ايجار ليموزين من عنوان إلى عنوان'],
    ['intercity-travel',  'الرحلة الخاصة تُلغي الطرفين',
                          'الرحلة الخاصة مع ايجار ليموزين تُلغي الطرفين'],
    ['tours',             'الجولة هنا تُحجز رحلةً بموعدين',
                          'الجولة مع ايجار ليموزين تُحجز رحلةً بموعدين'],
    ['events',            'لذلك يُبنى تحرك المناسبة على حجوزات مكتوبة',
                          'لذلك يُبنى تحرك المناسبة مع ايجار ليموزين على حجوزات مكتوبة'],
    ['conferences',       'لذلك يُبنى التحرك الجماعي هنا قطعةً قطعة',
                          'لذلك يُبنى التحرك الجماعي مع ايجار ليموزين قطعةً قطعة'],
    ['business',          'والثالث أن الشركة وسيط لخدمات النقل السياحي البري',
                          'والثالث أن ايجار ليموزين وسيط لخدمات النقل السياحي البري']
  ];
begin
  -- (١-أ) الصفحات المفردة
  for v_pair in select v_pairs[i][1] as slug, v_pairs[i][2] as src, v_pairs[i][3] as dst
                from generate_subscripts(v_pairs, 1) as i
  loop
    update public.sections s
    set content = jsonb_set(s.content, '{body}',
          to_jsonb(replace(s.content ->> 'body', v_pair.src, v_pair.dst)))
    from public.pages p
    where p.id = s.page_id
      and p.slug = v_pair.slug
      and s.type = 'rich-text'
      and s.content ->> 'body' like '%' || v_pair.src || '%';
    get diagnostics v_hits = row_count;
    v_total := v_total + v_hits;
  end loop;

  -- (١-ب) صفحات المسار التسع — الجملة نفسها في تسعتها، والاسم يحلّ محلّ «معنا»
  update public.sections s
  set content = jsonb_set(s.content, '{body}',
        to_jsonb(replace(s.content ->> 'body',
          'تحجز الرحلة معنا وينفّذها متعهد معتمد من شبكتنا',
          'تحجز الرحلة مع ايجار ليموزين وينفّذها متعهد معتمد من شبكتنا')))
  from public.pages p
  where p.id = s.page_id
    and p.kind = 'corridor'
    and s.type = 'rich-text'
    and s.content ->> 'body' like '%تحجز الرحلة معنا وينفّذها%';
  get diagnostics v_hits = row_count;
  v_total := v_total + v_hits;

  raise notice '  ← ذكرُ العلامة في النثر: % فقرة', v_total;
end;
$$;

-- ----------------------------------------------------------------------------
-- (٢) الرئيسية — الكتل التي لم تمرّ على قواعد الموجز
-- ----------------------------------------------------------------------------

-- (٢-أ) البطل: الشارة والعنوان الاحتياطي وجُمل الكتابة وشارات الثقة
--
-- ⚠ و`<h1>` الحيّ = `typingPrefix` + أول جملة (‏`components/site/hero.tsx:270`)،
--   فأول جملةٍ يجب أن تُكمل الاسم جملةً مفيدة: «ايجار ليموزين بسعر معلن قبل أن
--   تؤكد». والعلامة فيه **مرةً واحدة** لا مرتين.
-- ⚠ و`headline` يبقى محرَّراً لأنه يعود لحظة تُفرَّغ الجُمل (‏نفس الملف §ن-٤).
-- ⚠ و«١٦ محافظة» تخرج من الشارة: `business.areaServed` فارغ، و`about` تقول
--   «نسعّر أي مسار داخل مصر» — فالرقم يناقض صفحةً أخرى ولا سطرَ يسنده. وتعليقُ
--   `hero.tsx:107` يحذّر من هذا بعينه.
update public.sections
set content = content || jsonb_build_object(
  'badge',   'أي مسار داخل مصر — والحجز أونلاين بلا مكالمة',
  'headline','ايجار ليموزين — سيارة بسائق بسعر معلن قبل التأكيد',
  'typingPrefix', 'ايجار ليموزين',
  'typingLines',
    'بسعر معلن قبل أن تؤكد' || E'\n' ||
    'من القاهرة إلى الإسكندرية' || E'\n' ||
    'من القاهرة إلى الساحل الشمالي' || E'\n' ||
    'من القاهرة إلى العين السخنة' || E'\n' ||
    'من القاهرة إلى الغردقة وشرم الشيخ' || E'\n' ||
    'من القاهرة إلى الأقصر وأسوان' || E'\n' ||
    'من القاهرة إلى مرسى مطروح' || E'\n' ||
    'من مطار القاهرة إلى باب فندقك',
  'items', $j$[
    {"_k":"hrtcnl","title":"عربون أو كامل المبلغ"},
    {"_k":"hrtwat","title":"انستا باي ومحافظ إلكترونية"},
    {"_k":"hrtpay","title":"حسابات التحويل داخل صفحة حجزك"}
  ]$j$::jsonb
)
where type = 'hero';

-- (٢-ب) شريط الماركات — الشعار ادّعاءُ طرازٍ متاح لا ادّعاءُ ملكٍ ولا شراكة
--       (‏وهو نصُّ القرار في `page-builder-types.ts` §`LOGO_LINK_TOKENS`)
update public.sections
set content = content || jsonb_build_object(
  'title', 'ماركات تجدها في الفئات المتاحة',
  'note',  'طُرز شائعة لدى متعهدي الشبكة — والطراز الذي يصلك يظهر في صفحة حجزك قبل التحرك.'
)
where type = 'logo-strip';

-- (٢-ج) شبكة الخدمات — نصُّ البطاقة يقول الفائدة، لا «اضغط على القائمة»
--
-- ⚠ ولا يُلمس `alt` ولا `src` ولا `href` ولا `icon`: الأوصاف مطابقةٌ لما في
--   الصور فعلاً، والمسارات هي الربط الداخلي نفسه.
update public.sections
set content = content || jsonb_build_object(
  'sub', 'ست خدمات، ولكل واحدة صفحتها بما يشمله سعرها وما لا يشمله.',
  'items', (
    select jsonb_agg(
      case i.value ->> '_k'
        when 'svairp' then i.value || jsonb_build_object('text',
          'سائق ينتظرك في صالة الوصول، وانتظار مجاني يُحسب من الهبوط الفعلي.')
        when 'svcity' then i.value || jsonb_build_object('text',
          'سعر ثابت من عنوان إلى عنوان، بلا عدّاد يدور في الزحام.')
        when 'svintr' then i.value || jsonb_build_object('text',
          'من باب بيتك إلى باب وجهتك، بموعد تختاره أنت لا بجدول معلن لغيرك.')
        when 'svtour' then i.value || jsonb_build_object('text',
          'سيارة تبقى معك يوم زيارتك، وتكلفة اليوم كاملة قبل أن يبدأ.')
        when 'svevnt' then i.value || jsonb_build_object('text',
          'حجز مكتوب لكل سيارة بموعدها، وإلغاء مجاني قبل الموعد باثنتين وسبعين ساعة.')
        when 'svconf' then i.value || jsonb_build_object('text',
          'كل تحرّك حجزٌ بموعده وسعره، ورابط حالة يتابعه المنظّم.')
        else i.value
      end
      order by i.ord
    )
    from jsonb_array_elements(content -> 'items') with ordinality as i(value, ord)
  )
)
where type = 'services-grid'
  and jsonb_typeof(content -> 'items') = 'array';

-- (٢-د) 🔴 شريط الأرقام — أرقامُ شروطٍ تُتحقَّق، بدل أرقامِ إنجازٍ تُختلق
--
-- والمفاتيح الأربعة تبقى كما هي: العنوان الترجمي هو الخانة لا المعنى، و`_k`
-- المستبدَل يُيتّم مفتاحاً (‏`0059`). و`translations` صفرُ صفوف اليوم (‏D-25)
-- فالنصّ الجديد يدخل الطابور نصّاً جديداً على مفتاحٍ قائم.
update public.sections
set content = content || jsonb_build_object(
  'title', 'أرقام تلزمنا، مكتوبة في شروطنا',
  'items', $j$[
    {"_k":"stb24h","value":"٦٠","suffix":"دقيقة","label":"انتظار مجاني في استقبال المطارات، من الهبوط الفعلي"},
    {"_k":"stbcls","value":"٤","suffix":"فئات","label":"سيدان وSUV وميني باص وباص، بسعة ركاب وحقائب معلنة"},
    {"_k":"stbrts","value":"٢٤","suffix":"ساعة","label":"نافذة الإلغاء المجاني لمشاوير المدينة والمطار"},
    {"_k":"stbsrv","value":"٩","suffix":"مسارات","label":"صفحة لكل مسار بمسافته وزمنه وما يشمله"}
  ]$j$::jsonb
)
where type = 'stat-band';

-- (٢-هـ) الضمانات الست — الجملة تحت العنوان كانت لغةَ مهندسٍ لا لغةَ زائر
update public.sections
set content = content || jsonb_build_object(
  'sub', 'كل بند أدناه مكتوب في شروطنا أو ظاهر في صفحة حجزك.')
where type = 'features'
  and content ->> 'sub' = 'لا وعد هنا بلا سطحٍ يحمله في نظامنا اليوم.';

-- (٢-و) سكة المسارات — «اضغط علي المسار» نصُّ رابطٍ ممنوع، ويحلّ محلّه ما يقوله
--       الرابط فعلاً. ومسافتان ناقصتان تُكملان من نصّ صفحتيهما.
update public.sections
set content = content || jsonb_build_object(
  'title', 'مسارات بين المحافظات',
  'sub',   'لكل مسار صفحة بمسافته وزمنه وما يشمله الحجز عليه.',
  'items', (
    select jsonb_agg(
      case i.value ->> '_k'
        when 'rtalex' then i.value || jsonb_build_object('distance', '٢٢٠ كم')
        when 'rthrgd' then i.value || jsonb_build_object('distance', '٤٦٠ كم')
        else i.value
      end
      order by i.ord
    )
    from jsonb_array_elements(content -> 'items') with ordinality as i(value, ord)
  )
)
where type = 'route-rail'
  and jsonb_typeof(content -> 'items') = 'array';

-- (٢-ز) شريط الدعوة — «الإنطلاق» همزةُ قطعٍ في موضع وصل، والعنوان صفةٌ لا فائدة
update public.sections s
set content = s.content || jsonb_build_object(
  'title', 'السعر النهائي أمامك قبل أن تؤكد',
  'note',  replace(s.content ->> 'note', 'نقطة الإنطلاق', 'نقطة الانطلاق')
)
from public.pages p
where p.id = s.page_id
  and p.kind = 'home'
  and s.type = 'cta-band';

-- ----------------------------------------------------------------------------
-- (٣) المؤتمرات — بندٌ يكرّر صفحة المناسبات حرفاً يصير بنداً يخصّ المؤتمرات
--
-- «نافذة إلغاء اثنتان وسبعون ساعة» عنوانٌ واحد على الصفحتين بنصٍّ واحد — وست
-- صفحات خدمة لا تفترق إلا بمرادفٍ لا تكسب شيئاً في البحث وتُقرأ مولَّدة. والرقم
-- نفسه **يبقى مذكوراً في نثر الصفحة وفي أسئلتها**، فلا يضيع التزام.
-- ----------------------------------------------------------------------------

update public.sections s
set content = jsonb_set(s.content, '{items}', (
  select jsonb_agg(
    case i.value ->> '_k'
      when 'cnf004' then i.value || jsonb_build_object(
        'title', 'برنامج طويل يبدأ بطلب عرض سعر',
        'text',  'حين تتعدد المركبات أو تمتد الأيام، اذكر البرنامج والأعداد والمواعيد في طلب عرض السعر بدل الحجز قطعةً قطعة.')
      else i.value
    end
    order by i.ord
  )
  from jsonb_array_elements(s.content -> 'items') with ordinality as i(value, ord)
))
from public.pages p
where p.id = s.page_id
  and p.slug = 'conferences'
  and s.type = 'features'
  and s.content -> 'items' @> '[{"_k":"cnf004"}]'::jsonb;

-- ----------------------------------------------------------------------------
-- (٤) 🔴 النصّ النائب المنشور — يُحذف الحقل ولا يُستبدل
--
-- المواصفة: `rich-text` في صفحات المسار **بلا عنوان** (‏`SITE-CONTENT` ٣-ج)،
-- وثماني صفحاتٍ من التسع تحقّقها فعلاً. فالتاسعة تُسوّى إليها.
-- ----------------------------------------------------------------------------

update public.sections s
set content = s.content - 'title'
from public.pages p
where p.id = s.page_id
  and p.kind = 'corridor'
  and s.type = 'rich-text'
  and s.content ->> 'title' = 'نص عنوان القسم';

-- ----------------------------------------------------------------------------
-- (٥) الميتاداتا — الحدّ ٤٥ حرفاً للعنوان (‏القالب يضيف ١٦) و١٤٠-١٦٠ للوصف
--
-- 🔴 و**اسم العلامة يخرج من `meta.title`**: القالب يلصقه بكل عنوان، فوجوده في
--    الحقل يكرّره في نتيجة البحث ويهدر ثلث الحدّ (‏`SITE-CONTENT` ٧-أ).
--    ووجودُه في `meta.description` مقصودٌ — وهو أقوى موضعٍ يحمله بعد العنوان.
-- ----------------------------------------------------------------------------

-- (٥-أ) `about`: «أذكي منصة» تفضيلٌ ممنوع (‏القاعدة ٤) وخطأٌ إملائي معاً،
--       واسمُ العلامة مكرَّرٌ مع القالب، والوصف ١٧٠ حرفاً وفيه « و بدون».
update public.pages
set meta = coalesce(meta, '{}'::jsonb) || jsonb_build_object(
  'title',       'من نحن — منصة حجز سيارة بسائق في مصر',
  'description', 'ايجار ليموزين وسيط نقل سياحي داخل مصر: نستقبل طلبك ونسعّره وننسّقه، ثم ينفّذه متعهد معتمد من شبكتنا بمركبته وسائقه — وتبقى المساءلة أمامك علينا وحدنا.'
)
where slug = 'about';

-- (٥-ب) الرئيسية: الوصف يكسب اسم العلامة (‏١٥٠ حرفاً)، والعنوان صالحٌ كما هو
update public.pages
set meta = coalesce(meta, '{}'::jsonb) || jsonb_build_object(
  'description', 'ايجار ليموزين: سيارة خاصة بسائق داخل مصر — استقبال مطارات، وتنقل داخل المدن وبين المحافظات، وجولات ومناسبات. قارن الفئات بأسعارها وأكّد حجزك في دقائق.'
)
where kind = 'home';

-- (٥-ج) `cairo-alexandria`: العنوان وحده كان يحمل اسم العلامة بين المسارات
--       التسعة — فيعود إلى نمط أخواته الثمانية
update public.pages
set meta = coalesce(meta, '{}'::jsonb) || jsonb_build_object(
  'title', 'من القاهرة إلى الإسكندرية — سيارة بسائق')
where slug = 'cairo-alexandria';

-- (٥-د) `refund-policy`: الوصف ١٧٠ ⇒ ١٥١ حرفاً. **طولٌ فقط** — ولا رقم ولا
--        نافذة ولا نسبة في هذا الحقل أصلاً، ومتنُ الصفحة لم يُمسّ ببايت.
update public.pages
set meta = coalesce(meta, '{}'::jsonb) || jsonb_build_object(
  'description', 'قواعد إلغاء الحجز واسترداد المبالغ المحوَّلة: نوافذ الإلغاء المجاني بحسب نوع الرحلة، وخصومات الإلغاء المتأخر، وحالات الاسترداد الكامل، ومدة رد الأموال.')
where slug = 'refund-policy';

-- ----------------------------------------------------------------------------
-- (٦) 🔴 D-60 — اللقطات الحيّة تُصالَح بنفس المحتوى، وإلا محتها أول نشرة
--
-- والمؤرشفة **لا تُلمس**: إعادةُ كتابة الماضي تكذب على من يقرأ تاريخ الصفحة،
-- والرجوعُ إلى لقطةٍ قديمة يُعيد نصَّها القديم — رجوعٌ صريح لا انكسارٌ صامت.
-- ----------------------------------------------------------------------------

update public.page_revisions r
set snapshot = jsonb_set(
      r.snapshot,
      '{sections}',
      (
        -- التسمية `sec` لا `s`: الاسمان يتزاحمان مع اسم الجدول فيصير المرجع
        -- ملتبساً، والصمتُ هنا يعني لقطةً لم تُصالَح
        select jsonb_agg(
                 case
                   when ls.id is not null
                    then jsonb_set(e.sec, '{content}', ls.content)
                   else e.sec
                 end
                 order by e.ord
               )
        from jsonb_array_elements(r.snapshot -> 'sections') with ordinality as e(sec, ord)
        left join public.sections ls on ls.id::text = e.sec ->> 'id'
      )
    )
where r.status in ('draft', 'published')
  and jsonb_typeof(r.snapshot -> 'sections') = 'array'
  and exists (
    select 1
    from jsonb_array_elements(r.snapshot -> 'sections') x
    join public.sections s on s.id::text = x ->> 'id'
    where (x -> 'content') is distinct from s.content
  );

-- ============================================================================
-- (٧) الفحص الذاتي — شواهدٌ على ما **يجب أن يبقى** لا على ما أُضيف (‏D-58)
-- ============================================================================

do $$
declare
  v_bad   text;
  v_n     integer;
begin
  -- (٧-١) 🔴 صفر رقمٍ مختلَق عن أنفسنا، وصفر ادّعاءِ ملك
  select string_agg(distinct p.slug || '/' || s.type, ', ') into v_bad
  from public.sections s
  join public.pages p on p.id = s.page_id
  where s.content::text ~ 'أسطولنا|سياراتنا|سائقونا|أساطيل|موظفونا'
     or s.content::text ~ '1923|رحلات مكتملة|سائق محترف|سيارة جاهزة';
  if v_bad is not null then
    raise exception '0095: ادّعاءُ ملكٍ أو رقمٌ مختلَق باقٍ في: %', v_bad;
  end if;

  -- (٧-٢) صفر تفضيلٍ وصفر علامة تعجب في محتوى الزائر
  select string_agg(distinct p.slug || '/' || s.type, ', ') into v_bad
  from public.sections s
  join public.pages p on p.id = s.page_id
  where s.content::text ~ '!|أفضل |الأرخص|الرائد|لا مثيل';
  if v_bad is not null then
    raise exception '0095: تفضيلٌ أو علامة تعجب في: %', v_bad;
  end if;

  -- (٧-٣) صفر نصٍّ نائب، وصفر «اضغط»، وصفر خطأٍ من قائمة الموجز ٤
  select string_agg(distinct p.slug || '/' || s.type, ', ') into v_bad
  from public.sections s
  join public.pages p on p.id = s.page_id
  where s.content::text ~ 'نص عنوان القسم|اضغط|الإنطلاق|فئآت|الأسكندرية';
  if v_bad is not null then
    raise exception '0095: نصٌّ نائب أو خطأٌ إملائي أو «اضغط» في: %', v_bad;
  end if;

  -- (٧-٤) 🔴 الشاهد الحاكم على الحشو: **اسمُ العلامة مرتان كحدٍّ أقصى في نثر
  --       الصفحة الواحدة** (‏عنوانٌ + ذكرٌ في النثر). والقياس على المحتوى كلّه
  --       لا على حقلٍ بعينه، فيمسك أي تكرارٍ يُضاف لاحقاً.
  select string_agg(d.slug || '=' || d.n, ', ') into v_bad
  from (
    select p.slug,
           sum((length(s.content::text) -
                length(replace(s.content::text, 'ايجار ليموزين', ''))) / length('ايجار ليموزين')) as n
    from public.pages p
    join public.sections s on s.page_id = p.id
    group by p.slug
  ) d
  where d.n > 3;
  if v_bad is not null then
    raise exception '0095: تكرارُ اسم العلامة في نثر صفحةٍ واحدة — حشوُ كلماتٍ مفتاحية: %', v_bad;
  end if;

  -- (٧-٥) حدود السيو: العنوان ≤٤٥ (‏القالب يضيف ١٦) والوصف ١٤٠-١٦٠
  select string_agg(p.slug || ':' || length(p.meta ->> 'title'), ', ') into v_bad
  from public.pages p
  where p.published and length(p.meta ->> 'title') > 45;
  if v_bad is not null then
    raise exception '0095: عنوانٌ يتجاوز ٤٥ حرفاً فيُقصّ في النتائج — %', v_bad;
  end if;

  select string_agg(p.slug || ':' || length(p.meta ->> 'description'), ', ') into v_bad
  from public.pages p
  where p.published
    and (length(p.meta ->> 'description') < 140 or length(p.meta ->> 'description') > 160);
  if v_bad is not null then
    raise exception '0095: وصفٌ خارج ١٤٠-١٦٠ حرفاً — %', v_bad;
  end if;

  -- (٧-٦) واسمُ العلامة **لا يدخل** `meta.title` — القالب يضيفه
  select string_agg(p.slug, ', ') into v_bad
  from public.pages p
  where p.meta ->> 'title' like '%ايجار ليموزين%';
  if v_bad is not null then
    raise exception '0095: اسم العلامة في meta.title يتكرّر مع القالب — %', v_bad;
  end if;

  -- (٧-٧) `<h1>` واحدٌ لكل صفحة: كتلةُ ترويسةٍ واحدة، و`hero` للرئيسية وحدها
  select string_agg(p.slug || '=' || d.n, ', ') into v_bad
  from (
    select s.page_id, count(*) as n
    from public.sections s
    where s.type in ('page-hero', 'hero') and s.visible
    group by s.page_id
  ) d
  join public.pages p on p.id = d.page_id
  where d.n <> 1;
  if v_bad is not null then
    raise exception '0095: عددُ عناوين h1 على الصفحة ليس واحداً — %', v_bad;
  end if;

  -- (٧-٨) 🔒 وأرقامُ السياسة كلها في مواضعها — الشاهد على ما لم يُمسّ
  if not exists (select 1 from public.sections s join public.pages p on p.id = s.page_id
                 where p.slug = 'refund-policy' and s.content::text like '%٢٤ ساعة%') then
    raise exception '0095: نافذةُ ٢٤ ساعة غادرت سياسة الاسترداد';
  end if;
  if not exists (select 1 from public.sections s join public.pages p on p.id = s.page_id
                 where p.slug = 'terms' and s.content::text like '%٦٠ دقيقة%') then
    raise exception '0095: مدةُ ٦٠ دقيقة غادرت الشروط';
  end if;
  select count(*) into v_n
  from public.sections s join public.pages p on p.id = s.page_id
  where p.slug in ('terms', 'privacy', 'refund-policy');
  if v_n <> 51 then
    raise exception '0095: أقسامُ الصفحات القانونية % لا ٥١ — بنيتُها لا تُمسّ', v_n;
  end if;

  -- (٧-٩) 🔴 كل كتلةٍ ظاهرة ما زالت تُصيَّر (‏حقلٌ إلزامي حُذف = قسمٌ يختفي)
  select string_agg(p.slug || '/' || s.type, ', ') into v_bad
  from public.sections s
  join public.pages p on p.id = s.page_id
  where s.visible
    and not public.block_renders(s.type, coalesce(s.content, '{}'::jsonb));
  if v_bad is not null then
    raise exception '0095: كتلةٌ ظاهرة لم تعد تُصيَّر بعد التحرير — %', v_bad;
  end if;

  -- (٧-١٠) D-60: صفر لقطةٍ حيّة تخالف صفَّها — النشرة القادمة لا تمحو شيئاً
  select string_agg(r.id::text || '/' || (x ->> 'id'), ', ') into v_bad
  from public.page_revisions r,
       jsonb_array_elements(r.snapshot -> 'sections') x
  join public.sections s on s.id::text = x ->> 'id'
  where r.status in ('draft', 'published')
    and (x -> 'content') is distinct from s.content;
  if v_bad is not null then
    raise exception '0095: لقطةٌ حيّة تخالف صفَّها — أول نشرة تمحو التحرير: %', v_bad;
  end if;

  -- (٧-١١) 🔴 الفهرس — والشاهد الحاكم على أن التحرير لم يُيتّم عنواناً
  --
  -- تغيُّرُ النصّ لا يغيّر مفتاحه: كل ما فعلته الهجرة في `items` أبقى `_k` في
  -- موضعه، فلا مفتاح عنصرٍ يُفقد. **والمفتاح الوحيد المسموح بفقده** هو عنوانُ
  -- النصّ النائب المحذوف في (٤): حقلٌ لم يعد له وجود ⇒ عنوانٌ لم يعد له معنى.
  --
  -- وشرطان يجعلان ذلك آمناً لا احتمالياً: (أ) يُسمّى بعينه لا بنمطه، فأي مفتاحٍ
  -- آخر يسقط يرفع استثناءً؛ (ب) **ولا ترجمة منشورة عليه** — والفحص يقرأ
  -- `translations` نفسها، فلا يُسقط ما راجعه إنسان (‏وهو نفس مذهب D-60: النثر
  -- يُعاد كتابته والعنوان لا).
  select string_agg(a.ns || '/' || a.k, ', ') into v_bad
  from (select ns, k from _corpus_before_95
        except
        select ns, k from public.i18n_corpus_rows()) a
  where not (
    a.ns = 'section'
    and a.k = (
      select s.id::text || '.title'
      from public.sections s
      join public.pages p on p.id = s.page_id
      where p.slug = 'cairo-alexandria' and s.type = 'rich-text'
      limit 1
    )
  );
  if v_bad is not null then
    raise exception '0095: مفتاحُ ترجمةٍ فُقد بالتحرير — %', v_bad;
  end if;

  select string_agg(t.locale || '/' || t.key, ', ') into v_bad
  from public.translations t
  where t.namespace = 'section'
    and t.key = (
      select s.id::text || '.title'
      from public.sections s
      join public.pages p on p.id = s.page_id
      where p.slug = 'cairo-alexandria' and s.type = 'rich-text'
      limit 1
    );
  if v_bad is not null then
    raise exception '0095: النصُّ النائب كان له ترجمةٌ منشورة — لا يُحذف حقلُه: %', v_bad;
  end if;

  raise notice '✔ 0095: صفر رقمٍ مختلَق · صفر ادّعاءِ ملك · h1 واحدٌ لكل صفحة · حدود السيو مضبوطة · اللقطة الحيّة تطابق صفوفها';
end;
$$;
