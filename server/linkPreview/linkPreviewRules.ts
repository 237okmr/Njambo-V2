/**
 * Aperçu d'un lien de table (WhatsApp, Telegram, Facebook…) : fonctions pures, sans réseau.
 *
 * Les robots n'exécutent pas le JavaScript : c'est le serveur qui écrit les balises de la page.
 * L'aperçu est volontairement générique : il ne lit jamais la table. WhatsApp garde un aperçu en cache
 * pendant des jours, une table, elle, change d'état en minutes ; et aucun code ne doit révéler qui est l'hôte.
 * Kora Cash : ni mise, ni commission, ni promesse de gain dans l'aperçu. Tout cela se montre à l'arrivée.
 */

export interface LinkPreview {
  kind: 'free' | 'cash';
  title: string;
  description: string;
  url: string;
  image: string;
}

const CODE_RE = /^[A-Za-z0-9]{3,8}$/;

function firstString(v: unknown): string | null {
  if (typeof v === 'string') return v;
  if (Array.isArray(v) && typeof v[0] === 'string') return v[0];
  return null;
}

function cleanCode(raw: string | null): string | null {
  if (!raw) return null;
  const c = raw.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return CODE_RE.test(c) ? c : null;
}

/** `origin` : adresse publique du site, sans barre finale (ex. https://exemple.cm). */
export function buildLinkPreview(query: Record<string, unknown>, origin: string): LinkPreview | null {
  const cashCode = cleanCode(firstString(query.cash));
  const freeCode = cleanCode(firstString(query.join)) ?? cleanCode(firstString(query.room));
  const image = `${origin}/og-preview.jpg`;
  if (cashCode) {
    return {
      kind: 'cash',
      title: `Table Kora Cash ${cashCode} · Njambo Kora`,
      description: 'Table Kora Cash : argent réel, réservé aux 18 ans et plus. Les détails s’affichent à l’ouverture du lien.',
      url: `${origin}/game/?cash=${cashCode}`,
      image,
    };
  }
  if (freeCode) {
    return {
      kind: 'free',
      title: `Une table t’attend · Njambo Kora`,
      description: `Rejoins la partie de kora en un geste. Code de la table : ${freeCode}.`,
      url: `${origin}/game/?join=${freeCode}`,
      image,
    };
  }
  return null;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Remplace les balises d'aperçu existantes de la page par celles de la table. */
export function injectLinkPreview(html: string, p: LinkPreview): string {
  const stripped = html
    .replace(/<meta\s+property="og:[^"]*"[^>]*>\s*/gi, '')
    .replace(/<meta\s+name="twitter:[^"]*"[^>]*>\s*/gi, '')
    .replace(/<meta\s+name="description"[^>]*>\s*/gi, '');
  const tags = [
    `<meta name="description" content="${esc(p.description)}" />`,
    `<meta property="og:site_name" content="Njambo Kora" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:title" content="${esc(p.title)}" />`,
    `<meta property="og:description" content="${esc(p.description)}" />`,
    `<meta property="og:url" content="${esc(p.url)}" />`,
    `<meta property="og:image" content="${esc(p.image)}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(p.title)}" />`,
    `<meta name="twitter:description" content="${esc(p.description)}" />`,
    `<meta name="twitter:image" content="${esc(p.image)}" />`,
  ].join('\n    ');
  if (/<\/head>/i.test(stripped)) return stripped.replace(/<\/head>/i, `    ${tags}\n  </head>`);
  return `${tags}\n${stripped}`;
}

/** Adresse publique de la requête : https en production, derrière le proxy. */
export function requestOrigin(headers: Record<string, unknown>, fallbackProtocol: string): string {
  const host = firstString(headers['x-forwarded-host']) || firstString(headers.host) || '';
  const proto = (firstString(headers['x-forwarded-proto']) || fallbackProtocol || 'https').split(',')[0].trim();
  const safeHost = host.split(',')[0].trim().replace(/[^A-Za-z0-9.:-]/g, '');
  const safeProto = proto === 'http' ? 'http' : 'https';
  return `${safeProto}://${safeHost}`;
}
