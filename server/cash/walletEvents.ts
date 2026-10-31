/**
 * Kora Cash — signal « le solde d'un joueur a changé ».
 * Le registre des mouvements (walletLedger) émet ce signal après chaque mouvement réellement appliqué ; le serveur
 * temps réel s'y abonne pour prévenir le téléphone du joueur. Le signal ne contient jamais de montant :
 * le téléphone relit son solde par l'API sécurisée. Aucun délai, aucun secret.
 */

export type WalletChangeListener = (uid: string) => void;

let listener: WalletChangeListener | null = null;

export function setWalletChangeListener(next: WalletChangeListener | null): void {
  listener = next;
}

export function emitWalletChanged(uid: string): void {
  if (!listener) return;
  try {
    listener(uid);
  } catch (err) {
    console.warn('[KoraCash] Signal de changement de solde non transmis.', err instanceof Error ? err.message : String(err));
  }
}
