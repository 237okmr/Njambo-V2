#!/usr/bin/env node
/**
 * Contrôle « aucun délai codé en dur » (règle permanente, voir docs/REGLES_PERMANENTES.md).
 *
 * Usage :
 *   node scripts/check-delays.mjs            rapport (code de sortie 0)
 *   node scripts/check-delays.mjs --strict   échoue (code 1) s'il reste des délais en dur
 *
 * Exceptions : le solo, les animations purement visuelles (studio social) et les lignes marquées
 *   // delay-ok: raison
 * (marqueur sur la même ligne ou sur la ligne juste au-dessus ; la raison écrite est obligatoire).
 */
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const ROOT = process.cwd();
const STRICT = process.argv.includes('--strict');

const SCAN_TARGETS = ['src', 'server', 'server.ts', 'public/sw.js'];
const EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs']);
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git']);

// Liste blanche : solo, studio social (rendu graphique), registre lui-même.
const ALLOWLIST = [
  'src/hooks/useSoloGameEngine.ts',
  'src/utils/ai.ts',
  'src/utils/aiMonteCarlo.ts',
  'server/engine/engineParams.ts',
  'src/katika/visual/',
  'src/katika/utils/socialVisualCanvasRenderer.ts',
  'src/katika/components/social/',
  'src/katika/mobile/KatikaMobileSocialStudioModal.tsx',
  'src/katika/components/modals/KatikaSocialStudioModal.tsx',
  'src/katika/data/',
  'src/katika/types/socialVisuals.ts',
];

const MIN_MS = 300; // en dessous : anti-rebond ou cadence technique admise

function isAllowlisted(rel) {
  return ALLOWLIST.some((a) => (a.endsWith('/') ? rel.startsWith(a) : rel === a));
}
function isTestFile(rel) {
  return /\.test\.(ts|tsx|js|mjs|cjs)$/.test(rel);
}

function collectFiles(target, out) {
  const abs = path.join(ROOT, target);
  if (!fs.existsSync(abs)) return;
  const stat = fs.statSync(abs);
  if (stat.isFile()) {
    if (EXTENSIONS.has(path.extname(abs))) out.push(abs);
    return;
  }
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    collectFiles(path.join(target, entry.name), out);
  }
}

/** Évalue une expression numérique faite uniquement de littéraux (ex. 60 * 1000). Sinon null. */
function evalConst(node) {
  if (ts.isNumericLiteral(node)) return Number(node.text.replace(/_/g, ''));
  if (ts.isParenthesizedExpression(node)) return evalConst(node.expression);
  if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.MinusToken) {
    const v = evalConst(node.operand);
    return v === null ? null : -v;
  }
  if (ts.isBinaryExpression(node)) {
    const l = evalConst(node.left);
    const r = evalConst(node.right);
    if (l === null || r === null) return null;
    switch (node.operatorToken.kind) {
      case ts.SyntaxKind.AsteriskToken: return l * r;
      case ts.SyntaxKind.PlusToken: return l + r;
      case ts.SyntaxKind.MinusToken: return l - r;
      case ts.SyntaxKind.SlashToken: return l / r;
      default: return null;
    }
  }
  return null;
}

function isNowExpr(node) {
  const t = node.getText();
  return /^(Date\.now\(\)|now|serverNow)$/.test(t);
}
function containsNow(node) {
  return /\b(Date\.now\(\)|now|serverNow)\b/.test(node.getText());
}

const COMPARE_OPS = new Set([
  ts.SyntaxKind.LessThanToken,
  ts.SyntaxKind.LessThanEqualsToken,
  ts.SyntaxKind.GreaterThanToken,
  ts.SyntaxKind.GreaterThanEqualsToken,
]);

/** Seuil selon le suffixe du nom (unités : ms, secondes, minutes). */
function thresholdForName(name) {
  if (/(Ms|MS|_MS|Millis|Delay|Duration)$/.test(name)) return MIN_MS;
  if (/(Seconds|Secs|Sec|Ttl|TTL|Timeout)$/.test(name)) return 5;
  if (/(Minutes|Mins)$/.test(name)) return 1;
  return null;
}

function analyze(file) {
  const rel = path.relative(ROOT, file).split(path.sep).join('/');
  const text = fs.readFileSync(file, 'utf8');
  const kind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : file.endsWith('.ts') ? ts.ScriptKind.TS : ts.ScriptKind.JS;
  const sf = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true, kind);
  const lines = text.split('\n');
  const found = [];
  const badMarkers = [];

  const lineOf = (node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line; // 0-based

  const markerFor = (line) => {
    const re = /delay-ok(:\s*(\S.*))?/;
    for (const idx of [line, line - 1]) {
      if (idx < 0) continue;
      const m = re.exec(lines[idx] || '');
      if (m) return { present: true, reason: (m[2] || '').trim(), line: idx };
    }
    return { present: false };
  };

  const report = (node, label, value) => {
    const line = lineOf(node);
    const marker = markerFor(line);
    if (marker.present) {
      if (!marker.reason) badMarkers.push({ rel, line: marker.line + 1 });
      return;
    }
    found.push({ rel, line: line + 1, label, value, code: (lines[line] || '').trim().slice(0, 110) });
  };

  const visit = (node) => {
    // 1) setTimeout / setInterval avec délai littéral
    if (ts.isCallExpression(node)) {
      const callee = node.expression.getText();
      if (/^(window\.|globalThis\.)?(setTimeout|setInterval)$/.test(callee) && node.arguments.length >= 2) {
        const v = evalConst(node.arguments[1]);
        if (v !== null && v >= MIN_MS) report(node, callee, `${v} ms`);
      }
    }
    // 2) Date.now() ± littéral, et comparaisons d'ancienneté (now - x < littéral)
    if (ts.isBinaryExpression(node)) {
      const op = node.operatorToken.kind;
      if (op === ts.SyntaxKind.PlusToken || op === ts.SyntaxKind.MinusToken) {
        const l = evalConst(node.left);
        const r = evalConst(node.right);
        if ((isNowExpr(node.left) && r !== null && r >= MIN_MS) || (isNowExpr(node.right) && l !== null && l >= MIN_MS)) {
          report(node, 'Date.now() ± délai', `${r ?? l} ms`);
        }
      } else if (COMPARE_OPS.has(op)) {
        const l = evalConst(node.left);
        const r = evalConst(node.right);
        if (r !== null && r >= MIN_MS && containsNow(node.left)) report(node, 'seuil de durée', `${r} ms`);
        else if (l !== null && l >= MIN_MS && containsNow(node.right)) report(node, 'seuil de durée', `${l} ms`);
      }
    }
    // 3) noms de constantes / propriétés de durée affectés d'un littéral
    let name = null;
    let init = null;
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      name = node.name.text;
      init = node.initializer;
    } else if (ts.isPropertyAssignment(node) && (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name))) {
      name = node.name.text;
      init = node.initializer;
    }
    if (name && init) {
      const th = thresholdForName(name);
      const v = evalConst(init);
      if (th !== null && v !== null && v >= th) report(node, name, `${v}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return { found, badMarkers };
}

const files = [];
for (const t of SCAN_TARGETS) collectFiles(t, files);

const offenders = [];
const badMarkers = [];
for (const f of files) {
  const rel = path.relative(ROOT, f).split(path.sep).join('/');
  if (isAllowlisted(rel) || isTestFile(rel)) continue;
  const r = analyze(f);
  offenders.push(...r.found);
  badMarkers.push(...r.badMarkers);
}

const byFile = new Map();
for (const o of offenders) {
  if (!byFile.has(o.rel)) byFile.set(o.rel, []);
  byFile.get(o.rel).push(o);
}

console.log(`Contrôle des délais codés en dur : ${offenders.length} occurrence(s) dans ${byFile.size} fichier(s).`);
for (const [rel, list] of [...byFile.entries()].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`\n${rel} (${list.length})`);
  for (const o of list) console.log(`  l.${o.line}  [${o.label}] ${o.value}  ${o.code}`);
}
if (badMarkers.length) {
  console.log(`\n${badMarkers.length} marqueur(s) delay-ok sans raison écrite :`);
  for (const b of badMarkers) console.log(`  ${b.rel} l.${b.line}`);
}

if (STRICT && (offenders.length > 0 || badMarkers.length > 0)) {
  console.error('\nÉCHEC : déclarer le délai dans server/engine/engineParams.ts, ou marquer // delay-ok: raison.');
  process.exit(1);
}
