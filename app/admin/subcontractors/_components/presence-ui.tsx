import type { SupabaseClient } from "@supabase/supabase-js";
import { BellOff, Radio, Send, Smartphone } from "lucide-react";

import { toArabicDigits } from "@/components/booking/format";
import { HelpTip } from "@/components/shared/HelpTip";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { asNumber, asText, dateTimeLabel, pick, relativeTime } from "../../orders/_components/booking-ui";

/**
 * ظهور المتعهد وقابلية الوصول إليه — لبنتان لشاشتَي المتعهدين (القائمة والملف).
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  🔴 سؤالان لا سؤال — والخلطُ بينهما يُنتج قراراً خاطئاً
 * ══════════════════════════════════════════════════════════════════════════
 *
 * | العمود | يجيب | ومَن يحسبه |
 * |---|---|---|
 * | **الظهور** | «هل هو أمام الشاشة الآن؟» | `partner_presence` (هجرة 0118) |
 * | **قابلية الوصول** | «هل يصله العرض وهل يقبله؟» | `admin_partner_availability` (0054) |
 *
 * ومتعهدٌ **غير متصل** يصله دفعُ تليجرام فيردّ خلال ثوانٍ — فحذفُ العمود الثاني
 * وإبقاءُ الأول وحده يجعل المشرف يتخطّى أفضلَ شركائه لأنه ليس «أونلاين».
 * والعكس: **متصلٌ** أوقف استقبال العروض من بوابته لا يُسنَد إليه شيء.
 * ⇒ العمودان معاً أو لا معنى لأيّهما.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  وثلاثُ حالاتٍ للظهور لا اثنتان — ورابعةٌ ليست حالة
 * ══════════════════════════════════════════════════════════════════════════
 *
 * | الحال | المعروض | لماذا لا تُدمج مع غيرها |
 * |---|---|---|
 * | `online` | 🟢 **متصل الآن** | نبضةٌ عمرها أقلُّ من ٥ دقائق |
 * | طابعٌ أقدم | 🟡 **آخر ظهور {منذ}** | **المسافةُ بين «قبل دقيقتين» و«قبل يومين» هي كلُّ الإشارة** — ونقطةٌ ثنائية ترميها |
 * | لا طابع | ⚪ **لم يدخل بوابته قط** | مدعوٌّ لم يفتح حسابه أصلاً: مكالمةٌ مختلفة تماماً عن «غير متصل» |
 * | تعذّرت القراءة | **—** بسببٍ مسمّى | «لا نعرف» ليست «صفراً» ولا «لا ينطبق» (القاعدة ١٥) |
 *
 * ولذلك لا يُكتب الوقت النسبي وحده: `relativeTime` يقول «قبل يومين» و`title`
 * يحمل التاريخ الدقيق، فمن أراد الرقم وجده بلا صفحةٍ ثانية.
 */

export type PartnerPresence = {
  subcontractorId: string;
  companyName: string;
  status: string;
  /** يصله بلاغٌ بأي قناة (تليجرام/دفع/بريد) — من `partner_availability` */
  reachable: boolean | null;
  /** لم يُطفئ «استقبال العروض» من بوابته */
  willing: boolean | null;
  /** بالغٌ **و** راغب — وهو الشرط الذي يعمل عليه البثّ فعلاً */
  available: boolean | null;
  /** القنوات البالغة فعلاً: telegram · webpush · email */
  channels: string[];
  hasTelegramId: boolean | null;
  pushDevices: number | null;
  /** null = لم يدخل بوابته قط. وهي **ليست** «غير متصل». */
  lastSeenAt: string | null;
  online: boolean;
};

const CHANNEL_LABELS: Record<string, string> = {
  telegram: "تليجرام",
  webpush: "إشعار متصفح",
  email: "بريد",
};

function readPresence(row: Record<string, unknown>): PartnerPresence | null {
  const id = asText(pick(row, ["subcontractor_id", "subcontractorId"]));
  if (!id) return null;
  const raw = pick(row, ["reaching_channels", "reachingChannels"]);
  return {
    subcontractorId: id,
    companyName: asText(pick(row, ["company_name", "companyName"])) ?? "—",
    status: asText(row.status) ?? "",
    reachable: typeof row.reachable === "boolean" ? row.reachable : null,
    willing: typeof row.willing === "boolean" ? row.willing : null,
    available: typeof row.available === "boolean" ? row.available : null,
    channels: Array.isArray(raw) ? raw.filter((c): c is string => typeof c === "string") : [],
    hasTelegramId:
      typeof pick(row, ["has_telegram_id", "hasTelegramId"]) === "boolean"
        ? (pick(row, ["has_telegram_id", "hasTelegramId"]) as boolean)
        : null,
    pushDevices: asNumber(pick(row, ["push_devices", "pushDevices"])),
    lastSeenAt: asText(pick(row, ["last_seen_at", "lastSeenAt"])),
    online: row.online === true,
  };
}

/**
 * قراءة الظهور لكل المتعهدين في **نداء واحد**.
 *
 * ⚠ `ready = false` تعني «تعذّرت القراءة» لا «لا أحد متصل» — والشاشة تعرض عندها
 *   «—» بسببٍ مكتوب. وأشيعُ أسبابها أن الهجرة `0118` لم تُنفَّذ بعد.
 *
 * 🔒 ولا تُنادى بمفتاح الخدمة أبداً: الدالة محروسة بـ`is_admin()` في جسمها،
 *    فوصلةٌ بلا JWT تُرجع صفر صفوف — **وهي صحةٌ لا عطل**. عميلُ الجلسة هنا
 *    يحمل هوية المشرف الحقيقية، وهو ما يجعلها تُرجع صفوفاً.
 */
export async function loadPartnerPresence(
  supabase: SupabaseClient
): Promise<{ byId: Map<string, PartnerPresence>; ready: boolean }> {
  const byId = new Map<string, PartnerPresence>();
  const res = await supabase.rpc("admin_partner_presence");
  if (res.error) return { byId, ready: false };
  for (const row of (res.data ?? []) as Record<string, unknown>[]) {
    const item = readPresence(row);
    if (item) byId.set(item.subcontractorId, item);
  }
  return { byId, ready: true };
}

const DOT = "inline-block size-2 shrink-0 rounded-full";

/**
 * وسمُ الظهور — ثلاث حالات ورابعةٌ للجهل بها.
 *
 * `compact` للجدول (سطرٌ واحد)، وبدونها للبطاقة (سطران بتاريخٍ دقيق).
 */
export function PresenceBadge({
  presence,
  ready,
  compact = false,
}: {
  presence: PartnerPresence | undefined;
  ready: boolean;
  compact?: boolean;
}) {
  if (!ready || !presence) {
    return (
      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
        <span className={cn(DOT, "bg-muted-foreground/40")} aria-hidden="true" />
        <span className="text-xs">—</span>
        <HelpTip>
          تعذّرت قراءة الظهور من قاعدة البيانات — غالباً لأن هجرة{" "}
          <code dir="ltr">0118</code> لم تُنفَّذ بعد. و«لا نعرف» ليست «غير متصل»، فلا
          يُبنى على هذا الفراغ قرار.
        </HelpTip>
      </span>
    );
  }

  if (presence.online) {
    return (
      <span className="inline-flex flex-wrap items-center gap-1.5 text-emerald-700 dark:text-emerald-300">
        <span className={cn(DOT, "bg-emerald-500")} aria-hidden="true" />
        <span className="text-xs font-medium">متصل الآن</span>
        {!compact && presence.lastSeenAt && (
          <span className="text-xs text-muted-foreground" title={dateTimeLabel(presence.lastSeenAt)}>
            · آخر نبضة {relativeTime(presence.lastSeenAt)}
          </span>
        )}
      </span>
    );
  }

  if (presence.lastSeenAt) {
    return (
      <span
        className="inline-flex flex-wrap items-center gap-1.5 text-amber-700 dark:text-amber-300"
        title={dateTimeLabel(presence.lastSeenAt)}
      >
        <span className={cn(DOT, "bg-amber-500")} aria-hidden="true" />
        <span className="text-xs font-medium">آخر ظهور {relativeTime(presence.lastSeenAt)}</span>
        {!compact && (
          <span className="text-xs text-muted-foreground">· {dateTimeLabel(presence.lastSeenAt)}</span>
        )}
      </span>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 text-muted-foreground">
      <span className={cn(DOT, "bg-muted-foreground/40")} aria-hidden="true" />
      <span className="text-xs">لم يدخل بوابته قط</span>
      {!compact && (
        <HelpTip>
          لا نبضةَ حضورٍ واحدة لهذا الشريك — أي أنه لم يفتح بوابته منذ نزول قياس
          الظهور. وهي حالٌ غير «غير متصل»: راجع أن دعوته وصلته وأن حساب دخوله مربوط.
        </HelpTip>
      )}
    </span>
  );
}

/**
 * وسمُ قابلية الوصول — يبقى **بجوار** الظهور لا بدلاً منه.
 *
 * يقرأ `available` (بالغٌ × راغب) وهو نفسه الشرط الذي يعمل عليه البثّ، فلا
 * يقول هذا الوسم شيئاً ويفعل التوزيع غيره.
 */
export function ReachBadge({
  presence,
  ready,
  compact = false,
}: {
  presence: PartnerPresence | undefined;
  ready: boolean;
  compact?: boolean;
}) {
  if (!ready || !presence || presence.available === null) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  const channels = presence.channels.map((c) => CHANNEL_LABELS[c] ?? c).join(" · ");

  if (presence.available) {
    return (
      <span className="inline-flex flex-wrap items-center gap-1.5">
        <Badge
          variant="outline"
          className="gap-1 border-emerald-300 bg-emerald-100 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-100"
        >
          <Radio className="size-3" aria-hidden="true" />
          قابل للوصول
        </Badge>
        {channels && <span className="text-xs text-muted-foreground">{channels}</span>}
        {!compact && (
          <HelpTip>
            يصله بلاغُ الرحلة على قناةٍ عاملة، ولم يُطفئ «استقبال العروض» من بوابته.
            وهذا هو الشرط نفسه الذي تعمل عليه موجات البثّ —{" "}
            <span className="font-semibold">فغيرُ المتصل قد يكون قابلاً للوصول</span>{" "}
            ويردّ على تليجرام خلال ثوانٍ.
          </HelpTip>
        )}
      </span>
    );
  }

  const reason =
    presence.reachable === false
      ? "لا قناة تبلغه"
      : presence.willing === false
        ? "أوقف استقبال العروض"
        : "غير قابل للوصول";

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <Badge
        variant="outline"
        className="gap-1 border-red-300 bg-red-100 text-red-900 dark:border-red-700 dark:bg-red-950 dark:text-red-100"
      >
        <BellOff className="size-3" aria-hidden="true" />
        {reason}
      </Badge>
      {!compact && (
        <HelpTip>
          {presence.reachable === false
            ? "لا تليجرام مربوطاً ولا جهاز إشعارات ولا قناة بريد عاملة — فالبثّ يتخطّاه بصمت مهما كان أرخص المتعهدين. اطلب منه ربط تليجرام من «قنوات التنبيه» في بوابته."
            : "أطفأ «استقبال العروض» من بوابته بنفسه. القناة تعمل لكنه لا يريد رحلاتٍ الآن، فلا يُسنَد إليه تلقائياً."}
        </HelpTip>
      )}
    </span>
  );
}

/** تفصيل القنوات — للبطاقة وحدها، لا للجدول */
export function ReachDetail({ presence }: { presence: PartnerPresence }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">
        <Send className="size-3.5" aria-hidden="true" />
        تليجرام: {presence.hasTelegramId === null ? "—" : presence.hasTelegramId ? "مربوط" : "غير مربوط"}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Smartphone className="size-3.5" aria-hidden="true" />
        أجهزة الإشعارات:{" "}
        {presence.pushDevices === null ? "—" : toArabicDigits(presence.pushDevices)}
      </span>
    </div>
  );
}
