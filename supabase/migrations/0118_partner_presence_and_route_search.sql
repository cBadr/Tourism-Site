-- ============================================================================
-- 0118_partner_presence_and_route_search.sql
-- ظهورُ المتعهد كما هو لا كما يُخمَّن، وبحثٌ في المسارات يجد ما يكتبه المالك.
-- ============================================================================
--
-- ── ما شكا منه المالك (2026-08-18) ────────────────────────────────────────
--
--   (٣) «تفتقر إلى بيان ظهور المتعهد — متواجد حالياً أو غير متواجد»
--       ثم حسمها بنفسه: «**متواجد يعني أونلاين**، بمعنى أن حالة المستخدم متصل».
--   (٢) «لا توجد خيارات بحث في المسارات سواءً في كل المتعهدين أو لمتعهد معين»
--
-- ── 🔴 أولاً: ما لم يكن موجوداً، مقيساً لا مفترضاً ────────────────────────
--
--   select column_name, table_name from information_schema.columns
--    where column_name ilike '%last_seen%';
--   ⇒ صفٌّ واحد: partner_push_subscriptions.last_seen_at
--
-- أي أن آخر ظهورٍ مسجَّلٌ اليوم **لجهاز** لا **لشخص**: صفُّ اشتراك دفعٍ في
-- متصفّح. ومتعهدٌ يفتح بوابته من هاتفه كل ساعة بلا اشتراك دفعٍ واحد
-- (`select count(*) from partner_push_subscriptions` ⇒ **٠** على هذه القاعدة)
-- لا أثر له إطلاقاً. فـ«ظهور المتعهد» بيانٌ **غير موجود**، لا بيانٌ غير معروض.
--
-- ── 🔴 وثانياً: ما كان موجوداً ولا ينادَى — فلا يُبنى ثانيةً ──────────────
--
--   grep -rl admin_partner_availability app/  ⇒ **لا شيء**
--
-- `admin_partner_availability()` قائمةٌ منذ `0054` وتُرجع لكل متعهد:
-- `reachable` و`willing` و`available` و`reaching_channels` و`has_telegram_id`
-- و`push_devices` — و**لا منادي لها في اللوحة كلها**. فالسؤالان مختلفان ولا
-- يُغني أحدهما عن الآخر:
--
--   | السؤال | مَن يجيبه | لماذا لا يكفي وحده |
--   |---|---|---|
--   | «هل هو أمام الشاشة الآن؟» | الظهور (هذا الملف) | المتصل قد يكون رافضاً للعروض |
--   | «هل يصله العرض وهل يقبله؟» | `admin_partner_availability` | غيرُ المتصل يصله دفعٌ على تليجرام فيردّ خلال ثوانٍ |
--
-- ⇒ **القاعدة الذهبية ١٢ حرفياً**: لا تعريفَ ثانياً لقابلية الوصول.
--   `admin_partner_presence()` أدناه **تُنادي** القائمة وتضيف عمودين، تماماً
--   كما فعلت `pulse_stats` مع `section_stats`. فجسمُ الدالة القديمة لم يُلمس،
--   والانحدار صار مستحيلاً بنيوياً لا مستبعَداً بالانتباه (**D-58**).
--
-- ⚠ **ولماذا كانت تُرجع `[]` حين تُنادى بـ`service_role`**: حارسها في جسمها
--   (`where public.is_admin()`)، و`is_admin()` تقرأ `auth.uid()` — وهي `null`
--   لوصلةٍ خدمية بلا JWT. فالصفرُ **صحةٌ لا عطل**، ويصير صفوفاً لحظة تُنادى
--   بجلسة مشرفٍ حقيقية من اللوحة. وهذا بعينه ما يُقاس في `presence_tests`.
--
-- ── ولماذا جدولٌ مستقل لا عمودٌ على `subcontractors` ──────────────────────
--
-- ثلاثة أسباب مقيسة، لا تفضيلاً في الشكل:
--
--   ١. **مُشغّل التدقيق**: `select count(*) from pg_trigger t join pg_proc p
--      on p.oid = t.tgfoid where p.proname like '%audit%'` ⇒ **٤٢** مُشغّلاً،
--      ومنها واحدٌ على `subcontractors`. ونبضةٌ كل دقيقة على ذلك الصف تعني
--      ١٤٤٠ صفَّ تدقيقٍ لكل متعهد في اليوم — **ضجيجٌ يُسكت الإنذار** (القاعدة
--      ١٣): سجلٌّ يمتلئ بـ«تغيّر آخر ظهور» يُخفي «تغيّرت حالة المتعهد».
--   ٢. **الصفُّ الذي يقرؤه الجميع لا يُكتب كل دقيقة**: `subcontractors` يُقرأ
--      في التسعير والبث والمقاصة، وكتابةٌ دورية عليه تُنتج نسخاً ميتة (bloat)
--      في أكثر جدولٍ قراءةً بلا مقابل.
--   ٣. **المنحةُ تُكتب من الصفر** (القاعدة ١٦): جدولٌ جديد يبدأ بـ`revoke`
--      صريح، بينما عمودٌ مُلحَقٌ يرث منحَ جدولٍ قائم بلا قرار.
--
-- ⚠ **ولا مُشغّل تدقيقٍ على هذا الجدول بقصد.** الظهور نبضةٌ لا قرار، ولا شيء
--   فيه يُطالَب به أحدٌ يوماً. ومن أراد تدقيقه غداً فليقرأ السبب ١ أولاً.
--
-- ── وأمانُ الكتابة: الدالةُ **بلا وسيط**، فلا شيء يُلفَّق ───────────────────
--
-- `touch_partner_presence()` لا تأخذ معرّفاً إطلاقاً — تقرؤه من
-- `current_subcontractor_id()`. فلا يستطيع متعهدٌ أن يكتب ظهور منافسه ولو
-- أراد: **لا حقلَ يمرّره**. وهذا أقوى من فحصٍ داخل الجسم، لأنه لا يعتمد على
-- بقاء الفحص مكتوباً. و**`authenticated` ليست مشرفاً** (D-20): كلُّ عميلٍ
-- مسجَّل يملك تنفيذها، و`current_subcontractor_id()` تُرجع له `null` فتخرج
-- الدالة بلا كتابة ولا خطأ.
--
-- ── والبحث: لا مطبّع ثانياً ────────────────────────────────────────────────
--
-- `0117_arabic_normalize.sql` نزلت سلفاً وفيها `arabic_search_key`. فالبحث
-- هنا **يستعملها ولا يكتب غيرها**. والمقيس على هذه القاعدة قبل كتابة سطر:
--
--   select public.arabic_search_key('الاسكندريه');            ⇒ 'اسكندريه'
--   select public.arabic_search_key('القاهرة - الأسكندرية');  ⇒ 'قاهره اسكندريه'
--
-- أي أن مسار المالك الحقيقي (‏«القاهرة - الأسكندرية»، بهمزةٍ على الألف) يُوجَد
-- بكتابة «الاسكندريه» بهاءٍ في آخرها وبلا همزة. ومسار المطار **لا** يُوجَد بها،
-- فالبحث يُرشِّح ولا يُغرِق.
--
-- 🔒 **ولا حاجة إلى تهريب محارف `LIKE` إطلاقاً** — وهذه خاصيةٌ بنيوية لا انتباه:
--    `arabic_search_key` تُسقط كلَّ ما ليس حرفاً عربياً ولا لاتينياً صغيراً ولا
--    رقماً، ومنها `%` و`_` و`\`. مقيسٌ:
--      select public.arabic_search_key('%_\ الاسكندريه %') ⇒ 'اسكندريه'
--    فالنمط المبنيّ من مُخرَجها لا يحمل محرفاً خاصاً بحال.
--
-- **وشرطان لا واحد** — لأن المالك يكتب بالطريقتين:
--
--   (أ) **كلُّ كلمةٍ من بحثه موجودةٌ** في مفتاح الصف المجرَّد (‏`~~ all`):
--       «القاهره الاسكندريه» تجد المسار ولو تباعدت الكلمتان فيه.
--   (ب) **أو التصاقاً**، على النصّ **المطبَّع بلا تجريد** بعد حذف كل ما ليس
--       حرفاً: «انستاباي» تجد «انستا باي».
--
-- ⚠ **ولماذا الالتصاق على النصّ غير المجرَّد تحديداً** — مقيسٌ لا مُخمَّن:
--   الملتصق يصير **كلمةً واحدة**، و`arabic_strip_clitics` تجرّد أوّلها وحده. فـ
--   «مطارالقاهره» يبقى فيها «ال» في الوسط، بينما مفتاح الصف صار «مطار قاهره»
--   ⇒ الالتصاق على المفتاح المجرَّد **لا يجد شيئاً** (قِيس: صفر صفوف). أما على
--   النصّ المطبَّع كما هو (‏«مطارالقاهرهداخلي…») فيجد. والشرط (أ) يغطي الاتجاه
--   المعاكس — «والاسكندريه» — لأنه يعمل على المفتاح المجرَّد. فكلٌّ منهما يسدّ
--   ثغرة الآخر، ولا يُحذف أحدهما.
--
-- ── لا صفَّ بياناتٍ قائم يُمسّ ─────────────────────────────────────────────
--
-- جدولٌ جديدٌ فارغ وثلاث دوال. لا `update` ولا `delete` على أي صفٍّ قائم، ولا
-- تعديل على `subcontractors` ولا `price_lists` ولا `locales`.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (١) جدول الظهور — صفٌّ واحد لكل متعهد، وعمودٌ واحد يعني شيئاً
-- ----------------------------------------------------------------------------
create table if not exists public.partner_presence (
  subcontractor_id uuid primary key
    references public.subcontractors(id) on delete cascade,
  -- آخر طلبٍ موثَّقٍ وصل من هذا المتعهد إلى بوابته. يُكتب مرةً كل دقيقة على
  -- الأكثر (الشرط داخل `touch_partner_presence` أدناه).
  last_seen_at timestamptz not null default now()
);

comment on table public.partner_presence is
  'نبضةُ حضور المتعهد في بوابته — صفٌّ لكل متعهد يُحدَّث مرةً كل دقيقة على الأكثر. لا تدقيق عليه بقصد: نبضةٌ لا قرار.';
comment on column public.partner_presence.last_seen_at is
  'آخر طلبٍ موثَّق وصل من هذا المتعهد. غيابُ الصف = لم يدخل بوابته قط، وهو غيرُ «غير متصل».';

alter table public.partner_presence enable row level security;

-- 🔴 القاعدة ١٦: **المنحةُ هي الحارس لا السياسة** — وRLS لا تحرس `TRUNCATE`.
-- لا سياسةَ واحدة على هذا الجدول، ولا منحةَ واحدة لأي دور مستخدم: سطحُه كلُّه
-- دالّتان `definer` أدناه. فلا `select` ولا `insert` ولا `truncate` من PostgREST.
revoke all on table public.partner_presence from public, anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- (٢) تسجيل النبضة — بلا وسيط، وبخانقٍ في القاعدة لا في الواجهة
-- ----------------------------------------------------------------------------
--
-- ⚠ **الخانقُ هنا هو الضمانة، وأيُّ خانقٍ في الواجهة تحسينٌ فوقه لا بديلٌ عنه.**
--   ذاكرةُ العملية تضيع مع أول إعادة تشغيل، وقد تتعدد العمليات — فالحدُّ الذي
--   يصمد هو `where` أدناه: صفٌّ عمرُه أقلُّ من دقيقةٍ **لا يُكتب**، فلا تصير
--   نبضةُ الحضور كتابةً على كل تحميل صفحة.
--
-- و`on conflict … where` تمرّ بلا خطأ حين يكون الشرط كاذباً — أي أن الاستدعاء
-- المتكرر **لا يفشل** ولا يحتاج معالجةً في المنادي.
create or replace function public.touch_partner_presence()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sub uuid;
begin
  -- لا وسيط ⇒ لا شيء يُلفَّق. والهوية من الجلسة وحدها.
  v_sub := public.current_subcontractor_id();

  -- عميلٌ مسجَّل أو مشرف أو جلسةٌ بلا صفِّ متعهد: خروجٌ صامت بلا كتابةٍ ولا خطأ.
  -- (‏`authenticated` ليست مشرفاً ولا متعهداً بالضرورة — D-20.)
  if v_sub is null then
    return;
  end if;

  insert into public.partner_presence as pp (subcontractor_id, last_seen_at)
  values (v_sub, now())
  on conflict (subcontractor_id) do update
     set last_seen_at = now()
   where pp.last_seen_at < now() - interval '1 minute';
end;
$$;

comment on function public.touch_partner_presence() is
  'تسجيل نبضة حضور المتعهد صاحب الجلسة — بلا وسيط، وبكتابةٍ مرةً كل دقيقة على الأكثر. غير المتعهد يخرج منها صامتاً بلا كتابة.';

revoke all on function public.touch_partner_presence() from public, anon;
grant execute on function public.touch_partner_presence() to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- (٣) قراءة اللوحة — **تفويضٌ لا استنساخ**
-- ----------------------------------------------------------------------------
--
-- كل ما يخصّ قابلية الوصول يصل من `admin_partner_availability()` كما هو، بلا
-- سطرٍ واحد يُعيد حسابه. والمُضاف عمودان اثنان لا غير.
--
-- ⚠ **ونافذة «متصل» خمس دقائق لا واحدة**: النبضة تُكتب مرةً كل دقيقة، فمتعهدٌ
--   يقرأ صفحةً واحدة أربع دقائق نبضتُه عمرُها أربع دقائق وهو أمام الشاشة. نافذةُ
--   دقيقةٍ كانت ستُطفئ النقطة الخضراء وهو ينظر إليها.
--
-- 🔒 والحارس مكتوبٌ هنا صراحةً **وهو موروثٌ أصلاً**: الدالة المُنادَاة تُرجع صفراً
--    لغير المشرف، فالنتيجة صفرٌ في الحالتين. وكتابتُه ثانيةً تجعل الدالة مقروءةً
--    وحدها بلا فتح تعريف غيرها.
create or replace function public.admin_partner_presence()
returns table (
  subcontractor_id  uuid,
  company_name      text,
  status            text,
  reachable         boolean,
  willing           boolean,
  available         boolean,
  reaching_channels text[],
  has_telegram_id   boolean,
  push_devices      integer,
  -- null = لم يدخل بوابته قط. وهي **ليست** «غير متصل» (القاعدة ١٥).
  last_seen_at      timestamptz,
  online            boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select a.subcontractor_id,
         a.company_name,
         a.status,
         a.reachable,
         a.willing,
         a.available,
         a.reaching_channels,
         a.has_telegram_id,
         a.push_devices,
         p.last_seen_at,
         (p.last_seen_at is not null and p.last_seen_at > now() - interval '5 minutes')
  from public.admin_partner_availability() a
  left join public.partner_presence p on p.subcontractor_id = a.subcontractor_id
  where public.is_admin()
  order by a.company_name asc;
$$;

comment on function public.admin_partner_presence() is
  'ظهور المتعهدين وقابلية وصولهم في نداءٍ واحد للوحة: تُنادي admin_partner_availability كما هي وتضيف last_seen_at وonline (نافذة ٥ دقائق). للمشرف وحده.';

revoke all on function public.admin_partner_presence() from public, anon;
grant execute on function public.admin_partner_presence() to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- (٤) بحث المسارات — عبر كل المتعهدين أو داخل واحد
-- ----------------------------------------------------------------------------
--
-- ما يحلّه هذا: شكوى المالك (٢) بشقّيها. و`p_subcontractor = null` هو البحث
-- الشامل، وتمريرُ معرّفٍ يحصره في متعهدٍ بعينه — **دالةٌ واحدة لشاشتين**، فلا
-- تنحرف نتيجةُ إحداهما عن الأخرى يوماً.
--
-- ── ولماذا تُرجع `classes_priced` و`min_cost` و`max_cost` لا جدولَ فئات ────
--
-- هذا بعينه علاجُ الشكوى (١): «قوائم الأسعار تُعرض بشكل كبير جداً». الصفُّ
-- الواحد يقول «٤ فئات · من ٧٢٠ إلى ١٬٥٠٠» بدل أربعة أسطرٍ بأربعة أعمدة. أي أن
-- **التجميع يقع في Postgres** ولا تصل الواجهةَ صفوفُ الأسعار أصلاً — فالوفر في
-- الشبكة وفي شجرة DOM معاً، لا في الشكل وحده.
--
-- 🔒 **والتكلفة لا تخرج إلا لمشرف**: `where public.is_admin()` داخل الجسم.
--    و`authenticated` ممنوحةٌ التنفيذَ لأن المشرف نفسه دورُه `authenticated` —
--    فالمنحةُ ليست الحارس، والحارسُ يُقاس بنداءٍ حيٍّ بدور متعهدٍ حقيقي في
--    `presence_tests.sql` (القاعدة ١٩: لا حكمَ على الصلاحيات بمطابقة نصوص).
--    ونقضُ هذا يعني أن يقرأ متعهدٌ تكلفة منافسه (**D-19**).
--
-- ⚠ **وسقفٌ صريح دائماً**: `p_limit` مُقيَّدٌ بين ١ و٢٠٠ داخل الدالة، فلا يستطيع
--   منادٍ أن يطلب القاعدة كلها بتمرير رقمٍ كبير. و`total_count` نافذةٌ على
--   المطابق كلِّه قبل الاقتطاع — فالشاشة تقول «المعروض ٥٠ من ١٣٧» بلا استعلامٍ
--   ثانٍ ولا عدٍّ في الواجهة.
create or replace function public.admin_search_routes(
  p_query         text    default null,
  p_subcontractor uuid    default null,
  p_status        text    default null,
  p_limit         integer default 50,
  p_offset        integer default 0
)
returns table (
  id               uuid,
  subcontractor_id uuid,
  company_name     text,
  company_status   text,
  sheet_id         uuid,
  sheet_title      text,
  title            text,
  origin_label     text,
  dest_label       text,
  origin_radius_km numeric,
  dest_radius_km   numeric,
  bidirectional    boolean,
  status           text,
  classes_priced   integer,
  min_cost         numeric,
  max_cost         numeric,
  created_at       timestamptz,
  total_count      bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with needle as (
    select
      k,
      -- نمطٌ لكل كلمة: «القاهره اسكندريه» تجد ما فيه الاثنتان ولو متفرقتين
      (select coalesce(array_agg('%' || w || '%'), '{}'::text[])
         from unnest(string_to_array(k, ' ')) w
        where w <> '')                  as pats,
      -- والالتصاق على النصّ المطبَّع **بلا تجريد** — انظر الترويسة (ب)
      '%' || g || '%'                   as glued
    from (
      select public.arabic_search_key(coalesce(p_query, '')) as k,
             -- نفس المدى المكتوب في 0117 حرفاً بحرف، وبـ`\uXXXX` لا بمحارف
             -- ملصقة (‏0117 §الترويسة: لا محرف غير مرئي في ملف هجرة)
             regexp_replace(public.normalize_arabic(coalesce(p_query, '')),
                            '[^\u0600-\u06ffa-z0-9]+', '', 'g') as g
    ) s
  ),
  hit as (
    select pl.id,
           pl.subcontractor_id,
           s.company_name,
           s.status                    as company_status,
           pl.sheet_id,
           sh.title                    as sheet_title,
           pl.title,
           pl.origin_label,
           pl.dest_label,
           pl.origin_radius_km,
           pl.dest_radius_km,
           pl.bidirectional,
           pl.status,
           agg.classes_priced,
           agg.min_cost,
           agg.max_cost,
           pl.created_at
    from public.price_lists pl
    join public.subcontractors s on s.id = pl.subcontractor_id
    left join public.price_sheets sh on sh.id = pl.sheet_id
    cross join needle n
    -- مفتاحا المقارنة يُحسبان مرةً واحدة للصف: نصُّ الصف يُقرأ مرةً لا مرتين
    cross join lateral (
      select public.arabic_search_key(t.txt)                                   as key,
             regexp_replace(public.normalize_arabic(t.txt),
                            '[^\u0600-\u06ffa-z0-9]+', '', 'g')                as glued
      from (
        select concat_ws(' ', pl.title, pl.origin_label, pl.dest_label,
                              s.company_name, sh.title) as txt
      ) t
    ) hay
    -- التجميع في Postgres: الصفُّ يحمل خلاصة أسعاره لا أسعاره
    cross join lateral (
      select count(*)::integer as classes_priced,
             min(i.cost)       as min_cost,
             max(i.cost)       as max_cost
      from public.price_list_items i
      where i.price_list_id = pl.id
    ) agg
    where public.is_admin()
      and (p_subcontractor is null or pl.subcontractor_id = p_subcontractor)
      and (p_status        is null or pl.status = p_status)
      and (
            n.k = ''                          -- بحثٌ فارغ = تصفّحٌ لا ترشيح
        or  hay.key ~~ all (n.pats)           -- (أ) كل كلمة — و`~~` هو `LIKE`
        or  hay.glued ~~ n.glued              -- (ب) التصاقاً على غير المجرَّد
      )
  )
  select h.id,
         h.subcontractor_id,
         h.company_name,
         h.company_status,
         h.sheet_id,
         h.sheet_title,
         h.title,
         h.origin_label,
         h.dest_label,
         h.origin_radius_km,
         h.dest_radius_km,
         h.bidirectional,
         h.status,
         h.classes_priced,
         h.min_cost,
         h.max_cost,
         h.created_at,
         count(*) over ()   as total_count
  from hit h
  order by h.company_name asc, h.created_at desc, h.id asc
  limit  greatest(1, least(coalesce(p_limit, 50), 200))
  offset greatest(0, coalesce(p_offset, 0));
$$;

comment on function public.admin_search_routes(text, uuid, text, integer, integer) is
  'بحث المسارات للوحة — بتطبيع 0117 العربي، شاملاً أو داخل متعهد. يُرجع خلاصة الأسعار (عدد الفئات وأدناها وأقصاها) لا صفوفها، وtotal_count نافذةً على المطابق كله. للمشرف وحده.';

revoke all on function public.admin_search_routes(text, uuid, text, integer, integer) from public, anon;
grant execute on function public.admin_search_routes(text, uuid, text, integer, integer) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- (٥) الفحص الذاتي — يحرس **ما كان قائماً** لا ما أضافه هذا الملف (D-58)
-- ----------------------------------------------------------------------------
--
-- ⚠ والنمط ٩ في `LESSONS.md` متجنَّبٌ عمداً: العدُّ يقع على `proname` لا على
--   توقيعٍ لا يُحلّ إلا إلى الدالة المقصودة — فحارسُ «بلا وسيط» يستطيع أن يفشل
--   فعلاً يوم يُضاف وسيط، وهو الفرق بين حارسٍ وزينة.
do $$
declare
  v_n      integer;
  v_acl    text;
  v_cols   integer;
begin
  -- (أ) الأساس المُفوَّض إليه ما زال قائماً بأعمدته التسعة — ولم يُستنسخ.
  --     `proallargtypes` تحمل وسائط الدخل والخرج معاً، والدالة بلا وسيط دخل
  --     ⇒ طولُها هو عددُ أعمدة `returns table` بالضبط.
  select coalesce(array_length(p.proallargtypes, 1), 0) into v_cols
  from pg_proc p
  join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and p.proname = 'admin_partner_availability';
  if v_cols <> 9 then
    raise exception
      '(أ) 🔴 admin_partner_availability لم تعد تُرجع ٩ أعمدة (%) — admin_partner_presence تُفوّض إليها، فراجع التفويض قبل أي شيء',
      v_cols;
  end if;

  -- (ب) دوال التطبيع (0117) موجودة — البحث مبنيٌّ عليها لا على نسخةٍ منها
  if to_regprocedure('public.arabic_search_key(text)') is null then
    raise exception '(ب) 🔴 arabic_search_key غائبة — نفّذ 0117 قبل هذه الهجرة';
  end if;

  -- (ج) نبضةُ الحضور **بلا وسيط**: العدُّ على الاسم كي يستطيع الفحص أن يفشل
  select count(*) into v_n
  from pg_proc p
  join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and p.proname = 'touch_partner_presence';
  if v_n <> 1 then
    raise exception '(ج) 🔴 عدد دوال touch_partner_presence = % — يجب أن تكون واحدة بلا أحمال زائدة', v_n;
  end if;

  select p.pronargs into v_n
  from pg_proc p
  join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and p.proname = 'touch_partner_presence';
  if v_n <> 0 then
    raise exception
      '(ج) 🔴 touch_partner_presence صار لها % وسيطاً — الأمانُ كلُّه في أنها بلا وسيطٍ يُلفَّق', v_n;
  end if;

  -- (د) جدول الظهور بلا منحةٍ لأي دور مستخدم — القاعدة ١٦: اقرأ المنحة لا السياسة
  select coalesce(array_to_string(c.relacl::text[], ' | '), '(بلا منح)')
    into v_acl
  from pg_class c
  join pg_namespace ns on ns.oid = c.relnamespace
  where ns.nspname = 'public' and c.relname = 'partner_presence';
  if v_acl ~ '(anon|authenticated)=' then
    raise exception
      '(د) 🔴 partner_presence مُنح لدور مستخدم (%) — سطحُه دالّتا definer وحدهما', v_acl;
  end if;

  raise notice '✔ 0118: التفويض قائم، والتطبيع مستعمَل لا مستنسَخ، والنبضة بلا وسيط، والجدول بلا منحة';
end;
$$;
