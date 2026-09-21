import React, { useState, useEffect } from 'react';
import {
  X,
  Layers,
  Award,
  Sparkles,
  BookOpen,
  ShieldAlert,
  Zap,
  CheckCircle2,
  Crown,
  Coins,
} from 'lucide-react';

interface RulesModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'simple' | 'detailed';
}

export const RulesModal: React.FC<RulesModalProps> = ({
  isOpen,
  onClose,
  initialTab = 'simple',
}) => {
  const [activeTab, setActiveTab] = useState<'simple' | 'detailed'>(initialTab);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  if (!isOpen) return null;

  return (
    <div
      id="rules-modal-backdrop"
      className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-md overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        id="rules-modal-container"
        className="relative w-full max-w-2xl bg-slate-900 border border-amber-500/40 rounded-2xl p-4 sm:p-6 shadow-2xl text-slate-200 my-auto max-h-[90vh] flex flex-col"
      >
        {/* Close button */}
        <button
          id="btn-close-rules-modal"
          onClick={onClose}
          className="absolute top-3.5 right-3.5 sm:top-4 sm:right-4 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          title="Fermer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-3 shrink-0 pr-8">
          <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-black text-amber-300 tracking-tight">
              Règles de Njambo Kora
            </h2>
            <p className="text-xs text-slate-400 font-medium">
              Jeu de cartes traditionnel à 31 cartes
            </p>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-950/80 rounded-xl border border-slate-800 mb-3 shrink-0">
          <button
            type="button"
            id="tab-rules-simple"
            onClick={() => setActiveTab('simple')}
            className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
              activeTab === 'simple'
                ? 'bg-amber-500 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            <span>Règles Simples (En Bref)</span>
          </button>

          <button
            type="button"
            id="tab-rules-detailed"
            onClick={() => setActiveTab('detailed')}
            className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
              activeTab === 'detailed'
                ? 'bg-slate-800 text-amber-300 border border-amber-500/30 shadow-md'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Règles Détaillées</span>
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto pr-1 space-y-3 text-xs sm:text-sm">
          {activeTab === 'simple' ? (
            /* SIMPLE RULES (Visual, Card-First, Minimal text) */
            <div className="space-y-2.5">
              {/* 1. But du jeu & 5 Mains */}
              <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-500/40">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <Award className="w-4 h-4 text-amber-400" />
                    <h3 className="font-extrabold text-amber-300 text-xs sm:text-sm">
                      Objectif : Remporter le 5ᵉ tour
                    </h3>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    5 cartes en main
                  </span>
                </div>
                {/* 5 tricks flow visual */}
                <div className="grid grid-cols-5 gap-1 text-center font-mono my-2">
                  {[1, 2, 3, 4].map((h) => (
                    <div key={h} className="p-1.5 rounded-lg bg-slate-900/80 border border-slate-800 text-slate-400">
                      <div className="text-[9px] uppercase">Tour {h}</div>
                      <div className="text-[10px] text-slate-300">Placement</div>
                    </div>
                  ))}
                  <div className="p-1.5 rounded-lg bg-amber-500 text-slate-950 font-black shadow border border-amber-300">
                    <div className="text-[9px] uppercase">Tour 5</div>
                    <div className="text-[10px]">🏆 Gagne la Partie</div>
                  </div>
                </div>
              </div>

              {/* 2. Hiérarchie & Composition du paquet (31 cartes) */}
              <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-emerald-400" />
                    <h3 className="font-extrabold text-emerald-300 text-xs sm:text-sm">
                      Hiérarchie des Cartes (31 cartes)
                    </h3>
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono">10♠ exclu</span>
                </div>

                {/* Card hierarchy visual */}
                <div className="flex items-center justify-between gap-1 overflow-x-auto py-1">
                  {[
                    { rank: '10', power: 'Max', bg: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' },
                    { rank: '9', power: 'Fort', bg: 'bg-slate-800 text-slate-200 border-slate-700' },
                    { rank: '8', power: '•', bg: 'bg-slate-800 text-slate-300 border-slate-700' },
                    { rank: '7', power: '•', bg: 'bg-slate-800 text-slate-300 border-slate-700' },
                    { rank: '6', power: '•', bg: 'bg-slate-800 text-slate-400 border-slate-700' },
                    { rank: '5', power: '•', bg: 'bg-slate-800 text-slate-400 border-slate-700' },
                    { rank: '4', power: 'Faible', bg: 'bg-slate-800 text-slate-400 border-slate-700' },
                    { rank: '3', power: 'Kora', bg: 'bg-amber-500/20 text-amber-300 border-amber-500/40' },
                  ].map((c, i) => (
                    <div key={c.rank} className="flex items-center gap-1 shrink-0">
                      <div className={`px-2 py-1 rounded-lg border text-center font-mono ${c.bg}`}>
                        <div className="text-xs font-black">{c.rank}</div>
                        <div className="text-[8px] font-sans">{c.power}</div>
                      </div>
                      {i < 7 && <span className="text-slate-600 text-xs">›</span>}
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-center gap-3 mt-2 text-[10px] text-slate-400">
                  <span className="text-rose-400 font-bold">♥ Koubi (8)</span>
                  <span className="text-amber-400 font-bold">♦ Zing (8)</span>
                  <span className="text-emerald-400 font-bold">♣ Tchaka (8)</span>
                  <span className="text-slate-300 font-bold">♠ Black (7)</span>
                </div>
              </div>

              {/* 3. Déroulement d'un tour & Obligation de couleur */}
              <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 className="w-4 h-4 text-cyan-400" />
                  <h3 className="font-extrabold text-cyan-300 text-xs sm:text-sm">
                    Règle du Tour & Obligation de Couleur
                  </h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                  <div className="p-2 rounded-lg bg-emerald-950/30 border border-emerald-500/30 flex items-start gap-2">
                    <span className="text-emerald-400 font-black">🟢</span>
                    <div>
                      <strong className="text-emerald-300">Couleur demandée en main :</strong>
                      <div className="text-slate-300">Obligation stricte de la jouer. La plus forte carte l'emporte.</div>
                    </div>
                  </div>
                  <div className="p-2 rounded-lg bg-amber-950/30 border border-amber-500/30 flex items-start gap-2">
                    <span className="text-amber-400 font-black">🟡</span>
                    <div>
                      <strong className="text-amber-300">Couleur absente :</strong>
                      <div className="text-slate-300">Défausse libre d'une autre couleur (ne peut pas gagner le tour).</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* 4. Victoires Spéciales & Kora (Grille Visuelle) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="p-2.5 rounded-xl bg-purple-950/30 border border-purple-500/40 flex items-start gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-purple-500 text-white flex items-center justify-center font-black text-xs shrink-0 shadow">
                    👑
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-black text-xs text-purple-300">Kora / Double</span>
                      <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-purple-500/30 text-purple-200">×2 / ×4</span>
                    </div>
                    <div className="text-[10px] text-slate-300 mt-0.5">
                      Gagner le 5ᵉ tour avec un <strong>3</strong> double la mise de chaque perdant.
                    </div>
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-amber-950/30 border border-amber-500/40 flex items-start gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-amber-500 text-slate-950 flex items-center justify-center font-black text-xs shrink-0 shadow">
                    ⚡
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-black text-xs text-amber-300">Trois 7 & ≤21</span>
                      <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-500/30 text-amber-200">Instantané</span>
                    </div>
                    <div className="text-[10px] text-slate-300 mt-0.5">
                      3 cartes "7" ou somme main <strong>≤ 21</strong> à la distribution = victoire directe de la partie !
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* DETAILED RULES (Streamlined) */
            <div className="space-y-3">
              <div className="p-3 rounded-xl bg-purple-950/30 border border-purple-500/40 space-y-2">
                <h3 className="font-bold text-amber-300 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-purple-400" />
                  <span>Bonus & Multiplicateurs de Victoire</span>
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <div className="p-2 rounded-lg bg-slate-900/80 border border-slate-800">
                    <span className="text-amber-400 font-bold">🔥 KORA (×2) :</span>
                    <p className="text-slate-300 text-[11px] mt-0.5">Remporter le 5ᵉ tour avec un "3". Les perdants paient le double de leur mise.</p>
                  </div>
                  <div className="p-2 rounded-lg bg-slate-900/80 border border-slate-800">
                    <span className="text-purple-300 font-bold">⚡ DOUBLE KORA (×4) :</span>
                    <p className="text-slate-300 text-[11px] mt-0.5">Gagner le 4ᵉ puis le 5ᵉ tour avec un "3". Les perdants paient 4× la mise.</p>
                  </div>
                  <div className="p-2 rounded-lg bg-slate-900/80 border border-slate-800">
                    <span className="text-emerald-400 font-bold">✨ MOINS DE 21 :</span>
                    <p className="text-slate-300 text-[11px] mt-0.5">Somme des 5 cartes ≤ 21 dès la distribution = fin de la partie et victoire du pot.</p>
                  </div>
                  <div className="p-2 rounded-lg bg-slate-900/80 border border-slate-800">
                    <span className="text-yellow-400 font-bold">🃏 LES 3 "7" :</span>
                    <p className="text-slate-300 text-[11px] mt-0.5">Posséder trois 7 dans sa donne initiale = victoire instantanée de la partie.</p>
                  </div>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1.5 text-xs">
                <h3 className="font-bold text-amber-400 flex items-center gap-2">
                  <Layers className="w-4 h-4" />
                  <span>Déroulement, Donneur & Ordre de Jeu</span>
                </h3>
                <p className="text-slate-300 text-[11px] leading-relaxed">
                  Le vainqueur de la partie précédente devient le <strong>donneur</strong> (distribue les cartes). Le joueur situé immédiatement après le donneur (à sa gauche) joue la <strong>première carte du 1ᵉʳ tour</strong>. Aux tours suivants, le gagnant du tour précédent garde la main (entame le tour suivant).
                </p>
                <p className="text-slate-300 text-[11px] leading-relaxed">
                  Une <strong>Manche</strong> est une succession de parties jusqu'à la victoire finale. Elle se joue au capital de jetons. Chaque joueur verse la mise au début de chaque partie. Tout joueur à court de jetons est éliminé. Le dernier joueur en lice remporte la manche !
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between shrink-0">
          <span className="text-[11px] text-slate-500">
            Njambo Kora · 31 cartes
          </span>
          <button
            type="button"
            id="btn-confirm-rules-modal"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-md transition cursor-pointer active:scale-95"
          >
            J'ai compris
          </button>
        </div>
      </div>
    </div>
  );
};
