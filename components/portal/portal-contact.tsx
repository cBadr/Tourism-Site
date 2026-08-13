import type { ReactNode } from "react";
import { Mail, MessageCircle, Phone } from "lucide-react";

import { telHref, waHref } from "@/components/site/links";
import type { ContactSettings } from "@/lib/site-config";
import { cn } from "@/lib/utils";

/**
 * قنوات تواصل الإدارة كما يراها المتعهد — القنوات المضبوطة فقط.
 * كل القيم من إعدادات الموقع؛ لا رقم ولا بريد مكتوب في الكود (انضباط الـ Whitelabel).
 */

type Channel = { key: string; label: string; value: string; href: string; icon: ReactNode };

export function contactChannels(contact: ContactSettings): Channel[] {
  const channels: Channel[] = [];
  if (contact.phone) {
    channels.push({
      key: "phone",
      label: "اتصال",
      value: contact.phone,
      href: telHref(contact.phone),
      icon: <Phone className="size-4" aria-hidden="true" />,
    });
  }
  if (contact.whatsapp) {
    channels.push({
      key: "whatsapp",
      label: "واتساب",
      value: contact.whatsapp,
      href: waHref(contact.whatsapp),
      icon: <MessageCircle className="size-4" aria-hidden="true" />,
    });
  }
  if (contact.email) {
    channels.push({
      key: "email",
      label: "بريد",
      value: contact.email,
      href: `mailto:${contact.email}`,
      icon: <Mail className="size-4" aria-hidden="true" />,
    });
  }
  return channels;
}

/** أزرار بارزة — لشاشات الانتظار والإيقاف حيث التواصل هو الإجراء الوحيد المتاح */
export function ContactChannels({
  contact,
  className,
  empty = "تواصل مع الإدارة عبر القناة التي وصلتك منها الدعوة.",
}: {
  contact: ContactSettings;
  className?: string;
  empty?: string;
}) {
  const channels = contactChannels(contact);
  if (channels.length === 0) {
    return <p className="text-sm text-muted-foreground">{empty}</p>;
  }

  return (
    <ul className={cn("flex flex-wrap justify-center gap-2", className)}>
      {channels.map((channel) => (
        <li key={channel.key}>
          <a
            href={channel.href}
            className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3.5 py-2 text-sm font-medium transition-colors hover:border-primary hover:text-primary"
          >
            {channel.icon}
            <span>{channel.label}</span>
            <span dir="ltr" className="text-muted-foreground">
              {channel.value}
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}

/** سطر خفيف — لتذييل البورتال حيث التواصل مساعدة لا إجراء */
export function ContactLine({ contact }: { contact: ContactSettings }) {
  const channels = contactChannels(contact);
  if (channels.length === 0) return null;

  return (
    <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
      {channels.map((channel) => (
        <a
          key={channel.key}
          href={channel.href}
          dir="ltr"
          className="inline-flex items-center gap-1.5 transition-colors hover:text-primary"
        >
          {channel.icon}
          {channel.value}
        </a>
      ))}
    </span>
  );
}
