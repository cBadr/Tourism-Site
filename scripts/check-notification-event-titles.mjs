#!/usr/bin/env node
/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  حارسُ تطابق أحداث الإشعارات بين ما تبعثه القاعدة وما تسمّيه الواجهة      ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 *   node scripts/check-notification-event-titles.mjs               # فحص حيّ
 *   node scripts/check-notification-event-titles.mjs --self-test   # إثباتُ أنه يكشف
 *   node scripts/check-notification-event-titles.mjs --file=<path> # فحص نسخةٍ أخرى
 *   node scripts/check-notification-event-titles.mjs --json
 *
 * ── العيب الذي يحرسه، مقيساً ────────────────────────────────────────────────
 *
 * `queue_notification(p_event, …)` تكتب صفَّ الإشعار باسم الحدث كما تعطيه لها
 * الدالةُ المُنتِجة. ثم يقرأ ذلك الاسمَ **راسمٌ واحد** — `EVENT_META` في
 * `lib/notifications/render.ts` — ليعطيه عنواناً عربياً ورمزاً. وما لا مفتاحَ
 * له هناك يسقط إلى `?? "إشعار جديد"` و`?? "🔔"`.
 *
 * وقد وقع فعلاً **مرّتين**: أحداثُ البثّ الأربعة أُضيفت في المرحلة ٦ بلا
 * عناوين، ثم أحداثُ الإغلاق والاعتذار والتظلّم والأعطال — **ثمانيةٌ من سبعة
 * عشر** — وصلت الجرسَ وتليجرام والبريد بعنوان «إشعار جديد» لا يميّزها عن حجزٍ
 * عاديّ. وأخطرها `ops_job_failed`: هو **الأثرُ الوحيد** الذي يصل إنساناً حين
 * تسقط `settle_due_completions` أو `expire_loyalty_points` داخل `dispatch_tick`
 * — وما عداه ابتلعته `exception when others` بهدوء.
 *
 * والاكتشافُ كان يدوياً في المرّتين. وهذا الملفّ هو الثالثة.
 *
 * ── 🔴 لماذا يقرأ القاعدة الحيّة لا ملفّات الهجرة (‏D-58 · القاعدة الذهبية ١٩) ─
 *
 * ملفُّ الهجرة يقول ما **كُتب**، والكتالوج يقول ما **يسري**. ودالةٌ استُبدلت
 * بـ`create or replace` من هجرةٍ لاحقة، أو يدوياً على القاعدة، تجعل قراءةَ
 * النصّ تكذب في الاتجاهين معاً: تُبلغ عن حدثٍ لم يعد يُبعث، وتصمت عن حدثٍ صار
 * يُبعث. فالمصدر هنا `pg_get_functiondef` على `pg_proc` — لا `supabase/`.
 *
 * ── وكيف يُستخرج اسم الحدث من جسم الدالة ────────────────────────────────────
 *
 * الحدثُ هو **المعامل الأول** لـ`queue_notification`. ويُقرأ بقصِّ الوسيط الأول
 * بموازنة الأقواس (مع تخطّي ما داخل النصوص)، ثم يُحلّ بثلاثة أشكالٍ لا رابع:
 *
 *   (١) نصٌّ حرفيّ:            `'ops_job_failed'`
 *   (٢) تعبير `case … end`:    كل فرعٍ بعد `then`/`else` نصٌّ حرفيّ أو `null`
 *   (٣) متغيّر plpgsql:        يُلاحَق إلى إسناداته `v := …;` في الجسم نفسه
 *
 * 🔴 **وما لا يُحَلّ يُحمِّر الحارس** ولا يُتخطّى بصمت. فشكلٌ رابع يُكتب غداً
 * (‏تركيبُ الاسم بـ`||`، أو تمريرُه عبر غلافٍ جديد) يوقف هذا الملفّ عند حدّه
 * المُعلَن بدل أن يمرّ أخضرَ فوق حدثٍ لم يره. **حارسٌ يصمت عمّا لا يفهم أسوأ من
 * غيابه** (النمط ٥ في `LESSONS.md`).
 *
 * ── حدوده المُعلَنة ─────────────────────────────────────────────────────────
 *
 *   • يرى مُنتِجي الأحداث في `public` وحدها — ولا مُنتِجَ اليوم خارجها،
 *     ولا سطرَ TypeScript واحداً ينادي `queue_notification` (مقيسٌ بـgrep).
 *   • لا يُنادى من `pnpm db:test` ولا من `next build` — ربطُه بـ`package.json`
 *     بندٌ متروك للمالك (الملفّ عالي التصادم بين الوكلاء)، كما `check-export-
 *     status-parity.mjs` حرفياً. **وسكربتٌ لا يُنادى لا يحرس شيئاً** — تُقال
 *     صراحةً ولا تُخفى.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { config } from "dotenv";
import ts from "typescript";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RENDER = join(ROOT, "lib", "notifications", "render.ts");
const DICT = "EVENT_META";

/** الدالةُ التي تكتب صفَّ الإشعار — ومَن يناديها هو مُنتِجُ الحدث */
const QUEUE = "queue_notification";

// ---------------------------------------------------------------------------
// (١) الخريطة من نصّ TypeScript — بمحلّل TS لا بتعبيرٍ نمطي
// ---------------------------------------------------------------------------

/**
 * يُرجع `Map<event, { title, emoji }>`، أو **يرمي**.
 *
 * والرمي مقصود: «لم أجد الخريطة» ليس نجاحاً. إن أُعيدت تسميتها أو نُقلت أو
 * تغيّر شكلُها إلى ما لا يفهمه هذا القارئ، يجب أن يسقط الحارس أحمرَ لا أن يمرّ
 * صامتاً على ملفٍّ لم يفحص منه شيئاً.
 */
export function readEventMeta(file) {
  const text = readFileSync(file, "utf8");
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);

  let literal = null;
  const walk = (node) => {
    if (
      literal === null &&
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === DICT &&
      node.initializer &&
      ts.isObjectLiteralExpression(node.initializer)
    ) {
      literal = node.initializer;
    }
    ts.forEachChild(node, walk);
  };
  walk(source);

  if (literal === null) throw new Error(`لم يُعثر على ${DICT} ككائنٍ حرفيّ في ${file}`);

  const out = new Map();
  for (const prop of literal.properties) {
    if (!ts.isPropertyAssignment(prop)) {
      throw new Error(`${DICT} يحمل عضواً غير «مفتاح: قيمة» — الحارس لا يفهمه، فيسقط`);
    }
    const key = ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name) ? prop.name.text : null;
    if (key === null || !ts.isObjectLiteralExpression(prop.initializer)) {
      throw new Error(`${DICT}.${key ?? "?"} ليس كائناً حرفياً { title, emoji } — الحارس يسقط`);
    }
    const fields = {};
    for (const inner of prop.initializer.properties) {
      if (!ts.isPropertyAssignment(inner)) continue;
      const name =
        ts.isIdentifier(inner.name) || ts.isStringLiteral(inner.name) ? inner.name.text : null;
      if (name && ts.isStringLiteral(inner.initializer)) fields[name] = inner.initializer.text;
    }
    if (typeof fields.title !== "string" || typeof fields.emoji !== "string") {
      throw new Error(`${DICT}.${key} ينقصه \`title\` أو \`emoji\` كنصٍّ حرفيّ — الحارس يسقط`);
    }
    out.set(key, { title: fields.title, emoji: fields.emoji });
  }
  if (out.size === 0) throw new Error(`${DICT} فارغة — لا شيء يُفحَص، وهذا ليس نجاحاً`);
  return out;
}

// ---------------------------------------------------------------------------
// (٢) الأحداث من القاعدة الحيّة — `pg_get_functiondef` لا ملفّ هجرة
// ---------------------------------------------------------------------------

/**
 * يقصّ الوسيط الأول لنداءٍ يبدأ عند قوسه المفتوح `open`.
 * يوازن الأقواس ويتخطّى ما داخل نصوص `'…'` (مع `''` المضاعفة).
 */
function firstArgument(def, open) {
  let depth = 1;
  let quoted = false;
  const start = open + 1;
  for (let i = start; i < def.length; i++) {
    const ch = def[i];
    if (quoted) {
      if (ch === "'") {
        if (def[i + 1] === "'") i++;
        else quoted = false;
      }
      continue;
    }
    if (ch === "'") { quoted = true; continue; }
    if (ch === "(") depth++;
    else if (ch === ")") { depth--; if (depth === 0) return def.slice(start, i); }
    else if (ch === "," && depth === 1) return def.slice(start, i);
  }
  return null;
}

const PURE_LITERAL = /^'([a-z0-9_]+)'(?:::text)?$/i;
const IDENTIFIER = /^[a-z_][a-z0-9_]*$/i;

/**
 * يحلّ تعبيرَ الحدث إلى أسماءٍ حرفية.
 * يُرجع `{ events: string[] }` أو `{ unresolved: "شرحُ ما لم يُفهَم" }`.
 */
export function resolveEventExpression(expr, body, seen = new Set()) {
  const t = String(expr ?? "").replace(/\s+/g, " ").trim();
  if (t === "") return { unresolved: "وسيطٌ أوّلُ فارغ" };

  const pure = PURE_LITERAL.exec(t);
  if (pure) return { events: [pure[1]] };

  // (٢) تعبير `case … end`
  if (/^case\b/i.test(t) && /\bend$/i.test(t)) {
    const events = [];
    const branch = /\b(?:then|else)\s+(?:'([a-z0-9_]+)'(?:::text)?|null)/gi;
    let m;
    let stripped = t;
    while ((m = branch.exec(t))) if (m[1]) events.push(m[1]);
    stripped = t.replace(branch, " ");
    // بقي `then`/`else` لم يكن فرعُه نصّاً حرفياً ولا `null` ⇒ لا يُفهَم
    if (/\b(?:then|else)\b/i.test(stripped)) {
      return { unresolved: `فرعٌ في \`case\` ليس نصّاً حرفياً ولا \`null\`: ${t}` };
    }
    if (events.length === 0) return { unresolved: `\`case\` بلا فرعٍ حرفيّ: ${t}` };
    return { events };
  }

  // (٣) متغيّر plpgsql — يُلاحَق إلى إسناداته في الجسم نفسه
  if (IDENTIFIER.test(t)) {
    if (seen.has(t)) return { unresolved: `إسنادٌ دائريّ للمتغيّر \`${t}\`` };
    seen.add(t);
    const assign = new RegExp(`\\b${t}\\s*:=\\s*([\\s\\S]*?);`, "g");
    const events = [];
    let hit = 0;
    let m;
    while ((m = assign.exec(body))) {
      hit++;
      const rhs = m[1].replace(/\s+/g, " ").trim();
      if (/^null$/i.test(rhs)) continue; // إسنادُ عدمٍ لا يُنتج حدثاً
      const inner = resolveEventExpression(rhs, body, seen);
      if (inner.unresolved) return { unresolved: `عبر \`${t}\`: ${inner.unresolved}` };
      events.push(...inner.events);
    }
    if (hit === 0) {
      return {
        unresolved:
          `\`${t}\` لا إسنادَ له في جسم الدالة — الأرجح أنه **معاملٌ** يمرّره غلافٌ جديد. ` +
          `علّم الحارسَ إياه بدل أن يمرّ حدثٌ بلا فحص.`,
      };
    }
    if (events.length === 0) return { unresolved: `\`${t}\` يُسنَد إلى \`null\` وحده` };
    return { events };
  }

  return { unresolved: `شكلٌ لا يفهمه الحارس: ${t}` };
}

/** يمسح جسم دالةٍ واحدة ويُرجع `{ events:Set, problems:[] }` */
export function scanFunctionBody(proname, def) {
  const events = new Set();
  const problems = [];
  // الغلافُ نفسه ليس مُنتِجاً: معاملُه هو حدثُ مُناديه، ومُناديه مفحوصٌ أصلاً
  if (proname === QUEUE) return { events, problems };

  const call = new RegExp(`(?:public\\.)?${QUEUE}\\s*\\(`, "g");
  let m;
  while ((m = call.exec(def))) {
    const open = m.index + m[0].length - 1;
    const arg = firstArgument(def, open);
    if (arg === null) {
      problems.push({ proname, detail: "نداءٌ بقوسٍ غير مغلق — تعذّر قصُّ وسيطه الأول" });
      continue;
    }
    const res = resolveEventExpression(arg, def);
    if (res.unresolved) problems.push({ proname, detail: res.unresolved });
    else for (const e of res.events) events.add(e);
  }
  return { events, problems };
}

async function readEmittedEvents() {
  config({ path: join(ROOT, ".env.local"), quiet: true });
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL غير موجود في .env.local — والحارس يقيس القاعدة الحيّة لا ملفّ هجرة");
  }
  const { default: pg } = await import("pg");
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    const res = await client.query(
      `select p.proname, pg_get_functiondef(p.oid) as def
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
        order by p.proname`
    );
    const emitted = new Map(); // event -> Set<proname>
    const problems = [];
    let callers = 0;
    for (const row of res.rows) {
      if (!row.def.includes(QUEUE)) continue;
      if (row.proname !== QUEUE) callers++;
      const { events, problems: bad } = scanFunctionBody(row.proname, row.def);
      problems.push(...bad);
      for (const e of events) {
        if (!emitted.has(e)) emitted.set(e, new Set());
        emitted.get(e).add(row.proname);
      }
    }
    if (callers === 0) {
      throw new Error(
        `لا دالةَ واحدة في \`public\` تنادي ${QUEUE} — وهذا ليس نجاحاً: ` +
          `إمّا أن الاسم تغيّر، أو أن الوصلة على قاعدةٍ غير مهاجَرة. الحارس يسقط.`
      );
    }
    return { emitted, problems };
  } finally {
    await client.end().catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// (٣) المقارنة
// ---------------------------------------------------------------------------

const LATIN = /[A-Za-z]/;

/**
 * `emitted`: `Map<event, Set<proname>>` · `meta`: `Map<event, {title,emoji}>`
 * `problems`: ما تعذّر حلُّه في القاعدة — ويُحمِّر كما يُحمِّر النقص.
 */
export function compare(emitted, meta, problems = []) {
  const errors = [];

  for (const p of problems) {
    errors.push({
      kind: "unresolved-event",
      detail:
        `\`${p.proname}\` تنادي ${QUEUE} بوسيطٍ لم يستطع الحارس حلَّه — ${p.detail}` +
        ` ⇒ قد يكون هناك حدثٌ بلا عنوان لا يراه هذا الفحص. عَلِّم الحارسَ الشكلَ الجديد.`,
    });
  }

  for (const [event, producers] of [...emitted].sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (!meta.has(event)) {
      errors.push({
        kind: "missing-title",
        detail:
          `الحدث «${event}» تبعثه ${[...producers].sort().join(" · ")} ولا مفتاحَ له في ${DICT}.` +
          ` ⇒ يصل الجرسَ وتليجرام والبريد بعنوان «إشعار جديد» ورمز «🔔»، فلا يُميَّز عن حجزٍ عاديّ.`,
      });
    }
  }

  const seenEmoji = new Map();
  for (const [event, { title, emoji }] of [...meta].sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (!emitted.has(event)) {
      errors.push({
        kind: "phantom-event",
        detail:
          `المفتاح «${event}» في ${DICT} لا تبعثه أيُّ دالةٍ في القاعدة.` +
          ` ⇒ خيارٌ ميّت في مرشِّح «كل الأحداث» بشاشة الإشعارات يُخرج جدولاً فارغاً دائماً.`,
      });
    }
    if (title.trim() === "" || title === event || LATIN.test(title)) {
      errors.push({
        kind: "latin-title",
        detail: `عنوان «${event}» = «${title}» ليس عربياً خالصاً — الجرس عربيّ ولا يُطبع فيه معرّفٌ خام.`,
      });
    }
    if (emoji.trim() === "") {
      errors.push({
        kind: "missing-emoji",
        detail: `الحدث «${event}» بلا رمز — والخريطتان تُعرضان معاً، فالفراغ يُقرأ عطلاً في الجرس.`,
      });
    } else if (title.includes(emoji)) {
      errors.push({
        kind: "emoji-in-title",
        detail:
          `عنوان «${event}» يحمل رمزه «${emoji}» داخله، والأسطح تعرض «{emoji} {title}» معاً.` +
          ` ⇒ «${emoji} ${emoji}» مكرَّراً في الجرس وفي تليجرام.`,
      });
    }
    if (emoji.trim() !== "") {
      const twin = seenEmoji.get(emoji);
      if (twin) {
        errors.push({
          kind: "duplicate-emoji",
          detail:
            `الرمز «${emoji}» مشترَكٌ بين «${twin}» و«${event}» — والرمز وُجد ليُميّز قبل القراءة.` +
            ` ⇒ حدثان متطابقان بصرياً في الجرس، وهو بعينه ما جعل عطلاً يشبه حجزاً.`,
        });
      } else {
        seenEmoji.set(emoji, event);
      }
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// (٤) الاختبار الذاتي — إثباتُ أنه يحمرّ فعلاً
// ---------------------------------------------------------------------------

function selfTest() {
  const meta = (rows) => new Map(rows.map(([k, t, e]) => [k, { title: t, emoji: e }]));
  const emit = (rows) => new Map(rows.map(([k, p]) => [k, new Set([p])]));

  const cases = [
    {
      name: "حدثٌ تبعثه القاعدة بلا عنوان (الحالة التي وقعت) ⇒ يجب أن يسقط",
      emitted: emit([["booking_created", "log_booking_change"], ["ops_job_failed", "dispatch_tick"]]),
      meta: meta([["booking_created", "حجز جديد", "🚗"]]),
      expect: "missing-title",
    },
    {
      name: "مفتاحٌ لا تبعثه دالة ⇒ يجب أن يسقط",
      emitted: emit([["booking_created", "log_booking_change"]]),
      meta: meta([["booking_created", "حجز جديد", "🚗"], ["ghost_event", "شبح", "👻"]]),
      expect: "phantom-event",
    },
    {
      name: '«إصلاح» كسول: ops_job_failed: "ops_job_failed" ⇒ يجب أن يسقط',
      emitted: emit([["ops_job_failed", "dispatch_tick"]]),
      meta: meta([["ops_job_failed", "ops_job_failed", "🚨"]]),
      expect: "latin-title",
    },
    {
      name: "عنوانٌ بلا رمز ⇒ يجب أن يسقط (الخريطتان تُعرضان معاً)",
      emitted: emit([["ops_job_failed", "dispatch_tick"]]),
      meta: meta([["ops_job_failed", "عطل في مهمة مجدولة", ""]]),
      expect: "missing-emoji",
    },
    {
      name: "رمزٌ يشبه غيره ⇒ يجب أن يسقط (العطل لا يُميَّز عن الحجز)",
      emitted: emit([["booking_created", "log_booking_change"], ["ops_job_failed", "dispatch_tick"]]),
      meta: meta([["booking_created", "حجز جديد", "🚗"], ["ops_job_failed", "عطل", "🚗"]]),
      expect: "duplicate-emoji",
    },
    {
      name: "الرمز مكرَّرٌ داخل العنوان ⇒ يجب أن يسقط",
      emitted: emit([["ops_job_failed", "dispatch_tick"]]),
      meta: meta([["ops_job_failed", "🚨 عطل في مهمة مجدولة", "🚨"]]),
      expect: "emoji-in-title",
    },
    {
      name: "وسيطٌ لم يُفهَم ⇒ يجب أن يسقط ولا يُتخطّى بصمت",
      emitted: emit([["booking_created", "log_booking_change"]]),
      meta: meta([["booking_created", "حجز جديد", "🚗"]]),
      problems: [{ proname: "some_new_fn", detail: "شكلٌ لا يفهمه الحارس: 'x' || y" }],
      expect: "unresolved-event",
    },
    {
      name: "متطابقان تماماً ⇒ يجب أن يمرّ",
      emitted: emit([["booking_created", "log_booking_change"], ["ops_job_failed", "dispatch_tick"]]),
      meta: meta([["booking_created", "حجز جديد", "🚗"], ["ops_job_failed", "عطل في مهمة", "🚨"]]),
      expect: null,
    },
  ];

  // وحلّالُ التعابير يُختبر بأشكاله الثلاثة كما هي في القاعدة اليوم
  const body = `
    declare v_event text;
    begin
      v_event := 'booking_created';
      v_event := case new.status
                   when 'under_review' then 'receipt_uploaded'
                   when 'confirmed'    then 'booking_confirmed'
                   else null
                 end;
    end;`;
  const resolver = [
    { name: "حرفيّ", expr: "'ops_job_failed'", body: "", expect: ["ops_job_failed"] },
    {
      name: "case بفرعين حرفيين",
      expr: "case when x then 'trip_withdrawn_manual' else 'trip_withdrawn_rebroadcast' end",
      body: "",
      expect: ["trip_withdrawn_manual", "trip_withdrawn_rebroadcast"],
    },
    {
      name: "متغيّرٌ يُلاحَق إلى إسناداته",
      expr: "v_event",
      body,
      expect: ["booking_created", "receipt_uploaded", "booking_confirmed"],
    },
    { name: "تركيبٌ بـ|| ⇒ يجب أن يُعلَن أنه لم يُفهَم", expr: "'trip_' || v_kind", body: "", expect: null },
    { name: "معاملٌ بلا إسناد ⇒ يجب أن يُعلَن أنه لم يُفهَم", expr: "p_event", body: "begin end;", expect: null },
    {
      name: "case بفرعٍ غير حرفيّ ⇒ يجب أن يُعلَن أنه لم يُفهَم",
      expr: "case when x then 'a_b' else v_other end",
      body: "",
      expect: null,
    },
  ];

  let bad = 0;

  for (const r of resolver) {
    const out = resolveEventExpression(r.expr, r.body);
    const ok =
      r.expect === null
        ? Boolean(out.unresolved)
        : !out.unresolved && JSON.stringify([...out.events].sort()) === JSON.stringify([...r.expect].sort());
    console.log(`${ok ? "✅" : "🔴"} [حلّال] ${r.name}`);
    if (!ok) {
      bad++;
      console.log(`   المُتوقَّع: ${r.expect ?? "لم يُفهَم"} · الواقع: ${JSON.stringify(out)}`);
    }
  }

  for (const c of cases) {
    const errors = compare(c.emitted, c.meta, c.problems ?? []);
    const hit = c.expect === null ? errors.length === 0 : errors.some((e) => e.kind === c.expect);
    console.log(`${hit ? "✅" : "🔴"} [مقارنة] ${c.name}`);
    if (!hit) {
      bad++;
      console.log(`   المُتوقَّع: ${c.expect ?? "بلا أخطاء"} · الواقع: ${JSON.stringify(errors)}`);
    }
  }

  console.log(bad === 0 ? "\nSELF-TEST PASSED" : `\n🔴 SELF-TEST FAILED (${bad})`);
  return bad === 0 ? 0 : 1;
}

// ---------------------------------------------------------------------------
// (٥) التشغيل
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);
if (argv.includes("--self-test")) process.exit(selfTest());

const fileArg = argv.find((a) => a.startsWith("--file="));
const file = fileArg ? fileArg.slice("--file=".length) : RENDER;

const meta = readEventMeta(file);
const { emitted, problems } = await readEmittedEvents();
const errors = compare(emitted, meta, problems);

if (argv.includes("--json")) {
  console.log(
    JSON.stringify(
      {
        file,
        emitted: Object.fromEntries([...emitted].map(([k, v]) => [k, [...v].sort()])),
        meta: Object.fromEntries(meta),
        problems,
        errors,
      },
      null,
      2
    )
  );
} else {
  console.log(`الملفّ: ${file}`);
  console.log(
    `القاعدة تبعث ${emitted.size} حدثاً: ${[...emitted.keys()].sort().join(" · ")}`
  );
  console.log(`${DICT} يحمل ${meta.size} مفتاحاً: ${[...meta.keys()].sort().join(" · ")}`);
  for (const e of errors) console.log(`\n🔴 [${e.kind}]\n   ${e.detail}`);
  console.log(errors.length === 0 ? "\nEVENT TITLES OK" : `\n🔴 EVENT TITLES BROKEN (${errors.length})`);
}

process.exit(errors.length ? 1 : 0);
