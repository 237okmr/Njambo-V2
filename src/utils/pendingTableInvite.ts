/**
 * Invitations à envoyer dès que la table fraîchement créée apparaît (bouton « comme la dernière fois »).
 * Vit en dehors des composants : la table Kora Cash se crée dans un écran, la salle s'affiche dans un autre.
 */
let pending: string[] | null = null;

export function setPendingTableInvite(ids: string[]): void {
  pending = ids.slice();
}

export function clearPendingTableInvite(): void {
  pending = null;
}

/** Retourne les invités en attente et les oublie : une seule consommation. */
export function takePendingTableInvite(): string[] | null {
  const out = pending;
  pending = null;
  return out;
}
