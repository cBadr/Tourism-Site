-- ============================================================================
-- 0135_partial_review_and_inline_price_edit.sql
-- الاعتمادُ الجزئيّ لمسارات كشفٍ واحد، والتعديلُ الفوريّ لخانة سعرٍ من اللوحة.
--
-- ── (١) لماذا اعتمادٌ جزئيّ، ولماذا **لا** يمرّ بـ review_price_sheet ──────────
--
-- ‏`review_price_sheet` (0102 · شُدَّت في 0109) تكتب على **كل** صفٍّ `pending`
-- في الكشف، ودفعتُها معرَّفةٌ بشرطٍ لا بقائمة: `sheet_id = X and status='pending'`.
-- وهذا صحيحٌ لما وُضعت له — «١٠٠ مسار ⇒ قرارٌ واحد» — **وخطأٌ بنيويّ** لو
-- استُعمل لاختيارٍ جزئيّ: الشرطُ يُعاد تقييمه فيتّسع، والوعدُ «ما رآه هو ما
-- اعتُمد» ينكسر في الاتجاه الأخطر (أوسع لا أضيق).
--
-- 🔑 فالاعتمادُ الجزئيّ يُبنى على **تفويضٍ صفّاً صفّاً إلى `review_price_list`**
--    (‏القاعدة الذهبية ١٢: لا يُستنسخ منطقٌ قائم). ولا سطرَ اعتمادٍ ثانٍ في هذا
--    الملف: الحالةُ والملاحظةُ و`reviewed_at` وإلزامُ سبب الرفض ومنعُ غير المشرف
--    وردُّ «القائمة ما زالت مسودة» — كلُّها تبقى في الدالة الأصلية وحدها.
--
-- ⚠ و`p_expected` هنا **ليس نسخةً من عدّاد 0109** — العدّادان يحرسان خطرين
--   مختلفين، ولو كان تكراراً لَما استحقّ الوجود:
--
--   | الدالة | ما يحرسه العدّاد | كيف يفشل فعلاً |
--   |---|---|---|
--   | `review_price_sheet` | **اتّساعُ الشرط**: الكشف نما بعد رسم الصفحة | متعهدٌ أرسل مساراً جديداً بين الرسم والنقر |
--   | `review_selected_price_lists` | **انحرافُ النقل**: ما أرسله المتصفح ≠ ما ستكتبه القاعدة | معرّفٌ مكرَّر · معرّفٌ من كشفٍ آخر · معرّفٌ لم يعد قائماً |
--
--   والفرقُ الذي يجعل التوكيد قابلاً للسقوط: **الرقمُ المُمرَّر خام** (‏عددُ ما
--   التقطه الإجراء من النموذج قبل أي تنقية)، **والرقمُ المقارَن به مُنقّى**
--   (‏`distinct` + عضويةُ الكشف + وجودُ الصف). فإن اختلفا لم يُكتب حرفٌ واحد.
--   لو اشتُقّ الاثنان من المصفوفة نفسها لصار الفحص زينةً لا تفشل أبداً
--   (‏`LESSONS.md` النمط ٩) — وهذا بالضبط ما تُمسكه طفرةُ «معرّفٌ مكرَّر» في
--   ‏`supabase/tests/price_review_edit_tests.sql`.
--
-- ── (٢) التعديلُ بالنقر — قرارُ بدر حرفياً (2026-08-18) ───────────────────────
--
--   «فوريٌّ دائماً + أثرٌ وإشعارٌ على المعتمَدة»
--
--   | حالةُ القائمة | السلوك |
--   |---|---|
--   | draft · pending · rejected | حفظٌ فوريّ بلا قيد — الرقم لا يُسعَّر به أحد |
--   | **approved** | حفظٌ فوريّ **ومعه** سطرُ تدقيقٍ بقيمتَي قبل/بعد **وإشعارٌ للمتعهد** |
--
-- 🔴 **والعلّةُ التي تبرّر التفريق** — تُقرأ قبل أي تبسيطٍ لاحق يجعلهما سواء:
--   الرقمُ المعتمَد هو ما يُسعَّر به عميلٌ **الآن** (`coverage_matches` ⇒
--   `quote_price`)، **وهو رقمُ المتعهد المُعلَن** الذي بُني عليه البند ٨ من
--   اتفاقيةٍ وقّعها (0113). فتغييرُه بلا أثرٍ ولا علمٍ يناقض ما بُني للتوّ في
--   0130 من إلزام المبرر المكتوب مع كل خصم: لا يُنقص من مستحقّ المتعهد شيءٌ
--   بلا سببٍ مكتوب يراه. والمسودةُ لا تُسعِّر أحداً ولا وعدَ فيها لأحد — فقيدٌ
--   عليها كلفةٌ بلا حارس.
--
-- ── والقيودُ التي تُفوَّض ولا تُكتب من جديد ─────────────────────────────────
--
--   | القيد | إلى مَن يُفوَّض |
--   |---|---|
--   | «ليس رقماً» · `NaN` · `±Infinity` · `1e1000` | `public.quote_arg_finite` (0112) + `price_list_items_cost_finite_chk` (0108) |
--   | تحويلُ الأرقام العربية الهندية | `public.normalize_arabic` (0117) |
--   | نصٌّ لا يُحوَّل إلى رقم | `public.numeric_or_null` |
--   | فئةٌ مجهولة | `price_list_items_class_slug_fkey` + رسالةٌ صريحة قبله |
--   | سطرُ التدقيق بقيمتَي قبل/بعد وباسم الفاعل | المُشغّل `audit_price_list_items` ⇒ `log_audit()` |
--   | قناةُ الإشعار ووجهتُه | `public.queue_notification(text, jsonb, text, uuid)` |
--
-- ⚠ **الإشعارُ يحتاج عنواناً في `EVENT_META`** داخل `lib/notifications/render.ts`
--   وإلا وصل الجرسَ وتليجرام بعنوان «إشعار جديد». الملفُّ تملكه دفعةٌ أخرى الآن،
--   والعنوانُ المطلوب مسجَّلٌ في تقرير هذه الدفعة:
--     partner_price_edited → { title: "الإدارة عدّلت سعراً في قائمتك المعتمدة", emoji: "✏️" }
--
-- ── التزامنُ: مشرفان على الخانة نفسها ───────────────────────────────────────
--
-- الآليةُ المختارة: **مقارنةٌ بالقيمة المرئية** (compare-and-set) تحت `for update`.
-- المشرف يرسل مع التعديل القيمةَ التي كانت **معروضةً على شاشته**، والدالة تقارنها
-- بما في القاعدة قبل الكتابة؛ فإن اختلفتا رُدَّ التعديل بالرقمين معاً ولم يُكتب شيء.
--
-- ولماذا هي لا غيرها:
--   • **عمودُ نسخةٍ (`version`)** يحتاج تغييرَ مخطَّطٍ وكاتبَين يصونانه، ولا يقول
--     للمشرف **ما الذي تغيّر** — يقول «فشل» فقط.
--   • **القفلُ المتشائم وحده** (`for update` بلا مقارنة) يُسلسِل الكتابتين ثم
--     **يبتلع الأولى صامتةً** — وهو بعينه العطلُ المطلوب منعُه.
--   • **الطابعُ الزمنيّ** لا يوجد على `price_list_items` أصلاً (لا `updated_at`).
--   • والمقارنةُ بالقيمة **تُخبر بما جرى**: «كان ٩٠٠ وصار ١٢٠٠ بينما شاشتك تعرض
--     ٩٠٠» — فيقرّر المشرف على علم بدل أن يعيد الكتابة فوق زميله.
--
-- 🔴 و`p_seen_cost` **إلزاميّ** لا اختياريّ، لنفس سبب 0109 حرفياً: الاختياريُّ
--   يجعل الضمانة رهنَ انضباط كل مُنادٍ لاحق، والإلزاميُّ يجعل «تعديلٌ بلا تصريحٍ
--   بما كان معروضاً» خطأً بنيوياً. والنصُّ الفارغ فيه معنىً صريح: «لا سعرَ لهذه
--   الفئة» — وهو ما يسمح بإضافة فئةٍ جديدة بالنقر نفسه.
--
-- ── ما لا تفعله هذه الهجرة ─────────────────────────────────────────────────
--   • لا تكتب صفَّ بياناتٍ واحداً ولا تلمس صفَّ مالكٍ واحداً — دوالُّ ومنحٌ فقط.
--   • لا تُسقط ولا تعدّل أي دالةٍ قائمة، فالكودُ المنشور لا يتأثر بتنفيذها.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (١) الاعتمادُ الجزئيّ — مساراتٌ بأعيانها من كشفٍ واحد
-- ----------------------------------------------------------------------------
create or replace function public.review_selected_price_lists(
  p_sheet    uuid,
  p_ids      uuid[],
  p_approve  boolean,
  p_note     text default null,
  p_expected integer default null
)
returns table(affected integer, new_status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids  uuid[];
  v_n    integer;
  v_have integer;
  v_id   uuid;
  v_new  text;
begin
  -- الحارسُ الأول يفشل **مغلقاً**: قبل أي قراءةٍ لبنية الكشف
  if not public.is_admin() then
    raise exception 'مراجعة قوائم الأسعار متاحة للمشرف وحده' using hint = 'forbidden';
  end if;

  if p_sheet is null or not exists (select 1 from public.price_sheets ps where ps.id = p_sheet) then
    raise exception 'كشف الأسعار غير موجود' using hint = 'not-found';
  end if;

  -- التنقية: بلا تكرارٍ وبلا فراغات. والرقمُ الخام يبقى في p_expected للمقارنة.
  select coalesce(array_agg(distinct x.id), '{}'::uuid[])
    into v_ids
  from unnest(coalesce(p_ids, '{}'::uuid[])) as x(id)
  where x.id is not null;

  v_n := coalesce(array_length(v_ids, 1), 0);

  if v_n = 0 then
    raise exception 'لم تختر أي مسار — علّم على مسارٍ واحد على الأقل'
      using hint = 'invalid-input';
  end if;

  if p_expected is null then
    raise exception 'عدد المسارات المختارة مطلوب مع قرار المراجعة (% مساراً صالحاً في اختيارك)',
      v_n using hint = 'invalid-input';
  end if;

  if p_expected <> v_n then
    raise exception
      'اختيارك % مساراً والقاعدة تقرأ منه % صالحاً غير مكرَّر — لم يُكتب شيء، أعد تحميل الصفحة',
      p_expected, v_n using hint = 'count-changed';
  end if;

  -- 🔴 العضوية والقفل معاً: كلُّ معرّفٍ مختارٍ يجب أن يكون في **هذا** الكشف.
  -- والقفلُ هنا يمنع أن تتغيّر حالتُه بين هذا الفحص والتفويض بعده.
  select count(*) into v_have
  from (
    select pl.id
    from public.price_lists pl
    where pl.id = any (v_ids)
      and pl.sheet_id = p_sheet
    for update
  ) x;

  if v_have <> v_n then
    raise exception
      'اختيارك يحمل مساراً ليس في هذا الكشف أو لم يعد موجوداً (% من % وُجدت) — لم يُكتب شيء',
      v_have, v_n using hint = 'not-found';
  end if;

  -- التفويض: صفٌّ صفّاً إلى الدالة القائمة. وأيُّ صفٍّ ترفضه (‏مسودةٌ لم تُرسل ·
  -- بُتَّ فيه قبل ثانية · رفضٌ بلا سبب) يرمي فتسقط المعاملة كلها — فلا اعتمادٌ
  -- نصفيّ يترك المشرف لا يعرف أيَّها كُتب.
  foreach v_id in array v_ids loop
    select public.review_price_list(v_id, p_approve, p_note) into v_new;
  end loop;

  affected   := v_n;
  new_status := v_new;
  return next;
end;
$$;

comment on function public.review_selected_price_lists(uuid, uuid[], boolean, text, integer) is
  'اعتماد/رفض مساراتٍ مختارة بأعيانها من كشفٍ واحد — للمشرف وحده. تفوّض القرار صفّاً صفّاً إلى review_price_list ولا تكتب حالةً بنفسها. p_expected إلزاميّ ويُقارَن بالعدد بعد التنقية (distinct + عضوية الكشف): أي اختلاف يوقف الكتابة كلها (hint=count-changed).';

-- ----------------------------------------------------------------------------
-- (٢) التعديلُ بالنقر — خانةُ تكلفةٍ واحدة
-- ----------------------------------------------------------------------------
create or replace function public.set_price_list_item_cost(
  p_list      uuid,
  p_class     text,
  p_cost      text,
  p_seen_cost text
)
returns table(new_cost numeric, list_status text, changed boolean, notified boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_list     record;
  v_class    text;
  v_title    text;
  v_cost     numeric;
  v_seen     numeric;
  v_seen_any boolean;
  v_old      numeric;
  v_exists   boolean;
  v_currency text;
  v_notified boolean := false;
begin
  -- (أ) الهوية — التحرير نيابةً عن المتعهد قرارُ إدارةٍ لا قرارُ شريك.
  -- والمتعهد له بابُه القائم (`upsert_price_list`) وهو يعيد المعتمدة إلى
  -- «قيد المراجعة» بحكم `price_list_items_demote_parent` — فلا يغيّر رقماً
  -- يُسعَّر به عميلٌ الآن بلا مراجعتنا. هذا البابُ للمشرف وحده.
  if not public.is_admin() then
    raise exception 'تعديل أسعار قوائم المتعهدين متاح للمشرف وحده' using hint = 'forbidden';
  end if;

  -- (ب) الفئة
  v_class := lower(btrim(coalesce(p_class, '')));
  if v_class = '' then
    raise exception 'فئة السيارة مطلوبة' using hint = 'invalid-input';
  end if;

  select vc.title into v_title from public.vehicle_classes vc where vc.slug = v_class;
  if not found then
    raise exception 'فئة غير معروفة: %', v_class using hint = 'invalid-input';
  end if;

  -- (ج) الرقم — يُطبَّع ثم يُحوَّل ثم يُفحَص، وكلُّ خطوةٍ بدالةٍ قائمة.
  --   `normalize_arabic` تُحوّل ٠-٩ العربية والفارسية وتُسقط المحارف الخفية،
  --   و`translate` تعالج **الفاصلة العشرية العربية ٫ وحدها** لأنها لا تعني إلا
  --   شيئاً واحداً، فرفضُ «١٢٣٤٫٥» رفضٌ لرقمٍ كتبه المستخدم صحيحاً بلوحة مفاتيحه.
  --
  --   🔴 وفواصلُ الآلاف (‏٬ و «,») **لا تُسقَط بقصد**، وهذا خيارٌ مقيسٌ لا سهو:
  --   إسقاطُها يجعل «12,,5» رقماً صالحاً قيمتُه ١٢٥ — أي **خطأً مطبعياً يصير
  --   مالاً صامتاً**، وهو بالضبط صنفُ العطل الذي أُغلق في 0108. فالمبهمُ يُرفض
  --   برسالةٍ تسمّي ما كُتب، والمستخدم يعيد كتابة الرقم بلا فاصلة.
  v_cost := public.numeric_or_null(
              translate(public.normalize_arabic(coalesce(p_cost, '')), '٫', '.'));

  if v_cost is null then
    raise exception 'التكلفة يجب أن تكون رقماً — «%» ليست رقماً', coalesce(p_cost, '')
      using hint = 'invalid-input';
  end if;

  -- NaN و±Infinity و1e1000: الحاجزُ الموحَّد لكل أرقام المشروع (0112)
  perform public.quote_arg_finite(v_cost, 'تكلفة الفئة', 1000000);

  if v_cost < 0 then
    raise exception 'تكلفة الفئة لا تكون سالبة' using hint = 'invalid-input';
  end if;

  -- (د) القائمة — تُقفل قبل أي قراءةٍ يُبنى عليها قرار
  select pl.* into v_list
  from public.price_lists pl
  where pl.id = p_list
  for update;

  if not found then
    raise exception 'قائمة الأسعار غير موجودة' using hint = 'not-found';
  end if;

  -- (هـ) التزامن — القيمةُ المرئية إلزامية، والفراغ يعني «لا سعر لهذه الفئة»
  if p_seen_cost is null then
    raise exception 'القيمة المعروضة على شاشتك مطلوبة مع التعديل' using hint = 'invalid-input';
  end if;

  v_seen_any := btrim(p_seen_cost) <> '';
  if v_seen_any then
    v_seen := public.numeric_or_null(
                translate(public.normalize_arabic(p_seen_cost), '٫', '.'));
    if v_seen is null then
      raise exception 'القيمة المعروضة غير مقروءة — أعد تحميل الصفحة'
        using hint = 'invalid-input';
    end if;
  end if;

  select pli.cost into v_old
  from public.price_list_items pli
  where pli.price_list_id = p_list and pli.class_slug = v_class
  for update;
  v_exists := found;

  if v_exists and not v_seen_any then
    raise exception
      'أُضيف سعرٌ لهذه الفئة (%) بينما صفحتك مفتوحة — لم يُكتب شيء، أعد التحميل ثم قرّر',
      v_old using hint = 'stale';
  end if;

  if (not v_exists) and v_seen_any then
    raise exception
      'حُذف سعر هذه الفئة بينما صفحتك مفتوحة (كانت تعرض %) — لم يُكتب شيء، أعد التحميل',
      v_seen using hint = 'stale';
  end if;

  if v_exists and v_old is distinct from v_seen then
    raise exception
      'عدّل أحدٌ هذه الخانة بينما صفحتك مفتوحة: شاشتك تعرض % والقيمة الآن % — لم يُكتب شيء، أعد التحميل',
      v_seen, v_old using hint = 'stale';
  end if;

  -- (و) لا شيء يتغيّر ⇒ لا كتابة ولا تدقيق ولا إشعار.
  -- إشعارُ متعهدٍ بتغييرٍ لم يقع هو الشكلُ الأول من «إنذارٍ يرنّ دائماً فلا يُسمع».
  if v_exists and v_old = v_cost then
    new_cost    := v_old;
    list_status := v_list.status;
    changed     := false;
    notified    := false;
    return next;
    return;
  end if;

  -- (ز) الأثر — يُكتب **قبل** الكتابة فيلتقطه `log_audit` من الجلسة نفسها،
  -- ويأخذ الفاعلَ والزمنَ والقيمتين من المُشغّل القائم لا من سطرٍ ثانٍ هنا.
  --
  -- ⚠ وحدٌّ مُعلَن يستحقّ أن يُقرأ: `price_list_items` **بلا عمود `id` وبلا
  --   `subcontractor_id`**، فصفُّ التدقيق الناتج يخرج بـ`entity_id = null`
  --   و`subcontractor_id = null` — صفةٌ قديمة في `log_audit` لا تُحدثها هذه
  --   الهجرة. ولذلك تُحمَّل الملاحظةُ نفسها بالمسار والمتعهد وبالقيمتين معاً:
  --   فتبقى السطرُ مقروءاً ومُتتبَّعاً ولو بحث عنه أحدٌ بعد سنة.
  perform set_config(
    'tours.audit_note',
    'تعديلٌ فوريّ من اللوحة · قائمة ' || p_list::text
      || ' (' || v_list.status || ') · متعهد ' || v_list.subcontractor_id::text
      || ' · فئة ' || v_class
      || ' · من ' || coalesce(v_old::text, 'بلا سعر') || ' إلى ' || v_cost::text
      || case when v_list.status = 'approved'
              then ' · مُسعَّرٌ به الآن وأُشعِر المتعهد'
              else ' · لا أثر على تسعير جارٍ' end,
    true);

  insert into public.price_list_items as pli (price_list_id, class_slug, cost)
  values (p_list, v_class, v_cost)
  on conflict (price_list_id, class_slug) do update set cost = excluded.cost;

  -- (ح) الإشعار — للمعتمدة وحدها، وإلى المتعهد صاحبها لا إلى التشغيل.
  -- ولا هامشَ ولا سعرَ عميلٍ في الحمولة: المتعهد يرى تكلفته هو (D-19 مقلوبةً).
  if v_list.status = 'approved' then
    select ps.currency into v_currency from public.pricing_settings ps limit 1;

    perform public.queue_notification(
      'partner_price_edited',
      jsonb_build_object(
        'priceListId',     p_list,
        'subcontractorId', v_list.subcontractor_id,
        'routeTitle',      v_list.title,
        'originLabel',     v_list.origin_label,
        'destLabel',       v_list.dest_label,
        'classSlug',       v_class,
        'className',       v_title,
        'oldCost',         v_old,
        'newCost',         v_cost,
        'currency',        coalesce(v_currency, 'EGP')),
      'partner',
      v_list.subcontractor_id);

    v_notified := true;
  end if;

  new_cost    := v_cost;
  list_status := v_list.status;
  changed     := true;
  notified    := v_notified;
  return next;
end;
$$;

comment on function public.set_price_list_item_cost(uuid, text, text, text) is
  'تعديل تكلفة فئةٍ واحدة في قائمة أسعار — للمشرف وحده، وحفظٌ فوريّ في كل الحالات. على القائمة المعتمدة يُكتب سطرُ تدقيقٍ بقيمتَي قبل/بعد (بالمُشغّل القائم) ويُشعَر المتعهد بالحدث partner_price_edited. p_seen_cost إلزاميّ: القيمة المعروضة على شاشة المشرف، وأي اختلافٍ عنها يوقف الكتابة (hint=stale). الرقم يُطبَّع عربياً ويُفحَص بـquote_arg_finite فلا يمرّ NaN ولا ±Infinity.';

-- ----------------------------------------------------------------------------
-- (٣) الصلاحيات
--
-- ⚠ فخّ 0010/0102/0109 المكرَّر: الدالة الجديدة تولد ومعها EXECUTE ضمني لـPUBLIC
--   ومنحٌ صريح لـanon من إعدادات Supabase الافتراضية. السحب أولاً ثم المنح.
--   ولا شيء منها لـanon: كلتاهما تلمس تكلفة المتعهد وهي سرٌّ تجاري (D-19).
-- ----------------------------------------------------------------------------
do $$
declare
  v_sig text;
begin
  foreach v_sig in array array[
    'public.review_selected_price_lists(uuid, uuid[], boolean, text, integer)',
    'public.set_price_list_item_cost(uuid, text, text, text)'
  ] loop
    execute format('revoke all on function %s from public', v_sig);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on function %s from anon', v_sig);
    end if;
    execute format('revoke all on function %s from authenticated', v_sig);
    execute format('grant execute on function %s to authenticated', v_sig);
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format('grant execute on function %s to service_role', v_sig);
    end if;
  end loop;
end;
$$;

-- ----------------------------------------------------------------------------
-- (٤) فحصٌ ذاتي — الهجرة تُثبت أثرها بنفسها بدل أن تُصدَّق
--
-- ولا يكتب هذا القسم صفَّ بياناتٍ واحداً: كتالوجٌ وتعابيرُ خالصة فقط. فما يمسّ
-- صفوفاً حيّةً مكانُه مجموعةُ الاختبار داخل BEGIN … ROLLBACK لا ملفُّ هجرةٍ
-- يجري على قاعدة الإنتاج.
-- ----------------------------------------------------------------------------
do $$
declare
  v_sig_review constant text := 'public.review_selected_price_lists(uuid, uuid[], boolean, text, integer)';
  v_sig_cost   constant text := 'public.set_price_list_item_cost(uuid, text, text, text)';
  v_body       text;
begin
  if to_regprocedure(v_sig_review) is null then
    raise exception '0135: review_selected_price_lists لم تُنشأ';
  end if;
  if to_regprocedure(v_sig_cost) is null then
    raise exception '0135: set_price_list_item_cost لم تُنشأ';
  end if;

  -- الشرطُ المسبق: الدوال المُفوَّض إليها قائمة، وإلا كان التفويض وهماً
  if to_regprocedure('public.review_price_list(uuid, boolean, text)') is null then
    raise exception '0135: review_price_list مفقودة — التفويض بلا مُفوَّضٍ إليه';
  end if;
  if to_regprocedure('public.quote_arg_finite(numeric, text, numeric)') is null then
    raise exception '0135: quote_arg_finite مفقودة — نفّذ 0112 أولاً';
  end if;
  if to_regprocedure('public.queue_notification(text, jsonb, text, uuid)') is null then
    raise exception '0135: queue_notification الرباعية مفقودة';
  end if;
  if to_regprocedure('public.normalize_arabic(text)') is null then
    raise exception '0135: normalize_arabic مفقودة — نفّذ 0117 أولاً';
  end if;

  -- 🔴 التفويضُ يُقاس على الجسم الحيّ لا على النية: لا `update … set status`
  --    في الاعتماد الجزئي، وإلا كان منطقُ الاعتماد قد استُنسخ (القاعدة ١٢).
  v_body := pg_get_functiondef(to_regprocedure(v_sig_review));
  if v_body !~ 'review_price_list' then
    raise exception '0135: الاعتماد الجزئي لا ينادي review_price_list — التفويض غائب';
  end if;
  if v_body ~* 'update[[:space:]]+public\.price_lists' then
    raise exception '0135: الاعتماد الجزئي يكتب الحالة بنفسه بدل التفويض';
  end if;

  -- والمُشغّلان اللذان يحملان الأثر: تدقيقُ الأصناف، وعدمُ إنزال المعتمدة بيد المشرف
  if not exists (
    select 1 from pg_trigger t
    where t.tgrelid = 'public.price_list_items'::regclass
      and not t.tgisinternal
      and t.tgname = 'audit_price_list_items'
  ) then
    raise exception '0135: مُشغّل التدقيق على price_list_items غائب — لا سطرَ قبل/بعد';
  end if;

  -- تطبيعُ الأرقام العربية يعمل فعلاً (نداءٌ حيّ لا قراءةُ نص — القاعدة ١٩)
  if public.numeric_or_null(translate(public.normalize_arabic('١٢٣٤٫٥'), '٫', '.')) <> 1234.5 then
    raise exception '0135: الأرقام العربية الهندية لا تُقرأ رقماً';
  end if;
  -- والمبهمُ يُرفض ولا يُصلَّح: «12,,5» بلا هذا القرار تصير ١٢٥ صامتةً
  if public.numeric_or_null(translate(public.normalize_arabic('12,,5'), '٫', '.')) is not null then
    raise exception '0135: فاصلةٌ مبهمة قُرئت رقماً — خطأٌ مطبعيّ يصير مالاً';
  end if;
  if public.numeric_or_null(translate(public.normalize_arabic('١٬٢٣٤'), '٫', '.')) is not null then
    raise exception '0135: فاصلة الآلاف قُرئت رقماً — والمبهم يُرفض لا يُصلَّح';
  end if;

  -- الحاجزُ المالي يرفض فعلاً
  begin
    perform public.quote_arg_finite('NaN'::numeric, 'س', 1000000);
    raise exception '0135: quote_arg_finite قبلت NaN';
  exception
    when others then
      if sqlerrm like '0135:%' then raise; end if;
  end;

  -- الصلاحيات
  if exists (select 1 from pg_roles where rolname = 'anon') then
    if has_function_privilege('anon', v_sig_review, 'execute') then
      raise exception '0135: anon يستطيع تنفيذ review_selected_price_lists';
    end if;
    if has_function_privilege('anon', v_sig_cost, 'execute') then
      raise exception '0135: anon يستطيع تنفيذ set_price_list_item_cost';
    end if;
  end if;
  if not has_function_privilege('authenticated', v_sig_review, 'execute') then
    raise exception '0135: authenticated لا يستطيع تنفيذ review_selected_price_lists — اللوحة لن تعمل';
  end if;
  if not has_function_privilege('authenticated', v_sig_cost, 'execute') then
    raise exception '0135: authenticated لا يستطيع تنفيذ set_price_list_item_cost — اللوحة لن تعمل';
  end if;

  raise notice '0135 ✔ اعتمادٌ جزئيّ مفوَّضٌ صفّاً صفّاً · عددٌ خام يُقارَن بعددٍ منقّى · تعديلٌ فوريّ بمقارنةِ القيمة المرئية · والمعتمَدة وحدها تُشعِر وتُدقَّق';
end;
$$;
