import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { DEFAULT_PROVIDERS, type PaymentProvider, type ProviderSettings } from "@/lib/payments-types";

import { isPaymentProvider } from "@/lib/payments/credentials";

/**
 * قراءة صفوف `payment_providers` — ما تديره اللوحة: التفعيل والترتيب والاسم
 * الظاهر والمعرّفات العامة. **لا أسرار هنا إطلاقاً** (المفاتيح في البيئة).
 *
 * قاعدتان مطبَّقتان في كل قارئ إعدادات في هذا المشروع:
 * ١) تسامح في أسماء الأعمدة: snake_case وcamelCase مقبولان معاً.
 * ٢) افتراضيات لا انهيار: غياب الجدول (هجرة 0020 لم تُنفَّذ بعد) يرجع
 *    `DEFAULT_PROVIDERS` مع `loaded: false`. النتيجة العملية أن مزوّد `test`
 *    يعمل على قاعدة لم تُهاجَر بعد — وهو بالضبط ما يجعل السلسلة قابلة للتحقق.
 */

const NO_TABLE = new Set(["42P01", "PGRST205"]);

export type ProviderSettingsResult = {
  rows: ProviderSettings[];
  loaded: boolean;
  /** no-table | read-failed | empty */
  reason?: string;
};

const toSnake = (key: string) => key.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();

function raw(row: Record<string, unknown>, key: string): unknown {
  for (const name of [key, toSnake(key)]) {
    const value = row[name];
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

function flag(row: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const value = raw(row, key);
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const text = value.trim().toLowerCase();
    if (text === "true" || text === "t" || text === "1") return true;
    if (text === "false" || text === "f" || text === "0") return false;
  }
  return fallback;
}

function text(row: Record<string, unknown>, key: string, fallback: string): string {
  const value = raw(row, key);
  return typeof value === "string" && value.trim() !== "" ? value : fallback;
}

function count(row: Record<string, unknown>, key: string, fallback: number): number {
  const value = raw(row, key);
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

/** المعرّفات العامة — نقبل الكائن أو نصاً يحمل JSON، وكل القيم تُحوَّل نصوصاً */
function publicConfig(row: Record<string, unknown>): Record<string, string> {
  let value = raw(row, "publicConfig");
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return {};
    }
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) return {};

  const out: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (typeof entry === "string") out[key] = entry;
    else if (typeof entry === "number" || typeof entry === "boolean") out[key] = String(entry);
  }
  return out;
}

function defaultsFor(provider: PaymentProvider): ProviderSettings {
  const found = DEFAULT_PROVIDERS.find((entry) => entry.provider === provider);
  return found ?? { provider, enabled: false, sort: 99, label: provider, sandbox: true, publicConfig: {} };
}

function merge(row: Record<string, unknown>): ProviderSettings | null {
  const code = text(row, "provider", "");
  if (!isPaymentProvider(code)) return null;

  const base = defaultsFor(code);
  return {
    provider: code,
    enabled: flag(row, "enabled", base.enabled),
    sort: Math.round(count(row, "sort", base.sort)),
    label: text(row, "label", base.label),
    sandbox: flag(row, "sandbox", base.sandbox),
    publicConfig: publicConfig(row),
  };
}

export async function readProviderSettings(
  supabase: SupabaseClient
): Promise<ProviderSettingsResult> {
  try {
    const { data, error } = await supabase.from("payment_providers").select("*");

    if (error) {
      return {
        rows: DEFAULT_PROVIDERS,
        loaded: false,
        reason: NO_TABLE.has(error.code ?? "") ? "no-table" : "read-failed",
      };
    }

    const rows = (Array.isArray(data) ? data : [])
      .map((entry) => merge(entry as Record<string, unknown>))
      .filter((entry): entry is ProviderSettings => entry !== null)
      .sort((a, b) => a.sort - b.sort);

    if (rows.length === 0) return { rows: DEFAULT_PROVIDERS, loaded: false, reason: "empty" };
    return { rows, loaded: true };
  } catch {
    return { rows: DEFAULT_PROVIDERS, loaded: false, reason: "read-failed" };
  }
}

/**
 * إعدادات مزوّد بعينه — الصف الحي إن وُجد، وإلا افتراضيات العقد.
 *
 * `enabled` هنا يعني «يُعرض في صفحة الدفع». وهو **لا يحكم** قبول الـ webhook:
 * دفعة انطلقت قبل أن يُطفئ المالك البوابة يجب أن تُسوّى، وإلا بقي حجز مدفوع
 * معلّقاً بلا سبب يفهمه العميل.
 */
export async function readOneProviderSettings(
  supabase: SupabaseClient,
  provider: PaymentProvider
): Promise<{ settings: ProviderSettings; loaded: boolean; reason?: string }> {
  const result = await readProviderSettings(supabase);
  const found = result.rows.find((entry) => entry.provider === provider);
  return {
    settings: found ?? defaultsFor(provider),
    loaded: result.loaded && found !== undefined,
    reason: result.reason,
  };
}

export { defaultsFor as defaultProviderSettings };
