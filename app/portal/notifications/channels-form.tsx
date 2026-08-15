"use client";

import { useState } from "react";
import Link from "next/link";
import { Inbox, Mail, MessageCircle, Smartphone, type LucideIcon } from "lucide-react";

import { Notice } from "@/components/portal/portal-ui";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { REACHING_CHANNELS, type PartnerChannel } from "@/lib/partner-alerts-types";
import { saveAlertPrefs } from "./actions";
import type { ChannelState, PartnerAlertsView } from "./data";

/**
 * نموذج القنوات ومفتاح الاستقبال.
 *
 * ── لماذا هذا النموذج عميلٌ لا خادم؟ ────────────────────────────────────────
 *
 * لسببٍ واحد يستحقه: **أثر الاختيار يُعرض قبل وقوعه**. القرار المحسوم مع المالك
 * أن إطفاء كل القنوات البالغة = **غير متصل**، لا «متصلٌ بلا إشعارات» — ونصُّ
 * الموجز أن المتعهد يجب ألّا يكتشف ذلك **بفقد عمل**. فلو كان النموذج خادمياً
 * محضاً لقرأ الأثر بعد الحفظ، وهو بالضبط ما مُنع.
 *
 * والتنبؤ هنا **يعيد قاعدة القاعدة لا يخترع قاعدة**: القناة تبلغ إذا كانت
 * مفعَّلة × لك عنوان عليها × مزوّدها يعمل — وهي الشروط الثلاثة نفسها في
 * `partner_channels()` (هجرة 0054). و`inbox` خارج الحساب كما هي خارجه هناك:
 * صندوقٌ يستلزم أن تنظر ليس بلوغاً.
 *
 * ⚠ والتنبؤ **لا يحلّ محل القاعدة**: بعد الحفظ تُعاد قراءة الحالة من
 * `portal_alert_prefs()`، والوسم المعروض بجوار كل قناة من هناك دائماً.
 */

/* ------------------------------------------------------------------ */
/* التسميات — يقرؤها هذا النموذج والصفحة معاً                           */
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

export const STATE_LABELS: Record<ChannelState, string> = {
  reaching: "متصلة",
  "logged-only": "تسجيل فقط",
  "needs-link": "غير مربوطة",
  "provider-dark": "معطّلة من الإدارة",
  off: "مطفأة",
};

const STATE_TONE: Record<ChannelState, string> = {
  reaching:
    "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100",
  "logged-only": "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-100",
  "needs-link": "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-100",
  "provider-dark": "bg-muted text-muted-foreground",
  off: "bg-muted text-muted-foreground",
};

/** ما يقوله كل وسم بلغة الفعل: ما المطلوب منك، أو أنه لا مطلوب. */
const STATE_HINT: Record<ChannelState, string> = {
  reaching: "تصلك عليها عروض الرحلات الآن.",
  "logged-only":
    "تُسجَّل لك هنا ولا تنبّهك — ولذلك لا تُحسب قناةً تبلغك، ولا تكفي وحدها لتكون متصلاً.",
  "needs-link": "مفعَّلة وينقصها ربطٌ من طرفك — اتبع الخطوات أدناه.",
  "provider-dark":
    "مفعَّلة عندك ومتوقفة عند المنصة — لا شيء مطلوب منك، ولا تُحسب في حالتك حتى تعمل.",
  off: "أطفأتَها، فلا يصلك عليها شيء.",
};

export function ChannelStateBadge({ state }: { state: ChannelState }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATE_TONE[state]}`}
    >
      {STATE_LABELS[state]}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* النموذج                                                             */
/* ------------------------------------------------------------------ */

export function ChannelsForm({ view }: { view: PartnerAlertsView }) {
  const [enabled, setEnabled] = useState<Record<PartnerChannel, boolean>>(view.enabled);
  const [accepting, setAccepting] = useState<boolean>(view.accepting);

  /** الشروط الثلاثة نفسها التي في `partner_channels()` — لا رابعَ لها */
  const willReach = (channel: PartnerChannel) =>
    enabled[channel] && view.hasAddress[channel] && view.providerOk[channel];

  const reachingNow = REACHING_CHANNELS.filter((channel) => willReach(channel));
  // الإتاحة = بالغٌ × راغب. والفرعان معروضان منفصلين لأن علاجهما مختلف تماماً.
  const reachable = reachingNow.length > 0;

  const dirty =
    accepting !== view.accepting ||
    (Object.keys(enabled) as PartnerChannel[]).some((c) => enabled[c] !== view.enabled[c]);

  return (
    <form action={saveAlertPrefs} className="space-y-4">
      <div className="space-y-3">
        {(Object.keys(CHANNEL_META) as PartnerChannel[]).map((channel) => {
          const meta = CHANNEL_META[channel];
          const Icon = meta.icon;
          // الوسم من القاعدة (الحالة المحفوظة)، والسطر تحته من التنبؤ (لو حفظتَ الآن)
          const saved = view.channels[channel];
          const changed = enabled[channel] !== view.enabled[channel];

          return (
            <Card key={channel} className="gap-2 p-4">
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  name={channel}
                  checked={enabled[channel]}
                  onChange={(e) =>
                    setEnabled((prev) => ({ ...prev, [channel]: e.target.checked }))
                  }
                  className="mt-1 size-4 shrink-0 accent-primary"
                />
                <span className="min-w-0 flex-1 space-y-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <Icon className="size-4 shrink-0 text-primary" aria-hidden="true" />
                    <span className="font-heading text-sm font-bold">{meta.label}</span>
                    <ChannelStateBadge state={saved} />
                    {changed ? (
                      <span className="text-[11px] text-muted-foreground">غير محفوظ</span>
                    ) : null}
                  </span>
                  <span className="block text-sm leading-relaxed text-muted-foreground">
                    {meta.what}
                  </span>
                  <span className="block text-xs leading-5 text-muted-foreground">
                    {STATE_HINT[saved]}
                  </span>
                </span>
              </label>
              {/* رابطٌ إلى سطح القناة حين يكون لها سطح يُفتح (الصندوق وحده اليوم) */}
              {meta.href ? (
                <Link
                  href={meta.href}
                  className="ms-7 w-fit text-xs font-medium text-primary underline underline-offset-4"
                >
                  {meta.hrefLabel}
                </Link>
              ) : null}
            </Card>
          );
        })}
      </div>

      {/* ------------------------------------------------------------ */}
      {/* مفتاح «راغب» — العامل الثاني في الإتاحة (١-و)                  */}
      {/* ------------------------------------------------------------ */}
      <Card className="gap-2 p-4">
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            name="accepting"
            checked={accepting}
            onChange={(e) => setAccepting(e.target.checked)}
            className="mt-1 size-4 shrink-0 accent-primary"
          />
          <span className="min-w-0 flex-1 space-y-1">
            <span className="block font-heading text-sm font-bold">أستقبل طلبات الرحلات</span>
            <span className="block text-sm leading-relaxed text-muted-foreground">
              أزل العلامة حين تكون مركباتك مشغولة أو خارج الخدمة. لا شيء يُحذف ولا حساب
              يتوقف — تتوقف عروض الرحلات الجديدة وحدها حتى تعيد العلامة.
            </span>
          </span>
        </label>
      </Card>

      {/* ------------------------------------------------------------ */}
      {/* أثر الاختيار **قبل** الحفظ — سبب وجود هذا النموذج أصلاً        */}
      {/* ------------------------------------------------------------ */}
      {!reachable ? (
        <Notice tone="danger">
          <p className="font-semibold">
            {dirty ? "لو حفظتَ الآن فستصير غير متصل." : "أنت غير متصل الآن."}
          </p>
          <p className="mt-1">
            لا قناة واحدة تستطيع أن تبلغك. و<b>إطفاء كل القنوات معناه «غير متصل»</b> لا
            «متصلٌ بلا إشعارات»: توزيع الرحلات <b>يتخطّى</b> من لا يمكن بلوغه، فلا يصلك
            عرضٌ واحد ولا يظهر لك أنك فقدتَ شيئاً.
          </p>
          <p className="mt-1">
            وصندوق البورتال وحده لا يكفي: هو سجلٌّ يستلزم أن تفتحه، والعرض له مهلة تنتهي
            قبل أن تنظر.
          </p>
        </Notice>
      ) : !accepting ? (
        <Notice tone="warning">
          <p className="font-semibold">
            {dirty ? "لو حفظتَ الآن فلن تصلك طلبات." : "أنت متصل ولا تستقبل طلبات."}
          </p>
          <p className="mt-1">
            قنواتك تعمل، لكنك أوقفتَ الاستقبال بنفسك — فلا يُرسَل إليك عرض جديد حتى تعيد
            العلامة. وهذا اختيارٌ مؤقت مقصود، لا عطل.
          </p>
        </Notice>
      ) : (
        <Notice tone="success">
          <p className="font-semibold">
            {dirty ? "بهذا الحفظ تبقى متاحاً لاستقبال الرحلات." : "أنت متاح لاستقبال الرحلات."}
          </p>
          <p className="mt-1">
            القنوات التي ستبلغك:{" "}
            <b>{reachingNow.map((channel) => CHANNEL_META[channel].label).join(" · ")}</b>.
          </p>
        </Notice>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit">حفظ التفضيلات</Button>
        {dirty ? (
          <span className="text-xs text-muted-foreground">
            لديك تعديلات لم تُحفظ — لا يسري شيء منها قبل الحفظ.
          </span>
        ) : null}
      </div>
    </form>
  );
}
