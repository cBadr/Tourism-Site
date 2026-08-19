import { BellRing, ImageOff, ScrollText, Trash2, UserRound } from "lucide-react";

import {
  Banners,
  controlClass,
  dateLabel,
  Notice,
  PageHeading,
  SubStatusBadge,
  TextField,
} from "@/components/portal/portal-ui";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { createServiceSupabase } from "@/lib/supabase/admin";
import { AgreementSection, AGREEMENT_ERROR_MESSAGES } from "../agreement/agreement-section";
import { agreementNeedsAction } from "../agreement/data";
import { portalSetupAccess } from "../_lib/session";
import { ChannelsSummary } from "./_components/channels-summary";
import { removeAvatar, saveProfile } from "./actions";

/**
 * **حسابي** — ملفُّ المستخدم للمتعهد: صفحةٌ واحدة تجمع كلَّ ما يخصّ حسابه.
 *
 * ── لماذا صارت واحدةً بعد أن كانت ثلاثاً (ملاحظة المالك 2026-08-19) ─────────
 *
 * «لدينا كافة البيانات الخاصة بالمتعهد لكن ليس لدينا user profile مناسب … بحيث
 *  تكون إعدادات قنوات التنبيه داخل إعدادات حساب المتعهد … وأيضاً الاتفاقية تكون
 *  في ملف المستخدم … وبالتالي سنقوم بدمج ملفي مع الـ user profile».
 *
 * والتشخيص صحيحٌ وقابلٌ للقياس: شريطُ التنقل كان يحمل **سبعة** بنود، ثلاثةٌ منها
 * إعداداتُ حسابٍ تُلمس مراتٍ معدودة (‏ملفي · قنوات التنبيه · الاتفاقية) تزاحم
 * الأسطولَ والسائقين والأسعار — وهي عملُ الشريك اليومي. فصارت الثلاثةُ بنداً
 * واحداً «حسابي»، وصارت أقساماً في هذه الصفحة.
 *
 * | القسم | مرساته | من يملك محتواه |
 * |---|---|---|
 * | بيانات الحساب | `#account` | هذا الملف + `./actions.ts` |
 * | قنوات التنبيه | `#channels` | `_components/channels-summary.tsx` ← `partner_availability()` |
 * | الاتفاقية | `#agreement` | `../agreement/agreement-section.tsx` ← `portal_agreement()` |
 *
 * ── والترتيب يتبع ما ينتظر فعلاً، لا ترتيباً ثابتاً ─────────────────────────
 *
 * 🔒 من لم يوقّع الاتفاقية بعدُ يجدها **أولَ** ما يقع عليه بصره؛ ومن وقّع يجد
 * بياناته أولاً والاتفاقيةَ في ذيل الصفحة مطويّةً. وهو ما طلبه المالك حرفياً:
 * «لا يقرأها إلا مرة واحدة في الغالب وقت التوقيع».
 *
 * ⚠ **والترتيبُ عرضٌ لا حاجز.** أهليةُ العمل تُقاس في `partner_agreement_ok()`
 * وتُقرأ في `dispatch_pool` و`portal_offers` و`accept_offer` (هجرة 0113)، ولا
 * سطرَ في هذه الصفحة يمسّها. ومقيسٌ بمجموعة `partner_profile` القسم (ج): متعهدٌ
 * لم يوقّع وانقضت مهلته يسقط من الحوض ويُرفض في القبول — بعد النقل كما قبله.
 *
 * ولا حساب هنا ولا قرار: البيانات من `portalSetupAccess()`، والحالتان الأخريان
 * من دوال القاعدة كما قاستها (D-05).
 */

export const metadata = { title: "حسابي" };

/**
 * رموزُ الخطأ من **قسمين** في صفحةٍ واحدة، ولا تصادمَ بينها (فُحص اسماً اسماً).
 * ورموزُ قنوات التنبيه ليست هنا لأن أفعالها تنتهي في شاشتها هي — انظر ترويسة
 * `_components/channels-summary.tsx`.
 */
const ERROR_MESSAGES: Record<string, string> = {
  company: "اسم الشركة حقل إلزامي.",
  phone: "رقم الهاتف غير صالح — أرقام فقط مع رمز الدولة إن وُجد.",
  whatsapp: "رقم الواتساب غير صالح — اتركه فارغاً إن لم يكن لديك رقم منفصل.",
  email: "البريد الإلكتروني غير صالح.",
  link: "أحد الروابط غير صالح — استخدم رابطاً كاملاً يبدأ بـ https.",
  avatar_type: "صيغة الصورة غير مدعومة — استخدم JPG أو PNG أو WebP.",
  avatar_size: "حجم الصورة أكبر من الحد المسموح (٢ ميجابايت).",
  upload: "تعذر رفع الصورة — جرّب صورة أصغر، أو الصق رابط صورة بدلاً منها.",
  ...AGREEMENT_ERROR_MESSAGES,
};

/** رابطُ قفزٍ إلى قسم — التنقل داخل الصفحة يعمل بلا جافاسكربت */
function SectionLink({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: typeof UserRound;
  label: string;
}) {
  return (
    <a
      href={href}
      className="inline-flex shrink-0 items-center gap-2 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      {label}
    </a>
  );
}

function SectionHeading({ id, title, children }: { id: string; title: string; children: string }) {
  return (
    <div className="space-y-1">
      {/* المرساة على العنوان نفسه: `scroll-mt` كي لا تختفي تحت ترويسة الغلاف */}
      <h2 id={id} className="scroll-mt-24 font-heading text-lg font-bold">
        {title}
      </h2>
      <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">{children}</p>
    </div>
  );
}

export default async function PortalProfilePage({ searchParams }: PageProps<"/portal/profile">) {
  const [params, access, needsAgreement] = await Promise.all([
    searchParams,
    portalSetupAccess(),
    agreementNeedsAction(),
  ]);
  if (!access.ok) return null;

  const { sub } = access;
  const saved = params.saved === "1";
  const signed = params.signed === "1";
  const error = typeof params.error === "string" ? params.error : null;
  const canUpload = createServiceSupabase() !== null;

  /* ------------------------------------------------------------------ */
  /* الأقسام — تُبنى مرةً وتُرتَّب بحسب ما ينتظر فعلاً                     */
  /* ------------------------------------------------------------------ */

  const accountSection = (
    <section className="space-y-4">
      <SectionHeading id="account" title="بيانات الحساب">
        بياناتك التعريفية وقنوات التواصل التي تصلك عبرها الإدارة. حدّثها كلما تغيّر رقم أو
        مسؤول تواصل حتى لا ينقطع الاتصال بك — ولا يظهر منها شيء للعملاء على الموقع العام.
      </SectionHeading>

      <form action={saveProfile} className="space-y-4">
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
              help="يصلك عليه إشعار اعتماد قوائم الأسعار أو رفضها، وهو أيضاً عنوان قناة البريد في تنبيهاتك."
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
          <Button type="submit">حفظ بيانات الحساب</Button>
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
    </section>
  );

  const channelsSection = (
    <section className="space-y-4">
      <SectionHeading id="channels" title="قنوات التنبيه">
        أين يصلك عرض الرحلة، ومتى توقف استقبال الطلبات. وعرض الرحلة له مهلة تنتهي — فالقناة
        التي تصلك فوراً هي ما يجعلك تلحق به.
      </SectionHeading>
      <ChannelsSummary />
    </section>
  );

  const agreementSection = (
    <section className="space-y-4">
      <SectionHeading id="agreement" title="اتفاقية المتعهد">
        شروط تعاقدك على تنفيذ رحلات المنصة. تُقرأ مرةً وقت التوقيع، وتبقى هنا بنصّها ونسخةٍ
        تنزّلها متى شئت.
      </SectionHeading>
      <AgreementSection />
    </section>
  );

  return (
    <div className="space-y-8">
      <PageHeading
        title="حسابي"
        help="كل ما يخصّ حسابك في مكان واحد: بياناتك، وأين تصلك التنبيهات، والاتفاقية التي وقّعتها. ولا يظهر منها شيء للعملاء."
      >
        بياناتك وإعداداتك واتفاقيتك — صفحةٌ واحدة بأقسام، تُدير منها حسابك كله.
      </PageHeading>

      {/* ── بطاقة الهوية: من أنت في المنصة، بحالتك وتاريخك ─────────────── */}
      <Card className="flex-row flex-wrap items-center gap-4 p-5">
        {sub.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={sub.avatarUrl}
            alt={`صورة ${sub.companyName || "المتعهد"}`}
            className="size-14 shrink-0 rounded-full object-cover ring-1 ring-foreground/10"
          />
        ) : (
          <span className="grid size-14 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground ring-1 ring-foreground/10">
            <UserRound className="size-6" aria-hidden="true" />
          </span>
        )}

        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-heading text-base font-bold">
              {sub.companyName || "بلا اسم"}
            </span>
            <SubStatusBadge status={sub.status} />
          </div>
          <p className="text-xs leading-5 text-muted-foreground">
            <span dir="ltr">{sub.phone}</span>
            {sub.email ? (
              <>
                {" · "}
                <span dir="ltr">{sub.email}</span>
              </>
            ) : null}
            {sub.createdAt ? <> {" · "} شريك منذ {dateLabel(sub.createdAt)}</> : null}
          </p>
        </div>
      </Card>

      <nav aria-label="أقسام حسابي" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-0.5">
        <SectionLink href="#account" icon={UserRound} label="بيانات الحساب" />
        <SectionLink href="#channels" icon={BellRing} label="قنوات التنبيه" />
        <SectionLink href="#agreement" icon={ScrollText} label="الاتفاقية" />
      </nav>

      <Banners
        saved={saved || signed}
        error={error}
        errorMessages={ERROR_MESSAGES}
        savedMessage={
          signed
            ? "سُجّل قبولك للاتفاقية. النسخة التي قبلتها محفوظة بنصّها وتجدها في «نُسَخُك الموقَّعة» أسفل هذه الصفحة."
            : "حُفظت بيانات حسابك."
        }
      />

      {/*
        🔒 الترتيب يتبع ما ينتظر: من لم يوقّع يجد الاتفاقية أولاً. وهذا **عرضٌ لا
        حاجز** — الحاجز في `partner_agreement_ok()` وحده (انظر ترويسة الملف).
      */}
      {needsAgreement ? (
        <>
          {agreementSection}
          {accountSection}
          {channelsSection}
        </>
      ) : (
        <>
          {accountSection}
          {channelsSection}
          {agreementSection}
        </>
      )}
    </div>
  );
}
