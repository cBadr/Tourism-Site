import { Inbox, Mail, MessageCircle, Smartphone, type LucideIcon } from "lucide-react";

import type { PartnerChannel } from "@/lib/partner-alerts-types";
import type { ChannelState } from "./data";

/**
 * تسميات القنوات وحالاتها — **وحدةٌ محيّدة، بلا `"use client"` وبلا `server-only`**.
 *
 * ── 🔴 ولماذا انتُزعت من `channels-form.tsx`؟ عيبٌ مقيس أسقط الشاشة ───────────
 *
 * كانت `CHANNEL_META` مُصدَّرة من `channels-form.tsx`، وهو ملفٌّ يبدأ بـ
 * `"use client"`. وصفحةُ `page.tsx` **خادمية** وكانت تستوردها منه — وهذا لا يعمل
 * ولا يفشل في البناء:
 *
 * قيمةٌ تُصدَّر من وحدة `"use client"` لا تعبر إلى الخادم أصلاً. ما يراه الخادم
 * **مرجعُ عميل** (client reference) لا الكائن. مقيسٌ من مسار حيّ على الخادم
 * (2026-08-17):
 *
 *     typeof CHANNEL_META            → "function"
 *     Object.getOwnPropertyNames(…)  → ["length","name","prototype","$$typeof","$$id","$$async"]
 *     CHANNEL_META.telegram          → undefined
 *
 * فـ`CHANNEL_META[channel].label` في مكوّنٍ خادمي ترمي
 * `TypeError: Cannot read properties of undefined (reading 'label')` — أي **٥٠٠
 * على `/portal/notifications`**: شاشةٌ بيضاء للشريك، لا رسالةَ خطأ ولا بطاقة.
 *
 * ── وما جعله ينفجر **بعد ربط تليجرام بالذات** ───────────────────────────────
 *
 * السطر الذي يقرؤها في الصفحة يقع في فرع «أنت متاح» من `AvailabilityCard` —
 * ولا يُصيَّر إلا حين `reachable && willing`. وقبل أول ارتباطٍ كان **كل** متعهد
 * غير بالغ (صفر معرّف تليجرام · لا مزوّد بريد · لا اشتراك دفع)، فيُصيَّر فرعُ
 * «غير متصل» وحده ولا يمسّ `CHANNEL_META` أبداً — لأن الموضع الآخر فيه
 * (`missingSteps`) لا يُقرأ إلا لقناةٍ **أطفأها** الشريك، والافتراضات كلها مفعَّلة.
 *
 * فالعيب كان نائماً في الكود منذ كُتبت الشاشة، **وأول متعهدٍ يربط تليجرامه هو من
 * يوقظه** — وهذا حرفياً ما وصفه المالك: «انهيار النظام بعد ربط التليجرام الخاص
 * بالمتعهد».
 *
 * ── والقاعدة المستفادة، مكتوبةً حيث تُقرأ ───────────────────────────────────
 *
 * 🔒 **ما يقرؤه الخادم والعميل معاً يعيش في وحدةٍ محيّدة.** لا `"use client"`
 * (فلا يعبر إلى الخادم) ولا `server-only` (فلا يعبر إلى العميل). والمكوّنات تبقى
 * في ملفّها العميل، والبيانات هنا — فيقرؤها الطرفان من **نسخةٍ واحدة**.
 */

/* ------------------------------------------------------------------ */
/* تسمية القناة وما تفعله                                              */
/* ------------------------------------------------------------------ */

export const CHANNEL_META: Record<
  PartnerChannel,
  { label: string; icon: LucideIcon; what: string; href?: "/portal/inbox"; hrefLabel?: string }
> = {
  telegram: {
    label: "تليجرام",
    icon: MessageCircle,
    what: "رسالة فورية على هاتفك بكل عرض رحلة — وهي أسرع القنوات وأقلها كلفة عليك.",
  },
  webpush: {
    label: "إشعارات المتصفح",
    icon: Smartphone,
    what: "تنبيه من المتصفح على الجهاز الذي تسجّله، ولو كانت الصفحة مغلقة.",
  },
  inbox: {
    label: "صندوق البورتال",
    icon: Inbox,
    what: "سجلٌّ لكل ما أُرسل إليك داخل هذه المنصة — للمراجعة والرجوع.",
    href: "/portal/inbox",
    hrefLabel: "افتح الصندوق",
  },
  email: {
    label: "البريد الإلكتروني",
    icon: Mail,
    what: "نسخة من العرض على بريدك المسجَّل في ملفك.",
  },
};

/**
 * التسمية بقراءةٍ **لا ترمي أبداً**.
 *
 * ولماذا لا تُقرأ `CHANNEL_META[channel].label` مباشرةً بعد أن زال سبب العيب؟
 * لأن الثمن غير متكافئ: قناةٌ لا تسميةَ لها تستحق كلمةً باهتة، **ولا تستحق ٥٠٠
 * على الشاشة التي تقول للشريك إن كان يصله عمل أم لا**. والشاشة التي تشرح انقطاعَه
 * هي آخر ما يجوز أن ينقطع.
 *
 * ⚠ وهذا **ليس بديلاً عن الإصلاح** — الوحدة المحيّدة أعلاه هي الإصلاح. هذه
 * الدالة سقفٌ للضرر لو أعاد ريفاكتورٌ لاحق نقلَ الملف خلف حدود العميل.
 */
export function channelLabel(channel: PartnerChannel): string {
  return CHANNEL_META[channel]?.label ?? channel;
}

/* ------------------------------------------------------------------ */
/* أوسمة الحالة                                                        */
/* ------------------------------------------------------------------ */

export const STATE_LABELS: Record<ChannelState, string> = {
  reaching: "متصلة",
  "logged-only": "تسجيل فقط",
  "needs-link": "غير مربوطة",
  "provider-dark": "معطّلة من الإدارة",
  off: "مطفأة",
};

export const STATE_TONE: Record<ChannelState, string> = {
  reaching: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100",
  "logged-only": "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-100",
  "needs-link": "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-100",
  "provider-dark": "bg-muted text-muted-foreground",
  off: "bg-muted text-muted-foreground",
};

/** ما يقوله كل وسم بلغة الفعل: ما المطلوب منك، أو أنه لا مطلوب. */
export const STATE_HINT: Record<ChannelState, string> = {
  reaching: "تصلك عليها عروض الرحلات الآن.",
  "logged-only":
    "تُسجَّل لك هنا ولا تنبّهك — ولذلك لا تُحسب قناةً تبلغك، ولا تكفي وحدها لتكون متصلاً.",
  "needs-link": "مفعَّلة وينقصها ربطٌ من طرفك — اتبع الخطوات أدناه.",
  "provider-dark":
    "مفعَّلة عندك ومتوقفة عند المنصة — لا شيء مطلوب منك، ولا تُحسب في حالتك حتى تعمل.",
  off: "أطفأتَها، فلا يصلك عليها شيء.",
};
