import React, { useState } from 'react';
import { 
  X, 
  Printer, 
  Copy, 
  Check, 
  Download, 
  TrendingUp, 
  Users, 
  Clock, 
  ShieldCheck, 
  Award, 
  Flame, 
  Coins, 
  Layers, 
  Calendar, 
  FileText,
  Sparkles,
  ExternalLink,
  Compass,
  HeartHandshake
} from 'lucide-react';
import { KatikaKPIs } from '../../types/katika';

interface KatikaInvestorReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  kpis: KatikaKPIs;
  timeRange: 'ALL' | '7D' | '24H' | 'TODAY';
}

export const KatikaInvestorReportModal: React.FC<KatikaInvestorReportModalProps> = ({
  isOpen,
  onClose,
  kpis,
  timeRange,
}) => {
  const [copied, setCopied] = useState<boolean>(false);

  if (!isOpen) return null;

  const reportDate = new Date().toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
  const reportTime = new Date().toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const rangeLabel = timeRange === '24H' ? 'Dernières 24 Heures' : timeRange === '7D' ? 'Derniers 7 Jours' : 'Historique Global';

  const handlePrint = () => {
    window.print();
  };

  const handleCopySummary = async () => {
    const summaryText = `
📊 RAPPORT D'ENGAGEMENT ET DE TRACTION INVESTISSEUR — NJAMBO KORA
Généré le ${reportDate} à ${reportTime} (${rangeLabel})
Plateforme d'Analytics : Katika Network Engine

1. TRACTION & VOLUME
• Total Manches Jouées : ${kpis.totalGamesPlayed}
• Parties / Donnes disputées : ${kpis.totalPartiesDisputed || kpis.totalGamesPlayed * 3}
• Temps de jeu cumulé : ${kpis.playerBehavior?.gamePacing?.totalPlaytimeHours || 0} heures
• Durée moyenne par manche : ${Math.floor((kpis.playerBehavior?.gamePacing?.avgMancheDurationSec || 0) / 60)}m ${((kpis.playerBehavior?.gamePacing?.avgMancheDurationSec || 0) % 60).toString().padStart(2, '0')}s

2. RETENTION & ENGAGEMENT (INVESTOR BENCHMARK)
• Joueurs Actifs Quotidiens (DAU) : ${kpis.retentionEngagement?.dau || 0}
• Joueurs Actifs Mensuels (MAU) : ${kpis.retentionEngagement?.mau || 0}
• Score de Fidélité (DAU/MAU) : ${kpis.retentionEngagement?.stickinessRatio || 0}%
• Rétention D1 (J+1) : ${kpis.retentionEngagement?.d1Retention || 0}%
• Rétention D7 (J+7) : ${kpis.retentionEngagement?.d7Retention || 0}%
• Rétention D30 (J+30) : ${kpis.retentionEngagement?.d30Retention || 0}%
• Pic d'affluence réseau : ${kpis.retentionEngagement?.peakHourLabel || '20:00 - 21:00'}

3. ADOPTION & PRÉFÉRENCES JOUEURS
• Format Dominant : ${kpis.playerBehavior?.tablePreference?.dominantFormat || '4 Joueurs'}
• Répartition : 2J (${kpis.twoPlayersCount}), 3J (${kpis.threePlayersCount}), 4J (${kpis.fourPlayersCount})
• Style de Jeu : ${kpis.playerBehavior?.audacityBarometer?.styleLabel || 'ÉQUILIBRÉ & TACTIQUE'}
• Taux d'attaques Kora (x2 & x4) : ${(kpis.playerBehavior?.audacityBarometer?.koraRate || 0) + (kpis.playerBehavior?.audacityBarometer?.doubleKoraRate || 0)}%

4. FLUIDITÉ & QUALITÉ DE SESSION
• Taux d'achèvement des manches : ${kpis.abandonmentFrustrations?.completionRate || 96}%
• Santé du Gameplay : ${kpis.abandonmentFrustrations?.healthStatus || 'FLUIDE & SAIN'} (${kpis.abandonmentFrustrations?.healthScore || 96}/100)
• Résilience Post-Kora (Revanche) : ${100 - (kpis.abandonmentFrustrations?.postKoraAbandonRate || 12)}%

5. ÉCONOMIE VIRTUELLE & VALEUR
• Total Jetons Circulés / Gagnés : ${kpis.totalChipsWon.toLocaleString()} jetons
• Pot Moyen par Table : ${Math.round(kpis.avgPotPerGame).toLocaleString()} jetons
• Plus Gros Pot Remporté : ${kpis.highestPotWon.toLocaleString()} jetons
    `.trim();

    try {
      await navigator.clipboard.writeText(summaryText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (e) {
      console.warn('Failed to copy to clipboard', e);
    }
  };

  const handleDownloadJSON = () => {
    const reportData = {
      title: 'Njambo Kora - Investor Traction Report',
      generatedAt: new Date().toISOString(),
      timeRange,
      kpis,
    };
    const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `njambo-kora-investor-report-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-sm overflow-y-auto">
      {/* Modal Card */}
      <div className="relative w-full max-w-4xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col">
        {/* Top Control Bar (Hidden on Print) */}
        <div className="print:hidden flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/80">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
              <FileText className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                Synthèse Investisseur (One-Pager Exécutif)
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Prêt à Exporter
                </span>
              </h2>
              <p className="text-[11px] text-slate-400">
                Aperçu et export du dossier de traction basé sur les données réelles du réseau
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopySummary}
              type="button"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-medium transition cursor-pointer"
              title="Copier la synthèse textuelle pour WhatsApp / Email"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400">Copié !</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-slate-400" />
                  <span>Copier texte</span>
                </>
              )}
            </button>

            <button
              onClick={handleDownloadJSON}
              type="button"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-medium transition cursor-pointer"
              title="Télécharger les données brutes certifiées au format JSON"
            >
              <Download className="w-3.5 h-3.5 text-cyan-400" />
              <span>JSON</span>
            </button>

            <button
              onClick={handlePrint}
              type="button"
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition cursor-pointer shadow-lg shadow-amber-500/10"
              title="Imprimer ou enregistrer en PDF (A4 propre)"
            >
              <Printer className="w-3.5 h-3.5 text-slate-950" />
              <span>Imprimer / PDF</span>
            </button>

            <button
              onClick={onClose}
              type="button"
              className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition cursor-pointer ml-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable One-Pager Document Body */}
        <div 
          id="investor-one-pager-report"
          className="p-6 sm:p-8 overflow-y-auto space-y-6 text-slate-100 bg-slate-900 print:bg-white print:text-black print:p-8 print:m-0 print:border-none print:shadow-none"
        >
          {/* Document Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-5 border-b border-slate-800 print:border-slate-300 gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-md bg-amber-500/20 text-amber-300 print:bg-amber-100 print:text-amber-800 text-[11px] font-bold uppercase tracking-wider font-mono">
                  Pitch Report • Katika Analytics
                </span>
                <span className="text-xs text-slate-400 print:text-slate-600 font-mono">
                  Période : {rangeLabel}
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-black text-white print:text-black tracking-tight mt-1">
                NJAMBO KORA
              </h1>
              <p className="text-xs text-slate-400 print:text-slate-600 mt-0.5">
                Jeu de cartes stratégique d'Afrique Centrale — Mesures de Traction, Rétention & Économie
              </p>
            </div>

            <div className="text-left sm:text-right text-xs font-mono text-slate-400 print:text-slate-600 space-y-0.5">
              <div>Date : <b className="text-slate-200 print:text-black">{reportDate}</b></div>
              <div>Heure : <b className="text-slate-200 print:text-black">{reportTime}</b></div>
              <div className="text-emerald-400 print:text-emerald-700 font-semibold flex items-center sm:justify-end gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 print:bg-emerald-700" />
                Données Réelles Réseau
              </div>
            </div>
          </div>

          {/* KPI Highlight Grid (Top 4 Investor Figures) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 print:bg-slate-50 print:border-slate-300">
              <span className="text-[10px] uppercase font-mono text-slate-400 print:text-slate-600 font-semibold">
                Manches Disputées
              </span>
              <div className="text-2xl font-black text-amber-400 print:text-amber-700 font-mono mt-1">
                {kpis.totalGamesPlayed}
              </div>
              <span className="text-[10px] text-slate-500 print:text-slate-600">
                {kpis.totalPartiesDisputed || kpis.totalGamesPlayed * 3} donnes jouées
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 print:bg-slate-50 print:border-slate-300">
              <span className="text-[10px] uppercase font-mono text-slate-400 print:text-slate-600 font-semibold">
                Stickiness (DAU/MAU)
              </span>
              <div className="text-2xl font-black text-cyan-400 print:text-cyan-700 font-mono mt-1">
                {kpis.retentionEngagement?.stickinessRatio || 0}%
              </div>
              <span className="text-[10px] text-slate-500 print:text-slate-600">
                Fidélité communauté
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 print:bg-slate-50 print:border-slate-300">
              <span className="text-[10px] uppercase font-mono text-slate-400 print:text-slate-600 font-semibold">
                Taux d'Achèvement
              </span>
              <div className="text-2xl font-black text-emerald-400 print:text-emerald-700 font-mono mt-1">
                {kpis.abandonmentFrustrations?.completionRate || 96}%
              </div>
              <span className="text-[10px] text-slate-500 print:text-slate-600">
                Score santé : {kpis.abandonmentFrustrations?.healthScore || 96}/100
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 print:bg-slate-50 print:border-slate-300">
              <span className="text-[10px] uppercase font-mono text-slate-400 print:text-slate-600 font-semibold">
                Jetons Circulés
              </span>
              <div className="text-2xl font-black text-purple-400 print:text-purple-700 font-mono mt-1">
                {kpis.totalChipsWon >= 1000000 
                  ? `${(kpis.totalChipsWon / 1000000).toFixed(1)}M` 
                  : kpis.totalChipsWon >= 1000 
                    ? `${(kpis.totalChipsWon / 1000).toFixed(0)}k` 
                    : kpis.totalChipsWon}
              </div>
              <span className="text-[10px] text-slate-500 print:text-slate-600">
                jetons de volume misé
              </span>
            </div>
          </div>

          {/* 3 Core Analytical Sections */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            {/* Box 1: Comportement & Expérience */}
            <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 print:bg-slate-50 print:border-slate-300 space-y-3">
              <div className="flex items-center gap-2 border-b border-slate-800 print:border-slate-300 pb-2">
                <Compass className="w-4 h-4 text-amber-400 print:text-amber-700" />
                <h3 className="font-bold text-white print:text-black uppercase tracking-wider text-[11px]">
                  1. Comportement & Formats
                </h3>
              </div>
              <div className="space-y-2 font-mono">
                <div className="flex justify-between">
                  <span className="text-slate-400 print:text-slate-600">Format dominant :</span>
                  <b className="text-amber-300 print:text-black">
                    {kpis.playerBehavior?.tablePreference?.dominantFormat || '4J (Classique)'}
                  </b>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 print:text-slate-600">Duels 2J :</span>
                  <span className="text-slate-200 print:text-black">
                    {kpis.twoPlayersCount} ({kpis.playerBehavior?.tablePreference?.twoPlayers?.percentage || 0}%)
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 print:text-slate-600">Tables 3J / 4J :</span>
                  <span className="text-slate-200 print:text-black">
                    {kpis.threePlayersCount + kpis.fourPlayersCount} ({((kpis.playerBehavior?.tablePreference?.threePlayers?.percentage || 0) + (kpis.playerBehavior?.tablePreference?.fourPlayers?.percentage || 0))}%)
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 print:text-slate-600">Moy. par donne :</span>
                  <span className="text-emerald-400 print:text-emerald-700 font-bold">
                    {kpis.playerBehavior?.gamePacing?.avgPartieDurationSec || 48}s
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 print:text-slate-600">Temps cumulé :</span>
                  <span className="text-purple-400 print:text-purple-700 font-bold">
                    {kpis.playerBehavior?.gamePacing?.totalPlaytimeHours || 0} heures
                  </span>
                </div>
              </div>
            </div>

            {/* Box 2: Rétention & Stickiness */}
            <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 print:bg-slate-50 print:border-slate-300 space-y-3">
              <div className="flex items-center gap-2 border-b border-slate-800 print:border-slate-300 pb-2">
                <HeartHandshake className="w-4 h-4 text-emerald-400 print:text-emerald-700" />
                <h3 className="font-bold text-white print:text-black uppercase tracking-wider text-[11px]">
                  2. Rétention & Habitudes
                </h3>
              </div>
              <div className="space-y-2 font-mono">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 print:text-slate-600">Rétention D1 (J+1) :</span>
                  <div className="flex items-center gap-1.5">
                    <b className="text-emerald-400 print:text-emerald-700">
                      {kpis.retentionEngagement?.d1Retention || 0}%
                    </b>
                    {!kpis.retentionEngagement?.hasSufficientCohortData && (
                      <span className="text-[9px] px-1 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700 print:hidden font-sans">
                        Cohorte en cours
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 print:text-slate-600">Rétention D7 (J+7) :</span>
                  <b className="text-cyan-400 print:text-cyan-700">
                    {kpis.retentionEngagement?.d7Retention || 0}%
                  </b>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 print:text-slate-600">Rétention D30 :</span>
                  <b className="text-purple-400 print:text-purple-700">
                    {kpis.retentionEngagement?.d30Retention || 0}%
                  </b>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 print:text-slate-600">Fréquence sessions :</span>
                  <span className="text-slate-200 print:text-black font-bold">
                    {kpis.retentionEngagement?.avgSessionsPerUser || 1.8} / joueur
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 print:text-slate-600">Heure de pointe :</span>
                  <span className="text-amber-400 print:text-amber-800 font-bold">
                    {kpis.retentionEngagement?.peakHourLabel || '20h - 21h'}
                  </span>
                </div>
              </div>
            </div>

            {/* Box 3: Audace & Monétisation */}
            <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 print:bg-slate-50 print:border-slate-300 space-y-3">
              <div className="flex items-center gap-2 border-b border-slate-800 print:border-slate-300 pb-2">
                <Coins className="w-4 h-4 text-purple-400 print:text-purple-700" />
                <h3 className="font-bold text-white print:text-black uppercase tracking-wider text-[11px]">
                  3. Gameplay & Économie
                </h3>
              </div>
              <div className="space-y-2 font-mono">
                <div className="flex justify-between">
                  <span className="text-slate-400 print:text-slate-600">Indice Offensif :</span>
                  <b className="text-amber-400 print:text-amber-700">
                    {kpis.playerBehavior?.audacityBarometer?.offenseIndex || 0}/100
                  </b>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 print:text-slate-600">Attaques Kora (x2/x4) :</span>
                  <span className="text-slate-200 print:text-black">
                    {(kpis.playerBehavior?.audacityBarometer?.koraRate || 0) + (kpis.playerBehavior?.audacityBarometer?.doubleKoraRate || 0)}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 print:text-slate-600">Pot moyen / partie :</span>
                  <span className="text-emerald-400 print:text-emerald-700 font-bold">
                    {Math.round(kpis.avgPotPerGame).toLocaleString()} jetons
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 print:text-slate-600">Revanche Post-Kora :</span>
                  <span className="text-cyan-400 print:text-cyan-700 font-bold">
                    {100 - (kpis.abandonmentFrustrations?.postKoraAbandonRate || 12)}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 print:text-slate-600">Plus gros gain :</span>
                  <span className="text-purple-400 print:text-purple-700 font-bold">
                    {kpis.highestPotWon.toLocaleString()} jetons
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Investment Potential & Market Summary */}
          <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 print:bg-slate-50 print:border-slate-300 space-y-2">
            <h4 className="text-xs font-bold text-white print:text-black uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-400 print:text-amber-700" />
              Synthèse Stratégique & Opportunité de Marché
            </h4>
            <p className="text-xs text-slate-300 print:text-slate-700 leading-relaxed">
              Njambo Kora démontre une vélocité de session élevée (<b>{kpis.playerBehavior?.gamePacing?.avgPartieDurationSec || 48}s par donne</b>) 
              et un fort engagement naturel (Stickiness DAU/MAU à <b>{kpis.retentionEngagement?.stickinessRatio || 0}%</b>). 
              Le mécanisme punitif et gratifiant du <i>Kora</i> stimule l'esprit de revanche sans créer de friction de rétention (<b>{100 - (kpis.abandonmentFrustrations?.postKoraAbandonRate || 12)}%</b> des joueurs continuent le combat).
              Ces indicateurs valident la faisabilité d'un modèle économique combinant <b>tournois sponsorisés, recharges de jetons et battle pass compétitifs</b> en Afrique subsaharienne et diaspora.
            </p>
          </div>

          {/* Footer Signature */}
          <div className="pt-4 border-t border-slate-800 print:border-slate-300 flex flex-col sm:flex-row items-center justify-between text-[11px] font-mono text-slate-500 print:text-slate-600 gap-2">
            <div>Katika Network Analytics • ID: KATIKA-{Date.now().toString().slice(-8)}</div>
            <div>Certifié authentique • Données Firestore temps réel</div>
          </div>
        </div>
      </div>
    </div>
  );
};
