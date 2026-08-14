/**
 * وضع الصيانة — مفتاح `maintenance` في جدول `site_settings` (يُبذر في 0008).
 *
 * لماذا لا يقرأ هذا الملف عبر `@/lib/supabase/server` كبقية طبقات القراءة؟
 * لأنه يُستورَد من `proxy.ts` أيضاً، وهناك لا وجود لـ next/headers ولا للكوكيز.
 * فالقراءة هنا عبر REST مباشرة بمفتاح anon (سياسة site_settings_select_public
 * تسمح بالقراءة العامة) مع ذاكرة قصيرة داخل العملية — فيبقى الملف بلا أي
 * اعتماد على بيئة تشغيل بعينها: يعمل في المكوّنات الخادمية وفي الوسيط معاً.
 * ولهذا أيضاً لا يستورد شيئاً من الموقع (ولا حتى site-config): صفر تبعيات
 * حتى لا تُسحب حزمة كاملة إلى الوسيط الذي يمر عليه كل طلب.
 * ⚠ والاستثناء الوحيد `@/lib/phone` — وهو **ورقةٌ بلا استيراد واحد**، أُنشئ
 * بهذا الشرط تحديداً كي يشترك هذا الملف والموقع في مُطبِّع رقم واتساب بدل أن
 * تُنسخ الدالة مرتين. فالقرار أعلاه قائم: ما يُجلب هنا لا يجرّ خلفه شيئاً.
 *
 * مبدأ الفشل الآمن: أي خطأ في القراءة = «لا صيانة». الموقع لا يُقفل أبداً
 * بسبب تعذر قراءة الإعدادات.
 *
 * انضباط الـ Whitelabel: اسم العلامة وقنوات التواصل تأتي من الإعدادات نفسها،
 * وما لا يوجد منها لا يُعرض — لا اسم ولا رقم مكتوب في هذا الملف.
 */

import { waNumber } from "@/lib/phone";

export const MAINTENANCE_SETTINGS_KEY = "maintenance";

export type MaintenanceSettings = {
  /** تشغيل وضع الصيانة للزوار */
  enabled: boolean;
  /** النص المعروض للزائر — يحرره المدير من /admin/maintenance */
  message: string;
  /** إبقاء لوحة التحكم وبوابة المتعهدين مفتوحتين أثناء الصيانة */
  allowAdmin: boolean;
};

/** مطابق تماماً لبذر 0008_trust_pages.sql (نفس انضباط المرآة في المحتوى) */
export const DEFAULT_MAINTENANCE: MaintenanceSettings = {
  enabled: false,
  message:
    "نجري تحديثاً قصيراً على الموقع لتحسين تجربة الحجز، ونعود بعد وقت قصير بإذن الله. لحجز عاجل أو استفسار، تواصل معنا مباشرة عبر واتساب أو الهاتف.",
  allowAdmin: true,
};

/** العنوان الثابت لصفحة الصيانة — لا يُحرَّر (المحرَّر هو الرسالة فقط) */
export const MAINTENANCE_HEADING = "الموقع تحت الصيانة المؤقتة";
export const MAINTENANCE_NOTE = "الحجوزات المؤكدة سارية كما هي، ولا يتأثر بها هذا التحديث.";

/** مدة الذاكرة القصيرة لقراءة الإعدادات (كل طلب زائر يمر على الوسيط) */
export const MAINTENANCE_CACHE_TTL_MS = 15_000;

/** أقصى طول لرسالة الصيانة — تبقى قابلة للقراءة على شاشة الهاتف */
export const MAX_MAINTENANCE_MESSAGE = 600;

/**
 * المسارات التي تبقى متاحة أثناء الصيانة:
 * لوحة التحكم وبوابة المتعهدين (حتى يُطفأ الوضع من الداخل)، ومسارات الـ API
 * والأصول الثابتة وملفات السيو (كسرها يكسر الصفحة نفسها).
 */
export const MAINTENANCE_BYPASS_PREFIXES = [
  "/admin",
  "/portal",
  "/api",
  "/_next",
  "/brand",
  "/images",
] as const;

const MAINTENANCE_BYPASS_EXACT = [
  "/favicon.ico",
  "/robots.txt",
  "/sitemap.xml",
  "/manifest.webmanifest",
] as const;

export function isMaintenanceBypassedPath(pathname: string): boolean {
  if (MAINTENANCE_BYPASS_EXACT.some((p) => pathname === p)) return true;
  return MAINTENANCE_BYPASS_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

/** يقبل أي شكل قادم من JSONB ويعيد كائناً مكتملاً بلا مفاجآت */
export function normalizeMaintenance(value: unknown): MaintenanceSettings {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return DEFAULT_MAINTENANCE;
  }
  const row = value as Record<string, unknown>;
  const message = typeof row.message === "string" ? row.message.trim() : "";
  return {
    enabled: row.enabled === true,
    message: message === "" ? DEFAULT_MAINTENANCE.message : message,
    // allowAdmin يبقى true ما لم يُطفأ صراحةً — لا نقفل الباب على الفريق بالخطأ
    allowAdmin: row.allowAdmin !== false,
  };
}

/** حالة الصيانة كاملة كما يحتاجها الوسيط لبناء صفحة الزائر */
export type MaintenanceState = {
  maintenance: MaintenanceSettings;
  /** اسم العلامة من مفتاح brand — فارغ يعني «لا تعرض سطر العلامة» */
  brandName: string;
  contact: { phone: string | null; whatsapp: string | null };
  /** هل قُرئت القيم فعلاً من قاعدة البيانات أم رجعنا للافتراضيات؟ */
  source: "db" | "default";
};

const FALLBACK_STATE: MaintenanceState = {
  maintenance: DEFAULT_MAINTENANCE,
  brandName: "",
  contact: { phone: null, whatsapp: null },
  source: "default",
};

let memo: { at: number; state: MaintenanceState } | null = null;

/** إسقاط الذاكرة القصيرة بعد حفظ الإعدادات من اللوحة (نفس العملية فقط) */
export function clearMaintenanceCache(): void {
  memo = null;
}

const str = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
};

/**
 * قراءة `maintenance` و`brand` و`contact` من site_settings بطلب REST واحد.
 * fresh=true يتخطى الذاكرة القصيرة (تستخدمه شاشة اللوحة كي ترى أثر الحفظ فوراً).
 */
export async function fetchMaintenanceState(fresh = false): Promise<MaintenanceState> {
  if (!fresh && memo && Date.now() - memo.at < MAINTENANCE_CACHE_TTL_MS) {
    return memo.state;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return FALLBACK_STATE;

  try {
    const endpoint =
      `${url.replace(/\/+$/, "")}/rest/v1/site_settings` +
      `?select=key,value&key=in.(${MAINTENANCE_SETTINGS_KEY},brand,contact)`;

    const res = await fetch(endpoint, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        Accept: "application/json",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) return FALLBACK_STATE;

    const rows = (await res.json()) as { key: string; value: unknown }[];
    if (!Array.isArray(rows)) return FALLBACK_STATE;

    const byKey = new Map(rows.map((r) => [r.key, r.value]));
    const brand = (byKey.get("brand") ?? {}) as Record<string, unknown>;
    const contact = (byKey.get("contact") ?? {}) as Record<string, unknown>;
    const rawMaintenance = byKey.get(MAINTENANCE_SETTINGS_KEY);

    const state: MaintenanceState = {
      maintenance: normalizeMaintenance(rawMaintenance),
      brandName: str(brand.name) ?? "",
      contact: { phone: str(contact.phone), whatsapp: str(contact.whatsapp) },
      // المفتاح غائب = هجرة 0008 لم تُنفَّذ بعد
      source: rawMaintenance === undefined ? "default" : "db",
    };

    memo = { at: Date.now(), state };
    return state;
  } catch {
    // شبكة أو مهلة أو JSON تالف — الموقع يعمل بلا صيانة
    return FALLBACK_STATE;
  }
}

/** إعدادات الصيانة وحدها */
export async function getMaintenance(fresh = false): Promise<MaintenanceSettings> {
  return (await fetchMaintenanceState(fresh)).maintenance;
}

/** السؤال المختصر: هل وضع الصيانة مفعَّل الآن؟ */
export async function isMaintenanceOn(): Promise<boolean> {
  return (await getMaintenance()).enabled;
}

/**
 * هل يحمل الطلب كوكي **باسم** جلسة Supabase؟ — فحصٌ رخيص لا حكمٌ.
 *
 * ⚠ **لا تستعمله وحده بواباً.** يقرأ الاسم ولا يفتح القيمة، فكوكيٌّ ملفَّق باسمٍ
 * مطابق يمرّ منه (مقيسٌ حياً في المرحلة ١٢ب: طلبٌ بقيمة مختلَقة رجع ٢٠٠ حيث رجع
 * الزائر ٥٠٣). موضعه الوحيد أن يسبق الفحص الحقيقي في `proxy.ts` فيوفّر نداء
 * شبكة على من لا كوكي معه — و`isTeamSession` هناك هي التي تقرأ الدور من القاعدة
 * بجلسةٍ مُتحقَّق منها. وقبل ١٢ب كان هذا كافياً لأن كل صاحب جلسة موظفٌ أو متعهد
 * (**D-20**)، وفتحُ تسجيل العملاء نقض تلك المقدّمة.
 */
export function hasSupabaseSessionCookie(cookieNames: string[]): boolean {
  return cookieNames.some((name) => /^sb-.+-auth-token(\.\d+)?$/.test(name));
}

const escapeHtml = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** روابط التواصل المتاحة في صفحة الصيانة (الفارغ لا يظهر — نفس منطق الموقع) */
export function maintenanceContactLinks(
  state: MaintenanceState
): { href: string; label: string }[] {
  const links: { href: string; label: string }[] = [];
  /**
   * ⚠ كانت هنا **نسخةٌ ثانية** من بناء رابط واتساب (`replace(/[^\d]/g, "")`)،
   * فورثت العيب نفسه: الرقم المحلي يخرج بلا رمز دولة و`wa.me` يردّه غير صالح.
   * وموضعها يجعل الأمر أسوأ لا أهون — **صفحة الصيانة هي القناة الوحيدة العاملة
   * حين يكون الموقع مطفأً**، فرابطٌ مكسور فيها يقطع آخر خيط. الآن `waNumber`
   * وحدها، وشرحها في `lib/site-config.ts`.
   */
  const wa = waNumber(state.contact.whatsapp);
  if (wa) {
    links.push({ href: `https://wa.me/${wa}`, label: "تواصل عبر واتساب" });
  }
  if (state.contact.phone) {
    links.push({
      href: `tel:${state.contact.phone.replace(/\s+/g, "")}`,
      label: `اتصل بنا: ${state.contact.phone}`,
    });
  }
  return links;
}

/**
 * صفحة الصيانة التي يراها الزائر — HTML مستقل تماماً (بلا JS ولا خطوط خارجية)
 * كي يعمل من الوسيط قبل أي تصيير. الاسم واللون وقنوات التواصل من الإعدادات.
 */
export function maintenanceHtml(state: MaintenanceState): string {
  const paragraphs = state.maintenance.message
    .split(/\r?\n\s*\r?\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p)}</p>`)
    .join("\n        ");

  const links = maintenanceContactLinks(state)
    .map(
      (l) => `<a class="btn" href="${escapeHtml(l.href)}">${escapeHtml(l.label)}</a>`
    )
    .join("\n        ");

  const brand = state.brandName.trim();
  const title = brand ? `${MAINTENANCE_HEADING} — ${brand}` : MAINTENANCE_HEADING;

  return `<!doctype html>
<html lang="ar" dir="rtl">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      :root { color-scheme: light dark; }
      * { box-sizing: border-box; }
      body {
        margin: 0; min-height: 100dvh; display: grid; place-items: center; padding: 24px;
        font-family: system-ui, "Segoe UI", Tahoma, sans-serif;
        background: #f6f7f9; color: #14181f;
      }
      .card {
        width: 100%; max-width: 34rem; background: #fff; border: 1px solid #e5e7eb;
        border-radius: 20px; padding: 32px 28px; text-align: center;
        box-shadow: 0 12px 40px rgba(15, 23, 42, 0.08);
      }
      .brand { font-size: 15px; font-weight: 700; color: #475569; margin-bottom: 20px; }
      .icon { font-size: 40px; line-height: 1; margin-bottom: 12px; }
      h1 { font-size: 24px; line-height: 1.4; margin: 0 0 14px; }
      p { margin: 0 0 12px; line-height: 2; color: #475569; font-size: 16px; }
      .note { font-size: 14px; color: #64748b; margin-top: 18px; }
      .links { display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; margin-top: 22px; }
      .btn {
        display: inline-block; padding: 11px 20px; border-radius: 12px; text-decoration: none;
        font-size: 15px; font-weight: 600; background: #14181f; color: #fff;
      }
      @media (prefers-color-scheme: dark) {
        body { background: #0b0d11; color: #e8eaed; }
        .card { background: #14181f; border-color: #262c36; box-shadow: none; }
        p, .brand, .note { color: #a8b0bd; }
        .btn { background: #e8eaed; color: #14181f; }
      }
    </style>
  </head>
  <body>
    <main class="card">
      ${brand ? `<div class="brand">${escapeHtml(brand)}</div>` : ""}
      <div class="icon" aria-hidden="true">🛠️</div>
      <h1>${escapeHtml(MAINTENANCE_HEADING)}</h1>
      <div>
        ${paragraphs}
      </div>
      <div class="links">
        ${links}
      </div>
      <p class="note">${escapeHtml(MAINTENANCE_NOTE)}</p>
    </main>
  </body>
</html>
`;
}

/**
 * استجابة الصيانة الجاهزة: 503 + Retry-After (تحافظ على ترتيبك في محركات
 * البحث لأنها تخبرها بأن الانقطاع مؤقت) + منع التخزين المؤقت.
 */
export function maintenanceResponse(state: MaintenanceState): Response {
  return new Response(maintenanceHtml(state), {
    status: 503,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "retry-after": "3600",
      "cache-control": "no-store, must-revalidate",
    },
  });
}
