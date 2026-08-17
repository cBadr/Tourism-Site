-- ============================================================================
-- notify_claim_tests.sql — اختبارات قبول للمطالبة الذرّية بطابور الإشعارات (0099)
--
-- كيف تشغّله: `pnpm db:test notify_claim` أو الصق الملف كاملاً في SQL Editor.
-- النجاح = آخر سطر «ALL PASSED». وأي فشل exception عربية فيها المتوقع والفعلي.
--
-- ══════════════════════════════════════════════════════════════════════════
--  🔴 ما يحرسه هذا الملف: **إرسالٌ حقيقيٌّ مكرَّر إلى إنسان**
-- ══════════════════════════════════════════════════════════════════════════
--
-- `trip_offered` يذهب إلى محادثة تليجرام متعهدٍ حقيقي. وعرضُ رحلةٍ يصل مرتين
-- **لا يُستدعى ولا يُصحَّح**: قرأه إنسانٌ وانتهى. وكان ممكناً بالقياس:
--
--     الوصلة A رأت 3 من صفوفي: [1,2,3]
--     الوصلة B رأت 3 من صفوفي: [1,2,3]     ← نفس القراءة، نفس اللحظة
--     وبعد أن كتبت الاثنتان: status=sent · attempts=**1**
--
-- أي أن التكرار **لا أثر له في السجل**: كلٌّ قرأ `attempts = 0` فكتب `1`. فلا
-- عدّادٌ يكشفه ولا عمودٌ يشهد عليه — وهذا سببُ كونه في رأس قائمة الدَّين التقني.
--
-- ── وما يقيسه هذا الملف بصدق، وما لا يقيسه ──────────────────────────────────
--
-- 🔒 **يُقاس هنا: التتالي.** وهو **مسارُ الإنتاج نفسه**: العامل مجدولٌ **كل
-- دقيقة** (‏`vercel.json` · و`docs/CPANEL.md` نفس السطر لـcron النظام)، وميزانيةُ
-- دورته ٢٠ ثانية تُفحَص *قبل كل شريحة* لا داخلها، وأبطأ قناةٍ فيها ١٠ ثوانٍ. فدورةٌ
-- تتجاوز الدقيقة أمرٌ عادي، وتبدأ التالية فوقها. والتأكيد المركزي (أ-٢) هو بعينه
-- ما يسقط على كود ما قبل 0099.
--
-- ⚠ **ولا يُقاس هنا: التزامنُ بوصلتين.** الملفُّ يُنفَّذ في جلسةٍ واحدة، و`dblink`
-- غير مثبَّتة و`max_prepared_transactions = 0` على هذه القاعدة (مقيسان) — فلا
-- سبيل إلى وصلةٍ ثانية من داخل SQL. والبديلُ المرفوض: وضعُ رابط القاعدة بكلمة
-- مرورها في ملفٍّ مكموم. فالتزامن يُقاس بسكربت وصلتين خارج المجموعة، وحصيلتُه في
-- تقرير الورشة، **ويبقى القسم (ح) هنا يحرس أن البيان بقفلٍ يتخطّى المقفول**.
--
-- ── 🔬 والطفرات تُبنى وتُشغَّل — فالتأكيد الذي لا تُسقطه طفرةٌ تزيينٌ ─────────
--
--   | الطفرة | ما تمثّله من خطأٍ واقعي | التأكيد الذي يجب أن تُسقطه |
--   |---|---|---|
--   | `select` بلا حجز (كود ما قبل 0099 حرفياً) | العطب الأصلي نفسه | (أ-٢) المطالبة الثانية صفر صفاً |
--   | إيقافٌ عند السقف **بلا تصفير `claimed_at`** | «حماية» تقتل زرَّ المالك | (د-٣) الصفُّ المُعاد يُطالَب به |
--   | مطالبةٌ تتجاهل `claimed_at` وتنظر إلى الحالة وحدها | «يكفي أن الحالة queued» | (ب-١) و(أ-٢) |
--
-- ما يغطيه الملف:
--   (٠)  الشروط المسبقة · (٠-ب) خط الأساس
--   (أ)  🔴 صفٌّ يخرج من «حرّ» **مرةً واحدة**
--   (ب)  الصفُّ المحجوز يبقى `queued` فيراه المالك · والعدّاد تملكه المطالبة
--   (ج)  مهلةُ الرؤية: صفُّ عاملٍ مات يعود · وصفُّ عاملٍ حيٍّ لا يُمسّ
--   (د)  السقف يُوقف الحلقة بسببٍ مكتوب · **ولا يُوقف الإنسان**
--   (هـ) 🔴 العزل: المتعهد والزائر لا ينفّذان المطالبة (نداءٌ حيّ لا قراءةُ منح)
--   (و)  التوقيع الذي يُنادى فعلاً: نداءٌ بمعامِلٍ واحد صالح (وهو ما يُصدره العامل)
--   (ز)  الترتيب: الأقدم أولاً — فلا عرضٌ يبيت في الطابور
--   (ح)  البيان **واحد** بقفلٍ يتخطّى المقفول (فحصٌ بنيوي مُعلَنٌ بحدّه)
--   (ط)  🔬 الطفرات الثلاث تُبنى وتُشغَّل ويُثبَت أنها تُسقط تأكيداتها
--   (ي)  صفر أثر — ولا تعريفَ طفرةٍ باقٍ
--
-- ── ولماذا كلُّ القياس داخل معاملةٍ فرعية تُرجَع ─────────────────────────────
--
-- هذه **قاعدة الإنتاج نفسها**، وفيها ١٣٢٥ صفَّ تسليمٍ حقيقياً. وصفُّ إشعارٍ
-- `queued` باقٍ **يُسلَّم فعلاً** في الدورة التالية إلى محادثة المالك. ولذلك كل
-- صفوف الفيكسترة `channels = {dashboard}` وحدها: **صفر قناةٍ خارجية** مهما جرى.
--
-- المرجع: supabase/migrations/0099_notification_atomic_claim.sql · 0007 (§٢-٦)
--         · 0077 · D-48 · D-19 · D-20 · `lib/notifications/dispatch.ts`
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (٠) الشروط المسبقة — قراءةٌ محضة، ولا كتابة قبل المعاملة الفرعية
-- ----------------------------------------------------------------------------
do $$
declare
  v_missing text;
begin
  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claims', '', false);

  if to_regclass('public.notifications') is null then
    raise exception 'شرط مسبق: public.notifications غير موجود';
  end if;

  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'notifications'
       and column_name = 'claimed_at'
  ) then
    raise exception 'شرط مسبق: notifications.claimed_at مفقود — نفّذ 0099 أولاً';
  end if;

  select string_agg(x.s, '، ') into v_missing
  from (values ('public.claim_notifications(integer,interval,integer)')) as x(s)
  where to_regprocedure(x.s) is null;
  if v_missing is not null then
    raise exception 'شرط مسبق: دوالّ مفقودة (نفّذ 0099_notification_atomic_claim.sql): %', v_missing;
  end if;

  raise notice '✔ (٠) الشروط المسبقة سليمة';
end;
$$;

-- ----------------------------------------------------------------------------
-- (٠-ب) خط الأساس — تُقارَن به نهايةُ الملف
-- ----------------------------------------------------------------------------
do $$
declare
  v_n integer; v_c integer; v_q integer;
begin
  select count(*)::integer,
         count(*) filter (where claimed_at is not null)::integer,
         count(*) filter (where status = 'queued')::integer
    into v_n, v_c, v_q
  from public.notifications;

  perform set_config('tours.nc_n', v_n::text, false);
  perform set_config('tours.nc_c', v_c::text, false);
  perform set_config('tours.nc_q', v_q::text, false);

  raise notice '✔ (٠-ب) خط الأساس: % صفاً (% محجوزاً · % في الطابور)', v_n, v_c, v_q;
end;
$$;

-- ============================================================================
-- القياس الحيّ كله — داخل معاملةٍ فرعية تُرجَع بكاملها
-- ============================================================================
do $$
declare
  v_1     constant uuid := 'c0999000-0000-4000-8000-00000000001a';
  v_2     constant uuid := 'c0999000-0000-4000-8000-00000000002b';
  v_3     constant uuid := 'c0999000-0000-4000-8000-00000000003c';
  v_usr   constant uuid := 'c0999000-0000-4000-8000-00000000004d';
  v_sub   constant uuid := 'c0999000-0000-4000-8000-00000000005e';
  v_base  integer;
  v_n     integer;
  v_att   integer;
  v_st    text;
  v_err   text;
  v_first uuid;
  v_ok    boolean;
  v_role  text;
begin
  begin
    -- ══ الفيكسترة ═════════════════════════════════════════════════════════
    -- 🔒 `channels = {dashboard}` وحدها: لو التقطت دورةٌ حقيقية أحد هذه الصفوف
    --    في هذه اللحظة فلا تسليمَ خارجياً واحداً. و`read_at/dismissed_at`
    --    مضبوطتان فلا تظهر في جرس المالك أصلاً.
    select count(*)::integer into v_base from public.notifications;

    insert into public.notifications
      (id, event, payload, channels, status, attempts, recipient_kind,
       read_at, dismissed_at, created_at)
    values
      (v_1, '_nc_probe', '{}'::jsonb, array['dashboard']::text[], 'queued', 0, 'ops',
       now(), now(), now() - interval '30 seconds'),
      (v_2, '_nc_probe', '{}'::jsonb, array['dashboard']::text[], 'queued', 0, 'ops',
       now(), now(), now() - interval '20 seconds'),
      (v_3, '_nc_probe', '{}'::jsonb, array['dashboard']::text[], 'queued', 0, 'ops',
       now(), now(), now() - interval '10 seconds');

    -- ══ (أ) 🔴 صفٌّ يخرج من «حرّ» مرةً واحدة ═══════════════════════════════

    -- (أ-١) المطالبة الأولى تأخذ الثلاثة — وبلا هذا كان (أ-٢) يمرّ على لا شيء
    select count(*)::integer into v_n
    from public.claim_notifications(50) c where c.id in (v_1, v_2, v_3);
    if v_n <> 3 then
      raise exception '(أ-١) المطالبة أخذت % صفاً من ٣ — الطابور لا يُقرأ أصلاً فما بعده لا يقيس شيئاً', v_n;
    end if;

    -- (أ-٢) 🔴 **والثانية لا تأخذ شيئاً.** هذا هو التأكيد كله: كودُ ما قبل 0099
    --       (`select … where status = 'queued'`) يُرجع الثلاثة ثانيةً — فيُسلَّم
    --       العرضُ مرتين إلى متعهدٍ حقيقي. والطفرة (ط-١) تعيد ذلك السلوك حرفياً
    --       وتُثبت أن هذا السطر يمسكه.
    select count(*)::integer into v_n
    from public.claim_notifications(50) c where c.id in (v_1, v_2, v_3);
    if v_n <> 0 then
      raise exception
        '(أ-٢) 🔴 مطالبةٌ ثانية أخذت % صفاً محجوزاً — تسليمٌ حقيقيٌّ مكرَّر: عرضُ رحلةٍ يصل تليجرام متعهدٍ مرتين', v_n;
    end if;

    -- (أ-٣) ولا صفَّ ضاع: الثلاثة كلها محجوزة، فالحصر ليس بترك صفوفٍ بلا حجز
    select count(*)::integer into v_n from public.notifications
     where id in (v_1, v_2, v_3) and claimed_at is not null;
    if v_n <> 3 then
      raise exception '(أ-٣) % صفاً محجوزاً من ٣ — الحصرُ صار بإسقاط عملٍ لا بحجزه', v_n;
    end if;

    raise notice '✔ (أ) 🔴 المطالبة الأولى ٣ صفوف · والثانية **صفر** · ولا صفَّ ضائع';

    -- ══ (ب) الصفُّ المحجوز يبقى مرئياً · والعدّاد تملكه المطالبة ════════════

    -- (ب-١) الحالة `queued` كما كانت — وحالةٌ خامسة كانت ستُخفيه عن شاشة المالك
    --       وعن `getQueueStats()` (كلتاهما تعدّ أربع حالات)، فيصير عالقاً بلا شاهد
    select status, attempts into v_st, v_att from public.notifications where id = v_1;
    if v_st <> 'queued' then
      raise exception
        '(ب-١) الصفُّ المحجوز صار «%» — وحالةٌ خارج الأربع تُخفي الصفَّ العالق عن المالك وعن إحصاء الطابور', v_st;
    end if;

    -- (ب-٢) والعدّاد ارتفع **مرةً واحدة لكل مطالبة**: المطالبة تملكه، لأن محاولةً
    --       مات صاحبها قبل كتابة حصيلتها كانت ستُحسب صفراً
    if v_att <> 1 then
      raise exception '(ب-٢) العدّاد % بعد مطالبةٍ واحدة والمتوقع ١', v_att;
    end if;

    raise notice '✔ (ب) الصفُّ المحجوز يبقى queued (فيراه المالك) · والعدّاد = ١';

    -- ══ (ج) مهلةُ الرؤية — بين «عاملٍ مات» و«عاملٍ حيّ» ════════════════════

    -- (ج-١) عاملٌ **حيّ**: حجزٌ قبل ٩٠ ثانية لا يُمسّ بمهلة ٣ دقائق
    update public.notifications set claimed_at = now() - interval '90 seconds'
     where id in (v_1, v_2, v_3);
    select count(*)::integer into v_n
    from public.claim_notifications(50, interval '3 minutes') c where c.id in (v_1, v_2, v_3);
    if v_n <> 0 then
      raise exception
        '(ج-١) 🔴 صفٌّ محجوزٌ قبل ٩٠ ثانية أُخذ ثانيةً بمهلة ٣ دقائق — وهو **قيد الإرسال الآن**: نفس العيب بثوبٍ جديد';
    end if;

    -- (ج-٢) عاملٌ **مات**: بعد انقضاء المهلة يعود الصف — فلا عرضٌ محتجزٌ للأبد.
    --       (والمقايضة المرفوضة صراحةً: «أُرسل مرتين» ⇒ «لم يُرسل أبداً».)
    update public.notifications set claimed_at = now() - interval '30 minutes'
     where id in (v_1, v_2, v_3);
    select count(*)::integer into v_n
    from public.claim_notifications(50) c where c.id in (v_1, v_2, v_3);
    if v_n <> 3 then
      raise exception
        '(ج-٢) 🔴 بعد انقضاء المهلة عاد % صفاً من ٣ — عاملٌ يموت بعد الحجز يحتجز العرضَ إلى الأبد', v_n;
    end if;

    -- (ج-٣) والمهلة **معامِلٌ يعمل** لا رقمٌ مزيَّن: نفس الصفوف بمهلة ٦٠ ثانية
    update public.notifications set claimed_at = now() - interval '90 seconds'
     where id in (v_1, v_2, v_3);
    select count(*)::integer into v_n
    from public.claim_notifications(50, interval '60 seconds') c where c.id in (v_1, v_2, v_3);
    if v_n <> 3 then
      raise exception '(ج-٣) مهلةُ ٦٠ ثانية لم تُعِد الصفوف — المعامل لا يُقرأ داخل الدالة';
    end if;

    raise notice '✔ (ج) مهلةُ الرؤية: صفُّ عاملٍ حيٍّ لا يُمسّ · وصفُّ عاملٍ مات يعود · والمعامل يعمل';

    -- ══ (د) السقف يُوقف الحلقة — ولا يُوقف الإنسان ═════════════════════════

    -- (د-١) صفٌّ سُلّم فعلاً ثم فشلت كتابةُ حصيلته بدرجاتها الثلاث يبقى `queued`
    --       فيُسلَّم كل مهلةٍ إلى الأبد. فبعد السقف يُنقَل إلى `failed`
    update public.notifications set attempts = 5, claimed_at = now() - interval '30 minutes'
     where id = v_1;
    perform * from public.claim_notifications(50);
    select status, error, claimed_at is null into v_st, v_err, v_ok
    from public.notifications where id = v_1;
    if v_st <> 'failed' then
      raise exception '(د-١) صفٌّ بخمس محاولاتٍ ما زال «%» — حلقةُ تسليمٍ لا تنتهي كل ٣ دقائق', v_st;
    end if;

    -- (د-٢) وبسببٍ مكتوب: هذا العمود يقرؤه المالك في شاشته، وإيقافٌ صامت
    --       يحوّل التكرار إلى «لم يُرسل ولا أحد يعرف»
    if v_err is null or btrim(v_err) = '' then
      raise exception '(د-٢) أُوقف الصفُّ بلا سبب مكتوب — والمالك يقرأ هذا العمود';
    end if;

    -- (د-٣) 🔒 **وزرُّ المالك يبقى عاملاً**: الإيقاف يُصفّر `claimed_at`، فما
    --       يكتبه زرُّ «إعادة المحاولة» (‏`status=queued, error=null`) يجعل الصفَّ
    --       مطالَباً به فوراً رغم أن عدّاده ٥. والطفرة (ط-٢) تُسقط هذا السطر.
    if not v_ok then
      raise exception '(د-٣) claimed_at لم تُصفَّر عند الإيقاف — زرُّ إعادة المحاولة يصير زرّاً ميتاً';
    end if;
    update public.notifications set status = 'queued', error = null where id = v_1;
    select count(*)::integer into v_n
    from public.claim_notifications(50) c where c.id = v_1;
    if v_n <> 1 then
      raise exception '(د-٣) 🔴 صفٌّ أعاده المالك لم يُطالَب به — فالسقف صار يحدّ الإنسان لا الآلة';
    end if;

    -- (د-٤) والسقفُ لا يمسّ صفاً **حديث الحجز** ولو استنفد عدّاده — قد يكون
    --       قيد الإرسال في هذه اللحظة
    update public.notifications set status = 'queued', attempts = 9, claimed_at = now()
     where id = v_2;
    perform * from public.claim_notifications(50);
    select status into v_st from public.notifications where id = v_2;
    if v_st <> 'queued' then
      raise exception '(د-٤) صفٌّ محجوزٌ قبل لحظةٍ أُوقف بحجّة السقف — كُسر تسليمٌ جارٍ';
    end if;

    raise notice '✔ (د) السقف يُوقف الحلقة بسببٍ مكتوب · ويُصفّر الحجز فيبقى زرُّ المالك عاملاً · ولا يمسّ تسليماً جارياً';

    -- ══ (هـ) 🔴 العزل — بنداءٍ حيٍّ بدور المتعهد لا بقراءة منحة ════════════
    --
    -- الدالة تُرجع الصفَّ كاملاً: `payload` فيه اسم العميل وهاتفه وإجماليه.
    -- و`authenticated` تشمل **كل متعهد** (D-20)، فمنحُها إياه تسريبٌ مباشر
    -- (D-19) **وسلاحُ إسكات**: من يطالب بالصف يمنع وصولَه إلى غيره.
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                            created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
    values (v_usr, '00000000-0000-0000-0000-000000000000', 'authenticated',
            'authenticated', 'ncclaim@example.invalid', 'x', now(), now(),
            '{}'::jsonb, '{"full_name": "NC_TESTS متعهد"}'::jsonb);
    insert into public.subcontractors (id, profile_id, company_name, phone, email, status)
    values (v_sub, v_usr, 'NC_TESTS متعهد', '01000000901', 'nc@example.invalid', 'approved');

    foreach v_role in array array['authenticated', 'anon'] loop
      begin
        perform set_config('request.jwt.claims',
          json_build_object('sub', v_usr, 'role', v_role)::text, true);
        execute format('set local role %I', v_role);
        execute 'select count(*) from public.claim_notifications(50)';
        execute 'reset role';
        raise exception '(هـ) 🔴 الدور «%» نفّذ المطالبة — وهي تُرجع اسم العميل وهاتفه وإجماليه (D-19 · D-20)', v_role;
      exception
        when insufficient_privilege then
          execute 'reset role';  -- المتوقع: المنحُ هو الحارس
      end;
    end loop;
    execute 'reset role';
    perform set_config('request.jwt.claims', '', true);

    -- ولا منحةَ تنفيذٍ لأيٍّ منهما أصلاً (الحارس نفسه من زاوية الكتالوج)
    select count(*)::integer into v_n
    from (values ('anon'), ('authenticated')) r(role)
    where has_function_privilege(
      r.role, 'public.claim_notifications(integer,interval,integer)'::regprocedure, 'execute');
    if v_n <> 0 then
      raise exception '(هـ) % دورَ متصفحٍ يملك منحةَ تنفيذ المطالبة', v_n;
    end if;

    raise notice '✔ (هـ) 🔴 العزل: المتعهد والزائر لا ينفّذان المطالبة (نداءٌ حيٌّ رُفض) وصفر منحة';

    -- ══ (و) التوقيع الذي يُنادى فعلاً — لا شكلاً نكتبه بأيدينا ══════════════
    --
    -- ⚠ درسٌ مدفوع الثمن: مجموعةٌ كاملة كانت عمياء لأن كل تأكيدٍ فيها كتب
    -- `update` بيده بينما الواجهة تُصدر `insert … on conflict`. والعاملُ هنا
    -- يُصدر `rpc("claim_notifications", { p_limit })` — **معامِلٌ واحد**. فلو
    -- صار أحدُ المعامِلَين الآخرين إلزامياً لفشل النداء بـPGRST202، **ولسقط
    -- العامل صامتاً إلى القراءة القديمة بلا حجز** — أي عودةُ العيب كاملاً.
    if (select p.pronargdefaults from pg_proc p
         where p.oid = 'public.claim_notifications(integer,interval,integer)'::regprocedure) < 3 then
      raise exception
        '(و) 🔴 معامِلٌ بلا قيمةٍ افتراضية — ونداءُ العامل بمعامِلٍ واحد سيفشل، فيسقط صامتاً إلى القراءة بلا حجز';
    end if;
    -- والنداء بالشكل الذي يُصدره العامل حرفياً
    update public.notifications set status = 'queued', claimed_at = null, attempts = 0
     where id in (v_1, v_2, v_3);
    select count(*)::integer into v_n
    from public.claim_notifications(50) c where c.id in (v_1, v_2, v_3);
    if v_n <> 3 then
      raise exception '(و) نداءٌ بمعامِلٍ واحد أخذ % صفاً من ٣', v_n;
    end if;

    raise notice '✔ (و) التوقيع يقبل النداء الذي يُصدره العامل فعلاً (معامِلٌ واحد)';

    -- ══ (ز) الترتيب: الأقدم أولاً — فلا عرضٌ يبيت في الطابور ════════════════
    update public.notifications set claimed_at = null, attempts = 0, status = 'queued'
     where id in (v_1, v_2, v_3);
    select c.id into v_first from public.claim_notifications(1) c;
    if v_first is distinct from v_1 then
      raise exception '(ز) المطالبة بحدٍّ ١ أخذت % لا الأقدم — الترتيب ساقط فيبيت أقدمُ عرضٍ في الطابور', coalesce(v_first::text, '∅');
    end if;
    raise notice '✔ (ز) الأقدم أولاً حتى مع حدٍّ ضيّق';

    -- ══ (ح) البيان **واحد** بقفلٍ يتخطّى المقفول ═══════════════════════════
    --
    -- فحصٌ بنيوي، ومُعلَنٌ بحدّه: التزامنُ الحقيقي لا يُقاس في جلسةٍ واحدة
    -- (‏`dblink` غير مثبَّتة · `max_prepared_transactions = 0`). وهذا يمسك أن
    -- يُعاد كتابةُ المطالبة بـ`select` ثم `update` منفصلين — وهي أول ما يخطر.
    if pg_get_functiondef('public.claim_notifications(integer,interval,integer)'::regprocedure)
       not ilike '%for update skip locked%' then
      raise exception
        '(ح) تعريف المطالبة بلا FOR UPDATE SKIP LOCKED — فالخاسر إمّا ينتظر وإمّا يُكرّر';
    end if;
    raise notice '✔ (ح) التعريف يحمل FOR UPDATE SKIP LOCKED';

    -- ══ (ط) 🔬 الطفرات — تُبنى وتُشغَّل ويُثبَت أنها تُسقط تأكيداتها ═══════
    --
    -- والـDDL معاملاتيٌّ في Postgres، فتعريفُ الطفرة يرجع مع إرجاع المعاملة
    -- الفرعية — ويتأكد القسم (ي) من رجوعه فعلاً لا من النية.

    -- ── (ط-١) طفرة «قراءةٌ بلا حجز» = كود ما قبل 0099 حرفياً ⇒ تُسقط (أ-٢)
    execute $mut$
      create or replace function public.claim_notifications(
        p_limit integer default 50,
        p_visible_timeout interval default interval '3 minutes',
        p_max_attempts integer default 5)
      returns setof public.notifications
      language sql volatile security invoker set search_path = ''
      as $body$
        select n.* from public.notifications n
         where n.status = 'queued'
         order by n.created_at asc
         limit coalesce(p_limit, 50);
      $body$;
    $mut$;

    update public.notifications set status = 'queued', claimed_at = null, attempts = 0
     where id in (v_1, v_2, v_3);
    execute 'select count(*) from public.claim_notifications(50) c where c.id = any($1)'
      into v_n using array[v_1, v_2, v_3];
    if v_n <> 3 then
      raise exception '(ط-١) 🔬 الطفرة لم تُرجع الصفوف — فالقياس نفسه معطوب لا التأكيد';
    end if;
    -- ⬅ وهنا يُثبت أن (أ-٢) حيّ: **نفس النداء مرتين** يُرجع الثلاثة مرتين
    execute 'select count(*) from public.claim_notifications(50) c where c.id = any($1)'
      into v_n using array[v_1, v_2, v_3];
    if v_n <> 3 then
      raise exception
        '(ط-١) 🔬 قراءةٌ بلا حجز نُوديت مرتين فأعادت % لا ٣ — فتأكيد (أ-٢) لا يقيس الحجز بل شيئاً آخر', v_n;
    end if;
    raise notice '✔ (ط-١) 🔬 طفرة «قراءةٌ بلا حجز» أعادت الصفوف الثلاثة مرتين — فـ(أ-٢) حيٌّ ويمسك العطب الأصلي';

    -- ── (ط-٢) طفرة «إيقافٌ بلا تصفير claimed_at» ⇒ تُسقط (د-٣)
    execute $mut$
      create or replace function public.claim_notifications(
        p_limit integer default 50,
        p_visible_timeout interval default interval '3 minutes',
        p_max_attempts integer default 5)
      returns setof public.notifications
      language plpgsql volatile security invoker set search_path = ''
      as $body$
      declare
        v_max integer := greatest(coalesce(p_max_attempts, 5), 1);
      begin
        update public.notifications n set status = 'failed', error = 'أُوقف'
         where n.status = 'queued' and n.attempts >= v_max
           and n.claimed_at is not null
           and n.claimed_at < now() - coalesce(p_visible_timeout, interval '3 minutes');
        return query
          with candidate as (
            select c.id from public.notifications c
             where c.status = 'queued'
               and (c.claimed_at is null or c.claimed_at < now() - coalesce(p_visible_timeout, interval '3 minutes'))
               and (c.claimed_at is null or c.attempts < v_max)
             order by c.created_at asc limit coalesce(p_limit, 50)
             for update skip locked
          ), claimed as (
            update public.notifications n set claimed_at = now(), attempts = n.attempts + 1
              from candidate k where n.id = k.id returning n.*
          )
          select * from claimed;
      end;
      $body$;
    $mut$;

    update public.notifications
       set status = 'queued', attempts = 5, claimed_at = now() - interval '30 minutes', error = null
     where id = v_1;
    execute 'select count(*) from public.claim_notifications(50)' into v_n;
    select status, claimed_at is null into v_st, v_ok
    from public.notifications where id = v_1;
    if v_st <> 'failed' then
      raise exception '(ط-٢) 🔬 الطفرة لم تُوقف الصف — فالقياس معطوب';
    end if;
    if v_ok then
      raise exception '(ط-٢) 🔬 الطفرة صفّرت claimed_at — فهي ليست الطفرة المقصودة';
    end if;
    -- ⬅ وهنا يُثبت أن (د-٣) حيّ: نفس ما يكتبه زرُّ المالك، والصفُّ لا يُطالَب به
    update public.notifications set status = 'queued', error = null where id = v_1;
    execute 'select count(*) from public.claim_notifications(50) c where c.id = $1'
      into v_n using v_1;
    if v_n <> 0 then
      raise exception
        '(ط-٢) 🔬 الصفُّ المُعاد أُخذ رغم أن الطفرة لم تُصفّر الحجز — فتأكيد (د-٣) لا يقيس التصفير';
    end if;
    raise notice '✔ (ط-٢) 🔬 طفرة «إيقافٌ بلا تصفير» جعلت زرَّ المالك ميتاً — فـ(د-٣) حيّ';

    -- ── (ط-٣) طفرة «تتجاهل claimed_at وتنظر إلى الحالة وحدها» ⇒ تُسقط (أ-٢)
    --    وهي الخطأ الأرجح عند من يضيف العمود ولا يُصفّي عليه
    execute $mut$
      create or replace function public.claim_notifications(
        p_limit integer default 50,
        p_visible_timeout interval default interval '3 minutes',
        p_max_attempts integer default 5)
      returns setof public.notifications
      language plpgsql volatile security invoker set search_path = ''
      as $body$
      begin
        return query
          with candidate as (
            select c.id from public.notifications c
             where c.status = 'queued'
             order by c.created_at asc limit coalesce(p_limit, 50)
             for update skip locked
          ), claimed as (
            update public.notifications n set claimed_at = now(), attempts = n.attempts + 1
              from candidate k where n.id = k.id returning n.*
          )
          select * from claimed;
      end;
      $body$;
    $mut$;

    update public.notifications set status = 'queued', claimed_at = null, attempts = 0
     where id in (v_1, v_2, v_3);
    execute 'select count(*) from public.claim_notifications(50) c where c.id = any($1)'
      into v_n using array[v_1, v_2, v_3];
    execute 'select count(*) from public.claim_notifications(50) c where c.id = any($1)'
      into v_n using array[v_1, v_2, v_3];
    if v_n <> 3 then
      raise exception
        '(ط-٣) 🔬 مطالبةٌ تتجاهل claimed_at نُوديت مرتين فأعادت % لا ٣ — فالقفل وحده كان سيكفي، وليس كذلك بين دورتين متتاليتين', v_n;
    end if;
    raise notice '✔ (ط-٣) 🔬 طفرة «SKIP LOCKED وحده بلا claimed_at» كرَّرت الصفوف بين نداءَين — فالحاجزان معاً ضرورةٌ لا احتياط';

    raise exception 'NOTIFY_CLAIM_TESTS_ROLLBACK';
  exception
    when others then
      begin
        execute 'reset role';
      exception when others then null;
      end;
      if sqlerrm <> 'NOTIFY_CLAIM_TESTS_ROLLBACK' then raise; end if;
  end;

  raise notice '✔ القياس الحيّ اكتمل وأُرجعت المعاملة الفرعية';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ي) 🔒 لم يبقَ أثر — وهذه **قاعدة الإنتاج نفسها**
--
-- وهنا يُتحقق كذلك من **رجوع تعريف الدالة**: طفرةٌ باقيةٌ تعني قاعدةَ إنتاجٍ
-- تُسلّم كل عرضٍ مرتين — أي أن الملفَّ نفسه صار العطب.
-- ----------------------------------------------------------------------------
do $$
declare
  v_n  integer; v_c integer; v_q integer;
  v_bn integer := current_setting('tours.nc_n')::integer;
  v_bc integer := current_setting('tours.nc_c')::integer;
  v_bq integer := current_setting('tours.nc_q')::integer;
  v_def text;
begin
  select count(*)::integer,
         count(*) filter (where claimed_at is not null)::integer,
         count(*) filter (where status = 'queued')::integer
    into v_n, v_c, v_q
  from public.notifications;

  if v_n <> v_bn then
    raise exception 'تنظيف ناقص: الإشعارات % والأساس % — صفٌّ باقٍ يُسلَّم فعلاً في الدورة التالية', v_n, v_bn;
  end if;
  if v_c <> v_bc then
    raise exception 'تنظيف ناقص: المحجوز % والأساس % — حجزٌ باقٍ يؤجّل إشعاراً حقيقياً ٣ دقائق', v_c, v_bc;
  end if;
  if v_q <> v_bq then
    raise exception 'تنظيف ناقص: الطابور % والأساس %', v_q, v_bq;
  end if;

  -- 🔴 وتعريفُ الدالة رجع: لا طفرةَ باقية
  v_def := pg_get_functiondef('public.claim_notifications(integer,interval,integer)'::regprocedure);
  if v_def not ilike '%for update skip locked%' then
    raise exception '🔴 تنظيف ناقص: تعريفُ المطالبة ما زال طفرةً — قاعدةُ الإنتاج تُسلّم كل عرضٍ مرتين';
  end if;
  if v_def not ilike '%محاولةِ إرسالٍ بلا حصيلةٍ مكتوبة%' then
    raise exception '🔴 تنظيف ناقص: تعريفُ المطالبة بلا نصِّ الإيقاف — طفرةٌ لم تُرجَع بالكامل';
  end if;
  if not exists (
    select 1 from information_schema.role_table_grants
     where table_schema = 'public' and table_name = 'notifications'
       and grantee = 'service_role' and privilege_type = 'UPDATE'
  ) then
    raise exception '🔴 منحةُ التحديث لـservice_role سقطت — العامل لا يكتب حصيلة';
  end if;

  /**
   * 🔴 والوجهُ الآخر للعزل — أضافته المراجعة العدائية 2026-08-17.
   *
   * القسم (هـ) يُثبت أن **لا أحد زائد** يملك التنفيذ، ولم يكن أحدٌ يُثبت أن
   * **الدور المطلوب** يملكه. وقِيس ذلك بطفرةٍ حقيقية: `revoke execute … from
   * service_role` ⇒ **المجموعة تطبع ALL PASSED كما هي**، بينما العامل في الإنتاج
   * يعود بـ42501 — وهو ليس «الدالة مفقودة» فلا يسقط إلى مسار التراجع، بل
   * `read-failed` و٥٠٣: **صفر إشعارٍ يُسلَّم إلى الأبد وبوابةٌ خضراء تشهد بالسلامة**.
   */
  if not has_function_privilege(
       'service_role',
       'public.claim_notifications(integer,interval,integer)'::regprocedure, 'execute') then
    raise exception
      '🔴 service_role لا يملك تنفيذ المطالبة — العامل يعود بـ42501 (لا 42883) فلا يسقط إلى التراجع: صفر إشعارٍ يُسلَّم';
  end if;

  raise notice 'ALL PASSED — 🔴 صفُّ الإشعار يخرج من «حرّ» **مرةً واحدة** (المطالبة الثانية صفر صفاً، وطفرةُ «القراءة بلا حجز» أعادته مرتين فأثبتت أن التأكيد حيّ) · وحالته تبقى queued فلا يختفي عن شاشة المالك · ومهلةُ الرؤية ٣ دقائق تُعيد صفَّ عاملٍ مات ولا تلمس صفَّ عاملٍ حيّ ولا تسليماً جارياً · وسقفُ ٥ محاولات يُوقف الحلقة بسببٍ مكتوب **ويُصفّر الحجز فيبقى زرُّ المالك عاملاً** (وطفرةُ «الإيقاف بلا تصفير» أثبتت ذلك) · والحاجزان (SKIP LOCKED + claimed_at) ضرورةٌ لا احتياط (طفرةُ الثالثة كرَّرت بينهما) · والأقدم أولاً · والمتعهد والزائر لا ينفّذان المطالبة بنداءٍ حيّ · والتوقيع يقبل نداء العامل بمعامِلٍ واحد · وصفر أثر وتعريفٌ رجع';
end;
$$;
