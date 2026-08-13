/**
 * عقد المالية (المرحلة ٧) — المرجع الأوحد.
 *
 * من VISION.md: الخزينة · التحصيل · المصروفات · كشف الحساب · التدفق النقدي.
 *
 * ── الالتواء المحاسبي الذي يميّز هذا النشاط ──────────────────────────────────
 * العميل يدفع لنا عرباناً ويسلّم الباقي **نقداً للسائق** (أي للمتعهد). فالمتعهد
 * يخرج من الرحلة وقد قبض جزءاً من مالنا، ونحن مدينون له بمستحقه كاملاً. إذن:
 *
 *     صافي المقاصة = مستحق المتعهد − ما حصّله نقداً من العميل
 *
 * وقد تكون النتيجة **سالبة** (حصّل أكثر من مستحقه) فيصير هو المدين لنا. أي
 * نظام يفترض أن الاتجاه واحد سيخطئ في نصف الرحلات.
 *
 * ── دفتر واحد لا تجميعات متفرقة ─────────────────────────────────────────────
 * كل حركة مال تُقيَّد صفاً في `ledger_entries`، ومنه تُشتق الأرصدة وكشوف الحساب
 * والتدفق النقدي جميعاً. لا مجموع يُحسب في TypeScript إطلاقاً.
 */

/** نوع حساب الخزينة — الثلاثة الأولى تستقبل من العملاء، والأخيران داخليان */
export type TreasuryAccountKind = "wallet" | "instapay" | "card" | "cash" | "bank";

/** اتجاه الحركة من منظور خزينتنا */
export type LedgerDirection = "in" | "out";

/** مصدر القيد — يربط كل جنيه بسببه */
export type LedgerSource =
  | "payment" // تحصيل من عميل (إيصال معتمد)
  | "expense" // مصروف تشغيلي
  | "partner_payout" // دفعة لمتعهد
  | "partner_collection" // تحصيل نقدي قبضه المتعهد من العميل نيابة عنا
  | "refund" // ردّ مبلغ لعميل
  | "adjustment"; // تسوية يدوية بسبب مكتوب

export type LedgerEntryRow = {
  id: string;
  accountId: string | null;
  direction: LedgerDirection;
  amount: number;
  occurredAt: string;
  sourceType: LedgerSource;
  /** معرّف السجل الأصلي (حجز/مصروف/دفعة) */
  sourceId: string | null;
  subcontractorId: string | null;
  bookingId: string | null;
  note: string | null;
  createdBy: string | null;
  createdAt: string;
};

export type ExpenseCategoryRow = {
  id: string;
  name: string;
  active: boolean;
  sort: number;
};

export type ExpenseRow = {
  id: string;
  categoryId: string | null;
  accountId: string;
  amount: number;
  occurredAt: string;
  note: string | null;
  attachmentPath: string | null;
  createdAt: string;
};

/** دفعة نقدية لمتعهد ضمن المقاصة */
export type PartnerPayoutRow = {
  id: string;
  subcontractorId: string;
  accountId: string;
  amount: number;
  occurredAt: string;
  note: string | null;
  createdAt: string;
};

/** رصيد حساب خزينة — من العرض `v_account_balances` */
export type AccountBalance = {
  accountId: string;
  label: string;
  kind: TreasuryAccountKind;
  openingBalance: number;
  totalIn: number;
  totalOut: number;
  balance: number;
};

/** سطر كشف حساب متعهد — من `partner_statement(p_subcontractor_id, from, to)` */
export type PartnerStatementLine = {
  occurredAt: string;
  kind: "trip" | "collection" | "payout" | "adjustment";
  reference: string | null;
  /** ما لنا عليه (تحصيل نقدي قبضه) */
  debit: number;
  /** ما له علينا (مستحق رحلة أو دفعة سُدّدت) */
  credit: number;
  balance: number;
  note: string | null;
};

/** ملخص مقاصة متعهد — الرقم الذي يُدفع أو يُطالَب به */
export type PartnerSettlement = {
  subcontractorId: string;
  companyName: string;
  /** مجموع مستحقات الرحلات المنفذة */
  earned: number;
  /** ما حصّله نقداً من العملاء نيابة عنا */
  collected: number;
  /** ما سبق أن دفعناه له */
  paid: number;
  /** الصافي: موجب = ندفع له، سالب = يدفع لنا */
  netDue: number;
  tripsCount: number;
};

/** سطر التدفق النقدي لفترة — من `cash_flow(from, to, granularity)` */
export type CashFlowBucket = {
  bucket: string;
  inflow: number;
  outflow: number;
  net: number;
  runningBalance: number;
};

/** ربحية رحلة — من `v_booking_profit` */
export type BookingProfit = {
  bookingId: string;
  reference: string;
  revenue: number;
  partnerCost: number;
  grossProfit: number;
  /** التحصيل الفعلي منا (إيصالات معتمدة) */
  collectedByUs: number;
  /** ما حصّله المتعهد نقداً */
  collectedByPartner: number;
  status: string;
};

/** مؤشرات الصفحة المالية — من `finance_kpis(from, to)` */
export type FinanceKpis = {
  revenue: number;
  partnerCosts: number;
  expenses: number;
  netProfit: number;
  cashOnHand: number;
  receivables: number;
  partnerNetDue: number;
};

/**
 * تواقيع Postgres (هجرة 0015):
 *   v_account_balances            — عرض أرصدة كل حسابات الخزينة
 *   v_booking_profit              — ربحية كل حجز
 *   v_partner_settlements         — مقاصة كل المتعهدين
 *   partner_statement(p_subcontractor_id uuid, p_from date, p_to date)
 *   cash_flow(p_from date, p_to date, p_granularity text)   -- day | week | month
 *   finance_kpis(p_from date, p_to date)
 *   record_expense(p_account uuid, p_category uuid, p_amount numeric, p_at timestamptz, p_note text, p_path text)
 *   record_partner_payout(p_sub uuid, p_account uuid, p_amount numeric, p_at timestamptz, p_note text)
 *   record_adjustment(p_account uuid, p_direction text, p_amount numeric, p_at timestamptz, p_note text)
 * جميعها إدارية (is_admin) عدا العروض التي تحرسها RLS.
 */
