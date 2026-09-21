import { runPwaDiagnostic } from './pwaDiagnostic';

/**
 * PWA Manifest & App Identity Switcher
 * Allows 'Njambo Kora' (the game) and 'Njambo Copilote' (the admin AI assistant)
 * to coexist on mobile and desktop as two distinct, installable PWA applications.
 */

export function syncPwaIdentityFromLocation() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const path = window.location.pathname.toLowerCase();
  const search = window.location.search.toLowerCase();
  const hash = window.location.hash.toLowerCase();

  const isCopilotOrKatika =
    path.startsWith('/katika') ||
    path.startsWith('/copilot') ||
    search.includes('copilot') ||
    search.includes('katika') ||
    hash.includes('copilot') ||
    hash.includes('katika') ||
    search.includes('view=copilot');

  setPwaIdentity(isCopilotOrKatika ? 'COPILOT' : 'GAME');
}

export function setPwaIdentity(mode: 'GAME' | 'COPILOT') {
  if (typeof document === 'undefined') return;

  const isCopilot = mode === 'COPILOT';
  const manifestHref = isCopilot ? '/manifest-copilot.webmanifest' : '/manifest.webmanifest';
  const appTitle = isCopilot ? 'Njambo Copilote' : 'Njambo Kora';
  const iconHref = isCopilot ? '/icon-copilot-192.png' : '/apple-touch-icon.png';

  // If in Copilot mode and on query param like /?view=copilot, normalize to /copilot/ for WebAPK scope matching
  if (isCopilot && typeof window !== 'undefined') {
    const currentPath = window.location.pathname;
    if (!currentPath.startsWith('/copilot') && !currentPath.startsWith('/katika')) {
      try {
        window.history.replaceState(null, '', '/copilot/' + window.location.search + window.location.hash);
      } catch (e) {
        // ignore
      }
    }
  } else if (!isCopilot && typeof window !== 'undefined') {
    const currentPath = window.location.pathname;
    if (currentPath === '/' || currentPath === '') {
      try {
        window.history.replaceState(null, '', '/game/' + window.location.search + window.location.hash);
      } catch (e) {
        // ignore
      }
    }
  }

  // 1. Title
  document.title = isCopilot
    ? 'Njambo Copilote - IA & Cockpit'
    : 'Njambo Kora - Jeu de Cartes Traditionnel';

  // 2. Manifest Link
  let manifestLink = document.querySelector('link[rel="manifest"]') as HTMLLinkElement | null;
  if (manifestLink) {
    if (manifestLink.getAttribute('href') !== manifestHref) {
      manifestLink.setAttribute('href', manifestHref);
      manifestLink.href = manifestHref;
    }
  } else {
    manifestLink = document.createElement('link');
    manifestLink.rel = 'manifest';
    manifestLink.setAttribute('href', manifestHref);
    manifestLink.href = manifestHref;
    document.head.appendChild(manifestLink);
  }

  // 3. Apple & Android application name tags
  const appleTitleMeta = document.querySelector('meta[name="apple-mobile-web-app-title"]');
  if (appleTitleMeta) {
    appleTitleMeta.setAttribute('content', appTitle);
  }

  const appNameMeta = document.querySelector('meta[name="application-name"]');
  if (appNameMeta) {
    appNameMeta.setAttribute('content', appTitle);
  }

  // 4. Icons
  const appleTouchIcon = document.querySelector('link[rel="apple-touch-icon"]');
  if (appleTouchIcon) {
    appleTouchIcon.setAttribute('href', iconHref);
  }

  const faviconLink = document.querySelector('link[rel="icon"]');
  if (faviconLink) {
    faviconLink.setAttribute('href', isCopilot ? '/icon-copilot-192.svg' : '/favicon.svg');
  }

  // Trigger diagnostic output in console asynchronously so manifest is readable
  setTimeout(() => {
    runPwaDiagnostic(false).catch(() => {});
  }, 100);
}
