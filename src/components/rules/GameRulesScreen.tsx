import React, { useState } from 'react';
import {
  ArrowLeft,
  Zap,
  Crown,
  Layers,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  Award,
  BookOpen,
  Play,
  Flame,
  HelpCircle,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export type RulesTabType = 'express' | 'kora' | 'deck' | 'strategy' | 'official';

interface GameRulesScreenProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: RulesTabType;
  onStartSolo?: () => void;
}

export const GameRulesScreen: React.FC<GameRulesScreenProps> = ({
  isOpen,
  onClose,
  initialTab = 'express',
  onStartSolo,
}) => {
  const [activeTab, setActiveTab] = useState<RulesTabType>(initialTab);

  const handleBackClick = () => {
    if (activeTab !== 'express') {
      setActiveTab('express');
    } else {
      onClose();
    }
  };

  React.useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleBackClick();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, activeTab, onClose]);

  if (!isOpen) return null;

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ duration: 0.25 }}
      id="game-rules-screen"
      className="fixed inset-0 z-[70] bg-slate-950 text-slate-100 flex flex-col font-sans select-none overflow-hidden"
    >
      {/* Top Header Bar */}
      <header className="h-14 sm:h-16 px-3 sm:px-6 bg-slate-900/90 border-b border-white/10 backdrop-blur-md flex items-center justify-between shrink-0 z-10">
        <div className="flex items-center gap-2.5 sm:gap-3">
          <button
            type="button"
            id="btn-rules-back"
            onClick={handleBackClick}
            className="w-10 h-10 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 flex items-center justify-center transition active:scale-95 cursor-pointer shadow-sm"
            aria-label="Retour"
            title={activeTab !== 'express' ? 'Retour au sommaire' : 'Fermer le guide'}
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="text-base sm:text-lg font-black tracking-tight text-white">
                Académie Njambo Kora
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 uppercase tracking-wider">
                Guide Officiel
              </span>
            </div>
            <span className="text-[11px] text-slate-400 font-medium hidden xs:block">
              Maîtrisez les 31 cartes, l'art du Kora et les stratégies de table
            </span>
          </div>
        </div>

        {onStartSolo && (
          <button
            type="button"
            onClick={() => {
              onClose();
              onStartSolo();
            }}
            className="h-9 px-3.5 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 font-black text-xs shadow-md shadow-amber-500/20 flex items-center gap-1.5 transition active:scale-95 cursor-pointer"
          >
            <Play className="w-3.5 h-3.5 fill-slate-950" />
            <span className="hidden sm:inline">Lancer une</span> Partie
          </button>
        )}
      </header>

      {/* Responsive Segmented Navigation Bar (0% Horizontal Scroll) */}
      <nav aria-label="Sections du guide" className="bg-slate-900/70 border-b border-slate-800/80 px-2 sm:px-4 py-2 shrink-0">
        <div className="grid grid-cols-5 gap-1 sm:gap-2 max-w-4xl mx-auto p-1 bg-slate-950/80 rounded-2xl border border-slate-800/80">
          {[
            { id: 'express', label: 'Express', fullLabel: 'En 30 secondes', icon: Zap, color: 'text-amber-400' },
            { id: 'kora', label: 'Kora', fullLabel: 'Kora & Victoires', icon: Crown, color: 'text-purple-400' },
            { id: 'deck', label: '31 Cartes', fullLabel: 'Les 31 Cartes', icon: Layers, color: 'text-emerald-400' },
            { id: 'strategy', label: 'Tours', fullLabel: 'Déroulement & Tours', icon: ShieldCheck, color: 'text-cyan-400' },
            { id: 'official', label: 'Règles', fullLabel: 'Règlement Complet', icon: BookOpen, color: 'text-slate-300' },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                id={`tab-rules-${tab.id}`}
                onClick={() => setActiveTab(tab.id as RulesTabType)}
                className={`py-2 px-1 sm:px-3 rounded-xl text-xs font-bold flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 transition-all cursor-pointer ${
                  isActive
                    ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20 font-black'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/90'
                }`}
                title={tab.fullLabel}
              >
                <Icon className={`w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 ${isActive ? 'text-slate-950' : tab.color}`} />
                <span className="truncate text-[10px] sm:text-xs">
                  <span className="sm:hidden">{tab.label}</span>
                  <span className="hidden sm:inline">{tab.fullLabel}</span>
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Main Content Body */}
      <main className="flex-1 overflow-y-auto p-3 sm:p-6 max-w-3xl mx-auto w-full">
        <AnimatePresence mode="wait">
          {activeTab === 'express' && (
            <motion.div
              key="express"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="space-y-4"
            >
              {/* Le Pitch en 1 carte */}
              <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-amber-950/40 via-slate-900 to-slate-950 border border-amber-500/40 shadow-xl">
                <div className="flex items-center gap-2.5 mb-2.5">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center text-amber-400 font-black">
                    ⚡
                  </div>
                  <div>
                    <h2 className="text-base sm:text-lg font-black text-amber-300">
                      Le But Suprême : Gagner le 5ᵉ tour !
                    </h2>
                    <p className="text-xs text-slate-400">
                      Chaque joueur reçoit exactement 5 cartes. Il n'y a que 5 tours par partie.
                    </p>
                  </div>
                </div>

                <p className="text-xs sm:text-sm text-slate-200 leading-relaxed">
                  Contrairement à la belote ou au tarot où l'on compte des points sur tous les tours, au <strong>Njambo Kora</strong>,{' '}
                  <span className="text-amber-300 font-bold">seul le joueur qui remporte le 5ᵉ et dernier tour gagne la partie</span> et empoche le pot de jetons !
                </p>

                {/* Timeline des 5 tours */}
                <div className="mt-4 pt-3 border-t border-slate-800/80">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-2">
                    Déroulement d'une donne (5 mains) :
                  </span>
                  <div className="grid grid-cols-5 gap-1.5 sm:gap-2 text-center font-mono">
                    {[1, 2, 3, 4].map((tour) => (
                      <div
                        key={tour}
                        className="p-2 sm:p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex flex-col items-center justify-center"
                      >
                        <span className="text-[10px] text-slate-500 font-bold uppercase">Tour {tour}</span>
                        <span className="text-[11px] sm:text-xs text-slate-300 font-medium">Placement</span>
                      </div>
                    ))}
                    <div className="p-2 sm:p-2.5 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 text-slate-950 font-black shadow-lg shadow-amber-500/20 border border-amber-300 flex flex-col items-center justify-center">
                      <span className="text-[10px] uppercase opacity-80">Tour 5</span>
                      <span className="text-[11px] sm:text-xs">🏆 Victoire</span>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-2 text-center italic">
                    Les tours 1 à 4 servent à forcer les adversaires à se défausser de leurs meilleures cartes !
                  </p>
                </div>
              </div>

              {/* 3 Règles Essentielles */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col gap-1.5">
                  <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Obligation de Couleur</span>
                  </div>
                  <p className="text-xs text-slate-300 leading-snug">
                    Vous devez obligatoirement fournir la couleur de la 1ère carte posée si vous en avez en main.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col gap-1.5">
                  <div className="flex items-center gap-2 text-amber-400 font-bold text-xs">
                    <Sparkles className="w-4 h-4" />
                    <span>Pas d'Atout de Coupe</span>
                  </div>
                  <p className="text-xs text-slate-300 leading-snug">
                    Si vous n'avez pas la couleur demandée, vous défaussez une autre carte. Une défausse ne gagne jamais le tour.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col gap-1.5">
                  <div className="flex items-center gap-2 text-purple-400 font-bold text-xs">
                    <Crown className="w-4 h-4" />
                    <span>Le Kora Mystique</span>
                  </div>
                  <p className="text-xs text-slate-300 leading-snug">
                    Gagner le 5ᵉ tour avec un <strong>3</strong> (la plus faible carte) réalise un <strong>Kora</strong> et double les gains !
                  </p>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'kora' && (
            <motion.div
              key="kora"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="space-y-4"
            >
              {/* KORA Card */}
              <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-purple-950/50 via-slate-900 to-slate-950 border border-purple-500/50 shadow-xl">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-xl bg-purple-500 text-white flex items-center justify-center font-black text-lg shadow-md shadow-purple-500/30">
                      👑
                    </div>
                    <div>
                      <h3 className="text-base sm:text-lg font-black text-purple-300">
                        Le Kora (Victoire ×2)
                      </h3>
                      <p className="text-xs text-purple-200/70">
                        Le coup de maître le plus emblématique du jeu
                      </p>
                    </div>
                  </div>
                  <span className="text-xs font-black px-2.5 py-1 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/40">
                    Mise × 2
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-slate-200 leading-relaxed">
                  Le Kora se produit lorsqu'un joueur remporte le <strong>5ᵉ et dernier tour</strong> en jouant une carte de valeur <strong>3</strong>.
                  Puisque le 3 est la carte la plus basse de chaque couleur, remporter le dernier tour avec signifie que tous les adversaires n'avaient plus de cartes de cette couleur ou ont dû défausser plus bas.
                </p>
                <div className="mt-3 p-3 rounded-xl bg-purple-950/40 border border-purple-500/30 text-xs text-purple-200 flex items-center gap-2">
                  <Flame className="w-4 h-4 text-purple-400 shrink-0" />
                  <span>
                    <strong>Sanction financière :</strong> Tous les perdants versent au vainqueur le double de la mise de base de la manche !
                  </span>
                </div>
              </div>

              {/* DOUBLE KORA Card */}
              <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-amber-950/50 via-slate-900 to-slate-950 border border-amber-500/50 shadow-xl">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center font-black text-lg shadow-md shadow-amber-500/30">
                      ⚡
                    </div>
                    <div>
                      <h3 className="text-base sm:text-lg font-black text-amber-300">
                        Le Double Kora (Victoire ×4)
                      </h3>
                      <p className="text-xs text-amber-200/70">
                        L'exploit légendaire des grands maîtres
                      </p>
                    </div>
                  </div>
                  <span className="text-xs font-black px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40">
                    Mise × 4
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-slate-200 leading-relaxed">
                  Le Double Kora s'obtient quand un joueur gagne consécutivement le <strong>4ᵉ tour avec un 3</strong>, puis remporte également le <strong>5ᵉ tour avec un autre 3</strong> !
                  Les perdants paient 4 fois la mise de base, ce qui peut anéantir le capital de jetons de la table en un seul coup.
                </p>
              </div>

              {/* Victoires Instantanées à la Donne */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col gap-2">
                  <div className="flex items-center gap-2 text-cyan-300 font-bold text-sm">
                    <span>🃏</span>
                    <span>Les Trois "7"</span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Si un joueur reçoit <strong>trois cartes de valeur 7</strong> dans sa main de 5 cartes dès la distribution, la partie prend fin immédiatement : il remporte l'intégralité du pot sans jouer de tour.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col gap-2">
                  <div className="flex items-center gap-2 text-emerald-300 font-bold text-sm">
                    <span>✨</span>
                    <span>Moins de 21 (≤ 21 pts)</span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Si la somme des valeurs faciales des 5 cartes reçues est <strong>inférieure ou égale à 21</strong> (ex: 3 + 3 + 4 + 5 + 6 = 21), la main est révélée et le joueur gagne instantanément la partie !
                  </p>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'deck' && (
            <motion.div
              key="deck"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="space-y-4"
            >
              {/* Composition 31 Cartes */}
              <div className="p-4 sm:p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div>
                    <h3 className="text-base sm:text-lg font-black text-emerald-300">
                      La Structure des 31 Cartes
                    </h3>
                    <p className="text-xs text-slate-400">
                      Un jeu unique hérité de la tradition africaine
                    </p>
                  </div>
                  <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                    10♠ exclu
                  </span>
                </div>

                <p className="text-xs sm:text-sm text-slate-300 leading-relaxed mb-4">
                  Le paquet se compose de cartes allant du <strong>3 au 10</strong>. Mais attention : le <strong>10 de Pique (10♠)</strong> est expressément retiré du paquet avant la distribution, ce qui donne exactement 31 cartes au total.
                </p>

                {/* Les 4 Couleurs */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div className="p-3 rounded-xl bg-slate-950 border border-rose-500/40 text-center">
                    <div className="text-2xl text-rose-500 font-black mb-1">♥</div>
                    <div className="text-xs font-black text-rose-400">Koubi</div>
                    <div className="text-[10px] text-slate-400">Cœur · 8 cartes</div>
                    <div className="text-[9px] text-slate-500 font-mono mt-1">10 à 3</div>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-950 border border-amber-500/40 text-center">
                    <div className="text-2xl text-amber-500 font-black mb-1">♦</div>
                    <div className="text-xs font-black text-amber-400">Zing</div>
                    <div className="text-[10px] text-slate-400">Carreau · 8 cartes</div>
                    <div className="text-[9px] text-slate-500 font-mono mt-1">10 à 3</div>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-950 border border-emerald-500/40 text-center">
                    <div className="text-2xl text-emerald-500 font-black mb-1">♣</div>
                    <div className="text-xs font-black text-emerald-400">Tchaka</div>
                    <div className="text-[10px] text-slate-400">Trèfle · 8 cartes</div>
                    <div className="text-[9px] text-slate-500 font-mono mt-1">10 à 3</div>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-600 text-center">
                    <div className="text-2xl text-slate-300 font-black mb-1">♠</div>
                    <div className="text-xs font-black text-slate-200">Black</div>
                    <div className="text-[10px] text-slate-400">Pique · 7 cartes</div>
                    <div className="text-[9px] text-amber-400 font-mono mt-1">9 à 3 (Pas de 10)</div>
                  </div>
                </div>

                {/* Échelle de puissance */}
                <div className="mt-4 pt-4 border-t border-slate-800">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-2">
                    Hiérarchie de force (du plus fort au plus faible) :
                  </span>
                  <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5 py-1">
                    {[
                      { rank: '10', label: 'Max', desc: 'Prend tout', color: 'text-emerald-400 bg-emerald-500/20 border-emerald-500/40' },
                      { rank: '9', label: 'Haut', desc: 'Fort', color: 'text-slate-200 bg-slate-800 border-slate-700' },
                      { rank: '8', label: 'Moyen', desc: 'Moyen', color: 'text-slate-300 bg-slate-800 border-slate-700' },
                      { rank: '7', label: 'Moyen', desc: 'Moyen', color: 'text-slate-300 bg-slate-800 border-slate-700' },
                      { rank: '6', label: 'Faible', desc: 'Faible', color: 'text-slate-400 bg-slate-800 border-slate-700' },
                      { rank: '5', label: 'Faible', desc: 'Faible', color: 'text-slate-400 bg-slate-800 border-slate-700' },
                      { rank: '4', label: 'Bas', desc: 'Minime', color: 'text-slate-400 bg-slate-800 border-slate-700' },
                      { rank: '3', label: 'KORA', desc: 'Magique', color: 'text-amber-300 bg-amber-500/20 border-amber-500/40 font-black' },
                    ].map((card) => (
                      <div
                        key={card.rank}
                        className={`py-2 px-1 rounded-xl border text-center font-mono ${card.color} flex flex-col items-center justify-center`}
                      >
                        <div className="text-sm sm:text-base font-black leading-none">{card.rank}</div>
                        <div className="text-[9px] font-sans font-semibold mt-0.5 truncate w-full">{card.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'strategy' && (
            <motion.div
              key="strategy"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="space-y-4"
            >
              {/* Règle de jeu détaillée */}
              <div className="p-4 sm:p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-cyan-500/20 flex items-center justify-center text-cyan-400 font-bold">
                    ⚔️
                  </div>
                  <div>
                    <h3 className="text-base sm:text-lg font-black text-cyan-300">
                      Règles de Table & Conduite du Tour
                    </h3>
                    <p className="text-xs text-slate-400">
                      Comment se décide le vainqueur de chaque main
                    </p>
                  </div>
                </div>

                <div className="space-y-2.5 text-xs sm:text-sm text-slate-300 leading-relaxed">
                  <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800">
                    <strong className="text-white block mb-1">1. L'Entame (La Couleur Demandée)</strong>
                    Le premier joueur à jouer pose la carte de son choix au centre. La couleur de cette carte devient la <strong>couleur directrice du tour</strong>.
                  </div>

                  <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800">
                    <strong className="text-white block mb-1">2. Obligation stricte de couleur</strong>
                    Chaque joueur suivant qui possède au moins une carte de cette couleur <strong>DOIT OBLIGATOIREMENT</strong> la jouer. Il n'a pas le droit de défausser une autre couleur tant qu'il lui reste la couleur demandée.
                  </div>

                  <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800">
                    <strong className="text-white block mb-1">3. La Défausse</strong>
                    Si un joueur ne possède aucune carte de la couleur demandée, il est libre de jouer n'importe quelle autre carte. Cette carte est une <em>défausse</em> et ne peut en aucun cas remporter le tour, même s'il s'agit d'un 10.
                  </div>

                  <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800">
                    <strong className="text-white block mb-1">4. Qui prend la main ?</strong>
                    Le joueur qui a posé la plus forte carte dans la couleur demandée ramasse le tour et <strong>entame le tour suivant</strong> en posant la première carte de son choix.
                  </div>
                </div>
              </div>

              {/* Conseils de pro */}
              <div className="p-4 rounded-xl bg-amber-950/30 border border-amber-500/40 space-y-2">
                <div className="flex items-center gap-2 text-amber-300 font-bold text-xs">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <span>Astuce de Maître : Préparer son Kora</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Pour placer un Kora avec un 3 au 5ᵉ tour, observez attentivement les défausses des tours 1 à 4. Vous devez être certain qu'aucun adversaire n'a conservé une carte supérieure à la vôtre dans cette couleur pour la dernière main !
                </p>
              </div>
            </motion.div>
          )}

          {activeTab === 'official' && (
            <motion.div
              key="official"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="space-y-4"
            >
              {/* Règlement exhaustif */}
              <div className="p-4 sm:p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-3.5 text-xs sm:text-sm">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center text-amber-400 font-bold">
                    📖
                  </div>
                  <div>
                    <h3 className="text-base sm:text-lg font-black text-amber-300">
                      Règlement Officiel de la Manche
                    </h3>
                    <p className="text-xs text-slate-400">
                      Règles de compétition, élimination et gestion des jetons
                    </p>
                  </div>
                </div>

                <div className="space-y-3 text-slate-300 leading-relaxed">
                  <div>
                    <h4 className="font-bold text-white text-xs uppercase tracking-wider mb-1">
                      Partie vs Manche
                    </h4>
                    <p>
                      Une <strong>Partie</strong> (ou Donne) correspond au jeu des 5 tours avec les 5 cartes distribuées. Une <strong>Manche</strong> est une compétition complète constituée de plusieurs parties consécutives jusqu'à ce qu'un joueur élimine tous ses adversaires.
                    </p>
                  </div>

                  <div>
                    <h4 className="font-bold text-white text-xs uppercase tracking-wider mb-1">
                      Mises et Pot Commun
                    </h4>
                    <p>
                      Au début de chaque partie, chaque joueur encore en lice verse la mise de base (ex: 50 jetons) dans le pot central. Le vainqueur du 5ᵉ tour remporte l'intégralité du pot.
                    </p>
                  </div>

                  <div>
                    <h4 className="font-bold text-white text-xs uppercase tracking-wider mb-1">
                      Rôle du Donneur
                    </h4>
                    <p>
                      Le donneur est le joueur qui distribue les cartes. Le joueur qui a remporté la partie précédente devient automatiquement le donneur de la partie suivante. Le joueur à sa gauche joue en premier.
                    </p>
                  </div>

                  <div>
                    <h4 className="font-bold text-white text-xs uppercase tracking-wider mb-1">
                      Élimination & Victoire Finale
                    </h4>
                    <p>
                      Dès qu'un joueur n'a plus assez de jetons pour couvrir la mise obligatoire au début d'une partie, il est éliminé de la table. Le dernier joueur possédant des jetons est sacré <strong>Grand Vainqueur de la Manche</strong>.
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Bottom Floating Bar */}
      <footer className="p-3 sm:p-4 bg-slate-900/90 border-t border-slate-800 backdrop-blur-md shrink-0 flex items-center justify-between max-w-3xl mx-auto w-full">
        <span className="text-[11px] text-slate-500 font-medium">
          Njambo Kora · 31 Cartes Traditionnelles
        </span>
        <button
          type="button"
          onClick={onClose}
          className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs border border-slate-700 transition active:scale-95 cursor-pointer shadow-sm"
        >
          Fermer le Guide
        </button>
      </footer>
    </motion.div>
  );
};
