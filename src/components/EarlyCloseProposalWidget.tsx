import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Handshake, Check, X, Users, AlertCircle } from 'lucide-react';
import { EarlyCloseProposal, RoomPlayer } from '../types';
import { triggerHaptic } from '../utils/sound';

interface EarlyCloseProposalWidgetProps {
  proposal?: EarlyCloseProposal | null;
  players: RoomPlayer[];
  localPlayerId: string;
  onPropose: () => void;
  onRespond: (agree: boolean) => void;
  className?: string;
}

export const EarlyCloseProposalWidget: React.FC<EarlyCloseProposalWidgetProps> = ({
  proposal,
  players,
  localPlayerId,
  onPropose,
  onRespond,
  className = '',
}) => {
  const activeHumans = players.filter((p) => p.isHuman && !p.isEliminated && !p.isForfeit && p.connected);
  const isLocalProposer = proposal?.proposerId === localPlayerId;
  const hasLocalAgreed = proposal ? proposal.agreedPlayerIds.includes(localPlayerId) : false;
  const totalRequired = Math.max(1, activeHumans.length);
  const agreedCount = proposal ? proposal.agreedPlayerIds.filter((id) => activeHumans.some((h) => h.id === id)).length : 0;

  return (
    <div className={`relative ${className}`}>
      <AnimatePresence>
        {proposal && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            className={`flex items-center gap-2 p-2 sm:px-3 sm:py-1.5 rounded-xl border shadow-xl backdrop-blur-md transition-all ${
              hasLocalAgreed
                ? 'bg-amber-950/90 border-amber-500/60 text-amber-200'
                : 'bg-emerald-950/95 border-emerald-500/80 text-emerald-100 ring-2 ring-emerald-400/40 animate-pulse'
            }`}
          >
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="p-1 rounded-full bg-amber-500/20 text-amber-300">
                <Handshake className="w-4 h-4 text-amber-400 animate-bounce" />
              </span>
              <div className="flex flex-col">
                <span className="text-[11px] text-slate-100 font-bold leading-tight">
                  Fin de partie d'un commun accord ?
                </span>
                <span className="text-[9px] text-slate-300">
                  {isLocalProposer ? 'Votre demande' : `Par ${proposal.proposerName}`} • Accord : {agreedCount}/{totalRequired}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 ml-auto">
              {!hasLocalAgreed ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('medium');
                      onRespond(true);
                    }}
                    className="h-7 px-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-slate-950 font-bold text-xs flex items-center gap-1 shadow-md transition cursor-pointer"
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
                    className="h-7 px-2 rounded-lg bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-300 font-medium text-xs border border-slate-700 flex items-center gap-1 transition cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5 text-rose-400" />
                    <span>Refuser</span>
                  </button>
                </>
              ) : (
                <span className="text-[10px] font-bold text-amber-300 bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <Check className="w-3 h-3 text-amber-400" /> En attente des autres...
                </span>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
