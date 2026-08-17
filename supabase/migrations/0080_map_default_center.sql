-- ============================================================================
-- 0080_map_default_center.sql — مرساةُ الخريطة إعدادُ مالكٍ لا ثابتٌ في مكوّن
--
-- ── ما كان قائماً قبل هذا الملف ─────────────────────────────────────────────
--
--   `components/booking/map-picker.tsx:44`
--     const CAIRO_CENTER = { lat: 30.0444, lng: 31.2357 } as const;
--
-- ثابتٌ **في مكوّن واجهة**، وهو ميدان التحرير لا مطار القاهرة. وقرار المالك
-- (2026-08-17) شقّان: «النقطة الرئيسية عند طلب تسعير بلا وجهة معيّنة هي **مطار
-- القاهرة**»، و«لا تُثبَّت الإحداثيات في مكوّن».
--
-- والشقّ الثاني هو الأهم وليس ذوقاً: **المرحلة ١٤ (مصنع الـWhitelabel، D-01)**
-- تُطلق نسخةً بتعديل بياناتٍ لا بتعديل كود. ونسخةٌ في أسوان أو في الرياض بمركزٍ
-- محفورٍ في مكوّن تعني **تفريع كودٍ لكل علامة** — وهو بعينه ما منعته 0075 حين
-- أخرجت `Africa/Cairo` من الكود.
--
-- ── ولماذا `place_search_settings` لا `trip_settings` ───────────────────────
--
-- بنفس منطق 0076 حين رفضت أن تسكن في `trip_settings`: هذه **سياسة خريطةٍ وبحثٍ
-- عن مكان**، لا سياسة رحلة. ومستهلكها الوحيد هو منتقي الخريطة الذي تحكمه بقية
-- أعمدة هذا الجدول (‏`map_picker_enabled`)، فمفتاحُ تشغيله ومرساتُه في صفٍّ
-- واحد يُقرأ بنداءٍ واحد. و`site_settings` مستبعدٌ لأنه مقروءٌ لـ`anon`.
--
-- ── 🔴 والقيد هو **حدُّ منطقة الخدمة نفسه، لا حدٌّ ثانٍ** ───────────────────
--
-- «نطاق التشغيل داخل مصر فقط» (المالك، 2026-08-17). والحدُّ **موجودٌ سلفاً**
-- ولا يُعاد تعريفه: `SERVICE_BOUNDS` في `lib/place-search-types.ts` — صندوقٌ
-- سخيٌّ حول مصر (٢٠–٣٤ عرضاً، ٢٣–٣٨ طولاً) تقرؤه اليوم `isWithinServiceArea`
-- في `/api/geocode/reverse` (رمز `out-of-area`) وتقرؤه الخريطة نفسها في
-- `place-field.tsx`. فقيدُ `check` أدناه **نسخةٌ من نفس الأرقام في الطبقة
-- التي تملك الفرض**، لا تعريفٌ منافس: تعريفان لـ«مصر» يختلفان يوماً، والخلاف
-- يكون حجزاً سُعِّر لمسارٍ لا نخدمه.
--
-- ⚠ ولمَ يُكتب الصندوق مرتين إذاً؟ لأن الجدول يُحرَّر من محرّر SQL ومن PostgREST
-- بجلسة مشرف، فحارسٌ في TypeScript وحده ليس حارساً (سابقة 0014 و0027 و0045
-- و0075). والقاعدة أن **يُكتب الرقم حيث يُفرض**، وأن يقول التعليق من أين جاء.
--
-- ── ⚠ ومركزٌ افتراضي **ليس قيمةً افتراضية** ─────────────────────────────────
--
-- خريطةٌ تفتح على مطار القاهرة يجب ألا تعني أن الحجز يحمل مطار القاهرة مبدأً.
-- والفصل قائمٌ بنيوياً في المنتقي ولا يُبنى هنا: `MapPicker` لا يستدعي `onPick`
-- إلا من زرّ «تأكيد هذا الموقع»، ولا شيء يُكتب في الحقل قبله. فهذه الهجرة تحرّك
-- **أين تفتح النافذة**، ولا تلمس **متى تُثبَّت قيمة** بحرف.
--
-- المرجع: 0076 (الجدول و`place_search_config()`) · 0075 (سابقة إخراج ثابتٍ
--         تشغيلي من الكود إلى إعدادٍ للمالك) · `lib/place-search-types.ts`
--         (`SERVICE_BOUNDS` · `isWithinServiceArea`) · D-01 · D-04.
-- الاختبار: supabase/tests/place_search_tests.sql القسم (و)
-- آمنة لإعادة التنفيذ بالكامل.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (١) العمودان — مطار القاهرة افتراضاً
--
-- 30.1219, 31.4056 ≈ صالات مطار القاهرة الدولي. وهو **حيث يبدأ أكثر عمل
-- المالك**، فالخريطة الفارغة تفتح هناك لا على منظر دولةٍ ولا على مركزٍ مخمَّن.
-- ----------------------------------------------------------------------------
alter table public.place_search_settings
  add column if not exists default_center_lat numeric(9, 6) not null default 30.121900,
  add column if not exists default_center_lng numeric(9, 6) not null default 31.405600;

-- ⚠ الأرقام هي `SERVICE_BOUNDS` حرفاً بحرف — من غيّر أحدهما يغيّر الآخر.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.place_search_settings'::regclass
      and conname  = 'place_search_settings_center_in_service_area'
  ) then
    alter table public.place_search_settings
      add constraint place_search_settings_center_in_service_area
      check (
        default_center_lat between 20 and 34
        and default_center_lng between 23 and 38
      );
  end if;
end;
$$;

comment on column public.place_search_settings.default_center_lat is
  'خط عرض المرساة التي تفتح عندها خريطة اختيار المكان حين لا وجهة بعد — مطار القاهرة افتراضاً. مقيَّد داخل صندوق منطقة الخدمة (SERVICE_BOUNDS في lib/place-search-types.ts) فلا يُضبط مركزٌ خارج ما نخدمه. ⚠ ومركزُ فتحٍ ليس قيمةً: لا يُثبَّت في الحجز إلا بضغط «تأكيد هذا الموقع».';

comment on column public.place_search_settings.default_center_lng is
  'خط طول المرساة — انظر تعليق default_center_lat.';

-- ----------------------------------------------------------------------------
-- (٢) `place_search_config()` — عمودان جديدان
--
-- ⚠ `create or replace` **لا تقبل** تغيير نوع الإرجاع فالإسقاط لازم (سابقة
-- 0067 مع `trip_config()`). والمنح يُعاد كما كان بالضبط: الإسقاط يمحو
-- `revoke`/`grant` معاً، فالسكوت عنهما يُعيد الدالة إلى منح Postgres الافتراضي
-- (‏`public` تنفّذ) — أي أن كل متعهد يقرأ سياسة مزوّدينا. الفحص (٣-ج) يمسك ذلك.
--
-- والأعمدة الستة الأولى **بترتيبها الأصلي**: قارئ 0076
-- (`lib/geo/place-search-settings.ts`) يقرأ بالاسم لا بالموضع، لكن ترتيباً
-- مستقراً يجعل الفارق في أي مراجعة قادمة سطراً مضافاً لا جدولاً مُعاد ترتيبه.
-- ----------------------------------------------------------------------------
drop function if exists public.place_search_config();

create function public.place_search_config()
returns table (
  google_enabled         boolean,
  primary_provider       text,
  map_picker_enabled     boolean,
  quote_fallback_enabled boolean,
  min_query_chars        integer,
  debounce_ms            integer,
  default_center_lat     numeric,
  default_center_lng     numeric
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    coalesce(s.google_enabled, false),
    coalesce(s.primary_provider, 'nominatim'),
    coalesce(s.map_picker_enabled, true),
    coalesce(s.quote_fallback_enabled, true),
    coalesce(s.min_query_chars, 2),
    coalesce(s.debounce_ms, 350),
    coalesce(s.default_center_lat, 30.121900),
    coalesce(s.default_center_lng, 31.405600)
  from (select 1) one
  left join public.place_search_settings s on s.id;
$function$;

revoke all on function public.place_search_config() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.place_search_config() to service_role';
  end if;
end;
$$;

comment on function public.place_search_config() is
  'قارئ إعدادات بحث الأماكن — يرجع صفاً واحداً دائماً (left join على صف وحيد) فلا ينكسر مستهلكه على قاعدة لم تُبذر. ثمانية أعمدة منذ 0080 (مرساة الخريطة). غير ممنوحة لـ authenticated: المتعهد authenticated ولا شأن له بسياسة مزوّدينا.';

-- ----------------------------------------------------------------------------
-- (٣) فحوص ذاتية
-- ----------------------------------------------------------------------------

-- (٣-أ) الافتراضي مطار القاهرة — لا ميدان التحرير ولا مركزٌ مخمَّن
do $$
declare
  v_lat numeric;
  v_lng numeric;
begin
  select c.default_center_lat, c.default_center_lng
    into v_lat, v_lng
  from public.place_search_config() c;

  if v_lat is null or v_lng is null then
    raise exception '0080 (٣-أ): place_search_config لا تُرجع المرساة';
  end if;
  -- ضمن ٥ كم من صالات المطار — لا مساواةٌ حرفية: للمالك أن يزحزحها من اللوحة
  -- على قاعدةٍ قائمة، وفحصُ المساواة كان سيسقط هجرةً بسبب قرارٍ مشروع له.
  if abs(v_lat - 30.1219) > 0.05 or abs(v_lng - 31.4056) > 0.05 then
    raise exception
      '0080 (٣-أ): المرساة (%، %) ليست مطار القاهرة ولا قريبةً منه', v_lat, v_lng;
  end if;
end;
$$;

-- (٣-ب) القيد حيٌّ — بمحاولةٍ خارج مصر ترتدّ، ومعها شاهدٌ موجب داخلها
--
-- ⚠ **والقياس كله داخل معاملةٍ فرعية تُرجَع**، لا بكتابةٍ ثم «إعادةٍ إلى
--   الافتراضي»: إعادةُ الافتراضي على قاعدةٍ زحزح فيها المالك المرساة بنفسه
--   **تمحو قراره** — وهو ما تمنعه أوامره الدائمة (§٣). فالتراجع يعيد ما كان
--   أيّاً كان، ولا يحتاج هذا الملف أن يعرفه أصلاً.
do $$
declare
  v_state text;
begin
  begin
    v_state := null;
    begin
      -- روما: خارج الصندوق طولاً وعرضاً معاً
      update public.place_search_settings
         set default_center_lat = 41.9028, default_center_lng = 12.4964
       where id;
      v_state := '(قُبلت)';
    exception when others then
      get stacked diagnostics v_state = returned_sqlstate;
    end;

    if v_state <> '23514' then
      raise exception
        '0080 (٣-ب): مركزٌ في روما انتهى بـ«%» لا 23514 — القيد غائب، والحدّ يقول «مصر فقط»',
        v_state;
    end if;

    -- شاهدٌ موجب: نقطةٌ داخل مصر تمرّ، وإلا كان الرفض رفضاً لكل شيء
    update public.place_search_settings
       set default_center_lat = 31.2001, default_center_lng = 29.9187
     where id;

    raise exception '0080_PROBE_ROLLBACK';
  exception
    when others then
      if sqlerrm <> '0080_PROBE_ROLLBACK' then raise; end if;
  end;
end;
$$;

-- (٣-ج) المنح بعد الإسقاط — لم ينفتح شيء
do $$
begin
  if has_function_privilege('anon', 'public.place_search_config()', 'execute')
     or has_function_privilege('authenticated', 'public.place_search_config()', 'execute') then
    raise exception
      '0080 (٣-ج): place_search_config انفتحت لدورٍ عام بعد إعادة إنشائها — السطر revoke حمّال';
  end if;
end;
$$;
