import Link from "next/link";
import { BellOff, BellRing, PlugZap, Settings2 } from "lucide-react";

import { Notice } from "@/components/portal/portal-ui";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PARTNER_CHANNELS, type PartnerChannel } from "@/lib/partner-alerts-types";
import { cn } from "@/lib/utils";
/**
 * 🔴 من الوحدة المحيّدة `channel-meta.ts` لا من `channels-form.tsx`.
 *
 * هذا مكوّنٌ **خادميّ**، و`channels-form.tsx` يبدأ بـ`"use client"`. وقيمةٌ
 * تُصدَّر من وحدة عميل لا تعبر إلى الخادم: ما يراه الخادم مرجعُ عميل لا الكائن،
 * فيرمي `STATE_LABELS[state]` ويُسقط الصفحة بـ٥٠٠ — وهو العيبُ المقيس الذي بيّض
 * `/portal/notifications` في 2026-08-17 (القسم ٥ في `LESSONS.md`).
 */
import { channelLabel, STATE_LABELS, STATE_TONE } from "../../notifications/channel-meta";
import { loadPartnerAlerts } from "../../notifications/data";

/**
 * قسمُ «قنوات التنبيه» داخل ملف المستخدم — **حالةٌ كاملة هنا، والتحرير بنقرة.**
 *
 * ── لماذا حالةٌ لا محرِّر ───────────────────────────────────────────────────
 *
 * طلب المالك (2026-08-19) أن تكون إعدادات القنوات «داخل إعدادات حساب المتعهد من
 * الـ user profile». والمنفّذ هنا شقُّه الذي **يعمل اليوم بلا كسر**: كلُّ ما يحتاج
 * الشريك أن يعرفه معروضٌ في «حسابي» — أمتصلٌ هو أم لا، وبأي قناة، وما ينقص — ثم
 * زرٌّ واحد إلى محرّر القنوات.
 *
 * ⚠ **والسبب مكتوبٌ لأنه ليس ذوقاً**: `ChannelsForm` و`TelegramCard` يستوردان
 * أفعالَهما من `app/portal/notifications/actions.ts` بأسمائها، وتلك الأفعال
 * تنتهي بـ`redirect('/portal/notifications?…')` **مكتوباً في ملفها**. فتركيبُ
 * النموذجين هنا كان يُنتج شاشةً تحفظ ثم تقذف الشريك إلى صفحةٍ أخرى، أو نسخةً
 * ثانية من الأفعال على نفس دالة القاعدة (نقضُ القاعدة الذهبية ١٢). وذلك الملف
 * **خارج نطاق هذه الجبهة فلا يُحرَّر**، والتوصية بسطرٍ واحد فيه مكتوبةٌ في تقرير
 * الجبهة: تُغيَّر وجهةُ `url()` إلى `/portal/profile?…#channels`، فينتقل المحرّر
 * كاملاً إلى هنا بلا سطرٍ مكرَّر.
 *
 * ولا يُعاد اشتقاق الحالة هنا بحرف: `reachable/willing` تصلان من
 * `partner_availability()` — نفسِ الدالة التي يقرؤها حوض البثّ. وشاشةٌ تقول
 * «متصل» وحوضٌ يتخطّاه هو النمط ٢ في `LESSONS.md` بصيغته الأخطر.
 */
export async function ChannelsSummary() {
  const result = await loadPartnerAlerts();

  const editLink = (
    <Link href="/portal/notifications" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
      <Settings2 aria-hidden="true" />
      إدارة قنوات التنبيه
    </Link>
  );

  if (result.state === "hidden") {
    return (
      <Notice tone="warning">
        <p className="font-semibold">قنوات التنبيه غير متاحة بعد</p>
        <p>جداول التنبيهات لم تُنشأ على الخادم حتى الآن — لا شيء مطلوب منك.</p>
      </Notice>
    );
  }

  if (result.state === "failed") {
    return (
      <Notice tone="warning">
        <p className="font-semibold">تعذّر قراءة حالة قنواتك</p>
        <p>
          حدّث الصفحة. إن تكرّر الأمر فراسل الإدارة — ولا تعتمد على وصول العروض حتى تتأكد.
        </p>
        <p className="pt-2">{editLink}</p>
      </Notice>
    );
  }

  const view = result.view;

  return (
    <div className="space-y-4">
      {/* ── الحالة أولاً: أمتصلٌ هو أم يُتخطّى ─────────────────────────── */}
      {!view.reachable ? (
        <Notice tone="danger" icon={<BellOff className="size-5 shrink-0" />}>
          <p className="font-semibold">أنت غير متصل</p>
          <p>
            لا قناة واحدة تستطيع أن تبلغك بعرض رحلة، فتوزيع الرحلات <b>يتخطّاك</b>. ولا يظهر
            لك شيء حين يقع ذلك — العروض تذهب إلى غيرك بصمت.
          </p>
        </Notice>
      ) : !view.willing ? (
        <Notice tone="warning" icon={<PlugZap className="size-5 shrink-0" />}>
          <p className="font-semibold">أوقفتَ استقبال الطلبات</p>
          <p>
            قنواتك تعمل، لكنك أوقفتَ الاستقبال بنفسك — فلا يصلك عرض جديد حتى تعيد العلامة
            في محرّر القنوات.
          </p>
        </Notice>
      ) : (
        <Notice tone="success" icon={<BellRing className="size-5 shrink-0" />}>
          <p className="font-semibold">أنت متاح لاستقبال الرحلات</p>
          <p>
            تصلك عروض الرحلات على:{" "}
            <b>
              {(view.reachingChannels as PartnerChannel[])
                .map((channel) => channelLabel(channel))
                .join(" · ")}
            </b>
            .
          </p>
        </Notice>
      )}

      {/* ── وسمُ كل قناة كما قاسته القاعدة ─────────────────────────────── */}
      <Card className="gap-3 p-5">
        <ul className="space-y-2">
          {PARTNER_CHANNELS.map((channel) => (
            <li key={channel} className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium">{channelLabel(channel)}</span>
              <span
                className={cn(
                  "inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
                  STATE_TONE[view.channels[channel]]
                )}
              >
                {STATE_LABELS[view.channels[channel]]}
              </span>
            </li>
          ))}
        </ul>

        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
          {editLink}
          <span className="text-xs leading-5 text-muted-foreground">
            الربط والإطفاء ومفتاح «أستقبل طلبات الرحلات» — كلها من هناك، وأثر كل اختيار
            يُعرض قبل الحفظ.
          </span>
        </div>
      </Card>
    </div>
  );
}
