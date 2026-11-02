import { describe, it } from 'node:test';
import assert from 'node:assert';
import { buildEconomyRuleForChat, buildMoneyRulesBlock, isKoraCashEnabled, sanitizePublicText } from './moneyPolicy';

describe('moneyPolicy - règles « argent » de l\'IA, en un seul endroit', () => {
  it('retire les mots réservés des textes publics et remplace gratuit', () => {
    assert.strictEqual(sanitizePublicText('Tente le Double Kora en bêta'), 'Tente le Double Kora');
    assert.strictEqual(sanitizePublicText('Rejoins la bêta ouverte'), 'Rejoins le jeu');
    assert.strictEqual(sanitizePublicText('Teste la version démo'), 'Teste le jeu');
    assert.strictEqual(sanitizePublicText('Essaie une version de test'), 'Essaie le jeu');
    assert.strictEqual(sanitizePublicText('Jeu 100% gratuit #BêtaTest'), 'Jeu en jetons virtuels');
    assert.strictEqual(sanitizePublicText('Viens tester tes bluffs, démonstration et alphabet'), 'Viens tester tes bluffs, démonstration et alphabet');
  });

  it('bêta (par défaut) : jetons virtuels uniquement, aucun gain réel', () => {
    assert.strictEqual(isKoraCashEnabled(undefined), false);
    assert.strictEqual(isKoraCashEnabled({}), false);
    assert.strictEqual(isKoraCashEnabled({ koraCashEnabled: false }), false);

    const visual = buildMoneyRulesBlock(false);
    assert.ok(visual.includes('jetons virtuels'));
    assert.ok(visual.includes('PAS DE GAINS EN MONNAIE RÉELLE'));

    const chat = buildEconomyRuleForChat(false);
    assert.ok(chat.includes('exclusivement en jetons virtuels'));
    assert.ok(chat.includes('Aucune valeur monétaire réelle'));
  });

  it('Kora Cash ouvert : aucune promesse de gain, adultes, risques, validation juridique', () => {
    assert.strictEqual(isKoraCashEnabled({ koraCashEnabled: true }), true);

    const visual = buildMoneyRulesBlock(true);
    assert.ok(visual.includes('réservé aux adultes'));
    assert.ok(visual.includes('comporte des risques'));
    assert.ok(visual.includes('sans jamais promettre'));
    assert.strictEqual(visual.includes('PAS DE GAINS EN MONNAIE RÉELLE'), false);

    const chat = buildEconomyRuleForChat(true);
    assert.ok(chat.includes('juriste'));
    assert.ok(chat.includes('Ne jamais promettre'));
  });

  it('seul un true strict active Kora Cash', () => {
    assert.strictEqual(isKoraCashEnabled({ koraCashEnabled: 'true' as unknown as boolean }), false);
    assert.strictEqual(isKoraCashEnabled(null), false);
  });
});
