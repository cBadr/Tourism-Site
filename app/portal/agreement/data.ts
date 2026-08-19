import "server-only";

import { cache } from "react";

import { loadPortalAgreement, type AgreementClause } from "../_lib/agreement";
import { isSchemaMissing, portalSetupAccess } from "../_lib/session";

/**
 * النُّسَخ التي وقّعها صاحبُ الجلسة — قراءةٌ واحدة من `portal_agreement_history()`
 * (هجرة `0137`).
 *
 * ── لماذا وحدةٌ ثانية إلى جوار `_lib/agreement.ts`؟ ─────────────────────────
 *
 * لأنهما يجيبان سؤالين مختلفين: تلك تقول **«ما النصُّ الساري وأين أنت منه»**،
 * وهذه تقول **«ما الذي وقّعتَه أنت، ومتى، وبأي نصّ»**. والأولى تُقرأ في كل طلب
 * (‏معالجُ التجهيز يستدعيها)، والثانية لا تُقرأ إلا في ملف المستخدم — فدمجُهما
 * في نداءٍ واحد كان يُحمّل كلَّ صفحةٍ في البورتال باستعلامٍ لا تحتاجه.
 *
 * ── القواعد الثلاث نفسها ───────────────────────────────────────────────────
 *
 * (١) 🔒 **ولا وسيط لها إطلاقاً** — النطاق مثبَّت داخل الدالة عبر
 *     `current_subcontractor_id()`. ولا يُضاف وسيطُ متعهدٍ لاحقاً ولو «للتجربة»:
 *     أولُ وسيطٍ يجعل كلَّ شريكٍ يقرأ توقيعَ غيره واسمَ الموقّع عنه (D-20).
 *
 * (٢) **لا يُشتقّ هنا حكمٌ ولا حالة.** `hash_matches` و`is_current` تصلان
 *     محسوبتين من القاعدة، ولا تُعاد مقارنةُ بصمةٍ في TypeScript — مصدران
 *     لرقمٍ واحد ينحرفان (النمط ٨ في `LESSONS.md`).
 *
 * (٣) **الحارس الموسَّع** (`portalSetupAccess`) كنظيرِه في `_lib/agreement.ts`:
 *     المدعوُّ الذي وقّع قبل اعتماده يقرأ نسخته الموقَّعة كما يقرؤها المعتمَد.
 *
 * ⚠ **وقارئا الصفوف مكرَّران بحكم حدودِ ملكيةِ الملفات، لا باختيار.** الدوالُّ
 * الدفاعية (`asText`/`toClauses`/`firstRow`) موجودةٌ بنسختها في
 * `app/portal/_lib/agreement.ts` وهي **غيرُ مُصدَّرة**، وذلك الملف خارج نطاق
 * هذه الجبهة فلا يُحرَّر. والتوصية مكتوبةٌ في تقرير الجبهة: تُرفع تلك الدوالُّ
 * إلى تصديرٍ واحد ويُحذف ما هنا.
 */

/** نسخةٌ واحدة وقّعها الشريك — بنصّها كما كان لحظة التوقيع */
export type SignedAgreement = {
  acceptanceId: string;
  agreementId: string;
  version: number;
  title: string;
  preamble: string;
  clauses: AgreementClause[];
  changeNote: string | null;
  publishedAt: string | null;
  /** حالةُ الإصدار الآن: `published` أو `archived` */
  status: string;
  signedName: string;
  /** `partner` وقّعها بنفسه · `admin` وقّعتها الإدارة عنه */
  actorKind: string;
  acceptedAt: string | null;
  /** بصمةُ النصّ كما نُسخت في صفّ التوقيع — تُكتب في نسخة التنزيل حجّةً */
  docHash: string;
  /**
   * 🔴 بصمةُ لحظة التوقيع تطابق بصمةَ الإصدار الآن؟ `false` تعني أن نصَّ إصدارٍ
   * مُسّ بعد أن وقّعه — ويُقال للشريك بدل أن يمرّ صامتاً.
   */
  hashMatches: boolean;
  /** هذه هي النسخة السارية اليوم */
  isCurrent: boolean;
};

/**
 * ثلاث حالات لا اثنتان — بنفس تمييز `_lib/agreement.ts`:
 * - `hidden`: قاعدةٌ قبل `0137` (‏الدالة غير موجودة) ⇒ لا يُعرض القسم ولا يُقال عطل.
 * - `failed`: الدالة موجودة والنداء فشل ⇒ يُقال «تعذّرت القراءة».
 * - `ready`: قائمةٌ مقروءة، وقد تكون فارغة (لم يوقّع شيئاً بعد).
 */
export type AgreementHistoryResult =
  | { state: "hidden" }
  | { state: "failed" }
  | { state: "ready"; signed: SignedAgreement[] };

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

/** بندٌ بلا عنوانٍ أو بلا نصّ يُسقَط بدل أن يُصيَّر فراغاً في وثيقةٍ قانونية */
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

function toSigned(row: Record<string, unknown>): SignedAgreement | null {
  const acceptanceId = asText(row.acceptance_id);
  const agreementId = asText(row.agreement_id);
  const version = asInt(row.version);
  const title = asText(row.title);
  if (!acceptanceId || !agreementId || version === null || !title) return null;

  return {
    acceptanceId,
    agreementId,
    version,
    title,
    preamble: asText(row.preamble) ?? "",
    clauses: toClauses(row.clauses),
    changeNote: asText(row.change_note),
    publishedAt: asText(row.published_at),
    status: asText(row.status) ?? "archived",
    signedName: asText(row.signed_name) ?? "",
    actorKind: asText(row.actor_kind) ?? "partner",
    acceptedAt: asText(row.accepted_at),
    docHash: asText(row.doc_hash) ?? "",
    hashMatches: asBool(row.hash_matches),
    isCurrent: asBool(row.is_current),
  };
}

/**
 * النُّسَخ الموقَّعة، الأحدثُ أولاً. مُذاكَرة لكل طلب: يقرؤها قسمُ الاتفاقية في
 * ملف المستخدم ومسارُ التنزيل — نداءٌ واحد لا اثنان.
 */
export const loadSignedAgreements = cache(async (): Promise<AgreementHistoryResult> => {
  const access = await portalSetupAccess();
  if (!access.ok) return { state: "hidden" };

  const res = await access.supabase.rpc("portal_agreement_history");
  if (res.error) {
    return isSchemaMissing(res.error) ? { state: "hidden" } : { state: "failed" };
  }

  const rows = Array.isArray(res.data) ? res.data : [];
  const signed: SignedAgreement[] = [];
  for (const row of rows) {
    if (typeof row !== "object" || row === null) continue;
    const item = toSigned(row as Record<string, unknown>);
    if (item) signed.push(item);
  }

  return { state: "ready", signed };
});

/**
 * هل على الشريك فعلٌ في الاتفاقية الآن؟ — **سؤالُ ترتيبٍ لا سؤالُ أهلية.**
 *
 * تقرؤه صفحةُ «حسابي» لتقرّر أيُّ قسمٍ يتصدّر: من لم يوقّع بعدُ يجد الاتفاقية
 * أولَ ما يقع عليه بصره، ومن وقّع يجد بيانات حسابه أولاً والاتفاقيةَ في ذيلها.
 *
 * ⚠ **ولا تُستعمل حارساً بحال ولا تُشتقّ منها أهلية**: الحاجز `partner_agreement_ok()`
 * في القاعدة وحده، وهو أوسع من هذا (يشمل المهلة وخمولَ الحاجز). ولو استُعملت
 * هذه في منعٍ لصار في المشروع تعريفان لـ«قَبِل» يفترقان يوماً — النمط ٢ حرفياً.
 * والقراءة مُذاكَرة، فلا استعلام إضافي.
 */
export async function agreementNeedsAction(): Promise<boolean> {
  const result = await loadPortalAgreement();
  return result.state === "ready" && !result.agreement.accepted;
}
