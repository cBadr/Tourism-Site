-- ============================================================================
-- 0099_notification_atomic_claim.sql
--   مطالبةٌ ذرّية لطابور الإشعارات — عاملٌ واحد يأخذ الصف، والخاسر لا يأخذ شيئاً
--
-- تصليبٌ فوق `0007` (‏§٢-٦ طابور Outbox) و`0054` و`0077`. **ولا يُعدَّل حرفٌ في
-- أيٍّ منها** — مطبَّقة (D-58).
--
-- ── العطب كما قِيس، لا كما يُظنّ ─────────────────────────────────────────────
--
-- عاملُ الإشعارات (`lib/notifications/dispatch.ts`) يقرأ الطابور بهذا حرفياً:
--
--     select * from public.notifications
--      where status = 'queued' order by created_at asc limit 50
--
-- ثم **يُسلّم على القنوات** (تليجرام · بريد · دفع ويب)، ثم يكتب الحالة على الصف
-- في نداءٍ مستقل. وكلُّ نداء PostgREST معاملةٌ وحده (D-48) — فبين القراءة
-- والكتابة نافذةٌ مفتوحة بطول التسليم نفسه، ولا شيء يحجز الصف فيها.
--
-- **والقياس (2026-08-17، ثلاث صفوف بقناة `dashboard` وحدها، أُرجعت):**
--
--     الوصلة A رأت 3 من صفوفي: [1,2,3]
--     الوصلة B رأت 3 من صفوفي: [1,2,3]
--     صفوفٌ طالبتها الوصلتان معاً: 3
--     وبعد أن كتبت الوصلتان: status=sent · attempts=**1**
--
-- أي أن **الصف الواحد يُسلَّم مرتين، والعدّاد يقول «محاولةٌ واحدة»**: كلٌّ قرأ
-- `attempts = 0` فكتب `1`. فالتكرار لا أثر له في السجل — وهذا أسوأ ما فيه.
--
-- ── ولماذا هذه النافذة ليست نظرية ────────────────────────────────────────────
--
-- | المقيس | القيمة | من أين |
-- |---|---|---|
-- | جدولةُ العامل | **كل دقيقة** `* * * * *` | `vercel.json` · و`docs/CPANEL.md` نفس السطر لـcron النظام |
-- | ميزانيةُ الدورة | ٢٠ ثانية | `TIME_BUDGET_MS` — وتُفحَص **قبل كل شريحة** لا داخلها |
-- | أبطأ قناة في الشريحة | ٨ ث تليجرام · ٨ ث بريد · ١٠ ث دفع ويب | `TIMEOUT_MS` في الثلاثة |
--
-- ⇒ دورةٌ واحدة قد تتجاوز الدقيقة، فتبدأ الدورة التالية فوقها. ويُضاف إليها زرُّ
-- «تشغيل الآن» في اللوحة، وأيُّ إعادة محاولة.
--
-- و`let running = false` في وحدة العامل **ليس ضماناً**: متغيّرٌ داخل عمليةٍ
-- واحدة. عمليتان (‏`pm2` بأكثر من نسخة، أو دالةٌ بلا حالة على المنصّة) تحملان
-- علَمَين مستقلَّين، ولا يرى أحدهما الآخر.
--
-- 🔴 **والضرر ليس رسالةَ اختبار**: `trip_offered` يذهب إلى تليجرام متعهدٍ حقيقي.
-- عرضُ رحلةٍ يصل مرتين لا يُستدعى، ويقرؤه إنسان.
--
-- ── ما بُني: مطالبةٌ في Postgres لا في TypeScript ────────────────────────────
--
-- بيانٌ **واحد** ينقل الصف من «حرّ» إلى «مطالَبٍ به» ويُرجعه في النفس نفسه:
--
--     with candidate as (select id … for update skip locked)
--     update public.notifications set claimed_at = now(), attempts = attempts + 1
--       from candidate returning *;
--
-- و`SKIP LOCKED` هي الفرق بين «الخاسر ينتظر» و«الخاسر لا يأخذ شيئاً»: العامل
-- الثاني لا يُحجب ولا يُرجَّع، بل يمضي إلى صفوفٍ أخرى.
--
-- ⚠ **وحاجزان لا حاجز**، لأن كلَّ نداءٍ معاملةٌ تُغلق فوراً فتُفرَج أقفالها:
--   ١. `FOR UPDATE SKIP LOCKED` — للتزامن **داخل** اللحظة نفسها.
--   ٢. `claimed_at` ومهلةُ الرؤية — للتزامن **المتتالي** (دورةُ الدقيقة التالية).
-- الأول وحده يحمي المتراكبين، والثاني وحده لا يحمي المتزامنين. والاثنان معاً هما
-- الضمان: **صفٌّ يخرج من «حرّ» مرةً واحدة.**
--
-- ── وما لم يُبنَ بقصد، ولماذا ────────────────────────────────────────────────
--
-- **لا حالةَ `sending` جديدة.** المخطط يحصر `status` في أربع، ويعدّها
-- `getQueueStats()` أربعاً، وتعدّها شاشة الإشعارات أربعاً (‏`STATUS_KEYS`).
-- فحالةٌ خامسة تجعل الصفَّ **قيد الإرسال غيرَ مرئيٍّ للمالك** — أي تحوّل
-- «أُرسل مرتين» إلى «عالقٌ ولا أحد يراه». فالصفُّ المطالَب به يبقى `queued`،
-- ويظهر في الشاشة كما كان، و`claimed_at` عمودٌ إضافي لا بديل.
--
-- ── ومهلة الرؤية: ٣ دقائق، والرقم مُختار لا افتراضي ─────────────────────────
--
-- أطولُ بقاءٍ ممكن لصفٍّ في يد عاملٍ **حيّ** = ٢٠ ث (الميزانية) + ١٠ ث (أبطأ
-- قناة في الشريحة الأخيرة) ≈ **٣٠ ث**. فمهلةٌ أقصر منها تعني إعادةَ مطالبةٍ
-- بصفٍّ **قيد الإرسال الآن** — أي العيبُ نفسه بثوبٍ جديد. و٣ دقائق = ستةُ أضعاف
-- المقيس، على مضيفٍ ثبت أنه يُجمّد طلباً ٨٠+ ثانية (‏`OPEN-DEFECTS-2026-08-17`).
-- والثمن في الاتجاه الآخر: عاملٌ مات بعد المطالبة يتأخّر صفُّه ≤ ٣ دقائق + دورة
-- ⇒ ≤ ٤ دقائق، من نافذةِ عرضٍ طولها ٣٠ دقيقة (‏`DEFAULT_DISPATCH.windowMinutes`).
--
-- ── وسقفُ المحاولات: خمس، ثم يُقال ذلك صراحةً ────────────────────────────────
--
-- مهلةُ الرؤية وحدها تصنع حلقةً لا تنتهي في حالةٍ واحدة: صفٌّ سُلّم فعلاً ثم
-- **فشلت كتابةُ حصيلته** بدرجاتها الثلاث (‏`writeResult`) — فيبقى `queued` فيُطالَب
-- به كل ٣ دقائق ويُسلَّم كل ٣ دقائق إلى الأبد. فبعد ٥ محاولاتٍ يُنقَل الصفُّ إلى
-- `failed` بنصٍّ عربيٍّ يسمّي السبب، فيراه المالك في شاشته ويعيده بزرّه.
--
-- 🔒 وإعادةُ المالك تعمل فعلاً: النقل إلى `failed` **يُصفّر `claimed_at`**،
-- والمطالبة تقبل الصفَّ الذي `claimed_at` فيه فارغة مهما كان عدّاده. فالسقف
-- يحدّ الآلة ولا يحدّ الإنسان — ولولا ذلك لصار زرُّ «إعادة المحاولة» زرّاً ميتاً.
--
-- ── والصلاحية: `service_role` وحده — والفشل مغلقاً ───────────────────────────
--
-- الدالة `security invoker` **بقصد**: العاملُ يعمل بمفتاح الخدمة، و`service_role`
-- له `rolbypassrls` (مقيس) فيمرّ. ولو وُسِّع المنح يوماً إلى `authenticated`
-- فستحكمه RLS: سياسةُ `notifications` تشترط `is_admin()`، فالمتعهد يرى صفراً
-- ولا يطالب بشيء. و`security definer` كانت ستعطيه الجدول كاملاً — وفيه اسمُ
-- العميل وهاتفه وإجماليه (D-19)، و`authenticated` تشمل كلَّ متعهد (D-20).
--
-- المرجع: 0007 (§٢-٦) · 0054 · 0077 · D-48 · D-19 · D-20 · D-58
--         · `lib/notifications/dispatch.ts` · `supabase/tests/notify_claim_tests.sql`
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (١) العمود — «مَن أخذ هذا الصف، ومتى»
--
-- والفهرس القائم `notifications_status_created_at_idx (status, created_at)` هو
-- مسارُ المطالبة نفسه، فلا فهرسَ جديد: `status = 'queued'` انتقاءٌ حادّ،
-- و`claimed_at` و`attempts` تُصفَّى على الصفوف القليلة الباقية.
-- ----------------------------------------------------------------------------

alter table public.notifications
  add column if not exists claimed_at timestamptz;

comment on column public.notifications.claimed_at is
  'لحظةُ آخر مطالبةٍ بالصف من عامل الإرسال. الصفُّ المطالَب به يبقى status=queued '
  'كي يظل مرئياً في شاشة المالك، ولا يُطالَب به ثانيةً قبل انقضاء مهلة الرؤية — '
  'وهي معاً (مع FOR UPDATE SKIP LOCKED) ما يمنع تسليماً حقيقياً مكرَّراً (0099).';

-- ----------------------------------------------------------------------------
-- (٢) المطالبة — بيانٌ واحد يُخرج الصف من «حرّ»، والخاسر لا يأخذ شيئاً
-- ----------------------------------------------------------------------------

create or replace function public.claim_notifications(
  p_limit           integer  default 50,
  p_visible_timeout interval default interval '3 minutes',
  p_max_attempts    integer  default 5
)
returns setof public.notifications
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_limit   integer  := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_timeout interval := coalesce(p_visible_timeout, interval '3 minutes');
  v_max     integer  := greatest(coalesce(p_max_attempts, 5), 1);
begin
  /**
   * (أ) الصفوف التي استنفدت محاولاتها **وانقضت مهلتُها** ⇒ تُنقَل إلى `failed`
   *     بسببٍ مقروء. وشرطُ المهلة ليس زينة: صفٌّ عدّاده ٥ ومطالَبٌ به قبل ثانية
   *     قد يكون **قيد الإرسال الآن**، فإخراجه من الطابور يكسر تسليماً جارياً.
   *
   * 🔒 و`claimed_at = null` هي مخرجُ الإنسان: زرُّ «إعادة المحاولة» يعيد الحالة
   *    إلى `queued`، فتقبله (ب) لأن `claimed_at` فارغة — مرةً واحدة، ثم يعود
   *    السقف. فالسقف يحدّ الحلقة الآلية ولا يُسقط قرار المالك.
   */
  update public.notifications n
     set status     = 'failed',
         claimed_at = null,
         error      = left(
           coalesce(nullif(btrim(coalesce(n.error, '')), '') || ' · ', '')
           || 'أُوقف تلقائياً بعد ' || v_max
           || ' محاولةِ إرسالٍ بلا حصيلةٍ مكتوبة — أعِد المحاولة من هذه الشاشة بعد فحص القناة',
           2000)
   where n.id in (
     select c.id
       from public.notifications c
      where c.status = 'queued'
        and c.attempts >= v_max
        and c.claimed_at is not null
        and c.claimed_at < now() - v_timeout
      order by c.created_at asc
      limit v_limit
      for update skip locked
   );

  /**
   * (ب) المطالبة نفسها — **بيانٌ واحد**: انتقاءٌ بقفلٍ يتخطّى المقفول، وتحديثٌ
   *     يُرجع الصفوف. لا لحظةَ فراغٍ بين «رأيتُه» و«حجزتُه».
   *
   *     ولا يُطالَب بصفٍّ:
   *       • حالته ليست `queued`            — انتهى أمره
   *       • مطالَبٌ به ومهلتُه لم تنقضِ     — في يد عاملٍ حيّ
   *       • استنفد محاولاته و`claimed_at` مضبوطة — حلقةٌ يجب أن تتوقف
   *     ويُطالَب به إن كانت `claimed_at` فارغة أصلاً (صفٌّ جديد، أو أعاده إنسان).
   */
  return query
    with candidate as (
      select c.id
        from public.notifications c
       where c.status = 'queued'
         and (c.claimed_at is null or c.claimed_at < now() - v_timeout)
         and (c.claimed_at is null or c.attempts < v_max)
       order by c.created_at asc
       limit v_limit
       for update skip locked
    ),
    claimed as (
      update public.notifications n
         set claimed_at = now(),
             attempts   = n.attempts + 1
        from candidate k
       where n.id = k.id
      returning n.*
    )
    select * from claimed;
end;
$$;

comment on function public.claim_notifications(integer, interval, integer) is
  'مطالبةٌ ذرّية بطابور الإشعارات: بيانٌ واحد ينقل الصف من «حرّ» إلى «مطالَبٍ به» '
  'ويُرجعه. FOR UPDATE SKIP LOCKED يحمي المتزامنين (والخاسر لا يأخذ شيئاً بدل أن '
  'ينتظر)، و`claimed_at` مع مهلة الرؤية تحمي المتتالين — والعامل يعمل كل دقيقة '
  'ودورتُه قد تتجاوز الدقيقة. عدّاد المحاولات تملكه المطالبة لا كتابةُ الحصيلة، '
  'فمحاولةٌ مات صاحبها تبقى محسوبة. صلاحيةُ التنفيذ لـservice_role وحده (0099).';

-- ----------------------------------------------------------------------------
-- (٣) الصلاحية — المنحُ هو الحارس (القاعدة الذهبية ١٦)
--
-- الدالة تُرجع الصفَّ كاملاً: اسمُ العميل وهاتفه وإجماليه في `payload`. فلا
-- `authenticated` ولا `anon` — و`authenticated` **تشمل كل متعهد** (D-20).
-- ----------------------------------------------------------------------------

revoke all on function public.claim_notifications(integer, interval, integer)
  from public, anon, authenticated;
grant execute on function public.claim_notifications(integer, interval, integer)
  to service_role;

-- ----------------------------------------------------------------------------
-- (٤) حارسٌ بنيوي يفشل بصوت — يُشغَّل الآن، ويُرجَع بكامله
--
-- النمط ٩ في `LESSONS.md`: فحصٌ لا يمكن أن يفشل ليس فحصاً. فكلُّ تأكيدٍ هنا
-- **يُنادي الدالة فعلاً** ويقيس صفوفاً، ولا يقرأ تعريفاً ويطمئن.
--
-- ⚠ وما لا يُقاس هنا بصدق: التزامنُ الحقيقي بوصلتين. الملفُّ يُنفَّذ في جلسةٍ
--    واحدة، و`dblink` غير مثبَّتة و`max_prepared_transactions = 0` (مقيسان).
--    فيُقاس هنا **التتالي** (وهو مسار الإنتاج: دورةُ الدقيقة فوق سابقتها)،
--    ويُقاس التزامنُ بوصلتين خارج SQL — والحصيلة في تقرير الورشة.
-- ----------------------------------------------------------------------------

do $$
declare
  v_a     constant uuid := '0e99a000-0000-4000-8000-00000000001a';
  v_b     constant uuid := '0e99a000-0000-4000-8000-00000000002b';
  v_n     integer;
  v_att   integer;
  v_st    text;
  v_err   text;
  v_base  integer;
begin
  select count(*)::integer into v_base from public.notifications;

  begin
    -- صفّان `queued` **بقناة dashboard وحدها**: لو التقطتهما دورةٌ حقيقية في
    -- هذه اللحظة فلا تسليمَ خارجياً واحداً. و`read_at/dismissed_at` مضبوطتان
    -- فلا يظهران في جرس المالك أصلاً.
    insert into public.notifications
      (id, event, payload, channels, status, attempts, recipient_kind, read_at, dismissed_at, created_at)
    values
      (v_a, '_0099_claim_probe', '{}'::jsonb, array['dashboard']::text[], 'queued', 0, 'ops',
       now(), now(), now() - interval '20 seconds'),
      (v_b, '_0099_claim_probe', '{}'::jsonb, array['dashboard']::text[], 'queued', 0, 'ops',
       now(), now(), now() - interval '10 seconds');

    -- (أ) المطالبة الأولى تأخذ الصفّين، وتُقدّم الأقدم
    select count(*)::integer into v_n
    from public.claim_notifications(50) c where c.id in (v_a, v_b);
    if v_n <> 2 then
      raise exception '0099(أ): المطالبة أخذت % صفاً من ٢ — الطابور لا يُقرأ أصلاً', v_n;
    end if;

    -- (ب) 🔴 والثانية **لا تأخذ شيئاً** — وهذا هو التأكيد الذي يسقط على كود
    --     اليوم: `select … where status = 'queued'` يُرجع الصفّين ثانيةً،
    --     فيُسلَّم العرض مرتين إلى إنسان.
    select count(*)::integer into v_n
    from public.claim_notifications(50) c where c.id in (v_a, v_b);
    if v_n <> 0 then
      raise exception
        '0099(ب): 🔴 مطالبةٌ ثانية أخذت % صفاً مطالَباً به — تسليمٌ حقيقيٌّ مكرَّر (عرضُ رحلةٍ يصل مرتين)', v_n;
    end if;

    -- (ج) والحالة لم تُغيَّر: الصفُّ المطالَب به يبقى `queued` فيراه المالك،
    --     وعدّادُه ارتفع مرةً واحدة لكل مطالبة
    select status, attempts into v_st, v_att from public.notifications where id = v_a;
    if v_st <> 'queued' then
      raise exception '0099(ج): الصفُّ المطالَب به صار «%» — وحالةٌ خارج الأربع تُخفيه عن شاشة المالك', v_st;
    end if;
    if v_att <> 1 then
      raise exception '0099(ج): العدّاد % بعد مطالبةٍ واحدة والمتوقع ١', v_att;
    end if;

    -- (د) مهلةُ الرؤية: عاملٌ مات بعد المطالبة ⇒ الصفُّ يعود للعمل، ولا يُحتجز
    update public.notifications set claimed_at = now() - interval '30 minutes'
     where id in (v_a, v_b);
    select count(*)::integer into v_n
    from public.claim_notifications(50) c where c.id in (v_a, v_b);
    if v_n <> 2 then
      raise exception
        '0099(د): بعد انقضاء المهلة عاد % صفاً من ٢ — عاملٌ يموت بعد المطالبة يحتجز العرض إلى الأبد', v_n;
    end if;

    -- (هـ) ومهلةٌ **لم تنقضِ** لا تُعيد شيئاً ولو طُلبت مهلةٌ أطول صراحةً —
    --      فالمعامل يعمل، ولا تمرّ المطالبة على «كل الصفوف» بلا شرط
    update public.notifications set claimed_at = now() - interval '90 seconds'
     where id in (v_a, v_b);
    select count(*)::integer into v_n
    from public.claim_notifications(50, interval '3 minutes') c where c.id in (v_a, v_b);
    if v_n <> 0 then
      raise exception '0099(هـ): صفٌّ مطالَبٌ به قبل ٩٠ ثانية أُخذ ثانيةً بمهلة ٣ دقائق — الشرط ساقط';
    end if;
    select count(*)::integer into v_n
    from public.claim_notifications(50, interval '60 seconds') c where c.id in (v_a, v_b);
    if v_n <> 2 then
      raise exception '0099(هـ): مهلةُ ٦٠ ثانية لم تُعِد الصفّين — المعامل لا يُقرأ';
    end if;

    -- (و) السقف: صفٌّ استنفد محاولاته وانقضت مهلتُه يُنقَل إلى `failed` بسببٍ
    --     مقروء — فلا يُسلَّم إلى الأبد كل ٣ دقائق
    update public.notifications set attempts = 5, claimed_at = now() - interval '30 minutes'
     where id = v_a;
    perform * from public.claim_notifications(50);
    select status, error into v_st, v_err from public.notifications where id = v_a;
    if v_st <> 'failed' then
      raise exception '0099(و): صفٌّ بخمس محاولاتٍ ما زال «%» — حلقةُ تسليمٍ لا تنتهي', v_st;
    end if;
    if v_err is null or v_err = '' then
      raise exception '0099(و): أُوقف الصفُّ بلا سبب مكتوب — والمالك يقرأ هذا العمود';
    end if;

    -- (ز) 🔒 وإعادةُ الإنسان تعمل: نفس ما يكتبه زرُّ «إعادة المحاولة»
    --     (‏`status = queued, error = null`) يجعل الصفَّ مطالَباً به مرةً أخرى
    --     رغم أن عدّاده ٥ — لأن النقل إلى `failed` صفّر `claimed_at`
    if (select claimed_at from public.notifications where id = v_a) is not null then
      raise exception '0099(ز): claimed_at لم تُصفَّر عند الإيقاف — زرُّ إعادة المحاولة يصير زرّاً ميتاً';
    end if;
    update public.notifications set status = 'queued', error = null where id = v_a;
    select count(*)::integer into v_n
    from public.claim_notifications(50) c where c.id = v_a;
    if v_n <> 1 then
      raise exception '0099(ز): 🔴 صفٌّ أعاده المالك لم يُطالَب به — السقفُ صار يحدّ الإنسان لا الآلة';
    end if;

    -- (ح) والصلاحية: لا دورَ متصفحٍ يملك تنفيذ الدالة (المنحُ هو الحارس)
    select count(*)::integer into v_n
    from (values ('anon'), ('authenticated')) r(role)
    where has_function_privilege(
      r.role, 'public.claim_notifications(integer,interval,integer)'::regprocedure, 'execute');
    if v_n <> 0 then
      raise exception
        '0099(ح): 🔴 % دورَ متصفحٍ يملك تنفيذ المطالبة — وهي تُرجع اسم العميل وهاتفه وإجماليه (D-19 · D-20)', v_n;
    end if;

    -- (ط) والبيان **واحد** بقفلٍ يتخطّى المقفول: هذا ما يحمي المتزامنين، ولا
    --     يقيسه تتالي (أ)–(ز). فحصٌ بنيوي مُعلَن بضعفه، لا بديلٌ عن قياس حيّ.
    if pg_get_functiondef('public.claim_notifications(integer,interval,integer)'::regprocedure)
       not ilike '%for update skip locked%' then
      raise exception '0099(ط): تعريف المطالبة بلا FOR UPDATE SKIP LOCKED — الخاسر ينتظر أو يُكرّر';
    end if;

    raise exception '0099_ROLLBACK';
  exception
    when others then
      if sqlerrm <> '0099_ROLLBACK' then raise; end if;
  end;

  -- 🔒 صفر أثر — وهذه قاعدةُ الإنتاج نفسها: صفٌّ `queued` باقٍ يُسلَّم فعلاً
  select count(*)::integer into v_n from public.notifications;
  if v_n <> v_base then
    raise exception '0099: بقي أثر — الإشعارات % والأساس %', v_n, v_base;
  end if;

  raise notice '0099 ✔ مطالبةٌ ذرّية: صفٌّ يخرج من «حرّ» مرةً واحدة (المطالبة الثانية صفر صفاً) · وحالته تبقى queued فيراه المالك · ومهلةُ الرؤية ٣ دقائق تُعيد صفَّ عاملٍ مات ولا تلمس صفَّ عاملٍ حيّ · وسقفُ ٥ محاولات يُوقف الحلقة بسببٍ مكتوب و**يُصفّر claimed_at فيبقى زرُّ المالك عاملاً** · وصفر دورِ متصفحٍ يملك التنفيذ · وصفر أثر';
end;
$$;

-- ⚠ ولا سطرَ تسجيلٍ في `schema_migrations` هنا: المُشغِّل (`scripts/db-migrate.mjs`)
--    يكتبه بنفسه بعد نجاح الملف.
