-- ============================================================================
-- append_only_tests.sql — «السجلُّ مُلحَقٌ فقط» ادّعاءٌ يُقاس بكل فعلٍ وكل دور
--                          (الجبهة ج — هجرة 0110)
--
-- كيف تشغّله: `pnpm db:test append_only`
-- النجاح = آخر سطر «ALL PASSED». وأي فشل exception عربية فيها الجدولُ والدورُ
-- والفعلُ والحصيلة.
--
-- ══════════════════════════════════════════════════════════════════════════
--  🔴 ما يحرسه هذا الملف: **أن يكتب المُدقَّقُ عليه في السجلّ الذي يدينه**
-- ══════════════════════════════════════════════════════════════════════════
--
-- قيمةُ سجلّ التدقيق كلُّها في أنه لا يُعدَّل بيد من يُدقَّق عليه. وقبل 0110 كان
-- المقيس (بدور `service_role`، داخل `begin … rollback`):
--
--     update public.audit_log …   ⇒ SUCCEEDED rowCount=1
--     delete from public.audit_log … ⇒ SUCCEEDED rowCount=1
--     has_table_privilege('service_role','public.audit_log','TRUNCATE') ⇒ true
--     صفر مُشغّلٍ غير داخلي على الجدول
--
-- ولا حاجزَ RLS هنا إطلاقاً: `service_role` يحمل `rolbypassrls = true`،
-- و`TRUNCATE` **لا تغطّيها RLS لأيّ دور** — فالحاجز منحٌ أو مُشغّل، لا سياسة.
-- (القاعدة الذهبية ١٦.)
--
-- ── لماذا محورا الفحص اثنان لا واحد ────────────────────────────────────────
--
--   (أ) **المنحُ** — يوقف `service_role` و`authenticated` و`anon`. وهو الحاجز
--       الوحيد الفاعل أمام دورٍ يتخطّى RLS بحكم دوره.
--   (ب) **المُشغّل** — يوقف **مالكَ الجدول نفسه** (`postgres`)، وهو ما لا يفعله
--       المنح لأن المالك يمنح نفسه متى شاء. فالمُشغّل يجعل المساسَ بالتاريخ
--       فعلاً مقصوداً معلَناً (`ALTER TABLE … DISABLE TRIGGER`) لا زلّةَ سطر.
--
-- ولذلك (ز) تختبر أن المخرجَ نفسه ليس ثقباً: `service_role` **لا يستطيع**
-- تعطيل المُشغّل، لأن التعطيل يتطلّب ملكيةَ الجدول.
--
-- ── و`TRUNCATE`: لماذا يُقاس بالمنح لا بمحاولةٍ حيّة لكل دور ────────────────
--
-- ⚠ حدٌّ مُعلَن: `TRUNCATE` يأخذ قفل `ACCESS EXCLUSIVE` **قبل** فحص الصلاحية
-- وقبل إطلاق المُشغّل، والقفل يبقى إلى نهاية المعاملة. وهذه قاعدةُ إنتاجٍ حيّة
-- يكتب فيها التطبيق صفَّ تدقيقٍ عند كل تغيير. فمحاولةٌ حيّةٌ لكل دورٍ على كل
-- جدول = أربعةُ أقفالٍ حصرية تُعطّل الموقع طوال الملف بلا مكسب. والمقيس هنا:
--   • للأدوار الثلاثة ⇒ `has_table_privilege(...,'TRUNCATE') = false` — وهو
--     **الحصيلةُ نفسها**: بلا منحٍ لا تصل الأمرُ إلى القفل أصلاً.
--   • ولمالك الجدول ⇒ محاولةٌ حيّةٌ **واحدة** في آخر الملف (القسم ح)، لأن
--     المنحَ قائمٌ له فالمُشغّلُ وحده ما يُختبر.
--
-- ── 🔬 وما يجب أن تُسقطه هذه المجموعة ──────────────────────────────────────
--
--   | الطفرة | التأكيد الذي يجب أن يسقط |
--   |---|---|
--   | حذفُ سطر `revoke` من 0110 | (أ) المصفوفة — منحٌ باقٍ لدور الخدمة |
--   | حذفُ `audit_log_append_only` | (ب) تعديلُ صفٍّ حديث ينجح |
--   | حذفُ `audit_log_no_truncate` | (ح) TRUNCATE ينجح |
--   | حارسٌ يرفض **كلَّ** حذف (بلا استثناء الاحتفاظ) | (ج) صفُّ ٤٠٠ يومٍ لا يُحذف ⇒ سياسةُ الاحتفاظ ماتت |
--   | مَخرجٌ بمتغيّر جلسة بدل `DISABLE TRIGGER` | (ز) دورُ الخدمة يعطّل الحارس |
--
-- ── صفرُ أثر ───────────────────────────────────────────────────────────────
-- كلُّ كتابةٍ هنا صفوفُ فحصٍ بـ`entity = 'zz-append-only'` داخل معاملاتٍ فرعية
-- تُرجَع، و(ط) تُثبت الصفرَ بلقطةٍ قبل/بعد لا بالثقة. ولا يُلمَس صفُّ بياناتٍ
-- واحدٌ للمالك.
--
-- المرجع: supabase/migrations/0110_append_only_guards.sql
--         · 0047 (`loyalty_entries_append_only`) · 0036 (`prune_audit_log`)
--         · القاعدة الذهبية ١٦ · D-20
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

  select string_agg(t, '، ') into v_missing
  from (values ('public.audit_log'), ('public.ledger_entries'),
               ('public.loyalty_entries'), ('public.funnel_events'),
               ('public.loyalty_settings')) x(t)
  where to_regclass(x.t) is null;
  if v_missing is not null then
    raise exception 'شرط مسبق: جداول مفقودة: %', v_missing;
  end if;

  if to_regprocedure('public.prune_audit_log(integer)') is null then
    raise exception 'شرط مسبق: `prune_audit_log(integer)` غير موجودة — لا حكم على استثناء الاحتفاظ';
  end if;

  -- 🔴 عقدُ المُشغّل، ويُفحص **قبل أول كتابة**: هذا الملفُّ يكتب صفوفَ تدقيقٍ
  --    ثم يُثبت أنه **لا يستطيع حذفها** — وهذا هو الدليل نفسه. فلو شُغّل خارج
  --    `pnpm db:test` (الذي يفتح معاملةً ويُرجعها) لبقيت الصفوف في سجلّ المالك
  --    إلى الأبد. فالرفضُ هنا أرخص من صفٍّ لا يُمحى.
  if current_setting('tours.test_tx', true) is distinct from 'rollback' then
    raise exception
      '🔴 هذه المجموعة تكتب صفوفَ تدقيقٍ لا يستطيع أحدٌ حذفها بعد 0110، فلا تُشغَّل إلا عبر `pnpm db:test` (‏`scripts/db-test.mjs` يفتح معاملةً ويُرجعها). المتغيّر `tours.test_tx` غير مضبوط ⇒ أنت خارج المُشغّل.';
  end if;

  raise notice '✔ (٠) الشروط المسبقة سليمة · وعقدُ المُشغّل (معاملةٌ تُرجَع) قائم';
end;
$$;

-- ----------------------------------------------------------------------------
-- (أ) 🔴 المصفوفة: كلُّ فعلٍ × كلُّ دور — والمنحُ هو الحارس
--
-- ثلاثةُ أدوارٍ يصلها المتصفح أو الخادم (`service_role` · `authenticated` ·
-- `anon`) × أربعةُ جداول × ثلاثةُ أفعال (UPDATE · DELETE · TRUNCATE)
-- = ٣٦ خانةً، كلُّها يجب أن تكون **بلا منح**.
-- ----------------------------------------------------------------------------
do $$
declare
  r        record;
  v_bad    text := '';
  v_cells  integer := 0;
begin
  for r in
    select t.tbl, x.role, v.verb
    from (values ('public.audit_log'), ('public.ledger_entries'),
                 ('public.loyalty_entries'), ('public.funnel_events')) t(tbl)
    cross join (values ('service_role'), ('authenticated'), ('anon')) x(role)
    cross join (values ('UPDATE'), ('DELETE'), ('TRUNCATE')) v(verb)
  loop
    v_cells := v_cells + 1;
    if has_table_privilege(r.role, r.tbl, r.verb) then
      v_bad := v_bad || format('%s/%s/%s · ', r.tbl, r.role, r.verb);
    end if;
  end loop;

  if v_bad <> '' then
    raise exception
      '(أ) منحٌ باقٍ على سجلٍّ مُلحَقٍ فقط — الخانات: %  (والمنحُ هو الحارس: RLS لا يراها service_role ولا تغطّي TRUNCATE أصلاً)',
      v_bad;
  end if;

  if v_cells <> 36 then
    raise exception '(أ) المصفوفة % خانةً لا ٣٦ — الفحصُ لا يفحص ما يدّعيه', v_cells;
  end if;

  -- والشاهد المعاكس: ما **يجب** أن يبقى ممنوحاً، وإلا كان الفحصُ أعلاه يمرّ
  -- على قاعدةٍ سُحب منها كلُّ شيء فتوقّف التطبيق.
  if not has_table_privilege('service_role', 'public.audit_log', 'INSERT') then
    raise exception '(أ) سُحب INSERT من دور الخدمة على audit_log — التطبيق لا يستطيع أن يكتب تاريخاً';
  end if;
  if not has_table_privilege('service_role', 'public.funnel_events', 'INSERT') then
    raise exception '(أ) سُحب INSERT من دور الخدمة على funnel_events — lib/analytics/emit.ts يكتب بعميل الخدمة';
  end if;
  if not has_table_privilege('service_role', 'public.audit_log', 'SELECT')
     or not has_table_privilege('authenticated', 'public.audit_log', 'SELECT') then
    raise exception '(أ) سُحبت القراءة — شاشةُ السجلّ تعمى';
  end if;

  -- و`TRUNCATE loyalty_settings` بدور الخدمة كان يمحو قرارَ المالك بصفر أثر
  if has_table_privilege('service_role', 'public.loyalty_settings', 'TRUNCATE') then
    raise exception '(أ) دورُ الخدمة ما زال يفرّغ loyalty_settings — قرارُ المالك (١٫٢٥ نقطة) يُمحى بأمرٍ واحد بلا صفِّ تدقيق';
  end if;

  raise notice '✔ (أ) ٣٦ خانةً بلا منح · والإدراج والقراءة باقيان · وloyalty_settings لا يُفرَّغ بدور الخدمة';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ب) 🔴 والحارسُ يوقف **المالك** — وهو ما لا يفعله المنح
--     (بدور المُشغّل نفسه: `postgres`، مالكُ الجدول)
-- ----------------------------------------------------------------------------
do $$
declare
  v_id  bigint;
  v_n   integer;
  v_msg text;
begin
  insert into public.audit_log (actor_kind, entity, action, entity_label)
  values ('system', 'zz-append-only', 'insert', 'zz-ao-recent')
  returning id into v_id;

  -- (ب-١) تعديلُ صفٍّ حديث ⇒ مرفوض
  begin
    update public.audit_log set note = 'zz-tamper' where id = v_id;
    raise exception '(ب-١) تعديلُ صفِّ تدقيقٍ نجح بدور المالك — الحارسُ غائب أو معطَّل';
  exception
    when others then
      v_msg := sqlerrm;
      if position('مُلحَقٌ فقط' in v_msg) = 0 then raise; end if;
  end;

  -- (ب-٢) حذفُ صفٍّ حديث ⇒ مرفوض
  begin
    delete from public.audit_log where id = v_id;
    raise exception '(ب-٢) حذفُ صفِّ تدقيقٍ حديث نجح — التاريخُ يُمحى بسطر';
  exception
    when others then
      v_msg := sqlerrm;
      if position('مُلحَقٌ فقط' in v_msg) = 0 then raise; end if;
  end;

  -- (ب-٣) والصفُّ ما زال هناك كما كتبه المُشغّل — لا نصفُ تعديل
  select count(*)::integer into v_n
  from public.audit_log where id = v_id and note is null;
  if v_n <> 1 then
    raise exception '(ب-٣) الصفُّ اختفى أو تغيّر رغم رفض الفعلين';
  end if;

  raise notice '✔ (ب) الحارسُ يرفض التعديلَ والحذفَ حتى بدور مالك الجدول — لا بالمنح وحده';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ج) وسياسةُ الاحتفاظ المُعلَنة تمرّ — وإلا كان الحارسُ قتل ميزةً قائمة
--
-- `prune_audit_log(p)` أرضيتُها `greatest(coalesce(p,730), 365)` ⇒ لا تحذف
-- أبداً ما هو أحدث من سنة. والحارسُ يسمح **بنفس الشرط حرفياً** ولا شيء سواه.
-- ----------------------------------------------------------------------------
do $$
declare
  v_old bigint;
  v_n   integer;
begin
  insert into public.audit_log (actor_kind, entity, action, entity_label, occurred_at)
  values ('system', 'zz-append-only', 'insert', 'zz-ao-400d', now() - interval '400 days')
  returning id into v_old;

  delete from public.audit_log where id = v_old;
  get diagnostics v_n = row_count;
  if v_n <> 1 then
    raise exception '(ج-١) صفٌّ عمره ٤٠٠ يوماً لم يُحذف — الحارسُ قتل سياسةَ الاحتفاظ، وprune_audit_log صارت زينة';
  end if;

  -- (ج-٢) وحافةُ السنة تحرس: ٣٦٤ يوماً لا يُحذف
  insert into public.audit_log (actor_kind, entity, action, entity_label, occurred_at)
  values ('system', 'zz-append-only', 'insert', 'zz-ao-364d', now() - interval '364 days')
  returning id into v_old;

  begin
    delete from public.audit_log where id = v_old;
    raise exception '(ج-٢) صفٌّ عمره ٣٦٤ يوماً حُذف — الأرضيةُ تحت السنة، والحارسُ أوسع من السياسة';
  exception
    when others then
      if position('مُلحَقٌ فقط' in sqlerrm) = 0 then raise; end if;
  end;

  -- (ج-٣) والدالة نفسها تُنفَّذ من فوق الحارس بلا استثناء
  perform public.prune_audit_log(365);

  raise notice '✔ (ج) ٤٠٠ يوماً يُحذف · ٣٦٤ لا يُحذف · وprune_audit_log تمرّ — الحارسُ بحدّ السياسة لا أوسع';
end;
$$;

-- ----------------------------------------------------------------------------
-- (د) والشقيقُ الذي وُلد بالحارس لم يُمسّ: `loyalty_entries` كما كان
-- ----------------------------------------------------------------------------
do $$
declare
  v_n integer;
begin
  select count(*)::integer into v_n
  from pg_trigger t join pg_class c on c.oid = t.tgrelid
  join pg_namespace ns on ns.oid = c.relnamespace
  where ns.nspname = 'public' and c.relname = 'loyalty_entries'
    and t.tgname = 'loyalty_entries_append_only' and not t.tgisinternal;
  if v_n <> 1 then
    raise exception '(د) `loyalty_entries_append_only` اختفى — 0110 داست على حارسٍ قائم';
  end if;

  raise notice '✔ (د) حارسُ دفتر الولاء قائمٌ كما كان — لا نكهةَ ثانية ولا استبدال';
end;
$$;

-- ----------------------------------------------------------------------------
-- (هـ) وثلاثةُ الأشقّاء يحملون مُشغّلَ TRUNCATE — الفعلُ الذي لا يراه
--      `FOR EACH ROW` ولا تراه RLS
-- ----------------------------------------------------------------------------
do $$
declare
  v_missing text;
begin
  select string_agg(x.tbl || '/' || x.trg, '، ') into v_missing
  from (values ('audit_log', 'audit_log_no_truncate'),
               ('ledger_entries', 'ledger_entries_no_truncate'),
               ('loyalty_entries', 'loyalty_entries_no_truncate'),
               ('funnel_events', 'funnel_events_no_truncate')) x(tbl, trg)
  where not exists (
    select 1 from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace ns on ns.oid = c.relnamespace
    where ns.nspname = 'public' and c.relname = x.tbl
      and t.tgname = x.trg and not t.tgisinternal
      and (t.tgtype & 32) <> 0   -- TRIGGER_TYPE_TRUNCATE
      and (t.tgtype & 1) = 0     -- FOR EACH STATEMENT
  );

  if v_missing is not null then
    raise exception
      '(هـ) مُشغّلُ TRUNCATE مفقودٌ أو ليس مُشغّلَ بيان: % — و`FOR EACH ROW` لا يُطلق على TRUNCATE إطلاقاً',
      v_missing;
  end if;

  raise notice '✔ (هـ) أربعةُ مُشغّلات TRUNCATE على مستوى البيان — الأربعةُ موجودة وبالنوع الصحيح';
end;
$$;

-- ----------------------------------------------------------------------------
-- (و) 🔴 العزل الحيّ: الأدوارُ الثلاثة تُرفض فعلاً لا بالمنح المُعلَن وحده
--     (‏UPDATE وDELETE بمحاولةٍ حقيقية — وTRUNCATE قيس بالمنح، والسبب في الرأس)
-- ----------------------------------------------------------------------------
do $$
declare
  r      record;
  v_bad  text := '';
  v_n    integer := 0;
begin
  for r in
    -- العمودُ لكل جدول عمودٌ عاديٌّ nullable: `audit_log.id` هو
    -- `GENERATED ALWAYS AS IDENTITY` فـ`set id = id` يسقط في تحليلٍ سابقٍ
    -- لفحص الصلاحية (‏428C9) فيقيس شيئاً آخر تماماً.
    select x.role, t.tbl, t.col
    from (values ('service_role'), ('authenticated'), ('anon')) x(role)
    cross join (values ('public.audit_log', 'note'),
                       ('public.ledger_entries', 'note'),
                       ('public.loyalty_entries', 'note'),
                       ('public.funnel_events', 'reference')) t(tbl, col)
  loop
    execute format('set local role %I', r.role);

    begin
      execute format('update %s set %I = %I where false', r.tbl, r.col, r.col);
      v_bad := v_bad || format('%s/%s/UPDATE نجح · ', r.tbl, r.role);
    exception
      when insufficient_privilege then v_n := v_n + 1;
      when others then
        if position('مُلحَقٌ فقط' in sqlerrm) = 0 then
          v_bad := v_bad || format('%s/%s/UPDATE ردَّ %s · ', r.tbl, r.role, sqlstate);
        else
          v_n := v_n + 1;
        end if;
    end;

    begin
      execute format('delete from %s where false', r.tbl);
      v_bad := v_bad || format('%s/%s/DELETE نجح · ', r.tbl, r.role);
    exception
      when insufficient_privilege then v_n := v_n + 1;
      when others then
        if position('مُلحَقٌ فقط' in sqlerrm) = 0 then
          v_bad := v_bad || format('%s/%s/DELETE ردَّ %s · ', r.tbl, r.role, sqlstate);
        else
          v_n := v_n + 1;
        end if;
    end;

    execute 'reset role';
  end loop;

  if v_bad <> '' then
    raise exception '(و) خاناتٌ لم تُرفض كما يجب: %', v_bad;
  end if;
  if v_n <> 24 then
    raise exception '(و) رُفضت % محاولةً لا ٢٤ — الفحصُ لم يشغّل ما يدّعيه', v_n;
  end if;

  raise notice '✔ (و) ٢٤ محاولةً حيّة (٣ أدوار × ٤ جداول × فعلين) رُفضت كلُّها بـ42501';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ز) 🔴 والمخرجُ نفسه ليس ثقباً: تعطيلُ الحارس يتطلّب ملكيةَ الجدول
--
-- المخرجُ المُعلَن للصيانة هو `ALTER TABLE … DISABLE TRIGGER`. ولو استطاعه
-- حاملُ مفتاح الخدمة لصار الحارسُ سطراً في ملف.
-- ----------------------------------------------------------------------------
do $$
begin
  execute 'set local role service_role';
  begin
    execute 'alter table public.audit_log disable trigger audit_log_append_only';
    execute 'reset role';
    raise exception '(ز) دورُ الخدمة عطّل حارسَ السجلّ — المخرجُ ثقب، والحارسُ زينة';
  exception
    when insufficient_privilege then
      begin execute 'reset role'; exception when others then null; end;
    when others then
      begin execute 'reset role'; exception when others then null; end;
      if position('(ز)' in sqlerrm) > 0 then raise; end if;
      if sqlstate <> '42501' then raise; end if;
  end;

  raise notice '✔ (ز) تعطيلُ الحارس ممنوعٌ على دور الخدمة — المخرجُ عند حدّ ملكية الجدول لا عند حدّ المفتاح';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ح) وTRUNCATE يُرفض فعلاً بدور المالك — المحاولةُ الحيّة الوحيدة، وفي الآخر
--     عمداً: الأمرُ يأخذ `ACCESS EXCLUSIVE` قبل المُشغّل، والقفلُ يبقى إلى
--     نهاية المعاملة، فيُؤخَّر إلى ما بعد كل قياسٍ آخر.
-- ----------------------------------------------------------------------------
do $$
begin
  begin
    execute 'truncate table public.audit_log';
    raise exception '(ح) TRUNCATE على audit_log نجح — مُشغّلُ البيان غائب، وRLS لا تغطّي هذا الفعل أصلاً';
  exception
    when others then
      if position('TRUNCATE ممنوع' in sqlerrm) = 0 then raise; end if;
  end;

  raise notice '✔ (ح) TRUNCATE مرفوضٌ بمُشغّل بيانٍ حتى بدور مالك الجدول';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ط) صفرُ أثر — لا صفَّ فحصٍ باقٍ ولا صفَّ بياناتٍ مسَّه هذا الملف
-- ----------------------------------------------------------------------------
do $$
declare
  v_n integer;
begin
  select count(*)::integer into v_n
  from public.audit_log where entity = 'zz-append-only';

  -- الصفّان الباقيان بقصد: `zz-ao-recent` و`zz-ao-364d` — الحارسُ نفسه يمنع
  -- حذفهما، وهذا **هو** الدليل. ومُشغّلُ الاختبارات يُرجع الملفَّ كاملاً
  -- (`scripts/db-test.mjs`) فلا يبقى منهما شيءٌ على القرص.
  if v_n <> 2 then
    raise exception
      '(ط) صفوفُ الفحص % لا ٢ — إمّا أن حذفاً نجح حيث يجب أن يُرفض، وإمّا أن الملفَّ لا يكتب ما يدّعي',
      v_n;
  end if;

  raise notice '✔ (ط) صفّا الفحص باقيان لأن الحارسَ يمنع حذفهما — والمُشغّلُ يُرجع الملفَّ فيمحوهما';
end;
$$;

-- ════════════════════════════════════════════════════════════════════════════
--  الأقسام (ي) … (ص) — أُضيفت مع الهجرة 0114
--
--  🔴 لماذا لم يمسك هذا الملفُّ ثقبَي 0114 وهو مكتوبٌ لهما بالضبط:
--
--    ١) القسم (أ) يسأل عن `UPDATE` و`DELETE` و`TRUNCATE` على أربعة جداول،
--       **ولا يسأل عن `TRIGGER` ولا `REFERENCES` ولا `MAINTAIN` قط**. وحاملُ
--       `TRIGGER` لا يحتاج أياً من الثلاثة الأولى: يعلّق على `audit_log`
--       مُشغّلاً يُرجع `null` فتُبتلع كلُّ كتابةٍ تدقيقية صامتة، والحارسُ باقٍ.
--       والقسم (ز) كان يسأل عن `DISABLE TRIGGER` وحده — وهو **الفعلُ الوحيد
--       من الثلاثة الذي تحرسه الملكية**، فمرَّ الفحصُ على البابِ المُقفَل
--       وتجاهل المفتوح.
--    ٢) و`loyalty_settings` كان يُسأل عنه سؤالٌ واحد: `TRUNCATE`. **ولا سطرَ
--       واحد في هذا الملف كان يسأل عن `DELETE` عليه** — وهو الفعلُ الذي
--       يعرفه PostgREST، أي الفوهةُ الفعلية. المقيس قبل 0114:
--       `delete from public.loyalty_settings where true` بدور الخدمة
--       ⇒ rowCount = 1.
--
--  والقاعدةُ المشتقّة، وهي ما تحرسه هذه الأقسام: **الفحصُ يُعدّد الأفعالَ من
--  الكتالوج لا من الذاكرة.** كلُّ فعلٍ يعرفه `has_table_privilege` × كلُّ دورٍ
--  يصله المتصفح أو الخادم — وما لا يُسأل عنه يُترك مفتوحاً بلا أن يقول أحدٌ شيئاً.
--
--  🔬 وما يجب أن تُسقطه هذه الأقسام:
--
--    | الطفرة | التأكيد الذي يجب أن يسقط |
--    |---|---|
--    | `grant trigger on audit_log to service_role` | (ي) و(ل-١) |
--    | `grant delete on loyalty_settings to service_role` | (ي) و(ل-٤) |
--    | `grant truncate on <أيّ جدول> to service_role` | (ك-١) |
--    | إعادة `alter default privileges … grant trigger …` | (ك-٢) |
--    | `drop trigger loyalty_settings_no_delete` | (م-٢) |
--    | `drop trigger loyalty_settings_no_truncate` | (ص) |
--    | سحبُ `INSERT` عن دور الخدمة (إفراطٌ في الإغلاق) | (ن-١) |
--    | سحبُ ملكية المخرج / قفلُ الصيانة بلا مفتاح | (ن-٣) |
-- ════════════════════════════════════════════════════════════════════════════

-- ----------------------------------------------------------------------------
-- (ي) 🔴 المصفوفة الكاملة — كلُّ فعلٍ × كلُّ دور، و`DELETE` صراحةً
--
-- مصفوفتان لأن العقدَ مختلف: جداولُ السجلّ الأربعة **لا يُكتب فيها إلا إلحاقاً**،
-- بينما `loyalty_settings` **يُحدَّث بقصد** (شاشةُ الولاء تحفظ فيه) ولا يُحذف
-- ولا يُفرَّغ. فأيُّ فحصٍ يسوّي بينهما إمّا يفتح ثقباً أو يعطّل شاشة.
-- ----------------------------------------------------------------------------
do $$
declare
  r       record;
  v_bad   text := '';
  v_cells integer := 0;
begin
  -- (ي-١) جداولُ السجلّ الأربعة: ستةُ أفعالٍ × ثلاثةُ أدوار × أربعةُ جداول = ٧٢
  for r in
    select t.tbl, x.role, v.verb
    from (values ('public.audit_log'), ('public.ledger_entries'),
                 ('public.loyalty_entries'), ('public.funnel_events')) t(tbl)
    cross join (values ('service_role'), ('authenticated'), ('anon')) x(role)
    cross join (values ('UPDATE'), ('DELETE'), ('TRUNCATE'),
                       ('TRIGGER'), ('REFERENCES'), ('MAINTAIN')) v(verb)
  loop
    v_cells := v_cells + 1;
    if has_table_privilege(r.role, r.tbl, r.verb) then
      v_bad := v_bad || format('%s/%s/%s · ', r.tbl, r.role, r.verb);
    end if;
  end loop;

  -- (ي-٢) و`loyalty_settings`: خمسةُ أفعالٍ ممنوعة × ثلاثةُ أدوار = ١٥
  --       (‏`UPDATE` مستثنىً عمداً — وله شاهدٌ معاكس أدناه)
  for r in
    select 'public.loyalty_settings'::text as tbl, x.role, v.verb
    from (values ('service_role'), ('authenticated'), ('anon')) x(role)
    cross join (values ('DELETE'), ('TRUNCATE'),
                       ('TRIGGER'), ('REFERENCES'), ('MAINTAIN')) v(verb)
  loop
    v_cells := v_cells + 1;
    if has_table_privilege(r.role, r.tbl, r.verb) then
      v_bad := v_bad || format('%s/%s/%s · ', r.tbl, r.role, r.verb);
    end if;
  end loop;

  if v_bad <> '' then
    raise exception
      '(ي) منحةٌ باقية تنزع الحارسَ أو تمحو قرارَ المالك — الخانات: %  (و`TRIGGER` وحده كافٍ: مُشغّلٌ يُرجع null على audit_log يبتلع التاريخَ صامتاً والحارسُ في مكانه)',
      v_bad;
  end if;
  if v_cells <> 87 then
    raise exception '(ي) المصفوفة % خانةً لا ٨٧ — الفحصُ لا يفحص ما يدّعيه', v_cells;
  end if;

  -- الشاهدُ المعاكس: ما **يجب** أن يبقى، وإلا مرَّ الفحصُ على قاعدةٍ مشلولة
  if not has_table_privilege('authenticated', 'public.loyalty_settings', 'UPDATE') then
    raise exception '(ي) سُحب UPDATE عن `authenticated` على loyalty_settings — شاشةُ /admin/loyalty لا تحفظ، وقرارُ المالك صار غيرَ قابلٍ للتغيير لا محميّاً';
  end if;
  if not has_table_privilege('authenticated', 'public.loyalty_settings', 'SELECT') then
    raise exception '(ي) سُحبت القراءة عن `authenticated` على loyalty_settings — شاشةُ الولاء تعمى';
  end if;

  raise notice '✔ (ي) ٨٧ خانةً بلا منح — و`DELETE` على loyalty_settings منها صراحةً (وهو ما لم يكن يُسأل عنه قط) · والتحديثُ المشروع باقٍ';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ك) 🔴 والصنفُ كلُّه لا الجداولُ الخمسة — ومعه الجذرُ الذي يعيده
--
-- الثقبُ لم يكن حادثةً في خمسة جداول: `service_role` كان يملك `TRIGGER` على
-- ٦٥ من ٦٦ جدولاً و١٣ من ١٣ اطّلاعاً، و`authenticated` على سبعةِ جداول منها
-- `profiles` و`site_settings` و`pages` و`sections`. وسببُه صلاحيةٌ افتراضية
-- تمنح `arwdDxtm` لكل جدولٍ جديد — فسحبُها جدولاً جدولاً سعيٌ خلف ذيل.
-- ----------------------------------------------------------------------------
do $$
declare
  r       record;
  v_bad   text := '';
  v_cells integer := 0;
begin
  for r in
    select x.role, c.oid::regclass::text as rel, v.verb
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    cross join (values ('anon'), ('authenticated'), ('service_role')) x(role)
    cross join (values ('TRIGGER'), ('TRUNCATE'), ('REFERENCES'), ('MAINTAIN')) v(verb)
    where n.nspname = 'public' and c.relkind in ('r', 'v', 'm', 'p', 'f')
  loop
    v_cells := v_cells + 1;
    if has_table_privilege(r.role, r.rel, r.verb) then
      v_bad := v_bad || format('%s/%s/%s · ', r.rel, r.role, r.verb);
    end if;
  end loop;

  if v_bad <> '' then
    raise exception '(ك-١) منحةُ نزعِ حارسٍ أو تجاوزِ RLS باقية في الصنف — %', v_bad;
  end if;
  if v_cells < 300 then
    raise exception '(ك-١) المصفوفة % خانةً فقط — إمّا أن المخطط فرغ وإمّا أن الفحص لا يمسح ما يدّعيه', v_cells;
  end if;

  -- (ك-٢) والجذر: الصلاحيةُ الافتراضية لم تعد تلد `t`/`D`/`x`/`m`
  if exists (
    select 1 from pg_default_acl d
    where d.defaclrole = 'postgres'::regrole
      and d.defaclnamespace = 'public'::regnamespace
      and d.defaclobjtype = 'r'
      and d.defaclacl::text ~ '(anon|authenticated|service_role)=[a-zA-Z]*[tDxm]'
  ) then
    raise exception
      '(ك-٢) الصلاحيةُ الافتراضية ما زالت تمنح t/D/x/m لأدوار PostgREST — والجدولُ القادم يولد بالثقب مهما نُظّفت الجداولُ القائمة';
  end if;

  -- والشاهدُ المعاكس: `arwd` باقيةٌ في الافتراضي، وإلا وُلد الجدولُ القادم ميتاً
  if not exists (
    select 1 from pg_default_acl d
    where d.defaclrole = 'postgres'::regrole
      and d.defaclnamespace = 'public'::regnamespace
      and d.defaclobjtype = 'r'
      and d.defaclacl::text like '%service_role=arwd/%'
  ) then
    raise exception '(ك-٢) الصلاحيةُ الافتراضية لم تعد تمنح arwd لدور الخدمة — كلُّ جدولٍ جديد سيولد بلا قراءةٍ ولا كتابة';
  end if;

  raise notice '✔ (ك) % خانةً في كل جداول واطّلاعات public بلا TRIGGER/TRUNCATE/REFERENCES/MAINTAIN لأدوار PostgREST · والصلاحيةُ الافتراضية لم تعد تلد الثقب', v_cells;
end;
$$;

-- ----------------------------------------------------------------------------
-- (ل) 🔴 والحكمُ بالنداء الحيّ لا بقراءة منحة (القاعدة ١٩)
--
-- أربعةُ أفعالٍ × ثلاثةُ أدوار = ١٢ محاولةً حقيقية. و`TRUNCATE` وحده يُقاس
-- بالمنح لا بالنداء — والسببُ في رأس الملف (قفل `ACCESS EXCLUSIVE`).
-- ----------------------------------------------------------------------------
do $$
declare
  r     record;
  v_bad text := '';
  v_n   integer := 0;
begin
  for r in select unnest(array['service_role', 'authenticated', 'anon']) as role
  loop
    execute format('set local role %I', r.role);

    -- (ل-١) تركيبُ مُشغّلٍ على سجلّ التدقيق — الثقبُ الأصلي
    begin
      execute 'create trigger zz_ao_kill before insert on public.audit_log
               for each row execute function public.append_only_truncate_guard()';
      v_bad := v_bad || format('%s/CREATE TRIGGER نجح · ', r.role);
    exception
      when insufficient_privilege then v_n := v_n + 1;
      when others then v_bad := v_bad || format('%s/CREATE TRIGGER ردَّ %s · ', r.role, sqlstate);
    end;

    -- (ل-٢) تعطيلُ الحارس
    begin
      execute 'alter table public.audit_log disable trigger audit_log_append_only';
      v_bad := v_bad || format('%s/DISABLE TRIGGER نجح · ', r.role);
    exception
      when insufficient_privilege then v_n := v_n + 1;
      when others then v_bad := v_bad || format('%s/DISABLE TRIGGER ردَّ %s · ', r.role, sqlstate);
    end;

    -- (ل-٣) إسقاطُ الحارس
    begin
      execute 'drop trigger audit_log_append_only on public.audit_log';
      v_bad := v_bad || format('%s/DROP TRIGGER نجح · ', r.role);
    exception
      when insufficient_privilege then v_n := v_n + 1;
      when others then v_bad := v_bad || format('%s/DROP TRIGGER ردَّ %s · ', r.role, sqlstate);
    end;

    -- (ل-٤) 🔴 ومحوُ قرار المالك بأمرٍ واحد — الفعلُ الذي يعرفه PostgREST
    begin
      execute 'delete from public.loyalty_settings where true';
      v_bad := v_bad || format('%s/DELETE loyalty_settings نجح · ', r.role);
    exception
      when insufficient_privilege then v_n := v_n + 1;
      when others then
        if position('قرارُ مالكٍ لا يُمحى' in sqlerrm) = 0 then
          v_bad := v_bad || format('%s/DELETE ردَّ %s · ', r.role, sqlstate);
        else
          v_n := v_n + 1;
        end if;
    end;

    execute 'reset role';
  end loop;

  if v_bad <> '' then
    raise exception '(ل) خاناتٌ لم تُرفض كما يجب: %', v_bad;
  end if;
  if v_n <> 12 then
    raise exception '(ل) رُفضت % محاولةً لا ١٢ — الفحصُ لم يشغّل ما يدّعيه', v_n;
  end if;

  raise notice '✔ (ل) ١٢ محاولةً حيّة (٣ أدوار × تركيبِ مُشغّل · تعطيلِه · إسقاطِه · محوِ قرارِ المالك) رُفضت كلُّها';
end;
$$;

-- ----------------------------------------------------------------------------
-- (م) والمُشغّلُ يوقف **المالكَ** كذلك — وهو ما لا يفعله المنح
-- ----------------------------------------------------------------------------
do $$
declare
  v_n integer;
begin
  -- (م-١) المالكُ يملك المنحة كلَّها…
  if not has_table_privilege('postgres', 'public.loyalty_settings', 'DELETE') then
    raise exception '(م-١) مالكُ الجدول بلا DELETE — الفحصُ التالي سيقيس المنحَ لا المُشغّل';
  end if;

  -- (م-٢) …ومع ذلك يُردّ
  begin
    delete from public.loyalty_settings where true;
    raise exception '(م-٢) مالكُ الجدول حذف صفَّ إعدادات الولاء — المُشغّلُ غائب، وقرارُ المالك يُمحى بسطر';
  exception
    when others then
      if position('قرارُ مالكٍ لا يُمحى' in sqlerrm) = 0 then raise; end if;
  end;

  -- (م-٣) والصفُّ ما زال هناك — لا نصفُ حذف
  select count(*)::integer into v_n from public.loyalty_settings;
  if v_n <> 1 then
    raise exception '(م-٣) `loyalty_settings` فيه % صفاً لا واحداً بعد رفض الحذف', v_n;
  end if;

  raise notice '✔ (م) صفُّ قرار المالك لا يُحذف حتى بدور مالك الجدول — لا بالمنح وحده';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ن) 🔴 والمسارات المشروعة لم تنكسر — قفلٌ بلا مفتاح عطلٌ آخر
-- ----------------------------------------------------------------------------
do $$
declare
  v_base bigint;
  v_n    integer;
  v_pct  numeric;
begin
  -- (ن-١) دورُ الخدمة ما زال يكتب صفَّ تدقيقٍ وصفَّ قمع — التطبيق يفعلها دائماً
  select coalesce(max(id), 0) into v_base from public.audit_log;
  execute 'set local role service_role';
  insert into public.audit_log (actor_kind, entity, action, entity_label)
  values ('system', 'zz-ao-legit', 'insert', 'zz-ao-service-write');
  execute 'reset role';
  select count(*)::integer into v_n
  from public.audit_log where id > v_base and entity = 'zz-ao-legit';
  if v_n <> 1 then
    raise exception '(ن-١) دورُ الخدمة لم يعد يكتب في السجلّ — الإصلاحُ أعمى التطبيق بدل أن يحرسه';
  end if;

  -- (ن-٢) وتعديلُ إعدادٍ مشروع ما زال يُنتج صفَّ تدقيقه
  --       (‏`log_audit` يتجاهل تعديلاً لا يغيّر شيئاً، فالتغييرُ حقيقيٌّ والملفُّ يُرجَع)
  select coalesce(max(id), 0) into v_base from public.audit_log;
  select max_redeem_percent into v_pct from public.loyalty_settings;
  update public.loyalty_settings
     set max_redeem_percent = case when v_pct = 11 then 12 else 11 end;
  select count(*)::integer into v_n
  from public.audit_log
  where id > v_base and entity = 'loyalty_settings' and action = 'update';
  if v_n <> 1 then
    raise exception '(ن-٢) تعديلُ إعدادٍ مشروع أنتج % صفَّ تدقيق لا واحداً — إمّا أن الحفظ انكسر وإمّا أن أثرَه ضاع', v_n;
  end if;

  -- (ن-٣) 🔴 والمخرجُ للصيانة يفتح فعلاً: الهجرةُ القادمة ليست محبوسة
  alter table public.loyalty_settings disable trigger loyalty_settings_no_delete;
  delete from public.loyalty_settings where true;
  get diagnostics v_n = row_count;
  alter table public.loyalty_settings enable trigger loyalty_settings_no_delete;
  if v_n <> 1 then
    raise exception '(ن-٣) المخرجُ المُعلَن لا يفتح — DISABLE TRIGGER ثم DELETE أعطى % صفاً، وقفلٌ بلا مفتاحٍ عطلٌ لا حراسة', v_n;
  end if;

  -- (ن-٤) والمالكُ ما زال يركّب مُشغّلاً ويُسقطه — أي أن الهجرات ممكنة كما كانت
  create trigger zz_ao_owner_probe before insert on public.audit_log
    for each row execute function public.append_only_truncate_guard();
  drop trigger zz_ao_owner_probe on public.audit_log;

  raise notice '✔ (ن) الكتابةُ التدقيقية بدور الخدمة تعمل · وحفظُ الإعدادات يُنتج أثرَه · والمخرجُ (DISABLE TRIGGER) يفتح ويغلق · والمالكُ يركّب مُشغّلاً ويُسقطه ⇒ الهجراتُ ممكنة';
end;
$$;

-- ----------------------------------------------------------------------------
-- (ص) وتفريغُ صفِّ القرار مرفوضٌ بمُشغّل بيان — **آخرُ فحصٍ عمداً**
--     (‏`TRUNCATE` يأخذ `ACCESS EXCLUSIVE` قبل المُشغّل، والقفلُ يبقى إلى نهاية
--      المعاملة، و`loyalty_config()` تقرأ هذا الجدول في كل تسعيرة)
-- ----------------------------------------------------------------------------
do $$
begin
  begin
    execute 'truncate table public.loyalty_settings';
    raise exception '(ص) TRUNCATE على loyalty_settings نجح — مُشغّلُ البيان غائب، وRLS لا تغطّي هذا الفعل أصلاً';
  exception
    when others then
      if position('TRUNCATE ممنوع' in sqlerrm) = 0 then raise; end if;
  end;

  raise notice '✔ (ص) TRUNCATE على loyalty_settings مرفوضٌ بمُشغّل بيانٍ حتى بدور المالك';
  raise notice 'ALL PASSED — السجلُّ مُلحَقٌ فقط بالمنح وبالمُشغّل · ولا يُنزَع الحارسُ بمنحةِ TRIGGER · ولا يُمحى قرارُ المالك بـDELETE ولا بـTRUNCATE · والصلاحيةُ الافتراضية لم تعد تلد الثقب · والمساراتُ المشروعة والهجراتُ سليمة';
end;
$$;
