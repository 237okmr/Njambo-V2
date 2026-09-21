import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Zap, Flame, Check, X, Users, AlertCircle, Coins, Clock, ChevronRight } from 'lucide-react';
import { BetIncreaseProposal, RoomPlayer } from '../types';
import { triggerHaptic } from '../utils/sound';
import { webSocketService } from '../services/websocketService';

interface BetIncreaseProposalWidgetProps {
  currentBaseBet: number;
  proposal?: BetIncreaseProposal | null;
  players: RoomPlayer[];
  localPlayerId: string;
  onPropose: (amount: number) => void;
  onRespond: (agree: boolean) => void;
  onCancel: () => void;
  className?: string;
  compact?: boolean;
}

export const BetIncreaseProposalWidget: React.FC<BetIncreaseProposalWidgetProps> = ({
  currentBaseBet,
  proposal,
  players,
  localPlayerId,
  onPropose,
  onRespond,
  onCancel,
  className = '',
  compact = false,
}) => {
  const [showProposeModal, setShowProposeModal] = useState(false);
  const [customAmount, setCustomAmount] = useState<number>(() => currentBaseBet * 2);
  const [timeLeft, setTimeLeft] = useState<number>(15);

  // Expiration timer logic (15 seconds)
  useEffect(() => {
    if (!proposal) return;
    const computeRemaining = () => {
      const serverNow = webSocketService.getServerTime();
      if (proposal.expiresAt) {
        return Math.max(0, Math.ceil((proposal.expiresAt - serverNow) / 1000));
      }
      const elapsed = Math.floor((serverNow - proposal.createdAt) / 1000);
      return Math.max(0, 15 - elapsed);
    };

    setTimeLeft(computeRemaining());
    const interval = setInterval(() => {
      const remaining = computeRemaining();
      setTimeLeft(remaining);
      if (remaining <= 0) {
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [proposal]);

  // Active players calculation
  const activePlayers = players.filter((p) => !p.isEliminated && !p.isForfeit);
  const activeHumans = activePlayers.filter((p) => p.isHuman && p.connected !== false);
  const minCapital = activePlayers.length > 0 ? Math.min(...activePlayers.map((p) => p.capital)) : currentBaseBet;

  // Maximum allowed bet cannot exceed minimum capital of any active player
  const maxAllowedBet = Math.max(currentBaseBet, minCapital);
  const canIncrease = maxAllowedBet > currentBaseBet && activePlayers.length >= 2;

  // Calculate preset multiplier values
  const presets = [
    { label: 'x1.5', value: Math.min(maxAllowedBet, Math.round(currentBaseBet * 1.5)) },
    { label: 'x2', value: Math.min(maxAllowedBet, currentBaseBet * 2) },
    { label: 'x3', value: Math.min(maxAllowedBet, currentBaseBet * 3) },
    { label: 'Max', value: maxAllowedBet },
  ].filter((p, idx, arr) => p.value > currentBaseBet && arr.findIndex((x) => x.value === p.value) === idx);

  const isLocalProposer = proposal?.proposerId === localPlayerId;
  const hasLocalAgreed = proposal ? proposal.agreedPlayerIds.includes(localPlayerId) : false;
  const totalRequired = Math.max(1, activeHumans.length);
  const agreedCount = proposal ? proposal.agreedPlayerIds.filter((id) => activeHumans.some((h) => h.id === id)).length : 0;

  const handleOpenModal = () => {
    triggerHaptic('light');
    setCustomAmount(Math.min(maxAllowedBet, currentBaseBet * 2));
    setShowProposeModal(true);
  };

  const handleSendProposal = (amount: number) => {
    const validAmount = Math.max(currentBaseBet + 1, Math.min(maxAllowedBet, Math.round(amount)));
    triggerHaptic('medium');
    onPropose(validAmount);
    setShowProposeModal(false);
  };

  return (
    <div className={`relative ${className}`}>
      {/* CASE 1: An active proposal exists */}
      {proposal && (
        <motion.div
          initial={{ opacity: 0, y: -8, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.95 }}
          className={`flex flex-col gap-1.5 p-2 sm:px-3.5 sm:py-2 rounded-xl border shadow-lg backdrop-blur-md transition-all ${
            hasLocalAgreed
              ? 'bg-amber-950/90 border-amber-500/60 text-amber-200'
              : 'bg-emerald-950/95 border-emerald-500/80 text-emerald-100 ring-2 ring-emerald-400/40 animate-pulse'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              <span className="p-1 rounded-full bg-amber-500/20 text-amber-300 shrink-0">
                <Flame className="w-3.5 h-3.5 text-amber-400 animate-bounce" />
              </span>
              <div className="flex flex-col min-w-0">
                <span className="text-[11px] text-slate-200 font-bold leading-tight flex items-center gap-1 truncate">
                  Hausse : <strong className="text-amber-300 font-mono font-black text-xs">{proposal.proposedBet} 🪙</strong>
                </span>
                <span className="text-[9px] text-slate-400 font-normal truncate">
                  {isLocalProposer ? 'Votre proposition' : `Par ${proposal.proposerName}`} ({agreedCount}/{totalRequired} OK)
                </span>
              </div>
            </div>

            {/* Countdown Badge */}
            <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-900/80 border border-amber-500/40 text-amber-300 text-[10px] font-mono font-bold shrink-0">
              <Clock className="w-3 h-3 text-amber-400 animate-spin" />
              <span>{timeLeft}s</span>
            </div>

            <div className="flex items-center gap-1 shrink-0 ml-auto">
              {isLocalProposer ? (
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    onCancel();
                  }}
                  className="px-2 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-[10px] font-semibold flex items-center gap-1 transition active:scale-95 cursor-pointer"
                  title="Annuler la proposition"
                >
                  <X className="w-3 h-3 text-rose-400" />
                  <span>Annuler</span>
                </button>
              ) : hasLocalAgreed ? (
                <span className="px-2 py-0.5 rounded-md bg-emerald-900/60 border border-emerald-600/50 text-emerald-300 text-[10px] font-bold flex items-center gap-1">
                  <Check className="w-3 h-3 text-emerald-400" />
                  <span>Accepté</span>
                </span>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('success');
                      onRespond(true);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] shadow-sm flex items-center gap-1 transition active:scale-95 cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Accepter</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      onRespond(false);
                    }}
                    className="p-1 rounded-lg bg-slate-800/80 hover:bg-rose-950 hover:border-rose-700/60 text-slate-400 hover:text-rose-300 border border-slate-700 text-[10px] transition active:scale-95 cursor-pointer"
                    title="Refuser"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Progress bar for 15s vote timer */}
          <div className="w-full bg-slate-900/60 rounded-full h-1 overflow-hidden">
            <div
              className="bg-amber-400 h-full transition-all duration-1000 ease-linear"
              style={{ width: `${Math.max(0, (timeLeft / 15) * 100)}%` }}
            />
          </div>
        </motion.div>
      )}

      {/* CASE 2: No active proposal -> Consistent Full-Width Banner or Compact Pill */}
      {!proposal && canIncrease && (
        compact ? (
          <button
            type="button"
            onClick={handleOpenModal}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-cyan-950/70 hover:bg-cyan-900 text-cyan-300 border border-cyan-500/50 text-xs font-bold shadow-sm transition-all cursor-pointer active:scale-95 group"
            title="Proposer d'augmenter la mise"
          >
            <motion.div
              animate={{
                scale: [1, 1.2, 1],
                filter: [
                  'drop-shadow(0 0 1px rgba(34, 211, 238, 0.4))',
                  'drop-shadow(0 0 6px rgba(34, 211, 238, 0.9))',
                  'drop-shadow(0 0 1px rgba(34, 211, 238, 0.4))',
                ],
              }}
              transition={{
                duration: 1.8,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
              className="flex items-center justify-center"
            >
              <Zap className="w-3.5 h-3.5 text-cyan-400 fill-cyan-400" />
            </motion.div>
            <span>Monter mise</span>
            <span className="text-[10px] opacity-75 font-mono">({currentBaseBet}➔x2)</span>
          </button>
        ) : (
          <button
            type="button"
            id="btn-trigger-bet-increase"
            onClick={handleOpenModal}
            className="w-full flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl border border-cyan-500/50 bg-gradient-to-r from-cyan-950/80 via-slate-900/95 to-cyan-950/75 hover:from-cyan-900/90 hover:via-slate-800/95 hover:to-cyan-900/85 hover:border-cyan-400/80 transition-all duration-200 cursor-pointer shadow-lg shadow-cyan-950/30 hover:shadow-cyan-500/20 active:scale-[0.99] group text-left min-h-[44px]"
            title="Proposer d'augmenter la mise pour les prochaines donnes de la manche"
          >
            {/* Left side: Animated Icon Medallion + Text */}
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-cyan-400/15 border border-cyan-400/35 flex items-center justify-center shrink-0 shadow-inner group-hover:bg-cyan-400/25 transition-colors">
                <motion.div
                  animate={{
                    scale: [1, 1.22, 1],
                    rotate: [0, -4, 4, 0],
                    filter: [
                      'drop-shadow(0 0 2px rgba(34, 211, 238, 0.4))',
                      'drop-shadow(0 0 8px rgba(34, 211, 238, 0.95))',
                      'drop-shadow(0 0 2px rgba(34, 211, 238, 0.4))',
                    ],
                  }}
                  transition={{
                    duration: 1.8,
                    repeat: Infinity,
                    ease: 'easeInOut',
                  }}
                  className="flex items-center justify-center text-cyan-300"
                >
                  <Zap className="w-4 h-4 text-cyan-300 fill-cyan-400" />
                </motion.div>
              </div>

              <div className="flex flex-col min-w-0">
                <span className="text-xs sm:text-sm font-bold text-cyan-50 group-hover:text-white transition-colors tracking-tight leading-tight">
                  Rehausser la mise
                </span>
                <span className="text-[10px] text-cyan-300/75 truncate hidden xs:inline">
                  Pour les prochaines donnes de la manche
                </span>
              </div>
            </div>

            {/* Right side: Stake Pill with dynamic values and Arrow */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-cyan-400/15 border border-cyan-400/35 group-hover:border-cyan-400/60 group-hover:bg-cyan-400/25 transition-all text-cyan-300 font-mono text-xs font-bold shrink-0 shadow-xs">
              <span>{currentBaseBet} 🪙 ➔ ×2</span>
              <ChevronRight className="w-3.5 h-3.5 text-cyan-400 shrink-0 group-hover:translate-x-0.5 transition-transform" />
            </div>
          </button>
        )
      )}

      {/* PROPOSAL MODAL / POPOVER */}
      <AnimatePresence>
        {showProposeModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-950/70 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 10 }}
              className="w-full max-w-sm bg-slate-900 border border-amber-500/50 rounded-2xl p-4 sm:p-5 shadow-2xl flex flex-col gap-3.5 text-slate-100"
            >
              <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-xl bg-amber-500/20 text-amber-300">
                    <Flame className="w-4 h-4 text-amber-400" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-amber-200">Augmenter la mise</h3>
                    <p className="text-[11px] text-slate-400">Pour les prochaines donnes de la manche</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowProposeModal(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="bg-slate-950/60 rounded-xl p-3 border border-slate-800/80 flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Mise actuelle</span>
                  <span className="text-sm font-bold text-slate-200 font-mono">{currentBaseBet} jetons</span>
                </div>
                <div className="h-6 w-px bg-slate-800" />
                <div className="text-right">
                  <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Plafond table (tapis min)</span>
                  <span className="text-sm font-bold text-amber-400 font-mono">{maxAllowedBet} jetons</span>
                </div>
              </div>

              {/* Multiplier Presets */}
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-slate-300">Choix rapide :</span>
                <div className="grid grid-cols-4 gap-2">
                  {presets.map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => setCustomAmount(p.value)}
                      className={`py-2 rounded-xl text-xs font-bold border transition active:scale-95 cursor-pointer flex flex-col items-center justify-center gap-0.5 ${
                        customAmount === p.value
                          ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md font-extrabold'
                          : 'bg-slate-800/80 hover:bg-slate-700/80 text-slate-200 border-slate-700/60'
                      }`}
                    >
                      <span>{p.label}</span>
                      <span className="text-[9px] opacity-80 font-mono">{p.value}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Amount Range Slider & Direct Input */}
              <div className="flex flex-col gap-1.5 pt-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-300">Montant proposé :</span>
                  <span className="font-mono font-black text-amber-300 text-base">{customAmount} jetons</span>
                </div>
                <input
                  type="range"
                  min={currentBaseBet + 1}
                  max={maxAllowedBet}
                  step={Math.max(1, Math.round(currentBaseBet / 10))}
                  value={customAmount}
                  onChange={(e) => setCustomAmount(Number(e.target.value))}
                  className="w-full accent-amber-400 h-2 bg-slate-800 rounded-lg cursor-pointer"
                />
              </div>

              <div className="text-[11px] text-slate-400 flex items-start gap-1.5 bg-slate-950/40 p-2 rounded-lg border border-slate-800/60">
                <Users className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                <span>Tous les joueurs humains de la table doivent accepter à l'unanimité pour valider.</span>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowProposeModal(false)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer btn-juicy-subtle"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={() => handleSendProposal(customAmount)}
                  className="flex-[2] py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 text-xs font-black shadow-lg flex items-center justify-center gap-1.5 cursor-pointer btn-juicy"
                >
                  <Flame className="w-4 h-4 fill-slate-950" />
                  <span>Proposer ({customAmount} jetons)</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
