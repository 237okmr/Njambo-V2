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
