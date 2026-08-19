import {
  CalendarClock,
  CheckCircle2,
  Download,
  FileText,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";

import { controlClass, dateLabel, Notice } from "@/components/portal/portal-ui";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { getSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";
import { loadPortalAgreement } from "../_lib/agreement";
import { acceptAgreement } from "./actions";
import { loadSignedAgreements, type SignedAgreement } from "./data";

/**
 * قسمُ الاتفاقية داخل **ملف المستخدم** — الشاشةُ التي تُحوّل «الاتفاق يقول» إلى
 * صفٍّ في سجلّ، بعد أن انتقلت من صفحةٍ مستقلة في التنقل إلى قسمٍ في «حسابي».
 *
 * ── لماذا انتقلت أصلاً (ملاحظة المالك 2026-08-19) ──────────────────────────
 *
 * «الاتفاقية تكون في ملف المستخدم بحيث إنه لا يقرأها إلا مرة واحدة في الغالب
 *  وقت التوقيع، وبدلاً من أن تكون في الواجهة لننقلها إلى المكان المناسب».
 *
 * وهو تشخيصٌ صحيح: بندٌ دائم في شريط التنقل لوثيقةٍ تُقرأ مرةً واحدة يزاحم
 * الأسطولَ والأسعارَ وهي عملُ الشريك اليومي. ولذلك:
 *   • **النصُّ مطويٌّ بعد القبول ومفتوحٌ قبله** (‏`<details open={!accepted}>`)،
 *     فمن عليه أن يقرأ يقرأ، ومن قرأ لا يُعاد إليه النصُّ في كل زيارة.
 *   • **ولا يختفي**: القسمُ باقٍ بحالته وتاريخه، ومعه نُسخُه الموقَّعة للتنزيل.
 *
 * ── القرارات الثلاثة الأصلية باقيةٌ بحرفها ─────────────────────────────────
 *
 * (١) **النصُّ كاملاً قبل الزر، لا ملخّصٌ ولا رابطُ تنزيل.** الاحتجاجُ بقبولٍ
 *     إلكتروني يضعف كلما بعُد النصُّ عن لحظة الضغط. والطيُّ **لا يقع قبل
 *     القبول** بحال — انظر `open` أدناه.
 * (٢) **الشريط يقول ما يقع ومتى، بتاريخه.** والتاريخُ يصل محسوباً من القاعدة
 *     (`partner_agreement_status`) ولا يُشتقّ هنا بجمع أيامٍ على تاريخ.
 * (٣) **التوقيع اسمٌ يُكتب لا خانةٌ تُعلَّم وحدها.**
 *
 * 🔴 **ولا شيء في هذا الملف حاجزٌ ولا يقترب من الحاجز.** أهليةُ العمل تُقاس في
 * `partner_agreement_ok()` وتُقرأ في `dispatch_pool` و`portal_offers` و
 * `accept_offer` (هجرة 0113) — ونقلُ العرض من صفحةٍ إلى قسم لا يمرّ من هناك
 * بحرف. والذي يجعل ذلك **مقيساً لا مظنوناً**: `supabase/tests/partner_profile_tests.sql`
 * القسم (ج) يثبت بهوية متعهدٍ لم يوقّع أنه يسقط من الحوض ويُرفض في القبول.
 *
 * ولا حساب هنا ولا قرار أهلية: كل ما يُعرض يصل من `_lib/agreement.ts` و
 * `./data.ts` كما قاسته القاعدة (D-05).
 */

/**
 * رموزُ خطأ القبول مترجَمةً — تعيش هنا لا في الصفحة، لأن الصفحة التي تعرضها
 * صارت `/portal/profile` وهي تجمع رموزَ ثلاثةِ أقسام. وكلا الملفين **خادميّ**
 * بلا `"use client"`، فالقيمة تعبر بينهما كائناً لا مرجعَ عميل (القسم ٥ في
 * `LESSONS.md`).
 */
export const AGREEMENT_ERROR_MESSAGES: Record<string, string> = {
  stale: "نُشرت نسخة أحدث من الاتفاقية بينما كانت الصفحة مفتوحة — حدّث الصفحة واقرأ النسخة السارية ثم اقبلها.",
  name: "اكتب اسمك الكامل بصفتك الموقّع عن الشركة.",
  confirm: "علّم على إقرار القراءة والموافقة قبل الإرسال.",
  missing: "لا توجد اتفاقية سارية الآن — راسل الإدارة.",
};

/** فقرات البند — النصّ يُكتب من اللوحة بأسطر فارغة، فتُصيَّر فقراتٍ لا كتلةً واحدة */
function ClauseBody({ body }: { body: string }) {
  const paragraphs = body
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);

  return (
    <div className="space-y-2.5 text-sm leading-loose text-muted-foreground">
      {paragraphs.map((paragraph, index) => (
        <p key={index} className="whitespace-pre-line">
          {paragraph}
        </p>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* النُّسَخ الموقَّعة — «تعود إليها في أي وقت» صارت قابلةً للتنفيذ         */
/* ------------------------------------------------------------------ */

/**
 * ⚠ لا يُعرض هذا الجدول إلا حين توجد نسخةٌ موقَّعة فعلاً: عنوانٌ فوق فراغٍ يقول
 * للشريك إن عنده شيئاً ليس عنده. والصفُّ الوحيد يبقى صفاً — الجدول هنا **يُقارَن
 * فيه**: إصدارٌ باسمٍ وتاريخٍ وحالة، وهي أربعة أعمدةٍ لا تُقرأ نثراً.
 */
function SignedCopies({ signed }: { signed: SignedAgreement[] }) {
  if (signed.length === 0) return null;

  return (
    <Card className="gap-3 p-5">
      <h3 className="font-heading text-base font-bold">نُسَخُك الموقَّعة</h3>
      <p className="text-sm leading-relaxed text-muted-foreground">
        كل نسخة وقّعتها محفوظةٌ بنصّها كما كان لحظة توقيعك، ولا تتغيّر بعدها. نزّلها
        واحتفظ بها — وهي ما يُرجَع إليه عند أي خلاف.
      </p>

      <div className="overflow-x-auto">
        <table className="w-full min-w-md border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-start text-xs text-muted-foreground">
              <th className="py-2 text-start font-medium">الإصدار</th>
              <th className="py-2 text-start font-medium">تاريخ التوقيع</th>
              <th className="py-2 text-start font-medium">الموقّع</th>
              <th className="py-2 text-start font-medium">الحالة</th>
              <th className="py-2 text-start font-medium">النسخة</th>
            </tr>
          </thead>
          <tbody>
            {signed.map((row) => (
              <tr key={row.acceptanceId} className="border-b border-border last:border-b-0">
                <td className="py-2.5 font-medium">{row.version}</td>
                <td className="py-2.5 text-muted-foreground">{dateLabel(row.acceptedAt)}</td>
                <td className="py-2.5 text-muted-foreground">
                  {row.signedName}
                  {row.actorKind === "admin" ? (
                    <span className="block text-xs">سُجّلت من الإدارة نيابةً عنك</span>
                  ) : null}
                </td>
                <td className="py-2.5">
                  <span
                    className={cn(
                      "inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium",
                      row.isCurrent
                        ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100"
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    {row.isCurrent ? "سارية" : "مؤرشفة"}
                  </span>
                </td>
                <td className="py-2.5">
                  <a
                    href={`/portal/agreement/copy?a=${encodeURIComponent(row.acceptanceId)}`}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-primary underline underline-offset-4"
                  >
                    <Download className="size-3.5" aria-hidden="true" />
                    تنزيل
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/*
        🔴 اختلافُ البصمة لا يُبتلع. لا يقع إلا بتعطيل مُشغّل التجميد بملكية
        الجدول (0113 §٤)، ومعناه أن نصّاً وقّعه الشريك تغيّر بعد توقيعه —
        وهو أولى الناس بأن يعرف، لا آخرهم.
      */}
      {signed.some((row) => !row.hashMatches) ? (
        <Notice tone="danger" icon={<ShieldAlert className="size-5 shrink-0" />}>
          <p className="font-semibold">نصُّ إصدارٍ وقّعتَه لا يطابق بصمته المسجَّلة</p>
          <p>
            بصمة النصّ المحفوظة لحظة توقيعك تختلف عن بصمة الإصدار الآن. نزّل نسختك
            واحتفظ بها، وراسل الإدارة بهذه الرسالة كما تظهر لك.
          </p>
        </Notice>
      ) : null}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* القسم                                                              */
/* ------------------------------------------------------------------ */

export async function AgreementSection() {
  const [result, history, settings] = await Promise.all([
    loadPortalAgreement(),
    loadSignedAgreements(),
    getSettings(),
  ]);

  if (result.state === "failed") {
    return (
      <Notice tone="warning">
        <p className="font-semibold">تعذّرت قراءة الاتفاقية الآن</p>
        <p>حدّث الصفحة، وإن تكرر الأمر راسل الإدارة. ولا شيء تغيّر في حسابك بسبب ذلك.</p>
      </Notice>
    );
  }

  // لا إصدارَ منشور (أو قاعدةٌ قبل 0113): لا شيء يُقبل ولا شيء يُمنع — والصمتُ
  // هنا صحيح، فبطاقةُ «غير جاهز» كانت ستُقلق بلا سبب.
  if (result.state === "hidden") {
    return (
      <Notice tone="info">
        <p className="font-semibold">لا اتفاقية سارية الآن</p>
        <p>لا شيء مطلوب منك. وحين تُنشر اتفاقية ستجدها هنا بنصّها ومهلتها.</p>
      </Notice>
    );
  }

  const doc = result.agreement;
  // نسخةٌ جديدة على شريكٍ سبق أن قَبِل ما قبلها — صياغةٌ مختلفة عن القبول الأول
  const isUpdate = !doc.accepted && (doc.acceptedVersion ?? 0) > 0;
  const signed = history.state === "ready" ? history.signed : [];

  return (
    <div className="space-y-4">
      {/* ── شريط الحالة: ما يقع، ومتى، بتاريخه ─────────────────────────── */}
      {doc.accepted ? (
        <Notice tone="success" icon={<CheckCircle2 className="size-5 shrink-0" />}>
          <p className="font-semibold">
            قَبِلت الإصدار {doc.acceptedVersion ?? doc.version} في {dateLabel(doc.acceptedAt)}
          </p>
          <p>
            لا شيء مطلوب منك الآن. وإن نُشرت نسخة جديدة أُبلغت هنا وأُعطيت مهلة لقراءتها
            وقبولها قبل أن تتوقف العروض.
          </p>
        </Notice>
      ) : !doc.required ? (
        <Notice tone="info">
          <p className="font-semibold">الاتفاقية منشورة ولم يُفعَّل اشتراطها بعد</p>
          <p>اقرأها الآن واقبلها — قبولها سيصير شرطاً لوصول عروض الرحلات إليك.</p>
        </Notice>
      ) : doc.inGrace ? (
        <Notice tone="warning" icon={<CalendarClock className="size-5 shrink-0" />}>
          <p className="font-semibold">
            {isUpdate
              ? "نُشرت نسخة جديدة من الاتفاقية — قبولك السابق لا يسري عليها"
              : "لم تقبل الاتفاقية بعد"}
          </p>
          <p>
            عروض الرحلات تصلك كالمعتاد حتى{" "}
            <span className="font-semibold">{dateLabel(doc.deadline)}</span>، وبعد هذا التاريخ
            تتوقف حتى تقبل. ورحلاتك المقبولة سابقاً ومستحقاتك عنها لا يمسّها هذا إطلاقاً.
          </p>
        </Notice>
      ) : (
        <Notice tone="danger">
          <p className="font-semibold">انقضت مهلة القبول — عروض الرحلات متوقفة عنك الآن</p>
          <p>
            لا شيء آخر يمنعك، وتعود العروض فور قبولك من هنا. ورحلاتك المقبولة سابقاً
            ومستحقاتك عنها لا يمسّها هذا.
          </p>
        </Notice>
      )}

      {doc.changeNote && !doc.accepted && (doc.acceptedVersion ?? 0) > 0 ? (
        <Notice tone="info">
          <p className="font-semibold">ما تغيّر في هذا الإصدار</p>
          <p className="whitespace-pre-line">{doc.changeNote}</p>
        </Notice>
      ) : null}

      {/* ── الوثيقة ────────────────────────────────────────────────────── */}
      <Card className="gap-0 p-5">
        {/*
          🔒 `open` مشدودٌ إلى القبول لا إلى ذوقٍ في العرض: **من لم يقبل يرى النصّ
          مفتوحاً بلا نقرة**، فلا يقع توقيعٌ على وثيقةٍ مطوية. ومن قَبِل يراها
          مطويةً — وهو بالضبط ما طلبه المالك: «لا يقرأها إلا مرة واحدة في الغالب».
        */}
        <details open={!doc.accepted} className="group">
          <summary className="flex cursor-pointer flex-wrap items-center gap-2 pb-1 marker:content-none [&::-webkit-details-marker]:hidden">
            <FileText className="size-5 shrink-0 text-primary" aria-hidden="true" />
            <h3 className="font-heading text-base font-bold">{doc.title}</h3>
            <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              الإصدار {doc.version}
            </span>
            {doc.publishedAt ? (
              <span className="text-xs text-muted-foreground">
                منشور منذ {dateLabel(doc.publishedAt)}
              </span>
            ) : null}
            <span className="ms-auto text-xs font-medium text-primary underline underline-offset-4">
              <span className="group-open:hidden">اقرأ النصّ كاملاً</span>
              <span className="hidden group-open:inline">أخفِ النصّ</span>
            </span>
          </summary>

          {doc.preamble ? (
            <div className="border-b border-border pb-4 pt-2">
              <ClauseBody body={doc.preamble} />
            </div>
          ) : null}

          <ol className="divide-y divide-border">
            {doc.clauses.map((clause) => (
              <li key={clause.key} className="space-y-2 py-4">
                <h4 className="font-heading text-sm font-bold">{clause.title}</h4>
                <ClauseBody body={clause.body} />
              </li>
            ))}
          </ol>

          {doc.clauses.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">
              لا بنود في هذه النسخة — راسل الإدارة قبل قبولها.
            </p>
          ) : null}
        </details>

        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
          {/*
            🔒 `<a>` لا `<Link>` بقصد: الوجهة **مسارُ تنزيل** (‏`route.ts` يعيد
            `content-disposition: attachment`) لا صفحةً تُصيَّر. و`Link` يبدأ ملاحةً
            على العميل فيسبقها جلبٌ مسبق لملفٍّ لن يُعرض — ويصل المتصفح إلى استجابة
            لا يعرف كيف يركّبها في شجرة الملاحة. والمرساةُ العادية تُسلّم الطلبَ
            للمتصفح فينزّل الملف ويبقى الشريك في مكانه.
          */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            href="/portal/agreement/copy"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            <Download aria-hidden="true" />
            نزّل نسخة من هذه الاتفاقية
          </a>
          <span className="text-xs leading-5 text-muted-foreground">
            ملفُّ نصٍّ يفتح على أي جهاز، وفيه الوثيقة كاملة وسجلُّ توقيعك عليها إن وُجد.
          </span>
        </div>
      </Card>

      {/* ── الإقرار والتوقيع ──────────────────────────────────────────── */}
      {doc.accepted ? null : (
        <Card className="gap-4 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <ShieldCheck className="size-5 shrink-0 text-primary" aria-hidden="true" />
            <h3 className="font-heading text-base font-bold">الإقرار والقبول</h3>
          </div>

          <form action={acceptAgreement} className="space-y-4">
            <input type="hidden" name="version_id" value={doc.versionId} />

            <label className="flex items-start gap-3 text-sm leading-relaxed">
              <input
                type="checkbox"
                name="confirm"
                value="1"
                required
                className="mt-1 size-4 shrink-0 rounded border-input accent-primary"
              />
              <span>
                أقرّ بأني قرأت هذه الاتفاقية كاملة وفهمت بنودها، وأني مخوَّل بالتوقيع عنها
                نيابةً عن{" "}
                <span className="font-semibold text-foreground">
                  {doc.companyName || "شركتي"}
                </span>
                ، وأقبلها بصفتي متعاقداً مستقلاً لا موظفاً لدى {settings.brand.name}.
              </span>
            </label>

            <div className="space-y-1.5">
              <Label htmlFor="signed_name">اسمك الكامل بصفتك الموقّع</Label>
              <input
                id="signed_name"
                name="signed_name"
                type="text"
                required
                minLength={2}
                maxLength={160}
                autoComplete="name"
                className={controlClass}
                placeholder="الاسم كما في بطاقة الهوية"
              />
              <p className="text-xs leading-5 text-muted-foreground">
                يُسجَّل هذا الاسم مع رقم الإصدار ولحظة القبول وحساب الدخول الذي قبلت منه، ولا
                يُعدَّل بعدها. وهو ما يُرجَع إليه عند أي خلاف.
              </p>
            </div>

            <Button type="submit">
              {isUpdate ? "أقبل النسخة الجديدة" : "أقبل الاتفاقية"}
            </Button>
          </form>
        </Card>
      )}

      {/* ── نُسَخُه الموقَّعة ─────────────────────────────────────────────── */}
      {history.state === "failed" ? (
        <Notice tone="warning">
          <p>
            تعذّرت قراءة نُسخك الموقَّعة الآن — حدّث الصفحة. وهذا لا يمسّ حالتك أعلاه ولا
            توقيعك المسجَّل.
          </p>
        </Notice>
      ) : (
        <SignedCopies signed={signed} />
      )}
    </div>
  );
}
