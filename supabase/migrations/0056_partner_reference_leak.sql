-- ============================================================================
-- 0056 — مرجع العميل يعود إلى المتعهد من بابٍ ثالث: إغلاقه عند المنبع
--
-- الهجرتان 0054 و0055 مطبَّقتان ولا تُعدَّلان (D-03): التصحيح ترحيلٌ جديد.
--
-- ── ما الذي وقع بالضبط ──────────────────────────────────────────────────────
--
-- أزالت **0028** مرجعَ العميل من يد المتعهد لسببٍ محسوم: النموذج العام
-- «تابع حجزك» يفتح بـ**مرجع + هاتف**، والمتعهد يملك الهاتف بضرورةٍ تنفيذية.
-- فالمرجع هو **المفتاح الثاني**، وباجتماعهما يمشي إلى `public_token` ثم إلى
-- `get_booking_by_token` ⇒ **سعر العميل كاملاً، أي هامشنا في كل رحلة نفّذها**.
-- فصار ما تُرجعه `portal_offers()` و`portal_trips()` رمزاً مشتقاً من معرّف
-- الحجز (`partner_trip_code`) لا مرجعَ العميل.
--
-- وكتبت 0028 في ترويستها جملةً كانت **صحيحةً يومها**:
--
--     «ولم تُمسّ `dispatch_trip_payload`: حمولتها تذهب إلى فريق التشغيل …
--      لا إلى المتعهد — وحجب المرجع عن التشغيل يعمي من يحتاجه.»
--
-- 🔴 **و0054 أبطلت شرطها ولم تُبطل حكمها.** صار `dispatch_broadcast` يُدرج
-- صفَّ إشعارٍ **موجَّهاً إلى المتعهد** (‏`recipient_kind = 'partner'`) حمولتُه
-- `dispatch_trip_payload(booking_id, true)` — وفيها `reference`. فعاد المفتاح
-- إلى يده من ثلاثة أبواب دفعةً واحدة:
--
--   ١. `portal_inbox()` تختار `payload ->> 'reference'` وتعرضه في صندوقه.
--   ٢. رسالة تليجرام/البريد تطبع سطر «رقم الطلب» من الحمولة نفسها.
--   ٣. وبطاقة دفع الويب تحمل حقل `ref` المصمَّم ليحمله.
--
-- أي أن الحقل الذي أزالته 0028 من **نوع إرجاع دالة** عاد عبر **حمولة صفّ**،
-- وهو بالضبط الدرس المكتوب في `handover/INDEX.md` (القاعدة الذهبية ٥): اسأل
-- السؤال عند كل **مدخلٍ جديد** لا عند كل شاشةٍ جديدة.
--
-- ── العلاج: عند المنبع، لا عند كل مصبّ ──────────────────────────────────────
--
-- ثلاثة مصبّاتٍ اليوم ورابعٌ غداً. فبدل ترقيع كلٍّ منها على حدة، **يُنقل مرجع
-- العميل إلى النصف الخاص من الحمولة** — حيث يعيش اسمه وهاتفه وإجماليه — ويحلّ
-- محلّه في النصف العام `tripCode`. فما لا يوجد في الحمولة العامة **لا يستطيع
-- أيُّ قناةٍ أن تطبعه**، ولا يحتاج المصبّ الرابع إلى أن يتذكّر أحدٌ شيئاً.
--
-- 🔒 **ولماذا المرجع في النصف الخاص لا محذوفٌ كلياً؟** لأن أحداث التشغيل
-- الثلاثة (`trip_assigned` · `dispatch_round_expired` · `dispatch_exhausted`)
-- تُبنى بـ`p_public => false`، والمالك يحتاج المرجع ليطابق ما يقوله العميل.
-- والقسمة الجديدة تقول الحقيقة كما هي: **مرجع العميل حقلُ عميلٍ**، تماماً
-- كاسمه وهاتفه — لا حقلُ رحلةٍ عامّ.
--
-- ── وبابٌ رابع كشفه المسح، وليس في الأبواب الثلاثة ──────────────────────────
--
-- `accept_offer()` — وهي دالةُ المتعهد نفسه — تُرجع في عمودها الثاني
-- `v_b.reference`. فمن يقبل عرضاً يتسلّم مرجع العميل في **ردّ النداء** حتى لو
-- لم تعرضه الشاشة (والشاشة اليوم لا تقرؤه: `outcomeFromData` تقرأ أعمدة
-- النتيجة وحدها). قيمةٌ تصل متصفح المتعهد قيمةٌ **سُرِّبت**، وسواءٌ عرضها أم
-- قرأها من أدوات المطوّر. فصار العمود يحمل `partner_trip_code` — نفس علاج
-- 0028 على نفس الطراز، والاسم يبقى `reference` كما بقي في `portal_offers`.
--
-- المرجع: 0028 (١) · 0054 · lib/partner-alerts-types.ts §٧ · D-19 · D-58
--         · supabase/tests/partner_alert_tests.sql القسم (ك)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (١) الحمولة: مرجع العميل ينتقل إلى نصفها الخاص، و`tripCode` يحلّ محلّه
--
-- ⚠ الجسم منقولٌ من **الكتالوج الحيّ** (`pg_get_functiondef`) لا من هجرةٍ
-- سابقة — D-58. والتغيير سطران: `reference` يخرج من الكائن الأساسي ويدخل
-- الفرع الخاص، و`tripCode` يُضاف إلى الأساسي.
-- ----------------------------------------------------------------------------
create or replace function public.dispatch_trip_payload(p_booking_id uuid, p_public boolean)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select
    jsonb_build_object(
      'bookingId',    b.id,
      -- 0056: رمز الرحلة **بديلاً عن المرجع في النصف العام**. مشتقٌّ من المعرّف
      --       فهو ثابتٌ يتحدث به المتعهد والتشغيل، وغيرُ مقبولٍ في «تابع حجزك».
      'tripCode',     public.partner_trip_code(b.id),
      'classSlug',    b.class_slug,
      'classTitle',   b.class_title,
      'currency',     b.currency,
      'originLabel',  case when p_public
                           then public.dispatch_public_label(b.trip ->> 'originLabel')
                           else b.trip ->> 'originLabel' end,
      'destLabel',    case when p_public
                           then public.dispatch_public_label(b.trip ->> 'destLabel')
                           else b.trip ->> 'destLabel' end,
      'distanceKm',   public.jsonb_number(b.trip, 'distanceKm', null),
      'passengers',   public.jsonb_number(b.trip, 'passengers', null),
      'roundTrip',    coalesce(b.trip ->> 'roundTrip', 'false') in ('true', 't', '1'),
      'waitingHours', public.jsonb_number(b.trip, 'waitingHours', null),
      'pickupAt',     b.trip ->> 'pickupAt',
      'notes',        case when p_public
                           then public.dispatch_safe_notes(b.trip ->> 'notes')
                           else b.trip ->> 'notes' end
    )
    ||
    case when p_public then '{}'::jsonb
         else jsonb_build_object(
                -- 🔒 0056: المرجع هنا لا فوق — حقلُ **عميل** كاسمه وهاتفه، لا
                --          حقلُ رحلةٍ عامّ. وهذه القسمة هي الحارس كله.
                'reference',        b.reference,
                'customerName',     b.customer_name,
                'customerPhone',    b.customer_phone,
                'customerWhatsapp', b.customer_whatsapp,
                'total',            b.total,
                'status',           b.status
              )
    end
  from public.bookings b
  where b.id = p_booking_id;
$$;

comment on function public.dispatch_trip_payload(uuid, boolean) is
  'حمولة رحلة للإشعارات. p_public => true: النصف العام وحده وفيه tripCode لا reference '
  '(0056 — المرجع مفتاحٌ ثانٍ في «تابع حجزك» بجوار الهاتف الذي يملكه المتعهد أصلاً). '
  'p_public => false: يُضاف النصف الخاص وفيه مرجع العميل واسمه وهاتفه وإجماليه.';

-- ----------------------------------------------------------------------------
-- (٢) صندوق البورتال — الرمز يُشتق حياً من `bookingId`، لا يُقرأ من الحمولة
--
-- ⚠ والاشتقاق الحيّ مقصود: صفوفٌ أُدرجت قبل هذه الهجرة وما زالت في الطابور
-- تحمل `reference` في حمولتها. فلو قرأنا المفتاح من الحمولة لبقي السرب حياً
-- في كل صفٍّ قديم. والاشتقاق يجعل الصندوق صحيحاً **مهما كانت الحمولة**.
-- ----------------------------------------------------------------------------
create or replace function public.portal_inbox(p_limit integer default 50)
returns table (
  id         uuid,
  event      text,
  reference  text,
  offer_id   uuid,
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
    -- 0056: رمز المتعهد لا مرجع العميل — نفس علاج 0028 في `portal_offers`،
    --       والاسم يبقى `reference` فلا تتغيّر قراءةُ الواجهة.
    public.partner_trip_code(nullif(n.payload ->> 'bookingId', '')::uuid),
    nullif(n.payload ->> 'offerId', '')::uuid,
    n.created_at,
    n.read_at,
    jsonb_strip_nulls(jsonb_build_object(
      'classTitle',   n.payload -> 'classTitle',
      'originLabel',  n.payload -> 'originLabel',
      'destLabel',    n.payload -> 'destLabel',
      'distanceKm',   n.payload -> 'distanceKm',
      'passengers',   n.payload -> 'passengers',
      'roundTrip',    n.payload -> 'roundTrip',
      'waitingHours', n.payload -> 'waitingHours',
      'pickupAt',     n.payload -> 'pickupAt',
      'payout',       n.payload -> 'payout',
      'currency',     n.payload -> 'currency',
      'expiresAt',    n.payload -> 'expiresAt',
      'round',        n.payload -> 'round'
    ))
  from public.notifications n
  where n.recipient_kind = 'partner'
    and n.recipient_id   = public.current_subcontractor_id()
  order by n.created_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;

comment on function public.portal_inbox(integer) is
  'صندوق المتعهد: صفوفه هو من notifications بقائمةٍ بيضاء من مفاتيح الحمولة العامة. '
  'وعمود reference رمزُ الرحلة المشتق (partner_trip_code) لا مرجع العميل — 0056. '
  'ولا سياسة SELECT على الجدول — Postgres بلا RLS على مستوى العمود، فالسياسة تفتحه كله.';

-- ----------------------------------------------------------------------------
-- (٣) الحمولات القديمة في الطابور — تُطهَّر بدل أن تُترك تنتظر دورَ التسليم
--
-- صفٌّ موجَّهٌ إلى متعهدٍ ما زال `queued` سيُسلَّم بعد دقائق على تليجرام بالمرجع
-- الذي أزلناه لتوّنا. والعدد اليوم صفر (كل صفوف `trip_offered` القائمة `ops`
-- من قبل 0054)، لكن حارساً يعمل على الصفر لا يُكتب لأجل اليوم.
-- ----------------------------------------------------------------------------
update public.notifications n
   set payload = (n.payload - 'reference')
                 || jsonb_strip_nulls(jsonb_build_object(
                      'tripCode',
                      public.partner_trip_code(nullif(n.payload ->> 'bookingId', '')::uuid)
                    ))
 where n.recipient_kind = 'partner'
   and n.payload ? 'reference';

-- ----------------------------------------------------------------------------
-- (٤) `accept_offer` — عمودها الثاني رمزُ الرحلة لا مرجع العميل
--
-- ⚠ الجسم منقولٌ حرفياً من `pg_get_functiondef` (D-58) وتغيّر فيه **سطرٌ واحد**
-- هو إسناد `reference`. ولا يُمسّ شيءٌ آخر: أقفال (١)…(٥) وترتيبها هي عقد
-- القبول الذرّي، ومراجعتها في `dispatch_tests.sql` (و-٣) تقرأ نصّ الجسم.
-- ----------------------------------------------------------------------------
create or replace function public.accept_offer(p_offer_id uuid)
returns table (
  booking_id  uuid,
  reference   text,
  payout      numeric,
  assigned_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_sub     uuid;
  v_status  text;
  v_offer   record;
  v_d       record;
  v_b       record;
  v_company text;
  v_phone   text;
  v_cfg     record;
  v_now     timestamptz := now();
begin
  v_sub := public.current_subcontractor_id();
  if v_sub is null then
    raise exception 'قبول العروض متاح لحساب متعهد فقط' using hint = 'forbidden';
  end if;

  -- 0052: 🔒 رؤيةُ رحلةٍ مُسنَدة ليست قبولَ عملٍ جديد. الموقوف يبقى يرى رحلاته
  -- ورصيده (قرار بدر) — ولا يكسب رحلةً بعرضٍ صدر قبل إيقافه. والشرط `approved`
  -- هو بعينه شرطُ `dispatch_pool` على الطرف الآخر، فمصدر الأهلية واحد.
  select s.status into v_status from public.subcontractors s where s.id = v_sub;
  if coalesce(v_status, '') <> 'approved' then
    raise exception 'حسابك ليس معتمداً الآن — لا يمكن قبول عروض جديدة (الحالة: «%»)',
      coalesce(v_status, '؟')
      using hint = 'partner-not-approved';
  end if;

  select o.* into v_offer from public.trip_offers o where o.id = p_offer_id;
  if not found then
    raise exception 'العرض غير موجود' using hint = 'offer-not-found';
  end if;

  -- عرض متعهد آخر: لا يُقرأ ولا يُقبل — والرسالة لا تكشف وجوده لصاحبها الحقيقي
  if v_offer.subcontractor_id is distinct from v_sub then
    raise exception 'هذا العرض ليس ضمن عروضك' using hint = 'forbidden';
  end if;

  -- (١) قفل دورة البث: كل قبول لهذا الحجز يمر من هنا، فيتسلسل القبولان حتماً
  select d.* into v_d from public.dispatches d
   where d.booking_id = v_offer.booking_id
   for update;

  if not found then
    raise exception 'دورة بث هذا الطلب غير موجودة' using hint = 'dispatch-not-found';
  end if;

  -- (٢) إعادة الفحص **بعد** القفل — لا قبل: هنا بالضبط يقف الخاسر
  if v_d.status = 'assigned' then
    raise exception 'سبقك متعهد آخر إلى هذا الطلب' using hint = 'already-assigned';
  end if;

  if v_d.status = 'cancelled' then
    raise exception 'أُغلقت دورة بث هذا الطلب' using hint = 'invalid-dispatch-status';
  end if;

  select o.* into v_offer from public.trip_offers o where o.id = p_offer_id for update;

  if v_offer.status <> 'pending' then
    if v_offer.status in ('revoked', 'accepted') then
      raise exception 'سبقك متعهد آخر إلى هذا الطلب' using hint = 'already-assigned';
    elsif v_offer.status = 'expired' then
      raise exception 'انتهت مهلة هذا العرض' using hint = 'offer-expired';
    else
      raise exception 'سبق أن رفضت هذا العرض' using hint = 'offer-closed';
    end if;
  end if;

  if v_offer.expires_at <= v_now then
    update public.trip_offers o
       set status = 'expired', responded_at = v_now
     where o.id = p_offer_id;
    raise exception 'انتهت مهلة هذا العرض' using hint = 'offer-expired';
  end if;

  select b.* into v_b from public.bookings b where b.id = v_offer.booking_id for update;

  if v_b.status = 'assigned' then
    raise exception 'سبقك متعهد آخر إلى هذا الطلب' using hint = 'already-assigned';
  elsif v_b.status <> 'confirmed' then
    raise exception 'حالة الحجز لا تسمح بالإسناد الآن («%»)', v_b.status
      using hint = 'invalid-status';
  end if;

  select s.company_name, s.phone into v_company, v_phone
  from public.subcontractors s where s.id = v_sub;

  -- (٣) الفوز — والفهرس الفريد الجزئي هو الحكم الأخير لو تخطّى أحدهم القفل
  begin
    update public.trip_offers o
       set status = 'accepted', responded_at = v_now
     where o.id = p_offer_id;
  exception
    when unique_violation then
      raise exception 'سبقك متعهد آخر إلى هذا الطلب' using hint = 'already-assigned';
  end;

  -- (٤) إغلاق الطلب أمام الباقين — «ومنع الآخرين من التفاعل معه»
  update public.trip_offers o
     set status = 'revoked', responded_at = v_now
   where o.booking_id = v_offer.booking_id
     and o.id        <> p_offer_id
     and o.status     = 'pending';

  update public.dispatches d
     set status                    = 'assigned',
         assigned_subcontractor_id = v_sub,
         assigned_at               = v_now,
         assigned_payout           = v_offer.payout,
         manual_assign             = false
   where d.booking_id = v_offer.booking_id;

  -- (٥) الحالة تنتقل عبر الحارس نفسه (bookings_guard_status) لا حوله:
  -- confirmed → assigned مسموح، وأي حالة أخرى يرفضها الحارس قبل أن نصل هنا.
  -- ⚠ bookings.subcontractor_id لا يُمس: هو لقطة **من سُعِّر على أساسه**،
  -- والمنفّذ يُسجَّل في dispatches.assigned_subcontractor_id.
  perform set_config(
    'tours.booking_note',
    'إسناد تلقائي بقبول المتعهد «' || coalesce(v_company, '؟') || '»',
    true
  );

  update public.bookings b set status = 'assigned' where b.id = v_offer.booking_id;

  select * into v_cfg from public.dispatch_config();

  perform public.queue_notification(
    'trip_assigned',
    public.dispatch_trip_payload(v_offer.booking_id, false) || jsonb_build_object(
      'offerId',          p_offer_id,
      'subcontractorId',  v_sub,
      'companyName',      v_company,
      'partnerPhone',     v_phone,
      'payout',           v_offer.payout,
      -- 0033: الهامش الحقيقي **بعد طرح الخدمات الإضافية** — إيرادُنا عن شيء
      --       ننفّذه نحن ولا يراه المتعهد، فعدّه هامشاً يطلي صفقةً تحت
      --       الأرضية باللون الأخضر (نفس علّة سقف الموجة في 0032).
      'realMargin',       round(coalesce(v_b.total, 0)
                                - coalesce((select sum(be.line_total)
                                              from public.booking_extras be
                                             where be.booking_id = v_b.id), 0)
                                - v_offer.payout, 2),
      'round',            v_offer.round,
      'maxRounds',        v_cfg.max_rounds,
      'manualAssign',     false,
      'assignedAt',       v_now
    )
  );

  booking_id  := v_offer.booking_id;
  -- 🔒 0056: رمز الرحلة لا مرجع العميل. المنادي **متعهد** بحكم الحارس أعلاه،
  --          فالمرجع هنا يعبر إلى متصفحه ولو لم تطبعه الشاشة.
  reference   := public.partner_trip_code(v_b.id);
  payout      := v_offer.payout;
  assigned_at := v_now;
  return next;
end;
$fn$;

comment on function public.accept_offer(uuid) is
  'قبول عرض ذرّياً (أول قابل يفوز). عمود reference رمزُ الرحلة المشتق لا مرجع العميل — 0056.';

-- ----------------------------------------------------------------------------
-- (٥) 🔬 فحص ذاتي — يحرس **ما كان قائماً** لا ما أضفناه وحده (D-58)
--
-- لكل إصلاحٍ سابق أثرٌ نصّي يميّزه، فليكن هو ما يُفحص: بقاءُ اشتقاق 0028 في
-- `portal_offers` و`portal_trips` هو الشاهد على أننا لم نصنع الانحدار نفسه
-- من جهةٍ أخرى بينما نغلق هذا الباب.
-- ----------------------------------------------------------------------------
do $$
declare
  v_def  text;
  v_bid  uuid;
  v_pub  jsonb;
  v_priv jsonb;
begin
  -- (٥-أ) اشتقاق 0028 باقٍ في الدالّتين اللتين أصلحتهما
  foreach v_def in array array['public.portal_offers()', 'public.portal_trips()'] loop
    if position('partner_trip_code' in pg_get_functiondef(v_def::regprocedure)) = 0 then
      raise exception 'فحص (٥-أ): % لم تعد تشتق partner_trip_code — انحدارٌ على إصلاح 0028', v_def;
    end if;
  end loop;

  -- (٥-ب) والبابان الجديدان أُغلقا
  if position('partner_trip_code' in pg_get_functiondef('public.portal_inbox(integer)'::regprocedure)) = 0 then
    raise exception 'فحص (٥-ب): portal_inbox لا تشتق partner_trip_code';
  end if;
  if position('partner_trip_code' in pg_get_functiondef('public.accept_offer(uuid)'::regprocedure)) = 0 then
    raise exception 'فحص (٥-ب): accept_offer لا تشتق partner_trip_code';
  end if;

  -- (٥-ج) والقفل الأصلي في `accept_offer` لم يسقط أثناء نقل الجسم
  v_def := pg_get_functiondef('public.accept_offer(uuid)'::regprocedure);
  if position('from public.dispatches d' in v_def) = 0
     or position('for update' in v_def) = 0 then
    raise exception 'فحص (٥-ج): قفل dispatches اختفى من accept_offer — نقلُ الجسم أسقط عقد الذرّية';
  end if;

  -- (٥-د) القسمة الحيّة: نداءٌ فعليّ لا قراءةُ نصّ (القاعدة ١٩ في INDEX)
  select b.id into v_bid from public.bookings b limit 1;
  if v_bid is null then
    raise notice 'فحص (٥-د): لا حجز في القاعدة — القسمة تُفحص بالنصّ وحده هنا';
    if position('''tripCode''' in
        pg_get_functiondef('public.dispatch_trip_payload(uuid, boolean)'::regprocedure)) = 0 then
      raise exception 'فحص (٥-د): tripCode غائب عن dispatch_trip_payload';
    end if;
  else
    v_pub  := public.dispatch_trip_payload(v_bid, true);
    v_priv := public.dispatch_trip_payload(v_bid, false);

    if v_pub ? 'reference' then
      raise exception 'فحص (٥-د): الحمولة العامة ما زالت تحمل reference — الأبواب الثلاثة مفتوحة';
    end if;
    if not (v_pub ? 'tripCode') then
      raise exception 'فحص (٥-د): الحمولة العامة بلا tripCode — الرسالة ستخرج بلا معرّفٍ أصلاً';
    end if;
    if not (v_priv ? 'reference') then
      raise exception 'فحص (٥-د): الحمولة التشغيلية فقدت reference — أعمينا المالك عمّا يحتاجه';
    end if;
    if (v_priv ->> 'reference') is distinct from (select b.reference from public.bookings b where b.id = v_bid) then
      raise exception 'فحص (٥-د): مرجع الحمولة التشغيلية لا يطابق مرجع الحجز';
    end if;
  end if;

  -- (٥-هـ) ولا صفَّ متعهدٍ باقٍ في الطابور بمرجعٍ في حمولته
  if exists (
    select 1 from public.notifications n
    where n.recipient_kind = 'partner' and n.payload ? 'reference'
  ) then
    raise exception 'فحص (٥-هـ): بقيت صفوف متعهدٍ تحمل reference في حمولتها بعد التطهير';
  end if;

  raise notice '✔ 0056: مرجع العميل خارج الحمولة العامة وخارج الصندوق وخارج ردّ accept_offer';
end;
$$;
