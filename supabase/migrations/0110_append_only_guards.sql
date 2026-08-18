-- ============================================================================
-- 0110_append_only_guards.sql
-- السجلُّ الذي يُدقِّق لا يجوز أن يكتبه المُدقَّق عليه
-- ============================================================================
--
-- ── العيب، مقيساً لا مُستنتَجاً (2026-08-17T23:5xZ) ─────────────────────────
--
--   -- بدورِ `service_role` داخل `begin … rollback`:
--   update public.audit_log set note='ZZ_PROBE' where id = (…)   ⇒ SUCCEEDED rowCount=1
--   delete from public.audit_log            where id = (…)       ⇒ SUCCEEDED rowCount=1
--   select has_table_privilege('service_role','public.audit_log','TRUNCATE') ⇒ true
--
--   select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid
--    where c.relname='audit_log' and not t.tgisinternal;          ⇒ 0
--
-- بينما شقيقُه `loyalty_entries` يحمل `loyalty_entries_append_only` منذ 0047.
-- فالادّعاء «السجلُّ مُلحَقٌ فقط» صحيحٌ أمام دور المتصفح وحده
-- (`relacl = authenticated=r/postgres` ⇒ قراءةٌ فقط)، **وخاطئٌ أمام حامل مفتاح
-- الخدمة** — وهو المفتاح الذي يعيش في `.env` على الخادم.
--
-- ── ولماذا «المنحُ هو الحارس» لا RLS (القاعدة الذهبية ١٦) ──────────────────
--
-- `service_role` يحمل `rolbypassrls = true` (مقيس) ⇒ **لا سياسةَ RLS تراه
-- إطلاقاً**. و`TRUNCATE` لا تغطّيه RLS أصلاً لأيّ دور. فالحاجزان الوحيدان
-- الفاعلان أمامه: **سحبُ المنح**، و**مُشغّلٌ يرفض**. وهذه الهجرة تضع الاثنين:
--
--   • المنحُ يوقف `service_role` — وهو الدور الذي قد يتسرّب مفتاحه.
--   • والمُشغّلُ يوقف **المالكَ نفسه** (`postgres`) — وهو ما لا يفعله المنح،
--     لأن المالك يستطيع أن يمنح نفسه من جديد. فالمُشغّل يجعل الحذفَ فعلاً
--     **مقصوداً ومعلَناً** لا زلّةَ لوحة مفاتيح.
--
-- ── وما يبقى مسموحاً — بقرارٍ لا بسهو ───────────────────────────────────────
--
--   ١) `INSERT` يبقى لـ`service_role` على الجداول الأربعة: التطبيق **يكتب**
--      صفوف التدقيق وأحداث القمع. «مُلحَقٌ فقط» تعني منعَ التعديل والمحو، لا
--      منعَ الكتابة.
--   ٢) `prune_audit_log(p_keep_days)` — سياسةُ احتفاظٍ **قائمة ومختبَرة**
--      (`audit_tests` القسم و)، حارسُها `audit_admin_allowed()`، وأرضيتُها
--      `greatest(coalesce(p_keep_days,730), 365)` ⇒ **لا تحذف أبداً ما هو أحدث
--      من ٣٦٥ يوماً**. فالمُشغّل هنا يسمح بالحذف **بنفس الشرط حرفياً** ولا شيء
--      سواه: `occurred_at < now() - interval '365 days'`. أي أن الحارس لا
--      يكسر ميزةً قائمة، ولا يفتح ثقباً أوسع منها.
--   ٣) وتفريغُ مفتاحٍ أجنبيٍّ بفعل `ON DELETE SET NULL` يبقى مسموحاً — بنفس
--      نكهة `loyalty_entries_append_only` حرفياً (‏قرأتُها من الكتالوج الحيّ،
--      D-58، لا من ملف الهجرة).
--
-- ── ⚠ وكيف تبقى الهجرات القادمة ممكنة ───────────────────────────────────────
--
-- الهجرات تُطبَّق بدور **`postgres` وهو مالكُ الجداول** (مقيس: `relowner`
-- = postgres · و`current_user` في `db-migrate.mjs` = postgres · و`is_superuser`
-- = off). والمُشغّل يعمل عليه كما يعمل على غيره — **بقصد**. والمخرجُ المُعلَن
-- لهجرةٍ تحتاج فعلاً أن تمسّ تاريخاً (تصحيحُ تنقيحٍ مثل 0038/0039):
--
--     alter table public.audit_log disable trigger audit_log_append_only;
--     …  -- التصحيح، ومعه سطرُ سببٍ في رأس الهجرة
--     alter table public.audit_log enable  trigger audit_log_append_only;
--
-- و`ALTER TABLE … DISABLE TRIGGER` يتطلّب **ملكيةَ الجدول** — أي أنه يقف عند
-- نفس الحدّ الذي يقف عنده كلُّ شيء آخر، ولا يُنال بمفتاح الخدمة.
-- 🔴 ولا يوجد مَخرجٌ بمتغيّر جلسة (`set_config`) بقصد: متغيّرُ الجلسة يضبطه
--    أيُّ دورٍ متصل، فيصير الحارسُ زينةً على أول من يقرأ هذا الملف.
--
-- ── وما لا تفعله هذه الهجرة، مسمّىً ─────────────────────────────────────────
--
-- `ledger_entries` و`funnel_events` **لا تأخذان مُشغّلَ الصفّ** في هذه الجولة —
-- تأخذان سحبَ المنح ومُشغّلَ `TRUNCATE` وحدهما. والسبب مقيس لا تردُّد: أربع
-- مجموعات اختبار تحذف منهما في تنظيفها
-- (`analytics_tests` · `booking_tests` · `finance_tests` · `partner_credit_tests`
--  — خمسة عشر موضعاً) وهي ملفّاتُ جبهاتٍ أخرى تعمل الآن، وتحريرُها من هنا
-- يمحو عملَ وكيلٍ آخر صامتاً (`STANDING-ORDERS §٢هـ`). وبعد أن يصير مُشغّل
-- الاختبارات يُرجِع كلَّ ملف (هذه الجولة نفسها) يصير ذلك التنظيف **زائداً**،
-- فتُحذف المواضع الخمسة عشر ويُركَّب المُشغّلان في هجرةٍ تالية.
--
-- المرجع: القاعدة الذهبية ١٦ (المنحُ هو الحارس · RLS لا تغطّي TRUNCATE)
--         · D-20 (`authenticated` ليس مشرفاً أبداً) · D-58 (الكتالوج الحيّ)
--         · 0047 (`loyalty_entries_append_only`) · 0036/0037 (السجلّ والتقليم)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (١) الشروط المسبقة — لا حارسَ على جدولٍ غائب
-- ----------------------------------------------------------------------------
do $$
declare
  v_missing text;
begin
  select string_agg(t, '، ') into v_missing
  from (values ('public.audit_log'), ('public.ledger_entries'),
               ('public.funnel_events'), ('public.loyalty_entries'),
               ('public.loyalty_settings')) x(t)
  where to_regclass(x.t) is null;

  if v_missing is not null then
    raise exception '0110: جداول مفقودة: % — هجرات سابقة غير مطبَّقة', v_missing;
  end if;

  if to_regprocedure('public.prune_audit_log(integer)') is null then
    raise exception '0110: `prune_audit_log(integer)` غير موجودة — 0036 غير مطبَّقة، والحارسُ سيقتل سياسةَ احتفاظٍ لا يراها';
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- (٢) حارسُ الصفّ — «مُلحَقٌ فقط» بمعنىً واحد مكتوب
--
--   tg_argv[0] : اسمُ عمود الزمن الذي تُقاس عليه سياسةُ الاحتفاظ ('' = لا حذف أبداً)
--   tg_argv[1] : أقلُّ عمرٍ يُسمح بحذفه ('' = لا حذف أبداً)
--   tg_argv[2] : أعمدةُ المفاتيح الأجنبية المسموح لها بأن تُفرَّغ وحدها،
--                مفصولةً بفواصل ('' = لا شيء)
-- ----------------------------------------------------------------------------
create or replace function public.append_only_guard()
returns trigger
language plpgsql
security definer
set search_path to ''
as $fn$
declare
  v_age_col text   := nullif(btrim(coalesce(tg_argv[0], '')), '');
  v_min_age text   := nullif(btrim(coalesce(tg_argv[1], '')), '');
  v_fk_cols text[] := string_to_array(coalesce(tg_argv[2], ''), ',');
  v_old     jsonb;
  v_new     jsonb;
  v_key     text;
  v_freed   boolean := false;
  v_age     timestamptz;
begin
  if tg_op = 'UPDATE' then
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);

    -- فعلُ المفتاح الأجنبي نفسه: المرجع حُذف والصفُّ يبقى بلا مرجع.
    -- (نفس استثناء `loyalty_entries_append_only` — قُرئ من الكتالوج الحيّ)
    foreach v_key in array v_fk_cols loop
      v_key := btrim(v_key);
      if v_key <> ''
         and v_new ? v_key
         and jsonb_typeof(v_new -> v_key) = 'null'
         and jsonb_typeof(v_old -> v_key) <> 'null' then
        v_old   := v_old - v_key;
        v_new   := v_new - v_key;
        v_freed := true;
      end if;
    end loop;

    if v_freed and v_new = v_old then
      return new;
    end if;

    raise exception
      'سجلٌّ مُلحَقٌ فقط: %.% لا يُعدَّل — التصحيح صفٌّ جديد يشير إلى أصله، لا كتابةٌ فوق ما مضى',
      tg_table_schema, tg_table_name
      using hint = 'append-only';
  end if;

  -- DELETE — لا يُسمح إلا بما تسمح به سياسةُ الاحتفاظ المُعلَنة، بنفس شرطها
  if v_age_col is not null and v_min_age is not null then
    v_age := (to_jsonb(old) ->> v_age_col)::timestamptz;
    if v_age is not null and v_age < now() - v_min_age::interval then
      return old;
    end if;

    raise exception
      'سجلٌّ مُلحَقٌ فقط: %.% لا يُحذف قبل انقضاء % — والتقليم وحده يمرّ (prune_audit_log)',
      tg_table_schema, tg_table_name, v_min_age
      using hint = 'append-only';
  end if;

  raise exception
    'سجلٌّ مُلحَقٌ فقط: %.% لا يُحذف',
    tg_table_schema, tg_table_name
    using hint = 'append-only';
end;
$fn$;

comment on function public.append_only_guard() is
  'حارسُ «مُلحَقٌ فقط»: يرفض UPDATE وDELETE على جدولِ سجلّ، ويستثني بقصدٍ (أ) تفريغَ مفتاحٍ أجنبيٍّ بفعل ON DELETE SET NULL و(ب) حذفَ ما تجاوز عمرَ سياسةِ الاحتفاظ. المخرجُ الوحيد للصيانة: ALTER TABLE … DISABLE TRIGGER (ملكيةُ الجدول).';

-- ----------------------------------------------------------------------------
-- (٣) حارسُ TRUNCATE — البابُ الذي لا تراه RLS ولا يراه مُشغّلُ الصفّ
--
-- `FOR EACH ROW` لا يُطلق على TRUNCATE إطلاقاً بحكم بنية Postgres، ولذلك
-- يلزم مُشغّلُ بيانٍ منفصل. وهذا هو بعينه ما جعل `TRUNCATE loyalty_settings`
-- بدور الخدمة ينجح فيمحو قرارَ المالك بصفر صفِّ تدقيق.
-- ----------------------------------------------------------------------------
create or replace function public.append_only_truncate_guard()
returns trigger
language plpgsql
security definer
set search_path to ''
as $fn$
begin
  raise exception
    'سجلٌّ مُلحَقٌ فقط: TRUNCATE ممنوع على %.% — وRLS لا تغطّي TRUNCATE، فالمنعُ مُشغّلٌ لا سياسة',
    tg_table_schema, tg_table_name
    using hint = 'append-only';
end;
$fn$;

comment on function public.append_only_truncate_guard() is
  'يرفض TRUNCATE على جداول السجلّ. مُشغّلُ بيانٍ لأن FOR EACH ROW لا يُطلق على TRUNCATE.';

-- ----------------------------------------------------------------------------
-- (٤) تركيبُ الحرّاس
-- ----------------------------------------------------------------------------

-- (٤-أ) `audit_log` — الحارسُ كاملاً: لا تعديل، ولا حذفَ قبل ٣٦٥ يوماً، ولا تفريغ.
--       ولا استثناءَ مفاتيحَ أجنبية: الجدول **بلا أيّ قيد أجنبي** (مقيس:
--       `pg_constraint … contype='f'` ⇒ صفر صفّ)، فأعمدةُ `booking_id`
--       و`subcontractor_id` أعمدةُ ربطٍ لا مراجع، ولا فعلَ تعاقبٍ يمرّ بها.
drop trigger if exists audit_log_append_only on public.audit_log;
create trigger audit_log_append_only
  before update or delete on public.audit_log
  for each row execute function public.append_only_guard('occurred_at', '365 days', '');

drop trigger if exists audit_log_no_truncate on public.audit_log;
create trigger audit_log_no_truncate
  before truncate on public.audit_log
  for each statement execute function public.append_only_truncate_guard();

-- (٤-ب) الأشقّاء — مُشغّلُ TRUNCATE وحده هذه الجولة (السبب في الرأس)
drop trigger if exists ledger_entries_no_truncate on public.ledger_entries;
create trigger ledger_entries_no_truncate
  before truncate on public.ledger_entries
  for each statement execute function public.append_only_truncate_guard();

drop trigger if exists loyalty_entries_no_truncate on public.loyalty_entries;
create trigger loyalty_entries_no_truncate
  before truncate on public.loyalty_entries
  for each statement execute function public.append_only_truncate_guard();

drop trigger if exists funnel_events_no_truncate on public.funnel_events;
create trigger funnel_events_no_truncate
  before truncate on public.funnel_events
  for each statement execute function public.append_only_truncate_guard();

-- ----------------------------------------------------------------------------
-- (٥) المنحُ هو الحارس — سحبُ ما لا يحتاجه التطبيق من `service_role`
--
-- المقيس قبل السحب: `service_role` يملك arwdDxtm على الأربعة، ولا **دالةٍ حيّة
-- واحدة** في `pg_proc` تُحدِّث أو تحذف منها بدور المنادي (المُقلِّمان
-- `prune_audit_log` و`prune_funnel_events` كلاهما SECURITY DEFINER بمالكٍ
-- postgres ⇒ لا يمسّهما السحب). و`INSERT` يبقى: `lib/analytics/emit.ts` يكتب
-- `funnel_events` بعميل الخدمة صراحةً، و`log_audit()` تكتب `audit_log`.
-- ----------------------------------------------------------------------------
revoke update, delete, truncate on public.audit_log       from service_role;
revoke update, delete, truncate on public.ledger_entries  from service_role;
revoke update, delete, truncate on public.loyalty_entries from service_role;
revoke update, delete, truncate on public.funnel_events   from service_role;

-- وقرارُ المالك لا يُمحى بأمرٍ واحد: `TRUNCATE loyalty_settings` بدور الخدمة
-- نجح فأفرغ الجدول بصفر صفِّ تدقيق (‏`FOR EACH ROW` لا يُطلق على TRUNCATE).
-- والجدولُ صفٌّ واحد يُقرأ ويُحدَّث — ولا مسارَ تشغيلٍ واحد يفرّغه.
revoke truncate on public.loyalty_settings from service_role;

-- ----------------------------------------------------------------------------
-- (٦) فحصٌ ذاتي — الحارسُ يُشغَّل الآن لا يُوصَف
--     كلُّ كتابةٍ هنا داخل معاملةٍ فرعية تُرجَع، فلا صفَّ سجلٍّ يبقى.
-- ----------------------------------------------------------------------------
do $$
declare
  v_before bigint;
  v_after  bigint;
  v_id     bigint;
  v_old    bigint;
  v_n      integer;
  v_ok     boolean;
begin
  select coalesce(max(id), 0) into v_before from public.audit_log;

  begin
    -- (أ) تعديلُ صفٍّ حديث ⇒ مرفوض
    insert into public.audit_log (actor_kind, entity, action, entity_label)
    values ('system', 'zz-0110-selfcheck', 'insert', 'zz-0110')
    returning id into v_id;

    begin
      update public.audit_log set note = 'zz' where id = v_id;
      raise exception '0110(أ): تعديلُ صفِّ تدقيقٍ نجح — الحارس لا يحرس';
    exception
      when others then
        if position('مُلحَقٌ فقط' in sqlerrm) = 0 then raise; end if;
    end;

    -- (ب) حذفُ صفٍّ حديث ⇒ مرفوض
    begin
      delete from public.audit_log where id = v_id;
      raise exception '0110(ب): حذفُ صفِّ تدقيقٍ حديث نجح — الحارس لا يحرس';
    exception
      when others then
        if position('مُلحَقٌ فقط' in sqlerrm) = 0 then raise; end if;
    end;

    -- (ج) وسياسةُ الاحتفاظ تمرّ: صفٌّ عمره ٤٠٠ يوماً يُحذف
    insert into public.audit_log (actor_kind, entity, action, entity_label, occurred_at)
    values ('system', 'zz-0110-selfcheck', 'insert', 'zz-0110-old', now() - interval '400 days')
    returning id into v_old;

    delete from public.audit_log where id = v_old;
    get diagnostics v_n = row_count;
    if v_n <> 1 then
      raise exception '0110(ج): التقليمُ لم يمرّ — صفٌّ عمره ٤٠٠ يوم لم يُحذف، وسياسةُ الاحتفاظ ماتت';
    end if;

    -- (د) و`prune_audit_log` نفسها تعمل من فوق الحارس
    perform public.prune_audit_log(365);

    -- (هـ) TRUNCATE مرفوض
    begin
      execute 'truncate table public.audit_log';
      raise exception '0110(هـ): TRUNCATE على audit_log نجح — المُشغّل غائب';
    exception
      when others then
        if position('TRUNCATE ممنوع' in sqlerrm) = 0 then raise; end if;
    end;

    raise exception '0110_ROLLBACK';
  exception
    when others then
      if sqlerrm <> '0110_ROLLBACK' then raise; end if;
  end;

  -- (و) صفرُ أثر — لا صفَّ فحصٍ باقٍ
  select coalesce(max(id), 0) into v_after from public.audit_log;
  select count(*)::integer into v_n
  from public.audit_log where entity = 'zz-0110-selfcheck';
  if v_n <> 0 then
    raise exception '0110(و): بقي % صفَّ فحصٍ في السجلّ', v_n;
  end if;

  -- (ز) والمنحُ صار كما يجب
  select not (has_table_privilege('service_role', 'public.audit_log', 'UPDATE')
           or has_table_privilege('service_role', 'public.audit_log', 'DELETE')
           or has_table_privilege('service_role', 'public.audit_log', 'TRUNCATE')
           or has_table_privilege('service_role', 'public.ledger_entries', 'UPDATE')
           or has_table_privilege('service_role', 'public.ledger_entries', 'DELETE')
           or has_table_privilege('service_role', 'public.ledger_entries', 'TRUNCATE')
           or has_table_privilege('service_role', 'public.loyalty_entries', 'UPDATE')
           or has_table_privilege('service_role', 'public.loyalty_entries', 'DELETE')
           or has_table_privilege('service_role', 'public.loyalty_entries', 'TRUNCATE')
           or has_table_privilege('service_role', 'public.funnel_events', 'UPDATE')
           or has_table_privilege('service_role', 'public.funnel_events', 'DELETE')
           or has_table_privilege('service_role', 'public.funnel_events', 'TRUNCATE')
           or has_table_privilege('service_role', 'public.loyalty_settings', 'TRUNCATE'))
    into v_ok;
  if not v_ok then
    raise exception '0110(ز): بقي منحُ تعديلٍ أو محوٍ لدور الخدمة على أحد جداول السجلّ';
  end if;

  -- (ح) وما يحتاجه التطبيق بقي: الكتابةُ والقراءة
  if not (has_table_privilege('service_role', 'public.audit_log', 'INSERT')
          and has_table_privilege('service_role', 'public.funnel_events', 'INSERT')
          and has_table_privilege('service_role', 'public.audit_log', 'SELECT')) then
    raise exception '0110(ح): سُحب من دور الخدمة ما يحتاجه التطبيق فعلاً — الإدراج أو القراءة';
  end if;

  raise notice '0110 ✔ `audit_log` صار مُلحَقاً فقط فعلاً: لا تعديل · ولا حذفَ قبل ٣٦٥ يوماً · ولا TRUNCATE · وسياسةُ الاحتفاظ (prune_audit_log) تمرّ كما كانت · وسُحب من `service_role` كلُّ تعديلٍ ومحوٍ وتفريغ على الأربعة، وبقي الإدراج (أعلى id قبل الفحص % وبعده %)',
    v_before, v_after;
end;
$$;

-- ⚠ ولا سطرَ تسجيلٍ في `schema_migrations` هنا: المُشغِّل (`scripts/db-migrate.mjs`)
--    يكتبه بنفسه بعد نجاح الملف.
