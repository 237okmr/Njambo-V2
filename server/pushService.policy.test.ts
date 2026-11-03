import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGameUrl, isInNightWindow, isQuietNow, isTypeAllowed, DEFAULT_SERVER_PUSH_PREFERENCES as D } from './pushService';

test('les liens de notification restent dans le scope /game/', () => {
  assert.equal(buildGameUrl('AB12'), '/game/?join=AB12');
  assert.equal(buildGameUrl(), '/game/');
  assert.ok(buildGameUrl('a b').startsWith('/game/'));
});

test('les préférences filtrent chaque type côté serveur', () => {
  assert.equal(isTypeAllowed('INVITATION', { ...D, directInvites: false }), false);
  assert.equal(isTypeAllowed('YOUR_TURN', { ...D, turnReminders: false }), false);
  assert.equal(isTypeAllowed('GAME_START', { ...D, gameStartAlerts: false }), false);
  assert.equal(isTypeAllowed('FORFEIT_WARNING', { ...D, tableAlerts: false }), false);
  assert.equal(isTypeAllowed('DISCONNECTED', D), true);
  assert.equal(isTypeAllowed('SYSTEM', { ...D, directInvites: false, tableAlerts: false }), true);
});

test('changements de rang : préférence active par défaut, désactivable', () => {
  assert.equal(isTypeAllowed('RANK_CHANGE', D), true);
  assert.equal(isTypeAllowed('RANK_CHANGE', { ...D, rankChanges: undefined }), true);
  assert.equal(isTypeAllowed('RANK_CHANGE', { ...D, rankChanges: false }), false);
});

test('nuit des annonces de rang : heure locale du joueur, plage traversant minuit', () => {
  const at = (utcHour: number) => Date.UTC(2026, 8, 20, utcHour, 30);
  assert.equal(isInNightWindow(60, 22, 7, at(21)), true); // 22h30 locale
  assert.equal(isInNightWindow(60, 22, 7, at(5)), true); // 06h30 locale
  assert.equal(isInNightWindow(60, 22, 7, at(6)), false); // 07h30 locale
  assert.equal(isInNightWindow(60, 22, 7, at(20)), false); // 21h30 locale
  assert.equal(isInNightWindow(0, 1, 5, at(3)), true);
});

test('mode nuit : plage qui traverse minuit, fuseau du joueur (Cameroun = UTC+1)', () => {
  const prefs = { ...D, quietHoursEnabled: true, quietHoursStart: 23, quietHoursEnd: 8, tzOffsetMinutes: 60 };
  const at = (utcHour: number) => Date.UTC(2026, 8, 20, utcHour, 30);
  assert.equal(isQuietNow(prefs, at(22)), true); // 23h30 locale
  assert.equal(isQuietNow(prefs, at(2)), true); // 03h30 locale
  assert.equal(isQuietNow(prefs, at(6)), true); // 07h30 locale
  assert.equal(isQuietNow(prefs, at(7)), false); // 08h30 locale
  assert.equal(isQuietNow(prefs, at(12)), false);
  assert.equal(isQuietNow({ ...prefs, quietHoursEnabled: false }, at(2)), false);
});
