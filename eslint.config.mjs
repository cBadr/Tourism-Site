import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * بناة روابط الهاتف — الملفان الوحيدان المسموح لهما بتركيب `wa.me/…` و`tel:…`.
 *
 * `lib/phone.ts` ورقةٌ بلا استيراد يبني الرابطين بالقواعد الأربع (`waLink`
 * و`telLink`)، و`components/site/links.ts` غلافُها العام الذي يحافظ على عقد
 * `string` لمناديه الستة. وما عداهما يستورد الباني ولا يركّب عنواناً بيده.
 */
const PHONE_LINK_BUILDERS = ["lib/phone.ts", "components/site/links.ts"];

/**
 * لماذا قاعدة لِنت لا مراجعة بشرية؟
 *
 * لأن المراجعة البشرية جُرِّبت وسقطت هنا بالذات: `waNumber` وُضعت في
 * `lib/phone.ts` وأُصلح بها `waHref`، ثم بقيت **أربع** شاشات تبني
 * `https://wa.me/${digits}` بيدها بنزع الرموز — بطاقة العميل في بوابة المتعهد،
 * وتفاصيل الطلب، وملف المتعهد، وطلبات عروض الأسعار. أي أن الإصلاح لم يُعمَّم
 * لأنه لم يكن هناك ما يمنع النسخة الخامسة.
 *
 * والقاعدة تُمسك التركيب في موضعه: قالبٌ نصّي ينتهي بـ`wa.me/` أو `tel:` قبل
 * الاستبدال مباشرةً (وكذلك الضمّ بـ`+`). وهي لا تمسّ `waShareHref` لأن قالبه
 * `wa.me/?text=` — لا ينتهي بالشرطة، ولا رقم فيه أصلاً.
 *
 * ولا تكفي هذه القاعدة وحدها ضماناً: عيبُ الرمز ذي الخانة الواحدة
 * (`2${phone.slice(1)}` بدل `20…`) لا يمرّ بقالب `wa.me` فلا تراه — الحارس ضدّه
 * أن يبقى بناء الرقم في `lib/phone.ts` وحدها.
 */
const restrictedPhoneLinks = [
  {
    selector: 'TemplateLiteral:has(TemplateElement[value.raw=/wa\\.me\\/$/])',
    message:
      "لا تبنِ رابط wa.me بيدك — استورد waLink من @/lib/phone. الرقم المخزَّن محليٌّ (01010000506) ونزع الرموز وحده يفتح «الرقم غير صالح».",
  },
  {
    selector: 'BinaryExpression[operator="+"][left.value=/wa\\.me\\/$/]',
    message:
      "لا تبنِ رابط wa.me بيدك — استورد waLink من @/lib/phone. الرقم المخزَّن محليٌّ (01010000506) ونزع الرموز وحده يفتح «الرقم غير صالح».",
  },
  {
    selector: 'TemplateLiteral:has(TemplateElement[value.raw=/^tel:$/])',
    message:
      "لا تبنِ رابط tel: بيدك — استورد telLink من @/lib/phone. الرقم المحلي يطلب من داخل مصر ويفشل صامتاً على شريحة أجنبية، وهو مخالف لـRFC 3966 بلا phone-context.",
  },
  {
    selector: 'BinaryExpression[operator="+"][left.value=/^tel:$/]',
    message:
      "لا تبنِ رابط tel: بيدك — استورد telLink من @/lib/phone. الرقم المحلي يطلب من داخل مصر ويفشل صامتاً على شريحة أجنبية، وهو مخالف لـRFC 3966 بلا phone-context.",
  },
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    name: "tours/phone-links",
    rules: { "no-restricted-syntax": ["error", ...restrictedPhoneLinks] },
  },
  {
    name: "tours/phone-links-builders",
    files: PHONE_LINK_BUILDERS,
    rules: { "no-restricted-syntax": "off" },
  },
]);

export default eslintConfig;
