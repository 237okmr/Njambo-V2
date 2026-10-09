import React, { useEffect, useState } from 'react';
import {
  Power,
  KeyRound,
  Table2,
  Percent,
  ArrowDownUp,
  WalletCards,
  LineChart,
  ShieldAlert,
  HeartPulse,
  Loader2,
  CheckCircle2,
} from 'lucide-react';
import { KoraCashSubSection, KatikaKoraCashConfig } from '../../types/katika';
import { KatikaService, DEFAULT_KORA_CASH_CONFIG } from '../../services/katikaService';
import { useKatikaAuth } from '../../context/KatikaAuthContext';

const SUB_SECTIONS: { id: KoraCashSubSection; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'GENERAL', label: 'Général', icon: Power },
  { id: 'PROVIDERS', label: 'Prestataires', icon: KeyRound },
  { id: 'TABLES', label: 'Tables', icon: Table2 },
  { id: 'RAKE', label: 'Rake', icon: Percent },
  { id: 'DEPOSITS_WITHDRAWALS', label: 'Dépôts et retraits', icon: ArrowDownUp },
  { id: 'WALLETS_TRANSACTIONS', label: 'Portefeuilles et transactions', icon: WalletCards },
  { id: 'FINANCES', label: 'Finances', icon: LineChart },
  { id: 'SECURITY_ALERTS', label: 'Sécurité et alertes', icon: ShieldAlert },
  { id: 'RESPONSIBLE_GAMING', label: 'Jeu responsable', icon: HeartPulse },
];

const PLANNED_FIELDS: Record<Exclude<KoraCashSubSection, 'GENERAL'>, string[]> = {
  PROVIDERS: [
    'Clés de prestataires de paiement, masquées à l\'affichage',
    'Test de connexion par prestataire',
    'Choix du prestataire actif',
  ],
  TABLES: [
    'Tailles de table autorisées en argent réel',
    'Mises par palier',
    'Fourchette de buy-in',
    'Recaves autorisées',
    'Minimum de parties avant retrait',
    'Plafonds de perte par table',
  ],
  RAKE: [
    'Pourcentage de rake',
    'Plafond du rake par partie',
    'Règle d\'arrondi',
  ],
  DEPOSITS_WITHDRAWALS: [
    'Montants minimum et maximum de dépôt et de retrait',
    'Condition de jeu minimale par palier de dépôt',
    'Délai d\'attente pour les comptes neufs',
  ],
  WALLETS_TRANSACTIONS: [
    'Vue en direct des dépôts',
    'Retraits en attente',
    'Soldes agrégés MTN Mobile Money et Orange Money',
  ],
  FINANCES: [
    'Rake cumulé',
    'Frais de prestataire absorbés',
    'Marge nette',
    'Rapprochement quotidien',
  ],
  SECURITY_ALERTS: [
    'Gel de sécurité des retraits',
    'Détection de groupes de joueurs suspects',
    'Détection de recaves en série',
    'Journal d\'audit propre au Cash',
  ],
  RESPONSIBLE_GAMING: [
    'Pauses de jeu',
    'Auto-exclusions',
    'Plafonds de perte en cours',
  ],
};

export const KatikaKoraCashTab: React.FC = () => {
  const { user } = useKatikaAuth();
  const [activeSection, setActiveSection] = useState<KoraCashSubSection>('GENERAL');
  const [config, setConfig] = useState<KatikaKoraCashConfig>({ ...DEFAULT_KORA_CASH_CONFIG });
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    KatikaService.getKoraCashConfig().then((cfg) => {
      if (isMounted) {
        setConfig(cfg);
        setLoading(false);
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  const handleToggleEnabled = async () => {
    setSaving(true);
    setFeedback(null);
    try {
      const updated = await KatikaService.updateKoraCashConfig(
        { isEnabled: !config.isEnabled },
        user?.email || undefined
      );
      setConfig(updated);
      setFeedback(updated.isEnabled ? 'Kora Cash activé.' : 'Kora Cash désactivé.');
    } finally {
      setSaving(false);
    }
  };

  const handleEnvironmentChange = async (environment: 'DEMO' | 'LIVE') => {
    if (environment === config.environment) return;
    setSaving(true);
    setFeedback(null);
    try {
      const updated = await KatikaService.updateKoraCashConfig({ environment }, user?.email || undefined);
      setConfig(updated);
      setFeedback(`Environnement réglé sur ${environment === 'LIVE' ? 'LIVE' : 'Démo'}.`);
    } finally {
      setSaving(false);
    }
  };

  const renderGeneral = () => (
    <div className="space-y-4">
      <div className="p-5 rounded-xl bg-slate-950/60 border border-slate-800 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-200">Activer Kora Cash</h3>
          <p className="text-xs text-slate-400 mt-1 leading-relaxed">
            Interrupteur général du mode argent réel. Décision exclusive de katika, jamais un réglage visible ou
            modifiable par les joueurs ou l'hôte.
          </p>
        </div>
        <button
          type="button"
          disabled={loading || saving}
          onClick={handleToggleEnabled}
          className={`shrink-0 px-4 py-2 rounded-lg text-xs font-bold transition-colors ${
            config.isEnabled
              ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/25'
              : 'bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : config.isEnabled ? 'Activé' : 'Désactivé'}
        </button>
      </div>

      <div className="p-5 rounded-xl bg-slate-950/60 border border-slate-800">
        <h3 className="text-sm font-semibold text-slate-200">Prestataire actif</h3>
        <p className="text-xs text-slate-400 mt-1 mb-3 leading-relaxed">
          Réglé depuis la sous-section Prestataires (à venir). Lecture seule ici.
        </p>
        <div className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-xs font-mono text-slate-400">
          {config.activeProviderId || 'Aucun prestataire configuré'}
        </div>
      </div>

      <div className="p-5 rounded-xl bg-slate-950/60 border border-slate-800">
        <h3 className="text-sm font-semibold text-slate-200">Environnement</h3>
        <p className="text-xs text-slate-400 mt-1 mb-3 leading-relaxed">
          Démo : aucune transaction réelle. LIVE : transactions réelles via le prestataire actif.
        </p>
        <div className="flex gap-2">
          {(['DEMO', 'LIVE'] as const).map((env) => (
            <button
              key={env}
              type="button"
              disabled={saving}
              onClick={() => handleEnvironmentChange(env)}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors ${
                config.environment === env
                  ? env === 'LIVE'
                    ? 'bg-rose-500/15 text-rose-300 border border-rose-500/40'
                    : 'bg-amber-500/15 text-amber-300 border border-amber-500/40'
                  : 'bg-slate-800 text-slate-400 border border-slate-700 hover:bg-slate-700'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {env === 'LIVE' ? 'LIVE' : 'Démo'}
            </button>
          ))}
        </div>
      </div>

      {feedback && (
        <div className="flex items-center gap-2 text-xs text-emerald-300">
          <CheckCircle2 className="w-4 h-4" />
          {feedback}
        </div>
      )}
    </div>
  );

  const renderPlaceholder = (section: Exclude<KoraCashSubSection, 'GENERAL'>) => {
    const sectionMeta = SUB_SECTIONS.find((s) => s.id === section);
    return (
      <div className="p-5 rounded-xl bg-slate-950/60 border border-slate-800">
        <h3 className="text-sm font-semibold text-slate-200">{sectionMeta?.label} — à venir</h3>
        <p className="text-xs text-slate-400 mt-1 mb-3 leading-relaxed">
          Cette sous-section n'est pas encore branchée. Champs prévus :
        </p>
        <ul className="space-y-1.5">
          {PLANNED_FIELDS[section].map((field) => (
            <li key={field} className="flex items-start gap-2 text-xs text-slate-400">
              <span className="mt-1 w-1 h-1 rounded-full bg-slate-600 shrink-0" />
              {field}
            </li>
          ))}
        </ul>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-500 gap-2">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-xs">Chargement de la configuration Kora Cash...</span>
      </div>
    );
  }

  return (
    <div className="flex gap-6">
      <nav className="w-56 shrink-0 space-y-1">
        {SUB_SECTIONS.map((section) => {
          const Icon = section.icon;
          const isActive = activeSection === section.id;
          return (
            <button
              key={section.id}
              type="button"
              onClick={() => setActiveSection(section.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors text-left ${
                isActive
                  ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-transparent'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-amber-400' : 'text-slate-500'}`} />
              <span className="truncate">{section.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="flex-1 min-w-0">
        {activeSection === 'GENERAL' ? renderGeneral() : renderPlaceholder(activeSection)}
      </div>
    </div>
  );
};
