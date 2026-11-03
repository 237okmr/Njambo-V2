import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { can, canSeeTab, firstAllowedTab, matchTemplate } from './katikaAccess';

describe('Affichage selon les droits', () => {
  const moderator = { isOwner: false, permissions: ['rooms.view', 'players.view'] };

  it('le propriétaire voit tout', () => {
    assert.equal(canSeeTab({ isOwner: true, permissions: [] }, 'KORA_CASH'), true);
  });

  it('un admin ajouté ne voit que ses onglets', () => {
    assert.equal(canSeeTab(moderator, 'ROOMS'), true);
    assert.equal(canSeeTab(moderator, 'SETTINGS'), false);
    assert.equal(canSeeTab(moderator, 'KORA_CASH'), false);
    assert.equal(can(null, 'rooms.view'), false);
  });

  it('ouvre le premier onglet permis, ou aucun', () => {
    assert.equal(firstAllowedTab(moderator, ['DASHBOARD', 'ROOMS', 'PLAYERS']), 'ROOMS');
    assert.equal(firstAllowedTab({ isOwner: false, permissions: [] }, ['DASHBOARD', 'ROOMS']), null);
  });

  it('reconnaît un modèle quel que soit l\'ordre des cases, sinon « personnalisé »', () => {
    const templates = { READ_ONLY: { label: 'Lecture seule', permissions: ['a', 'b'] } };
    assert.equal(matchTemplate(templates, ['b', 'a']), 'READ_ONLY');
    assert.equal(matchTemplate(templates, ['a']), 'CUSTOM');
  });
});
