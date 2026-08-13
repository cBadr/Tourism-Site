import type { ReactElement } from "react";
import { Mail, Phone } from "lucide-react";
import type { SiteSettings } from "@/lib/site-config";
import { DEFAULT_LOCALE } from "@/lib/i18n-types";
import { getT } from "@/lib/i18n/content";
import type { Tx } from "./i18n";
import { SectionHeading } from "./section-heading";
import {
  externalLinkProps,
  socialEntries,
  telHref,
  telegramHref,
  waHref,
} from "./links";
import { SOCIAL_ICONS, TelegramIcon, WhatsAppIcon } from "./social-icons";

type ContactChannel = {
  key: string;
  label: string;
  value: string;
  href: string;
  icon: ReactElement;
};

/** يبني قنوات التواصل من الحقول غير الفارغة فقط — بأسماء بلغة الزائر */
function buildChannels(settings: SiteSettings, t: Tx): ContactChannel[] {
  const { phone, whatsapp, telegram, email } = settings.contact;
  const channels: ContactChannel[] = [];

  if (phone) {
    channels.push({
      key: "phone",
      label: t("channels.phone", "اتصال هاتفي"),
      value: phone,
      href: telHref(phone),
      icon: <Phone className="size-6" aria-hidden="true" />,
    });
  }
  if (whatsapp) {
    channels.push({
      key: "whatsapp",
      label: t("channels.whatsapp", "واتساب"),
      value: whatsapp,
      href: waHref(whatsapp),
      icon: <WhatsAppIcon className="size-6" />,
    });
  }
  if (telegram) {
    channels.push({
      key: "telegram",
      label: t("channels.telegram", "تليجرام"),
      value: telegram,
      href: telegramHref(telegram),
      icon: <TelegramIcon className="size-6" />,
    });
  }
  if (email) {
    channels.push({
      key: "email",
      label: t("channels.email", "البريد الإلكتروني"),
      value: email,
      href: `mailto:${email}`,
      icon: <Mail className="size-6" aria-hidden="true" />,
    });
  }
  return channels;
}

/**
 * قسم التواصل: يعرض القنوات والحسابات المتوفرة فقط،
 * وإن غابت كلها يظهر سطر لطيف بأنها تُضاف قريباً.
 * `content` اختياري من نظام الأقسام — عند غيابه تُستخدم نصوص `site.contact`.
 */
export async function ContactSection({
  settings,
  content,
  locale = DEFAULT_LOCALE,
}: {
  settings: SiteSettings;
  content?: { title?: string; sub?: string };
  locale?: string;
}) {
  const [t, tSocial] = await Promise.all([
    getT("site.contact", locale),
    getT("site.social", locale),
  ]);
  const channels = buildChannels(settings, t);
  const socials = socialEntries(settings.socials, tSocial);
  const nothingYet = channels.length === 0 && socials.length === 0;

  return (
    <section id="contact" className="scroll-mt-24 bg-muted/40 py-20 md:py-28">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <SectionHeading
          eyebrow={t("eyebrow", "تواصل معنا")}
          title={content?.title ?? t("title", "نحن على بُعد رسالة واحدة")}
          description={
            content?.sub ??
            t("description", "اختر القناة الأنسب لك، وسيرد عليك فريقنا في أقرب وقت.")
          }
        />

        {nothingYet ? (
          <p className="mx-auto mt-12 max-w-xl rounded-2xl border border-dashed border-border bg-background/60 px-6 py-12 text-center leading-8 text-muted-foreground">
            {t("empty", "قنوات التواصل تُضاف قريباً — ترقبونا.")}
          </p>
        ) : (
          <div className="mt-12 flex flex-col gap-10 md:mt-16">
            {channels.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {channels.map((channel) => (
                  <a
                    key={channel.key}
                    href={channel.href}
                    {...externalLinkProps(channel.href)}
                    aria-label={channel.label}
                    className="group flex items-center gap-4 rounded-2xl bg-card p-5 ring-1 ring-border transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-primary/10 hover:ring-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                  >
                    <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary transition-colors duration-300 group-hover:bg-primary group-hover:text-primary-foreground">
                      {channel.icon}
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span className="font-bold">{channel.label}</span>
                      <span
                        dir="ltr"
                        className="truncate text-sm text-muted-foreground"
                      >
                        {channel.value}
                      </span>
                    </span>
                  </a>
                ))}
              </div>
            ) : null}

            {socials.length > 0 ? (
              <div className="flex flex-col items-center gap-4">
                <p className="text-sm font-medium text-muted-foreground">
                  {t("followUs", "تابعنا على الشبكات الاجتماعية")}
                </p>
                <ul className="flex flex-wrap items-center justify-center gap-3">
                  {socials.map((social) => {
                    const Icon = SOCIAL_ICONS[social.key];
                    return (
                      <li key={social.key}>
                        <a
                          href={social.href}
                          {...externalLinkProps(social.href)}
                          aria-label={social.label}
                          className="grid size-11 place-items-center rounded-xl bg-card text-muted-foreground ring-1 ring-border transition-all duration-300 hover:-translate-y-0.5 hover:bg-primary hover:text-primary-foreground hover:ring-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                        >
                          <Icon className="size-5" />
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}
