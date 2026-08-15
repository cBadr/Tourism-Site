-- ============================================================================
-- 0049 — 🔴 صفحة التوكن كانت تسلّم **الإثبات** الذي يحرس رصيد الولاء
--
-- ── الثغرة، مقيسةً من طرفها إلى طرفها ───────────────────────────────────────
--
-- بنت `0045` تمييز `link_source`: `'reference'` يعني «أثبت صاحبُ الحساب ملكية
-- الهاتف»، و`'token'` يعني «حيازةٌ وحدها». وبنى عليه عقدُ الولاء (‏§٣) أخطر
-- قراراته: **الرصيد يملكه الهاتف المُثبَت**، ويُقرأ عبر روابط `'reference'` وحدها.
--
-- والمقدّمة التي حمَلَت البناء كله: «المرجع + الهاتف» سرٌّ لا يعرفه إلا صاحبه.
-- **وهي كانت باطلة**: `get_booking_by_token` — الممنوحة لـ`anon` — تُرجع
-- `reference` و`customer_phone` و`customer_whatsapp` في **حمولةٍ واحدة**.
--
-- والمسار مقيسٌ كاملاً، لا مستنتَجاً:
--
--   ١. زائرٌ يحمل رابطاً **أُعيد إرساله إليه** (وهي الحالة الشائعة: يبعثه العميل
--      لزوجته أو سائقه أو مجموعة عمل) يقرأ `TR-X7JW5K` و`01177486896` معاً.
--   ٢. يفتح حساباً، وينادي `link_booking_by_reference` بما قرأه.
--   ٣. **ينجح**، ويُخزَّن `link_source = 'reference'`.
--   ٤. فيفتح — بموجب §٣ — رصيدَ **ذلك الهاتف كله**: نقاطَ رحلاتٍ لم يرَ منها شيئاً.
--
-- أي أن «الإثبات» كان **مشتقّاً من الشيء الذي يحرسه**. والتمييز الذي شُحن في
-- `0045` لم يكن أضعف مما وُثّق فحسب، بل كان **قابلاً للانتحال بنداءٍ واحد**.
--
-- ── ولماذا التقنيع لا الحذف ─────────────────────────────────────────────────
--
-- حذفُ العمودين يغيّر نوع الإرجاع فيستلزم `drop` وإعادةَ منحٍ ويكسر كل منادٍ —
-- وهي دالةٌ يناديها مسار الإيصال ومسار الحساب واختباراتٌ خمس. والتقنيع يُبقي
-- الشكل ويقتل الهجوم: `link_booking_by_reference` تطبّع ثم **تطابق بالمساواة**،
-- ورقمٌ مقنَّع لا يطابق شيئاً.
--
-- 🔒 **والحقلان معاً لا أحدهما**: `customer_whatsapp` يحمل الرقم نفسه بصيغته
-- الدولية (`201177486896` مقيسٌ حياً)، و`normalize_phone` تردّه إلى المحلي —
-- فتقنيع الهاتف وحده يترك البابَ مفتوحاً من نافذته.
--
-- ── وما لا يخسره أحد ────────────────────────────────────────────────────────
--
-- لا سطر في `app/booking/[token]/page.tsx` يعرض أياً من الحقلين (مقيسٌ بالبحث:
-- صفر إشارة). فهما يسافران إلى الزائر ولا يُرسمان — سطحُ تسريبٍ بلا مقابل.
-- وصاحبُ الحجز يعرف رقمه، ومن لا يعرفه لا يجوز أن تُعلّمه صفحتُنا إيّاه.
-- و`/track` تطلب الهاتف **مدخلاً**، فلا يجوز لصفحتنا أن تكون مخرجه.
-- ============================================================================

/**
 * آخر أربع خانات مسبوقةً بنقاط — شكلٌ يعرفه العميل من الإيصالات البنكية.
 * وثابتٌ لا معامل: خيارُ الطول عند المنادي يعني منادياً يختار الكشف.
 */
create or replace function public.mask_phone_tail(p_phone text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_phone is null then null
    when length(regexp_replace(p_phone, '[^0-9]', '', 'g')) < 4 then '••••'
    else '••••' || right(regexp_replace(p_phone, '[^0-9]', '', 'g'), 4)
  end;
$$;

revoke all on function public.mask_phone_tail(text) from public;
grant execute on function public.mask_phone_tail(text) to anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- إعادة كتابة `get_booking_by_token` — الجسم منقولٌ من الكتالوج الحيّ (D-58)،
-- والفرق **سطران اثنان**: تقنيع الحقلين. وما عداهما حرفٌ بحرف.
-- ----------------------------------------------------------------------------

do $$
declare
  v_def  text;
  v_new  text;
begin
  v_def := pg_get_functiondef(to_regprocedure('public.get_booking_by_token(text)')::oid);
  if coalesce(v_def, '') = '' then
    raise exception '0049: لم أجد الدالة الحيّة — لا تُبنَ على فراغ';
  end if;

  -- الاستبدال على السطر الذي يحمل الحقلين معاً، مرةً واحدة لا أكثر
  if position('b.customer_name, b.customer_phone, b.customer_whatsapp' in v_def) = 0 then
    raise exception
      '0049: شكل الإسقاط تغيّر — لا تستبدل عمياءً، اقرأ الجسم الحيّ وأعد الكتابة يدوياً';
  end if;

  v_new := replace(
    v_def,
    'b.customer_name, b.customer_phone, b.customer_whatsapp',
    'b.customer_name,' || E'\n' ||
    '    public.mask_phone_tail(b.customer_phone),' || E'\n' ||
    '    public.mask_phone_tail(b.customer_whatsapp)'
  );

  execute v_new;
end;
$$;

-- ----------------------------------------------------------------------------
-- فحص ذاتي — يمسبر مسباره، ثم **ينفّذ الهجوم نفسه** ويتأكد أنه صار مستحيلاً
-- ----------------------------------------------------------------------------

do $$
declare
  v_tok    text;
  v_ref    text;
  v_phone  text;
  v_seen   text;
  v_wa     text;
  v_n      integer;
begin
  -- (٠) مسبار المسبار: حجزٌ حقيقي بهاتف، وإلا فلا معنى لما بعده
  select b.public_token, b.reference, b.customer_phone
    into v_tok, v_ref, v_phone
    from public.bookings b
   where b.customer_phone is not null and b.public_token is not null
   order by b.created_at desc limit 1;

  if v_tok is null then
    raise exception '0049: لا حجز بهاتف — القياس لا يقيس شيئاً';
  end if;

  -- (أ) الدالة لم تعد تُخرج الرقم كاملاً
  select g.customer_phone, g.customer_whatsapp into v_seen, v_wa
    from public.get_booking_by_token(v_tok) g;

  if v_seen is null then
    raise exception '0049: الحقل اختفى بدل أن يُقنَّع — نوع الإرجاع تغيّر';
  end if;
  if v_seen = v_phone then
    raise exception '0049: الهاتف ما زال كاملاً في حمولة التوكن (%)', v_seen;
  end if;
  if position('•' in v_seen) = 0 then
    raise exception '0049: الشكل ليس مقنَّعاً (%)', v_seen;
  end if;

  -- (ب) والواتساب كذلك — وهو نصف الثغرة الذي يسهل نسيانه
  if v_wa is not null and position('•' in v_wa) = 0 then
    raise exception '0049: الواتساب خرج غير مقنَّع (%) — الرقم نفسه بصيغة أخرى', v_wa;
  end if;

  -- (ج) 🔒 **الهجوم نفسه**: هل يطابق المقنَّعُ الهاتفَ الحقيقي بعد التطبيع؟
  --     وهذا هو التوكيد الذي يهمّ — لا شكل النقاط.
  if public.normalize_phone(v_seen) is not distinct from public.normalize_phone(v_phone) then
    raise exception '0049: المقنَّع يطبّع إلى الرقم نفسه — التقنيع تجميليّ لا حارس';
  end if;

  -- (د) والذيل باقٍ فعلاً — تقنيعٌ يمحو كل شيء يجعل الصفحة بلا معنى للعميل
  if right(regexp_replace(v_phone, '[^0-9]', '', 'g'), 4) <> right(v_seen, 4) then
    raise exception '0049: آخر أربع خانات لا تطابق — العميل لن يتعرّف على رقمه';
  end if;

  -- (هـ) والمنح كما يجب: الدالة ما زالت متاحة للزائر (هي سطح الضيف)
  select count(*) into v_n from information_schema.routine_privileges
   where specific_schema = 'public' and routine_name = 'get_booking_by_token' and grantee = 'anon';
  if v_n = 0 then
    raise exception '0049: أُسقط منح anon — صفحة متابعة الحجز للضيف انكسرت';
  end if;

  raise notice '✔ 0049: الرقم مقنَّع في الحقلين، ولا يطابق الأصل بعد التطبيع، وسطح الضيف سليم';
end;
$$;
