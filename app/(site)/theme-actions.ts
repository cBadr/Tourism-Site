"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import {
  THEME_COOKIE,
  THEME_COOKIE_MAX_AGE,
  normalizeThemeChoice,
} from "@/lib/theme";

/**
 * حفظ اختيار الثيم — إجراءُ خادم، ومقصودٌ ألا يكون شيئاً آخر.
 *
 * ── لماذا إجراء خادم لا `onClick` ولا رابط `GET` ────────────────────────────
 *
 * • **لا `onClick`**: الاختيار يجب أن يظهر في **أول بايت** من الطلب التالي،
 *   فمكانُ الحسم الخادم. وكتابة الكوكي من العميل تعني أن أول تصييرةٍ خادمية
 *   بعدها لا تعرف الاختيار — وهو الوميض بعينه، مؤجَّلاً طلبةً واحدة.
 *
 * • **لا رابط `GET`**: تبديل الثيم **تغييرُ حالة** لا تنقّل. ورابطٌ يغيّر حالة
 *   يزحف عليه الزاحف فيبدّل ثيماً لا يراه أحد، ويُخبّئه وسيطٌ أو متصفحٌ فتصير
 *   الضغطة بلا أثر. والنموذج `POST` يقول ما يفعل.
 *
 * • **ويعمل بلا جافاسكربت**: إجراءات الخادم تتحسّن تدريجياً — بلا JS يُرسَل
 *   النموذج إرسالاً كلاسيكياً ويصل نفس الإجراء.
 *
 * ── والقيمة مرشَّحة عند الحدّ ────────────────────────────────────────────────
 *
 * `formData` نصٌّ من الشبكة، و`normalizeThemeChoice` تردّ ما ليس من الثلاث إلى
 * `system`. فلا يُكتب في الكوكي إلا واحدةٌ من ثلاث سلاسل معروفة — وهي نفس
 * السلسلة التي تدخل وسم `<style>` في الغلاف، فالترشيح هنا **حارس حقن** لا
 * تنظيفُ مدخلات.
 */
export async function setThemeChoice(formData: FormData): Promise<void> {
  const raw = formData.get("theme");
  const choice = normalizeThemeChoice(typeof raw === "string" ? raw : null);

  const store = await cookies();

  if (choice === "system") {
    /* «اتبع نظامي» هي **غياب** الاختيار لا اختيارٌ ثالث يُخزَّن. وحذف الكوكي
       يعيد الزائر إلى الحالة الافتراضية تماماً كما لو لم يزر الموقع قط — وهو
       الفرق بين مبدّلٍ ذي ثلاث حالات ومبدّلٍ باتجاه واحد. */
    store.delete(THEME_COOKIE);
  } else {
    store.set(THEME_COOKIE, choice, {
      maxAge: THEME_COOKIE_MAX_AGE,
      path: "/",
      sameSite: "lax",
      /* لا `httpOnly`: لا سرّ هنا، وتفضيلُ قراءةٍ يقرؤه العميل يوماً بلا ضرر.
         و`secure` تُترك للبيئة — `false` على `localhost` وإلا لم يُكتب أصلاً. */
      secure: process.env.NODE_ENV === "production",
    });
  }

  /* الغلاف `app/(site)/layout.tsx` يقرأ الكوكي، فكل صفحةٍ عامة تحمل الاختيار.
     و`"layout"` لا `"page"`: الاختيار يعيش في الغلاف لا في صفحةٍ بعينها. */
  revalidatePath("/", "layout");
}
