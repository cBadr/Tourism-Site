-- ============================================================================
-- privacy_disclosure_tests.sql — «النصّ يقول ما يجري، ولا يقول ما لا يجري»
--
-- كيف تشغّله: `pnpm db:test privacy_disclosure` أو الصقه في SQL Editor.
-- النجاح = آخر سطر «ALL PASSED». والفشل exception عربية فيها ما نقص وأين.
--
-- ══════════════════════════════════════════════════════════════════════════
--  🔒 لا يكتب بايتاً واحداً — قرارٌ لا كسل
-- ══════════════════════════════════════════════════════════════════════════
--
-- لا فيكسترة ولا حجزٌ ولا إشعار ولا `set role`. كلُّ ما يقيسه: `sections`
-- المنشورة، و`information_schema`، و`pg_get_functiondef` (‏D-58: جسمُ الدالة
-- من الكتالوج الحيّ لا من ملفِّ هجرة). وسببه مقيس: جولةُ `db:test` واحدة
-- أبرقت أحدَ عشر إشعارَ حجزٍ وهميّ إلى هاتف المالك — فمجموعةٌ جديدة لا تضيف
-- صفاً واحداً إلى ذلك الثمن.
--
-- ══════════════════════════════════════════════════════════════════════════
--  ما تحرسه هذه المجموعة — والقاعدة ١٩ حرفياً
-- ══════════════════════════════════════════════════════════════════════════
--
-- «مكتشِفٌ يقرأ نصّاً يكذب في الاتجاهين». فصفحةُ خصوصيةٍ تُختبر باتجاهين معاً:
--
--   | الاتجاه | متى تحمرّ | لماذا |
--   |---|---|---|
--   | **يُجمَع ولا يُفصَح** | المخطَّط يحمل الميزة، والنصّ لا يذكرها | هذه بعينها علّةُ `0128`: نزلت ميزاتٌ ولم يلحقها النصّ |
--   | **يُفصَح عمّا لا يقع** | النصّ يذكرها، والمخطَّط لا يحملها | «بندٌ يَعِد بحمايةٍ غير قائمة أسوأ من غيابه» |
--   | **جمعٌ جديد بلا إفصاح** | عمودٌ شخصيٌّ جديد خارج البصمة المجمَّدة (٤٦ عموداً) | ميزةٌ تنزل غداً بعمودِ هاتفٍ أو صورةٍ ⇒ تحمرّ فوراً لا بعد أشهر |
--   | **مطفأٌ اشتعل** | مزوّدُ دفعٍ أو أداةُ تحليلٍ صارت حيّة والنصّ ساكت | النصّ اليوم صامتٌ عنها **لأنها مطفأة** — واشتعالُها يجعل الصمتَ كذباً |
--
-- ⚠ **ولا يُقاس هنا رقمٌ مطلقٌ من محتوى المالك**: لا «١٦ قسماً» ولا «٨٨٣ صفاً».
--   العلاقاتُ تصمد حين يضيف المالك بنداً أو يترجم صفاً؛ والأرقامُ لا.
--
-- المرجع: `0128_privacy_discloses_what_actually_happens.sql` ·
-- `0105`/`0111` (ما يصل المتعهد) · `0125` (شروط الولاء في `/terms`) · D-19 · D-58.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (٠) الشروط المسبقة
-- ----------------------------------------------------------------------------
do $$
declare
  v_missing text;
begin
  select string_agg(x.sig, '، ') into v_missing
  from (values
    ('public.i18n_corpus_rows()'),
    ('public.driver_documents_due_for_purge(integer)'),
    ('public.touch_partner_presence()'),
    ('public.admin_partner_presence()'),
    ('public.redeem_coupon(text, uuid, numeric, text)'),
    ('public.find_booking_by_reference(text, text, text)'),
    ('public.prune_audit_log(integer)')) as x(sig)
  where to_regprocedure(x.sig) is null;
  if v_missing is not null then
    raise exception 'شرط مسبق: دوالٌّ مفقودة (طبّق الهجرات أولاً): %', v_missing;
  end if;

  if not exists (
    select 1 from public.pages p where p.slug = 'privacy' and p.published
  ) then
    raise exception 'شرط مسبق: صفحة privacy غير منشورة — لا نصَّ يُقاس';
  end if;

  raise notice '✔ (٠) الشروط المسبقة قائمة';
end;
$$;

-- ----------------------------------------------------------------------------
-- (أ) 🔴 الجرد المقيس ⇄ النصّ المنشور — الاتجاهان في تأكيدٍ واحد
--
--     كلُّ صفٍّ: حقيقةٌ تُقاس من المخطَّط، وعبارةٌ تُطلب في النصّ المنشور.
--     `probe` صادقة والعبارة غائبة ⇒ «يُجمَع ولا يُفصَح».
--     `probe` كاذبة والعبارة حاضرة ⇒ «يُفصَح عمّا لا يقع».
-- ----------------------------------------------------------------------------
do $$
declare
  v_text     text;
  v_purge    text;
  v_touch    text;
  v_online   text;
  v_coupon   text;
  v_lookup   text;
  v_prune    text;
  v_silent   text;
  v_lying    text;
begin
  -- النصّ المنشور فعلاً: أقسامٌ **مرئية** على صفحةٍ **منشورة**، لا مسوّدات
  select string_agg(s.content::text, ' ' order by s.sort) into v_text
  from public.sections s
  join public.pages p on p.id = s.page_id
  where p.slug = 'privacy' and p.published and s.visible;

  if v_text is null or length(v_text) < 500 then
    raise exception '(أ) نصُّ الخصوصية المنشور فارغٌ أو أقصرُ من أن يكون سياسة (%)',
      coalesce(length(v_text), 0);
  end if;

  v_purge  := pg_get_functiondef('public.driver_documents_due_for_purge(integer)'::regprocedure);
  v_touch  := pg_get_functiondef('public.touch_partner_presence()'::regprocedure);
  v_online := pg_get_functiondef('public.admin_partner_presence()'::regprocedure);
  v_coupon := pg_get_functiondef('public.redeem_coupon(text,uuid,numeric,text)'::regprocedure);
  v_lookup := pg_get_functiondef('public.find_booking_by_reference(text,text,text)'::regprocedure);
  v_prune  := pg_get_functiondef('public.prune_audit_log(integer)'::regprocedure);

  with col as (
    select c.table_name || '.' || c.column_name as k
    from information_schema.columns c
    where c.table_schema = 'public'
  ),
  inv(label, probe, needle) as (values
    -- ── المتعهد وسائقوه (`0118` · `0120` · `0113`/`0119`) ────────────────
    ('نبضةُ حضور المتعهد',
      to_regclass('public.partner_presence') is not null,
      'حضوره في بوابته'),
    ('سقفُ النبضة دقيقة',
      position($q$interval '1 minute'$q$ in v_touch) > 0,
      'مرة كل دقيقة على الأكثر'),
    ('«متصلٌ الآن» تُعرض للإدارة وحدها',
      position('public.is_admin()' in v_online) > 0,
      'فتظهر لإدارتنا وحدها حالته'),
    ('صورةُ السائق',
      (select count(*) from col where k = 'subcontractor_drivers.photo_path') = 1,
      'وصورة السائق'),
    ('صورةُ الرخصة ورقمها وتاريخها',
      (select count(*) from col
        where k in ('subcontractor_drivers.license_photo_path',
                    'subcontractor_drivers.license_no',
                    'subcontractor_drivers.license_expiry')) = 3,
      'ورقم الرخصة وتاريخ انتهائها'),
    ('توثيقُ الرخصة من الإدارة',
      (select count(*) from col where k = 'subcontractor_drivers.license_verified_by') = 1,
      'ومن وثّق الرخصة من إدارتنا ومتى'),
    ('مدةُ حفظ الصور خمسُ سنوات من انتهاء العلاقة',
      position($q$interval '5 years'$q$ in v_purge) > 0
        and position('relationship_ended_at' in v_purge) > 0,
      'خمس سنوات من انتهاء علاقتنا بالمتعهد'),
    ('دلوُ وثائق السائق خاصّ',
      exists (select 1 from storage.buckets b where b.id = 'driver-docs' and b.public = false),
      'مساحة تخزين خاصة لا تُفتح برابط عام'),
    ('مركباتُ المتعهد ولوحاتها',
      (select count(*) from col where k = 'subcontractor_vehicles.plate') = 1,
      'واللوحة وسنة الصنع'),
    ('سجلُّ الخصم على المتعهد',
      to_regclass('public.booking_failures') is not null
        and to_regclass('public.trip_withdrawals') is not null,
      'وما خُصم منه إن وقع خصم'),
    ('التظلّم',
      to_regclass('public.partner_grievances') is not null,
      'نص التظلّم الذي يقدّمه'),
    ('التسويات والمدفوعات',
      to_regclass('public.partner_settlements') is not null
        and to_regclass('public.partner_payouts') is not null,
      'والتسويات والمدفوعات بيننا'),
    ('توقيعُ اتفاقية الشراكة',
      to_regclass('public.partner_agreement_acceptances') is not null,
      'اتفاقية الشراكة'),
    ('اشتراكُ دفع المتصفح',
      to_regclass('public.partner_push_subscriptions') is not null,
      'عنوان اشتراك جهازه ومفتاحيه'),
    ('معرّفُ محادثة تليجرام للمتعهد',
      (select count(*) from col where k = 'subcontractors.telegram_chat_id') = 1,
      'ومعرّف محادثته على تليجرام'),

    -- ── الولاء وهويةُ الهاتف ────────────────────────────────────────────
    ('رصيدُ النقاط على الهاتف المُطبَّع',
      (select count(*) from col where k = 'loyalty_accounts.phone_norm') = 1,
      'بل برقم هاتفك بعد تطبيعه'),
    ('دفترُ النقاط مُلحَق',
      to_regclass('public.loyalty_entries') is not null,
      'قيدٌ عاكس يبقى ظاهراً بجوار أصله'),
    ('سقفُ الكوبون لكل رقم',
      position('max_uses_per_phone' in v_coupon) > 0
        and position('coupon_redemptions' in v_coupon) > 0,
      'كم مرة استُخدم كوبون خصم من الرقم نفسه'),
    ('الإشارةُ إلى شروط الولاء ولا تكرارها',
      exists (
        select 1 from public.sections s2
        join public.pages p2 on p2.id = s2.page_id
        where p2.slug = 'terms' and p2.published and s2.visible
          and s2.content ->> 'anchor' = 'loyalty'),
      'في الشروط والأحكام'),

    -- ── سجلاتُ الاستعمال ───────────────────────────────────────────────
    ('سجلُّ خطوات المسار',
      to_regclass('public.funnel_events') is not null,
      'خطوات مسارك على الموقع'),
    ('كاشُ نصّ البحث عن الأماكن',
      to_regclass('public.geocode_cache') is not null,
      'ما تكتبه في خانة البحث عن مكان'),
    ('صورةُ خريطة المسار',
      to_regclass('public.booking_route_maps') is not null,
      'صورة خريطة مسار رحلتك'),
    -- 0129 — أخو `geocode_cache`: ذاكرةٌ مشتركة دائمة، لكن مفتاحُها إحداثيات
    --        لا نصّ. أغفلته `0128` فأضافه `0129` بالبند `pvl007`.
    ('كاشُ إحداثيات المسار المُسعَّر',
      to_regclass('public.distance_cache') is not null,
      'إحداثيات المسار الذي سعّرته'),
    ('سجلُّ التدقيق يحمل لقطةَ الحجز',
      to_regclass('public.audit_log') is not null,
      'سجل التدقيق الداخلي'),
    ('أرضيةُ تقليم التدقيق سنة',
      position('365' in v_prune) > 0,
      'تقليم إداري يُبقي سنةً على الأقل'),
    ('عدّادُ محاولات المتابعة',
      to_regclass('public.booking_lookup_attempts') is not null,
      'عدّاد محاولات فتح صفحة المتابعة'),
    ('نافذةُ العدّاد ربعُ ساعة وكنسُه ساعة',
      position($q$interval '15 minutes'$q$ in v_lookup) > 0
        and position($q$interval '1 hour'$q$ in v_lookup) > 0,
      'نوافذ من ربع ساعة'),
    ('تليجرام قناةٌ حيّة',
      exists (select 1 from public.notification_providers np
              where np.channel = 'telegram' and np.ready),
      'تصل فريقنا عبر تليجرام'),

    -- ── ما كان قائماً قبل `0128` — لا ينحدر ────────────────────────────
    ('واتساب العميل يصل المتعهد (‏`0105`)',
      (select count(*) from col where k = 'bookings.customer_whatsapp') = 1,
      'ورقم واتسابك إن سجّلته'),
    ('إيصالُ التحويل يُرفع ويُحفظ',
      (select count(*) from col where k = 'payments.receipt_path') = 1,
      'صورة إيصال التحويل'),

    -- ── 🔴 الاتجاه المعكوس: مطفأٌ اليوم ⇒ **العبارة يجب أن تغيب** ────────
    ('مزوّدُ دفعٍ إلكترونيّ مشتعل',
      exists (select 1 from public.payment_providers pp where pp.enabled),
      'بوابة الدفع الإلكتروني'),
    ('أداةُ تحليلٍ خارجيةٌ مشتعلةٌ بمعرّف',
      exists (
        select 1
        from public.site_settings ss,
             lateral jsonb_each(ss.value) e(k, v)
        where ss.key = 'integrations'
          and coalesce((e.v ->> 'enabled')::boolean, false)
          and nullif(btrim(coalesce(e.v ->> 'id', '')), '') is not null),
      'أداة تحليل خارجية مفعَّلة')
  )
  select
    string_agg(i.label || ' ⇒ «' || i.needle || '»', E'\n    · ')
      filter (where i.probe and position(i.needle in v_text) = 0),
    string_agg(i.label || ' ⇒ «' || i.needle || '»', E'\n    · ')
      filter (where not i.probe and position(i.needle in v_text) > 0)
  into v_silent, v_lying
  from inv i;

  if v_silent is not null then
    raise exception
      E'(أ) 🔴 **يُجمَع ولا يُفصَح** — القاعدةُ تفعله وصفحةُ الخصوصية ساكتة:\n    · %\n\nالعلاج: هجرةٌ جديدة تضيف البند (‏قلّد 0128) — **لا تُعدَّل هذه المجموعة لتمرّ**.',
      v_silent;
  end if;

  if v_lying is not null then
    raise exception
      E'(أ) 🔴 **يُفصَح عمّا لا يقع** — النصّ يَعِد بما لم يعد قائماً في القاعدة:\n    · %\n\nالعلاج: أعِد الميزة، أو صحّح النصّ بهجرةٍ جديدة. **وعدٌ لا نفي به أسوأ من غيابه**.',
      v_lying;
  end if;

  raise notice '✔ (أ) الجردُ المقيس ⇄ النصّ المنشور — ٣٢ رابطةً في الاتجاهين بلا فجوة';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ب) 🔴 حارسُ التوسّع — عمودٌ شخصيٌّ جديد بلا إفصاح يُمسك **يوم نزوله**
--
--     البصمةُ المجمَّدة ٦٠ عموداً، قِيست في 2026-08-18 بعد `0129`. والحارس
--     يفشل في الاتجاهين: عمودٌ **زاد** (‏جمعٌ جديد لم تلحقه الخصوصية بعد)،
--     وعمودٌ **نقص** (‏بندٌ في الصفحة صار يصف ما لا يوجد).
-- ----------------------------------------------------------------------------
do $$
declare
  v_added    text;
  v_deferred integer;
  v_gone    text;
begin
  with live as (
    select c.table_name || '.' || c.column_name as k
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema
     and t.table_name   = c.table_name
     and t.table_type   = 'BASE TABLE'
    where c.table_schema = 'public'
      and (c.column_name ~ '(phone|whatsapp|email|photo|licen[sc]e|passport|national|user_agent|endpoint|p256dh|chat_id|customer_name|contact_name|full_name|signed_name|holder_name|birth|gender|query_key|client_key|avatar|socials|ip_addr)'
        -- 0129 — الإحداثياتُ كانت **خارج البصمة كلها**، فنزل `distance_cache`
        --        بأربعة أعمدةٍ تحفظ ما طلبه زائرٌ ولم يمسكه أحد. والمدىُ واسعٌ
        --        عمداً: صفٌّ في `frozen` معناه «رُوجع»، لا «شخصيٌّ يلزمه بند».
        or c.column_name ~ '(_lat|_lng)$'
        or c.column_name in ('trip', 'details', 'notes', 'body',
                             'receipt_path', 'storage_path', 'attachment_path',
                             'last_seen_at'))
  ),
  frozen(k) as (values
    ('booking_lookup_attempts.client_key'),
    ('booking_route_maps.storage_path'),
    ('bookings.customer_name'),
    ('bookings.customer_phone'),
    ('bookings.customer_whatsapp'),
    ('bookings.phone_norm'),
    ('bookings.trip'),
    ('coupon_redemptions.phone'),
    ('coupons.max_uses_per_phone'),
    ('expenses.attachment_path'),
    ('geocode_cache.query_key'),
    ('loyalty_accounts.phone_norm'),
    ('loyalty_entries.phone_norm'),
    ('partner_agreement_acceptances.signed_name'),
    ('partner_alert_prefs.email_enabled'),
    ('partner_grievances.body'),
    ('partner_presence.last_seen_at'),
    ('partner_push_subscriptions.endpoint'),
    ('partner_push_subscriptions.last_seen_at'),
    ('partner_push_subscriptions.p256dh'),
    ('partner_push_subscriptions.user_agent'),
    ('payment_accounts.holder_name'),
    ('payments.receipt_path'),
    ('profiles.full_name'),
    ('profiles.phone'),
    ('promo_banners.body'),
    ('quote_requests.customer_name'),
    ('quote_requests.customer_phone'),
    ('quote_requests.details'),
    ('subcontractor_drivers.license_expiry'),
    ('subcontractor_drivers.license_no'),
    ('subcontractor_drivers.license_photo_path'),
    ('subcontractor_drivers.license_verified_at'),
    ('subcontractor_drivers.license_verified_by'),
    ('subcontractor_drivers.phone'),
    ('subcontractor_drivers.photo_path'),
    ('subcontractor_vehicles.photo_path'),
    ('subcontractors.avatar_url'),
    ('subcontractors.contact_name'),
    ('subcontractors.email'),
    ('subcontractors.notes'),
    ('subcontractors.phone'),
    ('subcontractors.socials'),
    ('subcontractors.telegram_chat_id'),
    ('subcontractors.whatsapp'),
    ('trip_settings.driver_phone_lead_minutes'),
    ('distance_cache.dest_lat'),
    ('distance_cache.dest_lng'),
    ('distance_cache.origin_lat'),
    ('distance_cache.origin_lng'),
    ('place_search_settings.default_center_lat'),
    ('place_search_settings.default_center_lng'),
    ('price_lists.dest_lat'),
    ('price_lists.dest_lng'),
    ('price_lists.origin_lat'),
    ('price_lists.origin_lng'),
    ('quote_requests.dest_lat'),
    ('quote_requests.dest_lng'),
    ('quote_requests.origin_lat'),
    ('quote_requests.origin_lng')
  ),
  /*
   * 🟠 مؤجَّلاتٌ بقرار بدر 2026-08-18: «تجاهل بنود الخصوصية حالياً، سنعيد كتابتها
   * بعد الإنتهاء من المشروع بشكل كامل».
   *
   * 🔴 وهي **ليست إعفاءً بل دفتر دَين**. الفرق الذي يجعل الحارس حيّاً:
   *   · العمودُ المؤجَّل يُسمّى هنا **واحداً واحداً** — فلا نمطَ يبتلع ما يأتي.
   *   · وأيُّ عمودٍ شخصيٍّ جديد **خارج هذه القائمة يُحمِّر المجموعة كما كان**.
   *   · ويُطبَع في كل جولةٍ إشعارٌ بعددها، فلا يُنسى دَينٌ لأنه صمت.
   *
   * وحين يأمر بدر بإعادة كتابة الخصوصية: **هذه القائمة هي قائمةُ العمل**،
   * ويُفرَّغ منها كلُّ عمودٍ نزل له بند.
   *
   * ⚠ ومعلَّقٌ عليها سؤالٌ لم يُجب بعد: `customer_push_subscriptions.user_agent`
   * **لا يلزم لتسليم إشعارٍ إطلاقاً** — وهو بصمةُ جهازٍ تُجمع بلا حاجة.
   * فالأرجح حذفُه لا الإفصاح عنه، والقرارُ لبدر.
   */
  deferred(k) as (
    values
    ('customer_push_subscriptions.endpoint'),
    ('customer_push_subscriptions.p256dh'),
    ('customer_push_subscriptions.user_agent'),
    ('customer_push_subscriptions.last_seen_at')
  )
  select
    (select string_agg(k, '، ' order by k)
       from (select k from live except select k from frozen except select k from deferred) a),
    (select string_agg(k, '، ' order by k)
       from (select k from frozen except select k from live) b),
    (select count(*) from (select k from deferred intersect select k from live) d)
  into v_added, v_gone, v_deferred;

  if v_added is not null then
    raise exception
      E'(ب) 🔴 **جمعُ بياناتٍ جديد بلا إفصاح** — أعمدةٌ شخصيةٌ نزلت وصفحةُ الخصوصية لا تعرفها:\n    · %\n\nالإجراء (بالترتيب): (١) اقرأ ما تحمله فعلاً، (٢) اسأل أينبغي جمعُها أصلاً — الإفصاحُ ليس ترخيصاً، (٣) إن بقيت فبندٌ في هجرةٍ جديدة، (٤) ثم أضِفها إلى البصمة هنا **مع** البند لا قبله.',
      v_added;
  end if;

  if v_gone is not null then
    raise exception
      E'(ب) 🔴 أعمدةٌ شخصيةٌ اختفت من المخطَّط — والنصّ قد يصفها:\n    · %\n\nراجِع بنود الخصوصية: ما يصف عموداً محذوفاً صار وعداً بما لا يقع.',
      v_gone;
  end if;

  if coalesce(v_deferred, 0) > 0 then
    raise notice '     ↳ (ب) 🟠 % عموداً شخصياً مؤجَّلَ الإفصاح بقرار بدر 2026-08-18 — دَينٌ مسجَّل يُسدَّد عند إعادة كتابة الخصوصية', v_deferred;
  end if;

  raise notice '✔ (ب) البصمةُ الشخصية مطابقة — لا عمودَ جمعٍ جديد بلا بند (عدا المؤجَّل المُسمّى)، ولا بندَ بلا عمود';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ج) بنيةُ الوثيقة — البنودُ التسعة القديمة قائمة، والثلاثة الجديدة معها
--
--     **علاقةٌ لا عدد**: لا نقيس «١٢ بنداً» بل «كلُّ مرساةٍ معروفةٍ قائمة،
--     ولا رقمَ بندٍ مكرَّر» — فيصمد حين يضيف المالك بنداً عاشراً بيده.
-- ----------------------------------------------------------------------------
do $$
declare
  v_bad text;
  v_n   integer;
begin
  -- (ج-١) المراسي الاثنتا عشرة قائمةٌ ومرئية
  select string_agg(x.a, '، ') into v_bad
  from (values
    ('who-we-are'), ('what-we-collect'), ('why-we-collect'), ('who-sees-it'),
    ('retention'), ('security'), ('your-rights'), ('cookies'),
    ('children-and-updates'), ('loyalty-data'), ('our-logs'), ('partner-data')
  ) x(a)
  where not exists (
    select 1 from public.sections s
    join public.pages p on p.id = s.page_id
    where p.slug = 'privacy' and p.published and s.visible and s.type = 'clause'
      and s.content ->> 'anchor' = x.a);
  if v_bad is not null then
    raise exception
      '(ج-١) 🔴 مرساةُ بندٍ اختفت — والروابطُ المُرسَلة إليها تفتح أول الصفحة بلا ٤٠٤: %',
      v_bad;
  end if;

  -- (ج-٢) لا رقمَ بندٍ مكرَّر — فهرسُ الصفحة يُبنى منها
  select string_agg(t.num, '، ') into v_bad
  from (
    select s.content ->> 'num' as num, count(*) as n
    from public.sections s
    join public.pages p on p.id = s.page_id
    where p.slug = 'privacy' and p.published and s.visible and s.type = 'clause'
      and nullif(btrim(coalesce(s.content ->> 'num', '')), '') is not null
    group by 1 having count(*) > 1) t;
  if v_bad is not null then
    raise exception '(ج-٢) رقمُ بندٍ مكرَّر في صفحة الخصوصية — %', v_bad;
  end if;

  -- (ج-٣) كلُّ عنصر جدولٍ يحمل `_k` — وإلا يُيتَّم مفتاحُ ترجمته عند أول تحرير
  select count(*) into v_n
  from public.sections s
  join public.pages p on p.id = s.page_id
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(s.content -> 'items') = 'array'
         then s.content -> 'items' else '[]'::jsonb end) x
  where p.slug = 'privacy' and p.published and s.visible
    and nullif(btrim(coalesce(x ->> '_k', '')), '') is null;
  if v_n <> 0 then
    raise exception '(ج-٣) 🔴 % عنصرَ جدولٍ بلا `_k` — ترجمتُه تُيتَّم صامتةً', v_n;
  end if;

  raise notice '✔ (ج) الوثيقةُ سليمة: ١٢ مرساةً قائمة · لا رقمَ مكرَّر · كلُّ عنصرٍ بمفتاحه';
end;
$$;

-- ----------------------------------------------------------------------------
-- (د) D-60 — لا لقطةٌ حيّةٌ تُسقط بنداً من الصفحة
--
--     لقطةٌ `draft`/`published` تنقص قسماً تمحوه عند أول `publish_page_revision`.
--     والمؤرشفة **خارج الفحص**: هي الماضي، وليس من شأنها أن تطابق الحاضر.
-- ----------------------------------------------------------------------------
do $$
declare
  v_bad text;
begin
  select string_agg(distinct r.id::text, '، ') into v_bad
  from public.page_revisions r
  join public.pages p on p.id = r.page_id
  join public.sections s on s.page_id = r.page_id and s.visible
  where p.slug = 'privacy'
    and r.status in ('draft', 'published')
    and jsonb_typeof(r.snapshot -> 'sections') = 'array'
    and not exists (
      select 1 from jsonb_array_elements(r.snapshot -> 'sections') e
      where e ->> 'id' = s.id::text);

  if v_bad is not null then
    raise exception
      '(د) 🔴 لقطةٌ حيّةٌ لصفحة الخصوصية تُسقط قسماً قائماً — أول نشرةٍ تمحوه: %', v_bad;
  end if;

  raise notice '✔ (د) D-60: لا لقطةَ نشرٍ تُسقط بنداً من الخصوصية';
end;
$$;

-- ----------------------------------------------------------------------------
-- (هـ) اللغة — الإنجليزيةُ لا تَعِد بأكثرَ ولا بأقلَّ من العربية
--
--     ‏`0111` وُلدت من هذا بالضبط: أصلٌ عربيٌّ صُحِّح، وصفٌّ إنجليزيٌّ **منشور**
--     بقي على الوعد القديم. فالفحصُ هنا: **لا صفَّ إنجليزيٍّ منشورٍ قديم على
--     مفاتيح صفحة الخصوصية**. والمسوّدة لا تُصيَّر فلا تُحاسَب.
-- ----------------------------------------------------------------------------
do $$
declare
  v_bad text;
  v_n   integer;
begin
  select string_agg(tr.key, E'\n    · '), count(*)
    into v_bad, v_n
  from public.translations tr
  join public.i18n_corpus_rows() c on c.ns = tr.namespace and c.k = tr.key
  where tr.locale <> 'ar'
    and tr.status = 'published'
    and tr.source_hash is distinct from public.i18n_source_hash(c.src)
    and split_part(tr.key, '.', 1) in (
      select s.id::text
      from public.sections s
      join public.pages p on p.id = s.page_id
      where p.slug = 'privacy' and p.published and s.visible);

  if v_bad is not null then
    raise exception
      E'(هـ) 🔴 % صفَّ ترجمةٍ **منشور** على صفحة الخصوصية صار قديماً — الزائر الأجنبيّ يقرأ وعداً أبطلته العربية:\n    · %\n\nالعلاج: /admin/languages/en ← مرشّح «قديم» ⇒ اعتمد وانشر (نفس علّة 0111).',
      v_n, v_bad;
  end if;

  raise notice '✔ (هـ) لا ترجمةَ منشورةٍ قديمةٍ على صفحة الخصوصية';
end;
$$;

-- ----------------------------------------------------------------------------
-- ⚠ **`raise notice` لا `select`** — `scripts/db-test.mjs` يطبع أحداث `notice`
--    وحدها، فمجموعةٌ تنتهي بـ`select` تمرّ خضراء ولا تطبع «ALL PASSED» إطلاقاً.
-- ----------------------------------------------------------------------------
do $$
begin
  raise notice 'ALL PASSED — الخصوصية تصف ما يجري: جردٌ مقيسٌ في الاتجاهين · بصمةُ ٦٠ عموداً · ١٢ مرساةً · D-60 · ولا ترجمةَ منشورةٍ قديمة';
end;
$$;
