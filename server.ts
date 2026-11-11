/**
 * RÈGLE PERMANENTE DU PALMARÈS :
 * Le Palmarès ne contient que des joueurs humains authentifiés par Google, avec des statistiques valides.
 * Toute évolution future doit la respecter, sauf demande explicite du propriétaire.
 */

import express from 'express';
import http from 'http';
import path from 'path';
import compression from 'compression';
import { WebSocketServer } from 'ws';
import { createServer as createViteServer } from 'vite';
import { RoomManager } from './server/rooms/roomManager';
import { loadEngineConfigFromStore, persistEngineConfigToStore, getConfigStoreStatus } from './server/engine/configStore';
import { recordConnection, recordDisconnection, startMetricsFlushLoop, getTodaySnapshot } from './server/rooms/connectionMetrics';
import { getEngineConfig, getEngineConfigVersion } from './server/engine/engineConfig';
import { getPublicParams, PARAM_BY_KEY } from './server/engine/engineParams';
import { handleAdminChatMessage, streamAdminChatMessage } from './server/aiAdminChat';
import { generateVisualVariants } from './server/aiVisual';
import { listKoraMoments } from './server/rooms/koraMomentStore';
import { saveSoloPartieBatch, enableGameRecording } from './server/rooms/gameRecordStore';
import { runLegacyAction, createFirestoreLegacyStore } from './server/rooms/legacyRecords';
import { isKoraMoment } from './src/katika/visual/situation';
import { pushService, buildGameUrl } from './server/pushService';
import { saveProviderCredentials, getProviderCredentialsMasked, isCashSecretsKeyConfigured } from './server/cash/cashSecrets';
import { testCampayConnection, createLiveCampayDeps, createLiveWithdrawalDeps, readCampayBalance } from './server/cash/campayClient';
import {
  getFinancePeriods,
  getFinanceSettings,
  getFinanceTotals,
  getLatestBaseline,
  getOwedToPlayers,
  listReconciliations,
  saveReconciliation,
  updateFinanceSettings,
} from './server/cash/financeStore';
import { computeReconciliation, parseFinanceSettingsPatch, parseManualBalance } from './server/cash/financeRules';
import { startCampayDeposit, verifyMyDeposit, handleCampayWebhook } from './server/cash/campayDeposits';
import { extractWebhookEvent, normalizeCameroonPhone } from './server/cash/campayRules';
import {
  approveWithdrawal,
  cancelMyWithdrawal,
  handleWithdrawalWebhook,
  recheckWithdrawal,
  rejectWithdrawal,
  requestWithdrawal,
  resolveWithdrawal,
  toPublicWithdrawal,
  verifyMyWithdrawal,
} from './server/cash/withdrawals';
import {
  WITHDRAWAL_DEMO_MAX_FCFA,
  WITHDRAWAL_DEMO_MIN_FCFA,
  isValidWithdrawalId,
  parseWithdrawalSettingsPatch,
} from './server/cash/withdrawalRules';
import { getWithdrawalSettings, listPlayerWithdrawals, listRecentWithdrawals, updateWithdrawalSettings } from './server/cash/withdrawalStore';
import { addPhone, listPhones, removePhone } from './server/cash/phoneBookStore';
import { maskPhone } from './server/cash/phoneBookRules';
import { getKoraCashConfig, readKoraCashConfigStrict, updateKoraCashConfig } from './server/cash/cashConfigStore';
import { parseConfigPatch, toPublicStatus } from './server/cash/cashConfigRules';
import { getWallet, listPlayerLedger } from './server/cash/walletLedger';
import { toPublicMovements } from './server/cash/cashHistoryRules';
import {
  getCashTableSettings,
  getCashTablesAccess,
  getLiveCashTableBook,
  hasCashTableConsent,
  listOpenCashSeats,
  listRecentCashParties,
  recordCashTableConsent,
  updateCashTableSettings,
} from './server/cash/cashTableStore';
import { parseCashTableSettingsPatch } from './server/cash/cashTableRules';
import {
  ProtectionError,
  checkDepositAllowed,
  closeCollusionAlert,
  getPlayerProtection,
  getProtectionSettings,
  getProtectionView,
  liftPlayerExclusion,
  listOpenCollusionAlerts,
  listWatchedPlayers,
  requestExclusion,
  setPersonalLimit,
  setPlayerFreeze,
  updateProtectionSettings,
} from './server/cash/protectionStore';
import { randomBytes } from 'crypto';
import { dateKeyFor } from './server/cash/withdrawalRules';
import { COLLUSION_REASON_LABELS, REVIEW_REASON_LABELS, exclusionEnd, parseProtectionSettingsPatch } from './server/cash/protectionRules';
import { setWalletChangeListener } from './server/cash/walletEvents';
import { listPendingDeposits, listRecentCampayDeposits } from './server/cash/depositStore';
import { previewDemoCleanup, applyDemoCleanup } from './server/cash/demoCleanup';
import { totalDeduction } from './server/cash/demoCleanupRules';
import { DepositError } from './server/cash/depositRules';
import { CashLedgerError } from './server/cash/cashTypes';
import { verifyFirebaseIdToken, setAdminUserClaim, getFirebaseAdminAuth, getFirebaseAdminAppDb } from './server/firebaseAdmin';
import { ADMIN_TEMPLATES, isAllowed, isTemplateId, KatikaPermission, PERMISSION_LABELS, routeRequirement, sanitizePermissions } from './server/katika/adminRights';
import { adminRegistry, listAdminEntries, readAdminEntry, writeAdminEntry } from './server/katika/adminRegistry';
import { sanitizeRankTitles, summarizeUsers } from './server/katika/usersSummary';
import { createAiLimiter } from './server/katika/aiLimiter';
import { deleteThread, listThreads, sanitizeThread, saveThread, threadsToPrune } from './server/katika/copilotThreads';
import { isActivityFailure, katikaActivityData, toActivityBucket, readStopThreshold, isQuotaError, katikaReadsBlocked, QUOTA_MESSAGE, READ_LIMIT_MESSAGE } from './server/katika/activityData';
import { buildJournalCsv, formatDoualaDateTime, parseJournalQuery, resolvePlayerFilter, scanJournal, toJournalLine } from './server/cash/cashJournalRules';
import { createLedgerBatchReader, getJournalLimits, loadJournalNames } from './server/cash/journalStore';
import { DASHBOARD_MAX_RECORDS, isDashboardFailure, katikaDashboardData, readWarnThreshold, toDashboardPart } from './server/katika/dashboardData';
import { buildClientAudit, katikaAuditStore, mergeAuditLogs } from './server/katika/auditStore';
import { getReadBudget, recordServerReads } from './server/katika/readBudget';
import { getClientReads, recordClientReads } from './server/katika/clientReads';
import { computeRepairPlan } from './server/profileRepair';
import { collection, getCountFromServer, getDocs, query, limit, orderBy, startAfter } from 'firebase/firestore';
import { db } from './src/lib/firebase';
import {
  computeMasteryScoreFromStats,
  computeEventMasteryScore,
  getDoualaDateKey,
  MASTERY_CONFIG,
  isEligibleLeaderboardUser,
  LEADERBOARD_POLICY,
} from './src/services/masteryConfig';
import { RankTitleId, computeRanks, rankSettingsFromConfig, withPublicRanks } from './src/services/rankTiers';
import { HONORIFIC_TITLES, legacyTitleIdFromStats } from './src/types/playerProfile';
import { runRankPushes } from './server/ranks/rankPush';
import { createLiveRankPushDeps } from './server/ranks/rankPushLive';

const PORT = process.env.NODE_ENV === 'production'
  ? Number(process.env.PORT || 8080)
  : 3000;
const instanceId = 'inst_' + Math.random().toString(36).substring(2, 10) + '_' + Date.now().toString(36);
const bootedAt = new Date().toISOString();

// Filet de sécurité : un rejet de promesse non géré (ex. client Google sans identifiants) est journalisé
// au lieu d'arrêter le serveur, qui garde les tables en mémoire.
process.on('unhandledRejection', (reason: unknown) => {
  console.warn('[Process] Rejet de promesse non géré (journalisé, le serveur continue) :', (reason as any)?.message || reason);
});

async function startServer() {
  // Config moteur persistée (Firestore) : chargée avant d'accepter la moindre connexion.
  await loadEngineConfigFromStore();
  RoomManager.refreshEngineConfig();

  // Tables en cours sauvegardées (Firestore) : restaurées avant d'accepter la moindre connexion.
  await RoomManager.restoreRoomsAtBoot();
  RoomManager.enableRoomSnapshots();
  enableGameRecording();
  startMetricsFlushLoop();

  const app = express();
  app.use(compression());
  app.use(express.json({ limit: '15mb' }));

  const server = http.createServer(app);

  // Initialize Room Cleanup Interval (2h public / 24h private / 15m bots)
  RoomManager.setAuditSink((log) => katikaAuditStore.persist(log));
  RoomManager.initRoomCleanupInterval();

  // Arrêt propre : on tente de sauvegarder toutes les tables modifiées avant que le processus ne se ferme
  // (redéploiement, mise à l'échelle...). Le délai est volontairement court (shutdownFlushSeconds).
  let shuttingDown = false;
  const gracefulShutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    const flushSeconds = Number(RoomManager.getEngineConfig().shutdownFlushSeconds ?? 8);
    console.log(`[Server] Signal ${signal} reçu : sauvegarde des tables (max ${flushSeconds}s) avant arrêt.`);
    await Promise.race([
      RoomManager.flushAllRoomSnapshots(),
      new Promise((resolve) => setTimeout(resolve, flushSeconds * 1000)),
    ]).catch(() => {});
    process.exit(0);
  };
  process.on('SIGTERM', () => void gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => void gracefulShutdown('SIGINT'));

  // WebSocket Server Setup
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    try {
      const url = new URL(request.url || '', `http://${request.headers.host || 'localhost'}`);
      if (url.pathname === '/ws') {
        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit('connection', ws, request);
        });
      }
    } catch (e) {
      console.error('[WS] Upgrade error:', e);
    }
  });

  // Kora Cash : chaque mouvement de solde appliqué prévient le téléphone du joueur connecté (sans montant)
  setWalletChangeListener((uid) => RoomManager.notifyCashWalletChanged(uid));

  // Native Transport-Level Keep-Alive Heartbeat (RFC 6455 ws.ping/pong)
  // Keeps sockets active across Cloud Run ingress and 4G/5G mobile operators without killing sleeping clients
  let wsHeartbeatTimer: NodeJS.Timeout | null = null;
  const scheduleWsHeartbeat = () => {
    // Période relue à chaque tour : réglable dans katika (serverWsPingIntervalSeconds), effet immédiat.
    const periodMs = Number(getEngineConfig().serverWsPingIntervalSeconds ?? 20) * 1000;
    wsHeartbeatTimer = setTimeout(() => {
      wss.clients.forEach((client) => {
        const ws = client as any;
        if (ws.isAlive === false) {
          console.log(`[WS Heartbeat] Terminating inactive socket without pong response`);
          return ws.terminate();
        }
        ws.isAlive = false;
        try {
          ws.ping();
        } catch (err) {
          // ignore socket errors during ping
        }
      });
      scheduleWsHeartbeat();
    }, periodMs);
  };
  scheduleWsHeartbeat();

  wss.on('close', () => {
    if (wsHeartbeatTimer) clearTimeout(wsHeartbeatTimer);
  });

  wss.on('connection', (ws: any, req) => {
    recordConnection();
    // Initial alive state
    ws.isAlive = true;
    ws.on('pong', () => {
      ws.isAlive = true;
    });

    // Parse reconnect token, playerId, and sessionId from URL query if provided
    let reconnectToken: string | undefined;
    let requestedPlayerId: string | undefined;
    let sessionId: string | undefined;
    try {
      if (req.url) {
        const url = new URL(req.url, `http://localhost:${PORT}`);
        reconnectToken = url.searchParams.get('token') || undefined;
        requestedPlayerId = url.searchParams.get('playerId') || undefined;
        sessionId = url.searchParams.get('sessionId') || undefined;
      }
    } catch (e) {
      // ignore
    }

    const client = RoomManager.registerClient(ws, reconnectToken, requestedPlayerId, sessionId);
    console.log(`[WS] Client connected: ${client.playerId} (token: ${client.reconnectToken.slice(0, 8)}...)`);

    const isProvisional = Boolean((requestedPlayerId && !requestedPlayerId.startsWith('usr_')) || client.isProvisional);

    try {
      ws.send(
        JSON.stringify({
          type: 'SESSION_READY',
          playerId: client.playerId,
          reconnectToken: client.reconnectToken,
          provisional: isProvisional,
          configVersion: getEngineConfigVersion(),
          timestamp: Date.now(),
        })
      );
    } catch (err) {
      console.warn(`[WS] Error sending SESSION_READY to client ${client.playerId}:`, err);
    }

    ws.on('message', (data: any) => {
      ws.isAlive = true;
      RoomManager.handleMessage(client, data.toString());
    });

    ws.on('close', (code: number) => {
      console.log(`[WS] Client disconnected: ${client.playerId}`);
      recordDisconnection(client.playerId, code);
      RoomManager.handleDisconnect(client.playerId, ws);
    });

    ws.on('error', (err: any) => {
      console.error(`[WS] Client error: ${client.playerId}`, err);
    });
  });

  // REST API Routes
  // Version metadata endpoint with strict no-cache headers for instant client update detection
  app.get('/version.json', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    const versionPath = process.env.NODE_ENV === 'production'
      ? path.join(process.cwd(), 'dist', 'version.json')
      : path.join(process.cwd(), 'public', 'version.json');
    res.sendFile(versionPath, (err) => {
      if (err) {
        res.sendFile(path.join(process.cwd(), 'public', 'version.json'));
      }
    });
  });

  // Service Worker endpoint with strict no-cache headers to guarantee prompt updates
  app.get('/sw.js', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    const swPath = process.env.NODE_ENV === 'production'
      ? path.join(process.cwd(), 'dist', 'sw.js')
      : path.join(process.cwd(), 'public', 'sw.js');
    res.sendFile(swPath, (err) => {
      if (err) {
        res.sendFile(path.join(process.cwd(), 'public', 'sw.js'));
      }
    });
  });

  // Manifests serving with strict JSON and no-cache headers to prevent HTML fallback / MIME mismatches
  const serveManifest = (manifestFileName: string) => (req: express.Request, res: express.Response) => {
    res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    const primaryPath = process.env.NODE_ENV === 'production'
      ? path.join(process.cwd(), 'dist', manifestFileName)
      : path.join(process.cwd(), 'public', manifestFileName);
    res.sendFile(primaryPath, (err) => {
      if (err) {
        res.sendFile(path.join(process.cwd(), 'public', manifestFileName), (fallbackErr) => {
          if (fallbackErr) {
            res.status(404).json({ error: 'Manifest not found' });
          }
        });
      }
    });
  };

  // Dual PWA Manifest endpoints (root, scoped, and legacy JSON alias)
  app.get('/manifest.webmanifest', serveManifest('manifest.webmanifest'));
  app.get('/game/manifest.webmanifest', serveManifest('manifest.webmanifest'));
  app.get('/manifest.json', serveManifest('manifest.webmanifest'));
  app.get('/game/manifest.json', serveManifest('manifest.webmanifest'));

  app.get('/manifest-copilot.webmanifest', serveManifest('manifest-copilot.webmanifest'));
  app.get('/copilot/manifest-copilot.webmanifest', serveManifest('manifest-copilot.webmanifest'));
  app.get('/copilot/manifest.webmanifest', serveManifest('manifest-copilot.webmanifest'));
  app.get('/manifest-copilot.json', serveManifest('manifest-copilot.webmanifest'));
  app.get('/copilot/manifest-copilot.json', serveManifest('manifest-copilot.webmanifest'));

  // Push Notifications API
  app.get('/api/push/public-key', (req, res) => {
    res.json({
      status: 'ok',
      publicKey: pushService.getPublicKey(),
      vapidPersistent: pushService.isVapidPersistent(),
      subscribersCount: pushService.getSubscribersCount(),
    });
  });

  // Un identifiant Google (UID) ne peut être revendiqué qu'avec un jeton Firebase valide ;
  // seuls les identifiants invités ("usr_...") sont acceptés sans jeton (même règle que le WebSocket).
  const resolvePushUserId = async (req: express.Request, claimedUserId: string): Promise<string | null> => {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (token) {
      const verified = await verifyFirebaseIdToken(token);
      if (verified) return verified.uid;
      return null;
    }
    return typeof claimedUserId === 'string' && claimedUserId.startsWith('usr_') ? claimedUserId : null;
  };

  app.post('/api/push/subscribe', express.json(), async (req, res) => {
    const { userId, userName, subscription, userAgent, preferences } = req.body || {};
    if (!userId || !subscription) {
      return res.status(400).json({ success: false, error: 'Champs userId ou subscription manquants' });
    }
    const resolvedId = await resolvePushUserId(req, userId);
    if (!resolvedId) {
      return res.status(401).json({ success: false, error: 'Identité non vérifiée' });
    }
    const registered = pushService.registerSubscription(resolvedId, userName, subscription, userAgent, preferences);
    res.json({ success: registered, subscribersCount: pushService.getSubscribersCount() });
  });

  app.post('/api/push/preferences', express.json(), async (req, res) => {
    const { userId, endpoint, preferences } = req.body || {};
    if (!userId || !endpoint || !preferences) {
      return res.status(400).json({ success: false, error: 'Champs manquants' });
    }
    const resolvedId = await resolvePushUserId(req, userId);
    if (!resolvedId) {
      return res.status(401).json({ success: false, error: 'Identité non vérifiée' });
    }
    res.json({ success: pushService.updatePreferences(resolvedId, endpoint, preferences) });
  });

  app.post('/api/push/unsubscribe', express.json(), async (req, res) => {
    const { userId, endpoint } = req.body || {};
    if (!userId || !endpoint) {
      return res.status(400).json({ success: false, error: 'Champs userId ou endpoint manquants' });
    }
    const resolvedId = await resolvePushUserId(req, userId);
    if (!resolvedId) {
      return res.status(401).json({ success: false, error: 'Identité non vérifiée' });
    }
    const removed = pushService.removeSubscription(resolvedId, endpoint);
    res.json({ success: removed });
  });

  // Test de notification : envoyé UNIQUEMENT à l'appareil qui le demande (endpoint), 1 fois / 15 s.
  const lastPushTestAt = new Map<string, number>();
  app.post('/api/push/send-test', express.json(), async (req, res) => {
    const { userId, endpoint } = req.body || {};
    if (!userId || !endpoint) {
      return res.status(400).json({ success: false, error: 'userId et endpoint requis pour le test' });
    }
    const resolvedId = await resolvePushUserId(req, userId);
    if (!resolvedId) {
      return res.status(401).json({ success: false, error: 'Identité non vérifiée' });
    }
    const now = Date.now();
    if (now - (lastPushTestAt.get(resolvedId) || 0) < Number(getEngineConfig().pushTestCooldownSeconds ?? 15) * 1000) {
      return res.status(429).json({ success: false, error: 'Patientez quelques secondes avant un nouveau test.' });
    }
    lastPushTestAt.set(resolvedId, now);

    const result = await pushService.sendNotificationToUser(
      resolvedId,
      {
        title: '🃏 Njambo Kora — test réussi',
        body: 'Les notifications fonctionnent sur cet appareil. Touchez pour ouvrir le jeu.',
        icon: '/icon-192.png',
        badge: '/badge-96.png',
        tag: 'njambo-test',
        data: { type: 'SYSTEM', url: buildGameUrl() },
      },
      { onlyEndpoint: endpoint }
    );
    res.json({ success: result.success > 0, ...result });
  });

  // Mesure des lectures Firestore faites par les téléphones : rapport anonyme (types de document et nombres), validé et borné.
  app.post('/api/telemetry/client-reads', (req, res) => {
    recordClientReads(req.body?.reads);
    res.status(204).end();
  });

  // Télémétrie : réception des parties SOLO (jouées sur l'appareil, parfois hors ligne).
  // Le serveur valide, déduplique et écrit la fiche de manche + le journal de partie.
  app.post('/api/telemetry/solo-batch', express.json(), async (req, res) => {
    try {
      const authHeader = String(req.headers.authorization || '');
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
      const verified = token ? await verifyFirebaseIdToken(token) : null;
      const result = await saveSoloPartieBatch({
        tokenProvided: Boolean(token),
        verified: verified ? { uid: verified.uid, email: verified.email } : null,
        body: req.body,
      });
      res.status(result.status).json(result.body);
    } catch (err: unknown) {
      console.warn('[Telemetry API] solo-batch error:', err instanceof Error ? err.message : err);
      res.status(500).json({ success: false, error: 'Erreur interne' });
    }
  });

  app.get(['/health', '/healthz'], (_req, res) => {
    res.status(200).send('OK');
  });

  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      instanceId,
      bootedAt,
      activeRooms: RoomManager.getActiveRoomsCount(),
      configVersion: getEngineConfigVersion(),
      configStore: getConfigStoreStatus(),
      connectionMetrics: getTodaySnapshot(),
      timestamp: Date.now(),
    });
  });

  /**
   * RÈGLE PERMANENTE DU PALMARÈS :
   * Le Palmarès ne contient que des joueurs humains authentifiés par Google, avec des statistiques valides.
   * Toute évolution future doit la respecter, sauf demande explicite du propriétaire.
   */
  // Leaderboard Server Cache (60s cache to respect Firestore Quotas while keeping leaderboard fresh)
  let cachedLeaderboardUsers: any[] = [];
  let leaderboardCacheTimestamp = 0;
  let leaderboardRefreshInFlight: Promise<void> | null = null;
  let leaderboardLastFailureAt = 0;
  // Rangs dynamiques : limite de ce qu'on sait de l'activité, et nombre réel de joueurs au-delà de ceux lus.
  let leaderboardUnknownActivitySince = 0;
  let leaderboardTotalPlayers = 0;
  // TTL du cache serveur du Palmarès : leaderboardServerCacheSeconds (katika), relu à chaque lecture.

  function calculateMasteryScore(stats: any): number {
    return computeMasteryScoreFromStats(stats);
  }

  // Rangs calculés sur le classement général, à chaque réponse : un réglage Katika s'applique tout de suite.
  function computeLeaderboardRanks() {
    return computeRanks(
      cachedLeaderboardUsers.map((u) => ({
        uid: u.uid,
        masteryScore: u.stats?.masteryScore || 0,
        gamesPlayed: u.stats?.gamesPlayed || 0,
        gamesWon: u.stats?.gamesWon || 0,
        lastGameAt: u.lastGameAt,
      })),
      rankSettingsFromConfig(getEngineConfig() as unknown as Record<string, number>),
      Date.now(),
      { unknownActivitySince: leaderboardUnknownActivitySince, totalPlayers: leaderboardTotalPlayers }
    );
  }

  // Dernières annonces parties : le jeu n'affiche pas une deuxième fois le bandeau à l'ouverture.
  const lastPushedRankTitles = new Map<string, string>();

  // Rangs comparés à l'état enregistré, à chaque relecture du classement. Une panne n'empêche jamais de répondre.
  async function checkRankChanges(): Promise<void> {
    try {
      const cfg = getEngineConfig() as unknown as Record<string, number>;
      const { ranks } = computeLeaderboardRanks();
      const players = cachedLeaderboardUsers.flatMap((u) => {
        const rank = ranks[u.uid];
        return rank
          ? [{ uid: u.uid, titleId: rank.titleId, inactivitySteps: rank.inactivitySteps, legacyTitleId: legacyTitleIdFromStats(u.stats) as RankTitleId }]
          : [];
      });
      if (players.length === 0) return;
      const delivered = await runRankPushes(
        createLiveRankPushDeps(),
        players,
        {
          enabled: Boolean(cfg.rankPushEnabled),
          cooldownMs: Number(cfg.rankPushCooldownHours ?? 24) * 60 * 60 * 1000,
          maxPerCheck: Number(cfg.rankPushMaxPerCheck ?? 50),
          nightStartHour: Number(cfg.rankPushNightStartHour ?? 22),
          nightEndHour: Number(cfg.rankPushNightEndHour ?? 7),
          titleName: (id) => HONORIFIC_TITLES.find((t) => t.id === id)?.title ?? id,
        },
        Date.now()
      );
      delivered.forEach((push) => lastPushedRankTitles.set(push.uid, push.titleId));
    } catch (err: any) {
      console.warn('[RankPush] Vérification impossible.', err?.message || err);
    }
  }

  // Lit le classement si le cache a dépassé maxAgeMs. Lectures Firestore comptées : le Palmarès et le rang ont chacun leur durée.
  // Une seule lecture à la fois : les demandes arrivées pendant une lecture attendent son résultat au lieu d'en relancer une.
  // Après un échec (quota atteint par exemple), aucune nouvelle tentative avant leaderboardForceMinSeconds.
  async function refreshLeaderboardCacheIfNeeded(force: boolean, maxAgeMs: number): Promise<void> {
    if (!db) return;
    const leaderboardCacheAgeMs = Date.now() - leaderboardCacheTimestamp;
    const leaderboardForceMinMs = Number(getEngineConfig().leaderboardForceMinSeconds ?? 60) * 1000;
    const stale = (force && leaderboardCacheAgeMs > leaderboardForceMinMs) || leaderboardCacheAgeMs > maxAgeMs || leaderboardCacheTimestamp === 0;
    if (!stale || Date.now() - leaderboardLastFailureAt < leaderboardForceMinMs) return;
    if (!leaderboardRefreshInFlight) {
      leaderboardRefreshInFlight = readLeaderboardIntoCache().finally(() => {
        leaderboardRefreshInFlight = null;
      });
    }
    await leaderboardRefreshInFlight;
  }

  async function readLeaderboardIntoCache(): Promise<void> {
    try {
      // 1. Requêtes Firestore paginées (avec secours sans orderBy pour capter tous les profils réels)
      const usersSnapDocs: any[] = [];
      let lastUserDoc: any = null;
      const userPageSize = 100;
      const maxUsers = 300;

      try {
        while (usersSnapDocs.length < maxUsers) {
          const uQuery = lastUserDoc
            ? query(
                collection(db, 'users'),
                orderBy('stats.masteryScore', 'desc'),
                startAfter(lastUserDoc),
                limit(userPageSize)
              )
            : query(
                collection(db, 'users'),
                orderBy('stats.masteryScore', 'desc'),
                limit(userPageSize)
              );
          const snap = await getDocs(uQuery);
          recordServerReads(snap.size);
          if (snap.empty) break;
          usersSnapDocs.push(...snap.docs);
          lastUserDoc = snap.docs[snap.docs.length - 1];
          if (snap.docs.length < userPageSize) break;
        }
      } catch (queryErr) {
        console.warn('[Leaderboard Server] orderBy query fallback triggered:', queryErr);
      }

      // Si la requête orderBy renvoie peu ou pas de documents (ex: propriété stats.masteryScore absente sur les documents), requêter directement sans orderBy
      if (usersSnapDocs.length === 0) {
        try {
          const fallbackSnap = await getDocs(query(collection(db, 'users'), limit(userPageSize)));
          recordServerReads(fallbackSnap.size);
          usersSnapDocs.push(...fallbackSnap.docs);
        } catch (fallbackErr) {
          console.warn('[Leaderboard Server] Direct users fallback failed:', fallbackErr);
        }
      }

      const recordsSnapDocs: any[] = [];
      let lastRecordDoc: any = null;
      const recordPageSize = 100;
      const maxRecords = 500;

      while (recordsSnapDocs.length < maxRecords) {
        const rQuery = lastRecordDoc
          ? query(
              collection(db, 'njambo_game_records'),
              orderBy('createdAt', 'desc'),
              startAfter(lastRecordDoc),
              limit(recordPageSize)
            )
          : query(
              collection(db, 'njambo_game_records'),
              orderBy('createdAt', 'desc'),
              limit(recordPageSize)
            );
        const snap = await getDocs(rQuery);
        recordServerReads(snap.size);
        if (snap.empty) break;
        recordsSnapDocs.push(...snap.docs);
        lastRecordDoc = snap.docs[snap.docs.length - 1];
        if (snap.docs.length < recordPageSize) break;
      }

      const usersMap = new Map<string, any>();
      const guestToUserMap = new Map<string, string>();

      // Chargement des utilisateurs Google officiels validés par la règle permanente
      usersSnapDocs.forEach((doc) => {
        const data = doc.data();
        const uid = doc.id;
        if (!isEligibleLeaderboardUser(uid, data)) return;

        usersMap.set(uid, {
          uid,
          displayName: data.displayName || 'Joueur',
          photoURL: data.photoURL || null,
          avatarId: data.avatarId || 'lion',
          isGuest: false,
          authProvider: data.authProvider || 'google.com',
          scoreVersion: data.scoreVersion || data.stats?.scoreVersion || 1,
          chips: data.chips ?? 1000,
          stats: { ...(data.stats || {}) },
          fairPlay: data.fairPlay || { activeSanction: null },
        });

        if (data.migratedFromGuestUid && typeof data.migratedFromGuestUid === 'string') {
          guestToUserMap.set(data.migratedFromGuestUid.trim(), uid);
        }
        if (Array.isArray(data.previousUids)) {
          data.previousUids.forEach((pUid: string) => {
            if (typeof pUid === 'string' && pUid.trim()) {
              guestToUserMap.set(pUid.trim(), uid);
            }
          });
        }
      });

      // 2. Dédoublonnage des enregistrements par ID de document
      const seenRecordIds = new Set<string>();
      const uniqueRecords: Array<{ id: string; data: any }> = [];

      for (const d of recordsSnapDocs) {
        if (seenRecordIds.has(d.id)) continue;
        seenRecordIds.add(d.id);
        uniqueRecords.push({ id: d.id, data: d.data() });
      }

      // 3. Filtrage temporel : ignorer les dates futures ou hors fenêtre
      const now = Date.now();
      // delay-ok: borne de validation de sécurité du Palmarès (tolérance d'horloge), pas un délai de jeu
      const MAX_FUTURE_DRIFT_MS = 60 * 1000; // 1 minute max tolérance d'horloge
      // delay-ok: fenêtre de validité des parties comptées au Palmarès, règle de produit et non un délai
      const MAX_WINDOW_AGE_MS = 60 * 24 * 60 * 60 * 1000; // 60 jours

      const validRecords = uniqueRecords.filter(({ data: g }) => {
        const gameTime = g.createdAt || g.timestamp || 0;
        if (typeof gameTime !== 'number' || gameTime <= 0) return false;
        if (gameTime > now + MAX_FUTURE_DRIFT_MS || gameTime < now - MAX_WINDOW_AGE_MS) {
          return false;
        }
        return true;
      });

      // 4. Corroboration multijoueur stricte :
      // Exige roomId valide (différent de 'multiplayer'), mancheNumber numérique > 0, creatorUid et winnerId.
      // Aucun repli sur winnerName, aucun repli mancheNumber 1 ou roomId 'multiplayer'.
      const mpGroups = new Map<string, Array<{ id: string; creatorUid: string; winnerId: string }>>();
      const corroboratedRecordIds = new Set<string>();

      for (const { id, data: g } of validRecords) {
        const isValidMp =
          g.mode === 'MULTIPLAYER' &&
          typeof g.roomId === 'string' &&
          g.roomId.trim() !== '' &&
          g.roomId !== 'multiplayer' &&
          typeof g.mancheNumber === 'number' &&
          g.mancheNumber > 0 &&
          typeof g.creatorUid === 'string' &&
          g.creatorUid.trim() !== '' &&
          typeof g.winnerId === 'string' &&
          g.winnerId.trim() !== '';

        if (isValidMp) {
          const groupKey = `${g.roomId}__m${g.mancheNumber}`;
          if (!mpGroups.has(groupKey)) {
            mpGroups.set(groupKey, []);
          }
          mpGroups.get(groupKey)!.push({
            id,
            creatorUid: g.creatorUid.trim(),
            winnerId: g.winnerId.trim(),
          });
        }
      }

      for (const [_key, list] of mpGroups.entries()) {
        for (let i = 0; i < list.length; i++) {
          for (let j = i + 1; j < list.length; j++) {
            const a = list[i];
            const b = list[j];
            const distinctCreators = a.creatorUid !== b.creatorUid;
            const concordantWinner = a.winnerId === b.winnerId;
            if (distinctCreators && concordantWinner) {
              corroboratedRecordIds.add(a.id);
              corroboratedRecordIds.add(b.id);
            }
          }
        }
      }

      // 5. Agrégation des statistiques par creatorUid avec plafonds journaliers en fuseau Africa/Douala
      const gameStatsByPlayer = new Map<string, any>();
      const lastGameAtByPlayer = new Map<string, number>();
      // delay-ok: définition de la période « Semaine » du Palmarès, pas un délai
      const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;
      // delay-ok: définition de la période « Mois » du Palmarès, pas un délai
      const oneMonthAgo = now - 30 * 24 * 60 * 60 * 1000;

      // Plafonds journaliers par joueur (fuseau horaire Africa/Douala)
      // - Maximum 80 manches comptabilisées par jour
      // - Maximum 30 points de maîtrise solo par jour
      const dailyManchesMap = new Map<string, number>();
      const dailySoloPointsMap = new Map<string, number>();

      // On trie les enregistrements valides par ordre chronologique croissant
      const chronologicalRecords = [...validRecords].sort(
        (a, b) => (a.data.createdAt || a.data.timestamp || 0) - (b.data.createdAt || b.data.timestamp || 0)
      );

      for (const { id, data: g } of chronologicalRecords) {
        let creatorUid = typeof g.creatorUid === 'string' ? g.creatorUid.trim() : '';
        if (creatorUid && guestToUserMap.has(creatorUid)) {
          creatorUid = guestToUserMap.get(creatorUid)!;
        }

        // Rattachement par creatorUid résolu ou direct
        if (!creatorUid || !usersMap.has(creatorUid)) {
          continue;
        }

        const gameTime = g.createdAt || g.timestamp || 0;
        // Toute fiche prouve que le joueur a joué, même si elle ne compte pas pour les statistiques.
        lastGameAtByPlayer.set(creatorUid, Math.max(lastGameAtByPlayer.get(creatorUid) || 0, gameTime));
        const isMultiplayer = g.mode === 'MULTIPLAYER';
        const isCorroborated = !isMultiplayer || corroboratedRecordIds.has(id);

        // Les enregistrements multijoueur non corroborés sont exclus
        if (isMultiplayer && !isCorroborated) {
          continue;
        }

        const doualaDateKey = getDoualaDateKey(gameTime);
        const playerDayKey = `${creatorUid}__${doualaDateKey}`;

        // Vérification du plafond journalier de 80 manches
        const currentDailyManches = dailyManchesMap.get(playerDayKey) || 0;
        if (currentDailyManches >= 80) {
          continue;
        }
        dailyManchesMap.set(playerDayKey, currentDailyManches + 1);

        const cur = gameStatsByPlayer.get(creatorUid) || {
          id: creatorUid,
          gamesPlayed: 0,
          gamesWon: 0,
          koraCount: 0,
          doubleKoraCount: 0,
          potWon: 0,
          multiplayerManchesWon: 0,
          soloManchesWonHard: 0,
          soloManchesWonNormal: 0,
          soloManchesWonEasy: 0,
          soloManchesWon: 0,
          manchesWon: 0,
          masteryScore: 0,
          week: {
            gamesPlayed: 0,
            gamesWon: 0,
            koraCount: 0,
            doubleKoraCount: 0,
            multiplayerManchesWon: 0,
            soloManchesWonHard: 0,
            soloManchesWonNormal: 0,
            soloManchesWonEasy: 0,
            masteryScore: 0,
          },
          month: {
            gamesPlayed: 0,
            gamesWon: 0,
            koraCount: 0,
            doubleKoraCount: 0,
            multiplayerManchesWon: 0,
            soloManchesWonHard: 0,
            soloManchesWonNormal: 0,
            soloManchesWonEasy: 0,
            masteryScore: 0,
          },
        };

        cur.gamesPlayed++;
        if (gameTime >= oneWeekAgo) cur.week.gamesPlayed++;
        if (gameTime >= oneMonthAgo) cur.month.gamesPlayed++;

        const isWinner = g.winnerId === creatorUid;
        if (isWinner) {
          cur.gamesWon++;
          if (gameTime >= oneWeekAgo) cur.week.gamesWon++;
          if (gameTime >= oneMonthAgo) cur.month.gamesWon++;

          if (g.winType === 'KORA') {
            cur.koraCount++;
            if (gameTime >= oneWeekAgo) cur.week.koraCount++;
            if (gameTime >= oneMonthAgo) cur.month.koraCount++;
          }
          if (g.winType === 'DOUBLE_KORA') {
            cur.doubleKoraCount++;
            if (gameTime >= oneWeekAgo) cur.week.doubleKoraCount++;
            if (gameTime >= oneMonthAgo) cur.month.doubleKoraCount++;
          }
          if (g.potWon) cur.potWon += g.potWon;

          if (g.isMancheFinalWin) {
            cur.manchesWon++;
            if (isMultiplayer) {
              cur.multiplayerManchesWon++;
              if (gameTime >= oneWeekAgo) cur.week.multiplayerManchesWon++;
              if (gameTime >= oneMonthAgo) cur.month.multiplayerManchesWon++;
            } else {
              cur.soloManchesWon++;
              const diff = (g.aiDifficulty || 'NORMAL').toUpperCase();
              if (diff === 'HARD' || diff === 'EXPERT' || diff === 'GRAND_MASTER') {
                cur.soloManchesWonHard++;
                if (gameTime >= oneWeekAgo) cur.week.soloManchesWonHard++;
                if (gameTime >= oneMonthAgo) cur.month.soloManchesWonHard++;
              } else if (diff === 'EASY') {
                cur.soloManchesWonEasy++;
                if (gameTime >= oneWeekAgo) cur.week.soloManchesWonEasy++;
                if (gameTime >= oneMonthAgo) cur.month.soloManchesWonEasy++;
              } else {
                cur.soloManchesWonNormal++;
                if (gameTime >= oneWeekAgo) cur.week.soloManchesWonNormal++;
                if (gameTime >= oneMonthAgo) cur.month.soloManchesWonNormal++;
              }
            }
          }

          // Calcul événementiel des points de maîtrise avec plafond solo 30 pts/jour
          let eventPotential = 0;
          if (g.isMancheFinalWin === true && g.status === 'completed') {
            eventPotential = computeEventMasteryScore({
              mode: g.mode,
              difficulty: g.aiDifficulty,
              isMancheWinner: true,
              isForfeitWin: g.winType === 'FORFEIT',
              koras: g.winType === 'KORA' ? 1 : 0,
              doubleKoras: g.winType === 'DOUBLE_KORA' ? 1 : 0,
            });
          }

          let awarded = 0;
          if (!isMultiplayer && eventPotential > 0) {
            const currentDailySoloPoints = dailySoloPointsMap.get(playerDayKey) || 0;
            const cap = MASTERY_CONFIG.rules.dailySoloPointsCap; // 30
            if (currentDailySoloPoints < cap) {
              awarded = Math.min(eventPotential, cap - currentDailySoloPoints);
              dailySoloPointsMap.set(playerDayKey, currentDailySoloPoints + awarded);
            }
          } else {
            awarded = eventPotential;
          }

          cur.masteryScore += awarded;
          if (gameTime >= oneWeekAgo) cur.week.masteryScore += awarded;
          if (gameTime >= oneMonthAgo) cur.month.masteryScore += awarded;
        }

        gameStatsByPlayer.set(creatorUid, cur);
      }

      // 6. Enrichissement et réconciliation des profils
      for (const [uid, u] of usersMap.entries()) {
        const stats = { ...u.stats };
        const isV2 = (u.scoreVersion || u.stats?.scoreVersion || 1) >= 2;
        const matchedRec = gameStatsByPlayer.get(uid);

        if (isV2) {
          // ScoreVersion >= 2 : NE PAS faire de Math.max avec les données globales !
          // Le profil v2 stocké fait autorité pour le total historique.
          // On met à jour les stats temporelles (week et month) calculées fidèlement.
          u.temporalStats = {
            week: {
              gamesPlayed: matchedRec?.week?.gamesPlayed || 0,
              gamesWon: matchedRec?.week?.gamesWon || 0,
              koraCount: matchedRec?.week?.koraCount || 0,
              doubleKoraCount: matchedRec?.week?.doubleKoraCount || 0,
              multiplayerManchesWon: matchedRec?.week?.multiplayerManchesWon || 0,
              soloManchesWonHard: matchedRec?.week?.soloManchesWonHard || 0,
              soloManchesWonNormal: matchedRec?.week?.soloManchesWonNormal || 0,
              soloManchesWonEasy: matchedRec?.week?.soloManchesWonEasy || 0,
              masteryScore: matchedRec?.week?.masteryScore || 0,
            },
            month: {
              gamesPlayed: matchedRec?.month?.gamesPlayed || 0,
              gamesWon: matchedRec?.month?.gamesWon || 0,
              koraCount: matchedRec?.month?.koraCount || 0,
              doubleKoraCount: matchedRec?.month?.doubleKoraCount || 0,
              multiplayerManchesWon: matchedRec?.month?.multiplayerManchesWon || 0,
              soloManchesWonHard: matchedRec?.month?.soloManchesWonHard || 0,
              soloManchesWonNormal: matchedRec?.month?.soloManchesWonNormal || 0,
              soloManchesWonEasy: matchedRec?.month?.soloManchesWonEasy || 0,
              masteryScore: matchedRec?.month?.masteryScore || 0,
            },
          };
        } else {
          // Profils legacy scoreVersion < 2 : compatibilité ascendante
          const gamesPlayed = Math.max(stats.partiesPlayed || stats.gamesPlayed || 0, matchedRec?.gamesPlayed || 0);
          const gamesWon = Math.max(stats.partiesWon || stats.gamesWon || 0, matchedRec?.gamesWon || 0);
          const koraCount = Math.max(stats.koraCount || 0, matchedRec?.koraCount || 0);
          const doubleKoraCount = Math.max(stats.doubleKoraCount || 0, matchedRec?.doubleKoraCount || 0);
          const biggestPotWon = Math.max(stats.biggestPotWon || 0, matchedRec?.potWon || 0);
          const winRate = gamesPlayed > 0 ? Math.round((gamesWon / gamesPlayed) * 100) : 0;

          const mpManchesWon = Math.max(stats.multiplayerManchesWon || 0, matchedRec?.multiplayerManchesWon || 0);
          const soloHardManchesWon = Math.max(stats.soloManchesWonHard || 0, matchedRec?.soloManchesWonHard || 0);
          const soloNormalManchesWon = Math.max(stats.soloManchesWonNormal || 0, matchedRec?.soloManchesWonNormal || 0);
          const soloEasyManchesWon = Math.max(stats.soloManchesWonEasy || 0, matchedRec?.soloManchesWonEasy || 0);
          const soloManchesWon = Math.max(stats.soloManchesWon || 0, matchedRec?.soloManchesWon || 0);
          const manchesWon = Math.max(stats.manchesWon || 0, matchedRec?.manchesWon || 0);

          stats.gamesPlayed = gamesPlayed;
          stats.partiesPlayed = gamesPlayed;
          stats.gamesWon = gamesWon;
          stats.partiesWon = gamesWon;
          stats.koraCount = koraCount;
          stats.doubleKoraCount = doubleKoraCount;
          stats.biggestPotWon = biggestPotWon;
          stats.winRate = winRate;
          stats.multiplayerManchesWon = mpManchesWon;
          stats.soloManchesWonHard = soloHardManchesWon;
          stats.soloManchesWonNormal = soloNormalManchesWon;
          stats.soloManchesWonEasy = soloEasyManchesWon;
          stats.soloManchesWon = soloManchesWon;
          stats.manchesWon = manchesWon;
          stats.masteryScore = calculateMasteryScore(stats);

          u.stats = stats;
          u.temporalStats = {
            week: {
              gamesPlayed: matchedRec?.week?.gamesPlayed || 0,
              gamesWon: matchedRec?.week?.gamesWon || 0,
              koraCount: matchedRec?.week?.koraCount || 0,
              doubleKoraCount: matchedRec?.week?.doubleKoraCount || 0,
              multiplayerManchesWon: matchedRec?.week?.multiplayerManchesWon || 0,
              soloManchesWonHard: matchedRec?.week?.soloManchesWonHard || 0,
              soloManchesWonNormal: matchedRec?.week?.soloManchesWonNormal || 0,
              soloManchesWonEasy: matchedRec?.week?.soloManchesWonEasy || 0,
              masteryScore: matchedRec?.week?.masteryScore || 0,
            },
            month: {
              gamesPlayed: matchedRec?.month?.gamesPlayed || 0,
              gamesWon: matchedRec?.month?.gamesWon || 0,
              koraCount: matchedRec?.month?.koraCount || 0,
              doubleKoraCount: matchedRec?.month?.doubleKoraCount || 0,
              multiplayerManchesWon: matchedRec?.month?.multiplayerManchesWon || 0,
              soloManchesWonHard: matchedRec?.month?.soloManchesWonHard || 0,
              soloManchesWonNormal: matchedRec?.month?.soloManchesWonNormal || 0,
              soloManchesWonEasy: matchedRec?.month?.soloManchesWonEasy || 0,
              masteryScore: matchedRec?.month?.masteryScore || 0,
            },
          };
        }
      }

      usersMap.forEach((u) => {
        u.lastGameAt = lastGameAtByPlayer.get(u.uid);
      });

      // Lecture plafonnée : si elle est pleine, l'absence de fiche ne prouve une inactivité que jusqu'à la plus ancienne lue.
      const oldestReadRecordAt = validRecords.reduce((oldest, { data: g }) => Math.min(oldest, g.createdAt || g.timestamp || now), now);
      leaderboardUnknownActivitySince = recordsSnapDocs.length >= maxRecords ? oldestReadRecordAt : now - MAX_WINDOW_AGE_MS;

      // Lecture plafonnée : au-delà, le nombre de joueurs vient d'un simple comptage.
      leaderboardTotalPlayers = usersMap.size;
      if (usersSnapDocs.length >= maxUsers) {
        try {
          const counted = await getCountFromServer(collection(db, 'users'));
          recordServerReads(1);
          leaderboardTotalPlayers = Math.max(usersMap.size, counted.data().count);
        } catch (countErr) {
          console.warn('[Leaderboard Server] Comptage des joueurs impossible.', countErr);
        }
      }

      cachedLeaderboardUsers = Array.from(usersMap.values()).sort(
        (a, b) => (b.stats?.masteryScore || 0) - (a.stats?.masteryScore || 0)
      );
      leaderboardCacheTimestamp = Date.now();
      console.log(`[Server] Leaderboard cache refreshed with ${cachedLeaderboardUsers.length} players.`);
      await checkRankChanges();
    } catch (dbErr: any) {
      leaderboardLastFailureAt = Date.now();
      console.warn('[Leaderboard Server] Firestore query soft warning (e.g. quota limit reached):', dbErr?.message || dbErr);
    }
  }

  // Rang du joueur, sans la liste : appelé à l'ouverture du jeu, il ne relit le classement que selon rankRefreshMinutes.
  app.get('/api/leaderboard/my-rank', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      await refreshLeaderboardCacheIfNeeded(false, Number(getEngineConfig().rankRefreshMinutes ?? 60) * 60 * 1000);
      const result = computeLeaderboardRanks();
      const uid = typeof req.query.uid === 'string' ? req.query.uid : '';
      res.json({ success: true, rank: result.ranks[uid] ?? null, tiers: result.tiers, totalPlayers: result.totalPlayers, pushedTitleId: lastPushedRankTitles.get(uid) ?? null });
    } catch (err: any) {
      console.warn('[Leaderboard] Lecture du rang impossible.', err?.message || err);
      res.status(500).json({ success: false, error: 'Lecture du rang impossible.' });
    }
  });

  app.get('/api/leaderboard/cached', async (req, res) => {
    try {
      const force = req.query.force === 'true';
      const timeframe = (req.query.timeframe as string) || 'ALL'; // 'ALL' | 'WEEK' | 'MONTH'

      await refreshLeaderboardCacheIfNeeded(force, Number(getEngineConfig().leaderboardServerCacheSeconds ?? 300) * 1000);

      // Filter by timeframe if requested
      let resultUsers = [...cachedLeaderboardUsers];
      if (timeframe === 'WEEK' || timeframe === 'MONTH') {
        const key = timeframe === 'WEEK' ? 'week' : 'month';
        resultUsers = resultUsers
          .map((u) => {
            const tStats = u.temporalStats?.[key] || {};
            return {
              ...u,
              stats: {
                ...u.stats,
                ...tStats,
                partiesPlayed: tStats.gamesPlayed || 0,
                partiesWon: tStats.gamesWon || 0,
                winRate:
                  (tStats.gamesPlayed || 0) > 0
                    ? Math.round(((tStats.gamesWon || 0) / tStats.gamesPlayed) * 100)
                    : 0,
                masteryScore: tStats.masteryScore || 0,
              },
            };
          })
          .filter((u) => isEligibleLeaderboardUser(u.uid, u));
      } else {
        resultUsers = resultUsers.filter((u) => isEligibleLeaderboardUser(u.uid, u));
      }

      const rankResult = computeLeaderboardRanks();
      res.json({
        success: true,
        users: withPublicRanks(resultUsers, rankResult.ranks),
        rankTiers: { tiers: rankResult.tiers, totalPlayers: rankResult.totalPlayers },
        timestamp: leaderboardCacheTimestamp,
        timeframe,
      });
    } catch (err: any) {
      console.warn('[Leaderboard Cache API] Error:', err.message);
      res.json({ success: true, users: withPublicRanks(cachedLeaderboardUsers, {}), timestamp: leaderboardCacheTimestamp || Date.now() });
    }
  });

  // Config publique (lecture seule, sans authentification) : uniquement les paramètres de portée client ou both.
  app.get('/api/config/public', (req, res) => {
    const cfg = getEngineConfig() as unknown as Record<string, unknown>;
    const cacheSeconds = Math.max(0, Number(cfg.publicConfigCacheSeconds ?? PARAM_BY_KEY.publicConfigCacheSeconds.default) || 0);
    res.setHeader('Cache-Control', `public, max-age=${cacheSeconds}`);
    res.json({ configVersion: getEngineConfigVersion(), params: getPublicParams(cfg) });
  });

  // Kora Cash — statut public lu par l'application des joueurs : « activé ou non » et l'environnement, rien d'autre.
  // En cas de doute (erreur de lecture), le statut renvoyé est « désactivé ».
  // Le statut est demandé à chaque ouverture de l'accueil : il est gardé publicConfigCacheSeconds (2 lectures Firestore évitées par appel).
  // Seul l'affichage en profite ; dépôts, retraits et tables relisent toujours la configuration. Un enregistrement dans katika vide ce cache.
  let cashPublicStatusCache: { body: Record<string, unknown>; at: number } | null = null;
  app.get('/api/cash/status', async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const engineCfg = getEngineConfig() as unknown as Record<string, unknown>;
      const cacheMs = Math.max(0, Number(engineCfg.publicConfigCacheSeconds ?? PARAM_BY_KEY.publicConfigCacheSeconds.default) || 0) * 1000;
      if (cashPublicStatusCache && cacheMs > 0 && Date.now() - cashPublicStatusCache.at < cacheMs) {
        return res.json(cashPublicStatusCache.body);
      }
      const [cfg, finance] = await Promise.all([readKoraCashConfigStrict(), getFinanceSettings()]);
      const body = { success: true, ...toPublicStatus(cfg), depositFeePercent: finance.depositFeePercent };
      cashPublicStatusCache = { body, at: Date.now() };
      res.json(body);
    } catch (err) {
      console.warn('[KoraCash] Lecture du statut public impossible, statut « désactivé » renvoyé.', err instanceof Error ? err.message : String(err));
      res.json({ success: true, enabled: false, environment: 'DEMO', depositMode: 'SIMULATED' });
    }
  });

  // Kora Cash — accès joueur : jeton Firebase valide ET compte Google (jamais anonyme ni invité).
  async function requireGooglePlayer(req: any, res: any): Promise<{ uid: string; email?: string } | null> {
    const authHeader = String(req.headers.authorization || '');
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    const verified = token ? await verifyFirebaseIdToken(token) : null;
    if (!verified) {
      res.status(401).json({ success: false, error: 'Connexion requise.' });
      return null;
    }
    if (verified.signInProvider !== 'google.com') {
      res.status(403).json({ success: false, error: 'Un compte Google est requis pour Kora Cash.' });
      return null;
    }
    return { uid: verified.uid, email: verified.email };
  }

  // Kora Cash — solde du joueur connecté (disponible et engagé en table, FCFA entiers).
  app.get('/api/cash/wallet', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const player = await requireGooglePlayer(req, res);
    if (!player) return;
    try {
      // Le portefeuille affiché suit l'environnement actif : la démo et l'argent réel ne se mélangent jamais.
      const cfg = await getKoraCashConfig();
      const wallet = await getWallet(player.uid, cfg.environment === 'LIVE' ? 'LIVE' : 'DEMO');
      res.json({ success: true, wallet: { available: wallet.available, locked: wallet.locked } });
    } catch (err) {
      console.error('[KoraCash] Lecture du portefeuille impossible.', err);
      res.status(500).json({ success: false, error: 'Lecture du portefeuille impossible.' });
    }
  });

  // Kora Cash — historique des mouvements du joueur connecté. Lecture seule, dans le même environnement que le solde.
  app.get('/api/cash/history', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const player = await requireGooglePlayer(req, res);
    if (!player) return;
    try {
      const cfg = await getKoraCashConfig();
      const entries = await listPlayerLedger(player.uid, cfg.environment === 'LIVE' ? 'LIVE' : 'DEMO');
      res.json({ success: true, movements: toPublicMovements(entries) });
    } catch (err) {
      console.error('[KoraCash] Lecture de l\'historique impossible.', err instanceof Error ? err.message : String(err));
      res.status(500).json({ success: false, error: 'Lecture de ton historique impossible.' });
    }
  });

  // Kora Cash — dépôt Mobile Money par Campay (bac à sable uniquement tant que le retrait n'est pas livré).
  // Ni le joueur ni la notification seule ne décident du crédit : voir server/cash/campayDeposits.ts.
  app.post('/api/cash/deposit/campay', express.json(), async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const player = await requireGooglePlayer(req, res);
    if (!player) return;
    try {
      const cfg = await getKoraCashConfig();
      if (!cfg.isEnabled) {
        return res.status(403).json({ success: false, error: 'Kora Cash est désactivé.' });
      }
      if (cfg.environment !== 'DEMO') {
        return res.status(403).json({ success: false, error: 'Le dépôt Mobile Money réel n\'est pas encore ouvert.' });
      }
      if (cfg.activeProviderId !== 'campay') {
        return res.status(403).json({ success: false, error: 'Le dépôt Mobile Money n\'est pas activé.' });
      }
      const refusal = await checkDepositAllowed(player.uid, req.body?.amount, async () =>
        // Seuls les dépôts lancés aujourd'hui comptent : un paiement abandonné un autre jour ne doit pas réduire la limite du jour.
        (await listPendingDeposits(player.uid, 50))
          .filter((d) => dateKeyFor(d.createdAt) === dateKeyFor(Date.now()))
          .reduce((total, d) => total + d.amount, 0)
      );
      if (refusal) {
        return res.status(403).json({ success: false, error: refusal });
      }
      const result = await startCampayDeposit(createLiveCampayDeps(), {
        uid: player.uid,
        amount: req.body?.amount,
        phone: req.body?.phone,
      });
      const { httpStatus, message, ...rest } = result;
      res.status(httpStatus).json(result.success ? { ...rest, message } : { ...rest, error: message });
    } catch (err) {
      if (err instanceof DepositError || err instanceof CashLedgerError) {
        return res.status(400).json({ success: false, error: err.message });
      }
      console.error('[KoraCash] Dépôt Campay impossible.', err);
      res.status(500).json({ success: false, error: 'Dépôt impossible.' });
    }
  });

  // Kora Cash — dépôts Mobile Money du joueur encore en attente (pour les vérifier après avoir fermé la fenêtre)
  app.get('/api/cash/deposits/pending', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const player = await requireGooglePlayer(req, res);
    if (!player) return;
    try {
      const deposits = await listPendingDeposits(player.uid);
      res.json({ success: true, deposits });
    } catch (err) {
      console.error('[KoraCash] Lecture des dépôts en attente impossible.', err instanceof Error ? err.message : String(err));
      res.status(500).json({ success: false, error: 'Lecture des dépôts en attente impossible.' });
    }
  });

  // Kora Cash — « Vérifier mon paiement » : relit le paiement chez Campay et crédite seulement s'il est confirmé.
  // Pas de contrôle d'activation : un paiement déjà fait doit pouvoir être retrouvé même si Kora Cash est coupé depuis.
  app.post('/api/cash/deposit/:id/verify', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const player = await requireGooglePlayer(req, res);
    if (!player) return;
    try {
      const result = await verifyMyDeposit(createLiveCampayDeps(), { uid: player.uid, depositId: req.params.id });
      const { httpStatus, message, ...rest } = result;
      res.status(httpStatus).json(result.success ? { ...rest, message } : { ...rest, error: message });
    } catch (err) {
      if (err instanceof DepositError || err instanceof CashLedgerError) {
        return res.status(400).json({ success: false, error: err.message });
      }
      console.error('[KoraCash] Vérification du dépôt impossible.', err);
      res.status(500).json({ success: false, error: 'Vérification impossible.' });
    }
  });

  // Kora Cash — notification de Campay (GET avec paramètres d'URL ou POST JSON). Publique par nature : la signature
  // est vérifiée puis le paiement relu chez Campay avant tout crédit. La réponse ne contient aucune donnée sensible.
  const campayWebhookHandler = async (req: any, res: any) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      // Un retrait porte son propre identifiant : la notification suit alors le service de retrait.
      if (isValidWithdrawalId(extractWebhookEvent(req.query, req.body).externalReference)) {
        const withdrawal = await handleWithdrawalWebhook(createLiveWithdrawalDeps(), { query: req.query, body: req.body });
        return res.status(withdrawal.httpStatus).json({ success: withdrawal.success });
      }
      const result = await handleCampayWebhook(createLiveCampayDeps(), { query: req.query, body: req.body });
      res.status(result.httpStatus).json({ success: result.success });
    } catch (err) {
      console.error('[KoraCash] Notification Campay : traitement impossible.', err);
      res.status(500).json({ success: false });
    }
  };
  app.get('/api/cash/campay/webhook', campayWebhookHandler);
  app.post('/api/cash/campay/webhook', campayWebhookHandler);

  // Kora Cash — protection du joueur connecté : ses limites, ses totaux du jour, sa pause en cours.
  app.get('/api/cash/protection', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const player = await requireGooglePlayer(req, res);
    if (!player) return;
    try {
      res.json({ success: true, protection: await getProtectionView(player.uid) });
    } catch (err) {
      console.error('[KoraCash] Lecture de la protection impossible.', err instanceof Error ? err.message : String(err));
      res.status(500).json({ success: false, error: 'Lecture de tes limites impossible.' });
    }
  });

  app.post('/api/cash/protection/limit', express.json(), async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const player = await requireGooglePlayer(req, res);
    if (!player) return;
    const kind = req.body?.kind;
    if (kind !== 'deposit' && kind !== 'loss') {
      return res.status(400).json({ success: false, error: 'Limite inconnue.' });
    }
    try {
      const { delayed } = await setPersonalLimit(player.uid, kind, req.body?.value);
      res.json({ success: true, delayed, protection: await getProtectionView(player.uid) });
    } catch (err) {
      if (err instanceof ProtectionError) return res.status(400).json({ success: false, error: err.message });
      console.error('[KoraCash] Changement de limite impossible.', err instanceof Error ? err.message : String(err));
      res.status(500).json({ success: false, error: 'Changement de limite impossible.' });
    }
  });

  app.post('/api/cash/protection/exclusion', express.json(), async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const player = await requireGooglePlayer(req, res);
    if (!player) return;
    try {
      await requestExclusion(player.uid, { kind: req.body?.kind, days: req.body?.days });
      res.json({ success: true, protection: await getProtectionView(player.uid) });
    } catch (err) {
      if (err instanceof ProtectionError) return res.status(400).json({ success: false, error: err.message });
      console.error('[KoraCash] Pause impossible.', err instanceof Error ? err.message : String(err));
      res.status(500).json({ success: false, error: 'Pause impossible pour le moment.' });
    }
  });

  // Kora Cash — ce que la fenêtre du joueur doit savoir des tables : ouvertes ou non, niveaux, commission, sa table en cours.
  app.get('/api/cash/tables', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const player = await requireGooglePlayer(req, res);
    if (!player) return;
    try {
      const { open, settings } = await getCashTablesAccess();
      res.json({
        success: true,
        enabled: open,
        betLevels: settings.betLevels,
        minBuyInMultiple: settings.minBuyInMultiple,
        maxBuyInMultiple: settings.maxBuyInMultiple,
        rakePercent: settings.rakePercent,
        consented: await hasCashTableConsent(player.uid),
        myTableCode: RoomManager.getCashSeatRoomCode(player.uid),
      });
    } catch (err) {
      console.error('[KoraCash] Lecture des tables impossible.', err instanceof Error ? err.message : String(err));
      res.status(500).json({ success: false, error: 'Lecture des tables impossible.' });
    }
  });

  // Kora Cash — aperçu d'une table par son code, pour la page d'invitation. Lecture seule, compte Google requis.
  // Ne renvoie jamais de solde ni de capital, ni le nom des autres joueurs ; entrer à la table reste décidé par le serveur de salons.
  app.get('/api/cash/tables/preview', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const player = await requireGooglePlayer(req, res);
    if (!player) return;
    try {
      const { open } = await getCashTablesAccess();
      if (!open) {
        res.json({ success: true, enabled: false });
        return;
      }
      const { limited, preview } = RoomManager.previewCashTable(player.uid, req.query.code);
      if (limited) {
        res.status(429).json({ success: false, error: 'Trop de tentatives. Patiente quelques secondes.' });
        return;
      }
      res.json({ success: true, enabled: true, preview });
    } catch (err) {
      console.error('[KoraCash] Aperçu de table impossible.', err instanceof Error ? err.message : String(err));
      res.status(500).json({ success: false, error: 'Lecture de la table impossible.' });
    }
  });

  // Kora Cash — confirmation « 18 ans et argent réel » : la preuve est conservée côté serveur.
  app.post('/api/cash/tables/consent', async (req, res) => {
    const player = await requireGooglePlayer(req, res);
    if (!player) return;
    try {
      await recordCashTableConsent(player.uid);
      res.json({ success: true });
    } catch (err) {
      console.error('[KoraCash] Confirmation des tables non enregistrée.', err instanceof Error ? err.message : String(err));
      res.status(500).json({ success: false, error: 'Enregistrement impossible.' });
    }
  });

  // Kora Cash — le retrait n'est ouvert qu'en démo, avec Campay actif : le serveur reste seul juge.
  async function isWithdrawalOpen(): Promise<boolean> {
    const [cfg, settings] = await Promise.all([getKoraCashConfig(), getWithdrawalSettings()]);
    return cfg.isEnabled && cfg.environment === 'DEMO' && cfg.activeProviderId === 'campay' && settings.enabled;
  }

  // Kora Cash — ce que la fenêtre du joueur doit savoir du retrait : ouvert ou non, frais, limites. Rien d'autre.
  app.get('/api/cash/withdrawal-settings', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const player = await requireGooglePlayer(req, res);
    if (!player) return;
    try {
      const settings = await getWithdrawalSettings();
      res.json({
        success: true,
        enabled: await isWithdrawalOpen(),
        feePercent: settings.feePercent,
        maxPhones: settings.maxPhones,
        minAmount: WITHDRAWAL_DEMO_MIN_FCFA,
        maxAmount: WITHDRAWAL_DEMO_MAX_FCFA,
      });
    } catch (err) {
      console.error('[KoraCash] Lecture des réglages de retrait impossible.', err instanceof Error ? err.message : String(err));
      res.status(500).json({ success: false, error: 'Lecture des réglages impossible.' });
    }
  });

  // Kora Cash — carnet de numéros du joueur connecté.
  app.get('/api/cash/phones', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const player = await requireGooglePlayer(req, res);
    if (!player) return;
    try {
      res.json({ success: true, phones: await listPhones(player.uid) });
    } catch (err) {
      console.error('[KoraCash] Lecture du carnet de numéros impossible.', err instanceof Error ? err.message : String(err));
      res.status(500).json({ success: false, error: 'Lecture de tes numéros impossible.' });
    }
  });

  app.post('/api/cash/phones', express.json(), async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const player = await requireGooglePlayer(req, res);
    if (!player) return;
    const phone = normalizeCameroonPhone(req.body?.phone);
    if (!phone.ok || !phone.phone) {
      return res.status(400).json({ success: false, error: phone.error || 'Numéro invalide.' });
    }
    try {
      const settings = await getWithdrawalSettings();
      const result = await addPhone(player.uid, phone.phone, settings.maxPhones);
      if (!result.ok) return res.status(400).json({ success: false, error: result.error });
      res.json({ success: true, phones: result.entries });
    } catch (err) {
      console.error('[KoraCash] Ajout du numéro impossible.', err instanceof Error ? err.message : String(err));
      res.status(500).json({ success: false, error: 'Ajout du numéro impossible.' });
    }
  });

  app.delete('/api/cash/phones/:phone', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const player = await requireGooglePlayer(req, res);
    if (!player) return;
    const phone = normalizeCameroonPhone(req.params.phone);
    if (!phone.ok || !phone.phone) {
      return res.status(400).json({ success: false, error: phone.error || 'Numéro invalide.' });
    }
    try {
      // Un numéro qui attend de recevoir un retrait ne peut pas être retiré du carnet.
      const recent = await listPlayerWithdrawals(player.uid);
      const inUse = recent.some((w) => w.phone === phone.phone && !['SUCCESS', 'FAILED', 'CANCELLED'].includes(w.status));
      if (inUse) {
        return res.status(409).json({ success: false, error: 'Ce numéro attend un retrait en cours.' });
      }
      res.json({ success: true, phones: await removePhone(player.uid, phone.phone) });
    } catch (err) {
      console.error('[KoraCash] Retrait du numéro impossible.', err instanceof Error ? err.message : String(err));
      res.status(500).json({ success: false, error: 'Suppression du numéro impossible.' });
    }
  });

  // Kora Cash — retraits du joueur connecté.
  app.get('/api/cash/withdrawals', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const player = await requireGooglePlayer(req, res);
    if (!player) return;
    try {
      const withdrawals = await listPlayerWithdrawals(player.uid);
      res.json({ success: true, withdrawals: withdrawals.map(toPublicWithdrawal) });
    } catch (err) {
      console.error('[KoraCash] Lecture des retraits impossible.', err instanceof Error ? err.message : String(err));
      res.status(500).json({ success: false, error: 'Lecture de tes retraits impossible.' });
    }
  });

  const sendWithdrawalResult = (res: any, result: { httpStatus: number; success: boolean; message?: string; withdrawal?: unknown }) => {
    const { httpStatus, message, ...rest } = result;
    res.status(httpStatus).json(result.success ? { ...rest, message } : { ...rest, error: message });
  };

  app.post('/api/cash/withdrawal', express.json(), async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const player = await requireGooglePlayer(req, res);
    if (!player) return;
    try {
      if (!(await isWithdrawalOpen())) {
        return res.status(403).json({ success: false, error: 'Le retrait n\'est pas ouvert pour le moment.' });
      }
      sendWithdrawalResult(res, await requestWithdrawal(createLiveWithdrawalDeps(), { uid: player.uid, amount: req.body?.amount, phone: req.body?.phone }));
    } catch (err) {
      console.error('[KoraCash] Demande de retrait impossible.', err instanceof Error ? err.message : String(err));
      res.status(500).json({ success: false, error: 'Demande de retrait impossible.' });
    }
  });

  // Relecture et annulation restent possibles même si le retrait est coupé depuis : une demande en cours doit pouvoir aboutir.
  app.post('/api/cash/withdrawal/:id/verify', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const player = await requireGooglePlayer(req, res);
    if (!player) return;
    try {
      sendWithdrawalResult(res, await verifyMyWithdrawal(createLiveWithdrawalDeps(), { uid: player.uid, id: req.params.id }));
    } catch (err) {
      console.error('[KoraCash] Relecture du retrait impossible.', err instanceof Error ? err.message : String(err));
      res.status(500).json({ success: false, error: 'Relecture impossible.' });
    }
  });

  app.post('/api/cash/withdrawal/:id/cancel', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const player = await requireGooglePlayer(req, res);
    if (!player) return;
    try {
      sendWithdrawalResult(res, await cancelMyWithdrawal(createLiveWithdrawalDeps(), { uid: player.uid, id: req.params.id }));
    } catch (err) {
      console.error('[KoraCash] Annulation du retrait impossible.', err instanceof Error ? err.message : String(err));
      res.status(500).json({ success: false, error: 'Annulation impossible.' });
    }
  });

  // Katika Admin Auth Protection Middleware (Firebase ID Token verification)
  const KATIKA_ADMIN_EMAIL = (process.env.KATIKA_ADMIN_EMAIL || '237okmr@gmail.com').toLowerCase();
  app.use('/api/katika', async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
      console.warn('[Katika Admin Auth] Refus d\'accès 401: En-tête Authorization: Bearer <jeton> manquant ou invalide.', { path: req.path });
      return res.status(401).json({
        success: false,
        error: 'Accès administrateur Katika Master non autorisé. Jeton Bearer d\'identité Firebase requis.',
      });
    }

    const token = authHeader.substring(7).trim();
    if (!token) {
      console.warn('[Katika Admin Auth] Refus d\'accès 401: Jeton Bearer vide.', { path: req.path });
      return res.status(401).json({
        success: false,
        error: 'Accès administrateur Katika Master non autorisé. Jeton Bearer vide.',
      });
    }

    const verified = await verifyFirebaseIdToken(token);
    if (!verified || !verified.uid) {
      console.warn('[Katika Admin Auth] Refus d\'accès 401: Jeton ID Firebase invalide, expiré ou corrompu.', { path: req.path });
      return res.status(401).json({
        success: false,
        error: 'Accès administrateur Katika Master non autorisé. Jeton ID Firebase invalide ou expiré.',
      });
    }

    const email = (verified.email || '').toLowerCase().trim();
    if (verified.emailVerified !== true) {
      return res.status(401).json({ success: false, error: 'Accès refusé : adresse e-mail non vérifiée.' });
    }

    // Le propriétaire a tous les droits ; un admin ajouté n'a que ceux de sa fiche, relue régulièrement (server/katika/adminRegistry.ts).
    const isOwner = email === KATIKA_ADMIN_EMAIL;
    let permissions: KatikaPermission[] = [];
    if (!isOwner) {
      let entry;
      try {
        entry = await adminRegistry.get(verified.uid);
      } catch (err) {
        console.warn('[Katika Admin Auth] Fiche admin illisible.', err instanceof Error ? err.message : String(err));
        return res.status(503).json({ success: false, error: 'Droits illisibles pour le moment, réessaie dans un instant.' });
      }
      if (!entry || entry.status !== 'ACTIVE') {
        console.warn(`[Katika Admin Auth] Refus 401 : compte sans accès katika (uid: ${verified.uid}).`, { path: req.path });
        return res.status(401).json({ success: false, error: 'Accès refusé : ce compte n\'a pas accès à katika.' });
      }
      permissions = entry.permissions;
    }

    // Refus par défaut : une route non classée dans server/katika/adminRights.ts est réservée au propriétaire.
    if (!isAllowed({ isOwner, permissions }, routeRequirement(req.method, req.path))) {
      console.warn(`[Katika Admin Auth] Refus 403 ${req.method} ${req.path} (uid: ${verified.uid}).`);
      return res.status(403).json({ success: false, error: 'Tu n\'as pas le droit de faire cette action.' });
    }

    (req as any).katikaUser = { uid: verified.uid, email, isOwner, permissions };
    return next();
  });

  // Droits du compte connecté : l'écran s'en sert pour n'afficher que ce qui est permis (le serveur reste seul juge).
  app.get('/api/katika/me', (req, res) => {
    const user = (req as any).katikaUser;
    res.json({ success: true, uid: user.uid, email: user.email, isOwner: user.isOwner, permissions: user.permissions });
  });

  // Gestion des administrateurs : propriétaire seul (classé OWNER dans server/katika/adminRights.ts).
  app.get('/api/katika/admins', async (_req, res) => {
    try {
      const admins = await listAdminEntries();
      res.json({ success: true, admins, templates: ADMIN_TEMPLATES, permissionLabels: PERMISSION_LABELS, timestamp: Date.now() });
    } catch (err: any) {
      console.error('[Katika Admins] Lecture du registre impossible :', err);
      res.status(500).json({ success: false, error: 'Lecture des administrateurs impossible.' });
    }
  });

  /** Droits demandés : liste explicite, sinon ceux du modèle (lecture seule par défaut). */
  function requestedRights(body: any): { template: string; permissions: KatikaPermission[] } {
    if (Array.isArray(body?.permissions)) {
      return { template: isTemplateId(body.template) ? body.template : 'CUSTOM', permissions: sanitizePermissions(body.permissions) };
    }
    const template = isTemplateId(body?.template) ? body.template : 'READ_ONLY';
    return { template, permissions: [...ADMIN_TEMPLATES[template].permissions] };
  }

  app.post('/api/katika/admins', express.json(), async (req, res) => {
    const owner = (req as any).katikaUser;
    const targetEmail = String(req.body?.email || '').trim().toLowerCase();
    if (!targetEmail) {
      return res.status(400).json({ success: false, error: 'L\'adresse e-mail est requise.' });
    }
    if (targetEmail === KATIKA_ADMIN_EMAIL) {
      return res.status(400).json({ success: false, error: 'Le propriétaire a déjà tous les droits.' });
    }
    try {
      const account = await getFirebaseAdminAuth().getUserByEmail(targetEmail);
      const { template, permissions } = requestedRights(req.body);
      const now = new Date().toISOString();
      const entry = {
        uid: account.uid,
        email: account.email || targetEmail,
        status: 'ACTIVE' as const,
        template: template as any,
        permissions,
        grantedAt: now,
        grantedBy: owner.email,
        updatedAt: now,
        reason: String(req.body?.reason || '').slice(0, 300) || undefined,
      };
      await writeAdminEntry(entry);
      RoomManager.addAuditLog({
        id: 'adm_grant_' + Date.now().toString(36),
        timestamp: Date.now(),
        type: 'CONFIG_CHANGE',
        severity: 'WARNING',
        actor: owner.email,
        summary: `Accès katika accordé à ${entry.email} (${permissions.length} droit(s))`,
        details: { uid: entry.uid, email: entry.email, template, permissions },
      });
      return res.json({ success: true, admin: entry });
    } catch (err: any) {
      console.error('[Katika Admins] Ajout impossible :', err);
      if (err?.code === 'auth/user-not-found') {
        return res.status(404).json({
          success: false,
          error: `Aucun compte Google connu pour « ${targetEmail} » : la personne doit d'abord se connecter une fois au jeu.`,
        });
      }
      return res.status(500).json({ success: false, error: err?.message || 'Ajout impossible.' });
    }
  });

  app.put('/api/katika/admins/:uid', express.json(), async (req, res) => {
    const owner = (req as any).katikaUser;
    try {
      const current = await readAdminEntry(String(req.params.uid));
      if (!current) return res.status(404).json({ success: false, error: 'Administrateur introuvable.' });
      const { template, permissions } = requestedRights(req.body);
      const entry = { ...current, template: template as any, permissions, updatedAt: new Date().toISOString() };
      await writeAdminEntry(entry);
      RoomManager.addAuditLog({
        id: 'adm_rights_' + Date.now().toString(36),
        timestamp: Date.now(),
        type: 'CONFIG_CHANGE',
        severity: 'WARNING',
        actor: owner.email,
        summary: `Droits katika modifiés pour ${current.email}`,
        details: { uid: current.uid, before: current.permissions, after: permissions },
      });
      return res.json({ success: true, admin: entry });
    } catch (err: any) {
      console.error('[Katika Admins] Modification impossible :', err);
      return res.status(500).json({ success: false, error: err?.message || 'Modification impossible.' });
    }
  });

  app.delete('/api/katika/admins/:uid', async (req, res) => {
    const owner = (req as any).katikaUser;
    const uid = String(req.params.uid || '');
    try {
      const current = await readAdminEntry(uid);
      if (!current) return res.status(404).json({ success: false, error: 'Administrateur introuvable.' });
      const now = new Date().toISOString();
      await writeAdminEntry({ ...current, status: 'REVOKED', permissions: [], revokedAt: now, revokedBy: owner.email, updatedAt: now });
      // Ancien droit global (claim « admin ») : retiré s'il existe encore, sans bloquer le retrait si l'opération échoue.
      setAdminUserClaim({ uid }, false).catch((err) =>
        console.warn('[Katika Admins] Ancien droit global non retiré :', err instanceof Error ? err.message : String(err))
      );
      RoomManager.addAuditLog({
        id: 'adm_revoke_' + Date.now().toString(36),
        timestamp: Date.now(),
        type: 'CONFIG_CHANGE',
        severity: 'WARNING',
        actor: owner.email,
        summary: `Accès katika retiré à ${current.email}`,
        details: { uid, email: current.email },
      });
      return res.json({ success: true, uid, email: current.email });
    } catch (err: any) {
      console.error('[Katika Admins] Retrait impossible :', err);
      return res.status(500).json({ success: false, error: err?.message || 'Retrait impossible.' });
    }
  });

  // Historique cloud d'un joueur (lecture seule, droits serveur) : alimente le diagnostic du dossier joueur de katika.
  // Protégé par le middleware admin ci-dessus ; ne renvoie que les champs utiles au diagnostic.
  app.get('/api/katika/player-history/:uid', async (req, res) => {
    try {
      const uid = String(req.params.uid || '').trim();
      if (!uid || uid.length > 128 || uid.includes('/')) {
        return res.status(400).json({ success: false, error: 'Identifiant joueur invalide.' });
      }
      const adminDb = getFirebaseAdminAppDb();
      const snap = await adminDb
        .collection('users')
        .doc(uid)
        .collection('history')
        .orderBy('createdAt', 'desc')
        .limit(300)
        .get();
      const items = snap.docs.map((d) => {
        const x = d.data() as any;
        return {
          mode: typeof x.mode === 'string' ? x.mode : null,
          recordType: typeof x.recordType === 'string' ? x.recordType : null,
          isWinner: x.isWinner === true,
          createdAt: typeof x.createdAt === 'number' ? x.createdAt : null,
          masteryPointsAwarded: typeof x.masteryPointsAwarded === 'number' ? x.masteryPointsAwarded : null,
        };
      });
      return res.json({ success: true, items });
    } catch (err: any) {
      console.error('[Katika] Lecture historique joueur impossible:', err);
      return res.status(500).json({ success: false, error: err?.message || 'Lecture de l\'historique impossible.' });
    }
  });

  // Réparation d'un profil joueur en retard sur son journal (droits serveur, réservée à katika par le middleware admin ci-dessus).
  // Corps : { apply?: boolean, alreadyCredited?: number, targets?: { manchesWon, partiesWon, koraCount } }.
  // Sans apply=true, renvoie seulement l'aperçu avant/après (aucune écriture).
  app.post('/api/katika/repair-profile/:uid', async (req, res) => {
    try {
      const uid = String(req.params.uid || '').trim();
      if (!uid || uid.length > 128 || uid.includes('/')) {
        return res.status(400).json({ success: false, error: 'Identifiant joueur invalide.' });
      }
      const body: any = req.body || {};
      const t: any = body.targets || {};
      const targets = {
        manchesWon: typeof t.manchesWon === 'number' ? t.manchesWon : undefined,
        partiesWon: typeof t.partiesWon === 'number' ? t.partiesWon : undefined,
        koraCount: typeof t.koraCount === 'number' ? t.koraCount : undefined,
      };
      const alreadyCredited = typeof body.alreadyCredited === 'number' && isFinite(body.alreadyCredited) ? body.alreadyCredited : 0;
      const adminDb = getFirebaseAdminAppDb();
      const userRef = adminDb.collection('users').doc(uid);
      const userSnap = await userRef.get();
      if (!userSnap.exists) {
        return res.status(404).json({ success: false, error: 'Profil cloud introuvable.' });
      }
      const histSnap = await userRef.collection('history').orderBy('createdAt', 'desc').limit(300).get();
      const journal = histSnap.docs.map((d) => {
        const x = d.data() as any;
        return {
          mode: typeof x.mode === 'string' ? x.mode : null,
          recordType: typeof x.recordType === 'string' ? x.recordType : null,
          isWinner: x.isWinner === true,
          createdAt: typeof x.createdAt === 'number' ? x.createdAt : null,
          masteryPointsAwarded: typeof x.masteryPointsAwarded === 'number' ? x.masteryPointsAwarded : null,
        };
      });
      const plan = computeRepairPlan(userSnap.data(), journal, targets, alreadyCredited, Date.now());
      if (body.apply !== true) {
        return res.json({ success: true, applied: false, plan });
      }
      if (plan.nothingToDo) {
        return res.json({ success: true, applied: false, plan });
      }
      const patch: Record<string, any> = {
        'stats.masteryScore': plan.scoreAfter,
        soloDaily: plan.soloDailyAfter,
        updatedAt: Date.now(),
      };
      plan.counters.forEach((c) => {
        patch[`stats.${c.key}`] = c.after;
      });
      await userRef.update(patch);
      console.log('[Katika] Profil joueur réparé', { uid, scoreBefore: plan.scoreBefore, scoreAfter: plan.scoreAfter, counters: plan.counters.length });
      return res.json({ success: true, applied: true, plan });
    } catch (err: any) {
      console.error('[Katika] Réparation du profil impossible:', err);
      return res.status(500).json({ success: false, error: err?.message || 'Réparation impossible.' });
    }
  });

  // Actions sur un joueur, faites par le serveur : un admin ajouté n'a aucun accès direct à la base.
  async function playerAction(req: any, res: any, action: 'VALIDATE' | 'BOT' | 'DELETE') {
    const uid = String(req.params.uid || '').trim();
    if (!uid || uid.length > 128 || uid.includes('/')) {
      return res.status(400).json({ success: false, error: 'Identifiant joueur invalide.' });
    }
    try {
      const ref = getFirebaseAdminAppDb().collection('users').doc(uid);
      if (action === 'DELETE') await ref.delete();
      else if (action === 'BOT') await ref.set({ isBot: true, updatedAt: Date.now() }, { merge: true });
      else await ref.set({ isGuest: false, authProvider: 'google.com', isBot: false, updatedAt: Date.now() }, { merge: true });
      RoomManager.addAuditLog({
        id: `adm_player_${action.toLowerCase()}_${Date.now().toString(36)}`,
        timestamp: Date.now(),
        type: 'KATIKA_ACTION',
        severity: action === 'DELETE' ? 'CRITICAL' : 'WARNING',
        actor: req.katikaUser.email,
        summary:
          action === 'DELETE'
            ? `Suppression définitive du compte ${uid} de la base /users`
            : action === 'BOT'
            ? `Compte ${uid} marqué comme robot`
            : `Validation manuelle Palmarès pour le compte ${uid}`,
        details: { playerId: uid, action },
      });
      return res.json({ success: true, uid });
    } catch (err: any) {
      console.error('[Katika] Action joueur impossible :', err);
      return res.status(500).json({ success: false, error: err?.message || 'Action impossible.' });
    }
  }
  app.post('/api/katika/players/:uid/leaderboard-validate', (req, res) => playerAction(req, res, 'VALIDATE'));
  app.post('/api/katika/players/:uid/mark-bot', (req, res) => playerAction(req, res, 'BOT'));
  app.delete('/api/katika/players/:uid', (req, res) => playerAction(req, res, 'DELETE'));

  // Carnet de bord : lu et écrit par le serveur (collection fermée aux téléphones).
  const notesRef = () => getFirebaseAdminAppDb().collection('katika_admin_notes');
  const NOTE_TYPES = ['BUG', 'FEEDBACK', 'IDEE', 'ROADMAP', 'TACHE'];
  const NOTE_PRIORITIES = ['P1', 'P2', 'P3'];
  const NOTE_STATUSES = ['OUVERT', 'EN_COURS', 'FAIT'];
  function cleanNotePatch(body: any): Record<string, unknown> {
    const patch: Record<string, unknown> = {};
    if (NOTE_TYPES.includes(body?.type)) patch.type = body.type;
    if (typeof body?.title === 'string') patch.title = body.title.trim().slice(0, 120);
    if (typeof body?.details === 'string') patch.details = body.details.trim().slice(0, 600);
    if (NOTE_PRIORITIES.includes(body?.priority)) patch.priority = body.priority;
    if (NOTE_STATUSES.includes(body?.status)) patch.status = body.status;
    if (typeof body?.source === 'string') patch.source = body.source.trim().slice(0, 120);
    return patch;
  }
  app.get('/api/katika/notes', async (_req, res) => {
    try {
      const snap = await notesRef().orderBy('createdAt', 'desc').limit(100).get();
      recordServerReads(snap.size);
      res.json({ success: true, notes: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Lecture du carnet impossible.' });
    }
  });
  app.post('/api/katika/notes', express.json(), async (req, res) => {
    const patch = cleanNotePatch(req.body);
    if (!patch.title) return res.status(400).json({ success: false, error: 'Titre requis.' });
    const now = Date.now();
    const id = `n_${now.toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const note = { type: 'TACHE', priority: 'P2', status: 'OUVERT', ...patch, createdAt: now, updatedAt: now, createdBy: (req as any).katikaUser.email };
    try {
      await notesRef().doc(id).set(note);
      res.json({ success: true, note: { id, ...note } });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Création impossible.' });
    }
  });
  app.patch('/api/katika/notes/:id', express.json(), async (req, res) => {
    try {
      await notesRef().doc(String(req.params.id)).update({ ...cleanNotePatch(req.body), updatedAt: Date.now() });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Modification impossible.' });
    }
  });
  app.delete('/api/katika/notes/:id', async (req, res) => {
    try {
      await notesRef().doc(String(req.params.id)).delete();
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Suppression impossible.' });
    }
  });

  // Réglages du copilote (liens, ton, hashtags) : document lisible par tous, écrit par le serveur seulement. Jamais de clé.
  app.post('/api/katika/copilot-settings', express.json(), async (req, res) => {
    const settings = req.body?.settings;
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
      return res.status(400).json({ success: false, error: 'Réglages invalides.' });
    }
    const { geminiApiKey, apiKey, ...clean } = settings as Record<string, unknown>;
    const json = JSON.stringify(clean);
    if (json.length > 20000) return res.status(400).json({ success: false, error: 'Réglages trop volumineux.' });
    try {
      await getFirebaseAdminAppDb().collection('katika_settings').doc('copilot_config').set(JSON.parse(json), { merge: true });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Enregistrement impossible.' });
    }
  });

  app.get('/api/katika/live-metrics', (req, res) => {
    const telemetry = RoomManager.getLiveTelemetry();
    res.json({
      status: 'ok',
      uptimeSeconds: Math.floor(process.uptime()),
      memoryUsageMb: Math.round(process.memoryUsage().rss / (1024 * 1024)),
      telemetry,
      timestamp: Date.now(),
    });
  });

  app.get('/api/katika/game-history', (req, res) => {
    res.json({
      status: 'ok',
      records: RoomManager.getMatchHistory(),
      timestamp: Date.now(),
    });
  });

  app.post('/api/katika/matches', express.json(), (req, res) => {
    const { record } = req.body || {};
    if (record && record.id) {
      RoomManager.recordFinishedMatch(record);
    }
    res.json({ success: true });
  });

  // Audit Logs API
  app.get('/api/katika/audit-logs', async (req, res) => {
    const history = await katikaAuditStore.getHistory();
    res.json({
      status: 'ok',
      logs: mergeAuditLogs(RoomManager.getAuditLogs(), history.logs),
      durable: { loaded: history.loaded, message: history.message },
      timestamp: Date.now(),
    });
  });

  // L'auteur est le compte connecté, jamais une valeur envoyée par le navigateur.
  app.post('/api/katika/audit-logs', express.json(), (req, res) => {
    const actor = String((req as any).katikaUser?.email || 'katika');
    const entry = buildClientAudit(req.body?.log, actor, Date.now());
    if (entry) {
      RoomManager.addAuditLog(entry);
    }
    res.json({ success: true });
  });

  // Player Sanctions & Overrides API
  app.get('/api/katika/player-overrides', (req, res) => {
    res.json({
      status: 'ok',
      sanctions: RoomManager.getPlayerSanctions(),
      chipOverrides: RoomManager.getPlayerChipOverrides(),
      timestamp: Date.now(),
    });
  });

  app.post('/api/katika/ban-player', express.json(), (req, res) => {
    const { playerId, reason, banType, expiresAt } = req.body || {};
    if (!playerId) {
      return res.status(400).json({ success: false, error: 'playerId manquant' });
    }
    RoomManager.banPlayer(playerId, reason || 'Sanction administrative', banType || 'PERMANENT', expiresAt, (req as any).katikaUser.email);
    res.json({ success: true, playerId });
  });

  app.post('/api/katika/player-chips', express.json(), (req, res) => {
    const { playerId, newBalance, reason } = req.body || {};
    if (!playerId || newBalance === undefined) {
      return res.status(400).json({ success: false, error: 'Champs requis manquants' });
    }
    RoomManager.updatePlayerChips(playerId, newBalance, reason || 'Ajustement Katika Master', (req as any).katikaUser.email);
    res.json({ success: true, playerId, newBalance });
  });

  // Master Admin Action: Kick player
  app.post('/api/katika/rooms/:roomCode/kick', express.json(), (req, res) => {
    const { roomCode } = req.params;
    const { playerId } = req.body || {};
    if (!playerId) {
      return res.status(400).json({ success: false, error: 'playerId manquant' });
    }
    const success = RoomManager.adminKickPlayer(roomCode, playerId);
    res.json({ success, roomCode, playerId });
  });

  // Master Admin Action: Close room
  app.post('/api/katika/rooms/:roomCode/close', (req, res) => {
    const { roomCode } = req.params;
    const success = RoomManager.adminCloseRoom(roomCode);
    res.json({ success, roomCode });
  });

  // Master Admin Action: Reset round
  app.post('/api/katika/rooms/:roomCode/reset-round', (req, res) => {
    const { roomCode } = req.params;
    const success = RoomManager.adminResetRound(roomCode);
    res.json({ success, roomCode });
  });

  // Master Admin Action: Send admin message to room or a specific player
  app.post('/api/katika/rooms/:roomCode/message', express.json(), (req, res) => {
    const { roomCode } = req.params;
    const { playerId, message } = req.body || {};
    if (!message) {
      return res.status(400).json({ success: false, error: 'Message manquant' });
    }
    const success = RoomManager.adminSendMessage(roomCode, playerId, message, (req as any).katikaUser.email);
    res.json({ success, roomCode, playerId });
  });

  // Katika Engine Hot Config
  app.get('/api/katika/engine-config', (req, res) => {
    res.json({ ...RoomManager.getEngineConfig(), configVersion: getEngineConfigVersion() });
  });

  app.post('/api/katika/engine-config', express.json(), async (req, res) => {
    const updated = RoomManager.updateEngineConfig(req.body || {});
    const persisted = await persistEngineConfigToStore();
    res.json({ ...updated, configVersion: getEngineConfigVersion(), persisted });
  });

  // Activité réelle du jeu pour le tableau de bord : lecture faite par le serveur et gardée en mémoire (durée réglable dans katika)
  app.get('/api/katika/activity-data', async (req, res) => {
    const bucket = toActivityBucket(req.query.range);
    if (!bucket) {
      return res.status(400).json({ success: false, error: 'Période inconnue.' });
    }
    const result = await katikaActivityData.get(bucket);
    res.set('Cache-Control', 'no-store');
    if (isActivityFailure(result)) {
      return res.status(503).json({ success: false, code: result.code, error: result.message });
    }
    return res.json({
      success: true,
      journal: result.data.journal,
      fiches: result.data.fiches,
      presenceDays: result.data.presenceDays,
      fetchedAt: result.fetchedAt,
      fromCache: result.fromCache,
      stale: result.stale,
      staleMessage: result.staleMessage,
    });
  });

  // Indicateurs de base du tableau de bord (dossier des joueurs, dernières fiches de manche) : lus par le serveur et gardés en mémoire
  app.get('/api/katika/dashboard-data', async (req, res) => {
    const part = toDashboardPart(req.query.part);
    if (!part) {
      return res.status(400).json({ success: false, error: 'Ensemble de données inconnu.' });
    }
    // Les fiches des joueurs ne partent que vers un admin qui a le droit de voir les joueurs.
    if (part === 'users' && !isAllowed((req as any).katikaUser, { anyOf: ['players.view'] })) {
      return res.status(403).json({ success: false, error: 'Tu n\'as pas le droit de voir les joueurs.' });
    }
    const result = await katikaDashboardData.get(part);
    res.set('Cache-Control', 'no-store');
    if (isDashboardFailure(result)) {
      return res.status(503).json({ success: false, code: result.code, error: result.message });
    }
    return res.json({
      success: true,
      docs: result.docs,
      maxDocs: part === 'records' ? DASHBOARD_MAX_RECORDS : null,
      fetchedAt: result.fetchedAt,
      fromCache: result.fromCache,
      stale: result.stale,
      staleMessage: result.staleMessage,
    });
  });

  // Totaux du dossier des joueurs pour le tableau de bord, calculés par le serveur : jamais la liste des joueurs.
  app.post('/api/katika/users-summary', express.json(), async (req, res) => {
    const result = await katikaDashboardData.get('users');
    res.set('Cache-Control', 'no-store');
    if (isDashboardFailure(result)) {
      return res.status(503).json({ success: false, code: result.code, error: result.message });
    }
    return res.json({
      success: true,
      summary: summarizeUsers(result.docs, sanitizeRankTitles(req.body?.rankTitles)),
      fetchedAt: result.fetchedAt,
      stale: result.stale,
      staleMessage: result.staleMessage,
    });
  });

  // Jauge des lectures Firestore faites par le serveur aujourd'hui
  app.get('/api/katika/read-budget', (_req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ success: true, budget: getReadBudget(readWarnThreshold(), readStopThreshold()) });
  });

  // Lectures Firestore déclarées par les téléphones aujourd'hui, par type de document
  app.get('/api/katika/client-reads', (_req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ success: true, clientReads: getClientReads() });
  });

  // Kora Cash — identifiants prestataire (jamais exposés en clair)
  app.get('/api/katika/cash/providers/:provider/:environment', async (req, res) => {
    const { provider, environment } = req.params;
    if (!['campay', 'notchpay'].includes(provider) || !['demo', 'live'].includes(environment)) {
      return res.status(400).json({ success: false, error: 'Paramètres invalides.' });
    }
    res.setHeader('Cache-Control', 'no-store');
    try {
      const masked = await getProviderCredentialsMasked(provider as any, environment as any);
      res.json({ success: true, credentials: masked, masterKeyConfigured: isCashSecretsKeyConfigured() });
    } catch (err) {
      console.error('[KoraCash] Lecture des identifiants impossible.', errorText(err));
      res.status(500).json({ success: false, error: `Lecture des identifiants impossible : ${errorText(err)}` });
    }
  });

  app.post('/api/katika/cash/providers/:provider/:environment', express.json(), async (req, res) => {
    const { provider, environment } = req.params;
    if (!['campay', 'notchpay'].includes(provider) || !['demo', 'live'].includes(environment)) {
      return res.status(400).json({ success: false, error: 'Paramètres invalides.' });
    }
    const fields = req.body?.fields;
    if (!fields || typeof fields !== 'object') {
      return res.status(400).json({ success: false, error: 'Champs manquants.' });
    }
    // Si le nom de la variable identifiant l'admin authentifié diffère de
    // req.katikaAdminUid ailleurs dans ce fichier, utilise la variable
    // réellement posée par le middleware d'auth Katika existant.
    const adminUid = (req as any).katikaUser?.uid || (req as any).katikaAdminUid || 'unknown';
    // Toute erreur revient à Katika : sans réponse, l'écran attendrait indéfiniment.
    try {
      await saveProviderCredentials(provider as any, environment as any, fields, adminUid);
      res.json({ success: true });
    } catch (err) {
      console.error('[KoraCash] Enregistrement des identifiants impossible.', errorText(err));
      res.status(500).json({ success: false, error: `Enregistrement impossible : ${errorText(err)}` });
    }
  });

  app.post('/api/katika/cash/providers/:provider/:environment/test', async (req, res) => {
    const { provider, environment } = req.params;
    if (provider !== 'campay') {
      return res.status(400).json({ success: false, error: 'Seul Campay est testable dans ce lot.' });
    }
    try {
      const result = await testCampayConnection(environment as any);
      res.json({ success: result.ok, message: result.message });
    } catch (err) {
      res.status(500).json({ success: false, message: `Test impossible : ${errorText(err)}` });
    }
  });

  // Texte d'erreur montré à l'admin Katika : jamais de secret dedans (cashSecrets ne met aucune valeur dans ses erreurs).
  function errorText(err: unknown): string {
    return (err instanceof Error ? err.message : String(err)).slice(0, 300);
  }

  // Kora Cash — correction des soldes fictifs de démo : aperçu (ne modifie rien), puis application confirmée par l'admin.
  app.get('/api/katika/cash/demo-cleanup', async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const lines = await previewDemoCleanup();
      res.json({ success: true, lines, totalDeduction: totalDeduction(lines) });
    } catch (err) {
      console.error('[KoraCash] Aperçu de la correction des soldes de démo impossible.', err instanceof Error ? err.message : String(err));
      res.status(500).json({ success: false, error: 'Aperçu de la correction impossible.' });
    }
  });

  app.post('/api/katika/cash/demo-cleanup', express.json(), async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (req.body?.confirm !== true) {
      return res.status(400).json({ success: false, error: 'Confirmation explicite requise.' });
    }
    try {
      const adminUid = (req as any).katikaUser?.uid || (req as any).katikaAdminUid || 'unknown';
      const result = await applyDemoCleanup(String(adminUid));
      res.json({ success: true, ...result });
    } catch (err) {
      console.error('[KoraCash] Correction des soldes de démo impossible.', err instanceof Error ? err.message : String(err));
      res.status(500).json({ success: false, error: 'Correction impossible.' });
    }
  });

  // Kora Cash — journal global des transactions (lecture seule). La période borne la requête ; type et joueur filtrent les lignes lues ;
  // le balayage s'arrête au plafond de lectures du registre. Ni e-mail ni téléphone ne sortent.
  async function readJournal(req: any, res: any, mode: 'page' | 'export') {
    res.setHeader('Cache-Control', 'no-store');
    if (katikaReadsBlocked()) {
      return res.status(503).json({ success: false, code: 'READ_LIMIT', error: READ_LIMIT_MESSAGE });
    }
    try {
      const cfg = await getKoraCashConfig();
      const parsed = parseJournalQuery(req.query || {}, Date.now(), cfg.environment === 'LIVE' ? 'LIVE' : 'DEMO');
      if (parsed.ok === false) return res.status(400).json({ success: false, error: parsed.error });
      const { query } = parsed;

      const names = await loadJournalNames();
      let uids: Set<string> | null = null;
      if (query.player) {
        uids = resolvePlayerFilter(query.player, names);
        if (uids.size === 0) {
          return res.json({ success: true, lines: [], nextCursor: null, scanned: 0, capped: false, from: query.from, to: query.to, environment: query.environment, playerNotFound: true });
        }
      }

      const limits = getJournalLimits();
      const result = await scanJournal(createLedgerBatchReader(query.environment, query.from, query.to), mode === 'export' ? null : query.cursor, {
        pageSize: mode === 'export' ? limits.exportMaxLines : limits.pageLines,
        maxReads: mode === 'export' ? limits.exportMaxReads : limits.maxReads,
        kinds: query.kinds,
        uids,
      });
      const lines = result.entries.map((entry) => toJournalLine(entry, names.get(entry.uid) ?? `Joueur #${entry.uid.replace(/[^A-Za-z0-9]/g, '').slice(-4).toUpperCase()}`));

      if (mode === 'export') {
        const admin = (req as any).katikaUser;
        // Plus de lignes existent au-delà de ce qui est écrit, ou le plafond de lectures a coupé le balayage.
        const truncated = result.nextCursor !== null;
        RoomManager.addAuditLog({
          id: 'cash_journal_export_' + Date.now().toString(36),
          timestamp: Date.now(),
          type: 'KATIKA_ACTION',
          severity: 'INFO',
          actor: String(admin?.email || admin?.uid || 'admin'),
          summary: `Export CSV du journal Kora Cash : ${lines.length} ligne(s)${truncated ? ' (incomplet)' : ''}`,
          details: { environment: query.environment, from: query.from, to: query.to, kinds: query.kinds, player: query.player, lines: lines.length, scanned: result.scanned, truncated },
        });
        const stamp = formatDoualaDateTime(Date.now()).slice(0, 16).replace(/[-: ]/g, '');
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="journal-kora-cash-${query.environment.toLowerCase()}-${stamp}.csv"`);
        res.setHeader('X-Journal-Lines', String(lines.length));
        res.setHeader('X-Journal-Truncated', truncated ? '1' : '0');
        return res.send(buildJournalCsv(lines));
      }

      return res.json({
        success: true,
        lines,
        nextCursor: result.nextCursor,
        scanned: result.scanned,
        capped: result.capped,
        from: query.from,
        to: query.to,
        environment: query.environment,
      });
    } catch (err) {
      console.error('[KoraCash] Lecture du journal impossible.', err instanceof Error ? err.message : String(err));
      if (isQuotaError(err)) return res.status(503).json({ success: false, code: 'QUOTA', error: QUOTA_MESSAGE });
      return res.status(500).json({ success: false, error: 'Lecture du journal impossible.' });
    }
  }

  app.get('/api/katika/cash/journal', (req, res) => readJournal(req, res, 'page'));
  // Export : réservé au droit « Kora Cash : agir » (voir adminRights) et inscrit au journal d'audit.
  app.get('/api/katika/cash/journal/export', (req, res) => readJournal(req, res, 'export'));

  // Kora Cash — derniers dépôts Mobile Money et dernière réponse de Campay pour chacun (statut, opérateur, motif). Lecture seule.
  app.get('/api/katika/cash/campay-deposits', async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const deposits = await listRecentCampayDeposits();
      res.json({ success: true, deposits });
    } catch (err) {
      console.error('[KoraCash] Lecture des dépôts Campay impossible.', err instanceof Error ? err.message : String(err));
      res.status(500).json({ success: false, error: 'Lecture des dépôts impossible.' });
    }
  });

  // Kora Cash — file de suivi des retraits et décisions de l'admin. Les numéros restent masqués.
  app.get('/api/katika/cash/withdrawals', async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const [withdrawals, settings] = await Promise.all([listRecentWithdrawals(), getWithdrawalSettings()]);
      res.json({
        success: true,
        settings,
        withdrawals: withdrawals.map((w) => ({
          id: w.id,
          uid: w.uid,
          amount: w.amount,
          fee: w.fee,
          net: w.net,
          phone: maskPhone(w.phone),
          status: w.status,
          autoApproved: w.autoApproved,
          createdAt: w.createdAt,
          updatedAt: w.updatedAt,
          note: w.note,
          reviewLabels: (w.reviewReasons || []).map((reason) => REVIEW_REASON_LABELS[reason as keyof typeof REVIEW_REASON_LABELS] || reason),
          campayStatus: w.campayStatus,
          campayOperator: w.campayOperator,
          campayReason: w.campayReason,
          decidedBy: w.decidedBy,
        })),
      });
    } catch (err) {
      console.error('[KoraCash] Lecture de la file des retraits impossible.', err instanceof Error ? err.message : String(err));
      res.status(500).json({ success: false, error: 'Lecture des retraits impossible.' });
    }
  });

  // Finances : recettes et marge par période, ce qui est dû aux joueurs, derniers rapprochements.
  app.get('/api/katika/cash/finance', async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const settings = await getFinanceSettings();
      const [periods, owed, reports, baseline] = await Promise.all([getFinancePeriods(settings), getOwedToPlayers(), listReconciliations(), getLatestBaseline()]);
      res.json({ success: true, settings, periods, owed, reports, hasBaseline: baseline !== null });
    } catch (err) {
      console.error('[KoraCash] Lecture des finances impossible.', err instanceof Error ? err.message : String(err));
      res.status(500).json({ success: false, error: 'Lecture des finances impossible.' });
    }
  });

  app.post('/api/katika/cash/finance-settings', express.json(), async (req, res) => {
    const parsed = parseFinanceSettingsPatch(req.body);
    if (!parsed.ok || !parsed.patch) {
      return res.status(400).json({ success: false, error: parsed.error || 'Corps de requête invalide.' });
    }
    try {
      const settings = await updateFinanceSettings(parsed.patch, (req as any).katikaUser?.email as string | undefined);
      cashPublicStatusCache = null;
      res.json({ success: true, settings });
    } catch (err) {
      console.error('[KoraCash] Enregistrement des réglages financiers impossible.', err instanceof Error ? err.message : String(err));
      res.status(500).json({ success: false, error: 'Enregistrement impossible.' });
    }
  });

  // Rapprochement à la demande. Un écart est seulement signalé : rien n'est gelé ni modifié ici.
  app.post('/api/katika/cash/reconciliation', express.json(), async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const isBaseline = req.body?.baseline === true;
    const note = typeof req.body?.note === 'string' ? req.body.note.trim().slice(0, 300) : '';
    if (isBaseline && !note) {
      return res.status(400).json({ success: false, error: 'Indique pourquoi tu enregistres ce point de départ.' });
    }
    try {
      let campayBalance: number;
      let source: 'API' | 'MANUAL';
      if (req.body?.manualBalance !== undefined && req.body?.manualBalance !== null) {
        const manual = parseManualBalance(req.body.manualBalance);
        if (manual === null) return res.status(400).json({ success: false, error: 'Solde saisi invalide.' });
        campayBalance = manual;
        source = 'MANUAL';
      } else {
        const read = await readCampayBalance();
        if (read.kind !== 'OK') return res.status(200).json({ success: false, needsManual: true, error: read.message });
        campayBalance = read.balance;
        source = 'API';
      }
      const [settings, owed, counters, baseline] = await Promise.all([getFinanceSettings(), getOwedToPlayers(), getFinanceTotals(), getLatestBaseline()]);
      const result = computeReconciliation({
        campayBalance,
        owed: owed.owed,
        counters,
        baseline: isBaseline || !baseline ? null : { realMargin: baseline.realMargin, counters: baseline.counters },
        settings,
      });
      const now = Date.now();
      const doc = {
        id: `rec_${now}_${randomBytes(4).toString('hex')}`,
        environment: 'DEMO' as const,
        source,
        ...result,
        ...(isBaseline ? { expectedMargin: result.realMargin, gap: 0, alert: false } : {}),
        available: owed.available,
        locked: owed.locked,
        inFlight: owed.inFlight,
        inFlightCount: owed.inFlightCount,
        counters,
        isBaseline,
        ...(note ? { note } : {}),
        actor: String((req as any).katikaUser?.email || 'katika'),
        createdAt: now,
      };
      await saveReconciliation(doc);
      res.json({ success: true, report: doc });
    } catch (err) {
      console.error('[KoraCash] Rapprochement impossible.', err instanceof Error ? err.message : String(err));
      res.status(500).json({ success: false, error: 'Rapprochement impossible.' });
    }
  });

  // Protection : réglages, joueurs gelés ou exclus, signalements de collusion ouverts.
  app.get('/api/katika/cash/protection', async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const [settings, players, alerts] = await Promise.all([getProtectionSettings(), listWatchedPlayers(), listOpenCollusionAlerts()]);
      const now = Date.now();
      res.json({
        success: true,
        settings,
        players: players.map((p) => {
          const end = exclusionEnd(p, now);
          return {
            uid: p.uid,
            freeze: p.freeze ?? null,
            exclusion: end !== null && p.exclusion ? { ...p.exclusion, end: Number.isFinite(end) ? end : null } : null,
          };
        }),
        alerts: alerts.map((a) => ({ ...a, label: COLLUSION_REASON_LABELS[a.reason] })),
      });
    } catch (err) {
      console.error('[KoraCash] Lecture de la protection impossible.', err instanceof Error ? err.message : String(err));
      res.status(500).json({ success: false, error: 'Lecture de la protection impossible.' });
    }
  });

  app.post('/api/katika/cash/protection-settings', express.json(), async (req, res) => {
    const parsed = parseProtectionSettingsPatch(req.body);
    if (!parsed.ok || !parsed.patch) {
      return res.status(400).json({ success: false, error: parsed.error || 'Corps de requête invalide.' });
    }
    try {
      const settings = await updateProtectionSettings(parsed.patch, (req as any).katikaUser?.email as string | undefined);
      res.json({ success: true, settings });
    } catch (err) {
      console.error('[KoraCash] Enregistrement de la protection impossible.', err instanceof Error ? err.message : String(err));
      res.status(500).json({ success: false, error: 'Enregistrement impossible.' });
    }
  });

  app.post('/api/katika/cash/protection-players/:uid/:action', express.json(), async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const actor = String((req as any).katikaUser?.email || 'katika');
    const uid = req.params.uid;
    try {
      if (!uid || uid.length > 128 || uid.includes('/')) {
        return res.status(400).json({ success: false, error: 'Identifiant joueur invalide.' });
      }
      switch (req.params.action) {
        case 'freeze':
          await setPlayerFreeze(uid, { frozen: true, actor, note: req.body?.note });
          break;
        case 'unfreeze':
          await setPlayerFreeze(uid, { frozen: false, actor, note: '' });
          break;
        case 'lift-exclusion':
          await liftPlayerExclusion(uid, { actor, note: req.body?.note });
          break;
        default:
          return res.status(404).json({ success: false, error: 'Action inconnue.' });
      }
      const player = await getPlayerProtection(uid);
      res.json({ success: true, liftAt: player.exclusion?.liftAt ?? null });
    } catch (err) {
      if (err instanceof ProtectionError) return res.status(400).json({ success: false, error: err.message });
      console.error('[KoraCash] Action de protection impossible.', err instanceof Error ? err.message : String(err));
      res.status(500).json({ success: false, error: 'Action impossible.' });
    }
  });

  app.post('/api/katika/cash/collusion-alerts/:id/close', express.json(), async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      await closeCollusionAlert(req.params.id, { actor: String((req as any).katikaUser?.email || 'katika'), note: req.body?.note });
      res.json({ success: true });
    } catch (err) {
      if (err instanceof ProtectionError) return res.status(400).json({ success: false, error: err.message });
      console.error('[KoraCash] Clôture du signalement impossible.', err instanceof Error ? err.message : String(err));
      res.status(500).json({ success: false, error: 'Clôture impossible.' });
    }
  });

  // Tables Cash : réglages, tables en cours, sièges dont la table a disparu, commission des dernières parties.
  app.get('/api/katika/cash/tables', async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const [settings, seats, parties] = await Promise.all([getCashTableSettings(), listOpenCashSeats(), listRecentCashParties()]);
      res.json({
        success: true,
        settings,
        tables: RoomManager.listCashTables(),
        strandedSeats: seats
          .filter((s) => !RoomManager.isCashTableLive(s.tableId))
          .map((s) => ({ tableId: s.tableId, uid: s.uid, roomCode: s.roomCode, betLevel: s.betLevel, buyInTotal: s.buyInTotal, openedAt: s.openedAt })),
        recentRake: { total: parties.reduce((sum, p) => sum + p.rake, 0), parties: parties.length },
      });
    } catch (err) {
      console.error('[KoraCash] Lecture du suivi des tables impossible.', err instanceof Error ? err.message : String(err));
      res.status(500).json({ success: false, error: 'Lecture des tables impossible.' });
    }
  });

  app.post('/api/katika/cash/table-settings', express.json(), async (req, res) => {
    try {
      const parsed = parseCashTableSettingsPatch(req.body, await getCashTableSettings());
      if (!parsed.ok || !parsed.patch) {
        return res.status(400).json({ success: false, error: parsed.error || 'Corps de requête invalide.' });
      }
      const settings = await updateCashTableSettings(parsed.patch, (req as any).katikaUser?.email as string | undefined);
      res.json({ success: true, settings });
    } catch (err) {
      console.error('[KoraCash] Enregistrement des réglages des tables impossible.', err instanceof Error ? err.message : String(err));
      res.status(500).json({ success: false, error: 'Enregistrement des réglages impossible.' });
    }
  });

  // Rend l'argent d'un siège dont la table n'existe plus. Le montant vient du registre, jamais de la requête.
  app.post('/api/katika/cash/table-seats/:tableId/:uid/refund', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const { tableId, uid } = req.params;
    if (RoomManager.isCashTableLive(tableId)) {
      return res.status(409).json({ success: false, error: 'Cette table est encore en cours : ferme-la d’abord, le capital sera rendu automatiquement.' });
    }
    try {
      const amount = await getLiveCashTableBook().adminRefund({ tableId, uid, actor: String((req as any).katikaUser?.email || 'katika') });
      res.json({ success: true, amount });
    } catch (err) {
      console.error('[KoraCash] Remboursement de siège impossible.', err instanceof Error ? err.message : String(err));
      res.status(500).json({ success: false, error: err instanceof CashLedgerError ? err.message : 'Remboursement impossible.' });
    }
  });

  app.post('/api/katika/cash/withdrawal-settings', express.json(), async (req, res) => {
    const parsed = parseWithdrawalSettingsPatch(req.body);
    if (!parsed.ok || !parsed.patch) {
      return res.status(400).json({ success: false, error: parsed.error || 'Corps de requête invalide.' });
    }
    try {
      const settings = await updateWithdrawalSettings(parsed.patch, (req as any).katikaUser?.email as string | undefined);
      res.json({ success: true, settings });
    } catch (err) {
      console.error('[KoraCash] Enregistrement des réglages de retrait impossible.', err instanceof Error ? err.message : String(err));
      res.status(500).json({ success: false, error: 'Enregistrement des réglages impossible.' });
    }
  });

  app.post('/api/katika/cash/withdrawals/:id/:action', express.json(), async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const actor = String((req as any).katikaUser?.email || 'katika');
    const deps = createLiveWithdrawalDeps();
    const id = req.params.id;
    try {
      switch (req.params.action) {
        case 'approve':
          return sendWithdrawalResult(res, await approveWithdrawal(deps, { id, actor }));
        case 'reject':
          return sendWithdrawalResult(res, await rejectWithdrawal(deps, { id, actor, note: req.body?.note }));
        case 'recheck':
          return sendWithdrawalResult(res, await recheckWithdrawal(deps, { id }));
        case 'resolve':
          return sendWithdrawalResult(res, await resolveWithdrawal(deps, { id, outcome: req.body?.outcome, actor }));
        default:
          return res.status(404).json({ success: false, error: 'Action inconnue.' });
      }
    } catch (err) {
      console.error('[KoraCash] Action sur un retrait impossible.', err instanceof Error ? err.message : String(err));
      res.status(500).json({ success: false, error: 'Action impossible.' });
    }
  });

  // Kora Cash — configuration générale (activation, prestataire actif, environnement), réservée à l'admin Katika.
  app.get('/api/katika/cash/config', async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const config = await readKoraCashConfigStrict();
      res.json({ success: true, config });
    } catch (err) {
      console.error('[KoraCash] Lecture de la configuration impossible.', err);
      res.status(500).json({ success: false, error: `Lecture de la configuration Kora Cash impossible : ${errorText(err)}` });
    }
  });

  app.post('/api/katika/cash/config', express.json(), async (req, res) => {
    const parsed = parseConfigPatch(req.body);
    if (!parsed.ok || !parsed.patch) {
      return res.status(400).json({ success: false, error: parsed.error || 'Corps de requête invalide.' });
    }
    try {
      const actorEmail = (req as any).katikaUser?.email as string | undefined;
      const config = await updateKoraCashConfig(parsed.patch, actorEmail);
      cashPublicStatusCache = null;
      res.json({ success: true, config });
    } catch (err) {
      console.error('[KoraCash] Enregistrement de la configuration impossible.', err);
      res.status(500).json({ success: false, error: 'Enregistrement de la configuration Kora Cash impossible.' });
    }
  });

  function buildServerMetricsSnapshot(): any {
    const telemetry = RoomManager.getLiveTelemetry();
    const matchHistory = RoomManager.getMatchHistory();
    const auditLogs = RoomManager.getAuditLogs();
    const config = RoomManager.getEngineConfig();

    let koraCount = 0;
    let doubleKoraCount = 0;
    let simpleVictoryCount = 0;
    let totalPotWon = 0;
    let highestPot = 0;
    let twoPCount = 0;
    let threePCount = 0;
    let fourPCount = 0;

    for (const m of matchHistory) {
      if (m.winType === 'DOUBLE_KORA') doubleKoraCount++;
      else if (m.winType === 'KORA') koraCount++;
      else simpleVictoryCount++;

      if (m.potWon) {
        totalPotWon += m.potWon;
        if (m.potWon > highestPot) highestPot = m.potWon;
      }

      if (m.playerCount === 2) twoPCount++;
      else if (m.playerCount === 3) threePCount++;
      else if (m.playerCount === 4) fourPCount++;
    }

    const totalMatches = matchHistory.length;
    const koraRate = totalMatches > 0 ? Math.round(((koraCount + doubleKoraCount) / totalMatches) * 100) : 0;
    const avgPot = totalMatches > 0 ? Math.round(totalPotWon / totalMatches) : 0;

    const sanctions = RoomManager.getPlayerSanctions();
    const chipOverrides = RoomManager.getPlayerChipOverrides();

    // Reconstruct tracked players from sanctions, chip overrides, and match history
    const playerMap: Record<string, any> = {};
    matchHistory.forEach((m) => {
      const pId = m.winnerId || m.winnerName || 'Joueur';
      if (!playerMap[pId]) {
        playerMap[pId] = {
          id: pId,
          name: m.winnerName || pId,
          isHuman: true,
          chips: 5000,
          totalGames: 0,
          victories: 0,
          koraCount: 0,
          doubleKoraCount: 0,
          status: 'ACTIVE',
          warningsCount: 0,
          abandonRate: 0,
        };
      }
      playerMap[pId].totalGames++;
      playerMap[pId].victories++;
      if (m.winType === 'KORA') playerMap[pId].koraCount++;
      if (m.winType === 'DOUBLE_KORA') {
        playerMap[pId].koraCount++;
        playerMap[pId].doubleKoraCount++;
      }
    });

    Object.keys(sanctions).forEach((pId) => {
      if (!playerMap[pId]) {
        playerMap[pId] = {
          id: pId,
          name: pId,
          isHuman: true,
          chips: 5000,
          totalGames: 0,
          victories: 0,
          koraCount: 0,
          doubleKoraCount: 0,
          status: 'ACTIVE',
          warningsCount: 0,
          abandonRate: 0,
        };
      }
      Object.assign(playerMap[pId], sanctions[pId]);
    });

    Object.keys(chipOverrides).forEach((pId) => {
      if (playerMap[pId]) {
        playerMap[pId].chips = chipOverrides[pId];
      }
    });

    const playersList = Object.values(playerMap);

    const matchesHistoryEntries = matchHistory.slice(0, 50).map((m: any) => ({
      id: m.id || `m_${m.createdAt || Date.now()}`,
      date: new Date(m.createdAt || Date.now()).toLocaleString('fr-FR'),
      timestamp: m.createdAt || Date.now(),
      mode: m.mode || 'MULTIPLAYER',
      playerCount: m.playerCount || 4,
      winnerName: m.winnerName || 'Joueur',
      winnerId: m.winnerId,
      winType: m.winType || 'STANDARD',
      roundsCount: m.roundsCount || 1,
      partiesCount: m.roundsCount || 1,
      potWon: m.potWon || 0,
      durationSeconds: m.durationSeconds,
      status: 'completed',
      isAbandoned: false,
    }));

    return {
      timestamp: Date.now(),
      // Repli du serveur : il ne connaît que ce qui s'est passé depuis son dernier démarrage.
      dataQuality: {
        level: 'PARTIAL',
        notices: ['Chiffres d\'historique limités à la période depuis le dernier démarrage du serveur : ce n\'est pas un cumul.'],
      },
      summary: {
        connectedPlayers: telemetry.connectedSockets,
        activeRooms: telemetry.activeRooms,
        liveBetProposalsActive: telemetry.liveBetProposalsActive || 0,
        liveCapacityVotesActive: telemetry.liveCapacityVotesActive || 0,
        liveKoraHunterAlertsActive: telemetry.liveKoraHunterAlertsActive || 0,
        totalParties: totalMatches,
        totalManches: totalMatches,
        completionRatePct: 100,
        healthStatus: 'OPÉRATIONNEL',
      },
      kpis: {
        allTime: {
          totalGamesPlayed: totalMatches,
          totalPartiesDisputed: totalMatches,
          totalManchesPlayed: totalMatches,
          koraCount,
          doubleKoraCount,
          simpleVictoryCount,
          twoPlayersCount: twoPCount,
          threePlayersCount: threePCount,
          fourPlayersCount: fourPCount,
          totalChipsWon: totalPotWon,
          avgPotPerGame: avgPot,
          highestPotWon: highestPot,
          soloGamesCount: 0,
          multiplayerGamesCount: totalMatches,
          playerBehavior: {
            audacityBarometer: {
              koraRate,
              doubleKoraRate: totalMatches > 0 ? Math.round((doubleKoraCount / totalMatches) * 100) : 0,
            },
          },
        },
      },
      liveRooms: {
        count: telemetry.activeRooms,
        rooms: (telemetry.roomsList || []).map((r) => ({
          roomName: `Table ${r.id} (${r.hostName || 'Hôte'})`,
          code: r.id,
          status: r.status,
          currentPlayersCount: r.playerCount,
          maxPlayers: r.maxPlayers,
          turnRemainingSeconds: r.turnRemainingSeconds,
          pot: r.pot,
          currentRound: r.currentRound,
          currentTrickNumber: r.currentTrickNumber,
          activePlayerName: r.activePlayerName,
          leadSuit: r.leadSuit,
          isPublic: r.isPublic,
          betIncreaseProposal: r.betIncreaseProposal,
          capacityExtensionProposal: r.capacityExtensionProposal,
          integrationProposal: r.integrationProposal,
          showKoraHunterAlert: r.showKoraHunterAlert,
          hunterPlayerName: r.hunterPlayerName,
          players: r.players,
        })),
      },
      playersOverview: {
        totalTracked: playersList.length,
        activeCount: playersList.filter((p) => p.status === 'ACTIVE').length,
        warnedCount: playersList.filter((p) => p.status === 'WARNED').length,
        bannedCount: playersList.filter((p) => p.status === 'BANNED').length,
        flaggedAntiFraudCount: 0,
        playersList,
        topPlayers: playersList.slice(0, 10),
      },
      auditLogsRecent: {
        count: auditLogs.length,
        criticalOrWarningCount: auditLogs.filter((l) => l.severity === 'CRITICAL' || l.severity === 'WARNING').length,
        recentEntries: auditLogs.slice(0, 50).map((l) => ({
          id: l.id,
          timestamp: l.timestamp,
          date: new Date(l.timestamp).toLocaleString('fr-FR'),
          type: l.type,
          severity: l.severity,
          summary: l.summary,
          actor: l.actor,
          details: l.details,
        })),
      },
      matchesHistory: {
        count: matchesHistoryEntries.length,
        entries: matchesHistoryEntries,
      },
      activeEngineConfig: config,
      detectedAnomalies: [],
    };
  }

  // Limites du copilote : plafond commun, plafond par admin, une demande à la fois par admin (server/katika/aiLimiter.ts).
  // Plafond commun : réglage katika « copilotMaxRequestsPerHour » ; KATIKA_AI_MAX_PER_HOUR ne sert que tant que katika n'a rien enregistré.
  function getMaxAiPerHour(): number {
    const fromKatika = Number(RoomManager.getEngineConfig().copilotMaxRequestsPerHour);
    if (Number.isFinite(fromKatika) && fromKatika > 0) {
      return Math.floor(fromKatika);
    }
    const raw = process.env.KATIKA_AI_MAX_PER_HOUR;
    if (raw) {
      const parsed = parseInt(raw, 10);
      if (!isNaN(parsed) && parsed > 0) {
        return parsed;
      }
    }
    return 20;
  }

  function engineNumber(key: string): number {
    const value = Number((RoomManager.getEngineConfig() as unknown as Record<string, unknown>)[key]);
    return Number.isFinite(value) && value > 0 ? value : Number(PARAM_BY_KEY[key].default);
  }

  const aiLimiter = createAiLimiter({
    now: () => Date.now(),
    maxPerHour: getMaxAiPerHour,
    maxPerAdminPerHour: () => engineNumber('copilotMaxRequestsPerAdminPerHour'),
    maxConcurrent: () => engineNumber('copilotMaxConcurrent'),
  });

  const aiUser = (req: any): { uid: string; isOwner: boolean } => ({ uid: req.katikaUser.uid, isOwner: req.katikaUser.isOwner === true });

  function checkAiRateLimit(req: any) {
    const { uid, isOwner } = aiUser(req);
    return aiLimiter.check(uid, isOwner);
  }

  app.get('/api/katika/ai-quota', (req, res) => {
    const { uid, isOwner } = aiUser(req);
    res.json({ success: true, ...aiLimiter.status(uid, isOwner) });
  });

  function acquireAiSlot(req: any): void {
    aiLimiter.acquire(aiUser(req).uid);
  }

  function releaseAiSlot(req: any): void {
    aiLimiter.release(aiUser(req).uid);
  }

  // Discussions du copilote : chaque admin ne lit et n'écrit que les siennes (server/katika/copilotThreads.ts).
  app.get('/api/katika/copilot/threads', async (req, res) => {
    try {
      const threads = await listThreads((req as any).katikaUser.uid, engineNumber('katikaCopilotMaxThreads'));
      res.json({ success: true, threads });
    } catch (err: any) {
      console.error('[Copilote] Lecture des discussions impossible :', err?.message || err);
      res.status(500).json({ success: false, error: 'Discussions indisponibles pour le moment.' });
    }
  });

  app.put('/api/katika/copilot/threads/:id', express.json({ limit: '2mb' }), async (req, res) => {
    const uid = (req as any).katikaUser.uid;
    const thread = sanitizeThread({ ...(req.body?.thread || {}), id: req.params.id }, engineNumber('katikaCopilotMaxMessages'));
    if (!thread) return res.status(400).json({ success: false, error: 'Discussion invalide.' });
    try {
      await saveThread(uid, thread);
      const all = await listThreads(uid, Number.MAX_SAFE_INTEGER);
      const pruned = threadsToPrune(all, engineNumber('katikaCopilotMaxThreads'));
      await Promise.all(pruned.map((id) => deleteThread(uid, id)));
      res.json({ success: true, pruned });
    } catch (err: any) {
      console.error('[Copilote] Enregistrement de la discussion impossible :', err?.message || err);
      res.status(500).json({ success: false, error: 'Discussion non enregistrée.' });
    }
  });

  app.delete('/api/katika/copilot/threads/:id', async (req, res) => {
    try {
      await deleteThread((req as any).katikaUser.uid, String(req.params.id));
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ success: false, error: 'Suppression impossible.' });
    }
  });

  // AI Assistant Chat Route (Read-only advisor, text + multimodal screenshot support)
  app.post('/api/katika/ai-chat', async (req, res) => {
    const rateCheck = checkAiRateLimit(req);
    if (rateCheck.allowed === false) {
      res.setHeader('Retry-After', String(rateCheck.retryAfterMinutes * 60));
      return res.status(429).json({ success: false, error: rateCheck.message });
    }

    try {
      const { message, image, history, recentTopics, config, metricsSnapshot } = req.body || {};
      if (!message && !image) {
        return res.status(400).json({ success: false, error: 'Message ou image requis.' });
      }
      const effectiveSnapshot = metricsSnapshot && metricsSnapshot.summary
        ? metricsSnapshot
        : buildServerMetricsSnapshot();

      acquireAiSlot(req);
      try {
        const reply = await handleAdminChatMessage({ message, image, history, recentTopics, config, metricsSnapshot: effectiveSnapshot });
        res.json({ success: true, reply });
      } finally {
        releaseAiSlot(req);
      }
    } catch (err: unknown) {
      console.error('[Katika AI Chat API] Handler error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Erreur interne du service IA.';
      res.status(500).json({ success: false, error: errorMessage });
    }
  });

  // AI Assistant Chat Route (Streaming via Server-Sent Events)
  app.post('/api/katika/ai-chat-stream', async (req, res) => {
    const rateCheck = checkAiRateLimit(req);
    if (rateCheck.allowed === false) {
      res.setHeader('Retry-After', String(rateCheck.retryAfterMinutes * 60));
      res.status(429);
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.write(`data: ${JSON.stringify({ error: rateCheck.message })}\n\n`);
      return res.end();
    }

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    if (res.flushHeaders) res.flushHeaders();

    try {
      const { message, image, history, recentTopics, config, metricsSnapshot } = req.body || {};
      if (!message && !image) {
        res.write(`data: ${JSON.stringify({ error: 'Message ou image requis.' })}\n\n`);
        return res.end();
      }

      const effectiveSnapshot = metricsSnapshot && metricsSnapshot.summary
        ? metricsSnapshot
        : buildServerMetricsSnapshot();

      acquireAiSlot(req);
      try {
        await streamAdminChatMessage(
          { message, image, history, recentTopics, config, metricsSnapshot: effectiveSnapshot },
          (chunkText) => {
            res.write(`data: ${JSON.stringify({ text: chunkText })}\n\n`);
          }
        );
      } finally {
        releaseAiSlot(req);
      }

      res.write('data: [DONE]\n\n');
      res.end();
    } catch (err: unknown) {
      console.error('[Katika AI Chat Stream] Handler error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Erreur interne du service IA.';
      res.write(`data: ${JSON.stringify({ error: errorMessage })}\n\n`);
      res.end();
    }
  });

  // Dedicated AI Social Visual V2 Generation Route
  app.post('/api/katika/ai-visual', async (req, res) => {
    const rateCheck = checkAiRateLimit(req);
    if (rateCheck.allowed === false) {
      res.setHeader('Retry-After', String(rateCheck.retryAfterMinutes * 60));
      return res.status(429).json({ success: false, error: rateCheck.message });
    }

    try {
      const { brief, presetId, format, palette, model, metricsSnapshot, moment } = req.body || {};
      if (!brief && !presetId) {
        return res.status(400).json({ success: false, error: 'Un brief texte ou un identifiant de recette est requis.' });
      }

      acquireAiSlot(req);
      try {
        const result = await generateVisualVariants({
          brief: brief || '',
          config: { presetId, format, palette, model },
          metricsSnapshot,
          moment: isKoraMoment(moment) ? moment : undefined,
        });

        // Compteur horaire : un appel Gemini = une requête comptée (acquireAiSlot a déjà compté la première).
        aiLimiter.count(aiUser(req).uid, Math.max(0, result.callsMade - 1));

        if (result.variants.length === 0) {
          const status = result.quotaExceeded ? 429 : 502;
          return res.status(status).json({
            success: false,
            quotaExceeded: result.quotaExceeded,
            error: result.quotaExceeded
              ? 'Quota Gemini atteint pour le moment. Réessaie plus tard.'
              : 'Aucun visuel valide n\'a pu être généré. Reformule ta demande ou réessaie dans un instant.',
          });
        }

        // Compatibilité : la première variante reste exposée à la racine (spec, warnings, needsReview).
        const first = result.variants[0];
        res.json({
          success: true,
          variants: result.variants,
          callsMade: result.callsMade,
          spec: first.spec,
          warnings: first.warnings,
          needsReview: first.needsReview,
        });
      } finally {
        releaseAiSlot(req);
      }
    } catch (err: unknown) {
      console.error('[Katika AI Visual API] Handler error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Erreur interne de génération du visuel IA.';
      res.status(500).json({ success: false, error: errorMessage });
    }
  });

  // Moments Kora enregistrés (fiches anonymes de plis) : réservé à l'admin Katika (garde /api/katika ci-dessus)
  // Anciennes fiches de manche écrites par les téléphones : rapport, migration, suppression vérifiée.
  // Route protégée par le contrôle administrateur de /api/katika. Lecture seule par défaut (dryRun).
  app.post('/api/katika/legacy-records', express.json(), async (req, res) => {
    try {
      const body = (req.body || {}) as { action?: string; dryRun?: boolean; confirm?: string };
      const action = body.action === 'migrate' || body.action === 'purge' ? body.action : 'report';
      const dryRun = body.dryRun !== false;
      const result = await runLegacyAction(createFirestoreLegacyStore(), { action, dryRun, confirm: body.confirm });
      if (action !== 'report' && !dryRun && result.success) {
        const user = (req as any).katikaUser;
        RoomManager.addAuditLog({
          id: 'legacy_' + action + '_' + Date.now().toString(36),
          timestamp: Date.now(),
          type: 'KATIKA_ACTION',
          severity: 'WARNING',
          actor: user?.email || 'Admin Katika',
          summary: action === 'migrate'
            ? `Migration des anciennes fiches de manche : ${result.migration.created} fiche(s) créée(s)`
            : `Suppression vérifiée des anciennes fiches de manche : ${result.purge.deleted} supprimée(s)`,
          details: { action, migration: result.migration, purge: result.purge },
        });
      }
      res.status(result.success ? 200 : 400).json(result);
    } catch (err: unknown) {
      console.error('[Katika Legacy Records] Erreur :', err instanceof Error ? err.message : err);
      res.status(500).json({ success: false, error: 'Erreur interne pendant le traitement des anciennes fiches.' });
    }
  });

  app.get('/api/katika/moments', async (_req, res) => {
    try {
      const moments = await listKoraMoments();
      res.json({ success: true, moments });
    } catch (err: unknown) {
      console.error('[Katika Moments] Erreur de lecture:', err);
      res.status(500).json({ success: false, error: 'Lecture des moments Kora impossible pour le moment.' });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');

    // Immutable caching for hashed assets (JS/CSS bundles in dist/assets)
    app.use('/assets', express.static(path.join(distPath, 'assets'), {
      maxAge: '1y',
      immutable: true,
    }));

    // Cache control for root assets (disable cache for version.json, sw.js, html)
    app.use(express.static(distPath, {
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('version.json') || filePath.endsWith('sw.js') || filePath.endsWith('.html')) {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        } else {
          res.setHeader('Cache-Control', 'public, max-age=86400');
        }
      },
    }));

    app.get('*', (req, res) => {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[Server] Njambo Kora Server-Authoritative running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
