import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, TriangleAlert } from "lucide-react";

import { RenderSections } from "@/components/sections/render";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { SECTION_TYPE_LABELS, type Section } from "@/lib/content-types";
import { getSettings } from "@/lib/settings";
import { blockLabel } from "@/lib/page-builder/registry";
import { readPreviewBlocks } from "@/lib/page-builder/read";
import { blocksToSections } from "@/lib/page-builder/snapshot";
import type { BuilderBlock } from "@/lib/page-builder-types";

export const metadata = { title: "معاينة الصفحة" };

/**
 * معاينة الصفحة — **مسارٌ تحت `/admin`** لا رابطٌ عام بتوكن (العقد §٧).
 *
 * المبرر مكتوبٌ في العقد ولا يُختصر: `/admin` محجوب في `robots.txt`، ومحروس
 * طبقتين (‏`proxy.ts` + `app/admin/layout.tsx`)، وبلا وسم قياسٍ واحد (**D-44**).
 * أما رابط معاينة عام — ولو بتوكن — فصفحةٌ غير منشورة قابلة للزحف: يكفي أن
 * يُلصق في محادثة أو يُفتح على متصفحٍ يزامن سجلّه.
 *
 * ⚠ **وتُصيَّر بعرضٍ كامل بلا الشريط الجانبي** (`AdminShell` يستثني هذا المسار)،
 * وإلا صارت المعاينة تكذب على من ينظر إليها: عرضٌ أضيق ٢٤٠ بكسل يُظهر تخطيطاً
 * ليس هو تخطيط الصفحة الحقيقي.
 */
export default async function PagePreviewScreen({
  params,
}: PageProps<"/admin/content/[id]/preview">) {
  const { id } = await params;
  const [data, settings] = await Promise.all([readPreviewBlocks(id), getSettings()]);
  if (!data) notFound();

  const { page, blocks, fromDraft } = data;

  /**
   * الأنواع التي لا تعرفها عارضة الموقع بعد. الفحص على `SECTION_TYPE_LABELS`
   * لأنه **مصدر العارضة نفسه** — فيوم تُسجَّل الكتلتان الجديدتان يختفي التحذير
   * وحده بلا سطرٍ يُعدَّل هنا.
   */
  const unknownTypes = Array.from(
    new Set(
      collectTypes(blocks).filter((type) => !(type in SECTION_TYPE_LABELS))
    )
  );

  /**
   * العارضة العامة تقرأ الأقسام **مسطّحةً** وتبني الشجرة بنفسها من `parentId`
   * (‏`components/sections/render.tsx`). فالمعاينة تُسطّح شجرة المنشئ بالترتيب
   * نفسه بدل أن تبني شجرةً ثانية — عارضتان للشيء الواحد تفترقان بعد أول تعديل.
   */
  const sections: Section[] = blocksToSections(blocks, id).map((row) => ({
    id: row.id,
    pageId: row.page_id,
    type: row.type,
    content: row.content,
    sort: row.sort,
    visible: row.visible,
    parentId: row.parent_id,
  })) as unknown as Section[];

  return (
    <div className="min-h-dvh bg-background">
      <div className="sticky top-0 z-40 flex flex-wrap items-center gap-2 border-b border-border bg-background/95 px-4 py-2 backdrop-blur print:hidden">
        <Link
          href={`/admin/content/${id}/builder`}
          className="flex items-center gap-1.5 text-sm font-medium transition-colors hover:text-primary"
        >
          <ArrowRight className="size-4" />
          العودة إلى المنشئ
        </Link>
        <span className="text-sm text-muted-foreground">·</span>
        <span className="truncate text-sm text-muted-foreground">{page.title}</span>
        <Badge variant={fromDraft ? "default" : "outline"} className="ms-auto">
          {fromDraft ? "معاينة المسودة" : "معاينة المنشور الحيّ"}
        </Badge>
      </div>

      {unknownTypes.length > 0 && (
        <div className="px-4 pt-4 print:hidden">
          <Card className="mx-auto flex max-w-3xl flex-row items-start gap-3 border-amber-300 bg-amber-50 p-4 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
            <TriangleAlert className="mt-0.5 size-5 shrink-0" />
            <div className="text-sm leading-relaxed">
              <p className="font-semibold">كتلٌ لا تعرضها هذه المعاينة بعد</p>
              <p>
                {unknownTypes.map((type) => blockLabel(type).label).join(" · ")} — عارضة الموقع
                العام لا تسجّل هذه الأنواع بعد، فهي تُتجاهل هنا كما تُتجاهل على الصفحة. لا تنشر
                صفحةً تعتمد عليها قبل أن تظهر في هذه المعاينة.
              </p>
            </div>
          </Card>
        </div>
      )}

      <RenderSections sections={sections} settings={settings} />
    </div>
  );
}

function collectTypes(blocks: readonly BuilderBlock[]): string[] {
  const out: string[] = [];
  for (const block of blocks) {
    out.push(block.type);
    out.push(...collectTypes(block.children ?? []));
  }
  return out;
}
