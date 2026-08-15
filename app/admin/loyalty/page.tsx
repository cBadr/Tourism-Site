import { Flame, Power, ScrollText, ShieldAlert, Sparkles } from "lucide-react";

import { formatDateTimeLabel } from "@/components/booking/format";
import { HelpTip } from "@/components/shared/HelpTip";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { blankRead, hasSupabaseEnv, readStatsCurrency, type StatsFailure } from "@/lib/stats/read";
import { createServerSupabase } from "@/lib/supabase/server";
import { CheckboxField, NumberField } from "../discounts/_components/fields";
import {
  DirectionBadge,
  EntryPoints,
  ErrorCard,
  LiabilityCard,
  NoticeCard,
  NotReady,
} from "./_components/loyalty-ui";
import { saveLoyaltySettings } from "./actions";
import {
  LIABILITY_VIEW,
  type LoadedLedger,
  type LoadedLoyaltySettings,
  type LoyaltyLiability,
  readEntryReferences,
  readLoyaltyEntries,
  readLoyaltyLiability,
  readLoyaltySettings,
} from "./loader";
import { LOYALTY_ERRORS, LOYALTY_NOTICES, readLoyaltyError, readLoyaltyNotice } from "./messages";

/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  شاشة الولاء — المرحلة ١٢ب                                                ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * العقد الملزم: `lib/loyalty-types.ts`. هذه الشاشة **تعرض وتكتب مقابض**، ولا
 * تحسب نقطةً ولا جنيهاً.
 *
 * ── ما تفعله هذه الشاشة وما لا تفعله ───────────────────────────────────────
 *
 * السكّ **مُشغّلٌ على انتقال الاكتمال** (‏§٤)، والاستبدال في `redeem_points` وهي
 * التي تنادي `discount_floor_room` فتفرض أرضية الهامش (‏§١ · **D-16**) — **سقفاً
 * واحداً للكوبون والنقاط مجتمعين لا سقفين يُجمعان**. فما هنا شروطٌ يقرؤها
 * المحرّك، ولا تستطيع هذه الشاشة أن تسمح بما ترفضه القاعدة. وكل نصّ هنا يقول
 * أين يقع الإنفاذ صراحةً: شاشةٌ تدّعي إنفاذاً لا تملكه هي النمط ٢ في
 * `handover/LESSONS.md`، وقد وقع في هذا المستودع مرتين.
 *
 * ── وأهمّ ما تفعله يوم شحنها ────────────────────────────────────────────────
 *
 * 🔴 النظام يُشحن **مطفأً**. فأول وظيفة للشاشة أن تجعل تلك الحالة **مقروءة**
 * وتجعل عاقبة تشغيلها **لا تُخطئ**: من لحظة التفعيل تسكّ كل رحلةٍ تكتمل التزاماً
 * مالياً على المنصة، **ولا انتهاء صلاحية لتلك النقاط** (‏§٦) — أي دَينٌ لا يتقادم.
 * ولذلك: بطاقة حالةٍ دائمة أعلى الشاشة، ومربّع إقرارٍ يُشترط عند العبور من مطفأ
 * إلى مفعَّل وحده، وبطاقة التزامٍ لا تُخفي «لا نعرف» خلف صفر.
 *
 * ── ولماذا بلا شريط نبض (‏`PagePulse`) ──────────────────────────────────────
 *
 * **غيابٌ مقيس لا سهو**: `pulse_stats` و`pulse_series` (‏0034 و0035) سبقتا نظام
 * الولاء فلا قسم `loyalty` فيهما — قِيس على القاعدة الحيّة، ولا سطر في تعريف
 * `pulse_stats` يذكره. وقياسه هنا في TypeScript ممنوع (**D-05**، وهو نفس سبب
 * تأجيل نبض `/admin/logs`). فالبند مؤجَّل بوعي، ومُحفِّزه أول هجرة تضيف قسماً —
 * والسجل في `lib/stats/pulse.ts` يحمل السبب مكتوباً.
 */

export const metadata = { title: "الولاء" };

type FailureNote = { kind: StatsFailure; names: string[] };

/**
 * تجميع أسباب «غير جاهزة» — بطاقةٌ لكل **سبب** لا لكل قراءة.
 *
 * حين لا تُنفَّذ الهجرة تفشل القراءات الثلاث بالسبب نفسه، وثلاث بطاقات متطابقة
 * تعلّم القارئ تجاهُلها (وهو الدرس نفسه في القاعدة ١٣: الإنذار الذي يرنّ على
 * ضجيج يصمت يوم الحريق). فتُدمج الأسماء في بطاقةٍ واحدة تقول كلّ ما نقص.
 */
function groupFailures(
  reads: { ready: boolean; failure: StatsFailure | null; missing: string | null }[]
): FailureNote[] {
  const notes: FailureNote[] = [];
  for (const read of reads) {
    if (read.ready) continue;
    const kind: StatsFailure = read.failure ?? "failed";
    const name = read.missing ?? "loyalty";
    const existing = notes.find((note) => note.kind === kind);
    if (existing) {
      if (!existing.names.includes(name)) existing.names.push(name);
      continue;
    }
    notes.push({ kind, names: [name] });
  }
  return notes;
}

/**
 * بطاقة الحالة — أبرز عنصر في الشاشة، وسببُ وجودها أن النظام يُشحن مطفأً.
 *
 * ⚠ **ولا تُعلن حالةً لم تُقرأ**: «مطفأ» يُقال حين نعرف أنه مطفأ فعلاً، لا حين
 * تعذّرت القراءة فسقطنا إلى فراغ. (نفس شرط `settingsRead.ready` في شاشة
 * الخصومات — والفرق أن الخطأ هنا أغلى: يقرأ المالك «مطفأ» فيطمئن، والمحرّك يسكّ.)
 */
function StateBanner({ enabled, ready }: { enabled: boolean; ready: boolean }) {
  if (!ready) {
    return (
      <Card className="flex flex-row items-start gap-3 border-amber-300 bg-amber-50 p-4 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
        <ShieldAlert className="mt-0.5 size-5 shrink-0" />
        <div className="space-y-1 text-sm leading-relaxed">
          <p className="font-semibold">حالة نظام الولاء غير معروفة</p>
          <p>
            تعذّرت قراءة صفّ الإعدادات، فلا تقول هذه الشاشة «مفعَّل» ولا «مطفأ» — كلاهما ادّعاء بلا
            قراءة. راجع البطاقة الكهرمانية أعلاه ثم أعد تحميل الصفحة.
          </p>
        </div>
      </Card>
    );
  }

  if (enabled) {
    return (
      <Card className="flex flex-row items-start gap-3 border-red-300 bg-red-50 p-4 text-red-900 dark:border-red-700 dark:bg-red-950 dark:text-red-100">
        <Flame className="mt-0.5 size-5 shrink-0" />
        <div className="space-y-1 text-sm leading-relaxed">
          <p className="font-semibold">نظام الولاء يعمل الآن — العدّاد يدور</p>
          <p>
            كل رحلة تكتمل من هذه اللحظة <strong>تسكّ نقاطاً</strong>، وكل نقطة مسكوكة{" "}
            <strong>التزامٌ مالي على المنصة</strong> يُدفع لاحقاً خصماً على رحلةٍ قادمة. والنقاط{" "}
            <strong>لا تنتهي صلاحيتها</strong>، فالالتزام لا يتقادم ولا ينزل إلا بالاستبدال.
          </p>
          <p>
            وإطفاء المفتاح يوقف السكّ الجديد <strong>ولا يمحو رصيداً قائماً</strong>: الدفتر مُلحَق
            لا يُمحى، والتصحيح قيدٌ عاكس لا حذف.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="flex flex-row items-start gap-3 border-sky-300 bg-sky-50 p-4 text-sky-900 dark:border-sky-700 dark:bg-sky-950 dark:text-sky-100">
      <Power className="mt-0.5 size-5 shrink-0" />
      <div className="space-y-1 text-sm leading-relaxed">
        <p className="font-semibold">نظام الولاء مطفأ الآن — لا نقطة تُسكّ ولا تُستبدل</p>
        <p>
          وهو مطفأ في البذرة عمداً: لا نظام ولاء يبدأ بلا قرار بشري. ومطفأ يعني{" "}
          <strong>لا سكّ ولا استبدال</strong> — لا «تُسكّ ولا تظهر».
        </p>
        <p>
          🔴 <strong>واقرأ هذا قبل تفعيله:</strong> من لحظة التفعيل تُنشئ{" "}
          <strong>كل رحلة تكتمل التزاماً مالياً</strong> على المنصة بقيمة نقاطها. وهو التزامٌ{" "}
          <strong>مفتوح لا ينتهي بالتقادم</strong> (لا صلاحية للنقاط في هذه الدفعة)، ولا يُلغى
          بإطفاء المفتاح لاحقاً — يبقى في الدفتر حتى يُستبدل خصماً على رحلة. اضبط «قيمة النقطة»
          و«النقاط لكل جنيه» أولاً، فهما معاً يحدّدان حجم الدَّين الذي تبدأ في مراكمته.
        </p>
      </div>
    </Card>
  );
}

function SettingsCard({
  settings,
  ready,
  readOnly,
}: {
  settings: LoadedLoyaltySettings;
  /** هل نجحت قراءة الإعدادات؟ الفشل يُقال، ولا يُقرأ الفراغ على أنه محفوظ */
  ready: boolean;
  readOnly: boolean;
}) {
  return (
    <Card className="space-y-4 p-5">
      <div>
        <h3 className="flex flex-wrap items-center gap-1.5 font-heading text-base font-bold">
          <ShieldAlert className="size-4 shrink-0 text-primary" />
          إعدادات نظام الولاء
          <HelpTip>
            هذه القيم يقرأها المحرّك داخل قاعدة البيانات عند كل رحلةٍ تكتمل وعند كل استبدال.
            تغييرها يسري على الرحلات والاستبدالات الجديدة فوراً، ولا يغيّر نقطةً واحدة سُكّت
            سلفاً ولا جنيهاً في حجزٍ قائم — لقطة سعر الحجز مجمَّدة.
          </HelpTip>
        </h3>
        {!ready ? (
          <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">
            تعذّرت قراءة الإعدادات من قاعدة البيانات — الحقول أدناه فارغة لأننا{" "}
            <strong>لا نعرف</strong> قيمها، لا لأنها أصفار. السبب مذكور في البطاقة الكهرمانية أعلى
            الشاشة.
          </p>
        ) : !settings.exists ? (
          <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">
            لا صفّ إعدادات في قاعدة البيانات بعد. والحقول فارغة عمداً: لا أرقام افتراضية تُعرض هنا
            على أنها محفوظة — اكتب المقابض الأربعة ثم اضغط «حفظ الإعدادات» لإنشاء الصف.
          </p>
        ) : null}
      </div>

      <form action={readOnly ? undefined : saveLoyaltySettings} className="space-y-4">
        <CheckboxField
          id="loyalty-enabled"
          name="enabled"
          label="نظام الولاء مفعَّل"
          defaultChecked={settings.enabled}
          disabled={readOnly}
          help="المفتاح الرئيسي، وهو مطفأ في البذرة عمداً. وهو مطفأ ⇒ لا رحلة تسكّ نقطة ولا عميل يستبدل رصيداً مهما كان رصيده. وتشغيله يبدأ مراكمة التزام مالي فوراً."
        />

        {/* 🔒 مربّع الإقرار يظهر عند احتمال العبور وحده — أي حين النظام مطفأ الآن.
            وظهوره في كل حفظ كان سيحوّله إلى طقسٍ يُعلَّم بلا قراءة، والإنذار الذي
            يرنّ دائماً لا يُسمع. والإجراء يفرضه في القاعدة نفسها بقراءة الحالة
            السابقة من القاعدة لا من هذه الصفحة. */}
        {!settings.enabled ? (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-700 dark:bg-amber-950">
            <CheckboxField
              id="loyalty-ack"
              name="ack"
              label="أُقرّ بأن التفعيل يبدأ سكّ التزام مالي على كل رحلة تكتمل، وأن النقاط المسكوكة لا تنتهي صلاحيتها"
              disabled={readOnly}
              help="مطلوب مرة واحدة فقط: عند العبور من «مطفأ» إلى «مفعَّل». ولا يُطلب في الحفظ العادي ولا عند الإطفاء — الإطفاء يوقف السكّ ولا يُنشئ التزاماً."
            />
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <NumberField
            id="points-per-currency"
            label="النقاط لكل جنيه"
            name="points_per_currency"
            defaultValue={settings.pointsPerCurrency}
            disabled={readOnly}
            required
            step="0.01"
            min={0}
            max={100}
            help="كم نقطة يكسبها العميل عن كل جنيه من سعر الرحلة بعد الخصم وقبل الخدمات الإضافية. والخدمات لا تُكسِب نقاطاً: تكلفتها علينا، فشراؤها بنقاط خسارة صافية لا تنزيل ربح."
            hint="صفر يعني «مفعَّل ولا يسكّ» — والأصحّ للإيقاف هو المفتاح الرئيسي."
          />
          <NumberField
            id="currency-per-point"
            label="قيمة النقطة بالجنيه"
            name="currency_per_point"
            defaultValue={settings.currencyPerPoint}
            disabled={readOnly}
            required
            step="0.01"
            min={0.01}
            max={1000}
            help="ما تساويه النقطة الواحدة عند الاستبدال. وهي الرقم الذي يحوّل «نقاطاً قائمة» إلى «مال مستحق علينا» — فرفعها يرفع قيمة كل رصيدٍ قائم لا الأرصدة الجديدة وحدها."
            hint="أكبر من صفر — والقاعدة نفسها ترفض الصفر. وهو أخطر المقابض الأربعة: يضاعف الالتزام القائم فوراً."
          />
          <NumberField
            id="min-redeem-points"
            label="أقل رصيد يُستبدل (نقطة)"
            name="min_redeem_points"
            defaultValue={settings.minRedeemPoints}
            disabled={readOnly}
            required
            step="1"
            min={0}
            max={1000000}
            help="أقل رصيد يُسمح باستبداله — يمنع حركاتٍ بقروش لا معنى لها في الدفتر. عددٌ صحيح."
          />
          <NumberField
            id="max-redeem-percent"
            label="أقصى نسبة تُدفع بالنقاط (٪)"
            name="max_redeem_percent"
            defaultValue={settings.maxRedeemPercent}
            disabled={readOnly}
            required
            step="0.5"
            min={0}
            max={100}
            help="نسبةً من سعر الرحلة بعد الكوبون. وهذا سقفٌ تجاري لا حاجز أمان: الحاجز الحقيقي أرضية الهامش داخل قاعدة البيانات — سقفٌ واحد للكوبون والنقاط مجتمعين، فلا يمكن لاستبدالٍ أن ينزل بالسعر تحت تكلفة المتعهد زائد أدنى هامش مهما كتبت هنا."
          />
        </div>

        <div className="flex justify-end">
          <Button type="submit" disabled={readOnly}>
            حفظ الإعدادات
          </Button>
        </div>
      </form>
    </Card>
  );
}

function LedgerCard({
  ledger,
  ready,
  references,
}: {
  ledger: LoadedLedger;
  ready: boolean;
  references: Map<string, string>;
}) {
  return (
    <Card className="space-y-4 p-5">
      <div>
        <h3 className="flex flex-wrap items-center gap-1.5 font-heading text-base font-bold">
          <ScrollText className="size-4 shrink-0 text-primary" />
          دفتر الولاء
          <HelpTip>
            دفترٌ مُلحَق لا يُمحى: لا تعديل ولا حذف، والتصحيح <strong>قيدٌ عاكس</strong> يشير إلى
            أصله. ولذلك يبقى تاريخ أي رصيد قابلاً للتفسير بعد سنة — وهو ما يفرّق نظام ولاءٍ عن
            عدّاد. والإشارة في قيمة النقاط نفسها: موجبٌ كسب، وسالبٌ استبدال.
          </HelpTip>
        </h3>
        <p className="mt-0.5 text-sm text-muted-foreground">
          آخر الحركات — <strong>بلا هاتف العميل</strong>: الرصيد يُجمَّع على الهاتف داخل قاعدة
          البيانات، ولا حاجة بشاشة الدفتر إلى أن تصير قائمة أرقام.
        </p>
        {ready && ledger.orderedBy === null && ledger.entries.length > 0 ? (
          <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">
            ⚠ الصفوف وصلت <strong>بلا ترتيب زمني</strong>: لم يُعرف عمود الزمن في{" "}
            <code dir="ltr">loyalty_entries</code>. الأرقام صحيحة والترتيب ليس كذلك.
          </p>
        ) : null}
      </div>

      {!ready ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/30 p-5 text-center">
          <p className="text-sm font-medium">تعذّرت قراءة الدفتر</p>
          <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">
            السبب في البطاقة الكهرمانية أعلى الشاشة. وفراغ هذا الجدول الآن يعني{" "}
            <strong>«لم نقرأ»</strong> لا «لا حركات».
          </p>
        </div>
      ) : ledger.entries.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/30 p-5 text-center">
          <p className="text-sm font-medium">لا حركة في الدفتر بعد</p>
          <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">
            {/* ولا يُقال «وهذا متوقَّع ما دام النظام مطفأً»: الدفتر قد يُقرأ بنجاح بينما
                تعذّرت قراءة الإعدادات، فتصير الجملة تفسيراً لحالةٍ لم تُقرأ. */}
            أول قيدٍ يُكتب حين تكتمل أول رحلة والنظام مفعَّل.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[44rem] text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="p-2 text-start font-medium">الوقت</th>
                <th className="p-2 text-start font-medium">الاتجاه</th>
                <th className="p-2 text-start font-medium">النقاط</th>
                <th className="p-2 text-start font-medium">الحجز</th>
                <th className="p-2 text-start font-medium">ملاحظة</th>
              </tr>
            </thead>
            <tbody>
              {ledger.entries.map((entry) => {
                const reference =
                  entry.bookingReference ??
                  (entry.bookingId ? (references.get(entry.bookingId) ?? null) : null);
                return (
                  <tr
                    key={entry.id}
                    className="border-b border-border align-top last:border-0 hover:bg-muted/40"
                  >
                    <td className="p-2 text-xs whitespace-nowrap text-muted-foreground">
                      {formatDateTimeLabel(entry.occurredAt) ?? "—"}
                    </td>
                    <td className="p-2">
                      <DirectionBadge direction={entry.direction} raw={entry.directionRaw} />
                      {entry.reversesEntryId !== null ? (
                        <span className="mt-1 block text-[11px] text-muted-foreground">
                          يعكس قيداً سابقاً
                        </span>
                      ) : null}
                    </td>
                    <td className="p-2">
                      <EntryPoints points={entry.points} />
                    </td>
                    <td className="p-2">
                      {reference ? (
                        <span dir="ltr" className="font-medium">
                          {reference}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="p-2 text-xs leading-relaxed text-muted-foreground">
                      {entry.note ?? "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

export default async function LoyaltyPage({ searchParams }: PageProps<"/admin/loyalty">) {
  const params = await searchParams;
  const wired = hasSupabaseEnv();
  const supabase = await createServerSupabase();

  const [currency, settingsRead, liabilityRead, ledgerRead] = supabase
    ? await Promise.all([
        readStatsCurrency(supabase),
        readLoyaltySettings(supabase),
        readLoyaltyLiability(supabase),
        readLoyaltyEntries(supabase),
      ])
    : ([
        "EGP",
        blankRead<LoadedLoyaltySettings>(
          {
            id: null,
            exists: false,
            enabled: false,
            pointsPerCurrency: null,
            currencyPerPoint: null,
            minRedeemPoints: null,
            maxRedeemPercent: null,
          },
          "loyalty_settings"
        ),
        blankRead<LoyaltyLiability>(
          { points: null, worth: null, currency: null, accounts: null },
          LIABILITY_VIEW
        ),
        blankRead<LoadedLedger>({ entries: [], orderedBy: null }, "loyalty_entries"),
      ] as const);

  // مراجع الحجوزات قراءةٌ ثانية مستقلة — فشلها يترك خانة المرجع «—» ولا يُسقط الدفتر
  const references = supabase
    ? await readEntryReferences(
        supabase,
        ledgerRead.data.entries
          .map((entry) => entry.bookingId)
          .filter((id): id is string => id !== null)
      )
    : new Map<string, string>();

  const settings = settingsRead.data;
  const notes = groupFailures([settingsRead, liabilityRead, ledgerRead]);
  const notice = readLoyaltyNotice(params);
  const error = readLoyaltyError(params);

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div>
        <h2 className="flex flex-wrap items-center gap-2 font-heading text-lg font-bold">
          <Sparkles className="size-5 shrink-0 text-primary" />
          الولاء والنقاط
          <HelpTip>
            نقاطٌ تُكسب على الرحلات المكتملة وتُستبدل خصماً على رحلةٍ تالية. والاستبدال يقع{" "}
            <strong>بعد الكوبون وقبل الخدمات الإضافية</strong>: بعد الكوبون لأن النقاط مالٌ يملكه
            العميل سلفاً والكوبون تنزيلٌ من المنصة — فلا يُنفق رصيده على مبلغٍ كان سيُحسم عنه
            مجاناً؛ وقبل الخدمات لأن الخدمة بندٌ تكلفته علينا.
          </HelpTip>
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          اضبط المقابض الأربعة، وتابع الالتزام القائم ودفتر الحركات. والقيَم المطبَّقة فعلاً تحسمها
          قاعدة البيانات — هذه الشاشة تكتب شروطاً ولا تحسب نقطةً ولا جنيهاً.
        </p>
      </div>

      {notes.map((note) => (
        <NotReady
          key={note.kind}
          wired={wired}
          missing={note.names.join("، ")}
          failure={note.kind}
        />
      ))}

      {notice && (
        <NoticeCard tone={LOYALTY_NOTICES[notice].tone}>{LOYALTY_NOTICES[notice].text}</NoticeCard>
      )}
      {error && <ErrorCard>{LOYALTY_ERRORS[error]}</ErrorCard>}

      <StateBanner enabled={settings.enabled} ready={settingsRead.ready} />

      <LiabilityCard
        liability={liabilityRead.data}
        ready={liabilityRead.ready}
        fallbackCurrency={currency}
        // `null` = «لم تُقرأ الحالة». والسقوط إلى `false` هنا كان يجعل البطاقة
        // تقول «مطفأ» بينما بطاقة الحالة فوقها تقول «غير معروفة» — رقمان لحقيقة
        // واحدة في شاشة واحدة، وأحدهما يطمئن بلا حق.
        systemEnabled={settingsRead.ready ? settings.enabled : null}
      />

      <SettingsCard
        settings={settings}
        ready={settingsRead.ready}
        readOnly={!settingsRead.ready}
      />

      <LedgerCard ledger={ledgerRead.data} ready={ledgerRead.ready} references={references} />

      <Separator />

      <p className="text-xs leading-relaxed text-muted-foreground">
        هوية صاحب الرصيد هي <strong>رقم الهاتف المُثبَت في الحجز</strong>، والحساب نافذةٌ عليه:
        عشرة حسابات على هاتفٍ واحد ترى الرصيد نفسه لا عشرة أرصدة، ورابطُ حجزٍ أُعيد إرساله يُري
        الرحلة ولا يفتح رصيدها. وثمن ذلك مكتوب لا مخفيّ: من غيّر رقمه فقد رصيده القديم حتى يربط
        حجزاً بالرقم القديم — ومسار الدعم اليدوي يبقى ممكناً بدمجٍ يُسجَّل في الدفتر كأي حركة. ولا
        نقل بين الحسابات ولا إهداء في هذه الدفعة: كل نقلٍ طريقُ غسلٍ للنقاط المسكوكة.
      </p>
    </div>
  );
}
