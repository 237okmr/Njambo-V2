/**
 * Mesure des lectures Firestore du téléphone. Remplace getDoc, getDocs et onSnapshot : même comportement, mais chaque lecture
 * facturée est comptée en mémoire sous le type de document lu. Le total est déclaré au serveur en une seule fois quand
 * l'application passe en arrière-plan ou se ferme (aucune minuterie, aucune requête supplémentaire pendant le jeu).
 * Aucune donnée personnelle n'est envoyée : seulement des types de document et des nombres.
 */

import {
  getDoc as firestoreGetDoc,
  getDocs as firestoreGetDocs,
  onSnapshot as firestoreOnSnapshot,
} from 'firebase/firestore';
import { billedReads, labelForFirestoreTarget } from './firestoreMeterRules';

const REPORT_URL = '/api/telemetry/client-reads';
const pending = new Map<string, number>();

function addReads(label: string, count: number): void {
  if (count < 1) return;
  pending.set(label, (pending.get(label) ?? 0) + count);
}

/** Déclare au serveur les lectures comptées depuis la dernière déclaration. Silencieux en cas d'échec : le diagnostic ne gêne jamais le jeu. */
export function flushClientReads(): void {
  if (pending.size === 0) return;
  const reads: Record<string, number> = {};
  pending.forEach((n, label) => {
    reads[label] = n;
  });
  pending.clear();
  try {
    const body = JSON.stringify({ reads });
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      if (navigator.sendBeacon(REPORT_URL, new Blob([body], { type: 'application/json' }))) return;
    }
    void fetch(REPORT_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => undefined);
  } catch {
    // ignoré
  }
}

if (typeof document !== 'undefined' && typeof window !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushClientReads();
  });
  window.addEventListener('pagehide', () => flushClientReads());
}

export const getDoc: typeof firestoreGetDoc = (async (ref: any) => {
  const snap = await firestoreGetDoc(ref);
  addReads(labelForFirestoreTarget(ref), billedReads(1, Boolean(snap.metadata?.fromCache)));
  return snap;
}) as any;

export const getDocs: typeof firestoreGetDocs = (async (query: any) => {
  const snap = await firestoreGetDocs(query);
  addReads(labelForFirestoreTarget(query), billedReads(snap.size, Boolean(snap.metadata?.fromCache)));
  return snap;
}) as any;

export const onSnapshot: typeof firestoreOnSnapshot = ((...args: any[]) => {
  const label = `live:${labelForFirestoreTarget(args[0])}`;
  const count = (snap: any) => {
    const changes = typeof snap?.docChanges === 'function' ? snap.docChanges().length : 1;
    addReads(label, billedReads(changes, Boolean(snap?.metadata?.fromCache)));
  };
  const wrapped = args.map((arg, i) => {
    if (i === 0) return arg;
    if (typeof arg === 'function' && i === args.findIndex((a, j) => j > 0 && typeof a === 'function')) {
      return (snap: any) => {
        count(snap);
        return arg(snap);
      };
    }
    if (arg && typeof arg === 'object' && typeof arg.next === 'function') {
      return {
        ...arg,
        next: (snap: any) => {
          count(snap);
          return arg.next(snap);
        },
      };
    }
    return arg;
  });
  return (firestoreOnSnapshot as any)(...wrapped);
}) as any;
