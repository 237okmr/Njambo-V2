import React, { useState } from 'react';
import { GameSpeed, Player } from '../types';
import {
  Volume2,
  VolumeX,
  BookOpen,
  RotateCcw,
  Wrench,
  Coins,
  ChevronDown,
  ChevronUp,
  FolderOpen,
  LogOut,
  Zap,
  SlidersHorizontal,
  X,
  User,
  Skull,
  Globe,
  Users,
  Home,
  Smartphone,
  Gauge,
  Music,
  PlaySquare,
} from 'lucide-react';

interface ScoreboardProps {
  players: Player[];
  pot: number;
  baseBet: number;
  enableDoubleKora?: boolean;
  enableUnder21?: boolean;
  dealerIndex: number;
  leadIndex: number;
  currentTrickNumber: number;
  partieCount: number;
  onOpenRules: () => void;
  onOpenTests: () => void;
  onResetSession: () => void;
  onOpenSetup?: () => void;
  onOpenSavedSessions?: () => void;
  onQuitManche?: () => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
  gameSpeed?: GameSpeed;
  onToggleGameSpeed?: () => void;
  ambienceEnabled?: boolean;
  onToggleAmbience?: () => void;
  autoPlaySingleCard?: boolean;
  onToggleAutoPlay?: () => void;
  onOpenHome?: () => void;
  onOpenInstallModal?: () => void;
  isMultiplayer?: boolean;
  roomCode?: string | null;
  onOpenMultiplayerHub?: () => void;
  onOpenMultiplayerLobby?: () => void;
  onLeaveMultiplayer?: () => void;
}

export const Scoreboard: React.FC<ScoreboardProps> = ({
  players,
  pot,
  baseBet,
  enableDoubleKora = true,
  enableUnder21 = true,
  dealerIndex,
  leadIndex,
  currentTrickNumber,
  partieCount,
  onOpenRules,
  onOpenTests,
  onResetSession,
  onOpenSetup,
  onOpenSavedSessions,
  onQuitManche,
  soundEnabled,
  onToggleSound,
  gameSpeed = 1,
  onToggleGameSpeed,
  ambienceEnabled = false,
  onToggleAmbience,
  autoPlaySingleCard = true,
  onToggleAutoPlay,
  onOpenHome,
  onOpenInstallModal,
  isMultiplayer = false,
  roomCode = null,
  onOpenMultiplayerHub,
  onOpenMultiplayerLobby,
  onLeaveMultiplayer,
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const activePlayers = players.filter((p) => !p.isEliminated);
  const isDecisiveTrick = currentTrickNumber === 5;

  return (
    <header
      id="main-scoreboard"
      className="sticky top-0 z-40 bg-slate-950/90 backdrop-blur-md border-b border-slate-800/80 shadow-md transition-all"
    >
      {/* Sleek, streamlined main bar */}
      <div className="max-w-5xl mx-auto px-2 sm:px-4 py-1.5 flex items-center justify-between gap-1.5 sm:gap-3">
        {/* Left: Brand Identity & Round status */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Clickable NJAMBO Logo with Home Icon */}
          {onOpenHome ? (
            <button
              type="button"
              id="btn-header-home-logo"
              onClick={onOpenHome}
              className="group flex items-center gap-1.5 px-2 py-1 -ml-1 rounded-xl bg-slate-900/60 hover:bg-amber-500/15 active:scale-95 border border-slate-800/80 hover:border-amber-500/40 transition cursor-pointer shadow-sm"
              title="Retourner à l'accueil (partie en pause)"
            >
              <div className="w-5 h-5 rounded-md bg-amber-500/20 group-hover:bg-amber-500/30 flex items-center justify-center text-amber-400 group-hover:text-amber-300 transition-colors">
                <Home className="w-3.5 h-3.5" />
              </div>
              <span className="text-sm sm:text-base font-black tracking-wider bg-gradient-to-r from-amber-300 via-amber-400 to-amber-200 bg-clip-text text-transparent group-hover:from-amber-200 group-hover:to-amber-400 select-none">
                NJAMBO
              </span>
            </button>
          ) : (
            <div className="flex items-center gap-1">
              <span className="text-sm sm:text-base font-black tracking-wider bg-gradient-to-r from-amber-300 via-amber-400 to-amber-200 bg-clip-text text-transparent select-none">
                NJAMBO
              </span>
            </div>
          )}

          <span
            className={`text-[10px] sm:text-[11px] font-bold px-1.5 py-0.5 rounded-full border shrink-0 whitespace-nowrap ${
              isDecisiveTrick
                ? 'bg-amber-500/20 text-amber-300 border-amber-400/50 animate-pulse font-extrabold'
                : 'bg-slate-900/90 text-amber-300/90 border-slate-800'
            }`}
          >
            {isDecisiveTrick ? (
              <span>Tour 5/5 <span className="hidden xs:inline">DÉCISIF</span> 🔥</span>
            ) : (
              <span>Partie {partieCount} · Tour {currentTrickNumber}/5</span>
            )}
          </span>

          {/* Mode Indicator / Button */}
          {isMultiplayer ? (
            <button
              type="button"
              onClick={onOpenMultiplayerLobby}
              className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-950/80 text-emerald-300 border border-emerald-500/50 text-[10px] sm:text-[11px] font-bold hover:bg-emerald-900/80 transition"
              title="Afficher le salon multijoueur"
            >
              <Globe className="w-3 h-3 text-emerald-400 animate-spin-slow" />
              <span>Salon {roomCode}</span>
            </button>
          ) : (
            onOpenMultiplayerHub && (
              <button
                type="button"
                onClick={onOpenMultiplayerHub}
                className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-900 hover:bg-amber-950/40 text-slate-300 hover:text-amber-300 border border-slate-800 hover:border-amber-500/50 text-[10px] sm:text-[11px] font-bold transition shadow-sm"
                title="Jouer en ligne avec de vrais joueurs"
              >
                <Globe className="w-3 h-3 text-amber-400" />
                <span className="hidden xs:inline">Mode</span> En Ligne
              </button>
            )
          )}

          {/* Desktop Rule Badges */}
          <div className="hidden lg:flex items-center gap-1.5">
            <span className="text-[10px] font-medium text-slate-400 bg-slate-900/70 border border-slate-800 px-2 py-0.5 rounded-full">
              Mise: {baseBet} jetons
            </span>
            {enableUnder21 && (
              <span className="text-[10px] font-bold text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 px-2 py-0.5 rounded-full">
                ≤21
              </span>
            )}
            {enableDoubleKora && (
              <span className="text-[10px] font-bold text-purple-300 bg-purple-950/40 border border-purple-800/40 px-2 py-0.5 rounded-full flex items-center gap-0.5">
                <Zap className="w-2.5 h-2.5 text-yellow-300 fill-yellow-300" />
                x4
              </span>
            )}
          </div>
        </div>


        {/* Center: Sleek Pot Badge */}
        <div
          id="pot-indicator"
          className="flex items-center gap-1 sm:gap-1.5 bg-gradient-to-b from-amber-500/15 to-amber-950/30 border border-amber-500/30 px-2.5 py-0.5 sm:py-1 rounded-full text-xs font-bold text-amber-300 shadow-sm shrink-0"
        >
          <Coins className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span className="text-[10px] uppercase font-bold text-amber-400/80 tracking-wider">Pot</span>
          <span className="font-mono text-xs sm:text-sm font-black text-amber-300">{pot}</span>
          <span className="text-[10px] text-amber-300/70 font-normal">jetons</span>
        </div>

        {/* Right: Quick Tools & Menu Toggle */}
        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          {/* Speed Toggle */}
          {onToggleGameSpeed && (
            <button
              type="button"
              id="btn-game-speed-toggle"
              onClick={onToggleGameSpeed}
              aria-label={`Vitesse de jeu actuelle ${gameSpeed}x`}
              className="px-2 py-1 rounded-lg bg-slate-900/90 hover:bg-slate-800 text-amber-300 hover:text-amber-200 border border-slate-800/80 hover:border-amber-500/40 transition flex items-center gap-1 text-xs font-black shrink-0 active:scale-95 cursor-pointer"
              title={`Vitesse du jeu (actuellement ${gameSpeed}x)`}
            >
              <Zap className="w-3 h-3 text-amber-400 fill-amber-400" />
              <span>{gameSpeed}x</span>
            </button>
          )}

          {/* Sound Toggle */}
          <button
            type="button"
            onClick={onToggleSound}
            aria-label={soundEnabled ? 'Couper le son' : 'Activer le son'}
            className="p-1.5 rounded-lg bg-slate-900/90 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800/80 transition flex items-center justify-center shrink-0"
            title={soundEnabled ? 'Son activé' : 'Son désactivé'}
          >
            {soundEnabled ? (
              <Volume2 className="w-3.5 h-3.5 text-amber-400" />
            ) : (
              <VolumeX className="w-3.5 h-3.5 text-slate-500" />
            )}
          </button>

          {/* Quick Rules button on tablet/desktop */}
          <button
            type="button"
            onClick={onOpenRules}
            className="hidden xs:flex p-1.5 rounded-lg bg-slate-900/90 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800/80 transition items-center justify-center shrink-0"
            title="Règles du jeu"
          >
            <BookOpen className="w-3.5 h-3.5" />
          </button>

          {/* Streamlined Menu / Capitaux Toggle */}
          <button
            id="btn-header-menu-toggle"
            type="button"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold border transition shrink-0 ${
              isMenuOpen
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                : 'bg-slate-900/90 hover:bg-slate-800 text-slate-200 border-slate-800/80'
            }`}
            aria-expanded={isMenuOpen}
            aria-label="Ouvrir le menu et les capitaux"
          >
            <SlidersHorizontal className="w-3 h-3 text-amber-400" />
            <span className="hidden sm:inline">Menu</span>
            {isMenuOpen ? (
              <ChevronUp className="w-3 h-3 text-amber-400" />
            ) : (
              <ChevronDown className="w-3 h-3 text-slate-400" />
            )}
          </button>
        </div>
      </div>

      {/* Streamlined Dropdown / Action Drawer */}
      {isMenuOpen && (
        <div className="border-t border-slate-800/90 bg-slate-950/98 px-3 py-3 max-w-5xl mx-auto animate-in slide-in-from-top-1 duration-150 shadow-2xl">
          {/* Header row in drawer */}
          <div className="flex items-center justify-between pb-2 border-b border-slate-800/60 mb-2.5">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                Tableau des Capitaux
              </span>
              <span className="text-[10px] text-slate-500">
                ({activePlayers.length} en jeu · Mise {baseBet} jetons)
              </span>
            </div>
            <button
              type="button"
              onClick={() => setIsMenuOpen(false)}
              className="text-slate-400 hover:text-white p-1 rounded-md hover:bg-slate-800 text-xs flex items-center gap-1 transition"
            >
              <X className="w-3.5 h-3.5" />
              <span className="text-[11px]">Fermer</span>
            </button>
          </div>

          {/* Quick Dynamic Settings in Drawer */}
          <div className="flex flex-wrap items-center gap-2 pb-2.5 mb-2.5 border-b border-slate-800/60 text-xs">
            {onToggleGameSpeed && (
              <button
                type="button"
                onClick={onToggleGameSpeed}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 font-medium transition cursor-pointer"
              >
                <Gauge className="w-3.5 h-3.5 text-amber-400" />
                <span>Vitesse : <strong className="text-amber-300">{gameSpeed}x</strong></span>
              </button>
            )}

            {onToggleAmbience && (
              <button
                type="button"
                onClick={onToggleAmbience}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border font-medium transition cursor-pointer ${
                  ambienceEnabled
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                    : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-800'
                }`}
              >
                <Music className="w-3.5 h-3.5 text-amber-400" />
                <span>Ambiance Salon : <strong>{ambienceEnabled ? 'ON' : 'OFF'}</strong></span>
              </button>
            )}

            {onToggleAutoPlay && (
              <button
                type="button"
                onClick={onToggleAutoPlay}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border font-medium transition cursor-pointer ${
                  autoPlaySingleCard
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                    : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-800'
                }`}
              >
                <PlaySquare className="w-3.5 h-3.5 text-emerald-400" />
                <span>Auto-jouer coup forcé : <strong>{autoPlaySingleCard ? 'ON' : 'OFF'}</strong></span>
              </button>
            )}
          </div>

          {/* Players Capital Cards Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
            {(players || []).map((player, idx) => {
              const isDealer = idx === dealerIndex;
              const isLead = idx === leadIndex;
              const isEliminated = player.isEliminated;

              return (
                <div
                  key={player.id}
                  className={`p-2 rounded-xl border text-xs flex flex-col justify-between transition-all ${
                    isEliminated
                      ? 'bg-rose-950/20 border-rose-900/40 text-rose-300/80 opacity-60'
                      : player.isHuman
                      ? 'bg-amber-950/25 border-amber-500/40 text-amber-100 shadow-sm'
                      : 'bg-slate-900/90 border-slate-800 text-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <div className="flex items-center gap-1 truncate min-w-0 flex-1">
                      {player.isHuman ? (
                        <User className="w-3 h-3 text-amber-400 shrink-0" />
                      ) : null}
                      <span className="font-bold truncate text-[11px]">
                        {player.isHuman
                          ? player.name.includes('Vous')
                            ? 'Vous'
                            : player.name
                          : player.name.replace(/^Joueur\s+/i, '')}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {isEliminated ? (
                        <span className="text-[9px] px-1 py-0.2 rounded bg-rose-950 text-rose-300 font-bold border border-rose-800/80 flex items-center gap-0.5">
                          <Skull className="w-2.5 h-2.5" /> Éliminé
                        </span>
                      ) : (
                        <>
                          {isDealer && (
                            <span className="text-[9px] px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30">
                              D
                            </span>
                          )}
                          {isLead && (
                            <span className="text-[9px] px-1 py-0.2 rounded bg-blue-500/20 text-blue-300 font-bold border border-blue-500/30">
                              E
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  <div className="mt-1.5 flex items-baseline justify-between gap-1">
                    <span className="text-[10px] text-slate-400 shrink-0">Capital :</span>
                    <span
                      className={`font-mono text-xs sm:text-sm font-black truncate text-right ${
                        isEliminated ? 'text-rose-400 line-through' : 'text-amber-300'
                      }`}
                    >
                      {player.capital} <span className="text-[9px] sm:text-[10px] font-normal text-slate-400">jetons</span>
                    </span>
                  </div>

                  {!isEliminated && (
                    <div className="mt-0.5 text-[9px] text-slate-400 flex justify-between border-t border-slate-800/60 pt-1">
                      <span>Tours remportés :</span>
                      <span className="font-semibold text-slate-200">
                        {player.tricksWonInRound} / 5
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Action Toolbar Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:flex md:flex-wrap items-center justify-end gap-1.5 pt-2 border-t border-slate-800/80">
            {/* Accueil / Menu Principal */}
            {onOpenHome && (
              <button
                type="button"
                onClick={() => {
                  setIsMenuOpen(false);
                  onOpenHome();
                }}
                className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-xs font-semibold text-amber-300 border border-amber-500/30 transition cursor-pointer"
                title="Retourner à l'accueil"
              >
                <Home className="w-3.5 h-3.5 text-amber-400" />
                <span>Accueil</span>
              </button>
            )}

            {/* Rules (always available in drawer) */}
            <button
              type="button"
              onClick={() => {
                setIsMenuOpen(false);
                onOpenRules();
              }}
              className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-xs font-semibold text-slate-200 border border-slate-800 transition"
            >
              <BookOpen className="w-3.5 h-3.5 text-amber-400" />
              <span>Règles</span>
            </button>

            {/* Multiplayer Hub / Lobby Button in drawer */}
            {isMultiplayer ? (
              <>
                {onOpenMultiplayerLobby && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsMenuOpen(false);
                      onOpenMultiplayerLobby();
                    }}
                    className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-950/40 hover:bg-emerald-900/60 text-xs font-semibold text-emerald-300 border border-emerald-700/50 transition"
                  >
                    <Globe className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Salon {roomCode}</span>
                  </button>
                )}
                {onLeaveMultiplayer && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsMenuOpen(false);
                      onLeaveMultiplayer();
                    }}
                    className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-rose-950/30 hover:bg-rose-900/50 text-xs font-semibold text-rose-300 border border-rose-800/40 transition"
                  >
                    <LogOut className="w-3.5 h-3.5 text-rose-400" />
                    <span>Quitter En Ligne</span>
                  </button>
                )}
              </>
            ) : (
              onOpenMultiplayerHub && (
                <button
                  type="button"
                  onClick={() => {
                    setIsMenuOpen(false);
                    onOpenMultiplayerHub();
                  }}
                  className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-950/40 hover:bg-emerald-900/60 text-xs font-semibold text-emerald-300 border border-emerald-700/50 transition"
                >
                  <Globe className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Mode En Ligne</span>
                </button>
              )
            )}


            {/* Saved Sessions */}
            {onOpenSavedSessions && (
              <button
                type="button"
                onClick={() => {
                  setIsMenuOpen(false);
                  onOpenSavedSessions();
                }}
                className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-950/30 hover:bg-amber-900/50 text-xs font-semibold text-amber-300 border border-amber-800/40 transition"
                title="Gérer ou charger des Manches enregistrées"
              >
                <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
                <span>Mes Manches</span>
              </button>
            )}

            {/* Setup / Config */}
            {onOpenSetup && (
              <button
                type="button"
                onClick={() => {
                  setIsMenuOpen(false);
                  onOpenSetup();
                }}
                className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-xs font-semibold text-slate-200 border border-slate-800 transition"
                title="Changer le nombre de joueurs ou la mise"
              >
                <SlidersHorizontal className="w-3.5 h-3.5 text-blue-400" />
                <span>Paramètres</span>
              </button>
            )}

            {/* Install App on Android */}
            {onOpenInstallModal && (
              <button
                type="button"
                onClick={() => {
                  setIsMenuOpen(false);
                  onOpenInstallModal();
                }}
                className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-xs font-bold text-amber-300 border border-amber-500/40 transition cursor-pointer"
                title="Installer l'application sur votre téléphone Android"
              >
                <Smartphone className="w-3.5 h-3.5 text-amber-400" />
                <span>Installer App</span>
              </button>
            )}

            {/* Tests / Cheats */}
            <button
              type="button"
              onClick={() => {
                setIsMenuOpen(false);
                onOpenTests();
              }}
              className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-xs font-semibold text-slate-400 hover:text-slate-200 border border-slate-800 transition"
            >
              <Wrench className="w-3.5 h-3.5 text-blue-400" />
              <span>Tests</span>
            </button>

            {/* Quit Manche */}
            {onQuitManche && (
              <button
                type="button"
                onClick={() => {
                  setIsMenuOpen(false);
                  onQuitManche();
                }}
                className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-rose-950/30 hover:bg-rose-900/50 text-xs font-semibold text-rose-300 border border-rose-800/40 transition"
                title="Quitter la Manche en cours"
              >
                <LogOut className="w-3.5 h-3.5 text-rose-400" />
                <span>Quitter</span>
              </button>
            )}

            {/* New Manche Reset */}
            <button
              type="button"
              onClick={() => {
                setIsMenuOpen(false);
                onResetSession();
              }}
              className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-rose-950/40 hover:bg-rose-900/60 text-xs font-semibold text-rose-200 border border-rose-700/50 transition"
            >
              <RotateCcw className="w-3.5 h-3.5 text-rose-400" />
              <span>Nouvelle Manche</span>
            </button>
          </div>
        </div>
      )}
    </header>
  );
};

