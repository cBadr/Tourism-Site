"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Search, X } from "lucide-react";

import { toArabicDigits } from "@/components/booking/format";
import { HelpTip } from "@/components/shared/HelpTip";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

/**
 * بحثُ المسارات — **يرشّح مع كل حرف**، وبغير مسطرتين.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  🔴 الشكوى التي وُلد منها، بنصّ المالك (2026-08-18)
 * ══════════════════════════════════════════════════════════════════════════
 *
 *   «عند البحث في المسارات أرى أن البحث قد لا يناسبني، بحيث أنه يجب أن يتم
 *    فلترة نتائج البحث كلما كتبت أحرفاً في خانة البحث.»
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  القرار، مبنيّاً على العدد لا على الحدس
 * ══════════════════════════════════════════════════════════════════════════
 *
 * المقيس على القاعدة الحيّة (2026-08-18): **١٠٠ مسار**، كلُّها معتمدة. وسقفُ
 * `admin_search_routes` نفسها **٢٠٠ صف** لكل نداء. فالمجموعة كلُّها تسع في
 * صفحةٍ واحدة ⇒ **الترشيح في المتصفح، بلا نداءٍ واحد**.
 *
 * والقياس: ترشيحُ المئة صفّ **0.043 ملّي ثانية** للضغطة الواحدة (متوسّط ألف
 * دورة، مع تخبئة مفاتيح التطبيع). أي أن النداء — أيَّ نداء — أغلى من الترشيح
 * كلِّه بثلاثة أوامر عشرية على الأقل.
 *
 * ── ولا عتبةٌ مكتوبة بالحدس ────────────────────────────────────────────────
 *
 * العتبة **تُقرأ من الصفحة نفسها** لا تُخمَّن: `RoutesCount` تكتب في الـDOM
 * «كم عُرض» و«كم المطابق كلُّه». وحين يتساويان — أي أن النافذة المحمَّلة هي
 * المجموعة كلُّها — يقع الترشيح محلياً. وحين يفترقان (مالكٌ تجاوز ٢٠٠ مسار)
 * **يسقط إلى الدالة بخانقٍ زمنيّ ٣٠٠ms**: نداءٌ واحد لكل توقّفٍ عن الكتابة، لا
 * نداءٌ لكل حرف.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  🔴 والمسطرةُ واحدة — وهذا أخطر ما في هذا الملف
 * ══════════════════════════════════════════════════════════════════════════
 *
 * لو رشّح المتصفح بقواعدَ غير قواعد `admin_search_routes` لصار للبحث مسطرتان:
 * يجد المستخدم نتيجةً بالزرّ ولا يجدها بالكتابة — وهو عطلٌ يُفقد الثقة في
 * الشاشة كلها ولا يُنتج خطأً يظهر في سجلّ.
 *
 * فالدوالُّ أدناه **ميناءٌ حرفيّ** لثلاث دوال قرأتُها من القاعدة الحيّة بـ
 * `pg_get_functiondef` (‏D-58) لا من ملف هجرة: `normalize_arabic` و
 * `arabic_search_key` و`arabic_strip_clitics`، ثم شرطُ المطابقة في
 * `admin_search_routes` نفسه (كلُّ كلمةٍ التصاقاً، أو التصاقُ النصّ غير المجرَّد).
 *
 * **والاتفاق مُثبَتٌ بنداءٍ حيّ لا بقراءة** (القاعدة الذهبية ١٩)، على المئة صفّ:
 *
 *   | ما قيس | النتيجة |
 *   |---|---|
 *   | `arabic_search_key` لكل صفّ: Postgres مقابل JS | ١٠٠/١٠٠ متطابقة، صفر اختلاف |
 *   | النصّ الملتصق لكل صفّ: Postgres مقابل JS | ١٠٠/١٠٠ متطابقة، صفر اختلاف |
 *   | مجموعاتُ المعرّفات لاثنتَي عشرة عيّنة | متطابقة كلُّها |
 *
 *   ومنها عيّناتُ المالك نفسها: «الاسكندريه» ⇐ ٤٧ · «اسكندريه قاهره» ⇐ ٤
 *   · «مطار» ⇐ ١٩ · «الأسكندرية» ⇐ ٤٧ (نفسُ الـ٤٧) · «بالقاهرة» ⇐ ٥٣
 *   · «والاسكندرية» ⇐ ٤٧.
 *
 * **وأُثبت بالطفرة أنه شاهدٌ يحمرّ**: نُزع تجريدُ السوابق ⇒ سقطت ٣ عيّنات؛
 * وأُبطل ردُّ التاء المربوطة ⇒ اختلف ١٠٠/١٠٠ مفتاح وسقطت ٣ عيّنات. ثم أُعيد
 * كلاهما حرفياً.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ⚠ حدودٌ مُعلَنة
 * ══════════════════════════════════════════════════════════════════════════
 *
 * (١) **الترشيح المحلي لا يقع إلا والبحثُ الخادميّ فارغ** (`query === ""`).
 *     وإلا كانت النافذة المحمَّلة **مرشَّحةً سلفاً**، فحذفُ حرفٍ لا يستطيع أن
 *     يُرجع صفّاً غادر الخادم — أي ترشيحٌ يكذب حين يُوسَّع.
 * (٢) **الترشيح المحلي لا يكتب في العنوان.** فمن أراد رابطاً يُشارَك أو يُحدَّث
 *     ضغط Enter أو زرّ «بحث»، والنموذج `GET` كما كان. وهذا يُبقي الشاشة عاملةً
 *     بلا جافاسكربت إطلاقاً — وهو عهدُ اللوحة كلِّها.
 * (٣) **العثورُ على الصفوف في الـDOM يفشل مغلقاً**: لا صفوفَ موسومة ⇒ لا ترشيحَ
 *     محليّ ⇒ سقوطٌ إلى الخانق. فخطأُ اسمِ سمةٍ يُنزلنا إلى سلوك الأمس، ولا
 *     يكسر بحثاً.
 *
 * 🔗 **والسمات التي تُقرأ هنا يكتبها `routes-search.tsx`**: `data-route-id` و
 *    `data-route-hay` على كل صفّ (وبطاقةِ الموبايل)، و`data-routes-window`
 *    بعدَّاديها على سطر الحصيلة، و`data-routes-table` على غلافَي الجدول.
 *    تغييرُ أيٍّ منها هناك يجب أن يُغيَّر هنا.
 */

/* ═════════════════════════════════════════════════════════════════════════ *
 * (أ) ميناءُ التطبيع العربي — نسخةٌ حرفية عن القاعدة الحيّة
 * ═════════════════════════════════════════════════════════════════════════ */

/**
 * ما تحذفه `normalize_arabic` أوّلاً: التشكيل والتطويل ومحارف الاتجاه الخفيّة.
 * نفس المدى حرفاً بحرف، وبـ`\uXXXX` لا بمحارف ملصقة — فمحرفٌ غير مرئيّ في ملف
 * مصدر لا يُراجَع ولا يُقارَن.
 */
const INVISIBLE =
  /[\u064b-\u065f\u0670\u06d6-\u06ed\u0640\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g;

/** جدولُ `translate` نفسه: الهمزات ⇐ ألف، التاء المربوطة ⇐ هاء، الأرقام ⇐ لاتينية */
const FOLD = new Map<string, string>([
  ["أ", "ا"], // أ
  ["إ", "ا"], // إ
  ["آ", "ا"], // آ
  ["ٱ", "ا"], // ٱ
  ["ؤ", "و"], // ؤ
  ["ئ", "ي"], // ئ
  ["ة", "ه"], // ة
  ["ى", "ي"], // ى
  ["ک", "ك"], // ک الفارسية
  ["ی", "ي"], // ی الفارسية
  ["٠", "0"], ["١", "1"], ["٢", "2"], ["٣", "3"], ["٤", "4"],
  ["٥", "5"], ["٦", "6"], ["٧", "7"], ["٨", "8"], ["٩", "9"],
  ["۰", "0"], ["۱", "1"], ["۲", "2"], ["۳", "3"], ["۴", "4"],
  ["۵", "5"], ["۶", "6"], ["۷", "7"], ["۸", "8"], ["۹", "9"],
]);

const FOLD_RE =
  /[\u0623\u0625\u0622\u0671\u0624\u0626\u0629\u0649\u06a9\u06cc\u0660-\u0669\u06f0-\u06f9]/g;

/** ما تُبقيه الدالة: الكتلة العربية و`a-z` و`0-9` — وما عداه فاصل */
const NON_KEPT = /[^\u0600-\u06ffa-z0-9]+/g;
const SPACES = /[\s\u00a0]+/g;

/** `public.normalize_arabic(text)` */
function normalizeArabic(text: string): string {
  return text
    .replace(INVISIBLE, "")
    .toLowerCase()
    .replace(FOLD_RE, (ch) => FOLD.get(ch) ?? ch)
    .replace(SPACES, " ")
    .trim();
}

/**
 * `public.arabic_strip_clitics(word)` — ثلاث دوراتٍ بنفس الشروط والأطوال.
 * والأطوالُ ليست زخرفة: «وال» وحدها كلمةٌ، و«الاء» ثلاثةُ أحرفٍ لا تُجرَّد.
 */
function stripClitics(word: string): string {
  let w = word;
  for (let i = 0; i < 3; i += 1) {
    if (w.startsWith("و") && w.length >= 4) w = w.slice(1);
    else if (/^[بكلف]ال/.test(w) && w.length >= 6) w = w.slice(1);
    else if (w.startsWith("ال") && w.length >= 5) w = w.slice(2);
    else break;
  }
  return w;
}

/** `public.arabic_search_key(text)` */
function searchKey(text: string): string {
  return normalizeArabic(text)
    .replace(NON_KEPT, " ")
    .split(" ")
    .filter((w) => w !== "")
    .map(stripClitics)
    .join(" ");
}

/** النصُّ الملتصق الذي تبنيه الدالة للفرع (ب): مطبَّعٌ **بلا** تجريد سوابق */
function gluedKey(text: string): string {
  return normalizeArabic(text).replace(NON_KEPT, "");
}

type Needle = { key: string; words: string[]; glued: string };

function makeNeedle(query: string): Needle {
  const key = searchKey(query);
  return { key, words: key.split(" ").filter((w) => w !== ""), glued: gluedKey(query) };
}

/**
 * شرطُ `where` في `admin_search_routes` حرفاً بحرف:
 * فارغٌ = تصفّحٌ لا ترشيح · أو كلُّ كلمةٍ التصاقاً (`~~ all`) · أو التصاقُ الملتصق.
 */
function hitsNeedle(hayKey: string, hayGlued: string, needle: Needle): boolean {
  if (needle.key === "") return true;
  if (needle.words.every((w) => hayKey.includes(w))) return true;
  return needle.glued !== "" && hayGlued.includes(needle.glued);
}

/**
 * تخبئةُ مفاتيح الصفوف: النصُّ الخام نفسه هو المفتاح، فلا تُحسب المئةُ مرّتين
 * لحرفين متتاليين. وحدُّها مُعلَن كي لا تنمو بلا سقف في جلسةٍ طويلة.
 */
const KEY_CACHE = new Map<string, { key: string; glued: string }>();

function haystackKeys(hay: string): { key: string; glued: string } {
  const cached = KEY_CACHE.get(hay);
  if (cached) return cached;
  const computed = { key: searchKey(hay), glued: gluedKey(hay) };
  if (KEY_CACHE.size < 2000) KEY_CACHE.set(hay, computed);
  return computed;
}

/* ═════════════════════════════════════════════════════════════════════════ *
 * (ب) قراءةُ ما رسمه الخادم
 * ═════════════════════════════════════════════════════════════════════════ */

/** معرّفاتُ الصفوف تدخل مُحدِّدَ CSS — فلا يُقبل منها إلا شكلُ UUID */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type DomRow = { id: string; key: string; glued: string };

/** صفوفُ الصفحة بمعرّفاتها ونصوصها — والصفُّ مرسومٌ مرتين (جدول + بطاقة) فيُوحَّد */
function readRows(): DomRow[] {
  if (typeof document === "undefined") return [];
  const seen = new Set<string>();
  const rows: DomRow[] = [];
  for (const node of document.querySelectorAll<HTMLElement>("[data-route-id][data-route-hay]")) {
    const id = node.dataset.routeId ?? "";
    if (!UUID.test(id) || seen.has(id)) continue;
    seen.add(id);
    const { key, glued } = haystackKeys(node.dataset.routeHay ?? "");
    rows.push({ id, key, glued });
  }
  return rows;
}

/** «كم عُرض» و«كم المطابق كلُّه» كما كتبهما `RoutesCount` — لا كما نظنّهما */
function readWindow(): { shown: number; total: number } | null {
  if (typeof document === "undefined") return null;
  const node = document.querySelector<HTMLElement>("[data-routes-window]");
  if (!node) return null;
  const shown = Number(node.dataset.routesShown);
  const total = Number(node.dataset.routesTotal);
  if (!Number.isFinite(shown) || !Number.isFinite(total)) return null;
  return { shown, total };
}

/* ═════════════════════════════════════════════════════════════════════════ *
 * (ج) النموذج
 * ═════════════════════════════════════════════════════════════════════════ */

/** خانقُ السقوط إلى الدالة — نداءٌ واحد لكل توقّفٍ عن الكتابة، لا لكل حرف */
const DEBOUNCE_MS = 300;

type LiveState = {
  /** ما يُخفى بـCSS — والباقي يبقى كما رسمه الخادم بلا إعادة رسم */
  hiddenIds: string[];
  shown: number;
  total: number;
  query: string;
};

export function RouteSearchForm({
  action,
  query,
  hidden = {},
  clearHref,
  disabled = false,
  label = "بحث في المسارات",
}: {
  action: string;
  query: string;
  hidden?: Record<string, string>;
  clearHref: string;
  disabled?: boolean;
  label?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState(query);
  const [live, setLive] = useState<LiveState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftRef = useRef(query);

  /**
   * الترشيحُ المحليّ — يُرجع `true` إن وقع فعلاً.
   *
   * وشرطُه الثلاثيّ يُقرأ من الصفحة لا يُخمَّن: بحثُ الخادم فارغ (وإلا فالنافذة
   * مرشَّحةٌ سلفاً) · وسطرُ الحصيلة يقول إن المعروض هو المطابق كلُّه · وثمّة
   * صفوفٌ موسومة أصلاً.
   */
  const runLocal = useCallback(
    (value: string): boolean => {
      /*
        🔴 وكلُّ خروجٍ بـ`false` **يمسح الترشيح المحليّ قبل أن يخرج**. فالحالةُ
        الباقية ليست حياداً: قواعدُ CSS تبقى تُخفي صفوفاً باسم بحثٍ لم يعد قائماً
        — أي صفحةٌ ينقصها صفوفٌ بلا سببٍ ظاهر لمن ينظر.
      */
      const clear = () => setLive((prev) => (prev === null ? prev : null));

      if (disabled || query !== "") {
        clear();
        return false;
      }
      const win = readWindow();
      const rows = readRows();
      if (win === null || rows.length === 0 || win.shown < win.total) {
        clear();
        return false;
      }

      const needle = makeNeedle(value);
      if (needle.key === "") {
        clear();
        return true;
      }

      const hiddenIds: string[] = [];
      let shown = 0;
      for (const row of rows) {
        if (hitsNeedle(row.key, row.glued, needle)) shown += 1;
        else hiddenIds.push(row.id);
      }
      /*
        🔴 **المرجعُ نفسه حين لا شيء تغيّر — وإلا فحلقةٌ لا تنتهي.**
        الأثرُ أدناه يعمل بعد **كل** رسم بقصد (فالشجرةُ مدخلُه، وهي لا تُشتقّ من
        `props`). فلو أعاد هذا كائناً جديداً في كل مرّة لأعاد الرسمَ فيعمل الأثر
        فيعيد الرسم… وإرجاعُ `prev` عينه يجعل React **يتخطّى** إعادة الرسم،
        فتُغلق الحلقة عند أول تقارب.
      */
      setLive((prev) =>
        prev !== null &&
        prev.query === value &&
        prev.shown === shown &&
        prev.total === rows.length &&
        prev.hiddenIds.length === hiddenIds.length &&
        prev.hiddenIds.every((id, index) => id === hiddenIds[index])
          ? prev
          : { hiddenIds, shown, total: rows.length, query: value }
      );
      return true;
    },
    [disabled, query]
  );

  const hrefFor = useCallback(
    (value: string): string => {
      // نفسُ ما يبنيه `<form method="get">` بحقوله المخفية — مصدرٌ واحد لشكل الرابط
      const qs = new URLSearchParams();
      for (const [name, hiddenValue] of Object.entries(hidden)) {
        if (hiddenValue) qs.set(name, hiddenValue);
      }
      const trimmed = value.replace(/\s+/g, " ").trim().slice(0, 80);
      if (trimmed) qs.set("q", trimmed);
      const search = qs.toString();
      return search ? `${action}?${search}` : action;
    },
    [action, hidden]
  );

  const onChange = useCallback(
    (value: string) => {
      setDraft(value);
      draftRef.current = value;
      if (timer.current) clearTimeout(timer.current);
      if (runLocal(value)) return;
      // فوق النافذة الكاملة: الدالة هي الحَكَم، والخانق يمنع نداءً لكل حرف
      timer.current = setTimeout(() => {
        startTransition(() => router.replace(hrefFor(value), { scroll: false }));
      }, DEBOUNCE_MS);
    },
    [hrefFor, router, runLocal]
  );

  /**
   * إعادةُ الحساب بعد **كل** رسم — وهذا مقصودٌ لا سهو.
   *
   * ── لماذا بلا مصفوفة اعتماديّات ───────────────────────────────────────────
   *
   * مدخلُ هذا الأثر هو **صفوفُ الـDOM**، وهي لا تُشتقّ من أيّ `prop` يصل هذا
   * المكوّن: المستخدم يضغط تبويبَ حالة، أو «تفصيل» مسار، أو الصفحة التالية،
   * فتُبدَّل الصفوف تحتنا بينما `query` (بحثُ الخادم) ما زال `""` وخانةُ البحث
   * ما زالت تحمل ما كتبه. فأثرٌ باعتماديّاتٍ من `props` **لن يعمل** حينها،
   * والنتيجةُ ترشيحٌ يتوقّف صامتاً بينما نصُّه معروضٌ في الخانة.
   *
   * ── ولماذا لا حلقة ────────────────────────────────────────────────────────
   *
   * `runLocal` تكتب الحالة **بالمرجع نفسه** حين لا يتغيّر شيء (أعلاه)، وReact
   * يتخطّى إعادةَ الرسم على الحالة المتطابقة ⇒ يتقارب في رسمةٍ واحدة إضافية.
   * والقاعدةُ تحذّر من الحلقة بحقّ، والحارسُ منها مكتوبٌ ومقصود.
   */
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const value = draftRef.current;
    if (value === "") {
      setLive((prev) => (prev === null ? prev : null));
      return;
    }
    runLocal(value);
  });

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  /** ما يُخفى: الصفوف غير المطابقة، وسطرُ حصيلة الخادم (نحن نكتب حصيلةً حيّة بدلها) */
  const css =
    live === null
      ? null
      : [
          "[data-routes-window]{display:none!important}",
          live.shown === 0 ? "[data-routes-table]{display:none!important}" : "",
          live.hiddenIds.length > 0
            ? `${live.hiddenIds.map((id) => `[data-route-id="${id}"]`).join(",")}{display:none!important}`
            : "",
        ]
          .filter((rule) => rule !== "")
          .join("");

  const showLocalClear = query === "" && draft !== "";

  return (
    <form action={action} method="get">
      <Card className="flex flex-row flex-wrap items-end gap-3 p-4">
        {Object.entries(hidden).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        <div className="min-w-52 flex-1 space-y-1.5">
          <label
            htmlFor="routes-q"
            className="flex items-center gap-1.5 text-sm font-medium leading-none"
          >
            {label}
            <HelpTip>
              ابحث باسم المسار أو بنقطة البداية أو النهاية أو باسم المتعهد — جزءٌ من
              الاسم يكفي، <span className="font-semibold">والنتائج تُرشَّح مع كل حرف</span>.{" "}
              <span className="font-semibold">
                الهمزات والتاء المربوطة والتشكيل كلها سواء
              </span>
              : «الاسكندريه» تجد «الإسكندرية»، و«انستاباي» تجد «انستا باي». والأرقام
              العربية مقبولة. وقواعدُ المطابقة هي نفسُها في المتصفح وفي قاعدة البيانات،
              فلا تختلف نتيجةُ الكتابة عن نتيجة الزرّ. واضغط «بحث» لتثبيت البحث في
              عنوان الصفحة فيصير رابطاً يُشارَك.
            </HelpTip>
          </label>
          <Input
            id="routes-q"
            name="q"
            value={draft}
            onChange={(event) => onChange(event.target.value)}
            placeholder="مثال: الاسكندريه · مطار · اسم المتعهد"
            disabled={disabled}
            autoComplete="off"
          />
        </div>
        <Button type="submit" disabled={disabled}>
          <Search />
          بحث
        </Button>
        {showLocalClear && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mb-0.5"
            onClick={() => onChange("")}
          >
            <X />
            مسح
          </Button>
        )}
        {query !== "" && (
          <Link
            href={clearHref}
            className="pb-1.5 text-sm text-muted-foreground transition-colors hover:text-primary hover:underline"
          >
            مسح البحث
          </Link>
        )}

        {pending && (
          <span className="flex items-center gap-1.5 pb-1.5 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            جارٍ البحث…
          </span>
        )}

        {live !== null && (
          <p className="w-full text-xs text-muted-foreground" aria-live="polite">
            {live.shown === 0
              ? `لا مسار من المحمَّل يطابق «${live.query}» — جرّب جزءاً أقصر من اسم المدينة أو المتعهد.`
              : `المعروض ${toArabicDigits(live.shown)} من ${toArabicDigits(live.total)} مسار مطابق لـ«${live.query}» — ترشيحٌ في المتصفح بلا نداء خادم.`}
          </p>
        )}

        {css !== null && <style>{css}</style>}
      </Card>
    </form>
  );
}
