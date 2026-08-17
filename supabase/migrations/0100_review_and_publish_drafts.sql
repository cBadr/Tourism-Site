-- ============================================================================
-- 0100 — «انشر كل المسودات»: زرٌّ واحد يعتمد ثم ينشر، ولا يكتب حالةً بيده
--
-- ══════════════════════════════════════════════════════════════════════════
--  طلب المالك، بنصّه
-- ══════════════════════════════════════════════════════════════════════════
--
-- «في صفحة مراجعة الترجمة في لوحة التحكم، أضف زر **انشر كل المسودات** بجانب زر
--  **انشر كل المراجَع** لسهولة الاعتماد.» — بدر، 2026-08-17
--
-- ══════════════════════════════════════════════════════════════════════════
--  🔴 لماذا «اعتمِد ثم انشر» ولا يجوز أن تكون «اضبط الحالة منشورة»
-- ══════════════════════════════════════════════════════════════════════════
--
-- قاعدة الحالات (مسودة ← مراجَعة ← منشورة) هي **الحارس الوحيد** لما يقرؤه
-- الزائر بلغةٍ غير العربية. وترويسة `app/admin/languages/[locale]/actions.ts`
-- تقول حرفاً إن كتابة الواجهة للحالة مباشرةً تفتح باباً لنشر نصٍّ لم يمرّ
-- بمراجعة. فهذه الهجرة **لا تُنشئ باباً ثانياً للنشر**: تعتمد الصفوف باسم
-- المالك (`current_actor()` يبقى في `updated_by`، فيبقى لسؤال «من اعتمد هذا
-- النص؟» جواب)، ثم تُنادي `public.publish_locale` القائمة **بلا تعديلها**.
-- فالنشر يبقى مساراً واحداً، وأي تصليبٍ يُضاف إليه غداً يسري على الزرَّين معاً.
--
-- ══════════════════════════════════════════════════════════════════════════
--  🔴 والجزء الخفيّ: اعتمادٌ جماعيٌّ ساذج ينشر نصاً كاذباً
-- ══════════════════════════════════════════════════════════════════════════
--
-- `review_translation` — المقيسة من `pg_get_functiondef` لا من ملف هجرة —
-- **لا ترفض الصفّ القديم، بل تتبنّى أصله الحيّ**:
--
--     set source_text = coalesce(v_live, tr.source_text)
--
-- و`source_hash` عمودٌ **محسوبٌ مخزَّن** (`generated always as
-- i18n_source_hash(source_text) stored`)، فتبنّي الأصل يُعيد حساب البصمة ⇒
-- **يزول وسم «الأصل تغيّر» بلا أن يقرأ أحدٌ الترجمة**.
--
-- وذلك **صحيحٌ لصفٍّ واحد**: الشاشة تعرض الأصل العربي بجوار الحقل، فالمراجع
-- قرأه لحظتها. **وكارثيٌّ في دفعة**: لا عين قرأت الثمانمئة. ولو نُسخ فرعُ
-- التبنّي كما هو لصار الزرّ يقول «تحقّقت» وهو يمحو الدليل الوحيد على أن
-- الترجمة لم تعد تطابق أصلها. والحادثة ليست فرضية: وُجد صفٌّ يحمل `24/7` لرقمٍ
-- صحّحته هجرةٌ لاحقة إلى «٦٠».
--
-- ⇒ **فالقاعدة هنا معكوسة: القديم يُرفض ويبقى مسودةً، ولا يُتبنّى أصله.**
--    والوسم يبقى على الصفّ فيظهر في الطابور مرتَّباً أولاً (وهو ترتيبه أصلاً).
--
-- ══════════════════════════════════════════════════════════════════════════
--  ما يُستثنى، ولماذا الاستثناء أوسع من «mymemory»
-- ══════════════════════════════════════════════════════════════════════════
--
-- قرار المالك 2026-08-17: «استثنِها حالياً وسجّل ملاحظة» — أي **الصفوف الآلية
-- لا يشملها الزرّ**. وفي `en` اليوم ستّة صفوف `provider = 'mymemory'`، كلها
-- `href` في القسم `0b610000-0000-4000-8000-000000000003`، **وأحدها مكسور**
-- (`/routes/cairo-lexandria` — ألفٌ ناقصة تُنتج ٤٠٤ على بطاقة مسارٍ في
-- الرئيسية).
--
-- ⚠ **والشرط مكتوبٌ «ليس بشراً» لا «mymemory»**: `lib/i18n/mt/index.ts` يعرف
-- `deepl` و`google` أيضاً، وأولُ مفتاحٍ يضبطه المالك يجعلهما مزوِّدَين
-- عاملَين. فشرطٌ على الاسم الواحد كان سيبدأ باعتماد نصٍّ آليٍّ صامتاً يوم
-- تُضاف حصّة — وهو عيبٌ لا يُرى إلا بعد النشر. فالشرط:
--
--     coalesce(provider, 'human') <> 'human'   ⇒ آليّ ⇒ يُستثنى
--
-- و`null` بشرٌ لأن الصفّ الذي يكتبه المراجع من الطابور يصل بلا مزوِّد
-- (`saveTranslation` لا تمرّر `provider`).
--
-- ══════════════════════════════════════════════════════════════════════════
--  البنية: مصنِّفٌ واحد، ومعاينةٌ لا تستطيع الكتابة
-- ══════════════════════════════════════════════════════════════════════════
--
-- (١) `draft_publish_plan(locale)`  — المصنِّف. صفٌّ ⇒ حكم. `stable` وبلا أي
--     `grant` لدورٍ عام: يُنادى من داخل دالتَي الأخوين وهما `security definer`
--     مملوكتان لـ`postgres` (نفس حيلة `translation_queue` مع `i18n_corpus_rows`).
--
-- (٢) `draft_publish_preview(locale)` — تحصي وتحرس، **`stable` وبلا DML**.
--     🔴 ولماذا دالةٌ منفصلة لا معاملُ `p_dry_run` على الكاتبة: الصفحة تُنادي
--     المعاينة **في كل تصيير** لتطبع الرقم على الزرّ. ومعاملٌ منطقيٌّ على دالةٍ
--     تكتب يعني أن خطأً واحداً في حرفٍ يجعل **مجرّد فتح الصفحة** ينشر ثمانمئة
--     صفّ. و`stable` تمنع ذلك بالتصريح لا بالانتباه.
--
-- (٣) `review_and_publish_drafts(locale)` — تحصي بالمعاينة نفسها، ثم تعتمد
--     المؤهَّل، ثم تُنادي `publish_locale`. فلا يوجد مصنِّفان ينحرفان: الرقم
--     الذي رآه المالك قبل الضغط والرقم الذي نُفِّذ من **نفس التعبير**.
--
-- ── الأحكام (متنافية، فمجموعها = عدد الصفوف) ────────────────────────────────
--   'machine'        مزوِّدٌ آليّ            ⇒ يُستثنى (قرار المالك)
--   'blank'          قيمة فارغة              ⇒ يُستثنى (كما تفعل publish_locale)
--   'stale'          الأصل تغيّر             ⇒ **لا يُعتمد** ويبقى مسودةً
--   'approve'        بشريّ · غير فارغ · مطابق ⇒ يُعتمد ثم يُنشر
--   'reviewed'       مراجَعٌ سلفاً            ⇒ تنشره publish_locale معنا
--   'reviewed-stale' مراجَعٌ سلفاً وقديم      ⇒ تنشره أيضاً — **يُحصى ويُعلَن**
--   'reviewed-blank' مراجَعٌ سلفاً وفارغ      ⇒ لا تنشره publish_locale
--
-- ⚠ **و`reviewed-stale` عيبٌ سابقٌ لهذه الهجرة لا تُصلحه**: `publish_locale`
--    تنشر كل `reviewed` غير الفارغ، قديماً كان أو لا — وهو سلوك زرّ «انشر كل
--    المراجَع» القائم منذ `0018`. وتغييرُه يغيّر زرّاً يعمل، فلا يُغيَّر من هنا.
--    **لكن السكوت عنه يجعل زرّي يقول «تحقّقت من كل صفّ» وهو ينشر صفاً لم يُتحقَّق
--    منه.** فالعدّ يُرجَع في الحصيلة وتُظهره الشاشة تنبيهاً. (اليوم صفر في `en`.)
--
-- ── وأمرٌ لا تفعله هذه الهجرة إطلاقاً ───────────────────────────────────────
-- **لا تلمس `public.locales`.** فنشرُ النصوص لا يُظهر لغةً: `enabled_locales()`
-- مقيسةً ترشِّح بـ`l.enabled` وحده، و`published_count` عمودٌ **مُرجَعٌ لا
-- مُرشِّح**. فإظهار لغةٍ للزوار قرارُ المالك وحده (‏د-٢٥) ويبقى في مدير اللغات.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (١) المصنِّف — صفٌّ ⇒ حكم. تعبيرٌ واحد تقرؤه المعاينة والكاتبة معاً.
-- ----------------------------------------------------------------------------
create or replace function public.draft_publish_plan(p_locale text)
returns table (id uuid, verdict text)
language sql
stable
security definer
set search_path = ''
as $$
  with corpus as (
    select c.ns, c.k, c.src from public.i18n_corpus_rows() c
  )
  select tr.id,
         case
           -- مراجَعٌ سلفاً: ليس من عمل هذا الزرّ، لكن publish_locale ستنشره معنا
           when tr.status = 'reviewed' then
             case
               when btrim(coalesce(tr.value, '')) = '' then 'reviewed-blank'
               when tr.source_hash is distinct from
                    public.i18n_source_hash(coalesce(c.src, tr.source_text))
                 then 'reviewed-stale'
               else 'reviewed'
             end
           -- الآليّ أولاً: قرار المالك يستثنيه أياً كانت بقية أحواله
           when coalesce(tr.provider, 'human') <> 'human'        then 'machine'
           when btrim(coalesce(tr.value, '')) = ''               then 'blank'
           -- الأصل الحيّ للمفتاح الخارج عن الفهرس هو المخزَّن نفسه — وهو عين
           -- `coalesce` في `translation_queue`، فوسمُ الشاشة ووسمُ الزرّ واحد.
           when tr.source_hash is distinct from
                public.i18n_source_hash(coalesce(c.src, tr.source_text))
             then 'stale'
           else 'approve'
         end as verdict
  from public.translations tr
  left join corpus c on c.ns = tr.namespace and c.k = tr.key
  where tr.locale = p_locale
    and tr.status in ('draft', 'reviewed');
$$;

comment on function public.draft_publish_plan(text) is
  'مصنِّف صفوف المسودات قبل الاعتماد الجماعي: صفٌّ ⇒ حكم واحد من سبعة. '
  'داخليةٌ بلا grant لدورٍ عام — تُنادى من draft_publish_preview و'
  'review_and_publish_drafts وهما definer. الأحكام متنافية فمجموعها عدد الصفوف.';

-- ----------------------------------------------------------------------------
-- (٢) المعاينة — الرقم الذي يراه المالك **قبل** الضغط. `stable` ⇒ لا تكتب.
-- ----------------------------------------------------------------------------
create or replace function public.draft_publish_preview(p_locale text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_counts jsonb;
  v_machine jsonb;
begin
  if not public.i18n_admin_allowed() then
    raise exception 'النشر متاح للمشرف وحده' using hint = 'forbidden';
  end if;

  if not exists (
    select 1 from public.locales l where l.code = p_locale and not l.is_default
  ) then
    raise exception 'لغة غير مسجَّلة أو أنها لغة الأساس: %', coalesce(p_locale, 'بلا')
      using hint = 'not-found';
  end if;

  select jsonb_build_object(
           'locale',         p_locale,
           -- عدد المسودات كلها = eligible + الثلاثة المستثنَاة
           'drafts',         count(*) filter (where p.verdict in
                               ('approve', 'machine', 'blank', 'stale')),
           'eligible',       count(*) filter (where p.verdict = 'approve'),
           'skippedMachine', count(*) filter (where p.verdict = 'machine'),
           'skippedBlank',   count(*) filter (where p.verdict = 'blank'),
           'skippedStale',   count(*) filter (where p.verdict = 'stale'),
           'alreadyReviewed',count(*) filter (where p.verdict in
                               ('reviewed', 'reviewed-stale')),
           'staleReviewed',  count(*) filter (where p.verdict = 'reviewed-stale'),
           'blankReviewed',  count(*) filter (where p.verdict = 'reviewed-blank'))
    into v_counts
  from public.draft_publish_plan(p_locale) p;

  /*
   * قائمة الصفوف الآلية **بنصّها** — لا عددها وحده.
   *
   * قرارُ المالك كان «استثنِها وسجّل ملاحظة»، و«الملاحظة» التي تنفعه هي أن
   * يرى الستة فيقرّر كلاً منها بيده. والقائمة تصل من هنا لا من طابور الشاشة
   * لأن الطابور **مرشَّحٌ ومقصوصٌ عند ١٥٠ صفاً**، فقد لا تكون فيه أصلاً.
   * والسقف ٥٠: نافذةُ قرارٍ لا تصدير بيانات.
   */
  select coalesce(jsonb_agg(x.item order by x.namespace, x.key), '[]'::jsonb)
    into v_machine
  from (
    select tr.namespace,
           tr.key,
           jsonb_build_object(
             'id', tr.id, 'namespace', tr.namespace,
             'key', tr.key, 'value', tr.value) as item
    from public.translations tr
    join public.draft_publish_plan(p_locale) p on p.id = tr.id
    where p.verdict = 'machine'
    order by tr.namespace, tr.key
    limit 50
  ) x;

  return v_counts
    || jsonb_build_object('machineRows', v_machine, 'ran', false);
end;
$$;

comment on function public.draft_publish_preview(text) is
  'حصيلة ما سيفعله review_and_publish_drafts قبل تنفيذه — بنفس المصنِّف حرفياً. '
  'stable بلا DML بقصد: الشاشة تناديها في كل تصيير، ومعاملُ dry-run على دالةٍ '
  'تكتب كان يعني أن فتح الصفحة قد ينشر. وتُرجع الصفوف الآلية بنصّها ليقرّرها '
  'المالك بيده (قراره 2026-08-17: «استثنِها حالياً وسجّل ملاحظة»).';

-- ----------------------------------------------------------------------------
-- (٣) الفعل — اعتمادٌ باسم المالك، ثم النشر بالمسار القائم وحده.
-- ----------------------------------------------------------------------------
create or replace function public.review_and_publish_drafts(p_locale text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before    jsonb;
  v_ids       uuid[];
  v_approved  integer := 0;
  v_published integer := 0;
begin
  -- الحارس والتحقق من اللغة داخلها — موضعٌ واحد للقاعدة لا اثنان
  v_before := public.draft_publish_preview(p_locale);

  select coalesce(array_agg(p.id), '{}'::uuid[])
    into v_ids
  from public.draft_publish_plan(p_locale) p
  where p.verdict = 'approve';

  /*
   * الاعتماد: الحالة وصاحبُها فقط.
   *
   * ⚠ **ولا `source_text` يُكتب هنا** — بخلاف `review_translation`. الصفوف
   * المعتمَدة أُثبت سلفاً أن بصمتها تطابق الأصل الحيّ، فلا شيء يُتبنّى؛ وكتابةُ
   * الأصل على صفٍّ لم يُثبَت تطابقُه هي بعينها العيب الذي تشرحه الترويسة.
   */
  update public.translations tr
     set status     = 'reviewed',
         updated_by = public.current_actor()
   where tr.id = any (v_ids);
  get diagnostics v_approved = row_count;

  -- المسار الوحيد للنشر — بلا تعديل، فتصليبُه غداً يسري على الزرَّين
  v_published := public.publish_locale(p_locale);

  return v_before
    || jsonb_build_object(
         'ran',       true,
         'approved',  v_approved,
         'published', v_published);
end;
$$;

comment on function public.review_and_publish_drafts(text) is
  'زرّ «انشر كل المسودات»: يعتمد كل مسودةٍ بشريةٍ غير فارغةٍ مطابقةٍ لأصلها الحيّ '
  'باسم المشرف، ثم ينشر باستدعاء publish_locale. يستثني الآليّ (قرار المالك) '
  'والفارغ و**القديم**. لا يكتب حالةً خارج هذا المسار، ولا يلمس public.locales — '
  'فنشرُ النصوص لا يُظهر لغةً للزوار (enabled_locales ترشِّح بـ enabled وحده).';

-- ----------------------------------------------------------------------------
-- (٤) الصلاحيات — نفس صلاحيات `publish_locale` المقيسة، لا أوسع
--     (postgres | service_role | authenticated — و`anon` لا شيء).
--     والحارس داخل الدالة هو الحاجز الحقيقي: كل متعهد `authenticated` (د-٢٠).
-- ----------------------------------------------------------------------------
revoke all on function public.draft_publish_plan(text)          from public, anon, authenticated;
revoke all on function public.draft_publish_preview(text)       from public, anon, authenticated;
revoke all on function public.review_and_publish_drafts(text)   from public, anon, authenticated;

-- المصنِّف داخليٌّ: `service_role` وحده (والمالك ضمناً) — لا `authenticated`
grant execute on function public.draft_publish_plan(text)        to service_role;
grant execute on function public.draft_publish_preview(text)     to authenticated, service_role;
grant execute on function public.review_and_publish_drafts(text) to authenticated, service_role;

-- ============================================================================
-- (٥) تصحيحان في مسودتَي `en` — يبقيان **مسودةً**، ينشرهما الزرّ إن ضغطه المالك
--
-- المطابقة **بالمفتاح** لا بالنص: `i18n_apply` تستبدل بالاسم، ومفتاحٌ خاطئ لا
-- يرمي خطأً بل **لا يفعل شيئاً**. والشرط `status = 'draft'` يمنع دهسَ اعتمادٍ
-- بشريٍّ لو سبق أحدٌ الهجرة إلى الصفّ.
-- ============================================================================
do $$
declare
  v_n integer;
begin
  /*
   * (أ) 🔴 حاشيةٌ إنجليزية تُقرأ عكسَ نفسها — وهي **نصٌّ تعاقدي** قد يبني عليه
   *     عميلٌ حجّته في خلاف.
   *
   *     الأصل: «وقبل ذلك يسري الإلغاء المجاني وفق نوافذ البند ١.»
   *     المسودة: "Before that, free cancellation applies…"
   *
   *     والجدول الذي تعلّق عليه أوّلُ صفٍّ فيه «من ٢٤ إلى ١٢ ساعة»، فـ"Before
   *     that" بالإنجليزية تُقرأ **أقربَ إلى موعد الرحلة** — أي عكسُ المقصود
   *     تماماً. والجدول التوأم `…003214.note` يكتب البناءَ نفسه صريحاً
   *     ("More than 72 hours ahead, …") — فيُتبع لا يُبتكر.
   */
  update public.translations tr
     set value = 'More than 24 hours ahead, free cancellation applies under the windows in clause 1.'
   where tr.locale = 'en'
     and tr.key    = 'b0000000-0000-4000-8000-000000003213.note'
     and tr.status = 'draft';
  get diagnostics v_n = row_count;
  raise notice '  ↳ (٥-أ) حاشية الإلغاء: % صفاً', v_n;

  /*
   * (ب) واقعةٌ ساقطة من وصفٍ سيويّ: «بأربع فئات» لا وجود لها في الإنجليزية.
   *
   *     ولا عذرَ طولٍ: كانت ١٥٧ حرفاً، وأطولُ وصفٍ إنجليزيٍّ في القاعدة ١٦٣
   *     (مقيسٌ بـ `max(length(value))` على مفاتيح `meta.description`).
   *     والصياغة الجديدة **١٦٢** — داخل السقف المقيس، وبعبارة "price before
   *     you confirm" التي تستعملها أوصافٌ أخرى سلفاً فيبقى المصطلح متسقاً.
   */
  update public.translations tr
     set value = 'A private car with driver, Cairo to Sharm El Sheikh via Ahmed Hamdi Tunnel — about 500 km in six hours to your hotel door, four classes, price before you confirm.'
   where tr.locale = 'en'
     and tr.key    = '4e9a86ab-a4a6-446b-befd-ce5d3b387804.meta.description'
     and tr.status = 'draft';
  get diagnostics v_n = row_count;
  raise notice '  ↳ (٥-ب) وصف شرم الشيخ: % صفاً', v_n;
end;
$$;
