-- ============================================================================
-- partner_settlement_tests.sql — اختبارات قبول للتحصيل من المتعهد
--                                (الاتجاه الثاني للحساب المفتوح — هجرة 0029)
--
-- كيف تشغّله: `node scripts/db-test.mjs partner_settlement` أو الصق الملف كاملاً
-- في SQL Editor واضغط Run. النجاح = آخر سطر «ALL PASSED». أي فشل يرمي exception
-- برسالة عربية تحدد الاختبار والقيمة المتوقعة والفعلية.
--
-- ومن psql بدور صاحب القاعدة **لا بد** من ON_ERROR_STOP و‑1 معاً:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f supabase/tests/partner_settlement_tests.sql
-- (‏`db-test.mjs` يرسل الملف كاملاً في استعلام واحد ⇒ معاملة ضمنية واحدة.)
--
-- ── 🔒 لماذا كل كتلة تكتب قيداً تُرجِع نفسها ─────────────────────────────────
-- هذه قاعدة بدر الحيّة: فيها ٣٩١ صف مقاصة قائم وحسابات خزينة حقيقية. وكل ما
-- تختبره هذه المجموعة **يكتب في الدفتر** (قيد تحصيل، قيد عكس، تسوية). فأي كتلة
-- تكتب صفاً مالياً تنتهي بـ `raise exception 'ROLLBACK_MARKER'` — وكتلة استثناء
-- plpgsql نقطة حفظ ضمنية، فيُرجَع كل ما بداخلها: الصفوف والقيود التي ولّدتها
-- المُشغّلات وأرصدة الخزينة معاً. والقسم (ك-٠) يبرهن أن الإرجاع وقع فعلاً.
--
-- والمتعهدان والحسابان **من صنع هذا الملف وحده** بوسم `PARTNER_SETTLEMENT_FIXTURE`
-- ومعرّفات تبدأ بـ `e4000000-0000-4000-8000-0000000000`، وتُمسح في البداية
-- والنهاية معاً — فلا يُلمس متعهد حقيقي ولا حساب حقيقي ولا صف إعدادات واحد
-- (هذا الملف **لا يمسّ `partner_credit_settings` إطلاقاً**، ولا يستدعي بثاً).
--
-- ── منهج الملف ──────────────────────────────────────────────────────────────
--   • **كل رقم متوقَّع مُشتق من مُدخل التجهيز نفسه**: الإجمالي والتكلفة والعربون
--     وحدها مكتوبة (وهي مثال `docs/FINANCE.md` §٣ حرفياً)، وما عداها محسوب منها
--     — الباقي النقدي، والصافي، ومبلغ التحصيل، وأثر الخزينة، وإقفال الربح.
--   • **لكل فحص سالب شاهد إيجابي بجواره** (النمط ٩ في handover/LESSONS.md):
--     «الالتزام بحساب مرفوض» بجوار «النقد بحساب مقبول»، و«الزائر لا ينفّذ» بجوار
--     «المسجَّل ينفّذ»، و«بلا هوية صفر صفوف» بجوار «بهوية صفٌّ واحد».
--   • **الرفض يُقاس برمزه لا بوقوع استثناء**: كل حارس يُتحقق من `pg_exception_hint`
--     أو من اسم القيد في `constraint_name` — فرفضٌ لسبب آخر لا يُقرأ نجاحاً.
--
-- ── حواجز هذا الملف (لا تُغلق المرحلة وأحدها راسب) ──────────────────────────
-- (١) القسم (أ): **الحساب كاملاً** — ‎360−‎ ثم صفر بالضبط، والخزينة ترتفع ٣٦٠،
--     ومجموعها يقفل عند الربح (‏٢٬١٦٠ − ١٬٢٠٠). هذا الاختبار **هو** الميزة.
-- (٢) القسم (ب): **قيد واحد لا اثنان** يفعل الأمرين. لو صار قيدين لتضاعف أثر
--     الخزينة أو انفصل عن الدين — والعدّ هنا `= 1` لا `>= 1`.
-- (٣) القسم (ز): **المبلغ السالب مرفوض** بـ negative-amount. هذا فخٌّ قيس أثره
--     حياً (‏61,034− ⇒ 61,134−)، وإعادة فتحه تعمّق ديناً بنيّة تخفيضه.
-- (٤) القسم (و): **تجاوز الدين مسموح**. الاختبار هنا يمنع «إصلاحاً» بحسن نية.
-- (٥) القسم (ط): `portal_balance` **بلا وسيط** وبلا هوية ⇒ صفر صفوف. إضافة
--     `p_sub` لاحقاً تحوّلها إلى تسريب رصيد كل متعهد لكل متعهد (سابقة D-20).
--
-- المرجع: supabase/migrations/0029_partner_settlement.sql (العقد التنفيذي)
--         + lib/finance-types.ts (‏`PartnerSettlementRole` و`PartnerSettlementReceiptRow`)
--         + docs/FINANCE.md §٣ و§٤ (المثال المحسوب)
--         + supabase/tests/finance_tests.sql القسم (ج) — إثبات قاعدة الإشارة
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (٠) الشروط المسبقة + تنظيف بقايا تشغيل سابق
-- ----------------------------------------------------------------------------
do $$
declare
  v_missing text;
  v_subs    uuid[] := array['e4000000-0000-4000-8000-000000000001'::uuid,
                            'e4000000-0000-4000-8000-000000000002'::uuid];
  v_accs    uuid[] := array['e4000000-0000-4000-8000-000000000021'::uuid,
                            'e4000000-0000-4000-8000-000000000022'::uuid];
begin
  -- الهوية تُفرَّغ أولاً: أي بقية من مطالبة jwt تجعل finance_admin_allowed تحسبنا
  -- مستخدماً عادياً فترفض دوال المقاصة بلا سبب مفهوم.
  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claims', '', false);

  select string_agg(x.sig, '، ')
    into v_missing
  from (values
    ('public.record_partner_settlement(uuid, uuid, numeric, timestamptz, text, text)'),
    ('public.portal_balance()'),
    ('public.record_partner_adjustment(uuid, text, numeric, timestamptz, text)'),
    ('public.partner_statement(uuid, date, date)'),
    ('public.ledger_on_partner_settlement_insert()'),
    ('public.ledger_on_partner_settlement_deleted()'),
    ('public.partner_debt(uuid)'),
    ('public.partner_over_debt_limit(uuid)'),
    ('public.partner_credit_config()'),
    ('public.current_subcontractor_id()'),
    ('public.finance_admin_allowed()')
  ) as x(sig)
  where to_regprocedure(x.sig) is null;

  if v_missing is not null then
    raise exception 'شرط مسبق: دوال مفقودة (نفّذ 0029_partner_settlement.sql أولاً): %', v_missing;
  end if;

  select string_agg(x.rel, '، ')
    into v_missing
  from (values
    ('public.partner_settlements'), ('public.ledger_entries'),
    ('public.v_ledger_resolved'), ('public.v_account_balances'),
    ('public.v_partner_settlements'), ('public.payment_accounts'),
    ('public.subcontractors'), ('public.profiles')
  ) as x(rel)
  where to_regclass(x.rel) is null;

  if v_missing is not null then
    raise exception 'شرط مسبق: كائنات مفقودة: %', v_missing;
  end if;

  -- عمود 0029 في العرض — وموضعه ١١ (‏`create or replace view` لا تسمح بإدراجه وسطاً)
  if not exists (
    select 1 from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = 'v_partner_settlements'
      and c.column_name = 'received' and c.ordinal_position = 11
  ) then
    raise exception
      'شرط مسبق: received ليس العمود ١١ في v_partner_settlements — 0029 غير مطبَّقة أو أُعيد ترتيب العرض';
  end if;

  -- المُشغّلان — لأن نصف هذه الميزة **في الجدول** لا في الدالة
  select string_agg(x.tg, '، ')
    into v_missing
  from (values ('partner_settlements_ledger_insert'), ('partner_settlements_ledger_deleted'),
               ('partner_settlements_immutable')) as x(tg)
  where not exists (
    select 1 from pg_trigger t
    where t.tgrelid = 'public.partner_settlements'::regclass
      and t.tgname  = x.tg and not t.tgisinternal
  );

  if v_missing is not null then
    raise exception 'شرط مسبق: مُشغّلات partner_settlements غير مركَّبة: %', v_missing;
  end if;

  -- الحارس المالي: بلا هوية مقبولة تسقط كل الأقسام بـ forbidden لا بعطل حقيقي
  if not public.finance_admin_allowed() then
    raise exception
      'شرط مسبق: finance_admin_allowed ترفض اتصال الاختبار (session_user = %) — دوال المقاصة لا تُختبر بهذه الهوية',
      session_user;
  end if;

  -- ── تنظيف بقايا تشغيل سابق ──
  -- القيود العاكسة أولاً (‏`reverses_entry_id` بـ on delete restrict)، ثم الأصول،
  -- ثم صفوف التحصيل (فلا يجد مُشغّل الحذف قيداً يعكسه فيكتب قيداً جديداً)،
  -- ثم المتعهدون والحسابات (‏`subcontractor_id` بـ on delete set null فالحذف
  -- قبل تنظيف الدفتر يترك قيوداً يتيمة تُفسد مقاصة القاعدة).
  delete from public.ledger_entries e
   where e.reverses_entry_id is not null
     and (e.subcontractor_id = any (v_subs) or e.account_id = any (v_accs));

  delete from public.ledger_entries e
   where e.subcontractor_id = any (v_subs) or e.account_id = any (v_accs);

  delete from public.partner_settlements s
   where s.subcontractor_id = any (v_subs) or s.account_id = any (v_accs);

  delete from public.subcontractors s where s.company_name like 'PARTNER_SETTLEMENT_FIXTURE%';
  delete from public.payment_accounts pa where pa.label like 'PARTNER_SETTLEMENT_FIXTURE%';

  delete from public.profiles p where p.id = 'e4000000-0000-4000-8000-0000000000aa'::uuid;
  begin
    delete from auth.users u where u.id = 'e4000000-0000-4000-8000-0000000000aa'::uuid;
  exception when others then null;
  end;

  raise notice '✔ (٠) الشروط المسبقة سليمة — 0029 مطبَّقة والحارس المالي يقبل هذا الاتصال';
end;
$$;

-- ----------------------------------------------------------------------------
-- (٠-ب) التجهيز: حسابا خزينة (نقدي وغير نقدي) ومتعهدان وهوية دخول
--
--   الحساب النقدي (‏21): `kind = 'cash'` — المرجع **اختياري** عليه.
--   الحساب غير النقدي (‏22): محفظة — المرجع **إلزامي** عليه. والقسم (هـ) يقرأ
--     `kind` من الجدول نفسه لا من قائمة مكتوبة، فتغيير نوع الحساب لا يُبقي
--     الاختبار أخضر وهو يقيس شيئاً آخر.
--   المتعهد (‏01): صاحب المثال المحسوب.
--   المتعهد الآخر (‏02): شاهد العزل في `portal_balance` — أرقامه تختلف عمداً.
--
-- الرصيد الافتتاحي صفر في الحسابين: فكل حركة تُقاس **فرقاً** من صفر معلوم،
-- ومع ذلك تُقرأ القيمة من الجدول لا تُفترض (‏v_open في القسم أ).
-- ----------------------------------------------------------------------------
do $$
declare
  v_sub   constant uuid := 'e4000000-0000-4000-8000-000000000001';
  v_other constant uuid := 'e4000000-0000-4000-8000-000000000002';
  v_cash  constant uuid := 'e4000000-0000-4000-8000-000000000021';
  v_wall  constant uuid := 'e4000000-0000-4000-8000-000000000022';
  v_prof  constant uuid := 'e4000000-0000-4000-8000-0000000000aa';
begin
  insert into public.payment_accounts
    (id, kind, label, handle, holder_name, opening_balance, active, sort, customer_facing)
  values
    (v_cash, 'cash',   'PARTNER_SETTLEMENT_FIXTURE خزينة نقدية', 'PSF-CASH-BOX',  'اختبار', 0, true, 992, false),
    (v_wall, 'wallet', 'PARTNER_SETTLEMENT_FIXTURE محفظة',       'PSF-01000000000', 'اختبار', 0, true, 993, true);

  insert into public.subcontractors (id, company_name, phone, email, status)
  values
    (v_sub,   'PARTNER_SETTLEMENT_FIXTURE المتعهد',      '01000078801', 'ps-main@local.invalid',  'approved'),
    (v_other, 'PARTNER_SETTLEMENT_FIXTURE متعهد آخر',    '01000078802', 'ps-other@local.invalid', 'approved');

  perform set_config('tours.ps_sub',   v_sub::text,   false);
  perform set_config('tours.ps_other', v_other::text, false);
  perform set_config('tours.ps_cash',  v_cash::text,  false);
  perform set_config('tours.ps_wall',  v_wall::text,  false);
  perform set_config('tours.ps_prof',  v_prof::text,  false);

  -- شاهد إيجابي على التجهيز نفسه: النوعان مختلفان فعلاً كما تقرؤهما الدالة
  if (select pa.kind from public.payment_accounts pa where pa.id = v_cash) <> 'cash' then
    raise exception '(٠-ب) حساب التجهيز النقدي ليس kind = cash — القسم (هـ) سيقيس غير ما يدّعي';
  end if;
  if (select pa.kind from public.payment_accounts pa where pa.id = v_wall) = 'cash' then
    raise exception '(٠-ب) حساب التجهيز غير النقدي kind = cash — لا مرجع إلزامي لنختبره';
  end if;

  -- هوية دخول للمتعهد — أساس قسمَي `portal_balance` ورفض غير الإدارة
  perform set_config('tours.ps_identity', '0', false);
  begin
    insert into auth.users (id, email) values (v_prof, 'ps-main@local.invalid');
    insert into public.profiles (id, role, full_name)
    values (v_prof, 'subcontractor', 'متعهد اختبار التحصيل')
    on conflict (id) do update set role = 'subcontractor';
    update public.subcontractors set profile_id = v_prof where id = v_sub;
    perform set_config('tours.ps_identity', '1', false);
  exception
    when others then
      raise notice '  ↳ تعذّر إنشاء هوية دخول للمتعهد (%) — قسما البورتال والحارس الإداري سيُتخطّيان', sqlerrm;
  end;

  raise notice '✔ (٠-ب) متعهدان وحسابا خزينة (نقدي + محفظة) بافتتاحي صفر، وهوية دخول = %',
    current_setting('tours.ps_identity');
end;
$$;

-- ----------------------------------------------------------------------------
-- (أ) 🔒 الحساب كاملاً — مثال `docs/FINANCE.md` §٣ المعكوس، من طرفه إلى طرفه
--
-- رحلة إجماليها ٢٬١٦٠ بتكلفة متعهد ١٬٢٠٠: العميل حوّل ٦٠٠ عرباناً إلى خزينتنا،
-- وسلّم الباقي (‏١٬٥٦٠) **نقداً للسائق**. فالمتعهد خرج وقد قبض من مالنا أكثر من
-- مستحقه ⇒ الصافي سالب ⇒ **عليه لنا**:
--
--     earned 1200 − collected 1560 − paid 0 + received 0 = −360
--     ثم يسدّد ٣٦٠ ⇒ 1200 − 1560 − 0 + 360 = 0            ⇒ الصافي **صفر**
--     والخزينة: 600 + 360 = 960 = الربح (2160 − 1200)      ⇒ يقفل.
--
-- الثلاثة المكتوبة (الإجمالي والتكلفة والعربون) هي مُدخل المثال. وما عداها —
-- الباقي النقدي والصافي ومبلغ التحصيل وأثر الخزينة — **يُشتق منها هنا**، فلا
-- يبقى رقم متوقَّع كُتب بيدنا ليطابق ما نريد رؤيته.
-- ----------------------------------------------------------------------------
do $$
declare
  v_sub     uuid := current_setting('tours.ps_sub')::uuid;
  v_acc     uuid := current_setting('tours.ps_cash')::uuid;
  v_total   constant numeric := 2160;    -- إجمالي الرحلة كما في docs/FINANCE.md
  v_cost    constant numeric := 1200;    -- مستحق المتعهد (إسناد يدوي أرخص)
  v_deposit constant numeric := 600;     -- ما حوّله العميل إلى خزينتنا
  v_at      constant timestamptz := timestamptz '2019-03-10 12:00:00+02';
  v_at2     constant timestamptz := timestamptz '2019-03-20 12:00:00+02';
  v_driver  numeric;   -- ما سلّمه العميل نقداً للسائق
  v_expect  numeric;   -- الصافي المتوقَّع قبل التحصيل
  v_settle  numeric;   -- ما يسدّده المتعهد
  v_open    numeric;
  v_bal0    numeric;
  v_bal1    numeric;
  v_net1    numeric;
  v_s       record;
  v_rec     record;
begin
  v_driver := v_total - v_deposit;    -- ١٬٥٦٠
  v_expect := v_cost - v_driver;      -- ‎360−‎ ⇒ عليه لنا

  -- شاهد إيجابي على المُدخل نفسه: هذه هي **الحالة المعكوسة** لا الحالة العادية.
  -- لو صار المُدخل يعطي صافياً موجباً لما اختُبر «يدفع لنا» أصلاً.
  if v_expect >= 0 then
    raise exception
      '(أ-٠) مُدخل المثال يعطي صافياً % غير سالب — المتعهد ليس مديناً لنا فلا شيء نحصّله', v_expect;
  end if;

  select pa.opening_balance into v_open from public.payment_accounts pa where pa.id = v_acc;

  -- قيود الرحلة الثلاثة كما تكتبها القاعدة عند الاكتمال واعتماد الإيصال
  insert into public.ledger_entries
    (account_id, direction, amount, occurred_at, source_type, subcontractor_id, settlement_role, note)
  values
    (null, 'out', v_cost,   v_at, 'partner_payout',     v_sub, 'earned',
     'PARTNER_SETTLEMENT_FIXTURE مستحق المتعهد عن الرحلة'),
    (null, 'in',  v_driver, v_at, 'partner_collection', v_sub, 'collected',
     'PARTNER_SETTLEMENT_FIXTURE ما قبضه السائق نقداً من العميل');

  insert into public.ledger_entries
    (account_id, direction, amount, occurred_at, source_type, note)
  values
    (v_acc, 'in', v_deposit, v_at, 'payment',
     'PARTNER_SETTLEMENT_FIXTURE عربون العميل إلى خزينتنا');

  -- (أ-١) قبل التحصيل: المعادلة الرباعية تعطي ‎360−‎ بالضبط
  select * into v_s from public.v_partner_settlements ps where ps.subcontractor_id = v_sub;
  if not found then
    raise exception '(أ-١) المتعهد غائب عن عرض المقاصة رغم قيديه في الدفتر';
  end if;

  if v_s.earned <> v_cost or v_s.collected <> v_driver then
    raise exception '(أ-١) المستحق % والمحصَّل % — المتوقع % و%',
      v_s.earned, v_s.collected, v_cost, v_driver;
  end if;
  if v_s.paid <> 0 or v_s.received <> 0 then
    raise exception '(أ-١) المدفوع % والمُحصَّل منه % — المتوقع صفران قبل أي تسوية',
      v_s.paid, v_s.received;
  end if;
  if v_s.net_due <> v_s.earned - v_s.collected - v_s.paid + v_s.received then
    raise exception '(أ-١) 🔒 الصافي % لا يساوي (% − % − % + %) — المعادلة الرباعية مكسورة',
      v_s.net_due, v_s.earned, v_s.collected, v_s.paid, v_s.received;
  end if;
  if v_s.net_due <> v_expect then
    raise exception '(أ-١) الصافي % — المتوقع % (‏% مستحقاً − % نقداً في يده)',
      v_s.net_due, v_expect, v_cost, v_driver;
  end if;
  if v_s.owed_to_us <> -v_expect then
    raise exception '(أ-١) «عليه لنا» % — المتوقع %', v_s.owed_to_us, -v_expect;
  end if;

  -- (أ-٢) يسدّد ما عليه بالضبط ⇒ الصافي **صفر**، والخزينة ترتفع بالمبلغ نفسه
  v_settle := v_s.owed_to_us;

  select ab.balance into v_bal0 from public.v_account_balances ab where ab.account_id = v_acc;

  select * into v_rec
  from public.record_partner_settlement(
         v_sub, v_acc, v_settle, v_at2, null,
         'PARTNER_SETTLEMENT_FIXTURE تحصيل رصيد الرحلة نقداً');

  if v_rec.id is null or v_rec.entry_id is null then
    raise exception '(أ-٢) record_partner_settlement لم تُرجع صفاً أو لم تولّد قيداً';
  end if;

  select ps.net_due into v_net1 from public.v_partner_settlements ps where ps.subcontractor_id = v_sub;
  select ab.balance into v_bal1 from public.v_account_balances ab where ab.account_id = v_acc;

  -- 🔑 الصافي صفر **بالضبط** لا «قريب من صفر»
  if v_net1 <> 0 then
    raise exception
      '(أ-٢) 🔒 الصافي بعد تحصيل % هو % لا صفر — الدور الرابع لا يدخل المعادلة بإشارته الصحيحة',
      v_settle, v_net1;
  end if;
  if v_rec.net_due <> v_net1 then
    raise exception '(أ-٢) الصافي من الدالة % ومن العرض % — مصدران متضاربان لرقم واحد',
      v_rec.net_due, v_net1;
  end if;

  -- والخزينة ارتفعت بمقدار التحصيل **تماماً** — لا أقل (فلا أثر) ولا أكثر (فقيدان)
  if v_bal1 - v_bal0 <> v_settle then
    raise exception
      '(أ-٢) 🔒 رصيد الخزينة ارتفع % بتحصيل % (من % إلى %) — القيد الواحد لا يفعل الأمرين',
      v_bal1 - v_bal0, v_settle, v_bal0, v_bal1;
  end if;
  if v_rec.balance <> v_bal1 then
    raise exception '(أ-٢) الرصيد الذي أعادته الدالة % والعرض يقول %', v_rec.balance, v_bal1;
  end if;

  -- (أ-٣) 🔑 الإقفال: ما في الخزينة = الربح. وهو الفحص الذي تصفه FINANCE.md
  --       بأنه «ليس صدفة بل اختبار تُجريه في أي وقت».
  if v_bal1 <> v_open + v_deposit + v_settle then
    raise exception '(أ-٣) رصيد الخزينة % — المتوقع % (افتتاحي % + عربون % + تحصيل %)',
      v_bal1, v_open + v_deposit + v_settle, v_open, v_deposit, v_settle;
  end if;
  if v_bal1 - v_open <> v_total - v_cost then
    raise exception
      '(أ-٣) 🔒 ما دخل الخزينة % لا يساوي ربح الرحلة % (‏% إجمالي − % تكلفة) — الحساب لا يقفل',
      v_bal1 - v_open, v_total - v_cost, v_total, v_cost;
  end if;

  raise notice
    '✔ (أ) 🔒 المثال كاملاً: مستحق % وقبض % ⇒ الصافي % — وبتحصيل % صار صفراً، والخزينة % = الربح %',
    v_cost, v_driver, v_expect, v_settle, v_bal1 - v_open, v_total - v_cost;

  raise exception 'ROLLBACK_MARKER';
exception
  when others then
    if sqlerrm <> 'ROLLBACK_MARKER' then raise; end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- (ب) 🔒 قيدٌ **واحد** بأثرين — لا قيدان ولا تجميع في الواجهة
--
-- العدّ هنا `= 1` لا `>= 1` عمداً: قيدان بدور `received` يضاعفان أثر الخزينة أو
-- يفصلانه عن الدين، وكلاهما يمرّ من فحص «على الأقل واحد» بهدوء.
-- ----------------------------------------------------------------------------
do $$
declare
  v_sub    uuid := current_setting('tours.ps_sub')::uuid;
  v_acc    uuid := current_setting('tours.ps_cash')::uuid;
  v_at     constant timestamptz := timestamptz '2019-03-10 12:00:00+02';
  v_amount constant numeric := 250;
  v_before integer;
  v_after  integer;
  v_n      integer;
  v_e      record;
  v_rec    record;
begin
  insert into public.ledger_entries
    (account_id, direction, amount, occurred_at, source_type, subcontractor_id, settlement_role, note)
  values
    (null, 'out', 1000, v_at, 'partner_payout',     v_sub, 'earned',
     'PARTNER_SETTLEMENT_FIXTURE مستحق (ب)'),
    (null, 'in',  1500, v_at, 'partner_collection', v_sub, 'collected',
     'PARTNER_SETTLEMENT_FIXTURE محصَّل (ب)');

  select count(*)::integer into v_before
  from public.ledger_entries e where e.subcontractor_id = v_sub;

  select * into v_rec
  from public.record_partner_settlement(
         v_sub, v_acc, v_amount, v_at, null, 'PARTNER_SETTLEMENT_FIXTURE قيد واحد');

  -- (ب-١) قيدٌ واحد لهذا المصدر — لا صفر ولا اثنان
  select count(*)::integer into v_n
  from public.ledger_entries e
  where e.source_type = 'partner_settlement' and e.source_id = v_rec.id;
  if v_n <> 1 then
    raise exception '(ب-١) 🔒 التحصيل ولّد % قيداً — المتوقع قيدٌ واحد بالضبط', v_n;
  end if;

  -- (ب-٢) ولم يُكتب في الدفتر شيءٌ آخر باسم هذا المتعهد سواه
  select count(*)::integer into v_after
  from public.ledger_entries e where e.subcontractor_id = v_sub;
  if v_after - v_before <> 1 then
    raise exception '(ب-٢) قيود المتعهد زادت % بتحصيل واحد — المتوقع قيداً واحداً', v_after - v_before;
  end if;

  -- (ب-٣) شكل القيد: نقدٌ داخل بحساب حقيقي بدور received ومصدره السابع
  select * into v_e from public.ledger_entries e where e.id = v_rec.entry_id;
  if not found then
    raise exception '(ب-٣) القيد الذي أعادت الدالة معرّفه غير موجود في الدفتر';
  end if;
  if v_e.settlement_role is distinct from 'received' then
    raise exception '(ب-٣) دور القيد «%» — المتوقع received مخزَّناً لا مستنتَجاً',
      coalesce(v_e.settlement_role, 'بلا');
  end if;
  if v_e.direction <> 'in' then
    raise exception '(ب-٣) اتجاه قيد التحصيل «%» — المتوقع in (المال يدخل خزينتنا)', v_e.direction;
  end if;
  if v_e.account_id is distinct from v_acc then
    raise exception '(ب-٣) 🔒 قيد التحصيل بحساب «%» — المتوقع حساب الخزينة % وإلا لم يتحرك رصيد',
      coalesce(v_e.account_id::text, 'بلا'), v_acc;
  end if;
  if v_e.source_type <> 'partner_settlement' then
    raise exception '(ب-٣) مصدر القيد «%» — المتوقع partner_settlement', v_e.source_type;
  end if;
  if v_e.subcontractor_id is distinct from v_sub or v_e.amount <> v_amount then
    raise exception '(ب-٣) القيد بمتعهد «%» ومبلغ % — المتوقع % و%',
      coalesce(v_e.subcontractor_id::text, 'بلا'), v_e.amount, v_sub, v_amount;
  end if;

  -- (ب-٤) وهذا القيد **وحده** هو ما يرفع الخزينة ويخفض الدين معاً: نحذفه من
  --        الحسبة ذهنياً بمقارنة أثره المزدوج بمبلغه الواحد.
  if (select ab.total_in from public.v_account_balances ab where ab.account_id = v_acc) <> v_amount then
    raise exception '(ب-٤) داخل الحساب % — المتوقع % (قيد التحصيل وحده)',
      (select ab.total_in from public.v_account_balances ab where ab.account_id = v_acc), v_amount;
  end if;
  if (select ps.received from public.v_partner_settlements ps where ps.subcontractor_id = v_sub)
     <> v_amount then
    raise exception '(ب-٤) عمود received في المقاصة % — المتوقع %',
      (select ps.received from public.v_partner_settlements ps where ps.subcontractor_id = v_sub),
      v_amount;
  end if;

  raise notice '✔ (ب) 🔒 التحصيل قيدٌ واحد (received · in · بحساب حقيقي · partner_settlement) يرفع الخزينة ويخفض الدين معاً';

  raise exception 'ROLLBACK_MARKER';
exception
  when others then
    if sqlerrm <> 'ROLLBACK_MARKER' then raise; end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- (ج) تناظر الالتزام والنقد — أين يقع الحارس فعلاً
--
-- ⚠ **حدٌّ معرفي مكتوب، لا اختصار:** `ledger_entries_liability_no_account_chk`
-- قيدٌ **أحاديّ الاتجاه** بنصّه: `settlement_role in ('paid','received') or
-- account_id is null`. أي أنه يمنع قيد الالتزام (‏`earned`/`collected`) من حمل
-- حساب خزينة، ولا يُلزم قيد النقد بحساب — والهجرة نفسها تثبت ذلك في فحصها
-- (ق٩-١ب): قيد `received` بلا حساب **مقبول** عندها عمداً.
--
-- فالنصف الثاني من التناظر محروسٌ في موضع آخر، وهو ما يُختبر هنا:
--   `partner_settlements.account_id` **not null** ⇒ لا تحصيل بلا حساب أصلاً،
--   و`record_partner_settlement` ترفض الحساب المجهول بـ account-not-found.
-- ولا يؤكّد هذا القسم قبول «received بلا حساب» حتى لا يتحوّل إلى اختبارٍ يمنع
-- تضييق القيد لاحقاً (النمط ٥: اختبار يثبّت الأضعف بوصفه صحيحاً).
-- ----------------------------------------------------------------------------
do $$
declare
  v_sub   uuid := current_setting('tours.ps_sub')::uuid;
  v_acc   uuid := current_setting('tours.ps_cash')::uuid;
  v_ok    boolean;
  v_cname text;
  v_state text;
begin
  -- (ج-١) 🔒 قيد التزام (‏collected) بحساب خزينة **مرفوض** — وبالقيد المسمّى نفسه
  v_ok := false; v_cname := null;
  begin
    insert into public.ledger_entries
      (account_id, direction, amount, occurred_at, source_type, subcontractor_id,
       settlement_role, note)
    values (v_acc, 'in', 1, now(), 'partner_collection', v_sub, 'collected',
            'PARTNER_SETTLEMENT_FIXTURE مسبار الالتزام');
    v_ok := true;
  exception
    when check_violation then
      get stacked diagnostics v_cname = constraint_name;
  end;
  if v_ok then
    raise exception
      '(ج-١) 🔒 قيد collected قبِل حساب خزينة — «ما حصّله المتعهد» صار يحرّك رصيدنا وهو في جيبه';
  end if;
  if v_cname is distinct from 'ledger_entries_liability_no_account_chk' then
    raise exception
      '(ج-١) الرفض جاء من القيد «%» لا من ledger_entries_liability_no_account_chk — الاختبار غير حاسم',
      coalesce(v_cname, 'بلا');
  end if;

  -- (ج-٢) شاهد إيجابي: نفس القيد **بلا حساب** مقبول ⇒ الرفض أعلاه سببه الحساب
  --        وحده لا شيء آخر في الصف (مبلغ أو مصدر أو دور).
  v_ok := false;
  begin
    insert into public.ledger_entries
      (account_id, direction, amount, occurred_at, source_type, subcontractor_id,
       settlement_role, note)
    values (null, 'in', 1, now(), 'partner_collection', v_sub, 'collected',
            'PARTNER_SETTLEMENT_FIXTURE مسبار الالتزام بلا حساب');
    v_ok := true;
  exception
    when others then
      get stacked diagnostics v_state = returned_sqlstate;
      raise exception '(ج-٢) قيد collected بلا حساب مرفوض بـ % — التزام المتعهد لا يمكن تسجيله أصلاً', v_state;
  end;
  if not v_ok then
    raise exception '(ج-٢) قيد collected بلا حساب لم يُدرَج بلا رسالة';
  end if;

  -- (ج-٣) والنصف المقابل: قيد نقد (‏received) بحساب حقيقي **مقبول** — ولولاه
  --        ما تحرّكت الخزينة بالتحصيل أبداً.
  v_ok := false;
  begin
    insert into public.ledger_entries
      (account_id, direction, amount, occurred_at, source_type, subcontractor_id,
       settlement_role, note)
    values (v_acc, 'in', 1, now(), 'partner_settlement', v_sub, 'received',
            'PARTNER_SETTLEMENT_FIXTURE مسبار النقد');
    v_ok := true;
  exception
    when others then
      get stacked diagnostics v_state = returned_sqlstate;
      raise exception
        '(ج-٣) 🔒 قيد received بحساب خزينة مرفوض بـ % — التحصيل لن يرفع رصيداً أبداً', v_state;
  end;
  if not v_ok then
    raise exception '(ج-٣) قيد received بحساب خزينة لم يُدرَج بلا رسالة';
  end if;

  -- (ج-٤) 🔒 ومن أين يُضمن أن كل قيد received له حساب حقيقي: من **الجدول**.
  --        `partner_settlements.account_id not null` — فلا مسار تحصيل بلا حساب.
  v_ok := false; v_state := null;
  begin
    insert into public.partner_settlements (subcontractor_id, account_id, amount, occurred_at, note)
    values (v_sub, null, 100, now(), 'PARTNER_SETTLEMENT_FIXTURE تحصيل بلا حساب');
    v_ok := true;
  exception
    when not_null_violation then
      v_state := '23502';
    when others then
      get stacked diagnostics v_state = returned_sqlstate;
  end;
  if v_ok then
    raise exception
      '(ج-٤) 🔒 قُبل صف تحصيل بلا حساب خزينة — المتعهد «سدّد» ونقصَ دينه بلا أن يدخل جنيه واحد أي حساب';
  end if;
  if v_state <> '23502' then
    raise exception '(ج-٤) رفض التحصيل بلا حساب جاء بـ % لا 23502 — الاختبار غير حاسم', v_state;
  end if;

  raise notice
    '✔ (ج) الالتزام لا يحمل حساباً (‏ledger_entries_liability_no_account_chk) والنقد يحمله، وصفُّ التحصيل بلا حساب مستحيل بنيوياً';

  raise exception 'ROLLBACK_MARKER';
exception
  when others then
    if sqlerrm <> 'ROLLBACK_MARKER' then raise; end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- (د) اللاتكرار والعكس — الدفتر يُضاف إليه ولا يُمحى منه
--
-- (د-١) مُشغّل الإدراج **حارس من التكرار**: القيد الموجود لا يُضاعَف. ويُختبر
--       بأصعب صورة: يُزرع القيد أولاً بمعرّف مصدرٍ معلوم، ثم يُدرج صف التحصيل
--       بذلك المعرّف — فيمرّ المُشغّل على فرع «موجود» فعلاً لا على فرضٍ عنه.
-- (د-٢) والحذف **يكتب قيداً مقابلاً** (‏`reverses_entry_id`) ولا يحذف قيداً —
--       والصافي يعود إلى ما كان عليه بالقرش.
-- ----------------------------------------------------------------------------
do $$
declare
  v_sub    uuid := current_setting('tours.ps_sub')::uuid;
  v_acc    uuid := current_setting('tours.ps_cash')::uuid;
  v_at     constant timestamptz := timestamptz '2019-03-10 12:00:00+02';
  v_amount constant numeric := 400;
  v_seed   uuid := gen_random_uuid();   -- معرّف صف التحصيل المزروع مسبقاً
  v_entry  uuid;
  v_n      integer;
  v_net0   numeric;
  v_net1   numeric;
  v_net2   numeric;
  v_bal0   numeric;
  v_bal2   numeric;
  v_rev    record;
  v_rec    record;
begin
  insert into public.ledger_entries
    (account_id, direction, amount, occurred_at, source_type, subcontractor_id, settlement_role, note)
  values
    (null, 'out', 1000, v_at, 'partner_payout',     v_sub, 'earned',
     'PARTNER_SETTLEMENT_FIXTURE مستحق (د)'),
    (null, 'in',  1800, v_at, 'partner_collection', v_sub, 'collected',
     'PARTNER_SETTLEMENT_FIXTURE محصَّل (د)');

  -- ── (د-١) اللاتكرار ──
  insert into public.ledger_entries
    (account_id, direction, amount, occurred_at, source_type, source_id,
     subcontractor_id, settlement_role, note)
  values
    (v_acc, 'in', v_amount, v_at, 'partner_settlement', v_seed, v_sub, 'received',
     'PARTNER_SETTLEMENT_FIXTURE قيد مزروع قبل الصف')
  returning id into v_entry;

  insert into public.partner_settlements (id, subcontractor_id, account_id, amount, occurred_at, note)
  values (v_seed, v_sub, v_acc, v_amount, v_at, 'PARTNER_SETTLEMENT_FIXTURE صف على قيد موجود');

  select count(*)::integer into v_n
  from public.ledger_entries e
  where e.source_type = 'partner_settlement' and e.source_id = v_seed;
  if v_n <> 1 then
    raise exception
      '(د-١) 🔒 بعد إدراج صف على قيد موجود صار عدد القيود % — المُشغّل يضاعف التحصيل فيمحو ديناً لم يُسدَّد',
      v_n;
  end if;
  if not exists (select 1 from public.ledger_entries e where e.id = v_entry) then
    raise exception '(د-١) القيد المزروع اختفى — المُشغّل استبدله بدل أن يتنحّى';
  end if;

  -- شاهد إيجابي على المسبار: لولا القيد المزروع لكان المُشغّل قد كتب قيداً.
  -- نثبته بصفٍّ آخر بلا قيد سابق — فالفرق الوحيد بينهما هو وجود القيد.
  select * into v_rec
  from public.record_partner_settlement(
         v_sub, v_acc, v_amount, v_at, null, 'PARTNER_SETTLEMENT_FIXTURE تحصيل عادي');
  if v_rec.entry_id is null then
    raise exception
      '(د-١) صفٌّ بلا قيد سابق لم يولّد قيداً — فحصُ اللاتكرار أعلاه بلا معنى (المُشغّل صامت دائماً)';
  end if;

  -- ── (د-٢) العكس بالحذف ──
  select ps.net_due into v_net0 from public.v_partner_settlements ps where ps.subcontractor_id = v_sub;
  select ab.balance into v_bal0 from public.v_account_balances ab where ab.account_id = v_acc;

  select * into v_rec
  from public.record_partner_settlement(
         v_sub, v_acc, v_amount, v_at, null, 'PARTNER_SETTLEMENT_FIXTURE تحصيل سيُحذف');
  v_entry := v_rec.entry_id;

  select ps.net_due into v_net1 from public.v_partner_settlements ps where ps.subcontractor_id = v_sub;
  if v_net1 - v_net0 <> v_amount then
    raise exception '(د-٢) التحصيل غيّر الصافي % — المتوقع % قبل الحذف', v_net1 - v_net0, v_amount;
  end if;

  delete from public.partner_settlements s where s.id = v_rec.id;

  -- القيد الأصلي **باقٍ** كما هو
  if not exists (select 1 from public.ledger_entries e where e.id = v_entry and e.amount = v_amount) then
    raise exception '(د-٢) 🔒 القيد الأصلي اختفى بحذف الصف — الدفتر append-only وهذا عقده';
  end if;

  -- وقيدٌ مقابل مكتوب باسمه
  select * into v_rev from public.ledger_entries e where e.reverses_entry_id = v_entry;
  if not found then
    raise exception '(د-٢) 🔒 حذف التحصيل لم يكتب قيداً مقابلاً — المال خرج من الحسبة بلا أثر';
  end if;
  if v_rev.direction <> 'out' or v_rev.amount <> v_amount then
    raise exception '(د-٢) القيد المقابل «% %» — المتوقع «out %»',
      v_rev.direction, v_rev.amount, v_amount;
  end if;
  if v_rev.settlement_role is distinct from 'received' then
    raise exception '(د-٢) دور القيد المقابل «%» — المتوقع received ليرثه v_ledger_resolved بإشارة سالبة',
      coalesce(v_rev.settlement_role, 'بلا');
  end if;
  if v_rev.account_id is distinct from v_acc then
    raise exception '(د-٢) القيد المقابل على حساب «%» لا على حساب الأصل %',
      coalesce(v_rev.account_id::text, 'بلا'), v_acc;
  end if;

  -- والصافي والرصيد عادا إلى ما كانا عليه بالقرش
  select ps.net_due into v_net2 from public.v_partner_settlements ps where ps.subcontractor_id = v_sub;
  select ab.balance into v_bal2 from public.v_account_balances ab where ab.account_id = v_acc;
  if v_net2 <> v_net0 then
    raise exception '(د-٢) الصافي بعد الحذف % — المتوقع % (كما كان قبل التحصيل)', v_net2, v_net0;
  end if;
  if v_bal2 <> v_bal0 then
    raise exception '(د-٢) رصيد الخزينة بعد الحذف % — المتوقع %', v_bal2, v_bal0;
  end if;

  raise notice
    '✔ (د) الإدراج لا يضاعف قيداً قائماً، والحذف يكتب قيداً مقابلاً فيعود الصافي % والرصيد % كما كانا',
    v_net2, v_bal2;

  raise exception 'ROLLBACK_MARKER';
exception
  when others then
    if sqlerrm <> 'ROLLBACK_MARKER' then raise; end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- (هـ) حرّاس `record_partner_settlement` — كلٌّ برمزه
--
-- ⚠ المرجع يُختبر **على نوع الحساب كما تقرؤه القاعدة** (‏`payment_accounts.kind`)
-- لا على قائمة مكتوبة هنا: القاعدة تقول «إلزامي لغير النقدية»، فيُقرأ النوع من
-- الجدول ويُشتق منه المتوقَّع. ولو بدّل المالك نوع الحساب غداً لتبدّل ما يختبره
-- هذا القسم معه بدل أن يبقى أخضر وهو يقيس شيئاً آخر.
-- ----------------------------------------------------------------------------
do $$
declare
  v_sub    uuid := current_setting('tours.ps_sub')::uuid;
  v_cash   uuid := current_setting('tours.ps_cash')::uuid;
  v_wall   uuid := current_setting('tours.ps_wall')::uuid;
  v_prof   text := nullif(current_setting('tours.ps_prof', true), '');
  v_ident  text := current_setting('tours.ps_identity', true);
  v_kcash  text;
  v_kwall  text;
  v_raise  boolean;
  v_hint   text;
  v_rec    record;
  v_row    record;
begin
  select pa.kind into v_kcash from public.payment_accounts pa where pa.id = v_cash;
  select pa.kind into v_kwall from public.payment_accounts pa where pa.id = v_wall;

  -- (هـ-١) مبلغ صفر ومبلغ سالب مرفوضان بـ invalid-input
  foreach v_hint in array array['0', '-5'] loop
    declare
      v_amt numeric := v_hint::numeric;
      v_h   text;
      v_r   boolean := false;
    begin
      begin
        perform public.record_partner_settlement(
                  v_sub, v_cash, v_amt, now(), null, 'PARTNER_SETTLEMENT_FIXTURE مبلغ غير صالح');
      exception when others then
        v_r := true;
        get stacked diagnostics v_h = pg_exception_hint;
      end;
      if not v_r then
        raise exception '(هـ-١) قُبل تحصيل بمبلغ % — رقمٌ لا يصف حركة مال', v_amt;
      end if;
      if coalesce(v_h, '') <> 'invalid-input' then
        raise exception '(هـ-١) رفض المبلغ % جاء بالرمز «%» لا invalid-input', v_amt, coalesce(v_h, 'بلا');
      end if;
    end;
  end loop;

  -- (هـ-٢) متعهد مجهول ⇒ not-found
  v_raise := false; v_hint := null;
  begin
    perform public.record_partner_settlement(
              gen_random_uuid(), v_cash, 100, now(), null, 'PARTNER_SETTLEMENT_FIXTURE متعهد مجهول');
  exception when others then
    v_raise := true;
    get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if not v_raise or coalesce(v_hint, '') <> 'not-found' then
    raise exception '(هـ-٢) تحصيل من متعهد مجهول: رُفض=% والرمز «%» — المتوقع not-found',
      v_raise, coalesce(v_hint, 'بلا');
  end if;

  -- (هـ-٣) حساب مجهول ⇒ account-not-found
  v_raise := false; v_hint := null;
  begin
    perform public.record_partner_settlement(
              v_sub, gen_random_uuid(), 100, now(), 'REF-1', 'PARTNER_SETTLEMENT_FIXTURE حساب مجهول');
  exception when others then
    v_raise := true;
    get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if not v_raise or coalesce(v_hint, '') <> 'account-not-found' then
    raise exception '(هـ-٣) تحصيل على حساب مجهول: رُفض=% والرمز «%» — المتوقع account-not-found',
      v_raise, coalesce(v_hint, 'بلا');
  end if;

  -- (هـ-٤) 🔒 المرجع إلزامي لغير النقدية — والنوع مقروء من الجدول
  if v_kwall = 'cash' then
    raise exception '(هـ-٤) حساب التجهيز غير النقدي صار نقدياً — لا شيء يُختبر هنا';
  end if;

  v_raise := false; v_hint := null;
  begin
    perform public.record_partner_settlement(
              v_sub, v_wall, 100, now(), '   ', 'PARTNER_SETTLEMENT_FIXTURE بلا مرجع');
  exception when others then
    v_raise := true;
    get stacked diagnostics v_hint = pg_exception_hint;
  end;
  if not v_raise then
    raise exception
      '(هـ-٤) 🔒 قُبل تحصيل على حساب «%» بلا مرجع — لا شيء يطابق القيد بكشف الحساب بعد شهرين', v_kwall;
  end if;
  if coalesce(v_hint, '') <> 'reference-required' then
    raise exception '(هـ-٤) رفض غياب المرجع جاء بالرمز «%» لا reference-required', coalesce(v_hint, 'بلا');
  end if;

  -- وبمرجعٍ يمر — شاهد إيجابي على نفس الحساب (فالرفض سببه المرجع وحده)
  select * into v_rec
  from public.record_partner_settlement(
         v_sub, v_wall, 100, now(), 'INSTA-99001', 'PARTNER_SETTLEMENT_FIXTURE بمرجع');
  if v_rec.id is null then
    raise exception '(هـ-٤) تحصيل على حساب غير نقدي **بمرجع** لم يُسجَّل — الحساب صار معطّلاً كلياً';
  end if;
  select * into v_row from public.partner_settlements s where s.id = v_rec.id;
  if v_row.reference is distinct from 'INSTA-99001' then
    raise exception '(هـ-٤) المرجع المخزَّن «%» لا يطابق ما مُرّر', coalesce(v_row.reference, 'بلا');
  end if;

  -- (هـ-٥) والنقدية بلا مرجع تمر — النصف الآخر من نفس القاعدة
  if v_kcash <> 'cash' then
    raise exception '(هـ-٥) حساب التجهيز النقدي نوعه «%» — الطرف المقابل غير مُختبَر', v_kcash;
  end if;

  select * into v_rec
  from public.record_partner_settlement(
         v_sub, v_cash, 100, now(), null, 'PARTNER_SETTLEMENT_FIXTURE نقدية بلا مرجع');
  if v_rec.id is null then
    raise exception
      '(هـ-٥) 🔒 رُفض تحصيل نقدي بلا مرجع — والنقدية لا تُنتج رقم عملية أصلاً، فالمسار مسدود على المشرف';
  end if;
  select * into v_row from public.partner_settlements s where s.id = v_rec.id;
  if v_row.reference is not null then
    raise exception '(هـ-٥) مرجع التحصيل النقدي «%» — المتوقع null', v_row.reference;
  end if;

  -- (هـ-٦) 🔒 وغير الإدارة يُرفض بـ forbidden — بهوية متعهد حقيقية لا بافتراض
  if v_ident is distinct from '1' or v_prof is null then
    raise notice '  ↳ (هـ-٦) تخطٍّ: بلا هوية دخول متعهد لاختبار الحارس الإداري';
  else
    perform set_config('request.jwt.claim.sub', v_prof, false);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', v_prof)::text, false);

    -- شاهد إيجابي أول: الحارس نفسه يقول «لست إدارة» بهذه الهوية
    if public.finance_admin_allowed() then
      perform set_config('request.jwt.claim.sub', '', false);
      perform set_config('request.jwt.claims', '', false);
      raise exception
        '(هـ-٦) finance_admin_allowed ما زالت تقبلنا بهوية المتعهد — الانتحال لم يقع فالرفض لاحقاً بلا معنى';
    end if;

    v_raise := false; v_hint := null;
    begin
      perform public.record_partner_settlement(
                v_sub, v_cash, 100, now(), null, 'PARTNER_SETTLEMENT_FIXTURE بهوية متعهد');
    exception when others then
      v_raise := true;
      get stacked diagnostics v_hint = pg_exception_hint;
    end;

    perform set_config('request.jwt.claim.sub', '', false);
    perform set_config('request.jwt.claims', '', false);

    if not v_raise then
      raise exception
        '(هـ-٦) 🔒 متعهد سجّل تحصيلاً على نفسه — يمحو دينه بيده ويرفع رصيد خزينة لم يدخلها شيء';
    end if;
    if coalesce(v_hint, '') <> 'forbidden' then
      raise exception '(هـ-٦) رفض غير الإدارة جاء بالرمز «%» لا forbidden', coalesce(v_hint, 'بلا');
    end if;
  end if;

  raise notice
    '✔ (هـ) الحرّاس: صفر/سالب (invalid-input) · متعهد مجهول (not-found) · حساب مجهول (account-not-found) · المرجع إلزامي على «%» واختياري على «%» · وغير الإدارة (forbidden)',
    v_kwall, v_kcash;

  raise exception 'ROLLBACK_MARKER';
exception
  when others then
    perform set_config('request.jwt.claim.sub', '', false);
    perform set_config('request.jwt.claims', '', false);
    if sqlerrm <> 'ROLLBACK_MARKER' then raise; end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- (و) 🔒 تجاوز الدين **مسموح عمداً** — لا تُغلقه بحسن نية
--
-- المتعهد قد يسدّد مقدَّماً عن رحلات قادمة أو يسدّد رقماً مستديراً، فيصير الصافي
-- موجباً (صار له علينا). وهذا سلوك محاسبي سليم منصوص عليه في ترويسة (ق٦) من
-- الهجرة. وإضافة فحص «المبلغ يفوق الدين» تمنعه وتدفع المشرف إلى تسويات يدوية
-- غامضة — فيُثبَّت هنا حتى يسقط الاختبار في وجه من «يصلحه».
-- ----------------------------------------------------------------------------
do $$
declare
  v_sub   uuid := current_setting('tours.ps_sub')::uuid;
  v_acc   uuid := current_setting('tours.ps_cash')::uuid;
  v_at    constant timestamptz := timestamptz '2019-03-10 12:00:00+02';
  v_owed  numeric;
  v_extra numeric;
  v_rec   record;
  v_s     record;
begin
  insert into public.ledger_entries
    (account_id, direction, amount, occurred_at, source_type, subcontractor_id, settlement_role, note)
  values
    (null, 'out', 1000, v_at, 'partner_payout',     v_sub, 'earned',
     'PARTNER_SETTLEMENT_FIXTURE مستحق (و)'),
    (null, 'in',  1600, v_at, 'partner_collection', v_sub, 'collected',
     'PARTNER_SETTLEMENT_FIXTURE محصَّل (و)');

  select ps.owed_to_us into v_owed
  from public.v_partner_settlements ps where ps.subcontractor_id = v_sub;

  if coalesce(v_owed, 0) <= 0 then
    raise exception '(و-٠) دين التجهيز % ليس موجباً — لا تجاوز نختبره', coalesce(v_owed, 0);
  end if;

  -- الزيادة مشتقة من الدين نفسه لا رقماً مكتوباً
  v_extra := round(v_owed / 2, 2);

  select * into v_rec
  from public.record_partner_settlement(
         v_sub, v_acc, v_owed + v_extra, v_at, null,
         'PARTNER_SETTLEMENT_FIXTURE سداد مقدَّم يفوق الدين');

  if v_rec.id is null then
    raise exception
      '(و-١) 🔒 رُفض تحصيل يفوق الدين (% على % دين) — سلوك محاسبي سليم أُغلق، والمشرف سيلتف عليه بتسوية غامضة',
      v_owed + v_extra, v_owed;
  end if;

  select * into v_s from public.v_partner_settlements ps where ps.subcontractor_id = v_sub;

  if v_s.net_due <> v_extra then
    raise exception '(و-٢) الصافي بعد التجاوز % — المتوقع % (‏= الزيادة على الدين)',
      v_s.net_due, v_extra;
  end if;
  if v_s.net_due <= 0 then
    raise exception '(و-٢) الصافي % لم ينقلب موجباً بعد سداد يفوق الدين', v_s.net_due;
  end if;
  if v_s.owed_to_us <> 0 then
    raise exception '(و-٢) «عليه لنا» % بعد أن صار هو الدائن — المتوقع صفر', v_s.owed_to_us;
  end if;

  raise notice
    '✔ (و) 🔒 السداد الذي يفوق الدين مقبول: دين % سُدّد بـ % فصار الصافي % موجباً («له علينا»)',
    v_owed, v_owed + v_extra, v_s.net_due;

  raise exception 'ROLLBACK_MARKER';
exception
  when others then
    if sqlerrm <> 'ROLLBACK_MARKER' then raise; end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- (ز) 🔒 الفخ المُغلَق — التسوية بمبلغ سالب
--
-- `v_partner_settlements` تجمع `sign * amount` وتتجاهل `direction` تماماً، و`sign`
-- لا يصير ‎−1‎ إلا للقيد العاكس. فالمبلغ السالب كان يُخزَّن بـ `abs()` مع اتجاه
-- معكوس ⇒ **يعمّق الدين بدل أن يخفضه**. قيس أثره حياً على قاعدة بدر
-- (‏61,034− ⇒ 61,134− بعد `collected,-100`) فأُغلق في 0029 لا وُثِّق فقط.
-- ----------------------------------------------------------------------------
do $$
declare
  v_sub   uuid := current_setting('tours.ps_sub')::uuid;
  v_at    constant timestamptz := timestamptz '2019-03-10 12:00:00+02';
  v_amt   constant numeric := 100;
  v_role  text;
  v_raise boolean;
  v_hint  text;
  v_id    uuid;
  v_net0  numeric;
  v_net1  numeric;
begin
  insert into public.ledger_entries
    (account_id, direction, amount, occurred_at, source_type, subcontractor_id, settlement_role, note)
  values
    (null, 'out', 1000, v_at, 'partner_payout',     v_sub, 'earned',
     'PARTNER_SETTLEMENT_FIXTURE مستحق (ز)'),
    (null, 'in',  1500, v_at, 'partner_collection', v_sub, 'collected',
     'PARTNER_SETTLEMENT_FIXTURE محصَّل (ز)');

  -- (ز-١) المبلغ السالب مرفوض في **الدورين** المسموحين معاً
  foreach v_role in array array['earned', 'collected'] loop
    v_raise := false; v_hint := null;
    begin
      perform public.record_partner_adjustment(
                v_sub, v_role, -v_amt, v_at, 'PARTNER_SETTLEMENT_FIXTURE تسوية سالبة');
    exception when others then
      v_raise := true;
      get stacked diagnostics v_hint = pg_exception_hint;
    end;
    if not v_raise then
      raise exception
        '(ز-١) 🔒 قُبلت تسوية «%» بمبلغ سالب — وهي تعمّق الدين بدل أن تخفضه لأن العرض يتجاهل direction',
        v_role;
    end if;
    if coalesce(v_hint, '') <> 'negative-amount' then
      raise exception '(ز-١) رفض المبلغ السالب في «%» جاء بالرمز «%» لا negative-amount',
        v_role, coalesce(v_hint, 'بلا');
    end if;
  end loop;

  -- (ز-٢) شاهد إيجابي: الموجب ما زال يعمل كما كان، وبأثره المعروف على الصافي
  select ps.net_due into v_net0 from public.v_partner_settlements ps where ps.subcontractor_id = v_sub;

  v_id := public.record_partner_adjustment(
            v_sub, 'earned', v_amt, v_at, 'PARTNER_SETTLEMENT_FIXTURE تسوية موجبة');
  if v_id is null then
    raise exception '(ز-٢) التسوية الموجبة لم تُرجع معرّف قيد — الدالة أُغلقت على الاتجاهين معاً';
  end if;
  if not exists (select 1 from public.ledger_entries e
                  where e.id = v_id and e.settlement_role = 'earned' and e.account_id is null) then
    raise exception '(ز-٢) قيد التسوية الموجبة غير موجود أو دوره/حسابه ليس (earned بلا حساب)';
  end if;

  select ps.net_due into v_net1 from public.v_partner_settlements ps where ps.subcontractor_id = v_sub;
  if v_net1 - v_net0 <> v_amt then
    raise exception '(ز-٢) تسوية earned بـ % غيّرت الصافي % — المتوقع %', v_amt, v_net1 - v_net0, v_amt;
  end if;

  raise notice
    '✔ (ز) 🔒 التسوية السالبة مرفوضة بـ negative-amount في earned و collected معاً، والموجبة ترفع الصافي % كما كانت',
    v_amt;

  raise exception 'ROLLBACK_MARKER';
exception
  when others then
    if sqlerrm <> 'ROLLBACK_MARKER' then raise; end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- (ح) `partner_statement` — الدور الرابع في الكشف، والرصيد ينتهي عند `net_due`
--
-- ⚠ صيغة الإشارة مكتوبة في **موضعين** داخل الدالة: رصيد ما قبل الفترة، وسطور
-- الفترة. فالكشف يُقرأ هنا مرتين: مرة بلا حدود (تُمسك الموضع الثاني)، ومرة بفترة
-- تبدأ **بعد** قيود الرحلة وقبل التحصيل (تُمسك الموضع الأول وحده — ونسيانه
-- يجعل الرصيد الافتتاحي يبتلع كل تحصيل سبق الفترة فينحرف الكشف كله).
-- ----------------------------------------------------------------------------
do $$
declare
  v_sub   uuid := current_setting('tours.ps_sub')::uuid;
  v_acc   uuid := current_setting('tours.ps_cash')::uuid;
  v_at1   constant timestamptz := timestamptz '2019-03-10 12:00:00+02';
  v_at2   constant timestamptz := timestamptz '2019-03-20 12:00:00+02';
  v_amt   constant numeric := 360;
  v_net   numeric;
  v_last  numeric;
  v_n     integer;
  v_bad   integer;
  v_line  record;
begin
  insert into public.ledger_entries
    (account_id, direction, amount, occurred_at, source_type, subcontractor_id, settlement_role, note)
  values
    (null, 'out', 1200, v_at1, 'partner_payout',     v_sub, 'earned',
     'PARTNER_SETTLEMENT_FIXTURE مستحق (ح)'),
    (null, 'in',  1560, v_at1, 'partner_collection', v_sub, 'collected',
     'PARTNER_SETTLEMENT_FIXTURE محصَّل (ح)');

  perform public.record_partner_settlement(
            v_sub, v_acc, v_amt, v_at2, null, 'PARTNER_SETTLEMENT_FIXTURE تحصيل الكشف');

  select ps.net_due into v_net from public.v_partner_settlements ps where ps.subcontractor_id = v_sub;

  -- (ح-١) الكشف ثلاثة سطور، وفيها سطر تحصيل واحد بنوع settlement
  select count(*)::integer into v_n from public.partner_statement(v_sub, null, null);
  if v_n <> 3 then
    raise exception '(ح-١) سطور الكشف % — المتوقع ٣ (مستحق وتحصيل نقدي وسداد)', v_n;
  end if;

  select count(*)::integer into v_n
  from public.partner_statement(v_sub, null, null) s where s.kind = 'settlement';
  if v_n <> 1 then
    raise exception
      '(ح-١) 🔒 سطور نوعها settlement = % — المتوقع واحد (وترتيب الـ case في الدالة يجعل adjustment يبتلعه إن أخطأ)',
      v_n;
  end if;

  -- ولا سطر بنوع خارج العقد (‏PartnerStatementLine)
  select count(*)::integer into v_bad
  from public.partner_statement(v_sub, null, null) s
  where s.kind not in ('trip', 'collection', 'payout', 'settlement', 'adjustment');
  if v_bad <> 0 then
    raise exception '(ح-١) % سطر بنوع خارج العقد', v_bad;
  end if;

  -- (ح-٢) سطر التحصيل **دائن** بمبلغه: `received` يزيد ما له علينا كـ `earned`
  select * into v_line
  from public.partner_statement(v_sub, null, null) s where s.kind = 'settlement';
  if v_line.credit <> v_amt or v_line.debit <> 0 then
    raise exception '(ح-٢) سطر التحصيل (مدين % / دائن %) — المتوقع (٠ / %)',
      v_line.debit, v_line.credit, v_amt;
  end if;

  -- (ح-٣) 🔑 آخر رصيد متحرك = صافي المقاصة **تماماً** — عقد الدالة المكتوب
  select s.balance into v_last
  from public.partner_statement(v_sub, null, null) s
  order by s.occurred_at desc, s.balance desc limit 1;

  if v_last <> v_net then
    raise exception
      '(ح-٣) 🔒 آخر رصيد في الكشف % وصافي المقاصة % — الدور الرابع خارج صيغة إشارة السطور',
      v_last, v_net;
  end if;

  -- (ح-٤) 🔒 وبفترة تبدأ **بعد** قيود الرحلة: الرصيد الافتتاحي يجب أن يحمل
  --        ‎360−‎، فينتهي الكشف عند نفس الصافي. وهذا هو الموضع الثاني للصيغة.
  select count(*)::integer into v_n
  from public.partner_statement(v_sub, '2019-03-15', '2019-03-31');
  if v_n <> 1 then
    raise exception '(ح-٤) سطور الفترة % — المتوقع سطر التحصيل وحده (فالفترة تبدأ بعد الرحلة)', v_n;
  end if;

  select s.balance into v_last
  from public.partner_statement(v_sub, '2019-03-15', '2019-03-31') s
  order by s.occurred_at desc, s.balance desc limit 1;

  if v_last <> v_net then
    raise exception
      '(ح-٤) 🔒 آخر رصيد في كشف الفترة % — المتوقع % (رصيد ما قبل الفترة لم يُرحَّل بقاعدة الإشارة نفسها)',
      v_last, v_net;
  end if;

  raise notice
    '✔ (ح) التحصيل سطرٌ دائن بنوع settlement، والرصيد المتحرك ينتهي عند % بلا فترة وبفترة تبدأ بعد الرحلة',
    v_net;

  raise exception 'ROLLBACK_MARKER';
exception
  when others then
    if sqlerrm <> 'ROLLBACK_MARKER' then raise; end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- (ط-٠) 🔒 فحص بنيوي: `portal_balance` **بلا وسائط** — بلا كتابة شيء
--
-- لا يمنع اليومَ شيئاً، يمنع الغد: من يضيف لاحقاً `p_sub uuid` بحسن نية يحوّلها
-- إلى تسريب رصيد كل متعهد لكل متعهد (سابقة D-20 و`coverage_matches` في 0011).
-- ----------------------------------------------------------------------------
do $$
declare
  v_nargs smallint;
  v_ret   char;
begin
  select pr.pronargs, pr.prokind into v_nargs, v_ret
  from pg_proc pr where pr.oid = 'public.portal_balance()'::regprocedure;

  if v_nargs is null then
    raise exception '(ط-٠) المسبار لا يقرأ portal_balance من pg_proc — لا يُصدَّق ما بعده';
  end if;
  if v_nargs <> 0 then
    raise exception
      '(ط-٠) 🔒 portal_balance صار لها % وسيط — النطاق يجب أن يبقى داخلياً عبر current_subcontractor_id()',
      v_nargs;
  end if;

  raise notice '✔ (ط-٠) 🔒 portal_balance بلا وسائط (pronargs = %)', v_nargs;
end;
$$;

-- ----------------------------------------------------------------------------
-- (ط) `portal_balance` — أرقام المتعهد نفسه، ولا شيء عن غيره
-- ----------------------------------------------------------------------------
do $$
declare
  v_sub    uuid := current_setting('tours.ps_sub')::uuid;
  v_other  uuid := current_setting('tours.ps_other')::uuid;
  v_acc    uuid := current_setting('tours.ps_cash')::uuid;
  v_prof   text := nullif(current_setting('tours.ps_prof', true), '');
  v_ident  text := current_setting('tours.ps_identity', true);
  v_at     constant timestamptz := timestamptz '2019-03-10 12:00:00+02';
  v_mine   record;
  v_theirs record;
  v_p      record;
  v_limit  numeric;
  v_block  boolean;
  v_n      integer;
begin
  if v_ident is distinct from '1' or v_prof is null then
    raise notice '  ↳ (ط) تخطٍّ: بلا هوية دخول للمتعهد';
    return;
  end if;

  -- أرقام مختلفة عمداً للمتعهدين: تساوي الأرقام يجعل «رأى أرقامه» و«رأى أرقام
  -- غيره» غير قابلين للتمييز، فيمر فحص العزل مهما تسرّب.
  insert into public.ledger_entries
    (account_id, direction, amount, occurred_at, source_type, subcontractor_id, settlement_role, note)
  values
    (null, 'out', 1200, v_at, 'partner_payout',     v_sub,   'earned',
     'PARTNER_SETTLEMENT_FIXTURE مستحق (ط) لي'),
    (null, 'in',  1560, v_at, 'partner_collection', v_sub,   'collected',
     'PARTNER_SETTLEMENT_FIXTURE محصَّل (ط) لي'),
    (null, 'out', 7777, v_at, 'partner_payout',     v_other, 'earned',
     'PARTNER_SETTLEMENT_FIXTURE مستحق (ط) لغيري'),
    (null, 'in',  3333, v_at, 'partner_collection', v_other, 'collected',
     'PARTNER_SETTLEMENT_FIXTURE محصَّل (ط) لغيري');

  perform public.record_partner_settlement(
            v_sub, v_acc, 360, v_at, null, 'PARTNER_SETTLEMENT_FIXTURE تحصيل (ط)');

  -- المتوقَّع يُقرأ من العرض **قبل** الانتحال، فالمقارنة بعده تقارن رقمين حقيقيين
  select * into v_mine   from public.v_partner_settlements ps where ps.subcontractor_id = v_sub;
  select * into v_theirs from public.v_partner_settlements ps where ps.subcontractor_id = v_other;

  if v_mine.earned = v_theirs.earned or v_mine.net_due = v_theirs.net_due then
    raise exception
      '(ط-٠ب) أرقام المتعهدين متطابقة — فحص العزل أدناه لا يميّز بين «أرقامه» و«أرقام غيره»';
  end if;

  select c.debt_limit into v_limit from public.partner_credit_config() c;
  v_block := public.partner_over_debt_limit(v_sub);

  perform set_config('request.jwt.claim.sub', v_prof, false);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_prof)::text, false);

  -- (ط-١) بهوية المتعهد: صفٌّ واحد بأرقامه هو
  select count(*)::integer into v_n from public.portal_balance();
  if v_n <> 1 then
    raise exception '(ط-١) portal_balance أرجعت % صفاً بهوية متعهد — المتوقع صفٌّ واحد', v_n;
  end if;

  select * into v_p from public.portal_balance();

  if v_p.earned <> v_mine.earned or v_p.collected <> v_mine.collected
     or v_p.paid <> v_mine.paid or v_p.received <> v_mine.received
     or v_p.net_due <> v_mine.net_due or v_p.owed_to_us <> v_mine.owed_to_us then
    raise exception
      '(ط-١) بطاقة البورتال (مستحق % محصَّل % مدفوع % مُسدَّد % صافٍ %) لا تطابق مقاصته (% % % % %)',
      v_p.earned, v_p.collected, v_p.paid, v_p.received, v_p.net_due,
      v_mine.earned, v_mine.collected, v_mine.paid, v_mine.received, v_mine.net_due;
  end if;

  -- (ط-٢) 🔒 ولا شيء من أرقام غيره تسرّب إليها
  if v_p.earned = v_theirs.earned or v_p.net_due = v_theirs.net_due then
    raise exception
      '(ط-٢) 🔒 البورتال يعرض أرقام متعهد آخر (مستحق % / صافٍ %) — النطاق الداخلي مكسور',
      v_theirs.earned, v_theirs.net_due;
  end if;

  -- (ط-٢ب) 🔒 **سقف الائتمان لا يخرج إلى المتعهد أصلاً** (هجرة 0030).
  --        أمسكت المراجعة الأمنية أن 0029 كانت تُرجع `debt_limit` لكل متعهد لا
  --        للمحجوب وحده — وهو نقضٌ من باب خلفي لسحب `partner_credit_config()`
  --        من كل الأدوار في 0027: من يعرف السقف يجلس تحته ويحتجز مالنا للأبد.
  --        والفحص على **نوع الإرجاع** لا على قيمة، فلا يعود العمود بحسن نية.
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    join unnest(coalesce(p.proargnames, '{}')) as a(name) on true
    where n.nspname = 'public' and p.proname = 'portal_balance' and a.name = 'debt_limit'
  ) then
    raise exception '(ط-٢ب) 🔒 portal_balance تُرجع debt_limit — سقف الائتمان بيد المتعهدين';
  end if;

  -- والشاهد الإيجابي للمسبار نفسه: عمودٌ نعلم وجوده يقيناً يُلتقط
  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    join unnest(coalesce(p.proargnames, '{}')) as a(name) on true
    where n.nspname = 'public' and p.proname = 'portal_balance' and a.name = 'amount_to_clear'
  ) then
    raise exception '(ط-٢ب) مسبار أعمدة portal_balance معطّل — لا تصدّق ما قبله';
  end if;

  -- والحجب من مصدره الواحد لا من معادلة مكرَّرة
  if v_p.blocked is distinct from v_block then
    raise exception '(ط-٢) حجب البطاقة % و partner_over_debt_limit تقول % — مصدران متضاربان',
      v_p.blocked, v_block;
  end if;
  -- ⚠ القوسان حول `case` ليسا زينة: plpgsql يقرأ شرط `if` حتى أول `then`، فبلا
  -- قوسين يقطع التعبير عند `then` الداخلية ويسقط الملف بـ «syntax error».
  -- والسقف يُقرأ هنا من `partner_credit_config()` — من الإعدادات لا من البطاقة،
  -- لأن البطاقة لم تعد تحمله، وهذا بالضبط ما يجب أن يبقى صحيحاً.
  if v_p.amount_to_clear <> (case when v_p.blocked
                                  then round(v_p.owed_to_us - coalesce(v_limit, 0) + 0.01, 2)
                                  else 0 end) then
    raise exception '(ط-٢) «ما يكفي لفكّ الحجب» % لا يتبع الحجب (%) والسقف (%)',
      v_p.amount_to_clear, v_p.blocked, coalesce(v_limit, 0);
  end if;

  -- (ط-٣) 🔒 وبلا هوية متعهد: **صفر صفوف** لا أصفار ولا أرقام أحد
  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claims', '', false);

  select count(*)::integer into v_n from public.portal_balance();
  if v_n <> 0 then
    raise exception
      '(ط-٣) 🔒 portal_balance أرجعت % صفاً بلا هوية متعهد — أي متصل بلا متعهد يقرأ رصيد أحدهم', v_n;
  end if;

  raise notice
    '✔ (ط) البطاقة تعطي المتعهد أرقامه وحده (صافٍ %) ولا شيء عن غيره (صافيه %)، وبلا هوية صفر صفوف',
    v_p.net_due, v_theirs.net_due;

  raise exception 'ROLLBACK_MARKER';
exception
  when others then
    perform set_config('request.jwt.claim.sub', '', false);
    perform set_config('request.jwt.claims', '', false);
    if sqlerrm <> 'ROLLBACK_MARKER' then raise; end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- (ي) 🔒 العزل والصلاحيات — ولكل فحص سالب شاهد إيجابي
--
-- كل متعهد مستخدم `authenticated`، فالفحص هنا على مستويين: الزائر لا يصل إلى
-- شيء، والمسجَّل يصل إلى `portal_balance` **وحدها** لأنها مقصورة على نفسه بنيوياً.
-- وبلا الشواهد الإيجابية يمرّ القسم كله لو صار `has_*_privilege` يرجع false دائماً.
-- ----------------------------------------------------------------------------
do $$
declare
  v_bad text;
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    -- (ي-١) الزائر: لا تنفيذ للدالتين
    select string_agg(x.sig, '، ')
      into v_bad
    from (values
      ('public.record_partner_settlement(uuid,uuid,numeric,timestamptz,text,text)'),
      ('public.portal_balance()')
    ) as x(sig)
    where has_function_privilege('anon', x.sig, 'execute');
    if v_bad is not null then
      raise exception '(ي-١) الزائر ينفّذ: %', v_bad;
    end if;

    -- (ي-٢) ولا أي صلاحية على الجدول — والقائمة كاملة لأن TRUNCATE **لا تخضع
    --       لـ RLS إطلاقاً**، فمنحُها وحدها يكفي لمحو تاريخ التحصيلات كله.
    select string_agg(x.priv, '، ')
      into v_bad
    from (values ('select'), ('insert'), ('update'), ('delete'),
                 ('truncate'), ('references'), ('trigger')) as x(priv)
    where has_table_privilege('anon', 'public.partner_settlements', x.priv);
    if v_bad is not null then
      raise exception '(ي-٢) 🔒 الزائر يملك على partner_settlements: %', v_bad;
    end if;
  end if;

  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    -- (ي-٣) شاهد إيجابي مزدوج: المسبار يرى المنوح فعلاً، والمنح المقصود قائم
    if not has_function_privilege('authenticated', 'public.portal_balance()', 'execute') then
      raise exception
        '(ي-٣) 🔒 المسجَّل لا ينفّذ portal_balance — بطاقة رصيد البورتال تنكسر، أو المسبار معطّل فلا يُصدَّق ما قبله';
    end if;
    if not has_function_privilege(
             'authenticated',
             'public.record_partner_settlement(uuid,uuid,numeric,timestamptz,text,text)',
             'execute') then
      raise exception '(ي-٣) المسجَّل لا ينفّذ record_partner_settlement — شاشة التسوية تنكسر';
    end if;

    select string_agg(x.priv, '، ')
      into v_bad
    from (values ('select'), ('insert'), ('update'), ('delete')) as x(priv)
    where not has_table_privilege('authenticated', 'public.partner_settlements', x.priv);
    if v_bad is not null then
      raise exception
        '(ي-٣) المسجَّل بلا صلاحيات على partner_settlements: % — وسياسات RLS هي من يفرز المشرف، فالمنح شرط سابق',
        v_bad;
    end if;
  end if;

  -- (ي-٤) ولا منح ضمني لـ PUBLIC (‏grantee = 0) — وهو ما تمنحه Supabase لكل دالة جديدة
  select string_agg(f.sig, '، ')
    into v_bad
  from (values
    ('public.record_partner_settlement(uuid,uuid,numeric,timestamptz,text,text)'),
    ('public.portal_balance()')
  ) as f(sig)
  where exists (
    select 1
    from pg_proc pr
    cross join lateral aclexplode(coalesce(pr.proacl, acldefault('f', pr.proowner))) a
    where pr.oid = f.sig::regprocedure and a.grantee = 0
  );
  if v_bad is not null then
    raise exception '(ي-٤) دوال ممنوحة لـ PUBLIC — كل دور في القاعدة ينفّذها: %', v_bad;
  end if;

  -- (ي-٥) والجدول محروس بـ RLS بأربع سياسات إدارية
  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'partner_settlements' and c.relrowsecurity
  ) then
    raise exception '(ي-٥) 🔒 partner_settlements بلا RLS — كل مسجَّل يقرأ تحصيلات كل متعهد';
  end if;
  if (select count(*) from pg_policies p
       where p.schemaname = 'public' and p.tablename = 'partner_settlements') <> 4 then
    raise exception '(ي-٥) سياسات partner_settlements ليست أربعاً';
  end if;

  raise notice
    '✔ (ي) 🔒 الزائر لا ينفّذ الدالتين ولا يملك حرفاً على الجدول، والمسجَّل ينفّذ portal_balance (وهو المقصود) — والمسبار مُثبَت بشاهد إيجابي';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ك-٠) 🔒 البرهان على أن كتل الكتابة أرجعت نفسها فعلاً
--
-- هذا القسم يختبر **آلية أمان هذا الملف** لا الهجرة: الأقسام (أ) .. (ط) كتبت
-- قيوداً في دفتر قاعدة حيّة ورفعت أرصدة حسابات وسجّلت تحصيلات. فلو لم تكن نقطة
-- الحفظ الضمنية تُرجِع ما بداخلها لبقيت تلك الأرقام في الدفتر — أرصدة خزينة
-- مرفوعة بمالٍ لم يدخل قط. يُفحص **قبل** التنظيف لأن التنظيف يطمس الدليل.
-- ----------------------------------------------------------------------------
do $$
declare
  v_subs uuid[] := array[current_setting('tours.ps_sub')::uuid,
                         current_setting('tours.ps_other')::uuid];
  v_accs uuid[] := array[current_setting('tours.ps_cash')::uuid,
                         current_setting('tours.ps_wall')::uuid];
  v_n    integer;
  v_bal  numeric;
begin
  select count(*)::integer into v_n
  from public.ledger_entries e
  where e.subcontractor_id = any (v_subs) or e.account_id = any (v_accs);
  if v_n <> 0 then
    raise exception
      '(ك-٠) 🔒 بقي % قيداً في الدفتر من كتل الاختبار — الإرجاع لم يقع، وأرصدة الخزينة مرفوعة بمالٍ لم يدخل',
      v_n;
  end if;

  select count(*)::integer into v_n
  from public.partner_settlements s
  where s.subcontractor_id = any (v_subs) or s.account_id = any (v_accs);
  if v_n <> 0 then
    raise exception '(ك-٠) بقي % صف تحصيل — الإرجاع لم يقع', v_n;
  end if;

  select ab.balance into v_bal
  from public.v_account_balances ab where ab.account_id = v_accs[1];
  if v_bal <> 0 then
    raise exception '(ك-٠) رصيد حساب التجهيز % لا صفر — أثر مالي باقٍ من كتلة أُرجعت', v_bal;
  end if;

  -- شاهد إيجابي: ما زُرع **خارج** الكتل باقٍ. بدونه يمر القسم لو كان كل شيء قد
  -- رُجع (بما فيه التجهيز نفسه) فصار الفحص أعلاه صحيحاً لسبب آخر تماماً.
  select count(*)::integer into v_n
  from public.subcontractors s where s.company_name like 'PARTNER_SETTLEMENT_FIXTURE%';
  if v_n <> 2 then
    raise exception
      '(ك-٠) متعهدو التجهيز % لا ٢ — الإرجاع ابتلع ما زُرع خارج الكتل أيضاً، فالفحوص أعلاه بلا معنى', v_n;
  end if;

  raise notice '✔ (ك-٠) 🔒 كل كتلة كتابة أرجعت نفسها: لا قيد ولا تحصيل ولا رصيد باقٍ — والتجهيز خارجها سليم';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ك) التنظيف
-- ----------------------------------------------------------------------------
do $$
declare
  v_subs uuid[] := array[current_setting('tours.ps_sub')::uuid,
                         current_setting('tours.ps_other')::uuid];
  v_accs uuid[] := array[current_setting('tours.ps_cash')::uuid,
                         current_setting('tours.ps_wall')::uuid];
  v_prof uuid   := current_setting('tours.ps_prof')::uuid;
begin
  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claims', '', false);

  delete from public.ledger_entries e
   where e.reverses_entry_id is not null
     and (e.subcontractor_id = any (v_subs) or e.account_id = any (v_accs));

  delete from public.ledger_entries e
   where e.subcontractor_id = any (v_subs) or e.account_id = any (v_accs);

  delete from public.partner_settlements s
   where s.subcontractor_id = any (v_subs) or s.account_id = any (v_accs);

  delete from public.subcontractors s where s.company_name like 'PARTNER_SETTLEMENT_FIXTURE%';
  delete from public.payment_accounts pa where pa.label like 'PARTNER_SETTLEMENT_FIXTURE%';

  delete from public.profiles p where p.id = v_prof;
  begin
    delete from auth.users u where u.id = v_prof;
  exception when others then null;
  end;

  raise notice '✔ (ك) التنظيف تم';
end;
$$;

-- ----------------------------------------------------------------------------
-- فحص أخير: لم يبقَ أثر
-- ----------------------------------------------------------------------------
do $$
declare
  v_n integer;
begin
  select count(*)::integer into v_n
  from public.subcontractors s where s.company_name like 'PARTNER_SETTLEMENT_FIXTURE%';
  if v_n <> 0 then
    raise exception 'تنظيف ناقص: % متعهد اختباري باقٍ', v_n;
  end if;

  select count(*)::integer into v_n
  from public.payment_accounts pa where pa.label like 'PARTNER_SETTLEMENT_FIXTURE%';
  if v_n <> 0 then
    raise exception 'تنظيف ناقص: % حساب خزينة اختباري باقٍ', v_n;
  end if;

  select count(*)::integer into v_n
  from public.ledger_entries e where e.note like 'PARTNER_SETTLEMENT_FIXTURE%';
  if v_n <> 0 then
    raise exception 'تنظيف ناقص: % قيد اختباري باقٍ في الدفتر', v_n;
  end if;

  select count(*)::integer into v_n
  from public.partner_settlements s where s.note like 'PARTNER_SETTLEMENT_FIXTURE%';
  if v_n <> 0 then
    raise exception 'تنظيف ناقص: % صف تحصيل اختباري باقٍ', v_n;
  end if;

  perform set_config('tours.ps_sub', '', false);
  perform set_config('tours.ps_other', '', false);

  raise notice 'ALL PASSED — المعادلة الرباعية تقفل عند الصفر والخزينة عند الربح، والتحصيل قيدٌ واحد بأثرين لا يتكرر ويُعكَس بقيد مقابل، والمرجع إلزامي لغير النقدية، وتجاوز الدين مسموح، والتسوية السالبة مرفوضة بـ negative-amount، والكشف ينتهي عند net_due، و portal_balance بلا وسيط تعطي المتعهد أرقامه وحده';
end;
$$;
