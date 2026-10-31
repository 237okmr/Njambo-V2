/**
 * Kora Cash — correction des soldes fictifs de démo (règles pures : aucun accès base de données, aucun secret, aucun délai).
 * Avant le paiement Mobile Money de test, la démo créditait des dépôts « simulés » (fictifs). Ces montants se sont mélangés
 * aux vrais essais Campay. La correction retire, joueur par joueur, la somme des dépôts simulés confirmés, sans jamais
 * dépasser le solde disponible, par une ligne « ajustement » au registre (rien n'est effacé).
 */

export interface DemoWalletSnapshot {
  uid: string;
  available: number;
}

export interface SimulatedDepositSummary {
  uid: string;
  amount: number;
}

export interface DemoCleanupLine {
  uid: string;
  /** Somme des dépôts simulés confirmés de ce joueur. */
  simulatedTotal: number;
  /** Solde disponible actuel du portefeuille de démo. */
  available: number;
  /** Montant retiré : jamais plus que la somme simulée, jamais plus que le solde disponible. */
  deduction: number;
}

export const DEMO_CLEANUP_NOTE = 'Retrait des dépôts fictifs de démo (le dépôt simulé est supprimé).';

/** Clé d'idempotence de la correction d'un joueur : une seule correction par joueur, quoi qu'il arrive. */
export function demoCleanupRef(uid: string): string {
  return `demo-clean-${uid}`;
}

export function planDemoCleanup(wallets: DemoWalletSnapshot[], simulated: SimulatedDepositSummary[]): DemoCleanupLine[] {
  const totals = new Map<string, number>();
  for (const dep of simulated) {
    if (!dep || typeof dep.uid !== 'string' || dep.uid === '') continue;
    if (!Number.isSafeInteger(dep.amount) || dep.amount <= 0) continue;
    totals.set(dep.uid, (totals.get(dep.uid) ?? 0) + dep.amount);
  }
  const availableByUid = new Map<string, number>();
  for (const w of wallets) {
    if (w && typeof w.uid === 'string' && Number.isSafeInteger(w.available)) availableByUid.set(w.uid, w.available);
  }
  const lines: DemoCleanupLine[] = [];
  for (const [uid, simulatedTotal] of totals) {
    const available = availableByUid.get(uid) ?? 0;
    const deduction = Math.min(simulatedTotal, Math.max(0, available));
    if (deduction > 0) lines.push({ uid, simulatedTotal, available, deduction });
  }
  return lines.sort((a, b) => a.uid.localeCompare(b.uid));
}

export function totalDeduction(lines: DemoCleanupLine[]): number {
  return lines.reduce((sum, l) => sum + l.deduction, 0);
}
