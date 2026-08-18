-- ============================================================================
-- 0114_privilege_that_removes_the_guard.sql
-- حارسٌ يستطيع المحروسُ عليه نزعَه ليس حارساً — و«مُلحَقٌ فقط» بلا `DELETE` دعوى
-- ============================================================================
--
-- ── الثقبان، مقيسان لا مستنتجَين (2026-08-18، كلٌّ بدوره داخل `begin … rollback`) ─
--
--   -- ثقب أ: `0110` ركّبت الحرّاس وتركت مفتاحَ نزعِها في يد المحروس عليه
--   has_table_privilege('service_role','audit_log','TRIGGER')       ⇒ true
--   has_table_privilege('service_role','ledger_entries','TRIGGER')  ⇒ true
--   has_table_privilege('service_role','funnel_events','TRIGGER')   ⇒ true
--   has_table_privilege('service_role','loyalty_entries','TRIGGER') ⇒ true
--
--   as service_role: create trigger zz_probe_kill before insert on public.audit_log
--                    for each row execute function public.append_only_truncate_guard()
--                                                                  ⇒ SUCCEEDED
--   as service_role: create function pg_temp.zz_silent() returns trigger … return null
--                    create trigger … before insert on public.audit_log … pg_temp.zz_silent()
--                                                                  ⇒ SUCCEEDED
--
--   ⇒ ولا يلزمه أن يحذف صفاً واحداً: يعلّق على `audit_log` مُشغّلاً يُرجع `null`
--     فتُبتلع **كلُّ** كتابةٍ تدقيقية صامتةً وهي تبدو ناجحة. وحارسُ `0110` باقٍ
--     في مكانه، سليماً، لا يحرس شيئاً.
--
--   -- ثقب ب: `0110` سحبت `TRUNCATE` عن `loyalty_settings` بمبرَّرٍ مكتوب
--   --         («قرارُ المالك لا يُمحى بأمرٍ واحد») وتركت `DELETE`
--   as service_role: delete from public.loyalty_settings where true ⇒ rowCount = 1
--
--   ⇒ والفرقُ بين الأمرين صفرٌ في الحصيلة: صفُّ إعدادات الولاء الوحيد يختفي.
--     و`DELETE` **أخطرُ** من `TRUNCATE` لأنه الفعلُ الذي يعرفه PostgREST:
--     `DELETE /rest/v1/loyalty_settings` بمفتاح الخدمة كافٍ، بينما `TRUNCATE`
--     لا سبيل إليه إلا بوصلةٍ مباشرة بالقاعدة.
--
--   ولم يره أحد لأن `append_only_tests` تسأل عن `TRUNCATE` **ولا تسأل عن
--   `DELETE` قط** — إنذارٌ يفحص البابَ المُغلق ويتجاهل المفتوح.
--
-- ── 🔴 وأخطرُ ما وجدَته هذه الجولة ليس في الجداول الخمسة ─────────────────────
--
-- المسحُ الكامل (٦٦ جدولاً + ١٣ اطّلاعاً في `public`):
--
--   `service_role`  يملك TRIGGER على **٦٥ من ٦٦** جدولاً و**١٣ من ١٣** اطّلاعاً
--   `authenticated` يملك TRIGGER على **٧** جداول: `profiles` · `site_settings`
--                   · `pages` · `sections` · `subcontractor_drivers`
--                   · `partner_agreement_settings` · `partner_agreement_versions`
--                   (+ الاطّلاع `v_loyalty_liability`)
--
--   as authenticated: create function pg_temp.zz_auth() returns trigger … return null
--                     create trigger … before update on public.site_settings … ⇒ SUCCEEDED
--                     create trigger … before update on public.profiles      … ⇒ SUCCEEDED
--
-- و`authenticated` **هو كلُّ متعهدٍ مسجَّلِ الدخول** (D-20). ودالةُ المُشغّل التي
-- يصنعها `security invoker` ⇒ تُنفَّذ **بصلاحيات من أطلقها**. فمُشغّلٌ يعلّقه
-- متعهدٌ على `profiles` أو `site_settings` ينتظر أن يحفظ **المشرف** أيَّ تعديل،
-- ثم يعمل داخل معاملة المشرف بصلاحياته الكاملة. وسياسةُ `profiles_update_own`
-- تحرس ترقيةَ الدور بشرطها `role = current_user_role()` — لكنها لا تحرس شيئاً
-- ممّا يُنفَّذ **في جلسة المشرف** عبر `profiles_update_admin`.
--
-- ⚠ **وحدُّ الادّعاء يُقال صريحاً:** PostgREST لا يُصدر DDL، فلا يبلغ حاملُ
--   مفتاح الخدمة ولا المتعهدُ جملةَ `create trigger` عبر الواجهة اليوم. فهذه
--   المنحُ **ذخيرةٌ لا فوهة**: تصير قابلةً للاستعمال لحظةَ أن تُفتح وصلةٌ مباشرة
--   بأحد هذين الدورين، أو تُضاف دالةٌ `security invoker` بـ`execute` مبنيٍّ
--   بالنصّ. وثمنُ إغلاقها الآن **صفر**: لا سطرَ واحد في المستودع كلِّه — ولا
--   دالةَ واحدة في `pg_proc` — يستعمل `TRIGGER` أو `TRUNCATE` أو `REFERENCES`
--   أو `MAINTAIN` بأحد هذه الأدوار الثلاثة. أمّا ثقب ب (`DELETE`) فهو **فوهةٌ
--   مفتوحة اليوم** عبر PostgREST، ولذلك يُغلق بالمنح وبالمُشغّل معاً.
--
-- ── والجذرُ الذي يعيد الثقب في أول جدولٍ قادم ────────────────────────────────
--
--   select defaclacl from pg_default_acl where defaclrole = 'postgres'::regrole
--     and defaclnamespace = 'public'::regnamespace and defaclobjtype = 'r';
--   ⇒ {postgres=arwdDxtm/postgres, anon=arwdDxtm/postgres,
--      authenticated=arwdDxtm/postgres, service_role=arwdDxtm/postgres}
--
-- أي أن **كلَّ جدولٍ جديد يولد ومعه `t` (TRIGGER) و`D` (TRUNCATE) و`x`
-- (REFERENCES) و`m` (MAINTAIN)** للأدوار الثلاثة. فسحبُها جدولاً جدولاً سعيٌ
-- خلف ذيلٍ لا يُدرَك: `0110` سحبت ثلاثة أفعالٍ عن أربعة جداول، والجدولُ ٦٧
-- سيولد بالثقب نفسه. ولذلك تُعالَج **الصلاحيةُ الافتراضية** هنا، لا الجداولُ
-- القائمة وحدها.
--
-- ── ⚠ وكيف تبقى الهجرات القادمة ممكنة (سؤالٌ يُجاب صراحةً) ──────────────────
--
--   ١) **كلُّ سحبٍ في هذا الملف موجَّهٌ إلى `anon` و`authenticated` و`service_role`
--      وحدها.** ودورُ الهجرات `postgres` **مالكُ الجداول** (مقيس: `relowner`
--      = postgres في الـ٦٦ جدولاً والـ١٣ اطّلاعاً كلِّها) — وحقوقُ المالك تأتي
--      من الملكية لا من منحة، فلا يمسّها `revoke` أصلاً. الهجرةُ القادمة تُنشئ
--      وتُسقط وتعطّل المُشغّلات كما كانت تماماً.
--   ٢) و`alter default privileges` أدناه **`for role postgres`** ⇒ يسحب من
--      الأدوار الثلاثة فقط، ويُبقي `postgres=arwdm` على ما يُنشأ لاحقاً.
--   ٣) والمُشغّلان الجديدان على `loyalty_settings` يوقفان **المالكَ نفسه** بقصد
--      (نفس منطق `0110`)، ومخرجُهما الوحيد المُعلَن:
--
--          alter table public.loyalty_settings disable trigger loyalty_settings_no_delete;
--          …  -- ومعه سطرُ سببٍ في رأس الهجرة
--          alter table public.loyalty_settings enable  trigger loyalty_settings_no_delete;
--
--      و`ALTER TABLE … DISABLE TRIGGER` يتطلّب **ملكيةَ الجدول** (مقيس حياً:
--      دورُ الخدمة يُردّ بـ42501 «must be owner of table»)، فالمخرجُ عند حدّ
--      الملكية لا عند حدّ المفتاح. والقسم (ز) في الفحص الذاتي **يفتحه ويغلقه
--      فعلاً** لا يصفه.
--   ٤) ولا مخرجَ بمتغيّر جلسة — لنفس سبب `0110`: متغيّرُ الجلسة يضبطه أيُّ
--      دورٍ متصل، فيصير الحارسُ زينةً على أول من يقرأ هذا الملف.
--
-- ── وما لا تفعله هذه الهجرة، مسمّىً ─────────────────────────────────────────
--
--   • **لا تسحب `DELETE` عن جدولٍ يحذف منه التطبيق فعلاً.** قِيس بالنداء لا
--     بالحدس: `partner_agreement_versions` **يُحذف منه** (‏`app/admin/partner-
--     agreement/actions.ts` — `discardDraft`) فبقي كما هو رغم أنه من صنف
--     «السجلّ». و`locales` تُرك كاملاً بلا مساس (أمرُ المالك).
--   • **ولا مُشغّلَ صفٍّ إلا على `loyalty_settings`.** `trip_settings_tests.sql`
--     يحذف من `trip_settings`، و`partner_agreement_tests.sql` يحذف من
--     `partner_agreement_acceptances` و`partner_agreement_versions` — وهي ملفّاتُ
--     جبهاتٍ أخرى (‏`STANDING-ORDERS §٢هـ`). فالسحبُ وحده هناك، والمُشغّلُ حيث
--     قِيس أنه لا يكسر شيئاً.
--   • ولا تُلمَس منحةٌ يحتاجها التطبيق: `INSERT` و`SELECT` و`UPDATE` باقية حيث
--     كانت، والقسم (و) يشهد بالنداء الحيّ أن صفَّ التدقيق ما زال يُكتب.
--
-- المرجع: 0110 (الحرّاس) · القاعدة الذهبية ١٦ (المنحُ هو الحارس · RLS لا تغطّي
--         TRUNCATE) · القاعدة ١٩ (الحكمُ بالنداء الحيّ لا بقراءة نصّ) · D-20
--         · D-58 (التفويض لا الاستنساخ)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (١) الشروط المسبقة — ولا يُبنى فوق حارسٍ غائب
-- ----------------------------------------------------------------------------
do $$
declare
  v_missing text;
begin
  select string_agg(t, '، ') into v_missing
  from (values ('public.audit_log'), ('public.ledger_entries'),
               ('public.funnel_events'), ('public.loyalty_entries'),
               ('public.loyalty_settings'), ('public.schema_migrations')) x(t)
  where to_regclass(x.t) is null;
  if v_missing is not null then
    raise exception '0114: جداول مفقودة: % — هجرات سابقة غير مطبَّقة', v_missing;
  end if;

  -- حرّاسُ 0110 شرطٌ لا زينة: هذه الهجرة تُغلق بابَ نزعِها، فغيابُها يعني أن
  -- ما نحرسه غير موجود أصلاً.
  if not exists (
    select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'audit_log'
      and t.tgname = 'audit_log_append_only' and not t.tgisinternal
  ) then
    raise exception '0114: `audit_log_append_only` غير موجود — 0110 غير مطبَّقة، ولا معنى لإغلاق بابِ نزعِ حارسٍ لا وجود له';
  end if;

  if to_regprocedure('public.append_only_truncate_guard()') is null then
    raise exception '0114: `append_only_truncate_guard()` غير موجودة — 0110 غير مطبَّقة';
  end if;

  -- والأدوار الثلاثة: يجب أن تكون موجودة، وإلا كان كلُّ سحبٍ أدناه صمتاً
  if (select count(*) from pg_roles where rolname in ('anon', 'authenticated', 'service_role')) <> 3 then
    raise exception '0114: أحد أدوار PostgREST الثلاثة غير موجود — السحبُ سيصمت والفحصُ سيمرّ على لا شيء';
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- (٢) 🔴 ثقب أ — نزعُ مفتاحِ نزعِ الحارس
--
-- `TRIGGER`   : تعليقُ مُشغّلٍ يُرجع `null` على `audit_log` يبتلع كلَّ التاريخ
--               صامتاً، وحارسُ 0110 باقٍ سليماً لا يحرس.
-- `REFERENCES`: قيدٌ أجنبيٌّ من جدولٍ مؤقّت إلى جدولٍ حيّ يمنع حذفَ صفوفه ما
--               دامت الجلسة قائمة. (تنظيفٌ لا ثغرةٌ مُثبَتة — يُقال كما هو.)
-- `MAINTAIN`  : (PG 17.6، مقيس) يبيح `VACUUM FULL`/`CLUSTER` وهما يأخذان
--               `ACCESS EXCLUSIVE` على جدولٍ حيّ.
--
-- والسحبُ على **كل** جداول واطّلاعات `public` لا على الخمسة: المسحُ أظهر أن
-- الثقب صنفٌ لا حادثة (٦٥/٦٦ و١٣/١٣ و٧ جداول لـ`authenticated`).
-- ----------------------------------------------------------------------------
revoke trigger, references, maintain
  on all tables in schema public
  from anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- (٣) 🔴 والفعلُ الذي لا تراه RLS إطلاقاً: `TRUNCATE` على كل جدول
--
-- المقيس قبل السحب: `service_role` يملك `TRUNCATE` على **٥٧ من ٦٦** جدولاً.
-- والمقيس في المستودع: **صفر** موضعٍ يُفرّغ جدولاً — لا في `app/` ولا `lib/`
-- ولا `scripts/`، ولا دالةَ واحدة في `pg_proc` جسمُها يحوي `truncate`.
-- ومواضعُ `truncate` الثلاثة في `supabase/` كلُّها **فحوصٌ تتوقّع الرفض**.
-- ----------------------------------------------------------------------------
revoke truncate
  on all tables in schema public
  from anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- (٤) 🔴 الجذر — الصلاحيةُ الافتراضية، وإلا وُلد الجدولُ ٦٧ بالثقب نفسه
--
-- يبقى `arwd` (قراءة وإدراج وتحديث وحذف) على ما يُنشأ لاحقاً — أي أن الهجرة
-- **لا تغيّر شيئاً ممّا يحتاجه التطبيق**، وتسحب الأربعة التي لا يستعملها.
-- ----------------------------------------------------------------------------
alter default privileges for role postgres in schema public
  revoke trigger, references, maintain, truncate
  on tables from anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- (٥-أ) 🔴 ثقب ب — `DELETE` على صفٍّ يحمل قرارَ المالك: المنحُ أولاً
--
-- والقائمةُ **صنفٌ لا استثناء**: جداولُ الإعدادات ذاتُ الصفّ الواحد (سبعة،
-- مقيسٌ كلٌّ منها `count = 1`) + `payment_providers` (سبعةُ صفوفٍ ثابتة تُشعَل
-- وتُطفأ ولا تُنشأ ولا تُحذف) + `site_settings` (‏١١ صفَّ علامةٍ تجارية).
--
-- والشرطُ الذي أباح السحب: **صفر موضعٍ في المستودع كلِّه يحذف من أيٍّ منها**
-- (‏`grep` على `.delete()` أعطى خمسة عشر جدولاً، ليس فيها واحدٌ من هذه، ولا
-- دالةَ SQL واحدة تحذف منها). ومن احتاجه لاحقاً يمنحه صراحةً — وهو نصُّ
-- القاعدة الذهبية ١٦.
-- ----------------------------------------------------------------------------
revoke delete on
  public.loyalty_settings,
  public.pricing_settings,
  public.trip_settings,
  public.discount_settings,
  public.dispatch_settings,
  public.partner_credit_settings,
  public.partner_agreement_settings,
  public.payment_providers,
  public.site_settings
  from anon, authenticated, service_role;

-- ودفترُ الهجرات: لا يُكتب ولا يُعدَّل ولا يُمحى بدور PostgREST إطلاقاً.
-- كاتبُه الوحيد `scripts/db-migrate.mjs` بدور `postgres` (مقيس: `current_user`
-- = postgres)، فالسحبُ لا يمسّه. وتُترك `SELECT` وحدها.
revoke insert, update, delete on public.schema_migrations
  from anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- (٥-ب) والمُشغّلُ يوقف **المالكَ** — وهو ما لا يفعله المنح
--
-- `0110` كتبت بنصّها أن «قرارَ المالك لا يُمحى بأمرٍ واحد» ثم أوقفت أمراً
-- واحداً وتركت الثاني. وهنا يُغلق الفعلان معاً وعلى كل دور، بمن فيهم `postgres`:
-- صفُّ `loyalty_settings` الوحيد يحمل قراراً معلَناً للمالك (١٫٢٥ نقطة/ج.م،
-- مُشتعلٌ بقراره 2026-08-17) — يُعدَّل ما شاء، ولا يُحذف ولا يُفرَّغ.
-- ----------------------------------------------------------------------------
create or replace function public.settings_row_no_delete()
returns trigger
language plpgsql
security definer
set search_path to ''
as $fn$
begin
  raise exception
    'قرارُ مالكٍ لا يُمحى: %.% لا يُحذف صفُّه — التغييرُ `update` لا `delete`',
    tg_table_schema, tg_table_name
    using hint = 'owner-decision';
end;
$fn$;

comment on function public.settings_row_no_delete() is
  'يرفض DELETE على جدولِ إعداداتٍ ذي صفٍّ واحد يحمل قرار المالك. يوقف المالكَ نفسه بقصد؛ والمخرجُ الوحيد ALTER TABLE … DISABLE TRIGGER (ملكيةُ الجدول).';

drop trigger if exists loyalty_settings_no_delete on public.loyalty_settings;
create trigger loyalty_settings_no_delete
  before delete on public.loyalty_settings
  for each row execute function public.settings_row_no_delete();

-- و`TRUNCATE` لا يُطلق `FOR EACH ROW` إطلاقاً، فيلزم مُشغّلُ بيانٍ منفصل —
-- ويُفوَّض إلى حارس `0110` نفسه لا تُستنسخ نكهةٌ ثانية بجانبه (D-58).
drop trigger if exists loyalty_settings_no_truncate on public.loyalty_settings;
create trigger loyalty_settings_no_truncate
  before truncate on public.loyalty_settings
  for each statement execute function public.append_only_truncate_guard();

-- ----------------------------------------------------------------------------
-- (٦) فحصٌ ذاتي — كلُّ ادّعاءٍ أعلاه يُشغَّل الآن بدوره، ولا يُوصَف.
--     وكلُّ كتابةٍ داخل معاملةٍ فرعية تُرجَع، ولقطةُ قبل/بعد تُثبت صفرَ الانجراف.
-- ----------------------------------------------------------------------------
do $$
declare
  v_snap_before jsonb;
  v_snap_after  jsonb;
  v_bad     text := '';
  v_cells   integer := 0;
  r         record;
  v_n       integer;
  v_id      bigint;
  v_pct     numeric;
begin
  select to_jsonb(l) into v_snap_before from public.loyalty_settings l;
  if v_snap_before is null then
    raise exception '0114(٠): `loyalty_settings` بلا صف — لا قرارَ مالكٍ يُحرَس';
  end if;

  -- ── (أ) المصفوفة: ٣ أدوار × كلُّ جداول واطّلاعات public × ٤ أفعال ⇒ صفر منحة
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
    raise exception '0114(أ): منحةٌ باقية تنزع الحارس أو تتجاوز RLS — %', v_bad;
  end if;
  if v_cells < 300 then
    raise exception '0114(أ): المصفوفة % خانةً فقط — الفحصُ لا يفحص ما يدّعيه', v_cells;
  end if;

  -- ── (ب) والصلاحيةُ الافتراضية لم تعد تلد الثقب
  if exists (
    select 1 from pg_default_acl d
    where d.defaclrole = 'postgres'::regrole
      and d.defaclnamespace = 'public'::regnamespace
      and d.defaclobjtype = 'r'
      and d.defaclacl::text ~ '(anon|authenticated|service_role)=[a-zA-Z]*[tDxm]'
  ) then
    raise exception '0114(ب): الصلاحيةُ الافتراضية ما زالت تمنح t/D/x/m — والجدولُ القادم يولد بالثقب';
  end if;

  -- ── (ج) الأفعالُ حيّةً: دورُ الخدمة لم يعد يركّب مُشغّلاً ولا يحذف القرار
  begin
    execute 'set local role service_role';
    begin
      execute 'create trigger zz_0114_probe before insert on public.audit_log
               for each row execute function public.append_only_truncate_guard()';
      v_bad := v_bad || 'service_role/CREATE TRIGGER نجح · ';
    exception when insufficient_privilege then null;
             when others then
               v_bad := v_bad || format('service_role/CREATE TRIGGER ردَّ %s · ', sqlstate);
    end;

    begin
      execute 'delete from public.loyalty_settings where true';
      v_bad := v_bad || 'service_role/DELETE loyalty_settings نجح · ';
    exception when insufficient_privilege then null;
             when others then
               v_bad := v_bad || format('service_role/DELETE ردَّ %s · ', sqlstate);
    end;
    execute 'reset role';
  exception when others then
    begin execute 'reset role'; exception when others then null; end;
    raise;
  end;
  if v_bad <> '' then
    raise exception '0114(ج): %', v_bad;
  end if;

  -- ── (د) والمالكُ نفسه لا يحذف صفَّ القرار — المنحُ لا يوقفه، المُشغّلُ يوقفه
  begin
    delete from public.loyalty_settings where true;
    raise exception '0114(د): مالكُ الجدول حذف صفَّ إعدادات الولاء — المُشغّلُ غائب';
  exception when others then
    if position('قرارُ مالكٍ لا يُمحى' in sqlerrm) = 0 then raise; end if;
  end;

  -- ── (و) 🔴 والمسارُ المشروع لم ينكسر: تعديلُ إعدادٍ عاديٍّ ما زال يكتب صفَّ تدقيقه
  --        (‏`log_audit` يتجاهل تعديلاً لا يغيّر شيئاً، فالتغييرُ حقيقيٌّ ثم يُرجَع)
  begin
    select coalesce(max(id), 0) into v_id from public.audit_log;
    v_pct := (v_snap_before ->> 'max_redeem_percent')::numeric;

    update public.loyalty_settings
       set max_redeem_percent = case when v_pct = 11 then 12 else 11 end;

    select count(*)::integer into v_n
    from public.audit_log a
    where a.id > v_id and a.entity = 'loyalty_settings' and a.action = 'update';
    if v_n <> 1 then
      raise exception '0114(و): تعديلُ إعدادٍ مشروع أنتج % صفَّ تدقيق لا واحداً — الإصلاحُ كسر ما يجب أن يعمل', v_n;
    end if;

    -- ودورُ الخدمة ما زال يكتب في السجلّ مباشرةً (0110 أبقت INSERT عمداً)
    execute 'set local role service_role';
    insert into public.audit_log (actor_kind, entity, action, entity_label)
    values ('system', 'zz-0114-selfcheck', 'insert', 'zz-0114');
    execute 'reset role';

    -- ── (ز) والمخرجُ للصيانة مفتوحٌ للمالك فعلاً: يُعطَّل، فيمرّ الحذف، ثم يُعاد
    alter table public.loyalty_settings disable trigger loyalty_settings_no_delete;
    delete from public.loyalty_settings where true;
    get diagnostics v_n = row_count;
    alter table public.loyalty_settings enable trigger loyalty_settings_no_delete;
    if v_n <> 1 then
      raise exception '0114(ز): المخرجُ المُعلَن لا يفتح — DISABLE TRIGGER ثم DELETE أعطى % صفاً', v_n;
    end if;

    raise exception '0114_ROLLBACK';
  exception
    when others then
      begin execute 'reset role'; exception when others then null; end;
      if sqlerrm <> '0114_ROLLBACK' then raise; end if;
  end;

  -- ── (ح) صفرُ انجراف: صفُّ المالك كما كان حرفاً بحرف، ولا صفَّ فحصٍ باقٍ
  select to_jsonb(l) into v_snap_after from public.loyalty_settings l;
  if v_snap_after is distinct from v_snap_before then
    raise exception '0114(ح): انجرافٌ في صفّ المالك — قبل: % / بعد: %', v_snap_before, v_snap_after;
  end if;
  select count(*)::integer into v_n from public.audit_log where entity = 'zz-0114-selfcheck';
  if v_n <> 0 then
    raise exception '0114(ح): بقي % صفَّ فحصٍ في السجلّ', v_n;
  end if;

  -- ── (ط) والمُشغّلان الجديدان قائمان بالنوع الصحيح، وحرّاسُ 0110/0047 لم تُدَس
  if not exists (
    select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'loyalty_settings'
      and t.tgname = 'loyalty_settings_no_truncate' and not t.tgisinternal
      and (t.tgtype & 32) <> 0 and (t.tgtype & 1) = 0
  ) then
    raise exception '0114(ط): `loyalty_settings_no_truncate` ليس مُشغّلَ بيانٍ على TRUNCATE';
  end if;
  if not exists (
    select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'loyalty_settings'
      and t.tgname = 'loyalty_settings_no_delete' and not t.tgisinternal
      and t.tgenabled = 'O'
  ) then
    raise exception '0114(ط): `loyalty_settings_no_delete` غائبٌ أو تُرك معطَّلاً بعد فحص المخرج';
  end if;
  select count(*)::integer into v_n
  from pg_trigger t join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and not t.tgisinternal
    and t.tgname in ('audit_log_append_only', 'audit_log_no_truncate',
                     'ledger_entries_no_truncate', 'loyalty_entries_no_truncate',
                     'funnel_events_no_truncate', 'loyalty_entries_append_only');
  if v_n <> 6 then
    raise exception '0114(ط): حرّاسُ 0110/0047 صاروا % لا ٦ — دُيس على حارسٍ قائم', v_n;
  end if;

  -- ── (ي) وما يحتاجه التطبيق باقٍ حرفياً
  if not (has_table_privilege('service_role', 'public.audit_log', 'INSERT')
          and has_table_privilege('service_role', 'public.funnel_events', 'INSERT')
          and has_table_privilege('service_role', 'public.audit_log', 'SELECT')
          and has_table_privilege('authenticated', 'public.audit_log', 'SELECT')
          and has_table_privilege('authenticated', 'public.loyalty_settings', 'UPDATE')
          and has_table_privilege('service_role', 'public.schema_migrations', 'SELECT')
          and has_table_privilege('authenticated', 'public.partner_agreement_versions', 'DELETE')) then
    raise exception '0114(ي): سُحب ما يحتاجه التطبيق — الكتابةُ التدقيقية أو شاشةُ السجلّ أو حفظُ إعدادات الولاء أو إسقاطُ مسوّدة الاتفاقية';
  end if;

  -- ── (ك) و`TRUNCATE` مرفوضٌ بمُشغّل بيان — **آخر فحصٍ عمداً**: الأمرُ يأخذ
  --        `ACCESS EXCLUSIVE` **قبل** إطلاق المُشغّل، والقفلُ لا يُحرَّر بإرجاع
  --        المعاملة الفرعية بل يبقى إلى نهاية الهجرة. و`loyalty_config()` تقرأ
  --        هذا الجدول في كل تسعيرة — فيُؤخَّر القفلُ إلى ما بعد كل قياسٍ آخر.
  begin
    execute 'truncate table public.loyalty_settings';
    raise exception '0114(ك): TRUNCATE على loyalty_settings نجح — مُشغّلُ البيان غائب';
  exception when others then
    if position('TRUNCATE ممنوع' in sqlerrm) = 0 then raise; end if;
  end;

  raise notice '0114 ✔ سُحب TRIGGER/TRUNCATE/REFERENCES/MAINTAIN عن الأدوار الثلاثة في % خانةً من public · والصلاحيةُ الافتراضية لم تعد تلدها · و`DELETE` سُحب عن تسعة جداول إعدادات ودفترِ الهجرات · وصفُّ الولاء لا يُحذف ولا يُفرَّغ حتى بدور المالك · والمخرجُ (DISABLE TRIGGER) فُتح وأُغلق فعلاً · وتعديلُ إعدادٍ مشروع ما زال يكتب صفَّ تدقيقه · وصفر انجراف',
    v_cells;
end;
$$;

-- ⚠ ولا سطرَ تسجيلٍ في `schema_migrations` هنا: المُشغِّل (`scripts/db-migrate.mjs`)
--    يكتبه بنفسه بعد نجاح الملف — بدور `postgres`، وهو ما لم تمسّه هذه الهجرة.
