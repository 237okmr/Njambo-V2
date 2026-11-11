/**
 * Rendez-vous : règles pures (aucun réseau, aucune écriture, aucun délai : l'heure courante est fournie par l'appelant).
 *
 * Un rendez-vous propose une partie à une heure précise, à des amis choisis et, si l'organisateur le veut, aux joueurs
 * qui ont activé les alertes. Il est étiqueté Gratuit ou Cash, sans mise ni débit. À l'heure dite, personne n'est
 * placé nulle part : un rappel est envoyé, chacun ouvre sa table lui-même.
 */

import type { SearchMode } from './searchCallsRules';

/** Une table accueille 4 joueurs au plus : l'organisateur et trois réponses « oui ». Règle du jeu, pas un délai. */
export const MAX_YES_ANSWERS = 3;

export type AppointmentAnswer = 'YES' | 'NO';

export interface AppointmentParticipant {
  userId: string;
  displayName: string;
  avatarId: string;
}

export interface Appointment {
  id: string;
  organizerId: string;
  organizerName: string;
  organizerAvatar: string;
  mode: SearchMode;
  startsAt: number;
  createdAt: number;
  /** Amis invités nommément. */
  invitedIds: string[];
  /** Visible aussi des joueurs qui ont activé les alertes. */
  openToAlerts: boolean;
  yes: AppointmentParticipant[];
  no: string[];
  preReminderSent: boolean;
  startReminderSent: boolean;
}

export function normalizeAnswer(raw: unknown): AppointmentAnswer | null {
  return raw === 'YES' || raw === 'NO' ? raw : null;
}

export type CreateRefusal = 'TIME_INVALID' | 'TIME_TOO_SOON' | 'TIME_TOO_FAR' | 'TOO_MANY_ACTIVE' | 'NO_AUDIENCE' | 'TOO_MANY_INVITEES';

export interface ValidateCreateInput {
  nowMs: number;
  startsAt: unknown;
  /** Délai minimal avant l'heure proposée, en ms. */
  minLeadMs: number;
  /** Horizon maximal, en ms. */
  horizonMs: number;
  organizerId: string;
  requestedInvitees: unknown;
  friendIds: ReadonlySet<string>;
  openToAlerts: boolean;
  /** Rendez-vous à venir déjà proposés par cet organisateur. */
  activeCount: number;
  maxActive: number;
  maxInvitees: number;
}

export type ValidateCreateResult = { ok: true; startsAt: number; invitedIds: string[] } | { ok: false; reason: CreateRefusal };

export function validateNewAppointment(input: ValidateCreateInput): ValidateCreateResult {
  const startsAt = typeof input.startsAt === 'number' && Number.isFinite(input.startsAt) ? Math.floor(input.startsAt) : NaN;
  if (!Number.isFinite(startsAt)) return { ok: false, reason: 'TIME_INVALID' };
  if (startsAt < input.nowMs + input.minLeadMs) return { ok: false, reason: 'TIME_TOO_SOON' };
  if (startsAt > input.nowMs + input.horizonMs) return { ok: false, reason: 'TIME_TOO_FAR' };
  if (input.activeCount >= input.maxActive) return { ok: false, reason: 'TOO_MANY_ACTIVE' };

  const requested = Array.isArray(input.requestedInvitees) ? input.requestedInvitees : [];
  const invitedIds: string[] = [];
  for (const raw of requested) {
    if (typeof raw !== 'string' || raw === input.organizerId || !input.friendIds.has(raw) || invitedIds.includes(raw)) continue;
    invitedIds.push(raw);
  }
  if (invitedIds.length > input.maxInvitees) return { ok: false, reason: 'TOO_MANY_INVITEES' };
  if (invitedIds.length === 0 && !input.openToAlerts) return { ok: false, reason: 'NO_AUDIENCE' };
  return { ok: true, startsAt, invitedIds };
}

/** Un rendez-vous disparaît une fois l'heure dépassée de la durée de grâce. */
export function isAppointmentOver(a: Pick<Appointment, 'startsAt'>, nowMs: number, graceMs: number): boolean {
  return a.startsAt + graceMs <= nowMs;
}

/** Réponse « oui » ou « non » : une par joueur, modifiable. Renvoie null si la table serait complète ou si rien ne change. */
export function applyAnswer(a: Appointment, participant: AppointmentParticipant, answer: AppointmentAnswer): Appointment | null {
  if (participant.userId === a.organizerId) return null;
  const alreadyYes = a.yes.some((p) => p.userId === participant.userId);
  const alreadyNo = a.no.includes(participant.userId);
  if (answer === 'YES') {
    if (alreadyYes) return null;
    if (a.yes.length >= MAX_YES_ANSWERS) return null;
    return { ...a, yes: [...a.yes, participant], no: a.no.filter((id) => id !== participant.userId) };
  }
  if (alreadyNo && !alreadyYes) return null;
  return { ...a, yes: a.yes.filter((p) => p.userId !== participant.userId), no: alreadyNo ? a.no : [...a.no, participant.userId] };
}

export interface DueReminder {
  id: string;
  kind: 'PRE' | 'START';
}

/**
 * Rappels à envoyer maintenant. « Avant l'heure » dans la fenêtre [heure − délai, heure[ ; « c'est l'heure » dès l'heure passée.
 * Un rappel « avant » devenu sans objet (l'heure est passée) n'est pas envoyé, mais il est marqué par l'appelant.
 */
export function dueReminders(list: Iterable<Appointment>, nowMs: number, leadMs: number): DueReminder[] {
  const due: DueReminder[] = [];
  for (const a of list) {
    if (!a.preReminderSent && nowMs >= a.startsAt - leadMs && nowMs < a.startsAt) due.push({ id: a.id, kind: 'PRE' });
    if (!a.startReminderSent && nowMs >= a.startsAt) due.push({ id: a.id, kind: 'START' });
  }
  return due;
}

export interface AppointmentView {
  id: string;
  organizerId: string;
  organizerName: string;
  organizerAvatar: string;
  mode: SearchMode;
  startsAt: number;
  isMine: boolean;
  myAnswer: AppointmentAnswer | null;
  yes: AppointmentParticipant[];
  full: boolean;
}

export interface BuildViewsInput {
  viewerId: string;
  appointments: Iterable<Appointment>;
  nowMs: number;
  graceMs: number;
  /** Le joueur reçoit-il les rendez-vous ouverts d'inconnus (alertes activées) ? */
  strangerAllowed: boolean;
  canSeeMode: (mode: SearchMode) => boolean;
  isBlocked: (otherId: string) => boolean;
  limit: number;
}

/** Rendez-vous visibles par un joueur : les siens, ceux où il est invité, les ouverts s'il a activé les alertes. Du plus proche au plus lointain. */
export function buildAppointmentViews(input: BuildViewsInput): AppointmentView[] {
  const rows: AppointmentView[] = [];
  for (const a of input.appointments) {
    if (isAppointmentOver(a, input.nowMs, input.graceMs)) continue;
    const isMine = a.organizerId === input.viewerId;
    if (!isMine) {
      const invited = a.invitedIds.includes(input.viewerId);
      const open = a.openToAlerts && input.strangerAllowed;
      if (!invited && !open) continue;
      if (!input.canSeeMode(a.mode) || input.isBlocked(a.organizerId)) continue;
    }
    rows.push({
      id: a.id,
      organizerId: a.organizerId,
      organizerName: a.organizerName,
      organizerAvatar: a.organizerAvatar,
      mode: a.mode,
      startsAt: a.startsAt,
      isMine,
      myAnswer: a.yes.some((p) => p.userId === input.viewerId) ? 'YES' : a.no.includes(input.viewerId) ? 'NO' : null,
      yes: a.yes,
      full: a.yes.length >= MAX_YES_ANSWERS,
    });
  }
  rows.sort((x, y) => x.startsAt - y.startsAt || x.id.localeCompare(y.id));
  return rows.slice(0, Math.max(0, Math.floor(input.limit)));
}

export function refusalMessage(reason: CreateRefusal): string {
  switch (reason) {
    case 'TIME_INVALID':
      return 'L\'heure du rendez-vous n\'est pas valable.';
    case 'TIME_TOO_SOON':
      return 'Ce rendez-vous est trop proche. Choisis une heure un peu plus tard.';
    case 'TIME_TOO_FAR':
      return 'Ce rendez-vous est trop lointain. Choisis une heure plus proche.';
    case 'TOO_MANY_ACTIVE':
      return 'Tu as déjà assez de rendez-vous à venir. Annule-en un ou attends qu\'il ait lieu.';
    case 'NO_AUDIENCE':
      return 'Choisis au moins un ami, ou ouvre le rendez-vous aux joueurs qui ont activé les alertes.';
    case 'TOO_MANY_INVITEES':
      return 'Tu as invité trop d\'amis pour un seul rendez-vous.';
  }
}

/** « dans 25 min », « dans 2 h », « dans 1 h 30 » : durée restante, arrondie à la minute supérieure. */
export function describeDelay(ms: number): string {
  const minutes = Math.max(1, Math.ceil(ms / 60000));
  if (minutes < 60) return `dans ${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `dans ${h} h` : `dans ${h} h ${String(m).padStart(2, '0')}`;
}
