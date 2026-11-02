import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { GAME_HOME_PATH, ROUTE_PATHS, isConsoleLocation, isKnownGamePath, routePathFor, screenFromPath } from './appRoutes';
import { clearBackLayers, consumeBackLayer, pushBackLayer } from './backLayers';

describe('adresses des écrans', () => {
  it('reconnaît chaque écran, avec ou sans barre finale, sans tenir compte de la casse', () => {
    assert.equal(screenFromPath('/game/palmares'), 'leaderboard');
    assert.equal(screenFromPath('/game/palmares/'), 'leaderboard');
    assert.equal(screenFromPath('/GAME/Regles'), 'rules');
    assert.equal(screenFromPath('/game/multijoueur'), 'multiplayer');
    assert.equal(screenFromPath('/game/profil'), 'profile');
    assert.equal(screenFromPath('/game/notifications'), 'notifications');
  });

  it("n'associe aucun écran à l'accueil ni à une adresse inconnue", () => {
    assert.equal(screenFromPath('/game/'), null);
    assert.equal(screenFromPath('/nimporte-quoi'), null);
  });

  it('distingue les adresses connues des adresses à ramener vers l\'accueil', () => {
    assert.equal(isKnownGamePath('/'), true);
    assert.equal(isKnownGamePath('/game/'), true);
    assert.equal(isKnownGamePath('/game/palmares'), true);
    assert.equal(isKnownGamePath('/game/inconnu'), false);
    assert.equal(isKnownGamePath('/nimporte-quoi'), false);
  });

  it('garde toutes les adresses dans le scope de la PWA', () => {
    for (const path of Object.values(ROUTE_PATHS)) {
      assert.ok(path.startsWith(GAME_HOME_PATH), path);
    }
  });

  it("affiche l'adresse de l'écran au premier plan", () => {
    assert.equal(routePathFor({}), GAME_HOME_PATH);
    assert.equal(routePathFor({ multiplayer: true }), ROUTE_PATHS.multiplayer);
    assert.equal(routePathFor({ multiplayer: true, profile: true }), ROUTE_PATHS.profile);
    assert.equal(routePathFor({ profile: true, leaderboard: true }), ROUTE_PATHS.leaderboard);
    assert.equal(routePathFor({ leaderboard: true, notifications: true }), ROUTE_PATHS.notifications);
  });
});

describe('accès à la console Katika', () => {
  it('ouvre la console sur ses chemins et ses paramètres prévus', () => {
    assert.equal(isConsoleLocation('/katika', ''), true);
    assert.equal(isConsoleLocation('/katika/copilot', ''), true);
    assert.equal(isConsoleLocation('/copilot/', ''), true);
    assert.equal(isConsoleLocation('/', '?copilot=1'), true);
    assert.equal(isConsoleLocation('/', '?katika'), true);
    assert.equal(isConsoleLocation('/', '?mode=copilot'), true);
    assert.equal(isConsoleLocation('/', '?view=copilot'), true);
  });

  it("ne s'ouvre pas pour un simple mot dans l'adresse", () => {
    assert.equal(isConsoleLocation('/game/', '?ref=katika'), false);
    assert.equal(isConsoleLocation('/game/', '?join=KATIKA'), false);
    assert.equal(isConsoleLocation('/game/', '?source=copilot-link'), false);
    assert.equal(isConsoleLocation('/game/palmares', ''), false);
  });
});

describe('fenêtres fermées par le bouton Retour', () => {
  it('ne consomme rien quand aucune fenêtre n\'est ouverte', () => {
    clearBackLayers();
    assert.equal(consumeBackLayer(), false);
  });

  it('ferme la dernière fenêtre ouverte en premier', () => {
    clearBackLayers();
    const closed: string[] = [];
    pushBackLayer(() => closed.push('profil'));
    const removeTop = pushBackLayer(() => closed.push('avatar'));
    assert.equal(consumeBackLayer(), true);
    assert.deepEqual(closed, ['avatar']);
    removeTop();
    assert.equal(consumeBackLayer(), true);
    assert.deepEqual(closed, ['avatar', 'profil']);
  });

  it('retire une fenêtre fermée par un autre moyen', () => {
    clearBackLayers();
    const remove = pushBackLayer(() => assert.fail('ne doit pas être appelée'));
    remove();
    assert.equal(consumeBackLayer(), false);
  });
});
