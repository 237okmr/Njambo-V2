import React, { useState, useEffect } from 'react';
import { getPublicParamNumber } from '../services/publicConfig';
import { getTurnTimerChoices } from '../../server/engine/engineParams';
import { MultiplayerRoom, RoomPlayer } from '../types';
import {
  Users,
  Crown,
  Bot,
  X,
  Copy,
  Check,
  Play,
  LogOut,
  Sparkles,
  Zap,
  ShieldCheck,
  Share2,
  Timer,
  AlertTriangle,
} from 'lucide-react';
import { triggerHaptic } from '../utils/sound';
import { isTestEnvironment } from '../utils/envUtils';

interface MultiplayerLobbyModalProps {
  room: MultiplayerRoom;
  localPlayerId: string;
  errorMessage?: string | null;
  onStartGame: () => Promise<void>;
  onToggleReady?: (isReady: boolean) => void;
  onToggleFillWithBots: (enabled: boolean) => Promise<void>;
  onUpdateSettings?: (settings: Partial<MultiplayerRoom>) => Promise<void>;
  onAlertUnreadyPlayers?: () => Promise<void>;
  onVoteStartWithBots?: () => Promise<void>;
  onClaimHost?: () => Promise<boolean>;
  onLeaveRoom: () => Promise<void>;
  onKickPlayer?: (playerId: string) => Promise<void>;
}

const DisconnectCountdown: React.FC<{ expiresAt: number }> = ({ expiresAt }) => {
  const [timeLeft, setTimeLeft] = useState(() => Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)));

  React.useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)));
    }, 1000);
    return () => clearInterval(timer);
  }, [expiresAt]);

  return <span className="text-red-400 font-bold">{timeLeft}s</span>;
};

export const MultiplayerLobbyModal: React.FC<MultiplayerLobbyModalProps> = ({
  room,
  localPlayerId,
  errorMessage,
  onStartGame,
  onToggleReady,
  onToggleFillWithBots,
  onUpdateSettings,
  onAlertUnreadyPlayers,
  onVoteStartWithBots,
  onClaimHost,
  onLeaveRoom,
  onKickPlayer,
}) => {
  const [copied, setCopied] = useState<boolean>(false);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);
  const [isStarting, setIsStarting] = useState<boolean>(false);
  const [alertSent, setAlertSent] = useState<boolean>(false);
  const [autoStartRemaining, setAutoStartRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (!room.autoStartCountdownAt) {
      setAutoStartRemaining(null);
      return;
    }
    
    const updateCountdown = () => {
      const remaining = Math.max(0, Math.ceil((room.autoStartCountdownAt! - Date.now()) / 1000));
      setAutoStartRemaining(remaining);
    };
    
    updateCountdown();
    const interval = setInterval(updateCountdown, 500);
    return () => clearInterval(interval);
  }, [room.autoStartCountdownAt]);


  // Auto-reset isStarting on error or timeout
  React.useEffect(() => {
    if (errorMessage) {
      setIsStarting(false);
    }
  }, [errorMessage]);

  React.useEffect(() => {
    if (isStarting) {
      const timer = setTimeout(() => {
        setIsStarting(false);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [isStarting]);

  const isHost = room.hostId === localPlayerId;
  const localPlayer = room.players.find((p) => p.id === localPlayerId);
  const isLocalReady = localPlayer?.isReady ?? false;
  const isLocalSpectator = Boolean(localPlayer?.isSpectator);

  const maxSeats = room.maxPlayers || 4;
  const seatedPlayers = room.players.filter((p) => !p.isSpectator);
  const spectators = room.players.filter((p) => p.isSpectator);

  const connectedHumans = seatedPlayers.filter((p) => p.isHuman && p.connected !== false);
  const connectedHumansCount = connectedHumans.length;

  // Unready guests (excluding the host and spectators)
  const unreadyGuests = connectedHumans.filter((p) => !p.isHost && !p.isReady);
  const allGuestsReady = unreadyGuests.length === 0;

  // Launch conditions: Always require at least 2 human players in a multiplayer room.
  const hasMinimumHumans = connectedHumansCount >= 2;
  const canStartInstantly = hasMinimumHumans && allGuestsReady;
  const currentTimer = room.turnTimerSeconds ?? getPublicParamNumber('turnTimerSeconds');
  const currentAfkAction = room.afkAction || 'auto_play';

  const handleCopyCode = () => {
    navigator.clipboard.writeText(room.id);
    setCopied(true);
    triggerHaptic('light');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyLink = async () => {
    const shareUrl = `${window.location.origin}${window.location.pathname}?room=${room.id}`;
    const shareText = `🃏 Viens jouer au Njambo Kora avec moi ! Table #${room.id} (${maxSeats} joueurs · Mise: ${room.baseBet} jetons). Clique ici pour rejoindre directement :`;
    const shareData = {
      title: 'Njambo Kora - Table Multijoueur',
      text: `${shareText}\n${shareUrl}`,
      url: shareUrl,
    };

    if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
      try {
        await navigator.share(shareData);
        triggerHaptic('medium');
        return;
      } catch (err) {
        console.log('Share canceled or failed, falling back to copy to clipboard', err);
      }
    }

    navigator.clipboard.writeText(shareUrl);
    setCopiedLink(true);
    triggerHaptic('light');
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleStart = async () => {
    if (!hasMinimumHumans || isStarting) return;

    if (!allGuestsReady) {
      // Alert unready players
      if (onAlertUnreadyPlayers) {
        await onAlertUnreadyPlayers();
        setAlertSent(true);
        triggerHaptic('heavy');
        setTimeout(() => setAlertSent(false), 4000);
      }
      return;
    }

    setIsStarting(true);
    try {
      await onStartGame();
    } catch (e) {
      console.error('Error starting game:', e);
      setIsStarting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700/80 rounded-3xl p-4 sm:p-6 max-w-lg w-full shadow-2xl relative text-slate-100 flex flex-col gap-4 max-h-[92vh] overflow-y-auto">
        {/* Header: Room Code and Share */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-800 gap-3">
          <div>
            <span className="text-[10px] font-black uppercase text-amber-400 tracking-wider">
              Salon Multijoueur
            </span>
            <h2 className="text-xl font-black text-white flex items-center gap-2">
              <span>Code :</span>
              <span className="font-mono text-amber-300 tracking-widest bg-slate-950 px-2.5 py-0.5 rounded-xl border border-amber-500/40">
                {room.id}
              </span>
            </h2>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleCopyCode}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 border border-slate-700 transition shadow"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 text-emerald-400" />
                  <span className="text-emerald-400">Copié !</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 text-amber-400" />
                  <span>Copier le Code</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleCopyLink}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 hover:text-amber-300 text-xs font-bold text-amber-400 border border-slate-700 hover:border-amber-500/30 transition shadow"
            >
              {copiedLink ? (
                <>
                  <Check className="w-4 h-4 text-emerald-400" />
                  <span className="text-emerald-400">Lien Copié !</span>
                </>
              ) : (
                <>
                  <Share2 className="w-4 h-4 text-amber-400" />
                  <span>Partager le Lien</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Error notification banner if any */}
        {errorMessage && (
          <div className="p-3 rounded-xl bg-rose-950/80 border border-rose-600/70 text-rose-200 text-xs font-bold flex items-center gap-2 animate-in fade-in slide-in-from-top-1 duration-200">
            <Zap className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Test Environment Host Warning Banner */}
        {isHost && isTestEnvironment() && (
          <div
            id="modal-test-environment-host-warning"
            className="p-3.5 rounded-2xl bg-amber-500/15 border border-amber-500/40 flex items-start gap-3 shadow-xl"
          >
            <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-300 flex items-center justify-center shrink-0 border border-amber-500/30">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-black text-amber-200">
                Environnement de test
              </span>
              <span className="text-[11px] text-amber-300/90 leading-relaxed">
                Tu es sur l'environnement de test. Tes amis ne pourront pas rejoindre depuis le lien public. Ouvre{' '}
                <a
                  href="https://njambo-kora.ai.studio"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-bold underline text-amber-200 hover:text-white"
                >
                  https://njambo-kora.ai.studio
                </a>{' '}
                pour créer ta table.
              </span>
            </div>
          </div>
        )}

        {/* Players Seats Grid */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs font-bold text-slate-400">
            <span>Joueurs Connectés ({connectedHumansCount}/{maxSeats})</span>
            <span className="text-[11px] text-amber-400">
              {room.fillWithBots ? 'Compléter avec virtuels' : '100% Humains'}
            </span>
          </div>

          <div className={`grid ${maxSeats === 3 ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-2'} gap-2`}>
            {Array.from({ length: maxSeats }).map((_, seatIdx) => {
              const player = seatedPlayers[seatIdx] as RoomPlayer | undefined;
              const isLocalPlayer = player && player.id === localPlayerId;

              if (player) {
                return (
                  <div
                    key={player.id}
                    className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 transition ${
                      isLocalPlayer
                        ? 'bg-amber-950/30 border-amber-500/60 ring-1 ring-amber-400/30'
                        : 'bg-slate-950/60 border-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <div className="w-8 h-8 rounded-full bg-emerald-700 flex items-center justify-center font-black text-xs text-white border border-emerald-500 shrink-0">
                        {player.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex flex-col min-w-0 flex-1">
                        <div className="flex items-center gap-1">
                          <span className="text-xs font-black text-white truncate max-w-[80px] sm:max-w-[100px]">
                            {player.name}
                          </span>
                          {player.isHost && (
                            <Crown className="w-3 h-3 text-amber-400 shrink-0" />
                          )}
                        </div>
                        <span className="text-[10px] text-slate-400">
                          {player.isHost
                            ? 'Hôte'
                            : player.isReady
                            ? '✓ Prêt'
                            : '⏳ En attente'} · {room.initialCapital}pts
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {player.connected === false && player.disconnectGraceExpiresAt ? (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-500/20 text-red-300 border border-red-500/40 flex items-center gap-1">
                          Déconnecté (<DisconnectCountdown expiresAt={player.disconnectGraceExpiresAt} />)
                        </span>
                      ) : player.isHost ? (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                          Hôte
                        </span>
                      ) : player.isReady ? (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
                          <Check className="w-3 h-3" /> Prêt
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                          Pas prêt
                        </span>
                      )}
                      {isHost && !isLocalPlayer && onKickPlayer && (
                        <button
                          type="button"
                          onClick={() => {
                            triggerHaptic();
                            onKickPlayer(player.id);
                          }}
                          className="ml-1 text-slate-500 hover:text-red-400 p-1 rounded-lg hover:bg-red-500/10 transition cursor-pointer"
                          title="Expulser ce joueur"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              }

              // Vacant seat
              return (
                <div
                  key={`vacant-seat-${seatIdx}`}
                  className="p-2.5 rounded-xl border border-dashed border-slate-800 bg-slate-950/30 flex items-center gap-2 text-slate-500"
                >
                  <div className="w-8 h-8 rounded-full border border-dashed border-slate-700 flex items-center justify-center text-xs shrink-0">
                    {room.fillWithBots ? (
                      <Users className="w-3.5 h-3.5 text-blue-400/60" />
                    ) : (
                      <span>{seatIdx + 1}</span>
                    )}
                  </div>
                  <div className="flex flex-col text-[10px] leading-tight">
                    <span className="font-semibold text-slate-400">
                      {room.fillWithBots ? `Joueur Virtuel ${seatIdx + 1}` : `Siège ${seatIdx + 1}`}
                    </span>
                    <span className="text-[9px] text-slate-500">
                      {room.fillWithBots ? 'Prêt au départ' : 'En attente...'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Spectators list if any */}
          {spectators.length > 0 && (
            <div className="mt-1 p-2 rounded-xl bg-slate-950/50 border border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
              <span className="flex items-center gap-1.5 text-[11px]">
                <span className="w-2 h-2 rounded-full bg-blue-400" />
                Spectateurs ({spectators.length}) : {spectators.map((s) => s.name).join(', ')}
              </span>
              {isLocalSpectator && (
                <span className="text-[10px] text-blue-300 font-bold">
                  Vous observez ce salon
                </span>
              )}
            </div>
          )}
        </div>

        {/* Room Game Rules Badges */}
        <div className="flex flex-wrap items-center justify-between gap-1.5 p-2 rounded-xl bg-slate-950/60 border border-slate-800 text-[10px]">
          <span className="text-slate-400">Mise: <b className="text-amber-300">{room.baseBet} pts</b></span>
          <span className="text-slate-400">Capital: <b className="text-amber-300">{room.initialCapital} pts</b></span>
          <span className="text-amber-300 font-bold flex items-center gap-1">
            <Timer className="w-3 h-3 text-amber-400" />
            {currentTimer > 0 ? `${currentTimer}s` : '∞'}
          </span>
          <span className="text-indigo-300 font-semibold flex items-center gap-1" title="Délai avant qu'un relais joue à la place d'un joueur déconnecté">
            <span>⏳ Grâce:</span>
            <b className="text-indigo-200">{getPublicParamNumber('aiRelayGraceSeconds')}s</b>
          </span>
          {room.enableDoubleKora && (
            <span className="text-purple-300 font-bold flex items-center gap-0.5">
              <Zap className="w-3 h-3 text-yellow-300" /> Double Kora
            </span>
          )}
          {room.enableUnder21 && (
            <span className="text-emerald-300 font-bold">≤ 21</span>
          )}
        </div>

        {/* Host controls / Player status */}

        {/* Auto-Start Countdown */}
        {autoStartRemaining !== null && (
          <div className="flex flex-col gap-2 pt-1">
            <div className="w-full py-4 px-4 rounded-xl font-black text-sm sm:text-base bg-gradient-to-r from-emerald-500 to-emerald-400 text-slate-950 shadow-xl flex items-center justify-center gap-3 animate-pulse">
              <Play className="w-5 h-5 fill-current" />
              <span>Démarrage automatique dans {autoStartRemaining}s...</span>
            </div>
          </div>
        )}

        {autoStartRemaining === null && isHost ? (
          <div className="flex flex-col gap-2 pt-1">
            {/* Host Quick Settings: Timer Cadence, Grace Period & Bots */}
            <div className="p-2 bg-slate-950/40 rounded-xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
              <div className="flex flex-wrap items-center gap-2">

                {/* Règle du relais (plus de réglage : identique pour toutes les tables) */}
                <div className="flex items-center gap-1 w-full sm:w-auto">
                  <span className="text-slate-400 font-medium">Absence :</span>
                  <span
                    className="text-amber-400 font-bold text-[10px] bg-amber-500/10 px-1.5 py-0.5 rounded"
                    title="Un relais joue des cartes neutres jusqu'à la fin de la partie et ne peut pas gagner le pot. Le joueur peut revenir à tout moment."
                  >
                    Relais IA
                  </span>
                </div>

                <div className="flex items-center gap-1">
                  <span className="text-slate-300 font-bold flex items-center gap-1">
                    <Timer className="w-3 h-3 text-amber-400" />
                    <span>Tour :</span>
                  </span>
                  {onUpdateSettings && (
                    <div className="flex items-center gap-1">
                      {getTurnTimerChoices(getPublicParamNumber('turnTimerSeconds')).map((val) => ({ val, label: `${val}s` })).map((opt) => (
                        <button
                          key={opt.val}
                          type="button"
                          onClick={() => onUpdateSettings({ turnTimerSeconds: opt.val })}
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold border transition ${
                            currentTimer === opt.val
                              ? 'bg-amber-500 text-slate-950 border-amber-400 font-black'
                              : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-auto flex-wrap">
                {onUpdateSettings && (
                  <>
                    <button
                      type="button"
                      onClick={() => onUpdateSettings({ enableDoubleKora: !room.enableDoubleKora })}
                      className={`px-2 py-0.5 rounded text-[10px] font-bold border transition ${
                        room.enableDoubleKora
                          ? 'bg-purple-500/20 text-purple-300 border-purple-500/40 font-black'
                          : 'bg-slate-900 text-slate-500 border-slate-800'
                      }`}
                      title="Double Kora : gain x4 si tours 4 & 5 remportés avec un 3"
                    >
                      ⚡ 2x Kora
                    </button>
                    <button
                      type="button"
                      onClick={() => onUpdateSettings({ enableUnder21: !room.enableUnder21 })}
                      className={`px-2 py-0.5 rounded text-[10px] font-bold border transition ${
                        room.enableUnder21
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 font-black'
                          : 'bg-slate-900 text-slate-500 border-slate-800'
                      }`}
                      title="Moins de 21 : victoire instantanée à la donne si somme des 5 cartes ≤ 21"
                    >
                      ≤ 21
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => onToggleFillWithBots(!room.fillWithBots)}
                  className={`px-2 py-0.5 rounded text-[10px] font-bold border transition ${
                    room.fillWithBots
                      ? 'bg-blue-500/20 text-blue-300 border-blue-500/40 font-black'
                      : 'bg-slate-900 text-slate-400 border-slate-800'
                  }`}
                >
                  {room.fillWithBots ? '👥 Virtuels ON' : '👤 Humains'}
                </button>
              </div>
            </div>

            {/* Host Start Game or Alert Button */}
            <div className="flex flex-col gap-2">
              {!hasMinimumHumans ? (
                <div className="w-full py-3 px-4 rounded-xl font-bold text-xs bg-slate-800/80 text-amber-300/90 border border-slate-700 flex items-center justify-center gap-2 text-center">
                  <Users className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>En attente d'au moins 2 joueurs humains connectés au salon</span>
                </div>
              ) : canStartInstantly ? (
                <button
                  type="button"
                  id="btn-start-multiplayer-manche"
                  disabled={isStarting}
                  onClick={handleStart}
                  className="w-full py-3 px-4 rounded-xl font-black text-xs sm:text-sm bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 shadow-xl shadow-amber-500/20 active:scale-[0.98] transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isStarting ? (
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                      <span>Démarrage de la manche...</span>
                    </div>
                  ) : (
                    <>
                      <Play className="w-4 h-4 fill-current" />
                      <span>Démarrer la manche ({room.fillWithBots ? `${maxSeats} joueurs (avec virtuels)` : `${connectedHumansCount} joueurs`})</span>
                    </>
                  )}
                </button>
              ) : (
                <button
                  type="button"
                  id="btn-alert-unready-players"
                  onClick={handleStart}
                  className="w-full py-3 px-4 rounded-xl font-bold text-xs sm:text-sm bg-amber-950/60 hover:bg-amber-900/60 text-amber-300 border border-amber-500/40 shadow-lg transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  {alertSent ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-400" />
                      <span className="text-emerald-300">Alerte envoyée aux joueurs !</span>
                    </>
                  ) : (
                    <>
                      <Zap className="w-4 h-4 text-amber-400 animate-bounce" />
                      <span>
                        Alerter les joueurs non prêts ({unreadyGuests.map((g) => g.name).join(', ')})
                      </span>
                    </>
                  )}
                </button>
              )}

              {!canStartInstantly && hasMinimumHumans && (
                <p className="text-[11px] text-center text-slate-400">
                  Tous les invités doivent être <b className="text-emerald-400">« Prêts »</b> avant le lancement. Cliquez pour leur envoyer une alerte.
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800 flex flex-col gap-3">
            {/* Guest / Spectator Action Button */}
            {isLocalSpectator ? (
              seatedPlayers.length < maxSeats && onToggleReady ? (
                <button
                  type="button"
                  id="btn-spectator-take-seat-modal"
                  onClick={() => {
                    onToggleReady(true);
                    triggerHaptic('medium');
                  }}
                  className="w-full py-3 px-4 rounded-xl font-black text-xs sm:text-sm bg-gradient-to-r from-emerald-400 to-emerald-500 hover:from-emerald-300 hover:to-emerald-400 text-slate-950 shadow-xl shadow-emerald-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98]"
                >
                  <Users className="w-4 h-4" />
                  <span>Prendre place à la table (Siège disponible 🪑)</span>
                </button>
              ) : (
                <div className="w-full py-2.5 px-4 rounded-xl bg-cyan-950/80 border border-cyan-500/40 text-cyan-200 text-xs font-bold text-center flex items-center justify-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                  <span>Table complète · Vous observez ce salon (Place attribuée dès qu'un joueur quitte)</span>
                </div>
              )
            ) : onToggleReady ? (
              <button
                type="button"
                id="btn-toggle-ready-modal"
                onClick={() => {
                  onToggleReady(!isLocalReady);
                  triggerHaptic('medium');
                }}
                className={`w-full py-3 px-4 rounded-xl font-black text-xs sm:text-sm shadow-xl transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  isLocalReady
                    ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/20 active:scale-[0.98]'
                    : 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 shadow-amber-500/20 active:scale-[0.98]'
                }`}
              >
                {isLocalReady ? (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Vous êtes PRÊT ! (Cliquer pour annuler)</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    <span>Cliquer pour être « PRÊT »</span>
                  </>
                )}
              </button>
            ) : null}

            {/* Contextual Tip for Waiting Players */}
            {!isHost && (
              <p className="text-[11px] text-center text-slate-400 leading-tight">
                💡 <b className="text-slate-300">Astuce :</b> Vous pouvez fermer cette fenêtre pour réviser les <b className="text-amber-400">Règles du jeu</b> pendant l'attente.
              </p>
            )}

            <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-800">
              <span className="font-bold text-amber-300 flex items-center gap-1.5">
                <span className="animate-spin text-amber-400">⏳</span>
                En attente du lancement par l'Hôte ({room.hostName})...
              </span>
              {onClaimHost && (
                <button
                  type="button"
                  onClick={async () => {
                    await onClaimHost();
                  }}
                  className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 transition"
                  title="Si l'hôte ne répond pas, devenir hôte du salon"
                >
                  Devenir Hôte
                </button>
              )}
            </div>

            {/* Guest vote button to fill with bots and start */}
            {onVoteStartWithBots && (
              <button
                type="button"
                onClick={onVoteStartWithBots}
                className="w-full py-2 px-3 rounded-lg bg-blue-950/60 hover:bg-blue-900/60 border border-blue-600/40 text-blue-200 text-xs font-bold transition flex items-center justify-center gap-1.5"
              >
                <span>👥 Voter pour compléter la table avec des virtuels</span>
                {room.botVotes && room.botVotes.length > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full bg-blue-500 text-slate-950 font-black text-[10px]">
                    {room.botVotes.length}/{Math.ceil(room.players.filter((p) => p.isHuman).length / 2)}
                  </span>
                )}
              </button>
            )}
          </div>
        )}

        {/* Footer: Quit Button */}
        <div className="flex justify-end pt-1">
          <button
            type="button"
            onClick={onLeaveRoom}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-950/30 hover:bg-rose-900/50 text-xs font-bold text-rose-300 border border-rose-800/40 transition"
          >
            <LogOut className="w-3.5 h-3.5 text-rose-400" />
            <span>Quitter le Salon</span>
          </button>
        </div>
      </div>
    </div>
  );
};
