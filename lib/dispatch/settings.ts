import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { DEFAULT_DISPATCH, type DispatchSettings } from "@/lib/dispatch-types";

/**
 * قراءة إعدادات البث من جدول `dispatch_settings` (صف وحيد) بعميل الخدمة.
 *
 * قاعدتان تحكمان هذه القراءة:
 * ١) **تسامح في أسماء الأعماة**: نقبل snake_case (كما في SQL) وcamelCase معاً،
 *    فلا ينكسر التشغيل لو اختلفت تسمية عمود عن المتوقع.
 * ٢) **افتراضيات لا انهيار**: غياب الجدول (هجرة 0013 غير مطبَّقة) أو فشل القراءة
 *    يرجع `DEFAULT_DISPATCH` مع `loaded: false` — التدهور الرشيق نفسه المطبَّق
 *    في كل المشروع. القيم الافتراضية في العقد `lib/dispatch-types.ts` وحده.
 *
 * الأرقام قد تصل نصوصاً: عمود `numeric` في Postgres يمرّ عبر PostgREST كنص
 * حفاظاً على الدقة، لذلك كل قراءة رقمية تمر بـ `num()`.
 */

export type DispatchSettingsResult = {
  settings: DispatchSettings;
  /** هل قُرئ الصف فعلاً من الجدول؟ */
  loaded: boolean;
  /** no-table | read-failed | empty — يُملأ حين نرجع للافتراضيات */
  reason?: string;
};

/** رمز «الجدول غير موجود» من Postgres (42P01) أو من كاش مخطط PostgREST (PGRST205) */
export function isMissingTable(code: string | undefined | null): boolean {
  return code === "42P01" || code === "PGRST205";
}

/** رمز «الدالة غير موجودة» من Postgres (42883) أو من PostgREST (PGRST202) */
export function isMissingFunction(code: string | undefined | null): boolean {
  return code === "42883" || code === "PGRST202";
}

const toSnake = (key: string) => key.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();

function raw(row: Record<string, unknown>, key: string): unknown {
  for (const name of [key, toSnake(key)]) {
    const v = row[name];
    if (v !== undefined && v !== null) return v;
  }
  return undefined;
}

function num(row: Record<string, unknown>, key: string, fallback: number): number {
  const v = raw(row, key);
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function flag(row: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const v = raw(row, key);
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (s === "true" || s === "t" || s === "1") return true;
    if (s === "false" || s === "f" || s === "0") return false;
  }
  return fallback;
}

export async function readDispatchSettings(
  supabase: SupabaseClient
): Promise<DispatchSettingsResult> {
  try {
    const { data, error } = await supabase.from("dispatch_settings").select("*").limit(1);

    if (error) {
      return {
        settings: DEFAULT_DISPATCH,
        loaded: false,
        reason: isMissingTable(error.code) ? "no-table" : "read-failed",
      };
    }

    const row = (Array.isArray(data) ? data[0] : null) as Record<string, unknown> | null;
    if (!row) return { settings: DEFAULT_DISPATCH, loaded: false, reason: "empty" };

    return {
      loaded: true,
      settings: {
        windowMinutes: Math.max(1, Math.round(num(row, "windowMinutes", DEFAULT_DISPATCH.windowMinutes))),
        maxRounds: Math.max(1, Math.round(num(row, "maxRounds", DEFAULT_DISPATCH.maxRounds))),
        autoStart: flag(row, "autoStart", DEFAULT_DISPATCH.autoStart),
        minMarginAmount: num(row, "minMarginAmount", DEFAULT_DISPATCH.minMarginAmount),
      },
    };
  } catch {
    return { settings: DEFAULT_DISPATCH, loaded: false, reason: "read-failed" };
  }
}
