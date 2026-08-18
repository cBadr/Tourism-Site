-- ============================================================================
-- 0113_partner_agreement.sql
-- اتفاقية المتعهد: وثيقةٌ في القاعدة، منسوخةٌ بإصدارات، وقبولٌ يُسجَّل بصفّ
-- ============================================================================
--
-- ── لماذا هذا الملف موجود ─────────────────────────────────────────────────
--
-- قرّر المالك (2026-08-18) بناء نظام خصومات: متعهدٌ ينسحب بعد قبول رحلةٍ يُخصم
-- منه مبلغٌ يُضبط لكل سبب، **بسقفٍ هو مستحق تلك الرحلة**. وقبل أن يقع أولُ خصمٍ
-- حقيقي يلزم أن يكون المتعهد قد **وافق سلفاً**.
--
-- والمقيس قبل هذه الهجرة، لا المفترض:
--
--   select column_name from information_schema.columns
--    where table_schema='public' and table_name='subcontractors';
--   ⇒ ١٤ عموداً، **ولا عمود قبولٍ واحد**. لا تاريخ، ولا إصدار، ولا فاعل.
--
--   select kind, slug from public.pages where slug='terms';
--   ⇒ static/terms — وهي عقدُ **العميل** لا عقدُ المتعهد
--     («اقرأها قبل تأكيد رحلتك» · «التزامات العميل» · «سياسة الاسترداد»).
--
-- ⇒ فالخصمُ اليوم يُدافَع عنه بـ«الاتفاق يقول»، وهي جملةٌ لا تُقدَّم لمحكمة.
--    وبعد هذه الهجرة يُدافَع عنه بـ**صفٍّ فيه الإصدار والنصّ ولحظة القبول**.
--
-- ── القرارات الخمسة التي تحكم البناء ───────────────────────────────────────
--
-- (١) **جدولٌ مستقل لا صفحةٌ في `pages`.** بانى الصفحات سطحٌ تسويقيٌّ عام:
--     `i18n_corpus_rows()` تسحب **كل** حقلٍ نصيّ من `sections` لكل صفحةٍ
--     `published` إلى طابور الترجمة (قُرئت حيّةً — D-58)، فوضعُ الاتفاقية هناك
--     يُدخل نصَّ عقدٍ قانوني في مجموعة الترجمة الإنجليزية (٨٧١ صفاً منشوراً)
--     ويُظهرها في خريطة الموقع. والاتفاقية ليست صفحةً للزوّار.
--     **وهي مع ذلك «صفحةٌ في القاعدة تُحرَّر من اللوحة» كما اشترط المالك** —
--     الشرط كان ألّا تكون ملفَّ HTML، لا أن تكون في `pages` بعينه.
--
-- (٢) **الإصدار المنشور لا يُعدَّل أبداً.** التحرير يصنع **مسودةً جديدة**،
--     ونشرُها يؤرشف السابقة. فالنسخة التي وقّع عليها الشريك تبقى مقروءةً
--     بحرفها. وخصمٌ يُدافَع عنه بنصّ اليوم أمام شريكٍ قَبِل نصَّ العام الماضي
--     لا يُدافَع عنه أصلاً.
--
-- (٣) **سجلُّ القبول مُلحَقٌ فقط** — بنفس آلة 0110 حرفياً (`append_only_guard`
--     + `append_only_truncate_guard` + سحبُ المنح): سجلٌّ يستطيع المُدَّعي أن
--     يكتبه لا يُقدَّم دليلاً.
--
-- (٤) 🔴 **المهلةُ تُقاس لكل شريكٍ من لحظة بلوغه الالتزام، لا من لحظة النشر.**
--     deadline = greatest(published_at, subcontractors.created_at) + grace_days
--     وسببان، كلاهما مقيس:
--       • حمزة الغمري شريكٌ **معتمدٌ يعمل** (صفٌّ واحد، معتمَد، قائمتا أسعار
--         معتمدتان). قطعُ العروض عنه لحظة تطبيق الهجرة عقوبةٌ على قرارٍ لم
--         يُبلَّغ به. فمهلتُه تبدأ من النشر ⇒ أيامٌ يقرأ فيها ويقبل.
--       • ولو قِيست المهلة من **النشر وحده** لانكسرت خمسُ مجموعات اختبار
--         (`dispatch` · `coverage` · `crew` · `failed_trip` · `finance`) بعد
--         انقضائها: فيكستراتها تُنشئ متعهدين بـ`created_at = now()` ولا تَقبل
--         شيئاً، فتخرج من `dispatch_pool` **بعد انقضاء المهلة من اليوم** —
--         قنبلةٌ موقوتة في ملفّاتٍ يملكها وكلاء آخرون ولا يجوز تحريرها
--         (`STANDING-ORDERS §٢هـ`). وبالقياس من `created_at` تبقى خضراء دائماً،
--         **ويبقى الادّعاء قابلاً للإثبات**: مجموعتي تُرجِع `created_at` إلى
--         الوراء فتنقضي المهلة فعلاً ويخرج الشريك من الحوض.
--     ⚠ **وثمنُه مُعلَن**: الشريكُ الجديد يأخذ مهلةً أيضاً (من إنشاء صفّه)
--        يستقبل فيها عروضاً قبل أن يقبل. وهذا **قرار منتَجٍ يملكه المالك**:
--        من أراد أن يعضّ الحاجز فوراً على كل من أُنشئ بعد النشر فليقُل،
--        والثمن خمسُ مجموعاتٍ تحمرّ وملفّاتُها بيد غيري اليوم.
--
-- (٥) **الحاجز يقع حيث تقع الأهلية أصلاً، لا في تعريفٍ ثانٍ**: `dispatch_pool`
--     (فلا يُنشأ العرض) · `portal_offers` (فلا يبقى زرٌّ يفشل دائماً — نفس ما
--     فعله 0027 بسقف الدين حرفياً) · `accept_offer` (فلا يُلتزم بلا اتفاق).
--     **و`manual_assign` لا تُمسّ بقصد**: الإسناد اليدوي قرارُ إنسانٍ يرى ما لا
--     تراه الدالة، ونظيرُه في سقف الدين مخرَجٌ صريح (`manual_assign_over_limit`).
--
-- المرجع: D-19 (العميل لا يعرف الشريك ولا التكلفة ولا الهامش)
--         · D-20 (`authenticated` ليس مشرفاً أبداً) · D-48 (كل نداء معاملة)
--         · D-58 (التعريف الحيّ لا ملف الهجرة) · القاعدة الذهبية ١٦ (المنح هو
--         الحارس · RLS لا تغطّي TRUNCATE) · 0110 (آلة «مُلحَقٌ فقط»)
--         · 0027/0028 (سقف الدين، وسابقةُ الإسقاط من `portal_offers`)
--         · 0051 (كتالوج أسباب الفشل و`mark_booking_failed`)
--         · 0105 (صفحة الخصوصية تُفصح بما يصل المتعهد — والاتفاقية تطابقها)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (٠) الشروط المسبقة — لا اتفاقيةَ بلا شريكٍ ولا بثٍّ ولا آلةِ «مُلحَقٌ فقط»
-- ----------------------------------------------------------------------------
do $$
declare
  v_missing text;
begin
  select string_agg(t, '، ') into v_missing
  from (values ('public.subcontractors'), ('public.trip_offers'),
               ('public.dispatches'), ('public.bookings'),
               ('public.profiles')) x(t)
  where to_regclass(x.t) is null;

  if v_missing is not null then
    raise exception '0113: جداول مفقودة: % — هجرات سابقة غير مطبَّقة', v_missing;
  end if;

  if to_regprocedure('public.append_only_guard()') is null
     or to_regprocedure('public.append_only_truncate_guard()') is null then
    raise exception
      '0113: آلة «مُلحَقٌ فقط» (0110) غير مطبَّقة — وسجلُّ القبول بلا حارسٍ ليس دليلاً';
  end if;

  if to_regprocedure('public.is_admin()') is null
     or to_regprocedure('public.current_subcontractor_id()') is null
     or to_regprocedure('public.current_actor()') is null then
    raise exception '0113: دوال الهوية (is_admin · current_subcontractor_id · current_actor) مفقودة';
  end if;

  if to_regprocedure('public.dispatch_pool(uuid, integer)') is null
     or to_regprocedure('public.portal_offers()') is null
     or to_regprocedure('public.accept_offer(uuid)') is null then
    raise exception '0113: دوال البث المستهدَفة مفقودة — لا موضعَ لتركيب الحاجز';
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- (١) مقبضا اللوحة — صفٌّ واحد، بنمط `dispatch_settings`/`trip_settings`
--
--   `gate_enabled` : هل يمنع عدمُ القبول وصولَ العروض؟ (قرار المالك: نعم)
--   `grace_days`   : مهلةُ القبول — تُنسخ إلى الإصدار لحظة نشره، فيبقى ما
--                    سرى على إصدارٍ ماضٍ مقروءاً ولو تغيّر المقبض بعده.
-- ----------------------------------------------------------------------------
create table if not exists public.partner_agreement_settings (
  id           boolean primary key default true,
  gate_enabled boolean not null default true,
  grace_days   integer not null default 14,
  updated_at   timestamptz not null default now(),
  constraint partner_agreement_settings_singleton check (id),
  constraint partner_agreement_settings_grace_chk check (grace_days between 0 and 180)
);

insert into public.partner_agreement_settings (id) values (true)
on conflict (id) do nothing;

comment on table public.partner_agreement_settings is
  'مقبضا اتفاقية المتعهد: تشغيلُ الحاجز، ومهلةُ القبول بالأيام. صفٌّ واحد. المهلةُ تُنسخ إلى الإصدار عند نشره فلا يتغيّر بأثرٍ رجعي ما سرى على إصدارٍ ماضٍ.';

-- ----------------------------------------------------------------------------
-- (٢) الإصدارات — الوثيقة نفسها، ومنشورُها لا يُعدَّل
--
-- `clauses` مصفوفةُ كائنات: {"k": مفتاح ثابت, "title": عنوان, "body": نصّ}.
-- ولماذا `jsonb` لا جدولُ بنودٍ مستقل؟ لأن **الوحدة القانونية هي الوثيقة لا
-- البند**: صفٌّ واحد يُجمَّد ويُبصَم، فلا وصلةٌ تنحرف عن لقطتها يوم يُعدَّل بندٌ
-- في جدولٍ آخر. و«النسخة كما قَبِلها» تصير قراءةَ صفٍّ واحد لا إعادةَ تركيب.
-- ----------------------------------------------------------------------------
create table if not exists public.partner_agreement_versions (
  id           uuid primary key default gen_random_uuid(),
  version      integer not null,
  title        text not null,
  preamble     text not null default '',
  clauses      jsonb not null default '[]'::jsonb,
  status       text not null default 'draft',
  change_note  text,
  grace_days   integer,
  doc_hash     text,
  published_at timestamptz,
  published_by uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  created_by   uuid references public.profiles (id) on delete set null,
  updated_at   timestamptz not null default now(),
  constraint partner_agreement_versions_version_uk unique (version),
  constraint partner_agreement_versions_version_chk check (version >= 1),
  constraint partner_agreement_versions_status_chk
    check (status = any (array['draft', 'published', 'archived'])),
  constraint partner_agreement_versions_title_chk
    check (length(btrim(title)) between 2 and 200),
  constraint partner_agreement_versions_clauses_chk
    check (jsonb_typeof(clauses) = 'array'),
  constraint partner_agreement_versions_grace_chk
    check (grace_days is null or grace_days between 0 and 180),
  -- المنشورُ والمؤرشف لا يوجدان بلا لحظةِ نشرٍ ولا بصمة: هما ما يُحتجّ به
  constraint partner_agreement_versions_published_chk
    check (status = 'draft' or (published_at is not null and doc_hash is not null
           and grace_days is not null))
);

-- منشورٌ واحدٌ لا أكثر — الفهرسُ هو الحَكَم لا انضباطُ الدالة
create unique index if not exists partner_agreement_versions_one_published
  on public.partner_agreement_versions ((status)) where status = 'published';

create index if not exists partner_agreement_versions_status_idx
  on public.partner_agreement_versions (status, version desc);

comment on table public.partner_agreement_versions is
  'إصدارات اتفاقية المتعهد. المنشورُ **لا يُعدَّل ولا يُحذف** (حارسُ صفّ): التحريرُ مسودةٌ جديدة، ونشرُها يؤرشف السابقة ويُبطل القبولات عليها. `doc_hash` بصمةُ النصّ لحظة النشر — تُنسخ إلى صفّ القبول فيُكشف أيُّ مساسٍ لاحق.';

-- ----------------------------------------------------------------------------
-- (٣) سجلُّ القبول — مُلحَقٌ فقط، وبلقطةٍ تكفي وحدها
--
-- 🔒 لماذا تُنسخ `subcontractor_name` و`agreement_version` و`doc_hash` في الصفّ
--    وهي موجودةٌ خلف مفتاحين أجنبيين؟ لأن الصفّ **دليل**: يُقرأ بعد سنتين وقد
--    غيّر الشريك اسم شركته، وقد تغيّر ترقيمُ الإصدارات. واللقطةُ نفسها منطقُ
--    `booking_failures.reason_label` حرفياً (0051).
--
-- والمفتاح إلى الشريك `on delete set null` لا `cascade`: الحذفُ التعاقبي كان
-- يصطدم بحارس «مُلحَقٌ فقط» فيمنع حذفَ الشريك أصلاً، والحارسُ يستثني **تفريغَ
-- المفتاح وحده** (`tg_argv[2]` في 0110) — فالسجلُّ يبقى والاسمُ المنسوخ يبقى.
-- ----------------------------------------------------------------------------
create table if not exists public.partner_agreement_acceptances (
  id                 uuid primary key default gen_random_uuid(),
  subcontractor_id   uuid references public.subcontractors (id) on delete set null,
  subcontractor_name text not null,
  agreement_id       uuid not null references public.partner_agreement_versions (id)
                       on delete restrict,
  agreement_version  integer not null,
  doc_hash           text not null,
  signed_name        text not null,
  actor_kind         text not null default 'partner',
  accepted_by        uuid references public.profiles (id) on delete set null,
  accepted_at        timestamptz not null default now(),
  note               text,
  constraint partner_agreement_acceptances_actor_chk
    check (actor_kind = any (array['partner', 'admin'])),
  constraint partner_agreement_acceptances_signed_chk
    check (length(btrim(signed_name)) between 2 and 160),
  constraint partner_agreement_acceptances_name_chk
    check (length(btrim(subcontractor_name)) between 1 and 200)
);

create unique index if not exists partner_agreement_acceptances_once
  on public.partner_agreement_acceptances (subcontractor_id, agreement_id)
  where subcontractor_id is not null;

create index if not exists partner_agreement_acceptances_sub_idx
  on public.partner_agreement_acceptances (subcontractor_id, accepted_at desc);

comment on table public.partner_agreement_acceptances is
  'سجلُّ قبول المتعهدين للاتفاقية — **مُلحَقٌ فقط** (0110). كلُّ صفّ لقطةٌ مكتفية: اسمُ الشركة والإصدارُ وبصمةُ النصّ ولحظةُ القبول والفاعل. وهو ما يُدافَع به عن الخصم بدل «الاتفاق يقول».';

-- حارسا «مُلحَقٌ فقط»: لا تعديل، ولا حذفَ إطلاقاً، ولا تفريغ.
-- (`''` في الوسيطين الأول والثاني ⇒ لا سياسةَ احتفاظٍ تسمح بحذفٍ أبداً)
drop trigger if exists partner_agreement_acceptances_append_only
  on public.partner_agreement_acceptances;
create trigger partner_agreement_acceptances_append_only
  before update or delete on public.partner_agreement_acceptances
  for each row execute function public.append_only_guard('', '', 'subcontractor_id,accepted_by');

drop trigger if exists partner_agreement_acceptances_no_truncate
  on public.partner_agreement_acceptances;
create trigger partner_agreement_acceptances_no_truncate
  before truncate on public.partner_agreement_acceptances
  for each statement execute function public.append_only_truncate_guard();

-- ----------------------------------------------------------------------------
-- (٤) حارسُ الإصدارات — الترقيمُ يُسنَد، والمنشورُ يُجمَّد
-- ----------------------------------------------------------------------------
create or replace function public.partner_agreement_versions_guard()
returns trigger
language plpgsql
security definer
set search_path to ''
as $fn$
declare
  v_next integer;
begin
  if tg_op = 'INSERT' then
    -- الترقيم من القاعدة لا من الواجهة: رقمان متساويان يسقطان على الفهرس
    if new.version is null or new.version <= 0 then
      select coalesce(max(v.version), 0) + 1 into v_next
      from public.partner_agreement_versions v;
      new.version := v_next;
    end if;
    -- لا يولَد منشوراً: النشرُ فعلٌ له دالته وحارسها
    if new.status <> 'draft' then
      raise exception
        'الإصدار يُنشأ مسودةً ثم يُنشر بـ`publish_partner_agreement` — لا يُولَد منشوراً'
        using hint = 'agreement-insert-draft-only';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception
        'الإصدار «%» حالته «%» — المنشورُ والمؤرشف لا يُحذفان: عليهما قبولاتٌ يُحتجّ بها',
        old.version, old.status
        using hint = 'agreement-immutable';
    end if;
    return old;
  end if;

  -- UPDATE
  if old.status = 'draft' then
    -- المسودة تُحرَّر بحرية، إلا الترقيم: تغييرُه يفصل القبولات عن أصلها غداً
    if new.version is distinct from old.version then
      raise exception 'رقمُ الإصدار لا يُغيَّر' using hint = 'agreement-immutable';
    end if;
    new.updated_at := now();
    return new;
  end if;

  -- منشورٌ أو مؤرشف: لا يتغيّر فيه إلا **الحالة** (النشر يؤرشف السابق)
  if new.id              is distinct from old.id
     or new.version      is distinct from old.version
     or new.title        is distinct from old.title
     or new.preamble     is distinct from old.preamble
     or new.clauses      is distinct from old.clauses
     or new.change_note  is distinct from old.change_note
     or new.grace_days   is distinct from old.grace_days
     or new.doc_hash     is distinct from old.doc_hash
     or new.published_at is distinct from old.published_at
     or new.published_by is distinct from old.published_by
     or new.created_at   is distinct from old.created_at then
    raise exception
      'الإصدار «%» منشورٌ سلفاً ولا يُعدَّل نصُّه — التحريرُ مسودةٌ جديدة تُنشر، وتبقى هذه مقروءةً كما قَبِلها من قَبِلها',
      old.version
      using hint = 'agreement-immutable';
  end if;

  if new.status = 'draft' then
    raise exception 'إصدارٌ منشورٌ أو مؤرشف لا يعود مسودة' using hint = 'agreement-immutable';
  end if;

  new.updated_at := now();
  return new;
end;
$fn$;

comment on function public.partner_agreement_versions_guard() is
  'يُسنِد رقمَ الإصدار عند الإنشاء، ويمنع ولادةَ إصدارٍ منشور، ويُجمّد نصَّ المنشور والمؤرشف (لا تعديل ولا حذف) — فالنسخة التي قَبِلها الشريك تبقى بحرفها.';

drop trigger if exists partner_agreement_versions_guard on public.partner_agreement_versions;
create trigger partner_agreement_versions_guard
  before insert or update or delete on public.partner_agreement_versions
  for each row execute function public.partner_agreement_versions_guard();

drop trigger if exists audit_partner_agreement_versions on public.partner_agreement_versions;
create trigger audit_partner_agreement_versions
  after insert or update or delete on public.partner_agreement_versions
  for each row execute function public.log_audit('title');

drop trigger if exists audit_partner_agreement_acceptances on public.partner_agreement_acceptances;
create trigger audit_partner_agreement_acceptances
  after insert on public.partner_agreement_acceptances
  for each row execute function public.log_audit('subcontractor_name');

-- ----------------------------------------------------------------------------
-- (٥) البصمة — نصُّ الوثيقة كله في سلسلةٍ واحدة، ثم `md5`
--
-- ليست حمايةً تشفيرية بل **كاشفُ مساس**: لو عُدِّل صفُّ إصدارٍ منشور بتعطيل
-- المُشغّل (المخرَجُ الوحيد، ويتطلّب ملكيةَ الجدول) لاختلفت البصمةُ عن المنسوخة
-- في صفوف القبول، فيُقال ذلك بدل أن يمرّ صامتاً.
-- ----------------------------------------------------------------------------
create or replace function public.partner_agreement_hash(
  p_title text, p_preamble text, p_clauses jsonb
) returns text
language sql
immutable
set search_path to ''
as $fn$
  select md5(
    coalesce(btrim(p_title), '') || E'\n' ||
    coalesce(btrim(p_preamble), '') || E'\n' ||
    coalesce(
      (select string_agg(
                coalesce(btrim(c.value ->> 'title'), '') || E'\n' ||
                coalesce(btrim(c.value ->> 'body'), ''),
                E'\n---\n' order by c.ord)
       from jsonb_array_elements(
              case when jsonb_typeof(p_clauses) = 'array' then p_clauses else '[]'::jsonb end
            ) with ordinality as c(value, ord)),
      '')
  );
$fn$;

comment on function public.partner_agreement_hash(text, text, jsonb) is
  'بصمةُ نصّ الاتفاقية (md5 على العنوان والديباجة والبنود بترتيبها). كاشفُ مساسٍ لا حمايةٌ تشفيرية: تُنسخ في صفّ القبول فيُكشف اختلافُ النصّ عمّا قُبِل.';

-- ----------------------------------------------------------------------------
-- (٦) القراءة — الإعدادات، والإصدار الساري، وحالةُ شريكٍ بعينه
-- ----------------------------------------------------------------------------
create or replace function public.partner_agreement_config()
returns table (gate_enabled boolean, grace_days integer)
language sql
stable
security definer
set search_path to ''
as $fn$
  select coalesce(s.gate_enabled, true), coalesce(s.grace_days, 14)
  from (select true) one
  left join public.partner_agreement_settings s on s.id = true;
$fn$;

create or replace function public.partner_agreement_current()
returns table (
  id           uuid,
  version      integer,
  title        text,
  preamble     text,
  clauses      jsonb,
  doc_hash     text,
  change_note  text,
  grace_days   integer,
  published_at timestamptz
)
language sql
stable
security definer
set search_path to ''
as $fn$
  select v.id, v.version, v.title, v.preamble, v.clauses, v.doc_hash,
         v.change_note, v.grace_days, v.published_at
  from public.partner_agreement_versions v
  where v.status = 'published'
  limit 1;
$fn$;

comment on function public.partner_agreement_current() is
  'الإصدار الساري وحده (منشورٌ واحدٌ بحكم فهرسٍ فريد جزئي). لا صفَّ ⇒ لا اتفاقيةَ مطلوبة بعد، والحاجز خامل.';

/**
 * حالةُ شريكٍ بعينه أمام الاتفاقية — **مصدرُ الحقيقة الوحيد**، تقرؤه
 * `dispatch_pool` و`portal_offers` و`accept_offer` والبورتال واللوحة معاً.
 *
 * ولماذا واحدةٌ لا خمس؟ لأن خمسةَ تعريفاتٍ لـ«قَبِل» تفترق يوماً، فيُبثّ لمن
 * لا يستطيع القبول أو يُمنع من قَبِل — وهو النمط ٢ في `LESSONS.md` بعينه.
 *
 * `ok` تعني «لا يمنعه هذا الحاجزُ من العمل»، وهي **أوسع** من `accepted`:
 * الخامل والمُمهَل كلاهما `ok` وليسا `accepted`.
 */
create or replace function public.partner_agreement_status(p_sub uuid)
returns table (
  required          boolean,
  ok                boolean,
  accepted          boolean,
  version_id        uuid,
  version           integer,
  accepted_version  integer,
  accepted_at       timestamptz,
  deadline          timestamptz,
  in_grace          boolean
)
language plpgsql
stable
security definer
set search_path to ''
as $fn$
declare
  v_cur   record;
  v_cfg   record;
  v_sub   record;
  v_acc   record;
begin
  select * into v_cfg from public.partner_agreement_config();
  select * into v_cur from public.partner_agreement_current();

  required         := v_cur.id is not null and coalesce(v_cfg.gate_enabled, true);
  version_id       := v_cur.id;
  version          := v_cur.version;
  accepted         := false;
  accepted_version := null;
  accepted_at      := null;
  deadline         := null;
  in_grace         := false;

  -- لا إصدارَ منشور ⇒ لا شيء يُقبل، ولا شيء يُمنع
  if v_cur.id is null then
    ok := true;
    return next;
    return;
  end if;

  select a.agreement_version, a.accepted_at into v_acc
  from public.partner_agreement_acceptances a
  where a.subcontractor_id = p_sub
    and a.agreement_id     = v_cur.id
  order by a.accepted_at asc
  limit 1;

  if found then
    accepted         := true;
    accepted_version := v_acc.agreement_version;
    accepted_at      := v_acc.accepted_at;
    ok               := true;
    return next;
    return;
  end if;

  -- لم يقبل الإصدار الساري: تبقى المهلة، وتُقاس **لكل شريك من لحظة بلوغه
  -- الالتزام** — أي من نشر الإصدار أو من إنشاء صفّه، أيُّهما أحدث (القرار ٤).
  select s.created_at into v_sub from public.subcontractors s where s.id = p_sub;

  if v_sub.created_at is not null then
    deadline := greatest(v_cur.published_at, v_sub.created_at)
                  + make_interval(days => coalesce(v_cur.grace_days, v_cfg.grace_days, 14));
    in_grace := now() < deadline;
  end if;

  -- الحاجز مطفأ من اللوحة ⇒ يبقى البندُ ظاهراً للشريك ولا يمنع شيئاً
  ok := (not coalesce(v_cfg.gate_enabled, true)) or coalesce(in_grace, false);
  return next;
end;
$fn$;

comment on function public.partner_agreement_status(uuid) is
  'حالةُ شريكٍ أمام الاتفاقية السارية — المصدر الوحيد الذي يقرؤه البثُّ والبورتالُ واللوحة. `ok` أوسع من `accepted`: تشمل خمولَ الحاجز وسريانَ المهلة. والمهلة تُقاس من greatest(نشر الإصدار، إنشاء صفّ الشريك).';

/** الغلاف البولياني — هذا وحده ما تناديه دوالُّ البثّ، فلا شرطَ يُعاد كتابته */
create or replace function public.partner_agreement_ok(p_sub uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $fn$
  select coalesce((select st.ok from public.partner_agreement_status(p_sub) st), true);
$fn$;

comment on function public.partner_agreement_ok(uuid) is
  'هل يمرّ الشريك من حاجز الاتفاقية؟ غلافٌ بولياني على `partner_agreement_status` — تناديه `dispatch_pool` و`portal_offers` و`accept_offer` فلا يوجد شرطُ أهليةٍ ثانٍ ينحرف.';

-- ----------------------------------------------------------------------------
-- (٧) القبول — بلا وسيطِ شريك أصلاً، فالانتحال ممنوعٌ بنيوياً لا بفحص
--
-- 🔒 لا تأخذ الدالة `p_subcontractor_id` بحال: النطاق يُثبَّت داخلها من
--    `current_subcontractor_id()`. وهذا هو نفس المبدأ الذي تقوم عليه
--    `portal_balance()` — ما لا يوجد في التوقيع لا يُنتحَل بخطأٍ في الواجهة.
-- ----------------------------------------------------------------------------
create or replace function public.accept_partner_agreement(
  p_agreement_id uuid,
  p_signed_name  text
)
returns table (
  agreement_id      uuid,
  agreement_version integer,
  accepted_at       timestamptz,
  already            boolean
)
language plpgsql
security definer
set search_path to ''
as $fn$
declare
  v_sub    uuid;
  v_row    record;
  v_cur    record;
  v_name   text;
  v_signed text;
  v_exist  record;
begin
  v_sub := public.current_subcontractor_id();
  if v_sub is null then
    raise exception 'قبول الاتفاقية متاح لحساب متعهد فقط' using hint = 'forbidden';
  end if;

  select * into v_cur from public.partner_agreement_current();
  if v_cur.id is null then
    raise exception 'لا توجد اتفاقية سارية الآن' using hint = 'agreement-missing';
  end if;

  -- 🔒 القبولُ على الإصدار الساري وحده: لو أرسلت الشاشةُ معرّفاً قديماً (تبويبٌ
  --    مفتوحٌ منذ أمس ونُشر إصدارٌ جديد بينهما) لسُجّل قبولٌ على نصٍّ لم يعد
  --    سارياً — وهو بالضبط ما يُبطل الاحتجاج به لاحقاً.
  if p_agreement_id is null or p_agreement_id <> v_cur.id then
    raise exception
      'نُشرت نسخةٌ أحدث من الاتفاقية — أعد تحميل الصفحة واقرأ النسخة السارية قبل القبول'
      using hint = 'agreement-stale';
  end if;

  select s.company_name into v_name from public.subcontractors s where s.id = v_sub;

  v_signed := nullif(btrim(coalesce(p_signed_name, '')), '');
  if v_signed is null or length(v_signed) < 2 then
    raise exception 'اكتب اسمك الكامل بصفتك الموقّع عن الشركة' using hint = 'signed-name-required';
  end if;
  v_signed := left(v_signed, 160);

  begin
    insert into public.partner_agreement_acceptances (
      subcontractor_id, subcontractor_name, agreement_id, agreement_version,
      doc_hash, signed_name, actor_kind, accepted_by
    )
    values (
      v_sub, coalesce(nullif(btrim(v_name), ''), '؟'), v_cur.id, v_cur.version,
      v_cur.doc_hash, v_signed, 'partner', public.current_actor()
    )
    returning partner_agreement_acceptances.agreement_id,
              partner_agreement_acceptances.agreement_version,
              partner_agreement_acceptances.accepted_at
      into agreement_id, agreement_version, accepted_at;
    already := false;
  exception
    when unique_violation then
      -- نداءٌ مكرر (ضغطةٌ مزدوجة): النتيجةُ نفسها لا خطأ — والسجلُّ مُلحَقٌ فقط
      -- فلا صفَّ ثانٍ ولا كتابةَ فوق الأول (نفس نبرة `reject_offer`)
      select a.agreement_id, a.agreement_version, a.accepted_at into v_exist
      from public.partner_agreement_acceptances a
      where a.subcontractor_id = v_sub and a.agreement_id = v_cur.id
      limit 1;
      agreement_id      := v_exist.agreement_id;
      agreement_version := v_exist.agreement_version;
      accepted_at       := v_exist.accepted_at;
      already           := true;
  end;

  return next;
end;
$fn$;

comment on function public.accept_partner_agreement(uuid, text) is
  'يسجّل قبولَ صاحبِ الجلسة للاتفاقية السارية. **بلا وسيطِ شريك بقصد** — النطاق من `current_subcontractor_id()`، فالقبولُ نيابةً عن غيره ممنوعٌ بنيوياً لا بفحص. ويرفض معرّفَ إصدارٍ غير السارية (تبويبٌ قديم).';

/**
 * ما يقرؤه البورتال — الوثيقةُ وحالةُ صاحب الجلسة في نداءٍ واحد.
 * ولا وسيطَ هنا أيضاً، ولا تُرجع شيئاً عن شريكٍ آخر.
 */
create or replace function public.portal_agreement()
returns table (
  version_id       uuid,
  version          integer,
  title            text,
  preamble         text,
  clauses          jsonb,
  change_note      text,
  published_at     timestamptz,
  required         boolean,
  ok               boolean,
  accepted         boolean,
  accepted_version integer,
  accepted_at      timestamptz,
  deadline         timestamptz,
  in_grace         boolean,
  company_name     text
)
language plpgsql
stable
security definer
set search_path to ''
as $fn$
declare
  v_sub uuid;
  v_cur record;
  v_st  record;
begin
  v_sub := public.current_subcontractor_id();
  if v_sub is null then
    raise exception 'الاتفاقية متاحة لحساب متعهد فقط' using hint = 'forbidden';
  end if;

  select * into v_cur from public.partner_agreement_current();
  select * into v_st  from public.partner_agreement_status(v_sub);

  version_id       := v_cur.id;
  version          := v_cur.version;
  title            := v_cur.title;
  preamble         := v_cur.preamble;
  clauses          := v_cur.clauses;
  change_note      := v_cur.change_note;
  published_at     := v_cur.published_at;
  required         := v_st.required;
  ok               := v_st.ok;
  accepted         := v_st.accepted;
  accepted_version := v_st.accepted_version;
  accepted_at      := v_st.accepted_at;
  deadline         := v_st.deadline;
  in_grace         := v_st.in_grace;

  select s.company_name into company_name from public.subcontractors s where s.id = v_sub;
  return next;
end;
$fn$;

-- ----------------------------------------------------------------------------
-- (٨) النشر — الفعلُ الوحيد الذي يجعل نصّاً سارياً، ويؤرشف ما قبله
-- ----------------------------------------------------------------------------
create or replace function public.publish_partner_agreement(
  p_id         uuid,
  p_grace_days integer default null
)
returns table (version integer, grace_days integer, published_at timestamptz)
language plpgsql
security definer
set search_path to ''
as $fn$
declare
  v_row  record;
  v_cfg  record;
  v_days integer;
  v_hash text;
  v_n    integer;
begin
  if not public.is_admin() then
    raise exception 'نشر الاتفاقية متاح للإدارة وحدها' using hint = 'forbidden';
  end if;

  select * into v_row from public.partner_agreement_versions v where v.id = p_id for update;
  if not found then
    raise exception 'الإصدار غير موجود' using hint = 'agreement-not-found';
  end if;
  if v_row.status <> 'draft' then
    raise exception 'هذا الإصدار حالته «%» — المسودة وحدها تُنشر', v_row.status
      using hint = 'agreement-not-draft';
  end if;

  select count(*)::integer into v_n
  from jsonb_array_elements(v_row.clauses) c
  where btrim(coalesce(c.value ->> 'title', '')) <> ''
    and btrim(coalesce(c.value ->> 'body', ''))  <> '';
  if v_n = 0 then
    raise exception 'لا تُنشر اتفاقيةٌ بلا بندٍ واحد مكتمل (عنوانٌ ونصّ)'
      using hint = 'agreement-empty';
  end if;

  select * into v_cfg from public.partner_agreement_config();
  v_days := coalesce(p_grace_days, v_cfg.grace_days, 14);
  if v_days < 0 or v_days > 180 then
    raise exception 'مهلة القبول بالأيام بين ٠ و١٨٠' using hint = 'invalid-input';
  end if;

  v_hash := public.partner_agreement_hash(v_row.title, v_row.preamble, v_row.clauses);

  -- الأرشفةُ أولاً: الفهرسُ الفريد الجزئي يمنع منشورين، فالترتيبُ ليس ذوقاً
  update public.partner_agreement_versions v
     set status = 'archived'
   where v.status = 'published';

  update public.partner_agreement_versions v
     set status       = 'published',
         published_at = now(),
         published_by = public.current_actor(),
         grace_days   = v_days,
         doc_hash     = v_hash
   where v.id = p_id;

  select v.version, v.grace_days, v.published_at into version, grace_days, published_at
  from public.partner_agreement_versions v where v.id = p_id;
  return next;
end;
$fn$;

comment on function public.publish_partner_agreement(uuid, integer) is
  'ينشر مسودةً فتصير الاتفاقية السارية، ويؤرشف السابقة، ويجمّد النصّ ببصمته ومهلته. ونشرُ إصدارٍ جديد **يُبطل القبولات على ما قبله** لأن الحالة تُقاس على الساري وحده.';

/** إنشاءُ مسودةٍ جديدة من الإصدار الساري — «تعديلُ الاتفاقية» في اللوحة */
create or replace function public.draft_partner_agreement_from_current()
returns uuid
language plpgsql
security definer
set search_path to ''
as $fn$
declare
  v_cur record;
  v_id  uuid;
  v_n   integer;
begin
  if not public.is_admin() then
    raise exception 'تحرير الاتفاقية متاح للإدارة وحدها' using hint = 'forbidden';
  end if;

  select count(*)::integer into v_n
  from public.partner_agreement_versions v where v.status = 'draft';
  if v_n > 0 then
    raise exception 'توجد مسودةٌ مفتوحة سلفاً — أكملها أو احذفها قبل إنشاء غيرها'
      using hint = 'agreement-draft-exists';
  end if;

  select * into v_cur from public.partner_agreement_current();

  insert into public.partner_agreement_versions (title, preamble, clauses, created_by)
  values (
    coalesce(v_cur.title, 'اتفاقية المتعهد'),
    coalesce(v_cur.preamble, ''),
    coalesce(v_cur.clauses, '[]'::jsonb),
    public.current_actor()
  )
  returning id into v_id;

  return v_id;
end;
$fn$;

/** سجلُّ القبول كما تقرؤه اللوحة — للإدارة وحدها */
create or replace function public.admin_agreement_acceptances(p_limit integer default 200)
returns table (
  id                 uuid,
  subcontractor_id   uuid,
  subcontractor_name text,
  agreement_version  integer,
  signed_name        text,
  actor_kind         text,
  accepted_at        timestamptz,
  doc_hash           text,
  hash_matches       boolean,
  is_current         boolean
)
language sql
stable
security definer
set search_path to ''
as $fn$
  select a.id, a.subcontractor_id, a.subcontractor_name, a.agreement_version,
         a.signed_name, a.actor_kind, a.accepted_at, a.doc_hash,
         a.doc_hash = v.doc_hash,
         v.status = 'published'
  from public.partner_agreement_acceptances a
  join public.partner_agreement_versions v on v.id = a.agreement_id
  where public.is_admin()
  order by a.accepted_at desc
  limit greatest(coalesce(p_limit, 200), 1);
$fn$;

comment on function public.admin_agreement_acceptances(integer) is
  'سجلُّ القبولات للوحة. `hash_matches` يقارن بصمةَ الصفّ ببصمة إصداره: اختلافُهما يعني أن نصَّ إصدارٍ منشور مُسّ بعد القبول (المخرَجُ الوحيد `DISABLE TRIGGER` بملكية الجدول) — ويُقال بدل أن يمرّ.';

/** حالةُ كل متعهدٍ أمام الاتفاقية — الشاشة التي يقرؤها المالك قبل أي خصم */
create or replace function public.admin_agreement_partners()
returns table (
  subcontractor_id uuid,
  company_name     text,
  status           text,
  accepted         boolean,
  accepted_version integer,
  accepted_at      timestamptz,
  deadline         timestamptz,
  in_grace         boolean,
  ok               boolean
)
language sql
stable
security definer
set search_path to ''
as $fn$
  select s.id, s.company_name, s.status,
         st.accepted, st.accepted_version, st.accepted_at, st.deadline, st.in_grace, st.ok
  from public.subcontractors s
  cross join lateral public.partner_agreement_status(s.id) st
  where public.is_admin()
  order by st.ok asc, s.company_name asc;
$fn$;

-- ----------------------------------------------------------------------------
-- (٩) تركيبُ الحاجز — في مواضع الأهلية القائمة، بلا تعريفٍ ثانٍ
--
-- الدوالُّ الثلاث أُعيدت كتابتها **من تعريفها الحيّ** (`pg_get_functiondef`،
-- D-58) بحرفها، ولم يُضف إليها إلا سطرُ الحاجز الواحد. وكلُّ تعليقٍ فيها باقٍ
-- كما كان: ما لا يُفهم سببُه يُعاد كسرُه بعد شهر.
-- ----------------------------------------------------------------------------

create or replace function public.dispatch_pool(p_booking_id uuid, p_round integer)
returns table(subcontractor_id uuid, payout numeric)
language plpgsql
stable security definer
set search_path to ''
as $function$
declare
  v_b       record;
  v_olat    numeric;
  v_olng    numeric;
  v_dlat    numeric;
  v_dlng    numeric;
  v_factor  numeric := 1;
  v_ceiling numeric;
begin
  select b.class_slug, b.trip into v_b
  from public.bookings b
  where b.id = p_booking_id;

  if not found then
    return;
  end if;

  v_olat := public.jsonb_number(v_b.trip, 'originLat', null);
  v_olng := public.jsonb_number(v_b.trip, 'originLng', null);
  v_dlat := public.jsonb_number(v_b.trip, 'destLat',   null);
  v_dlng := public.jsonb_number(v_b.trip, 'destLng',   null);

  -- حجز قديم بلا إحداثيات: لا تغطية تُحسب، فيمضي إلى الطابور اليدوي
  if v_olat is null or v_olng is null or v_dlat is null or v_dlng is null then
    return;
  end if;

  -- التكلفة المطبَّقة تضربها معامل الذهاب والعودة كما يضرب السعر تماماً (0011)،
  -- وإلا قارنّا تكلفة اتجاه واحد بسقف رحلة كاملة فدخل من لا يستحق.
  if coalesce(v_b.trip ->> 'roundTrip', 'false') in ('true', 't', '1') then
    select coalesce(t.round_trip_factor, 1) into v_factor
    from public.tariffs t
    join public.vehicle_classes vc on vc.id = t.class_id
    where vc.slug = v_b.class_slug;
    v_factor := coalesce(v_factor, 1);
  end if;

  v_ceiling := public.dispatch_ceiling(p_booking_id, p_round);
  if v_ceiling is null then
    return;
  end if;

  return query
  with covered as (
    select cm.subcontractor_id as sid, min(pli.cost) as cost
    from public.coverage_matches(v_olat, v_olng, v_dlat, v_dlng) cm
    join public.price_list_items pli
      on pli.price_list_id = cm.price_list_id
     and pli.class_slug    = v_b.class_slug
    group by cm.subcontractor_id
  ),
  -- الأهلية كما كانت حرفياً: معتمَد · له مركبة فعّالة من الفئة · تحت السقف
  -- ⇐ 0113: **وقَبِل اتفاقية المتعهد السارية** (أو ما زال في مهلتها، أو الحاجز
  --    مطفأ من اللوحة). والشرط نداءٌ واحد لا شرطٌ مكتوبٌ هنا، فلا ينحرف عن
  --    الذي يقرؤه البورتال و`accept_offer`.
  eligible as (
    select c.sid, round(c.cost * v_factor, 2) as payout
    from covered c
    join public.subcontractors s on s.id = c.sid and s.status = 'approved'
    where exists (
            select 1
            from public.subcontractor_vehicles v
            where v.subcontractor_id = c.sid
              and v.class_slug       = v_b.class_slug
              and v.active
          )
      and round(c.cost * v_factor, 2) <= v_ceiling
      and public.partner_agreement_ok(c.sid)
  ),
  ranked as (
    select e.sid, e.payout, public.partner_available(e.sid) as avail
    from eligible e
  )
  select r.sid, r.payout
  from ranked r
  where r.avail
     or not exists (select 1 from ranked r2 where r2.avail)   -- ← الاحتياطي
  order by 2 asc, 1 asc;
end;
$function$;

create or replace function public.portal_offers()
returns table(offer_id uuid, reference text, origin_label text, dest_label text,
              distance_km numeric, passengers integer, round_trip boolean,
              waiting_hours numeric, class_title text, pickup_at timestamptz,
              payout numeric, currency text, expires_at timestamptz, notes text)
language sql
stable security definer
set search_path to ''
as $function$
  select
    o.id,
    -- 0028: رمز المتعهد لا مرجع العميل — العامل الأول في «تابع حجزك»
    public.partner_trip_code(b.id),
    public.dispatch_public_label(b.trip ->> 'originLabel'),
    public.dispatch_public_label(b.trip ->> 'destLabel'),
    public.jsonb_number(b.trip, 'distanceKm', 0),
    coalesce(public.jsonb_number(b.trip, 'passengers', 1), 1)::integer,
    coalesce(b.trip ->> 'roundTrip', 'false') in ('true', 't', '1'),
    coalesce(public.jsonb_number(b.trip, 'waitingHours', 0), 0),
    b.class_title,
    nullif(btrim(coalesce(b.trip ->> 'pickupAt', '')), '')::timestamptz,
    o.payout,
    b.currency,
    o.expires_at,
    public.dispatch_safe_notes(b.trip ->> 'notes')
  from public.trip_offers o
  join public.bookings b   on b.id = o.booking_id
  join public.dispatches d on d.booking_id = o.booking_id
  where o.subcontractor_id = public.current_subcontractor_id()
    and public.current_subcontractor_id() is not null
    and o.status     = 'pending'
    and o.expires_at > now()
    and d.status     = 'broadcasting'
    and b.status     = 'confirmed'
    -- 0027: من بلغ سقف دينه لا يرى العرض القديم — فلا يبقى زرٌّ يفشل دائماً
    and not public.partner_over_debt_limit(o.subcontractor_id)
    -- 0113: ونفس المنطق حرفياً لمن انقضت مهلته ولم يقبل الاتفاقية — العرضُ
    --       الذي بُثّ قبل انقضاء المهلة لا يبقى زرّاً يرفضه `accept_offer`
    and public.partner_agreement_ok(o.subcontractor_id)
  order by o.expires_at asc;
$function$;

create or replace function public.accept_offer(p_offer_id uuid)
returns table(booking_id uuid, reference text, payout numeric, assigned_at timestamptz)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_sub     uuid;
  v_status  text;
  v_offer   record;
  v_d       record;
  v_b       record;
  v_company text;
  v_phone   text;
  v_cfg     record;
  v_agr     record;
  v_now     timestamptz := now();
begin
  v_sub := public.current_subcontractor_id();
  if v_sub is null then
    raise exception 'قبول العروض متاح لحساب متعهد فقط' using hint = 'forbidden';
  end if;

  -- 0052: 🔒 رؤيةُ رحلةٍ مُسنَدة ليست قبولَ عملٍ جديد. الموقوف يبقى يرى رحلاته
  -- ورصيده (قرار بدر) — ولا يكسب رحلةً بعرضٍ صدر قبل إيقافه. والشرط `approved`
  -- هو بعينه شرطُ `dispatch_pool` على الطرف الآخر، فمصدر الأهلية واحد.
  select s.status into v_status from public.subcontractors s where s.id = v_sub;
  if coalesce(v_status, '') <> 'approved' then
    raise exception 'حسابك ليس معتمداً الآن — لا يمكن قبول عروض جديدة (الحالة: «%»)',
      coalesce(v_status, '؟')
      using hint = 'partner-not-approved';
  end if;

  -- 0113: 🔒 ولا يُلتزم برحلة عميلٍ دفع قبل أن توجد اتفاقيةٌ مقبولة يُحتجّ بها.
  --       يُفحص **قبل** كل قفلٍ وكل كتابة: نداءٌ محكومُ الرفض لا يأخذ أقفالاً.
  select * into v_agr from public.partner_agreement_status(v_sub);
  if not v_agr.ok then
    raise exception
      'انقضت مهلة قبول اتفاقية المتعهد — افتح صفحة الاتفاقية في البورتال واقبل النسخة السارية ثم عد للعروض'
      using hint = 'agreement-required';
  end if;

  select o.* into v_offer from public.trip_offers o where o.id = p_offer_id;
  if not found then
    raise exception 'العرض غير موجود' using hint = 'offer-not-found';
  end if;

  -- عرض متعهد آخر: لا يُقرأ ولا يُقبل — والرسالة لا تكشف وجوده لصاحبها الحقيقي
  if v_offer.subcontractor_id is distinct from v_sub then
    raise exception 'هذا العرض ليس ضمن عروضك' using hint = 'forbidden';
  end if;

  -- (١) قفل دورة البث: كل قبول لهذا الحجز يمر من هنا، فيتسلسل القبولان حتماً
  select d.* into v_d from public.dispatches d
   where d.booking_id = v_offer.booking_id
   for update;

  if not found then
    raise exception 'دورة بث هذا الطلب غير موجودة' using hint = 'dispatch-not-found';
  end if;

  -- (٢) إعادة الفحص **بعد** القفل — لا قبل: هنا بالضبط يقف الخاسر
  if v_d.status = 'assigned' then
    raise exception 'سبقك متعهد آخر إلى هذا الطلب' using hint = 'already-assigned';
  end if;

  if v_d.status = 'cancelled' then
    raise exception 'أُغلقت دورة بث هذا الطلب' using hint = 'invalid-dispatch-status';
  end if;

  select o.* into v_offer from public.trip_offers o where o.id = p_offer_id for update;

  if v_offer.status <> 'pending' then
    if v_offer.status in ('revoked', 'accepted') then
      raise exception 'سبقك متعهد آخر إلى هذا الطلب' using hint = 'already-assigned';
    elsif v_offer.status = 'expired' then
      raise exception 'انتهت مهلة هذا العرض' using hint = 'offer-expired';
    else
      raise exception 'سبق أن رفضت هذا العرض' using hint = 'offer-closed';
    end if;
  end if;

  if v_offer.expires_at <= v_now then
    update public.trip_offers o
       set status = 'expired', responded_at = v_now
     where o.id = p_offer_id;
    raise exception 'انتهت مهلة هذا العرض' using hint = 'offer-expired';
  end if;

  select b.* into v_b from public.bookings b where b.id = v_offer.booking_id for update;

  if v_b.status = 'assigned' then
    raise exception 'سبقك متعهد آخر إلى هذا الطلب' using hint = 'already-assigned';
  elsif v_b.status <> 'confirmed' then
    raise exception 'حالة الحجز لا تسمح بالإسناد الآن («%»)', v_b.status
      using hint = 'invalid-status';
  end if;

  select s.company_name, s.phone into v_company, v_phone
  from public.subcontractors s where s.id = v_sub;

  -- (٣) الفوز — والفهرس الفريد الجزئي هو الحكم الأخير لو تخطّى أحدهم القفل
  begin
    update public.trip_offers o
       set status = 'accepted', responded_at = v_now
     where o.id = p_offer_id;
  exception
    when unique_violation then
      raise exception 'سبقك متعهد آخر إلى هذا الطلب' using hint = 'already-assigned';
  end;

  -- (٤) إغلاق الطلب أمام الباقين — «ومنع الآخرين من التفاعل معه»
  update public.trip_offers o
     set status = 'revoked', responded_at = v_now
   where o.booking_id = v_offer.booking_id
     and o.id        <> p_offer_id
     and o.status     = 'pending';

  update public.dispatches d
     set status                    = 'assigned',
         assigned_subcontractor_id = v_sub,
         assigned_at               = v_now,
         assigned_payout           = v_offer.payout,
         manual_assign             = false
   where d.booking_id = v_offer.booking_id;

  -- (٥) الحالة تنتقل عبر الحارس نفسه (bookings_guard_status) لا حوله:
  -- confirmed → assigned مسموح، وأي حالة أخرى يرفضها الحارس قبل أن نصل هنا.
  -- ⚠ bookings.subcontractor_id لا يُمس: هو لقطة **من سُعِّر على أساسه**،
  -- والمنفّذ يُسجَّل في dispatches.assigned_subcontractor_id.
  perform set_config(
    'tours.booking_note',
    'إسناد تلقائي بقبول المتعهد «' || coalesce(v_company, '؟') || '»',
    true
  );

  update public.bookings b set status = 'assigned' where b.id = v_offer.booking_id;

  select * into v_cfg from public.dispatch_config();

  perform public.queue_notification(
    'trip_assigned',
    public.dispatch_trip_payload(v_offer.booking_id, false) || jsonb_build_object(
      'offerId',          p_offer_id,
      'subcontractorId',  v_sub,
      'companyName',      v_company,
      'partnerPhone',     v_phone,
      'payout',           v_offer.payout,
      -- 0033: الهامش الحقيقي **بعد طرح الخدمات الإضافية** — إيرادُنا عن شيء
      --       ننفّذه نحن ولا يراه المتعهد، فعدّه هامشاً يطلي صفقةً تحت
      --       الأرضية باللون الأخضر (نفس علّة سقف الموجة في 0032).
      'realMargin',       round(coalesce(v_b.total, 0)
                                - coalesce((select sum(be.line_total)
                                              from public.booking_extras be
                                             where be.booking_id = v_b.id), 0)
                                - v_offer.payout, 2),
      'round',            v_offer.round,
      'maxRounds',        v_cfg.max_rounds,
      'manualAssign',     false,
      'assignedAt',       v_now
    )
  );

  booking_id  := v_offer.booking_id;
  -- 🔒 0056: رمز الرحلة لا مرجع العميل. المنادي **متعهد** بحكم الحارس أعلاه،
  --          فالمرجع هنا يعبر إلى متصفحه ولو لم تطبعه الشاشة.
  reference   := public.partner_trip_code(v_b.id);
  payout      := v_offer.payout;
  assigned_at := v_now;
  return next;
end;
$function$;

-- ----------------------------------------------------------------------------
-- (١٠) المنح — `revoke` أولاً ثم الأضيق (اتفاقية ٦ · القاعدة الذهبية ١٦)
--
-- ⚠ `TRUNCATE` لا تخضع لـRLS إطلاقاً، والمنحة هي الحارس لا السياسة.
-- ----------------------------------------------------------------------------
alter table public.partner_agreement_settings    enable row level security;
alter table public.partner_agreement_versions    enable row level security;
alter table public.partner_agreement_acceptances enable row level security;

revoke all on table public.partner_agreement_settings    from public, anon;
revoke all on table public.partner_agreement_versions    from public, anon;
revoke all on table public.partner_agreement_acceptances from public, anon, authenticated;

-- المقبضان والإصدارات: يحرّرهما المشرف من اللوحة (نمط `failure_reasons`)
grant select, insert, update on table public.partner_agreement_settings to authenticated, service_role;
grant select, insert, update, delete on table public.partner_agreement_versions to authenticated, service_role;

-- 🔒 سجلُّ القبول: **لا منحَ واحدٍ لدور المتصفح** — لا قراءةً ولا كتابة.
--    الكاتبُ الوحيد `accept_partner_agreement` (definer)، والقارئُ للوحة
--    `admin_agreement_acceptances` (definer بحارس `is_admin`)، وللشريك
--    `portal_agreement` (definer بنطاقٍ مثبَّت). فما لا يُمنح لا يُنتحَل.
grant select, insert on table public.partner_agreement_acceptances to service_role;

drop policy if exists partner_agreement_settings_select_admin on public.partner_agreement_settings;
create policy partner_agreement_settings_select_admin on public.partner_agreement_settings
  for select to authenticated using (public.is_admin());
drop policy if exists partner_agreement_settings_insert_admin on public.partner_agreement_settings;
create policy partner_agreement_settings_insert_admin on public.partner_agreement_settings
  for insert to authenticated with check (public.is_admin());
drop policy if exists partner_agreement_settings_update_admin on public.partner_agreement_settings;
create policy partner_agreement_settings_update_admin on public.partner_agreement_settings
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists partner_agreement_versions_select_admin on public.partner_agreement_versions;
create policy partner_agreement_versions_select_admin on public.partner_agreement_versions
  for select to authenticated using (public.is_admin());
drop policy if exists partner_agreement_versions_insert_admin on public.partner_agreement_versions;
create policy partner_agreement_versions_insert_admin on public.partner_agreement_versions
  for insert to authenticated with check (public.is_admin());
-- 🔒 التحرير على المسودة وحدها **في السياسة أيضاً**، لا في المُشغّل وحده:
--    حاجزان لا واحد، ولا يُنقض أحدهما بتعطيل الآخر.
drop policy if exists partner_agreement_versions_update_admin on public.partner_agreement_versions;
create policy partner_agreement_versions_update_admin on public.partner_agreement_versions
  for update to authenticated using (public.is_admin() and status = 'draft')
  with check (public.is_admin());
drop policy if exists partner_agreement_versions_delete_admin on public.partner_agreement_versions;
create policy partner_agreement_versions_delete_admin on public.partner_agreement_versions
  for delete to authenticated using (public.is_admin() and status = 'draft');

-- الدوالُّ الداخلية: لا يناديها دورُ متصفحٍ إطلاقاً
revoke all on function public.partner_agreement_versions_guard()       from public, anon, authenticated;
revoke all on function public.partner_agreement_status(uuid)           from public, anon, authenticated;
revoke all on function public.partner_agreement_ok(uuid)               from public, anon, authenticated;
revoke all on function public.partner_agreement_config()               from public, anon, authenticated;

revoke all on function public.partner_agreement_hash(text, text, jsonb) from public, anon;
grant execute on function public.partner_agreement_hash(text, text, jsonb) to authenticated, service_role;

-- الإصدار الساري: يقرؤه المشرف من اللوحة (والشريك يقرؤه عبر `portal_agreement`)
revoke all on function public.partner_agreement_current() from public, anon;
grant execute on function public.partner_agreement_current() to authenticated, service_role;

revoke all on function public.portal_agreement() from public, anon;
grant execute on function public.portal_agreement() to authenticated, service_role;

revoke all on function public.accept_partner_agreement(uuid, text) from public, anon;
grant execute on function public.accept_partner_agreement(uuid, text) to authenticated, service_role;

revoke all on function public.publish_partner_agreement(uuid, integer) from public, anon;
grant execute on function public.publish_partner_agreement(uuid, integer) to authenticated, service_role;

revoke all on function public.draft_partner_agreement_from_current() from public, anon;
grant execute on function public.draft_partner_agreement_from_current() to authenticated, service_role;

revoke all on function public.admin_agreement_acceptances(integer) from public, anon;
grant execute on function public.admin_agreement_acceptances(integer) to authenticated, service_role;

revoke all on function public.admin_agreement_partners() from public, anon;
grant execute on function public.admin_agreement_partners() to authenticated, service_role;

-- ولا تفريغَ لسجلٍّ مُلحَقٍ فقط، ولا تعديلَ ولا حذفَ بمفتاح الخدمة
revoke update, delete, truncate on public.partner_agreement_acceptances from service_role;
revoke truncate on public.partner_agreement_versions from service_role, authenticated;
revoke truncate on public.partner_agreement_settings from service_role, authenticated;

-- ============================================================================
-- (١١) النصّ — الإصدار الأول، مبنيٌّ على ما يفعله هذا النظام فعلاً
-- ============================================================================
--
-- 🔴 **حدٌّ يُقال ولا يُخفى**: هذا النصُّ صيغ من قراءة الكود والقاعدة — من
--    `dispatch_pool` و`accept_offer` و`portal_trips` و`failure_reasons` و
--    `mark_booking_failed` و`record_partner_settlement` و`price_lists` وصفحتَي
--    الشروط والخصوصية المنشورتين. **ولم يصغه محامٍ.** والتعاقد مع متعهدٍ في
--    مصر له أثرٌ قانوني حقيقي (تصنيفُ العلاقة · شرطُ عدم التجاوز · الخصم من
--    المستحق). **فيُراجَع من محامٍ مصري قبل أول استعمالٍ حقيقي**، وقبل أن
--    يُبنى عليه أولُ خصم.
--
-- والبنودُ التي تحتاج قرارَ المالك قبل المراجعة القانونية — لأنها **تجارية لا
-- هندسية** — موسومةٌ في تقرير هذه الجبهة، وأهمُّها: مدةُ عدم التجاوز (١٢ شهراً)
-- ونسبةُ ما يُستحق عند خرقها، ودوريةُ التسوية (أسبوعياً)، ومهلةُ الإنهاء
-- (٣٠ يوماً)، وعتبةُ الانسحاب (٦ ساعات)، والاعتمادُ التلقائي (٢٤ ساعة).
--
-- ⚠ **والنصُّ يُحرَّر من اللوحة لا من هذا الملف.** ما هنا بذرةٌ تُزرع مرةً واحدة
--    (`where not exists`)، وأيُّ تعديلٍ بعدها يقع في `/admin/partner-agreement`
--    فيصير إصداراً جديداً يُعاد قبوله — وإعادةُ تشغيل هذه الهجرة لا تعيده.
-- ----------------------------------------------------------------------------
do $$
declare
  v_id   uuid;
  v_hash text;
  v_days integer;
begin
  if exists (select 1 from public.partner_agreement_versions) then
    raise notice '0113 · البذرة متروكة: يوجد إصدارٌ سلفاً — النصّ يُحرَّر من اللوحة لا من الهجرة';
    return;
  end if;

  select s.grace_days into v_days from public.partner_agreement_settings s where s.id = true;
  v_days := coalesce(v_days, 14);

  insert into public.partner_agreement_versions (title, preamble, clauses)
  values (
    'اتفاقية المتعهد — شروط التعاقد على تنفيذ رحلات المنصة',
    'هذه الاتفاقية بين المنصة، مالكة الموقع ومشغّلته، وبين المتعهد صاحب الحساب على بوابة المتعهدين. وهي تحكم كل رحلة تُسنَد إلى المتعهد عبر المنصة اعتباراً من لحظة قبوله لها.'
    || E'\n\n'
    || 'وقبولُ المتعهد يقع إلكترونياً من داخل بوابته: يُسجَّل رقمُ الإصدار المقبول ولحظةُ القبول والاسمُ الذي وقّع به وحسابُ الدخول الذي قَبِل منه، ويبقى نصُّ الإصدار المقبول محفوظاً بحرفه ما دامت العلاقة قائمة وبعد انتهائها. والمنصة تحتجّ بهذا السجلّ، والمتعهد يستطيع قراءته في أي وقت من صفحة الاتفاقية في بوابته.'
    || E'\n\n'
    || 'والمقصود بـ«الرحلة» في هذه الاتفاقية: طلبُ نقلٍ بريٍّ داخل جمهورية مصر العربية أنشأه عميلٌ لدى المنصة وأُسند إلى المتعهد لتنفيذه بمركبته وسائقه. والمقصود بـ«المستحق»: المبلغُ الذي يستحقه المتعهد عن تنفيذ الرحلة كما هو مبيَّن في البند الرابع.',
    $doc$[
  {
    "k": "c01",
    "title": "١) صفة المتعهد: متعاقد مستقل لا موظف",
    "body": "المتعهد متعاقد مستقل يعمل لحسابه الخاص، وليس موظفاً لدى المنصة ولا عاملاً لديها ولا وكيلاً عنها. ولا تنشأ بهذه الاتفاقية علاقةُ عملٍ ولا شراكةٌ ولا مشروعٌ مشترك بين الطرفين.\n\nويترتب على ذلك، صراحةً ولا يُفهم منه غيره:\n\n— المتعهد ينفّذ الرحلات بمركباته هو وسائقيه هو، ويتحمّل وحده أجورهم وتأميناتهم وكل التزام قانوني تجاههم. والسائقون تابعون له وحده ولا صفة لهم لدى المنصة.\n\n— المتعهد حرٌّ في قبول أي عرض رحلة أو رفضه، وحرٌّ في العمل لحسابه ولحساب غير المنصة، ولا تفرض عليه المنصة عدد ساعات ولا مواعيد حضور ولا حدّاً أدنى من الرحلات.\n\n— لا يستحق المتعهد ولا أيٌّ من سائقيه أو تابعيه أجراً ثابتاً ولا إجازةً ولا مكافأةَ نهاية خدمة ولا أيَّ حق من حقوق العاملين قِبَل المنصة.\n\n— المتعهد مسؤول وحده عن التزاماته الضريبية وعن قيده وترخيصه لدى الجهات المختصة، وعن إصدار ما يلزم من مستندات عن مستحقاته.\n\n— ولا يقدّم المتعهد نفسه للعميل ولا للغير على أنه المنصة أو موظفٌ لديها، ولا يستعمل اسمها التجاري أو علامتها إلا بإذن كتابي منها."
  },
  {
    "k": "c02",
    "title": "٢) كيف تصل الرحلة إلى المتعهد",
    "body": "بعد تأكيد حجز العميل تبثّ المنصة الرحلة إلى المتعهدين المؤهَّلين لها. والتأهّل شروطه مقروءة من النظام نفسه: أن يكون حساب المتعهد معتمَداً، وأن يغطّي مسارَ الرحلة بقائمة أسعار معتمَدة تشمل فئة المركبة المطلوبة، وأن تكون لديه مركبة نشطة من تلك الفئة، وأن يكون مستحقُّه المحسوب في حدود سقف الرحلة، وألّا يكون متجاوزاً حدَّ المديونية المقرَّر، وأن يكون قابلاً لاتفاقية المتعهد السارية.\n\nويصل العرض إلى المتعهد عبر قنوات التنبيه التي ربطها بحسابه، وله مهلةٌ محددة يظهر انتهاؤها في العرض نفسه. وقبولُ العرض يقع من داخل البوابة، وأولُ من يقبل هو من تُسنَد إليه الرحلة؛ فإذا سبقه غيره أُغلق العرض تلقائياً ولا شيء عليه.\n\nوعدم قبول العرض أو تركه حتى تنتهي مهلته لا يرتّب على المتعهد أيَّ التزام ولا أيَّ خصم. والالتزامُ ينشأ بالقبول وحده."
  },
  {
    "k": "c03",
    "title": "٣) التسعير: قائمة أسعار المتعهد",
    "body": "يضع المتعهد أسعاره في قوائم أسعار يقدّمها من بوابته، لكل قائمة نطاقُ انطلاقٍ ووجهةٍ وأسعارٌ لكل فئة مركبة. ولا تُحتسب القائمة في التسعير إلا بعد اعتمادها من المنصة، وأيُّ تعديل على قائمة معتمَدة يعيدها إلى المراجعة قبل أن تعمل من جديد.\n\nوالرقم الذي يكتبه المتعهد هو **تكلفته هو عن الاتجاه الواحد** — أي ما يستحقه عن تنفيذ الرحلة — وليس السعر الذي يدفعه العميل. والمنصة تضيف هامشها فوق هذه التكلفة وتعرض على العميل السعر النهائي وحده.\n\nوإذا غطّى المسارَ أكثر من متعهد فالعرض يُحتسب على أقلّهم تكلفةً في تلك الفئة. وللرحلة ذهاباً وعوداً معاملٌ معلن يضرب التكلفة كما يضرب السعر.\n\nويقرّ المتعهد بأن الأسعار التي يقدّمها تشمل المركبة والسائق والوقود، وأنها نهائية لا يُضاف إليها شيء عن الرحلة المتفق عليها إلا ما نصّت عليه هذه الاتفاقية أو ما توافق عليه المنصة كتابةً قبل التنفيذ."
  },
  {
    "k": "c04",
    "title": "٤) المستحق والتسوية والدفع",
    "body": "يستحق المتعهد عن كل رحلة نفّذها المبلغَ المثبَّت في العرض الذي قَبِله، لا ما تغيّر في قوائمه بعد ذلك. والمبلغ يظهر له في العرض قبل القبول وفي صفحة الرحلة بعده.\n\nويُقيَّد المستحق لحسابه **عند اعتماد المنصة لاكتمال الرحلة**، لا عند طلب المتعهد اعتمادَها ولا عند انتهاء موعدها. وتفصيل الاعتماد في البند السابع.\n\nوالحساب بين الطرفين حسابٌ جارٍ في اتجاهين: ما تستحقه المنصة على المتعهد (كالمبالغ التي يحصّلها نقداً من العميل لحسابها، والخصومات المقرَّرة وفق البند الثامن) يُقاصّ بما يستحقه المتعهد عليها. وصافي الحساب في أي لحظة معروضٌ للمتعهد في بوابته، ومعه كشفُ حركةٍ بكل بنوده.\n\nوتُسدَّد المستحقات الصافية للمتعهد **أسبوعياً**، عن الرحلات التي اعتُمد اكتمالها قبل نهاية الأسبوع السابق، إلى الحساب البنكي أو المحفظة التي سجّلها المتعهد لدى المنصة، وبإيصالٍ يُقيَّد في كشفه.\n\nوإذا بلغت مديونية المتعهد قِبَل المنصة الحدَّ المقرَّر في النظام توقّفت عنه العروض الجديدة ووُقف صرفُ المستحقات حتى تسوية الفارق. والحدُّ معلَنٌ للمتعهد في بوابته، ولا يُطبَّق بأثر رجعي على رحلةٍ قَبِلها قبل بلوغه.\n\nولا تلتزم المنصة بأداء أي مستحق عن رحلةٍ لم تُنفَّذ، أو نُفِّذت بغير ما اتُّفق عليه، أو ثبت أنها لم تقع أصلاً."
  },
  {
    "k": "c05",
    "title": "٥) القبول والانسحاب بعد القبول",
    "body": "بقبول العرض يلتزم المتعهد بتنفيذ الرحلة في موعدها بمركبةٍ من الفئة المتفق عليها وسائقٍ مؤهَّل من سجلّه.\n\nوإذا اضطُر المتعهد إلى الانسحاب بعد القبول فعليه إبلاغ المنصة **فوراً وقبل موعد التحرك بأطول مدة ممكنة**، عبر قنوات التواصل المعتمدة، مع بيان السبب. وتصنّف المنصة السبب وفق كتالوج أسباب معلن (عطل مركبة · تأخّر فادح · عدم حضور سائق · عدم حضور العميل · ظرف قاهر · قرار إداري)، ولكل سبب أثرٌ مالي معلوم مسبقاً: لا شيء، أو أداءُ المستحق كاملاً، أو خصم.\n\nوبعد الانسحاب تعيد المنصة الرحلة إلى دورة بثٍّ جديدة إذا كان الوقت المتبقي قبل التحرك **ست ساعات أو أكثر**، وتنتقل إلى الإسناد اليدوي إذا قلّ عن ذلك. وهذه العتبة مقبضٌ في لوحة المنصة، وتغييرها يسري على ما يقع بعده لا على رحلةٍ قائمة.\n\nوالانسحاب لظرف قاهر — كإغلاق طريق أو حادث أو حالة جوية استثنائية أو أمر جهة رسمية — لا يترتب عليه خصم، ويثبته المتعهد بما يتيسّر له. والانسحاب المتكرر بلا سببٍ مقبول يُعدّ إخلالاً جسيماً يجيز الإنهاء وفق البند الخامس عشر."
  },
  {
    "k": "c06",
    "title": "٦) تنفيذ الرحلة",
    "body": "يلتزم المتعهد بأن تكون المركبة المنفِّذة من الفئة المحجوزة أو أعلى منها بلا فرق سعر، نظيفةً وصالحةً للسير ومزوَّدةً بتكييف عامل، وأن يقودها سائق يحمل رخصة قيادة سارية من الفئة المناسبة ويعرف مسار الرحلة.\n\nويسجّل المتعهد في نظام المنصة، قبل موعد التحرك، **المركبة والسائق المخصَّصين للرحلة** من سجلَّيه لدى المنصة. ولا يُقبل تسجيل سائقٍ أو مركبةٍ من خارج سجلّه.\n\nويلتزم بالحضور في نقطة الانطلاق في الموعد المتفق عليه، وبفترات الانتظار المجانية المعلنة للعميل (خمس عشرة دقيقة داخل المدينة · ثلاثون دقيقة بين المحافظات · ستون دقيقة لاستقبال المطار تُحسب من الهبوط الفعلي)، وبإبلاغ المنصة فوراً بأي طارئ أثناء التنفيذ.\n\nولا يجوز للمتعهد أن يحمّل العميل أي مبلغ لم توافق عليه المنصة كتابةً، ولا أن يعرض عليه خدمةً أو سعراً خارج المنصة، ولا أن يغيّر مسار الرحلة أو موعدها بالاتفاق المباشر مع العميل. وما يقع من ذلك يقع على مسؤولية المتعهد وحده ولا تلتزم به المنصة.\n\nوما يُسدَّد فعلياً من رسوم طرق أو مواقف أو معديات أو تصاريح أثناء الرحلة يُعامَل وفق ما هو معلن للعميل، ويُثبَّت في تأكيد الرحلة."
  },
  {
    "k": "c07",
    "title": "٧) اكتمال الرحلة واعتمادها",
    "body": "بعد وصول العميل يطلب المتعهد من بوابته اعتماد اكتمال الرحلة. وتراجع المنصة الطلب فتعتمده أو ترفضه، **ويُعتمد تلقائياً إذا مضت أربع وعشرون ساعة على الطلب بلا اعتراض من المنصة**. والمدة مقبضٌ في لوحة المنصة، وما يسري على رحلةٍ بعينها هو ما كان قائماً وقت طلب اعتمادها.\n\n🔴 **والأثر المالي يقع عند الاعتماد لا عند الطلب**: قبل الاعتماد لا يُقيَّد مستحق، وطلبُ الاعتماد وحده لا يُنشئ ديناً على المنصة.\n\nولمنصة أن ترفض الاعتماد وتعيد تصنيف الرحلة رحلةً فاشلة إذا تبيّن أنها لم تُنفَّذ أو نُفِّذت بغير ما اتُّفق عليه، وذلك خلال المهلة المقرَّرة في النظام لإعادة التصنيف. وبعد انقضائها لا يُعاد تصنيف الرحلة، ويبقى للطرفين ما تقرّره القواعد العامة."
  },
  {
    "k": "c08",
    "title": "٨) الرحلة الفاشلة والخصم وسقفه والتظلّم",
    "body": "إذا لم تُنفَّذ رحلةٌ قَبِلها المتعهد، أو نُفِّذت تنفيذاً معيباً، صنّفت المنصة الواقعة وفق كتالوج الأسباب المعلن، ولكل سبب إجراءٌ مالي افتراضي معلن مسبقاً: **لا شيء**، أو **أداء المستحق كاملاً للمتعهد**، أو **خصم**.\n\nوتُطبَّق على الخصم القواعد التالية، وهي جوهر ما قَبِله المتعهد بهذه الاتفاقية:\n\n— 🔴 **سقف الخصم عن أي رحلة هو مستحقُّ تلك الرحلة نفسها ولا يتجاوزه بحال.** فلا يترتب على الخصم رصيدٌ سالب في ذمة المتعهد ولا مطالبةٌ بما يزيد على ما كان يستحقه عنها.\n\n— يُحدَّد مبلغ الخصم من القيمة الافتراضية المقرَّرة لسبب الواقعة، وللمنصة أن تخالفها في واقعةٍ بعينها زيادةً أو نقصاناً، **ولا تُقبل المخالفة إلا بمبرر مكتوب يُثبَّت في السجل** ويُتاح للمتعهد.\n\n— ولا يقع خصمٌ بلا واقعةٍ مصنَّفة ومسجَّلة تحمل: السبب، والإجراء، والمبلغ، ولحظة التسجيل، ومن سجّلها، ومستحقَّ الرحلة وقتها.\n\n— **والتظلّم حقٌّ للمتعهد**: له أن يعترض على الخصم خلال **أربعة عشر يوماً** من قيده في كشف حسابه، بطلبٍ مسبَّب عبر قنوات التواصل المعتمدة مرفقاً برقم الرحلة وما لديه من مستندات. وتردّ المنصة على التظلّم خلال **سبعة أيام عمل** برد مسبَّب، فإما ألغت الخصم أو خفّضته أو أبقته مع بيان السبب. وقيدُ الإلغاء أو التخفيض يظهر في كشف حساب المتعهد.\n\n— ولا يُنفَّذ خصمٌ إلا بعد أن يكون المتعهد قد قَبِل نسخةً سارية من هذه الاتفاقية. وإن نُشرت نسخةٌ جديدة فالخصمُ يُقاس بالنسخة التي كانت مقبولةً منه وقت وقوع الواقعة.\n\n— وعدم حضور العميل أو تأخّره عن الحد المقرَّر ليس خطأً من المتعهد، ويُعامَل بأداء المستحق كاملاً وفق كتالوج الأسباب."
  },
  {
    "k": "c09",
    "title": "٩) عدم التعامل المباشر مع عملاء المنصة",
    "body": "المنصة هي التي تُعرِّف المتعهد بالعميل، وبياناتُ العميل تصل المتعهد لغرض تنفيذ الرحلة وحده.\n\nويلتزم المتعهد بألّا يتعاقد مباشرةً — لا بنفسه ولا بواسطة تابعٍ له أو شركةٍ يملكها أو يشارك فيها — مع أي عميل تعرّف عليه من خلال المنصة، على خدمة نقلٍ من الخدمات التي تقدّمها المنصة، وذلك لمدة **اثني عشر شهراً** من تاريخ آخر رحلة نفّذها لذلك العميل عبر المنصة.\n\nويشمل ذلك عرضَ الخدمة على العميل أو قبولَ عرضه أو توجيهَه إلى قناة خارج المنصة أو تسليمَه بيانات تواصل لهذا الغرض، سواء تمّ ذلك أثناء الرحلة أو بعدها.\n\nوإذا خالف المتعهد هذا البند استحقت المنصة عن كل رحلةٍ نُفِّذت بالمخالفة مبلغاً يعادل **عمولة المنصة المعتادة عن رحلةٍ مماثلة**، وذلك دون إخلال بحقها في إنهاء الاتفاقية فوراً وفق البند الخامس عشر.\n\nولا يمنع هذا البند المتعهد من العمل لحساب عملائه الذين تعرّف عليهم من خارج المنصة، ولا من العمل مع منصات أو شركات أخرى؛ فهو قيدٌ على استعمال ما عرّفته به المنصة، لا قيدٌ على نشاطه."
  },
  {
    "k": "c10",
    "title": "١٠) بيانات العميل التي تصل المتعهد وحدود استعمالها",
    "body": "قبل قبول العرض لا يصل المتعهد شيءٌ يعرّف بالعميل. وبعد القبول يصله ما يلزم لتنفيذ الرحلة، وهو محصور فيما يلي:\n\n— اسم العميل ورقم هاتفه ورقم واتسابه إن سجّله.\n— نقطتا الانطلاق والوجهة بعنوانيهما الكاملين، وموعد التحرك.\n— عدد الركاب وفئة المركبة ومسافة المسار وساعات الانتظار.\n— رقم الرحلة الجوية إن أدخله العميل.\n— ملاحظات العميل على الحجز كما كتبها.\n\nولا يصل المتعهد سعرُ الرحلة الذي دفعه العميل، ولا إيصال تحويله، ولا أيُّ رحلة من رحلات العميل غير التي أُسندت إليه.\n\nويلتزم المتعهد بأن يستعمل هذه البيانات **لتنفيذ تلك الرحلة وحدها**، وبألّا ينقلها إلى غيره إلا للسائق المخصَّص وبقدر ما يلزمه، وبألّا يحتفظ بها بعد انقضاء الحاجة إليها ومضيّ المدد التي تفرضها القوانين السارية، وبألّا يستعملها في تسويقٍ أو دعوةٍ أو عرضِ خدمةٍ من أي نوع.\n\nويلتزم بأن يُلزم سائقيه وتابعيه بذات القيود، ويكون مسؤولاً عن مخالفتهم لها كمسؤوليته عن مخالفته هو. وإخطارُ المنصة واجبٌ فوراً عند أي تسرّب أو استعمالٍ غير مصرَّح به لهذه البيانات.\n\nوهذا البند يُقرأ مع سياسة الخصوصية المنشورة على موقع المنصة، وهي التي أُفصح فيها للعميل عن هذه البيانات بعينها."
  },
  {
    "k": "c11",
    "title": "١١) السائقون والمركبات ومستنداتهما",
    "body": "يقدّم المتعهد للمنصة، ويُبقي محدَّثاً، بيانات مركباته وسائقيه: طراز المركبة وسنتها ولوحتها وعدد مقاعدها، واسم السائق ورقم هاتفه ورقم رخصته، وما تطلبه المنصة من صور المركبة وصورة السائق وصورة رخصته.\n\nويقرّ المتعهد بأنه حصل على موافقة كل سائق على تقديم بياناته وصورته وصورة رخصته إلى المنصة لهذا الغرض، وأنه أبلغه بمدة الاحتفاظ بها.\n\nوتحتفظ المنصة بصور السائقين والرخص **لمدة خمس سنوات من انتهاء العلاقة بين الطرفين**، لأغراض إثبات التنفيذ والالتزام بما تفرضه القوانين السارية، ثم تُحذف.\n\n🔒 **ولا تصل هذه الصور ولا مستندات السائق إلى العميل.** ما يظهر للعميل بعد الإسناد هو بيانات المركبة والسائق اللازمة للقاء الرحلة، ولا يظهر له اسمُ شركة المتعهد ولا تكلفته ولا شيءٌ من مستنداته.\n\nويلتزم المتعهد بألّا يُسنِد رحلةً إلى سائقٍ غير مسجَّل لديه لدى المنصة، وبأن يوقف فوراً أي سائق سقطت رخصته أو صار غير صالح للقيادة."
  },
  {
    "k": "c12",
    "title": "١٢) السرية",
    "body": "كل ما يطّلع عليه المتعهد بحكم هذه العلاقة، مما ليس معلوماً للجمهور، سرٌّ لا يُفشى ولا يُستعمل لغير تنفيذ الرحلات: بيانات العملاء، وحجم الطلب وتوزيعه، وأسلوب المنصة في البثّ والإسناد، وشروطها المالية.\n\nولا يطّلع المتعهد — ولا يحقّ له أن يطلب — على تكلفة متعهدٍ آخر ولا على قوائم أسعاره، ولا على هامش المنصة ولا على السعر الذي دفعه العميل. وقد صُمِّم النظام بحيث لا تصل هذه البيانات إلى بوابة المتعهد أصلاً؛ فإن وصل إليه شيءٌ منها بخطأ أو بأي طريق آخر التزم بإبلاغ المنصة وعدم استعماله ولا إفشائه.\n\nويلتزم المتعهد بذات القيود على سائقيه وتابعيه، ويستمر التزامه بالسرية **لمدة ثلاث سنوات بعد انتهاء العلاقة** بين الطرفين."
  },
  {
    "k": "c13",
    "title": "١٣) التزامات المتعهد النظامية",
    "body": "يقرّ المتعهد ويلتزم بأن يبقى طوال سريان هذه الاتفاقية:\n\n— حاملاً للتراخيص اللازمة لمزاولة نشاط النقل البري السياحي داخل جمهورية مصر العربية، ومسجَّلاً لدى الجهات المختصة.\n— مؤمِّناً على كل مركبة تنفّذ رحلات المنصة بوثيقة تأمين سارية تغطي ما يفرضه القانون على الأقل.\n— مستوفياً لشروط ترخيص المركبات وصلاحيتها للسير وفحصها الدوري.\n— ملتزماً بأن يقود مركباته سائقون يحملون رخصاً سارية من الفئة المناسبة.\n— ملتزماً بقوانين المرور والسلامة، وبعدم تحميل المركبة فوق طاقتها المرخصة، وبمنع التدخين داخل المركبة، وبمعاملة العميل معاملةً لائقة.\n\nويلتزم بإخطار المنصة فوراً بأي واقعة تمسّ هذه الإقرارات: سقوط ترخيص، أو انقضاء تأمين، أو حادث جسيم، أو منع سائقٍ من القيادة.\n\nوللمنصة أن تطلب في أي وقت ما يثبت هذه الالتزامات، وأن توقف عن المتعهد إسناد الرحلات حتى يقدّمه."
  },
  {
    "k": "c14",
    "title": "١٤) المسؤولية والتعويض",
    "body": "المتعهد مسؤول وحده عن تنفيذ الرحلة وعن كل ما ينشأ عنها من أضرار تلحق بالركاب أو بالغير أو بالمركبة، وعن أفعال سائقيه وتابعيه، وعن المخالفات المرورية المترتبة على التنفيذ.\n\nوتخضع إصابات الركاب في حوادث المرور لوثيقة تأمين المركبة النافذة قانوناً ولأحكام قوانين المرور المصرية.\n\nويلتزم المتعهد بتعويض المنصة عمّا تتحمّله فعلاً من مطالبات أو تعويضات أو مصروفاتٍ ترجع إلى إخلاله بهذه الاتفاقية أو بالقانون أو إلى خطأ منه أو من تابعيه.\n\nولا تُسأل المنصة قِبَل المتعهد عن الأرباح الفائتة ولا عن الأضرار غير المباشرة، ولا عن انقطاع الطلب أو قلّته، ولا عن أي أثرٍ يترتب على تغيّر أحوال السوق. وفي كل الأحوال لا تتجاوز مسؤولية المنصة قِبَل المتعهد عن مطالبةٍ تتعلق برحلةٍ بعينها **مستحقَّ تلك الرحلة**."
  },
  {
    "k": "c15",
    "title": "١٥) مدة الاتفاقية وإنهاؤها",
    "body": "هذه الاتفاقية غير محددة المدة، وتسري من لحظة قبول المتعهد لها وتستمر حتى إنهائها.\n\nولأي من الطرفين إنهاؤها بإخطار الطرف الآخر كتابةً قبل **ثلاثين يوماً**، بلا حاجة إلى إبداء سبب وبلا تعويض.\n\n🔒 **والرحلات التي قَبِلها المتعهد قبل نفاذ الإنهاء تُنفَّذ ويُؤدّى مستحقُّها كاملاً**، ولا يُعفى أيٌّ من الطرفين من التزامٍ نشأ قبل الإنهاء.\n\nوللمنصة أن توقف إسناد الرحلات فوراً وأن تنهي الاتفاقية بلا مهلة في حالات الإخلال الجسيم، ومنها: سقوط ترخيصٍ أو تأمينٍ لازم، أو تعريض سلامة الركاب للخطر، أو مخالفة البند التاسع، أو إفشاء بيانات عميل، أو انسحابٌ متكرر بلا سببٍ مقبول، أو تقديم بيانات غير صحيحة عن المركبات أو السائقين.\n\nوبعد الإنهاء يُصفّى الحساب بين الطرفين وفق البند الرابع، وتبقى نافذةً بنودُ السرية وعدم التعامل المباشر ومدد الاحتفاظ بالمستندات."
  },
  {
    "k": "c16",
    "title": "١٦) تعديل هذه الاتفاقية وإعادة قبولها",
    "body": "للمنصة أن تعدّل هذه الاتفاقية. والتعديل يصدر **نسخةً جديدة برقم إصدار جديد**، ولا يسري بأثر رجعي على واقعةٍ تمّت قبل نشره.\n\nويُخطَر المتعهد بالنسخة الجديدة في بوابته، وله **مهلةٌ معلنة تظهر له بتاريخها** لقراءتها وقبولها. وإذا انقضت المهلة بلا قبول توقّف وصولُ عروض الرحلات إليه حتى يقبل، ولا يُعدّ ذلك إنهاءً للاتفاقية ولا يمسّ مستحقاته عن رحلاتٍ سابقة ولا رحلةً قَبِلها فعلاً.\n\nومن لم يرضَ بالنسخة الجديدة فله إنهاء الاتفاقية وفق البند الخامس عشر.\n\n🔒 **وتبقى كل نسخةٍ قَبِلها المتعهد محفوظةً بنصّها**، ويستطيع الاطلاع عليها في أي وقت. والاحتجاج على المتعهد يكون بالنسخة التي كانت مقبولةً منه وقت وقوع الواقعة، لا بنسخةٍ لاحقة."
  },
  {
    "k": "c17",
    "title": "١٧) القانون واللغة والاختصاص",
    "body": "تخضع هذه الاتفاقية وكل ما ينشأ عنها لأحكام قوانين جمهورية مصر العربية.\n\n🔒 **والنص العربي لهذه الاتفاقية هو المرجع المعتمد**، وأي ترجمة إلى لغة أخرى للاستئناس وحده ولا يُحتجّ بها عند الاختلاف.\n\nويسعى الطرفان إلى تسوية أي خلاف ودياً خلال **ثلاثين يوماً** من إخطار أحدهما الآخر به كتابةً. فإذا تعذّرت التسوية اختصّت المحاكم المصرية المختصة بنظر النزاع.\n\nوإذا بطل بندٌ من بنود هذه الاتفاقية أو تعذّر تنفيذه بقيت سائر البنود نافذة.\n\nوالإخطارات بين الطرفين تكون عبر قنوات التواصل المسجَّلة لدى كلٍّ منهما، ويُعتدّ بما يُرسل إلى بوابة المتعهد وإلى القنوات التي سجّلها إخطاراً صحيحاً."
  }
]$doc$::jsonb
  )
  returning id into v_id;

  -- النشرُ هنا كتابةٌ مباشرة لا نداءٌ لـ`publish_partner_agreement`: تلك محروسة
  -- بـ`is_admin()` ولا مشرفَ في جلسة الهجرة (‏`auth.uid()` فارغة). والحارسُ
  -- يسمح: صفٌّ حالته `draft` يُعدَّل بحرية، والقيدُ البنيوي يفرض اكتمالَ
  -- الثلاثة (لحظةُ النشر · البصمة · المهلة) فلا يمرّ منشورٌ ناقص.
  v_hash := (select public.partner_agreement_hash(v.title, v.preamble, v.clauses)
             from public.partner_agreement_versions v where v.id = v_id);

  update public.partner_agreement_versions v
     set status       = 'published',
         published_at = now(),
         grace_days   = v_days,
         doc_hash     = v_hash,
         change_note  = 'الإصدار الأول من اتفاقية المتعهد.'
   where v.id = v_id;

  raise notice
    '0113 ✔ نُشر الإصدار ١ من اتفاقية المتعهد (% بنداً · بصمة % · مهلة قبول % يوماً)',
    jsonb_array_length((select v.clauses from public.partner_agreement_versions v where v.id = v_id)),
    left(v_hash, 8), v_days;
end;
$$;

-- ----------------------------------------------------------------------------
-- (١٢) الفحص الذاتي — الحارسُ يُشغَّل الآن لا يُوصَف
--
-- كلُّ كتابةٍ هنا داخل معاملةٍ فرعية تُرجَع، ولا يُمسّ صفُّ بياناتٍ للمالك:
-- الفيكسترة متعهدٌ وهميٌّ بمعرّفٍ ثابت، ويُثبَت في آخر القسم أنه لم يبقَ منه شيء.
-- ----------------------------------------------------------------------------
do $$
declare
  v_sub   constant uuid := 'a1130000-0000-4000-8000-000000000001';
  v_cur   record;
  v_st    record;
  v_tmp   uuid;
  v_n     integer;
  v_ok    boolean;
  v_hamza record;
begin
  select * into v_cur from public.partner_agreement_current();
  if v_cur.id is null then
    raise exception '0113(أ): لا إصدار منشور بعد البذرة';
  end if;
  if jsonb_array_length(v_cur.clauses) < 10 then
    raise exception '0113(أ): الوثيقة % بنداً فقط — البذرة ناقصة', jsonb_array_length(v_cur.clauses);
  end if;

  begin
    -- (ب) الإصدار المنشور لا يُعدَّل نصُّه
    begin
      update public.partner_agreement_versions v set title = 'zz' where v.id = v_cur.id;
      raise exception '0113(ب): تعديلُ نصّ إصدارٍ منشور نجح — النسخة المقبولة ليست محفوظة';
    exception
      when others then
        if position('لا يُعدَّل نصُّه' in sqlerrm) = 0 then raise; end if;
    end;

    -- (ج) ولا يُحذف
    begin
      delete from public.partner_agreement_versions v where v.id = v_cur.id;
      raise exception '0113(ج): حذفُ إصدارٍ منشور نجح';
    exception
      when others then
        if position('لا يُحذفان' in sqlerrm) = 0 then raise; end if;
    end;

    -- (د) 🔴 شريكٌ **قديمٌ يعمل منذ سنة** لا ينقطع عمله لحظةَ النشر: مهلتُه
    --     تُقاس من **نشر الإصدار** لأنه الأحدث — وهذه بعينها حمايةُ حمزة.
    insert into public.subcontractors (id, company_name, phone, status, created_at)
    values (v_sub, 'ZZ-0113-SELFCHECK', '01000000000', 'approved', now() - interval '400 days');

    select * into v_st from public.partner_agreement_status(v_sub);
    if v_st.accepted then
      raise exception '0113(د): شريكٌ لم يقبل شيئاً يُقرأ «قابلاً»';
    end if;
    if not v_st.in_grace or not v_st.ok then
      raise exception
        '0113(د): شريكٌ يعمل منذ ٤٠٠ يوم انقطعت عروضه لحظةَ الهجرة — وهذا ما لا يجوز أن يقع';
    end if;
    -- والمهلة من النشر لا من إنشاء الصفّ: الفارق يوماً واحداً يكفي لكشف الخطأ
    if v_st.deadline is null
       or abs(extract(epoch from (v_st.deadline - (v_cur.published_at
             + make_interval(days => v_cur.grace_days))))) > 2 then
      raise exception
        '0113(د): المهلة ليست greatest(نشر, إنشاء) + الأيام — قِيست % والمنتظر %',
        v_st.deadline, v_cur.published_at + make_interval(days => v_cur.grace_days);
    end if;

    -- (هـ) وشريكٌ حديثٌ (أُنشئ الآن) داخل المهلة ⇒ يمرّ — وهو ما يُبقي فيكسترات
    --      المجموعات الأخرى خضراء اليوم وبعد سنة
    update public.subcontractors s set created_at = now() where s.id = v_sub;
    select * into v_st from public.partner_agreement_status(v_sub);
    if not v_st.in_grace or not v_st.ok then
      raise exception '0113(هـ): شريكٌ أُنشئ الآن خارج المهلة — كلُّ فيكسترة اختبارٍ ستُحجب';
    end if;

    -- (و) القبول لا يقع على إصدارٍ غير الساري
    begin
      perform public.accept_partner_agreement(gen_random_uuid(), 'فحص');
      raise exception '0113(و): قُبل إصدارٌ ليس الساري';
    exception
      when others then
        if position('forbidden' in coalesce(sqlerrm, '')) = 0
           and position('أعد تحميل الصفحة' in sqlerrm) = 0
           and position('متاح لحساب متعهد فقط' in sqlerrm) = 0 then
          raise;
        end if;
    end;

    -- (ز) سجلُّ القبول مُلحَقٌ فقط — يُكتب مباشرةً هنا (لا جلسةَ شريكٍ في الهجرة)
    insert into public.partner_agreement_acceptances (
      subcontractor_id, subcontractor_name, agreement_id, agreement_version,
      doc_hash, signed_name, actor_kind
    ) values (v_sub, 'ZZ-0113-SELFCHECK', v_cur.id, v_cur.version, v_cur.doc_hash, 'فحص ذاتي', 'admin');

    select * into v_st from public.partner_agreement_status(v_sub);
    if not v_st.accepted or not v_st.ok then
      raise exception '0113(ز): قبولٌ مسجَّل ولا تراه الحالة';
    end if;

    begin
      update public.partner_agreement_acceptances a set signed_name = 'zz'
       where a.subcontractor_id = v_sub;
      raise exception '0113(ز): تعديلُ صفّ قبولٍ نجح — السجلّ ليس دليلاً';
    exception
      when others then
        if position('مُلحَقٌ فقط' in sqlerrm) = 0 then raise; end if;
    end;

    begin
      delete from public.partner_agreement_acceptances a where a.subcontractor_id = v_sub;
      raise exception '0113(ز): حذفُ صفّ قبولٍ نجح';
    exception
      when others then
        if position('مُلحَقٌ فقط' in sqlerrm) = 0 then raise; end if;
    end;

    -- (ح) والقبولُ لا يُكرَّر: الفهرسُ الفريد الجزئي هو الحَكَم
    begin
      insert into public.partner_agreement_acceptances (
        subcontractor_id, subcontractor_name, agreement_id, agreement_version,
        doc_hash, signed_name, actor_kind
      ) values (v_sub, 'ZZ-0113-SELFCHECK', v_cur.id, v_cur.version, v_cur.doc_hash, 'مكرر', 'admin');
      raise exception '0113(ح): سُجّل قبولان لنفس الشريك على نفس الإصدار';
    exception
      when unique_violation then null;
    end;

    /*
      (ط) 🔴 وأنّ الحاجز **يعضّ فعلاً** — وهذا هو التأكيد الذي لولاه كان القسم
          كلُّه يشهد لنفسه: كلُّ ما سبق أثبت أن أحداً لا يُحجب اليوم.

      وكيف يُقاس الحجزُ ولحظةُ النشر «الآن»؟ بإصدارٍ مؤقّت مهلتُه صفر ولحظةُ
      نشره أمس — يُبنى داخل هذه المعاملة الفرعية ويذهب معها. ولا يمرّ من
      `publish_partner_agreement` لأنها محروسة بـ`is_admin()` ولا مشرفَ في
      جلسة الهجرة؛ فالكتابةُ مباشرة كما في البذرة.
    */
    update public.partner_agreement_versions v set status = 'archived' where v.status = 'published';
    insert into public.partner_agreement_versions (title, preamble, clauses)
    values ('ZZ-0113 إصدار فحص', '', '[{"k":"z1","title":"بند فحص","body":"نصّ فحص"}]'::jsonb)
    returning id into v_tmp;
    update public.partner_agreement_versions v
       set status = 'published', published_at = now() - interval '1 day',
           grace_days = 0, doc_hash = 'zz-0113'
     where v.id = v_tmp;

    select * into v_st from public.partner_agreement_status(v_sub);
    if v_st.accepted then
      raise exception '0113(ط): قبولُ إصدارٍ سابق يُحسب قبولاً للإصدار الجديد — التعديلُ لا يُبطل شيئاً';
    end if;
    if v_st.in_grace or v_st.ok then
      raise exception '0113(ط): شريكٌ انقضت مهلته ولم يقبل يمرّ من الحاجز — الحاجزُ زينة';
    end if;
    if public.partner_agreement_ok(v_sub) then
      raise exception '0113(ط): الغلاف البولياني يخالف الدالة الأمّ';
    end if;

    -- والمقبض يُطفئ الحاجز ولا يمحو البند
    update public.partner_agreement_settings s set gate_enabled = false where s.id = true;
    select * into v_st from public.partner_agreement_status(v_sub);
    if not v_st.ok or v_st.required then
      raise exception '0113(ط): إطفاءُ الحاجز من اللوحة لا يعمل';
    end if;

    raise exception '0113_ROLLBACK';
  exception
    when others then
      if sqlerrm <> '0113_ROLLBACK' then raise; end if;
  end;

  -- (ط) صفرُ أثر
  select count(*)::integer into v_n from public.subcontractors s where s.id = v_sub;
  if v_n <> 0 then
    raise exception '0113(ط): بقي صفُّ فيكسترة متعهد';
  end if;
  select count(*)::integer into v_n
  from public.partner_agreement_acceptances a where a.subcontractor_name = 'ZZ-0113-SELFCHECK';
  if v_n <> 0 then
    raise exception '0113(ط): بقي % صفَّ قبولٍ للفحص', v_n;
  end if;

  -- (ي) والمنحُ صار كما يجب: لا دورَ متصفحٍ يمسّ سجلَّ القبول بحرف
  select not (has_table_privilege('anon',          'public.partner_agreement_acceptances', 'SELECT')
           or has_table_privilege('authenticated', 'public.partner_agreement_acceptances', 'SELECT')
           or has_table_privilege('authenticated', 'public.partner_agreement_acceptances', 'INSERT')
           or has_table_privilege('service_role',  'public.partner_agreement_acceptances', 'UPDATE')
           or has_table_privilege('service_role',  'public.partner_agreement_acceptances', 'DELETE')
           or has_table_privilege('service_role',  'public.partner_agreement_acceptances', 'TRUNCATE'))
    into v_ok;
  if not v_ok then
    raise exception '0113(ي): بقي منحٌ على سجلّ القبول لدورٍ لا يجوز أن يمسّه';
  end if;

  -- (ك) 🔴 وحمزة الغمري — الشريك الحيّ — **لا تتوقف عروضه اليوم**
  select s.id, s.company_name, s.created_at into v_hamza
  from public.subcontractors s where s.status = 'approved'
  order by s.created_at asc limit 1;

  if v_hamza.id is not null then
    select * into v_st from public.partner_agreement_status(v_hamza.id);
    if not v_st.ok then
      raise exception
        '0113(ك): شريكٌ معتمَدٌ يعمل («%») صار محجوباً لحظةَ الهجرة — وهذا ما لا يجوز أن يقع',
        v_hamza.company_name;
    end if;
    raise notice
      '0113 ✔ الشريك المعتمَد «%» يمرّ من الحاجز الآن (مهلته حتى %) — ولا انقطاعَ في عروضه',
      v_hamza.company_name, v_st.deadline;
  end if;

  raise notice '0113 ✔ الاتفاقية منشورة · المنشورُ مجمَّد · سجلُّ القبول مُلحَقٌ فقط بلا منحٍ لدور متصفح · والمهلة تُقاس لكل شريكٍ من لحظة بلوغه الالتزام';
end;
$$;

-- ⚠ ولا سطرَ تسجيلٍ في `schema_migrations` هنا: المُشغِّل (`scripts/db-migrate.mjs`)
--    يكتبه بنفسه بعد نجاح الملف.
