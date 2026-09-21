import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  initializeFirestore,
  memoryLocalCache
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

export const auth = getAuth(app);

// Use the designated Firestore Database ID if specified
const databaseId = firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== '(default)'
  ? firebaseConfig.firestoreDatabaseId
  : undefined;

// Use memoryLocalCache to prevent IndexedDB multi-tab lock contention and "Database is closing/hidden" errors in sandboxed iframes and background tabs
export const db = initializeFirestore(app, {
  localCache: memoryLocalCache(),
  experimentalForceLongPolling: true
}, databaseId);

// Gracefully handle iframe lifecycle and any transient database/IndexedDB closure events
if (typeof window !== 'undefined') {
  const isDbClosingError = (err: any) => {
    const msg = (err?.message || err?.reason?.message || String(err || '')).toLowerCase();
    return (
      msg.includes('database is closing') ||
      msg.includes('database is hidden') ||
      msg.includes('closing/hidden') ||
      msg.includes('connection is closing') ||
      msg.includes('the client is offline') ||
      msg.includes('indexeddb')
    );
  };

  window.addEventListener('unhandledrejection', (event) => {
    if (isDbClosingError(event.reason)) {
      console.warn('[Firebase] Handled transient database rejection:', event.reason);
      event.preventDefault();
      event.stopPropagation();
    }
  });

  window.addEventListener('error', (event) => {
    if (isDbClosingError(event.error || event.message)) {
      console.warn('[Firebase] Handled transient database error:', event.error || event.message);
      event.preventDefault();
      event.stopPropagation();
    }
  });
}

export default app;
