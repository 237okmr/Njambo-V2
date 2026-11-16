/**
 * Relais de la connexion Firebase sur le domaine du jeu (/__/auth/* et /__/firebase/*).
 * Pourquoi : sur Safari, la connexion par redirection échoue quand le domaine de connexion (authDomain) n'est pas celui du jeu,
 * car le navigateur isole le stockage entre les deux domaines. Le serveur relaie donc, en lecture seule, les pages d'aide de Firebase.
 *
 * Fonctions pures : le réseau est injecté (fetchImpl), ce qui permet de tout tester sans Internet.
 * Rien d'autre que le dossier d'aide de Firebase n'est relayé, vers un seul hôte fixe, en GET/HEAD seulement, sans cookie.
 */

export const RELAY_PATH_PREFIXES = ['/__/auth/', '/__/firebase/'] as const;
/** Taille maximale d'une réponse relayée (les pages d'aide de Firebase pèsent quelques dizaines de ko). */
export const RELAY_MAX_BYTES = 2_000_000;
/** En-têtes de la réponse amont repris tels quels. Tout le reste (dont set-cookie) est écarté. */
const RESPONSE_HEADER_ALLOWLIST = [
  'content-type',
  'cache-control',
  'etag',
  'last-modified',
  'content-language',
  'content-security-policy',
  'x-frame-options',
  'referrer-policy',
  'cross-origin-opener-policy',
] as const;
const REQUEST_HEADER_ALLOWLIST = ['accept', 'accept-language', 'user-agent'] as const;
const ACCEPTED_UPSTREAM_STATUS = [200, 304, 404];

export interface RelayRequest {
  method: string;
  /** Chemin sans la chaîne de requête, tel que reçu (ex. « /__/auth/handler »). */
  path: string;
  /** Chaîne de requête brute, avec le « ? » initial, ou chaîne vide. */
  search: string;
  headers: Record<string, string | string[] | undefined>;
}

export interface RelayResponse {
  status: number;
  headers: Record<string, string>;
  body: Buffer;
}

export type RelayFetch = (url: string, init: { method: string; headers: Record<string, string>; redirect: 'manual'; signal: AbortSignal }) => Promise<{
  status: number;
  headers: { get(name: string): string | null; forEach(cb: (value: string, key: string) => void): void };
  arrayBuffer(): Promise<ArrayBuffer>;
}>;

/** Hôte amont fixe, tiré de l'identifiant du projet : jamais d'une donnée envoyée par le client. */
export function upstreamHost(projectId: string): string | null {
  return /^[a-z0-9-]{3,60}$/.test(projectId) ? `${projectId}.firebaseapp.com` : null;
}

/** Vrai si le chemin est un fichier d'aide relayable : préfixe permis, aucun « .. », aucun caractère inattendu. */
export function isRelayablePath(path: string): boolean {
  if (typeof path !== 'string' || path.length > 200) return false;
  if (!RELAY_PATH_PREFIXES.some((p) => path.startsWith(p))) return false;
  if (path.includes('..') || path.includes('//') || path.includes('\\')) return false;
  return /^[A-Za-z0-9_\-./]+$/.test(path);
}

function pickHeaders(headers: RelayRequest['headers']): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of REQUEST_HEADER_ALLOWLIST) {
    const v = headers[name];
    const value = Array.isArray(v) ? v[0] : v;
    if (typeof value === 'string' && value) out[name] = value.slice(0, 400);
  }
  return out;
}

const bad = (status: number): RelayResponse => ({ status, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' }, body: Buffer.from(status === 404 ? 'Introuvable' : 'Relais indisponible') });

/**
 * Relaie une requête vers l'hôte Firebase du projet.
 * 404 : relais fermé ou chemin hors du dossier d'aide. 405 : méthode autre que GET/HEAD. 502 : amont muet, redirigé, trop gros ou en erreur.
 */
export async function relayAuthRequest(
  req: RelayRequest,
  opts: { enabled: boolean; projectId: string; timeoutMs: number; fetchImpl: RelayFetch }
): Promise<RelayResponse> {
  if (!opts.enabled) return bad(404);
  if (req.method !== 'GET' && req.method !== 'HEAD') return bad(405);
  if (!isRelayablePath(req.path)) return bad(404);
  const host = upstreamHost(opts.projectId);
  if (!host) return bad(502);
  const search = req.search.length <= 1000 && /^(\?[^\s#]*)?$/.test(req.search) ? req.search : '';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1, opts.timeoutMs));
  try {
    const upstream = await opts.fetchImpl(`https://${host}${req.path}${search}`, {
      method: req.method,
      headers: pickHeaders(req.headers),
      redirect: 'manual',
      signal: controller.signal,
    });
    if (!ACCEPTED_UPSTREAM_STATUS.includes(upstream.status)) return bad(502);
    const buf = Buffer.from(await upstream.arrayBuffer());
    if (buf.length > RELAY_MAX_BYTES) return bad(502);
    const headers: Record<string, string> = {};
    for (const name of RESPONSE_HEADER_ALLOWLIST) {
      const v = upstream.headers.get(name);
      if (v) headers[name] = v;
    }
    return { status: upstream.status, headers, body: req.method === 'HEAD' ? Buffer.alloc(0) : buf };
  } catch {
    return bad(502);
  } finally {
    clearTimeout(timer);
  }
}
