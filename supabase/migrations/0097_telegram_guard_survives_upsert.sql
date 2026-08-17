-- ============================================================================
-- 0097_telegram_guard_survives_upsert.sql
--   حارسُ 0057 يبقى حارساً، ويكفّ عن رفض ما لم يتغيّر
--
-- تصليبٌ فوق `0057`. **ولا يُعدَّل حرفٌ فيها** — مطبَّقة (D-58).
-- والحارس **لا يُضعَّف بحرف**: كل رفضٍ رفضَه أمسِ يبقى مرفوضاً اليوم. الذي
-- يتغيّر شيءٌ واحد: كتابةٌ **لم تغيّر الوجهة** لم تكن تُرفض بقصد، وكانت تُرفض.
--
-- ── العَرَض كما وصف المالك ──────────────────────────────────────────────────
--
-- «انهيار النظام بعد ربط التليجرام الخاص بالمتعهد»، و«قمنا بإصلاح مشابه سابقاً».
-- والإصلاح المشابه هو `0057` نفسها — فالشكوى ليست عن حارسٍ مات، بل عن حارسٍ
-- **يعمل في اللحظة الخطأ**.
--
-- ── الجذر: `BEFORE INSERT` يُطلق قبل أن يُكتشف التصادم ───────────────────────
--
-- مخرجُ الأمان في `0057` مكتوبٌ في المُشغِّلَين بصيغةٍ واحدة:
--
--     if tg_op = 'UPDATE' and new.<col> is not distinct from old.<col> then
--       return new;   -- تعديلٌ لا يمسّ الوجهة يمرّ
--     end if;
--
-- وهو صحيحٌ حرفياً ومعطَّلٌ عملياً، لأن **الواجهة لا ترسل `UPDATE`**:
-- `supabase-js` ‏`.upsert(rows, { onConflict: 'key' })` يُترجم في PostgREST إلى
--
--     insert into … values (…) on conflict (key) do update set …
--
-- وPostgres يُطلق مُشغِّلات **`BEFORE INSERT`** على الصفّ **قبل** أن يكتشف
-- التصادم — فيدخل الحارس وحالتُه `tg_op = 'INSERT'` و`old` **غير موجود**، فيسقط
-- الشرط كلُّه ويُفحَص عمودٌ **لم تتغيّر قيمته**. أي أن مخرج الأمان موجودٌ في
-- الفرع الذي لا يُسلَك، وغائبٌ عن الفرع الذي يُسلَك دائماً.
--
-- ── والأثر المقيس (2026-08-17، معاملةٌ أُرجعت) ───────────────────────────────
--
-- تُعاد حالةُ بدر المقيسة في `0057`: متعهدٌ مربوطٌ على **محادثة فريق التشغيل
-- نفسها**. ثم يُضغط «حفظ الإعدادات» في `/admin/settings` بلا لمس حقل تليجرام:
--
-- | ما نُفِّذ | النتيجة |
-- |---|---|
-- | `update site_settings set value = <القيمة نفسها>` | ✅ يمرّ |
-- | `insert … on conflict (key) do update` ← **ما ترسله الواجهة فعلاً** | ❌ `ops-telegram-taken` |
--
-- و`saveSettings` يرفع **خمسة صفوف في `upsert` واحد** — `brand` (وفيه اللوحتان،
-- أربعةٌ وثلاثون لوناً) و`contact` و`socials` و`company` و`notifications`. فرفضُ
-- صفٍّ واحد يُسقط الدفعة كلها: **شاشة الإعدادات تصير غير قابلة للحفظ إطلاقاً**،
-- ورسالتُها الوحيدة «فشل الحفظ — تأكد أنك مسجل الدخول بحساب دوره admin» — تُتّهم
-- الصلاحيات في تصادم بيانات. وهذا بعينه «انهيار النظام».
--
-- ⚠ **ولماذا لم تمسكه اختباراتُ 0057؟** لأنها تقيس `UPDATE` في كل تأكيد —
-- بندُ (ل-٤) و(ل-٦) في `partner_alert_tests.sql` كلاهما `update`. فالفحص يقيس
-- الشكلَ الذي لا يقع، ولا يقيس الشكلَ الذي يقع دائماً. (النمط: تأكيدٌ يقيس
-- مسارَ SQL الذي كتبناه بأيدينا لا المسارَ الذي يُصدره العميل.)
--
-- ── والعلاج: «لم تتغيّر» تُقاس من **المخزَّن** لا من `old` ────────────────────
--
-- `old` غائبٌ في الفرع `INSERT` ولو كان الصفّ قائماً؛ أما القيمة المخزَّنة فهي
-- موجودةٌ دائماً وقابلةٌ للقراءة بالمفتاح. فتُقرأ منها، ويصير مخرجُ الأمان واحداً
-- في الفرعين — وهو ما قصدته `0057` نصّاً في ترويسة بندها (٤).
--
-- 🔒 **وما يبقى مرفوضاً بحرفه**: ربطُ متعهدٍ بمحادثةِ متعهدٍ آخر · ربطُه بوجهة
-- التشغيل · وضعُ وجهة التشغيل على محادثةِ متعهدٍ مربوط. الفرقُ الوحيد أن
-- «القيمة نفسها» لم تعد تصير «قيمةً جديدة» بمجرّد أن العميل استعمل `upsert`.
--
-- والمقارنة على **الارتباط** لا على البايتات: `nullif(btrim(…), '')` — وهي صيغة
-- الفهرس الفريد و`telegram_chat_conflict` نفسها. فمسافةٌ زائدة ليست وجهةً جديدة،
-- ولا تفتح فحصاً على ما لم يتحرّك.
--
-- المرجع: 0057 · `lib/partner-alerts-types.ts` (§٩) · `app/admin/settings/actions.ts`
--         · `app/portal/notifications/actions.ts` · D-19 · D-20 · D-58
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (١) حارس المتعهدين — «لم تتغيّر» تُقرأ من الجدول حين لا يوجد `old`
-- ----------------------------------------------------------------------------

create or replace function public.subcontractors_telegram_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prev     text;
  v_next     text;
  v_conflict text;
begin
  v_next := nullif(btrim(coalesce(new.telegram_chat_id, '')), '');

  if tg_op = 'UPDATE' then
    v_prev := nullif(btrim(coalesce(old.telegram_chat_id, '')), '');
  else
    -- الفرع `INSERT` — وهو **أيضاً** فرعُ `insert … on conflict do update`:
    -- Postgres يُطلق `BEFORE INSERT` قبل أن يكتشف التصادم، فلا `old` هنا ولو كان
    -- الصفّ قائماً. والقيمة المخزَّنة موجودةٌ دائماً، فتُقرأ بالمعرّف.
    -- (إدراجٌ لصفٍّ جديد فعلاً ⇒ لا صفّ ⇒ `null` ⇒ أي وجهةٍ تُفحَص. وهو الصواب.)
    select nullif(btrim(coalesce(s.telegram_chat_id, '')), '')
      into v_prev
      from public.subcontractors s
     where s.id = new.id;
  end if;

  -- تعديلٌ لا يمسّ الوجهة يمرّ — ومنه كل ارتباطٍ سبق 0057، ومنه كلُّ `upsert`
  -- تُصدره شاشةٌ إدارية بالصفِّ كاملاً
  if v_next is not distinct from v_prev then
    return new;
  end if;

  v_conflict := public.telegram_chat_conflict(new.telegram_chat_id, new.id);
  if v_conflict is null then
    return new;
  end if;

  -- 🔒 الرمز في `hint`، والنصّ العربي للسجل وحده — الواجهة تترجم الرمز بنفسها
  if v_conflict = 'telegram-is-ops' then
    raise exception 'محادثة تليجرام هذه هي وجهة إشعارات فريق التشغيل — ربطُها بمتعهد يسلّمه اسم العميل وإجماليه وهامشنا (D-19)'
      using hint = v_conflict;
  end if;

  raise exception 'محادثة تليجرام هذه مرتبطة بمتعهد آخر — والمحادثة الواحدة مستقبِلٌ واحد'
    using hint = v_conflict;
end;
$$;

comment on function public.subcontractors_telegram_guard() is
  'محادثةٌ واحدة = مستقبِلٌ واحد. و«لم تتغيّر الوجهة» تُقاس من القيمة المخزَّنة لا '
  'من `old` — لأن `insert … on conflict do update` يُطلق BEFORE INSERT بلا `old` '
  'ولو كان الصفّ قائماً، فكان الحارس يرفض عموداً لم يُلمس (0097).';

-- ----------------------------------------------------------------------------
-- (٢) والاتجاه المعاكس — نفس العلاج بحرفه، ونفسُ السبب
--
-- وهذا هو الفرع الذي أطاح بشاشة الإعدادات فعلاً: `saveSettings` هو المُنادي
-- الوحيد الذي يكتب مفتاح `notifications`، وهو يكتبه بـ`upsert` دائماً.
-- ----------------------------------------------------------------------------

create or replace function public.site_settings_ops_telegram_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new text;
  v_old text;
  v_who text;
begin
  if new.key <> 'notifications' then
    return new;
  end if;

  v_new := nullif(btrim(coalesce(new.value ->> 'telegramChatId', '')), '');

  if tg_op = 'UPDATE' then
    v_old := nullif(btrim(coalesce(old.value ->> 'telegramChatId', '')), '');
  else
    -- الفرع `INSERT` — وهو ما يُصدره `.upsert([...], { onConflict: 'key' })`
    select nullif(btrim(coalesce(ss.value ->> 'telegramChatId', '')), '')
      into v_old
      from public.site_settings ss
     where ss.key = new.key;
  end if;

  -- لم تتغيّر الوجهة: أيُّ حفظٍ آخر لنموذج الإعدادات يمرّ بلا اعتراض — وهو
  -- النموذج الذي يحمل معه العلامة والألوان والتواصل والشركة في الدفعة نفسها
  if v_new is null or v_new is not distinct from v_old then
    return new;
  end if;

  select s.company_name into v_who
  from public.subcontractors s
  where btrim(coalesce(s.telegram_chat_id, '')) = v_new
  limit 1;

  if v_who is not null then
    raise exception 'محادثة تليجرام هذه مربوطة بالمتعهد «%» — وجعلُها وجهةَ التشغيل يسلّمه كل إشعارات المنصة', v_who
      using hint = 'ops-telegram-taken';
  end if;

  return new;
end;
$$;

comment on function public.site_settings_ops_telegram_guard() is
  'وجهةُ إشعارات التشغيل لا تُضبط على محادثةِ متعهدٍ مربوط. و«لم تتغيّر» تُقاس من '
  'الصفّ المخزَّن لا من `old`، وإلا رفض الحارسُ كلَّ ضغطةِ «حفظ الإعدادات» — '
  'لأن الواجهة تكتب بـupsert، وفرعُه INSERT بلا `old` (0097).';

-- ----------------------------------------------------------------------------
-- (٣) حارسٌ بنيوي يفشل بصوت — **ينفّذ الشكل الذي يُصدره العميل**، لا شكلاً نكتبه
--
-- النمط ٩ في `LESSONS.md`: حارسٌ كُتب بصيغةٍ لا يمكن أن تفشل ليس حارساً. وعيبُ
-- 0057 نجا لأن فحوصها كتبت `update` بيدها؛ فكلُّ نداءٍ هنا يستعمل
-- `insert … on conflict do update` **بحرف ما يُصدره PostgREST**.
-- ----------------------------------------------------------------------------

do $$
declare
  v_a        constant uuid := '0e97a000-0000-4000-8000-00000000001a';
  v_b        constant uuid := '0e97a000-0000-4000-8000-00000000002b';
  v_c        constant uuid := '0e97a000-0000-4000-8000-00000000003c';
  -- معرّفات لا يمكن أن تكون حقيقية (سالبة وأطول من أي معرّف تليجرام)
  v_chat     constant text := '-9007199254740981';
  v_other    constant text := '-9007199254740982';
  v_free     constant text := '-9007199254740983';
  v_settings jsonb;
  v_ok       boolean;
  v_hint     text;
begin
  begin
    insert into public.subcontractors (id, company_name, phone, status)
    values (v_a, '0097_GUARD أ', '01000009701', 'approved'),
           (v_b, '0097_GUARD ب', '01000009702', 'approved');

    -- ══ يُبنى تصادمُ بدر المقيس: متعهدٌ على محادثة التشغيل نفسها ══════════════
    -- وتعطيلُ المُشغِّل لحظةً هو الطريقة الوحيدة الصادقة لمحاكاة حالةٍ كُتبت
    -- **قبل** وجود الحارس؛ والـDDL معاملاتيٌّ في Postgres فيرجع مع الإرجاع.
    update public.site_settings
       set value = jsonb_set(value, '{telegramChatId}', to_jsonb(v_chat))
     where key = 'notifications';

    alter table public.subcontractors disable trigger subcontractors_telegram_guard;
    update public.subcontractors set telegram_chat_id = v_chat where id = v_a;
    alter table public.subcontractors enable trigger subcontractors_telegram_guard;

    select ss.value into v_settings from public.site_settings ss where ss.key = 'notifications';

    -- (أ) 🔴 العَرَض نفسه: حفظُ الإعدادات بلا تغيير الوجهة، بالشكل الذي يُصدره
    --     `supabase-js`. كان هذا يرفع `ops-telegram-taken` فتموت الشاشة كلها —
    --     وفي الدفعة نفسها العلامة وأربعةٌ وثلاثون لوناً والتواصل والشركة.
    v_ok := false; v_hint := null;
    begin
      insert into public.site_settings (key, value) values ('notifications', v_settings)
      on conflict (key) do update set key = excluded.key, value = excluded.value;
      v_ok := true;
    exception when others then
      get stacked diagnostics v_hint = pg_exception_hint;
    end;
    if not v_ok then
      raise exception '0097: upsert لوجهةٍ لم تتغيّر رُفض بـ[%] — شاشة الإعدادات كلها غير قابلة للحفظ', coalesce(v_hint, '∅');
    end if;

    -- (ب) ونفس المخرج على `subcontractors`: صفٌّ **متصادمٌ موروث** يُرفع كاملاً
    --     بـupsert فيمرّ، لأن وجهته لم تتغيّر. ولولاه لعجز المالك عن إيقافه.
    v_ok := false; v_hint := null;
    begin
      insert into public.subcontractors (id, company_name, phone, status, telegram_chat_id)
      values (v_a, '0097_GUARD أ٢', '01000009701', 'suspended', v_chat)
      on conflict (id) do update
        set company_name     = excluded.company_name,
            status           = excluded.status,
            telegram_chat_id = excluded.telegram_chat_id;
      v_ok := true;
    exception when others then
      get stacked diagnostics v_hint = pg_exception_hint;
    end;
    if not v_ok then
      raise exception '0097: upsert لصفِّ متعهدٍ بمحادثته نفسها رُفض بـ[%] — المالك لا يستطيع تعديل متعهده', coalesce(v_hint, '∅');
    end if;
    if not exists (select 1 from public.subcontractors where id = v_a and status = 'suspended') then
      raise exception '0097: الـupsert مرّ ولم يكتب — الفحص يقيس نجاحاً وهمياً';
    end if;

    -- ══ وما يبقى مرفوضاً بحرفه — وإلا كان (أ) و(ب) قد أُرضيا بإضعاف الحارس ══

    -- (ج) محادثةُ الأول لا تُنقل إلى الثاني، ولو جاءت بـupsert
    v_ok := false; v_hint := null;
    begin
      insert into public.subcontractors (id, company_name, phone, status, telegram_chat_id)
      values (v_b, '0097_GUARD ب', '01000009702', 'approved', v_chat)
      on conflict (id) do update set telegram_chat_id = excluded.telegram_chat_id;
      v_ok := true;
    exception when others then
      get stacked diagnostics v_hint = pg_exception_hint;
    end;
    if v_ok then
      raise exception '0097: محادثةٌ واحدة قُبلت لمتعهدَين عبر upsert — كلٌّ يقرأ مستحق الآخر (D-20)';
    end if;
    if v_hint is distinct from 'telegram-taken' then
      raise exception '0097: خرج بـ[%] لا بـtelegram-taken', coalesce(v_hint, '∅');
    end if;

    -- (د) وإدراجٌ **جديد** فعلاً بمحادثةٍ مأخوذة يُرفض — فلا يصير غيابُ الصفّ
    --     بابَ تهريب (الفرع الذي صار يقرأ المخزَّن، فيجب أن يبقى فاحصاً)
    v_ok := false; v_hint := null;
    begin
      insert into public.subcontractors (id, company_name, phone, status, telegram_chat_id)
      values (v_c, '0097_GUARD ج', '01000009703', 'approved', v_chat);
      v_ok := true;
    exception when others then
      get stacked diagnostics v_hint = pg_exception_hint;
    end;
    if v_ok then
      raise exception '0097: صفٌّ جديد قُبل بمحادثةٍ مأخوذة — الفرع INSERT صار بلا حارس';
    end if;
    if v_hint is distinct from 'telegram-taken' then
      raise exception '0097: الإدراج الجديد خرج بـ[%] لا بـtelegram-taken', coalesce(v_hint, '∅');
    end if;

    -- (هـ) والاتجاه المعاكس: الثاني يربط محادثةً حرّة (تمرّ)، ثم يحاول المالك
    --      أن يجعلها وجهةَ التشغيل بـupsert — فتُرفض بـops-telegram-taken
    update public.subcontractors set telegram_chat_id = v_other where id = v_b;

    v_ok := false; v_hint := null;
    begin
      insert into public.site_settings (key, value)
      values ('notifications', jsonb_set(v_settings, '{telegramChatId}', to_jsonb(v_other)))
      on conflict (key) do update set value = excluded.value;
      v_ok := true;
    exception when others then
      get stacked diagnostics v_hint = pg_exception_hint;
    end;
    if v_ok then
      raise exception '0097: وجهةُ التشغيل قُبلت على محادثةِ متعهدٍ مربوط عبر upsert — كلُّ عميلٍ في القاعدة كان سيُكشف';
    end if;
    if v_hint is distinct from 'ops-telegram-taken' then
      raise exception '0097: خرج بـ[%] لا بـops-telegram-taken', coalesce(v_hint, '∅');
    end if;

    -- (و) ووجهةٌ **جديدة لا يملكها أحد** تمرّ — فلا يصير الإصلاحُ منعاً شاملاً
    v_ok := false; v_hint := null;
    begin
      insert into public.site_settings (key, value)
      values ('notifications', jsonb_set(v_settings, '{telegramChatId}', to_jsonb(v_free)))
      on conflict (key) do update set value = excluded.value;
      v_ok := true;
    exception when others then
      get stacked diagnostics v_hint = pg_exception_hint;
    end;
    if not v_ok then
      raise exception '0097: وجهةٌ حرّة رُفضت بـ[%] — الحارس صار يمنع ما لا ضرر فيه', coalesce(v_hint, '∅');
    end if;

    -- (ز) والفصل يبقى ممكناً دائماً — مخرجُ الشريك من ارتباطٍ خاطئ
    update public.subcontractors set telegram_chat_id = null where id = v_a;
    update public.subcontractors set telegram_chat_id = ''   where id = v_b;

    raise exception '0097_ROLLBACK';
  exception
    when others then
      if sqlerrm <> '0097_ROLLBACK' then raise; end if;
  end;

  raise notice '0097 ✔ الحارس يبقى حارساً على شكل `insert … on conflict` نفسه: وجهةٌ لم تتغيّر تمرّ (فتُحفظ الإعدادات) · وصفُّ متعهدٍ متصادم يُرفع كاملاً فيمرّ · ومحادثةٌ مأخوذة تُرفض بـtelegram-taken في التحديث وفي الإدراج الجديد · ووجهةُ التشغيل على محادثةِ متعهد تُرفض بـops-telegram-taken · ووجهةٌ حرّة تمرّ — وصفر صفٍّ لُمس من بيانات المالك';
end;
$$;

-- ⚠ ولا سطرَ تسجيلٍ في `schema_migrations` هنا: المُشغِّل (`scripts/db-migrate.mjs`)
--    يكتبه بنفسه بعد نجاح الملف.
