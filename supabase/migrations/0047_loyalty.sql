-- ============================================================================
-- 0047 — محرّك الولاء (المرحلة ١٢ب، الشقّ الثاني وبه تُقفل المرحلة ١٢)
--
-- المرجع الملزم: `lib/loyalty-types.ts` §١–§٦. وهذه الهجرة **تنفّذ ولا تعيد
-- اشتقاق**: كل قرارٍ هنا مكتوبٌ هناك بمبرره، وما تجده في هذا الملف من تعليل هو
-- **كيف** نُفِّذ لا **لماذا** قُرِّر.
--
-- و`0046` مطبَّقة ولا تُعدَّل: `discount_floor_room` موجودة حيّة، وهذه الهجرة
-- **تناديها ولا تستنسخها** (القاعدة ١٢ · D-58). ولو أعادت اشتقاق الأرضية لكانت
-- قد وُلدت وفيها بالضبط العطب الذي وُلدت `0046` لإغلاقه.
--
-- ── ما تبنيه، في سطرٍ لكلٍّ ─────────────────────────────────────────────────
--
--   loyalty_settings   صفٌّ واحد على شكل `discount_settings` حرفياً، **مبذورٌ
--                      مطفأً** — ولا نظام ولاء يبدأ بلا قرار بشري (§٦).
--   loyalty_accounts   صفُّ `phone_norm` القابل للقفل (§٥): رصيدٌ مادّي وُجد
--                      لأجل `select … for update` لا لينقض الدفتر.
--   loyalty_entries    دفترٌ مُلحَق مرآةَ `ledger_entries`: لا تعديل ولا حذف،
--                      والتصحيح **قيدٌ عاكس** يشير إلى أصله.
--   loyalty_config()   تدهورٌ رشيق كـ`discount_config()` — بلا صفٍّ يعمل المطفأ.
--   loyalty_on_booking_completed   ★ **مُشغّل على انتقال الاكتمال** (§٤).
--   loyalty_on_booking_cancelled   يعيد ما أُنفق بقيدٍ عاكس.
--   apply_points()     الحساب — نظير `apply_discount` تماماً (stable، تنادي
--                      `discount_floor_room`، تُرجع outcome بـ`clamped`).
--   redeem_points()    الكتابة — نظير `redeem_coupon` تماماً (volatile، تقفل
--                      صفَّ الرصيد، تكتب القيد داخل معاملة الحجز).
--   create_booking()   موسَّعة بمعامل `p_redeem_points` وحده، وموضع النداء هو
--                      **بعد الكوبون وقبل الخدمات** (§٢) لا حرفٌ غير ذلك.
--   my_loyalty()       الرصيد كما يراه صاحبه عبر **الهاتف المُثبَت** (§٣).
--   loyalty_reconcile() مطابقة الرصيد المادّي بمجموع الدفتر — أي فرقٍ عطب.
--
-- ── لماذا دالتان للاستبدال لا دالة؟ ─────────────────────────────────────────
--
-- لأن القيد يحتاج `booking_id` والحجز لم يُدرَج بعد لحظة الحساب. وهو **الفصل
-- القائم في المستودع أصلاً**: `apply_discount` تحسب قبل الإدراج و`redeem_coupon`
-- تكتب بعده، وكلتاهما داخل معاملة `create_booking` الواحدة (D-48). فاستنسخنا
-- الشكل ولم نخترع ثالثاً — ولا **مصدرَ ثانٍ لرقمٍ واحد** (النمط ٨): المبلغ
-- والنقاط يُحسبان في `apply_points` مرةً واحدة و**يُمرَّران** إلى `redeem_points`
-- كما يُمرَّر `v_disc.amount` إلى `redeem_coupon`. ما تفعله الثانية هو التحقق من
-- **الكفاية تحت القفل** والكتابة، لا إعادة حساب.
--
-- ── الأرضية: سقفٌ **واحد** للطبقتين مجتمعتين (§١ البند ٤) ───────────────────
--
--   room  := discount_floor_room(ride_total, class, cost).room   ← الميزانية كلها
--   الكوبون يأخذ منها، و`apply_points` تنادي **الدالة نفسها بالإجمالي نفسه**
--   ثم **تطرح ما أخذه الكوبون**. ولا تنادي بـ`total_after` — وذلك بالضبط هو
--   العطب الصامت الذي وصفه §١: ميزانيةٌ ثانية تُفتح من ناتج الأولى.
--
--   وفوق ذلك **حاجزٌ صلب**: `apply_points` ترفع استثناءً لو نزل ناتجها تحت
--   `min_total` — فرعٌ لا يُبلَغ إلا بعطبٍ في حسابها نفسها، وهو **D-16** منطوقاً:
--   الأرضية حاجزٌ لا يتخطاه أي مستدعٍ، ولا حتى هذه الدالة.
--
-- ── أساس الكسب: `ride_after` — وهو **رقمٌ من مصدرٍ واحد** ──────────────────
--
-- §٢ يرسم: `ride_total − كوبون − نقاط = ride_after`، ثم `+ extras = total`.
-- فالأساس = `bookings.total − trip->extrasTotal` — طرحٌ من لقطةٍ واحدة مجمَّدة،
-- لا جمعٌ من مصدرين (النمط ٨). ويقع بعد الاستبدال قصداً: النقاط مالٌ يملكه
-- العميل سلفاً، فسكُّ نقاطٍ على ما دُفع بنقاطٍ سكٌّ من العدم.
-- ولا كسب على الخدمات: تكلفتها علينا (§٦).
--
-- ── الفهرس الفريد الجزئي: **نموذج أمانٍ لا تحسين** (§٤) ────────────────────
--
--   unique (booking_id) where direction = 'earn' and reverses_entry_id is null
--
-- رحلةٌ واحدة ⇒ صفُّ كسبٍ واحد، **مهما تعدّدت الحسابات التي ربطتها ومهما أُعيد
-- الربط**. والحارس في الفهرس لا في الشرط: `if not exists` يقرأ لقطة، والفهرس هو
-- الحكم في السباق. وبلا الفهرس تصير مزرعة الحسابات مربحة بنداءين متزامنين.
--
-- ── ولماذا لا قيد `booking_id not null` على الكسب؟ ─────────────────────────
--
-- يبدو بديهياً، وهو **فخّ**: المفتاح الأجنبي `on delete set null` يفرّغ العمود
-- حين يُحذف الحجز، فقيدٌ كهذا يجعل **حذف أي حجزٍ له نقاط مستحيلاً** — وحذف
-- الحجوزات يقع فعلاً (‏`demo:seed --clean` وكل مجموعة اختبار). والدفتر يجب أن
-- **ينجو من حذف موضوعه** لا أن يمنعه: النقاط كُسبت فعلاً وتبقى، ومرجعها يضيع.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (١) loyalty_settings — صفٌّ واحد، مبذورٌ مطفأً
--
-- `id boolean primary key check (id)` هو نفس حيلة `discount_settings`: صفٌّ واحد
-- **بنيوياً** لا بانضباطٍ يُرجى. وكل قيمة هنا يملكها المالك من اللوحة.
--
-- ⚠ الافتراضات محافظة عمداً: نقطةٌ لكل جنيه، والنقطة بقرشين ⇒ عائدٌ فعلي ٢٪
-- لا ١٠٪. ومن يبذر ١٠٪ على نظامٍ **بلا انتهاء صلاحية** (§٦) يفتح التزاماً
-- مالياً مفتوحاً بقيمة عُشر الإيراد قبل أن يقرأ المالك الشاشة أصلاً. والحدّ
-- الأدنى ٥٠٠ نقطة (= ١٠ جنيهات) يمنع حركاتٍ بقروش لا معنى لها.
-- ----------------------------------------------------------------------------

create table if not exists public.loyalty_settings (
  id                  boolean primary key default true check (id),
  enabled             boolean     not null default false,
  points_per_currency numeric     not null default 1    check (points_per_currency >= 0),
  currency_per_point  numeric     not null default 0.02 check (currency_per_point > 0),
  min_redeem_points   integer     not null default 500  check (min_redeem_points >= 0),
  max_redeem_percent  numeric     not null default 20
    check (max_redeem_percent >= 0 and max_redeem_percent <= 100),
  updated_at          timestamptz not null default now()
);

insert into public.loyalty_settings (id) values (true) on conflict (id) do nothing;

drop trigger if exists loyalty_settings_touch_updated_at on public.loyalty_settings;
create trigger loyalty_settings_touch_updated_at
  before update on public.loyalty_settings
  for each row execute function public.touch_updated_at();

comment on table public.loyalty_settings is
  'إعدادات نظام الولاء — صفٌّ واحد على شكل discount_settings. 🔒 مبذورٌ enabled=false: نظام ولاء يبدأ نفسه يسكّ التزاماً مالياً بلا قرار بشري (loyalty-types §٦). والمطفأ يعني «لا نقاط تُسكّ ولا تُستبدل» — لا «تُسكّ ولا تظهر».';

-- ----------------------------------------------------------------------------
-- (٢) loyalty_accounts — الصفُّ الذي يُقفَل (§٥)
--
-- 🔒 وجودُ عمود الرصيد ليس نقضاً للدفتر: هو صفٌّ قابل لـ`select … for update`
-- كي يصير الإنفاق المزدوج المتزامن **مستحيلاً** بدل أن يكون نادراً. والرصيد
-- **مشتقٌّ** يُطابَق بمجموع الدفتر (`loyalty_reconcile`)، وأي فرقٍ عطبٌ يُرفع.
--
-- و`check (points_balance >= 0)` حاجزٌ أخير: لو أفلت إنفاقٌ مزدوج من القفل
-- انهارت معاملته على القيد بدل أن يستقر رصيدٌ سالب في القاعدة.
-- ----------------------------------------------------------------------------

create table if not exists public.loyalty_accounts (
  phone_norm     text        primary key,
  points_balance integer     not null default 0 check (points_balance >= 0),
  updated_at     timestamptz not null default now()
);

comment on table public.loyalty_accounts is
  'رصيد نقاط العميل مجمَّعاً على الهاتف المعياري (bookings.phone_norm). 🔒 الرصيد مادّيٌّ **ليُقفَل** لا لينقض الدفتر (loyalty-types §٥): redeem_points تقرؤه وتكتبه في معاملةٍ واحدة تحت select … for update، فالإنفاق المزدوج المتزامن مستحيل. ويُطابَق بمجموع loyalty_entries عبر loyalty_reconcile() — وأي فرقٍ عطبٌ لا فارقُ توقيت.';

-- ----------------------------------------------------------------------------
-- (٣) loyalty_entries — الدفتر المُلحَق
--
-- مرآةُ `ledger_entries` بنيةً وانضباطاً: `direction` و`points` و`booking_id`
-- و`occurred_at` و`reverses_entry_id` و`note` و`created_by` — بنفس الأسماء
-- والدلالات، كي يقرأه من يعرف الدفتر المالي بلا تعلّمٍ ثانٍ.
--
-- **والإشارة في القيمة لا في حقلٍ ثانٍ** (‏`LoyaltyEntryView.points`): موجبٌ
-- للكسب وسالبٌ للاستبدال. فمجموع العمود **هو** الرصيد، ولا يحتاج قارئه إلى
-- معرفة جدول اتجاهات — وهو ما يجعل `loyalty_reconcile` سطراً واحداً.
-- ----------------------------------------------------------------------------

create table if not exists public.loyalty_entries (
  id                uuid        primary key default gen_random_uuid(),
  -- الهاتف المعياري: الرصيد يُجمَّع عليه لا على الحساب (§٣)
  phone_norm        text        not null,
  direction         text        not null
    check (direction in ('earn', 'redeem', 'reverse', 'adjust')),
  -- موجبٌ للكسب سالبٌ للاستبدال، وصفرٌ لا معنى له فيُرفض
  points            integer     not null check (points <> 0),
  booking_id        uuid        references public.bookings(id) on delete set null,
  occurred_at       timestamptz not null default now(),
  reverses_entry_id uuid        references public.loyalty_entries(id) on delete restrict,
  note              text,
  created_by        uuid,
  created_at        timestamptz not null default now(),

  -- الإشارة تتبع الاتجاه: كسبٌ سالب أو استبدالٌ موجب انقلابُ معنى لا خطأ إدخال
  constraint loyalty_entries_sign_chk check (
    (direction = 'earn'   and points > 0) or
    (direction = 'redeem' and points < 0) or
    (direction in ('reverse', 'adjust'))
  ),
  -- التكافؤ في الاتجاهين: قيدٌ عاكس بلا أصل، أو أصلٌ موسومٌ عكساً، كلاهما يكسر
  -- تفسير التاريخ بعد سنة — وهو ما يفرّق نظام ولاءٍ عن عدّاد
  constraint loyalty_entries_reverse_chk check (
    (direction = 'reverse') = (reverses_entry_id is not null)
  )
);

-- 🔒 **نموذج الأمان لا تحسين الأداء** (§٤): رحلةٌ واحدة ⇒ صفُّ كسبٍ واحد،
--    مهما تعدّدت الحسابات التي ربطتها ومهما أُعيد الربط.
create unique index if not exists loyalty_entries_earn_booking_key
  on public.loyalty_entries (booking_id)
  where direction = 'earn' and reverses_entry_id is null;

-- ونظيره للاستبدال: حجزٌ واحد لا يُخصم عليه مرتين ولو أُعيد نداء الكتابة
create unique index if not exists loyalty_entries_redeem_booking_key
  on public.loyalty_entries (booking_id)
  where direction = 'redeem' and reverses_entry_id is null;

-- قيدٌ واحد لا يُعكس مرتين — نظير `ledger_entries_reverses_key` حرفياً
create unique index if not exists loyalty_entries_reverses_key
  on public.loyalty_entries (reverses_entry_id)
  where reverses_entry_id is not null;

create index if not exists loyalty_entries_phone_occurred_idx
  on public.loyalty_entries (phone_norm, occurred_at);
create index if not exists loyalty_entries_booking_idx
  on public.loyalty_entries (booking_id, occurred_at);

comment on table public.loyalty_entries is
  'دفتر نقاط الولاء — **مُلحَق فقط** مرآةَ ledger_entries: لا update ولا delete، والتصحيح قيدٌ عاكس يشير إلى أصله (reverses_entry_id). والإشارة في points لا في حقلٍ ثانٍ فمجموع العمود هو الرصيد. 🔒 والفهرس الفريد الجزئي على (booking_id) حيث direction=earn هو **نموذج الأمان** لا تحسين: رحلةٌ واحدة تسكّ صفَّ كسبٍ واحداً مهما تعدّدت الحسابات التي ربطتها (loyalty-types §٤).';

comment on column public.loyalty_entries.points is
  'موجبٌ للكسب وسالبٌ للاستبدال — الإشارة في القيمة لا في حقلٍ ثانٍ، فمجموع العمود على phone_norm هو الرصيد بلا جدول اتجاهات.';

-- ── (٣-أ) 🔒 المُلحَق فقط — حاجزٌ بنيوي لا انضباط ────────────────────────────
--
-- `ledger_entries` تكتفي بالمنح: لا `update` ولا `delete` لأن لا دالة تفعلهما.
-- وهذا **أضعف مما يعد به العقد**: «لا update ولا delete» جملةُ بنيةٍ لا عُرف.
-- فالمنع هنا مُشغّل يرفع — وأي كاتبٍ يخالف يفشل فوراً بدل أن يمحو تاريخاً.
--
-- ⚠ **والاستثناء الوحيد مقيسٌ لا متساهل**: `on delete set null` على المفتاح
--   الأجنبي يُصدر `UPDATE` على هذا الجدول حين يُحذف حجز. فيُسمح **بذلك وحده**:
--   `booking_id` يخرج من قيمةٍ إلى `null` **ولا حقلَ آخر يتغيّر معه** — تُقارَن
--   الصورتان كاملتين بعد إسقاط العمود، فلا يمرّ تحت هذه اللافتة تعديلٌ ثانٍ.
create or replace function public.loyalty_entries_append_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and new.booking_id is null
     and old.booking_id is not null
     and (to_jsonb(new) - 'booking_id') = (to_jsonb(old) - 'booking_id') then
    -- فعلُ المفتاح الأجنبي نفسه: الحجز حُذف والنقاط تبقى بلا مرجع
    return new;
  end if;

  raise exception
    'دفتر الولاء مُلحَقٌ فقط: لا تعديل ولا حذف — التصحيح قيدٌ عاكس يشير إلى أصله (loyalty-types §٥)'
    using hint = 'append-only';
end;
$$;

drop trigger if exists loyalty_entries_append_only on public.loyalty_entries;
create trigger loyalty_entries_append_only
  before update or delete on public.loyalty_entries
  for each row execute function public.loyalty_entries_append_only();

-- ── (٣-ب) 🔒 كاتبُ الرصيد **واحد**: مُشغّلٌ على الدفتر ──────────────────────
--
-- لو كتب كلُّ مسارٍ رصيدَه بنفسه (الكسب هنا والاستبدال هناك والعكس ثالثاً)
-- لصارت ثلاثة مصادر لرقمٍ واحد — النمط ٨ حرفياً، ينحرف بعد أول مسارٍ رابع
-- يُكتب وينسى السطر. فالرصيد يُشتق من **حدث القيد نفسه** ولا يُكتب إلا من هنا،
-- ومطابقة `loyalty_reconcile` تصير حينها حارساً على العطب لا على السهو.
-- ⚠ **و`insert … on conflict do update` هنا خطأ مقيس لا أسلوب.** الصيغة
--   البديهية `values (phone, new.points)` تمرّ على قيدِ `points_balance >= 0`
--   **قبل** أن يُكتشف التصادم — فأول استبدالٍ لعميلٍ له رصيد ينفجر بـ«violates
--   check constraint» رغم أن مسار التحديث كان سيعطي رقماً موجباً. قِيس بتجربةٍ
--   مستقلة على جدولٍ مؤقت، وأمسكه الفحص الذاتي في أول تشغيل.
--   فالتحديثُ أولاً، والإدراج للصفِّ الأول وحده، والحلقةُ للسباق بينهما.
create or replace function public.loyalty_apply_entry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  loop
    update public.loyalty_accounts
       set points_balance = points_balance + new.points,
           updated_at     = now()
     where phone_norm = new.phone_norm;
    exit when found;

    begin
      -- صفٌّ أول: قيمةٌ سالبة هنا **خطأٌ حقيقي** (استبدالٌ بلا رصيد) فليُرفع
      insert into public.loyalty_accounts (phone_norm, points_balance)
      values (new.phone_norm, new.points);
      exit;
    exception when unique_violation then
      -- سباق: وُلد الصفّ بين التحديث والإدراج ⇒ أعد الدورة فيلتقطه التحديث
      null;
    end;
  end loop;
  return null;
end;
$$;

drop trigger if exists loyalty_entries_apply on public.loyalty_entries;
create trigger loyalty_entries_apply
  after insert on public.loyalty_entries
  for each row execute function public.loyalty_apply_entry();

-- ── (٣-ج) التدقيق: من كتب في دفتر النقاط ────────────────────────────────────
drop trigger if exists audit_loyalty_entries on public.loyalty_entries;
create trigger audit_loyalty_entries
  after insert or update or delete on public.loyalty_entries
  for each row execute function public.log_audit('direction');

-- ----------------------------------------------------------------------------
-- (٤) الصلاحيات على الجداول — السحب من الثلاثة ثم المنح الصريح
--
-- ⚠ سطور `revoke` حمّالة: Supabase تمنح الأدوار العامة صلاحيات واسعة على كل
--   جدولٍ جديد، ومنها `TRUNCATE` التي **لا تخضع لـRLS إطلاقاً** (‏`0041`).
--   وحذفُ هذه السطور يفتح الجداول لا «ينظّف الهجرة».
--
-- والمنح لـ`authenticated` هو `select` وحده تحت سياسة `is_admin()` — نظير
-- `ledger_entries` حرفياً. و**كل متعهدٍ وكل عميلٍ مسجَّل هو `authenticated`**
-- (‏D-20 بعد ١٢ب)، فالحارس هو السياسة لا المنح؛ والفحص الذاتي أسفل الملف يقيس
-- ذلك **بنداءٍ حيّ** بدور مستخدمٍ غير مشرف لا بقراءة السياسة.
-- ----------------------------------------------------------------------------

alter table public.loyalty_settings enable row level security;
alter table public.loyalty_accounts enable row level security;
alter table public.loyalty_entries  enable row level security;

revoke all on table public.loyalty_settings from public, anon, authenticated;
revoke all on table public.loyalty_accounts from public, anon, authenticated;
revoke all on table public.loyalty_entries  from public, anon, authenticated;

grant all on table public.loyalty_settings to service_role;
grant all on table public.loyalty_accounts to service_role;
grant all on table public.loyalty_entries  to service_role;

-- الإعدادات: يقرؤها ويعدّلها المشرف من اللوحة (نظير `discount_settings`)
grant select, update on table public.loyalty_settings to authenticated;
-- الدفتر والأرصدة: قراءةٌ للمشرف وحده (نظير `ledger_entries`)
grant select on table public.loyalty_accounts to authenticated;
grant select on table public.loyalty_entries  to authenticated;

drop policy if exists loyalty_settings_select_admin on public.loyalty_settings;
create policy loyalty_settings_select_admin on public.loyalty_settings
  for select to authenticated using (public.is_admin());

drop policy if exists loyalty_settings_update_admin on public.loyalty_settings;
create policy loyalty_settings_update_admin on public.loyalty_settings
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists loyalty_accounts_select_admin on public.loyalty_accounts;
create policy loyalty_accounts_select_admin on public.loyalty_accounts
  for select to authenticated using (public.is_admin());

drop policy if exists loyalty_entries_select_admin on public.loyalty_entries;
create policy loyalty_entries_select_admin on public.loyalty_entries
  for select to authenticated using (public.is_admin());

-- ----------------------------------------------------------------------------
-- (٥) loyalty_config() — التدهور الرشيق، نظير `discount_config()` حرفياً
--
-- بلا صفِّ إعدادات تعمل قيم العقد الافتراضية **ومنها `enabled = false`**: قاعدةٌ
-- نصفُ مهاجَرة لا تسكّ نقاطاً، والفشل مغلقٌ لا مفتوح.
-- ----------------------------------------------------------------------------
create or replace function public.loyalty_config()
returns table (
  enabled             boolean,
  points_per_currency numeric,
  currency_per_point  numeric,
  min_redeem_points   integer,
  max_redeem_percent  numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce(l.enabled, false),
    coalesce(l.points_per_currency, 1),
    coalesce(l.currency_per_point, 0.02),
    coalesce(l.min_redeem_points, 500),
    coalesce(l.max_redeem_percent, 20)
  from (select 1) one
  left join public.loyalty_settings l on l.id;
$$;

comment on function public.loyalty_config() is
  'إعدادات الولاء بتدهورٍ رشيق — نظير discount_config(). بلا صفٍّ تعمل قيم العقد الافتراضية ومنها enabled=false، فالقاعدة نصف المهاجَرة لا تسكّ نقاطاً.';

-- ----------------------------------------------------------------------------
-- (٦) ★ الكسب: **مُشغّلٌ على انتقال الاكتمال** (§٤)
--
-- لا دالةَ تطبيقٍ يناديها الكود — فتُنسى في مسارٍ ثانٍ للاكتمال — ولا مهمةً
-- مجدولة تمرّ على الماضي — فتسكّ نقاطاً لرحلاتٍ سبقت النظام. والحجز هو الكيان
-- الصحيح لأنه وحده يملك حالةً وإجمالاً مجمَّداً ومُشغّلَ اكتمالٍ قائماً
-- (‏`bookings_ledger_completed`)، وهذا المُشغّل توأمه شكلاً وحارساً.
--
-- ⚠ **والنظام المطفأ لا يسكّ**: §٦ صريح — «لا نقاط تُسكّ ولا تُستبدل»، لا
--   «تُسكّ ولا تظهر». فمن أطفأه لا يجد التزاماً تراكم في الظلام.
-- ----------------------------------------------------------------------------
create or replace function public.loyalty_on_booking_completed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cfg    record;
  v_extras numeric;
  v_base   numeric;
  v_points integer;
begin
  -- نفس حارس `ledger_on_booking_completed` حرفياً: الانتقال **إلى** الاكتمال
  -- مرةً واحدة، لا كلَّ تحديثٍ يمرّ على صفٍّ مكتمل
  if new.status <> 'completed' or coalesce(old.status, '') = 'completed' then
    return null;
  end if;

  select * into v_cfg from public.loyalty_config();
  if not v_cfg.enabled then
    return null;
  end if;

  -- بلا هاتفٍ معياري لا وعاء للرصيد (§٣: الرصيد يُجمَّع على phone_norm)
  if new.phone_norm is null then
    return null;
  end if;

  -- 🔒 الأساس = `ride_after` — من **لقطةٍ واحدة** بالطرح لا من مصدرين بالجمع.
  --    `bookings.total` = ride_after + extras، و`extrasTotal` مخزَّن في نفس
  --    اللقطة لحظة الحجز. فلا خدمات في الأساس (تكلفتها علينا · §٦)، ولا نقاطٌ
  --    تُسكّ على ما دُفع بنقاط (سكٌّ من العدم · §٢).
  v_extras := greatest(coalesce(public.jsonb_number(new.trip, 'extrasTotal', 0), 0), 0);
  v_base   := greatest(coalesce(new.total, 0) - v_extras, 0);

  -- `floor` لا `round`: النقطة الكسرية لا وجود لها، والتقريب لأعلى يسكّ نقطةً
  -- بلا جنيهٍ خلفها — والاتجاه الآمن في الالتزامات هو لأسفل.
  v_points := floor(v_base * v_cfg.points_per_currency)::integer;
  if v_points <= 0 then
    return null;
  end if;

  -- الحارس المقروء؛ والحكم في السباق هو الفهرس الفريد الجزئي لا هذه القراءة
  if exists (
    select 1 from public.loyalty_entries e
     where e.booking_id = new.id
       and e.direction = 'earn'
       and e.reverses_entry_id is null
  ) then
    return null;
  end if;

  insert into public.loyalty_entries (
    phone_norm, direction, points, booking_id, note, created_by
  )
  values (
    new.phone_norm, 'earn', v_points, new.id,
    'نقاط رحلة ' || coalesce(new.reference, ''), public.current_actor()
  );

  return null;
end;
$$;

drop trigger if exists bookings_loyalty_completed on public.bookings;
create trigger bookings_loyalty_completed
  after update of status on public.bookings
  for each row
  when (old.status is distinct from new.status)
  execute function public.loyalty_on_booking_completed();

comment on function public.loyalty_on_booking_completed() is
  'يسكّ نقاط الرحلة عند **انتقال** الحجز إلى completed — مُشغّلٌ لا دالة تطبيق ولا مهمة مجدولة (loyalty-types §٤). الأساس ride_after = total − extrasTotal من اللقطة المجمَّدة نفسها: لا كسب على الخدمات ولا على ما دُفع بنقاط. والنظام المطفأ لا يسكّ شيئاً (§٦).';

-- ----------------------------------------------------------------------------
-- (٧) الإلغاء: ما أُنفق يعود، بقيدٍ عاكس لا بحذف
--
-- نظير `ledger_on_booking_cancelled` حرفياً: كل قيدٍ على هذا الحجز ليس عكساً
-- ولم يُعكس بعدُ ⇒ قيدٌ عاكس بإشارةٍ مقلوبة يشير إلى أصله.
--
-- ⚠ **وبلا فحص `enabled`. عمداً.** من أطفأ النظام بعد أن استبدل عميلٌ نقاطه
--   لا يجوز أن يبتلع نقاطه: الإطفاء يمنع السكَّ والإنفاق الجديدين، لا يصادر
--   ما وقع. والفحصُ هنا كان سيصنع مساراً يخسر فيه العميل رصيده بقرار إداري
--   لا علاقة له بحجزه — عطبَ «فقدِ معلومة» لا يمسكه اختبارٌ عابر.
--
-- ملاحظة: `completed → cancelled` **ممنوع** اليوم في `booking_transition_allowed`،
-- فالحلقة عملياً لا ترى إلا قيود الاستبدال. وكُتبت عامّةً لأن جدول الانتقالات
-- إعدادٌ يتغيّر، وحلقةٌ تعرف نوعاً واحداً كانت ستصمت يوم يُسمح بالانتقال.
-- ----------------------------------------------------------------------------
create or replace function public.loyalty_on_booking_cancelled()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_e   record;
  v_act uuid;
begin
  if new.status <> 'cancelled' or coalesce(old.status, '') = 'cancelled' then
    return null;
  end if;

  v_act := public.current_actor();

  for v_e in
    select e.*
    from public.loyalty_entries e
    where e.booking_id = new.id
      and e.reverses_entry_id is null
      and not exists (
        select 1 from public.loyalty_entries x where x.reverses_entry_id = e.id
      )
  loop
    insert into public.loyalty_entries (
      phone_norm, direction, points, booking_id,
      reverses_entry_id, note, created_by
    )
    values (
      v_e.phone_norm, 'reverse', -v_e.points, v_e.booking_id,
      v_e.id,
      'قيد عاكس — أُلغيت الرحلة ' || coalesce(new.reference, ''), v_act
    );
  end loop;

  return null;
end;
$$;

drop trigger if exists bookings_loyalty_cancelled on public.bookings;
create trigger bookings_loyalty_cancelled
  after update of status on public.bookings
  for each row
  when (old.status is distinct from new.status)
  execute function public.loyalty_on_booking_cancelled();

comment on function public.loyalty_on_booking_cancelled() is
  'يعيد نقاط الحجز الملغى بقيدٍ عاكس يشير إلى أصله — لا حذف ولا تعديل (loyalty-types §٥). وبلا فحص enabled عمداً: إطفاء النظام يمنع الجديد ولا يصادر ما وقع.';

-- ----------------------------------------------------------------------------
-- (٨) apply_points — الحساب. نظير `apply_discount` شكلاً ومسؤوليةً
--
-- تُستدعى **بعد** `apply_discount` وقبل الخدمات (§٢)، وتأخذ:
--   • `p_ride_total`    إجمالي الرحلة **قبل أي خصم** — وهو نفس ما نودي به
--                       `apply_discount`، لأن الميزانية تُحسب من الإجمالي الداخل.
--   • `p_coupon_amount` ما أخذه الكوبون من **الميزانية نفسها** فيُطرح منها.
--
-- 🔒 وهنا بالضبط يقع §١: لو نوديت `discount_floor_room` بـ`total_after` لفُتحت
--    ميزانيةٌ ثانية من ناتج الأولى، ولنزل السعر تحت تكلفة المتعهد زائد أدنى
--    هامش — **وكل شيءٍ يبدو سليماً**: `applied = true` وقيمةٌ صحيحة الشكل.
-- ----------------------------------------------------------------------------
create or replace function public.apply_points(
  p_phone         text,
  p_points        integer,
  p_ride_total    numeric,
  p_class_slug    text,
  p_partner_cost  numeric,
  p_coupon_amount numeric
)
returns table (
  applied     boolean,
  points      integer,
  amount      numeric,
  total_after numeric,
  clamped     boolean,
  rejection   text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_cfg       record;
  v_norm      text;
  v_bal       integer;
  v_total     numeric;
  v_coupon    numeric;
  v_after_cpn numeric;
  v_min       numeric;
  v_room      numeric;
  v_left      numeric;   -- الميزانية بعد ما أخذه الكوبون
  v_cap       numeric;   -- أقصى مبلغ تحتمله كل السقوف مجتمعة
  v_afford    integer;
  v_use       integer;
begin
  -- نفس تطبيع المدخل في `apply_discount` حرفياً
  v_total     := round(coalesce(p_ride_total, 0), 2);
  v_coupon    := greatest(round(coalesce(p_coupon_amount, 0), 2), 0);
  v_after_cpn := round(v_total - v_coupon, 2);

  -- بلا طلبٍ للنقاط: **ليس رفضاً** — الرحلة ببساطة بلا استبدال (نظير «بلا رمز»)
  if coalesce(p_points, 0) <= 0 then
    applied := false; points := 0; amount := 0; total_after := v_after_cpn;
    clamped := false; rejection := null;
    return next; return;
  end if;

  -- الرفض الافتراضي لكل المسارات التالية
  applied := false; points := 0; amount := 0; total_after := v_after_cpn; clamped := false;

  select * into v_cfg from public.loyalty_config();
  if not v_cfg.enabled then
    rejection := 'not-enabled';
    return next; return;
  end if;

  -- التطبيع **داخلها**: `normalize_phone` لا تُمنح للزائر بحال، ونفس ما يفعله
  -- العمود المولَّد `bookings.phone_norm` — فالوعاء واحدٌ حتماً
  v_norm := public.normalize_phone(p_phone);
  if v_norm is null then
    rejection := 'invalid-input';
    return next; return;
  end if;

  if v_after_cpn <= 0 then
    rejection := 'below-min-total';
    return next; return;
  end if;

  select a.points_balance into v_bal
    from public.loyalty_accounts a where a.phone_norm = v_norm;
  v_bal := coalesce(v_bal, 0);
  if v_bal <= 0 then
    rejection := 'insufficient-points';
    return next; return;
  end if;

  -- ── 🔒 الميزانية المشتركة — تفويضٌ لا استنساخ (§١ · 0046) ─────────────────
  -- بالإجمالي **الداخل** لا بـ`total_after`، ثم يُطرح ما أخذه الكوبون.
  select r.min_total, r.room into v_min, v_room
    from public.discount_floor_room(v_total, p_class_slug, p_partner_cost) r;

  v_left := coalesce(v_room, 0) - v_coupon;

  -- سقفان: نسبةُ الإعدادات من `ride_after` **والميزانية**؛ و`floor` لكليهما كي
  -- لا يرفع التقريبُ الخصمَ فوق حدٍّ ضبطه المالك أو فوق الأرضية
  v_cap := least(floor(v_after_cpn * v_cfg.max_redeem_percent / 100), v_left);
  if v_cap <= 0 then
    -- لا مساحة: والأولوية للكوبون لأنه معلَنٌ قبل الحجز (§٦)
    rejection := 'floor-guard';
    return next; return;
  end if;

  -- من المال إلى النقاط: كم نقطةً يحتملها هذا السقف أصلاً
  v_afford := floor(v_cap / v_cfg.currency_per_point)::integer;
  v_use    := least(p_points, v_bal, v_afford);

  amount := floor(v_use * v_cfg.currency_per_point);

  -- ⚠ ثم **من المال إلى النقاط ثانيةً**: `floor` أعلاه قد يبتلع كسر جنيه، فلا
  --   يجوز أن نخصم من الرصيد نقاطاً لم تتحوّل إلى جنيهٍ واحد. وهي لا ترفع
  --   العدد أبداً (‏amount ≤ v_use × القيمة ⇒ الناتج ≤ v_use)، فالاتجاه دائماً
  --   في صالح العميل، والمال والدفتر يبقيان **رقماً واحداً** لا رقمين.
  if amount > 0 then
    v_use := ceil(amount / v_cfg.currency_per_point)::integer;
  end if;

  if amount <= 0 or v_use < v_cfg.min_redeem_points then
    -- «أقل رصيد يُسمح باستبداله» يُقاس على المخصوم فعلاً لا على المطلوب
    rejection := 'below-min-points';
    return next; return;
  end if;

  points      := v_use;
  clamped     := v_use < p_points;
  total_after := round(v_after_cpn - amount, 2);

  -- ── 🔒 D-16 — الحاجز الذي لا يتخطاه أي مستدعٍ، **ولا هذه الدالة** ─────────
  -- فرعٌ لا يُبلَغ إلا بعطبٍ في حساب أعلاه. ووجوده هو الفرق بين أرضيةٍ مفروضة
  -- وأرضيةٍ مرجوّة: العطب الصامت في المال أسوأ الأنواع لأن لا شيء يرنّ.
  if total_after < v_min then
    raise exception
      '0047: 🔴 استبدال النقاط ينزل بالرحلة إلى % وأرضيتها % — نقضُ D-16 من داخل apply_points',
      total_after, v_min;
  end if;

  applied   := true;
  rejection := null;
  return next;
end;
$$;

comment on function public.apply_points(text, integer, numeric, text, numeric, numeric) is
  'تحسب استبدال النقاط كطبقةٍ ثالثة بعد الكوبون وقبل الخدمات (loyalty-types §٢). 🔒 تنادي discount_floor_room بالإجمالي **الداخل** ثم تطرح ما أخذه الكوبون: سقفٌ واحد للطبقتين مجتمعتين لا سقفان يُجمعان (§١ · D-16). لا تكتب شيئاً — الكتابة في redeem_points داخل معاملة الحجز. service_role وحده: تكشف الأرضية لمن يتحكم في p_partner_cost.';

-- ----------------------------------------------------------------------------
-- (٩) redeem_points — الكتابة. نظير `redeem_coupon` شكلاً ومسؤوليةً
--
-- تُستدعى **داخل معاملة `create_booking` وحدها**، بعد إدراج الحجز (المفتاح
-- الأجنبي). ولا تعيد حساب شيء: النقاط والمبلغ يصلانها كما حسبتهما `apply_points`
-- تماماً كما يصل `v_disc.amount` إلى `redeem_coupon` — مصدرٌ واحد للرقم.
--
-- 🔒 وما تضيفه هو **القفل**: `select … for update` على صفِّ الرصيد يجعل حجزين
--    متزامنين على آخر النقاط لا يمرّان معاً — الخاسر تنهار معاملته بأكملها
--    فلا يبقى حجزٌ بسعرٍ مخصوم بنقاطٍ لم تُخصم (D-48).
-- ----------------------------------------------------------------------------
create or replace function public.redeem_points(
  p_booking uuid,
  p_phone   text,
  p_points  integer,
  p_amount  numeric
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_norm text;
  v_bal  integer;
  v_ref  text;
  v_id   uuid;
begin
  if p_booking is null then
    raise exception 'الحجز مطلوب لتسجيل استبدال النقاط' using hint = 'invalid-input';
  end if;
  if coalesce(p_points, 0) <= 0 then
    raise exception 'عدد النقاط المستبدَلة يجب أن يكون موجباً' using hint = 'invalid-input';
  end if;

  v_norm := public.normalize_phone(p_phone);
  if v_norm is null then
    raise exception 'رقم الهاتف مطلوب لاستبدال النقاط' using hint = 'invalid-input';
  end if;

  -- 🔒 القفل قبل أي قراءة للرصيد — نظير `redeem_coupon` مع صفِّ الكوبون
  select a.points_balance into v_bal
    from public.loyalty_accounts a
   where a.phone_norm = v_norm
   for update;

  if not found then
    raise exception 'لا رصيد نقاط لهذا الرقم' using hint = 'insufficient-points';
  end if;

  if v_bal < p_points then
    raise exception 'رصيد النقاط غير كافٍ (المتاح % والمطلوب %)', v_bal, p_points
      using hint = 'insufficient-points';
  end if;

  select b.reference into v_ref from public.bookings b where b.id = p_booking;

  insert into public.loyalty_entries (
    phone_norm, direction, points, booking_id, note, created_by
  )
  values (
    v_norm, 'redeem', -p_points, p_booking,
    'استبدال نقاط على رحلة ' || coalesce(v_ref, '') ||
      ' بقيمة ' || round(coalesce(p_amount, 0))::text,
    public.current_actor()
  )
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.redeem_points(uuid, text, integer, numeric) is
  'تكتب قيد استبدال النقاط داخل معاملة create_booking وحدها — نظير redeem_coupon. 🔒 تقفل صفَّ الرصيد بـselect … for update قبل قراءته، فحجزان متزامنان على آخر النقاط لا يمرّان معاً والخاسر تنهار معاملته كلها (loyalty-types §٥ · D-48). ولا تعيد حساب المبلغ: يصلها كما حسبته apply_points — مصدرٌ واحد للرقم.';

-- ----------------------------------------------------------------------------
-- (١٠) create_booking — موسَّعة بمعاملٍ واحد، وموضعُ النداء هو §٢
--
-- الجسم منقولٌ من `pg_get_functiondef` الحيّ (**D-58**) لا من ملف `0031`، وهذه
-- **كل** الفروق ولا حرفَ غيرها:
--   • معامل `p_redeem_points integer default 0` في آخر التوقيع.
--   • ثلاثة متغيرات محلية: `v_pts` و`v_want` و`v_loy_json`.
--   • كتلة (ب-٢ب): نداء `apply_points` **بعد الكوبون وقبل الخدمات** (§٢).
--   • مفتاح `loyalty` في لقطة الرحلة.
--   • نداء `redeem_points` بجوار `redeem_coupon` بعد الإدراج.
--
-- ⚠ **والتوقيع القديم يُسقَط**: معاملٌ جديد بقيمة افتراضية يُنشئ دالةً ثانية لا
--   يستبدل الأولى، فيصير كل نداءٍ بالعدد القديم ملتبساً («function is not
--   unique»). وهو نفس ما فعلته `0024` و`0031` بتوقيعيهما السابقين.
--
-- ⚠ **ولا `clamped` في اللقطة** — كما في كتلة الخصم حرفياً: `bookings.trip`
--   يخرج كاملاً إلى `anon` عبر `get_booking_by_token`، و«لامس السعر أرضيته»
--   تُقرأ منها التكلفة والأرضية. وما في `loyalty` كله أرقامٌ يملكها العميل.
-- ----------------------------------------------------------------------------

drop function if exists public.create_booking(
  jsonb, jsonb, integer, boolean, numeric, numeric, numeric, text, text, text,
  text, text, text, timestamptz, text, text, timestamptz, integer, jsonb);

create or replace function public.create_booking(
  p_origin jsonb, p_destination jsonb, p_passengers integer, p_round_trip boolean,
  p_waiting_hours numeric, p_distance_km numeric, p_duration_min numeric,
  p_distance_source text, p_class_slug text, p_plan text, p_customer_name text,
  p_customer_phone text, p_customer_whatsapp text,
  p_pickup_at timestamp with time zone, p_notes text,
  p_coupon_code text default null::text,
  p_return_at timestamp with time zone default null::timestamp with time zone,
  p_luggage integer default 0,
  p_extras jsonb default null::jsonb,
  p_redeem_points integer default 0
)
returns table (
  id uuid, reference text, public_token text, total numeric,
  amount_due numeric, amount_remaining numeric, currency text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name        text;
  v_phone       text;
  v_whatsapp    text;
  v_plan        text;
  v_slug        text;
  v_passengers  integer;
  v_round_trip  boolean;
  v_waiting     numeric;
  v_distance    numeric;
  v_origin_lbl  text;
  v_origin_lat  numeric;
  v_origin_lng  numeric;
  v_dest_lbl    text;
  v_dest_lat    numeric;
  v_dest_lng    numeric;
  v_hav         numeric;
  v_offer       record;
  v_currency    text;
  v_pay         jsonb;
  v_percent     numeric;
  v_min         numeric;
  v_due         numeric;
  v_remaining   numeric;
  v_trip        jsonb;
  v_id          uuid;
  v_reference   text;
  v_token       text;
  v_attempt     integer;
  v_code        text;
  v_disc        record;
  v_kind        text;
  v_total       numeric;
  v_margin      numeric;
  v_disc_json   jsonb := 'null'::jsonb;
  -- 0047 — ⚠ ما أخذه الكوبون من الميزانية، في متغيّرٍ **قائمٍ بذاته**: قراءة
  --   `v_disc.amount` داخل `case` تنفجر بـ«record is not assigned yet» حين لا
  --   كوبون، لأن plpgsql يبني وسائط الاستعلام قبل تنفيذه فلا قصرَ دائرة فيه.
  v_disc_amount numeric := 0;
  -- 0031
  v_luggage     integer;
  v_derived     numeric;
  v_derived_won boolean := false;
  v_x_total     numeric := 0;
  v_x_rows      jsonb   := '[]'::jsonb;
  -- 0047
  v_want        integer := 0;
  v_pts         record;
  -- ⚠ رايةٌ مستقلة لا `v_pts.applied`: plpgsql يقيّم شرط `if` **تعبيراً واحداً
  --   في SQL**، فلا قصرَ دائرةٍ فيه — و`v_want > 0 and v_pts.applied` ينفجر
  --   بـ«record is not assigned yet» في **كل حجزٍ بلا نقاط**. أمسكه الفحص
  --   الذاتي في أول تشغيل، ولم تكن قراءةٌ لتمسكه.
  v_loy_ok      boolean := false;
  v_loy_json    jsonb   := 'null'::jsonb;
begin
  -- (أ) تطهير المدخلات النصية
  v_name     := nullif(btrim(coalesce(p_customer_name, '')), '');
  v_phone    := nullif(btrim(coalesce(p_customer_phone, '')), '');
  v_whatsapp := nullif(btrim(coalesce(p_customer_whatsapp, '')), '');
  v_slug     := nullif(btrim(coalesce(p_class_slug, '')), '');
  v_plan     := lower(nullif(btrim(coalesce(p_plan, '')), ''));
  v_code     := public.discount_normalize_code(p_coupon_code);

  if v_name is null then
    raise exception 'اسم العميل مطلوب' using hint = 'invalid-input';
  end if;
  if v_phone is null then
    raise exception 'رقم هاتف العميل مطلوب' using hint = 'invalid-input';
  end if;
  if v_slug is null then
    raise exception 'فئة السيارة مطلوبة' using hint = 'invalid-input';
  end if;

  v_plan := coalesce(v_plan, 'full');
  if v_plan not in ('full', 'deposit') then
    raise exception 'خطة الدفع يجب أن تكون full أو deposit' using hint = 'invalid-input';
  end if;

  -- (أ-٢) 0031 — 🔒 تاريخ العودة يُتحقَّق **في SQL** (ف٧)
  --
  -- كل تحقق التواريخ اليوم في TypeScript (`app/api/booking/route.ts:138-151`)،
  -- وتاريخ العودة كان سيرث الفراغ نفسه. وهو **يُرفض لا يُتجاهل**: عودةٌ قبل
  -- الانطلاق تعني نموذجاً مقروءاً بالخطأ أو مستدعياً يعبث، وتجاهلها بصمت يُنتج
  -- حجزاً بساعات انتظار صفر بينما العميل يظن أنه دفع مقابل انتظار.
  if p_return_at is not null then
    if p_pickup_at is null then
      raise exception 'تاريخ العودة بلا تاريخ انطلاق' using hint = 'invalid-input';
    end if;
    if p_return_at <= p_pickup_at then
      raise exception 'تاريخ العودة يجب أن يكون بعد تاريخ الانطلاق'
        using hint = 'invalid-input';
    end if;
  end if;

  v_passengers := greatest(coalesce(p_passengers, 1), 1);
  v_round_trip := coalesce(p_round_trip, false);
  v_distance   := coalesce(p_distance_km, 0);
  v_luggage    := greatest(coalesce(p_luggage, 0), 0);

  -- (أ-٣) 0031 — الانتظار: **الأكبر** من المطلوب والمشتق، لا الاستبدال.
  --
  -- المشتق **أرضية لا سقف**: العميل قد يطلب انتظاراً أطول من فارق التوقيت (يريد
  -- السائق منتظراً ساعتين بعد عودته)، والاستبدالُ كان سيبتلع طلبه بصمت. والعكس
  -- ممنوع أيضاً: من يعود بعد ست ساعات لا يدفع ساعةً واحدة لأنه كتب ١ في الحقل.
  v_derived     := public.derive_waiting_hours(p_pickup_at, p_return_at);
  v_waiting     := greatest(coalesce(p_waiting_hours, 0), 0);
  v_derived_won := coalesce(v_derived, 0) > v_waiting;
  v_waiting     := greatest(v_waiting, coalesce(v_derived, 0));

  if v_distance <= 0 or v_distance > 5000 then
    raise exception 'مسافة الرحلة غير منطقية (% كم)', v_distance using hint = 'invalid-input';
  end if;

  v_origin_lbl := nullif(btrim(coalesce(p_origin ->> 'label', '')), '');
  v_dest_lbl   := nullif(btrim(coalesce(p_destination ->> 'label', '')), '');
  v_origin_lat := public.jsonb_number(p_origin, 'lat', null);
  v_origin_lng := public.jsonb_number(p_origin, 'lng', null);
  v_dest_lat   := public.jsonb_number(p_destination, 'lat', null);
  v_dest_lng   := public.jsonb_number(p_destination, 'lng', null);

  if v_origin_lbl is null or v_dest_lbl is null
     or v_origin_lat is null or v_origin_lng is null
     or v_dest_lat is null or v_dest_lng is null then
    raise exception 'نقطتا الانطلاق والوصول غير مكتملتين' using hint = 'invalid-input';
  end if;

  -- (أ-٤) 🔒 د١ (0009) — المسافة تُقاس على الخريطة لا تُعلَن من المستدعي
  v_hav := public.haversine_km(v_origin_lat, v_origin_lng, v_dest_lat, v_dest_lng);

  if v_hav is not null and v_hav >= 1 then
    if v_distance < v_hav * 0.9 then
      raise exception
        'المسافة المُدخلة (% كم) أقصر من المسافة المستقيمة بين النقطتين (% كم)',
        v_distance, v_hav
        using hint = 'invalid-input';
    end if;
    if v_distance > v_hav * 3 then
      raise exception
        'المسافة المُدخلة (% كم) تفوق ثلاثة أضعاف المسافة المستقيمة (% كم)',
        v_distance, v_hav
        using hint = 'invalid-input';
    end if;
  end if;

  -- (ب) إعادة حساب السعر — المصدر الأوحد هو quote_price، وأي سعر من العميل مُهمَل.
  perform set_config('tours.pricing_internals', 'on', true);

  select q.class_slug, q.class_title, q.total,
         q.price_source, q.subcontractor_id, q.subcontractor_cost, q.margin_amount
    into v_offer
  from public.quote_price(v_distance, v_passengers, v_round_trip, v_waiting,
                          v_origin_lat, v_origin_lng, v_dest_lat, v_dest_lng,
                          v_luggage) q
  where q.class_slug = v_slug;

  perform set_config('tours.pricing_internals', '', true);

  -- الفئة غير المؤهلة **لركابٍ أو لحقائب** ⇒ نفس الرمز كما اليوم
  if v_offer.class_slug is null then
    raise exception 'الفئة «%» غير متاحة لرحلة بـ % راكباً و% حقيبة',
      v_slug, v_passengers, v_luggage
      using hint = 'class-unavailable';
  end if;

  if v_offer.total is null or v_offer.total <= 0 then
    raise exception 'تعذّر احتساب سعر الرحلة' using hint = 'pricing-failed';
  end if;

  -- (ب-٢) 🔒 الخصم — طبقة تالية لبناء السعر، والحاجز داخل apply_discount
  v_total  := v_offer.total;
  v_margin := v_offer.margin_amount;

  if v_code is not null then
    -- ⚠⚠ (ف٩) `v_offer.total` = **إجمالي الرحلة وحده**. الخدمات لم تُضف بعد
    -- ولن تُضاف قبل هذا السطر: الكوبون يخصم الرحلة لا كرسي الأطفال، وأرضية
    -- الهامش لا تعدّ إيراد الخدمات هامشاً (قرار بدر ب).
    select * into v_disc
    from public.apply_discount(v_code, v_offer.total, v_offer.class_slug,
                               v_offer.subcontractor_cost, v_phone);

    if not v_disc.applied then
      -- رسالة واحدة لكل الأسباب: التفريق يخبر من يخمّن الرموز أنه اقترب.
      raise exception 'رمز الخصم غير صالح لهذه الرحلة' using hint = 'coupon-rejected';
    end if;

    select c.kind into v_kind from public.coupons c where c.code = v_code;

    v_disc_amount := v_disc.amount;
    v_total       := v_disc.total_after;
    if v_margin is not null then
      v_margin := greatest(round(v_margin - v_disc.amount, 2), 0);
    end if;

    -- 🔒 **لا `clamped` في اللقطة.** `bookings.trip` يخرج كاملاً من
    -- `get_booking_by_token(text)` (0007) وهي ممنوحة لـ anon، فحاملُ توكن كان
    -- سيقرأ «سعر رحلتك لامس أرضية الهامش» ومنها التكلفة + الأرضية. والراية
    -- محفوظة في `coupon_redemptions.clamped` المحجوب عن غير المشرف.
    v_disc_json := jsonb_build_object(
      'code',        v_code,
      'kind',        v_kind,
      'amount',      v_disc.amount,
      'totalBefore', v_offer.total,
      'totalAfter',  v_disc.total_after
    );
  end if;

  -- (ب-٢ب) 0047 — ★ استبدال النقاط: طبقةٌ **ثالثة، بعد الكوبون وقبل الخدمات**
  --
  -- **بعد الكوبون** لأن النقاط مالٌ يملكه العميل سلفاً والكوبون تنزيلٌ من
  -- المنصة، فتُستهلك على ما **بقي** بعد تنزيلاتنا. و**قبل الخدمات** لأن الخدمة
  -- بندٌ تكلفته علينا، فشراؤها بنقاطٍ خسارةٌ صافية لا تنزيلُ ربح (§٢ · D-54).
  --
  -- 🔒 و`v_offer.total` هو المُمرَّر — **الإجمالي قبل الكوبون** — ومعه ما أخذه
  --    الكوبون: ميزانيةٌ واحدة تُقتسم، لا ميزانيةٌ ثانية تُفتح من `v_total`.
  v_want := greatest(coalesce(p_redeem_points, 0), 0);

  if v_want > 0 then
    select * into v_pts
    from public.apply_points(v_phone, v_want, v_offer.total, v_offer.class_slug,
                             v_offer.subcontractor_cost, v_disc_amount);

    if not v_pts.applied then
      -- رسالة واحدة لكل الأسباب كنظيرتها في الكوبون: تفصيلُ سبب الرفض يخبر
      -- من يجرّب أرقام غيره أين وقف بالضبط.
      raise exception 'تعذّر استبدال النقاط في هذه الرحلة' using hint = 'points-rejected';
    end if;

    v_loy_ok := true;
    v_total  := v_pts.total_after;
    if v_margin is not null then
      v_margin := greatest(round(v_margin - v_pts.amount, 2), 0);
    end if;

    -- ولا `clamped` هنا كذلك، وللسبب نفسه حرفياً (اللقطة تخرج إلى anon)
    v_loy_json := jsonb_build_object(
      'points',      v_pts.points,
      'amount',      v_pts.amount,
      'totalBefore', v_total + v_pts.amount,
      'totalAfter',  v_pts.total_after
    );
  end if;

  -- (ب-٣) 0031 — ★ الخدمات: طبقةٌ **بعد** الذروة و**بعد** الخصم معاً.
  --
  -- تُسعَّر مرة واحدة وتُحفظ سطورها في jsonb: نداءان لـ`price_extras` (واحد
  -- للمجموع وآخر للإدراج) كانا سيفتحان فرقاً لو عدّل المالك الكتالوج بين
  -- اللحظتين — فيُخزَّن سعرٌ غير الذي دخل الإجمالي.
  select
    coalesce(sum(x.line_total), 0),
    coalesce(
      jsonb_agg(jsonb_build_object(
        'extraId',   x.extra_id,
        'title',     x.title,
        'qty',       x.qty,
        'unitPrice', x.unit_price,
        'lineTotal', x.line_total
      )),
      '[]'::jsonb
    )
    into v_x_total, v_x_rows
  from public.price_extras(p_extras) x;

  v_total := v_total + v_x_total;

  -- (ج) العملة من إعدادات التسعير (لا نص ثابت في الكود)
  select ps.currency into v_currency from public.pricing_settings ps limit 1;
  v_currency := coalesce(v_currency, 'EGP');

  -- (د) العربون من مفتاح الإعدادات payment — **من الإجمالي النهائي**
  --     (بعد الخصم وبعد الخدمات: العربون نسبة مما يدفعه العميل فعلاً).
  select s.value into v_pay from public.site_settings s where s.key = 'payment';
  v_percent := public.jsonb_number(v_pay, 'depositPercent', 30);
  v_min     := public.jsonb_number(v_pay, 'depositMinAmount', 200);

  if v_plan = 'deposit' then
    -- النسبة أو الحد الأدنى أيهما أكبر، وبحد أقصى الإجمالي (لا عربون يفوق السعر)
    v_due := least(v_total, greatest(round(v_total * v_percent / 100), v_min));
    v_due := greatest(v_due, 0);
  else
    v_due := v_total;
  end if;
  v_remaining := greatest(v_total - v_due, 0);

  -- (هـ) لقطة الرحلة — تُحفظ كما هي ولا تتأثر بأي تعديل لاحق للتعريفات أو الكوبون.
  --
  -- ⚠ (ف٦) هذه اللقطة تخرج **كاملة** إلى anon عبر `get_booking_by_token`، ولهذا
  -- ليس فيها تكلفة ولا هامش ولا `extra_id`: `extrasTotal` رقمٌ دفعه العميل،
  -- و`returnAt`/`luggage` مدخلاته هو، و`waitingDerived` تفسيرٌ له لا سرّ لنا.
  -- ⚠ (ف٨) وكل مفاتيح الإحداثيات باقية بأسمائها: `dispatch_pool` تُسقط الحجز
  -- إلى الطابور اليدوي إن غاب أيٌّ منها.
  v_trip := jsonb_build_object(
    'originLabel',    v_origin_lbl,
    'originLat',      v_origin_lat,
    'originLng',      v_origin_lng,
    'destLabel',      v_dest_lbl,
    'destLat',        v_dest_lat,
    'destLng',        v_dest_lng,
    'distanceKm',     v_distance,
    'straightKm',     v_hav,
    'durationMin',    p_duration_min,
    'distanceSource', coalesce(nullif(btrim(coalesce(p_distance_source, '')), ''), 'estimate'),
    'passengers',     v_passengers,
    'roundTrip',      v_round_trip,
    'waitingHours',   v_waiting,
    'pickupAt',       p_pickup_at,
    'notes',          nullif(btrim(coalesce(p_notes, '')), ''),
    'discount',       v_disc_json,
    -- 0031
    'returnAt',       p_return_at,
    'luggage',        v_luggage,
    'waitingDerived', v_derived_won,
    'extrasTotal',    v_x_total,
    -- 0047 — ⚠ **بعد `extrasTotal` ولا يغيّره**: مُشغّل الكسب يقرأ
    --        `total − extrasTotal`، فأي مساسٍ بهذا المفتاح يزيح أساس الكسب.
    'loyalty',        v_loy_json
  );

  -- (و) الإدراج — المرجع والتوكن يولّدهما المُشغّل، وتصادمهما يُعالَج بإعادة المحاولة.
  perform set_config('tours.booking_note', 'إنشاء الحجز', true);

  for v_attempt in 1 .. 5 loop
    begin
      insert into public.bookings as b (
        status, class_slug, class_title, total, currency, plan,
        amount_due, amount_remaining,
        customer_name, customer_phone, customer_whatsapp, trip,
        price_source, subcontractor_id, subcontractor_cost, margin_amount
      )
      values (
        'pending_payment', v_offer.class_slug, v_offer.class_title, v_total, v_currency, v_plan,
        v_due, v_remaining,
        v_name, v_phone, v_whatsapp, v_trip,
        coalesce(v_offer.price_source, 'tariff'), v_offer.subcontractor_id,
        v_offer.subcontractor_cost, v_margin
      )
      returning b.id, b.reference, b.public_token
      into v_id, v_reference, v_token;
      exit;
    exception
      when unique_violation then
        if v_attempt >= 5 then
          raise exception 'تعذّر توليد رقم مرجعي فريد للحجز' using hint = 'db-unavailable';
        end if;
        perform set_config('tours.booking_note', 'إنشاء الحجز', true);
    end;
  end loop;

  -- (ز-٠) 0031 — سطور الخدمات **بعد** إدراج الحجز (المفتاح الأجنبي) ومن نفس
  --        اللقطة التي دخلت الإجمالي، داخل المعاملة نفسها.
  if jsonb_array_length(v_x_rows) > 0 then
    insert into public.booking_extras (
      booking_id, extra_id, title_snapshot, qty, unit_price, line_total
    )
    select
      v_id,
      (e.item ->> 'extraId')::uuid,
      e.item ->> 'title',
      (e.item ->> 'qty')::integer,
      (e.item ->> 'unitPrice')::numeric,
      (e.item ->> 'lineTotal')::numeric
    from jsonb_array_elements(v_x_rows) as e(item);
  end if;

  -- (ز) 🔒 تسجيل الاستخدام **داخل نفس المعاملة**: فشلُه يُسقط الحجز كله، فلا
  --     يوجد حجز بسعر مخصوم بلا استخدام مسجَّل، ولا يتجاوز كوبونٌ سقفه لأن
  --     الخاسر في السباق تنهار معاملته بأكملها.
  if v_code is not null then
    perform set_config('tours.discount_clamped',
                       case when v_disc.clamped then 'on' else 'off' end, true);
    perform public.redeem_coupon(v_code, v_id, v_disc.amount, v_phone);
    perform set_config('tours.discount_clamped', '', true);
  end if;

  -- (ز-٢) 0047 — 🔒 وخصمُ النقاط بالمنطق نفسه وللسبب نفسه: القفل والكتابة
  --       داخل معاملة الحجز. فشلُه (رصيدٌ استُهلك في حجزٍ متزامن) يُسقط الحجز
  --       كله، فلا يوجد حجزٌ بسعرٍ مخصومٍ بنقاطٍ لم تُخصم من أحد (D-48).
  if v_loy_ok then
    perform public.redeem_points(v_id, v_phone, v_pts.points, v_pts.amount);
  end if;

  id               := v_id;
  reference        := v_reference;
  public_token     := v_token;
  total            := v_total;
  amount_due       := v_due;
  amount_remaining := v_remaining;
  currency         := v_currency;
  return next;
end;
$$;

comment on function public.create_booking(
  jsonb, jsonb, integer, boolean, numeric, numeric, numeric, text, text, text,
  text, text, text, timestamptz, text, text, timestamptz, integer, jsonb, integer) is
  'تنشئ الحجز وتعيد حساب سعره من quote_price — لا سعرَ يأتي من المستدعي. طبقات السعر بالترتيب: الرحلة ← الكوبون (apply_discount) ← النقاط (apply_points) ← الخدمات (price_extras)، والكتابتان redeem_coupon وredeem_points داخل المعاملة نفسها فيسقط الحجز كله إن فشلت إحداهما (D-48). service_role وحده.';

-- ----------------------------------------------------------------------------
-- (١١) my_loyalty — الرصيد كما يراه **صاحبه** عبر الهاتف المُثبَت (§٣)
--
-- 🔒 `link_source = 'reference'` وحده. والربط بالتوكن **لا يفتح رصيداً**: من
--    أُعيد إليه إرسال رابطِ حجز يرى الرحلة ولا يمسّ نقاطها. وهذا يُسقط بالبناء
--    وراثةَ النقاط برابطٍ مُمرَّر، ومزرعةَ الحسابات (عشرة حسابات على هاتفٍ واحد
--    ترى **الرصيد نفسه** لا عشرة أرصدة)، وثغرةَ `handle_new_user` (الهاتف من
--    `bookings` لا من `profiles.phone`، ولا يُقرأ الأخير في سطرٍ واحد هنا).
--
-- ⚠ ولا `phone_norm` في نوع الإرجاع: الرصيد يُجمَّع عليه في القاعدة، وإخراجه
--   يفتح نافذةً على شكل تطبيعنا للهوية بلا داعٍ (‏`MyLoyaltyView` · §٣).
--
-- و`worth` تُحسب هنا لا في الواجهة (**D-05**): ضربُ النقاط في قيمتها في
-- TypeScript يصنع رقماً ثانياً ينحرف يوم يغيّر المالك القيمة.
-- ----------------------------------------------------------------------------
create or replace function public.my_loyalty()
returns table (
  points        integer,
  worth         numeric,
  currency      text,
  proven_phones integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_n   integer;
  v_pts integer;
  v_cpp numeric;
  v_cur text;
begin
  v_uid := (select auth.uid());
  -- بلا جلسة: صفر صفوف — نفس حارس `my_bookings` مقروءاً لا مستنتَجاً
  if v_uid is null then
    return;
  end if;

  select count(*)::integer, coalesce(sum(a.points_balance), 0)::integer
    into v_n, v_pts
  from (
    select distinct b.phone_norm
    from public.customer_bookings cb
    join public.bookings b on b.id = cb.booking_id
    where cb.profile_id = v_uid
      -- 🔒 إثباتُ ملكية لا حيازة (‏customer-types §٥)
      and cb.link_source = 'reference'
      and b.phone_norm is not null
  ) p
  left join public.loyalty_accounts a on a.phone_norm = p.phone_norm;

  select l.currency_per_point into v_cpp from public.loyalty_config() l;
  select ps.currency into v_cur from public.pricing_settings ps limit 1;

  points   := case when v_n = 0 then 0 else coalesce(v_pts, 0) end;
  worth    := round(points * coalesce(v_cpp, 0), 2);
  currency := coalesce(v_cur, 'EGP');
  -- `null` لا صفر حين لا هاتف مُثبَت: الفرق مقصود في العقد — الأول «لم تربط
  -- حجزاً بإثبات بعد» ويُعرض بدعوةٍ للربط، والثاني «رصيدك صفر» ويُعرض كما هو.
  proven_phones := nullif(v_n, 0);

  return next;
end;
$$;

comment on function public.my_loyalty() is
  'رصيد نقاط صاحب الجلسة — يُجمَّع على هواتفه **المُثبَتة** وحدها (customer_bookings.link_source = reference). 🔒 الربط بالتوكن لا يفتح رصيداً: حيازةُ رابطٍ مُعاد إرساله ليست ملكية (loyalty-types §٣). ولا phone_norm في الإرجاع، وworth تُحسب في القاعدة (D-05). وproven_phones = null لا صفر حين لا هاتف مُثبَت.';

-- ----------------------------------------------------------------------------
-- (١٢) my_loyalty_entries — حركات الرصيد كما يراها صاحبها
--
-- نفس مسار §٣ حرفياً، ونفس الإسقاط الآمن: مرجعُ الحجز يخصّ صاحبه، ولا
-- `phone_norm` ولا معرّفات داخلية.
-- ----------------------------------------------------------------------------
create or replace function public.my_loyalty_entries(p_limit integer default 50)
returns table (
  id                 uuid,
  direction          text,
  points             integer,
  booking_reference  text,
  occurred_at        timestamptz,
  note               text
)
language sql
stable
security definer
set search_path = ''
as $$
  select e.id, e.direction, e.points, b.reference, e.occurred_at, e.note
  from public.loyalty_entries e
  left join public.bookings b on b.id = e.booking_id
  where (select auth.uid()) is not null
    and e.phone_norm in (
      select distinct bb.phone_norm
      from public.customer_bookings cb
      join public.bookings bb on bb.id = cb.booking_id
      where cb.profile_id = (select auth.uid())
        and cb.link_source = 'reference'
        and bb.phone_norm is not null
    )
  order by e.occurred_at desc, e.id desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
$$;

comment on function public.my_loyalty_entries(integer) is
  'حركات نقاط صاحب الجلسة عبر هواتفه المُثبَتة وحدها — نفس مسار my_loyalty. الإسقاط آمن: مرجع الحجز فقط، بلا phone_norm ولا معرّفات داخلية.';

-- ----------------------------------------------------------------------------
-- (١٣) loyalty_reconcile — الرصيد المادّي مشتقٌّ يُطابَق (§٥)
--
-- تُرجع الفروق وحدها: صفر صفوف = الدفتر والرصيد رقمٌ واحد. وأي صفٍّ **عطبٌ
-- يُرفع** لا فارقُ توقيت — الكاتب واحد ويعمل داخل معاملة القيد نفسها.
-- ⚠ service_role وحده: تُرجع أرقام هواتف مع أرصدتها.
-- ----------------------------------------------------------------------------
create or replace function public.loyalty_reconcile()
returns table (
  phone_norm    text,
  materialised  integer,
  ledger_sum    integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce(a.phone_norm, e.phone_norm),
    coalesce(a.points_balance, 0),
    coalesce(e.s, 0)
  from public.loyalty_accounts a
  full join (
    select l.phone_norm, sum(l.points)::integer as s
    from public.loyalty_entries l
    group by l.phone_norm
  ) e on e.phone_norm = a.phone_norm
  where coalesce(a.points_balance, 0) is distinct from coalesce(e.s, 0);
$$;

comment on function public.loyalty_reconcile() is
  'تُرجع كل هاتفٍ اختلف فيه الرصيد المادّي عن مجموع الدفتر — صفر صفوف هو الحالة الصحيحة. أي صفٍّ عطبٌ يُرفع لا فارقُ توقيت (loyalty-types §٥). service_role وحده: هواتف وأرصدة.';

-- ----------------------------------------------------------------------------
-- (١٤) الصلاحيات على الدوال — السحب من الثلاثة ثم المنح الصريح
--
-- 🔒 التذكير الذي كلّف المشروع ثغرة من قبل: الدالة الجديدة تولد ومعها `EXECUTE`
-- ضمني لـPUBLIC ومنحٌ افتراضي لـ`anon`/`authenticated`، و`create or replace`
-- لا يعيد ضبط الصلاحيات. سحب PUBLIC وحده لا يكفي.
--
-- ⚠ و`apply_points` **أخطر من `apply_discount`**: تُرجع أثر الأرضية لمن يتحكم
--   في `p_partner_cost` — وهو الاستنتاج العكسي الذي أغلقته `0011`. فلا تُمنح
--   لدور مستخدم أبداً، تماماً كـ`discount_floor_room`.
-- ----------------------------------------------------------------------------

revoke all on function public.loyalty_config() from public, anon, authenticated;
revoke all on function public.apply_points(text, integer, numeric, text, numeric, numeric)
  from public, anon, authenticated;
revoke all on function public.redeem_points(uuid, text, integer, numeric)
  from public, anon, authenticated;
revoke all on function public.loyalty_reconcile() from public, anon, authenticated;
revoke all on function public.loyalty_entries_append_only() from public, anon, authenticated;
revoke all on function public.loyalty_apply_entry() from public, anon, authenticated;
revoke all on function public.loyalty_on_booking_completed() from public, anon, authenticated;
revoke all on function public.loyalty_on_booking_cancelled() from public, anon, authenticated;
revoke all on function public.create_booking(
  jsonb, jsonb, integer, boolean, numeric, numeric, numeric, text, text, text,
  text, text, text, timestamptz, text, text, timestamptz, integer, jsonb, integer)
  from public, anon, authenticated;
revoke all on function public.my_loyalty() from public, anon;
revoke all on function public.my_loyalty_entries(integer) from public, anon;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.loyalty_config() to service_role';
    execute 'grant execute on function public.apply_points(text, integer, numeric, text, numeric, numeric) to service_role';
    execute 'grant execute on function public.redeem_points(uuid, text, integer, numeric) to service_role';
    execute 'grant execute on function public.loyalty_reconcile() to service_role';
    execute 'grant execute on function public.create_booking(jsonb, jsonb, integer, boolean, numeric, numeric, numeric, text, text, text, text, text, text, timestamptz, text, text, timestamptz, integer, jsonb, integer) to service_role';
    execute 'grant execute on function public.my_loyalty() to service_role';
    execute 'grant execute on function public.my_loyalty_entries(integer) to service_role';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    -- القارئان وحدهما: كلاهما مقيَّدٌ بـ`auth.uid()` وبالهاتف المُثبَت
    execute 'grant execute on function public.my_loyalty() to authenticated';
    execute 'grant execute on function public.my_loyalty_entries(integer) to authenticated';
  end if;
end;
$$;

-- ============================================================================
-- فحص ذاتي — يبني فيكسترته بنفسه، ويحقن العطب لكل توكيدٍ يدّعيه
-- ============================================================================
-- ⚠ **ولا مسار تخطٍّ فيه**: كل ما يُقاس عليه يُنشأ هنا داخل معاملة فرعية تُرجَع
--    بكاملها. فهجرةٌ على نسخةٍ فارغة لا تمرّ خضراء بلا قياسٍ واحد، ولا يبقى
--    للقياس أثرٌ في قاعدةٍ حيّة.
--
-- ⚠ **وكل مِجسٍّ يُفحص قبل أن يُفحص به** (النمط ٩): كاشفُ المنح يُثبَت على منحةٍ
--    قائمة، وكاشفُ الرصيد على رصيدٍ زُرع، وقارئُ الدفتر على قيدٍ وقع للتوّ.
--
-- ── وجدول حقن العطب: لكل توكيدٍ **الطافرُ الذي يدّعي إمساكه** ────────────────
--
-- | # | التوكيد | الطافر المحقون | ما يجب أن يقع |
-- |---|---|---|---|
-- | ١ | الحجز المستبدَل لا ينزل تحت الأرضية | `apply_points` بلا طرح الكوبون من الميزانية | الإجمالي يهبط تحت `min_total` |
-- | ٢ | الربط بالتوكن لا يفتح رصيداً | `my_loyalty` بلا شرط `link_source` | الرصيد يظهر لحاملِ توكن |
-- | ٣ | رحلةٌ مكتملة تسكّ صفَّ كسبٍ واحداً | إسقاط الفهرس الفريد الجزئي | صفُّ كسبٍ ثانٍ يُقبل |
-- | ٤ | الإلغاء بعد الاستبدال يعيد النقاط | `loyalty_on_booking_cancelled` جسمها فارغ | الرصيد لا يعود |
-- | ٥ | `anon` لا ينفّذ شيئاً | منح `redeem_points` لـ`anon` | الكاشف يرفع |
--
-- وبلا هذا الجدول تكون الفحوص كلها **زينةً محتملة**: السؤال الوحيد الذي يفصل
-- هو «لو انعكس السلوك، هل يحمرّ التوكيد؟» — وهنا يُجاب بالتنفيذ لا بالثقة.
-- ============================================================================

do $$
declare
  v_oid       oid;
  v_secdef    boolean;
  v_cfgset    text[];
  v_n         integer;
  v_anon      boolean;
  v_auth      boolean;
  v_bad       text;
  v_cols      text[];
  v_state     text;
  v_hint      text;
  v_ok        boolean;
  -- الفيكسترة
  v_cls       constant uuid := 'c0000000-0000-4000-8000-000000047a01';
  v_slug      constant text := 'l47-probe';
  v_phone     constant text := '01000000471';
  v_norm      text;
  v_user      constant uuid := '00000000-0000-4000-8000-0000000470a1';
  v_user2     constant uuid := '00000000-0000-4000-8000-0000000470a2';
  v_bk        record;
  v_q         record;
  v_id_a      uuid;
  v_id_b      uuid;
  v_coupon    numeric;
  v_ride      numeric;
  v_min       numeric;
  v_room      numeric;
  v_bal0      integer;
  v_bal1      integer;
  v_bal2      integer;
  v_pts       record;
  v_earn      integer;
  v_entry     uuid;
  v_my        record;
  v_seed      uuid;
  v_diff      integer;
begin
  -- ══ (أ) الكتالوج: التوقيع · definer بمسار بحثٍ فارغ · لا منح لدور مستخدم ══
  for v_bad, v_ok in
    select x.sig, x.user_ok
    from (values
      ('public.loyalty_config()',                                              false),
      ('public.apply_points(text, integer, numeric, text, numeric, numeric)',  false),
      ('public.redeem_points(uuid, text, integer, numeric)',                   false),
      ('public.loyalty_reconcile()',                                           false),
      ('public.my_loyalty()',                                                  true),
      ('public.my_loyalty_entries(integer)',                                   true)
    ) as x(sig, user_ok)
  loop
    v_oid := to_regprocedure(v_bad);
    if v_oid is null then
      raise exception '0047: الدالة % غير موجودة — أي مستدعٍ كُتب على توقيعٍ آخر', v_bad;
    end if;

    select p.prosecdef, p.proconfig into v_secdef, v_cfgset
      from pg_proc p where p.oid = v_oid;

    if not v_secdef then
      raise exception '0047: % ليست security definer', v_bad;
    end if;
    -- ⚠ القيمة المخزَّنة `search_path=""` لا `search_path=`: مقارنةُ الشكل الخطأ
    --   تجعل التوكيد يمرّ دائماً أو يفشل دائماً بحسب اتجاهه — قِس لا تخمّن.
    if not ('search_path=""' = any (coalesce(v_cfgset, array[]::text[]))) then
      raise exception '0047: % بلا search_path فارغ (القيمة: %) — دالة definer بمسارٍ موروث تُخطَف بجدولٍ مزروع',
        v_bad, coalesce(array_to_string(v_cfgset, '، '), '(بلا)');
    end if;

    v_anon := coalesce((select has_function_privilege(r.oid, v_oid, 'execute')
                          from pg_roles r where r.rolname = 'anon'), false);
    v_auth := coalesce((select has_function_privilege(r.oid, v_oid, 'execute')
                          from pg_roles r where r.rolname = 'authenticated'), false);

    -- 🔒 التوكيد ٥ — `anon` لا ينفّذ شيئاً من محرّك الولاء. **بلا استثناء**.
    if v_anon then
      raise exception '0047: 🔴 % ممنوحة لـanon — الزائر ينفّذ من محرّك الولاء', v_bad;
    end if;
    if v_auth and not v_ok then
      raise exception '0047: 🔴 % ممنوحة لـauthenticated — وكلُّ متعهدٍ وكلُّ عميلٍ مسجَّل واحدٌ منهم (D-20)، وهي تكشف أثر الأرضية لمن يتحكم في التكلفة (0011)',
        v_bad;
    end if;
    if v_ok and not v_auth then
      raise exception '0047: % غير ممنوحة لـauthenticated — قارئُ الرصيد لا يبلغه صاحبه', v_bad;
    end if;
  end loop;

  -- مِجسُّ المِجسّ لكاشف المنح: منحةٌ قائمة **يجب** أن تُرى، وإلا كان «لا منح»
  -- جهلَ الكاشف لا نظافةَ القاعدة (النمط ٩).
  if not coalesce((select has_function_privilege(r.oid,
        to_regprocedure('public.my_loyalty()'), 'execute')
        from pg_roles r where r.rolname = 'authenticated'), false) then
    raise exception '0047: كاشف المنح لا يرى منحةً قائمة — الفحص نفسه معطوب';
  end if;

  -- ══ (ب) الأعمدة الممنوعة لا تظهر في نوع إرجاع أي قارئ عميل ═══════════════
  -- عينُ `LOYALTY_FORBIDDEN_COLUMNS` في lib/loyalty-types.ts
  select string_agg(distinct t.name, '، ') into v_bad
  from (
    select p.proname, unnest(coalesce(p.proargnames, array[]::text[])) as name
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('my_loyalty', 'my_loyalty_entries')
  ) t
  where t.name = any (array['subcontractor_cost', 'margin_amount',
                            'subcontractor_id', 'phone_norm']);
  if v_bad is not null then
    raise exception '0047: 🔴 عمودٌ ممنوع في نوع إرجاع قارئ العميل: %', v_bad;
  end if;
  -- مِجسُّ المِجسّ: الكاشف يقرأ الأسماء فعلاً (وإلا كان «لا ممنوع» فراغاً)
  select count(*)::integer into v_n
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'my_loyalty'
    and 'proven_phones' = any (coalesce(p.proargnames, array[]::text[]));
  if v_n <> 1 then
    raise exception '0047: كاشف أسماء الإرجاع لا يرى proven_phones — الفحص نفسه معطوب';
  end if;

  -- ══ (ج) البذرة مطفأة — وهو ما يمنع سكّ التزامٍ قبل قرار المالك (§٦) ═══════
  select count(*)::integer into v_n from public.loyalty_settings where enabled;
  if v_n <> 0 then
    raise exception '0047: 🔴 loyalty_settings مبذورة مفعَّلة — النمط ٧: الافتراضي هو ما سيعمل في الإنتاج';
  end if;

  -- ══ (د) القياس الحيّ كله داخل معاملةٍ فرعية تُرجَع ═════════════════════════
  begin
    -- ── (د-١) الفيكسترة: إعدادات معلومة · فئةٌ اختبارية · مستخدمان ──────────
    update public.loyalty_settings
       set enabled = true, points_per_currency = 1, currency_per_point = 0.5,
           min_redeem_points = 10, max_redeem_percent = 90;
    update public.discount_settings
       set enabled = true, max_percent = 90,
           min_margin_percent_after_discount = 10,
           min_margin_amount_after_discount = 50;

    -- فئةٌ مفعّلة كي يرجعها `quote_price`، وتعريفةٌ **سخيّة عمداً** كي تتسع
    -- الميزانية للطبقتين معاً: قياسُ الاقتسام يحتاج ما يُقتسم. (وهي داخل معاملة
    -- تُرجَع، فلا تظهر في أي تسعيرٍ حيّ ولو للحظة ملتزمة.)
    insert into public.vehicle_classes (id, slug, title, capacity, active, sort)
    values (v_cls, v_slug, '0047 فئة فحص الولاء', 1, true, 9047);
    insert into public.tariffs (class_id, per_km, base_fee, min_price,
                                waiting_hour_price, round_trip_factor)
    values (v_cls, 200, 1000, 0, 0, 1.8);

    insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                            created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
    values
      (v_user,  '00000000-0000-0000-0000-000000000000', 'authenticated',
       'authenticated', '0047_probe_a@example.invalid', 'x', now(), now(),
       '{}'::jsonb, '{"full_name": "0047 مُثبِت"}'::jsonb),
      (v_user2, '00000000-0000-0000-0000-000000000000', 'authenticated',
       'authenticated', '0047_probe_b@example.invalid', 'x', now(), now(),
       '{}'::jsonb, '{"full_name": "0047 حائزُ توكن"}'::jsonb);

    if not exists (select 1 from public.profiles p where p.id = v_user)
       or not exists (select 1 from public.profiles p where p.id = v_user2) then
      raise exception '0047: لم يتكوّن ملفّ لأحد المستخدمين — handle_new_user لا تعمل والقياس لا يقيس شيئاً';
    end if;

    v_norm := public.normalize_phone(v_phone);
    if v_norm is null then
      raise exception '0047: هاتف الفيكسترة لا يُطبَّع — القياس بلا وعاء رصيد';
    end if;

    -- ── (د-٢) رحلةٌ أولى تكتمل ⇒ الكسب يُسكّ بمُشغّلٍ لا بنداء ───────────────
    --     إحداثيات صحراوية نائية: لا متعهد يغطيها فالتسعير بالتعريفة حتماً،
    --     ولا يتأثر القياس بنجاح المشروع (النمط ٦).
    select * into v_bk from public.create_booking(
      jsonb_build_object('label', '0047 مبدأ', 'lat', 25.0, 'lng', 27.5),
      jsonb_build_object('label', '0047 منتهى', 'lat', 24.5, 'lng', 28.2),
      1, false, 0, 100, 90, 'estimate', v_slug, 'full',
      '0047 فحص الولاء', v_phone, null, now() + interval '3 days',
      'LOYALTY_MIGRATION_PROBE', null, null, 0, null, 0);

    v_id_a := v_bk.id;
    if v_id_a is null then
      raise exception '0047: لم يُنشأ حجز القياس — الفيكسترة لا تسعّر';
    end if;

    -- مِجسُّ المِجسّ: قبل الاكتمال لا نقاط. وبدونه يصير «ظهرت نقاط» بلا دلالة
    -- على أن **الاكتمال** هو ما سكّها.
    select coalesce(a.points_balance, 0) into v_bal0
      from public.loyalty_accounts a where a.phone_norm = v_norm;
    if coalesce(v_bal0, 0) <> 0 then
      raise exception '0047: رصيدٌ قبل أي اكتمال (%) — الفيكسترة ملوّثة', v_bal0;
    end if;

    update public.bookings set status = 'under_review' where id = v_id_a;
    update public.bookings set status = 'confirmed'    where id = v_id_a;
    update public.bookings set status = 'completed'    where id = v_id_a;

    select count(*)::integer into v_earn
      from public.loyalty_entries e
     where e.booking_id = v_id_a and e.direction = 'earn';
    if v_earn <> 1 then
      raise exception '0047: الاكتمال سكّ % صفَّ كسبٍ لا واحداً — المُشغّل لا يعمل أو يعمل مرتين', v_earn;
    end if;

    select coalesce(a.points_balance, 0) into v_bal1
      from public.loyalty_accounts a where a.phone_norm = v_norm;
    if coalesce(v_bal1, 0) <= 0 then
      raise exception '0047: الرصيد بعد الاكتمال % — مُشغّل الرصيد لا يكتب', coalesce(v_bal1, 0);
    end if;

    -- 🔒 التوكيد ٣ — رحلةٌ واحدة، صفُّ كسبٍ واحد **مهما تعدّد الربط**.
    --    يُربط الحجز بحسابين (إثباتاً وحيازةً) ثم يُقاس العدد ثانيةً.
    insert into public.customer_bookings (profile_id, booking_id, link_source)
    values (v_user, v_id_a, 'reference'), (v_user2, v_id_a, 'token');

    select count(*)::integer into v_earn
      from public.loyalty_entries e
     where e.booking_id = v_id_a and e.direction = 'earn';
    if v_earn <> 1 then
      raise exception '0047: 🔴 صار % صفَّ كسبٍ بعد ربط الحجز بحسابين — النقطة تُسكّ على الحساب لا على الحجز (§٤)', v_earn;
    end if;

    -- والحارس البنيوي نفسه: إدراجٌ ثانٍ **مباشر** يجب أن يرفضه الفهرس الفريد
    v_state := null;
    begin
      insert into public.loyalty_entries (phone_norm, direction, points, booking_id, note)
      values (v_norm, 'earn', 5, v_id_a, '0047 كسبٌ ثانٍ');
      v_state := '(قُبل)';
    exception when others then
      get stacked diagnostics v_state = returned_sqlstate;
    end;
    if v_state <> '23505' then
      raise exception '0047: 🔴 صفُّ كسبٍ ثانٍ على الحجز نفسه انتهى بـ«%» لا 23505 — الفهرس الفريد الجزئي غائب، وهو نموذج الأمان لا تحسين (§٤)', v_state;
    end if;

    -- ── (د-٣) 🔒 التوكيد ١ — الحجز المستبدَل لا ينزل تحت الأرضية ─────────────
    --     ويُبنى **مع كوبون** قصداً: الميزانية الواحدة تُختبر باقتسامها فعلاً،
    --     لا بطبقةٍ وحيدة لا شريك لها.
    -- ⚠ قيمة الكوبون **تُشتق من الميزانية المقيسة** لا تُحفر رقماً: أرضيةُ البث
    --   و`min_margin_*` إعداداتٌ يعايرها المالك، وكوبونٌ بنسبةٍ محفورة كان
    --   سيبتلع الميزانية كلها على قاعدةٍ وأرضيتُها أعلى — فيُرفض الاستبدال
    --   ويسقط الفحص **لسببٍ لا علاقة له بما يقيس** (اتفاقية ٨).
    perform set_config('tours.pricing_internals', 'on', true);
    select q.total, q.subcontractor_cost into v_q
      from public.quote_price(100, 1, false, 0, 25.0, 27.5, 24.5, 28.2, 0) q
     where q.class_slug = v_slug;
    perform set_config('tours.pricing_internals', '', true);

    if v_q.total is null then
      raise exception '0047: quote_price لا ترجع فئة القياس — الفيكسترة لا تسعّر';
    end if;

    select f.room into v_room
      from public.discount_floor_room(v_q.total, v_slug, v_q.subcontractor_cost) f;

    -- مِجسُّ المِجسّ: ميزانيةٌ لا تتسع للطبقتين تجعل القياس التالي بلا معنى
    if coalesce(v_room, 0) < 60 then
      raise exception '0047: ميزانية الأرضية % لا تتسع لطبقتين — القياس كان سيقع على استبدالٍ مرفوض لا على اقتسام', coalesce(v_room, 0);
    end if;

    v_coupon := floor(v_room / 3);
    insert into public.coupons (code, kind, value, enabled, note)
    values ('ZZL0047', 'amount', v_coupon, true, 'LOYALTY_MIGRATION_PROBE');

    -- رصيدٌ سخيّ كي يكون **السقف هو الأرضية** لا قلّة النقاط
    insert into public.loyalty_entries (phone_norm, direction, points, note)
    values (v_norm, 'adjust', 100000, '0047 رصيدٌ مزروع للقياس');

    select * into v_bk from public.create_booking(
      jsonb_build_object('label', '0047 مبدأ', 'lat', 25.0, 'lng', 27.5),
      jsonb_build_object('label', '0047 منتهى', 'lat', 24.5, 'lng', 28.2),
      1, false, 0, 100, 90, 'estimate', v_slug, 'full',
      '0047 فحص الولاء', v_phone, null, now() + interval '3 days',
      'LOYALTY_MIGRATION_PROBE', 'ZZL0047', null, 0, null, 100000);

    v_id_b := v_bk.id;
    if v_id_b is null then
      raise exception '0047: لم يُنشأ الحجز المستبدَل — لا شيء يُقاس عليه';
    end if;

    -- الأرضية تُقرأ من `discount_floor_room` نفسها لا من رقمٍ محفور: تغييرُ
    -- المالك لأي معيار لا يُسقط التوكيد (اتفاقية ٨).
    select (b.trip -> 'discount' ->> 'totalBefore')::numeric into v_ride
      from public.bookings b where b.id = v_id_b;
    if v_ride is null then
      raise exception '0047: لقطة الخصم بلا totalBefore — أساس قياس الأرضية مفقود';
    end if;

    select f.min_total, f.room into v_min, v_room
      from public.discount_floor_room(v_ride, v_slug,
             (select b.subcontractor_cost from public.bookings b where b.id = v_id_b)) f;

    if (select b.total from public.bookings b where b.id = v_id_b) < v_min then
      raise exception '0047: 🔴 إجمالي الحجز المستبدَل % تحت الأرضية % — نقضُ D-16',
        (select b.total from public.bookings b where b.id = v_id_b), v_min;
    end if;

    -- والاستبدال وقع فعلاً، وإلا كان التوكيد أعلاه فوق مسارٍ ميت
    if (select b.trip -> 'loyalty' ->> 'points' from public.bookings b where b.id = v_id_b) is null then
      raise exception '0047: الحجز «المستبدَل» بلا لقطة نقاط — التوكيد كان سيمرّ فوق حجزٍ عادي';
    end if;
    select count(*)::integer into v_n
      from public.loyalty_entries e
     where e.booking_id = v_id_b and e.direction = 'redeem';
    if v_n <> 1 then
      raise exception '0047: قيود الاستبدال على الحجز % لا واحد', v_n;
    end if;

    -- ⚠ ومِجسٌّ ثالث: الكوبون **أخذ من الميزانية فعلاً**، وإلا كانت «ميزانيةٌ
    --   واحدة» دعوى بلا اقتسام
    if coalesce((select (b.trip -> 'discount' ->> 'amount')::numeric
                   from public.bookings b where b.id = v_id_b), 0) <= 0 then
      raise exception '0047: الكوبون لم يخصم شيئاً — الميزانية لم تُقتسم فالتوكيد بلا معنى';
    end if;

    -- ── (د-٤) 🔒 التوكيد ٤ — الإلغاء بعد الاستبدال يعيد النقاط ───────────────
    select coalesce(a.points_balance, 0) into v_bal1
      from public.loyalty_accounts a where a.phone_norm = v_norm;

    update public.bookings set status = 'cancelled' where id = v_id_b;

    select coalesce(a.points_balance, 0) into v_bal2
      from public.loyalty_accounts a where a.phone_norm = v_norm;

    if v_bal2 <= v_bal1 then
      raise exception '0047: 🔴 الإلغاء بعد الاستبدال لم يُعد النقاط (% ← %) — العميل يدفع ثمن رحلةٍ لم تقع',
        v_bal1, v_bal2;
    end if;
    if not exists (
      select 1 from public.loyalty_entries e
       where e.booking_id = v_id_b and e.direction = 'reverse'
         and e.reverses_entry_id is not null
    ) then
      raise exception '0047: النقاط عادت بلا قيدٍ عاكس يشير إلى أصله — الدفتر لا يُفسَّر بعد سنة (§٥)';
    end if;

    -- ── (د-٥) 🔒 التوكيد ٢ — الربط بالتوكن لا يفتح رصيداً ────────────────────
    --     يُقاس **بنداء الدالة بهويّة كلٍّ من الحسابين**، لا بقراءة شرطها.
    perform set_config('request.jwt.claim.sub', v_user::text, true);
    if (select auth.uid()) is distinct from v_user then
      raise exception '0047: الهوية المحقونة غير فعّالة — القياس الحيّ لا يقيس شيئاً';
    end if;
    execute 'set local role authenticated';

    select * into v_my from public.my_loyalty();
    if v_my.proven_phones is null or v_my.proven_phones < 1 then
      raise exception '0047: صاحب الربط المُثبَت يرى proven_phones = % — الإثبات لا يفتح رصيداً أصلاً',
        coalesce(v_my.proven_phones::text, '(null)');
    end if;
    if v_my.points <= 0 then
      raise exception '0047: صاحب الربط المُثبَت يرى رصيداً % — القياس التالي كان سيمرّ فوق صفرين متساويين', v_my.points;
    end if;
    -- و`worth` تُحسب في القاعدة لا في الواجهة (D-05)
    if v_my.worth is distinct from round(v_my.points * 0.5, 2) then
      raise exception '0047: worth «%» لا يساوي النقاط × قيمة النقطة — الحساب ليس في القاعدة',
        v_my.worth;
    end if;

    execute 'reset role';
    perform set_config('request.jwt.claim.sub', v_user2::text, true);
    execute 'set local role authenticated';

    select * into v_my from public.my_loyalty();
    if v_my.proven_phones is not null then
      raise exception '0047: 🔴 حاملُ التوكن يرى proven_phones = % — حيازةُ رابطٍ مُعاد إرساله فتحت رصيداً (§٣)',
        v_my.proven_phones;
    end if;
    if v_my.points <> 0 then
      raise exception '0047: 🔴 حاملُ التوكن يرى % نقطة — وراثةُ النقاط برابطٍ مُمرَّر', v_my.points;
    end if;

    -- والدفتر كذلك محجوبٌ عنه: لا حركاتٍ لمن لم يُثبت
    select count(*)::integer into v_n from public.my_loyalty_entries(50);
    if v_n <> 0 then
      raise exception '0047: 🔴 حاملُ التوكن يقرأ % حركة من دفتر غيره', v_n;
    end if;

    -- ولا يقرأ الجداول مباشرةً ولو مُنح `select`: السياسة هي الحارس
    select count(*)::integer into v_n from public.loyalty_entries;
    if v_n <> 0 then
      raise exception '0047: 🔴 مستخدمٌ غير مشرف قرأ % صفاً من دفتر الولاء — سياسة is_admin لا تُنفَّذ', v_n;
    end if;

    execute 'reset role';
    perform set_config('request.jwt.claim.sub', '', true);

    -- ── (د-٦) الدفتر مُلحَقٌ فقط: التعديل والحذف يُرفعان ─────────────────────
    select e.id into v_entry from public.loyalty_entries e
     where e.booking_id = v_id_a and e.direction = 'earn' limit 1;

    v_state := null;
    begin
      update public.loyalty_entries set points = 1 where id = v_entry;
      v_state := '(قُبل)';
    exception when others then
      get stacked diagnostics v_hint = pg_exception_hint;
      v_state := coalesce(v_hint, '(بلا تلميح)');
    end;
    if v_state <> 'append-only' then
      raise exception '0047: 🔴 تعديل قيدٍ في دفتر الولاء انتهى بـ«%» — الدفتر ليس مُلحَقاً فقط', v_state;
    end if;

    v_state := null;
    begin
      delete from public.loyalty_entries where id = v_entry;
      v_state := '(قُبل)';
    exception when others then
      get stacked diagnostics v_hint = pg_exception_hint;
      v_state := coalesce(v_hint, '(بلا تلميح)');
    end;
    if v_state <> 'append-only' then
      raise exception '0047: 🔴 حذف قيدٍ من دفتر الولاء انتهى بـ«%» — تاريخٌ محذوف لا يُدقَّق', v_state;
    end if;

    -- ── (د-٧) المطابقة: الرصيد المادّي = مجموع الدفتر ────────────────────────
    select count(*)::integer into v_n from public.loyalty_reconcile();
    if v_n <> 0 then
      raise exception '0047: 🔴 % هاتفاً اختلف رصيده المادّي عن مجموع دفتره — مصدران لرقمٍ واحد (النمط ٨)', v_n;
    end if;
    -- مِجسُّ المِجسّ: الكاشف يمسك فرقاً حين يوجد. يُزرع فرقٌ في معاملةٍ فرعية
    -- تُرجَع فوراً — وبدونه يكون «صفر فروق» عمى الكاشف لا صحة الأرصدة.
    begin
      update public.loyalty_accounts set points_balance = points_balance + 7
       where phone_norm = v_norm;
      select count(*)::integer into v_diff from public.loyalty_reconcile();
      raise exception '0047_RECON_ROLLBACK';
    exception when others then
      if sqlerrm <> '0047_RECON_ROLLBACK' then raise; end if;
    end;
    if v_diff <> 1 then
      raise exception '0047: كاشف المطابقة لم يرَ فرقاً مزروعاً (رأى % صفاً) — «صفر فروق» كان عماه لا صحّتها', v_diff;
    end if;

    -- ══ (هـ) 🔒 حقن العطب — بلا هذا القسم كل ما سبق قد يكون زينة ═════════════
    -- السؤال الوحيد الذي يفصل: **لو انعكس السلوك، هل يحمرّ التوكيد؟**

    -- ── الطافر ١: `apply_points` تنسى طرح الكوبون من الميزانية ───────────────
    begin
      create or replace function public.apply_points(
        p_phone text, p_points integer, p_ride_total numeric, p_class_slug text,
        p_partner_cost numeric, p_coupon_amount numeric
      ) returns table (applied boolean, points integer, amount numeric,
                       total_after numeric, clamped boolean, rejection text)
      language plpgsql stable security definer set search_path = '' as $mut$
      declare v_cfg record; v_room numeric; v_after numeric; v_use integer;
      begin
        -- نسخةٌ مخرَّبة عمداً: الميزانية كاملةً وكأن الكوبون لم يأخذ منها شيئاً
        select * into v_cfg from public.loyalty_config();
        v_after := round(coalesce(p_ride_total,0) - coalesce(p_coupon_amount,0), 2);
        select r.room into v_room
          from public.discount_floor_room(p_total := coalesce(p_ride_total,0),
                                          p_class_slug := p_class_slug,
                                          p_partner_cost := p_partner_cost) r;
        v_use := floor(v_room / v_cfg.currency_per_point)::integer;
        applied := v_use > 0; points := greatest(v_use, 0);
        amount := floor(greatest(v_use,0) * v_cfg.currency_per_point);
        total_after := round(v_after - amount, 2);
        clamped := true; rejection := null;
        return next;
      end;
      $mut$;

      select * into v_pts from public.apply_points(
        v_phone, 100000, v_ride, v_slug,
        (select b.subcontractor_cost from public.bookings b where b.id = v_id_b),
        coalesce((select (b.trip -> 'discount' ->> 'amount')::numeric
                    from public.bookings b where b.id = v_id_b), 0));

      -- والمقياس هو **نفس التوكيد** في (د-٣): الناتج تحت الأرضية المقروءة
      if v_pts.total_after >= v_min then
        raise exception '0047: الطافر ١ لم يخترق الأرضية (% ≥ %) — فتوكيد الأرضية لا يفرّق بين ميزانيةٍ مقتسمة وميزانيتين، وهو زينة',
          v_pts.total_after, v_min;
      end if;
      raise exception '0047_MUT1_ROLLBACK';
    exception when others then
      if sqlerrm <> '0047_MUT1_ROLLBACK' then raise; end if;
    end;

    -- ── الطافر ٢: `my_loyalty` بلا شرط `link_source` ─────────────────────────
    begin
      create or replace function public.my_loyalty()
      returns table (points integer, worth numeric, currency text, proven_phones integer)
      language plpgsql stable security definer set search_path = '' as $mut$
      declare v_uid uuid; v_n integer; v_pts integer;
      begin
        v_uid := (select auth.uid());
        if v_uid is null then return; end if;
        select count(*)::integer, coalesce(sum(a.points_balance),0)::integer
          into v_n, v_pts
        from (select distinct b.phone_norm from public.customer_bookings cb
               join public.bookings b on b.id = cb.booking_id
              where cb.profile_id = v_uid and b.phone_norm is not null) p
        left join public.loyalty_accounts a on a.phone_norm = p.phone_norm;
        points := coalesce(v_pts,0); worth := 0; currency := 'EGP';
        proven_phones := nullif(v_n, 0);
        return next;
      end;
      $mut$;

      perform set_config('request.jwt.claim.sub', v_user2::text, true);
      select * into v_my from public.my_loyalty();

      if v_my.points = 0 and v_my.proven_phones is null then
        raise exception '0047: الطافر ٢ لم يفتح رصيداً لحاملِ التوكن — فتوكيد «التوكن لا يفتح رصيداً» لا يفرّق بين مصدرَي الربط، وهو زينة';
      end if;
      raise exception '0047_MUT2_ROLLBACK';
    exception when others then
      perform set_config('request.jwt.claim.sub', '', true);
      if sqlerrm <> '0047_MUT2_ROLLBACK' then raise; end if;
    end;

    -- ── الطافر ٣: إسقاط الفهرس الفريد الجزئي ─────────────────────────────────
    begin
      drop index if exists public.loyalty_entries_earn_booking_key;
      v_state := null;
      begin
        insert into public.loyalty_entries (phone_norm, direction, points, booking_id, note)
        values (v_norm, 'earn', 5, v_id_a, '0047 كسبٌ ثانٍ بعد إسقاط الفهرس');
        v_state := '(قُبل)';
      exception when others then
        get stacked diagnostics v_state = returned_sqlstate;
      end;
      if v_state <> '(قُبل)' then
        raise exception '0047: الطافر ٣ — الكسب الثاني رُفض بـ«%» رغم إسقاط الفهرس، فالرفض في (د-٢) لم يكن الفهرس بل شيءٌ آخر',
          v_state;
      end if;
      raise exception '0047_MUT3_ROLLBACK';
    exception when others then
      if sqlerrm <> '0047_MUT3_ROLLBACK' then raise; end if;
    end;

    -- ── الطافر ٤: مُشغّل الإلغاء بجسمٍ فارغ ──────────────────────────────────
    begin
      create or replace function public.loyalty_on_booking_cancelled()
      returns trigger language plpgsql security definer set search_path = '' as $mut$
      begin
        return null;   -- لا يعيد شيئاً — نسخةٌ مخرَّبة عمرها أسطر
      end;
      $mut$;

      select coalesce(a.points_balance, 0) into v_bal1
        from public.loyalty_accounts a where a.phone_norm = v_norm;

      select * into v_bk from public.create_booking(
        jsonb_build_object('label', '0047 مبدأ', 'lat', 25.0, 'lng', 27.5),
        jsonb_build_object('label', '0047 منتهى', 'lat', 24.5, 'lng', 28.2),
        1, false, 0, 100, 90, 'estimate', v_slug, 'full',
        '0047 فحص الولاء', v_phone, null, now() + interval '3 days',
        'LOYALTY_MIGRATION_PROBE', null, null, 0, null, 20);

      update public.bookings set status = 'cancelled' where id = v_bk.id;

      select coalesce(a.points_balance, 0) into v_bal2
        from public.loyalty_accounts a where a.phone_norm = v_norm;

      if v_bal2 >= v_bal1 then
        raise exception '0047: الطافر ٤ أعاد النقاط رغم تخريب المُشغّل (% ← %) — فالإعادة تقع من مكانٍ آخر وتوكيدُ (د-٤) لا يحرس هذا المُشغّل',
          v_bal1, v_bal2;
      end if;
      raise exception '0047_MUT4_ROLLBACK';
    exception when others then
      if sqlerrm <> '0047_MUT4_ROLLBACK' then raise; end if;
    end;

    -- ── الطافر ٥: منح `redeem_points` لـ`anon` ───────────────────────────────
    -- (والدور قد لا يوجد أصلاً على قاعدةٍ خارج Supabase — فغيابه ليس منحاً)
    if not exists (select 1 from pg_roles where rolname = 'anon') then
      raise notice '  ↳ 0047: دور anon غير موجود — الطافر ٥ متخطّى، وتوكيده أعلاه بلا معنى على هذه القاعدة';
    else
    begin
      execute 'grant execute on function public.redeem_points(uuid, text, integer, numeric) to anon';
      v_anon := coalesce((select has_function_privilege(r.oid,
                  to_regprocedure('public.redeem_points(uuid, text, integer, numeric)'),
                  'execute') from pg_roles r where r.rolname = 'anon'), false);
      if not v_anon then
        raise exception '0047: الطافر ٥ — مُنحت redeem_points لـanon والكاشف لا يراها، فتوكيد «anon لا ينفّذ شيئاً» عمىً لا حراسة';
      end if;
      raise exception '0047_MUT5_ROLLBACK';
    exception when others then
      if sqlerrm <> '0047_MUT5_ROLLBACK' then raise; end if;
    end;
    end if;

    -- كل ما سبق — الإعدادات والفئة والمستخدمان والحجوزات والقيود والدوال
    -- المخرَّبة والمنح المزروع — يختفي هنا معاً
    raise exception '0047_PROBE_ROLLBACK';
  exception
    when others then
      execute 'reset role';
      perform set_config('request.jwt.claim.sub', '', true);
      if sqlerrm <> '0047_PROBE_ROLLBACK' then raise; end if;
  end;

  raise notice '✔ 0047: محرّك الولاء — الكسب مُشغّلٌ على الاكتمال وصفٌّ واحد لكل رحلة (والفهرس هو الحكم: إسقاطه يقبل الثاني)، والاستبدال يقتسم ميزانيةَ الأرضية مع الكوبون فلا ينزل الإجمالي تحتها (وتخريب القسمة يخترقها)، والإلغاء يعيد النقاط بقيدٍ عاكس (وتخريب المُشغّل يمنعها)، والربط بالتوكن لا يفتح رصيداً (وإسقاط الشرط يفتحه)، والدفتر مُلحَقٌ فقط ويطابق أرصدته، وanon لا ينفّذ حرفاً';
end;
$$;
