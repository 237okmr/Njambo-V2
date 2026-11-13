import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLinkPreview, injectLinkPreview, requestOrigin } from './linkPreviewRules';
import { buildFreeTablePreview } from './tablePreview';

const O = 'https://njambo.example';

test('lien gratuit : aperçu générique avec le code, sans hôte', () => {
  const p = buildLinkPreview({ join: 'k8t4' }, O)!;
  assert.equal(p.kind, 'free');
  assert.match(p.description, /K8T4/);
  assert.equal(p.image, `${O}/og-preview.jpg`);
});

test('lien Cash : générique, sans mise ni gain, mention 18 ans', () => {
  const p = buildLinkPreview({ cash: 'abcd' }, O)!;
  assert.equal(p.kind, 'cash');
  assert.match(p.description, /18 ans/);
  assert.doesNotMatch(p.title + p.description, /FCFA|gagn|commission|\d{3,}/i);
});

test('autres liens et codes invalides : pas d\'aperçu de table', () => {
  assert.equal(buildLinkPreview({}, O), null);
  assert.equal(buildLinkPreview({ join: '<>!' }, O), null);
  assert.equal(buildLinkPreview({ join: 'AB' }, O), null);
});

test('injection : remplace les balises og, échappe, garde le reste', () => {
  const html = '<html><head><title>T</title><meta property="og:title" content="Njambo Kora" />\n<meta name="twitter:card" content="x" /></head><body>x</body></html>';
  const p = { ...buildLinkPreview({ join: 'ABCD' }, O)!, title: 'a "b" <c>' };
  const out = injectLinkPreview(html, p);
  assert.equal((out.match(/property="og:title"/g) || []).length, 1);
  assert.match(out, /a &quot;b&quot; &lt;c&gt;/);
  assert.match(out, /<title>T<\/title>/);
  assert.match(out, /og:image/);
});

test('requestOrigin nettoie l\'hôte', () => {
  assert.equal(requestOrigin({ host: 'a.cm', 'x-forwarded-proto': 'https' }, 'http'), 'https://a.cm');
  assert.equal(requestOrigin({ host: 'a.cm"><x' }, 'https'), 'https://a.cmx');
});

test('carte d\'arrivée : états', () => {
  const room: any = { id: 'ABCD', status: 'LOBBY', hostName: 'Ama<b>', maxPlayers: 3, players: [{}, {}] };
  assert.deepEqual(buildFreeTablePreview(room), { state: 'OPEN', hostName: 'Amab', seated: 2, capacity: 3 });
  assert.equal(buildFreeTablePreview({ ...room, players: [{}, {}, {}] }).state, 'FULL');
  assert.equal(buildFreeTablePreview({ ...room, status: 'PLAYING' }).state, 'STARTED');
  assert.equal(buildFreeTablePreview({ ...room, cash: {} }).state, 'UNAVAILABLE');
  assert.equal(buildFreeTablePreview(undefined).state, 'UNAVAILABLE');
});
