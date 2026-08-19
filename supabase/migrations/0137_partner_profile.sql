-- ============================================================================
-- 0137_partner_profile.sql
-- ملفُّ المستخدم للمتعهد: **النسخة التي وقّعها تبقى مقروءةً بنصّها بعد أرشفتها**
-- ============================================================================
--
-- ── لماذا هذا الملف موجود ─────────────────────────────────────────────────
--
-- شاشةُ الاتفاقية تَعِد الشريك بجملتين، وكلتاهما **غير قابلة للتنفيذ اليوم**:
--
--   • «كل نسخة قَبِلتها تبقى محفوظة بنصّها»            (نصّ «؟» في الترويسة)
--   • «النسخة التي قبلتها … يمكنك العودة إليها في أي وقت» (شريط النجاح)
--
-- والمقيس على القاعدة الحيّة قبل هذه الهجرة، لا المفترض:
--
--   select proname from pg_proc where pronamespace='public'::regnamespace
--    and proname like '%agreement%';
--   ⇒ اثنتا عشرة دالة، و**لا واحدة** تُرجع لصاحب الجلسة نصَّ إصدارٍ قَبِله.
--
--   `portal_agreement()` تُرجع نصَّ **المنشور وحده** (‏`partner_agreement_current`
--   ‏= `where status='published'`), ومعه `accepted_version` **رقماً مجرّداً**.
--   و`partner_agreement_versions` عليها RLS بسياسةِ `is_admin()` في الاتجاهات
--   الأربعة ⇒ الشريك لا يقرأ صفَّها مباشرةً بحال.
--
-- ⇒ فمتى نُشر إصدارٌ ثانٍ، صار نصُّ الإصدار الذي وقّعه الشريك **محجوباً عنه**،
--    والشاشة تَعِده بعكس ذلك حرفياً. وهو النمط ٢ في `LESSONS.md`: الواجهة تَعِد
--    بما لا تنفّذه القاعدة. ولا يظهر اليوم لسببٍ واحد عارض — **إصدارٌ واحد على
--    القرص وهو المنشور** (مقيسٌ: صفٌّ واحد `version=1` حالته `published`) —
--    أي أن العيب نائمٌ ينفجر **يوم يُعدَّل نصُّ الاتفاقية أول مرة**.
--
-- ── ما تفعله الهجرة، ولا تفعله ─────────────────────────────────────────────
--
-- تفعل: **دالةَ قراءةٍ واحدة** تُرجع لصاحب الجلسة نُسخَه الموقَّعة بنصّها كاملاً.
-- لا تفعل: لا جدولَ جديداً · لا عموداً · لا تغييرَ في توقيعِ دالةٍ قائمة · ولا
--          مساسَ بحاجز القبول. **الحاجز يبقى حيث هو بحرفه** — `dispatch_pool`
--          و`portal_offers` و`accept_offer` تقرأ `partner_agreement_ok()`
--          كما كانت، وهذا الملف لا يذكرها. ونقلُ **عرضِ** الاتفاقية إلى ملف
--          المستخدم تغييرُ تصييرٍ محض، لا يمرّ من هنا ولا يستطيع أن يفتح ثغرة.
--
-- ── القرارات ───────────────────────────────────────────────────────────────
--
-- (١) **بلا وسيطِ متعهدٍ إطلاقاً** — كـ`portal_agreement()` و`portal_balance()`
--     حرفياً: النطاق يُثبَّت داخلها من `current_subcontractor_id()`. وأولُ وسيطٍ
--     يحوّلها من دالةٍ مقصورة على صاحبها إلى بابٍ يقرأ به كلُّ شريكٍ توقيعَ غيره
--     واسمَ الموقّع عنه (سابقة D-20، وهي عين ثغرة `coverage_matches`).
--
-- (٢) **`security definer` بقصد، وهو ما يجعلها آمنةً لا خطرة**: الجدولان عليهما
--     RLS بسياسة `is_admin()`، والمنحُ على `partner_agreement_acceptances`
--     مسحوبٌ عن `authenticated` أصلاً (0113 §١٠). فالتجاوزُ هنا **مصحوبٌ بشرطٍ
--     أضيق من السياسة نفسها**: صفوفُ صاحب الجلسة وحده.
--
-- (٣) **لا يُرجَع `accepted_by` ولا `actor_kind`… بل يُرجعان**: الأول لا، والثاني
--     نعم. الفرق أن `actor_kind` يقول للشريك **مَن وقّع**: هو من بورتاله
--     (`partner`) أم الإدارة عنه (`admin`) — وهي معلومةٌ تخصّه ويحتجّ بها. أما
--     `accepted_by` فمعرّفُ حسابٍ لا يعني له شيئاً ولا يُعرض، فلا يخرج.
--
-- (٤) **`hash_matches` يخرج ولا يُخفى.** بصمةُ الصفّ تُقارَن ببصمة إصداره: أيُّ
--     اختلافٍ يعني أن نصَّ إصدارٍ منشورٍ مُسّ بعد التوقيع (المخرَجُ الوحيد
--     `DISABLE TRIGGER` بملكية الجدول). وهو نظيرُ `admin_agreement_acceptances`
--     حرفياً — **والشريك أولى بأن يعرف أن نصَّه تغيّر من الإدارة**.
--
-- المرجع: 0113 (الاتفاقية والقبول وحاجز البثّ) · D-19 · D-20 · D-58
--         · القاعدة الذهبية ١٢ (لا يُستنسخ منطقٌ قائم — `partner_agreement_hash`
--           هي مصدرُ البصمة، وهذه الدالة تقارن ولا تحسب)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (٠) الشروط المسبقة — لا معنى لقراءةٍ بلا ما تقرؤه
-- ----------------------------------------------------------------------------
do $$
declare
  v_missing text;
begin
  select string_agg(t, '، ') into v_missing
  from (values ('public.partner_agreement_versions'),
               ('public.partner_agreement_acceptances')) x(t)
  where to_regclass(x.t) is null;

  if v_missing is not null then
    raise exception '0137: جداول مفقودة: % — هجرة 0113 غير مطبَّقة', v_missing;
  end if;

  if to_regprocedure('public.current_subcontractor_id()') is null then
    raise exception '0137: `current_subcontractor_id()` مفقودة — لا نطاقَ يُثبَّت';
  end if;

  if to_regprocedure('public.portal_agreement()') is null then
    raise exception '0137: `portal_agreement()` مفقودة — هجرة 0113 غير مكتملة';
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- (١) نُسَخُ صاحب الجلسة الموقَّعة — بنصّها، مؤرشفةً كانت أو سارية
--
-- 🔒 لا وسيطَ لها (القرار ١). ولا تُرجع صفَّ شريكٍ آخر بحال: الشرط على
--    `subcontractor_id` بعينه، ونداءُ `current_subcontractor_id()` يعود `null`
--    لغير المتعهد — و`a.subcontractor_id = null` لا يطابق صفاً واحداً.
-- ----------------------------------------------------------------------------
create or replace function public.portal_agreement_history()
returns table (
  acceptance_id uuid,
  agreement_id  uuid,
  version       integer,
  title         text,
  preamble      text,
  clauses       jsonb,
  change_note   text,
  published_at  timestamptz,
  status        text,
  signed_name   text,
  actor_kind    text,
  accepted_at   timestamptz,
  doc_hash      text,
  hash_matches  boolean,
  is_current    boolean
)
language sql
stable
security definer
set search_path to ''
as $fn$
  select a.id,
         a.agreement_id,
         a.agreement_version,
         v.title,
         v.preamble,
         v.clauses,
         v.change_note,
         v.published_at,
         v.status,
         a.signed_name,
         a.actor_kind,
         a.accepted_at,
         a.doc_hash,
         -- كاشفُ مساس: بصمةُ لحظة التوقيع مقابل بصمةَ الإصدار الآن (القرار ٤)
         a.doc_hash = v.doc_hash,
         v.status = 'published'
  from public.partner_agreement_acceptances a
  join public.partner_agreement_versions v on v.id = a.agreement_id
  where a.subcontractor_id = public.current_subcontractor_id()
    and public.current_subcontractor_id() is not null
  order by a.accepted_at desc;
$fn$;

comment on function public.portal_agreement_history() is
  'النُّسَخ التي وقّعها **صاحبُ الجلسة** بنصّها كاملاً — المؤرشفةُ كالسارية. بلا وسيطِ متعهد بقصد (النطاق من `current_subcontractor_id()`), فلا يقرأ شريكٌ توقيعَ غيره. و`hash_matches` يكشف مساساً بنصّ إصدارٍ بعد التوقيع عليه. وُلدت لأن `portal_agreement()` تُرجع نصَّ المنشور وحده، فكان وعدُ الشاشة «تعود إليها في أي وقت» غيرَ قابلٍ للتنفيذ بعد أول تعديل.';

-- ----------------------------------------------------------------------------
-- (٢) المنح — `revoke` أولاً ثم الأضيق (اتفاقية ٦ · القاعدة الذهبية ١٦)
--
-- ولا جدولَ جديداً في هذه الهجرة ⇒ لا كتلةَ `revoke … truncate` تلزم.
-- ----------------------------------------------------------------------------
revoke all on function public.portal_agreement_history() from public, anon;
grant execute on function public.portal_agreement_history() to authenticated, service_role;
