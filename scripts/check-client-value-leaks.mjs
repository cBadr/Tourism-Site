#!/usr/bin/env node
/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  حارسُ تسريب القيم من وحدات `"use client"` إلى الرسم الخادمي              ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 *   node scripts/check-client-value-leaks.mjs            # فحص المستودع
 *   node scripts/check-client-value-leaks.mjs --self-test # إثبات أنه يكشف فعلاً
 *   node scripts/check-client-value-leaks.mjs --json
 *
 * ── العيب الذي يحرسه، مقيساً مرّتين ────────────────────────────────────────
 *
 * قيمةٌ تُصدَّر من وحدة أولُ سطرٍ فيها `"use client"` **لا تعبر إلى الخادم**. ما
 * يستلمه المكوّن الخادمي **مرجعُ عميل** (client reference) لا القيمة:
 *
 *     typeof value                   → "function"
 *     Object.keys(value)             → []
 *     Object.getOwnPropertyNames(…)  → [… "$$typeof", "$$id", "$$async"]
 *     value.anyProp                  → undefined
 *
 * ووقع في هذا المستودع **مرّتين بوجهين مختلفين**:
 *
 * | الموضع | كيف ظهر |
 * |---|---|
 * | `CHANNEL_META` من `channels-form.tsx` ⇒ `portal/notifications/page.tsx` | **صاخب**: `TypeError: Cannot read properties of undefined (reading 'label')` ⇒ شاشةٌ بيضاء |
 * | `pointerGlowHostClass` من `pointer-glow.tsx` ⇒ `components/site/why-us.tsx` | 🔴 **صامت**: `clsx` يُسقط القيمة غير النصّية، فيسقط صنفٌ واحد ويموت الوهج بلا خطأ ولا سجلّ ولا اختبارٍ يسقط |
 *
 * والصامتُ هو سببُ وجود هذا الملف: الصاخب يجده أوّلُ من يفتح الصفحة، والصامت
 * لا يجده أحد.
 *
 * ── ما يكشفه هذا الحارس فعلاً — وما لا يكشفه. اقرأ هذا قبل أن تثق به ───────
 *
 * ✅ **يُحلّل بمحلّل TypeScript نفسه** (`ts.createSourceFile`) لا بتعبيرٍ نمطي، فلا
 *    يُخطئ في تعليقٍ يشبه استيراداً ولا في نصٍّ داخل قالب.
 * ✅ يتبع **سلاسل البراميل** كاملةً: `a → b → c`، و`export * from`، و
 *    `export { x } from`، وحلُّ المجلد إلى `index.ts(x)`.
 * ✅ يمسك **`export default`** من وحدة عميل (يُحكم على اسم المُستورِد المحلّي).
 * ✅ يمسك **`import * as ns`** من وحدةٍ تُفضي إلى وحدة عميل (تحذير، لأن كل قراءةِ
 *    خاصيةٍ منه تصير مرجعَ عميل، ولا يُعرف من النصّ أيَّ خاصيةٍ ستُقرأ).
 * ✅ يتجاهل `import type` و`export type` والأعضاء المؤشَّرة `type` — فالأنواع
 *    تُمحى وقت البناء ولا تعبر حدوداً.
 *
 * ⚠ **وحدُّه الحقيقي، بصراحة (القاعدة الذهبية ١٩: كاشفٌ يقرأ النصَّ يكذب في
 *    الاتجاهين):** لا سبيل نصّياً للتمييز بين «مكوّنٍ يُصيَّر» و«قيمةٍ تُقرأ»، وكلاهما
 *    في JS دالّة. فالحكم **باصطلاح التسمية**:
 *      • `PascalCase` ⇒ مكوّن ⇒ **مسموح** (وهذا هو الاستيراد الشرعي الغالب).
 *      • `useXxx` ⇒ خُطّاف ⇒ يُبلَّغ **تحذيراً** (خُطّافٌ في وحدةٍ خادمية لا يعمل أصلاً).
 *      • ما عداهما (‏`camelCase`, `SCREAMING_SNAKE`) ⇒ **خطأ**.
 *    فمكوّنٌ سُمّي `camelCase` = إنذارٌ كاذب، وقيمةٌ سُمّيت `PascalCase` = تسريبٌ
 *    **يمرّ من الحارس**. وهذا الحدُّ لا يُغلق بلا محلّل أنواعٍ كامل.
 *
 * ⚠ **وحدٌّ ثانٍ:** «ملفٌّ بلا `"use client"`» ≠ «ملفٌّ خادمي». الوحدة المحيّدة
 *    التي لا يقرؤها إلا العميل تُحسب هنا خادميةً احتمالاً. وهذا **تشدّدٌ مقصود**:
 *    الوحدة المحيّدة قد يستوردها الخادم غداً، والعيب يصير صامتاً حينها.
 *
 * ⚠ **وثالث:** لا يرى `import()` الديناميكي ولا `require` ولا استيراداً يُبنى اسمه
 *    وقت التشغيل.
 *
 * ولهذا فيه `--self-test`: يبني في مجلدٍ مؤقّت ستَّ حالاتٍ معروفة الجواب سلفاً
 * (منها سلسلةُ براميل، و`export default`، و`import * as`) ويتحقّق أنه أصابها
 * جميعاً. **كاشفٌ لا يُختبر كشفُه لا يُعتمد عليه.**
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCAN_DIRS = ["app", "components", "lib", "i18n", "hooks"];
const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "supabase", "public", "docs", "handover"]);
const EXTS = [".ts", ".tsx", ".mts", ".js", ".jsx"];

/* ------------------------------------------------------------------ */
/* ١) جمع الملفّات                                                     */
/* ------------------------------------------------------------------ */

function walk(dir, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.name.startsWith(".") && e.name !== ".") continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      walk(full, out);
    } else if (EXTS.includes(path.extname(e.name))) {
      out.push(full);
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* ٢) تحليل ملفٍّ واحد بمحلّل TypeScript                                */
/* ------------------------------------------------------------------ */

/**
 * @returns {{
 *   useClient: boolean,
 *   imports: Array<{spec: string, kind: "named"|"default"|"namespace", imported: string, local: string, line: number}>,
 *   reexports: Array<{spec: string, imported: string, exported: string, star: boolean}>,
 *   localExports: Set<string>,
 * }}
 */
function analyze(file, text) {
  const sf = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ false,
    file.endsWith(".tsx") || file.endsWith(".jsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );

  // التوجيه يجب أن يكون **أول جملة** — وهذا هو ما يقرؤه Next نفسه، لا مجرّد
  // وجود النصّ في الملف.
  let useClient = false;
  for (const st of sf.statements) {
    if (
      ts.isExpressionStatement(st) &&
      ts.isStringLiteral(st.expression) &&
      !st.expression.getText
    ) {
      // لا يحدث بلا parentNodes؛ نستخدم `.text` أدناه
    }
    if (ts.isExpressionStatement(st) && ts.isStringLiteral(st.expression)) {
      if (st.expression.text === "use client") useClient = true;
      continue; // توجيهاتٌ متتالية مسموحة
    }
    break;
  }

  const imports = [];
  const reexports = [];
  const localExports = new Set();
  const lineOf = (node) => sf.getLineAndCharacterOfPosition(node.pos).line + 1;

  for (const st of sf.statements) {
    /* --- import ... from "x" --- */
    if (ts.isImportDeclaration(st) && ts.isStringLiteral(st.moduleSpecifier)) {
      const spec = st.moduleSpecifier.text;
      const clause = st.importClause;
      if (!clause) continue; // import "./x.css" — أثرٌ جانبي لا قيمة
      if (clause.isTypeOnly) continue; // import type { … }
      if (clause.name) {
        imports.push({ spec, kind: "default", imported: "default", local: clause.name.text, line: lineOf(st) });
      }
      const b = clause.namedBindings;
      if (b && ts.isNamespaceImport(b)) {
        imports.push({ spec, kind: "namespace", imported: "*", local: b.name.text, line: lineOf(st) });
      } else if (b && ts.isNamedImports(b)) {
        for (const el of b.elements) {
          if (el.isTypeOnly) continue; // import { type X }
          imports.push({
            spec,
            kind: "named",
            imported: (el.propertyName ?? el.name).text,
            local: el.name.text,
            line: lineOf(st),
          });
        }
      }
      continue;
    }

    /* --- export { … } from "x"  /  export * from "x" --- */
    if (ts.isExportDeclaration(st)) {
      if (st.isTypeOnly) continue;
      const spec =
        st.moduleSpecifier && ts.isStringLiteral(st.moduleSpecifier) ? st.moduleSpecifier.text : null;
      if (!st.exportClause && spec) {
        reexports.push({ spec, imported: "*", exported: "*", star: true });
        continue;
      }
      if (st.exportClause && ts.isNamedExports(st.exportClause)) {
        for (const el of st.exportClause.elements) {
          if (el.isTypeOnly) continue;
          const imported = (el.propertyName ?? el.name).text;
          if (spec) reexports.push({ spec, imported, exported: el.name.text, star: false });
          else localExports.add(el.name.text);
        }
      }
      if (st.exportClause && ts.isNamespaceExport(st.exportClause) && spec) {
        // export * as ns from "x" — الاسم كله كائنُ نطاق
        reexports.push({ spec, imported: "*", exported: st.exportClause.name.text, star: false });
      }
      continue;
    }

    /* --- export default … --- */
    if (ts.isExportAssignment(st)) {
      localExports.add("default");
      continue;
    }

    /* --- export const/function/class/… --- */
    const mods = ts.canHaveModifiers(st) ? ts.getModifiers(st) ?? [] : [];
    const isExported = mods.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    if (!isExported) continue;
    const isDefault = mods.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword);
    // الأنواع تُمحى — لا تعبر حدوداً ولا تسرّب شيئاً
    if (ts.isTypeAliasDeclaration(st) || ts.isInterfaceDeclaration(st)) continue;
    if (isDefault) {
      localExports.add("default");
      continue;
    }
    if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) {
        if (ts.isIdentifier(d.name)) localExports.add(d.name.text);
        else {
          // تفكيكٌ في التصدير — نادر؛ نُسجّله كي لا نصمت عنه
          for (const el of ts.isObjectBindingPattern(d.name) || ts.isArrayBindingPattern(d.name) ? d.name.elements : []) {
            if (el.name && ts.isIdentifier(el.name)) localExports.add(el.name.text);
          }
        }
      }
      continue;
    }
    if ((ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st) || ts.isEnumDeclaration(st)) && st.name) {
      localExports.add(st.name.text);
    }
  }

  return { useClient, imports, reexports, localExports };
}

/* ------------------------------------------------------------------ */
/* ٣) حلُّ المسارات                                                    */
/* ------------------------------------------------------------------ */

function resolveSpec(spec, fromFile, root) {
  let base;
  if (spec.startsWith("@/")) base = path.join(root, spec.slice(2));
  else if (spec.startsWith("./") || spec.startsWith("../")) base = path.resolve(path.dirname(fromFile), spec);
  else return null; // حزمةٌ من node_modules — خارج نطاقنا
  const candidates = [];
  const ext = path.extname(base);
  if (ext && EXTS.includes(ext)) candidates.push(base);
  if (ext === ".js") for (const e of [".ts", ".tsx"]) candidates.push(base.slice(0, -3) + e);
  if (!ext) {
    for (const e of EXTS) candidates.push(base + e);
    for (const e of EXTS) candidates.push(path.join(base, "index" + e));
  }
  for (const c of candidates) {
    try {
      if (fs.statSync(c).isFile()) return path.normalize(c);
    } catch {
      /* التالي */
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* ٤) تتبّع الاسم عبر سلاسل البراميل حتى وحدته المُعرِّفة                 */
/* ------------------------------------------------------------------ */

/**
 * يُرجع { file, name, chain } للوحدة التي **تُعرِّف** الاسم فعلاً، بعد اجتياز
 * كل إعادات التصدير. `null` إن خرج المسار من المستودع.
 */
function traceOrigin(file, name, mods, root, seen = new Set()) {
  const key = `${file}::${name}`;
  if (seen.has(key)) return null;
  seen.add(key);
  const mod = mods.get(file);
  if (!mod) return null;
  if (mod.localExports.has(name)) return { file, name, chain: [file] };

  // إعادةُ تصديرٍ صريحة بالاسم
  for (const re of mod.reexports) {
    if (re.star) continue;
    if (re.exported !== name) continue;
    const target = resolveSpec(re.spec, file, root);
    if (!target) return null;
    if (re.imported === "*") return { file: target, name: "*", chain: [file, target] };
    const deeper = traceOrigin(target, re.imported, mods, root, seen);
    if (deeper) return { ...deeper, chain: [file, ...deeper.chain] };
    // الهدف موجود لكن الاسم لم يُعرَّف فيه صراحةً (مثلاً يعيد تصديره بنجمة)
    return { file: target, name: re.imported, chain: [file, target] };
  }

  // `export * from` — نبحث في كل النجوم
  for (const re of mod.reexports) {
    if (!re.star) continue;
    const target = resolveSpec(re.spec, file, root);
    if (!target) continue;
    const deeper = traceOrigin(target, name, mods, root, seen);
    if (deeper) return { ...deeper, chain: [file, ...deeper.chain] };
  }
  return null;
}

/** هل يُفضي هذا الملف (بنفسه أو عبر براميله) إلى وحدة عميل؟ */
function reachesClientModule(file, mods, root, seen = new Set()) {
  if (seen.has(file)) return null;
  seen.add(file);
  const mod = mods.get(file);
  if (!mod) return null;
  if (mod.useClient) return file;
  for (const re of mod.reexports) {
    const target = resolveSpec(re.spec, file, root);
    if (!target) continue;
    const hit = reachesClientModule(target, mods, root, seen);
    if (hit) return hit;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* ٥) الحكم على اسمٍ واحد                                              */
/* ------------------------------------------------------------------ */

/**
 * مكوّنٌ = `PascalCase` حقيقيّ: يبدأ بحرفٍ كبير **وفيه حرفٌ صغير** وبلا `_`.
 *
 * 🔴 ولماذا هذا القيد بالذات؟ أوّلُ صياغةٍ كانت `/^[A-Z]/` وحدها، **وأسقط
 * اختبارُها الذاتي حالة `TOKENS`** — أي أنها كانت تُصنّف `SCREAMING_SNAKE_CASE`
 * مكوّناً فتصمت عنه. ولو شُحنت هكذا لفوّتت **العيبَ الحقيقيَّ الأول**:
 * `CHANNEL_META` من `channels-form.tsx` الذي أسقط `/portal/notifications`.
 * فالحارس كان سيقول «نظيف» عن نفس العيب الذي كُتب من أجله.
 */
const isComponentName = (n) => /^[A-Z]/.test(n) && /[a-z]/.test(n) && !n.includes("_");
const isHookName = (n) => /^use[A-Z]/.test(n);

/* ------------------------------------------------------------------ */
/* ٦) الفحص                                                           */
/* ------------------------------------------------------------------ */

function run(root, dirs) {
  const files = dirs.flatMap((d) => walk(path.join(root, d)));
  const mods = new Map();
  for (const f of files) {
    try {
      mods.set(path.normalize(f), analyze(f, fs.readFileSync(f, "utf8")));
    } catch (err) {
      mods.set(path.normalize(f), { useClient: false, imports: [], reexports: [], localExports: new Set(), error: String(err) });
    }
  }

  const errors = [];
  const warnings = [];
  let clientModules = 0;
  let edgesChecked = 0;

  for (const mod of mods.values()) {
    if (mod.useClient) clientModules++;
  }

  for (const [file, mod] of mods) {
    if (mod.useClient) continue; // مستوردٌ عميل ⇒ الحدود لا تُعبر
    for (const imp of mod.imports) {
      const target = resolveSpec(imp.spec, file, root);
      if (!target) continue;
      edgesChecked++;
      const rel = (p) => path.relative(root, p).split(path.sep).join("/");

      if (imp.kind === "namespace") {
        const hit = reachesClientModule(target, mods, root);
        if (hit) {
          warnings.push({
            kind: "namespace-import",
            file: rel(file),
            line: imp.line,
            detail: `import * as ${imp.local} from "${imp.spec}" — يُفضي إلى وحدة عميل (${rel(hit)}). كل خاصيةٍ تُقرأ منه في وحدةٍ خادمية تصير مرجعَ عميل، ولا يُعرف من النصّ أيّها يُقرأ.`,
          });
        }
        continue;
      }

      const origin = traceOrigin(target, imp.imported, mods, root);
      if (!origin) continue;
      const originMod = mods.get(origin.file);
      if (!originMod || !originMod.useClient) continue;

      const judgedName = imp.kind === "default" ? imp.local : imp.imported;
      const chain = origin.chain.map(rel).join(" → ");
      if (isComponentName(judgedName)) continue; // مكوّنٌ يُصيَّر — الحالة الشرعية
      if (isHookName(judgedName)) {
        warnings.push({
          kind: "hook-in-server-module",
          file: rel(file),
          line: imp.line,
          detail: `${judgedName} خُطّافٌ من وحدة عميل (${chain}) — لا يعمل في وحدةٍ خادمية أصلاً.`,
        });
        continue;
      }
      errors.push({
        kind: imp.kind === "default" ? "default-value-leak" : "value-leak",
        file: rel(file),
        line: imp.line,
        detail: `\`${imp.imported === "default" ? `default as ${imp.local}` : imp.imported}\` قيمةٌ من وحدة \`"use client"\`: ${chain}. تصل الخادمَ مرجعَ عميل (\`typeof\`==="function"، وكل خاصيةٍ \`undefined\`). انقلها إلى وحدةٍ محيّدة يقرؤها الطرفان.`,
      });
    }
  }

  return { stats: { files: files.length, clientModules, edgesChecked }, errors, warnings };
}

/* ------------------------------------------------------------------ */
/* ٧) اختبارٌ ذاتيّ — كاشفٌ لا يُختبر كشفُه لا يُعتمد عليه               */
/* ------------------------------------------------------------------ */

const FIXTURES = {
  // (١) الحالة الشرعية: مكوّنٌ من وحدة عميل يستورده الخادم
  "components/ok-component/client.tsx": `"use client";\nexport function Widget() { return null; }\n`,
  "components/ok-component/server.tsx": `import { Widget } from "./client";\nexport const P = () => Widget;\n`,

  // (٢) التسريب المباشر — قيمةٌ camelCase من وحدة عميل
  "components/direct/client.tsx": `"use client";\nexport const hostClass = "x";\nexport function C() { return null; }\n`,
  "components/direct/server.tsx": `import { hostClass } from "./client";\nexport const v = hostClass;\n`,

  // (٣) 🔴 سلسلةُ براميل: خادم → برميل → برميل → وحدة عميل
  "components/chain/deep.tsx": `"use client";\nexport const TOKENS = { a: 1 };\n`,
  "components/chain/inner/index.ts": `export { TOKENS } from "../deep";\n`,
  "components/chain/index.ts": `export * from "./inner";\n`,
  "components/chain/server.tsx": `import { TOKENS } from "./index";\nexport const v = TOKENS;\n`,

  // (٤) 🔴 export default قيمةً
  "components/def/client.tsx": `"use client";\nconst table = { a: 1 };\nexport default table;\n`,
  "components/def/server.tsx": `import table from "./client";\nexport const v = table;\n`,

  // (٥) 🔴 import * as من برميلٍ يُفضي إلى عميل
  "components/ns/server.tsx": `import * as all from "../chain/index";\nexport const v = all;\n`,

  // (٦) الأنواع لا تسرّب شيئاً
  "components/types/client.tsx": `"use client";\nexport type Shape = { a: number };\nexport const val = 1;\n`,
  "components/types/server.tsx": `import type { Shape } from "./client";\nimport { type Shape as S2 } from "./client";\nexport const v: Shape | S2 | null = null;\n`,

  // (٧) ⚠ العمى المُعلَن: قيمةٌ سُمّيت PascalCase — تسريبٌ حقيقيٌّ **يمرّ**
  "components/blindspot/client.tsx": `"use client";\nexport const LookupTable = { a: 1 };\n`,
  "components/blindspot/server.tsx": `import { LookupTable } from "./client";\nexport const v = LookupTable.a;\n`,
};

const EXPECTED = [
  { file: "components/direct/server.tsx", kind: "value-leak" },
  { file: "components/chain/server.tsx", kind: "value-leak" },
  { file: "components/def/server.tsx", kind: "default-value-leak" },
];
const EXPECTED_WARN = [{ file: "components/ns/server.tsx", kind: "namespace-import" }];
const MUST_BE_CLEAN = ["components/ok-component/server.tsx", "components/types/server.tsx"];
/** حالةٌ **يجب أن تفوته** — ونُثبّتها كي يبقى الحدُّ معلوماً لا مفاجأة. */
const KNOWN_MISS = ["components/blindspot/server.tsx"];

function selfTest() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "leakguard-"));
  for (const [rel, body] of Object.entries(FIXTURES)) {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, body, "utf8");
  }
  const res = run(dir, ["components"]);
  const fails = [];
  for (const e of EXPECTED) {
    if (!res.errors.some((f) => f.file === e.file && f.kind === e.kind))
      fails.push(`لم يُمسك: ${e.file} (${e.kind})`);
  }
  for (const w of EXPECTED_WARN) {
    if (!res.warnings.some((f) => f.file === w.file && f.kind === w.kind))
      fails.push(`لم يُحذّر: ${w.file} (${w.kind})`);
  }
  for (const c of MUST_BE_CLEAN) {
    if (res.errors.some((f) => f.file === c)) fails.push(`إنذارٌ كاذب على: ${c}`);
  }
  for (const c of KNOWN_MISS) {
    if (res.errors.some((f) => f.file === c))
      fails.push(`صار يمسك ${c} — الحدُّ المُعلن تغيّر، فصحّح رأس الملف والتقرير`);
  }
  if (res.errors.length !== EXPECTED.length)
    fails.push(`عدد الأخطاء ${res.errors.length} ≠ المتوقّع ${EXPECTED.length}`);
  fs.rmSync(dir, { recursive: true, force: true });

  if (fails.length) {
    console.error("SELF-TEST FAILED");
    for (const f of fails) console.error("  ✗ " + f);
    console.error(JSON.stringify(res, null, 2));
    return 1;
  }
  console.log(
    `SELF-TEST PASSED — أمسك ${EXPECTED.length} حالات (مباشرة · سلسلةُ براميل · export default)، ` +
      `وحذّر من ${EXPECTED_WARN.length} (import * as)، وبلا إنذارٍ كاذبٍ على ${MUST_BE_CLEAN.length}.\n` +
      `⚠ وفاته ${KNOWN_MISS.length} **بقصدٍ معلوم**: قيمةٌ سُمّيت PascalCase ` +
      `(components/blindspot/server.tsx) — تسريبٌ حقيقيٌّ لا يميّزه اصطلاحُ التسمية عن مكوّن.`
  );
  return 0;
}

/* ------------------------------------------------------------------ */
/* ٨) نقطة الدخول                                                      */
/* ------------------------------------------------------------------ */

const argv = process.argv.slice(2);
if (argv.includes("--self-test")) {
  process.exit(selfTest());
}

const res = run(ROOT, SCAN_DIRS);
if (argv.includes("--json")) {
  console.log(JSON.stringify(res, null, 2));
} else {
  console.log(
    `فُحص ${res.stats.files} ملفاً · ${res.stats.clientModules} وحدةَ "use client" · ` +
      `${res.stats.edgesChecked} استيراداً داخل المستودع`
  );
  for (const e of res.errors) {
    console.log(`\n🔴 ${e.file}:${e.line}  [${e.kind}]\n   ${e.detail}`);
  }
  for (const w of res.warnings) {
    console.log(`\n⚠ ${w.file}:${w.line}  [${w.kind}]\n   ${w.detail}`);
  }
  if (!res.errors.length && !res.warnings.length) console.log("\nNO LEAKS FOUND");
  else if (!res.errors.length) console.log("\nNO LEAKS FOUND (تحذيراتٌ فقط أعلاه)");
  console.log(
    "\nحدُّه المعلن: التمييز بين مكوّنٍ وقيمةٍ باصطلاح التسمية وحده " +
      "(PascalCase ⇒ مكوّن)، ولا يرى `import()` الديناميكي. التفصيل في رأس الملف."
  );
}
process.exit(res.errors.length ? 1 : 0);
