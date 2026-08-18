import { BadgeCheck, FileImage, IdCard, ShieldAlert, ShieldX, UserRound } from "lucide-react";

import { HelpTip } from "@/components/shared/HelpTip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { signDriverDocs } from "@/lib/drivers/documents";
import { createServerSupabase } from "@/lib/supabase/server";
import { verifyDriverLicense } from "./driver-docs-actions";

/**
 * مستندات سائقي هذا الشريك — الصورة والرخصة ورقمها وتاريخها ومن وثّقها.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  🔒 لماذا هذه البطاقة موجودة أصلاً، ولماذا هي **قراءة + شهادة** لا إدارة
 * ══════════════════════════════════════════════════════════════════════════
 *
 * قرار المالك (2026-08-18): «يراها من في لوحة التحكم فقط». وقرارُ 2026-08-11
 * الأقدم: «لا إدارة سائقين مباشرين إطلاقاً». والاثنان معاً يعطيان هذا الشكل
 * بالضبط: **الإدارة ترى وتوثّق، ولا تُنشئ ولا تعدّل ولا تحذف.**
 *
 * ── والقراءة بجلسة المشرف لا بمفتاح الخدمة ────────────────────────────────
 *
 * الرابط الموقَّع يُولَّد بـ`createServerSupabase()` — أي بجلسة من يفتح الشاشة.
 * فالسياسة `driver_docs_select_own_or_admin` هي التي تسمح، عبر `is_admin()`.
 * ولو وقّعنا بمفتاح الخدمة لَعملت الصفحة **حتى لو انهارت السياسة**، ولَما شهد
 * اختبارٌ على شيء. وثمنُ هذا الاختيار مذكور: مشرفٌ بلا دور `admin` في `profiles`
 * لا يرى الصور — وهو المطلوب.
 *
 * ⚠ **ولا مسار خام يعبر إلى JSX**: ما يصل رابطٌ عمره دقيقة، والمفتاح يبقى على
 * الخادم (نفس قرار `receipt_path` في 0039).
 */

const MAX_DRIVERS = 60;

type Row = {
  id: string;
  name: string;
  phone: string;
  licenseNo: string | null;
  licenseExpiry: string | null;
  verifiedAt: string | null;
  purgedAt: string | null;
  photoUrl: string | null;
  licenseUrl: string | null;
  hasPhoto: boolean;
  hasLicense: boolean;
  active: boolean;
};

const asText = (v: unknown): string | null =>
  typeof v === "string" && v.trim() !== "" ? v.trim() : null;

const dateLabel = (value: string | null): string => {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" });
};

async function load(subcontractorId: string): Promise<{ ready: boolean; rows: Row[] }> {
  const supabase = await createServerSupabase();
  if (!supabase) return { ready: false, rows: [] };

  const res = await supabase
    .from("subcontractor_drivers")
    .select(
      "id, name, phone, license_no, license_expiry, license_verified_at, docs_purged_at, photo_path, license_photo_path, active"
    )
    .eq("subcontractor_id", subcontractorId)
    .order("active", { ascending: false })
    .order("name", { ascending: true })
    .limit(MAX_DRIVERS);

  // 0120 غير مطبَّقة أو الجدول محجوب ⇒ لا بطاقة، ولا رسالة خطأ تُقلق بلا داعٍ
  if (res.error) return { ready: false, rows: [] };

  const raw = (res.data ?? []).map((r) => r as Record<string, unknown>);
  const links = await signDriverDocs(
    supabase,
    raw.flatMap((r) => [asText(r.photo_path), asText(r.license_photo_path)])
  );

  const rows = raw.map((r) => {
    const photoPath = asText(r.photo_path);
    const licensePath = asText(r.license_photo_path);
    return {
      id: String(r.id),
      name: asText(r.name) ?? "سائق بلا اسم",
      phone: asText(r.phone) ?? "—",
      licenseNo: asText(r.license_no),
      licenseExpiry: asText(r.license_expiry),
      verifiedAt: asText(r.license_verified_at),
      purgedAt: asText(r.docs_purged_at),
      photoUrl: photoPath ? (links.get(photoPath) ?? null) : null,
      licenseUrl: licensePath ? (links.get(licensePath) ?? null) : null,
      hasPhoto: Boolean(photoPath),
      hasLicense: Boolean(licensePath),
      active: r.active === true,
    };
  });

  return { ready: true, rows };
}

function Thumb({
  url,
  has,
  purged,
  label,
  icon: Icon,
}: {
  url: string | null;
  has: boolean;
  purged: boolean;
  label: string;
  icon: typeof UserRound;
}) {
  return (
    <div className="space-y-1">
      <p className="flex items-center gap-1 text-xs text-muted-foreground">
        <Icon className="size-3.5" aria-hidden="true" />
        {label}
      </p>
      <div className="flex h-24 w-32 items-center justify-center overflow-hidden rounded-lg border border-dashed border-border bg-muted/40">
        {url ? (
          // رابطٌ موقَّع قصير العمر — لا `next/image` كي لا يُضاف نطاق التخزين
          // إلى `remotePatterns` فيُفتح لكل صورة في المشروع
          <a href={url} target="_blank" rel="noreferrer" className="size-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={label} loading="lazy" decoding="async" className="size-full object-contain" />
          </a>
        ) : (
          <span className="px-2 text-center text-[11px] leading-4 text-muted-foreground">
            {has ? "تعذّر عرضها الآن" : purged ? "حُذفت بانقضاء المدة" : "لم تُرفع"}
          </span>
        )}
      </div>
    </div>
  );
}

export async function DriverDocsCard({ subcontractorId }: { subcontractorId: string }) {
  const { ready, rows } = await load(subcontractorId);
  if (!ready) return null;

  const today = new Date();

  return (
    <Card className="space-y-4 p-5" id="drivers">
      <div>
        <h3 className="flex items-center gap-1.5 font-heading text-base font-bold">
          <IdCard className="size-4 text-primary" />
          سائقو الشريك ومستنداتهم
          <HelpTip>
            سجلٌّ يملؤه الشريك من بوابته — لا تُنشئ هنا سائقاً ولا تعدّله. وما تراه من صور
            ورخص لا يصل العميل إطلاقاً ولا يصل متعهداً آخر، وتُحذف الصور بعد خمس سنوات من
            انتهاء العلاقة مع هذا الشريك (اتفاقية الشراكة)، ويبقى الاسم ورقم الرخصة
            وتاريخها كي لا تفقد رحلة قديمة سائقها.
          </HelpTip>
        </h3>
        <p className="text-sm text-muted-foreground">
          توثيقك يسقط تلقائياً إن غيّر الشريك رقم الرخصة أو تاريخها أو صورتها بعده — فما
          تشهد عليه هو ما رأيته أنت لا ما صار إليه الملف.
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-lg bg-muted/60 p-4 text-sm text-muted-foreground">
          لم يسجّل هذا الشريك أي سائق بعد. ولن يستطيع اختيار سائق عند إسناد رحلة قبل أن
          يسجّل واحداً على الأقل من بوابته.
        </p>
      ) : null}

      {rows.map((row, index) => {
        const expired = row.licenseExpiry !== null && new Date(row.licenseExpiry) < today;
        return (
          <div key={row.id} className="space-y-3">
            {index > 0 ? <Separator /> : null}
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{row.name}</span>
              <Badge variant={row.active ? "default" : "secondary"}>
                {row.active ? "في الخدمة" : "خارج الخدمة"}
              </Badge>
              {expired ? (
                <Badge variant="destructive" className="gap-1">
                  <ShieldAlert className="size-3" aria-hidden="true" />
                  رخصة منتهية
                </Badge>
              ) : null}
              {row.verifiedAt ? (
                <Badge variant="secondary" className="gap-1">
                  <BadgeCheck className="size-3" aria-hidden="true" />
                  وثّقتها الإدارة {dateLabel(row.verifiedAt)}
                </Badge>
              ) : (
                <Badge variant="outline">بانتظار التوثيق</Badge>
              )}
            </div>

            <div className="flex flex-wrap items-start gap-4">
              <Thumb
                url={row.photoUrl}
                has={row.hasPhoto}
                purged={Boolean(row.purgedAt)}
                label="صورة السائق"
                icon={UserRound}
              />
              <Thumb
                url={row.licenseUrl}
                has={row.hasLicense}
                purged={Boolean(row.purgedAt)}
                label="صورة الرخصة"
                icon={FileImage}
              />

              <dl className="grid min-w-56 flex-1 gap-1 text-sm">
                <div className="flex gap-2">
                  <dt className="text-muted-foreground">الهاتف</dt>
                  <dd dir="ltr" className="font-mono text-xs">
                    {row.phone}
                  </dd>
                </div>
                <div className="flex gap-2">
                  <dt className="text-muted-foreground">رقم الرخصة</dt>
                  <dd dir="ltr" className="font-mono text-xs">
                    {row.licenseNo ?? "—"}
                  </dd>
                </div>
                <div className="flex gap-2">
                  <dt className="text-muted-foreground">تنتهي في</dt>
                  <dd>{dateLabel(row.licenseExpiry)}</dd>
                </div>
                {row.purgedAt ? (
                  <div className="flex gap-2">
                    <dt className="text-muted-foreground">حُذفت صوره في</dt>
                    <dd>{dateLabel(row.purgedAt)}</dd>
                  </div>
                ) : null}
              </dl>
            </div>

            <form action={verifyDriverLicense.bind(null, subcontractorId, row.id, !row.verifiedAt)}>
              <Button type="submit" size="sm" variant={row.verifiedAt ? "ghost" : "secondary"}>
                {row.verifiedAt ? (
                  <>
                    <ShieldX aria-hidden="true" />
                    سحب التوثيق
                  </>
                ) : (
                  <>
                    <BadgeCheck aria-hidden="true" />
                    توثيق الرخصة
                  </>
                )}
              </Button>
            </form>
          </div>
        );
      })}
    </Card>
  );
}
