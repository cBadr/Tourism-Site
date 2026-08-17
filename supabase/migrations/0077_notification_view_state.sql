-- ============================================================================
-- 0077_notification_view_state.sql — الجرس يصير طابور «ما هو جديد»،
--                                    والسجلّ يبقى سجلّاً كاملاً لا يُحذف منه صف
--
-- ── بلاغ المالك (2026-08-16) ────────────────────────────────────────────────
--
-- «الإشعارات تظل موجودة حتى بعد عرضها وهو أمر قد يربك مدير النظام… أقترح أن
--  يتم إخفاء الإشعارات المقروءة، وأيضاً يجب أن يكون هناك خيار لمسح كل
--  الإشعارات.»
--
-- ── 🔴 القرار الذي يحكم الملف كله: «مسح» **حالةُ عرض** لا `delete` ──────────
--
-- جدول `notifications` **سجلُّ تسليم لا قائمةُ واجهة**: كل صفٍّ يقول ماذا
-- أُرسل، ولمن، وعلى أي قناة، وبأي حصيلة. وفي 2026-08-16 شُخِّص عيبٌ حقيقي —
-- ‏`trip_offered` لا يبلغ أحداً — **من هذه الصفوف نفسها**. فحذفُ صفٍّ اليوم
-- يعني أن عطل التسليم القادم لا يُشخَّص أصلاً.
--
-- ولذلك: **الإخفاء يُكتب ولا يُمحى**. عمودان يقولان ما فعله المالك بعينه:
--   • `read_at`      — رآه. (**موجودٌ منذ `0054`** ولم يُضَف هنا — قيس قبل
--                      الكتابة: العمود قائم و`portal_inbox_mark_read` تكتبه
--                      للمتعهد، ولا سطر واحد يكتبه لفريق التشغيل.)
--   • `dismissed_at` — كنسه من الجرس **بلا أن يدّعي أنه قرأه**. وهذا هو
--                      «مسح الكل» الذي طلبه: يُفرِغ الجرس، ويترك السجل كما هو،
--                      ويسجّل بصدقٍ أن ما كُنس لم يُقرأ.
--
-- والفرق بين العمودين ليس تزيّناً: «كنستُ ٤٠ إشعاراً بلا قراءة» معلومةٌ
-- تشغيلية — لو تكرّرت فالجرس يُغرَق بما لا يستحق الجرس، وذلك عيبُ توجيهٍ
-- يُقرأ من العمود.
--
-- ── ولماذا دوالٌّ مسمّاة بدل `update` مباشرٍ من PostgREST ───────────────────
--
-- سياسة `notifications_update_admin` تسمح للإداري أصلاً بالكتابة على الصف،
-- فالدوالُّ ليست فتحَ بابٍ جديد بل **تضييقُ الباب القائم**، لثلاثة أسباب
-- مقيسة:
--
--   ١) 🔴 **صفوف المتعهدين ليست ملكَ المالك ليقرأها عنهم.** `read_at` على صفٍّ
--      ‏`recipient_kind = 'partner'` هو علامةُ قراءة **المتعهد** في صندوق
--      البورتال (`portal_inbox_mark_read` في `0054`). و«تعليم الكل كمقروء»
--      مكتوباً كـ`update … where read_at is null` من المتصفح كان **سيُطفئ
--      صناديق كل المتعهدين دفعةً واحدة** — عرضٌ معلّقٌ يصير مقروءاً بلا أن
--      يفتحه صاحبه. فشرطُ `recipient_kind = 'ops'` هنا **حارسٌ لا ترشيح**،
--      وهو مفروضٌ داخل الدالة حيث لا تنساه واجهة.
--   ٢) «الكل» بيانٌ واحد لا ٧٢٥ نداءً (العدد مقيسٌ حياً لحظة كتابة الملف).
--   ٣) مسارٌ مسمّى يُختبَر بطفرة — و`update` من الواجهة لا يُختبَر إلا بقراءة
--      الواجهة.
--
-- ── وما لا يُضاف هنا عمداً ──────────────────────────────────────────────────
--
-- **لا منحَ `delete` لأحد، ولا دالةَ حذفٍ واحدة.** و`authenticated` لا تملكه
-- أصلاً (مقيسٌ من `role_table_grants`) — والسطر في (٥) يجعل ذلك **مفروضاً
-- مكتوباً** لا صدفةَ إعداد، ويُختبَر في `notification_tests.sql`.
--
-- ── (٤) `channel_outcomes`: القناة الفاشلة تُرى فاشلة ───────────────────────
--
-- كان عامل الإرسال يحسب حصيلةَ كل قناة (`ChannelOutcome[]` في
-- `lib/notifications/types.ts`) ثم **يذيبها في جملةٍ عربية واحدة** داخل عمود
-- `error`، ويكتب في `channels` القنواتِ **المطلوبة** لا الواصلة. فشاشة السجل
-- تعرض «تليجرام» شارةً محايدة سواءٌ وصل أو فشل، والمالك يقرأ الفرق من نصٍّ
-- حرّ — ولا يستطيع أن يُرشّح عليه أبداً («أرِني ما فشل على تليجرام»).
--
-- فالعمود يخزّن ما حُسب سلفاً كما هو: مصفوفةُ `{channel, result, reason}`.
-- والصفوف السابقة تبقى `null` — **ولا تُختلَق لها حصيلة**: الشاشة تقول عنها
-- «قبل 0077» بدل أن تدّعي علماً لا تملكه.
--
-- المرجع: 0054 (`read_at` · `portal_inbox`) · 0056 · lib/notifications/types.ts
--         · lib/partner-alerts-types.ts · D-19 · D-20 · D-22
-- الاختبار: supabase/tests/notification_tests.sql
-- آمنة لإعادة التنفيذ بالكامل.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (١) العمودان — ولا يُعاد إنشاء `read_at`: قائمٌ منذ 0054
--
-- ⚠ `add column if not exists` على `read_at` كان سيمرّ صامتاً ويوحي بأن الهجرة
-- هي التي أنشأته. تُرك خارج البيان عمداً، وفحصُ (٦-أ) يؤكّد وجوده مسبقاً بدل
-- أن يخلقه.
-- ----------------------------------------------------------------------------
alter table public.notifications
  add column if not exists dismissed_at     timestamptz,
  add column if not exists channel_outcomes jsonb;

comment on column public.notifications.dismissed_at is
  'كنسَه المالك من جرس اللوحة. حالةُ عرضٍ لا حذف: الصف باقٍ كاملاً في السجل، و«مُكنَسٌ بلا قراءة» (dismissed_at غير فارغ و read_at فارغ) معلومةٌ تشغيلية تقول إن الجرس يُغرَق بما لا يستحقه.';

comment on column public.notifications.channel_outcomes is
  'حصيلةُ كل قناة على حدة كما حسبها عامل الإرسال: مصفوفة {channel, result, reason}. تُكتب من طبقة التسليم وحدها. فارغة على الصفوف السابقة لـ0077 — ولا تُختلَق لها قيمة.';

-- شكلُ المصفوفة مفروضٌ في القاعدة: كائنٌ مفردٌ أو نصٌّ يدخل العمود يكسر
-- الشاشة التي تقرؤه بـ`.map()`، والقيد أرخص من حارسٍ في الواجهة.
alter table public.notifications drop constraint if exists notifications_channel_outcomes_shape_chk;
alter table public.notifications add constraint notifications_channel_outcomes_shape_chk
  check (channel_outcomes is null or jsonb_typeof(channel_outcomes) = 'array');

-- ----------------------------------------------------------------------------
-- (٢) فهرس الجرس — الاستعلام الساخن الوحيد الجديد
--
-- الجرس يسأل سؤالاً واحداً كل ٦٠ ثانية ومع كل تغيّر لحظي: «ما صفوف التشغيل
-- المفتوحة؟». فهرسٌ جزئيٌّ عليها وحدها يبقى صغيراً مهما كبر السجل — وهو
-- المقصود: السجل ينمو بلا حد، والمفتوح يبقى عشرات.
-- ----------------------------------------------------------------------------
create index if not exists notifications_ops_open_idx
  on public.notifications (created_at desc)
  where recipient_kind = 'ops' and read_at is null and dismissed_at is null;

-- ----------------------------------------------------------------------------
-- (٣) الدوالّ الثلاث — ولكلٍّ منها الحارسان نفسهما:
--     `is_admin()` أولاً، ثم `recipient_kind = 'ops'` داخل البيان.
--
-- 🔒 الحارس الثاني هو الذي لا يجوز أن يسقط: بدونه يكنس المالكُ صناديقَ
--    المتعهدين. وهو مفروضٌ **في الدالة** لأن الواجهة تنسى والدالة لا تنسى.
--
-- والإرجاع `integer` — عددُ الصفوف المتأثرة — **رمزٌ لا جملة**: الواجهة تؤلّف
-- العربية، والخادم يعطي رقماً. (قاعدة المشروع، ولولاها لظهرت العربية على /en.)
-- ----------------------------------------------------------------------------

-- (٣-أ) رآه المالك. `p_id` فارغاً ⇒ كل المفتوح.
create or replace function public.ops_notifications_mark_read(p_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  if not public.is_admin() then
    raise exception 'مركز الإشعارات متاح للإدارة فقط' using hint = 'forbidden';
  end if;

  update public.notifications n
     set read_at = now()
   where n.recipient_kind = 'ops'   -- 🔒 لا يمسّ صندوق متعهد أبداً
     and n.read_at is null
     and (p_id is null or n.id = p_id);

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

comment on function public.ops_notifications_mark_read(uuid) is
  'تعليم إشعارات فريق التشغيل مقروءةً (صفٌّ واحد بـp_id، أو كل المفتوح بلا وسيط). لا تمسّ صفوف المتعهدين: read_at هناك علامةُ قراءتهم هم في portal_inbox. ترجع عدد الصفوف.';

-- (٣-ب) كنسَه من الجرس. **ولا تكتب `read_at`** — «مُكنَسٌ» ليس «مقروءاً».
create or replace function public.ops_notifications_dismiss(p_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  if not public.is_admin() then
    raise exception 'مركز الإشعارات متاح للإدارة فقط' using hint = 'forbidden';
  end if;

  update public.notifications n
     set dismissed_at = now()
   where n.recipient_kind = 'ops'   -- 🔒 الحارس نفسه
     and n.dismissed_at is null
     and (p_id is null or n.id = p_id);

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

comment on function public.ops_notifications_dismiss(uuid) is
  '«مسح» من الجرس — حالةُ عرضٍ لا حذف: يكتب dismissed_at ولا يحذف صفاً ولا يمسّ حقلاً من حقول التسليم. ولا يكتب read_at عمداً: ما كُنس بلا قراءة يبقى مقروءاً كذلك في السجل.';

-- (٣-ج) التراجع — وهو ما يجعل «المسح» قراراً غير نهائي.
--
-- 🔒 وبلا هذه الدالة يصير الكنسُ حذفاً **عملياً** وإن بقي الصف: مالكٌ كنس
--    بالخطأ لا يملك طريقاً لإرجاعه إلى الجرس. ووجودُها هو الفرق بين «إخفاء»
--    و«فقدان».
create or replace function public.ops_notifications_restore(p_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  if not public.is_admin() then
    raise exception 'مركز الإشعارات متاح للإدارة فقط' using hint = 'forbidden';
  end if;

  update public.notifications n
     set dismissed_at = null,
         read_at      = null
   where n.recipient_kind = 'ops'   -- 🔒 الحارس نفسه
     and (n.dismissed_at is not null or n.read_at is not null)
     and (p_id is null or n.id = p_id);

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

comment on function public.ops_notifications_restore(uuid) is
  'إعادة إشعار تشغيلٍ إلى الجرس (يمسح dismissed_at و read_at معاً). لا تمسّ صفوف المتعهدين ولا أي حقل من حقول التسليم.';

-- ----------------------------------------------------------------------------
-- (٤) المنح — والدوالّ محروسةٌ بـ`is_admin()` داخلها، فالمنح لـ`authenticated`
--     لا يفتح شيئاً: غيرُ الإداري ينال استثناءً بـ`hint = 'forbidden'`.
--     و`anon` خارج القائمة إطلاقاً.
-- ----------------------------------------------------------------------------
revoke all on function public.ops_notifications_mark_read(uuid) from public, anon;
grant execute on function public.ops_notifications_mark_read(uuid) to authenticated, service_role;

revoke all on function public.ops_notifications_dismiss(uuid) from public, anon;
grant execute on function public.ops_notifications_dismiss(uuid) to authenticated, service_role;

revoke all on function public.ops_notifications_restore(uuid) from public, anon;
grant execute on function public.ops_notifications_restore(uuid) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- (٥) 🔴 الحذف ممنوعٌ مكتوباً لا بالصدفة
--
-- `authenticated` لا تملك `delete` اليوم (مقيسٌ من `role_table_grants` قبل
-- كتابة الملف). والسطر أدناه يجعل ذلك **قراراً مفروضاً**: منحٌ يُضاف يوماً
-- بـ`grant all on all tables` — وهو نمطٌ شائع في سكربتات الإعداد — كان
-- سيسلّم سجلَّ التسليم كلَّه لأي جلسةٍ إدارية بلا سطرٍ واحد يقول إن ذلك حدث.
--
-- ⚠ و`service_role` تبقى مالكةً للحذف: عاملُ الصيانة (تقليمُ صفوفٍ عمرها
--    سنوات) مهمةُ خادمٍ لا مهمةُ متصفح، ولا مسار في التطبيق يناديها اليوم.
-- ----------------------------------------------------------------------------
revoke delete on public.notifications from anon, authenticated;
revoke truncate on public.notifications from anon, authenticated;

-- ----------------------------------------------------------------------------
-- (٦) فحوصٌ ذاتية — الهجرة تُسقط نفسها بدل أن تُسلّم قاعدةً نصفَ مهاجَرة
-- ----------------------------------------------------------------------------
do $$
declare
  v_missing text;
  v_n       integer;
begin
  -- (٦-أ) `read_at` كان موجوداً **قبل** هذه الهجرة (0054)، ولم تخلقه هي.
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'notifications'
       and column_name = 'read_at'
  ) then
    raise exception '(٦-أ) notifications.read_at مفقود — نفّذ 0054_partner_alerts.sql أولاً';
  end if;

  -- (٦-ب) عمودا هذه الهجرة
  select string_agg(x.c, '، ') into v_missing
  from (values ('dismissed_at'), ('channel_outcomes')) as x(c)
  where not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'notifications'
       and column_name = x.c
  );
  if v_missing is not null then
    raise exception '(٦-ب) أعمدة مفقودة بعد الهجرة: %', v_missing;
  end if;

  -- (٦-ج) الدوالّ الثلاث موجودة و`security definer`
  select string_agg(x.s, '، ') into v_missing
  from (values
    ('public.ops_notifications_mark_read(uuid)'),
    ('public.ops_notifications_dismiss(uuid)'),
    ('public.ops_notifications_restore(uuid)')
  ) as x(s)
  where to_regprocedure(x.s) is null;
  if v_missing is not null then
    raise exception '(٦-ج) دوالّ مفقودة: %', v_missing;
  end if;

  select count(*)::integer into v_n
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('ops_notifications_mark_read', 'ops_notifications_dismiss',
                      'ops_notifications_restore')
    and p.prosecdef;
  if v_n <> 3 then
    raise exception '(٦-ج) % دالة من ٣ فقط security definer', v_n;
  end if;

  -- (٦-د) 🔴 الحارس الذي بلا تأكيدٍ له يسقط بصمت: كل دالةٍ تشترط `ops`
  select count(*)::integer into v_n
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('ops_notifications_mark_read', 'ops_notifications_dismiss',
                      'ops_notifications_restore')
    and p.prosrc like '%recipient_kind = ''ops''%';
  if v_n <> 3 then
    raise exception
      '(٦-د) % دالة من ٣ تحمل شرط recipient_kind = ''ops'' — الباقي يكنس صناديق المتعهدين', v_n;
  end if;

  -- (٦-هـ) لا `delete` ولا `truncate` لغير الخدمة
  select count(*)::integer into v_n
  from information_schema.role_table_grants
  where table_schema = 'public' and table_name = 'notifications'
    and privilege_type in ('DELETE', 'TRUNCATE')
    and grantee in ('anon', 'authenticated');
  if v_n <> 0 then
    raise exception '(٦-هـ) % منحَ حذفٍ باقٍ لـanon/authenticated على سجل التسليم', v_n;
  end if;

  raise notice '✔ 0077: حالةُ عرضٍ للجرس · حصيلةٌ لكل قناة · ولا بابَ حذفٍ واحد';
end;
$$;
