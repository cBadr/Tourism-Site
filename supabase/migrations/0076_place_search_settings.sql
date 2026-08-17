-- ============================================================================
-- 0076_place_search_settings.sql — من لا يجد مكانه يغادر، ولا نعرف كم غادروا
--
-- حقلا الانطلاق والوصول يقبلان **ما يرجعه البحث وحده**، ومزوّده اليوم
-- Nominatim (OpenStreetMap) — مجاني ومقيَّد بمصر وبالعربية ومكاشٌ في
-- `geocode_cache`. وتغطية OSM في مصر رقيقة: القرى والكمبوندات والفنادق
-- والأسماء الدارجة. فمن لا يجد مكانه **لا يملك أن يكتبه**، والقمع لا يقيس
-- المغادرين.
--
-- والعلاج بحثٌ رباعي الطبقات، على شكل محرّك المسافات نفسه (D-13):
--
--     Google Places  →  Nominatim  →  «حدّد على الخريطة»  →  «اطلب عرض سعر»
--
-- وهذه الهجرة **لا تبني البحث** — تبني ما يحكمه: صفٌّ واحد من الإعدادات
-- يملكه المالك، فيطفئ جوجل حين تقفز الفوترة **بلا نشر**، ويبدّل الترتيب،
-- ويضبط ضابطَي التكلفة (أقل عدد حروف · تأجيل النداء).
--
-- ── 🔒 ما يجعل هذه الهجرة آمنة وحدها ────────────────────────────────────
--
-- **الافتراضيات تُعيد سلوك اليوم حرفياً**: `google_enabled = false`،
-- والأساسي `nominatim`، و`min_query_chars = 2` و`debounce_ms = 350` — وهما
-- بعينهما `MIN_QUERY_LENGTH` و`DEBOUNCE_MS` المحفوران في
-- `components/booking/search-widget.tsx`. فتطبيقها لا يغيّر نداءً واحداً ولا
-- يكلّف مليماً، ولا يلمس سعراً ولا حجزاً قائماً.
--
-- ⚠ ومخرجا الطبقتين الثالثة والرابعة (`map_picker_enabled` ·
-- `quote_fallback_enabled`) **يُشحنان مفعّلين**، ولا يناقض ذلك القاعدة أعلاه:
-- نمط الفشل ٧ في `handover/LESSONS.md` يمنع شحنَ ما **يرفض أو يلغي طلباً
-- حقيقياً** مفعّلاً (‏`unpaid_cancel_enabled` · `ALLOW_TEST_PAYMENTS`)، وهذان
-- عكسه تماماً: مخرجان مجانيان **يُنقذان** طلباً كان سيُفقد، بلا مزوّدٍ مدفوع
-- وبلا أثرٍ على أي سعر. وإطفاؤهما يعيد العطل الذي وُلد هذا العمل لعلاجه.
--
-- ── ⚠ ولماذا جدولٌ مستقل لا أعمدة في `trip_settings` ────────────────────
--
-- ثلاثة أسباب، أوّلها تشغيلي: `trip_settings` **تحت يد عملٍ متزامن** (هجرة
-- 0075 أضافت `time_zone` إليها)، وإضافةُ أعمدةٍ إلى جدولٍ يعدّله غيرك الآن
-- تصادمٌ مضمون. والثاني موضوعي: `trip_settings` سياسةُ **رحلة** (مهلة، إلغاء،
-- منطقة زمنية)، وهذه سياسةُ **مزوّدٍ خارجي وتكلفته**. والثالث أن `site_settings`
-- مقروء لـ`anon` — وترتيبُ مزوّدينا وضوابط تكلفتنا شأنٌ داخلي.
--
-- ── 🔴 والمفتاح لا يدخل هذا الجدول أبداً ────────────────────────────────
--
-- `GOOGLE_MAPS_API_KEY` يبقى في البيئة (اتفاقية §٣: «الأسرار في البيئة،
-- الوجهات في اللوحة»، وD-30 حرفياً). ما يملكه هذا الجدول **هل يُستعمل جوجل**
-- لا **ما هو مفتاحه**. وحقلُ مفتاحٍ في اللوحة يضعه في نطاق أي ثغرة قراءة.
--
-- المرجع: `lib/place-search-types.ts` (العقد) · 0027 (نمط جدول الإعدادات
--         الوحيد الصف + سياساته) · 0013 (‏`dispatch_config` — قارئٌ غير ممنوح
--         لـ`authenticated`) · D-05 · D-13 · D-30 · D-48.
-- الاختبار: supabase/tests/place_search_tests.sql
-- آمنة لإعادة التنفيذ بالكامل.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (١) الجدول — صفٌّ واحد، وكل حدٍّ مفروضٌ هنا لا في النموذج
--
-- 🔒 **القيود في القاعدة لا في الفورم** (أمر المالك صراحةً): نموذج اللوحة
-- طبقةُ لطفٍ تمنع الإرسال الخاطئ؛ والحارس الوحيد الذي لا يُلتف عليه هو
-- `check` — يرتدّ عنه نداءٌ بمفتاح الخدمة، وسكربتٌ يدوي، وطلبٌ مصنوع.
--
-- وحدّا `min_query_chars`: الأرضية ٢ لأن حرفاً واحداً يعني نداءً على كل ضغطة
-- مفتاح تقريباً (وهو ما يُراد منعه)، والسقف ٦ **صمّام أمان**: من يكتب ٢٠
-- يمنع البحث عن «مصر» و«الجيزة» ويظنّ الميزة معطّلة.
--
-- وحدّا `debounce_ms`: ١٥٠ أرضيةٌ دون إحساس الكتابة المتصلة، و٢٠٠٠ سقفٌ
-- يبقى محتمَلاً — ثانيتان بعد آخر حرف حدُّ ما يحتمله زائر.
-- ----------------------------------------------------------------------------
create table if not exists public.place_search_settings (
  id                     boolean primary key default true check (id),

  -- مفتاح القطع: إطفاؤه يُعيد سلوك اليوم فوراً بلا نشر
  google_enabled         boolean not null default false,

  -- من يُسأل أولاً؛ والآخر ارتدادٌ له
  primary_provider       text    not null default 'nominatim'
                         check (primary_provider in ('google', 'nominatim')),

  -- الطبقة الثالثة: العميل يُسقط دبوساً فيحصل على إحداثيات أدقّ من أي بحث
  map_picker_enabled     boolean not null default true,

  -- الطبقة الرابعة: يغادر بطلبٍ لا يغادر الموقع
  quote_fallback_enabled boolean not null default true,

  -- ضابطا تكلفة — كلاهما يقلّل عدد نداءات المزوّد المدفوع
  min_query_chars        integer not null default 2
                         check (min_query_chars between 2 and 6),
  debounce_ms            integer not null default 350
                         check (debounce_ms between 150 and 2000),

  updated_at             timestamptz not null default now()
);

insert into public.place_search_settings (id) values (true) on conflict (id) do nothing;

drop trigger if exists place_search_settings_touch_updated_at on public.place_search_settings;
create trigger place_search_settings_touch_updated_at
  before update on public.place_search_settings
  for each row execute function public.touch_updated_at();

comment on table public.place_search_settings is
  'إعدادات بحث الأماكن — صف وحيد. المصدر: PlaceSearchSettings في lib/place-search-types.ts. جدول مستقل عن trip_settings (سياسة مزوّد وتكلفة لا سياسة رحلة) وعن site_settings (المقروء لـ anon).';

comment on column public.place_search_settings.google_enabled is
  'مفتاح قطع: يطفئه المالك حين تقفز الفوترة بلا نشر. مطفأ بالبذرة = سلوك اليوم حرفياً.';

comment on column public.place_search_settings.primary_provider is
  'من يُسأل أولاً. جوجل لا يُسأل إطلاقاً ما دام google_enabled = false، مهما كانت قيمة هذا العمود.';

comment on column public.place_search_settings.min_query_chars is
  'ضابط تكلفة: أقل عدد حروف قبل أول نداء. السقف ٦ صمّام أمان — رقم أكبر يمنع البحث عن «مصر» ويبدو للمالك عطلاً.';

comment on column public.place_search_settings.debounce_ms is
  'ضابط تكلفة: تأجيل النداء بعد آخر ضغطة مفتاح. مع رمز الجلسة يخفّض عدد النداءات لا عدد وحدات الفوترة.';

-- ----------------------------------------------------------------------------
-- (٢) الصلاحيات والسياسات — نمط `trip_settings` في 0027 حرفياً
--
-- السحب أولاً: Supabase تمنح الأدوار العامة صلاحيات واسعة افتراضياً على
-- الجداول الجديدة — منها TRUNCATE **وهي لا تخضع لـ RLS إطلاقاً**.
-- ----------------------------------------------------------------------------
alter table public.place_search_settings enable row level security;

revoke all on public.place_search_settings from public, anon, authenticated;

-- لا منح لـ anon — ولا حتى select. وكل متعهد مستخدم `authenticated`، فالسياسات
-- أدناه تشترط `is_admin()` في المسارات الأربعة.
grant select, insert, update, delete on public.place_search_settings to authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant select, insert, update, delete on public.place_search_settings to service_role';
  end if;
end;
$$;

drop policy if exists "place_search_settings_select_admin" on public.place_search_settings;
create policy "place_search_settings_select_admin"
  on public.place_search_settings
  for select
  to authenticated
  using (public.is_admin());

drop policy if exists "place_search_settings_insert_admin" on public.place_search_settings;
create policy "place_search_settings_insert_admin"
  on public.place_search_settings
  for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists "place_search_settings_update_admin" on public.place_search_settings;
create policy "place_search_settings_update_admin"
  on public.place_search_settings
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "place_search_settings_delete_admin" on public.place_search_settings;
create policy "place_search_settings_delete_admin"
  on public.place_search_settings
  for delete
  to authenticated
  using (public.is_admin());

-- ----------------------------------------------------------------------------
-- (٣) القارئ المتسامح — يرجع صفاً واحداً حتى على قاعدة لم تُبذر
--
-- التدهور الرشيق: بلا صفٍّ تعمل القيم الافتراضية من العقد
-- (`PLACE_SEARCH_DEFAULTS` في `lib/place-search-types.ts`) — وهي **نفس** هذه
-- القيم حرفاً بحرف. فمسار «الجدول فارغ» لا يفتح جوجل ولا يغيّر ضابط تكلفة.
--
-- ⚠ ولا منح لـ`authenticated`: نظيرتاها `trip_config()` و`dispatch_config()`
-- غير ممنوحتين لأحد، وكل متعهد مستخدم `authenticated`. والمشرف لا يحتاجها —
-- يقرأ الجدول مباشرةً عبر RLS. والمسار العام يناديها بمفتاح الخدمة.
-- ----------------------------------------------------------------------------
create or replace function public.place_search_config()
returns table (
  google_enabled         boolean,
  primary_provider       text,
  map_picker_enabled     boolean,
  quote_fallback_enabled boolean,
  min_query_chars        integer,
  debounce_ms            integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce(s.google_enabled, false),
    coalesce(s.primary_provider, 'nominatim'),
    coalesce(s.map_picker_enabled, true),
    coalesce(s.quote_fallback_enabled, true),
    coalesce(s.min_query_chars, 2),
    coalesce(s.debounce_ms, 350)
  from (select 1) one
  left join public.place_search_settings s on s.id;
$$;

revoke all on function public.place_search_config() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.place_search_config() to service_role';
  end if;
end;
$$;

comment on function public.place_search_config() is
  'قارئ إعدادات بحث الأماكن — يرجع صفاً واحداً دائماً (left join على صف وحيد) فلا ينكسر مستهلكه على قاعدة لم تُبذر. غير ممنوحة لـ authenticated: المتعهد authenticated ولا شأن له بسياسة مزوّدينا.';

-- ----------------------------------------------------------------------------
-- (٤) فحصٌ ذاتي — **يحرس ما يجب أن يبقى، لا ما أضافته هذه الهجرة** (D-58)
--
-- درسُ D-58: «فحصٌ يتحقق مما أضفتَه لا مما كسرتَه ليس حارساً». فالمفحوص هنا
-- ثلاثة، كلها **ثوابت يجب أن تصمد** لا ميزاتٌ جديدة:
--
--   (أ) الافتراضيات تساوي سلوك اليوم — لو انزلق `google_enabled` إلى `true`
--       في تعديلٍ لاحق لصارت كل نسخة Whitelabel تُفوتر من أول يوم بلا قرار.
--   (ب) القيود حيّة فعلاً — لا مجرد أعمدة بأسماء صحيحة. وهذا ما يُثبت
--       بمحاولة كتابةٍ خارج المدى ترتدّ (المحاولة في مجموعة الاختبار).
--   (ج) `anon` لا يملك شيئاً على الجدول — بندٌ يسقط بصمت لو نُسي `revoke`.
-- ----------------------------------------------------------------------------
do $$
declare
  v_google   boolean;
  v_provider text;
  v_chars    integer;
  v_debounce integer;
  v_anon     integer;
  v_checks   integer;
begin
  select google_enabled, primary_provider, min_query_chars, debounce_ms
    into v_google, v_provider, v_chars, v_debounce
    from public.place_search_config();

  -- (أ) الافتراضيات = سلوك اليوم
  if v_google is not false or v_provider <> 'nominatim' or v_chars <> 2 or v_debounce <> 350 then
    raise exception
      'فحص 0076 (أ): الافتراضيات لم تعد تُعيد سلوك اليوم — google=% provider=% chars=% debounce=%',
      v_google, v_provider, v_chars, v_debounce;
  end if;

  -- (ب) القيود الثلاثة موجودة بالاسم (والحياة تُثبتها مجموعة الاختبار بمحاولة كتابة)
  select count(*) into v_checks
    from pg_constraint
   where conrelid = 'public.place_search_settings'::regclass
     and contype  = 'c'
     and conname in (
       'place_search_settings_primary_provider_check',
       'place_search_settings_min_query_chars_check',
       'place_search_settings_debounce_ms_check'
     );
  if v_checks <> 3 then
    raise exception 'فحص 0076 (ب): قيود الحدود ناقصة — الموجود % من ٣', v_checks;
  end if;

  -- (ج) anon بلا أي صلاحية على الجدول
  select count(*) into v_anon
    from information_schema.role_table_grants
   where table_schema = 'public'
     and table_name   = 'place_search_settings'
     and grantee      = 'anon';
  if v_anon > 0 then
    raise exception 'فحص 0076 (ج): anon يملك % صلاحية على place_search_settings', v_anon;
  end if;
end;
$$;
