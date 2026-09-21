import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { UserPlus, Check, X, ShieldAlert, Sparkles, Clock, Eye, Bot, Coins } from 'lucide-react';
import { IntegrationProposal, RoomPlayer } from '../types';
import { triggerHaptic } from '../utils/sound';
import { webSocketService } from '../services/websocketService';

interface IntegrationProposalWidgetProps {
  proposal?: IntegrationProposal | null;
  players: RoomPlayer[];
  localPlayerId: string;
  isSpectator?: boolean;
  isPendingIntegration?: boolean;
  canRequestIntegration?: boolean;
  prorataCapitalEstimate?: number;
  onRespondVote: (agree: boolean) => void;
  onRequestIntegration?: () => void;
  className?: string;
}

export const IntegrationProposalWidget: React.FC<IntegrationProposalWidgetProps> = ({
  proposal,
  players,
  localPlayerId,
  isSpectator = false,
  isPendingIntegration = false,
  canRequestIntegration = false,
  prorataCapitalEstimate = 0,
  onRespondVote,
  onRequestIntegration,
  className = '',
}) => {
  const [now, setNow] = useState<number>(() => webSocketService.getServerTime());

  useEffect(() => {
    if (proposal && proposal.status === 'VOTING') {
      setNow(webSocketService.getServerTime());
      const interval = setInterval(() => {
        setNow(webSocketService.getServerTime());
      }, 200);
      return () => clearInterval(interval);
    }
  }, [proposal?.id, proposal?.status]);

  const isApplicant = proposal?.applicantId === localPlayerId;
  const activeHumans = players.filter((p) => p.isHuman && !p.isSpectator && !p.isEliminated && p.connected);
  const eligibleVoters = activeHumans.filter((p) => p.id !== proposal?.applicantId);
  const totalEligible = Math.max(1, eligibleVoters.length);

  const hasAgreed = proposal ? proposal.agreedPlayerIds.includes(localPlayerId) : false;
  const hasDeclined = proposal ? proposal.declinedPlayerIds.includes(localPlayerId) : false;
  const agreedCount = proposal ? proposal.agreedPlayerIds.filter((id) => eligibleVoters.some((v) => v.id === id)).length : 0;

  // Render for the applicant waiting
  if (isApplicant && proposal) {
    return (
      <div className={`relative ${className}`}>
        <motion.div
          initial={{ opacity: 0, y: -10, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.95 }}
          className={`flex items-center gap-2.5 px-3.5 py-2 rounded-2xl border shadow-xl backdrop-blur-md ${
            proposal.status === 'ACCEPTED'
              ? 'bg-emerald-950/90 border-emerald-500/60 text-emerald-100 ring-2 ring-emerald-500/30'
              : proposal.status === 'DECLINED'
              ? 'bg-rose-950/90 border-rose-500/60 text-rose-100'
              : 'bg-amber-950/90 border-amber-500/60 text-amber-100 animate-pulse'
          }`}
        >
          <div className="p-1.5 rounded-xl bg-amber-500/20 text-amber-300 shrink-0">
            {proposal.status === 'ACCEPTED' ? (
              <Sparkles className="w-4 h-4 text-emerald-400 animate-bounce" />
            ) : proposal.status === 'DECLINED' ? (
              <ShieldAlert className="w-4 h-4 text-rose-400" />
            ) : (
              <Clock className="w-4 h-4 text-amber-400 animate-spin" />
            )}
          </div>

          <div className="flex flex-col min-w-0">
            <span className="text-xs font-bold leading-tight">
              {proposal.status === 'ACCEPTED' ? (
                <span>🎉 Intégration validée ! Début à la prochaine partie ({proposal.prorataCapital} 🪙)</span>
              ) : proposal.status === 'DECLINED' ? (
                <span>Intégration refusée par la table</span>
              ) : (
                <span>Vote d'intégration en cours ({agreedCount}/{totalEligible} votes)...</span>
              )}
            </span>
            <span className="text-[10px] text-slate-300 truncate">
              {proposal.targetBotNameToReplace
                ? `Remplacement prévu de ${proposal.targetBotNameToReplace}`
                : `Capital proratisé : ${proposal.prorataCapital} 🪙`}
            </span>
          </div>
        </motion.div>
      </div>
    );
  }

  // Render for table voters when proposal is VOTING
  if (proposal && proposal.status === 'VOTING' && !isSpectator) {
    const expiresAt = proposal.expiresAt || proposal.createdAt + 10000;
    const remainingMs = Math.max(0, expiresAt - now);
    const remainingSec = Math.ceil(remainingMs / 1000);

    return (
      <div className={`relative ${className} w-full max-w-lg`}>
        <motion.div
          initial={{ opacity: 0, y: -10, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.95 }}
          className="flex flex-col gap-1.5 px-3.5 py-2.5 rounded-2xl bg-indigo-950/95 border border-indigo-500/80 text-indigo-100 shadow-2xl backdrop-blur-md ring-2 ring-indigo-400/30"
        >
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-xl bg-indigo-500/20 text-indigo-300 shrink-0">
              <UserPlus className="w-4 h-4 text-indigo-300 animate-pulse" />
            </div>

            <div className="flex flex-col min-w-0 flex-1 pr-1">
              <div className="flex items-center justify-between gap-1">
                <span className="text-xs font-bold leading-tight truncate">
                  Intégrer <strong className="text-amber-300">{proposal.applicantName}</strong> ?
                </span>
                <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-indigo-900 border border-indigo-400/40 text-amber-300 shrink-0 flex items-center gap-1">
                  <Clock className="w-2.5 h-2.5 animate-spin" />
                  <span>{remainingSec}s</span>
                </span>
              </div>
              <span className="text-[10px] text-indigo-200/80 mt-0.5">
                Capital : {proposal.prorataCapital} 🪙 · {proposal.targetBotNameToReplace ? `Remplace ${proposal.targetBotNameToReplace}` : 'Place libre'} (Majorité : {agreedCount}/{totalEligible})
              </span>
            </div>

            <div className="flex items-center gap-1.5 ml-auto shrink-0">
              {hasAgreed ? (
                <span className="px-2 py-1 rounded-lg bg-emerald-900/80 border border-emerald-600/60 text-emerald-300 text-[10px] font-bold flex items-center gap-1">
                  <Check className="w-3 h-3 text-emerald-400" />
                  <span>Pour</span>
                </span>
              ) : hasDeclined ? (
                <span className="px-2 py-1 rounded-lg bg-rose-900/80 border border-rose-600/60 text-rose-300 text-[10px] font-bold flex items-center gap-1">
                  <X className="w-3 h-3 text-rose-400" />
                  <span>Contre</span>
                </span>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('success');
                      onRespondVote(true);
                    }}
                    className="px-2.5 py-1 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] shadow-md flex items-center gap-1 transition active:scale-95 cursor-pointer"
                    title="Accepter l'intégration"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Oui</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      onRespondVote(false);
                    }}
                    className="px-2 py-1 rounded-xl bg-slate-800 hover:bg-rose-900/80 text-slate-300 hover:text-rose-200 border border-slate-700 text-[11px] font-semibold transition active:scale-95 cursor-pointer"
                    title="Refuser l'intégration"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Non</span>
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Progress bar of time remaining */}
          <div className="w-full bg-indigo-900/60 h-1 rounded-full overflow-hidden">
            <div
              className="bg-gradient-to-r from-amber-400 to-indigo-400 h-full transition-all duration-300 ease-linear"
              style={{ width: `${Math.max(0, Math.min(100, (remainingMs / 10000) * 100))}%` }}
            />
          </div>
        </motion.div>
      </div>
    );
  }

  // Render for Spectator banner / Request Integration action
  if (isSpectator && !proposal && canRequestIntegration && onRequestIntegration) {
    return (
      <div className={`relative ${className}`}>
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2 px-3 py-1.5 rounded-2xl bg-slate-900/95 border border-amber-500/50 text-slate-200 shadow-xl backdrop-blur-md"
        >
          <div className="flex items-center gap-1.5">
            <span className="p-1 rounded-lg bg-amber-500/20 text-amber-300">
              <Eye className="w-3.5 h-3.5 text-amber-400" />
            </span>
            <span className="text-[11px] text-slate-300 font-medium">
              Spectateur (Place libre)
            </span>
          </div>

          <button
            type="button"
            onClick={() => {
              triggerHaptic('medium');
              onRequestIntegration();
            }}
            className="ml-auto px-2.5 py-1 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 text-xs font-black shadow-md flex items-center gap-1 transition active:scale-95 cursor-pointer"
          >
            <UserPlus className="w-3.5 h-3.5 fill-slate-950" />
            <span>Rejoindre ({prorataCapitalEstimate} 🪙)</span>
          </button>
        </motion.div>
      </div>
    );
  }

  return null;
};
