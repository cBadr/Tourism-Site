-- ============================================================================
-- 0045 — تصليب ربط الحجوزات بالحسابات بعد المراجعتين (المرحلة ١٢ب)
--
-- أربعة عيوب نجت من دحضٍ عدائيّ لمراجعة `0044`. و`0044` **مطبَّقة ولا تُعدَّل**
-- (انضباط الهجرات: الملف المُطبَّق تاريخٌ لا مسودة) — فالإصلاح كامله هنا.
-- والعقد الملزم `lib/customer-types.ts` §١–§٥؛ هذا الملف ينفّذ ولا يعيد اشتقاق.
--
-- ── (١) متوسط: الحيازة إثباتُ **اطّلاع** لا إثباتُ **هويّة** ───────────────
--
-- `link_booking_by_token` تربط بحيازة التوكن. وهذا صوابٌ للاطّلاع: من يملك
-- الرابط يرى صفحة الحجز كاملةً أصلاً، فالربط لا يكشف حرفاً جديداً. لكن **روابط
-- الحجوزات تُعاد توجيهاً**: يرسلها العميل لزوجته أو لسائقه أو في مجموعة واتساب.
--
-- والعقد يَعِد في `BookingPrefill.customerPhone` بـ«الهاتف المُثبَت وحده — لا ما
-- كُتب في التسجيل (§٢)». فاللحظة التي يقرأ فيها أي ملءٍ تلقائيّ هاتفاً من حجزٍ
-- مربوط، يرث **من أُعيد توجيه الرابط إليه** اسمَ صاحب الحجز وهاتفه في حسابه هو.
-- أي أن خطر §٢ — «حقلٌ يظنّه القارئ التالي مُثبَتاً وهو مُدَّعى» — يعود من بابٍ
-- ثانٍ بعد أن أُغلق الأول: لا من حمولة التسجيل هذه المرة، بل من رابطٍ مُمرَّر.
--
-- 🔒 فدرجةُ الإثبات **تُخزَّن مع الرابط لحظة وقوعه**، ولا تُستنتج بعده: عمودٌ
-- `link_source` مقيَّد بقيمتين لا ثالث لهما — `'reference'` (المرجع والهاتف
-- مُثبَتان معاً) و`'token'` (حيازة فقط). و`my_bookings()` لا تتغيّر بحرف: التمييز
-- موجودٌ كي يستطيع ملءٌ تلقائيٌّ **قادم** أن يمتنع عن القراءة من رابط `'token'`.
--
-- ── والاتجاه الوحيد المسموح: `token` ⇐ `reference`، ولا عكس ───────────────
--
-- ماذا لو رُبط الحجز نفسه بالحساب نفسه من المسارين؟ المفتاح مركّب فالصفّ واحد،
-- والسؤال «أيّ قيمة تبقى؟». والجواب أن `'reference'` **إثبات** و`'token'`
-- **حيازة**، والإثبات لا ينقضه فعلٌ أضعف يقع بعده:
--
--   • حيازةٌ ثم إثبات ⇒ **ترقية** إلى `'reference'`. وإلا فالعميل الذي أثبت
--     هاتفه فعلاً يبقى رابطُه «حيازةً»، فيمتنع الملء التلقائي عنه إلى الأبد
--     بسببٍ لا يظهر في شاشة ولا في سجلّ — عطبُ «فقدِ معلومة» لا يمسكه اختبار.
--   • إثباتٌ ثم حيازة ⇒ **لا تنزيل**. القيمة تُثبَّت بـ`on conflict do nothing`
--     في مسار التوكن، فالتنزيل مستحيلٌ بنيوياً لا ممنوعاً بالانضباط.
--
-- ⚠ **والترقية لا يجوز أن تُكتب قبل رفعٍ**: كل نداء PostgREST معاملةٌ واحدة،
--   فرفعُ `already-linked` يُرجعها **ومعها الترقية التي كُتبت لتوّها** ⇒ ترقيةٌ
--   لا تقع أبداً وفحصٌ يمرّ أخضر فوقها. وهي **آليّة D-48 بعينها** مطبَّقةً على
--   شيءٍ آخر. فحارس «مربوطٌ سلفاً» في مسار المرجع ضُيِّق إلى «مربوطٌ سلفاً
--   **وبإثبات**»: أما الرابط `'token'` فنداءُ المرجع عليه **ترقيةٌ ناجحة** لا
--   رفض — ولا يكسر ذلك رمز `already-linked` في العقد، فهو ما زال يُرفع حين لا
--   جديد يُكتب، وهو نصّه: «نجاحٌ في نظر العميل لا خطأ».
--
-- ── (٢) متوسط: فحص 0044 الذاتي يفشل فشلاً كاذباً ويتّهم البريء ────────────
--
-- فحصُ الخانق في 0044 يقيس الحدّ بمناداة الغلاف ثماني مرات على حسابٍ **يختاره
-- من القاعدة** (`profiles order by created_at limit 1`). ولو كان دلوُ ذلك الحساب
-- في `booking_lookup_attempts` ممتلئاً سلفاً — من تشغيلٍ سابق أو من استعمالٍ
-- حقيقي في نفس الربع ساعة — لرفعت **المحاولة الأولى** `rate-limited`، فيطبع
-- الفحص اتهاماً لـ**D-48**: «مسار لا نتيجة يجب أن يرجع صفر صفوف بلا استثناء».
-- أي أن الهجرة تسقط، والرسالة تدلّ على عيبٍ **لا وجود له في الغلاف**، فيذهب من
-- يقرؤها يفتّش في المكان الخطأ.
--
-- فالقياس هنا: (أ) **يُفرَّغ دلو الحساب أولاً** داخل المعاملة الفرعية المُرجَعة،
-- فيبدأ العدّ من صفرٍ معلوم لا من صفرٍ مفترَض؛ (ب) و**يفرّق بين العطبين**:
-- محاولةٌ أولى مخنوقة **بعد** التفريغ حالةُ خانقٍ سابقة أو متزامنة، لا مخالفةَ
-- D-48 — ولكلٍّ منهما رسالته الخاصة.
--
-- ── (٣) منخفض: توكيدٌ لا يمكن أن يفشل، ووسمٌ في المكان الخطأ ──────────────
--
-- 0044 تعلن «لا عمود ممنوع في الحمولة المقيسة» بمقارنة **مفاتيح** `jsonb` — في
-- موضعٍ تكون فيه المفاتيح مثبَّتةً بنيوياً بنوع إرجاع الدالة، وقد فُحص من
-- الكتالوج قبلها بعشرين سطراً. فهو **حارس شكل** لا قياس: لن يفشل أبداً ما لم
-- يتغيّر نوع الإرجاع — وحينها يكون فحصُ الكتالوج قد أمسكه أولاً.
--
-- ولا يُحذف: ثمنه صفر، ويحرس تغيّر شكلٍ قادماً. لكن وسم «🔒 وهذا هو القياس»
-- يُنقل إلى موضعه الحقيقي — **مقارنة القيم**: أن `total` هو `total` الحجز نفسه،
-- وأن رقمَي التكلفة والهامش لا يظهران في الحمولة **تحت أي مفتاح**. تلك وحدها
-- هي التي تفشل حين يُحشى رقمٌ داخليّ في خانةٍ بريئة الاسم.
--
-- ── (٤) منخفض: وسمُ التدقيق يكرّر معرّفاً ولا يفيد الدعم ──────────────────
--
-- `audit_customer_bookings` تمرّر `'booking_id'` وسماً، و`log_audit` تكتبه في
-- `entity_label`. والنتيجة UUID خام يكرّر عمود `booking_id` في الصف نفسه (بل إن
-- `entity_id` يبقى فارغاً أصلاً: الجدول بمفتاح مركّب بلا عمود `id`). فالدعم يفتح
-- السجلّ فيقرأ الرقم مرتين ولا يعرف **من** ربط.
--
-- والاختيار: `'profile_id'`. وهو UUID خام كذلك، لكنه **المعلومة الوحيدة الغائبة
-- عن الصف**: `booking_id` محفوظ في عموده، و`subcontractor_id` لا ينطبق، وحمولة
-- `snapshot` لا تُكتب إلا على الحذف و`changes` إلا على التعديل — فالإدراج، وهو
-- الحدث الغالب، كان يخرج بلا أثرٍ لصاحبه. وأُوثر على إسقاط الوسيط (‏«حقلٌ فارغ
-- بصدق») لأن السؤال الذي يُفتح لأجله هذا السجلّ هو «**من** ربط هذا الحجز؟».
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (١) العمود: درجة الإثبات تُخزَّن لحظة الربط
-- ----------------------------------------------------------------------------

alter table public.customer_bookings
  add column if not exists link_source text;

-- ── الملء الرجعي: كل رابطٍ قائم يصير `'token'` ───────────────────────────────
-- ⚠ **قرارٌ لا تحوّط.** 0044 لا تسجّل طريق الربط أصلاً، فلا سبيل بعدها إلى معرفة
--   أيّ صفٍّ جاء بمرجعٍ وهاتف مُثبَتين. و«لا نعرف» ليست «مُثبَت» (القاعدة ١٥) —
--   فالقيمة الأضعف هي **الصادقة**، وهي كذلك **الفاشلة إلى الأمان**: من يقرأ منها
--   هاتفاً غداً يمتنع، بدل أن يملأ هاتف عميلٍ في نموذج غيره. والعكس (‏افتراض
--   `'reference'` رجعياً) يمنح إثباتاً لم يقع، وهو بالضبط ما بُني العمود لمنعه.
-- والمقيس على قاعدة بدر لحظة الكتابة: **صفر رابط قائم**، فالسطر بلا أثر هنا
--   ومكتوبٌ لنسخ العلامة البيضاء التي قد تكون سبقت بربطٍ فعلي.
update public.customer_bookings set link_source = 'token' where link_source is null;

alter table public.customer_bookings alter column link_source set not null;

-- ⚠ **وبلا `default` عمداً.** قيمةٌ افتراضية تعني أن دالةً تُكتب غداً وتنسى
--   العمود تُنتج رابطاً بدرجة إثباتٍ لم يقصدها أحد — بصمت. وبلا افتراضيّ يفشل
--   الإدراج فوراً بـ`not-null violation`، فيُجبَر الكاتب على الإفصاح. (وهو الفرق
--   نفسه بين «حارسٍ يُقرأ» و«حارسٍ يُستنتَج» في `my_bookings`.)
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.customer_bookings'::regclass
       and conname = 'customer_bookings_link_source_chk'
  ) then
    alter table public.customer_bookings
      add constraint customer_bookings_link_source_chk
      check (link_source in ('reference', 'token'));
  end if;
end;
$$;

comment on column public.customer_bookings.link_source is
  'درجةُ الإثبات لحظة الربط: reference = المرجع والهاتف مُثبَتان معاً عبر find_booking_by_reference · token = حيازةُ الرابط وحدها. 🔒 والفرق ليس توثيقاً: روابط الحجوزات تُعاد توجيهاً، فأي ملءٍ تلقائي يقرأ هاتفاً من رابط token يورّث بيانات صاحب الحجز لمن أُرسل إليه الرابط (‏§٢ في lib/customer-types.ts من بابٍ ثانٍ). والقيمة ترتقي ولا تنزل: token ⇐ reference فقط.';

-- ⚠ السحب حمّال ويُعاد بعد كل تغيير بنية: Supabase تمنح الأدوار العامة صلاحيات
--    واسعة، ومنها `TRUNCATE` التي **لا تخضع لـRLS إطلاقاً** (0041). والعمود
--    الجديد لا يغيّر المنح، لكن إعادة التوكيد أرخص من افتراضه.
revoke all on table public.customer_bookings from public, anon, authenticated;
grant all on table public.customer_bookings to service_role;

-- ----------------------------------------------------------------------------
-- (٢) مسار المرجع: يكتب `'reference'`، ويُرقّي رابطَ حيازةٍ سابقاً
-- ----------------------------------------------------------------------------
-- الجسم منقول من `pg_get_functiondef` الحيّ (D-58) لا من ملف 0044. الفرقان:
-- عمود `link_source` في الإدراج، وتضييق حارس «مربوطٌ سلفاً» ليمرّ للترقية.
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
  v_profile  uuid;
  v_token    text;
  v_booking  uuid;
  v_existing text;
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

  -- (ب) 🔒 التفويض. والمفتاح `acct:` لا `p_client_key` — انظر (٤) في ترويسة 0044.
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

  -- (د) 🔒 الحارس مضيَّق في 0045: «مربوطٌ سلفاً **وبإثبات**».
  --     بلوغُ هذا السطر يستلزم مرجعاً وهاتفاً صحيحين معاً — أي أن الهاتف أُثبت
  --     الآن. فإن كان الرابط القائم `'token'` فهذا نداءُ **ترقية** لا تكرار،
  --     ولو رُفع هنا لرجعت المعاملة ومعها الترقية التي لم تُكتب بعد أصلاً —
  --     ترقيةٌ لا تقع، وفحصٌ يمرّ فوقها أخضر (آليّة D-48 على شيءٍ آخر).
  --     أما `'reference'` فوق `'reference'` فلا جديد يُكتب، ويبقى الرمز كما هو.
  select cb.link_source into v_existing
    from public.customer_bookings cb
   where cb.profile_id = v_profile and cb.booking_id = v_booking;

  if v_existing = 'reference' then
    raise exception 'هذا الحجز مربوط بحسابك سلفاً' using hint = 'already-linked';
  end if;

  -- `on conflict` لسباق إرسالين متزامنين: الفحص أعلاه يقرأ لقطةً، والمفتاح
  -- المركّب هو الحكم. والنتيجة نجاحٌ في الحالتين — الربط عملية جامعة (idempotent).
  -- وشرطُ `do update` يجعل الكتابة **ترقيةً فقط**: لا `UPDATE` بلا تغيير، فلا
  -- صفَّ تدقيق زائف يقول «عُدِّل» وشيءٌ لم يتغيّر.
  insert into public.customer_bookings as cb (profile_id, booking_id, link_source)
  values (v_profile, v_booking, 'reference')
  on conflict (profile_id, booking_id) do update
    set link_source = 'reference'
    where cb.link_source is distinct from 'reference';

  -- المرجع وحده يعود. لا توكن ولا معرّف ولا رقم (ترويسة 0044، البند ٥).
  return query select b.reference from public.bookings b where b.id = v_booking;
end;
$$;

comment on function public.link_booking_by_reference(text, text, text) is
  'يربط حجزاً سابقاً بحساب المنادي بمرجعه وهاتفه، ويكتب link_source = reference لأن الهاتف أُثبت. 🔒 يفوّض إلى find_booking_by_reference ولا يستنسخها (القاعدة ١٢ · D-58)، ويمرّر مفتاح خانقٍ مشتقاً من auth.uid() لا من p_client_key. و«لا نتيجة» ⇒ **صفر صفوف بلا استثناء** حتى تبقى المحاولة محسوبة (D-48). وحين يكون الرابط قائماً بـtoken فهذا نداءُ **ترقية** ينجح ولا يرفع already-linked — والرفع قبل الكتابة كان سيُرجع الترقية معه (0045 عيب ١).';

revoke all on function public.link_booking_by_reference(text, text, text) from public, anon;
grant execute on function public.link_booking_by_reference(text, text, text)
  to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- (٣) مسار التوكن: يكتب `'token'`، ولا ينزل بإثباتٍ قائم أبداً
-- ----------------------------------------------------------------------------
-- الجسم من `pg_get_functiondef` الحيّ (D-58). الفرق الوحيد: عمودُ المصدر في
-- الإدراج، و`do nothing` هو ما يجعل التنزيل مستحيلاً حتى في السباق.
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

  -- ويجوز الرمي هنا بخلاف مسار المرجع: لا عدّاد في هذا المسار فلا شيء يُرجَع مع
  -- الاستثناء. الفرق بين الدالتين ليس تناقضاً — هو **سبب** القاعدة (D-48).
  if v_booking is null then
    raise exception 'لا حجز بهذا الرابط' using hint = 'not-found';
  end if;

  -- والحارس هنا يبقى على اتساعه: الحيازة لا تضيف شيئاً فوق رابطٍ قائم، أياً كانت
  -- درجته. فلا ترقية ولا تنزيل — و«مربوطٌ سلفاً» هو الجواب الصادق.
  if exists (
    select 1 from public.customer_bookings cb
     where cb.profile_id = v_profile and cb.booking_id = v_booking
  ) then
    raise exception 'هذا الحجز مربوط بحسابك سلفاً' using hint = 'already-linked';
  end if;

  -- 🔒 `do nothing` لا `do update`: في السباق النادر (إرسالان معاً، أو إثباتٌ
  --    بالمرجع وقع بين الفحص والإدراج) يبقى الصفُّ القائم كما هو — فتنزيلُ
  --    `'reference'` إلى `'token'` **مستحيلٌ بنيوياً** لا ممنوعٌ بالانضباط.
  insert into public.customer_bookings (profile_id, booking_id, link_source)
  values (v_profile, v_booking, 'token')
  on conflict (profile_id, booking_id) do nothing;

  return query select b.reference from public.bookings b where b.id = v_booking;
end;
$$;

comment on function public.link_booking_by_token(text) is
  'يربط حجزاً بحساب المنادي بحيازة توكنه العام — مسار ما بعد الإتمام — ويكتب link_source = token: حيازةٌ لا إثبات هويّة، لأن روابط الحجوزات تُعاد توجيهاً. 🔒 الحساب من auth.uid() لا من وسيط. ولا خانق عليه لأن لا شيء يُعدّ: حاملُ التوكن يرى الصفحة كاملةً أصلاً. و`on conflict do nothing` يجعل تنزيل رابطٍ مُثبَت إلى حيازة مستحيلاً حتى في السباق.';

revoke all on function public.link_booking_by_token(text) from public, anon;
grant execute on function public.link_booking_by_token(text) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- (٤) وسم التدقيق: «من ربط» بدل تكرار «أيّ حجز»
-- ----------------------------------------------------------------------------

drop trigger if exists audit_customer_bookings on public.customer_bookings;
create trigger audit_customer_bookings
  after insert or update or delete on public.customer_bookings
  for each row execute function public.log_audit('profile_id');

-- ============================================================================
-- فحص ذاتي — يبني فيكسترته بنفسه، ويفحص كل كاشفٍ قبل أن يفحص به
-- ============================================================================
-- ⚠ **ولا مسار تخطٍّ فيه.** 0044 كانت تتخطّى القياس الحيّ بإشعارٍ حين لا تجد
--    ملفاً أو حجزاً في القاعدة — أي أن هجرةً على نسخةٍ فارغة تمرّ **خضراء بلا
--    قياس واحد**. فهذا الفحص **يُنشئ ما يقيس عليه** (مستخدماً وحجوزاً أربعة)
--    داخل معاملة فرعية تُرجَع بكاملها، فلا يتخطّى ولا يترك أثراً — وإن لم
--    تتكوّن الفيكسترة رفع، لأن مِجسّاً لا يقيس شيئاً لا يجوز أن يصمت.
--
-- ⚠ ودرسُ 0042 و§٤: لا مطابقة نصوص. الأعمدة من الكتالوج، والقيم **بنداءٍ حيّ**
--    بدور `authenticated` وهويّةٍ محقونة، ودرجةُ الإثبات تُقرأ من **الصفّ
--    المخزَّن بعد نداء الدالتين** لا من قراءة أجسامهما.
-- ============================================================================

do $$
declare
  v_user      uuid := '00000000-0000-4000-8000-0000000450a1';
  v_profile   uuid;
  v_phone     constant text := '01000000451';
  v_tok_a     constant text := '0045probe' || repeat('a', 40);
  v_tok_b     constant text := '0045probe' || repeat('b', 40);
  v_tok_c     constant text := '0045probe' || repeat('c', 40);
  v_tok_d     constant text := '0045probe' || repeat('d', 40);
  v_id_a      uuid;
  v_id_b      uuid;
  v_id_c      uuid;
  v_id_d      uuid;
  v_bk        record;
  v_n         integer;
  v_i         integer;
  v_cleared   integer;
  v_bad       text;
  v_keys      text;
  v_got       text;
  v_hint      text;
  v_state     text;
  v_label     text;
  v_ok        boolean;
  v_row       jsonb;
  v_src_a     text;
  v_src_b     text;
  v_src_c     text;
  v_src_d     text;
  v_cols      text[];
  v_forbidden constant text[] := array[
    -- عينُ `CUSTOMER_FORBIDDEN_COLUMNS` في lib/customer-types.ts
    'subcontractor_id', 'subcontractor_cost', 'subcontractor_cost_oneway',
    'margin_amount', 'price_source', 'public_token'];
begin
  -- ══ (أ) بنية العمود — من الكتالوج، وبكاشفٍ مُثبَتٍ أولاً ═══════════════════
  -- شاهدٌ موجب: الكاشف يقرأ عموداً نعلم وجوده منذ 0044. بدونه يكون «لم أجد
  -- link_source» جهلَ الكاشف لا غيابَ العمود.
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'customer_bookings'
       and column_name = 'linked_at'
  ) then
    raise exception '0045: كاشف الأعمدة لا يرى linked_at — الفحص نفسه معطوب';
  end if;

  select array_agg(c.is_nullable || '|' || coalesce(c.column_default, '(بلا)'))
    into v_cols
    from information_schema.columns c
   where c.table_schema = 'public' and c.table_name = 'customer_bookings'
     and c.column_name = 'link_source';

  if v_cols is null then
    raise exception '0045: عمود link_source غير موجود على جدول الربط';
  end if;
  if v_cols[1] <> 'NO|(بلا)' then
    raise exception '0045: link_source بحالة «%» — والمطلوب NOT NULL وبلا default (كاتبٌ ينسى العمود يجب أن يفشل لا أن يرث درجة إثبات)', v_cols[1];
  end if;

  -- ══ (ب) جدول الربط ما زال بلا منح لأي دور عام ════════════════════════════
  -- شاهدٌ موجب لكاشف المنح: `authenticated` يقرأ `bookings` فعلاً اليوم
  if not has_table_privilege('authenticated', 'public.bookings', 'select') then
    raise exception '0045: كاشف منح الجداول لا يرى منحةً قائمة — الفحص نفسه معطوب';
  end if;

  select count(*) into v_n from information_schema.table_privileges
   where table_schema = 'public' and table_name = 'customer_bookings'
     and grantee in ('anon', 'authenticated', 'PUBLIC');
  if v_n > 0 then
    raise exception '0045: جدول الربط ممنوح لدور عام (% منحة) — والمنح هو ما يرشّح الأعمدة', v_n;
  end if;

  -- ══ (ج) القياس الحيّ كله داخل معاملة فرعية تُرجَع ═════════════════════════
  begin
    -- ── (ج-١) الفيكسترة: مستخدمٌ فحسابٌ، وأربعة حجوزات بهاتفٍ واحد ─────────
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                            created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
    values (v_user, '00000000-0000-0000-0000-000000000000', 'authenticated',
            'authenticated', '0045_probe@example.invalid', 'x', now(), now(),
            '{}'::jsonb, '{"full_name": "0045 فحص ذاتي"}'::jsonb);

    select p.id into v_profile from public.profiles p where p.id = v_user;
    if v_profile is null then
      raise exception '0045: لم يتكوّن ملفّ للمستخدم المُنشأ — handle_new_user لا تعمل، والقياس لا يقيس شيئاً';
    end if;

    insert into public.bookings (reference, public_token, status, class_slug, class_title,
                                 total, currency, plan, amount_due, amount_remaining,
                                 customer_name, customer_phone, trip)
    values
      ('TR-HA0045', v_tok_a, 'confirmed', 'h45-probe', '0045 فئة فحص', 4500, 'EGP',
       'deposit', 1500, 3000, '0045 فحص ذاتي', v_phone,
       jsonb_build_object('originLabel', '0045 مبدأ', 'destLabel', '0045 منتهى',
                          'passengers', 2, 'pickupAt', (now() + interval '3 days')::text)),
      ('TR-HB0045', v_tok_b, 'confirmed', 'h45-probe', '0045 فئة فحص', 4500, 'EGP',
       'deposit', 1500, 3000, '0045 فحص ذاتي', v_phone, '{}'::jsonb),
      ('TR-HC0045', v_tok_c, 'confirmed', 'h45-probe', '0045 فئة فحص', 4500, 'EGP',
       'deposit', 1500, 3000, '0045 فحص ذاتي', v_phone, '{}'::jsonb),
      ('TR-HD0045', v_tok_d, 'confirmed', 'h45-probe', '0045 فئة فحص', 4500, 'EGP',
       'deposit', 1500, 3000, '0045 فحص ذاتي', v_phone, '{}'::jsonb);

    -- رقمان داخليّان **موجودان فعلاً** على الحجز المقيس: بلا قيمةٍ ممنوعة حقيقية
    -- يصير فحصُ «لا تُسرَّب التكلفة» فحصاً على عمودٍ فارغ — أي لا يمكن أن يفشل.
    -- وقيمتاهما اختيرتا بنصٍّ لا يظهر داخل أي رقمٍ مشروع في الحمولة.
    update public.bookings
       set subcontractor_cost = 3777.77, margin_amount = 722.23, price_source = 'tariff'
     where reference = 'TR-HA0045';

    -- شاهدٌ موجب للقياس القادم، ويُقرأ **الآن بدور المالك**: `authenticated`
    -- يقرأ صفر صفوف من `bookings` (سياسة `is_admin()`)، فقراءةٌ هناك كانت
    -- ستُعطي فراغاً يُقرأ «الحجز بلا تكلفة» — إنذاراً كاذباً عن مِجسّ سليم.
    select b.total, b.subcontractor_cost, b.margin_amount into v_bk
      from public.bookings b where b.reference = 'TR-HA0045';
    if v_bk.subcontractor_cost is null or v_bk.margin_amount is null then
      raise exception '0045: حجز القياس بلا تكلفة أو هامش — القياس كان سيقع على عمودٍ فارغ';
    end if;

    select b.id into v_id_a from public.bookings b where b.reference = 'TR-HA0045';
    select b.id into v_id_b from public.bookings b where b.reference = 'TR-HB0045';
    select b.id into v_id_c from public.bookings b where b.reference = 'TR-HC0045';
    select b.id into v_id_d from public.bookings b where b.reference = 'TR-HD0045';
    if v_id_a is null or v_id_b is null or v_id_c is null or v_id_d is null then
      raise exception '0045: لم تتكوّن حجوزات الفحص الأربعة — المِجسّ نفسه معطوب';
    end if;

    -- ── (ج-٢) القيد يرفض قيمةً ثالثة ويرفض الفراغ — **بمحاولة إدراج حيّة** ──
    --     لا بقراءة `pg_get_constraintdef`: نصُّ القيد لا يقول إن القاعدة تنفّذه.
    --     والتمييز بـ`sqlstate` كي لا يُقرأ فشلٌ لسببٍ آخر (مفتاح أجنبي مثلاً)
    --     نجاحاً للحارس.
    --     ولا `raise` داخل كتلة المحاولة: مُعالجُها كان سيلتقطه فيُقرأ «قُبلت»
    --     رفضاً بحالة أخرى. فالنتيجة تُسجَّل في متغيّر ويُحكَم عليها خارجها.
    v_state := null;
    begin
      insert into public.customer_bookings (profile_id, booking_id, link_source)
      values (v_profile, v_id_a, 'guess');
      v_state := '(قُبلت)';
    exception when others then
      get stacked diagnostics v_state = returned_sqlstate;
    end;
    if v_state <> '23514' then
      raise exception '0045: إدراج قيمةٍ ثالثة في link_source انتهى بـ«%» لا 23514 (انتهاك check) — القيد غائب أو يفشل لسببٍ آخر', v_state;
    end if;

    v_state := null;
    begin
      insert into public.customer_bookings (profile_id, booking_id, link_source)
      values (v_profile, v_id_a, null);
      v_state := '(قُبلت)';
    exception when others then
      get stacked diagnostics v_state = returned_sqlstate;
    end;
    if v_state <> '23502' then
      raise exception '0045: إدراج فراغٍ في link_source انتهى بـ«%» لا 23502 (انتهاك not-null)', v_state;
    end if;

    -- ── (ج-٣) الهويّة المحقونة فعّالة، وإلا فما بعدها «فحصٌ لا يمكن أن يفشل» ─
    perform set_config('request.jwt.claim.sub', v_profile::text, true);
    if (select auth.uid()) is distinct from v_profile then
      raise exception '0045: الهوية المحقونة غير فعّالة — القياس الحيّ لا يقيس شيئاً';
    end if;

    -- ── (ج-٤) تفريغ دلو الخانق **قبل** أي نداء مرجع (0045 عيب ٢) ────────────
    --     والحساب هنا مُنشأٌ للتوّ فدلوه فارغٌ بنيوياً — والتفريغ مكتوبٌ رغم ذلك
    --     لأنه يجعل «البدء من صفر» خاصيةَ **الفحص** لا خاصيةَ الفيكسترة: من
    --     يستبدل غداً هذه الفيكسترة بحسابٍ من القاعدة (كما فعلت 0044) لا يعيد
    --     الفشل الكاذب معه.
    delete from public.booking_lookup_attempts
     where client_key = 'acct:' || v_profile::text;

    -- ودورُ المنادي الحقيقي لا دور المالك: هكذا يُقاس المنح والتفويض معاً
    execute 'set local role authenticated';

    -- ── (ج-٥) 🔒 درجة الإثبات: **بنداء الدالتين حيّتين**، بأربع تواليات ──────
    --     ج = حيازة فقط · د = إثبات فقط · أ = حيازة ثم إثبات (ترقية) ·
    --     ب = إثبات ثم حيازة (لا تنزيل).
    select l.reference into v_got from public.link_booking_by_token(v_tok_c) l;
    if v_got is distinct from 'TR-HC0045' then
      raise exception '0045: الربط بالتوكن (ج) أعاد «%»', coalesce(v_got, '(صفر صفوف)');
    end if;

    select l.reference into v_got
      from public.link_booking_by_reference('TR-HD0045', v_phone, 'probe') l;
    if v_got is distinct from 'TR-HD0045' then
      raise exception '0045: الربط بالمرجع (د) أعاد «%»', coalesce(v_got, '(صفر صفوف)');
    end if;

    select l.reference into v_got from public.link_booking_by_token(v_tok_a) l;
    if v_got is distinct from 'TR-HA0045' then
      raise exception '0045: الربط بالتوكن (أ) أعاد «%»', coalesce(v_got, '(صفر صفوف)');
    end if;

    -- 🔒 والترقية: نداءُ المرجع فوق رابط حيازةٍ **ينجح ولا يرفع already-linked**
    v_got := null;
    begin
      select l.reference into v_got
        from public.link_booking_by_reference('TR-HA0045', v_phone, 'probe') l;
    exception when others then
      get stacked diagnostics v_hint = pg_exception_hint;
      raise exception '0045: الترقية (أ) رُفضت بتلميح «%» — والرفع قبل الكتابة يُرجع الترقية معه فلا تقع أبداً',
        coalesce(v_hint, '(بلا)');
    end;
    if v_got is distinct from 'TR-HA0045' then
      raise exception '0045: الترقية (أ) أعادت «%»', coalesce(v_got, '(صفر صفوف)');
    end if;

    select l.reference into v_got
      from public.link_booking_by_reference('TR-HB0045', v_phone, 'probe') l;
    if v_got is distinct from 'TR-HB0045' then
      raise exception '0045: الربط بالمرجع (ب) أعاد «%»', coalesce(v_got, '(صفر صفوف)');
    end if;

    -- والحيازة فوق إثبات: رفضٌ بتلميحه، ولا مساس بالقيمة
    v_hint := null; v_ok := false;
    begin
      perform * from public.link_booking_by_token(v_tok_b);
    exception when others then
      v_ok := true;
      get stacked diagnostics v_hint = pg_exception_hint;
    end;
    if not v_ok or v_hint is distinct from 'already-linked' then
      raise exception '0045: الحيازة فوق إثبات لم تُرفض بـalready-linked (التلميح: %)',
        coalesce(v_hint, '(بلا)');
    end if;

    -- ── (ج-٦) حمولة `my_bookings` — حارسُ شكلٍ ثم **القياس** ────────────────
    select count(*) into v_n from public.my_bookings();
    if v_n <> 4 then
      raise exception '0045: my_bookings أعادت % صفاً لا أربعة بعد أربعة روابط', v_n;
    end if;

    select to_jsonb(m) into v_row
      from public.my_bookings() m where m.reference = 'TR-HA0045';
    if v_row is null then
      raise exception '0045: my_bookings بلا صفٍّ للحجز المربوط — الفحص كان سيمرّ فوق ميزة معطوبة';
    end if;

    select string_agg(t.k, '، ' order by t.k) into v_keys
      from (select jsonb_object_keys(v_row) k) t;

    -- ⚠ **حارسُ شكل لا قياس** (0045 عيب ٣): المفاتيح هنا مثبَّتةٌ بنوع إرجاع
    --    الدالة، فهذا التوكيد لا يفشل ما لم يتغيّر نوع الإرجاع — وحينها يمسكه
    --    فحصُ الكتالوج في `customer_tests` (ب) أولاً. يبقى لأن ثمنه صفر ويحرس
    --    تغيّر شكلٍ قادماً، ولا يُقرأ على أنه الدليل.
    select string_agg(x.c, '، ') into v_bad
      from unnest(v_forbidden) as x(c) where v_row ? x.c;
    if v_bad is not null then
      raise exception '0045: عمودٌ ممنوع في مفاتيح الحمولة: %', v_bad;
    end if;

    -- 🔒 **وهذا هو القياس**: القيمة لا الاسم. رقمُ التكلفة ورقمُ الهامش موجودان
    --    على الصفّ فعلاً (أُثبتا في ج-١)، فظهور أيٍّ منهما في الحمولة **تحت أي
    --    مفتاح** تسريبٌ حقيقي — وهو ما يقع حين يُحشى رقمٌ داخلي في خانةٍ بريئة
    --    الاسم، وهو ما لا يمسكه فحصُ المفاتيح بحال.
    if (v_row ->> 'total')::numeric is distinct from v_bk.total then
      raise exception '0045: total في الحمولة «%» لا «%» — أهو رقمٌ آخر من الصف؟',
        v_row ->> 'total', v_bk.total;
    end if;
    if v_row::text like ('%' || v_bk.subcontractor_cost::text || '%')
       or v_row::text like ('%' || v_bk.margin_amount::text || '%') then
      raise exception '0045: رقم التكلفة أو الهامش ظهر في الحمولة تحت مفتاح آخر: %', v_row::text;
    end if;

    execute 'reset role';

    -- ── (ج-٧) 🔒 القيم المخزَّنة — تُقرأ من الصفّ لا من جسم الدالة ───────────
    select cb.link_source into v_src_a from public.customer_bookings cb
     where cb.profile_id = v_profile and cb.booking_id = v_id_a;
    select cb.link_source into v_src_b from public.customer_bookings cb
     where cb.profile_id = v_profile and cb.booking_id = v_id_b;
    select cb.link_source into v_src_c from public.customer_bookings cb
     where cb.profile_id = v_profile and cb.booking_id = v_id_c;
    select cb.link_source into v_src_d from public.customer_bookings cb
     where cb.profile_id = v_profile and cb.booking_id = v_id_d;

    -- مِجسُّ المِجسّ: أربعة روابط وقعت للتوّ، فأربع قيمٍ يجب أن تُقرأ
    if v_src_a is null or v_src_b is null or v_src_c is null or v_src_d is null then
      raise exception '0045: قراءةُ link_source أعطت فراغاً (أ=% ب=% ج=% د=%) — الروابط لم تقع أو الكاشف يقرأ الصفّ الخطأ',
        coalesce(v_src_a, '∅'), coalesce(v_src_b, '∅'),
        coalesce(v_src_c, '∅'), coalesce(v_src_d, '∅');
    end if;

    if v_src_c <> 'token' then
      raise exception '0045: الربط بالتوكن خزّن «%» لا token — الحيازة تُسجَّل إثباتاً', v_src_c;
    end if;
    if v_src_d <> 'reference' then
      raise exception '0045: الربط بالمرجع خزّن «%» لا reference — الإثبات يضيع', v_src_d;
    end if;
    if v_src_a <> 'reference' then
      raise exception '0045: الترقية (حيازة ثم إثبات) بقيت «%» — الإثبات المُقدَّم لا يُسجَّل', v_src_a;
    end if;
    if v_src_b <> 'reference' then
      raise exception '0045: 🔴 التنزيل وقع (إثبات ثم حيازة صار «%») — رابطٌ مُثبَت فقد إثباته', v_src_b;
    end if;

    -- ── (ج-٨) وسم التدقيق: «من ربط» لا تكرار «أيّ حجز» (0045 عيب ٤) ─────────
    select a.entity_label into v_label
      from public.audit_log a
     where a.entity = 'customer_bookings' and a.action = 'insert'
       and a.booking_id = v_id_c
     order by a.id desc limit 1;

    -- مِجسُّ المِجسّ: ربطٌ وقع للتوّ، فصفُّ تدقيقٍ يجب أن يوجد
    if not found or v_label is null then
      raise exception '0045: لا وسمَ في صفّ تدقيق ربطٍ وقع للتوّ — إما لا مُشغّل أو الوسيط مُسقَط';
    end if;
    if v_label = v_id_c::text then
      raise exception '0045: entity_label يكرّر booking_id — الوسم بلا فائدة للدعم';
    end if;
    if v_label is distinct from v_profile::text then
      raise exception '0045: entity_label «%» ليس معرّف الحساب «%»', v_label, v_profile;
    end if;

    -- ── (ج-٩) 🔒 الخانق: صفرٌ **معلوم** ثم ثماني محاولات لا ترمي (D-48) ──────
    --     التفريغ ثانيةً لأن نداءات ج-٥ استهلكت ثلاثاً من الثمانية: قياسُ الحدّ
    --     يبدأ من دلوٍ فرّغناه الآن، لا من دلوٍ نظنّه فارغاً.
    delete from public.booking_lookup_attempts
     where client_key = 'acct:' || v_profile::text;
    get diagnostics v_cleared = row_count;

    execute 'set local role authenticated';

    for v_i in 1..8 loop
      begin
        select count(*) into v_n from public.link_booking_by_reference(
          'TR-ZZZZZZ', '01000000000', 'probe');
      exception when others then
        get stacked diagnostics v_hint = pg_exception_hint;
        -- 🔒 والتفريق (0045 عيب ٢): محاولةٌ أولى مخنوقة **بعد** تفريغ الدلو
        --    ليست مخالفةَ D-48 — هي حالةُ خانقٍ سابقة أو كتابةٌ متزامنة على
        --    المفتاح نفسه. واتهامُ الغلاف بها يرسل القارئ إلى المكان الخطأ.
        if v_i = 1 and v_hint = 'rate-limited' then
          raise exception '0045: المحاولة الأولى مخنوقة رغم تفريغ دلو الحساب (حُذف % صفاً) — حالةُ خانقٍ سابقة أو متزامنة على المفتاح «acct:%»، **لا** مخالفةَ D-48 في الغلاف',
            v_cleared, v_profile;
        end if;
        raise exception '0045: المحاولة % رمت (تلميح: %) — ومسار «لا نتيجة» يجب أن يرجع صفر صفوف بلا استثناء وإلا رجعت المعاملة ومعها صفُّ العدّاد فسقط الخانق (D-48)',
          v_i, coalesce(v_hint, '(بلا)');
      end;
      if v_n <> 0 then
        raise exception '0045: مرجعٌ لا وجود له أعاد صفاً — الفحص يلمس حجزاً حقيقياً';
      end if;
    end loop;

    v_hint := null; v_ok := false;
    begin
      perform * from public.link_booking_by_reference('TR-ZZZZZZ', '01000000000', 'probe');
    exception when others then
      v_ok := true;
      get stacked diagnostics v_hint = pg_exception_hint;
    end;
    if not v_ok then
      raise exception '0045: المحاولة التاسعة لم تُخنَق — الربط لا يفوّض إلى find_booking_by_reference';
    end if;
    if v_hint is distinct from 'rate-limited' then
      raise exception '0045: الخانق رفع تلميح «%» لا rate-limited', coalesce(v_hint, '(بلا)');
    end if;

    execute 'reset role';

    -- كل ما سبق داخل معاملة فرعية تُرجَع: المستخدم والحجوزات والروابط والعدّادات
    -- وصفوف التدقيق تختفي معاً، فلا يترك القياسُ أثراً في قاعدةٍ حيّة.
    raise exception '0045_PROBE_ROLLBACK';
  exception
    when others then
      execute 'reset role';
      perform set_config('request.jwt.claim.sub', '', true);
      if sqlerrm <> '0045_PROBE_ROLLBACK' then raise; end if;
  end;

  raise notice '  ↳ 0045: مفاتيح my_bookings المقيسة بالنداء: %', v_keys;
  raise notice '✔ 0045: link_source مقيسٌ بنداء الدالتين حيّتين (حيازة⇒token · إثبات⇒reference · ترقية تقع · تنزيل مستحيل)، والقيد يرفض الثالثة والفراغ بحالتيهما، ووسم التدقيق معرّفُ الحساب لا تكرار الحجز، والخانق يبدأ من صفرٍ مُفرَّغ ويفرّق بين حالته وبين D-48، والقيمة — لا الاسم — هي ما قيس في الحمولة';
end;
$$;
