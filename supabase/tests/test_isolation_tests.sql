-- ============================================================================
-- test_isolation_tests.sql — لا مجموعةَ اختبارٍ تُبرِق إلى هاتف المالك
--                             (الجبهة ج — إصلاحٌ في `scripts/db-test.mjs`)
--
-- كيف تشغّله: `pnpm db:test test_isolation`
-- النجاح = آخر سطر «ALL PASSED».
--
-- ══════════════════════════════════════════════════════════════════════════
--  🔴 ما يحرسه هذا الملف: **إشعارُ حجزٍ وهميٍّ يصل إلى إنسانٍ حقيقي**
-- ══════════════════════════════════════════════════════════════════════════
--
-- المقيس حول جولةِ `db:test` واحدة (2026-08-18T02:21→02:22Z):
--
--     notifications      ١٥٩٩ ⇐ ١٦١٠      (+١١)
--     «تليجرام sent»      ٧٥٠ ⇐ ٧٦١       (+١١)
--     delivered_at = 02:22:04Z · attempts = 1
--     channel_outcomes = [{dashboard: sent}, {telegram: sent}]
--     أسماءُ الحمولة: CUSTOMER_TESTS · DISCOUNT_TESTS_FIXTURE-1/2/3
--                     PHONE_TESTS_FIXTURE-C/D1/D2/D3/E1/E2
--
-- أي أن **أحد عشر إشعارَ حجزٍ وهميّ وصلت فعلاً إلى محادثة تليجرام المالك**،
-- ومعها ١٥٦٣ صفَّ فيكسترة متراكمة في سجلّ إشعاراته الحيّ.
--
-- ── الآليّة، بالحلقة كاملةً لا بالعرَض ─────────────────────────────────────
--
--   ١) مجموعةٌ تُدرج صفاً في `public.bookings` (فيكسترة بأسماء وهمية).
--   ٢) المُشغّل `bookings_log_insert` ⇒ `log_booking_change()` ⇒
--      `queue_notification('booking_created', …)` — **بلا علمٍ بأن المُدرِج
--      اختبار**. وهذا هو عنقُ الزجاجة الوحيد لكل إشعارات النظام.
--   ٣) `notification_channels_for('ops', null)` تُرجع اليومَ
--      `{dashboard, telegram}` (مقيسة) ⇒ الصفُّ يُولد بقناةٍ خارجية.
--   ٤) الملفُّ **يُكمَّ** (‏`client.query(fileSql)` كانت معاملةً ضمنية تنتهي
--      بـCOMMIT)، فيصير الصفُّ مرئياً لكل وصلةٍ أخرى.
--   ٥) وعاملُ الإشعارات المجدول **كل دقيقة** على الإنتاج يطالب به ويرسله.
--
-- ── ولذلك العلاجُ في الحلقة (٤) لا في المجموعات ────────────────────────────
--
-- 🔴 **لا يُصلَح هذا مجموعةً مجموعة.** جُرِّب قبلاً وعاد. وكلُّ علاجٍ يعتمد على
-- «أن يتذكّر كاتبُ الاختبار القادم» يعود في أول ملفٍّ جديد. والعلاج المختار:
--
--   **`scripts/db-test.mjs` يفتح `BEGIN` قبل كل ملف ويُنهيه بـ`ROLLBACK` دائماً.**
--
-- فما تكتبه أيُّ مجموعة **لا يُكمّ أبداً**، فلا وصلةَ أخرى تراه، فلا عاملَ
-- يطالب به. والضمانةُ **بنيوية**: لا تعتمد على اسمٍ في حمولة، ولا على علَمٍ
-- يضبطه المؤلّف، ولا على شكلِ صفٍّ يُخمَّن.
--
-- وقد وُزنت البدائل ورُفضت بسببٍ مقيس:
--   • **مُشغّلٌ على `notifications` يجرّد القنوات في «وضع الاختبار»**: يكسر
--     `partner_alert_tests` الذي يؤكّد صراحةً
--     `n.channels is distinct from public.notification_channels()` (السطر ٤٣٩)
--     — أي أنه يقيس القنوات المحسوبة نفسها.
--   • **حارسٌ يرفض «صفاً شكلُه فيكسترة»**: تخمينٌ على الحمولة، يسقط على أول
--     اسمٍ واقعيّ في اختبار، ويمرّ على أول اسمٍ وهميٍّ في حجزٍ حقيقي.
--   • **علَمُ وضعٍ يحترمه المرسِل**: يعتمد على مَن يضبطه — وهو المُشغّل نفسه،
--     فلا يضيف طبقةً مستقلّة.
--
-- ومعه **طبقةٌ ثانية مستقلّة في المُشغّل**: بصمةٌ من **وصلةٍ منفصلة** قبل
-- الجولة وبعدها (`notifications` · `bookings` · `audit_log` · `ledger_entries`
-- · `loyalty_entries` · `translations` · `locales` · حالةُ مزوّدات الدفع)،
-- **والجولةُ تحمرّ إن تحرّك رقمٌ واحد**. فالمنعُ يمنع، والكشفُ يشهد إن عُطّل
-- المنع — وهو بعينه ما كان يمسك بقاءَ مزوّد `test` مُشعَلاً يوماً كاملاً بينما
-- كل جولةٍ خضراء.
--
-- ── ما يقيسه هذا الملف، وما لا يقيسه ───────────────────────────────────────
--
-- 🔒 يُقاس هنا: **عقدُ المُشغّل** (٠) · و**أن مسار التسريب حيٌّ فعلاً** (أ) ·
--    و**أن حجزَ فيكسترةٍ واحداً يُولّد صفَّ إشعارٍ بقناةٍ خارجية** (ب) —
--    أي أن (٠) ليست شكليةً بل هي الحاجزُ الوحيد القائم.
-- ⚠ ولا يُقاس هنا: **أن العامل لم يرسل**. الإرسالُ يقع في TypeScript على
--    وصلةٍ أخرى وفي عمليةٍ أخرى، ولا سبيل إلى قياسه من داخل SQL. والذي يقيسه
--    هو **بوّابةُ التسرّب في `scripts/db-test.mjs`**: صفر صفٍّ جديدٍ في
--    `notifications` بعد الجولة كلِّها، من وصلةٍ لم تدخل معاملةَ أيّ ملف.
--
-- ── 🔬 وما يجب أن تُسقطه هذه المجموعة ──────────────────────────────────────
--
--   | الطفرة | التأكيد الذي يجب أن يسقط |
--   |---|---|
--   | مُشغّلٌ يُكمّ الملفّات (السلوك القديم حرفياً) | (٠) `tours.test_tx` غائب |
--   | إزالةُ `telegram` من قنوات التشغيل | (أ) — والفحصُ يصير بلا موضوع، فيُعلَن لا يُخفى |
--   | مُشغّلُ حجزٍ لم يعد يُنشئ إشعاراً | (ب) صفر صفّ |
--
-- المرجع: `scripts/db-test.mjs` · 0099 (المطالبة الذرّية) · 0007/0077 (الطابور)
--         · `lib/notifications/dispatch.ts` · D-48
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (٠) 🔴 عقدُ المُشغّل — الحاجزُ نفسه، ويُفحص قبل أيّ كتابة
-- ----------------------------------------------------------------------------
do $$
declare
  v_missing text;
begin
  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claims', '', false);

  if current_setting('tours.test_tx', true) is distinct from 'rollback' then
    raise exception
      '🔴 (٠) هذه الجلسة **ليست** داخل معاملةٍ تُرجَع: `tours.test_tx` غير مضبوط. وكلُّ ما تكتبه مجموعةُ اختبارٍ هنا يُكمّ فيراه عاملُ الإشعارات المجدول ⇒ إشعارُ حجزٍ وهميّ إلى هاتف المالك (‏١١ رسالة في جولةٍ واحدة، مقيسة). شغّل عبر `pnpm db:test` وحده.';
  end if;

  select string_agg(f, '، ') into v_missing
  from (values ('public.queue_notification(text, jsonb)'),
               ('public.notification_channels_for(text, uuid)'),
               ('public.claim_notifications(integer, interval, integer)')) x(f)
  where to_regprocedure(x.f) is null;
  if v_missing is not null then
    raise exception 'شرط مسبق: دوال مفقودة: %', v_missing;
  end if;

  raise notice '✔ (٠) عقدُ المُشغّل قائم: معاملةٌ مفتوحةٌ تُرجَع، فلا كتابةَ تُكمّ';
end;
$$;

-- ----------------------------------------------------------------------------
-- (أ) ومسارُ التسريب حيٌّ اليوم — فـ(٠) ليست احتياطاً نظرياً
-- ----------------------------------------------------------------------------
do $$
declare
  v_ch  text[];
  v_ext text[];
  v_tg  text;
begin
  v_ch  := public.notification_channels_for('ops', null);
  v_ext := array(select unnest(v_ch) except select unnest(array['dashboard', 'inbox']));

  if array_length(v_ext, 1) is null then
    raise notice
      '⚠ (أ) قنواتُ التشغيل اليوم % — بلا قناةٍ خارجية. فلا يصل شيءٌ إلى إنسانٍ **الآن**، والحاجزُ في (٠) يبقى لأن الإعداد يُشعَل بضغطة.',
      v_ch::text;
  else
    select nullif(btrim(coalesce(s.value ->> 'telegramChatId', '')), '')
      into v_tg
    from public.site_settings s where s.key = 'notifications';

    raise notice
      '🔴 (أ) قنواتُ التشغيل % — والقناةُ الخارجية % مضبوطةٌ على محادثةٍ حقيقية (%). فأيُّ صفِّ إشعارٍ يُكمّ يصل إلى هاتف.',
      v_ch::text, v_ext::text, coalesce(v_tg, '(غير مضبوطة)');
  end if;

  raise notice '✔ (أ) مسارُ التسريب مقيسٌ لا مفترَض';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ب) 🔴 حجزُ فيكسترةٍ واحد ⇒ صفُّ إشعارٍ بقناةٍ خارجية، جاهزٌ للمطالبة
--     (بنفس شكل `customer_tests` حرفياً: إدراجٌ مباشرٌ في `bookings`)
-- ----------------------------------------------------------------------------
do $$
declare
  v_base  bigint;
  v_bid   uuid;
  v_row   record;
  v_ext   integer;
  v_after bigint;
begin
  select count(*) into v_base from public.notifications;

  insert into public.bookings (reference, public_token, status, class_slug, class_title,
                               total, currency, plan, amount_due, amount_remaining,
                               customer_name, customer_phone, trip)
  values ('TR-ZZISO1', repeat('z', 48), 'pending_payment', 'zz-iso-sedan', 'ZZ_ISOLATION فئة',
          1000, 'EGP', 'full', 1000, 0, 'ZZ_ISOLATION عميل', '01000000009',
          jsonb_build_object('originLabel', 'ZZ_ISOLATION مبدأ',
                             'destLabel',   'ZZ_ISOLATION منتهى',
                             'passengers',  1,
                             'notes',       'ZZ_ISOLATION_FIXTURE',
                             'pickupAt',    (now() + interval '2 days')::text))
  returning id into v_bid;

  select n.status, n.channels, n.claimed_at, n.recipient_kind, n.payload ->> 'reference' as ref
    into v_row
  from public.notifications n
  where n.payload ->> 'bookingId' = v_bid::text
    and n.event = 'booking_created';

  if not found then
    raise exception
      '(ب-١) إدراجُ حجزٍ لم يُنتج صفَّ إشعار — إمّا أن `bookings_log_insert` سقط، وإمّا أن هذا الملفَّ لم يعد يقيس ما كُتب لأجله';
  end if;

  if v_row.status <> 'queued' or v_row.claimed_at is not null then
    raise exception
      '(ب-٢) الصفُّ وُلد بحالة «%» وclaimed_at=% — والمقيس أن الفيكسترة تولد `queued` بلا مطالِب، أي **جاهزةً للإرسال**',
      v_row.status, coalesce(v_row.claimed_at::text, 'null');
  end if;

  select count(*)::integer into v_ext
  from unnest(v_row.channels) c where c not in ('dashboard', 'inbox');

  raise notice
    '🔴 (ب) حجزُ فيكسترةٍ واحد ⇒ صفُّ إشعار «%» بالحالة `queued` وبالقنوات % (منها % خارجية) — وهذا بعينه الصفُّ الذي أُبرق ١١ مرةً. ولا يمنعه اليومَ إلا أن هذه المعاملة ستُرجَع.',
    v_row.ref, v_row.channels::text, v_ext;

  -- (ب-٣) وشرطُ المطالبة يصدُق عليه حرفياً — لا نداءَ لـ`claim_notifications`
  --       هنا بقصد: نداؤها يمسّ **كلَّ** صفٍّ `queued` في الطابور بما فيه صفٌّ
  --       لعميلٍ حقيقيٍّ حجز في هذه الثانية، فتُبدَّل حالتُه داخل معاملتنا.
  if not (v_row.status = 'queued' and v_row.claimed_at is null) then
    raise exception '(ب-٣) شرطُ `claim_notifications` لا يصدُق — الفحصُ فقد موضوعه';
  end if;

  -- (ب-٤) ولا شيء غيره: صفٌّ واحدٌ لا أكثر
  select count(*) into v_after from public.notifications;
  if v_after <> v_base + 1 then
    raise exception '(ب-٤) الفيكسترة أنتجت % صفَّ إشعارٍ لا واحداً', v_after - v_base;
  end if;

  raise notice '✔ (ب) الحلقةُ مُعادةٌ كاملةً داخل معاملةٍ تُرجَع: حجز ⇒ مُشغّل ⇒ طابور ⇒ قناةٌ خارجية';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ج) والمتراكمُ في سجلّ المالك يُعلَن في كل جولة — لا يُخفى في تقرير
--
-- «يتيم» = صفُّ إشعارٍ حمولتُه تشير إلى حجزٍ **لم يعد موجوداً**. ومجموعاتُ
-- الاختبار تحذف حجوزَها في تنظيفها ولا تحذف إشعاراتها (لا مفتاحَ أجنبيَّ
-- يربطهما)، فاليُتم هو **أثرُ الفيكسترة الوحيد الموثوق**.
-- ----------------------------------------------------------------------------
do $$
declare
  v_total  bigint;
  v_orphan bigint;
begin
  select count(*) into v_total from public.notifications;

  select count(*) into v_orphan
  from public.notifications n
  where n.payload ->> 'bookingId' ~ '^[0-9a-fA-F-]{36}$'
    and not exists (
      select 1 from public.bookings b where b.id = (n.payload ->> 'bookingId')::uuid);

  raise notice
    '📊 (ج) سجلُّ الإشعارات: % صفاً، منها % يتيمٌ (حجزُه غير موجود) = أثرُ فيكسترة. والتنظيفُ سكربتٌ بيد المالك: `node scripts/notification-fixture-cleanup.mjs` (‏جافٌّ بالافتراض).',
    v_total, v_orphan;

  if v_orphan > v_total then
    raise exception '(ج) عدُّ اليتيم أكبر من المجموع — الاستعلامُ مكسور';
  end if;

  raise notice '✔ (ج) المتراكمُ معدودٌ ومُعلَن — ولا يُحذف منه صفٌّ بلا كلمة المالك';
end;
$$;

-- ----------------------------------------------------------------------------
-- (د) صفرُ أثرٍ من هذا الملف نفسه — بلقطةٍ لا بالثقة
-- ----------------------------------------------------------------------------
do $$
declare
  v_n integer;
begin
  -- الفيكسترة تبقى داخل المعاملة ويمحوها ROLLBACK. وما يُثبَت هنا: أنها
  -- **صفٌّ واحدٌ معروفُ الاسم**، لا سلسلةُ صفوفٍ لا يعرف الملفُّ عددها.
  select count(*)::integer into v_n
  from public.bookings where reference = 'TR-ZZISO1';
  if v_n <> 1 then
    raise exception '(د) حجوزُ الفيكسترة % لا واحداً', v_n;
  end if;

  select count(*)::integer into v_n
  from public.notifications where payload ->> 'reference' = 'TR-ZZISO1';
  if v_n <> 1 then
    raise exception '(د) إشعاراتُ الفيكسترة % لا واحداً', v_n;
  end if;

  raise notice '✔ (د) أثرُ هذا الملف صفٌّ واحدٌ في كلٍّ من الجدولين، ويمحوهما ROLLBACK المُشغّل';
  raise notice 'ALL PASSED — لا مجموعةَ اختبارٍ تُكمّ صفاً، فلا صفَّ يبلغ عاملَ الإشعارات، فلا رسالةَ تبلغ هاتفاً';
end;
$$;
