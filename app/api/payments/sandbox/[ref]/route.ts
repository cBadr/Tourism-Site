import { minorToDecimalString } from "@/lib/payments/amount";
import { isPaymentProviderError } from "@/lib/payments/errors";
import {
  TEST_SIGNATURE_HEADER,
  buildTestEvent,
  signTestBody,
  verifySandboxLink,
  type SandboxLink,
} from "@/lib/payments/providers/test";

/**
 * صفحة الدفع الوهمية للمزوّد الاختباري — «موقع البوابة» في سلسلتنا.
 *
 * ما الذي يجعلها ضرورية: بلا حساب بوابة واحد، الطريقة الوحيدة لإثبات أن
 * المرحلة تعمل هي أن يوجد طرف يفعل ما يفعله المزوّد بالضبط — يعرض المبلغ،
 * ينتظر قرار الإنسان، ثم يرسل من خادمه إلى خادمنا حدثاً **موقّعاً**. هذا هو.
 *
 *   GET  ← يعرض المبلغ وزرَّي «نجحت الدفعة» و«فشلت».
 *   POST ← يبني الحدث، يوقّعه، ويرسله إلى /api/payments/webhook/test عبر HTTP
 *          حقيقي (لا استدعاء داخلي)، ثم يعيد المتصفح إلى صفحة العودة.
 *
 * ── لماذا لا تكون هذه الصفحة ثغرة ────────────────────────────────────────
 * كل وسائطها موقّعة بـ HMAC في الرابط الذي أنشأه `createIntent` وحده. من يكتب
 * `?amount=1` في شريط العنوان يفسد التوقيع فيُرفض. ومن لا يملك السرّ لا يستطيع
 * توليد رابط أصلاً. وفي الإنتاج بلا `NOTIFY_DISPATCH_KEY` يرفض المزوّد
 * الاختباري العمل كلياً لأن سرّه حينها معلوم للجميع.
 *
 * وجهة الـ webhook مقيّدة بأصل موقعنا: بدون ذلك يصير المسار آلة توقيع تُرسل
 * أجساماً موقّعة بسرّنا إلى أي عنوان يكتبه صاحب الرابط.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

const HTML_HEADERS = { "Content-Type": "text/html; charset=utf-8", ...NO_STORE };

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

type Parsed =
  | { ok: true; link: SandboxLink }
  | { ok: false; status: number; title: string; detail: string };

/** قراءة الرابط والتحقق من توقيعه — نفس المنطق في العرض وفي التنفيذ */
function parseLink(request: Request, ref: string): Parsed {
  const url = new URL(request.url);
  const amount = Number(url.searchParams.get("amount"));
  const currency = (url.searchParams.get("currency") ?? "").trim();
  const returnUrl = url.searchParams.get("return") ?? "";
  const webhookUrl = url.searchParams.get("webhook") ?? "";
  const signature = url.searchParams.get("sig") ?? "";

  if (ref.trim() === "" || !Number.isFinite(amount) || currency === "" || returnUrl === "" || webhookUrl === "") {
    return { ok: false, status: 400, title: "رابط ناقص", detail: "بيانات جلسة الدفع غير مكتملة." };
  }

  // وجهتا الإعادة والإشعار من نطاقنا حصراً
  const origin = url.origin;
  for (const target of [returnUrl, webhookUrl]) {
    try {
      if (new URL(target).origin !== origin) {
        return {
          ok: false,
          status: 400,
          title: "وجهة غير مسموحة",
          detail: "روابط العودة والإشعار يجب أن تكون على نفس الموقع.",
        };
      }
    } catch {
      return { ok: false, status: 400, title: "رابط غير صالح", detail: "تعذّر تحليل وجهة الرابط." };
    }
  }

  const link: SandboxLink = {
    ref,
    amountMinor: Math.round(amount),
    currency,
    returnUrl,
    webhookUrl,
  };

  try {
    if (!verifySandboxLink(link, signature)) {
      return {
        ok: false,
        status: 403,
        title: "توقيع غير صحيح",
        detail: "هذا الرابط لم يُنشئه النظام، أو عُدّلت وسائطه.",
      };
    }
  } catch (err) {
    if (isPaymentProviderError(err) && err.code === "not-configured") {
      return {
        ok: false,
        status: 503,
        title: "المزوّد الاختباري مقفل",
        detail:
          "في بيئة الإنتاج يجب ضبط NOTIFY_DISPATCH_KEY حتى يعمل المزوّد الاختباري — " +
          "بدونه يكون سرّ التوقيع معلوماً للجميع.",
      };
    }
    throw err;
  }

  return { ok: true, link };
}

function page(body: string, status = 200): Response {
  return new Response(
    `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>بوابة الدفع التجريبية</title>
<style>
  :root { color-scheme: light dark; }
  body { margin:0; min-height:100vh; display:grid; place-items:center;
         font-family: system-ui, "Segoe UI", Tahoma, sans-serif; background:#0f172a; color:#e2e8f0; padding:24px; }
  .card { width:min(460px, 100%); background:#1e293b; border:1px solid #334155; border-radius:16px; padding:28px; }
  h1 { font-size:1.15rem; margin:0 0 4px; }
  .muted { color:#94a3b8; font-size:.85rem; margin:0 0 20px; line-height:1.7; }
  .amount { font-size:2rem; font-weight:700; letter-spacing:-.02em; margin:18px 0 4px; }
  dl { display:grid; grid-template-columns:auto 1fr; gap:6px 12px; font-size:.85rem; margin:18px 0 24px; }
  dt { color:#94a3b8; } dd { margin:0; word-break:break-all; }
  form { display:flex; gap:10px; flex-wrap:wrap; }
  button { flex:1 1 140px; padding:12px 16px; border-radius:10px; border:0; font-size:.95rem;
           font-weight:600; cursor:pointer; font-family:inherit; }
  .ok { background:#16a34a; color:#fff; } .no { background:#334155; color:#e2e8f0; }
  .err { background:#7f1d1d; border:1px solid #b91c1c; border-radius:10px; padding:14px; margin:0 0 16px; }
  pre { white-space:pre-wrap; word-break:break-all; font-size:.75rem; color:#cbd5e1;
        background:#0f172a; border-radius:8px; padding:12px; max-height:220px; overflow:auto; }
  a { color:#7dd3fc; }
</style></head><body><main class="card">${body}</main></body></html>`,
    { status, headers: HTML_HEADERS }
  );
}

function errorPage(status: number, title: string, detail: string): Response {
  return page(
    `<h1>${escapeHtml(title)}</h1><p class="muted">${escapeHtml(detail)}</p>`,
    status
  );
}

export async function GET(
  request: Request,
  context: { params: Promise<{ ref: string }> }
): Promise<Response> {
  const { ref } = await context.params;
  // بلا فك ترميز ثانٍ: Next يفك مقاطع المسار بنفسه، وفكّه مرتين يشوّه مرجعاً
  // يحوي محرفاً مرمَّزاً فينكسر التوقيع بلا سبب ظاهر.
  const parsed = parseLink(request, ref);
  if (!parsed.ok) return errorPage(parsed.status, parsed.title, parsed.detail);

  const { link } = parsed;
  const action = escapeHtml(new URL(request.url).pathname + new URL(request.url).search);

  return page(`
    <h1>بوابة الدفع التجريبية</h1>
    <p class="muted">
      هذه ليست صفحة دفع حقيقية. اضغط ما تريد اختباره فيُرسَل إلى نظامنا إشعار
      <code>webhook</code> موقّعاً تماماً كما ترسله بوابة حقيقية.
      الضغط على «نجحت» مرتين يعيد <strong>الحدث نفسه</strong> — وهكذا تُختبر حماية التكرار.
    </p>
    <div class="amount">${escapeHtml(minorToDecimalString(link.amountMinor, link.currency))} ${escapeHtml(link.currency)}</div>
    <dl>
      <dt>المرجع</dt><dd>${escapeHtml(link.ref)}</dd>
      <dt>الوحدات الصغرى</dt><dd>${escapeHtml(String(link.amountMinor))}</dd>
    </dl>
    <form method="post" action="${action}">
      <button class="ok" name="choice" value="succeeded" type="submit">نجحت الدفعة</button>
      <button class="no" name="choice" value="failed" type="submit">فشلت الدفعة</button>
    </form>
  `);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ ref: string }> }
): Promise<Response> {
  const { ref } = await context.params;
  // بلا فك ترميز ثانٍ: Next يفك مقاطع المسار بنفسه، وفكّه مرتين يشوّه مرجعاً
  // يحوي محرفاً مرمَّزاً فينكسر التوقيع بلا سبب ظاهر.
  const parsed = parseLink(request, ref);
  if (!parsed.ok) return errorPage(parsed.status, parsed.title, parsed.detail);

  const { link } = parsed;

  let choice = "succeeded";
  try {
    const form = await request.formData();
    choice = String(form.get("choice") ?? "succeeded");
  } catch {
    choice = "succeeded";
  }
  const status: "succeeded" | "failed" = choice === "failed" ? "failed" : "succeeded";

  const body = JSON.stringify(
    buildTestEvent({
      ref: link.ref,
      status,
      amountMinor: link.amountMinor,
      currency: link.currency,
    })
  );

  // الإرسال عبر HTTP حقيقي إلى نقطة النهاية نفسها التي يستدعيها مزوّد حقيقي —
  // لا استدعاء دالة داخلي. أي عطب في التوجيه أو الترويسات يظهر هنا لا في الإنتاج.
  let response: Response;
  try {
    response = await fetch(link.webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [TEST_SIGNATURE_HEADER]: signTestBody(body),
      },
      body,
      cache: "no-store",
    });
  } catch (err) {
    return errorPage(
      502,
      "تعذّر إرسال الإشعار",
      err instanceof Error ? err.message : "خطأ غير متوقع أثناء نداء نقطة الاستقبال."
    );
  }

  if (!response.ok) {
    const text = (await response.text()).slice(0, 1200);
    return page(
      `<h1>رفض نظامنا الإشعار</h1>
       <div class="err">استجابة نقطة الاستقبال: <strong>${response.status}</strong></div>
       <p class="muted">هذا خطأ حقيقي في السلسلة يستحق التحقيق — لم يُؤكَّد الحجز.</p>
       <pre>${escapeHtml(text)}</pre>
       <p class="muted"><a href="${escapeHtml(link.returnUrl)}">متابعة الحجز</a></p>`,
      502
    );
  }

  // ٣٠٣ يحوّل إعادة الإرسال إلى GET، فلا يعيد المتصفح إرسال النموذج عند التحديث
  return Response.redirect(link.returnUrl, 303);
}
