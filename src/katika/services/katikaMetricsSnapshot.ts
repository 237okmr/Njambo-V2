import { KatikaService, isKnownBot } from './katikaService';
import { KatikaKPIs, KatikaLiveRoom, KatikaPlayer, KatikaAuditLog, KatikaGameConfig } from '../types/katika';
import { AdminNotesService } from './adminNotesService';
import { AdminNotesSnapshot } from '../types/adminNotes';
import { isEligibleLeaderboardUser } from '../../services/masteryConfig';

/**
 * Filtre et assainit rigoureusement les données sensibles (PII) telles que les adresses IP,
 * les adresses courriels et les tokens pour garantir une stricte confidentialité avant l'envoi au LLM.
 */
function sanitizePiiData(val: any): any {
  if (typeof val === 'string') {
    // Masquer les adresses email (ex: "237okmr@gmail.com" -> "Admin Master (237***)")
    let clean = val.replace(/([a-zA-Z0-9_\.\+-]+)@([a-zA-Z0-9-]+\.[a-zA-Z0-9-\.]+)/g, (match, user, domain) => {
      if (user.toLowerCase().includes('okmr') || match.toLowerCase() === '237okmr@gmail.com') {
        return 'Admin Master (237***)';
      }
      return `${user.substring(0, 3)}***@${domain}`;
    });
    // Masquer les adresses IPv4 (ex: "192.168.1.1" -> "192.168.***.***")
    clean = clean.replace(/\b(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\b/g, '$1.$2.***.***');
    return clean;
  }
  if (val && typeof val === 'object') {
    if (Array.isArray(val)) {
      return val.map(sanitizePiiData);
    }
    const sanitizedObj: Record<string, any> = {};
    for (const [k, v] of Object.entries(val)) {
      const lowerKey = k.toLowerCase();
      if (lowerKey.includes('ip') || lowerKey.includes('email') || lowerKey.includes('token') || lowerKey.includes('secret')) {
        sanitizedObj[k] = '[PROTÉGÉ_PII]';
      } else {
        sanitizedObj[k] = sanitizePiiData(v);
      }
    }
    return sanitizedObj;
  }
  return val;
}

export interface KatikaDetectedAnomaly {
  category: 'GAMEPLAY' | 'FRUSTRATION' | 'ECONOMIC' | 'ANTIFRAUD' | 'SYSTEM';
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  title: string;
  description: string;
  metricKey: string;
  value: any;
  threshold: string;
}

export interface KatikaMetricsSnapshot {
  timestamp: number;
  formattedDate: string;
  summary: {
    connectedPlayers: number;
    activeRooms: number;
    totalManches: number;
    totalParties: number;
    completionRatePct: number;
    healthStatus: string;
  };
  kpis: {
    allTime: KatikaKPIs;
    last24Hours?: KatikaKPIs;
    last7Days?: KatikaKPIs;
  };
  liveRooms: {
    count: number;
    rooms: KatikaLiveRoom[];
  };
  playersOverview: {
    totalTracked: number;
    activeCount: number;
    warnedCount: number;
    bannedCount: number;
    flaggedAntiFraudCount: number;
    playersList?: Array<{
      id: string;
      name: string;
      isHuman: boolean;
      chips: number;
      totalGames: number;
      victories: number;
      koraCount: number;
      doubleKoraCount: number;
      status: string;
      bannedReason?: string;
      warningsCount: number;
      abandonRate: number;
      antifraudFlags?: string[];
    }>;
    topPlayers: Array<{
      id: string;
      name: string;
      chips: number;
      victories: number;
      abandonRate: number;
      antifraudFlags?: string[];
    }>;
  };
  auditLogsRecent: {
    count: number;
    criticalOrWarningCount: number;
    recentEntries: Array<{
      id?: string;
      timestamp?: number;
      date: string;
      type: string;
      severity: string;
      summary: string;
      actor: string;
      details?: any;
    }>;
  };
  matchesHistory?: {
    count: number;
    entries: Array<{
      id: string;
      date: string;
      timestamp: number;
      mode: string;
      playerCount: number;
      winnerName: string;
      winnerId?: string;
      winType: string;
      roundsCount: number;
      partiesCount?: number;
      potWon: number;
      durationSeconds?: number;
      status?: string;
      isAbandoned?: boolean;
      abandonmentReason?: string;
      players?: Array<{ id: string; name: string; isHuman: boolean }>;
    }>;
  };
  activeEngineConfig: KatikaGameConfig;
  detectedAnomalies: KatikaDetectedAnomaly[];
  adminNotes?: AdminNotesSnapshot;
  whatIfBaseline?: {
    currentTimer: number;
    currentKoraMultiplier: number;
    currentDoubleKoraMultiplier: number;
    currentMinBet: number;
    avgPartieSec: number;
    avgMancheSec: number;
    avgPot: number;
  };
  /**
   * Dynamic extension bucket: Any additional telemetry, custom counters, or future
   * modules will be preserved and passed through here automatically.
   */
  customDynamicFields: Record<string, any>;
}

export const KatikaMetricsSnapshotProvider = {
  /**
   * Assembles a comprehensive, extensible snapshot of all live data and historical metrics.
   * Dynamically includes all fields without discarding newly added properties.
   */
  async buildSnapshot(): Promise<KatikaMetricsSnapshot> {
    const [
      allKpis,
      kpis24h,
      kpis7d,
      liveRooms,
      players,
      auditLogs,
      config,
    ] = await Promise.all([
      KatikaService.getKPIs('ALL').catch((e) => {
        console.warn('[Snapshot] Error loading ALL KPIs:', e);
        return {} as KatikaKPIs;
      }),
      KatikaService.getKPIs('24H').catch(() => undefined),
      KatikaService.getKPIs('7D').catch(() => undefined),
      KatikaService.getLiveRooms().catch(() => []),
      KatikaService.getPlayers().catch(() => []),
      KatikaService.getAuditLogs().catch(() => []),
      KatikaService.getConfig().catch(() => ({} as KatikaGameConfig)),
    ]);

    // Anomaly detection rules
    const anomalies: KatikaDetectedAnomaly[] = [];

    // 1. Frustration & Abandons
    const frust = allKpis.abandonmentFrustrations;
    if (frust) {
      if (frust.abandonmentRate > 20 && (allKpis.totalGamesPlayed || 0) >= 5) {
        anomalies.push({
          category: 'FRUSTRATION',
          severity: 'WARNING',
          title: 'Taux d’abandon de partie élevé',
          description: `Le taux d'abandon global s'élève à ${frust.abandonmentRate}%, au-dessus du seuil normal de 15%.`,
          metricKey: 'abandonmentFrustrations.abandonmentRate',
          value: frust.abandonmentRate,
          threshold: '< 15%',
        });
      }
      if (frust.postKoraAbandonRate > 30 && (allKpis.manchesAbandonedCount || 0) >= 3) {
        anomalies.push({
          category: 'FRUSTRATION',
          severity: 'WARNING',
          title: 'Pic de déconnexions post-Kora (Rage-quit)',
          description: `${frust.postKoraAbandonRate}% des abandons surviennent immédiatement après avoir subi un Kora.`,
          metricKey: 'abandonmentFrustrations.postKoraAbandonRate',
          value: frust.postKoraAbandonRate,
          threshold: '< 20%',
        });
      }
      if (frust.healthScore < 60 && (allKpis.totalGamesPlayed || 0) >= 5) {
        anomalies.push({
          category: 'FRUSTRATION',
          severity: 'CRITICAL',
          title: 'Score de santé de jeu dégradé',
          description: `L'indice de fluidité et de complétion est à ${frust.healthScore}/100 (${frust.healthStatus}).`,
          metricKey: 'abandonmentFrustrations.healthScore',
          value: frust.healthScore,
          threshold: '>= 75/100',
        });
      }
    }

    // 2. Gameplay & Cadence
    const pacing = allKpis.playerBehavior?.gamePacing;
    if (pacing && (allKpis.totalGamesPlayed || 0) >= 5) {
      if (pacing.avgPartieDurationSec < 15) {
        anomalies.push({
          category: 'GAMEPLAY',
          severity: 'WARNING',
          title: 'Durée moyenne de donne anormalement courte',
          description: `Les donnes durent en moyenne ${pacing.avgPartieDurationSec}s, ce qui peut indiquer des tours passés trop vite ou un bug de timer.`,
          metricKey: 'playerBehavior.gamePacing.avgPartieDurationSec',
          value: pacing.avgPartieDurationSec,
          threshold: '>= 25s',
        });
      }
    }

    // 3. Audace & Kora balance
    const audacity = allKpis.playerBehavior?.audacityBarometer;
    if (audacity && (allKpis.totalGamesPlayed || 0) >= 10) {
      if (audacity.koraRate > 65) {
        anomalies.push({
          category: 'GAMEPLAY',
          severity: 'INFO',
          title: 'Fréquence inhabituellement haute de Kora',
          description: `Le taux de victoires par Kora atteint ${audacity.koraRate}%. Vérifier si le niveau des adversaires ou de l'IA n'est pas trop passif.`,
          metricKey: 'playerBehavior.audacityBarometer.koraRate',
          value: audacity.koraRate,
          threshold: '25% - 50%',
        });
      }
      if (audacity.koraRate < 10 && (allKpis.totalGamesPlayed || 0) >= 15) {
        anomalies.push({
          category: 'GAMEPLAY',
          severity: 'WARNING',
          title: 'Kora sous-représenté (Jeu trop frileux ou cartes bloquantes)',
          description: `Le taux de Kora est seulement de ${audacity.koraRate}%. Les joueurs subissent des blocages ou évitent la prise de risque.`,
          metricKey: 'playerBehavior.audacityBarometer.koraRate',
          value: audacity.koraRate,
          threshold: '>= 20%',
        });
      }
    }

    // 4. Dérive 24h vs Historique global
    if (kpis24h && (kpis24h.totalGamesPlayed || 0) >= 5 && (allKpis.totalGamesPlayed || 0) >= 10) {
      const rate24h = kpis24h.abandonmentFrustrations?.abandonmentRate ?? 0;
      const rateAll = allKpis.abandonmentFrustrations?.abandonmentRate ?? 0;
      if (rate24h > rateAll * 1.5 && rate24h > 15) {
        anomalies.push({
          category: 'FRUSTRATION',
          severity: 'WARNING',
          title: 'Hausse brutale du taux d’abandon sur les dernières 24h',
          description: `Le taux d'abandon récent est monté à ${rate24h}% (contre ${rateAll}% sur l'historique global).`,
          metricKey: 'kpis24h.abandonmentRate',
          value: `${rate24h}% vs ${rateAll}%`,
          threshold: 'Variation < +50%',
        });
      }
    }

    // 5. Déséquilibre des formats de table
    const pref = allKpis.playerBehavior?.tablePreference;
    if (pref && (allKpis.totalGamesPlayed || 0) >= 10) {
      if (pref.twoPlayers?.percentage > 85) {
        anomalies.push({
          category: 'GAMEPLAY',
          severity: 'INFO',
          title: 'Hyper-polarisation sur les duels 2 joueurs',
          description: `${pref.twoPlayers.percentage}% des parties se jouent à 2. Les tables à 3 et 4 joueurs manquent d'attractivité ou de participants simultanés.`,
          metricKey: 'playerBehavior.tablePreference.twoPlayers',
          value: `${pref.twoPlayers.percentage}%`,
          threshold: '< 75%',
        });
      }
    }

    // 6. Anti-fraude & Joueurs (Uniquement les joueurs humains)
    const flaggedPlayers = players.filter(
      (p) =>
        p.isHuman === true &&
        (p.antifraudAlerts?.highAbandonRisk ||
         p.antifraudAlerts?.collusionRisk ||
         p.antifraudAlerts?.spamAntiFairplayRisk)
    );
    if (flaggedPlayers.length > 0) {
      anomalies.push({
        category: 'ANTIFRAUD',
        severity: 'WARNING',
        title: 'Comportements suspects détectés dans la base joueurs',
        description: `${flaggedPlayers.length} joueur(s) humain(s) ont déclenché des alertes de modération (collusion, abandons répétés ou spam).`,
        metricKey: 'players.antifraudAlerts',
        value: flaggedPlayers.map((p) => p.name).join(', '),
        threshold: '0 alertes',
      });
    }

    // 7. Salons bloqués ou inactifs
    const stuckRooms = liveRooms.filter(
      (r) => r.status === 'IN_GAME' && (r.currentPlayersCount === 0 || (r.turnRemainingSeconds !== undefined && r.turnRemainingSeconds <= 0))
    );
    if (stuckRooms.length > 0) {
      anomalies.push({
        category: 'SYSTEM',
        severity: 'WARNING',
        title: 'Salons potentiellement figés en jeu',
        description: `${stuckRooms.length} salon(s) en état 'IN_GAME' sans joueur connecté ou avec timer expiré.`,
        metricKey: 'liveRooms.stuck',
        value: stuckRooms.map((r) => r.roomName).join(', '),
        threshold: '0 salon bloqué',
      });
    }

    // 8. Audit & Sécurité
    const criticalLogs = auditLogs.filter((l) => l.severity === 'CRITICAL');
    if (criticalLogs.length > 0) {
      anomalies.push({
        category: 'SYSTEM',
        severity: 'CRITICAL',
        title: 'Événements d’audit critiques récents',
        description: `${criticalLogs.length} incident(s) critique(s) ont été enregistrés dans le journal de traçabilité.`,
        metricKey: 'auditLogs.critical',
        value: criticalLogs.length,
        threshold: '0 critique',
      });
    }

    // Players overview - full directory and top players
    const playersList = players.slice(0, 50).map((p) => {
      const flags: string[] = [];
      if (p.antifraudAlerts?.highAbandonRisk) flags.push('Abandons fréquents');
      if (p.antifraudAlerts?.collusionRisk) flags.push('Suspicion collusion');
      if (p.antifraudAlerts?.spamAntiFairplayRisk) flags.push('Spam clics');

      const isBot = !p.isHuman || isKnownBot(p.name, p.id);

      return {
        id: p.id,
        name: p.name,
        isHuman: !isBot,
        chips: p.chipsBalance,
        chipsBalance: p.chipsBalance,
        masteryScore: p.masteryScore,
        totalGames: p.totalGames,
        victories: p.victories,
        koraCount: p.koraCount,
        doubleKoraCount: p.doubleKoraCount || 0,
        status: p.status,
        bannedReason: p.bannedReason,
        warningsCount: p.warningsCount || 0,
        abandonRate: p.abandonRate,
        antifraudFlags: flags.length > 0 ? flags : undefined,
      };
    });

    // Top players for leaderboards & podiums: STRICTLY eligible Google authenticated human players
    const topPlayers = playersList
      .filter((p) =>
        p.isHuman === true &&
        !isKnownBot(p.name, p.id) &&
        isEligibleLeaderboardUser(p.id, {
          isGuest: false,
          authProvider: 'google.com',
          displayName: p.name,
          stats: {
            gamesPlayed: p.totalGames,
            gamesWon: p.victories,
            koraCount: p.koraCount,
            doubleKoraCount: p.doubleKoraCount,
            masteryScore: p.masteryScore,
            fortune: p.chipsBalance,
          },
        })
      )
      .sort((a, b) => {
        const aMastery = a.masteryScore || 0;
        const bMastery = b.masteryScore || 0;
        if (bMastery !== aMastery) return bMastery - aMastery;
        
        if (b.victories !== a.victories) return b.victories - a.victories;
        const bK = (b.koraCount || 0) + (b.doubleKoraCount || 0);
        const aK = (a.koraCount || 0) + (a.doubleKoraCount || 0);
        if (bK !== aK) return bK - aK;
        return (b.chipsBalance || 0) - (a.chipsBalance || 0);
      })
      .slice(0, 10);

    // Recent audit entries (exhaustive logs history with full details, strictly sanitized of PII)
    const recentEntries = auditLogs.slice(0, 50).map((l) => ({
      id: l.id,
      timestamp: l.timestamp,
      date: new Date(l.timestamp).toLocaleString('fr-FR'),
      type: l.type,
      severity: l.severity,
      summary: sanitizePiiData(l.summary),
      actor: sanitizePiiData(l.actor || 'Système'),
      details: sanitizePiiData(l.details),
    }));

    // Matches history (exhaustive games records with winner, winType, pot, duration)
    const rawMatches = Array.isArray(allKpis.recentMatches) ? allKpis.recentMatches : [];
    const matchesHistoryEntries = rawMatches.slice(0, 50).map((r: any) => ({
      id: r.id || `m_${r.createdAt || Date.now()}`,
      date: new Date(r.createdAt || Date.now()).toLocaleString('fr-FR'),
      timestamp: r.createdAt || Date.now(),
      mode: r.mode || 'MULTIPLAYER',
      playerCount: r.playerCount || 4,
      winnerName: r.winnerName || 'Joueur',
      winnerId: r.winnerId,
      winType: r.winType || 'STANDARD',
      roundsCount: r.partiesCount || r.roundsCount || 1,
      partiesCount: r.partiesCount || r.roundsCount || 1,
      potWon: r.potWon || 0,
      durationSeconds: r.durationSeconds,
      status: r.status || (r.isAbandoned ? 'in_progress' : 'completed'),
      isAbandoned: Boolean(r.isAbandoned),
      abandonmentReason: r.abandonmentReason,
      players: r.players || [],
    }));

    // Dynamic field collection: preserve any unknown top-level or nested fields from allKpis (excluding huge arrays)
    const customDynamicFields: Record<string, any> = {};
    if (allKpis && typeof allKpis === 'object') {
      Object.keys(allKpis).forEach((key) => {
        const known = [
          'connectedPlayersCount',
          'activeRoomsCount',
          'totalGamesPlayed',
          'totalManchesPlayed',
          'totalPartiesDisputed',
          'avgPartiesPerManche',
          'manchesCompletedCount',
          'manchesAbandonedCount',
          'manchesOngoingCount',
          'soloGamesCount',
          'multiplayerGamesCount',
          'koraCount',
          'doubleKoraCount',
          'simpleVictoryCount',
          'threeSevensCount',
          'under21Count',
          'twoPlayersCount',
          'threePlayersCount',
          'fourPlayersCount',
          'playerBehavior',
          'retentionEngagement',
          'abandonmentFrustrations',
          'totalChipsWon',
          'avgPotPerGame',
          'highestPotWon',
          'recentMatches',
          'activityTimeline',
        ];
        if (!known.includes(key)) {
          const val = (allKpis as any)[key];
          if (val && (!Array.isArray(val) || val.length <= 10)) {
            customDynamicFields[key] = val;
          }
        }
      });
    }

    // Clean allKpis to avoid giant arrays (like full recentMatches) in network payload
    const sanitizedAllKpis = { ...allKpis };
    if (Array.isArray(sanitizedAllKpis.recentMatches)) {
      sanitizedAllKpis.recentMatches = sanitizedAllKpis.recentMatches.slice(0, 5);
    }

    let adminNotes: AdminNotesSnapshot | undefined = undefined;
    try {
      adminNotes = await AdminNotesService.getNotesSnapshotData();
    } catch (e) {
      console.warn('[Snapshot] Error loading admin notes (rules might not be deployed yet):', e);
    }

    return {
      timestamp: Date.now(),
      formattedDate: new Date().toISOString(),
      summary: {
        connectedPlayers: allKpis.connectedPlayersCount || 0,
        activeRooms: allKpis.activeRoomsCount || 0,
        totalManches: allKpis.totalManchesPlayed || allKpis.totalGamesPlayed || 0,
        totalParties: allKpis.totalPartiesDisputed || 0,
        completionRatePct: allKpis.abandonmentFrustrations?.completionRate ?? 100,
        healthStatus: allKpis.abandonmentFrustrations?.healthStatus || 'INDÉTERMINÉ',
      },
      kpis: {
        allTime: sanitizedAllKpis,
        last24Hours: kpis24h,
        last7Days: kpis7d,
      },
      liveRooms: {
        count: liveRooms.length,
        rooms: liveRooms.slice(0, 20),
      },
      playersOverview: {
        totalTracked: players.length,
        activeCount: players.filter((p) => p.status === 'ACTIVE').length,
        warnedCount: players.filter((p) => p.status === 'WARNED').length,
        bannedCount: players.filter((p) => p.status === 'BANNED').length,
        flaggedAntiFraudCount: flaggedPlayers.length,
        playersList,
        topPlayers,
      },
      auditLogsRecent: {
        count: auditLogs.length,
        criticalOrWarningCount: auditLogs.filter(
          (l) => l.severity === 'CRITICAL' || l.severity === 'WARNING'
        ).length,
        recentEntries,
      },
      matchesHistory: {
        count: matchesHistoryEntries.length,
        entries: matchesHistoryEntries,
      },
      activeEngineConfig: config,
      detectedAnomalies: anomalies,
      whatIfBaseline: {
        currentTimer: config.turnTimerSeconds || 15,
        currentKoraMultiplier: config.koraMultiplier || 2,
        currentDoubleKoraMultiplier: config.doubleKoraMultiplier || 4,
        currentMinBet: config.minTableBet || 100,
        avgPartieSec: allKpis.playerBehavior?.gamePacing?.avgPartieDurationSec || 25,
        avgMancheSec: allKpis.playerBehavior?.gamePacing?.avgMancheDurationSec || 180,
        avgPot: allKpis.avgPotPerGame || 800,
      },
      adminNotes,
      customDynamicFields,
    };
  },
};
