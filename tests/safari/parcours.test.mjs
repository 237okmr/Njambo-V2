// Parcours de bout en bout sur un moteur Safari récent (Playwright WebKit, signature iPhone).
//
// Limites assumées, à relire avant de s'y fier :
//  - WebKit sous Linux est une version récente du moteur Safari. Il ne reproduit ni les limites des
//    anciens iOS (syntaxe iOS 15, mode « application installée », restrictions de stockage de Safari),
//    ni un vrai iPhone. Il attrape les régressions de parcours et de mesure, pas les pannes propres
//    à un appareil précis.
//  - La table est créée par un joueur « hôte » qui parle directement le protocole WebSocket du serveur
//    (pas par l'interface). Seul l'invité, lui, passe par la vraie interface dans WebKit.
//  - Aucun appel ne doit sortir vers Google ou Firebase de production : tout hôte autre que la pile
//    locale est bloqué et fait échouer le test.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { webkit } from 'playwright';
import WebSocket from 'ws';
import { startStack } from './stack.mjs';

const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 15_8 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.6 Mobile/15E148 Safari/604.1';

let stack;
let browser;

before(async () => {
  stack = await startStack();
  browser = await webkit.launch();
}, { timeout: 420000 });

after(async () => {
  await browser?.close();
  await stack?.stop();
});

async function newIphoneContext() {
  const context = await browser.newContext({
    userAgent: IPHONE_UA,
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 3,
  });
  const outside = [];
  const signals = [];
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1') return route.continue();
    if (url.protocol === 'data:' || url.protocol === 'blob:') return route.continue();
    // Le SDK d'authentification tente de charger son script d'aide chez Google (apis.google.com/js/api.js) :
    // il est bloqué ici et toléré, c'est un script, pas un échange de données. Tout le reste fait échouer le test.
    // Même chose pour l'iframe d'aide du SDK, qui vise le « authDomain » factice du bac à sable (localhost).
    const authHelperScript = url.hostname === 'apis.google.com' && url.pathname === '/js/api.js';
    const authHelperFrame = url.hostname === 'localhost' && url.pathname.startsWith('/__/auth/');
    if (!authHelperScript && !authHelperFrame) outside.push(route.request().url());
    return route.abort();
  });
  context.on('request', (req) => {
    const m = req.url().match(/\/api\/telemetry\/client-(boot|invite)$/);
    if (!m) return;
    // WebKit n'expose pas le corps des balises (sendBeacon) : on compte les envois ici,
    // et le contenu exact est vérifié plus bas, dans la base, après l'arrêt du serveur.
    signals.push({ kind: m[1] });
  });
  return { context, outside, signals };
}

function hostCreatesTable(baseUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(baseUrl.replace('http', 'ws') + '/ws');
    const seen = [];
    const timer = setTimeout(() => reject(new Error(`Hôte : pas de code de table reçu. Messages vus : ${seen.join(', ')}`)), 20000);
    let playerId = '';
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      seen.push(msg.type);
      if (msg.type === 'SESSION_READY') {
        playerId = msg.playerId;
        ws.send(
          JSON.stringify({
            type: 'CREATE_ROOM',
            playerId,
            playerName: 'HoteTest',
            settings: {
              fillWithBots: false,
              maxPlayers: 4,
              baseBet: 100,
              initialCapital: 1000,
              enableDoubleKora: false,
              enableUnder21: false,
              isPublic: false,
            },
          })
        );
        return;
      }
      const code = msg.room?.id;
      if (code && /^[A-Z0-9]{4,8}$/.test(code)) {
        clearTimeout(timer);
        resolve({ code, ws });
      }
    });
    ws.on('error', reject);
  });
}

describe('parcours sur moteur Safari (WebKit, iPhone)', () => {
  it("ouverture : l'accueil s'affiche et les signaux de démarrage partent", async () => {
    const { context, outside, signals } = await newIphoneContext();
    try {
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      await page.goto(stack.baseUrl + '/', { waitUntil: 'domcontentloaded' });
      await page.locator('#home-screen').waitFor({ state: 'visible', timeout: 30000 });
      assert.equal(await page.locator('#splash-error').count(), 0, "l'écran d'erreur de démarrage est apparu");
      await page.waitForTimeout(1500); // laisse partir les signaux envoyés en arrière-plan
      const boot = signals.filter((s) => s.kind === 'boot').length;
      assert.ok(boot >= 2, `deux signaux de démarrage attendus (start, home), ${boot} vu(s)`);
      assert.deepEqual(errors, [], `erreurs JavaScript non gérées : ${errors.join(' | ')}`);
      assert.deepEqual(outside, [], `appels sortis vers l'extérieur : ${outside.join(', ')}`);
    } finally {
      await context.close();
    }
  });

  it("invitation : le lien ouvre la carte, l'invité rejoint la table, les signaux de mesure partent", async () => {
    const host = await hostCreatesTable(stack.baseUrl);
    const { context, outside, signals } = await newIphoneContext();
    try {
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      await page.goto(`${stack.baseUrl}/?join=${host.code}`, { waitUntil: 'domcontentloaded' });
      await page.getByRole('dialog', { name: 'Rejoindre une table' }).waitFor({ state: 'visible', timeout: 30000 });
      await page.locator('#btn-arrival-join').waitFor({ state: 'visible', timeout: 15000 });
      await page.getByRole('dialog').locator('input[type="text"]').fill('InviteTest');
      await page.locator('#btn-arrival-join').click();
      // Le joueur arrive à la table : la carte disparaît et le salon d'attente est là.
      await page.getByRole('dialog', { name: 'Rejoindre une table' }).waitFor({ state: 'detached', timeout: 20000 });
      await page.locator('#btn-leave-lobby-bottom, #btn-toggle-ready').first().waitFor({ state: 'visible', timeout: 30000 });
      await page.waitForTimeout(1500);
      const invite = signals.filter((s) => s.kind === 'invite').length;
      assert.ok(invite >= 4, `quatre signaux d'invitation attendus (opened, card, click, joined), ${invite} vu(s)`);
      assert.deepEqual(errors, [], `erreurs JavaScript non gérées : ${errors.join(' | ')}`);
      assert.deepEqual(outside, [], `appels sortis vers l'extérieur : ${outside.join(', ')}`);
    } finally {
      host.ws.close();
      await context.close();
    }
  });
});

// --- Lecture de la base de l'émulateur (jeton « owner » : contourne les règles, comme le serveur) ---
function decode(v) {
  if (v === undefined || v === null) return undefined;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('mapValue' in v) return Object.fromEntries(Object.entries(v.mapValue.fields ?? {}).map(([k, x]) => [k, decode(x)]));
  if ('arrayValue' in v) return (v.arrayValue.values ?? []).map(decode);
  return undefined;
}

async function readCollection(name) {
  const url = `http://127.0.0.1:${stack.emulatorPort}/v1/projects/demo-njambo/databases/(default)/documents/${name}`;
  const res = await fetch(url, { headers: { Authorization: 'Bearer owner' } });
  assert.equal(res.status, 200, `lecture de ${name} impossible (${res.status})`);
  const json = await res.json();
  return (json.documents ?? []).map((d) => decode({ mapValue: { fields: d.fields ?? {} } }));
}

describe('mesure enregistrée côté serveur', () => {
  it("après l'arrêt du serveur, la base contient les étapes de démarrage et d'invitation, sans donnée personnelle", async () => {
    await stack.stopServer(); // l'arrêt gracieux vide les compteurs en mémoire dans Firestore
    const bootDays = await readCollection('client_boot_stats');
    const inviteDays = await readCollection('client_invite_stats');
    assert.ok(bootDays.length >= 1, 'aucun jour de démarrage enregistré');
    assert.ok(inviteDays.length >= 1, "aucun jour d'invitation enregistré");

    const families = bootDays.flatMap((d) => Object.values(d.families ?? {}));
    assert.ok(
      families.some((f) => f.device === 'iPhone' && f.started >= 1 && f.home >= 1),
      `famille iPhone avec démarrage et accueil absente : ${JSON.stringify(families)}`
    );

    const groups = inviteDays.flatMap((d) => Object.values(d.rows ?? {}));
    const total = {};
    for (const g of groups) for (const [k, n] of Object.entries(g.counts ?? {})) total[k] = (total[k] ?? 0) + n;
    for (const k of ['opened', 'card_OPEN', 'click', 'joined']) {
      assert.ok((total[k] ?? 0) >= 1, `compteur « ${k} » absent : ${JSON.stringify(total)}`);
    }
    assert.ok(!Object.keys(total).some((k) => k.startsWith('fail_')), `un échec a été compté : ${JSON.stringify(total)}`);

    // Anonymat : ni pseudo ni code de table dans ce qui a été écrit.
    const dump = JSON.stringify([bootDays, inviteDays]);
    for (const secret of ['InviteTest', 'HoteTest']) assert.ok(!dump.includes(secret), `donnée personnelle retrouvée : ${secret}`);
  });
});
