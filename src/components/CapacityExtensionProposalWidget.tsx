import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Users, Check, X, Shield } from 'lucide-react';
import { CapacityExtensionProposal, RoomPlayer } from '../types';
import { triggerHaptic } from '../utils/sound';

interface CapacityExtensionProposalWidgetProps {
  proposal?: CapacityExtensionProposal | null;
  players: RoomPlayer[];
  localPlayerId: string;
  isHost: boolean;
  onPropose: () => void;
  onRespond: (agree: boolean) => void;
  className?: string;
}

export const CapacityExtensionProposalWidget: React.FC<CapacityExtensionProposalWidgetProps> = ({
  proposal,
  players,
  localPlayerId,
  isHost,
  onPropose,
  onRespond,
  className = '',
}) => {
  if (!proposal || proposal.status !== 'VOTING') return null;

  const isProposer = proposal.proposerId === localPlayerId;
  const activeHumans = players.filter((p) => p.isHuman && !p.isSpectator && !p.isEliminated && p.connected);
  const totalEligible = Math.max(1, activeHumans.length);
  const agreedCount = proposal.agreedPlayerIds.length;
  const hasAgreed = proposal.agreedPlayerIds.includes(localPlayerId);
  const hasDeclined = proposal.declinedPlayerIds.includes(localPlayerId);

  return (
    <div className={`relative ${className}`}>
      <motion.div
        initial={{ opacity: 0, y: -10, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -10, scale: 0.95 }}
        className="flex items-center gap-2.5 px-3 py-1.5 rounded-2xl bg-cyan-950/95 border border-cyan-500/80 text-cyan-100 shadow-2xl backdrop-blur-md ring-2 ring-cyan-400/30"
      >
        <div className="p-1.5 rounded-xl bg-cyan-500/20 text-cyan-300 shrink-0">
          <Users className="w-4 h-4 text-cyan-300 animate-pulse" />
        </div>

        <div className="flex flex-col min-w-0 pr-1">
          <span className="text-xs font-bold leading-tight">
            Étendre la table à {proposal.newMaxPlayers} joueurs ?
          </span>
          <span className="text-[10px] text-cyan-200/80">
            Par {proposal.proposerName} ({agreedCount}/{totalEligible} votes)
          </span>
        </div>

        <div className="flex items-center gap-1.5 ml-auto shrink-0">
          {isProposer ? (
            <span className="px-2 py-0.5 rounded-md bg-cyan-900/60 border border-cyan-600/50 text-cyan-300 text-[10px] font-bold">
              Votre proposition
            </span>
          ) : hasAgreed ? (
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
                  onRespond(true);
                }}
                className="px-2.5 py-1 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] shadow-md flex items-center gap-1 transition active:scale-95 cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Oui</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  onRespond(false);
                }}
                className="px-2 py-1 rounded-xl bg-slate-800 hover:bg-rose-900/80 text-slate-300 hover:text-rose-200 border border-slate-700 text-[11px] font-semibold transition active:scale-95 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                <span>Non</span>
              </button>
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
};
