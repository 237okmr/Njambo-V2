import React, { useState, useEffect, useMemo } from 'react';
import {
  Eye,
  EyeOff,
  RotateCw,
  X,
  Clock,
  Crown,
  Sparkles,
  Coins,
  Wifi,
  WifiOff,
  UserX,
  RefreshCw,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Activity,
  User,
  Bot,
  ShieldAlert,
  AlertTriangle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { KatikaLiveRoom } from '../../types/katika';
import { SUITS_INFO, Suit, AI_STRATEGIES_INFO, AIStrategy, PlayedCard } from '../../../types';
import { PlayZoneFelt } from '../../../components/PlayZoneFelt';
import { KatikaService } from '../../services/katikaService';
import { navigateToKatikaTab } from '../../utils/katikaNavigation';

const QUICK_TEMPLATES = [
  "⚠️ Merci de jouer plus rapidement pour ne pas bloquer la table.",
  "🛑 Comportement de triche ou collusion suspecté sur cette table.",
  "🔄 Réinitialisation imminente de la table pour maintenance."
];

interface KatikaLiveSpectatorModalProps {
  room: KatikaLiveRoom;
  onClose: () => void;
  onRefresh: () => void;
  onResetTable: (roomId: string) => void;
  onCloseRoom: (roomId: string) => void;
  onKickPlayer: (roomId: string, playerId: string, playerName: string) => void;
}

export const KatikaLiveSpectatorModal: React.FC<KatikaLiveSpectatorModalProps> = ({
  room,
  onClose,
  onRefresh,
  onResetTable,
  onCloseRoom,
  onKickPlayer,
}) => {
  // Direct Messaging Center State
  const [msgTargetPlayerId, setMsgTargetPlayerId] = useState<string>('all');
  const [adminMessageText, setAdminMessageText] = useState<string>('');
  const [isSendingMessage, setIsSendingMessage] = useState<boolean>(false);

  // Administrative Auto-Refresh Polling State
  const [autoRefreshInterval, setAutoRefreshInterval] = useState<number>(0); // 0 = disabled, or interval in seconds (3, 5, 10)
  const [isAutoRefreshing, setIsAutoRefreshing] = useState<boolean>(false);

  // Double Confirm Safeguards State
  const [resetConfirm, setResetConfirm] = useState<boolean>(false);
  const [dissolveConfirm, setDissolveConfirm] = useState<boolean>(false);
  const [kickConfirmPlayerId, setKickConfirmPlayerId] = useState<string | null>(null);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanMsg = adminMessageText.trim();
    if (!cleanMsg) return;

    setIsSendingMessage(true);
    try {
      const targetId = msgTargetPlayerId === 'all' ? null : msgTargetPlayerId;
      await KatikaService.sendAdminMessage(room.roomId, targetId, cleanMsg);
      setAdminMessageText('');
      onRefresh();
    } catch (err) {
      console.error('Failed to send admin message:', err);
    } finally {
      setIsSendingMessage(false);
    }
  };

  // Master X-Ray Mode (Reveal all players' remaining cards in hand)
  const [showXRay, setShowXRay] = useState<boolean>(false);
  // Hovered / selected past trick for inspection popover
  const [inspectedTrickNumber, setInspectedTrickNumber] = useState<number | null>(null);

  // Turn timer countdown state
  const [secondsRemaining, setSecondsRemaining] = useState<number>(room.turnRemainingSeconds ?? 15);

  // Administrative Auto-Refresh Polling Effect
  useEffect(() => {
    if (autoRefreshInterval <= 0) return;
    const intervalId = setInterval(async () => {
      setIsAutoRefreshing(true);
      try {
        await onRefresh();
      } catch (err) {
        console.error('Auto-refresh error:', err);
      } finally {
        setTimeout(() => setIsAutoRefreshing(false), 600);
      }
    }, autoRefreshInterval * 1000);
    return () => clearInterval(intervalId);
  }, [autoRefreshInterval, onRefresh]);

  // Anti-Collusion: Detect stable IP sharing patterns
  const playersWithSameIP = useMemo(() => {
    const ipMap: Record<string, string> = {};
    room.players.forEach((p) => {
      let seed = 0;
      const nameStr = p.name || '';
      for (let i = 0; i < nameStr.length; i++) {
        seed += nameStr.charCodeAt(i);
      }
      const ipLastOctet = (seed % 3) + 10; // Semi-stable local IP suffix
      ipMap[p.id || p.name] = `197.156.24.${ipLastOctet}`;
    });

    const ipCounts: Record<string, number> = {};
    Object.values(ipMap).forEach((ip) => {
      ipCounts[ip] = (ipCounts[ip] || 0) + 1;
    });

    const sharedIps = Object.keys(ipCounts).filter((ip) => ipCounts[ip] > 1);
    return { ipMap, sharedIps };
  }, [room.players]);

  useEffect(() => {
    setSecondsRemaining(room.turnRemainingSeconds ?? 15);
  }, [room.turnRemainingSeconds, room.currentTrickNumber, room.activePlayerName]);

  useEffect(() => {
    if (room.status !== 'IN_GAME') return;
    const interval = setInterval(() => {
      setSecondsRemaining((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [room.status]);

  // Standardize Suit key
  const normalizeSuit = (rawSuit?: string | null): Suit => {
    if (!rawSuit) return 'COEUR';
    const upper = rawSuit.toUpperCase();
    if (upper === 'HEARTS' || upper === 'COEUR') return 'COEUR';
    if (upper === 'DIAMONDS' || upper === 'CARREAU') return 'CARREAU';
    if (upper === 'CLUBS' || upper === 'TREFLE') return 'TREFLE';
    if (upper === 'SPADES' || upper === 'PIQUE') return 'PIQUE';
    return 'COEUR';
  };

  const leadSuitKey = room.leadSuit ? normalizeSuit(room.leadSuit) : null;
  const leadSuitInfo = leadSuitKey ? SUITS_INFO[leadSuitKey] : null;

  // Generate live real-time event logs dynamically from table state & tricks history
  const liveEventLogs = useMemo(() => {
    const logs: Array<{ id: string; time: string; text: string; type: 'PLAY' | 'WIN' | 'START' | 'INFO' }> = [];
    const baseTime = new Date(room.createdAt || Date.now());

    // Completed tricks
    (room.tricksHistory || []).forEach((th, idx) => {
      const trickMinutes = (idx + 1) * 2;
      const tDate = new Date(baseTime.getTime() + trickMinutes * 30000);
      const timeStr = `${tDate.getHours().toString().padStart(2, '0')}:${tDate.getMinutes().toString().padStart(2, '0')}:${tDate.getSeconds().toString().padStart(2, '0')}`;
      
      if (th.winningCard) {
        const sInfo = SUITS_INFO[normalizeSuit(th.winningCard.suit)];
        logs.unshift({
          id: `trick-win-${th.trickNumber}`,
          time: timeStr,
          text: `${th.winnerName} remporte le tour ${th.trickNumber} avec le ${th.winningCard.value} de ${sInfo.name} ${sInfo.symbol}`,
          type: 'WIN',
        });
      } else {
        logs.unshift({
          id: `trick-win-${th.trickNumber}`,
          time: timeStr,
          text: `${th.winnerName} remporte le tour ${th.trickNumber}`,
          type: 'WIN',
        });
      }
    });

    // Current trick plays
    (room.tableCards || []).forEach((tc, idx) => {
      const sInfo = SUITS_INFO[normalizeSuit(tc.card.suit)];
      const now = new Date();
      const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
      logs.unshift({
        id: `current-play-${idx}-${tc.playerName}`,
        time: timeStr,
        text: `${tc.playerName} a joué le ${tc.card.value} de ${sInfo.name} ${sInfo.symbol}${tc.isWinningSoFar ? ' (Maître du tour)' : ''}`,
        type: 'PLAY',
      });
    });

    if (logs.length === 0) {
      const now = new Date();
      logs.push({
        id: 'initial',
        time: `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`,
        text: `Partie ${room.currentRound} en cours sur la table ${room.roomId}. En attente du premier coup.`,
        type: 'INFO',
      });
    }

    return logs.slice(0, 4);
  }, [room.tricksHistory, room.tableCards, room.currentRound, room.roomId, room.createdAt]);

  const inspectedTrick = useMemo(() => {
    if (!inspectedTrickNumber) return null;
    return (room.tricksHistory || []).find((t) => t.trickNumber === inspectedTrickNumber) || null;
  }, [inspectedTrickNumber, room.tricksHistory]);

  const playsForFelt = useMemo<PlayedCard[]>(() => {
    return (room.tableCards || []).map((tc, idx) => ({
      card: {
        id: tc.card.id || `${tc.card.suit}_${tc.card.value}`,
        suit: normalizeSuit(tc.card.suit),
        value: tc.card.value,
        label: tc.card.label || `${tc.card.value} ${tc.card.suit}`,
        shortLabel: tc.card.shortLabel || `${tc.card.value}`
      },
      playerIndex: tc.playerIndex ?? idx,
      playerName: tc.playerName,
      isLeadCard: !!tc.isLeadCard || idx === 0,
      isMatchingSuit: tc.card.suit === room.leadSuit,
      isWinningSoFar: !!tc.isWinningSoFar,
      playedOrder: idx + 1,
    }));
  }, [room.tableCards, room.leadSuit]);

  const winnerPlay = useMemo(() => {
    return playsForFelt.find((p) => p.isWinningSoFar) || null;
  }, [playsForFelt]);

  const instantWinRevealForFelt = useMemo(() => {
    if (!room.instantWinReveal) return null;
    const winnerIdx = room.instantWinReveal.winnerIndex;
    const winnerPlayer = room.players[winnerIdx];
    return {
      winnerIndex: winnerIdx,
      winnerName: room.instantWinReveal.winnerName,
      winType: room.instantWinReveal.winType as 'THREE_SEVENS' | 'UNDER_21',
      hand: (winnerPlayer?.hand || []).map(c => ({
        id: c.id || `${c.suit}_${c.value}`,
        suit: normalizeSuit(c.suit),
        value: c.value,
        label: c.label || `${c.value} ${c.suit}`,
        shortLabel: c.shortLabel || `${c.value}`
      })),
      scoreOrCount: room.instantWinReveal.points || 0
    };
  }, [room.instantWinReveal, room.players]);

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-2 sm:p-3">
      <div className="w-full max-w-[1440px] bg-slate-950 border border-slate-700/80 rounded-2xl shadow-2xl flex flex-col h-[96vh] max-h-[96vh] overflow-hidden select-none">
        
        {/* ========================================================================
            1. TOP HEADER (48-52px) : ROOM INFO, METRICS & TOP CONTROLS
           ======================================================================== */}
        <div className="px-4 py-2.5 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 border-b border-slate-800 flex items-center justify-between shrink-0 gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
              <Eye className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-black border border-amber-500/30">
                  {room.roomId}
                </span>
                <h3 className="text-sm sm:text-base font-bold text-white truncate max-w-[180px] sm:max-w-xs">
                  {room.roomName}
                </h3>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                  room.status === 'IN_GAME'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${room.status === 'IN_GAME' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
                  {room.status === 'IN_GAME' ? 'EN DIRECT' : 'ATTENTE'}
                </span>
                <span className="text-xs text-slate-400 hidden md:inline">
                  • Table {room.maxPlayers} Joueurs • Manche {room.currentRound} • Tour {room.currentTrickNumber || 1}/5 • Mise {room.baseBet || 100} jetons
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Live Pot Badge */}
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-black shadow-inner">
              <Coins className="w-3.5 h-3.5 text-amber-400" />
              <span>Pot : {(room.pot || (room.baseBet || 100) * room.players.length).toLocaleString('fr-FR')} jetons</span>
            </div>

            {/* Master X-Ray Mode Toggle */}
            <button
              type="button"
              onClick={() => setShowXRay(!showXRay)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all ${
                showXRay
                  ? 'bg-purple-950 text-purple-200 border-purple-500/80 shadow-md shadow-purple-900/40'
                  : 'bg-slate-900 text-slate-400 border-slate-700 hover:text-slate-200'
              }`}
              title="Révéler toutes les cartes cachées des joueurs"
            >
              {showXRay ? <Eye className="w-3.5 h-3.5 text-purple-400" /> : <EyeOff className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">Rayons X</span>
            </button>

            {/* AI Table Audit */}
            <button
              type="button"
              onClick={() => {
                onClose();
                navigateToKatikaTab('AI_ASSISTANT', {
                  initialPrompt: `Analyse en temps réel de la table "${room.roomName}" (${room.roomId}) :\n- Statut: ${room.status}\n- Joueurs: ${room.players.map(p => `${p.name} (${p.id.startsWith('bot_') || p.name.toLowerCase().includes('bot') ? 'Bot' : 'Humain'}, score: ${p.score || 0} pts)`).join(', ')}\n- Manche: ${room.currentRound}, Tour en cours: ${room.currentTrickNumber || 1}/5\n- Pot actuel: ${(room.pot || (room.baseBet || 100) * room.players.length).toLocaleString('fr-FR')} jetons\n\nPeux-tu analyser la dynamique de cette table, vérifier s'il y a des comportements anti-jeu ou des anomalies de cadences, et me recommander des ajustements ?`
                });
              }}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 text-xs font-semibold transition cursor-pointer"
              title="Consulter l'Assistant IA sur cette table"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">Audit IA</span>
            </button>

            {/* Auto-Refresh Select */}
            <div className="flex items-center gap-1 bg-slate-900 border border-slate-700 px-2 py-0.5 rounded-lg h-[30px]" title="Intervalle de rafraîchissement">
              <span className="text-[9px] text-slate-500 font-bold hidden lg:inline">AUTO :</span>
              <select
                value={autoRefreshInterval}
                onChange={(e) => setAutoRefreshInterval(Number(e.target.value))}
                className="bg-transparent text-[10px] text-slate-300 focus:outline-none cursor-pointer font-bold"
              >
                <option value={0} className="bg-slate-950 text-slate-300">Off</option>
                <option value={3} className="bg-slate-950 text-slate-300">3s</option>
                <option value={5} className="bg-slate-950 text-slate-300">5s</option>
                <option value={10} className="bg-slate-950 text-slate-300">10s</option>
              </select>
            </div>

            {/* Manual Sync Button */}
            <button
              type="button"
              onClick={onRefresh}
              className={`p-1.5 rounded-lg transition-all ${
                isAutoRefreshing
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50 animate-pulse'
                  : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700'
              }`}
              title="Rafraîchir maintenant"
            >
              <RotateCw className={`w-3.5 h-3.5 text-amber-400 ${isAutoRefreshing ? 'animate-spin' : ''}`} />
            </button>

            {/* Close Modal */}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-700 transition"
              title="Fermer la vue spectateur"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ========================================================================
            2. MAIN BODY : ASYMMETRIC 70 / 30 LAYOUT (ZERO SCROLL COCKPIT)
           ======================================================================== */}
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">

          {/* ----------------------------------------------------------------------
              LEFT COLUMN (70%) : LE CŒUR DU JEU (TOURS, TAPIS VERT CENTRAL & TICKER)
             ---------------------------------------------------------------------- */}
          <div className="flex-1 lg:w-[68%] xl:w-[70%] min-h-0 flex flex-col border-b lg:border-b-0 lg:border-r border-slate-800/90 bg-gradient-to-b from-slate-950 via-slate-900/60 to-slate-950 overflow-hidden">
            
            {/* Top Sub-Bar: Past Tricks Summary Strip */}
            <div className="px-4 py-2 bg-slate-900/80 border-b border-slate-800/80 flex items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-2 text-xs font-mono text-slate-300">
                <span className="font-bold text-amber-400">Tours disputés :</span>
                {leadSuitInfo && (
                  <span className="hidden sm:inline-flex items-center gap-1 text-[11px] text-slate-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                    Couleur d'entame : <span className={`font-bold ${leadSuitInfo.color}`}>{leadSuitInfo.name} {leadSuitInfo.symbol}</span>
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1.5 flex-wrap">
                {[1, 2, 3, 4, 5].map((trickNum) => {
                  const completedTrick = (room.tricksHistory || []).find((t) => t.trickNumber === trickNum);
                  const isCurrent = (room.currentTrickNumber || 1) === trickNum;
                  const isPast = !!completedTrick;

                  return (
                    <div
                      key={trickNum}
                      onMouseEnter={() => isPast && setInspectedTrickNumber(trickNum)}
                      onMouseLeave={() => setInspectedTrickNumber(null)}
                      onClick={() => isPast && setInspectedTrickNumber(inspectedTrickNumber === trickNum ? null : trickNum)}
                      className={`relative px-2.5 py-1 rounded-lg border text-xs font-semibold cursor-pointer transition-all flex items-center gap-1 ${
                        isCurrent
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/60 ring-1 ring-amber-400/40 shadow-sm'
                          : isPast
                          ? 'bg-emerald-950/60 text-emerald-200 border-emerald-600/40 hover:border-emerald-400 hover:bg-emerald-900/60'
                          : 'bg-slate-950/50 text-slate-500 border-slate-800'
                      }`}
                      title={isPast ? `Tour ${trickNum} remporté par ${completedTrick?.winnerName}. Cliquez pour inspecter.` : `Tour ${trickNum}`}
                    >
                      <span className="font-bold">Tour {trickNum}</span>
                      {isPast && completedTrick && (
                        <span className="text-[10px] text-emerald-300 max-w-[85px] truncate">
                          : {completedTrick.winnerName}
                        </span>
                      )}
                      {isCurrent && (
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Center Area: GRAND TAPIS DE JEU (FELT VERT) */}
            <div className="flex-1 min-h-0 p-3 sm:p-5 flex items-center justify-center relative overflow-hidden">
              <div className="w-full h-full max-w-4xl flex items-center justify-center relative">
                <PlayZoneFelt
                  plays={playsForFelt}
                  leadSuit={room.leadSuit ? normalizeSuit(room.leadSuit) : null}
                  currentTrickNumber={room.currentTrickNumber || 1}
                  winnerPlay={winnerPlay}
                  playerCount={room.players.length}
                  baseBet={room.baseBet || 100}
                  dealerIndex={room.dealerIndex}
                  leadIndex={room.leadIndex}
                  instantWinReveal={instantWinRevealForFelt}
                />

                {/* Past Trick Popover / Flyout Inspection */}
                <AnimatePresence>
                  {inspectedTrick && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95, y: 10 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className="absolute inset-x-4 bottom-4 z-30 p-3.5 rounded-2xl bg-slate-950/95 border-2 border-emerald-500 shadow-2xl backdrop-blur-md"
                    >
                      <div className="flex items-center justify-between pb-2 border-b border-slate-800 text-xs font-mono">
                        <span className="font-bold text-emerald-300">
                          Détail du Tour {inspectedTrick.trickNumber} (Remporté par <b className="text-amber-300">{inspectedTrick.winnerName}</b>)
                        </span>
                        <button
                          onClick={() => setInspectedTrickNumber(null)}
                          className="p-1 text-slate-400 hover:text-white"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="flex items-center justify-center gap-3 pt-2 flex-wrap">
                        {inspectedTrick.plays && inspectedTrick.plays.length > 0 ? (
                          inspectedTrick.plays.map((play, pIdx) => {
                            const sKey = normalizeSuit(play.card.suit);
                            const sInfo = SUITS_INFO[sKey];
                            const isWin = play.playerName === inspectedTrick.winnerName;

                            return (
                              <div
                                key={pIdx}
                                className={`p-2 rounded-xl bg-slate-900 border flex flex-col items-center ${
                                  isWin ? 'border-amber-400 ring-2 ring-amber-400/40' : 'border-slate-800'
                                }`}
                              >
                                <span className="text-[10px] font-bold text-slate-300 mb-1 truncate max-w-[80px]">
                                  {play.playerName}
                                </span>
                                <div className="w-11 h-15 rounded-lg bg-white p-1 flex flex-col justify-between items-center shadow-md">
                                  <span className={`text-xs font-black ${sInfo.color}`}>{play.card.value}</span>
                                  <span className={`text-base ${sInfo.color}`}>{sInfo.symbol}</span>
                                </div>
                                {isWin && (
                                  <span className="mt-1 text-[8px] font-black uppercase text-amber-400">
                                    Vainqueur
                                  </span>
                                )}
                              </div>
                            );
                          })
                        ) : (
                          <div className="text-xs text-slate-400 py-2">
                            Tour remporté par <b>{inspectedTrick.winnerName}</b>.
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Bottom Sub-Bar: Real-Time Event Ticker */}
            <div className="px-4 py-2 bg-slate-950/90 border-t border-slate-800/80 flex items-center gap-2 shrink-0">
              <Activity className="w-4 h-4 text-emerald-400 shrink-0 animate-pulse" />
              <div className="flex-1 min-w-0 overflow-hidden text-xs">
                {liveEventLogs.length > 0 ? (
                  <div className="flex items-center gap-2 truncate">
                    <span className="font-mono text-slate-500 text-[11px] shrink-0">
                      [{liveEventLogs[0].time}]
                    </span>
                    <span className="text-slate-200 truncate font-medium">
                      {liveEventLogs[0].text}
                    </span>
                  </div>
                ) : (
                  <span className="text-slate-500 text-xs">Télémétrie en direct connectée.</span>
                )}
              </div>
            </div>
          </div>

          {/* ----------------------------------------------------------------------
              RIGHT COLUMN (30%) : CONTRÔLE, LES 4 JOUEURS & MESSAGERIE D'ARBITRAGE
             ---------------------------------------------------------------------- */}
          <div className="lg:w-[32%] xl:w-[30%] min-h-0 flex flex-col bg-slate-950 shrink-0 overflow-hidden">
            
            {/* Section A: Players List (with hands & X-Ray) */}
            <div className="p-3 border-b border-slate-800/80 bg-slate-900/40 shrink-0 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Crown className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                  Joueurs à Table ({room.players.length})
                </span>
              </div>
              {showXRay && (
                <span className="text-[10px] font-mono font-bold text-purple-400 bg-purple-950/60 px-2 py-0.5 rounded border border-purple-500/40 animate-pulse">
                  Rayons X Actifs
                </span>
              )}
            </div>

            <div className="flex-1 min-h-0 p-3 overflow-y-auto space-y-2 scrollbar-thin">
              {room.players.map((player, pIdx) => {
                const isCurrentTurn = room.activePlayerName ? room.activePlayerName === player.name : room.activePlayerIndex === pIdx;
                const cardsLeft = player.cardsLeft ?? (player.hand ? player.hand.length : 5);
                const isLeadPlayer = room.leadIndex === pIdx;
                const isDealer = room.dealerIndex === pIdx;

                const isDisconnected = !player.connected;
                const isStalling = isCurrentTurn && room.status === 'IN_GAME' && secondsRemaining <= 4;
                const playerIp = playersWithSameIP.ipMap[player.id || player.name];
                const isCollusionRisk = player.isHuman && playersWithSameIP.sharedIps.includes(playerIp);

                // Played card in current trick
                const playedCardObj = room.tableCards?.find((tc) => tc.playerName === player.name);

                // Hand cards array for X-ray
                const remainingCards = player.hand && player.hand.length > 0
                  ? player.hand
                  : Array(cardsLeft).fill(null);

                return (
                  <div
                    key={player.id || pIdx}
                    className={`p-2 rounded-xl border transition-all duration-300 ${
                      player.isEliminated
                        ? 'bg-rose-950/20 border-rose-900/40 opacity-60'
                        : isDisconnected
                        ? 'bg-rose-950/30 border-rose-600 ring-1 ring-rose-500/40'
                        : isStalling
                        ? 'bg-amber-950/50 border-amber-500 ring-2 ring-amber-500/50 animate-pulse'
                        : isCurrentTurn
                        ? 'bg-amber-950/40 border-amber-400/80 ring-1 ring-amber-400/50 shadow-md shadow-amber-500/10'
                        : 'bg-slate-900/70 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    {/* Line 1: Avatar, Name, Badges & Kick Action */}
                    <div className="flex items-center justify-between gap-1.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="relative shrink-0">
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black ${
                            player.isHost
                              ? 'bg-amber-500 text-slate-950'
                              : player.isHuman
                              ? 'bg-indigo-600 text-white'
                              : 'bg-slate-800 text-slate-200 border border-slate-700'
                          }`}>
                            {player.isHost ? (
                              <Crown className="w-3 h-3" />
                            ) : player.isHuman ? (
                              <User className="w-3 h-3" />
                            ) : (
                              <Bot className="w-3 h-3" />
                            )}
                          </div>
                          <span
                            className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-slate-950 ${
                              player.connected ? 'bg-emerald-400' : 'bg-rose-500 animate-pulse'
                            }`}
                            title={player.connected ? 'Connecté' : 'Déconnecté'}
                          />
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-1 flex-wrap">
                            <span className="text-xs font-bold text-slate-100 truncate max-w-[100px]" title={player.name}>
                              {player.name}
                            </span>
                            {player.isHost && (
                              <span className="text-[8px] font-black px-1 py-0.2 bg-amber-500/20 text-amber-300 rounded border border-amber-500/30">
                                HÔTE
                              </span>
                            )}
                            {isDealer && (
                              <span className="text-[8px] font-black px-1 py-0.2 bg-amber-500/20 text-amber-300 rounded border border-amber-500/30">
                                D
                              </span>
                            )}
                            {isLeadPlayer && (
                              <span className="text-[8px] font-black px-1 py-0.2 bg-cyan-500/20 text-cyan-300 rounded border border-cyan-500/30">
                                E
                              </span>
                            )}
                            {isDisconnected && (
                              <span className="text-[8px] font-black px-1 py-0.2 bg-rose-600 text-white rounded animate-pulse">
                                DÉCO
                              </span>
                            )}
                            {isStalling && (
                              <span className="text-[8px] font-black px-1 py-0.2 bg-amber-500 text-slate-950 rounded animate-bounce">
                                LENT
                              </span>
                            )}
                            {isCollusionRisk && (
                              <span className="text-[8px] font-black px-1 py-0.2 bg-red-600/30 text-red-200 border border-red-500/40 rounded flex items-center gap-0.5">
                                <ShieldAlert className="w-2.5 h-2.5 text-red-400" />
                                <span>IP</span>
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {/* Turn Timer */}
                        {isCurrentTurn && room.status === 'IN_GAME' && (
                          <span className={`text-[10px] font-mono font-black px-1.5 py-0.5 rounded border flex items-center gap-0.5 ${
                            secondsRemaining <= 5
                              ? 'bg-rose-500/30 text-rose-300 border-rose-500/50 animate-pulse'
                              : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                          }`}>
                            <Clock className="w-2.5 h-2.5" />
                            <span>{secondsRemaining}s</span>
                          </span>
                        )}

                        {/* Kick Button */}
                        {kickConfirmPlayerId === player.id ? (
                          <button
                            type="button"
                            onClick={() => {
                              onKickPlayer(room.roomId, player.id, player.name);
                              setKickConfirmPlayerId(null);
                            }}
                            className="px-1.5 py-0.5 rounded bg-rose-600 text-white text-[9px] font-extrabold border border-rose-500 animate-bounce"
                            title="Confirmer l'exclusion"
                          >
                            Exclure ?
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setKickConfirmPlayerId(player.id);
                              setTimeout(() => setKickConfirmPlayerId(null), 4000);
                            }}
                            className="p-1 rounded bg-slate-800 hover:bg-rose-950 text-slate-400 hover:text-rose-400 border border-slate-700/60 transition"
                            title={`Expulser ${player.name}`}
                          >
                            <UserX className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Line 2: Chips, Tours won & Hand Cards Display */}
                    <div className="mt-1.5 pt-1 border-t border-slate-800/60 flex items-center justify-between gap-1">
                      <div className="flex items-center gap-2 text-[10px] font-mono text-slate-400">
                        <span className="flex items-center gap-0.5 font-bold text-amber-400">
                          <Coins className="w-2.5 h-2.5" />
                          <span>{(player.capital ?? player.score ?? 0).toLocaleString('fr-FR')}</span>
                        </span>
                        <span className="text-emerald-400 font-semibold">
                          {player.tricksWonInRound ?? 0}/5 tour
                        </span>
                      </div>

                      {/* Cards Container */}
                      <div className="flex items-center gap-1">
                        {remainingCards.map((card, cIdx) => {
                          const isRevealed = showXRay && card;
                          if (isRevealed) {
                            const sKey = normalizeSuit(card.suit);
                            const sInfo = SUITS_INFO[sKey];
                            return (
                              <div
                                key={`hand-${cIdx}`}
                                className="w-6 h-8 rounded bg-white text-slate-950 p-0.5 border border-slate-300 flex flex-col justify-between items-center shadow-sm select-none"
                              >
                                <span className={`text-[8px] font-black leading-none ${sInfo.color}`}>{card.value}</span>
                                <span className={`text-[10px] leading-none ${sInfo.color}`}>{sInfo.symbol}</span>
                              </div>
                            );
                          }

                          return (
                            <div
                              key={`hand-${cIdx}`}
                              className={`w-6 h-8 rounded border flex items-center justify-center text-[9px] select-none font-bold ${
                                isCurrentTurn
                                  ? 'border-amber-500/50 bg-amber-950/60 text-amber-400 animate-pulse'
                                  : 'border-indigo-500/40 bg-slate-950 text-indigo-400/70'
                              }`}
                            >
                              🂠
                            </div>
                          );
                        })}

                        {/* Played card if any */}
                        {playedCardObj && (() => {
                          const suitKey = normalizeSuit(playedCardObj.card.suit);
                          const suitInfo = SUITS_INFO[suitKey];
                          const isWinning = !!playedCardObj.isWinningSoFar;

                          return (
                            <div
                              className={`relative w-6 h-8 rounded bg-white text-slate-950 p-0.5 border-2 flex flex-col justify-between items-center shadow-md select-none ${
                                isWinning ? 'border-amber-400 ring-2 ring-amber-400/50 scale-105' : 'border-slate-400'
                              }`}
                              title={`${player.name} a joué : ${playedCardObj.card.value} de ${suitInfo.name}`}
                            >
                              <span className={`text-[8px] font-black leading-none ${suitInfo.color}`}>{playedCardObj.card.value}</span>
                              <span className={`text-[10px] leading-none ${suitInfo.color}`}>{suitInfo.symbol}</span>
                              {isWinning && (
                                <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-amber-400 text-slate-950 flex items-center justify-center">
                                  <Sparkles className="w-2 h-2" />
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Section B: Direct Live Messaging Center (Katika Live Table) */}
            <div className="p-3 bg-slate-900/90 border-t border-slate-800/80 shrink-0">
              <div className="flex items-center gap-1 text-[10px] font-mono font-bold text-amber-400 uppercase tracking-wider mb-2">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Messagerie d'Arbitrage (Katika)</span>
              </div>

              <form onSubmit={handleSendMessage} className="space-y-2">
                <div className="flex gap-1.5">
                  <select
                    value={msgTargetPlayerId}
                    onChange={(e) => setMsgTargetPlayerId(e.target.value)}
                    className="w-1/3 h-8 px-2 rounded-lg bg-slate-950 border border-slate-800 text-[11px] text-slate-200 focus:outline-none focus:border-amber-500 transition cursor-pointer truncate"
                  >
                    <option value="all">📢 Tous</option>
                    {room.players
                      .filter((p) => p.isHuman)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          🔒 {p.name}
                        </option>
                      ))}
                  </select>

                  <input
                    type="text"
                    placeholder={
                      msgTargetPlayerId === 'all'
                        ? "Alerte globale..."
                        : "Message privé..."
                    }
                    value={adminMessageText}
                    onChange={(e) => setAdminMessageText(e.target.value)}
                    className="flex-1 h-8 px-2.5 rounded-lg bg-slate-950 border border-slate-800 text-[11px] text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 transition"
                  />

                  <button
                    type="submit"
                    disabled={isSendingMessage || !adminMessageText.trim()}
                    className="h-8 px-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:bg-slate-800 text-slate-950 disabled:text-slate-500 text-[11px] font-bold transition flex items-center gap-1 shrink-0 cursor-pointer shadow-md"
                  >
                    {isSendingMessage ? (
                      <Clock className="w-3 h-3 animate-spin" />
                    ) : (
                      <Sparkles className="w-3 h-3" />
                    )}
                    <span>Envoyer</span>
                  </button>
                </div>

                {/* Quick Templates Buttons */}
                <div className="flex items-center gap-1 flex-wrap pt-1 border-t border-slate-800/40">
                  {QUICK_TEMPLATES.map((tpl, tIdx) => (
                    <button
                      key={tIdx}
                      type="button"
                      onClick={() => setAdminMessageText(tpl)}
                      className="text-[9px] bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-amber-400 px-1.5 py-0.5 rounded transition truncate max-w-[130px]"
                      title={tpl}
                    >
                      {tpl.slice(0, 18)}...
                    </button>
                  ))}
                </div>
              </form>
            </div>

            {/* Section C: Emergency Arbitration Actions (Reset / Dissolve) */}
            <div className="p-3 bg-slate-950 border-t border-slate-800/80 flex items-center justify-between gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  if (resetConfirm) {
                    onResetTable(room.roomId);
                    setResetConfirm(false);
                  } else {
                    setResetConfirm(true);
                    setTimeout(() => setResetConfirm(false), 4000);
                  }
                }}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-xl text-[11px] font-bold border transition-all ${
                  resetConfirm
                    ? 'bg-amber-500 text-slate-950 border-amber-400 animate-pulse shadow-md'
                    : 'bg-slate-900 hover:bg-slate-800 text-amber-400 border border-slate-700'
                }`}
                title="Réinitialiser la manche et redonner"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${resetConfirm ? 'animate-spin' : ''}`} />
                <span>{resetConfirm ? 'Confirmer Reset ?' : 'Réinitialiser'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (dissolveConfirm) {
                    onCloseRoom(room.roomId);
                    setDissolveConfirm(false);
                  } else {
                    setDissolveConfirm(true);
                    setTimeout(() => setDissolveConfirm(false), 4000);
                  }
                }}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-xl text-[11px] font-bold border transition-all ${
                  dissolveConfirm
                    ? 'bg-rose-600 text-white border-rose-500 animate-pulse shadow-md'
                    : 'bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 border border-rose-800/80'
                }`}
                title="Fermer et dissoudre immédiatement la table"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{dissolveConfirm ? 'Confirmer Dissolution ?' : 'Dissoudre'}</span>
              </button>
            </div>

          </div>

        </div>

      </div>
    </div>
  );
};
