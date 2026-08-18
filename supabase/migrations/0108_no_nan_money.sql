-- ============================================================================
-- 0108_no_nan_money.sql
-- 🔴 `NaN` يعبر أرضية الهامش وكل فحصٍ من طرفٍ واحد في المشروع — والحاجز يُنقل
--    من جسم الدالة إلى **عمود المال نفسه**، فيُغلق على كل كاتبٍ قائمٍ وقادم.
--
-- ── العيب، مقيساً لا مفترضاً ────────────────────────────────────────────────
--
-- نداءٌ واحد لـ`convert_quote_request` بهوية مشرفٍ حقيقية، داخل `begin … rollback`،
-- بـ`p_partner_cost = 'NaN'` ⇒ **كتب حجزاً**:
--   `TR-X3Q4MS` · `total = 8500` · `subcontractor_cost = NaN` · `margin_amount = NaN`
--
-- والسبب كلُّه في دلالات `numeric` (‏قِيست على PostgreSQL 17.6 في 2026-08-18):
--
--   | التعبير | النتيجة | الأثر |
--   |---|---|---|
--   | `'NaN'::numeric > 0`      | **true**  | كل فحص «موجب» يمرّرها |
--   | `'NaN'::numeric >= 0`     | **true**  | كل قيد `>= 0` يصدُق عليها |
--   | `'NaN'::numeric < 0`      | false     | فحص «سالبة» لا يمسكها |
--   | `greatest('NaN', 0)`      | **NaN**   | أرضية الهامش تُرجع NaN فتُقارَن بنفسها |
--   | `round('NaN', 2)`         | NaN       | التقريب لا ينظّفها |
--   | `'NaN'::numeric = 'NaN'`  | **true**  | فـ`col <> 'NaN'` هو الفحص الصحيح لا `=` |
--   | `'NaN' < 'Infinity'`      | false     | لأن NaN تُرتَّب فوق كل قيمة بما فيها ∞ |
--
-- ⇒ الصياغة الوحيدة التي ترفض `NaN` و`±Infinity` معاً بشرطٍ واحد:
--   `v > '-Infinity'::numeric and v < 'Infinity'::numeric`
--
-- ── ولماذا `NaN` وحدها، ولماذا الحاجز عند العمود ───────────────────────────
--
-- `numeric(12,2)` **ترفض** `Infinity` و`-Infinity` و`1e1000` بـ`22003 numeric
-- field overflow` عند الكتابة، و`-0` تُطبَّع إلى `0.00`. فالقيمة الوحيدة التي
-- تعبر إلى عمود مالٍ هي `NaN` — **وأي عمود `numeric` بلا دقّةٍ محدَّدة يقبل
-- `Infinity` أيضاً** (‏قِيس: `loyalty_settings.points_per_currency` قبلت `NaN`
-- و`Infinity` و`1e1000` جميعاً).
--
-- 🔴 **والمسح قال إن الباب ليس واحداً.** بهوية مشرفٍ حيّة، داخل `begin … rollback`،
--    فُحص ٢٨٠ نداءً على ٤١ مدخلاً رقمياً بخمس قيمٍ شاذّة. والأبواب التي ابتلعت
--    `NaN` وكتبته (‏مسحان: 02:45Z و02:5xZ):
--
--   | الباب | ما وصل القرص |
--   |---|---|
--   | `convert_quote_request(p_partner_cost)` | `bookings.subcontractor_cost/margin_amount = NaN` |
--   | `set_quote_request_status(p_amount)` | `quote_requests.quoted_amount = NaN` |
--   | `create_booking(p_waiting_hours)` | **`bookings.total = NaN`** على حجزٍ كامل |
--   | `manual_assign` · `_with_loss` · `_over_limit` (‏`p_payout`) | `dispatches.assigned_payout = NaN` |
--   | `record_refund` · `record_adjustment` · `record_expense` | `ledger_entries.amount = NaN` ⇒ **الرصيد كلُّه NaN** |
--   | `record_partner_payout` · `_settlement` · `_payout_advance` · `_adjustment` | `net_due = NaN` و`balance = NaN` |
--   | `upsert_price_list(items[].cost)` | `price_list_items.cost = NaN` — **وهذا بابُ متعهّدٍ لا مشرف** |
--   | كتابةٌ مباشرة في `payments` · `dispatch_settings` · `discount_settings` · `payment_accounts` · `extra_services` · `partner_credit_settings` · `loyalty_settings` | العمود = `NaN` |
--
--   وسبعةَ عشرَ باباً رفضته سلفاً (‏`create_quote_request` بحدود الإحداثيات ·
--   `create_booking(p_distance_km)` بفحصٍ صريح · `mark_booking_failed` ·
--   `redeem_points` · `attach_receipt` · `coupons` بقيدٍ ذي حدَّين …).
--
-- **ولهذا الحاجز عند العمود لا في الدالة**: إصلاحُ الدوال واحدةً واحدة يعني
-- خمسةَ عشرَ جسماً يُعاد كتابته — وهو بعينه الطريق الذي وُلد منه انحدار D-58 —
-- ثم يبقى الباب مفتوحاً لأي دالةٍ تُكتب غداً، ولمحرِّر SQL، ولحامل مفتاح الخدمة.
-- **والقيدُ على العمود يُغلق الجميع في سطرٍ واحد لكل عمود.**
--
-- ⚠ **ولا يُستغنى بالقيد عن الحارس في الدالة**: القيد يرمي `23514` برسالةٍ
--   لا يفهمها المالك ولا تحملها الشاشة رمزاً. فالدالة تُرجع `hint` مفهوماً
--   (`cost-not-finite`)، والقيد هو الشبكة تحتها.
--
-- ── ما فُحص قبل التنفيذ ────────────────────────────────────────────────────
--
-- كل أعمدة `numeric` في `public` — **٦٣ عموداً** — مُسحت صفّاً صفّاً بحثاً عن
-- قيمةٍ غير منتهية: **صفر** (‏بما فيها الحجوزات السبعة عشر). فالقيود تُضاف
-- **مُتحقَّقاً منها فوراً** لا `not valid`، ولا صفَّ مالكٍ واحد يُمسّ.
--
-- ── ما لا تفعله هذه الهجرة ─────────────────────────────────────────────────
--   لا تلمس جسم أي دالةٍ غير `convert_quote_request` (‏الأبواب الأخرى تُغلق عند
--   العمود بلا `create or replace` — فلا تصادم مع جبهةٍ تعمل على المال أو على
--   كشوف الأسعار الآن)، ولا تُنشئ صفّاً، ولا تحذف قيداً قائماً، ولا تغيّر منحةً،
--   ولا تمسّ `locales` ولا `translations`.
--
-- المرجع: 0088 (التحويل) · 0107 (مهلة الانطلاق) · D-05 · D-16 · D-20 · D-58
--         LESSONS.md النمط ٩ (فحصٌ لا يمكن أن يفشل)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (١) شرطٌ مسبق — الهجرة تفترض أرضاً قِيست، فإن تغيّرت تتوقف بصوتٍ عالٍ
-- ----------------------------------------------------------------------------
do $$
declare
  v_bad integer := 0;
  v_rec record;
  v_n   integer;
begin
  if to_regprocedure('public.convert_quote_request(uuid,text,numeric,text,uuid,text)') is null then
    raise exception '0108: convert_quote_request الستّية غير موجودة — نفّذ 0088 ثم 0107 أولاً';
  end if;

  -- 🔬 والدلالة التي تُبنى عليها كل هذه الهجرة تُتحقَّق هنا لا تُفترض: لو غيّرت
  --    نسخةُ Postgres ترتيب `NaN` يوماً، توقّفنا هنا بدل أن نشحن حاجزاً لا يحرس.
  if not ('NaN'::numeric > 0) then
    raise exception '0108: هذه النسخة لا تُرتّب NaN فوق الأصفار — راجع الترويسة قبل المضيّ';
  end if;
  if ('NaN'::numeric < 'Infinity'::numeric) then
    raise exception '0108: NaN صارت أصغر من ∞ — شرط الحدَّين لم يعد يرفضها';
  end if;

  -- كل عمودٍ رقميّ يُمسح صفّاً صفّاً: القيد يُضاف مُتحقَّقاً، فالبيانات تُفحص أولاً
  for v_rec in
    select c.relname as tbl, a.attname as col
      from pg_attribute a
      join pg_class c on c.oid = a.attrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r'
       and a.attnum > 0 and not a.attisdropped
       and a.atttypid = 'numeric'::regtype
     order by 1, 2
  loop
    execute format(
      'select count(*) from public.%I where %I is not null and not (%I > ''-Infinity''::numeric and %I < ''Infinity''::numeric)',
      v_rec.tbl, v_rec.col, v_rec.col, v_rec.col) into v_n;
    if v_n > 0 then
      v_bad := v_bad + 1;
      raise warning '0108: public.%.% فيه % صفّاً بقيمةٍ غير منتهية', v_rec.tbl, v_rec.col, v_n;
    end if;
  end loop;

  if v_bad > 0 then
    raise exception
      '0108: % عموداً يحمل قيماً غير منتهية — نظّفها بيد المالك قبل إضافة القيد (لا تُحذف بياناته آلياً)',
      v_bad;
  end if;

  raise notice '0108 ✔ (١) الدلالات كما قِيست، وصفر قيمةٍ غير منتهية في القاعدة';
end;
$$;

-- ----------------------------------------------------------------------------
-- (٢) 🔒 الحاجز عند العمود — كل عمود `numeric` في `public`
--
-- الاسم `<جدول>_<عمود>_finite_chk` (أطولها اليوم ٦٢ محرفاً، والحدّ ٦٣ — ويُفحص).
-- والكتلة **قابلة لإعادة التنفيذ**: القيد الموجود يُترك كما هو ولا يُسقط ولا
-- يُعاد بناؤه، فتشغيلٌ ثانٍ لا يفتح نافذةً بلا حارس.
--
-- ⚠ ولماذا لا `check (col <> 'NaN'::numeric)` وهو أقصر: لأنه يرفض `NaN` وحدها
--   ويترك `±Infinity` — وهي تعبر فعلاً إلى كل عمود `numeric` بلا دقّةٍ محدَّدة
--   (‏`loyalty_settings` و`distance_cache` و`funnel_events`). وشرط الحدَّين
--   يرفض الثلاثة بصياغةٍ واحدة لا تتغيّر بتغيّر نوع العمود.
-- ----------------------------------------------------------------------------
do $$
declare
  v_rec   record;
  v_name  text;
  v_added integer := 0;
  v_kept  integer := 0;
begin
  for v_rec in
    select c.oid as reloid, c.relname as tbl, a.attname as col
      from pg_attribute a
      join pg_class c on c.oid = a.attrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r'
       and a.attnum > 0 and not a.attisdropped
       and a.atttypid = 'numeric'::regtype
     order by 1, 2
  loop
    v_name := v_rec.tbl || '_' || v_rec.col || '_finite_chk';
    if length(v_name) > 63 then
      raise exception '0108: اسم القيد «%» يتجاوز ٦٣ محرفاً — سيُبتر صامتاً', v_name;
    end if;

    if exists (select 1 from pg_constraint k
                where k.conrelid = v_rec.reloid and k.conname = v_name) then
      v_kept := v_kept + 1;
      continue;
    end if;

    execute format(
      'alter table public.%I add constraint %I check (%I is null or (%I > ''-Infinity''::numeric and %I < ''Infinity''::numeric))',
      v_rec.tbl, v_name, v_rec.col, v_rec.col, v_rec.col);
    v_added := v_added + 1;
  end loop;

  raise notice '0108 ✔ (٢) قيود «رقمٌ حقيقي»: % أُضيف · % كان قائماً', v_added, v_kept;
end;
$$;

comment on constraint bookings_subcontractor_cost_finite_chk on public.bookings is
  '0108: تكلفة المتعهد رقمٌ حقيقي. قيدُ 0031 «>= 0» يصدُق على NaN لأن NaN تُرتَّب فوق كل قيمة في numeric — فمرّ NaN إلى حجزٍ حقيقي عبر convert_quote_request، وأرضيةُ الهامش (D-16) فُتحت بلا أن تُنقض.';

comment on constraint ledger_entries_amount_finite_chk on public.ledger_entries is
  '0108: قيمة القيد رقمٌ حقيقي. قيدُ «> 0» يصدُق على NaN، وقيدٌ واحدٌ بـNaN يجعل رصيد الخزينة ومستحق المتعهد NaN إلى الأبد — والدفتر append-only فلا يُحذف (D-05).';


-- ----------------------------------------------------------------------------
-- (٣) التحويل — **نفس البصمة ونفس الجسم**، والإضافة الوحيدة حارسا «رقمٌ حقيقي»
--
-- الجسم منقولٌ من **الكتالوج الحيّ** (‏`pg_get_functiondef`) لا من ملف 0107 —
-- قِيسا فتطابقا حرفاً بحرف في 2026-08-18، وهذا هو شرط D-58 لا استثناءٌ منه.
-- ----------------------------------------------------------------------------
create or replace function public.convert_quote_request(
  p_id               uuid,
  p_class_slug       text,
  p_partner_cost     numeric,
  p_dest_label       text default null,
  p_subcontractor_id uuid default null,
  p_note             text default null
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
security definer
set search_path = ''
as $$
declare
  v_q          record;
  v_class      record;
  v_cost       numeric;
  v_floor      record;
  v_margin     numeric;
  v_dest       text;
  v_straight   numeric;
  v_distance   numeric;
  v_currency   text;
  v_trip       jsonb;
  v_note       text;
  v_id         uuid;
  v_ref        text;
  v_token      text;
  v_attempt    integer;
  v_min_pickup timestamptz;   -- 0107
  v_lead       integer;       -- 0107
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

  -- ── 0108 — 🔴 والتسعيرة **رقمٌ حقيقي**، لا `NaN` ───────────────────────────
  --
  -- الشرط أعلاه `<= 0` يصدُق على كل رقمٍ إلا `NaN`: في `numeric` تُرتَّب `NaN`
  -- **فوق** كل قيمة، فـ`NaN <= 0` كاذبة و`NaN > 0` صادقة — أي أن فحص «موجب»
  -- يمرّرها. وقيد `quote_requests_quoted_amount_finite_chk` (‏0108 §٢) يمنع
  -- وصولها إلى الصفّ أصلاً، وهذا الفحص هو الطبقة الثانية: يبقى قائماً لو أُسقط
  -- القيد (وقسم (ح) في مجموعة الاختبار يُسقطه عمداً ليبرهن أن الحارس حيّ).
  if not (v_q.quoted_amount > '-Infinity'::numeric
          and v_q.quoted_amount < 'Infinity'::numeric) then
    raise exception 'تسعيرة الطلب ليست رقماً حقيقياً (%) — لا يُبنى عليها حجز', v_q.quoted_amount
      using hint = 'amount-not-finite';
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

  -- ── 0107 — 🔒 أدنى مهلة الانطلاق، على الموعد **لحظةَ التحويل** ─────────────
  --
  -- 0088 تركت هذا الفحص عمداً لأن الطلب لم يكن يُعاد جدولته؛ وقد صار يُعاد
  -- (`reschedule_quote_request` أدناه)، فسقطت الحجّة وبقي الخطر. والحدّ يزحف مع
  -- `now()`: طلبٌ عبَر المهلة يوم إنشائه قد لا يعبرها بعد يومين من التفاوض،
  -- والحجزُ الناتج يصل البثَّ بلا وقتٍ كافٍ لإرسال سيارة.
  --
  -- ⚠ و`detail` رقمٌ لا جملة (اتفاقية «الخادم ← الواجهة رمزٌ لا جملة»): الشاشة
  --   تحتاج **أقرب موعدٍ متاح** لتملأ به حقل إعادة الجدولة، فيسافر بياناً
  --   بصيغة ISO. ولا سرّ فيه — هو بعينه ما يعرضه نموذج `/quote-request` للزائر.
  v_min_pickup := public.booking_min_pickup_at();
  if v_min_pickup is not null and v_q.pickup_at < v_min_pickup then
    select t.min_lead_minutes into v_lead from public.trip_config() t;
    raise exception
      'موعد الطلب صار أقرب من أدنى مهلة مطلوبة (% دقيقة) — أقرب موعد متاح %. اتفق مع العميل على موعدٍ جديد ثم أعد جدولة الطلب',
      v_lead, v_min_pickup
      using hint = 'lead-time',
            detail = 'min_pickup=' || to_char(v_min_pickup at time zone 'UTC',
                                              'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  end if;

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

  -- (٣-٥) 🔴 أساس التكلفة **مطلوب** — اقرأ ترويسة 0088 قبل تليينه
  if p_partner_cost is null then
    raise exception
      'أساس التكلفة مطلوب: بلا رقمٍ يُطرح من السعر لا يوجد هامشٌ يُقاس بالأرضية'
      using hint = 'cost-required';
  end if;

  -- ── 0108 — 🔴🔴 **`NaN` يمشي عبر أرضية الهامش كأنها ليست هناك** ──────────
  --
  -- قِيس على هذه الدالة بعينها في 2026-08-18: نداءٌ واحد بـ`p_partner_cost`
  -- = `'NaN'` **كتب حجزاً** (‏`total = 8500` · `subcontractor_cost = NaN` ·
  -- `margin_amount = NaN`). وسلسلةُ السبب كلُّها من دلالات `numeric`:
  --
  --   `NaN < 0`              ⇒ false  ⇒ فحص «سالبة» أدناه لا يمسكها
  --   `round(NaN, 2)`        ⇒ NaN    ⇒ التقريب لا ينظّفها
  --   `greatest(NaN, 0)`     ⇒ NaN    ⇒ أرضية الهامش تُرجع NaN
  --   `NaN >= 0`             ⇒ true   ⇒ `room >= 0` تصدُق ⇒ **الحاجز يُفتح**
  --   `bookings_total_check` و`bookings_subcontractor_cost_chk` كلاهما `>= 0`
  --                          ⇒ true   ⇒ الصفّ يُكتب
  --
  -- ⚠ و`Infinity` و`-Infinity` و`1e1000` **لا تصل هنا**: `numeric(12,2)`
  --   ترفضها بـ`22003 numeric field overflow` عند الكتابة، والأرضية تمسك
  --   `Infinity` قبلها بـ`below-floor`. **الثغرة في `NaN` وحدها** — لكنّ الشرط
  --   مكتوبٌ بحدَّين (‏`> -Infinity and < Infinity`) لا بـ`<> 'NaN'` كي يبقى
  --   صحيحاً لو تغيّر نوع العمود يوماً إلى `numeric` بلا دقّةٍ محدَّدة.
  --
  -- 🔒 وموضعه **قبل** `round` وقبل كل حساب: قيمةٌ غير حقيقية تُعدي كل ما تلمسه.
  if not (p_partner_cost > '-Infinity'::numeric
          and p_partner_cost < 'Infinity'::numeric) then
    raise exception
      'أساس التكلفة ليس رقماً حقيقياً (%) — والهامش المحسوب منه لا يُقاس بأرضية',
      p_partner_cost
      using hint = 'cost-not-finite';
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
  --
  -- ⚠ وتُقرأ **لحظةَ التحويل** لا لحظةَ التسعير: إعداداتُ الأرضية قد تكون
  --   تغيّرت بين اليومين، والحاجز يقيس بالمسطرة الحاضرة لا بالغائبة.
  select f.min_total, f.room into v_floor
  from public.discount_floor_room(v_q.quoted_amount, v_class.slug, v_cost) f;

  if v_floor.room < 0 then
    -- ⚠ و`detail` **رقمٌ لا جملة**: الشاشة تترجم الرموز ولا تطبع نصّ Postgres،
    --   لكن الرفض بلا الرقم يترك المالك يخمّن — فيسافر أدنى الإجمالي بياناً.
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
  --   يُشتقّ هنا — السعر يدويّ.
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
  'ب‑٣: طلبٌ مسعَّرٌ ← حجزٌ حقيقي في معاملةٍ واحدة. 🔒 تفرض أرضية الهامش (D-16) على السعر اليدوي عبر discount_floor_room، وأساس التكلفة مطلوب. و0107: تفرض أدنى مهلة الانطلاق (booking_min_pickup_at) لحظةَ التحويل — ومخرجُها reschedule_quote_request. و0108: ترفض التكلفة والتسعيرة غير المنتهيتين (NaN/±Infinity) قبل أي حساب، لأن NaN تعبر كل فحصٍ من طرفٍ واحد في numeric.';

-- ----------------------------------------------------------------------------
-- (٤) الصلاحيات — تبقى كما هي، **والبقاء قرارٌ لا سهو**
--
-- 🔴 سؤالٌ طُرح صراحةً: هل يستحقّ `authenticated` تنفيذَ هذه الدالة أصلاً؟
--    **نعم، ولا بديل** — والسبب بنيويّ لا تفضيليّ:
--
--    لوحة الإدارة تصل إلى PostgREST بمفتاح `anon` **مع جلسة المستخدم**
--    (‏`createServerSupabase` في `lib/supabase/server.ts` يمرّر الكوكيز)، فدورُ
--    المشرف على القاعدة هو `authenticated` نفسه. فسحبُ المنحة من `authenticated`
--    **يُطفئ شاشة التحويل كلها** ولا يترك للمشرف طريقاً.
--
--    والعزلُ (D-20) لا يقوم بالمنحة بل بـ`is_admin()` في أول سطرٍ من الجسم —
--    وهو مقيسٌ حيّاً على دور المتصفح بهوية المتعهّد: `P0001 … hint=forbidden`
--    (‏قسم (و) في `quote_conversion_tests.sql` يفحصه في كل جولة).
--
--    و`anon` لا يملك شيئاً — والفحص الذاتي أدناه يحرس ذلك في الاتجاهين:
--    يسقط لو مُنح `anon`، **ويسقط أيضاً لو سُحبت المنحة من `authenticated`**
--    فلا يُطفأ الباب بحسن نيّة.
--
-- ⚠ وتُعاد كتابتها هنا لأن `alter default privileges` في Supabase تمنح anon
--   وauthenticated صلاحية EXECUTE على كل دالة **جديدة** تلقائياً (الفخّ الموثَّق
--   في 0007 و0009 و0084 و0088) — و`create or replace` تُبقي ACL القائمة، لكنّ
--   الكتابة الصريحة تجعل الملف يقول ما يريده لا ما ورثه.
-- ----------------------------------------------------------------------------
revoke all on function public.convert_quote_request(uuid, text, numeric, text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.convert_quote_request(uuid, text, numeric, text, uuid, text)
  to authenticated;

-- ----------------------------------------------------------------------------
-- (٥) فحصٌ ذاتي — يحرس ما أُضيف **وما كان قائماً قبله** (D-58)
-- ----------------------------------------------------------------------------
do $$
declare
  v_def     text;
  v_n       integer;
  v_missing text;
  v_ok      boolean;
begin
  -- (٥-١) 🔴 بصمةٌ واحدة لا اثنتان: حِملٌ زائدٌ يترك مساراً بلا حارس
  select count(*) into v_n
    from pg_proc p
   where p.proname = 'convert_quote_request'
     and p.pronamespace = 'public'::regnamespace;
  if v_n <> 1 then
    raise exception '0108: وُجدت % بصمة لـconvert_quote_request — الحِمل الزائد يفتح مساراً بلا حارس', v_n;
  end if;

  v_def := pg_get_functiondef(
    to_regprocedure('public.convert_quote_request(uuid,text,numeric,text,uuid,text)')::oid);

  -- (٥-٢) الحارسان الجديدان في الجسم الحيّ لا في هذا الملف
  if position('cost-not-finite' in v_def) = 0 then
    raise exception '0108: 🔴 حارس «التكلفة رقمٌ حقيقي» غائبٌ عن جسم التحويل';
  end if;
  if position('amount-not-finite' in v_def) = 0 then
    raise exception '0108: 🔴 حارس «التسعيرة رقمٌ حقيقي» غائبٌ عن جسم التحويل';
  end if;

  -- (٥-٣) وما كان قائماً لم يسقط في النسخ — انحدارُ D-58 يُمسك هنا
  if position('discount_floor_room' in v_def) = 0 then
    raise exception '0108: 🔴 نداء أرضية الهامش سقط من جسم التحويل — انحدارُ D-16';
  end if;
  if position('booking_min_pickup_at' in v_def) = 0 then
    raise exception '0108: 🔴 حارس أدنى مهلة الانطلاق سقط — انحدارُ 0107';
  end if;
  if position('cost-required' in v_def) = 0 then
    raise exception '0108: 🔴 أساس التكلفة صار اختيارياً — انحدار';
  end if;
  if position('is_admin' in v_def) = 0 then
    raise exception '0108: 🔴 حارس المشرف سقط من جسم التحويل — D-20';
  end if;
  if position('for update' in v_def) = 0 then
    raise exception '0108: 🔴 قفل الصف سقط — تحويلان متزامنان ينشئان حجزين';
  end if;

  -- (٥-٤) التغطية: **كل** عمود numeric في public يحمل قيده — بلا استثناء
  select string_agg(t.tbl || '.' || t.col, ' · '), count(*)
    into v_missing, v_n
  from (
    select c.relname as tbl, a.attname as col
      from pg_attribute a
      join pg_class c on c.oid = a.attrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r'
       and a.attnum > 0 and not a.attisdropped
       and a.atttypid = 'numeric'::regtype
       and not exists (
         select 1 from pg_constraint k
          where k.conrelid = c.oid
            and k.conname = c.relname || '_' || a.attname || '_finite_chk')
  ) t;
  if coalesce(v_n, 0) > 0 then
    raise exception '0108: 🔴 % عموداً رقمياً بلا قيد «رقمٌ حقيقي»: %', v_n, v_missing;
  end if;

  -- (٥-٥) والقيد يعمل فعلاً — لا يكفي أن يكون موجوداً (النمط ٩)
  --        يُجرَّب على جدولٍ مؤقتٍ يحمل نفس الصياغة، فلا يُلمس صفُّ مالك.
  create temporary table _finite_selftest (v numeric(12,2)) on commit drop;
  execute 'alter table _finite_selftest add constraint _v_finite_chk
             check (v is null or (v > ''-Infinity''::numeric and v < ''Infinity''::numeric))';
  v_ok := false;
  begin
    insert into _finite_selftest (v) values ('NaN'::numeric);
  exception when check_violation then v_ok := true;
  end;
  if not v_ok then
    raise exception '0108: 🔴 الصياغة لا ترفض NaN — الحاجز زينة';
  end if;
  insert into _finite_selftest (v) values (0), (1234.56), (null);
  if (select count(*) from _finite_selftest) <> 3 then
    raise exception '0108: 🔴 الصياغة ترفض أرقاماً صحيحة — حاجزٌ يمنع العمل السليم';
  end if;

  -- (٥-٦) الصلاحيات في الاتجاهين: لا يُفتح للزائر، ولا يُطفأ على المشرف
  if has_function_privilege('anon',
       'public.convert_quote_request(uuid, text, numeric, text, uuid, text)', 'EXECUTE') then
    raise exception '0108: 🔴 الزائر يملك EXECUTE على مسار التحويل';
  end if;
  if not has_function_privilege('authenticated',
       'public.convert_quote_request(uuid, text, numeric, text, uuid, text)', 'EXECUTE') then
    raise exception
      '0108: 🔴 سُحبت المنحة من authenticated — وهو دور جلسة المشرف نفسه، فالشاشة تُطفأ. العزل من is_admin() لا من المنحة (D-20)';
  end if;

  raise notice '0108 ✔ (٥) الحارسان في الجسم · تغطيةٌ كاملة لأعمدة المال · الصياغة ترفض NaN وتقبل الأرقام · الصلاحيات مضبوطة';
end;
$$;
