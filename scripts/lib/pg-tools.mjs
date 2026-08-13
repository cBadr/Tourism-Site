/**
 * أدوات مشتركة بين سكربتَي النسخ الاحتياطي والاستعادة.
 *
 * سبب وجود هذا الملف: العثور على `pg_dump`/`pg_restore` وفحص إصدارهما وتحويل
 * `DATABASE_URL` إلى متغيرات بيئة منطقٌ حسّاس يجب أن يكون **نسخة واحدة**؛
 * لو تكرّر في الملفين لأُصلح عيبٌ في أحدهما وبقي في الآخر — وأداة الطوارئ
 * لا تحتمل ذلك.
 */
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

/* ------------------------------------------------------------------ *
 * (١) إيجاد أدوات PostgreSQL على الجهاز
 * ------------------------------------------------------------------ */

const IS_WIN = process.platform === "win32";
const exe = (name) => (IS_WIN ? `${name}.exe` : name);

/** مجلدات التثبيت الشائعة على ويندوز، مرتّبة تنازلياً بالإصدار. */
function windowsCandidateDirs() {
  const roots = [
    process.env.ProgramFiles && join(process.env.ProgramFiles, "PostgreSQL"),
    process.env["ProgramFiles(x86)"] && join(process.env["ProgramFiles(x86)"], "PostgreSQL"),
    "C:\\Program Files\\PostgreSQL",
  ].filter(Boolean);

  const dirs = [];
  for (const root of roots) {
    if (!existsSync(root)) continue;
    let entries = [];
    try {
      entries = readdirSync(root);
    } catch {
      continue;
    }
    for (const entry of entries) {
      const bin = join(root, entry, "bin");
      if (existsSync(bin)) dirs.push({ bin, major: Number.parseInt(entry, 10) || 0 });
    }
  }
  return dirs.sort((a, b) => b.major - a.major).map((d) => d.bin);
}

/** يستخرج الإصدار الرئيسي من مخرجات `--version`، أو `null` لو تعذّر التشغيل. */
function probeVersion(binPath) {
  const res = spawnSync(binPath, ["--version"], { encoding: "utf8" });
  if (res.error || res.status !== 0) return null;
  const m = /(\d+)(?:\.(\d+))?/.exec(res.stdout ?? "");
  return m ? { major: Number(m[1]), text: (res.stdout ?? "").trim() } : null;
}

/**
 * يبحث عن أداة (`pg_dump` أو `pg_restore`) بالترتيب:
 * متغيّر `PG_DUMP_PATH` (مجلد أو مسار ملف) ← ثم PATH ← ثم مجلدات ويندوز الشائعة.
 * يُرجع `{ path, major, text }` أو `null`.
 */
export function findPgTool(tool) {
  const override = process.env.PG_DUMP_PATH?.trim();
  const candidates = [];

  if (override) {
    // القيمة قد تكون مجلد bin أو مسار الأداة نفسها
    const asDir = join(override, exe(tool));
    if (existsSync(asDir)) candidates.push(asDir);
    else if (existsSync(override)) {
      // مسار ملف: استعمل مجلده لاشتقاق الأداة الأخرى
      const dir = override.replace(/[\\/][^\\/]+$/, "");
      const sibling = join(dir, exe(tool));
      if (existsSync(sibling)) candidates.push(sibling);
    }
  }

  candidates.push(tool); // من PATH
  if (IS_WIN) for (const bin of windowsCandidateDirs()) candidates.push(join(bin, exe(tool)));

  for (const candidate of candidates) {
    const version = probeVersion(candidate);
    if (version) return { path: candidate, ...version };
  }
  return null;
}

/** رسالة عربية كاملة تُطبع حين تغيب الأداة — لا خطأ غامض. */
export function printMissingToolHelp(tool) {
  console.error(
    `❌ لم أجد الأداة «${tool}» على هذا الجهاز.\n` +
      `\n` +
      `   ${tool} أداة رسمية تأتي ضمن حزمة عميل PostgreSQL. **لا تحتاج تشغيل خادم\n` +
      `   Postgres محلياً** — أدوات سطر الأوامر وحدها تكفي (بضع عشرات الميغابايت).\n` +
      `\n` +
      `   ويندوز — الأسرع (PowerShell):\n` +
      `      winget install -e --id PostgreSQL.PostgreSQL.18\n` +
      `   أو المثبّت الرسمي: https://www.postgresql.org/download/windows/\n` +
      `      وفي شاشة اختيار المكوّنات يكفي تعليم «Command Line Tools»\n` +
      `      (أزل علامة Server وStack Builder لو أردت التثبيت الأخف).\n` +
      `\n` +
      `   ماك:            brew install libpq && brew link --force libpq\n` +
      `   لينكس (دبيان):  sudo apt install postgresql-client-18\n` +
      `\n` +
      `   ⚠ بعد التثبيت **أغلق الطرفية وافتحها من جديد** كي يُحدَّث PATH.\n` +
      `\n` +
      `   وإن كانت مثبّتة في مكان غير معتاد، مرّر مجلدها في .env.local:\n` +
      `      PG_DUMP_PATH=C:\\Program Files\\PostgreSQL\\18\\bin\n` +
      `\n` +
      `   التفاصيل كاملة: docs/BACKUP.md`
  );
}

/**
 * يمنع الفخّ الصامت: `pg_dump` أقدم من الخادم يرفض العمل (وبعض الإصدارات
 * تنتج ملفاً ناقصاً). الخادم اليوم Postgres 17 على Supabase.
 */
export function assertToolNotOlderThanServer(tool, toolMajor, serverMajor) {
  if (toolMajor >= serverMajor) return true;
  console.error(
    `❌ إصدار ${tool} (${toolMajor}) أقدم من إصدار الخادم (${serverMajor}).\n` +
      `   الأداة الأقدم لا تستطيع قراءة مخطط خادم أحدث، وقد تنتج ملفاً ناقصاً بلا خطأ واضح.\n` +
      `   ثبّت حزمة عميل PostgreSQL ${serverMajor} أو أحدث، أو وجّه السكربت إلى نسخة أحدث:\n` +
      `      PG_DUMP_PATH=C:\\Program Files\\PostgreSQL\\${serverMajor}\\bin`
  );
  return false;
}

/* ------------------------------------------------------------------ *
 * (٢) تحويل DATABASE_URL إلى متغيرات بيئة
 * ------------------------------------------------------------------ */

/**
 * لا نمرّر رابط الاتصال في سطر الأوامر: كلمة مرور القاعدة تظهر عندها في قائمة
 * العمليات لأي مستخدم على الجهاز. نمرّرها في البيئة (وهي الطريقة الرسمية).
 */
export function connEnvFromUrl(rawUrl) {
  const u = new URL(rawUrl);
  const env = {
    ...process.env,
    PGHOST: u.hostname,
    PGPORT: u.port || "5432",
    PGUSER: decodeURIComponent(u.username),
    PGDATABASE: decodeURIComponent(u.pathname.replace(/^\//, "")) || "postgres",
    // نفس سياسة سكربتات المشروع: تشفير النقل بلا التحقق من سلسلة الشهادات
    // (يقابل ssl:{rejectUnauthorized:false} في db-migrate.mjs).
    PGSSLMODE: process.env.PGSSLMODE || "require",
  };
  if (u.password) env.PGPASSWORD = decodeURIComponent(u.password);
  return env;
}

/** وصف الوجهة للطباعة — بلا كلمة المرور أبداً. */
export function describeTarget(rawUrl) {
  const u = new URL(rawUrl);
  return `${decodeURIComponent(u.username)}@${u.hostname}:${u.port || "5432"}/${
    u.pathname.replace(/^\//, "") || "postgres"
  }`;
}

/* ------------------------------------------------------------------ *
 * (٣) مساعدات صغيرة
 * ------------------------------------------------------------------ */

export function humanSize(bytes) {
  if (bytes < 1024) return `${bytes} بايت`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} كيلوبايت`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} ميغابايت`;
}

export function humanDuration(ms) {
  const s = ms / 1000;
  return s < 60 ? `${s.toFixed(1)} ثانية` : `${Math.floor(s / 60)} دقيقة و${(s % 60).toFixed(0)} ثانية`;
}

/** طابع زمني محلي صالح لاسم ملف: 2026-08-13_15-30-45 */
export function fileStamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` +
    `_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`
  );
}

/**
 * يقرأ فهرس أرشيف بصيغة custom عبر `pg_restore --list`.
 * يُرجع `{ ok, entries, tablesWithData, schemas, stderr }`.
 * فشل القراءة هنا يعني ملفاً تالفاً — وهو أهم فحص في الأداتين معاً.
 */
export function readArchiveIndex(pgRestorePath, file) {
  const res = spawnSync(pgRestorePath, ["--list", file], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (res.error || res.status !== 0) {
    return { ok: false, entries: 0, tablesWithData: 0, schemas: [], stderr: res.stderr || String(res.error) };
  }
  const lines = (res.stdout ?? "").split(/\r?\n/).filter((l) => l && !l.startsWith(";"));
  const schemas = new Set();
  let tablesWithData = 0;
  for (const line of lines) {
    // الصيغة: <id>; <oid> <oid> TABLE DATA <schema> <name> <owner>
    const m = /;\s+\d+\s+\d+\s+([A-Z][A-Z ]*[A-Z])\s+(\S+)\s/.exec(line);
    if (!m) continue;
    if (m[2] !== "-") schemas.add(m[2]); // مدخلات SCHEMA نفسها تكتب «-» مكان المخطط
    if (m[1] === "TABLE DATA") tablesWithData++;
  }
  return { ok: true, entries: lines.length, tablesWithData, schemas: [...schemas].sort(), stderr: "" };
}

/** أكبر جداول `public` بعدد صفوفها الفعلي — يُستعمل قبل الاستعادة وبعدها. */
export async function topTableCounts(client, limit = 6) {
  const { rows } = await client.query(
    `select c.relname
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
      order by pg_total_relation_size(c.oid) desc
      limit $1`,
    [limit]
  );
  const out = [];
  for (const r of rows) {
    const quoted = `"${r.relname.replace(/"/g, '""')}"`; // اسم قادم من الكتالوج، ويُقتبس رغم ذلك
    const { rows: cnt } = await client.query(`select count(*)::bigint as n from public.${quoted}`);
    out.push({ table: r.relname, rows: Number(cnt[0].n) });
  }
  return out;
}
