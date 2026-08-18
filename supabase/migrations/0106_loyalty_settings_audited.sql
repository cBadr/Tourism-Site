-- ============================================================================
-- 0106_loyalty_settings_audited.sql
-- معدَّلُ الولاء معدَّلُ مالٍ حيّ — فلا يتغيّر بلا أثرٍ في السجلّ
-- ============================================================================
--
-- ── العيب، مقيساً لا مُستنتَجاً ─────────────────────────────────────────────
--
--   select tgname from pg_trigger t join pg_class c on c.oid = t.tgrelid
--    where c.relname = 'loyalty_settings' and not t.tgisinternal;
--   ⇒ loyalty_settings_touch_updated_at   (وحده)
--
--   select count(*) from public.audit_log where entity = 'loyalty_settings';
--   ⇒ 0
--
-- بينما أشقّاؤه الخمسة — `discount_settings` و`pricing_settings` و`trip_settings`
-- و`dispatch_settings` و`partner_credit_settings` — كلُّهم يحملون
-- `audit_<table>` الموصول بـ`public.log_audit()`.
--
-- ── والجذر صنفٌ لا حالة ─────────────────────────────────────────────────────
--
-- `0037_audit_log_hardening.sql` يربط المُشغّل عبر **خريطة جداول مكتوبة يدوياً**
-- (‏v_map). و`loyalty_settings` وُلد بعده في `0047_loyalty.sql`، الذي ربط
-- المُشغّل بـ`loyalty_entries` وحدها وترك جدولَ الإعدادات. فكلُّ جدولٍ يولد بعد
-- 0037 يفوته الربط **صامتاً** — لا خطأ، ولا سطر ناقص، فقط تاريخٌ لا يُكتب.
-- ولذلك المرافقةُ في `supabase/tests/loyalty_settings_audit_tests.sql` تجرد
-- أحد عشر جدولاً لا جدولاً واحداً: الفحصُ على الصنف يمسك الجدول التالي.
--
-- ── ولماذا الآن ────────────────────────────────────────────────────────────
--
-- فعّل المالك الولاء في 2026-08-17 على `points_per_currency = 1.25`. وهذا رقمٌ
-- يقرّر كم نقطةً تُسكّ من كل جنيهٍ في كل رحلةٍ تكتمل، والنقاط تُستبدل خصماً.
-- و`loyalty_entries` دفترٌ append-only بحارسٍ صريح — أي أن المشروع قرّر أن **ما
-- اكتُسب لا يُعاد كتابته**. فبقاءُ المعدّل الذي أنتجه بلا تسجيل ثقبٌ في نفس
-- القصة: الرقم محفوظ، ومن غيّر شروط إنتاجه مجهول.
--
-- ⚠ ولا قيمةَ إعدادٍ تتغيّر بهذه الهجرة: `enabled` و`points_per_currency`
--   و`currency_per_point` و`min_redeem_points` و`max_redeem_percent` تخرج كما
--   دخلت — و(٣) تُثبته بلقطةٍ قبل/بعد، لا بالنيّة.
--
-- المرجع: D-58 (تعريفاتُ الكتالوج لا ملفات الهجرات) · 0036/0037 (السجلّ)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (١) الشروط المسبقة
-- ----------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.loyalty_settings') is null then
    raise exception '0106: `loyalty_settings` غير موجود — 0047 غير مطبَّقة';
  end if;
  if to_regprocedure('public.log_audit()') is null then
    raise exception '0106: `public.log_audit()` غير موجودة — 0036/0037 غير مطبَّقتين';
  end if;
  if to_regclass('public.discount_settings') is null then
    raise exception '0106: الشقيق `discount_settings` غير موجود — لا نموذج يُحتذى';
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- (٢) المُشغّل — **نفس نكهة الشقيق حرفاً بحرف**، لا نكهةٌ ثانية
-- ----------------------------------------------------------------------------
-- `discount_settings` (وهو أقرب الأشقّاء شكلاً: جدولُ صفٍّ واحد بمفتاح boolean):
--   CREATE TRIGGER audit_discount_settings AFTER INSERT OR DELETE OR UPDATE
--     ON public.discount_settings FOR EACH ROW EXECUTE FUNCTION log_audit()
--
-- بلا وسيط عمود لقطة: `loyalty_settings.id` عمودٌ `boolean` لا نصّ، ولو مُرِّر
-- لخرج `entity_label` = «true» في كل صف — ضجيجٌ لا هوية. وهو نفس ما فعله 0037
-- مع أشقّائه الأربعة (`null` في الخريطة).
--
-- و`log_audit` تتكفّل بالباقي مقروءاً من الكتالوج لا من الذاكرة:
--   • `updated_at` مستثناة ⇒ حفظٌ بنفس القيم لا يصنع صفاً (‏v_changes = '{}' ⇒ null)
--   • `security definer` ⇒ الإدراج في السجلّ لا يحتاج منحاً لدور المتصفح
--   • ولا عمودَ سرٍّ هنا: `audit_is_secret` تُعيد false للأعمدة الخمسة كلها
drop trigger if exists audit_loyalty_settings on public.loyalty_settings;
create trigger audit_loyalty_settings
  after insert or update or delete on public.loyalty_settings
  for each row execute function public.log_audit();

-- ----------------------------------------------------------------------------
-- (٣) التحقّق الحيّ — داخل معاملةٍ فرعية تُرجَع كاملةً، ثم صفرُ انجراف
-- ----------------------------------------------------------------------------
do $$
declare
  v_snap  jsonb;
  v_after jsonb;
  v_admin uuid;
  v_base  bigint;
  v_n     integer;
  v_row   record;
  v_ours  text;
  v_sib   text;
begin
  select to_jsonb(l) into v_snap from public.loyalty_settings l;
  if v_snap is null then
    raise exception '0106: `loyalty_settings` بلا صف — لا شيء يُتحقَّق منه';
  end if;
  select coalesce(max(id), 0) into v_base from public.audit_log;

  -- (أ) النكهة واحدة: التعريفان متطابقان بعد استبدال اسم الجدول
  select pg_get_triggerdef(g.oid) into v_ours
  from pg_trigger g join pg_class c on c.oid = g.tgrelid
  join pg_namespace ns on ns.oid = c.relnamespace
  where ns.nspname = 'public' and c.relname = 'loyalty_settings'
    and not g.tgisinternal and g.tgfoid = 'public.log_audit'::regproc;

  select pg_get_triggerdef(g.oid) into v_sib
  from pg_trigger g join pg_class c on c.oid = g.tgrelid
  join pg_namespace ns on ns.oid = c.relnamespace
  where ns.nspname = 'public' and c.relname = 'discount_settings'
    and not g.tgisinternal and g.tgfoid = 'public.log_audit'::regproc;

  if v_ours is null then
    raise exception '0106(أ): المُشغّل لم يُنشأ رغم نجاح CREATE — راجع الكتالوج';
  end if;
  if replace(v_ours, 'loyalty_settings', 'discount_settings') is distinct from v_sib then
    raise exception '0106(أ): نكهةٌ مختلفة عن الشقيق — لنا: % / الشقيق: %', v_ours, v_sib;
  end if;

  select p.id into v_admin from public.profiles p where p.role = 'admin' limit 1;

  begin
    -- (ب) تغييرُ المعدّل **بالشكل الذي يبعثه `app/admin/loyalty/actions.ts`**:
    --     دور `authenticated` بهوية admin، الأعمدة الخمسة، مرشّح `id`.
    --     لا `update` من دور القاعدة — ذاك يتخطّى RLS والمنح فيقيس غير المُنتَج.
    if v_admin is null then
      update public.loyalty_settings set points_per_currency = 1.75 where id;
    else
      perform set_config('request.jwt.claim.sub', v_admin::text, false);
      execute 'set local role authenticated';
      execute 'select count(*) from public.loyalty_settings' into v_n;
      if v_n <> 1 then
        raise exception '0106(ب-٠): المشرف لا يقرأ صف الإعدادات (%) — الهوية غير فعّالة', v_n;
      end if;
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
    from public.audit_log a where a.id > v_base and a.entity = 'loyalty_settings';
    if v_n <> 1 then
      raise exception
        '0106(ب): تغييرُ المعدّل أنتج % صفَّ تدقيق والمتوقع صفٌّ واحد', v_n;
    end if;

    select * into v_row
    from public.audit_log a where a.id > v_base and a.entity = 'loyalty_settings';

    if v_row.action <> 'update' then
      raise exception '0106(ب-١): الفعل «%» والمتوقع «update»', v_row.action;
    end if;
    if (v_row.changes -> 'points_per_currency' ->> 'from')
         is distinct from (v_snap ->> 'points_per_currency')
       or (v_row.changes -> 'points_per_currency' ->> 'to') <> '1.75' then
      raise exception
        '0106(ب-٢): الصفُّ لا يسمّي القديم والجديد — التغييرات: %', v_row.changes;
    end if;
    if v_row.changes ? 'updated_at' then
      raise exception '0106(ب-٣): `updated_at` في التغييرات — استثناؤها سقط والسجلُّ يمتلئ ضجيجاً';
    end if;
    if v_admin is not null and (v_row.actor is distinct from v_admin
                                or v_row.actor_kind <> 'admin') then
      raise exception
        '0106(ب-٤): الفاعل «% / %» والمتوقع «% / admin» — سجلٌّ بلا فاعلٍ نصفُ سجلّ',
        v_row.actor, v_row.actor_kind, v_admin;
    end if;

    -- (ج) وحفظٌ بنفس القيم ⇒ **صفر** صفوف جديدة (‏`touch_updated_at` يغيّر
    --     `updated_at` حتماً، و`log_audit` تستثنيها فيبقى v_changes فارغاً)
    update public.loyalty_settings
       set enabled             = enabled,
           points_per_currency = points_per_currency,
           currency_per_point  = currency_per_point,
           min_redeem_points   = min_redeem_points,
           max_redeem_percent  = max_redeem_percent
     where id;

    select count(*)::integer into v_n
    from public.audit_log a where a.id > v_base and a.entity = 'loyalty_settings';
    if v_n <> 1 then
      raise exception '0106(ج): حفظٌ بلا تغيير أنتج ضجيجاً — المجموع % والمتوقع ١', v_n;
    end if;

    -- (د) والسجلُّ يبقى مُلحَقاً فقط: لا دورَ متصفحٍ يكتب فيه مباشرةً
    if has_table_privilege('authenticated', 'public.audit_log', 'INSERT')
       or has_table_privilege('authenticated', 'public.audit_log', 'UPDATE')
       or has_table_privilege('authenticated', 'public.audit_log', 'DELETE')
       or has_table_privilege('anon', 'public.audit_log', 'INSERT') then
      raise exception '0106(د): دورُ متصفحٍ يكتب في `audit_log` — تزويرُ التاريخ ممكن';
    end if;

    raise exception '0106_ROLLBACK';
  exception
    when others then
      begin execute 'reset role'; exception when others then null; end;
      perform set_config('request.jwt.claim.sub', '', false);
      if sqlerrm <> '0106_ROLLBACK' then raise; end if;
  end;

  -- (هـ) صفرُ انجراف — قرارُ المالك يخرج كما دخل
  select to_jsonb(l) into v_after from public.loyalty_settings l;
  if v_after is distinct from v_snap then
    raise exception '0106(هـ): انجراف — قبل: % / بعد: %', v_snap::text, v_after::text;
  end if;

  select count(*)::integer into v_n
  from public.audit_log a where a.id > v_base and a.entity = 'loyalty_settings';
  if v_n <> 0 then
    raise exception '0106(هـ): بقي % صفَّ تدقيق من التحقّق — أثرٌ لم يُرجَع', v_n;
  end if;

  raise notice '0106 ✔ `loyalty_settings` صار مُدقَّقاً بنفس نكهة الشقيق · تغييرُ المعدّل ⇒ صفٌّ يسمّي القديم (%) والجديد والفاعل admin · وحفظٌ بنفس القيم ⇒ صفر ضجيج · والسجلُّ مُلحَقٌ فقط · وصفر انجراف',
    v_snap ->> 'points_per_currency';
end;
$$;

-- ⚠ ولا سطرَ تسجيلٍ في `schema_migrations` هنا: المُشغِّل (`scripts/db-migrate.mjs`)
--    يكتبه بنفسه بعد نجاح الملف.
