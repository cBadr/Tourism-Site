-- ============================================================================
-- 0078_booking_route_map.sql — خريطة المسار: صورةٌ واحدة للحجز، بعد التأكيد وحده
--
-- ⚠ **رقمُها كان 0077 لدقائق**: وكيلٌ آخر كان يعمل على القاعدة نفسها فأخذ
-- `0077_notification_view_state.sql` وطبّقه أولاً، فرُقّمت هذه 0078 وأُعيد
-- تطبيقُها باسمها الجديد. والقسم (٦) أدناه يمسح الاسم القديم من `schema_migrations`
-- فلا يبقى في السجلّ اسمُ ملفٍّ لا وجود له على القرص.
--
-- ── ما تبنيه هذه الهجرة، وما لا تبنيه ───────────────────────────────────────
--
-- تبني ثلاثة أشياء لا رابع: **مفتاحَ إطفاءٍ للمالك**، و**سجلَّ صورةٍ واحدة لكل
-- حجز**، و**حارسَ جمهور** يقول من يرى الصورة الدقيقة ومتى. أما توليد الصورة
-- نفسها ورفعها فيقعان في طبقة الخادم (`lib/maps/*`) — ولا سطر هنا يتصل بأي
-- مزوّد خارجي.
--
-- ── 🔴 (١) لماذا الزناد «مؤكَّد» لا «مدفوع بالكامل» ─────────────────────────
--
-- `start_dispatch` (0013:620) ترفض كل حالةٍ غير `confirmed` نصّاً:
--     if v_b.status <> 'confirmed' then raise ... hint = 'booking-not-confirmed'
-- والعربون **يؤكِّد**: `settle_payment_intent` (0020:746) تنقل الحجز إلى
-- `confirmed` عند نجاح التحصيل مهما كانت الخطة، و`verify_payment` تفعل الشيء
-- نفسه عند اعتماد التحويل. أي أن حجزاً بعربونٍ مدفوع **مؤكَّدٌ ويُبَثّ**
-- و`amount_remaining > 0` عليه (‏D-36 · «المتبقي يُحصَّل نقداً مع السائق»).
--
-- فربطُ الخريطة بـ«المدفوع بالكامل» كان سيعرض «غير مدفوع» لمن دفع بالفعل —
-- وهو مكالمةٌ هاتفية لا دفعة. ولذلك الحالات الثلاث هنا: `confirmed` وما بعدها
-- (`assigned` · `completed`)، وهي بعينها الحالات التي تشترطها `start_dispatch`
-- ومن بعدها الإسناد.
--
-- ── 🔴 (٢) لماذا مُشغّلٌ في القاعدة لا شرطٌ في الخادم (D-48) ────────────────
--
-- «عدّادٌ يُكتب في معاملةٍ ترمي استثناءً = عدّادٌ لا وجود له» — وعكسُها هنا:
-- **نداءُ خدمة خرائط داخل معاملة `create_booking` يعني أن انقطاع الخدمة يُسقط
-- الحجز**. والحارس الذي يجعل ذلك **مستحيلاً بنيوياً** لا انضباطياً هو المُشغّل
-- أدناه: الحجز لحظة إنشائه `pending_payment`، فصفُّ خريطةٍ داخل تلك المعاملة
-- **يُرفض من القاعدة نفسها** مهما كتب أحدٌ في الخادم لاحقاً. أي أن القيد على
-- «متى تُولَّد» يعيش حيث لا يُنسى، لا في تعليقٍ يُقرأ.
--
-- ── 🔴 (٣) حدّ الجمهور — واحدٌ لا اثنان ─────────────────────────────────────
--
-- الحدّ القائم في المستودع منذ 0014 و0028: **قبل القبول** يرى المتعهد
-- `dispatch_public_label` (وسمٌ معمَّمٌ بلا رقم عقار) و`dispatch_safe_notes`؛
-- **بعد الإسناد** تُرجع `portal_trips()` الوسم الخام بعنوانه الدقيق وهاتف
-- العميل، لأنه هو من ينفّذ. وخريطةٌ دقيقة قبل القبول كانت **تنقض ذلك بصورةٍ
-- بدل نصّ** — والرابط يُعاد توجيهه، ولذلك قنّعت 0049 الهاتف أصلاً.
--
-- فالحارس هنا **لا يخترع حدّاً ثانياً**: `partner_route_map_visible` هو حرفياً
-- شرط `where` الذي تستعمله `portal_trips()` منذ 0013 —
--     d.assigned_subcontractor_id = current_subcontractor_id() and d.status = 'assigned'
-- ومعه خاصّيةٌ بنيوية تسبقه: **`portal_offers()` لا تُرجع `booking_id` أصلاً**،
-- فالمتعهد قبل القبول لا يملك المعرّف الذي يُسأل عنه. الحارس هو الطبقة الثانية،
-- وغيابُ المعرّف هو الأولى.
--
-- ── (٤) صورةٌ واحدة لكل حجز — لا واحدة لكل مشاهدة ───────────────────────────
--
-- الجدول `booking_route_maps` مفتاحُه `booking_id` **وحده**: مفتاحٌ أساسي لا
-- فهرس، فالصف الثاني مستحيلٌ في القاعدة لا في نيّة الكاتب. وصفحة المتابعة
-- تُفتح مراراً على الهاتف، وواجهةُ الخرائط الثابتة تُحاسِب على كل صورة.
-- والصفّ يحمل **مسار التخزين** لا رابط المزوّد: رابطٌ مخزَّن يعني أن المتصفح
-- ينادي المزوّد في كل مشاهدة — أي «مرة لكل مشاهدة» بثوبٍ آخر.
--
-- ── (٥) المفتاح في البيئة، والمفتاح-الكهربائي في اللوحة ─────────────────────
--
-- `GOOGLE_MAPS_API_KEY` يبقى في `.env.local` (سرٌّ — D-04/الاتفاقية ٣)، واللوحة
-- تملك **«هل»** لا **«ماذا»**: `route_map_enabled` مفتاحُ إطفاءٍ يوقف الكلفة
-- بلا نشر. ومكانه `trip_settings` بأمر الموجز («مع إعدادات الرحلات أو التسعير»)
-- لا `place_search_settings` — ذاك جدولُ **البحث عن الأماكن** ويعمل عليه وكيلٌ
-- آخر الآن.
--
-- والافتراضي `true`: الميزة مطلوبةٌ صراحةً، وهي **خاملةٌ بلا مفتاح بيئة** على
-- كل حال (بلا `GOOGLE_MAPS_API_KEY` لا صورة ولا نداء ولا صف)، فشحنُها مطفأةً
-- كان سيجعل المالك يبحث عن مفتاحين لا واحد.
--
-- المرجع: 0013 (‏`start_dispatch` · `portal_trips`) · 0014 (‏`dispatch_public_label`)
--         · 0020 (تأكيد الحجز من البوابة) · 0027/0028 (حدّ ما قبل القبول)
--         · 0049 (تقنيع الهاتف على الرابط المُعاد توجيهه) · 0067 (سابقة توسيع
--         `trip_settings` بعمود سياسة) · 0007 (سابقة دلو التخزين الخاص)
--         · D-19 · D-36 · D-46 · D-48.
-- الاختبار: supabase/tests/dispatch_tests.sql القسمان (ب-٧) و(ز-٤)
--           · supabase/tests/trip_settings_tests.sql القسم (ف)
-- آمنة لإعادة التنفيذ بالكامل.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (١) مفتاح الإطفاء — عمودٌ في `trip_settings`
--
-- `not null default true` هو القيد نفسه: منطقيٌّ بقيمتين، فلا `check` يضيف
-- شيئاً فوق النوع. والقيدُ الذي يستحق أن يُكتب ليس على هذا العمود بل على
-- **متى يوجد صفُّ خريطة** — وهو القسم (٣).
--
-- ولا يُضاف إلى `trip_config()`: تلك مقصورةٌ على `service_role` وتقرأ سياسة
-- التشغيل، وهذا العمود يقرؤه الخادم بمفتاح الخدمة من الجدول مباشرةً كما تفعل
-- `readTripSettings` بكل أعمدة الشاشة (‏`lib/trip-settings.ts`).
-- ----------------------------------------------------------------------------
alter table public.trip_settings
  add column if not exists route_map_enabled boolean not null default true;

comment on column public.trip_settings.route_map_enabled is
  'مفتاح إطفاء خريطة المسار الثابتة على صفحة متابعة الحجز وبورتال المتعهد. مطفأً: لا تُولَّد صورة جديدة ولا تُقدَّم صورة مخزَّنة — يوقف المالك الكلفة بلا نشر. ولا يمسّ مفتاح المزوّد نفسه: ذاك في البيئة (GOOGLE_MAPS_API_KEY) واللوحة تملك «هل» لا «ماذا».';

-- ----------------------------------------------------------------------------
-- (٢) الدلو `maps` — خاصٌّ تماماً، بلا سياسةٍ واحدة
--
-- على خلاف `receipts` (‏0007) لا يحتاج هذا الدلو **أي** سياسة: لا يكتب فيه إلا
-- الخادم بمفتاح الخدمة، ولا يقرأ منه إلا الخادم. و`service_role` يتجاوز RLS،
-- فغيابُ السياسات هنا هو الإذنُ الأضيق الممكن لا سهواً — ومن أراد أن يفتحه
-- لاحقاً يكتب سياسةً صريحة فيُرى في المراجعة.
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('maps', 'maps', false)
on conflict (id) do nothing;

-- تصليب كالذي في 0007: لو أُنشئ الدلو عاماً يدوياً يُعاد خاصاً في كل تنفيذ.
-- ملكية `storage.buckets` تختلف بين المشاريع، فالفشل يُنبَّه عليه ولا يُسقط
-- الهجرة — والدفاع الفعلي أن لا سياسة قراءة أصلاً.
do $$
begin
  update storage.buckets b set public = false where b.id = 'maps' and b.public;
exception
  when others then
    raise notice 'تعذّر ضبط دلو maps كخاص برمجياً (%) — تأكد يدوياً من Storage', sqlerrm;
end;
$$;

-- ----------------------------------------------------------------------------
-- (٣) سجل الصور — صفٌّ واحدٌ لكل حجز، ومُشغّلٌ يمنع وجوده قبل التأكيد
-- ----------------------------------------------------------------------------
create table if not exists public.booking_route_maps (
  -- 🔒 مفتاحٌ أساسي لا فهرس: «صورة واحدة لكل حجز» قيدٌ في القاعدة لا نيّة
  booking_id   uuid primary key references public.bookings(id) on delete cascade,
  storage_path text        not null check (length(btrim(storage_path)) between 1 and 400),
  provider     text        not null check (provider in ('google')),
  width        integer     not null check (width  between 64 and 4096),
  height       integer     not null check (height between 64 and 4096),
  byte_size    integer     not null check (byte_size > 0),
  created_at   timestamptz not null default now()
);

comment on table public.booking_route_maps is
  'صورة خريطة المسار المولَّدة مرة واحدة لكل حجز ومخزَّنة في دلو maps الخاص. المفتاح الأساسي هو booking_id فالصف الثاني مستحيل — واجهات الخرائط الثابتة تُحاسِب على كل صورة وصفحة المتابعة تُفتح مراراً. ولا يُسمح بوجود الصف قبل تأكيد الحجز (مُشغّل booking_route_maps_confirmed_guard).';

comment on column public.booking_route_maps.storage_path is
  'مسار الملف داخل دلو maps الخاص — لا رابط مزوّد. رابطٌ مخزَّن كان يعني نداءً للمزوّد في كل مشاهدة، أي «صورة لكل مشاهدة» بثوب آخر.';

-- ── الحارس: لا صفَّ خريطة على حجزٍ غير مؤكَّد ────────────────────────────────
--
-- 🔴 هذا هو تنفيذ D-48 مقلوباً: الحجز لحظة `create_booking` حالته
-- `pending_payment`، فأي محاولة كتابةٍ داخل تلك المعاملة **تُرفض من القاعدة**.
-- ونداءُ خدمة الخرائط لا يمكن أن يدخل معاملة الحجز أبداً لأن ثمرته مرفوضة.
create or replace function public.booking_route_maps_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_status text;
begin
  select b.status into v_status
  from public.bookings b
  where b.id = new.booking_id;

  if not found then
    raise exception 'الحجز غير موجود' using hint = 'booking-not-found';
  end if;

  if v_status not in ('confirmed', 'assigned', 'completed') then
    raise exception
      'خريطة المسار لا تُولَّد قبل تأكيد الحجز (حالته الآن «%»)', v_status
      using hint = 'booking-not-confirmed';
  end if;

  return new;
end;
$function$;

comment on function public.booking_route_maps_guard() is
  'يرفض صف خريطة على حجز لم يُؤكَّد بعد. الزناد هو التأكيد نفسه — الحالة التي تشترطها start_dispatch — لا «مدفوع بالكامل»: العربون يؤكّد ويُبَثّ ويبقى amount_remaining > 0. وأثره الثاني تنفيذ D-48: الحجز لحظة إنشائه pending_payment، فلا يمكن لنداء خرائط خارجي أن يدخل معاملة create_booking لأن ثمرته مرفوضة في القاعدة.';

drop trigger if exists booking_route_maps_confirmed_guard on public.booking_route_maps;
create trigger booking_route_maps_confirmed_guard
  before insert or update on public.booking_route_maps
  for each row execute function public.booking_route_maps_guard();

-- ── الصلاحيات: الأقل على الإطلاق ────────────────────────────────────────────
--
-- سطور `revoke` حمّالة (الاتفاقية ٦): Supabase تمنح `anon` صلاحيات واسعة على
-- الجداول الجديدة **منها TRUNCATE وهي لا تخضع لـ RLS**. والجدول هنا كجدولَي
-- الكاش: بلا أي منحٍ لدورٍ عام، ويقرؤه الخادم بمفتاح الخدمة وحده.
alter table public.booking_route_maps enable row level security;
revoke all on table public.booking_route_maps from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant select, insert, update, delete on table public.booking_route_maps to service_role';
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- (٤) حارس الجمهور — نفس شرط `portal_trips()` حرفاً بحرف، لا حدٌّ ثانٍ
--
-- الشرط منقولٌ من الكتالوج الحيّ لـ`portal_trips()` (D-58): المتعهد يرى الخريطة
-- الدقيقة **إن وإن فقط** كانت الرحلة مُسندةً إليه هو. وقبل القبول: `dispatches`
-- في `broadcasting` و`assigned_subcontractor_id` فارغ ⇒ `false`. وبعد أن يفوز
-- غيرُه: المعرّف ليس معرّفه ⇒ `false`.
--
-- والمنح لـ`authenticated` مقصود ولا يكشف شيئاً: الجواب دائماً «هل **أنت**
-- مُسنَدٌ لهذا الحجز؟» — وهو ما يعرفه السائل عن نفسه سلفاً من `portal_trips()`.
-- ولا تعداد به: `portal_offers()` لا تُرجع `booking_id` أصلاً، ومعرّف الحجز
-- uuid لا يُخمَّن.
-- ----------------------------------------------------------------------------
create or replace function public.partner_route_map_visible(p_booking_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.dispatches d
    where d.booking_id                = p_booking_id
      and d.status                    = 'assigned'
      and d.assigned_subcontractor_id = public.current_subcontractor_id()
  );
$function$;

comment on function public.partner_route_map_visible(uuid) is
  'هل يحق للمتعهد الحالي أن يرى خريطة المسار الدقيقة لهذا الحجز؟ الشرط هو شرط where في portal_trips() نفسه — مُسنَدةٌ إليه وحالة الدورة assigned — فلا حدّ معلوماتي ثانٍ يُخترع بجوار الأول. قبل القبول false دائماً: الخريطة الدقيقة كانت ستنقض dispatch_public_label بصورة بدل نص (D-19 · D-46).';

revoke all    on function public.partner_route_map_visible(uuid) from public, anon;
grant execute on function public.partner_route_map_visible(uuid) to authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.partner_route_map_visible(uuid) to service_role';
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- (٥) فحوص ذاتية — تُسقط الهجرة بدل أن تُشحن ناقصة
-- ----------------------------------------------------------------------------

-- (٥-أ) العمود موجود وافتراضه `true`
do $$
declare
  v_default text;
begin
  select column_default into v_default
  from information_schema.columns
  where table_schema = 'public'
    and table_name   = 'trip_settings'
    and column_name  = 'route_map_enabled';

  if v_default is null then
    raise exception '0078 (٥-أ): العمود route_map_enabled لم يُنشأ';
  end if;
  if v_default not like 'true%' then
    raise exception '0078 (٥-أ): افتراض route_map_enabled «%» — المتوقع true', v_default;
  end if;
end;
$$;

-- (٥-ب) المُشغّل حيّ فعلاً — **بمحاولة إدراجٍ حيّة**، لا بقراءة `pg_trigger`
--
-- وجودُ الاسم في `pg_trigger` لا يقول إن الدالة تفعل شيئاً (سابقة 0045 ج-٢:
-- «نصُّ القيد لا يقول إن القاعدة تنفّذه»). فيُنشأ حجزٌ `pending_payment` وتُحاوَل
-- الكتابة عليه، ثم شاهدٌ **موجب** على حجزٍ مؤكَّد كي لا يُقرأ رفضٌ لسببٍ آخر
-- (مفتاح أجنبي، قيد شكلي) نجاحاً للحارس.
--
-- والقياس كله داخل معاملةٍ فرعية تُرجَع بالسنتينل — كما في 0045 — فلا يبقى
-- حجزٌ ولا صفُّ تدقيقٍ ولا سجلُّ حالةٍ في قاعدةٍ حيّة.
do $$
declare
  v_pend  uuid := '0d770000-0000-4000-8000-00000000d077';
  v_conf  uuid := '0d770000-0000-4000-8000-00000000c077';
  v_hint  text;
  v_ok    boolean := false;
  v_yes   boolean := false;
begin
  begin
    insert into public.bookings
      (id, reference, public_token, status, class_slug, class_title, total, currency,
       plan, amount_due, amount_remaining, customer_name, customer_phone, trip)
    values
      (v_pend, 'TR-M77D77', repeat('d', 40), 'pending_payment', 'm77-probe',
       '0078 فئة فحص', 1000, 'EGP', 'full', 1000, 0, 'فحص 0078', '01000000078',
       '{}'::jsonb),
      (v_conf, 'TR-M77C77', repeat('c', 40), 'confirmed', 'm77-probe',
       '0078 فئة فحص', 1000, 'EGP', 'full', 1000, 0, 'فحص 0078', '01000000078',
       '{}'::jsonb);

    -- الشاهد السالب: حجزٌ بانتظار الدفع ⇒ رفضٌ بتلميحه هو
    begin
      insert into public.booking_route_maps
        (booking_id, storage_path, provider, width, height, byte_size)
      values (v_pend, 'probe/0078-d.png', 'google', 640, 360, 1);
    exception
      when others then
        get stacked diagnostics v_hint = pg_exception_hint;
        v_ok := (v_hint = 'booking-not-confirmed');
    end;

    -- الشاهد الموجب: حجزٌ مؤكَّد ⇒ تمرّ. وبدونه قد يكون الرفض أعلاه لأي سبب.
    begin
      insert into public.booking_route_maps
        (booking_id, storage_path, provider, width, height, byte_size)
      values (v_conf, 'probe/0078-c.png', 'google', 640, 360, 1);
      v_yes := true;
    exception
      when others then
        v_yes := false;
    end;

    if not v_ok then
      raise exception
        '0078 (٥-ب): المُشغّل قَبِل خريطةً على حجزٍ بانتظار الدفع (التلميح: %) — الحارس ميت',
        coalesce(v_hint, '(بلا)');
    end if;
    if not v_yes then
      raise exception
        '0078 (٥-ب): المُشغّل رفض خريطةً على حجزٍ **مؤكَّد** — الحارس يمنع الميزة كلها لا ما قبل التأكيد';
    end if;

    raise exception '0078_PROBE_ROLLBACK';
  exception
    when others then
      if sqlerrm <> '0078_PROBE_ROLLBACK' then raise; end if;
  end;
end;
$$;

-- (٥-ج) حارس الجمهور لا يُمنح لـ`anon` أبداً
do $$
begin
  if has_function_privilege('anon', 'public.partner_route_map_visible(uuid)', 'execute') then
    raise exception '0078 (٥-ج): partner_route_map_visible ممنوحة لـ anon — الحدّ مفتوح';
  end if;
end;
$$;

-- (٥-د) جدول الصور مغلقٌ على الأدوار العامة
do $$
declare
  v_open text;
begin
  select string_agg(distinct grantee || ':' || privilege_type, '، ')
    into v_open
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name   = 'booking_route_maps'
    and grantee in ('anon', 'authenticated', 'PUBLIC');

  if v_open is not null then
    raise exception '0078 (٥-د): booking_route_maps مفتوح لدورٍ عام (%)', v_open;
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- (٦) أثرُ إعادة الترقيم — اسمٌ في السجلّ بلا ملفٍّ على القرص
--
-- طُبِّق هذا الملف نفسه لدقائق باسم `0077_booking_route_map.sql` قبل أن يتبيّن
-- أن وكيلاً آخر أخذ الرقم، فأُعيدت تسميتُه. و`schema_migrations` يتتبّع
-- **بالاسم**، فالصفّ القديم يبقى يصف ملفاً لا وجود له — وهو ما يجعل جردَ
-- «كم ترحيلاً؟» يعدّ واحداً زائداً إلى الأبد.
--
-- ⚠ والاسم المحذوف **مقصورٌ على هذا الملف بعينه**: لا وجود له على القرص في أي
-- نسخة، فصفُّه شبحٌ بالتعريف لا أثرُ ترحيلٍ قد يُحتاج. وعلى نسخةٍ نظيفة لا صفَّ
-- بهذا الاسم أصلاً فلا تفعل الكتلة شيئاً. ولا يُوسَّع هذا النمط لغير هذه الحالة:
-- حذفُ اسمٍ من `schema_migrations` يعني إعادةَ تطبيق ترحيلٍ، والترحيلات هنا
-- آمنةٌ لإعادة التنفيذ لكن ليست كلها بلا أثر.
-- ----------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.schema_migrations') is null then
    return;
  end if;

  delete from public.schema_migrations m
   where m.name = '0077_booking_route_map.sql';
end;
$$;
