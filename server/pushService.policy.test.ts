import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGameUrl, isQuietNow, isTypeAllowed, DEFAULT_SERVER_PUSH_PREFERENCES as D } from './pushService';

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
