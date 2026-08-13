"use client";

import * as React from "react";
import Link from "next/link";
import { CircleCheck, LoaderCircle, Send, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { DEFAULT_LOCALE, localePath } from "@/lib/i18n-types";
import type { ServiceDef } from "@/lib/site-config";
import { useT } from "@/components/site/i18n";
import { createFormatter } from "@/components/booking/format";

/**
 * نموذج «اطلب عرض سعر» — لما هو خارج الحاسبة الفورية: الجولات والمناسبات
 * والإيجار اليومي والمجموعات الكبيرة.
 *
 * يرسل إلى /api/quote-request (إدراج في quote_requests بمفتاح anon) ويعرض
 * حالة نجاح تحمل الرقم المرجعي حين تسمح القاعدة بإرجاعه.
 *
 * المرحلة ٨: النصوص من مساحة `pages.quoteRequest.form`، وأسماء الخدمات تصل
 * **مترجَمة** من الصفحة الخادمية عبر `services` بدل استيراد SERVICES هنا —
 * فجزيرة العميل لا تستطيع قراءة جدول الترجمات. والرقم المرجعي يبقى كما تولّده
 * القاعدة (رمز لا عدد) فلا يمر بتحويل الخانات.
 */

type QuoteRequestResponse =
  | { ok: true; reference: string | null }
  | { ok: false; code: string; message: string };

const PHONE_PATTERN = /^[+\d\s()-]{8,20}$/;

/** الحد الأدنى لطول الاسم — نفس ما تقوله رسالة الخطأ */
const NAME_MIN_LENGTH = 3;
/** الحد الأدنى لطول التفاصيل قبل الإرسال */
const DETAILS_MIN_LENGTH = 5;

function isPhoneValid(value: string): boolean {
  const trimmed = value.trim();
  if (!PHONE_PATTERN.test(trimmed)) return false;
  const digits = trimmed.replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 15;
}

type FieldErrors = Partial<Record<"service" | "name" | "phone" | "details", string>>;

export function QuoteRequestForm({
  defaultService,
  services,
  locale = DEFAULT_LOCALE,
}: {
  defaultService?: string;
  /** الخدمات بلغة الزائر — تصل من الصفحة الخادمية */
  services: ServiceDef[];
  /** لغة الزائر — تصل من الصفحة الخادمية، وغيابها يعني العربية */
  locale?: string;
}) {
  const t = useT("pages.quoteRequest.form");
  const fmt = React.useMemo(() => createFormatter(locale), [locale]);
  const uid = React.useId();

  const [serviceSlug, setServiceSlug] = React.useState(defaultService ?? "");
  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [details, setDetails] = React.useState("");

  const [errors, setErrors] = React.useState<FieldErrors>({});
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [reference, setReference] = React.useState<string | null>(null);
  const [done, setDone] = React.useState(false);

  const fieldClass =
    "h-12 w-full rounded-2xl border border-input bg-background px-3 text-base outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    const found: FieldErrors = {};
    if (name.trim().length < NAME_MIN_LENGTH) {
      found.name = t("errors.nameTooShort", "اكتب اسمك كاملاً (٣ أحرف على الأقل).", {
        min: fmt.digits(NAME_MIN_LENGTH),
      });
    }
    if (!isPhoneValid(phone)) {
      found.phone = t("errors.phoneInvalid", "اكتب رقم هاتف صحيح للتواصل معك.");
    }
    if (details.trim().length < DETAILS_MIN_LENGTH) {
      found.details = t("errors.detailsTooShort", "اكتب تفاصيل طلبك: الوجهة والتاريخ وعدد الأفراد.");
    }
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/quote-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceSlug: serviceSlug || null,
          customerName: name.trim(),
          customerPhone: phone.trim(),
          details: details.trim(),
        }),
      });
      const json = (await res.json()) as QuoteRequestResponse;

      if (!json.ok) {
        setSubmitError(
          json.message || t("errors.sendFailed", "تعذّر إرسال طلبك الآن. حاول مرة أخرى.")
        );
        setSubmitting(false);
        return;
      }

      setReference(json.reference);
      setDone(true);
      setSubmitting(false);
    } catch {
      setSubmitError(
        t("errors.network", "تعذّر الاتصال بالخادم. تأكد من اتصالك بالإنترنت وحاول مرة أخرى.")
      );
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-3xl border border-primary/30 bg-primary/5 p-6 text-center sm:p-8">
        <span className="grid size-14 place-items-center rounded-full bg-primary text-primary-foreground">
          <CircleCheck className="size-7" aria-hidden="true" />
        </span>
        <h2 className="text-xl font-bold">{t("done.title", "وصلنا طلبك")}</h2>
        <p className="max-w-md text-sm leading-7 text-muted-foreground">
          {t(
            "done.text",
            "سيراجع فريقنا تفاصيل رحلتك ويتواصل معك بعرض سعر مخصص على الرقم الذي كتبته."
          )}
        </p>
        {reference ? (
          <div className="flex flex-col items-center gap-1.5">
            <span className="text-xs text-muted-foreground">{t("done.reference", "رقم الطلب")}</span>
            <span
              dir="ltr"
              className="rounded-2xl border border-primary/30 bg-background px-4 py-2 font-mono text-lg font-bold tracking-widest"
            >
              {reference}
            </span>
          </div>
        ) : null}
        <Link
          href={localePath(locale, "/")}
          className="inline-flex h-11 items-center justify-center rounded-2xl border border-border bg-background px-5 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {t("done.backHome", "العودة إلى الرئيسية")}
        </Link>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="flex flex-col gap-4 rounded-3xl border border-border bg-card p-5 text-card-foreground shadow-xl shadow-primary/5 sm:p-7"
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${uid}-service`} className="text-sm font-medium">
          {t("service", "نوع الخدمة")}
        </label>
        <select
          id={`${uid}-service`}
          value={serviceSlug}
          onChange={(event) => setServiceSlug(event.target.value)}
          className={fieldClass}
        >
          <option value="">{t("servicePlaceholder", "اختر الخدمة (اختياري)")}</option>
          {services.map((service) => (
            <option key={service.slug} value={service.slug}>
              {service.title}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${uid}-name`} className="text-sm font-medium">
          {t("name", "الاسم")}
        </label>
        <input
          id={`${uid}-name`}
          type="text"
          autoComplete="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          aria-invalid={errors.name ? true : undefined}
          className={fieldClass}
        />
        {errors.name ? (
          <p className="flex items-start gap-1.5 text-xs leading-5 text-destructive">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            {errors.name}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${uid}-phone`} className="text-sm font-medium">
          {t("phone", "رقم الهاتف")}
        </label>
        <input
          id={`${uid}-phone`}
          type="tel"
          inputMode="tel"
          dir="ltr"
          autoComplete="tel"
          placeholder={t("phonePlaceholder", "01xxxxxxxxx")}
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          aria-invalid={errors.phone ? true : undefined}
          className={cn(fieldClass, "text-start")}
        />
        {errors.phone ? (
          <p className="flex items-start gap-1.5 text-xs leading-5 text-destructive">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            {errors.phone}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${uid}-details`} className="text-sm font-medium">
          {t("details", "تفاصيل الطلب")}
        </label>
        <textarea
          id={`${uid}-details`}
          rows={5}
          maxLength={2000}
          value={details}
          onChange={(event) => setDetails(event.target.value)}
          placeholder={t(
            "detailsPlaceholder",
            "مثال: جولة يوم كامل في القاهرة التاريخية يوم ١٢ من الشهر القادم، ٦ أفراد، الانطلاق من فندق في الزمالك."
          )}
          aria-invalid={errors.details ? true : undefined}
          className="w-full rounded-2xl border border-input bg-background px-3 py-2.5 text-base leading-7 outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        {errors.details ? (
          <p className="flex items-start gap-1.5 text-xs leading-5 text-destructive">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            {errors.details}
          </p>
        ) : (
          <p className="text-xs leading-5 text-muted-foreground">
            {t("detailsHelp", "كلما زادت التفاصيل، وصلك عرض أدق وأسرع.")}
          </p>
        )}
      </div>

      {submitError ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-2xl border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm leading-6 text-destructive"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {submitError}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={submitting}
        className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-base font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-60"
      >
        {submitting ? (
          <>
            <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />
            {t("submitting", "جارٍ إرسال الطلب…")}
          </>
        ) : (
          <>
            <Send className="size-5" aria-hidden="true" />
            {t("submit", "أرسل الطلب")}
          </>
        )}
      </button>

      <span className="sr-only" role="status" aria-live="polite">
        {submitting ? t("submittingStatus", "جارٍ إرسال الطلب") : submitError ? submitError : ""}
      </span>
    </form>
  );
}
