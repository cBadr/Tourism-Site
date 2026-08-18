import { BadgeCheck, FileImage, ShieldAlert, Trash2, UploadCloud, UserRound } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HelpTip } from "@/components/shared/HelpTip";
import { DRIVER_DOC_MAX_BYTES, type DriverDocKind } from "@/lib/driver-docs-types";
import { DriverDocView } from "@/lib/drivers/doc-thumb";
import { removeDriverDocument, uploadDriverDocument } from "../actions";
import type { PortalDriver } from "../data";

/**
 * لوحُ مستندات السائق داخل بطاقته — صورته وصورة رخصته.
 *
 * ⚠ **ولا مسار يصل هذا الملف**: ما يعبر إليه رابطٌ موقَّع عمره دقيقة (`photoUrl`
 * و`licenseUrl`)، ومفتاحُ الكائن يبقى على الخادم. فحتى لو قرأ أحدٌ مصدر الصفحة
 * لم يجد ما يجرّبه على الدلو — وهو نفس قرار `receipt_path` في 0039.
 *
 * ── وثلاث حالاتٍ لا تُخلط، لأن خلطها هو النمط ١٥ في القواعد الذهبية ────────
 *
 * | ما يظهر | ماذا يعني |
 * |---|---|
 * | مربّعٌ فارغ «لم تُرفع» | لا ملف أصلاً — والرفع اختياري |
 * | «حُذفت بانقضاء مدة الحفظ» | كانت موجودة وذهبت بالسياسة، **لا عطل** |
 * | «تعذّر عرضها الآن» | الملف موجود والتوقيع أخفق — خللٌ يُبلَّغ لا فراغ |
 */

const MB = Math.round(DRIVER_DOC_MAX_BYTES / (1024 * 1024));

/** الأنواع المقبولة — نفس قائمة الدلو حرفاً بحرف، ومكتوبةٌ للمتصفح كي يُرشد */
const ACCEPT = "image/jpeg,image/png,image/webp,application/pdf";

type Slot = {
  kind: DriverDocKind;
  title: string;
  icon: typeof UserRound;
  url: string | null;
  has: boolean;
  help: string;
};

function DocSlot({
  driverId,
  slot,
  purgedAt,
  disabled,
}: {
  driverId: string;
  slot: Slot;
  purgedAt: string | null;
  disabled?: boolean;
}) {
  const Icon = slot.icon;
  const inputId = `${driverId}-${slot.kind}-file`;

  return (
    <div className="space-y-3 rounded-xl border border-border/70 bg-muted/30 p-4">
      <div className="flex items-center gap-2">
        <Icon className="size-4 shrink-0 text-primary" aria-hidden="true" />
        <h4 className="text-sm font-semibold">{slot.title}</h4>
        <HelpTip>{slot.help}</HelpTip>
      </div>

      <div className="flex h-32 items-center justify-center overflow-hidden rounded-lg border border-dashed border-border bg-background">
        {slot.url ? (
          // 🔴 مكوّنٌ واحد يعرض الملفّ هنا وفي اللوحة (القاعدة ١٢: لا يُستنسخ
          // القائم). وفيه ثلاثة أقفال وُلدت من عطلٍ مقيس (2026-08-18): لا تأجيلَ
          // طلبٍ لأن الرابط يموت بعد دقيقة · و`onError` يكتب السبب بدل مربّعٍ
          // فارغ · وPDF يُعرض رابطاً لا صورةً تفشل دائماً (الدلو يقبل
          // `application/pdf` و`<img>` لا يصيّره أبداً).
          <DriverDocView url={slot.url} label={slot.title} />
        ) : (
          <p className="px-3 text-center text-xs leading-5 text-muted-foreground">
            {slot.has
              ? "الملف مرفوع لكن تعذّر عرضه الآن — أعد تحميل الصفحة، وإن تكرر فأبلغ الإدارة."
              : purgedAt
                ? "حُذفت بانقضاء مدة الحفظ — وهذا سلوك النظام لا عطل فيه."
                : "لم تُرفع بعد."}
          </p>
        )}
      </div>

      <form action={uploadDriverDocument.bind(null, driverId)} className="space-y-2">
        <input type="hidden" name="kind" value={slot.kind} />
        <Label htmlFor={inputId} className="text-xs text-muted-foreground">
          اختر ملفاً (صورة أو PDF، حتى {MB} ميجابايت)
        </Label>
        <Input
          id={inputId}
          name="file"
          type="file"
          accept={ACCEPT}
          required
          disabled={disabled}
          className="h-auto py-1.5 text-xs file:me-2 file:rounded-md file:border-0 file:bg-muted file:px-2 file:py-1 file:text-xs"
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" size="sm" variant="secondary" disabled={disabled}>
            <UploadCloud aria-hidden="true" />
            {slot.has ? "استبدال" : "رفع"}
          </Button>
        </div>
      </form>

      {slot.has ? (
        <form action={removeDriverDocument.bind(null, driverId)}>
          <input type="hidden" name="kind" value={slot.kind} />
          <Button type="submit" size="sm" variant="ghost" disabled={disabled}>
            <Trash2 aria-hidden="true" />
            إزالة الملف
          </Button>
        </form>
      ) : null}
    </div>
  );
}

/** وسم حالة الرخصة — موثَّقة أو منتهية أو بانتظار المراجعة */
export function LicenseBadge({ driver }: { driver: PortalDriver }) {
  const expired =
    driver.licenseExpiry !== null && new Date(driver.licenseExpiry) < new Date();

  if (expired) {
    return (
      <Badge variant="destructive" className="gap-1">
        <ShieldAlert className="size-3" aria-hidden="true" />
        رخصة منتهية
      </Badge>
    );
  }
  if (driver.licenseVerifiedAt) {
    return (
      <Badge variant="secondary" className="gap-1">
        <BadgeCheck className="size-3" aria-hidden="true" />
        رخصة موثّقة
      </Badge>
    );
  }
  return null;
}

export function DriverDocs({
  driver,
  disabled,
}: {
  driver: PortalDriver;
  disabled?: boolean;
}) {
  const slots: Slot[] = [
    {
      kind: "photo",
      title: "صورة السائق",
      icon: UserRound,
      url: driver.photoUrl,
      has: driver.hasPhoto,
      help: "تبقى بيننا وبينك: لا تصل العميل ولا تظهر على صفحة متابعة رحلته. غرضها أن تعرف الإدارة من نفّذ عند أي استفسار.",
    },
    {
      kind: "license",
      title: "صورة الرخصة",
      icon: FileImage,
      url: driver.licenseUrl,
      has: driver.hasLicensePhoto,
      help: "تراها أنت والإدارة فقط — ولا يراها متعهد آخر ولا العميل. وتُحذف بعد خمس سنوات من انتهاء العلاقة بيننا، كما في اتفاقية الشراكة.",
    },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {slots.map((slot) => (
        <DocSlot
          key={slot.kind}
          driverId={driver.id}
          slot={slot}
          purgedAt={driver.docsPurgedAt}
          disabled={disabled}
        />
      ))}
    </div>
  );
}
