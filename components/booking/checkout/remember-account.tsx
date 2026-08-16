"use client";

import * as React from "react";

import {
  TRANSFER_ACCOUNT_COOKIE,
  TRANSFER_ACCOUNT_COOKIE_MAX_AGE,
  isAccountId,
} from "./transfer-preference";

/**
 * يكتب حساب التحويل المختار في كوكي تفضيلٍ — ن‑٩ (ب-٣).
 *
 * ── لماذا مكوّنٌ بلا DOM يستمع على `document` ───────────────────────────────
 *
 * منتقي الحسابات **بلا جافاسكربت بقرارٍ سابق**: راديو حقيقي وكشفٌ بـ`peer-checked`،
 * فالصفحة تعمل كاملةً لو تعطّل السكربت. وأي `onChange` على تلك المدخلات كان
 * سيحوّلها إلى مكوّن عميل ويهدم ذلك القرار من أجل **تحسينٍ** لا تعتمد عليه أي
 * وظيفة.
 *
 * فالاستماع هنا على `document` بالالتقاط الصاعد، مُرشَّحاً باسم المجموعة وحده.
 * والنتيجة: المنتقي يبقى خادمياً بالكامل، وهذا الملف يضيف **صفر عنصر** إلى
 * الشجرة (‏يعيد `null`) ولا يشارك في أي إعادة تصيير.
 *
 * ⚠ **وتعطّله لا يُفقد شيئاً**: بلا سكربت لا تُكتب الكوكي، فيبدأ الاختيار على
 *   الأول (الأرخص). أي أن هذا الملف **تحسينٌ تدريجي بحرفه**.
 *
 * 🔒 وما يُكتب `uuid` حسابٍ من حساباتنا — لا رقم محفظة ولا مبلغ ولا توكن؛
 *    و`SameSite=Lax` كي لا تُرسَل مع طلبات موقعٍ آخر، و`Secure` حيث يوجد HTTPS
 *    (‏تُترك على `http://localhost` وإلا رفضها المتصفح فسقط التذكّر في التطوير).
 */
export function RememberTransferAccount({ groupName }: { groupName: string }) {
  React.useEffect(() => {
    function handleChange(event: Event) {
      const target = event.target as HTMLInputElement | null;
      if (!target || target.name !== groupName || !target.checked) return;

      const id = target.value;
      // شكل المعرّف يُفحص هنا كذلك: الكاتب والقارئ يفحصان، والقاعدة تحكم
      if (!isAccountId(id)) return;

      const secure = window.location.protocol === "https:" ? "; Secure" : "";
      document.cookie =
        `${TRANSFER_ACCOUNT_COOKIE}=${id}; Path=/; Max-Age=${TRANSFER_ACCOUNT_COOKIE_MAX_AGE}` +
        `; SameSite=Lax${secure}`;
    }

    document.addEventListener("change", handleChange);
    return () => document.removeEventListener("change", handleChange);
  }, [groupName]);

  return null;
}
