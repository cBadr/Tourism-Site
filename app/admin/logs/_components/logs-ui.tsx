import type { ReactNode } from "react";
import { AlertTriangle, ArrowLeft, ShieldOff } from "lucide-react";

import { HelpTip } from "@/components/shared/HelpTip";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { AuditAction, AuditActorKind, AuditedEntity } from "@/lib/audit-types";
import type { StatsFailure } from "@/lib/stats/read";
import { cn } from "@/lib/utils";

/**
 * لبنات شاشة السجلات (الملاحظة ١٥) — العقد في `lib/audit-types.ts`.
 *
 * كلها مكوّنات **خادمية** بلا `"use client"` وبلا حالة: الشاشة قراءة محضة، وكل
 * ترشيح فيها يمر بالرابط. ونفس إيقاع `orders/_components/booking-ui.tsx`:
 * وسوم ملوّنة، وقوائم تسمية مغلقة بالعقد، ومساعدات عرض لا حساب.
 *
 * ثلاث قواعد يفرضها هذا الملف على من يستورده:
 *
 * (١) **لا رقم مشتقّ هنا إطلاقاً.** لا عدّ صفوف ولا عدّ حقول ولا نسبة. السجل
 *     يعرض ما وصل من `audit_search`، وأي عدّاد يُراد يوماً مكانه Postgres.
 *
 * (٢) **الحجب أسبقُ من العرض.** `ChangesList` تفحص علامة الحجب **قبل** أن تنظر
 *     في `from`/`to` أصلاً، فلا يوجد مسارٌ في هذا الملف يطبع قيمة عمودٍ وسمته
 *     القاعدة محجوباً — والأمان بنيوي لا انضباطي (قاعدة المرحلة ٥).
 *
 * (٣) **القيم تُعرض كما خُزِّنت، وأسماء الأعمدة بالإنجليزية كما في الجدول.**
 *     ترجمة أسماء أعمدة اثنين وثلاثين جدولاً كانت ستصنع طبقة تسمية ثانية تنحرف
 *     عن القاعدة بصمت؛ والمدقّق يريد مطابقة ما يراه بما في `psql` حرفاً بحرف.
 */

// ---------------------------------------------------------------------------
// (١) صنف الفاعل
// ---------------------------------------------------------------------------

/**
 * ⚠ `Record<AuditActorKind, …>` لا `Record<string, …>`: إضافة صنف إلى العقد بلا
 * تسميته هنا **تكسر البناء** بدل أن تُنتج وسماً فارغاً على شاشة المالك.
 */
export const ACTOR_KIND_LABELS: Record<AuditActorKind, string> = {
  admin: "مشرف",
  ops: "تشغيل",
  partner: "متعهد",
  customer: "عميل",
  guest: "زائر",
  system: "النظام",
  db: "اتصال مباشر",
};

export const ACTOR_KIND_HINTS: Record<AuditActorKind, string> = {
  admin: "حساب دوره admin — يملك كل صلاحيات اللوحة.",
  ops: "حساب تشغيل — ينفّذ العمل اليومي بلا صلاحيات الإعدادات.",
  partner: "متعهد مسجّل الدخول من بوابة المتعهدين.",
  customer: "حساب عميل — لا وجود له في القاعدة اليوم، والصنف مُعرَّف مسبقاً في العقد.",
  guest: "بلا حساب: حجز من الموقع العام أو رفع إيصال بتوكن متابعة.",
  system: "مفتاح الخدمة — دورة البث، أو webhook بوابة الدفع، أو عامل الإشعارات.",
  db: "اتصال مباشر بالقاعدة: هجرة أو سكربت أو محرر SQL.",
};

/**
 * ألوان الأصناف — نفس لوحة `STATUS_TONE` في شاشة الطلبات.
 *
 * والتدرّج مقصود: `db` و`system` بلونٍ محايد لأنهما ليسا اتهاماً ولا إنجازاً،
 * و`guest` بلون تنبيه خفيف لأن فعلاً لا يُنسب إلى حساب هو أول ما يبحث عنه
 * المدقّق حين يقرأ سطراً لا يفهم مصدره.
 */
const ACTOR_KIND_TONE: Record<AuditActorKind, string> = {
  admin:
    "border-violet-300 bg-violet-100 text-violet-900 dark:border-violet-700 dark:bg-violet-950 dark:text-violet-100",
  ops: "border-sky-300 bg-sky-100 text-sky-900 dark:border-sky-700 dark:bg-sky-950 dark:text-sky-100",
  partner:
    "border-teal-300 bg-teal-100 text-teal-900 dark:border-teal-700 dark:bg-teal-950 dark:text-teal-100",
  customer:
    "border-emerald-300 bg-emerald-100 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-100",
  guest:
    "border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100",
  system: "border-border bg-muted text-muted-foreground",
  db: "border-border bg-muted text-muted-foreground",
};

const ACTOR_KINDS = Object.keys(ACTOR_KIND_LABELS) as AuditActorKind[];

export const isActorKind = (value: unknown): value is AuditActorKind =>
  typeof value === "string" && (ACTOR_KINDS as string[]).includes(value);

/** وسم الصنف — القيمة التي لا يعرفها العقد تُطبع كما هي ولا تُترجم إلى صنفٍ آخر */
export function ActorKindBadge({ kind, className }: { kind: string; className?: string }) {
  const known = isActorKind(kind);
  return (
    <Badge
      variant="outline"
      title={known ? ACTOR_KIND_HINTS[kind] : "صنف فاعل لا يعرفه العقد — يُعرض كما ورد من القاعدة"}
      className={cn(known ? ACTOR_KIND_TONE[kind] : "border-border text-muted-foreground", className)}
    >
      {known ? ACTOR_KIND_LABELS[kind] : kind}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// (٢) الإجراء
// ---------------------------------------------------------------------------

export const ACTION_LABELS: Record<AuditAction, string> = {
  insert: "إضافة",
  update: "تعديل",
  delete: "حذف",
};

const ACTION_TONE: Record<AuditAction, string> = {
  insert:
    "border-emerald-300 bg-emerald-100 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-100",
  update:
    "border-sky-300 bg-sky-100 text-sky-900 dark:border-sky-700 dark:bg-sky-950 dark:text-sky-100",
  delete:
    "border-red-300 bg-red-100 text-red-900 dark:border-red-700 dark:bg-red-950 dark:text-red-100",
};

const ACTIONS = Object.keys(ACTION_LABELS) as AuditAction[];

export const isAuditAction = (value: unknown): value is AuditAction =>
  typeof value === "string" && (ACTIONS as string[]).includes(value);

export function ActionBadge({ action, className }: { action: string; className?: string }) {
  const known = isAuditAction(action);
  return (
    <Badge
      variant="outline"
      className={cn(known ? ACTION_TONE[action] : "border-border text-muted-foreground", className)}
    >
      {known ? ACTION_LABELS[action] : action}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// (٣) الجداول المرصودة
// ---------------------------------------------------------------------------

/**
 * اسم عربي لكل جدول مرصود — `Record<AuditedEntity, …>` كذلك: جدولٌ يُضاف إلى
 * `AUDITED_ENTITIES` وإلى مُشغّل 0036 ولا يُسمَّى هنا يوقف البناء، فلا يظهر
 * للمالك تبويبٌ باسم جدولٍ خام.
 */
export const ENTITY_LABELS: Record<AuditedEntity, string> = {
  // الأعمال
  bookings: "الحجوزات",
  payments: "المدفوعات",
  payment_intents: "جلسات الدفع",
  ledger_entries: "قيود الخزينة",
  expenses: "المصروفات",
  partner_payouts: "صرفيات المتعهدين",
  partner_settlements: "تسويات المتعهدين",
  subcontractors: "المتعهدون",
  subcontractor_vehicles: "مركبات المتعهدين",
  price_lists: "قوائم أسعار المتعهدين",
  price_list_items: "بنود قوائم الأسعار",
  dispatches: "عمليات البث",
  trip_offers: "عروض الرحلات",
  quote_requests: "طلبات الأسعار",
  coupons: "الكوبونات",
  profiles: "حسابات المستخدمين",
  tariffs: "التعريفة",
  vehicle_classes: "فئات المركبات",
  extra_services: "الخدمات الإضافية",
  payment_accounts: "حسابات الدفع",
  // الإعدادات
  site_settings: "إعدادات الموقع",
  pricing_settings: "إعدادات التسعير",
  dispatch_settings: "إعدادات البث",
  discount_settings: "إعدادات الخصومات",
  trip_settings: "إعدادات الرحلات",
  partner_credit_settings: "إعدادات ائتمان المتعهدين",
  payment_providers: "بوابات الدفع",
  locales: "اللغات",
  redirects: "تحويلات الروابط",
  // المحتوى
  pages: "الصفحات",
  sections: "أقسام الصفحات",
  promo_banners: "بانرات العروض",
  // أُضيفا مع 0037 — والنوع `Record<AuditedEntity, …>` هو الذي أوقف البناء حتى
  // سُمِّيا، وهو بالضبط ما وُضع لأجله
  booking_extras: "الخدمات المضافة للحجز",
  coupon_redemptions: "استخدامات الكوبونات",
};

/**
 * اسم الجدول للعرض — والقيمة المجهولة تُعرض كما هي.
 *
 * والمجهول ليس افتراضاً نظرياً: السجل **يبقى بعد رفع المُشغّل عن جدول**، فصفوف
 * جدولٍ رُصد يوماً ثم أُخرج من القائمة تظل في `audit_log` إلى أن يُقلَّم. طباعة
 * اسمه الخام أصدق من إخفاء الصف أو نسبته إلى جدول آخر.
 */
export function entityName(entity: string): string {
  return (ENTITY_LABELS as Record<string, string>)[entity] ?? entity;
}

// ---------------------------------------------------------------------------
// (٤) الفاعل — الاسم أو المعرّف المختصر
// ---------------------------------------------------------------------------

/**
 * معرّف مختصر يُعرض حين لا اسم: أول مقطع من الـuuid.
 *
 * ولماذا يُعرض معرّفٌ أصلاً بدل «غير معروف»؟ لأن `audit_log.actor` بلا مفتاح
 * أجنبي بقصد (0007 و0036): الحساب يُحذف ويبقى السطر. فالمعرّف هو كل ما تبقّى
 * من هوية الفاعل، وهو يكفي لربط سطرين ببعضهما ولمطابقة السجل بـ`auth.users`.
 */
export function shortActorId(id: string): string {
  const head = id.split("-")[0] ?? id;
  return head.slice(0, 8);
}

/** اسم الفاعل كما يُعرض: الاسم المسجّل، أو المعرّف المختصر، أو «بلا حساب» لصفٍّ بلا فاعل */
export function actorDisplayName(id: string | null, name: string | null): string {
  if (!id) return "بلا حساب";
  if (name && name.trim() !== "") return name.trim();
  return `#${shortActorId(id)}`;
}

/**
 * أدوار `profiles` بالعربية — وهي **غير** أصناف الفاعل: الدور صفةُ الحساب في
 * جدول المستخدمين، والصنف ما اشتقّته القاعدة لحظة الفعل (‏`subcontractor`
 * دورٌ، ويقابله الصنف `partner`). خلطهما يجعل الشاشة تدّعي أن قيمة عمودٍ في
 * جدول هي نفسها قيمة عمود في جدول آخر.
 */
export const PROFILE_ROLE_LABELS: Record<string, string> = {
  admin: "مشرف",
  ops: "تشغيل",
  subcontractor: "متعهد",
  customer: "عميل",
};

export const roleName = (role: string | null): string =>
  role ? (PROFILE_ROLE_LABELS[role] ?? role) : "";

// ---------------------------------------------------------------------------
// (٥) التغييرات — أخطر مكوّن في الشاشة
// ---------------------------------------------------------------------------

export const REDACTED_TEXT = "تغيّر — القيمة محجوبة";

/** أقصى طول لقيمة داخل قائمة الفروق — والكامل يُقرأ في القاعدة لا هنا */
const VALUE_CLIP = 200;
/** لقطة الحذف تحتمل قيماً أطول: هي كل ما تبقّى من الصف */
const SNAPSHOT_CLIP = 400;

const clip = (text: string, max: number): string =>
  text.length <= max ? text : `${text.slice(0, max)}…`;

/**
 * قيمة jsonb ← نص للعرض.
 *
 * `null` و«نص فارغ» يُفرَّقان عمداً: «الحقل صار فارغاً» و«الحقل صار سلسلة طولها
 * صفر» حدثان مختلفان في قاعدة بيانات، ودمجهما في «—» يخفي فرقاً يُسأل عنه.
 *
 * ولا تحويل للأرقام إلى الخانات العربية هنا: هذه **قيم مخزَّنة** لا أرقام عرض —
 * فيها معرّفات وأكواد وسلاسل ISO، وتعريبُ خاناتها يجعل مطابقتها بالقاعدة عسيرة.
 */
export function valueText(value: unknown, max: number = VALUE_CLIP): string {
  if (value === undefined) return "—";
  if (value === null) return "فارغ";
  if (typeof value === "string") return value === "" ? "«نص فارغ»" : clip(value, max);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return clip(JSON.stringify(value), max);
  } catch {
    return "—";
  }
}

type ChangeCell = { redacted: true } | { redacted: false; from: string; to: string };

/**
 * قراءة خلية واحدة من `changes`.
 *
 * 🔒 **فحص الحجب أولاً وبأوسع شرط ممكن**: وجود المفتاح `redacted` بأي قيمة غير
 * `false` يعني حجباً. اللاتماثل مقصود — «محجوب» ظهرت بلا داعٍ عيبُ عرضٍ يُصلَح،
 * وقيمةٌ سرّية ظهرت لأن الشكل جاء مخالفاً للمتوقَّع تسريبٌ لا يُسترد.
 */
function readChangeCell(value: unknown): ChangeCell {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const cell = value as Record<string, unknown>;
    if ("redacted" in cell && cell.redacted !== false) return { redacted: true };
    if ("from" in cell || "to" in cell) {
      return { redacted: false, from: valueText(cell.from), to: valueText(cell.to) };
    }
  }
  // شكلٌ لا يصفه العقد — يُعرض كاملاً في خانة «إلى» بدل أن يُبتلع الصف
  return { redacted: false, from: "—", to: valueText(value) };
}

/** فرق عمودٍ واحد: الاسم ثم القديم ثم الجديد — أو نصّ الحجب وحده */
function ChangeRow({ column, cell }: { column: string; cell: ChangeCell }) {
  return (
    <li className="flex flex-wrap items-baseline gap-1.5 leading-relaxed">
      <code dir="ltr" className="rounded bg-muted px-1 py-0.5 text-[11px] text-foreground">
        {column}
      </code>
      {cell.redacted ? (
        <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-300">
          <ShieldOff className="size-3 shrink-0" aria-hidden="true" />
          {REDACTED_TEXT}
        </span>
      ) : (
        <>
          <span dir="ltr" className="break-all text-muted-foreground line-through">
            {cell.from}
          </span>
          <ArrowLeft className="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span dir="ltr" className="break-all font-medium">
            {cell.to}
          </span>
        </>
      )}
    </li>
  );
}

/**
 * قائمة الفروق لصف تعديل.
 *
 * `changes` لا يكون إلا للتعديل بعقد المُشغّل (0036): الإضافة والحذف يصلان بها
 * `null`. ولذلك «لا فروق» هنا ليست حالة فراغٍ تحتاج شرحاً بل الوضع الطبيعي
 * لصفَّي الإضافة والحذف — وشرحُ الصف يقع في عمود الإجراء ولقطته لا هنا.
 */
export function ChangesList({ changes }: { changes: Record<string, unknown> | null }) {
  const columns = changes ? Object.keys(changes) : [];
  if (columns.length === 0) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  return (
    <ul className="space-y-1 text-xs">
      {columns.map((column) => (
        <ChangeRow key={column} column={column} cell={readChangeCell(changes?.[column])} />
      ))}
    </ul>
  );
}

/**
 * لقطة الصف المحذوف داخل `<details>` — مطويّة كي لا تبتلع القائمة.
 *
 * والقيم الحساسة تصل مكتوبةً `[محجوب]` من `audit_redact()` في القاعدة، أي أن
 * الحجب وقع قبل أن يُكتب السطر أصلاً — لا هنا ولا في أي طبقة يمكن تخطّيها.
 */
export function SnapshotDetails({ snapshot }: { snapshot: Record<string, unknown> | null }) {
  const columns = snapshot ? Object.keys(snapshot).sort() : [];
  if (columns.length === 0) return null;
  return (
    <details className="mt-1.5">
      <summary className="cursor-pointer text-xs text-primary hover:underline">
        لقطة الصف المحذوف
      </summary>
      <dl className="mt-1.5 space-y-1 rounded-lg bg-muted/50 p-2 text-[11px]">
        {columns.map((column) => (
          <div key={column} className="flex flex-wrap items-baseline gap-1.5">
            <dt dir="ltr" className="shrink-0 font-medium text-muted-foreground">
              {column}
            </dt>
            <dd dir="ltr" className="break-all">
              {valueText(snapshot?.[column], SNAPSHOT_CLIP)}
            </dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

// ---------------------------------------------------------------------------
// (٦) المحاولات المرفوضة
// ---------------------------------------------------------------------------

/**
 * تلميحات الرفض التي تكتبها القاعدة — `Record<string, string>` بقصد لا بتساهل:
 * التلميح نصٌّ حرّ في `using hint = …` موزّع على عشرات الدوال، فلا سبيل لإغلاق
 * قائمته بالنوع. وما لا يُعرف يُطبع كما ورد — أصدق من «سبب آخر».
 */
export const REJECT_REASON_LABELS: Record<string, string> = {
  forbidden: "غير مصرَّح",
  "debt-limit": "تجاوز حد المديونية",
  "margin-floor": "أقل من أرضية الهامش",
  "already-assigned": "مُسنَد بالفعل",
  "immutable-row": "صف غير قابل للتعديل",
  "invalid-input": "مُدخل مرفوض",
  "not-found": "غير موجود",
};

export function RejectReasonBadge({ reason }: { reason: string }) {
  const label = REJECT_REASON_LABELS[reason];
  return (
    <Badge
      variant="outline"
      className="border-red-300 bg-red-100 text-red-900 dark:border-red-700 dark:bg-red-950 dark:text-red-100"
      title={label ? `تلميح القاعدة: ${reason}` : "تلميح رفض لا تسمية عربية له — يُعرض كما ورد"}
    >
      {label ?? reason}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// (٧) تعذّر القراءة — سبب مسمّى لا جدول فارغ
// ---------------------------------------------------------------------------

const FAILURE_TITLES: Record<StatsFailure, string> = {
  migration: "نظام السجلات غير منفَّذ في قاعدة البيانات",
  forbidden: "سجل التدقيق للمديرين فقط",
  input: "رفضت قاعدة البيانات مُدخلات هذا الترشيح",
  failed: "تعذّرت قراءة السجل",
};

/**
 * بطاقة «لم يصل السجل» بسببٍ مسمّى.
 *
 * وهي **شرط صحة لا تجميل** في هذه الشاشة تحديداً: جدولٌ فارغ على شاشة سجلات
 * يقول للمالك «لم يقع شيء»، وهي أخطر جملة يمكن أن تكذب بها شاشة تدقيق. فكل
 * مسار لا يصل فيه صفٌّ واحد **بيقين** ينتهي هنا لا إلى جدول فارغ.
 */
export function LogsNotReady({
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
      <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
      <div className="space-y-1 text-sm leading-relaxed">
        <p className="font-semibold">
          {wired ? FAILURE_TITLES[kind] : "قاعدة البيانات غير مربوطة بعد"}
        </p>
        {!wired ? (
          <p>
            تظهر السجلات بعد تنفيذ خطوات <code dir="ltr">supabase/README.md</code> وإعادة تشغيل
            الخادم. بقية اللوحة تعمل طبيعياً.
          </p>
        ) : kind === "migration" ? (
          <p>
            قاعدة البيانات مربوطة لكن <code dir="ltr">{missing}</code> غير موجود — نفِّذ هجرة
            السجلات (<code dir="ltr">0036_audit_log.sql</code>) بأمر{" "}
            <code dir="ltr">pnpm db:migrate</code> ثم أعد تحميل الصفحة.
          </p>
        ) : kind === "forbidden" ? (
          <p>
            رفضت قاعدة البيانات قراءة <code dir="ltr">{missing}</code> — السجل محروس بحساب دوره{" "}
            <code dir="ltr">admin</code>، بنفس السلّم الذي يحرس أرقام المنصة. سجّل الدخول بحساب
            مدير؛ حسابات المتعهدين والتشغيل لا تصل إلى تاريخ المنصة إطلاقاً.
          </p>
        ) : kind === "input" ? (
          <p>
            رفضت <code dir="ltr">{missing}</code> المُدخلات — غالباً تاريخ غير صالح في حقلَي
            الفترة. امسح الترشيح وابدأ من جديد.
          </p>
        ) : (
          <p>
            تعذّرت قراءة <code dir="ltr">{missing}</code>. راجع سجل الخادم لرسالة قاعدة البيانات —
            ولا تقرأ فراغ هذه الشاشة على أنه «لم يقع شيء».
          </p>
        )}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// (٨) لبنات تخطيط صغيرة
// ---------------------------------------------------------------------------

/** رابط ترشيح على هيئة شريحة — نفس مظهر تبويبات مركز السيو وشريط الأقسام */
export const chipClass = (active: boolean) =>
  cn(
    "rounded-lg px-2.5 py-1 text-xs font-medium transition-colors",
    active
      ? "bg-primary text-primary-foreground"
      : "bg-muted text-muted-foreground hover:text-foreground"
  );

/** ترويسة الشاشة — عنوان وتلميح ووصف، بنفس بنية `StatsHeader` */
export function LogsHeader({
  title,
  help,
  description,
}: {
  title: string;
  help: ReactNode;
  description?: ReactNode;
}) {
  return (
    <div>
      <h2 className="flex flex-wrap items-center gap-2 font-heading text-lg font-bold">
        {title}
        <HelpTip>{help}</HelpTip>
      </h2>
      {description ? (
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p>
      ) : null}
    </div>
  );
}
