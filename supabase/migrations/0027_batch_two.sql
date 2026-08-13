-- ============================================================================
-- 0027 — الدفعة ٢ من ملاحظات مراجعة المنتج (ملحق ٢ في docs/VISION.md)
--
-- أربع ملاحظات في هجرة واحدة، لأن ثلاثاً منها تمسّ الحجز نفسه والرابعة تشاركها
-- جدول الإعدادات ونمط الحراسة:
--
--   (٣) مهلة إلغاء تلقائي للطلبات غير المدفوعة، تُضبط من الإعدادات.
--   (٢) رفع الأدمن لإيصال التحويل نيابة عن العميل، بخيار إظهاره أو إخفائه عنه.
--   (١٧) سقف ديون المتعهدين: لا عروض لمن بلغه، ولا دفعة لمن هو مدين لنا.
--   (١) «تابع حجزك» — بحث بمرجع الحجز والهاتف، وخلفه حدّ محاولات.
--
-- ── القرارات الحاكمة في هذا الملف ────────────────────────────────────────────
--
-- ١) **الافتراضي الآمن في كل مفتاح خطر.** الإلغاء التلقائي مطفأ بالبذرة، وسقف
--    الدين صفر (= بلا سقف). ميزةٌ تلغي حجوزات أو تحجب شركاء لا تُشحن مفعّلة —
--    نمط الفشل ٧ في handover/LESSONS.md.
--
-- ٢) **الحاجز في الجدول لا في الدالة.** سقف الدين يُفرض بمُشغّلَين (على
--    `trip_offers` وعلى `partner_payouts`) لا بفحص داخل دالة واحدة، فيغطي محرر
--    SQL وكل كاتب مستقبلي. والتجاوز البشري بدالة مستقلة الاسم على سابقة
--    `manual_assign_with_loss` — قرارٌ ظاهر في سجل الاستدعاءات لا استثناء صامت.
--
-- ٣) **الحجب في القاعدة لا في العرض.** إخفاء الإيصال عن العميل يقع داخل
--    `get_booking_by_token` بإسقاط الصف من الحمولة نفسها: حامل التوكن يقرأ
--    الحمولة الخام من PostgREST، فإخفاءٌ في JSX ليس إخفاءً.
--
-- ٤) **قراءة المقاصة من `security definer` حصراً.** `v_partner_settlements`
--    عرضٌ `security_invoker` فوق دفتر محروس بـ `is_admin()`؛ قراءته بأي هوية
--    أخرى تعود بصفر صفوف **بهدوء** فيصير المدين صافيَ الذمة — أي أن السقف لا
--    يقع على من وُضع لأجله، بلا خطأ ولا أثر.
--
-- ٥) **خانق البحث يعدّ ما يُلتزم به.** رفعُ استثناء يُرجع المعاملة ومعها صفُّ
--    العدّاد، فالمحاولة الفاشلة لا تُحسب. ولذلك مسار «لا نتيجة» يرجع صفر صفوف
--    ولا يرمي، والتحقق الشكلي يسبق العدّ فلا يستهلك رصيد الزائر بلا سبب.
--
-- المرجع: docs/VISION.md ملحق ٢ · docs/ROADMAP.md «دفعات ملاحظات المراجعة»
-- العقود: lib/booking-types.ts · lib/finance-types.ts · lib/dispatch-types.ts
-- ============================================================================

-- ============================================================================
-- (ق١) إعدادات الرحلات — `trip_settings` وقارئها المتسامح `trip_config()`
--
-- ماذا: صف وحيد يحمل مفتاح «الإلغاء التلقائي للطلب غير المدفوع» ومهلته.
-- لماذا جدول مستقل ولا مفتاح في `site_settings`: ذاك الجدول مقروء علناً بسياسة
-- `site_settings_select_public` (‏`using (true)` لـ anon)، وسياسة تشغيلية مثل
-- «متى نلغي الطلب غير المدفوع» لا تُعرض على الزائر. نفس سابقة `dispatch_settings`
-- و`discount_settings`. المصدر: `TripSettings` في `lib/booking-types.ts`.
--
-- ⚠ الافتراضي الآمن: الكنس **مطفأ** بالبذرة (نمط الفشل ٧ في handover/LESSONS.md —
-- بوابة الاختبار بُذرت مفعّلة مرة). ميزة تلغي حجوزات حقيقية بلا تدخل بشري لا
-- تُشحن مفعّلة؛ يفعّلها المالك بعد أن يحدد المهلة التي تناسب تشغيله.
-- ============================================================================

create table if not exists public.trip_settings (
  id                     boolean primary key default true check (id),
  -- تفعيل الإلغاء التلقائي للطلبات غير المدفوعة (الافتراضي: مطفأ)
  unpaid_cancel_enabled  boolean not null default false,
  -- المهلة بالدقائق من إنشاء الحجز حتى الإلغاء (ربع ساعة .. ٣٠ يوماً صمام أمان)
  unpaid_timeout_minutes integer not null default 1440
                         check (unpaid_timeout_minutes between 15 and 43200),
  updated_at             timestamptz not null default now()
);

insert into public.trip_settings (id) values (true) on conflict (id) do nothing;

drop trigger if exists trip_settings_touch_updated_at on public.trip_settings;
create trigger trip_settings_touch_updated_at
  before update on public.trip_settings
  for each row execute function public.touch_updated_at();

comment on table public.trip_settings is
  'إعدادات الرحلات — صف وحيد. المصدر: TripSettings في lib/booking-types.ts. جدول مستقل لا مفتاح في site_settings لأن الأخير مقروء لـ anon، وسياسة الإلغاء التلقائي شأن تشغيلي.';

comment on column public.trip_settings.unpaid_cancel_enabled is
  'مطفأ بالبذرة عمداً: ميزة تلغي حجوزات حقيقية بلا تدخل بشري لا تُشحن مفعّلة.';

-- ----------------------------------------------------------------------------
-- (ق١-٢) الصلاحيات والسياسات — نمط `dispatch_settings` حرفياً
-- السحب أولاً: Supabase تمنح الأدوار العامة صلاحيات واسعة افتراضياً على الجداول
-- الجديدة — منها TRUNCATE **وهي لا تخضع لـ RLS إطلاقاً**.
-- ----------------------------------------------------------------------------
alter table public.trip_settings enable row level security;

revoke all on public.trip_settings from public, anon, authenticated;

-- لا منح لـ anon — ولا حتى select
grant select, insert, update, delete on public.trip_settings to authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant select, insert, update, delete on public.trip_settings to service_role';
  end if;
end;
$$;

drop policy if exists "trip_settings_select_admin" on public.trip_settings;
create policy "trip_settings_select_admin"
  on public.trip_settings
  for select
  to authenticated
  using (public.is_admin());

drop policy if exists "trip_settings_insert_admin" on public.trip_settings;
create policy "trip_settings_insert_admin"
  on public.trip_settings
  for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "trip_settings_update_admin" on public.trip_settings;
create policy "trip_settings_update_admin"
  on public.trip_settings
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "trip_settings_delete_admin" on public.trip_settings;
create policy "trip_settings_delete_admin"
  on public.trip_settings
  for delete
  to authenticated
  using (public.is_admin());

-- ----------------------------------------------------------------------------
-- (ق١-٣) القارئ المتسامح — يرجع صفاً واحداً حتى لو كان الجدول فارغاً
-- التدهور الرشيق: بلا صف إعدادات تعمل القيم الافتراضية من العقد
-- (`DEFAULT_TRIP_SETTINGS` في lib/booking-types.ts).
-- ----------------------------------------------------------------------------
create or replace function public.trip_config()
returns table (
  unpaid_cancel_enabled  boolean,
  unpaid_timeout_minutes integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce(t.unpaid_cancel_enabled, false),
    coalesce(t.unpaid_timeout_minutes, 1440)
  from (select 1) one
  left join public.trip_settings t on t.id;
$$;

-- ⚠ لا منح لـ `authenticated`: نظيرها `dispatch_config()` غير ممنوحة لأحد
-- (0013)، وكل متعهد مستخدم `authenticated` — فمنحُها تعني أن يقرأ سياسة تشغيلنا
-- الداخلية بلا حاجة. والمشرف لا يحتاجها أصلاً: يقرأ `trip_settings` مباشرةً عبر
-- RLS. والدالة تُستدعى من داخل `cancel_stale_bookings` بهوية مالكها.
revoke all on function public.trip_config() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.trip_config() to service_role';
  end if;
end;
$$;

comment on function public.trip_config() is
  'قارئ إعدادات الرحلات — يرجع صفاً واحداً دائماً (left join على صف وحيد) فلا ينكسر مستهلكه على قاعدة لم تُبذر.';

-- ============================================================================
-- (ق٢) كنس الطلبات غير المدفوعة — `cancel_stale_bookings(p_limit)`
--
-- ماذا: يلغي الحجوزات العالقة في `pending_payment` بعد انقضاء المهلة.
--
-- لماذا حارسه `dispatch_ops_allowed()` ولا `is_admin()`: الدورة تعمل بمفتاح
-- الخدمة، وحارس `set_booking_status` صارم على `is_admin()` بلا مسار
-- `service_role` — فلا تُستدعى من دورة مجدولة أصلاً. ولذلك يكتب هذا الكنس
-- `update` مباشراً على `bookings` بهوية مالك الدالة، ومُشغّلات 0007 القائمة
-- (`bookings_guard_status` + `bookings_log_status_change`) تتكفّل بالحراسة
-- والسجل والإشعار. والانتقال `pending_payment → cancelled` **مسموح أصلاً** في
-- `booking_transition_allowed` فلا تُمسّ آلة الحالات.
--
-- ⚠ استثناء جلسة البوابة الحيّة: `settle_payment_event` تنقل الحجز عبر
-- `pending_payment → under_review → confirmed` داخل كتلة استثناء تُبقي المال
-- مقيَّداً إن فشل الانتقال. إلغاء حجز وجلسته حيّة ⇒ **مالٌ في الدفتر بلا حجز**.
-- والجلسة الأقدم من المهلة لا تحمي، وإلا صار الحجز خالداً.
--
-- ⚠ الحلقة صفاً صفاً لا `update` جماعياً: `tours.booking_note` يُستهلك **مرة
-- واحدة** بأول مُشغّل (`log_booking_change` يصفّره فور قراءته)، فالتحديث الجماعي
-- يكتب الملاحظة على أول صف ويترك الباقي بلا سبب مكتوب.
-- ============================================================================

create or replace function public.cancel_stale_bookings(p_limit integer default 200)
returns table (
  scanned   integer,
  cancelled integer,
  failed    integer
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_cfg       record;
  v_timeout   integer;
  v_id        uuid;
  v_rows      integer;
  v_scanned   integer := 0;
  v_cancelled integer := 0;
  v_failed    integer := 0;
begin
  if not public.dispatch_ops_allowed() then
    raise exception 'كنس الطلبات غير المدفوعة متاح للمشرف أو لخادم الموقع فقط'
      using hint = 'forbidden';
  end if;

  -- دورتان متزامنتان: الثانية ترجع أصفاراً بهدوء بدل أن تكنس مرة ثانية.
  -- القفل على مستوى المعاملة فيتحرر تلقائياً نجحت أو فشلت.
  if not pg_try_advisory_xact_lock(913027) then
    return query select 0, 0, 0;
    return;
  end if;

  select * into v_cfg from public.trip_config();

  -- المفتاح مطفأ ⇒ لا شيء بهدوء (لا خطأ: الدورة تُنادى بجدول ثابت)
  if not coalesce(v_cfg.unpaid_cancel_enabled, false) then
    return query select 0, 0, 0;
    return;
  end if;

  v_timeout := coalesce(v_cfg.unpaid_timeout_minutes, 1440);

  for v_id in
    select b.id
    from public.bookings b
    where b.status = 'pending_payment'
      and b.created_at < now() - make_interval(mins => v_timeout)
      and not exists (
        select 1
        from public.payment_intents i
        where i.booking_id = b.id
          and i.status in ('created', 'pending')
          and i.created_at > now() - make_interval(mins => v_timeout)
      )
    order by b.created_at
    limit greatest(coalesce(p_limit, 200), 1)
    for update skip locked
  loop
    v_scanned := v_scanned + 1;

    -- ⚠ كتلة استثناء **لكل صف**: بدونها يُسقط صفٌّ واحد فاشل المعاملةَ كلها،
    -- فلا يُلغى شيء، وتعيد الدورة المحاولة على الصف السام نفسه كل مرة إلى الأبد
    -- **بلا أثر**. والابتلاع هنا ليس صامتاً: `raise warning` في سجل الخادم،
    -- والعدّاد `failed` يظهر في رد المسار وفي شاشة الإعدادات — فيُرى العطب.
    begin
      -- الملاحظة تسافر إلى `booking_events` عبر متغيّر الجلسة، وتُضبط **قبل كل
      -- صف** لأن أول مُشغّل يستهلكها ويصفّرها.
      perform set_config(
        'tours.booking_note',
        'إلغاء تلقائي — انتهت مهلة الدفع (' || v_timeout || ' دقيقة)',
        true
      );

      update public.bookings b
         set status = 'cancelled'
       where b.id = v_id;

      get diagnostics v_rows = row_count;
      v_cancelled := v_cancelled + coalesce(v_rows, 0);
    exception
      when others then
        v_failed := v_failed + 1;
        raise warning 'تعذّر الإلغاء التلقائي للحجز % — %', v_id, sqlerrm;
    end;
  end loop;

  return query select v_scanned, v_cancelled, v_failed;
end;
$$;

revoke all    on function public.cancel_stale_bookings(integer) from public, anon, authenticated;
grant execute on function public.cancel_stale_bookings(integer) to authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.cancel_stale_bookings(integer) to service_role';
  end if;
end;
$$;

comment on function public.cancel_stale_bookings(integer) is
  'كنس الطلبات غير المدفوعة بعد انقضاء مهلة trip_settings. حارسه dispatch_ops_allowed() لا is_admin() لأنه يعمل بمفتاح الخدمة. يستثني الحجوزات ذات جلسة بوابة حيّة (payment_intents في created|pending أحدث من المهلة) حتى لا يُلغى حجز والمال في الطريق. الكنس **بلا أثر مالي بنيوياً**: حجز pending_payment لا قيود دفتر له فـ ledger_on_booking_cancelled تدور صفر مرات. القيد الوحيد الذي لا يعالجه هو استخدام كوبون محروق (coupon_redemptions بلا مُشغّل إرجاع) — وهو سلوك قائم للإلغاء اليدوي أيضاً، **مؤجَّل بقرار موثّق لا سهو**.';

-- ----------------------------------------------------------------------------
-- (ق٢-٢) جدولة اختيارية عبر pg_cron
-- المسار الرسمي للكنس هو نداء HTTP محروس بمفتاح مشترك — لأن pg_cron غير مضمون
-- على كل مشروع. فإن وُجد جدولناه زيادةً في المتانة، وإن فشلت الجدولة لأي سبب
-- مضت الهجرة بلا انكسار.
-- ----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin
      perform cron.schedule('tours-cancel-stale', '*/15 * * * *', 'select public.cancel_stale_bookings();');
      raise notice '✔ pg_cron: كنس الطلبات غير المدفوعة مجدول كل ١٥ دقيقة (المسار الرسمي HTTP يبقى عاملاً)';
    exception
      when others then
        raise notice '⚠ تعذّرت جدولة pg_cron (%) — استعمل مسار HTTP', sqlerrm;
    end;
  else
    raise notice 'ℹ لا pg_cron على هذه القاعدة — الكنس يُنادى عبر مسار HTTP المحروس';
  end if;
end;
$$;

-- ============================================================================
-- (ق٣) عمودا `payments` الجديدان + حجب الإيصال الداخلي في دالة التوكن
--
-- ماذا: `visible_to_customer` يقرر ظهور صف التحصيل للعميل، و`uploaded_by_admin`
-- يميّز ما رفعه فريق التشغيل نيابةً عنه.
--
-- ⚠ كلاهما `not null default`: إدراج بوابة الدفع في `settle_payment_event`
-- (0020) و`attach_receipt` (0009) لا يذكران أي عمود جديد، فبلا `default` ينكسر
-- مسار الدفع كله. والافتراضي `true` للظهور كي **لا يتغير سلوك الصفوف القائمة**.
-- ============================================================================

alter table public.payments add column if not exists visible_to_customer boolean not null default true;
alter table public.payments add column if not exists uploaded_by_admin   boolean not null default false;

comment on column public.payments.visible_to_customer is
  'يظهر للعميل في صفحة /booking/[token]؟ الافتراضي true فلا يتغير سلوك الصفوف القائمة. الحجب مفروض داخل get_booking_by_token بإسقاط الصف من الحمولة نفسها — لا في طبقة العرض: حامل التوكن يقرأ الحمولة الخام.';

comment on column public.payments.uploaded_by_admin is
  'رفعه فريق التشغيل نيابة عن العميل (وصله على واتساب أو هاتفياً) لا العميل بنفسه.';

-- ----------------------------------------------------------------------------
-- (ق٣-٢) التعديل الجراحي على `get_booking_by_token`
--
-- ⚠ لا `drop function` ولا تغيير في عدد أو أسماء الأعمدة السبعة عشر: التوقيع
-- نفسه مُختبَر (`booking_tests.sql` يفحص وجود الدالة ونتيجتها)، و`create or
-- replace` تفشل لو اختلف نوع الإرجاع. ولا حاجة لإعادة المنح لهذا السبب نفسه.
--
-- التغيير الوحيد سطرٌ واحد في `where` الخاص بـ `jsonb_agg`.
--
-- لماذا **إسقاط الصف** لا إخفاء حقل: `note` يحمل ملاحظة المشرف التشغيلية،
-- وإبقاء الصف بلا ملاحظة يُبقي أثر إيصال لم يعرف به العميل أصلاً. ونتيجةً لذلك
-- يختفي مع الصف المخفي سببُ الرفض الذي يقرؤه العميل في `app/booking/[token]` —
-- **وهذا صحيح**: الإيصال الداخلي لم يكن معروضاً له قط.
--
-- والحجب لا يمسّ المحاسبة: الإيصال المخفي المعتمَد يقيَّد في الدفتر ويستهلك حد
-- حساب الاستقبال كأي إيصال — الرؤية شأن العميل، والمال شأن الخزينة.
-- ----------------------------------------------------------------------------
create or replace function public.get_booking_by_token(p_token text)
returns table (
  id               uuid,
  reference        text,
  status           text,
  class_slug       text,
  class_title      text,
  total            numeric,
  currency         text,
  plan             text,
  amount_due       numeric,
  amount_remaining numeric,
  customer_name    text,
  customer_phone   text,
  customer_whatsapp text,
  trip             jsonb,
  created_at       timestamptz,
  updated_at       timestamptz,
  payments         jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    b.id,
    b.reference,
    b.status,
    b.class_slug,
    b.class_title,
    b.total,
    b.currency,
    b.plan,
    b.amount_due,
    b.amount_remaining,
    b.customer_name,
    b.customer_phone,
    b.customer_whatsapp,
    b.trip,
    b.created_at,
    b.updated_at,
    coalesce(
      (
        select jsonb_agg(
                 jsonb_build_object(
                   'id',         p.id,
                   'amount',     p.amount,
                   'status',     p.status,
                   'note',       p.note,
                   'createdAt',  p.created_at,
                   'verifiedAt', p.verified_at
                 )
                 order by p.created_at
               )
        from public.payments p
        where p.booking_id = b.id
          and p.visible_to_customer          -- ← 0027: الحجب في القاعدة لا في العرض
      ),
      '[]'::jsonb
    )
  from public.bookings b
  where p_token is not null
    and length(p_token) >= 32
    and b.public_token = p_token;
$$;

-- ============================================================================
-- (ق٤) رفع الإيصال من اللوحة نيابة عن العميل + التحكم في ظهوره
--
-- ماذا: العميل يرسل صورة التحويل على واتساب أو يمليها هاتفياً، فيرفعها فريق
-- التشغيل من اللوحة. الصف الناتج داخليٌّ بطبيعته (`p_visible` عند null = false)
-- والإظهار قرار صريح — الافتراضي الآمن.
-- ============================================================================

create or replace function public.admin_attach_receipt(
  p_booking_id   uuid,
  p_amount       numeric,
  p_receipt_path text,
  p_note         text,
  p_visible      boolean
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_booking    record;
  v_path       text;
  v_note       text;
  v_amount     numeric;
  v_payment_id uuid;
begin
  -- رفعٌ إداري ⇒ حارس إداري. لا مسار خدمة هنا: لا دورة مجدولة ترفع إيصالاً.
  if not public.is_admin() then
    raise exception 'رفع الإيصال نيابة عن العميل متاح للمشرف فقط'
      using hint = 'forbidden';
  end if;

  select b.* into v_booking
  from public.bookings b
  where b.id = p_booking_id
  for update;

  if not found then
    raise exception 'الحجز غير موجود' using hint = 'booking-not-found';
  end if;

  if v_booking.status not in ('pending_payment', 'under_review') then
    raise exception 'لا يمكن رفع إيصال والحجز في حالة «%»', v_booking.status
      using hint = 'invalid-status';
  end if;

  -- ⚠ رفض التعدد: `verify_payment` تعالج **الأحدث المعلّق وحده**، فصفٌّ ثانٍ
  -- يترك الأول معلّقاً إلى الأبد بلا زر يغلقه.
  if exists (
    select 1
    from public.payments p
    where p.booking_id = p_booking_id
      and p.status = 'pending'
  ) then
    raise exception 'يوجد إيصال معلّق — اعتمده أو ارفضه أولاً'
      using hint = 'receipt-pending';
  end if;

  -- لا سقف علوي مفروض: المشرف قد يسجّل تحويلاً زائداً والدفتر يستوعبه.
  v_amount := round(coalesce(p_amount, 0), 2);
  if v_amount <= 0 then
    raise exception 'قيمة التحويل يجب أن تكون أكبر من صفر' using hint = 'invalid-input';
  end if;

  v_path := nullif(btrim(coalesce(p_receipt_path, '')), '');
  if v_path is null then
    raise exception 'مسار الإيصال مطلوب' using hint = 'invalid-input';
  end if;

  -- ⚠ المسار **يُتحقق منه لا يُصدَّق**: بلا هذا يستطيع مشرف — سهواً أو بلصق
  -- خاطئ — أن يعلّق على هذا الحجز مسارَ إيصال حجزٍ آخر، فيراه من يفتح الطلب
  -- بصلاحية توقيع الرابط. شرطان معاً: الملف موجود فعلاً في الدلو، وتحت بادئة
  -- هذا الحجز حصراً (`admin/<booking_id>/…` وهي البادئة التي ترفع إليها اللوحة).
  -- مسار الضيف مقطعان تحت التوكن ولا يمرّ من هنا أصلاً.
  if v_path not like ('admin/' || p_booking_id::text || '/%') then
    raise exception 'مسار الإيصال لا يخص هذا الحجز' using hint = 'invalid-input';
  end if;

  if not exists (
    select 1
    from storage.objects o
    where o.bucket_id = 'receipts'
      and o.name = v_path
  ) then
    raise exception 'لم يُعثر على ملف الإيصال في المخزن — أعد الرفع'
      using hint = 'receipt-missing';
  end if;

  v_note := nullif(btrim(coalesce(p_note, '')), '');

  -- `account_id = null` عمداً: حساب الاستقبال يُثبَّت عند الاعتماد لا عند الرفع
  -- (‏`attach_receipt` القائمة تفعل الشيء نفسه حين لا يمرّر الرافع حساباً).
  insert into public.payments as p (
    booking_id, account_id, amount, receipt_path, status,
    note, visible_to_customer, uploaded_by_admin
  )
  values (
    p_booking_id, null, v_amount, v_path, 'pending',
    v_note, coalesce(p_visible, false), true
  )
  returning p.id into v_payment_id;

  if v_booking.status = 'pending_payment' then
    perform set_config(
      'tours.booking_note',
      'إيصال رفعه فريق التشغيل نيابة عن العميل',
      true
    );

    update public.bookings b
       set status = 'under_review'
     where b.id = p_booking_id;

    -- الإشعار الوسيط «رفع العميل إيصالاً» رسالة كاذبة هنا (التشغيل هو الرافع)،
    -- وتنبيهُ التشغيل بأن التشغيل فعل شيئاً ضجيج. يُطفأ فور توليده كما يفعل
    -- مسار البوابة في 0020، ويبقى إشعار التأكيد وحده.
    update public.notifications n
       set status = 'skipped',
           error  = 'رفعه فريق التشغيل من اللوحة'
     where n.status = 'queued'
       and n.event  = 'receipt_uploaded'
       and n.payload ->> 'bookingId' = p_booking_id::text;
  end if;

  return v_payment_id;
end;
$$;

comment on function public.admin_attach_receipt(uuid, numeric, text, text, boolean) is
  'رفع إيصال من اللوحة نيابة عن العميل. يقبل الحجز في pending_payment أو under_review فقط، ويرفض بوجود إيصال pending آخر لأن verify_payment تعالج الأحدث وحده. p_visible عند null = false: ما يرفعه التشغيل داخليٌّ بطبيعته والإظهار قرار صريح.';

-- ----------------------------------------------------------------------------
-- (ق٤-٢) تبديل ظهور إيصال قائم — الزر الذي يجعل الحجب قابلاً للتراجع
-- ----------------------------------------------------------------------------
create or replace function public.set_receipt_visibility(
  p_payment_id uuid,
  p_visible    boolean
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_visible boolean;
begin
  if not public.is_admin() then
    raise exception 'تغيير ظهور الإيصال متاح للمشرف فقط' using hint = 'forbidden';
  end if;

  update public.payments p
     set visible_to_customer = coalesce(p_visible, false)
   where p.id = p_payment_id
  returning p.visible_to_customer into v_visible;

  if not found then
    raise exception 'الإيصال غير موجود' using hint = 'payment-not-found';
  end if;

  return v_visible;
end;
$$;

comment on function public.set_receipt_visibility(uuid, boolean) is
  'تبديل ظهور صف تحصيل للعميل. الحجب إسقاط صف كامل من حمولة get_booking_by_token لا إخفاء حقل — لأن note يحمل ملاحظة المشرف التشغيلية.';

-- ----------------------------------------------------------------------------
-- (ق٤-٣) صلاحيات الدالتين — الحارس داخلي، ولا منح لـ anon بحال.
-- (`create or replace` لا يعيد ضبط الصلاحيات، والدالة الجديدة تولد مفتوحة.)
-- ولا سياسة تخزين جديدة: `receipts_insert_guest` في 0009 تقبل أصلاً
-- `... or public.is_admin()`، فرفع المشرف للملف مغطّى بلا تعديل.
-- ----------------------------------------------------------------------------
revoke all    on function public.admin_attach_receipt(uuid, numeric, text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.admin_attach_receipt(uuid, numeric, text, text, boolean)
  to authenticated;

revoke all    on function public.set_receipt_visibility(uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.set_receipt_visibility(uuid, boolean)
  to authenticated;

-- ============================================================================
-- (ق٥) فحص ذاتي للجزء الأول — الهجرة تسقط بدل أن تمضي ناقصة
-- ============================================================================
do $$
declare
  v_missing text;
  v_src     text;
begin
  -- (١) العمودان موجودان و`not null` ولهما قيمة افتراضية (ف٤: بلا `default`
  --     ينكسر إدراج البوابة في settle_payment_event وإدراج attach_receipt).
  select string_agg(x.col, '، ')
    into v_missing
  from (values ('visible_to_customer'), ('uploaded_by_admin')) as x(col)
  where not exists (
    select 1
    from information_schema.columns c
    where c.table_schema     = 'public'
      and c.table_name       = 'payments'
      and c.column_name      = x.col
      and c.is_nullable      = 'NO'
      and c.column_default is not null
  );

  if v_missing is not null then
    raise exception
      '0027: أعمدة payments الجديدة مفقودة أو بلا (not null default): %', v_missing;
  end if;

  -- (٢) الحجب مفروض في دالة التوكن نفسها لا في طبقة العرض
  v_src := pg_get_functiondef(to_regprocedure('public.get_booking_by_token(text)')::oid);

  -- شاهد إيجابي للمسبار: نفس أسلوب المطابقة يلتقط رمزاً نعلم وجوده يقيناً
  if position('jsonb_agg' in coalesce(v_src, '')) = 0 then
    raise exception
      '0027: مسبار مصدر get_booking_by_token لا يلتقط jsonb_agg — المطابقة معطّلة فلا تصدّق ما بعدها';
  end if;

  if position('visible_to_customer' in v_src) = 0 then
    raise exception '0027: حجب الإيصال غير مفروض في دالة التوكن';
  end if;

  -- (٣) الزائر لم يكتسب شيئاً من هذا الجزء (الدور قد لا يوجد على قاعدة غير
  --     Supabase، فالفحص مشروط بوجوده — نمط 0026 §٩-٦).
  if exists (select 1 from pg_roles where rolname = 'anon') then
    if has_function_privilege(
         'anon',
         'public.admin_attach_receipt(uuid,numeric,text,text,boolean)',
         'execute'
       ) then
      raise exception '0027: admin_attach_receipt ممنوحة لـ anon — رفعٌ إداري بيد الزائر';
    end if;

    if has_function_privilege('anon', 'public.set_receipt_visibility(uuid,boolean)', 'execute') then
      raise exception '0027: set_receipt_visibility ممنوحة لـ anon — الزائر يكشف الإيصالات المخفية';
    end if;

    if has_function_privilege('anon', 'public.cancel_stale_bookings(integer)', 'execute') then
      raise exception '0027: cancel_stale_bookings ممنوحة لـ anon — كنس الحجوزات بيد الزائر';
    end if;

    if has_table_privilege('anon', 'public.trip_settings', 'select') then
      raise exception '0027: الزائر يقرأ trip_settings — سياسة تشغيلية على الملأ';
    end if;
  end if;

  -- (٤) القارئ المتسامح يرجع صفاً واحداً حتى على قاعدة لم تُبذر
  if (select count(*) from public.trip_config()) <> 1 then
    raise exception '0027: trip_config() لا ترجع صفاً واحداً — المستهلك سينكسر على قاعدة فارغة';
  end if;

  raise notice '✔ 0027 الجزء ١: trip_settings + trip_config · cancel_stale_bookings · حجب الإيصال في get_booking_by_token · admin_attach_receipt + set_receipt_visibility';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ق٦) سقف ديون المتعهدين — الجدول وقارئه
--
-- ماذا: صف وحيد يحمل سياسة الائتمان تجاه المتعهدين كلهم (لا سقف لكل متعهد على
-- حدة في هذه الدفعة — ف١٤: `subcontractors` يكتبه المتعهد نفسه فلا يُوضع عليه
-- عمود سقف بحال).
--
-- لماذا: نص بدر «قد تترتب على المتعهد مبالغ كبيرة جداً وهذا غير منطقي … المطلوب
-- سقف معيّن لديون المتعهدين، فلا ندفع لمتعهد بينما لنا عنده مال». وهما قاعدتان
-- لا واحدة: سقف تعرّض (لا عروض ولا فوز بعد بلوغه) ومنع دفع لمدين.
--
-- `debt_limit = 0` تعني **بلا سقف** (الميزة خاملة) — نفس دلالة `min_margin_amount`
-- في إعدادات البث، فلا يتغيّر سلوك قاعدة قائمة بمجرد تطبيق هذه الهجرة.
-- ----------------------------------------------------------------------------
create table if not exists public.partner_credit_settings (
  id             boolean primary key default true check (id),
  -- سقف ما يجوز أن يترتب على المتعهد لنا بالجنيه — صفر = بلا سقف
  debt_limit     numeric(12,2) not null default 0 check (debt_limit >= 0),
  -- منع العروض والفوز عند بلوغ السقف
  block_dispatch boolean not null default true,
  -- منع تسجيل دفعة لمتعهد رصيده سالب (مدين لنا)
  block_payout   boolean not null default true,
  updated_at     timestamptz not null default now()
);

insert into public.partner_credit_settings (id) values (true) on conflict (id) do nothing;

drop trigger if exists partner_credit_settings_touch_updated_at on public.partner_credit_settings;
create trigger partner_credit_settings_touch_updated_at
  before update on public.partner_credit_settings
  for each row execute function public.touch_updated_at();

comment on table public.partner_credit_settings is
  'سياسة ائتمان المتعهدين — صف وحيد. المصدر: PartnerCreditSettings في lib/finance-types.ts. debt_limit = 0 تعني بلا سقف (الميزة خاملة). و block_payout افتراضياً true: «فلا ندفع لمتعهد بينما لنا عنده مال» — وهو نقض واعٍ لسلوك سابق كان موثّقاً بأنه مقصود (الدفع لشريك مدين لنا بوصفه مقدَّماً عن رحلات قادمة)؛ نقضه المالك نصاً، والتجاوز يبقى ممكناً بقرار بشري صريح عبر record_partner_payout_advance.';

comment on column public.partner_credit_settings.debt_limit is
  'سقف الدين بالجنيه. صفر = بلا سقف. يقيس الدين **المُثبَت في الدفتر** ولا يقع قيد إلا عند completed — فالرحلات الجارية لا تظهر فيه، وهذا نطاق الرقم لا عطب فيه.';

-- RLS + الصلاحيات — نمط `dispatch_settings` في 0013 حرفياً.
-- السحب أولاً: إعدادات Supabase الافتراضية تمنح anon/authenticated كل شيء على أي
-- جدول جديد، ومنها TRUNCATE وهي **لا تخضع لـ RLS** إطلاقاً.
alter table public.partner_credit_settings enable row level security;

revoke all on public.partner_credit_settings from public, anon, authenticated;

grant select, insert, update, delete on public.partner_credit_settings to authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant select, insert, update, delete on public.partner_credit_settings to service_role';
  end if;
end;
$$;

drop policy if exists "partner_credit_settings_select_admin" on public.partner_credit_settings;
create policy "partner_credit_settings_select_admin"
  on public.partner_credit_settings
  for select
  to authenticated
  using (public.is_admin());

drop policy if exists "partner_credit_settings_insert_admin" on public.partner_credit_settings;
create policy "partner_credit_settings_insert_admin"
  on public.partner_credit_settings
  for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "partner_credit_settings_update_admin" on public.partner_credit_settings;
create policy "partner_credit_settings_update_admin"
  on public.partner_credit_settings
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "partner_credit_settings_delete_admin" on public.partner_credit_settings;
create policy "partner_credit_settings_delete_admin"
  on public.partner_credit_settings
  for delete
  to authenticated
  using (public.is_admin());

-- القارئ المتسامح — نمط `dispatch_config()`: يُرجع صفاً واحداً حتى لو الجدول
-- فارغ، فلا تسقط دالة تعتمد عليه لأن أحداً لم يفتح شاشة الإعدادات بعد.
create or replace function public.partner_credit_config()
returns table (
  debt_limit     numeric,
  block_dispatch boolean,
  block_payout   boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  -- التدهور الرشيق: بلا صف إعدادات تعمل القيم الافتراضية من العقد
  select
    coalesce(c.debt_limit, 0),
    coalesce(c.block_dispatch, true),
    coalesce(c.block_payout, true)
  from (select 1) one
  left join public.partner_credit_settings c on c.id;
$$;

comment on function public.partner_credit_config() is
  'قارئ سياسة الائتمان — صف واحد دائماً. **لا يُمنح لأي دور مستخدم**: يُستدعى من داخل دوال definer وحدها (partner_over_debt_limit و record_partner_payout).';

-- دالة داخلية بحتة: لا تُمنح لأي دور (ولا حتى service_role) — لا مستهلك لها من
-- خارج القاعدة، واللوحة تقرأ الجدول نفسه بسياسات `is_admin()`.
revoke all on function public.partner_credit_config() from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- (ق٧) الحكم الوحيد — `partner_debt` و `partner_over_debt_limit`
--
-- ماذا: معادلة الدين ومقارنتها بالسقف في مكان واحد، تقرؤها ثلاثة مواضع (البث،
-- مُشغّل القبول، البورتال) فلا تتكرر المعادلة ولا تنحرف نسخها.
--
-- ⚠ **لماذا `security definer` وهو أخطر ما في هذه الميزة (ف١٠):**
-- `v_partner_settlements` عرض `security_invoker = true` فوق `ledger_entries`
-- المحروس بسياسة `is_admin()`. فلو قُرئ العرض بهوية المتعهد نفسه — أو بأي هوية
-- ليست مشرفاً — لعاد بـ **صفر صفوف بهدوء**، فيصير `coalesce(net_due, 0) = 0`
-- ويُقرأ المتعهد المدين على أنه صافي الذمة ⇒ **السقف لا يقع على من وُضع لأجله
-- أبداً، وبلا خطأ ولا أثر في أي سجل**. و`security definer` يجعل المنفِّذ مالكَ
-- الدوال (وهو مالك `ledger_entries` نفسه)، ومالك الجدول لا تُطبَّق عليه RLS ما
-- لم تُفعَّل `force row level security` — وهي غير مفعّلة على أي جدول في هذا
-- المستودع. فالقراءة كاملة يقيناً.
--
-- ومن هنا: **لا تُمنح أيٌّ من هاتين الدالتين لأي دور مستخدم**، وإلا صار المتعهد
-- قادراً على استكشاف دين منافسه بالتجربة (سابقة `coverage_matches` في 0011).
-- ----------------------------------------------------------------------------
create or replace function public.partner_debt(p_sub uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  -- `coalesce` قبل السالب لا بعده: المتعهد الذي **لا قيد له في الدفتر** غائب عن
  -- العرض أصلاً (‏`join public.subcontractors` لا `left join` في 0017)، فبلا
  -- coalesce يعود null فيسقط كل شرط يقارنه في اتجاه غير مقصود.
  select greatest(-coalesce(
           (select ps.net_due from public.v_partner_settlements ps
             where ps.subcontractor_id = p_sub), 0), 0);
$$;

comment on function public.partner_debt(uuid) is
  'ما على المتعهد لنا بالجنيه = greatest(-net_due, 0)؛ صفر إن كنا نحن المدينين. security definer عمداً: العرض تحته security_invoker فوق ledger_entries المحروس بـ is_admin()، وقراءته بهوية غير مشرف تعود بصفر صفوف بهدوء فيسقط السقف كله. **لا تُمنح لأي دور مستخدم.**';

create or replace function public.partner_over_debt_limit(p_sub uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_cfg   record;
  v_limit numeric;
begin
  select * into v_cfg from public.partner_credit_config();

  -- الميزة خاملة: بلا تفعيل أو بسقف صفر لا يُحجب أحد (الافتراضي على قاعدة قائمة)
  if not coalesce(v_cfg.block_dispatch, false) or coalesce(v_cfg.debt_limit, 0) <= 0 then
    return false;
  end if;

  v_limit := v_cfg.debt_limit;

  -- «بلغ السقف» لا «تجاوزه»: من وصل إلى الحد يتوقف عنده
  return public.partner_debt(p_sub) >= v_limit;
end;
$$;

comment on function public.partner_over_debt_limit(uuid) is
  'الحكم الوحيد الذي تقرؤه ثلاثة مواضع: dispatch_broadcast (فلا يصله عرض) و trip_offers_guard_accept (فلا يفوز) و portal_offers (فلا يبقى زرٌّ يفشل دائماً). المعادلة هنا وحدها فلا تتكرر ولا تنحرف. **لا تُمنح لأي دور مستخدم** — وإلا استكشف المتعهد دين منافسه بالتجربة.';

revoke all on function public.partner_debt(uuid)            from public, anon, authenticated;
revoke all on function public.partner_over_debt_limit(uuid) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- (ق٨) الحاجز الحقيقي — مُشغّل جدول `trip_offers`
--
-- ماذا: القاعدة في **الجدول** لا في الدالة — تماماً كما فُرضت قاعدة «لا يفوز
-- متعهد غير معتمد» في 0014. فتغطي `accept_offer` و`manual_assign` ومحرر SQL وأي
-- كاتب مستقبلي سها عن الشرط.
--
-- ولا رقم في رسالة الرفض: البورتال لا يعرض للمتعهد رصيداً اليوم أصلاً، والرفض
-- ليس مكان كشفه. الواجهة تترجم `hint = 'debt-limit'`.
--
-- والتجاوز البشري الصريح عبر `manual_assign_over_limit(...)` وحدها — نفس نمط
-- `manual_assign_with_loss` وليست بديلاً عنها: كلٌّ ترفع حارساً مختلفاً، ومن
-- احتاج الاثنين معاً يرفع أرضية الهامش أو يسدّد الدين أولاً.
-- ----------------------------------------------------------------------------
create or replace function public.trip_offers_guard_accept()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  if new.status = 'accepted' and coalesce(old.status, '') is distinct from 'accepted' then
    select s.status into v_status
    from public.subcontractors s
    where s.id = new.subcontractor_id;

    if coalesce(v_status, '') <> 'approved' then
      raise exception 'حساب المتعهد غير معتمد — لا يمكن إسناد رحلة إليه'
        using hint = 'forbidden';
    end if;

    -- 0027: سقف الدين. التجاوز يمر من `manual_assign_over_limit` وحدها فيُسجَّل
    -- في سجل الاستدعاءات وفي ملاحظة الإسناد، ولا يقع «بالخطأ» من نموذج عادي.
    if coalesce(nullif(current_setting('tours.allow_partner_debt', true), ''), 'off') <> 'on'
       and public.partner_over_debt_limit(new.subcontractor_id) then
      raise exception 'المتعهد بلغ سقف الدين المسموح — تعذّر إسناد الرحلة إليه'
        using hint = 'debt-limit';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trip_offers_guard_accept on public.trip_offers;
create trigger trip_offers_guard_accept
  before insert or update on public.trip_offers
  for each row execute function public.trip_offers_guard_accept();

comment on function public.trip_offers_guard_accept() is
  'حارس الفوز في الجدول: لا يفوز متعهد غير معتمد، ولا متعهد بلغ سقف دينه. يغطي accept_offer و manual_assign ومحرر SQL وأي كاتب مستقبلي. تجاوز السقف بقرار بشري صريح عبر manual_assign_over_limit.';

-- إسناد يدوي فوق سقف الدين — دالة منفصلة عمداً على سابقة `manual_assign_with_loss`:
-- الاسم نفسه يجعل القرار ظاهراً في سجل الاستدعاءات وفي كود الواجهة.
create or replace function public.manual_assign_over_limit(
  p_booking_id       uuid,
  p_subcontractor_id uuid,
  p_payout           numeric,
  p_note             text
)
returns table (
  booking        uuid,
  partner        uuid,
  payout_amount  numeric,
  revoked_offers integer
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not public.dispatch_ops_allowed() then
    raise exception 'الإسناد اليدوي متاح للمشرف فقط' using hint = 'forbidden';
  end if;

  if coalesce(btrim(p_note), '') = '' then
    raise exception 'الإسناد فوق سقف الدين يتطلب تدوين السبب' using hint = 'note-required';
  end if;

  perform set_config('tours.allow_partner_debt', 'on', true);
  return query
    select * from public.manual_assign(p_booking_id, p_subcontractor_id, p_payout, p_note);
end;
$$;

comment on function public.manual_assign_over_limit(uuid, uuid, numeric, text) is
  'التجاوز البشري الصريح لسقف دين المتعهد. ليست بديلاً عن manual_assign_with_loss: كلٌّ ترفع حارساً مختلفاً، ومن احتاج الاثنين معاً يرفع أرضية الهامش أو يسدّد الدين أولاً.';

revoke all on function public.manual_assign_over_limit(uuid, uuid, numeric, text)
  from public, anon, authenticated;
grant execute on function public.manual_assign_over_limit(uuid, uuid, numeric, text) to authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.manual_assign_over_limit(uuid, uuid, numeric, text) to service_role';
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- (ق٩) لا يصله عرض أصلاً — `dispatch_broadcast`
--
-- ماذا: شرط واحد يُضاف إلى `where` الخاص بالإدراج من الحوض، بجوار شرط «من رفض
-- لا يُعاد عليه». الجسم بقيته كما هو حرفياً في 0013.
--
-- ⚠ **ولا تُلمس `dispatch_pool` نفسها**: `manual_assign` تشتق منها المستحق
-- الافتراضي حين لا يمرّر المشغّل مبلغاً (‏0013). فتصفية الحوض تُخرج للمشغّل رسالة
-- «مستحق المتعهد مطلوب ولا يكون سالباً» المضلِّلة — وتغلق مسار التجاوز البشري
-- نفسه الذي بنيناه في ق٨.
-- ----------------------------------------------------------------------------
create or replace function public.dispatch_broadcast(p_booking_id uuid, p_round integer)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_cfg     record;
  v_expires timestamptz;
  v_base    jsonb;
  v_count   integer := 0;
  v_row     record;
begin
  select * into v_cfg from public.dispatch_config();
  v_expires := now() + make_interval(mins => v_cfg.window_minutes);
  v_base    := public.dispatch_trip_payload(p_booking_id, true);

  if v_base is null then
    return 0;
  end if;

  -- صف الدورة موجود دائماً قبل أي عرض: عرض بلا دورة لا يظهر في البورتال ولا
  -- تلتقطه الدورة المجدولة، فيبقى معلّقاً إلى الأبد. سطر احتياطي لا أكثر.
  insert into public.dispatches as d0 (booking_id, status)
  values (p_booking_id, 'queued')
  on conflict (booking_id) do nothing;

  -- صف الدورة أولاً (ترتيب الأقفال الثابت في هذا الملف: dispatches ← trip_offers ← bookings)
  update public.dispatches d
     set status            = 'broadcasting',
         round             = p_round,
         last_broadcast_at = now()
   where d.booking_id = p_booking_id;

  for v_row in
    with fresh as (
      insert into public.trip_offers as o (booking_id, subcontractor_id, round, payout, status, expires_at)
      select p_booking_id, p.subcontractor_id, p_round, p.payout, 'pending', v_expires
      from public.dispatch_pool(p_booking_id, p_round) p
      where not exists (
        select 1 from public.trip_offers prev
        where prev.booking_id       = p_booking_id
          and prev.subcontractor_id = p.subcontractor_id
          and prev.status           = 'rejected'
      )
        -- 0027: من بلغ سقف دينه لا يصله عرض أصلاً. التصفية هنا لا في الحوض عمداً
        -- (‏`manual_assign` تشتق المستحق الافتراضي من الحوض).
        and not public.partner_over_debt_limit(p.subcontractor_id)
      on conflict (booking_id, subcontractor_id, round) do nothing
      returning o.id, o.subcontractor_id, o.payout, o.expires_at
    )
    select f.id, f.subcontractor_id, f.payout, f.expires_at,
           s.company_name, s.email
    from fresh f
    join public.subcontractors s on s.id = f.subcontractor_id
  loop
    v_count := v_count + 1;

    perform public.queue_notification(
      'trip_offered',
      v_base || jsonb_build_object(
        'offerId',          v_row.id,
        'subcontractorId',  v_row.subcontractor_id,
        'companyName',      v_row.company_name,
        'partnerEmail',     v_row.email,
        'payout',           v_row.payout,
        'expiresAt',        v_row.expires_at,
        'windowMinutes',    v_cfg.window_minutes,
        'round',            p_round,
        'maxRounds',        v_cfg.max_rounds
      )
    );
  end loop;

  return v_count;
end;
$$;

-- `create or replace function` لا يعيد ضبط الصلاحيات، لكن إعادة التأكيد أرخص من
-- ثغرة — والقاعدة من 0013 تبقى: دالة داخلية بحتة بلا أي منح.
revoke all on function public.dispatch_broadcast(uuid, integer) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- (ق١٠) لا زرّ يفشل دائماً — `portal_offers`
--
-- ماذا: نفس نوع الإرجاع حرفياً (‏`OfferPreview` — **لا عمود جديد**) مع الشرط
-- نفسه. ولماذا: العرض الذي بُث قبل بلوغ السقف يبقى في الجدول، فلولا هذا الشرط
-- لرأى المتعهد زراً يفشل في كل مرة يضغطه بحاجز ق٨ — وهو نمط الفشل ٣ (طريق مسدود).
-- ----------------------------------------------------------------------------
create or replace function public.portal_offers()
returns table (
  offer_id     uuid,
  reference    text,
  origin_label text,
  dest_label   text,
  distance_km  numeric,
  passengers   integer,
  round_trip   boolean,
  waiting_hours numeric,
  class_title  text,
  pickup_at    timestamptz,
  payout       numeric,
  currency     text,
  expires_at   timestamptz,
  notes        text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    o.id,
    b.reference,
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
  order by o.expires_at asc;
$$;

-- إعادة تثبيت منح 0013 كما هي (`create or replace` لم يمسّها — تأكيد لا تغيير)
revoke all    on function public.portal_offers() from public, anon, authenticated;
grant execute on function public.portal_offers() to authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.portal_offers() to service_role';
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- (ق١١) منع الدفع لمدين — `record_partner_payout`
--
-- ماذا: فحص واحد يُضاف بعد التحقق من حساب الخزينة وقبل الإدراج. الجسم بقيته كما
-- هو حرفياً في 0015، ونوع الإرجاع الستة كما هو.
--
-- لماذا: «فلا ندفع لمتعهد بينما لنا عنده مال». والرسالة إدارية بحتة (لا يقرؤها
-- متعهد) فيجوز فيها الرقم — بخلاف رسالة ق٨.
--
-- والتجاوز الصريح في `record_partner_payout_advance` أدناه: المقدَّم عن رحلات
-- قادمة قرار مشروع، لكنه قرار **مكتوب** لا افتراض صامت.
-- ----------------------------------------------------------------------------
create or replace function public.record_partner_payout(
  p_sub     uuid,
  p_account uuid,
  p_amount  numeric,
  p_at      timestamptz,
  p_note    text
)
returns table (
  id          uuid,
  entry_id    uuid,
  amount      numeric,
  occurred_at timestamptz,
  net_due     numeric,
  balance     numeric
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id      uuid;
  v_entry   uuid;
  v_amount  numeric;
  v_at      timestamptz;
  v_net     numeric;
  v_balance numeric;
  v_block   boolean;
begin
  if not public.finance_admin_allowed() then
    raise exception 'تسجيل دفعات المتعهدين متاح للإدارة فقط' using hint = 'forbidden';
  end if;

  v_amount := round(coalesce(p_amount, 0), 2);
  if v_amount <= 0 then
    raise exception 'قيمة الدفعة يجب أن تكون أكبر من صفر' using hint = 'invalid-input';
  end if;

  if p_sub is null
     or not exists (select 1 from public.subcontractors s where s.id = p_sub) then
    raise exception 'المتعهد غير موجود' using hint = 'not-found';
  end if;

  if p_account is null
     or not exists (select 1 from public.payment_accounts pa where pa.id = p_account) then
    raise exception 'حساب الخزينة غير موجود' using hint = 'account-not-found';
  end if;

  -- 0027: لا دفعة لمدين إلا بقرار صريح من `record_partner_payout_advance`
  select c.block_payout into v_block from public.partner_credit_config() c;
  if coalesce(v_block, false)
     and coalesce(nullif(current_setting('tours.allow_partner_advance', true), ''), 'off') <> 'on'
     and public.partner_debt(p_sub) > 0 then
    raise exception 'المتعهد مدين لنا بـ % — سدّد الرصيد أولاً أو سجّل الدفعة كمقدَّم صريح',
      round(public.partner_debt(p_sub), 2)
      using hint = 'partner-owing';
  end if;

  v_at := coalesce(p_at, now());

  insert into public.partner_payouts as x (
    subcontractor_id, account_id, amount, occurred_at, note, created_by
  )
  values (
    p_sub, p_account, v_amount, v_at,
    nullif(btrim(coalesce(p_note, '')), ''),
    public.current_actor()
  )
  returning x.id into v_id;

  select e.id into v_entry
  from public.ledger_entries e
  where e.source_type     = 'partner_payout'
    and e.source_id       = v_id
    and e.settlement_role = 'paid'
  limit 1;

  select ps.net_due into v_net
  from public.v_partner_settlements ps
  where ps.subcontractor_id = p_sub;

  select ab.balance into v_balance
  from public.v_account_balances ab
  where ab.account_id = p_account;

  id          := v_id;
  entry_id    := v_entry;
  amount      := v_amount;
  occurred_at := v_at;
  net_due     := coalesce(v_net, 0);
  balance     := v_balance;
  return next;
end;
$$;

comment on function public.record_partner_payout(uuid, uuid, numeric, timestamptz, text) is
  'تسجيل دفعة لمتعهد. 0027: ترفض الدفع لمن عليه دين لنا حين block_payout مفعّل — والتجاوز عبر record_partner_payout_advance بملاحظة إلزامية.';

-- المقدَّم الصريح — على سابقة `manual_assign_with_loss`: دالة منفصلة باسمها،
-- فيظهر القرار في سجل الاستدعاءات وفي كود الواجهة ولا يقع بالخطأ من نموذج عادي.
create or replace function public.record_partner_payout_advance(
  p_sub     uuid,
  p_account uuid,
  p_amount  numeric,
  p_at      timestamptz,
  p_note    text
)
returns table (
  id          uuid,
  entry_id    uuid,
  amount      numeric,
  occurred_at timestamptz,
  net_due     numeric,
  balance     numeric
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not public.finance_admin_allowed() then
    raise exception 'تسجيل دفعات المتعهدين متاح للإدارة فقط' using hint = 'forbidden';
  end if;

  -- مقدَّمٌ بلا سبب مكتوب هو بالضبط ما يفسد الدفاتر بعد ستة أشهر: رقم لا أحد
  -- يعرف من أين جاء. فالملاحظة شرط لا خيار (نفس قاعدة `record_adjustment`).
  if coalesce(btrim(p_note), '') = '' then
    raise exception 'الدفع لمتعهد مدين يتطلب تدوين السبب' using hint = 'note-required';
  end if;

  perform set_config('tours.allow_partner_advance', 'on', true);
  return query
    select * from public.record_partner_payout(p_sub, p_account, p_amount, p_at, p_note);
end;
$$;

comment on function public.record_partner_payout_advance(uuid, uuid, numeric, timestamptz, text) is
  'المقدَّم الصريح لمتعهد مدين لنا — تجاوز بشري موثّق لقاعدة block_payout، بملاحظة إلزامية.';

revoke all    on function public.record_partner_payout_advance(uuid, uuid, numeric, timestamptz, text)
  from public, anon, authenticated;
grant execute on function public.record_partner_payout_advance(uuid, uuid, numeric, timestamptz, text)
  to authenticated;

-- ----------------------------------------------------------------------------
-- (ق١١-٣) الحاجز في الجدول — لا يكفي الفحص داخل الدالة
--
-- `0015` يمنح `insert` على `partner_payouts` لـ `authenticated` وسياسته
-- `partner_payouts_insert_admin` تسمح لأي مشرف. فمشرفٌ يُدرج صفاً مباشرةً عبر
-- PostgREST يحصل على قيد `paid` في الدفتر بمُشغّل 0015 **ويتخطى فحص الدالة
-- بالكامل**. وهذه بالضبط ذات العلة التي عولجت في 0014 بنقل قاعدة «لا يفوز متعهد
-- غير معتمد» من الدالة إلى الجدول — فتُعالَج هنا بالعلاج نفسه.
--
-- والمُشغّل يقرأ نفس متغيّر الجلسة الذي ترفعه `record_partner_payout_advance`،
-- فيبقى للتجاوز البشري بابٌ واحد معلوم.
-- ----------------------------------------------------------------------------
create or replace function public.partner_payouts_guard_owing()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_block boolean;
  v_debt  numeric;
begin
  select c.block_payout into v_block from public.partner_credit_config() c;

  if not coalesce(v_block, false) then
    return new;
  end if;

  if coalesce(nullif(current_setting('tours.allow_partner_advance', true), ''), 'off') = 'on' then
    return new;
  end if;

  v_debt := public.partner_debt(new.subcontractor_id);

  if v_debt > 0 then
    raise exception 'المتعهد مدين لنا بـ % — سدّد الرصيد أولاً أو سجّل الدفعة كمقدَّم صريح',
      round(v_debt, 2)
      using hint = 'partner-owing';
  end if;

  return new;
end;
$$;

drop trigger if exists partner_payouts_guard_owing on public.partner_payouts;
create trigger partner_payouts_guard_owing
  before insert on public.partner_payouts
  for each row execute function public.partner_payouts_guard_owing();

comment on function public.partner_payouts_guard_owing() is
  'حارس الدفع في الجدول: لا دفعة لمتعهد مدين لنا ما دام block_payout مفعّلاً. يغطي الإدراج المباشر عبر PostgREST ومحرر SQL — لا الدالة وحدها. التجاوز عبر record_partner_payout_advance التي ترفع tours.allow_partner_advance.';

revoke all on function public.partner_payouts_guard_owing() from public, anon, authenticated;

-- وإعادة تثبيت منح 0015 لـ `record_partner_payout` (تأكيد لا تغيير)
revoke all    on function public.record_partner_payout(uuid, uuid, numeric, timestamptz, text)
  from public, anon, authenticated;
grant execute on function public.record_partner_payout(uuid, uuid, numeric, timestamptz, text)
  to authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.record_partner_payout(uuid, uuid, numeric, timestamptz, text) to service_role';
    execute 'grant execute on function public.record_partner_payout_advance(uuid, uuid, numeric, timestamptz, text) to service_role';
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- (ق١٢) `v_partner_settlements` — عمودان في آخر القائمة
--
-- ماذا: `owed_to_us` (ما على المتعهد لنا) و`over_limit` (بلغ السقف). والإضافة في
-- **آخر** القائمة حصراً: `create or replace view` لا تسمح بإعادة ترتيب الأعمدة
-- القائمة ولا بإعادة تنويعها.
--
-- ولماذا `left join` لا `join` على جدول الإعدادات: غير المشرف يرى صفر صفوف من
-- `partner_credit_settings` بحكم RLS، فبـ `join` تختفي **كل** صفوف العرض عنه.
-- وبـ `left join` يسقط العمودان إلى false وحدهما. (والمتعهد لا يرى صفوف العرض
-- أصلاً — `ledger_entries` محروس بـ `is_admin()`.)
-- ----------------------------------------------------------------------------
create or replace view public.v_partner_settlements
with (security_invoker = true)
as
select
  s.id            as subcontractor_id,
  s.company_name,
  g.earned::numeric(14, 2)    as earned,
  g.collected::numeric(14, 2) as collected,
  g.paid::numeric(14, 2)      as paid,
  (g.earned - g.collected - g.paid)::numeric(14, 2) as net_due,
  g.trips_count,
  abs(g.earned - g.collected - g.paid)::numeric(14, 2) as abs_net_due,
  greatest(-(g.earned - g.collected - g.paid), 0)::numeric(14,2) as owed_to_us,
  -- ⚠ العمود يقيس **بلوغ السقف وحده** ولا يقرأ `block_dispatch`: لو خلطهما
  -- لاختفى الوسم عن كل المتجاوزين بمجرد إطفاء الحجب — فيفقد المالك رؤيتهم لا
  -- مجرد حجبهم. الحجب حكمٌ آخر مكانه `partner_over_debt_limit()` وحدها.
  (coalesce(cs.debt_limit, 0) > 0
   and greatest(-(g.earned - g.collected - g.paid), 0) >= cs.debt_limit) as over_limit
from (
  select
    r.subcontractor_id,
    coalesce(sum(r.sign::numeric * r.amount) filter (where r.partner_kind = 'earned'), 0)    as earned,
    coalesce(sum(r.sign::numeric * r.amount) filter (where r.partner_kind = 'collected'), 0) as collected,
    coalesce(sum(r.sign::numeric * r.amount) filter (where r.partner_kind = 'paid'), 0)      as paid,
    count(distinct r.booking_id) filter (where r.partner_kind = 'earned' and r.sign = 1)     as trips_count
  from public.v_ledger_resolved r
  where r.subcontractor_id is not null and r.partner_kind is not null
  group by r.subcontractor_id
) g
join public.subcontractors s on s.id = g.subcontractor_id
left join public.partner_credit_settings cs on cs.id;

-- الصلاحيات تُعاد بعد إعادة الإنشاء (create or replace لا يفقدها، لكن نؤكدها)
revoke all on public.v_partner_settlements from public, anon;
grant select on public.v_partner_settlements to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'v_partner_settlements'
      and c.reloptions::text like '%security_invoker=true%'
  ) then
    raise exception 'v_partner_settlements فقدت security_invoker — عزل الشركاء ينهار';
  end if;
  raise notice '✔ 0027 ق١٢: owed_to_us و over_limit في عرض المقاصة';
end $$;

-- ----------------------------------------------------------------------------
-- (ق١٣) «تابع حجزك» — جدول المحاولات ودالة البحث
--
-- ماذا: بحث بمرجع الحجز + هاتف العميل يُرجع **التوكن وحده**، وخانق محاولات
-- يسبق أي قراءة للحجوزات.
--
-- لماذا الخانق أصلاً: `TR-XXXXXX` فضاؤه ٣١⁶ ≈ ٢٩٫٧ بت وقابل للتعداد، بخلاف
-- التوكن (١٩٢ بت). الحدّ هو ما يمنع المسح، لا سرّية المرجع.
--
-- 🔒 **لا يُخزَّن عنوان IP**: `client_key` بصمة مجهولة تحسبها طبقة الخادم،
-- والصفوف تُكنس بعد ساعة. ولا صلاحية للجدول لأي دور مستخدم إطلاقاً — الكتابة
-- والقراءة من داخل الدالة `definer` وحدها (نمط «الأقل صلاحية» في جدولَي الكاش
-- في 0005: `revoke` بلا `grant` بعده، وRLS مفعّل بلا سياسة واحدة).
-- ----------------------------------------------------------------------------
create table if not exists public.booking_lookup_attempts (
  client_key   text not null,
  window_start timestamptz not null,
  attempts     integer not null default 0,
  primary key (client_key, window_start)
);

-- مسار الكنس الانتهازي داخل الدالة
create index if not exists booking_lookup_attempts_window_idx
  on public.booking_lookup_attempts (window_start);

comment on table public.booking_lookup_attempts is
  'عدّاد محاولات «تابع حجزك» في نوافذ ربع ساعة. 🔒 لا يُخزَّن عنوان IP ولا أي بيانات شخصية: client_key بصمة مجهولة تحسبها طبقة الخادم، والصفوف تُكنس بعد ساعة. بلا أي منح لأي دور مستخدم وبلا سياسات — الوصول من داخل find_booking_by_reference وحدها.';

alter table public.booking_lookup_attempts enable row level security;

-- السحب بلا منح بعده: إعدادات Supabase الافتراضية تمنح anon/authenticated كل
-- شيء على أي جدول جديد — ومنها TRUNCATE التي **لا تخضع لـ RLS**.
revoke all on public.booking_lookup_attempts from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'revoke all on public.booking_lookup_attempts from service_role';
  end if;
end;
$$;

create or replace function public.find_booking_by_reference(
  p_reference  text,
  p_phone      text,
  p_client_key text
)
returns table (public_token text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_window   interval := interval '15 minutes';
  v_max      integer  := 8;
  v_bucket   timestamptz;
  v_key      text;
  v_attempts integer;
  v_ref      text;
  v_phone    text;
  v_token    text;
begin
  -- ── ترتيب الخطوات هنا هو الميزة نفسها، فلا يُقلب ────────────────────────────
  -- (١) التحقق الشكلي **قبل** العدّ: مدخلٌ ناقص لا يفيد التعداد في شيء، فلا
  --     يستهلك رصيد زائرٍ أخطأ في الكتابة. ورفعُ الاستثناء هنا يُرجع المعاملة
  --     وليس فيها ما يُحفظ بعد.
  --
  -- (٢) العدّ **قبل** البحث، ومسار «لا نتيجة» **يرجع صفر صفوف ولا يرمي**:
  --     كل استدعاء PostgREST معاملة واحدة، فرفعُ استثناء يُرجعها ومعها صفُّ
  --     العدّاد الذي كُتب لتوّه ⇒ **المحاولة الفاشلة لا تُحسب أبداً**، فيبقى
  --     التعدادُ — وهو كل ما يفعله المهاجم — بلا خانق، ويُقفَل في وجه العميل
  --     الشرعي وحده. أما `rate-limited` فيجوز أن يرمي: العدد الذي أطلقه
  --     **مُلتزَمٌ من استدعاءات سابقة**، ورجوعُ معاملته لا يُنقصه.
  -- ---------------------------------------------------------------------------

  -- (١-أ) تطبيع المرجع: يقبل «TR-ABC123» و«tr abc123» و«ABC123» سواءً.
  --       ويقبل الطولين ٦ و١٠ معاً — `next_booking_reference` تطيل الرمز بعد ٢٥
  --       تصادماً، فلا يُفرض `{6}` في أي نمط.
  v_ref := upper(regexp_replace(coalesce(p_reference, ''), '[^A-Za-z0-9]', '', 'g'));
  if left(v_ref, 2) = 'TR' then
    v_ref := substring(v_ref from 3);
  end if;

  if length(v_ref) < 4 or length(v_ref) > 16 then
    raise exception 'رقم الحجز غير مكتمل — راجعه وأعد المحاولة' using hint = 'invalid-input';
  end if;

  v_ref := 'TR-' || v_ref;

  -- (١-ب) تطبيع الهاتف **داخل** الدالة: `normalize_phone` لا تُمنح للزائر بحال
  --       (فحص في 0026 يُسقط الهجرة والاختبار معاً)، والدالة تعمل بهوية مالكها.
  v_phone := public.normalize_phone(p_phone);
  if v_phone is null or length(v_phone) < 8 then
    raise exception 'رقم الهاتف غير مكتمل — راجعه وأعد المحاولة' using hint = 'invalid-input';
  end if;

  -- (٢) العدّاد — والحدّ (٨ لكل ربع ساعة) سخيٌّ للإنسان وقاتلٌ لتعداد ٣١⁶.
  v_bucket := date_trunc('hour', now())
            + floor(extract(minute from now())::int / 15) * v_window;
  v_key := coalesce(nullif(btrim(p_client_key), ''), 'unknown');

  insert into public.booking_lookup_attempts as a (client_key, window_start, attempts)
  values (v_key, v_bucket, 1)
  on conflict (client_key, window_start)
    do update set attempts = a.attempts + 1
  returning a.attempts into v_attempts;

  if v_attempts > v_max then
    raise exception 'محاولات كثيرة — انتظر قليلاً ثم أعد المحاولة' using hint = 'rate-limited';
  end if;

  -- (٣) تنظيف انتهازي: الجدول صغير والحذف رخيص، فلا مهمة مجدولة لأجله
  delete from public.booking_lookup_attempts
   where window_start < now() - interval '1 hour';

  -- (٤) المطابقة بـ `=` **لا `is not distinct from`**: هذه ليست مقارنة هويّتين
  --     كما في `apply_discount`، بل بوابة وصول. فبـ `is not distinct from` يطابق
  --     هاتفٌ فارغ (‏null) كل حجز قديم `phone_norm is null` ⇒ المرجع وحده يكفي.
  select b.public_token into v_token
  from public.bookings b
  where b.reference = v_ref
    and b.phone_norm = v_phone
  limit 1;

  -- (٥) لا نتيجة ⇒ **صفر صفوف بلا استثناء** حتى تبقى المحاولة محسوبة.
  --     طبقة الخادم تترجم الفراغ إلى `not-found` — العقد في lib/booking-types.ts.
  if v_token is null then
    return;
  end if;

  public_token := v_token;
  return next;
end;
$$;

comment on function public.find_booking_by_reference(text, text, text) is
  'بحث «تابع حجزك»: مرجع + هاتف ⇒ **التوكن وحده ولا شيء غيره**. من أجاب على الاثنين معاً يستحق ما يستحقه حاملُ الرابط الذي وصله أصلاً على أي حال. المطابقة بـ = لا is not distinct from (وإلا طابق هاتفٌ فارغ كل حجز phone_norm is null). والخانق يعدّ قبل الفحص لا بعده، ولا يخزّن عنوان IP.';

-- ⚠ **لا منح لـ `anon` ولا لـ `authenticated`** — وهذا شرط بقاء الخانق:
-- `p_client_key` بصمةٌ يحسبها الخادم، فلو نودِيت الدالة مباشرةً عبر PostgREST
-- لاختار المنادي بصمةً جديدة في كل طلب، فصار لكل محاولة دلوٌ خاص بها عدّاده ١
-- **ولا يُبلغ الحدّ أبداً** — أي خانق بالاسم فقط. المسار الوحيد هو إجراء الخادم
-- في `app/track/actions.ts` بمفتاح الخدمة، وهو الذي يشتقّ البصمة من الترويسات.
-- و`normalize_phone` تبقى ممنوعة على الزائر — الدالة تناديها بهوية مالكها.
revoke all on function public.find_booking_by_reference(text, text, text)
  from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.find_booking_by_reference(text, text, text) to service_role';
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- (ق١٤) فحوص ذاتية — كل فحص سالب يسبقه شاهد إيجابي (قاعدة 0025 §٦)
-- ----------------------------------------------------------------------------
do $$
declare
  v_missing text;
  v_def     text;
  v_pos     integer;
begin
  -- (١) الشاهد الإيجابي لكل ما بعده: الكائنات موجودة فعلاً
  select string_agg(x.sig, '، ')
    into v_missing
  from (values
    ('public.partner_credit_config()'),
    ('public.partner_debt(uuid)'),
    ('public.partner_over_debt_limit(uuid)'),
    ('public.manual_assign_over_limit(uuid, uuid, numeric, text)'),
    ('public.record_partner_payout_advance(uuid, uuid, numeric, timestamptz, text)'),
    ('public.find_booking_by_reference(text, text, text)')
  ) as x(sig)
  where to_regprocedure(x.sig) is null;

  if v_missing is not null then
    raise exception '0027: دوال ناقصة بعد التنفيذ: %', v_missing;
  end if;

  if to_regclass('public.partner_credit_settings') is null
     or to_regclass('public.booking_lookup_attempts') is null then
    raise exception '0027: جدول ناقص بعد التنفيذ (partner_credit_settings / booking_lookup_attempts)';
  end if;

  -- (٢) 🔒 ف١: الزائر لا ينفّذ normalize_phone — نفس فحص 0026:1432 حرفاً
  if exists (select 1 from pg_roles where rolname = 'anon') then
    if has_function_privilege('anon', 'public.normalize_phone(text)', 'execute') then
      raise exception '0027: الزائر ينفّذ normalize_phone — نقض 0026 (وفحصها يُسقط الهجرة)';
    end if;

    -- والشاهد الإيجابي للمسبار نفسه: الزائر **ينفّذ** دالة عامة معروفة، فلو كان
    -- `has_function_privilege` يرجع false دائماً لانكشف هنا لا في السطر السابق
    if not has_function_privilege('anon', 'public.get_booking_by_token(text)', 'execute') then
      raise exception '0027: مسبار الصلاحيات معطّل — الزائر يُفترض أن ينفّذ get_booking_by_token';
    end if;

    -- 🔒 ودالة البحث **ليست** منها: `p_client_key` بصمةٌ يحسبها الخادم، فنداءٌ
    --    مباشر عبر PostgREST ببصمة جديدة كل مرة يجعل كل دلوٍ عدّاده ١ ⇒ خانقٌ
    --    بالاسم فقط. المسار الوحيد إجراء الخادم بمفتاح الخدمة.
    if has_function_privilege('anon', 'public.find_booking_by_reference(text, text, text)', 'execute') then
      raise exception '0027: find_booking_by_reference ممنوحة لـ anon — الخانق يُلتفّ عليه ببصمة جديدة كل طلب';
    end if;

    if has_table_privilege('anon', 'public.booking_lookup_attempts', 'select')
       or has_table_privilege('anon', 'public.booking_lookup_attempts', 'insert') then
      raise exception '0027: الزائر اكتسب صلاحية على booking_lookup_attempts — الجدول بلا منح بحال';
    end if;

    if has_table_privilege('anon', 'public.partner_credit_settings', 'select') then
      raise exception '0027: الزائر يقرأ partner_credit_settings';
    end if;
  end if;

  -- (٣) 🔒 ف١٠: دوال الحكم غير ممنوحة لأي دور مستخدم. منحُها لـ authenticated
  --     يعني أن المتعهد يستكشف دين منافسه بالتجربة (سابقة coverage_matches).
  select string_agg(x.sig, '، ')
    into v_missing
  from (values
    ('public.partner_credit_config()'),
    ('public.partner_debt(uuid)'),
    ('public.partner_over_debt_limit(uuid)')
  ) as x(sig)
  where (exists (select 1 from pg_roles where rolname = 'anon')
         and has_function_privilege('anon', x.sig, 'execute'))
     or (exists (select 1 from pg_roles where rolname = 'authenticated')
         and has_function_privilege('authenticated', x.sig, 'execute'));

  if v_missing is not null then
    raise exception '0027: دوال الحكم ممنوحة لدور مستخدم (%) — السقف يصير قابلاً للاستكشاف', v_missing;
  end if;

  -- (٤) 🔒 السقف مفروض في المواضع الثلاثة + في منع الدفع. كل مسبار يسبقه شاهد
  --     إيجابي برمز نعلم وجوده يقيناً، وإلا صار الفحص السالب زينة.
  v_def := pg_get_functiondef(to_regprocedure('public.dispatch_broadcast(uuid, integer)')::oid);
  if position('dispatch_pool' in coalesce(v_def, '')) = 0 then
    raise exception '0027: مسبار مصدر dispatch_broadcast لا يلتقط dispatch_pool — المطابقة معطّلة فلا تصدّق ما بعدها';
  end if;
  if position('partner_over_debt_limit' in v_def) = 0 then
    raise exception '0027: dispatch_broadcast لا يستبعد من بلغ سقف دينه — العرض يصله رغم السقف';
  end if;

  v_def := pg_get_functiondef(to_regprocedure('public.portal_offers()')::oid);
  if position('current_subcontractor_id' in coalesce(v_def, '')) = 0 then
    raise exception '0027: مسبار مصدر portal_offers لا يلتقط current_subcontractor_id — المطابقة معطّلة';
  end if;
  if position('partner_over_debt_limit' in v_def) = 0 then
    raise exception '0027: portal_offers ما زالت تعرض عروضاً لمن بلغ السقف — زرٌّ يفشل دائماً';
  end if;

  v_def := pg_get_functiondef(to_regprocedure('public.trip_offers_guard_accept()')::oid);
  if position('approved' in coalesce(v_def, '')) = 0 then
    raise exception '0027: مسبار مصدر trip_offers_guard_accept لا يلتقط فحص «معتمد» — المطابقة معطّلة';
  end if;
  if position('partner_over_debt_limit' in v_def) = 0 then
    raise exception '0027: الحاجز الحقيقي غائب — trip_offers_guard_accept بلا فحص سقف الدين';
  end if;
  if position('tours.allow_partner_debt' in v_def) = 0 then
    raise exception '0027: حاجز سقف الدين بلا مسار تجاوز بشري — manual_assign_over_limit لن تعمل';
  end if;

  v_def := pg_get_functiondef(to_regprocedure('public.record_partner_payout(uuid, uuid, numeric, timestamptz, text)')::oid);
  if position('finance_admin_allowed' in coalesce(v_def, '')) = 0 then
    raise exception '0027: مسبار مصدر record_partner_payout لا يلتقط finance_admin_allowed — المطابقة معطّلة';
  end if;
  if position('partner_debt' in v_def) = 0 then
    raise exception '0027: record_partner_payout ما زالت تدفع لمدين بلا فحص';
  end if;

  -- والمُشغّل مركَّب فعلاً (الدالة بلا مُشغّل ليست حارساً)
  if not exists (
    select 1 from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'trip_offers'
      and t.tgname = 'trip_offers_guard_accept' and not t.tgisinternal
  ) then
    raise exception '0027: مُشغّل trip_offers_guard_accept غير مركَّب — الحارس دالة بلا مُطلِق';
  end if;

  -- (٥) 🔒 ف٨: العرض ما زال security_invoker (تكرار فحص 0017 بصيغة الكتالوج)
  select coalesce(
           (select o.option_value from pg_options_to_table(c.reloptions) o
             where o.option_name = 'security_invoker'), 'false')
    into v_def
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'v' and c.relname = 'v_partner_settlements';

  if v_def is distinct from 'true' then
    raise exception
      '0027: v_partner_settlements فقد security_invoker (القيمة «%») — عزل الشركاء ينهار', coalesce(v_def, 'بلا');
  end if;

  -- (٦) 🔒 ف١٠ — الشرط البنيوي الذي يقوم عليه السقف كله، مفحوصاً لا مفترضاً.
  --
  --     `partner_debt` تقرأ عرضاً `security_invoker` فوق `ledger_entries`
  --     المحروس بـ `is_admin()`. وهي تنجح **لسببين معاً** لا لسبب واحد:
  --       (أ) مالك الدالة هو مالك الجدول — و`security definer` يجعله المنفِّذ؛
  --       (ب) RLS **لا تُطبَّق على مالك الجدول** ما لم تُفعَّل `force row level
  --           security` عليه.
  --     فلو سقط أيٌّ منهما عادت الدالة بصفر صفوف **بهدوء وبلا خطأ**، وصار
  --     `partner_debt` صفراً لكل متعهد ⇒ السقف لا يقع على أحد أبداً. ولا اختبار
  --     سلوكي يمسك هذا (الهجرة والاختبارات تعمل بالمالك أصلاً فترى كل شيء)،
  --     فالفحص هنا على الشرط نفسه لا على أثره.
  --     وأول الشرطين: كل حلقة في السلسلة `security definer` فعلاً في الكتالوج
  --     لا في نيّة الكاتب. حلقة واحدة `invoker` تكفي لإسقاط السقف كله.
  select string_agg(x.sig, '، ')
    into v_missing
  from (values
    ('public.partner_credit_config()'),
    ('public.partner_debt(uuid)'),
    ('public.partner_over_debt_limit(uuid)'),
    ('public.dispatch_broadcast(uuid, integer)'),
    ('public.portal_offers()'),
    ('public.trip_offers_guard_accept()'),
    ('public.record_partner_payout(uuid, uuid, numeric, timestamptz, text)')
  ) as x(sig)
  where not (select p.prosecdef from pg_proc p where p.oid = to_regprocedure(x.sig));

  if v_missing is not null then
    raise exception
      '0027: دوال في سلسلة السقف ليست security definer (%) — تقرأ المقاصة بهوية المستدعي فتعود بصفر صفوف بصمت (ف١٠)', v_missing;
  end if;

  if not exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'ledger_entries'
      and c.relrowsecurity and not c.relforcerowsecurity
  ) then
    raise exception
      '0027: ledger_entries إمّا بلا RLS أو بـ force row level security — في الحالة الثانية يعود partner_debt بصفر لكل متعهد بصمت وسقف الديون لا يقع أبداً (ف١٠)';
  end if;

  if (select p.proowner from pg_proc p where p.oid = to_regprocedure('public.partner_debt(uuid)'))
     is distinct from
     (select c.relowner from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname = 'ledger_entries')
  then
    raise exception
      '0027: مالك partner_debt ليس مالك ledger_entries — تجاوز RLS لن يقع، فيعود الدين صفراً بصمت وسقف الديون لا يقع أبداً (ف١٠)';
  end if;

  -- (٧) ف٩: العمودان الجديدان في **آخر** القائمة لا في وسطها
  select c.ordinal_position into v_pos
  from information_schema.columns c
  where c.table_schema = 'public' and c.table_name = 'v_partner_settlements'
    and c.column_name = 'abs_net_due';

  if v_pos is null then
    raise exception '0027: abs_net_due اختفى من v_partner_settlements — أُعيد ترتيب الأعمدة';
  end if;

  if not exists (
    select 1 from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = 'v_partner_settlements'
      and c.column_name = 'owed_to_us' and c.ordinal_position > v_pos
  ) or not exists (
    select 1 from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = 'v_partner_settlements'
      and c.column_name = 'over_limit' and c.ordinal_position > v_pos
  ) then
    raise exception '0027: owed_to_us / over_limit ليسا بعد abs_net_due — ف٩ مخالَف';
  end if;

  raise notice '✔ 0027 الجزء ٢: سقف ديون المتعهدين (إعدادات + partner_debt/partner_over_debt_limit + حاجز القبول + استبعاد من البث والبورتال + منع الدفع لمدين مع تجاوزين بشريين) و«تابع حجزك» (خانق محاولات بلا IP + بحث بمرجع وهاتف يُرجع التوكن وحده)';
end;
$$;
