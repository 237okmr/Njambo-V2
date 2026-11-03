import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  ADMIN_TEMPLATES,
  isAllowed,
  routeRequirement,
  sanitizePermissions,
  type KatikaAccess,
} from './adminRights';
import { createAdminRegistryCache, normalizeEntry } from './adminRegistry';

const owner: KatikaAccess = { isOwner: true, permissions: [] };
const moderator: KatikaAccess = { isOwner: false, permissions: ADMIN_TEMPLATES.MODERATOR.permissions };
const community: KatikaAccess = { isOwner: false, permissions: ADMIN_TEMPLATES.COMMUNITY.permissions };

const allowed = (access: KatikaAccess, method: string, p: string) => isAllowed(access, routeRequirement(method, p));

describe('Droits des administrateurs de katika', () => {
  it('chaque route /api/katika du serveur est classée', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'server.ts'), 'utf8');
    const routes = [...source.matchAll(/app\.(get|post|put|patch|delete)\('\/api\/katika(\/[^']*)'/g)];
    assert.ok(routes.length > 40);
    const unclassified = routes
      .map(([, method, p]) => [method.toUpperCase(), p.replace(/:[A-Za-z]+/g, 'x')] as const)
      .filter(([method, p]) => routeRequirement(method, p) === null)
      .map(([method, p]) => `${method} ${p}`);
    assert.deepEqual(unclassified, []);
  });

  it('une route inconnue est refusée à tous sauf au propriétaire', () => {
    assert.equal(routeRequirement('GET', '/nouvelle-route'), null);
    assert.equal(allowed(moderator, 'GET', '/nouvelle-route'), false);
    assert.equal(allowed(owner, 'GET', '/nouvelle-route'), true);
  });

  it('la gestion des admins, les clés de paiement et les anciennes fiches restent au propriétaire', () => {
    const everything: KatikaAccess = { isOwner: false, permissions: sanitizePermissions(Object.values(ADMIN_TEMPLATES).flatMap((t) => t.permissions).concat(['cash.view', 'cash.manage', 'settings.edit', 'players.edit'])) };
    for (const [method, p] of [
      ['GET', '/admins'],
      ['POST', '/admins'],
      ['PUT', '/admins/abc'],
      ['DELETE', '/admins/abc'],
      ['GET', '/cash/providers/campay/live'],
      ['POST', '/cash/providers/campay/live'],
      ['POST', '/legacy-records'],
    ]) {
      assert.equal(allowed(everything, method, p), false, `${method} ${p}`);
      assert.equal(allowed(owner, method, p), true, `${method} ${p}`);
    }
  });

  it('un modérateur agit sur les tables et les sanctions, pas sur l\'argent ni les réglages', () => {
    assert.equal(allowed(moderator, 'POST', '/rooms/AB12/kick'), true);
    assert.equal(allowed(moderator, 'POST', '/ban-player'), true);
    assert.equal(allowed(moderator, 'POST', '/player-chips'), false);
    assert.equal(allowed(moderator, 'POST', '/engine-config'), false);
    assert.equal(allowed(moderator, 'GET', '/cash/finance'), false);
    assert.equal(allowed(moderator, 'POST', '/cash/withdrawals/x/approve'), false);
    assert.equal(allowed(moderator, 'POST', '/ai-chat'), false);
  });

  it('un community manager utilise le Copilote mais ne voit ni les joueurs ni les tables', () => {
    assert.equal(allowed(community, 'POST', '/ai-visual'), true);
    assert.equal(allowed(community, 'GET', '/notes'), true);
    assert.equal(allowed(community, 'GET', '/player-history/abc'), false);
    assert.equal(allowed(community, 'POST', '/rooms/AB12/close'), false);
  });

  it('Kora Cash : voir et agir sont deux droits distincts', () => {
    const viewer: KatikaAccess = { isOwner: false, permissions: ['cash.view'] };
    assert.equal(allowed(viewer, 'GET', '/cash/withdrawals'), true);
    assert.equal(allowed(viewer, 'POST', '/cash/withdrawals/x/approve'), false);
  });

  it('ne garde que les droits connus, sans doublon', () => {
    assert.deepEqual(sanitizePermissions(['players.view', 'admins.manage', 'players.view', 3]), ['players.view']);
    assert.deepEqual(sanitizePermissions('players.view'), []);
  });

  it('une fiche retirée ou abîmée n\'accorde aucun droit', () => {
    assert.equal(normalizeEntry('u', { status: 'REVOKED', permissions: ['players.view'] })?.status, 'REVOKED');
    assert.equal(normalizeEntry('u', { permissions: ['players.view'] })?.status, 'REVOKED');
    assert.equal(normalizeEntry('u', null), null);
  });

  it('la fiche est relue après la période réglée, et une lecture ratée ne donne pas accès', async () => {
    let now = 0;
    let reads = 0;
    let fail = false;
    const cache = createAdminRegistryCache({
      now: () => now,
      cacheMs: () => 60_000,
      readEntry: async (uid) => {
        reads += 1;
        if (fail) throw new Error('panne');
        return normalizeEntry(uid, { status: 'ACTIVE', permissions: ['players.view'] });
      },
    });
    await cache.get('u');
    await cache.get('u');
    assert.equal(reads, 1);
    now = 60_000;
    fail = true;
    await assert.rejects(cache.get('u'));
    assert.equal(reads, 2);
  });
});
