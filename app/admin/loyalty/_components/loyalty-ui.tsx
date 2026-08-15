import * as React from "react";
import { AlertTriangle, CheckCircle2, Coins, XCircle } from "lucide-react";

import { formatAmount, formatMoney } from "@/components/booking/format";
import { HelpTip } from "@/components/shared/HelpTip";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { LoyaltyDirection } from "@/lib/loyalty-types";
// أنواع محضة (تُمحى عند البناء) فلا تجرّ `server-only` إلى حزمة العميل
import type { StatsFailure } from "@/lib/stats/read";
import type { LoyaltyTone } from "../messages";
import type { LoyaltyLiability } from "../loader";

/**
 * لبنات شاشة الولاء — **مكوّنات خادمية** بلا `"use client"` وبلا حالة: كل تفاعل
 * يمرّ بنموذج، فتعمل الشاشة بجافاسكربت معطّل ولا يُرسَل جافاسكربت لأجل بطاقة.
 *
 * ولا يُحسب هنا رقمٌ واحد يُطبع: الأرقام تصل كما كتبتها القاعدة، وما لم يصل
 * يُكتب «—» بسببٍ مسمّى — لا صفراً (القاعدة ١٥ في `handover/INDEX.md`).
 */

/** ما يُعرض مكان رقمٍ لم يصل — علامةٌ واحدة في الشاشة كلها لا ثلاث */
const UNKNOWN = "—";

// ---------------------------------------------------------------------------
// بطاقات الحالة
// ---------------------------------------------------------------------------

const TONE_CLASSES: Record<LoyaltyTone, string> = {
  success:
    "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-100",
  warning:
    "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100",
};

export function NoticeCard({ tone, children }: { tone: LoyaltyTone; children: React.ReactNode }) {
  const Icon = tone === "success" ? CheckCircle2 : AlertTriangle;
  return (
    <Card className={`flex flex-row items-start gap-3 p-4 ${TONE_CLASSES[tone]}`}>
      <Icon className="mt-0.5 size-5 shrink-0" />
      <p className="text-sm leading-relaxed font-medium">{children}</p>
    </Card>
  );
}

export function ErrorCard({ children }: { children: React.ReactNode }) {
  return (
    <Card className="flex flex-row items-start gap-3 border-red-300 bg-red-50 p-4 text-red-900 dark:border-red-700 dark:bg-red-950 dark:text-red-100">
      <XCircle className="mt-0.5 size-5 shrink-0" />
      <p className="text-sm leading-relaxed font-medium">{children}</p>
    </Card>
  );
}

const FAILURE_TITLES: Record<StatsFailure, string> = {
  migration: "نظام الولاء غير منفَّذ في قاعدة البيانات",
  forbidden: "هذه الشاشة للمديرين فقط",
  input: "رفضت قاعدة البيانات مُدخلات هذه القراءة",
  failed: "تعذّرت قراءة بيانات الولاء",
};

/**
 * «غير جاهزة» بسببٍ مسمّى — والتفريق بين «الهجرة لم تُنفَّذ» و«حسابك ليس admin»
 * و«فشل قراءة» ليس ترفاً: الأولى يحلّها المالك بأمرٍ واحد، والثانية بتسجيل دخولٍ
 * آخر، والثالثة تحتاج سجل الخادم.
 */
export function NotReady({
  wired,
  missing,
  failure,
}: {
  wired: boolean;
  missing: string;
  failure: StatsFailure | null;
}) {
  const kind: StatsFailure = failure ?? "failed";
  return (
    <Card className="flex flex-row items-start gap-3 border-amber-300 bg-amber-50 p-4 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
      <AlertTriangle className="mt-0.5 size-5 shrink-0" />
      <div className="space-y-1 text-sm leading-relaxed">
        <p className="font-semibold">
          {wired ? FAILURE_TITLES[kind] : "قاعدة البيانات غير مربوطة بعد"}
        </p>
        {!wired ? (
          <p>
            تُفعَّل إدارة الولاء بعد تنفيذ خطوات <code dir="ltr">supabase/README.md</code> وإعادة
            تشغيل الخادم. بقية اللوحة تعمل طبيعياً.
          </p>
        ) : kind === "migration" ? (
          <p>
            قاعدة البيانات مربوطة لكن <code dir="ltr">{missing}</code> غير موجود — نفِّذ هجرة
            المرحلة ١٢ب (<code dir="ltr">0047_loyalty.sql</code>) بأمر{" "}
            <code dir="ltr">pnpm db:migrate</code> ثم أعد تحميل الصفحة. ولا نقطة تُسكّ ولا تُستبدل
            قبلها، فالنظام غير موجود لا مطفأً فحسب.
          </p>
        ) : kind === "forbidden" ? (
          <p>
            رفضت قاعدة البيانات قراءة <code dir="ltr">{missing}</code> — إدارة الولاء محروسة بحساب
            دوره <code dir="ltr">admin</code>. سجّل الدخول بحساب مدير؛ حسابات المتعهدين لا تصل إلى
            هذه الشاشة ولا إلى أرقام الالتزام فيها.
          </p>
        ) : kind === "input" ? (
          <p>
            رفضت <code dir="ltr">{missing}</code> المُدخلات المرسلة. راجع المعرّف في الرابط.
          </p>
        ) : (
          <p>
            تعذّرت قراءة <code dir="ltr">{missing}</code>. راجع سجل الخادم لرسالة قاعدة البيانات؛
            بقية أجزاء الشاشة تُعرض بما توفّر منها.
          </p>
        )}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 🔴 بطاقة الالتزام — الرقم الوحيد الذي يمثّل مالاً مستحقاً علينا
// ---------------------------------------------------------------------------

/**
 * الالتزام القائم.
 *
 * 🔴 **لماذا قد تظهر قيمةٌ بالجنيه «—» بينما النقاط رقمٌ صحيح؟** لأن تحويل
 * النقاط إلى مالٍ **ضربٌ مالي**، و**D-05** يمنعه في TypeScript. فهو يصل محسوباً
 * من `v_loyalty_liability` أو لا يصل. والضرب هنا «مؤقتاً» كان سيصنع مصدراً ثانياً
 * لرقمٍ واحد — وهو **حجم دَينٍ على المنصة**، أي أسوأ رقمٍ يصلح لمصدرين.
 */
export function LiabilityCard({
  liability,
  ready,
  fallbackCurrency,
  systemEnabled,
}: {
  liability: LoyaltyLiability;
  /** هل وصلت القراءة؟ الفشل يُقال، ولا يُقرأ الفراغ على أنه «لا التزام» */
  ready: boolean;
  /** عملة الموقع من `pricing_settings` — تُستعمل **للعرض** حين لا تُرجع القاعدة عملتها */
  fallbackCurrency: string;
  /**
   * ⚠ **ثلاثية لا ثنائية**: `null` تعني «لم تُقرأ حالة النظام».
   *
   * كانت `boolean`، فكان تعذّر قراءة الإعدادات يُقرأ `false` فتقول البطاقة
   * «النظام مطفأ: هذا الرقم لا يرتفع الآن» — **طمأنينةٌ كاذبة** بينما المحرّك قد
   * يكون يسكّ. أمسكها التحقق الحيّ على الشاشة نفسها، لا مراجعةُ كود: بطاقةُ
   * الحالة أعلاه كانت تقول «غير معروفة» بينما هذه تقول «مطفأ» — في شاشةٍ واحدة.
   * («لا نعرف» و«صفر» و«لا ينطبق» ثلاثة أشياء — القاعدة ١٥.)
   */
  systemEnabled: boolean | null;
}) {
  const currency = liability.currency ?? fallbackCurrency;
  const hasPoints = ready && liability.points !== null;
  const hasWorth = ready && liability.worth !== null;

  return (
    <Card className="space-y-4 p-5">
      <div>
        <h3 className="flex flex-wrap items-center gap-1.5 font-heading text-base font-bold">
          <Coins className="size-4 shrink-0 text-primary" />
          الالتزام القائم بالنقاط
          <HelpTip>
            مجموع الأرصدة التي كسبها العملاء ولم يستبدلوها بعد. وهو <strong>مالٌ مستحق
            علينا</strong> لا مصروفاً وقع: لم يخرج من الخزينة، ويخرج لاحقاً خصماً على رحلةٍ قادمة —
            فينقص إيرادَ تلك الرحلة لا رصيدَ الخزينة اليوم. والقيمة بالجنيه تُحسب في قاعدة البيانات
            ولا تُضرب في هذه الشاشة.
          </HelpTip>
        </h3>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <p className="text-xs text-muted-foreground">نقاط قائمة</p>
          <p dir="ltr" className="mt-1 font-heading text-2xl font-bold tabular-nums">
            {hasPoints ? formatAmount(liability.points as number) : UNKNOWN}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">ما تعادله اليوم</p>
          <p
            dir="ltr"
            className="mt-1 font-heading text-2xl font-bold tabular-nums text-amber-700 dark:text-amber-300"
          >
            {hasWorth ? formatMoney(liability.worth as number, currency) : UNKNOWN}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">عملاء لهم رصيد</p>
          <p dir="ltr" className="mt-1 font-heading text-2xl font-bold tabular-nums">
            {ready && liability.accounts !== null ? formatAmount(liability.accounts) : UNKNOWN}
          </p>
        </div>
      </div>

      {!ready ? (
        <p className="text-xs leading-relaxed text-amber-700 dark:text-amber-300">
          لم تصل قراءة الالتزام — و«—» هنا تعني <strong>«لا نعرف»</strong> لا «صفر». السبب مذكور في
          البطاقة الكهرمانية أعلى الشاشة.
        </p>
      ) : liability.worth === null ? (
        <p className="text-xs leading-relaxed text-amber-700 dark:text-amber-300">
          وصلت النقاط ولم تصل قيمتها بالجنيه من <code dir="ltr">{"v_loyalty_liability"}</code>.
          ولا تُضرب هنا: كل حساب مالي في قاعدة البيانات (D-05)، وضربها في الواجهة كان سيصنع رقماً
          ثانياً لحجم دَينٍ واحد.
        </p>
      ) : null}

      <p className="text-xs leading-relaxed text-muted-foreground">
        {systemEnabled === null
          ? "حالة النظام غير مقروءة، فلا يُقال هنا إن الرقم يرتفع ولا إنه ثابت — الجملتان ادّعاءٌ بلا قراءة."
          : systemEnabled
            ? "النظام مفعَّل: هذا الرقم يرتفع مع كل رحلة تكتمل، وينزل بالاستبدال وحده."
            : "النظام مطفأ: هذا الرقم لا يرتفع الآن. وما سُكّ سابقاً يبقى ديناً قائماً — الإطفاء يوقف السكّ ولا يمحو رصيداً."}{" "}
        <strong>ولا انتهاء صلاحية للنقاط</strong> في هذه الدفعة (قرارٌ مكتوب بسببه: لا قناة تبلغ
        العميل قبل الإسقاط اليوم)، فالرقم لا ينزل بمرور الوقت أبداً.
      </p>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// وسم اتجاه الحركة
// ---------------------------------------------------------------------------

/**
 * 🔒 خريطةٌ مُفهرسة بالاتحاد — اتجاهٌ يُضاف إلى `LoyaltyDirection` بلا وسمٍ هنا
 * **لا يُبنى أصلاً**، فلا يظهر في الدفتر بلا اسم.
 */
const DIRECTION_LABELS: Record<LoyaltyDirection, { label: string; className: string }> = {
  earn: { label: "كسب", className: "border-emerald-400 text-emerald-700 dark:text-emerald-300" },
  redeem: { label: "استبدال", className: "border-sky-400 text-sky-700 dark:text-sky-300" },
  reverse: { label: "قيد عاكس", className: "border-amber-400 text-amber-700 dark:text-amber-300" },
  adjust: { label: "تسوية يدوية", className: "text-muted-foreground" },
};

export function DirectionBadge({
  direction,
  raw,
}: {
  direction: LoyaltyDirection | null;
  /** ما وصل حرفياً حين لم يكن اتجاهاً معروفاً — يُعرض ولا يُبتلع */
  raw: string | null;
}) {
  if (direction === null) {
    return (
      <Badge variant="outline" className="font-normal text-muted-foreground">
        اتجاه غير معروف{raw ? ` (${raw})` : ""}
      </Badge>
    );
  }
  const spec = DIRECTION_LABELS[direction];
  return (
    <Badge variant="outline" className={`font-normal ${spec.className}`}>
      {spec.label}
    </Badge>
  );
}

/** نقاط الحركة بإشارتها كما وصلت من القاعدة — تنسيقٌ لا حساب */
export function EntryPoints({ points }: { points: number | null }) {
  if (points === null) {
    return <span className="text-muted-foreground">{UNKNOWN}</span>;
  }
  return (
    <span
      dir="ltr"
      className={`font-medium tabular-nums ${
        points < 0 ? "text-sky-700 dark:text-sky-300" : "text-emerald-700 dark:text-emerald-300"
      }`}
    >
      {points > 0 ? "+" : ""}
      {formatAmount(points)}
    </span>
  );
}
