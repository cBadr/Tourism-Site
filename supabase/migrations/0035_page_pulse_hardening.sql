-- ============================================================================
-- 0035 — تصليب نبض الصفحة بعد المراجعتين النقديتين (الدفعة ٤ — الملاحظة ١٢)
--
-- المراجعتان (أمنية + انحراف عقود) ثم تحقّقٌ خصومي على نتائجهما. **لم تصمد ولا
-- ملاحظة بدرجة حرج أو عالٍ أو متوسط**: الحارس أولُ عبارة على كل مسار، وكل مرجع
-- مؤهَّل بالمخطط، والتفويض إلى `section_stats` مطابقٌ صفاً بصف بدليل حيّ، ولا
-- منحة اتّسعت. وهذا الملف يعالج **بندين صغيرين لا ثالث لهما** — أُدرجا رغم
-- تصنيفهما «تجميلياً» في التحقق، لسبب واحد: كلاهما **خرقٌ لعقد كتبناه نحن**،
-- وانحراف العقد عن كوده هو أول درجات العطب الذي يمرّ سنةً بلا أن يلاحظه أحد.
--
-- ── (١) عدّادان كانا محجوبين خلف حارس نسبة ─────────────────────────────────
--
-- نصّت ترويسة 0034 على أن المحذوف عند المقام الصفري هو **بطاقة النسبة** وحدها،
-- لأن «معدل قبول ٠٪» في فترة بلا عرض كذبة. لكن `fleet_orders` و
-- `payment_failed_count` **عدّادان** وقعا داخل نفس `if v_c_all > 0`. والنتيجة
-- أن ٣٠ يوماً بلا حجز تُخفي «حجوزات على الأسطول» من الشاشة بدل أن تقول «٠» —
-- والصفر هنا **معلومة صحيحة** لا ادعاء معرفة، بعكس النسبة التي لا وجود لها.
--
-- ولا يُصحّح هذا رقماً خاطئاً (العدّاد المحجوب صفرٌ بنيوياً في اللحظة التي
-- يُحجب فيها)، بل يُصحّح **سلوكاً يخالف عقده المكتوب** — وهو ما يُبنى عليه غداً.
--
-- ── (٢) `'treasury'` في `pulse_series` بلا قارئ ────────────────────────────
--
-- قيمة معامل مقبولة، محروسة، وتُرجع منحنى وارد المنصة — **ولا مدخل في
-- `PAGE_PULSE` يطلبها**، لأن `/admin/finance` تملك مخطط تدفق نقدي كاملاً فشرارةٌ
-- فوقها تكرار. سطحٌ يُصان بلا مستهلك يُحذف حتى توجد شاشة تطلبه؛ ونفس المبدأ
-- المكتوب في `lib/stats/cards.ts` («إخفاؤه يعني عمل قاعدة بلا مستهلك») يعمل في
-- الاتجاهين.
--
-- ⚠ **والجسمان أدناه منقولان من التعريف الحيّ في القاعدة** (`pg_get_functiondef`)
-- لا بنسخ من ملف 0034 — تطبيقاً لـ**D-58**، ولو كان الملف والقاعدة متطابقين
-- اليوم (وقد تحققت المراجعة الأمنية من تطابقهما بايتاً ببايت). القاعدة تُطبَّق
-- لأنها قاعدة، لا حين يُشتبه في مخالفتها.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (١) pulse_stats — إخراج العدّادين من حارس النسبة
-- ----------------------------------------------------------------------------
-- الفرق عن المُنتَج الحيّ **ثلاثة مواضع لا رابع**: نقلُ كتلة `fleet_orders`
-- خارج `if v_c_all > 0` في قسم الأسطول، ونقلُ `payment_failed_count` خارجه في
-- قسم الدفع، وتعليقٌ يشرح لماذا. وما عدا ذلك منقول حرفاً.
-- ----------------------------------------------------------------------------

create or replace function public.pulse_stats(p_section text, p_from date, p_to date)
returns table (
  key           text,
  label         text,
  value         numeric,
  delta_percent numeric,
  format        text,
  help          text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_section text;
  v_from    date;
  v_to      date;
  v_len     integer;
  v_pfrom   date;
  v_pto     date;
begin
  if not public.analytics_admin_allowed() then
    raise exception 'مؤشرات الشاشات متاحة للإدارة فقط' using hint = 'forbidden';
  end if;

  v_section := lower(nullif(btrim(coalesce(p_section, '')), ''));

  -- ── التفويض: الأقسام السبعة تبقى مصدرها الوحيد `section_stats` ──────────
  if v_section in ('orders', 'partners', 'treasury', 'customers',
                   'content', 'locales', 'discounts') then
    return query select * from public.section_stats(v_section, p_from, p_to);
    return;
  end if;

  if v_section is null
     or v_section not in ('dispatch', 'quotes', 'payments', 'accounts',
                          'fleet', 'extras', 'notifications', 'redirects') then
    raise exception
      'قسم نبض مجهول: «%» — المسموح: الأقسام السبعة في section_stats، أو dispatch|quotes|payments|accounts|fleet|extras|notifications|redirects',
      coalesce(nullif(btrim(coalesce(p_section, '')), ''), 'بلا')
      using hint = 'invalid-input';
  end if;

  v_to   := coalesce(p_to, (now() at time zone 'Africa/Cairo')::date);
  v_from := coalesce(p_from, v_to - 29);

  if v_from > v_to then
    raise exception 'الفترة معكوسة: من % إلى %', v_from, v_to using hint = 'invalid-input';
  end if;

  v_len   := (v_to - v_from) + 1;
  v_pto   := v_from - 1;
  v_pfrom := v_from - v_len;

  -- ── (١-أ) البث والإسناد ────────────────────────────────────────────────
  if v_section = 'dispatch' then
    declare
      v_c_disp numeric := 0; v_c_off numeric := 0; v_c_acc numeric := 0;
      v_c_man  numeric := 0; v_c_fmin numeric := 0; v_c_fsmp numeric := 0;
      v_p_disp numeric := 0; v_p_off numeric := 0; v_p_acc numeric := 0;
      v_p_man  numeric := 0; v_p_fmin numeric := 0; v_p_fsmp numeric := 0;
      v_open   numeric := 0;
    begin
      select coalesce(sum(d.dispatches_count), 0), coalesce(sum(d.offers_count), 0),
             coalesce(sum(d.accepted_count), 0),   coalesce(sum(d.manual_count), 0),
             coalesce(sum(d.first_accept_minutes_total), 0),
             coalesce(sum(d.first_accept_samples), 0)
        into v_c_disp, v_c_off, v_c_acc, v_c_man, v_c_fmin, v_c_fsmp
        from public.v_stats_dispatch d where d.day between v_from and v_to;

      select coalesce(sum(d.dispatches_count), 0), coalesce(sum(d.offers_count), 0),
             coalesce(sum(d.accepted_count), 0),   coalesce(sum(d.manual_count), 0),
             coalesce(sum(d.first_accept_minutes_total), 0),
             coalesce(sum(d.first_accept_samples), 0)
        into v_p_disp, v_p_off, v_p_acc, v_p_man, v_p_fmin, v_p_fsmp
        from public.v_stats_dispatch d where d.day between v_pfrom and v_pto;

      key := 'dispatch_count'; label := 'طلبات بُثّت'; value := v_c_disp;
      delta_percent := public.stats_delta(v_c_disp, v_p_disp); format := 'number';
      help := 'عدد دورات البث التي بدأت في الفترة — كل حجز مؤكد يفتح دورة واحدة تُعرض على المتعهدين المغطّين لمساره على موجات.';
      return next;

      if v_c_off > 0 then
        key := 'dispatch_accept_rate'; label := 'معدل قبول العروض';
        value := round(100.0 * v_c_acc / v_c_off, 1);
        delta_percent := case when v_p_off > 0
          then public.stats_delta(100.0 * v_c_acc / v_c_off, 100.0 * v_p_acc / v_p_off)
          else null end;
        format := 'percent';
        help := 'من كل العروض المرسلة للمتعهدين في الفترة، كم عرضاً قُبل. انخفاضه يعني عروضاً لا تغري: راجع سقف الموجة الأولى وأسعار المتعهدين على المسارات الأكثر طلباً.';
        return next;
      end if;

      if v_c_disp > 0 then
        key := 'dispatch_manual_rate'; label := 'نسبة الإسناد اليدوي';
        value := round(100.0 * v_c_man / v_c_disp, 1);
        delta_percent := case when v_p_disp > 0
          then public.stats_delta(100.0 * v_c_man / v_c_disp, 100.0 * v_p_man / v_p_disp)
          else null end;
        format := 'percent';
        help := 'الرحلات التي استنفدت كل موجاتها بلا قبول فنزلت إلى الطابور اليدوي. ارتفاعها يعني أن البث الآلي توقف عن العمل عملياً — وهي مؤشر يُقرأ ارتفاعه خبراً سيئاً.';
        return next;
      end if;

      if v_c_fsmp > 0 then
        key := 'dispatch_first_accept'; label := 'متوسط زمن أول قبول';
        value := round(v_c_fmin / v_c_fsmp, 1);
        delta_percent := case when v_p_fsmp > 0
          then public.stats_delta(v_c_fmin / v_c_fsmp, v_p_fmin / v_p_fsmp)
          else null end;
        format := 'duration';
        help := 'من لحظة بدء البث إلى أول قبول — بالدقائق. يقيس سرعة استجابة شبكة المتعهدين، وطوله يعني عميلاً ينتظر تأكيد منفّذ رحلته.';
        return next;
      end if;

      select count(*)::numeric into v_open
        from public.dispatches d where d.status = 'manual';
      key := 'dispatch_manual_open'; label := 'في الطابور اليدوي الآن';
      value := v_open;
      delta_percent := null; format := 'number';
      help := 'صورة الآن لا فترة: رحلات مدفوعة بلا منفّذ تنتظر تدخّلك أنت. كل صف هنا عميل دفع ولم يُبلَّغ بمن سينفّذ رحلته.';
      return next;
      return;
    end;
  end if;

  -- ── (١-ب) طلبات عروض الأسعار ───────────────────────────────────────────
  if v_section = 'quotes' then
    declare
      v_c_all numeric := 0; v_c_conv numeric := 0; v_c_svc numeric := 0;
      v_p_all numeric := 0; v_p_conv numeric := 0;
      v_open  numeric := 0;
    begin
      select count(*)::numeric,
             count(*) filter (where q.status = 'converted')::numeric,
             count(distinct q.service_slug)::numeric
        into v_c_all, v_c_conv, v_c_svc
        from public.quote_requests q
       where (q.created_at at time zone 'Africa/Cairo')::date between v_from and v_to;

      select count(*)::numeric,
             count(*) filter (where q.status = 'converted')::numeric
        into v_p_all, v_p_conv
        from public.quote_requests q
       where (q.created_at at time zone 'Africa/Cairo')::date between v_pfrom and v_pto;

      key := 'quotes_count'; label := 'طلبات عروض الأسعار'; value := v_c_all;
      delta_percent := public.stats_delta(v_c_all, v_p_all); format := 'number';
      help := 'مسار الدخول الموازي للحاسبة الفورية: الجولات والمناسبات وما لا تغطيه التعريفة. ارتفاعه مع ثبات الحجوزات يعني أن الحاسبة لا تغطي ما يطلبه الزوار.';
      return next;

      if v_c_all > 0 then
        key := 'quotes_converted_rate'; label := 'نسبة التحوّل إلى حجز';
        value := round(100.0 * v_c_conv / v_c_all, 1);
        delta_percent := case when v_p_all > 0
          then public.stats_delta(100.0 * v_c_conv / v_c_all, 100.0 * v_p_conv / v_p_all)
          else null end;
        format := 'percent';
        help := 'من طلبات الفترة، كم طلباً وُسم «تحوّل» بعد تواصل فريقك. الوسم يدوي من شاشة الطلبات — فالرقم يقيس متابعتكم كما يقيس جودة الطلبات.';
        return next;
      end if;

      key := 'quotes_services'; label := 'خدمات مطلوبة'; value := v_c_svc;
      delta_percent := null; format := 'number';
      help := 'عدد الخدمات المختلفة التي وردت فيها طلبات خلال الفترة (من الخدمات الست). تركّزها في خدمة واحدة يدل على أين يقع طلب السوق فعلاً.';
      return next;

      select count(*)::numeric into v_open
        from public.quote_requests q where q.status = 'new';
      key := 'quotes_new_open'; label := 'جديد بلا تواصل';
      value := v_open; delta_percent := null; format := 'number';
      help := 'صورة الآن لا فترة: طلبات لم يفتحها أحد بعد. هذه أسرع قائمة تفقد قيمتها بالوقت — طالب السعر يسأل غيرك في نفس اليوم.';
      return next;
      return;
    end;
  end if;

  -- ── (١-ج) جلسات بوابات الدفع — أعداد ونسب بلا مال (انظر ترويسة 0034) ────
  if v_section = 'payments' then
    declare
      v_c_all numeric := 0; v_c_ok numeric := 0; v_c_bad numeric := 0;
      v_p_all numeric := 0; v_p_ok numeric := 0;
    begin
      select count(*)::numeric,
             count(*) filter (where i.status = 'succeeded')::numeric,
             count(*) filter (where i.status in ('failed', 'expired', 'cancelled'))::numeric
        into v_c_all, v_c_ok, v_c_bad
        from public.payment_intents i
       where (i.created_at at time zone 'Africa/Cairo')::date between v_from and v_to;

      select count(*)::numeric,
             count(*) filter (where i.status = 'succeeded')::numeric
        into v_p_all, v_p_ok
        from public.payment_intents i
       where (i.created_at at time zone 'Africa/Cairo')::date between v_pfrom and v_pto;

      key := 'payment_intents_count'; label := 'جلسات دفع إلكتروني'; value := v_c_all;
      delta_percent := public.stats_delta(v_c_all, v_p_all); format := 'number';
      help := 'كل محاولة دفع عبر بوابة إلكترونية في الفترة. صفرٌ هنا صحيح ما دامت البوابات الست خاملة بلا مفاتيح — المسار العامل اليوم تحويل بنكي يدوي، وأرقامه في الخزينة.';
      return next;

      -- النسبة وحدها محروسة بالمقام؛ والعدّاد يخرج دائماً (تصليب 0035 ق١)
      if v_c_all > 0 then
        key := 'payment_success_rate'; label := 'معدل نجاح الجلسات';
        value := round(100.0 * v_c_ok / v_c_all, 1);
        delta_percent := case when v_p_all > 0
          then public.stats_delta(100.0 * v_c_ok / v_c_all, 100.0 * v_p_ok / v_p_all)
          else null end;
        format := 'percent';
        help := 'الجلسات التي انتهت بحالة «نجحت» من كل جلسات الفترة. انخفاضها المفاجئ أول إشارة على عطل في بوابة بعينها قبل أن يشتكي عميل.';
        return next;
      end if;

      key := 'payment_failed_count'; label := 'جلسات فاشلة أو منتهية';
      value := v_c_bad; delta_percent := null; format := 'number';
      help := 'مجموع الفاشلة والملغاة والمنتهية صلاحيتها. حجزها لا يتأكد ولا يُبثّ — راجعها في جدول الجلسات أسفل الشاشة. و«٠» هنا معلومة صحيحة لا غياب.';
      return next;
      return;
    end;
  end if;

  -- ── (١-د) حسابات الدفع — الوارد الفعلي المعتمد ─────────────────────────
  if v_section = 'accounts' then
    declare
      v_c_amt numeric := 0; v_c_cnt numeric := 0;
      v_p_amt numeric := 0;
      v_active numeric := 0; v_facing numeric := 0;
    begin
      select coalesce(sum(p.amount), 0), count(*)::numeric
        into v_c_amt, v_c_cnt
        from public.payments p
       where p.status = 'approved'
         and (p.created_at at time zone 'Africa/Cairo')::date between v_from and v_to;

      select coalesce(sum(p.amount), 0) into v_p_amt
        from public.payments p
       where p.status = 'approved'
         and (p.created_at at time zone 'Africa/Cairo')::date between v_pfrom and v_pto;

      key := 'accounts_received'; label := 'وارد معتمد في الفترة'; value := v_c_amt;
      delta_percent := public.stats_delta(v_c_amt, v_p_amt); format := 'money';
      help := 'مجموع الدفعات التي اعتمدها فريقك في الفترة عبر كل حسابات التحصيل. المعلّق لم يدخل: إيصالٌ مرفوع ليس مالاً وصل حتى تتحقق منه.';
      return next;

      key := 'accounts_payments_count'; label := 'دفعات معتمدة'; value := v_c_cnt;
      delta_percent := null; format := 'number';
      help := 'عدد الدفعات المعتمدة في الفترة — يُقرأ مع المبلغ: مبلغ كبير بعدد صغير يعني حجوزات كبيرة، والعكس يعني عربوناً متكرراً.';
      return next;

      select count(*) filter (where a.active)::numeric,
             count(*) filter (where a.active and a.customer_facing)::numeric
        into v_active, v_facing
        from public.payment_accounts a;

      key := 'accounts_active'; label := 'حسابات مفعّلة'; value := v_active;
      delta_percent := null; format := 'number';
      help := 'صورة الآن: حسابات التحصيل المفعّلة (محافظ وانستا باي ونقدية وبنك). الحساب الذي بلغ حدّه اليومي يختفي من صفحة الدفع آلياً ويبقى مفعّلاً هنا.';
      return next;

      key := 'accounts_customer_facing'; label := 'ظاهرة للعميل'; value := v_facing;
      delta_percent := null; format := 'number';
      help := 'من الحسابات المفعّلة، كم حساباً يراه العميل في صفحة الدفع. صفرٌ هنا يعني أن العميل لا يجد وجهةً يحوّل إليها — والحجز يتوقف عند الدفع.';
      return next;
      return;
    end;
  end if;

  -- ── (١-هـ) الأسطول — حصة الفئات من الطلب ───────────────────────────────
  if v_section = 'fleet' then
    declare
      v_active numeric := 0;
      v_c_all  numeric := 0; v_c_booked numeric := 0; v_c_top numeric := 0;
      v_p_all  numeric := 0;
    begin
      select count(*) filter (where c.active)::numeric into v_active
        from public.vehicle_classes c;

      key := 'fleet_classes_active'; label := 'فئات مفعّلة'; value := v_active;
      delta_percent := null; format := 'number';
      help := 'صورة الآن: فئات السيارات المفعّلة والمعروضة للعميل. الفئة المطفأة لا تظهر في العروض مهما كانت مغطّاة بأسعار متعهدين.';
      return next;

      select count(*)::numeric, count(distinct b.class_slug)::numeric
        into v_c_all, v_c_booked
        from public.bookings b
       where b.class_slug is not null
         and (b.created_at at time zone 'Africa/Cairo')::date between v_from and v_to;

      select count(*)::numeric into v_p_all
        from public.bookings b
       where b.class_slug is not null
         and (b.created_at at time zone 'Africa/Cairo')::date between v_pfrom and v_pto;

      key := 'fleet_classes_booked'; label := 'فئات حُجزت في الفترة'; value := v_c_booked;
      delta_percent := null; format := 'number';
      help := 'كم فئة مختلفة وردت عليها حجوزات فعلاً. فجوةٌ بينها وبين «فئات مفعّلة» تعني فئةً تُعرض ولا تُطلب — راجع تعريفتها أو أهليتها بعدد الركاب.';
      return next;

      -- العدّاد يخرج دائماً؛ النسبة وحدها محروسة بالمقام (تصليب 0035 ق١)
      key := 'fleet_orders'; label := 'حجوزات على الأسطول'; value := v_c_all;
      delta_percent := public.stats_delta(v_c_all, v_p_all); format := 'number';
      help := 'حجوزات الفترة التي اختارت فئة سيارة. المرجع الكامل للطلبات في قسم الطلبات — هذا الرقم يخص الأسطول وحده، و«٠» فيه معلومة صحيحة لا غياب.';
      return next;

      if v_c_all > 0 then
        select max(t.n) into v_c_top from (
          select count(*)::numeric n from public.bookings b
           where b.class_slug is not null
             and (b.created_at at time zone 'Africa/Cairo')::date between v_from and v_to
           group by b.class_slug
        ) t;

        key := 'fleet_top_share'; label := 'نصيب الفئة الأولى';
        value := round(100.0 * v_c_top / v_c_all, 1);
        delta_percent := null; format := 'percent';
        help := 'حصة أكثر الفئات طلباً من حجوزات الفترة. تركّزٌ عالٍ يعني اعتماد إيرادك على فئة واحدة — ونقص متعهديها يوقف نصف عملك.';
        return next;
      end if;
      return;
    end;
  end if;

  -- ── (١-و) الخدمات الإضافية (الدفعة ٣) ──────────────────────────────────
  if v_section = 'extras' then
    declare
      v_active  numeric := 0;
      v_c_amt   numeric := 0; v_c_qty numeric := 0; v_c_bk numeric := 0;
      v_p_amt   numeric := 0;
      v_c_all_b numeric := 0;
    begin
      select count(*) filter (where e.active)::numeric into v_active
        from public.extra_services e;

      key := 'extras_active'; label := 'خدمات في الكتالوج'; value := v_active;
      delta_percent := null; format := 'number';
      help := 'صورة الآن: الخدمات المفعّلة المعروضة في ويدجت الحجز. الكتالوج الفارغ يجعل الميزة كاملةً في القاعدة ولا تفعل شيئاً — لا عنوان ولا صندوق يظهر للعميل.';
      return next;

      select coalesce(sum(x.line_total), 0), coalesce(sum(x.qty), 0),
             count(distinct x.booking_id)::numeric
        into v_c_amt, v_c_qty, v_c_bk
        from public.booking_extras x
       where (x.created_at at time zone 'Africa/Cairo')::date between v_from and v_to;

      select coalesce(sum(x.line_total), 0) into v_p_amt
        from public.booking_extras x
       where (x.created_at at time zone 'Africa/Cairo')::date between v_pfrom and v_pto;

      key := 'extras_revenue'; label := 'إيراد الخدمات'; value := v_c_amt;
      delta_percent := public.stats_delta(v_c_amt, v_p_amt); format := 'money';
      help := 'مجموع أسطر الخدمات في حجوزات الفترة، بلقطة السعر المجمَّدة وقت الحجز. الخدمة طبقةٌ فوق سعر الرحلة بعد الذروة والخصم — ولا تدخل أساس هامش المتعهد.';
      return next;

      key := 'extras_units'; label := 'وحدات مباعة'; value := v_c_qty;
      delta_percent := null; format := 'number';
      help := 'مجموع الكميات المطلوبة من كل الخدمات (كرسيا أطفال في حجز = وحدتان). يُقرأ مع الإيراد ليظهر أي الخدمات تُطلب كثيراً بسعر صغير.';
      return next;

      select count(*)::numeric into v_c_all_b
        from public.bookings b
       where (b.created_at at time zone 'Africa/Cairo')::date between v_from and v_to;

      if v_c_all_b > 0 then
        key := 'extras_attach_rate'; label := 'نسبة الحجوزات بخدمة';
        value := round(100.0 * v_c_bk / v_c_all_b, 1);
        delta_percent := null; format := 'percent';
        help := 'من حجوزات الفترة، كم حجزاً أضاف خدمة واحدة على الأقل. انخفاضها مع كتالوج ممتلئ يعني أن الخدمات لا تُرى في مسار الحجز أو أن سعرها طارد.';
        return next;
      end if;
      return;
    end;
  end if;

  -- ── (١-ز) طابور الإشعارات ──────────────────────────────────────────────
  if v_section = 'notifications' then
    declare
      v_c_all numeric := 0; v_c_sent numeric := 0; v_c_fail numeric := 0;
      v_p_all numeric := 0; v_p_sent numeric := 0;
      v_queued numeric := 0;
    begin
      select count(*)::numeric,
             count(*) filter (where n.status = 'sent')::numeric,
             count(*) filter (where n.status = 'failed')::numeric
        into v_c_all, v_c_sent, v_c_fail
        from public.notifications n
       where (n.created_at at time zone 'Africa/Cairo')::date between v_from and v_to;

      select count(*)::numeric,
             count(*) filter (where n.status = 'sent')::numeric
        into v_p_all, v_p_sent
        from public.notifications n
       where (n.created_at at time zone 'Africa/Cairo')::date between v_pfrom and v_pto;

      key := 'notif_count'; label := 'إشعارات الفترة'; value := v_c_all;
      delta_percent := public.stats_delta(v_c_all, v_p_all); format := 'number';
      help := 'كل ما دخل طابور الإشعارات في الفترة: جرس اللوحة وتليجرام والبريد. الجدول هو مصدر الحقيقة، والقنوات توزيع فوقه.';
      return next;

      if v_c_all > 0 then
        key := 'notif_delivery_rate'; label := 'معدل التسليم';
        value := round(100.0 * v_c_sent / v_c_all, 1);
        delta_percent := case when v_p_all > 0
          then public.stats_delta(100.0 * v_c_sent / v_c_all, 100.0 * v_p_sent / v_p_all)
          else null end;
        format := 'percent';
        help := '«أُرسل» من كل ما دخل الطابور. و«متجاوَز» ليس فشلاً: قناة بلا مفتاح (البريد بلا Resend، تليجرام بلا معرّف محادثة) تُوسم متجاوَزة بسبب واضح ولا تُحسب إرسالاً.';
        return next;
      end if;

      key := 'notif_failed'; label := 'فشل الإرسال'; value := v_c_fail;
      delta_percent := null; format := 'number';
      help := 'إشعارات استنفدت محاولاتها وفشلت فعلاً — لا المتجاوَزة. هذه أول سطح أخطاء في المنصة، ومنه تُقرأ أعطال القنوات قبل أن يشتكي أحد.';
      return next;

      select count(*)::numeric into v_queued
        from public.notifications n where n.status = 'queued';
      key := 'notif_queued'; label := 'في الطابور الآن'; value := v_queued;
      delta_percent := null; format := 'number';
      help := 'صورة الآن: ما ينتظر دورة الإرسال. تراكمه يعني أن عامل الإرسال متوقف — محلياً يُشغَّل يدوياً من هذه الشاشة، وعلى الإنتاج بجدولة vercel.json كل دقيقة.';
      return next;
      return;
    end;
  end if;

  -- ── (١-ح) تحويلات السيو ────────────────────────────────────────────────
  if v_section = 'redirects' then
    declare
      v_all numeric := 0; v_on numeric := 0; v_perm numeric := 0;
    begin
      select count(*)::numeric,
             count(*) filter (where r.enabled)::numeric,
             count(*) filter (where r.status_code in (301, 308))::numeric
        into v_all, v_on, v_perm
        from public.redirects r;

      key := 'redirects_total'; label := 'قواعد التحويل'; value := v_all;
      delta_percent := null; format := 'number';
      help := 'صورة الآن لا فترة: كل قواعد التحويل المسجَّلة. التحويل يحفظ عمر الرابط في نتائج البحث حين يتغيّر مسار صفحة — وعمر الرابط أصل لا يُشترى.';
      return next;

      key := 'redirects_enabled'; label := 'قواعد تعمل الآن'; value := v_on;
      delta_percent := null; format := 'number';
      help := 'المفعّلة منها فقط. القاعدة المطفأة تبقى محفوظة ولا يقرؤها الوسيط — تُستعمل لتعطيل تحويل مؤقتاً بلا فقدان صيغته.';
      return next;

      if v_all > 0 then
        key := 'redirects_permanent_rate'; label := 'نسبة الدائم (٣٠١/٣٠٨)';
        value := round(100.0 * v_perm / v_all, 1);
        delta_percent := null; format := 'percent';
        help := 'التحويل الدائم ينقل قيمة الرابط القديم إلى الجديد في تقييم محركات البحث؛ المؤقت (٣٠٢/٣٠٧) لا ينقلها. فالمؤقت المتروك سنةً يهدر ما بُني.';
        return next;
      end if;
      return;
    end;
  end if;
end;
$$;

comment on function public.pulse_stats(text, date, date) is
  'بطاقات نبض شاشة إدارية (الدفعة ٤ — الملاحظة ١٢، مصلَّبة في 0035). تفوّض الأقسام السبعة إلى section_stats ولا تعيد كتابتها (D-58). النسبة ذات المقام الصفري وحدها تُحذف؛ العدّاد يخرج دائماً ولو صفراً. العقد: lib/pulse-types.ts';

-- ----------------------------------------------------------------------------
-- (٢) pulse_series — إسقاط `'treasury'` (سطح محروس بلا مستهلك)
-- ----------------------------------------------------------------------------
-- الفرق عن المُنتَج الحيّ **موضعان**: حذف `'treasury'` من قائمة القبول ومن
-- فرع الاتحاد ومن جدول العناوين. وما عداه منقول حرفاً.
-- ----------------------------------------------------------------------------

create or replace function public.pulse_series(p_section text, p_from date, p_to date)
returns table (
  key    text,
  label  text,
  points jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_section text;
  v_from    date;
  v_to      date;
begin
  if not public.analytics_admin_allowed() then
    raise exception 'رسوم الشاشات متاحة للإدارة فقط' using hint = 'forbidden';
  end if;

  v_section := lower(nullif(btrim(coalesce(p_section, '')), ''));
  v_to   := coalesce(p_to, (now() at time zone 'Africa/Cairo')::date);
  v_from := coalesce(p_from, v_to - 13);

  if v_from > v_to then
    raise exception 'الفترة معكوسة: من % إلى %', v_from, v_to using hint = 'invalid-input';
  end if;

  if (v_to - v_from) > 400 then
    raise exception 'مدى الرسم أطول من ٤٠٠ يوم' using hint = 'invalid-input';
  end if;

  -- `treasury` مسحوبة في 0035: `/admin/finance` تملك مخطط تدفق نقدي كاملاً،
  -- فشرارةٌ فوقه تكرار — ولا مدخل في `PAGE_PULSE` كان يطلبها. تُعاد يوم توجد
  -- شاشة تستهلكها فعلاً.
  if v_section is null
     or v_section not in ('orders', 'dispatch', 'quotes', 'payments',
                          'accounts', 'extras', 'notifications') then
    raise exception
      'قسم رسم مجهول: «%» — المسموح: orders|dispatch|quotes|payments|accounts|extras|notifications',
      coalesce(nullif(btrim(coalesce(p_section, '')), ''), 'بلا')
      using hint = 'invalid-input';
  end if;

  return query
  with days as (
    select d::date as day from generate_series(v_from, v_to, interval '1 day') d
  ),
  raw as (
    select b.day, b.n from (
      select (x.created_at at time zone 'Africa/Cairo')::date as day, count(*)::numeric as n
        from public.bookings x
       where v_section = 'orders'
         and (x.created_at at time zone 'Africa/Cairo')::date between v_from and v_to
       group by 1
      union all
      select x.day, x.dispatches_count::numeric
        from public.v_stats_dispatch x
       where v_section = 'dispatch' and x.day between v_from and v_to
      union all
      select (x.created_at at time zone 'Africa/Cairo')::date, count(*)::numeric
        from public.quote_requests x
       where v_section = 'quotes'
         and (x.created_at at time zone 'Africa/Cairo')::date between v_from and v_to
       group by 1
      union all
      select (x.created_at at time zone 'Africa/Cairo')::date, count(*)::numeric
        from public.payment_intents x
       where v_section = 'payments'
         and (x.created_at at time zone 'Africa/Cairo')::date between v_from and v_to
       group by 1
      union all
      select (x.created_at at time zone 'Africa/Cairo')::date, coalesce(sum(x.amount), 0)
        from public.payments x
       where v_section = 'accounts' and x.status = 'approved'
         and (x.created_at at time zone 'Africa/Cairo')::date between v_from and v_to
       group by 1
      union all
      select (x.created_at at time zone 'Africa/Cairo')::date, coalesce(sum(x.line_total), 0)
        from public.booking_extras x
       where v_section = 'extras'
         and (x.created_at at time zone 'Africa/Cairo')::date between v_from and v_to
       group by 1
      union all
      select (x.created_at at time zone 'Africa/Cairo')::date, count(*)::numeric
        from public.notifications x
       where v_section = 'notifications'
         and (x.created_at at time zone 'Africa/Cairo')::date between v_from and v_to
       group by 1
    ) b
  ),
  filled as (
    select d.day, coalesce(r.n, 0) as n
      from days d left join raw r on r.day = d.day
     order by d.day
  )
  select
    v_section,
    case v_section
      when 'orders'        then 'حجوزات'
      when 'dispatch'      then 'دورات بث'
      when 'quotes'        then 'طلبات عروض'
      when 'payments'      then 'جلسات دفع'
      when 'accounts'      then 'وارد معتمد'
      when 'extras'        then 'إيراد الخدمات'
      when 'notifications' then 'إشعارات'
    end,
    coalesce(
      jsonb_agg(jsonb_build_object('bucket', to_char(f.day, 'YYYY-MM-DD'), 'value', f.n)
                order by f.day),
      '[]'::jsonb)
  from filled f;
end;
$$;

comment on function public.pulse_series(text, date, date) is
  'سلسلة يومية مصغّرة لرسم نبض الشاشة (الدفعة ٤ — الملاحظة ١٢، مصلَّبة في 0035). سبعة أقسام لها بُعد زمني صادق؛ نقطة لكل يوم في المدى ولو صفراً. العقد: lib/pulse-types.ts';

-- ----------------------------------------------------------------------------
-- الصلاحيات — تُعاد لأن `create or replace` لا يمسّها، والتأكيد أرخص من الافتراض
-- ----------------------------------------------------------------------------

revoke all on function public.pulse_stats(text, date, date)  from public, anon;
revoke all on function public.pulse_series(text, date, date) from public, anon;

grant execute on function public.pulse_stats(text, date, date)  to authenticated, service_role;
grant execute on function public.pulse_series(text, date, date) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- فحص ذاتي — يحرس ما كان قائماً (D-58) قبل ما أُصلح
-- ----------------------------------------------------------------------------
do $$
declare
  v_pulse  text;
  v_series text;
  v_sect   text;
  v_cnt    integer;
begin
  v_pulse  := pg_get_functiondef(to_regprocedure('public.pulse_stats(text,date,date)')::oid);
  v_series := pg_get_functiondef(to_regprocedure('public.pulse_series(text,date,date)')::oid);
  if coalesce(v_pulse, '') = '' or coalesce(v_series, '') = '' then
    raise exception '0035: مسبار الدالتين معطّل — لا تصدّق ما بعده';
  end if;

  -- (أ) ما حرسته 0034 ما زال قائماً: التفويض، وسلامة section_stats
  if position('public.section_stats(' in v_pulse) = 0 then
    raise exception '0035: التفويض إلى section_stats سقط أثناء التصليب (D-58)';
  end if;
  v_sect := pg_get_functiondef(to_regprocedure('public.section_stats(text,date,date)')::oid);
  if position('''discounts''' in v_sect) = 0 then
    raise exception '0035: section_stats فقدت قسم discounts';
  end if;
  if position('''notifications''' in v_sect) > 0 then
    raise exception '0035: section_stats كُتبت فوقها أقسام النبض';
  end if;
  if position('analytics_admin_allowed' in v_pulse) = 0
     or position('analytics_admin_allowed' in v_series) = 0 then
    raise exception '0035: حارس إداري مفقود من إحدى الدالتين';
  end if;

  -- (ب) وما أصلحته 0035: العدّادان خارج حارس النسبة
  --     الشاهد نصّي ودقيق: العبارة التي أُضيفت لكل منهما لا توجد إلا خارج `if`
  if position('و«٠» فيه معلومة صحيحة لا غياب' in v_pulse) = 0 then
    raise exception '0035: fleet_orders لم يخرج من حارس النسبة';
  end if;
  if position('و«٠» هنا معلومة صحيحة لا غياب' in v_pulse) = 0 then
    raise exception '0035: payment_failed_count لم يخرج من حارس النسبة';
  end if;

  -- (ج) و`treasury` لم تعد مقبولة في الرسم
  if position('''treasury''' in v_series) > 0 then
    raise exception '0035: pulse_series ما زالت تقبل treasury';
  end if;

  -- (د) والمنح كما يجب: لا anon، ومنحة authenticated قائمة (جلسة المشرف تمر بها)
  select count(*) into v_cnt
    from information_schema.routine_privileges
   where specific_schema = 'public'
     and routine_name in ('pulse_stats', 'pulse_series')
     and grantee = 'anon';
  if v_cnt > 0 then
    raise exception '0035: anon يملك تنفيذاً على دوال النبض';
  end if;

  select count(*) into v_cnt
    from information_schema.routine_privileges
   where specific_schema = 'public'
     and routine_name in ('pulse_stats', 'pulse_series')
     and grantee = 'authenticated'
     and privilege_type = 'EXECUTE';
  if v_cnt <> 2 then
    raise exception '0035: منحة authenticated ناقصة (%) — بدونها تعمى كل الأشرطة', v_cnt;
  end if;

  raise notice '✔ 0035: العدّادان يخرجان دائماً، وtreasury مسحوبة من الرسم، والتفويض والحارس والمنح سليمة';
end;
$$;
