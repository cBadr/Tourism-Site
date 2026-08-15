-- ============================================================================
-- 0051 — الرحلة الفاشلة: حالةٌ نهائية، وكتالوج أسبابٍ مُدار، وأثرٌ مالي، وعكسُ نقاط
--
-- المرجع الحاكم: docs/phase-briefs/FAILED-TRIPS-AND-PARTNER-ALERTS.md (§١-ب … §١-هـ)
-- وقرارات بدر 2026-08-15 في docs/phase-briefs/BOOKING-JOURNEY-WAVES.md §(٢).
-- **قراراتُ مالكٍ لا اقتراحاتُ جلسة** — من أراد نقضها فليعُد إلى الموجزين.
--
-- ══════════════════════════════════════════════════════════════════════════
--  ما قِيس على القاعدة الحيّة قبل كتابة حرف (‏D-58: من `pg_get_functiondef`)
-- ══════════════════════════════════════════════════════════════════════════
--
--   • `booking_transition_allowed` عشرة أزواج، **ولا مخرج من `completed`**.
--   • `bookings_status_check` ست حالات، لا سابعة.
--   • `loyalty_on_booking_cancelled` تعكس **كل** قيدٍ غير معكوس للحجز — فالآلية
--     موجودة، والمطلوب **تفويضٌ إليها لا استنساخٌ لها** (القاعدة الذهبية ١٢).
--   • `ledger_on_booking_completed` تكتب رجلين: `earned` (التزامٌ علينا) و
--     `collected` (نقدٌ قبضه المتعهد من العميل، فهو **دينٌ لنا عليه**).
--   • `record_partner_adjustment(sub, role, amount, at, note)` قائمةٌ منذ
--     المرحلة ٧، وتقبل `earned` أو `collected` بمبلغٍ **موجب** فقط.
--   • `v_partner_settlements`: `net_due = earned − collected − paid + received`.
--   • ٢٥٩ حجزاً مكتملاً، و**صفرٌ منها بلا صفِّ `booking_events` باكتماله** —
--     فزمنُ الاكتمال مقروءٌ من السجل لا مخمَّناً من `updated_at`.
--
-- ══════════════════════════════════════════════════════════════════════════
--  🔴 «ألّا يُدفع» على رحلةٍ مرّت بالتسوية — الجواب صريحاً
-- ══════════════════════════════════════════════════════════════════════════
--
-- سؤالٌ لا يجوز أن يُترك ضمنياً، لأن الرجلين ليستا شيئاً واحداً:
--
--   (أ) **رجل `earned`** — «مستحق تنفيذ الرحلة». هذه هي **الدفع**. و«ألّا
--       يُدفع» = **عكسُ هذا القيد** بـ`reverse_ledger_entry`، فينزل `net_due`
--       بمقدار المستحق. وإن كنّا **صرفنا له سلفاً** (رجل `paid`) فالعكس يهبط
--       بـ`net_due` إلى **السالب** — أي يصير مديناً لنا، وتحصيلُه مسارٌ قائم
--       (`record_partner_settlement` ودورُ `received`). لا مسار مال ثانٍ يُخترع.
--
--   (ب) **رجل `collected`** — نقدٌ قبضه المتعهد من العميل، أي **مالنا في يده**.
--       🔒 **لا تُعكس** مع الفشل. عكسُها يقول «لم يقبض شيئاً» فيهبه ديناً
--       حقيقياً، والرحلة الفاشلة تجعل هذا الدين **أوجب** لا أسقط: العميل
--       يُردّ إليه ماله كاملاً (§١-ج)، فما في يد المتعهد يعود إلينا.
--       ومن ثبت لديه أن النقد لم يُقبض أصلاً فله مسارٌ قائم ومدقَّق:
--       `reverse_ledger_entry` على قيد التحصيل بعينه — **قرارٌ بشري صريح**
--       لا أثرٌ جانبيٌّ صامت لتغيير حالة.
--
--   (ج) و`assigned ⇒ failed` **لا رجل لها أصلاً** — `ledger_on_booking_completed`
--       لم تعمل قط. فـ«لا شيء» تعني حرفياً لا قيد، و«ادفع» تعني **إنشاء**
--       المستحق بـ`record_partner_adjustment(…, 'earned', …)` لا عكسَ شيء.
--
--   (د) و**الخصم** في الاتجاه الآخر: `record_partner_adjustment(…, 'collected', …)`
--       يرفع `collected` فينزل `net_due` — وهو بالضبط معنى «خُصم منه».
--       والدالة ترفض السالب منذ `0029`، فالخصم يُكتب موجباً على الدور الصحيح
--       لا سالباً على الدور المعاكس.
--
-- ── جدول الأثر المالي كما يُنفَّذ ───────────────────────────────────────────
--
--   | من        | الإجراء | ما يقع في الدفتر                       | الرمز                  |
--   |-----------|---------|-----------------------------------------|------------------------|
--   | assigned  | none    | لا شيء (لا رجل كُتبت)                   | none                   |
--   | assigned  | pay     | إنشاء `earned` بمستحق الإسناد           | payout-created         |
--   | assigned  | deduct  | `collected` بمبلغ الخصم                 | deduct                 |
--   | completed | pay     | لا شيء — التسوية تبقى كما كُتبت          | payout-kept            |
--   | completed | none    | عكس `earned` (و`collected` تبقى)         | payout-reversed        |
--   | completed | deduct  | عكس `earned` + `collected` بمبلغ الخصم   | payout-reversed+deduct |
--
-- ══════════════════════════════════════════════════════════════════════════
--  ولماذا `failed` **نهائية** ولا تعود إلى الطابور (§١-ج)
-- ══════════════════════════════════════════════════════════════════════════
--
-- طُرح على بدر بديلُ إعادة البث فاختار الموت. والعميل يُردّ إليه ماله ويحجز من
-- جديد. فلا زوج ينطلق من `failed` في `booking_transition_allowed`، و`dispatches`
-- تبقى على `assigned` شاهدةً على من كان مُسنَداً — لا تُصفَّر فيضيع الأثر.
--
-- ══════════════════════════════════════════════════════════════════════════
--  وفخاخ الكتالوج المُدار — مُغلقةٌ في هذه الهجرة نفسها لا بعدها
-- ══════════════════════════════════════════════════════════════════════════
--
--   ١. **إعادة التسمية تُعيد كتابة تقارير العام الماضي** ⇐ التسمية والإجراء
--      الافتراضي **يُلقَطان في صفّ الفشل** لحظة وقوعه، كما تُلقَط لقطة السعر في
--      `create_booking` ولقطة عنوان الخدمة في `booking_extras.title_snapshot`.
--   ٢. **حذف سببٍ مستعمَل** ⇐ `on delete restrict` من `booking_failures` إلى
--      `failure_reasons`. حاجزٌ بنيوي لا شاشةٌ تعِد.
--   ٣. **الافتراضي يتغيّر بأثرٍ رجعي** ⇐ `action_taken` مخزَّنٌ مع الحدث،
--      والافتراضي **اقتراحٌ وقت الإدخال** يُلقَط بجواره للمقارنة.
--   ٤. **سببٌ بلا إجراء** ⇐ قيدُ فحصٍ يحصر الإجراء في `none`/`pay`/`deduct`.
--
--   ➕ وخامسٌ لم يُذكر في الموجز ويلزم: **التجاوز بلا مبرر**. الموجز يقول
--      «يقبله أو يتجاوزه **بمبرر مكتوب**» — فالمبرر قيدُ جدولٍ لا نصُّ شاشة.
--
-- ══════════════════════════════════════════════════════════════════════════
--  والولاء: تفويضٌ لا استنساخ
-- ══════════════════════════════════════════════════════════════════════════
--
-- `assigned ⇒ failed` **لا نقطة فيها أصلاً** — الرحلة لم تبلغ `completed`
-- فالمُشغّل لم يعمل (§١-ب: «المشكلة تختفي بالبناء لا بالمعالجة»).
-- و`completed ⇒ failed` وحدها تحتاج عكساً. فبدل تكرار الحلقة، استُخرج جسم
-- `loyalty_on_booking_cancelled` إلى `loyalty_reverse_booking()`، وصار المُشغّلان
-- **يفوّضان إليها**. فالانحدار مستحيلٌ بنيوياً لا مستبعَدٌ بالانتباه.
--
-- ⚠ وقد يهبط الرصيد تحت الصفر هنا — وهو **صمّام أمانٍ مقصود** لا سياسة (§١-د):
--    الحالةُ نادرةٌ حقاً (تستلزم أن ينفق العميل نقاطه داخل ٤٨ ساعة)، والقيد
--    `points_balance >= 0` قد يرمي. وقد أحصى الموجز هذا وقبِله: لا يُحجب ردٌّ،
--    ولا تُؤخذ قيمةٌ مجاناً.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- (١) الحالة السابعة والانتقالان
-- ----------------------------------------------------------------------------

alter table public.bookings drop constraint if exists bookings_status_check;
alter table public.bookings
  add constraint bookings_status_check check (
    status = any (array[
      'pending_payment', 'under_review', 'confirmed',
      'assigned', 'completed', 'cancelled', 'failed'
    ])
  );

-- الجسم منقولٌ من الكتالوج الحيّ (‏D-58) وزِيد عليه زوجان — لا أكثر.
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
      -- وشكوى تصل بعد أن علّمها الأدمن مكتملة — بنافذةٍ يفرضها
      -- `guard_booking_failed` لأنها زمنيةٌ ولا مكان لها في دالةٍ `immutable`
      ('completed',       'failed')
      -- 🔒 ولا زوج **من** `failed`: الحالة نهائية (§١-ج)
    ) as t(from_status, to_status)
    where t.from_status = p_from
      and t.to_status   = p_to
  );
$function$;

comment on function public.booking_transition_allowed(text, text) is
  'أزواج انتقال حالة الحجز. 0051: أُضيف assigned⇒failed وcompleted⇒failed، ولا زوج ينطلق من failed — الحالة نهائية بقرار المالك (§١-ج).';

-- نافذة إعادة التصنيف — **تعريفٌ واحد** يقرؤه الحارس والشاشة معاً
create or replace function public.failed_reclass_window()
returns interval
language sql
immutable
set search_path = ''
as $function$
  select interval '48 hours';
$function$;

comment on function public.failed_reclass_window() is
  'نافذة إعادة تصنيف الرحلة المكتملة إلى فاشلة — ٤٨ ساعة بقرار بدر (§١-د). مصدرٌ واحد يقرؤه الحارس والواجهة، فلا رقمان ينحرفان.';

-- زمن الاكتمال من **سجل الأحداث** لا من `updated_at` (الذي يتحرك مع كل تعديل)
create or replace function public.booking_completed_at(p_booking_id uuid)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $function$
  select max(e.created_at)
  from public.booking_events e
  where e.booking_id = p_booking_id
    and e.to_status  = 'completed';
$function$;

comment on function public.booking_completed_at(uuid) is
  'لحظة بلوغ الحجز حالة completed كما سجّلها booking_events. داخليةٌ بلا منح لأي دور مستخدم — يناديها الحارس وحده.';


-- ----------------------------------------------------------------------------
-- (٢) كتالوج الأسباب — بياناتٌ يحرّرها المالك، لا ثابتٌ في الكود
-- ----------------------------------------------------------------------------

create table if not exists public.failure_reasons (
  id             uuid primary key default gen_random_uuid(),
  slug           text not null unique,
  label          text not null,
  default_action text not null,
  active         boolean not null default true,
  sort           integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'failure_reasons_action_chk'
  ) then
    alter table public.failure_reasons
      add constraint failure_reasons_action_chk
      check (default_action = any (array['none', 'pay', 'deduct']));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'failure_reasons_slug_chk'
  ) then
    alter table public.failure_reasons
      add constraint failure_reasons_slug_chk
      check (slug = lower(btrim(slug)) and length(slug) between 2 and 64);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'failure_reasons_label_chk'
  ) then
    alter table public.failure_reasons
      add constraint failure_reasons_label_chk
      check (length(btrim(label)) between 2 and 160);
  end if;
end;
$$;

comment on table public.failure_reasons is
  'كتالوج أسباب فشل الرحلة — يُحرَّر من /admin (قرار بدر ٢). لا يُحذف منه سببٌ مستعمَل: مفتاح booking_failures الأجنبي restrict، والتعطيل active=false هو المسار.';
comment on column public.failure_reasons.default_action is
  'اقتراحُ إجراءٍ وقت الإدخال لا حكمٌ دائم — المنفَّذ يُخزَّن في booking_failures.action_taken.';

drop trigger if exists failure_reasons_touch_updated_at on public.failure_reasons;
create trigger failure_reasons_touch_updated_at
  before update on public.failure_reasons
  for each row execute function public.touch_updated_at();

-- البذرة المتفق عليها حرفياً (§١-هـ) — ولا رقم يُخترع.
-- `on conflict do nothing`: إعادة تنفيذ الهجرة لا تدهس تحرير المالك.
insert into public.failure_reasons (slug, label, default_action, active, sort) values
  ('driver-no-show',     'السائق لم يحضر',                'deduct', true, 10),
  ('severe-delay',       'تأخّر فادح',                    'deduct', true, 20),
  ('vehicle-breakdown',  'عطل مركبة',                     'none',   true, 30),
  -- 🔒 العميل لم يحضر ⇒ **دفع كامل**: المتعهد أدّى ما عليه (§١-هـ)
  ('customer-no-show',   'العميل لم يحضر',                'pay',    true, 40),
  ('force-majeure',      'ظرف قاهر (طقس · طريق مغلق)',    'none',   true, 50),
  -- «يختاره المدير» في الموجز ⇒ الافتراضي أقلُّ الثلاثة التزاماً، والتجاوز
  -- إلى pay أو deduct يستلزم مبرراً مكتوباً كأي تجاوز
  ('admin-decision',     'قرار إداري',                    'none',   true, 60)
on conflict (slug) do nothing;


-- ----------------------------------------------------------------------------
-- (٣) صفّ الفشل — لقطةٌ مجمَّدة، مُلحَقةٌ لا تُعدَّل
-- ----------------------------------------------------------------------------

create table if not exists public.booking_failures (
  booking_id       uuid primary key references public.bookings(id) on delete restrict,
  reason_id        uuid not null references public.failure_reasons(id) on delete restrict,
  -- ↓ اللقطات الثلاث: ما قيل يومها، لا ما يقوله الكتالوج اليوم
  reason_slug      text not null,
  reason_label     text not null,
  default_action   text not null,
  -- ↓ والمنفَّذ فعلاً
  action_taken     text not null,
  deduct_amount    numeric(14,2),
  override_note    text,
  from_status      text not null,
  subcontractor_id uuid references public.subcontractors(id) on delete set null,
  payout_snapshot  numeric(14,2),
  ledger_effect    text not null default 'none',
  failed_at        timestamptz not null default now(),
  created_by       uuid,
  created_at       timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'booking_failures_action_chk') then
    alter table public.booking_failures add constraint booking_failures_action_chk
      check (action_taken = any (array['none', 'pay', 'deduct']));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'booking_failures_default_chk') then
    alter table public.booking_failures add constraint booking_failures_default_chk
      check (default_action = any (array['none', 'pay', 'deduct']));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'booking_failures_from_chk') then
    alter table public.booking_failures add constraint booking_failures_from_chk
      check (from_status = any (array['assigned', 'completed']));
  end if;
  -- المبلغ حكرٌ على الخصم، والخصم لا يكون بلا مبلغ موجب
  if not exists (select 1 from pg_constraint where conname = 'booking_failures_deduct_chk') then
    alter table public.booking_failures add constraint booking_failures_deduct_chk
      check ((action_taken = 'deduct') = (deduct_amount is not null and deduct_amount > 0));
  end if;
  -- ➕ الفخّ الخامس: تجاوزُ الافتراضي بلا مبرر مكتوب
  if not exists (select 1 from pg_constraint where conname = 'booking_failures_override_chk') then
    alter table public.booking_failures add constraint booking_failures_override_chk
      check (action_taken = default_action or coalesce(btrim(override_note), '') <> '');
  end if;
end;
$$;

create index if not exists booking_failures_reason_idx
  on public.booking_failures (reason_id, failed_at);
create index if not exists booking_failures_sub_idx
  on public.booking_failures (subcontractor_id, failed_at);

comment on table public.booking_failures is
  'صفٌّ واحد لكل رحلةٍ فاشلة، بلقطة السبب والتسمية والإجراء الافتراضي لحظة الوقوع. مُلحَقٌ فقط: إعادة تسمية سببٍ في الكتالوج لا تُعيد كتابة تقارير الماضي.';
comment on column public.booking_failures.ledger_effect is
  'رمزُ ما وقع في الدفتر — none · payout-created · deduct · payout-kept · payout-reversed · payout-reversed+deduct · payout-missing. رمزٌ لا جملة (يُترجَم في الواجهة).';

-- مُلحَقٌ فقط: التصحيح قرارٌ ماليٌّ صريح على الدفتر، لا تعديلٌ صامت للسجل
create or replace function public.booking_failures_append_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  raise exception
    'سجل الرحلات الفاشلة مُلحَقٌ فقط: لا تعديل ولا حذف — تصحيحُ الأثر المالي يقع على الدفتر بـreverse_ledger_entry أو record_partner_adjustment'
    using hint = 'append-only';
end;
$function$;

drop trigger if exists booking_failures_append_only on public.booking_failures;
create trigger booking_failures_append_only
  before update or delete on public.booking_failures
  for each row execute function public.booking_failures_append_only();

drop trigger if exists audit_failure_reasons on public.failure_reasons;
create trigger audit_failure_reasons
  after insert or update or delete on public.failure_reasons
  for each row execute function public.log_audit('slug');

drop trigger if exists audit_booking_failures on public.booking_failures;
create trigger audit_booking_failures
  after insert or update or delete on public.booking_failures
  for each row execute function public.log_audit('reason_slug');


-- ----------------------------------------------------------------------------
-- (٤) الحارس — لا فشلَ بلا سبب، ولا إعادةَ تصنيفٍ بعد النافذة
--
-- 🔒 مُشغّلٌ **مستقل** لا توسيعٌ لـ`guard_booking_status`: ذاك `security invoker`
--    عن قصد، وقراءةُ `booking_failures` من داخله كانت ستُلزمنا بمنح المتعهد
--    قراءةً عليه. فالمنطق الجديد في دالة `definer` بجواره، والقديم لم يُلمس.
--
-- وترتيب التنفيذ: `bookings_guard_failed` قبل `bookings_guard_status` أبجدياً،
-- وكلاهما يرمي — فأيّهما سبق فالنتيجة واحدة.
-- ----------------------------------------------------------------------------

create or replace function public.guard_booking_failed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_at timestamptz;
begin
  -- (أ) الصفّ يسبق الحالة. والمنح على `booking_failures` تمنع كتابته من خارج
  --     `mark_booking_failed`، فهذا الشرط يعني عملياً: **لا مسار ثانٍ**.
  if not exists (
    select 1 from public.booking_failures f where f.booking_id = new.id
  ) then
    raise exception
      'لا تُعلَّم الرحلة «%» فاشلة إلا عبر mark_booking_failed — لا صفَّ سببٍ مسجَّل لها',
      coalesce(old.reference, new.id::text)
      using hint = 'failure-record-required';
  end if;

  -- (ب) نافذة إعادة التصنيف بعد الاكتمال (§١-د)
  if old.status = 'completed' then
    v_at := public.booking_completed_at(new.id);

    -- لا زمنَ اكتمالٍ في السجل ⇒ **رفض**. الاتجاه الآمن أن نعجز عن إعادة
    -- التصنيف، لا أن نفتح رحلةً عمرها سنة. (مقيسٌ 2026-08-15: صفرُ حجزٍ مكتمل
    -- بلا صفِّ حدثٍ باكتماله — فهذا فرعٌ لا يُبلَغ اليوم، ويُبقى مغلقاً.)
    if v_at is null then
      raise exception
        'تعذّر إثبات لحظة اكتمال الحجز «%» من سجل الأحداث — إعادة التصنيف مرفوضة',
        coalesce(old.reference, new.id::text)
        using hint = 'completion-time-unknown';
    end if;

    if now() > v_at + public.failed_reclass_window() then
      raise exception
        'انقضت نافذة إعادة تصنيف الحجز «%» — اكتمل في % والنافذة %',
        coalesce(old.reference, new.id::text), v_at, public.failed_reclass_window()
        using hint = 'reclass-window-closed';
    end if;
  end if;

  return new;
end;
$function$;

drop trigger if exists bookings_guard_failed on public.bookings;
create trigger bookings_guard_failed
  before update on public.bookings
  for each row
  when (new.status = 'failed' and old.status is distinct from new.status)
  execute function public.guard_booking_failed();


-- ----------------------------------------------------------------------------
-- (٥) عكس الولاء — استخراجٌ ثم تفويض، بلا سطرٍ مستنسَخ
-- ----------------------------------------------------------------------------

-- الجسم منقولٌ حرفياً من `loyalty_on_booking_cancelled` الحيّة (‏D-58)،
-- ومُعمَّمٌ على السبب وحده.
create or replace function public.loyalty_reverse_booking(
  p_booking_id uuid,
  p_note       text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_e   record;
  v_act uuid;
  v_n   integer := 0;
begin
  v_act := public.current_actor();

  for v_e in
    select e.*
    from public.loyalty_entries e
    where e.booking_id = p_booking_id
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
      v_e.id, p_note, v_act
    );
    v_n := v_n + 1;
  end loop;

  return v_n;
end;
$function$;

comment on function public.loyalty_reverse_booking(uuid, text) is
  'يعكس كل قيد ولاءٍ غير معكوس لحجز. آليةٌ واحدة يفوّض إليها مُشغّلا الإلغاء والفشل — لا نسختان تنحرفان (القاعدة ١٢). داخليةٌ بلا منح لأي دور مستخدم.';

-- والمُشغّل القائم يصير غلافاً: نفس الحارس ونفس الرسالة، والحلقة انتقلت
create or replace function public.loyalty_on_booking_cancelled()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.status <> 'cancelled' or coalesce(old.status, '') = 'cancelled' then
    return null;
  end if;

  perform public.loyalty_reverse_booking(
    new.id,
    'قيد عاكس — أُلغيت الرحلة ' || coalesce(new.reference, '')
  );

  return null;
end;
$function$;

-- والفشل يركب الآلية نفسها. و`assigned ⇒ failed` تجد صفراً تعكسه — بالبناء:
-- الرحلة لم تبلغ `completed` فلا نقطة سُكّت (§١-ب).
create or replace function public.loyalty_on_booking_failed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.status <> 'failed' or coalesce(old.status, '') = 'failed' then
    return null;
  end if;

  perform public.loyalty_reverse_booking(
    new.id,
    'قيد عاكس — فشلت الرحلة ' || coalesce(new.reference, '')
  );

  return null;
end;
$function$;

drop trigger if exists bookings_loyalty_failed on public.bookings;
create trigger bookings_loyalty_failed
  after update of status on public.bookings
  for each row
  when (new.status = 'failed' and old.status is distinct from new.status)
  execute function public.loyalty_on_booking_failed();


-- ----------------------------------------------------------------------------
-- (٦) المدخل الوحيد — `mark_booking_failed`
--
-- كل نداء PostgREST معاملةٌ واحدة (**D-48**): فإن رمى أيُّ سطرٍ أدناه لم يُكتب
-- صفُّ الفشل ولا القيد ولا الحالة — لا نصفَ فشلٍ ولا مالٌ بلا سبب.
-- ----------------------------------------------------------------------------

create or replace function public.mark_booking_failed(
  p_booking_id    uuid,
  p_reason_slug   text,
  p_action        text default null,
  p_deduct_amount numeric default null,
  p_note          text default null
)
returns table (
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
  if v_action = 'deduct' then
    v_amount := round(coalesce(p_deduct_amount, 0), 2);
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

  -- (هـ) الأثر المالي — على مسار المال القائم وحده (انظر ترويسة الملف).
  --      يقع **قبل** كتابة الصفّ كي يُكتب فيه رمزُ ما وقع فعلاً لا تخمينٌ
  --      يُصحَّح بعدُ: السجل مُلحَقٌ فقط، فلا `update` لاحقاً يمرّ عليه.
  --      وكلٌّ من الرمي هنا يُرجع المعاملة كلها (**D-48**) فلا مالَ بلا صفّ.
  if v_b.status = 'completed' then
    if v_action = 'pay' then
      -- التسوية تبقى كما كتبتها `ledger_on_booking_completed`
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
        -- مستحقٌّ غير موجود أو معكوسٌ سلفاً: لا شيء يُعكس، والرمز يقول ذلك
        -- بدل أن يدّعي عكساً لم يقع
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
    and e.created_at = v_now;   -- `now()` ثابتةٌ داخل المعاملة ⇒ قيودُ هذا النداء وحدها

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
  'المدخل الوحيد لتعليم رحلةٍ فاشلة: يلقط السبب والتسمية والإجراء الافتراضي، ينفّذ الأثر المالي على record_partner_adjustment وreverse_ledger_entry وحدهما، ثم ينقل الحالة فتعكس المُشغّلات النقاط. لا مسار مالٍ ثانٍ.';


-- ----------------------------------------------------------------------------
-- (٧) البورتال يرى النتيجة — وإلا اختفت الرحلة من قائمة من نفّذها
--
-- الجسم منقولٌ من الكتالوج الحيّ (‏D-58)، والتغيير حرفٌ واحد: `'failed'` في
-- قائمة الحالات المرئية. ورمزُ المتعهد (‏0028) والحقول كلها كما هي.
-- ----------------------------------------------------------------------------

create or replace function public.portal_trips()
returns table (
  offer_id uuid, booking_id uuid, reference text, origin_label text,
  dest_label text, distance_km numeric, passengers integer, round_trip boolean,
  waiting_hours numeric, class_title text, pickup_at timestamptz, payout numeric,
  currency text, expires_at timestamptz, notes text, customer_name text,
  customer_phone text, customer_whatsapp text, status text,
  assigned_at timestamptz, crew_vehicle_id uuid, crew_driver_id uuid,
  crew_by_admin boolean, crew_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    o.id,
    b.id,
    -- 0028: رمز المتعهد لا مرجع العميل (انظر ترويسة الملف — العيب الحرج)
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
    -- ← 0042: معرّفان من سجلَّي الشريك نفسه، ووسم الإدخال الإداري
    d.assigned_vehicle_id,
    d.assigned_driver_id,
    d.crew_by_admin,
    d.crew_at
  from public.dispatches d
  join public.bookings b on b.id = d.booking_id
  left join public.trip_offers o
    on o.booking_id       = d.booking_id
   and o.subcontractor_id = d.assigned_subcontractor_id
   and o.status           = 'accepted'
  where d.assigned_subcontractor_id = public.current_subcontractor_id()
    and public.current_subcontractor_id() is not null
    and d.status  = 'assigned'
    -- 0051: و`failed` — الرحلة الفاشلة تبقى في قائمة من نُفِّذت عليه، وإخفاؤها
    -- يجعل الرحلة تختفي من عنده بلا تفسير. و🔒 السبب والإجراء المالي **لا
    -- يعبران**: `booking_failures` بلا منحٍ للمتعهد، وهذا الإخراج بلا حقلٍ لهما.
    and b.status in ('assigned', 'completed', 'cancelled', 'failed')
  order by nullif(btrim(coalesce(b.trip ->> 'pickupAt', '')), '')::timestamptz asc nulls last,
           d.assigned_at desc;
$function$;


-- ----------------------------------------------------------------------------
-- (٨) المنح — `revoke` أولاً ثم `grant` الأضيق (اتفاقية ٦ · القاعدة ١٦)
--
-- ⚠ `TRUNCATE` لا تخضع لـRLS إطلاقاً، والمنحة هي الحارس لا السياسة.
-- ----------------------------------------------------------------------------

alter table public.failure_reasons  enable row level security;
alter table public.booking_failures enable row level security;

revoke all on table public.failure_reasons  from public, anon;
revoke all on table public.booking_failures from public, anon, authenticated;

-- الكتالوج: يحرّره المشرف من اللوحة (نمط `extra_services` حرفياً)
grant select, insert, update, delete on table public.failure_reasons to authenticated;
grant select, insert, update, delete on table public.failure_reasons to service_role;

-- 🔒 صفّ الفشل: **قراءةٌ للمشرف فقط، ولا كتابةَ لأحد** — الكاتب الوحيد هو
--    `mark_booking_failed`. وهذا ما يجعل حارس المُشغّل «لا فشلَ بلا سبب» حاجزاً
--    لا عُرفاً: لا يملك أيُّ دورِ متصفحٍ `insert` عليه أصلاً.
grant select on table public.booking_failures to authenticated;
grant select, insert, update, delete on table public.booking_failures to service_role;

drop policy if exists failure_reasons_select_admin on public.failure_reasons;
create policy failure_reasons_select_admin on public.failure_reasons
  for select to authenticated using (public.is_admin());
drop policy if exists failure_reasons_insert_admin on public.failure_reasons;
create policy failure_reasons_insert_admin on public.failure_reasons
  for insert to authenticated with check (public.is_admin());
drop policy if exists failure_reasons_update_admin on public.failure_reasons;
create policy failure_reasons_update_admin on public.failure_reasons
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists failure_reasons_delete_admin on public.failure_reasons;
create policy failure_reasons_delete_admin on public.failure_reasons
  for delete to authenticated using (public.is_admin());

drop policy if exists booking_failures_select_admin on public.booking_failures;
create policy booking_failures_select_admin on public.booking_failures
  for select to authenticated using (public.is_admin());

-- الدوال الداخلية: لا يناديها إلا مالكُ القاعدة ودوالُّ `definer` أخرى
revoke all on function public.loyalty_reverse_booking(uuid, text) from public, anon, authenticated;
revoke all on function public.booking_completed_at(uuid)          from public, anon, authenticated;
revoke all on function public.guard_booking_failed()              from public, anon, authenticated;
revoke all on function public.loyalty_on_booking_failed()         from public, anon, authenticated;
revoke all on function public.booking_failures_append_only()      from public, anon, authenticated;
revoke all on function public.loyalty_on_booking_cancelled()      from public, anon, authenticated;

revoke all on function public.mark_booking_failed(uuid, text, text, numeric, text) from public, anon;
grant execute on function public.mark_booking_failed(uuid, text, text, numeric, text)
  to authenticated, service_role;

revoke all on function public.failed_reclass_window() from public, anon;
grant execute on function public.failed_reclass_window() to authenticated, service_role;

revoke all on function public.booking_transition_allowed(text, text) from public, anon;
grant execute on function public.booking_transition_allowed(text, text) to authenticated, service_role;

revoke all on function public.portal_trips() from public, anon;
grant execute on function public.portal_trips() to authenticated, service_role;


-- ============================================================================
-- الفحص الذاتي — يمسبر مسباره أولاً، ويبني فيكسترته داخل معاملةٍ فرعية تُرجَع،
-- ولكل تأكيدٍ **طفرةٌ تُبنى ويُثبَت أنها ترفع**. ولا مسار تخطٍّ واحد.
-- ============================================================================

do $$
declare
  v_admin  uuid;
  v_sub    uuid := '5ea11ed0-0000-4000-8000-000000005101';
  v_cls    uuid := 'c0000000-0000-4000-8000-000000005101';
  v_slug   constant text := 'ftest-0051';
  v_phone  constant text := '01000005101';
  v_norm   text;
  v_bk     record;
  v_res    record;
  v_id     uuid;
  v_id2    uuid;
  v_id3    uuid;
  v_state  text;
  v_n      integer;
  v_net0   numeric;
  v_net1   numeric;
  v_payout numeric := 700;
  v_bal    integer;
  v_lbl    text;
begin
  -- ══ (٠) مسبار المسبار ═══════════════════════════════════════════════════
  select p.id into v_admin from public.profiles p where p.role = 'admin' limit 1;
  if v_admin is null then
    raise exception '0051: لا مشرف في القاعدة — كل ما يلي كان سيقيس رفضاً لا سلوكاً';
  end if;
  if to_regclass('public.booking_failures') is null
     or to_regprocedure('public.mark_booking_failed(uuid,text,text,numeric,text)') is null then
    raise exception '0051: الكائنات لم تُنشأ — الفحص لا يفحص شيئاً';
  end if;
  if (select count(*) from public.failure_reasons where active) < 6 then
    raise exception '0051: الكتالوج بذر % سبباً مفعَّلاً لا ستة',
      (select count(*) from public.failure_reasons where active);
  end if;

  begin
    -- ══ الفيكسترة — كلها ملكُ الفحص، ولا رقم من كتالوج المالك ═══════════════
    update public.loyalty_settings set enabled = true, points_per_currency = 1;

    insert into public.subcontractors (id, company_name, contact_name, phone, status)
    values (v_sub, 'FAILED_TRIPS_0051 متعهد', 'FT', '01000000000', 'approved');

    insert into public.vehicle_classes (id, slug, title, capacity, luggage_capacity, active, sort)
    values (v_cls, v_slug, 'FAILED_TRIPS_0051 فئة', 1, 4, true, 9051);
    insert into public.tariffs (class_id, per_km, base_fee, min_price,
                                waiting_hour_price, round_trip_factor)
    values (v_cls, 20, 1000, 0, 0, 1.8);

    perform set_config('request.jwt.claims',
      json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

    -- ══ (أ) المسار الموجب أولاً: `assigned ⇒ failed` بالإجراء الافتراضي ═════
    --    بلا هذا لكان كل «رفعَ استثناءً» أدناه صحيحاً لأن **لا شيء يعمل**.
    select * into v_bk from public.create_booking(
      jsonb_build_object('label', 'FT مبدأ', 'lat', 25.0, 'lng', 27.5),
      jsonb_build_object('label', 'FT منتهى', 'lat', 24.5, 'lng', 28.2),
      1, false, 0, 100, 90, 'estimate', v_slug, 'full',
      'FAILED_TRIPS_0051 عميل', v_phone, null, now() + interval '3 days',
      'FAILED_TRIPS_0051_FIXTURE', null, null, 0, null, 0);
    v_id := v_bk.id;

    update public.bookings set status = 'under_review' where id = v_id;
    update public.bookings set status = 'confirmed'    where id = v_id;
    insert into public.dispatches (booking_id, status, round,
                                   assigned_subcontractor_id, assigned_payout, assigned_at)
    values (v_id, 'assigned', 1, v_sub, v_payout, now());
    update public.bookings set status = 'assigned' where id = v_id;

    select v.net_due into v_net0 from public.v_partner_settlements v
     where v.subcontractor_id = v_sub;

    select * into v_res from public.mark_booking_failed(
      v_id, 'customer-no-show', null, null, null);

    if v_res.action_taken <> 'pay' then
      raise exception '0051 (أ): الافتراضي المأخوذ «%» لا «pay» — «العميل لم يحضر» يُدفع كاملاً (§١-هـ)',
        v_res.action_taken;
    end if;
    if v_res.ledger_effect <> 'payout-created' then
      raise exception '0051 (أ): أثر الدفتر «%» لا «payout-created»', v_res.ledger_effect;
    end if;
    if (select b.status from public.bookings b where b.id = v_id) <> 'failed' then
      raise exception '0051 (أ): الحالة لم تصر failed — لا شيء مما بعده يقيس شيئاً';
    end if;

    select v.net_due into v_net1 from public.v_partner_settlements v
     where v.subcontractor_id = v_sub;
    if coalesce(v_net1, 0) - coalesce(v_net0, 0) <> v_payout then
      raise exception '0051 (أ): مستحق المتعهد ارتفع % والمتوقع % — «ادفع» على رحلةٍ لم تكتمل تُنشئ earned',
        coalesce(v_net1, 0) - coalesce(v_net0, 0), v_payout;
    end if;

    -- ══ (ب) النهائية — الطفرة: أيُّ خروجٍ من `failed` يجب أن يرفع ═══════════
    for v_state in select unnest(array['assigned','completed','cancelled','confirmed']) loop
      v_lbl := null;
      begin
        update public.bookings set status = v_state where id = v_id;
        v_lbl := '(قُبل)';
      exception when others then
        get stacked diagnostics v_lbl = returned_sqlstate;
      end;
      if v_lbl = '(قُبل)' then
        raise exception '0051 (ب): 🔴 failed ⇒ % نُفِّذ — الحالة ليست نهائية (§١-ج)', v_state;
      end if;
    end loop;

    -- ══ (ج) لا فشلَ بلا صفِّ سبب — الطفرة: تحديثٌ مباشر على حجزٍ بلا صفّ ═════
    select * into v_bk from public.create_booking(
      jsonb_build_object('label', 'FT مبدأ٢', 'lat', 25.0, 'lng', 27.5),
      jsonb_build_object('label', 'FT منتهى٢', 'lat', 24.5, 'lng', 28.2),
      1, false, 0, 100, 90, 'estimate', v_slug, 'full',
      'FAILED_TRIPS_0051 عميل٢', v_phone, null, now() + interval '4 days',
      'FAILED_TRIPS_0051_FIXTURE', null, null, 0, null, 0);
    v_id2 := v_bk.id;
    update public.bookings set status = 'under_review' where id = v_id2;
    update public.bookings set status = 'confirmed'    where id = v_id2;
    insert into public.dispatches (booking_id, status, round,
                                   assigned_subcontractor_id, assigned_payout, assigned_at)
    values (v_id2, 'assigned', 1, v_sub, v_payout, now());
    update public.bookings set status = 'assigned' where id = v_id2;

    v_lbl := null;
    begin
      update public.bookings set status = 'failed' where id = v_id2;
      v_lbl := '(قُبل)';
    exception when others then
      get stacked diagnostics v_lbl = message_text;
    end;
    if v_lbl = '(قُبل)' then
      raise exception '0051 (ج): 🔴 تحديثٌ مباشر علّم الرحلة فاشلة بلا سببٍ ولا قرارٍ مالي';
    end if;

    -- ولا يكفي أن يرفع: لا بد أن يرفع **لهذا السبب** لا لسببٍ آخر عرضاً
    if v_lbl not like '%mark_booking_failed%' then
      raise exception '0051 (ج): رفع الحارس برسالة «%» — ليست رسالة «لا صفَّ سبب»، فالتأكيد يمسك عطباً آخر', v_lbl;
    end if;

    -- ══ (د) نافذة ٤٨ ساعة — الطفرة: اكتمالٌ قديم يُرفض، وحديثٌ يُقبل ════════
    update public.bookings set status = 'completed' where id = v_id2;

    -- (د-١) الطفرة: نُقدّم زمنَ الاكتمال في السجل ما وراء النافذة
    update public.booking_events
       set created_at = now() - public.failed_reclass_window() - interval '1 hour'
     where booking_id = v_id2 and to_status = 'completed';

    v_lbl := null;
    begin
      perform * from public.mark_booking_failed(v_id2, 'vehicle-breakdown', null, null, null);
      v_lbl := '(قُبل)';
    exception when others then
      get stacked diagnostics v_lbl = message_text;
    end;
    if v_lbl = '(قُبل)' then
      raise exception '0051 (د-١): 🔴 إعادة تصنيفٍ بعد انقضاء نافذة الـ٤٨ ساعة نُفِّذت';
    end if;
    if v_lbl not like '%نافذة%' then
      raise exception '0051 (د-١): الرفض جاء برسالة «%» لا برسالة النافذة', v_lbl;
    end if;
    -- والصفّ لم يبقَ: كل نداءٍ معاملةٌ واحدة (**D-48**) — والرفع أرجعها كاملة
    select count(*)::integer into v_n
      from public.booking_failures f where f.booking_id = v_id2;
    if v_n <> 0 then
      raise exception '0051 (د-١): 🔴 بقي % صفَّ فشلٍ بعد نداءٍ مرفوض — نصفُ فشلٍ في القاعدة', v_n;
    end if;

    -- (د-٢) وداخل النافذة يمرّ — وإلا كان (د-١) يمسك «لا شيء يعمل» لا النافذة
    update public.booking_events
       set created_at = now() - interval '2 hours'
     where booking_id = v_id2 and to_status = 'completed';

    select a.points_balance into v_bal
      from public.loyalty_accounts a
     where a.phone_norm = public.normalize_phone(v_phone);
    if coalesce(v_bal, 0) <= 0 then
      raise exception '0051 (د-٢): الاكتمال لم يسكّ نقاطاً (رصيد %) — فحصُ العكس التالي كان سيمرّ فوق صفر',
        coalesce(v_bal, 0);
    end if;

    select v.net_due into v_net0 from public.v_partner_settlements v
     where v.subcontractor_id = v_sub;

    select * into v_res from public.mark_booking_failed(
      v_id2, 'driver-no-show', 'none', null, 'مبرر التجاوز — فحص 0051');

    if v_res.ledger_effect <> 'payout-reversed' then
      raise exception '0051 (د-٢): أثر الدفتر «%» لا «payout-reversed» — «لا يُدفع» على رحلةٍ مرّت بالتسوية = عكسُ earned',
        v_res.ledger_effect;
    end if;
    select v.net_due into v_net1 from public.v_partner_settlements v
     where v.subcontractor_id = v_sub;
    if coalesce(v_net0, 0) - coalesce(v_net1, 0) <> v_payout then
      raise exception '0051 (د-٢): net_due انخفض % والمتوقع % — عكسُ المستحق لم يقع بمقداره',
        coalesce(v_net0, 0) - coalesce(v_net1, 0), v_payout;
    end if;
    -- 🔒 ورجل التحصيل **باقية**: عكسها يهب المتعهد ديناً حقيقياً (ترويسة الملف ب)
    select count(*)::integer into v_n
    from public.ledger_entries e
    where e.source_type = 'partner_collection' and e.source_id = v_id2
      and e.reverses_entry_id is null
      and not exists (select 1 from public.ledger_entries x where x.reverses_entry_id = e.id);
    if v_n <> 1 then
      raise exception '0051 (د-٢): 🔴 رجل التحصيل غير قائمة (% غير معكوسة) — نقدٌ في يد المتعهد سقط من الحساب', v_n;
    end if;

    -- ══ (هـ) عكس الولاء — والطفرة أن الرصيد كان موجباً قبله ═════════════════
    if v_res.points_reversed < 1 then
      raise exception '0051 (هـ): عُكس % قيداً — النقاط بقيت على رحلةٍ فاشلة', v_res.points_reversed;
    end if;
    select a.points_balance into v_bal
      from public.loyalty_accounts a
     where a.phone_norm = public.normalize_phone(v_phone);
    if coalesce(v_bal, 0) <> 0 then
      raise exception '0051 (هـ): الرصيد بعد العكس % لا صفر', coalesce(v_bal, 0);
    end if;

    -- ══ (و) الكتالوج: الحذف ممنوعٌ بنيوياً، والتسمية لا تُعيد كتابة الماضي ══
    v_lbl := null;
    begin
      delete from public.failure_reasons where slug = 'driver-no-show';
      v_lbl := '(حُذف)';
    exception when others then
      get stacked diagnostics v_lbl = returned_sqlstate;
    end;
    if v_lbl = '(حُذف)' then
      raise exception '0051 (و-١): 🔴 حُذف سببٌ مستعمَل — المفتاح الأجنبي ليس restrict';
    end if;

    update public.failure_reasons
       set label = 'اسمٌ جديد تماماً', default_action = 'pay'
     where slug = 'driver-no-show';
    select f.reason_label, f.default_action into v_lbl, v_state
      from public.booking_failures f where f.booking_id = v_id2;
    if v_lbl <> 'السائق لم يحضر' or v_state <> 'deduct' then
      raise exception '0051 (و-٢): 🔴 اللقطة تبعت الكتالوج (تسمية «%» وافتراضي «%») — تقارير الماضي تُعاد كتابتها',
        v_lbl, v_state;
    end if;

    -- ══ (ز) التجاوز بلا مبرر يُرفض · ثم الخصم يعمل — على حجزٍ ثالثٍ حيّ ═════
    select * into v_bk from public.create_booking(
      jsonb_build_object('label', 'FT مبدأ٣', 'lat', 25.0, 'lng', 27.5),
      jsonb_build_object('label', 'FT منتهى٣', 'lat', 24.5, 'lng', 28.2),
      1, false, 0, 100, 90, 'estimate', v_slug, 'full',
      'FAILED_TRIPS_0051 عميل٣', v_phone, null, now() + interval '5 days',
      'FAILED_TRIPS_0051_FIXTURE', null, null, 0, null, 0);
    v_id3 := v_bk.id;
    update public.bookings set status = 'under_review' where id = v_id3;
    update public.bookings set status = 'confirmed'    where id = v_id3;
    insert into public.dispatches (booking_id, status, round,
                                   assigned_subcontractor_id, assigned_payout, assigned_at)
    values (v_id3, 'assigned', 1, v_sub, v_payout, now());
    update public.bookings set status = 'assigned' where id = v_id3;

    v_lbl := null;
    begin
      perform * from public.mark_booking_failed(v_id3, 'vehicle-breakdown', 'deduct', 100, null);
      v_lbl := '(قُبل)';
    exception when others then
      get stacked diagnostics v_lbl = message_text;
    end;
    if v_lbl = '(قُبل)' then
      raise exception '0051 (ز-١): 🔴 تجاوزُ الإجراء الافتراضي مرّ بلا مبرر مكتوب';
    end if;
    if v_lbl not like '%مبرر%' then
      raise exception '0051 (ز-١): الرفض جاء برسالة «%» لا برسالة المبرر', v_lbl;
    end if;

    -- ونفسُ النداء بمبررٍ يمرّ — وإلا كان (ز-١) يمسك «الخصم لا يعمل» لا «بلا مبرر»
    select v.net_due into v_net0 from public.v_partner_settlements v
     where v.subcontractor_id = v_sub;
    select * into v_res from public.mark_booking_failed(
      v_id3, 'vehicle-breakdown', 'deduct', 100, 'مبرر التجاوز — فحص 0051');
    if v_res.ledger_effect <> 'deduct' then
      raise exception '0051 (ز-٢): أثر الدفتر «%» لا «deduct»', v_res.ledger_effect;
    end if;
    select v.net_due into v_net1 from public.v_partner_settlements v
     where v.subcontractor_id = v_sub;
    if coalesce(v_net0, 0) - coalesce(v_net1, 0) <> 100 then
      raise exception '0051 (ز-٢): net_due انخفض % والمتوقع ١٠٠ — الخصم لا يركب على collected',
        coalesce(v_net0, 0) - coalesce(v_net1, 0);
    end if;
    -- 🔒 وعلى **مسار المال القائم** لا على مسارٍ ثانٍ يُخترع
    select count(*)::integer into v_n
    from public.ledger_entries e
    where e.subcontractor_id = v_sub and e.source_type = 'adjustment'
      and e.settlement_role = 'collected' and e.amount = 100;
    if v_n <> 1 then
      raise exception '0051 (ز-٢): % قيدَ تسويةٍ بالخصم — الخصم لا يمرّ من record_partner_adjustment', v_n;
    end if;

    -- ══ (ح) العزل — الطفرة: نداءٌ بدور المتعهد وبدور الزائر ═══════════════════
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute 'set local role authenticated';
      perform set_config('request.jwt.claims',
        json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);

      v_lbl := null;
      begin
        perform * from public.mark_booking_failed(v_id, 'driver-no-show', null, null, null);
        v_lbl := '(نُفِّذت)';
      exception when others then
        get stacked diagnostics v_lbl = returned_sqlstate;
      end;
      if v_lbl = '(نُفِّذت)' then
        raise exception '0051 (ح-١): 🔴 مستخدمٌ غير مشرف علّم رحلةً فاشلة';
      end if;

      v_lbl := null;
      begin
        insert into public.booking_failures (
          booking_id, reason_id, reason_slug, reason_label, default_action,
          action_taken, from_status)
        select v_id, r.id, r.slug, r.label, r.default_action, r.default_action, 'assigned'
        from public.failure_reasons r where r.slug = 'force-majeure';
        v_lbl := '(كُتب)';
      exception when others then
        get stacked diagnostics v_lbl = returned_sqlstate;
      end;
      if v_lbl <> '42501' then
        raise exception '0051 (ح-٢): 🔴 دورُ المتصفح كتب في booking_failures («%») — الحارس عُرفٌ لا منحة', v_lbl;
      end if;

      execute 'reset role';
    end if;

    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute 'set local role anon';
      perform set_config('request.jwt.claims', '', true);
      for v_state in select unnest(array['failure_reasons', 'booking_failures']) loop
        v_lbl := null;
        begin
          execute format('select count(*) from public.%I', v_state);
          v_lbl := '(قُرئ)';
        exception when others then
          get stacked diagnostics v_lbl = returned_sqlstate;
        end;
        if v_lbl <> '42501' then
          raise exception '0051 (ح-٣): 🔴 anon بلغ % والنتيجة «%» لا 42501', v_state, v_lbl;
        end if;
      end loop;
      execute 'reset role';
    end if;

    perform set_config('request.jwt.claims', '', true);

    -- ══ (ط) السجل مُلحَقٌ فقط ══════════════════════════════════════════════
    v_lbl := null;
    begin
      update public.booking_failures set action_taken = 'pay' where booking_id = v_id;
      v_lbl := '(عُدّل)';
    exception when others then
      get stacked diagnostics v_lbl = returned_sqlstate;
    end;
    if v_lbl = '(عُدّل)' then
      raise exception '0051 (ط): 🔴 عُدِّل صفُّ فشلٍ — القرار المالي قابل لإعادة الكتابة';
    end if;

    -- ══ وخريطة التدقيق تُتحقَّق من الكتالوج لا من الذاكرة (القاعدة ١٤) ═══════
    for v_state, v_lbl in
      select * from (values ('failure_reasons', 'slug'), ('booking_failures', 'reason_slug')) t(a, b)
    loop
      if not exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = v_state and column_name = v_lbl
      ) then
        raise exception '0051: مُشغّل التدقيق يشير إلى عمودٍ غير موجود %.% — سطرٌ لا يقول شيئاً', v_state, v_lbl;
      end if;
    end loop;

    raise exception 'FAILED_TRIPS_0051_ROLLBACK';
  exception
    when others then
      execute 'reset role';
      perform set_config('request.jwt.claims', '', true);
      if sqlerrm <> 'FAILED_TRIPS_0051_ROLLBACK' then raise; end if;
  end;

  raise notice '✔ 0051: الحالة نهائية · لا فشلَ بلا سبب · النافذة ٤٨ ساعة تفتح وتغلق · «لا يُدفع» = عكسُ earned ورجلُ التحصيل باقية · النقاط تُعكس · اللقطة لا تتبع الكتالوج · لا كاتبَ غير mark_booking_failed — وصفر أثر';
end;
$$;
