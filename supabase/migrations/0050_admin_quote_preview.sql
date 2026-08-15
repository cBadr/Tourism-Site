-- ============================================================================
-- 0050 — صندوق تجربة الأسعار: غلافٌ للمشرف بدل منحةٍ تُوسَّع
--
-- ── العطب كما قِيس، لا كما بدا ───────────────────────────────────────────────
--
-- شكا المالك أن شاشة `/admin/pricing` «غير مكتملة أو لا تعمل بكفاءة». وكانت
-- **ميتةً بالكامل**: كل حقولها `disabled`، وتخبره أن «هجرة المرحلة ٣ لم تُنفَّذ»
-- وهي مطبَّقةٌ منذ شهور. وصندوقُ تجربة الأسعار يردّ «تعذر الاحتساب».
--
-- والسبب سلسلةٌ من ثلاث حلقات، كلها **قرارات أمنية صحيحة** أخطأ الكودُ في
-- التعامل معها:
--
-- (١) `pricing_settings` تمنح `authenticated` قراءةً **على مستوى العمود**،
--     وأعمدة الهامش مستثناة منذ `0011_partner_isolation` — والمتعهد
--     `authenticated` كذلك (القاعدة الأم)، و`margin_value` ربحنا فوق تكلفته.
--     والشاشة كانت تنادي `select("*")`، فيرفض Postgres **الجملة كلها**.
--
-- (٢) `quote_price` **ممنوحة لـ`postgres` و`service_role` وحدهما** — والسبب
--     مقيسٌ في نوع إرجاعها: `price_source` و`subcontractor_id` و
--     **`subcontractor_cost` و`margin_amount`**. أي أن متعهداً يناديها يرى
--     **تكلفة أرخص منافسٍ له وهامشنا معاً** — نقضٌ لعزل «متعهد ضد متعهد»
--     (**D-19**) وللـwhite-label في نداءٍ واحد. المنحة الضيّقة **صواب**.
--
-- (٣) والشاشة تناديها بعميلٍ بهوية المستخدم، فترجع `permission denied` —
--     فتُترجمها الشاشة إلى «الهجرة غير منفَّذة»، وهي رسالةٌ **كاذبة وغير قابلة
--     للتنفيذ**: يذهب المالك يبحث عن هجرةٍ مطبَّقة.
--
-- ── ولماذا غلافٌ لا توسيعُ منحة ─────────────────────────────────────────────
--
-- 🔒 منحُ `quote_price` لـ`authenticated` يحلّ شاشة المشرف **ويفتح التكلفة
-- والهامش لكل متعهد** — لأن الدور واحد. وهو بعينه الخطأ الذي وقع في `0041`
-- من الجهة الأخرى: التعامل مع `authenticated` كأنها تعني «موظف».
--
-- فالحل نمطُ هذا المستودع نفسه — `get_margin_settings` و`discount_config` و
-- `dispatch_config` و`loyalty_config`: **دالة `security definer` تفحص
-- `is_admin()` وتفوّض إلى الأصل**. ولا تُستنسخ معادلة التسعير هنا بحال
-- (**القاعدة ١٢** و**D-05**): المعادلة تبقى في `quote_price` وحدها، وهذا
-- الغلاف حارسُ هويةٍ لا حاسبة.
-- ============================================================================

create or replace function public.admin_quote_preview(
  p_distance_km   numeric,
  p_passengers    integer,
  p_round_trip    boolean,
  p_waiting_hours numeric,
  p_origin_lat    numeric default null,
  p_origin_lng    numeric default null,
  p_dest_lat      numeric default null,
  p_dest_lng      numeric default null,
  p_luggage       integer default 0
)
returns table (
  class_slug text, class_title text, capacity integer, total numeric,
  base_fee numeric, distance_cost numeric, waiting_cost numeric,
  round_trip_applied boolean, peak_applied boolean, min_applied boolean,
  price_source text, subcontractor_id uuid,
  subcontractor_cost numeric, margin_amount numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  -- 🔒 غير المشرف يخرج بصفر صفوف لا باستثناء: الشاشة خلف تسجيل الدخول أصلاً،
  -- ورسالة الرفض هنا تكشف وجود الدالة لمن لا يعنيه أمرها.
  select q.class_slug, q.class_title, q.capacity, q.total,
         q.base_fee, q.distance_cost, q.waiting_cost,
         q.round_trip_applied, q.peak_applied, q.min_applied,
         q.price_source, q.subcontractor_id,
         q.subcontractor_cost, q.margin_amount
  from public.quote_price(
         p_distance_km, p_passengers, p_round_trip, p_waiting_hours,
         p_origin_lat, p_origin_lng, p_dest_lat, p_dest_lng, p_luggage
       ) q
  where public.is_admin();
$$;

revoke all on function public.admin_quote_preview(
  numeric, integer, boolean, numeric, numeric, numeric, numeric, numeric, integer
) from public, anon;

grant execute on function public.admin_quote_preview(
  numeric, integer, boolean, numeric, numeric, numeric, numeric, numeric, integer
) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- فحص ذاتي — يمسبر مسباره، ويقيس بالنداء لا بقراءة النصّ
-- ----------------------------------------------------------------------------

do $$
declare
  v_admin uuid;
  v_sub   uuid;
  v_n     integer;
  v_cols  integer;
begin
  -- (٠) مسبار المسبار: بلا مشرفٍ ومتعهدٍ حقيقيين لا يقيس ما بعده شيئاً
  select p.id into v_admin from public.profiles p where p.role = 'admin' limit 1;
  select s.profile_id into v_sub
    from public.subcontractors s where s.profile_id is not null limit 1;
  if v_admin is null or v_sub is null then
    raise exception '0050: لا مشرف أو لا متعهد في القاعدة — الفحص لا يفحص شيئاً';
  end if;

  -- (أ) الأصل ما زال ضيّق المنحة — وهو الشرط الذي يجعل الغلاف ذا معنى
  select count(*) into v_n from information_schema.routine_privileges
   where specific_schema = 'public' and routine_name = 'quote_price'
     and grantee in ('anon', 'authenticated');
  if v_n > 0 then
    raise exception
      '0050: quote_price صارت ممنوحة لدور عام — التكلفة والهامش مكشوفان للمتعهدين';
  end if;

  -- (ب) والزائر لا ينفّذ الغلاف
  if has_function_privilege('anon',
       'public.admin_quote_preview(numeric,integer,boolean,numeric,numeric,numeric,numeric,numeric,integer)',
       'execute') then
    raise exception '0050: anon ينفّذ معاينة الأسعار الإدارية';
  end if;

  -- (ج) 🔒 القياس بالنداء: المشرف يرى صفوفاً، والمتعهد **صفراً**
  begin
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
    select count(*) into v_n
      from public.admin_quote_preview(220, 3, false, 0);
    if v_n = 0 then
      raise exception '0050: المشرف لا يرى أسعاراً — الغلاف لا يفوّض';
    end if;

    -- والأعمدة الأربعة عشر تصل فعلاً، ومنها مصدر السعر الذي وُجد الغلاف لأجله
    select count(*) into v_cols
      from jsonb_object_keys(to_jsonb(
             (select q from public.admin_quote_preview(220, 3, false, 0) q limit 1)
           )) k
     where k in ('price_source', 'subcontractor_cost', 'margin_amount');
    if v_cols <> 3 then
      raise exception '0050: مصدر السعر أو التكلفة أو الهامش غائبة من الإخراج (%)', v_cols;
    end if;

    perform set_config('request.jwt.claims',
      json_build_object('sub', v_sub, 'role', 'authenticated')::text, true);
    select count(*) into v_n
      from public.admin_quote_preview(220, 3, false, 0);
    if v_n > 0 then
      raise exception
        '0050: 🔴 المتعهد يرى % صفاً من معاينة الأسعار — التكلفة والهامش مسرَّبان', v_n;
    end if;
  exception
    when others then
      perform set_config('request.jwt.claims', '', true);
      raise;
  end;
  perform set_config('request.jwt.claims', '', true);

  raise notice '✔ 0050: المشرف يرى الأربعة عشر عموداً، والمتعهد صفراً، وquote_price ما زالت ضيّقة';
end;
$$;
