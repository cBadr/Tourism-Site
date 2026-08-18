-- ============================================================================
-- 0115_reserved_fields_cannot_be_published.sql
-- الحقلُ المحجوز لا يُعتمد ولا يُنشر — **حيث يُكتب الصفّ، لا حيث يُقرأ.**
--
-- ── العيب، مقيساً في القاعدة الحيّة (2026-08-18، 04:54Z، D-58) ─────────────
--
--   select locale, status, count(*) from public.translations group by 1,2;
--     ⇒ en/published **٨٨٩** · en/draft **٢**
--
--   select key, value, source_text, status, provider, updated_at
--     from public.translations where key like '%.href';
--     ⇒ **ستّة صفوف · كلُّها `published` · كلُّها `provider='mymemory'`**
--       مختومةٌ بين 06:23:31.745Z و06:23:48.498Z بحساب المشرف `7aa6106a`
--
-- **وواحدٌ منها رابطٌ مكسور**:
--   `0b610000-…-0003.items.rtalex.href`
--     الأصل  : /routes/cairo-alexandria
--     القيمة : /routes/cairo-lexandria     ← ألفٌ ابتلعتها `mymemory`
--   و`pages` لا تحمل إلا `cairo-alexandria` (‏٢٣ صفّاً · ٢٣ slug متمايزاً)
--   ⇒ **٤٠٤ على أبرز شريط مساراتٍ في الرئيسية، لحظةَ يصيّرها أيُّ مسار.**
--
-- ── ولماذا وقع، ولا ذنبَ فيه لأحد ─────────────────────────────────────────
--
-- `0104` حجزت `href` فخرج من **الفهرس** (`i18n_corpus_rows`) ومن **التصيير**
-- (`i18n_apply`). فلا يدخل صفٌّ جديد الطابور، ولا يُستبدَل رابطٌ عند العرض.
-- **لكن الصفوف الستّة كانت مكتوبةً سلفاً** — وقد استثناها زرُّ الدفعة
-- (`draft_publish_plan` تحكم `machine` على كل `provider <> 'human'`) لا الحجز.
-- ثم جاء **اعتمادٌ فرديّ صفّاً صفّاً من الطابور** (‏`review_translation`
-- بـ`p_publish = true`، صفٌّ كل ثلاث ثوانٍ) فرفعها إلى `published`.
--
--   ⇒ **`0104` تمنع الجديد ولم تنظّف القديم، ولا موضعَ فيها يمنع النشر أصلاً.**
--
-- ── هل تصل الزائرَ اليوم؟ قِيس، ولم يُفترَض ───────────────────────────────
--
-- المسار الوحيد الذي يصيّر أقسام الصفحات هو `localized_page(slug, locale)`،
-- وهي **تبني الخريطة بلا أيّ ترشيحٍ للمحجوز**، ثم تسلّمها `i18n_apply`:
--
--   | القياس (04:5xZ) | النتيجة |
--   |---|---|
--   | مفاتيح خريطة أقسام `home` بالإنجليزية | **١٢٧** — منها **٦ تنتهي بـ`.href`** |
--   | `map['…rtalex.href']` | **`/routes/cairo-lexandria`** ← الخريطةُ تحمل المكسور |
--   | `localized_page('home','en')` ⇒ `items[rtalex].href` | **`/routes/cairo-alexandria`** ✅ |
--   | ونظيرتُها العربية | **`/routes/cairo-alexandria`** — مطابقة |
--   | والنثر جنبه | `name = "Cairo → Alexandria"` ⇒ **الترجمة تعمل** |
--
--   ⇒ **صفوفٌ منشورةٌ خاملةٌ بنيوياً**: تدخل الخريطة ولا تخرج من `i18n_apply`،
--     لأن `i18n_reserved_content_key` تُمرّر المفتاح المحجوز كما هو.
--     **فالعطل ليس رابطاً مكسوراً على الشاشة اليوم، بل بابٌ مفتوح**: يكفي أن
--     يسقط نداءُ الحارس من `i18n_apply` غداً — أو أن يُقرأ الجدول مباشرةً —
--     ليصير الستّةُ روابطَ حيّة، **وواحدٌ منها ميت**.
--
-- ── الطبقة الناقصة، ولماذا هذه هي التي تغلق الصنف ─────────────────────────
--
-- الحجزُ في `0104` يقع على **القراءة**: ماذا يُفهرَس وماذا يُستبدَل. ولا شيء
-- في المنظومة يقع على **الكتابة**: أيُّ صفٍّ يجوز أن يصير `reviewed`/`published`.
--
--   | العلاج | يغلق اليوم | يغلق الصنف |
--   |---|---|---|
--   | حذفُ الستّة | ✅ | ❌ — يعود بأول صفٍّ يكتبه مترجم |
--   | إنزالُها مسودةً وحدَه | ✅ | ❌ — الزرُّ نفسه يرفعها ثانيةً بعد دقيقة |
--   | **رفضُ الحقل المحجوز عند الكتابة** | ✅ | ✅ — لا مسار يبلغ `published` |
--
-- ⇒ هذا الملف يفعل **الثالث ثم الثاني**: حارسٌ عند الكتابة، ثم إنزالُ الستّة
--   إلى `draft`. **ولا يحذف صفّاً واحداً** — القرار المكتوب في `0104 §(١)`:
--   «استثنِها حالياً وسجّل ملاحظة… وتبقى مرئيةً للمالك في الطابور فيقرّر فيها
--   متى شاء». والحذفُ يمحو أثرَ ما وقع ولا يضيف أماناً بعد الحارس. **والقيمةُ
--   والأصلُ و`updated_by` تبقى كما هي**، فيبقى في الجدول من فعلها ومتى.
--
-- ── الصنف كلُّه، مقيساً لا مقدَّراً (04:5xZ) ───────────────────────────────
--
--   select count(*) from public.translations t
--    where t.status <> 'draft'
--      and public.i18n_reserved_content_key(regexp_replace(t.key,'^.*\.',''));
--     ⇒ **٦ — وكلُّها `href`**
--
--   وبالتفصيل: `src` · `icon` · `anchor` · `poster` · `video` · `style` · `_k`
--   ⇒ **صفر صفّ في الجدول بأي حالة**. المفاتيح الموجودة كلُّها نثر
--   (‏title ٢٧٥ · text ٧٤ · a/q ٧٢ · c1/c2 ٥٦ · body ٥٤ …) + href ٦.
--   ⇒ **الستّة هي الصنف كلُّه اليوم، والحارس يمنع الثاني قبل أن يولد.**
--
-- ── وحدُّ الحارس، مُعلَناً لا مكتوماً ──────────────────────────────────────
--
-- الحُكم على **آخر مقطعٍ في المفتاح** (‏`regexp_replace(key,'^.*\.','')`)، وهو
-- عينُ ما تفعله `i18n_corpus_rows` حين تسأل عن `e.key`/`ie.key`. ومفتاحٌ بلا
-- نقطةٍ يُحكَم عليه كاملاً — **وصفر صفٍّ كذلك اليوم** (قِيس).
-- ⇒ فمساحةُ `ui` — لو كُتبت غداً بمفتاحٍ آخرُ مقطعٍ فيه `icon` نصّاً بشرياً —
--   سترفض. وهو **مقصود**: هذه الثمانية أسماءُ حقولٍ لا نثرٌ، في أي مساحة.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (١) لقطةُ ما قبل — والفحص أدناه يقارن بها لا بأمنية
-- ----------------------------------------------------------------------------
create temporary table _base_115 on commit drop as
select
  (select count(*) from public.translations)                                as rows_before,
  (select count(*) from public.translations
    where locale = 'en' and status = 'published')                           as published_before,
  (select count(*) from public.translations
    where locale = 'en' and status = 'draft')                               as draft_before,
  (select count(*) from public.translations where key like '%.href')        as href_rows_before,
  (select count(*) from public.translations
    where key like '%.href' and status = 'published')                       as href_published_before,
  (select count(*) from public.i18n_corpus_rows())                          as corpus_before;

do $b115$
declare b record;
begin
  select * into b from _base_115;

  if not public.i18n_non_text_field('href') then
    raise exception '0115: 🔴 `href` غير محجوز — نفّذ 0104 أولاً، وإلا حرس هذا الملف حقلاً مفهرَساً';
  end if;

  if b.href_published_before = 0 then
    raise notice '  ← لا صفَّ href منشور: الحارسُ وحده ينزل، ولا تنظيفَ يُنفَّذ';
  end if;

  raise notice '  ← قبل: صفوف % · en منشور % · en مسودة % · صفوف href % منها منشور % · الفهرس %',
    b.rows_before, b.published_before, b.draft_before,
    b.href_rows_before, b.href_published_before, b.corpus_before;
end;
$b115$;

-- ----------------------------------------------------------------------------
-- (٢) 🔴 القرار في موضعٍ واحد — دالةٌ نقيّةٌ تُسأل من الطبقات الثلاث
--
--     نفس نمط `0104`: `i18n_non_text_field` ⇐ `i18n_reserved_content_key` ⇐
--     (`i18n_corpus_rows` · `i18n_apply`). وهذه تضيف الضلع الرابع — **الكتابة** —
--     على المصدر نفسه، فلا تنحرف «ما لا يُترجَم» عن «ما لا يُنشَر» أبداً.
--
--     ونقيّةٌ عمداً (`immutable`، بلا قراءةِ جدول): فتُختبَر بلا كتابة بايت،
--     وتصلح داخل مُشغّلٍ يُنادى على كل صفّ.
-- ----------------------------------------------------------------------------
create or replace function public.i18n_reserved_translation_key(p_key text)
returns boolean
language sql
immutable
set search_path = ''
as $fn115$
  /*
   * هل مفتاحُ صفِّ ترجمةٍ كامل (‏`<معرّف>.items.<عنوان>.<حقل>`) يخصّ حقلاً
   * محجوزاً؟ الحكمُ على **آخر مقطع** — وهو ما تراه `i18n_corpus_rows`
   * و`i18n_apply` حين تسألان `i18n_reserved_content_key(e.key)`.
   * ومفتاحٌ بلا نقطة يُحكَم عليه كاملاً.
   */
  select p_key is not null
     and public.i18n_reserved_content_key(regexp_replace(p_key, '^.*\.', ''))
$fn115$;

comment on function public.i18n_reserved_translation_key(text) is
  'هل ينتهي مفتاح صفّ الترجمة بحقلٍ محجوز (href/src/poster/video/icon/anchor/_k/style)؟ يُسأل من مُشغّل translations ومن review_translation ومن publish_locale.';

-- ----------------------------------------------------------------------------
-- (٣) 🔴 الحارس البنيوي — على الجدول لا في الدالة
--
--     لماذا مُشغّلٌ ولا يكفي حارسٌ داخل `review_translation`؟ لأن الدالة مسارٌ
--     واحد من أربعة: `publish_locale` · `upsert_translations` (‏فرعُ «صفٌّ
--     جديد» ينشر فوراً حين `locales.auto_publish` — **وهي حالُ `en` اليوم**) ·
--     وكتابةٌ مباشرة على الجدول من اللوحة أو بمفتاح الخدمة (‏RLS تسمح للمشرف
--     بـ`insert`/`update`، و`service_role` يملك الأربعة). **والمُشغّل تحتها كلِّها.**
--
--     ⚠ و`0114` نزعت `TRIGGER` عن `service_role` و`authenticated` و`anon`
--        (‏٠/٧٩ علاقة) ⇒ لا دورَ يصله المتصفحُ أو مفتاحُ الخدمة يستطيع تعطيله.
-- ----------------------------------------------------------------------------
create or replace function public.translations_guard_reserved_field()
returns trigger
language plpgsql
set search_path = ''
as $tg115$
declare
  v_field text := regexp_replace(new.key, '^.*\.', '');
begin
  if new.status is distinct from 'draft'
     and public.i18n_reserved_translation_key(new.key) then
    raise exception
      'الحقل «%» ليس نصّاً يُترجَم — لا يُعتمد ولا يُنشر (المفتاح: %)', v_field, new.key
      using hint   = 'reserved-field',
            detail = 'الروابط والمصادر والمعرّفات واحدةٌ لكل اللغات (D-24)؛ ترجمتها رابطٌ مكسور لا تحسين. ويبقى الصفّ مسودةً للسجل.';
  end if;
  return new;
end;
$tg115$;

drop trigger if exists translations_guard_reserved_field on public.translations;
create trigger translations_guard_reserved_field
  before insert or update on public.translations
  for each row
  execute function public.translations_guard_reserved_field();

-- ----------------------------------------------------------------------------
-- (٤) التنظيف — الستّة تنزل مسوَّدةً، **ولا صفَّ يُحذف**
--
--     `status` وحده يتغيّر. `value` و`source_text` و`provider` و`updated_by`
--     كما هي ⇒ يبقى في الجدول **ماذا كُتب ومن رفعه**. و`updated_at` يتحرّك
--     بحكم `translations_touch_updated_at` (‏`new.updated_at := now()`) —
--     وهو حقلُ عرضٍ لا يدخل حسابَ «قديم» (‏`translation_queue` تشتقّه من
--     `source_hash`)، والطوابعُ الأصلية مسجَّلةٌ في ترويسة هذا الملف.
-- ----------------------------------------------------------------------------
do $u115$
declare
  b     record;
  v_n   integer;
  v_ids text;
begin
  select * into b from _base_115;

  select string_agg(t.locale || '/' || t.key, ' · ' order by t.key) into v_ids
  from public.translations t
  where t.status <> 'draft' and public.i18n_reserved_translation_key(t.key);

  update public.translations t
     set status = 'draft'
   where t.status <> 'draft'
     and public.i18n_reserved_translation_key(t.key);
  get diagnostics v_n = row_count;

  if v_n <> b.href_published_before then
    raise exception '0115: 🔴 نزل % صفّاً والمقيسُ قبلَه % — صفٌّ غيرُ المحسوب تحرّك',
      v_n, b.href_published_before;
  end if;

  if v_n > 0 then
    raise notice '  ← نزلت % صفوفٍ إلى مسودة: %', v_n, v_ids;
  end if;
end;
$u115$;

-- ----------------------------------------------------------------------------
-- (٥) `review_translation` — ترفض صراحةً وبرسالةٍ تسمّي الحقل
--
--     المُشغّل كافٍ لمنع الكتابة، لكن رسالته تُقرأ في السجلّ لا على الشاشة.
--     والرفضُ هنا **قبل** أي `update` يعطي المشرفَ سبباً مفهوماً، ويجعل
--     `hint = 'reserved-field'` مقروءاً من طبقة الإجراءات.
--
--     ⚠ ويرفض **الاعتماد كذلك لا النشر وحده**: `reviewed` غرفةُ انتظار
--        `publish_locale`، وصفٌّ لا يجوز نشرُه لا يجوز أن يقف فيها.
--
--     والجسمُ منقولٌ حرفياً من `pg_get_functiondef` (D-58) ولم يُغيَّر منه
--     إلا إدراجُ الكتلة الجديدة بعد العثور على الصفّ.
-- ----------------------------------------------------------------------------
create or replace function public.review_translation(p_id uuid, p_value text, p_publish boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $rv115$
declare
  v_row  public.translations%rowtype;
  v_val  text := nullif(btrim(coalesce(p_value, '')), '');
  v_live text;
  v_new  public.translations%rowtype;
begin
  if not public.i18n_admin_allowed() then
    raise exception 'مراجعة الترجمة متاحة للمشرف وحده' using hint = 'forbidden';
  end if;

  if v_val is null then
    raise exception 'نص الترجمة إلزامي — لا يُنشر فراغ' using hint = 'invalid-input';
  end if;

  select * into v_row from public.translations tr where tr.id = p_id;
  if not found then
    raise exception 'صف الترجمة غير موجود' using hint = 'not-found';
  end if;

  -- 0115: حقلٌ محجوز لا يُعتمد ولا يُنشر — ويبقى مسودةً للسجل
  if public.i18n_reserved_translation_key(v_row.key) then
    raise exception
      'الحقل «%» ليس نصّاً يُترجَم — لا يُعتمد ولا يُنشر (المفتاح: %)',
      regexp_replace(v_row.key, '^.*\.', ''), v_row.key
      using hint   = 'reserved-field',
            detail = 'الروابط والمصادر والمعرّفات واحدةٌ لكل اللغات (D-24)؛ ترجمتها رابطٌ مكسور لا تحسين.';
  end if;

  select c.src into v_live
  from public.i18n_corpus_rows() c
  where c.ns = v_row.namespace and c.k = v_row.key;

  update public.translations tr
     set value       = v_val,
         source_text = coalesce(v_live, tr.source_text),
         status      = case when coalesce(p_publish, false) then 'published' else 'reviewed' end,
         updated_by  = public.current_actor()
   where tr.id = p_id
  returning * into v_new;

  return jsonb_build_object(
    'id',         v_new.id,
    'locale',     v_new.locale,
    'namespace',  v_new.namespace,
    'key',        v_new.key,
    'value',      v_new.value,
    'status',     v_new.status,
    'sourceText', v_new.source_text,
    'stale',      false,
    'updatedAt',  v_new.updated_at);
end;
$rv115$;

-- ----------------------------------------------------------------------------
-- (٦) `publish_locale` — القفلُ الثاني، ولا يُخفي عملاً
--
--     بعد (٣) لا يبلغ صفٌّ محجوزٌ حالة `reviewed` أصلاً، فهذا الشرط **لا يستثني
--     صفّاً موجوداً اليوم** (قِيس: صفر صفٍّ محجوزٍ `reviewed`). وجودُه يمنع
--     أمرين: أن **تُجهَض دفعةُ نشرٍ كاملة** بسبب صفٍّ واحدٍ مسموم لو عُطّل
--     المُشغّل يوماً، وأن يمرّ الصفُّ لو سقط المُشغّل. **والعدد المُرجَع يبقى
--     صادقاً**: هو ما كُتب فعلاً.
--
--     والجسمُ منقولٌ حرفياً من `pg_get_functiondef` (D-58) ولم يُغيَّر منه
--     إلا سطرُ الشرط.
-- ----------------------------------------------------------------------------
create or replace function public.publish_locale(p_locale text)
returns integer
language plpgsql
security definer
set search_path = ''
as $pl115$
declare
  v_n integer;
begin
  if not public.i18n_admin_allowed() then
    raise exception 'النشر متاح للمشرف وحده' using hint = 'forbidden';
  end if;

  if not exists (select 1 from public.locales l where l.code = p_locale and not l.is_default) then
    raise exception 'لغة غير مسجَّلة أو أنها لغة الأساس: %', coalesce(p_locale, 'بلا')
      using hint = 'not-found';
  end if;

  update public.translations tr
     set status     = 'published',
         updated_by = public.current_actor()
   where tr.locale = p_locale
     and tr.status = 'reviewed'
     and tr.value is not null
     and btrim(tr.value) <> ''
     and not public.i18n_reserved_translation_key(tr.key);   -- 0115

  get diagnostics v_n = row_count;
  return v_n;
end;
$pl115$;

-- ----------------------------------------------------------------------------
-- (٧) الفحص الذاتي — الحصيلة، ثم ما كان قائماً قبله (D-58)
-- ----------------------------------------------------------------------------
do $c115$
declare
  b      record;
  v_n    integer;
  v_bad  text;
  v_def  text;
  v_out  jsonb;
begin
  select * into b from _base_115;

  -- (٧-١) الدالة تحكم كما يجب، من الطرفين
  if not public.i18n_reserved_translation_key('0b610000-0000-4000-8000-000000000003.items.rtalex.href')
     or not public.i18n_reserved_translation_key('a.items.b.src')
     or not public.i18n_reserved_translation_key('href') then
    raise exception '0115: 🔴 i18n_reserved_translation_key لا تمسك المحجوز';
  end if;
  select string_agg(x.k, '، ') into v_bad
  from (values ('p.title'), ('p.meta.description'), ('brand.name'),
               ('nav.abc.label'), ('sec.items.k1.name'), ('sec.items.k1.alt'),
               ('vehicle-slug.short'), ('seo.titleTemplate')) x(k)
  where public.i18n_reserved_translation_key(x.k);
  if v_bad is not null then
    raise exception '0115: 🔴 مفاتيحُ نثرٍ حُكم عليها بالحجز — %', v_bad;
  end if;

  -- (٧-٢) الحصيلة: صفر صفٍّ محجوزٍ حيّ، **وبفارقٍ يساوي المقيس بالضبط**
  select count(*) into v_n
  from public.translations t
  where t.status <> 'draft' and public.i18n_reserved_translation_key(t.key);
  if v_n <> 0 then
    raise exception '0115: 🔴 بقي % صفّاً محجوزاً غير مسوَّد', v_n;
  end if;

  select count(*) into v_n from public.translations where locale = 'en' and status = 'published';
  if v_n <> b.published_before - b.href_published_before then
    raise exception '0115: 🔴 المنشور الإنجليزي % ⇐ % والمتوقَّع % — تحرّك ما ليس من عملنا',
      b.published_before, v_n, b.published_before - b.href_published_before;
  end if;

  select count(*) into v_n from public.translations where locale = 'en' and status = 'draft';
  if v_n <> b.draft_before + b.href_published_before then
    raise exception '0115: 🔴 مسودّاتُ en % ⇐ % والمتوقَّع %',
      b.draft_before, v_n, b.draft_before + b.href_published_before;
  end if;

  -- (٧-٣) 🔴 ولا صفَّ حُذف، ولا قيمةٌ مُسحت
  select count(*) into v_n from public.translations;
  if v_n <> b.rows_before then
    raise exception '0115: 🔴 عدد الصفوف % ⇐ % — هذه الهجرة لا تحذف ولا تُدرج',
      b.rows_before, v_n;
  end if;
  select count(*) into v_n from public.translations where key like '%.href';
  if v_n <> b.href_rows_before then
    raise exception '0115: 🔴 صفوف href % ⇐ %', b.href_rows_before, v_n;
  end if;
  if exists (select 1 from public.translations t
              where t.key like '%.href'
                and (t.value is null or btrim(t.value) = '' or t.updated_by is null)) then
    raise exception '0115: 🔴 صفُّ href فقد قيمتَه أو فاعلَه — الأثر مُحي';
  end if;
  if not exists (select 1 from public.translations t
                  where t.key like '%.rtalex.href' and t.value = '/routes/cairo-lexandria') then
    raise notice '  ⚠ الصفُّ المكسور لم يعد يحمل /routes/cairo-lexandria — غُيّر خارج هذه الهجرة';
  end if;

  -- (٧-٤) 🔴 الفهرس لم يتحرّك — هذا الملف لا يمسّ ما يُترجَم
  select count(*) into v_n from public.i18n_corpus_rows();
  if v_n <> b.corpus_before then
    raise exception '0115: 🔴 الفهرس % ⇐ % — الحارس بلغ طبقةَ القراءة', b.corpus_before, v_n;
  end if;

  -- (٧-٥) 🔴 وحارسا `0104` قائمان — لا انحدار مع الإضافة
  if not public.i18n_non_text_field('href')
     or not public.i18n_non_text_field('src')
     or not public.i18n_reserved_content_key('_k')
     or not public.i18n_reserved_content_key('style') then
    raise exception '0115: 🔴 مجموعةُ 0104 المحجوزة سقطت';
  end if;
  v_def := pg_get_functiondef('public.i18n_apply(jsonb,text,jsonb)'::regprocedure);
  if position('i18n_reserved_content_key' in v_def) = 0 then
    raise exception '0115: 🔴 i18n_apply لم تعد تستشير الحارس';
  end if;
  v_out := public.i18n_apply(
    jsonb_build_object('title', 'عنوان',
      'items', jsonb_build_array(
        jsonb_build_object('_k', 'zzt115', 'name', 'اسم', 'href', '/routes/cairo-alexandria'))),
    'SEC',
    jsonb_build_object('SEC.title', 'Title',
      'SEC.items.zzt115.name', 'Name',
      'SEC.items.zzt115.href', '/routes/cairo-lexandria'));
  if (v_out -> 'items' -> 0 ->> 'href') is distinct from '/routes/cairo-alexandria'
     or (v_out ->> 'title') is distinct from 'Title'
     or (v_out -> 'items' -> 0 ->> 'name') is distinct from 'Name' then
    raise exception '0115: 🔴 التصيير انحرف — href=% title=% name=%',
      (v_out -> 'items' -> 0 ->> 'href'), (v_out ->> 'title'), (v_out -> 'items' -> 0 ->> 'name');
  end if;

  -- (٧-٦) 🔴 والدالتان تسألان الحارس فعلاً — نصّاً، ثم سلوكاً في (٨)
  if position('i18n_reserved_translation_key'
       in pg_get_functiondef('public.review_translation(uuid,text,boolean)'::regprocedure)) = 0 then
    raise exception '0115: 🔴 review_translation لا تستشير الحارس';
  end if;
  if position('i18n_reserved_translation_key'
       in pg_get_functiondef('public.publish_locale(text)'::regprocedure)) = 0 then
    raise exception '0115: 🔴 publish_locale لا تستشير الحارس';
  end if;
  if not exists (
    select 1 from pg_trigger g
    where g.tgrelid = 'public.translations'::regclass
      and g.tgname = 'translations_guard_reserved_field'
      and not g.tgisinternal
      and g.tgenabled = 'O') then
    raise exception '0115: 🔴 المُشغّل غائبٌ أو معطَّل';
  end if;

  raise notice
    '0115 ✔ en منشور % ⇐ % (‏−%) · مسودة % ⇐ % · الصفوف % بلا حذف · الفهرس ثابتٌ عند %',
    b.published_before, b.published_before - b.href_published_before, b.href_published_before,
    b.draft_before, b.draft_before + b.href_published_before,
    b.rows_before, b.corpus_before;
end;
$c115$;

-- ----------------------------------------------------------------------------
-- (٨) 🔴 السلوك لا النصّ — محاولاتٌ حيّة داخل معاملةٍ فرعية تُرجَع دائماً.
--        فلا صفَّ يبقى، **والحارس يُقاس بما يفعل لا بما يقول.**
-- ----------------------------------------------------------------------------
do $p115$
declare
  v_key   constant text := 'zz0115probe.items.zp0115.href';
  v_pkey  constant text := 'zz0115probe.items.zp0115.name';
  v_id    uuid;
  v_st    text;
begin
  -- (أ) إدراجٌ **منشور** لحقلٍ محجوز ⇒ يُرفض
  begin
    insert into public.translations (locale, namespace, key, source_text, value, status, provider)
    values ('en', 'section', v_key, '/routes/probe-a', '/routes/probe-b', 'published', 'probe0115');
    raise exception 'P115_NO_GUARD_INSERT';
  exception
    when others then
      if sqlerrm = 'P115_NO_GUARD_INSERT' then
        raise exception '0115: 🔴 المُشغّل قبل إدراجَ حقلٍ محجوزٍ منشور';
      end if;
      if position('ليس نصّاً يُترجَم' in sqlerrm) = 0 then
        raise exception '0115: 🔴 الرفض جاء من غير الحارس — %', sqlerrm;
      end if;
  end;

  -- (ب) مسودةٌ تمرّ، ثم رفعُها ⇒ يُرفض · وتعديلُها ⇒ يمرّ · و`publish_locale`
  --     لا تلمسها حتى مع تعطيل المُشغّل. والكتلةُ كلُّها تُجهَض في آخرها.
  begin
    insert into public.translations (locale, namespace, key, source_text, value, status, provider)
    values ('en', 'section', v_key, '/routes/probe-a', '/routes/probe-b', 'draft', 'probe0115')
    returning id into v_id;

    -- رفعٌ مباشر على الجدول ⇒ يُرفض
    begin
      update public.translations set status = 'published' where id = v_id;
      raise exception 'P115_NO_GUARD_UPDATE';
    exception
      when others then
        if sqlerrm = 'P115_NO_GUARD_UPDATE' then
          raise exception '0115: 🔴 المُشغّل قبل رفعَ مسودةٍ محجوزةٍ إلى منشور';
        end if;
        if position('ليس نصّاً يُترجَم' in sqlerrm) = 0 then raise; end if;
    end;

    -- واعتمادٌ (‏`reviewed`) ⇒ يُرفض كذلك
    begin
      update public.translations set status = 'reviewed' where id = v_id;
      raise exception 'P115_NO_GUARD_REVIEWED';
    exception
      when others then
        if sqlerrm = 'P115_NO_GUARD_REVIEWED' then
          raise exception '0115: 🔴 المُشغّل قبل اعتمادَ حقلٍ محجوز';
        end if;
        if position('ليس نصّاً يُترجَم' in sqlerrm) = 0 then raise; end if;
    end;

    -- وتعديلُ قيمةٍ على مسودةٍ يمرّ — فطريقُ التنظيف والتصحيح يبقى مفتوحاً
    update public.translations set value = '/routes/probe-c' where id = v_id;
    select status into v_st from public.translations where id = v_id;
    if v_st <> 'draft' then
      raise exception '0115: 🔴 المسودة المحجوزة لم تعد مسودة — %', v_st;
    end if;

    -- 🔴 القفل الثاني في عزلة: يُعطَّل المُشغّل، ويُصنع صفٌّ محجوزٌ «مراجَع»،
    --    فتُنادى `publish_locale` — ويجب ألّا تلمسه، وأن تلمس النثرَ جنبَه.
    alter table public.translations disable trigger translations_guard_reserved_field;
    update public.translations set status = 'reviewed' where id = v_id;
    insert into public.translations (locale, namespace, key, source_text, value, status, provider)
    values ('en', 'section', v_pkey, 'اسم تجريبي', 'Probe name', 'reviewed', 'probe0115');
    alter table public.translations enable trigger translations_guard_reserved_field;

    perform public.publish_locale('en');

    select status into v_st from public.translations where id = v_id;
    if v_st <> 'reviewed' then
      raise exception '0115: 🔴 publish_locale نشرت حقلاً محجوزاً — صار %', v_st;
    end if;
    select status into v_st from public.translations where key = v_pkey;
    if v_st <> 'published' then
      raise exception '0115: 🔴 publish_locale لم تعد تنشر النثر — %', v_st;
    end if;

    raise exception 'P115_ROLLBACK_OK';
  exception
    when others then
      if sqlerrm <> 'P115_ROLLBACK_OK' then raise; end if;
  end;

  -- والأرض نظيفة: المعاملة الفرعية أرجعت كل ما كُتب
  if exists (select 1 from public.translations where key in (v_key, v_pkey)) then
    raise exception '0115: 🔴 صفُّ مسبارٍ بقي في الجدول';
  end if;
  if not exists (
    select 1 from pg_trigger g
    where g.tgrelid = 'public.translations'::regclass
      and g.tgname = 'translations_guard_reserved_field' and g.tgenabled = 'O') then
    raise exception '0115: 🔴 المُشغّل بقي معطَّلاً بعد المسبار';
  end if;

  raise notice '0115 ✔ سلوكياً: إدراجٌ منشور ورفعٌ واعتمادٌ ⇒ مرفوضة · مسودةٌ وتعديلُها ⇒ يمرّان · publish_locale تتخطّى المحجوز وتنشر النثر · صفر أثرٍ باقٍ';
end;
$p115$;
