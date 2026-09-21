import React from 'react';
import { PlayedCard, Suit, SUITS_INFO } from '../types';
import { Crown, Sparkles, AlertCircle, ArrowRight } from 'lucide-react';

interface TrickHistoryBannerProps {
  plays: PlayedCard[];
  leadSuit: Suit | null;
  currentTrickNumber: number;
}

export const TrickHistoryBanner: React.FC<TrickHistoryBannerProps> = ({
  plays = [],
  leadSuit,
  currentTrickNumber,
}) => {
  const safePlays = Array.isArray(plays) ? plays : [];
  const leadSuitInfo = leadSuit ? SUITS_INFO[leadSuit] : null;

  return (
    <div
      id="trick-history-banner"
      className="w-full max-w-5xl mx-auto px-3 my-1.5"
    >
      <div className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 shadow-lg flex flex-col md:flex-row items-center justify-between gap-3">
        {/* Lead Suit info on the left */}
        <div className="flex items-center gap-2.5 shrink-0">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
            Tour {currentTrickNumber}/5 :
          </span>
          {leadSuitInfo ? (
            <div
              id="lead-suit-indicator"
              className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border border-amber-500/40 bg-amber-500/15 text-amber-300 shadow-sm"
            >
              <span className="text-slate-300 font-medium">Couleur demandée :</span>
              <span className={`text-base font-black ${leadSuitInfo.color}`}>{leadSuitInfo.symbol}</span>
              <span className="text-slate-100">{leadSuitInfo.name}</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-slate-800 text-slate-400 border border-slate-700">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>
              <span>En attente de l'entame</span>
            </div>
          )}
        </div>

        {/* Horizontal ribbon of played cards in this trick */}
        <div
          id="trick-plays-ribbon"
          className="flex items-center gap-2 overflow-x-auto w-full md:w-auto scrollbar-none py-0.5"
        >
          {safePlays.length === 0 ? (
            <div className="text-xs text-slate-500 italic">
              Aucune carte posée sur la table
            </div>
          ) : (
            safePlays.map((play, idx) => {
              const suitInfo = SUITS_INFO[play.card.suit];
              const isLeadCard = play.isLeadCard;
              const isMatch = play.isMatchingSuit;
              const isWinning = play.isWinningSoFar;

              return (
                <div key={`${play.playerIndex}-${play.card.id}`} className="flex items-center gap-1.5 shrink-0">
                  {idx > 0 && <ArrowRight className="w-3 h-3 text-slate-600 shrink-0" />}
                  <div
                    id={`trick-ribbon-card-${idx}`}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs transition-all ${
                      isWinning
                        ? 'bg-slate-800 border-amber-400 text-amber-200 ring-1 ring-amber-400/50 shadow-sm'
                        : isMatch
                        ? 'bg-slate-800/80 border-slate-700 text-slate-200'
                        : 'bg-slate-900 border-rose-900/60 text-slate-400'
                    }`}
                  >
                    <span className="font-semibold text-slate-200">
                      {play.playerName} :
                    </span>
                    <span className={`font-bold flex items-center gap-0.5 ${suitInfo.color}`}>
                      <span className="text-sm">{suitInfo.symbol}</span>
                      <span>{play.card.label}</span>
                    </span>

                    {/* Status markers */}
                    {isWinning && (
                      <span
                        title="Mène le tour"
                        className="flex items-center gap-0.5 text-[10px] bg-amber-400 text-slate-950 font-bold px-1.5 py-0.5 rounded shadow-sm"
                      >
                        <Crown className="w-2.5 h-2.5" /> Gagne
                      </span>
                    )}
                    {!isMatch && (
                      <span
                        title="Pas la carte (non gagnante)"
                        className="text-[10px] bg-rose-950/90 text-rose-300 border border-rose-800/60 font-medium px-1.5 py-0.5 rounded"
                      >
                        Pas la carte
                      </span>
                    )}
                    {isLeadCard && !isWinning && (
                      <span
                        title="Carte d'entame"
                        className="text-[10px] bg-slate-700 text-slate-200 border border-slate-600 font-medium px-1.5 py-0.5 rounded"
                      >
                        Entame
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
