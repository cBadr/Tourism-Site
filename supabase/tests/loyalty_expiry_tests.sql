-- ============================================================================
-- loyalty_expiry_tests.sql — المعدّل الجديد، وانتهاءُ الصلاحية بترتيب FIFO،
--                             وأرضيةُ الهامش حين يجتمع كوبونٌ ونقاط (هجرة 0119)
--
-- كيف تشغّله: `pnpm db:test loyalty_expiry`
-- النجاح = آخر سطر «ALL PASSED».
--
-- ══════════════════════════════════════════════════════════════════════════
--  ماذا يُثبت هذا الملف — وماذا كان يفشل قبل 0119
-- ══════════════════════════════════════════════════════════════════════════
--
--   (أ)  الاتجاه `expire` **لم يكن موجوداً**: `loyalty_entries_direction_check`
--        كانت أربعة اتجاهات، فأيُّ قيد انتهاءٍ يُرفض بخرق قيد.
--   (ج)  و«من تاريخ الكسب» **يستحيل** بلا ترتيب: الدفتر مُلحَقٌ برصيدٍ مجمَّع،
--        فلا يُعرف أيُّ نقاطٍ استهلكها الاستبدال. و`loyalty_lots` هي الجواب.
--   (و)  والمعدّل: ١٫٢٥ نقطة للجنيه والنقطة بخمسة قروش ⇒ **٦٫٢٥٪**. وقرارُ
--        المالك ٢٪ — والتأكيد يقيس الحاصل لا الرقمين منفصلين.
--
-- ── و🔴 الثمن المكتوب لا المطويّ ────────────────────────────────────────────
--   الدفتر يخزّن **نقاطاً** ويقوّمها لحظة الاستبدال من الإعداد الجاري. فخفض
--   `currency_per_point` **يُعيد تسعير كل نقطةٍ مسكوكة سلفاً**. والقسم (و-٣)
--   يقيس ذلك صراحةً بدل أن يُترك مفاجأةً.
--
-- ── ولا بيانات حقيقية ──────────────────────────────────────────────────────
--   هاتفٌ اختباري يخلقه الملف، ولا يُمسّ رصيد أي رقمٍ قائم. والقياس كله داخل
--   **معاملةٍ فرعية تُرجَع**، والقسم (ك) يقيس صفر الأثر.
--
-- ما يغطيه الملف:
--   (٠) الشروط المسبقة · (٠-ب) خط الأساس
--   (أ) الاتجاه `expire` مقبولٌ سالباً ومرفوضٌ موجباً
--   (ب) FIFO: الاستبدال يستهلك **الأقدم** لا الأحدث
--   (ج) الانتهاء يمسّ ما هرم وحده، والحديث يبقى بتاريخٍ مقروء
--   (د) المهمة **آمنةُ الإعادة**: نداؤها الثاني صفر
--   (هـ) `loyalty_reconcile` تبقى فارغة بعد الانتهاء
--   (و) المعدّل ٢٪، والثمن المقيس على النقاط القائمة
--   (ز) `expire_months = 0` ⇒ لا انتهاء (السلوك القديم يبقى ممكناً)
--   (ح) العميل يرى تاريخ الانتهاء، والمتعهد لا يبلغ الدفعات
--   (ط) 🔴 الأرضية تصمد حين يجتمع كوبونٌ ونقاط — **مقيسةً لا مفترضة**
--   (ي) 🔴 0124 — الحدُّ **بعد** الترشيح، وبترتيب الأقدم استحقاقاً
--   (ك) صفر أثر
--
-- ══════════════════════════════════════════════════════════════════════════
--  وما أضافته 0124 (د‑٢) — عيبٌ خاملٌ اليوم وقنبلةٌ موقوتة عند النمو
-- ══════════════════════════════════════════════════════════════════════════
--
-- كان `limit p_limit` يقع على **كل** حسابٍ برصيدٍ موجب مرتَّباً بـ`phone_norm`،
-- ثم يُسأل أيُّها هرمت نقاطه. فوق ٥٠٠ حساب: مَن ترتيبُه بعدهم **لا تنتهي نقاطه
-- أبداً** — والترتيبُ أبجديٌّ ثابت فلا تصل إليه دورةٌ تالية أيضاً. والقسم (ي)
-- يقيسه بحدٍّ واحد وطُعومٍ تسبق المستحقَّ أبجدياً، **ويُثبت الطفرةَ بنزع
-- الترشيح ثم إعادة الدالة حرفياً**.
--
-- المرجع: supabase/migrations/0119_completion_apology_and_loyalty_rate.sql
--         · supabase/migrations/0124_completion_guards_and_deduction_cap.sql
--         · lib/loyalty-types.ts §١ (الأرضية لا تحتمل طبقةً ثانية)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (٠) الشروط المسبقة
-- ----------------------------------------------------------------------------
do $$
declare
  v_missing text;
begin
  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claims', '', false);

  select string_agg(x.sig, '، ') into v_missing
  from (values
    ('public.loyalty_lots(text)'),
    ('public.expire_loyalty_points(integer)'),
    ('public.my_loyalty_expiry(integer)'),
    ('public.loyalty_expiry_summary()'),
    ('public.loyalty_config()'),
    ('public.loyalty_reconcile()'),
    ('public.apply_points(text, integer, numeric, text, numeric, numeric)'),
    ('public.discount_floor_room(numeric, text, numeric)')
  ) as x(sig)
  where to_regprocedure(x.sig) is null;
  if v_missing is not null then
    raise exception 'شرط مسبق: دوال مفقودة (نفّذ 0119 أولاً): %', v_missing;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'loyalty_settings'
      and column_name = 'expire_months'
  ) then
    raise exception 'شرط مسبق: عمود loyalty_settings.expire_months غير موجود';
  end if;

  raise notice '✔ (٠) الشروط المسبقة سليمة';
end;
$$;

-- ----------------------------------------------------------------------------
-- (٠-ب) خط الأساس
-- ----------------------------------------------------------------------------
do $$
declare
  v_e integer; v_a integer; v_ppc numeric; v_cpp numeric; v_m integer;
begin
  select count(*)::integer into v_e from public.loyalty_entries;
  select count(*)::integer into v_a from public.loyalty_accounts;
  select l.points_per_currency, l.currency_per_point, l.expire_months
    into v_ppc, v_cpp, v_m
  from public.loyalty_settings l limit 1;

  perform set_config('tours.le_e', v_e::text, false);
  perform set_config('tours.le_a', v_a::text, false);
  perform set_config('tours.le_ppc', v_ppc::text, false);
  perform set_config('tours.le_cpp', v_cpp::text, false);
  perform set_config('tours.le_m', v_m::text, false);

  raise notice '✔ (٠-ب) خط الأساس: % قيداً · % حساباً · %/جنيه · النقطة % · الصلاحية % شهراً',
    v_e, v_a, v_ppc, v_cpp, v_m;
end;
$$;

-- ----------------------------------------------------------------------------
-- (و) المعدّل — قرار المالك، ويُقاس **الحاصل** لا الرقمان منفصلين
-- ----------------------------------------------------------------------------
do $$
declare
  v_cfg   record;
  v_rate  numeric;
  v_live  integer;
  v_was   numeric;
  v_now   numeric;
begin
  select * into v_cfg from public.loyalty_config();

  if not v_cfg.enabled then
    raise exception '(و-٠) نظام الولاء مطفأ — والمالك أشعله بقراره 2026-08-17 (OWNER-DECISIONS §٤)';
  end if;

  -- 🔒 الاسترداد الفعلي = (نقطة لكل جنيه) × (قيمة النقطة). والرقمان وحدهما لا
  --    يعنيان شيئاً: ١٫٢٥×٠٫٠٥ و١×٠٫٠٦٢٥ حاصلُهما واحد. فالقياس على الحاصل.
  v_rate := round(v_cfg.points_per_currency * v_cfg.currency_per_point * 100, 4);
  if v_rate <> 2 then
    raise exception
      '(و-١) 🔴 الاسترداد الفعلي %٪ لا ٢٪ — قرار المالك: نقطةٌ للجنيه وقيمتها قرشان', v_rate;
  end if;
  if v_cfg.points_per_currency <> 1 then
    raise exception '(و-٢) النقاط لكل جنيه % لا ١', v_cfg.points_per_currency;
  end if;
  if v_cfg.currency_per_point <> 0.02 then
    raise exception '(و-٢) قيمة النقطة % لا ٠٫٠٢', v_cfg.currency_per_point;
  end if;
  if v_cfg.min_redeem_points <> 1000 then
    raise exception '(و-٢) أدنى رصيدٍ للاستبدال % لا ١٠٠٠ (أي ألف جنيهٍ من الإنفاق)',
      v_cfg.min_redeem_points;
  end if;

  -- 🔴 والثمن يُقال لا يُخفى: الدفتر يخزّن **نقاطاً** ويقوّمها لحظة الاستبدال،
  --    فخفضُ القيمة أعاد تسعير كل نقطةٍ مسكوكة سلفاً. رقمٌ يُطبع كي يُرى.
  select coalesce(sum(a.points_balance), 0)::integer into v_live from public.loyalty_accounts a;
  v_was := round(v_live * 0.05, 2);
  v_now := round(v_live * v_cfg.currency_per_point, 2);
  raise notice
    '✔ (و) الاسترداد ٢٪ (١ نقطة/جنيه · النقطة ٠٫٠٢) — و⚠ النقاط القائمة % نقطة: كانت تساوي % ج.م وصارت % ج.م',
    v_live, v_was, v_now;
end;
$$;

-- ============================================================================
-- (أ) — (ط) القياس الحيّ، داخل معاملةٍ فرعية تُرجَع بكاملها
-- ============================================================================
do $$
declare
  v_ph    constant text := '01000000771';
  -- 🔒 رقمان لا رقم: قياسُ الاتجاه يكتب قيوداً تفسد حساب FIFO لو شاركته الوعاء.
  --    والفصلُ بنيويّ لا انضباطي — لا «تذكّرْ ألّا تخلط».
  v_ph0   constant text := '01000000772';
  v_norm0 text;
  v_cls   constant uuid := 'c0000000-0000-4000-8000-000000001e19';
  v_norm  text;
  v_cfg   record;
  v_msg   text;
  v_n     integer;
  v_res   record;
  v_lot   record;
  v_old   uuid;
  v_new   uuid;
  v_bal   integer;
  v_sum   integer;
  v_min   numeric;
  v_room  numeric;
  v_total numeric;
  v_cost  numeric;
  v_cpn   numeric;
  -- 0124 (د‑٢)
  v_def   text;       -- نصُّ الدالة كما هو على القاعدة، لإعادته حرفياً بعد الطفرة
  v_rank  integer;
  v_p1    text;
  v_p2    text;
  v_d1    text;
  v_d2    text;
begin
  v_norm := public.normalize_phone(v_ph);
  if v_norm is null then
    raise exception '(٠) هاتف الفيكسترة لا يُطبَّع — لا وعاء للنقاط';
  end if;
  v_norm0 := public.normalize_phone(v_ph0);
  if v_norm0 is null then
    raise exception '(٠) هاتف قياس الاتجاه لا يُطبَّع';
  end if;
  if exists (select 1 from public.loyalty_accounts a
              where a.phone_norm in (v_norm, v_norm0)) then
    raise exception '(٠) 🔴 رقم الفيكسترة له رصيدٌ حقيقي — القياس كان سيلمس مال عميل';
  end if;

  begin
    select * into v_cfg from public.loyalty_config();

    -- ══ (أ) الاتجاه الخامس ═════════════════════════════════════════════════
    -- سالبٌ يُقبل
    insert into public.loyalty_entries (phone_norm, direction, points, note)
    values (v_norm0, 'earn', 5000, 'LE بذرة');
    insert into public.loyalty_entries (phone_norm, direction, points, note)
    values (v_norm0, 'expire', -1, 'LE قياس الاتجاه');
    -- وموجبٌ يُرفض: «انتهاء» يزيد الرصيد تناقضٌ
    v_msg := null;
    begin
      insert into public.loyalty_entries (phone_norm, direction, points, note)
      values (v_norm0, 'expire', 1, 'LE قياس الإشارة');
      v_msg := '(قُبل)';
    exception when others then
      get stacked diagnostics v_msg = returned_sqlstate;
    end;
    if v_msg = '(قُبل)' then
      raise exception '(أ-١) 🔴 قيدُ انتهاءٍ **موجب** قُبل — انتهاءٌ يزيد الرصيد';
    end if;
    if v_msg <> '23514' then
      raise exception '(أ-١) الرفض جاء بـ% لا بخرق قيد', v_msg;
    end if;

    -- والدفتر مُلحَق: لا تعديل ولا حذف حتى لقيد الانتهاء
    v_msg := null;
    begin
      delete from public.loyalty_entries where phone_norm = v_norm0 and direction = 'expire';
      v_msg := '(قُبل)';
    exception when others then
      get stacked diagnostics v_msg = message_text;
    end;
    if v_msg = '(قُبل)' then
      raise exception '(أ-٢) قيدُ انتهاءٍ حُذف — الدفتر ليس مُلحَقاً';
    end if;

    raise notice '✔ (أ) الاتجاه `expire` مقبولٌ سالباً مرفوضٌ موجباً، والدفتر مُلحَق';

    -- ══ (ب) FIFO — الاستبدال يستهلك **الأقدم** ═════════════════════════════
    -- دفعتان بتاريخين متباعدين: قديمةٌ هرمت وحديثةٌ لم تهرم
    insert into public.loyalty_entries (phone_norm, direction, points, occurred_at, note)
    values (v_norm, 'earn', 4000, now() - interval '5 months', 'LE دفعةٌ قديمة')
    returning id into v_old;
    insert into public.loyalty_entries (phone_norm, direction, points, occurred_at, note)
    values (v_norm, 'earn', 3000, now() - interval '10 days', 'LE دفعةٌ حديثة')
    returning id into v_new;

    -- استبدالٌ يأكل من **القديمة** وحدها لو كان الترتيب سليماً
    insert into public.loyalty_entries (phone_norm, direction, points, note)
    values (v_norm, 'redeem', -1001, 'LE استبدال');

    select l.remaining into v_n from public.loyalty_lots(v_norm) l where l.entry_id = v_old;
    -- ٤٠٠٠ − ١٠٠١ = ٢٩٩٩ — ولو كان الترتيب بالأحدث لخرجت ٤٠٠٠ والحديثة ١٩٩٩
    if v_n <> 2999 then
      raise exception '(ب-١) 🔴 المتبقي من الدفعة القديمة % لا ٢٩٩٩ — الترتيب ليس بالأقدم فالأقدم', v_n;
    end if;
    select l.remaining into v_n from public.loyalty_lots(v_norm) l where l.entry_id = v_new;
    if v_n <> 3000 then
      raise exception '(ب-٢) 🔴 الدفعة الحديثة استُهلكت (% باقٍ من ٣٠٠٠) — الاستبدال أكل الأحدث', v_n;
    end if;

    -- والمجموع يطابق الرصيد دائماً — مصدرٌ واحد لا اثنان
    select coalesce(sum(l.remaining), 0)::integer into v_sum from public.loyalty_lots(v_norm) l;
    select a.points_balance into v_bal from public.loyalty_accounts a where a.phone_norm = v_norm;
    if v_sum <> v_bal then
      raise exception '(ب-٣) 🔴 مجموع الدفعات % ورصيد الحساب % — رقمان لشيءٍ واحد', v_sum, v_bal;
    end if;

    raise notice '✔ (ب) الاستبدال يستهلك الأقدم فالأقدم، ومجموع الدفعات = الرصيد بالضبط';

    -- ══ (ج) الانتهاء يمسّ ما هرم وحده ══════════════════════════════════════
    select count(*)::integer into v_n
    from public.loyalty_lots(v_norm) l
    where l.remaining > 0 and l.expires_at is not null and l.expires_at <= now();
    if v_n <> 1 then
      raise exception '(ج-١) عدد الدفعات المنتهية % لا ١ — الحساب الزمني منحرف', v_n;
    end if;

    select * into v_res from public.expire_loyalty_points(500);
    if v_res.points_expired <> 2999 then
      raise exception '(ج-٢) 🔴 انتهى % نقطة لا ٢٩٩٩ — الانتهاء لا يتبع تاريخ الكسب',
        v_res.points_expired;
    end if;

    -- **قيدٌ لا حذف**
    if not exists (
      select 1 from public.loyalty_entries e
      where e.phone_norm = v_norm and e.direction = 'expire' and e.points = -2999
    ) then
      raise exception '(ج-٣) الانتهاء لم يُكتب قيداً — والحذف ممنوع أصلاً فأين ذهبت النقاط؟';
    end if;

    -- والحديثةُ باقيةٌ كاملةً بتاريخٍ مقروء
    select l.remaining, l.expires_at into v_n, v_msg
    from public.loyalty_lots(v_norm) l where l.entry_id = v_new;
    if v_n <> 3000 then
      raise exception '(ج-٤) 🔴 الدفعة الحديثة انتهت أيضاً (% باقٍ) — الانتهاء أعمى', v_n;
    end if;
    if v_msg is null then
      raise exception '(ج-٥) الدفعة الحديثة بلا تاريخ انتهاء — العميل لا يعرف متى تختفي';
    end if;

    raise notice '✔ (ج) الانتهاء قيدٌ لا حذف، ويمسّ ما هرم وحده، والحديث يبقى بتاريخٍ مقروء';

    -- ══ (د) آمنةُ الإعادة بنيوياً ═══════════════════════════════════════════
    select * into v_res from public.expire_loyalty_points(500);
    if v_res.points_expired <> 0 then
      raise exception
        '(د-١) 🔴 نداءٌ ثانٍ أنهى % نقطةً أخرى — المهمة تنتزع الرصيد مرتين', v_res.points_expired;
    end if;

    -- ══ (هـ) والمطابقة تبقى نظيفة ══════════════════════════════════════════
    select count(*)::integer into v_n from public.loyalty_reconcile() r
    where r.phone_norm = v_norm;
    if v_n <> 0 then
      raise exception '(هـ-١) 🔴 الرصيد المادّي انحرف عن الدفتر بعد الانتهاء';
    end if;

    raise notice '✔ (د)(هـ) النداء الثاني صفر، وloyalty_reconcile نظيفة بعد الانتهاء';

    -- ══ (ز) `expire_months = 0` ⇒ لا انتهاء ════════════════════════════════
    insert into public.loyalty_entries (phone_norm, direction, points, occurred_at, note)
    values (v_norm, 'earn', 2000, now() - interval '9 months', 'LE دفعةٌ هرمة ثانية');

    update public.loyalty_settings set expire_months = 0 where id;
    select count(*)::integer into v_n
    from public.loyalty_lots(v_norm) l where l.expires_at is not null;
    if v_n <> 0 then
      raise exception '(ز-١) الصفر لا يعني «بلا انتهاء» — % دفعةٍ ما زالت لها نهاية', v_n;
    end if;
    select * into v_res from public.expire_loyalty_points(500);
    if v_res.points_expired <> 0 then
      raise exception '(ز-٢) 🔴 انتهت نقاطٌ والمقبض مطفأ — إعدادُ المالك بلا أثر';
    end if;
    update public.loyalty_settings set expire_months = 3 where id;

    raise notice '✔ (ز) الصفر يعني «بلا انتهاء» فعلاً — والسلوك السابق يبقى ممكناً بمقبضٍ واحد';

    -- ══ (ح) العزل: الدفعات لا يبلغها متعهدٌ ولا زائر ════════════════════════
    if exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'loyalty_lots'
        and has_function_privilege('authenticated', p.oid, 'execute')
    ) then
      raise exception
        '(ح-١) 🔴 `loyalty_lots` ممنوحة لـauthenticated — ووسيطها هاتفٌ معياري، أي رصيدُ أي رقمٍ بتخمينه (D-20)';
    end if;
    if exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'my_loyalty_expiry'
        and has_function_privilege('anon', p.oid, 'execute')
    ) then
      raise exception '(ح-٢) `my_loyalty_expiry` ممنوحة للزائر';
    end if;

    raise notice '✔ (ح) الدفعات محجوبةٌ عن المتعهد والزائر — ووسيطُها هاتفٌ فلا تُمنح بحال';

    -- ══ (ط) 🔴 الأرضية حين يجتمع كوبونٌ ونقاط — **مقيسةً لا مفترضة** ════════
    --
    -- قرار المالك: «الكوبونات والنقاط تتراكم». والعقد الأم يقول إن الأرضية
    -- **سقفٌ واحد للطبقتين لا سقفان يُجمعان** (§١). وهذا يُقاس، لا يُصدَّق.
    insert into public.vehicle_classes (id, slug, title, capacity, luggage_capacity, active, sort)
    values (v_cls, 'letest-a', 'LOYALTY_EXPIRY_TESTS فئة', 1, 4, true, 9771);
    insert into public.tariffs (class_id, per_km, base_fee, min_price,
                                waiting_hour_price, round_trip_factor)
    values (v_cls, 20, 1000, 0, 0, 1.8);

    v_total := 5000;
    v_cost  := 3000;
    select r.min_total, r.room into v_min, v_room
      from public.discount_floor_room(v_total, 'letest-a', v_cost) r;
    if coalesce(v_room, 0) <= 0 then
      raise exception '(ط-٠) لا مساحةَ خصمٍ أصلاً في الفيكسترة — القياس التالي كان سيقارن أصفاراً';
    end if;

    -- كوبونٌ يبتلع **كل المساحة إلا جنيهاً**: أقسى وضعٍ للطبقة الثانية
    v_cpn := v_room - 1;
    select * into v_res from public.apply_points(
      v_ph, 1000000, v_total, 'letest-a', v_cost, v_cpn);

    -- 🔒 والحكم: مهما قال `applied`، **لا ينزل الناتج تحت الأرضية**
    if v_res.total_after < v_min then
      raise exception
        '(ط-١) 🔴 كوبونٌ (%) ونقاطٌ معاً أنزلا الرحلة إلى % وأرضيتها % — D-16 مخترقة',
        v_cpn, v_res.total_after, v_min;
    end if;
    if v_res.applied and v_res.amount > 1 then
      raise exception
        '(ط-٢) 🔴 النقاط أخذت % والمساحة الباقية بعد الكوبون جنيهٌ واحد — سقفان يُجمعان لا سقفٌ واحد',
        v_res.amount;
    end if;

    -- وبلا كوبون: المساحة كاملةٌ للنقاط، والأرضية تصمد كذلك
    select * into v_res from public.apply_points(
      v_ph, 1000000, v_total, 'letest-a', v_cost, 0);
    if v_res.total_after < v_min then
      raise exception '(ط-٣) 🔴 النقاط وحدها أنزلت الرحلة إلى % وأرضيتها %',
        v_res.total_after, v_min;
    end if;

    -- وشاهدٌ إيجابي: بلا هذا التأكيد كان القسم كله سيمرّ على دالةٍ ترفض دائماً
    if not v_res.applied and v_res.rejection in ('not-enabled', 'invalid-input') then
      raise exception '(ط-٤) `apply_points` ترفض لسببٍ إعداديّ (%) — القياس أعلاه كان أعمى',
        v_res.rejection;
    end if;

    raise notice
      '✔ (ط) 🔴 الأرضية تصمد للطبقتين: بكوبونٍ يبتلع المساحة (%) وبلا كوبون — سقفٌ واحد لا سقفان',
      v_cpn;

    -- ══ (ي) 🔴 0124 (د‑٢) — الحدُّ بعد الترشيح، والأقدمُ استحقاقاً أولاً ═════
    --
    -- المقيس قبل 0124: `limit p_limit` كان يقع على **كل** حسابٍ برصيدٍ موجب
    -- مرتَّباً بـ`phone_norm`، ثم يُسأل أيُّها هرم. فوق ٥٠٠ حساب: مَن ترتيبُه
    -- بعدهم **لا تنتهي نقاطه أبداً** — والترتيبُ أبجديٌّ ثابت فلا تتقدّم الدورة
    -- في أي دورةٍ تالية. خاملٌ اليوم (حسابان) وقنبلةٌ موقوتة عند النمو.

    -- (١) تفريغُ الميدان: تُنهى كلُّ نقطةٍ هرمة في القاعدة أولاً، فيصير ما يلي
    --     قياساً على فيكسترةٍ وحدها لا على متراكمٍ لا نملكه
    perform * from public.expire_loyalty_points(5000);
    select count(*)::integer into v_n
    from public.loyalty_accounts a
    where a.points_balance > 0
      and (select coalesce(sum(l.remaining), 0) from public.loyalty_lots(a.phone_norm) l
            where l.expires_at is not null and l.expires_at <= now()) > 0;
    if v_n <> 0 then
      raise exception '(ي-٠) بقي % حساباً مستحقّاً بعد التفريغ — الميدان ليس نظيفاً', v_n;
    end if;

    -- (٢) طُعومٌ ترتيبُها **قبل** المستحقَّين وليس لها ما يهرم — وهي بعينها ما
    --     كان يبتلع الحدَّ كلَّه في النسخة القديمة
    v_d1 := public.normalize_phone('01000000781');
    v_d2 := public.normalize_phone('01000000782');
    v_p1 := public.normalize_phone('01000000791');
    v_p2 := public.normalize_phone('01000000792');
    if v_p1 <= v_d2 or v_d1 >= v_d2 then
      raise exception '(ي-٠) ترتيبُ هواتف الفيكسترة ليس كما افترض القياس';
    end if;
    if exists (select 1 from public.loyalty_accounts a
                where a.phone_norm in (v_d1, v_d2, v_p1, v_p2)) then
      raise exception '(ي-٠) 🔴 رقمٌ من أرقام الفيكسترة له رصيدٌ حقيقي — القياس كان سيلمس مال عميل';
    end if;

    insert into public.loyalty_entries (phone_norm, direction, points, occurred_at, note)
    values (v_d1, 'earn', 900, now(), 'LE طُعمٌ حديثٌ لا يهرم'),
           (v_d2, 'earn', 900, now(), 'LE طُعمٌ حديثٌ لا يهرم'),
           -- والمستحقّان: الأول أقدمُ استحقاقاً من الثاني
           (v_p1, 'earn', 700, now() - interval '9 months',  'LE مستحقٌّ أقدم'),
           (v_p2, 'earn', 300, now() - interval '5 months',  'LE مستحقٌّ أحدث');

    select count(*)::integer into v_rank
    from public.loyalty_accounts a
    where a.points_balance > 0 and a.phone_norm < v_p1;
    if v_rank < 2 then
      raise exception
        '(ي-٠) لا يسبق المستحقَّ إلا % حساباً — والطفرة أدناه تحتاج من يبتلع الحدّ', v_rank;
    end if;

    -- (٣) 🔬 اختبارُ الطفرة: تُلتقط الدالة بنصّها ثم تُستبدل بنسخةِ **ما قبل
    --     0124** (الحدُّ قبل الترشيح، بترتيبٍ أبجديّ) ⇒ فتُخرج صفراً أبداً
    v_def := pg_get_functiondef(to_regprocedure('public.expire_loyalty_points(integer)')::oid);

    create or replace function public.expire_loyalty_points(p_limit integer default 500)
    returns table (accounts integer, points_expired integer)
    language plpgsql
    security definer
    set search_path = ''
    as $stub$
    declare
      v_cfg record;
      v_row record;
      v_n   integer := 0;
      v_sum integer := 0;
      v_pts integer;
    begin
      select * into v_cfg from public.loyalty_config();
      select l.expire_months into v_pts from public.loyalty_settings l limit 1;
      if not v_cfg.enabled or coalesce(v_pts, 0) <= 0 then
        accounts := 0; points_expired := 0; return next; return;
      end if;
      for v_row in
        select a.phone_norm,
               (select coalesce(sum(l.remaining), 0)::integer
                  from public.loyalty_lots(a.phone_norm) l
                 where l.expires_at is not null and l.expires_at <= now()) as due
        from public.loyalty_accounts a
        where a.points_balance > 0
        order by a.phone_norm
        limit greatest(coalesce(p_limit, 500), 1)
      loop
        if coalesce(v_row.due, 0) <= 0 then continue; end if;
        insert into public.loyalty_entries (phone_norm, direction, points, note)
        values (v_row.phone_norm, 'expire', -v_row.due, 'LE طفرة — الحدُّ قبل الترشيح');
        v_n := v_n + 1; v_sum := v_sum + v_row.due;
      end loop;
      accounts := v_n; points_expired := v_sum; return next;
    end;
    $stub$;

    select * into v_res from public.expire_loyalty_points(1);
    if v_res.points_expired <> 0 then
      raise exception
        '(ي-١) 🔬 نُزع الترشيح ولم يمرّ العيب (انتهى %) — فالتأكيدات التالية لا تقيس ترتيباً',
        v_res.points_expired;
    end if;

    -- وتُعاد الدالة **حرفياً كما كانت على القاعدة** — لا نسخةً مكتوبةً بيد (D-58)
    execute v_def;

    -- (٤) وبعد الإعادة: حدٌّ واحدٌ يبلغ **الأقدم استحقاقاً** رغم % طُعماً قبله
    select * into v_res from public.expire_loyalty_points(1);
    if v_res.accounts <> 1 or v_res.points_expired <> 700 then
      raise exception
        '(ي-٢) 🔴 حدٌّ واحد أنهى % حساباً و% نقطة — والمتوقع حساباً واحداً و٧٠٠: الحدُّ ما زال يقع قبل الترشيح',
        v_res.accounts, v_res.points_expired;
    end if;
    if not exists (
      select 1 from public.loyalty_entries e
      where e.phone_norm = v_p1 and e.direction = 'expire' and e.points = -700
    ) then
      raise exception '(ي-٢) لم يُكتب قيدُ انتهاءٍ للمستحقّ الأقدم';
    end if;
    if exists (
      select 1 from public.loyalty_entries e
      where e.phone_norm = v_p2 and e.direction = 'expire'
    ) then
      raise exception
        '(ي-٣) 🔴 أُنهي الأحدثُ استحقاقاً والحدُّ واحد — الترتيب ليس بالأقدم استحقاقاً';
    end if;

    -- (٥) 🔒 والطابور **يتقدّم**: النداء التالي بنفس الحدّ يبلغ التالي، ولا
    --     يعيد أوّلَ الترتيب الأبجديّ إلى الأبد
    select * into v_res from public.expire_loyalty_points(1);
    if v_res.accounts <> 1 or v_res.points_expired <> 300 then
      raise exception
        '(ي-٤) 🔴 النداء التالي أنهى % حساباً و% نقطة — الطابور لا يتقدّم فمن بعد الحدّ لا تنتهي نقاطه أبداً',
        v_res.accounts, v_res.points_expired;
    end if;

    -- (٦) ولا شيء بعد ذلك: آمنةُ الإعادة كما كانت
    select * into v_res from public.expire_loyalty_points(1);
    if v_res.points_expired <> 0 then
      raise exception '(ي-٥) نداءٌ ثالث أنهى % نقطةً أخرى', v_res.points_expired;
    end if;

    -- (٧) والطُّعوم لم تُمسّ: الترشيح لا يأكل من ليس له ما يهرم
    select coalesce(sum(a.points_balance), 0)::integer into v_n
    from public.loyalty_accounts a where a.phone_norm in (v_d1, v_d2);
    if v_n <> 1800 then
      raise exception '(ي-٦) 🔴 رصيدُ الطُّعوم % لا ١٨٠٠ — الانتهاء مسّ ما لم يهرم', v_n;
    end if;

    raise notice
      '✔ (ي) 🔴 الحدُّ صار بعد الترشيح وبترتيب الأقدم استحقاقاً: حدٌّ واحد يبلغ المستحقَّ الأقدم رغم % طُعماً يسبقه أبجدياً، والنداء التالي يبلغ الذي يليه — والطفرة تُعيد الصفر الأبدي',
      v_rank;

    raise exception 'LOYALTY_EXPIRY_TESTS_ROLLBACK';
  exception
    when others then
      execute 'reset role';
      perform set_config('request.jwt.claims', '', true);
      if sqlerrm <> 'LOYALTY_EXPIRY_TESTS_ROLLBACK' then raise; end if;
  end;

  raise notice '✔ القياس الحيّ تمّ داخل معاملةٍ فرعية أُرجعت بكاملها';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ك) 🔒 لم يبقَ أثر
-- ----------------------------------------------------------------------------
do $$
declare
  v_e integer; v_a integer; v_ppc numeric; v_cpp numeric; v_m integer; v_n integer;
  v_be integer := current_setting('tours.le_e')::integer;
  v_ba integer := current_setting('tours.le_a')::integer;
  v_bppc numeric := current_setting('tours.le_ppc')::numeric;
  v_bcpp numeric := current_setting('tours.le_cpp')::numeric;
  v_bm integer := current_setting('tours.le_m')::integer;
begin
  select count(*)::integer into v_e from public.loyalty_entries;
  select count(*)::integer into v_a from public.loyalty_accounts;
  select l.points_per_currency, l.currency_per_point, l.expire_months
    into v_ppc, v_cpp, v_m from public.loyalty_settings l limit 1;

  if v_e <> v_be then
    raise exception 'تنظيف ناقص: قيود الولاء % والأساس % — قيدٌ باقٍ يحرّك رصيد عميل', v_e, v_be;
  end if;
  if v_a <> v_ba then
    raise exception 'تنظيف ناقص: حسابات الولاء % والأساس %', v_a, v_ba;
  end if;
  -- 🔴 وإعدادات المالك كما تركها: القياس عبث بـ`expire_months` ثم أعادها
  if v_ppc <> v_bppc or v_cpp <> v_bcpp or v_m <> v_bm then
    raise exception
      '🔴 تنظيف ناقص: إعدادات الولاء تغيّرت (%/%/% ⇐ %/%/%) — قرارُ مالكٍ تسرّب من مجموعة اختبار',
      v_ppc, v_cpp, v_m, v_bppc, v_bcpp, v_bm;
  end if;

  select count(*)::integer into v_n
    from public.vehicle_classes vc where vc.slug like 'letest-%';
  if v_n <> 0 then raise exception 'تنظيف ناقص: % فئة سيارة اختبارية باقية', v_n; end if;

  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claims', '', false);

  raise notice 'ALL PASSED — الاسترداد صار ٢٪ بقرار المالك (والثمن على النقاط القائمة مطبوعٌ لا مطويّ)، والنقطة تنتهي بعد ثلاثة أشهر من كسبها بترتيبٍ FIFO مشتقٍّ من الدفتر وحده — قيدُ انتهاءٍ لا حذف، ومهمةٌ نداؤها الثاني صفر، ومطابقةٌ تبقى نظيفة، ومقبضُ الصفر يعيد السلوك القديم؛ والدفعات محجوبةٌ عن المتعهد والزائر، وأرضيةُ الهامش تصمد حين يجتمع كوبونٌ ونقاط — سقفٌ واحد لا سقفان؛ و🔴 حدُّ المهمة صار يقع **بعد** الترشيح وبترتيب الأقدم استحقاقاً، فمن بعد الخمسمئة الأولى أبجدياً لم يعد محكوماً بألّا تنتهي نقاطه أبداً';
end;
$$;
