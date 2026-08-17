import Link from "next/link";
import { Eye, EyeOff, GripVertical, Plus, Trash2 } from "lucide-react";

import { HelpTip } from "@/components/shared/HelpTip";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { NAV_LABEL_MAX } from "@/components/site/links";
import { getSiteNav } from "@/lib/site-nav";
import { createServerSupabase } from "@/lib/supabase/server";
import {
  addNavLink,
  deleteNavLink,
  hidePageFromNav,
  saveNavLink,
  toggleNavLink,
} from "../nav-actions";

/**
 * بطاقة «الشريط العلوي» في قائمة المحتوى — الدفعة ج · هجرة `0094`.
 *
 * ── لماذا هنا، وما الذي **لا** يقع هنا ─────────────────────────────────────
 *
 * السؤال الذي تجيبه هذه البطاقة سؤالٌ واحد: **«ماذا يرى الزائر أعلى موقعي،
 * بهذا الترتيب؟»** — فتعرض الشريط **كما تُصيّره القاعدة للزائر** (`site_nav`
 * نفسها لا عدٌّ ثانٍ)، صفحاتٍ وبنوداً حرّة في قائمةٍ واحدة.
 *
 * أما «أتظهر هذه الصفحة؟» فقرارُ صفحةٍ بعينها، ومكانه محرّرها بجوار «منشورة» —
 * ولذلك تُعرض الصفحات هنا **للقراءة والإخفاء وحدهما**، وتسميتها وترتيبها
 * واختصارها تُحرَّر هناك. وكاتبان لحقلٍ واحد في شاشتين يعنيان انحرافاً.
 */

type NavLinkRow = {
  id: string;
  label: string;
  label_key: string | null;
  href: string;
  nav_sort: number;
  active: boolean;
};

/**
 * البنود الحرّة **خاماً** — بما فيها المُخفاة (`active = false`).
 *
 * و`getSiteNav()` لا تكفي: هي تُرجع ما يراه الزائر (المفعَّل وحده، وبتسميةٍ
 * مُحلولة)، وهذه الشاشة تحتاج ما يملكه المالك — بما أخفاه، وبنصّ حقوله كما هي
 * لتوضع في النموذج.
 */
async function readNavLinks(): Promise<{ links: NavLinkRow[]; wired: boolean }> {
  try {
    const supabase = await createServerSupabase();
    if (!supabase) return { links: [], wired: false };
    const { data, error } = await supabase
      .from("nav_links")
      .select("id, label, label_key, href, nav_sort, active")
      .order("nav_sort");
    if (error) return { links: [], wired: false };
    return { links: (data ?? []) as NavLinkRow[], wired: true };
  } catch {
    return { links: [], wired: false };
  }
}

/** صفّ بندٍ حرٍّ — نموذجٌ مستقل لكل بند (لا نماذج متداخلة في HTML) */
function FreeLinkRow({ link, readOnly }: { link: NavLinkRow; readOnly: boolean }) {
  return (
    <form
      action={saveNavLink.bind(null, link.id)}
      className="flex flex-wrap items-end gap-2 py-3 first:pt-0 last:pb-0"
    >
      <GripVertical className="mb-2 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />

      <div className="min-w-32 flex-1 basis-32 space-y-1">
        <label htmlFor={`link-${link.id}-label`} className="text-xs text-muted-foreground">
          التسمية
        </label>
        <Input
          id={`link-${link.id}-label`}
          name={`link-${link.id}-label`}
          defaultValue={link.label}
          maxLength={NAV_LABEL_MAX}
          disabled={readOnly || link.label_key !== null}
        />
      </div>

      <div className="min-w-36 flex-1 basis-36 space-y-1">
        <label htmlFor={`link-${link.id}-href`} className="text-xs text-muted-foreground">
          الرابط
        </label>
        <Input
          id={`link-${link.id}-href`}
          name={`link-${link.id}-href`}
          dir="ltr"
          defaultValue={link.href}
          disabled={readOnly}
        />
      </div>

      <div className="w-20 space-y-1">
        <label htmlFor={`link-${link.id}-sort`} className="text-xs text-muted-foreground">
          الترتيب
        </label>
        <Input
          id={`link-${link.id}-sort`}
          name={`link-${link.id}-sort`}
          type="number"
          defaultValue={String(link.nav_sort)}
          disabled={readOnly}
        />
      </div>

      <Button type="submit" variant="outline" size="sm" disabled={readOnly}>
        حفظ
      </Button>

      {/*
       * الإخفاء أولاً والحذف بعده — والترتيب مقصود: معرّف الصفّ هو عنوان ترجمة
       * تسميته، فالحذف يُيتّمها ولا يُعاد ما ضاع (نفس علّة `_k` في `0059`).
       */}
      <Button
        type="submit"
        formAction={toggleNavLink.bind(null, link.id)}
        formNoValidate
        variant="ghost"
        size="sm"
        disabled={readOnly}
        title={link.active ? "إخفاء البند من الشريط (يبقى محفوظاً)" : "إظهار البند في الشريط"}
      >
        {link.active ? <EyeOff /> : <Eye />}
        {link.active ? "إخفاء" : "إظهار"}
      </Button>

      <Button
        type="submit"
        formAction={deleteNavLink.bind(null, link.id)}
        formNoValidate
        variant="destructive"
        size="icon-sm"
        disabled={readOnly}
        aria-label={`حذف بند «${link.label}» نهائياً`}
        title="حذف نهائي — والإخفاء أسلم: الحذف يُفقد ترجمة التسمية ولا تُستعاد"
      >
        <Trash2 />
      </Button>

      {link.label_key !== null && (
        <p className="basis-full text-xs text-muted-foreground">
          تسمية هذا البند من ملفّي رسائل الموقع (<code dir="ltr">site.nav.{link.label_key}</code>) —
          مترجمة أصلاً، فلا تُحرَّر من هنا. ورابطه وترتيبه وظهوره لك.
        </p>
      )}
    </form>
  );
}

export async function NavBarCard({ readOnly }: { readOnly: boolean }) {
  const [nav, { links, wired }] = await Promise.all([getSiteNav(), readNavLinks()]);

  /** الصفحات المُعلَّمة كما يراها الزائر — من `site_nav` لا من قراءةٍ ثانية */
  const pageItems = nav.items.filter((item) => item.kind === "page");
  const disabled = readOnly || !wired;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          الشريط العلوي
          <HelpTip>
            شريط التنقّل أعلى كل صفحة، وهو نفسه درج القائمة على الجوال — قائمة واحدة لا
            قائمتان. والصفحات لا تظهر فيه تلقائياً بخلاف التذييل: التذييل خريطة كاملة
            تعرض كل صفحة منشورة، والشريط قائمة منتقاة يتّسع لعدد محدود.
          </HelpTip>
          <Badge variant={nav.overCap ? "destructive" : "outline"}>
            {nav.count} / {nav.cap}
          </Badge>
        </CardTitle>
        <CardDescription>
          ترتيب العرض من الأصغر إلى الأكبر. الصفحات تُضاف وتُسمّى من محرّر كل صفحة، وما
          ليس صفحة (مرساة في الرئيسية، أو صفحة حجز، أو رابط خارجي) يُضاف من هنا.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        {nav.overCap && (
          <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm leading-relaxed">
            <strong>الشريط تجاوز المقاس المريح.</strong> فيه {nav.count} بنداً والمقاس{" "}
            {nav.cap} — وقيس أن ما بعدها يلتف سطرين على الشاشات المتوسطة بالإنجليزية،
            فيصير الشريط سطرين ويفقد فائدته. لا شيء يمنعك من الإبقاء عليها، والأنظف أن
            تُخفي بنداً أو تختصر تسمية طويلة.
          </p>
        )}

        {/*
         * 🔒 مدخل «دخول العملاء» يُذكر ولا يُعرض صفاً — البند الثالث من بنود بدر.
         * فالمالك يقرأ أنه موجود ومحروس، ولا يجد له زرَّ حذفٍ يظنه بنداً عادياً.
         */}
        <p className="rounded-xl border border-border bg-muted/40 p-3 text-sm leading-relaxed text-muted-foreground">
          <strong className="text-foreground">وزرّ «دخول العملاء» ليس بنداً في هذه القائمة.</strong>{" "}
          هو مركّب في الترويسة وفي درج الجوال وفي التذييل معاً، ولا يمكن حذفه من هنا ولا
          إضافة رابط ثانٍ إليه — حتى لا يزول مدخل حسابات عملائك بنقرة. وكذلك زرّ «احجز
          الآن»: هو الإجراء الرئيسي في الترويسة لا بنداً في الشريط.
        </p>

        {/* الصفحات المُعلَّمة — قراءةٌ وإخفاء، والتحرير في محرّر الصفحة */}
        <div className="space-y-2">
          <h4 className="text-sm font-bold">صفحات في الشريط</h4>
          {pageItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              لا صفحة في الشريط بعد. افتح أي صفحة من القوائم أدناه وعلّم «أظهر في الشريط
              العلوي» في بطاقة «الشريط العلوي».
            </p>
          ) : (
            <div className="divide-y divide-border">
              {pageItems.map((item) => (
                <form
                  key={item.id}
                  action={hidePageFromNav.bind(null, item.id)}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2"
                >
                  <span className="font-medium">{item.label}</span>
                  <code dir="ltr" className="text-xs text-muted-foreground">
                    {item.href}
                  </code>
                  <span className="ms-auto flex items-center gap-1">
                    <Link
                      href={`/admin/content/${item.id}`}
                      className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                    >
                      تحرير
                    </Link>
                    <Button
                      type="submit"
                      variant="ghost"
                      size="sm"
                      disabled={disabled}
                      title="إخراج الصفحة من الشريط (تبقى منشورة وفي التذييل)"
                    >
                      <EyeOff />
                      إخراج
                    </Button>
                  </span>
                </form>
              ))}
            </div>
          )}
        </div>

        {/* البنود الحرّة */}
        <div className="space-y-2">
          <h4 className="flex items-center gap-1.5 text-sm font-bold">
            بنود ليست صفحات
            <HelpTip>
              مرساة في الصفحة الرئيسية تبدأ بـ‎/#‎ مثل ‎/#services، أو مسار في الموقع مثل
              ‎/book و‎/track، أو عنوان كامل يبدأ بـhttp. الأربعة الأولى مراسٍ في الرئيسية
              وتسميتها من ملفّي رسائل الموقع فلا تُحرَّر هنا.
            </HelpTip>
          </h4>
          {links.length === 0 ? (
            <p className="text-sm text-muted-foreground">لا بنود حرّة.</p>
          ) : (
            <div className="divide-y divide-border">
              {links.map((link) => (
                <FreeLinkRow key={link.id} link={link} readOnly={disabled} />
              ))}
            </div>
          )}
        </div>

        {/* إضافة بند حرّ — نموذج مستقل */}
        <form action={addNavLink} className="flex flex-wrap items-end gap-2 border-t pt-4">
          <div className="min-w-32 flex-1 basis-32 space-y-1">
            <label htmlFor="new-nav-label" className="text-xs text-muted-foreground">
              التسمية
            </label>
            <Input
              id="new-nav-label"
              name="label"
              placeholder="احجز الآن"
              maxLength={NAV_LABEL_MAX}
              disabled={disabled}
            />
          </div>
          <div className="min-w-36 flex-1 basis-36 space-y-1">
            <label htmlFor="new-nav-href" className="text-xs text-muted-foreground">
              الرابط
            </label>
            <Input
              id="new-nav-href"
              name="href"
              dir="ltr"
              placeholder="/book"
              disabled={disabled}
            />
          </div>
          <Button type="submit" variant="outline" disabled={disabled}>
            <Plus />
            إضافة بند
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
