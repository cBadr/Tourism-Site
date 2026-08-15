import { ExternalLink, MessageCircle } from "lucide-react";

import { Notice } from "@/components/portal/portal-ui";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  currentPairingCode,
  pairingDeepLink,
  readBotIdentity,
} from "@/lib/notifications/telegram-pairing";
import { cn } from "@/lib/utils";
import { linkTelegram, testTelegram, unlinkTelegram } from "./actions";
import type { PartnerAlertsView } from "./data";

/**
 * بطاقة ربط تليجرام — القناة الوحيدة التي تبلغ متعهداً اليوم.
 *
 * ── لماذا خطوتان لا خطوة؟ ───────────────────────────────────────────────────
 *
 * لأن المتعهد **لا يستطيع أن يعرف معرّف محادثته**: لا يعرضه تطبيق تليجرام في أي
 * شاشة، ولا يوجد إلا داخل تحديثات البوت. فبدل أن نطلب منه رقماً لا يملكه، يفتح
 * رابطاً يحمل رمزه ويضغط «ابدأ»، ثم يعود فنقرأ نحن ضغطته ونلتقط المعرّف.
 *
 * والخطوة الثانية («تحققتُ») ليست تكلّفاً: البوت مضبوطٌ اليوم **بلا ويبهوك**
 * (مقيسٌ من `getWebhookInfo`)، فلا شيء يخطرنا لحظة الضغط — نحن من يسأل. وثمنها
 * نقرةٌ واحدة، ومكسبها أن الميزة تعمل اليوم بلا نشرٍ ولا ضبطٍ جديد على البوت.
 *
 * 🔒 **ولا اسم بوت مكتوب في الكود**: يُقرأ حياً من `getMe`. اسمٌ قديمٌ مكتوب هنا
 * كان سيفتح للمتعهد محادثةً مع لا أحد، وهو يقرأ ذلك عطلاً في المنصة.
 */

export async function TelegramCard({
  view,
  subcontractorId,
}: {
  view: PartnerAlertsView;
  /** ⚠ المعرّف لا الاسم: الرمز يُشتقّ منه، والأسماء تتصادم والمعرّف فريد. */
  subcontractorId: string;
}) {
  const bot = await readBotIdentity();
  const code = currentPairingCode(subcontractorId);

  // المزوّد مطفأ عند المنصة أو تعذّر بلوغ البوت: لا شيء مطلوب من المتعهد، ولا
  // يُعرض له رابطٌ لن يعمل. (وهذا هو وسم «معطّلة من الإدارة» بعينه.)
  if (!bot || !code) {
    return (
      <Notice tone="warning" icon={<MessageCircle className="size-5 shrink-0" />}>
        <p className="font-semibold">ربط تليجرام غير متاح الآن</p>
        <p className="mt-1">
          قناة تليجرام متوقفة عند المنصة مؤقتاً، فلا يمكن إتمام الربط. لا شيء مطلوب منك —
          وستجد زرّ الربط هنا فور عودتها.
        </p>
      </Notice>
    );
  }

  const deepLink = pairingDeepLink(bot.username, code);

  if (view.hasTelegramId) {
    return (
      <Card className="gap-3 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <MessageCircle className="size-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span className="font-heading text-base font-bold">تليجرام مربوط</span>
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">
          محادثتك مع بوت المنصة مسجَّلة، وعروض الرحلات تصلك عليها.
          {view.enabled.telegram ? null : (
            <>
              {" "}
              <b>لكن القناة مطفأة في تفضيلاتك أدناه</b> — فعّلها ليعود الوصول.
            </>
          )}
        </p>

        {/*
          الاختبار ليس ترفاً: الربط يثبت أن المحادثة كانت مفتوحة لحظتها لا أنها
          ما زالت. ومن يحظر البوت يبقى في شاشته «متصل» بينما لا يصله شيء —
          والقاعدة لا تعرف الحظر، فوجهةُ الإرسال عندها قائمة.
        */}
        <div className="flex flex-wrap items-center gap-2">
          <form action={testTelegram}>
            <Button type="submit" variant="outline" size="sm">
              أرسل رسالة تجربة
            </Button>
          </form>
          <form action={unlinkTelegram}>
            <Button type="submit" variant="ghost" size="sm">
              فصل تليجرام
            </Button>
          </form>
        </div>
      </Card>
    );
  }

  return (
    <Card className="gap-3 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <MessageCircle className="size-5 shrink-0 text-primary" />
        <span className="font-heading text-base font-bold">اربط تليجرام — خطوتان</span>
      </div>

      <p className="text-sm leading-relaxed text-muted-foreground">
        لا يظهر معرّف محادثتك في تطبيق تليجرام، فلا نطلبه منك: افتح الرابط واضغط «ابدأ»،
        ثم عُد واضغط «تحققتُ» فنلتقطه نحن.
      </p>

      <ol className="list-decimal space-y-2 ps-5 text-sm leading-relaxed">
        <li>
          افتح محادثة البوت واضغط زر <b>«ابدأ / Start»</b> في أسفل الشاشة.
        </li>
        <li>
          عُد إلى هذه الصفحة واضغط <b>«تحققتُ من الضغط»</b>.
        </li>
      </ol>

      <div className="flex flex-wrap items-center gap-2">
        <a
          href={deepLink}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(buttonVariants({ variant: "default", size: "sm" }))}
        >
          <ExternalLink className="size-4" aria-hidden="true" />
          افتح محادثة البوت
        </a>
        <form action={linkTelegram}>
          <Button type="submit" variant="outline" size="sm">
            تحققتُ من الضغط
          </Button>
        </form>
      </div>

      <p className="text-xs leading-5 text-muted-foreground">
        الرابط يحمل رمزاً خاصاً بك صالحاً نحو ربع ساعة. إن طال بك الوقت فحدّث الصفحة
        ليُولَّد رمزٌ جديد — ولا تشارك الرابط مع أحد، فمن يضغط «ابدأ» به تصله <b>رحلاتك</b>.
      </p>
    </Card>
  );
}
