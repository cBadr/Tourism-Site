import { getSettings } from "@/lib/settings";
import { loadPortalAgreement } from "../../_lib/agreement";
import { portalSetupAccess } from "../../_lib/session";
import { loadSignedAgreements, type SignedAgreement } from "../data";

/**
 * نسخةٌ للتنزيل من اتفاقية المتعهد — ملفُّ نصٍّ واحد يحمل الوثيقة كاملة.
 *
 * ── لماذا مسارٌ يبني الملف، لا رابطُ طباعةٍ ولا PDF ─────────────────────────
 *
 * لأن الغرض **الاحتفاظ لا العرض**: الشريك يريد أن يبقى معه ما وقّعه لو انقطع
 * حسابه أو تغيّرت المنصة. وأخفُّ صيغةٍ تفتح على كل جهازٍ بلا برنامجٍ ولا خطٍّ
 * مثبَّت هي النصُّ العاري — وهي أيضاً الوحيدةُ التي **لا تحتاج مكتبةً جديدة**
 * في حزمةٍ تُبنى على الخادم. و«اطبع الصفحة» ليست بديلاً: تطبع القائمةَ والترويسةَ
 * وحالةَ الحساب معها، وتُسقط ما كان مطوياً في `details`.
 *
 * ── 🔒 وما يُنزَّل، وما لا يُنزَّل ─────────────────────────────────────────────
 *
 * | الطلب | ما يعود | لماذا |
 * |---|---|---|
 * | بلا وسيط | **النسخة السارية** كما تراها الشاشة | ما يقرؤه الآن ويوقّع عليه |
 * | `?a=<معرّف قبول>` | **النسخة التي وقّعها هو** بنصّها ولو أُرشفت | «تعود إليها في أي وقت» |
 * | معرّفٌ ليس من قبولاته | **٤٠٤** | لا يُقرأ توقيعُ شريكٍ آخر ولا نصُّ إصدارٍ لم يوقّعه |
 *
 * والحدُّ بنيويّ لا فحصٌ مكتوبٌ هنا: `portal_agreement_history()` **لا تأخذ وسيطَ
 * متعهد أصلاً** (هجرة 0137)، فما لا يخرج منها لا يوجد من هذا الطريق. والبحثُ
 * أدناه في قائمةٍ هي بحكم تعريفها قبولاتُ صاحب الجلسة وحده.
 *
 * ولا تخزين مؤقت: نصُّ الاتفاقية قد يتغيّر بنشر إصدار، وبصمةُ المساس تُقرأ حيّة.
 */

export const dynamic = "force-dynamic";

/** سطرٌ فاصل يُقرأ في محرّر نصٍّ عاري بلا تنسيق */
const RULE = "─".repeat(60);

type DocLike = {
  version: number;
  title: string;
  preamble: string;
  clauses: { key: string; title: string; body: string }[];
  publishedAt: string | null;
};

/**
 * بناءُ الملف. **بلا أي حساب ولا حكم** — يجمّع ما وصل من القاعدة كما هو.
 * والتذييل يحمل ما يجعل الورقة حجّةً بذاتها: مَن وقّع ومتى وبأي إصدارٍ وبصمة.
 */
function renderCopy(
  doc: DocLike,
  brand: string,
  signed: SignedAgreement | null
): string {
  const lines: string[] = [];

  lines.push(doc.title);
  lines.push(RULE);
  lines.push(`المنصة: ${brand}`);
  lines.push(`الإصدار: ${doc.version}`);
  if (doc.publishedAt) lines.push(`تاريخ النشر: ${doc.publishedAt}`);
  lines.push("");

  if (doc.preamble.trim() !== "") {
    lines.push(doc.preamble.trim());
    lines.push("");
  }

  doc.clauses.forEach((clause, index) => {
    lines.push(`${index + 1}) ${clause.title}`);
    lines.push(clause.body.trim());
    lines.push("");
  });

  lines.push(RULE);
  if (signed) {
    lines.push("سجلّ التوقيع");
    lines.push(`الموقّع: ${signed.signedName}`);
    lines.push(
      `صفة التوقيع: ${signed.actorKind === "admin" ? "سُجّل من الإدارة نيابةً عنك" : "وقّعتَه من بورتالك"}`
    );
    if (signed.acceptedAt) lines.push(`لحظة التوقيع: ${signed.acceptedAt}`);
    lines.push(`بصمة النصّ وقت التوقيع: ${signed.docHash}`);
    if (!signed.hashMatches) {
      lines.push(
        "⚠ تنبيه: بصمة نصّ هذا الإصدار في المنصة تختلف عن البصمة المسجَّلة وقت توقيعك — راجع الإدارة."
      );
    }
  } else {
    lines.push("لم تُسجَّل عليك موافقةٌ على هذا الإصدار بعد — هذه نسخة قراءة.");
  }
  lines.push(RULE);

  return lines.join("\n");
}

export async function GET(request: Request) {
  const access = await portalSetupAccess();
  if (!access.ok) return new Response("غير مصرّح", { status: 401 });

  const acceptanceId = new URL(request.url).searchParams.get("a");
  const [settings, history] = await Promise.all([getSettings(), loadSignedAgreements()]);
  const brand = settings.brand.name;

  /* ── (١) نسخةٌ وقّعها هو ──────────────────────────────────────────────── */
  if (acceptanceId) {
    if (history.state !== "ready") {
      return new Response("تعذّرت قراءة نُسخك الموقَّعة الآن — أعد المحاولة", { status: 503 });
    }
    const match = history.signed.find((row) => row.acceptanceId === acceptanceId);
    // ليس من قبولاته ⇒ لا وجودَ له من هذا الطريق. ولا يُقال «ممنوع»: الوجودُ
    // نفسه معلومةٌ عن شريكٍ آخر (D-20).
    if (!match) return new Response("لا نسخة بهذا المعرّف", { status: 404 });

    const body = renderCopy(
      {
        version: match.version,
        title: match.title,
        preamble: match.preamble,
        clauses: match.clauses,
        publishedAt: match.publishedAt,
      },
      brand,
      match
    );
    return textFile(body, `partner-agreement-v${match.version}-signed.txt`);
  }

  /* ── (٢) النسخة السارية ──────────────────────────────────────────────── */
  const current = await loadPortalAgreement();
  if (current.state !== "ready") {
    return new Response("لا اتفاقية سارية الآن", { status: 404 });
  }

  const doc = current.agreement;
  // إن كان قد وقّع الساريةَ نفسها فسجلُّ توقيعه يُلحَق بالنسخة — لا نسختان لشيءٍ واحد
  const signedCurrent =
    history.state === "ready"
      ? (history.signed.find((row) => row.agreementId === doc.versionId) ?? null)
      : null;

  const body = renderCopy(
    {
      version: doc.version,
      title: doc.title,
      preamble: doc.preamble,
      clauses: doc.clauses,
      publishedAt: doc.publishedAt,
    },
    brand,
    signedCurrent
  );
  return textFile(body, `partner-agreement-v${doc.version}.txt`);
}

/**
 * ⚠ **علامةُ الترتيب (BOM) مقصودة**: ملفٌّ عربيٌّ بلا BOM يفتحه مفكرةُ ويندوز
 * القديمة بترميزٍ محلي فيظهر رموزاً — والشريك يقرأ ذلك عطلاً في المنصة لا في
 * محرّره. واسمُ الملف لاتينيٌّ بقصد: الاسم العربي يحتاج ترميز RFC 5987 وتختلف
 * فيه المتصفحات، والمحتوى داخله عربيٌّ على كل حال.
 */
function textFile(body: string, filename: string): Response {
  return new Response(`\uFEFF${body}\n`, {
    status: 200,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}
