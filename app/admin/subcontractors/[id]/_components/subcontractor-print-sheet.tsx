import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Printer } from "lucide-react";

import { PrintHeader } from "@/components/admin/print-header";
import { formatDateLabel, formatMoney, toArabicDigits } from "@/components/booking/format";
import { buttonVariants } from "@/components/ui/button";
import { createServerSupabase } from "@/lib/supabase/server";
import { readPartnerCredit, settlementWording } from "../../../finance/_components/finance-ui";
import { asNumber, asText, pick } from "../../../orders/_components/booking-ui";
import { loadPricingContext } from "../../_components/pricing-context";
import { ROUTES_PAGE_SIZE, searchRoutes, type RouteHit } from "../../_components/routes-search";
import {
  LIST_STATUS_LABELS,
  readPriceItem,
  readSubcontractor,
  readVehicle,
  SUB_STATUS_LABELS,
  type PriceItemView,
  type SubcontractorView,
  type VehicleView,
} from "../../_components/subcontractor-ui";
import { loadPartnerMetrics, type PartnerMetrics } from "./partner-metrics";

/**
 * ══════════════════════════════════════════════════════════════════════════
 *  ملفُّ المتعهد على ورق — مستندٌ واحد يخرج من المكتب
 * ══════════════════════════════════════════════════════════════════════════
 *
 * 🔴 الطلب بنصّ المالك (2026-08-18):
 *   «يجب أن تكون هناك إمكانية طباعة ملف المتعهد بشكل احترافي.»
 *
 * ── (١) لماذا مسارٌ مستقلّ `/admin/subcontractors/<id>/print` ──────────────
 *
 * منظومةُ الطباعة في هذا المستودع (الملاحظة ٦) عهدُها واحد: **الشاشةُ نفسها هي
 * الورقة** — تلبس `print-sheet` على جذرها، وتُوسَم أدواتُ تنقّلها `no-print`،
 * وتأخذ ترويستها من `PrintHeader` (‏`app/admin/finance/partners/[id]` و
 * `finance/treasury` و`orders/[id]` كلُّها كذلك). وشاشةُ ملف المتعهد **ليست
 * ورقة**: فيها أزرارُ قرار واعتماد وتحرير خانات وبطاقةُ مستندات سائقين بصور،
 * ولباسُها ثوبَ الورق يعني وسمَ عشرات العناصر بيدٍ في ملفٍّ من ١٦٠٠ سطر.
 *
 * فالمستند صفحةٌ ثانية للبيانات نفسها: **جذرٌ يلبس `print-sheet`، وما فيه كلُّه
 * محتوى** — لا زرَّ قرارٍ ولا نموذج. وهو أيضاً رابطٌ يُفتح ويُطبع ويُحفَظ PDF بلا
 * أن يمرّ أحدٌ على شاشة العمل اليومية.
 *
 * ── (٢) 🔒 ما لا يُطبع، وهو شرطُ التسليم لا تفصيلٌ فيه ─────────────────────
 *
 * | البند | القرار | لماذا |
 * |---|---|---|
 * | **صورُ السائقين ورخصهم** | **لا صورة على الورق إطلاقاً** — يُكتب «موجودة»/«غير مرفوعة» | مستنداتٌ خاصّة بأشخاص؛ والورقة تسافر وتُنسخ ولا تُسترجَع. والحاجة هي **اكتمالُ الملف** لا رؤيةُ الوجه |
 * | **سعرُ العميل والهامش والتكلفة⇐الربح** | لا يظهر أيٌّ منها | D-19، وهذه ورقةٌ قد تُسلَّم للمتعهد نفسه |
 * | **ملاحظاتُ الإدارة عنه** (`subcontractors.notes`) | لا تُطبع | خانةُ رأيٍ داخليّ عنه هو؛ وتسليمُها له بالخطأ لا يُستدرك |
 * | **معرّفُ محادثة تليجرام** | لا يُطبع | معرّفٌ تشغيليّ لا معنى له على ورق، ويكفي «مربوط/غير مربوط» |
 *
 * ✅ **وكلُّ رقمٍ ماليٍّ هنا مستحقُّ المتعهد**: `earned` ما استحقّه عن رحلاته،
 * و`collected` ما قبضه نقداً من عملائنا، و`paid` ما سلّمناه له، و`received` ما
 * سدّده لنا، والصافي `net_due` **بإشارته** — كلُّها من `v_partner_settlements`
 * كما تحسبها القاعدة. وتكلفةُ المسار في جدول الأسعار هي **ما يُدفع له** لا ما
 * يُتقاضى من العميل.
 *
 * ── (٣) ولا رقمَ يُحسب هنا (‏D-05 · اتفاقيةُ «كل حساب في Postgres») ────────
 *
 * المؤشراتُ وحالةُ الاتفاقية تأتيان من `loadPartnerMetrics` — **نفس القارئ الذي
 * تستعمله الشاشة** — لا من عدٍّ ثانٍ هنا (النمط ٨: مصدران لرقمٍ واحد ينحرفان).
 * والتسويةُ من `v_partner_settlements` وصياغتُها من `settlementWording`،
 * والمساراتُ من `admin_search_routes` نفسها. وما يقع في هذا الملف عرضٌ وتنسيقٌ
 * فقط.
 */

/** سقفُ ما يُطبع من المسارات — والفارقُ يُقال في الورقة لا يُخفى */
const MAX_PRINT_ROUTES = ROUTES_PAGE_SIZE;

/** سقفُ السائقين على الورقة — نفس سقف بطاقة المستندات على الشاشة */
const MAX_PRINT_DRIVERS = 60;

type DriverRow = {
  id: string;
  name: string;
  phone: string | null;
  licenseNo: string | null;
  licenseExpiry: string | null;
  verified: boolean;
  active: boolean;
  /** **وجودٌ من عدمه فقط** — ولا مسار ولا رابط موقَّع يعبر إلى هذه الورقة */
  hasPhoto: boolean;
  hasLicenseImage: boolean;
  purged: boolean;
};

type Settlement = {
  earned: number | null;
  collected: number | null;
  paid: number | null;
  received: number | null;
  netDue: number | null;
  absNetDue: number | null;
  owedToUs: number | null;
  overLimit: boolean | null;
  tripsCount: number | null;
};

type Sheet = {
  ready: boolean;
  sub: SubcontractorView | null;
  vehicles: VehicleView[];
  routes: RouteHit[];
  routesTotal: number;
  itemsByRoute: Map<string, PriceItemView[]>;
  drivers: DriverRow[];
  driversTotal: number;
  metrics: PartnerMetrics | null;
  settlement: Settlement | null;
  settlementReady: boolean;
  blockDispatch: boolean | null;
  classTitles: Map<string, string>;
  currency: string;
  telegramLinked: boolean | null;
};

const dateLabel = (value: string | null): string =>
  value ? (formatDateLabel(value) ?? "—") : "—";

const numberLabel = (value: number | null): string =>
  value === null ? "—" : toArabicDigits(value);

function readDriver(row: Record<string, unknown>, index: number): DriverRow {
  const purgedAt = asText(pick(row, ["docs_purged_at", "docsPurgedAt"]));
  return {
    id: asText(row.id) ?? `driver-${index}`,
    name: asText(row.name) ?? "سائق بلا اسم",
    phone: asText(row.phone),
    licenseNo: asText(pick(row, ["license_no", "licenseNo"])),
    licenseExpiry: asText(pick(row, ["license_expiry", "licenseExpiry"])),
    verified: asText(pick(row, ["license_verified_at", "licenseVerifiedAt"])) !== null,
    active: row.active !== false,
    hasPhoto: asText(pick(row, ["photo_path", "photoPath"])) !== null,
    hasLicenseImage: asText(pick(row, ["license_photo_path", "licensePhotoPath"])) !== null,
    purged: purgedAt !== null,
  };
}

async function loadDrivers(
  supabase: SupabaseClient,
  id: string
): Promise<{ rows: DriverRow[]; total: number }> {
  /*
    🔒 أعمدةٌ مسمّاة لا `*`، **والمسارات ليست منها**: ما لا يُقرأ لا يُطبع بالخطأ.
    والعدّ `exact` كي يُقال الفارق حين يتجاوز السقف بدل اقتطاعٍ صامت.
  */
  const res = await supabase
    .from("subcontractor_drivers")
    .select(
      "id, name, phone, license_no, license_expiry, license_verified_at, active, docs_purged_at, photo_path, license_photo_path",
      { count: "exact" }
    )
    .eq("subcontractor_id", id)
    .order("active", { ascending: false })
    .order("name", { ascending: true })
    .limit(MAX_PRINT_DRIVERS);

  if (res.error) return { rows: [], total: 0 };
  const rows = ((res.data ?? []) as Record<string, unknown>[]).map(readDriver);
  return { rows, total: typeof res.count === "number" ? res.count : rows.length };
}

async function loadSettlement(
  supabase: SupabaseClient,
  id: string
): Promise<{ ready: boolean; settlement: Settlement | null }> {
  const res = await supabase
    .from("v_partner_settlements")
    .select("*")
    .eq("subcontractor_id", id)
    .maybeSingle();
  if (res.error) return { ready: false, settlement: null };
  if (!res.data) return { ready: true, settlement: null };
  const row = res.data as Record<string, unknown>;
  const overLimit = pick(row, ["over_limit", "overLimit"]);
  return {
    ready: true,
    settlement: {
      earned: asNumber(row.earned),
      collected: asNumber(row.collected),
      paid: asNumber(row.paid),
      received: asNumber(row.received),
      netDue: asNumber(pick(row, ["net_due", "netDue"])),
      absNetDue: asNumber(pick(row, ["abs_net_due", "absNetDue"])),
      owedToUs: asNumber(pick(row, ["owed_to_us", "owedToUs"])),
      overLimit: typeof overLimit === "boolean" ? overLimit : null,
      tripsCount: asNumber(pick(row, ["trips_count", "tripsCount"])),
    },
  };
}

async function load(id: string): Promise<Sheet> {
  const blank: Sheet = {
    ready: false,
    sub: null,
    vehicles: [],
    routes: [],
    routesTotal: 0,
    itemsByRoute: new Map(),
    drivers: [],
    driversTotal: 0,
    metrics: null,
    settlement: null,
    settlementReady: false,
    blockDispatch: null,
    classTitles: new Map(),
    currency: "EGP",
    telegramLinked: null,
  };

  const supabase = await createServerSupabase();
  if (!supabase) return blank;

  const subRes = await supabase.from("subcontractors").select("*").eq("id", id).maybeSingle();
  if (subRes.error) return blank;
  if (!subRes.data) return { ...blank, ready: true };
  const sub = readSubcontractor(subRes.data as Record<string, unknown>);

  const pricing = await loadPricingContext(supabase);

  const [vehiclesRes, routesRes, drivers, settlementRes, creditRes, metrics, telegramRes] =
    await Promise.all([
      supabase
        .from("subcontractor_vehicles")
        .select("*")
        .eq("subcontractor_id", id)
        .order("active", { ascending: false }),
      // نفسُ دالةِ البحث بمعرّفه — فلا ينحرف ما على الورق عمّا على الشاشة
      searchRoutes(supabase, { subcontractorId: id, limit: MAX_PRINT_ROUTES }),
      loadDrivers(supabase, id),
      loadSettlement(supabase, id),
      readPartnerCredit(supabase),
      loadPartnerMetrics(supabase, id),
      supabase.rpc("admin_partner_telegram", { p_subcontractor: id }),
    ]);

  // أسعارُ الفئات للمسارات المطبوعة وحدها — قراءةٌ واحدة بـ`in`
  const itemsByRoute = new Map<string, PriceItemView[]>();
  const routeIds = routesRes.rows.map((r) => r.id);
  if (routeIds.length > 0) {
    const itemsRes = await supabase
      .from("price_list_items")
      .select("*")
      .in("price_list_id", routeIds);
    if (!itemsRes.error) {
      for (const row of (itemsRes.data ?? []) as Record<string, unknown>[]) {
        const item = readPriceItem(row);
        if (!item) continue;
        const bucket = itemsByRoute.get(item.priceListId);
        if (bucket) bucket.push(item);
        else itemsByRoute.set(item.priceListId, [item]);
      }
    }
  }

  const telegramRow =
    !telegramRes.error && Array.isArray(telegramRes.data)
      ? (telegramRes.data[0] as Record<string, unknown> | undefined)
      : undefined;
  const linked = telegramRow ? pick(telegramRow, ["linked"]) : undefined;

  return {
    ready: true,
    sub,
    vehicles: vehiclesRes.error
      ? []
      : ((vehiclesRes.data ?? []) as Record<string, unknown>[]).map(readVehicle),
    routes: routesRes.rows,
    routesTotal: routesRes.total,
    itemsByRoute,
    drivers: drivers.rows,
    driversTotal: drivers.total,
    metrics,
    settlement: settlementRes.settlement,
    settlementReady: settlementRes.ready,
    // «لم يُقرأ الصف» ليست «الحجب مطفأ»: `null` تُسكِت جملةَ الإنفاذ في الاتجاهين
    blockDispatch: creditRes.loaded ? creditRes.settings.blockDispatch : null,
    classTitles: new Map(pricing.classes.map((c) => [c.slug, c.title])),
    currency: pricing.currency,
    telegramLinked: typeof linked === "boolean" ? linked : null,
  };
}

/* ═════════════════════════════════════════════════════════════════════════ *
 * لبناتُ الورقة — عناوينُ أقسام وجداول، بلا لونٍ ولا وسمٍ ملوّن.
 * `@media print` في `globals.css` تفكّ كل لونٍ على الورق أصلاً، فاللون على
 * الشاشة هنا زخرفةٌ تختفي — والمعنى يُكتب كلاماً كي ينجو.
 * ═════════════════════════════════════════════════════════════════════════ */

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="print-box space-y-2 rounded-xl border border-border p-4">
      <h3 className="font-heading text-sm font-bold">{title}</h3>
      {note ? <p className="text-xs text-muted-foreground">{note}</p> : null}
      {children}
    </section>
  );
}

function Facts({ items }: { items: { label: string; value: string; dir?: "ltr" | "rtl" }[] }) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
      {items.map((item) => (
        <div key={item.label} className="flex flex-wrap gap-1">
          <dt className="text-muted-foreground">{item.label}:</dt>
          <dd className="font-medium" dir={item.dir}>
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-xs text-muted-foreground">
            {head.map((cell) => (
              <th key={cell} className="p-2 text-start font-medium">
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

const Empty = ({ children }: { children: React.ReactNode }) => (
  <p className="text-sm text-muted-foreground">{children}</p>
);

/* ═════════════════════════════════════════════════════════════════════════ *
 * الورقة
 * ═════════════════════════════════════════════════════════════════════════ */

export async function SubcontractorPrintSheet({ id }: { id: string }) {
  const data = await load(id);

  if (!data.ready || data.sub === null) {
    return (
      <Empty>
        تعذّر تجهيز ملف هذا المتعهد — تحقّق من المعرّف ومن اتصال قاعدة البيانات ثم أعد
        تحميل الصفحة.
      </Empty>
    );
  }

  const { sub, metrics, settlement } = data;
  const wording = settlement
    ? settlementWording(settlement.netDue, settlement.absNetDue, data.currency, {
        owedToUs: settlement.owedToUs,
        overLimit: settlement.overLimit,
        blockDispatch: data.blockDispatch,
      })
    : null;

  const agreement = metrics?.agreement ?? null;
  const agreementLine = agreement
    ? agreement.accepted
      ? `موقَّعة — النسخة ${numberLabel(agreement.acceptedVersion)} بتاريخ ${dateLabel(agreement.acceptedAt)}`
      : agreement.inGrace
        ? `غير موقَّعة — المهلة سارية حتى ${dateLabel(agreement.deadline)}`
        : agreement.ok
          ? "غير موقَّعة — ولا حاجز عليها الآن"
          : "غير موقَّعة — والحاجز يمنع الإسناد"
    : "لم تُقرأ حالة الاتفاقية";

  const approvedRoutes = data.routes.filter((r) => r.status === "approved").length;

  return (
    <>
      <PrintHeader
        title="ملف متعهد"
        meta={[
          { label: "المتعهد", value: sub.companyName },
          { label: "الحالة", value: SUB_STATUS_LABELS[sub.status as never] ?? sub.status },
          { label: "العملة", value: data.currency, dir: "ltr" },
        ]}
        note="مستندٌ داخليّ يصف شراكةً قائمة. كل مبلغ فيه مستحقُّ المتعهد أو حركةٌ عليه — ولا يحمل سعر عميل ولا هامشاً. ولا تُرفق به صورةُ مستندٍ لسائق."
      />

      <Section title="بيانات الشريك">
        <Facts
          items={[
            { label: "الشركة", value: sub.companyName },
            { label: "مسؤول التواصل", value: sub.contactName ?? "—" },
            { label: "الهاتف", value: sub.phone ?? "—", dir: "ltr" },
            { label: "واتساب", value: sub.whatsapp ?? "—", dir: "ltr" },
            { label: "البريد", value: sub.email ?? "—", dir: "ltr" },
            { label: "الموقع", value: sub.socials.website ?? "—", dir: "ltr" },
            { label: "حالة الحساب", value: SUB_STATUS_LABELS[sub.status as never] ?? sub.status },
            { label: "تاريخ الانضمام", value: dateLabel(sub.createdAt) },
            {
              label: "تنبيهات تليجرام",
              value:
                data.telegramLinked === null
                  ? "غير معروفة"
                  : data.telegramLinked
                    ? "مربوطة"
                    : "غير مربوطة",
            },
          ]}
        />
      </Section>

      <Section
        title="المؤشرات"
        note="أرقامُ التشغيل كما تحسبها قاعدة البيانات — لا يُجمع منها شيء في هذه الورقة."
      >
        {metrics === null || !metrics.ready ? (
          <Empty>تعذّرت قراءة مؤشرات التشغيل.</Empty>
        ) : metrics.totals === null ? (
          <Empty>لم تُسنَد إلى هذا الشريك رحلةٌ بعد.</Empty>
        ) : (
          <Facts
            items={[
              { label: "رحلات مُسنَدة", value: numberLabel(metrics.totals.tripsCount) },
              { label: "منها منفَّذة", value: numberLabel(metrics.totals.completedCount) },
              { label: "عروضٌ وصلته", value: numberLabel(metrics.totals.offersCount) },
              { label: "قَبِل منها", value: numberLabel(metrics.totals.acceptedCount) },
              {
                label: "نسبة القبول",
                value:
                  metrics.totals.acceptRate === null
                    ? "—"
                    : `${toArabicDigits(Math.round(metrics.totals.acceptRate))}٪`,
              },
              { label: "أول رحلة", value: dateLabel(metrics.totals.firstTripAt) },
              { label: "آخر رحلة", value: dateLabel(metrics.totals.lastTripAt) },
              { label: "مركبات مسجَّلة", value: toArabicDigits(data.vehicles.length) },
              { label: "مسارات معتمدة", value: toArabicDigits(approvedRoutes) },
            ]}
          />
        )}
      </Section>

      <Section title="الأسطول">
        {data.vehicles.length === 0 ? (
          <Empty>لا مركبات مسجَّلة لهذا المتعهد.</Empty>
        ) : (
          <Table head={["المركبة", "الفئة", "اللوحة", "الموديل", "المقاعد", "الحالة"]}>
            {data.vehicles.map((vehicle) => (
              <tr key={vehicle.id} className="border-b border-border last:border-0">
                <td className="p-2 align-top">{vehicle.label}</td>
                <td className="p-2 align-top text-xs">
                  {vehicle.classSlug
                    ? (data.classTitles.get(vehicle.classSlug) ?? vehicle.classSlug)
                    : "—"}
                </td>
                <td className="p-2 align-top text-xs" dir="ltr">
                  {vehicle.plate ?? "—"}
                </td>
                <td className="p-2 align-top text-xs">
                  {vehicle.modelYear === null ? "—" : toArabicDigits(vehicle.modelYear)}
                </td>
                <td className="p-2 align-top text-xs">
                  {vehicle.seats === null ? "—" : toArabicDigits(vehicle.seats)}
                </td>
                <td className="p-2 align-top text-xs">{vehicle.active ? "نشطة" : "متوقفة"}</td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      <Section
        title="المسارات وأسعارها"
        note="التكلفة المكتوبة هي ما يُدفع للمتعهد عن الاتجاه الواحد — لا سعر العميل."
      >
        {data.routes.length === 0 ? (
          <Empty>لا مسارات مسجَّلة لهذا المتعهد.</Empty>
        ) : (
          <>
            <Table head={["المسار", "من ← إلى", "الحالة", "تكلفة المتعهد لكل فئة"]}>
              {data.routes.map((route) => {
                const items = (data.itemsByRoute.get(route.id) ?? []).filter(
                  (item) => item.cost !== null
                );
                return (
                  <tr key={route.id} className="border-b border-border last:border-0">
                    <td className="p-2 align-top">
                      {route.title}
                      {route.bidirectional ? (
                        <span className="block text-xs text-muted-foreground">ثنائية الاتجاه</span>
                      ) : null}
                    </td>
                    <td className="p-2 align-top text-xs">
                      {route.originLabel} ← {route.destLabel}
                    </td>
                    <td className="p-2 align-top text-xs">
                      {LIST_STATUS_LABELS[route.status as never] ?? route.status}
                    </td>
                    <td className="p-2 align-top text-xs">
                      {items.length === 0 ? (
                        "بلا سعر"
                      ) : (
                        <ul className="space-y-0.5">
                          {items.map((item) => (
                            <li key={item.classSlug}>
                              {data.classTitles.get(item.classSlug) ?? item.classSlug}:{" "}
                              <span dir="ltr">
                                {formatMoney(item.cost ?? 0, data.currency)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                );
              })}
            </Table>
            {data.routesTotal > data.routes.length ? (
              <p className="text-xs text-muted-foreground">
                طُبع {toArabicDigits(data.routes.length)} من {toArabicDigits(data.routesTotal)} مسار
                — والباقي في شاشة بحث المسارات.
              </p>
            ) : null}
          </>
        )}
      </Section>

      <Section
        title="السائقون"
        note="🔒 لا تُطبع صورةُ سائقٍ ولا صورةُ رخصة — يُكتب وجودُ المستند من عدمه فقط."
      >
        {data.drivers.length === 0 ? (
          <Empty>لا سائقين مسجَّلين لهذا المتعهد.</Empty>
        ) : (
          <>
            <Table
              head={["السائق", "الهاتف", "رقم الرخصة", "انتهاء الرخصة", "التوثيق", "المستندات"]}
            >
              {data.drivers.map((driver) => (
                <tr key={driver.id} className="border-b border-border last:border-0">
                  <td className="p-2 align-top">
                    {driver.name}
                    {driver.active ? null : (
                      <span className="block text-xs text-muted-foreground">متوقف</span>
                    )}
                  </td>
                  <td className="p-2 align-top text-xs" dir="ltr">
                    {driver.phone ?? "—"}
                  </td>
                  <td className="p-2 align-top text-xs" dir="ltr">
                    {driver.licenseNo ?? "—"}
                  </td>
                  <td className="p-2 align-top text-xs">{dateLabel(driver.licenseExpiry)}</td>
                  <td className="p-2 align-top text-xs">
                    {driver.verified ? "موثَّقة" : "لم تُوثَّق"}
                  </td>
                  <td className="p-2 align-top text-xs">
                    {driver.purged
                      ? "حُذفت بعد انتهاء الشراكة"
                      : `الصورة ${driver.hasPhoto ? "موجودة" : "غير مرفوعة"} · الرخصة ${
                          driver.hasLicenseImage ? "موجودة" : "غير مرفوعة"
                        }`}
                  </td>
                </tr>
              ))}
            </Table>
            {data.driversTotal > data.drivers.length ? (
              <p className="text-xs text-muted-foreground">
                طُبع {toArabicDigits(data.drivers.length)} من {toArabicDigits(data.driversTotal)}{" "}
                سائقاً.
              </p>
            ) : null}
          </>
        )}
      </Section>

      <Section title="اتفاقية الشراكة">
        <p className="text-sm">{agreementLine}</p>
      </Section>

      <Section
        title="التسوية"
        note="الحساب كاملاً منذ أول رحلة — لا فترة. والصافي قد يكون في أيّ الاتجاهين."
      >
        {!data.settlementReady ? (
          <Empty>تعذّرت قراءة كشف التسوية.</Empty>
        ) : settlement === null || wording === null ? (
          <Empty>لا حركة مالية مع هذا الشريك بعد.</Empty>
        ) : (
          <>
            <Facts
              items={[
                {
                  label: "استحقّه عن رحلاته",
                  value: formatMoney(settlement.earned ?? 0, data.currency),
                  dir: "ltr",
                },
                {
                  label: "قبضه نقداً من عملائنا",
                  value: formatMoney(settlement.collected ?? 0, data.currency),
                  dir: "ltr",
                },
                {
                  label: "سلّمناه له",
                  value: formatMoney(settlement.paid ?? 0, data.currency),
                  dir: "ltr",
                },
                {
                  label: "سدّده لنا",
                  value: formatMoney(settlement.received ?? 0, data.currency),
                  dir: "ltr",
                },
                { label: "رحلات محسوبة", value: numberLabel(settlement.tripsCount) },
              ]}
            />
            <p className="text-sm font-bold">{wording.verdict}</p>
            {wording.limitText ? (
              <p className="text-xs">
                {wording.limitText}
                {wording.limitConsequence ? ` — ${wording.limitConsequence}` : ""}
              </p>
            ) : null}
          </>
        )}
      </Section>
    </>
  );
}

/**
 * الرابط الذي يُدرَج في ملف المتعهد — **سطرٌ واحد** في `[id]/page.tsx`.
 *
 * ورابطٌ لا زرّ: الطباعة تقع على المستند لا على هذه الشاشة، فالفعل تنقّلٌ.
 * و`no-print` عليه كي لا يخرج على ورقٍ إن طُبعت شاشة الملف نفسها يوماً.
 */
export function PartnerFileLink({ id }: { id: string }) {
  return (
    <Link
      href={`/admin/subcontractors/${id}/print`}
      className={`no-print ${buttonVariants({ variant: "outline", size: "sm" })}`}
    >
      <Printer />
      ملف للطباعة
    </Link>
  );
}
