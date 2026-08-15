-- ============================================================================
-- 0057_telegram_binding_guard.sql — محادثة تليجرام واحدة = مستقبِلٌ واحد
--
-- تصليبٌ فوق `0054`/`0055`/`0056`. **ولا يُعدَّل حرفٌ في أيٍّ منها** — كلها
-- مطبَّقة (القرار المرجعي في `DECISIONS.md`: الهجرة المطبَّقة لا تُلمس، والعلاج
-- في ملفٍ تالٍ).
--
-- ── ما قِيس على القاعدة الحيّة قبل كتابة سطرٍ واحد (2026-08-15) ──────────────
--
-- | ما قِيس | القيمة |
-- |---|---|
-- | متعهدون لهم `telegram_chat_id` | **واحد** من ١١ (`شركة محمد بدر` ⇐ `1223468133`) |
-- | قيمةٌ تتكرر عبر متعهدَين | **صفر** — التصادم (أ) نظريٌّ اليوم |
-- | `site_settings.notifications.telegramChatId` | **`1223468133`** — القيمة **نفسها** |
-- | فهرسٌ أو قيدٌ فريد على العمود | **لا شيء** (مقروءاً من `pg_indexes` و`pg_constraint`، لا من ملف هجرة — D-58) |
--
-- أي أن التصادم الحقيقي هو **(ب) لا (أ)**: محادثةٌ واحدة مسجَّلة **مستقبِلاً
-- لمتعهد وقناةً لفريق التشغيل معاً**.
--
-- ── ولماذا (ب) أخطر من (أ) بفارقٍ كبير ─────────────────────────────────────
--
-- رسالةُ المتعهد **مُنقّاة بالبناء** (`lib/dispatch/messages.ts`): لا اسم عميل
-- ولا هاتف ولا عنوان دقيق ولا سعر عميل ولا مرجع حجز — بل رمز الرحلة ومستحقه هو.
-- ورسالةُ **التشغيل** تحمل كلَّ ذلك: `trip_assigned` فيها «سعر العميل» و«الهامش
-- المحقق» و«هاتف المتعهد» والمرجع، و`dispatch_exhausted` فيها سعر العميل
-- والتكلفة المُسعَّر بها معاً — أي **الهامش بالطرح**.
--
-- وطبقةُ التسليم (`lib/notifications/dispatch.ts`) تقرأ للصفّ التشغيلي
-- `settings.notifications.telegramChatId`، وللصفّ الموجَّه إلى متعهد
-- `partner.telegram_chat_id` — **ولا سطر واحد في المسار كلّه يقارن الاثنين**.
-- فتساويهما يعني أن محادثةً واحدة تستقبل الرسالتين: نقضٌ حرفيٌّ لـ**D-19**
-- (المتعهد لا يعرف العميل) و**D-20** (المتعهد لا يعرف هامشنا فيستنتج تكاليف
-- منافسيه عكسياً).
--
-- ── القرار: تُرفض المحاولة الثانية، ولا تُسرَق من الأول ─────────────────────
--
-- حين يربط متعهدٌ ثانٍ محادثةً مربوطةً سلفاً، الخياران:
--   (i)  **الرفض** ✅ — المختار.
--   (ii) نقل الارتباط إليه.
-- و(ii) مرفوض لأن أثره **صامت على الطرف الثالث**: يتوقف وصول العروض إلى
-- المتعهد الأول بلا رسالةٍ إليه ولا أثرٍ في شاشته — تبقى تقول «تليجرام مربوط»
-- لأن الصفَّ فُرِّغ من تحته. وهذا بعينه ما تمنعه شاشة «قنوات التنبيه» أصلاً:
-- ألّا يكتشف الشريك انقطاعَه **بفقد عمل**. والرفضُ ثمنُه رسالةٌ يقرؤها من يحاول
-- الآن ويملك إصلاحها فوراً.
--
-- ── والصفُّ القائم لا يُمسّ ─────────────────────────────────────────────────
--
-- 🔒 **لا صفَّ تُغيّره هذه الهجرة — صفر كتابة على بيانات المالك.** الارتباط
-- المتصادم القائم (`شركة محمد بدر`) يبقى كما هو لثلاثة أسباب:
--   ١. حاملُ المحادثة اليوم هو **المالك نفسه**، فلا طرف ثالث تعلّم شيئاً.
--   ٢. ومسحُه آلياً يوقف **القناة الوحيدة التي تبلغ متعهداً في المنصة كلها**
--      بلا أن يقول ذلك أحد — وهو حرفياً العيبُ الذي رفضناه في الخيار (ii) أعلاه.
--      لا يجوز أن نرتكب في الهجرة ما منعناه في التصميم.
--   ٣. والقرار قرارُ المالك: صار الارتباط **ظاهراً بحمرة** في `/portal/notifications`
--      و`/admin/subcontractors/[id]`، ومعه زرُّ فصلٍ بنقرة واحدة.
-- ولذلك المُشغِّل أدناه **لا يُطلق على صفٍّ لم تتغيّر قيمته** — وإلا لصار كل
-- تعديلٍ إداريٍّ على ذلك المتعهد (اسمٌ · هاتفٌ · حالة) يفشل بسبب عمودٍ لم يُلمس.
--
-- ── والحارس على **الجدول** لا في دالة البورتال وحدها ────────────────────────
--
-- سابقةُ `0014` و`0027` و`0032`: القاعدة تحرس نفسها من **كل كاتب** — محرّر SQL،
-- مفتاح الخدمة، أي شاشة إدارية تُكتب غداً — لا من المسار الذي نتذكّره اليوم.
-- ولذلك **لم يُلمس جسم `portal_set_telegram_chat_id`**: المُشغِّل يعترض تحديثها
-- ويرفع الرمز، فيصل إلى البورتال بلا أن نعيد نسخ جسم دالةٍ قائمة (D-58).
--
-- ── ورمزٌ لا جملة ──────────────────────────────────────────────────────────
--
-- 🔒 الرفض يخرج في **`hint`** — وهي قناة الرمز المعتمدة في المشروع منذ
-- `subcontractors_guard_self` (‏`hint = 'forbidden'`) و`review_price_list`.
-- والنصّ العربي في `message` للسجل ومحرر SQL وحدهما؛ **الواجهة لا تعرضه أبداً**
-- بل تترجم الرمز بنفسها، وإلا ظهرت جملةُ خادمٍ عربية على `/en` — أو أسوأ:
-- «duplicate key value violates unique constraint» أمام شريك.
--
-- المرجع: `lib/partner-alerts-types.ts` (§٩) · `lib/notifications/dispatch.ts`
--         · `lib/dispatch/messages.ts` (ترويسة الخصوصية) · D-19 · D-20 · D-58
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (١) وجهة التشغيل مقروءةً من مكانها الوحيد
--
-- تعيش في `site_settings` صفَّ `notifications` بصيغة jsonb، ويقرؤها اليوم
-- **الخادمُ وحده**. والقاعدة تحتاجها الآن لتقارن — فدالةٌ واحدة تحملها بدل أن
-- يتكرر `value ->> 'telegramChatId'` في كل مُشغِّلٍ يُكتب بعدها.
--
-- 🔒 **وممنوعةٌ على `authenticated`** (سابقة `coverage_matches` في D-20):
-- منحُها تعطي كل متعهدٍ مسجّلٍ وجهةَ محادثة المالك — وهي وجهةُ إشعاراتٍ فيها
-- أسماءُ عملاء وهوامش. ولا يحتاجها أحد من الواجهة: من يقارن بها دالةٌ
-- `security definer` تعمل بصلاحيات مالكها.
-- ----------------------------------------------------------------------------

create or replace function public.ops_telegram_chat_id()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select nullif(btrim(coalesce(ss.value ->> 'telegramChatId', '')), '')
  from public.site_settings ss
  where ss.key = 'notifications';
$$;

comment on function public.ops_telegram_chat_id() is
  'معرّف محادثة تليجرام لفريق التشغيل من `site_settings.notifications`. '
  '⚠ غير ممنوحة لأي دور مستخدم: هي وجهةُ رسائلٍ فيها أسماء عملاء وهوامش.';

revoke all on function public.ops_telegram_chat_id() from public, anon, authenticated;
grant execute on function public.ops_telegram_chat_id() to service_role;

-- ----------------------------------------------------------------------------
-- (٢) القاعدة نفسها، مكتوبةً **مرةً واحدة**
--
-- يقرؤها المُشغِّل، وتقرؤها دالة البورتال، وتقرؤها الشاشة الإدارية. ونسخُها في
-- ثلاثة مواضع هو تماماً كيف يفترق مصدرا حقيقة بعد أول تعديل (القاعدة ١٢).
--
-- ترجع **رمزاً أو `null`** — لا بوليان: «لماذا رُفض» هو ما تحتاجه الواجهة لتقول
-- جملةً مفيدة، و«مرفوض» وحدها تنتج «حدث خطأ».
--
-- 🔒 **وممنوعةٌ على `authenticated` كذلك، وهذا ليس تشدّداً**: منحُها تصنع
-- **عرّافاً** — يسأل المتعهد «هل الرقم ١٢٣٤ مرتبط؟» فيمسح فضاء المعرّفات
-- ويعرف مَن من منافسيه متصل ومتى. (D-20 بنصّه.)
-- ----------------------------------------------------------------------------

create or replace function public.telegram_chat_conflict(
  p_chat_id      text,
  p_subcontractor uuid
)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    -- الفراغ فصلٌ لا ارتباط: `null` لا يتصادم مع شيء، وفصلُ القناة يجب أن
    -- يبقى ممكناً دائماً مهما كانت حالة الصف
    when nullif(btrim(coalesce(p_chat_id, '')), '') is null then null

    when exists (
      select 1 from public.subcontractors s
      where s.id is distinct from p_subcontractor
        and btrim(coalesce(s.telegram_chat_id, '')) = btrim(p_chat_id)
    ) then 'telegram-taken'

    when btrim(p_chat_id) = public.ops_telegram_chat_id() then 'telegram-is-ops'

    else null
  end;
$$;

comment on function public.telegram_chat_conflict(text, uuid) is
  'هل تصطدم محادثةٌ بجهةٍ أخرى؟ ترجع رمزاً: telegram-taken (متعهدٌ آخر) أو '
  'telegram-is-ops (وجهة فريق التشغيل) أو null. ⚠ غير ممنوحة لأي دور مستخدم — '
  'منحُها تصنع عرّافاً يمسح فضاء المعرّفات فيعرف المتعهد متى يكون منافسوه صامتين.';

revoke all on function public.telegram_chat_conflict(text, uuid) from public, anon, authenticated;
grant execute on function public.telegram_chat_conflict(text, uuid) to service_role;

-- ----------------------------------------------------------------------------
-- (٣) الحارس البنيوي رقم ١ — الفهرس الفريد
--
-- ولماذا فهرسٌ **وأيضاً** مُشغِّل؟ لأن لكلٍّ منهما ما لا يستطيعه الآخر:
--   • الفهرس **صحيحٌ تحت التزامن**: متعهدان يربطان المحادثة نفسها في اللحظة
--     نفسها يمرّان معاً من `exists` في المُشغِّل (كلٌّ لا يرى صفَّ الآخر بعد)،
--     ولا يمرّان من الفهرس. وهذا ليس افتراضاً نظرياً: تدفّق الربط كله «افتح
--     الرابط ثم عُد واضغط» — أي نقرتان متقاربتان.
--   • والمُشغِّل **يقول لماذا**: الفهرس يرفع `23505` برسالةٍ إنجليزية عن اسم
--     قيد، وهي آخر ما يُعرض على شريك.
-- فالمُشغِّل يمسك الحالة العادية برمزٍ مفهوم، والفهرس يمسك السباق.
--
-- ⚠ **وشرطه الجزئي مقصود**: `null` والفراغ ليسا ارتباطاً — ولولا الشرط لمنع
-- الفهرسُ أن يكون **متعهدان بلا تليجرام** معاً (والقاعدة اليوم فيها عشرة).
-- والقيمة المفهرسة `btrim(...)` لا العمود الخام، فمسافةٌ زائدة لا تلتفّ حوله.
--
-- والفهرس يُبنى على القاعدة الحيّة بلا مشكلة: **صفر تكرارٍ مقيس** لحظة الكتابة.
-- ولو وُجد تكرارٌ يوماً لفشلت الهجرة بصوتٍ عالٍ — وهو الصواب: قرارُ أيّ الصفَّين
-- يبقى قرارُ مالكٍ لا اختيارُ هجرة.
-- ----------------------------------------------------------------------------

create unique index if not exists subcontractors_telegram_chat_id_key
  on public.subcontractors (btrim(telegram_chat_id))
  where telegram_chat_id is not null and btrim(telegram_chat_id) <> '';

comment on index public.subcontractors_telegram_chat_id_key is
  'محادثة تليجرام واحدة = متعهدٌ واحد. جزئيٌّ لأن الفراغ ليس ارتباطاً.';

-- ----------------------------------------------------------------------------
-- (٤) الحارس البنيوي رقم ٢ — المُشغِّل الذي يقول **لماذا**
--
-- 🔒 **ولا يُطلق على قيمةٍ لم تتغيّر.** هذا السطر هو ما يجعل الهجرة آمنةً على
-- بيانات المالك القائمة: الصفُّ المتصادم اليوم يبقى قابلاً للتعديل في كل عمودٍ
-- آخر (اسمٌ · هاتفٌ · حالةٌ · ملاحظات) بلا أن يعترضه حارسٌ عن عمودٍ لم يُلمس.
-- ولولاه لَما استطاع المالك حتى **إيقاف** ذلك المتعهد من اللوحة.
--
-- وليس `update of telegram_chat_id` في تعريف المُشغِّل كافياً وحده: تلك الصيغة
-- تنطلق حين **يُذكر** العمود في `SET` ولو بالقيمة نفسها — وPostgREST يرسل الصفَّ
-- كاملاً من كل شاشةٍ إدارية. فالفحص على القيمة لا على ذكر الاسم.
-- ----------------------------------------------------------------------------

create or replace function public.subcontractors_telegram_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conflict text;
begin
  -- تعديلٌ لا يمسّ الوجهة: يمرّ كما هو — ومنه كل ارتباطٍ سبق هذه الهجرة
  if tg_op = 'UPDATE'
     and new.telegram_chat_id is not distinct from old.telegram_chat_id then
    return new;
  end if;

  v_conflict := public.telegram_chat_conflict(new.telegram_chat_id, new.id);
  if v_conflict is null then
    return new;
  end if;

  -- 🔒 الرمز في `hint`، والنصّ العربي للسجل وحده — الواجهة تترجم الرمز بنفسها
  if v_conflict = 'telegram-is-ops' then
    raise exception 'محادثة تليجرام هذه هي وجهة إشعارات فريق التشغيل — ربطُها بمتعهد يسلّمه اسم العميل وإجماليه وهامشنا (D-19)'
      using hint = v_conflict;
  end if;

  raise exception 'محادثة تليجرام هذه مرتبطة بمتعهد آخر — والمحادثة الواحدة مستقبِلٌ واحد'
    using hint = v_conflict;
end;
$$;

drop trigger if exists subcontractors_telegram_guard on public.subcontractors;
create trigger subcontractors_telegram_guard
  before insert or update on public.subcontractors
  for each row
  execute function public.subcontractors_telegram_guard();

-- ----------------------------------------------------------------------------
-- (٥) والاتجاه المعاكس — المالك يضبط وجهة التشغيل على محادثةِ متعهد
--
-- الحارس بلا هذا القسم **يحرس نصف الباب**: يمنع المتعهد أن يأخذ محادثة المالك،
-- ويترك المالك يضع وجهة التشغيل على محادثةِ متعهدٍ مربوطٍ سلفاً — فيصل إلى
-- ذلك المتعهد كلُّ إشعارٍ تشغيلي في المنصة. والنتيجة **أسوأ** من الاتجاه الأول
-- لأن الضحية هنا كلُّ عميلٍ في القاعدة لا حجزٌ واحد.
--
-- ⚠ ولا تُنادى `telegram_chat_conflict` هنا رغم أن نصفها هو المطلوب: فرعُها
-- الثاني يقارن بوجهة التشغيل — وهي **القيمة القديمة نفسها** أثناء `BEFORE`،
-- فيصير الفحص يقارن الشيء بما يستبدله. الشرط هنا سؤالٌ مختلف («هل هذه المحادثة
-- محجوزةٌ لمتعهد؟») فيُكتب صريحاً في سطرين، لا يُلوى ليمرّ من دالةٍ لغيره.
-- ----------------------------------------------------------------------------

create or replace function public.site_settings_ops_telegram_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new text;
  v_old text;
  v_who text;
begin
  if new.key <> 'notifications' then
    return new;
  end if;

  v_new := nullif(btrim(coalesce(new.value ->> 'telegramChatId', '')), '');
  v_old := case when tg_op = 'UPDATE'
                then nullif(btrim(coalesce(old.value ->> 'telegramChatId', '')), '')
           end;

  -- لم تتغيّر الوجهة: أيُّ حفظٍ آخر لتبويب الإشعارات يمرّ بلا اعتراض
  if v_new is null or v_new is not distinct from v_old then
    return new;
  end if;

  select s.company_name into v_who
  from public.subcontractors s
  where btrim(coalesce(s.telegram_chat_id, '')) = v_new
  limit 1;

  if v_who is not null then
    raise exception 'محادثة تليجرام هذه مربوطة بالمتعهد «%» — وجعلُها وجهةَ التشغيل يسلّمه كل إشعارات المنصة', v_who
      using hint = 'ops-telegram-taken';
  end if;

  return new;
end;
$$;

drop trigger if exists site_settings_ops_telegram_guard on public.site_settings;
create trigger site_settings_ops_telegram_guard
  before insert or update on public.site_settings
  for each row
  execute function public.site_settings_ops_telegram_guard();

-- ----------------------------------------------------------------------------
-- (٦) ما تراه شاشة المتعهد — بوليان واحد، ولا معرّف يخرج
--
-- ولماذا دالةٌ مستقلة بدل عمودٍ ثانٍ عشر في `portal_alert_prefs()`؟ لأن تغيير
-- نوع إرجاع دالةٍ حيّة يستلزم `drop` ثم إعادة كتابة الجسم كاملاً — وهو بعينه
-- الطريق الذي وُلد منه انحدارُ `0031` (D-58). نداءٌ ثانٍ في شاشة إعدادات ثمنُه
-- رحلةٌ واحدة، وثمنُ الطريق الآخر جسمُ دالةٍ يُنسخ.
--
-- 🔒 **ولا يتسرّب منها شيء**: من يرجع له `true` هو **صاحب المحادثة نفسه** —
-- يقرأها في تطبيقه الآن. ولا تقبل وسيطاً فلا تُسأل عن أحدٍ غيره.
-- ----------------------------------------------------------------------------

create or replace function public.portal_telegram_is_ops()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    public.telegram_chat_conflict(s.telegram_chat_id, s.id) = 'telegram-is-ops',
    false
  )
  from public.subcontractors s
  where s.id = public.current_subcontractor_id();
$$;

comment on function public.portal_telegram_is_ops() is
  'هل محادثة المتعهد الحالي هي نفسها وجهة فريق التشغيل؟ بوليان لصاحبها وحده — '
  'بلا وسيط فلا تُسأل عن غيره، وبلا معرّفٍ في الإرجاع.';

revoke all on function public.portal_telegram_is_ops() from public, anon;
grant execute on function public.portal_telegram_is_ops() to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- (٧) وما تراه شاشة المالك عن شريكٍ بعينه
--
-- محروسة بـ`is_admin()` **داخل الجسم** لا بالمنحة وحدها: `authenticated` يشمل
-- كل متعهدٍ مسجَّل، ومنحةٌ بلا حارسٍ داخلي تعطيه حالةَ قناة كل منافسيه.
-- ----------------------------------------------------------------------------

create or replace function public.admin_partner_telegram(p_subcontractor uuid)
returns table (linked boolean, conflict text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'هذه القراءة للإدارة وحدها' using hint = 'forbidden';
  end if;

  return query
  select
    btrim(coalesce(s.telegram_chat_id, '')) <> '',
    -- 🔒 الرمز وحده — لا المعرّف. المالك لا يحتاج الرقم ليفصل الارتباط،
    -- وإخراجُه يضعه في حمولة صفحةٍ إدارية بلا سببٍ واحد.
    public.telegram_chat_conflict(s.telegram_chat_id, s.id)
  from public.subcontractors s
  where s.id = p_subcontractor;
end;
$$;

comment on function public.admin_partner_telegram(uuid) is
  'حالة ربط تليجرام لمتعهدٍ بعينه كما يراها المالك: مربوط؟ وهل يتصادم؟ '
  'رمزٌ لا معرّف — والحارس `is_admin()` داخل الجسم لا في المنحة وحدها.';

revoke all on function public.admin_partner_telegram(uuid) from public, anon;
grant execute on function public.admin_partner_telegram(uuid) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- (٨) حارسٌ بنيوي يفشل بصوت — **ينفّذ نداءً ولا يقرأ نصّاً**
--
-- النمط ٩ في `LESSONS.md`: حارسٌ كُتب بصيغةٍ لا يمكن أن تفشل ليس حارساً.
-- فكلُّ فحصٍ هنا يحاول الكتابة فعلاً داخل معاملةٍ فرعية تُرجَع، ثم يرمي إن نجحت.
-- ----------------------------------------------------------------------------

do $$
declare
  v_a       uuid := '0e57a000-0000-4000-8000-00000000001a';
  v_b       uuid := '0e57a000-0000-4000-8000-00000000002b';
  v_chat    constant text := '-9007199254740991';
  v_ops     text;
  v_ok      boolean;
  v_hint    text;
begin
  -- (أ) الفهرس موجود فعلاً — من الكتالوج لا من نيّة الملف (القاعدة ١٤)
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and tablename  = 'subcontractors'
      and indexname  = 'subcontractors_telegram_chat_id_key'
  ) then
    raise exception '0057: الفهرس الفريد لم يُنشأ — السباق يمرّ';
  end if;

  -- (ب) المُشغِّلان قائمان بالاسم
  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.subcontractors'::regclass
      and tgname  = 'subcontractors_telegram_guard' and not tgisinternal
  ) then
    raise exception '0057: مُشغِّل المتعهدين لم يُنشأ';
  end if;
  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.site_settings'::regclass
      and tgname  = 'site_settings_ops_telegram_guard' and not tgisinternal
  ) then
    raise exception '0057: مُشغِّل الاتجاه المعاكس لم يُنشأ — نصفُ الباب مفتوح';
  end if;

  -- ══ نداءات حيّة داخل معاملةٍ فرعية تُرجَع ══════════════════════════════
  begin
    insert into public.subcontractors (id, company_name, phone, status)
    values (v_a, '0057_GUARD أ', '01000005701', 'pending'),
           (v_b, '0057_GUARD ب', '01000005702', 'pending');

    -- (ج) الارتباط الأول يمرّ
    update public.subcontractors set telegram_chat_id = v_chat where id = v_a;

    -- (د) والثاني يُرفض **برمزه**
    v_ok := false;
    begin
      update public.subcontractors set telegram_chat_id = v_chat where id = v_b;
      v_ok := true;
    exception when others then
      get stacked diagnostics v_hint = pg_exception_hint;
    end;
    if v_ok then
      raise exception '0057: محادثةٌ واحدة قُبلت لمتعهدَين — الحارس لا يحرس';
    end if;
    if v_hint is distinct from 'telegram-taken' then
      raise exception '0057: الرفض خرج بـ[%] لا بـtelegram-taken — الواجهة ستعرض جملةً خاماً', coalesce(v_hint, '∅');
    end if;

    /*
     * (هـ) وتصادم وجهة التشغيل يُرفض برمزه هو.
     *
     * ⚠ **ولا يُقاس على وجهة التشغيل الحقيقية.** أولُ صيغةٍ لهذا الفحص فعلت
     * ذلك ففشلت الهجرة — لأن الوجهة الحقيقية في قاعدة بدر اليوم **مرتبطةٌ
     * أصلاً بمتعهد**، فيسبق الفرعُ الأول (`telegram-taken`) الفرعَ المقصود.
     * وهو ليس عيباً في الحارس بل في القياس: فحصٌ ناتجُه يتغيّر بتغيّر بياناتِ
     * المالك ليس فحصاً. فتُضبط الوجهة هنا على قيمةٍ **صناعية لا يملكها أحد**
     * داخل المعاملة الفرعية نفسها، فيقيس الفحصُ الفرعَ الذي وُجد له وحده.
     */
    v_ops := '-9007199254740992';
    update public.site_settings
       set value = jsonb_set(value, '{telegramChatId}', to_jsonb(v_ops))
     where key = 'notifications';

    v_ok := false; v_hint := null;
    begin
      update public.subcontractors set telegram_chat_id = v_ops where id = v_b;
      v_ok := true;
    exception when others then
      get stacked diagnostics v_hint = pg_exception_hint;
    end;
    if v_ok then
      raise exception '0057: وجهةُ التشغيل قُبلت لمتعهد — نقضُ D-19 ما زال ممكناً';
    end if;
    if v_hint is distinct from 'telegram-is-ops' then
      raise exception '0057: تصادمُ التشغيل خرج بـ[%] لا بـtelegram-is-ops', coalesce(v_hint, '∅');
    end if;

    -- (هـ-٢) والاتجاه المعاكس: وجهةُ تشغيلٍ تُضبط على محادثةِ متعهدٍ مربوط
    v_ok := false; v_hint := null;
    begin
      update public.site_settings
         set value = jsonb_set(value, '{telegramChatId}', to_jsonb(v_chat))
       where key = 'notifications';
      v_ok := true;
    exception when others then
      get stacked diagnostics v_hint = pg_exception_hint;
    end;
    if v_ok then
      raise exception '0057: وجهةُ التشغيل قُبلت على محادثةِ متعهد — كلُّ إشعارٍ تشغيلي كان سيصله';
    end if;
    if v_hint is distinct from 'ops-telegram-taken' then
      raise exception '0057: الاتجاه المعاكس خرج بـ[%] لا بـops-telegram-taken', coalesce(v_hint, '∅');
    end if;

    -- (و) والفصل يبقى ممكناً دائماً — وإلا حبسنا الشريك في ارتباطٍ خاطئ
    update public.subcontractors set telegram_chat_id = null where id = v_a;
    update public.subcontractors set telegram_chat_id = ''   where id = v_a;

    -- (ز) وتعديلٌ لا يمسّ الوجهة يمرّ على صفٍّ مرتبط — هذا هو أمانُ الصفِّ القائم
    update public.subcontractors set telegram_chat_id = v_chat where id = v_a;
    update public.subcontractors set status = 'suspended' where id = v_a;

    raise exception '0057_ROLLBACK';
  exception
    when others then
      if sqlerrm <> '0057_ROLLBACK' then raise; end if;
  end;

  raise notice '0057 ✔ محادثةٌ واحدة = مستقبِلٌ واحد: الفهرس يمسك السباق · والمُشغِّل يرفع telegram-taken و telegram-is-ops · والاتجاه المعاكس محروس · والفصل والتعديل غير الماسّ يمرّان — وصفر صفٍّ لُمس من بيانات المالك';
end;
$$;

-- ⚠ ولا سطرَ تسجيلٍ في `schema_migrations` هنا: المُشغِّل (`scripts/db-migrate.mjs`)
--    يكتبه بنفسه بعد نجاح الملف.
