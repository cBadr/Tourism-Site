/**
 * خريطة الترويسات التي يستقبلها `verifySignature` — ومعها حيلة واحدة موثّقة.
 *
 * واجهة المحوّل في العقد تمرّر `rawBody` و`headers` فقط، بلا عنوان الطلب. وهذا
 * كافٍ لأكثر المزوّدين (Stripe وBinance Pay وNOWPayments كلهم يوقّعون في
 * ترويسة)، لكن Paymob يرسل الـ HMAC في **سلسلة الاستعلام** لا في ترويسة.
 *
 * الحل: المسار يحقن الاستعلام في نفس الخريطة لكل المزوّدين بلا استثناء —
 * `x-webhook-query` تحمل السلسلة كاملة، و`x-query-<الاسم>` تحمل كل وسيط على
 * حدة. هذا ليس تخصيصاً لمزوّد بعينه: التحويل واحد لكل الطلبات، والمحوّل الذي
 * لا يعنيه الاستعلام لا يقرأه أصلاً.
 *
 * أسماء الترويسات كلها **بحروف صغيرة**: `Headers` في الويب غير حساسة للحالة،
 * أما كائن JavaScript فحساس — ومحوّل يقرأ `Stripe-Signature` من كائن مفاتيحه
 * صغيرة يجد `undefined` ويرفض توقيعاً صحيحاً.
 */

export const RAW_QUERY_HEADER = "x-webhook-query";

export const QUERY_HEADER_PREFIX = "x-query-";

/** اسم الترويسة الزائفة لوسيط استعلام — `hmac` ← `x-query-hmac` */
export function queryHeader(name: string): string {
  return `${QUERY_HEADER_PREFIX}${name.toLowerCase()}`;
}

/**
 * ترويسات الطلب + وسائط الاستعلام في خريطة واحدة بمفاتيح صغيرة.
 *
 * الوسيط المكرر يفوز فيه الأول: ‎`?hmac=صحيح&hmac=مزوّر`‎ لا يجوز أن يقلب
 * القراءة إلى القيمة الثانية. وحين تتصادم ترويسة حقيقية مع وسيط استعلام تبقى
 * **الترويسة** هي المُعتمدة — ما أرسله المزوّد في الترويسة أوثق مما يستطيع
 * أي أحد إلحاقه بالعنوان.
 */
export function buildHeaderMap(request: Request): Record<string, string> {
  const map: Record<string, string> = {};

  const url = new URL(request.url);
  const search = url.search.startsWith("?") ? url.search.slice(1) : url.search;
  map[RAW_QUERY_HEADER] = search;

  url.searchParams.forEach((value, key) => {
    const name = queryHeader(key);
    if (map[name] === undefined) map[name] = value;
  });

  request.headers.forEach((value, key) => {
    map[key.toLowerCase()] = value;
  });

  return map;
}

/** قراءة ترويسة بأي من أسماء عدة — أول قيمة غير فارغة */
export function pickHeader(
  headers: Record<string, string>,
  ...names: string[]
): string | null {
  for (const name of names) {
    const value = headers[name.toLowerCase()];
    if (typeof value === "string" && value.trim() !== "") return value.trim();
  }
  return null;
}
