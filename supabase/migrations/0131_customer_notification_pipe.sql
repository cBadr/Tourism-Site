-- ============================================================================
-- 0131_customer_notification_pipe.sql
--   أنبوبُ إشعارات العميل — أوّلُ قناةٍ في المنظومة تبلغ العميلَ نفسه
--
--   (١) 🔴 الثقب: `notification_channels_for('customer', …)` كانت تُرجع قنوات
--       المالك — أي أن أوّلَ إشعارِ عميلٍ كان سيذهب إلى محادثة تليجرام المالك
--   (٢) `recipient_kind` يقبل `'customer'`، ومعرّفه **الحجز**
--   (٣) قنواتُ العميل باسمها هي — لا تُشبه قناةَ مالكٍ ولا قناةَ متعهد
--   (٤) جدولُ اشتراكِ دفعِ المتصفح للعميل — على بنية `partner_push_subscriptions`
--   (٥) أربعةُ أحداثٍ تصله: التأكيد · الإسناد · اقترابُ الموعد · الإتمام
--   (٦) 🔒 حاجزٌ في الجدول يرفض أي حمولةِ عميلٍ فيها تكلفةٌ أو هامشٌ أو متعهد
--
-- ══════════════════════════════════════════════════════════════════════════
--  (١) 🔴 الثقب المقيس — والقيدُ لم يكن هو الحارس
-- ══════════════════════════════════════════════════════════════════════════
--
-- قِيس على القاعدة الحيّة قبل هذه الهجرة:
--
--     select public.notification_channels_for('customer', null);
--     ⇒ {dashboard,telegram}          -- أي: قنواتُ المالك حرفياً
--
-- والعلّة في فرع `else` من جسمها: كلُّ صنفٍ ليس `partner` كان يسقط على
-- `notification_channels()` — وهي إعداداتُ المالك. فالقيدُ
-- `recipient_kind in ('ops','partner')` لم يكن يحرس شيئاً؛ كان **يؤجّل**:
-- ساعةَ يُرخى (وهذه الهجرة تُرخيه) يبدأ اسمُ العميل وموعدُ رحلته يصلان
-- محادثةَ المالك بوصفها «قناةَ العميل».
--
-- ── القاعدة المنفَّذة هنا ───────────────────────────────────────────────────
--
-- 🔒 **لكل صنفِ مستقبِلٍ قنواتُه هو، ولا تدهورَ صامتٌ إلى قنوات المالك.**
--    فرعُ `else` صار `'{}'` — ومن لا صنفَ له لا قناةَ له. وثلاثةُ الأصناف
--    مكتوبةٌ صراحةً واحداً واحداً.
--
-- ⚠ وأثرٌ جانبيّ مقصود: `('partner', null)` كانت تُرجع قنوات المالك وصارت
--   `'{}'` — ولا منادٍ ينتجها اليوم: `queue_notification` تُحوّل «متعهدٌ بلا
--   معرّف» إلى `ops` قبل أن تصل هنا (مقيسٌ من `pg_get_functiondef`).
--
-- ══════════════════════════════════════════════════════════════════════════
--  (٢) 🔒 لماذا تسمية القنوات هي الحارسُ الذي يحمي **الكود المنشور**
-- ══════════════════════════════════════════════════════════════════════════
--
-- الإنتاجُ حيٌّ على عمولةٍ لا تعرف العميل، والهجرةُ تسري قبل نزول الكود.
-- وعاملُ الإشعارات المنشور يقرأ صنفَ المستقبِل هكذا (‏`lib/notifications/
-- dispatch.ts`): `recipient_kind === "partner" ? "partner" : "ops"` — أي أنه
-- يعامل صفَّ العميل معاملةَ صفِّ تشغيل.
--
-- فلو سُمّيت قنواتُ العميل بأسماءِ القنوات القائمة (`inbox` · `webpush`)
-- لَسلّمها العاملُ المنشورُ على وجهات **المالك والمتعهد**. ولذلك:
--
--     customer_inbox · customer_push · customer_whatsapp
--
-- ثلاثةُ أسماءٍ **لا يعرفها أيُّ كودٍ منشور**، فيمرّ عليها بلا قناةٍ واحدة
-- (`external.length === 0` ⇒ الصفُّ يُوسم `sent` بلا تسليم). أي أن الحارس
-- **بنيويّ لا انضباطيّ**: لا مفتاحَ ينساه أحد، ولا ترتيبَ نشرٍ يجب أن يُحفظ.
--
-- ⚠ ولذلك أيضاً `customer_channels` **لا تُرجع مصفوفةً فارغة أبداً**:
--   `customer_inbox` نصٌّ حرفيٌّ لا شرطَ عليه. والسبب مقيس: العاملُ المنشور
--   يسقط على `DEFAULT_CHANNELS = ['dashboard','telegram','email']` حين تكون
--   قنواتُ الصفّ فارغة — أي أن **الفراغَ نفسه** طريقٌ إلى تليجرام المالك.
--
-- ══════════════════════════════════════════════════════════════════════════
--  (٣) معرّفُ العميل = **الحجز**
-- ══════════════════════════════════════════════════════════════════════════
--
-- لا جدولَ عملاء في المنظومة، وصفرُ حسابِ عميلٍ مسجَّل، و`create_booking` لا
-- تقرأ `auth.uid()`. فالكيانُ الوحيد الذي يوجد **دائماً** ويُعرَف صاحبُه هو
-- الحجزُ نفسه، وبه يُتعرَّف العميل بثلاث طرقٍ قائمةٍ سلفاً:
--   • حاملُ التوكن على `/booking/<token>`
--   • المرجعُ + الهاتف على `/track`
--   • الحسابُ المربوط عبر `customer_bookings`
--
-- ولذلك `recipient_id = bookings.id`. وقيدُ المعرّف يتوسّع ليقول ذلك صراحةً:
-- صنفٌ يستقبل ⇒ معرّفٌ حاضر.
--
-- ══════════════════════════════════════════════════════════════════════════
--  (٤) 🔒 D-19 حاجزٌ في الجدول لا انضباطٌ في الراسم
-- ══════════════════════════════════════════════════════════════════════════
--
-- حمولةُ `trip_assigned` تحمل اليوم `payout` و`realMargin` و`companyName`
-- و`partnerPhone`، وحمولةُ `dispatch_exhausted` تحمل `pricedCost` و`ceiling`.
-- ونسخُ أيٍّ منها إلى إشعارِ عميلٍ نقضٌ حرفيّ لـ**D-19**.
--
-- فالحاجزُ هنا حاجزان لا واحد:
--   ١. **الحمولة تُبنى من `bookings` لا من حمولةِ التشغيل** — فما لا يُذكر في
--      `customer_notification_payload` لا يمكن أن يعبُر، على سابقة `quote_public`
--      و`portal_offers` (اتفاقية ٧: الأمان بنيويّ لا انضباطيّ).
--   ٢. **وقيدُ فحصٍ على الجدول** يرفض أي صفِّ عميلٍ تحمل حمولتُه مفتاحاً من
--      قائمةِ المال والمتعهد. فكاتبٌ مستقبليّ — أو محرّرُ SQL — لا يستطيع أن
--      يكتب ما تمنعه القاعدة. وهذه هي سابقةُ `0014` و`0027`: الحارسُ في
--      الجدول لا في الدالة.
--
-- ══════════════════════════════════════════════════════════════════════════
--  (٥) الأحداثُ الأربعة — ولماذا **أسماءٌ مستقلّة** لا الأسماءُ نفسها
-- ══════════════════════════════════════════════════════════════════════════
--
--   booking_confirmed        ⇒ customer_booking_confirmed
--   trip_assigned            ⇒ customer_trip_assigned
--   trip_completion_approved ⇒ customer_trip_completed
--   (لا أصلَ له)              ⇒ customer_trip_reminder
--
-- وثلاثةُ أسبابٍ لاستقلال الأسماء:
--   • **العنوان**: «تم إسناد الرحلة إلى متعهد» عنوانُ `trip_assigned` في
--     `EVENT_META` — وكلمةُ «متعهد» نفسُها لا تُقال للعميل (D-19).
--   • **الجيران**: `dispatch_tests` يعدّ `trip_assigned` لهذا الحجز ويتوقّع
--     **واحداً**؛ وتوأمٌ بالاسم نفسه كان يُحمِّر مجموعةً لا شأن لها بنا.
--   • **الشاشة**: مرشِّح «كل الأحداث» في `/admin/notifications` يفرّق بينهما.
--
-- والتوليدُ بمُشغّلٍ على `notifications` لا بتعديل خمسِ دوالٍّ منتِجة (القاعدة
-- الذهبية ١٢: لا يُستنسخ منطقٌ قائم — يُفوَّض إليه). فلا `accept_offer` ولا
-- `manual_assign` ولا `log_booking_change` ولا `approve_trip_completion` يُمسّ
-- منها حرف، والمُشغّلُ لا يرى صفَّ عميلٍ إطلاقاً فلا حلقة.
--
-- ══════════════════════════════════════════════════════════════════════════
--  ما لا تفعله هذه الهجرة — يُقال صراحةً
-- ══════════════════════════════════════════════════════════════════════════
--
--   • لا تُرسل رسالةً واحدة. الإرسالُ عملُ `lib/notifications/dispatch.ts`.
--   • لا تفتح واتساب: `customer_whatsapp` مشروطةٌ بـ`provider_ready('whatsapp')`
--     ولا صفَّ مزوّدٍ بهذا الاسم في `notification_providers` ⇒ القناة **مطفأةٌ
--     بنيوياً** حتى يوجد مزوّدٌ فعليّ (ولا يوجد اليوم: لا BSP ولا قوالب Meta).
--   • لا تطلب بريدَ العميل ولا تضيف عموداً له — قرارُ منتجٍ لم يُتخذ.
--   • لا تلمس `notification_channels()` ولا `partner_channels()` ولا
--     `dispatch_tick()` ولا أيَّ دالةٍ منتِجةٍ للأحداث.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (١) إعداداتُ أنبوب العميل — جدولٌ صغيرٌ مستقل لا مفتاحٌ في `site_settings`
-- ----------------------------------------------------------------------------
--
-- ولماذا لا يُضاف مفتاحٌ إلى جسم `site_settings.notifications` مع بقيةِ
-- إعدادات الإشعارات: لأن شاشةَ الإعدادات تكتب ذلك الجسم **كاملاً** من نموذجٍ
-- لا يعرف المفتاح الجديد، فأولُ حفظٍ من اللوحة كان يمحوه بلا خطأ يظهر.
-- والسابقة القائمة `trip_settings` (‏`id boolean primary key`).

create table if not exists public.customer_notification_settings (
  id                  boolean primary key default true check (id),
  -- 🔴 **مطفأٌ افتراضاً — ولسببٍ مقيسٍ لا تحوّطاً.**
  --
  -- الحارسُ البنيويّ (تسميةُ القنوات) يمنع أن يصل شيءٌ إلى وجهةٍ ليست له،
  -- لكنه لا يمنع **ظهورَ الصفّ** في جرس المالك. وقِيس على الشجرة الحيّة:
  --
  --     components/admin/notification-bell.tsx:194 · 212 · 315
  --       .neq("recipient_kind", "partner")     ⇐ «كلُّ ما ليس متعهداً تشغيلٌ»
  --
  -- فصفُّ العميل يُعدّ في **غير المقروء** عند المالك. وأسوأُ منه أن
  -- `ops_notifications_mark_read` تشترط `recipient_kind = 'ops'` — فالصفُّ
  -- يظهر في الجرس **ولا يستطيع المالك أن يعلّمه مقروءاً**: شارةٌ لا تُطفأ أبداً.
  --
  -- والملفّان خارج نطاق هذه الجبهة فلم يُحرَّرا (‏`CONVENTIONS` §١١د: ما خرج
  -- عن البريف يُبلَّغ ولا يُحرَّر). والعلاجُ سطرٌ واحد في ثلاثة مواضع:
  -- `.eq("recipient_kind", "ops")` بدل `.neq(…, "partner")`، ومثلُه
  -- `recipient_kind=eq.ops` في مرشِّح الزمن الحقيقي، و
  -- `app/admin/notifications/page.tsx:934` (`opsRow`).
  --
  -- ⇒ **يُقلَب هذا المفتاح إلى `true` بعد نزول ذلك الإصلاح، لا قبله.**
  enabled             boolean not null default false,
  -- مهلةُ تذكيرِ الموعد بالساعات — رقمٌ لسياسةٍ فمكانُه القاعدة (D-05 بروحه)
  reminder_lead_hours integer not null default 24
                      check (reminder_lead_hours between 1 and 168),
  updated_at          timestamptz not null default now()
);

-- ⚠ و`create table if not exists` لا تصلح افتراضياً على قاعدةٍ أُنشئ فيها
--    الجدولُ سلفاً — والهجرةُ قابلةٌ لإعادة التنفيذ، فالافتراضُ يُثبَّت صراحةً.
alter table public.customer_notification_settings
  alter column enabled set default false;

insert into public.customer_notification_settings (id) values (true)
on conflict (id) do nothing;

comment on table public.customer_notification_settings is
  'إعداداتُ أنبوب إشعارات العميل: مفتاحُ الأنبوب ومهلةُ تذكير الموعد. صفٌّ واحدٌ أبداً (id = true).';

alter table public.customer_notification_settings enable row level security;

drop policy if exists customer_notification_settings_select_admin on public.customer_notification_settings;
create policy customer_notification_settings_select_admin
  on public.customer_notification_settings for select
  using (public.is_admin());

drop policy if exists customer_notification_settings_update_admin on public.customer_notification_settings;
create policy customer_notification_settings_update_admin
  on public.customer_notification_settings for update
  using (public.is_admin()) with check (public.is_admin());

-- القاعدة ١٦: `revoke` صريحٌ على TRUNCATE — وهي **لا تخضع لـRLS إطلاقاً**
revoke all on public.customer_notification_settings from public;
revoke all on public.customer_notification_settings from anon;
revoke all on public.customer_notification_settings from authenticated;
grant select, update on public.customer_notification_settings to authenticated;  -- RLS تحصره في المشرف
grant select, insert, update, delete on public.customer_notification_settings to service_role;

create or replace function public.customer_notifications_enabled()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  -- الافتراضُ عند غياب الصفّ: **مطفأ**. غيابُ الإعداد ليس إذناً.
  select coalesce((select s.enabled from public.customer_notification_settings s where s.id), false);
$$;

comment on function public.customer_notifications_enabled() is
  'هل أنبوبُ إشعارات العميل مُشعل؟ غيابُ الصفّ = مطفأ (الافتراضُ يسقط في الاتجاه الآمن).';

-- ----------------------------------------------------------------------------
-- (٢) جدولُ اشتراكِ دفعِ المتصفح للعميل — على بنية `partner_push_subscriptions`
-- ----------------------------------------------------------------------------
--
-- البنيةُ مُقلَّدةٌ حرفياً عن جدول المتعهد (القاعدة الذهبية ١٢: تُقلَّد البنية
-- ولا يُستنسخ منطقُ الإرسال — التشفيرُ والتوقيعُ يبقيان في `lib/push/send.ts`
-- وحدها). والفارقان اثنان لا ثالث لهما:
--
--   ١. المالكُ **حجزٌ** لا متعهد — فلا حساب للعميل يُعلَّق عليه الاشتراك.
--   ٢. الفريدُ `(booking_id, endpoint)` لا `endpoint` وحده: العميلُ نفسُه على
--      المتصفح نفسه قد يتابع حجزين، والاشتراكُ في المتصفح **واحدٌ لكل أصل**
--      (‏`applicationServerKey` واحد) — فالفريدُ على العنوان وحده كان يجعل
--      حجزَه الثاني يسرق إشعاراتِ الأول.
--
-- 🔒 و`on delete cascade`: حجزٌ يُحذف تذهب معه اشتراكاتُه — لا صفَّ يتيماً
--    يُرسَل إليه، ولا مفتاحَ جهازٍ يبقى بلا صاحب.

create table if not exists public.customer_push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  booking_id   uuid not null references public.bookings(id) on delete cascade,
  endpoint     text not null,
  p256dh       text not null,
  auth         text not null,
  user_agent   text,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz,
  constraint customer_push_booking_endpoint_key unique (booking_id, endpoint)
);

create index if not exists customer_push_subscriptions_booking_idx
  on public.customer_push_subscriptions (booking_id);

comment on table public.customer_push_subscriptions is
  'اشتراكاتُ دفعِ المتصفح للعميل، مفتاحُها الحجز. 🔒 `endpoint` معرّفٌ ومفتاحٌ معاً — من يملكه يرسل إلى الجهاز، فلا يخرج إلى أي واجهة ولا يُنسخ إلى سجلّ تدقيق.';

alter table public.customer_push_subscriptions enable row level security;

-- ولا سياسةَ واحدة بقصد: لا `anon` ولا `authenticated` يلمس هذا الجدول
-- مباشرةً. الطريقُ الوحيد دوالُّ `security definer` أدناه (نمطُ `portal_inbox`)،
-- ومفتاحُ الخدمة للعامل. وهذا أضيقُ من جدول المتعهد عمداً: صاحبُ الصفّ هنا
-- **بلا حساب**، فلا هويةَ تُقارَن بها سياسة.
drop policy if exists customer_push_select_admin on public.customer_push_subscriptions;
create policy customer_push_select_admin
  on public.customer_push_subscriptions for select
  using (public.is_admin());

-- القاعدة ١٦
revoke all on public.customer_push_subscriptions from public;
revoke all on public.customer_push_subscriptions from anon;
revoke all on public.customer_push_subscriptions from authenticated;
grant select on public.customer_push_subscriptions to authenticated;  -- RLS: المشرف وحده
grant select, insert, update, delete on public.customer_push_subscriptions to service_role;

-- ----------------------------------------------------------------------------
-- (٣) قنواتُ العميل — ولا تليجرامَ مالكٍ بحال
-- ----------------------------------------------------------------------------

create or replace function public.customer_channels(p_booking uuid)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  -- 🔒 لا `from` هنا بقصد: تعبيرٌ بلا مصدرِ صفوفٍ يُرجع **صفاً واحداً دائماً**،
  --    فيستحيل أن ترجع الدالةُ `null` أو مصفوفةً فارغة مهما كان `p_booking`.
  --    والفراغُ نفسه بابٌ إلى قنوات المالك عبر `DEFAULT_CHANNELS` في العامل
  --    المنشور — فالصندوقُ ثابتٌ لا شرطَ عليه.
  select array_remove(array[
    -- صندوقُ العميل: الصفُّ نفسه هو التسليم (تقرؤه `customer_inbox()`)
    'customer_inbox',
    case when public.provider_ready('webpush')
          and exists (select 1 from public.customer_push_subscriptions cs
                       where cs.booking_id = p_booking)
         then 'customer_push' end,
    -- واتساب: مشروطةٌ بمزوّدٍ **جاهز** — ولا صفَّ `whatsapp` في
    -- `notification_providers` اليوم، فالقناة مطفأةٌ بنيوياً لا بمفتاح
    case when public.provider_ready('whatsapp')
          and exists (select 1 from public.bookings b
                       where b.id = p_booking
                         and btrim(coalesce(b.customer_whatsapp, '')) <> '')
         then 'customer_whatsapp' end
  ], null);
$$;

comment on function public.customer_channels(uuid) is
  'قنواتُ العميل لحجزٍ بعينه. 🔒 لا تُرجع فارغاً أبداً ولا تحمل قناةَ مالكٍ ولا قناةَ متعهد — أسماؤها الثلاثة لا يعرفها أي كودٍ منشور، فصفُّ العميل لا يُسلَّم على وجهةٍ ليست له.';

-- 🔴 الثقب يُغلق: لكل صنفٍ قنواتُه، ولا فرعَ `else` يسقط على المالك
create or replace function public.notification_channels_for(p_kind text, p_id uuid)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select case
    -- متعهدٌ محذوف أو معرّفٌ خاطئ أو غائب: مصفوفةٌ فارغة، وطبقةُ التسليم تصعّد
    -- بالرمز `partner-not-found` بدل أن تسلّم على قنوات المالك بالسهو.
    when p_kind = 'partner'  then coalesce(public.partner_channels(p_id), '{}'::text[])
    -- 🔒 العميل: قنواتُه هو وحدها. وقبل هذه الهجرة كان يسقط على فرع `else`
    --    فيأخذ `{dashboard,telegram}` — أي محادثةَ تليجرام المالك (مقيسٌ حيّاً).
    when p_kind = 'customer' then public.customer_channels(p_id)
    when p_kind = 'ops'      then public.notification_channels()
    -- 🔒 صنفٌ لا نعرفه لا قناةَ له. و«لا قناة» أسلمُ من «قناةُ المالك»:
    --    القيدُ على العمود يمنع الصنفَ المجهول أصلاً، فهذا الفرعُ حارسٌ ثانٍ.
    else '{}'::text[]
  end;
$$;

comment on function public.notification_channels_for(text, uuid) is
  '🔒 قنواتُ التسليم بحسب صنف المستقبِل — ثلاثةُ أصنافٍ مكتوبةٌ صراحةً، ولا تدهورَ صامتٌ إلى قنوات المالك. (0131)';

-- ----------------------------------------------------------------------------
-- (٤) القيود: الصنفُ الثالث، ومعرّفُه، و🔒 حاجزُ D-19 على الحمولة
-- ----------------------------------------------------------------------------

alter table public.notifications drop constraint if exists notifications_recipient_kind_check;
alter table public.notifications add  constraint notifications_recipient_kind_check
  check (recipient_kind = any (array['ops'::text, 'partner'::text, 'customer'::text]));

-- صنفٌ يستقبل ⇒ معرّفٌ حاضر · وصفُّ التشغيل بلا معرّف كما كان
alter table public.notifications drop constraint if exists notifications_recipient_id_check;
alter table public.notifications add  constraint notifications_recipient_id_check
  check ((recipient_kind = any (array['partner'::text, 'customer'::text])) = (recipient_id is not null));

-- ══ 🔒 حاجزُ D-19 — في الجدول لا في الراسم ═════════════════════════════════
--
-- كلُّ مفتاحٍ في هذه القائمة مقيسٌ من حمولةٍ حيّة تُنتجها دالةٌ قائمة:
--   payout · realMargin · subcontractorId · companyName · partnerPhone   ← trip_assigned
--   pricedCost · ceiling                                                  ← dispatch_exhausted
--   partnerEmail · partnerTelegramChatId                                  ← يحقنهما العامل
--   tripCode                                                              ← رمزُ المتعهد (0056)
--   customerPhone · customerWhatsapp                                      ← ‏لا تُعاد إلى صاحبها
--                                                                            على شاشةِ قفلٍ يراها غيرُه
--
-- والقيدُ يفحص صفوفَ العميل وحدها، فلا يمسّ الـ٤٥ صفاً القائمة ولا أي صفِّ
-- تشغيلٍ أو متعهدٍ مستقبَليّ.
alter table public.notifications drop constraint if exists notifications_customer_payload_clean_chk;
alter table public.notifications add  constraint notifications_customer_payload_clean_chk
  check (
    recipient_kind <> 'customer'
    or not (payload ?| array[
      'payout', 'realMargin', 'margin', 'marginAmount', 'subcontractorCost',
      'subcontractorId', 'companyName', 'partnerPhone', 'partnerEmail',
      'partnerTelegramChatId', 'pricedCost', 'ceiling', 'tripCode',
      'customerPhone', 'customerWhatsapp'
    ])
  );

comment on constraint notifications_customer_payload_clean_chk on public.notifications is
  '🔒 D-19 حاجزٌ صلب: لا تكلفةَ ولا هامشَ ولا متعهدَ ولا هاتفَ في حمولةِ إشعارٍ يصل العميل. الحارسُ في الجدول لا في الدالة (سابقة 0014 و0027) — فمحرّرُ SQL وكاتبٌ مستقبليّ يمرّان عليه.';

-- ----------------------------------------------------------------------------
-- (٥) `queue_notification` تقبل `'customer'`
-- ----------------------------------------------------------------------------
--
-- الجسمُ منقولٌ من الكتالوج الحيّ (‏D-58) ومزيدٌ عليه فرعُ العميل وحده.

create or replace function public.queue_notification(
  p_event text, p_payload jsonb, p_kind text, p_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id   uuid;
  v_kind text := coalesce(nullif(btrim(p_kind), ''), 'ops');
  v_rid  uuid := case when v_kind in ('partner', 'customer') then p_id else null end;
begin
  -- «متعهد» بلا معرّف صفٌّ لا وجهة له — يُردّ إلى التشغيل بدل أن يكسر القيد
  if v_kind = 'partner' and v_rid is null then
    v_kind := 'ops';
  end if;

  -- 🔒 و«عميل» بلا معرّف **يرمي ولا يُردّ إلى التشغيل**: الردُّ كان يعني إرسال
  --    حمولةٍ صيغت للعميل على قنوات المالك — أي العيبَ نفسه من بابٍ آخر. ولا
  --    كودَ منشورٍ يمرّ من هنا: `'customer'` لم تكن مقبولةً أصلاً قبل هذه الهجرة.
  if v_kind = 'customer' and v_rid is null then
    raise exception 'إشعارُ عميلٍ بلا حجزٍ يُعرّفه — لا وجهةَ له، ولا يُردّ إلى قنوات المالك'
      using hint = 'customer-recipient-required';
  end if;

  insert into public.notifications as n
    (event, payload, channels, status, recipient_kind, recipient_id)
  values (p_event, coalesce(p_payload, '{}'::jsonb),
          public.notification_channels_for(v_kind, v_rid), 'queued', v_kind, v_rid)
  returning n.id into v_id;
  return v_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- (٦) 🔒 حمولةُ العميل — تُبنى من `bookings` لا من حمولةِ التشغيل
-- ----------------------------------------------------------------------------

create or replace function public.customer_notification_payload(p_booking uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  -- ما لا يُذكر هنا لا يمكن أن يعبُر (اتفاقية ٧: الأمان بنيويّ).
  -- ولا `subcontractor_cost` ولا `margin_amount` ولا `payout` — وهي أعمدةٌ
  -- على `bookings` و`dispatches` قائمةٌ على بُعد سطرٍ واحد، فغيابُها اختيارٌ
  -- مكتوبٌ لا سهو.
  select coalesce(
    (select jsonb_strip_nulls(jsonb_build_object(
       'bookingId',       b.id,
       'reference',       b.reference,
       'publicToken',     b.public_token,
       'status',          b.status,
       'customerName',    b.customer_name,
       'classTitle',      b.class_title,
       'currency',        b.currency,
       'total',           b.total,
       'amountRemaining', b.amount_remaining,
       'originLabel',     b.trip ->> 'originLabel',
       'destLabel',       b.trip ->> 'destLabel',
       'pickupAt',        b.trip ->> 'pickupAt',
       'passengers',      public.jsonb_number(b.trip, 'passengers', null),
       'roundTrip',       coalesce(b.trip ->> 'roundTrip', 'false') in ('true', 't', '1'),
       'waitingHours',    public.jsonb_number(b.trip, 'waitingHours', null)
     ))
     from public.bookings b where b.id = p_booking),
    '{}'::jsonb);
$$;

comment on function public.customer_notification_payload(uuid) is
  '🔒 حمولةُ إشعارِ العميل — قائمةُ سماحٍ مبنيّةٌ من `bookings` مباشرةً. لا تكلفةَ ولا هامشَ ولا متعهدَ ولا هاتف (D-19)، ويحرسها كذلك `notifications_customer_payload_clean_chk`.';

-- ----------------------------------------------------------------------------
-- (٧) التوليد — مُشغّلٌ يفوّض إلى الحمولات القائمة ولا يستنسخ منتِجاً
-- ----------------------------------------------------------------------------

-- 🔴 **الخريطةُ مكتوبةٌ `case` داخل الجسم عمداً، ولا تُخرَج إلى دالةٍ مساعدة.**
--
-- `scripts/check-notification-event-titles.mjs` هو الحارسُ الذي يمنع «حدثاً بلا
-- عنوان» (وقعت مرتين). وهو يقرأ الوسيطَ الأول لـ`queue_notification` من
-- **الكتالوج الحيّ**، ويحلّه بثلاثة أشكالٍ لا رابع: نصٌّ حرفيّ · تعبيرُ `case`
-- بفروعٍ حرفية · متغيّرٌ يُلاحَق إلى إسناداته. **وما لا يُحَلّ يُحمِّره** ولا
-- يُتخطّى بصمت — وهذا حدُّه المُعلَن في ترويسته.
--
-- وقد كُتبت هذه الدالةُ أولاً بـ`v_event := public.customer_event_for(new.event)`
-- فاحمرّ الحارسُ فعلاً بـ`unresolved-event` (مقيسٌ، لا متوقَّع). والعلاجُ إعادةُ
-- الخريطة إلى الشكل الذي يفهمه — وهو نفسُه شكلُ `log_booking_change` القائم.
-- ⚠ فمن أخرجها غداً إلى دالةٍ مساعدة «تنظيفاً» يُطفئ الحارسَ وهو أخضرُ ظاهرياً.
create or replace function public.fan_notification_to_customer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event   text;
  v_booking uuid;
begin
  -- 🔒 لا حلقة: صفُّ العميل لا يولّد صفَّ عميلٍ آخر. أولُ سطرٍ بقصد.
  if new.recipient_kind = 'customer' then
    return null;
  end if;

  v_event := case new.event
               when 'booking_confirmed'        then 'customer_booking_confirmed'
               when 'trip_assigned'            then 'customer_trip_assigned'
               when 'trip_completion_approved' then 'customer_trip_completed'
               else null
             end;
  if v_event is null then
    return null;
  end if;

  if not public.customer_notifications_enabled() then
    return null;
  end if;

  begin
    v_booking := nullif(new.payload ->> 'bookingId', '')::uuid;
  exception when others then
    -- حمولةٌ بمعرّفٍ مشوّه: لا إشعارَ عميلٍ ولا كسرَ لمعاملةِ الحجز.
    -- (‏D-48 بروحه: الأثرُ الجانبيّ لا يُسقط الحدث الأصلي)
    v_booking := null;
  end;
  if v_booking is null then
    return null;
  end if;

  -- والحجزُ يجب أن يوجد فعلاً — وإلا فالحمولةُ فارغة والصفُّ بلا معنى
  if not exists (select 1 from public.bookings b where b.id = v_booking) then
    return null;
  end if;

  -- حدثٌ واحدٌ لكل حجز: إعادةُ الإسناد لا تُعيد إزعاج العميل، والاعتمادُ
  -- المكرَّر لا يُنتج «انتهت رحلتك» مرتين.
  if exists (
    select 1 from public.notifications n
     where n.recipient_kind = 'customer'
       and n.recipient_id   = v_booking
       and n.event          = v_event
  ) then
    return null;
  end if;

  perform public.queue_notification(
    v_event,
    public.customer_notification_payload(v_booking),
    'customer',
    v_booking
  );

  return null;
end;
$$;

comment on function public.fan_notification_to_customer() is
  'يولّد صفَّ إشعارِ العميل من صفِّ التشغيل/المتعهد بلا أن يمسّ دالةً منتِجة (القاعدة ١٢). حمولتُه تُبنى من الحجز لا تُنسخ من حمولة التشغيل (D-19).';

-- ولا تبقى الدالةُ المساعدة التي كانت تحمل الخريطة: مصدرٌ ثانٍ لخريطةٍ واحدة
-- ينحرف حتماً (النمط ٨ في `LESSONS.md`)، وهي التي أحمرّت الحارس.
drop function if exists public.customer_event_for(text);

drop trigger if exists notifications_fan_customer on public.notifications;
create trigger notifications_fan_customer
  after insert on public.notifications
  for each row execute function public.fan_notification_to_customer();

-- ----------------------------------------------------------------------------
-- (٨) تذكيرُ الموعد — الحدثُ الوحيد بلا أصلٍ تشغيليّ
-- ----------------------------------------------------------------------------
--
-- ولماذا **لا** يُضاف نداؤها إلى `dispatch_tick`: عاملُ الإشعارات نفسُه يعمل
-- كل دقيقة (`vercel.json`) ويطالب بالطابور، فهو المكانُ الطبيعيُّ لـ«صُفَّ ما
-- استحق». وإضافةُ كتلةٍ إلى `dispatch_tick` كانت تعني `create or replace` على
-- قلب دورة البثّ لأجل سطرٍ واحد — بلاغُ خطرٍ لا يشتريه المكسب.

create or replace function public.queue_customer_reminders(p_limit integer default 200)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lead integer;
  v_row  record;
  v_n    integer := 0;
begin
  -- نفسُ حارس `settle_due_completions`: المشرفُ أو خادمُ الموقع أو الهجرة
  if not public.dispatch_ops_allowed() then
    raise exception 'صفُّ تذكيرات العملاء متاح للمشرف أو لخادم الموقع فقط'
      using hint = 'forbidden';
  end if;

  if not public.customer_notifications_enabled() then
    return 0;
  end if;

  -- دورتان متزامنتان: الثانية ترجع صفراً بهدوء بدل أن تصفَّ مرتين
  if not pg_try_advisory_xact_lock(913131) then
    return 0;
  end if;

  select s.reminder_lead_hours into v_lead
    from public.customer_notification_settings s where s.id;
  v_lead := coalesce(v_lead, 24);

  for v_row in
    select b.id
      from public.bookings b
     where b.status in ('confirmed', 'assigned')
       and public.trip_pickup_at(b.trip) is not null
       and public.trip_pickup_at(b.trip) >  now()
       and public.trip_pickup_at(b.trip) <= now() + make_interval(hours => v_lead)
       and not exists (
             select 1 from public.notifications n
              where n.recipient_kind = 'customer'
                and n.recipient_id   = b.id
                and n.event          = 'customer_trip_reminder')
     order by public.trip_pickup_at(b.trip)
     limit greatest(coalesce(p_limit, 200), 1)
  loop
    perform public.queue_notification(
      'customer_trip_reminder',
      public.customer_notification_payload(v_row.id),
      'customer',
      v_row.id
    );
    v_n := v_n + 1;
  end loop;

  return v_n;
end;
$$;

comment on function public.queue_customer_reminders(integer) is
  'يصفُّ تذكيرَ «اقترب موعد رحلتك» لكل حجزٍ مؤكَّدٍ أو مُسنَدٍ يقع انطلاقُه داخل مهلة التذكير — مرةً واحدةً لكل حجز. يناديه عاملُ الإشعارات كل دقيقة.';

-- ----------------------------------------------------------------------------
-- (٩) سطحُ قراءةِ العميل — على طراز `portal_inbox` حرفياً
-- ----------------------------------------------------------------------------

create or replace function public.customer_inbox(p_token text, p_limit integer default 20)
returns table (
  id         uuid,
  event      text,
  reference  text,
  created_at timestamptz,
  read_at    timestamptz,
  summary    jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    n.id,
    n.event,
    (n.payload ->> 'reference'),
    n.created_at,
    n.read_at,
    -- إسقاطٌ صريح: الصندوقُ لا يعرض إلا ما تعرضه صفحةُ الحجز أصلاً
    jsonb_strip_nulls(jsonb_build_object(
      'classTitle',   n.payload -> 'classTitle',
      'originLabel',  n.payload -> 'originLabel',
      'destLabel',    n.payload -> 'destLabel',
      'passengers',   n.payload -> 'passengers',
      'roundTrip',    n.payload -> 'roundTrip',
      'waitingHours', n.payload -> 'waitingHours',
      'pickupAt',     n.payload -> 'pickupAt',
      'currency',     n.payload -> 'currency',
      'total',        n.payload -> 'total'
    ))
  from public.notifications n
  join public.bookings b on b.id = n.recipient_id
  where n.recipient_kind = 'customer'
    -- نفسُ حارسِ `get_booking_by_token`: طولُ التوكن أولاً فلا يُطابَق فراغٌ
    and p_token is not null
    and length(p_token) >= 32
    and b.public_token = p_token
  order by n.created_at desc
  limit greatest(1, least(coalesce(p_limit, 20), 100));
$$;

comment on function public.customer_inbox(text, integer) is
  'صندوقُ إشعارات العميل لحاملِ توكن الحجز — نظيرُ `portal_inbox()` للمتعهد. إسقاطٌ صريح: ما ليس في `summary` لا يخرج.';

-- ----------------------------------------------------------------------------
-- (١٠) تسجيلُ جهازِ العميل — بإذنه الصريح، ولا اشتراكَ صامت
-- ----------------------------------------------------------------------------

create or replace function public.customer_register_push(
  p_token text, p_endpoint text, p_p256dh text, p_auth text, p_agent text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking uuid;
  v_id      uuid;
begin
  if p_token is null or length(p_token) < 32 then
    raise exception 'رابطُ متابعةِ الحجز غير صالح' using hint = 'invalid-token';
  end if;

  select b.id into v_booking from public.bookings b where b.public_token = p_token;
  if v_booking is null then
    raise exception 'رابطُ متابعةِ الحجز غير صالح' using hint = 'invalid-token';
  end if;

  if btrim(coalesce(p_endpoint, '')) = ''
     or btrim(coalesce(p_p256dh, '')) = ''
     or btrim(coalesce(p_auth, '')) = '' then
    raise exception 'اشتراك دفع ناقص' using hint = 'invalid-subscription';
  end if;

  insert into public.customer_push_subscriptions as cs
    (booking_id, endpoint, p256dh, auth, user_agent, last_seen_at)
  values (v_booking, btrim(p_endpoint), btrim(p_p256dh), btrim(p_auth),
          nullif(btrim(coalesce(p_agent, '')), ''), now())
  on conflict (booking_id, endpoint) do update
    set p256dh       = excluded.p256dh,
        auth         = excluded.auth,
        user_agent   = excluded.user_agent,
        last_seen_at = now()
  returning cs.id into v_id;

  return v_id;
end;
$$;

create or replace function public.customer_remove_push(p_token text, p_endpoint text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking uuid;
  v_n       integer;
begin
  if p_token is null or length(p_token) < 32 then
    return false;
  end if;
  select b.id into v_booking from public.bookings b where b.public_token = p_token;
  if v_booking is null then
    return false;
  end if;

  delete from public.customer_push_subscriptions cs
   where cs.booking_id = v_booking
     and cs.endpoint   = btrim(coalesce(p_endpoint, ''));
  get diagnostics v_n = row_count;
  return v_n > 0;
end;
$$;

create or replace function public.customer_push_registered(p_token text, p_endpoint text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.customer_push_subscriptions cs
      join public.bookings b on b.id = cs.booking_id
     where p_token is not null
       and length(p_token) >= 32
       and b.public_token = p_token
       and cs.endpoint    = btrim(coalesce(p_endpoint, ''))
  );
$$;

comment on function public.customer_register_push(text, text, text, text, text) is
  'يسجّل جهازَ العميل على حجزه بتوكن المتابعة. لا يُنادى إلا من معالجِ نقرةٍ صريحة في المتصفح — «ولا اشتراكَ صامت» قاعدةٌ في الواجهة، وهذه الدالة لا تعرف من ناداها.';

-- ── الصلاحيات ───────────────────────────────────────────────────────────────
--
-- ⚠ **فخُّ Supabase المكتوبُ في اتفاقية ٦**: `alter default privileges` تمنح
--   `anon` صلاحيةَ EXECUTE على **كل دالةٍ جديدة**. فسحبُ `public` وحده لا يُغلق
--   شيئاً — والسحبُ يجب أن يُسمّي `anon` و`authenticated` بالاسم. وهذا بعينه ما
--   أمسكه القسم (ط-٤) في `customer_notifications_tests.sql` على أول تشغيل.

revoke all on function public.customer_register_push(text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.customer_remove_push(text, text)                     from public, anon, authenticated;
revoke all on function public.customer_push_registered(text, text)                 from public, anon, authenticated;
revoke all on function public.customer_inbox(text, integer)                         from public, anon, authenticated;
revoke all on function public.customer_channels(uuid)                               from public, anon, authenticated;
revoke all on function public.customer_notification_payload(uuid)                   from public, anon, authenticated;
revoke all on function public.queue_customer_reminders(integer)                     from public, anon, authenticated;
revoke all on function public.customer_notifications_enabled()                      from public, anon, authenticated;
revoke all on function public.fan_notification_to_customer()                        from public, anon, authenticated;

-- ما تحتاجه صفحةُ العميل فعلاً — والعميلُ **زائر** بلا حساب، فـ`anon` تنفّذ
-- و`authenticated` كذلك (‏من ربط حجزه بحسابه يفتح الصفحة نفسها بالتوكن نفسه).
-- 🔒 والتوكنُ هو الحارس داخل كلٍّ منها: بلا حجزٍ يطابقه لا تُرجع ولا تكتب شيئاً.
grant execute on function public.customer_register_push(text, text, text, text, text) to anon, authenticated, service_role;
grant execute on function public.customer_remove_push(text, text)                     to anon, authenticated, service_role;
grant execute on function public.customer_push_registered(text, text)                 to anon, authenticated, service_role;
grant execute on function public.customer_inbox(text, integer)                        to anon, authenticated, service_role;

-- 🔒 وهذه للخادم وحده: قراراتُ توجيهٍ وحمولاتٌ وصفُّ طوابير — لا شأن لزائرٍ بها
grant execute on function public.queue_customer_reminders(integer)   to service_role;
grant execute on function public.customer_notification_payload(uuid) to service_role;
grant execute on function public.customer_channels(uuid)             to service_role;
grant execute on function public.customer_notifications_enabled()    to service_role;

-- ----------------------------------------------------------------------------
-- (١١) فحصٌ ذاتيّ — يسقط أحمرَ لو نزلت الهجرة ناقصة
-- ----------------------------------------------------------------------------
do $$
declare
  v_ch text[];
begin
  -- (أ) 🔴 الثقب مغلق: قنواتُ العميل لا تحمل تليجرام ولا قناةَ مالك
  v_ch := public.notification_channels_for('customer', null);
  if v_ch is null then
    raise exception '(٠-أ) قنواتُ العميل `null` — والعاملُ يسقط منها على قنوات المالك';
  end if;
  if 'telegram' = any (v_ch) or 'dashboard' = any (v_ch) or 'email' = any (v_ch)
     or 'inbox' = any (v_ch) or 'webpush' = any (v_ch) then
    raise exception '(٠-أ) 🔴 قنواتُ العميل تحمل قناةَ مالكٍ أو متعهد: %', v_ch;
  end if;
  if array_length(v_ch, 1) is null or not ('customer_inbox' = any (v_ch)) then
    raise exception '(٠-أ) 🔴 قنواتُ العميل بلا صندوق — والفراغُ يسقط على DEFAULT_CHANNELS في العامل المنشور: %', v_ch;
  end if;

  -- (ب) صنفٌ مجهول لا قناةَ له
  if array_length(public.notification_channels_for('nobody', null), 1) is not null then
    raise exception '(٠-ب) صنفٌ مجهول أخذ قنوات — فرعُ else ما زال يسقط على المالك';
  end if;

  -- (ج) وقنواتُ التشغيل لم تتغيّر
  if public.notification_channels_for('ops', null) is distinct from public.notification_channels() then
    raise exception '(٠-ج) قنواتُ التشغيل تغيّرت — والهجرة لا يجوز أن تمسّها';
  end if;

  -- (د) القيود الثلاثة موجودة
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.notifications'::regclass
                    and conname  = 'notifications_customer_payload_clean_chk') then
    raise exception '(٠-د) حاجزُ D-19 على الحمولة غير مثبَّت';
  end if;

  -- (هـ) المُشغّل مربوط
  if not exists (select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
                  where c.relname = 'notifications' and t.tgname = 'notifications_fan_customer') then
    raise exception '(٠-هـ) مُشغّلُ توليد صفِّ العميل غير مربوط';
  end if;

  raise notice '✔ 0131: الثقب مغلق · ثلاثةُ أصناف · حاجزُ D-19 · مُشغّلُ التوليد حيّ';
end;
$$;
