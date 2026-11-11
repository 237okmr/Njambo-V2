/**
 * « Je cherche une partie » : règles pures (aucun réseau, aucune écriture, aucun délai).
 *
 * Un appel est porté par un joueur Google, étiqueté Gratuit ou Cash, sans mise ni niveau. Il vit en mémoire du serveur
 * jusqu'à son échéance (horodatage fourni par l'appelant), et disparaît d'un arrêt, d'une partie lancée ou d'un départ.
 * Aucun appel ne crée de table et ne débite quoi que ce soit.
 */

export type SearchMode = 'FREE' | 'CASH';

export function normalizeSearchMode(raw: unknown): SearchMode | null {
  return raw === 'FREE' || raw === 'CASH' ? raw : null;
}

export interface SearchPartant {
  userId: string;
  displayName: string;
  avatarId: string;
}

export interface SearchCall {
  userId: string;
  displayName: string;
  avatarId: string;
  mode: SearchMode;
  startedAt: number;
  expiresAt: number;
  /** Joueurs qui ont répondu « partant ». */
  partants: SearchPartant[];
}

export function isCallLive(call: Pick<SearchCall, 'expiresAt'>, nowMs: number): boolean {
  return call.expiresAt > nowMs;
}

export interface CooldownResult {
  allowed: boolean;
  /** Attente restante en ms (0 si autorisé). */
  retryAfterMs: number;
}

/** Un joueur ne relance pas un appel avant le délai réglé, compté depuis le dernier envoi de notifications. */
export function checkSearchCooldown(lastNotifiedAt: number | undefined, nowMs: number, cooldownMs: number): CooldownResult {
  if (!lastNotifiedAt || cooldownMs <= 0) return { allowed: true, retryAfterMs: 0 };
  const elapsed = nowMs - lastNotifiedAt;
  if (elapsed >= cooldownMs) return { allowed: true, retryAfterMs: 0 };
  return { allowed: false, retryAfterMs: cooldownMs - elapsed };
}

export interface RecipientCandidate {
  userId: string;
  /** Statut courant : un joueur en pleine partie n'est pas dérangé. */
  status: 'AVAILABLE' | 'IN_SOLO' | 'IN_LOBBY' | 'IN_GAME';
  /** Connexion ouverte ou signal récent. */
  online: boolean;
  /** Réglages connus ; undefined = pas encore lus. */
  searchAlerts?: boolean;
  hidden?: boolean;
}

export interface SelectRecipientsInput {
  callerId: string;
  friendIds: ReadonlySet<string>;
  /** Joueurs actuellement connus du serveur (présence), amis ou non. */
  candidates: Iterable<RecipientCandidate>;
  /** Amis hors ligne : prévenus par notification seulement. */
  offlineFriendIds?: Iterable<string>;
  max: number;
}

export interface Recipient {
  userId: string;
  isFriend: boolean;
}

/**
 * Qui est prévenu : les amis confirmés (en ligne d'abord, puis hors ligne) puis les joueurs en ligne qui ont activé l'option
 * et ne se sont pas cachés. Jamais l'appelant, jamais un joueur en pleine partie. Le tout plafonné.
 */
export function selectRecipients(input: SelectRecipientsInput): Recipient[] {
  const max = Math.max(0, Math.floor(input.max));
  const out: Recipient[] = [];
  const seen = new Set<string>([input.callerId]);
  const push = (userId: string, isFriend: boolean) => {
    if (out.length >= max || seen.has(userId)) return;
    seen.add(userId);
    out.push({ userId, isFriend });
  };

  const list = [...input.candidates];
  for (const c of list) {
    if (input.friendIds.has(c.userId) && c.online && c.status !== 'IN_GAME') push(c.userId, true);
  }
  for (const id of input.offlineFriendIds ?? []) {
    if (input.friendIds.has(id) && !list.some((c) => c.userId === id && c.online)) push(id, true);
  }
  for (const c of list) {
    if (input.friendIds.has(c.userId)) continue;
    if (c.online && c.status !== 'IN_GAME' && c.searchAlerts === true && c.hidden !== true) push(c.userId, false);
  }
  return out;
}

/** Ajoute une réponse « partant » : une seule par joueur, plafonnée. Renvoie la nouvelle liste, ou null si rien ne change. */
export function addPartant(partants: readonly SearchPartant[], partant: SearchPartant, max: number): SearchPartant[] | null {
  if (partants.some((p) => p.userId === partant.userId)) return null;
  if (partants.length >= Math.max(0, Math.floor(max))) return null;
  return [...partants, partant];
}

export interface CallViewInput {
  viewerId: string;
  calls: Iterable<SearchCall>;
  nowMs: number;
  friendIds: ReadonlySet<string>;
  /** Le joueur (observateur) a-t-il le droit de voir ce mode ? (Cash : 18+ confirmé, accès ouvert.) */
  canSeeMode: (mode: SearchMode) => boolean;
  /** L'un des deux a-t-il bloqué l'autre ? */
  isBlocked: (callerId: string) => boolean;
  /** L'appelant est-il toujours disponible (connecté, pas en pleine partie) ? */
  isCallerAvailable: (callerId: string) => boolean;
  /** L'appelant est-il assis à une table gratuite en attente avec une place libre ? */
  canJoinCaller: (callerId: string) => boolean;
  /** Le viewer est-il autorisé à voir cet appelant s'il n'est pas ami (option activée côté viewer) ? */
  strangerAllowed: boolean;
  limit: number;
}

export interface SearchCallView {
  userId: string;
  displayName: string;
  avatarId: string;
  mode: SearchMode;
  expiresAt: number;
  isFriend: boolean;
  canJoin: boolean;
}

/** Appels visibles par un joueur, les amis d'abord, puis les plus récents. */
export function buildCallViews(input: CallViewInput): SearchCallView[] {
  const rows: Array<SearchCallView & { startedAt: number }> = [];
  for (const call of input.calls) {
    if (call.userId === input.viewerId || !isCallLive(call, input.nowMs)) continue;
    const isFriend = input.friendIds.has(call.userId);
    if (!isFriend && !input.strangerAllowed) continue;
    if (!input.canSeeMode(call.mode) || input.isBlocked(call.userId) || !input.isCallerAvailable(call.userId)) continue;
    rows.push({
      userId: call.userId,
      displayName: call.displayName,
      avatarId: call.avatarId,
      mode: call.mode,
      expiresAt: call.expiresAt,
      isFriend,
      canJoin: call.mode === 'FREE' && input.canJoinCaller(call.userId),
      startedAt: call.startedAt,
    });
  }
  rows.sort((a, b) => Number(b.isFriend) - Number(a.isFriend) || b.startedAt - a.startedAt || a.userId.localeCompare(b.userId));
  return rows.slice(0, Math.max(0, Math.floor(input.limit))).map(({ startedAt: _s, ...view }) => view);
}
