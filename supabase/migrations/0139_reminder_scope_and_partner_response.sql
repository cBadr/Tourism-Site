-- ============================================================================
-- 0139 — كنسُ التذكيرات يقبل نطاقاً · ومتوسطُ استجابة المتعهد يصير مقروءاً
--
-- بندان من فحص 2026-08-19، كلاهما اقتراحُ تحسينٍ لا إصلاحُ عيب.
-- ============================================================================


-- ════════════════════════════════════════════════════════════════════════════
-- (١) `queue_customer_reminders` تقبل حجزاً بعينه
--
-- 🔴 المقيس: الدالة تمسح **كل** الحجوزات المؤكَّدة والمُسندة داخل نافذة التذكير،
-- ولا تقبل حصرها. وأثرُه ظهر في البوابة يوم 2026-08-18: مجموعةُ
-- `customer_notifications_tests` نادتها فبعثت تذكيراً **لحجز المالك الحقيقي
-- `TR-3QKVVU`** — سلوكٌ صحيحٌ للمهمة المجدولة، وخطأٌ أن يقع في اختبار.
--
-- والعلاجُ معاملٌ **بافتراضيّ `null`**: المهمةُ المجدولة تناديها كما هي بلا حرفٍ
-- يتغيّر (والكودُ المنشور لا يعرف المعامل الجديد أصلاً)، والاختبارُ يمرّر حجزه
-- فلا يلمس صفّاً لا يملكه.
--
-- ⚠ ولا يُغيَّر شيءٌ آخر في الجسم: النافذةُ والقفلُ الاستشاريّ وشرطُ عدم التكرار
-- تبقى حرفاً بحرف. التغييرُ **شرطُ ترشيحٍ واحدٌ يُضاف**، لا إعادةُ كتابة.
-- ════════════════════════════════════════════════════════════════════════════

do $$
declare
  v_def text;
  v_new text;
begin
  -- D-58: الجسمُ يُلتقط من القاعدة الحيّة لا يُكتب من ذاكرة
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'queue_customer_reminders'
  limit 1;

  if v_def is null then
    raise exception '0139: queue_customer_reminders غير موجودة — نفّذ 0131 أولاً';
  end if;

  if position('p_booking_id' in v_def) > 0 then
    raise notice '     ↳ 0139: النطاق مضافٌ سلفاً — لا تغيير';
    return;
  end if;

  -- توقيعٌ جديد بمعاملٍ بافتراضيّ، وشرطُ ترشيحٍ واحد يُحقن قبل شرط عدم التكرار
  v_new := replace(
    v_def,
    'queue_customer_reminders(p_limit integer DEFAULT 200)',
    'queue_customer_reminders(p_limit integer DEFAULT 200, p_booking_id uuid DEFAULT NULL)'
  );
  if v_new = v_def then
    raise exception '0139: لم يُطابق التوقيع المتوقَّع — أُوقف بدل أن أكتب جسماً على غير علم';
  end if;

  v_new := replace(
    v_new,
    'where b.status in (''confirmed'', ''assigned'')',
    'where (p_booking_id is null or b.id = p_booking_id)' || chr(10) ||
    '       and b.status in (''confirmed'', ''assigned'')'
  );
  if position('p_booking_id is null or b.id = p_booking_id' in v_new) = 0 then
    raise exception '0139: لم يُحقن شرطُ النطاق — الجسم تغيّر عمّا قِيس';
  end if;

  /*
   * 🔴 `drop` قبل `create` — لا `create or replace` وحدها.
   *
   * إضافةُ معاملٍ **تُنشئ تحميلاً ثانياً** ولا تستبدل الأول، فيبقى في القاعدة
   * جسمان لدالةٍ واحدة ينحرفان بأول تعديلٍ يمسّ أحدهما (نقضُ القاعدة ١٢).
   * وقد أمسك الفحصُ الذاتيّ هذا في أول تطبيق، فتراجعت المعاملة ولم يبقَ أثر.
   *
   * والحذفُ آمنٌ على الإنتاج: المعاملُ الجديد بافتراضيّ، فنداءُ الكود المنشور
   * `queue_customer_reminders(200)` يُطابق التوقيعَ الجديد بلا تغيير حرف.
   */
  drop function if exists public.queue_customer_reminders(integer);
  execute v_new;
  raise notice '✔ 0139: queue_customer_reminders صارت تقبل p_booking_id بافتراضيّ null';
end;
$$;


-- 🔴 وسحبُ المنحة **خارج** الكتلة أعلاه بقصد — وهو أهمُّ سطرٍ في هذا القسم.
--
-- `drop` ثم `create` يُولّد الدالةَ **جديدةً**، و`alter default privileges` في
-- Supabase تمنح `anon` و`authenticated` صلاحية EXECUTE على كل دالةٍ جديدة.
-- فالدالةُ التي كانت مسحوبةً من الزائر عادت مفتوحةً له — وهي تبعث إشعارات.
-- (أمسكه `(ط-٤)` في `customer_notifications_tests` في أول جولةٍ بعد التطبيق.)
--
-- وموضعُه هنا لا داخل `do $$` ليسري في كل تنفيذٍ للملف، حتى حين يمرّ الأولُ
-- مروراً صامتاً لأن النطاق مضافٌ سلفاً.
-- والوضعُ المستعاد هو وضعُ 0131 حرفاً — لا وضعٌ أوسعُ أخترعه: هناك كان
-- `revoke … from public, anon, authenticated` و`grant … to service_role`.
-- و`authenticated` تشمل **كل متعهد** (D-20)، ولا شأن لهم بإطلاق كنسِ تذكيراتٍ
-- يبعث إشعاراتٍ لعملاء غيرهم.
revoke all on function public.queue_customer_reminders(integer, uuid) from public, anon, authenticated;
grant execute on function public.queue_customer_reminders(integer, uuid) to service_role;


-- ════════════════════════════════════════════════════════════════════════════
-- (٢) متوسطُ زمن استجابة المتعهد — دالةُ قراءةٍ لا عمودٌ في عرض
--
-- 🔴 لماذا دالة لا `v_stats_partners`: التجميعُ مقفلٌ في PostgREST (مقيس:
-- `select=count()` ⇒ `PGRST123 Use of aggregate functions is not allowed`)،
-- فالمتوسطُ لا يُحسب من الواجهة بحال. وتوسيعُ العرض كان يعني إعادةَ تعريفه
-- وكسرَ كل قارئٍ له اليوم — ودالةٌ مستقلة تُضاف ولا تنقض.
--
-- والقياسُ من `trip_offers`: الفارقُ بين إنشاء العرض وأول ردٍّ عليه. ولا يُحسب
-- المتوسطُ إلا على ما رُدّ عليه فعلاً — فالعرضُ المهمَل ليس «استجابةً بطيئة»
-- بل غيابُ استجابة، وخلطُهما يجعل المتوسط يكذب في الاتجاهين.
-- ════════════════════════════════════════════════════════════════════════════

create or replace function public.partner_response_times()
returns table (
  subcontractor_id uuid,
  company_name     text,
  offers_sent      integer,
  offers_answered  integer,
  median_minutes   numeric,
  avg_minutes      numeric
)
language plpgsql
stable
security definer
set search_path to ''
as $$
begin
  if not public.is_admin() then
    raise exception 'قراءة أزمنة استجابة المتعهدين متاحة للمشرف وحده'
      using hint = 'forbidden';
  end if;

  return query
  with answered as (
    select
      o.subcontractor_id as sid,
      extract(epoch from (o.responded_at - o.created_at)) / 60.0 as mins
    from public.trip_offers o
    where o.responded_at is not null
      and o.created_at is not null
      -- ساعةٌ سالبة تعني ساعةَ خادمٍ اضطربت لا استجابةً فورية: تُسقط ولا تُصفَّر
      and o.responded_at >= o.created_at
  )
  select
    s.id,
    s.company_name,
    (select count(*)::integer from public.trip_offers o where o.subcontractor_id = s.id),
    (select count(*)::integer from answered a where a.sid = s.id),
    -- الوسيطُ قبل المتوسط عمداً: عرضٌ واحدٌ رُدَّ عليه بعد يومين يرفع المتوسط
    -- وحده ويجعل متعهداً سريعاً يبدو بطيئاً. والاثنان معاً يُظهران التشتّت.
    (select round(percentile_cont(0.5) within group (order by a.mins)::numeric, 1)
       from answered a where a.sid = s.id),
    (select round(avg(a.mins)::numeric, 1) from answered a where a.sid = s.id)
  from public.subcontractors s
  where s.status = 'approved'
  order by s.company_name;
end;
$$;

comment on function public.partner_response_times() is
  'زمنُ استجابة كل متعهدٍ معتمَد لعروض الرحلات: المرسَل والمُجاب عليه، بالوسيط والمتوسط بالدقائق. '
  'ولا يُحسب إلا على ما رُدّ عليه — العرضُ المهمَل غيابُ استجابةٍ لا بطؤها. للمشرف وحده.';

-- المنحةُ لـ`authenticated` والحارسُ `is_admin()` في الجسم (D-20)، و`anon` مسحوب
revoke all on function public.partner_response_times() from public, anon;
grant execute on function public.partner_response_times() to authenticated, service_role;


-- ── فحصٌ ذاتيّ ──────────────────────────────────────────────────────────────
do $$
declare
  v_anon boolean;
  v_auth boolean;
  v_has  boolean;
begin
  select has_function_privilege('anon', 'public.partner_response_times()', 'execute'),
         has_function_privilege('authenticated', 'public.partner_response_times()', 'execute')
    into v_anon, v_auth;
  if v_anon then
    raise exception '0139: الزائر يقرأ أزمنة استجابة المتعهدين';
  end if;
  if not v_auth then
    raise exception '0139: اللوحة تعمل بدور authenticated — بلا منحةٍ له لا يقرؤها المشرف';
  end if;

  -- تحميلٌ واحدٌ بالضبط، وفيه المعامل: فوجودُ الاسم لا يكفي حين يمكن أن يكون اثنين
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'queue_customer_reminders') <> 1 then
    raise exception '0139: تحميلان لـqueue_customer_reminders — جسمان ينحرفان';
  end if;
  select position('p_booking_id' in pg_get_functiondef(p.oid)) > 0 into v_has
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'queue_customer_reminders';
  if not coalesce(v_has, false) then
    raise exception '0139: النطاق لم يدخل queue_customer_reminders';
  end if;

  -- والدالةُ المُعاد توليدها: الزائرُ لا ينفّذها
  if coalesce((select bool_or(has_function_privilege('anon', pr.oid, 'execute')
                                or has_function_privilege('authenticated', pr.oid, 'execute'))
                 from pg_proc pr join pg_namespace ns on ns.oid = pr.pronamespace
                where ns.nspname = 'public' and pr.proname = 'queue_customer_reminders'), false) then
    raise exception '0139: queue_customer_reminders مفتوحةٌ لـanon أو authenticated — وضعُ 0131 كان service_role وحده';
  end if;

  raise notice '✔ 0139: النطاق مضاف · المنحة مسحوبة من anon · partner_response_times محروسة';
end;
$$;
