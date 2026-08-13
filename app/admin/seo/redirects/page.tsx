import { ArrowLeft, Info, Plus, Power, PowerOff, Save, ShieldAlert } from "lucide-react";

import { HelpTip } from "@/components/shared/HelpTip";
import { toArabicDigits } from "@/components/booking/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { createServerSupabase } from "@/lib/supabase/server";
import { REDIRECTS_CACHE_TTL_MS, REDIRECT_STATUS_CODES } from "@/lib/seo/redirects";
import {
  REDIRECT_ERROR_MESSAGES,
  isLiveSitePath,
  type RedirectRecord,
} from "@/lib/seo/validate";

import { fieldControlClass } from "../../content/_components/fields";
import { MissingTableNotice, PathCode, SeoTabs } from "../_components/seo-ui";
import { createRedirect, toggleRedirect, updateRedirect } from "./actions";
import { loadPagePaths, loadRedirects } from "./loader";

export const metadata = { title: "تحويلات الروابط" };

const hasSupabaseEnv = () =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

/** كل رمز حالة بما يعنيه للزائر ولمحرك البحث — لا رقم عارٍ في قائمة */
const STATUS_LABELS: Record<number, string> = {
  301: "٣٠١ — نقل دائم (الموصى به)",
  302: "٣٠٢ — نقل مؤقت",
  307: "٣٠٧ — مؤقت يحافظ على نوع الطلب",
  308: "٣٠٨ — دائم يحافظ على نوع الطلب",
};

const STATUS_SHORT: Record<number, string> = {
  301: "٣٠١ دائم",
  302: "٣٠٢ مؤقت",
  307: "٣٠٧ مؤقت",
  308: "٣٠٨ دائم",
};

const SAVED_MESSAGES: Record<string, string> = {
  created: "أُضيف التحويل.",
  updated: "حُفظ التعديل.",
  enabled: "فُعِّل التحويل.",
  disabled: "عُطِّل التحويل — الرابط القديم عاد يعمل كما كان.",
};

const ERROR_MESSAGES: Record<string, string> = {
  ...REDIRECT_ERROR_MESSAGES,
  env: "قاعدة البيانات غير مربوطة — لا يمكن الحفظ بعد.",
  save: "فشل الحفظ — تأكد أنك مسجل الدخول بحساب دوره admin (فخ الصفوف الصفرية).",
  load: "تعذّرت قراءة التحويلات من قاعدة البيانات — أعد المحاولة.",
  missing: "جدول التحويلات غير موجود بعد — نفّذ هجرات قاعدة البيانات أولاً.",
};

const ttlSeconds = Math.round(REDIRECTS_CACHE_TTL_MS / 1000);

function StatusSelect({
  name,
  defaultValue,
  disabled,
  id,
}: {
  name: string;
  defaultValue: number;
  disabled: boolean;
  id: string;
}) {
  return (
    <select
      id={id}
      name={name}
      defaultValue={String(defaultValue)}
      disabled={disabled}
      className={cn(fieldControlClass, "h-8 py-1")}
    >
      {REDIRECT_STATUS_CODES.map((code) => (
        <option key={code} value={code}>
          {STATUS_LABELS[code]}
        </option>
      ))}
    </select>
  );
}

/** صف تحويل قائم: نموذج تعديل مستقل، ونموذج التفعيل **خارجه** */
function RedirectRow({
  rule,
  disabled,
  highlighted,
  shadowsLivePage,
}: {
  rule: RedirectRecord;
  disabled: boolean;
  highlighted: boolean;
  /** القاعدة تُغطّي مساراً صار صفحة حيّة بعد إنشائها */
  shadowsLivePage: boolean;
}) {
  return (
    <Card
      className={cn(
        "space-y-3 p-4",
        !rule.enabled && "opacity-70",
        highlighted && "border-red-400 ring-2 ring-red-300 dark:border-red-700 dark:ring-red-800"
      )}
    >
      {shadowsLivePage && (
        <div className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 p-3 text-sm leading-relaxed text-red-900 dark:border-red-700 dark:bg-red-950 dark:text-red-100">
          <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            صار لهذا المسار صفحة حقيقية في الموقع بعد إنشاء التحويل — والتحويل يسبق
            التوجيه، فالصفحة لا يصل إليها أحد الآن. عطّل هذا التحويل ليعود الزوار إليها.
          </span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm">
        <PathCode>{rule.fromPath}</PathCode>
        <ArrowLeft className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <PathCode>{rule.toPath}</PathCode>
        <Badge variant="outline">{STATUS_SHORT[rule.statusCode]}</Badge>

        {rule.enabled ? (
          <Badge className="border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-100">
            يعمل
          </Badge>
        ) : (
          <Badge variant="secondary">معطّل</Badge>
        )}

        {/* نموذج مستقل: نموذج داخل نموذج غير صالح في HTML والمتصفح يُسقط الداخلي */}
        <form action={toggleRedirect.bind(null, rule.id)} className="ms-auto">
          <Button type="submit" variant="ghost" size="sm" disabled={disabled}>
            {rule.enabled ? <PowerOff /> : <Power />}
            {rule.enabled ? "تعطيل" : "تفعيل"}
          </Button>
        </form>
      </div>

      <form action={updateRedirect.bind(null, rule.id)} className="space-y-3">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={`from-${rule.id}`} className="text-xs text-muted-foreground">
              المسار القديم
            </Label>
            <Input
              id={`from-${rule.id}`}
              name="from_path"
              dir="ltr"
              defaultValue={rule.fromPath}
              disabled={disabled}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`to-${rule.id}`} className="text-xs text-muted-foreground">
              المسار الجديد
            </Label>
            <Input
              id={`to-${rule.id}`}
              name="to_path"
              dir="ltr"
              defaultValue={rule.toPath}
              disabled={disabled}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`status-${rule.id}`} className="text-xs text-muted-foreground">
              نوع التحويل
            </Label>
            <StatusSelect
              id={`status-${rule.id}`}
              name="status_code"
              defaultValue={rule.statusCode}
              disabled={disabled}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`note-${rule.id}`} className="text-xs text-muted-foreground">
              ملاحظة داخلية
            </Label>
            <Input
              id={`note-${rule.id}`}
              name="note"
              defaultValue={rule.note ?? ""}
              placeholder="لماذا أُنشئ هذا التحويل؟"
              disabled={disabled}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <Label className="flex cursor-pointer items-center gap-2 text-sm font-normal">
            <input
              type="checkbox"
              name="enabled"
              defaultChecked={rule.enabled}
              disabled={disabled}
              className="size-4 shrink-0 accent-primary"
            />
            مفعّل
          </Label>
          <Button type="submit" variant="outline" size="sm" disabled={disabled}>
            <Save />
            حفظ التعديل
          </Button>
        </div>
      </form>
    </Card>
  );
}

export default async function RedirectsPage({
  searchParams,
}: PageProps<"/admin/seo/redirects">) {
  const [params, supabase] = await Promise.all([searchParams, createServerSupabase()]);

  const wired = hasSupabaseEnv();
  const [load, pagePaths] = supabase
    ? await Promise.all([loadRedirects(supabase), loadPagePaths(supabase)])
    : [{ rows: [], missingTable: false, failed: false }, [] as string[]];

  const disabled = !wired || load.missingTable || load.failed;
  const saved = typeof params.saved === "string" ? params.saved : null;
  const error = typeof params.error === "string" ? params.error : null;
  const errorRow = typeof params.row === "string" ? params.row : null;

  const active = load.rows.filter((row) => row.enabled);

  /**
   * فحص ما بعد الحفظ: التحقق يمنع إنشاء تحويل من مسار حيّ، لكنه لا يمنع أن
   * تُنشأ صفحة **لاحقاً** على مسار محوَّل. والتحويل يقع في الوسيط قبل التوجيه،
   * فالصفحة الجديدة تصير غير قابلة للوصول بلا أي رسالة خطأ — أخطر عطب صامت في
   * هذه الشاشة، فيُعرض على الصف نفسه لا في تقرير منفصل.
   */
  const shadowing = new Set(
    load.rows
      .filter((row) => row.enabled && isLiveSitePath(row.fromPath, pagePaths))
      .map((row) => row.id)
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-heading text-lg font-bold">تحويلات الروابط</h2>
        <HelpTip>
          حين يتغيّر عنوان صفحة أو تُحذف، يبقى الرابط القديم منشوراً في نتائج البحث وفي
          مواقع أخرى. التحويل ينقل الزائر — ووزن الصفحة في نتائج البحث — إلى العنوان
          الجديد بدل صفحة «غير موجودة».
        </HelpTip>
      </div>

      <SeoTabs active="/admin/seo/redirects" />

      {!wired && (
        <Card className="flex flex-row items-start gap-3 border-amber-300 bg-amber-50 p-4 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
          <Info className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <p className="text-sm leading-relaxed">
            قاعدة البيانات غير مربوطة — الشاشة معروضة للاطلاع والتحرير معطّل.
          </p>
        </Card>
      )}

      {load.missingTable && <MissingTableNotice table="public.redirects" phase="المرحلة ١٠" />}

      {load.failed && (
        <Card className="flex flex-row items-center gap-3 border-red-300 bg-red-50 p-4 text-red-900 dark:border-red-700 dark:bg-red-950 dark:text-red-100">
          <p className="text-sm font-medium">{ERROR_MESSAGES.load}</p>
        </Card>
      )}

      {saved && (
        <Card className="flex flex-row items-center gap-3 border-emerald-300 bg-emerald-50 p-4 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-100">
          <p className="text-sm font-medium">
            {SAVED_MESSAGES[saved] ?? "حُفظ التغيير."} يسري على الزوار خلال{" "}
            {toArabicDigits(ttlSeconds)} ثانية على الأكثر.
          </p>
        </Card>
      )}

      {error && (
        <Card className="flex flex-row items-start gap-3 border-red-300 bg-red-50 p-4 text-red-900 dark:border-red-700 dark:bg-red-950 dark:text-red-100">
          <p className="text-sm leading-relaxed font-medium">
            {ERROR_MESSAGES[error] ?? "حدث خطأ غير متوقع."}
          </p>
        </Card>
      )}

      {/* الصدق عن آلية السريان — لا نَعِد بفورية لا تُنفَّذ */}
      <Card className="flex flex-row items-start gap-3 border-sky-300 bg-sky-50 p-4 text-sky-900 dark:border-sky-700 dark:bg-sky-950 dark:text-sky-100">
        <Info className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
        <div className="space-y-1 text-sm leading-relaxed">
          <p className="font-semibold">كيف يعمل التحويل هنا بالضبط</p>
          <ul className="list-inside list-disc space-y-1">
            <li>
              التحويل يُطبَّق على الصفحات العامة وحدها — لا يمس لوحة التحكم ولا بوابة
              المتعهدين ولا مسارات <code dir="ltr">/api</code> ولا الملفات.
            </li>
            <li>
              اكتب القاعدة بالمسار العربي الأصيل مرة واحدة (<code dir="ltr">/old</code> ←{" "}
              <code dir="ltr">/new</code>): تعمل تلقائياً على النسخة الإنجليزية{" "}
              <code dir="ltr">/en/old</code> ولا يفقد الزائر لغته.
            </li>
            <li>
              التحويلات مقروءة بذاكرة قصيرة، فأي تعديل يسري خلال{" "}
              <strong>{toArabicDigits(ttlSeconds)} ثانية</strong> على الأكثر — لا لحظياً.
            </li>
            <li>
              سلسلة (أ ← ب ← ج) تُطوى تلقائياً إلى قفزة واحدة، وأي حلقة تُلغي التحويل
              كلياً بدل أن تعلّق المتصفح.
            </li>
          </ul>
        </div>
      </Card>

      <Card className="space-y-4 p-5">
        <div>
          <h3 className="flex items-center gap-1.5 font-heading text-base font-bold">
            تحويل جديد
            <HelpTip>
              المسار القديم هو ما يكتبه الزائر أو يفتحه من نتائج البحث، والجديد هو الوجهة.
              كلاهما مسار داخلي يبدأ بشرطة مائلة — لا رابط كامل بنطاق.
            </HelpTip>
          </h3>
          <p className="text-sm text-muted-foreground">
            لا يُقبل تحويل من مسار صفحة تعمل فعلاً، ولا تحويل يُغلق حلقة.
          </p>
        </div>

        <form action={createRedirect} className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="new-from" className="text-xs text-muted-foreground">
                المسار القديم
              </Label>
              <Input
                id="new-from"
                name="from_path"
                dir="ltr"
                placeholder="/old-page"
                disabled={disabled}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-to" className="text-xs text-muted-foreground">
                المسار الجديد
              </Label>
              <Input
                id="new-to"
                name="to_path"
                dir="ltr"
                placeholder="/services/airport-transfer"
                disabled={disabled}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-status" className="text-xs text-muted-foreground">
                نوع التحويل
              </Label>
              <StatusSelect
                id="new-status"
                name="status_code"
                defaultValue={301}
                disabled={disabled}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-note" className="text-xs text-muted-foreground">
                ملاحظة داخلية
              </Label>
              <Input
                id="new-note"
                name="note"
                placeholder="لماذا أُنشئ هذا التحويل؟"
                disabled={disabled}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Label className="flex cursor-pointer items-center gap-2 text-sm font-normal">
              <input
                type="checkbox"
                name="enabled"
                defaultChecked
                disabled={disabled}
                className="size-4 shrink-0 accent-primary"
              />
              يعمل فور الحفظ
            </Label>
            <Button type="submit" disabled={disabled}>
              <Plus />
              إضافة التحويل
            </Button>
          </div>
        </form>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-heading text-base font-bold">التحويلات القائمة</h3>
        <Badge variant="outline">{toArabicDigits(load.rows.length)}</Badge>
        <span className="text-xs text-muted-foreground">
          منها {toArabicDigits(active.length)} تعمل الآن
        </span>
      </div>

      {load.rows.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          لا تحويلات بعد. أضف أول تحويل حين تغيّر عنوان صفحة منشورة.
        </Card>
      ) : (
        <div className="space-y-3">
          {load.rows.map((rule) => (
            <RedirectRow
              key={rule.id}
              rule={rule}
              disabled={disabled}
              highlighted={errorRow === rule.id}
              shadowsLivePage={shadowing.has(rule.id)}
            />
          ))}
        </div>
      )}

      <p className="pb-8 text-xs leading-relaxed text-muted-foreground">
        لا يوجد حذف هنا عمداً: التعطيل يفعل للزائر ما يفعله الحذف، ويُبقي سجلاً يشرح لماذا
        كان ذلك الرابط يذهب إلى تلك الوجهة.
      </p>
    </div>
  );
}
