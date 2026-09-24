import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import '@fontsource/anton';
import App from './App.tsx';
import { ErrorBoundary } from './components/common/ErrorBoundary.tsx';
import { NotificationProvider } from './components/common/NotificationCenter.tsx';
import './index.css';
import { initPublicConfig } from './services/publicConfig';

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
  void initPublicConfig();
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
        // Check for service worker updates periodically
        setInterval(() => {
          reg.update().catch(() => {});
        }, 60000);

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
