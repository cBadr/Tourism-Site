-- ============================================================================
-- 0088_quote_request_conversion.sql — طلبٌ مسعَّرٌ يصير حجزاً حقيقياً (ب‑٣)
--
-- ما كان قائماً قبل هذه الهجرة (قِيس، لم يُفترض):
--   0084 جعلت الطلب مُهيكلاً وآلته مُشغّلاً على الجدول، و«محوَّل» فيها **وسمٌ
--   وحده**: `set_quote_request_status(id,'converted')` تُبدّل نصّاً في عمود ولا
--   يوجد حجزٌ في أي مكان. فالمالك يسعّر ثم يُعيد إدخال الرحلة يدويّاً في
--   `/book` — أو لا يُدخلها فيبقى مالٌ متّفقٌ عليه بلا صفٍّ يحمله.
--
-- ══════════════════════════════════════════════════════════════════════════
--  🔴 المسألة التي تصنع هذه المرحلة أو تكسرها: السعر هنا **يدويّ**
-- ══════════════════════════════════════════════════════════════════════════
--
-- كل حجزٍ في هذا المشروع يُسعَّر بـ`quote_price` داخل `create_booking`، وأي سعرٍ
-- يأتي من الخارج **يُهمَل** (D-09). وهذه المرحلة تفعل العكس بقصد: الرحلات التي
-- لم تستطع الحاسبة تسعيرها (جولة · وفد · إيجار يوميّ) يسعّرها المالك بيده.
--
-- والثمن أن السعر اليدوي **يتخطّى كل حارسٍ يفرضه المحرّك**، وأخطرها أرضية
-- الهامش (D-16). فبيعٌ بخسارة يدخل من بابٍ بنيناه نحن.
--
-- 🔒 **فالأرضية تُفرض هنا كذلك، وبتعريفها الوحيد لا بنسخةٍ ثانية**:
--    `discount_floor_room(total, class, cost)` — وهي الدالة التي تحرس بها
--    `apply_discount` كل كوبون، وتجمع ثلاثة مصادر في رقمٍ واحد:
--      · `discount_settings.min_margin_amount_after_discount`
--      · `discount_settings.min_margin_percent_after_discount` × التكلفة
--      · `dispatch_settings.min_margin_amount`
--    وترفع فوقها `tariffs.min_price` لفئة السيارة. فالسعر اليدوي يُقاس بنفس
--    المسطرة التي يُقاس بها الخصم — ومن غيّر الأرضية غيّرها للمسارين معاً.
--    (⚠ ولا تُقرأ `discount_config().enabled` هنا ولا هناك: إطفاء الكوبونات
--     ليس إطفاءً للأرضية، وقراءتها كانت ستجعل الحاجز يسقط بمفتاحٍ لا علاقة له به.)
--
-- 🔴 **وأساس التكلفة مطلوبٌ إلزاماً — وهذا أهم قرارٍ في الملف.** لو تُرك فارغاً
--    لاشتقّت `discount_implied_cost` تكلفةً **من السعر نفسه** (‏`total ÷ (1+نسبة)`)،
--    فيصير الحاجز يقيس الرقم بنفسه ولا يستطيع أن يكشف خسارةً أبداً: أرضيةٌ
--    تُطمئن ولا تحرس (النمط ٩ في LESSONS.md). من لا يعرف تكلفته لا يعرف أنه خسر،
--    والقاعدة لا تخترع له رقماً.
--
-- ══════════════════════════════════════════════════════════════════════════
--  القرارات الأربعة التي طلب البريف حسمها — مكتوبةً بمبرراتها
-- ══════════════════════════════════════════════════════════════════════════
--
-- (١) **لقطة سعرٍ مجمَّدة؟ نعم، كأي حجزٍ آخر (D-10).** `total` و`amount_due`
--     و`class_title` و`subcontractor_cost` و`margin_amount` و`trip` كلها تُكتب
--     مرةً واحدة ولا يمسّها تعديلٌ لاحق للتعريفات ولا للأرضية. ومُشغّل
--     `bookings_freeze_payment_fees` يجمّد جدول رسوم الدفع كذلك — بلا سطرٍ
--     إضافي، لأن الحجز يُدرَج في الجدول نفسه فيمرّ بمُشغّلاته كلها.
--
-- (٢) **يُبَثّ كأي حجزٍ بعد الدفع؟ نعم، بشرطٍ يُقال صراحةً.** البثّ يبدأ من
--     `confirmed` وحدها (‏`start_dispatch`)، فالحجز المحوَّل يسلك المسار نفسه.
--     والفئة يختارها المالك من `vehicle_classes` **بشرطي الأهلية نفسهما**
--     (سعة الركاب وسعة الحقائب — D-12، قاعدةٌ واحدة لا مرآتان). وأساس التكلفة
--     هو الرقم الذي أدخله المالك، ويصل `dispatch_ceiling` **بلا تعديل حرف
--     فيها**: شرطها `subcontractor_cost is not null and price_source =
--     'subcontractor'`، ونحن نكتب الاثنين. ولو كُتب `'tariff'` لاشتقّت الدالة
--     تكلفةً ضمنية من سياسة الهامش — وهي على سعرٍ يدويٍّ **تفوق التكلفة الحقيقية
--     كثيراً**، فيفوز متعهدٌ أغلى ويتبخّر الهامش. وهو بعينه صنف العيب الذي
--     وثّقته D-58، فلم نلمس الدالة بل أطعمناها ما تنتظره.
--     ⚠ **وبلا إحداثيات وجهة لا يوجد بثٌّ آليّ**: `dispatch_pool` تُرجع فراغاً
--     فيمضي الطلب إلى الطابور اليدوي. وهذا **صحيحٌ لا نقص** — التغطية تُحسب على
--     مسارٍ بين نقطتين، ومن لا مسار له لا يُقارن بقوائم الأسعار.
--
-- (٣) **إن لم يدفع العميل؟ الطلب يبقى «محوَّلاً»، والحجز يُكنس كأي حجز.** الصف
--     المحوَّل نهائيٌّ في آلة 0084 بلا رجعة، وإرجاعه يجعل صفّين يدّعيان الرحلة
--     نفسها. والحجز يُدرَج `pending_payment` فيقع تحت `cancel_stale_bookings`
--     بشرطها القائم (‏`booking_hold_until` من 0052) **بلا استثناءٍ ولا فرعٍ جديد**
--     — فالكنس والتحويل متفقان لأن أحدهما لا يعرف الآخر أصلاً.
--
-- (٤) **رابط الدفع ليس سطح مصادقةٍ جديداً.** هو `public_token` الحجز نفسه —
--     `/booking/<token>` — ويقرؤه `get_booking_by_token` التي **تُقنِّع الهاتف
--     والواتساب** منذ 0049 لأن الروابط تُعاد إرسالها. لا توكن ثانٍ ولا رمز.
--
-- ══════════════════════════════════════════════════════════════════════════
--  🔒 وما يجعل الأرضية غير قابلة للالتفاف — أربع طبقات لا واحدة
-- ══════════════════════════════════════════════════════════════════════════
--
--   ١. `bookings` **لا تُكتب مباشرةً** من anon ولا authenticated (مقيسٌ حياً:
--      `has_table_privilege` = false للاثنين، ولا سياسة insert).
--   ٢. المسارُ الآخر الوحيد `create_booking` **ممنوحٌ لـ`service_role` وحده**،
--      وهو يعيد الحساب بـ`quote_price` فلا يقبل سعراً يدويّاً أصلاً.
--   ٣. `convert_quote_request` تفرض الأرضية داخلها قبل الإدراج.
--   ٤. و«محوَّل» صارت **مقترنةً بحجزٍ قائم** بقيدٍ على الجدول
--      (‏`quote_requests_converted_needs_booking_chk`)، و`set_quote_request_status`
--      تردّ `converted` برمزٍ يسمّي الطريق الصحيح. فلا وسمَ تحويلٍ بلا حجز.
--
-- ما أُجِّل بسببٍ مكتوب (D-39):
--   • **العربون على الطلب المحوَّل** — يُنشأ `plan = 'full'` دائماً. معادلة
--     العربون مكتوبةٌ اليوم **داخل جسم `create_booking`** ولا دالة لها؛ ونسخها
--     هنا يفتح تعريفين للنسبة نفسها ينحرفان عند أول تعديل (القاعدة ١٢).
--     ورحلةٌ تفاوض عليها المالك هاتفياً تُطلب كاملةً — والعكس **قرار منتج** لبدر.
--
-- آمن لإعادة التنفيذ: add column if not exists · drop constraint if exists ثم
-- add · create or replace · create index if not exists.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (١) الرابط بين الطلب والحجز — عمودٌ وقيدٌ لا اتفاقٌ في الواجهة
--
-- `on delete restrict` بقصد: حجزٌ نشأ من طلبٍ لا يُمحى وتُترك إشارةٌ معلّقة إلى
-- العدم. والحذف ممنوعٌ أصلاً في هذا المشروع (D-39)، فالقيد يوثّق النية لا يضيّق.
--
-- والفهرس **فريدٌ**: حجزٌ واحد لا يخدم طلبين. وهذا هو حارس «التحويل مرتين»
-- بنيويّاً، فوق حارس الحالة في الدالة.
-- ----------------------------------------------------------------------------
alter table public.quote_requests
  add column if not exists booking_id   uuid,
  add column if not exists converted_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.quote_requests'::regclass
       and conname  = 'quote_requests_booking_id_fkey'
  ) then
    alter table public.quote_requests
      add constraint quote_requests_booking_id_fkey
      foreign key (booking_id) references public.bookings(id) on delete restrict;
  end if;
end;
$$;

create unique index if not exists quote_requests_booking_uniq
  on public.quote_requests (booking_id)
  where booking_id is not null;

comment on column public.quote_requests.booking_id is
  'الحجز الذي نشأ من هذا الطلب (ب‑٣). مقترنٌ بحالة converted بقيدٍ في الطرفين — فلا وسم تحويلٍ بلا حجز ولا حجزٌ بلا وسم';

-- 🔴 القيد في الطرفين (biconditional): «محوَّل» تستلزم حجزاً، والحجز يستلزم
--    «محوَّل». الأول يقتل وسمَ التحويل الكاذب، والثاني يمنع صفّاً يحمل حجزاً
--    وحالته «مرفوض» — وهو ما كان سيجعل الحجز غير مرئيّ في أي شاشة تُرشّح بالحالة.
--    و«محوَّل» نهائيةٌ في آلة 0084 فلا مسار يخرج منها ويُبطل الاقتران.
alter table public.quote_requests
  drop constraint if exists quote_requests_converted_needs_booking_chk;
alter table public.quote_requests
  add constraint quote_requests_converted_needs_booking_chk
  check ((status = 'converted') = (booking_id is not null)) not valid;

do $$
begin
  begin
    alter table public.quote_requests
      validate constraint quote_requests_converted_needs_booking_chk;
  exception
    when others then
      raise notice 'صفوف قائمة تخالف اقتران «محوَّل ↔ حجز» — يسري على الجديد فقط (%)', sqlerrm;
  end;
end;
$$;

-- ----------------------------------------------------------------------------
-- (٢) `set_quote_request_status` تردّ `converted` وتسمّي الطريق الصحيح
--
-- ⚠ الجسم منقولٌ من **الكتالوج الحيّ** لا من 0084 (D-58)، والفرق **كتلةُ رفضٍ
--   واحدة** تُدسّ بعد فحص المفردات. ولو تغيّر شكل الفحص لاحقاً تنهار الهجرة
--   برسالةٍ صريحة بدل أن تستبدل عمياءً — نفس نمط 0049 حرفاً بحرف.
--
-- 🔴 **ومرساة الدسّ هي `end if;` لا سطر `raise`** — وهذا ليس تفصيلاً أسلوبياً:
--    أول محاولةٍ هنا رست على `using hint = 'invalid-status';` وحده، فوقعت الكتلة
--    **داخل** `if p_status not in (...)`. والشرط الحاوي لا يصدُق على `converted`
--    أبداً (فهي إحدى المفردات الأربع) ⇒ الحارس **كودٌ ميت**، والدالة تُترجَم،
--    والفحص «هل النصّ موجود؟» يمرّ. أي «حارسٌ يطمئن ولا يحرس» (النمط ٩ في
--    LESSONS.md) — أُمسك بالتحقق الحيّ بعد التطبيق لا بالقراءة.
--    ولذلك صار في هذا القسم **فحصٌ سلوكيّ** أسفله: يُنادي الدالة ويطلب الرمز.
--
-- ولماذا رمزٌ مستقل لا اعتمادٌ على القيد: القيد يرفع `check_violation` بنصٍّ
-- لا يفهمه الموظف، والشاشة تترجم الرموز لا نصوص Postgres. والحاجزان يبقيان
-- معاً — الرمز للناس، والقيد لمن ينادي PostgREST مباشرةً.
--
-- والكتلة محدودةٌ بعلامتين (`@0088-convert-guard`) فالهجرة **تنزع القديم قبل
-- الدسّ** — فإعادة تنفيذها تُصلح جسماً دُسّ فيه خطأً بدل أن تتخطّاه بإشعار.
-- ----------------------------------------------------------------------------
do $$
declare
  v_def   text;
  v_start integer;
  v_stop  integer;
  -- 🔒 المرساة سطران: نهاية `raise` **و**‏`end if;` الذي يغلق فحص المفردات.
  --    بهما تقع الكتلة **بعد** الشرط لا داخله.
  v_anchor constant text := $anchor$using hint = 'invalid-status';
  end if;$anchor$;
  -- ⚠ مُقتبسٌ بعلامة الدولار لا بعلامةٍ مفردة: `'\n'` في نصٍّ عاديّ هو
  --   **شرطةٌ مائلة وحرف n** لا سطرٌ جديد (‏standard_conforming_strings)، فكانت
  --   كتلة الرفض ستصير سطراً واحداً داخل تعليق `--` فيُبتلع الشرط نفسه.
  v_add constant text := $add$

  -- @0088-convert-guard — 🔒 «محوَّل» لم تبقَ وسماً: لها دالتها التي تُنشئ الحجز
  --   وتفرض أرضية الهامش على السعر اليدوي. وبلوغُها من هنا كان يعني طلباً
  --   «محوَّلاً» بلا حجزٍ في أي مكان — ورقماً كاذباً في معدل التحويل.
  if p_status = 'converted' then
    raise exception 'التحويل إلى حجز يمرّ بـconvert_quote_request وحدها'
      using hint = 'use-convert';
  end if;
  -- @0088-convert-guard-end$add$;
begin
  v_def := pg_get_functiondef(
    to_regprocedure('public.set_quote_request_status(uuid,text,numeric,text)')::oid);

  if coalesce(v_def, '') = '' then
    raise exception '0088: لم أجد الدالة الحيّة — نفّذ 0084 أولاً، ولا تُبنَ على فراغ';
  end if;

  -- (٢-أ) نزع أي كتلةٍ دُسَّت سابقاً — بعلامتيها، فيعود الجسم إلى أصله
  v_start := position('  -- @0088-convert-guard —' in v_def);
  if v_start > 0 then
    v_stop := position('  -- @0088-convert-guard-end' in v_def);
    if v_stop = 0 or v_stop < v_start then
      raise exception '0088: علامة نهاية الكتلة مفقودة — لا يُنزَع نصٌّ بحدٍّ واحد';
    end if;
    v_def := left(v_def, v_start - 1)
          || substr(v_def, v_stop + length('  -- @0088-convert-guard-end') + 1);
  end if;

  if position('use-convert' in v_def) > 0 then
    raise exception '0088: بقيت آثار «use-convert» بعد النزع — الجسم ليس أصلياً، أعد الكتابة يدوياً';
  end if;

  -- (٢-ب) ومرةً **واحدة** بالضبط: غيابُها يعني أن الشكل تغيّر، وتكرارُها يعني
  --        أن `replace` ستدسّ كتلتَي رفضٍ في موضعين. والعدّ صريحٌ لا مُستنتَج.
  if (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor) <> 1 then
    raise exception
      '0088: مرساة فحص المفردات في set_quote_request_status ظهرت % مرة (المتوقع ١) — اقرأ الجسم الحيّ وأعد الدسّ يدوياً',
      (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor);
  end if;

  execute replace(v_def, v_anchor, v_anchor || v_add);
end;
$$;

-- 🔴 فحصٌ **سلوكيّ** لا نصّي: يُنادي الدالة بهوية مشرفٍ قائم ويطلب رمز الرفض.
--    وهو الفحص الذي كان سيمسك الكتلة الميتة من أول تشغيل — والنصّي لم يمسكها.
--    ⚠ ولا يُخفَّف إلى «تخطٍّ» عند غياب مشرف: التخطّي يُنتج هجرةً خضراء لا تفحص
--    شيئاً، فيبقى الإشعار صريحاً ويتولّى الملفُّ الاختباريّ الحكم بمشرفٍ مصطنع.
do $$
declare
  v_admin uuid;
  v_hint  text;
  v_ok    boolean := false;
begin
  select p.id into v_admin from public.profiles p where p.role = 'admin' limit 1;

  if v_admin is null then
    raise notice
      '⚠ 0088: لا مشرف في profiles — الفحص السلوكي لرمز use-convert مؤجَّل إلى supabase/tests/quote_conversion_tests.sql';
    return;
  end if;

  perform set_config('request.jwt.claim.sub', v_admin::text, true);

  begin
    -- معرّفٌ لا وجود له: الحارس يقع **قبل** قراءة الصف، فالرمز يخرج بلا بيانات
    perform 1 from public.set_quote_request_status(
      '00000000-0000-4000-8000-000000000000'::uuid, 'converted', null, null);
  exception
    when others then
      v_ok := true;
      get stacked diagnostics v_hint = pg_exception_hint;
  end;

  perform set_config('request.jwt.claim.sub', '', true);

  if not v_ok or v_hint is distinct from 'use-convert' then
    raise exception
      '0088: 🔴 set_quote_request_status ما زالت تقبل «converted» (رُفض=% رمز=%) — الحارس كودٌ ميت',
      v_ok, coalesce(v_hint, 'بلا');
  end if;

  raise notice '✔ 0088: الحارس حيٌّ سلوكياً — «converted» تُردّ بـuse-convert';
end;
$$;

-- ----------------------------------------------------------------------------
-- (٣) 🔴 التحويل — نداءٌ واحد يفرض الأرضية ويُنشئ الحجز ويربط الصفّين (D-48)
--
-- لماذا نداءٌ واحد: ثلاث كتاباتٍ متعاقبة من الواجهة (حجز · رابط · حالة) تعني
-- لحظاتٍ وسطى يرفضها القيد بحق — حجزٌ بلا طلبٍ يشير إليه، أو طلبٌ محوَّلٌ بلا
-- حجز. نداءٌ واحد = معاملةٌ واحدة = الحالتان معاً أو لا شيء.
--
-- 🔒 و`is_admin()` صراحةً في الجسم: الدالة `security definer` وممنوحةٌ لـ
--    `authenticated`، و`authenticated` يشمل **كل متعهّد من الباطن** فلا يعني
--    مشرفاً أبداً (D-20).
-- ----------------------------------------------------------------------------
create or replace function public.convert_quote_request(
  p_id               uuid,
  p_class_slug       text,
  p_partner_cost     numeric,
  p_dest_label       text    default null,
  p_subcontractor_id uuid    default null,
  p_note             text    default null
)
returns table (
  quote_reference   text,
  booking_id        uuid,
  booking_reference text,
  public_token      text,
  total             numeric,
  amount_due        numeric,
  margin_amount     numeric
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_q        record;
  v_class    record;
  v_cost     numeric;
  v_floor    record;
  v_margin   numeric;
  v_dest     text;
  v_straight numeric;
  v_distance numeric;
  v_currency text;
  v_trip     jsonb;
  v_note     text;
  v_id       uuid;
  v_ref      text;
  v_token    text;
  v_attempt  integer;
begin
  if not public.is_admin() then
    raise exception 'تحويل طلب عرض السعر إلى حجز للمشرف وحده' using hint = 'forbidden';
  end if;

  if p_id is null then
    raise exception 'معرّف الطلب مطلوب' using hint = 'invalid-input';
  end if;

  -- قراءةٌ واحدة بقفل الصف: فلا يحوّله موظفان في اللحظة نفسها فينشأ حجزان
  -- لرحلةٍ واحدة. والقفل قبل كل فحصٍ لأن الفحص على صفٍّ غير مقفول رأيٌ قديم.
  select q.* into v_q from public.quote_requests q where q.id = p_id for update;
  if not found then
    raise exception 'طلب عرض السعر غير موجود' using hint = 'not-found';
  end if;

  -- (٣-١) الحالة: من «مسعَّر» وحدها. والمحاولة الثانية تجد «محوَّل» فتُرفض هنا،
  --       ويحرسها فوق ذلك الفهرس الفريد على `booking_id` وقيدُ الاقتران.
  if v_q.status <> 'quoted' then
    raise exception 'التحويل يبدأ من حالة «مسعَّر» وحدها (حالة الطلب الآن «%»)', v_q.status
      using hint = case when v_q.status = 'converted' then 'already-converted'
                        else 'not-quoted' end;
  end if;

  if v_q.booking_id is not null then
    raise exception 'هذا الطلب مرتبطٌ بحجزٍ سلفاً' using hint = 'already-converted';
  end if;

  -- (٣-٢) 🔒 السعر: قيد `quote_requests_priced_states_chk` يضمنه لحالة «مسعَّر»،
  --       والفحص هنا يجعل الرسالة مفهومةً بدل انفجارٍ عند الطرح.
  if v_q.quoted_amount is null or v_q.quoted_amount <= 0 then
    raise exception 'التحويل يحتاج تسعيرةً قائمة' using hint = 'amount-required';
  end if;

  -- (٣-٣) الرحلة: نقطة انطلاق محلولة، وموعدٌ مستقبليّ
  --
  -- ⚠ والموعد يُعاد فحصه هنا وقد فُحص عند الإنشاء: بين الطلب والتحويل أيامٌ،
  --   وحجزٌ انطلاقه في الماضي لا يُبَثّ ولا يُنفَّذ ولا يُكنس بمعنى.
  if v_q.origin_label is null or v_q.origin_lat is null or v_q.origin_lng is null then
    raise exception 'الطلب بلا نقطة انطلاق محدَّدة بإحداثياتها — لا يُحوَّل'
      using hint = 'origin-required';
  end if;

  if v_q.pickup_at is null then
    raise exception 'الطلب بلا موعد — ولا يُنشأ حجزٌ بلا موعد' using hint = 'pickup-required';
  end if;

  if v_q.pickup_at <= now() then
    raise exception 'موعد الرحلة مضى — لا يُحوَّل طلبٌ انطلاقه في الماضي'
      using hint = 'pickup-past';
  end if;

  -- ⚠ **وأدنى مهلة الانطلاق (`booking_min_pickup_at`) لا تُفرض هنا بقصد.** هي
  --   سياسةٌ على ما يُنشئه العميل بنفسه في قمعٍ لم يتكلم فيه أحد؛ وهنا المالك
  --   هو من تفاوض على الرحلة وهو من سيُسندها، وموعدُ الطلب **غير قابل للتعديل
  --   من اللوحة** — ففرضها كان سيصنع طريقاً مسدوداً مخرجُه الوحيد تغييرُ إعدادٍ
  --   عالميّ. وهي حارس تشغيلٍ لا حارس مال؛ حارس المال (الأرضية) مفروضٌ أدناه.

  -- (٣-٤) الفئة: موجودةٌ ومفعَّلة، وتتسع للركاب والحقائب
  --
  -- 🔒 شرطا الأهلية **هما نفسهما** اللذان يفرضهما CTE `eligible` في `quote_price`
  --    (D-12): سعةُ الركاب وسعةُ الحقائب. والحجز صفٌّ بفئةٍ واحدة، فطلبٌ يحتاج
  --    سيارتين لا يُحوَّل صفّاً واحداً — يُقسَّم أو يُختار له ما يتسع.
  select vc.slug, vc.title, vc.capacity, vc.luggage_capacity
    into v_class
  from public.vehicle_classes vc
  where vc.slug = nullif(btrim(coalesce(p_class_slug, '')), '')
    and vc.active;

  if not found then
    raise exception 'فئة السيارة «%» غير موجودة أو غير مفعَّلة',
      coalesce(nullif(btrim(coalesce(p_class_slug, '')), ''), 'بلا')
      using hint = 'class-unknown';
  end if;

  if v_class.capacity < greatest(coalesce(v_q.passengers, 1), 1)
     or v_class.luggage_capacity < greatest(coalesce(v_q.luggage, 0), 0) then
    raise exception
      'فئة «%» تحمل % راكباً و% حقيبة، والطلب % راكباً و% حقيبة',
      v_class.title, v_class.capacity, v_class.luggage_capacity,
      greatest(coalesce(v_q.passengers, 1), 1), greatest(coalesce(v_q.luggage, 0), 0)
      using hint = 'class-too-small';
  end if;

  -- (٣-٥) 🔴 أساس التكلفة **مطلوب** — اقرأ ترويسة الملف قبل تليينه
  if p_partner_cost is null then
    raise exception
      'أساس التكلفة مطلوب: بلا رقمٍ يُطرح من السعر لا يوجد هامشٌ يُقاس بالأرضية'
      using hint = 'cost-required';
  end if;

  v_cost := round(p_partner_cost, 2);
  if v_cost < 0 then
    raise exception 'أساس التكلفة لا يكون سالباً' using hint = 'cost-negative';
  end if;

  -- (٣-٦) 🔴🔴 **أرضية الهامش (D-16)** — بتعريفها الوحيد في القاعدة
  --
  -- `discount_floor_room` تُرجع `min_total` (أدنى إجمالٍ يحفظ الأرضية، مرفوعاً
  -- إلى `tariffs.min_price` للفئة) و`room = floor(total − min_total)`.
  -- والشرط `room >= 0` لا `> 0`: السعرُ المساوي للأرضية بالضبط مقبول — الأرضية
  -- حدٌّ أدنى لا حدٌّ ممنوع. (والكوبون يطلب `> 0` لأنه يحتاج مساحةً **ليقتطع**
  -- منها، وهو فرقُ غرضٍ لا تناقضُ رقم.)
  select f.min_total, f.room into v_floor
  from public.discount_floor_room(v_q.quoted_amount, v_class.slug, v_cost) f;

  if v_floor.room < 0 then
    -- ⚠ و`detail` **رقمٌ لا جملة**: الشاشة تترجم الرموز ولا تطبع نصّ Postgres
    --   (اتفاقية «الخادم ← الواجهة رمزٌ لا جملة»)، لكن الرفض بلا الرقم يترك
    --   المالك يخمّن — فيسافر أدنى الإجمالي **بياناً** في `detail` وتبني الشاشة
    --   جملتها العربية حوله.
    raise exception
      'السعر % دون أرضية الهامش: على تكلفة % أدنى إجمالٍ مقبول %',
      v_q.quoted_amount, v_cost, v_floor.min_total
      using hint = 'below-floor', detail = 'min=' || v_floor.min_total::text;
  end if;

  v_margin := round(v_q.quoted_amount - v_cost, 2);

  -- (٣-٧) المتعهد الذي بُني عليه أساس التكلفة — اختياريّ، ومعناه «مَن سُعِّر
  --        على أساسه» لا «مَن أُسند إليه». الإسناد يبقى للبثّ وحده.
  if p_subcontractor_id is not null
     and not exists (select 1 from public.subcontractors s where s.id = p_subcontractor_id) then
    raise exception 'المتعهد غير موجود' using hint = 'partner-not-found';
  end if;

  -- (٣-٨) الوجهة — تسميةٌ مطلوبة، وإحداثياتٌ إن وُجدت
  --
  -- ⚠ ولماذا تسميةٌ بلا إحداثيات مقبولةٌ هنا وحدها في المشروع: قاعدة «لا يُسعَّر
  --   نصٌّ لم يُحلّ إلى نقطة» (D-09) تحرس **سعراً يُشتقّ من مسافة**، ولا سعر
  --   يُشتقّ هنا — السعر يدويّ. فالثمن الوحيد لغياب الإحداثيات مكتوبٌ ومقبول:
  --   `dispatch_pool` لا تجد مساراً فيمضي الطلب إلى الطابور اليدوي. والوجهةُ
  --   نصّاً ضرورية لأن صفحة الحجز تطبع «من ← إلى»، وسطرٌ نصفه فارغ عطلٌ يراه العميل.
  v_dest := coalesce(nullif(btrim(coalesce(p_dest_label, '')), ''), v_q.dest_label);
  if v_dest is null then
    raise exception 'وجهة الرحلة مطلوبة — اكتبها كما اتُّفق عليه'
      using hint = 'destination-required';
  end if;

  if v_q.dest_lat is not null and v_q.dest_lng is not null then
    v_straight := public.haversine_km(v_q.origin_lat, v_q.origin_lng,
                                      v_q.dest_lat,   v_q.dest_lng);
    -- تقديرٌ مُعلَن: هافرساين × ١٫٣ — مرآةُ `ESTIMATE_FACTOR` في `lib/geo/route.ts`
    -- (‏D-13). ولا يدخل سعراً: السعر يدويّ، والرقم لعرض الرحلة وحده.
    v_distance := round(coalesce(v_straight, 0) * 1.3, 1);
    if v_distance <= 0 then
      v_distance := null;
    end if;
  end if;

  select ps.currency into v_currency from public.pricing_settings ps limit 1;
  v_currency := coalesce(v_currency, 'EGP');

  -- (٣-٩) لقطة الرحلة — **بنفس مفاتيح `create_booking` حرفاً** (0031/0047/0067)
  --
  -- ⚠ اللقطة تخرج **كاملةً** إلى anon عبر `get_booking_by_token`، فليس فيها
  --   تكلفةٌ ولا هامشٌ ولا `admin_note` (D-19). و`notes` هي ما كتبه العميل بنفسه.
  --   والمفتاحان المضافان لا رقمَ فيهما ولا سرّ: أصلُ السعر ومرجعُ طلبِه هو.
  v_trip := jsonb_build_object(
    'originLabel',     v_q.origin_label,
    'originLat',       v_q.origin_lat,
    'originLng',       v_q.origin_lng,
    'destLabel',       v_dest,
    'destLat',         v_q.dest_lat,
    'destLng',         v_q.dest_lng,
    'distanceKm',      v_distance,
    'straightKm',      v_straight,
    'durationMin',     null,
    'distanceSource',  'estimate',
    'passengers',      greatest(coalesce(v_q.passengers, 1), 1),
    'roundTrip',       false,
    'waitingHours',    0,
    'pickupAt',        v_q.pickup_at,
    'notes',           nullif(btrim(coalesce(v_q.details, '')), ''),
    'discount',        null,
    'returnAt',        null,
    'luggage',         greatest(coalesce(v_q.luggage, 0), 0),
    'waitingDerived',  false,
    'extrasTotal',     0,
    'loyalty',         null,
    'flightNumber',    null,
    'priceOrigin',     'quote-request',
    'quoteRequestRef', v_q.reference
  );

  v_note := nullif(btrim(coalesce(p_note, '')), '');

  -- (٣-١٠) الإدراج — المرجع والتوكن يولّدهما المُشغّل، والتصادم يُعاد فيه
  --         (نفس نمط `create_booking`). و`tours.booking_note` تُضبط **داخل كل
  --         محاولة** لأن `log_booking_change` تمحوها بعد قراءتها.
  for v_attempt in 1 .. 5 loop
    begin
      perform set_config('tours.booking_note',
                         'تحويل طلب عرض السعر ' || v_q.reference, true);

      insert into public.bookings as b (
        status, class_slug, class_title, total, currency, plan,
        amount_due, amount_remaining,
        customer_name, customer_phone, customer_whatsapp, trip,
        price_source, subcontractor_id, subcontractor_cost, margin_amount
      )
      values (
        'pending_payment', v_class.slug, v_class.title, v_q.quoted_amount, v_currency, 'full',
        v_q.quoted_amount, 0,
        v_q.customer_name, v_q.customer_phone, v_q.customer_phone, v_trip,
        -- 🔒 `'subcontractor'` لأن هناك أساس تكلفةٍ حقيقيّاً: هو المفتاح الذي
        --    يجعل `dispatch_ceiling` تقرأ التكلفة المُدخلة بدل أن تشتقّها من
        --    سياسة الهامش — والاشتقاق على سعرٍ يدويّ يرفع السقف فوق تكلفتنا.
        'subcontractor', p_subcontractor_id, v_cost, v_margin
      )
      returning b.id, b.reference, b.public_token
      into v_id, v_ref, v_token;
      exit;
    exception
      when unique_violation then
        if v_attempt >= 5 then
          raise exception 'تعذّر توليد رقم مرجعي فريد للحجز' using hint = 'db-unavailable';
        end if;
    end;
  end loop;

  -- (٣-١١) نقلة الطلب — يمرّ بمُشغّل 0084 فيفحص «مسعَّر ← محوَّل» ويختم الطابع
  update public.quote_requests q
     set status       = 'converted',
         booking_id   = v_id,
         converted_at = now(),
         admin_note   = coalesce(v_note, q.admin_note)
   where q.id = p_id;

  quote_reference   := v_q.reference;
  booking_id        := v_id;
  booking_reference := v_ref;
  public_token      := v_token;
  total             := v_q.quoted_amount;
  amount_due        := v_q.quoted_amount;
  margin_amount     := v_margin;
  return next;
end;
$$;

comment on function public.convert_quote_request(uuid, text, numeric, text, uuid, text) is
  'ب‑٣: طلبٌ مسعَّرٌ ← حجزٌ حقيقي في معاملةٍ واحدة. 🔒 تفرض أرضية الهامش (D-16) على السعر اليدوي عبر discount_floor_room، وأساس التكلفة مطلوبٌ وإلا اشتُقّت التكلفة من السعر فصار الحاجز بلا معنى.';

-- ⚠ وتنبيهٌ لمن يعدّل الأرضية بعد اليوم: لها **مستدعيان** لا واحد
comment on function public.discount_floor_room(numeric, text, numeric) is
  'أدنى إجمالٍ يحفظ أرضية الهامش لفئةٍ على تكلفةٍ معلومة، والمساحة المتاحة فوقه. مستدعيان: apply_discount (كل كوبون) و convert_quote_request (السعر اليدوي في ب‑٣) — فتعديلُها يمسّ المسارين معاً.';

-- ----------------------------------------------------------------------------
-- (٤) الصلاحيات — تُعاد كاملةً لأن `create or replace` لا تُعيد ضبطها، و
--     `alter default privileges` في Supabase يمنح anon و authenticated
--     صلاحية EXECUTE على كل دالة **جديدة** تلقائياً (الفخّ الموثَّق في 0007
--     و0009 و0084).
-- ----------------------------------------------------------------------------
revoke all on function public.convert_quote_request(uuid, text, numeric, text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.convert_quote_request(uuid, text, numeric, text, uuid, text)
  to authenticated;

-- ----------------------------------------------------------------------------
-- (٥) فحصٌ ذاتي — يحرس **ما كان قائماً** لا ما أضافته الهجرة (D-58)
-- ----------------------------------------------------------------------------
do $$
declare
  v_n   integer;
  v_def text;
begin
  -- (٥-١) الدالة موجودةٌ بتوقيعها، وليست ممنوحةً للزائر
  if to_regprocedure('public.convert_quote_request(uuid,text,numeric,text,uuid,text)') is null then
    raise exception '0088: دالة التحويل لم تُنشأ';
  end if;

  if has_function_privilege('anon',
       'public.convert_quote_request(uuid, text, numeric, text, uuid, text)', 'EXECUTE') then
    raise exception '0088: 🔴 الزائر يستطيع تحويل طلبٍ إلى حجز';
  end if;

  -- (٥-٢) 🔴 الأرضية **مُنادىً عليها فعلاً** في الجسم. وهذا هو الفحص الذي يمنع
  --       أن «تُبسَّط» الدالة يوماً بحذف النداء فتبقى خضراء وتبيع بخسارة.
  v_def := pg_get_functiondef(
    to_regprocedure('public.convert_quote_request(uuid,text,numeric,text,uuid,text)')::oid);

  if position('discount_floor_room' in v_def) = 0 then
    raise exception '0088: 🔴 جسم التحويل لا ينادي discount_floor_room — أرضية الهامش غير مفروضة';
  end if;
  if position('cost-required' in v_def) = 0 then
    raise exception '0088: 🔴 أساس التكلفة صار اختيارياً — الأرضية تقيس السعر بنفسه';
  end if;

  -- (٥-٣) و`dispatch_ceiling` ما زالت تشتقّ اشتقاق 0014 لمسار التعريفة. هذا
  --       الفحص لا يخصّ ما أضفناه بل ما **لم نكسره**: الهجرة تُطعم الدالة
  --       `'subcontractor'` بدل أن تلمسها، فلو لمسها أحدٌ لاحقاً وأسقط
  --       `margin_type` عاد عيب D-58 حيّاً.
  v_def := pg_get_functiondef(to_regprocedure('public.dispatch_ceiling(uuid,integer)')::oid);
  if position('margin_type' in v_def) = 0 then
    raise exception '0088: 🔴 dispatch_ceiling فقدت اشتقاق 0014 — انحدارُ D-58 عاد';
  end if;
  if position($q$coalesce(v_b.price_source, '') = 'subcontractor'$q$ in v_def) = 0 then
    raise exception
      '0088: شرط مصدر السعر في dispatch_ceiling تغيّر — الحجز المحوَّل قد يسقط إلى الاشتقاق الضمنيّ';
  end if;

  -- (٥-٤) `set_quote_request_status` تردّ `converted`
  v_def := pg_get_functiondef(
    to_regprocedure('public.set_quote_request_status(uuid,text,numeric,text)')::oid);
  if position('use-convert' in v_def) = 0 then
    raise exception '0088: 🔴 set_quote_request_status ما زالت تسم طلباً «محوَّلاً» بلا حجز';
  end if;

  -- (٥-٥) القيد والفهرس والمفتاح الأجنبي
  select count(*) into v_n from pg_constraint
   where conrelid = 'public.quote_requests'::regclass
     and conname in ('quote_requests_converted_needs_booking_chk',
                     'quote_requests_booking_id_fkey');
  if v_n <> 2 then
    raise exception '0088: قيدا الاقتران والمفتاح الأجنبي غير مكتملين (وجدنا %)', v_n;
  end if;

  select count(*) into v_n from pg_indexes
   where schemaname = 'public' and indexname = 'quote_requests_booking_uniq';
  if v_n <> 1 then
    raise exception '0088: الفهرس الفريد على booking_id غير موجود — التحويل مرتين ممكن بنيوياً';
  end if;

  raise notice '✔ 0088: الطلب المسعَّر يصير حجزاً، وأرضية الهامش تحرس السعر اليدوي، و«محوَّل» لا تقوم بلا حجز';
end;
$$;
