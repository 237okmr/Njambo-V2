/**
 * Kora Cash — livre de compte des tables Cash.
 *
 * Le capital affiché à la table vit en mémoire ; le registre le suit par écarts. Pour chaque siège, ce service retient
 * ce que le registre connaît déjà (ledgerCapital) et n'écrit que la différence avec le capital visé. Conséquences :
 *  - une écriture échouée n'est pas perdue : l'écart repart avec la suivante ;
 *  - la commission n'apparaît jamais comme un mouvement : c'est ce qui manque à la somme des écarts d'une partie ;
 *  - tout passe par une file par table : un résultat est toujours inscrit avant la sortie qui le suit.
 * Une table ne survit pas à un redémarrage (voir restoreRoomsAtBoot) : l'argent reste alors en table et Katika le rend.
 */

import type { ApplyMovementResult } from './walletLedger';
import { CashEnvironment, CashMovementInput } from './cashTypes';
import { cashTableRefs, seatDocId } from './cashTableRules';

export type CashSeatStatus = 'OPEN' | 'CLOSED';

export interface CashSeatDoc {
  id: string;
  tableId: string;
  uid: string;
  roomCode: string;
  betLevel: number;
  status: CashSeatStatus;
  buyInTotal: number;
  openedAt: number;
  closedAt?: number;
  paidOut?: number;
  closedBy?: string;
  note?: string;
}

export interface CashPartieDoc {
  id: string;
  tableId: string;
  resultId: string;
  rake: number;
  bet: number;
  createdAt: number;
}

export interface CashTableDeps {
  applyMovement: (input: CashMovementInput) => Promise<ApplyMovementResult>;
  openSeat: (doc: CashSeatDoc) => Promise<void>;
  addSeatBuyIn: (id: string, amount: number) => Promise<void>;
  closeSeat: (id: string, patch: Pick<CashSeatDoc, 'paidOut'> & Partial<Pick<CashSeatDoc, 'closedBy' | 'note'>>) => Promise<void>;
  getSeat: (id: string) => Promise<CashSeatDoc | null>;
  recordPartie: (doc: CashPartieDoc) => Promise<void>;
  /** Ce que le registre compte en table pour ce joueur sur cette table : la somme de ses écritures, seule vérité après une panne. */
  sumTableLocked: (uid: string, tableId: string, environment: CashEnvironment) => Promise<number>;
}

export class CashTableBook {
  private queues = new Map<string, Promise<unknown>>();
  private ledgerCapital = new Map<string, number>();
  private sequences = new Map<string, number>();

  constructor(private deps: CashTableDeps, private environment: CashEnvironment = 'DEMO') {}

  private serial<T>(tableId: string, task: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(tableId) ?? Promise.resolve();
    const run = previous.then(task, task);
    const settled = run.catch(() => undefined);
    this.queues.set(tableId, settled);
    void settled.then(() => {
      if (this.queues.get(tableId) === settled) this.queues.delete(tableId);
    });
    return run;
  }

  /** Attend que tout ce qui est déjà en file pour cette table soit écrit. */
  public flush(tableId: string): Promise<void> {
    return (this.queues.get(tableId) ?? Promise.resolve()).then(() => undefined);
  }

  private key(tableId: string, uid: string): string {
    return `${tableId}:${uid}`;
  }

  private nextSeq(tableId: string, uid: string): number {
    const key = this.key(tableId, uid);
    const seq = (this.sequences.get(key) ?? 0) + 1;
    this.sequences.set(key, seq);
    return seq;
  }

  private meta(tableId: string, roomCode?: string) {
    return { tableId, ...(roomCode ? { roomCode } : {}) };
  }

  /** Entrée ou recave : déplace l'argent de Disponible vers En table. Lève l'erreur du registre si le solde ne suffit pas. */
  public buyIn(params: { tableId: string; uid: string; amount: number; betLevel: number; roomCode: string; onApplied?: () => void }): Promise<void> {
    const { tableId, uid, amount, betLevel, roomCode, onApplied } = params;
    return this.serial(tableId, async () => {
      const key = this.key(tableId, uid);
      const isFirst = !this.ledgerCapital.has(key);
      const id = seatDocId(tableId, uid);
      // La fiche du siège existe avant l'argent : aucune somme en table ne peut échapper à la liste de Katika.
      if (isFirst) {
        await this.deps.openSeat({ id, tableId, uid, roomCode, betLevel, status: 'OPEN', buyInTotal: 0, openedAt: Date.now() });
      }
      try {
        await this.deps.applyMovement({
          ref: cashTableRefs.buyIn(tableId, uid, this.nextSeq(tableId, uid)),
          uid,
          kind: 'TABLE_BUYIN',
          availableDelta: -amount,
          lockedDelta: amount,
          environment: this.environment,
          meta: this.meta(tableId, roomCode),
        });
      } catch (err) {
        if (isFirst) await this.deps.closeSeat(id, { paidOut: 0, note: 'Entrée refusée.' }).catch(() => undefined);
        throw err;
      }
      this.ledgerCapital.set(key, (this.ledgerCapital.get(key) ?? 0) + amount);
      // Appelé dans la file : une sortie déjà en attente derrière cette recave voit le nouveau montant.
      onApplied?.();
      await this.deps.addSeatBuyIn(id, amount).catch((err) => {
        console.warn('[KoraCash] Fiche de siège non mise à jour (registre à jour).', err instanceof Error ? err.message : String(err));
      });
    });
  }

  /** Écrit l'écart entre ce que le registre connaît et le capital visé. Vrai si le registre est à jour ensuite. */
  private async applySync(tableId: string, uid: string, target: number, tag: string): Promise<boolean> {
    const key = this.key(tableId, uid);
    const known = this.ledgerCapital.get(key);
    if (known === undefined) return false;
    const delta = target - known;
    if (delta === 0) return true;
    try {
      await this.deps.applyMovement({
        ref: cashTableRefs.settlement(tableId, uid, tag),
        uid,
        kind: 'TABLE_SETTLEMENT',
        availableDelta: 0,
        lockedDelta: delta,
        environment: this.environment,
        meta: this.meta(tableId),
      });
      this.ledgerCapital.set(key, target);
      return true;
    } catch (err) {
      console.error(`[KoraCash] Résultat non inscrit (table ${tableId}) : il repartira avec le mouvement suivant.`, err instanceof Error ? err.message : String(err));
      return false;
    }
  }

  /** Inscrit le résultat d'une partie pour un joueur. tag est propre à la partie : rejouer ne crée rien de plus. */
  public settle(params: { tableId: string; uid: string; target: number; tag: string }): Promise<boolean> {
    const { tableId, uid, target, tag } = params;
    return this.serial(tableId, () => this.applySync(tableId, uid, target, tag));
  }

  /** Sortie : inscrit l'écart restant, rend le capital au solde disponible, ferme la fiche. La cible peut être lue au moment d'écrire. */
  public cashOut(params: { tableId: string; uid: string; target: number | (() => number); closedBy?: string }): Promise<boolean> {
    const { tableId, uid, closedBy } = params;
    return this.serial(tableId, async () => {
      const key = this.key(tableId, uid);
      if (!this.ledgerCapital.has(key)) return false;
      const target = typeof params.target === 'function' ? params.target() : params.target;
      const seq = this.nextSeq(tableId, uid);
      if (!(await this.applySync(tableId, uid, target, `out${seq}`))) return false;
      try {
        if (target > 0) {
          await this.deps.applyMovement({
            ref: cashTableRefs.cashOut(tableId, uid, seq),
            uid,
            kind: 'TABLE_CASHOUT',
            availableDelta: target,
            lockedDelta: -target,
            environment: this.environment,
            meta: this.meta(tableId),
          });
        }
      } catch (err) {
        console.error(`[KoraCash] Sortie de table non inscrite (table ${tableId}) : l'argent reste en table, à rendre depuis Katika.`, err instanceof Error ? err.message : String(err));
        return false;
      }
      this.ledgerCapital.delete(key);
      await this.deps.closeSeat(seatDocId(tableId, uid), { paidOut: target, ...(closedBy ? { closedBy } : {}) }).catch((err) => {
        console.warn('[KoraCash] Fiche de siège non fermée (registre à jour).', err instanceof Error ? err.message : String(err));
      });
      return true;
    });
  }

  /** Trace d'une partie jouée, avec sa commission : base du rapprochement financier. */
  public recordPartie(params: { tableId: string; resultId: string; rake: number; bet: number }): Promise<void> {
    const { tableId, resultId, rake, bet } = params;
    return this.serial(tableId, () =>
      this.deps.recordPartie({ id: resultId, tableId, resultId, rake, bet, createdAt: Date.now() }).catch((err) => {
        console.warn('[KoraCash] Trace de partie non écrite.', err instanceof Error ? err.message : String(err));
      })
    );
  }

  /**
   * Katika rend l'argent d'un siège dont la table n'existe plus. Le montant vient du registre, jamais d'une saisie.
   * Renvoie la somme rendue ; une seconde demande sur le même siège ne rend rien de plus.
   */
  public async adminRefund(params: { tableId: string; uid: string; actor: string }): Promise<number> {
    const { tableId, uid, actor } = params;
    const id = seatDocId(tableId, uid);
    const seat = await this.deps.getSeat(id);
    if (!seat || seat.status !== 'OPEN') return 0;
    const amount = await this.deps.sumTableLocked(uid, tableId, this.environment);
    if (amount > 0) {
      await this.deps.applyMovement({
        ref: cashTableRefs.adminRefund(tableId, uid),
        uid,
        kind: 'TABLE_CASHOUT',
        availableDelta: amount,
        lockedDelta: -amount,
        environment: this.environment,
        actorUid: actor,
        meta: this.meta(tableId),
        note: 'Rendu par Katika : table disparue.',
      });
    }
    await this.deps.closeSeat(id, { paidOut: amount, closedBy: actor, note: 'Rendu par Katika : table disparue.' });
    return amount;
  }
}
