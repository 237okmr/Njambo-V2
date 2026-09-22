import { KatikaKPIs, KatikaLiveRoom, KatikaPlayer, KatikaGameConfig, KatikaAuditLog } from '../types/katika';
import { tikaFetch } from './tikaFetch';
import { telemetryService, GameTelemetryRecord, GlobalMancheCounts } from '../../services/telemetryService';
import { collection, getDocs, doc, setDoc, updateDoc, deleteDoc, deleteField, query, orderBy } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { playerProfileService, computeMasteryScore } from '../../services/playerProfileService';
import { computeEventMasteryScore, getDoualaDateKey, MASTERY_CONFIG } from '../../services/masteryConfig';
import { PlayerGameHistoryItem } from '../../types/playerProfile';
import { setBotTimingConfig, setBotDialogueConfig } from '../../utils/ai';

export interface ProfileCorrectionEntry {
  uid: string;
  originalDisplayName: string;
  reasons: string[];
  appliedFixes: string[];
  beforeData: any;
  afterData: any;
}

export interface ProfileAuditReport {
  totalScanned: number;
  totalHealthy: number;
  totalCorrected: number;
  corrections: ProfileCorrectionEntry[];
  backupJson: string;
  timestamp: number;
}

export interface SecondaryAdminRecord {
  uid: string;
  email: string;
  grantedAt: string;
  grantedBy: string;
  status?: string;
}

export const OFFICIAL_BOT_NAMES = [
  "Thom's Kora",
  "Don WizeMan",
  "Kora Boy Malo",
  "Zing Efoulan",
  "Black Bozar",
  "SystemTchakap",
  "Zing Mignon",
  "Vie2Poulet",
  "Kora Malox",
  "Robam Hokuto",
];

/**
 * Filtre anti-bot strict et exhaustif pour garantir qu'aucun robot de jeu ne se retrouve dans les classements publics ou podiums
 */
export function isKnownBot(name: string = '', id: string = ''): boolean {
  const n = (name || '').trim().toLowerCase();
  const i = (id || '').trim().toLowerCase();

  if (i === 'p2' || i === 'p3' || i === 'p4' || i.startsWith('bot') || i.includes('bot') || i.startsWith('ai_')) {
    return true;
  }

  if (
    n.includes('bot') ||
    n.includes('robot') ||
    n.includes('abandon') ||
    n.includes('interrompue') ||
    n.includes('forfait')
  ) {
    return true;
  }

  const botKeywords = [
    'robam',
    'hokuto',
    'hokito',
    'wizeman',
    'thom',
    'malo',
    'efoulan',
    'bozar',
    'tchakap',
    'mignon',
    'vie2poulet',
    'malox',
  ];
  if (botKeywords.some((kw) => n.includes(kw))) {
    return true;
  }

  return OFFICIAL_BOT_NAMES.some((bn) => {
    const bnL = bn.toLowerCase();
    return n === bnL || n.includes(bnL) || bnL.includes(n);
  });
}

export const DEFAULT_KATIKA_CONFIG: KatikaGameConfig = {
  turnTimerSeconds: 15,
  reconnectTimeoutSeconds: 30,
  lobbyDisconnectGraceSeconds: 20,
  inactivityTimeoutSeconds: 120,
  targetWinningScore: 21,
  isMaintenanceMode: false,
  allowNewRooms: true,
  defaultInitialCapital: 5000,
  minTableBet: 100,
  globalAnnouncement: '',
  bettingEconomyEnabled: false, // Arbitrage 2: désactivé par défaut en mode démonstration / gratuit
  pwaPolicyMode: 'MODERATE',
  minPwaVersion: '1.2.0',
  currentPwaVersion: '1.3.0',
  neverInterruptActiveMatch: true,
  transitionDelayMs: 12000,
  botThinkTimeMs: 800,
  trickResolutionTimeMs: 1600,
  instantWinAnimationTimeMs: 3500,
  foldForfeitDelayMs: 2000,
  defaultTableMaxPlayers: 2, // 1vs1 par défaut
  defaultFillWithBots: false, // 100% humain par défaut
  allowJoinInProgress: true,
  emptyRoomTimeoutMinutes: 5,
  lobbyWaitTtlMinutes: 30,
  publicAbsentHostVisibilitySeconds: 180,
  hostTakeoverSeconds: 180,
  guestLobbyGraceSeconds: 60,
  joinPushEnabled: true,
  defaultAiDifficulty: 'NORMAL',
  hokutoSpawnRatePct: 75,
  globalRakePct: 0,
  allowAutoAdvance: false,
  // Bot Dialogue & Commentary Pacing (Répliques & Provocations des Robots IA)
  botEmoteCooldownSeconds: 7,
  botMaxEmotesPerRound: 2,
  botEmoteHokutoRatePct: 28,
  botEmoteMbapRatePct: 25,
  botEmoteLeadDiscardRatePct: 10,
  botEmoteCriticalBypassLimit: true,
  enableUnder21: true,
  enableThreeSevens: true,
  enableDoubleKora: true,
  koraMultiplier: 2,
  doubleKoraMultiplier: 4,
  enableAutoBetEscalation: true,
  autoBetEscalationInterval: 5,
  autoBetEscalationRatePct: 50,
  maxAutoBetMultiplier: 4,
};

let mockConfig: KatikaGameConfig = (() => {
  try {
    const saved = localStorage.getItem('katika_engine_game_config');
    if (saved) {
      return { ...DEFAULT_KATIKA_CONFIG, ...JSON.parse(saved) };
    }
  } catch {}
  return { ...DEFAULT_KATIKA_CONFIG };
})();

const configListeners = new Set<(config: KatikaGameConfig) => void>();

export function getKatikaConfigSync(): KatikaGameConfig {
  return { ...mockConfig };
}

export function subscribeKatikaConfig(cb: (config: KatikaGameConfig) => void): () => void {
  configListeners.add(cb);
  cb({ ...mockConfig });
  return () => configListeners.delete(cb);
}

function notifyConfigListeners() {
  const cfg = { ...mockConfig };
  try {
    localStorage.setItem('katika_engine_game_config', JSON.stringify(cfg));
  } catch {}
  setBotTimingConfig({
    botThinkTimeMs: cfg.botThinkTimeMs,
    hokutoSpawnRatePct: cfg.hokutoSpawnRatePct,
  });
  setBotDialogueConfig({
    botEmoteCooldownSeconds: cfg.botEmoteCooldownSeconds ?? 7,
    botMaxEmotesPerRound: cfg.botMaxEmotesPerRound ?? 2,
    botEmoteHokutoRatePct: cfg.botEmoteHokutoRatePct ?? 28,
    botEmoteMbapRatePct: cfg.botEmoteMbapRatePct ?? 25,
    botEmoteLeadDiscardRatePct: cfg.botEmoteLeadDiscardRatePct ?? 10,
    botEmoteCriticalBypassLimit: cfg.botEmoteCriticalBypassLimit !== false,
  });
  configListeners.forEach((listener) => {
    try {
      listener(cfg);
    } catch (e) {
      console.error('[KatikaService] Error in config listener:', e);
    }
  });
}

// Initial sync on startup
setBotTimingConfig({
  botThinkTimeMs: mockConfig.botThinkTimeMs,
  hokutoSpawnRatePct: mockConfig.hokutoSpawnRatePct,
});
setBotDialogueConfig({
  botEmoteCooldownSeconds: mockConfig.botEmoteCooldownSeconds ?? 7,
  botMaxEmotesPerRound: mockConfig.botMaxEmotesPerRound ?? 2,
  botEmoteHokutoRatePct: mockConfig.botEmoteHokutoRatePct ?? 28,
  botEmoteMbapRatePct: mockConfig.botEmoteMbapRatePct ?? 25,
  botEmoteLeadDiscardRatePct: mockConfig.botEmoteLeadDiscardRatePct ?? 10,
  botEmoteCriticalBypassLimit: mockConfig.botEmoteCriticalBypassLimit !== false,
});

let mockAuditLogs: KatikaAuditLog[] = [
  {
    id: 'log-1',
    timestamp: Date.now() - 1000 * 60 * 5,
    type: 'AUTH',
    severity: 'INFO',
    actor: '237okmr@gmail.com',
    summary: 'Session Katika Master active - Télémétrie en temps réel connectée',
  },
  {
    id: 'log-2',
    timestamp: Date.now() - 1000 * 60 * 20,
    type: 'KATIKA_ACTION',
    severity: 'INFO',
    actor: 'Katika Engine',
    summary: 'Synchronisation directe avec le serveur WebSocket de jeu',
  }
];

// --- Système de Cache Mémoire (TTL 30 secondes) pour optimiser les lectures Firestore & Télémétrie ---
interface MemoryCacheEntry<T> {
  data: T;
  timestamp: number;
}

const MEMORY_CACHE_TTL_MS = 30000; // 30s TTL

let cachedUsersData: MemoryCacheEntry<any[]> | null = null;
let cachedGameRecordsData: MemoryCacheEntry<GameTelemetryRecord[]> | null = null;
let cachedGlobalCountsData: MemoryCacheEntry<GlobalMancheCounts> | null = null;
const cachedKPIsMap = new Map<string, MemoryCacheEntry<KatikaKPIs>>();
let cachedPlayersData: MemoryCacheEntry<KatikaPlayer[]> | null = null;

export function invalidateKatikaMemoryCache(): void {
  cachedUsersData = null;
  cachedGameRecordsData = null;
  cachedGlobalCountsData = null;
  cachedKPIsMap.clear();
  cachedPlayersData = null;
}

async function getCachedUsers(): Promise<any[]> {
  const now = Date.now();
  if (cachedUsersData && now - cachedUsersData.timestamp < MEMORY_CACHE_TTL_MS) {
    return cachedUsersData.data;
  }

  let usersList: any[] = [];
  const savedUsers = localStorage.getItem('katika_users_cache');
  if (savedUsers) {
    try {
      usersList = JSON.parse(savedUsers);
    } catch (e) {
      /* ignore */
    }
  }
  if (db) {
    try {
      const uSnap = await getDocs(collection(db, 'users'));
      if (!uSnap.empty) {
        usersList = uSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        try {
          localStorage.setItem('katika_users_cache', JSON.stringify(usersList));
        } catch (e) {
          /* ignore */
        }
      }
    } catch (e) {
      console.warn('[KatikaService] Could not fetch users from Firestore:', e);
    }
  }

  cachedUsersData = {
    data: usersList,
    timestamp: now,
  };
  return usersList;
}

async function getCachedTelemetryRecords(limit: number = 1000): Promise<GameTelemetryRecord[]> {
  const now = Date.now();
  if (cachedGameRecordsData && now - cachedGameRecordsData.timestamp < MEMORY_CACHE_TTL_MS) {
    return cachedGameRecordsData.data;
  }

  let records: GameTelemetryRecord[] = [];
  try {
    records = await telemetryService.getGameRecords(limit);
  } catch (err) {
    console.warn('[KatikaService] Could not load telemetry records:', err);
  }

  cachedGameRecordsData = {
    data: records,
    timestamp: now,
  };
  return records;
}

async function getCachedGlobalCounts(): Promise<GlobalMancheCounts> {
  const now = Date.now();
  if (cachedGlobalCountsData && now - cachedGlobalCountsData.timestamp < MEMORY_CACHE_TTL_MS) {
    return cachedGlobalCountsData.data;
  }

  let counts: GlobalMancheCounts = {
    totalStarted: 0,
    totalCompleted: 0,
    totalInProgress: 0,
    totalAbandoned: 0,
    completionRate: 100,
  };
  try {
    counts = await telemetryService.getGlobalMancheCounts();
  } catch (err) {
    console.warn('[KatikaService] Could not load global manche counts:', err);
  }

  cachedGlobalCountsData = {
    data: counts,
    timestamp: now,
  };
  return counts;
}

export const KatikaService = {
  getKPIs: async (timeRange: 'ALL' | '7D' | '24H' | 'TODAY' = 'ALL'): Promise<KatikaKPIs> => {
    const cacheKey = `kpis_${timeRange}`;
    const nowTime = Date.now();
    const cachedEntry = cachedKPIsMap.get(cacheKey);
    if (cachedEntry && nowTime - cachedEntry.timestamp < MEMORY_CACHE_TTL_MS) {
      return cachedEntry.data;
    }

    let liveSockets = 0;
    let liveRooms = 0;
    let twoRooms = 0;
    let threeRooms = 0;
    let fourRooms = 0;
    let liveBetProposalsActive = 0;
    let liveCapacityVotesActive = 0;
    let liveKoraHunterAlertsActive = 0;

    // 1. Query Server WebSocket Telemetry
    try {
      const response = await tikaFetch('/api/katika/live-metrics');
      if (response.ok) {
        const data = await response.json();
        if (data.telemetry) {
          liveSockets = data.telemetry.connectedSockets || 0;
          liveRooms = data.telemetry.activeRooms || 0;
          twoRooms = data.telemetry.twoPlayersRooms || 0;
          threeRooms = data.telemetry.threePlayersRooms || 0;
          fourRooms = data.telemetry.fourPlayersRooms || 0;
          liveBetProposalsActive = data.telemetry.liveBetProposalsActive || 0;
          liveCapacityVotesActive = data.telemetry.liveCapacityVotesActive || 0;
          liveKoraHunterAlertsActive = data.telemetry.liveKoraHunterAlertsActive || 0;
        }
      }
    } catch (err) {
      console.warn('[KatikaService] Could not reach live metrics endpoint:', err);
    }

    // 1.b Query Users from Firestore / Local Cache for identity demographics (Cached 30s)
    let registeredUsersCount = 0;
    let googleUsersCount = 0;
    let guestUsersCount = 0;
    const honorificPyramid: Record<string, number> = {
      APPRENTI: 0,
      CONFIRME: 0,
      CHASSEUR_KORA: 0,
      MAITRE_POSITION: 0,
      MAITRE_NJAMBO: 0,
      LEGENDE_KORA: 0,
    };
    try {
      const usersList = await getCachedUsers();
      registeredUsersCount = usersList.length;
      usersList.forEach((u: any) => {
        if (u.email || u.isGuest === false) {
          googleUsersCount++;
        } else {
          guestUsersCount++;
        }
        const t = u.honorificTitleId || 'APPRENTI';
        if (honorificPyramid[t] !== undefined) honorificPyramid[t]++;
        else honorificPyramid['APPRENTI']++;
      });
    } catch (e) {
      console.warn('[KatikaService] Could not compute user demographics:', e);
    }

    // 2. Query Real Game Telemetry from Firestore / Local Storage (Cached 30s)
    let records: GameTelemetryRecord[] = [];
    let globalStats: GlobalMancheCounts = {
      totalStarted: 0,
      totalCompleted: 0,
      totalInProgress: 0,
      totalAbandoned: 0,
      completionRate: 100,
    };
    try {
      const [fetchedRecords, counts] = await Promise.all([
        getCachedTelemetryRecords(1000),
        getCachedGlobalCounts(),
      ]);
      records = [...fetchedRecords];
      globalStats = counts;
    } catch (e) {
      console.warn('[KatikaService] Could not load telemetry records:', e);
    }

    // 3. Merge Server in-memory Match History
    try {
      const serverHistRes = await tikaFetch('/api/katika/game-history');
      if (serverHistRes.ok) {
        const sData = await serverHistRes.json();
        if (sData.records && Array.isArray(sData.records)) {
          sData.records.forEach((sRec: any) => {
            if (!records.some((r) => r.id === sRec.id)) {
              records.push({
                id: sRec.id,
                mode: sRec.mode || 'MULTIPLAYER',
                playerCount: sRec.playerCount || 4,
                winType: sRec.winType || 'STANDARD',
                winnerName: sRec.winnerName || 'Joueur',
                winnerId: sRec.winnerId,
                roundsCount: sRec.roundsCount || 1,
                potWon: sRec.potWon || 0,
                createdAt: sRec.createdAt || Date.now(),
              });
            }
          });
        }
      }
    } catch (e) {
      // server history optional
    }

    // Filter by time range if specified
    const now = Date.now();
    if (timeRange === 'TODAY') {
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      const cutoff = startOfToday.getTime();
      records = records.filter(r => r.createdAt >= cutoff);
    } else if (timeRange === '24H') {
      const cutoff = now - 24 * 60 * 60 * 1000;
      records = records.filter(r => r.createdAt >= cutoff);
    } else if (timeRange === '7D') {
      const cutoff = now - 7 * 24 * 60 * 60 * 1000;
      records = records.filter(r => r.createdAt >= cutoff);
    }

    // Sort descending
    records.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    const totalGames = records.length;
    const soloGames = records.filter(r => r.mode === 'SOLO').length;
    const multiplayerGames = records.filter(r => r.mode === 'MULTIPLAYER').length;

    const koraCount = records.filter(r => r.winType === 'KORA').length;
    const doubleKoraCount = records.filter(r => r.winType === 'DOUBLE_KORA').length;
    const simpleVictoryCount = records.filter(r => r.winType === 'STANDARD').length;
    const threeSevensCount = records.filter(r => r.winType === 'THREE_SEVENS').length;
    const under21Count = records.filter(r => r.winType === 'UNDER_21').length;

    const twoPlayersCount = records.filter(r => r.playerCount === 2).length;
    const threePlayersCount = records.filter(r => r.playerCount === 3).length;
    const fourPlayersCount = records.filter(r => r.playerCount === 4).length;

    // Economic metrics
    const totalChipsWon = records.reduce((acc, r) => acc + (r.potWon || 0), 0);
    const avgPotPerGame = totalGames > 0 ? Math.round(totalChipsWon / totalGames) : 0;
    const highestPotWon = records.length > 0 ? Math.max(...records.map(r => r.potWon || 0)) : 0;

    // Explicit Manche & Partie metrics (Une Manche = succession de parties jusqu'à la victoire finale. Chaque partie = 5 tours)
    const totalPartiesDisputed = records.reduce((acc, r) => acc + (r.partiesCount || r.roundsCount || 1), 0);
    const avgPartiesPerManche = totalGames > 0 ? Number((totalPartiesDisputed / totalGames).toFixed(1)) : 1;

    // --- Étape 1 : Calculs Comportement & Expérience Joueur ---
    // 1. Table Preference Distribution
    const twoPlayersPct = totalGames > 0 ? Math.round((twoPlayersCount / totalGames) * 100) : 0;
    const threePlayersPct = totalGames > 0 ? Math.round((threePlayersCount / totalGames) * 100) : 0;
    const fourPlayersPct = totalGames > 0 ? Math.round((fourPlayersCount / totalGames) * 100) : 0;
    let dominantFormat: '2 Joueurs (Duels)' | '3 Joueurs' | '4 Joueurs (Classique)' = '4 Joueurs (Classique)';
    if (twoPlayersCount >= threePlayersCount && twoPlayersCount >= fourPlayersCount) {
      dominantFormat = '2 Joueurs (Duels)';
    } else if (threePlayersCount >= twoPlayersCount && threePlayersCount >= fourPlayersCount) {
      dominantFormat = '3 Joueurs';
    }

    // 2. Audacity Barometer (Kora / Risk Analysis)
    const actualVictoriesCount = (koraCount + doubleKoraCount + simpleVictoryCount + threeSevensCount + under21Count) || 1;
    const koraRate = Math.round((koraCount / actualVictoriesCount) * 100);
    const doubleKoraRate = Math.round((doubleKoraCount / actualVictoriesCount) * 100);
    const standardRate = Math.round((simpleVictoryCount / actualVictoriesCount) * 100);
    const specialWinsRate = Math.round(((threeSevensCount + under21Count) / actualVictoriesCount) * 100);
    const offenseIndex = Math.min(100, Math.round(((koraCount * 2.2 + doubleKoraCount * 3.5 + threeSevensCount * 1.5) / Math.max(1, totalGames)) * 45));
    const styleLabel = offenseIndex >= 55 
      ? 'TRÈS OFFENSIF (Chasseurs de Kora)' 
      : offenseIndex >= 30 
        ? 'ÉQUILIBRÉ & TACTIQUE' 
        : 'PRUDENT & DÉFENSIF';

    // 3. Game Pacing & Cadence (Durée réelle de manche sans double multiplication)
    const durations = records.map(r => r.durationSeconds).filter((d): d is number => typeof d === 'number' && d > 5);
    const avgMancheDurationSec = durations.length > 0 
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) 
      : 180; // Baseline réaliste de manche (3 min)
    const avgPartieDurationSec = avgPartiesPerManche > 0 
      ? Math.max(10, Math.round(avgMancheDurationSec / avgPartiesPerManche)) 
      : Math.min(avgMancheDurationSec, 45); // Baseline unitaire d'une donne de 5 tours
    const avgTrickDurationSec = Math.max(3, Math.round(avgPartieDurationSec / 5)); // Cadence par tour
    const fastestPartieDurationSec = durations.length > 0 ? Math.min(...durations) : 24;
    const longestPartieDurationSec = durations.length > 0 ? Math.max(...durations) : 115;
    const totalPlaytimeHours = durations.length > 0
      ? Number((durations.reduce((a, b) => a + b, 0) / 3600).toFixed(1))
      : Number(((totalPartiesDisputed * avgPartieDurationSec) / 3600).toFixed(1));

    const playerBehavior: KatikaKPIs['playerBehavior'] = {
      tablePreference: {
        twoPlayers: { count: twoPlayersCount, percentage: twoPlayersPct },
        threePlayers: { count: threePlayersCount, percentage: threePlayersPct },
        fourPlayers: { count: fourPlayersCount, percentage: fourPlayersPct },
        dominantFormat,
      },
      audacityBarometer: {
        koraRate,
        doubleKoraRate,
        standardRate,
        specialWinsRate,
        offenseIndex,
        styleLabel,
      },
      gamePacing: {
        avgMancheDurationSec,
        avgPartieDurationSec,
        avgTrickDurationSec,
        fastestPartieDurationSec,
        longestPartieDurationSec,
        totalPlaytimeHours,
      },
    };

    // --- Étape 2 : Calculs Rétention, Cohortes & Engagement Investisseur ---
    const day1Ms = 24 * 60 * 60 * 1000;
    const day7Ms = 7 * day1Ms;
    const day30Ms = 30 * day1Ms;

    // Collect all unique human user IDs from participants (not just winners)
    const userActivityMap: Record<string, { firstSeen: number; lastSeen: number; sessionDates: Set<string>; gamesCount: number }> = {};
    records.forEach(r => {
      const participants = (r.players && r.players.length > 0)
        ? r.players
        : [{ id: r.winnerId || ('usr_' + (r.winnerName || 'Joueur').toLowerCase().replace(/[^a-z0-9]/g, '')), name: r.winnerName || 'Joueur', isHuman: true }];

      const dStr = new Date(r.createdAt).toISOString().slice(0, 10);
      participants.forEach(p => {
        // Exclude system bots and fake abandon entities from human retention
        const nameLower = (p.name || '').toLowerCase();
        const idLower = (p.id || '').toLowerCase();
        if (p.isHuman === false || idLower.includes('bot') || nameLower.includes('bot') || nameLower.includes('abandon')) return;

        const uId = p.id;
        if (!userActivityMap[uId]) {
          userActivityMap[uId] = {
            firstSeen: r.createdAt,
            lastSeen: r.createdAt,
            sessionDates: new Set([dStr]),
            gamesCount: 1,
          };
        } else {
          userActivityMap[uId].firstSeen = Math.min(userActivityMap[uId].firstSeen, r.createdAt);
          userActivityMap[uId].lastSeen = Math.max(userActivityMap[uId].lastSeen, r.createdAt);
          userActivityMap[uId].sessionDates.add(dStr);
          userActivityMap[uId].gamesCount += 1;
        }
      });
    });

    const uniqueUsersList = Object.values(userActivityMap);
    const dau = uniqueUsersList.filter(u => u.lastSeen >= now - day1Ms).length || Math.max(1, liveSockets);
    const wau = uniqueUsersList.filter(u => u.lastSeen >= now - day7Ms).length || Math.max(dau, 2);
    const mau = uniqueUsersList.filter(u => u.lastSeen >= now - day30Ms).length || Math.max(wau, 3);
    const stickinessRatio = mau > 0 ? Math.round((dau / mau) * 100) : 0;

    // D1 / D7 / D30 Cohorts calculation without hardcoded mock fallbacks
    let d1Eligible = 0;
    let d1Retained = 0;
    let d7Eligible = 0;
    let d7Retained = 0;
    let d30Eligible = 0;
    let d30Retained = 0;

    uniqueUsersList.forEach(u => {
      const userAge = now - u.firstSeen;
      if (userAge >= day1Ms) {
        d1Eligible++;
        if (u.lastSeen - u.firstSeen >= day1Ms * 0.8) d1Retained++;
      }
      if (userAge >= day7Ms) {
        d7Eligible++;
        if (u.lastSeen - u.firstSeen >= day7Ms * 0.8) d7Retained++;
      }
      if (userAge >= day30Ms) {
        d30Eligible++;
        if (u.lastSeen - u.firstSeen >= day30Ms * 0.8) d30Retained++;
      }
    });

    const hasSufficientCohortData = d1Eligible >= 2;
    const d1Retention = d1Eligible > 0 ? Math.round((d1Retained / d1Eligible) * 100) : 0;
    const d7Retention = d7Eligible > 0 ? Math.round((d7Retained / d7Eligible) * 100) : 0;
    const d30Retention = d30Eligible > 0 ? Math.round((d30Retained / d30Eligible) * 100) : 0;

    const totalSessionsRecorded = uniqueUsersList.reduce((acc, u) => acc + u.sessionDates.size, 0);
    const avgSessionsPerUser = uniqueUsersList.length > 0 
      ? Number((totalSessionsRecorded / uniqueUsersList.length).toFixed(1)) 
      : 1.0;

    // Hourly Heatmap (0h to 23h)
    const hourCounts = Array(24).fill(0);
    records.forEach(r => {
      const h = new Date(r.createdAt).getHours();
      hourCounts[h] += 1;
    });
    const maxHourCount = Math.max(1, ...hourCounts);
    const hourlyHeatmap = hourCounts.map((count, hour) => ({
      hour,
      count,
      intensityPct: Math.round((count / maxHourCount) * 100),
    }));

    let peakHour = 20; // Default evening 20h
    let maxHCount = -1;
    hourCounts.forEach((c, h) => {
      if (c > maxHCount) {
        maxHCount = c;
        peakHour = h;
      }
    });
    const peakHourLabel = `${peakHour.toString().padStart(2, '0')}:00 - ${((peakHour + 1) % 24).toString().padStart(2, '0')}:00`;

    const retentionEngagement: KatikaKPIs['retentionEngagement'] = {
      dau,
      wau,
      mau,
      stickinessRatio,
      d1Retention,
      d7Retention,
      d30Retention,
      hasSufficientCohortData,
      cohortSampleSize: d1Eligible,
      avgSessionsPerUser,
      hourlyHeatmap,
      peakHourLabel,
    };

    // --- Étape 4 : Calculs Détection des Frustrations & Abandons (Données Réelles) ---
    const totalRecordsCount = records.length;
    
    // Manche Lifecycle Statistics (Débutées vs Terminées vs Abandonnées vs En cours)
    const totalManchesStarted = timeRange === 'ALL'
      ? Math.max(globalStats.totalStarted, totalGames)
      : totalGames;

    const recordsCompletedCount = records.filter(r => r.status === 'completed').length;
    const recordsAbandonedCount = records.filter(r => r.status === 'abandoned' || r.isAbandoned === true).length;
    const recordsOngoingCount = records.filter(r => r.status === 'in_progress').length;

    const totalManchesCompleted = timeRange === 'ALL'
      ? (globalStats.totalCompleted > 0 ? globalStats.totalCompleted : recordsCompletedCount)
      : recordsCompletedCount;

    const totalManchesAbandoned = timeRange === 'ALL'
      ? ((globalStats.totalAbandoned !== undefined && globalStats.totalAbandoned > 0) ? globalStats.totalAbandoned : recordsAbandonedCount)
      : recordsAbandonedCount;

    const totalManchesOngoing = timeRange === 'ALL'
      ? Math.max(0, totalManchesStarted - totalManchesCompleted - totalManchesAbandoned)
      : recordsOngoingCount;

    const totalManchesInProgress = totalManchesOngoing;

    const mancheCompletionRate = totalManchesStarted > 0
      ? Math.round((totalManchesCompleted / totalManchesStarted) * 100)
      : 100;

    const abandonedRecords = records.filter(r => r.status === 'abandoned' || r.isAbandoned === true);
    const abandonedCount = totalManchesAbandoned;
    const completedCount = totalManchesCompleted;

    const completionRate = mancheCompletionRate;
    const abandonmentRate = totalManchesStarted > 0 
      ? Math.round((totalManchesAbandoned / totalManchesStarted) * 100)
      : 0;

    const postKoraAbandons = abandonedRecords.filter(r => r.abandonmentReason === 'POST_KORA').length;
    const postKoraAbandonRate = abandonedCount > 0 
      ? Math.round((postKoraAbandons / abandonedCount) * 100) 
      : 0;

    const earlyTrickAbandons = abandonedRecords.filter(r => r.abandonmentReason === 'EARLY_QUIT' || (r.trickNumberAtQuit && r.trickNumberAtQuit <= 2)).length;
    const midGameAbandons = abandonedRecords.filter(r => r.trickNumberAtQuit && r.trickNumberAtQuit > 2 && r.trickNumberAtQuit <= 4).length;
    const afterDefeatAbandons = Math.max(0, abandonedCount - (earlyTrickAbandons + midGameAbandons));

    const earlyTrickQuitPct = abandonedCount > 0 ? Math.round((earlyTrickAbandons / abandonedCount) * 100) : 0;
    const midGameQuitPct = abandonedCount > 0 ? Math.round((midGameAbandons / abandonedCount) * 100) : 0;
    const afterDefeatQuitPct = abandonedCount > 0 ? Math.max(0, 100 - (earlyTrickQuitPct + midGameQuitPct)) : 0;

    const healthScore = Math.max(0, Math.min(100, Math.round(completionRate * 0.8 + (100 - postKoraAbandonRate) * 0.2)));
    const healthStatus = healthScore >= 85 
      ? 'FLUIDE & SAIN (Très peu d’abandons)' 
      : healthScore >= 65 
        ? 'MODÉRÉ' 
        : 'ATTENTION (Frustrations détectées)';

    const abandonmentFrustrations: KatikaKPIs['abandonmentFrustrations'] = {
      completionRate,
      abandonmentRate,
      postKoraAbandonRate,
      chokePoints: {
        earlyTrickQuitPct,
        midGameQuitPct,
        afterDefeatQuitPct,
      },
      healthScore,
      healthStatus,
    };

    // Build Activity Timeline based on timeRange
    const activityTimeline: KatikaKPIs['activityTimeline'] = [];
    if (timeRange === '24H' || timeRange === 'TODAY') {
      const intervalsCount = 8; // 3 hours intervals
      const intervalMs = 3 * 60 * 60 * 1000;
      for (let i = intervalsCount - 1; i >= 0; i--) {
        const bucketStart = now - (i + 1) * intervalMs;
        const bucketEnd = now - i * intervalMs;
        const bucketRecords = records.filter(r => r.createdAt >= bucketStart && r.createdAt < bucketEnd);
        
        const dateObj = new Date(bucketEnd);
        const timeLabel = `${dateObj.getHours().toString().padStart(2, '0')}:00`;
        
        activityTimeline.push({
          timeLabel,
          timestamp: bucketEnd,
          totalGames: bucketRecords.length,
          kora: bucketRecords.filter(r => r.winType === 'KORA').length,
          doubleKora: bucketRecords.filter(r => r.winType === 'DOUBLE_KORA').length,
          threeSevens: bucketRecords.filter(r => r.winType === 'THREE_SEVENS').length,
          under21: bucketRecords.filter(r => r.winType === 'UNDER_21').length,
          standard: bucketRecords.filter(r => r.winType === 'STANDARD').length,
          potSum: bucketRecords.reduce((acc, r) => acc + (r.potWon || 0), 0),
        });
      }
    } else {
      const daysCount = timeRange === 'ALL' ? 14 : 7;
      const dayMs = 24 * 60 * 60 * 1000;
      for (let i = daysCount - 1; i >= 0; i--) {
        const dayStart = new Date(now - i * dayMs);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(dayStart.getTime() + dayMs);
        
        const bucketRecords = records.filter(r => r.createdAt >= dayStart.getTime() && r.createdAt < dayEnd.getTime());
        const daysShort = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
        const timeLabel = `${daysShort[dayStart.getDay()]} ${dayStart.getDate()}/${dayStart.getMonth() + 1}`;
        
        activityTimeline.push({
          timeLabel,
          timestamp: dayStart.getTime(),
          totalGames: bucketRecords.length,
          kora: bucketRecords.filter(r => r.winType === 'KORA').length,
          doubleKora: bucketRecords.filter(r => r.winType === 'DOUBLE_KORA').length,
          threeSevens: bucketRecords.filter(r => r.winType === 'THREE_SEVENS').length,
          under21: bucketRecords.filter(r => r.winType === 'UNDER_21').length,
          standard: bucketRecords.filter(r => r.winType === 'STANDARD').length,
          potSum: bucketRecords.reduce((acc, r) => acc + (r.potWon || 0), 0),
        });
      }
    }

    const kpisResult: KatikaKPIs = {
      connectedPlayersCount: liveSockets,
      activeRoomsCount: liveRooms,
      totalGamesPlayed: totalManchesStarted,
      totalManchesPlayed: totalManchesStarted,
      totalManchesStarted,
      totalManchesCompleted,
      totalManchesInProgress: totalManchesOngoing,
      totalManchesAbandoned,
      totalManchesOngoing,
      mancheCompletionRate,
      totalPartiesDisputed,
      avgPartiesPerManche,
      manchesCompletedCount: totalManchesCompleted,
      manchesAbandonedCount: totalManchesAbandoned,
      manchesOngoingCount: totalManchesOngoing,
      bettingEconomyEnabled: mockConfig.bettingEconomyEnabled ?? false,
      soloGamesCount: soloGames,
      multiplayerGamesCount: multiplayerGames,
      koraCount,
      doubleKoraCount,
      simpleVictoryCount,
      threeSevensCount,
      under21Count,
      twoPlayersCount,
      threePlayersCount,
      fourPlayersCount,
      playerBehavior,
      retentionEngagement,
      abandonmentFrustrations,
      totalChipsWon,
      avgPotPerGame,
      highestPotWon,
      recentMatches: records,
      activityTimeline,
      forfeitWinsCount: records.filter((r) => (r.winType as string) === 'FORFEIT' || (r as any).isForfeit === true || r.winnerName?.toLowerCase().includes('forfait')).length,
      liveBetProposalsActive,
      liveCapacityVotesActive,
      liveKoraHunterAlertsActive,
      registeredUsersCount,
      googleUsersCount,
      guestUsersCount,
      honorificPyramid,
    };

    cachedKPIsMap.set(cacheKey, { data: kpisResult, timestamp: Date.now() });
    return kpisResult;
  },

  getLiveRooms: async (): Promise<KatikaLiveRoom[]> => {
    try {
      const response = await tikaFetch('/api/katika/live-metrics');
      if (response.ok) {
        const data = await response.json();
        if (data.telemetry && Array.isArray(data.telemetry.roomsList)) {
          return data.telemetry.roomsList.map((r: any) => ({
            roomId: r.id,
            roomName: `Table ${r.id} (${r.hostName || 'Hôte'})`,
            status: r.status === 'PLAYING' ? 'IN_GAME' : 'WAITING',
            maxPlayers: r.maxPlayers,
            currentPlayersCount: r.playerCount,
            currentRound: r.currentRound || 1,
            baseBet: r.baseBet,
            initialCapital: r.initialCapital,
            pot: r.pot || 0,
            currentTrickNumber: r.currentTrickNumber || 1,
            activePlayerIndex: r.activePlayerIndex,
            activePlayerName: r.activePlayerName,
            leadSuit: r.leadSuit,
            tableCards: r.tableCards || [],
            tricksHistory: r.tricksHistory || [],
            createdAt: r.createdAt || Date.now(),
            isPublic: r.isPublic !== false,
            betIncreaseProposal: r.betIncreaseProposal || null,
            capacityExtensionProposal: r.capacityExtensionProposal || null,
            integrationProposal: r.integrationProposal || null,
            showKoraHunterAlert: !!r.showKoraHunterAlert,
            hunterPlayerName: r.hunterPlayerName || null,
            players: (r.players || []).map((p: any) => ({
              id: p.id,
              name: p.name,
              score: p.score || 0,
              capital: p.capital,
              cardsLeft: p.cardsLeft ?? 0,
              tricksWonInRound: p.tricksWonInRound ?? 0,
              isHost: p.isHost,
              isHuman: p.isHuman ?? true,
              isReady: true,
              connected: p.connected ?? true,
              isEliminated: p.isEliminated ?? false,
              isFoldedInRound: p.isFoldedInRound ?? false,
            })),
          }));
        }
      }
    } catch (e) {
      console.warn('[KatikaService] Could not fetch live rooms from server:', e);
    }

    // Return exact zero rooms if server has no active tables
    return [];
  },

  getPlayers: async (): Promise<KatikaPlayer[]> => {
    const now = Date.now();
    if (cachedPlayersData && now - cachedPlayersData.timestamp < MEMORY_CACHE_TTL_MS) {
      return cachedPlayersData.data;
    }

    // Generate player list from real game history & current user profile (Cached 30s)
    let records: GameTelemetryRecord[] = [];
    try {
      records = await getCachedTelemetryRecords(1000);
    } catch (e) {
      console.warn('[KatikaService] Could not load records for players:', e);
    }

    try {
      const serverHistRes = await tikaFetch('/api/katika/game-history');
      if (serverHistRes.ok) {
        const sData = await serverHistRes.json();
        if (sData.records && Array.isArray(sData.records)) {
          sData.records.forEach((sRec: any) => {
            if (!records.some((r) => r.id === sRec.id)) {
              records.push(sRec);
            }
          });
        }
      }
    } catch (e) {
      // ignore
    }

    // Load persisted local overrides and server overrides (bans, warnings, chips)
    let overrides: Record<string, Partial<KatikaPlayer>> = {};
    try {
      const saved = localStorage.getItem('katika_player_overrides');
      if (saved) overrides = JSON.parse(saved);
    } catch (e) {
      // ignore
    }

    try {
      const res = await tikaFetch('/api/katika/player-overrides');
      if (res.ok) {
        const data = await res.json();
        if (data.sanctions) {
          Object.keys(data.sanctions).forEach((sId) => {
            overrides[sId] = {
              ...(overrides[sId] || {}),
              ...data.sanctions[sId],
            };
          });
        }
        if (data.chipOverrides) {
          Object.keys(data.chipOverrides).forEach((cId) => {
            overrides[cId] = {
              ...(overrides[cId] || {}),
              chipsBalance: data.chipOverrides[cId],
            };
          });
        }
      }
    } catch (e) {
      // ignore server fetch error
    }

    const playerMap: Record<string, KatikaPlayer> = {};

    // 1. Synchronisation prioritaire depuis la collection officielle Firestore /users (avec cache mémoire 30s)
    let cachedUsers: any[] = [];
    try {
      cachedUsers = await getCachedUsers();
    } catch (e) {
      console.warn('[KatikaService] Firestore /users fetch fallback to cache/records:', e);
    }

    // Seed playerMap directly from registered accounts
    cachedUsers.forEach((u: any) => {
      const uId = u.id || u.uid;
      if (!uId) return;

      const totalGames = (u.stats?.soloGamesPlayed || 0) + (u.stats?.multiplayerGamesPlayed || 0);
      const victories = u.stats?.partiesWon || u.stats?.gamesWon || 0;
      const winRate = totalGames > 0 ? Math.round((victories / totalGames) * 100) : 0;
      const masteryScore = u.stats?.masteryScore || computeMasteryScore(u.stats);

      playerMap[uId] = {
        id: uId,
        name: u.displayName || 'Joueur',
        isHuman: true,
        email: u.email || undefined,
        photoURL: u.photoURL || null,
        avatarId: u.avatarId || 'lion',
        honorificTitleId: u.honorificTitleId || 'APPRENTI',
        isGuest: u.isGuest ?? (u.email ? false : true),
        authProvider: u.authProvider || (u.email ? 'google.com' : undefined),
        isBot: Boolean(u.isBot),
        rawUserData: u,
        chipsBalance: u.stats?.totalChipsWon ?? 5000,
        totalGames,
        victories,
        defeats: Math.max(0, totalGames - victories),
        winRate,
        chipsWon: u.stats?.totalChipsWon || 0,
        chipsLost: 0,
        totalPartiesPlayed: u.stats?.totalPartiesPlayed || totalGames,
        totalPartiesWon: u.stats?.totalPartiesWon || victories,
        totalManchesPlayed: totalGames,
        totalManchesWon: victories,
        soloGamesPlayed: u.stats?.soloGamesPlayed || 0,
        multiplayerGamesPlayed: u.stats?.multiplayerGamesPlayed || 0,
        totalTricksWon: u.stats?.totalTricksWon || 0,
        koraCount: u.stats?.koraCount || 0,
        doubleKoraCount: u.stats?.doubleKoraCount || 0,
        masteryScore,
        status: 'ACTIVE',
        warningsCount: 0,
        abandonCount: 0,
        abandonRate: 0,
        forfeitsCount: 0,
        recentForfeitsInLastHour: 0,
        isAntiJeuRisk: false,
        winsByFormat: {
          twoPlayers: { wins: 0, total: 0 },
          threePlayers: { wins: 0, total: 0 },
          fourPlayers: { wins: 0, total: 0 },
        },
        antifraudAlerts: {
          highAbandonRisk: false,
          collusionRisk: false,
          spamAntiFairplayRisk: false,
        },
        recentMatches: [],
        lastActive: u.updatedAt || u.createdAt || Date.now(),
        firstJoined: u.createdAt || Date.now(),
      };
    });

    // Register or sync active local player from profile service so victories and stats are accurate
    try {
      const localProfile = playerProfileService.getLocalProfile();
      const activeName = localProfile.displayName || localStorage.getItem('njambo_player_name') || 'Joueur (Vous)';
      const activeUid = localProfile.uid || localStorage.getItem('njambo_player_id') || 'usr_local';

      if (activeUid && !isKnownBot(activeName, activeUid)) {
        const stats = localProfile.stats || ({} as any);
        const gamesWon = stats.partiesWon || stats.gamesWon || 0;
        const gamesPlayed = Math.max(stats.partiesPlayed || stats.gamesPlayed || 0, gamesWon);
        const winRate = gamesPlayed > 0 ? Math.round((gamesWon / gamesPlayed) * 100) : 0;
        const koraCount = stats.koraCount || 0;
        const doubleKoraCount = stats.doubleKoraCount || 0;

        if (playerMap[activeUid]) {
          playerMap[activeUid].name = activeName;
          playerMap[activeUid].isHuman = true;
          playerMap[activeUid].victories = Math.max(playerMap[activeUid].victories, gamesWon);
          playerMap[activeUid].totalGames = Math.max(playerMap[activeUid].totalGames, gamesPlayed);
          playerMap[activeUid].koraCount = Math.max(playerMap[activeUid].koraCount, koraCount);
          playerMap[activeUid].doubleKoraCount = Math.max(playerMap[activeUid].doubleKoraCount, doubleKoraCount);
          playerMap[activeUid].winRate = playerMap[activeUid].totalGames > 0
            ? Math.round((playerMap[activeUid].victories / playerMap[activeUid].totalGames) * 100)
            : winRate;
        } else {
          playerMap[activeUid] = {
            id: activeUid,
            name: activeName,
            isHuman: true,
            chipsBalance: localProfile.chips ?? 5000,
            totalGames: gamesPlayed,
            victories: gamesWon,
            defeats: Math.max(0, gamesPlayed - gamesWon),
            winRate,
            chipsWon: stats.fortune || 0,
            chipsLost: 0,
            totalPartiesPlayed: gamesPlayed,
            totalPartiesWon: gamesWon,
            totalManchesPlayed: gamesPlayed,
            totalManchesWon: gamesWon,
            koraCount,
            doubleKoraCount,
            status: 'ACTIVE',
            warningsCount: 0,
            abandonCount: 0,
            abandonRate: 0,
            forfeitsCount: 0,
            recentForfeitsInLastHour: 0,
            isAntiJeuRisk: false,
            winsByFormat: {
              twoPlayers: { wins: 0, total: 0 },
              threePlayers: { wins: 0, total: 0 },
              fourPlayers: { wins: 0, total: 0 },
            },
            antifraudAlerts: {
              highAbandonRisk: false,
              collusionRisk: false,
              spamAntiFairplayRisk: false,
            },
            recentMatches: [],
            lastActive: Date.now(),
            firstJoined: Date.now() - 1000 * 60 * 60 * 24 * 7,
          };
        }
      }
    } catch (err) {
      console.warn('[KatikaService] Local profile sync warning:', err);
    }

    // Helper to get or initialize a player safely
    const ensurePlayer = (pId: string, pName: string, isHumanHint?: boolean) => {
      if (!playerMap[pId]) {
        const isBot = isKnownBot(pName, pId) || (isHumanHint === false);

        playerMap[pId] = {
          id: pId,
          name: pName,
          isHuman: !isBot,
          chipsBalance: 5000,
          totalGames: 0,
          victories: 0,
          defeats: 0,
          winRate: 0,
          chipsWon: 0,
          chipsLost: 0,
          totalPartiesPlayed: 0,
          totalPartiesWon: 0,
          totalManchesPlayed: 0,
          totalManchesWon: 0,
          koraCount: 0,
          doubleKoraCount: 0,
          status: 'ACTIVE',
          warningsCount: 0,
          abandonCount: 0,
          abandonRate: 0,
          winsByFormat: {
            twoPlayers: { wins: 0, total: 0 },
            threePlayers: { wins: 0, total: 0 },
            fourPlayers: { wins: 0, total: 0 },
          },
          antifraudAlerts: {
            highAbandonRisk: false,
            collusionRisk: false,
            spamAntiFairplayRisk: false,
          },
          recentMatches: [],
          lastActive: Date.now(),
          firstJoined: Date.now(),
        };
      }
      return playerMap[pId];
    };

    // Parse all match records
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    records.forEach((rec) => {
      const isAbandoned = rec.isAbandoned === true || 
        rec.winnerName?.toLowerCase().includes('abandon') || 
        rec.winnerName?.toLowerCase().includes('interrompue');

      const isForfeit = (rec.winType as string) === 'FORFEIT' || 
        (rec as any).isForfeit === true || 
        rec.winnerName?.toLowerCase().includes('forfait');

      // Track abandon and forfeit penalty for the leaver
      const leaverId = rec.leaverId || (rec.winnerName?.toLowerCase().includes('abandon') || rec.winnerName?.toLowerCase().includes('forfait') ? rec.winnerId : undefined);
      if (leaverId && playerMap[leaverId]) {
        playerMap[leaverId].abandonCount = (playerMap[leaverId].abandonCount || 0) + 1;
        if (isForfeit) {
          playerMap[leaverId].forfeitsCount = (playerMap[leaverId].forfeitsCount || 0) + 1;
          if (rec.createdAt >= oneHourAgo) {
            playerMap[leaverId].recentForfeitsInLastHour = (playerMap[leaverId].recentForfeitsInLastHour || 0) + 1;
          }
        }
      }

      // Collect all players who took part in this game
      let participants: Array<{ id: string; name: string; isHuman?: boolean; isWinner?: boolean }> = [];

      if (rec.players && rec.players.length > 0) {
        participants = rec.players.filter(
          p => p.name && !p.name.toLowerCase().includes('abandon') && !p.name.toLowerCase().includes('interrompue')
        );
      } else if (rec.winnerName && !rec.winnerName.toLowerCase().includes('abandon') && !rec.winnerName.toLowerCase().includes('interrompue')) {
        const wId = rec.winnerId || ('usr_' + rec.winnerName.toLowerCase().replace(/[^a-z0-9]/g, ''));
        participants = [{ id: wId, name: rec.winnerName, isHuman: true, isWinner: true }];
      }

      const partiesInManche = rec.partiesCount || rec.roundsCount || 1;
      const baseBet = rec.baseBet || 50;
      const totalPotWon = rec.potWon || (baseBet * (rec.playerCount || 2));
      const lostStake = baseBet || Math.round(totalPotWon / Math.max(2, rec.playerCount || 2));

      participants.forEach((pInfo) => {
        // Exclude fake abandon entities
        if (pInfo.name === 'Abandon' || pInfo.name === 'Abandon (Forfait)' || pInfo.name === 'Manche Interrompue') return;

        const p = ensurePlayer(pInfo.id, pInfo.name, pInfo.isHuman);

        if (rec.createdAt < p.firstJoined) p.firstJoined = rec.createdAt;
        if (rec.createdAt > p.lastActive) p.lastActive = rec.createdAt;

        // Is this participant the winner of the match?
        const isWinner = !isAbandoned && (
          pInfo.isWinner === true ||
          pInfo.id === rec.winnerId ||
          (rec.winnerName && pInfo.name === rec.winnerName)
        );

        p.totalGames++;
        p.totalManchesPlayed = p.totalGames;
        p.totalPartiesPlayed = (p.totalPartiesPlayed || 0) + partiesInManche;

        // Format tracking
        if (rec.playerCount === 2) p.winsByFormat.twoPlayers.total++;
        else if (rec.playerCount === 3) p.winsByFormat.threePlayers.total++;
        else if (rec.playerCount === 4) p.winsByFormat.fourPlayers.total++;

        if (isWinner) {
          p.victories++;
          p.totalManchesWon = p.victories;
          p.chipsWon = (p.chipsWon || 0) + totalPotWon;
          p.chipsBalance += totalPotWon;
          p.totalPartiesWon = (p.totalPartiesWon || 0) + Math.max(Math.round(partiesInManche / Math.max(2, rec.playerCount || 2)), 1);

          // Strictly Exclusive Kora vs Double Kora counting
          if (rec.winType === 'KORA') {
            p.koraCount++;
          } else if (rec.winType === 'DOUBLE_KORA') {
            p.doubleKoraCount = (p.doubleKoraCount || 0) + 1;
          }

          if (rec.playerCount === 2) p.winsByFormat.twoPlayers.wins++;
          else if (rec.playerCount === 3) p.winsByFormat.threePlayers.wins++;
          else if (rec.playerCount === 4) p.winsByFormat.fourPlayers.wins++;

          p.recentMatches?.unshift({
            id: rec.id || `m_${rec.createdAt}`,
            date: rec.createdAt,
            mode: rec.mode,
            playerCount: rec.playerCount,
            result: 'WIN',
            winType: rec.winType,
            chipsDelta: totalPotWon,
            opponents: participants.filter(o => o.id !== p.id).map(o => o.name),
            partiesCount: partiesInManche,
            isMancheFinalWin: true,
          });
        } else {
          // Defeat tracking
          p.defeats = (p.defeats || 0) + 1;
          p.chipsLost = (p.chipsLost || 0) + lostStake;
          p.chipsBalance = Math.max(0, p.chipsBalance - lostStake);

          p.recentMatches?.unshift({
            id: rec.id || `m_${rec.createdAt}`,
            date: rec.createdAt,
            mode: rec.mode,
            playerCount: rec.playerCount,
            result: 'LOSS',
            winType: rec.winType,
            chipsDelta: -lostStake,
            opponents: participants.filter(o => o.id !== p.id).map(o => o.name),
            partiesCount: partiesInManche,
            isMancheFinalWin: false,
          });
        }
      });
    });

    // Populate realistic anti-fraud heuristics and format distribution for all players
    // Also remove any fake abandon player entities
    delete playerMap['usr_abandon'];
    delete playerMap['usr_abandonforfait'];
    delete playerMap['usr_mancheinterrompue'];

    Object.values(playerMap).forEach((p) => {
      // Calculate true winRate based on both victories and defeats
      p.totalGames = p.victories + (p.defeats || 0);
      p.winRate = p.totalGames > 0 ? Math.round((p.victories / p.totalGames) * 100) : 0;
      p.totalManchesPlayed = p.totalGames;
      p.totalManchesWon = p.victories;

      // Ensure format totals are consistent
      if (p.totalGames === 0) {
        p.winsByFormat = {
          twoPlayers: { wins: 0, total: 0 },
          threePlayers: { wins: 0, total: 0 },
          fourPlayers: { wins: 0, total: 0 },
        };
      }

      // Strict bot determination: Bots are system entities and are NEVER subject to antifraud alerts
      const isBot = !p.isHuman || isKnownBot(p.name, p.id);

      if (isBot) {
        p.isHuman = false;
        p.abandonCount = 0;
        p.abandonRate = 0;
        p.antifraudAlerts = {
          highAbandonRisk: false,
          collusionRisk: false,
          spamAntiFairplayRisk: false,
          actionsPerSecondPeak: 0,
        };
      } else {
        p.isHuman = true;
        // Real human player antifraud metrics based on genuine telemetry
        const realAbandons = records.filter(
          (r) => r.isAbandoned === true && (r.leaverId === p.id || (r.winnerId === p.id && r.winnerName?.toLowerCase().includes('abandon')))
        ).length;

        p.abandonCount = Math.max(p.abandonCount || 0, realAbandons);
        const totalAttempted = p.totalGames + p.abandonCount;
        p.abandonRate = totalAttempted > 0 ? Math.round((p.abandonCount / totalAttempted) * 100) : 0;

        // Human antifraud evaluation:
        // High abandon risk: repeat abusive quitters (at least 6 games attempted with >= 35% intentional quits and at least 3 quits)
        const highAbandonRisk = totalAttempted >= 6 && p.abandonCount >= 3 && p.abandonRate >= 35;
        
        // Modération automatique des abandons (Spécification Katika):
        // Un joueur cumulant un nombre excessif de forfaits réclamés contre lui (ex: 3 forfaits en 1 heure ou 3 forfaits cumulés)
        // est automatiquement tagué "Risque Anti-Jeu" dans Katika
        const recentForfeits = p.recentForfeitsInLastHour || 0;
        const totalForfeits = p.forfeitsCount || 0;
        const isAntiJeu = recentForfeits >= 3 || totalForfeits >= 3 || highAbandonRisk;
        p.isAntiJeuRisk = isAntiJeu;

        p.antifraudAlerts = {
          highAbandonRisk,
          collusionRisk: false,
          spamAntiFairplayRisk: isAntiJeu,
          actionsPerSecondPeak: 1.6, // Normal ergonomic human cadence
        };
      }

      // Limit recent matches to 10
      if (p.recentMatches) {
        p.recentMatches = p.recentMatches.slice(0, 10);
      }

      // Apply overrides if any (persisted admin sanctions or manual adjustments)
      if (overrides[p.id]) {
        Object.assign(p, overrides[p.id]);
      }
    });

    const sortedPlayers = Object.values(playerMap).sort((a, b) => {
      // Humans strictly before bots
      if (a.isHuman !== b.isHuman) return a.isHuman ? -1 : 1;
      // Highest victories first
      if (b.victories !== a.victories) return b.victories - a.victories;
      // Highest koras next
      const bKoras = (b.koraCount || 0) + (b.doubleKoraCount || 0);
      const aKoras = (a.koraCount || 0) + (a.doubleKoraCount || 0);
      if (bKoras !== aKoras) return bKoras - aKoras;
      // Highest chips next
      return (b.chipsBalance || 0) - (a.chipsBalance || 0);
    });

    cachedPlayersData = { data: sortedPlayers, timestamp: Date.now() };
    return sortedPlayers;
  },

  updatePlayerStatus: async (
    playerId: string, 
    status: 'ACTIVE' | 'WARNED' | 'BANNED', 
    reason?: string,
    banType: 'NONE' | 'TEMPORARY' | 'PERMANENT' = 'PERMANENT',
    durationHours?: number
  ): Promise<KatikaPlayer> => {
    invalidateKatikaMemoryCache();
    const players = await KatikaService.getPlayers();
    let player = players.find(p => p.id === playerId);
    if (!player) {
      player = {
        id: playerId,
        name: `Joueur ${playerId}`,
        chipsBalance: 5000,
        totalGames: 0,
        victories: 0,
        koraCount: 0,
        status: 'ACTIVE',
        warningsCount: 0,
        abandonCount: 0,
        abandonRate: 0,
        winsByFormat: {
          twoPlayers: { wins: 0, total: 0 },
          threePlayers: { wins: 0, total: 0 },
          fourPlayers: { wins: 0, total: 0 },
        },
        antifraudAlerts: {
          highAbandonRisk: false,
          collusionRisk: false,
          spamAntiFairplayRisk: false,
        },
        lastActive: Date.now(),
        firstJoined: Date.now(),
      };
    }

    player.status = status;
    player.bannedReason = reason || player.bannedReason;
    player.banType = status === 'BANNED' ? banType : 'NONE';
    player.banExpiresAt = (status === 'BANNED' && banType === 'TEMPORARY' && durationHours) 
      ? Date.now() + durationHours * 3600 * 1000 
      : null;

    if (status === 'WARNED') {
      player.warningsCount = (player.warningsCount || 0) + 1;
      player.warningsHistory = player.warningsHistory || [];
      player.warningsHistory.unshift({
        date: Date.now(),
        reason: reason || 'Comportement suspect',
        actor: 'Katika Master',
      });
    }

    // Save override locally and on server
    try {
      const saved = localStorage.getItem('katika_player_overrides');
      const overrides = saved ? JSON.parse(saved) : {};
      overrides[playerId] = {
        status: player.status,
        bannedReason: player.bannedReason,
        banType: player.banType,
        banExpiresAt: player.banExpiresAt,
        warningsCount: player.warningsCount,
        warningsHistory: player.warningsHistory,
        chipsBalance: player.chipsBalance,
      };
      localStorage.setItem('katika_player_overrides', JSON.stringify(overrides));
    } catch (e) {
      // ignore
    }

    if (status === 'BANNED') {
      try {
        await tikaFetch('/api/katika/ban-player', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            playerId,
            reason: reason || 'Sanction administrative',
            banType,
            expiresAt: player.banExpiresAt,
          }),
        });
      } catch (e) {
        console.warn('[KatikaService] Could not reach ban-player endpoint:', e);
      }
    }

    const logItem: KatikaAuditLog = {
      id: `log-${Date.now()}`,
      timestamp: Date.now(),
      type: 'KATIKA_ACTION',
      severity: status === 'BANNED' ? 'CRITICAL' : 'WARNING',
      actor: 'Katika Master',
      summary: `Sanction joueur ${player.name} : ${status} (${banType})`,
      details: { playerId, status, banType, reason, expiresAt: player.banExpiresAt },
    };

    mockAuditLogs.unshift(logItem);
    try {
      await tikaFetch('/api/katika/audit-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ log: logItem }),
      });
    } catch (e) {
      // ignore
    }

    return player;
  },

  resetPlayerChips: async (
    playerId: string,
    newBalance: number,
    reason: string
  ): Promise<KatikaPlayer> => {
    invalidateKatikaMemoryCache();
    const players = await KatikaService.getPlayers();
    let player = players.find(p => p.id === playerId);
    if (!player) throw new Error('Joueur introuvable');

    const previousBalance = player.chipsBalance;
    player.chipsBalance = Math.max(0, newBalance);

    try {
      const saved = localStorage.getItem('katika_player_overrides');
      const overrides = saved ? JSON.parse(saved) : {};
      overrides[playerId] = {
        ...(overrides[playerId] || {}),
        chipsBalance: player.chipsBalance,
      };
      localStorage.setItem('katika_player_overrides', JSON.stringify(overrides));
    } catch (e) {
      // ignore
    }

    try {
      if (db) {
        await setDoc(doc(db, 'users', playerId), {
          stats: {
            totalChipsWon: player.chipsBalance,
          },
          updatedAt: Date.now(),
        }, { merge: true });
      }
    } catch (e) {
      console.warn('[KatikaService] Could not persist chips to Firestore users collection:', e);
    }

    try {
      await tikaFetch('/api/katika/player-chips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId, newBalance: player.chipsBalance, reason }),
      });
    } catch (e) {
      console.warn('[KatikaService] Could not reach player-chips endpoint:', e);
    }

    const logItem: KatikaAuditLog = {
      id: `log-${Date.now()}`,
      timestamp: Date.now(),
      type: 'KATIKA_ACTION',
      severity: 'WARNING',
      actor: 'Katika Master',
      summary: `Réinitialisation des jetons de ${player.name} : ${previousBalance} ➔ ${player.chipsBalance} jetons`,
      details: { playerId, previousBalance, newBalance: player.chipsBalance, reason },
    };

    mockAuditLogs.unshift(logItem);
    try {
      await tikaFetch('/api/katika/audit-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ log: logItem }),
      });
    } catch (e) {
      // ignore
    }

    return player;
  },

  validateUserForLeaderboard: async (playerId: string): Promise<void> => {
    invalidateKatikaMemoryCache();
    if (db) {
      try {
        await setDoc(doc(db, 'users', playerId), {
          isGuest: false,
          authProvider: 'google.com',
          isBot: false,
          updatedAt: Date.now(),
        }, { merge: true });
      } catch (err) {
        console.error('[KatikaService] Error validating user for leaderboard in Firestore:', err);
        throw err;
      }
    }

    const logItem: KatikaAuditLog = {
      id: `log-val-${Date.now()}`,
      timestamp: Date.now(),
      type: 'KATIKA_ACTION',
      severity: 'INFO',
      actor: 'Katika Master',
      summary: `Validation manuelle Palmarès pour le compte ${playerId}`,
      details: { playerId, action: 'VALIDATE_LEADERBOARD', authProvider: 'google.com', isGuest: false },
    };
    mockAuditLogs.unshift(logItem);
  },

  markUserAsBot: async (playerId: string): Promise<void> => {
    invalidateKatikaMemoryCache();
    if (db) {
      try {
        await setDoc(doc(db, 'users', playerId), {
          isBot: true,
          updatedAt: Date.now(),
        }, { merge: true });
      } catch (err) {
        console.error('[KatikaService] Error marking user as bot in Firestore:', err);
        throw err;
      }
    }

    const logItem: KatikaAuditLog = {
      id: `log-bot-${Date.now()}`,
      timestamp: Date.now(),
      type: 'KATIKA_ACTION',
      severity: 'WARNING',
      actor: 'Katika Master',
      summary: `Compte ${playerId} marqué comme BOT / Simulateur`,
      details: { playerId, action: 'MARK_AS_BOT', isBot: true },
    };
    mockAuditLogs.unshift(logItem);
  },

  deleteUserFromDatabase: async (playerId: string): Promise<void> => {
    invalidateKatikaMemoryCache();
    if (db) {
      try {
        await deleteDoc(doc(db, 'users', playerId));
      } catch (err) {
        console.error('[KatikaService] Error deleting user in Firestore:', err);
        throw err;
      }
    }

    const logItem: KatikaAuditLog = {
      id: `log-del-${Date.now()}`,
      timestamp: Date.now(),
      type: 'KATIKA_ACTION',
      severity: 'CRITICAL',
      actor: 'Katika Master',
      summary: `Suppression définitive du compte ${playerId} de la base /users`,
      details: { playerId, action: 'DELETE_USER' },
    };
    mockAuditLogs.unshift(logItem);
  },

  getConfig: async (): Promise<KatikaGameConfig> => {
    try {
      const res = await tikaFetch('/api/katika/engine-config');
      if (res.ok) {
        const live = await res.json();
        mockConfig = {
          ...mockConfig,
          turnTimerSeconds: live.turnTimerSeconds ?? mockConfig.turnTimerSeconds,
          reconnectTimeoutSeconds: live.reconnectTimeoutSeconds ?? live.reconnectGracePeriodSeconds ?? mockConfig.reconnectTimeoutSeconds,
          isMaintenanceMode: live.isMaintenanceMode ?? mockConfig.isMaintenanceMode,
          allowNewRooms: live.allowNewRooms ?? mockConfig.allowNewRooms,
          defaultInitialCapital: live.defaultInitialCapital ?? mockConfig.defaultInitialCapital,
          minTableBet: live.minTableBet ?? mockConfig.minTableBet,
          globalAnnouncement: live.globalAnnouncement ?? mockConfig.globalAnnouncement,
          bettingEconomyEnabled: live.bettingEconomyEnabled ?? mockConfig.bettingEconomyEnabled ?? false,
          transitionDelayMs: live.transitionDelayMs ?? mockConfig.transitionDelayMs,
          botThinkTimeMs: live.botThinkTimeMs ?? mockConfig.botThinkTimeMs,
          trickResolutionTimeMs: live.trickResolutionTimeMs ?? mockConfig.trickResolutionTimeMs,
          instantWinAnimationTimeMs: live.instantWinAnimationTimeMs ?? mockConfig.instantWinAnimationTimeMs,
          hokutoSpawnRatePct: live.hokutoSpawnRatePct ?? mockConfig.hokutoSpawnRatePct,
          globalRakePct: live.globalRakePct ?? mockConfig.globalRakePct,
          allowAutoAdvance: live.allowAutoAdvance ?? mockConfig.allowAutoAdvance,
          emptyRoomTimeoutMinutes: live.emptyRoomTimeoutMinutes ?? mockConfig.emptyRoomTimeoutMinutes ?? 5,
          koraMultiplier: live.koraMultiplier ?? mockConfig.koraMultiplier ?? 2,
          doubleKoraMultiplier: live.doubleKoraMultiplier ?? mockConfig.doubleKoraMultiplier ?? 4,
          enableAutoBetEscalation: live.enableAutoBetEscalation ?? mockConfig.enableAutoBetEscalation ?? true,
          autoBetEscalationInterval: live.autoBetEscalationInterval ?? mockConfig.autoBetEscalationInterval ?? 5,
          autoBetEscalationRatePct: live.autoBetEscalationRatePct ?? mockConfig.autoBetEscalationRatePct ?? 50,
          maxAutoBetMultiplier: live.maxAutoBetMultiplier ?? mockConfig.maxAutoBetMultiplier ?? 4,
        };
        notifyConfigListeners();
      }
    } catch (e) {
      console.warn('[KatikaService] Could not reach engine-config endpoint:', e);
    }
    return { ...mockConfig };
  },

  updateConfig: async (newConfig: Partial<KatikaGameConfig>): Promise<KatikaGameConfig> => {
    invalidateKatikaMemoryCache();
    mockConfig = {
      ...mockConfig,
      ...newConfig,
    };
    notifyConfigListeners();

    try {
      await tikaFetch('/api/katika/engine-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mockConfig),
      });
    } catch (e) {
      console.warn('[KatikaService] Failed to persist hot config to server:', e);
    }

    mockAuditLogs.unshift({
      id: `log-${Date.now()}`,
      timestamp: Date.now(),
      type: 'CONFIG_CHANGE',
      severity: 'WARNING',
      actor: 'Katika Master',
      summary: 'Mise à jour des paramètres du moteur & de l\'économie Katika',
      details: mockConfig,
    });

    return { ...mockConfig };
  },

  getAuditLogs: async (): Promise<KatikaAuditLog[]> => {
    try {
      const res = await tikaFetch('/api/katika/audit-logs');
      if (res.ok) {
        const data = await res.json();
        if (data.logs && Array.isArray(data.logs)) {
          // Merge local mock logs if any unique ones exist
          const merged = [...data.logs];
          mockAuditLogs.forEach((ml) => {
            if (!merged.some((l) => l.id === ml.id)) {
              merged.push(ml);
            }
          });
          merged.sort((a, b) => b.timestamp - a.timestamp);
          return merged;
        }
      }
    } catch (e) {
      console.warn('[KatikaService] Could not reach audit-logs endpoint:', e);
    }
    return [...mockAuditLogs];
  },

  closeRoom: async (roomId: string, reason: string): Promise<void> => {
    try {
      await tikaFetch(`/api/katika/rooms/${roomId}/close`, { method: 'POST' });
    } catch (err) {
      console.warn('[KatikaService] Could not reach closeRoom endpoint:', err);
    }

    mockAuditLogs.unshift({
      id: `log-${Date.now()}`,
      timestamp: Date.now(),
      type: 'KATIKA_ACTION',
      severity: 'WARNING',
      actor: 'Katika Master',
      summary: `Fermeture administrative de la table ${roomId}`,
      details: { roomId, reason },
    });
  },

  kickPlayer: async (roomId: string, playerId: string, playerName: string): Promise<void> => {
    try {
      await tikaFetch(`/api/katika/rooms/${roomId}/kick`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId }),
      });
    } catch (err) {
      console.warn('[KatikaService] Could not reach kickPlayer endpoint:', err);
    }

    mockAuditLogs.unshift({
      id: `log-${Date.now()}`,
      timestamp: Date.now(),
      type: 'KATIKA_ACTION',
      severity: 'WARNING',
      actor: 'Katika Master',
      summary: `Expulsion administrative du joueur ${playerName} (${playerId}) de la table ${roomId}`,
      details: { roomId, playerId, playerName },
    });
  },

  resetRound: async (roomId: string): Promise<void> => {
    try {
      await tikaFetch(`/api/katika/rooms/${roomId}/reset-round`, { method: 'POST' });
    } catch (err) {
      console.warn('[KatikaService] Could not reach resetRound endpoint:', err);
    }

    mockAuditLogs.unshift({
      id: `log-${Date.now()}`,
      timestamp: Date.now(),
      type: 'KATIKA_ACTION',
      severity: 'WARNING',
      actor: 'Katika Master',
      summary: `Réinitialisation administrative de la manche sur la table ${roomId}`,
      details: { roomId },
    });
  },

  sendAdminMessage: async (roomId: string, playerId: string | null, message: string): Promise<void> => {
    try {
      await tikaFetch(`/api/katika/rooms/${roomId}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId, message }),
      });
    } catch (err) {
      console.warn('[KatikaService] Could not reach sendAdminMessage endpoint:', err);
    }

    mockAuditLogs.unshift({
      id: `log-${Date.now()}`,
      timestamp: Date.now(),
      type: 'KATIKA_ACTION',
      severity: 'INFO',
      actor: 'Katika Master',
      summary: `Message administratif envoyé sur la table ${roomId}${playerId ? ` au joueur (${playerId})` : ''} : "${message}"`,
      details: { roomId, playerId, message },
    });
  },

  /**
   * Audit et assainissement pré-déploiement des règles Firestore.
   * Scanne tous les profils de users/{uid} :
   * 1. Détecte et corrige les violations d'invariants (compteurs, non-régression, bornes, types, fairPlay, displayName).
   * 2. Migre et isole l'email dans users/{uid}/private/profile, puis le supprime du document public (deleteField).
   * 3. Sauvegarde chaque profil modifié dans statsLegacyBackup et fournit un export JSON téléchargeable.
   */
  auditAndSanitizeAllProfiles: async (): Promise<ProfileAuditReport> => {
    invalidateKatikaMemoryCache();
    if (!db) {
      throw new Error('Firestore database instance unavailable');
    }

    const usersRef = collection(db, 'users');
    const snapshot = await getDocs(usersRef);

    let totalScanned = 0;
    let totalHealthy = 0;
    let totalCorrected = 0;
    const corrections: ProfileCorrectionEntry[] = [];
    const backupList: any[] = [];

    for (const docSnap of snapshot.docs) {
      totalScanned++;
      const uid = docSnap.id;
      const data = docSnap.data() || {};
      const reasons: string[] = [];
      const appliedFixes: string[] = [];
      const userRef = doc(db, 'users', uid);

      let needsUpdate = false;
      const patch: Record<string, any> = {};

      // 1. Audit et migration de l'e-mail privé
      const hasEmailExposed = 'email' in data && data.email !== null && data.email !== undefined && String(data.email).trim() !== '';
      if (hasEmailExposed) {
        const rawEmail = String(data.email).trim();
        reasons.push(`Email personnel exposé dans le document public : ${rawEmail}`);
        // Copier dans le sous-document privé
        try {
          const privateProfileRef = doc(db, 'users', uid, 'private', 'profile');
          await setDoc(privateProfileRef, {
            email: rawEmail,
            uid,
            migratedAt: Date.now(),
            updatedAt: Date.now(),
          }, { merge: true });
          appliedFixes.push(`Email copié dans users/${uid}/private/profile`);
        } catch (err) {
          console.warn(`[KatikaService] Erreur lors de la copie privée de l'email pour ${uid}:`, err);
        }
        // Supprimer du document public
        patch.email = deleteField();
        appliedFixes.push(`Champ 'email' supprimé du document public via deleteField()`);
        needsUpdate = true;
      }

      // 2. Audit du displayName
      const rawName = data.displayName;
      let cleanName = rawName;
      if (typeof rawName !== 'string' || rawName.trim() === '') {
        reasons.push(`displayName vide ou non-chaîne (valeur: ${JSON.stringify(rawName)})`);
        cleanName = 'Joueur';
        patch.displayName = cleanName;
        appliedFixes.push(`displayName réinitialisé à 'Joueur'`);
        needsUpdate = true;
      } else if (rawName.trim().length > 30) {
        reasons.push(`displayName dépasse 30 caractères (${rawName.trim().length} car.)`);
        cleanName = rawName.trim().slice(0, 30);
        patch.displayName = cleanName;
        appliedFixes.push(`displayName tronqué à 30 caractères ('${cleanName}')`);
        needsUpdate = true;
      }

      // 3. Audit des Jetons (chips >= 0)
      const currentChips = data.chips;
      if (typeof currentChips !== 'number' || isNaN(currentChips)) {
        reasons.push(`Solde de jetons non numérique : ${currentChips}`);
        patch.chips = 1000;
        appliedFixes.push(`Jetons réinitialisés à la valeur par défaut (1000)`);
        needsUpdate = true;
      } else if (currentChips < 0) {
        reasons.push(`Solde de jetons négatif (${currentChips})`);
        patch.chips = 0;
        appliedFixes.push(`Solde de jetons ramené au plancher minimum (0)`);
        needsUpdate = true;
      }

      // 4. Audit des Statistiques (PlayerStats) et Invariants de jeu
      const rawStats = (data.stats && typeof data.stats === 'object') ? { ...data.stats } : {};
      let statsModified = false;

      // Fonctions utilitaires de validation des entiers
      const getNum = (v: any, fallback = 0) => (typeof v === 'number' && !isNaN(v) && v >= 0) ? Math.floor(v) : fallback;

      const partiesPlayed = getNum(rawStats.partiesPlayed, 0);
      const partiesWon = getNum(rawStats.partiesWon, 0);
      if (partiesWon > partiesPlayed) {
        reasons.push(`partiesWon (${partiesWon}) > partiesPlayed (${partiesPlayed})`);
        rawStats.partiesPlayed = partiesWon;
        appliedFixes.push(`partiesPlayed ajusté de ${partiesPlayed} à ${partiesWon}`);
        statsModified = true;
      }

      const gamesPlayed = getNum(rawStats.gamesPlayed, 0);
      const gamesWon = getNum(rawStats.gamesWon, 0);
      if (gamesWon > gamesPlayed) {
        reasons.push(`gamesWon (${gamesWon}) > gamesPlayed (${gamesPlayed})`);
        rawStats.gamesPlayed = gamesWon;
        appliedFixes.push(`gamesPlayed ajusté de ${gamesPlayed} à ${gamesWon}`);
        statsModified = true;
      }

      const manchesPlayed = getNum(rawStats.manchesPlayed, 0);
      const manchesWon = getNum(rawStats.manchesWon, 0);
      if (manchesWon > manchesPlayed) {
        reasons.push(`manchesWon (${manchesWon}) > manchesPlayed (${manchesPlayed})`);
        rawStats.manchesPlayed = manchesWon;
        appliedFixes.push(`manchesPlayed ajusté de ${manchesPlayed} à ${manchesWon}`);
        statsModified = true;
      }

      const koraCount = getNum(rawStats.koraCount, 0);
      const doubleKoraCount = getNum(rawStats.doubleKoraCount, 0);
      if (doubleKoraCount > koraCount) {
        reasons.push(`doubleKoraCount (${doubleKoraCount}) > koraCount (${koraCount})`);
        rawStats.koraCount = doubleKoraCount;
        appliedFixes.push(`koraCount ajusté de ${koraCount} à ${doubleKoraCount}`);
        statsModified = true;
      }

      const soloGamesPlayed = getNum(rawStats.soloGamesPlayed, 0);
      const soloGamesWon = getNum(rawStats.soloGamesWon, 0);
      if (soloGamesWon > soloGamesPlayed) {
        reasons.push(`soloGamesWon (${soloGamesWon}) > soloGamesPlayed (${soloGamesPlayed})`);
        rawStats.soloGamesPlayed = soloGamesWon;
        appliedFixes.push(`soloGamesPlayed ajusté de ${soloGamesPlayed} à ${soloGamesWon}`);
        statsModified = true;
      }

      const multiplayerGamesPlayed = getNum(rawStats.multiplayerGamesPlayed, 0);
      const multiplayerGamesWon = getNum(rawStats.multiplayerGamesWon, 0);
      if (multiplayerGamesWon > multiplayerGamesPlayed) {
        reasons.push(`multiplayerGamesWon (${multiplayerGamesWon}) > multiplayerGamesPlayed (${multiplayerGamesPlayed})`);
        rawStats.multiplayerGamesPlayed = multiplayerGamesWon;
        appliedFixes.push(`multiplayerGamesPlayed ajusté de ${multiplayerGamesPlayed} à ${multiplayerGamesWon}`);
        statsModified = true;
      }

      const soloManchesPlayed = getNum(rawStats.soloManchesPlayed, 0);
      const soloManchesWon = getNum(rawStats.soloManchesWon, 0);
      if (soloManchesWon > soloManchesPlayed) {
        reasons.push(`soloManchesWon (${soloManchesWon}) > soloManchesPlayed (${soloManchesPlayed})`);
        rawStats.soloManchesPlayed = soloManchesWon;
        appliedFixes.push(`soloManchesPlayed ajusté de ${soloManchesPlayed} à ${soloManchesWon}`);
        statsModified = true;
      }

      const multiplayerManchesPlayed = getNum(rawStats.multiplayerManchesPlayed, 0);
      const multiplayerManchesWon = getNum(rawStats.multiplayerManchesWon, 0);
      if (multiplayerManchesWon > multiplayerManchesPlayed) {
        reasons.push(`multiplayerManchesWon (${multiplayerManchesWon}) > multiplayerManchesPlayed (${multiplayerManchesPlayed})`);
        rawStats.multiplayerManchesPlayed = multiplayerManchesWon;
        appliedFixes.push(`multiplayerManchesPlayed ajusté de ${multiplayerManchesPlayed} à ${multiplayerManchesWon}`);
        statsModified = true;
      }

      // 4. Migration scoreVersion: 2 et calcul du score de maîtrise
      if (data.scoreVersion !== 2) {
        reasons.push(`Profil non migré en scoreVersion 2 (version actuelle: ${data.scoreVersion || 1})`);
        patch.scoreVersion = 2;
        needsUpdate = true;

        // Calculer depuis le journal historique
        let historyDocs: PlayerGameHistoryItem[] = [];
        try {
          const histSnap = await getDocs(
            query(collection(db, 'users', uid, 'history'), orderBy('createdAt', 'asc'))
          );
          historyDocs = histSnap.docs.map((d) => d.data() as PlayerGameHistoryItem);
        } catch (hErr) {
          console.warn(`[KatikaService] Erreur lecture historique pour ${uid}:`, hErr);
        }

        const partiesCounted = getNum(rawStats.partiesPlayed, 0);
        if (historyDocs.length < partiesCounted) {
          reasons.push(
            `Historique incomplet : ${historyDocs.length} entrées journal vs ${partiesCounted} parties comptabilisées.`
          );
          appliedFixes.push(
            `Migration scoreVersion 2 effectuée avec historique partiel (${historyDocs.length}/${partiesCounted})`
          );
        }

        if (historyDocs.length > 0) {
          let journalMastery = 0;
          const dailySoloPointsMap = new Map<string, number>();

          historyDocs.forEach((item) => {
            let eventPotential = 0;
            if (item.recordType === 'PARTIE' && item.isWinner) {
              eventPotential = computeEventMasteryScore({
                mode: item.mode,
                difficulty: item.difficulty,
                partiesWon: 1,
                koras: item.winType === 'KORA' ? 1 : 0,
                doubleKoras: item.winType === 'DOUBLE_KORA' ? 1 : 0,
              });
            } else if ((item.recordType === 'MANCHE' || !item.recordType) && item.isWinner) {
              eventPotential = computeEventMasteryScore({
                mode: item.mode,
                difficulty: item.difficulty,
                isMancheWinner: true,
                isForfeitWin: item.winType === 'FORFEIT',
              });
            }

            let awarded = 0;
            if (item.mode === 'SOLO' && eventPotential > 0) {
              const dateKey = getDoualaDateKey(item.createdAt);
              const currentDailySum = dailySoloPointsMap.get(dateKey) || 0;
              const cap = MASTERY_CONFIG.rules.dailySoloPointsCap; // 30
              if (currentDailySum < cap) {
                awarded = Math.min(eventPotential, cap - currentDailySum);
                dailySoloPointsMap.set(dateKey, currentDailySum + awarded);
              }
            } else {
              awarded = eventPotential;
            }
            journalMastery += awarded;
          });

          rawStats.masteryScore = journalMastery > 0 ? journalMastery : computeMasteryScore(rawStats as any);
        } else {
          // Aucun journal disponible : repli sur les compteurs pour ne pas léser le joueur
          rawStats.masteryScore = computeMasteryScore(rawStats as any);
        }

        appliedFixes.push(
          `scoreVersion: 2 inscrit à la racine, score calculé via journal historique (${rawStats.masteryScore} pts)`
        );
        statsModified = true;
      } else {
        // Déjà migré en scoreVersion 2 : préserver le score événementiel existant
      }

      if (statsModified || !data.stats) {
        patch.stats = rawStats;
        needsUpdate = true;
      }

      // 5. Audit des types Fair-Play
      const rawFp = (data.fairPlay && typeof data.fairPlay === 'object') ? { ...data.fairPlay } : {};
      let fpModified = false;

      const checkFpNum = (field: string) => {
        if (typeof rawFp[field] !== 'number' || isNaN(rawFp[field]) || rawFp[field] < 0) {
          reasons.push(`Champ fairPlay.${field} de type invalide (${rawFp[field]})`);
          rawFp[field] = 0;
          appliedFixes.push(`fairPlay.${field} normalisé à 0`);
          fpModified = true;
        }
      };

      checkFpNum('consecutiveForfeits');
      checkFpNum('totalForfeits');
      checkFpNum('totalFoldRounds');
      checkFpNum('prolongedDisconnects');
      checkFpNum('totalGamesStarted');

      if (rawFp.activeSanction !== undefined && rawFp.activeSanction !== null) {
        const s = rawFp.activeSanction;
        if (typeof s !== 'object' || typeof s.type !== 'string' || typeof s.active !== 'boolean') {
          reasons.push(`Structure activeSanction invalide`);
          rawFp.activeSanction = null;
          appliedFixes.push(`Structure activeSanction corrompue réinitialisée à null`);
          fpModified = true;
        }
      }

      if (!Array.isArray(rawFp.sanctionsHistory)) {
        rawFp.sanctionsHistory = [];
        fpModified = true;
      }

      if (fpModified || !data.fairPlay) {
        patch.fairPlay = rawFp;
        needsUpdate = true;
      }

      // Si le profil nécessite des corrections
      if (needsUpdate) {
        totalCorrected++;

        // Sauvegarde legacy avant correction dans le document
        patch.statsLegacyBackup = {
          backedUpAt: Date.now(),
          previousDisplayName: rawName,
          previousChips: currentChips,
          previousStats: data.stats || null,
          previousFairPlay: data.fairPlay || null,
          reasons: [...reasons],
        };
        patch.updatedAt = Date.now();

        // Ajout à l'export JSON global téléchargeable
        backupList.push({
          uid,
          capturedAt: new Date().toISOString(),
          originalDocument: { ...data },
          reasons,
          appliedFixes,
        });

        // Écriture sur Firestore
        await updateDoc(userRef, patch);

        corrections.push({
          uid,
          originalDisplayName: String(rawName || 'Sans nom'),
          reasons,
          appliedFixes,
          beforeData: data,
          afterData: { ...data, ...patch },
        });
      } else {
        totalHealthy++;
      }
    }

    const report: ProfileAuditReport = {
      totalScanned,
      totalHealthy,
      totalCorrected,
      corrections,
      backupJson: JSON.stringify(backupList, null, 2),
      timestamp: Date.now(),
    };

    mockAuditLogs.unshift({
      id: `log-${Date.now()}`,
      timestamp: Date.now(),
      type: 'KATIKA_ACTION',
      severity: totalCorrected > 0 ? 'WARNING' : 'INFO',
      actor: 'Katika Master',
      summary: `Audit de conformité des profils : ${totalScanned} analysés, ${totalCorrected} assainis, ${totalHealthy} conformes`,
      details: { totalScanned, totalCorrected, totalHealthy, correctionsCount: corrections.length },
    });

    return report;
  },

  /**
   * Déclenche le téléchargement immédiat du fichier JSON de sauvegarde de l'audit
   */
  downloadBackupJson: (report: ProfileAuditReport): void => {
    if (!report.backupJson) return;
    const blob = new Blob([report.backupJson], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `njambo-backup-profils-pre-migration-${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  },

  /**
   * Récupère la liste des administrateurs secondaires
   */
  getSecondaryAdmins: async (): Promise<SecondaryAdminRecord[]> => {
    const res = await tikaFetch('/api/katika/admins');
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Impossible de récupérer la liste des administrateurs.');
    }
    return data.admins || [];
  },

  /**
   * Accorde le droit administrateur secondaire à un compte Google par e-mail
   */
  grantSecondaryAdmin: async (email: string, reason?: string): Promise<SecondaryAdminRecord> => {
    const res = await tikaFetch('/api/katika/admins', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, reason }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Impossible d\'accorder l\'accès administrateur.');
    }
    return data.admin;
  },

  /**
   * Révoque le droit administrateur secondaire pour un UID
   */
  revokeSecondaryAdmin: async (uid: string): Promise<void> => {
    const res = await tikaFetch(`/api/katika/admins/${encodeURIComponent(uid)}`, {
      method: 'DELETE',
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Impossible de révoquer l\'accès administrateur.');
    }
  },
};
