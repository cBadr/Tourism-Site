import { portalSetupAccess } from "../../_lib/session";
import { csvTemplate } from "../_lib/csv";
import { loadCoveredClasses } from "../_lib/sheets";

/**
 * قالب CSV لاستيراد المسارات — يُبنى لكل متعهد بفئاته هو.
 *
 * 🔴 لماذا مسار ديناميكي لا ملفاً ثابتاً في `public/`: أعمدة الأسعار هي **فئات
 * أسطول هذا المتعهد** (ملاحظة المالك ٥)، فقالبٌ ثابت يسأله عن سيدان لا يملكها.
 * والمصدر هو `price_sheet_classes` نفسها التي تبني شاشة التسعير — تعريف واحد.
 *
 * لا تخزين مؤقت: الأسطول يتغيّر من شاشة «أسطولي» ويجب أن ينعكس في القالب فوراً.
 */
export async function GET() {
  const access = await portalSetupAccess();
  if (!access.ok) {
    return new Response("غير مصرّح", { status: 401 });
  }

  const { classes, ready } = await loadCoveredClasses(access.supabase);
  if (!ready) {
    return new Response("قوائم الأسعار غير جاهزة بعد على هذه القاعدة", { status: 503 });
  }

  const body = csvTemplate(classes);
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="price-routes-template.csv"',
      "cache-control": "no-store",
    },
  });
}
