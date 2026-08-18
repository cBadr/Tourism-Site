import "server-only";

import { cache } from "react";

import { isSchemaMissing, portalSetupAccess } from "./session";

/**
 * اتفاقية المتعهد كما يقرؤها صاحب الجلسة — قراءة واحدة من `portal_agreement()`
 * (هجرة `0113`).
 *
 * ── ثلاث قواعد تحكم هذا الملف ──────────────────────────────────────────────
 *
 * (١) **ولا وسيط لها إطلاقاً 🔒** — نطاق الدالة مثبَّت داخلها عبر
 *     `current_subcontractor_id()`، تماماً كـ`portal_balance()`. ولا يُضاف
 *     وسيطُ متعهدٍ لاحقاً ولو «للتجربة»: أول وسيطٍ يحوّلها من دالةٍ مقصورة على
 *     صاحبها إلى بابٍ يقرأ به كلُّ شريكٍ حالةَ غيره (سابقة D-20). والمناداة
 *     تبقى `rpc("portal_agreement")` بلا حمولة.
 *
 * (٢) **لا يُشتقّ هنا شرطُ حجبٍ ولا مهلةٌ ولا «هل قَبِل».** كلُّها تصل محسوبةً من
 *     `partner_agreement_status()` — وهي نفسُها التي تقرؤها `dispatch_pool`
 *     و`portal_offers` و`accept_offer`. وتعريفان لـ«قَبِل» يفترقان يوماً، فتقول
 *     الشاشة «أنت مستقبِل» والقاعدةُ تتخطّاه — النمط ٢ في `LESSONS.md` حرفياً.
 *
 * (٣) **الحارس هنا `portalSetupAccess` الموسَّع لا الضيّق**، بقصد: المدعوُّ الذي
 *     يجهّز نفسه يقرأ الاتفاقية ويقبلها **قبل** اعتماده، فيصل يوم الاعتماد وهو
 *     قابلٌ لا ناقص. والقبولُ ليس فعلاً تشغيلياً على رحلة عميلٍ دفع.
 */

/** بندٌ واحد من الوثيقة — عنوانٌ ونصّ، بمفتاحٍ ثابت للترتيب في الواجهة */
export type AgreementClause = {
  key: string;
  title: string;
  body: string;
};

export type PortalAgreement = {
  versionId: string;
  version: number;
  title: string;
  preamble: string;
  clauses: AgreementClause[];
  /** ما تغيّر في هذا الإصدار — يُعرض لمن سبق أن قَبِل ما قبله */
  changeNote: string | null;
  publishedAt: string | null;
  /** الحاجز مشتعلٌ من اللوحة ⇒ عدمُ القبول يوقف العروض بعد المهلة */
  required: boolean;
  /** لا يمنعه هذا الحاجز من العمل الآن — أوسع من `accepted` (يشمل المهلة والخمول) */
  ok: boolean;
  accepted: boolean;
  acceptedVersion: number | null;
  acceptedAt: string | null;
  /** آخر لحظة يقبل فيها قبل أن تتوقف العروض — `null` حين لا مهلة تُقاس */
  deadline: string | null;
  inGrace: boolean;
  companyName: string;
};

/**
 * ثلاث حالات لا اثنتان — بنفس تمييز `balance.ts`:
 * - `hidden`: لا دالة (قاعدة قبل `0113`) أو لا إصدار منشور ⇒ لا شيء يُعرض ولا
 *   بندَ في المعالج. والصمتُ هنا صحيح: لا اتفاقيةَ تُقبل أصلاً.
 * - `failed`: الدالة موجودة والنداء فشل ⇒ يُقال «تعذّرت القراءة» ولا يُترجَم إلى
 *   «لم يقبل» — ووسمُ شريكٍ بأنه لم يقبل بسبب نداءٍ فشل يرسله يطارد ما ليس عائقاً.
 * - `ready`: صفٌّ مقروء.
 */
export type AgreementResult =
  | { state: "hidden" }
  | { state: "failed" }
  | { state: "ready"; agreement: PortalAgreement };

/* ------------------------------------------------------------------ */
/* قراءة صفٍّ مجهول البنية                                              */
/* ------------------------------------------------------------------ */

function pick(row: Record<string, unknown>, names: string[]): unknown {
  for (const name of names) {
    const value = row[name];
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

const asText = (value: unknown): string | null =>
  typeof value === "string" && value.trim() !== "" ? value : null;

function asBool(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value === "true" || value === "t" || value === "1";
  return value === 1;
}

function asInt(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/**
 * البنود — تُقرأ دفاعياً: `clauses` عمود `jsonb` يُحرَّر من اللوحة، وبندٌ بلا
 * عنوانٍ أو بلا نصّ يُسقَط بدل أن يُصيَّر فراغاً في وثيقةٍ قانونية.
 */
function toClauses(value: unknown): AgreementClause[] {
  if (!Array.isArray(value)) return [];
  const out: AgreementClause[] = [];
  value.forEach((raw, index) => {
    if (typeof raw !== "object" || raw === null) return;
    const item = raw as Record<string, unknown>;
    const title = asText(item.title);
    const body = asText(item.body);
    if (!title || !body) return;
    out.push({ key: asText(item.k) ?? `c${index}`, title, body });
  });
  return out;
}

function firstRow(data: unknown): Record<string, unknown> | null {
  const candidate = Array.isArray(data) ? data[0] : data;
  return typeof candidate === "object" && candidate !== null
    ? (candidate as Record<string, unknown>)
    : null;
}

function toAgreement(row: Record<string, unknown>): PortalAgreement | null {
  const versionId = asText(pick(row, ["version_id", "versionId"]));
  const version = asInt(pick(row, ["version"]));
  const title = asText(pick(row, ["title"]));
  // لا إصدارَ منشور ⇒ الدالة تُرجع صفاً بأعمدةٍ فارغة، وهذه حالةُ «لا شيء يُعرض»
  if (!versionId || version === null || !title) return null;

  return {
    versionId,
    version,
    title,
    preamble: asText(pick(row, ["preamble"])) ?? "",
    clauses: toClauses(pick(row, ["clauses"])),
    changeNote: asText(pick(row, ["change_note", "changeNote"])),
    publishedAt: asText(pick(row, ["published_at", "publishedAt"])),
    required: asBool(pick(row, ["required"])),
    ok: asBool(pick(row, ["ok"])),
    accepted: asBool(pick(row, ["accepted"])),
    acceptedVersion: asInt(pick(row, ["accepted_version", "acceptedVersion"])),
    acceptedAt: asText(pick(row, ["accepted_at", "acceptedAt"])),
    deadline: asText(pick(row, ["deadline"])),
    inGrace: asBool(pick(row, ["in_grace", "inGrace"])),
    companyName: asText(pick(row, ["company_name", "companyName"])) ?? "",
  };
}

/* ------------------------------------------------------------------ */
/* القراءة                                                             */
/* ------------------------------------------------------------------ */

/**
 * اتفاقية صاحب الجلسة وحالتُه أمامها. مُذاكَرة لكل طلب: يقرؤها المعالجُ في
 * اللوحة وصفحةُ الاتفاقية نفسها — نداءٌ واحد لا اثنان.
 */
export const loadPortalAgreement = cache(async (): Promise<AgreementResult> => {
  const access = await portalSetupAccess();
  if (!access.ok) return { state: "hidden" };

  const res = await access.supabase.rpc("portal_agreement");
  if (res.error) {
    return isSchemaMissing(res.error) ? { state: "hidden" } : { state: "failed" };
  }

  const row = firstRow(res.data);
  if (!row) return { state: "hidden" };

  const agreement = toAgreement(row);
  return agreement ? { state: "ready", agreement } : { state: "hidden" };
});
