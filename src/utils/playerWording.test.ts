/**
 * Vocabulaire des textes lus par les joueurs et des publications : les mots réservés à l'équipe n'y reviennent pas.
 * Lit le code sans l'exécuter. Katika, les journaux techniques et les valeurs de code ne sont pas concernés.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const RESERVED = /(?<![\p{L}])(d[ée]mo|b[êe]ta(?:test)?|fictifs?|fictives?|tests?|campay)(?![\p{L}])/iu;

const ROOTS = ['src', 'server', 'public/sw.js'];

/** Hors joueur : Katika, sauf ce qui sert à produire les publications. */
const KATIKA_PUBLIC = [
  'src/katika/data/',
  'src/katika/visual/',
  'src/katika/types/socialVisuals.ts',
  'src/katika/mobile/KatikaMobileSocialStudioModal.tsx',
  'src/katika/components/modals/KatikaSocialStudioModal.tsx',
  'src/katika/components/social/',
  'src/katika/components/KatikaChatMessageRenderer.tsx',
];

const EXCLUDED_FILES = [
  'server/aiAdminChat.ts',
  'server/engine/engineParams.ts',
  'server/katika/',
  'server/cash/cashConfigRules.ts',
  'server/cash/cashConfigStore.ts',
  'server/cash/cashSecrets.ts',
  'server/cash/demoCleanup.ts',
  'server/cash/demoCleanupRules.ts',
  'server/cash/financeRules.ts',
  'server/cash/financeStore.ts',
  // Jamais affichés dans le jeu.
  'src/components/Scoreboard.tsx',
  'src/components/TestModeModal.tsx',
  'src/components/MultiplayerHubModal.tsx',
  'src/components/MultiplayerLobbyModal.tsx',
  'src/components/RulesModal.tsx',
];

/** Exceptions : début du texte autorisé, par fichier, avec la raison. */
const PREVIEW_ONLY = 'Affiché seulement sur les adresses de préversion, jamais sur l’adresse publique.';
const AI_RULE = 'Consigne qui interdit ces mots à l’IA, jamais publiée.';
const KATIKA_WARNING = 'Avertissement lu dans Katika seulement.';
const CONNECTION_CHECK = 'Essai de connexion du prestataire, lu dans Katika seulement.';
const UNUSED = 'Fonction sans appelant, jamais affichée.';
const ADMIN_NOTE = 'Note de suivi d’un paiement, lue dans Katika seulement.';
const CAMPAY_CLIENT = 'server/cash/campayClient.ts';
const WITHDRAWAL_RULES = 'server/cash/withdrawalRules.ts';
const WITHDRAWALS = 'server/cash/withdrawals.ts';

const ALLOWED: { file: string; text: string; why: string }[] = [
  { file: 'src/components/multiplayer/MultiplayerScreen.tsx', text: 'Environnement de test', why: PREVIEW_ONLY },
  { file: 'src/components/multiplayer/MultiplayerScreen.tsx', text: "Tu es sur l'environnement de test", why: PREVIEW_ONLY },
  { file: 'src/katika/visual/moneyPolicy.ts', text: '- ARGENT RÉEL', why: AI_RULE },
  { file: 'src/katika/visual/moneyPolicy.ts', text: '- PAS DE GAINS', why: AI_RULE },
  { file: 'server/aiVisual.ts', text: 'Tu es le Moteur de Génération Visuelle', why: AI_RULE },
  { file: 'src/katika/visual/validateSpec.ts', text: 'Texte corrigé :', why: KATIKA_WARNING },
  { file: CAMPAY_CLIENT, text: 'Identifiants Campay manquants', why: CONNECTION_CHECK },
  { file: CAMPAY_CLIENT, text: 'Connexion Campay réussie', why: CONNECTION_CHECK },
  { file: CAMPAY_CLIENT, text: "Échec d'authentification Campay", why: CONNECTION_CHECK },
  { file: CAMPAY_CLIENT, text: 'Erreur de communication avec Campay', why: CONNECTION_CHECK },
  { file: CAMPAY_CLIENT, text: 'Identifiants Campay (démo)', why: UNUSED },
  { file: CAMPAY_CLIENT, text: "Jeton d'accès Campay", why: UNUSED },
  { file: CAMPAY_CLIENT, text: 'Échec collecte Campay', why: UNUSED },
  { file: CAMPAY_CLIENT, text: 'Réponse inattendue de Campay', why: ADMIN_NOTE },
  { file: CAMPAY_CLIENT, text: 'Aucune réponse de Campay', why: ADMIN_NOTE },
  { file: CAMPAY_CLIENT, text: 'Identifiants Campay absents', why: ADMIN_NOTE },
  { file: CAMPAY_CLIENT, text: 'Jeton Campay indisponible', why: ADMIN_NOTE },
  { file: CAMPAY_CLIENT, text: 'Campay n’a pas donné son solde', why: ADMIN_NOTE },
  { file: CAMPAY_CLIENT, text: 'Réponse de Campay illisible', why: ADMIN_NOTE },
  { file: CAMPAY_CLIENT, text: 'Campay ne répond pas. Saisis le solde', why: ADMIN_NOTE },
  { file: WITHDRAWAL_RULES, text: 'Référence externe différente chez Campay', why: ADMIN_NOTE },
  { file: WITHDRAWAL_RULES, text: 'Référence de transaction différente chez Campay', why: ADMIN_NOTE },
  { file: WITHDRAWAL_RULES, text: 'Montant différent chez Campay', why: ADMIN_NOTE },
  { file: WITHDRAWALS, text: 'Aucune réponse de Campay', why: ADMIN_NOTE },
  { file: WITHDRAWALS, text: 'Référence Campay illisible', why: ADMIN_NOTE },
];

const SKIPPED_ATTRIBUTES = new Set(['className', 'id', 'key', 'style', 'href', 'src', 'type', 'data-testid']);

function isCovered(file: string): boolean {
  if (!/\.(ts|tsx|js)$/.test(file) || /\.test\.|\.d\.ts$/.test(file)) return false;
  if (file.startsWith('src/katika/')) return KATIKA_PUBLIC.some((p) => file.startsWith(p));
  return !EXCLUDED_FILES.some((p) => file.startsWith(p));
}

/** Une valeur de code (`demo`, `DEMO`, `campay`, une adresse) n'est pas un texte lu par un joueur. */
function isCodeValue(text: string): boolean {
  const t = text.trim();
  return /^[a-z0-9_.:/-]+$/.test(t) || /^[A-Z0-9_]+$/.test(t) || /^https?:/.test(t);
}

export function findReservedWords(file: string, source: string): { line: number; text: string }[] {
  const scriptKind = file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, scriptKind);
  const found: { line: number; text: string }[] = [];
  const check = (node: ts.Node, raw: string) => {
    const text = raw.replace(/\s+/g, ' ').trim();
    if (!RESERVED.test(text) || isCodeValue(text)) return;
    found.push({ line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1, text });
  };
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node) || ts.isLiteralTypeNode(node)) return;
    if (ts.isCallExpression(node) && /^console\./.test(node.expression.getText())) return;
    if (ts.isJsxAttribute(node) && SKIPPED_ATTRIBUTES.has(node.name.getText())) return;
    if (ts.isJsxText(node)) check(node, node.getText());
    else if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) check(node, node.text);
    else if (ts.isTemplateExpression(node)) {
      check(node, node.head.text + node.templateSpans.map((span) => ` ${span.literal.text}`).join(''));
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}

function listFiles(entry: string): string[] {
  if (fs.statSync(entry).isFile()) return [entry.replace(/\\/g, '/')];
  return fs.readdirSync(entry).flatMap((name) => listFiles(path.join(entry, name)));
}

describe('Vocabulaire des textes joueur', () => {
  it('repère un mot réservé dans un texte, mais pas une valeur de code ni un journal', () => {
    const source = `
      const label = <span className="demo">Mode démo</span>;
      const env = 'demo';
      console.log('Campay répond');
      const message = 'Campay ne répond pas';
      const verb = 'Viens tester tes bluffs';
    `;
    assert.deepEqual(
      findReservedWords('exemple.tsx', source).map((f) => f.text),
      ['Mode démo', 'Campay ne répond pas']
    );
  });

  it('aucun mot réservé dans les textes joueur et les publications', () => {
    const files = ROOTS.flatMap(listFiles).filter(isCovered);
    assert.ok(files.length > 100, 'La lecture des fichiers a échoué.');
    const problems: string[] = [];
    for (const file of files) {
      for (const hit of findReservedWords(file, fs.readFileSync(file, 'utf8'))) {
        if (ALLOWED.some((a) => a.file === file && hit.text.startsWith(a.text))) continue;
        problems.push(`${file}:${hit.line} : ${hit.text.slice(0, 90)}`);
      }
    }
    assert.deepEqual(problems, []);
  });
});
