import { ImageOff, Trash2, UserRound } from "lucide-react";

import {
  Banners,
  controlClass,
  Notice,
  PageHeading,
  TextField,
} from "@/components/portal/portal-ui";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { createServiceSupabase } from "@/lib/supabase/admin";
import { portalAccess } from "../_lib/session";
import { removeAvatar, saveProfile } from "./actions";

/**
 * ملف المتعهد — بياناته كما تراها الإدارة وكما تُستخدم في التواصل معه.
 *
 * ثلاثة أقسام لا أكثر: هوية الشركة، قنوات التواصل، الصورة والحسابات. كل حقل
 * يحمل سطراً يشرح **من يرى هذه القيمة ومتى تُستخدم** — لأن أكثر ما يقلق الشريك
 * هو ألا يعرف أين تظهر بياناته.
 *
 * الصورة تُرفع من الخادم إلى دلو `media` تحت المسار `subcontractors/<id>/`؛
 * وحين لا يكون مفتاح الخدمة مضبوطاً في البيئة يبقى حقل الرابط وحده متاحاً.
 */

export const metadata = { title: "ملفي" };

const ERROR_MESSAGES: Record<string, string> = {
  company: "اسم الشركة حقل إلزامي.",
  phone: "رقم الهاتف غير صالح — أرقام فقط مع رمز الدولة إن وُجد.",
  whatsapp: "رقم الواتساب غير صالح — اتركه فارغاً إن لم يكن لديك رقم منفصل.",
  email: "البريد الإلكتروني غير صالح.",
  link: "أحد الروابط غير صالح — استخدم رابطاً كاملاً يبدأ بـ https.",
  avatar_type: "صيغة الصورة غير مدعومة — استخدم JPG أو PNG أو WebP.",
  avatar_size: "حجم الصورة أكبر من الحد المسموح (٢ ميجابايت).",
  upload: "تعذر رفع الصورة — جرّب صورة أصغر، أو الصق رابط صورة بدلاً منها.",
};

export default async function PortalProfilePage({ searchParams }: PageProps<"/portal/profile">) {
  const [params, access] = await Promise.all([searchParams, portalAccess()]);
  if (!access.ok) return null;

  const { sub } = access;
  const saved = params.saved === "1";
  const error = typeof params.error === "string" ? params.error : null;
  const canUpload = createServiceSupabase() !== null;

  return (
    <div className="space-y-6">
      <PageHeading
        title="ملفي"
        help="هذه البيانات تراها الإدارة وحدها؛ لا يظهر منها شيء للعملاء على الموقع العام."
      >
        بياناتك التعريفية وقنوات التواصل التي تصلك عبرها الإدارة. حدّثها كلما تغيّر رقم أو
        مسؤول تواصل حتى لا ينقطع الاتصال بك.
      </PageHeading>

      <Banners
        saved={saved}
        error={error}
        errorMessages={ERROR_MESSAGES}
        savedMessage="حُفظت بيانات ملفك."
      />

      <form action={saveProfile} className="space-y-6">
        <Card className="gap-4 p-5">
          <h3 className="font-heading text-base font-bold">هوية الشركة</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              id="company_name"
              label="اسم الشركة"
              name="company_name"
              defaultValue={sub.companyName}
              required
              maxLength={120}
              help="الاسم الذي تُعرف به لدى الإدارة وفي قوائم المتعهدين."
            />
            <TextField
              id="contact_name"
              label="اسم مسؤول التواصل"
              name="contact_name"
              defaultValue={sub.contactName}
              maxLength={120}
              help="الشخص الذي تتصل به الإدارة عند الحاجة — اتركه فارغاً إن كنت أنت."
            />
          </div>
        </Card>

        <Card className="gap-4 p-5">
          <h3 className="font-heading text-base font-bold">قنوات التواصل</h3>
          <div className="grid gap-4 sm:grid-cols-3">
            <TextField
              id="phone"
              label="رقم الهاتف"
              name="phone"
              type="tel"
              dir="ltr"
              defaultValue={sub.phone}
              required
              help="القناة الأساسية للتواصل التشغيلي معك."
            />
            <TextField
              id="whatsapp"
              label="رقم الواتساب"
              name="whatsapp"
              type="tel"
              dir="ltr"
              defaultValue={sub.whatsapp}
              hint="اتركه فارغاً إن كان نفس رقم الهاتف."
            />
            <TextField
              id="email"
              label="البريد الإلكتروني"
              name="email"
              type="email"
              dir="ltr"
              defaultValue={sub.email}
              help="يصلك عليه إشعار اعتماد قوائم الأسعار أو رفضها."
            />
          </div>
        </Card>

        <Card className="gap-4 p-5">
          <h3 className="font-heading text-base font-bold">الصورة والحسابات</h3>

          <div className="flex flex-wrap items-start gap-5">
            <div className="flex flex-col items-center gap-2">
              {sub.avatarUrl ? (
                // صورة قد تكون على دلو التخزين أو على رابط خارجي، لذلك img عادية
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={sub.avatarUrl}
                  alt={`صورة ${sub.companyName || "المتعهد"}`}
                  className="size-20 rounded-full object-cover ring-1 ring-foreground/10"
                />
              ) : (
                <span className="grid size-20 place-items-center rounded-full bg-muted text-muted-foreground ring-1 ring-foreground/10">
                  <UserRound className="size-8" aria-hidden="true" />
                </span>
              )}
              <span className="text-xs text-muted-foreground">الصورة الحالية</span>
            </div>

            <div className="min-w-56 flex-1 space-y-4">
              {canUpload ? (
                <div className="space-y-1.5">
                  <Label htmlFor="avatar">رفع صورة</Label>
                  <input
                    id="avatar"
                    name="avatar"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className={controlClass}
                  />
                  <p className="text-xs leading-5 text-muted-foreground">
                    JPG أو PNG أو WebP، بحد أقصى ٢ ميجابايت. الصورة المرفوعة تحل محل الرابط
                    أدناه.
                  </p>
                </div>
              ) : (
                <Notice tone="info">
                  <p>
                    رفع الملفات غير مفعّل على هذا الخادم حالياً — استخدم حقل الرابط أدناه، أو
                    راسل الإدارة لترفع الصورة نيابةً عنك.
                  </p>
                </Notice>
              )}

              <TextField
                id="avatar_url"
                label="رابط الصورة"
                name="avatar_url"
                dir="ltr"
                defaultValue={sub.avatarUrl}
                placeholder="https://"
                hint="بديل عن الرفع: الصق رابط صورة متاحة على الإنترنت."
              />
            </div>
          </div>

          <Separator />

          <div className="grid gap-4 sm:grid-cols-3">
            <TextField
              id="facebook"
              label="فيسبوك"
              name="facebook"
              dir="ltr"
              defaultValue={sub.socials.facebook}
              placeholder="https://facebook.com/…"
            />
            <TextField
              id="instagram"
              label="إنستجرام"
              name="instagram"
              dir="ltr"
              defaultValue={sub.socials.instagram}
              placeholder="https://instagram.com/…"
            />
            <TextField
              id="website"
              label="الموقع الإلكتروني"
              name="website"
              dir="ltr"
              defaultValue={sub.socials.website}
              placeholder="https://"
            />
          </div>
          <p className="text-xs leading-5 text-muted-foreground">
            الحسابات اختيارية وتساعد الإدارة على التحقق من نشاطك — ولا تظهر للعملاء.
          </p>
        </Card>

        <div className="flex justify-end">
          <Button type="submit">حفظ بيانات الملف</Button>
        </div>
      </form>

      {sub.avatarUrl ? (
        <form action={removeAvatar}>
          <Button type="submit" variant="ghost" size="sm">
            <Trash2 aria-hidden="true" />
            إزالة الصورة الحالية
          </Button>
        </form>
      ) : (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <ImageOff className="size-4" aria-hidden="true" />
          لا صورة على ملفك — الصورة اختيارية ولا تؤثر على اعتماد أسعارك.
        </p>
      )}
    </div>
  );
}
