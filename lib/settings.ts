import { cache } from "react";
import { DEFAULT_SETTINGS, type SiteSettings } from "@/lib/site-config";
import { DEFAULT_LOCALE } from "@/lib/i18n-types";
import { mergeLocalized } from "@/lib/content";

/**
 * مُحمّل إعدادات الموقع — يقرأ من جدول `site_settings` (صفوف key/value JSONB)
 * عندما تكون بيئة Supabase مضبوطة، ويرجع للقيم الافتراضية عند غيابها أو فشلها.
 * أي مكوّن خادمي يحتاج هوية/تواصل/سيو يستدعي getSettings() ولا يستورد الافتراضيات مباشرة.
 *
 * ── المرحلة ٨: وعي اللغة ────────────────────────────────────────────────────
 * `getSettings()` بلا وسيط = العربية كما كانت حرفياً. ومع لغة أخرى تُقرأ
 * `localized_settings(p_locale)` وتُدمج **حقلاً حقلاً فوق العربية**: اسم العلامة
 * وشعارها ونشاط الشركة ونصوص السيو تُترجم، بينما تبقى الأرقام والألوان والروابط
 * وقنوات التواصل كما هي — فهي ليست نصاً يُترجم.
 *
 * تقبل الدالة شكلَي الرد: متداخلاً (`{brand:{name}}`) أو مسطحاً بمفاتيح منقوطة
 * (`{"brand.name": …}`) كما في مساحة `settings` في عقد الترجمة.
 */

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function deepMerge<T>(base: T, override: unknown): T {
  if (!isPlainObject(base) || !isPlainObject(override)) {
    return (override === undefined ? base : (override as T)) as T;
  }
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(override)) {
    out[k] = k in base ? deepMerge((base as Record<string, unknown>)[k], v) : v;
  }
  return out as T;
}

/** يفكّ المفاتيح المنقوطة إلى شجرة: {"brand.name": x} ← {brand:{name:x}} */
function expandDotted(source: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if (!key.includes(".")) {
      out[key] = value;
      continue;
    }
    const path = key.split(".");
    let node = out;
    for (let i = 0; i < path.length - 1; i += 1) {
      const step = path[i] as string;
      if (!isPlainObject(node[step])) node[step] = {};
      node = node[step] as Record<string, unknown>;
    }
    node[path[path.length - 1] as string] = value;
  }
  return out;
}

/** يستخرج كائن الإعدادات من رد RPC قد يكون كائناً أو مصفوفة بصف واحد */
function firstRow(data: unknown): Record<string, unknown> | null {
  if (Array.isArray(data)) return isPlainObject(data[0]) ? data[0] : null;
  return isPlainObject(data) ? data : null;
}

/** الإعدادات العربية الأساس — مصدر كل احتياطي، ومُذاكَرة لكل طلب */
const loadBaseSettings = cache(async (): Promise<SiteSettings> => {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return DEFAULT_SETTINGS;
  }
  try {
    const { createServerSupabase } = await import("@/lib/supabase/server");
    const supabase = await createServerSupabase();
    if (!supabase) return DEFAULT_SETTINGS;

    const { data, error } = await supabase.from("site_settings").select("key, value");
    if (error || !data) return DEFAULT_SETTINGS;

    const overrides: Record<string, unknown> = {};
    for (const row of data) overrides[row.key] = row.value;
    return deepMerge(DEFAULT_SETTINGS, overrides);
  } catch {
    return DEFAULT_SETTINGS;
  }
});

const loadSettings = cache(async (locale: string): Promise<SiteSettings> => {
  const base = await loadBaseSettings();
  if (locale === DEFAULT_LOCALE) return base;
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return base;
  }

  try {
    const { createServerSupabase } = await import("@/lib/supabase/server");
    const supabase = await createServerSupabase();
    if (!supabase) return base;

    const { data, error } = await supabase.rpc("localized_settings", { p_locale: locale });
    if (error) return base;

    const row = firstRow(data);
    if (!row) return base;

    // الدمج بشكل العربية: النص المترجم غير الفارغ فقط هو ما يُستبدل
    return mergeLocalized(base, expandDotted(row));
  } catch {
    return base;
  }
});

/** إعدادات الموقع بلغة الزائر — بلا وسيط تعني العربية (السلوك القديم حرفياً) */
export async function getSettings(locale?: string): Promise<SiteSettings> {
  const value = (locale ?? "").trim().toLowerCase();
  return loadSettings(value.length > 0 ? value : DEFAULT_LOCALE);
}
