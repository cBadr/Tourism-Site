import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  FileText,
  Plus,
  ScrollText,
  Send,
  Trash2,
} from "lucide-react";

import { toArabicDigits } from "@/components/booking/format";
import { HelpTip } from "@/components/shared/HelpTip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createServerSupabase } from "@/lib/supabase/server";
import { Banners, controlClass, pick } from "../orders/_components/booking-ui";
import {
  addClause,
  deleteClause,
  discardDraft,
  moveClause,
  publishDraft,
  saveClause,
  saveDraftHeader,
  saveGateSettings,
  startDraft,
} from "./actions";

/**
 * اتفاقية المتعهد — الوثيقة التي يُدافَع بها عن الخصم (هجرة `0113`).
 *
 * ── ما تجيبه هذه الشاشة، بترتيب ما يحتاجه المالك ───────────────────────────
 *
 * (١) **مَن قَبِل ومَن لم يقبل، ومتى تتوقف عروض من لم يقبل.** هذا أولُ ما يُقرأ
 *     قبل أي خصم: خصمٌ على شريكٍ لم يقبل نسخةً سارية لا يُدافَع عنه.
 * (٢) **النسخة السارية** برقمها وبصمتها وتاريخ نشرها.
 * (٣) **تحرير نسخةٍ جديدة** — والمنشورُ لا يُعدَّل بحال: التحرير مسودةٌ تُنشر،
 *     ونشرُها **يُبطل كل قبولٍ سابق** ويبدأ مهلةً جديدة للجميع.
 * (٤) **مقبضا الحاجز**: تشغيلُه، ومهلةُ القبول بالأيام.
 *
 * ⚠ **والمهلة تُقاس لكل شريك من لحظة بلوغه الالتزام** — أي من نشر الإصدار أو من
 *    إنشاء صفّه، أيُّهما أحدث. فشريكٌ يعمل منذ سنة لا تنقطع عروضه لحظة النشر،
 *    وشريكٌ جديد يأخذ مهلته من يوم إنشاء حسابه. والحسم كلُّه في
 *    `partner_agreement_status()` ولا يُشتقّ في هذه الشاشة بحرف (D-05).
 *
 * 🔴 **وحدٌّ يُقال للمالك في الشاشة نفسها لا في تقرير جلسة**: النصّ المبذور صيغ
 *    من قراءة النظام ولم يصغه محامٍ — ويُراجَع قبل أول استعمالٍ حقيقي.
 */

export const metadata = { title: "اتفاقية المتعهد" };

const hasSupabaseEnv = () =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const ERROR_MESSAGES: Record<string, string> = {
  env: "قاعدة البيانات غير مربوطة — لا يمكن الحفظ الآن.",
  forbidden: "هذا الإجراء متاح لحساب مدير فقط.",
  denied: "رُفض الحفظ — الإصدار المنشور لا يُعدَّل، والتعديل يقع على المسودة وحدها.",
  nodraft: "لا توجد مسودة مفتوحة — أنشئ واحدة أولاً.",
  draftexists: "توجد مسودة مفتوحة سلفاً — أكملها أو احذفها قبل إنشاء غيرها.",
  load: "تعذّرت قراءة المسودة — حدّث الصفحة.",
  title: "عنوان الاتفاقية حقل إلزامي (٢ إلى ٢٠٠ حرف).",
  clausetitle: "عنوان البند حقل إلزامي.",
  clausebody: "نص البند حقل إلزامي.",
  toomany: "بلغت الحد الأقصى لعدد البنود.",
  notfound: "لم نعثر على هذا البند — ربما حُذف من تبويب آخر.",
  grace: "مهلة القبول بالأيام بين ٠ و١٨٠.",
  empty: "لا تُنشر اتفاقية بلا بند واحد مكتمل.",
  save: "تعذر الحفظ — إن تكرر الأمر راجع سجل الأخطاء.",
};

const n = (value: number) => toArabicDigits(Math.max(0, Math.round(value)));

const AR_DATE = (value: string | null): string => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("ar-EG", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
};

type Clause = { k: string; title: string; body: string };
type Version = {
  id: string;
  version: number;
  title: string;
  preamble: string;
  clauses: Clause[];
  status: string;
  changeNote: string | null;
  graceDays: number | null;
  docHash: string | null;
  publishedAt: string | null;
};
type PartnerRow = {
  id: string;
  companyName: string;
  status: string;
  accepted: boolean;
  acceptedVersion: number | null;
  acceptedAt: string | null;
  deadline: string | null;
  inGrace: boolean;
  ok: boolean;
};
type AcceptanceRow = {
  id: string;
  companyName: string;
  version: number;
  signedName: string;
  actorKind: string;
  acceptedAt: string | null;
  hashMatches: boolean;
};

const asText = (value: unknown): string | null =>
  typeof value === "string" && value.trim() !== "" ? value : null;

const asBool = (value: unknown): boolean =>
  value === true || value === "true" || value === "t" || value === 1;

function asInt(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toClauses(value: unknown): Clause[] {
  if (!Array.isArray(value)) return [];
  const out: Clause[] = [];
  value.forEach((raw, index) => {
    if (typeof raw !== "object" || raw === null) return;
    const item = raw as Record<string, unknown>;
    out.push({
      k: asText(item.k) ?? `c${index + 1}`,
      title: asText(item.title) ?? "",
      body: asText(item.body) ?? "",
    });
  });
  return out;
}

function toVersion(row: Record<string, unknown>): Version {
  return {
    id: String(row.id),
    version: asInt(row.version) ?? 0,
    title: asText(row.title) ?? "",
    preamble: asText(row.preamble) ?? "",
    clauses: toClauses(row.clauses),
    status: asText(row.status) ?? "draft",
    changeNote: asText(row.change_note),
    graceDays: asInt(row.grace_days),
    docHash: asText(row.doc_hash),
    publishedAt: asText(row.published_at),
  };
}

/**
 * قراءة الشاشة كلها. و`ready` تعني: البيئة مضبوطة والجدول موجود فعلاً — وقبلها
 * تُعرض معطَّلة بالكامل، فلا نموذج يُرسَل إلى جدول غير موجود.
 */
async function loadScreen() {
  const blank = {
    ready: false,
    versions: [] as Version[],
    partners: [] as PartnerRow[],
    acceptances: [] as AcceptanceRow[],
    gateEnabled: true,
    graceDays: 14,
  };
  if (!hasSupabaseEnv()) return blank;

  const supabase = await createServerSupabase();
  if (!supabase) return blank;

  const [versionsRes, settingsRes, partnersRes, acceptancesRes] = await Promise.all([
    supabase
      .from("partner_agreement_versions")
      .select("id, version, title, preamble, clauses, status, change_note, grace_days, doc_hash, published_at")
      .order("version", { ascending: false })
      .limit(50),
    supabase.from("partner_agreement_settings").select("gate_enabled, grace_days").limit(1),
    supabase.rpc("admin_agreement_partners"),
    supabase.rpc("admin_agreement_acceptances", { p_limit: 200 }),
  ]);

  if (versionsRes.error) return blank;

  const settings = (settingsRes.data?.[0] ?? null) as Record<string, unknown> | null;

  return {
    ready: true,
    versions: (versionsRes.data ?? []).map((row) => toVersion(row as Record<string, unknown>)),
    partners: ((partnersRes.data ?? []) as Record<string, unknown>[]).map((row) => ({
      id: String(pick(row, ["subcontractor_id", "subcontractorId"]) ?? ""),
      companyName: asText(pick(row, ["company_name", "companyName"])) ?? "—",
      status: asText(pick(row, ["status"])) ?? "—",
      accepted: asBool(pick(row, ["accepted"])),
      acceptedVersion: asInt(pick(row, ["accepted_version", "acceptedVersion"])),
      acceptedAt: asText(pick(row, ["accepted_at", "acceptedAt"])),
      deadline: asText(pick(row, ["deadline"])),
      inGrace: asBool(pick(row, ["in_grace", "inGrace"])),
      ok: asBool(pick(row, ["ok"])),
    })),
    acceptances: ((acceptancesRes.data ?? []) as Record<string, unknown>[]).map((row) => ({
      id: String(pick(row, ["id"]) ?? ""),
      companyName: asText(pick(row, ["subcontractor_name", "subcontractorName"])) ?? "—",
      version: asInt(pick(row, ["agreement_version", "agreementVersion"])) ?? 0,
      signedName: asText(pick(row, ["signed_name", "signedName"])) ?? "—",
      actorKind: asText(pick(row, ["actor_kind", "actorKind"])) ?? "partner",
      acceptedAt: asText(pick(row, ["accepted_at", "acceptedAt"])),
      hashMatches: asBool(pick(row, ["hash_matches", "hashMatches"])),
    })),
    gateEnabled: settings ? asBool(settings.gate_enabled) : true,
    graceDays: settings ? (asInt(settings.grace_days) ?? 14) : 14,
  };
}

export default async function PartnerAgreementPage({
  searchParams,
}: PageProps<"/admin/partner-agreement">) {
  const [params, screen] = await Promise.all([searchParams, loadScreen()]);

  const saved = params.saved === "1";
  const published = params.published === "1";
  const error = typeof params.error === "string" ? params.error : null;

  const current = screen.versions.find((version) => version.status === "published") ?? null;
  const draft = screen.versions.find((version) => version.status === "draft") ?? null;
  const archived = screen.versions.filter((version) => version.status === "archived");
  const pending = screen.partners.filter((partner) => !partner.accepted);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="flex items-center gap-2 font-heading text-xl font-bold">
          <ScrollText className="size-6 shrink-0 text-primary" aria-hidden="true" />
          اتفاقية المتعهد
          <HelpTip>
            الوثيقة التي يقبلها المتعهد قبل أن تصله الرحلات. وهي ما يُدافَع به عن أي خصم:
            الخصم يُثبت بصفٍّ فيه رقم الإصدار المقبول ولحظة قبوله، لا بجملة «الاتفاق يقول».
          </HelpTip>
        </h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          النسخة السارية يقرؤها المتعهد في بوابته ويقبلها باسمه. وتعديلها يصدر نسخة جديدة
          تُبطل كل قبول سابق وتبدأ مهلة جديدة للجميع.
        </p>
      </div>

      <Banners
        wired={hasSupabaseEnv()}
        readOnly={!screen.ready}
        saved={saved || published}
        error={error}
        errorMessages={ERROR_MESSAGES}
        savedMessage={published ? "نُشرت النسخة الجديدة وبدأت مهلة القبول." : "حُفظت التعديلات."}
        readOnlyTitle="الشاشة للعرض فقط"
        readOnlyBody={
          <p>
            جدول اتفاقية المتعهد غير موجود على الخادم — نفّذ هجرة{" "}
            <code dir="ltr">0113_partner_agreement.sql</code> ثم أعد تحميل الصفحة.
          </p>
        }
      />

      {/* 🔴 التحفّظ القانوني — في الشاشة لا في تقرير جلسة يضيع */}
      <Card className="flex flex-row items-start gap-3 border-amber-300 bg-amber-50 p-4 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
        <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
        <div className="space-y-1 text-sm leading-relaxed">
          <p className="font-semibold">هذا النص لم يراجعه محامٍ بعد</p>
          <p>
            النسخة المبذورة صيغت من قراءة ما يفعله النظام فعلاً — التسعير والتسوية والبثّ
            وأسباب الفشل وما يصل المتعهد من بيانات العميل. والتعاقد مع متعهد في مصر له أثر
            قانوني حقيقي (تصنيف العلاقة، شرط عدم التعامل المباشر، الخصم من المستحق). راجعه مع
            محامٍ مصري قبل أول استعمال حقيقي، وقبل أن يُبنى عليه أول خصم.
          </p>
        </div>
      </Card>

      {/* ── (١) من قَبِل ومن لم يقبل ─────────────────────────────────── */}
      <Card className="gap-3 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-heading text-base font-bold">حالة المتعهدين</h2>
          {pending.length > 0 ? (
            <Badge variant="outline" className="border-amber-400 text-amber-700 dark:text-amber-300">
              {n(pending.length)} لم يقبل بعد
            </Badge>
          ) : screen.partners.length > 0 ? (
            <Badge variant="outline" className="border-emerald-400 text-emerald-700 dark:text-emerald-400">
              الجميع قَبِل النسخة السارية
            </Badge>
          ) : null}
        </div>

        {screen.partners.length === 0 ? (
          <p className="text-sm text-muted-foreground">لا متعهدين بعد.</p>
        ) : (
          <div className="-mx-2 overflow-x-auto px-2">
            <table className="w-full min-w-[46rem] text-start text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="py-2 text-start font-medium">المتعهد</th>
                  <th className="py-2 text-start font-medium">الحساب</th>
                  <th className="py-2 text-start font-medium">القبول</th>
                  <th className="py-2 text-start font-medium">تتوقف عروضه في</th>
                  <th className="py-2 text-start font-medium">يستقبل الآن؟</th>
                </tr>
              </thead>
              <tbody>
                {screen.partners.map((partner) => (
                  <tr key={partner.id} className="border-b border-border/70 last:border-0">
                    <td className="py-2.5 font-medium">{partner.companyName}</td>
                    <td className="py-2.5 text-muted-foreground">{partner.status}</td>
                    <td className="py-2.5">
                      {partner.accepted ? (
                        <span className="text-emerald-700 dark:text-emerald-400">
                          الإصدار {n(partner.acceptedVersion ?? 0)} — {AR_DATE(partner.acceptedAt)}
                        </span>
                      ) : (
                        <span className="text-amber-700 dark:text-amber-300">لم يقبل</span>
                      )}
                    </td>
                    <td className="py-2.5 text-muted-foreground">
                      {partner.accepted ? "—" : AR_DATE(partner.deadline)}
                    </td>
                    <td className="py-2.5">
                      {partner.ok ? (
                        <span className="text-emerald-700 dark:text-emerald-400">نعم</span>
                      ) : (
                        <span className="font-semibold text-red-700 dark:text-red-400">
                          لا — محجوب
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-xs leading-5 text-muted-foreground">
          المهلة تُحسب لكل متعهد من نشر النسخة أو من إنشاء حسابه، أيهما أحدث — فمتعهد يعمل
          منذ شهور لا تنقطع عروضه لحظة نشر نسخة جديدة، بل تبدأ مهلته من النشر.
        </p>
      </Card>

      {/* ── (٢) النسخة السارية ───────────────────────────────────────── */}
      <Card className="gap-3 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <FileText className="size-5 shrink-0 text-primary" aria-hidden="true" />
          <h2 className="font-heading text-base font-bold">النسخة السارية</h2>
          {current ? (
            <Badge variant="outline">الإصدار {n(current.version)}</Badge>
          ) : (
            <Badge variant="outline" className="border-red-400 text-red-700 dark:text-red-400">
              لا نسخة منشورة
            </Badge>
          )}
        </div>

        {current ? (
          <div className="space-y-2 text-sm">
            <p className="font-medium">{current.title}</p>
            <p className="text-muted-foreground">
              {n(current.clauses.length)} بنداً · نُشرت في {AR_DATE(current.publishedAt)} · مهلة
              القبول {n(current.graceDays ?? 0)} يوماً · بصمة النص{" "}
              <code dir="ltr" className="text-xs">
                {current.docHash?.slice(0, 12) ?? "—"}
              </code>
            </p>
            <details className="rounded-lg border border-border bg-muted/40 p-3">
              <summary className="cursor-pointer text-sm font-medium">اقرأ النص كاملاً</summary>
              <div className="space-y-3 pt-3">
                {current.preamble ? (
                  <p className="whitespace-pre-line text-sm leading-loose text-muted-foreground">
                    {current.preamble}
                  </p>
                ) : null}
                {current.clauses.map((clause) => (
                  <div key={clause.k} className="space-y-1">
                    <p className="text-sm font-semibold">{clause.title}</p>
                    <p className="whitespace-pre-line text-sm leading-loose text-muted-foreground">
                      {clause.body}
                    </p>
                  </div>
                ))}
              </div>
            </details>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            لا نسخة منشورة الآن، فلا شيء يُطالَب المتعهد بقبوله ولا أحد محجوب.
          </p>
        )}
      </Card>

      {/* ── (٣) المسودة ─────────────────────────────────────────────── */}
      <Card className="gap-4 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-heading text-base font-bold">تحرير نسخة جديدة</h2>
          <HelpTip>
            النسخة المنشورة مجمّدة ولا تُعدَّل — لأن كل متعهد قَبِل نصاً بعينه، والاحتجاج عليه
            يكون بذلك النص لا بنص اليوم. فالتعديل يصدر نسخة جديدة، ونشرها يُبطل كل قبول سابق.
          </HelpTip>
        </div>

        {!draft ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              لا مسودة مفتوحة. إنشاء مسودة ينسخ النص الساري كما هو فتعدّل عليه.
            </p>
            <form action={startDraft}>
              <Button type="submit" variant="outline" disabled={!screen.ready}>
                <Plus aria-hidden="true" />
                أنشئ مسودة من النسخة السارية
              </Button>
            </form>
          </div>
        ) : (
          <div className="space-y-5">
            <form action={saveDraftHeader} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="draft-title">عنوان الاتفاقية</Label>
                <Input id="draft-title" name="title" defaultValue={draft.title} maxLength={200} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="draft-preamble">الديباجة</Label>
                <textarea
                  id="draft-preamble"
                  name="preamble"
                  rows={6}
                  defaultValue={draft.preamble}
                  className={controlClass}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="draft-note">ما تغيّر في هذه النسخة</Label>
                <textarea
                  id="draft-note"
                  name="change_note"
                  rows={3}
                  defaultValue={draft.changeNote ?? ""}
                  className={controlClass}
                  placeholder="يُعرض للمتعهد الذي سبق أن قَبِل نسخة أقدم، فيعرف ما الذي يُطلب منه قبوله من جديد."
                />
              </div>
              <Button type="submit" variant="outline">
                احفظ العنوان والديباجة
              </Button>
            </form>

            <div className="space-y-3 border-t border-border pt-4">
              <p className="text-sm font-semibold">
                بنود المسودة ({n(draft.clauses.length)})
              </p>

              {draft.clauses.map((clause, index) => (
                <Card key={clause.k} className="gap-3 p-4" size="sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      البند {n(index + 1)}
                    </span>
                    <div className="ms-auto flex items-center gap-1">
                      <form action={moveClause}>
                        <input type="hidden" name="key" value={clause.k} />
                        <input type="hidden" name="direction" value="up" />
                        <Button type="submit" variant="ghost" size="icon" disabled={index === 0}>
                          <ArrowUp aria-hidden="true" />
                          <span className="sr-only">أعلى</span>
                        </Button>
                      </form>
                      <form action={moveClause}>
                        <input type="hidden" name="key" value={clause.k} />
                        <input type="hidden" name="direction" value="down" />
                        <Button
                          type="submit"
                          variant="ghost"
                          size="icon"
                          disabled={index === draft.clauses.length - 1}
                        >
                          <ArrowDown aria-hidden="true" />
                          <span className="sr-only">أسفل</span>
                        </Button>
                      </form>
                      <form action={deleteClause}>
                        <input type="hidden" name="key" value={clause.k} />
                        <Button type="submit" variant="ghost" size="icon">
                          <Trash2 aria-hidden="true" />
                          <span className="sr-only">حذف</span>
                        </Button>
                      </form>
                    </div>
                  </div>

                  <form action={saveClause} className="space-y-2">
                    <input type="hidden" name="key" value={clause.k} />
                    <Input name="title" defaultValue={clause.title} maxLength={200} required />
                    <textarea
                      name="body"
                      rows={8}
                      defaultValue={clause.body}
                      className={controlClass}
                      required
                    />
                    <Button type="submit" variant="outline" size="sm">
                      احفظ البند
                    </Button>
                  </form>
                </Card>
              ))}

              <Card className="gap-2 p-4" size="sm">
                <p className="text-sm font-semibold">أضف بنداً</p>
                <form action={addClause} className="space-y-2">
                  <Input name="title" placeholder="عنوان البند" maxLength={200} required />
                  <textarea
                    name="body"
                    rows={5}
                    placeholder="نص البند — افصل الفقرات بسطر فارغ."
                    className={controlClass}
                    required
                  />
                  <Button type="submit" variant="outline" size="sm">
                    <Plus aria-hidden="true" />
                    أضف
                  </Button>
                </form>
              </Card>
            </div>

            <div className="flex flex-wrap items-end gap-3 border-t border-border pt-4">
              <form action={publishDraft} className="flex flex-wrap items-end gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="publish-grace">مهلة القبول (أيام)</Label>
                  <Input
                    id="publish-grace"
                    name="grace_days"
                    type="number"
                    min={0}
                    max={180}
                    defaultValue={screen.graceDays}
                    className="w-32"
                    required
                  />
                </div>
                <Button type="submit">
                  <Send aria-hidden="true" />
                  انشر هذه النسخة
                </Button>
              </form>
              <form action={discardDraft}>
                <Button type="submit" variant="ghost">
                  احذف المسودة
                </Button>
              </form>
            </div>

            <p className="text-xs leading-5 text-amber-700 dark:text-amber-300">
              النشر يُبطل كل قبول سابق: يصير كل متعهد «لم يقبل» ويأخذ المهلة أعلاه من لحظة
              النشر. ومن لم يقبل بعد انقضائها تتوقف عنه عروض الرحلات — ولا يمسّ ذلك رحلة قبلها
              فعلاً ولا مستحقاته عنها.
            </p>
          </div>
        )}
      </Card>

      {/* ── (٤) مقبضا الحاجز ─────────────────────────────────────────── */}
      <Card className="gap-3 p-5">
        <h2 className="font-heading text-base font-bold">اشتراط القبول</h2>
        <form action={saveGateSettings} className="flex flex-wrap items-end gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="gate_enabled"
              value="1"
              defaultChecked={screen.gateEnabled}
              className="size-4 rounded border-input accent-primary"
            />
            عدم القبول يوقف وصول العروض بعد المهلة
          </label>
          <div className="space-y-1.5">
            <Label htmlFor="gate-grace">مهلة القبول الافتراضية (أيام)</Label>
            <Input
              id="gate-grace"
              name="grace_days"
              type="number"
              min={0}
              max={180}
              defaultValue={screen.graceDays}
              className="w-32"
              required
            />
          </div>
          <Button type="submit" variant="outline" disabled={!screen.ready}>
            احفظ
          </Button>
        </form>
        <p className="text-xs leading-5 text-muted-foreground">
          إطفاء الاشتراط يُبقي الاتفاقية معروضة للمتعهد ويُبقي قبوله مسجَّلاً، ولا يحجب أحداً.
          والمهلة هنا هي الافتراضية لأي نشر قادم؛ وما سرى على نسخة منشورة مجمَّد معها ولا
          يتغيّر بتعديل هذا الحقل.
        </p>
      </Card>

      {/* ── (٥) سجل القبول ──────────────────────────────────────────── */}
      <Card className="gap-3 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <CheckCircle2 className="size-5 shrink-0 text-primary" aria-hidden="true" />
          <h2 className="font-heading text-base font-bold">سجل القبول</h2>
          <HelpTip>
            سجل مُلحَق فقط: لا يُعدَّل ولا يُحذف صف منه، ولا يملك دور المتصفح ولا مفتاح الخدمة
            صلاحية المساس به. وهو الدليل الذي يُقدَّم عند أي نزاع على خصم.
          </HelpTip>
        </div>

        {screen.acceptances.length === 0 ? (
          <p className="text-sm text-muted-foreground">لا قبولات مسجَّلة بعد.</p>
        ) : (
          <div className="-mx-2 overflow-x-auto px-2">
            <table className="w-full min-w-[42rem] text-start text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="py-2 text-start font-medium">المتعهد</th>
                  <th className="py-2 text-start font-medium">الإصدار</th>
                  <th className="py-2 text-start font-medium">وقّع باسم</th>
                  <th className="py-2 text-start font-medium">القابل</th>
                  <th className="py-2 text-start font-medium">التاريخ</th>
                  <th className="py-2 text-start font-medium">البصمة</th>
                </tr>
              </thead>
              <tbody>
                {screen.acceptances.map((row) => (
                  <tr key={row.id} className="border-b border-border/70 last:border-0">
                    <td className="py-2.5 font-medium">{row.companyName}</td>
                    <td className="py-2.5 text-muted-foreground">{n(row.version)}</td>
                    <td className="py-2.5">{row.signedName}</td>
                    <td className="py-2.5 text-muted-foreground">
                      {row.actorKind === "admin" ? "الإدارة" : "المتعهد"}
                    </td>
                    <td className="py-2.5 text-muted-foreground">{AR_DATE(row.acceptedAt)}</td>
                    <td className="py-2.5">
                      {row.hashMatches ? (
                        <span className="text-emerald-700 dark:text-emerald-400">مطابقة</span>
                      ) : (
                        <span className="font-semibold text-red-700 dark:text-red-400">
                          مختلفة — النص مُسّ بعد القبول
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {archived.length > 0 ? (
        <Card className="gap-2 p-5">
          <h2 className="font-heading text-base font-bold">النسخ السابقة</h2>
          <ul className="space-y-1 text-sm text-muted-foreground">
            {archived.map((version) => (
              <li key={version.id}>
                الإصدار {n(version.version)} — نُشر في {AR_DATE(version.publishedAt)} ·{" "}
                {n(version.clauses.length)} بنداً · بصمة{" "}
                <code dir="ltr" className="text-xs">
                  {version.docHash?.slice(0, 12) ?? "—"}
                </code>
              </li>
            ))}
          </ul>
          <p className="text-xs leading-5 text-muted-foreground">
            محفوظة بنصّها ولا تُعدَّل ولا تُحذف — لأن من قَبِلها قَبِل ذلك النص بعينه.
          </p>
        </Card>
      ) : null}
    </div>
  );
}
