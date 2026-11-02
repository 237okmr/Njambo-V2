import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BottomNavContext, activeBottomNavItem, isBottomNavVisible } from './bottomNav';

const onHome: BottomNavContext = { isOnHomeScreen: true, isInRoomLobby: false, isSecondaryScreenOpen: false };
const closed = { leaderboard: false, profile: false, koraCash: false };

describe('barre de navigation du bas', () => {
  it('s’affiche sur les écrans principaux', () => {
    assert.equal(isBottomNavVisible(onHome), true);
  });

  it('se masque pendant une partie, dans une salle d’attente et sur un écran secondaire', () => {
    assert.equal(isBottomNavVisible({ ...onHome, isOnHomeScreen: false }), false);
    assert.equal(isBottomNavVisible({ ...onHome, isInRoomLobby: true }), false);
    assert.equal(isBottomNavVisible({ ...onHome, isSecondaryScreenOpen: true }), false);
  });

  it('active l’accueil par défaut, y compris depuis le multijoueur', () => {
    assert.equal(activeBottomNavItem(closed), 'home');
  });

  it('active l’écran au premier plan', () => {
    assert.equal(activeBottomNavItem({ ...closed, koraCash: true }), 'koraCash');
    assert.equal(activeBottomNavItem({ ...closed, koraCash: true, profile: true }), 'profile');
    assert.equal(activeBottomNavItem({ ...closed, profile: true, leaderboard: true }), 'leaderboard');
  });
});
