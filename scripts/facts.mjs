#!/usr/bin/env node
/**
 * `pnpm facts` — الحقائق التي يُعيد كل وكيل اكتشافها، في نداءٍ واحد.
 *
 * ── لماذا يوجد هذا الملف ───────────────────────────────────────────────────
 *
 * قِيس في 2026-08-18: موجةُ عملٍ واحدة كلّفت **عشرة ملايين رمز** و**٤٢٧٠ نداء
 * أداة**. والكتلة الكبرى منها لم تكن في العمل بل في **الجهل**: كل وكيل يبدأ
 * أعمى أمام نظامٍ فيه ١٠٢ هجرة و٣٥ مجموعة و٦٠ قراراً، فيقرأ خمس وثائق ثم
 * **يُعيد قياس نفس الأربعين حقيقة** — إعدادات المالك، وعدد الهجرات، والرقم
 * الحرّ، وحالة اللغات، وصفوف بياناته.
 *
 * وكنتُ أكتبها له في البريف، **فيُعيد قياسها على أي حال** — لأن بريفاً يقول
 * رقماً دون الأمر الذي أنتجه لا يُصدَّق، وحقُّه ألّا يُصدِّقه (‏`CLAUDE.md`:
 * «تقارير الوكلاء تُجمِّل وتغفل»).
 *
 * فالعلاج ليس رقماً في نصّ، بل **أمراً يُنتج الرقم**: نداءٌ واحد بدل خمسة عشر،
 * ومخرَجٌ كلُّ سطرٍ فيه مقيسٌ لحظتَه لا منقولٌ عن أحد.
 *
 * ── قواعد التعديل ─────────────────────────────────────────────────────────
 *
 * (١) **قراءةٌ محضة.** لا `insert` ولا `update` ولا `delete` — يُنادى وسط عملٍ
 *     متوازٍ وعلى قاعدة الإنتاج نفسها (لا قاعدة اختبار منفصلة).
 * (٢) **لا يُطبع سرّ.** لا `DATABASE_URL` ولا مفتاح ولا جزءٌ منه؛ ولا هاتفَ
 *     عميلٍ كاملاً — تُقنَّع الأرقام، فالمخرَج يُلصق في تقارير وسجلّات.
 * (٣) **قسمٌ يسقط لا يُسقط الباقي.** كل استعلامٍ في `try`، والعطل يُطبع سطراً
 *     ولا يُنهي البرنامج — فمخطَّطٌ ناقصٌ اليوم أهون من أداةٍ لا تعمل.
 * (٤) **الرقم بأمره.** ما لا يُعرف مصدره لا يُطبع.
 *
 * الاستعمال:  node scripts/facts.mjs          ← نصٌّ للقراءة
 *             node scripts/facts.mjs --json   ← كائنٌ للمقارنة الآلية (diff)
 */

import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(ROOT, "package.json"));
const pg = require("pg");

const JSON_MODE = process.argv.includes("--json");
const out = {};
const lines = [];

function say(text = "") {
  if (!JSON_MODE) lines.push(text);
}
function head(title) {
  say("");
  say(`── ${title} ${"─".repeat(Math.max(0, 62 - title.length))}`);
}

/** يُقنّع هاتفاً فيبقى مميَّزاً ولا يُفشى: 01012345678 ⇒ 0101****678 */
function maskPhone(value) {
  const s = String(value ?? "");
  return s.length < 8 ? "***" : `${s.slice(0, 4)}****${s.slice(-3)}`;
}

function dbUrl() {
  const line = readFileSync(join(ROOT, ".env.local"), "utf8")
    .split(/\r?\n/)
    .find((l) => l.trim().startsWith("DATABASE_URL="));
  if (!line) throw new Error("DATABASE_URL غير موجود في .env.local");
  return line.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
}

const client = new pg.Client({ connectionString: dbUrl(), ssl: { rejectUnauthorized: false } });

/** كل قسمٍ معزول: عطبُه سطرٌ في المخرَج لا نهايةُ الأداة */
async function section(key, title, fn) {
  try {
    const value = await fn();
    out[key] = value;
    return value;
  } catch (error) {
    out[key] = { error: error.message };
    say(`  ⚠ تعذّر «${title}»: ${error.message}`);
    return null;
  }
}

const q = async (text, params = []) => (await client.query(text, params)).rows;

await client.connect();

// ── الملفّات على القرص — لا قاعدة، فتُقرأ حتى بلا اتصال ────────────────────
head("القرص");
const files = readdirSync(join(ROOT, "supabase/migrations")).filter((f) => f.endsWith(".sql")).sort();
const suites = readdirSync(join(ROOT, "supabase/tests")).filter((f) => f.endsWith(".sql")).sort();
const numbers = files.map((f) => Number.parseInt(f.slice(0, 4), 10)).filter((n) => Number.isFinite(n));
const highest = numbers.length ? Math.max(...numbers) : 0;
const gaps = [];
for (let i = 1; i < highest; i += 1) if (!numbers.includes(i)) gaps.push(String(i).padStart(4, "0"));
out.disk = { migrations: files.length, suites: suites.length, highest, gaps, latest: files.at(-1) };
say(`  هجرات على القرص : ${files.length}      أعلى رقم: ${String(highest).padStart(4, "0")}`);
say(`  مجموعات اختبار  : ${suites.length}`);
say(`  آخر ملف         : ${files.at(-1)}`);
say(`  فجوات الترقيم   : ${gaps.length ? gaps.join(" · ") : "لا شيء"}`);
say(`  ⚠ العدد ≠ أعلى رقم حين توجد فجوة — الرقم الحرّ يُشتقّ من أعلى رقمٍ لا من العدّ`);

// ── دفتر الهجرات — القرص مقابل القاعدة ────────────────────────────────────
head("دفتر الهجرات");
await section("ledger", "دفتر الهجرات", async () => {
  const rows = await q("select name from public.schema_migrations order by name");
  const inDb = rows.map((r) => r.name);
  const orphans = inDb.filter((n) => !files.includes(n));
  const missing = files.filter((n) => !inDb.includes(n));
  say(`  مطبَّقة في القاعدة : ${inDb.length}`);
  say(`  في القاعدة بلا ملف : ${orphans.length ? orphans.join(" · ") : "لا شيء"}`);
  say(`  على القرص بلا تطبيق: ${missing.length ? missing.join(" · ") : "لا شيء"}`);
  const free = String(highest + 1).padStart(4, "0");
  say(`  🔢 الرقم الحرّ التالي: ${free}   ← يُسنَد صراحةً لكل وكيل، ولا يُترك ليُشتقّ`);
  return { applied: inDb.length, orphans, missing, nextFree: free };
});

// ── إعدادات المالك — لا تُعدَّل بلا إذنه (STANDING-ORDERS §٣) ──────────────
head("إعدادات المالك — تُقرأ ولا تُمسّ");
await section("settings", "إعدادات المالك", async () => {
  const grab = async (table, cols) => {
    try {
      return (await q(`select ${cols} from public.${table} limit 1`))[0] ?? null;
    } catch {
      return null;
    }
  };
  const trip = await grab("trip_settings", "min_lead_minutes, time_zone");
  const pricing = await grab("pricing_settings", "margin_type, margin_value, margin_min_amount");
  const loyalty = await grab("loyalty_settings", "enabled, points_per_currency, currency_per_point, min_redeem_points, max_redeem_percent");
  const discount = await grab("discount_settings", "enabled");
  const providers = await q("select provider, enabled from public.payment_providers order by sort, provider");
  const on = providers.filter((p) => p.enabled).map((p) => p.provider);

  if (trip) say(`  المهلة الدنيا     : ${trip.min_lead_minutes} دقيقة        المنطقة: ${trip.time_zone}`);
  if (pricing) say(`  الهامش            : ${pricing.margin_type} ${pricing.margin_value}  وأرضيته ${pricing.margin_min_amount}`);
  if (loyalty)
    say(
      `  الولاء            : ${loyalty.enabled ? "مُشتعل" : "مطفأ"}  ·  ${loyalty.points_per_currency} نقطة/ج.م  ·  النقطة ${loyalty.currency_per_point} ج.م  ·  حدٌّ أدنى ${loyalty.min_redeem_points}  ·  سقف ${loyalty.max_redeem_percent}٪`,
    );
  if (loyalty) {
    const effective = Number(loyalty.points_per_currency) * Number(loyalty.currency_per_point);
    say(`  ⇒ الاسترداد الفعلي: ${(effective * 100).toFixed(2)}٪ من قيمة الرحلة`);
  }
  if (discount) say(`  الخصومات          : ${discount.enabled ? "مُشتعلة" : "مطفأة"}`);
  say(`  مزوّدات الدفع     : ${on.length ? `🔴 مُشتعل: ${on.join(" · ")}` : `السبعة مطفأة ✅`}`);
  say(`  ⚠ الولاء والكوبونات مُشتعلان بقرار المالك (2026-08-17) — لا يُطفآن بلا أمره`);
  return { trip, pricing, loyalty, discount, providersOn: on, providers: providers.length };
});

// ── اللغات — أخطر عدّادٍ في المشروع ───────────────────────────────────────
head("اللغات");
await section("locales", "اللغات", async () => {
  const enabled = await q("select code, published_count from public.enabled_locales()");
  const rows = await q(
    "select locale, status, count(*)::int n from public.translations group by 1,2 order by 1,2",
  );
  for (const l of enabled) say(`  ${l.code.padEnd(4)} معلَنة للزوّار  ·  منشور: ${l.published_count}`);
  for (const r of rows) say(`      ${r.locale}/${r.status}: ${r.n}`);
  const en = enabled.find((l) => l.code === "en");
  if (en && Number(en.published_count) > 0) {
    say(`  🔴 الإنجليزية مضاءةٌ للزوّار — و\`noindex\` وحده يحجبها عن جوجل`);
  }
  return { enabled, byStatus: rows };
});

// ── السيو — الحاجز الوحيد أمام الفهرسة ────────────────────────────────────
head("السيو");
await section("seo", "السيو", async () => {
  // `site_settings` جدولُ مفتاحٍ وقيمة، لا صفٌّ واحد بعمود jsonb — فيُقرأ بمفتاحه
  const row = (await q("select value from public.site_settings where key = 'seo' limit 1"))[0];
  const indexable = row?.value?.robots?.indexable;
  say(`  indexable = ${indexable}   ${indexable === false ? "⇒ noindex قائم، وخريطة الموقع فارغة بسببه" : "🔴 الموقع قابلٌ للفهرسة"}`);
  return { indexable };
});

// ── صفوف المالك الحيّة ────────────────────────────────────────────────────
head("بياناته الحيّة");
await section("data", "بياناته الحيّة", async () => {
  const counts = {};
  for (const t of ["subcontractors", "price_lists", "bookings", "quote_requests", "notifications", "loyalty_entries"]) {
    try {
      counts[t] = (await q(`select count(*)::int n from public.${t}`))[0].n;
    } catch {
      counts[t] = null;
    }
  }
  say(`  متعهدون ${counts.subcontractors} · قوائم أسعار ${counts.price_lists} · حجوزات ${counts.bookings} · طلبات عرض ${counts.quote_requests}`);
  say(`  إشعارات ${counts.notifications} · قيود ولاء ${counts.loyalty_entries}`);

  const subs = await q(
    "select company_name, status, telegram_chat_id from public.subcontractors order by company_name",
  );
  for (const s of subs)
    say(`    • ${s.company_name} — ${s.status}${s.telegram_chat_id ? ` · تليجرام ${maskPhone(s.telegram_chat_id)}` : ""}`);

  const st = await q("select status, count(*)::int n from public.bookings group by 1 order by 2 desc");
  say(`  الحجوزات بالحالة: ${st.map((r) => `${r.status} ${r.n}`).join(" · ") || "لا شيء"}`);
  return { counts, subs: subs.length, bookingsByStatus: st };
});

// ── ما لا يُلمس ───────────────────────────────────────────────────────────
head("لا يُلمس");
say("  RQ-ZF83NH و TR-S3GXYJ — صفّا اختبار المالك، يبقيان");
say("  حساباه في الولاء — تجاربه، لا تُصفَّر إلا بإذنه");
say("  صفوف الإشعارات — كنسُ الفيكسترة سكربتٌ يُشغّله هو");

if (JSON_MODE) {
  console.log(JSON.stringify(out, null, 2));
} else {
  console.log(lines.join("\n"));
  console.log("");
  console.log("── كل رقمٍ أعلاه قِيس لحظتَه. وما تغيّر بعد قراءتك يُعاد قياسه، لا يُفترض. ──");
}

await client.end();
