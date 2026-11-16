import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildHomeTodo, needsStrongConfirm } from './homeItems';

const base = { serverUp: true, maintenance: false, withdrawalsAwaiting: null, collusionAlerts: null, journalAlerts: null };

describe('Accueil de katika : à traiter maintenant', () => {
  it('rien à traiter seulement si le serveur répond', () => {
    assert.deepEqual(buildHomeTodo(base).map((i) => i.text), ['Rien à traiter pour le moment']);
    assert.deepEqual(buildHomeTodo({ ...base, serverUp: null }), []);
  });

  it('met les urgences en premier', () => {
    const items = buildHomeTodo({ ...base, maintenance: true, withdrawalsAwaiting: 2, journalAlerts: { critical: 1, warning: 3 } });
    assert.equal(items[0].level, 'CRITICAL');
    assert.equal(items[0].tab, 'LOGS');
    assert.ok(items.some((i) => i.text === '2 retraits attendent ta décision' && i.tab === 'KORA_CASH'));
    assert.ok(items.some((i) => i.text === '3 avertissements au journal (24 h)'));
  });

  it('un serveur injoignable est signalé', () => {
    assert.equal(buildHomeTodo({ ...base, serverUp: false })[0].text, 'Serveur du jeu injoignable');
  });
});

describe('plantages de l\'application', () => {
  it('une ligne à examiner, au pluriel quand il y en a plusieurs, qui mène au journal', () => {
    const one = buildHomeTodo({ ...base, openCrashes: 1 }).find((i) => i.text.includes('plantage'));
    assert.equal(one?.text, "1 type de plantage de l'application à examiner (24 h)");
    assert.equal(one?.tab, 'LOGS');
    assert.match(buildHomeTodo({ ...base, openCrashes: 3 })[0].text, /^3 types de plantage/);
  });
  it('rien à signaler : pas de ligne, et « rien à traiter » reste affiché', () => {
    assert.equal(buildHomeTodo({ ...base, openCrashes: 0 })[0].level, 'OK');
    assert.equal(buildHomeTodo({ ...base, openCrashes: null })[0].level, 'OK');
  });
});

describe('Confirmation renforcée de Kora Cash sur téléphone', () => {
  it('seulement pour une action Kora Cash, sur petit écran', () => {
    assert.equal(needsStrongConfirm('POST', '/api/katika/cash/withdrawals/x/approve', true), true);
    assert.equal(needsStrongConfirm('POST', '/api/katika/cash/withdrawals/x/approve', false), false);
    assert.equal(needsStrongConfirm('GET', '/api/katika/cash/withdrawals', true), false);
    assert.equal(needsStrongConfirm(undefined, '/api/katika/cash/finance', true), false);
    assert.equal(needsStrongConfirm('POST', '/api/katika/ban-player', true), false);
  });
});

describe('connexion Google', () => {
  it('une ligne quand des types d\'appareils échouent à ouvrir la connexion, qui mène au journal', () => {
    const one = buildHomeTodo({ ...base, authSuspects: 1 }).find((i) => i.text.includes('connexion Google'));
    assert.equal(one?.text, "1 type d'appareil échoue à ouvrir la connexion Google (2 jours)");
    assert.equal(one?.tab, 'LOGS');
    const many = buildHomeTodo({ ...base, authSuspects: 3 }).find((i) => i.text.includes('connexion Google'));
    assert.equal(many?.text, "3 types d'appareils échouent à ouvrir la connexion Google (2 jours)");
  });

  it('rien à signaler quand aucun type n\'est suspect ou que la mesure n\'est pas lue', () => {
    assert.ok(!buildHomeTodo({ ...base, authSuspects: 0 }).some((i) => i.text.includes('connexion Google')));
    assert.ok(!buildHomeTodo({ ...base, authSuspects: null }).some((i) => i.text.includes('connexion Google')));
  });
});

describe('parcours d\'invitation', () => {
  it('une ligne quand des groupes d\'appareils échouent à rejoindre par lien, qui mène au journal', () => {
    const one = buildHomeTodo({ ...base, inviteSuspects: 1 }).find((i) => i.text.includes('lien d\'invitation'));
    assert.equal(one?.text, "1 groupe d'appareils échoue à rejoindre une table par lien d'invitation (2 jours)");
    assert.equal(one?.tab, 'LOGS');
    const many = buildHomeTodo({ ...base, inviteSuspects: 2 }).find((i) => i.text.includes('lien d\'invitation'));
    assert.equal(many?.text, "2 groupes d'appareils échouent à rejoindre une table par lien d'invitation (2 jours)");
  });

  it('rien à signaler quand aucun groupe n\'est suspect ou que la mesure n\'est pas lue', () => {
    assert.ok(!buildHomeTodo({ ...base, inviteSuspects: 0 }).some((i) => i.text.includes('lien d\'invitation')));
    assert.ok(!buildHomeTodo({ ...base, inviteSuspects: null }).some((i) => i.text.includes('lien d\'invitation')));
  });
});

describe('démarrages de l\'application', () => {
  it('une ligne quand des types d\'appareils démarrent sans afficher l\'accueil, qui mène au journal', () => {
    const one = buildHomeTodo({ ...base, bootSuspects: 1 }).find((i) => i.text.includes('sans afficher l\'accueil'));
    assert.equal(one?.text, "1 type d'appareil démarre l'application sans afficher l'accueil (2 jours)");
    assert.equal(one?.tab, 'LOGS');
    const many = buildHomeTodo({ ...base, bootSuspects: 3 }).find((i) => i.text.includes('sans afficher l\'accueil'));
    assert.equal(many?.text, "3 types d'appareils démarrent l'application sans afficher l'accueil (2 jours)");
  });

  it('rien à signaler quand aucun type n\'est suspect ou que la mesure n\'est pas lue', () => {
    assert.ok(!buildHomeTodo({ ...base, bootSuspects: 0 }).some((i) => i.text.includes('accueil')));
    assert.ok(!buildHomeTodo({ ...base, bootSuspects: null }).some((i) => i.text.includes('accueil')));
  });
});
