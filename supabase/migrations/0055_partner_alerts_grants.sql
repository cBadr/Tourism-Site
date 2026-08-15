-- ============================================================================
-- 0055 — تصليب منح 0054: سحب `TRUNCATE`/`TRIGGER`/`REFERENCES` من `authenticated`
--
-- 🔴 **العيب الذي أمسكه الفحص الذاتي، وهو نفسه العيب الذي شُحن في هذا المشروع
--    مرّتين قبلاً.** كتبت `0054` سطرَي المنح هكذا:
--
--      revoke all on table public.partner_alert_prefs from public, anon;
--      grant select, insert, update on table public.partner_alert_prefs to authenticated;
--
--    فبدا الجدول محكماً في **كل مراجعة تقرأ السياسات**: RLS مفعَّلة، وثلاث
--    سياسات تحصر كل صفٍّ بصاحبه أو بالمشرف. لكن `revoke` لم تشمل
--    `authenticated`، وSupabase تمنح الدور صلاحياتٍ واسعة على الجدول الجديد
--    افتراضياً — فبقيت له **`TRUNCATE`**، **وهي العملية الوحيدة التي لا تمرّ
--    على RLS إطلاقاً**.
--
--    والأثر مقيسٌ لا نظري: أي متعهدٍ مسجَّل الدخول كان يستطيع
--    `truncate public.partner_alert_prefs` فيمحو تفضيلات **كل** المتعهدين
--    وحالةَ «أستقبل الطلبات» عندهم جميعاً — أي يعيد ضبط توجيه الشبكة كلها،
--    بلا أن تعترض سياسةٌ واحدة. وكذلك `partner_push_subscriptions`.
--
--    ولماذا أفلتت رغم أن `0054` كتبت كتلة `revoke` صراحةً؟ لأن الكتلة نسخت
--    الشكل الشائع `from public, anon` — وهو الصحيح لجدولٍ **لا يلمسه**
--    `authenticated` أصلاً. أما جدولٌ يحتاج فيه الدورُ `select/insert/update`
--    فالصواب: **اسحب من الثلاثة ثم امنح المطلوب وحده**.
--
-- 📌 القاعدة المستخلَصة (تُضاف إلى القاعدة الذهبية ١٦): `revoke … from public,
--    anon` **ليست كتلة المنح** — هي نصفها. والنصف الآخر أن يشمل السحبُ
--    `authenticated` كلما كان للدور أي منحةٍ لاحقة على الجدول نفسه.
--
-- ولا تُعدَّل `0054` (اتفاقية ٦: لا يُعدَّل ملف مطبَّق أبداً — التصحيح ترحيل جديد).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (١) السحب الكامل ثم المنح الأضيق — الترتيب نفسه هو الإصلاح
-- ----------------------------------------------------------------------------

revoke all on table public.partner_alert_prefs        from public, anon, authenticated;
revoke all on table public.partner_push_subscriptions from public, anon, authenticated;

-- المتعهد يقرأ صفَّه ويُنشئه ويعدّله — ولا يحذفه (الحذف يفقد سجلّ تفضيلاته
-- بلا فائدة، والتعطيل مفتاحٌ لا صفٌّ محذوف)
grant select, insert, update on table public.partner_alert_prefs to authenticated;
grant select, insert, update, delete on table public.partner_alert_prefs to service_role;

-- ولا `update` على اشتراك جهاز: التحديث يمرّ بـ`portal_register_push` وحدها،
-- فلا يستطيع أحد تحويل اشتراكٍ قائم إلى نفسه بتحديثٍ مباشر
grant select, insert, delete on table public.partner_push_subscriptions to authenticated;
grant select, insert, update, delete on table public.partner_push_subscriptions to service_role;

-- ----------------------------------------------------------------------------
-- (٢) حارسٌ ينادي `has_table_privilege` ولا يقرأ سياسة — ويرمي
--
-- والفرق جوهري: الجدول تبدو سياساته محكمة في كل مراجعة تقرأ السياسات، بينما
-- المنحة الواسعة تترك `truncate` مفتوحة. **فاقرأ المنحة لا السياسة وحدها.**
-- ----------------------------------------------------------------------------

do $$
declare
  v_bad text;
begin
  select string_agg(format('%s/%s/%s', t.rel, r.role, p.priv), '، ') into v_bad
  from (values ('public.partner_alert_prefs'), ('public.partner_push_subscriptions'),
               ('public.notification_providers')) as t(rel)
  cross join (values ('anon'), ('authenticated')) as r(role)
  cross join (values ('TRUNCATE'), ('TRIGGER'), ('REFERENCES')) as p(priv)
  where exists (select 1 from pg_roles where rolname = r.role)
    and has_table_privilege(r.role, t.rel, p.priv);
  if v_bad is not null then
    raise exception '0055: صلاحياتٌ لا تحرسها RLS ما زالت ممنوحة: %', v_bad;
  end if;

  -- والاتجاه الآخر: ما يجب أن يبقى ممنوحاً **باقٍ** — وإلا شحنّا سطحاً معطّلاً
  if not has_table_privilege('authenticated', 'public.partner_alert_prefs', 'SELECT')
     or not has_table_privilege('authenticated', 'public.partner_alert_prefs', 'UPDATE')
     or not has_table_privilege('authenticated', 'public.partner_push_subscriptions', 'INSERT') then
    raise exception '0055: السحب أخذ معه ما يحتاجه البورتال — الشاشة ستفشل صامتة';
  end if;

  raise notice '✔ 0055: صفر truncate/trigger/references لدورَي المتصفح على جداول 0054 — وسطحُ البورتال باقٍ';
end;
$$;
