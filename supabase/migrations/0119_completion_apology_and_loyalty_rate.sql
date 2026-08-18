-- ============================================================================
-- 0119 — إتمامٌ يُطلَب ويُعتمد · اعتذارٌ بعد الإسناد · سقفٌ للخصم · ومعدّلُ ولاءٍ
--        بانتهاء صلاحية
--
-- المرجع الحاكم: قرارات المالك في بريف «الجبهة ٢»، ومعها
-- `docs/phase-briefs/FAILED-TRIPS-AND-PARTNER-ALERTS.md` §١-هـ (كتالوج الأسباب)
-- و`docs/phase-briefs/OWNER-DECISIONS-2026-08-17.md` §٤ (الولاء مُشعَلٌ بقراره).
-- **قراراتُ مالكٍ لا اقتراحاتُ جلسة.**
--
-- ══════════════════════════════════════════════════════════════════════════
--  ٠) لماذا بوابةٌ أصلاً — مقيسٌ من الكتالوج الحيّ (‏D-58) لا من ملفات الهجرة
-- ══════════════════════════════════════════════════════════════════════════
--
-- الاكتمال **يحرّك المال في اللحظة نفسها**، وثلاثة مُشغّلات تشهد:
--
--   • `bookings_ledger_completed`   ⇒ `ledger_on_booking_completed`
--       تكتب رجلَي الدفتر: `earned` (التزامٌ علينا) و`collected` (نقدٌ في يده).
--   • `bookings_loyalty_completed`  ⇒ `loyalty_on_booking_completed`
--       تسكّ نقاط العميل — `floor(base × points_per_currency)`.
--   • و`record_partner_settlement` تُبنى على ما اكتمل.
--
-- ⇒ **زرُّ «تمّت» في يد المتعهد بلا حارس يحرّك دفتر المالك بكلمة المتعهد وحده.**
--    فالقرار: يَطلب المتعهد، وتعتمد الإدارة — أو يُعتمد تلقائياً بعد مهلةٍ
--    **من اللوحة لا ثابتةً في الكود** — و**عندها وحدها** يتحرك المال.
--
-- ══════════════════════════════════════════════════════════════════════════
--  ١) 🔴 لماذا **لا حالة ثامنة** في `bookings.status` — قرارٌ يُقرأ قبل النقض
-- ══════════════════════════════════════════════════════════════════════════
--
-- البديهيّ أن تُضاف حالةٌ بين `assigned` و`completed`. ورُفض لسببين مقيسين:
--
--   (أ) **الحالة الثامنة تلمس أحد عشر ملفاً خارج هذه الجبهة** — من
--       `lib/booking-types.ts` إلى صفحة تتبّع العميل إلى شارة حالة البورتال —
--       وثلاثةُ وكلاء يعملون على السطح نفسه الآن. ووكيلان على ملفٍّ واحد
--       **يمحو أحدهما الآخر بلا خطأٍ يظهر** (‏`CONVENTIONS` §١١د).
--   (ب) **وأهمّ منه**: ما دام الحجز `assigned` فالمال **لم يتحرك بنيوياً** —
--       لا مُشغّل دفترٍ يعمل، ولا نقطةٌ تُسكّ، ولا تسويةٌ تُبنى. أي أن بقاءه
--       `assigned` **هو بعينه** ضمانةُ «لا يتحرك المال قبل الاعتماد»، لا
--       التفافٌ عليها. الحالة الوسيطة موجودةٌ وظاهرةٌ في الشاشتين، ومكانها
--       صفُّ `trip_completion_requests` — وهو كيانٌ له تاريخ وقرارٌ وفاعل،
--       بينما الحالة النصّية لا تحمل شيئاً من ذلك.
--
-- ══════════════════════════════════════════════════════════════════════════
--  ٢) الاعتذار بعد الإسناد — الثقب الذي كان مفتوحاً
-- ══════════════════════════════════════════════════════════════════════════
--
-- `reject_offer` تعمل على **عرضٍ** لا على رحلةٍ مُسنَدة. فبعد القبول لا مخرج:
-- من تعطّلت سيارته يختفي، أو يتصل هاتفياً، والرحلة تبقى باسمه حتى تفشل.
--
-- والوجهة **تتفرّع بالوقت المتبقي** (قرار المالك): بعيدٌ ⇒ موجةُ بثٍّ جديدة
-- تلقائياً؛ قريبٌ ⇒ إسنادٌ يدوي بتنبيه. والعتبة **إعدادُ لوحة، افتراضها ٦ ساعات**
-- — ثلاثةُ أضعاف أرضية المهلة (`min_lead_minutes = 120`) فتتّسع لموجةٍ كاملة،
-- وقصيرةٌ بما يكفي ألّا يستيقظ المالك على رحلةٍ بلا مُنفِّذ.
--
-- 🔴 **والمنسحب يُستثنى من الموجة التالية**، وإلا عرضت عليه الموجةُ الرحلةَ التي
--    اعتذر عنها قبل دقيقة. والآلية **مبنيّةٌ سلفاً ولا تُستنسخ**: `dispatch_broadcast`
--    تُصفّي `not exists (… prev.status = 'rejected')`، فيكفي أن يصير عرضُه
--    المقبول `rejected`. وفهرس `trip_offers_one_accepted_key` الجزئي يتحرر معه.
--
-- ══════════════════════════════════════════════════════════════════════════
--  ٣) 🔴 الخصم — مقيسٌ ومكشوف
-- ══════════════════════════════════════════════════════════════════════════
--
--   • **العطب القائم اليوم**: `mark_booking_failed` تقبل **أي** مبلغٍ موجب بلا
--     سقفٍ إطلاقاً — الشرط الوحيد `if v_amount <= 0 then raise`. فخطأُ صفرٍ
--     زائد يخصم من المتعهد عشرة أضعاف مستحقه ويصير مديناً بمالٍ لم يقبضه.
--   • **قرار المالك**: مبلغٌ افتراضي لكل سبب في الكتالوج، **مسقوفٌ بمستحق تلك
--     الرحلة** — لا رصيدَ سالب ولا تحصيلَ ديون. والتجاوز بقرارٍ إداري لكل واقعة،
--     ومعه **مسارُ تظلّم**.
--   • 🔴 **ولا يُشغَّل خصمٌ حقيقيٌّ جديد**: المالك لم يؤكّد بعد الأساسَ التعاقدي
--     للخصم التلقائي على الاعتذار. فـ`apology_deduction_enabled` **مطفأٌ
--     بالبذرة**: المبلغ يُحسب ويُسجَّل ويُعرض، **ولا قيدَ دفترٍ يُكتب**. وما هو
--     قائمٌ اليوم — خصمُ الإدارة اليدوي لكل واقعة في `mark_booking_failed` —
--     يبقى كما هو، **ويكسب السقف فقط**.
--
-- ══════════════════════════════════════════════════════════════════════════
--  ٤) الولاء — معدّلٌ ينزل، ونقاطٌ تنتهي، وثمنٌ يُقال لا يُخفى
-- ══════════════════════════════════════════════════════════════════════════
--
-- | المقبض | قبل | بعد |
-- |---|---|---|
-- | `points_per_currency` | ١٫٢٥ | **١** |
-- | `currency_per_point`  | ٠٫٠٥ | **٠٫٠٢** |
-- | `min_redeem_points`   | ١٠٠٠ | ١٠٠٠ (بلا تغيير) |
-- | الاسترداد الفعلي      | ٦٫٢٥٪ | **٢٪** |
--
-- ⚠ **والثمنُ مكتوبٌ لا مطويّ**: الدفتر يخزّن **نقاطاً** ويقوّمها لحظةَ الاستبدال
--   من الإعداد الجاري. فخفضُ `currency_per_point` **يُعيد تسعير كل نقطةٍ مسكوكة
--   سلفاً** — حسابا المالك التجريبيان (١٢٨٬٢٥٠ نقطة مقيسةً الآن) ينزلان من
--   ٦٬٤١٢٫٥٠ ج.م إلى ٢٬٥٦٥ ج.م. **يعلم المالك ذلك وقرّره.**
--
-- 🔒 **وانتهاء الصلاحية «من تاريخ الكسب» يفرض تتبّعاً FIFO**: الدفتر مُلحَقٌ
--    برصيدٍ مجمَّع، فبلا ترتيبٍ صريح لا يُعرف أيُّ نقاطٍ استهلكها الاستبدال.
--    فالحلّ **اشتقاقٌ لا عمودٌ جديد**: `loyalty_lots()` ترتّب دفعات الكسب
--    بتاريخها وتوزّع عليها المُنفَق بالأقدم فالأقدم. والانتهاء **قيدٌ جديد
--    (`direction = 'expire'`) لا حذف** — والمهمة المجدولة **آمنةُ الإعادة
--    بنيوياً**: القيد يخفض الرصيد فتُحسَب الدفعاتُ نفسها مستهلَكةً في النداء
--    التالي، فلا شيء يُنتزع مرتين. و`loyalty_reconcile` تبقى الحَكَم.
--
-- ⚠ ومقيسٌ الآن: **١١٤ قيدَ كسبٍ كلُّها بين 2026-08-17 و2026-08-18**، فبمهلة
--   ثلاثة أشهر **لا شيء ينتهي اليوم ولا في نوفمبر القريب** — التغيير يبدأ نظيفاً.
--
-- ══════════════════════════════════════════════════════════════════════════
--  ٥) وأين تعمل المهمتان المجدولتان
-- ══════════════════════════════════════════════════════════════════════════
--
-- على **دورة البث القائمة** لا على مسارٍ ثالث — وهو نفس المنطق المكتوب حرفياً
-- في `app/api/dispatch/tick/route.ts` عن كنس الطلبات غير المدفوعة: «إضافة مسار
-- ثانٍ تعني سرّاً ثانياً وجدولة ثانية تُنسى». فـ`dispatch_tick()` تنادي
-- `settle_due_completions()` و`expire_loyalty_points()` **كلاًّ داخل كتلةٍ
-- محصورة**: فشلُها يرجع وحده ويُبرق تنبيهاً للتشغيل، ولا يُسقط دورة البث.
-- **ولا يتغير توقيع `dispatch_tick`**، فلا مستهلكٌ واحد يحتاج تعديلاً.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- (١) إعدادات الإغلاق — مقابضُ لوحةٍ لا ثوابتُ كود
-- ----------------------------------------------------------------------------

create table if not exists public.trip_closure_settings (
  id                        boolean primary key default true,
  -- مهلة الاعتماد التلقائي لطلب الإتمام — قرار المالك: ٢٤ ساعة، **إعداداً**
  completion_approve_hours  integer not null default 24,
  -- عتبة تفرّع الاعتذار: أبعدُ منها ⇒ موجةٌ جديدة · أقربُ ⇒ إسنادٌ يدوي بتنبيه
  apology_manual_hours      integer not null default 6,
  -- 🔴 الخصم التلقائي على الاعتذار — **مطفأٌ حتى يؤكّد المالك الأساس التعاقدي**
  apology_deduction_enabled boolean not null default false,
  updated_at                timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'trip_closure_settings_id_check') then
    alter table public.trip_closure_settings
      add constraint trip_closure_settings_id_check check (id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'trip_closure_approve_hours_chk') then
    alter table public.trip_closure_settings
      add constraint trip_closure_approve_hours_chk
      check (completion_approve_hours between 1 and 336);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'trip_closure_manual_hours_chk') then
    alter table public.trip_closure_settings
      add constraint trip_closure_manual_hours_chk
      check (apology_manual_hours between 0 and 168);
  end if;
end;
$$;

insert into public.trip_closure_settings (id) values (true) on conflict (id) do nothing;

comment on table public.trip_closure_settings is
  'مقابض إغلاق الرحلة: مهلة الاعتماد التلقائي لطلب الإتمام، وعتبة تفرّع الاعتذار، ومفتاح الخصم التلقائي (مطفأ بالبذرة — الأساس التعاقدي لم يؤكَّد بعد).';
comment on column public.trip_closure_settings.apology_deduction_enabled is
  '🔴 مطفأ بقصد: الاعتذار يحسب مبلغ الخصم ويسجّله ولا يكتب قيد دفتر. تشغيله قرار مالك لا سهو.';

drop trigger if exists trip_closure_settings_touch_updated_at on public.trip_closure_settings;
create trigger trip_closure_settings_touch_updated_at
  before update on public.trip_closure_settings
  for each row execute function public.touch_updated_at();

drop trigger if exists trip_closure_settings_no_delete on public.trip_closure_settings;
create trigger trip_closure_settings_no_delete
  before delete on public.trip_closure_settings
  for each row execute function public.settings_row_no_delete();

drop trigger if exists audit_trip_closure_settings on public.trip_closure_settings;
create trigger audit_trip_closure_settings
  after insert or update or delete on public.trip_closure_settings
  for each row execute function public.log_audit();

-- قارئٌ واحد بقيمٍ افتراضية — فلا شاشة تقرأ الجدول مباشرةً ولا رقمان ينحرفان
create or replace function public.trip_closure_config()
returns table(
  completion_approve_hours  integer,
  apology_manual_hours      integer,
  apology_deduction_enabled boolean
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    coalesce(c.completion_approve_hours, 24),
    coalesce(c.apology_manual_hours, 6),
    coalesce(c.apology_deduction_enabled, false)
  from (select 1) one
  left join public.trip_closure_settings c on c.id;
$function$;

comment on function public.trip_closure_config() is
  'مصدرٌ واحد لمقابض الإغلاق — تقرؤه الدوال والشاشات معاً، وقيمه الافتراضية هي قيم البذرة نفسها فلا ينحرف رقمان.';


-- ----------------------------------------------------------------------------
-- (٢) كتالوجٌ **واحد** بنطاقٍ ومُبادِرٍ ومبلغٍ افتراضي — لا كتالوجان
-- ----------------------------------------------------------------------------
--
-- قرار المالك نصّاً: «قائمةٌ واحدة **بنطاق**، لا اثنتان: أيُّ الأسباب يصلح
-- للفشل، وأيُّها للاعتذار، وأيُّها لكليهما — **ومَن بادر**». و«`pay` لا معنى
-- لها إلا حين تسحب المنصةُ الإسناد، لا حين ينسحب المتعهد» ⇒ **قيدُ جدول** لا
-- عُرفٌ في شاشة.
--
-- و**أسبابُ الصفر واجبةُ الوجود**: حادثٌ حقيقي لا يُغرَّم، وإلا كذب المتعهدون
-- في السبب فَفقدت البيانات معناها — وهي بعينها علّة الكتالوج (القياس).

alter table public.failure_reasons add column if not exists applies_to           text;
alter table public.failure_reasons add column if not exists initiator            text;
alter table public.failure_reasons add column if not exists default_deduct_amount numeric;

update public.failure_reasons set applies_to = 'failure' where applies_to is null;
update public.failure_reasons set initiator  = 'any'     where initiator  is null;

alter table public.failure_reasons alter column applies_to set default 'failure';
alter table public.failure_reasons alter column initiator  set default 'any';
alter table public.failure_reasons alter column applies_to set not null;
alter table public.failure_reasons alter column initiator  set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'failure_reasons_scope_chk') then
    alter table public.failure_reasons add constraint failure_reasons_scope_chk
      check (applies_to = any (array['failure', 'apology', 'both']));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'failure_reasons_initiator_chk') then
    alter table public.failure_reasons add constraint failure_reasons_initiator_chk
      check (initiator = any (array['platform', 'partner', 'any']));
  end if;
  -- 🔒 «ادفع كاملاً» لمن بادر بالانسحاب تناقضٌ لا خيار — فيُمنع بنيوياً
  if not exists (select 1 from pg_constraint where conname = 'failure_reasons_pay_initiator_chk') then
    alter table public.failure_reasons add constraint failure_reasons_pay_initiator_chk
      check (default_action <> 'pay' or initiator <> 'partner');
  end if;
  -- مبلغٌ افتراضي بلا إجراء خصم رقمٌ لا يقرؤه أحد
  if not exists (select 1 from pg_constraint where conname = 'failure_reasons_deduct_default_chk') then
    alter table public.failure_reasons add constraint failure_reasons_deduct_default_chk
      check (default_deduct_amount is null or default_action = 'deduct');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'failure_reasons_deduct_range_chk') then
    alter table public.failure_reasons add constraint failure_reasons_deduct_range_chk
      check (
        default_deduct_amount is null
        or (default_deduct_amount > 0 and default_deduct_amount < 1e9)
      );
  end if;
end;
$$;

comment on column public.failure_reasons.applies_to is
  'نطاق السبب: failure (رحلة لم تُنفَّذ) · apology (انسحاب بعد الإسناد) · both. قائمةٌ واحدة بنطاق لا قائمتان — قرار المالك.';
comment on column public.failure_reasons.initiator is
  'من بادر: platform (نحن أو العميل) · partner (المتعهد) · any. و pay ممنوعة على partner بقيد جدول.';
comment on column public.failure_reasons.default_deduct_amount is
  'المبلغ المقترح للخصم — **مسقوفٌ دائماً بمستحق تلك الرحلة** في mark_booking_failed وwithdraw_from_trip. فارغٌ = لا اقتراح.';

-- تصنيفُ الستة المبذورة — **مرةً واحدة فقط**: إن كان المالك قد صنّف صفاً بنفسه
-- فلا تُدهس تحريراتُه بإعادة تنفيذ الهجرة.
do $$
begin
  if not exists (select 1 from public.failure_reasons where applies_to <> 'failure') then
    update public.failure_reasons set applies_to = 'failure',  initiator = 'partner'  where slug = 'driver-no-show';
    update public.failure_reasons set applies_to = 'failure',  initiator = 'partner'  where slug = 'severe-delay';
    -- عطل المركبة يقع قبل التنفيذ فيصير اعتذاراً، وبعده فيصير فشلاً ⇒ كلاهما
    update public.failure_reasons set applies_to = 'both',     initiator = 'any'      where slug = 'vehicle-breakdown';
    -- المتعهد أدّى ما عليه ⇒ يُدفع. والمُبادِر ليس المتعهد، فالقيد يمرّ.
    update public.failure_reasons set applies_to = 'failure',  initiator = 'platform' where slug = 'customer-no-show';
    update public.failure_reasons set applies_to = 'both',     initiator = 'any'      where slug = 'force-majeure';
    update public.failure_reasons set applies_to = 'both',     initiator = 'platform' where slug = 'admin-decision';
  end if;
end;
$$;

-- أسبابُ الاعتذار — تُبذَر ولا تُدهس. ومنها **صفريّان** عمداً (٥-هـ في البريف):
-- طارئٌ إنساني وعطلٌ لا يُغرَّم، وإلا كذب المتعهد في السبب.
insert into public.failure_reasons
  (slug, label, default_action, active, sort, applies_to, initiator, default_deduct_amount) values
  ('partner-emergency',     'ظرف طارئ للمتعهد أو سائقه', 'none',   true, 70,  'apology', 'partner', null),
  ('partner-double-booking','ازدواج في جدول المتعهد',     'deduct', true, 80,  'apology', 'partner', null),
  ('partner-no-reason',     'اعتذار بلا سبب معلن',        'deduct', true, 90,  'apology', 'partner', null),
  ('platform-withdrawn',    'سحبت الإدارة الإسناد',       'pay',    true, 100, 'apology', 'platform', null)
on conflict (slug) do nothing;


-- ----------------------------------------------------------------------------
-- (٣) 🔴 سقفُ الخصم — العطب القائم يُغلق حيث وقع
-- ----------------------------------------------------------------------------
--
-- الجسم منقولٌ من `pg_get_functiondef` الحيّ (‏**D-58**)، والتغييرُ **أربعة
-- مواضع لا أكثر**، وكلٌّ منها معلَّمٌ بـ`0119`:
--   (١) السبب يُفحص نطاقُه: `failure` أو `both` — لا يُعلَّم فشلٌ بسبب اعتذار.
--   (٢) المبلغ يسقط على اقتراح الكتالوج حين لا يرسل المدير رقماً.
--   (٣) **السقف**: لا يتجاوز مستحق تلك الرحلة — يُرفض ويُقال الحد، ولا يُقصّ
--       صامتاً: قصٌّ صامتٌ يجعل المدير يظن أنه خصم ما كتب.
--   (٤) والسقف يُفحص **بعد** قراءة المُنفِّذ، لأن الحدّ هو `assigned_payout`.

create or replace function public.mark_booking_failed(
  p_booking_id    uuid,
  p_reason_slug   text,
  p_action        text default null,
  p_deduct_amount numeric default null,
  p_note          text default null
)
returns table(
  booking_id      uuid,
  reference       text,
  reason_slug     text,
  action_taken    text,
  deduct_amount   numeric,
  ledger_effect   text,
  points_reversed integer
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_b      record;
  v_r      record;
  v_sub    uuid;
  v_payout numeric;
  v_action text;
  v_amount numeric;
  v_cap    numeric;
  v_note   text;
  v_effect text := 'none';
  v_earned uuid;
  v_pts    integer := 0;
  v_completed timestamptz;
  v_now    timestamptz := now();
begin
  -- الحارس المالي نفسه الذي يحرس `record_partner_adjustment` — فلا يبلغ هذا
  -- المدخلَ من لا يستطيع تنفيذ أثره
  if not public.finance_admin_allowed() then
    raise exception 'تعليم الرحلة فاشلة متاح للإدارة وحدها' using hint = 'forbidden';
  end if;

  select b.* into v_b from public.bookings b where b.id = p_booking_id for update;
  if not found then
    raise exception 'الحجز غير موجود' using hint = 'booking-not-found';
  end if;

  if v_b.status not in ('assigned', 'completed') then
    raise exception
      'حالة الحجز «%» لا تُعلَّم فاشلة — الفشل من «مُسندة» أو «مكتملة» وحدهما',
      v_b.status
      using hint = 'invalid-status';
  end if;

  -- نافذة إعادة التصنيف تُفحص **مبكراً**: الحارس يفرضها على أي حال، لكن تركها
  -- إلى آخر سطر يعني أن نداءً محكومَ الرفض يمرّ على التحقق كله ثم يُرجَع. ونفس
  -- المصدرين حرفياً (`booking_completed_at` + `failed_reclass_window`) فلا رقمان.
  if v_b.status = 'completed' then
    v_completed := public.booking_completed_at(p_booking_id);
    if v_completed is null then
      raise exception
        'تعذّر إثبات لحظة اكتمال الحجز «%» من سجل الأحداث — إعادة التصنيف مرفوضة',
        coalesce(v_b.reference, p_booking_id::text)
        using hint = 'completion-time-unknown';
    end if;
    if now() > v_completed + public.failed_reclass_window() then
      raise exception
        'انقضت نافذة إعادة تصنيف الحجز «%» — اكتمل في % والنافذة %',
        coalesce(v_b.reference, p_booking_id::text), v_completed, public.failed_reclass_window()
        using hint = 'reclass-window-closed';
    end if;
  end if;

  -- (أ) السبب من الكتالوج. والمعطَّل مرجعٌ لصفوفٍ قديمة **ولا يُختار من جديد**.
  select r.* into v_r
  from public.failure_reasons r
  where r.slug = lower(btrim(coalesce(p_reason_slug, '')));
  if not found then
    raise exception 'سبب الفشل «%» غير موجود في الكتالوج', coalesce(p_reason_slug, '')
      using hint = 'reason-not-found';
  end if;
  if not v_r.active then
    raise exception 'سبب الفشل «%» معطَّل — اختر سبباً مفعَّلاً', v_r.label
      using hint = 'reason-inactive';
  end if;
  -- 0119 (١): نطاقُ السبب — كتالوجٌ واحد بنطاقٍ يعني أن النطاق يُفرض هنا
  if v_r.applies_to not in ('failure', 'both') then
    raise exception
      'السبب «%» مخصَّصٌ للاعتذار عن رحلةٍ مُسنَدة لا لتعليمها فاشلة', v_r.label
      using hint = 'reason-out-of-scope';
  end if;

  -- (ب) الإجراء: ما اختاره المدير، وإلا فاقتراح الكتالوج
  v_action := coalesce(
    lower(nullif(btrim(coalesce(p_action, '')), '')),
    v_r.default_action
  );
  if v_action not in ('none', 'pay', 'deduct') then
    raise exception 'الإجراء المالي «%» غير معروف — none أو pay أو deduct', v_action
      using hint = 'invalid-action';
  end if;

  v_note := nullif(btrim(coalesce(p_note, '')), '');
  if v_action is distinct from v_r.default_action and v_note is null then
    raise exception
      'تجاوز الإجراء الافتراضي «%» إلى «%» يستلزم مبرراً مكتوباً',
      v_r.default_action, v_action
      using hint = 'override-note-required';
  end if;

  -- (ج) المبلغ حكرٌ على الخصم
  --     0119 (٢): وحين لا يرسل المدير رقماً يسقط على اقتراح الكتالوج — وهو ما
  --     يجعل «مبلغٌ افتراضي لكل سبب» قراراً نافذاً لا حقلاً للعرض.
  if v_action = 'deduct' then
    v_amount := round(coalesce(p_deduct_amount, v_r.default_deduct_amount, 0), 2);
    if v_amount <= 0 then
      raise exception 'الخصم يستلزم مبلغاً موجباً' using hint = 'deduct-amount-required';
    end if;
  elsif coalesce(p_deduct_amount, 0) <> 0 then
    raise exception 'مبلغ الخصم لا معنى له مع الإجراء «%»', v_action
      using hint = 'invalid-input';
  end if;

  -- (د) المنفّذ من `dispatches` لا من `bookings.subcontractor_id` — ذاك لقطةُ
  --     من سُعِّر على أساسه، وهذا من نفّذ فعلاً (نفس تمييز `accept_offer`).
  select d.assigned_subcontractor_id, d.assigned_payout
    into v_sub, v_payout
  from public.dispatches d
  where d.booking_id = p_booking_id;

  if v_action in ('pay', 'deduct') and v_sub is null then
    raise exception
      'لا متعهد مُسنَد لهذا الحجز — «%» بلا طرفٍ يُدفع له أو يُخصم منه', v_action
      using hint = 'no-partner';
  end if;

  -- 0119 (٣)(٤): 🔴 **السقف** — قرار المالك: لا رصيدَ سالب ولا تحصيلَ ديون.
  --   والحدّ مستحقُّ تلك الرحلة نفسها لا رقمٌ عام، فيُقرأ بعد سطر (د) لا قبله.
  --   ويُرفض ولا يُقصّ: القصُّ الصامت يترك المدير يظن أنه خصم ما كتب.
  if v_action = 'deduct' then
    v_cap := round(coalesce(v_payout, 0), 2);
    if v_cap <= 0 then
      raise exception
        'لا مستحق مسجَّل لهذه الرحلة — فلا سقف يُخصم في حدوده'
        using hint = 'deduct-no-cap';
    end if;
    if v_amount > v_cap then
      raise exception
        'الخصم (%) يتجاوز مستحق هذه الرحلة (%) — والسقف قرار مالك: لا يصير المتعهد مديناً بمالٍ لم يقبضه',
        v_amount, v_cap
        using hint = 'deduct-over-cap';
    end if;
  end if;

  -- (هـ) الأثر المالي — على مسار المال القائم وحده (انظر ترويسة `0051`).
  if v_b.status = 'completed' then
    if v_action = 'pay' then
      v_effect := 'payout-kept';
    else
      select e.id into v_earned
      from public.ledger_entries e
      where e.source_type     = 'partner_payout'
        and e.source_id       = p_booking_id
        and e.settlement_role = 'earned'
        and e.reverses_entry_id is null
        and not exists (
          select 1 from public.ledger_entries x where x.reverses_entry_id = e.id
        )
      limit 1;

      if v_earned is not null then
        perform public.reverse_ledger_entry(
          v_earned,
          'إلغاء مستحق المتعهد — فشلت الرحلة ' || coalesce(v_b.reference, '')
            || ' (' || v_r.label || ')'
        );
        v_effect := 'payout-reversed';
      else
        v_effect := 'payout-missing';
      end if;
    end if;
  else
    if v_action = 'pay' then
      if coalesce(v_payout, 0) <= 0 then
        raise exception 'مستحق الإسناد صفر أو مفقود — لا مبلغ يُدفع' using hint = 'no-payout';
      end if;
      perform public.record_partner_adjustment(
        v_sub, 'earned', round(v_payout, 2), v_now,
        'مستحق رحلةٍ فاشلة — ' || v_r.label || ' — ' || coalesce(v_b.reference, '')
      );
      v_effect := 'payout-created';
    end if;
  end if;

  if v_action = 'deduct' then
    perform public.record_partner_adjustment(
      v_sub, 'collected', v_amount, v_now,
      'خصمٌ على رحلةٍ فاشلة — ' || v_r.label || ' — ' || coalesce(v_b.reference, '')
    );
    v_effect := case
                  when v_effect = 'payout-reversed' then 'payout-reversed+deduct'
                  when v_effect = 'payout-missing'  then 'deduct'
                  else 'deduct'
                end;
  end if;

  -- (و) صفّ الفشل — **قبل** الحالة: الحارس `bookings_guard_failed` يشترط وجوده
  begin
    insert into public.booking_failures (
      booking_id, reason_id, reason_slug, reason_label, default_action,
      action_taken, deduct_amount, override_note, from_status,
      subcontractor_id, payout_snapshot, ledger_effect, failed_at, created_by
    )
    values (
      p_booking_id, v_r.id, v_r.slug, v_r.label, v_r.default_action,
      v_action, v_amount, v_note, v_b.status,
      v_sub, v_payout, v_effect, v_now, public.current_actor()
    );
  exception
    when unique_violation then
      raise exception 'هذا الحجز معلَّمٌ فاشلاً سلفاً' using hint = 'already-failed';
  end;

  -- (ز) الحالة أخيراً — والمُشغّلات تتكفّل بالولاء وبسجل الأحداث
  perform set_config(
    'tours.booking_note',
    'فشلت الرحلة — ' || v_r.label
      || case when v_note is not null then ' — ' || v_note else '' end,
    true
  );

  update public.bookings b set status = 'failed' where b.id = p_booking_id;

  select count(*)::integer into v_pts
  from public.loyalty_entries e
  where e.booking_id = p_booking_id
    and e.direction  = 'reverse'
    and e.created_at = v_now;

  booking_id      := p_booking_id;
  reference       := v_b.reference;
  reason_slug     := v_r.slug;
  action_taken    := v_action;
  deduct_amount   := v_amount;
  ledger_effect   := v_effect;
  points_reversed := v_pts;
  return next;
end;
$function$;

comment on function public.mark_booking_failed(uuid, text, text, numeric, text) is
  '0119: الخصم صار مسقوفاً بمستحق الرحلة (يُرفض عند التجاوز لا يُقصّ)، ويسقط على المبلغ الافتراضي في الكتالوج، والسبب يُفحص نطاقُه (failure أو both).';


-- ----------------------------------------------------------------------------
-- (٤) الحالة بين الإسناد والاكتمال — طلبٌ يُعتمد، أو يُعتمد تلقائياً بفاعلٍ مسمّى
-- ----------------------------------------------------------------------------

create table if not exists public.trip_completion_requests (
  id               uuid primary key default gen_random_uuid(),
  booking_id       uuid not null references public.bookings(id) on delete restrict,
  subcontractor_id uuid not null references public.subcontractors(id) on delete restrict,
  status           text not null default 'pending',
  requested_at     timestamptz not null default now(),
  request_note     text,
  -- لحظةُ الاعتماد التلقائي **مجمَّدةٌ عند الطلب**: تغييرُ المهلة من اللوحة غداً
  -- لا يُقدّم اعتماد طلبٍ قائم ولا يؤخّره — نفس انضباط لقطة السعر.
  auto_approve_at  timestamptz not null,
  approve_hours    integer not null,
  payout_snapshot  numeric,
  decided_at       timestamptz,
  decided_by       uuid,
  -- 🔴 «اعتُمد تلقائياً» **فاعلٌ مكتوب لا فراغ**: بعد شهرٍ يُعرف من اعتمد
  decided_actor    text,
  decision_note    text,
  created_at       timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'trip_completion_requests_status_chk') then
    alter table public.trip_completion_requests add constraint trip_completion_requests_status_chk
      check (status = any (array['pending', 'approved', 'rejected']));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'trip_completion_requests_actor_chk') then
    alter table public.trip_completion_requests add constraint trip_completion_requests_actor_chk
      check (decided_actor is null or decided_actor = any (array['admin', 'auto']));
  end if;
  -- القرار والفاعل واللحظة: ثلاثتُها معاً أو لا شيء — فلا صفَّ «مقرَّرٌ بلا قرار»
  if not exists (select 1 from pg_constraint where conname = 'trip_completion_requests_decided_chk') then
    alter table public.trip_completion_requests add constraint trip_completion_requests_decided_chk
      check (
        (status = 'pending' and decided_at is null and decided_actor is null)
        or (status <> 'pending' and decided_at is not null and decided_actor is not null)
      );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'trip_completion_requests_hours_chk') then
    alter table public.trip_completion_requests add constraint trip_completion_requests_hours_chk
      check (approve_hours between 1 and 336);
  end if;
end;
$$;

-- طلبٌ معلَّقٌ واحدٌ لكل حجز، واعتمادٌ واحدٌ لكل حجز — الفهرسان هما الحَكَم لا القراءة
create unique index if not exists trip_completion_requests_one_pending_key
  on public.trip_completion_requests (booking_id) where status = 'pending';
create unique index if not exists trip_completion_requests_one_approved_key
  on public.trip_completion_requests (booking_id) where status = 'approved';
create index if not exists trip_completion_requests_due_idx
  on public.trip_completion_requests (auto_approve_at) where status = 'pending';
create index if not exists trip_completion_requests_partner_idx
  on public.trip_completion_requests (subcontractor_id, requested_at desc);

comment on table public.trip_completion_requests is
  'طلب المتعهد إتمامَ رحلته. الحالة الوسيطة بين assigned وcompleted — والمالُ لا يتحرك حتى تُعتمد (بالإدارة أو تلقائياً بعد مهلة اللوحة).';

drop trigger if exists audit_trip_completion_requests on public.trip_completion_requests;
create trigger audit_trip_completion_requests
  after insert or update or delete on public.trip_completion_requests
  for each row execute function public.log_audit('status');


-- (٤-أ) المتعهد يطلب
create or replace function public.request_trip_completion(p_booking_id uuid, p_note text default null)
returns table(request_id uuid, auto_approve_at timestamptz, approve_hours integer)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_sub    uuid;
  v_d      record;
  v_b      record;
  v_cfg    record;
  v_pickup timestamptz;
  v_id     uuid;
  v_at     timestamptz;
  v_now    timestamptz := now();
begin
  v_sub := public.current_subcontractor_id();
  if v_sub is null then
    raise exception 'طلب إتمام الرحلة متاح لحساب متعهد فقط' using hint = 'forbidden';
  end if;

  select d.* into v_d from public.dispatches d where d.booking_id = p_booking_id for update;
  if not found or v_d.assigned_subcontractor_id is distinct from v_sub then
    raise exception 'هذه الرحلة ليست مُسنَدة إليك' using hint = 'forbidden';
  end if;

  select b.* into v_b from public.bookings b where b.id = p_booking_id;
  if not found then
    raise exception 'الحجز غير موجود' using hint = 'booking-not-found';
  end if;
  if v_b.status <> 'assigned' then
    raise exception 'حالة هذه الرحلة «%» لا تقبل طلب إتمام', v_b.status
      using hint = 'invalid-status';
  end if;

  -- رحلةٌ لم يحن موعدها لا «تتمّ». والقراءة من نفس اللقطة التي تقرؤها
  -- `portal_trips()` حرفاً بحرف، فلا مصدرُ وقتٍ ثانٍ.
  v_pickup := nullif(btrim(coalesce(v_b.trip ->> 'pickupAt', '')), '')::timestamptz;
  if v_pickup is not null and v_pickup > v_now then
    raise exception
      'موعد هذه الرحلة لم يحِن بعد (%) — لا يُطلب إتمامها قبل تنفيذها', v_pickup
      using hint = 'too-early';
  end if;

  select * into v_cfg from public.trip_closure_config();
  v_at := v_now + make_interval(hours => v_cfg.completion_approve_hours);

  begin
    insert into public.trip_completion_requests (
      booking_id, subcontractor_id, request_note,
      auto_approve_at, approve_hours, payout_snapshot
    )
    values (
      p_booking_id, v_sub, nullif(btrim(coalesce(p_note, '')), ''),
      v_at, v_cfg.completion_approve_hours, v_d.assigned_payout
    )
    returning id into v_id;
  exception
    when unique_violation then
      raise exception 'لهذه الرحلة طلب إتمام قائم بالفعل' using hint = 'already-requested';
  end;

  perform public.queue_notification(
    'trip_completion_requested',
    public.dispatch_trip_payload(p_booking_id, false) || jsonb_build_object(
      'requestId',       v_id,
      'subcontractorId', v_sub,
      'payout',          v_d.assigned_payout,
      'requestedAt',     v_now,
      'autoApproveAt',   v_at,
      'approveHours',    v_cfg.completion_approve_hours,
      'note',            nullif(btrim(coalesce(p_note, '')), '')
    )
  );

  request_id      := v_id;
  auto_approve_at := v_at;
  approve_hours   := v_cfg.completion_approve_hours;
  return next;
end;
$function$;

comment on function public.request_trip_completion(uuid, text) is
  'المتعهد يطلب اعتماد إتمام رحلته. لا يحرّك مالاً — الحجز يبقى assigned حتى يُعتمد الطلب.';


-- (٤-ب) الإدارة تقرّر
create or replace function public.decide_trip_completion(
  p_request_id uuid,
  p_approve    boolean,
  p_note       text default null
)
returns table(request_id uuid, booking_id uuid, status text, decided_actor text)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_r    record;
  v_b    record;
  v_note text;
  v_now  timestamptz := now();
begin
  if not public.is_admin() then
    raise exception 'اعتماد إتمام الرحلة متاح للمشرف وحده' using hint = 'forbidden';
  end if;

  select r.* into v_r
  from public.trip_completion_requests r
  where r.id = p_request_id
  for update;
  if not found then
    raise exception 'طلب الإتمام غير موجود' using hint = 'request-not-found';
  end if;
  if v_r.status <> 'pending' then
    raise exception 'هذا الطلب مقرَّرٌ سلفاً («%»)', v_r.status using hint = 'already-decided';
  end if;

  select b.* into v_b from public.bookings b where b.id = v_r.booking_id for update;
  if v_b.status <> 'assigned' then
    raise exception 'حالة الحجز «%» تغيّرت — لم يعد الطلب قابلاً للاعتماد', v_b.status
      using hint = 'invalid-status';
  end if;

  v_note := nullif(btrim(coalesce(p_note, '')), '');
  -- الرفض يُعلَّل دائماً: المتعهد ينتظر مستحقه، و«رُفض» بلا سبب شكوى غداً
  if not coalesce(p_approve, false) and v_note is null then
    raise exception 'رفض طلب الإتمام يستلزم سبباً مكتوباً يقرؤه المتعهد'
      using hint = 'note-required';
  end if;

  update public.trip_completion_requests r
     set status        = case when coalesce(p_approve, false) then 'approved' else 'rejected' end,
         decided_at    = v_now,
         decided_by    = public.current_actor(),
         decided_actor = 'admin',
         decision_note = v_note
   where r.id = p_request_id;

  if coalesce(p_approve, false) then
    -- 🔴 هنا وحدها يتحرك المال: المُشغّلات الثلاثة تعمل على هذا السطر
    perform set_config(
      'tours.booking_note',
      'اكتمال معتمَدٌ من الإدارة على طلب المتعهد'
        || case when v_note is not null then ' — ' || v_note else '' end,
      true
    );
    update public.bookings b set status = 'completed' where b.id = v_r.booking_id;
  end if;

  perform public.queue_notification(
    case when coalesce(p_approve, false) then 'trip_completion_approved'
         else 'trip_completion_rejected' end,
    public.dispatch_trip_payload(v_r.booking_id, false) || jsonb_build_object(
      'requestId',       p_request_id,
      'subcontractorId', v_r.subcontractor_id,
      'decidedActor',    'admin',
      'decidedAt',       v_now,
      'note',            v_note
    ),
    'partner',
    v_r.subcontractor_id
  );

  request_id    := p_request_id;
  booking_id    := v_r.booking_id;
  status        := case when coalesce(p_approve, false) then 'approved' else 'rejected' end;
  decided_actor := 'admin';
  return next;
end;
$function$;

comment on function public.decide_trip_completion(uuid, boolean, text) is
  'قرار الإدارة على طلب الإتمام. الاعتماد هو اللحظة التي يتحرك فيها الدفتر والولاء معاً — والرفض يستلزم سبباً مكتوباً.';


-- (٤-ج) الاعتماد التلقائي — **فاعلٌ اسمه `auto`** لا فراغ
create or replace function public.settle_due_completions(p_limit integer default 100)
returns table(scanned integer, approved integer, skipped integer)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_row     record;
  v_b       record;
  v_scanned integer := 0;
  v_ok      integer := 0;
  v_skip    integer := 0;
  v_now     timestamptz := now();
begin
  if not public.dispatch_ops_allowed() then
    raise exception 'الاعتماد التلقائي متاح للمشرف أو لخادم الموقع فقط' using hint = 'forbidden';
  end if;

  -- دورتان متزامنتان: الثانية ترجع أصفاراً بهدوء بدل أن تعتمد مرتين
  if not pg_try_advisory_xact_lock(913019) then
    scanned := 0; approved := 0; skipped := 0;
    return next;
    return;
  end if;

  for v_row in
    select r.*
    from public.trip_completion_requests r
    where r.status = 'pending'
      and r.auto_approve_at <= v_now
    order by r.auto_approve_at
    limit greatest(coalesce(p_limit, 100), 1)
    for update of r
  loop
    v_scanned := v_scanned + 1;

    select b.* into v_b from public.bookings b where b.id = v_row.booking_id for update;

    -- الحجز تحرّك تحت الطلب (أُلغي · فشل · اعتُمد من مسارٍ آخر) ⇒ يُغلق الطلب
    -- ولا يُعتمد. و«تُخطّى» رقمٌ يُعرض لا صمتٌ.
    if not found or v_b.status <> 'assigned' then
      update public.trip_completion_requests r
         set status        = 'rejected',
             decided_at    = v_now,
             decided_actor = 'auto',
             decision_note = 'أُغلق تلقائياً — حالة الحجز صارت «'
                             || coalesce(v_b.status, 'محذوف') || '» قبل حلول الاعتماد'
       where r.id = v_row.id;
      v_skip := v_skip + 1;
      continue;
    end if;

    update public.trip_completion_requests r
       set status        = 'approved',
           decided_at    = v_now,
           decided_actor = 'auto',
           decision_note = 'اعتماد تلقائي — مضت ' || v_row.approve_hours::text
                           || ' ساعة على طلب المتعهد بلا قرارٍ من الإدارة'
     where r.id = v_row.id;

    perform set_config(
      'tours.booking_note',
      'اكتمال معتمَدٌ تلقائياً (النظام) — مضت ' || v_row.approve_hours::text
        || ' ساعة على طلب المتعهد بلا اعتراض',
      true
    );
    update public.bookings b set status = 'completed' where b.id = v_row.booking_id;

    perform public.queue_notification(
      'trip_completion_approved',
      public.dispatch_trip_payload(v_row.booking_id, false) || jsonb_build_object(
        'requestId',       v_row.id,
        'subcontractorId', v_row.subcontractor_id,
        'decidedActor',    'auto',
        'decidedAt',       v_now,
        'approveHours',    v_row.approve_hours
      ),
      'partner',
      v_row.subcontractor_id
    );

    v_ok := v_ok + 1;
  end loop;

  scanned  := v_scanned;
  approved := v_ok;
  skipped  := v_skip;
  return next;
end;
$function$;

comment on function public.settle_due_completions(integer) is
  'اعتماد طلبات الإتمام التي انقضت مهلتها. الفاعل يُكتب auto صراحةً في decided_actor — «اعتُمد تلقائياً» معلومةٌ تبقى بعد شهر.';


-- ----------------------------------------------------------------------------
-- (٥) الاعتذار بعد الإسناد — مخرجٌ لم يكن موجوداً
-- ----------------------------------------------------------------------------
--
-- 🔒 والانتقال `assigned ⇒ confirmed` يُفتح **ومعه حارسه في السطر نفسه**:
--    لا يُسمح به إلا وصفُّ الدورة قد أُخلي فعلاً. فمشرفٌ يقلب الحالة من شاشةٍ
--    بلا إخلاء الإسناد يقرأ رفضاً مفهوماً بدل أن يترك حجزاً «مؤكَّداً» ومتعهداً
--    ما زال مكتوباً في `dispatches`.

create or replace function public.booking_transition_allowed(p_from text, p_to text)
returns boolean
language sql
immutable
set search_path = ''
as $function$
  select exists (
    select 1
    from (values
      ('pending_payment', 'under_review'),
      ('pending_payment', 'cancelled'),
      ('under_review',    'confirmed'),
      ('under_review',    'pending_payment'),
      ('under_review',    'cancelled'),
      ('confirmed',       'assigned'),
      ('confirmed',       'completed'),
      ('confirmed',       'cancelled'),
      ('assigned',        'completed'),
      ('assigned',        'cancelled'),
      -- 0051: الرحلة تخفق ⇒ «فشل» لا «إلغاء» (§١-ب)
      ('assigned',        'failed'),
      ('completed',       'failed'),
      -- 0119: اعتذار المتعهد بعد القبول ⇒ الرحلة تعود إلى طابور البث.
      --       و`guard_booking_unassign` يشترط أن يكون صفُّ الدورة قد أُخلي،
      --       فلا يصير هذا الزوجُ باباً خلفياً لحجزٍ «مؤكَّد» بمتعهدٍ مكتوب.
      ('assigned',        'confirmed')
      -- 🔒 ولا زوج **من** `failed`: الحالة نهائية (§١-ج)
    ) as t(from_status, to_status)
    where t.from_status = p_from
      and t.to_status   = p_to
  );
$function$;

comment on function public.booking_transition_allowed(text, text) is
  'أزواج انتقال حالة الحجز. 0119: أُضيف assigned⇒confirmed لمسار الاعتذار، ومعه حارس guard_booking_unassign.';

create or replace function public.guard_booking_unassign()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if exists (
    select 1 from public.dispatches d
    where d.booking_id = new.id
      and d.assigned_subcontractor_id is not null
  ) then
    raise exception
      'لا يعود الحجز «%» إلى «مؤكَّد» وما زال مُسنَداً لمتعهد — أخلِ الإسناد أولاً',
      coalesce(old.reference, new.id::text)
      using hint = 'still-assigned';
  end if;
  return new;
end;
$function$;

drop trigger if exists bookings_guard_unassign on public.bookings;
create trigger bookings_guard_unassign
  before update on public.bookings
  for each row
  when (old.status = 'assigned' and new.status = 'confirmed')
  execute function public.guard_booking_unassign();

comment on function public.guard_booking_unassign() is
  'يمنع assigned⇒confirmed ما دام dispatches يحمل متعهداً مُسنَداً — فلا يصير الزوج الجديد باباً خلفياً.';


create table if not exists public.trip_withdrawals (
  id               uuid primary key default gen_random_uuid(),
  booking_id       uuid not null references public.bookings(id) on delete restrict,
  subcontractor_id uuid not null references public.subcontractors(id) on delete restrict,
  reason_id        uuid not null references public.failure_reasons(id) on delete restrict,
  -- ↓ اللقطات: ما قيل يومها لا ما يقوله الكتالوج اليوم (نفس انضباط 0051)
  reason_slug      text not null,
  reason_label     text not null,
  default_action   text not null,
  note             text,
  payout_snapshot  numeric,
  hours_to_pickup  numeric,
  routed           text not null,
  -- المبلغ الذي **كان** سيُخصم، والرايةُ تقول هل نُفِّذ فعلاً
  deduct_amount    numeric,
  deduct_applied   boolean not null default false,
  ledger_effect    text not null default 'none',
  withdrawn_at     timestamptz not null default now(),
  created_by       uuid,
  created_at       timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'trip_withdrawals_routed_chk') then
    alter table public.trip_withdrawals add constraint trip_withdrawals_routed_chk
      check (routed = any (array['rebroadcast', 'manual']));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'trip_withdrawals_deduct_chk') then
    alter table public.trip_withdrawals add constraint trip_withdrawals_deduct_chk
      check (deduct_amount is null or (deduct_amount >= 0 and deduct_amount < 1e9));
  end if;
  -- 🔒 رايةٌ لا تُرفع بلا مبلغ: «خُصم» بلا رقمٍ سطرٌ لا يُدقَّق
  if not exists (select 1 from pg_constraint where conname = 'trip_withdrawals_applied_chk') then
    alter table public.trip_withdrawals add constraint trip_withdrawals_applied_chk
      check (not deduct_applied or coalesce(deduct_amount, 0) > 0);
  end if;
end;
$$;

create index if not exists trip_withdrawals_booking_idx
  on public.trip_withdrawals (booking_id, withdrawn_at desc);
create index if not exists trip_withdrawals_partner_idx
  on public.trip_withdrawals (subcontractor_id, withdrawn_at desc);

comment on table public.trip_withdrawals is
  'اعتذار متعهد عن رحلة قَبِلها. سجلٌّ مُلحَق: ما قيل يومها، ووجهةُ الرحلة بعده، والمبلغ الذي كان سيُخصم وهل نُفِّذ.';

-- 🔒 مُلحَقٌ بفتحةٍ واحدة معلومة: لا حذف، ولا تعديل إلا **تنفيذُ الخصم المقترح**
--    مرةً واحدة (‏false ⇒ true). وكلُّ عمودٍ آخر مجمَّدٌ بالاسم لا بالنية.
create or replace function public.trip_withdrawals_freeze()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if tg_op = 'DELETE' then
    raise exception 'سجل الاعتذارات مُلحَقٌ لا يُحذف منه' using hint = 'append-only';
  end if;

  if old.deduct_applied then
    raise exception 'خصم هذا الاعتذار مطبَّقٌ سلفاً — التصحيح حركةٌ في الدفتر لا تعديلٌ هنا'
      using hint = 'already-applied';
  end if;

  if new.booking_id       is distinct from old.booking_id
     or new.subcontractor_id is distinct from old.subcontractor_id
     or new.reason_id        is distinct from old.reason_id
     or new.reason_slug      is distinct from old.reason_slug
     or new.reason_label     is distinct from old.reason_label
     or new.default_action   is distinct from old.default_action
     or new.note             is distinct from old.note
     or new.payout_snapshot  is distinct from old.payout_snapshot
     or new.hours_to_pickup  is distinct from old.hours_to_pickup
     or new.routed           is distinct from old.routed
     or new.withdrawn_at     is distinct from old.withdrawn_at
     or new.created_by       is distinct from old.created_by
     or new.created_at       is distinct from old.created_at
     or new.id               is distinct from old.id then
    raise exception 'لا يُعدَّل من سجل الاعتذار إلا تنفيذ الخصم المقترح'
      using hint = 'append-only';
  end if;

  return new;
end;
$function$;

drop trigger if exists trip_withdrawals_append_only on public.trip_withdrawals;
drop trigger if exists trip_withdrawals_freeze on public.trip_withdrawals;
create trigger trip_withdrawals_freeze
  before delete or update on public.trip_withdrawals
  for each row execute function public.trip_withdrawals_freeze();

drop trigger if exists audit_trip_withdrawals on public.trip_withdrawals;
create trigger audit_trip_withdrawals
  after insert or update or delete on public.trip_withdrawals
  for each row execute function public.log_audit('reason_slug');


create or replace function public.withdraw_from_trip(
  p_booking_id  uuid,
  p_reason_slug text,
  p_note        text default null
)
returns table(
  booking_id      uuid,
  routed          text,
  hours_to_pickup numeric,
  next_round      integer,
  offers          integer,
  deduct_amount   numeric,
  deduct_applied  boolean
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_sub    uuid;
  v_d      record;
  v_b      record;
  v_r      record;
  v_cfg    record;
  v_dcfg   record;
  v_pickup timestamptz;
  v_hours  numeric;
  v_routed text;
  v_amount numeric;
  v_made   integer := 0;
  v_next   integer;
  v_note   text;
  v_now    timestamptz := now();
begin
  v_sub := public.current_subcontractor_id();
  if v_sub is null then
    raise exception 'الاعتذار عن رحلة متاح لحساب متعهد فقط' using hint = 'forbidden';
  end if;

  -- ترتيب الأقفال نفسه المكتوب في `accept_offer`: dispatches ← trip_offers ← bookings
  select d.* into v_d from public.dispatches d where d.booking_id = p_booking_id for update;
  if not found or v_d.assigned_subcontractor_id is distinct from v_sub then
    raise exception 'هذه الرحلة ليست مُسنَدة إليك' using hint = 'forbidden';
  end if;

  select b.* into v_b from public.bookings b where b.id = p_booking_id for update;
  if not found then
    raise exception 'الحجز غير موجود' using hint = 'booking-not-found';
  end if;
  if v_b.status <> 'assigned' then
    raise exception 'حالة هذه الرحلة «%» لا تقبل الاعتذار', v_b.status
      using hint = 'invalid-status';
  end if;
  if exists (
    select 1 from public.trip_completion_requests r
    where r.booking_id = p_booking_id and r.status = 'pending'
  ) then
    raise exception 'لك طلب إتمامٍ قائم على هذه الرحلة — لا يُعتذر عنها وهو معلّق'
      using hint = 'completion-pending';
  end if;

  -- السبب: من الكتالوج، مفعَّلاً، **بنطاق الاعتذار**، ومُبادِرُه يسمح للمتعهد
  select r.* into v_r
  from public.failure_reasons r
  where r.slug = lower(btrim(coalesce(p_reason_slug, '')));
  if not found then
    raise exception 'سبب الاعتذار «%» غير موجود', coalesce(p_reason_slug, '')
      using hint = 'reason-not-found';
  end if;
  if not v_r.active then
    raise exception 'سبب الاعتذار «%» معطَّل — اختر سبباً مفعَّلاً', v_r.label
      using hint = 'reason-inactive';
  end if;
  if v_r.applies_to not in ('apology', 'both') then
    raise exception 'السبب «%» ليس من أسباب الاعتذار', v_r.label
      using hint = 'reason-out-of-scope';
  end if;
  if v_r.initiator = 'platform' then
    raise exception 'السبب «%» تختاره الإدارة حين تسحب الإسناد، لا المتعهد', v_r.label
      using hint = 'reason-out-of-scope';
  end if;

  v_note := nullif(btrim(coalesce(p_note, '')), '');
  select * into v_cfg  from public.trip_closure_config();
  select * into v_dcfg from public.dispatch_config();

  -- ── الوجهة تتفرّع بالوقت المتبقي (قرار المالك) ────────────────────────────
  v_pickup := nullif(btrim(coalesce(v_b.trip ->> 'pickupAt', '')), '')::timestamptz;
  v_hours  := case
                when v_pickup is null then null
                else round(extract(epoch from (v_pickup - v_now)) / 3600.0, 2)
              end;
  -- بلا موعدٍ مقروء: **يدويٌّ بتنبيه**. الاتجاه الآمن أن يراها إنسان، لا أن
  -- تُبثّ رحلةٌ قد يكون موعدها بعد ساعة.
  v_routed := case
                when v_hours is null then 'manual'
                when v_hours >= v_cfg.apology_manual_hours then 'rebroadcast'
                else 'manual'
              end;

  -- ── الخصم: **اقتراحٌ يُحسب ويُسقَّف ولا يُنفَّذ من هنا** ──────────────────
  --
  -- 🔴 وسببٌ بنيويّ لا احتياطي: `record_partner_adjustment` تشترط
  --    `finance_admin_allowed()`، والمنادي هنا **متعهد**. فلو كُتب الخصمُ في هذا
  --    المسار لَرمى الحارسُ ورجعت المعاملةُ كلها (‏**D-48**) — أي أن اعتذاراً
  --    مشروعاً يصير مستحيلاً **في اليوم الذي يُشعل فيه المالك المفتاح**، لا قبله.
  --    عطبٌ نائمٌ ينفجر عند التشغيل، وهو أسوأ أنواعه.
  --
  --    ⇒ الاعتذار **يقترح** المبلغ مسقوفاً بمستحق الرحلة، والتنفيذ حركةٌ إدارية
  --      مسمّاة: `apply_withdrawal_deduction` — بحارسها المالي، وبالمفتاح الذي
  --      لم يأذن المالك بإشعاله بعد.
  v_amount := case
                when v_r.default_action = 'deduct'
                  then least(
                         round(coalesce(v_r.default_deduct_amount, 0), 2),
                         round(coalesce(v_d.assigned_payout, 0), 2)
                       )
                else null
              end;
  if coalesce(v_amount, 0) <= 0 then
    v_amount := null;
  end if;

  -- ── (١) عرضُه المقبول يصير `rejected` ⇒ 🔴 يُستثنى من الموجة التالية ──────
  --     الآلية مبنيّةٌ في `dispatch_broadcast` ولا تُستنسخ هنا، وفهرس
  --     `trip_offers_one_accepted_key` يتحرر بالحركة نفسها.
  update public.trip_offers o
     set status       = 'rejected',
         responded_at = v_now,
         reason       = left('اعتذار بعد القبول — ' || v_r.label
                             || coalesce(' — ' || v_note, ''), 1000)
   where o.booking_id = p_booking_id
     and o.subcontractor_id = v_sub
     and o.status = 'accepted';

  -- ── (٢) إخلاء صفّ الدورة — والمُشغّل `clear_crew_on_reassign` يمسح الطاقم ──
  update public.dispatches d
     set status                    = 'queued',
         assigned_subcontractor_id = null,
         assigned_at               = null,
         assigned_payout           = null,
         manual_assign             = false
   where d.booking_id = p_booking_id;

  -- ── (٣) الحجز يعود مؤكَّداً — بعد الإخلاء كي يمرّ `guard_booking_unassign` ──
  perform set_config(
    'tours.booking_note',
    'اعتذار المتعهد بعد القبول — ' || v_r.label || coalesce(' — ' || v_note, ''),
    true
  );
  update public.bookings b set status = 'confirmed' where b.id = p_booking_id;

  -- ── (٤) الوجهة ────────────────────────────────────────────────────────────
  v_next := coalesce(v_d.round, 0) + 1;
  if v_routed = 'rebroadcast' and v_next <= v_dcfg.max_rounds then
    -- العروض المعلّقة تُسحب أولاً: مهلتان مفتوحتان = سعران مفتوحان
    update public.trip_offers o
       set status = 'expired', responded_at = v_now
     where o.booking_id = p_booking_id and o.status = 'pending';
    v_made := public.dispatch_broadcast(p_booking_id, v_next);
    -- بثٌّ لم يجد أحداً: لا يُترك الحجز في «بثّ» بلا عرضٍ واحد
    if v_made = 0 then
      v_routed := 'manual';
      update public.dispatches d set status = 'manual' where d.booking_id = p_booking_id;
    end if;
  else
    v_routed := 'manual';
    v_next   := coalesce(v_d.round, 0);
    update public.dispatches d set status = 'manual' where d.booking_id = p_booking_id;
  end if;

  -- ── (٥) السجل ثم التنبيه ─────────────────────────────────────────────────
  insert into public.trip_withdrawals (
    booking_id, subcontractor_id, reason_id, reason_slug, reason_label,
    default_action, note, payout_snapshot, hours_to_pickup, routed,
    deduct_amount, deduct_applied, ledger_effect, withdrawn_at, created_by
  )
  values (
    p_booking_id, v_sub, v_r.id, v_r.slug, v_r.label,
    v_r.default_action, v_note, v_d.assigned_payout, v_hours, v_routed,
    v_amount, false, 'none', v_now, public.current_actor()
  );

  perform public.queue_notification(
    case when v_routed = 'manual' then 'trip_withdrawn_manual' else 'trip_withdrawn_rebroadcast' end,
    public.dispatch_trip_payload(p_booking_id, false) || jsonb_build_object(
      'subcontractorId', v_sub,
      'reasonSlug',      v_r.slug,
      'reasonLabel',     v_r.label,
      'note',            v_note,
      'hoursToPickup',   v_hours,
      'thresholdHours',  v_cfg.apology_manual_hours,
      'routed',          v_routed,
      'round',           v_next,
      'offers',          v_made,
      'payout',          v_d.assigned_payout,
      'deductProposed',  v_amount,
      'deductEnabled',   v_cfg.apology_deduction_enabled,
      'withdrawnAt',     v_now
    )
  );

  booking_id      := p_booking_id;
  routed          := v_routed;
  hours_to_pickup := v_hours;
  next_round      := v_next;
  offers          := v_made;
  deduct_amount   := v_amount;
  deduct_applied  := false;
  return next;
end;
$function$;

comment on function public.withdraw_from_trip(uuid, text, text) is
  'اعتذار المتعهد عن رحلة قَبِلها: يُستثنى من الموجة التالية بجعل عرضه rejected، ويتفرّع المسار بالوقت المتبقي (عتبة اللوحة). والخصم محسوبٌ مسقوفٌ وخاملٌ حتى يُشعله المالك.';


-- تنفيذُ الخصم المقترح — **حركةٌ إدارية بحارسين مستقلين** (النمط ٧ في `LESSONS`):
--   (١) `finance_admin_allowed()` — نفس حارس كل حركة مالية في هذا المستودع.
--   (٢) `apology_deduction_enabled` — مفتاحُ اللوحة، **مطفأٌ بالبذرة**: المالك
--       لم يؤكّد الأساسَ التعاقدي بعد. فالآلة مبنيّةٌ كاملةً وخاملةٌ بقرار.
-- والسقف يُعاد فحصه هنا ولا يُصدَّق من الصفّ: الصفُّ اقتراحٌ كُتب يومها، والحدّ
-- مستحقُّ الرحلة نفسه.
create or replace function public.apply_withdrawal_deduction(
  p_withdrawal_id uuid,
  p_amount        numeric,
  p_note          text
)
returns numeric
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_w    record;
  v_cfg  record;
  v_amt  numeric;
  v_cap  numeric;
  v_note text;
  v_ref  text;
begin
  if not public.finance_admin_allowed() then
    raise exception 'تنفيذ الخصم متاح للإدارة وحدها' using hint = 'forbidden';
  end if;

  select * into v_cfg from public.trip_closure_config();
  if not v_cfg.apology_deduction_enabled then
    raise exception
      'الخصم على الاعتذار مطفأٌ من اللوحة — يُشعَل بقرار المالك بعد تثبيت أساسه التعاقدي'
      using hint = 'deduction-disabled';
  end if;

  select w.* into v_w from public.trip_withdrawals w where w.id = p_withdrawal_id for update;
  if not found then
    raise exception 'سجل الاعتذار غير موجود' using hint = 'not-found';
  end if;
  if v_w.deduct_applied then
    raise exception 'خصم هذا الاعتذار مطبَّقٌ سلفاً' using hint = 'already-applied';
  end if;

  v_note := nullif(btrim(coalesce(p_note, '')), '');
  if v_note is null then
    raise exception 'الخصم يستلزم سبباً مكتوباً' using hint = 'note-required';
  end if;

  v_amt := round(coalesce(p_amount, v_w.deduct_amount, 0), 2);
  if v_amt <= 0 then
    raise exception 'مبلغ الخصم يجب أن يكون موجباً' using hint = 'invalid-input';
  end if;

  v_cap := round(coalesce(v_w.payout_snapshot, 0), 2);
  if v_cap <= 0 then
    raise exception 'لا مستحق مسجَّل لهذه الرحلة — فلا سقف يُخصم في حدوده'
      using hint = 'deduct-no-cap';
  end if;
  if v_amt > v_cap then
    raise exception
      'الخصم (%) يتجاوز مستحق هذه الرحلة (%) — والسقف قرار مالك', v_amt, v_cap
      using hint = 'deduct-over-cap';
  end if;

  select b.reference into v_ref from public.bookings b where b.id = v_w.booking_id;

  perform public.record_partner_adjustment(
    v_w.subcontractor_id, 'collected', v_amt, now(),
    'خصمٌ على اعتذارٍ بعد الإسناد — ' || v_w.reason_label
      || ' — ' || coalesce(v_ref, '') || ' — ' || v_note
  );

  update public.trip_withdrawals w
     set deduct_amount  = v_amt,
         deduct_applied = true,
         ledger_effect  = 'deduct'
   where w.id = p_withdrawal_id;

  return v_amt;
end;
$function$;

comment on function public.apply_withdrawal_deduction(uuid, numeric, text) is
  'تنفيذ الخصم المقترح على اعتذار — بحارسين: صلاحية مالية ومفتاح لوحة مطفأ بالبذرة. والسقف يُعاد فحصه من مستحق الرحلة لا من الصف.';


-- ----------------------------------------------------------------------------
-- (٦) مسار التظلّم — قرار المالك: «خصمٌ ومعه بابٌ يُطرَق»
-- ----------------------------------------------------------------------------

create table if not exists public.partner_grievances (
  id               uuid primary key default gen_random_uuid(),
  subcontractor_id uuid not null references public.subcontractors(id) on delete restrict,
  booking_id       uuid references public.bookings(id) on delete restrict,
  kind             text not null,
  body             text not null,
  status           text not null default 'open',
  filed_at         timestamptz not null default now(),
  resolved_at      timestamptz,
  resolved_by      uuid,
  resolution_note  text,
  created_at       timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'partner_grievances_kind_chk') then
    alter table public.partner_grievances add constraint partner_grievances_kind_chk
      check (kind = any (array['failure', 'apology', 'settlement']));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'partner_grievances_status_chk') then
    alter table public.partner_grievances add constraint partner_grievances_status_chk
      check (status = any (array['open', 'accepted', 'rejected']));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'partner_grievances_body_chk') then
    alter table public.partner_grievances add constraint partner_grievances_body_chk
      check (length(btrim(body)) between 10 and 2000);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'partner_grievances_resolved_chk') then
    alter table public.partner_grievances add constraint partner_grievances_resolved_chk
      check (
        (status = 'open' and resolved_at is null)
        or (status <> 'open' and resolved_at is not null
            and coalesce(btrim(resolution_note), '') <> '')
      );
  end if;
end;
$$;

-- تظلّمٌ مفتوحٌ واحد لكل رحلة لكل متعهد — فلا يُغرق الطابور بتكرارٍ واحد
create unique index if not exists partner_grievances_one_open_key
  on public.partner_grievances (subcontractor_id, booking_id, kind) where status = 'open';
create index if not exists partner_grievances_status_idx
  on public.partner_grievances (status, filed_at desc);

comment on table public.partner_grievances is
  'تظلّم المتعهد على خصمٍ أو تصنيفٍ أو تسوية. الخصم بلا بابٍ يُطرَق عقوبةٌ بلا مراجعة — وهذا هو الباب.';

drop trigger if exists audit_partner_grievances on public.partner_grievances;
create trigger audit_partner_grievances
  after insert or update or delete on public.partner_grievances
  for each row execute function public.log_audit('status');


create or replace function public.file_grievance(
  p_booking_id uuid,
  p_kind       text,
  p_body       text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_sub  uuid;
  v_kind text;
  v_body text;
  v_id   uuid;
begin
  v_sub := public.current_subcontractor_id();
  if v_sub is null then
    raise exception 'التظلّم متاح لحساب متعهد فقط' using hint = 'forbidden';
  end if;

  v_kind := lower(nullif(btrim(coalesce(p_kind, '')), ''));
  if v_kind not in ('failure', 'apology', 'settlement') then
    raise exception 'نوع التظلّم غير معروف' using hint = 'invalid-input';
  end if;

  v_body := nullif(btrim(coalesce(p_body, '')), '');
  if v_body is null or length(v_body) < 10 then
    raise exception 'اكتب شرحاً لا يقلّ عن عشرة أحرف — التظلّم المبهم لا يُبحث'
      using hint = 'body-too-short';
  end if;
  if length(v_body) > 2000 then
    v_body := left(v_body, 2000);
  end if;

  -- 🔒 لا يتظلّم على رحلةٍ ليست له: الشرط على `dispatches` أو على سجلٍّ يخصّه
  if p_booking_id is not null and not exists (
    select 1 from public.dispatches d
     where d.booking_id = p_booking_id and d.assigned_subcontractor_id = v_sub
    union all
    select 1 from public.trip_withdrawals w
     where w.booking_id = p_booking_id and w.subcontractor_id = v_sub
    union all
    select 1 from public.booking_failures f
     where f.booking_id = p_booking_id and f.subcontractor_id = v_sub
  ) then
    raise exception 'هذه الرحلة ليست ضمن سجلّك' using hint = 'forbidden';
  end if;

  begin
    insert into public.partner_grievances (subcontractor_id, booking_id, kind, body)
    values (v_sub, p_booking_id, v_kind, v_body)
    returning id into v_id;
  exception
    when unique_violation then
      raise exception 'لك تظلّمٌ مفتوحٌ على هذه الرحلة بالفعل' using hint = 'already-filed';
  end;

  perform public.queue_notification(
    'partner_grievance_filed',
    jsonb_build_object(
      'grievanceId',     v_id,
      'subcontractorId', v_sub,
      'bookingId',       p_booking_id,
      'kind',            v_kind,
      'body',            v_body
    )
  );

  return v_id;
end;
$function$;

create or replace function public.resolve_grievance(
  p_id     uuid,
  p_accept boolean,
  p_note   text
)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_g    record;
  v_note text;
  v_new  text;
begin
  if not public.is_admin() then
    raise exception 'البتّ في التظلّم متاح للمشرف وحده' using hint = 'forbidden';
  end if;

  v_note := nullif(btrim(coalesce(p_note, '')), '');
  if v_note is null then
    raise exception 'قرار التظلّم يستلزم سبباً مكتوباً يقرؤه المتعهد'
      using hint = 'note-required';
  end if;

  select g.* into v_g from public.partner_grievances g where g.id = p_id for update;
  if not found then
    raise exception 'التظلّم غير موجود' using hint = 'not-found';
  end if;
  if v_g.status <> 'open' then
    raise exception 'هذا التظلّم مقرَّرٌ سلفاً («%»)', v_g.status using hint = 'already-decided';
  end if;

  v_new := case when coalesce(p_accept, false) then 'accepted' else 'rejected' end;

  update public.partner_grievances g
     set status          = v_new,
         resolved_at     = now(),
         resolved_by     = public.current_actor(),
         resolution_note = v_note
   where g.id = p_id;

  -- ⚠ **ولا يردّ القرارُ مالاً من تلقائه**: قبولُ التظلّم قرارٌ إداري، وردُّ
  --   الخصم حركةٌ مسمّاة في الدفتر (`record_partner_adjustment` بدور `earned`)
  --   يُجريها المشرف بيده. أثرٌ ماليٌّ جانبيٌّ صامت آخرُ ما يحتاجه دفترٌ يُدقَّق.
  perform public.queue_notification(
    'partner_grievance_resolved',
    jsonb_build_object(
      'grievanceId',     p_id,
      'subcontractorId', v_g.subcontractor_id,
      'bookingId',       v_g.booking_id,
      'kind',            v_g.kind,
      'status',          v_new,
      'note',            v_note
    ),
    'partner',
    v_g.subcontractor_id
  );

  return v_new;
end;
$function$;

comment on function public.resolve_grievance(uuid, boolean, text) is
  'بتُّ المشرف في تظلّم. لا يحرّك مالاً من تلقائه — ردّ الخصم حركةٌ مسمّاة يجريها المشرف، فلا أثر مالي صامت.';


-- ----------------------------------------------------------------------------
-- (٧) الولاء — المعدّل، ثم الصلاحية
-- ----------------------------------------------------------------------------

-- (٧-أ) مهلة الصلاحية إعدادٌ لا ثابت، و`0` تعني «لا انتهاء» (السلوك القديم)
alter table public.loyalty_settings add column if not exists expire_months integer;
alter table public.loyalty_settings add column if not exists expiry_ran_at timestamptz;
update public.loyalty_settings set expire_months = 3 where expire_months is null;
alter table public.loyalty_settings alter column expire_months set default 3;
alter table public.loyalty_settings alter column expire_months set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'loyalty_settings_expire_months_chk') then
    alter table public.loyalty_settings add constraint loyalty_settings_expire_months_chk
      check (expire_months between 0 and 120);
  end if;
end;
$$;

comment on column public.loyalty_settings.expire_months is
  'أشهر صلاحية النقطة **من تاريخ كسبها** — قرار المالك: ٣. والصفر يعني بلا انتهاء (السلوك السابق).';

-- (٧-ب) الاتجاه الخامس: `expire` — **قيدٌ جديد لا حذف**
alter table public.loyalty_entries drop constraint if exists loyalty_entries_direction_check;
alter table public.loyalty_entries
  add constraint loyalty_entries_direction_check
  check (direction = any (array['earn', 'redeem', 'reverse', 'adjust', 'expire']));

alter table public.loyalty_entries drop constraint if exists loyalty_entries_sign_chk;
alter table public.loyalty_entries
  add constraint loyalty_entries_sign_chk
  check (
    (direction = 'earn'   and points > 0)
    or (direction = 'redeem' and points < 0)
    or (direction = 'expire' and points < 0)
    or (direction = any (array['reverse', 'adjust']))
  );

-- (٧-ج) 🔒 دفعاتُ الكسب بترتيبها، والمُنفَق موزَّعٌ عليها بالأقدم فالأقدم
--
-- لماذا اشتقاقٌ ولا عمود «متبقٍّ»؟ لأن عموداً كهذا مصدرٌ ثانٍ للرقم ينحرف عن
-- الدفتر (النمط ٨ في `LESSONS`). فالمصدر يبقى **واحداً**: قيود الدفتر.
--
--   دفعة = قيدٌ موجب غير معكوس (`earn` أو `adjust` موجب)
--   المُنفَق = مجموع الدفعات − رصيد الدفتر  ⇐ كلٌّ من مصدرٍ واحد
--   المتبقي في الدفعة = clamp(التراكمي − المُنفَق ، ٠ ، قيمة الدفعة)
create or replace function public.loyalty_lots(p_phone text)
returns table(
  entry_id  uuid,
  earned_at timestamptz,
  points    integer,
  remaining integer,
  expires_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $function$
  with cfg as (select l.expire_months from public.loyalty_settings l limit 1),
  lots as (
    select e.id, e.occurred_at, e.points
    from public.loyalty_entries e
    where e.phone_norm = p_phone
      and e.points > 0
      and e.direction in ('earn', 'adjust')
      and not exists (
        select 1 from public.loyalty_entries x where x.reverses_entry_id = e.id
      )
  ),
  bal as (
    select coalesce(sum(e.points), 0)::integer as b
    from public.loyalty_entries e
    where e.phone_norm = p_phone
  ),
  tot as (select coalesce(sum(l.points), 0)::integer as t from lots l),
  spent as (
    select greatest((select t from tot) - (select b from bal), 0)::integer as s
  ),
  run as (
    select l.id, l.occurred_at, l.points,
           sum(l.points) over (
             order by l.occurred_at, l.id
             rows between unbounded preceding and current row
           )::integer as cum
    from lots l
  )
  select
    r.id,
    r.occurred_at,
    r.points,
    greatest(0, least(r.points, r.cum - (select s from spent)))::integer,
    case
      when coalesce((select expire_months from cfg), 0) <= 0 then null
      else r.occurred_at + make_interval(months => (select expire_months from cfg))
    end
  from run r
  order by r.occurred_at, r.id;
$function$;

comment on function public.loyalty_lots(text) is
  'دفعات كسب رقمٍ واحد بترتيبها ومتبقّيها بعد توزيع المُنفَق بالأقدم فالأقدم (FIFO). اشتقاقٌ من الدفتر وحده — لا عمود رصيدٍ ثانٍ ينحرف.';

-- (٧-د) المهمة: قيدُ انتهاءٍ لكل رقمٍ له متبقٍّ منتهٍ — **آمنةُ الإعادة بنيوياً**
create or replace function public.expire_loyalty_points(p_limit integer default 500)
returns table(accounts integer, points_expired integer)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_cfg   record;
  v_row   record;
  v_n     integer := 0;
  v_sum   integer := 0;
  v_pts   integer;
begin
  if not public.finance_admin_allowed() then
    raise exception 'تشغيل انتهاء صلاحية النقاط متاح للإدارة أو لخادم الموقع' using hint = 'forbidden';
  end if;

  select * into v_cfg from public.loyalty_config();
  select l.expire_months into v_pts from public.loyalty_settings l limit 1;

  -- مطفأٌ أو بلا مهلة ⇒ صفران بهدوء، لا استثناء: مهمةٌ مجدولة لا تُحمِّر لأن
  -- المالك أطفأ مقبضاً
  if not v_cfg.enabled or coalesce(v_pts, 0) <= 0 then
    accounts := 0; points_expired := 0;
    return next;
    return;
  end if;

  if not pg_try_advisory_xact_lock(913020) then
    accounts := 0; points_expired := 0;
    return next;
    return;
  end if;

  for v_row in
    select a.phone_norm,
           (select coalesce(sum(l.remaining), 0)::integer
              from public.loyalty_lots(a.phone_norm) l
             where l.expires_at is not null and l.expires_at <= now()) as due
    from public.loyalty_accounts a
    where a.points_balance > 0
    order by a.phone_norm
    limit greatest(coalesce(p_limit, 500), 1)
  loop
    if coalesce(v_row.due, 0) <= 0 then
      continue;
    end if;

    insert into public.loyalty_entries (
      phone_norm, direction, points, booking_id, note, created_by
    )
    values (
      v_row.phone_norm, 'expire', -v_row.due, null,
      'انتهاء صلاحية ' || v_row.due::text || ' نقطة — مضى عليها '
        || v_pts::text || ' شهراً من تاريخ كسبها',
      null
    );

    v_n   := v_n + 1;
    v_sum := v_sum + v_row.due;
  end loop;

  update public.loyalty_settings set expiry_ran_at = now() where id;

  accounts       := v_n;
  points_expired := v_sum;
  return next;
end;
$function$;

comment on function public.expire_loyalty_points(integer) is
  'قيد انتهاء صلاحية لكل رقم له متبقٍّ منتهٍ. آمنة الإعادة بنيوياً: القيد يخفض الرصيد فتُحسب الدفعات نفسها مستهلَكةً في النداء التالي.';

-- (٧-هـ) ما يراه العميل: **متى تنتهي نقاطه** — لا شيء يختفي بلا إنذار
create or replace function public.my_loyalty_expiry(p_limit integer default 24)
returns table(points integer, expires_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $function$
  select l.remaining, l.expires_at
  from (
    select distinct b.phone_norm
    from public.customer_bookings cb
    join public.bookings b on b.id = cb.booking_id
    where (select auth.uid()) is not null
      and cb.profile_id = (select auth.uid())
      and cb.link_source = 'reference'
      and b.phone_norm is not null
  ) p
  cross join lateral public.loyalty_lots(p.phone_norm) l
  where l.remaining > 0
    and l.expires_at is not null
  order by l.expires_at asc
  limit least(greatest(coalesce(p_limit, 24), 1), 200);
$function$;

comment on function public.my_loyalty_expiry(integer) is
  'دفعات العميل الحيّة وتواريخ انتهائها — نقاطٌ تختفي بلا إنذار تكلّف ثقةً أغلى مما توفّر.';

-- (٧-و) وللمالك: التزامٌ ومنتهٍ قريباً، **بلا أي بيانٍ شخصي**
create or replace function public.loyalty_expiry_summary()
returns table(
  accounts_with_points integer,
  points_live          integer,
  points_due_now       integer,
  points_due_30d       integer,
  next_expiry_at       timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  -- 🔒 حارسٌ **داخل** الدالة لا في المنحة وحدها: هي `definer` تتخطى RLS بحكم
  --    التعريف، والمنحة لـ`authenticated` تعني كلَّ متعهدٍ مسجَّل (‏**D-20**).
  if not public.is_admin() then
    raise exception 'ملخّص التزام النقاط متاح للمشرف وحده' using hint = 'forbidden';
  end if;

  return query
  with lots as (
    select l.*
    from public.loyalty_accounts a
    cross join lateral public.loyalty_lots(a.phone_norm) l
    where a.points_balance > 0 and l.remaining > 0
  )
  select
    (select count(distinct a.phone_norm)::integer
       from public.loyalty_accounts a where a.points_balance > 0),
    coalesce(sum(lots.remaining), 0)::integer,
    coalesce(sum(lots.remaining) filter (
      where lots.expires_at is not null and lots.expires_at <= now()), 0)::integer,
    coalesce(sum(lots.remaining) filter (
      where lots.expires_at is not null
        and lots.expires_at > now()
        and lots.expires_at <= now() + interval '30 days'), 0)::integer,
    min(lots.expires_at) filter (where lots.expires_at > now())
  from lots;
end;
$function$;

comment on function public.loyalty_expiry_summary() is
  'ملخّص التزام النقاط وما يقترب انتهاؤه — أرقامٌ مجمَّعة بلا هاتفٍ ولا هوية.';

-- (٧-ز) 🔴 المعدّل — **بعد** التحقق من أن مُشغّل التدقيق قائم (‏0106)
--
-- والتغيير **مشروطٌ بالقيم القديمة**: من عدّل المعدّل بعد اليوم لا يُدهس تعديله
-- بإعادة تنفيذ الهجرة. وهذا هو الفارق بين هجرةٍ تُطبَّق مرةً وهجرةٍ تُعاد.
do $$
declare
  v_has_audit boolean;
begin
  select exists (
    select 1 from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'loyalty_settings'
      and t.tgname = 'audit_loyalty_settings' and not t.tgisinternal
  ) into v_has_audit;

  if not v_has_audit then
    raise exception
      'مُشغّل تدقيق loyalty_settings غير موجود — لا يُغيَّر المعدّل قبل أن يُسجَّل تغييرُه (هجرة 0106)';
  end if;

  update public.loyalty_settings
     set points_per_currency = 1,
         currency_per_point  = 0.02
   where points_per_currency = 1.25
     and currency_per_point  = 0.05;
end;
$$;


-- ----------------------------------------------------------------------------
-- (٨) دورة البث تحمل المهمتين — لا مسارَ ثالثاً ولا سرَّ ثانياً
-- ----------------------------------------------------------------------------
--
-- الجسم منقولٌ من الكتالوج الحيّ (‏D-58) **بلا تغيير توقيع**، وزِيدت عليه كتلتان
-- محصورتان في أوله. وكلٌّ منهما `begin … exception` قائمةٌ بذاتها: فشلُها يرجع
-- وحده — دورةُ البث تمضي — **ويُبرق تنبيهٌ للتشغيل**، فلا صمتَ على عطلٍ مالي.

create or replace function public.dispatch_tick()
returns table(
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
  v_err       text;
  v_last      timestamptz;
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

  -- 0119 (أ) اعتماد طلبات الإتمام التي انقضت مهلتها
  begin
    perform public.settle_due_completions(100);
  exception when others then
    get stacked diagnostics v_err = message_text;
    perform public.queue_notification(
      'ops_job_failed',
      jsonb_build_object('job', 'settle_due_completions', 'error', v_err)
    );
  end;

  -- 0119 (ب) انتهاء صلاحية النقاط — مرةً كل ساعة لا كل خمس دقائق
  begin
    select l.expiry_ran_at into v_last from public.loyalty_settings l limit 1;
    if v_last is null or v_last < now() - interval '1 hour' then
      perform public.expire_loyalty_points(500);
    end if;
  exception when others then
    get stacked diagnostics v_err = message_text;
    perform public.queue_notification(
      'ops_job_failed',
      jsonb_build_object('job', 'expire_loyalty_points', 'error', v_err)
    );
  end;

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
  'دورة البث. 0119: تحمل معها اعتماد طلبات الإتمام المستحقة وانتهاء صلاحية النقاط — كلٌّ في كتلةٍ محصورة تُبرق تنبيهاً عند فشلها ولا تُسقط الدورة.';


-- ----------------------------------------------------------------------------
-- (٩) `portal_trips()` — حالةُ طلب الإتمام تعبر إلى شاشة المتعهد
-- ----------------------------------------------------------------------------
--
-- 🔒 وما لا يعبر، بقصد: مبلغُ الخصم وسببُ الفشل و`booking_failures` كلها —
--    كما في `0051` حرفاً بحرف. الجديد ثلاثةُ حقولٍ عن **طلبه هو**.

drop function if exists public.portal_trips();
create function public.portal_trips()
returns table(
  offer_id uuid, booking_id uuid, reference text, origin_label text, dest_label text,
  distance_km numeric, passengers integer, round_trip boolean, waiting_hours numeric,
  class_title text, pickup_at timestamptz, payout numeric, currency text,
  expires_at timestamptz, notes text, customer_name text, customer_phone text,
  customer_whatsapp text, status text, assigned_at timestamptz,
  crew_vehicle_id uuid, crew_driver_id uuid, crew_by_admin boolean, crew_at timestamptz,
  flight_number text,
  -- 0119 ↓
  completion_status text, completion_requested_at timestamptz,
  completion_auto_at timestamptz, completion_note text
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    o.id,
    b.id,
    public.partner_trip_code(b.id),
    b.trip ->> 'originLabel',
    b.trip ->> 'destLabel',
    public.jsonb_number(b.trip, 'distanceKm', 0),
    coalesce(public.jsonb_number(b.trip, 'passengers', 1), 1)::integer,
    coalesce(b.trip ->> 'roundTrip', 'false') in ('true', 't', '1'),
    coalesce(public.jsonb_number(b.trip, 'waitingHours', 0), 0),
    b.class_title,
    nullif(btrim(coalesce(b.trip ->> 'pickupAt', '')), '')::timestamptz,
    d.assigned_payout,
    b.currency,
    d.assigned_at,
    b.trip ->> 'notes',
    b.customer_name,
    b.customer_phone,
    b.customer_whatsapp,
    b.status,
    d.assigned_at,
    d.assigned_vehicle_id,
    d.assigned_driver_id,
    d.crew_by_admin,
    d.crew_at,
    nullif(btrim(coalesce(b.trip ->> 'flightNumber', '')), ''),
    -- طلبُ الإتمام الأحدث لهذه الرحلة — وهو طلبُ هذا المتعهد بحكم شرط الإسناد
    r.status, r.requested_at, r.auto_approve_at, r.decision_note
  from public.dispatches d
  join public.bookings b on b.id = d.booking_id
  left join public.trip_offers o
    on o.booking_id       = d.booking_id
   and o.subcontractor_id = d.assigned_subcontractor_id
   and o.status           = 'accepted'
  left join lateral (
    select cr.status, cr.requested_at, cr.auto_approve_at, cr.decision_note
    from public.trip_completion_requests cr
    where cr.booking_id = d.booking_id
      and cr.subcontractor_id = d.assigned_subcontractor_id
    order by cr.requested_at desc
    limit 1
  ) r on true
  where d.assigned_subcontractor_id = public.current_subcontractor_id()
    and public.current_subcontractor_id() is not null
    and d.status  = 'assigned'
    and b.status in ('assigned', 'completed', 'cancelled', 'failed')
  order by nullif(btrim(coalesce(b.trip ->> 'pickupAt', '')), '')::timestamptz asc nulls last,
           d.assigned_at desc;
$function$;

comment on function public.portal_trips() is
  'رحلات المتعهد المُسنَدة. 0119: ومعها حالة طلب الإتمام ولحظة اعتماده التلقائي — ولا شيء من booking_failures يعبر.';


-- تظلّماتُ المتعهد كما يراها هو — بلا ملاحظات الإدارة الداخلية عن غيره
create or replace function public.portal_grievances(p_limit integer default 20)
returns table(
  id uuid, booking_reference text, kind text, body text, status text,
  filed_at timestamptz, resolved_at timestamptz, resolution_note text
)
language sql
stable
security definer
set search_path = ''
as $function$
  select g.id, public.partner_trip_code(g.booking_id), g.kind, g.body, g.status,
         g.filed_at, g.resolved_at, g.resolution_note
  from public.partner_grievances g
  where g.subcontractor_id = public.current_subcontractor_id()
    and public.current_subcontractor_id() is not null
  order by g.filed_at desc
  limit least(greatest(coalesce(p_limit, 20), 1), 100);
$function$;


-- ----------------------------------------------------------------------------
-- (١٠) المنح — `revoke` أولاً ثم `grant` الأضيق (اتفاقية ٦ · القاعدة ١٦)
-- ----------------------------------------------------------------------------
--
-- 🔴 و`T` (‏TRUNCATE) هو الحرف الذي يُقرأ أولاً: RLS **لا تحرسه** إطلاقاً،
--    فالمنحة هي الحارس لا السياسة.

alter table public.trip_closure_settings       enable row level security;
alter table public.trip_completion_requests    enable row level security;
alter table public.trip_withdrawals            enable row level security;
alter table public.partner_grievances          enable row level security;

revoke all on table public.trip_closure_settings    from public, anon, authenticated;
revoke all on table public.trip_completion_requests from public, anon, authenticated;
revoke all on table public.trip_withdrawals         from public, anon, authenticated;
revoke all on table public.partner_grievances       from public, anon, authenticated;

-- الإعدادات: المشرف يقرأ ويعدّل عبر RLS؛ ولا `delete` لأي دور مستخدم
grant select, insert, update on table public.trip_closure_settings to authenticated;
grant select, insert, update, delete on table public.trip_closure_settings to service_role;

-- الطلبات: المشرف يقرأ (RLS)، والكتابة عبر الدوال وحدها
grant select on table public.trip_completion_requests to authenticated;
grant select, insert, update, delete on table public.trip_completion_requests to service_role;

grant select on table public.trip_withdrawals to authenticated;
grant select, insert, update, delete on table public.trip_withdrawals to service_role;

grant select on table public.partner_grievances to authenticated;
grant select, insert, update, delete on table public.partner_grievances to service_role;

drop policy if exists trip_closure_settings_select_admin on public.trip_closure_settings;
create policy trip_closure_settings_select_admin on public.trip_closure_settings
  for select to authenticated using (public.is_admin());
drop policy if exists trip_closure_settings_insert_admin on public.trip_closure_settings;
create policy trip_closure_settings_insert_admin on public.trip_closure_settings
  for insert to authenticated with check (public.is_admin());
drop policy if exists trip_closure_settings_update_admin on public.trip_closure_settings;
create policy trip_closure_settings_update_admin on public.trip_closure_settings
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists trip_completion_requests_select_admin on public.trip_completion_requests;
create policy trip_completion_requests_select_admin on public.trip_completion_requests
  for select to authenticated using (public.is_admin());

-- 🔒 المتعهد يقرأ طلبه هو — لا طلبات غيره. والمقارنة بدالةٍ لا بعمودٍ من الجلسة.
drop policy if exists trip_completion_requests_select_own on public.trip_completion_requests;
create policy trip_completion_requests_select_own on public.trip_completion_requests
  for select to authenticated
  using (subcontractor_id = public.current_subcontractor_id());

drop policy if exists trip_withdrawals_select_admin on public.trip_withdrawals;
create policy trip_withdrawals_select_admin on public.trip_withdrawals
  for select to authenticated using (public.is_admin());

drop policy if exists partner_grievances_select_admin on public.partner_grievances;
create policy partner_grievances_select_admin on public.partner_grievances
  for select to authenticated using (public.is_admin());
drop policy if exists partner_grievances_select_own on public.partner_grievances;
create policy partner_grievances_select_own on public.partner_grievances
  for select to authenticated
  using (subcontractor_id = public.current_subcontractor_id());

-- ── الدوال ────────────────────────────────────────────────────────────────
revoke all on function public.guard_booking_unassign()          from public, anon, authenticated;

revoke all on function public.trip_closure_config()             from public, anon;
grant execute on function public.trip_closure_config()          to authenticated, service_role;

revoke all on function public.booking_transition_allowed(text, text) from public, anon;
grant execute on function public.booking_transition_allowed(text, text) to authenticated, service_role;

revoke all on function public.mark_booking_failed(uuid, text, text, numeric, text) from public, anon;
grant execute on function public.mark_booking_failed(uuid, text, text, numeric, text)
  to authenticated, service_role;

revoke all on function public.request_trip_completion(uuid, text) from public, anon;
grant execute on function public.request_trip_completion(uuid, text) to authenticated, service_role;

revoke all on function public.decide_trip_completion(uuid, boolean, text) from public, anon;
grant execute on function public.decide_trip_completion(uuid, boolean, text) to authenticated, service_role;

-- 🔒 الاعتماد التلقائي: لا يبلغه متعهدٌ ولا زائر — حارسُه `dispatch_ops_allowed`
--    داخله، والمنحة تُغلق الباب قبله.
revoke all on function public.settle_due_completions(integer) from public, anon, authenticated;
grant execute on function public.settle_due_completions(integer) to service_role;

revoke all on function public.withdraw_from_trip(uuid, text, text) from public, anon;
grant execute on function public.withdraw_from_trip(uuid, text, text) to authenticated, service_role;

revoke all on function public.file_grievance(uuid, text, text) from public, anon;
grant execute on function public.file_grievance(uuid, text, text) to authenticated, service_role;

revoke all on function public.resolve_grievance(uuid, boolean, text) from public, anon;
grant execute on function public.resolve_grievance(uuid, boolean, text) to authenticated, service_role;

revoke all on function public.portal_grievances(integer) from public, anon;
grant execute on function public.portal_grievances(integer) to authenticated, service_role;

revoke all on function public.portal_trips() from public, anon;
grant execute on function public.portal_trips() to authenticated, service_role;

-- 🔒 دفعات الولاء: **لا تُمنح لأي دور مستخدم**. تُنادى من `my_loyalty_expiry`
--    و`loyalty_expiry_summary` و`expire_loyalty_points` وحدها — ووسيطها هاتفٌ
--    معياري، فمنحُها لـ`authenticated` تعني قراءة رصيد أي رقمٍ بتخمينه.
revoke all on function public.loyalty_lots(text) from public, anon, authenticated;
grant execute on function public.loyalty_lots(text) to service_role;

revoke all on function public.my_loyalty_expiry(integer) from public, anon;
grant execute on function public.my_loyalty_expiry(integer) to authenticated, service_role;

-- ملخّصٌ مجمَّع بلا هوية — للوحة المالك، وحارسُه `is_admin()` **داخلها** لأن
-- المنحة لـ`authenticated` تشمل كل متعهد (‏**D-20**)
revoke all on function public.loyalty_expiry_summary() from public, anon;
grant execute on function public.loyalty_expiry_summary() to authenticated, service_role;

revoke all on function public.apply_withdrawal_deduction(uuid, numeric, text) from public, anon;
grant execute on function public.apply_withdrawal_deduction(uuid, numeric, text)
  to authenticated, service_role;

revoke all on function public.trip_withdrawals_freeze() from public, anon, authenticated;

revoke all on function public.expire_loyalty_points(integer) from public, anon, authenticated;
grant execute on function public.expire_loyalty_points(integer) to service_role;

revoke all on function public.dispatch_tick() from public, anon;
grant execute on function public.dispatch_tick() to authenticated, service_role;
