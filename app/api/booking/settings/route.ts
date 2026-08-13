import { getSettings } from "@/lib/settings";
import { readPaymentSettings } from "@/components/booking/checkout/payment";

/**
 * GET /api/booking/settings — قواعد الدفع المعروضة في خطوة «الدفع» داخل الحاسبة.
 *
 * لماذا مسار بدل تمرير الإعدادات كخاصية؟ نموذج الحجز يعيش داخل ويدجت العميل
 * (search-widget ← offers) الذي يُركَّب في أكثر من صفحة خادمية، فقراءة القاعدة
 * من مكان واحد هنا أبسط من تمريرها عبر كل شجرة استدعاء — ويبقى انضباط الـ
 * whitelabel قائماً: لا نسبة ولا مبلغ ولا نص مكتوب في كود الواجهة.
 *
 * ما يُرجَع قواعد عرض فقط (نسبة العربون وحده الأدنى ونص التعليمات)؛ المبالغ
 * المُلزِمة تُحسب في Postgres داخل create_booking ولا تُؤخذ من هنا إطلاقاً.
 */

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET() {
  const settings = await getSettings();
  const payment = readPaymentSettings(settings);

  return Response.json(
    {
      ok: true as const,
      depositPercent: payment.depositPercent,
      depositMinAmount: payment.depositMinAmount,
      transferInstructions: payment.transferInstructions,
    },
    { headers: NO_STORE }
  );
}
