-- ============================================================================
-- 0128_privacy_discloses_what_actually_happens.sql
-- صفحة الخصوصية تَعِد بأقلّ مما يجري فعلاً — **يُضاف ما نقص، ولا يُحذف بند**.
--
-- ‏`0105` صحّحت بنداً واحداً (ما يصل المتعهد)، و`0111` أطبقت الإنجليزية عليه.
-- ونزلت بعدهما ميزاتٌ لم يلحقها النصّ: قياسُ حضور المتعهد (`0118`)، ووثائقُ
-- السائق وصورُه (`0120`)، والسجلُّ الماليّ والتظلّم (`0113`/`0119`)، وانتهاءُ
-- نقاط الولاء (`0119`). **وهذا الملف يقيس أولاً ثم يكتب.**
--
-- ══════════════════════════════════════════════════════════════════════════
--  الجرد المقيس — «يجري فعلاً» × «يقوله النصّ» × «الفجوة»
-- ══════════════════════════════════════════════════════════════════════════
--
-- الجرد الأول (‏ما يقوله النصّ) قُرئ من `sections` لصفحة `privacy`
-- (`f087ec55-de32-4346-9449-5e97447cc14a`، منشورة، ١٦ قسماً بسورت ٠…١٥).
-- والجرد الثاني (‏ما يُجمَع) من `information_schema.columns` و`pg_class`
-- و`pg_get_functiondef` — **الكتالوج الحيّ لا ملفُّ هجرة** (D-58).
--
--  | يجري فعلاً (مقيس) | يقوله النصّ اليوم | الفجوة |
--  |---|---|---|
--  | `partner_presence(subcontractor_id, last_seen_at)` — نبضةٌ كل دقيقة على الأكثر (`touch_partner_presence`)، و«متصلٌ الآن» = آخر ظهورٍ خلال ٥ دقائق (`admin_partner_presence`) | **لا شيء عن المتعهدين إطلاقاً** | 🔴 كاملة |
--  | `subcontractor_drivers`: الاسم · الهاتف · `photo_path` · `license_no` · `license_photo_path` · `license_expiry` · `license_verified_by/at` · `docs_purged_at`؛ الصور في دلو `driver-docs` **الخاص** (`public=false`)، وتُحذف بعد **٥ سنوات** من `subcontractors.relationship_ended_at` (`driver_documents_due_for_purge`) بكنسٍ حيّ كل ٥ دقائق (`vercel.json` ⇐ `/api/dispatch/tick` ⇐ `runDriverDocumentPurge`) | لا شيء | 🔴 كاملة |
--  | سجلٌّ ماليٌّ عن المتعهد: `ledger_entries` · `booking_failures(reason_label, deduct_amount, created_by, payout_snapshot)` · `trip_withdrawals` · `trip_completion_requests` · `partner_settlements` · `partner_payouts` · `partner_grievances(body, resolved_by, resolution_note)` | لا شيء | 🔴 كاملة |
--  | `loyalty_accounts.phone_norm` + `loyalty_entries`: الرصيد مربوطٌ بهاتف العميل المُطبَّع، وبه يُفرض `max_uses_per_phone` كذلك | لا شيء | 🔴 كاملة — **وتُكتب هنا البيانات وحدها**: شروطُ البرنامج كتبتها `0125` في `/terms` (بند ١١، مرساة `loyalty`)، فيُشار إليها ولا تُكرَّر (القاعدة ١٢) |
--  | `bookings.phone_norm` هويةُ العميل: به تُجمع حجوزاته وولاؤه، و`redeem_coupon` تعدّ به `max_uses_per_phone` على `coupon_redemptions.phone` | «اسمك ورقم هاتفك» وحدها | 🟠 جزئية |
--  | `funnel_events` (١٧٢ صفاً): الحدث ووقته والفئة والقيمة، **بلا اسمٍ ولا هاتفٍ ولا IP** — ومعه `reference`؛ و**٢٧ صفاً منها تنضمّ فعلاً إلى `bookings` بالمرجع** ⇒ قابلةٌ للربط بشخصٍ من عندنا | «إحصاءات مجمَّعة» عن **أدواتٍ خارجية** فقط | 🔴 السجل الداخلي غير مذكور |
--  | `geocode_cache(query_key)` = **نصّ البحث كما كُتب** (قِيس: «مطار القاهرنة»)، كاشٌ **دائم بلا مدة حذف** | لا شيء | 🟠 (وعيبٌ مرفوع أدناه) |
--  | `booking_route_maps` — صورةٌ لكل حجزٍ مؤكَّد في دلو `maps` الخاص، `provider='google'`، `geometry_source='osrm'` ⇒ الإحداثيات تصل `router.project-osrm.org` (`lib/maps/static-map.ts:49`) وخرائط جوجل | «خدمات الخرائط لحساب المسافات» | 🟠 جزئية |
--  | `audit_log` — ‏٢٢٬٩٣٦ صفاً على `bookings`، **٧٬٨٣٨ منها تحمل `customer_phone` في اللقطة**؛ و`prune_audit_log` **يدويّةٌ لا مجدولة** بأرضية ٣٦٥ يوماً | لا شيء | 🟠 |
--  | `booking_lookup_attempts` — نوافذ ١٥ دقيقة ببصمةٍ مجهولة، وتُكنس بعد ساعة (`find_booking_by_reference`) | «لا نخزّن IP في سجل حجزك» ✅ | ✅ صامد، ويُفصَّل |
--  | تليجرام قناةٌ حيّة (`notification_providers.telegram.ready = true`؛ ٢٧ رسالة)، والدفع بالمتصفح جاهز (`webpush.ready = true`) | «قنوات إرسال الإشعارات» بلا تسمية | 🟠 |
--  | مزوّدو الدفع **السبعة مطفأون**، و`payment_events` صفر | «صورة إيصال التحويل» | ✅ متطابق — **فلا يُكتب عنهم شيء** |
--  | `site_settings.integrations`: ga4/gtm/gsc/bing/clarity/metaPixel/metaCapi **كلها `enabled=false` و`id=null`** | «**وقد** نستخدم أدوات قياس» (شرطية) | ✅ متطابق — لا يُكتب |
--
-- ⇒ **ما لا يُكتب هنا مقصودٌ كما ما يُكتب**: بندٌ يصف مزوّد دفعٍ مطفأً أو أداةَ
--   تحليلٍ بلا معرّف هو بعينه «وعدٌ بما لا نفعل» في اتجاهه المعكوس.
--
-- ══════════════════════════════════════════════════════════════════════════
--  ما يفعله هذا الملف بالضبط
-- ══════════════════════════════════════════════════════════════════════════
--
--   | الجدول | الفعل |
--   |---|---|
--   | `public.sections` | **إضافةُ ٥ أقسام** بسورت ١٦…٢٠ — ولا صفَّ قائمٌ يُلمس |
--   | `public.page_revisions` | مصالحةُ اللقطات **الحيّة** وحدها (D-60). والمؤرشفة **لا تُلمس** |
--   | `public.translations` | **٤٣ صفَّ `en` بحالة `draft`** — ولا صفَّ منشورٌ يتحرّك |
--   | كلُّ ما عداه | لا يُلمس |
--
-- 🔴 **ولا بندَ قائمٌ يُحذف ولا يُعدَّل**: البنود الجديدة **تُذيَّل** (١٠ · ١١ · ١٢)
--   فيبقى الترقيم متصلاً بلا إعادة ترقيمٍ تُبطل ترجمةً منشورة. **وثمنُه معلَن**:
--   بند «تحديث السياسة» (٩) لم يعد آخر بندٍ في الصفحة — وإعادةُ ترتيبه قرارُ
--   المالك بضغطتين في `/admin/content`، لا قرارُ هجرة.
--
-- ══════════════════════════════════════════════════════════════════════════
--  D-60 — مَن كتب في `sections` صالح اللقطات الحيّة معها
-- ══════════════════════════════════════════════════════════════════════════
--
-- قِيس: `page_revisions` تحمل ١٥ صفاً **كلَّها لصفحة الرئيسية**
-- (`94f4e9a0-…`: ١ `published` + ١٤ `archived`)، و**صفر صفٍّ لصفحة `privacy`**.
-- فالقسم (٥) لا يجد اليوم ما يصالحه — **ويبقى مكتوباً** لأن غيابَ لقطةٍ حالةُ
-- اليوم لا قاعدةُ الغد، ولأن أقساماً **جديدة** غائبةً عن لقطةٍ حيّة تُمحى عند
-- أول `publish_page_revision`. **والمؤرشفة لا تُلمس**: إعادةُ كتابة الماضي
-- تكذب على من يقرأ السجل.
--
-- ══════════════════════════════════════════════════════════════════════════
--  اللغة — العربية تُنشر، والإنجليزية **مسوّدة** في الطابور
-- ══════════════════════════════════════════════════════════════════════════
--
-- الأقسام الخمسة تولّد **٤٣ مفتاحاً** جديداً في `i18n_corpus_rows()`. وتُكتب
-- لها ٤٣ صفَّ `en` بحالة **`draft`** — لا `published` ولا `reviewed`:
--
--   · `translations` مغلقةٌ أمام القارئ العام، و`lib/i18n/content.ts:175`
--     يقرأ **`status = 'published'` وحده** ⇒ **المسوّدة لا تُصيَّر إطلاقاً**،
--     و`/en/privacy` يعرض العربية للبنود الجديدة حتى يعتمدها المالك.
--   · وعدد `published` لِـ`en` **لا يتحرّك** (‏٨٨٣ ⇐ ٨٨٣) — مبرهَنٌ في (٦-د).
--   · والطريق أمامه: `/admin/languages/en` ← مرشّح **«مسودة»** ⇒ يراجع ويضغط
--     «اعتمد وانشر» (`review_translation(id, value, true)`).
--
-- ⚠ **ولا تُنشر لغةٌ من هجرة** — قاعدةٌ قائمة، وهذا الملف يلتزمها حرفاً.
--
-- ⏰ **وموعدُه قبل رفع `noindex` لا بعده**: النافذة مغلقةٌ اليوم
--    (`seo.robots.indexable = false`)، ورفعُها يفهرس النصّ كما هو.
--
-- ══════════════════════════════════════════════════════════════════════════
--  🔴 عيبٌ يُرفع للمالك ولا يُعالَج هنا — الإفصاحُ ليس ترخيصاً
-- ══════════════════════════════════════════════════════════════════════════
--
-- `geocode_cache` يحفظ **نصّ بحث الزائر كما كتبه** (‏مقيسٌ حياً: «مطار القاهرنة»
-- · «alexandria» · «?????») **بلا أيّ مدة حذف** — لا `prune` ولا مهمةٌ مجدولة،
-- خلافاً لأخويه `prune_funnel_events` و`prune_audit_log`. ونصُّ بحثٍ عن مكانٍ
-- قد يكون عنوانَ بيتٍ كتبه زائرٌ لم يحجز قط. **والنصّ أدناه يقولها كما هي**
-- («وليست له اليوم مدة حذف محددة») لأن وصفَ الواقع أصدقُ من وعدٍ لا نفي به —
-- **والعلاج قرارُ المالك**: مهمةُ كنسٍ دورية أو الاكتفاء بالإحداثيات مفتاحاً.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (١) الثوابت — الصفحة، والأقسام الخمسة بمعرّفاتها الثابتة
-- ----------------------------------------------------------------------------
create temporary table _priv_128 on commit drop as
select
  'f087ec55-de32-4346-9449-5e97447cc14a'::uuid as page_id,
  'privacy'::text                              as page_slug,
  -- الأقسام الأربعة المعروفة سلفاً — وجودُها يثبت أننا على الصفحة الصحيحة
  'b0000000-0000-4000-8000-000000003301'::uuid as sec_collect,   -- جدول فئات البيانات
  'b0000000-0000-4000-8000-000000003303'::uuid as sec_who,       -- جدول من يطّلع (0105)
  'b0000000-0000-4000-8000-000000003305'::uuid as sec_keep,      -- جدول مدد الاحتفاظ
  -- الأقسام الخمسة الجديدة
  'b0000000-0000-4000-8000-000000003310'::uuid as s1,            -- بند ١٠: الولاء
  'b0000000-0000-4000-8000-000000003311'::uuid as s2,            -- بند ١١: سجلاتنا
  'b0000000-0000-4000-8000-000000003312'::uuid as s3,            -- جدول السجلات
  'b0000000-0000-4000-8000-000000003313'::uuid as s4,            -- بند ١٢: المتعهدون
  'b0000000-0000-4000-8000-000000003314'::uuid as s5;            -- جدول المتعهدين

-- ⚠ **قابليةُ إعادة التنفيذ مقيسةٌ لا مفترَضة**: الملف قد يُعاد على قاعدةٍ نصف
--   مهاجَرة وعلى نسخة Whitelabel جديدة. فكلُّ توقّعٍ أدناه يُكتب **حالةً نهائية**
--   لا فارقاً: نطرح ما كان قائماً سلفاً من الأقسام الخمسة ومفاتيحها ومسوّداتها،
--   فيصحّ الفحص في التشغيل الأول وفي العاشر بلا فرق.
create temporary table _new_ids_128 on commit drop as
select p.s1 as id from _priv_128 p
union all select p.s2 from _priv_128 p
union all select p.s3 from _priv_128 p
union all select p.s4 from _priv_128 p
union all select p.s5 from _priv_128 p;

create temporary table _base_128 on commit drop as
select
  (select count(*) from public.i18n_corpus_rows())                          as corpus_before,
  (select count(*) from public.sections s
     where s.id in (select id from _new_ids_128))                           as new_secs_before,
  (select count(*) from public.i18n_corpus_rows() c
     where c.ns = 'section'
       and split_part(c.k, '.', 1) in (select id::text from _new_ids_128))  as new_keys_before,
  (select count(*) from public.translations tr
     where tr.locale = 'en' and tr.namespace = 'section'
       and split_part(tr.key, '.', 1) in (select id::text from _new_ids_128)) as new_tr_before,
  (select count(*) from public.translations
     where locale = 'en' and status = 'published')                          as en_pub_before,
  (select count(*) from public.translations
     where locale = 'en' and status = 'draft')                              as en_draft_before,
  (select count(*) from public.translations where locale = 'en')            as en_rows_before,
  (select count(*) from public.sections
     where page_id = (select page_id from _priv_128))                       as secs_before,
  (select coalesce(max(sort), -1) from public.sections
     where page_id = (select page_id from _priv_128))                       as max_sort_before,
  (select count(*) from public.page_revisions
     where page_id = (select page_id from _priv_128)
       and status in ('draft', 'published'))                                as live_snaps,
  (select count(*) from public.page_revisions
     where page_id = (select page_id from _priv_128)
       and status = 'archived')                                             as archived_snaps,
  (select md5(coalesce(string_agg(
              r.id::text || ':' || r.status || ':' || md5(r.snapshot::text), '|' order by r.id), ''))
     from public.page_revisions r where r.status = 'archived')              as archived_md5_before;

-- ----------------------------------------------------------------------------
-- (٢) الحواجز — تُقاس **قبل** أيّ كتابة في محتوى المالك
--
--     كلُّ فحصٍ هنا يحرس **جملةً بعينها** في النصّ الجديد. فما يصفه النصّ إن
--     لم يكن قائماً في المخطَّط، صار البند وعداً بما لا نفعل — وهو أسوأ من
--     غيابه (بريف الجبهة ٣٤).
-- ----------------------------------------------------------------------------
do $g128$
declare
  p        record;
  b        record;
  v_bad    text;
  v_def    text;
begin
  select * into p from _priv_128;
  select * into b from _base_128;

  -- (٢-١) الصفحة قائمةٌ ومنشورة — وإلا فما نكتبه لا يقرؤه أحد
  if not exists (
    select 1 from public.pages pg
    where pg.id = p.page_id and pg.slug = p.page_slug and pg.published
  ) then
    raise exception '0128: صفحة privacy غير موجودة أو غير منشورة (%)', p.page_id;
  end if;

  -- (٢-٢) الأقسام الثلاثة المعروفة قائمةٌ ومرئية — بصمةُ أننا على الصفحة المقيسة
  select string_agg(x.id::text, '، ') into v_bad
  from (values (p.sec_collect), (p.sec_who), (p.sec_keep)) x(id)
  where not exists (
    select 1 from public.sections s
    where s.id = x.id and s.page_id = p.page_id and s.visible);
  if v_bad is not null then
    raise exception '0128: 🔴 أقسامٌ مرجعيةٌ مفقودةٌ أو مخفية — الصفحة ليست ما قِيس: %', v_bad;
  end if;

  -- (٢-٣) 🔴 ما يصفه بند ١٢ عن السائقين قائمٌ في المخطَّط
  select string_agg(x.col, '، ') into v_bad
  from (values
    ('subcontractor_drivers.photo_path'),
    ('subcontractor_drivers.license_no'),
    ('subcontractor_drivers.license_photo_path'),
    ('subcontractor_drivers.license_expiry'),
    ('subcontractor_drivers.license_verified_by'),
    ('subcontractors.relationship_ended_at')) x(col)
  where not exists (
    select 1 from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name  = split_part(x.col, '.', 1)
      and c.column_name = split_part(x.col, '.', 2));
  if v_bad is not null then
    raise exception '0128: 🔴 أعمدةُ وثائق السائق غير قائمة — النصّ يصف ما لا يوجد: %', v_bad;
  end if;

  -- (٢-٤) 🔴 والدلوان خاصّان فعلاً — النصّ يقول «مساحة تخزين خاصة»
  select string_agg(x.b, '، ') into v_bad
  from (values ('driver-docs'), ('maps')) x(b)
  where not exists (select 1 from storage.buckets k where k.id = x.b and k.public = false);
  if v_bad is not null then
    raise exception '0128: 🔴 دلوٌ ليس خاصاً (أو غير موجود) — %', v_bad;
  end if;

  -- (٢-٥) 🔴 مدةُ حفظ الصور خمسُ سنوات فعلاً — تُقرأ من جسم الدالة الحيّ (D-58)
  v_def := pg_get_functiondef('public.driver_documents_due_for_purge(integer)'::regprocedure);
  if position($$interval '5 years'$$ in v_def) = 0 then
    raise exception '0128: 🔴 دالةُ الكنس لم تعد تقول ٥ سنوات — النصّ يَعِد بمدةٍ غير قائمة';
  end if;
  if position('relationship_ended_at' in v_def) = 0 then
    raise exception '0128: 🔴 مرسى المدة لم يعد انتهاءَ العلاقة — أعد صياغة البند';
  end if;

  -- (٢-٦) 🔴 نبضةُ الحضور قائمة، ودقيقةٌ واحدة سقفُ التحديث كما يقول النصّ
  if to_regclass('public.partner_presence') is null then
    raise exception '0128: 🔴 partner_presence غير موجود — بند الحضور يصف ما لا يقع';
  end if;
  v_def := pg_get_functiondef('public.touch_partner_presence()'::regprocedure);
  if position($$interval '1 minute'$$ in v_def) = 0 then
    raise exception '0128: 🔴 سقفُ النبضة لم يعد دقيقة — النصّ يقول «مرة كل دقيقة على الأكثر»';
  end if;

  -- (٢-٧) 🔴 «متصلٌ الآن» = خمسُ دقائق، وتُعرض للإدارة وحدها
  v_def := pg_get_functiondef('public.admin_partner_presence()'::regprocedure);
  if position($$interval '5 minutes'$$ in v_def) = 0
     or position('public.is_admin()' in v_def) = 0 then
    raise exception '0128: 🔴 شرطُ «متصل الآن» أو حصرُه بالإدارة تغيّر — أعد صياغة البند';
  end if;

  -- (٢-٨) 🔴 السجلّ الماليّ والتظلّم قائمان
  select string_agg(x.t, '، ') into v_bad
  from (values
    ('public.booking_failures'), ('public.trip_withdrawals'),
    ('public.partner_grievances'), ('public.trip_completion_requests'),
    ('public.partner_settlements'), ('public.partner_payouts'),
    ('public.ledger_entries')) x(t)
  where to_regclass(x.t) is null;
  if v_bad is not null then
    raise exception '0128: 🔴 جداولُ السجل الماليّ للمتعهد مفقودة — %', v_bad;
  end if;

  -- (٢-٩) 🔴 بندُ الولاء **يشير** إلى شروط البرنامج ولا يكرّرها (‏`0125` كتبتها
  --        في «الشروط والأحكام»). فالإشارةُ تُقاس: بندٌ منشورٌ قائمٌ يُشار إليه،
  --        لا وعدٌ بصفحةٍ لا توجد. **والقاعدة الذهبية ١٢: لا يُستنسخ القائم.**
  if not exists (
    select 1
    from public.sections s
    join public.pages pg on pg.id = s.page_id
    where pg.slug = 'terms' and pg.published
      and s.visible and s.type = 'clause'
      and s.content ->> 'anchor' = 'loyalty'
  ) then
    raise exception
      '0128: 🔴 بند «نقاط الولاء واستبدالها» غير منشور في /terms — لا يُشار إلى ما لا يوجد (طبّق 0125 أولاً)';
  end if;
  -- ورصيدُ النقاط مربوطٌ بالهاتف المُطبَّع فعلاً — وهي الحقيقة التي يقولها بند ١٠
  if not exists (
    select 1 from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = 'loyalty_accounts'
      and c.column_name = 'phone_norm'
  ) then
    raise exception '0128: 🔴 loyalty_accounts.phone_norm غير قائم — بند ١٠ يصف ما لا يوجد';
  end if;

  -- (٢-١٠) 🔴 سقفُ الكوبون لكل رقمٍ مفروضٌ فعلاً على الهاتف المُطبَّع
  v_def := pg_get_functiondef('public.redeem_coupon(text,uuid,numeric,text)'::regprocedure);
  if position('max_uses_per_phone' in v_def) = 0
     or position('coupon_redemptions' in v_def) = 0 then
    raise exception '0128: 🔴 سقفُ الكوبون لكل هاتف لم يعد مفروضاً — النصّ يصف ما لا يقع';
  end if;

  -- (٢-١١) 🔴 عدّادُ المتابعة: ربعُ ساعةٍ نافذةً وساعةٌ كنساً
  v_def := pg_get_functiondef('public.find_booking_by_reference(text,text,text)'::regprocedure);
  if position($$interval '15 minutes'$$ in v_def) = 0
     or position($$interval '1 hour'$$ in v_def) = 0 then
    raise exception '0128: 🔴 نافذةُ العدّاد أو مدةُ كنسه تغيّرت — النصّ يذكر ١٥ دقيقة وساعة';
  end if;

  -- (٢-١٢) 🔴 سجلُّ التدقيق وأرضيةُ تقليمه سنة
  if to_regclass('public.audit_log') is null then
    raise exception '0128: 🔴 audit_log غير موجود — بند سجل التدقيق يصف ما لا يوجد';
  end if;
  v_def := pg_get_functiondef('public.prune_audit_log(integer)'::regprocedure);
  if position('365' in v_def) = 0 then
    raise exception '0128: 🔴 أرضيةُ التقليم لم تعد ٣٦٥ يوماً — النصّ يقول «سنةً على الأقل»';
  end if;

  -- (٢-١٣) 🔴 السجلات الأخرى قائمة
  select string_agg(x.t, '، ') into v_bad
  from (values
    ('public.funnel_events'), ('public.geocode_cache'),
    ('public.booking_route_maps'), ('public.booking_lookup_attempts'),
    ('public.partner_push_subscriptions'), ('public.partner_agreement_acceptances'),
    ('public.loyalty_entries'), ('public.loyalty_accounts')) x(t)
  where to_regclass(x.t) is null;
  if v_bad is not null then
    raise exception '0128: 🔴 جداولٌ يصفها النصّ غير موجودة — %', v_bad;
  end if;

  -- (٢-١٤) 🔴 والقناتان اللتان يسمّيهما البند حيّتان — لا يُسمّى مطفأ
  if not exists (
    select 1 from public.notification_providers np
    where np.channel = 'telegram' and np.ready
  ) then
    raise exception '0128: 🔴 قناةُ تليجرام ليست جاهزة — لا تُسمّى قناةً عاملة في نصٍّ منشور';
  end if;

  -- (٢-١٥) 🔴 والاتجاه المعكوس: مزوّدو الدفع مطفأون، فلا بندَ عنهم — لو اشتعل
  --         واحدٌ منهم لصار غيابُ البند فجوةً جديدة، فيُمسك هنا لا في المراجعة.
  if exists (select 1 from public.payment_providers pp where pp.enabled) then
    raise exception
      '0128: 🔴 مزوّدُ دفعٍ صار مشتعلاً — الخصوصية لا تصفه بعد. أضِف بنداً في هجرةٍ جديدة قبل التطبيق';
  end if;

  -- (٢-١٦) الأقسام الجديدة لم تُكتب بيدٍ بمحتوىً آخر — نكتشفه ولا نكتب فوقه
  select string_agg(x.id::text, '، ') into v_bad
  from (values (p.s1), (p.s2), (p.s3), (p.s4), (p.s5)) x(id)
  where exists (
    select 1 from public.sections s where s.id = x.id and s.page_id <> p.page_id);
  if v_bad is not null then
    raise exception '0128: 🔴 معرّفُ قسمٍ مستعمَلٌ في صفحةٍ أخرى — %', v_bad;
  end if;

  raise notice
    '  ← قبل: أقسامُ الخصوصية % (أقصى سورت %) · الفهرس % · en منشور % · en مسودة % · لقطاتٌ حيّة % · مؤرشفة %',
    b.secs_before, b.max_sort_before, b.corpus_before,
    b.en_pub_before, b.en_draft_before, b.live_snaps, b.archived_snaps;
end;
$g128$;

-- ----------------------------------------------------------------------------
-- (٣) الأقسام الخمسة — **إضافةٌ محضة**. و`on conflict do nothing` تجعل الملف
--     قابلاً لإعادة التنفيذ بلا أن يمحو تحريراً لاحقاً للمالك.
-- ----------------------------------------------------------------------------

-- (٣-أ) بند ١٠ — نقاط الولاء ورقم الهاتف
insert into public.sections (id, page_id, type, content, sort, visible)
select p.s1, p.page_id, 'clause', $j1$
{
  "num": "١٠",
  "anchor": "loyalty-data",
  "title": "نقاط الولاء ورقم هاتفك",
  "body": "رصيد نقاطك لا يُحفظ باسمك بل برقم هاتفك بعد تطبيعه إلى صورة موحدة. وهذا الرقم هو ما نطابق به حجوزاتك بعضها ببعض: به يجتمع رصيدك من رحلات متفرقة في مكان واحد، وبه نحسب كم مرة استُخدم كوبون خصم من الرقم نفسه. فحجزٌ برقم آخر يبدأ رصيداً منفصلاً ولا يُضاف إلى الأول.\n\nونحفظ لكل حركة نقاط تاريخها واتجاهها والرحلة التي جاءت منها، ويُقيَّد انتهاء النقطة قيداً مثلها بتاريخه ومقداره. ودفتر النقاط مُلحَق لا يُحذف منه: تصحيح الخطأ قيدٌ عاكس يبقى ظاهراً بجوار أصله، لا محوٌ للأول.\n\nوهذه الصفحة تصف بيانات البرنامج لا شروطه؛ أما كيف تُحتسب النقطة وكيف تُستبدل ومتى تنتهي فبند «نقاط الولاء واستبدالها» في الشروط والأحكام.",
  "style": { "_v": 1 }
}
$j1$::jsonb, 16, true
from _priv_128 p
on conflict (id) do nothing;

-- (٣-ب) بند ١١ — ما تسجّله أنظمتنا
insert into public.sections (id, page_id, type, content, sort, visible)
select p.s2, p.page_id, 'clause', $j2$
{
  "num": "١١",
  "anchor": "our-logs",
  "title": "ما تسجّله أنظمتنا من استعمالك للموقع",
  "body": "إلى جانب ما تكتبه بنفسك في نماذج الحجز وطلب عرض السعر، تنشأ من استعمال الموقع سجلات تكتبها أنظمتنا. وهي مبيَّنة في الجدول التالي بما تحفظه وما لا تحفظه وكم تبقى.",
  "style": { "_v": 1 }
}
$j2$::jsonb, 17, true
from _priv_128 p
on conflict (id) do nothing;

-- (٣-ج) جدول السجلات الداخلية
insert into public.sections (id, page_id, type, content, sort, visible)
select p.s3, p.page_id, 'table', $j3$
{
  "title": "السجلات التي تنشأ من الاستعمال",
  "h1": "السجل",
  "h2": "ما يُحفظ فيه، وكم يبقى",
  "note": "وما ورد في هذا الجدول سجلات داخلية لتشغيل الخدمة وقياسها، لا تُباع ولا تُشارَك مع أي طرف لأغراض تسويقية — كما في البند الرابع.",
  "items": [
    {
      "_k": "pvl001",
      "c1": "خطوات مسارك على الموقع",
      "c2": "نسجّل في قاعدتنا الخطوة ووقتها: بحثٌ عن سعر، ومعاينة عرض، وبدء حجز، وحجزٌ تمّ، ودفعٌ تمّ — ومعها فئة السيارة وقيمة الحجز. ولا يُحفظ في هذا السجل اسمك ولا رقم هاتفك ولا عنوان شبكتك. لكنه يحمل مرجع الحجز أو الطلب متى كان قد نشأ، ومن المرجع يمكننا نحن ربط الخطوة بحجزك."
    },
    {
      "_k": "pvl002",
      "c1": "ما تكتبه في خانة البحث عن مكان",
      "c2": "يُحفظ نص بحثك مع نتائجه في ذاكرة مشتركة تُسرّع البحث التالي لأي زائر، فلا نسأل خدمة الخرائط عن السؤال نفسه مرتين. ولا يُحفظ معه من كتبه، ولا يُربط بحجزك ولا بجهازك. وليست له اليوم مدة حذف محددة."
    },
    {
      "_k": "pvl003",
      "c1": "صورة خريطة مسار رحلتك",
      "c2": "تُولَّد صورة واحدة لمسار كل حجز مؤكد وتُحفظ في مساحة تخزين خاصة غير متاحة للعامة، وتُعرض لك في صفحة متابعة حجزك. ولرسمها تصل إحداثيات نقطتي الانطلاق والوجهة إلى خدمة توجيه مفتوحة وإلى خدمة خرائط جوجل — بلا اسمك وبلا رقم هاتفك."
    },
    {
      "_k": "pvl004",
      "c1": "سجل التدقيق الداخلي",
      "c2": "كل تغيير يقع على حجزك يُقيَّد بمن أجراه ووقته وما تغيّر، ومع القيد صورة من صف الحجز وقتها تشمل اسمك ورقم هاتفك. والسجل لا يُعدَّل ولا يُحذف منه إلا بتقليم إداري يُبقي سنةً على الأقل. وهو سجل داخلي لا يظهر لك ولا للمتعهد."
    },
    {
      "_k": "pvl005",
      "c1": "عدّاد محاولات فتح صفحة المتابعة",
      "c2": "حين تفتح «تابع حجزك» نَعُدّ المحاولات في نوافذ من ربع ساعة لمنع تخمين المراجع، ببصمة مجهولة تحسبها خوادمنا ولا تحمل عنوان شبكتك. وتُكنس صفوف العدّاد بعد ساعة."
    },
    {
      "_k": "pvl006",
      "c1": "قنوات تنبيه فريقنا والمتعهد",
      "c2": "تنبيهات الحجوزات تصل فريقنا عبر تليجرام، ويصل المتعهدَ عرضُ الرحلة على تليجرام أو بإشعار في متصفحه إن فعّله. فتمرّ رسالة التنبيه بخوادم مزوّد القناة. ولا يُرسَل في أي منها إيصال التحويل."
    }
  ],
  "style": { "_v": 1 }
}
$j3$::jsonb, 18, true
from _priv_128 p
on conflict (id) do nothing;

-- (٣-د) بند ١٢ — بيانات المتعهدين وسائقيهم
insert into public.sections (id, page_id, type, content, sort, visible)
select p.s4, p.page_id, 'clause', $j4$
{
  "num": "١٢",
  "anchor": "partner-data",
  "title": "بيانات المتعهدين وسائقيهم",
  "body": "تسري هذه السياسة كذلك على المتعهدين المعتمدين الذين ينفّذون الرحلات، وعلى السائقين والمركبات التي يعلنها كل منهم في بوابته. وما نحفظه عنهم مبيَّن في الجدول التالي.\n\nوما يصل العميل من هذا كله محدود: تعرض له صفحة متابعة حجزه اسم السائق ورقم هاتفه وبيانات المركبة ولوحتها قبل موعد التحرك — ولا تصله صورة السائق ولا صورة رخصته ولا شيء من السجل المالي.",
  "style": { "_v": 1 }
}
$j4$::jsonb, 19, true
from _priv_128 p
on conflict (id) do nothing;

-- (٣-هـ) جدول بيانات المتعهدين
insert into public.sections (id, page_id, type, content, sort, visible)
select p.s5, p.page_id, 'table', $j5$
{
  "title": "ما نحفظه عن المتعهد وسائقيه ومركباته",
  "h1": "الفئة",
  "h2": "ما تشمله، وكم تبقى",
  "note": "والمتعهد يدير سائقيه ومركباته من بوابته: يضيف ويعدّل ويوقف.",
  "items": [
    {
      "_k": "pvp001",
      "c1": "المتعهد نفسه",
      "c2": "اسم الشركة واسم المسؤول وهاتفه وواتسابه وبريده وحساباته على مواقع التواصل إن أدخلها، وحالة اعتماده وملاحظاتنا الداخلية عنه، ومعرّف محادثته على تليجرام إن ربط بوابته بالبوت."
    },
    {
      "_k": "pvp002",
      "c1": "حضوره في بوابته",
      "c2": "نسجّل وقت آخر طلب موثَّق وصل منه، بنبضة تُحدَّث مرة كل دقيقة على الأكثر، فتظهر لإدارتنا وحدها حالته: متصل الآن، أو آخر ظهور له. ولا يُسجَّل في النبضة ما فتحه ولا ما فعله، ولا يُحفظ لها تاريخ متراكم — صفٌّ واحد يُكتب فوقه."
    },
    {
      "_k": "pvp003",
      "c1": "سائقوه",
      "c2": "الاسم والهاتف ورقم الرخصة وتاريخ انتهائها وصورة السائق وصورة الرخصة، ومن وثّق الرخصة من إدارتنا ومتى. والصورتان في مساحة تخزين خاصة لا تُفتح برابط عام: يراهما المتعهد صاحبهما وإدارتنا فقط، ولا تصلان العميل. وتُحذفان بعد خمس سنوات من انتهاء علاقتنا بالمتعهد، ويبقى بعدهما الاسم ورقم الرخصة وتاريخها في السجل النصّي."
    },
    {
      "_k": "pvp004",
      "c1": "مركباته",
      "c2": "الفئة والوصف واللوحة وسنة الصنع واللون وعدد المقاعد وصورة المركبة."
    },
    {
      "_k": "pvp005",
      "c1": "سجله المالي",
      "c2": "مستحقّه عن كل رحلة، وما خُصم منه إن وقع خصم: سببه كما سُجّل يومها ومبلغه ومن سجّله ومتى، واعتذاره عن رحلة كان قد قبلها وما قاله فيه، وطلبه إتمام الرحلة وقرارنا فيه، والتسويات والمدفوعات بيننا. وهذه القيود مُلحَقة لا تُحذف؛ والتصحيح قيدٌ عاكس."
    },
    {
      "_k": "pvp006",
      "c1": "تظلّمه",
      "c2": "نص التظلّم الذي يقدّمه على خصم أو تصنيف أو تسوية، ووقت تقديمه، ومن فصل فيه وبم ومتى."
    },
    {
      "_k": "pvp007",
      "c1": "توقيعه واشتراك إشعاراته",
      "c2": "الاسم الذي وقّع به اتفاقية الشراكة ووقت التوقيع ورقم النسخة وبصمتها ومن سجّل التوقيع. وإن فعّل إشعارات المتصفح حفظنا عنوان اشتراك جهازه ومفتاحيه ونوع متصفحه — ولا يخرج عنوان الاشتراك إلى أي واجهة."
    }
  ],
  "style": { "_v": 1 }
}
$j5$::jsonb, 20, true
from _priv_128 p
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- (٤) 🔒 D-60 — اللقطات **الحيّة** تُصالَح، والمؤرشفة لا تُلمس.
--
--     قسمٌ جديد غائبٌ عن لقطةٍ حيّة يُمحى عند أول `publish_page_revision`.
--     صفر لقطةٍ حيّة لهذه الصفحة اليوم (قِيس في ٢) — والكتلة تبقى لأن الغياب
--     حالةُ اليوم لا قاعدةُ الغد.
-- ----------------------------------------------------------------------------
update public.page_revisions r
set snapshot = jsonb_set(
      r.snapshot,
      '{sections}',
      (r.snapshot -> 'sections') || (
        select coalesce(jsonb_agg(to_jsonb(s.*) order by s.sort), '[]'::jsonb)
        from public.sections s
        where s.page_id = (select page_id from _priv_128)
          and s.id in (select id from _new_ids_128)
          and not exists (
            select 1 from jsonb_array_elements(r.snapshot -> 'sections') e
            where e ->> 'id' = s.id::text)))
where r.page_id = (select page_id from _priv_128)
  and r.status in ('draft', 'published')
  and jsonb_typeof(r.snapshot -> 'sections') = 'array';

-- ----------------------------------------------------------------------------
-- (٥) الإنجليزية — **مسوّدةٌ لا منشورة**. ٤٣ مفتاحاً، كلٌّ بأصله العربي الحيّ.
--
--     الأصل يُقرأ من `i18n_corpus_rows()` نفسها لا من نصٍّ منسوخ، فلا ينحرف
--     `source_hash` عن الصفحة بحرفٍ واحد (وهو ما يجعل الصفَّ «قديماً» زوراً).
-- ----------------------------------------------------------------------------
create temporary table _en_128 (k text primary key, v text) on commit drop;

insert into _en_128 (k, v) values
  ('3310.title', 'Loyalty points and your phone number'),
  ('3310.num',   '10'),
  ('3310.body',  E'Your points balance is not stored under your name but under your phone number after it has been normalised to a single form. That number is what we use to match your bookings to one another: through it your balance from separate trips gathers in one place, and through it we count how many times a discount coupon has been used from the same number. A booking made with a different number starts a separate balance and is not added to the first.\n\nFor every points movement we keep its date, its direction and the trip it came from, and the expiry of a point is recorded as an entry like any other, with its date and its amount. The points ledger is append-only and nothing is deleted from it: correcting a mistake is a reversing entry that stays visible next to its original, not an erasure of it.\n\nThis page describes the programme''s data, not its terms; how a point is earned, how it is redeemed and when it expires are set out in the clause “Loyalty points and their redemption” in the terms and conditions.'),

  ('3311.title', 'What our systems record about your use of the site'),
  ('3311.num',   '11'),
  ('3311.body',  'Besides what you write yourself in the booking and quote-request forms, records are created by your use of the site and written by our systems. They are set out in the table below with what they keep, what they do not keep, and how long they stay.'),

  ('3312.title', 'Records created by use of the site'),
  ('3312.h1',    'The record'),
  ('3312.h2',    'What it keeps, and how long'),
  ('3312.note',  'Everything in this table is an internal record for running and measuring the service. It is not sold and not shared with any party for marketing purposes — as stated in clause four.'),
  ('3312.items.pvl001.c1', 'Your steps on the site'),
  ('3312.items.pvl001.c2', 'We record in our own database the step and its time: a price search, a quote viewed, a booking started, a booking completed, a payment completed — together with the vehicle class and the booking value. This record holds neither your name, nor your phone number, nor your network address. It does carry the booking or request reference once one exists, and from that reference we ourselves can link the step to your booking.'),
  ('3312.items.pvl002.c1', 'What you type in the place-search box'),
  ('3312.items.pvl002.c2', 'Your search text is stored with its results in a shared memory that speeds up the next search for any visitor, so that we do not ask the map service the same question twice. Who typed it is not stored with it, and it is linked neither to your booking nor to your device. It has no defined deletion period today.'),
  ('3312.items.pvl003.c1', 'The map image of your route'),
  ('3312.items.pvl003.c2', 'One image of the route is generated for each confirmed booking and kept in private storage that is not publicly available, and it is shown to you on your booking status page. To draw it, the coordinates of the pickup point and the destination reach an open routing service and Google Maps — without your name and without your phone number.'),
  ('3312.items.pvl004.c1', 'The internal audit log'),
  ('3312.items.pvl004.c2', 'Every change made to your booking is recorded with who made it, when, and what changed, and with the entry a copy of the booking row at that moment, including your name and your phone number. The log is not edited and nothing is deleted from it except by an administrative trim that keeps at least one year. It is an internal log shown neither to you nor to the partner.'),
  ('3312.items.pvl005.c1', 'The counter of attempts to open the tracking page'),
  ('3312.items.pvl005.c2', 'When you open “track your booking” we count the attempts in fifteen-minute windows to prevent reference guessing, using an anonymous fingerprint computed by our servers that does not carry your network address. The counter rows are swept after one hour.'),
  ('3312.items.pvl006.c1', 'The channels that alert our team and the partner'),
  ('3312.items.pvl006.c2', 'Booking alerts reach our team over Telegram, and the trip offer reaches the partner over Telegram or as a notification in his browser if he has enabled it. The alert message therefore passes through the servers of the channel provider. The transfer receipt is not sent over any of them.'),

  ('3313.title', 'Partners'' and drivers'' data'),
  ('3313.num',   '12'),
  ('3313.body',  E'This policy applies as well to the approved partners who carry out the trips, and to the drivers and vehicles each of them declares in his portal. What we keep about them is set out in the table below.\n\nWhat reaches the customer out of all this is limited: his booking status page shows him the driver''s name, the driver''s phone number, and the vehicle''s details and plate, before the departure time — the driver''s photo does not reach him, nor the photo of the licence, nor anything from the financial record.'),

  ('3314.title', 'What we keep about the partner, his drivers and his vehicles'),
  ('3314.h1',    'Category'),
  ('3314.h2',    'What it covers, and how long it stays'),
  ('3314.note',  'The partner manages his drivers and his vehicles from his portal: he adds, edits and deactivates them.'),
  ('3314.items.pvp001.c1', 'The partner himself'),
  ('3314.items.pvp001.c2', 'The company name, the contact person''s name, his phone number, his WhatsApp number, his email address and his social accounts if he entered them, the state of his approval and our internal notes about him, and his Telegram chat identifier if he linked his portal to the bot.'),
  ('3314.items.pvp002.c1', 'His presence in his portal'),
  ('3314.items.pvp002.c2', 'We record the time of the last authenticated request received from him, as a heartbeat updated at most once a minute, so that his state appears to our administration alone: online now, or last seen at. The heartbeat records neither what he opened nor what he did, and no accumulated history is kept for it — a single row written over.'),
  ('3314.items.pvp003.c1', 'His drivers'),
  ('3314.items.pvp003.c2', 'The name, the phone number, the licence number and its expiry date, the driver''s photo and the photo of the licence, and who in our administration verified the licence and when. The two photos sit in private storage that does not open through a public link: only the partner who owns them and our administration see them, and they do not reach the customer. They are deleted five years after our relationship with the partner ends, and after that the name, the licence number and its date remain in the text record.'),
  ('3314.items.pvp004.c1', 'His vehicles'),
  ('3314.items.pvp004.c2', 'The class, the description, the plate, the model year, the colour, the number of seats and the vehicle photo.'),
  ('3314.items.pvp005.c1', 'His financial record'),
  ('3314.items.pvp005.c2', 'What is due to him for each trip, and what was deducted from him if a deduction occurred: its reason as recorded on the day, its amount, who recorded it and when; his apology for a trip he had accepted and what he said in it; his request to complete a trip and our decision on it; and the settlements and payouts between us. These entries are append-only and are not deleted; a correction is a reversing entry.'),
  ('3314.items.pvp006.c1', 'His grievance'),
  ('3314.items.pvp006.c2', 'The text of the grievance he files against a deduction, a classification or a settlement, the time he filed it, and who decided it, with what and when.'),
  ('3314.items.pvp007.c1', 'His signature and his notification subscription'),
  ('3314.items.pvp007.c2', 'The name he signed the partnership agreement with, the time of signature, the version number and its hash, and who recorded the signature. And if he enabled browser notifications we keep his device''s subscription address and its two keys and his browser type — the subscription address does not leave to any interface.');

-- المفتاح المختصر (`3310.title`) يُشتقّ من المفتاح الحيّ باستبدال المعرّف وحده،
-- فيبقى الأصل مقروءاً من الفهرس ولا يُنسخ نصٌّ عربيٌّ في هذا الملف مرتين.
-- ⚠ `source_hash` عمودٌ مولَّد (`generated always as i18n_source_hash(source_text)`)
--   فلا يُكتب بيد — تُكتب المادة الخام وحدها ويشتقّه المحرّك.
insert into public.translations
  (id, locale, namespace, key, source_text, value, status, provider, updated_by)
select
  gen_random_uuid(),
  'en',
  'section',
  m.k,
  m.src,
  e.v,
  'draft',
  'human',
  null
from (
  select c.k,
         c.src,
         case
           when c.k like p.s1::text || '.%' then replace(c.k, p.s1::text, '3310')
           when c.k like p.s2::text || '.%' then replace(c.k, p.s2::text, '3311')
           when c.k like p.s3::text || '.%' then replace(c.k, p.s3::text, '3312')
           when c.k like p.s4::text || '.%' then replace(c.k, p.s4::text, '3313')
           when c.k like p.s5::text || '.%' then replace(c.k, p.s5::text, '3314')
         end as short_k
  from public.i18n_corpus_rows() c
  cross join _priv_128 p
  where c.ns = 'section'
    and (c.k like p.s1::text || '.%' or c.k like p.s2::text || '.%'
      or c.k like p.s3::text || '.%' or c.k like p.s4::text || '.%'
      or c.k like p.s5::text || '.%')
) m
join _en_128 e on e.k = m.short_k
on conflict (locale, namespace, key) do nothing;

-- ----------------------------------------------------------------------------
-- (٦) الفحص الذاتي — كلُّ ادّعاءٍ في هذا الملف يُعاد قياسه بعد الكتابة
-- ----------------------------------------------------------------------------
do $c128$
declare
  p       record;
  b       record;
  v_n     integer;
  v_bad   text;
  v_new   integer;
begin
  select * into p from _priv_128;
  select * into b from _base_128;

  -- (٦-أ) الأقسام الخمسة نزلت مرئيةً على الصفحة الصحيحة، بلا نقصٍ ولا زيادة
  select string_agg(x.id::text, '، ') into v_bad
  from (values (p.s1), (p.s2), (p.s3), (p.s4), (p.s5)) x(id)
  where not exists (
    select 1 from public.sections s
    where s.id = x.id and s.page_id = p.page_id and s.visible);
  if v_bad is not null then
    raise exception '0128: (٦-أ) أقسامٌ لم تنزل أو ليست مرئية — %', v_bad;
  end if;

  select count(*) into v_n from public.sections where page_id = p.page_id;
  if v_n <> b.secs_before + (5 - b.new_secs_before) then
    raise exception '0128: (٦-أ) عددُ أقسام الصفحة % بدل %',
      v_n, b.secs_before + (5 - b.new_secs_before);
  end if;

  -- (٦-ب) 🔴 لا بندَ قائمٌ لُمس: البنود التسعة الأصلية بأرقامها ومراسيها
  select string_agg(x.a, '، ') into v_bad
  from (values
    ('who-we-are'), ('what-we-collect'), ('why-we-collect'), ('who-sees-it'),
    ('retention'), ('security'), ('your-rights'), ('cookies'),
    ('children-and-updates')) x(a)
  where not exists (
    select 1 from public.sections s
    where s.page_id = p.page_id and s.visible and s.type = 'clause'
      and s.content ->> 'anchor' = x.a);
  if v_bad is not null then
    raise exception '0128: (٦-ب) 🔴 مرساةُ بندٍ قائمٍ اختفت — %', v_bad;
  end if;

  -- والترقيم متصلٌ بلا تكرار: ١…١٢
  select count(distinct s.content ->> 'num') into v_n
  from public.sections s
  where s.page_id = p.page_id and s.visible and s.type = 'clause';
  if v_n <> 12 then
    raise exception '0128: (٦-ب) أرقامُ البنود المميّزة % بدل ١٢ — ترقيمٌ مكرَّر أو ناقص', v_n;
  end if;

  -- (٦-ج) 🔴 الفهرس صار قديمَه ناقصاً ما كان للأقسام الجديدة زائداً ٤٣ بالضبط،
  --        ولا مفتاحَ قديمٌ خرج — فالإضافة إضافةٌ لا إزاحة
  select count(*) into v_n from public.i18n_corpus_rows();
  if v_n <> b.corpus_before - b.new_keys_before + 43 then
    raise exception '0128: (٦-ج) 🔴 الفهرس % ⇐ % (المتوقع %)',
      b.corpus_before, v_n, b.corpus_before - b.new_keys_before + 43;
  end if;

  select count(*) into v_new
  from public.i18n_corpus_rows() c
  where c.ns = 'section'
    and (c.k like p.s1::text || '.%' or c.k like p.s2::text || '.%'
      or c.k like p.s3::text || '.%' or c.k like p.s4::text || '.%'
      or c.k like p.s5::text || '.%');
  if v_new <> 43 then
    raise exception '0128: (٦-ج) مفاتيحُ الأقسام الجديدة % بدل ٤٣', v_new;
  end if;

  -- (٦-د) 🔴 المنشور الإنجليزي **لم يتحرّك**، والمسوّدات نمت ٤٣
  select count(*) into v_n
  from public.translations where locale = 'en' and status = 'published';
  if v_n <> b.en_pub_before then
    raise exception
      '0128: (٦-د) 🔴 المنشور الإنجليزي تحرّك % ⇐ % — هذه الهجرة لا تنشر لغة',
      b.en_pub_before, v_n;
  end if;

  select count(*) into v_n
  from public.translations where locale = 'en' and status = 'draft';
  if v_n <> b.en_draft_before - b.new_tr_before + 43 then
    raise exception '0128: (٦-د) مسوّداتُ en % بدل %',
      v_n, b.en_draft_before - b.new_tr_before + 43;
  end if;

  -- ولا صفَّ مسوّدةٍ بأصلٍ منحرفٍ عن الصفحة (‏«قديم» زوراً)
  select string_agg(tr.key, '، ') into v_bad
  from public.translations tr
  join public.i18n_corpus_rows() c on c.ns = tr.namespace and c.k = tr.key
  where tr.locale = 'en'
    and (tr.key like p.s1::text || '.%' or tr.key like p.s2::text || '.%'
      or tr.key like p.s3::text || '.%' or tr.key like p.s4::text || '.%'
      or tr.key like p.s5::text || '.%')
    and tr.source_hash is distinct from public.i18n_source_hash(c.src);
  if v_bad is not null then
    raise exception '0128: (٦-د) 🔴 مسوّدةٌ وُلدت «قديمة» — أصلُها ليس أصلَ الصفحة: %', v_bad;
  end if;

  -- (٦-هـ) D-60: لا لقطةٍ حيّةٍ تُسقط قسماً جديداً، ولا مؤرشفةٍ لُمست
  select string_agg(distinct r.id::text, '، ') into v_bad
  from public.page_revisions r
  cross join _new_ids_128 n
  where r.page_id = p.page_id
    and r.status in ('draft', 'published')
    and jsonb_typeof(r.snapshot -> 'sections') = 'array'
    and not exists (
      select 1 from jsonb_array_elements(r.snapshot -> 'sections') e
      where e ->> 'id' = n.id::text);
  if v_bad is not null then
    raise exception '0128: (٦-هـ) 🔴 لقطةٌ حيّة تُسقط قسماً جديداً — أول نشرةٍ تمحوه: %', v_bad;
  end if;

  select md5(coalesce(string_agg(
           r.id::text || ':' || r.status || ':' || md5(r.snapshot::text), '|' order by r.id), ''))
    into v_bad
  from public.page_revisions r where r.status = 'archived';
  if v_bad is distinct from b.archived_md5_before then
    raise exception '0128: (٦-هـ) 🔴 لقطةٌ مؤرشفةٌ تغيّرت — إعادةُ كتابةٍ للماضي';
  end if;

  raise notice
    '0128 ✔ الأقسام الخمسة قائمةٌ مرئية (بنود ١٠·١١·١٢) بلا مساس ببندٍ قائم · أقسامٌ أُدرجت الآن: % · الفهرس % ⇐ % · en منشور ثابتٌ عند % · مسوّدات % ⇐ % · لقطاتٌ حيّة % · مؤرشفة % بلا مساس',
    5 - b.new_secs_before,
    b.corpus_before, b.corpus_before - b.new_keys_before + 43, b.en_pub_before,
    b.en_draft_before, b.en_draft_before - b.new_tr_before + 43,
    b.live_snaps, b.archived_snaps;
  raise notice
    '0128 ⚠ ٤٣ صفَّ en **مسوّدة** — /admin/languages/en ← مرشّح «مسودة» ⇒ راجِع واضغط «اعتمد وانشر». وحتى ذلك يعرض /en/privacy العربية لهذه البنود. **قبل رفع noindex.**';
  raise notice
    '0128 🔴 عيبٌ مرفوع للمالك: geocode_cache يحفظ نصّ بحث الزائر بلا مدة حذف — النصّ يقولها كما هي، والعلاج قرارُك: كنسٌ دوريّ أم مفتاحٌ بالإحداثيات.';
end;
$c128$;
