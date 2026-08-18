-- ============================================================================
-- loyalty_settings_audit_tests.sql — معدَّلُ الولاء لا يتغيّر بلا أثر
--                                    (الجبهة ج — هجرة 0106)
--
-- كيف تشغّله: `pnpm db:test loyalty_settings_audit`
-- النجاح = آخر سطر «ALL PASSED». أي فشل يرمي exception برسالة عربية تحدد
-- الاختبار والقيمة المتوقعة والفعلية.
--
-- ── لماذا هذا الملف موجود ───────────────────────────────────────────────────
--
-- `loyalty_settings.points_per_currency` **معدّلُ مالٍ حيّ**: هو ما يُضرب فيه
-- أساسُ كل رحلةٍ مكتملة لتُسكّ النقاط، والنقاط تُستبدل خصماً. و`loyalty_entries`
-- دفترٌ append-only بحارسٍ صريح — أي أن المشروع قرّر أن **ما اكتُسب لا يُعاد
-- كتابته**. فبقاءُ المعدّل الذي أنتجه بلا تسجيل يترك ثقباً في نفس القصة:
-- الرقمُ محفوظ، ومن غيّر شروطَ إنتاجه مجهول.
--
-- والجذر مقيسٌ لا مُستنتَج: `0037_audit_log_hardening.sql` يربط مُشغّل التدقيق
-- بخريطة جداول مكتوبة يدوياً، و`loyalty_settings` وُلد بعده في
-- `0047_loyalty.sql` — الذي ربط المُشغّل بـ`loyalty_entries` وحدها. فالخلل
-- **صنفٌ لا حالة**: كلُّ جدولٍ يولد بعد 0037 يفوته الربط صامتاً.
--
-- ولذلك (أ) جردٌ لكل جدولٍ يمسّ المال لا فحصٌ لجدولٍ واحد: الجرد يمسك الجدول
-- التالي قبل أن يولد الثقب من جديد.
--
-- ── الشكل الذي يُختبر به ────────────────────────────────────────────────────
--
-- الدرس المدفوع: مجموعةٌ لتنبيهات المتعهد أكّدت بـ`update` بينما التطبيق يبعث
-- `insert … on conflict`، فما اختبرت الحارس الذي ادّعت تغطيته يوماً. فهنا
-- يُنفَّذ التغيير **بالشكل الذي يبعثه `app/admin/loyalty/actions.ts` حرفياً**:
-- دور `authenticated` · بهوية admin حقيقية · بالأعمدة الخمسة كلها · بمرشّح
-- `id` — لا بـ`update` من دور القاعدة الذي يتخطّى RLS والمنح.
--
-- ── صفر أثر — وهي شرطُ عملٍ لا تفضيل ───────────────────────────────────────
--   • كل كتابةٍ هنا داخل معاملةٍ فرعية تُرجَع بـ`raise exception` مُلتقَط،
--     فلا صفَّ سجلٍّ يبقى ولا قيمةَ إعدادٍ تتغيّر — مهما كانت دلالة المعاملة
--     في المُشغّل الخارجي.
--   • ولا يُنشأ صفُّ فيكسترة واحد: الاختبار يقرأ هوية المشرف القائمة ولا يخلق
--     مستخدمين ولا حجوزات.
--   • و(ز) تُثبت صفر الانجراف بلقطةٍ قبل/بعد لا بالثقة.
--
-- المرجع: supabase/migrations/0106_loyalty_settings_audited.sql
--         + supabase/migrations/0037_audit_log_hardening.sql (خريطة الربط)
-- ============================================================================

do $$
declare
  v_missing  text;
  v_role     text;
  v_snap     jsonb;
  v_after    jsonb;
  v_admin    uuid;
  v_base     bigint;
  v_n        integer;
  v_row      record;
  v_def_ours text;
  v_def_sib  text;
begin
  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claims', '', false);

  -- --------------------------------------------------------------------------
  -- (٠) الشروط المسبقة — الغياب يُقال صراحةً لا يُتخطّى
  -- --------------------------------------------------------------------------
  select string_agg(x.o, '، ') into v_missing
  from (values
    ('public.loyalty_settings'), ('public.audit_log'), ('public.discount_settings')
  ) x(o)
  where to_regclass(x.o) is null;
  if v_missing is not null then
    raise exception '(٠) كائنات ناقصة: % — طبّق الهجرات أولاً', v_missing;
  end if;

  if to_regprocedure('public.log_audit()') is null then
    raise exception '(٠) public.log_audit() غير موجودة — 0036/0037 غير مطبَّقتين';
  end if;

  -- اللقطة التي يُقاس عليها الانجراف في (ز)
  select to_jsonb(l) into v_snap from public.loyalty_settings l;
  if v_snap is null then
    raise exception '(٠) `loyalty_settings` بلا صف — الجدول ذو الصف الواحد فارغ';
  end if;
  select coalesce(max(id), 0) into v_base from public.audit_log;

  -- --------------------------------------------------------------------------
  -- (أ) الجرد: كل جدول إعداداتٍ أو مرجعٍ يمسّ المال يحمل مُشغّل `log_audit`
  --      — الفحص على **الصنف** لا على الحالة، فيمسك الجدول التالي قبل ولادته
  -- --------------------------------------------------------------------------
  select string_agg(m.t, '، ') into v_missing
  from (values
    ('loyalty_settings'),      -- معدّل السكّ وقيمة النقطة
    ('discount_settings'),     -- سقف الخصم وأرضية الهامش
    ('pricing_settings'),      -- التسعير الأساس
    ('trip_settings'),
    ('dispatch_settings'),
    ('partner_credit_settings'),
    ('payment_providers'),
    ('site_settings'),
    ('coupons'),
    ('coupon_redemptions'),
    ('loyalty_entries')
  ) m(t)
  where not exists (
    select 1
    from pg_trigger g
    join pg_class c on c.oid = g.tgrelid
    join pg_namespace ns on ns.oid = c.relnamespace
    where ns.nspname = 'public'
      and c.relname = m.t
      and not g.tgisinternal
      and g.tgfoid = 'public.log_audit'::regproc
  );
  if v_missing is not null then
    raise exception
      '(أ) جداولُ مالٍ بلا مُشغّل تدقيق: % — قيمةٌ تتحرك بلا أثر في الدفتر',
      v_missing;
  end if;
  raise notice '(أ) أحد عشر جدولاً يمسّ المال، كلُّها موصولةٌ بمُشغّل التدقيق';

  -- --------------------------------------------------------------------------
  -- (ب) نكهةٌ واحدة لا ثانية: تعريفُ مُشغّلنا **يطابق حرفياً** تعريف الشقيق
  --      `audit_discount_settings` بعد استبدال اسم الجدول. مُشغّلٌ ثانٍ بخصائص
  --      مختلفة (‏BEFORE، أو بلا DELETE، أو بعمود لقطة) يُنتج سجلاً غير متجانس
  --      لا يُقرأ بعينٍ واحدة.
  -- --------------------------------------------------------------------------
  select pg_get_triggerdef(g.oid) into v_def_ours
  from pg_trigger g
  join pg_class c on c.oid = g.tgrelid
  join pg_namespace ns on ns.oid = c.relnamespace
  where ns.nspname = 'public' and c.relname = 'loyalty_settings'
    and not g.tgisinternal and g.tgfoid = 'public.log_audit'::regproc;

  select pg_get_triggerdef(g.oid) into v_def_sib
  from pg_trigger g
  join pg_class c on c.oid = g.tgrelid
  join pg_namespace ns on ns.oid = c.relnamespace
  where ns.nspname = 'public' and c.relname = 'discount_settings'
    and not g.tgisinternal and g.tgfoid = 'public.log_audit'::regproc;

  if replace(v_def_ours, 'loyalty_settings', 'discount_settings') is distinct from v_def_sib then
    raise exception
      '(ب) نكهةٌ مختلفة عن الشقيق — لنا: % / الشقيق: %',
      v_def_ours, v_def_sib;
  end if;
  raise notice '(ب) نفس نكهة audit_discount_settings حرفاً بحرف — لا مُشغّل ثانٍ بخصائص أخرى';

  -- --------------------------------------------------------------------------
  -- (ج)–(و) الفحص الحيّ — داخل معاملةٍ فرعية تُرجَع كاملةً
  -- --------------------------------------------------------------------------
  select p.id into v_admin from public.profiles p where p.role = 'admin' limit 1;

  begin
    -- ── (ج) تغييرُ المعدّل بالشكل الذي يبعثه التطبيق ⇒ صفٌّ واحد بالقديم
    --        والجديد والفاعل ────────────────────────────────────────────────
    if v_admin is null then
      raise notice '  ↳ (ج) لا صفَّ admin في profiles — يُقاس بدور القاعدة، والهوية غير مُثبَتة';
      update public.loyalty_settings
         set enabled             = (v_snap ->> 'enabled')::boolean,
             points_per_currency = 1.75,
             currency_per_point  = (v_snap ->> 'currency_per_point')::numeric,
             min_redeem_points   = (v_snap ->> 'min_redeem_points')::integer,
             max_redeem_percent  = (v_snap ->> 'max_redeem_percent')::numeric
       where id;
    else
      perform set_config('request.jwt.claim.sub', v_admin::text, false);
      execute 'set local role authenticated';

      -- (ج-٠) الهوية فعّالة أولاً: بدونها ما بعده «فحصٌ لا يمكن أن يفشل»
      execute 'select count(*) from public.loyalty_settings' into v_n;
      if v_n <> 1 then
        raise exception '(ج-٠) المشرف لا يقرأ صف الإعدادات (%) — الهوية غير فعّالة', v_n;
      end if;

      -- نفس ما يبعثه app/admin/loyalty/actions.ts: الأعمدة الخمسة ومرشّح id
      execute format(
        'update public.loyalty_settings
            set enabled = %L, points_per_currency = %L, currency_per_point = %L,
                min_redeem_points = %L, max_redeem_percent = %L
          where id = true',
        (v_snap ->> 'enabled')::boolean, 1.75,
        (v_snap ->> 'currency_per_point')::numeric,
        (v_snap ->> 'min_redeem_points')::integer,
        (v_snap ->> 'max_redeem_percent')::numeric);

      execute 'reset role';
    end if;

    select count(*)::integer into v_n
    from public.audit_log a
    where a.id > v_base and a.entity = 'loyalty_settings';
    if v_n <> 1 then
      raise exception
        '(ج) تغييرُ معدّلِ الولاء أنتج % صفَّ تدقيق والمتوقع صفٌّ واحد — معدّلُ مالٍ يتحرك بلا أثر',
        v_n;
    end if;

    select * into v_row
    from public.audit_log a
    where a.id > v_base and a.entity = 'loyalty_settings';

    if v_row.action <> 'update' then
      raise exception '(ج-١) الفعل «%» والمتوقع «update»', v_row.action;
    end if;
    if v_row.changes -> 'points_per_currency' is null then
      raise exception
        '(ج-٢) الصفُّ لا يسمّي points_per_currency — التغييرات: %', v_row.changes;
    end if;
    if (v_row.changes -> 'points_per_currency' ->> 'from')
         is distinct from (v_snap ->> 'points_per_currency') then
      raise exception
        '(ج-٣) القيمة القديمة «%» والمتوقع «%»',
        v_row.changes -> 'points_per_currency' ->> 'from',
        v_snap ->> 'points_per_currency';
    end if;
    if (v_row.changes -> 'points_per_currency' ->> 'to') <> '1.75' then
      raise exception
        '(ج-٤) القيمة الجديدة «%» والمتوقع «1.75»',
        v_row.changes -> 'points_per_currency' ->> 'to';
    end if;
    -- والضجيج ممنوعٌ حتى في الصفِّ الصحيح: `updated_at` تغيّرت حتماً
    -- (‏touch_updated_at مربوط بالجدول) فوجودها يعني أن الاستثناء سقط
    if v_row.changes ? 'updated_at' then
      raise exception '(ج-٥) updated_at مذكورة في التغييرات — استثناؤها سقط';
    end if;
    if v_admin is not null then
      if v_row.actor is distinct from v_admin then
        raise exception
          '(ج-٦) الفاعل «%» والمتوقع «%» — سجلٌّ بلا فاعلٍ يقول ماذا تغيّر ولا يقول من غيّره',
          v_row.actor, v_admin;
      end if;
      if v_row.actor_kind <> 'admin' then
        raise exception '(ج-٧) صنف الفاعل «%» والمتوقع «admin»', v_row.actor_kind;
      end if;
    end if;

    -- ── (د) حفظٌ بنفس القيم ⇒ **صفر** صفوف: السجلُّ الذي يمتلئ بما لا يعني
    --        شيئاً سجلٌّ لا يُقرأ ──────────────────────────────────────────
    update public.loyalty_settings
       set enabled             = enabled,
           points_per_currency = points_per_currency,
           currency_per_point  = currency_per_point,
           min_redeem_points   = min_redeem_points,
           max_redeem_percent  = max_redeem_percent
     where id;

    select count(*)::integer into v_n
    from public.audit_log a
    where a.id > v_base and a.entity = 'loyalty_settings';
    if v_n <> 1 then
      raise exception
        '(د) حفظٌ بلا تغيير أنتج ضجيجاً: مجموع الصفوف % والمتوقع ١', v_n;
    end if;

    -- ── (هـ) و`updated_at` وحدها لا تصنع صفاً ─────────────────────────────
    update public.loyalty_settings set updated_at = now() - interval '1 day' where id;
    select count(*)::integer into v_n
    from public.audit_log a
    where a.id > v_base and a.entity = 'loyalty_settings';
    if v_n <> 1 then
      raise exception
        '(هـ) updated_at وحدها صنعت صفاً: المجموع % والمتوقع ١', v_n;
    end if;

    -- ── (و) والسجلُّ يبقى مُلحَقاً فقط: لا دورَ متصفحٍ يكتب فيه مباشرةً ───
    foreach v_role in array array['anon', 'authenticated'] loop
      if has_table_privilege(v_role, 'public.audit_log', 'INSERT')
         or has_table_privilege(v_role, 'public.audit_log', 'UPDATE')
         or has_table_privilege(v_role, 'public.audit_log', 'DELETE') then
        raise exception
          '(و) الدور «%» يملك الكتابة في audit_log — تزويرُ التاريخ ممكن', v_role;
      end if;
    end loop;

    -- والمُشغّل نفسه ليس ممنوحاً لدور متصفح (هو security definer)
    if has_function_privilege('authenticated', 'public.log_audit()', 'EXECUTE')
       or has_function_privilege('anon', 'public.log_audit()', 'EXECUTE') then
      raise exception '(و-٢) log_audit() ممنوحة لدور متصفح — تُستدعى مباشرةً فتُحقن صفوف';
    end if;

    raise exception 'LOYALTY_AUDIT_ROLLBACK';
  exception
    when others then
      begin execute 'reset role'; exception when others then null; end;
      perform set_config('request.jwt.claim.sub', '', false);
      if sqlerrm <> 'LOYALTY_AUDIT_ROLLBACK' then raise; end if;
  end;

  raise notice '(ج) تغييرُ المعدّل ⇒ صفٌّ واحد بالقديم والجديد والفاعل admin — بالشكل الذي يبعثه التطبيق';
  raise notice '(د) حفظٌ بنفس القيم ⇒ صفر ضجيج · (هـ) وupdated_at وحدها ⇒ صفر';
  raise notice '(و) لا دورَ متصفحٍ يكتب في audit_log ولا ينفّذ log_audit';

  -- --------------------------------------------------------------------------
  -- (ز) صفر انجراف — قرارُ المالك (‏1.25 · مُفعَّل) كما كان حرفاً بحرف
  -- --------------------------------------------------------------------------
  select to_jsonb(l) into v_after from public.loyalty_settings l;
  if v_after is distinct from v_snap then
    raise exception
      '(ز) انجراف في loyalty_settings — قبل: % / بعد: %',
      v_snap::text, v_after::text;
  end if;

  select count(*)::integer into v_n
  from public.audit_log a where a.id > v_base and a.entity = 'loyalty_settings';
  if v_n <> 0 then
    raise exception '(ز) بقي % صفَّ تدقيق من الاختبار — الفيكسترة تسرّب', v_n;
  end if;

  raise notice '(ز) صفر انجراف: points_per_currency=% كما كان، وصفر صفِّ سجلٍّ متبقٍّ',
    v_snap ->> 'points_per_currency';

  raise notice 'ALL PASSED — معدّلُ الولاء لا يتغيّر بلا أثر، ولا يمتلئ السجلُّ بحفظٍ بلا تغيير';
end;
$$;
