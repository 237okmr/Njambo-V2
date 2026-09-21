import { HeadToHeadStats, HeadToHeadMatch, PlayerGameHistoryItem } from '../types/playerProfile';
import { playerProfileService } from './playerProfileService';
import { FriendService } from './friendService';
import { db, auth } from '../lib/firebase';
import { collection, getDocs, query, where, orderBy, limit } from 'firebase/firestore';

const H2H_STORAGE_KEY = 'njambo_h2h_direct_records_v1';

export class RivalryService {
  /**
   * Retrieves persistent direct H2H records stored locally
   */
  public static getDirectLocalRecords(): Record<string, HeadToHeadMatch[]> {
    try {
      const raw = localStorage.getItem(H2H_STORAGE_KEY);
      if (!raw) return {};
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }

  /**
   * Saves direct H2H matches for quick lookup
   */
  public static saveDirectLocalRecords(records: Record<string, HeadToHeadMatch[]>): void {
    try {
      localStorage.setItem(H2H_STORAGE_KEY, JSON.stringify(records));
    } catch (e) {
      console.warn('[RivalryService] Failed to save direct H2H records:', e);
    }
  }

  /**
   * Records a match directly between the local player and opponents
   */
  public static recordDirectMatch(match: HeadToHeadMatch, opponentId: string, opponentName: string): void {
    if (!opponentId && !opponentName) return;
    
    // Filtrage anti-bots : Ignorer Katika et les bots virtuels
    const key = (opponentId || opponentName).trim().toLowerCase();
    if (key.includes('bot') || key.includes('katika') || key === 'dealer' || key === 'croupier') {
      return;
    }

    const records = this.getDirectLocalRecords();
    const existing = records[key] || [];

    const updated = [match, ...existing.filter((m) => m.id !== match.id)].slice(0, 30);
    records[key] = updated;

    // Also record under opponent name if different
    if (opponentName && opponentName.toLowerCase() !== key) {
       const nameKey = opponentName.trim().toLowerCase();
       if (!nameKey.includes('bot') && !nameKey.includes('katika')) {
         records[nameKey] = updated;
       }
    }

    this.saveDirectLocalRecords(records);
  }

  /**
   * Computes the complete Head-to-Head rivalry stats against a specific opponent
   */
  public static async getHeadToHeadStats(opponent: {
    id: string;
    name: string;
    avatarId?: string;
    avatarSeed?: string;
    friendCode?: string;
  }): Promise<HeadToHeadStats> {
    const oppId = (opponent.id || '').trim();
    const oppName = (opponent.name || '').trim().toLowerCase();
    const oppAvatar = opponent.avatarId || opponent.avatarSeed || 'avatar_1';
    const oppFriendCode = opponent.friendCode || FriendService.getFriendCode(oppId);

    // Filtrage anti-bots : Ignorer Katika et les bots virtuels
    if (oppId.includes('bot') || oppId.includes('katika') || oppName.includes('bot') || oppName.includes('katika') || oppName === 'katika admin' || oppName === 'katika_dealer') {
       return {
         opponentId: oppId,
         opponentName: opponent.name || 'Bot / Katika',
         opponentAvatar: oppAvatar,
         opponentFriendCode: oppFriendCode,
         totalMatches: 0,
         playerWins: 0,
         opponentWins: 0,
         winRate: 0,
         korasInflicted: 0,
         korasSuffered: 0,
         doubleKorasInflicted: 0,
         doubleKorasSuffered: 0,
         netChipsDelta: 0,
         totalPotExchanged: 0,
         currentStreak: { winner: 'none', count: 0 },
         playerAvgTricks: 0,
         opponentAvgTricks: 0,
         lastMatches: [],
         lastPlayedAt: 0,
       };
    }

    // 1. Gather all game history from playerProfileService
    const localHistory = playerProfileService.getLocalHistory();
    const directRecords = this.getDirectLocalRecords();
    const key = (oppId || oppName).toLowerCase();
    const directMatches = directRecords[key] || (oppName ? directRecords[oppName] : []) || [];

    // Filter local history items where this opponent participated
    const matchingHistoryItems = localHistory.filter((item: PlayerGameHistoryItem) => {
      // Ignorer les parties solo si on est contre un bot dans l'historique
      if (item.mode === 'SOLO' && (oppId.includes('bot') || oppId.includes('katika') || oppName.includes('bot') || oppName.includes('katika'))) {
        return false;
      }
      
      if (!item.opponents || item.opponents.length === 0) {
        // Check winner name / ID
        if (item.winnerId && item.winnerId === oppId) return true;
        if (item.winnerName && item.winnerName.toLowerCase() === oppName) return true;
        return false;
      }

      return item.opponents.some(
        (o) =>
          ((oppId && o.id === oppId) ||
          (oppName && o.name && o.name.toLowerCase() === oppName)) &&
          o.isHuman !== false
      );
    });

    // Merge history items and direct matches
    const allMatchesMap = new Map<string, HeadToHeadMatch>();

    // Add direct matches first
    directMatches.forEach((m) => {
      allMatchesMap.set(m.id, m);
    });

    // Convert and add matching history items
    matchingHistoryItems.forEach((h) => {
      const oppEntry = h.opponents?.find(
        (o) => (oppId && o.id === oppId) || (oppName && o.name && o.name.toLowerCase() === oppName)
      );
      const isOpponentWinner = Boolean(
        (h.winnerId && h.winnerId === oppId) ||
        (h.winnerName && h.winnerName.toLowerCase() === oppName)
      );

      allMatchesMap.set(h.id, {
        id: h.id,
        createdAt: h.createdAt || Date.now(),
        isPlayerWinner: h.isWinner,
        winnerName: h.winnerName || (h.isWinner ? 'Vous' : opponent.name),
        winnerId: h.winnerId,
        winType: h.winType || 'STANDARD',
        baseBet: h.baseBet || 10,
        potWon: h.potWon || (h.baseBet || 10) * 2,
        netDelta: h.netChipsDelta || (h.isWinner ? (h.potWon || 20) - (h.baseBet || 10) : -(h.baseBet || 10)),
        playerTricks: h.tricksWon || 0,
        opponentTricks: (oppEntry as any)?.tricksWon || 0,
        mode: h.mode || 'MULTIPLAYER',
        recordType: h.recordType || 'PARTIE',
      });
    });

    // Sort all matches chronologically descending (newest first)
    const sortedMatches = Array.from(allMatchesMap.values()).sort((a, b) => b.createdAt - a.createdAt);

    // Compute aggregated metrics
    let playerWins = 0;
    let opponentWins = 0;
    let korasInflicted = 0;
    let korasSuffered = 0;
    let doubleKorasInflicted = 0;
    let doubleKorasSuffered = 0;
    let netChipsDelta = 0;
    let totalPotExchanged = 0;
    let totalPlayerTricks = 0;
    let totalOpponentTricks = 0;

    sortedMatches.forEach((m) => {
      totalPotExchanged += m.potWon || 0;
      netChipsDelta += m.netDelta || 0;
      totalPlayerTricks += m.playerTricks || 0;
      totalOpponentTricks += m.opponentTricks || 0;

      if (m.isPlayerWinner) {
        playerWins++;
        if (m.winType === 'KORA' || m.winType === 'DOUBLE_KORA') {
          korasInflicted++;
          if (m.winType === 'DOUBLE_KORA') doubleKorasInflicted++;
        }
      } else {
        opponentWins++;
        if (m.winType === 'KORA' || m.winType === 'DOUBLE_KORA') {
          korasSuffered++;
          if (m.winType === 'DOUBLE_KORA') doubleKorasSuffered++;
        }
      }
    });

    const totalMatches = playerWins + opponentWins;
    const winRate = totalMatches > 0 ? Math.round((playerWins / totalMatches) * 100) : 0;
    const playerAvgTricks = totalMatches > 0 ? Number((totalPlayerTricks / totalMatches).toFixed(1)) : 0;
    const opponentAvgTricks = totalMatches > 0 ? Number((totalOpponentTricks / totalMatches).toFixed(1)) : 0;

    // Calculate current streak
    let streakWinner: 'player' | 'opponent' | 'none' = 'none';
    let streakCount = 0;

    if (sortedMatches.length > 0) {
      const firstIsPlayer = sortedMatches[0].isPlayerWinner;
      streakWinner = firstIsPlayer ? 'player' : 'opponent';
      for (const m of sortedMatches) {
        if (m.isPlayerWinner === firstIsPlayer) {
          streakCount++;
        } else {
          break;
        }
      }
    }

    const lastPlayedAt = sortedMatches.length > 0 ? sortedMatches[0].createdAt : 0;

    return {
      opponentId: oppId,
      opponentName: opponent.name || 'Adversaire',
      opponentAvatar: oppAvatar,
      opponentFriendCode: oppFriendCode,
      totalMatches,
      playerWins,
      opponentWins,
      winRate,
      korasInflicted,
      korasSuffered,
      doubleKorasInflicted,
      doubleKorasSuffered,
      netChipsDelta,
      totalPotExchanged,
      currentStreak: {
        winner: streakWinner,
        count: streakCount,
      },
      playerAvgTricks,
      opponentAvgTricks,
      lastMatches: sortedMatches.slice(0, 5),
      lastPlayedAt,
    };
  }

  /**
   * Resets local H2H records against a specific opponent
   */
  public static clearDirectRecords(opponentIdOrName: string): void {
    const records = this.getDirectLocalRecords();
    const key = opponentIdOrName.trim().toLowerCase();
    delete records[key];
    this.saveDirectLocalRecords(records);
  }
}
