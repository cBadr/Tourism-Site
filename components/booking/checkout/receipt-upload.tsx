"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CircleCheck, LoaderCircle, TriangleAlert, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { DEFAULT_LOCALE } from "@/lib/i18n-types";
import { useT } from "@/components/site/i18n";
import { createFormatter } from "../format";

/**
 * نموذج رفع إيصال التحويل — يرسل multipart إلى /api/booking/receipt.
 *
 * الملف يذهب إلى دلو `receipts` الخاص (لا قراءة عامة)، ثم تنقل دالة
 * `attach_receipt` الحجز إلى «قيد المراجعة». بعد النجاح نستدعي router.refresh()
 * فتُعاد الصفحة الخادمية بحالتها الجديدة بلا إعادة تحميل كاملة.
 */

const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

export type ReceiptAccountOption = {
  id: string;
  label: string;
  handle: string;
};

export function ReceiptUpload({
  token,
  amountDue,
  currency,
  accounts,
  locale = DEFAULT_LOCALE,
}: {
  token: string;
  amountDue: number;
  currency: string;
  accounts: ReceiptAccountOption[];
  /** لغة الزائر — تصل من الصفحة الخادمية، وغيابها يعني العربية */
  locale?: string;
}) {
  const router = useRouter();
  const t = useT("booking.receipt");
  const fmt = React.useMemo(() => createFormatter(locale), [locale]);
  const uid = React.useId();

  const [accountId, setAccountId] = React.useState<string>(accounts[0]?.id ?? "");
  const [file, setFile] = React.useState<File | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [done, setDone] = React.useState(false);

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const picked = event.target.files?.[0] ?? null;
    setError(null);
    if (!picked) {
      setFile(null);
      return;
    }
    if (!ACCEPTED.includes(picked.type)) {
      setFile(null);
      setError(
        t(
          "errors.unsupportedType",
          "نوع الملف غير مدعوم — أرفق صورة (JPG أو PNG أو WebP) أو ملف PDF."
        )
      );
      return;
    }
    if (picked.size > MAX_BYTES) {
      setFile(null);
      setError(t("errors.tooLarge", "حجم الملف أكبر من ٥ ميجابايت. أرسل صورة أصغر."));
      return;
    }
    setFile(picked);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    if (!file) {
      setError(t("errors.missingFile", "أرفق صورة إيصال التحويل أو ملف PDF."));
      return;
    }

    const body = new FormData();
    body.set("token", token);
    body.set("file", file);
    body.set("amount", String(amountDue));
    if (accountId) body.set("accountId", accountId);

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/booking/receipt", { method: "POST", body });
      const json = (await res.json()) as { ok: boolean; message?: string };
      if (!json.ok) {
        setError(json.message || t("errors.uploadFailed", "تعذّر رفع الإيصال. حاول مرة أخرى."));
        setSubmitting(false);
        return;
      }
      setDone(true);
      router.refresh();
    } catch {
      setError(
        t("errors.network", "تعذّر الاتصال بالخادم. تأكد من اتصالك بالإنترنت وحاول مرة أخرى.")
      );
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <p className="flex items-start gap-2 rounded-2xl border border-primary/40 bg-primary/5 px-4 py-3 text-sm leading-7">
        <CircleCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
        {t("done", "وصلنا إيصالك — حجزك الآن قيد المراجعة، وسنؤكده لك في أقرب وقت.")}
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      {accounts.length > 1 ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${uid}-account`} className="text-sm font-medium">
            {t("accountLabel", "حوّلت إلى")}
          </label>
          <select
            id={`${uid}-account`}
            value={accountId}
            onChange={(event) => setAccountId(event.target.value)}
            className="h-12 w-full rounded-2xl border border-input bg-background px-3 text-base outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.label} — {account.handle}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${uid}-file`} className="text-sm font-medium">
          {t("fileLabel", "صورة الإيصال")}
        </label>
        <input
          id={`${uid}-file`}
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          onChange={handleFileChange}
          aria-describedby={`${uid}-file-note`}
          className="w-full cursor-pointer rounded-2xl border border-input bg-background px-3 py-2.5 text-sm outline-none transition-colors file:me-3 file:rounded-lg file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        <p id={`${uid}-file-note`} className="text-xs leading-5 text-muted-foreground">
          {t("fileNote", "صورة أو PDF بحد أقصى ٥ ميجابايت. المبلغ المتوقع: {amount}.", {
            amount: fmt.money(amountDue, currency),
          })}
        </p>
      </div>

      {error ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-2xl border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm leading-6 text-destructive"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={submitting}
        className={cn(
          "inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-primary px-6 text-base font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-60"
        )}
      >
        {submitting ? (
          <>
            <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />
            {t("submitting", "جارٍ رفع الإيصال…")}
          </>
        ) : (
          <>
            <Upload className="size-5" aria-hidden="true" />
            {t("submit", "رفع الإيصال")}
          </>
        )}
      </button>

      <span className="sr-only" role="status" aria-live="polite">
        {submitting ? t("submittingStatus", "جارٍ رفع الإيصال") : error ? error : ""}
      </span>
    </form>
  );
}
