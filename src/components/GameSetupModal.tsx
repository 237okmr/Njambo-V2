import React, { useState, useEffect } from 'react';
import {
  Users,
  Coins,
  Sparkles,
  ArrowLeft,  Play,
  RotateCcw,
  Save,
  AlertTriangle,
  Zap,
  Eye,
  Crown,
  Check,
  Brain,
  Cloud,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { AIDifficulty, AI_DIFFICULTIES_INFO, SoloBetIncreaseMode } from '../types';
import { sounds, triggerHaptic } from '../utils/sound';
import { NativeScreenHeader } from './common/NativeScreenHeader';
import { NativeSegmentedNav, SegmentTab } from './common/NativeSegmentedNav';
import { usePlayerProfile } from '../context/PlayerProfileContext';
import { useBackLayer } from '../hooks/useBackLayer';

export type SoloSetupTabType = 'partie' | 'rules';

export interface GameSetupModalProps {
  isOpen: boolean;
  initialTab?: SoloSetupTabType;
  soundEnabled?: boolean;
  onToggleSound?: () => void;
  currentOpponentCount: number; // 1, 2, or 3
  previousOpponentCount: number | null;
  currentBaseBet?: number;
  currentInitialCapital?: number;
  currentEnableDoubleKora?: boolean;
  currentEnableUnder21?: boolean;
  currentAiDifficulty?: AIDifficulty;
  currentShowBotPersonalityIcons?: boolean;
  currentEnableKoraHunterAlerts?: boolean;
  currentSoloBetIncreaseMode?: SoloBetIncreaseMode;
  isMancheInProgress?: boolean;
  currentPartieCount?: number;
  activePlayersCount?: number;
  onStartGame: (
    opponentCount: number,
    baseBet: number,
    initialCapital : number,
    enableDoubleKora: boolean,
    enableUnder21: boolean,
    showBotPersonalityIcons: boolean,
    enableKoraHunterAlerts: boolean,
    difficulty: AIDifficulty,
    soloBetIncreaseMode: SoloBetIncreaseMode
  ) => void;
  onSaveAndStartNewGame?: (
    opponentCount: number,
    baseBet: number,
    initialCapital : number,
    enableDoubleKora: boolean,
    enableUnder21: boolean,
    showBotPersonalityIcons: boolean,
    enableKoraHunterAlerts: boolean,
    difficulty: AIDifficulty,
    soloBetIncreaseMode: SoloBetIncreaseMode
  ) => void;
  onContinueManche?: (
    enableDoubleKora: boolean,
    enableUnder21: boolean,
    baseBet: number,
    showBotPersonalityIcons: boolean,
    enableKoraHunterAlerts: boolean,
    difficulty: AIDifficulty,
    soloBetIncreaseMode: SoloBetIncreaseMode
  ) => void;
  onClose: () => void;
  isInitialSetup?: boolean;
}

export const GameSetupModal: React.FC<GameSetupModalProps> = ({
  isOpen,
  soundEnabled = true,
  onToggleSound,
  currentOpponentCount,
  currentBaseBet = 10,
  currentInitialCapital = 100,
  currentEnableDoubleKora = true,
  currentEnableUnder21 = true,
  currentAiDifficulty = 'NORMAL',
  currentShowBotPersonalityIcons = true,
  currentEnableKoraHunterAlerts = true,
  currentSoloBetIncreaseMode = 'souverain',
  isMancheInProgress = false,
  currentPartieCount = 1,
  activePlayersCount = 4,
  onStartGame,
  onSaveAndStartNewGame,
  onContinueManche,
  onClose,
}) => {
  // Always open Tab 1 ("partie") by default for instant launch
  const [activeTab, setActiveTab] = useState<SoloSetupTabType>('partie');

  // Form states
  const [selectedCount, setSelectedCount] = useState<number>(currentOpponentCount || 3);
  const [selectedBet, setSelectedBet] = useState<number>(currentBaseBet || 10);
  const [selectedCapital, setSelectedCapital] = useState<number>(currentInitialCapital || 100);
  const [selectedDifficulty, setSelectedDifficulty] = useState<AIDifficulty>(currentAiDifficulty || 'NORMAL');
  const [soloBetIncreaseMode, setSoloBetIncreaseMode] = useState<SoloBetIncreaseMode>(
    currentSoloBetIncreaseMode ||
      (localStorage.getItem('njambo_solo_bet_increase_mode') as SoloBetIncreaseMode) ||
      'souverain'
  );
  const [enableDoubleKora, setEnableDoubleKora] = useState<boolean>(currentEnableDoubleKora);
  const [enableUnder21, setEnableUnder21] = useState<boolean>(currentEnableUnder21);
  const [showBotPersonalityIcons, setShowBotPersonalityIcons] = useState<boolean>(currentShowBotPersonalityIcons);
  const [enableKoraHunterAlerts, setEnableKoraHunterAlerts] = useState<boolean>(currentEnableKoraHunterAlerts);
  const [showConfirmReset, setShowConfirmReset] = useState<boolean>(false);
  const [authSuccessMsg, setAuthSuccessMsg] = useState<string | null>(null);

  // Player profile & Google Auth
  const { profile, isLoggedIn } = usePlayerProfile();


  // Systematic reset to Tab 1 ('partie') on open
  useEffect(() => {
    if (isOpen) {
      setActiveTab('partie');
      setSelectedCount(currentOpponentCount || 3);
      setSelectedBet(currentBaseBet || 10);
      setSelectedCapital(currentInitialCapital || 100);
      setSelectedDifficulty(currentAiDifficulty || 'NORMAL');
      setSoloBetIncreaseMode(
        currentSoloBetIncreaseMode ||
          (localStorage.getItem('njambo_solo_bet_increase_mode') as SoloBetIncreaseMode) ||
          'souverain'
      );
      setEnableDoubleKora(currentEnableDoubleKora);
      setEnableUnder21(currentEnableUnder21);
      setShowBotPersonalityIcons(currentShowBotPersonalityIcons);
      setEnableKoraHunterAlerts(currentEnableKoraHunterAlerts);
      setShowConfirmReset(false);
    }
  }, [
    isOpen,
    currentOpponentCount,
    currentBaseBet,
    currentInitialCapital,
    currentAiDifficulty,
    currentSoloBetIncreaseMode,
    currentEnableDoubleKora,
    currentEnableUnder21,
    currentShowBotPersonalityIcons,
    currentEnableKoraHunterAlerts,
  ]);

  // Escape key handling (le bouton Retour est géré dans App.tsx)
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  useBackLayer(isOpen && showConfirmReset, () => setShowConfirmReset(false));

  if (!isOpen) return null;

  const handleBackClick = () => {
    onClose();
  };

  const handleTabChange = (tab: SoloSetupTabType) => {
    setActiveTab(tab);
    triggerHaptic('light');
    sounds.playCardSelect();
  };

  const handleDifficultyChange = (diff: AIDifficulty) => {
    setSelectedDifficulty(diff);
    triggerHaptic('light');
    sounds.playCardSelect();
  };

  const handleTriggerNewManche = () => {
    sounds.playShuffle();
    triggerHaptic('medium');
    if (isMancheInProgress) {
      setShowConfirmReset(true);
    } else {
      onStartGame(
        selectedCount,
        selectedBet,
        selectedCapital,
        enableDoubleKora,
        enableUnder21,
        showBotPersonalityIcons,
        enableKoraHunterAlerts,
        selectedDifficulty,
        soloBetIncreaseMode
      );
    }
  };

  const handleConfirmSaveAndStart = () => {
    sounds.playRoundVictory();
    triggerHaptic('success');
    setShowConfirmReset(false);
    if (onSaveAndStartNewGame) {
      onSaveAndStartNewGame(
        selectedCount,
        selectedBet,
        selectedCapital,
        enableDoubleKora,
        enableUnder21,
        showBotPersonalityIcons,
        enableKoraHunterAlerts,
        selectedDifficulty,
        soloBetIncreaseMode
      );
    } else {
      onStartGame(
        selectedCount,
        selectedBet,
        selectedCapital,
        enableDoubleKora,
        enableUnder21,
        showBotPersonalityIcons,
        enableKoraHunterAlerts,
        selectedDifficulty,
        soloBetIncreaseMode
      );
    }
  };

  const handleConfirmStartWithoutSave = () => {
    sounds.playShuffle();
    triggerHaptic('medium');
    setShowConfirmReset(false);
    onStartGame(
      selectedCount,
      selectedBet,
      selectedCapital,
      enableDoubleKora,
      enableUnder21,
      showBotPersonalityIcons,
      enableKoraHunterAlerts,
      selectedDifficulty,
      soloBetIncreaseMode
    );
  };

  const opponentOptions = [
    {
      count: 1,
      seats: 2,
      label: '2 joueurs',
      name: 'Duo',
      subtitle: '1 bot',
      summary: 'Face-à-face · 10 cartes en main',
      deckNote: '21 écartées',
    },
    {
      count: 2,
      seats: 3,
      label: '3 joueurs',
      name: 'Trio',
      subtitle: '2 bots',
      summary: 'Partie à 3 · 15 cartes en main',
      deckNote: '16 écartées',
    },
    {
      count: 3,
      seats: 4,
      label: '4 joueurs',
      name: 'Classique',
      subtitle: '3 bots',
      summary: 'Format officiel · 20 cartes en main',
      deckNote: '11 écartées',
    },
  ];

  // 4 horizontal buttons requested by the user: Facile / Normal / Expert / Grand Katika
  const difficultyOptions = [
    {
      id: 'EASY' as AIDifficulty,
      label: 'Facile',
      stars: '★☆☆☆',
      tagline: 'Jeu intuitif sans calcul poussé',
    },
    {
      id: 'NORMAL' as AIDifficulty,
      label: 'Normal',
      stars: '★★☆☆',
      tagline: 'Défense active & cartes maîtresses',
    },
    {
      id: 'EXPERT' as AIDifficulty,
      label: 'Expert',
      stars: '★★★☆',
      tagline: 'Calcul des cartes, jeu prudent',
    },
    {
      id: 'GRAND_MASTER' as AIDifficulty,
      label: 'Grand Katika',
      stars: '★★★★',
      tagline: 'Chasseur de Kora, pots à haut risque',
    },
  ];

  const capitalOptions = [50, 100, 200, 500];
  const betOptions = [5, 10, 20, 50];

  const isSamePlayerCount = selectedCount === currentOpponentCount;
  const canContinueCurrentManche = isMancheInProgress && isSamePlayerCount && Boolean(onContinueManche);

  // Economy calculations
  const totalPlayers = selectedCount + 1;
  const regularTrickPot = selectedBet * totalPlayers;
  const koraPot = selectedBet * totalPlayers * 2;

  // The 2 requested tabs: "Partie" and "Règles et options"
  const tabsConfig: SegmentTab<SoloSetupTabType>[] = [
    {
      id: 'partie',
      label: 'Partie',
      shortLabel: 'Partie',
      icon: Users,
    },
    {
      id: 'rules',
      label: 'Règles et options',
      shortLabel: 'Règles et options',
      icon: Sparkles,
    },
  ];

  return (
    <div
      id="solo-game-setup-screen"
      className="fixed inset-0 z-[70] bg-slate-950 text-slate-100 flex flex-col font-sans select-none overflow-hidden animate-in fade-in duration-200 comfort-ui"
    >
      {/* Ambient background glows */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-3xl h-48 bg-gradient-to-b from-amber-500/10 via-emerald-500/5 to-transparent blur-3xl pointer-events-none" />

      {/* 1. TOP UNIFIED NATIVE APP BAR */}
      <NativeScreenHeader
        id="native-setup-header"
        backLabel="Retour"
        onBack={handleBackClick}
        backTitle={isMancheInProgress ? 'Revenir à la manche en cours' : 'Retourner au menu'}
        title="Partie solo"
        onToggleSound={onToggleSound}
        soundEnabled={soundEnabled}
        contextBadge={
          isMancheInProgress ? (
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-semibold truncate">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
              <span className="truncate">Partie {currentPartieCount} en cours</span>
            </div>
          ) : (
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-800/80 border border-slate-700/80 text-slate-300 text-xs font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
              <span>Partie solo</span>
            </div>
          )
        }
        rightActions={
          <div className="flex items-center gap-2">
            {isLoggedIn && (
              <div
                className="h-8 px-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-bold flex items-center gap-1.5 shadow-sm shrink-0"
                title={`Connecté avec Google (${profile.displayName})`}
              >
                <Cloud className="w-3.5 h-3.5 text-emerald-400" />
                <span className="hidden sm:inline">Sauvegardé</span>
              </div>
            )}
          </div>
        }
      />

      {/* 2. FIXED 2-TAB SEGMENTED NAVIGATION */}
      <NativeSegmentedNav
        tabs={tabsConfig}
        activeTab={activeTab}
        onChange={handleTabChange}
        ariaLabel="Navigation de configuration de la table"
      />

      {/* 3. MAIN COMPACT CONTENT BODY (ZERO SCROLL BY DESIGN) */}
      <main className="flex-1 overflow-y-auto custom-dark-scrollbar px-3 py-2 sm:py-3 max-w-2xl mx-auto w-full flex flex-col justify-start gap-2.5">
        {/* Feedback Google Auth */}
        {authSuccessMsg && (
          <div className="p-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-bold flex items-center gap-2 shadow-sm shrink-0">
            <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>{authSuccessMsg}</span>
          </div>
        )}

        {/* Ultra-compact banner if Manche in progress */}
        {isMancheInProgress && (
          <div className="rounded-xl bg-amber-950/40 border border-amber-500/30 px-3 py-1.5 flex items-center justify-between gap-2 shadow-sm shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
              <span className="text-xs font-bold text-amber-300 truncate">
                Partie {currentPartieCount} en cours ({activePlayersCount} joueurs qualifiés)
              </span>
            </div>
            {canContinueCurrentManche && (
              <button
                type="button"
                onClick={() =>
                  onContinueManche &&
                  onContinueManche(
                    enableDoubleKora,
                    enableUnder21,
                    selectedBet,
                    showBotPersonalityIcons,
                    enableKoraHunterAlerts,
                    selectedDifficulty,
                    soloBetIncreaseMode
                  )
                }
                className="py-1 px-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs flex items-center gap-1 shrink-0 cursor-pointer active:scale-95 transition"
              >
                <Play className="w-3 h-3 fill-slate-950" />
                <span>Reprendre</span>
              </button>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* ONGLET 1 : PARTIE (Format, Enjeux, Difficulté IA)                         */}
        {/* ========================================================================= */}
        {activeTab === 'partie' && (
          <div className="flex flex-col gap-2.5 animate-in fade-in duration-150">
            {/* 1.1 Format des sièges : 3 boutons horizontaux */}
            <section className="p-3 rounded-2xl bg-[#0d121c]/90 border border-white/[0.07] flex flex-col gap-1.5 shadow-sm">
              <div className="flex items-center justify-between px-0.5">
                <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-400">
                  <Users className="w-3.5 h-3.5 text-amber-400" />
                  <span>Format de la table</span>
                </div>
                <span className="text-xs font-semibold text-amber-300 font-mono">
                  {selectedCount + 1} Joueurs au total
                </span>
              </div>

              <div
                role="radiogroup"
                aria-label="Format des sièges"
                className="grid grid-cols-3 p-1 rounded-xl bg-slate-950/90 border border-white/10 shadow-inner gap-1"
              >
                {opponentOptions.map((opt) => {
                  const isSelected = selectedCount === opt.count;
                  return (
                    <button
                      key={opt.count}
                      type="button"
                      id={`btn-table-format-${opt.seats}p`}
                      role="radio"
                      aria-checked={isSelected}
                      onClick={() => {
                        setSelectedCount(opt.count);
                        triggerHaptic('light');
                        sounds.playCardSelect();
                      }}
                      className={`py-1.5 sm:py-2 px-1 rounded-lg text-center transition-all duration-150 cursor-pointer flex flex-col items-center justify-center ${
                        isSelected
                          ? 'bg-amber-400 text-slate-950 font-black shadow-md shadow-amber-500/20'
                          : 'text-slate-300 hover:text-white hover:bg-white/[0.04]'
                      }`}
                    >
                      <span className="text-xs sm:text-sm font-black tracking-tight leading-tight">
                        {opt.label}
                      </span>
                      <span
                        className={`text-xs font-semibold tracking-tight ${
                          isSelected ? 'text-slate-950/80 font-bold' : 'text-slate-400'
                        }`}
                      >
                        {opt.subtitle} · {opt.deckNote}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* 1.2 Mises et capital : Mise par Donne & Capital Initial */}
            <section className="p-3 rounded-2xl bg-[#0d121c]/90 border border-white/[0.07] flex flex-col gap-2 shadow-sm">
              <div className="flex items-center justify-between border-b border-white/[0.06] pb-1 px-0.5">
                <span className="text-xs font-black text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Coins className="w-3.5 h-3.5 text-amber-400" />
                  <span>Mises et capital</span>
                </span>
                <span className="text-xs font-mono text-slate-400">
                  Autonomie : <strong className="text-amber-300 font-bold">{Math.round(selectedCapital / selectedBet)}</strong> parties
                </span>
              </div>

              {/* Ligne 1 : Mise par Donne */}
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-xs px-0.5">
                  <span className="text-slate-300 font-medium">Mise par partie</span>
                  <span className="text-amber-300 font-bold font-mono text-xs">
                    {selectedBet} jetons / joueur
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {betOptions.map((val) => (
                    <button
                      key={val}
                      type="button"
                      id={`btn-bet-${val}`}
                      onClick={() => {
                        setSelectedBet(val);
                        triggerHaptic('light');
                        sounds.playCoinCascade();
                      }}
                      className={`py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer border ${
                        selectedBet === val
                          ? 'bg-amber-400 text-slate-950 border-amber-300 shadow-md'
                          : 'bg-white/[0.03] hover:bg-white/[0.06] border-white/[0.06] text-slate-300'
                      }`}
                    >
                      {val} jetons
                    </button>
                  ))}
                </div>
              </div>

              {/* Ligne 2 : Capital Initial */}
              <div className="flex flex-col gap-1 pt-1 border-t border-white/[0.04]">
                <div className="flex items-center justify-between text-xs px-0.5">
                  <span className="text-slate-300 font-medium">Capital de départ</span>
                  <span className="text-amber-300 font-bold font-mono text-xs">
                    {selectedCapital} jetons
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {capitalOptions.map((val) => (
                    <button
                      key={val}
                      type="button"
                      id={`btn-capital-${val}`}
                      onClick={() => {
                        setSelectedCapital(val);
                        triggerHaptic('light');
                        sounds.playCoinCascade();
                      }}
                      className={`py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer border ${
                        selectedCapital === val
                          ? 'bg-amber-400 text-slate-950 border-amber-300 shadow-md'
                          : 'bg-white/[0.03] hover:bg-white/[0.06] border-white/[0.06] text-slate-300'
                      }`}
                    >
                      {val} jetons
                    </button>
                  ))}
                </div>
              </div>
            </section>

            {/* 1.3 Niveau des bots : 4 boutons horizontaux (Facile / Normal / Expert / Grand Katika) */}
            <section className="p-3 rounded-2xl bg-[#0d121c]/90 border border-white/[0.07] flex flex-col gap-1.5 shadow-sm">
              <div className="flex items-center justify-between px-0.5">
                <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-400">
                  <Brain className="w-3.5 h-3.5 text-amber-400" />
                  <span>Niveau des bots</span>
                </div>
                <span className="text-xs font-semibold text-amber-300 font-mono">
                  {difficultyOptions.find((d) => d.id === selectedDifficulty)?.stars}
                </span>
              </div>

              <div
                role="radiogroup"
                aria-label="Difficulté des bots"
                className="grid grid-cols-4 p-1 rounded-xl bg-slate-950/90 border border-white/10 shadow-inner gap-1"
              >
                {difficultyOptions.map((lvl) => {
                  const isSelected = selectedDifficulty === lvl.id;
                  const isGM = lvl.id === 'GRAND_MASTER';
                  return (
                    <button
                      key={lvl.id}
                      type="button"
                      id={`btn-difficulty-${lvl.id.toLowerCase()}`}
                      role="radio"
                      aria-checked={isSelected}
                      onClick={() => handleDifficultyChange(lvl.id)}
                      className={`py-1.5 sm:py-2 px-1 rounded-lg text-center transition-all duration-150 cursor-pointer flex flex-col items-center justify-center ${
                        isSelected
                          ? isGM
                            ? 'bg-slate-500 text-white font-black shadow-md shadow-slate-500/30'
                            : 'bg-amber-400 text-slate-950 font-black shadow-md shadow-amber-500/20'
                          : 'text-slate-300 hover:text-white hover:bg-white/[0.04]'
                      }`}
                    >
                      <span className="text-xs sm:text-sm font-black tracking-tight leading-tight">
                        {lvl.label}
                      </span>
                      <span
                        className={`text-xs font-semibold tracking-tight ${
                          isSelected
                            ? isGM
                              ? 'text-slate-100 font-bold'
                              : 'text-slate-950/80 font-bold'
                            : 'text-slate-400'
                        }`}
                      >
                        {lvl.stars}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center justify-between text-xs text-slate-400 px-1">
                <span className="truncate mr-2">
                  {difficultyOptions.find((d) => d.id === selectedDifficulty)?.tagline}
                </span>
                <span className="text-slate-500 font-mono text-xs shrink-0">
                  {AI_DIFFICULTIES_INFO[selectedDifficulty]?.name}
                </span>
              </div>
            </section>
          </div>
        )}

        {/* ========================================================================= */}
        {/* ONGLET 2 : RÈGLES & OPTIONS (Hausse des Mises & Variantes)                 */}
        {/* ========================================================================= */}
        {activeTab === 'rules' && (
          <div className="flex flex-col gap-2.5 animate-in fade-in duration-150">
            {/* 2.1 Hausse des mises (solo) */}
            <section className="p-3 rounded-2xl bg-[#0d121c]/90 border border-white/[0.07] flex flex-col gap-1.5 shadow-sm">
              <div className="flex flex-col gap-0.5 px-0.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-400">
                    <Zap className="w-3.5 h-3.5 text-amber-400" />
                    <span>Hausse des mises (solo)</span>
                  </div>
                  <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-amber-400/10 text-amber-300 border border-amber-400/20 capitalize">
                    {soloBetIncreaseMode}
                  </span>
                </div>
                <p className="text-xs text-slate-400 leading-tight">
                  {soloBetIncreaseMode === 'souverain' && 'Souverain : tu modifies la mise directement, sans vote des bots.'}
                  {soloBetIncreaseMode === 'tactique' && 'Tactique : tu proposes des hausses que les bots peuvent accepter ou refuser.'}
                  {soloBetIncreaseMode === 'symetrique' && 'Symétrique : toi et les bots pouvez initier des hausses (vote unanime requis).'}
                </p>
              </div>

              <div className="grid grid-cols-3 p-1 rounded-xl bg-slate-950/90 border border-white/10 shadow-inner gap-1">
                {(['souverain', 'tactique', 'symetrique'] as const).map((mode) => {
                  const isSelected = soloBetIncreaseMode === mode;
                  const label = mode === 'souverain' ? 'Souverain' : mode === 'tactique' ? 'Tactique' : 'Symétrique';
                  return (
                    <button
                      key={mode}
                      type="button"
                      id={`btn-bet-mode-${mode}`}
                      onClick={() => {
                        setSoloBetIncreaseMode(mode);
                        localStorage.setItem('njambo_solo_bet_increase_mode', mode);
                        triggerHaptic('light');
                        sounds.playCoinCascade();
                      }}
                      className={`py-1.5 sm:py-2 px-1 rounded-lg text-xs font-bold transition-all cursor-pointer text-center ${
                        isSelected
                          ? 'bg-amber-400 text-slate-950 shadow-md shadow-amber-500/20 font-black'
                          : 'text-slate-300 hover:text-white hover:bg-white/[0.04]'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </section>

            {/* 2.2 Variantes & Options de Jeu (2x2 grid compact) */}
            <section className="p-3 rounded-2xl bg-[#0d121c]/90 border border-white/[0.07] flex flex-col gap-1.5 shadow-sm">
              <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-400 px-0.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>Variantes et assistances</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 sm:gap-2">
                {/* Double Kora */}
                <div
                  id="toggle-rule-double-kora"
                  role="switch"
                  aria-checked={enableDoubleKora}
                  onClick={() => {
                    setEnableDoubleKora(!enableDoubleKora);
                    triggerHaptic('light');
                  }}
                  className={`p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-2 ${
                    enableDoubleKora
                      ? 'bg-amber-500/10 border-amber-400/50 shadow-sm'
                      : 'bg-[#0d121c]/90 border-white/[0.07] text-slate-400 hover:border-white/15'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                        enableDoubleKora ? 'bg-amber-400 text-slate-950 font-black' : 'bg-white/[0.04] text-slate-500'
                      }`}
                    >
                      <Zap className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-white truncate leading-tight">
                        Double Kora (×4)
                      </div>
                      <div className="text-xs text-slate-400 truncate">
                        Quadruplé avec le 3
                      </div>
                    </div>
                  </div>

                  <div
                    className={`w-8 h-4.5 rounded-full p-0.5 transition-colors shrink-0 flex items-center ${
                      enableDoubleKora ? 'bg-amber-400 justify-end' : 'bg-slate-800 justify-start'
                    }`}
                  >
                    <motion.div layout className="w-3.5 h-3.5 rounded-full bg-slate-950 shadow-sm" />
                  </div>
                </div>

                {/* Moins de 21 */}
                <div
                  id="toggle-rule-under-21"
                  role="switch"
                  aria-checked={enableUnder21}
                  onClick={() => {
                    setEnableUnder21(!enableUnder21);
                    triggerHaptic('light');
                  }}
                  className={`p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-2 ${
                    enableUnder21
                      ? 'bg-emerald-500/10 border-emerald-400/50 shadow-sm'
                      : 'bg-[#0d121c]/90 border-white/[0.07] text-slate-400 hover:border-white/15'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                        enableUnder21 ? 'bg-emerald-400 text-slate-950 font-black' : 'bg-white/[0.04] text-slate-500'
                      }`}
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-white truncate leading-tight">
                        Moins de 21 (≤21)
                      </div>
                      <div className="text-xs text-slate-400 truncate">
                        Victoire instantanée
                      </div>
                    </div>
                  </div>

                  <div
                    className={`w-8 h-4.5 rounded-full p-0.5 transition-colors shrink-0 flex items-center ${
                      enableUnder21 ? 'bg-emerald-400 justify-end' : 'bg-slate-800 justify-start'
                    }`}
                  >
                    <motion.div layout className="w-3.5 h-3.5 rounded-full bg-slate-950 shadow-sm" />
                  </div>
                </div>

                {/* Profils des Adversaires */}
                <div
                  id="toggle-show-bot-personality-icons"
                  role="switch"
                  aria-checked={showBotPersonalityIcons}
                  onClick={() => {
                    const nextVal = !showBotPersonalityIcons;
                    setShowBotPersonalityIcons(nextVal);
                    triggerHaptic('light');
                    try {
                      localStorage.setItem('njambo_show_bot_icons', String(nextVal));
                    } catch {}
                  }}
                  className={`p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-2 ${
                    showBotPersonalityIcons
                      ? 'bg-slate-500/10 border-slate-400/50 shadow-sm'
                      : 'bg-[#0d121c]/90 border-white/[0.07] text-slate-400 hover:border-white/15'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                        showBotPersonalityIcons ? 'bg-slate-400 text-slate-950 font-black' : 'bg-white/[0.04] text-slate-500'
                      }`}
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-white truncate leading-tight">
                        Profils des adversaires
                      </div>
                      <div className="text-xs text-slate-400 truncate">
                        Archétypes visibles
                      </div>
                    </div>
                  </div>

                  <div
                    className={`w-8 h-4.5 rounded-full p-0.5 transition-colors shrink-0 flex items-center ${
                      showBotPersonalityIcons ? 'bg-slate-400 justify-end' : 'bg-slate-800 justify-start'
                    }`}
                  >
                    <motion.div layout className="w-3.5 h-3.5 rounded-full bg-slate-950 shadow-sm" />
                  </div>
                </div>

                {/* Alerte chasseur Kora */}
                <div
                  id="toggle-enable-kora-hunter-alerts"
                  role="switch"
                  aria-checked={enableKoraHunterAlerts}
                  onClick={() => {
                    const nextVal = !enableKoraHunterAlerts;
                    setEnableKoraHunterAlerts(nextVal);
                    triggerHaptic('light');
                    try {
                      localStorage.setItem('njambo_enable_kora_alerts', String(nextVal));
                    } catch {}
                  }}
                  className={`p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-2 ${
                    enableKoraHunterAlerts
                      ? 'bg-rose-500/10 border-rose-400/50 shadow-sm'
                      : 'bg-[#0d121c]/90 border-white/[0.07] text-slate-400 hover:border-white/15'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                        enableKoraHunterAlerts ? 'bg-rose-400 text-slate-950 font-black' : 'bg-white/[0.04] text-slate-500'
                      }`}
                    >
                      <Crown className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-white truncate leading-tight">
                        Alerte chasseur
                      </div>
                      <div className="text-xs text-slate-400 truncate">
                        Offensive Kora
                      </div>
                    </div>
                  </div>

                  <div
                    className={`w-8 h-4.5 rounded-full p-0.5 transition-colors shrink-0 flex items-center ${
                      enableKoraHunterAlerts ? 'bg-rose-400 justify-end' : 'bg-slate-800 justify-start'
                    }`}
                  >
                    <motion.div layout className="w-3.5 h-3.5 rounded-full bg-slate-950 shadow-sm" />
                  </div>
                </div>
              </div>

              {/* Ligne contextuelle discrète pour l'économie */}
              <div className="flex items-center justify-between text-xs text-slate-400 px-1 pt-1 border-t border-white/[0.04]">
                <span>Pot partie : <strong className="text-white font-mono">{regularTrickPot} jetons</strong> ({totalPlayers}J)</span>
                <span className="text-amber-300 font-medium">Pot Kora : <strong className="font-mono">{koraPot} jetons</strong> (×2)</span>
              </div>
            </section>
          </div>
        )}
      </main>

      {/* 4. FIXED BOTTOM ACTION BAR */}
      <footer className="shrink-0 p-2.5 sm:p-3.5 bg-[#090d16]/95 border-t border-white/[0.08] backdrop-blur-xl z-20">
        <div className="max-w-2xl mx-auto flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
          {/* Summary pill */}
          <div className="flex items-center gap-1.5 text-xs font-medium text-slate-400 flex-wrap">
            <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
            <span className="text-white font-bold">
              {opponentOptions.find((o) => o.count === selectedCount)?.name} ({selectedCount + 1}J)
            </span>
            <span>·</span>
            <span>Mise : <strong className="font-mono text-amber-400">{selectedBet} jetons</strong></span>
            <span>·</span>
            <span>Capital : <strong className="font-mono text-amber-300">{selectedCapital} jetons</strong></span>
            <span>·</span>
            <span className="text-amber-300 font-semibold">{difficultyOptions.find((d) => d.id === selectedDifficulty)?.label}</span>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 w-full sm:w-auto">
            {canContinueCurrentManche && (
              <button
                id="btn-continue-manche-settings"
                type="button"
                onClick={() =>
                  onContinueManche &&
                  onContinueManche(
                    enableDoubleKora,
                    enableUnder21,
                    selectedBet,
                    showBotPersonalityIcons,
                    enableKoraHunterAlerts,
                    selectedDifficulty,
                    soloBetIncreaseMode
                  )
                }
                className="flex-1 sm:flex-initial py-2.5 px-3.5 rounded-xl bg-gradient-to-r from-emerald-400 to-emerald-500 hover:from-emerald-300 hover:to-emerald-400 text-slate-950 font-black text-xs sm:text-sm shadow-md shadow-emerald-500/20 transition active:scale-[0.98] flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 fill-slate-950" />
                <span>Reprendre (P{currentPartieCount + 1})</span>
              </button>
            )}

            <button
              id="btn-confirm-start-game"
              type="button"
              onClick={handleTriggerNewManche}
              className={`flex-1 sm:flex-initial py-2.5 sm:py-3 px-5 rounded-xl font-black text-xs sm:text-sm shadow-xl transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] ${
                canContinueCurrentManche
                  ? 'bg-white/[0.06] hover:bg-rose-950/40 hover:text-rose-300 text-slate-300 border border-white/[0.08]'
                  : 'bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600 hover:from-amber-300 hover:to-amber-500 text-slate-950 shadow-amber-500/20 ring-1 ring-amber-400/50'
              }`}
            >
              {canContinueCurrentManche ? (
                <>
                  <RotateCcw className="w-3.5 h-3.5 text-rose-400" />
                  <span>Nouvelle manche</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-slate-950" />
                  <span>Lancer la partie ({selectedCount + 1} Joueurs)</span>
                </>
              )}
            </button>
          </div>
        </div>
      </footer>

      {/* 5. CONFIRMATION OVERLAY (If Manche in progress and starting new) */}
      <AnimatePresence>
        {showConfirmReset && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[80] bg-slate-950/85 backdrop-blur-sm p-4 flex items-center justify-center"
          >
            <motion.div
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              className="max-w-md w-full bg-[#0c101c] border border-amber-500/40 p-5 rounded-3xl shadow-2xl flex flex-col gap-4 text-slate-100"
            >
              <div className="flex items-center gap-3 border-b border-white/[0.08] pb-3.5">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center shadow-inner shrink-0">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-amber-300 leading-tight">
                    Une manche est déjà en cours
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Partie {currentPartieCount} terminée · {activePlayersCount} joueurs qualifiés
                  </p>
                </div>
              </div>

              <div className="bg-white/[0.02] border border-white/[0.06] p-3.5 rounded-2xl text-xs text-slate-300 space-y-2">
                <p>
                  Lancer une <strong className="text-amber-300">nouvelle manche</strong> réinitialisera les capitaux de tous les joueurs à {selectedCapital} jetons.
                </p>
                <p className="text-slate-400 text-xs">
                  💡 <em>Tu peux sauvegarder ta progression actuelle avant de redémarrer.</em>
                </p>
              </div>

              <div className="flex flex-col gap-2 pt-1">
                {onSaveAndStartNewGame && (
                  <button
                    id="btn-confirm-save-and-start"
                    type="button"
                    onClick={handleConfirmSaveAndStart}
                    className="w-full py-3 px-4 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs transition active:scale-[0.99] flex items-center justify-center gap-2 shadow-lg shadow-amber-400/20 cursor-pointer"
                  >
                    <Save className="w-4 h-4" />
                    <span>Sauvegarder et lancer la nouvelle manche</span>
                  </button>
                )}

                <button
                  id="btn-confirm-start-without-save"
                  type="button"
                  onClick={handleConfirmStartWithoutSave}
                  className="w-full py-2.5 px-4 rounded-xl bg-white/[0.04] hover:bg-rose-950/50 hover:text-rose-300 text-slate-300 font-semibold text-xs border border-white/[0.08] transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-rose-400" />
                  <span>Écraser et recommencer à zéro</span>
                </button>

                <button
                  id="btn-cancel-reset"
                  type="button"
                  onClick={() => setShowConfirmReset(false)}
                  className="w-full py-2 px-4 rounded-xl bg-transparent hover:bg-white/[0.04] text-slate-400 hover:text-slate-200 font-medium text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Annuler et revenir aux réglages</span>
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
