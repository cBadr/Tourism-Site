-- ============================================================================
-- 0093 — علامةٌ بجانب كل وسيلة دفع (البند ١٢)، والعائلةُ تصل مرةً واحدة
--
-- «أحياناً ما تكون الصورة أبلغ وأسرع في توصيل المعلومة من المحتوى النصي»
--                                                          — بدر، 2026-08-17
--
-- وهو محقّ، والسبب أدقّ من «أجمل»: العميل **يتعرّف** على علامة فودافون كاش ولا
-- **يقرأ** اسمها. والصفحة التي كل غرضها أن يدفع لا تملك ثانيةً تُهدر في قراءة.
--
-- ── (أ) 🔴 هل ينطبق عليها مسار م‑٧ غير المترجَم؟ **لا. والقياس هو الحكم.** ────
--
-- السؤال في الموجز: «النمط مبنيٌّ في م‑٧ للعناصر، ويُراجَع هل ينطبق على جدولٍ
-- لا على `items`». والجواب: **لا ينطبق، ولا يحتاج أن ينطبق** — وعمودٌ عاديّ
-- يكفي. ثلاثة قياسات، كلٌّ منها كافٍ وحده:
--
--  (١) **آلية م‑٧ تُعفي أسماءً داخل `sections.content`، لا أعمدةَ جدول.** مقيسٌ
--      من `pg_get_functiondef` الحيّ:
--          i18n_non_text_field(p_key) ⇒ p_key in ('src','poster','video','icon','anchor')
--      ومستهلكها `i18n_reserved_content_key`، ومنادياها `i18n_corpus_rows` و
--      `i18n_apply` — وكلتاهما تمرّان على **محتوى JSONB** للكتل والصفحات
--      والمركبات والخدمات والإعدادات. و`payment_accounts` **ليست كياناً في هذا
--      الفهرس أصلاً**، فلا شيء يفهرس عمودها كي يُعفى منه. الإعفاء هنا حلٌّ
--      لمشكلةٍ غير قائمة.
--
--  (٢) **والجدول خارج خطّ الترجمة سلفاً، مقيساً:** `translations` فيه ١٢٤ صفاً
--      يوم كتابة هذه الهجرة، **ولا صفَّ واحد** مفتاحُه يخصّ حساب دفع؛ و
--      `payment_accounts.label` يُصيَّر كما هو في صفحة الحجز بلا مرور بـ`t`.
--      فعمودٌ **غير نصّي** لا يمكن أن يجرّ الجدول إلى خطٍّ هو خارجه.
--
--  (٣) **وللشكل سابقةٌ في المستودع نفسه:** `vehicle_classes.image_url` عمودُ
--      `text` على جدول، بلا أي آلية i18n، محروسٌ بـ`safeMediaSrc` عند الكتابة
--      (‏`app/admin/fleet/actions.ts`) وعند التصيير (‏`components/site/fleet.tsx`).
--      وقيمه الأربع الحيّة كلها مسارات داخلية (‏`/img/fleet-*.avif`).
--
-- ⇒ **القرار: عمود `image_url text` على `payment_accounts`.** ولا `items` ولا
--   حقلٌ محجوز ولا لمسَ دالتي الفهرس — أرخصُ شكلٍ يفي، وأقلُّه سطحَ انحدار.
--
-- ── (ب) 🔒 والصورة لا تصير باباً لطلبٍ خارجي — **قيدٌ في الجدول لا عُرفٌ في كود**
--
-- «الموقع يصدر صفر طلبات خارجية وهذا يجب أن يبقى.» و`safeMediaSrc` تحرس
-- **التصيير**، لكنها في TypeScript: هجرةٌ قادمة، أو `service_role`، أو سطرُ SQL
-- بيد مشرف، كلها تكتب من تحتها. ولذلك يُفرض الشكل **في القيد**:
--
--      مسارٌ داخلي أو لا شيء. لا نطاق، ولا `//host`، ولا `javascript:`،
--      ولا `data:`، ولا محرف تحكّم، ولا `..`.
--
-- وهو **أضيق مما تقبله `safeMediaSrc`** بقصد: هي تقبل كذلك رابطاً مطلقاً من نطاق
-- Supabase نفسه، والقاعدة لا تعرف نطاقها فلا تستطيع التحقق منه. والأضيق آمنٌ
-- هنا لأنه **داخل** ما يقبله الحارس: فكلُّ ما يُخزَّن يُصيَّر، ولا قيمةً تُحفظ
-- ثم تختفي صامتةً على الموقع (النمط ٣ في `LESSONS`: ميزةٌ لا وجود لها عند مالكها).
-- ولو أراد المالك يوماً رفعاً إلى دلو `media`، فالمسار الداخلي هو ما يُخزَّن
-- والوكيل يقصّه من الرابط — قرارٌ لاحقٌ لا يفتحه هذا القيد.
--
-- ⚠ **ولا تُقاس صحّةُ القيد بقراءته.** الفحص الذاتي أدناه **يحاول الكتابة فعلاً**
--   بسبع قيمٍ خبيثة داخل معاملةٍ تُلغى، ويطلب رفضها واحدةً واحدة (القاعدة ١٩).
--
-- ── (ج) والعائلة تصل الشاشة مرةً واحدة ─────────────────────────────────────
--
-- البند ١١ («تصنيفات طرق الدفع خاطئة») **ليس عيباً في الاشتقاق**: `0070` تشتقّ
-- العائلة في SQL بـ`payment_account_family(kind)` وهي صحيحة ومقيسة. والعيب في
-- **العرض** — وموضعه TypeScript لا SQL، فأُصلح هناك. وما تفعله هذه الهجرة أنها
-- تُسلّم الواجهة ما يكفيها كي لا تستنتج تصنيفاً بنفسها: `family` (موجودة) و
-- `image_url` (تُضاف الآن). التفصيل في `AccountOption`.
--
-- ⚠ **ولا يُنقض ما نزل اليوم:** الظهور يحكمه `active AND customer_facing` وحدهما
--   عبر `payment_account_customer_visible` بلا قائمة أنواع في أي طبقة · وحسابُ
--   البوابة يبقى محجوباً بمُشغّله البنيوي · والحدود تبقى مفروضةً في SQL ·
--   و`attach_receipt` تبقى مفوَّضةً إلى التعريف الواحد بلا حرفٍ يتغيّر فيها.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (١) العمود ومعه القيد — والاثنان في خطوةٍ واحدة كي لا توجد لحظةٌ يُكتب فيها
--     مسارٌ خارجي بلا حارس
-- ----------------------------------------------------------------------------
alter table public.payment_accounts
  add column if not exists image_url text;

comment on column public.payment_accounts.image_url is
  'علامة وسيلة الدفع كما تُعرض للعميل (البند ١٢) — **مسارٌ داخلي أو NULL**. '
  'غيرُ مترجَمة عمداً: صورةٌ لا لغة لها، والجدول خارج فهرس i18n أصلاً (0093 §أ). '
  '🔒 والشكل مفروضٌ بـpayment_accounts_image_internal_chk لا بعُرفٍ في الكود: '
  'الموقع يصدر صفر طلبات خارجية، وعمودٌ حرّ كان سيكون بابها.';

-- والقيد يُعاد بناؤه بلا شرط: `add column if not exists` لا يضمن وجوده على قاعدة
-- طُبّق فيها العمود يدوياً قبل الهجرة.
alter table public.payment_accounts
  drop constraint if exists payment_accounts_image_internal_chk;

alter table public.payment_accounts
  add constraint payment_accounts_image_internal_chk check (
    image_url is null
    or (
      -- مسارٌ بمحتوى: «/» وحدها ليست صورة
      length(image_url) > 1
      -- يبدأ بشرطةٍ واحدة…
      and left(image_url, 1) = '/'
      -- …ولا شرطتين (‏`//evil.com` عنوانٌ بروتوكولُه موروث)
      and left(image_url, 2) <> '//'
      -- …ولا شرطةٍ فمائلةٍ عكسية (يقرؤها بعض المتصفحات كـ`//`)
      and left(image_url, 2) <> ('/' || chr(92))
      -- ولا مخطَّط إطلاقاً: `javascript:` و`data:` و`https:` كلها تحمل نقطتين
      and position(':' in image_url) = 0
      -- ولا محرف تحكّم — قيمةٌ مصنوعة لحقن سمة لا مسارٌ حقيقي
      and image_url !~ '[[:cntrl:]]'
      -- ولا صعودٌ في الشجرة: ليس ثقباً أمنياً (يبقى على الأصل نفسه) لكنه
      -- ليس مساراً يكتبه إنسان يقصد صورة
      and position('..' in image_url) = 0
    )
  );

comment on constraint payment_accounts_image_internal_chk on public.payment_accounts is
  '🔒 صفر طلبات خارجية، مفروضةً في القاعدة: علامة وسيلة الدفع مسارٌ داخلي أو NULL. '
  'أضيق من safeMediaSrc بقصد (لا تعرف القاعدة نطاق Supabase) — وأضيقُها **داخل** '
  'ما يقبله الحارس، فلا قيمة تُحفظ ثم تختفي صامتةً على الموقع.';

-- ----------------------------------------------------------------------------
-- (٢) طريق العميل يحمل العلامة
--
-- تغيير أعمدة الإرجاع يستلزم `drop` (‏`create or replace` يرفضه)، والمنح تُعاد
-- بعده لأن `drop` أسقطها — كما فعلت `0060` ثم `0066` ثم `0070` حرفياً.
--
-- والجسم منقولٌ من `pg_get_functiondef` الحيّ (D-58): الفرق عنه **عمودٌ واحد في
-- الإرجاع وسطرٌ واحد في `select`**، ولا شيء غيره — الترشيح والعمولة والترتيب
-- والحدود كما هي حرفاً بحرف.
--
-- ⚠ **والقائمة البيضاء تبقى قائمة**: `image_url` ليس رقم خزينة ولا حدّاً ولا
--   رصيداً — إنه مسارُ صورةٍ يراه من يفتح الصفحة أصلاً. والفحص الذاتي أدناه يعيد
--   إثبات أن العمود العاشر لم يفتح باباً (‏`PAYMENT_ACCOUNT_FORBIDDEN_COLUMNS`).
-- ----------------------------------------------------------------------------
drop function if exists public.available_payment_accounts(text, numeric);

create function public.available_payment_accounts(
  p_token  text,
  p_amount numeric
)
returns table (
  id                  uuid,
  kind                text,
  family              text,
  label               text,
  handle              text,
  holder_name         text,
  image_url           text,
  fee                 numeric,
  amount_due_with_fee numeric,
  total_with_fee      numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    a.id,
    a.kind,
    public.payment_account_family(a.kind),
    a.label,
    a.handle,
    a.holder_name,
    pa.image_url,
    f.fee,
    round(coalesce(b.amount_due, 0) + f.fee, 2),
    round(coalesce(b.total, 0)      + f.fee, 2)
  from public.bookings b
  cross join public.payment_accounts_within_caps(p_amount) with ordinality as a
  -- 🔒 الوصل بالمعرّف لا نداءٌ ثانٍ للترشيح: `payment_accounts_within_caps` هي
  --    وحدها من تقرّر الظهور (ن‑٩ أ)، وهذا الوصل يقرأ عمود عرضٍ للصفوف التي
  --    أذنت بها سلفاً. و`join` لا `left join` كي لا يظهر صفٌّ حُذف تحتنا.
  join public.payment_accounts pa on pa.id = a.id
  cross join lateral (
    select public.booking_payment_fee(b.trip, a.id) as fee
  ) f
  where p_token is not null
    and length(p_token) >= 32
    and b.public_token = p_token
    and b.status = 'pending_payment'
  order by round(coalesce(b.amount_due, 0) + f.fee, 2) asc, a.ordinality asc;
$$;

comment on function public.available_payment_accounts(text, numeric) is
  'حسابات التحويل للعميل الضيف — مربوطة بتوكن حجز ما زال بانتظار الدفع (0009). '
  'الترشيح من payment_accounts_within_caps، ومعناه في payment_account_customer_visible (ن‑٩ أ). '
  '🔒 والإرجاع قائمة بيضاء: سبعة أعمدة عرضٍ (منها family المشتقّة من kind، و image_url '
  'علامةُ الوسيلة — 0093) + ثلاثة أرقام فاتورةٍ يراها العميل قبل التحويل، وبلا أي رقم خزينة. '
  'والترتيب بالأرخص أولاً ثم بترتيب اللوحة (ن‑٩ ب-٤).';

revoke all    on function public.available_payment_accounts(text, numeric)
  from public, anon, authenticated;
grant execute on function public.available_payment_accounts(text, numeric) to anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.available_payment_accounts(text, numeric) to service_role';
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- (٣) الفحص الذاتي — **بنداءٍ حيّ وبمحاولةِ كتابةٍ فعلية** (القاعدة ١٩)
--
-- وكلّه داخل كتلةٍ تُلغى: لا صفَّ بيانات لبدر يُمسّ.
-- ----------------------------------------------------------------------------
do $$
declare
  v_names  text[];
  v_acc    constant uuid := '7a000000-0000-4000-8000-00000000093a';
  v_token  text;
  v_bad    text;
  v_ok     boolean;
  v_got    text;
  -- سبعُ قيمٍ لا يجوز أن تُخزَّن، وكلٌّ منها بابُ طلبٍ خارجي أو حقنِ سمة
  v_evil   constant text[] := array[
    'https://evil.com/logo.png',        -- نطاق صريح
    'http://evil.com/logo.png',         -- وبلا تشفير
    '//evil.com/logo.png',              -- بروتوكولٌ موروث — يُطلب فعلاً من المتصفح
    'javascript:alert(1)',              -- مخطَّطٌ تنفيذي
    'data:image/svg+xml;base64,AAAA',   -- حمولةٌ مضمَّنة (وSVG يحمل سكربتاً)
    '/img/../../etc/passwd',            -- صعودٌ في الشجرة
    '/'                                 -- شرطةٌ بلا مسار
  ];
begin
  -- (٣-١) الأعمدة: العلامة دخلت، ولا رقم خزينة دخل معها
  select coalesce(p.proargnames, '{}') into v_names
  from pg_proc p
  where p.oid = 'public.available_payment_accounts(text, numeric)'::regprocedure;

  if v_names && array['daily_headroom', 'monthly_headroom', 'opening_balance',
                      'daily_cap', 'monthly_cap', 'sort', 'active'] then
    raise exception '0093: طريق الزائر عاد يحمل عمود خزينة — القائمة البيضاء مثقوبة';
  end if;
  if not (v_names @> array['id', 'kind', 'family', 'label', 'handle', 'holder_name',
                           'image_url', 'fee', 'amount_due_with_fee', 'total_with_fee']) then
    raise exception '0093: طريق الزائر ينقصه عمود تحتاجه صفحة التحويل (منها image_url)';
  end if;

  begin
    insert into public.payment_accounts
      (id, kind, label, handle, holder_name, opening_balance, active, sort, customer_facing)
    values
      (v_acc, 'wallet', 'فحص ذاتي 0093', 'MIG0093-MARK', 'فحص', 0, true, 930, true);

    -- (٣-٢) 🔒 القيد يرفض كل قيمةٍ خبيثة — **بمحاولة كتابةٍ لكلٍّ منها**
    foreach v_bad in array v_evil loop
      v_ok := false;
      begin
        update public.payment_accounts set image_url = v_bad where id = v_acc;
      exception
        when check_violation then v_ok := true;
      end;
      if not v_ok then
        select pa.image_url into v_got from public.payment_accounts pa where pa.id = v_acc;
        raise exception
          '0093: 🔴 قُبلت علامةٌ لا يجوز تخزينها (%) — الموقع يصدر طلباً خارجياً، والمخزَّن الآن %',
          v_bad, coalesce(v_got, 'NULL');
      end if;
    end loop;

    -- (٣-٣) والمقبول مقبول — قيدٌ يرفض كل شيء ليس قيداً بل عطلاً
    update public.payment_accounts set image_url = '/img/pay-vodafone-cash.avif' where id = v_acc;
    if (select pa.image_url from public.payment_accounts pa where pa.id = v_acc)
       is distinct from '/img/pay-vodafone-cash.avif' then
      raise exception '0093: مسارٌ داخليٌّ سليم لم يُخزَّن — لا علامة تصل الشاشة';
    end if;

    -- و«بلا علامة» قرارٌ صالح: البطاقة تعود إلى أيقونتها
    update public.payment_accounts set image_url = null where id = v_acc;
    if (select pa.image_url from public.payment_accounts pa where pa.id = v_acc) is not null then
      raise exception '0093: تعذّر إفراغ العلامة — المالك لا يستطيع حذف صورة';
    end if;

    -- (٣-٤) والعمود يصل طريق العميل فعلاً — بنداءٍ حيّ على حجزٍ بانتظار الدفع
    update public.payment_accounts set image_url = '/img/pay-vodafone-cash.avif' where id = v_acc;

    insert into public.bookings
      (status, class_slug, class_title, total, currency, plan,
       amount_due, amount_remaining, customer_name, customer_phone, trip)
    values
      ('pending_payment', 'mig0093', 'MIG0093', 1000, 'EGP', 'full',
       1000, 0, 'فحص ذاتي 0093', '01000000093', '{}'::jsonb)
    returning public_token into v_token;

    if not exists (
      select 1 from public.available_payment_accounts(v_token, 1000) a
      where a.id = v_acc and a.image_url = '/img/pay-vodafone-cash.avif'
    ) then
      raise exception
        '0093: العلامة لا تصل صفحة التحويل — العمود أُضيف والدالة لا تحمله';
    end if;

    -- والعائلة ما زالت تصل معها (ب-٢ لم تُنقض بتوسيع الإرجاع)
    if (select a.family from public.available_payment_accounts(v_token, 1000) a where a.id = v_acc)
       is distinct from public.payment_account_family('wallet') then
      raise exception '0093: العائلة انحرفت عن اشتقاق القاعدة — تجميع الشاشة بلا مصدر';
    end if;

    -- 🔒 والظهور ما زال محكوماً بالمفتاحين وحدهما — لا العلامة شرطٌ فيه
    update public.payment_accounts set customer_facing = false where id = v_acc;
    if exists (select 1 from public.available_payment_accounts(v_token, 1000) a where a.id = v_acc) then
      raise exception '0093: حسابٌ customer_facing = false ظهر — 0070 انتُقضت';
    end if;

    raise exception 'MIG0093_ROLLBACK';
  exception
    when others then
      if sqlerrm <> 'MIG0093_ROLLBACK' then raise; end if;
  end;

  -- (٣-٥) والمنح كما كانت
  if not has_function_privilege('anon', 'public.available_payment_accounts(text, numeric)', 'EXECUTE') then
    raise exception '0093: anon فقد EXECUTE على غلاف التوكن — صفحة التحويل تفرغ';
  end if;
  if has_function_privilege('anon', 'public.available_payment_accounts(numeric)', 'EXECUTE') then
    raise exception '0093: anon كسب EXECUTE على الغلاف الإداري — أرقام الخزينة مكشوفة';
  end if;
  if has_function_privilege('anon', 'public.payment_accounts_within_caps(numeric)', 'EXECUTE') then
    raise exception '0093: anon كسب EXECUTE على قائمة الحدود — متسعُ الحدّ اليومي مكشوف';
  end if;

  raise notice
    '✔ 0093: علامةٌ لكل وسيلة، مسارٌ داخليٌّ مفروضٌ بقيدٍ يرفض سبع قيمٍ خبيثة، والظهور كما كان';
end $$;
