-- ============================================================================
-- 0038 — الحجب يمشي داخل الـjsonb (الدفعة ٤ — الملاحظة ١٥، تصليب ثانٍ)
--
-- ── لماذا الآن وليس «عند أول سرّ يُخزَّن في القاعدة» ──────────────────────
--
-- `lib/audit-types.ts` وثّق هذا الحدّ بمُحفِّزٍ مؤجَّل: «الحجب يعمل على اسم
-- العمود لا على مفاتيح JSON بداخله… ومُحفِّز معالجته أول قرارٍ بتخزين مفتاح في
-- القاعدة بدل البيئة». **والمُحفِّز وقع قبل ذلك بسبب لم يكن في الحسبان:** بناء
-- شاشة `/admin/logs` جعل محتوى السجل **مرئياً في متصفح** لأول مرة، والقياس على
-- القاعدة الحيّة أخرج هذا من لقطة حذف حجز:
--
--   trip → {"notes": "… كلّمني على 01001234567 أو bad@example.com قبل الموعد", …}
--
-- أي أن **العميل نفسه** يكتب رقمه في ملاحظة الرحلة — وهو حقل نصّ حرّ داخل
-- `bookings.trip`، فلا يراه حجبٌ يقرأ أسماء الأعمدة. الصفّان القائمان اليوم
-- فيكسترة اختبار، لكن الآلية حقيقية وتعمل على كل حجزٍ حقيقي فيه ملاحظة.
--
-- ── القاعدة المشحونة: عمقٌ يغيّر الحكم ────────────────────────────────────
--
-- **المفتاح على السطح** اسمُ عمودٍ اختاره مصمّم المخطط، فـ`expenses.note` وصفٌ
-- كتبه موظف وهو **لبّ معنى السطر** — حجبه يفرغ السجل (وقد رُفض صراحةً في
-- مراجعة 0037).
--
-- **والمفتاح في العمق** حقلٌ داخل بيانات كتبها عميل أو مزوّد خارجي، فالنصّ
-- الحرّ فيه مجهول المحتوى بطبيعته. ولذلك:
--
--   • على السطح: قائمة `audit_secret_columns()` كما هي.
--   • في العمق: القائمة نفسها **زائد** حقول النصّ الحرّ (`notes` · `note` ·
--     `message` · `comment`) — لأن من كتبها ليس من صمّم الحقل.
--
-- وما يبقى ظاهراً في العمق مقصود: `destLabel` و`originLabel` و`pickupAt`
-- و`passengers` و`distanceKm` هي **الرحلة نفسها**، وتدقيقُ حجزٍ بلا مساره
-- تدقيقٌ بلا موضوع.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (١) حقول النصّ الحرّ — تُحجب في العمق وحده
-- ----------------------------------------------------------------------------

create or replace function public.audit_is_freetext(p_key text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select lower(coalesce(p_key, '')) in ('notes', 'note', 'message', 'comment');
$$;

-- ----------------------------------------------------------------------------
-- (٢) الحجب العميق — يمشي في الكائنات والمصفوفات معاً
-- ----------------------------------------------------------------------------
-- بسقف عمق ٨: بنية أعمق من ذلك لا توجد في هذا المستودع، والسقف يمنع كائناً
-- مُصاغاً بخبث من إدارة العودية. وبلوغُه يُرجع علامةً صريحة لا صمتاً.
-- ----------------------------------------------------------------------------

create or replace function public.audit_redact_deep(p_value jsonb, p_depth integer default 0)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_out jsonb;
begin
  if p_value is null then
    return null;
  end if;

  if p_depth > 8 then
    return to_jsonb('[عمق مفرط — مقصوص]'::text);
  end if;

  if jsonb_typeof(p_value) = 'object' then
    select coalesce(jsonb_object_agg(
             e.k,
             case
               -- في العمق: السرّ والنصّ الحرّ كلاهما محجوب (انظر ترويسة الملف)
               when p_depth > 0 and (public.audit_is_secret(e.k) or public.audit_is_freetext(e.k))
                 then to_jsonb('[محجوب]'::text)
               when p_depth = 0 and public.audit_is_secret(e.k)
                 then to_jsonb('[محجوب]'::text)
               else public.audit_redact_deep(e.v, p_depth + 1)
             end), '{}'::jsonb)
      into v_out
      from jsonb_each(p_value) as e(k, v);
    return v_out;
  end if;

  if jsonb_typeof(p_value) = 'array' then
    select coalesce(jsonb_agg(public.audit_redact_deep(x, p_depth + 1)), '[]'::jsonb)
      into v_out
      from jsonb_array_elements(p_value) as x;
    return v_out;
  end if;

  return p_value;
end;
$$;

/**
 * الواجهة القديمة تبقى بالاسم نفسه وتفوّض إلى العميقة — فكل مستدعٍ في 0036
 * و0037 يستفيد بلا تعديل، ولا يوجد اسمان لعملية واحدة.
 */
create or replace function public.audit_redact(p_row jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select public.audit_redact_deep(p_row, 0);
$$;

-- ----------------------------------------------------------------------------
-- (٣) مسحُ ما كُتب في العمق قبل هذا التصليب
-- ----------------------------------------------------------------------------
-- نفس الاستثناء المصرَّح به في 0037: تعديلٌ على سجلٍّ append-only مبرَّرُه أنه
-- **يحذف ما لم يكن يجوز أن يُكتب**. والحدث يبقى كاملاً — تُحذف القيمة وحدها.
-- ----------------------------------------------------------------------------

do $$
declare
  v_snap integer := 0;
  v_chg  integer := 0;
begin
  with fixed as (
    select id, public.audit_redact_deep(snapshot, 0) as s
      from public.audit_log
     where snapshot is not null
  )
  update public.audit_log l
     set snapshot = f.s
    from fixed f
   where l.id = f.id and l.snapshot is distinct from f.s;
  get diagnostics v_snap = row_count;

  -- والفروق: كل طرف (`from`/`to`) قيمةٌ قد تكون كائناً يحمل نصاً حراً
  with fixed as (
    select l.id,
           (select jsonb_object_agg(
                     e.k,
                     case
                       when e.v ? 'redacted' then e.v
                       else jsonb_strip_nulls(jsonb_build_object(
                              'from', public.audit_redact_deep(e.v -> 'from', 1),
                              'to',   public.audit_redact_deep(e.v -> 'to', 1)))
                     end)
              from jsonb_each(l.changes) e(k, v)) as c
      from public.audit_log l
     where l.changes is not null
  )
  update public.audit_log l
     set changes = f.c
    from fixed f
   where l.id = f.id and l.changes is distinct from f.c;
  get diagnostics v_chg = row_count;

  raise notice '✔ 0038: مُسح العمق مما كُتب — % لقطة و% فرقاً', v_snap, v_chg;
end;
$$;

revoke all on function public.audit_is_freetext(text)         from public, anon, authenticated;
revoke all on function public.audit_redact_deep(jsonb, integer) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- فحص ذاتي — مسبار إيجابي أولاً، ثم كل ادعاء على حدة
-- ----------------------------------------------------------------------------

do $$
declare
  v_out jsonb;
  v_n   integer;
begin
  -- (أ) مسبار إيجابي: ما يجب أن يبقى يبقى — وإلا فما بعده بلا معنى
  v_out := public.audit_redact('{"trip":{"destLabel":"المعمورة","passengers":3}}'::jsonb);
  if v_out -> 'trip' ->> 'destLabel' <> 'المعمورة'
     or (v_out -> 'trip' ->> 'passengers')::int <> 3 then
    raise exception '0038: مسبار معطّل — الحجب العميق ابتلع مسار الرحلة، فلا تصدّق ما بعده';
  end if;

  -- (ب) النصّ الحرّ في العمق محجوب — وهو العيب المقيس على القاعدة الحيّة
  v_out := public.audit_redact('{"trip":{"notes":"كلّمني على 01001234567"}}'::jsonb);
  if v_out -> 'trip' ->> 'notes' <> '[محجوب]' then
    raise exception '0038: ملاحظة العميل داخل trip لم تُحجب (وصلت «%»)', v_out -> 'trip' ->> 'notes';
  end if;

  -- (ج) وعلى السطح يبقى الوصف ظاهراً — القرار الذي رُفض نقضه في 0037
  v_out := public.audit_redact('{"note":"مصروف وقود"}'::jsonb);
  if v_out ->> 'note' <> 'مصروف وقود' then
    raise exception '0038: وصف المصروف على السطح حُجب — السطر يفرغ من معناه';
  end if;

  -- (د) والسرّ في العمق محجوب (الحدّ الذي كان موثَّقاً ومؤجَّلاً)
  v_out := public.audit_redact('{"value":{"integrations":{"api_key":"سرّ"}}}'::jsonb);
  if v_out -> 'value' -> 'integrations' ->> 'api_key' <> '[محجوب]' then
    raise exception '0038: سرٌّ داخل jsonb لم يُحجب — الحدّ ما زال مفتوحاً';
  end if;

  -- (هـ) والمصفوفات كذلك
  v_out := public.audit_redact('{"items":[{"note":"نصّ حرّ"},{"qty":2}]}'::jsonb);
  if v_out -> 'items' -> 0 ->> 'note' <> '[محجوب]' then
    raise exception '0038: النصّ الحرّ داخل مصفوفة لم يُحجب';
  end if;
  if (v_out -> 'items' -> 1 ->> 'qty')::int <> 2 then
    raise exception '0038: الحجب ابتلع قيمة عادية داخل مصفوفة';
  end if;

  -- (و) ولا صفَّ باقياً في السجل يحمل نمط هاتف أو بريد
  select count(*) into v_n from public.audit_log
   where (snapshot is not null and snapshot::text ~ '01[0-9]{9}')
      or (changes  is not null and changes::text  ~ '01[0-9]{9}');
  if v_n > 0 then
    raise exception '0038: % صفاً ما زال يحمل نمط هاتف بعد المسح', v_n;
  end if;

  raise notice '✔ 0038: الحجب يمشي في الكائنات والمصفوفات، والنصّ الحرّ محجوب في العمق وظاهر على السطح، ولا هاتف باقياً';
end;
$$;
