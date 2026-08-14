-- ============================================================================
-- 0041 — 🔴 سحب الكتابة والتفريغ من الزائر (ثغرة حيّة، لا وقائية)
--
-- ── ما وُجد، وكيف ────────────────────────────────────────────────────────
--
-- ظهرت أثناء **المراجعة الأمنية التي تسبق المرحلة ١٢ب** (مراجعة كل
-- `grant … to authenticated` قبل فتح تسجيل العملاء). والمقيس حياً على قاعدة
-- بدر — كل اختبار داخل معاملة مرتدّة فلم يمسّ صفاً حقيقياً:
--
--   بدور `anon`:
--     truncate public.site_settings  ⇒ ١٠ صفوف ⇐ صفر
--     truncate public.pages          ⇒ ١٧ صفاً ⇐ صفر
--     truncate public.sections       ⇒ ٩٣ صفاً ⇐ صفر
--     delete   public.schema_migrations ⇒ ٤٠ صفاً ⇐ صفر
--
-- أي أن **أي زائر مجهول** يستطيع محو محتوى الموقع وإعداداته ودفتر هجراته.
-- والمفتاح العام (`NEXT_PUBLIC_SUPABASE_ANON_KEY`) يُشحن في حزمة المتصفح
-- بطبيعته، فالمهاجم لا يحتاج شيئاً سوى فتح الموقع.
--
-- ── لماذا لم تمسكه RLS ولا أي مراجعة سابقة ──────────────────────────────
--
-- سببان يجتمعان:
--
-- **(١) `TRUNCATE` لا تغطيها RLS إطلاقاً.** السياسات تحرس `select/insert/
-- update/delete` ولا شأن لها بالتفريغ. فجدولٌ سياساته محكمة ومنحته واسعة يبدو
-- محمياً في كل مراجعة تقرأ السياسات — ويُفرَّغ بنداء واحد. وهذا مكتوب حرفاً في
-- `handover/CONVENTIONS.md` («‏`truncate` التي لا تغطيها RLS»)، والتزمت به
-- هجرات الملاحظة ١٥ — لكن الجداول القديمة سبقت القاعدة.
--
-- **(٢) `schema_migrations` بلا RLS أصلاً** (‏`relrowsecurity = false`، صفر
-- سياسات). وهو **جدول مُشغّل الهجرات نفسه** — أي أن الأداة التي تفرض الانضباط
-- هي التي فاتها.
--
-- وأثر محو دفتر الهجرات ليس فقدان سجل: `pnpm db:migrate` التالي **يعيد تشغيل
-- الأربعين هجرة من الصفر**. وأخبث منه أن يُدسّ صفٌّ كاذب فيتخطّى المُشغّل هجرةً
-- حقيقية بصمت.
--
-- ── ما يفعله هذا الملف، وما لا يفعله ────────────────────────────────────
--
-- **الجرّاحة ضيّقة بقصد.** الكتابة في هذا المشروع تقع بأحد طريقين: جلسة مشرف
-- بدور `authenticated` تحرسها RLS، أو مفتاح الخدمة. و`anon` لا يكتب في جدولٍ
-- واحد مباشرةً — كل مسار عام يمرّ بدالة `security definer` (‏`create_booking`
-- و`attach_receipt` و`create_quote_request`). فسحبُ الكتابة من `anon` **لا
-- يكسر مساراً واحداً**.
--
--   • `anon`          ⇐ يفقد insert/update/delete/truncate/references/trigger،
--                        **ويبقى له `select`** فالموقع العام يقرأ محتواه.
--   • `authenticated` ⇐ يفقد **`truncate` وحدها**: لا مسار في المشروع يفرّغ
--                        جدولاً، والاحتفاظ بها يترك الباب الذي لا تحرسه RLS
--                        مفتوحاً لكل مشرف ومتعهد — وغداً لكل عميل مسجَّل.
--   • `postgres` و`service_role` ⇐ بلا مساس (المُشغّل يتصل بالأول).
--
-- والسحب يمشي على **كل جداول `public`** لا على الخمسة المكتشفة وحدها: الثغرة
-- صنفٌ لا حادثة، وإصلاحُ ما ظهر وحده يترك الباب مفتوحاً لأول جدول يُضاف غداً.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (١) السحب الشامل — كل جداول `public`
-- ----------------------------------------------------------------------------

do $$
declare
  r          record;
  v_anon     integer := 0;
  v_auth     integer := 0;
begin
  for r in
    select cl.relname
      from pg_class cl join pg_namespace n on n.oid = cl.relnamespace
     where n.nspname = 'public' and cl.relkind = 'r'
     order by cl.relname
  loop
    -- الزائر: قراءةٌ فقط. وما كان له من كتابة فبالخطأ لا بتصميم.
    execute format(
      'revoke insert, update, delete, truncate, references, trigger on public.%I from anon',
      r.relname);
    v_anon := v_anon + 1;

    -- المستخدم المسجَّل: يكتب بحراسة RLS، **ولا يفرّغ**.
    execute format('revoke truncate on public.%I from authenticated', r.relname);
    v_auth := v_auth + 1;
  end loop;

  raise notice '✔ 0041: سُحبت الكتابة من anon على % جدولاً، والتفريغ من authenticated على %', v_anon, v_auth;
end;
$$;

-- ----------------------------------------------------------------------------
-- (٢) دفتر الهجرات — يُغلق كلياً على دور المُشغّل وحده
-- ----------------------------------------------------------------------------
-- لا شيء في التطبيق يقرأ هذا الجدول ولا يكتبه: `scripts/db-migrate.mjs` يتصل
-- بـ`DATABASE_URL` مباشرةً بدور صاحب القاعدة، لا عبر PostgREST. فبقاؤه مقروءاً
-- لـ`anon` كشفٌ لخريطة تطوّر المخطط بلا مقابل.
--
-- وRLS تُفعَّل **زيادةً على** سحب المنح لا بدلاً منه: المنحة هي الحارس الفعلي
-- هنا، وRLS طبقةٌ ثانية تمنع أي منحة تُعاد سهواً من أن تفتح الباب وحدها.
-- ----------------------------------------------------------------------------

revoke all on table public.schema_migrations from anon, authenticated, public;
grant all on table public.schema_migrations to service_role;

alter table public.schema_migrations enable row level security;

-- ولا سياسة واحدة: RLS مفعّلة بلا سياسات تعني «لا أحد» لكل دور غير المالك
-- و`service_role` (الذي يتجاوزها بحكم `bypassrls`). وهذا هو المقصود بالضبط.

comment on table public.schema_migrations is
  'دفتر الهجرات — يقرؤه ويكتبه scripts/db-migrate.mjs بدور صاحب القاعدة عبر DATABASE_URL لا عبر PostgREST. مغلق على anon وauthenticated منذ 0041: محوُه يعيد تشغيل كل الهجرات، ودسُّ صفٍّ كاذب فيه يتخطّى هجرةً حقيقية بصمت';

-- ----------------------------------------------------------------------------
-- فحص ذاتي — يُثبت الإصلاح بالقياس لا بالادعاء
-- ----------------------------------------------------------------------------

do $$
declare
  v_bad text;
  v_n   integer;
begin
  -- (أ) لا كتابة ولا تفريغ لـ`anon` على أي جدول
  select string_agg(distinct table_name, '، ') into v_bad
    from information_schema.table_privileges
   where table_schema = 'public' and grantee = 'anon'
     and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE');
  if v_bad is not null then
    raise exception '0041: anon ما زال يكتب في: %', v_bad;
  end if;

  -- (ب) ولا تفريغ لـ`authenticated` — الباب الذي لا تحرسه RLS
  select string_agg(distinct table_name, '، ') into v_bad
    from information_schema.table_privileges
   where table_schema = 'public' and grantee = 'authenticated'
     and privilege_type = 'TRUNCATE';
  if v_bad is not null then
    raise exception '0041: authenticated ما زال يفرّغ: %', v_bad;
  end if;

  -- (ج) 🔒 والشاهد الإيجابي — **بلا هذا الفحص يمرّ الملف لو سحب `select` أيضاً
  --      وكسر الموقع العام كله**. الزائر يجب أن يبقى قارئاً لما يعرضه الموقع.
  foreach v_bad in array array['pages', 'sections', 'site_settings', 'vehicle_classes'] loop
    if not exists (
      select 1 from information_schema.table_privileges
       where table_schema = 'public' and table_name = v_bad
         and grantee = 'anon' and privilege_type = 'SELECT'
    ) then
      raise exception '0041: سُحبت قراءة % من الزائر — الموقع العام ينكسر', v_bad;
    end if;
  end loop;

  -- (د) دفتر الهجرات مغلق ومحروس بطبقتين
  select count(*) into v_n from information_schema.table_privileges
   where table_schema = 'public' and table_name = 'schema_migrations'
     and grantee in ('anon', 'authenticated');
  if v_n > 0 then
    raise exception '0041: دفتر الهجرات ما زال مفتوحاً (% منحة)', v_n;
  end if;
  -- ⚠ التقييد بالمخطط لازم: Supabase تحمل `supabase_migrations.schema_migrations`
  --    كذلك، فاستعلامٌ بالاسم وحده يُرجع صفّين ويسقط بـ«more than one row».
  if not (select cl.relrowsecurity from pg_class cl
            join pg_namespace n on n.oid = cl.relnamespace
           where n.nspname = 'public' and cl.relname = 'schema_migrations') then
    raise exception '0041: RLS غير مفعّلة على دفتر الهجرات';
  end if;

  -- (هـ) والمُشغّل نفسه ما زال يعمل: صاحب القاعدة يقرأ الدفتر
  select count(*) into v_n from public.schema_migrations;
  if v_n < 40 then
    raise exception '0041: دفتر الهجرات فيه % صفاً فقط — هل مُسح؟', v_n;
  end if;

  raise notice '✔ 0041: الزائر يقرأ ولا يكتب، ولا أحد يفرّغ، والدفتر مغلق بطبقتين و% صفاً سليماً', v_n;
end;
$$;
