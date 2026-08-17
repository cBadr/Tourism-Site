"use client";

import * as React from "react";
import { Volume2, VolumeX } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * صوت تنبيه اللوحة — طلب بدر 2026-08-15 (`docs/phase-briefs/BOOKING-JOURNEY-WAVES.md`
 * قسم «🔔 إضافةٌ من بدر»). أربعة قيود مكتوبة في الموجز، وكلٌّ منها **محسوم هنا
 * بقرار مكتوب** لا متروك للسلوك الافتراضي:
 *
 * | القيد | الحسم |
 * |---|---|
 * | المتصفح يمنع التشغيل قبل تفاعل المستخدم | **تسليحٌ مزدوج**: أول تفاعل في الصفحة يفتح القفل صامتاً، **ومعه** زرّ «فعّل الصوت» صريح يُشغّل نغمةً مسموعة تأكيداً |
 * | لا يفشل صامتاً | كل رنّة ضاعت تُحصى في `unheard`، والجرس يحمل علامةً مرئية والقائمة تحمل سطراً يقول ماذا يفعل المالك الآن |
 * | مفتاح إيقاف لازم ويُحفَظ | `localStorage` — قرار الإسكات يعيش عبر إعادات التحميل والتبويبات |
 * | أصلٌ محلي صغير | `public/sounds/notification.wav` — ‏21.6 ك.ب، WAV مولَّد في المستودع، بلا نداء شبكة ولا رخصة أصلٍ مجهولة |
 *
 * ── لماذا `new Audio()` لا عنصر `<audio>` في JSX ─────────────────────────────
 * لأن التسليح والتشغيل كلاهما يقع خارج دورة التصيير (مستمع على `document`،
 * ونداء من دالة تحديث القائمة). عنصرٌ في الشجرة كان سيحتاج `ref` يُمرَّر بين
 * مكوّنين لا علاقة بينهما، والنتيجة نفسها.
 *
 * 🔒 **والملف لا يقرّر متى يرنّ**: `ring()` يُنادى من صاحب البيانات (الجرس)،
 * وشرطُ «وصل جديد» يعيش هناك مع الصفوف. هذا الملف يملك **القدرة على الصوت**
 * وحدها — الإذن والكتم والتسليح والفشل.
 */

/**
 * الأصل المحلي — لا نداء خارجي (سياسة صفر تبعيات خارجية).
 *
 * 📌 **ومن أين جاء الملف؟** مولَّدٌ برمجياً لا منزَّلٌ من مكتبة أصوات: نغمتان
 * (‏٨٨٠ هرتز ثم ١١٧٤٫٦٦) بتوافقيةٍ ثانية خافتة ومغلّفِ اضمحلالٍ أسّي، PCM أحادي
 * ١٦ بت على ٢٢٠٥٠ هرتز، نصف ثانية ⇒ **٢٢٬٠٩٤ بايت**. اختيرت هذه الطريقة لأن أي
 * أصلٍ منزَّل يجرّ سؤال رخصة إلى مستودعٍ يُطلَق بعلامات متعددة (Whitelabel)،
 * والوصفة أعلاه تكفي لإعادة توليده بلا مكتبة.
 */
const SOUND_SRC = "/sounds/notification.wav";

/** قرار الكتم يعيش على الجهاز — قرارُ مستخدمٍ لا إعدادُ منصة، ولا يخص متعهداً آخر */
const MUTE_KEY = "tours01:notifications:sound-muted";

/**
 * أقلّ فاصل بين رنّتين. موجةُ بثٍّ واحدة تُدرج **صفّاً لكل متعهد في المعاملة
 * نفسها** (`broadcast_round` في 0054)، فخمسة متعهدين = خمسة صفوف في اللحظة
 * ذاتها. بلا هذا الفاصل تصير الرنّة رشقةً — و«الإنذار الذي يرنّ على ضجيج يصمت
 * يوم الحريق» (القاعدة ١٣ في `handover/INDEX.md`).
 */
const MIN_GAP_MS = 3_000;

/** مستوى هادئ: تنبيهٌ في مكتب لا منبّه */
const VOLUME = 0.5;

/**
 * سبب تعذّر الصوت — **رمزٌ لا جملة** (🔒 قاعدة المشروع)، والواجهة تترجمه.
 * - `gesture`: سياسة التشغيل التلقائي — لم يتفاعل المستخدم مع الصفحة بعد.
 * - `denied`: المتصفح يمنع الصوت من إعداداته (نقرةٌ لن تكفي). **ولا نجزم أهو
 *   منعٌ لهذا الموقع أم لكل المواقع** — والتمييز بيد صاحب الشاشة لا بيدنا،
 *   فالنصّ يذكر الاحتمالين بدل أن يرسله إلى نصف المكان (النبرة نفسها المعتمَدة
 *   في بطاقة حظر التنبيهات في `app/portal/_components/push-setup.tsx`).
 * - `unsupported`: لا `Audio` في هذه البيئة أصلاً.
 */
export type SoundFailure = "gesture" | "denied" | "unsupported";

export const SOUND_FAILURE_TEXT: Record<SoundFailure, string> = {
  gesture:
    "المتصفح يمنع تشغيل الصوت قبل أول تفاعل مع الصفحة. انقر «فعّل الصوت» مرة واحدة وسيعمل بعدها تلقائياً.",
  denied:
    "المتصفح يمنع الصوت من إعداداته — إمّا لهذا الموقع وحده وإمّا لكل المواقع. جرّب موقعاً آخر: إن مُنع هو أيضاً فالمنع عامٌّ ويُرفع من إعدادات الصوت في المتصفح، وإلا فمن أيقونة القفل بجوار العنوان. ثم انقر «فعّل الصوت».",
  unsupported: "هذا المتصفح لا يدعم تشغيل الصوت — الجرس والعدّاد يعملان كالمعتاد بلا نغمة.",
};

export type NotificationSound = {
  /** أسكته المالك بنفسه — محفوظ على هذا الجهاز */
  muted: boolean;
  toggleMuted: () => void;
  /** جاهزٌ للرنين الآن: مُسلَّح وغير مكتوم */
  ready: boolean;
  /** رمز آخر تعذّر — `null` يعني لا مشكلة معروفة */
  failure: SoundFailure | null;
  /** كم تنبيهاً وصل ولم يُسمَع صوته بسبب المنع — لا يُبتلع أبداً */
  unheard: number;
  /** يُنادى عند وصول جديد. آمنٌ للنداء المتكرر: يكتم نفسه بالفاصل الأدنى */
  ring: () => void;
  /** زرّ «فعّل الصوت» — يجب أن يُنادى من معالج نقرة حقيقية */
  enable: () => void;
};

function readMuted(): boolean {
  try {
    return window.localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false; // متصفح يمنع التخزين — الصوت يعمل، والقرار لا يعيش بعد الإغلاق
  }
}

function writeMuted(value: boolean) {
  try {
    window.localStorage.setItem(MUTE_KEY, value ? "1" : "0");
  } catch {
    /* تجاهُل مقصود — لا شيء يُكسر بغياب التخزين */
  }
}

/** تصنيف رفض `play()`: ما ينفع معه زرٌّ واحد، وما يحتاج إعدادات المتصفح */
function classify(error: unknown): SoundFailure {
  const name = typeof error === "object" && error !== null ? String((error as Error).name) : "";
  const message =
    typeof error === "object" && error !== null ? String((error as Error).message ?? "") : "";
  if (name === "NotSupportedError") return "unsupported";
  // بعض المتصفحات تُميّز المنع من الإعدادات برسالةٍ تذكر `user denied`/`blocked`
  if (/denied|blocked by|permission/i.test(message)) return "denied";
  return "gesture";
}

/**
 * قدرةُ الصوت وحدها — بلا أي معرفة بالإشعارات.
 *
 * ⚠ **ولماذا لا يقرأ هذا الخُطّاف الصفوف؟** لأن «ما وصل جديداً» سؤالُ بيانات لا
 * سؤال صوت، وجوابه عند من يملك القائمة. خلطُهما كان سيجعل كل تغيير في شرط
 * «جديد» يمرّ على منطق الإذن والتسليح بلا حاجة.
 */
export function useNotificationSound(): NotificationSound {
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const armedRef = React.useRef(false);
  const lastRingRef = React.useRef(0);

  /**
   * تهيئة كسولة لا تأثير جانبي — على الخادم افتراضٌ محايد، وأول رسم في المتصفح
   * يقرأ القرار المحفوظ مباشرة.
   *
   * ⚠ **ولماذا لا يكسر هذا الترطيب؟** لأن **لا شيء يعتمد على `muted` يُصيَّر عند
   * الترطيب**: مفتاح الكتم وسطر التعذّر كلاهما داخل قائمة الجرس، والقائمة لا
   * تُفتح إلا بنقرة — أي بعد الترطيب بكثير. (لو ظهر أيٌّ منهما في الشريط العلوي
   * غداً فهذا السطر يبطل، ويصير `useSyncExternalStore` هو الشكل الصحيح.)
   */
  const [muted, setMuted] = React.useState(() =>
    typeof window === "undefined" ? false : readMuted()
  );
  const [failure, setFailure] = React.useState<SoundFailure | null>(() =>
    typeof window === "undefined" || typeof window.Audio === "function" ? null : "unsupported"
  );
  const [armed, setArmed] = React.useState(false);
  const [unheard, setUnheard] = React.useState(0);

  // المرآة تُكتب في تأثير لا في التصيير: `ring()` تُنادى من خارج دورة التصيير،
  // فتقرأ آخر قيمة مستقرة لا قيمةً وسيطة
  const mutedRef = React.useRef(muted);
  React.useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  // (١) تهيئة عنصر الصوت — أصلٌ محلي واحد يُعاد استعماله في كل رنّة
  React.useEffect(() => {
    if (typeof window === "undefined" || typeof window.Audio !== "function") return;

    const el = new window.Audio(SOUND_SRC);
    el.preload = "auto"; // أصلٌ محلي صغير — تحميلُه مقدَّماً يمنع تأخر أول رنّة
    el.volume = VOLUME;
    audioRef.current = el;

    return () => {
      el.pause();
      audioRef.current = null;
    };
  }, []);

  /** تشغيلٌ واحد. `audible=false` يفتح القفل صامتاً عند أول تفاعل */
  const play = React.useCallback(async (audible: boolean): Promise<boolean> => {
    const el = audioRef.current;
    if (!el) return false;
    try {
      el.currentTime = 0;
      el.volume = audible ? VOLUME : 0;
      // ⚠ الانتظار إلزامي قبل `pause()`: قطعُ وعدِ `play()` بإيقافٍ فوري يُنتج
      //    AbortError في الطرفية ويُقرأ عطلاً وليس عطلاً
      await el.play();
      if (!audible) {
        el.pause();
        el.currentTime = 0;
        el.volume = VOLUME;
      }
      armedRef.current = true;
      setArmed(true);
      setFailure(null);
      /**
       * 🔴 **ولا يُمسح عدّاد الفائت إلا بتشغيلٍ مسموع.**
       *
       * كان `setUnheard(0)` هنا بلا شرط — والتسليح الصامت يقع على **أول نقرة
       * في اللوحة، وأولُها عادةً النقرة على الجرس نفسه**. فالتسلسل كان:
       * يصل تنبيهٌ والصوت ممنوع ⇒ `unheard = 1` وتظهر العلامة الكهرمانية ⇒
       * ينقر المالك الجرسَ ليرى ما الخبر ⇒ التسليح الصامت يمسح العدّاد ⇒
       * تُفتح القائمة **وليس فيها شيء يقول إن تنبيهاً فات**.
       *
       * أي أن الفعل الوحيد الذي يمكن أن يكشف الفشل كان هو الذي يمحوه. وهذا
       * نقضٌ مباشر للقيد المكتوب في ترويسة هذا الملف («لا يفشل صامتاً»)،
       * والصمتُ هنا أسوأ من انعدام الميزة.
       *
       * فالمسح صار مقروناً بـ`audible`: زرُّ «فعّل الصوت» ورفعُ الكتم وحدهما —
       * وكلاهما **يُسمِع المالك نغمةً بأذنه**، فالمسح حينئذٍ إقرارٌ بما سمعه لا
       * محوٌ لما فاته.
       */
      if (audible) setUnheard(0);
      return true;
    } catch (error) {
      setFailure(classify(error));
      return false;
    }
  }, []);

  // (٢) التسليح التلقائي على أول تفاعل — نقرةٌ في أي مكان من اللوحة تكفي.
  //     `capture` كي لا يبتلعها مكوّنٌ يوقف الانتشار، و`once` كي تنصرف بعد النجاح.
  React.useEffect(() => {
    if (armed) return;
    let done = false;
    const onFirst = () => {
      if (done) return;
      done = true;
      void play(false);
    };
    const opts = { capture: true, once: true } as const;
    document.addEventListener("pointerdown", onFirst, opts);
    document.addEventListener("keydown", onFirst, opts);
    document.addEventListener("touchstart", onFirst, opts);
    return () => {
      document.removeEventListener("pointerdown", onFirst, true);
      document.removeEventListener("keydown", onFirst, true);
      document.removeEventListener("touchstart", onFirst, true);
    };
  }, [armed, play]);

  const ring = React.useCallback(() => {
    if (mutedRef.current) return; // مكتوم بقرار صاحبه — لا رنّة ولا شكوى
    const el = audioRef.current;
    if (!el) {
      setUnheard((n) => n + 1);
      return;
    }
    const now = Date.now();
    if (now - lastRingRef.current < MIN_GAP_MS) return; // رشقة واحدة = رنّة واحدة
    lastRingRef.current = now;

    el.currentTime = 0;
    el.volume = VOLUME;
    void el.play().catch((error: unknown) => {
      // ⚠ هنا بالضبط «لا يفشل صامتاً»: التنبيه وصل ولم يُسمَع، فيُحصى ويُعرض
      armedRef.current = false;
      setArmed(false);
      setFailure(classify(error));
      setUnheard((n) => n + 1);
    });
  }, []);

  const enable = React.useCallback(() => {
    setMuted(false);
    writeMuted(false);
    void play(true); // مسموعة عمداً: المالك يستحق تأكيداً بأذنه لا بنصّ على الشاشة
  }, [play]);

  const toggleMuted = React.useCallback(() => {
    setMuted((was) => {
      const next = !was;
      writeMuted(next);
      // رفعُ الكتم لحظةَ نقرةٍ حقيقية = فرصة تسليحٍ مجانية، فلا ينتظر المالك تنبيهاً
      // ليكتشف أن المتصفح كان مانعاً
      if (!next && !armedRef.current) void play(true);
      return next;
    });
  }, [play]);

  return {
    muted,
    toggleMuted,
    ready: armed && !muted,
    failure: armed ? null : failure,
    unheard,
    ring,
    enable,
  };
}

/* ------------------------------------------------------------------ */
/* الواجهة — مفتاح الكتم وسطر «تعذّر الصوت»                              */
/* ------------------------------------------------------------------ */

/**
 * مفتاح الصوت داخل قائمة الجرس. زرٌّ واحد بحالتين معلنتين لقارئ الشاشة
 * (`aria-pressed`)، لا مفتاح تبديل بصريّ بلا دلالة.
 */
export function SoundToggle({ sound }: { sound: NotificationSound }) {
  return (
    <button
      type="button"
      onClick={sound.toggleMuted}
      aria-pressed={!sound.muted}
      title={sound.muted ? "الصوت مكتوم — انقر لتشغيله" : "الصوت يعمل — انقر لكتمه"}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-medium transition-colors",
        sound.muted
          ? "text-muted-foreground hover:bg-muted"
          : "text-primary hover:bg-primary/10"
      )}
    >
      {sound.muted ? (
        <VolumeX className="size-3.5 shrink-0" aria-hidden="true" />
      ) : (
        <Volume2 className="size-3.5 shrink-0" aria-hidden="true" />
      )}
      {sound.muted ? "الصوت مكتوم" : "الصوت يعمل"}
    </button>
  );
}

/**
 * سطر «الصوت لم يعمل» — يظهر **فقط** حين يوجد ما يُقال، ونصّه يتدرّج مع الواقع:
 * قبل ضياع أي رنّة يكون دعوةً هادئة، وبعد ضياع رنّة يصير خبراً بما فات.
 *
 * وهو الشقّ المرئي من «لا يفشل صامتاً»: بلا هذا السطر يبقى المالك يظن أن الصوت
 * يعمل لأن لا شيء أخبره بالعكس — وهي أسوأ حالة ممكنة لإنذار.
 */
export function SoundGate({ sound }: { sound: NotificationSound }) {
  // مكتومٌ بقرار صاحبه ليس عطلاً، ولا شيء يُقال عنه هنا
  if (sound.muted) return null;
  if (!sound.failure && sound.unheard === 0) return null;

  const missed = sound.unheard > 0;
  const failure = sound.failure ?? "gesture";

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 px-3 py-2 text-[11px] leading-relaxed",
        missed
          ? "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-100"
          : "bg-muted/60 text-muted-foreground"
      )}
    >
      <VolumeX className="size-3.5 shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        {missed ? (
          <>
            <span className="font-semibold">
              {sound.unheard === 1 ? "وصل تنبيه ولم يُسمَع صوته." : "وصلت تنبيهات ولم يُسمَع صوتها."}
            </span>{" "}
          </>
        ) : null}
        {SOUND_FAILURE_TEXT[failure]}
      </span>
      {failure !== "unsupported" ? (
        <button
          type="button"
          onClick={sound.enable}
          className="shrink-0 rounded-lg bg-primary px-2 py-1 font-semibold text-primary-foreground transition-opacity hover:opacity-90"
        >
          فعّل الصوت
        </button>
      ) : null}
    </div>
  );
}
