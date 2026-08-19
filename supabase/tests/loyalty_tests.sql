-- ============================================================================
-- loyalty_tests.sql — اختبارات قبول لمحرّك الولاء
--                     (المرحلة ١٢ب: هجرة 0047_loyalty.sql)
--
-- كيف تشغّله: `pnpm db:test loyalty` أو الصق الملف كاملاً في SQL Editor واضغط Run.
-- النجاح = آخر سطر «ALL PASSED». أي فشل يرمي exception برسالة عربية تحدد
-- الاختبار والقيمة المتوقعة والفعلية.
--
-- ومن psql بدور صاحب القاعدة **لا بد** من ON_ERROR_STOP و‑1 معاً:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f supabase/tests/loyalty_tests.sql
--
-- ══════════════════════════════════════════════════════════════════════════
--  🔒 لماذا يختلف هذا الملف عن العشرين قبله: **لا ينظّف لأنه لا يكتب**
-- ══════════════════════════════════════════════════════════════════════════
--
-- المجموعات السابقة تزرع فيكسترتها ثم تمسحها في البداية والنهاية معاً. وهي
-- طريقةٌ صحيحة، لكنها **لا تنطبق هنا**: `loyalty_entries` دفترٌ مُلحَقٌ بمُشغّل
-- يرفض الحذف — فمجموعةٌ تكتب فيه لا تستطيع أن تنظّف نفسها، ولو فُتح لها بابٌ
-- لكان ذلك الباب هو العطب بعينه.
--
-- فالقياس كله يقع داخل **معاملة فرعية تُرجَع** (‏`0045`/`0046`)، والنتيجة أن
-- «صفر أثر» تصير خاصيةً **بنيوية** لا انضباطاً في كتابة `delete`:
--
--   • لا صفَّ يُكتب ولو انهار التشغيل في منتصفه.
--   • ولا إعداداتٍ تُحفظ وتُستعاد: تشغيل النظام يقع داخل ما يُرجَع، فلا يوجد
--     مسارٌ ينتهي بقاعدةٍ نظام ولائها مفعَّلٌ لأن اختباراً سقط قبل سطر الاستعادة.
--   • والقسم (ي) يقيس ذلك: أعداد الصفوف **قبل وبعد**، وأي فرقٍ يُرفع.
--
-- وهذا يُقرأ مع أن هذه **هي قاعدة الإنتاج نفسها** (اتفاقية ٨): كل صفٍّ يبقى هنا
-- يبقى في حساب عميلٍ حقيقي.
--
-- ── ولماذا لا يلمس هذا الملف بيانات حقيقية ──────────────────────────────────
--   • إحداثيات **صحراوية نائية** (٢٥٫٠، ٢٧٫٥) ← (٢٤٫٥، ٢٨٫٢): لا متعهد يغطيها
--     فالتسعير بالتعريفة حتماً، ولا يفشل الاختبار **لأن المشروع نجح** (النمط ٦).
--   • فئةُ سيارةٍ وخدمةٌ إضافية وكوبونٌ **يخلقها الملف** — فلا يعتمد رقمٌ واحد
--     على كتالوج المالك الحيّ.
--   • **كل توقّع يُشتق من مصدر الكود المُختبَر**: الأرضية من
--     `discount_floor_room`، والمعاملات من `loyalty_config()` — فتغيير المالك
--     لأي معيار من اللوحة لا يُسقط الاختبار (اتفاقية ٨).
--
-- المرجع: lib/loyalty-types.ts (العقد) + supabase/migrations/0047_loyalty.sql
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

  select string_agg(x.rel, '، ') into v_missing
  from (values
    ('public.loyalty_settings'), ('public.loyalty_accounts'), ('public.loyalty_entries'),
    ('public.customer_bookings'), ('public.bookings'),
    ('public.vehicle_classes'), ('public.tariffs'), ('public.extra_services')
  ) as x(rel)
  where to_regclass(x.rel) is null;
  if v_missing is not null then
    raise exception 'شرط مسبق: كائنات مفقودة (نفّذ 0047_loyalty.sql أولاً): %', v_missing;
  end if;

  select string_agg(x.sig, '، ') into v_missing
  from (values
    ('public.loyalty_config()'),
    ('public.apply_points(text, integer, numeric, text, numeric, numeric)'),
    ('public.redeem_points(uuid, text, integer, numeric)'),
    ('public.my_loyalty()'),
    ('public.my_loyalty_entries(integer)'),
    ('public.loyalty_reconcile()'),
    ('public.discount_floor_room(numeric, text, numeric)'),
    ('public.create_booking(jsonb, jsonb, integer, boolean, numeric, numeric, numeric, text, text, text, text, text, text, timestamptz, text, text, timestamptz, integer, jsonb, integer, text, jsonb)')
  ) as x(sig)
  where to_regprocedure(x.sig) is null;
  if v_missing is not null then
    raise exception 'شرط مسبق: دوال مفقودة: %', v_missing;
  end if;

  -- 🔒 التوقيع القديم لـ`create_booking` **يجب** أن يكون قد أُسقط، وإلا صار كل
  --    نداءٍ بالعدد القديم ملتبساً بين توقيعين («function is not unique»).
  if to_regprocedure('public.create_booking(jsonb, jsonb, integer, boolean, numeric, numeric, numeric, text, text, text, text, text, text, timestamptz, text, text, timestamptz, integer, jsonb)') is not null then
    raise exception 'شرط مسبق: التوقيع التاسع عشر لـcreate_booking ما زال موجوداً — النداء بتسعة عشر معاملاً سيفشل بـ«function is not unique»';
  end if;

  raise notice '✔ (٠) الشروط المسبقة سليمة';
end;
$$;

-- ----------------------------------------------------------------------------
-- (٠-ب) خط الأساس — يُقرأ **قبل** أي شيء، ويُقارَن به في (ي)
-- ----------------------------------------------------------------------------
do $$
declare
  v_e integer; v_a integer; v_b integer; v_c integer; v_en boolean;
begin
  select count(*)::integer into v_e from public.loyalty_entries;
  select count(*)::integer into v_a from public.loyalty_accounts;
  select count(*)::integer into v_b from public.bookings;
  select count(*)::integer into v_c from public.coupons;
  select l.enabled into v_en from public.loyalty_config() l;

  perform set_config('tours.lt_e', v_e::text, false);
  perform set_config('tours.lt_a', v_a::text, false);
  perform set_config('tours.lt_b', v_b::text, false);
  perform set_config('tours.lt_c', v_c::text, false);
  perform set_config('tours.lt_en', v_en::text, false);

  raise notice '✔ (٠-ب) خط الأساس: % قيداً · % حساب رصيد · % حجزاً · % كوبوناً · النظام مفعَّل = %',
    v_e, v_a, v_b, v_c, v_en;
end;
$$;

-- ----------------------------------------------------------------------------
-- (أ) 🔒 البذرة مطفأة — الافتراضي هو ما سيعمل في الإنتاج (النمط ٧)
--
-- ويُقرأ **قبل** المعاملة الفرعية لأنه يصف حالة القاعدة الحقيقية لا حالة
-- الفيكسترة. ومن شغّل النظام عمداً يُنبَّه ولا يسقط الاختبار.
-- ----------------------------------------------------------------------------
do $$
declare v_cfg record;
begin
  select * into v_cfg from public.loyalty_config();
  if v_cfg.enabled then
    raise notice '⚠ (أ) نظام الولاء **مفعَّل** على هذه القاعدة — قرارُ مالكٍ لا عطب، والاختبار يمضي بإعداداته الخاصة';
  else
    raise notice '✔ (أ) نظام الولاء مطفأ كما في البذرة — لا التزام يتراكم قبل قرار بشري (§٦)';
  end if;

  if v_cfg.currency_per_point is null or v_cfg.currency_per_point <= 0 then
    raise exception '(أ) قيمة النقطة «%» غير موجبة — قسمةٌ على صفر في كل استبدال',
      coalesce(v_cfg.currency_per_point::text, '(null)');
  end if;
  if v_cfg.max_redeem_percent < 0 or v_cfg.max_redeem_percent > 100 then
    raise exception '(أ) نسبة الاستبدال القصوى «%» خارج ٠–١٠٠', v_cfg.max_redeem_percent;
  end if;
end;
$$;

-- ============================================================================
-- (ب) — (ط) القياس الحيّ كله، داخل معاملةٍ فرعية تُرجَع بكاملها
-- ============================================================================
do $$
declare
  v_cls    constant uuid := 'c0000000-0000-4000-8000-0000000047b1';
  v_slug   constant text := 'ltest-a';
  v_xslug  constant text := 'ltest-x';
  v_phone  constant text := '01000000481';
  v_phone2 constant text := '01000000482';
  v_u_ref  constant uuid := '00000000-0000-4000-8000-0000000047b1';
  v_u_tok  constant uuid := '00000000-0000-4000-8000-0000000047b2';
  v_norm   text;
  v_norm2  text;
  v_cfg    record;
  v_q      record;
  v_bk     record;
  v_pts    record;
  v_my     record;
  v_id     uuid;
  v_id2    uuid;
  v_id3    uuid;
  v_ride   numeric;
  v_extras numeric;
  v_min    numeric;
  v_room   numeric;
  v_coupon numeric;
  v_amt    numeric;
  v_bal    integer;
  v_bal2   integer;
  v_earn   integer;
  v_exp    integer;
  v_n      integer;
  v_state  text;
  v_hint   text;
  v_ok     boolean;
  v_row    jsonb;
  v_entry  uuid;
begin
  begin
    -- ══ الفيكسترة ═════════════════════════════════════════════════════════
    update public.loyalty_settings
       set enabled = true, points_per_currency = 1, currency_per_point = 0.5,
           min_redeem_points = 10, max_redeem_percent = 90;
    update public.discount_settings
       set enabled = true, max_percent = 90,
           min_margin_percent_after_discount = 10,
           min_margin_amount_after_discount = 50;

    -- 🔴 ومهلةُ الحجز المسبق تُصفَّر (إصلاح حمرةٍ صنفية، 2026-08-17): كل نداءات
    --    `create_booking` أدناه بموعدٍ `now() + 3 days`، و`0081` ترفض ما قبل
    --    `booking_min_pickup_at()` برمز `lead-time`. و`trip_settings.min_lead_minutes`
    --    إعدادُ مالكٍ يقبل حتى ١٠٠٨٠ دقيقة (سبعة أيام) — فرفعُه فوق ٤٣٢٠ يجعل
    --    **كل** المجموعة حمراء برسالةٍ لا علاقة لها بالولاء. والتثبيت داخل الكتلة
    --    المتراجعة (`LOYALTY_TESTS_ROLLBACK`)، فلا صفَّ مالكٍ يُحفظ.
    update public.trip_settings set min_lead_minutes = 0 where id = true;

    select * into v_cfg from public.loyalty_config();
    if not v_cfg.enabled or v_cfg.currency_per_point <> 0.5 then
      raise exception '(ب) إعدادات الفيكسترة لم تُقرأ (مفعَّل=% قيمة النقطة=%) — القياس على إعدادات أخرى',
        v_cfg.enabled, v_cfg.currency_per_point;
    end if;

    -- فئةٌ بسعةِ راكبٍ واحد كي تسبق كل فئةٍ حيّة في ترتيب `eligible`، وتعريفةٌ
    -- سخيّة كي تتسع ميزانية الأرضية للطبقتين معاً.
    insert into public.vehicle_classes (id, slug, title, capacity, luggage_capacity, active, sort)
    values (v_cls, v_slug, 'LOYALTY_TESTS فئة', 1, 4, true, 9081);
    insert into public.tariffs (class_id, per_km, base_fee, min_price,
                                waiting_hour_price, round_trip_factor)
    values (v_cls, 200, 1000, 0, 0, 1.8);

    -- خدمةٌ إضافية **يملكها الاختبار**: أساس الكسب يُقاس بوجود خدماتٍ فعلية
    insert into public.extra_services (slug, title, price, max_qty, active, sort)
    values (v_xslug, 'LOYALTY_TESTS خدمة', 137, 3, true, 981);

    insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                            created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
    values
      (v_u_ref, '00000000-0000-0000-0000-000000000000', 'authenticated',
       'authenticated', 'loyalty_ref@example.invalid', 'x', now(), now(),
       '{}'::jsonb, '{"full_name": "LOYALTY_TESTS مُثبِت"}'::jsonb),
      (v_u_tok, '00000000-0000-0000-0000-000000000000', 'authenticated',
       'authenticated', 'loyalty_tok@example.invalid', 'x', now(), now(),
       '{}'::jsonb, '{"full_name": "LOYALTY_TESTS حائزُ توكن"}'::jsonb);

    if not exists (select 1 from public.profiles p where p.id = v_u_ref) then
      raise exception '(ب) لم يتكوّن ملفّ المستخدم — handle_new_user لا تعمل والقياس لا يقيس شيئاً';
    end if;

    v_norm  := public.normalize_phone(v_phone);
    v_norm2 := public.normalize_phone(v_phone2);
    if v_norm is null or v_norm2 is null or v_norm = v_norm2 then
      raise exception '(ب) هاتفا الفيكسترة لا يُطبَّعان إلى وعاءين مختلفين (% · %)',
        coalesce(v_norm, '∅'), coalesce(v_norm2, '∅');
    end if;

    raise notice '✔ (ب-٠) الفيكسترة مبنيّة داخل معاملةٍ فرعية تُرجَع';

    -- ══ (ب) الكسب: مُشغّلٌ على الاكتمال، وأساسه `ride_after` بلا خدمات ══════
    select * into v_bk from public.create_booking(
      jsonb_build_object('label', 'LT مبدأ', 'lat', 25.0, 'lng', 27.5),
      jsonb_build_object('label', 'LT منتهى', 'lat', 24.5, 'lng', 28.2),
      1, false, 0, 100, 90, 'estimate', v_slug, 'full',
      'LOYALTY_TESTS عميل', v_phone, null, now() + interval '3 days',
      'LOYALTY_TESTS_FIXTURE', null, null, 1,
      ('[{"slug":"' || v_xslug || '","qty":2}]')::jsonb, 0);
    v_id := v_bk.id;

    select coalesce(public.jsonb_number(b.trip, 'extrasTotal', 0), 0)
      into v_extras from public.bookings b where b.id = v_id;

    -- مِجسُّ المِجسّ: بلا خدماتٍ فعلية يصير فحصُ «الخدمات خارج الأساس» فحصاً
    -- على صفرٍ — أي لا يمكن أن يفشل (النمط ٩).
    if coalesce(v_extras, 0) <= 0 then
      raise exception '(ب-١) الحجز بلا خدمات (extrasTotal = %) — الفحص التالي كان سيمرّ فوق صفر',
        coalesce(v_extras, 0);
    end if;

    -- قبل الاكتمال: لا قيد ولا رصيد. وبدون هذا لا دليل على أن **الاكتمال** سكّ.
    select count(*)::integer into v_n
      from public.loyalty_entries e where e.booking_id = v_id;
    if v_n <> 0 then
      raise exception '(ب-٢) % قيداً على حجزٍ لم يكتمل بعد — الكسب يقع خارج انتقال الاكتمال', v_n;
    end if;

    update public.bookings set status = 'under_review' where id = v_id;
    update public.bookings set status = 'confirmed'    where id = v_id;

    select count(*)::integer into v_n
      from public.loyalty_entries e where e.booking_id = v_id;
    if v_n <> 0 then
      raise exception '(ب-٢) % قيداً بعد التأكيد وقبل الاكتمال — المُشغّل يسكّ على انتقالٍ آخر', v_n;
    end if;

    update public.bookings set status = 'completed' where id = v_id;

    select e.points into v_earn
      from public.loyalty_entries e
     where e.booking_id = v_id and e.direction = 'earn' and e.reverses_entry_id is null;
    if v_earn is null then
      raise exception '(ب-٣) الاكتمال لم يسكّ نقاطاً — المُشغّل لا يعمل';
    end if;

    -- 🔒 التوقّع مشتقٌّ من اللقطة نفسها ومن `loyalty_config()` — لا رقمَ محفور
    select floor((b.total - v_extras) * v_cfg.points_per_currency)::integer
      into v_exp from public.bookings b where b.id = v_id;

    if v_earn <> v_exp then
      raise exception '(ب-٣) النقاط المسكوكة % والمتوقع % — أساس الكسب ليس ride_after (‏§٢)',
        v_earn, v_exp;
    end if;
    -- وهذا هو **القياس** لا الشكل: الأساس بالخدمات كان سيعطي رقماً آخر
    select floor(b.total * v_cfg.points_per_currency)::integer
      into v_n from public.bookings b where b.id = v_id;
    if v_earn = v_n then
      raise exception '(ب-٣) 🔴 النقاط تساوي الإجمالي كاملاً بالخدمات (%) — الخدمة تُشترى بنقاطٍ لا تكلفة لها علينا (§٦)',
        v_n;
    end if;

    select a.points_balance into v_bal
      from public.loyalty_accounts a where a.phone_norm = v_norm;
    if coalesce(v_bal, 0) <> v_earn then
      raise exception '(ب-٤) الرصيد المادّي % وقيد الدفتر % — مصدران لرقمٍ واحد (النمط ٨)',
        coalesce(v_bal, 0), v_earn;
    end if;

    raise notice '✔ (ب) الاكتمال سكّ % نقطة على أساس ride_after (والخدمات % خارجه)، والرصيد يطابق الدفتر',
      v_earn, v_extras;

    -- ══ (ج) رحلةٌ واحدة ⇒ صفُّ كسبٍ واحد مهما تعدّد الربط (§٤) ═════════════
    insert into public.customer_bookings (profile_id, booking_id, link_source)
    values (v_u_ref, v_id, 'reference'), (v_u_tok, v_id, 'token');

    select count(*)::integer into v_n
      from public.loyalty_entries e
     where e.booking_id = v_id and e.direction = 'earn' and e.reverses_entry_id is null;
    if v_n <> 1 then
      raise exception '(ج-١) 🔴 % صفَّ كسبٍ بعد ربط الحجز بحسابين — النقطة تُسكّ على الحساب لا على الحجز', v_n;
    end if;

    -- والحارس بنيويٌّ: إدراجٌ ثانٍ مباشر يرفضه الفهرس الفريد الجزئي
    v_state := null;
    begin
      insert into public.loyalty_entries (phone_norm, direction, points, booking_id, note)
      values (v_norm, 'earn', 5, v_id, 'LOYALTY_TESTS كسبٌ ثانٍ');
      v_state := '(قُبل)';
    exception when others then
      get stacked diagnostics v_state = returned_sqlstate;
    end;
    if v_state <> '23505' then
      raise exception '(ج-٢) 🔴 صفُّ كسبٍ ثانٍ انتهى بـ«%» لا 23505 — الفهرس الفريد الجزئي غائب، وهو نموذج الأمان لا تحسين (§٤)',
        v_state;
    end if;

    -- ولا يُسكّ ثانيةً بتحديثٍ لا يمسّ الحالة
    update public.bookings set customer_whatsapp = '01000000499' where id = v_id;
    select count(*)::integer into v_n
      from public.loyalty_entries e where e.booking_id = v_id and e.direction = 'earn';
    if v_n <> 1 then
      raise exception '(ج-٣) تحديثٌ لا يمسّ الحالة سكّ نقاطاً ثانيةً (% صفاً)', v_n;
    end if;

    raise notice '✔ (ج) صفُّ كسبٍ واحد لكل رحلة — بالربط المزدوج، وبالإدراج المباشر، وبتحديثٍ لا يمسّ الحالة';

    -- ══ (د) الاستبدال يقتسم ميزانية الأرضية مع الكوبون ولا يخترقها ═════════
    perform set_config('tours.pricing_internals', 'on', true);
    select q.total, q.subcontractor_cost into v_q
      from public.quote_price(100, 1, false, 0, 25.0, 27.5, 24.5, 28.2, 0) q
     where q.class_slug = v_slug;
    perform set_config('tours.pricing_internals', '', true);

    select f.min_total, f.room into v_min, v_room
      from public.discount_floor_room(v_q.total, v_slug, v_q.subcontractor_cost) f;

    if coalesce(v_room, 0) < 60 then
      raise exception '(د-٠) ميزانية الأرضية % لا تتسع لطبقتين — القياس كان سيقع على استبدالٍ مرفوض لا على اقتسام',
        coalesce(v_room, 0);
    end if;

    -- قيمة الكوبون **مشتقّة من الميزانية المقيسة** لا محفورة (اتفاقية ٨)
    v_coupon := floor(v_room / 3);
    insert into public.coupons (code, kind, value, enabled, note)
    values ('LTEST-A', 'amount', v_coupon, true, 'LOYALTY_TESTS');

    -- ── (د-١) الحساب وحده أولاً: السقف هو الميزانية الباقية لا نسبة الإعدادات
    select * into v_pts from public.apply_points(
      v_phone, 1000000, v_q.total, v_slug, v_q.subcontractor_cost, v_coupon);

    if not v_pts.applied then
      raise exception '(د-١) apply_points رفضت بسبب «%» ورصيد العميل % — لا شيء يُقاس',
        coalesce(v_pts.rejection, '(بلا)'), v_bal;
    end if;
    if v_pts.amount > (v_room - v_coupon) then
      raise exception '(د-١) 🔴 خصم النقاط % أكبر من الميزانية الباقية % — ميزانيةٌ ثانية فُتحت من ناتج الأولى (§١)',
        v_pts.amount, v_room - v_coupon;
    end if;
    if v_pts.total_after < v_min then
      raise exception '(د-١) 🔴 ناتج الاستبدال % تحت الأرضية % — نقضُ D-16',
        v_pts.total_after, v_min;
    end if;
    if not v_pts.clamped then
      raise exception '(د-١) طُلب مليون نقطة ولم تُقلَّص — السقوف غير ملزِمة';
    end if;

    -- ── (د-٢) والحجز الحقيقي: الطبقتان معاً في معاملةٍ واحدة
    select * into v_bk from public.create_booking(
      jsonb_build_object('label', 'LT مبدأ', 'lat', 25.0, 'lng', 27.5),
      jsonb_build_object('label', 'LT منتهى', 'lat', 24.5, 'lng', 28.2),
      1, false, 0, 100, 90, 'estimate', v_slug, 'full',
      'LOYALTY_TESTS عميل', v_phone, null, now() + interval '3 days',
      'LOYALTY_TESTS_FIXTURE', 'LTEST-A', null, 0, null, 1000000);
    v_id2 := v_bk.id;

    select (b.trip -> 'discount' ->> 'totalBefore')::numeric,
           (b.trip -> 'discount' ->> 'amount')::numeric,
           (b.trip -> 'loyalty'  ->> 'amount')::numeric
      into v_ride, v_coupon, v_amt
      from public.bookings b where b.id = v_id2;

    if v_ride is null or coalesce(v_coupon, 0) <= 0 then
      raise exception '(د-٢) الكوبون لم يخصم شيئاً — الميزانية لم تُقتسم فالتوكيد بلا معنى';
    end if;
    if coalesce(v_amt, 0) <= 0 then
      raise exception '(د-٢) الحجز بلا لقطة نقاط — التوكيد كان سيمرّ فوق حجزٍ عادي';
    end if;

    select f.min_total into v_min
      from public.discount_floor_room(v_ride, v_slug,
             (select b.subcontractor_cost from public.bookings b where b.id = v_id2)) f;

    -- 🔒 **الحاجز**: الإجمالي النهائي فوق الأرضية بعد **الطبقتين معاً**
    select b.total into v_amt from public.bookings b where b.id = v_id2;
    if v_amt < v_min then
      raise exception '(د-٣) 🔴 إجمالي الحجز % تحت الأرضية % بعد كوبونٍ ونقاط — سقفان جُمعا بدل سقفٍ واحد (§١ · D-16)',
        v_amt, v_min;
    end if;

    -- والدفتر يعكس ما دُفع: قيدُ استبدالٍ واحد بإشارةٍ سالبة
    select count(*)::integer into v_n
      from public.loyalty_entries e
     where e.booking_id = v_id2 and e.direction = 'redeem' and e.points < 0;
    if v_n <> 1 then
      raise exception '(د-٤) قيود الاستبدال على الحجز % لا واحد بإشارةٍ سالبة', v_n;
    end if;

    raise notice '✔ (د) الطبقتان تقتسمان ميزانيةً واحدة: كوبون % ونقاط بقيمة %، والإجمالي % فوق الأرضية %',
      v_coupon, (select (b.trip -> 'loyalty' ->> 'amount') from public.bookings b where b.id = v_id2),
      v_amt, v_min;

    -- ══ (هـ) الإنفاق المزدوج مستحيل، والرصيد لا يصير سالباً ════════════════
    select a.points_balance into v_bal
      from public.loyalty_accounts a where a.phone_norm = v_norm;

    -- استبدالٌ ثانٍ على الحجز نفسه: يرفضه الفهرس الفريد الجزئي
    v_state := null;
    begin
      perform public.redeem_points(v_id2, v_phone, 10, 5);
      v_state := '(قُبل)';
    exception when others then
      get stacked diagnostics v_state = returned_sqlstate;
    end;
    if v_state <> '23505' then
      raise exception '(هـ-١) استبدالٌ ثانٍ على الحجز نفسه انتهى بـ«%» لا 23505 — الحجز يُخصم عليه مرتين', v_state;
    end if;

    -- إنفاقٌ يفوق الرصيد: يُرفع بتلميحه ولا يترك أثراً
    v_hint := null; v_ok := false;
    begin
      perform public.redeem_points(v_id, v_phone, v_bal + 1, 1);
    exception when others then
      v_ok := true;
      get stacked diagnostics v_hint = pg_exception_hint;
    end;
    if not v_ok or v_hint is distinct from 'insufficient-points' then
      raise exception '(هـ-٢) 🔴 إنفاقٌ يفوق الرصيد (%+١) لم يُرفض بـinsufficient-points (التلميح: %)',
        v_bal, coalesce(v_hint, '(بلا)');
    end if;

    select a.points_balance into v_bal2
      from public.loyalty_accounts a where a.phone_norm = v_norm;
    if v_bal2 <> v_bal then
      raise exception '(هـ-٢) الرصيد تغيّر بعد محاولةٍ مرفوضة (% ← %)', v_bal, v_bal2;
    end if;

    -- والقيد نفسه لا يقبل رصيداً سالباً حتى لو أفلت من القفل
    v_state := null;
    begin
      insert into public.loyalty_entries (phone_norm, direction, points, note)
      values (v_norm, 'adjust', -(v_bal + 1000), 'LOYALTY_TESTS رصيدٌ سالب');
      v_state := '(قُبل)';
    exception when others then
      get stacked diagnostics v_state = returned_sqlstate;
    end;
    if v_state <> '23514' then
      raise exception '(هـ-٣) 🔴 قيدٌ ينزل بالرصيد تحت الصفر انتهى بـ«%» لا 23514 — الحاجز الأخير غائب', v_state;
    end if;

    raise notice '✔ (هـ) الاستبدال المزدوج مرفوض بنيوياً، والإنفاق فوق الرصيد مرفوعٌ بتلميحه، والرصيد لا ينزل تحت الصفر';

    -- ══ (و) الحدّان: أقل رصيدٍ يُستبدل · أقصى نسبةٍ تُدفع بالنقاط ═══════════
    select * into v_pts from public.apply_points(
      v_phone, v_cfg.min_redeem_points - 1, v_q.total, v_slug, v_q.subcontractor_cost, 0);
    if v_pts.applied or v_pts.rejection is distinct from 'below-min-points' then
      raise exception '(و-١) طلبٌ دون الحد الأدنى (% نقطة) قُبل أو رُفض بسبب «%»',
        v_cfg.min_redeem_points - 1, coalesce(v_pts.rejection, '(بلا)');
    end if;

    -- بلا طلبٍ أصلاً: **ليس رفضاً** — نظير «بلا رمز» في الكوبون
    select * into v_pts from public.apply_points(
      v_phone, 0, v_q.total, v_slug, v_q.subcontractor_cost, 0);
    if v_pts.applied or v_pts.rejection is not null
       or v_pts.total_after is distinct from round(v_q.total, 2) then
      raise exception '(و-٢) بلا طلبٍ للنقاط: rejection=% total_after=% — المتوقع null و%',
        coalesce(v_pts.rejection, '(بلا)'), v_pts.total_after, round(v_q.total, 2);
    end if;

    -- النسبة القصوى ملزِمة: تُضيَّق إلى ١٪ فيصير هو السقف لا الميزانية
    update public.loyalty_settings set max_redeem_percent = 1;
    select * into v_pts from public.apply_points(
      v_phone, 1000000, v_q.total, v_slug, v_q.subcontractor_cost, 0);
    if not v_pts.applied then
      raise exception '(و-٣) الاستبدال رُفض بنسبةٍ قصوى ١٪ (سبب: %) — لا شيء يُقاس',
        coalesce(v_pts.rejection, '(بلا)');
    end if;
    if v_pts.amount > floor(round(v_q.total, 2) * 1 / 100) then
      raise exception '(و-٣) 🔴 الخصم % يتجاوز ١٪ من % — نسبة الإعدادات ليست حارساً',
        v_pts.amount, v_q.total;
    end if;
    update public.loyalty_settings set max_redeem_percent = 90;

    -- والنظام المطفأ لا يستبدل — «لا نقاط تُسكّ ولا تُستبدل» (§٦)
    update public.loyalty_settings set enabled = false;
    select * into v_pts from public.apply_points(
      v_phone, 1000, v_q.total, v_slug, v_q.subcontractor_cost, 0);
    if v_pts.applied or v_pts.rejection is distinct from 'not-enabled' then
      raise exception '(و-٤) 🔴 النظام مطفأ والاستبدال applied=% rejection=% — المطفأ يستبدل',
        v_pts.applied, coalesce(v_pts.rejection, '(بلا)');
    end if;

    -- ولا يسكّ: حجزٌ يكتمل والنظام مطفأ لا يترك قيداً
    select * into v_bk from public.create_booking(
      jsonb_build_object('label', 'LT مبدأ', 'lat', 25.0, 'lng', 27.5),
      jsonb_build_object('label', 'LT منتهى', 'lat', 24.5, 'lng', 28.2),
      1, false, 0, 100, 90, 'estimate', v_slug, 'full',
      'LOYALTY_TESTS مطفأ', v_phone2, null, now() + interval '3 days',
      'LOYALTY_TESTS_FIXTURE', null, null, 0, null, 0);
    v_id3 := v_bk.id;
    update public.bookings set status = 'under_review' where id = v_id3;
    update public.bookings set status = 'confirmed'    where id = v_id3;
    update public.bookings set status = 'completed'    where id = v_id3;

    select count(*)::integer into v_n
      from public.loyalty_entries e where e.booking_id = v_id3;
    if v_n <> 0 then
      raise exception '(و-٥) 🔴 النظام مطفأ وسُكَّ % قيداً على رحلةٍ مكتملة — التزامٌ يتراكم في الظلام (§٦)', v_n;
    end if;
    if exists (select 1 from public.loyalty_accounts a where a.phone_norm = v_norm2) then
      raise exception '(و-٥) 🔴 وُلد حساب رصيدٍ لهاتفٍ لم يكسب شيئاً — النظام المطفأ يكتب';
    end if;

    update public.loyalty_settings set enabled = true;

    raise notice '✔ (و) الحدّان ملزِمان، و«بلا طلب» ليس رفضاً، والنظام المطفأ لا يسكّ ولا يستبدل';

    -- ══ (ز) الدفتر مُلحَق: التصحيح قيدٌ عاكس لا حذف ═════════════════════════
    select e.id into v_entry
      from public.loyalty_entries e
     where e.booking_id = v_id and e.direction = 'earn' limit 1;

    v_state := null;
    begin
      update public.loyalty_entries set points = 1 where id = v_entry;
      v_state := '(قُبل)';
    exception when others then
      get stacked diagnostics v_hint = pg_exception_hint;
      v_state := coalesce(v_hint, '(بلا تلميح)');
    end;
    if v_state <> 'append-only' then
      raise exception '(ز-١) 🔴 تعديل قيدٍ انتهى بـ«%» — الدفتر ليس مُلحَقاً فقط', v_state;
    end if;

    v_state := null;
    begin
      delete from public.loyalty_entries where id = v_entry;
      v_state := '(قُبل)';
    exception when others then
      get stacked diagnostics v_hint = pg_exception_hint;
      v_state := coalesce(v_hint, '(بلا تلميح)');
    end;
    if v_state <> 'append-only' then
      raise exception '(ز-٢) 🔴 حذف قيدٍ انتهى بـ«%» — تاريخٌ محذوف لا يُدقَّق ولا يُصالح', v_state;
    end if;

    -- والقيد العاكس لا يُعكس مرتين
    insert into public.loyalty_entries (phone_norm, direction, points, booking_id,
                                        reverses_entry_id, note)
    values (v_norm, 'reverse', -5, v_id, v_entry, 'LOYALTY_TESTS عكسٌ يدوي');
    v_state := null;
    begin
      insert into public.loyalty_entries (phone_norm, direction, points, booking_id,
                                          reverses_entry_id, note)
      values (v_norm, 'reverse', -5, v_id, v_entry, 'LOYALTY_TESTS عكسٌ مكرر');
      v_state := '(قُبل)';
    exception when others then
      get stacked diagnostics v_state = returned_sqlstate;
    end;
    if v_state <> '23505' then
      raise exception '(ز-٣) عكسُ قيدٍ مرتين انتهى بـ«%» لا 23505 — الرصيد يُصحَّح مرتين', v_state;
    end if;

    -- وقيدٌ عاكس بلا أصل، أو أصلٌ موسومٌ عكساً: كلاهما مرفوض
    v_state := null;
    begin
      insert into public.loyalty_entries (phone_norm, direction, points, note)
      values (v_norm, 'reverse', -5, 'LOYALTY_TESTS عكسٌ بلا أصل');
      v_state := '(قُبل)';
    exception when others then
      get stacked diagnostics v_state = returned_sqlstate;
    end;
    if v_state <> '23514' then
      raise exception '(ز-٤) قيدٌ عاكس بلا أصل انتهى بـ«%» لا 23514 — تاريخُ الرصيد لا يُفسَّر', v_state;
    end if;

    -- والإشارة تتبع الاتجاه: كسبٌ سالب انقلابُ معنى
    v_state := null;
    begin
      insert into public.loyalty_entries (phone_norm, direction, points, note)
      values (v_norm, 'earn', -5, 'LOYALTY_TESTS كسبٌ سالب');
      v_state := '(قُبل)';
    exception when others then
      get stacked diagnostics v_state = returned_sqlstate;
    end;
    if v_state <> '23514' then
      raise exception '(ز-٥) كسبٌ بإشارةٍ سالبة انتهى بـ«%» لا 23514', v_state;
    end if;

    raise notice '✔ (ز) الدفتر مُلحَقٌ فقط: التعديل والحذف مرفوعان، والعكس مرة واحدة، والإشارة تتبع الاتجاه';

    -- ══ (ح) الإلغاء بعد الاستبدال يعيد النقاط ══════════════════════════════
    select a.points_balance into v_bal
      from public.loyalty_accounts a where a.phone_norm = v_norm;

    select abs(e.points) into v_n
      from public.loyalty_entries e
     where e.booking_id = v_id2 and e.direction = 'redeem';

    update public.bookings set status = 'cancelled' where id = v_id2;

    select a.points_balance into v_bal2
      from public.loyalty_accounts a where a.phone_norm = v_norm;

    if v_bal2 <> v_bal + v_n then
      raise exception '(ح-١) 🔴 الإلغاء أعاد % نقطة لا % (% ← %) — العميل يدفع ثمن رحلةٍ لم تقع',
        v_bal2 - v_bal, v_n, v_bal, v_bal2;
    end if;
    if not exists (
      select 1 from public.loyalty_entries e
       where e.booking_id = v_id2 and e.direction = 'reverse'
         and e.reverses_entry_id is not null and e.points > 0
    ) then
      raise exception '(ح-٢) النقاط عادت بلا قيدٍ عاكسٍ موجبٍ يشير إلى أصله — الدفتر لا يُفسَّر بعد سنة';
    end if;

    raise notice '✔ (ح) الإلغاء بعد الاستبدال أعاد % نقطة بقيدٍ عاكس يشير إلى أصله', v_n;

    -- ══ (ط) العزل: مَن يقرأ ماذا، **بنداءٍ حيّ لا بقراءة سياسة** ════════════
    -- ── (ط-١) صاحب الربط المُثبَت يرى رصيده
    perform set_config('request.jwt.claim.sub', v_u_ref::text, true);
    if (select auth.uid()) is distinct from v_u_ref then
      raise exception '(ط-١) الهوية المحقونة غير فعّالة — القياس الحيّ لا يقيس شيئاً';
    end if;
    execute 'set local role authenticated';

    select * into v_my from public.my_loyalty();
    if v_my.proven_phones is null or v_my.proven_phones < 1 or v_my.points <= 0 then
      raise exception '(ط-١) صاحب الإثبات يرى نقاط=% وهواتف=% — الإثبات لا يفتح رصيداً أصلاً',
        v_my.points, coalesce(v_my.proven_phones::text, '(null)');
    end if;
    if v_my.worth is distinct from round(v_my.points * v_cfg.currency_per_point, 2) then
      raise exception '(ط-١) worth «%» ≠ النقاط × قيمة النقطة — الحساب ليس في القاعدة (D-05)', v_my.worth;
    end if;

    -- ولا عمود ممنوع في الحمولة — **بالقيمة لا بالاسم**
    select to_jsonb(m) into v_row from public.my_loyalty() m;
    if v_row ? 'phone_norm' or v_row::text like ('%' || v_norm || '%') then
      raise exception '(ط-١) 🔴 الهاتف المعياري «%» ظهر في حمولة الرصيد: %', v_norm, v_row::text;
    end if;

    select count(*)::integer into v_n from public.my_loyalty_entries(50);
    if v_n < 1 then
      raise exception '(ط-١) صاحب الإثبات يقرأ صفر حركة — القياس التالي كان سيمرّ فوق صفرين متساويين';
    end if;

    -- ── (ط-٢) 🔒 وحاملُ التوكن **لا يرى شيئاً**
    execute 'reset role';
    perform set_config('request.jwt.claim.sub', v_u_tok::text, true);
    execute 'set local role authenticated';

    select * into v_my from public.my_loyalty();
    if v_my.proven_phones is not null or v_my.points <> 0 then
      raise exception '(ط-٢) 🔴 حاملُ التوكن يرى % نقطة و% هاتفاً مُثبَتاً — حيازةُ رابطٍ مُعاد إرساله ورّثت رصيداً (§٣)',
        v_my.points, v_my.proven_phones;
    end if;
    select count(*)::integer into v_n from public.my_loyalty_entries(50);
    if v_n <> 0 then
      raise exception '(ط-٢) 🔴 حاملُ التوكن يقرأ % حركة من دفتر غيره', v_n;
    end if;

    -- ولا يقرأ الجداول ولو مُنح `select`: السياسة هي الحارس لا المنح
    select count(*)::integer into v_n from public.loyalty_entries;
    if v_n <> 0 then
      raise exception '(ط-٣) 🔴 مستخدمٌ غير مشرف قرأ % صفاً من دفتر الولاء — سياسة is_admin لا تُنفَّذ', v_n;
    end if;
    select count(*)::integer into v_n from public.loyalty_accounts;
    if v_n <> 0 then
      raise exception '(ط-٣) 🔴 مستخدمٌ غير مشرف قرأ % رصيداً — أرقام هواتف مع أرصدتها', v_n;
    end if;
    select count(*)::integer into v_n from public.loyalty_settings;
    if v_n <> 0 then
      raise exception '(ط-٣) مستخدمٌ غير مشرف قرأ إعدادات الولاء (% صفاً)', v_n;
    end if;

    -- ولا ينفّذ محرّك الحساب: أثرُ الأرضية يُستنتج بنداءين (0011)
    v_state := null;
    begin
      perform * from public.apply_points(v_phone, 100, 1000, v_slug, 500, 0);
      v_state := '(نُفِّذت)';
    exception when others then
      get stacked diagnostics v_state = returned_sqlstate;
    end;
    if v_state <> '42501' then
      raise exception '(ط-٤) 🔴 مستخدمٌ مسجَّل نفّذ apply_points (النتيجة «%») — الأرضية تُقرأ بنداءين', v_state;
    end if;

    v_state := null;
    begin
      perform public.redeem_points(v_id, v_phone, 10, 5);
      v_state := '(نُفِّذت)';
    exception when others then
      get stacked diagnostics v_state = returned_sqlstate;
    end;
    if v_state <> '42501' then
      raise exception '(ط-٤) 🔴 مستخدمٌ مسجَّل نفّذ redeem_points (النتيجة «%») — ينفق نقاط غيره', v_state;
    end if;

    execute 'reset role';
    perform set_config('request.jwt.claim.sub', '', true);

    -- ── (ط-٥) 🔒 والزائر `anon`: لا ينفّذ حرفاً ولا يقرأ صفاً
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute 'set local role anon';

      for v_state in select unnest(array['apply_points', 'redeem_points',
                                         'loyalty_config', 'loyalty_reconcile',
                                         'my_loyalty'])
      loop
        v_hint := null;
        begin
          case v_state
            when 'apply_points'      then perform * from public.apply_points(v_phone, 100, 1000, v_slug, 500, 0);
            when 'redeem_points'     then perform public.redeem_points(v_id, v_phone, 10, 5);
            when 'loyalty_config'    then perform * from public.loyalty_config();
            when 'loyalty_reconcile' then perform * from public.loyalty_reconcile();
            when 'my_loyalty'        then perform * from public.my_loyalty();
          end case;
          v_hint := '(نُفِّذت)';
        exception when others then
          get stacked diagnostics v_hint = returned_sqlstate;
        end;
        if v_hint <> '42501' then
          raise exception '(ط-٥) 🔴 anon نفّذ %() والنتيجة «%» لا 42501', v_state, v_hint;
        end if;
      end loop;

      for v_state in select unnest(array['loyalty_entries', 'loyalty_accounts', 'loyalty_settings'])
      loop
        v_hint := null;
        begin
          execute format('select count(*) from public.%I', v_state);
          v_hint := '(قُرئ)';
        exception when others then
          get stacked diagnostics v_hint = returned_sqlstate;
        end;
        if v_hint <> '42501' then
          raise exception '(ط-٥) 🔴 anon قرأ % والنتيجة «%» لا 42501', v_state, v_hint;
        end if;
      end loop;

      execute 'reset role';
      raise notice '✔ (ط) العزل: الإثبات يفتح · التوكن لا يفتح · المسجَّل لا يقرأ الجداول ولا ينفّذ المحرّك · anon لا يبلغ شيئاً';
    else
      raise notice '⚠ (ط) دور anon غير موجود على هذه القاعدة — قياسُ الزائر متخطّى';
    end if;

    -- ══ (ي-١) المطابقة: الرصيد المادّي = مجموع الدفتر ═══════════════════════
    select count(*)::integer into v_n from public.loyalty_reconcile();
    if v_n <> 0 then
      raise exception '(ي-١) 🔴 % هاتفاً اختلف رصيده المادّي عن مجموع دفتره — مصدران لرقمٍ واحد (النمط ٨)', v_n;
    end if;
    -- مِجسُّ المِجسّ: فرقٌ مزروع في معاملةٍ فرعية تُرجَع فوراً — بدونه يكون
    -- «صفر فروق» عمى الكاشف لا صحة الأرصدة (النمط ٩).
    begin
      update public.loyalty_accounts set points_balance = points_balance + 7
       where phone_norm = v_norm;
      select count(*)::integer into v_exp from public.loyalty_reconcile();
      raise exception 'LT_RECON_ROLLBACK';
    exception when others then
      if sqlerrm <> 'LT_RECON_ROLLBACK' then raise; end if;
    end;
    if v_exp <> 1 then
      raise exception '(ي-١) كاشف المطابقة لم يرَ فرقاً مزروعاً (رأى % صفاً) — «صفر فروق» كان عماه', v_exp;
    end if;

    raise notice '✔ (ي-١) الرصيد المادّي يطابق الدفتر، والكاشف يرى الفرق المزروع';

    -- كل ما سبق يختفي هنا معاً: الإعدادات والفئة والخدمة والكوبون والمستخدمان
    -- والحجوزات والقيود والأرصدة والروابط — بلا سطر `delete` واحد.
    raise exception 'LOYALTY_TESTS_ROLLBACK';
  exception
    when others then
      execute 'reset role';
      perform set_config('request.jwt.claim.sub', '', true);
      if sqlerrm <> 'LOYALTY_TESTS_ROLLBACK' then raise; end if;
  end;

  raise notice '✔ القياس الحيّ تمّ داخل معاملةٍ فرعية أُرجعت بكاملها';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ي-٢) 🔒 لم يبقَ أثر — وهذه **قاعدة الإنتاج نفسها**
--
-- الأعداد تُقارَن بخط الأساس المقروء في (٠-ب). وأي فرقٍ يعني أن قياساً تسرّب
-- من المعاملة الفرعية — وصفٌّ واحد في `loyalty_entries` هو نقاطٌ في حساب عميل.
-- ----------------------------------------------------------------------------
do $$
declare
  v_e integer; v_a integer; v_b integer; v_c integer; v_en boolean;
  v_be integer := current_setting('tours.lt_e')::integer;
  v_ba integer := current_setting('tours.lt_a')::integer;
  v_bb integer := current_setting('tours.lt_b')::integer;
  v_bc integer := current_setting('tours.lt_c')::integer;
  v_ben boolean := current_setting('tours.lt_en')::boolean;
begin
  select count(*)::integer into v_e from public.loyalty_entries;
  select count(*)::integer into v_a from public.loyalty_accounts;
  select count(*)::integer into v_b from public.bookings;
  select count(*)::integer into v_c from public.coupons;
  select l.enabled into v_en from public.loyalty_config() l;

  if v_e <> v_be then
    raise exception 'تنظيف ناقص: قيود الولاء % والأساس % — صفٌّ باقٍ هنا نقاطٌ في حساب عميل حقيقي', v_e, v_be;
  end if;
  if v_a <> v_ba then
    raise exception 'تنظيف ناقص: أرصدة الولاء % والأساس %', v_a, v_ba;
  end if;
  if v_b <> v_bb then
    raise exception 'تنظيف ناقص: الحجوزات % والأساس %', v_b, v_bb;
  end if;
  if v_c <> v_bc then
    raise exception 'تنظيف ناقص: الكوبونات % والأساس %', v_c, v_bc;
  end if;
  -- والإعدادات كما كانت: لا قاعدةَ يبقى نظام ولائها مفعَّلاً لأن اختباراً سقط
  if v_en is distinct from v_ben then
    raise exception 'تنظيف ناقص: حالة تفعيل الولاء % والأساس % — إعدادٌ تسرّب من القياس', v_en, v_ben;
  end if;

  -- وبقايا الفيكسترة بأسمائها، لو تسرّبت من بابٍ آخر
  select count(*)::integer into v_e
    from public.vehicle_classes vc where vc.slug like 'ltest-%';
  if v_e <> 0 then
    raise exception 'تنظيف ناقص: % فئة سيارة اختبارية باقية', v_e;
  end if;
  select count(*)::integer into v_e
    from public.extra_services x where x.slug like 'ltest-%';
  if v_e <> 0 then
    raise exception 'تنظيف ناقص: % خدمة إضافية اختبارية باقية', v_e;
  end if;
  select count(*)::integer into v_e
    from public.bookings b where b.trip ->> 'notes' like 'LOYALTY_TESTS_FIXTURE%';
  if v_e <> 0 then
    raise exception 'تنظيف ناقص: % حجز اختباري باقٍ', v_e;
  end if;

  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claims', '', false);

  raise notice 'ALL PASSED — الكسب مُشغّلٌ على الاكتمال وأساسه ride_after بلا خدمات، وصفُّ كسبٍ واحد لكل رحلة مهما تعدّد الربط، والاستبدال يقتسم ميزانية الأرضية مع الكوبون فلا يخترقها، والإنفاق المزدوج مستحيل، والدفتر مُلحَقٌ يُصحَّح بالعكس، والإلغاء يعيد النقاط، والتوكن لا يفتح رصيداً، وanon لا يبلغ شيئاً — وصفر أثرٍ في القاعدة';
end;
$$;
