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
import { handleAdminChatMessage, streamAdminChatMessage } from './server/aiAdminChat';
import { generateVisualSpec } from './server/aiVisual';
import { pushService, buildGameUrl } from './server/pushService';
import { verifyFirebaseIdToken, listAdminUsers, setAdminUserClaim, getFirebaseAdminDb } from './server/firebaseAdmin';
import { collection, getDocs, query, limit, orderBy, startAfter } from 'firebase/firestore';
import { db } from './src/lib/firebase';
import {
  computeMasteryScoreFromStats,
  computeEventMasteryScore,
  getDoualaDateKey,
  MASTERY_CONFIG,
  isEligibleLeaderboardUser,
  LEADERBOARD_POLICY,
} from './src/services/masteryConfig';

const PORT = 3000;
const instanceId = 'inst_' + Math.random().toString(36).substring(2, 10) + '_' + Date.now().toString(36);
const bootedAt = new Date().toISOString();

async function startServer() {
  const app = express();
  app.use(compression());
  app.use(express.json({ limit: '15mb' }));

  const server = http.createServer(app);

  // Initialize Room Cleanup Interval (2h public / 24h private / 15m bots)
  RoomManager.initRoomCleanupInterval();

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

  // Native Transport-Level Keep-Alive Heartbeat (RFC 6455 ws.ping/pong)
  // Keeps sockets active across Cloud Run ingress and 4G/5G mobile operators without killing sleeping clients
  const wsHeartbeatInterval = setInterval(() => {
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
  }, 20000);

  wss.on('close', () => {
    clearInterval(wsHeartbeatInterval);
  });

  wss.on('connection', (ws: any, req) => {
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

    ws.on('close', () => {
      console.log(`[WS] Client disconnected: ${client.playerId}`);
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
    if (now - (lastPushTestAt.get(resolvedId) || 0) < 15_000) {
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

  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      instanceId,
      bootedAt,
      activeRooms: RoomManager.getActiveRoomsCount(),
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
  const LEADERBOARD_CACHE_TTL = 60 * 1000;

  function calculateMasteryScore(stats: any): number {
    return computeMasteryScoreFromStats(stats);
  }

  app.get('/api/leaderboard/cached', async (req, res) => {
    try {
      const force = req.query.force === 'true';
      const timeframe = (req.query.timeframe as string) || 'ALL'; // 'ALL' | 'WEEK' | 'MONTH'

      if (force || Date.now() - leaderboardCacheTimestamp > LEADERBOARD_CACHE_TTL || cachedLeaderboardUsers.length === 0) {
        if (db) {
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
            const MAX_FUTURE_DRIFT_MS = 60 * 1000; // 1 minute max tolérance d'horloge
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
            const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;
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

            cachedLeaderboardUsers = Array.from(usersMap.values()).sort(
              (a, b) => (b.stats?.masteryScore || 0) - (a.stats?.masteryScore || 0)
            );
            leaderboardCacheTimestamp = Date.now();
            console.log(`[Server] Leaderboard cache refreshed with ${cachedLeaderboardUsers.length} players.`);
          } catch (dbErr: any) {
            console.warn('[Leaderboard Server] Firestore query soft warning (e.g. quota limit reached):', dbErr?.message || dbErr);
          }
        }
      }

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

      res.json({ success: true, users: resultUsers, timestamp: leaderboardCacheTimestamp, timeframe });
    } catch (err: any) {
      console.warn('[Leaderboard Cache API] Error:', err.message);
      res.json({ success: true, users: cachedLeaderboardUsers, timestamp: leaderboardCacheTimestamp || Date.now() });
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
    const isAuthorizedAdmin =
      verified.emailVerified === true &&
      (email === KATIKA_ADMIN_EMAIL || verified.admin === true);

    if (!isAuthorizedAdmin) {
      console.warn(
        `[Katika Admin Auth] Refus d'accès 401: Compte non administrateur (uid: ${verified.uid}, email: ${email || 'aucun'}, emailVerified: ${verified.emailVerified}, adminClaim: ${verified.admin})`,
        { path: req.path }
      );
      return res.status(401).json({
        success: false,
        error: 'Accès refusé. Seul le compte administrateur autorisé avec un email vérifié peut accéder à Katika Master.',
      });
    }

    (req as any).katikaUser = {
      uid: verified.uid,
      email,
      isOwner: email === KATIKA_ADMIN_EMAIL,
      isSecondaryAdmin: verified.admin === true,
    };

    return next();
  });

  // Admin Management Endpoints (Reserved exclusively for KATIKA_ADMIN_EMAIL owner)
  app.get('/api/katika/admins', async (req, res) => {
    const user = (req as any).katikaUser;
    if (!user || !user.isOwner) {
      console.warn(`[Katika Admin Auth] Refus 403 GET /api/katika/admins pour l'utilisateur non-propriétaire: ${user?.email || 'anonyme'}`);
      return res.status(403).json({
        success: false,
        error: 'Droits insuffisants : la gestion des administrateurs est strictement réservée au propriétaire (KATIKA_ADMIN_EMAIL).'
      });
    }

    try {
      const authAdmins = await listAdminUsers();

      const firestoreAdminsMap = new Map<string, any>();
      try {
        const db = getFirebaseAdminDb();
        const snapshot = await db.collection('katika_admins').get();
        snapshot.forEach(doc => {
          firestoreAdminsMap.set(doc.id, doc.data());
        });
      } catch (fsErr) {
        console.warn('[Katika Admins] Impossible d\'interroger Firestore tika_admins:', fsErr);
      }

      const adminsList = authAdmins.map(admin => {
        const fsData = firestoreAdminsMap.get(admin.uid) || {};
        return {
          uid: admin.uid,
          email: admin.email || fsData.email || '',
          grantedAt: fsData.grantedAt || admin.creationTime || new Date().toISOString(),
          grantedBy: fsData.grantedBy || KATIKA_ADMIN_EMAIL,
          status: fsData.status || 'ACTIVE',
        };
      });

      return res.json({
        success: true,
        admins: adminsList,
        timestamp: Date.now()
      });
    } catch (err: any) {
      console.error('[Katika Admins] Erreur lors de la récupération des administrateurs:', err);
      return res.status(500).json({ success: false, error: err?.message || 'Erreur serveur interne.' });
    }
  });

  app.post('/api/katika/admins', express.json(), async (req, res) => {
    const user = (req as any).katikaUser;
    if (!user || !user.isOwner) {
      console.warn(`[Katika Admin Auth] Refus 403 POST /api/katika/admins pour l'utilisateur non-propriétaire: ${user?.email || 'anonyme'}`);
      return res.status(403).json({
        success: false,
        error: 'Droits insuffisants : la gestion des administrateurs est strictly réservée au propriétaire (KATIKA_ADMIN_EMAIL).'
      });
    }

    const { email, reason } = req.body || {};
    const targetEmail = (email || '').trim().toLowerCase();

    if (!targetEmail) {
      return res.status(400).json({ success: false, error: 'L\'adresse e-mail de l\'utilisateur à nommer administrateur est requise.' });
    }

    if (targetEmail === KATIKA_ADMIN_EMAIL) {
      return res.status(400).json({ success: false, error: 'Le propriétaire est déjà administrateur principal.' });
    }

    try {
      const grantedUser = await setAdminUserClaim({ email: targetEmail }, true);

      const grantedAt = new Date().toISOString();
      const adminRecord = {
        uid: grantedUser.uid,
        email: grantedUser.email || targetEmail,
        grantedAt,
        grantedBy: KATIKA_ADMIN_EMAIL,
        status: 'ACTIVE',
        updatedAt: grantedAt,
        reason: reason || 'Privilège administrateur accordé depuis Katika Master'
      };

      try {
        const db = getFirebaseAdminDb();
        await db.collection('katika_admins').doc(grantedUser.uid).set(adminRecord, { merge: true });
      } catch (fsErr) {
        console.warn('[Katika Admins] Warning setting firestore doc tika_admins:', fsErr);
      }

      RoomManager.addAuditLog({
        id: 'adm_grant_' + Date.now().toString(36),
        timestamp: Date.now(),
        type: 'KATIKA_ACTION',
        severity: 'INFO',
        actor: 'Propriétaire Katika (' + KATIKA_ADMIN_EMAIL + ')',
        summary: `Privilège administrateur accordé à ${grantedUser.email || targetEmail}`,
        details: { uid: grantedUser.uid, email: grantedUser.email || targetEmail, grantedBy: KATIKA_ADMIN_EMAIL }
      });

      return res.json({
        success: true,
        admin: adminRecord
      });
    } catch (err: any) {
      console.error('[Katika Admins] Erreur lors de l\'octroi du rôle admin:', err);
      if (err.code === 'auth/user-not-found') {
        return res.status(404).json({
          success: false,
          error: `Aucun compte Firebase Auth n'a été trouvé pour l'adresse e-mail « ${targetEmail} ». L'utilisateur doit d'abord créer son compte.`
        });
      }
      return res.status(500).json({ success: false, error: err?.message || 'Erreur lors de la modification des privilèges.' });
    }
  });

  app.delete('/api/katika/admins/:uid', async (req, res) => {
    const user = (req as any).katikaUser;
    if (!user || !user.isOwner) {
      console.warn(`[Katika Admin Auth] Refus 403 DELETE /api/katika/admins pour l'utilisateur non-propriétaire: ${user?.email || 'anonyme'}`);
      return res.status(403).json({
        success: false,
        error: 'Droits insuffisants : la gestion des administrateurs est strictement réservée au propriétaire (KATIKA_ADMIN_EMAIL).'
      });
    }

    const { uid } = req.params;
    if (!uid) {
      return res.status(400).json({ success: false, error: 'UID de l\'administrateur à révoquer manquant.' });
    }

    try {
      const revokedUser = await setAdminUserClaim({ uid }, false);

      const revokedAt = new Date().toISOString();

      try {
        const db = getFirebaseAdminDb();
        await db.collection('katika_admins').doc(uid).set({
          status: 'REVOKED',
          revokedAt,
          revokedBy: KATIKA_ADMIN_EMAIL,
          updatedAt: revokedAt
        }, { merge: true });
      } catch (fsErr) {
        console.warn('[Katika Admins] Warning updating firestore doc tika_admins on revoke:', fsErr);
      }

      RoomManager.addAuditLog({
        id: 'adm_revoke_' + Date.now().toString(36),
        timestamp: Date.now(),
        type: 'KATIKA_ACTION',
        severity: 'WARNING',
        actor: 'Propriétaire Katika (' + KATIKA_ADMIN_EMAIL + ')',
        summary: `Privilège administrateur révoqué pour ${revokedUser.email || uid}`,
        details: { uid, email: revokedUser.email, revokedBy: KATIKA_ADMIN_EMAIL }
      });

      return res.json({
        success: true,
        uid,
        email: revokedUser.email
      });
    } catch (err: any) {
      console.error('[Katika Admins] Erreur lors de la révocation du rôle admin:', err);
      return res.status(500).json({ success: false, error: err?.message || 'Erreur lors de la révocation du rôle administrateur.' });
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
  app.get('/api/katika/audit-logs', (req, res) => {
    res.json({
      status: 'ok',
      logs: RoomManager.getAuditLogs(),
      timestamp: Date.now(),
    });
  });

  app.post('/api/katika/audit-logs', express.json(), (req, res) => {
    const { log } = req.body || {};
    if (log && log.summary) {
      RoomManager.addAuditLog(log);
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
    RoomManager.banPlayer(playerId, reason || 'Sanction administrative', banType || 'PERMANENT', expiresAt);
    res.json({ success: true, playerId });
  });

  app.post('/api/katika/player-chips', express.json(), (req, res) => {
    const { playerId, newBalance, reason } = req.body || {};
    if (!playerId || newBalance === undefined) {
      return res.status(400).json({ success: false, error: 'Champs requis manquants' });
    }
    RoomManager.updatePlayerChips(playerId, newBalance, reason || 'Ajustement Katika Master');
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
    const success = RoomManager.adminSendMessage(roomCode, playerId, message);
    res.json({ success, roomCode, playerId });
  });

  // Katika Engine Hot Config
  app.get('/api/katika/engine-config', (req, res) => {
    res.json(RoomManager.getEngineConfig());
  });

  app.post('/api/katika/engine-config', express.json(), (req, res) => {
    const updated = RoomManager.updateEngineConfig(req.body || {});
    res.json(updated);
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

  // In-memory rate limiter for Copilote Katika AI queries (protection against quota bursts)
  const aiRequestTimestamps: number[] = [];
  let isAiRequestRunning = false;

  function getMaxAiPerHour(): number {
    const raw = process.env.KATIKA_AI_MAX_PER_HOUR;
    if (raw) {
      const parsed = parseInt(raw, 10);
      if (!isNaN(parsed) && parsed > 0) {
        return parsed;
      }
    }
    return 20; // 20 requêtes par heure glissante par défaut
  }

  type AiRateLimitResult =
    | { allowed: true }
    | { allowed: false; status: 429; message: string; retryAfterMinutes: number };

  function checkAiRateLimit(): AiRateLimitResult {
    const now = Date.now();
    const windowMs = 60 * 60 * 1000; // 1 heure glissante
    const maxPerHour = getMaxAiPerHour();

    // Purge des requêtes antérieures à 1 heure
    while (aiRequestTimestamps.length > 0 && aiRequestTimestamps[0] <= now - windowMs) {
      aiRequestTimestamps.shift();
    }

    // 1. Limite de concurrence : 1 seule requête IA active simultanément
    if (isAiRequestRunning) {
      return {
        allowed: false,
        status: 429,
        message: 'Limite du copilote atteinte, réessaie dans 1 min.',
        retryAfterMinutes: 1,
      };
    }

    // 2. Limite de volume horaire
    if (aiRequestTimestamps.length >= maxPerHour) {
      const oldestTimestamp = aiRequestTimestamps[0];
      const waitMs = oldestTimestamp + windowMs - now;
      const waitMin = Math.max(1, Math.ceil(waitMs / 60000));
      return {
        allowed: false,
        status: 429,
        message: `Limite du copilote atteinte, réessaie dans ${waitMin} min.`,
        retryAfterMinutes: waitMin,
      };
    }

    return { allowed: true };
  }

  function acquireAiSlot(): void {
    isAiRequestRunning = true;
    aiRequestTimestamps.push(Date.now());
  }

  function releaseAiSlot(): void {
    isAiRequestRunning = false;
  }

  // AI Assistant Chat Route (Read-only advisor, text + multimodal screenshot support)
  app.post('/api/katika/ai-chat', async (req, res) => {
    const rateCheck = checkAiRateLimit();
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

      acquireAiSlot();
      try {
        const reply = await handleAdminChatMessage({ message, image, history, recentTopics, config, metricsSnapshot: effectiveSnapshot });
        res.json({ success: true, reply });
      } finally {
        releaseAiSlot();
      }
    } catch (err: unknown) {
      console.error('[Katika AI Chat API] Handler error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Erreur interne du service IA.';
      res.status(500).json({ success: false, error: errorMessage });
    }
  });

  // AI Assistant Chat Route (Streaming via Server-Sent Events)
  app.post('/api/katika/ai-chat-stream', async (req, res) => {
    const rateCheck = checkAiRateLimit();
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

      acquireAiSlot();
      try {
        await streamAdminChatMessage(
          { message, image, history, recentTopics, config, metricsSnapshot: effectiveSnapshot },
          (chunkText) => {
            res.write(`data: ${JSON.stringify({ text: chunkText })}\n\n`);
          }
        );
      } finally {
        releaseAiSlot();
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
    const rateCheck = checkAiRateLimit();
    if (rateCheck.allowed === false) {
      res.setHeader('Retry-After', String(rateCheck.retryAfterMinutes * 60));
      return res.status(429).json({ success: false, error: rateCheck.message });
    }

    try {
      const { brief, presetId, format, palette, model, metricsSnapshot } = req.body || {};
      if (!brief && !presetId) {
        return res.status(400).json({ success: false, error: 'Un brief texte ou un identifiant de recette est requis.' });
      }

      acquireAiSlot();
      try {
        const result = await generateVisualSpec({ brief: brief || '', config: { presetId, format, palette, model }, metricsSnapshot });
        res.json({ success: true, ...result });
      } finally {
        releaseAiSlot();
      }
    } catch (err: unknown) {
      console.error('[Katika AI Visual API] Handler error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Erreur interne de génération du visuel IA.';
      res.status(500).json({ success: false, error: errorMessage });
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
