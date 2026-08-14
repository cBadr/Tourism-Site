import type { ReactNode } from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";

import { toArabicDigits } from "@/components/booking/format";
import { HelpTip } from "@/components/shared/HelpTip";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AUDITED_ENTITIES, type AuditAttempt, type AuditEntry } from "@/lib/audit-types";
import { statDateLabel } from "@/lib/stats/range";
import { cn } from "@/lib/utils";

import { controlClass, dateTimeLabel, relativeTime } from "../orders/_components/booking-ui";
import {
  ActionBadge,
  ActorKindBadge,
  ChangesList,
  LogsHeader,
  LogsNotReady,
  RejectReasonBadge,
  SnapshotDetails,
  actorDisplayName,
  chipClass,
  entityName,
  roleName,
} from "./_components/logs-ui";
import {
  MAX_ROWS,
  loadLogs,
  readFilters,
  readView,
  type ActorDirectory,
  type AuditFilters,
  type AuditView,
} from "./loader";

/**
 * السجلات — ملاحظة المالك ١٥: «نظام سجلات متكامل وشامل يسجّل كل حدث ويربط كل
 * شيء ببعضه، فيمكن تتبّع حركات المستخدمين وكل إجراء أو تعديل والرجوع إلى أي حدث
 * في الماضي بالتفصيل».
 *
 * **شاشة قراءة محضة**: لا `actions.ts` بجوارها ولا Server Action في هذا الملف
 * ولا زر يكتب حرفاً — تماماً كـ`app/admin/seo/audit/page.tsx`. وليس ذلك تقصيراً
 * بل شرط صحة: `audit_log` جدولٌ append-only مسحوبةٌ منه صلاحيات الكتابة والتفريغ
 * من كل دور (0036)، وشاشةٌ تعرض زر تحرير فوقه تَعِد بما تمنعه القاعدة.
 *
 * ثلاثة قرارات في هذه الشاشة تحديداً:
 *
 * (١) **صفر تجميع في TypeScript** — ولا حتى عدّاد صفوف. الشاشة لا تكتب رقماً
 *     واحداً لم يصل من القاعدة: لا «٤٧ حدثاً»، ولا عدّاد على تبويب، ولا نسبة.
 *     وسقف الصفوف يُذكر بقيمته الثابتة لا بعدّ ما وصل.
 *
 * (٢) **الحالة في الرابط لا في الذاكرة.** التبويبات روابط بـ`aria-current`
 *     والفترة نموذج `method="get"` — فرابط «كل ما فعله فلان في هذا الأسبوع»
 *     يُنسخ ويُرسل ويُحفظ في المفضلة، وهو أول ما يحتاجه من يدقّق حادثة.
 *
 * (٣) **لا جدول فارغ بلا سبب.** كل مسار لا يصل فيه صفٌّ بيقين ينتهي إلى
 *     `LogsNotReady` بسببٍ مسمّى. جدولٌ فارغ على شاشة سجلات يقول «لم يقع شيء»،
 *     وهي أخطر جملة يمكن أن تكذب بها شاشة تدقيق.
 */

export const metadata = { title: "السجلات" };

const VIEWS: { key: AuditView; label: string }[] = [
  { key: "log", label: "الأحداث المنفَّذة" },
  { key: "attempts", label: "المحاولات المرفوضة" },
];

// ---------------------------------------------------------------------------
// خلايا يشترك فيها جدول السجل وجدول المحاولات
// ---------------------------------------------------------------------------

function TimeCell({ at }: { at: string }) {
  return (
    <>
      <span className="block">{dateTimeLabel(at)}</span>
      <span className="mt-0.5 block text-xs text-muted-foreground">{relativeTime(at)}</span>
    </>
  );
}

/**
 * الفاعل — واسمه رابطُ ترشيح على نفسه.
 *
 * الرابط ليس زينة: السؤال التالي بعد «من فعل هذا؟» هو دائماً «وماذا فعل غير
 * هذا؟»، وضغطة واحدة تجيبه بدل نسخ uuid في حقل.
 */
function ActorCell({
  actor,
  actorKind,
  actors,
  href,
}: {
  actor: string | null;
  actorKind: string;
  actors: ActorDirectory;
  href: string | null;
}) {
  const name = actor ? actorDisplayName(actor, actors.byId.get(actor)?.name ?? null) : "بلا حساب";
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {actor && href ? (
        <Link
          href={href}
          title="اعرض كل ما فعله هذا الحساب"
          className="font-medium transition-colors hover:text-primary hover:underline"
        >
          {name}
        </Link>
      ) : (
        <span className="font-medium">{name}</span>
      )}
      <ActorKindBadge kind={actorKind} />
    </span>
  );
}

/** روابط «يربط كل شيء ببعضه»: من سطر السجل إلى الحجز أو ملف المتعهد */
function RelationLinks({ entry }: { entry: AuditEntry }) {
  if (!entry.bookingId && !entry.subcontractorId) return null;
  return (
    <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
      {entry.bookingId ? (
        <Link
          href={`/admin/orders/${entry.bookingId}`}
          className="inline-flex items-center gap-1 text-primary hover:underline"
        >
          الحجز
          <ExternalLink className="size-3" aria-hidden="true" />
        </Link>
      ) : null}
      {entry.subcontractorId ? (
        <Link
          href={`/admin/subcontractors/${entry.subcontractorId}`}
          className="inline-flex items-center gap-1 text-primary hover:underline"
        >
          المتعهد
          <ExternalLink className="size-3" aria-hidden="true" />
        </Link>
      ) : null}
    </span>
  );
}

/** الكيان: لقطته النصية (تبقى بعد حذفه) ثم معرّفه المختصر */
function EntityCell({ entry }: { entry: AuditEntry }) {
  return (
    <>
      <span className="block font-medium">{entry.entityLabel ?? "—"}</span>
      {entry.entityId ? (
        <span dir="ltr" className="mt-0.5 block text-[11px] text-muted-foreground">
          {entry.entityId}
        </span>
      ) : null}
      <RelationLinks entry={entry} />
    </>
  );
}

/** التفصيل: فروق التعديل، ولقطة الحذف مطويّة، وملاحظة المشغّل إن كُتبت */
function DetailCell({ entry }: { entry: AuditEntry }) {
  return (
    <>
      <ChangesList changes={entry.changes} />
      <SnapshotDetails snapshot={entry.snapshot} />
      {entry.note ? (
        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{entry.note}</p>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// السجل المنفَّذ
// ---------------------------------------------------------------------------

function EntryRow({
  entry,
  actors,
  actorHref,
}: {
  entry: AuditEntry;
  actors: ActorDirectory;
  actorHref: (actor: string) => string;
}) {
  return (
    <tr className="border-b border-border align-top last:border-0 hover:bg-muted/40">
      <td className="w-44 p-2 text-sm">
        <TimeCell at={entry.occurredAt} />
      </td>
      <td className="w-44 p-2 text-sm">
        <ActorCell
          actor={entry.actor}
          actorKind={entry.actorKind}
          actors={actors}
          href={entry.actor ? actorHref(entry.actor) : null}
        />
      </td>
      <td className="w-40 p-2 text-sm">
        <span className="block">{entityName(entry.entity)}</span>
        <ActionBadge action={entry.action} className="mt-1" />
      </td>
      <td className="w-52 p-2 text-sm">
        <EntityCell entry={entry} />
      </td>
      <td className="p-2">
        <DetailCell entry={entry} />
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// المحاولات المرفوضة
// ---------------------------------------------------------------------------

function AttemptRow({
  attempt,
  actors,
  actorHref,
}: {
  attempt: AuditAttempt;
  actors: ActorDirectory;
  actorHref: (actor: string) => string;
}) {
  return (
    <tr className="border-b border-border align-top last:border-0 hover:bg-muted/40">
      <td className="w-44 p-2 text-sm">
        <TimeCell at={attempt.occurredAt} />
      </td>
      <td className="w-44 p-2 text-sm">
        <ActorCell
          actor={attempt.actor}
          actorKind={attempt.actorKind}
          actors={actors}
          href={attempt.actor ? actorHref(attempt.actor) : null}
        />
      </td>
      <td className="w-44 p-2 text-sm">
        <code dir="ltr" className="rounded bg-muted px-1 py-0.5 text-[11px]">
          {attempt.operation}
        </code>
      </td>
      <td className="w-40 p-2 text-sm">
        <RejectReasonBadge reason={attempt.reason} />
      </td>
      <td className="p-2 text-sm">
        <span className="block">{attempt.entity ? entityName(attempt.entity) : "—"}</span>
        {attempt.entityId ? (
          <span dir="ltr" className="mt-0.5 block text-[11px] text-muted-foreground">
            {attempt.entityId}
          </span>
        ) : null}
        {attempt.detail ? (
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{attempt.detail}</p>
        ) : null}
      </td>
    </tr>
  );
}

/**
 * غلاف الجدول — **جدول واحد يتمدّد أفقياً، بلا نسخة بطاقات للموبايل.**
 *
 * وهذا خروجٌ مقصود عن نمط `app/admin/orders/page.tsx` الذي يرسم جدولاً للشاشة
 * الكبيرة وبطاقات للموبايل. سببه أن الازدواج هناك يكلّف سطراً خفيفاً مرتين،
 * وهنا يكلّف **لقطة صفٍّ محذوف كاملة مرتين**: القياس على البيانات الحيّة كان
 * ‏٤٫٥ ميغابايت من HTML و‏١٢ ثانية تصيير لمئتَي سطر، نصفها نسخةٌ لا يراها أحد
 * لأن `md:hidden` تخفيها على نفس الشاشة التي يظهر فيها الجدول. والبديل بلا
 * خسارة: الغلاف `overflow-x-auto` نفسه المستعمل في كل جداول اللوحة يجعل الجدول
 * قابلاً للسحب أفقياً على الموبايل.
 */
function TableFrame({ minWidth, children }: { minWidth: string; children: ReactNode }) {
  return (
    <Card className="p-0">
      <div className="overflow-x-auto">
        <table className={cn("w-full text-sm", minWidth)}>{children}</table>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// الشاشة
// ---------------------------------------------------------------------------

/** وصف الفترة السارية بالعربية — «كل التاريخ» حين لا حدّ، كي لا يُظن أن ما يُعرض كلُّ ما وقع */
function rangeSentence(filters: AuditFilters): string {
  if (!filters.from && !filters.to) return "كل التاريخ";
  if (filters.from && filters.to) {
    return filters.from === filters.to
      ? statDateLabel(filters.from)
      : `${statDateLabel(filters.from)} — ${statDateLabel(filters.to)}`;
  }
  return filters.from ? `من ${statDateLabel(filters.from)}` : `حتى ${statDateLabel(filters.to)}`;
}

export default async function LogsPage({ searchParams }: PageProps<"/admin/logs">) {
  const params = await searchParams;
  const view = readView(params.view);
  const filters = readFilters(params);

  const load = await loadLogs(view, filters);
  const { actors, wired } = load;

  /**
   * بناء رابط بحالة الشاشة الحالية مع تعديل جزئي — والقيمة `null` تحذف المعامل.
   * الافتراضات لا تُكتب في الرابط (‏`view=log`، بلا جدول) فيبقى قصيراً ومقروءاً.
   */
  const hrefWith = (patch: Partial<Record<string, string | null>>): string => {
    const merged: Record<string, string | null> = {
      view: view === "attempts" ? "attempts" : null,
      entity: filters.entity,
      actor: filters.actor,
      from: filters.from,
      to: filters.to,
      ...patch,
    };
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(merged)) {
      if (value) qs.set(key, value);
    }
    const query = qs.toString();
    return query ? `/admin/logs?${query}` : "/admin/logs";
  };

  const actorHref = (actor: string) => hrefWith({ actor });
  const activeActor = filters.actor ? actors.byId.get(filters.actor) : undefined;

  const ready = load.view === "log" ? load.entries.ready : load.attempts.ready;
  const failure = load.view === "log" ? load.entries.failure : load.attempts.failure;
  const missing = load.view === "log" ? load.entries.missing : load.attempts.missing;
  const empty =
    load.view === "log" ? load.entries.data.length === 0 : load.attempts.data.length === 0;
  const filtered = Boolean(filters.entity || filters.actor || filters.from || filters.to);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <LogsHeader
        title="السجلات"
        help={
          <>
            كل إضافة وتعديل وحذف على الجداول المرصودة يُكتب هنا بمُشغّل داخل قاعدة البيانات، لا
            بنداء من الخادم — فلا مسار تعديلٍ يفلت من التسجيل ولا فاعلَ يُنتحَل. والسجل يُقرأ
            ولا يُكتب ولا يُحذف: صلاحيات الكتابة والتفريغ مسحوبة من كل الأدوار، ومن هذه الشاشة
            قبل غيرها.
          </>
        }
        description="تاريخ المنصة: من فعل، ومتى، وعلى أي صف، وما الذي تغيّر بالضبط."
      />

      {/* وجها النظام: المنفَّذ يكتبه مُشغّل داخل المعاملة، والمرفوض يكتبه الخادم بعد فشلها */}
      <nav aria-label="وجه السجل" className="flex flex-wrap items-center gap-1.5">
        {VIEWS.map((item) => (
          <Link
            key={item.key}
            href={hrefWith({ view: item.key === "attempts" ? "attempts" : null })}
            aria-current={item.key === view ? "page" : undefined}
            className={chipClass(item.key === view)}
          >
            {item.label}
          </Link>
        ))}
        <HelpTip>
          «الأحداث المنفَّذة» تُكتب بمُشغّل داخل معاملة التغيير نفسها، فتثبت معها وتُلغى معها ولا
          يمكن تخطّيها بأي مسار. و«المحاولات المرفوضة» يكتبها الخادم من معاملة ثانية بعد التقاط
          الخطأ — لأن الاستثناء يُلغي كل ما كُتب في معاملته بما في ذلك سطر السجل نفسه. الجدولان
          منفصلان عمداً: ثقتهما البنيوية مختلفة، وخلطهما يُلبِس الأضعفَ ضمانةَ الأقوى.
        </HelpTip>
      </nav>

      {/* الترشيح: نموذج GET حتى يبقى الرابط قابلاً للمشاركة ويعمل بجافاسكربت معطّل */}
      <form action="/admin/logs" method="get">
        <Card className="gap-3 p-4">
          {view === "attempts" && <input type="hidden" name="view" value="attempts" />}
          {filters.entity && <input type="hidden" name="entity" value={filters.entity} />}

          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="logs-from" className="text-xs">
                من تاريخ
              </Label>
              <Input
                id="logs-from"
                name="from"
                type="date"
                dir="ltr"
                defaultValue={filters.from ?? ""}
                className="w-40"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="logs-to" className="text-xs">
                إلى تاريخ
              </Label>
              <Input
                id="logs-to"
                name="to"
                type="date"
                dir="ltr"
                defaultValue={filters.to ?? ""}
                className="w-40"
              />
            </div>

            <div className="min-w-52 flex-1 space-y-1.5">
              <Label htmlFor="logs-actor" className="flex items-center gap-1.5 text-xs">
                الفاعل
                <HelpTip>
                  الحسابات العاملة (مشرف · تشغيل · متعهد). والفاعل الذي لا اسم له في هذه
                  القائمة — حسابٌ حُذف مثلاً — يظهر في الجدول بمعرّفه المختصر وصنفه، ويمكن
                  الترشيح عليه بالضغط على اسمه في أي سطر.
                </HelpTip>
              </Label>
              <select
                id="logs-actor"
                name="actor"
                defaultValue={filters.actor ?? ""}
                className={controlClass}
              >
                <option value="">كل الفاعلين</option>
                {actors.list.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {actorDisplayName(profile.id, profile.name)}
                    {profile.role ? ` — ${roleName(profile.role)}` : ""}
                  </option>
                ))}
                {/* الفاعل المُرشَّح عليه وليس في الدليل: يبقى خياراً مختاراً بدل أن يُمحى بأول «تطبيق» */}
                {filters.actor && !activeActor ? (
                  <option value={filters.actor}>{actorDisplayName(filters.actor, null)}</option>
                ) : null}
              </select>
            </div>

            <Button type="submit">تطبيق</Button>
            {filtered ? (
              <Link
                href={hrefWith({ entity: null, actor: null, from: null, to: null })}
                className="pb-1.5 text-sm text-muted-foreground transition-colors hover:text-primary hover:underline"
              >
                مسح الترشيح
              </Link>
            ) : null}
          </div>

          <p className="text-xs leading-relaxed text-muted-foreground">
            الفترة المعروضة: {rangeSentence(filters)} — بتوقيت القاهرة، كما تحسبها قاعدة
            البيانات. وبلا تاريخين يُعرض أحدث ما وقع بلا حدٍّ زمني.
          </p>
        </Card>
      </form>

      {/* تبويبات الجداول — تُبنى من `AUDITED_ENTITIES` نفسها لا من قائمة مكتوبة هنا،
          فجدولٌ يُرصد في الهجرة يظهر تبويبه بلا لمس هذا الملف. وبلا عدّادات: كل
          رقم على هذه الشاشة يجب أن يصل محسوباً من القاعدة. */}
      <nav
        aria-label="ترشيح السجل بالجدول"
        className="flex flex-wrap items-center gap-1.5 rounded-xl bg-card p-2 ring-1 ring-foreground/10"
      >
        <Link
          href={hrefWith({ entity: null })}
          aria-current={filters.entity === null ? "page" : undefined}
          className={chipClass(filters.entity === null)}
        >
          الكل
        </Link>
        {AUDITED_ENTITIES.map((entity) => (
          <Link
            key={entity}
            href={hrefWith({ entity })}
            aria-current={filters.entity === entity ? "page" : undefined}
            title={entity}
            className={chipClass(filters.entity === entity)}
          >
            {entityName(entity)}
          </Link>
        ))}
      </nav>

      {filters.actor ? (
        <p className="text-sm text-muted-foreground">
          مقصور على الفاعل{" "}
          <span className="font-medium text-foreground">
            {actorDisplayName(filters.actor, activeActor?.name ?? null)}
          </span>
          {activeActor?.role ? <span className="text-xs"> ({roleName(activeActor.role)})</span> : null}{" "}
          —{" "}
          <Link href={hrefWith({ actor: null })} className="text-primary hover:underline">
            إلغاء ترشيح الفاعل
          </Link>
        </p>
      ) : null}

      {!ready ? (
        <LogsNotReady wired={wired} missing={missing ?? "audit_log"} failure={failure} />
      ) : empty ? (
        <Card className="p-5 text-sm leading-relaxed text-muted-foreground">
          {filtered
            ? "لا أحداث مطابقة لهذا الترشيح — وسّع الفترة أو اختر «الكل» في الجداول."
            : view === "attempts"
              ? "لا محاولات مرفوضة مسجّلة. القراءة نجحت فعلاً — هذا فراغٌ حقيقي لا تعذّرُ وصول."
              : "لا أحداث في السجل بعد. أول تعديل على أي جدول مرصود يظهر هنا فور وقوعه."}
        </Card>
      ) : load.view === "log" ? (
        <TableFrame minWidth="min-w-[60rem]">
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground">
              <th className="p-2 text-start font-medium">الوقت</th>
              <th className="p-2 text-start font-medium">الفاعل</th>
              <th className="p-2 text-start font-medium">الجدول والإجراء</th>
              <th className="p-2 text-start font-medium">الصف</th>
              <th className="p-2 text-start font-medium">ما تغيّر</th>
            </tr>
          </thead>
          <tbody>
            {load.entries.data.map((entry) => (
              <EntryRow key={entry.id} entry={entry} actors={actors} actorHref={actorHref} />
            ))}
          </tbody>
        </TableFrame>
      ) : (
        <TableFrame minWidth="min-w-[52rem]">
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground">
              <th className="p-2 text-start font-medium">الوقت</th>
              <th className="p-2 text-start font-medium">الفاعل</th>
              <th className="p-2 text-start font-medium">العملية</th>
              <th className="p-2 text-start font-medium">سبب الرفض</th>
              <th className="p-2 text-start font-medium">الصف والتفصيل</th>
            </tr>
          </thead>
          <tbody>
            {load.attempts.data.map((attempt) => (
              <AttemptRow
                key={attempt.id}
                attempt={attempt}
                actors={actors}
                actorHref={actorHref}
              />
            ))}
          </tbody>
        </TableFrame>
      )}

      {ready && !empty ? (
        <p className="pb-8 text-xs leading-relaxed text-muted-foreground">
          تُعرض أحدث {toArabicDigits(MAX_ROWS)} سطر كحدٍّ أقصى لكل ترشيح — ضيّق الفترة أو اختر
          جدولاً للوصول إلى الأقدم. وأسماء الأعمدة وقيمها تُعرض كما هي مخزَّنة في قاعدة البيانات
          حتى تُطابَق بها حرفاً بحرف. أما القيم الحساسة — مفاتيح البوابات وهواتف العملاء وتوكنات
          المتابعة — فلا تُنسخ إلى السجل أصلاً: القاعدة تسجّل أنها تغيّرت وتحجب قيمتها قبل كتابة
          السطر، فلا يصير السجلّ نسخةً ثانية من الأسرار.
        </p>
      ) : null}
    </div>
  );
}
