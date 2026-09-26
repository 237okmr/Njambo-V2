import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import '@fontsource/anton';
import App from './App.tsx';
import { ErrorBoundary } from './components/common/ErrorBoundary.tsx';
import { NotificationProvider } from './components/common/NotificationCenter.tsx';
import './index.css';
import { initPublicConfig, getPublicParamNumber } from './services/publicConfig';
import { initPerfMode, startJankSampling } from './services/perfMode';

// Wake up backend server without blocking
if (typeof window !== 'undefined') {
  try {
    fetch('/api/health', { cache: 'no-store' }).catch(() => {});
  } catch {
    // ignore
  }
}

// Config publique (délais réglables dans katika) : non bloquante, valeurs par défaut du registre en attendant
if (typeof window !== 'undefined') {
  initPublicConfig().then(() => {
    // Mode de performance : signaux du navigateur d'abord, détecteur de saccades ensuite (utile sur
    // iPhone, où deviceMemory/hardwareConcurrency/connection manquent souvent).
    initPerfMode();
    startJankSampling(getPublicParamNumber('jankSampleSeconds') * 1000, getPublicParamNumber('jankThresholdMs'));
  });
}

// Pause des animations CSS quand l'onglet est masqué (voir la règle html[data-app-hidden] dans index.css) :
// économise batterie et évite de faire chauffer le téléphone pour rien pendant que l'app est en arrière-plan.
if (typeof document !== 'undefined') {
  const applyHiddenAttr = () => {
    document.documentElement.setAttribute('data-app-hidden', document.hidden ? 'true' : 'false');
  };
  applyHiddenAttr();
  document.addEventListener('visibilitychange', applyHiddenAttr);
}

// Handle unhandled transient database closing or hidden events from iframe lifecycle
if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    const msg = (event.message || String(event.error?.message || '')).toLowerCase();
    if (msg.includes('database is closing') || msg.includes('database is hidden') || msg.includes('indexeddb')) {
      console.warn('[Global Error Handler] Suppressed transient IndexedDB closure error:', event.message);
      event.preventDefault();
      event.stopPropagation();
    }
  });

  window.addEventListener('unhandledrejection', (event) => {
    const msg = (event.reason?.message || String(event.reason || '')).toLowerCase();
    if (msg.includes('database is closing') || msg.includes('database is hidden') || msg.includes('indexeddb')) {
      console.warn('[Global UnhandledRejection] Suppressed transient IndexedDB closure rejection:', event.reason);
      event.preventDefault();
      event.stopPropagation();
    }
  });
}

// Register PWA service worker with immediate update check
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        // Un service worker plus récent était déjà en attente depuis une visite précédente (resté bloqué
        // faute d'avoir déclenché les bons événements) : on le fait passer en contrôle tout de suite. Le
        // rechargement de la page, lui, reste décidé par useAutoUpdate (src/hooks/useAutoUpdate.ts), qui
        // sait si une partie est en cours et ne recharge jamais au milieu d'une manche.
        if (reg.waiting) {
          reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        }

        // Check for service worker updates periodically (updateCheckIntervalSeconds, réglable dans katika)
        setInterval(() => {
          reg.update().catch(() => {});
        }, getPublicParamNumber('updateCheckIntervalSeconds') * 1000);

        // Check for updates when switching back to the tab/app
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') {
            reg.update().catch(() => {});
          }
        });
      })
      .catch((err) => {
        console.warn('Service worker registration error:', err);
      });
  });
}

const handleRootReset = (): void => {
  try {
    localStorage.removeItem('njambo_active_session_id');
    localStorage.removeItem('njambo_saved_manches');
    localStorage.removeItem('njambo_reconnect_token');
    localStorage.removeItem('njambo_active_room_code');
    console.log('[Root ErrorBoundary] Cleared session/connection keys from localStorage.');
  } catch (err) {
    console.error('[Root ErrorBoundary] Error clearing local storage:', err);
  }
  window.location.reload();
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary
      fallbackTitle="Oups ! Une erreur inattendue est survenue"
      fallbackMessage="L'application a rencontré un problème technique temporaire. Appuyez sur Réessayer pour réinitialiser votre session et recharger."
      onReset={handleRootReset}
    >
      <NotificationProvider>
        <App />
      </NotificationProvider>
    </ErrorBoundary>
  </StrictMode>,
);
