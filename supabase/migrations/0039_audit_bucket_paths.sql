-- ============================================================================
-- 0039 — مسارات الدلو الخاص تُحجب في السجل (الدفعة ٤ — الملاحظة ١٥، تصليب ثالث)
--
-- ── كيف ظهر ───────────────────────────────────────────────────────────────
--
-- أسقط الفحص (ب-٣-٥) في `audit_tests.sql` تشغيلاً كاملاً: «صفٌّ في السجل يحمل
-- نمط هاتف أو بريد». والصفّ لقطةُ حذفِ دفعة، والقيمة:
--
--   "receipt_path": "1851e7c967c7e50ffca20733b7bd2635b6801267944209bc/fixture.jpg"
--
-- وهو **إنذار كاذب**: الهاش السداسي يحوي صدفةً `0126794420` — أحد عشر رقماً
-- بادئتها `01`. لكنه كشف تناقضاً حقيقياً بين عقدين في الدفعة نفسها:
--
--   • `EXPORT_FORBIDDEN_COLUMNS` (‏`lib/export-types.ts`) **يمنع** تصدير
--     `receipt_path` و`attachment_path` بمبرر مكتوب: «مسارات دلو خاص لا تُفتح
--     إلا برابط موقَّع؛ وجودها في ملف يغري بمحاولة الوصول ولا يفيد قارئاً».
--   • و`audit_secret_columns()` تسمح بهما في السجل.
--
-- والمبرر نفسه يسري هنا حرفاً بحرف — بل أقوى: السجل **يبقى ٧٣٠ يوماً** بينما
-- الملف يُنشأ عند الطلب. وقيمتهما التدقيقية صفر: معرّف الدفعة والمصروف في الصف
-- نفسه، ومسارُ الكائن لا يفتحه قارئ السجل بحال.
--
-- ⚠ **وما يبقى مقصود:** أن الإيصال **رُفع** أو **حُذف** حدثٌ يُسجَّل كاملاً —
-- المحجوب مسارُ الملف وحده لا واقعة وجوده.
-- ============================================================================

create or replace function public.audit_secret_columns()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array[
    -- أسرار — وقائية: لا عمود منها في القاعدة اليوم (المفاتيح في البيئة)
    'secret', 'secret_key', 'api_key', 'access_token', 'token', 'password',
    'encrypted_password', 'webhook_secret', 'config',
    -- معرِّفات قائمة فعلاً
    'customer_phone', 'customer_whatsapp', 'phone_norm', 'public_token',
    'customer_name', 'phone', 'whatsapp', 'email', 'handle', 'holder_name',
    'full_name',
    -- مسارات الدلو الخاص (0039) — بلا قيمة تدقيقية وبنفس مبرر منعها في التصدير
    'receipt_path', 'attachment_path'
  ]::text[];
$$;

-- مسحُ ما كُتب منها قبل هذا التصليب — نفس الاستثناء المصرَّح به في 0037 و0038:
-- تعديلٌ على سجلٍّ append-only مبرَّرُه أنه **يحذف ما لم يكن يجوز أن يُكتب**.
do $$
declare
  v_snap integer := 0;
  v_chg  integer := 0;
begin
  with fixed as (
    select id, public.audit_redact_deep(snapshot, 0) as s
      from public.audit_log where snapshot is not null
  )
  update public.audit_log l set snapshot = f.s
    from fixed f where l.id = f.id and l.snapshot is distinct from f.s;
  get diagnostics v_snap = row_count;

  with fixed as (
    select l.id,
           (select jsonb_object_agg(
                     e.k,
                     case
                       when public.audit_is_secret(e.k) then jsonb_build_object('redacted', true)
                       when e.v ? 'redacted' then e.v
                       else jsonb_strip_nulls(jsonb_build_object(
                              'from', public.audit_redact_deep(e.v -> 'from', 1),
                              'to',   public.audit_redact_deep(e.v -> 'to', 1)))
                     end)
              from jsonb_each(l.changes) e(k, v)) as c
      from public.audit_log l where l.changes is not null
  )
  update public.audit_log l set changes = f.c
    from fixed f where l.id = f.id and l.changes is distinct from f.c;
  get diagnostics v_chg = row_count;

  raise notice '✔ 0039: مُسحت مسارات الدلو — % لقطة و% فرقاً', v_snap, v_chg;
end;
$$;

-- ----------------------------------------------------------------------------
-- فحص ذاتي
-- ----------------------------------------------------------------------------
do $$
declare
  v_n integer;
begin
  -- مسبار إيجابي أولاً: ما يجب أن يبقى يبقى
  if public.audit_redact('{"note":"مصروف وقود","status":"approved"}'::jsonb) ->> 'note'
       <> 'مصروف وقود' then
    raise exception '0039: مسبار معطّل — الحجب ابتلع وصفاً، فلا تصدّق ما بعده';
  end if;

  if not public.audit_is_secret('receipt_path')
     or not public.audit_is_secret('attachment_path') then
    raise exception '0039: مسار الدلو لم يُضَف إلى قائمة الحجب';
  end if;

  if public.audit_redact('{"receipt_path":"x/y.jpg"}'::jsonb) ->> 'receipt_path'
       = 'x/y.jpg' then
    raise exception '0039: audit_redact لم تحجب receipt_path';
  end if;

  select count(*) into v_n from public.audit_log l
   where (l.snapshot is not null
          and exists (select 1 from jsonb_each(l.snapshot) e(k, v)
                       where public.audit_is_secret(e.k)
                         and e.v <> to_jsonb('[محجوب]'::text)));
  if v_n > 0 then
    raise exception '0039: % لقطة ما زالت تحمل عموداً محجوباً مكشوفاً', v_n;
  end if;

  raise notice '✔ 0039: مسارات الدلو محجوبة، والأوصاف ظاهرة، ولا صفَّ مكشوفاً';
end;
$$;
