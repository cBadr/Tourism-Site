import { PauseCircle, Wallet } from "lucide-react";

import { amountLabel } from "@/components/portal/offer-parts";
import { ContactChannels } from "@/components/portal/portal-contact";
import { Notice } from "@/components/portal/portal-ui";
import { Card } from "@/components/ui/card";
import type { ContactSettings } from "@/lib/site-config";
import { cn } from "@/lib/utils";
import type { BalanceResult, PortalBalance } from "../_lib/balance";

/**
 * بطاقة «حسابك مع المنصة» — الرقم الذي كان المتعهد يجهله.
 *
 * قبلها كان بورتاله يعرض كل شيء إلا حسابه: لا ما له، ولا مالنا الذي في يده،
 * ولا سبب توقف الرحلات عنه حين يتوقف. والحجب الذي لا يراه صاحبه ولا يستطيع
 * قياسه يُقرأ عطلاً في النظام، فيتصل بالتشغيل بدل أن يسدّد. هذه البطاقة تحوّل
 * العقوبة الصامتة إلى **رقم قابل للتنفيذ**.
 *
 * ثلاثة حدود لا تُتجاوز في هذا الملف:
 *  (١) **لا حساب**: كل رقم يصل جاهزاً من `portal_balance()`، والإشارة تصل معه.
 *      حتى حجم الدين يُقرأ من `owed_to_us` ولا يُشتق بـ `Math.abs` من الصافي.
 *  (٢) **لا يرى إلا نفسه**: لا متعهد آخر، ولا هامش المنصة، ولا سقف الديون، ولا
 *      أي إعداد أنتج الحجب. وهذا **بنيوي منذ 0030 لا انضباطي**: كانت الدالة
 *      تُرجع `debt_limit` وكان هذا الملف يمتنع عن قراءته — أي أن الرقم يصل ثم
 *      لا يُعرض، وهو عزلٌ يكسره أول من يفتح أدوات المتصفح. فأُسقط من الدالة
 *      نفسها. والباقي هو ما يخصّ المتعهد وحده: `amount_to_clear` — كم يسدّد
 *      ليعود إليه العمل، لا العتبة التي وضعتها المنصة لكل شركائها.
 *  (٣) **لا أرقام حسابات الشركة**: قنوات السداد تُذكر جملةً، والترتيب مع الإدارة
 *      عبر قنوات التواصل المعلنة. أرقام الحسابات تُدار من شاشة أخرى ولها سياستها.
 *
 * مكوّن خادمي بلا حالة — نص جاهز في الـ HTML.
 */

type NetTone = "we-owe" | "you-owe" | "settled";

const NET_TONE_CLASS: Record<NetTone, string> = {
  // له علينا: خبر طيّب لصاحبه — أخضر
  "we-owe": "border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40",
  // عليه لنا: التزام عليه — كهرماني ينبّه ولا يُفزع (الفزع للشريط الأحمر وحده)
  "you-owe": "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40",
  settled: "border-border bg-muted/40",
};

type NetWording = { tone: NetTone; headline: string; hint: string };

/**
 * صياغة الصافي بالعربية الصحيحة لكل إشارة — **بضمير المخاطب** لأن القارئ هنا
 * صاحب الحساب لا الإدارة: «لك علينا» و«عليك لنا» لا «له علينا» و«عليه لنا».
 *
 * الإشارة من القاعدة والرقم من القاعدة: الموجب يُعرض كما وصل (الصافي نفسه)،
 * والسالب يُعرض بحجمه القادم في `owed_to_us`. فلا تحويل إشارة هنا ولا قيمة
 * مطلقة — «−٣٦٠ ج.م لك علينا» جملة لا يفهمها أحد، وحلّها أن تأتي الكلمة
 * والحجم كلاهما من مصدرهما.
 */
function netWording(balance: PortalBalance, currency: string | null): NetWording {
  if (balance.netDue > 0) {
    return {
      tone: "we-owe",
      headline: `لك علينا ${amountLabel(balance.netDue, currency)}`,
      hint: "مستحقاتك عن الرحلات المنفَّذة تفوق ما قبضته نقداً من عملائنا وما استلمته منّا — وهذا فرقٌ تستلمه في التسوية القادمة.",
    };
  }

  if (balance.netDue < 0) {
    return {
      tone: "you-owe",
      // حجم الدين من `owed_to_us`؛ و«—» حين لا يصل — لا يُشتق من الصافي هنا
      headline: `عليك لنا ${balance.owedToUs === null ? "—" : amountLabel(balance.owedToUs, currency)}`,
      hint: "ما قبضته نقداً من عملائنا تجاوز مستحقاتك وما سدّدته — فالفرق مالنا في يدك، يُحصَّل منك لا يُدفع لك.",
    };
  }

  return {
    tone: "settled",
    headline: "الحساب مصفّى",
    hint: "ما لك وما عليك متساويان — لا مستحق في أي من الاتجاهين الآن.",
  };
}

/** رقم من أرقام المقاصة الأربعة — «—» حين لا يصل، فلا صفر مخترَع في شاشة مال */
function Figure({
  label,
  value,
  currency,
  note,
}: {
  label: string;
  value: number | null;
  currency: string | null;
  note: string;
}) {
  return (
    <div className="rounded-xl bg-muted/40 p-3.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="pt-0.5 font-heading text-lg font-bold tabular-nums">
        {value === null ? "—" : amountLabel(value, currency)}
      </p>
      <p className="pt-1 text-xs leading-5 text-muted-foreground">{note}</p>
    </div>
  );
}

/**
 * شريط الحجب — هادئ ومحدَّد وقابل للتنفيذ.
 *
 * ثلاث جمل بترتيبها: ماذا توقّف · بكم يعود · وما الذي لم يتوقف. الثالثة ليست
 * تطميناً بل حقيقة تمنع ذعراً في محله: الحجب يقع على العروض الجديدة والفوز
 * بقبولها، أما رحلة أُسندت إليه فالتزامها قائم ولا يمسّها شيء.
 *
 * والمبلغان معاً عمداً: «سدّد كذا لتعود» وحده يوهم بأن هذا كل ما عليه، فيُذكر
 * كامل الدين بجواره. كلاهما من القاعدة.
 *
 * ⚠ **«أكثر من» ليست تلطيفاً بل دقة**: المبلغ الرافع للحجب يحمل قرشاً زائداً في
 * القاعدة (‏`owed − limit + 0.01`) لأن الحجب يقع عند بلوغ الحدّ لا تجاوزه، بينما
 * كل مبالغ الواجهة تُعرض بالجنيه الصحيح كما في بقية المنتج. فلو قيل «سدّد ١٬٠٠٠»
 * لسدّد ألفاً بالضبط ووقف عند الحدّ نفسه — **فيبقى محجوباً بقرش** ويعود إلى
 * التشغيل بشكوى «سدّدت ولم يعد شيء». والصياغة تحلّها بلا حساب في المكوّن.
 */
function BlockedBanner({
  balance,
  currency,
  contact,
}: {
  balance: PortalBalance;
  currency: string | null;
  contact: ContactSettings;
}) {
  // حارس عرض لا حساب: مبلغٌ صفر أو غائب لا يصلح جملةَ «سدّد …»
  const clearing =
    balance.amountToClear !== null && balance.amountToClear > 0 ? balance.amountToClear : null;

  return (
    <Notice tone="danger" icon={<PauseCircle className="size-5 shrink-0" aria-hidden="true" />}>
      <p className="font-semibold">توقّف وصول الرحلات الجديدة إليك</p>
      <p className="pt-1">
        {clearing === null ? (
          <>
            بلغ ما عليك لنا الحدّ الذي تتوقف عنده الرحلات الجديدة. تواصل مع الإدارة لترتيب السداد
            ومعرفة المبلغ الذي يعيد وصول الطلبات.
          </>
        ) : (
          <>
            بلغ ما عليك لنا الحدّ الذي تتوقف عنده الرحلات الجديدة. يعود وصولها بسداد أكثر من{" "}
            <span className="font-semibold tabular-nums">{amountLabel(clearing, currency)}</span>
            {balance.owedToUs === null ? (
              "."
            ) : (
              <>
                ، وكامل ما عليك الآن{" "}
                <span className="font-semibold tabular-nums">
                  {amountLabel(balance.owedToUs, currency)}
                </span>{" "}
                — وسدادُه كاملاً يُنهي المسألة.
              </>
            )}
          </>
        )}
      </p>
      <p className="pt-1">
        والرحلات المُسندة إليك بالفعل لا يمسّها هذا — التوقف على الجديد وحده، فأكمل ما قبلته كالمعتاد.
      </p>
      <p className="pt-1">
        السداد يجري مع الإدارة: نقداً أو محفظة إلكترونية أو انستا باي أو تحويلاً بنكياً. تواصل معنا
        لترتيبه:
      </p>
      <ContactChannels
        contact={contact}
        className="justify-start pt-2"
        empty="تواصل مع الإدارة عبر القناة التي وصلتك منها الدعوة لترتيب السداد."
      />
    </Notice>
  );
}

export function PortalBalanceCard({
  result,
  currency,
  contact,
}: {
  result: BalanceResult;
  /** عملة المنصة — `null` ⇒ يُعرض الرقم مجرداً بلا وحدة مكتوبة في الكود */
  currency: string | null;
  contact: ContactSettings;
}) {
  // قاعدة قبل هجرة 0029، أو لا صف: لا بطاقة ولا أثر على بقية الصفحة
  if (result.state === "hidden") return null;

  if (result.state === "failed") {
    return (
      <Notice tone="warning">
        <p className="font-semibold">تعذّر عرض حسابك الآن</p>
        <p>
          لم نتمكن من قراءة رصيدك في هذه اللحظة. حدّث الصفحة، وإن تكرر الأمر راسل الإدارة — رصيدك
          وحقوقك قائمة كما هي سواء ظهرت هنا أم لا.
        </p>
      </Notice>
    );
  }

  const { balance } = result;
  const net = netWording(balance, currency);

  return (
    <>
      {balance.blocked ? (
        <BlockedBanner balance={balance} currency={currency} contact={contact} />
      ) : null}

      <Card className="gap-4 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Wallet className="size-5 shrink-0 text-primary" aria-hidden="true" />
          <span className="font-heading text-base font-bold">حسابك مع المنصة</span>
        </div>

        <div className={cn("rounded-xl border p-4", NET_TONE_CLASS[net.tone])}>
          <p className="text-xs text-muted-foreground">صافي الحساب</p>
          <p className="pt-0.5 font-heading text-2xl font-bold tabular-nums">{net.headline}</p>
          <p className="pt-1.5 text-sm leading-relaxed text-muted-foreground">{net.hint}</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Figure
            label="مستحقك عن الرحلات"
            value={balance.earned}
            currency={currency}
            note="ما ثبت لك عن رحلات سُجّلت «منفَّذة» — بالمبلغ المتفق عليه لحظة إسناد كل رحلة."
          />
          <Figure
            label="ما قبضته نقداً من عملائنا"
            value={balance.collected}
            currency={currency}
            note="مالنا الذي سلّمه لك العميل في الرحلة — يُخصم من مستحقك عند التسوية."
          />
          <Figure
            label="ما استلمته منّا"
            value={balance.paid}
            currency={currency}
            note="دفعات سبق أن سلّمتها لك الإدارة وسجّلتها في الدفتر."
          />
          <Figure
            label="ما سدّدته لنا"
            value={balance.received}
            currency={currency}
            note="ما ردَدته إلينا نقداً أو تحويلاً وسجّلته الإدارة باسمك."
          />
        </div>

        <p className="text-xs leading-6 text-muted-foreground">
          صافي الحساب = مستحقك عن الرحلات − ما قبضته نقداً من عملائنا − ما استلمته منّا + ما سدّدته
          لنا. وكلها أرقام مقيَّدة في دفتر واحد لا يُقيَّد فيه على رحلة شيء قبل تسجيلها «منفَّذة» —
          فرحلاتك الجارية الآن، وما ستقبضه فيها نقداً، ليست في هذه الأرقام بعد. وإن اختلف رقم عمّا
          عندك فراسل الإدارة بتفاصيله.
        </p>
      </Card>
    </>
  );
}
