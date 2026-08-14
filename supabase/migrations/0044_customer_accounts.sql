-- ============================================================================
-- 0044 — حسابات العملاء: الربط و«حجوزاتي» (المرحلة ١٢ب — المرحلة الأولى)
--
-- العقد الملزم: `lib/customer-types.ts` — يُقرأ قبل هذا الملف، و§١–§٥ فيه
-- تحمل القياسات التي بُني عليها كل قرار هنا. هذا الملف ينفّذها ولا يعيد اشتقاقها.
--
-- ── (١) 🔒 القاعدة الحاكمة: لا سياسة `SELECT` جديدة على `bookings`. أبداً ──
--
-- سياسةٌ ساذجة واحدة (‏`using (phone_norm = هاتف العميل)`) قِيست في معاملة
-- تُلغى، فكشفت `bookings` بأعمدة التكلفة والهامش وهوية المتعهد، **ومعها ثلاثة
-- اطلاعات** (‏`v_booking_profit` و`v_stats_orders` و`v_stats_customers`) — لأن
-- الاثني عشر اطّلاعاً كلها `security_invoker=true` فترث سياسات الجدول الأم. أي
-- أن سطراً واحداً يفتح أربعة أسطح، ثلاثةٌ منها لا تمرّ عليها مراجعة «ميزة عميل».
--
-- ولا يكفي «سنختار الأعمدة في الاستعلام»: المنح على `bookings` لـ`authenticated`
-- قائم على الأعمدة الثلاثة والعشرين كلها، و**Postgres بلا RLS على مستوى العمود**
-- — الـRLS ترشّح الصفوف والمنح يرشّح الأعمدة. فما دام المنح مفتوحاً، فاختيار
-- الأعمدة في كود التطبيق تجميلٌ يلتفّ عليه `select=*` من PostgREST بتوكن العميل.
--
-- فالعميل يقرأ من **دالة `security definer` تُرجع الإسقاط الآمن وحده** — كما
-- يقرأ المتعهد رحلاته من `portal_trips()` وكما يقرأ الزائر حجزه من
-- `get_booking_by_token()`. والفارق العملي أن التسريب يصير **مستحيلاً بالبناء**
-- لا ممنوعاً بالانضباط: ما لم يُكتب في نوع الإرجاع لا يخرج، ولا التفاف عليه.
--
-- ── (٢) جدول الربط: بلا منح لأي دور مستخدم، وRLS بلا سياسة واحدة ─────────
--
-- العميل **لا يقرأ `customer_bookings` مباشرةً** — يقرأ `my_bookings()` وهي
-- `definer` تتجاوز الجدول أصلاً. فلا سياسة تلزمه، ولا منح.
--
-- والطبقتان مقصودتان: **المنح هو الحارس الفعلي** (بلا `grant` لا وصول مهما كانت
-- السياسات)، وRLS المفعّلة بلا سياسات هي **الطبقة التي تمنع منحةً تُعاد سهواً غداً
-- من أن تفتح الباب وحدها**. نفس ترتيب 0041 على `schema_migrations` ونفس نمط
-- «الأقل صلاحية» في جدولَي الكاش و`booking_lookup_attempts`.
--
-- ── (٣) الربط بالمرجع **يفوّض ولا يستنسخ** (القاعدة ١٢ · D-58) ────────────
--
-- `find_booking_by_reference` مُصلَّبة بما لا يُعاد بناؤه: تطبيع المرجع يقبل
-- `TR-ABC123` و`tr abc123` سواءً ويقبل الطولين ٦ و١٠، وتطبيع الهاتف **داخلها**
-- لأن `normalize_phone` لا تُمنح للزائر بحال، وسقفٌ ثمانيَ محاولات لكل ربع ساعة.
-- فهذا الملف يناديها ولا ينسخ سطراً من جسمها — ولا حتى من ملف هجرتها.
--
-- ⚠ **وأخطر ما يمكن أن يكسره الغلاف: `not-found` لا تُرفع استثناءً.** الدالة
-- تُرجع صفر صفوف عمداً، لأن كل نداء PostgREST معاملةٌ واحدة، والاستثناء يُرجعها
-- **ومعها صفُّ عدّاد المحاولات الذي كُتب لتوّه** ⇒ فالمحاولة الفاشلة لا تُحسب،
-- ويبقى تعدادُ المراجع — وهو كل ما يفعله المهاجم — بلا خانق (**D-48**). فغلافٌ
-- يرمي `not-found` «لأن العقد يعدّد الرمز» يمحو الخانق بلا أن يكسر شيئاً ظاهراً.
-- ولذلك: **`link_booking_by_reference` ترجع صفر صفوف عند «لا نتيجة» ولا ترمي**،
-- والترجمة إلى `not-found` مكانها طبقة الخادم — حرفاً بحرف كما في `/track`.
--
-- ومقابلها `link_booking_by_token` **ترمي `not-found`** بلا حرج: لا عدّاد في
-- مسارها فلا شيء يُرجَع مع الاستثناء. الفرق ليس تناقضاً بل هو **سبب** القاعدة.
--
-- ── (٤) 🔒 ومفتاح الخانق يأتي من الجلسة لا من الوسيط ─────────────────────
--
-- 0027 تمنع `find_booking_by_reference` عن `anon` و`authenticated` معاً، وتكتب
-- السبب صراحةً: «‏`p_client_key` بصمةٌ يحسبها الخادم، فلو نودِيت الدالة مباشرةً
-- عبر PostgREST لاختار المنادي بصمةً جديدة في كل طلب، فصار لكل محاولة دلوٌ
-- عدّاده ١ **ولا يُبلغ الحدّ أبداً** — أي خانق بالاسم فقط».
--
-- وغلافُنا **لا يملك ترف المنع نفسه**: هويّة الرابط تُشتقّ من `auth.uid()`، وهي
-- معدومة تحت مفتاح الخدمة — فلا بدّ من منحه لـ`authenticated`، أي أن المتصفح
-- يستطيع نداءه مباشرةً بجلسة صاحبه وباختيار `p_client_key` كما يشاء.
--
-- فالمفتاح المُمرَّر إلى الدالة المفوَّض إليها هو **`'acct:' || auth.uid()`**:
-- معرّفٌ لا يزوّره المنادي ولا يدوّره، فالسقف ثمانٍ لكل ربع ساعة **لكل حساب**
-- ويلزم بريداً جديداً لتجاوزه لا طلباً جديداً. و`p_client_key` يبقى في التوقيع
-- ويصله من الخادم، لكنه **لا يُستعمل مفتاحاً للدلو عمداً** — وأي خلطٍ له بمعرّف
-- الحساب يعيد للمنادي القدرة على توليد دلوٍ جديد في كل طلب، أي يعيد العيب نفسه.
-- (طبقةُ الخادم تبقى تستعمله في خانقها الذاكري كما يفعل `app/track/actions.ts`.)
--
-- ── (٥) والربط لا ينزع ───────────────────────────────────────────────────
--
-- المفتاح مركّب `(profile_id, booking_id)`، فربط شخصٍ حجزاً لا يزيله من قائمة
-- أحد. الحجز كضيف يبقى عاملاً، وصفحة التوكن تبقى المرجع — الحساب **طبقةُ راحة
-- فوقهما لا بوابةٌ دونهما** (نصّ الرؤية: رحلة العميل مرسومة كاملةً بلا حساب).
--
-- ولا `public_token` في أي حمولة من حمولات هذا الملف: التوكن مفتاح صفحة عامة بلا
-- كلمة سرّ، ووضعه في حمولة **قائمة** يعني أن تسريب سجلٍّ واحد يسلّم مفاتيح كل
-- حجوزات العميل. الغلافان يستلمانه داخلياً ويُرجعان المرجع وحده.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (١) جدول الربط
-- ----------------------------------------------------------------------------

create table if not exists public.customer_bookings (
  profile_id uuid        not null references public.profiles(id) on delete cascade,
  booking_id uuid        not null references public.bookings(id) on delete cascade,
  linked_at  timestamptz not null default now(),
  primary key (profile_id, booking_id)
);

comment on table public.customer_bookings is
  'ربط حجزٍ بحساب عميل — علاقةٌ لا ملكية: المفتاح المركّب يعني أن ربط شخصٍ حجزاً لا ينزعه من أحد، والحجز كضيف وصفحة التوكن يبقيان عاملين. 🔒 بلا أي منح لـanon أو authenticated وبلا سياسة واحدة رغم تفعيل RLS: العميل يقرأ my_bookings() وهي security definer، فالوصول المباشر لا يلزمه أحد. العقد: lib/customer-types.ts';

comment on column public.customer_bookings.linked_at is
  'لحظة الربط — لا لحظة الحجز. الفرق يهمّ الدعم: «متى أضاف هذا الحساب هذا الحجز» سؤالٌ مختلف عن «متى حُجزت الرحلة»';

-- الاتجاه المعاكس (‏«من ربط هذا الحجز؟» في الدعم والتدقيق) لا يخدمه المفتاح
-- المركّب، فبادئته `profile_id`.
create index if not exists customer_bookings_booking_idx
  on public.customer_bookings (booking_id);

-- رصدٌ تدقيقي: جدولٌ جديد بلا مُشغّل ثغرةٌ في السجل الشامل (الملاحظة ١٥). وهذا
-- ليس سجلَّ أحداث يتضاعف حجمه — الربط حدثٌ نادر يقع مرة لكل حجز لكل حساب.
drop trigger if exists audit_customer_bookings on public.customer_bookings;
create trigger audit_customer_bookings
  after insert or update or delete on public.customer_bookings
  for each row execute function public.log_audit('booking_id');

alter table public.customer_bookings enable row level security;

-- ⚠ السحب حمّال: Supabase تمنح الأدوار العامة صلاحيات واسعة على أي جدول جديد،
--    ومنها `TRUNCATE` **التي لا تخضع لـRLS إطلاقاً** (0041). وما بعده بلا `grant`
--    لـanon ولا لـauthenticated: **المنح هو ما يرشّح الأعمدة**، وجدولٌ بلا منح
--    لا يُقرأ منه عمود مهما كُتبت السياسات.
revoke all on table public.customer_bookings from public, anon, authenticated;
grant all on table public.customer_bookings to service_role;

-- ولا سياسة واحدة تُكتب هنا. RLS مفعّلة بلا سياسات تعني «لا أحد» لكل دور غير
-- المالك و`service_role` (يتجاوزها بـ`bypassrls`) — وهو المقصود بالضبط: طبقةٌ
-- ثانية تحت المنح، فلو أُعيد منحٌ سهواً غداً بقي الباب مغلقاً. ورؤية الإدارة —
-- إن طُلبت — تأتي بهجرة صريحة بسياسة `using (public.is_admin())`، لا بتوسيع اليوم.

-- ----------------------------------------------------------------------------
-- (٢) «أضِف حجزاً سابقاً» — غلافٌ يفوّض، ويحافظ على صفر صفوف
-- ----------------------------------------------------------------------------

create or replace function public.link_booking_by_reference(
  p_reference  text,
  p_phone      text,
  p_client_key text
)
returns table (reference text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_profile uuid;
  v_token   text;
  v_booking uuid;
begin
  -- (أ) الهويّة من الجلسة لا من وسيط. ولو مُرّرت وسيطاً لصار «أرِني حجوزات
  --     فلان» نداءً واحداً — وهو بعينه خطر §٢ في العقد.
  v_profile := (select auth.uid());
  if v_profile is null or not exists (
    select 1 from public.profiles p where p.id = v_profile
  ) then
    -- ليس من رموز `LinkRefusal`: النموذج خلف تسجيل الدخول أصلاً، وهذا حارسٌ
    -- لمسارٍ لا يُبلغ من الواجهة. ورمزه `forbidden` كسائر حرّاس الهوية هنا.
    raise exception 'ربط الحجوزات يحتاج تسجيل دخول' using hint = 'forbidden';
  end if;

  -- (ب) 🔒 التفويض. والمفتاح `acct:` لا `p_client_key` — انظر (٤) في الترويسة.
  --     وما يُرفع من هنا (‏`invalid-input` و`rate-limited`) يُرفع من داخلها
  --     بتلميحه، فيمرّ كما هو ولا يُلتقط ولا يُعاد تغليفه.
  select f.public_token into v_token
    from public.find_booking_by_reference(
           p_reference, p_phone, 'acct:' || v_profile::text) f
   limit 1;

  -- (ج) 🔒 **لا استثناء هنا. أبداً.** صفر صفوف = لا نتيجة، وهو عقد الدالة
  --     المفوَّض إليها لا حالة حافّة: الرمي يُرجع معاملة النداء ومعها صفُّ
  --     العدّاد، فلا تُحسب المحاولة الفاشلة ويسقط الخانق (D-48). والترجمة إلى
  --     `not-found` مكانها طبقة الخادم — كما في `app/track/actions.ts`.
  if v_token is null then
    return;
  end if;

  select b.id into v_booking from public.bookings b where b.public_token = v_token;
  if v_booking is null then
    return;
  end if;

  -- (د) مربوطٌ سلفاً: رفضٌ بتلميحه، والرمي هنا لا يمسّ D-48 — بلوغُ هذا السطر
  --     يستلزم مرجعاً وهاتفاً صحيحين معاً، أي بحثاً **ناجحاً** لا محاولة تعداد.
  if exists (
    select 1 from public.customer_bookings cb
     where cb.profile_id = v_profile and cb.booking_id = v_booking
  ) then
    raise exception 'هذا الحجز مربوط بحسابك سلفاً' using hint = 'already-linked';
  end if;

  -- `on conflict` لسباق إرسالين متزامنين: الفحص أعلاه يقرأ لقطةً، والمفتاح
  -- المركّب هو الحكم. والنتيجة نجاحٌ في الحالتين — الربط عملية جامعة (idempotent).
  insert into public.customer_bookings (profile_id, booking_id)
  values (v_profile, v_booking)
  on conflict (profile_id, booking_id) do nothing;

  -- المرجع وحده يعود. لا توكن ولا معرّف ولا رقم (الترويسة، البند ٥).
  return query select b.reference from public.bookings b where b.id = v_booking;
end;
$$;

comment on function public.link_booking_by_reference(text, text, text) is
  'يربط حجزاً سابقاً بحساب المنادي بمرجعه وهاتفه. 🔒 يفوّض إلى find_booking_by_reference ولا يستنسخها (القاعدة ١٢ · D-58)، ويمرّر مفتاح خانقٍ مشتقاً من auth.uid() لا من p_client_key — لأن المنادي يختار الوسيط فيولّد دلواً جديداً كل طلب. و«لا نتيجة» ⇒ **صفر صفوف بلا استثناء** حتى تبقى المحاولة محسوبة (D-48)؛ الترجمة إلى not-found في طبقة الخادم.';

revoke all on function public.link_booking_by_reference(text, text, text) from public, anon;
grant execute on function public.link_booking_by_reference(text, text, text)
  to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- (٣) ما بعد إتمام حجزٍ جديد — الحيازة هي الإثبات
-- ----------------------------------------------------------------------------
-- ولا سقف على هذا المسار، ولا شيء فيه يُعدّ: التوكن سلسلة عشوائية طويلة، ومن
-- يملكه يرى صفحة الحجز كاملةً أصلاً — فالربط **لا يكشف حرفاً جديداً**، وإنما
-- يضيف سطراً إلى قائمة صاحبه. وتعدادُ التوكنات ليس مسار هذه الدالة بل مسار
-- `get_booking_by_token` القائم منذ 0007 بشرط الطول نفسه.
-- ----------------------------------------------------------------------------

create or replace function public.link_booking_by_token(p_token text)
returns table (reference text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_profile uuid;
  v_booking uuid;
begin
  -- 🔒 الحساب من الجلسة **لا من وسيط**: وسيطٌ يعني أن من يملك توكناً يربطه
  --    بحساب غيره — فيرى الضحية في «حجوزاتي» رحلةً ليست له، أو أسوأ: يُبنى
  --    الولاء لاحقاً على قائمة مدسوسة.
  v_profile := (select auth.uid());
  if v_profile is null or not exists (
    select 1 from public.profiles p where p.id = v_profile
  ) then
    raise exception 'ربط الحجوزات يحتاج تسجيل دخول' using hint = 'forbidden';
  end if;

  -- شرط الطول نفسه المكتوب في `get_booking_by_token`: توكنٌ قصير ليس توكناً.
  if p_token is null or length(p_token) < 32 then
    raise exception 'رابط الحجز غير صالح' using hint = 'invalid-input';
  end if;

  select b.id into v_booking from public.bookings b where b.public_token = p_token;

  -- ويجوز الرمي هنا بخلاف (٢): لا عدّاد في هذا المسار فلا شيء يُرجَع مع
  -- الاستثناء. الفرق بين الدالتين ليس تناقضاً — هو **سبب** القاعدة (D-48).
  if v_booking is null then
    raise exception 'لا حجز بهذا الرابط' using hint = 'not-found';
  end if;

  if exists (
    select 1 from public.customer_bookings cb
     where cb.profile_id = v_profile and cb.booking_id = v_booking
  ) then
    raise exception 'هذا الحجز مربوط بحسابك سلفاً' using hint = 'already-linked';
  end if;

  insert into public.customer_bookings (profile_id, booking_id)
  values (v_profile, v_booking)
  on conflict (profile_id, booking_id) do nothing;

  return query select b.reference from public.bookings b where b.id = v_booking;
end;
$$;

comment on function public.link_booking_by_token(text) is
  'يربط حجزاً بحساب المنادي بحيازة توكنه العام — مسار ما بعد الإتمام. 🔒 الحساب من auth.uid() لا من وسيط: وسيطٌ يعني ربط حجز أحدهم بحساب غيره. ولا خانق عليه لأن لا شيء يُعدّ: حاملُ التوكن يرى الصفحة كاملةً أصلاً فالربط لا يكشف حرفاً جديداً.';

revoke all on function public.link_booking_by_token(text) from public, anon;
grant execute on function public.link_booking_by_token(text) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- (٤) «حجوزاتي» — الإسقاط الآمن، اثنا عشر عموداً لا ثلاثة عشر
-- ----------------------------------------------------------------------------
-- 🔒 كل عمود هنا **قرارٌ بالإضافة لا بالحذف**: ما ليس مكتوباً في نوع الإرجاع لا
--    يخرج أصلاً، فلا حجب في العرض ولا `select=*` يلتفّ. ولذلك لا
--    `subcontractor_id` ولا `subcontractor_cost` ولا `margin_amount` ولا
--    `price_source` ولا `public_token` — **غير موجودة في الحمولة**، وهو الفرق
--    الذي أصلحته 0043 في حمولة العميل.
--
-- ولا سعرَ مخزَّن يُعرض عرضاً: `total` و`amount_due` و`amount_remaining` أرقامُ
--    حجزٍ مُبرَم لا تسعيرة جديدة — والتسعير يخرج من `quote_price` عند كل طلب
--    (**D-05**). فقائمة «حجوزاتي» تعرض ما دُفع، ولا تملأ منها سعرَ حجزٍ قادم.
-- ----------------------------------------------------------------------------

create or replace function public.my_bookings()
returns table (
  reference        text,
  status           text,
  class_title      text,
  total            numeric,
  currency         text,
  amount_due       numeric,
  amount_remaining numeric,
  origin_label     text,
  dest_label       text,
  pickup_at        timestamptz,
  passengers       integer,
  created_at       timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    b.reference,
    b.status,
    b.class_title,
    b.total,
    b.currency,
    b.amount_due,
    b.amount_remaining,
    b.trip ->> 'originLabel',
    b.trip ->> 'destLabel',
    nullif(btrim(coalesce(b.trip ->> 'pickupAt', '')), '')::timestamptz,
    coalesce(public.jsonb_number(b.trip, 'passengers', 1), 1)::integer,
    b.created_at
  from public.customer_bookings cb
  join public.bookings b on b.id = cb.booking_id
  -- الشرطان معاً بنمط `portal_trips`: المقارنة بـ`null` تُرجع `null` فتُرشَّح
  -- الصفوف على أي حال، لكن الشرط الصريح يجعل «بلا جلسة ⇒ لا شيء» مقروءاً لا
  -- مستنتَجاً — وحارسٌ يُقرأ هو حارسٌ لا يُحذف بالسهو.
  where (select auth.uid()) is not null
    and cb.profile_id = (select auth.uid())
  -- الأحدث أولاً: القائمة سجلٌّ يُقرأ من أعلاه، والرحلة القادمة تُبرَز في العرض
  -- بـ`pickup_at` لا بترتيب الاستعلام.
  order by b.created_at desc;
$$;

comment on function public.my_bookings() is
  '«حجوزاتي» — الإسقاط الآمن لحجوزات المنادي كما يراها صاحبها. 🔒 اثنا عشر عموداً هي عين MyBookingRow في lib/customer-types.ts، وبلا تكلفة ولا هامش ولا هوية متعهد ولا price_source ولا public_token: **غائبة من نوع الإرجاع** لا محجوبة في العرض. وهي بديلُ سياسة SELECT على bookings لا مكمّلها — سياسةٌ واحدة هناك تفتح v_booking_profit وv_stats_orders وv_stats_customers معها (‏§١).';

revoke all on function public.my_bookings() from public, anon;
grant execute on function public.my_bookings() to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- فحص ذاتي — يقيس ناتج الدوال، ويفحص كاشفَه قبل أن يفحص به
-- ----------------------------------------------------------------------------
-- ⚠ درسُ 0042: فحصُها بحث عن اسم عمود في **نصّ** جسم الدالة فوجده جزءاً من
--    معرّفٍ آخر، فمرّ أخضر على ميزةٍ معطوبة. فلا مطابقة نصوص هنا بحال:
--    الأعمدة تُقرأ من الكتالوج (‏`proargnames`/`proargmodes` = عقد الإخراج
--    نفسه)، والحمولة تُقاس **بنداءٍ حيّ** ثم تُحوَّل إلى `jsonb` وتُعدّ مفاتيحها.
--
-- ⚠ ودرسُ تدقيق §٤: أول كاشف في ذلك التدقيق أنتج ٤١ إنذاراً كاذباً — «ولو كان
--    الخلل معكوساً لأنتج طمأنينة كاذبة». فكل كاشف هنا يمرّ بـ**شاهد موجب**
--    أولاً: نُثبت أنه قادر على قول «نعم» على حالةٍ نعرف أنها قائمة، وإلا كان
--    صمتُه بعدها لا يعني شيئاً.
-- ----------------------------------------------------------------------------

do $$
declare
  v_cols      text[];
  v_bad       text;
  v_keys      text;
  v_n         integer;
  v_i         integer;
  v_ok        boolean;
  v_hint      text;
  v_profile   uuid;
  v_booking   uuid;
  v_token     text;
  v_ref       text;
  v_total     numeric;
  v_got       text;
  v_row       jsonb;
  v_forbidden constant text[] := array[
    -- عينُ `CUSTOMER_FORBIDDEN_COLUMNS` في lib/customer-types.ts
    'subcontractor_id', 'subcontractor_cost', 'subcontractor_cost_oneway',
    'margin_amount', 'price_source', 'public_token'];
  v_expected  constant text[] := array[
    -- عينُ حقول `MyBookingRow` — الحضور يُفحص كما يُفحص الغياب، وإلا مرّ الفحص
    -- على دالةٍ لا تُرجع شيئاً أصلاً
    'reference', 'status', 'class_title', 'total', 'currency', 'amount_due',
    'amount_remaining', 'origin_label', 'dest_label', 'pickup_at',
    'passengers', 'created_at'];
begin
  -- ══ (أ) أعمدة الإخراج من الكتالوج ═════════════════════════════════════════
  select array_agg(a.nm order by a.ord) into v_cols
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    cross join lateral unnest(p.proargnames, p.proargmodes)
      with ordinality as a(nm, md, ord)
   where n.nspname = 'public' and p.proname = 'my_bookings' and a.md::text = 't';

  -- 🔒 فحصُ الفحص: كاشفٌ لا يقرأ عموداً واحداً يمرّ أخضر فوق أي تسريب
  if v_cols is null or coalesce(array_length(v_cols, 1), 0) = 0 then
    raise exception '0044: كاشف الأعمدة لم يقرأ عموداً واحداً من my_bookings — الفحص نفسه معطوب';
  end if;

  select string_agg(x.c, '، ') into v_bad
    from unnest(v_expected) as x(c) where not (x.c = any (v_cols));
  if v_bad is not null then
    raise exception '0044: أعمدة العقد ناقصة من my_bookings: %', v_bad;
  end if;

  select string_agg(x.c, '، ') into v_bad
    from unnest(v_forbidden) as x(c) where x.c = any (v_cols);
  if v_bad is not null then
    raise exception '0044: عمودٌ ممنوع في إخراج my_bookings: %', v_bad;
  end if;

  -- وأي زيادة على الاثني عشر تُوقف الهجرة: العقد يقول «قرارٌ بالإضافة»، فالعمود
  -- الثالث عشر يمرّ بمراجعة أو لا يمرّ — ولا يتسلّل.
  if array_length(v_cols, 1) <> 12 then
    raise exception '0044: my_bookings تُخرج % عموداً لا اثني عشر: %',
      array_length(v_cols, 1), array_to_string(v_cols, '، ');
  end if;

  -- ══ (ب) الزائر لا ينفّذ شيئاً من الثلاث ═══════════════════════════════════
  if exists (select 1 from pg_roles where rolname = 'anon') then
    -- شاهدٌ موجب: الكاشف يرى منحةً قائمة فعلاً (`get_booking_by_token` لـanon
    -- منذ 0007). بدونه يكون صمتُه أدناه صمتَ كاشفٍ معطوب لا صمتَ أمان.
    if not has_function_privilege('anon', 'public.get_booking_by_token(text)', 'execute') then
      raise exception '0044: كاشف الصلاحيات لا يرى منحةً قائمة — الفحص نفسه معطوب';
    end if;

    select string_agg(x.f, '، ') into v_bad
      from (values
        ('public.link_booking_by_reference(text, text, text)'),
        ('public.link_booking_by_token(text)'),
        ('public.my_bookings()')
      ) as x(f)
     where has_function_privilege('anon', x.f, 'execute');
    if v_bad is not null then
      raise exception '0044: الزائر ينفّذ دوال الحسابات: %', v_bad;
    end if;
  end if;

  -- ══ (ج) جدول الربط: بلا منح عام، وRLS مفعّلة، وبلا سياسات ════════════════
  -- شاهدٌ موجب لكاشف منح الجداول: `authenticated` يقرأ `bookings` فعلاً اليوم
  if not has_table_privilege('authenticated', 'public.bookings', 'select') then
    raise exception '0044: كاشف منح الجداول لا يرى منحةً قائمة — الفحص نفسه معطوب';
  end if;

  select count(*) into v_n from information_schema.table_privileges
   where table_schema = 'public' and table_name = 'customer_bookings'
     and grantee in ('anon', 'authenticated', 'PUBLIC');
  if v_n > 0 then
    raise exception '0044: جدول الربط ممنوح لدور عام (% منحة) — والمنح هو ما يرشّح الأعمدة', v_n;
  end if;

  if not (select c.relrowsecurity from pg_class c
            join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relname = 'customer_bookings') then
    raise exception '0044: RLS غير مفعّلة على جدول الربط';
  end if;

  select count(*) into v_n from pg_policy
   where polrelid = 'public.customer_bookings'::regclass;
  if v_n <> 0 then
    raise exception '0044: جدول الربط عليه % سياسة — والمقصود صفر (الوصول من الدوال وحدها)', v_n;
  end if;

  if not exists (
    select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
     where not t.tgisinternal and c.relname = 'customer_bookings'
       and t.tgname like 'audit\_%'
  ) then
    raise exception '0044: جدول الربط خارج رصد التدقيق';
  end if;

  -- ══ (د) 🔒 ولا سياسة جديدة على `bookings` — القاعدة الحاكمة ══════════════
  if not exists (
    select 1 from pg_policy where polrelid = 'public.bookings'::regclass
       and polname = 'bookings_select_admin'
  ) then
    raise exception '0044: كاشف السياسات لا يجد bookings_select_admin — يقرأ الجدول الخطأ';
  end if;

  select count(*) into v_n from pg_policy where polrelid = 'public.bookings'::regclass;
  if v_n <> 3 then
    raise exception '0044: سياسات bookings % لا ثلاث — سياسةٌ واحدة جديدة تفتح v_booking_profit وv_stats_orders وv_stats_customers معها (‏§١)', v_n;
  end if;

  select count(*) into v_n from pg_policy
   where polrelid = 'public.bookings'::regclass and polcmd = 'r';
  if v_n <> 1 then
    raise exception '0044: سياسات SELECT على bookings % لا واحدة — والواحدة هي الإدارية', v_n;
  end if;

  -- ══ (هـ) القياس الحيّ: نداءٌ فعليّ بدور `authenticated` وهويّةٍ حقيقية ════
  select p.id into v_profile from public.profiles p order by p.created_at limit 1;
  select b.id, b.public_token, b.reference, b.total
    into v_booking, v_token, v_ref, v_total
    from public.bookings b
   where b.public_token is not null and length(b.public_token) >= 32
   order by b.created_at desc limit 1;

  if v_profile is null or v_booking is null then
    -- قاعدةٌ جديدة (نسخة Whitelabel) — الفحوص البنيوية أعلاه جرت كلها
    raise notice '  ↳ 0044: لا ملفّ أو لا حجز بتوكن — القياس الحيّ متخطٍّ';
  else
    begin
      perform set_config('request.jwt.claim.sub', v_profile::text, true);

      -- شاهدٌ موجب للهوية: بلا فعّاليتها يصير كل ما بعدها «فحصاً لا يمكن أن يفشل»
      if (select auth.uid()) is distinct from v_profile then
        raise exception '0044: الهوية المحقونة غير فعّالة — القياس الحيّ لا يقيس شيئاً';
      end if;

      -- ودورُ المنادي الحقيقي، لا دور المالك: هكذا يُقاس المنح والتفويض معاً
      execute 'set local role authenticated';

      -- (هـ-١) الربط بالتوكن يعمل ويعيد المرجع وحده
      select l.reference into v_got from public.link_booking_by_token(v_token) l;
      if v_got is distinct from v_ref then
        raise exception '0044: link_booking_by_token أعادت «%» لا «%»',
          coalesce(v_got, '(صفر صفوف)'), v_ref;
      end if;

      -- (هـ-٢) 🔒 وهذا هو القياس: مفاتيح صفّ `my_bookings` **كما تخرج فعلاً**
      select to_jsonb(m) into v_row from public.my_bookings() m limit 1;
      if v_row is null then
        raise exception '0044: my_bookings صفر صفوف بعد ربطٍ ناجح — الفحص كان سيمرّ فوق ميزة معطوبة';
      end if;

      select string_agg(t.k, '، ' order by t.k) into v_keys
        from (select jsonb_object_keys(v_row) k) t;

      select string_agg(x.c, '، ') into v_bad
        from unnest(v_forbidden) as x(c) where v_row ? x.c;
      if v_bad is not null then
        raise exception '0044: عمودٌ ممنوع في الحمولة المقيسة: %', v_bad;
      end if;

      -- والقيمة لا الاسم وحده: `total` هو ما يدفعه العميل، فلو حُشي فيه رقمٌ
      -- آخر (تكلفة أو هامش) لمرّ فحصُ الأسماء وحده أخضر.
      if (v_row ->> 'total')::numeric is distinct from v_total then
        raise exception '0044: total في my_bookings «%» لا يطابق total الحجز «%»',
          v_row ->> 'total', v_total;
      end if;
      if (v_row ->> 'reference') is distinct from v_ref then
        raise exception '0044: my_bookings أعادت حجزاً غير المربوط';
      end if;

      -- (هـ-٣) 🔒 والمستخدم المسجَّل **لا يقرأ جدول الربط مباشرةً** — قياسٌ
      --        بالنداء لا بقراءة كتالوج المنح
      v_ok := false;
      begin
        execute 'select count(*) from public.customer_bookings' into v_n;
      exception when others then v_ok := true;
      end;
      if not v_ok then
        raise exception '0044: مستخدم مسجَّل قرأ جدول الربط مباشرةً — المنح مفتوح';
      end if;

      -- (هـ-٤) إعادة الربط ⇒ `already-linked` بتلميحه
      v_hint := null; v_ok := false;
      begin
        perform * from public.link_booking_by_token(v_token);
      exception when others then
        v_ok := true;
        get stacked diagnostics v_hint = pg_exception_hint;
      end;
      if not v_ok or v_hint is distinct from 'already-linked' then
        raise exception '0044: إعادة الربط لم تُرفض بـalready-linked (التلميح: %)',
          coalesce(v_hint, '(بلا)');
      end if;

      -- (هـ-٥) 🔒 والتفويض يُقاس **بأثره**: ثماني محاولات بمرجعٍ لا وجود له
      --        **لا ترمي واحدةٌ منها** (D-48)، والتاسعة ترتطم بخانق 0027 نفسه
      --        — وهو ما لا يقع إلا إذا كان الغلاف يناديها فعلاً.
      for v_i in 1..8 loop
        begin
          select count(*) into v_n from public.link_booking_by_reference(
            'TR-ZZZZZZ', '01000000000', 'probe');
        exception when others then
          get stacked diagnostics v_hint = pg_exception_hint;
          raise exception '0044: المحاولة % رمت (تلميح: %) — ومسار «لا نتيجة» يجب أن يرجع صفر صفوف بلا استثناء وإلا سقط الخانق (D-48)',
            v_i, coalesce(v_hint, '(بلا)');
        end;
        if v_n <> 0 then
          raise exception '0044: مرجعٌ لا وجود له أعاد صفاً — الفحص يلمس حجزاً حقيقياً';
        end if;
      end loop;

      v_hint := null; v_ok := false;
      begin
        perform * from public.link_booking_by_reference(
          'TR-ZZZZZZ', '01000000000', 'probe');
      exception when others then
        v_ok := true;
        get stacked diagnostics v_hint = pg_exception_hint;
      end;
      if not v_ok then
        raise exception '0044: المحاولة التاسعة لم تُخنَق — الربط لا يفوّض إلى find_booking_by_reference';
      end if;
      if v_hint is distinct from 'rate-limited' then
        raise exception '0044: الخانق رفع تلميح «%» لا rate-limited', coalesce(v_hint, '(بلا)');
      end if;

      execute 'reset role';
      -- كل ما سبق داخل معاملة فرعية تُرجَع: الربط والعدّادات وصفوف التدقيق
      -- تختفي معاً، فلا يترك القياسُ أثراً في قاعدة حيّة.
      raise exception '0044_PROBE_ROLLBACK';
    exception
      when others then
        execute 'reset role';
        perform set_config('request.jwt.claim.sub', '', true);
        if sqlerrm <> '0044_PROBE_ROLLBACK' then raise; end if;
    end;

    raise notice '  ↳ 0044: مفاتيح my_bookings المقيسة بالنداء: %', v_keys;
  end if;

  raise notice '✔ 0044: اثنا عشر عموداً لا غير في my_bookings ولا ممنوعَ فيها (مقيسة بالنداء)، ولا منح لزائر ولا لمستخدم مسجَّل على جدول الربط، وRLS بلا سياسة، وسياسات bookings ثلاثٌ كما كانت، والربط يفوّض ويخنق ولا يرمي على «لا نتيجة»';
end;
$$;
