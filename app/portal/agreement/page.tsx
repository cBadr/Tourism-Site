import { CalendarClock, CheckCircle2, FileText, ShieldCheck } from "lucide-react";

import {
  Banners,
  controlClass,
  dateLabel,
  Notice,
  NotReadyNotice,
  PageHeading,
} from "@/components/portal/portal-ui";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { getSettings } from "@/lib/settings";
import { loadPortalAgreement } from "../_lib/agreement";
import { portalSetupAccess } from "../_lib/session";
import { acceptAgreement } from "./actions";

/**
 * صفحة اتفاقية المتعهد — الشاشة التي تُحوّل «الاتفاق يقول» إلى **صفٍّ في سجلّ**.
 *
 * ── ثلاثة قرارات تحكم شكلها ────────────────────────────────────────────────
 *
 * (١) **النصُّ كاملاً قبل الزر، لا ملخّصٌ ولا رابطُ تنزيل.** الاحتجاجُ بقبولٍ
 *     إلكتروني يضعف كلما بعُد النصُّ عن لحظة الضغط. فالبنود مصيَّرةٌ هنا،
 *     والإقرارُ والتوقيع أسفلها لا فوقها.
 *
 * (٢) **الشريط يقول ما يقع ومتى، بتاريخه.** «لم تقبل بعد» جملةٌ لا تُنتج فعلاً؛
 *     «عروضك تتوقف يوم كذا» تُنتجه. والتاريخُ يصل محسوباً من القاعدة
 *     (`partner_agreement_status`) ولا يُشتقّ هنا بجمع أيامٍ على تاريخ.
 *
 * (٣) **التوقيع اسمٌ يُكتب لا خانةٌ تُعلَّم وحدها.** خانةُ الإقرار وحدها ضغطةٌ
 *     عابرة؛ وكتابةُ الاسم فعلٌ واعٍ يُسجَّل في الصفّ ويُقرأ بعد سنتين. وكلاهما
 *     مطلوبٌ معاً: الخانة إقرارٌ بالقراءة، والاسم صفةُ الموقّع.
 *
 * ولا حساب هنا ولا قرار أهلية: كل ما يُعرض يصل من `_lib/agreement.ts` كما
 * قاسته القاعدة (D-05).
 */

export const metadata = { title: "اتفاقية المتعهد" };

const ERROR_MESSAGES: Record<string, string> = {
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

export default async function PortalAgreementPage({
  searchParams,
}: PageProps<"/portal/agreement">) {
  const [params, access, result, settings] = await Promise.all([
    searchParams,
    portalSetupAccess(),
    loadPortalAgreement(),
    getSettings(),
  ]);
  if (!access.ok) return null;

  const saved = params.saved === "1";
  const error = typeof params.error === "string" ? params.error : null;

  if (result.state === "failed") {
    return (
      <div className="space-y-6">
        <PageHeading title="اتفاقية المتعهد">
          شروط تعاقدك مع {settings.brand.name} على تنفيذ رحلات المنصة.
        </PageHeading>
        <Notice tone="warning">
          <p className="font-semibold">تعذّرت قراءة الاتفاقية الآن</p>
          <p>حدّث الصفحة، وإن تكرر الأمر راسل الإدارة. ولا شيء تغيّر في حسابك بسبب ذلك.</p>
        </Notice>
      </div>
    );
  }

  if (result.state === "hidden") {
    return (
      <div className="space-y-6">
        <PageHeading title="اتفاقية المتعهد">
          شروط تعاقدك مع {settings.brand.name} على تنفيذ رحلات المنصة.
        </PageHeading>
        <NotReadyNotice what="اتفاقية المتعهد" />
      </div>
    );
  }

  const doc = result.agreement;
  // نسخةٌ جديدة على شريكٍ سبق أن قَبِل ما قبلها — صياغةٌ مختلفة عن القبول الأول
  const isUpdate = !doc.accepted && (doc.acceptedVersion ?? 0) > 0;

  return (
    <div className="space-y-6">
      <PageHeading
        title="اتفاقية المتعهد"
        help="هذه هي النسخة السارية. وكل نسخة قَبِلتها تبقى محفوظة بنصّها، والاحتجاج عليك يكون بالنسخة التي كانت مقبولة منك وقت الواقعة."
      >
        شروط تعاقدك مع {settings.brand.name} على تنفيذ رحلات المنصة — اقرأها كاملة، فقبولها
        يسري على كل رحلة تقبلها بعده.
      </PageHeading>

      <Banners
        saved={saved}
        error={error}
        errorMessages={ERROR_MESSAGES}
        savedMessage="سُجّل قبولك للاتفاقية. النسخة التي قبلتها محفوظة بنصّها ويمكنك العودة إليها في أي وقت."
      />

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
            لا شيء آخر يمنعك، وتعود العروض فور قبولك من هذه الصفحة. ورحلاتك المقبولة سابقاً
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
        <div className="flex flex-wrap items-center gap-2 pb-1">
          <FileText className="size-5 shrink-0 text-primary" aria-hidden="true" />
          <h2 className="font-heading text-base font-bold">{doc.title}</h2>
          <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            الإصدار {doc.version}
          </span>
          {doc.publishedAt ? (
            <span className="text-xs text-muted-foreground">
              منشور منذ {dateLabel(doc.publishedAt)}
            </span>
          ) : null}
        </div>

        {doc.preamble ? (
          <div className="border-b border-border pb-4 pt-2">
            <ClauseBody body={doc.preamble} />
          </div>
        ) : null}

        <ol className="divide-y divide-border">
          {doc.clauses.map((clause) => (
            <li key={clause.key} className="space-y-2 py-4">
              <h3 className="font-heading text-sm font-bold">{clause.title}</h3>
              <ClauseBody body={clause.body} />
            </li>
          ))}
        </ol>

        {doc.clauses.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">
            لا بنود في هذه النسخة — راسل الإدارة قبل قبولها.
          </p>
        ) : null}
      </Card>

      {/* ── الإقرار والتوقيع ──────────────────────────────────────────── */}
      {doc.accepted ? null : (
        <Card className="gap-4 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <ShieldCheck className="size-5 shrink-0 text-primary" aria-hidden="true" />
            <h2 className="font-heading text-base font-bold">الإقرار والقبول</h2>
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
    </div>
  );
}
