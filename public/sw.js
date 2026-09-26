// Njambo Kora & Njambo Copilote Dual PWA Service Worker - v25200 (Network-First Navigation & Isolated Caches)
const CACHE_GAME = 'njambo-kora-assets-v25374';
const CACHE_COPILOT = 'katika-copilot-assets-v25374';

const GAME_ASSETS = [
  '/',
  '/game/',
  '/index.html',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-512.png',
  '/badge-96.png'
];

const COPILOT_ASSETS = [
  '/copilot/',
  '/manifest-copilot.webmanifest',
  '/icon-copilot-192.png',
  '/icon-copilot-512.png',
  '/icon-copilot-maskable-512.png'
];

function getCacheNameForRequest(request) {
  try {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/copilot/') || url.pathname.includes('manifest-copilot') || url.pathname.includes('icon-copilot')) {
      return CACHE_COPILOT;
    }
  } catch (e) {
    // Fallback to default game cache on parse failure
  }
  return CACHE_GAME;
}

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    Promise.all([
      caches.open(CACHE_GAME).then((cache) => {
        return cache.addAll(GAME_ASSETS).catch((err) => {
          console.warn('Game cache addAll error:', err);
        });
      }),
      caches.open(CACHE_COPILOT).then((cache) => {
        return cache.addAll(COPILOT_ASSETS).catch((err) => {
          console.warn('Copilot cache addAll error:', err);
        });
      })
    ])
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_GAME && key !== CACHE_COPILOT) {
            console.log('[ServiceWorker] Removing old cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;
  
  let url;
  try {
    url = new URL(event.request.url);
  } catch (e) {
    return; // Skip invalid URLs
  }

  // Bypass Firebase / Firestore / Google APIs / Auth / WebSocket / Version endpoint / Vite Dev Server
  if (
    url.hostname.includes('firestore') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('identitytoolkit') ||
    url.pathname.startsWith('/api/') ||
    url.pathname.endsWith('version.json') ||
    url.pathname.endsWith('.webmanifest') ||
    url.pathname.endsWith('manifest.json') ||
    url.pathname.includes('manifest') ||
    url.pathname.startsWith('/src/') ||
    url.pathname.startsWith('/@') ||
    url.pathname.startsWith('/node_modules/') ||
    url.pathname.includes('vite') ||
    url.search.includes('v=') ||
    url.search.includes('t=') ||
    url.protocol === 'ws:' ||
    url.protocol === 'wss:'
  ) {
    return;
  }

  const targetCacheName = getCacheNameForRequest(event.request);

  // Network-First for HTML navigation: ensures fresh updates load in 1 click when online, with offline fallback
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const copy = networkResponse.clone();
            caches.open(targetCacheName).then((cache) => {
              cache.put(event.request, copy);
            });
          }
          return networkResponse;
        })
        .catch(async () => {
          const cachedResponse = await caches.match(event.request, { cacheName: targetCacheName }) || 
                                 await caches.match('/', { cacheName: CACHE_GAME });
          return cachedResponse || new Response('Hors ligne', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          });
        })
    );
    return;
  }

  // Stale-While-Revalidate for local assets (JS, CSS, SVGs, Fonts)
  if (url.origin === location.origin) {
    event.respondWith(
      caches.match(event.request, { cacheName: targetCacheName }).then((cachedResponse) => {
        const fetchPromise = fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
              const responseToCache = networkResponse.clone();
              caches.open(targetCacheName).then((cache) => {
                cache.put(event.request, responseToCache);
              });
            }
            return networkResponse;
          })
          .catch(() => {
            return cachedResponse || new Response('Fichier indisponible hors ligne', { status: 503 });
          });

        return cachedResponse || fetchPromise;
      })
    );
    return;
  }

  // Network-first for external fonts/styles with cache fallback
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(targetCacheName).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(async () => {
        const cached = await caches.match(event.request, { cacheName: targetCacheName });
        return cached || new Response('Réseau indisponible', { status: 503 });
      })
  );
});

// ==========================================
// Web Push Notifications & Background Alerts
// ==========================================
// IMPORTANT : le service worker est enregistré à la racine (scope "/") mais les deux PWA
// (Njambo Kora et Njambo Copilote) ont un scope manifeste plus étroit ("/game/" et "/copilot/").
// Toute URL ouverte depuis une notification DOIT rester dans l'un de ces deux scopes, sinon
// Chrome Android ouvre un onglet navigateur au lieu de l'application installée (WebAPK).
const PWA_SCOPES = ['/game/', '/copilot/'];
const DEFAULT_SCOPE = '/game/';

function scopeForData(data) {
  return data && data.app === 'copilot' ? '/copilot/' : DEFAULT_SCOPE;
}

function resolveTargetUrl(data) {
  const origin = self.location.origin;
  const fallbackScope = scopeForData(data);
  let url;
  try {
    url = new URL((data && data.url) || fallbackScope, origin);
  } catch (e) {
    url = new URL(fallbackScope, origin);
  }
  if (url.origin !== origin) url = new URL(fallbackScope, origin);

  // Anciennes charges utiles ("/?join=ABCD", "/") : on les ramène dans le scope de la PWA.
  if (!PWA_SCOPES.some((scope) => url.pathname.startsWith(scope))) {
    url = new URL(fallbackScope + url.search + url.hash, origin);
  }
  if (data && data.roomCode && data.type !== 'FORFEIT_DECLARED' && !url.searchParams.has('join') && url.pathname.startsWith('/game/')) {
    url.searchParams.set('join', data.roomCode);
  }
  // Invitation : l'identifiant et l'expéditeur voyagent dans l'URL pour que l'app, si elle était fermée,
  // puisse répondre « accepté » et que l'invitant reçoive son retour.
  if (data && data.type === 'INVITATION' && data.inviteId && url.pathname.startsWith('/game/')) {
    if (!url.searchParams.has('inv')) url.searchParams.set('inv', data.inviteId);
    if (data.fromUserId && !url.searchParams.has('inviter')) url.searchParams.set('inviter', data.fromUserId);
  }
  return url;
}

function isClientInScope(client, scopePath) {
  try {
    const u = new URL(client.url);
    return u.origin === self.location.origin && u.pathname.startsWith(scopePath);
  } catch (e) {
    return false;
  }
}

async function getWindowClients(scopePath) {
  const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  return all.filter((c) => isClientInScope(c, scopePath));
}

// Safari / WebKit (iPhone, iPad, Mac) révoque l'abonnement push si une notification reçue n'est pas
// affichée. Sur ces navigateurs on affiche donc TOUJOURS la notification (en silence puis fermeture
// rapide si l'app est déjà visible). Chrome/Edge/Firefox autorisent, eux, de ne rien afficher.
function isWebKitBrowser() {
  const ua = (self.navigator && self.navigator.userAgent) || '';
  return /AppleWebKit/.test(ua) && !/Chrome\/|Chromium|Edg\/|OPR\/|Android/.test(ua);
}

// Niveaux de priorité : critique (table en danger), actionnable, système.
const CRITICAL_TYPES = ['DISCONNECTED', 'FORFEIT_WARNING', 'FORFEIT_DECLARED'];

function actionsFor(type, data) {
  if (!data.roomCode || type === 'FORFEIT_DECLARED') return [];
  return [
    { action: 'join', title: type === 'INVITATION' ? 'Rejoindre' : 'Reprendre la partie' },
    { action: 'dismiss', title: 'Plus tard' },
  ];
}

self.addEventListener('push', (event) => {
  let payload = {
    title: '🃏 Njambo Kora',
    body: 'Nouvelle notification de jeu !',
    icon: '/icon-192.png',
    badge: '/badge-96.png',
    tag: 'njambo-notification',
    data: {},
  };

  if (event.data) {
    try {
      payload = { ...payload, ...event.data.json() };
    } catch (e) {
      payload.body = event.data.text() || payload.body;
    }
  }

  const data = payload.data || {};
  const type = data.type || 'SYSTEM';
  const critical = CRITICAL_TYPES.includes(type);

  event.waitUntil((async () => {
    // App déjà visible : l'interface en jeu s'en charge, pas de doublon système.
    // Le message de test (SYSTEM) est toujours affiché.
    let appVisible = false;
    if (type !== 'SYSTEM') {
      const clients = await getWindowClients(scopeForData(data));
      const visibleClient = clients.find((c) => c.visibilityState === 'visible');
      if (visibleClient) {
        appVisible = true;
        visibleClient.postMessage({ type: 'PUSH_RECEIVED_FOREGROUND', data });
        if (!isWebKitBrowser()) return; // Chrome & co : rien à afficher
      }
    }

    const options = {
      body: payload.body,
      icon: payload.icon || '/icon-192.png',
      badge: payload.badge || '/badge-96.png',
      tag: payload.tag || 'njambo-game-alert',
      data,
      timestamp: data.sentAt || Date.now(),
      // Discret par défaut ; motif plus marqué uniquement pour les alertes critiques.
      vibrate: critical ? [200, 100, 200, 100, 200] : [120, 60, 120],
      renotify: true,
      requireInteraction: critical,
      silent: appVisible,
      actions: actionsFor(type, data),
    };

    const tasks = [self.registration.showNotification(payload.title, options)];
    if ('setAppBadge' in self.navigator) {
      const count = Number(data.badgeCount);
      tasks.push(
        (count > 0 ? self.navigator.setAppBadge(count) : self.navigator.setAppBadge()).catch(() => {})
      );
    }
    await Promise.all(tasks);

    // WebKit + app visible : la notification n'a servi qu'à satisfaire la règle d'affichage.
    if (appVisible) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      const shown = await self.registration.getNotifications({ tag: options.tag });
      shown.forEach((n) => n.close());
    }
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if ('clearAppBadge' in self.navigator) {
    self.navigator.clearAppBadge().catch(() => {});
  }
  if (event.action === 'dismiss') return;

  const data = event.notification.data || {};
  const target = resolveTargetUrl(data);
  const scopePath = target.pathname.startsWith('/copilot/') ? '/copilot/' : '/game/';

  event.waitUntil((async () => {
    const clients = await getWindowClients(scopePath);
    const client =
      clients.find((c) => c.focused) ||
      clients.find((c) => c.visibilityState === 'visible') ||
      clients[0];

    if (client) {
      // Fenêtre déjà ouverte : on la ramène au premier plan et on lui transmet l'action.
      // AUCUNE navigation forcée (client.navigate) : pas de rechargement, pas de sortie de scope,
      // et pas de double connexion à la table (l'app traite le message une seule fois).
      client.postMessage({ type: 'PUSH_NOTIFICATION_CLICKED', data, url: target.href });
      try {
        await client.focus();
        return;
      } catch (e) {
        // focus() refusé : on retombe sur openWindow ci-dessous.
      }
    }

    // App fermée : URL dans le scope => Chrome l'ouvre dans la PWA installée (WebAPK).
    if (self.clients.openWindow) {
      await self.clients.openWindow(target.href);
    }
  })());
});

// Le navigateur a renouvelé ou invalidé l'abonnement : on prévient les fenêtres ouvertes
// pour qu'elles se réabonnent et resynchronisent le serveur (sans nouvelle demande de permission).
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    all.forEach((c) => c.postMessage({ type: 'PUSH_SUBSCRIPTION_CHANGED' }));
  })());
});
