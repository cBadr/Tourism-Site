-- ============================================================================
-- 0053 — تصليب موجة «الرحلة الفاشلة»: أربعة عيوب **مقيسة** على القاعدة الحيّة
--
-- يُقرأ مع `0051_failed_trips.sql` و`0052_assignment_guards.sql`. ثلاثةٌ منها
-- أمسكتهما عدستا المراجعة بعد الموجة الثانية، والرابع خرج من قياسٍ شامل أُجري
-- للتحقق من الثاني. **ولا واحدَ منها مُستنتَج** — لكلٍّ سطرُ قياسٍ أدناه.
--
-- المرجع الحاكم: docs/phase-briefs/FAILED-TRIPS-AND-PARTNER-ALERTS.md
--                docs/phase-briefs/BOOKING-JOURNEY-WAVES.md
--
-- ══════════════════════════════════════════════════════════════════════════
--  ما قِيس قبل كتابة حرف (‏D-58: من الكتالوج الحيّ لا من ملفات الهجرات)
-- ══════════════════════════════════════════════════════════════════════════
--
--  (١) 🔴 **حرج** — `loyalty_accounts` ما زال يحمل `check (points_balance >= 0)`.
--      والقياس الحيّ (2026-08-15، داخل معاملةٍ أُرجعت):
--        رحلةٌ اكتملت ⇒ سُكّت ٣٬٠٠٠ نقطة ⇒ أنفقها العميل كلها على حجزٍ آخر
--        ⇒ `mark_booking_failed(…)` انتهى بـ**23514**:
--        «new row for relation "loyalty_accounts" violates check constraint»،
--        و**حالة الحجز بقيت `completed`**.
--      أي أن قرار المالك «‏`completed ⇒ failed` مسموح بنافذة ٤٨ ساعة» (§١-د)
--      **مُعطَّلٌ عملياً** لكل عميلٍ أنفق نقاطه: القيدُ يرمي، و**كل نداء PostgREST
--      معاملةٌ واحدة (D-48)** فيُرجَع معه صفُّ الفشل والقيدُ المالي والحالة معاً.
--
--  (٢) عالٍ — `has_table_privilege('authenticated','public.failure_reasons','truncate')`
--      = **true**. سطر `revoke` في `0051` عدّد `public, anon` ونسي `authenticated`
--      (بينما عدّه صحيحاً على `booking_failures` في السطر الذي يليه).
--      و🔒 **RLS لا تحرس `TRUNCATE` إطلاقاً** (القاعدة الذهبية ١٦، والهجرة `0041`
--      موجودةٌ بسبب هذا بعينه): سياسات الجدول الأربع محكمةٌ بـ`is_admin()`،
--      ولا واحدةَ منها تُستشار في `truncate table`. فلم يكن بين دورِ المتصفح
--      وبين كتالوجٍ مُفرَّغ إلا المفتاحُ الأجنبي — أي إلا **بعد** أن يُستعمل سببٌ
--      واحدٌ على الأقل. والكتالوج البكر يُمحى بلا مانع.
--      وقِيس معه: `references` و`trigger` مفتوحتان على الجدول نفسه.
--
--  (٣) عالٍ — `dispatch_tick` الخطوة (٢) تطابق `b.status in ('cancelled','completed')`
--      **ولا تعرف `failed`**. فحجزٌ بلغ `completed` ودورتُه ما زالت `broadcasting`
--      (‏`confirmed ⇒ completed` انتقالٌ مسموح، ولا يُغلق الدورة شيء) ثم أُعيد
--      تصنيفه `failed` داخل نافذة الـ٤٨ ساعة ⇒ **دورته لا تُغلق أبداً**:
--        • الخطوة (٢) لا تراه لأن حالته ليست من الاثنتين،
--        • والخطوة (٣) لا تراه لأنها تشترط `b.status = 'confirmed'`.
--      فتبقى `broadcasting` إلى الأبد، وعروضُها `pending` تنتهي بمهلها صامتة،
--      و`v_stats_dispatch.open_count` يعدّ رحلةً ماتت «مفتوحة».
--
--  (٤) 🆕 وخرج من قياس (٢) حين وُسِّع على المخطط كله — `set_trip_crew` تحرس
--      **حالة الدورة** ولا تنظر إلى حالة الحجز. و`0051` قرّرت عمداً أن
--      `dispatches` **تبقى `assigned`** على الرحلة الفاشلة «شاهدةً على من كان
--      مُسنَداً» (§١-ج) — فالنتيجة أن المتعهد يبقى قادراً على **تبديل السائق
--      والمركبة على رحلةٍ عُلِّمت فاشلة**. وهي بالضبط الرحلة التي عليها نزاع:
--      سببها قد يكون `driver-no-show` وعليها خصمٌ باسمه، فتبديلُ «من كان يقود»
--      بعد وقوع الحدث تعديلٌ لسجلٍّ متنازَع عليه.
--      (‏`portal_trips` تُظهر الفاشلة للمتعهد بقرارٍ صريح في `0051`، فالباب
--       مفتوحٌ من الشاشة لا نظرياً.)
--
-- ══════════════════════════════════════════════════════════════════════════
--  والحدّ الحاكم لهذه الهجرة: **لا تلمس ما لم يُقَس**
-- ══════════════════════════════════════════════════════════════════════════
--
-- مُشيَ على كل دالةٍ واطلاعٍ في `public` يفرّع على حالة الحجز (٣٣ موضعاً
-- مسحاً آلياً على `pg_get_functiondef`/`pg_get_viewdef`)، وحُسم لكلٍّ منها هل
-- `failed` «انتهى الطريق» أم شيءٌ آخر. والمواضع التي **لا تتغيّر** موثَّقةٌ
-- بسببها في تقرير الجلسة لا بالصمت — وأهمها ثلاثة يسهل أن يُظنّ أنها ناقصة:
--
--   • `ledger_on_booking_cancelled` — لا يُضاف إليها `failed` **بقرارٍ صريح**:
--     `mark_booking_failed` تكتب الأثر المالي بنفسها بحسب السبب والإجراء
--     (ترويسة `0051`)، ورجلُ `collected` **لا تُعكس** مع الفشل. فمُشغّلٌ يعكس
--     كل شيء آلياً كان سينقض جدول الأثر المالي الست حالات.
--   • `finance_kpis` و`section_stats('treasury')` — `failed` تسقط من الإيراد
--     ومن «المستحق على العملاء» بصحّة: رحلةٌ فاشلة يُردّ مالها، فليست إيراداً
--     ولا ذمّةً مدينة.
--   • `section_stats('orders')` — **قرارٌ مؤجَّل لا سهو**، تفصيله في التقرير:
--     تغييرُ دلالة مؤشرٍ يقرؤه المالك ليس إصلاح عطب، وثمنُه استنساخ جسمٍ من
--     ٦٠٩ أسطر — وهو بعينه مصنعُ الانحدارات الذي حذّر منه **D-58**.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- (١) 🔴 الرصيد يهبط تحت الصفر **بقيدٍ عاكس وحده** — لا باستبدال
--
-- القرار مكتوبٌ حرفياً في الموجز §١-د: «يُترك الرصيد يسلب بالقيد العاكس وحده
-- — صمّامَ أمان لا سياسة — فلا يُحجَب ردٌّ ولا تُؤخذ قيمةٌ مجاناً». و`0047`
-- نفّذت نصفه: بنت القيدَ العاكس، وأبقت حاجزاً **لا يرى الاتجاه** فوقه.
--
-- ── ولماذا لا يصلح `check` مهما أُعيدت صياغته ──────────────────────────────
--
-- قيدُ الجدول يرى **الصفَّ الناتج وحده**: رقماً سالباً، بلا علمٍ بمن أنزله.
-- والفرق بين «أنفق أكثر مما يملك» و«رُدَّت له رحلةٌ أنفق نقاطها» ليس في الرقم
-- بل في **اتجاه القيد الذي أنتجه** — و`check` لا يبلغه. وحاجزٌ لا يفرّق بين
-- سحبٍ على المكشوف وبين ردٍّ يمنع الردّ، وهو ما قِيس أعلاه.
--
-- فالحاجز ينتقل إلى حيث الاتجاه **معلوم ومحفوظ**: الدفتر نفسه. وشرطاه معاً:
--
--   (أ) مجموع القيود **غير العاكسة** لهذا الهاتف لا ينزل تحت الصفر أبداً
--       (‏`earn` + `redeem` + `adjust` — أي كل ما ليس ردّاً)، و
--   (ب) الرصيد المكتوب لا ينزل **دون مجموع الدفتر كله**.
--
-- و(أ) أدقُّ صياغةٍ ممكنة للقرار: الاستبدال لا يتجاوز المكسب **أبداً**، والقيد
-- العاكس **لا يُحسب** فيها فلا يستطيع أن يُرفَض — ولا يستطيع أن يُخفي سحباً
-- على المكشوف بعده، لأن أي استبدالٍ تالٍ يُجمَع في الطرف نفسه.
--
-- و(ب) هي التي تحفظ ما كان `check` يحرسه من الجهة الأخرى: **الكتابة المباشرة**
-- على `loyalty_accounts`. بلا هذا الشرط كان حسابٌ بلا قيدٍ واحد يُكتب سالباً
-- (مجموعُ دفترٍ فارغ صفرٌ لا سالب) — وهذا بالضبط ما أمسكه الفحص الذاتي في أول
-- تشغيل، فأُضيف الشرط ولم يُضعَّف الفحص.
--
-- ⚠ والانحراف إلى **أعلى** (رصيدٌ فوق الدفتر) يمرّ بقصد: ذاك شأن
--   `loyalty_reconcile` التي وُضعت له، لا شأن حاجزٍ يقف في طريق ردّ مال. ولو
--   رُدَّ لكان الحاجز قد استعاد العيب الذي جاء يزيله من بابٍ آخر.
--
-- ⚠ وهو **حاجزٌ على الجدول لا داخل كاتبه**: يقع على `loyalty_accounts` نفسه،
--   فيمسك الكتابة المباشرة كما يمسك المارّة عبر `loyalty_apply_entry` — تماماً
--   كما كان `check` يفعل. ولا يفقد المشروع حاجزاً بنيوياً مقابل حاجزٍ عرفي.
--
-- ⚠ و**رمز الخطأ يبقى `23514`** بقصد: القيد لم يُلغَ بل تعلّم الاتجاه، وفحصُ
--   `loyalty_tests.sql (هـ-٣)` يحرس المعنى نفسه فيبقى حارساً لا يُعاد كتابته.
--
-- ⚠ ولا يُفتح باب سحبٍ على المكشوف من جهةٍ أخرى: `redeem_points` تشترط
--   `v_bal >= p_points` قبل أي كتابة (مقروءةٌ من الكتالوج الحيّ)، ورصيدٌ سالب
--   أصغر من أي مطلوبٍ موجب — فصاحب الرصيد السالب لا يستبدل شيئاً.
-- ----------------------------------------------------------------------------

-- الاسم مقروءٌ من الكتالوج لا من الذاكرة (القاعدة ١٤): تسميةُ Postgres التلقائية
-- قد تختلف على نسخةٍ بيضاء (‏D-19) لو أُنشئ القيد بترتيبٍ آخر.
do $$
declare
  v_name text;
  v_n    integer := 0;
begin
  for v_name in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'public.loyalty_accounts'::regclass
      and c.contype  = 'c'
      and pg_get_constraintdef(c.oid) ilike '%points_balance%>=%0%'
  loop
    execute format('alter table public.loyalty_accounts drop constraint %I', v_name);
    v_n := v_n + 1;
  end loop;

  if v_n = 0 then
    raise notice '0053 (١): لا قيدَ «points_balance >= 0» على الجدول — أُزيل سابقاً أو لم يُنشأ';
  end if;
end;
$$;

create or replace function public.loyalty_balance_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_gross integer;   -- مجموع القيود **غير** العاكسة: كسبٌ واستبدالٌ وتسوية
  v_all   integer;   -- مجموع الدفتر كله — أرضيةُ ما يجوز أن يهبط إليه الرصيد
begin
  -- المسار الشائع بلا استعلامٍ واحد: رصيدٌ غير سالب لا سؤال عليه
  if new.points_balance >= 0 then
    return new;
  end if;

  -- سالبٌ ⇒ يُسأل الدفتر: هل أنزله ردٌّ أم إنفاق؟ والقيد العاكس **مستثنى من
  -- جمع (أ)** فلا يستطيع أن يُرفَض، وهو عين «صمّام الأمان» في §١-د.
  select coalesce(sum(e.points) filter (where e.direction <> 'reverse'), 0)::integer,
         coalesce(sum(e.points), 0)::integer
    into v_gross, v_all
  from public.loyalty_entries e
  where e.phone_norm = new.phone_norm;

  -- (أ) لا سحبَ على المكشوف: الإنفاق لا يتجاوز المكسب أبداً
  if v_gross < 0 then
    raise exception
      'رصيد نقاط «%» لا ينزل تحت الصفر إلا بقيدٍ عاكس — مجموع الكسب والاستبدال والتسوية %',
      new.phone_norm, v_gross
      using hint = 'loyalty-overdraw', errcode = 'check_violation';
  end if;

  -- (ب) ولا سلبَ **لا يقوله الدفتر**: الأرضية هي مجموع الدفتر نفسه، فكتابةٌ
  --     مباشرة تتخطّاه (أو حسابٌ بلا قيدٍ واحد) تُرفض. والانحرافُ إلى **أعلى**
  --     يمرّ — ذاك شأن `loyalty_reconcile` لا شأن حاجزٍ يقف في طريق ردّ مال.
  if new.points_balance < v_all then
    raise exception
      'رصيد نقاط «%» (%) أدنى مما يقوله الدفتر (%) — سلبٌ بلا قيدٍ يفسّره',
      new.phone_norm, new.points_balance, v_all
      using hint = 'loyalty-balance-unbacked', errcode = 'check_violation';
  end if;

  return new;
end;
$function$;

comment on function public.loyalty_balance_guard() is
  'حاجز الرصيد بعد 0053: الرصيد يهبط تحت الصفر بقيدٍ عاكس وحده (الموجز §١-د). القاعدة المفحوصة: مجموع القيود غير العاكسة لا ينزل تحت الصفر — فالاستبدال لا يتجاوز المكسب، والردُّ لا يُحجَب. ورمز الخطأ 23514 كما كان check.';

drop trigger if exists loyalty_accounts_balance_guard on public.loyalty_accounts;
create trigger loyalty_accounts_balance_guard
  before insert or update on public.loyalty_accounts
  for each row execute function public.loyalty_balance_guard();

comment on table public.loyalty_accounts is
  'رصيد نقاط العميل مجمَّعاً على الهاتف المعياري (bookings.phone_norm). 🔒 الرصيد مادّيٌّ **ليُقفَل** لا لينقض الدفتر (loyalty-types §٥): redeem_points تقرؤه وتكتبه في معاملةٍ واحدة تحت select … for update، فالإنفاق المزدوج المتزامن مستحيل. ويُطابَق بمجموع loyalty_entries عبر loyalty_reconcile() — وأي فرقٍ عطبٌ لا فارقُ توقيت. و0053: الحاجز صار مُشغّلاً يعرف اتجاه القيد بدل check لا يراه — فالرصيد يسلب بقيدٍ عاكس وحده، ولا يُحجَب ردُّ مالٍ لأن العميل أنفق نقاطه (D-48).';


-- ----------------------------------------------------------------------------
-- (٢) المنح: `revoke` كاملٌ ثم `grant` ما تحتاجه الشاشة **بالضبط**
--
-- والأربعة المعادة هي ما تناديه `app/admin/failure-reasons/actions.ts` حرفياً:
-- `select` (قراءة الكتالوج وقراءة `sort` و`active` قبل التبديل) · `insert`
-- (سببٌ جديد) · `update` (تحرير وتبديل التفعيل) · `delete` (سببٌ لم يُستعمل قط —
-- والمستعمَل يمنعه المفتاح الأجنبي `restrict` بنيوياً، وهو الفخّ الذي أغلقته
-- `0051`). ولا `truncate` ولا `references` ولا `trigger` لأحدٍ منهما.
-- ----------------------------------------------------------------------------

revoke all on table public.failure_reasons  from public, anon, authenticated;
revoke all on table public.booking_failures from public, anon, authenticated;

grant select, insert, update, delete on table public.failure_reasons  to authenticated;
grant select, insert, update, delete on table public.failure_reasons  to service_role;

-- 🔒 صفّ الفشل: قراءةٌ للمشرف فقط، ولا كتابةَ لأحد — الكاتب الوحيد
--    `mark_booking_failed`، وهذا ما يجعل حارس المُشغّل حاجزاً لا عُرفاً.
grant select on table public.booking_failures to authenticated;
grant select, insert, update, delete on table public.booking_failures to service_role;

revoke all on function public.loyalty_balance_guard() from public, anon, authenticated;


-- ----------------------------------------------------------------------------
-- (٣) `dispatch_tick` — الجسم منقولٌ من الكتالوج الحيّ (‏D-58) والتغيير
--     **كلمةٌ واحدة** في شرط الخطوة (٢). ولا سطر آخر تغيّر.
-- ----------------------------------------------------------------------------

create or replace function public.dispatch_tick()
returns table (
  expired_offers integer, new_rounds integer, new_offers integer,
  escalated integer, cancelled integer, processed integer
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_cfg       record;
  v_row       record;
  v_expired   integer := 0;
  v_rounds    integer := 0;
  v_offers    integer := 0;
  v_escalated integer := 0;
  v_cancelled integer := 0;
  v_seen      integer := 0;
begin
  if not public.dispatch_ops_allowed() then
    raise exception 'دورة البث متاحة للمشرف أو لخادم الموقع فقط' using hint = 'forbidden';
  end if;

  -- دورتان متزامنتان: الثانية ترجع أصفاراً بهدوء بدل أن تبثّ مرة ثانية
  if not pg_try_advisory_xact_lock(913006) then
    expired_offers := 0; new_rounds := 0; new_offers := 0;
    escalated := 0; cancelled := 0; processed := 0;
    return next;
    return;
  end if;

  select * into v_cfg from public.dispatch_config();

  -- (١) انتهاء المهل — قبل أي قرار، فالقرار يُبنى على «هل بقي معلّق؟»
  with ex as (
    update public.trip_offers o
       set status = 'expired', responded_at = now()
     where o.status     = 'pending'
       and o.expires_at <= now()
    returning 1
  )
  select count(*) into v_expired from ex;

  -- (٢) حجز خرج من دائرة البث (أُلغي أو اكتمل أو فشل) ⇒ إغلاق الدورة وسحب عروضها
  --     0053: 🔴 `failed` كانت غائبة عن هذه القائمة. الرحلة الفاشلة **نهايةُ
  --     طريق** (§١-ج) تماماً كالملغاة، ودورتُها كانت تبقى `broadcasting` إلى
  --     الأبد لأن الخطوة (٣) تشترط `confirmed` فلا تلتقطها هي الأخرى.
  for v_row in
    select d.booking_id
    from public.dispatches d
    join public.bookings b on b.id = d.booking_id
    where d.status in ('queued', 'broadcasting')
      and b.status in ('cancelled', 'completed', 'failed')
    for update of d
  loop
    update public.trip_offers o
       set status = 'revoked', responded_at = now()
     where o.booking_id = v_row.booking_id
       and o.status     = 'pending';

    update public.dispatches d
       set status = 'cancelled'
     where d.booking_id = v_row.booking_id;

    v_cancelled := v_cancelled + 1;
    v_seen      := v_seen + 1;
  end loop;

  -- (٣) موجة انتهت بلا قبول ⇒ الموجة التالية، أو التصعيد إلى الطابور اليدوي
  --     «انتهت» = لم يبقَ فيها عرض معلّق (انتهت مهلته أو رفضه صاحبه سيّان).
  for v_row in
    select d.booking_id, d.round, d.status
    from public.dispatches d
    join public.bookings b on b.id = d.booking_id
    where d.status in ('queued', 'broadcasting')
      and b.status = 'confirmed'
      and not exists (
        select 1 from public.trip_offers o
        where o.booking_id = d.booking_id and o.status = 'pending'
      )
      and not exists (
        select 1 from public.trip_offers o
        where o.booking_id = d.booking_id and o.status = 'accepted'
      )
    order by d.last_broadcast_at nulls first
    for update of d
  loop
    v_seen := v_seen + 1;

    if v_row.round < v_cfg.max_rounds then
      if v_row.round >= 1 then
        perform public.queue_notification(
          'dispatch_round_expired',
          public.dispatch_trip_payload(v_row.booking_id, false) || jsonb_build_object(
            'round',        v_row.round,
            'maxRounds',    v_cfg.max_rounds,
            'nextRound',    v_row.round + 1,
            'offersCount',  (select count(*) from public.trip_offers o
                              where o.booking_id = v_row.booking_id and o.round = v_row.round),
            'pendingCount', (select count(*) from public.trip_offers o
                              where o.booking_id = v_row.booking_id
                                and o.round = v_row.round and o.status = 'expired')
          )
        );
      end if;

      v_offers := v_offers + public.dispatch_broadcast(v_row.booking_id, v_row.round + 1);
      v_rounds := v_rounds + 1;
    else
      update public.dispatches d set status = 'manual' where d.booking_id = v_row.booking_id;

      perform public.queue_notification(
        'dispatch_exhausted',
        public.dispatch_trip_payload(v_row.booking_id, false) || jsonb_build_object(
          'rounds',      v_row.round,
          'maxRounds',   v_cfg.max_rounds,
          'offersCount', (select count(*) from public.trip_offers o where o.booking_id = v_row.booking_id),
          'pricedCost',  (select b2.subcontractor_cost from public.bookings b2 where b2.id = v_row.booking_id),
          'ceiling',     public.dispatch_ceiling(v_row.booking_id, v_row.round)
        )
      );

      v_escalated := v_escalated + 1;
    end if;
  end loop;

  -- (٤) شبكة أمان البدء التلقائي: حجز مؤكَّد بلا صف دورة أصلاً.
  --     المسار الأساسي أن يستدعي الخادم start_dispatch لحظة التأكيد؛ وهذه
  --     تلتقط ما فات (تعطّل الشبكة، تأكيد من SQL Editor، حجوزات ما قبل المرحلة).
  --     تعمل بعد (٣) عمداً فلا يُعالَج ما بدأ للتوّ مرتين في الدورة نفسها.
  if v_cfg.auto_start then
    for v_row in
      select b.id as booking_id
      from public.bookings b
      left join public.dispatches d on d.booking_id = b.id
      where b.status = 'confirmed'
        and d.booking_id is null
      order by b.created_at
      limit 200
    loop
      insert into public.dispatches as d (booking_id, status)
      values (v_row.booking_id, 'queued')
      on conflict (booking_id) do nothing;

      v_offers := v_offers + public.dispatch_broadcast(v_row.booking_id, 1);
      v_rounds := v_rounds + 1;
      v_seen   := v_seen + 1;
    end loop;
  end if;

  expired_offers := v_expired;
  new_rounds     := v_rounds;
  new_offers     := v_offers;
  escalated      := v_escalated;
  cancelled      := v_cancelled;
  processed      := v_seen;
  return next;
end;
$function$;

comment on function public.dispatch_tick() is
  '0053: الخطوة (٢) تعرف failed كما تعرف cancelled وcompleted — الرحلة الفاشلة نهايةُ طريق، ودورتُها تُغلق وعروضُها المعلّقة تُسحب. وقبلها كانت تبقى broadcasting أبداً لأن الخطوة (٣) تشترط confirmed.';

revoke all on function public.dispatch_tick() from public, anon;
grant execute on function public.dispatch_tick() to authenticated, service_role;


-- ----------------------------------------------------------------------------
-- (٤) `set_trip_crew` — الجسم منقولٌ من الكتالوج الحيّ (‏D-58) وزِيد فيه
--     حارسٌ واحد بعد حارس حالة الدورة مباشرة. لا سطر آخر تغيّر.
--
-- 🔒 ولماذا الحارس على **حالة الحجز** لا على حالة الدورة: `0051` قرّرت أن
--    `dispatches` تبقى `assigned` على الرحلة الفاشلة عمداً — «شاهدةً على من كان
--    مُسنَداً، لا تُصفَّر فيضيع الأثر» (§١-ج). فحارسُ `0043` صحيحٌ ويبقى، لكنه
--    **لا يرى** هذه الحالة أصلاً؛ والسؤال الذي يفصل ليس «هل الدورة حيّة؟» بل
--    «هل ما زال في الرحلة ما يُنفَّذ؟».
--
-- ⚠ و`cancelled` معها في القائمة لا زيادةً بل اتساقاً: كلتاهما «انتهى الطريق»،
--   وكلتاهما تترك الدورة `assigned` فتفلت من حارس `0043` بالطريقة نفسها. وشاشةُ
--   البورتال تُخفي النموذج على الملغاة اليوم — وإخفاءُ نموذجٍ ليس منع نداء.
--
-- ⚠ و`completed` **ليست** في القائمة بقصد: تسجيلُ الطاقم بعد التنفيذ استكمالُ
--   سجلٍّ مشروع (والشاشة تجعله للقراءة عندها)، وتشديدُه قرارٌ مستقل عن هذه
--   الموجة — يُقرأ هذا السطر قبل تغييره.
-- ----------------------------------------------------------------------------

create or replace function public.set_trip_crew(
  p_booking_id uuid,
  p_vehicle_id uuid,
  p_driver_id  uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_sub    uuid;
  v_d      record;
  v_bstat  text;
begin
  v_sub := public.current_subcontractor_id();
  if v_sub is null then
    raise exception 'تسجيل طاقم الرحلة متاح لحساب متعهد فقط' using hint = 'forbidden';
  end if;

  select d.* into v_d from public.dispatches d where d.booking_id = p_booking_id;
  if not found then
    raise exception 'لا دورة إسناد لهذا الحجز' using hint = 'not-found';
  end if;

  if v_d.assigned_subcontractor_id is distinct from v_sub then
    raise exception 'هذه الرحلة ليست ضمن رحلاتك' using hint = 'forbidden';
  end if;

  -- 🔒 حارس الحالة (0043 عيب ٢): دورةٌ عادت إلى الطابور أو أُلغيت ليست رحلةً
  --    جارية، ومن خسرها لا يبدّل ما يراه العميل.
  if v_d.status <> 'assigned' then
    raise exception 'لا يمكن تسجيل الطاقم إلا على رحلة مُسنَدة جارية' using hint = 'forbidden';
  end if;

  -- 🔒 0053: وحارسٌ ثانٍ على **حالة الحجز**. الرحلة الفاشلة تبقى دورتُها
  --    `assigned` بقرار 0051، فيمرّ عليها الحارس الأول — وهي رحلةٌ عليها نزاعٌ
  --    مُسجَّل (سببٌ من الكتالوج وإجراءٌ مالي)، فتبديلُ «من كان يقود» بعد وقوع
  --    الحدث تعديلٌ لسجلٍّ متنازَع عليه لا استكمالُ بيانات.
  select b.status into v_bstat from public.bookings b where b.id = p_booking_id;
  if coalesce(v_bstat, '') in ('failed', 'cancelled') then
    raise exception 'انتهت هذه الرحلة ولا يُعدَّل طاقمها بعد ذلك («%»)', v_bstat
      using hint = 'trip-closed';
  end if;

  if p_vehicle_id is not null and not exists (
    select 1 from public.subcontractor_vehicles v
     where v.id = p_vehicle_id and v.subcontractor_id = v_sub
  ) then
    raise exception 'المركبة ليست من أسطولك' using hint = 'forbidden';
  end if;

  if p_driver_id is not null and not exists (
    select 1 from public.subcontractor_drivers dr
     where dr.id = p_driver_id and dr.subcontractor_id = v_sub
  ) then
    raise exception 'السائق ليس من سجلّك' using hint = 'forbidden';
  end if;

  update public.dispatches
     set assigned_vehicle_id = p_vehicle_id,
         assigned_driver_id  = p_driver_id,
         crew_by_admin       = false,
         crew_at             = now()
   where booking_id = p_booking_id;
end;
$function$;

comment on function public.set_trip_crew(uuid, uuid, uuid) is
  '0053: يضاف إلى حارس حالة الدورة (0043) حارسُ حالة الحجز — لا طاقم يُسجَّل على رحلةٍ failed أو cancelled. دورةُ الفاشلة تبقى assigned بقرار 0051 فتفلت من الحارس الأول، والفاشلة رحلةٌ عليها نزاعٌ مسجَّل.';

revoke all on function public.set_trip_crew(uuid, uuid, uuid) from public, anon;
grant execute on function public.set_trip_crew(uuid, uuid, uuid) to authenticated, service_role;


-- ============================================================================
-- الفحص الذاتي — يمسبر مسباره أولاً، ويبني فيكسترته داخل معاملةٍ فرعية تُرجَع،
-- ولكل تأكيدٍ **طفرةٌ تُبنى ويُثبَت أنها ترفع**. ولا مسار تخطٍّ واحد.
-- ============================================================================

do $$
declare
  v_admin  uuid;
  v_usr    uuid := '00000000-0000-4000-8000-000000005301';
  v_sub    uuid := '5ea11ed0-0000-4000-8000-000000005301';
  v_cls    uuid := 'c0000000-0000-4000-8000-000000005301';
  v_slug   constant text := 'htest-0053';
  v_phone  constant text := '01000005301';
  v_norm   text;
  v_bk     record;
  v_res    record;
  v_a      uuid;
  v_b      uuid;
  v_c      uuid;
  v_veh    uuid;
  v_drv    uuid;
  v_bal    integer;
  v_bal2   integer;
  v_state  text;
  v_msg    text;
  v_n      integer;
  v_tbl    text;
  v_role   text;
  v_priv   text;
begin
  -- ══ (٠) مسبار المسبار — بلا هذه الأسطر يقيس كلُّ ما بعدها «لا شيء يعمل» ══
  select p.id into v_admin from public.profiles p where p.role = 'admin' limit 1;
  if v_admin is null then
    raise exception '0053 (٠): لا مشرف في القاعدة — كل ما يلي كان سيقيس رفضاً لا سلوكاً';
  end if;
  if to_regprocedure('public.loyalty_balance_guard()') is null then
    raise exception '0053 (٠): دالة الحاجز لم تُنشأ — الفحص لا يفحص شيئاً';
  end if;
  if not exists (
    select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
    where c.relname = 'loyalty_accounts' and t.tgname = 'loyalty_accounts_balance_guard'
  ) then
    raise exception '0053 (٠): المُشغّل غير مربوط — دالةٌ بلا مُشغّل لا تحرس شيئاً';
  end if;
  if exists (
    select 1 from pg_constraint c
    where c.conrelid = 'public.loyalty_accounts'::regclass and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%points_balance%>=%0%'
  ) then
    raise exception '0053 (٠): القيد الأعمى ما زال قائماً — الإصلاح لم يقع';
  end if;

  -- ══════════════════════════════════════════════════════════════════════════
  --  (ب) المنح — تُقرأ من `has_table_privilege` لا من السياسات (القاعدة ١٦/١٩)
  --      وتشمل **كل جدولٍ أنشأته الموجة**، لا الجدول الذي شكا منه المراجع.
  -- ══════════════════════════════════════════════════════════════════════════

  -- (ب-٠) مسبار المسبار: لولا هذا لمرّت (ب-١) لو أن السحب أزال كل شيء
  --       وأخفق إعادةُ المنح — «صفر صلاحية» يُرضي فحصاً يبحث عن الغياب وحده.
  for v_tbl, v_priv in
    select * from (values
      ('failure_reasons', 'select'), ('failure_reasons', 'insert'),
      ('failure_reasons', 'update'), ('failure_reasons', 'delete'),
      ('booking_failures', 'select')
    ) t(a, b)
  loop
    if to_regclass('public.' || v_tbl) is null then
      raise exception '0053 (ب-٠): الجدول %.% غير موجود — الموجة لم تُطبَّق', 'public', v_tbl;
    end if;
    if not has_table_privilege('authenticated', ('public.' || v_tbl)::regclass, v_priv) then
      raise exception
        '0053 (ب-٠): 🔴 authenticated فقد «%» على % — الشاشة انكسرت بالسحب ولم يُعَد المنح',
        v_priv, v_tbl;
    end if;
  end loop;

  -- (ب-١) والثلاث التي لا تحرسها RLS أبداً: صفرٌ لكل جدولٍ ولكل دورِ متصفح
  for v_tbl in select unnest(array['failure_reasons', 'booking_failures']) loop
    for v_role in select unnest(array['anon', 'authenticated']) loop
      if not exists (select 1 from pg_roles where rolname = v_role) then
        continue;
      end if;
      for v_priv in select unnest(array['truncate', 'trigger', 'references']) loop
        if has_table_privilege(v_role, ('public.' || v_tbl)::regclass, v_priv) then
          raise exception
            '0053 (ب-١): 🔴 % يملك «%» على % — وRLS لا تحرس TRUNCATE إطلاقاً (القاعدة ١٦ · 0041)',
            v_role, v_priv, v_tbl;
        end if;
      end loop;
    end loop;
  end loop;

  -- (ب-٢) وأوسع: **لا جدولَ واحداً** في المخطط يمنح TRUNCATE لدورِ متصفح.
  --       (مقيسٌ 2026-08-15: `failure_reasons` كان الوحيد في المخطط كله —
  --        فالتأكيد يصير حارساً على الموجات القادمة لا على هذه وحدها.)
  select count(*)::integer into v_n
  from pg_class t
  cross join (values ('anon'), ('authenticated')) r(rolname)
  where t.relnamespace = 'public'::regnamespace
    and t.relkind = 'r'
    and exists (select 1 from pg_roles g where g.rolname = r.rolname)
    and has_table_privilege(r.rolname, t.oid, 'truncate');
  if v_n <> 0 then
    raise exception
      '0053 (ب-٢): 🔴 % منحةَ TRUNCATE لدورِ متصفح في المخطط — RLS لا تراها ولا واحدة', v_n;
  end if;

  -- (ب-٣) والطفرة: يُمنح `truncate` داخل معاملةٍ فرعية ويُثبَت أن التأكيد
  --       أعلاه **يمسكه** — وإلا كان (ب-١) و(ب-٢) يقيسان قراءةً لا تنجح أبداً.
  begin
    execute 'grant truncate on table public.failure_reasons to authenticated';
    if not has_table_privilege('authenticated', 'public.failure_reasons'::regclass, 'truncate') then
      raise exception '0053 (ب-٣): 🔴 المسبار لا يرى منحةً مُنِحت للتوّ — كل نفيٍ أعلاه بلا معنى';
    end if;
    raise exception 'GRANT_MUTANT_0053';
  exception
    when others then
      if sqlerrm <> 'GRANT_MUTANT_0053' then raise; end if;
  end;
  if has_table_privilege('authenticated', 'public.failure_reasons'::regclass, 'truncate') then
    raise exception '0053 (ب-٣): طفرةُ المنحة لم تُرجَع — الفحص ترك أثراً';
  end if;

  raise notice '✔ 0053 (ب): المنح مقروءةٌ من has_table_privilege — صفرُ truncate/trigger/references لدورِ متصفح على جدولَي الموجة، وصفرُ truncate في المخطط كله، والمسبار يمسك طفرته';

  -- ══════════════════════════════════════════════════════════════════════════
  --  الفيكسترة والقياس الحيّ — داخل معاملةٍ فرعية تُرجَع بكاملها
  -- ══════════════════════════════════════════════════════════════════════════
  begin
    update public.loyalty_settings set enabled = true, points_per_currency = 1;
    -- 🔒 يُطفأ البدء التلقائي داخل المعاملة الفرعية وحدها: خطوةُ `dispatch_tick`
    --    الرابعة تبثّ لكل حجزٍ مؤكَّد بلا دورة، ولا شأن لها بما نقيس. (والمقيس
    --    2026-08-15: صفرُ حجزٍ كذلك — فهذا سياجٌ لا إصلاح.)
    update public.dispatch_settings set auto_start = false where id;

    insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                            created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
    values (v_usr, '00000000-0000-0000-0000-000000000000', 'authenticated',
            'authenticated', 'hardening0053@example.invalid', 'x', now(), now(),
            '{}'::jsonb, '{"full_name": "HARDENING_0053 متعهد"}'::jsonb);

    insert into public.subcontractors (id, profile_id, company_name, contact_name, phone, status)
    values (v_sub, v_usr, 'HARDENING_0053 متعهد', 'H', '01000000000', 'approved');

    insert into public.vehicle_classes (id, slug, title, capacity, luggage_capacity, active, sort)
    values (v_cls, v_slug, 'HARDENING_0053 فئة', 1, 4, true, 9053);
    insert into public.tariffs (class_id, per_km, base_fee, min_price,
                                waiting_hour_price, round_trip_factor)
    values (v_cls, 20, 1000, 0, 0, 1.8);

    v_norm := public.normalize_phone(v_phone);
    if v_norm is null then
      raise exception '0053: هاتف الفيكسترة لا يُطبَّع — وعاء النقاط غير موجود';
    end if;

    perform set_config('request.jwt.claims',
      json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

    -- ══ (أ) 🔴 العيب الحرج: رحلةٌ اكتملت ⇒ نقاطٌ سُكّت ⇒ أُنفقت ⇒ ثم فشلت ═════
    select * into v_bk from public.create_booking(
      jsonb_build_object('label', 'H مبدأ', 'lat', 25.0, 'lng', 27.5),
      jsonb_build_object('label', 'H منتهى', 'lat', 24.5, 'lng', 28.2),
      1, false, 0, 100, 90, 'estimate', v_slug, 'full',
      'HARDENING_0053 عميل', v_phone, null, now() + interval '3 days',
      'HARDENING_0053_FIXTURE', null, null, 0, null, 0);
    v_a := v_bk.id;
    update public.bookings set status = 'under_review' where id = v_a;
    update public.bookings set status = 'confirmed'    where id = v_a;
    update public.bookings set status = 'completed'    where id = v_a;

    select a.points_balance into v_bal
      from public.loyalty_accounts a where a.phone_norm = v_norm;
    if coalesce(v_bal, 0) <= 0 then
      raise exception
        '0053 (أ-٠): الاكتمال لم يسكّ نقاطاً (رصيد %) — الطفرة لم تُبنَ وكل ما بعدها يمرّ فوق صفر',
        coalesce(v_bal, 0);
    end if;

    -- حجزٌ ثانٍ يُنفَق عليه الرصيد **كله**: هذه هي الحالة التي كانت تحجب الردّ
    select * into v_bk from public.create_booking(
      jsonb_build_object('label', 'H مبدأ٢', 'lat', 25.0, 'lng', 27.5),
      jsonb_build_object('label', 'H منتهى٢', 'lat', 24.5, 'lng', 28.2),
      1, false, 0, 100, 90, 'estimate', v_slug, 'full',
      'HARDENING_0053 عميل٢', v_phone, null, now() + interval '4 days',
      'HARDENING_0053_FIXTURE', null, null, 0, null, 0);
    v_b := v_bk.id;
    perform public.redeem_points(v_b, v_phone, v_bal, 1);

    select a.points_balance into v_bal2
      from public.loyalty_accounts a where a.phone_norm = v_norm;
    if coalesce(v_bal2, -1) <> 0 then
      raise exception '0053 (أ-٠): الرصيد بعد الإنفاق % لا صفر — الطفرة لم تُبنَ', coalesce(v_bal2, -1);
    end if;

    -- والآن: إعادة التصنيف **يجب أن تنجح**
    select * into v_res from public.mark_booking_failed(
      v_a, 'driver-no-show', 'none', null, 'مبرر التجاوز — فحص 0053');

    if (select b.status from public.bookings b where b.id = v_a) <> 'failed' then
      raise exception
        '0053 (أ-١): 🔴 الحجز بقي «%» — عميلٌ أنفق نقاطه ما زال يمنع completed⇒failed (§١-د · D-48)',
        (select b.status from public.bookings b where b.id = v_a);
    end if;
    if v_res.points_reversed < 1 then
      raise exception '0053 (أ-١): عُكس % قيداً — النقاط بقيت على رحلةٍ فاشلة', v_res.points_reversed;
    end if;

    select a.points_balance into v_bal2
      from public.loyalty_accounts a where a.phone_norm = v_norm;
    if coalesce(v_bal2, 0) >= 0 then
      raise exception
        '0053 (أ-١): الرصيد بعد العكس % — لم يهبط تحت الصفر، فالقيد العاكس لم يُطبَّق كاملاً',
        coalesce(v_bal2, 0);
    end if;
    -- والرصيد المادّي **يطابق الدفتر** ولو كان سالباً — لا حساباً موازياً
    select coalesce(sum(e.points), 0)::integer into v_n
      from public.loyalty_entries e where e.phone_norm = v_norm;
    if v_bal2 <> v_n then
      raise exception '0053 (أ-١): الرصيد % ومجموع الدفتر % — مصدران لرقمٍ واحد (النمط ٨)', v_bal2, v_n;
    end if;

    -- ══ (أ-٢) الطفرة المعاكسة: السحبُ على المكشوف ما زال **ممنوعاً** ═════════
    --    وإلا كان (أ-١) يقيس «أُلغي الحاجز» لا «تعلّم الحاجز الاتجاه».
    v_state := null;
    begin
      insert into public.loyalty_entries (phone_norm, direction, points, note)
      values (v_norm, 'adjust', -100000, 'HARDENING_0053 سحبٌ على المكشوف');
      v_state := '(قُبل)';
    exception when others then
      get stacked diagnostics v_state = returned_sqlstate;
    end;
    if v_state = '(قُبل)' then
      raise exception '0053 (أ-٢): 🔴 قيدٌ غير عاكس أنزل الرصيد تحت الصفر — الحاجز صار باباً';
    end if;
    if v_state <> '23514' then
      raise exception '0053 (أ-٢): الرفض جاء بـ«%» لا 23514 — رمزُ القيد تغيّر ففحوصٌ قائمة تعمى', v_state;
    end if;

    -- (أ-٣) والحاجز على **الجدول** لا داخل كاتبه: كتابةٌ مباشرة تتخطّى الدفتر
    --       تُرفض كذلك — وهي الجهة التي كان `check` يحرسها وحدها.
    --       والطفرة على حسابٍ **جديد بلا قيدٍ واحد**: أرضيته صفر.
    insert into public.loyalty_accounts (phone_norm, points_balance)
    values (public.normalize_phone('01000005399'), 0);
    v_state := null;
    begin
      update public.loyalty_accounts set points_balance = -1
       where phone_norm = public.normalize_phone('01000005399');
      v_state := '(قُبل)';
    exception when others then
      get stacked diagnostics v_state = returned_sqlstate;
    end;
    if v_state = '(قُبل)' then
      raise exception
        '0053 (أ-٣): 🔴 كتابةٌ مباشرة أنزلت الرصيد تحت الصفر بلا قيدٍ يفسّره — الحاجز عرفٌ لا بنية';
    end if;
    if v_state <> '23514' then
      raise exception '0053 (أ-٣): الكتابة المباشرة رُفضت بـ«%» لا 23514', v_state;
    end if;

    -- (أ-٤) وثالثةٌ تُثبت أن (ب) لا يخنق الردّ: الرصيد السالب المطابق للدفتر
    --       يُكتب ثانيةً بلا اعتراض (مسارُ أي مُشغّلٍ يلمس الصفّ بعد العكس).
    update public.loyalty_accounts set updated_at = now() where phone_norm = v_norm;

    raise notice '✔ 0053 (أ): عميلٌ أنفق نقاطه لم يعد يمنع إعادة التصنيف، والرصيد يسلب بالقيد العاكس ويطابق الدفتر — والسحبُ على المكشوف ما زال 23514 ولو كُتب مباشرةً على الجدول';

    -- ══ (ج) دورة البث تُغلق على الفاشلة ══════════════════════════════════════
    --    حجزٌ يبلغ `completed` **ودورتُه ما زالت `broadcasting`** — وهو المسار
    --    الذي كان يخلّد الدورة: (٢) لا تراه و(٣) تشترط `confirmed`.
    select * into v_bk from public.create_booking(
      jsonb_build_object('label', 'H مبدأ٣', 'lat', 25.0, 'lng', 27.5),
      jsonb_build_object('label', 'H منتهى٣', 'lat', 24.5, 'lng', 28.2),
      1, false, 0, 100, 90, 'estimate', v_slug, 'full',
      'HARDENING_0053 عميل٣', v_phone, null, now() + interval '5 days',
      'HARDENING_0053_FIXTURE', null, null, 0, null, 0);
    v_c := v_bk.id;
    update public.bookings set status = 'under_review' where id = v_c;
    update public.bookings set status = 'confirmed'    where id = v_c;

    insert into public.dispatches (booking_id, status, round, last_broadcast_at)
    values (v_c, 'broadcasting', 1, now());
    insert into public.trip_offers (booking_id, subcontractor_id, round, payout,
                                    status, expires_at)
    values (v_c, v_sub, 1, 700, 'pending', now() + interval '30 minutes');

    update public.bookings set status = 'completed' where id = v_c;
    perform * from public.mark_booking_failed(v_c, 'vehicle-breakdown', null, null, null);

    if (select b.status from public.bookings b where b.id = v_c) <> 'failed' then
      raise exception '0053 (ج-٠): الحجز لم يصر failed — الطفرة لم تُبنَ';
    end if;
    -- مسبار المسبار: الدورة **ما زالت مفتوحة** قبل النداء، وإلا قاس الفحص لا شيء
    if (select d.status from public.dispatches d where d.booking_id = v_c) <> 'broadcasting' then
      raise exception '0053 (ج-٠): الدورة ليست broadcasting قبل النداء — لا شيء يُغلَق';
    end if;

    perform * from public.dispatch_tick();

    if (select d.status from public.dispatches d where d.booking_id = v_c) <> 'cancelled' then
      raise exception
        '0053 (ج-١): 🔴 دورةُ رحلةٍ فاشلة بقيت «%» بعد dispatch_tick — الدورة لا تُغلق أبداً',
        (select d.status from public.dispatches d where d.booking_id = v_c);
    end if;
    select count(*)::integer into v_n
      from public.trip_offers o where o.booking_id = v_c and o.status = 'pending';
    if v_n <> 0 then
      raise exception '0053 (ج-١): بقي % عرضاً معلّقاً على رحلةٍ فاشلة — العروض لم تُسحب', v_n;
    end if;

    raise notice '✔ 0053 (ج): دورةُ البث تُغلق على الرحلة الفاشلة وتُسحب عروضها المعلّقة';

    -- ══ (د) الطاقم لا يُبدَّل على رحلةٍ انتهى طريقها ═════════════════════════
    -- أسماء الأعمدة مقروءةٌ من الكتالوج لا من الذاكرة (القاعدة ١٤):
    -- `subcontractor_drivers.name` لا `full_name`، و`subcontractor_vehicles.class_slug`
    -- إلزاميٌّ بمفتاحٍ أجنبي إلى `vehicle_classes.slug`.
    insert into public.subcontractor_vehicles (subcontractor_id, class_slug, label, plate, active)
    values (v_sub, v_slug, 'HARDENING_0053 مركبة', 'HH 5301', true) returning id into v_veh;
    insert into public.subcontractor_drivers (subcontractor_id, name, phone, active)
    values (v_sub, 'HARDENING_0053 سائق', '01000000001', true) returning id into v_drv;

    -- رحلةٌ رابعة مُسنَدة فعلاً — الطفرة تحتاج دورةً `assigned` بحق
    select * into v_bk from public.create_booking(
      jsonb_build_object('label', 'H مبدأ٤', 'lat', 25.0, 'lng', 27.5),
      jsonb_build_object('label', 'H منتهى٤', 'lat', 24.5, 'lng', 28.2),
      1, false, 0, 100, 90, 'estimate', v_slug, 'full',
      'HARDENING_0053 عميل٤', v_phone, null, now() + interval '6 days',
      'HARDENING_0053_FIXTURE', null, null, 0, null, 0);
    v_a := v_bk.id;
    update public.bookings set status = 'under_review' where id = v_a;
    update public.bookings set status = 'confirmed'    where id = v_a;
    insert into public.dispatches (booking_id, status, round,
                                   assigned_subcontractor_id, assigned_payout, assigned_at)
    values (v_a, 'assigned', 1, v_sub, 700, now());
    update public.bookings set status = 'assigned' where id = v_a;

    -- ينتحل المتعهد: القياس بنداءٍ حيّ بدور صاحبه لا بقراءة نصّ (القاعدة ١٩)
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_usr, 'role', 'authenticated')::text, true);
    if public.current_subcontractor_id() is distinct from v_sub then
      raise exception '0053 (د-٠): الانتحال لم ينجح — القياس التالي بلا معنى';
    end if;

    -- (د-١) 🔒 الطفرة المعاكسة أولاً: على رحلةٍ حيّة **يمرّ** النداء
    perform public.set_trip_crew(v_a, v_veh, v_drv);
    if (select d.assigned_driver_id from public.dispatches d where d.booking_id = v_a)
       is distinct from v_drv then
      raise exception '0053 (د-١): تسجيل الطاقم على رحلةٍ حيّة لم يقع — الحارس يمنع الجميع';
    end if;

    -- (د-٢) ثم تُعلَّم فاشلة، فيُرفض النداء نفسه
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
    perform * from public.mark_booking_failed(v_a, 'driver-no-show', null, 200, null);
    if (select d.status from public.dispatches d where d.booking_id = v_a) <> 'assigned' then
      raise exception
        '0053 (د-٢): دورةُ الرحلة الفاشلة لم تبقَ assigned — الطفرة لم تُبنَ، والحارس الأول يكفي';
    end if;

    perform set_config('request.jwt.claims',
      json_build_object('sub', v_usr, 'role', 'authenticated')::text, true);
    v_state := null; v_msg := null;
    begin
      perform public.set_trip_crew(v_a, null, null);
      v_state := '(قُبل)';
    exception when others then
      get stacked diagnostics v_msg = message_text;
    end;
    if v_state = '(قُبل)' then
      raise exception
        '0053 (د-٢): 🔴 المتعهد بدّل طاقم رحلةٍ عُلِّمت فاشلة — سجلٌّ متنازَع عليه قابل لإعادة الكتابة';
    end if;
    if v_msg not like '%انتهت هذه الرحلة%' then
      raise exception '0053 (د-٢): الرفض جاء برسالة «%» — ليست رسالة الحارس الجديد', v_msg;
    end if;
    -- ولا أثر: الطاقم كما سُجّل قبل الفشل
    if (select d.assigned_driver_id from public.dispatches d where d.booking_id = v_a)
       is distinct from v_drv then
      raise exception '0053 (د-٢): الرفض ترك أثراً — الطاقم تغيّر رغم رفع الاستثناء';
    end if;

    perform set_config('request.jwt.claims', '', true);

    raise notice '✔ 0053 (د): الطاقم يُسجَّل على الرحلة الحيّة ولا يُبدَّل بعد أن تُعلَّم فاشلة — والرفض بلا أثر';

    raise exception 'HARDENING_0053_ROLLBACK';
  exception
    when others then
      execute 'reset role';
      perform set_config('request.jwt.claims', '', true);
      if sqlerrm <> 'HARDENING_0053_ROLLBACK' then raise; end if;
  end;

  raise notice '✔ 0053: الرصيد يسلب بالقيد العاكس وحده فلا يُحجَب ردٌّ · وصفرُ TRUNCATE لدورِ متصفح في المخطط كله · ودورةُ البث تُغلق على الفاشلة · والطاقم لا يُبدَّل بعدها — وصفر أثر';
end;
$$;
