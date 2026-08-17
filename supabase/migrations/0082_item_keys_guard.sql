-- ============================================================================
-- 0082 — مفتاح العنصر `_k` يصير **شكلاً لا يُكتب مخالفاً**: الصفوف الجريحة
--        تُشفى مرةً واحدة، والباب يُغلق بحارسٍ في القاعدة لا في الواجهة.
--
-- العقد المُلزِم: `lib/page-builder-types.ts` §٤ · `lib/page-builder/item-keys.ts`
-- · `supabase/migrations/0059_i18n_stable_item_keys.sql` (طبقة العنونة).
--
-- ── العطب كما قِيس حيّاً (2026-08-17)، لا كما يُتوقَّع ──────────────────────
--
-- المالك حرّر الجُمل المتناوبة في بطل الرئيسية فرُفض حفظه بـ`item-key`. وكتلة
-- البطل **مفاتيحها سليمة** (‏`hrtcnl` · `hrtwat` · `hrtpay`): الرفض جاء من كتلٍ
-- أخرى على الصفحة نفسها، لأن الحفظ حفظةٌ واحدة للصفحة كلها (D-48) فرفضُ كتلةٍ
-- يرفض عمل الصفحة كله.
--
-- والمقيس بأعيانه — **خمسة صفوف** عناصرها بلا `_k` إطلاقاً (لا مكررة ولا
-- مخالفة للنمط، بل **غائبة**، وهي الحالة التي لم تكن في نصّ الرسالة أصلاً):
--
--   home             features  ٣ عناصر   9ed05691-8aec-4329-a5e0-4af7bf8ee258
--   home             features  ٦ عناصر   0b610000-0000-4000-8000-000000000004
--   home             faq       ٥ عناصر   4462750b-f403-436d-9270-738c80e5de9c
--   cairo-alexandria features  ٣ عناصر   761fabdc-170e-4335-8f98-49b209822dca
--   cairo-alexandria faq       ٣ عناصر   31430970-7116-4c05-b11a-0df123412c33
--
-- 🔴 **ومن سرقها معروفٌ بالنصّ لا بالظنّ:** الصفّ الثاني كتبته `0062` بمفاتيحه
--    (‏`gr1prc` … `gr6acc`) — وهي غائبةٌ اليوم ونصوصها كما هي حرفاً. أي أنها
--    **سُلبت بعد الكتابة**. والسالب `app/admin/content/[id]/_components/section-fields.tsx`:
--    كان يُسقط العنصر إلى حقلَيه النصّيين قبل أن يرسله إلى جزيرة التحرير
--    (`{ q: it.q, a: it.a }`)، فيعود من المتصفح بلا مفتاح ويُكتب بلا مفتاح.
--    وحارسُ الخادم (‏`ITEM_PRESERVED_KEYS`) كان ينقل بأمانةٍ **ما لم يُرسَل قط**.
--    عولج في الطبقة نفسها مع هذه الهجرة، وإلا شفينا الصفوف اليوم لتُجرح غداً.
--
-- ── ثمن السكّ اليوم: **صفر**، والنافذة تُغلق عند أول ترجمة منشورة ───────────
--
-- سكُّ المفتاح ينقل عنوان ترجمة العنصر من ترتيبه إلى مفتاحه (‏`0059` §القرار
-- (أ): سقوطُ عنونةٍ لا سقوطُ بحث). والمقيس قبل كتابة سطرٍ واحد:
--
--   select count(*) from public.translations
--    where key ~ '\.items\.[0-9]+\.'                        ⇒ **صفر**
--   select count(*), status from public.translations         ⇒ ٦٥ صفاً، **كلها `draft`**
--
-- ⇒ لا ترجمةَ إنسانٍ منشورة تُسقَط، ولا مفتاحَ منشورٍ يُسحب (العقد §١). وتأجيلُ
--   هذا إلى ما بعد أول ترجمة منشورة يضاعف كلفته — وهي نفس النافذة التي وصفتها
--   `0059` و`0065`، وما زالت مفتوحة.
--
-- ⚠ **وما لا تفعله هذه الهجرة:** لا تلمس نصّاً واحداً من محتوى المالك. الإضافة
--    مفتاحٌ واحد لكل عنصرٍ ينقصه، بـ`||` لا باستبدال، والفحص §(٤) يثبت أن كل
--    حقلٍ نصّي خرج كما دخل.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (١) سكّاك المفاتيح في القاعدة — **مرآة `mintItemKey`** في
--     `lib/page-builder/item-keys.ts`، ست خانات من `[a-z0-9]`.
--
-- ولماذا في القاعدة أصلاً والسكّ يقع في المتصفح؟ لأن الشفاء والحارس كلاهما
-- هنا، ولأن `md5` وحده لا يكفي: أبجديته ست عشرة خانة (`[0-9a-f]`) فتعطي
-- ٦^١٦ فضاءً أضيق ألف مرة من ٣٦^٦ — والتصادم يعني عنوانَي ترجمةٍ واحداً
-- لعنصرين، وهو **إفسادُ بيانات** لا نقصٌ يُقرأ.
-- ----------------------------------------------------------------------------

create or replace function public.mint_item_key(p_taken text[] default '{}')
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_alphabet constant text := 'abcdefghijklmnopqrstuvwxyz0123456789';
  v_key text;
  i int;
begin
  for attempt in 1..50 loop
    v_key := '';
    for i in 1..6 loop
      v_key := v_key || substr(v_alphabet, 1 + floor(random() * 36)::int, 1);
    end loop;
    if not (v_key = any(coalesce(p_taken, '{}'))) then
      return v_key;
    end if;
  end loop;
  -- خمسون محاولةً فاشلة على فضاء ٢ مليار مفتاح تعني عطباً في مصدر العشوائية
  -- لا حظاً سيئاً — والصمت هنا يعني عنوان ترجمة مكرراً.
  raise exception 'تعذّر سكّ مفتاح عنصر فريد';
end;
$$;

comment on function public.mint_item_key(text[]) is
  'مفتاح عنصر `_k`: ست خانات [a-z0-9] لا تُصادم ما في p_taken — مرآة mintItemKey في lib/page-builder/item-keys.ts';

-- ----------------------------------------------------------------------------
-- (٢) الحكم على مصفوفة عناصر — **دالةٌ واحدة يقرؤها الحارس والاختبار معاً**
--
-- ترجع رمز الرفض أو `null`. ورمزٌ لا جملة، فيسافر في `hint` كما تفعل
-- `sections_guard_depth` منذ `0058` — والشاشة تترجمه.
-- ----------------------------------------------------------------------------

create or replace function public.items_key_check(p_items jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_items is null or p_items = 'null'::jsonb then null
    when jsonb_typeof(p_items) <> 'array' then 'template-shape'
    -- عنصرٌ ليس كائناً مسطّحاً: نفس حكم `isItemArray` في العقد
    when exists (
      select 1 from jsonb_array_elements(p_items) e where jsonb_typeof(e) <> 'object'
    ) then 'template-shape'
    -- الحالات الثلاث في رمزٍ واحد: غائب · مخالف للنمط · مكرر
    when exists (
      select 1 from jsonb_array_elements(p_items) e
      where coalesce(e ->> '_k', '') !~ '^[a-z0-9]{6}$'
    ) then 'item-key'
    when (select count(distinct e ->> '_k') from jsonb_array_elements(p_items) e)
       <> (select count(*) from jsonb_array_elements(p_items) e) then 'item-key'
    else null
  end;
$$;

comment on function public.items_key_check(jsonb) is
  'رمز رفض مصفوفة العناصر أو null — مرآة itemsAreKeyed/isItemArray في lib/page-builder/item-keys.ts';

-- ----------------------------------------------------------------------------
-- (٢-ب) لقطة الفهرس **قبل** الشفاء — سابقة `0059` §(٥-١) و`0065` §٧ حرفاً.
--
-- والعدُّ وحده لا يكفي: عدٌّ متساوٍ قد يخفي تبادلاً (مفتاحٌ سقط وآخر وُلد).
-- فالمحفوظ هنا **المجموعة** لا الرقم، والمقارنة في §(٥) بالفرق لا بالعدد.
-- ----------------------------------------------------------------------------

create temporary table _corpus_before on commit drop as
select ns, k from public.i18n_corpus_rows();

-- ----------------------------------------------------------------------------
-- (٣) الشفاء — **مرة واحدة، وبـ`||` لا باستبدال**
--
-- كل عنصرٍ ينقصه مفتاحٌ صالح يكتسب واحداً فريداً **داخل صفّه**، والعناصر التي
-- تحمل مفاتيح صالحة تبقى بحرفها (المفتاح المنشور لا يُسحب — العقد §١).
-- ----------------------------------------------------------------------------

do $$
declare
  r            record;
  v_items      jsonb;
  v_taken      text[];
  v_out        jsonb;
  v_el         jsonb;
  v_key        text;
  v_rows       int := 0;
  v_minted     int := 0;
  v_before_txt jsonb;
  v_after_txt  jsonb;
begin
  for r in
    select s.id, p.slug, s.type, s.content
    from public.sections s
    join public.pages p on p.id = s.page_id
    where public.items_key_check(s.content -> 'items') = 'item-key'
    order by p.slug, s.sort
  loop
    v_items := r.content -> 'items';

    -- (أ) لقطة النصّ قبل السكّ: كل ما ليس `_k`، بترتيبه — تُقارن بعد السكّ
    select jsonb_agg(t.el - '_k' order by t.ord)
      into v_before_txt
    from jsonb_array_elements(v_items) with ordinality t(el, ord);

    -- (ب) المفاتيح الصالحة القائمة تُحجز أولاً فلا يُصادمها المسكوك
    select coalesce(array_agg(x.k), '{}')
      into v_taken
    from (
      select el ->> '_k' as k
      from jsonb_array_elements(v_items) el
      where coalesce(el ->> '_k', '') ~ '^[a-z0-9]{6}$'
    ) x;

    v_out := '[]'::jsonb;
    for v_el in select x.el from jsonb_array_elements(v_items) x(el) loop
      if coalesce(v_el ->> '_k', '') ~ '^[a-z0-9]{6}$'
         and (select count(*) from jsonb_array_elements(v_items) d(el)
              where d.el ->> '_k' = v_el ->> '_k') = 1 then
        v_out := v_out || jsonb_build_array(v_el);
      else
        v_key := public.mint_item_key(v_taken);
        v_taken := v_taken || v_key;
        v_minted := v_minted + 1;
        -- 🔒 `||` على الكائن: يضيف المفتاح ولا يستبدل حقلاً — سابقة `0064`/`0071`
        v_out := v_out || jsonb_build_array(v_el || jsonb_build_object('_k', v_key));
      end if;
    end loop;

    update public.sections
       set content = content || jsonb_build_object('items', v_out)
     where id = r.id;

    -- (ج) 🔴 شرط الإغلاق على هذا الصفّ: **النصّ لم يتغيّر بايتاً**
    select jsonb_agg(t.el - '_k' order by t.ord)
      into v_after_txt
    from public.sections s,
         jsonb_array_elements(s.content -> 'items') with ordinality t(el, ord)
    where s.id = r.id;

    if v_before_txt is distinct from v_after_txt then
      raise exception '0082: السكّ غيّر نصّ العناصر في الصفّ % (%/%) — %  ≠  %',
        r.id, r.slug, r.type, v_before_txt, v_after_txt;
    end if;

    v_rows := v_rows + 1;
    raise notice '0082 · شُفي: % / % (%) — % مفتاحاً', r.slug, r.type, r.id, jsonb_array_length(v_out);
  end loop;

  raise notice '0082 · الشفاء: % صفاً، % مفتاحاً مسكوكاً', v_rows, v_minted;
end $$;

-- ----------------------------------------------------------------------------
-- (٤) الحارس — **في القاعدة لا في الـ Server Action**
--
-- نفس مبرر `sections_guard_depth` في `0058` §(٩) حرفاً: الإدراج عبر PostgREST
-- أو من محرر SQL يتخطى الواجهة. والعطب الذي عالجناه للتوّ **وُلد في واجهة**
-- ونجا من حارسٍ في واجهةٍ أخرى — فالحدّ يعيش حيث لا يُتخطى.
--
-- ⚠ وهو يقع على `content` وحده، فلا يدفع تحديثُ `sort` في إعادة الترتيب ثمنَه.
-- ----------------------------------------------------------------------------

create or replace function public.sections_guard_item_keys()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_code text;
begin
  -- تعديلٌ لا يمسّ المحتوى يمرّ كما هو (إعادة الترتيب تحدّث `sort` لعشرات الصفوف)
  if tg_op = 'UPDATE' and new.content is not distinct from old.content then
    return new;
  end if;

  v_code := public.items_key_check(new.content -> 'items');
  if v_code is null then
    return new;
  end if;

  if v_code = 'item-key' then
    raise exception 'عنصرٌ في «%» بلا مفتاح ثابت صالح وفريد — والمفتاح عنوان ترجمته', new.type
      using hint = 'item-key';
  end if;

  raise exception '«items» في «%» ليست مصفوفة كائناتٍ مسطّحة', new.type
    using hint = 'template-shape';
end;
$$;

drop trigger if exists sections_guard_item_keys on public.sections;
create trigger sections_guard_item_keys
  before insert or update on public.sections
  for each row execute function public.sections_guard_item_keys();

-- ----------------------------------------------------------------------------
-- (٥) الفحص الذاتي — عدٌّ **و**شاهدٌ إيجابي، فلا يمرّ الحجب لأن لا شيء يُحجب
-- ----------------------------------------------------------------------------

do $$
declare
  v_bad     int;
  v_keyed   int;
  v_ordinal int;
  v_rejected boolean := false;
  v_page    uuid;
begin
  -- (أ) لا صفَّ واحداً يرفضه الحكم بعد الشفاء
  select count(*) into v_bad
  from public.sections s
  where public.items_key_check(s.content -> 'items') is not null;
  if v_bad <> 0 then
    raise exception '0082: بقي % صفاً يرفضه حارس المفاتيح بعد الشفاء', v_bad;
  end if;

  -- (ب) 🔴 شاهدٌ إيجابي: صفوفٌ حيّة تحمل عناصر مفتاحة فعلاً — وإلا كان
  --     «صفر مخالفات» إثباتَ فراغٍ لا إثباتَ حراسة (القاعدة الذهبية ١٩)
  select count(*) into v_keyed
  from public.sections s
  where jsonb_typeof(s.content -> 'items') = 'array'
    and jsonb_array_length(s.content -> 'items') > 0;
  if v_keyed < 50 then
    raise exception '0082: شاهدٌ إيجابي غائب — % صفاً فقط يحمل عناصر', v_keyed;
  end if;

  -- (ج) الفهرس: لم يبقَ عنوانٌ ترتيبيٌّ واحد لعنصر
  select count(*) into v_ordinal
  from public.i18n_corpus_rows() c
  where c.ns = 'section' and c.k ~ '\.items\.[0-9]+\.';
  if v_ordinal <> 0 then
    raise exception '0082: بقي % عنواناً ترتيبياً في الفهرس', v_ordinal;
  end if;

  -- (ج-٢) 🔴 **الفرق بالمجموعة لا بالعدد** (‏`0059` §(٥-١)):
  --   • ما خرج يجب أن يكون **عناوين ترتيبية وحدها** — لا نصَّ فقدناه.
  --   • ما دخل يجب أن يكون **عناوين مفتاحة وحدها** — لا نصَّ اخترعناه.
  --   • والعدد الكلي لا يتحرك: عنونةٌ تبدّلت، لا محتوى.
  if exists (
    select 1 from (select ns, k from _corpus_before
                   except select ns, k from public.i18n_corpus_rows()) d
    where d.k !~ '\.items\.[0-9]+\.'
  ) then
    raise exception '0082: سقط من الفهرس مفتاحٌ ليس عنواناً ترتيبياً — نصٌّ فُقد لا عنونةٌ تبدّلت';
  end if;

  if exists (
    select 1 from (select ns, k from public.i18n_corpus_rows()
                   except select ns, k from _corpus_before) d
    where d.k !~ '\.items\.[a-z0-9]{6}\.'
  ) then
    raise exception '0082: دخل الفهرس مفتاحٌ ليس عنواناً مفتاحاً — نصٌّ اخترعته الهجرة';
  end if;

  if (select count(*) from _corpus_before) <> (select count(*) from public.i18n_corpus_rows()) then
    raise exception '0082: عدد صفوف الفهرس تغيّر (% ⇐ %) — والعنونة وحدها كان يجب أن تتبدّل',
      (select count(*) from _corpus_before), (select count(*) from public.i18n_corpus_rows());
  end if;

  -- (د) 🔒 الحارس حيٌّ فعلاً — يُنادى لا يُفترض (القاعدة الذهبية ١٩)
  select id into v_page from public.pages limit 1;
  begin
    insert into public.sections (page_id, type, content, sort, visible)
    values (v_page, 'faq', '{"items":[{"q":"س","a":"ج"}]}'::jsonb, 9999, false);
  exception when others then
    if sqlerrm like '%بلا مفتاح ثابت%' then v_rejected := true; end if;
  end;
  if not v_rejected then
    raise exception '0082: الحارس قَبِل عنصراً بلا مفتاح — الشكل المخالف ما زال يُكتب';
  end if;
  -- وما أُدرج في المحاولة الفاشلة لا يبقى: الاستثناء أرجع الإدراج نفسه.

  raise notice '0082 OK — صفر مخالفة على % صفاً يحمل عناصر، وصفر عنوانٍ ترتيبي، والحارس يرفض حيّاً',
    v_keyed;
end $$;
