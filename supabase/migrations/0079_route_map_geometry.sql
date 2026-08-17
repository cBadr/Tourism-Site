-- ============================================================================
-- 0079_route_map_geometry.sql — الصورة تعرف بأي هندسةٍ رُسمت، فيصدق نصُّها
--
-- ── 🔴 لماذا هذا العمود ليس بياناً وصفياً ─────────────────────────────────────
--
-- 0078 رسمت **خطاً مستقيماً** بين النقطتين. وملاحظة المالك (2026-08-17) أن ذلك
-- غير منطقي — **وهي أعمق من ملاحظةٍ شكلية**: السعر مشتقٌّ من **مسافة طريق**
-- (‏`lib/geo/route.ts` ← `distance_km`)، فخطٌّ مستقيمٌ يعبر النيل أو الصحراء
-- **يرسم مسافةً غير التي سُعِّرت**. الصورة والسعر يجب أن يصفا الطريق نفسه.
--
-- والهندسة قد تتوفّر وقد لا تتوفّر (مزوّد الهندسة قد يسقط، والرحلة قد تكون بين
-- نقطتين بلا طريق بينهما). فالخيار بين ثلاثة:
--
--   ١. رسمُ خطٍّ مستقيم و**قولُ إنه مسار قيادة** ⇒ ادّعاءٌ كاذب في صورة.
--   ٢. رفضُ الصورة كلها عند غياب الهندسة ⇒ خسارةُ ميزةٍ لأجل حالةٍ نادرة.
--   ٣. **رسمُه ووسمُه تقريبياً** ⇒ صورةٌ تقول عن نفسها ما هي.
--
-- والثالث هو المختار، **وشرطُ صدقه أن يعرف نصُّ الصفحة أيَّ الحالتين وقعت** —
-- ولا سبيل إلى ذلك إلا أن يُخزَّن مع الصورة. فالعمود شرطٌ في الصدق لا وصفٌ لها.
--
-- ── ومن أين تأتي الهندسة اليوم، وما لا يُفعل ────────────────────────────────
--
-- جُرد المتاح قبل إضافة أي نداء (بأمر المالك «تحقّق مما تملكه قبل أن تدفع»):
--
--   • `lib/geo/route.ts` تنادي Google Routes بـ
--     `X-Goog-FieldMask: routes.distanceMeters,routes.duration` — **بلا
--     `routes.polyline.encodedPolyline`**. أي أن الهندسة **لا تصلنا اليوم**.
--   • ونداء OSRM فيها بـ`overview=false` — أي أنها تُسقط الهندسة صراحةً كذلك.
--   • و`distance_cache` **بلا عمود هندسة أصلاً** (تسعة أعمدة، مقروءةٌ من
--     `information_schema` لا من ملفّ هجرة).
--
-- ⚠ **ولا عمود هندسةٍ يُضاف إلى `distance_cache` هنا**: عمودٌ لا يكتبه أحد
--   دَينٌ لا أصل. وإضافة `routes.polyline.encodedPolyline` إلى نفس نداء Google
--   **مجّانية** (نفس طلبٍ ونفس شريحة تسعير)، وهي التحسين الصحيح — لكنها تقع في
--   `lib/geo/route.ts` **وهو ملفٌّ يعمل عليه وكيلٌ آخر في هذه الجلسة**. فتُرفع
--   توصيةً ولا تُنفَّذ بيدين على ملفٍّ واحد.
--
-- والمصدر المستعمل الآن **OSRM** بـ`overview=simplified&geometries=polyline`:
-- مجانيٌّ بلا مفتاح، **وصفرُ نداءٍ مدفوعٍ جديد**، وهو أصلاً طبقة التوجيه
-- المجانية في هذا المشروع (‏D-13). والنداء **مرةً واحدة لكل حجز** كالصورة
-- تماماً — يقع في نفس اللحظة ويُخزَّن ناتجُه فيها.
--
-- المرجع: 0078 (الجدول والحارس) · `lib/geo/route.ts` (المُتاح، مقروءاً لا معدَّلاً)
--         · D-13 · D-48.
-- الاختبار: supabase/tests/trip_settings_tests.sql القسم (ق-٤)
-- آمنة لإعادة التنفيذ بالكامل.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (١) العمود — وقيمُه الثلاث مقفلةٌ بـ`check` لا بعُرف
--
-- `straight` هو الافتراضي **لأنه الأسوأ**: من كتب صفاً ونسي العمود يحصل على
-- «تقريبي» فيقول النصّ الأحوط، لا على «مسار قيادة» يدّعي ما لم يقع.
-- ----------------------------------------------------------------------------
alter table public.booking_route_maps
  add column if not exists geometry_source text not null default 'straight';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.booking_route_maps'::regclass
      and conname  = 'booking_route_maps_geometry_source_check'
  ) then
    alter table public.booking_route_maps
      add constraint booking_route_maps_geometry_source_check
      check (geometry_source in ('osrm', 'google', 'straight'));
  end if;
end;
$$;

comment on column public.booking_route_maps.geometry_source is
  'بأيّ هندسةٍ رُسم الخط على الصورة: osrm/google = مسار قيادة حقيقي · straight = خط مستقيم بين النقطتين. تقرؤه الصفحة لتكتب النصّ الصادق تحت الصورة — فصورةٌ تقريبية تقول عن نفسها ذلك. والافتراضي straight لأنه الأحوط: كاتبٌ ينسى العمود يحصل على «تقريبي» لا على ادّعاء مسار.';

-- ----------------------------------------------------------------------------
-- (٢) فحوص ذاتية
-- ----------------------------------------------------------------------------

-- (٢-أ) القيد يرفض قيمةً رابعة — **بمحاولةٍ حيّة** لا بقراءة نصّه
do $$
declare
  v_conf constant uuid := 'ac790000-0000-4000-8000-0000000000c1';
  v_state text;
begin
  begin
    insert into public.bookings
      (id, reference, public_token, status, class_slug, class_title, total, currency,
       plan, amount_due, amount_remaining, customer_name, customer_phone, trip)
    values
      (v_conf, 'TR-M79C79', repeat('g', 40), 'confirmed', 'm79-probe',
       '0079 فئة فحص', 1000, 'EGP', 'full', 1000, 0, 'فحص 0079', '01000000079',
       '{}'::jsonb);

    v_state := null;
    begin
      insert into public.booking_route_maps
        (booking_id, storage_path, provider, width, height, byte_size, geometry_source)
      values (v_conf, 'probe/0079.png', 'google', 640, 360, 1, 'guess');
      v_state := '(قُبلت)';
    exception when others then
      get stacked diagnostics v_state = returned_sqlstate;
    end;

    if v_state <> '23514' then
      raise exception
        '0079 (٢-أ): هندسةٌ بقيمةٍ رابعة انتهت بـ«%» لا 23514 — القيد غائب أو يفشل لسببٍ آخر',
        v_state;
    end if;

    -- شاهدٌ موجب: القيمة المشروعة تمرّ، وإلا كان الرفض أعلاه رفضاً لكل شيء
    insert into public.booking_route_maps
      (booking_id, storage_path, provider, width, height, byte_size, geometry_source)
    values (v_conf, 'probe/0079.png', 'google', 640, 360, 1, 'osrm');

    raise exception '0079_PROBE_ROLLBACK';
  exception
    when others then
      if sqlerrm <> '0079_PROBE_ROLLBACK' then raise; end if;
  end;
end;
$$;

-- (٢-ب) الافتراضي هو الأحوط لا الأجمل
do $$
declare
  v_default text;
begin
  select column_default into v_default
  from information_schema.columns
  where table_schema = 'public'
    and table_name   = 'booking_route_maps'
    and column_name  = 'geometry_source';

  if v_default is null or v_default not like '''straight''%' then
    raise exception
      '0079 (٢-ب): افتراض geometry_source «%» — والمتوقع straight (الأحوط: لا يدّعي مساراً)',
      coalesce(v_default, 'null');
  end if;
end;
$$;
