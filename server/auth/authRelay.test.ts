import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isRelayablePath, relayAuthRequest, upstreamHost, RELAY_MAX_BYTES, type RelayFetch } from './authRelayRules';

type Call = { url: string; init: Parameters<RelayFetch>[1] };

function fakeFetch(status: number, body: string, headers: Record<string, string> = {}, calls: Call[] = []): RelayFetch {
  return async (url, init) => {
    calls.push({ url, init });
    const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
    return {
      status,
      headers: { get: (n: string) => lower[n.toLowerCase()] ?? null, forEach: (cb: (v: string, k: string) => void) => Object.entries(lower).forEach(([k, v]) => cb(v, k)) },
      arrayBuffer: async () => new TextEncoder().encode(body).buffer as ArrayBuffer,
    };
  };
}

const base = { projectId: 'demo-projet', timeoutMs: 1000 };
const get = (path: string, search = '', headers: Record<string, string> = {}) => ({ method: 'GET', path, search, headers });

describe('relais de connexion : chemins et hôte', () => {
  it('accepte seulement les dossiers d\'aide de Firebase', () => {
    assert.equal(isRelayablePath('/__/auth/handler'), true);
    assert.equal(isRelayablePath('/__/auth/iframe.js'), true);
    assert.equal(isRelayablePath('/__/firebase/init.json'), true);
    assert.equal(isRelayablePath('/__/other/x'), false);
    assert.equal(isRelayablePath('/api/katika/users'), false);
    assert.equal(isRelayablePath('/__/auth/../../etc/passwd'), false);
    assert.equal(isRelayablePath('/__/auth//evil.example'), false);
    assert.equal(isRelayablePath('/__/auth/a b'), false);
    assert.equal(isRelayablePath('/__/auth/' + 'a'.repeat(300)), false);
  });

  it('l\'hôte amont vient du projet, jamais de la requête', () => {
    assert.equal(upstreamHost('demo-projet'), 'demo-projet.firebaseapp.com');
    assert.equal(upstreamHost('evil.example.com/x'), null);
    assert.equal(upstreamHost(''), null);
  });
});

describe('relais de connexion : comportement', () => {
  it('est fermé (404) tant que le réglage est fermé, sans toucher au réseau', async () => {
    const calls: Call[] = [];
    const r = await relayAuthRequest(get('/__/auth/handler'), { ...base, enabled: false, fetchImpl: fakeFetch(200, 'x', {}, calls) });
    assert.equal(r.status, 404);
    assert.equal(calls.length, 0);
  });

  it('relaie un GET vers l\'hôte fixe, avec la chaîne de requête, sans cookie', async () => {
    const calls: Call[] = [];
    const r = await relayAuthRequest(
      get('/__/auth/handler', '?apiKey=abc&mode=signIn', { cookie: 'secret=1', authorization: 'Bearer x', accept: 'text/html', 'user-agent': 'UA' }),
      { ...base, enabled: true, fetchImpl: fakeFetch(200, '<html>ok</html>', { 'Content-Type': 'text/html', 'Set-Cookie': 'a=b', 'Cache-Control': 'no-cache' }, calls) }
    );
    assert.equal(r.status, 200);
    assert.equal(r.body.toString(), '<html>ok</html>');
    assert.equal(calls[0].url, 'https://demo-projet.firebaseapp.com/__/auth/handler?apiKey=abc&mode=signIn');
    assert.equal(calls[0].init.redirect, 'manual');
    assert.deepEqual(Object.keys(calls[0].init.headers).sort(), ['accept', 'user-agent']);
    assert.equal(r.headers['content-type'], 'text/html');
    assert.equal(r.headers['cache-control'], 'no-cache');
    assert.equal('set-cookie' in r.headers, false);
  });

  it('refuse les méthodes autres que GET et HEAD', async () => {
    const r = await relayAuthRequest({ method: 'POST', path: '/__/auth/handler', search: '', headers: {} }, { ...base, enabled: true, fetchImpl: fakeFetch(200, 'x') });
    assert.equal(r.status, 405);
  });

  it('HEAD ne renvoie pas de corps', async () => {
    const r = await relayAuthRequest({ method: 'HEAD', path: '/__/firebase/init.json', search: '', headers: {} }, { ...base, enabled: true, fetchImpl: fakeFetch(200, '{"a":1}') });
    assert.equal(r.status, 200);
    assert.equal(r.body.length, 0);
  });

  it('ignore une chaîne de requête suspecte au lieu de la relayer', async () => {
    const calls: Call[] = [];
    await relayAuthRequest(get('/__/auth/handler', '?a=b c'), { ...base, enabled: true, fetchImpl: fakeFetch(200, 'x', {}, calls) });
    assert.equal(calls[0].url, 'https://demo-projet.firebaseapp.com/__/auth/handler');
  });

  it('502 quand l\'amont redirige, plante ou répond une erreur', async () => {
    assert.equal((await relayAuthRequest(get('/__/auth/handler'), { ...base, enabled: true, fetchImpl: fakeFetch(302, '', { location: 'https://evil.example' }) })).status, 502);
    assert.equal((await relayAuthRequest(get('/__/auth/handler'), { ...base, enabled: true, fetchImpl: fakeFetch(500, 'oops') })).status, 502);
    assert.equal((await relayAuthRequest(get('/__/auth/handler'), { ...base, enabled: true, fetchImpl: async () => { throw new Error('réseau'); } })).status, 502);
  });

  it('502 quand la réponse est trop grosse', async () => {
    const r = await relayAuthRequest(get('/__/auth/handler'), { ...base, enabled: true, fetchImpl: fakeFetch(200, 'x'.repeat(RELAY_MAX_BYTES + 1)) });
    assert.equal(r.status, 502);
  });

  it('abandonne quand l\'amont ne répond pas dans le délai', async () => {
    const slow: RelayFetch = (_url, init) => new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(new Error('abandon'))));
    const r = await relayAuthRequest(get('/__/auth/handler'), { projectId: 'demo-projet', timeoutMs: 20, enabled: true, fetchImpl: slow });
    assert.equal(r.status, 502);
  });

  it('passe un 404 amont tel quel', async () => {
    const r = await relayAuthRequest(get('/__/auth/nope'), { ...base, enabled: true, fetchImpl: fakeFetch(404, 'non') });
    assert.equal(r.status, 404);
  });
});
