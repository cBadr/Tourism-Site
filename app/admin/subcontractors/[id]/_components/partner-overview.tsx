import type { ReactNode } from "react";
import Link from "next/link";
import {
  BarChart3,
  CalendarClock,
  CheckCircle2,
  ExternalLink,
  FileSignature,
  Globe,
  MessageCircle,
  Percent,
  Phone,
  Route,
  Scale,
  TriangleAlert,
  UserRound,
  XCircle,
} from "lucide-react";

import { toArabicDigits } from "@/components/booking/format";
import { HelpTip } from "@/components/shared/HelpTip";
import { StatChart } from "@/components/stats/stat-chart";
import { StatsPanel } from "@/components/stats/stats-ui";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { KpiCard } from "@/components/ui/kpi-card";
import { Separator } from "@/components/ui/separator";
import { telLink, waLink } from "@/lib/phone";
import { formatStatValue } from "@/lib/stats/format";
import type { SettlementWording } from "../../../finance/_components/finance-ui";
import { dateTimeLabel, relativeTime } from "../../../orders/_components/booking-ui";
import {
  PresenceBadge,
  ReachBadge,
  ReachDetail,
  type PartnerPresence,
} from "../../_components/presence-ui";
import {
  isSubStatus,
  SUB_STATUS_HINTS,
  SubStatusBadge,
  type SubcontractorView,
} from "../../_components/subcontractor-ui";
import type { PartnerAgreementState, PartnerMetrics } from "./partner-metrics";

/**
 * ══════════════════════════════════════════════════════════════════════════
 *  بطاقةُ رأس المتعهد ومؤشراتُه ورسماه — سطحُ العرض وحده
 * ══════════════════════════════════════════════════════════════════════════
 *
 * كلُّ رقمٍ هنا وصل محسوباً من `loadPartnerMetrics`، وما يقع في هذا الملف
 * **تنسيقٌ واختيارُ صياغة**: لا جمع ولا قسمة ولا نسبة تُشتقّ.
 *
 * ── مكوّنات مُعادُ استعمالها، ولا منظومةَ رسمٍ ثانية ──────────────────────
 *
 * | المكوّن | من أين | لماذا لا يُعاد بناؤه |
 * |---|---|---|
 * | `StatChart` · `StatsPanel` | `components/stats/**` | منظومة الرسوم القائمة (الملاحظة ١٢): SVG خادميّ بلا مكتبة، والزمن فيه يجري يميناً↤يساراً كما تقتضي العربية. بناءُ ثانيةٍ نقضٌ للقاعدة ١٢ |
 * | `KpiCard` | `components/ui/kpi-card` | البطاقة التي وُحِّدت فيها خمسُ نسخٍ منحرفة |
 * | `PresenceBadge` · `ReachBadge` · `ReachDetail` | `_components/presence-ui` | الظهور وقابلية الوصول سؤالان لا سؤال، وصياغتهما محسومةٌ هناك |
 * | `settlementWording` | شاشات المالية | إشارةُ الصافي تُقرأ في مكانٍ واحد لخمس شاشات |
 *
 * ── الصفرُ يُقال ولا يُخفى ────────────────────────────────────────────────
 *
 * شريكٌ بلا رحلة يرى **جملةً تشرح**، لا شبكةَ أصفارٍ ولا رسماً مسطّحاً. وثلاثُ
 * حالاتٍ لا تُخلط: «صفر» (قِيس ووُجد معدوماً) · «لا رحلة بعد» (لا صفَّ أصلاً)
 * · «تعذّرت القراءة» (‏`—` بسببٍ مسمّى). الأخيرة **ليست** الأوليين.
 *
 * ── 🔒 D-19 ──────────────────────────────────────────────────────────────
 *
 * لا تكلفةَ متعهدٍ ولا هامشَ حجزٍ في أيٍّ من هذه المكوّنات: النوع
 * `PartnerMetrics` لا يحمل واحداً منها أصلاً، والرقمُ المالي الوحيد هنا هو
 * **صافي تسويته هو** — يصل مصاغاً من `settlementWording` كما تعرضه بطاقة
 * التسوية نفسها أسفل الشاشة، فلا رقمَ ثانٍ لشيءٍ واحد.
 */

// ---------------------------------------------------------------------------
// روابط التواصل
// ---------------------------------------------------------------------------

/**
 * روابط التواصل مع المتعهد — من `lib/phone.ts` وحدها.
 *
 * ⚠ والقاعدة الحية تبيّن لماذا لم يُكتشف العيب هنا بالعين: واتساب المتعهد مخزَّن
 * بالصيغة الدولية سلفاً في **٩ من ١١** صفاً (`201000111222`) لأن البذرة تكتبه
 * كذلك، فالنسخة المحلية كانت تُخرج رابطاً صحيحاً **بالصدفة**. لكن `phone` عنده
 * محليٌّ (١٠ من ١١)، وأول متعهد يُدخِل واتسابه كما يكتبه في هاتفه (`0101…`) كان
 * يقع في الخطأ نفسه. فالصحة هنا كانت خاصيةَ بيانات لا خاصيةَ كود.
 */
export function ContactLinks({
  phone,
  whatsapp,
}: {
  phone: string | null;
  whatsapp: string | null;
}) {
  const tel = telLink(phone);
  const wa = waLink(whatsapp);
  return (
    <span className="flex flex-wrap items-center gap-2">
      {phone &&
        (tel ? (
          <a
            href={tel}
            className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs transition-colors hover:border-primary hover:text-primary"
          >
            <Phone className="size-3.5" />
            <span dir="ltr">{phone}</span>
          </a>
        ) : (
          <span className="text-xs" dir="ltr">
            {phone}
          </span>
        ))}
      {wa && (
        <a
          href={wa}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 px-2 py-1 text-xs text-emerald-800 transition-colors hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-200 dark:hover:bg-emerald-950"
        >
          <MessageCircle className="size-3.5" />
          واتساب
        </a>
      )}
      {!phone && !wa && <span className="text-sm text-muted-foreground">—</span>}
    </span>
  );
}

export function SocialLinks({ socials }: { socials: SubcontractorView["socials"] }) {
  const entries: { key: string; href: string; icon: typeof Globe; label: string }[] = [];
  if (socials.website)
    entries.push({ key: "web", href: socials.website, icon: Globe, label: "الموقع" });
  if (socials.facebook)
    entries.push({ key: "fb", href: socials.facebook, icon: ExternalLink, label: "فيسبوك" });
  if (socials.instagram)
    entries.push({ key: "ig", href: socials.instagram, icon: ExternalLink, label: "انستغرام" });

  if (entries.length === 0) return <span className="text-sm text-muted-foreground">—</span>;
  return (
    <span className="flex flex-wrap items-center gap-2">
      {entries.map((entry) => {
        const Icon = entry.icon;
        return (
          <a
            key={entry.key}
            href={entry.href}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs transition-colors hover:border-primary hover:text-primary"
          >
            <Icon className="size-3.5" />
            {entry.label}
          </a>
        );
      })}
    </span>
  );
}

// ---------------------------------------------------------------------------
// بطاقة الرأس
// ---------------------------------------------------------------------------

/** خانةُ حقيقةٍ داخل رأس البطاقة: تسمية فوق قيمة */
function Fact({ label, help, children }: { label: string; help?: ReactNode; children: ReactNode }) {
  return (
    <div className="min-w-0 space-y-1">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {label}
        {help ? <HelpTip>{help}</HelpTip> : null}
      </div>
      <div className="text-sm">{children}</div>
    </div>
  );
}

/**
 * حالة اتفاقية الشراكة — **أربع حالات**، والتمييز بينها تشغيليّ لا تجميليّ:
 * من انتهت مهلته ولم يقبل **يخرج من حوض التوزيع فعلاً**
 * (`dispatch_pool` تُرشّح بـ`partner_agreement_ok`، وهي `st.ok` نفسها).
 * وحين يكون الحاجز مطفأً من اللوحة لا يمنع القبولُ الناقص شيئاً — فلا تُقال
 * جملةُ إنفاذٍ لا تنفّذها القاعدة (النمط ٢ في `LESSONS.md`).
 */
function AgreementBadge({ agreement }: { agreement: PartnerAgreementState | null }) {
  if (!agreement) {
    return (
      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
        —
        <HelpTip>
          تعذّرت قراءة حالة الاتفاقية من قاعدة البيانات (الدالة{" "}
          <code dir="ltr">admin_agreement_partners</code>). و«لا نعرف» ليست «لم يقبل» —
          فلا يُبنى على هذا الفراغ قرار.
        </HelpTip>
      </span>
    );
  }

  if (agreement.accepted) {
    return (
      <span className="inline-flex flex-wrap items-center gap-1.5">
        <Badge
          variant="outline"
          className="gap-1 border-emerald-300 bg-emerald-100 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-100"
        >
          <CheckCircle2 className="size-3" aria-hidden="true" />
          قَبِلها
        </Badge>
        {agreement.acceptedVersion !== null && (
          <span className="text-xs text-muted-foreground">
            الإصدار {toArabicDigits(agreement.acceptedVersion)}
          </span>
        )}
        {agreement.acceptedAt && (
          <span className="text-xs text-muted-foreground" title={dateTimeLabel(agreement.acceptedAt)}>
            · {relativeTime(agreement.acceptedAt)}
          </span>
        )}
      </span>
    );
  }

  if (agreement.inGrace) {
    return (
      <span className="inline-flex flex-wrap items-center gap-1.5">
        <Badge
          variant="outline"
          className="gap-1 border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"
        >
          <FileSignature className="size-3" aria-hidden="true" />
          لم يقبلها بعد
        </Badge>
        <span className="text-xs text-muted-foreground">
          المهلة حتى {dateTimeLabel(agreement.deadline)}
        </span>
      </span>
    );
  }

  if (!agreement.ok) {
    return (
      <span className="inline-flex flex-wrap items-center gap-1.5">
        <Badge
          variant="outline"
          className="gap-1 border-red-300 bg-red-100 text-red-900 dark:border-red-700 dark:bg-red-950 dark:text-red-100"
        >
          <XCircle className="size-3" aria-hidden="true" />
          انتهت مهلته ولم يقبل
        </Badge>
        <span className="text-xs text-muted-foreground">
          لا تصله عروضٌ حتى يقبلها من بوابته — حوض التوزيع يُرشّحه بهذا الشرط.
        </span>
      </span>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <Badge variant="outline" className="gap-1">
        <FileSignature className="size-3" aria-hidden="true" />
        لم يقبلها
      </Badge>
      <span className="text-xs text-muted-foreground">
        وحاجزُ الاتفاقية مطفأٌ من اللوحة، فلا يمنعه هذا من استقبال العروض.
      </span>
    </span>
  );
}

/**
 * بطاقةُ رأسٍ واحدة تجمع ما يُسأل عنه قبل أي إجراء: مَن هو، أهو معتمد،
 * كيف نبلغه، أهو موجودٌ الآن، متى انضم، وهل وقّع.
 *
 * وحلّت محلّ سطرِ عنوانٍ عارٍ **وبطاقةِ ظهورٍ منفصلة** كانتا تفصلان معلومتين
 * تُقرآن معاً دائماً — ولم تُنسخ صياغةُ أيٍّ منهما: الوسوم هي نفسها من
 * `presence-ui`.
 */
export function PartnerHeaderCard({
  sub,
  presence,
  presenceReady,
  agreement,
}: {
  sub: SubcontractorView;
  presence: PartnerPresence | null;
  presenceReady: boolean;
  agreement: PartnerAgreementState | null;
}) {
  return (
    <Card className="gap-4 p-5">
      <div className="flex flex-wrap items-start gap-4">
        {sub.avatarUrl ? (
          /* صورةٌ قد تكون على دلو التخزين أو على رابطٍ خارجي يكتبه المتعهد
             بنفسه، فلا تمرّ بمُحسِّن الصور — نفس ما تفعله صفحة ملفه في البوابة */
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={sub.avatarUrl}
            alt={`صورة ${sub.companyName}`}
            className="size-16 shrink-0 rounded-full object-cover ring-1 ring-foreground/10"
          />
        ) : (
          <span
            className="grid size-16 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground ring-1 ring-foreground/10"
            aria-hidden="true"
          >
            <UserRound className="size-7" />
          </span>
        )}

        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-heading text-lg font-bold">{sub.companyName}</h2>
            <SubStatusBadge status={sub.status} />
            <HelpTip>
              {isSubStatus(sub.status)
                ? SUB_STATUS_HINTS[sub.status]
                : "حالة غير معروفة — راجع قيم العمود في قاعدة البيانات."}
            </HelpTip>
          </div>
          {sub.contactName && (
            <p className="text-sm text-muted-foreground">مسؤول التواصل: {sub.contactName}</p>
          )}
          <ContactLinks phone={sub.phone} whatsapp={sub.whatsapp} />
        </div>

        <Link
          href="/admin/subcontractors"
          className="text-sm text-muted-foreground transition-colors hover:text-primary hover:underline"
        >
          العودة إلى المتعهدين
        </Link>
      </div>

      <Separator />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Fact
          label="الظهور"
          help={
            <>
              «هل هو داخل بوابته الآن؟» — نبضةٌ تُسجَّل مع كل طلبٍ من بوابته، مرةً كل
              دقيقة على الأكثر. و<span className="font-semibold">غيرُ المتصل قد يردّ على
              تليجرام خلال ثوانٍ</span>، فلا يُقرأ هذا الوسم وحده.
            </>
          }
        >
          <PresenceBadge presence={presence ?? undefined} ready={presenceReady} />
        </Fact>

        <Fact
          label="قابلية الوصول"
          help={
            <>
              «هل يصله بلاغُ الرحلة وهل يقبله؟» — وهو الشرط نفسه الذي تعمل عليه موجات
              البثّ. والمتصلُ قد يكون أطفأ العروض، فالعمودان معاً أو لا معنى لأيّهما.
            </>
          }
        >
          <ReachBadge presence={presence ?? undefined} ready={presenceReady} />
        </Fact>

        <Fact label="انضم" help="تاريخ إنشاء صفّه في القاعدة — لا تاريخ أول رحلة له.">
          {sub.createdAt ? (
            <span title={dateTimeLabel(sub.createdAt)}>
              {relativeTime(sub.createdAt)}
              <span className="block text-xs text-muted-foreground">
                {dateTimeLabel(sub.createdAt)}
              </span>
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </Fact>

        <Fact
          label="اتفاقية الشراكة"
          help="يقبلها المتعهد بنفسه من بوابته على الإصدار الساري. ومن انتهت مهلته ولم يقبل يخرج من حوض التوزيع ما دام الحاجز مشتعلاً."
        >
          <AgreementBadge agreement={agreement} />
        </Fact>
      </div>

      {presence ? (
        <ReachDetail presence={presence} />
      ) : (
        <p className="text-xs text-muted-foreground">
          {presenceReady
            ? "لا صفَّ ظهورٍ لهذا الشريك بعد."
            : "تعذّرت قراءة الظهور — نفِّذ هجرة 0118. و«لا نعرف» ليست «غير متصل»."}
        </p>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// المؤشرات
// ---------------------------------------------------------------------------

/** سطرُ تعذُّرٍ بحجم سطر — الشاشة شاشةُ عملٍ لا شاشةُ أرقام، فلا تُصادَر بلوحة */
function MetricsNotice({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
      <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

const num = (value: number | null, currency: string) =>
  formatStatValue(value, "number", currency);

/**
 * ستُّ بطاقاتٍ تختصر الشريك: ما نُفِّذ، وما ينتظر التنفيذ، وما أُلغي، وكم
 * أُسند إليه إجمالاً، وكم يقبل مما يُعرض عليه، وكم بيننا وبينه الآن.
 *
 * والبطاقة الأخيرة **لا تحسب مالاً**: نصُّها ومقدارها يصلان من
 * `settlementWording` — نفس الكائن الذي ترسم به بطاقةُ التسوية أسفل الشاشة،
 * فالرقمان واحدٌ بالبناء لا بالمصادفة.
 */
export function PartnerKpiRow({
  metrics,
  currency,
  settlement,
  settlementHref,
}: {
  metrics: PartnerMetrics;
  currency: string;
  /**
   * حالةُ التسوية بثلاث قيمٍ لا اثنتين — و**الخلطُ بينها هو العيب الذي أمسكه
   * التحقّق الحيّ**: أول نسخةٍ من هذه البطاقة مرّرت `null` لكلتا الحالتين
   * «لم يُقرأ الدفتر» و«لا حركة له بعد»، فطبعت «تعذّرت قراءة التسوية» فوق
   * بطاقةٍ تقول أسفلها «لا حركة مالية لهذا الشريك بعد» — جملتان متناقضتان عن
   * شيءٍ واحد على شاشةٍ واحدة (القاعدة ١٥: «لا نعرف» ليست «صفراً»).
   */
  settlement:
    | { kind: "notReady" }
    | { kind: "empty" }
    | { kind: "ready"; wording: SettlementWording };
  settlementHref: string;
}) {
  if (!metrics.ready) {
    return (
      <MetricsNotice>
        تعذّرت قراءة مؤشرات هذا الشريك من <code dir="ltr">v_stats_partners</code> — راجع
        سجل الخادم، وتأكد أنك مسجَّل الدخول بحساب دوره <code dir="ltr">admin</code>. وبقية
        الملف تعمل طبيعياً، ولا تُعرض أصفارٌ مكان ما لم يُقرأ.
      </MetricsNotice>
    );
  }

  if (!metrics.totals) {
    return (
      <Card className="space-y-1 p-5">
        <h3 className="flex items-center gap-1.5 font-heading text-base font-bold">
          <Route className="size-4 text-primary" />
          لم تُسنَد إليه رحلة بعد
          <HelpTip>
            مؤشرات الشريك تُبنى على الرحلات المُسنَدة إليه، ولا رحلة واحدة له حتى الآن —
            فلا تُعرض شبكةُ أصفارٍ ولا رسمٌ مسطّح. تظهر البطاقات والرسوم فور إسناد أول
            رحلة، ومعها نسبةُ قبوله للعروض.
          </HelpTip>
        </h3>
        <p className="text-sm leading-relaxed text-muted-foreground">
          راجع أنه <span className="font-medium">معتمد</span> وأن قوائم أسعاره مُعتمدة وأن
          تليجرامه مربوط — فهذه شروط وصول العروض إليه أصلاً. وحالتها كلها معروضة في هذه
          الصفحة.
        </p>
      </Card>
    );
  }

  const totals = metrics.totals;
  /*
    صياغةٌ بلا تمييزٍ معدود: «٣ من ٥ عرضاً» خطأٌ نحويّ (التمييز المفرد المنصوب
    لأحدَ عشر فصاعداً)، والصواب يختلف باختلاف الرقم نفسه. فالعددان يُعرضان
    بتسميتَيهما بدل أن يُحشرا في جملةٍ واحدة تنكسر عند بعض القيم.
  */
  const offersSub =
    totals.offersCount === null
      ? "عدد العروض غير متاح."
      : totals.offersCount === 0
        ? "لم يُبَثّ إليه عرضٌ بعد، فلا نسبة."
        : `بُثَّ إليه: ${num(totals.offersCount, currency)} · قَبِل منها: ${num(totals.acceptedCount, currency)}`;

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <KpiCard
        title="رحلات مكتملة"
        icon={CheckCircle2}
        value={num(totals.completedCount, currency)}
        valueDir="ltr"
        help="الرحلات التي سُجِّلت «منفَّذة» فعلاً — وهي وحدها التي تُقيَّد مستحقاتها في الدفتر. رحلةٌ جارية الآن ليست منها بعد."
        sub={
          totals.completedCount === 0
            ? "لم تكتمل له رحلة بعد."
            : `من ${num(totals.tripsCount, currency)} رحلة أُسندت إليه.`
        }
      />
      <KpiCard
        title="مجدولة أو جارية"
        icon={CalendarClock}
        value={num(metrics.scheduled, currency)}
        valueDir="ltr"
        help="ما أُسند إليه ولم يُنفَّذ بعد (حالتا «مُسنَد» و«مؤكَّد»). و«—» تعني تعذُّر العدّ لا انعدامه."
        sub={
          metrics.scheduled === 0
            ? "لا رحلة تنتظر التنفيذ الآن."
            : "تنتظر التنفيذ أو جاريةٌ الآن."
        }
      />
      <KpiCard
        title="رحلات ملغاة"
        icon={XCircle}
        value={num(metrics.cancelled, currency)}
        valueDir="ltr"
        help="حجوزاتٌ أُسندت إليه ثم أُلغيت — بإلغاء العميل أو بقرار التشغيل. الرقم لا يميّز السبب، وتفصيله في سجل كل طلب."
        sub={metrics.cancelled === 0 ? "لم تُلغَ له رحلة." : "راجع سجل كل طلب لسببه."}
      />
      <KpiCard
        title="إجمالي ما أُسند إليه"
        icon={Route}
        value={num(totals.tripsCount, currency)}
        valueDir="ltr"
        help="كل حجزٍ يحمل اسمه بأي حالة — منفَّذاً كان أو جارياً أو ملغى. وهو نفس الرقم الذي يعرضه قسم الإحصائيات لهذا الشريك، من العرض نفسه."
        sub={
          totals.lastTripAt
            ? `آخر إسنادٍ ${relativeTime(totals.lastTripAt)}.`
            : "لا تاريخ إسنادٍ متاح."
        }
      />
      <KpiCard
        title="نسبة قبول العروض"
        icon={Percent}
        value={formatStatValue(totals.acceptRate, "percent", currency)}
        valueDir="ltr"
        help="كم يقبل مما يُعرض عليه — محسوبةً في قاعدة البيانات من عروض التوزيع كلها منذ البداية، لا من فترةٍ مختارة. و«—» تعني أنه لم يُعرَض عليه شيء بعد، لا أنه يرفض كل شيء."
        sub={offersSub}
      />
      <KpiCard
        title="صافي التسوية الآن"
        icon={Scale}
        href={settlementHref}
        value={
          settlement.kind === "ready" && settlement.wording.magnitude !== null
            ? formatStatValue(settlement.wording.magnitude, "money", currency)
            : "—"
        }
        valueDir="ltr"
        help="نفس رقم بطاقة التسوية أدناه وبنفس صياغتها — لا حساب ثانياً له هنا. اضغط البطاقة لتنتقل إليها."
        sub={
          settlement.kind === "ready"
            ? settlement.wording.verdict
            : settlement.kind === "empty"
              ? "لا حركة مالية له بعد — لم تكتمل له رحلة ولم تُسجَّل له دفعة."
              : "دفتر المالية غير مقروء على هذه القاعدة."
        }
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// الرسمان
// ---------------------------------------------------------------------------

/**
 * رسمان لا أكثر: **متى** يعمل هذا الشريك، و**بأي فئات**.
 *
 * ولا يُرسم أيٌّ منهما بلا بيانات: الفارغ يُقال جملةً. والسلسلة الشهرية تُلغى
 * كلها إن سقطت سلةٌ واحدة — الثقب في خطٍّ زمني يُقرأ صفراً وهو ليس صفراً.
 */
export function PartnerCharts({
  metrics,
  currency,
}: {
  metrics: PartnerMetrics;
  currency: string;
}) {
  if (!metrics.totals) return null;

  return (
    <StatsPanel
      title="رحلاته شهراً بشهر"
      icon={BarChart3}
      help={
        <>
          عددُ الحجوزات المُسنَدة إليه في كل شهر —{" "}
          <span className="font-semibold">بتاريخ إنشاء الحجز</span> لا بتاريخ تنفيذ
          الرحلة، وهو نفس التاريخ الذي يقيس به قسم الإحصائيات. وكل شهرٍ عدٌّ مستقل في
          قاعدة البيانات، وحدودُه منتصفُ ليلٍ بتوقيت الموقع لا بتوقيت غرينتش. والزمن
          يجري من اليمين (الأقدم) إلى اليسار (هذا الشهر).
        </>
      }
      description="يبدأ الرسم من شهر أول رحلة له، وبحدٍّ أدنى ثلاثة أشهر وأقصى اثني عشر."
    >
      {metrics.monthlyReady && metrics.monthly ? (
        <StatChart
          series={[metrics.monthly]}
          granularity="month"
          format="number"
          currency={currency}
          title="عدد الرحلات المُسندة إلى هذا المتعهد شهراً بشهر"
        />
      ) : (
        <MetricsNotice>
          تعذّر عدُّ شهرٍ واحد أو أكثر، فلم يُرسم الخط كله — سلةٌ ناقصة في سلسلةٍ زمنية
          تُقرأ صفراً وهي ليست صفراً. أعد تحميل الصفحة، وإن تكرر فراجع سجل الخادم.
        </MetricsNotice>
      )}
    </StatsPanel>
  );
}
