import { GoogleGenAI, ThinkingLevel } from '@google/genai';

export interface AdminChatImage {
  data: string; // base64 without prefix or with prefix stripped
  mimeType: string;
  name?: string;
}

export interface AdminChatHistoryItem {
  role: 'user' | 'model';
  text: string;
}

export interface AdminChatSocialLinks {
  appUrl?: string;
  whatsappUrl?: string;
  facebookUrl?: string;
  tiktokUrl?: string;
  instagramUrl?: string;
}

export interface AdminChatConfig {
  tone?: 'concise' | 'balanced' | 'detailed';
  style?: 'direct' | 'pedagogical' | 'strategic';
  model?: string;
  temperatureMode?: 'analytical' | 'balanced' | 'creative';
  socialLinks?: AdminChatSocialLinks;
  defaultLinkStrategy?: 'AUTO' | 'APP_ONLY' | 'WHATSAPP_ONLY' | 'BOTH';
  customHashtags?: string[];
}

export interface AdminChatRequest {
  message: string;
  image?: AdminChatImage;
  history?: AdminChatHistoryItem[];
  recentTopics?: string[];
  config?: AdminChatConfig;
  metricsSnapshot?: any;
  model?: string;
}

let defaultGenAIClient: GoogleGenAI | null = null;

function getGenAIClient(): GoogleGenAI {
  if (!defaultGenAIClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || !apiKey.trim()) {
      throw new Error("Clé d'API GEMINI_API_KEY non configurée sur le serveur.");
    }
    defaultGenAIClient = new GoogleGenAI({
      apiKey: apiKey.trim(),
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return defaultGenAIClient;
}

/**
 * Intelligently analyzes user question and formats the complete, certified real
 * metrics and KPIs in a compact, structured Markdown table (< 800 tokens).
 * Strictly anchors the AI to real telemetry and forbids extrapolation.
 */
export interface DetectedIntents {
  isGlobalAudit: boolean;
  wantsMatches: boolean;
  wantsLogs: boolean;
  wantsPlayers: boolean;
  wantsRooms: boolean;
  wantsConfig: boolean;
  wantsSocial: boolean;
  wantsAnomalies: boolean;
  wantsAudience: boolean;
  wantsTrends: boolean;
  wantsBehavior: boolean;
  wantsBacklog: boolean;
  wantsMonetization: boolean;
  wantsManagement: boolean;
}

export function detectIntents(msg: string, previousUserMsg?: string): DetectedIntents {
  const q = (msg || '').toLowerCase().trim();

  // Les messages de politesse (ok, oui, non, merci, d'accord, etc.) n'activent aucun module
  const isPolite = /^(?:ok|oui|non|merci|d['’]accord|daccord|thx|thanks|k|yes|no)$/i.test(q);
  if (isPolite) {
    return {
      isGlobalAudit: false,
      wantsMatches: false,
      wantsLogs: false,
      wantsPlayers: false,
      wantsRooms: false,
      wantsConfig: false,
      wantsSocial: false,
      wantsAnomalies: false,
      wantsAudience: false,
      wantsTrends: false,
      wantsBehavior: false,
      wantsBacklog: false,
      wantsMonetization: false,
      wantsManagement: false,
    };
  }

  const isGlobalAudit =
    q === '' ||
    q === 'bonjour' ||
    q === 'salut' ||
    /rapport|bilan|audit|état des lieux|synthese|synthèse|vue d'ensemble|cockpit|dashboard|résumé|tout le système|vue globale|santé/i.test(
      q
    );

  // Mots-clés resserrés : « kora », « partie », « table », « tour » seuls n'activent plus wantsMatches / wantsRooms
  const wantsMatches =
    isGlobalAudit ||
    /match|historique|victoire|gagnant|vainqueur|qui a gagné|double kora|pot remport[eé]|score|donne/i.test(
      q
    );

  const wantsLogs =
    isGlobalAudit ||
    /log|trace|journal|incident|erreur|bug|critique|avertissement|warning|sanction|bannissement/i.test(
      q
    );

  const wantsPlayers =
    isGlobalAudit ||
    /joueur|player|compte|profil|pseudo|bot|humain|jeton|solde|triche|trich|collusion|suspect|averti|banni|champion|podium|palmarès|palmares|classement|top joueur|meilleur joueur|vainqueur/i.test(
      q
    );

  const wantsRooms =
    isGlobalAudit ||
    /salon|room|partie en cours|en direct|qui joue|bloqu|fig[eé]|timer restant|attente/i.test(q);

  const wantsConfig =
    isGlobalAudit ||
    /config|moteur|règle|timer|délai|reconnexion|mise min|multiplicateur|maintenance|que se passerait/i.test(q);

  const wantsSocial =
    /visuel|affiche|créer post|nouveau post|bannière|flyer|story|générer image|studio réseau|post facebook|post instagram|post whatsapp|pack marketing|casse-t[eê]te|tactique|dilemme|m[eè]me|punchline|sondage|invitation|tournoi/i.test(q) ||
    /\[THÈME_VISUEL:/i.test(q);

  const wantsAnomalies =
    isGlobalAudit ||
    /anomalie|problème|alerte|rage-quit|abandon|friction|déconnexion|qu'est-ce qui cloche/i.test(q);

  const wantsAudience =
    /dau|wau|mau|r[eé]tention|fid[eé]lit[eé]|stickiness|heure(?:s)? de pointe|affluence|engagement/i.test(q);

  const wantsTrends =
    /tendance|croissance|[eé]volution|hausse|baisse|compar[eé]|depuis hier|cette semaine|24h|7j/i.test(q);

  const wantsBehavior =
    /comportement|cadence|rythme|pacing|point de rupture|choke|offensif|audace|format préfér|durée de donne/i.test(q);

  const wantsBacklog =
    isGlobalAudit ||
    /bug|retour|feedback|testeur|roadmap|backlog|t[aâ]che|[aà] faire|id[eé]e|prochaine version|carnet/i.test(q);

  const wantsMonetization =
    !isGlobalAudit &&
    /rake|mon[eé]tisation|argent r[eé]el|sponsoring|tournoi payant|licence|l[eé]gal|juridique|r[eé]glementation|paiement|mobile money|revenu|rentabilit[eé]|tarif/i.test(
      q
    );

  const wantsManagement =
    !isGlobalAudit &&
    /priorit[eé]s?|planning|mon temps|semaine|objectif|équipe|equipe|recruter|r[oô]les?|organisation|d[eé]l[eé]gation/i.test(
      q
    );

  const current: DetectedIntents = {
    isGlobalAudit,
    wantsMatches,
    wantsLogs,
    wantsPlayers,
    wantsRooms,
    wantsConfig,
    wantsSocial,
    wantsAnomalies,
    wantsAudience,
    wantsTrends,
    wantsBehavior,
    wantsBacklog,
    wantsMonetization,
    wantsManagement,
  };

  // Mémoire de sujet : si previousUserMsg est fourni et le message courant est court ou d'approfondissement
  if (previousUserMsg && typeof previousUserMsg === 'string' && previousUserMsg.trim()) {
    const isContinuation =
      q.length < 25 ||
      /^(?:et\b|détaille|detaille|développe|developpe|explique|pourquoi|précise|precise|plus de détails|plus de details)/i.test(q);

    if (isContinuation) {
      const prevIntents = detectIntents(previousUserMsg.trim());
      return {
        isGlobalAudit: current.isGlobalAudit || prevIntents.isGlobalAudit,
        wantsMatches: current.wantsMatches || prevIntents.wantsMatches,
        wantsLogs: current.wantsLogs || prevIntents.wantsLogs,
        wantsPlayers: current.wantsPlayers || prevIntents.wantsPlayers,
        wantsRooms: current.wantsRooms || prevIntents.wantsRooms,
        wantsConfig: current.wantsConfig || prevIntents.wantsConfig,
        wantsSocial: current.wantsSocial || prevIntents.wantsSocial,
        wantsAnomalies: current.wantsAnomalies || prevIntents.wantsAnomalies,
        wantsAudience: current.wantsAudience || prevIntents.wantsAudience,
        wantsTrends: current.wantsTrends || prevIntents.wantsTrends,
        wantsBehavior: current.wantsBehavior || prevIntents.wantsBehavior,
        wantsBacklog: current.wantsBacklog || prevIntents.wantsBacklog,
        wantsMonetization: current.wantsMonetization || prevIntents.wantsMonetization,
        wantsManagement: current.wantsManagement || prevIntents.wantsManagement,
      };
    }
  }

  return current;
}

/**
 * Optimisation 1 & 2 : Routage d'intention sélectif & formatage ultra-dense TSV/Pipe.
 * Économise 60% à 75% des tokens d'entrée en n'injectant que les modules strictement
 * requis par la question de l'administrateur.
 */
function buildContextualMetricsSection(message: string, snapshot: any, intents?: DetectedIntents): string {
  if (!snapshot || typeof snapshot !== 'object') {
    return `
---
### 📊 MÉTRIQUES OPÉRATIONNELLES RÉELLES (0 PARTIE ENREGISTRÉE)
Aucune donnée de télémétrie enregistrée pour le moment. Tous les compteurs sont à 0.
---`;
  }

  const detected = intents || detectIntents(message);

  const summary = snapshot.summary || {};
  const allTime = snapshot.kpis?.allTime || {};
  const anomalies = Array.isArray(snapshot.detectedAnomalies) ? snapshot.detectedAnomalies : [];
  const config = snapshot.activeEngineConfig || {};
  const whatIf = snapshot.whatIfBaseline || {};
  const playersOverview = snapshot.playersOverview || {};

  const totalParties = Number(summary.totalParties ?? allTime.totalPartiesDisputed ?? allTime.totalGamesPlayed ?? 0);
  const totalManches = Number(summary.totalManches ?? allTime.totalManchesPlayed ?? 0);
  const koraCount = Number(allTime.koraCount ?? 0);
  const doubleKoraCount = Number(allTime.doubleKoraCount ?? 0);
  const simpleVictoryCount = Number(allTime.simpleVictoryCount ?? 0);
  const threeSevensCount = Number(allTime.threeSevensCount ?? 0);
  const under21Count = Number(allTime.under21Count ?? 0);

  const koraRate = allTime.playerBehavior?.audacityBarometer?.koraRate ?? (totalParties > 0 ? Math.round(((koraCount + doubleKoraCount) / totalParties) * 100) : 0);
  const doubleKoraRate = allTime.playerBehavior?.audacityBarometer?.doubleKoraRate ?? (totalParties > 0 ? Math.round((doubleKoraCount / totalParties) * 100) : 0);

  const totalChipsWon = Number(allTime.totalChipsWon ?? 0);
  const avgPotPerGame = Number(allTime.avgPotPerGame ?? 0);
  const highestPotWon = Number(allTime.highestPotWon ?? 0);

  const soloGamesCount = Number(allTime.soloGamesCount ?? 0);
  const multiplayerGamesCount = Number(allTime.multiplayerGamesCount ?? 0);
  const twoPlayersCount = Number(allTime.twoPlayersCount ?? 0);
  const threePlayersCount = Number(allTime.threePlayersCount ?? 0);
  const fourPlayersCount = Number(allTime.fourPlayersCount ?? 0);

  const abandonRate = allTime.abandonmentFrustrations?.abandonmentRate ?? 0;
  const postKoraAbandonRate = allTime.abandonmentFrustrations?.postKoraAbandonRate ?? 0;
  const completionRate = summary.completionRatePct ?? allTime.abandonmentFrustrations?.completionRate ?? 100;
  const healthStatus = summary.healthStatus || allTime.abandonmentFrustrations?.healthStatus || 'OPÉRATIONNEL';

  const avgPartieDurationSec = allTime.playerBehavior?.gamePacing?.avgPartieDurationSec ?? whatIf.avgPartieSec ?? 0;
  const avgMancheDurationSec = allTime.playerBehavior?.gamePacing?.avgMancheDurationSec ?? whatIf.avgMancheSec ?? 0;

  // Format compact TSV pour les KPIs clés (Ultra-low token footprint)
  const isPureSocialVisual = detected.wantsSocial &&
    !detected.isGlobalAudit &&
    !detected.wantsMatches &&
    !detected.wantsLogs &&
    !detected.wantsPlayers &&
    !detected.wantsRooms &&
    !detected.wantsConfig &&
    !detected.wantsAnomalies &&
    !detected.wantsAudience &&
    !detected.wantsTrends &&
    !detected.wantsBehavior &&
    !detected.wantsBacklog &&
    !detected.wantsMonetization &&
    !detected.wantsManagement;

  const asksForStats = /chiffre|stat|kpi|partie|manche|podium|top|score|taux|combien/i.test(message);

  let baselineKpis = '';
  if (isPureSocialVisual && !asksForStats) {
    baselineKpis = 'Aucune métrique système requise pour ce contenu créatif.';
  } else if (isPureSocialVisual && asksForStats) {
    baselineKpis = `
---
### 📊 MÉTRIQUES CIBLÉES POUR LE VISUEL :
PARTIES_TOTAL:${totalParties} | MANCHES_TOTAL:${totalManches} | JOUEURS_EN_LIGNE:${summary.connectedPlayers ?? 0}
KORA:${koraCount} (taux: ${koraRate}%) | DBL_KORA:${doubleKoraCount} (taux: ${doubleKoraRate}%)`;
  } else {
    baselineKpis = `
---
### 📊 KPIS CLÉS DU SYSTÈME (DONNÉES CERTIFIÉES EN DIRECT - FORMAT TSV/PIPE COMPACT) :
PARTIES_TOTAL:${totalParties} | MANCHES_TOTAL:${totalManches} | JOUEURS_EN_LIGNE:${summary.connectedPlayers ?? 0} | TABLES_ACTIVES:${summary.activeRooms ?? 0} | SANTÉ:${completionRate}% (${healthStatus})
KORA:${koraCount} (taux: ${koraRate}%) | DBL_KORA:${doubleKoraCount} (taux: ${doubleKoraRate}%) | VICTOIRE_SIMPLE:${simpleVictoryCount} | 3_SEPTS:${threeSevensCount} | MOINS_21:${under21Count}
JETONS_DISTRIBUÉS:${totalChipsWon.toLocaleString('fr-FR')} | POT_MOYEN:${avgPotPerGame.toLocaleString('fr-FR')} | MAX_POT:${highestPotWon.toLocaleString('fr-FR')}
FORMATS: Solo:${soloGamesCount}, Multi:${multiplayerGamesCount} (2j:${twoPlayersCount}, 3j:${threePlayersCount}, 4j:${fourPlayersCount})
ABANDONS:${abandonRate}% (Rage-quit post-Kora: ${postKoraAbandonRate}%) | RYTHME: Donne ${avgPartieDurationSec}s, Manche ${avgMancheDurationSec}s
COMPTES: Total:${playersOverview.totalTracked ?? 0} (Actifs:${playersOverview.activeCount ?? 0}, Avertis:${playersOverview.warnedCount ?? 0}, Bannis:${playersOverview.bannedCount ?? 0})
MOTEUR_CONFIG: Timer:${config.turnTimerSeconds ?? 15}s | Reco:${config.reconnectTimeoutSeconds ?? 30}s | Kora:x${config.koraMultiplier ?? 2} | DK:x${config.doubleKoraMultiplier ?? 4} | MiseMin:${config.minTableBet ?? 100} | Maint:${config.isMaintenanceMode ? 'ACTIF' : 'OFF'}
ANOMALIES_DÉTECTÉES:${anomalies.length}`;
  }

  let sections = baselineKpis;

  // 1. Module AUDIENCE (DAU/WAU/MAU, stickiness, rétention J+1/J+7/J+30, 3 heures de pointe)
  const ret = allTime.retentionEngagement || snapshot.retentionEngagement || {};
  const dau = Number(ret.dau ?? 0);
  const wau = Number(ret.wau ?? 0);
  const mau = Number(ret.mau ?? 0);
  const stickiness = Number(ret.stickinessRatio ?? (mau > 0 ? Math.round((dau / mau) * 100) : 0));
  const d1 = Number(ret.d1Retention ?? 0);
  const d7 = Number(ret.d7Retention ?? 0);
  const d30 = Number(ret.d30Retention ?? 0);
  const peakHour = ret.peakHourLabel || 'N/A';
  const heatmap = Array.isArray(ret.hourlyHeatmap) ? ret.hourlyHeatmap : [];
  const top3Hours = heatmap
    .slice()
    .sort((a: any, b: any) => (b.count ?? 0) - (a.count ?? 0))
    .slice(0, 3)
    .map((h: any) => `${h.hour}h(${h.count ?? 0}p)`)
    .join(', ') || peakHour;

  if (detected.wantsAudience) {
    sections += `\n\n### AUDIENCE ET ENGAGEMENT :\n` +
      `DAU:${dau} | WAU:${wau} | MAU:${mau} | STICKINESS:${stickiness}% | SESSIONS_MOY:${ret.avgSessionsPerUser ?? 0}\n` +
      `RETENTION: J+1:${d1}% | J+7:${d7}% | J+30:${d30}%\n` +
      `HEURES_POINTE: Pic:${peakHour} | Top3:${top3Hours}`;
  } else if (detected.isGlobalAudit) {
    sections += `\n\n### AUDIENCE (SYNTHÈSE) :\n` +
      `DAU:${dau} | WAU:${wau} | MAU:${mau} | STICKINESS:${stickiness}% | J+1:${d1}% | J+7:${d7}% | J+30:${d30}% | PIC:${peakHour}`;
  }

  // 2. Module TENDANCES (Parties, abandons, Koras, actifs en 24h, 7j et cumul avec écart)
  const k24 = snapshot.kpis?.last24Hours || {};
  const k7d = snapshot.kpis?.last7Days || {};
  const p24 = Number(k24.totalPartiesDisputed ?? k24.totalGamesPlayed ?? 0);
  const p7d = Number(k7d.totalPartiesDisputed ?? k7d.totalGamesPlayed ?? 0);
  const pCumul = totalParties;
  const ab24 = Number(k24.abandonmentFrustrations?.abandonmentRate ?? 0);
  const ab7d = Number(k7d.abandonmentFrustrations?.abandonmentRate ?? 0);
  const kora24 = Number(k24.playerBehavior?.audacityBarometer?.koraRate ?? 0);
  const kora7d = Number(k7d.playerBehavior?.audacityBarometer?.koraRate ?? 0);
  const act24 = Number(k24.retentionEngagement?.dau ?? k24.connectedPlayersCount ?? 0);
  const act7d = Number(k7d.retentionEngagement?.wau ?? 0);
  const avgDaily7d = p7d > 0 ? Math.round(p7d / 7) : 0;
  const diffParties = p24 - avgDaily7d;

  if (detected.wantsTrends) {
    sections += `\n\n### TENDANCES ET ÉVOLUTION :\n` +
      `PARTIES: 24h:${p24} | 7j:${p7d} | Cumul:${pCumul} | Écart_24h_vs_Moy7j:${diffParties >= 0 ? '+' : ''}${diffParties}\n` +
      `TAUX_ABANDON: 24h:${ab24}% | 7j:${ab7d}% | Cumul:${abandonRate}% | Écart:${(ab24 - ab7d).toFixed(1)}%\n` +
      `TAUX_KORA: 24h:${kora24}% | 7j:${kora7d}% | Cumul:${koraRate}%\n` +
      `ACTIFS: 24h:${act24} | 7j:${act7d} | Cumul:${playersOverview.totalTracked ?? 0}`;
  } else if (detected.isGlobalAudit) {
    sections += `\n\n### TENDANCES (SYNTHÈSE) :\n` +
      `Parties(24h:${p24}, 7j:${p7d}, Cumul:${pCumul}) | Abandons(24h:${ab24}%, 7j:${ab7d}%) | Kora(24h:${kora24}%, 7j:${kora7d}%) | Écart24h/Moy7j:${diffParties >= 0 ? '+' : ''}${diffParties}`;
  }

  // 3. Module COMPORTEMENT (Préférence format, cadence, points de rupture, indice offensif)
  if (detected.wantsBehavior) {
    const pb = allTime.playerBehavior || {};
    const tp = pb.tablePreference || {};
    const ab = pb.audacityBarometer || {};
    const gp = pb.gamePacing || {};
    const ch = allTime.abandonmentFrustrations?.chokePoints || {};

    const twoCount = tp.twoPlayers?.count ?? twoPlayersCount;
    const twoPct = tp.twoPlayers?.percentage ?? (totalParties > 0 ? Math.round((twoCount / totalParties) * 100) : 0);
    const threeCount = tp.threePlayers?.count ?? threePlayersCount;
    const threePct = tp.threePlayers?.percentage ?? (totalParties > 0 ? Math.round((threeCount / totalParties) * 100) : 0);
    const fourCount = tp.fourPlayers?.count ?? fourPlayersCount;
    const fourPct = tp.fourPlayers?.percentage ?? (totalParties > 0 ? Math.round((fourCount / totalParties) * 100) : 0);
    const domFormat = tp.dominantFormat || (twoCount >= threeCount && twoCount >= fourCount ? '2 Joueurs' : fourCount >= threeCount ? '4 Joueurs' : '3 Joueurs');

    const earlyQuit = ch.earlyTrickQuitPct ?? 0;
    const midQuit = ch.midGameQuitPct ?? 0;
    const afterDefeatQuit = ch.afterDefeatQuitPct ?? 0;

    sections += `\n\n### COMPORTEMENT ET CADENCE :\n` +
      `FORMATS: 2j:${twoCount}(${twoPct}%) | 3j:${threeCount}(${threePct}%) | 4j:${fourCount}(${fourPct}%) | DOMINANT:${domFormat}\n` +
      `CADENCE: Donne:${gp.avgPartieDurationSec ?? avgPartieDurationSec}s (min:${gp.fastestPartieDurationSec ?? 0}s, max:${gp.longestPartieDurationSec ?? 0}s) | Manche:${gp.avgMancheDurationSec ?? avgMancheDurationSec}s | TotalHeures:${gp.totalPlaytimeHours ?? 0}h\n` +
      `RUPTURES_PLIS: Plis1-2:${earlyQuit}% | Plis3-4:${midQuit}% | PostDefaite:${afterDefeatQuit}% | PostKora:${postKoraAbandonRate}%\n` +
      `INDICE_OFFENSIF: Score:${ab.offenseIndex ?? 50}/100 (${ab.styleLabel || 'ÉQUILIBRÉ'}) | Kora:${ab.koraRate ?? koraRate}% | DblKora:${ab.doubleKoraRate ?? doubleKoraRate}% | Spéciales:${ab.specialWinsRate ?? 0}%`;
  }

  // 4. Module Matches (Injecté uniquement si demandé ou audit global)
  if (detected.wantsMatches) {
    const rawMatches = Array.isArray(snapshot.matchesHistory?.entries)
      ? snapshot.matchesHistory.entries
      : Array.isArray(snapshot.kpis?.allTime?.recentMatches)
      ? snapshot.kpis.allTime.recentMatches
      : [];

    const limit = detected.isGlobalAudit ? 10 : 25;
    const matchesSlice = rawMatches.slice(0, limit);

    sections += `\n\n### 📜 HISTORIQUE MATCHES RÉCENTS (${matchesSlice.length}/${rawMatches.length} parties - FORMAT: ID|DATE|FORMAT|GAGNANT|TYPE|POT|DURÉE|STATUT) :\n`;
    if (matchesSlice.length === 0) {
      sections += `*0 partie enregistrée dans l'historique.*\n`;
    } else {
      sections += matchesSlice
        .map((m: any) => {
          const dateStr = m.date || (m.createdAt ? new Date(m.createdAt).toLocaleString('fr-FR') : 'Récent');
          const formatStr = `${m.mode || 'MULTI'}(${m.playerCount || 4}j)`;
          const winType = m.winType === 'DOUBLE_KORA' ? 'DBL_KORA' : m.winType || 'STANDARD';
          const potStr = `${m.potWon || 0}f`;
          const durStr = m.durationSeconds ? `${m.durationSeconds}s` : (m.roundsCount ? `${m.roundsCount}donnes` : '-');
          const statusStr = m.isAbandoned ? `ABANDON(${m.abandonmentReason || 'Quit'})` : 'TERMINÉE';
          return `#m_${m.id}|${dateStr}|${formatStr}|${m.winnerName || 'Joueur'}|${winType}|${potStr}|${durStr}|${statusStr}`;
        })
        .join('\n');
    }
  }

  // 5. Module Logs d'Audit (Injecté uniquement si demandé ou audit global)
  if (detected.wantsLogs) {
    const rawLogs = Array.isArray(snapshot.auditLogsRecent?.recentEntries) ? snapshot.auditLogsRecent.recentEntries : [];
    const limit = detected.isGlobalAudit ? 8 : 25;
    const logsSlice = rawLogs.slice(0, limit);

    sections += `\n\n### 🛡️ JOURNAUX D'AUDIT SYSTÈME (${logsSlice.length}/${rawLogs.length} logs - FORMAT: [SÉV] #ID|DATE|ACTEUR|TYPE: RÉSUMÉ {DÉTAILS}) :\n`;
    if (logsSlice.length === 0) {
      sections += `*0 journal d'audit enregistré.*\n`;
    } else {
      sections += logsSlice
        .map((l: any) => {
          const sev = l.severity === 'CRITICAL' ? 'CRIT' : l.severity === 'WARNING' ? 'WARN' : 'INFO';
          const logId = l.id ? `#log_${l.id}` : `#log_${l.timestamp || 'sys'}`;
          const detailsStr = l.details ? ` {${JSON.stringify(l.details).slice(0, 80)}}` : '';
          return `[${sev}] ${logId}|${l.date || 'Récent'}|${l.actor || 'Système'}|${l.type || 'SYS'}: ${l.summary}${detailsStr}`;
        })
        .join('\n');
    }
  }

  // 6. Module Joueurs & Modération (Injecté uniquement si demandé ou audit global)
  if (detected.wantsPlayers || detected.wantsSocial) {
    const playersList = Array.isArray(snapshot.playersOverview?.playersList)
      ? snapshot.playersOverview.playersList
      : Array.isArray(snapshot.playersOverview?.topPlayers)
      ? snapshot.playersOverview.topPlayers
      : [];
    const limit = detected.isGlobalAudit ? 8 : 25;
    const playersSlice = playersList.slice(0, limit);

    // Filtrer et trier strictement les vrais joueurs humains pour les classements et visuels
    const isBotEntity = (name: string, id: string) => {
      const n = String(name || '').toLowerCase();
      const i = String(id || '').toLowerCase();
      if (i.includes('bot') || i === 'p2' || i === 'p3' || i === 'p4' || i.startsWith('ai_')) return true;
      if (n.includes('bot') || n.includes('robot') || n.includes('abandon') || n.includes('interrompue') || n.includes('forfait')) return true;
      const botKeywords = ['robam', 'hokuto', 'hokito', 'wizeman', 'thom', 'malo', 'efoulan', 'bozar', 'tchakap', 'mignon', 'vie2poulet', 'malox'];
      return botKeywords.some((kw) => n.includes(kw));
    };

    const humanPlayers = playersList
      .filter((p: any) => p.isHuman !== false && !isBotEntity(p.name, p.id))
      .sort((a: any, b: any) => {
        const bScore = b.masteryScore ?? 0;
        const aScore = a.masteryScore ?? 0;
        if (bScore !== aScore) return bScore - aScore;
        const bWins = b.victories ?? 0;
        const aWins = a.victories ?? 0;
        if (bWins !== aWins) return bWins - aWins;
        const bK = (b.koraCount ?? 0) + (b.doubleKoraCount ?? 0);
        const aK = (a.koraCount ?? 0) + (a.doubleKoraCount ?? 0);
        if (bK !== aK) return bK - aK;
        return (b.chips ?? 0) - (a.chips ?? 0);
      })
      .slice(0, 10);

    if (humanPlayers.length > 0) {
      sections += `\n\n### 🏆 CLASSEMENT OFFICIEL DES JOUEURS HUMAINS (TRIÉ PAR MAÎTRISE - STRICTEMENT ZÉRO BOT - POUR TOUT PODIUM OU VISUEL) :\n`;
      sections += humanPlayers
        .map((p: any, idx: number) => {
          const cleanPseudo = String(p.name || 'Joueur').replace(/^#(?:p_|usr_|player_|table_)/i, '').replace(/[\(\)\[\]#]/g, '').trim();
          const winCount = p.victories ?? 0;
          const koraCount = (p.koraCount ?? 0) + (p.doubleKoraCount ?? 0);
          const totalG = p.totalGames ?? 0;
          const winRate = totalG > 0 ? Math.round((winCount / totalG) * 100) : 0;
          const mastery = p.masteryScore ?? 0;
          return `${idx + 1}ère place : "${cleanPseudo}" | Maîtrise: ${mastery} | Victoires: ${winCount} | Koras: ${koraCount} | Parties: ${totalG} | Ratio: ${winRate}%`;
        })
        .join('\n');
    } else {
      sections += `\n\n### 🏆 CLASSEMENT OFFICIEL DES JOUEURS HUMAINS :\n*Aucun joueur humain vérifié dans le Palmarès actuel.*\n⚠️ INTERDICTION FORMELLE : N'invente aucun pseudo ni aucun joueur fictif (comme "Big Smig", "King", etc.). Oriente le visuel vers un appel au trône vacant : "Qui sera le 1er Maître du Kora ?", "Le Trône t'attend", etc.\n`;
    }

    if (detected.wantsPlayers) {
      sections += `\n\n### 👥 ANNUAIRE SYSTÈME DES JOUEURS (${playersSlice.length}/${playersList.length} comptes - NOTE: Les identifiants #p_ sont réservés à l'audit système interne et NE DOIVENT JAMAIS figurer dans un visuel public) :\n`;
      if (playersSlice.length === 0) {
        sections += `*0 compte joueur dans la base.*\n`;
      } else {
        sections += playersSlice
          .map((p: any) => {
            const typeStr = p.isHuman === false ? 'Bot' : 'Humain';
            const statusStr = p.status === 'BANNED' ? `BAN(${p.bannedReason || 'Mod'})` : p.status === 'WARNED' ? `AVERT(${p.warningsCount || 1})` : 'ACTIF';
            const alertStr = p.antifraudFlags?.length ? `!${p.antifraudFlags.join(';')}` : '-';
            const mastery = p.masteryScore !== undefined ? `|M:${p.masteryScore}` : '';
            return `#p_${p.id}|${p.name || p.id}|${typeStr}|${p.chips ?? 0}f|${p.totalGames ?? 0}|${p.victories ?? 0}|K:${p.koraCount ?? 0}/DK:${p.doubleKoraCount ?? 0}${mastery}|${p.abandonRate ?? 0}%|${statusStr}|${alertStr}`;
          })
          .join('\n');
      }
    }
  }

  // 7. Module Tables en Direct (Injecté uniquement si demandé ou audit global)
  if (detected.wantsRooms) {
    const liveRooms = Array.isArray(snapshot.liveRooms?.rooms) ? snapshot.liveRooms.rooms : [];
    sections += `\n\n### 🎲 SALONS ET TABLES EN DIRECT (${liveRooms.length} actifs - FORMAT: #TABLE_ID|NOM|STATUT|JOUEURS|POT|DONNE|TIMER) :\n`;
    if (liveRooms.length === 0) {
      sections += `*0 salon actif en direct.*\n`;
    } else {
      sections += liveRooms
        .slice(0, 10)
        .map((r: any) => {
          const playersStr = Array.isArray(r.players)
            ? r.players.map((p: any) => `${p.name || p.id}${p.connected ? '' : '(déco)'}`).join(',')
            : `${r.currentPlayersCount || 0}j`;
          const timerStr = r.turnRemainingSeconds !== undefined ? `${r.turnRemainingSeconds}s` : '-';
          return `#table_${r.code || r.id}|${r.roomName || 'Table'}|${r.status}|${playersStr}|${r.pot || 0}f|Donne:${r.currentRound || 1}|Timer:${timerStr}`;
        })
        .join('\n');
    }
  }

  // 8. Module Moteur Complet (Injecté uniquement si wantsConfig)
  if (detected.wantsConfig) {
    const configEntries = Object.entries(config)
      .filter(([_, v]) => v !== undefined && v !== null && typeof v !== 'function')
      .map(([k, v]) => `${k}:${typeof v === 'object' ? JSON.stringify(v) : v}`)
      .join(' | ');

    const whatIfEntries = Object.entries(whatIf)
      .filter(([_, v]) => v !== undefined && v !== null)
      .map(([k, v]) => `${k}:${v}`)
      .join(' | ');

    sections += `\n\n### CONFIGURATION COMPLÈTE DU MOTEUR :\n${configEntries || 'Aucune configuration disponible'}`;
    if (whatIfEntries) {
      sections += `\nWHAT_IF_BASELINE: ${whatIfEntries}`;
    }
  }

  // 9. Module Champs Dynamiques (Injecté uniquement en audit global si présent)
  if (detected.isGlobalAudit && snapshot.customDynamicFields && Object.keys(snapshot.customDynamicFields).length > 0) {
    const rawDynamic = Object.entries(snapshot.customDynamicFields)
      .filter(([_, v]) => v !== undefined && v !== null)
      .map(([k, v]) => `${k}:${typeof v === 'object' ? JSON.stringify(v) : v}`)
      .join(' | ');
    if (rawDynamic) {
      sections += `\n\n### CHAMPS DYNAMIQUES :\n${rawDynamic.slice(0, 300)}`;
    }
  }

  // 10. Module Anomalies (Injecté si anomalies détectées ET sujet pertinent)
  if (anomalies.length > 0 && (detected.wantsAnomalies || detected.isGlobalAudit)) {
    sections += `\n\n### 🚨 ANOMALIES SYSTÈME DÉTECTÉES EN DIRECT :\n`;
    anomalies.forEach((a: any) => {
      sections += `- [${a.severity}] **${a.title}** : ${a.description} (Mesuré: ${a.value} / Seuil: ${a.threshold})\n`;
    });
  }

  // 11. Module Carnet de Bord & Roadmap (Injecté uniquement si wantsBacklog)
  if (detected.wantsBacklog) {
    const adminNotes = snapshot.adminNotes;
    const items = Array.isArray(adminNotes?.items) ? adminNotes.items : [];
    sections += `\n\n### 📝 CARNET DE BORD ET BACKLOG (${adminNotes?.openCount ?? 0} notes ouvertes - FORMAT: #note_<id>|TYPE|PRIORITÉ|STATUT|TITRE|SOURCE) :\n`;
    if (items.length === 0) {
      sections += `*0 note de carnet enregistrée.*\n`;
    } else {
      sections += items
        .map((n: any) => {
          const cleanTitle = (n.title || 'Sans titre').slice(0, 80);
          const sourceStr = n.source ? `|${n.source}` : '';
          return `#note_${n.id}|${n.type}|${n.priority}|${n.status}|${cleanTitle}${sourceStr}`;
        })
        .join('\n');
    }
  }

  return `${sections}\n---`;
}

/**
 * Optimisation 3 & 5 : Calcul adaptatif de la température et contrôle du raisonnement.
 * thinkingConfig selon la famille du modèle :
 * - 'gemini-3...' -> { thinkingLevel: ThinkingLevel.LOW }
 * - 'gemini-2.5...' -> { thinkingBudget: 1024 }
 * - autre -> aucun thinkingConfig
 */
export function resolveGenerationParameters(
  message: string,
  intents: DetectedIntents,
  config?: AdminChatConfig,
  modelName?: string
) {
  // Mode de température selon la configuration de Copilote Katika
  let temperature = intents.wantsSocial ? 0.35 : 0.1;
  let topP = intents.wantsSocial ? 0.85 : 0.75;

  if (config?.temperatureMode === 'analytical') {
    temperature = 0.05; // Rigueur mathématique maximale, zéro créativité
    topP = 0.6;
  } else if (config?.temperatureMode === 'creative') {
    temperature = 0.75; // Très créatif et percutant pour réseaux sociaux
    topP = 0.95;
  }

  const m = (modelName || config?.model || '').toLowerCase();
  let thinkingConfig: any = undefined;

  if (m.startsWith('gemini-3')) {
    thinkingConfig = { thinkingLevel: ThinkingLevel.LOW };
  } else if (m.startsWith('gemini-2.5')) {
    thinkingConfig = { thinkingBudget: 1024 };
  }

  return { temperature, topP, thinkingConfig };
}

/**
 * Calcul du plafond de tokens de sortie selon l'intention et le ton souhaité.
 * - Base : 1200 (standard), 1800 (isGlobalAudit ou wantsAnomalies), 2400 (wantsSocial)
 * - Ajustement selon ton : 'detailed' (+600), 'concise' (-300)
 * - Minimum garanti : 900
 */
export function computeMaxOutputTokens(
  intents?: { isGlobalAudit?: boolean; wantsAnomalies?: boolean; wantsSocial?: boolean },
  tone?: 'concise' | 'balanced' | 'detailed' | string
): number {
  let base = 1200;
  if (intents?.wantsSocial) {
    base = 2400;
  } else if (intents?.isGlobalAudit || intents?.wantsAnomalies) {
    base = 1800;
  }

  if (tone === 'detailed') {
    base += 600;
  } else if (tone === 'concise') {
    base -= 300;
  }

  return Math.max(900, base);
}

/**
 * Détection des erreurs transitoires (429, 500, 503, timeout, réseau)
 * pour lesquelles un basculement vers le modèle de secours est autorisé.
 */
export function isTransitoryError(error: unknown): boolean {
  if (!error) return false;
  const str = (error instanceof Error ? error.message : String(error)).toLowerCase();

  // Erreurs non transitoires (paramètres, 400, 404, etc.)
  if (
    str.includes('400') ||
    str.includes('404') ||
    str.includes('invalid_argument') ||
    str.includes('not_found') ||
    str.includes('unauthenticated') ||
    str.includes('permission_denied')
  ) {
    return false;
  }

  // Erreurs transitoires
  return (
    str.includes('429') ||
    str.includes('500') ||
    str.includes('502') ||
    str.includes('503') ||
    str.includes('504') ||
    str.includes('quota') ||
    str.includes('resource_exhausted') ||
    str.includes('resourceexhausted') ||
    str.includes('rate limit') ||
    str.includes('timeout') ||
    str.includes('timed out') ||
    str.includes('etimedout') ||
    str.includes('econnreset') ||
    str.includes('econnrefused') ||
    str.includes('fetch failed') ||
    str.includes('network') ||
    str.includes('unavailable') ||
    str.includes('internal')
  );
}

export function buildSystemInstruction(
  config: AdminChatConfig = {},
  userMessage: string = '',
  metricsSnapshot?: any,
  intents?: DetectedIntents,
  recentTopics?: string[]
): string {
  const detected = intents || detectIntents(userMessage);

  const appUrl = config.socialLinks?.appUrl || 'https://njambo-kora.ai.studio';

  const toneInstruction = (() => {
    switch (config.tone) {
      case 'concise':
        return 'Réponds de façon concise (environ 120 mots max, hors JSON).';
      case 'detailed':
        return 'Fournis une analyse détaillée et structurée (environ 400 mots max, hors JSON).';
      case 'balanced':
      default:
        return 'Réponds de façon équilibrée et structurée (environ 220 mots max, hors JSON).';
    }
  })();

  const styleInstruction = (() => {
    switch (config.style) {
      case 'direct':
        return 'Adopte un style opérationnel et technique.';
      case 'strategic':
        return 'Adopte un style stratégique orienté rétention et engagement.';
      case 'pedagogical':
      default:
        return 'Adopte un style clair, courtois et pédagogique.';
    }
  })();

  const cleanTopics = Array.isArray(recentTopics)
    ? recentTopics
        .filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
        .slice(0, 2)
        .map((t) => t.trim().slice(0, 120))
    : [];

  const recentTopicsLine = cleanTopics.length > 0
    ? `\nSujets récents de l'admin : ${cleanTopics.join(' | ')}`
    : '';

  const doualaDate = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Africa/Douala',
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(new Date());

  const metricsSection = buildContextualMetricsSection(userMessage, metricsSnapshot, detected);

  // Bloc Générateur de Visuel Réseaux Sociaux (Injecté si wantsSocial)
  const socialGeneratorBlock = detected.wantsSocial
    ? `\nCADRE CRÉATION DE VISUELS RÉSEAUX SOCIAUX & MARKETING :
Quand l'administrateur demande un visuel, une affiche, un flyer, un mème ou un post pour les réseaux :
1. Rédige d'abord un court message d'accompagnement pour les réseaux sociaux (WhatsApp / Facebook) avec émojis et liens du jeu avec UTM.
2. Inclus IMPÉRATIVEMENT un bloc JSON valide dans un bloc \`\`\`json { ... } \`\`\` au format VisualSpec V2 strict :
\`\`\`json
{
  "version": 2,
  "format": "SQUARE",
  "palette": "EMERALD_GOLD",
  "pattern": "NDOP_CHEVRON",
  "blocks": [
    { "id": "b-badge", "type": "BADGE", "text": "NJAMBO KORA", "priority": 1 },
    { "id": "b-hook", "type": "HOOK", "text": "ACCROCHE PERCUTANTE", "accentWords": ["KORA"], "priority": 1 },
    { "id": "b-body", "type": "BODY", "text": "Texte court et percutant adapté au thème demandé.", "priority": 2 }
  ],
  "cta": { "text": "Rejoins la partie en ligne" },
  "footer": { "text": "njambo-kora.ai.studio", "whatsapp": true, "app": true }
}
\`\`\`
Types de blocs valides dans "blocks" :
- BADGE (text ≤ 28 chars)
- HOOK (text ≤ 8 mots, accentWords optionnel)
- BODY (text ≤ 22 mots)
- BULLETS (items: string[], max 4 items)
- STAT (value, label, sublabel)
- CARDS (cards: [{ rank: "3", suit: "♥", label?: string, highlight?: boolean }], max 5 cartes, arrangement: "FAN"|"ROW"|"DUEL")
- COMPARE (leftTitle, leftText, rightTitle, rightText)
- QUOTE (text ≤ 25 mots, author?: string)
Palettes autorisées : "EMERALD_GOLD", "SUNSET_ORANGE", "ROYAL_INDIGO", "DARK_SLATE", "CHAMPAGNE_GOLD".
Règles Njambo : 31 cartes (♥ ♦ ♣ de 3 à 10, ♠ de 3 à 9). Pas d'As, Roi, Dame, Valet, 2, 10♠. Kora uniquement au 5e pli avec un 3.

⚠️ INTERDICTION STRICTE D'INVENTION DE JOUEURS OU DE STATS :
- Ne JAMAIS inventer un pseudo, un joueur fictif (ex: "Big Smig", "King", etc.), ni des scores ou nombres de victoires inventés de toutes pièces.
- Si le visuel porte sur un joueur ou le classement : utilise EXCLUSIVEMENT un joueur issu du "CLASSEMENT OFFICIEL DES JOUEURS HUMAINS" fourni dans la télémétrie.
- Si aucun joueur humain n'est listé dans la télémétrie ou si les données ne fournissent pas de champion certifié : oriente le visuel vers un appel communautaire au trône ("Le trône de Njambo Kora t'attend !", "Qui sera le 1er Maître du Kora ?", "Défie les meilleurs sur le tapis"). Ne jamais créer de faux profil.\n`
    : '';

  // Bloc Monétisation & Cadre Légal (Injecté uniquement si wantsMonetization)
  const monetizationBlock = detected.wantsMonetization
    ? `\nCADRE STRATÉGIQUE MONÉTISATION & JURIDIQUE :
- État actuel : Jetons virtuels uniquement. Modèle à mises réelles avec rake privilégié à terme, sponsoring et tournois envisagés, horizon non fixé (ne jamais le présenter comme acquis ou décidé).
- Méthode de réponse :
  (a) Partir des métriques réelles du snapshot (joueurs actifs, parties par jour, pot moyen, rétention).
  (b) Donner une estimation de potentiel de rake par formule simple avec hypothèses explicites (taux de rake × pot moyen × parties par jour), toujours marquée « hypothèse ».
  (c) Lister les questions juridiques à faire valider par un juriste (jeux de hasard et d'argent, paiement mobile, protection des joueurs, âge minimum) SANS citer de texte de loi précis.
  (d) Proposer une montée par étapes (tournois en jetons virtuels avec lots sponsorisés avant toute mise réelle).\n`
    : '';

  // Bloc Pilotage du Projet & Management (Injecté uniquement si wantsManagement)
  const managementBlock = detected.wantsManagement
    ? `\nCADRE DE PILOTAGE DU PROJET & MANAGEMENT :
- Contexte : Administrateur unique avec peu de temps disponible.
- Méthode de réponse :
  (a) 3 priorités maximum, horizon 7 jours.
  (b) Objectifs mesurables reliés aux métriques réelles du snapshot.
  (c) S'appuyer sur les notes du carnet (#note_) quand elles sont présentes dans les données.
  (d) Pour une future équipe : rôles, tâches découpées, accès en lecture seule d'abord.\n`
    : '';

  return `Tu es le Copilote Katika, assistant de l'administrateur de Njambo Kora. Tu couvres 4 volets : analyse/audit, marketing, développement (bugs, priorités, roadmap), management (temps, objectifs, équipe). Si une donnée d'un volet manque dans les données fournies, dis-le au lieu d'inventer.

Règles du jeu : 31 cartes (♥ ♦ ♣ de 3 à 10, ♠ de 3 à 9 ; ni As, Roi, Dame, Valet, 2 ni 10♠ ; pas d'atout ; donnes de 5 tours, Kora, Double Kora).

Règles de fonctionnement :
1. Lecture seule absolue : conseiller analytique sans action directe en base ni ban automatique. L'administrateur valide et agit manuellement via les liens #katika-nav.
2. Ancrage factuel : Pour tout audit, analyse technique ou diagnostic (#m_ pour un match, #log_ pour un log, #p_ pour un joueur, #table_ pour une table, #note_ pour une note de carnet), chaque fait doit citer son identifiant réel source. Si un compteur est à 0 ou une donnée introuvable, indique qu'aucune donnée n'est enregistrée. Si le nombre de joueurs humains actifs est inférieur à 10 ou celui des parties inférieur à 30, signale que les ratios sont peu significatifs avant toute conclusion. Pour tout classement, utilise le classement Palmarès (Score de Maîtrise) tel que fourni dans les données. Pour la création de visuels créatifs, mèmes ou marketing, concentre-toi sur l'impact visuel et les règles du jeu sans imposer de rapport de métriques si non sollicité, MAIS INTERDICTION ABSOLUE d'inventer des pseudos ou scores de joueurs fictifs (si aucun joueur réel n'est fourni, formule le visuel sous forme de défi communautaire ou de trône vacant).
3. Économie : aujourd'hui l'économie est exclusivement en jetons virtuels ; aucune monnaie réelle n'est implémentée. Un modèle à mises réelles avec prélèvement (rake) est envisagé mais non décidé : ne jamais le présenter comme acquis, ne jamais affirmer une règle légale précise sans source, recommander une validation par un juriste. Les dotations de tournoi sont proposées comme options chiffrées en jetons virtuels, avec la mention « Jetons virtuels d'amusement — Aucune valeur monétaire réelle ».
4. Liens et confidentialité : tout lien de jeu proposé doit comporter des paramètres UTM (?utm_source=...&utm_medium=social&utm_campaign=...). Ne cite jamais d'adresse email ni d'adresse IP.
5. Navigation #katika-nav : [Table {code}](#katika-nav:ROOMS:{code}), [Joueur {id}](#katika-nav:PLAYERS:{id}), [Moteur](#katika-nav:SETTINGS), [Audit](#katika-nav:LOGS:{query}), [Matches](#katika-nav:MATCHES:{query}), [KPIs](#katika-nav:DASHBOARD).
6. Carnet de bord : Tu peux proposer des entrées de carnet en texte ; tu n'écris jamais dans le carnet, l'admin les saisit lui-même.
${socialGeneratorBlock}${monetizationBlock}${managementBlock}
Directives de réponse :
- ${toneInstruction}
- ${styleInstruction}
- Pas de préambule, ne reformule pas la question. Rédige en français soigné en Markdown.${recentTopicsLine}

DATE : ${doualaDate} (Africa/Douala). Les expressions relatives (aujourd'hui, cette semaine) se calculent depuis cette date.
=== DONNÉES RÉELLES DE TÉLÉMÉTRIE EN DIRECT ===
${metricsSection}
=== FIN DES DONNÉES DE TÉLÉMÉTRIE ===`;
}

/**
 * Optimisation 4 : Élagage intelligent et compression de l'historique (Rolling Memory).
 * Conserve le contexte sémantique essentiel tout en évitant les surcoûts de tokens.
 */
function cleanHistoryText(text: string): string {
  if (!text) return '';
  let cleaned = text;

  // 1. Remplacer les gros blocs JSON graphiques générés précédemment
  if (cleaned.includes('```json')) {
    cleaned = cleaned.replace(/```json[\s\S]*?```/g, '[Visuel JSON généré au tour précédent]');
  }

  // 2. Remplacer les longs tableaux Markdown de plus de 4 lignes
  cleaned = cleaned.replace(/(\|.*?\|\n){4,}/g, '[Données tabulaires du tour précédent]\n');

  // 3. Tronquer intelligemment les réponses antérieures trop volumineuses au-delà de 1200 caractères
  if (cleaned.length > 1200) {
    cleaned = cleaned.slice(0, 1200) + '...';
  }

  return cleaned;
}

export function buildContents(
  message: string,
  image?: AdminChatImage,
  history: AdminChatHistoryItem[] = []
): Array<{ role: 'user' | 'model'; parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> }> {
  const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> }> = [];

  // Prendre au plus les 2 derniers éléments
  const rawRecent = history.slice(-2);

  // Ignorer tout élément de rôle 'model' placé en tête (l'historique commence toujours par 'user' et alterne strictement)
  const validHistory: AdminChatHistoryItem[] = [];
  for (const item of rawRecent) {
    if (validHistory.length === 0) {
      if (item.role === 'user') {
        validHistory.push(item);
      }
    } else {
      const expectedRole = validHistory[validHistory.length - 1].role === 'user' ? 'model' : 'user';
      if (item.role === expectedRole) {
        validHistory.push(item);
      }
    }
  }

  // Si l'historique forme une paire complète [user, model], on l'ajoute avant le tour courant
  if (validHistory.length === 2 && validHistory[0].role === 'user' && validHistory[1].role === 'model') {
    contents.push({
      role: 'user',
      parts: [{ text: cleanHistoryText(validHistory[0].text) }],
    });
    contents.push({
      role: 'model',
      parts: [{ text: cleanHistoryText(validHistory[1].text) }],
    });
  }

  // Tour courant (rôle 'user')
  const currentParts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];

  if (image && image.data && image.mimeType) {
    const cleanBase64 = image.data.includes('base64,')
      ? image.data.split('base64,')[1]
      : image.data;

    currentParts.push({
      inlineData: {
        mimeType: image.mimeType,
        data: cleanBase64,
      },
    });
  }

  currentParts.push({
    text: message || (image ? 'Analyse cette image dans le contexte de Njambo.' : 'Bonjour'),
  });

  contents.push({
    role: 'user',
    parts: currentParts,
  });

  return contents;
}

/**
 * Renvoie au plus 2 modèles distincts :
 * [modèle demandé ou env GEMINI_MODEL ou 'gemini-3.8-flash', puis un unique secours 'gemini-3.1-flash-lite']
 */
export function getCandidateModels(requestedModel?: string): string[] {
  const primary = (requestedModel && requestedModel.trim()) || (process.env.GEMINI_MODEL && process.env.GEMINI_MODEL.trim()) || 'gemini-3.8-flash';
  const fallback = 'gemini-3.1-flash-lite';
  if (primary === fallback) {
    return [primary];
  }
  return [primary, fallback];
}

export async function handleAdminChatMessage(payload: AdminChatRequest): Promise<string> {
  const { message, image, history = [], recentTopics = [], config = {}, metricsSnapshot } = payload;
  const previousUserMsg = history
    ?.slice()
    .reverse()
    .find((h) => h.role === 'user')?.text;
  const intents = detectIntents(message, previousUserMsg);
  const cleanTopics = Array.isArray(recentTopics)
    ? recentTopics
        .filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
        .slice(0, 2)
        .map((t) => t.trim().slice(0, 120))
    : [];
  const systemInstruction = buildSystemInstruction(config, message, metricsSnapshot, intents, cleanTopics);
  const contents = buildContents(message, image, history);
  const ai = getGenAIClient();

  const requestedModel = payload.model || config?.model;
  const candidateModels = getCandidateModels(requestedModel);
  const maxOutputTokens = computeMaxOutputTokens(intents, config?.tone);
  let lastError: unknown = null;

  for (let i = 0; i < candidateModels.length; i++) {
    const modelName = candidateModels[i];
    const { temperature, topP, thinkingConfig } = resolveGenerationParameters(message, intents, config, modelName);

    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents,
        config: {
          systemInstruction,
          temperature,
          topP,
          thinkingConfig,
          maxOutputTokens,
        },
      });

      const candidate = response.candidates?.[0];
      const finishReason = candidate?.finishReason;
      let text = response.text || '';

      if (finishReason === 'MAX_TOKENS') {
        if (intents.wantsSocial) {
          return "Erreur : la génération du visuel a été tronquée par la limite de tokens. Veuillez relancer la demande.";
        }
        text = text ? `${text.trim()}\n\n_(Réponse abrégée — écris « continue » pour la suite.)_` : "_(Réponse abrégée — écris « continue » pour la suite.)_";
        return text;
      }

      if (text.trim()) {
        return text;
      }

      // Réponse vide : ne pas retenter, renvoyer un message clair en français
      return "Le modèle IA a renvoyé une réponse vide. Veuillez reformuler votre question.";
    } catch (error: unknown) {
      lastError = error;
      console.warn(`[AI Admin Chat] Model "${modelName}" failed:`, error);

      // Si ce n'est pas une erreur transitoire ou si c'est le dernier modèle, on ne réessaie pas
      const canRetry = isTransitoryError(error) && i < candidateModels.length - 1;
      if (!canRetry) {
        break;
      }
      console.info(`[AI Admin Chat] Transient error on "${modelName}", trying fallback candidate "${candidateModels[i + 1]}"...`);
    }
  }

  const errMessage = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`Erreur lors de la communication avec Gemini : ${errMessage}`);
}

/**
 * Server-Sent Events (SSE) streaming handler for real-time progressive response delivery.
 */
export async function streamAdminChatMessage(
  payload: AdminChatRequest,
  onChunk: (text: string) => void
): Promise<string> {
  const { message, image, history = [], recentTopics = [], config = {}, metricsSnapshot } = payload;
  const previousUserMsg = history
    ?.slice()
    .reverse()
    .find((h) => h.role === 'user')?.text;
  const intents = detectIntents(message, previousUserMsg);
  const cleanTopics = Array.isArray(recentTopics)
    ? recentTopics
        .filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
        .slice(0, 2)
        .map((t) => t.trim().slice(0, 120))
    : [];
  const systemInstruction = buildSystemInstruction(config, message, metricsSnapshot, intents, cleanTopics);
  const contents = buildContents(message, image, history);
  const ai = getGenAIClient();

  const requestedModel = payload.model || config?.model;
  const candidateModels = getCandidateModels(requestedModel);
  const maxOutputTokens = computeMaxOutputTokens(intents, config?.tone);
  let lastError: unknown = null;

  for (let i = 0; i < candidateModels.length; i++) {
    const modelName = candidateModels[i];
    const { temperature, topP, thinkingConfig } = resolveGenerationParameters(message, intents, config, modelName);
    let fullText = '';
    let hasEmittedChunk = false;
    let finishReason: string | undefined = undefined;

    try {
      const responseStream = await ai.models.generateContentStream({
        model: modelName,
        contents,
        config: {
          systemInstruction,
          temperature,
          topP,
          thinkingConfig,
          maxOutputTokens,
        },
      });

      for await (const chunk of responseStream) {
        const candidate = chunk.candidates?.[0];
        if (candidate?.finishReason) {
          finishReason = candidate.finishReason;
        }
        const chunkText = chunk.text;
        if (chunkText) {
          fullText += chunkText;
          hasEmittedChunk = true;
          onChunk(chunkText);
        }
      }

      if (finishReason === 'MAX_TOKENS') {
        if (intents.wantsSocial) {
          const errorMsg = '\n\nErreur : la génération du visuel a été tronquée par la limite de tokens. Veuillez relancer la demande.';
          onChunk(errorMsg);
          return fullText + errorMsg;
        } else {
          const notice = '\n\n_(Réponse abrégée — écris « continue » pour la suite.)_';
          onChunk(notice);
          return fullText + notice;
        }
      }

      if (fullText.trim()) {
        return fullText;
      }

      // Réponse vide : renvoyer message clair en français sans relancer
      const emptyMsg = "Le modèle IA a renvoyé une réponse vide. Veuillez reformuler votre question.";
      onChunk(emptyMsg);
      return emptyMsg;
    } catch (error: unknown) {
      lastError = error;
      console.warn(`[AI Admin Chat Stream] Model "${modelName}" failed:`, error);

      // Si du texte a déjà été émis, ne rien relancer
      if (hasEmittedChunk) {
        const streamErrorNotice = '\n\n_(Interruption du flux de réponse.)_';
        onChunk(streamErrorNotice);
        return fullText + streamErrorNotice;
      }

      // Si ce n'est pas une erreur transitoire ou si c'est le dernier modèle, on ne réessaie pas
      const canRetry = isTransitoryError(error) && i < candidateModels.length - 1;
      if (!canRetry) {
        break;
      }
      console.info(`[AI Admin Chat Stream] Transient error on "${modelName}", trying fallback candidate "${candidateModels[i + 1]}"...`);
    }
  }

  const errMessage = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`Erreur lors de la communication avec Gemini : ${errMessage}`);
}

