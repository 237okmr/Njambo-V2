/**
 * Rendez-vous : stockage Firestore (écrit et lu par le serveur seulement, jamais par un joueur).
 * Une lecture bornée à la première utilisation après un démarrage ; une écriture par création, réponse, rappel ou annulation.
 */

import { getFirebaseAdminAppDb } from '../firebaseAdmin';
import { recordServerReads } from '../katika/readBudget';
import type { Appointment } from './appointmentsRules';

export const APPOINTMENTS_COLLECTION = 'social_appointments';

export interface AppointmentsRuntime {
  /** Rendez-vous dont l'heure est postérieure à `minStartsAt`, du plus proche au plus lointain, plafonnés. */
  loadUpcoming: (minStartsAt: number, limit: number) => Promise<Appointment[]>;
  save: (appointment: Appointment) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

function strArray(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : [];
}

/** Relit un document sans lui faire confiance : un champ absent ou mal formé est remplacé par une valeur sûre. */
export function normalizeStoredAppointment(id: string, raw: unknown): Appointment | null {
  const d = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
  if (!d || typeof d.organizerId !== 'string' || typeof d.startsAt !== 'number' || !Number.isFinite(d.startsAt)) return null;
  const yes = Array.isArray(d.yes)
    ? d.yes
        .filter((p): p is Record<string, unknown> => !!p && typeof p === 'object' && typeof (p as Record<string, unknown>).userId === 'string')
        .map((p) => ({ userId: String(p.userId), displayName: typeof p.displayName === 'string' ? p.displayName : 'Joueur', avatarId: typeof p.avatarId === 'string' ? p.avatarId : 'default' }))
    : [];
  return {
    id,
    organizerId: d.organizerId,
    organizerName: typeof d.organizerName === 'string' ? d.organizerName : 'Joueur',
    organizerAvatar: typeof d.organizerAvatar === 'string' ? d.organizerAvatar : 'default',
    mode: d.mode === 'CASH' ? 'CASH' : 'FREE',
    startsAt: d.startsAt,
    createdAt: typeof d.createdAt === 'number' ? d.createdAt : d.startsAt,
    invitedIds: strArray(d.invitedIds),
    openToAlerts: d.openToAlerts === true,
    yes,
    no: strArray(d.no),
    preReminderSent: d.preReminderSent === true,
    startReminderSent: d.startReminderSent === true,
  };
}

export const firestoreAppointments: AppointmentsRuntime = {
  async loadUpcoming(minStartsAt, limit) {
    const snap = await getFirebaseAdminAppDb()
      .collection(APPOINTMENTS_COLLECTION)
      .where('startsAt', '>', minStartsAt)
      .orderBy('startsAt')
      .limit(limit)
      .get();
    recordServerReads(snap.size || 1);
    const out: Appointment[] = [];
    snap.forEach((d) => {
      const a = normalizeStoredAppointment(d.id, d.data());
      if (a) out.push(a);
    });
    return out;
  },
  async save(a) {
    await getFirebaseAdminAppDb().collection(APPOINTMENTS_COLLECTION).doc(a.id).set(a);
  },
  async remove(id) {
    await getFirebaseAdminAppDb().collection(APPOINTMENTS_COLLECTION).doc(id).delete();
  },
};
