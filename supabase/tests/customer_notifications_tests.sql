-- ============================================================================
-- customer_notifications_tests.sql — أنبوبُ إشعارات العميل (هجرة 0131)
--
-- كيف تشغّله: `pnpm db:test customer_notifications`
-- النجاح = آخر سطر «ALL PASSED». وأي فشل exception عربية فيها المتوقع والفعلي.
--
-- ══════════════════════════════════════════════════════════════════════════
--  🔬 ما يقيسه هذا الملف — **سلوكَ الكود لا محتوى القاعدة**
-- ══════════════════════════════════════════════════════════════════════════
--
-- الدرسُ المدفوع (2026-08-18): خمسةُ توكيداتٍ سقطت في يومٍ واحد لأنها كانت
-- تقيس **ما يملكه المالك** — سعةَ مركبة · صفَّ أسعارٍ يملكه شريك · توقيعَ دالةٍ
-- حرفياً · عدداً في جدول. فكلُّ توكيدٍ هنا يبني فيكسترته بنفسه، ولا يثبّت رقماً
-- ولا صفاً يملكه أحد. وعددُ صفوف `notifications` **لا يُثبَّت أبداً**: يُقاس
-- خطُّ أساسٍ في البداية ويُقارَن به الفارقُ وحده.
--
-- ── 🔴 العيبُ المركزيّ الذي وُجد هذا الملف لأجله ────────────────────────────
--
-- قِيس على القاعدة الحيّة قبل 0131:
--
--     select public.notification_channels_for('customer', null);  ⇒ {dashboard,telegram}
--
-- أي أن **أوّلَ إشعارِ عميلٍ في تاريخ المنصّة كان سيذهب إلى محادثة تليجرام
-- المالك** — لا إلى العميل. والقيدُ `recipient_kind in ('ops','partner')` لم
-- يكن حارساً بل مؤجِّلاً: ساعةَ يُرخى ينفتح الباب.
--
-- والقسم (ي) **يعيد بناء العيب حرفياً** بطفرةٍ تُشغَّل فعلاً — إن لم يحمرّ
-- الشاهد عندها فالشاهدُ زينة (النمط ٩ في `LESSONS.md`).
--
-- ما يغطيه الملف:
--   (٠)  الشروط المسبقة · (٠-ب) خط الأساس · التنظيف الأوّلي
--   (أ)  🔴 قنواتُ العميل: لا قناةَ مالكٍ ولا متعهد، ولا فراغَ أبداً
--   (ب)  القيود: الصنفُ الثالث · معرّفٌ إلزاميّ · وصفُّ التشغيل كما كان
--   (ج)  التوليد: تأكيدُ الحجز يُنتج صفَّ عميلٍ واحداً لا اثنين، وصفُّ التشغيل باقٍ
--   (د)  🔴 D-19: الحمولة بلا تكلفةٍ ولا هامشٍ ولا متعهدٍ ولا هاتف — والحاجزُ يرفض حقنها
--   (هـ) الإسنادُ والإتمام يصلان العميل بحدثيهما، بلا اسم متعهدٍ ولا مستحقّه
--   (و)  تذكيرُ الموعد: من يستحق يُصفّ مرةً واحدة، ومن لا يستحق لا يُصفّ
--   (ز)  صندوقُ العميل: توكنُه يقرأ صفوفَه هو وحدها
--   (ح)  دفعُ المتصفح: التسجيلُ بتوكنٍ صحيح يُنشئ القناة، وبتوكنٍ خاطئ يُرفض
--   (ط)  العزل: الزائرُ والمتعهد لا يلمسان جدولَي العميل مباشرةً
--   (ي)  🔬 طفرةُ الثقب: التدهورُ إلى قنوات المالك يجب أن يُحمِّر الشاهد
--   (ك)  صفرُ أثر
--
-- المرجع: supabase/migrations/0131_customer_notification_pipe.sql · D-19 · D-20
--         · docs/phase-briefs/CUSTOMER-MODE.md
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (٠) الشروط المسبقة — قراءةٌ محضة
-- ----------------------------------------------------------------------------
do $$
declare
  v_missing text;
begin
  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claims', '', false);

  select string_agg(x.rel, '، ') into v_missing
  from (values
    ('public.notifications'), ('public.bookings'),
    ('public.customer_push_subscriptions'), ('public.customer_notification_settings')
  ) as x(rel)
  where to_regclass(x.rel) is null;
  if v_missing is not null then
    raise exception 'شرط مسبق: جداول مفقودة (نفّذ 0131): %', v_missing;
  end if;

  select string_agg(x.s, '، ') into v_missing
  from (values
    ('public.customer_channels(uuid)'),
    ('public.customer_notification_payload(uuid)'),
    ('public.customer_inbox(text, integer)'),
    ('public.customer_register_push(text, text, text, text, text)'),
    ('public.customer_remove_push(text, text)'),
    ('public.customer_push_registered(text, text)'),
    ('public.notification_channels_for(text, uuid)')
  ) as x(s)
  where to_regprocedure(x.s) is null;
  if v_missing is not null then
    raise exception 'شرط مسبق: دوالّ مفقودة (نفّذ 0131): %', v_missing;
  end if;

  /*
   * 🔴 `queue_customer_reminders` تُفحص **بالاسم والقدرة** لا بتوقيعٍ حرفيّ.
   *
   * كان توقيعُها مثبَّتاً `(integer)` في القائمة أعلاه، فلمّا أضافت 0139 معاملَ
   * نطاقٍ بافتراضيّ (‏`p_booking_id uuid DEFAULT NULL`) — وهو **توسعةٌ مقصودة
   * تُتيح اختبارها بلا لمس حجزٍ حقيقي** — سقط الشرطُ المسبق وماتت المجموعة
   * كلُّها. وهي خامسُ مرةٍ يقع فيها هذا النمط في يومين: توكيدٌ يقيس **شكل**
   * الكود لا **ما يفعله**.
   *
   * فالمقصودُ هنا: الدالةُ موجودةٌ بتحميلٍ واحد، وتقبل حداً للعدد. وزيادةُ
   * معاملٍ بافتراضيّ تمرّ، وحذفُ الدالة أو تعدّدُ تحميلاتها يحمرّ.
   */
  if (select count(*) from pg_catalog.pg_proc pr
       join pg_catalog.pg_namespace ns on ns.oid = pr.pronamespace
      where ns.nspname = 'public' and pr.proname = 'queue_customer_reminders') <> 1 then
    raise exception 'شرط مسبق: queue_customer_reminders مفقودة أو لها تحميلان (نفّذ 0131 و0139)';
  end if;

  if not exists (
    select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
     where c.relname = 'notifications' and t.tgname = 'notifications_fan_customer') then
    raise exception 'شرط مسبق: مُشغّل notifications_fan_customer غير مربوط — نفّذ 0131';
  end if;

  -- 🔒 والافتراضُ المشحون **مطفأ** — فحصٌ على المخطَّط لا على محتوى الصفّ:
  --    الصفُّ يملكه بدر ويقلبه متى شاء، أما `column_default` فهو ما تشحنه
  --    الهجرة إلى كل نسخة. والسببُ مكتوبٌ في الهجرة: جرسُ اللوحة يعدّ كلَّ ما
  --    ليس متعهداً تشغيلاً، فصفُّ العميل يصير شارةً لا تُطفأ.
  select c.column_default into v_missing
    from information_schema.columns c
   where c.table_schema = 'public'
     and c.table_name   = 'customer_notification_settings'
     and c.column_name  = 'enabled';
  if coalesce(v_missing, '') not like 'false%' then
    raise exception
      '(٠) الافتراضُ المشحون لمفتاح أنبوب العميل «%» لا `false` — وقلبُه قبل إصلاح جرس اللوحة يترك عند المالك شارةً لا يستطيع إطفاءها',
      coalesce(v_missing, '(بلا افتراضي)');
  end if;

  raise notice '✔ (٠) الشروط المسبقة سليمة — أربعةُ جداولٍ وثمانِ دوالٍّ ومُشغّلٌ حيّ، والمفتاحُ يُشحن مطفأً';
end;
$$;

-- ----------------------------------------------------------------------------
-- (٠-ب) تنظيفُ بقايا تشغيلٍ سابق ثم خطُّ الأساس
-- ----------------------------------------------------------------------------
--
-- ⚠ التنظيف **أولاً وآخراً**: تشغيلٌ انهار في المنتصف لا يمنع التالي.
--   والوسمُ في ملاحظات الرحلة، فلا يُطابق صفَّ بدرٍ واحداً.
do $$
declare
  v_n integer;
begin
  delete from public.notifications n
   where n.recipient_id in (select b.id from public.bookings b
                             where b.trip ->> 'notes' = 'CUSTOMER_NOTIF_FIXTURE');
  delete from public.notifications n
   where n.payload ->> 'bookingId' in (select b.id::text from public.bookings b
                                        where b.trip ->> 'notes' = 'CUSTOMER_NOTIF_FIXTURE');
  delete from public.customer_push_subscriptions cs
   where cs.booking_id in (select b.id from public.bookings b
                            where b.trip ->> 'notes' = 'CUSTOMER_NOTIF_FIXTURE');
  delete from public.booking_events e
   where e.booking_id in (select b.id from public.bookings b
                           where b.trip ->> 'notes' = 'CUSTOMER_NOTIF_FIXTURE');
  delete from public.bookings b where b.trip ->> 'notes' = 'CUSTOMER_NOTIF_FIXTURE';

  /*
   * 🔴 والكنسُ الشامل يبعث تذكيراتٍ لحجوزات **المالك الحقيقية** كذلك — وهو
   * سلوكٌ صحيح للمهمة المجدولة، وخطأٌ أن تحسبه هذه المجموعة أثراً لفيكسترتها
   * أو أن تتركه فتظنّ نفسها نظيفة. (مقيس 2026-08-18: نجا صفُّ
   * `customer_trip_reminder` لحجز المالك `TR-3QKVVU`.)
   *
   * فالنطاقُ الصادق هو **ما وُلد داخل هذه المعاملة**: `now()` طابعُ بدء
   * المعاملة، وكلُّ صفٍّ أحدثُ منه أو مساوٍ له من صنعنا — والملفُّ كلُّه يُرجَع
   * بعدها على أي حال، فالحذفُ هنا لضبط القياس لا لتغيير القاعدة.
   *
   * 📌 وملاحظةٌ أكبر من هذا الملف: **دالةُ التذكير بلا نطاق** — تمسح كل
   * الحجوزات ولا تقبل حصرها بحجزٍ بعينه. إعطاؤها معاملَ نطاقٍ يجعل اختبارها
   * ممكناً بلا لمس بياناتٍ حقيقية أصلاً.
   */

  select count(*)::integer into v_n from public.notifications;
  perform set_config('tours.cn_base', v_n::text, false);

  select count(*)::integer into v_n from public.customer_push_subscriptions;
  perform set_config('tours.cn_push_base', v_n::text, false);

  raise notice '✔ (٠-ب) خطُّ الأساس: % صفَّ إشعار — ويُقارَن به الفارقُ وحده لا رقمٌ محفور',
    current_setting('tours.cn_base', true);
end;
$$;

-- ----------------------------------------------------------------------------
-- الفيكسترة — أربعةُ حجوزاتٍ يملكها هذا الملف وحده
-- ----------------------------------------------------------------------------
do $$
declare
  v_b1 uuid; v_b2 uuid; v_b3 uuid; v_b4 uuid;
begin
  -- ب١: يُنتظر تأكيدُه في (ج) — يبدأ `under_review` لأن جدولَ الانتقالات لا
  --     يسمح بـ`pending_payment → confirmed` (مقيسٌ من `booking_transition_allowed`)
  insert into public.bookings (reference, public_token, status, class_slug, class_title,
                               total, currency, plan, amount_due, amount_remaining,
                               customer_name, customer_phone, customer_whatsapp, trip)
  values ('TR-CN0001', repeat('n', 48), 'under_review', 'cn-sedan', 'CUSTOMER_NOTIF فئة',
          1000, 'EGP', 'full', 1000, 0, 'CUSTOMER_NOTIF عميل أ', '01000000801', '01000000801',
          jsonb_build_object('originLabel', 'CUSTOMER_NOTIF مبدأ',
                             'destLabel',   'CUSTOMER_NOTIF منتهى',
                             'passengers',  3,
                             'notes',       'CUSTOMER_NOTIF_FIXTURE',
                             'pickupAt',    (now() + interval '10 days')::text))
  returning id into v_b1;

  -- ب٢: مؤكَّدٌ سلفاً — يُختبر عليه الإسنادُ والإتمام في (هـ)
  insert into public.bookings (reference, public_token, status, class_slug, class_title,
                               total, currency, plan, amount_due, amount_remaining,
                               customer_name, customer_phone, trip)
  values ('TR-CN0002', repeat('m', 48), 'confirmed', 'cn-sedan', 'CUSTOMER_NOTIF فئة',
          2000, 'EGP', 'deposit', 500, 1500, 'CUSTOMER_NOTIF عميل ب', '01000000802',
          jsonb_build_object('originLabel', 'CUSTOMER_NOTIF مبدأ ٢',
                             'destLabel',   'CUSTOMER_NOTIF منتهى ٢',
                             'passengers',  1,
                             'notes',       'CUSTOMER_NOTIF_FIXTURE',
                             'pickupAt',    (now() + interval '9 days')::text))
  returning id into v_b2;

  -- ب٣: موعدُه بعد ساعتين ⇒ **يستحق** التذكير في (و)
  insert into public.bookings (reference, public_token, status, class_slug, class_title,
                               total, currency, plan, amount_due, amount_remaining,
                               customer_name, customer_phone, trip)
  values ('TR-CN0003', repeat('k', 48), 'assigned', 'cn-sedan', 'CUSTOMER_NOTIF فئة',
          1500, 'EGP', 'full', 1500, 0, 'CUSTOMER_NOTIF عميل ج', '01000000803',
          jsonb_build_object('originLabel', 'CUSTOMER_NOTIF مبدأ ٣',
                             'destLabel',   'CUSTOMER_NOTIF منتهى ٣',
                             'passengers',  2,
                             'notes',       'CUSTOMER_NOTIF_FIXTURE',
                             'pickupAt',    (now() + interval '2 hours')::text))
  returning id into v_b3;

  -- ب٤: موعدُه بعد شهر ⇒ **لا يستحق** التذكير — وبه يصير (و) فحصاً يمكن أن يفشل
  insert into public.bookings (reference, public_token, status, class_slug, class_title,
                               total, currency, plan, amount_due, amount_remaining,
                               customer_name, customer_phone, trip)
  values ('TR-CN0004', repeat('j', 48), 'confirmed', 'cn-sedan', 'CUSTOMER_NOTIF فئة',
          900, 'EGP', 'full', 900, 0, 'CUSTOMER_NOTIF عميل د', '01000000804',
          jsonb_build_object('originLabel', 'CUSTOMER_NOTIF مبدأ ٤',
                             'destLabel',   'CUSTOMER_NOTIF منتهى ٤',
                             'passengers',  1,
                             'notes',       'CUSTOMER_NOTIF_FIXTURE',
                             'pickupAt',    (now() + interval '30 days')::text))
  returning id into v_b4;

  -- 🔴 تكلفةٌ وهامشٌ **حقيقيان** على ب٢: بلا رقمٍ ممنوعٍ موجودٍ فعلاً يصير فحص
  --    «لا تُسرَّب التكلفة» فحصاً على عمودٍ فارغ — أي فحصاً لا يمكن أن يفشل.
  update public.bookings
     set subcontractor_cost = 1400, margin_amount = 600, price_source = 'tariff'
   where reference = 'TR-CN0002';

  perform set_config('tours.cn_b1', v_b1::text, false);
  perform set_config('tours.cn_b2', v_b2::text, false);
  perform set_config('tours.cn_b3', v_b3::text, false);
  perform set_config('tours.cn_b4', v_b4::text, false);

  -- وأنبوبُ العميل يُشعَل صراحةً **داخل هذه المعاملة وحدها** — فالملفُّ يقيس
  -- سلوكَ الأنبوب لا حالةَ مفتاحه عند بدر (وهو مطفأٌ اليوم بقرارٍ مكتوبٍ في
  -- ترويسة 0131). والمعاملةُ تُرجَع، فلا يبقى المفتاحُ مقلوباً بعدنا.
  update public.customer_notification_settings set enabled = true, reminder_lead_hours = 24 where id;

  raise notice '✔ (فيكسترة) أربعةُ حجوزاتٍ للملف وحده، وعلى الثاني تكلفةٌ ١٤٠٠ وهامشٌ ٦٠٠ حقيقيان';
end;
$$;

-- ----------------------------------------------------------------------------
-- (أ) 🔴 قنواتُ العميل — لا قناةَ مالكٍ ولا متعهد، ولا فراغَ أبداً
-- ----------------------------------------------------------------------------
do $$
declare
  v_b1    uuid := current_setting('tours.cn_b1', true)::uuid;
  v_owner text[] := public.notification_channels();
  v_cust  text[];
  v_ch    text;
begin
  -- مسبارُ المسبار: إعدادُ المالك يحمل تليجرام فعلاً، وإلا فما بعده بلا معنى
  if not ('telegram' = any (v_owner)) then
    raise notice '  ↳ (أ) تنبيه: قنواتُ المالك بلا تليجرام في هذه القاعدة — الشاهدُ أضعف لكنه قائم';
  end if;

  v_cust := public.notification_channels_for('customer', v_b1);

  if v_cust is null then
    raise exception
      '(أ-١) 🔴 قنواتُ العميل `null` — والعاملُ يقرأها مصفوفةً، فيسقط على DEFAULT_CHANNELS أي على تليجرام المالك';
  end if;
  if array_length(v_cust, 1) is null then
    raise exception
      '(أ-١) 🔴 قنواتُ العميل فارغة — والعاملُ المنشور يسقط عند الفراغ على [dashboard,telegram,email]، أي على قنوات المالك';
  end if;

  foreach v_ch in array v_cust loop
    if v_ch in ('dashboard', 'telegram', 'email', 'inbox', 'webpush') then
      raise exception
        '(أ-٢) 🔴 قناةُ العميل «%» اسمُ قناةٍ يعرفها الكودُ المنشور — أي أنها ستُسلَّم على وجهةِ المالك أو المتعهد. القنوات: %',
        v_ch, v_cust;
    end if;
    if v_ch not like 'customer\_%' then
      raise exception '(أ-٢) قناةُ عميلٍ بلا بادئة `customer_`: «%» — والبادئة هي الحارس نفسه', v_ch;
    end if;
  end loop;

  if not ('customer_inbox' = any (v_cust)) then
    raise exception '(أ-٣) صندوقُ العميل غائبٌ عن قنواته — وهو الوحيد الذي يمنع الفراغ: %', v_cust;
  end if;

  -- بلا اشتراكٍ مسجَّل: لا قناةَ دفع. وبه تصير (ح) فحصاً يمكن أن يفشل.
  if 'customer_push' = any (v_cust) then
    raise exception '(أ-٤) قناةُ الدفع حاضرةٌ بلا اشتراكٍ واحد — الشرطُ في `customer_channels` ساقط';
  end if;

  -- وقنواتُ التشغيل لم تتغيّر — الهجرةُ لا يجوز أن تمسّها
  if public.notification_channels_for('ops', null) is distinct from v_owner then
    raise exception '(أ-٥) قنواتُ التشغيل تغيّرت: % مقابل %',
      public.notification_channels_for('ops', null), v_owner;
  end if;

  -- وصنفٌ مجهول لا قناةَ له — فرعُ `else` لم يعد يسقط على المالك
  if array_length(public.notification_channels_for('whoever', null), 1) is not null then
    raise exception '(أ-٦) 🔴 صنفٌ مجهول أخذ قنوات: % — وهذا هو الثقبُ نفسه من بابٍ آخر',
      public.notification_channels_for('whoever', null);
  end if;

  raise notice '✔ (أ) قنواتُ العميل %: بلا قناةِ مالكٍ ولا متعهد، ولا فراغ · وقنواتُ التشغيل كما كانت', v_cust;
end;
$$;

-- ----------------------------------------------------------------------------
-- (ب) القيود — الصنفُ الثالث ومعرّفُه الإلزاميّ
-- ----------------------------------------------------------------------------
do $$
declare
  v_b1     uuid := current_setting('tours.cn_b1', true)::uuid;
  v_id     uuid;
  v_raised boolean;
begin
  -- (ب-١) صنفٌ رابع ما زال مرفوضاً — التوسعةُ لم تفتح الباب على مصراعيه
  v_raised := false;
  begin
    insert into public.notifications (event, payload, recipient_kind, recipient_id)
    values ('cn_probe', '{}'::jsonb, 'anybody', v_b1);
  exception when check_violation then
    v_raised := true;
  end;
  if not v_raised then
    raise exception '(ب-١) القيدُ قبل صنفاً مجهولاً — والتوسعةُ فقدت ما كانت تحرسه';
  end if;

  -- (ب-٢) عميلٌ بلا معرّف مرفوض على مستوى القيد
  v_raised := false;
  begin
    insert into public.notifications (event, payload, recipient_kind, recipient_id)
    values ('cn_probe', '{}'::jsonb, 'customer', null);
  exception when check_violation then
    v_raised := true;
  end;
  if not v_raised then
    raise exception '(ب-٢) 🔴 صفُّ عميلٍ بلا حجزٍ يعرّفه مرّ — ولا سطحَ يقرؤه ولا قناةَ تبلغه';
  end if;

  -- (ب-٣) وصفُّ التشغيل ما زال **بلا** معرّف — القيد يعمل في الاتجاهين
  v_raised := false;
  begin
    insert into public.notifications (event, payload, recipient_kind, recipient_id)
    values ('cn_probe', '{}'::jsonb, 'ops', v_b1);
  exception when check_violation then
    v_raised := true;
  end;
  if not v_raised then
    raise exception '(ب-٣) صفُّ تشغيلٍ بمعرّفٍ مرّ — والقيدُ صار يفحص اتجاهاً واحداً';
  end if;

  -- (ب-٤) و`queue_notification` ترمي على عميلٍ بلا معرّف ولا تردّه إلى التشغيل
  v_raised := false;
  begin
    perform public.queue_notification('cn_probe', '{}'::jsonb, 'customer', null);
  exception when others then
    v_raised := true;
  end;
  if not v_raised then
    raise exception
      '(ب-٤) 🔴 `queue_notification` قبلت عميلاً بلا معرّف — والردُّ إلى `ops` يعني إرسال حمولةِ عميلٍ على قنوات المالك';
  end if;

  -- (ب-٥) والصفُّ السليم يمرّ — وإلا كان ما فوقه يمرّ لأن كلَّ شيءٍ مرفوض
  select public.queue_notification('cn_probe', public.customer_notification_payload(v_b1),
                                   'customer', v_b1) into v_id;
  if v_id is null then
    raise exception '(ب-٥) صفُّ عميلٍ سليمٌ لم يُكتب — والقيودُ صارت ترفض كل شيء';
  end if;
  delete from public.notifications where id = v_id;

  raise notice '✔ (ب) الصنفُ الثالث مقبول، ومعرّفُه إلزاميّ في القيد وفي الدالة، وصفُّ التشغيل بلا معرّف كما كان';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ج) التوليد — تأكيدُ الحجز يُنتج صفَّ عميلٍ **واحداً**، وصفُّ التشغيل باقٍ
-- ----------------------------------------------------------------------------
do $$
declare
  v_b1  uuid := current_setting('tours.cn_b1', true)::uuid;
  v_ops integer;
  v_cus integer;
  v_row record;
begin
  update public.bookings set status = 'confirmed' where id = v_b1;

  -- (ج-١) صفُّ التشغيل كما كان — الهجرةُ لا تسرق إشعارَ المالك
  select count(*)::integer into v_ops from public.notifications n
   where n.event = 'booking_confirmed'
     and n.recipient_kind = 'ops'
     and n.payload ->> 'bookingId' = v_b1::text;
  if v_ops <> 1 then
    raise exception '(ج-١) إشعاراتُ التشغيل لتأكيد الحجز % — المتوقع ١', v_ops;
  end if;

  -- (ج-٢) وصفُّ العميل وُلد باسمه هو
  select count(*)::integer into v_cus from public.notifications n
   where n.event = 'customer_booking_confirmed'
     and n.recipient_kind = 'customer'
     and n.recipient_id   = v_b1;
  if v_cus <> 1 then
    raise exception '(ج-٢) 🔴 إشعاراتُ العميل لتأكيد الحجز % — المتوقع ١', v_cus;
  end if;

  select n.channels, n.status, n.recipient_id into v_row
    from public.notifications n
   where n.event = 'customer_booking_confirmed' and n.recipient_id = v_b1;

  if v_row.status <> 'queued' then
    raise exception '(ج-٣) صفُّ العميل وُلد بحالة «%» — والمتوقع queued', v_row.status;
  end if;
  if 'telegram' = any (v_row.channels) then
    raise exception '(ج-٣) 🔴 صفُّ العميل يحمل قناة تليجرام — وهي محادثةُ المالك: %', v_row.channels;
  end if;
  if not ('customer_inbox' = any (v_row.channels)) then
    raise exception '(ج-٣) صفُّ العميل بلا صندوق: %', v_row.channels;
  end if;

  -- (ج-٤) 🔴 حدثٌ يتكرّر لا يُزعج العميل مرتين
  --       (‏يُبعث الحدثُ نفسُه ثانيةً بدل تدوير حالةٍ يمنعها حارسُ الانتقالات —
  --        فالمقيسُ هنا الحارسُ ضد التكرار لا جدولُ الانتقالات)
  perform public.queue_notification(
    'booking_confirmed',
    jsonb_build_object('bookingId', v_b1, 'reference', 'TR-CN0001'));
  select count(*)::integer into v_cus from public.notifications n
   where n.event = 'customer_booking_confirmed' and n.recipient_id = v_b1;
  if v_cus <> 1 then
    raise exception '(ج-٤) تأكيدٌ ثانٍ ضاعف إشعارَ العميل إلى % — والحارسُ ضدّ التكرار ساقط', v_cus;
  end if;

  -- (ج-٥) وحدثٌ تشغيليٌّ بحت لا يولّد للعميل شيئاً — **يُقاس بالسلوك** لا بقراءة
  --       خريطة: تُبعث ثلاثةُ أحداثٍ تشغيلية على الحجز نفسه، ويجب ألا يزيد صفُّ
  --       عميلٍ واحد. (وبلا هذا يمرّ (ج-٢) على مُشغّلٍ يولّد لكل شيء.)
  select count(*)::integer into v_cus from public.notifications n
   where n.recipient_kind = 'customer' and n.recipient_id = v_b1;
  perform public.queue_notification('booking_created',
            jsonb_build_object('bookingId', v_b1, 'reference', 'TR-CN0001'));
  perform public.queue_notification('trip_offered',
            jsonb_build_object('bookingId', v_b1, 'reference', 'TR-CN0001'));
  -- و`booking_cancelled` شاهدٌ **قويّ**: حمولتُه تحمل `bookingId` فعلاً، فلو كان
  -- المُشغّل يولّد لكل حدثٍ بلا خريطة لَولّد له. (‏وليس من الأربعة المُسنَدة.)
  perform public.queue_notification('booking_cancelled',
            jsonb_build_object('bookingId', v_b1, 'reference', 'TR-CN0001'));
  select count(*)::integer into v_ops from public.notifications n
   where n.recipient_kind = 'customer' and n.recipient_id = v_b1;
  if v_ops <> v_cus then
    raise exception
      '(ج-٥) 🔴 حدثٌ تشغيليّ بحت ولّد صفَّ عميل (% ← %) — «حجزٌ جديد بانتظار التحويل» و«عرضُ رحلةٍ على المتعهدين» و«عطلُ مهمةٍ مجدولة» لا تُقال لعميل',
      v_cus, v_ops;
  end if;

  raise notice '✔ (ج) التأكيد يُنتج صفَّ تشغيلٍ وصفَّ عميلٍ واحداً لكلٍّ، ولا يتكرّر، ولا حدثَ تشغيليٍّ يتسرّب';
end;
$$;

-- ----------------------------------------------------------------------------
-- (د) 🔴 D-19 — الحمولةُ نظيفة، **والحاجزُ يرفض حقنها**
-- ----------------------------------------------------------------------------
do $$
declare
  v_b2     uuid := current_setting('tours.cn_b2', true)::uuid;
  v_pay    jsonb;
  v_key    text;
  v_raised boolean;
  v_cost   numeric;
begin
  -- مسبارُ المسبار: التكلفةُ والهامشُ **موجودان فعلاً** على هذا الحجز
  select b.subcontractor_cost into v_cost from public.bookings b where b.id = v_b2;
  if coalesce(v_cost, 0) <= 0 then
    raise exception '(د) مسبارٌ معطّل: لا تكلفةَ على حجز الفيكسترة — فحصُ «لا تُسرَّب» على عمودٍ فارغ لا يمكن أن يفشل';
  end if;

  v_pay := public.customer_notification_payload(v_b2);

  -- (د-١) لا مفتاحَ ممنوعاً في الحمولة
  foreach v_key in array array[
    'payout', 'realMargin', 'margin', 'marginAmount', 'subcontractorCost',
    'subcontractorId', 'companyName', 'partnerPhone', 'partnerEmail',
    'partnerTelegramChatId', 'pricedCost', 'ceiling', 'tripCode',
    'customerPhone', 'customerWhatsapp'
  ] loop
    if v_pay ? v_key then
      raise exception '(د-١) 🔴 حمولةُ العميل تحمل «%» — نقضٌ مباشر لـD-19: %', v_key, v_pay;
    end if;
  end loop;

  -- (د-٢) ولا قيمةَ التكلفة نفسها بأي اسمٍ آخر — الفحصُ على **الرقم** لا على المفتاح
  if v_pay::text like '%' || v_cost::text || '%' then
    raise exception '(د-٢) 🔴 رقمُ تكلفة المتعهد (%) ظهر في حمولة العميل بمفتاحٍ لم نتوقعه: %', v_cost, v_pay;
  end if;

  -- (د-٣) وما **يجب** أن يكون فيها موجود — وإلا كان (د-١) يمرّ على حمولةٍ فارغة
  if not (v_pay ? 'reference' and v_pay ? 'publicToken' and v_pay ? 'pickupAt'
          and v_pay ? 'originLabel' and v_pay ? 'destLabel') then
    raise exception '(د-٣) حمولةُ العميل ناقصةٌ عمّا يحتاجه ليعرف رحلته: %', v_pay;
  end if;

  -- (د-٤) 🔒 والحاجزُ في **الجدول** يرفض الحقن — لا انضباطَ الراسم وحده
  v_raised := false;
  begin
    insert into public.notifications (event, payload, recipient_kind, recipient_id)
    values ('customer_booking_confirmed',
            v_pay || jsonb_build_object('payout', 1400), 'customer', v_b2);
  exception when check_violation then
    v_raised := true;
  end;
  if not v_raised then
    raise exception
      '(د-٤) 🔴 القاعدةُ قبلت صفَّ عميلٍ فيه `payout` — والحاجزُ في الجدول ساقط، فمحرّرُ SQL وكاتبٌ مستقبليّ يمرّان';
  end if;

  v_raised := false;
  begin
    insert into public.notifications (event, payload, recipient_kind, recipient_id)
    values ('customer_booking_confirmed',
            v_pay || jsonb_build_object('companyName', 'شركةُ متعهد'), 'customer', v_b2);
  exception when check_violation then
    v_raised := true;
  end;
  if not v_raised then
    raise exception '(د-٤) 🔴 القاعدةُ قبلت اسمَ متعهدٍ في حمولةِ عميل — D-19 مكسورة في الجدول';
  end if;

  -- (د-٥) والحاجزُ **لا يمسّ** صفوف التشغيل: المالكُ يرى مستحقَّه كما كان
  insert into public.notifications (event, payload, recipient_kind, recipient_id)
  values ('cn_probe', jsonb_build_object('payout', 1400, 'companyName', 'شركة'), 'ops', null);
  delete from public.notifications where event = 'cn_probe';

  raise notice '✔ (د) حمولةُ العميل بلا تكلفةٍ ولا هامشٍ ولا متعهدٍ ولا هاتف · والحاجزُ في الجدول يرفض الحقن ولا يمسّ التشغيل';
end;
$$;

-- ----------------------------------------------------------------------------
-- (هـ) الإسنادُ والإتمام — يصلان العميل بحدثيهما وبلا شيءٍ يخصّ المتعهد
-- ----------------------------------------------------------------------------
do $$
declare
  v_b2  uuid := current_setting('tours.cn_b2', true)::uuid;
  v_n   integer;
  v_pay jsonb;
begin
  -- تقليدُ ما تكتبه `accept_offer` حرفياً: الحمولةُ التشغيلية بمستحقٍّ وهامشٍ
  -- واسمِ شركة. والمقصود أن المُشغّل **لا ينسخها** بل يبني من الحجز.
  perform public.queue_notification(
    'trip_assigned',
    jsonb_build_object(
      'bookingId',   v_b2,
      'reference',   'TR-CN0002',
      'payout',      1400,
      'realMargin',  600,
      'companyName', 'CUSTOMER_NOTIF شركةُ متعهد',
      'partnerPhone', '01000000999'
    )
  );

  select count(*)::integer into v_n from public.notifications n
   where n.event = 'customer_trip_assigned' and n.recipient_id = v_b2;
  if v_n <> 1 then
    raise exception '(هـ-١) إشعاراتُ الإسناد عند العميل % — المتوقع ١', v_n;
  end if;

  select n.payload into v_pay from public.notifications n
   where n.event = 'customer_trip_assigned' and n.recipient_id = v_b2;

  if v_pay ? 'payout' or v_pay ? 'realMargin' or v_pay ? 'companyName' or v_pay ? 'partnerPhone' then
    raise exception
      '(هـ-٢) 🔴 حمولةُ إسنادِ العميل نُسخت من حمولة التشغيل — فيها مستحقُّ المتعهد أو هامشُنا أو اسمُه: %', v_pay;
  end if;
  if v_pay::text like '%CUSTOMER_NOTIF شركةُ متعهد%' then
    raise exception '(هـ-٢) 🔴 اسمُ المتعهد عبر إلى العميل: %', v_pay;
  end if;

  -- (هـ-٣) والإتمام — وهو صفُّ **متعهد** لا صفُّ تشغيل، فالمُشغّل يجب أن يراه كذلك
  perform public.queue_notification(
    'trip_completion_approved',
    jsonb_build_object('bookingId', v_b2, 'reference', 'TR-CN0002', 'payout', 1400),
    'partner',
    -- 🔴 معرّفٌ من عندنا لا صفُّ متعهدٍ يملكه بدر: توكيدٌ يستند إلى صفٍّ يملكه
    --    غيرُنا يسقط يوم يُحذف ذلك الصف. و`partner_channels` لمعرّفٍ لا وجود له
    --    تُرجع `'{}'` — وهو سلوكٌ قائمٌ قبل هذه الهجرة ولا يعنينا هنا.
    gen_random_uuid()
  );

  select count(*)::integer into v_n from public.notifications n
   where n.event = 'customer_trip_completed' and n.recipient_id = v_b2;
  if v_n <> 1 then
    raise exception
      '(هـ-٣) 🔴 إتمامُ الرحلة لم يصل العميل (%) — والمُشغّل يقرأ صفوفَ التشغيل وحدها بينما `trip_completion_approved` صفُّ متعهد',
      v_n;
  end if;

  raise notice '✔ (هـ) الإسنادُ والإتمام يصلان العميل بحدثيهما، وحمولتاهما مبنيّتان من الحجز لا منسوختين من التشغيل';
end;
$$;

-- ----------------------------------------------------------------------------
-- (و) تذكيرُ الموعد — من يستحق يُصفّ مرةً واحدة، ومن لا يستحق لا يُصفّ
-- ----------------------------------------------------------------------------
do $$
declare
  v_b3  uuid := current_setting('tours.cn_b3', true)::uuid;
  v_b4  uuid := current_setting('tours.cn_b4', true)::uuid;
  v_n   integer;
  v_ran integer;
begin
  v_ran := public.queue_customer_reminders(500);
  if v_ran < 1 then
    raise exception '(و-١) الدورةُ صفّت % تذكيراً — والفيكسترة فيها حجزٌ موعدُه بعد ساعتين', v_ran;
  end if;

  select count(*)::integer into v_n from public.notifications n
   where n.event = 'customer_trip_reminder' and n.recipient_id = v_b3;
  if v_n <> 1 then
    raise exception '(و-١) تذكيراتُ الحجزِ القريب % — المتوقع ١', v_n;
  end if;

  -- (و-٢) 🔴 ومن موعدُه بعد شهر لا يُذكَّر اليوم — وبلا هذا يمرّ (و-١) على «صفَّ الكل»
  select count(*)::integer into v_n from public.notifications n
   where n.event = 'customer_trip_reminder' and n.recipient_id = v_b4;
  if v_n <> 0 then
    raise exception
      '(و-٢) 🔴 حجزٌ موعدُه بعد ثلاثين يوماً أُرسل له تذكيرُ «اقترب موعدك» — نافذةُ المهلة لا تُرشِّح شيئاً';
  end if;

  -- (و-٣) ودورةٌ ثانية لا تُذكّر مرتين
  perform public.queue_customer_reminders(500);
  select count(*)::integer into v_n from public.notifications n
   where n.event = 'customer_trip_reminder' and n.recipient_id = v_b3;
  if v_n <> 1 then
    raise exception '(و-٣) الدورةُ الثانية ضاعفت التذكير إلى % — والعميل يتلقّى الرسالة نفسها كل دقيقة', v_n;
  end if;

  -- (و-٤) والمفتاحُ المطفأ يوقف الأنبوب كلّه (حارسٌ لبدر لا لنا)
  update public.customer_notification_settings set enabled = false where id;
  if public.queue_customer_reminders(500) <> 0 then
    raise exception '(و-٤) الأنبوبُ مطفأٌ والدورةُ ما زالت تصفّ — فلا مفتاحَ يوقفه';
  end if;
  update public.customer_notification_settings set enabled = true where id;

  raise notice '✔ (و) التذكير: القريبُ يُذكَّر مرةً واحدة · والبعيدُ لا يُذكَّر · والمفتاحُ المطفأ يوقف الأنبوب';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ز) صندوقُ العميل — توكنُه يقرأ صفوفَه هو وحدها
-- ----------------------------------------------------------------------------
do $$
declare
  v_n   integer;
  v_sum jsonb;
begin
  select count(*)::integer into v_n from public.customer_inbox(repeat('n', 48), 50);
  if v_n < 1 then
    raise exception '(ز-١) صندوقُ حاملِ التوكن فارغٌ — وله صفُّ تأكيدٍ مكتوب';
  end if;

  -- (ز-٢) 🔴 ولا يرى صفوفَ حجزٍ آخر
  if exists (
    select 1 from public.customer_inbox(repeat('n', 48), 50) i
     where i.reference = 'TR-CN0002'
  ) then
    raise exception '(ز-٢) 🔴 صندوقُ عميلٍ يعرض إشعارَ حجزِ عميلٍ آخر — عزلُ التوكن ساقط';
  end if;

  -- (ز-٣) توكنٌ خاطئٌ لا يقرأ شيئاً، وتوكنٌ قصيرٌ كذلك
  select count(*)::integer into v_n from public.customer_inbox(repeat('x', 48), 50);
  if v_n <> 0 then
    raise exception '(ز-٣) توكنٌ لا وجود له قرأ % صفاً', v_n;
  end if;
  select count(*)::integer into v_n from public.customer_inbox('abc', 50);
  if v_n <> 0 then
    raise exception '(ز-٣) توكنٌ قصيرٌ قرأ % صفاً — وحارسُ الطول ساقط', v_n;
  end if;

  -- (ز-٤) والإسقاطُ صريح: لا مفتاحَ ممنوعاً في `summary`
  select i.summary into v_sum from public.customer_inbox(repeat('m', 48), 50) i limit 1;
  if v_sum ? 'payout' or v_sum ? 'companyName' or v_sum ? 'customerPhone' then
    raise exception '(ز-٤) 🔴 صندوقُ العميل يعرض مفتاحاً ممنوعاً: %', v_sum;
  end if;

  raise notice '✔ (ز) الصندوق: توكنٌ يقرأ صفوفَه وحدها · وتوكنٌ خاطئٌ أو قصيرٌ لا يقرأ شيئاً · والإسقاطُ صريح';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ح) دفعُ المتصفح — التسجيلُ بإذنٍ وبتوكنٍ صحيح، ولا تسجيلَ بغيره
-- ----------------------------------------------------------------------------
do $$
declare
  v_b1     uuid := current_setting('tours.cn_b1', true)::uuid;
  v_id     uuid;
  v_raised boolean;
  v_ch     text[];
begin
  -- (ح-١) توكنٌ خاطئٌ لا يسجّل جهازاً
  v_raised := false;
  begin
    perform public.customer_register_push(repeat('x', 48), 'https://push.example.invalid/cn1', 'p', 'a', 'ua');
  exception when others then
    v_raised := true;
  end;
  if not v_raised then
    raise exception '(ح-١) 🔴 جهازٌ سُجّل بتوكنٍ لا يخصّ حجزاً — أي أن أي زائرٍ يشترك في إشعارات غيره';
  end if;

  -- (ح-٢) والتوكنُ الصحيح يسجّل
  select public.customer_register_push(repeat('n', 48),
           'https://push.example.invalid/cn1', 'p256', 'auth', 'CUSTOMER_NOTIF جهاز') into v_id;
  if v_id is null then
    raise exception '(ح-٢) التسجيلُ بتوكنٍ صحيح لم يُنتج صفاً';
  end if;

  -- (ح-٣) 🔴 والقناةُ تظهر الآن — وقبل التسجيل كانت غائبة في (أ-٤)
  v_ch := public.notification_channels_for('customer', v_b1);
  if public.provider_ready('webpush') then
    if not ('customer_push' = any (v_ch)) then
      raise exception '(ح-٣) 🔴 اشتراكٌ مسجَّلٌ ومزوّدٌ جاهز ولا قناةَ دفعٍ في %', v_ch;
    end if;
  else
    if 'customer_push' = any (v_ch) then
      raise exception '(ح-٣) 🔴 قناةُ الدفع بالغةٌ بلا مفاتيح VAPID — الصفُّ سيُحسب مُرسَلاً ولا يصل شيء: %', v_ch;
    end if;
    raise notice '  ↳ (ح-٣) مزوّدُ webpush غير جاهزٍ في هذه القاعدة — والقناةُ **لا** تظهر، وهذا هو الاتجاه الصحيح';
  end if;

  -- (ح-٤) والتسجيلُ نفسُه لا يضاعف الصف (نفس الجهاز على نفس الحجز)
  perform public.customer_register_push(repeat('n', 48),
            'https://push.example.invalid/cn1', 'p256-جديد', 'auth-جديد', 'جهاز');
  if (select count(*) from public.customer_push_subscriptions cs where cs.booking_id = v_b1) <> 1 then
    raise exception '(ح-٤) الجهازُ نفسُه أنتج أكثر من صف — والفريدُ (حجز، عنوان) ساقط';
  end if;

  -- (ح-٥) وجهازٌ واحدٌ يتابع حجزين — الفريدُ ليس على العنوان وحده
  perform public.customer_register_push(repeat('m', 48),
            'https://push.example.invalid/cn1', 'p256', 'auth', 'جهاز');
  if (select count(*) from public.customer_push_subscriptions cs
       where cs.endpoint = 'https://push.example.invalid/cn1') <> 2 then
    raise exception
      '(ح-٥) 🔴 متصفحٌ واحدٌ لا يستطيع متابعة حجزين — والفريدُ على العنوان وحده يجعل الحجزَ الثاني يسرق إشعاراتِ الأول';
  end if;

  -- (ح-٦) وإلغاءُ الاشتراك يعمل بتوكن صاحبه وحده
  if public.customer_remove_push(repeat('x', 48), 'https://push.example.invalid/cn1') then
    raise exception '(ح-٦) 🔴 توكنٌ خاطئٌ حذف اشتراكَ غيره';
  end if;
  if not public.customer_remove_push(repeat('m', 48), 'https://push.example.invalid/cn1') then
    raise exception '(ح-٦) صاحبُ التوكن لم يستطع إلغاء اشتراكه';
  end if;
  if not public.customer_push_registered(repeat('n', 48), 'https://push.example.invalid/cn1') then
    raise exception '(ح-٦) الإلغاءُ على حجزٍ مسّ اشتراكَ حجزٍ آخر بالعنوان نفسه';
  end if;

  raise notice '✔ (ح) الدفع: التوكنُ الخاطئ لا يسجّل ولا يحذف · والجهازُ الواحد يتابع حجزين · والقناةُ تتبع جاهزيةَ المزوّد';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ط) العزل — بنداءٍ حيٍّ بالأدوار لا بقراءة سياسة (القاعدة ١٩)
-- ----------------------------------------------------------------------------
do $$
declare
  v_n integer;
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    raise notice '  ↳ (ط) تخطٍّ: دور anon غير موجود (قاعدة ليست Supabase)';
    return;
  end if;

  -- (ط-١) فخّ TRUNCATE — لا يخضع لـRLS إطلاقاً (القاعدة ١٦)
  if has_table_privilege('anon', 'public.customer_push_subscriptions', 'TRUNCATE')
     or has_table_privilege('authenticated', 'public.customer_push_subscriptions', 'TRUNCATE')
     or has_table_privilege('anon', 'public.customer_notification_settings', 'TRUNCATE')
     or has_table_privilege('authenticated', 'public.customer_notification_settings', 'TRUNCATE') then
    raise exception '(ط-١) 🔴 TRUNCATE ممنوحٌ على أحد جدولَي العميل — وهو لا يخضع لـRLS';
  end if;

  -- (ط-٢) والزائر لا يقرأ جدول الاشتراكات أصلاً — `endpoint` مفتاحُ إرسالٍ لا معرّف
  if has_table_privilege('anon', 'public.customer_push_subscriptions', 'SELECT')
     or has_table_privilege('anon', 'public.customer_push_subscriptions', 'INSERT') then
    raise exception '(ط-٢) 🔴 الزائر يملك وصولاً مباشراً إلى اشتراكات الدفع';
  end if;

  -- (ط-٣) 🔴 نداءٌ حيٌّ بدور `authenticated` — وهو **كلُّ متعهد** (D-20)
  execute 'set local role authenticated';
  select count(*)::integer into v_n from public.customer_push_subscriptions;
  execute 'reset role';
  if v_n <> 0 then
    raise exception
      '(ط-٣) 🔴 مستخدمٌ مسجَّلٌ (وكلُّ متعهدٍ منهم) قرأ % صفَّ اشتراكٍ — وفيها مفاتيحُ إرسالٍ إلى أجهزة العملاء', v_n;
  end if;

  -- (ط-٤) والدوالُّ الحسّاسة ليست للزائر
  -- بالمعرّف لا بقائمة الأنواع: التوقيعُ توسَّع في 0139، والمنحةُ هي المقصودة
  if coalesce((select bool_or(has_function_privilege('anon', pr.oid, 'EXECUTE'))
                 from pg_catalog.pg_proc pr
                 join pg_catalog.pg_namespace ns on ns.oid = pr.pronamespace
                where ns.nspname = 'public' and pr.proname = 'queue_customer_reminders'), false)
     or has_function_privilege('anon', 'public.customer_notification_payload(uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.customer_channels(uuid)', 'EXECUTE') then
    raise exception '(ط-٤) 🔴 الزائر ينفّذ دالةَ توجيهٍ أو حمولة — وهي للخادم وحده';
  end if;

  -- (ط-٥) وما يحتاجه فعلاً متاحٌ له — وإلا كانت الصفحةُ زرّاً لا يعمل
  if not has_function_privilege('anon', 'public.customer_register_push(text, text, text, text, text)', 'EXECUTE')
     or not has_function_privilege('anon', 'public.customer_inbox(text, integer)', 'EXECUTE') then
    raise exception '(ط-٥) الزائر لا ينفّذ دوالَّ صفحته — والزرُّ في الصفحة لا يعمل';
  end if;

  raise notice '✔ (ط) العزل: لا TRUNCATE · ولا قراءةَ مباشرة (بنداءٍ حيّ بدور authenticated) · ودوالُّ الصفحة متاحة';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ي) 🔬 طفرةُ الثقب — يُعاد بناؤه فعلاً، ويجب أن يحمرّ الشاهد
-- ----------------------------------------------------------------------------
--
-- الطفرةُ هي **جسمُ الدالة قبل 0131 حرفياً**: فرعُ `else` يسقط على
-- `notification_channels()`. وإن مرّ الشاهدُ عليها فهو زينةٌ لا حارس.
do $$
declare
  v_b1     uuid := current_setting('tours.cn_b1', true)::uuid;
  v_caught boolean := false;
  v_ch     text[];
  v_owner  text[] := public.notification_channels();
begin
  -- الطفرة: الجسمُ القديم بنصّه
  create or replace function public.notification_channels_for(p_kind text, p_id uuid)
  returns text[] language sql stable security definer set search_path = ''
  as $mut$
    select case
      when p_kind = 'partner' and p_id is not null
        then coalesce(public.partner_channels(p_id), '{}'::text[])
      else public.notification_channels()
    end;
  $mut$;

  v_ch := public.notification_channels_for('customer', v_b1);

  -- الشاهدُ نفسُه المكتوب في (أ-٢): قناةُ عميلٍ باسمِ قناةٍ يعرفها الكود المنشور
  if 'telegram' = any (v_ch) or 'dashboard' = any (v_ch) then
    v_caught := true;
  end if;

  -- الاستعادةُ **قبل** أي رمي — وإلا بقيت الطفرةُ حيّةً في معاملةٍ قد تُكمَّم
  create or replace function public.notification_channels_for(p_kind text, p_id uuid)
  returns text[] language sql stable security definer set search_path = ''
  as $ok$
    select case
      when p_kind = 'partner'  then coalesce(public.partner_channels(p_id), '{}'::text[])
      when p_kind = 'customer' then public.customer_channels(p_id)
      when p_kind = 'ops'      then public.notification_channels()
      else '{}'::text[]
    end;
  $ok$;

  if not v_caught then
    raise exception
      '(ي) 🔬 الطفرةُ أعادت التدهورَ إلى قنوات المالك (%) ولم يحمرّ الشاهد — أي أن (أ-٢) زينةٌ لا حارس',
      v_owner;
  end if;

  -- والدالةُ المستعادة تعمل كما يجب — وإلا تركنا القاعدة أسوأ مما وجدناها
  v_ch := public.notification_channels_for('customer', v_b1);
  if 'telegram' = any (v_ch) or not ('customer_inbox' = any (v_ch)) then
    raise exception '(ي) الاستعادةُ بعد الطفرة لم تُرجع الدالة إلى صوابها: %', v_ch;
  end if;

  raise notice '✔ (ي) 🔬 الطفرةُ أعادت الثقب فاحمرّ الشاهد فعلاً — والحارسُ ليس زينة';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ك) صفرُ أثر — الفارقُ يُقارَن، ولا رقمَ محفور
-- ----------------------------------------------------------------------------
do $$
declare
  v_base integer := current_setting('tours.cn_base', true)::integer;
  v_push integer := current_setting('tours.cn_push_base', true)::integer;
  v_now  integer;
begin
  delete from public.notifications n
   where n.recipient_id in (select b.id from public.bookings b
                             where b.trip ->> 'notes' = 'CUSTOMER_NOTIF_FIXTURE');
  delete from public.notifications n
   where n.payload ->> 'bookingId' in (select b.id::text from public.bookings b
                                        where b.trip ->> 'notes' = 'CUSTOMER_NOTIF_FIXTURE');
  delete from public.customer_push_subscriptions cs
   where cs.booking_id in (select b.id from public.bookings b
                            where b.trip ->> 'notes' = 'CUSTOMER_NOTIF_FIXTURE');
  delete from public.booking_events e
   where e.booking_id in (select b.id from public.bookings b
                           where b.trip ->> 'notes' = 'CUSTOMER_NOTIF_FIXTURE');
  delete from public.bookings b where b.trip ->> 'notes' = 'CUSTOMER_NOTIF_FIXTURE';

  /*
   * 🔴 القياسُ على ما كان **قبل** المعاملة، لا على المجموع.
   *
   * الغرضُ أن يُمسك أثرٌ يمسّ صفوفاً قائمة. أما ما وُلد داخل المعاملة فيرتدّ
   * بالتراجع على أي حال، **و`notifications` جدولُ إلحاقٍ فقط (0110) فلا يُحذف
   * منه** — فالمقارنةُ بالمجموع كانت تحمّل الملفَّ وزرَ ما لا يملك حذفه.
   *
   * ومنه صفٌّ مقيسٌ حقيقيّ: كنسُ التذكيرات **بلا نطاق** فيبعث لحجوزات المالك
   * الحقيقية كذلك (‏2026-08-18: `customer_trip_reminder` لحجز `TR-3QKVVU`).
   * وهو سلوكٌ صحيح للمهمة المجدولة، وليس أثراً لهذه الفيكسترة.
   *
   * 📌 والأصلح لاحقاً: **معاملُ نطاقٍ لدالة التذكير** فتُختبر بلا أن تمسّ
   * حجزاً حقيقياً أصلاً.
   */
  if exists (select 1 from public.notifications n where n.created_at >= now()) then
    raise notice '     ↳ (ك) وُلد داخل المعاملة % إشعاراً (منها ما بعثه الكنسُ الشامل لحجوزاتٍ حقيقية) — يرتدّ كلُّه بالتراجع',
      (select count(*) from public.notifications n where n.created_at >= now());
  end if;

  select count(*)::integer into v_now
    from public.notifications n where n.created_at < now();
  if v_now <> v_base then
    raise exception E'(ك) صفوفُ الإشعارات % والأساس % — الملفُّ ترك أثراً.
الباقي:
%',
      v_now, v_base,
      (select string_agg(format('  · %s | %s | recipient=%s | payload=%s',
                                n.event, n.recipient_kind, coalesce(n.recipient_id::text,'—'),
                                left(n.payload::text, 160)), E'
')
         from public.notifications n
        where n.created_at >= now());
  end if;

  select count(*)::integer into v_now from public.customer_push_subscriptions;
  if v_now <> v_push then
    raise exception '(ك) اشتراكاتُ الدفع % والأساس % — الملفُّ ترك أثراً', v_now, v_push;
  end if;

  raise notice '✔ (ك) صفرُ أثر: الإشعاراتُ والاشتراكاتُ عادت إلى خطّ الأساس بالضبط';
  raise notice 'ALL PASSED';
end;
$$;
