/**
 * PWA Diagnostic Script for Njambo Kora & Njambo Copilote
 * Validates manifest configuration, active manifest link, scope isolation and Service Worker status.
 */

export interface PwaDiagnosticReport {
  timestamp: string;
  currentUrl: string;
  expectedIdentity: 'GAME' | 'COPILOT';
  activeManifestHref: string | null;
  isManifestMatching: boolean;
  manifestData?: any;
  serviceWorkerStatus: string;
  isStandalone: boolean;
  isolationValid: boolean;
}

export async function runPwaDiagnostic(silent = false): Promise<PwaDiagnosticReport> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return {
      timestamp: new Date().toISOString(),
      currentUrl: '',
      expectedIdentity: 'GAME',
      activeManifestHref: null,
      isManifestMatching: false,
      serviceWorkerStatus: 'N/A (SSR)',
      isStandalone: false,
      isolationValid: false,
    };
  }

  const path = window.location.pathname.toLowerCase();
  const search = window.location.search.toLowerCase();
  const hash = window.location.hash.toLowerCase();

  const isCopilotExpected =
    path.startsWith('/katika') ||
    path.startsWith('/copilot') ||
    search.includes('copilot') ||
    search.includes('katika') ||
    hash.includes('copilot') ||
    hash.includes('katika') ||
    search.includes('view=copilot');

  const expectedIdentity: 'GAME' | 'COPILOT' = isCopilotExpected ? 'COPILOT' : 'GAME';
  const expectedManifest = isCopilotExpected
    ? '/manifest-copilot.webmanifest'
    : '/manifest.webmanifest';

  const manifestElement = document.querySelector('link[rel="manifest"]') as HTMLLinkElement | null;
  const activeManifestHref = manifestElement ? (manifestElement.getAttribute('href') || manifestElement.href) : null;
  const isManifestMatching =
    activeManifestHref === expectedManifest ||
    (activeManifestHref ? activeManifestHref.endsWith(expectedManifest) : false);

  let manifestData: any = null;
  let fetchError: string | null = null;

  // Resolve target manifest URL to an absolute root path
  const targetUrl = activeManifestHref || expectedManifest;
  const fetchUrl = targetUrl.startsWith('http') || targetUrl.startsWith('/')
    ? targetUrl
    : '/' + targetUrl;

  try {
    const res = await fetch(fetchUrl, { cache: 'no-cache' });
    if (res.ok) {
      const text = await res.text();
      if (text.trim().startsWith('<')) {
        // Fallback: the server returned an HTML fallback (SPA route) instead of the manifest file.
        if (fetchUrl !== expectedManifest) {
          const fallbackRes = await fetch(expectedManifest, { cache: 'no-cache' });
          if (fallbackRes.ok) {
            const fallbackText = await fallbackRes.text();
            if (!fallbackText.trim().startsWith('<')) {
              manifestData = JSON.parse(fallbackText);
            } else {
              fetchError = `Le serveur a renvoyé du contenu HTML au lieu du JSON pour ${expectedManifest}`;
            }
          } else {
            fetchError = `HTTP ${fallbackRes.status}: ${fallbackRes.statusText}`;
          }
        } else {
          fetchError = `Le serveur a renvoyé du contenu HTML au lieu du JSON pour ${fetchUrl}`;
        }
      } else {
        manifestData = JSON.parse(text);
      }
    } else {
      fetchError = `HTTP ${res.status}: ${res.statusText}`;
    }
  } catch (err: any) {
    fetchError = err?.message || 'Failed to fetch manifest';
  }

  // Service worker check
  let swStatus = 'Non supporté';
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration) {
        swStatus = `Actif (Scope: ${registration.scope}, État: ${registration.active ? 'installé & actif' : 'en attente'})`;
      } else {
        swStatus = 'Non enregistré';
      }
    } catch (e: any) {
      swStatus = `Erreur SW: ${e?.message}`;
    }
  }

  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true;

  // Check isolation validity
  const isolationValid =
    manifestData &&
    ((expectedIdentity === 'COPILOT' &&
      manifestData.scope === '/copilot/' &&
      manifestData.id === '/copilot/' &&
      manifestData.start_url === '/copilot/') ||
      (expectedIdentity === 'GAME' &&
        (manifestData.scope === '/game/' || manifestData.scope === '/') &&
        (manifestData.id === '/game/' || manifestData.id === '/njambo-game-pwa') &&
        (manifestData.start_url === '/game/' || manifestData.start_url === '/')));

  const report: PwaDiagnosticReport = {
    timestamp: new Date().toLocaleTimeString(),
    currentUrl: window.location.href,
    expectedIdentity,
    activeManifestHref,
    isManifestMatching,
    manifestData,
    serviceWorkerStatus: swStatus,
    isStandalone,
    isolationValid: Boolean(isolationValid),
  };

  if (!silent) {
    const brandColor = expectedIdentity === 'COPILOT' ? '#f59e0b' : '#10b981';
    const brandTitle = expectedIdentity === 'COPILOT' ? '🤖 NJAMBO COPILOTE' : '🃏 NJAMBO KORA (JEU)';

    console.group(
      `%c[PWA DIAGNOSTIC] ${brandTitle} • ${isManifestMatching ? '✅ MANIFEST VALIDE' : '⚠️ MISMATCH'}`,
      `background: #0f172a; color: ${brandColor}; font-weight: bold; padding: 4px 8px; border-radius: 4px; border: 1px solid ${brandColor};`
    );

    console.log(`📍 URL courante       : %c${window.location.href}`, 'color: #38bdf8; font-weight: bold;');
    console.log(`🎯 Identité attendue  : %c${expectedIdentity}`, `color: ${brandColor}; font-weight: bold;`);
    console.log(
      `📄 Manifest actif     : %c${activeManifestHref || 'AUCUN'} ${isManifestMatching ? '✅ (Conforme)' : '❌ (Erreur)'}`,
      isManifestMatching ? 'color: #4ade80; font-weight: bold;' : 'color: #f87171; font-weight: bold;'
    );

    if (manifestData) {
      console.table({
        "Nom de l'application": manifestData.name,
        "Nom court": manifestData.short_name,
        "ID Unique (WebAPK)": manifestData.id,
        "Périmètre (Scope)": manifestData.scope,
        "URL de démarrage": manifestData.start_url,
        "Mode d'affichage": manifestData.display,
        "Icônes définies": manifestData.icons?.length || 0,
      });

      if (isolationValid) {
        console.log(
          '%c🔒 ISOLATION WEBPAPK CONFIRMÉE : Le scope et l’ID sont isolés pour éviter le conflit d’installation Android.',
          'color: #4ade80; font-weight: bold;'
        );
      } else {
        console.warn(
          '⚠️ ATTENTION : Le scope ou l’ID du manifeste ne correspond pas aux règles d’isolation attendues !',
          manifestData
        );
      }
    } else if (fetchError) {
      console.error(`❌ Impossible de charger le fichier manifeste : ${fetchError}`);
    }

    console.log(`⚙️ Service Worker     : ${swStatus}`);
    console.log(`📱 Mode Standalone    : ${isStandalone ? 'Oui (PWA lancée en app)' : 'Non (Navigateur classique)'}`);
    console.log(
      '%c💡 Astuce : Vous pouvez relancer ce test à tout moment en tapant `diagnosePwa()` dans la console.',
      'color: #94a3b8; font-style: italic;'
    );
    console.groupEnd();
  }

  return report;
}

// Attach to window for instant access from DevTools
if (typeof window !== 'undefined') {
  (window as any).diagnosePwa = () => runPwaDiagnostic(false);
}
