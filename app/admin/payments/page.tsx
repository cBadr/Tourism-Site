import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  CreditCard,
  FlaskConical,
  KeyRound,
  ListChecks,
  Power,
  PowerOff,
  ShieldAlert,
} from "lucide-react";

import { toArabicDigits } from "@/components/booking/format";
import { HelpTip } from "@/components/shared/HelpTip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import type { PaymentIntentStatus, ProviderSettings } from "@/lib/payments-types";
import { readProviderSettings } from "@/lib/payments/settings";
import { createServerSupabase } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import {
  asText,
  Banners,
  COMMON_BOOKING_ERRORS,
  dateTimeLabel,
  pick,
  relativeTime,
} from "../orders/_components/booking-ui";
import {
  credentialSpec,
  isPaymentProvider,
  PROVIDER_KIND,
  providerReadiness,
  publicKeyLabel,
} from "./_components/registry";
import {
  IntentMoney,
  IntentStatusBadge,
  INTENT_STATUSES,
  INTENT_STATUS_HINTS,
  INTENT_STATUS_LABELS,
  intentAmountMajor,
} from "./_components/payments-ui";
import { saveProvider, toggleProvider, toggleSandbox } from "./actions";

/**
 * بوابات الدفع الإلكترونية (المرحلة ٩) — شاشة واحدة بثلاث مسؤوليات:
 *
 * ١) **المزوّدون**: تفعيل/تعطيل وترتيب واسم ظاهر ووضع اختبار. المعطَّل يختفي من
 *    صفحة الدفع أمام العميل فوراً، والمفعَّل يظهر بترتيبه. القائمة نفسها مغلقة:
 *    سبعة صفوف تبذرها الهجرة ولا تُضاف ولا تُحذف من هنا، فلا يظهر للعميل مزوّد
 *    بلا محوّل في `lib/payments/registry.ts`.
 *
 * ٢) **قائمة تحقق الاعتمادات**: مولَّدة من مواصفة السجل لا من قائمة مكتوبة هنا.
 *    المفاتيح السرّية تعيش في **متغيرات بيئة الخادم** لا في قاعدة البيانات
 *    (قرار العقد)، فالشاشة تعرض *اسم* المتغير وحالته: أخضر إن كان مضبوطاً،
 *    وكهرماني باسمه الحرفي إن كان ناقصاً. **لا قيمة سرّ تُطبع ولا تصل إلى
 *    المتصفح إطلاقاً** — ولا حتى مقنّعة، فالقناع نفسه يسرّب الطول.
 *
 * ٣) **المطابقة**: أحدث جلسات الدفع بحالاتها وأعدادها. هذا الجدول هو ما يُقرأ
 *    عند اختلاف كشف البوابة عن دفترنا: كل صف يربط الحجز بالمزوّد وبمعرّف
 *    العملية لديه.
 *
 * لا حساب مالي في هذا الملف (قرار معماري ٤): المبالغ تُطبع كما تصل من القاعدة،
 * والقيد في الدفتر يقع في مشغّل المرحلة ٧ عبر صف `payments` المعتمد لا هنا.
 */

export const metadata = { title: "بوابات الدفع" };

const hasSupabaseEnv = () =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const MAX_INTENT_ROWS = 100;

/* ------------------------------------------------------------------ */
/* القراءة                                                              */
/* ------------------------------------------------------------------ */

/**
 * المزوّدون — عبر القارئ المشترك `readProviderSettings` لا باستعلام محلي، فما
 * تعرضه اللوحة هو نفسه ما يقرؤه مسار `/api/payments/start` حرفاً بحرف.
 * `loaded=false` يعني أن الصفوف المعروضة افتراضيات العقد لا حقيقة القاعدة —
 * فالشاشة تصير للقراءة فقط بدل أن تكتب فوق جدول لا تقرؤه.
 */
async function loadProviders(): Promise<{
  providers: ProviderSettings[];
  loaded: boolean;
  reason?: string;
}> {
  const supabase = await createServerSupabase();
  if (!supabase) return { providers: [], loaded: false, reason: "env" };

  const { rows, loaded, reason } = await readProviderSettings(supabase);
  return { providers: rows, loaded, reason };
}

type IntentRow = {
  id: string;
  bookingId: string | null;
  reference: string | null;
  provider: string | null;
  providerRef: string | null;
  amount: number | null;
  currency: string;
  status: string | null;
  createdAt: string | null;
  completedAt: string | null;
  failureReason: string | null;
};

async function loadIntents(status: PaymentIntentStatus | null): Promise<{
  intents: IntentRow[];
  counts: Record<string, number | null>;
  ready: boolean;
}> {
  const empty = { intents: [] as IntentRow[], counts: {}, ready: false };

  const supabase = await createServerSupabase();
  if (!supabase) return empty;

  // العدّ في Postgres (COUNT) لا بعدّ مصفوفة في الواجهة
  const countOf = async (tabStatus: PaymentIntentStatus | null) => {
    let query = supabase.from("payment_intents").select("id", { count: "exact", head: true });
    if (tabStatus) query = query.eq("status", tabStatus);
    const { count, error } = await query;
    return error ? null : (count ?? 0);
  };

  let listQuery = supabase
    .from("payment_intents")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(MAX_INTENT_ROWS);
  if (status) listQuery = listQuery.eq("status", status);

  const [listRes, countsRes] = await Promise.all([
    listQuery,
    Promise.all(
      [null, ...INTENT_STATUSES].map((value) => countOf(value as PaymentIntentStatus | null))
    ),
  ]);

  // خطأ الاستعلام الرئيسي = الجدول غير موجود (هجرة ٠٠٢٠ لم تُنفَّذ) أو القراءة
  // مرفوضة (الحساب ليس admin) — والحالتان تعنيان «لا تعرض جدولاً كاذباً»
  if (listRes.error) return empty;

  const counts: Record<string, number | null> = {};
  ["all", ...INTENT_STATUSES].forEach((key, index) => {
    counts[key] = countsRes[index] ?? null;
  });

  const rows = (listRes.data ?? []) as Record<string, unknown>[];

  /**
   * الرقم المرجعي للحجز باستعلام ثانٍ لا بتضمين PostgREST: التضمين يعتمد على
   * كشف المفتاح الأجنبي في ذاكرة المخطط، وفشله كان يُسقط الجدول كله بدل أن
   * يُسقط عموداً واحداً. استعلام واحد بـ `in(...)` أمتن وأرخص من الفشل.
   */
  const bookingIds = Array.from(
    new Set(
      rows
        .map((row) => asText(pick(row, ["booking_id", "bookingId"])))
        .filter((id): id is string => id !== null)
    )
  );

  const references = new Map<string, string>();
  if (bookingIds.length > 0) {
    const refRes = await supabase.from("bookings").select("id, reference").in("id", bookingIds);
    if (!refRes.error) {
      for (const row of (refRes.data ?? []) as Record<string, unknown>[]) {
        const id = asText(row.id);
        const reference = asText(row.reference);
        if (id && reference) references.set(id, reference);
      }
    }
  }

  const intents = rows.map((row) => {
    const bookingId = asText(pick(row, ["booking_id", "bookingId"]));
    return {
      id: String(row.id ?? ""),
      bookingId,
      reference: bookingId ? (references.get(bookingId) ?? null) : null,
      provider: asText(row.provider),
      providerRef: asText(pick(row, ["provider_ref", "providerRef"])),
      amount: intentAmountMajor(row),
      currency: asText(row.currency) ?? "EGP",
      status: asText(row.status),
      createdAt: asText(pick(row, ["created_at", "createdAt"])),
      completedAt: asText(pick(row, ["completed_at", "completedAt"])),
      failureReason: asText(pick(row, ["failure_reason", "failureReason"])),
    };
  });

  return { intents, counts, ready: true };
}

/* ------------------------------------------------------------------ */
/* الرسائل                                                              */
/* ------------------------------------------------------------------ */

const ERROR_MESSAGES: Record<string, string> = {
  ...COMMON_BOOKING_ERRORS,
  provider: "مزوّد غير معروف — أعد تحميل الصفحة وأعد المحاولة.",
  label: "الاسم الظاهر حقل إلزامي ولا يتجاوز ٦٠ حرفاً — هذا ما يقرأه العميل في صفحة الدفع.",
  sort: "ترتيب العرض يجب أن يكون عدداً صحيحاً بين صفر و٩٩.",
  notready:
    "جدول بوابات الدفع غير موجود في قاعدة البيانات — نفِّذ هجرة المرحلة ٩ (0020) من supabase/migrations ثم أعد المحاولة. لم يتغيّر شيء.",
};

const SAVED_MESSAGES: Record<string, string> = {
  "1": "حُفظت إعدادات المزوّد وانعكست على خيارات الدفع أمام العملاء فوراً.",
  enabled: "بُدِّل تفعيل المزوّد — خيارات الدفع أمام العميل تعكس ذلك الآن.",
  sandbox:
    "بُدِّل وضع الاختبار لهذا المزوّد — تأكد أن المفاتيح في متغيرات البيئة تناسب الوضع الجديد.",
};

/* ------------------------------------------------------------------ */
/* قائمة تحقق الاعتمادات                                                */
/* ------------------------------------------------------------------ */

function CredentialChecklist({ row }: { row: ProviderSettings }) {
  const spec = credentialSpec(row.provider);
  const readiness = providerReadiness(row.provider, row.publicConfig);

  if (spec.envKeys.length === 0) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm leading-relaxed text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-100">
        <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
        <p>لا مفاتيح سرّية لهذا المزوّد — يعمل بلا أي متغير بيئة.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <KeyRound className="size-3.5 shrink-0" />
        المفاتيح السرّية (متغيرات بيئة الخادم)
        <HelpTip>
          المفاتيح{" "}
          <span className="font-semibold">
            لا تُخزَّن في قاعدة البيانات ولا تُدخل من هذه الشاشة
          </span>{" "}
          — تُضاف إلى متغيرات بيئة الخادم (على Vercel: Settings ← Environment Variables، أو ملف{" "}
          <code dir="ltr">.env.local</code> محلياً) ثم يُعاد تشغيل الخادم. هذه القائمة تخبرك
          بوجود المتغير من عدمه فقط، ولا تعرض قيمته ولا طولها ولا جزءاً منها.
        </HelpTip>
      </p>

      <ul className="space-y-1.5">
        {spec.envKeys.map((key) => {
          const present = !readiness.missingEnv.includes(key);
          return (
            <li
              key={key}
              className={cn(
                "flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm",
                present
                  ? "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-100"
                  : "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"
              )}
            >
              {present ? (
                <CheckCircle2 className="size-4 shrink-0" />
              ) : (
                <ShieldAlert className="size-4 shrink-0" />
              )}
              <code dir="ltr" className="font-mono text-xs">
                {key}
              </code>
              <span className="ms-auto text-xs font-medium">
                {present ? "مضبوط" : "ناقص — أضف متغيراً بهذا الاسم حرفياً"}
              </span>
            </li>
          );
        })}
      </ul>

      {readiness.missingEnv.length > 0 && (
        <p className="text-xs leading-relaxed text-amber-700 dark:text-amber-300">
          ينقص {toArabicDigits(readiness.missingEnv.length)} من{" "}
          {toArabicDigits(spec.envKeys.length)} — المحوّل يرفض العمل بمفتاح ناقص (ولا يوقّع بسرّ
          فارغ)، فتفعيل المزوّد قبل اكتمالها يعني عميلاً يضغط «ادفع» فيصطدم بخطأ.
        </p>
      )}

      {readiness.missingPublic.length > 0 && (
        <p className="text-xs leading-relaxed text-amber-700 dark:text-amber-300">
          وينقص من المعرّفات العامة:{" "}
          <span dir="ltr">
            {readiness.missingPublic.map((key) => publicKeyLabel(key)).join("، ")}
          </span>{" "}
          — تُدخل من الحقول أدناه.
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* بطاقة مزوّد                                                          */
/* ------------------------------------------------------------------ */

function ProviderCard({ row, readOnly }: { row: ProviderSettings; readOnly: boolean }) {
  const spec = credentialSpec(row.provider);
  const readiness = providerReadiness(row.provider, row.publicConfig);
  const field = (name: string) => `provider-${row.provider}-${name}`;

  return (
    <Card className="space-y-4 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <CreditCard className="size-4 shrink-0 text-primary" />
        <h3 className="font-heading text-base font-bold">{row.label}</h3>
        <code dir="ltr" className="text-xs text-muted-foreground">
          {row.provider}
        </code>
        {PROVIDER_KIND[row.provider] && (
          <Badge variant="secondary">{PROVIDER_KIND[row.provider]}</Badge>
        )}
        <Badge variant={row.enabled ? "default" : "secondary"}>
          {row.enabled ? "مفعَّل" : "معطَّل"}
        </Badge>
        {row.sandbox && (
          <Badge
            variant="outline"
            className="gap-1 border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"
          >
            <FlaskConical className="size-3" />
            وضع اختبار
          </Badge>
        )}

        {/* المفتاحان السريعان خارج نموذج الحفظ عمداً: نموذج داخل نموذج غير صالح
            في HTML، والمتصفح يُسقط الداخلي فيصير الزر بلا فعل */}
        <div className="ms-auto flex shrink-0 items-center gap-1">
          <form action={readOnly ? undefined : toggleSandbox.bind(null, row.provider)}>
            <Button
              type="submit"
              variant="ghost"
              size="sm"
              disabled={readOnly}
              title={
                row.sandbox
                  ? "التحويل إلى الإنتاج: مال حقيقي يتحرك — تأكد أولاً أن مفاتيح الإنتاج مضبوطة في متغيرات البيئة"
                  : "التحويل إلى الاختبار: بطاقات وهمية ولا مال حقيقي"
              }
            >
              <FlaskConical />
              <span className="hidden sm:inline">{row.sandbox ? "إنتاج" : "اختبار"}</span>
            </Button>
          </form>

          <form action={readOnly ? undefined : toggleProvider.bind(null, row.provider)}>
            <Button
              type="submit"
              variant="ghost"
              size="sm"
              disabled={readOnly}
              title={
                row.enabled
                  ? "تعطيل المزوّد: يختفي من خيارات الدفع أمام العملاء فوراً — والجلسات القائمة تُسوّى كالمعتاد"
                  : "تفعيل المزوّد: يظهر للعملاء بترتيبه أدناه"
              }
            >
              {row.enabled ? <PowerOff /> : <Power />}
              {row.enabled ? "تعطيل" : "تفعيل"}
            </Button>
          </form>
        </div>
      </div>

      {spec.note && (
        <p className="rounded-lg border border-border bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
          {spec.note}
        </p>
      )}

      {row.enabled && !readiness.ready && (
        <p className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 p-3 text-sm leading-relaxed text-red-900 dark:border-red-700 dark:bg-red-950 dark:text-red-100">
          <ShieldAlert className="mt-0.5 size-4 shrink-0" />
          <span>
            هذا المزوّد <span className="font-semibold">مفعَّل وإعداده ناقص</span> — يظهر للعميل
            الآن وستفشل محاولته. عطّله حتى يكتمل ما أدناه.
          </span>
        </p>
      )}

      <CredentialChecklist row={row} />

      <Separator />

      <form
        action={readOnly ? undefined : saveProvider.bind(null, row.provider)}
        className="space-y-4"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={field("label")} className="flex items-center gap-1.5">
              الاسم الظاهر للعميل
              <HelpTip>
                ما يقرأه العميل في صفحة الدفع بجوار زر الاختيار — اكتبه بلغة العميل لا بلغة
                التقنية: «بطاقة بنكية» أوضح من اسم البوابة. وترجمته إلى بقية اللغات تجري في
                مساحة <code dir="ltr">payment</code> من شاشة اللغات بمفتاح{" "}
                <code dir="ltr">provider.{row.provider}</code>.
              </HelpTip>
            </Label>
            <Input
              id={field("label")}
              name="label"
              defaultValue={row.label}
              disabled={readOnly}
              required
              maxLength={60}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={field("sort")} className="flex items-center gap-1.5">
              ترتيب العرض
              <HelpTip>
                ترتيب ظهور المزوّد بين خيارات الدفع — الأصغر أولاً. ضع أقلّها كلفة عليك في
                الأعلى: الخيار الأول هو ما يختاره أغلب العملاء.
              </HelpTip>
            </Label>
            <Input
              id={field("sort")}
              name="sort"
              type="number"
              inputMode="numeric"
              dir="ltr"
              min={0}
              max={99}
              step="1"
              defaultValue={row.sort}
              disabled={readOnly}
            />
          </div>
        </div>

        {spec.publicKeys.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2">
            {spec.publicKeys.map((key) => (
              <div key={key} className="space-y-1.5">
                <Label htmlFor={field(`public-${key}`)} className="flex items-center gap-1.5">
                  {publicKeyLabel(key)}
                  <HelpTip>
                    معرّف <span className="font-semibold">غير سرّي</span> يعطيك إياه المزوّد في
                    لوحته، ويُخزَّن في قاعدة البيانات لا في متغيرات البيئة. اتركه فارغاً لمسحه.
                  </HelpTip>
                </Label>
                <Input
                  id={field(`public-${key}`)}
                  name={`public.${key}`}
                  dir="ltr"
                  defaultValue={row.publicConfig[key] ?? ""}
                  disabled={readOnly}
                  maxLength={200}
                />
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-2">
          <Label className="flex w-fit cursor-pointer items-center gap-2 text-sm font-normal">
            <input
              type="checkbox"
              name="enabled"
              defaultChecked={row.enabled}
              disabled={readOnly}
              className="size-4 accent-primary"
            />
            مفعَّل — يظهر في خيارات الدفع أمام العميل
            <HelpTip>
              التعطيل يخفي المزوّد من صفحة الدفع فوراً ولا يمس جلسة قائمة ولا تحصيلاً سابقاً:
              دفعة انطلقت قبل التعطيل تُسوّى عند وصول تأكيدها، وإلا بقي حجز مدفوع معلّقاً بلا
              سبب يفهمه العميل. والتحويل اليدوي (المحفظة وانستا باي) لا يتأثر إطلاقاً — يبقى
              متاحاً مهما عطّلت من بوابات.
            </HelpTip>
          </Label>

          <Label className="flex w-fit cursor-pointer items-center gap-2 text-sm font-normal">
            <input
              type="checkbox"
              name="sandbox"
              defaultChecked={row.sandbox}
              disabled={readOnly}
              className="size-4 accent-primary"
            />
            وضع الاختبار (sandbox)
            <HelpTip>
              يشغّل حساب الاختبار لدى المزوّد نفسه: بطاقات وهمية ولا مال حقيقي يتحرك. مفاتيح
              الاختبار غير مفاتيح الإنتاج — بدّلها في متغيرات البيئة عند الانتقال ثم أطفئ هذا
              المفتاح.{" "}
              <span className="font-semibold">إطفاؤه بمفاتيح اختبار يعني فشل كل عملية</span>،
              وتشغيله بمفاتيح إنتاج يعني عميلاً يدفع في الفراغ.
            </HelpTip>
          </Label>
        </div>

        <div className="flex justify-end">
          <Button type="submit" disabled={readOnly}>
            حفظ المزوّد
          </Button>
        </div>
      </form>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* جدول المطابقة                                                        */
/* ------------------------------------------------------------------ */

function IntentTableRow({ intent }: { intent: IntentRow }) {
  return (
    <tr className="border-b border-border last:border-0 hover:bg-muted/40">
      <td className="p-2 align-top">
        {intent.bookingId ? (
          <Link
            href={`/admin/orders/${intent.bookingId}`}
            dir="ltr"
            className="font-medium transition-colors hover:text-primary hover:underline"
          >
            {intent.reference ?? "فتح الطلب"}
          </Link>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
        {intent.providerRef && (
          <span dir="ltr" className="mt-0.5 block font-mono text-[11px] text-muted-foreground">
            {intent.providerRef}
          </span>
        )}
      </td>
      <td className="p-2 align-top">{intent.provider ?? "—"}</td>
      <td className="p-2 align-top">
        <IntentMoney value={intent.amount} currency={intent.currency} />
      </td>
      <td className="p-2 align-top">
        <IntentStatusBadge status={intent.status} />
        {intent.failureReason && (
          <span className="mt-0.5 block max-w-[16rem] text-[11px] leading-relaxed text-muted-foreground">
            {intent.failureReason}
          </span>
        )}
      </td>
      <td className="p-2 align-top text-xs whitespace-nowrap">
        <span className="block">{dateTimeLabel(intent.createdAt)}</span>
        <span className="block text-muted-foreground">{relativeTime(intent.createdAt)}</span>
      </td>
      <td className="p-2 align-top text-xs whitespace-nowrap">
        {intent.completedAt ? (
          dateTimeLabel(intent.completedAt)
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className="p-2 align-top">
        {intent.bookingId ? (
          <Link
            href={`/admin/orders/${intent.bookingId}`}
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            الطلب
            <ArrowLeft className="size-3" />
          </Link>
        ) : null}
      </td>
    </tr>
  );
}

function IntentCard({ intent }: { intent: IntentRow }) {
  return (
    <Card className="gap-2 p-4">
      <div className="flex flex-wrap items-center gap-2">
        {intent.bookingId ? (
          <Link
            href={`/admin/orders/${intent.bookingId}`}
            dir="ltr"
            className="font-medium transition-colors hover:text-primary hover:underline"
          >
            {intent.reference ?? "فتح الطلب"}
          </Link>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
        <IntentStatusBadge status={intent.status} />
        <span className="ms-auto text-xs text-muted-foreground">
          {relativeTime(intent.createdAt)}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span>{intent.provider ?? "—"}</span>
        <span className="text-muted-foreground">·</span>
        <IntentMoney value={intent.amount} currency={intent.currency} />
      </div>
      {intent.providerRef && (
        <span dir="ltr" className="block font-mono text-[11px] text-muted-foreground">
          {intent.providerRef}
        </span>
      )}
      <div className="text-xs text-muted-foreground">
        أُنشئت: {dateTimeLabel(intent.createdAt)}
        {intent.completedAt ? ` · اكتملت: ${dateTimeLabel(intent.completedAt)}` : ""}
      </div>
      {intent.failureReason && (
        <p className="text-xs leading-relaxed text-muted-foreground">{intent.failureReason}</p>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* الصفحة                                                               */
/* ------------------------------------------------------------------ */

/** سبب تعذّر القراءة بلغة المالك — كل سبب وخطوته التالية */
function notReadyBody(reason: string | undefined) {
  if (reason === "no-table" || reason === "empty") {
    return (
      <p>
        قاعدة البيانات مربوطة لكن جدول <code dir="ltr">payment_providers</code> غير موجود أو
        فارغ — نفِّذ هجرة المرحلة ٩ (<code dir="ltr">0020_payments.sql</code>) من{" "}
        <code dir="ltr">supabase/migrations</code> ثم أعد تحميل الصفحة. المعروض أدناه
        افتراضيات العقد لا حقيقة قاعدتك، والتحرير معطَّل حتى لا تُكتب فوق ما لا يُقرأ.
      </p>
    );
  }
  return (
    <p>
      تعذّرت قراءة جدول البوابات — القراءة محصورة بحساب دوره <code dir="ltr">admin</code>{" "}
      (سياسة <code dir="ltr">is_admin()</code> في هجرة ٠٠٢٠). سجّل الدخول بحساب مدير ثم أعد
      تحميل الصفحة. المعروض أدناه افتراضيات العقد لا حقيقة قاعدتك.
    </p>
  );
}

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;

  const rawStatus = typeof params.status === "string" ? params.status : "all";
  const activeStatus = (INTENT_STATUSES as string[]).includes(rawStatus)
    ? (rawStatus as PaymentIntentStatus)
    : null;
  const activeKey = activeStatus ?? "all";

  const [{ providers, loaded, reason }, { intents, counts, ready: intentsReady }] =
    await Promise.all([loadProviders(), loadIntents(activeStatus)]);

  const wired = hasSupabaseEnv();
  const readOnly = !loaded;
  const savedKey = typeof params.saved === "string" ? params.saved : null;
  const error = typeof params.error === "string" ? params.error : null;

  // الصفوف تصل مرتّبة من القارئ المشترك؛ والترشيح يستبعد أي رمز لا محوّل له
  const rows = providers.filter((row) => isPaymentProvider(row.provider));
  const enabledCount = rows.filter((row) => row.enabled).length;
  const liveRisk = rows.filter(
    (row) => row.enabled && !providerReadiness(row.provider, row.publicConfig).ready
  );

  const tabHref = (key: string) =>
    key === "all" ? "/admin/payments" : `/admin/payments?status=${key}`;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-heading text-lg font-bold">بوابات الدفع الإلكترونية</h2>
        <HelpTip>
          هذه الشاشة تحكم <span className="font-semibold">الدفع الإلكتروني وحده</span>: أي
          بوابة تظهر للعميل وبأي ترتيب واسم. التحويل اليدوي (المحافظ وانستا باي) لا يمر من هنا
          إطلاقاً — يبقى متاحاً دائماً ويُدار من شاشة «حسابات الدفع». والتأكيد في الحالتين يقع
          في قاعدة البيانات: صفحة العودة في متصفح العميل تعرض الحالة ولا تصنعها.
        </HelpTip>
        <Link
          href="/admin/payment-accounts"
          className="ms-auto text-sm text-primary transition-colors hover:underline"
        >
          حسابات التحويل اليدوي
        </Link>
      </div>

      <Banners
        wired={wired}
        readOnly={readOnly}
        saved={savedKey !== null}
        error={error}
        errorMessages={ERROR_MESSAGES}
        savedMessage={(savedKey && SAVED_MESSAGES[savedKey]) || "نُفذت العملية."}
        readOnlyTitle="بوابات الدفع غير جاهزة بعد"
        readOnlyBody={notReadyBody(reason)}
      />

      {rows.length > 0 && (
        <p className="text-sm leading-relaxed text-muted-foreground">
          المفعَّل الآن {toArabicDigits(enabledCount)} من {toArabicDigits(rows.length)} مزوّداً.
          {enabledCount === 0
            ? " لا بوابة إلكترونية أمام العميل حالياً — يرى التحويل اليدوي وحده، وهو مسار كامل لا ناقص."
            : ""}
        </p>
      )}

      {liveRisk.length > 0 && (
        <Card className="flex flex-row items-start gap-3 border-red-300 bg-red-50 p-4 text-red-900 dark:border-red-700 dark:bg-red-950 dark:text-red-100">
          <ShieldAlert className="mt-0.5 size-5 shrink-0" />
          <div className="text-sm leading-relaxed">
            <p className="font-semibold">
              {toArabicDigits(liveRisk.length)} مزوّداً مفعَّلاً وإعداده ناقص
            </p>
            <p>
              <span dir="ltr">{liveRisk.map((row) => row.provider).join("، ")}</span> — يظهر
              للعميل الآن وتفشل محاولته. عطّله أو استكمل ما ينقصه أدناه.
            </p>
          </div>
        </Card>
      )}

      {rows.map((row) => (
        <ProviderCard key={row.provider} row={row} readOnly={readOnly} />
      ))}

      {/* ------------------------- المطابقة ------------------------- */}
      <div className="flex flex-wrap items-center gap-2 pt-2">
        <h2 className="flex items-center gap-1.5 font-heading text-lg font-bold">
          <ListChecks className="size-4 text-primary" />
          مطابقة جلسات الدفع
        </h2>
        <HelpTip>
          كل محاولة دفع إلكتروني صفٌّ هنا من لحظة إنشائها إلى نتيجتها. اقرأه عند اختلاف كشف
          البوابة عن دفترنا: «ناجحة» تعني أن تأكيداً موقّعاً وصل فقُيِّد المبلغ في الخزينة
          وتأكد الحجز. أما «عند المزوّد» فتعني أن العميل خرج ولم يعد تأكيده — ولا يُقيَّد لها
          قرش واحد.
        </HelpTip>
      </div>

      {!intentsReady ? (
        <Card className="p-4 text-sm leading-relaxed text-muted-foreground">
          جدول <code dir="ltr">payment_intents</code> غير متاح — إما أن هجرة المرحلة ٩ (
          <code dir="ltr">0020</code>) لم تُنفَّذ بعد، وإما أن حسابك ليس دوره{" "}
          <code dir="ltr">admin</code> (قراءة الجلسات محصورة به). بقية الشاشة تعمل طبيعياً.
        </Card>
      ) : (
        <>
          <nav
            aria-label="ترشيح جلسات الدفع بالحالة"
            className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7"
          >
            {(["all", ...INTENT_STATUSES] as const).map((key) => {
              const active = key === activeKey;
              const count = counts[key];
              return (
                <Link
                  key={key}
                  href={tabHref(key)}
                  aria-current={active ? "page" : undefined}
                  title={
                    key === "all"
                      ? "كل الجلسات بلا ترشيح"
                      : INTENT_STATUS_HINTS[key as PaymentIntentStatus]
                  }
                  className={cn(
                    "rounded-xl bg-card p-3 text-center ring-1 transition-colors",
                    active
                      ? "bg-primary/10 ring-2 ring-primary"
                      : "ring-foreground/10 hover:bg-muted"
                  )}
                >
                  <span className="block text-xl font-bold" dir="ltr">
                    {count === null || count === undefined ? "—" : toArabicDigits(count)}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {key === "all" ? "الكل" : INTENT_STATUS_LABELS[key as PaymentIntentStatus]}
                  </span>
                </Link>
              );
            })}
          </nav>

          {intents.length === 0 ? (
            <Card className="p-5 text-sm text-muted-foreground">
              {activeStatus
                ? `لا جلسات في حالة «${INTENT_STATUS_LABELS[activeStatus]}».`
                : "لا جلسات دفع إلكتروني بعد — أول محاولة من صفحة متابعة الحجز ستظهر هنا فوراً."}
            </Card>
          ) : (
            <>
              {/* شاشات كبيرة: جدول كامل */}
              <Card className="hidden p-0 md:block">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[52rem] text-sm">
                    <thead>
                      <tr className="border-b border-border text-xs text-muted-foreground">
                        <th className="p-2 text-start font-medium">الحجز / معرّف العملية</th>
                        <th className="p-2 text-start font-medium">المزوّد</th>
                        <th className="p-2 text-start font-medium">المبلغ</th>
                        <th className="p-2 text-start font-medium">الحالة</th>
                        <th className="p-2 text-start font-medium">أُنشئت</th>
                        <th className="p-2 text-start font-medium">اكتملت</th>
                        <th className="p-2 text-start font-medium" />
                      </tr>
                    </thead>
                    <tbody>
                      {intents.map((intent) => (
                        <IntentTableRow key={intent.id} intent={intent} />
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>

              {/* الموبايل: بطاقات */}
              <div className="space-y-3 md:hidden">
                {intents.map((intent) => (
                  <IntentCard key={intent.id} intent={intent} />
                ))}
              </div>

              <p className="text-xs leading-relaxed text-muted-foreground">
                المعروض {toArabicDigits(intents.length)} من الجلسات
                {intents.length === MAX_INTENT_ROWS
                  ? ` (أحدث ${toArabicDigits(MAX_INTENT_ROWS)} — رشِّح بالحالة للوصول للأقدم)`
                  : ""}
                . «معرّف العملية» هو رقمها لدى المزوّد — انسخه عند مراسلة دعمهم.
              </p>
            </>
          )}
        </>
      )}
    </div>
  );
}
