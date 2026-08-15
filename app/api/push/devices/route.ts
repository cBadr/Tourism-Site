import { errorJson, guard, NO_STORE } from "@/app/api/push/_shared";
import type { PushDeviceView } from "@/lib/partner-alerts-types";
import { isSchemaMissing } from "@/lib/supabase/schema-errors";

/**
 * GET /api/push/devices — أجهزة المتعهد كما يراها **صاحبها**.
 *
 * 🔒 **الإسقاط في القاعدة لا هنا.** `portal_push_devices()` لا تُخرج `endpoint`
 * ولا `p256dh` ولا `auth` أصلاً (اتفاقية ٧: ما لا يوجد في نوع الإرجاع لا
 * يُسرَّب)، وهذا المسار ينسخ ما وصله ولا يُوسّعه. ولو كان الترشيح هنا لكفى
 * `select("*")` سهواً ليخرج المفتاح الذي يرسل إلى الجهاز.
 *
 * ── ولماذا يحتاج البورتال هذه القائمة أصلاً ────────────────────────────────
 *
 * لأن السؤال الذي يقتل القناة هو «هل فعّلتُها؟». المتعهد يفعّل من هاتفه ثم يفتح
 * الحاسوب فيرى «غير مفعّل» — وهي حقيقةٌ عن **هذا الجهاز** يفهمها إنذاراً. فقائمة
 * الأجهزة تفصل الأمرين: هذا الجهاز مفعَّل أو لا، **وجهازٌ آخر يستقبل رغم ذلك**.
 */

export const runtime = "nodejs";

const MAX_PER_MINUTE = 30;

type DeviceRow = {
  id?: unknown;
  label?: unknown;
  created_at?: unknown;
  last_seen_at?: unknown;
};

const text = (value: unknown): string | null =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : null;

export async function GET(): Promise<Response> {
  const gate = await guard(MAX_PER_MINUTE, "devices");
  if (!gate.ok) return gate.response;

  const { data, error } = await gate.access.supabase.rpc("portal_push_devices");
  if (error) {
    return isSchemaMissing(error) ? errorJson("schema", 503) : errorJson("save", 500);
  }

  const devices: PushDeviceView[] = (Array.isArray(data) ? (data as DeviceRow[]) : [])
    .filter((row) => typeof row.id === "string")
    .map((row) => ({
      id: String(row.id),
      label: text(row.label),
      createdAt: text(row.created_at) ?? "",
      lastSeenAt: text(row.last_seen_at),
    }));

  return Response.json({ ok: true, devices }, { headers: NO_STORE });
}
