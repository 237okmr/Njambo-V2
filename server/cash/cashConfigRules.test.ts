/**
 * Tests des règles pures de configuration Kora Cash : validation stricte des demandes,
 * lecture tolérante (par défaut désactivé), statut public sans fuite.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseConfigPatch, normalizeStoredConfig, toPublicStatus } from './cashConfigRules';

describe('Kora Cash — configuration : règles pures', () => {
  it('accepte une demande valide', () => {
    const r = parseConfigPatch({ isEnabled: true, activeProviderId: 'campay', environment: 'DEMO' });
    assert.equal(r.ok, true);
    if (r.ok) assert.deepEqual(r.patch, { isEnabled: true, activeProviderId: 'campay', environment: 'DEMO' });
  });

  it('accepte de retirer le prestataire actif (null)', () => {
    const r = parseConfigPatch({ activeProviderId: null });
    assert.equal(r.ok, true);
  });

  it('refuse un corps vide, un tableau ou autre chose qu\'un objet', () => {
    assert.equal(parseConfigPatch({}).ok, false);
    assert.equal(parseConfigPatch([]).ok, false);
    assert.equal(parseConfigPatch(null).ok, false);
    assert.equal(parseConfigPatch('LIVE').ok, false);
  });

  it('refuse toute clé inconnue, y compris celles qui ressemblent à de l\'argent ou à un secret', () => {
    assert.equal(parseConfigPatch({ isEnabled: true, apiKey: 'x' }).ok, false);
    assert.equal(parseConfigPatch({ updatedBy: 'moi' }).ok, false);
    assert.equal(parseConfigPatch({ updatedAt: 1 }).ok, false);
  });

  it('refuse les valeurs de mauvais type ou hors liste', () => {
    assert.equal(parseConfigPatch({ isEnabled: 'true' }).ok, false);
    assert.equal(parseConfigPatch({ isEnabled: 1 }).ok, false);
    assert.equal(parseConfigPatch({ activeProviderId: 'paypal' }).ok, false);
    assert.equal(parseConfigPatch({ environment: 'PROD' }).ok, false);
    assert.equal(parseConfigPatch({ environment: 'live' }).ok, false);
  });

  it('une configuration absente ou corrompue retombe sur désactivé et démo', () => {
    assert.deepEqual(normalizeStoredConfig(undefined), { isEnabled: false, activeProviderId: null, environment: 'DEMO', updatedAt: 0 });
    const weird = normalizeStoredConfig({ isEnabled: 'oui', activeProviderId: 'paypal', environment: 'PROD', updatedAt: 'hier' });
    assert.deepEqual(weird, { isEnabled: false, activeProviderId: null, environment: 'DEMO', updatedAt: 0 });
  });

  it('relit fidèlement une configuration valide', () => {
    const cfg = normalizeStoredConfig({ isEnabled: true, activeProviderId: 'notchpay', environment: 'LIVE', updatedAt: 1234, updatedBy: 'admin@x.com' });
    assert.deepEqual(cfg, { isEnabled: true, activeProviderId: 'notchpay', environment: 'LIVE', updatedAt: 1234, updatedBy: 'admin@x.com' });
  });

  it('le statut public ne révèle ni prestataire ni auteur de modification', () => {
    const pub = toPublicStatus({ isEnabled: true, activeProviderId: 'campay', environment: 'LIVE', updatedAt: 9, updatedBy: 'admin@x.com' });
    assert.deepEqual(pub, { enabled: true, environment: 'LIVE' });
  });
});
