import { useState, useEffect, useRef, useCallback } from 'react';
import { APP_BUILD_ID, APP_VERSION } from '../version';

interface RemoteVersionInfo {
  version: string;
  buildId: string;
}

export function useAutoUpdate(isGameActive: boolean = false) {
  const [updateAvailable, setUpdateAvailable] = useState<boolean>(false);
  const [isReloading, setIsReloading] = useState<boolean>(false);
  const [remoteVersion, setRemoteVersion] = useState<string | null>(null);
  const isCheckingRef = useRef<boolean>(false);
  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const checkForUpdate = useCallback(async () => {
    if (isCheckingRef.current) return;
    isCheckingRef.current = true;

    try {
      // Add cache buster query parameter to bypass browser/proxy cache
      const response = await fetch(`/version.json?t=${Date.now()}`, {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
        },
      });

      if (response.ok) {
        const data: RemoteVersionInfo = await response.json();
        
        // Compare the remote buildId with our bundled local buildId
        if (data && data.buildId && data.buildId !== APP_BUILD_ID) {
          setUpdateAvailable(true);
          setRemoteVersion(data.version || data.buildId);
        } else {
          // Both versions are identical -> no update needed!
          setUpdateAvailable(false);
        }
      }
    } catch (err) {
      // Offline or network glitch - ignore
    } finally {
      isCheckingRef.current = false;
    }
  }, []);

  // Check periodically every 60 seconds, deferred by 3s on mount to prioritize instant UI rendering
  useEffect(() => {
    const initialTimer = setTimeout(() => {
      checkForUpdate();
    }, 3000);

    checkIntervalRef.current = setInterval(() => {
      checkForUpdate();
    }, 60000);

    return () => {
      clearTimeout(initialTimer);
      if (checkIntervalRef.current) clearInterval(checkIntervalRef.current);
    };
  }, [checkForUpdate]);

  // Check when user brings app back into foreground
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        checkForUpdate();
      }
    };

    window.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleVisibility);

    return () => {
      window.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleVisibility);
    };
  }, [checkForUpdate]);

  // Clean up cache-buster parameter from URL on mount if present
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.search.includes('_v=')) {
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete('_v');
        const searchStr = url.searchParams.toString();
        const cleanUrl = url.pathname + (searchStr ? `?${searchStr}` : '') + url.hash;
        window.history.replaceState({}, '', cleanUrl);
      } catch {
        // Ignore URL clean failure
      }
    }
  }, []);

  // Handle update status and prevent automatic disruptive reloads
  // Instead of auto-reloading immediately, we let the user click the update banner when ready.
  // If they are in a game, they can finish it, then click update.
  useEffect(() => {
    if (updateAvailable) {
      console.log('[AutoUpdate] Une mise à jour est prête. L\'utilisateur sera invité à l\'appliquer via le bandeau.');
    }
  }, [updateAvailable]);

  const forceReload = useCallback(async (forceImmediate: boolean = false) => {
    if (isGameActive && !forceImmediate) {
      console.log('[AutoUpdate] Partie en cours : rechargement PWA différé');
      setUpdateAvailable(true);
      return;
    }

    setIsReloading(true);

    let isReloadingTriggered = false;
    const triggerReload = () => {
      if (isReloadingTriggered) return;
      isReloadingTriggered = true;
      console.log('[AutoUpdate] Nouveau Service Worker actif, rechargement de la page...');
      try {
        const targetUrl = new URL(window.location.href);
        targetUrl.searchParams.set('_v', Date.now().toString());
        window.location.replace(targetUrl.toString());
      } catch {
        window.location.reload();
      }
    };

    try {
      // 1. First, clear all browser cache storages to purge any stale assets BEFORE triggering reload
      if (typeof window !== 'undefined' && 'caches' in window) {
        try {
          const cacheKeys = await caches.keys();
          await Promise.all(cacheKeys.map((key) => caches.delete(key)));
          console.log('[AutoUpdate] Cache vidé avec succès.');
        } catch (cacheErr) {
          console.warn('[AutoUpdate] Erreur lors du vidage du cache:', cacheErr);
        }
      }

      // 2. Register controllerchange listener for atomic service worker activation
      if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          triggerReload();
        });

        const registrations = await navigator.serviceWorker.getRegistrations();

        for (const reg of registrations) {
          if (reg.waiting) {
            reg.waiting.postMessage({ type: 'SKIP_WAITING' });
          } else {
            await reg.update().catch(() => {});
            if (reg.waiting) {
              reg.waiting.postMessage({ type: 'SKIP_WAITING' });
            }
          }
        }

        // Fallback: If no controllerchange triggers within 1.5 seconds, reload anyway
        setTimeout(() => {
          triggerReload();
        }, 1500);
      } else {
        triggerReload();
      }
    } catch (e) {
      console.warn('[AutoUpdate] Unexpected error during force reload:', e);
      triggerReload();
    }
  }, [isGameActive]);

  return {
    updateAvailable,
    isReloading,
    currentVersion: APP_VERSION,
    remoteVersion,
    checkForUpdate,
    forceReload,
  };
}
