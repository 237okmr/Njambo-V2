// Test du service worker (push + clic) sans navigateur : le fichier public/sw.js est exécuté dans un bac à sable
// avec de faux clients. Lancer : node --test scripts/sw-push.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const code = fs.readFileSync(path.join(__dirname, '..', 'public', 'sw.js'), 'utf8');
const ANDROID_CHROME = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36';
const IPHONE_SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Version/17.4 Mobile/15E148 Safari/604.1';
const ORIGIN = 'https://njambo.example';

function makeEnv(clientList, ua = ANDROID_CHROME) {
  const listeners = {};
  const log = { shown: [], opened: [], posted: [], focused: [], navigated: [], closed: [] };
  const self = {
    location: { origin: ORIGIN },
    navigator: { userAgent: ua, setAppBadge: () => Promise.resolve(), clearAppBadge: () => Promise.resolve() },
    registration: {
      scope: ORIGIN + '/',
      showNotification: (title, options) => { log.shown.push({ title, options }); return Promise.resolve(); },
      getNotifications: async () => log.shown.map((x) => ({ close: () => log.closed.push(x.options.tag) })),
    },
    addEventListener: (name, fn) => { listeners[name] = fn; },
    skipWaiting() {},
    clients: {
      claim: () => Promise.resolve(),
      matchAll: async () => clientList.map((c) => ({
        ...c,
        postMessage: (m) => log.posted.push({ url: c.url, m }),
        focus: async () => { log.focused.push(c.url); return c; },
        navigate: async (u) => { log.navigated.push(u); },
      })),
      openWindow: async (u) => { log.opened.push(u); },
    },
  };
  self.self = self;
  const ctx = vm.createContext({
    self, URL, Promise, console, Response,
    setTimeout: (fn) => { fn(); return 0; }, // pas d'attente réelle
    caches: { open: async () => ({ addAll: async () => {} }), keys: async () => [] },
    fetch: async () => ({}),
  });
  vm.runInContext(code, ctx);
  return { listeners, log };
}

async function fire(listeners, name, ev) {
  let pending;
  ev.waitUntil = (p) => { pending = p; };
  listeners[name](ev);
  await pending;
}
const pushEvent = (obj) => ({ data: { json: () => obj, text: () => '' } });
const clickEvent = (data, action) => ({ action, notification: { data, close() {} } });
const gameClient = (extra = {}) => ({ url: ORIGIN + '/game/', focused: false, visibilityState: 'hidden', ...extra });

test('ancien lien /?join=CODE ramené dans le scope /game/', async () => {
  const e = makeEnv([]);
  await fire(e.listeners, 'notificationclick', clickEvent({ url: '/?join=ABCD', roomCode: 'ABCD' }));
  assert.equal(e.log.opened[0], ORIGIN + '/game/?join=ABCD');
});

test('code de salle seul => /game/?join=', async () => {
  const e = makeEnv([]);
  await fire(e.listeners, 'notificationclick', clickEvent({ roomCode: 'XY12' }));
  assert.equal(e.log.opened[0], ORIGIN + '/game/?join=XY12');
});

test('URL racine ou externe => /game/', async () => {
  let e = makeEnv([]);
  await fire(e.listeners, 'notificationclick', clickEvent({ type: 'SYSTEM', url: '/' }));
  assert.equal(e.log.opened[0], ORIGIN + '/game/');
  e = makeEnv([]);
  await fire(e.listeners, 'notificationclick', clickEvent({ url: 'https://evil.example/x' }));
  assert.equal(e.log.opened[0], ORIGIN + '/game/');
});

test('fenêtre PWA déjà ouverte : focus + message, jamais de navigation ni de nouvelle fenêtre', async () => {
  const e = makeEnv([gameClient()]);
  await fire(e.listeners, 'notificationclick', clickEvent({ url: '/game/?join=ABCD', roomCode: 'ABCD' }));
  assert.equal(e.log.opened.length, 0);
  assert.equal(e.log.navigated.length, 0);
  assert.equal(e.log.focused.length, 1);
  assert.equal(e.log.posted.length, 1);
});

test('une fenêtre Copilote ne capte pas une notification de jeu', async () => {
  const e = makeEnv([{ url: ORIGIN + '/copilot/', focused: true, visibilityState: 'visible' }]);
  await fire(e.listeners, 'notificationclick', clickEvent({ url: '/game/?join=ABCD', roomCode: 'ABCD' }));
  assert.equal(e.log.focused.length, 0);
  assert.equal(e.log.opened.length, 1);
});

test('« Plus tard » n\'ouvre rien', async () => {
  const e = makeEnv([]);
  await fire(e.listeners, 'notificationclick', clickEvent({ roomCode: 'ABCD' }, 'dismiss'));
  assert.equal(e.log.opened.length, 0);
});

test('forfait déclaré => accueil sans tentative de rejoindre ; déconnexion => rejoindre la table', async () => {
  let e = makeEnv([]);
  await fire(e.listeners, 'notificationclick', clickEvent({ type: 'FORFEIT_DECLARED', roomCode: 'AB12', url: '/game/' }));
  assert.equal(e.log.opened[0], ORIGIN + '/game/');
  e = makeEnv([]);
  await fire(e.listeners, 'notificationclick', clickEvent({ type: 'DISCONNECTED', roomCode: 'AB12', url: '/game/?join=AB12' }));
  assert.equal(e.log.opened[0], ORIGIN + '/game/?join=AB12');
});

test('Chrome, app visible : aucune notification système en double', async () => {
  const e = makeEnv([gameClient({ focused: true, visibilityState: 'visible' })]);
  await fire(e.listeners, 'push', pushEvent({ title: 'T', body: 'B', data: { type: 'YOUR_TURN', roomCode: 'AB' } }));
  assert.equal(e.log.shown.length, 0);
  assert.equal(e.log.posted.length, 1);
});

test('le message de test (SYSTEM) est toujours affiché', async () => {
  const e = makeEnv([gameClient({ focused: true, visibilityState: 'visible' })]);
  await fire(e.listeners, 'push', pushEvent({ title: 'T', body: 'B', data: { type: 'SYSTEM' } }));
  assert.equal(e.log.shown.length, 1);
});

test('app en arrière-plan : notification affichée avec actions, sans requireInteraction', async () => {
  const e = makeEnv([gameClient()]);
  await fire(e.listeners, 'push', pushEvent({ title: 'T', body: 'B', data: { type: 'INVITATION', roomCode: 'AB' } }));
  assert.equal(e.log.shown.length, 1);
  assert.equal(e.log.shown[0].options.requireInteraction, false);
  assert.equal(e.log.shown[0].options.actions.length, 2);
});

test('iPhone/Safari, app visible : notification affichée en silence puis fermée (sinon abonnement révoqué)', async () => {
  const e = makeEnv([gameClient({ focused: true, visibilityState: 'visible' })], IPHONE_SAFARI);
  await fire(e.listeners, 'push', pushEvent({ title: 'T', body: 'B', tag: 'inv-1', data: { type: 'INVITATION', roomCode: 'AB' } }));
  assert.equal(e.log.shown.length, 1);
  assert.equal(e.log.shown[0].options.silent, true);
  assert.equal(e.log.closed.length, 1);
});

test('alertes critiques : requireInteraction et vibration marquée ; forfait déclaré sans bouton rejoindre', async () => {
  let e = makeEnv([]);
  await fire(e.listeners, 'push', pushEvent({ title: 'T', body: 'B', data: { type: 'FORFEIT_WARNING', roomCode: 'AB' } }));
  assert.equal(e.log.shown[0].options.requireInteraction, true);
  assert.equal(e.log.shown[0].options.vibrate.length, 5);
  e = makeEnv([]);
  await fire(e.listeners, 'push', pushEvent({ title: 'T', body: 'B', data: { type: 'FORFEIT_DECLARED', roomCode: 'AB' } }));
  assert.equal(e.log.shown[0].options.actions.length, 0);
});

test('invitation : l\'identifiant de l\'invitation et l\'expéditeur voyagent dans l\'URL (app fermée)', async () => {
  const e = makeEnv([]);
  await fire(e.listeners, 'notificationclick', clickEvent({ type: 'INVITATION', roomCode: 'AB12', inviteId: 'inv_9', fromUserId: 'usr_1', url: '/game/?join=AB12' }));
  const u = new URL(e.log.opened[0]);
  assert.equal(u.pathname, '/game/');
  assert.equal(u.searchParams.get('join'), 'AB12');
  assert.equal(u.searchParams.get('inv'), 'inv_9');
  assert.equal(u.searchParams.get('inviter'), 'usr_1');
});
