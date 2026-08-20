-- ============================================================================
-- 0146_hand_written_is_not_machine.sql
-- المسوداتُ الأربعُ والخمسون التي لم يُنشرها الزرّ — **والعيبُ في التصنيف.**
--
-- ══════════════════════════════════════════════════════════════════════════
--  التشخيص، مقيساً على القاعدة الحيّة (2026-08-20، D-58)
-- ══════════════════════════════════════════════════════════════════════════
--
--   select coalesce(provider,'(null)'), count(*) from public.translations
--    where locale='en' and status='draft' group by 1;
--     ⇒ migration-0127 **٤٣** · mymemory **٦** · migration-0125 **٣**
--       · migration-0129 **٢**   (المجموع ٥٤)
--
--   select verdict, count(*) from public.draft_publish_plan('en') group by 1;
--     ⇒ machine **٥٤** — أي **كلُّها**.
--
-- ضغط المالك «انشر كل المسودات» فنُشر عشرةُ صفوف وبقيت أربعةٌ وخمسون. والزرُّ
-- **لم يكذب**: نشر ما كان `reviewed` وأبلغ عن الباقي في شريط الحصيلة. لكنّ
-- السطر المسؤول في `draft_publish_plan` كان:
--
--     when coalesce(tr.provider, 'human') <> 'human' then 'machine'
--
-- أي أن **كلَّ ما ليس مكتوباً في شاشة المراجعة آليٌّ**. وهو حكمٌ خاطئ على
-- ثمانيةٍ وأربعين صفاً كتبها بشرٌ بيده **داخل ملفّ هجرة** (نصوص `0125` و`0127`
-- و`0129` الإنجليزية)، وحكمٌ صحيحٌ على ستّةٍ أنتجها مترجمٌ آليّ.
--
-- ── وما الذي يجعل صفّاً «مكتوباً بيد»؟ ──────────────────────────────────────
--
-- 🔴 **ليس اسمُ المزوّد.** مطابقةُ `provider like 'migration-%'` قاعدةُ نصٍّ هشّة
-- يكسرها أولُ مزوّدٍ يُسمّى هكذا، وتضع القرار في يد من يختار الأسماء لا في يد
-- من يراجع. والتعريفُ الصادق أعمق من ذلك بدرجة:
--
--   **عمود `provider` يسمّي العملية التي أنتجت النصّ، لا الشخص.** فالتصنيفُ
--   يقع على **العمليات** لا على الأسماء: أهي مترجمٌ آليّ يستدعيه الخادم، أم
--   بشرٌ يكتب في شاشة المراجعة، أم بشرٌ يكتب في ملفّ هجرةٍ تُراجَع وتُكمّ؟
--
-- ولذلك يولد هنا **سجلٌّ للعمليات** (`i18n_text_origins`) لا شرطُ نصّ: صفٌّ لكل
-- عمليةٍ معروفة بأصلها ووصفها، **يُقرأ ويُراجَع في مكانٍ واحد**. وتسجيلُ عمليةٍ
-- جديدة فعلٌ واعٍ في هجرةٍ تُراجَع — لا أثرٌ جانبيٌّ لاسمٍ اختير.
--
-- 🔴 **والافتراضُ آمنٌ لا متساهل** (‏`LESSONS` النمط ٧): مزوّدٌ غيرُ مسجَّل
-- يُحكَم عليه `machine` — فما لم يُراجَع لا يُنشر تلقائياً بحال. والعطلُ الوحيد
-- الممكن هو أن يظهر نصٌّ بشريٌّ في خانة «آليّ» حتى يُسجَّل، وهو عطلٌ **مرئيّ
-- في الشاشة** لا صامتٌ في القاعدة.
--
-- ── وقرارُ المالك يبقى بحرفه ───────────────────────────────────────────────
--
-- «الآليُّ لا يُنشر بلا قراءةِ بشر» (2026-08-17) قائمٌ كما هو. ولذلك **لا
-- يُضاف المكتوبُ بيدٍ إلى زرّ اليوم**: زرُّ «انشر كل المسودات» يبقى على
-- `approve` وحده حرفاً، **ويولد زرٌّ ثانٍ مستقلٌّ** يسمّي ما سينشره وعددَه
-- ومصادرَه — فيبقى النشر فعلَ بدرٍ الواعي لا أثراً جانبياً لضغطةٍ على زرٍّ آخر.
--
-- ── والستُّ المحجوزة تخرج من عدّاد العمل المعلَّق ───────────────────────────
--
-- الستّةُ الباقية مفاتيحُها تنتهي بـ`.href`، و`0115` تمنع نشرها **بنيوياً**
-- (‏`publish_locale` ترشِّح بـ`i18n_reserved_translation_key`، والمُشغِّل
-- `translations_guard_reserved_field` يرفض أي حالةٍ غير `draft`). فهي ليست
-- «عملاً معلَّقاً» بل **بابٌ مغلقٌ بقرار**: بقاؤها في العدّاد يجعل الزرَّ يبلّغ
-- «جزئيّاً» إلى الأبد عن شيءٍ لن يُعمل أبداً.
--
--   ⇒ حكمٌ خاصٌّ بها: `reserved`، **مقدَّمٌ على كل الأحكام**. وخارج `drafts`.
--   ⚠ **عرضٌ لا كتابة**: لا صفَّ يُحذف ولا حالةَ تتغيّر — بيانات المالك محرَّمة.
--
-- 🔴 **وتقديمُ `reserved` يغلق عيباً كامناً** كان قائماً: صفٌّ محجوزٌ مزوّدُه
-- `human` وبصمتُه مطابقة كان يأخذ `approve`، فيحاول `review_and_publish_drafts`
-- رفعَه إلى `reviewed` ⇒ **يرفع المُشغِّلُ استثناءً فتنهار الدفعة كلُّها**. ولم
-- يقع لأن الستّةَ صادف أن مزوّدها آليّ — أي أن الحاجز كان مصادفةً لا تصميماً.
--
-- ══════════════════════════════════════════════════════════════════════════
--  ما يتغيّر — وما لا يتغيّر
-- ══════════════════════════════════════════════════════════════════════════
--
--   | الشيء | قبل | بعد |
--   |---|---|---|
--   | `draft_publish_plan` | ٥ أحكام | ٧: + `authored` + `reserved` |
--   | زرّ «انشر كل المسودات» | ينشر `approve` | **كما هو حرفاً** |
--   | المكتوبُ بيدٍ في هجرة | `machine` (لا زرَّ له) | `authored` ⇐ زرٌّ ثانٍ |
--   | الستُّ المحجوزة | `machine` وفي `drafts` | `reserved` وخارج `drafts` |
--   | مزوّدٌ مجهول | `machine` | `machine` (بالسجلّ لا بالصدفة) |
--
-- ⚠ **ولا `drop` لدالةٍ قائمة ولا معاملٌ يُضاف إلى توقيعٍ قائم** — الثلاثة
--   المعدَّلة تُعاد بـ`create or replace` بتوقيعها حرفاً، والزرُّ الثاني **دالةٌ
--   باسمٍ جديد**. فلا تحميلَ ثانٍ (‏`42725`) ولا منحةٌ تعود افتراضيةً بعد
--   `drop` — وهما سابقتا `0139` و`0140` في هذا الأسبوع نفسه.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (١) سجلُّ العمليات المُنتِجة للنصّ — **التعريفُ في مكانٍ واحدٍ يُقرأ ويُراجَع**
-- ----------------------------------------------------------------------------
create table if not exists public.i18n_text_origins (
  provider   text primary key,
  origin     text not null check (origin in ('human', 'authored', 'machine')),
  label      text not null check (btrim(label) <> ''),
  note       text,
  created_at timestamptz not null default now()
);

comment on table public.i18n_text_origins is
  'سجلُّ العمليات التي تُنتج نصَّ ترجمة، وأصلُ كلٍّ منها: human = بشرٌ في شاشة المراجعة · authored = بشرٌ في ملفّ هجرة · machine = مترجمٌ آليّ. مفتاحه قيمةُ translations.provider. ⚠ ومزوّدٌ غيرُ مسجَّلٍ هنا يُعامَل machine بحكم i18n_provider_origin — الافتراضُ الآمن (LESSONS النمط ٧).';
comment on column public.i18n_text_origins.origin is
  'أصلُ النصّ: human · authored · machine. وهو ما يقرّر أيُّ زرٍّ يجوز أن ينشره.';
comment on column public.i18n_text_origins.label is
  'اسمُ العملية بالعربية كما تعرضه شاشةُ اللغات — فالمالك يقرأ «هجرة 0127» لا «migration-0127».';

alter table public.i18n_text_origins enable row level security;

-- ولا سياسةَ واحدة بقصد: الطريقُ الوحيد إلى هذا الجدول دوالُّ `security definer`
-- أدناه — تماماً كجدول `translations` نفسه (دفاعٌ في العمق منذ `0018`).

-- القاعدة ١٦: `revoke` صريحٌ — ومنه TRUNCATE **وهي لا تخضع لـRLS إطلاقاً**
revoke all on public.i18n_text_origins from public;
revoke all on public.i18n_text_origins from anon;
revoke all on public.i18n_text_origins from authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant select, insert, update, delete on public.i18n_text_origins to service_role';
  end if;
end;
$$;

/*
 * البذرة — العمليات المعروفة اليوم، مقيسةً من `select distinct provider`.
 *
 * `on conflict do update` لا `do nothing`: الهجرةُ قابلةٌ لإعادة التنفيذ، ولو
 * انحرف أصلُ صفٍّ بيدٍ في محرّر SQL أعادته الهجرةُ إلى ما تقوله المراجعة.
 */
insert into public.i18n_text_origins (provider, origin, label, note) values
  ('human', 'human', 'شاشة المراجعة',
   'كتبه بشرٌ في /admin/languages ثم اعتمده — وهو ما يعتمده وينشره زرُّ «انشر كل المسودات».'),
  ('migration-0125', 'authored', 'هجرة ٠١٢٥ — شروط الولاء',
   'نصوصٌ إنجليزية كتبها بشرٌ في ملفّ الهجرة نفسها، فمرّت بمراجعةِ الكود لا بمترجمٍ آليّ.'),
  ('migration-0127', 'authored', 'هجرة ٠١٢٧ — صفحات الهبوط ومصدر الطلب',
   'نصوصٌ إنجليزية كتبها بشرٌ في ملفّ الهجرة نفسها، فمرّت بمراجعةِ الكود لا بمترجمٍ آليّ.'),
  ('migration-0129', 'authored', 'هجرة ٠١٢٩ — وسمُ المصدر والوعود المدعومة',
   'نصوصٌ إنجليزية كتبها بشرٌ في ملفّ الهجرة نفسها، فمرّت بمراجعةِ الكود لا بمترجمٍ آليّ.'),
  ('mymemory', 'machine', 'MyMemory (ترجمة آلية)',
   'مخرَجُ مزوّدِ الترجمة الآلية — لا يُنشر بلا قراءةِ بشر (قرار المالك 2026-08-17).')
on conflict (provider) do update
   set origin = excluded.origin,
       label  = excluded.label,
       note   = excluded.note;

-- ----------------------------------------------------------------------------
-- (٢) قراءةُ الأصل — موضعُ الافتراض الآمن، وهو **موضعٌ واحد**
-- ----------------------------------------------------------------------------
create or replace function public.i18n_provider_origin(p_provider text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  /*
   * أصلُ صفِّ ترجمةٍ من مزوّده. و`null` أو فراغٌ = شاشةُ المراجعة، لأن
   * `upsert_translations` تترك العمود فارغاً حين يكتب بشرٌ من الشاشة.
   *
   * 🔴 و`coalesce(..., 'machine')` هو الحارس: **ما ليس مسجَّلاً لا يُنشر
   *    تلقائياً**. حذفُه يجعل مزوّداً مجهولاً `null` فيسقط من كل الأحكام،
   *    ويصير صفُّه بلا قرارٍ إطلاقاً.
   */
  select coalesce(
           (select o.origin
              from public.i18n_text_origins o
             where o.provider = coalesce(nullif(btrim(p_provider), ''), 'human')),
           'machine')
$$;

comment on function public.i18n_provider_origin(text) is
  'أصلُ نصِّ الترجمة من مزوّده: human · authored · machine. والمجهولُ machine — افتراضٌ آمن يمنع نشر ما لم يُراجَع.';

revoke all on function public.i18n_provider_origin(text) from public;
revoke all on function public.i18n_provider_origin(text) from anon;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function public.i18n_provider_origin(text) to authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.i18n_provider_origin(text) to service_role';
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- (٣) المصنِّف — سبعةُ أحكامٍ متنافية، ومجموعُها عددُ الصفوف
--
-- ⚠ **الترتيب هو المنطق**: المحجوزُ أولاً لأنه لا يُنشر بأي طريق (‏`0115`)،
--   ثم المراجَعُ سلفاً لأنه ليس من عمل الأزرار، ثم الآليُّ لأن قرار المالك
--   يستثنيه أياً كانت بقيةُ أحواله، ثم الفارغُ والقديم لأنهما يسقطان المكتوبَ
--   بيدٍ كما يسقطان المكتوبَ في الشاشة، **ثم** المكتوبُ بيدٍ في هجرة.
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
           -- (٠) 🔴 حقلٌ محجوز: رابطٌ أو مصدرٌ أو معرّف — لا يُترجَم ولا يُنشر
           --     (D-24 · 0104 · 0115). ومقدَّمٌ على الكل لأن رفعَه إلى `reviewed`
           --     يرفع استثناء المُشغِّل فيُسقط الدفعة كلَّها.
           when public.i18n_reserved_translation_key(tr.key) then 'reserved'
           -- مراجَعٌ سلفاً: ليس من عمل هذا الزرّ، لكن publish_locale ستنشره معنا
           when tr.status = 'reviewed' then
             case
               when btrim(coalesce(tr.value, '')) = '' then 'reviewed-blank'
               when tr.source_hash is distinct from
                    public.i18n_source_hash(coalesce(c.src, tr.source_text))
                 then 'reviewed-stale'
               else 'reviewed'
             end
           -- الآليّ: قرار المالك يستثنيه أياً كانت بقية أحواله
           when o.origin = 'machine'                             then 'machine'
           when btrim(coalesce(tr.value, '')) = ''               then 'blank'
           -- الأصل الحيّ للمفتاح الخارج عن الفهرس هو المخزَّن نفسه — وهو عين
           -- `coalesce` في `translation_queue`، فوسمُ الشاشة ووسمُ الزرّ واحد.
           when tr.source_hash is distinct from
                public.i18n_source_hash(coalesce(c.src, tr.source_text))
             then 'stale'
           -- مكتوبٌ بيدٍ في ملفّ هجرة: بشريٌّ، لكن **لزرّه هو** لا لزرّ الشاشة
           when o.origin = 'authored'                            then 'authored'
           else 'approve'
         end as verdict
  from public.translations tr
  left join corpus c on c.ns = tr.namespace and c.k = tr.key
  cross join lateral (select public.i18n_provider_origin(tr.provider) as origin) o
  where tr.locale = p_locale
    and tr.status in ('draft', 'reviewed');
$$;

comment on function public.draft_publish_plan(text) is
  'حكمُ كلِّ مسودةٍ/مراجَعٍ في لغة: reserved · reviewed(-stale/-blank) · machine · blank · stale · authored · approve. الأحكام متنافيةٌ فمجموعها عددُ الصفوف. و`approve` وحده لزرّ «انشر كل المسودات»، و`authored` وحده لزرّ «انشر ما كُتب بيد».';

-- ----------------------------------------------------------------------------
-- (٤) المعاينة — الأرقامُ والقوائمُ التي تطبعها الشاشة قبل أي ضغطة
-- ----------------------------------------------------------------------------
create or replace function public.draft_publish_preview(p_locale text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_counts   jsonb;
  v_machine  jsonb;
  v_authored jsonb;
  v_reserved jsonb;
  v_sources  jsonb;
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

  /*
   * ⚠ **`drafts` = المسوداتُ التي لها عملٌ ممكن** — و`reserved` خارجَها عمداً.
   *   عدُّها فيها يقول «عملٌ معلَّق» عن صفوفٍ يمنع `0115` نشرها بنيوياً، فيبقى
   *   الفارقُ بين `drafts` و`eligible` قائماً إلى الأبد بلا فعلٍ يغلقه.
   */
  select jsonb_build_object(
           'locale',          p_locale,
           'drafts',          count(*) filter (where p.verdict in
                                ('approve', 'authored', 'machine', 'blank', 'stale')),
           'eligible',        count(*) filter (where p.verdict = 'approve'),
           'eligibleAuthored',count(*) filter (where p.verdict = 'authored'),
           'skippedMachine',  count(*) filter (where p.verdict = 'machine'),
           'skippedBlank',    count(*) filter (where p.verdict = 'blank'),
           'skippedStale',    count(*) filter (where p.verdict = 'stale'),
           'skippedReserved', count(*) filter (where p.verdict = 'reserved'),
           'alreadyReviewed', count(*) filter (where p.verdict in
                                ('reviewed', 'reviewed-stale')),
           'staleReviewed',   count(*) filter (where p.verdict = 'reviewed-stale'),
           'blankReviewed',   count(*) filter (where p.verdict = 'reviewed-blank'))
    into v_counts
  from public.draft_publish_plan(p_locale) p;

  /*
   * قائمة الصفوف الآلية **بنصّها** — لا عددها وحده.
   *
   * قرارُ المالك كان «استثنِها وسجّل ملاحظة»، و«الملاحظة» التي تنفعه هي أن
   * يرى الصفوف فيقرّر كلاً منها بيده. والقائمة تصل من هنا لا من طابور الشاشة
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

  -- ونظيرتُها للمكتوب بيد: الزرُّ الثاني **يسمّي ما سينشره** لا عددَه وحده
  select coalesce(jsonb_agg(x.item order by x.namespace, x.key), '[]'::jsonb)
    into v_authored
  from (
    select tr.namespace,
           tr.key,
           jsonb_build_object(
             'id', tr.id, 'namespace', tr.namespace,
             'key', tr.key, 'value', tr.value) as item
    from public.translations tr
    join public.draft_publish_plan(p_locale) p on p.id = tr.id
    where p.verdict = 'authored'
    order by tr.namespace, tr.key
    limit 50
  ) x;

  -- ومصادرُه مجموعةً: سطرٌ واحد يقول «٤٣ من هجرة ٠١٢٧» — وهو ما يُقرأ قبل الضغط
  select coalesce(jsonb_agg(s.item order by s.n desc, s.label), '[]'::jsonb)
    into v_sources
  from (
    select coalesce(o.label, coalesce(tr.provider, 'human')) as label,
           count(*)::int as n,
           jsonb_build_object(
             'provider', coalesce(tr.provider, 'human'),
             'label',    coalesce(o.label, coalesce(tr.provider, 'human')),
             'count',    count(*)::int) as item
    from public.translations tr
    join public.draft_publish_plan(p_locale) p on p.id = tr.id
    left join public.i18n_text_origins o
      on o.provider = coalesce(nullif(btrim(tr.provider), ''), 'human')
    where p.verdict = 'authored'
    group by 1, coalesce(tr.provider, 'human')
  ) s;

  /*
   * والمحجوزة **بلا سقف** — بخلاف القائمتين أعلاه.
   *
   * السقفُ هناك يحمي من تصديرِ طابورٍ كامل؛ وهنا لا محلَّ له: المحجوزُ محصورٌ
   * بنيوياً في الحقول غير النصّية (`href` · `src` · `poster` · `video` ·
   * `icon` · `anchor` · `_k` · `style`)، والمُشغِّلُ يمنعه من مغادرة `draft`
   * فلا ينمو. وقياسُ اليوم: **ستّةُ صفوفٍ في القاعدة كلها**. والشاشةُ تستعمل
   * هذه القائمة لتُخرجها من عدّاد «يحتاج عملاً» — وقائمةٌ مقصوصة تُخرج بعضها
   * فتُبقي عدّاداً كاذباً بعددٍ أصغر، وهو أخبثُ من عدّادٍ كاذبٍ بعددٍ كامل.
   */
  select coalesce(jsonb_agg(x.item order by x.namespace, x.key), '[]'::jsonb)
    into v_reserved
  from (
    select tr.namespace,
           tr.key,
           jsonb_build_object(
             'id', tr.id, 'namespace', tr.namespace,
             'key', tr.key, 'value', tr.value,
             'field', regexp_replace(tr.key, '^.*\.', '')) as item
    from public.translations tr
    join public.draft_publish_plan(p_locale) p on p.id = tr.id
    where p.verdict = 'reserved'
    order by tr.namespace, tr.key
  ) x;

  return v_counts
    || jsonb_build_object(
         'machineRows',      v_machine,
         'authoredRows',     v_authored,
         'authoredSources',  v_sources,
         'reservedRows',     v_reserved,
         'ran',              false);
end;
$$;

comment on function public.draft_publish_preview(text) is
  'ما سيفعله زرّا النشر لو ضُغطا الآن: أعدادُ كل حكمٍ وقوائمُ الآليّ والمكتوبِ بيدٍ والمحجوز. قراءةٌ محضة (`stable` بلا DML) فتصييرُ الصفحة لا يستطيع أن ينشر شيئاً. و`drafts` لا تعدّ المحجوز — فهو ليس عملاً معلَّقاً.';

-- ----------------------------------------------------------------------------
-- (٥) الزرّ الثاني — **دالةٌ باسمٍ جديد، لا معاملٌ يُضاف إلى القائمة**
--
-- 🔴 إضافةُ معاملٍ إلى `review_and_publish_drafts(text)` كانت ستُنشئ تحميلاً
--    ثانياً (‏`42725` على كل نداءٍ من PostgREST)، و`drop` قبلها كان سيُعيد
--    منحةَ Supabase الافتراضية إلى `anon`. فاسمٌ جديدٌ يتفادى الاثنين معاً.
--
-- ⚠ **وهي نسخةٌ من جسم `review_and_publish_drafts` بحكمٍ واحدٍ مختلف** —
--    والتفويضُ الحقيقي حيث يقع الخطر: النشرُ نفسه يمرّ بـ`publish_locale`
--    وحدها في الاثنين، فتصليبُها غداً يسري على الزرَّين معاً.
-- ----------------------------------------------------------------------------
create or replace function public.review_and_publish_authored(p_locale text)
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
  where p.verdict = 'authored';

  -- الحالة وصاحبُها فقط — **ولا `source_text` يُكتب** (الشرح في `0100`):
  -- الصفوفُ المعتمَدة أُثبت سلفاً أن بصمتها تطابق الأصل الحيّ.
  update public.translations tr
     set status     = 'reviewed',
         updated_by = public.current_actor()
   where tr.id = any (v_ids);
  get diagnostics v_approved = row_count;

  v_published := public.publish_locale(p_locale);

  return v_before
    || jsonb_build_object(
         'ran',       true,
         'kind',      'authored',
         'approved',  v_approved,
         'published', v_published);
end;
$$;

comment on function public.review_and_publish_authored(text) is
  'زرّ «انشر ما كُتب بيدٍ في الهجرات»: يعتمد صفوفَ الحكم `authored` باسم الفاعل ثم ينشرها بـ`publish_locale`. مستقلٌّ عن «انشر كل المسودات» عمداً — قرارُ المالك أن يبقى النشرُ فعلاً واعياً لكل صنف.';

revoke all on function public.review_and_publish_authored(text) from public;
revoke all on function public.review_and_publish_authored(text) from anon;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function public.review_and_publish_authored(text) to authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.review_and_publish_authored(text) to service_role';
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- (٦) الفحصُ الذاتي — يقرأ من الكتالوج الحيّ ومن القاعدة، لا من هذا الملف
-- ----------------------------------------------------------------------------
do $$
declare
  v_n    integer;
  v_txt  text;
begin
  -- (٦-١) المنحُ كما كانت لأخواتها: `draft_publish_plan` لا يبلغه `authenticated`
  if exists (
    select 1 from pg_proc p
    where p.oid = 'public.draft_publish_plan(text)'::regprocedure
      and has_function_privilege('authenticated', p.oid, 'execute')
  ) then
    raise exception '(٦-١) draft_publish_plan صارت ممنوحةً لـauthenticated — أوسعُ من publish_locale';
  end if;

  if not has_function_privilege('authenticated',
        'public.review_and_publish_authored(text)'::regprocedure, 'execute') then
    raise exception '(٦-٢) الزرّ الثاني غيرُ ممنوحٍ لـauthenticated — الشاشة تناديه بهوية المشرف';
  end if;
  if has_function_privilege('anon',
        'public.review_and_publish_authored(text)'::regprocedure, 'execute') then
    raise exception '(٦-٣) 🔴 الزرّ الثاني ممنوحٌ لـanon';
  end if;

  -- (٦-٤) والجدولُ الجديد لا يبلغه دورٌ عام
  if has_table_privilege('anon', 'public.i18n_text_origins', 'select')
     or has_table_privilege('authenticated', 'public.i18n_text_origins', 'select')
     or has_table_privilege('anon', 'public.i18n_text_origins', 'truncate') then
    raise exception '(٦-٤) سجلُّ العمليات مقروءٌ لدورٍ عام — القاعدة ١٦';
  end if;

  -- (٦-٥) الافتراضُ الآمن حيّ: مزوّدٌ مجهولٌ = آليّ
  if public.i18n_provider_origin('gpt-9-does-not-exist') <> 'machine' then
    raise exception '(٦-٥) 🔴 مزوّدٌ مجهولٌ لا يُحكَم عليه machine — الافتراضُ غيرُ آمن';
  end if;
  if public.i18n_provider_origin(null) <> 'human'
     or public.i18n_provider_origin('  ') <> 'human' then
    raise exception '(٦-٦) الفراغُ لا يُقرأ «شاشة المراجعة» — شاشةُ المراجعة تترك العمود فارغاً';
  end if;
  if public.i18n_provider_origin('migration-0127') <> 'authored'
     or public.i18n_provider_origin('mymemory') <> 'machine' then
    raise exception '(٦-٧) السجلُّ لا يُقرأ: 0127 «%» · mymemory «%»',
      public.i18n_provider_origin('migration-0127'), public.i18n_provider_origin('mymemory');
  end if;

  -- (٦-٨) والحصيلةُ على بيانات المالك: لا صفَّ بلا حكم، ولا حكمَ `machine` باقٍ
  --       لمزوّدٍ مسجَّلٍ `authored`. (تُقرأ ولا تُكتب.)
  select count(*) into v_n
  from public.translations tr
  join public.draft_publish_plan('en') p on p.id = tr.id
  where public.i18n_provider_origin(tr.provider) = 'authored'
    and p.verdict = 'machine';
  if v_n <> 0 then
    raise exception '(٦-٨) % صفاً مكتوباً بيدٍ ما زال يُحكَم عليه machine', v_n;
  end if;

  select string_agg(x.verdict || '=' || x.n::text, ' · ' order by x.verdict)
    into v_txt
  from (select p.verdict, count(*) as n from public.draft_publish_plan('en') p group by 1) x;
  raise notice '✔ 0146 — أحكامُ en الآن: %', coalesce(v_txt, 'بلا صفوف');
end;
$$;
